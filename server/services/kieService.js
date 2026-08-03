/**
 * KIE.ai Service — Content Studio AI
 *
 * Two surfaces:
 *   - Video generation (Kling 2.6 image-to-video) — async with webhook callback
 *   - Image generation (Nano Banana edit / Flux Kontext / Seedream) — async with polling
 *
 * KIE.ai acts as a unified gateway across many model providers (Google, Black Forest
 * Labs, ByteDance, OpenAI, etc.). The same /jobs/createTask endpoint handles all of
 * them — only the `model` string and `input` payload change.
 */

const KIE_API_BASE = 'https://api.kie.ai/api/v1';

// ── Construcción del `input` por familia de modelos ────────────────────────
//
// KIE.AI valida el `input` contra el esquema del modelo elegido: los campos que
// el modelo no declara sobran, y los que declara obligatorios no pueden faltar.
// Mandar todos los alias "por si acaso" NO es gratis — es exactamente lo que
// rompió el Generador de Outros en v4.645: el payload llevaba `aspect_ratio`,
// `image_size`, `resolution`, `enable_audio` y `generate_audio`, que kling-2.6
// no conoce, y le faltaba `sound`, que sí exige. KIE respondía
// `This field is required` sin decir cuál.
//
// Por eso cada familia arma su propio input, con los campos que su
// documentación declara y ninguno más.
const buildVideoInput = (model, { prompt, imageUrls, duration, aspectRatio, resolution, enableAudio, negativePrompt }) => {
    // Kling image-to-video (2.x / 3.x). El formato de salida lo hereda de la
    // imagen de entrada: el modelo NO recibe relación de aspecto ni resolución.
    // `sound` es obligatorio y es el interruptor del audio nativo — con él en
    // `true`, Kling 2.6 genera voz, ambiente y efectos dentro del mismo archivo.
    //
    // `negative_prompt` está documentado en la API de Kling, con su propio tope
    // de 2500 caracteres, y por eso se manda AQUÍ y no pegado al prompt: inline
    // se comía el 26 % del presupuesto del positivo. Sólo se incluye cuando hay
    // algo que poner — un campo vacío es un campo de más, y mandar campos que
    // el modelo no declara es lo que rompió el módulo en v4.645. Si la pasarela
    // igualmente lo rechaza, `createKieVideoTask` reintenta sin él.
    if (/^kling/i.test(model) && /image-to-video/i.test(model)) {
        return {
            prompt,
            image_urls: imageUrls,
            duration: String(duration),
            sound: Boolean(enableAudio),
            ...(negativePrompt ? { negative_prompt: negativePrompt } : {})
        };
    }

    // Modelo que este código no conoce —el id es configurable por entorno— : se
    // manda la forma más común del mercado de KIE. Si el modelo nuevo exige
    // otro campo, el error de KIE llega textual a la UI junto con la lista de
    // lo que se envió, que es el dato necesario para corregir esta función.
    return {
        prompt,
        image_urls: imageUrls,
        duration: String(duration),
        aspect_ratio: aspectRatio,
        resolution
    };
};

export const triggerVideoGeneration = async (projectId, imageUrls, config) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
        throw new Error('KIE_API_KEY no configurada');
    }

    try {
        // Prepare the request for KIE.ai
        // Using Kling 2.6 as the default high-quality model for short videos
        const model = 'kling-2.6/image-to-video';
        const response = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                callBackUrl: `${process.env.APP_URL || 'https://app.clubplatform.org'}/api/content-studio/webhook`,
                input: buildVideoInput(model, {
                    prompt: config.prompt || "Ken Burns effect, smooth transitions, high quality social media content",
                    imageUrls,
                    duration: config.duration || "10",
                    enableAudio: false
                }),
                metadata: {
                    projectId: projectId
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('KIE API Error response:', data);
            throw new Error(data.msg || 'Error al crear la tarea en KIE.ai');
        }

        return {
            taskId: data.task_id || data.data?.task_id,
            status: 'processing'
        };
    } catch (error) {
        console.error('KIE Service Error:', error);
        throw error;
    }
};

