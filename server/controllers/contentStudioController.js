import prisma from '../lib/prisma.js';
import { triggerVideoGeneration } from '../services/kieService.js';

export const generatePost = async (req, res) => {
    try {
        const { imageId, imageUrl, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        if (!imageUrl) {
            return res.status(400).json({ error: 'La URL de la imagen es requerida' });
        }

        // 1. Get Club Context
        const club = await prisma.club.findUnique({
            where: { id: clubId },
            include: {
                projects: { take: 3, orderBy: { createdAt: 'desc' } },
                posts: { take: 3, orderBy: { createdAt: 'desc' }, where: { published: true } }
            }
        });

        const clubName = club?.name || 'Club Rotario';
        const projectContext = club?.projects.map(p => `- ${p.title}: ${p.description.slice(0, 100)}`).join('\n') || 'No hay proyectos recientes.';
        
        let generatedImageUrl = null;
        let aiContent = null;

        if (process.env.OPENAI_API_KEY) {
            try {
                // A. IMAGE ANALYSIS (Vision)
                const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4-vision-preview",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: "Describe esta imagen detalladamente para recrearla. Enfócate en sujetos, acción y elementos de Rotary." },
                                    { type: "image_url", image_url: { "url": imageUrl } }
                                ]
                            }
                        ],
                        max_tokens: 300
                    })
                });

                const visionData = await visionResponse.json();
                const imageDescription = visionData.choices?.[0]?.message?.content || "Una actividad de servicio rotario.";

                // B. TEXT GENERATION
                const textPrompt = `Eres un experto en comunicación digital para Rotary. 
                Club: "${clubName}". Imagen: ${imageDescription}. Área: ${config.interestArea}.
                Genera 3 variantes (FB, IG, X) en JSON.`;

                const textResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4-turbo-preview",
                        messages: [{ role: "user", content: textPrompt }],
                        response_format: { type: "json_object" }
                    })
                });

                const textData = await textResponse.json();
                if (textData.choices?.[0]?.message?.content) {
                    aiContent = JSON.parse(textData.choices[0].message.content);
                }

                // C. IMAGE GENERATION (DALL-E 3) - Conversion to Portrait
                const dallePrompt = `Fotografía profesional 4K de Rotary. Basada en: ${imageDescription}. Recrea en formato VERTICAL (Portrait 4:5), centrando la acción. Realista, luz natural.`;

                const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "dall-e-3",
                        prompt: dallePrompt,
                        n: 1,
                        size: "1024x1792",
                        quality: "hd"
                    })
                });

                const dalleData = await dalleResponse.json();
                generatedImageUrl = dalleData.data?.[0]?.url;

            } catch (aiError) {
                console.error('AI Processing Error:', aiError);
            }
        }

        res.json({
            success: true,
            content: aiContent || {
                facebook: { copy: "Servicio rotario en acción.", hashtags: "#Rotary", cta: "Ver más" },
                instagram: { copy: "Impacto real.", hashtags: "#ServiceAboveSelf", cta: "Link en bio" },
                x: { copy: "Juntos por el cambio.", hashtags: "#Rotary", cta: "Info" }
            },
            generatedImageUrl: generatedImageUrl || imageUrl,
            metadata: {
                clubId,
                imageId,
                format: config.format
            }
        });

    } catch (error) {
        console.error('Error in generatePost:', error);
        res.status(500).json({ error: 'Error al generar la publicación: ' + error.message });
    }
};

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
