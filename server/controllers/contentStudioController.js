import prisma from '../lib/prisma.js';

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST (MULTI-ENGINE FALLBACK) ---');
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
        let club = null;
        if (clubId) {
            club = await prisma.club.findUnique({
                where: { id: clubId },
                include: { projects: { take: 2, orderBy: { createdAt: 'desc' } } }
            });
        }
        const clubName = club?.name || 'Club Rotario';

        if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Configuración: Falta API Key.' });

        // 3. Analysis with GPT-4o
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
                        content: "Eres un sistema de datos. Tu única función es devolver JSON puro con copies y descripción de imagen."
                    },
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: `Analiza esta imagen para el club "${clubName}".
                                Devuelve este formato JSON:
                                {
                                  "fb": "copy facebook",
                                  "ig": "copy instagram",
                                  "tw": "copy x",
                                  "desc": "descripcion para dall-e"
                                }`
                            },
                            { type: "image_url", image_url: { "url": processedImage } }
                        ]
                    }
                ],
                temperature: 0.1,
                max_tokens: 800
            })
        });

        const gptData = await gptResponse.json();
        if (!gptResponse.ok) return res.status(500).json({ error: `Análisis IA falló: ${gptData.error?.message}` });

        const rawContent = gptData.choices?.[0]?.message?.content;
        let parsed = null;
        try {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch[0]);
        } catch (e) { return res.status(500).json({ error: 'Fallo en el formato del análisis IA.' }); }

        // 4. Generation with DALL-E 3 (Primary) or DALL-E 2 (Fallback)
        let finalImageUrl = imageUrl;
        console.log('Attempting DALL-E 3...');
        
        let dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: `Professional photography for Rotary. VERTICAL PORTRAIT. ${parsed.desc}. Realistic, high fidelity.`,
                n: 1,
                size: "1024x1792",
                quality: "hd"
            })
        });

        let dalleData = await dalleResponse.json();

        // Check if DALL-E 3 failed due to "model does not exist" or permissions
        if (!dalleResponse.ok && (dalleData.error?.code === 'model_not_found' || dalleData.error?.message?.includes('dall-e-3'))) {
            console.warn('DALL-E 3 not available. Falling back to DALL-E 2...');
            dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "dall-e-2",
                    prompt: `Professional photography for Rotary. High quality. ${parsed.desc}`,
                    n: 1,
                    size: "1024x1024"
                })
            });
            dalleData = await dalleResponse.json();
        }

        if (dalleResponse.ok && dalleData.data?.[0]?.url) {
            finalImageUrl = dalleData.data[0].url;
        } else {
            console.error('All DALL-E models failed:', dalleData.error);
            // Non-fatal error for image, still return content
        }

        res.json({
            success: true,
            content: {
                facebook: { copy: parsed.fb, hashtags: '', cta: '' },
                instagram: { copy: parsed.ig, hashtags: '', cta: '' },
                x: { copy: parsed.tw, hashtags: '', cta: '' }
            },
            generatedImageUrl: finalImageUrl,
            metadata: { clubId, engine: dalleResponse.ok ? (dalleData.model || 'dall-e-2') : 'fallback-original' }
        });

    } catch (error) {
        res.status(500).json({ error: 'Error del sistema: ' + error.message });
    }
};

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
