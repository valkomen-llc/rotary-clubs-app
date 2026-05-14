import prisma from '../lib/prisma.js';

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST (DIAGNOSTIC MODE) ---');
        const { imageId, imageUrl, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        if (!imageUrl) {
            return res.status(400).json({ error: 'Falta la URL de la imagen.' });
        }

        // 1. Image Processing (Base64 + Resize)
        let processedImage = imageUrl;
        try {
            console.log('Fetching and resizing image...');
            const imgResponse = await fetch(imageUrl);
            if (imgResponse.ok) {
                const buffer = Buffer.from(await imgResponse.arrayBuffer());
                const sharp = (await import('sharp')).default;
                const resizedBuffer = await sharp(buffer)
                    .resize(1000, null, { withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toBuffer();
                processedImage = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
                console.log('Image processed successfully.');
            }
        } catch (err) {
            console.warn('Sharp processing failed, using raw URL:', err.message);
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
            return res.status(500).json({ error: 'Configuración incompleta: Falta OPENAI_API_KEY.' });
        }

        // 3. Analysis with GPT-4o
        console.log('Connecting to OpenAI GPT-4o...');
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
                                text: `Eres un experto en Imagen Pública de Rotary. Analiza esta imagen para el club "${clubName}". 
                                Contexto: ${projectContext}.
                                
                                Genera copies para Facebook, Instagram y X. 
                                También genera una "imageDescription" técnica para DALL-E 3 que describa cómo recrear esta escena en formato vertical (Portrait 9:16), expandiendo el fondo y manteniendo los rostros y logos.
                                
                                Responde exclusivamente en JSON:
                                {
                                  "facebook": { "copy": "...", "hashtags": "...", "cta": "..." },
                                  "instagram": { "copy": "...", "hashtags": "...", "cta": "..." },
                                  "x": { "copy": "...", "hashtags": "...", "cta": "..." },
                                  "imageDescription": "..."
                                }`
                            },
                            { 
                                type: "image_url", 
                                image_url: { "url": processedImage } 
                            }
                        ]
                    }
                ],
                response_format: { type: "json_object" },
                max_tokens: 1200
            })
        });

        const gptData = await gptResponse.json();
        
        if (!gptResponse.ok) {
            console.error('OpenAI GPT Error:', gptData);
            return res.status(500).json({ error: `OpenAI GPT dice: ${gptData.error?.message || 'Error desconocido'}` });
        }

        const content = gptData.choices?.[0]?.message?.content;
        if (!content) {
            return res.status(500).json({ error: 'La IA no devolvió análisis. Revisa la imagen.' });
        }

        const parsed = JSON.parse(content);
        const dallePrompt = `Professional Rotary International photo. RECREATE THIS SCENE IN VERTICAL PORTRAIT (9:16). Scene description: ${parsed.imageDescription}. High fidelity, realistic, cinematic lighting, hd quality.`;

        // 4. Generation with DALL-E 3
        console.log('Connecting to DALL-E 3...');
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

        if (!dalleResponse.ok) {
            console.error('DALL-E Error:', dalleData);
            return res.status(500).json({ error: `DALL-E dice: ${dalleData.error?.message || 'Fallo en generación'}` });
        }

        res.json({
            success: true,
            content: {
                facebook: parsed.facebook,
                instagram: parsed.instagram,
                x: parsed.x
            },
            generatedImageUrl: dalleData.data[0].url,
            metadata: { clubId, imageId }
        });

    } catch (error) {
        console.error('Fatal Controller Error:', error);
        res.status(500).json({ error: 'Error del sistema: ' + error.message });
    }
};

export const createVideoProject = async (req, res) => {
    try {
        const { images, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;
        const project = await prisma.videoProject.create({ data: { title: config.title || `Video ${new Date().toLocaleDateString()}`, sourceImages: images, config, status: 'processing', clubId } });
        const { triggerVideoGeneration } = await import('../services/kieService.js');
        const kieTask = await triggerVideoGeneration(project.id, images.map(i => i.url), config);
        await prisma.videoProject.update({ where: { id: project.id }, data: { kieJobId: kieTask.taskId } });
        res.status(201).json(project);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getVideoProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const projects = await prisma.videoProject.findMany({ where: clubId ? { clubId } : {}, orderBy: { createdAt: 'desc' } });
        res.json(projects);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const connectSocialAccount = async (req, res) => {
    try {
        const { platform, accountName, accessToken, refreshToken, expiresAt } = req.body;
        const account = await prisma.socialAccount.create({ data: { platform, accountName, accessToken, refreshToken, expiresAt: expiresAt ? new Date(expiresAt) : null, clubId: req.user.clubId } });
        res.status(201).json(account);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const getSocialAccounts = async (req, res) => {
    try {
        const accounts = await prisma.socialAccount.findMany({ where: { clubId: req.user.clubId } });
        res.json(accounts);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const schedulePost = async (req, res) => {
    try {
        const post = await prisma.scheduledPost.create({ data: { ...req.body, status: req.body.scheduledFor ? 'scheduled' : 'pending' } });
        res.status(201).json(post);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const getScheduledPosts = async (req, res) => {
    try {
        const posts = await prisma.scheduledPost.findMany({ include: { video: true, account: true }, orderBy: { createdAt: 'desc' } });
        res.json(posts);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const handleKieWebhook = async (req, res) => {
    try {
        const { task_id, status, output } = req.body;
        const project = await prisma.videoProject.findFirst({ where: { kieJobId: task_id } });
        if (!project) return res.status(404).json({ error: 'Not found' });
        await prisma.videoProject.update({ where: { id: project.id }, data: { status: status === 'COMPLETED' ? 'ready' : 'failed', videoUrl: output?.video_url } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const syncProjectStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await prisma.videoProject.findUnique({ where: { id } });
        const { checkTaskStatus } = await import('../services/kieService.js');
        const updatedStatus = await checkTaskStatus(project.kieJobId);
        const updated = await prisma.videoProject.update({ where: { id }, data: { status: updatedStatus.status, videoUrl: updatedStatus.videoUrl } });
        res.json(updated);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const deleteVideoProject = async (req, res) => {
    try {
        await prisma.videoProject.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const getOAuthUrl = async (req, res) => {
    try {
        const { platform } = req.params;
        const REDIRECT_URI = `${process.env.VITE_API_URL || 'https://app.clubplatform.org/api'}/social/callback/${platform}`;
        let url = '';
        if (platform === 'facebook' || platform === 'instagram') {
            url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID || '2190338908168499'}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,pages_manage_posts&response_type=code&state=${req.query.clubId}`;
        }
        res.redirect(url);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};
