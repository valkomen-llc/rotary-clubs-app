import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

import { triggerVideoGeneration } from '../services/kieService.js';

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
                    externalTaskId: kieTask.taskId,
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
        res.status(500).json({ error: 'Error al procesar el proyecto' });
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
        res.status(500).json({ error: 'Error al conectar la cuenta' });
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
        
        const post = await prisma.scheduledPost.create({
            data: {
                projectId,
                socialAccountId,
                caption,
                scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
                status: scheduledFor ? 'scheduled' : 'pending'
            }
        });

        res.status(201).json(post);
    } catch (error) {
        res.status(500).json({ error: 'Error al programar la publicación' });
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
            where: { externalTaskId: task_id }
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

        if (!project || !project.externalTaskId) {
            return res.status(404).json({ error: 'Proyecto no válido para sincronización' });
        }

        if (project.status === 'ready' || project.status === 'failed') {
            return res.json(project);
        }

        const { checkTaskStatus } = await import('../services/kieService.js');
        const updatedStatus = await checkTaskStatus(project.externalTaskId);

        const updatedProject = await prisma.videoProject.update({
            where: { id },
            data: {
                status: updatedStatus.status,
                videoUrl: updatedStatus.videoUrl || project.videoUrl
            }
        });

        res.json(updatedProject);
    } catch (error) {
        console.error('Sync Error:', error);
        res.status(500).json({ error: 'Error sincronizando estado' });
    }
};
