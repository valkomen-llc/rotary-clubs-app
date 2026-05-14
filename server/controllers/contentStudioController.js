import prisma from '../lib/prisma.js';

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST (V4.297 - CINEMATIC HD MASTER) ---');
        const { imageId, imageUrl, config } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;

        if (!imageUrl) return res.status(400).json({ error: 'Falta la URL de la imagen.' });

        // 1. Club Context
        let clubName = 'Club Rotario';
        if (clubId) {
            const club = await prisma.club.findUnique({ where: { id: clubId } });
            if (club) clubName = club.name;
        }

        // 2. Analysis with GPT-4o (Visual Context Specialist)
        // We use the original URL to get the best quality description
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
                        content: "Eres un director de arte experto en Rotary International. Tu especialidad es describir escenas para REGENERACIÓN CINEMATOGRÁFICA (OUTPAINTING)."
                    },
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: `Analiza esta imagen institucional de "${clubName}".
                                Instrucción de Outpainting: Describe con extremo detalle lo que hay en la imagen (personas, ropa, entorno) y, lo más importante, IMAGINA y DESCRIBE qué habría arriba (cielo, techos, atmósfera) y abajo (suelo, césped, detalles del piso) para convertir esta foto en un formato VERTICAL 9:16 cinematográfico. 
                                NO menciones recortes. Enfócate en la CONTINUIDAD de la escena.
                                Devuelve JSON puro:
                                {
                                  "fb": "copy profesional", "ig": "copy con engagement", "tw": "copy corto", "li": "copy institucional", "visual_prompt": "descripción para DALL-E 3"
                                }`
                            },
                            { type: "image_url", image_url: { "url": imageUrl } }
                        ]
                    }
                ],
                temperature: 0.5
            })
        });

        const gptData = await gptResponse.json();
        if (!gptData.choices) throw new Error('Error en análisis de IA: ' + JSON.stringify(gptData));
        
        const jsonMatch = gptData.choices[0].message.content.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch[0]);

        // 3. DALL-E 3 Generation (Cinematic HD Outpainting)
        const isLandscape = config.format === '16:9';
        const dalleSize = isLandscape ? "1792x1024" : "1024x1792";
        
        console.log(`[STUDIO] Performing Master Regeneration (${dalleSize})...`);
        const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: `Institutional cinematic photography for Rotary International. HIGH-END REGENERATION. ${parsed.visual_prompt}. Recreate the full environment above and below to fit a perfect ${isLandscape ? 'Landscape' : 'Portrait'} 4K frame. Maintain the subjects and faces exactly as the original but expand the world around them with natural lighting and professional depth of field. DO NOT CROP. REGENERATE AND EXPAND. Style: Professional, vivid, ultra-realistic, clean, institutional.`,
                n: 1,
                size: dalleSize,
                quality: "hd",
                style: "vivid"
            })
        });

        const dalleData = await dalleResponse.json();
        const finalUrl = dalleData.data?.[0]?.url;

        if (!finalUrl) {
            console.error('[DALLE ERROR]', dalleData);
            throw new Error('El motor de regeneración HD está ocupado o falló. Por favor reintenta.');
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
                clubId, 
                engine: 'dalle-3-hd-master-outpainting', 
                quality: '4K-Cinematic',
                format: isLandscape ? '16:9' : '9:16'
            }
        });

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
