import prisma from '../lib/prisma.js';
import sharp from 'sharp';
import { s3 } from '../lib/storage.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createKieImageTask, pollKieImageTask, fetchKieImageBuffer } from '../services/kieService.js';
import { generateCopy, COPY_PROVIDERS, DEFAULT_COPY_PROVIDER, isProviderAvailable } from '../services/copywritingService.js';

// Multi-engine registry. Each entry maps the public engine id (used by the UI) to its
// implementation metadata. Phase 1 (v4.326): KIE.AI via Nano Banana + OpenAI gpt-image-1.
// Future phases will fill in flux_kontext, nano_banana (standalone), higgsfield.
const ENGINES = {
    kie: {
        label: 'KIE.AI · Nano Banana (Gemini 2.5 Flash Image)',
        engineKey: 'kie+nano-banana-edit',
        available: true
    },
    openai: {
        label: 'OpenAI · gpt-image-1 (experimental)',
        engineKey: 'gpt-image-1+i2i-direct',
        available: true
    },
    flux_kontext: { label: 'Flux Kontext', engineKey: 'flux-kontext', available: false },
    nano_banana: { label: 'Nano Banana (standalone)', engineKey: 'nano-banana-standalone', available: false },
    higgsfield: { label: 'Higgsfield', engineKey: 'higgsfield', available: false }
};
const DEFAULT_ENGINE = 'kie';

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

// Output dimensions per format.
//   portrait  → 4:5 (1080×1350)   FB / LinkedIn feed
//   instagram → 2:3 (1080×1620)   IG feed específicamente, más vertical (v4.381)
//   landscape → 3:2 (1536×1024)   X / Twitter
//
// IG acepta hasta 4:5 oficialmente, pero el equipo prefiere 2:3 (más alto sin
// llegar a 9:16 Stories) — más impacto visual en el feed sin entrar a Reels.
const FORMAT_SIZES = {
    portrait:  { width: 1080, height: 1350 },
    instagram: { width: 1080, height: 1620 },
    landscape: { width: 1536, height: 1024 }
};

