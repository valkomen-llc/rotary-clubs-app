import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

import { triggerVideoGeneration } from '../services/kieService.js';
import { publishPost } from '../services/socialPublishService.js';
import { routeToModel } from '../lib/ai-router.js';

export const createVideoProject = async (req, res) => {
    try {
        const { images, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        // 1. Create project in DB
        const project = await prisma.videoProject.create({
            data: {
                title: config.title || `Video ${new Date().toLocaleDateString()}`,
                sourceImages: images,
                config,
                status: 'processing',
                clubId
            }
        });

        // 2. Trigger KIE.ai generation
        try {
            const imageUrls = images.map(img => img.url);
            const kieTask = await triggerVideoGeneration(project.id, imageUrls, config);

            await prisma.videoProject.update({
                where: { id: project.id },
                data: {
                    kieJobId: kieTask.taskId,
                    status: 'processing'
                }
            });

            res.status(201).json({
                ...project,
                externalTaskId: kieTask.taskId
            });
        } catch (kieError) {
            console.error('KIE Generation failed:', kieError);
            await prisma.videoProject.update({
                where: { id: project.id },
                data: {
                    status: 'failed',
                    lastKieResponse: {
                        error: kieError.message,
                        httpStatus: kieError.httpStatus || null,
                        rawResponse: kieError.rawResponse || null,
                        timestamp: new Date().toISOString()
                    }
                }
            });
            res.status(500).json({
                error: 'Error al iniciar la generación por IA: ' + kieError.message,
                rawResponse: kieError.rawResponse || null
            });
        }
    } catch (error) {
        console.error('Error creating video project:', error);
        res.status(500).json({ error: 'Error al procesar el proyecto: ' + error.message });
    }
};

export const getVideoProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        let projects = await prisma.videoProject.findMany({
            where: clubId ? { clubId } : {},
            orderBy: { createdAt: 'desc' }
        });

        // Auto-sync de proyectos atascados en processing por más de 1 minuto.
        // Útil cuando el webhook de KIE.ai no llegó (callBackUrl mal configurada, dominio no público, etc).
        const stuck = projects.filter(p =>
            p.status === 'processing' &&
            p.kieJobId &&
            (Date.now() - new Date(p.updatedAt).getTime()) > 60 * 1000
        ).slice(0, 5); // como máximo 5 syncs por request para no demorar

        if (stuck.length > 0) {
            const { checkTaskStatus } = await import('../services/kieService.js');
            await Promise.all(stuck.map(async (p) => {
                try {
                    const r = await checkTaskStatus(p.kieJobId);
                    await prisma.videoProject.update({
                        where: { id: p.id },
                        data: {
                            status: r.status,
                            videoUrl: r.videoUrl || p.videoUrl,
                            lastKieResponse: r.raw
                        }
                    });
                } catch (err) {
                    console.error(`[Auto-sync] proyecto ${p.id}:`, err.message);
                    // No marcamos failed acá — solo si KIE explícitamente devuelve FAILED
                }
            }));

            // Re-fetch para devolver estado actualizado
            projects = await prisma.videoProject.findMany({
                where: clubId ? { clubId } : {},
                orderBy: { createdAt: 'desc' }
            });
        }

        res.json(projects);
    } catch (error) {
        console.error('getVideoProjects error:', error);
        res.status(500).json({ error: 'Error al obtener los proyectos' });
    }
};

export const connectSocialAccount = async (req, res) => {
    try {
        const { platform, accountName, accessToken, refreshToken, expiresAt } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        const account = await prisma.socialAccount.create({
            data: {
                platform,
                accountName,
                accessToken,
                refreshToken,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                clubId
            }
        });

        res.status(201).json(account);
    } catch (error) {
        console.error('Account Connection Error:', error);
        res.status(500).json({ error: 'Error al conectar la cuenta' });
    }
};

export const getOAuthUrl = async (req, res) => {
    try {
        const { platform } = req.params;
        const { clubId } = req.query; // Pasado desde el frontend
        
        const REDIRECT_URI = `${process.env.VITE_API_URL || 'https://app.clubplatform.org/api'}/social/callback/${platform}`;
        const state = clubId || 'platform'; // En un flujo real, aquí usaríamos un JWT firmado
        
        let url = '';
        
        switch (platform) {
            case 'instagram':
            case 'facebook':
                // Meta OAuth
                const FB_APP_ID = process.env.META_APP_ID || '2190338908168499';
                url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,pages_manage_posts&response_type=code&state=${state}`;
                break;
                
            case 'tiktok':
                // TikTok OAuth
                const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || 'TU_TIKTOK_CLIENT_KEY';
                url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=video.upload,user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
                break;
                
            case 'youtube':
                // Google OAuth
                const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'TU_GOOGLE_CLIENT_ID';
                url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload&access_type=offline&prompt=consent&state=${state}`;
                break;
                
            default:
                return res.status(400).json({ error: 'Plataforma no soportada' });
        }
        
        res.redirect(url);
    } catch (error) {
        console.error('Error generating OAuth URL:', error);
        res.status(500).json({ error: 'Error al generar URL de conexión' });
    }
};

