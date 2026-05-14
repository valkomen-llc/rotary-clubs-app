import prisma from '../lib/prisma.js';
import { triggerVideoGeneration } from '../services/kieService.js';

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST (OUTPAINTING RECREATION) ---');
        const { imageId, imageUrl, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        if (!imageUrl) {
            return res.status(400).json({ error: 'La URL de la imagen es requerida' });
        }

        // 1. Fetch and Resize Image for Vision Analysis
        let base64Image = null;
        try {
            const imgResponse = await fetch(imageUrl);
            const buffer = Buffer.from(await imgResponse.arrayBuffer());
            const sharp = (await import('sharp')).default;
            const resizedBuffer = await sharp(buffer)
                .resize(800, null, { withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();
            base64Image = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
        } catch (imgError) {
            console.error('Image processing failed:', imgError);
            base64Image = imageUrl;
        }

        // 2. Club Context
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
        const projectContext = club?.projects?.map(p => `- ${p.title}`).join(', ') || 'Proyectos de servicio';

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'Falta OPENAI_API_KEY' });
        }

        // 3. GPT-4o: Analyze and generate detailed Outpainting Prompt
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
                        role: "system",
                        content: "Eres un experto en Imagen Pública de Rotary y diseño gráfico IA. Tu tarea es analizar fotos y describir cómo expandirlas a formato vertical 9:16 manteniendo la identidad de las personas y logos."
                    },
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: `Analiza esta imagen para el club "${clubName}".
                                Genera:
                                1. Copies para redes sociales.
                                2. Una descripción EXTREMADAMENTE DETALLADA de la escena para recrearla en formato PORTRAIT (vertical) usando DALL-E 3. 
                                Importante: Describe las personas, sus ropas, los logos de Rotary presentes y el entorno para que la IA complete la imagen arriba y abajo si es horizontal.
                                
                                Responde en JSON:
                                {
                                  "facebook": { "copy": "...", "hashtags": "...", "cta": "..." },
                                  "instagram": { "copy": "...", "hashtags": "...", "cta": "..." },
                                  "x": { "copy": "...", "hashtags": "...", "cta": "..." },
                                  "dallePrompt": "descripcion detallada para regeneracion vertical"
                                }`
                            },
                            { type: "image_url", image_url: { "url": base64Image } }
                        ]
                    }
                ],
                response_format: { type: "json_object" }
            })
        });

        const gptData = await gptResponse.json();
        const content = gptData.choices?.[0]?.message?.content;
        
        if (!content) {
            return res.status(500).json({ error: 'La IA no pudo analizar la imagen. Prueba con otra.' });
        }

        const parsed = JSON.parse(content);
        const dallePrompt = `Professional institutional photography for Rotary International. A high-quality recreation of this scene in PORTRAIT format (aspect ratio 9:16). ${parsed.dallePrompt}. Realistic style, cinematic lighting, vibrant colors, maintaining the exact mood and faces of the people.`;

        // 4. DALL-E 3: Outpainting / Recreation in Portrait
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
        
        if (!dalleData.data?.[0]?.url) {
            console.error('DALL-E Error:', dalleData.error);
            return res.status(500).json({ error: 'La IA falló al regenerar la imagen en formato Portrait. Error: ' + (dalleData.error?.message || 'Unknown') });
        }

        res.json({
            success: true,
            content: {
                facebook: parsed.facebook,
                instagram: parsed.instagram,
                x: parsed.x
            },
            generatedImageUrl: dalleData.data[0].url,
            metadata: { clubId, format: '4:5' }
        });

    } catch (error) {
        console.error('Global Error:', error);
        res.status(500).json({ error: 'Error interno: ' + error.message });
    }
};

export const createVideoProject = async (req, res) => {
    try {
        const { images, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;
        const project = await prisma.videoProject.create({
            data: { title: config.title || `Video ${new Date().toLocaleDateString()}`, sourceImages: images, config, status: 'processing', clubId }
        });
        try {
            const imageUrls = images.map(img => img.url);
            const { triggerVideoGeneration } = await import('../services/kieService.js');
            const kieTask = await triggerVideoGeneration(project.id, imageUrls, config);
            await prisma.videoProject.update({ where: { id: project.id }, data: { kieJobId: kieTask.taskId, status: 'processing' } });
            res.status(201).json({ ...project, externalTaskId: kieTask.taskId });
        } catch (kieError) {
            await prisma.videoProject.update({ where: { id: project.id }, data: { status: 'failed' } });
            res.status(500).json({ error: 'KIE error: ' + kieError.message });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error: ' + error.message });
    }
};

export const getVideoProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const projects = await prisma.videoProject.findMany({ where: clubId ? { clubId } : {}, orderBy: { createdAt: 'desc' } });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const connectSocialAccount = async (req, res) => {
    try {
        const { platform, accountName, accessToken, refreshToken, expiresAt } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;
        const account = await prisma.socialAccount.create({ data: { platform, accountName, accessToken, refreshToken, expiresAt: expiresAt ? new Date(expiresAt) : null, clubId } });
        res.status(201).json(account);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const getSocialAccounts = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const accounts = await prisma.socialAccount.findMany({ where: clubId ? { clubId } : {} });
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const schedulePost = async (req, res) => {
    try {
        const { projectId, socialAccountId, caption, scheduledFor } = req.body;
        const post = await prisma.scheduledPost.create({ data: { projectId, socialAccountId, caption, scheduledFor: scheduledFor ? new Date(scheduledFor) : null, status: scheduledFor ? 'scheduled' : 'pending' } });
        res.status(201).json(post);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
};

export const getScheduledPosts = async (req, res) => {
    try {
        const posts = await prisma.scheduledPost.findMany({ include: { video: true, account: true }, orderBy: { createdAt: 'desc' } });
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
        await prisma.videoProject.update({ where: { id: project.id }, data: { status: newStatus, videoUrl: output?.video_url || project.videoUrl } });
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
        const updatedProject = await prisma.videoProject.update({ where: { id }, data: { status: updatedStatus.status, videoUrl: updatedStatus.videoUrl || project.videoUrl, lastKieResponse: updatedStatus.raw } });
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
            default: return res.status(400).json({ error: 'Plataforma no soportada' });
        }
        res.redirect(url);
    } catch (error) {
        console.error('Error generating OAuth URL:', error);
        res.status(500).json({ error: 'Error al generar URL de conexión' });
    }
};
