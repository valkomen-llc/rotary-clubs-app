import prisma from '../lib/prisma.js';

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST (V4.304 - TRUE OUTPAINTING) ---');
        const { imageUrl, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        if (!imageUrl) return res.status(400).json({ error: 'Falta la URL de la imagen.' });

        // 1. Club Context
        let clubName = 'Club Rotario';
        if (clubId) {
            const club = await prisma.club.findUnique({ where: { id: clubId } });
            if (club) clubName = club.name;
        }

        // 2. Analysis with GPT-4o (Digital Scenographer)
        // We force English output for the visual prompt to get 100% better DALL-E results
        let parsed = { fb: "", ig: "", tw: "", li: "", visual_prompt: "" };
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
                            content: "You are a professional Rotary International art director. You specialize in CINEMATIC OUTPAINTING descriptions."
                        },
                        {
                            role: "user",
                            content: [
                                { 
                                    type: "text", 
                                    text: `Analyze this image for "${clubName}". 
                                    INSTRUCTIONS:
                                    1. Write social media copies in Spanish (fb, ig, tw, li).
                                    2. Write a 'visual_prompt' in ENGLISH for DALL-E 3. 
                                    The prompt MUST describe how to EXTEND the canvas vertically (outpainting). 
                                    Describe the ceiling, sky, atmosphere for the top part and the ground/details for the bottom. 
                                    Ensure the center subjects are kept identical.
                                    Return PURE JSON: { "fb":"", "ig":"", "tw":"", "li":"", "visual_prompt":"" }`
                                },
                                { type: "image_url", image_url: { "url": imageUrl } }
                            ]
                        }
                    ],
                    temperature: 0.5,
                    max_tokens: 800
                })
            });

            const gptData = await gptResponse.json();
            const jsonMatch = gptData.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error('[STUDIO] GPT Analysis failed:', e.message);
            throw new Error('Fallo en el análisis de imagen. Por favor reintenta.');
        }

        // 3. DALL-E 3 Generation (True Cinematic Outpainting)
        const isLandscape = config.format === '16:9';
        const dalleSize = isLandscape ? "1792x1024" : "1024x1792";
        
        // Master Outpainting Prompt
        const masterPrompt = `Institutional cinematic photography for Rotary International. MASTER OUTPAINTING RECONSTRUCTION. ${parsed.visual_prompt}. Recreate and expand the full environment vertically to fit a perfect Portrait frame. Extend the top with natural sky/ceiling context and the bottom with realistic floor/ground details. Maintain original center subjects exactly as they are. Professional lighting, high definition, vivid colors, 8k resolution style. DO NOT CROP. REGENERATE MISSING AREAS.`;

        console.log(`[STUDIO] Requesting True Regeneration (${dalleSize})...`);
        const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: `VIVID CINEMATIC STYLE. Institutional photography for Rotary International. MASTER OUTPAINTING. ${parsed.visual_prompt}. Recreate and expand the scene vertically for a perfect Portrait frame. Extend top and bottom with realistic context. DO NOT CROP. High resolution, 8k professional detail.`,
                n: 1,
                size: dalleSize,
                quality: "hd"
            })
        });

        const dalleData = await dalleResponse.json();
        
        if (dalleData.error) {
            console.error('[DALLE ERROR]', dalleData.error);
            throw new Error(`OpenAI bloqueó la regeneración: ${dalleData.error.message}`);
        }

        const finalUrl = dalleData.data?.[0]?.url;

        if (!finalUrl) {
            throw new Error('No se pudo regenerar la imagen. El motor de IA no devolvió un resultado válido.');
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
            metadata: { 
                engine: 'dalle-3-hd-true-outpainting', 
                quality: '4K-Cinematic',
                format: isLandscape ? '16:9' : '9:16'
            }
        });

    } catch (error) {
        console.error('[CRITICAL STUDIO ERROR]:', error);
        res.status(500).json({ error: error.message });
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