export const getSocialAccounts = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const accounts = await prisma.socialAccount.findMany({
            where: clubId ? { clubId } : {}
        });
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las cuentas sociales' });
    }
};

export const schedulePost = async (req, res) => {
    try {
        const { projectId, socialAccountId, caption, scheduledFor } = req.body;
        if (!projectId || !socialAccountId) {
            return res.status(400).json({ error: 'projectId y socialAccountId son requeridos' });
        }

        const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
        const publishNow = !scheduledDate || scheduledDate.getTime() <= Date.now();

        const post = await prisma.scheduledPost.create({
            data: {
                projectId,
                socialAccountId,
                caption,
                scheduledFor: scheduledDate,
                status: publishNow ? 'pending' : 'scheduled'
            }
        });

        if (publishNow) {
            // Disparar publicación inmediata en background (no bloqueamos la respuesta)
            executePost(post.id).catch((err) => console.error('Immediate publish error:', err.message));
        }

        res.status(201).json(post);
    } catch (error) {
        console.error('schedulePost error:', error);
        res.status(500).json({ error: 'Error al programar la publicación' });
    }
};

/**
 * Ejecuta la publicación de un ScheduledPost: trae proyecto + cuenta,
 * llama al servicio Meta, y actualiza el estado en BD.
 * Exportado para que el cron lo use.
 */
export const executePost = async (postId) => {
    const post = await prisma.scheduledPost.findUnique({
        where: { id: postId },
        include: { video: true, account: true }
    });
    if (!post) throw new Error('Post no encontrado');
    if (!post.video?.videoUrl) {
        await prisma.scheduledPost.update({
            where: { id: postId },
            data: { status: 'failed', error: 'El video todavía no tiene URL (KIE no terminó)' }
        });
        return;
    }

    const result = await publishPost(post.account, {
        videoUrl: post.video.videoUrl,
        caption: post.caption || ''
    });

    await prisma.scheduledPost.update({
        where: { id: postId },
        data: result.success
            ? {
                status: 'published',
                publishedAt: new Date(),
                platformPostId: result.platformPostId,
                error: null
            }
            : {
                status: 'failed',
                error: result.error?.slice(0, 500) || 'Error desconocido'
            }
    });

    return result;
};