// gpt-image-1 only supports three sizes (1024×1024 / 1024×1536 / 1536×1024).
// portrait  → 1024×1536 (2:3, cropeamos top/bottom para llegar a 4:5)
// instagram → 1024×1536 (¡es 2:3 exacto! sin crop, sólo resize → lossless)
// landscape → 1536×1024 (3:2 exacto)
const ENGINE_NATIVE_SIZES = {
    portrait:  '1024x1536',
    instagram: '1024x1536',
    landscape: '1536x1024'
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

// Build a simple, direct portrait/landscape conversion prompt — the same kind of prompt
// ChatGPT uses internally when asked "regenera esta foto en formato portrait". We keep
// it short and direct because gpt-image-1 in maskless image-to-image mode handles the
// composition / extension reasoning itself; complex prompts with long blacklists were
// counterproductive in prior versions (the model fixated on the listed elements).
const buildSimplePrompt = ({ targetFormat }) => {
    let aspectLabel, extendDirection;
    if (targetFormat === 'landscape') {
        aspectLabel = 'landscape 3:2 (1536×1024)';
        extendDirection = 'extending the side scenery (left and right) naturally outward';
    } else if (targetFormat === 'instagram') {
        aspectLabel = 'vertical portrait 2:3 (1080×1620)';
        extendDirection = 'extending the upper background (sky, treetops, ceiling) upward and the lower surface (ground, grass, floor) downward, with more vertical depth than a standard 4:5 portrait';
    } else {
        aspectLabel = 'portrait 4:5 (1080×1350)';
        extendDirection = 'extending the upper background (sky, treetops, ceiling) upward and the lower surface (ground, grass, floor) downward';
    }
    return `Regenerate this photograph in higher quality and convert it to ${aspectLabel} aspect ratio, ${extendDirection}. Preserve all the people in the original, their faces, expressions, clothing, flags, banners, signs and objects. The extension must read as the same scene captured by the same camera with a different frame. Output a single coherent natural photograph.`;
};

// Normalise the engine's output to the target dimensions. Most engines support
// a discrete set of aspect ratios that don't match 4:5 exactly, so we centre-crop
// & resize to the canonical FB/IG portrait size. This is geometry only — no
// composite / no mask / no blur — so it doesn't break the "no postprocess" rule.
const normaliseToTarget = async (buffer, { width, height }) => {
    return sharp(buffer)
        .resize(width, height, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();
};

// ENGINE: OpenAI gpt-image-1 (image-to-image, no mask).
// The model receives the original photo as a reference and regenerates it at the
// engine's nearest native size (1024x1536 for portrait, 1536x1024 for landscape).
// input_fidelity:"high" keeps people / faces close to the input. Output is then
// centre-cropped to the canonical 4:5 (1080×1350) — geometry only, no mask /
// composite / blur.
const generateWithOpenAI = async ({ originalBuffer, prompt, targetFormat }) => {
    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('image', new Blob([originalBuffer], { type: 'image/png' }), 'image.png');
    formData.append('prompt', prompt);
    formData.append('size', ENGINE_NATIVE_SIZES[targetFormat]);
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
        throw new Error(`gpt-image-1 regeneration failed: ${reason}`);
    }
    return Buffer.from(data.data[0].b64_json, 'base64');
};

// ENGINE: KIE.AI via the Nano Banana (Gemini 2.5 Flash Image) model.
// KIE.AI is a gateway over many image models; we pick `google/nano-banana-edit` because
// it specialises in identity-preserving edits / outpainting. The call is async: we submit
// the task, poll until completion (~30-60s typical), then download the produced image
// and return its buffer so the standard upload flow can place it in our S3 bucket.
const generateWithKie = async ({ imageUrl, prompt, targetFormat }) => {
    // Aspect ratio nativo según target. KIE Nano Banana acepta strings tipo
    // '4:5', '2:3', '3:2'. normaliseToTarget se encarga del fit final.
    const aspectRatio = targetFormat === 'landscape'
        ? '3:2'
        : targetFormat === 'instagram'
            ? '2:3'
            : '4:5';
    const taskId = await createKieImageTask({
        model: 'google/nano-banana-edit',
        prompt,
        imageUrl,
        aspectRatio,
        outputFormat: 'png'
    });
    console.log(`[STUDIO] KIE image task created: ${taskId} (nano-banana-edit, ${aspectRatio})`);
    const resultUrl = await pollKieImageTask(taskId, { maxWaitMs: 100_000, intervalMs: 3000 });
    console.log(`[STUDIO] KIE image ready: ${resultUrl}`);
    return fetchKieImageBuffer(resultUrl);
};

// Compute the centered placement for the original inside the target canvas. Used only by
// the framed fallback path now that the AI output is returned as-is.
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
        console.log('--- START GENERATE POST (v4.386 — Copy IA con reglas institucionales: nombre específico + normalización Rotary→Club Rotario + tiempo verbal según fecha) ---');
        const { imageUrl, config = {} } = req.body;
        const clubId = req.user.role === 'administrator' ? (req.body.clubId || req.user.clubId) : req.user.clubId;
        if (!imageUrl) return res.status(400).json({ error: 'Falta la URL de la imagen.' });

        const targetFormat = config.targetFormat === 'landscape' ? 'landscape' : 'portrait';
        const typeMeta = TYPE_PROMPTS[config.type] || TYPE_PROMPTS.standard;
        const areaMeta = INTEREST_AREAS[config.interestArea] || INTEREST_AREAS.general;

        // Resolve the engine: validate the requested id against the registry, fall back
        // to the default if missing or not yet available. Phase 1 only ships `kie` and
        // `openai`; other entries in ENGINES are placeholders for future phases.
        const requestedEngine = ENGINES[config.engine] && ENGINES[config.engine].available
            ? config.engine
            : DEFAULT_ENGINE;
        console.log(`[STUDIO] Engine resolved: ${requestedEngine} (${ENGINES[requestedEngine].label})`);

        // Resolve club identity. We need the full institutional context (name + category
        // + city) so the copy generator can: (a) always use the SPECIFIC club name
        // instead of a generic "El Club Rotario", and (b) normalize "Rotary X" → "Club
        // Rotario X" when the entity is actually a Club (category='club'). Other
        // categories (association, exchange_program, event, conference, project_fair,
        // foundation) keep their original wording because "Asociación Rotaria" /
        // "Programa de Intercambio Rotary" / "Fundación Rotaria" are valid as-is.
        let clubName = null;
        let clubCategory = null;
        let clubCity = null;
        if (clubId) {
            const club = await prisma.club.findUnique({
                where: { id: clubId },
                select: { name: true, category: true, city: true }
            });
            if (club?.name) {
                clubName = club.name;
                clubCategory = club.category || null;
                clubCity = club.city || null;
                // Normalización institucional: en clubes rotarios, "Rotary Bogotá Usaquén"
                // se escribe en español como "Club Rotario Bogotá Usaquén". Aplica solo
                // a category='club' para no corromper nombres de eventos, fundaciones, etc.
                if (clubCategory === 'club' && /^rotary\b/i.test(clubName)) {
                    clubName = `Club Rotario${clubName.slice('Rotary'.length)}`;
                }
            }
        }
        // Fallback solo si no hay club asociado en absoluto. NO genérico — pedimos al
        // modelo que evite frasear "El Club Rotario" si no hay nombre real disponible.
        const hasSpecificClubName = !!clubName;
        if (!clubName) clubName = 'Club Rotario';

        // Fecha actual en español, para que el modelo decida tiempo verbal correcto
        // cuando el contenido menciona eventos. Formato: "lunes 18 de mayo de 2026".
        const TODAY_ES = new Date().toLocaleDateString('es-ES', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

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
        let copyError = null;
        let copyProvider = null;
        let copyModel = null;
        try {
            // Resolve the copy provider: caller-supplied (config.copyEngine) or
            // platform default. The service handles fallback if the requested
            // one fails or has no env key configured.
            const requestedCopyEngine = config.copyEngine && COPY_PROVIDERS[config.copyEngine]
                ? config.copyEngine
                : DEFAULT_COPY_PROVIDER;

            const systemPrompt = `Eres director creativo de Rotary International. Escribes copies institucionales en español rioplatense/neutro, con voz humana, sin clichés, sin exclamaciones excesivas. Devuelves SIEMPRE JSON válido.

Reglas institucionales obligatorias (NO opcionales):

1. IDENTIDAD ESPECÍFICA DEL CLUB. Usás SIEMPRE el nombre institucional completo del club / entidad que se te indica. Nunca escribís frases genéricas como "El Club Rotario", "Nuestro Club Rotario" ni "Un Club Rotario" cuando hay un nombre concreto disponible. Ejemplo correcto: "El Club Rotario Bogotá Usaquén invita…". Ejemplo INCORRECTO: "El Club Rotario invita…".

2. NORMALIZACIÓN "ROTARY" → "CLUB ROTARIO" EN CLUBES. Cuando la entidad es un club (te lo indicamos en el prompt), si el nombre llega como "Rotary X" lo escribís en español como "Club Rotario X". Ej: "Rotary Bogotá Usaquén" → "Club Rotario Bogotá Usaquén". Esto NO aplica a asociaciones, fundaciones, programas de intercambio, eventos ni conferencias: esas entidades conservan su nombre original.

3. TIEMPO VERBAL SEGÚN FECHA. Te indicamos la fecha de hoy. Si el evento/contenido se refiere a una fecha pasada, usás tiempo verbal pasado y tono de agradecimiento / resumen ("Compartimos con orgullo lo vivido…", "Gracias a quienes participaron…"). Si la fecha es futura, usás lenguaje de invitación ("Te invitamos…", "Sumate…"). NUNCA invitás a un evento que ya ocurrió.

4. CONTEXTUALIZACIÓN AUTOMÁTICA. Inferís el sentido de la publicación combinando: nombre de la entidad + categoría + fecha actual + imagen + área de enfoque Rotary. El copy debe sentirse coherente con ese contexto real, no como texto genérico aplicable a cualquier club.

5. PRIORIDAD DE IDENTIDAD INSTITUCIONAL (en este orden): nombre oficial completo → contexto real (categoría, ciudad, área) → temporalidad correcta → lenguaje rotario auténtico → naturalidad humana. Si cualquiera de estos elementos entra en conflicto con un tono más "publicitario", priorizás la identidad institucional.`;

            const userPrompt = `Entidad: "${clubName}"${clubCategory ? ` (categoría: ${clubCategory})` : ''}${clubCity ? ` — ciudad: ${clubCity}` : ''}.
${hasSpecificClubName ? `Usá EXACTAMENTE este nombre cuando te refieras a la entidad. No uses "El Club Rotario" genérico.` : `No hay nombre específico — evitá nombrar al club; hablá en primera persona plural ("compartimos", "celebramos") sin inventar nombres.`}
Fecha de hoy: ${TODAY_ES}. Usala para decidir tiempo verbal (pasado vs futuro) si el contenido alude a un evento con fecha.
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
- CTA: una sola frase concreta y accionable (ej: "Sumate este sábado", "Doná en el link de la bio"). Si el evento ya pasó, el CTA debe ser de cierre/agradecimiento, NO de invitación.
- No describas la imagen literalmente; conecta con el propósito y la comunidad.
- Sin emojis si es linkedin; máx 2 emojis sutiles en las otras.

visual_prompt (en INGLÉS, 2-4 frases muy específicas): describe SOLAMENTE el entorno físico VACÍO de la foto, como si las personas no estuvieran. Incluí TODOS estos elementos con colores y matices precisos:
  - Cielo o techo (color exacto: ej "pale grey-blue with warm haze near the horizon, scattered cirrus clouds", NO "blue sky with clouds")
  - Piso/superficie (textura y color: ej "wet darker tan sand with visible footprints and scattered seaweed", NO "sandy beach")
  - Iluminación (dirección, calidez, intensidad: ej "soft morning sunlight from the upper right, slightly hazy, low-contrast")
  - Atmósfera general (humedad, polvo, niebla si aplica)
  - Distant background elements (vegetación, agua, paredes, ventanas)
NO menciones personas, rostros, ropa, banderas, logos, banners, texto, ni elementos institucionales.`;

            const result = await generateCopy({
                provider: requestedCopyEngine,
                system: systemPrompt,
                userText: userPrompt,
                imageUrl,
                temperature: typeof config.temperature === 'number' ? config.temperature : 0.6,
                // Generoso: 4 plataformas con copy + hashtags + cta + visual_prompt.
                // Gemini hardcaps a 4000 internamente; OpenAI y Anthropic usan este valor.
                maxTokens: 2400,
                jsonMode: true
                // Sin fallbackChain custom — usamos el default del service que prueba
                // requested → DEFAULT → todos los otros configurados como safety net.
            });
            copyProvider = result.provider;
            copyModel = result.model;
            try {
                const parsedRaw = JSON.parse(result.content);
                parsed = { ...parsed, ...parsedRaw };
            } catch (parseErr) {
                throw new Error(`${result.provider} (${result.model}) devolvió JSON inválido: ${parseErr.message}. Primeros 200 chars: ${result.content.slice(0, 200)}`);
            }
            console.log(`[STUDIO] Copy generado por ${result.provider} (${result.model})`);
        } catch (e) {
            copyError = e.message;
            console.error('[STUDIO] Copy generation failed:', e.message);
            // Continue with empty copy rather than failing the whole pipeline.
        }

        // 3) Image regeneration. Generamos los TRES formatos en paralelo:
        //    - portrait  (4:5)   FB + LinkedIn
        //    - instagram (2:3)   IG específicamente (más vertical, v4.381)
        //    - landscape (3:2)   X / Twitter
        //    El legacy `targetFormat` field se mantiene por compat — si se manda
        //    solo se genera ese formato.
        const VALID_FORMATS = ['portrait', 'instagram', 'landscape'];
        const requestedFormats = Array.isArray(config.formats) && config.formats.length
            ? config.formats.filter(f => VALID_FORMATS.includes(f))
            : VALID_FORMATS;
        // If the caller explicitly asked for a single format via `targetFormat`,
        // honour that. Otherwise default to both.
        const formatsToGenerate = requestedFormats;

        const generateOneFormat = async (format) => {
            const { width: w, height: h } = FORMAT_SIZES[format];
            const prompt = buildSimplePrompt({ targetFormat: format });
            try {
                let aiBuffer;
                if (requestedEngine === 'kie') {
                    aiBuffer = await generateWithKie({ imageUrl, prompt, targetFormat: format });
                } else if (requestedEngine === 'openai') {
                    aiBuffer = await generateWithOpenAI({
                        originalBuffer: enhancedBuffer,
                        prompt,
                        targetFormat: format
                    });
                } else {
                    throw new Error(`Engine '${requestedEngine}' marcado como available pero sin implementación`);
                }
                // Engines return whatever native aspect they support; centre-crop to the
                // canonical FB/IG dimensions before uploading. Geometry only — no AI,
                // no overlays, no masks. Preserves identity intact.
                aiBuffer = await normaliseToTarget(aiBuffer, { width: w, height: h });
                const url = await uploadGeneratedImage({ buffer: aiBuffer, clubId, variant: `${format}-${requestedEngine}` });
                return { format, url, engine: ENGINES[requestedEngine].engineKey, error: null, width: w, height: h };
            } catch (e) {
                console.warn(`[STUDIO] Engine '${requestedEngine}' falló para ${format}, fallback a framed original:`, e.message);
                try {
                    const framedFallback = await buildFramedFallback(enhancedBuffer, w, h);
                    const url = await uploadGeneratedImage({ buffer: framedFallback, clubId, variant: `${format}-fallback` });
                    return { format, url, engine: 'sharp-framed-only', error: e.message, width: w, height: h };
                } catch (fallbackErr) {
                    return { format, url: null, engine: null, error: `${e.message} | fallback: ${fallbackErr.message}`, width: w, height: h };
                }
            }
        };

        // Run all requested formats in parallel — both KIE.AI calls go out at the
        // same time, halving the wait compared to sequential generation.
        const formatResults = await Promise.all(formatsToGenerate.map(generateOneFormat));

        // Build the response: a map { portrait: {...}, landscape: {...} } plus
        // top-level legacy fields (generatedImageUrl, format, engine) pointing at
        // the primary format (the one the caller explicitly asked for, or portrait
        // by default) so existing frontend code keeps working unchanged.
        const primaryFormat = VALID_FORMATS.includes(config.targetFormat) ? config.targetFormat : 'portrait';
        const generatedImages = {};
        let imageError = null;
        let usedEngine = null;
        for (const r of formatResults) {
            if (r.url) {
                generatedImages[r.format] = {
                    url: r.url,
                    engine: r.engine,
                    dimensions: `${r.width}x${r.height}`,
                    error: r.error
                };
            }
            if (r.format === primaryFormat) {
                imageError = r.error;
                usedEngine = r.engine;
            }
        }
        const primary = generatedImages[primaryFormat] || generatedImages.portrait || generatedImages.instagram || generatedImages.landscape;
        const finalUrl = primary?.url || null;
        if (!usedEngine && primary?.engine) usedEngine = primary.engine;

        // ─── Autosave en la Biblioteca de Publicaciones (v4.345) ─────────────
        // Toda generación exitosa queda guardada como draft en SocialPublication
        // para historial / reuso / re-publicación, independientemente de si el
        // usuario después publica o no.
        //
        // Resolución del clubId para el draft (en orden de fallback):
        //   1) clubId resuelto por getCallerClubId (req.user.clubId o body.clubId)
        //   2) Si la imagen viene de la Library (req.body.imageId UUID), la
        //      clubId del Media row.
        //   3) Si el imageUrl es un path tipo "clubs/<uuid>/...", verificar
        //      que ese uuid sea un Club real y usarlo.
        //   4) Si todo falla, skipeamos el autosave silenciosamente — un system
        //      admin generando sin contexto de club no rompe el flujo.
        let draftId = null;
        let resolvedClubId = clubId;
        if (!resolvedClubId && req.body.imageId && req.body.imageId !== 'uploaded') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(req.body.imageId)) {
                try {
                    const m = await prisma.media.findUnique({ where: { id: req.body.imageId }, select: { clubId: true, sourceId: true, sourceType: true } });
                    if (m?.clubId) resolvedClubId = m.clubId;
                    else if (m?.sourceType === 'club' && m?.sourceId) resolvedClubId = m.sourceId;
                } catch { /* ignore */ }
            }
        }
        if (!resolvedClubId && imageUrl) {
            const pathMatch = imageUrl.match(/\/clubs\/([0-9a-f-]{36})\//i);
            if (pathMatch) {
                try {
                    const c = await prisma.club.findUnique({ where: { id: pathMatch[1] }, select: { id: true } });
                    if (c) resolvedClubId = c.id;
                } catch { /* ignore */ }
            }
        }

        if (finalUrl && resolvedClubId) {
            // Helper defensivo: si la columna imageUrlInstagram todavía no existe
            // en la DB (migración v4.381 pendiente), reintentamos sin ese campo
            // para no romper el autosave. La columna se agrega corriendo:
            //   ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "imageUrlInstagram" TEXT;
            const buildBaseDraftData = (includeInstagram) => ({
                clubId: resolvedClubId,
                userId: req.user.id || null,
                imageUrl: finalUrl,
                ...(includeInstagram ? { imageUrlInstagram: generatedImages.instagram?.url || null } : {}),
                imageUrlLandscape: generatedImages.landscape?.url || null,
                platformCopies: {
                    facebook: parsed.facebook,
                    instagram: parsed.instagram,
                    x: parsed.x,
                    linkedin: parsed.linkedin
                },
                targetAccounts: [], // se completa cuando el user publica/programa
                status: 'draft',
                sourceImageId: req.body.imageId && req.body.imageId !== 'uploaded' ? req.body.imageId : null,
                generatedBy: usedEngine ? `ai-${usedEngine.split('+')[0]}` : 'ai',
                aiModelImage: usedEngine,
                aiModelCopy: copyProvider && copyModel ? `${copyProvider}/${copyModel}` : null
            });
            try {
                let draft;
                try {
                    draft = await prisma.socialPublication.create({ data: buildBaseDraftData(true) });
                } catch (innerErr) {
                    if (/imageUrlInstagram|column .* does not exist|Unknown arg/i.test(innerErr.message)) {
                        console.warn('[STUDIO] Reintentando autosave SIN imageUrlInstagram — la migración SQL v4.381 está pendiente en la DB.');
                        draft = await prisma.socialPublication.create({ data: buildBaseDraftData(false) });
                    } else {
                        throw innerErr;
                    }
                }
                draftId = draft.id;
                console.log(`[STUDIO] Draft guardado en biblioteca: ${draftId} (club ${resolvedClubId})`);
            } catch (e) {
                console.warn('[STUDIO] No se pudo autoguardar el draft:', e.message);
            }
        } else if (finalUrl) {
            console.warn(`[STUDIO] Autosave skippeado: no se pudo resolver clubId para la imagen ${imageUrl}`);
        }

        res.json({
            success: true,
            content: {
                facebook: parsed.facebook,
                instagram: parsed.instagram,
                x: parsed.x,
                linkedin: parsed.linkedin
            },
            // Legacy: single primary image (kept for backward compat with older callers).
            generatedImageUrl: finalUrl,
            // New (v4.338+): all generated formats in a map.
            generatedImages,
            // New (v4.345): id del draft creado en la Biblioteca para que el
            // publish/schedule subsiguiente pueda referenciarlo en vez de
            // duplicar la row.
            publicationId: draftId,
            metadata: {
                engine: usedEngine,
                format: primaryFormat,
                formats: Object.keys(generatedImages),
                dimensions: primary ? `${primary.dimensions}` : null,
                limits: PLATFORM_LIMITS,
                copyProvider,
                copyModel,
                publicationId: draftId,
                ...(imageError ? { imageError } : {}),
                ...(copyError ? { copyError } : {})
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
