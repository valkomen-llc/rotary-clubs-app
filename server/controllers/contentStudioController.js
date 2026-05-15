import prisma from '../lib/prisma.js';
import sharp from 'sharp';
import { s3 } from '../lib/storage.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const TYPE_PROMPTS = {
    standard: { tone: 'profesional, claro y directo', focus: 'el impacto de la actividad rotaria' },
    storytelling: { tone: 'narrativo, emotivo, cercano', focus: 'la historia humana detrás de la imagen' },
    fundraising: { tone: 'inspirador y persuasivo con un llamado claro a la acción', focus: 'la urgencia de la causa y cómo donar transforma vidas' },
    event: { tone: 'energético y convocante', focus: 'invitar a participar del evento, fecha y lugar' },
    project: { tone: 'profesional y orientado a resultados', focus: 'avances medibles y beneficio comunitario del proyecto' },
    membership: { tone: 'aspiracional y comunitario', focus: 'invitar a sumarse al club, valores de servicio y pertenencia' }
};

const INTEREST_AREAS = {
    general: 'Servir para Cambiar Vidas — impacto general de Rotary',
    peace: 'Promoción de la Paz y Prevención de Conflictos',
    disease: 'Lucha contra Enfermedades y salud comunitaria',
    water: 'Agua Limpia, Saneamiento e Higiene',
    environment: 'Protección del Medio Ambiente y sostenibilidad'
};

const PLATFORM_LIMITS = { facebook: 600, instagram: 2200, x: 280, linkedin: 1300 };

// Native gpt-image-1 sizes. We pick the closest aspect to the user's target.
const FORMAT_SIZES = {
    portrait: { width: 1024, height: 1536 },  // 2:3 — used for FB / IG / LinkedIn
    landscape: { width: 1536, height: 1024 }  // 3:2 — used for X / Twitter
};

