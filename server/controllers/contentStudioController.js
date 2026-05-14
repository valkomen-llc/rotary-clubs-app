import prisma from '../lib/prisma.js';

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST (V4.300 - ZERO ERROR ARCH) ---');
        const { imageUrl, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        if (!imageUrl) return res.status(400).json({ error: 'Falta la URL de la imagen.' });

        // 1. Lightning Optimization (Crucial for OpenAI Stability)
        let processedImage = imageUrl;
        try {
            const imgResponse = await fetch(imageUrl);
            if (imgResponse.ok) {
                const buffer = Buffer.from(await imgResponse.arrayBuffer());
                const sharp = (await import('sharp')).default;
                const resizedBuffer = await sharp(buffer)
                    .resize(800, null, { border: 0, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 70 })
                    .toBuffer();
                processedImage = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
                console.log('[STUDIO] Image optimized for AI analysis.');
            }
        } catch (err) { 
            console.warn('[STUDIO] Optimization skipped, using original URL:', err.message); 
        }

        // 2. Club Context
        let clubName = 'Club Rotario';
        if (clubId) {
            const club = await prisma.club.findUnique({ where: { id: clubId } });
            if (club) clubName = club.name;
        }

        // 3. Analysis with GPT-4o
        let parsed = { fb: "Post profesional", ig: "Post dinámico", tw: "Post corto", li: "Post institucional", visual_prompt: "Professional institutional scene" };
        try {
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
                            content: "Eres un director de arte de Rotary International. Especialista en OUTPAINTING."
                        },
                        {
                            role: "user",
                            content: [
                                { 
                                    type: "text", 
                                    text: `Analiza esta imagen para "${clubName}". Describe cómo REGENERAR la escena expandiendo el fondo arriba y abajo. JSON: { "fb":"", "ig":"", "tw":"", "li":"", "visual_prompt":"" }`
                                },
                                { type: "image_url", image_url: { "url": processedImage } }
                            ]
                        }
                    ],
                    temperature: 0.5,
                    max_tokens: 500
                })
            });

            const gptData = await gptResponse.json();
            const jsonMatch = gptData.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error('[STUDIO] GPT Analysis failed, using fallback text');
        }

        // 4. DALL-E 3 Generation (Resilient Dual-Pass)
        const isLandscape = config.format === '16:9';
        const dalleSize = isLandscape ? "1792x1024" : "1024x1792";
        const safePrompt = `Professional cinematic photography for Rotary International. CINEMATIC OUTPAINTING. ${parsed.visual_prompt}. Recreate full environment above and below. High definition, professional lighting. DO NOT CROP.`;

        let finalUrl = null;

        // Pass 1: Try HD
        try {
            const hdResponse = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "dall-e-3",
                    prompt: safePrompt,
                    n: 1,
                    size: dalleSize,
                    quality: "hd",
                    style: "vivid"
                })
            });
            const hdData = await hdResponse.json();
            finalUrl = hdData.data?.[0]?.url;
        } catch (e) { console.warn('HD Pass failed'); }

        // Pass 2: Try Standard (Emergency Fallback)
        if (!finalUrl) {
            try {
                const stdResponse = await fetch('https://api.openai.com/v1/images/generations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "dall-e-3",
                        prompt: safePrompt,
                        n: 1,
                        size: dalleSize,
                        quality: "standard"
                    })
                });
                const stdData = await stdResponse.json();
                finalUrl = stdData.data?.[0]?.url;
            } catch (e) { console.error('Standard Pass failed'); }
        }

        if (!finalUrl) {
            return res.status(500).json({ error: 'El motor de IA está saturado temporalmente. Por favor intenta de nuevo en 30 segundos.' });
        }

        res.json({
            success: true,
            content: {
                facebook: { copy: parsed.fb },
                instagram: { copy: parsed.ig },
                x: { copy: parsed.tw },
                linkedin: { copy: parsed.li }
            },
            generatedImageUrl: finalUrl,
            metadata: { engine: finalUrl.includes('hd') ? 'dalle-3-hd' : 'dalle-3-std' }
        });

    } catch (error) {
        res.status(500).json({ error: 'Error crítico de IA: ' + error.message });
    }
};

    } catch (error) {
        console.error('[STUDIO ERROR MASTER]:', error);
        res.status(500).json({ error: 'Fallo en regeneración HD: ' + error.message });
    }
};

export const downloadProxy = async (req, res) => {
    try {
        const { url } = req.query;
        const response = await fetch(url);
        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename=rotary-ai-post-${Date.now()}.png`);
        res.send(buffer);
    } catch (e) { res.status(500).send('Error'); }
};

// ... Rest of the controller ...
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
