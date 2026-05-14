import prisma from '../lib/prisma.js';

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST (V4.281 - TRUE OUTPAINTING) ---');
        const { imageId, imageUrl, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        if (!imageUrl) return res.status(400).json({ error: 'Falta la URL de la imagen.' });

        // 1. Optimized Image Processing
        let processedImage = imageUrl;
        try {
            const imgResponse = await fetch(imageUrl);
            if (imgResponse.ok) {
                const buffer = Buffer.from(await imgResponse.arrayBuffer());
                const sharp = (await import('sharp')).default;
                const resizedBuffer = await sharp(buffer)
                    .resize(800, null, { withoutEnlargement: true })
                    .jpeg({ quality: 60 })
                    .toBuffer();
                processedImage = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
            }
        } catch (err) { console.warn('Optimization skipped.'); }

        // 2. Club Context
        let club = await prisma.club.findUnique({
            where: { id: clubId || req.user.clubId },
            include: { projects: { take: 1, orderBy: { createdAt: 'desc' } } }
        });
        const clubName = club?.name || 'Club Rotario';

        // 3. AI Rules (Storytelling vs Standard)
        const postType = config.type || 'standard';
        const rules = `
        Reglas de Longitud y Tono (Tipo: ${postType}):
        - Facebook/Instagram/LinkedIn: Formato Portrait 4:5. Longitud: 150-300 caracteres.
        - X (Twitter): 100-140 caracteres.
        - LinkedIn: Enfoque corporativo y de impacto social.
        - IMPORTANTE: Evita el tono de "historia" o "reel". Genera contenido para el feed principal.
        `;

        if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Falta API Key.' });

        // 4. Analysis with GPT-4o (Focused on Outpainting instructions)
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
                        content: `Eres un experto en Imagen Pública de Rotary. Sigues estrictamente estas reglas: ${rules}`
                    },
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: `Analiza esta imagen para el club "${clubName}".
                                Instrucción de Outpainting: Describe cómo expandir esta foto horizontal para convertirla en una foto VERTICAL PORTRAIT. No recortes. Recrea el suelo, el cielo y los alrededores para completar el formato. Mantén la fidelidad de las personas.
                                Devuelve este JSON:
                                {
                                  "fb": "copy facebook",
                                  "ig": "copy instagram",
                                  "tw": "copy x",
                                  "li": "copy linkedin",
                                  "desc": "descripcion detallada para recreacion dall-e"
                                }`
                            },
                            { type: "image_url", image_url: { "url": processedImage } }
                        ]
                    }
                ],
                temperature: 0.2
            })
        });

        const gptData = await gptResponse.json();
        const rawContent = gptData.choices?.[0]?.message?.content;
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch[0]);

        // 5. Image Generation with RECREATION focus
        const isLandscape = config.format === '16:9';
        // For FB/IG/LI we use Square or 9:16 but prompt for 4:5 composition
        const dalleSize = isLandscape ? "1792x1024" : "1024x1024"; // Using Square for better 4:5 Portrait simulation if 1024x1792 is too tall
        
        const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: `Professional photography for Rotary feed. EXPANDED SCENE, OUTPAINTING. ${parsed.desc}. Recreate the environment above and below to fit a vertical frame. DO NOT CROP. High resolution, cinematic lighting.`,
                n: 1,
                size: dalleSize,
                quality: "hd"
            })
        });

        const dalleData = await dalleResponse.json();

        res.json({
            success: true,
            content: {
                facebook: { copy: parsed.fb },
                instagram: { copy: parsed.ig },
                x: { copy: parsed.tw },
                linkedin: { copy: parsed.li }
            },
            generatedImageUrl: dalleData.data?.[0]?.url || imageUrl,
            metadata: { clubId, format: config.format }
        });

    } catch (error) {
        res.status(500).json({ error: 'Error: ' + error.message });
    }
};

// NEW: Download Proxy to fix CORS issues
export const downloadProxy = async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).send('Falta URL');
        
        const response = await fetch(url);
        const buffer = Buffer.from(await response.arrayBuffer());
        
        res.setHeader('Content-Type', response.headers.get('Content-Type') || 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename=rotary-ai-post-${Date.now()}.png`);
        res.send(buffer);
    } catch (e) {
        res.status(500).send('Error en descarga');
    }
};

// ... Rest of the controller remains the same ...
export const createVideoProject = async (req, res) => {
    try {
        const { images, config } = req.body;
        const project = await prisma.videoProject.create({ data: { title: config.title || `Video ${new Date().toLocaleDateString()}`, sourceImages: images, config, status: 'processing', clubId: req.user.clubId } });
        const { triggerVideoGeneration } = await import('../services/kieService.js');
        const kieTask = await triggerVideoGeneration(project.id, images.map(i => i.url), config);
        await prisma.videoProject.update({ where: { id: project.id }, data: { kieJobId: kieTask.taskId } });
        res.status(201).json(project);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getVideoProjects = async (req, res) => {
    try {
        const projects = await prisma.videoProject.findMany({ where: { clubId: req.user.clubId }, orderBy: { createdAt: 'desc' } });
        res.json(projects);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
};

export const connectSocialAccount = async (req, res) => {
    try {
        const account = await prisma.socialAccount.create({ data: { ...req.body, clubId: req.user.clubId } });
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
