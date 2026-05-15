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

// Build a SEEDED outpainting input: the original placed centered on a portrait canvas
// whose extension bands are pre-filled with a soft mirror reflection of the original's
// edges. This gives the AI a contextual draft to refine rather than empty transparent
// space — preventing the hallucination of institutional elements (flags, banners, logos)
// that gpt-image-1 tends to produce when asked to fill large blank areas in a "Rotary"
// photo. The accompanying mask still marks the bands as editable (transparent) so the AI
// refines the seeded content into a believable natural extension.
const buildSeededInputs = async (originalBuffer, targetW, targetH) => {
    const meta = await sharp(originalBuffer).metadata();
    const { placedW, placedH, top, left } = computePlacement(meta.width, meta.height, targetW, targetH);
    const bottomExt = targetH - top - placedH;
    const rightExt = targetW - left - placedW;

    const resizedOriginal = await sharp(originalBuffer)
        .resize(placedW, placedH, { fit: 'fill' })
        .png()
        .toBuffer();

    // Seed the bands with a mirror reflection of the original (sharp 'mirror' mode) and
    // apply a medium blur + slight desaturation. The mirror reflects whatever is at each
    // edge of the original outward: sky stays sky, walls stay walls, grass stays grass.
    // The blur removes the "exact reflection" feel so it reads as a natural soft extension.
    let seededFull;
    try {
        seededFull = await sharp(resizedOriginal)
            .extend({
                top,
                bottom: bottomExt,
                left,
                right: rightExt,
                extendWith: 'mirror'
            })
            .blur(25)
            .modulate({ saturation: 0.9, brightness: 0.98 })
            .png()
            .toBuffer();
    } catch (e) {
        // Fallback for older sharp versions without 'mirror' support: use edge copy.
        seededFull = await sharp(resizedOriginal)
            .extend({
                top,
                bottom: bottomExt,
                left,
                right: rightExt,
                extendWith: 'copy'
            })
            .blur(25)
            .png()
            .toBuffer();
    }

    // Place the SHARP (un-blurred) original on top so the center is identical to the input.
    const paddedImage = await sharp(seededFull)
        .composite([{ input: resizedOriginal, top, left }])
        .png()
        .toBuffer();

    // Mask: opaque (alpha=255) over the original area (preserve), transparent elsewhere
    // (AI may refine). OpenAI: "fully transparent areas indicate where the image should
    // be edited". The seeded content visible in the transparent areas guides the AI.
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
        resizedOriginal,
        layout: { placedW, placedH, top, left, targetW, targetH }
    };
};

// Build a strict outpainting prompt that tells the model to refine the SEEDED bands into
// a natural environmental extension, with an explicit blacklist of institutional elements
// (flags, banners, Rotary symbols, logos, signs, additional people) that gpt-image-1 tends
// to hallucinate when given a Rotary-themed photo.
const buildSeededOutpaintingPrompt = ({ targetFormat, visualPrompt }) => {
    const aspectLabel = targetFormat === 'landscape'
        ? 'landscape 3:2 (1536×1024)'
        : 'portrait 2:3 (1024×1536)';

    return [
        `Photographic extension task at ${aspectLabel} aspect ratio.`,
        '',
        'The unmasked center contains a real photograph. The transparent (masked) regions currently contain a SOFT MIRRORED DRAFT of the photograph\'s edges. Your job is to refine that draft into a believable natural extension of the original scene.',
        '',
        'CRITICAL — the extension must show ONLY the natural environment that lies just beyond the edges of the unmasked center:',
        '  • If the edge shows sky → continue with more sky of the same color and same cloud pattern',
        '  • If the edge shows trees or vegetation → continue with more of the same trees / canopy',
        '  • If the edge shows a wall, building or stone surface → continue the same architecture / texture',
        '  • If the edge shows ground (grass, sand, dirt, stone, tile, floor) → continue the same ground',
        '  • If the edge shows mountains or distant landscape → continue the same horizon',
        '',
        '⛔️ ABSOLUTELY FORBIDDEN in the extension areas — these caused failures in prior versions:',
        '  • NO flags, banners, pennants, standards, ensigns of any country, organisation or club',
        '  • NO Rotary logos, Rotary wheel symbols, Rotary banners, Rotary brand marks',
        '  • NO emblems, badges, crests, coats of arms of any kind',
        '  • NO text, signs, labels, posters, billboards, banners, watermarks, captions',
        '  • NO additional people, faces, hands, bodies, silhouettes — they already exist in the unmasked center',
        '  • NO new objects, props, items, equipment, decorations, instruments',
        '  • NO institutional or organisational elements of any kind',
        '  • NO duplication, mirror, tile or repetition of anything visible in the center',
        '  • NO blurred letterbox effect, NO out-of-focus background, NO gradient fade',
        '',
        'The extension must read as the SAME photograph captured by the SAME camera at the SAME moment, simply with a taller (or wider) frame. Match the original\'s color palette, lighting direction, depth of field, and grain exactly.',
        '',
        visualPrompt ? `Environment context (use ONLY for color / atmosphere matching, do NOT introduce any subjects from this description): ${visualPrompt}` : '',
        '',
        'Output: a single seamless natural photograph.'
    ].filter(Boolean).join('\n');
};