const fetchImageBuffer = async (url) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No se pudo descargar la imagen (${resp.status})`);
    return Buffer.from(await resp.arrayBuffer());
};

// Enhance the original photo without touching identity:
// cinematic color, sharpening and modest contrast — pure pixel-space ops, zero AI drift.
const enhanceOriginal = async (buffer) => {
    return sharp(buffer)
        .removeAlpha()
        .modulate({ brightness: 1.03, saturation: 1.08 })
        .linear(1.05, -3) // mild contrast boost
        .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 })
        .toFormat('png')
        .toBuffer();
};

// Place the enhanced original centered on a target canvas, preserving its full content.
// Returns: { paddedImage, maskImage, layout } — image has the original centered with
// transparent borders; mask is opaque where original lives (preserve) and transparent
// everywhere else (AI will paint there).
const buildCanvasAndMask = async (originalBuffer, targetW, targetH) => {
    const meta = await sharp(originalBuffer).metadata();
    const origW = meta.width;
    const origH = meta.height;
    const origAspect = origW / origH;
    const targetAspect = targetW / targetH;

    let placedW, placedH;
    if (Math.abs(origAspect - targetAspect) < 0.04) {
        // Aspects are nearly identical — leave a small breathing border (~6%) so AI still
        // adds a fresh cinematic frame around the photo without touching the subjects.
        const scale = 0.94;
        if (origAspect > targetAspect) {
            placedW = Math.round(targetW * scale);
            placedH = Math.round(placedW / origAspect);
        } else {
            placedH = Math.round(targetH * scale);
            placedW = Math.round(placedH * origAspect);
        }
    } else if (origAspect > targetAspect) {
        // Original is wider than target → fit by width, AI paints top + bottom.
        placedW = targetW;
        placedH = Math.round(targetW / origAspect);
    } else {
        // Original is taller than target → fit by height, AI paints left + right.
        placedH = targetH;
        placedW = Math.round(targetH * origAspect);
    }

    const top = Math.floor((targetH - placedH) / 2);
    const left = Math.floor((targetW - placedW) / 2);

    const resized = await sharp(originalBuffer)
        .resize(placedW, placedH, { fit: 'fill' })
        .png()
        .toBuffer();

    const paddedImage = await sharp({
        create: {
            width: targetW,
            height: targetH,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite([{ input: resized, top, left }])
        .png()
        .toBuffer();

    // Mask: transparent everywhere (AI will edit), opaque white over the original (preserved).
    const opaqueRect = await sharp({
        create: {
            width: placedW,
            height: placedH,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    }).png().toBuffer();

    const maskImage = await sharp({
        create: {
            width: targetW,
            height: targetH,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite([{ input: opaqueRect, top, left }])
        .png()
        .toBuffer();

    return {
        paddedImage,
        maskImage,
        layout: { origW, origH, placedW, placedH, top, left, targetW, targetH, hasBorders: placedW < targetW || placedH < targetH }
    };
};

// Build a detailed prompt that tells gpt-image-1 to OUTPAINT only — never alter subjects.
const buildOutpaintingPrompt = ({ clubName, typeMeta, areaMeta, visualPrompt, layout }) => {
    const directions = [];
    if (layout.top > 0) directions.push(`above the subjects (top ${layout.top}px band)`);
    if ((layout.targetH - layout.top - layout.placedH) > 0) directions.push(`below the subjects (bottom band)`);
    if (layout.left > 0) directions.push(`to the left and right of the subjects (lateral bands)`);
    const directionStr = directions.length ? directions.join(', ') : 'around the subjects (frame border)';

    return [
        `Cinematic institutional photograph for Rotary International — ${clubName}.`,
        `Theme: ${areaMeta}. Visual tone: ${typeMeta.tone}.`,
        `STRICT OUTPAINTING TASK: extend the existing scene into the masked (transparent) areas: ${directionStr}.`,
        `ABSOLUTE PRESERVATION: the unmasked region contains real people, faces, hands, flags, banners, Rotary pins, official logos and text — do NOT regenerate, redraw, deform, restyle, replace or alter ANY of those elements in any way. Keep them pixel-identical.`,
        `Only invent and paint the masked transparent areas. Continue the floor/grass/ground naturally downward, extend the sky/ceiling/walls naturally upward, blend buildings, trees, atmosphere on the sides — whatever is contextually coherent with the existing scene.`,
        `Lighting, color palette, depth-of-field, grain and perspective must match the original photograph seamlessly.`,
        `Style: professional photojournalism, natural daylight or available light as in the original, vibrant but realistic colors, 8K detail, no text artifacts, no watermarks, no extra people, no extra logos.`,
        visualPrompt ? `Scene context: ${visualPrompt}.` : ''
    ].filter(Boolean).join(' ');
};

// Generate one image via gpt-image-1 edit endpoint (true masked outpainting).
const generateImageVariant = async ({ paddedImage, maskImage, width, height, prompt }) => {
    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('image', new Blob([paddedImage], { type: 'image/png' }), 'image.png');
    formData.append('mask', new Blob([maskImage], { type: 'image/png' }), 'mask.png');
    formData.append('prompt', prompt);
    formData.append('size', `${width}x${height}`);
    formData.append('quality', 'medium');
    formData.append('n', '1');

    const resp = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData
    });

    const data = await resp.json();
    if (!resp.ok || !data?.data?.[0]?.b64_json) {
        const reason = data?.error?.message || `HTTP ${resp.status}`;
        throw new Error(`gpt-image-1 falló: ${reason}`);
    }
    return Buffer.from(data.data[0].b64_json, 'base64');
};

const uploadGeneratedImage = async ({ buffer, clubId, variant }) => {
    const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
    const key = `clubs/${clubId || 'global'}/content-studio/ai-post-${Date.now()}-${variant}.png`;
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: 'image/png'
    }));
    const encodedKey = key.split('/').map(seg => encodeURIComponent(seg)).join('/');
    return `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;
};

