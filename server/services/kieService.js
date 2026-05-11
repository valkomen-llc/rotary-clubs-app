/**
 * KIE.ai Video Generation Service
 * Module: Content Studio AI
 */

const KIE_API_BASE = 'https://api.kie.ai/api/v1';
// Modelo por defecto. Override con KIE_MODEL en Vercel si querés probar otro.
// Modelos comunes de KIE.ai para image-to-video:
//   - kling/v1.6-pro/image-to-video  (calidad alta, recomendado)
//   - kling/v1.6-standard/image-to-video  (más barato/rápido)
//   - runway-gen-3-alpha-turbo/image-to-video  (alternativa)
const DEFAULT_MODEL = process.env.KIE_MODEL || 'kling/v1.6-pro/image-to-video';

export const triggerVideoGeneration = async (projectId, imageUrls, config) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) throw new Error('KIE_API_KEY no configurada en Vercel');
    if (!imageUrls?.length) throw new Error('Se requiere al menos una imagen');

    const appUrl = process.env.APP_URL || 'https://app.clubplatform.org';

    // NOTA: los modelos image-to-video animan UNA sola imagen, no una secuencia.
    // Usamos la primera imagen del set. Para animar varias hay que crear tareas
    // separadas y concatenar los videos (futuro).
    const firstImage = imageUrls[0];

    const payload = {
        model: config.model || DEFAULT_MODEL,
        callBackUrl: `${appUrl}/api/content-studio/webhook`,
        input: {
            prompt: config.prompt || 'Smooth cinematic camera movement, high quality social media content',
            image_url: firstImage,
            duration: String(config.duration || 5),
            aspect_ratio: config.format || '9:16'
        },
        metadata: { projectId, totalImagesProvided: imageUrls.length }
    };

    console.log(`[KIE] createTask projectId=${projectId} model=${payload.model} firstImage=${firstImage.slice(0, 80)}`);

    let response, data;
    try {
        response = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        data = await response.json();
    } catch (e) {
        throw new Error(`KIE.ai unreachable: ${e.message}`);
    }

    if (!response.ok) {
        const msg = data?.msg || data?.message || data?.error?.message || `HTTP ${response.status}`;
        console.error('[KIE] createTask FAIL:', msg, JSON.stringify(data).slice(0, 500));
        const err = new Error(`KIE.ai: ${msg}`);
        err.rawResponse = data;
        err.httpStatus = response.status;
        throw err;
    }

    // KIE.ai puede devolver el task_id en varias formas según versión del API:
    const taskId =
        data?.task_id ||
        data?.taskId ||
        data?.id ||
        data?.data?.task_id ||
        data?.data?.taskId ||
        data?.data?.id ||
        data?.result?.task_id ||
        data?.result?.taskId;

    console.log(`[KIE] createTask response:`, JSON.stringify(data).slice(0, 800));

    if (!taskId) {
        const err = new Error('KIE.ai aceptó la tarea pero no devolvió task_id. Revisar lastKieResponse del proyecto.');
        err.rawResponse = data;
        err.httpStatus = response.status;
        throw err;
    }

    console.log(`[KIE] task created: ${taskId}`);
    return { taskId, status: 'processing', raw: data };
};

export const checkTaskStatus = async (taskId) => {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) throw new Error('KIE_API_KEY no configurada');

    let response, data;
    try {
        response = await fetch(`${KIE_API_BASE}/jobs/getTaskDetail?task_id=${taskId}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        data = await response.json();
    } catch (e) {
        throw new Error(`KIE.ai unreachable: ${e.message}`);
    }

    if (!response.ok) {
        const msg = data?.msg || data?.message || `HTTP ${response.status}`;
        throw new Error(`KIE.ai: ${msg}`);
    }

    const rawStatus = (data.data?.status || data.status || '').toUpperCase();
    const videoUrl =
        data.data?.output?.video_url ||
        data.data?.output?.videoUrl ||
        data.output?.video_url ||
        data.output?.videoUrl ||
        null;
    const errorMsg = data.data?.error || data.error?.message || data.message;

    let mappedStatus = 'processing';
    if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(rawStatus)) mappedStatus = 'ready';
    if (['FAILED', 'ERROR', 'CANCELLED'].includes(rawStatus)) mappedStatus = 'failed';

    console.log(`[KIE] status ${taskId}: ${rawStatus} → ${mappedStatus}${videoUrl ? ' (videoUrl present)' : ''}`);

    return {
        status: mappedStatus,
        videoUrl,
        error: errorMsg,
        raw: data
    };
};