// Call gpt-image-1 /v1/images/edits with the seeded padded image + mask. The mask marks
// the extension bands as editable; the seeded content in those bands gives the model a
// contextual draft. input_fidelity:"high" keeps the model close to the seeded content,
// preventing hallucination of institutional elements while still letting it refine the
// soft mirror into a believable natural extension.
const generateSeededOutpainting = async ({ paddedImage, maskImage, prompt, width, height }) => {
    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('image', new Blob([paddedImage], { type: 'image/png' }), 'image.png');
    formData.append('mask', new Blob([maskImage], { type: 'image/png' }), 'mask.png');
    formData.append('prompt', prompt);
    formData.append('size', `${width}x${height}`);
    formData.append('quality', 'high');
    formData.append('input_fidelity', 'high');
    formData.append('n', '1');

    const resp = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData
    });

    const data = await resp.json();
    if (!resp.ok || !data?.data?.[0]?.b64_json) {
        const reason = data?.error?.message || `HTTP ${resp.status}`;
        throw new Error(`gpt-image-1 seeded outpainting failed: ${reason}`);
    }
    return Buffer.from(data.data[0].b64_json, 'base64');
};

// Compute the centered placement for the original inside the target canvas. The original
// keeps its aspect ratio and is scaled to fit horizontally or vertically (whichever leaves
// extension bands on the OTHER axis).
const computePlacement = (origW, origH, targetW, targetH) => {
    const origAspect = origW / origH;
    const targetAspect = targetW / targetH;

    let placedW, placedH;
    if (Math.abs(origAspect - targetAspect) < 0.04) {
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

    return { placedW, placedH, top, left };
};

// Apply a feathered alpha mask to the resized original so the seam between it and the
// AI-extended portrait fades over the configured radius. Center stays at alpha=255 (pixel-
// perfect identity for faces / banners / objects) — only the outermost ring gets alpha-
// blended for a clean seam with the AI's environmental extension.
const featherOriginal = async (resizedOriginal, featherPx = 80) => {
    const { data, info } = await sharp(resizedOriginal)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const feather = Math.min(featherPx, Math.floor(Math.min(width, height) / 2) - 1);
    for (let y = 0; y < height; y++) {
        const yDist = Math.min(y, height - 1 - y);
        for (let x = 0; x < width; x++) {
            const xDist = Math.min(x, width - 1 - x);
            const d = Math.min(xDist, yDist);
            if (d >= feather) continue;
            const alpha = Math.round((d / feather) * 255);
            const idx = (y * width + x) * channels;
            data[idx + 3] = alpha;
        }
    }
    return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
};

// Composite the original on top of the AI-regenerated portrait. This is the identity-lock
// step: the AI's regeneration of faces / banners / flags is completely hidden under the
// pixel-perfect original — only the AI's environmental extension (sky / ground / trees
// in the bands above and below) remains visible, blended at the seam by the feather.
const compositeOriginalOnAi = async (aiPortraitBuffer, originalBuffer, targetW, targetH) => {
    const meta = await sharp(originalBuffer).metadata();
    const { placedW, placedH, top, left } = computePlacement(meta.width, meta.height, targetW, targetH);

    const resizedOriginal = await sharp(originalBuffer)
        .resize(placedW, placedH, { fit: 'fill' })
        .ensureAlpha()
        .png()
        .toBuffer();

    const feathered = await featherOriginal(resizedOriginal, 80);

    return sharp(aiPortraitBuffer)
        .composite([{ input: feathered, top, left, blend: 'over' }])
        .png()
        .toBuffer();
};

// Pure-pixel fallback when the AI call fails: scale the original to fit the target canvas
// and center it on a neutral grey backdrop. Used only on hard errors / timeouts.
const buildFramedFallback = async (originalBuffer, targetW, targetH) => {
    const meta = await sharp(originalBuffer).metadata();
    const { placedW, placedH, top, left } = computePlacement(meta.width, meta.height, targetW, targetH);

    const resized = await sharp(originalBuffer)
        .resize(placedW, placedH, { fit: 'fill' })
        .png()
        .toBuffer();

    return sharp({
        create: { width: targetW, height: targetH, channels: 3, background: { r: 245, g: 245, b: 245 } }
    })
        .composite([{ input: resized, top, left }])
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
        console.log('--- START GENERATE POST (v4.324 — seeded outpainting (mirror+blur draft) + masked edit + identity composite) ---');
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

        // 3) Three-step image pipeline:
        //    (a) Build seeded inputs: place original centered on a portrait canvas whose
        //        bands are pre-filled with a soft mirror reflection of the original's
        //        edges. The mirror reflects edge content outward (sky → more sky, wall →
        //        more wall, ground → more ground) — giving the AI a contextual DRAFT
        //        instead of empty space. The mask still marks the bands as editable.
        //    (b) Call gpt-image-1 /v1/images/edits with the seeded canvas + mask +
        //        input_fidelity:"high". The model REFINES the mirrored draft into a
        //        believable natural extension. Because there is already content there,
        //        it does not hallucinate flags / banners / Rotary symbols (the failure
        //        mode of v4.322 / v4.323 maskless regeneration) and because the prompt
        //        explicitly forbids those elements.
        //    (c) Composite the pixel-perfect ORIGINAL on top with feather — guarantees
        //        identity preservation in the center regardless of what the AI did.
        const { width: targetW, height: targetH } = FORMAT_SIZES[targetFormat];

        let finalUrl = null;
        let usedEngine = 'gpt-image-1+seeded-mirror+masked-edit+identity-composite';
        let imageError = null;

        try {
            const { paddedImage, maskImage, resizedOriginal, layout } = await buildSeededInputs(
                enhancedBuffer,
                targetW,
                targetH
            );
            const prompt = buildSeededOutpaintingPrompt({ targetFormat, visualPrompt: parsed.visual_prompt });
            const aiBuffer = await generateSeededOutpainting({
                paddedImage,
                maskImage,
                prompt,
                width: targetW,
                height: targetH
            });
            const feathered = await featherOriginal(resizedOriginal, 80);
            const composed = await sharp(aiBuffer)
                .composite([{ input: feathered, top: layout.top, left: layout.left, blend: 'over' }])
                .png()
                .toBuffer();
            finalUrl = await uploadGeneratedImage({ buffer: composed, clubId, variant: targetFormat });
        } catch (e) {
            imageError = e.message;
            console.warn('[STUDIO] gpt-image-1 seeded outpainting failed, falling back to framed original:', e.message);
        }

        // Fallback: deliver the enhanced original framed against a neutral backdrop so
        // the user is never blocked when the AI call errors out.
        if (!finalUrl) {
            const framedFallback = await buildFramedFallback(enhancedBuffer, targetW, targetH);
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
