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
// Returns the resized original buffer plus the layout — no mask, since we no longer use
// the /edits endpoint (gpt-image-1 was ignoring the mask and duplicating subjects).
const buildLayout = async (originalBuffer, targetW, targetH) => {
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
        placedW = targetW;
        placedH = Math.round(targetW / origAspect);
    } else {
        placedH = targetH;
        placedW = Math.round(targetH * origAspect);
    }

    const top = Math.floor((targetH - placedH) / 2);
    const left = Math.floor((targetW - placedW) / 2);

    const resizedOriginal = await sharp(originalBuffer)
        .resize(placedW, placedH, { fit: 'fill' })
        .png()
        .toBuffer();

    return {
        resizedOriginal,
        layout: { origW, origH, placedW, placedH, top, left, targetW, targetH, hasBorders: placedW < targetW || placedH < targetH }
    };
};

// Build a CLEAN SCENE prompt for /v1/images/generations.
// We no longer use the edits endpoint with a mask because gpt-image-1 was ignoring the
// mask and "completing" the canvas with duplicated subjects and invented title text.
// Instead we ask the model to generate an EMPTY environmental backdrop sized to the
// target — and we then composite the real photograph on top of it ourselves with sharp.
const buildSceneGenPrompt = ({ visualPrompt, targetFormat }) => {
    const orientation = targetFormat === 'landscape' ? 'landscape (wider than tall)' : 'portrait (taller than wide)';
    return [
        `An empty environmental backdrop photograph in ${orientation} orientation, intended as a clean background onto which a real portrait will be composited.`,
        '',
        visualPrompt
            ? `Scene description: ${visualPrompt}`
            : 'Scene description: a calm, neutral indoor or outdoor environment with natural daylight and soft depth-of-field.',
        '',
        'STRICT CONTENT RULES — this image MUST contain ONLY:',
        '  • Sky, clouds, walls, ceilings, floors, ground, grass, stone, tile, carpet',
        '  • Plants, trees, distant scenery, gentle architectural elements',
        '  • Soft natural lighting, subtle depth-of-field, atmospheric quietness',
        '',
        'STRICT CONTENT RULES — this image MUST NOT contain:',
        '  • NO people, NO faces, NO bodies, NO hands, NO silhouettes, NO figures, NO crowds',
        '  • NO text, NO letters, NO words, NO numbers, NO captions, NO titles, NO subtitles, NO signs, NO labels, NO inscriptions, NO watermarks',
        '  • NO logos, NO Rotary wheel, NO emblems, NO banners, NO flags, NO institutional symbols, NO brand marks',
        '  • NO chairs, microphones, podiums, banners or props implying an event',
        '  • NO decorative frames, vignettes, color filters, gradients, lens flares, cinematic graphic overlays',
        '',
        'Style: naturalistic unedited amateur photography — NOT a polished stock photo. Soft atmospheric haze, real lighting, subtle imperfections, depth-of-field, ambient mood. The final result should feel like a casual photograph taken with a phone in the same moment and place where the portrait was originally captured. Calm. Quiet. Believable.'
    ].join('\n');
};

// Call /v1/images/generations with gpt-image-1 to produce a clean environmental scene
// at the requested size. No input image, no mask — pure text-to-image so the model has
// nothing to "complete" or duplicate from.
const generateCleanScene = async ({ prompt, width, height }) => {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-image-1',
            prompt,
            n: 1,
            size: `${width}x${height}`,
            quality: 'medium'
        })
    });

    const data = await resp.json();
    if (!resp.ok || !data?.data?.[0]?.b64_json) {
        const reason = data?.error?.message || `HTTP ${resp.status}`;
        throw new Error(`gpt-image-1 scene generation falló: ${reason}`);
    }
    return Buffer.from(data.data[0].b64_json, 'base64');
};