export const generatePost = async (req, res) => {
    try {
        console.log('--- START GENERATE POST (v4.311 — hybrid pipeline: sharp enhance + gpt-image-1 outpainting) ---');
        const { imageUrl, config = {} } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;
        if (!imageUrl) return res.status(400).json({ error: 'Falta la URL de la imagen.' });

        const targetFormat = config.targetFormat === 'landscape' ? 'landscape' : 'portrait';
        const typeMeta = TYPE_PROMPTS[config.type] || TYPE_PROMPTS.standard;
        const areaMeta = INTEREST_AREAS[config.interestArea] || INTEREST_AREAS.general;

        let clubName = 'Club Rotario';
        if (clubId) {
            const club = await prisma.club.findUnique({ where: { id: clubId } });
            if (club?.name) clubName = club.name;
        }

        // 1) Fetch + enhance the original (no AI in this step — preserves identity 100%).
        const originalBuffer = await fetchImageBuffer(imageUrl);
        const enhancedBuffer = await enhanceOriginal(originalBuffer);

        // 2) GPT-4o copywriter + scene analyst (multimodal). Generates social copy + an
        //    English visual_prompt describing the surrounding scene for outpainting context.
        let parsed = {
            facebook: { copy: '', hashtags: '', cta: '' },
            instagram: { copy: '', hashtags: '', cta: '' },
            x: { copy: '', hashtags: '', cta: '' },
            linkedin: { copy: '', hashtags: '', cta: '' },
            visual_prompt: ''
        };
        try {
            const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    response_format: { type: 'json_object' },
                    temperature: 0.6,
                    max_tokens: 1400,
                    messages: [
                        {
                            role: 'system',
                            content: 'Eres director creativo de Rotary International. Escribes copies institucionales en español rioplatense/neutro, con voz humana, sin clichés, sin exclamaciones excesivas. Devuelves SIEMPRE JSON válido.'
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Imagen para el club: "${clubName}".
Tipo de publicación: ${config.type || 'standard'} — tono ${typeMeta.tone}, foco ${typeMeta.focus}.
Área de enfoque Rotary: ${areaMeta}.

Devuelve este JSON exacto:
{
  "facebook":  { "copy": "...", "hashtags": "#... #...", "cta": "..." },
  "instagram": { "copy": "...", "hashtags": "#... #...", "cta": "..." },
  "x":         { "copy": "...", "hashtags": "#... #...", "cta": "..." },
  "linkedin":  { "copy": "...", "hashtags": "#... #...", "cta": "..." },
  "visual_prompt": "..."
}

Reglas de copy:
- facebook hasta ~600 caracteres, instagram hasta ~2200, x máx 260 (deja aire para hashtags), linkedin hasta ~1300.
- Hashtags: 5-8 relevantes y específicos al área Rotary + club + temática (sin #rotaryclub genérico repetido en todas).
- CTA: una sola frase concreta y accionable (ej: "Sumate este sábado", "Doná en el link de la bio").
- No describas la imagen literalmente; conecta con el propósito y la comunidad.
- Sin emojis si es linkedin; máx 2 emojis sutiles en las otras.

visual_prompt (en INGLÉS, 1-3 frases): describe el ENTORNO alrededor de los sujetos (cielo, piso, paredes, ambiente, hora del día, paleta) — es contexto para extender el lienzo, NO redescribas a las personas.`
                                },
                                { type: 'image_url', image_url: { url: imageUrl } }
                            ]
                        }
                    ]
                })
            });
            const gptData = await gptResponse.json();
            const raw = gptData?.choices?.[0]?.message?.content;
            if (raw) {
                const parsedRaw = JSON.parse(raw);
                parsed = { ...parsed, ...parsedRaw };
            }
        } catch (e) {
            console.error('[STUDIO] GPT-4o copy/analysis failed:', e.message);
            // Continue with empty copy rather than failing the whole pipeline.
        }

        // 3) Build canvas + mask once, then run gpt-image-1 outpainting.
        const { width: targetW, height: targetH } = FORMAT_SIZES[targetFormat];
        const { paddedImage, maskImage, layout } = await buildCanvasAndMask(enhancedBuffer, targetW, targetH);
        const prompt = buildOutpaintingPrompt({ clubName, typeMeta, areaMeta, visualPrompt: parsed.visual_prompt, layout });

        let finalUrl = null;
        let usedEngine = 'gpt-image-1';
        let imageError = null;

        try {
            const buffer = await generateImageVariant({ paddedImage, maskImage, width: targetW, height: targetH, prompt });
            finalUrl = await uploadGeneratedImage({ buffer, clubId, variant: targetFormat });
        } catch (e) {
            imageError = e.message;
            console.warn('[STUDIO] gpt-image-1 failed, falling back to enhanced original:', e.message);
        }

        // 4) Fallback: deliver the enhanced original framed to target. No AI but still
        //    better quality than the input. The user is never blocked.
        if (!finalUrl) {
            finalUrl = await uploadGeneratedImage({ buffer: paddedImage, clubId, variant: `${targetFormat}-fallback` });
            usedEngine = 'sharp-enhanced-only';
        }

        res.json({
            success: true,
            content: {
                facebook: parsed.facebook,
                instagram: parsed.instagram,
                x: parsed.x,
                linkedin: parsed.linkedin
            },
            generatedImageUrl: finalUrl,
            metadata: {
                engine: usedEngine,
                format: targetFormat,
                dimensions: `${targetW}x${targetH}`,
                limits: PLATFORM_LIMITS,
                ...(imageError ? { imageError } : {})
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
