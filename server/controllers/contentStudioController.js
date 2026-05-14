import prisma from '../lib/prisma.js';
import { triggerVideoGeneration } from '../services/kieService.js';

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST ---');
        const { imageId, imageUrl, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        if (!imageUrl) {
            return res.status(400).json({ error: 'La URL de la imagen es requerida' });
        }

        console.log('Params:', { imageId, imageUrl, clubId, config });

        // 1. Get Club Context (Optional for System Admins)
        let club = null;
        if (clubId) {
            club = await prisma.club.findUnique({
                where: { id: clubId },
                include: {
                    projects: { take: 2, orderBy: { createdAt: 'desc' } },
                    posts: { take: 2, orderBy: { createdAt: 'desc' }, where: { published: true } }
                }
            });
        }

        const clubName = club?.name || 'Club Rotario';
        const projectContext = club?.projects?.map(p => `- ${p.title}`).join(', ') || 'Proyectos de servicio a la comunidad';
        
        let generatedImageUrl = null;
        let aiContent = null;

        if (!process.env.OPENAI_API_KEY) {
            console.error('MISSING OPENAI_API_KEY');
            return res.status(500).json({ error: 'Error interno: Falta configuración de IA' });
        }

        try {
            console.log('Calling GPT-4o for combined analysis...');
            const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "user",
                            content: [
                                { 
                                    type: "text", 
                                    text: `Eres un experto en Imagen Pública de Rotary. 
                                    Analiza esta imagen y genera 3 variantes de copy (Facebook, Instagram, X) para el club "${clubName}".
                                    Área de interés: ${config.interestArea}.
                                    Contexto del club: ${projectContext}.
                                    
                                    También proporciona una descripción técnica detallada de la imagen original para recrearla en formato retrato.
                                    Responde EXCLUSIVAMENTE en JSON con esta estructura:
                                    {
                                      "facebook": { "copy": "...", "hashtags": "...", "cta": "..." },
                                      "instagram": { "copy": "...", "hashtags": "...", "cta": "..." },
                                      "x": { "copy": "...", "hashtags": "...", "cta": "..." },
                                      "imageDescription": "descripción técnica para DALL-E"
                                    }`
                                },
                                { 
                                    type: "image_url", 
                                    image_url: { 
                                        "url": imageUrl,
                                        "detail": "high"
                                    } 
                                }
                            ]
                        }
                    ],
                    response_format: { type: "json_object" },
                    max_tokens: 1500
                })
            });

            const gptData = await gptResponse.json();
            console.log('GPT Response RAW:', JSON.stringify(gptData).substring(0, 500));
            
            if (gptData.error) {
                console.error('OpenAI GPT Error Detail:', gptData.error);
                return res.status(500).json({ error: `OpenAI dice: ${gptData.error.message}` });
            }

            if (!gptData.choices?.[0]?.message?.content) {
                console.error('Empty GPT content. Full response:', JSON.stringify(gptData));
                return res.status(500).json({ error: 'La IA no devolvió contenido. Verifica si la imagen es accesible.' });
            }

            const parsed = JSON.parse(gptData.choices[0].message.content);
            aiContent = {
                facebook: parsed.facebook,
                instagram: parsed.instagram,
                x: parsed.x
            };
            const imageDescription = parsed.imageDescription;

            console.log('Calling DALL-E 3 for image generation...');
            const dallePrompt = `Professional photography for Rotary. Scene: ${imageDescription}. Recreate in PORTRAIT format (4:5), realistic style, natural light, high resolution. Institutional and inspiring mood.`;

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
            
            if (dalleData.error) {
                console.error('DALL-E Error:', dalleData.error);
                generatedImageUrl = imageUrl; // Fallback to original
            } else {
                generatedImageUrl = dalleData.data?.[0]?.url;
            }

        } catch (aiError) {
            console.error('AI Logic Error:', aiError);
            return res.status(500).json({ error: 'Fallo en el procesamiento de IA: ' + aiError.message });
        }

        res.json({
            success: true,
            content: aiContent,
            generatedImageUrl: generatedImageUrl || imageUrl,
            metadata: { clubId, imageId, format: config.format }
        });

    } catch (error) {
        console.error('Global Error in generatePost:', error);
        res.status(500).json({ error: 'Error inesperado: ' + error.message });
    }
};