export const checkTaskStatus = async (taskId) => {
    const apiKey = process.env.KIE_API_KEY;
    try {
        const response = await fetch(`${KIE_API_BASE}/jobs/getTaskDetail?task_id=${taskId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.msg || 'Error al consultar estado en KIE.ai');
        }

        // KIE.ai status mapping (Enhanced v4.44.0)
        const status = data.data?.status || data.status;
        const videoUrl = data.data?.output?.video_url || data.output?.videoUrl;

        console.log(`KIE Status Check [${taskId}]: ${status}`);

        let mappedStatus = 'processing';
        if (status === 'COMPLETED' || status === 'SUCCESS') mappedStatus = 'ready';
        if (status === 'FAILED' || status === 'ERROR') mappedStatus = 'failed';
        if (status === 'QUEUED' || status === 'PENDING') mappedStatus = 'processing';
        if (status === 'ACTIVE' || status === 'RUNNING') mappedStatus = 'processing';

        return {
            status: mappedStatus,
            videoUrl: videoUrl,
            raw: data
        };
    } catch (error) {
        console.error('KIE Status Check Error:', error);
        throw error;
    }
};

// ----- Image generation (sync flow via createTask + polling) -----

// Submit an image-edit / image-to-image task. Returns the task id immediately;
// completion is checked via pollKieImageTask.
//
// `model` examples:
//   'google/nano-banana-edit'        — Gemini 2.5 Flash Image (identity-preserving)
//   'black-forest-labs/flux-kontext-max' — Flux Kontext for contextual outpainting
//   'bytedance/seedream-3-edit'      — alternative high-quality editor
//
// KIE.ai's API expects different param names across models. We send both `aspect_ratio`
// (used by Kling video and many newer image models) AND `image_size` (used by older
// image models) so whichever the chosen model understands is honoured; KIE silently
// ignores unknown fields. Same for image_url vs image_urls (we send the array form).
export const createKieImageTask = async ({ model, prompt, imageUrl, aspectRatio = '2:3', outputFormat = 'png' }) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) throw new Error('KIE_API_KEY no configurada');

    const requestBody = {
        model,
        input: {
            prompt,
            image_urls: [imageUrl],
            image_url: imageUrl,
            image_size: aspectRatio,
            aspect_ratio: aspectRatio,
            output_format: outputFormat
        }
    };

    const response = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    if (!response.ok || data.code && data.code !== 200) {
        // Include the full response body in the error so the controller can surface it.
        const rawBody = JSON.stringify(data).slice(0, 400);
        console.error('[KIE image] createTask error response:', rawBody);
        const reason = data.msg || data.message || `HTTP ${response.status} ${rawBody}`;
        throw new Error(`KIE createTask: ${reason}`);
    }

    const taskId = data.task_id || data.data?.task_id || data.data?.taskId;
    if (!taskId) {
        const rawBody = JSON.stringify(data).slice(0, 400);
        console.error('[KIE image] createTask returned no task_id:', rawBody);
        throw new Error(`KIE createTask devolvió sin task_id: ${rawBody}`);
    }
    return taskId;
};

// Poll a KIE image task until completion or timeout. Returns the URL of the produced
// image.
//
// KIE.AI's current polling endpoint is `/jobs/recordInfo?taskId={id}` (camelCase param).
// The old `/jobs/getTaskDetail?task_id={id}` returns HTTP 404 "Not Found" on the current
// API version — diagnosed in v4.327 via the error surfaced to the UI.
//
// Response shape (new format):
//   { code, msg, data: { taskId, state: "queuing"|"running"|"success"|"fail",
//                        resultJson: "<json string>", failMsg, ... } }
// The actual image url is inside `resultJson` (a JSON-encoded string that must be
// parsed). Older models may still return the legacy shape with `status` and `output`,
// so we handle both for safety.
export const pollKieImageTask = async (taskId, { maxWaitMs = 100_000, intervalMs = 3000 } = {}) => {
    const apiKey = process.env.KIE_API_KEY;
    const deadline = Date.now() + maxWaitMs;
    let lastState = 'UNKNOWN';

    while (Date.now() < deadline) {
        const response = await fetch(
            `${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
            { headers: { 'Authorization': `Bearer ${apiKey}` } }
        );
        const data = await response.json();
        if (!response.ok) {
            const rawBody = JSON.stringify(data).slice(0, 400);
            throw new Error(`KIE recordInfo falló: HTTP ${response.status} ${rawBody}`);
        }
        if (data.code && data.code !== 200) {
            const rawBody = JSON.stringify(data).slice(0, 400);
            throw new Error(`KIE recordInfo: ${data.msg || data.message || rawBody}`);
        }

        // Accept either `state` (new API) or `status` (legacy). Normalise to lowercase.
        const rawState = data.data?.state || data.state || data.data?.status || data.status || '';
        const state = String(rawState).toLowerCase();
        lastState = state || lastState;

        const isSuccess = state === 'success' || state === 'completed';
        const isFail = state === 'fail' || state === 'failed' || state === 'error';

        if (isSuccess) {
            // New API: result is inside `resultJson` as a JSON string.
            let resultObj = {};
            const rj = data.data?.resultJson ?? data.data?.result;
            if (typeof rj === 'string' && rj.length > 0) {
                try { resultObj = JSON.parse(rj); } catch { resultObj = {}; }
            } else if (rj && typeof rj === 'object') {
                resultObj = rj;
            }
            // Also check the legacy `output` location.
            const output = data.data?.output || data.output || {};
            const candidate = Object.keys(resultObj).length ? resultObj : output;

            const urls = candidate.resultUrls
                || candidate.image_urls
                || candidate.imageUrls
                || candidate.images
                || candidate.result_urls
                || (candidate.image_url ? [candidate.image_url] : null)
                || (candidate.imageUrl ? [candidate.imageUrl] : null)
                || (candidate.result_url ? [candidate.result_url] : null)
                || (candidate.resultUrl ? [candidate.resultUrl] : null);
            const url = Array.isArray(urls) ? urls[0] : urls;
            if (!url) {
                const rawBody = JSON.stringify(data).slice(0, 400);
                console.error('[KIE image] success but no image url in response:', rawBody);
                throw new Error(`KIE task success pero sin image_url: ${rawBody}`);
            }
            return url;
        }
        if (isFail) {
            const rawBody = JSON.stringify(data).slice(0, 400);
            const reason = data.data?.failMsg || data.data?.fail_msg
                || data.data?.error?.message || data.data?.message
                || data.message || rawBody;
            throw new Error(`KIE task falló: ${reason}`);
        }
        // queuing / running / pending — keep polling
        await new Promise(r => setTimeout(r, intervalMs));
    }

    throw new Error(`KIE task timeout después de ${maxWaitMs}ms (último state: ${lastState})`);
};


// Consulta puntual del estado de una tarea de IMAGEN, sin bucle. Es el gemelo
// de `getKieVideoTask`, y existe por el mismo motivo (v4.665): el Creador de
// Reels expande el lienzo de las fotos apaisadas ANTES de animarlas, y un job
// de imagen tarda 30-60 s. Esperarlo dentro del request con `pollKieImageTask`
// se comería el presupuesto de la función tres veces seguidas — una por foto.
// Acá el que llama decide cuándo volver a preguntar.
//
// Devuelve { state: 'queued'|'running'|'success'|'failed', imageUrl, failMsg, raw }.
export const getKieImageTask = async (taskId) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) throw new Error('KIE_API_KEY no configurada');

    const response = await fetch(
        `${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`KIE recordInfo (imagen) falló: HTTP ${response.status} ${JSON.stringify(data).slice(0, 400)}`);
    }
    if (data.code && data.code !== 200) {
        throw new Error(`KIE recordInfo (imagen): ${data.msg || data.message || JSON.stringify(data).slice(0, 400)}`);
    }

    const state = String(data.data?.state || data.state || data.data?.status || data.status || '').toLowerCase();

    if (state === 'success' || state === 'completed') {
        let resultObj = {};
        const rj = data.data?.resultJson ?? data.data?.result;
        if (typeof rj === 'string' && rj.length > 0) {
            try { resultObj = JSON.parse(rj); } catch { resultObj = {}; }
        } else if (rj && typeof rj === 'object') {
            resultObj = rj;
        }
        const output = data.data?.output || data.output || {};
        const candidate = Object.keys(resultObj).length ? resultObj : output;

        const urls = candidate.resultUrls
            || candidate.image_urls || candidate.imageUrls || candidate.images
            || candidate.result_urls
            || (candidate.image_url ? [candidate.image_url] : null)
            || (candidate.imageUrl ? [candidate.imageUrl] : null)
            || (candidate.result_url ? [candidate.result_url] : null)
            || (candidate.resultUrl ? [candidate.resultUrl] : null);
        const imageUrl = Array.isArray(urls) ? urls[0] : urls;

        if (!imageUrl) {
            return { state: 'failed', imageUrl: null, failMsg: `KIE terminó sin URL de imagen: ${JSON.stringify(data).slice(0, 400)}`, raw: data };
        }
        return { state: 'success', imageUrl, failMsg: null, raw: data };
    }

    if (state === 'fail' || state === 'failed' || state === 'error') {
        const reason = data.data?.failMsg || data.data?.fail_msg
            || data.data?.error?.message || data.data?.message
            || data.message || JSON.stringify(data).slice(0, 400);
        return { state: 'failed', imageUrl: null, failMsg: reason, raw: data };
    }

    return { state: state === 'queuing' || state === 'queued' ? 'queued' : 'running', imageUrl: null, failMsg: null, raw: data };
};

// Download the final image produced by KIE into a Buffer so we can re-upload it to our
// own S3 bucket (the KIE-hosted URL is ephemeral and not under our control).
export const fetchKieImageBuffer = async (kieImageUrl) => {
    const resp = await fetch(kieImageUrl);
    if (!resp.ok) throw new Error(`No se pudo descargar la imagen generada por KIE (${resp.status})`);
    return Buffer.from(await resp.arrayBuffer());
};

// ----- Generic video generation (v4.645 — Generador de Outros IA) -----
//
// `triggerVideoGeneration` above is hard-wired to Kling with a fixed prompt shape,
// kept as-is so the Creador de Video keeps working. Outros need to pick the model at
// call time (the id is configurable per environment), so they use these three
// functions: create → check → fetch, with no polling loop inside the request (KIE
// video jobs run 1-3 minutes, well past the 120s ceiling of the serverless function).

// Submit an image-to-video task. Returns the task id immediately.
//
// El `input` lo arma `buildVideoInput` con los campos que declara el modelo
// elegido. `aspectRatio` y `resolution` son deseos, no garantías: los modelos
// image-to-video de Kling heredan el formato de la imagen de entrada y no
// reciben esos parámetros. Lo que realmente entregó el proveedor se mide
// después sobre el archivo (outroQuality.js) — nunca se corrige recortando.
// Un rechazo de KIE que habla de un CAMPO —desconocido, inválido, no
// permitido— es el que se puede resolver quitando el campo opcional. Un fallo
// de credencial, de saldo o de red no lo es, y reintentar ahí sólo gastaría
// otra llamada. La distinción se hace por el texto porque es lo único que KIE
// devuelve: no hay código de error por campo.
const looksLikeFieldRejection = (message) => /field|parameter|param|unknown|unrecogni|not allowed|not supported|invalid input|schema/i.test(String(message || ''));

export const createKieVideoTask = async ({
    model,
    prompt,
    imageUrl,
    aspectRatio = '9:16',
    duration = 5,
    resolution = '1080p',
    enableAudio = false,
    negativePrompt = null,
    callBackUrl = null,
    metadata = {}
}) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) throw new Error('KIE_API_KEY no configurada');

    const submit = async (negative) => {
        const input = buildVideoInput(model, {
            prompt,
            imageUrls: [imageUrl],
            duration,
            aspectRatio,
            resolution,
            enableAudio,
            negativePrompt: negative
        });

        const body = {
            model,
            ...(callBackUrl ? { callBackUrl } : {}),
            input,
            metadata
        };

        const response = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok || (data.code && data.code !== 200)) {
            const rawBody = JSON.stringify(data).slice(0, 400);
            console.error('[KIE video] createTask error response:', rawBody, '— input enviado:', JSON.stringify(input));
            const reason = data.msg || data.message || `HTTP ${response.status} ${rawBody}`;
            // Dos datos, porque son los dos que hacen falta para arreglarlo: el id
            // del modelo (corregible por entorno, sin desplegar) y los campos que se
            // enviaron. KIE contesta "This field is required" sin decir cuál, así
            // que la lista de lo enviado es lo que permite deducir el que falta.
            throw new Error(`KIE createTask (${model}): ${reason} — campos enviados: ${Object.keys(input).join(', ')}`);
        }

        const taskId = data.task_id || data.data?.task_id || data.data?.taskId;
        if (!taskId) {
            const rawBody = JSON.stringify(data).slice(0, 400);
            throw new Error(`KIE createTask devolvió sin task_id: ${rawBody}`);
        }
        return taskId;
    };

    let taskId;
    try {
        taskId = await submit(negativePrompt);
    } catch (e) {
        // `negative_prompt` está documentado en la API de Kling, pero lo que
        // valida es el esquema de la PASARELA, y ese no lo controlamos: KIE
        // renombra y recorta campos. Si lo rechaza, se reintenta sin él antes
        // de dar un fallo — el prompt positivo ya lleva el censo y la oclusión,
        // que son la parte que sostiene la preservación. Perder el refuerzo es
        // mucho mejor que no generar el clip.
        if (!negativePrompt || !looksLikeFieldRejection(e.message)) throw e;
        console.warn(`[KIE video] la pasarela rechazó negative_prompt (${e.message}); se reintenta sin él.`);
        taskId = await submit(null);
    }

    console.log(`[KIE video] task creada: ${taskId} (${model}, ${aspectRatio}, ${duration}s, audio=${enableAudio}, negativo=${negativePrompt ? 'sí' : 'no'})`);
    return taskId;
};

// One-shot status check of a video task. Same `/jobs/recordInfo` surface the image
// flow uses (the legacy `/jobs/getTaskDetail` 404s on the current API version), but
// returning instead of looping: the caller decides when to ask again.
//
// Returns { state: 'queued'|'running'|'success'|'failed', videoUrl, failMsg, raw }.
export const getKieVideoTask = async (taskId) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) throw new Error('KIE_API_KEY no configurada');

    const response = await fetch(
        `${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    const data = await response.json();

    if (!response.ok) {
        const rawBody = JSON.stringify(data).slice(0, 400);
        throw new Error(`KIE recordInfo falló: HTTP ${response.status} ${rawBody}`);
    }
    if (data.code && data.code !== 200) {
        const rawBody = JSON.stringify(data).slice(0, 400);
        throw new Error(`KIE recordInfo: ${data.msg || data.message || rawBody}`);
    }

    const rawState = data.data?.state || data.state || data.data?.status || data.status || '';
    const state = String(rawState).toLowerCase();

    if (state === 'success' || state === 'completed') {
        let resultObj = {};
        const rj = data.data?.resultJson ?? data.data?.result;
        if (typeof rj === 'string' && rj.length > 0) {
            try { resultObj = JSON.parse(rj); } catch { resultObj = {}; }
        } else if (rj && typeof rj === 'object') {
            resultObj = rj;
        }
        const output = data.data?.output || data.output || {};
        const candidate = Object.keys(resultObj).length ? resultObj : output;

        const urls = candidate.resultUrls
            || candidate.video_urls
            || candidate.videoUrls
            || candidate.videos
            || candidate.result_urls
            || (candidate.video_url ? [candidate.video_url] : null)
            || (candidate.videoUrl ? [candidate.videoUrl] : null)
            || (candidate.result_url ? [candidate.result_url] : null)
            || (candidate.resultUrl ? [candidate.resultUrl] : null);
        const videoUrl = Array.isArray(urls) ? urls[0] : urls;

        if (!videoUrl) {
            const rawBody = JSON.stringify(data).slice(0, 400);
            return { state: 'failed', videoUrl: null, failMsg: `KIE terminó sin URL de video: ${rawBody}`, raw: data };
        }
        return { state: 'success', videoUrl, failMsg: null, raw: data };
    }

    if (state === 'fail' || state === 'failed' || state === 'error') {
        const reason = data.data?.failMsg || data.data?.fail_msg
            || data.data?.error?.message || data.data?.message
            || data.message || JSON.stringify(data).slice(0, 400);
        return { state: 'failed', videoUrl: null, failMsg: reason, raw: data };
    }

    return { state: state === 'queuing' || state === 'queued' ? 'queued' : 'running', videoUrl: null, failMsg: null, raw: data };
};

// Download the produced video into a Buffer. The KIE-hosted URL is ephemeral, so the
// file has to be pulled and re-uploaded to our own bucket as soon as it is ready.
export const fetchKieVideoBuffer = async (kieVideoUrl) => {
    const resp = await fetch(kieVideoUrl);
    if (!resp.ok) throw new Error(`No se pudo descargar el video generado por KIE (${resp.status})`);
    return Buffer.from(await resp.arrayBuffer());
};