export const cancelPost = async (req, res) => {
    try {
        const { id } = req.params;
        const post = await prisma.scheduledPost.findUnique({ where: { id } });
        if (!post) return res.status(404).json({ error: 'Post no encontrado' });
        if (post.status === 'published') {
            return res.status(400).json({ error: 'No se puede cancelar un post ya publicado' });
        }
        const updated = await prisma.scheduledPost.update({
            where: { id },
            data: { status: 'cancelled' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Error al cancelar el post' });
    }
};

export const retryPost = async (req, res) => {
    try {
        const { id } = req.params;
        const post = await prisma.scheduledPost.findUnique({ where: { id } });
        if (!post) return res.status(404).json({ error: 'Post no encontrado' });
        if (post.status === 'published') {
            return res.status(400).json({ error: 'El post ya fue publicado' });
        }
        await prisma.scheduledPost.update({
            where: { id },
            data: { status: 'pending', error: null }
        });
        executePost(id).catch((err) => console.error('Retry publish error:', err.message));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al reintentar el post' });
    }
};

export const deletePost = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.scheduledPost.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el post' });
    }
};

export const disconnectAccount = async (req, res) => {
    try {
        const { id } = req.params;
        // Verificar que no haya posts pendientes asociados
        const pending = await prisma.scheduledPost.count({
            where: { socialAccountId: id, status: { in: ['scheduled', 'pending'] } }
        });
        if (pending > 0) {
            return res.status(400).json({ error: `Hay ${pending} publicación(es) pendiente(s) para esta cuenta. Cancelalas antes de desconectar.` });
        }
        await prisma.socialAccount.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('disconnectAccount error:', error);
        res.status(500).json({ error: 'Error al desconectar la cuenta' });
    }
};

export const getDiagnostic = async (req, res) => {
    try {
        // Solo administradores pueden ver el diagnóstico
        if (req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Solo administradores pueden ver el diagnóstico' });
        }

        const envCheck = {
            KIE_API_KEY: !!process.env.KIE_API_KEY,
            META_APP_ID: !!(process.env.META_APP_ID || process.env.FB_APP_ID),
            META_APP_SECRET: !!(process.env.META_APP_SECRET || process.env.FB_APP_SECRET),
            APP_URL: process.env.APP_URL || '(no seteado)',
            GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
            CRON_SECRET: !!process.env.CRON_SECRET,
            AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME || '(no seteado)',
            AWS_REGION: process.env.AWS_REGION || '(no seteado)',
            KIE_MODEL: process.env.KIE_MODEL || 'kling-2.6/image-to-video (default)'
        };

        // Test de conectividad con KIE.ai
        let kieTest = { skipped: true, reason: 'KIE_API_KEY no seteada' };
        if (process.env.KIE_API_KEY) {
            try {
                const r = await fetch('https://api.kie.ai/api/v1/jobs/getTaskDetail?task_id=ping', {
                    headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}` }
                });
                kieTest = { reachable: true, status: r.status, statusText: r.statusText };
            } catch (e) {
                kieTest = { reachable: false, error: e.message };
            }
        }

        // Test de conectividad con Meta Graph API
        let metaTest = { skipped: true, reason: 'META_APP_ID o META_APP_SECRET no seteados' };
        if (envCheck.META_APP_ID && envCheck.META_APP_SECRET) {
            try {
                const appId = process.env.META_APP_ID || process.env.FB_APP_ID;
                const appSecret = process.env.META_APP_SECRET || process.env.FB_APP_SECRET;
                const r = await fetch(`https://graph.facebook.com/v19.0/${appId}?fields=name,namespace&access_token=${appId}|${appSecret}`);
                const data = await r.json();
                metaTest = {
                    reachable: true,
                    status: r.status,
                    app: data.name || null,
                    error: data.error?.message || null
                };
            } catch (e) {
                metaTest = { reachable: false, error: e.message };
            }
        }

        // Conteos para entender el estado de la DB
        const [projectCount, processingCount, accountCount, scheduledCount] = await Promise.all([
            prisma.videoProject.count(),
            prisma.videoProject.count({ where: { status: 'processing' } }),
            prisma.socialAccount.count(),
            prisma.scheduledPost.count({ where: { status: { in: ['scheduled', 'pending'] } } })
        ]);

        // OAuth callback URL que tendrías que tener autorizada en la app de Meta
        const baseUrl = process.env.APP_URL
            || (process.env.NODE_ENV === 'production' ? 'https://app.clubplatform.org' : `${req.protocol}://${req.get('host')}`);

        res.json({
            timestamp: new Date().toISOString(),
            env: envCheck,
            connectivity: { kie: kieTest, meta: metaTest },
            db: {
                videoProjects: projectCount,
                stuckInProcessing: processingCount,
                socialAccounts: accountCount,
                pendingPosts: scheduledCount
            },
            oauthCallbackUrls: {
                facebook: `${baseUrl}/api/social/callback/facebook`,
                instagram: `${baseUrl}/api/social/callback/instagram`
            },
            kieWebhookUrl: `${baseUrl}/api/content-studio/webhook`
        });
    } catch (error) {
        console.error('getDiagnostic error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const probeModels = async (req, res) => {
    try {
        if (req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Solo administradores' });
        }

        const apiKey = process.env.KIE_API_KEY;
        if (!apiKey) return res.status(400).json({ error: 'KIE_API_KEY no configurada' });

        const appUrl = process.env.APP_URL || 'https://app.clubplatform.org';
        const imageUrl = req.body?.imageUrl
            || 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1024px-Cat03.jpg';

        // Lista de candidatos común para image-to-video en KIE.ai.
        // Si el usuario pasa req.body.models, usamos esa lista.
        const candidates = (req.body?.models && req.body.models.length > 0)
            ? req.body.models
            : [
                'kling/v2.1/image-to-video',
                'kling/v2.0/image-to-video',
                'kling/v1.6-pro/image-to-video',
                'kling/v1.6/image-to-video',
                'kling-v2-1-master-image-to-video',
                'kling-v1-6-pro-image-to-video',
                'kling/v2.1-master/image-to-video',
                'bytedance/v1-pro-fast-image-to-video',
                'bytedance/seedance-v1-pro-fast-image-to-video',
                'bytedance/seedance-v1-pro-fast/image-to-video',
                'seedance-v1-pro-fast-image-to-video',
                'seedance-v1-pro-fast/image-to-video',
                'runway-gen-3-alpha-turbo/image-to-video',
                'pixverse/v4/image-to-video',
                'veo3/image-to-video'
            ];

        const results = [];
        let foundWorking = null;

        for (const model of candidates) {
            try {
                const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model,
                        callBackUrl: `${appUrl}/api/content-studio/webhook`,
                        input: {
                            prompt: 'probe test',
                            image_url: imageUrl,
                            duration: '5',
                            aspect_ratio: '9:16'
                        },
                        metadata: { probe: true }
                    })
                });
                const data = await r.json();

                const taskId = data?.task_id || data?.taskId || data?.id
                    || data?.data?.task_id || data?.data?.taskId || data?.data?.id;

                const result = {
                    model,
                    httpStatus: r.status,
                    kieCode: data?.code || null,
                    kieMsg: data?.msg || data?.message || null,
                    accepted: !!taskId,
                    taskId: taskId || null
                };
                results.push(result);

                if (taskId) {
                    foundWorking = result;
                    break; // paramos al primer modelo que acepta
                }
            } catch (err) {
                results.push({ model, error: err.message });
            }
        }

        res.json({
            timestamp: new Date().toISOString(),
            imageUrlUsed: imageUrl,
            probed: results.length,
            totalCandidates: candidates.length,
            foundWorking,
            results,
            nextStep: foundWorking
                ? `Seteá KIE_MODEL="${foundWorking.model}" en Vercel (Production + Preview) y redeployá.`
                : 'Ninguno de los candidatos funcionó. Mandame las respuestas y pruebo más identificadores.'
        });
    } catch (error) {
        console.error('probeModels error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const suggestCaption = async (req, res) => {
    try {
        const { projectId, prompt: hint } = req.body;
        let context = hint || '';

        if (projectId) {
            const project = await prisma.videoProject.findUnique({ where: { id: projectId } });
            if (project) {
                context = `Título del video: ${project.title}. ${context}`;
            }
        }

        const systemPrompt = `Eres un copywriter experto en redes sociales para organizaciones rotarias. Generás captions cortos, emocionales y con llamada a la acción para Reels (Instagram/Facebook). Incluí 3-5 hashtags relevantes al final. Tono: cálido, institucional, inspirador. Máximo 180 caracteres antes de los hashtags. NO uses comillas.`;
        const userPrompt = `Contexto: ${context || 'Video con fotos de una actividad de servicio del club Rotario'}. Generá un único caption listo para publicar.`;

        const caption = await routeToModel('gemini-2.5-flash', systemPrompt, userPrompt);
        res.json({ caption: caption.trim() });
    } catch (error) {
        console.error('suggestCaption error:', error);
        res.status(500).json({ error: 'Error al generar caption: ' + error.message });
    }
};

export const getScheduledPosts = async (req, res) => {
    try {
        const posts = await prisma.scheduledPost.findMany({
            include: {
                video: true,
                account: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la cola de publicaciones' });
    }
};

export const handleKieWebhook = async (req, res) => {
    try {
        const { task_id, status, output } = req.body;
        console.log(`Recibido Webhook de KIE.ai: ${task_id} status: ${status}`);

        // Find project by external task ID
        const project = await prisma.videoProject.findFirst({
            where: { kieJobId: task_id }
        });

        if (!project) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        let newStatus = 'processing';
        if (status === 'COMPLETED') newStatus = 'ready';
        if (status === 'FAILED') newStatus = 'failed';

        await prisma.videoProject.update({
            where: { id: project.id },
            data: {
                status: newStatus,
                videoUrl: output?.video_url || project.videoUrl
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ error: 'Error procesando webhook' });
    }
};

export const syncProjectStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await prisma.videoProject.findUnique({
            where: { id }
        });

        if (!project || !project.kieJobId) {
            return res.status(404).json({ error: 'Proyecto no válido para sincronización' });
        }

        if (project.status === 'ready' || project.status === 'failed') {
            return res.json(project);
        }

        const { checkTaskStatus } = await import('../services/kieService.js');
        const updatedStatus = await checkTaskStatus(project.kieJobId);

        const updatedProject = await prisma.videoProject.update({
            where: { id },
            data: {
                status: updatedStatus.status,
                videoUrl: updatedStatus.videoUrl || project.videoUrl,
                lastKieResponse: updatedStatus.raw // Almacenamos la respuesta cruda para diagnóstico
            }
        });

        res.json(updatedProject);
    } catch (error) {
        console.error('Sync Error:', error);
        res.status(500).json({ error: 'Error sincronizando estado' });
    }
};

export const deleteVideoProject = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.videoProject.delete({
            where: { id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Error:', error);
        res.status(500).json({ error: 'Error al eliminar el proyecto' });
    }
};