// Apply a feathered alpha mask to the resized original so the seam between original and
// generated scene fades over ~40px instead of being a hard horizontal line. Only the
// outermost band of the original is alpha-blended; the central 90%+ (where faces, banners
// and logos live) remains pixel-exact at alpha=255.
const featherOriginal = async (resizedOriginal) => {
    const FEATHER_PX = 40;
    const { data, info } = await sharp(resizedOriginal)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    // Loop over edge bands only (skip the interior for speed).
    const feather = Math.min(FEATHER_PX, Math.floor(Math.min(width, height) / 2) - 1);
    for (let y = 0; y < height; y++) {
        const yDist = Math.min(y, height - 1 - y);
        for (let x = 0; x < width; x++) {
            const xDist = Math.min(x, width - 1 - x);
            const d = Math.min(xDist, yDist);
            if (d >= feather) continue; // interior — leave alpha at 255
            const alpha = Math.round((d / feather) * 255);
            const idx = (y * width + x) * channels;
            data[idx + 3] = alpha;
        }
    }
    return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
};

// Composite the real photograph on top of the generated scene with feathered edges so
// the boundary blends smoothly instead of appearing as horizontal/vertical seams.
const compositeOriginalOnScene = async (sceneBuffer, resizedOriginal, layout) => {
    const feathered = await featherOriginal(resizedOriginal);
    return sharp(sceneBuffer)
        .composite([{ input: feathered, top: layout.top, left: layout.left, blend: 'over' }])
        .png()
        .toBuffer();
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
        console.log('--- START GENERATE POST (v4.316 — feathered composite + atmosphere-matched scene prompt) ---');
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

visual_prompt (en INGLÉS, 2-4 frases muy específicas): describe SOLAMENTE el entorno físico VACÍO de la foto, como si las personas no estuvieran. Incluí TODOS estos elementos con colores y matices precisos:
  - Cielo o techo (color exacto: ej "pale grey-blue with warm haze near the horizon, scattered cirrus clouds", NO "blue sky with clouds")
  - Piso/superficie (textura y color: ej "wet darker tan sand with visible footprints and scattered seaweed", NO "sandy beach")
  - Iluminación (dirección, calidez, intensidad: ej "soft morning sunlight from the upper right, slightly hazy, low-contrast")
  - Atmósfera general (humedad, polvo, niebla si aplica)
  - Distant background elements (vegetación, agua, paredes, ventanas)
NO menciones personas, rostros, ropa, banderas, logos, banners, texto, ni elementos institucionales. Esta descripción genera un escenario que debe MATCHEAR la atmósfera real de la foto para que el composite no se note. Ejemplo bueno: "Tropical beach in the early morning, wet darker tan sand with footprints and small debris, calm ocean horizon with low warm haze, pale grey-blue sky with thin streaky clouds, soft directional sunlight from the upper-left low in the sky, light coastal humidity in the air". Ejemplo malo: "Six people in blue Rotary shirts smiling at the camera".`
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

        // 3) Compute placement and resize the original to fit.
        const { width: targetW, height: targetH } = FORMAT_SIZES[targetFormat];
        const { resizedOriginal, layout } = await buildLayout(enhancedBuffer, targetW, targetH);

        let finalUrl = null;
        let usedEngine = 'scene-gen+composite';
        let imageError = null;

        // Path B: generate a CLEAN empty environmental scene at the target size, then
        // composite the real photograph on top. The AI never sees the original, so it
        // cannot duplicate the subjects or render invented title text.
        try {
            const scenePrompt = buildSceneGenPrompt({ visualPrompt: parsed.visual_prompt, targetFormat });
            const sceneBuffer = await generateCleanScene({ prompt: scenePrompt, width: targetW, height: targetH });
            const composed = await compositeOriginalOnScene(sceneBuffer, resizedOriginal, layout);
            finalUrl = await uploadGeneratedImage({ buffer: composed, clubId, variant: targetFormat });
        } catch (e) {
            imageError = e.message;
            console.warn('[STUDIO] Scene generation failed, falling back to framed original:', e.message);
        }

        // 4) Fallback: deliver the enhanced original framed against a neutral backdrop so
        //    the user is never blocked.
        if (!finalUrl) {
            const framedFallback = await sharp({
                create: { width: targetW, height: targetH, channels: 3, background: { r: 245, g: 245, b: 245 } }
            })
                .composite([{ input: resizedOriginal, top: layout.top, left: layout.left }])
                .png()
                .toBuffer();
            finalUrl = await uploadGeneratedImage({ buffer: framedFallback, clubId, variant: `${targetFormat}-fallback` });
            usedEngine = 'sharp-framed-only';
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
