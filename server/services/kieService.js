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

export const triggerVideoGeneration = async (projectId, imageUrls, config) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
        throw new Error('KIE_API_KEY no configurada');
    }

    try {
        // Prepare the request for KIE.ai
        // Using Kling 2.6 as the default high-quality model for short videos
        const response = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "kling-2.6/image-to-video",
                callBackUrl: `${process.env.APP_URL || 'https://app.clubplatform.org'}/api/content-studio/webhook`,
                input: {
                    prompt: config.prompt || "Ken Burns effect, smooth transitions, high quality social media content",
                    image_urls: imageUrls,
                    duration: config.duration || "10",
                    resolution: "1080p",
                    aspect_ratio: "9:16"
                },
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

// Download the final image produced by KIE into a Buffer so we can re-upload it to our
// own S3 bucket (the KIE-hosted URL is ephemeral and not under our control).
export const fetchKieImageBuffer = async (kieImageUrl) => {
    const resp = await fetch(kieImageUrl);
    if (!resp.ok) throw new Error(`No se pudo descargar la imagen generada por KIE (${resp.status})`);
    return Buffer.from(await resp.arrayBuffer());
};
