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
            
            // Update project with KIE task ID
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
                data: { status: 'failed' }
            });
            res.status(500).json({ error: 'Error al iniciar la generación por IA: ' + kieError.message });
        }
    } catch (error) {
        console.error('Error creating video project:', error);
        res.status(500).json({ error: 'Error al procesar el proyecto: ' + error.message });
    }
};

export const getVideoProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const projects = await prisma.videoProject.findMany({
            where: clubId ? { clubId } : {},
            orderBy: { createdAt: 'desc' }
        });
        res.json(projects);
    } catch (error) {
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