export const createVideoProject = async (req, res) => {
    try {
        const { images, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        const project = await prisma.videoProject.create({
            data: {
                title: config.title || `Video ${new Date().toLocaleDateString()}`,
                sourceImages: images,
                config,
                status: 'processing',
                clubId
            }
        });

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

            res.status(201).json({ ...project, externalTaskId: kieTask.taskId });
        } catch (kieError) {
            await prisma.videoProject.update({
                where: { id: project.id },
                data: { status: 'failed' }
            });
            res.status(500).json({ error: 'KIE error: ' + kieError.message });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error: ' + error.message });
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
        res.status(500).json({ error: 'Error' });
    }
};

export const connectSocialAccount = async (req, res) => {
    try {
        const { platform, accountName, accessToken, refreshToken, expiresAt } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        const account = await prisma.socialAccount.create({
            data: { platform, accountName, accessToken, refreshToken, expiresAt: expiresAt ? new Date(expiresAt) : null, clubId }
        });

        res.status(201).json(account);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
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
        res.status(500).json({ error: 'Error' });
    }
};

export const schedulePost = async (req, res) => {
    try {
        const { projectId, socialAccountId, caption, scheduledFor } = req.body;
        const post = await prisma.scheduledPost.create({
            data: { projectId, socialAccountId, caption, scheduledFor: scheduledFor ? new Date(scheduledFor) : null, status: scheduledFor ? 'scheduled' : 'pending' }
        });
        res.status(201).json(post);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const getScheduledPosts = async (req, res) => {
    try {
        const posts = await prisma.scheduledPost.findMany({
            include: { video: true, account: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const handleKieWebhook = async (req, res) => {
    try {
        const { task_id, status, output } = req.body;
        const project = await prisma.videoProject.findFirst({ where: { kieJobId: task_id } });
        if (!project) return res.status(404).json({ error: 'Not found' });

        let newStatus = 'processing';
        if (status === 'COMPLETED') newStatus = 'ready';
        if (status === 'FAILED') newStatus = 'failed';

        await prisma.videoProject.update({
            where: { id: project.id },
            data: { status: newStatus, videoUrl: output?.video_url || project.videoUrl }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const syncProjectStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await prisma.videoProject.findUnique({ where: { id } });
        if (!project || !project.kieJobId) return res.status(404).json({ error: 'Invalid project' });
        if (project.status === 'ready' || project.status === 'failed') return res.json(project);

        const { checkTaskStatus } = await import('../services/kieService.js');
        const updatedStatus = await checkTaskStatus(project.kieJobId);

        const updatedProject = await prisma.videoProject.update({
            where: { id },
            data: { status: updatedStatus.status, videoUrl: updatedStatus.videoUrl || project.videoUrl, lastKieResponse: updatedStatus.raw }
        });
        res.json(updatedProject);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const deleteVideoProject = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.videoProject.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const getOAuthUrl = async (req, res) => {
    try {
        const { platform } = req.params;
        const { clubId } = req.query;
        
        const REDIRECT_URI = `${process.env.VITE_API_URL || 'https://app.clubplatform.org/api'}/social/callback/${platform}`;
        const state = clubId || 'platform';
        
        let url = '';
        
        switch (platform) {
            case 'instagram':
            case 'facebook':
                const FB_APP_ID = process.env.META_APP_ID || '2190338908168499';
                url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,pages_manage_posts&response_type=code&state=${state}`;
                break;
                
            case 'tiktok':
                const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || 'TU_TIKTOK_CLIENT_KEY';
                url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=video.upload,user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
                break;
                
            case 'youtube':
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
