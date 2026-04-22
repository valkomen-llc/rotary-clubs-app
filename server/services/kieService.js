/**
 * KIE.ai Video Generation Service
 * Module: Content Studio AI
 * Version: v4.12.0
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

        // KIE.ai status mapping (approximate)
        // Adjust based on real API response structure
        const status = data.data?.status;
        const videoUrl = data.data?.output?.video_url;

        return {
            status: status === 'COMPLETED' ? 'ready' : status === 'FAILED' ? 'failed' : 'processing',
            videoUrl: videoUrl,
            raw: data
        };
    } catch (error) {
        console.error('KIE Status Check Error:', error);
        throw error;
    }
};
