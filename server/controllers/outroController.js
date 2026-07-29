// ════════════════════════════════════════════════════════════════════
// Generador de Outros IA — controlador
// v4.647.0
//
// Crea cierres audiovisuales de ~5 segundos a partir de una imagen fija, con
// voz en off opcional, y los deja listos para colgarse al final de un Reel.
//
// FLUJO (asíncrono a propósito):
//
//   1. POST /outros        → valida la imagen, resuelve motor/formato/duración,
//                            crea la tarea en KIE y responde de inmediato.
//   2. GET  /outros/:id/sync → el navegador pregunta cada pocos segundos. Cuando
//                            KIE termina, ESTE paso descarga el archivo, lo mide,
//                            lo valida y lo sube a nuestro S3.
//   3. POST /outros/:id/library → el usuario aprueba y recién ahí aparece en la
//                            Biblioteca multimedia, en la carpeta "outros".
//
// Por qué asíncrono: un job de video en KIE tarda entre 1 y 3 minutos y la
// función de la API corta a los 120 s (vercel.json). Esperar dentro del request
// garantizaría un timeout. El webhook de KIE hace de segunda vía por si el
// navegador se cierra en el medio.
//
// Por qué el archivo se copia a S3: la URL que devuelve KIE es efímera. Si no se
// baja en el momento, el outro queda con un enlace muerto.
//
// REGLA DURABLE HEREDADA: el archivo que devuelve el modelo NO se postprocesa.
// No se recorta, no se recomprime, no se le pega nada encima. Lo que entrega el
// motor es lo que se guarda. Las mediciones de calidad son LECTURA, nunca
// modifican el archivo.
// ════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import db from '../lib/db.js';
import { ensureOutroSchema } from '../lib/ensureOutroSchema.js';
import {
    OUTRO_FORMATS, DEFAULT_FORMAT,
    OUTRO_ENGINES, DEFAULT_ENGINE, isEngineAvailable,
    OUTRO_STYLES, DEFAULT_STYLE,
    VOICE_LANGUAGES, VOICE_GENDERS, VOICE_PACES, VOICE_TONES, VOICE_VOLUMES, DEFAULT_VOICE,
    OUTRO_STATUSES, TARGET_DURATION_SEC, MAX_AUTO_RETRIES,
    resolveEngine, buildOutroPrompt, buildOutroTitle, checkSpeechFit, computeSpeechBudget, countWords
} from '../lib/outroSpec.js';
import { probeMp4, validateOutroFile, inspectSourceImage } from '../lib/outroQuality.js';
import { createKieVideoTask, getKieVideoTask, fetchKieVideoBuffer } from '../services/kieService.js';
import { generateCopy } from '../services/copywritingService.js';

export const OUTRO_MODULE_VERSION = '4.647.0';

console.log(`[outroController] v${OUTRO_MODULE_VERSION} cargado — Generador de Outros IA: cierres de ~5s desde una imagen, voz en off por audio nativo de Kling 2.6, validación de calidad y guardado en la Biblioteca`);

// ─── Utilidades ────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El super admin de la plataforma ve todo; cualquier otro rol queda acotado a su
// propio sitio. Mismo criterio que /api/media, para que la Biblioteca y este
// módulo muestren exactamente el mismo universo.
const scopeOf = (user) => {
    if (user?.role === 'administrator') return { all: true, clubId: user.clubId || null };
    return { all: false, clubId: user?.clubId || null };
};

const scopeClause = (user, startIndex = 1) => {
    const scope = scopeOf(user);
    if (scope.all) return { sql: '', params: [], next: startIndex };
    if (scope.clubId) return { sql: `"clubId" = $${startIndex}`, params: [scope.clubId], next: startIndex + 1 };
    return { sql: `"clubId" IS NULL`, params: [], next: startIndex };
};

const fetchOutro = async (id, user) => {
    const { sql, params } = scopeClause(user, 2);
    const where = sql ? `id = $1 AND ${sql}` : 'id = $1';
    const { rows } = await db.query(`SELECT * FROM "OutroProject" WHERE ${where}`, [id, ...params]);
    return rows[0] || null;
};

// Cliente S3 propio y perezoso. No se reutiliza el de lib/storage.js a propósito:
// aquel fija socketTimeout en 5 s, suficiente para una imagen pero corto para
// subir un MP4 de varios megas.
let _s3deps = null;
const getS3 = async () => {
    if (!_s3deps) {
        const aws = await import('@aws-sdk/client-s3');
        _s3deps = {
            s3: new aws.S3Client({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
                },
                maxAttempts: 3
            }),
            PutObjectCommand: aws.PutObjectCommand
        };
    }
    return _s3deps;
};

const slugify = (text, fallback = 'outro') => {
    const s = String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s.slice(0, 60) || fallback;
};

const publicUrlFor = (bucket, key) => {
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encoded}`;
};

// Normaliza lo que manda el navegador contra los catálogos. Nada de confiar en
// el cliente: si llega un estilo o un idioma que no existe, se usa el default.
const sanitizeVoice = (raw = {}) => ({
    enabled: Boolean(raw.enabled),
    language: VOICE_LANGUAGES[raw.language] ? raw.language : DEFAULT_VOICE.language,
    gender: VOICE_GENDERS[raw.gender] ? raw.gender : DEFAULT_VOICE.gender,
    pace: VOICE_PACES[raw.pace] ? raw.pace : DEFAULT_VOICE.pace,
    tone: VOICE_TONES[raw.tone] ? raw.tone : DEFAULT_VOICE.tone,
    volume: VOICE_VOLUMES[raw.volume] ? raw.volume : DEFAULT_VOICE.volume
});

const rowToDto = (row) => ({
    id: row.id,
    title: row.title,
    clubId: row.clubId,
    organizationName: row.organizationName,
    sourceImageUrl: row.sourceImageUrl,
    sourceMediaId: row.sourceMediaId,
    sourceReport: row.sourceReport,
    style: row.style,
    styleLabel: OUTRO_STYLES[row.style]?.label || row.style,
    format: row.format,
    speechText: row.speechText,
    speechUsed: row.speechUsed,
    voice: row.voice,
    config: row.config,
    engine: row.engine,
    engineLabel: OUTRO_ENGINES[row.engine]?.label || row.engine,
    engineModel: row.engineModel,
    prompt: row.prompt,
    kieJobId: row.kieJobId,
    status: row.status,
    statusLabel: OUTRO_STATUSES[row.status]?.label || row.status,
    statusDetail: row.statusDetail,
    attempts: row.attempts,
    videoUrl: row.videoUrl,
    durationSec: row.durationSec,
    width: row.width,
    height: row.height,
    bitrateKbps: row.bitrateKbps,
    sizeBytes: row.sizeBytes != null ? Number(row.sizeBytes) : null,
    hasAudio: row.hasAudio,
    quality: row.quality,
    creditsEstimated: row.creditsEstimated,
    mediaId: row.mediaId,
    parentId: row.parentId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
});

// ─── Consumo de créditos ───────────────────────────────────────────────────
//
// Es un medidor PROPIO, no el saldo real de KIE: la pasarela no expone el
// balance de forma estable, así que se contabiliza lo que cuesta cada motor
// según su declaración en el registro. Sirve para dos cosas concretas: ver el
// gasto del mes y frenar antes de dispararlo (OUTRO_MONTHLY_CREDIT_LIMIT).
const monthlyLimit = () => {
    const raw = Number(process.env.OUTRO_MONTHLY_CREDIT_LIMIT);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
};

const creditUsage = async (user) => {
    const { sql, params } = scopeClause(user, 1);
    const where = ['"createdAt" >= date_trunc(\'month\', CURRENT_DATE)'];
    if (sql) where.push(sql);
    const { rows } = await db.query(
        `SELECT COALESCE(SUM("creditsEstimated"), 0)::int AS spent, COUNT(*)::int AS generations
         FROM "OutroProject" WHERE ${where.join(' AND ')}`,
        params
    );
    const limit = monthlyLimit();
    const spent = rows[0]?.spent || 0;
    return {
        spent,
        generations: rows[0]?.generations || 0,
        limit,
        remaining: limit ? Math.max(0, limit - spent) : null,
        exceeded: Boolean(limit && spent >= limit)
    };
};

// ─── Catálogo para la UI ───────────────────────────────────────────────────

export const getOutroOptions = async (req, res) => {
    try {
        await ensureOutroSchema();
        const usage = await creditUsage(req.user);

        res.json({
            version: OUTRO_MODULE_VERSION,
            targetDurationSec: TARGET_DURATION_SEC,
            formats: Object.values(OUTRO_FORMATS),
            defaultFormat: DEFAULT_FORMAT,
            styles: Object.entries(OUTRO_STYLES).map(([id, s]) => ({ id, label: s.label, description: s.description })),
            defaultStyle: DEFAULT_STYLE,
            engines: Object.values(OUTRO_ENGINES).map(e => ({
                id: e.id, label: e.label, nativeAudio: e.nativeAudio,
                durations: e.durations, aspectRatios: e.aspectRatios, resolutions: e.resolutions,
                creditEstimate: e.creditEstimate,
                creditEstimateAudio: e.creditEstimateAudio || e.creditEstimate,
                note: e.note,
                available: isEngineAvailable(e.id),
                isDefault: e.id === DEFAULT_ENGINE
            })),
            voice: {
                languages: Object.entries(VOICE_LANGUAGES).map(([id, v]) => ({ id, label: v.label })),
                genders: Object.entries(VOICE_GENDERS).map(([id, v]) => ({ id, label: v.label })),
                paces: Object.entries(VOICE_PACES).map(([id, v]) => ({ id, label: v.label })),
                tones: Object.entries(VOICE_TONES).map(([id, v]) => ({ id, label: v.label })),
                volumes: Object.entries(VOICE_VOLUMES).map(([id, v]) => ({ id, label: v.label })),
                defaults: DEFAULT_VOICE
            },
            statuses: Object.entries(OUTRO_STATUSES).map(([id, s]) => ({ id, ...s })),
            credits: usage,
            providerConfigured: Boolean(process.env.KIE_API_KEY)
        });
    } catch (e) {
        console.error('[OUTRO] options:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Comprobación previa ───────────────────────────────────────────────────
//
// Se llama al elegir la imagen, antes de gastar créditos: mide la imagen y
// devuelve el presupuesto de palabras para la duración real del motor que se
// va a usar. Así el aviso de "el texto no cabe" aparece mientras se escribe.

export const preflightOutro = async (req, res) => {
    try {
        const { imageUrl, format = DEFAULT_FORMAT, engine, voice = {}, speechText = '' } = req.body || {};
        if (!imageUrl) return res.status(400).json({ error: 'Falta la imagen de origen' });

        const cleanVoice = sanitizeVoice(voice);
        const plan = resolveEngine({ engine, voiceEnabled: cleanVoice.enabled, format });

        let sourceReport = null;
        try {
            const resp = await fetch(imageUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buffer = Buffer.from(await resp.arrayBuffer());
            sourceReport = await inspectSourceImage(buffer, { format: plan.format });
        } catch (e) {
            sourceReport = { ok: true, warnings: [`No se pudo leer la imagen para analizarla: ${e.message}`] };
        }

        const fit = checkSpeechFit(speechText, {
            durationSec: plan.durationSec,
            language: cleanVoice.language,
            pace: cleanVoice.pace
        });

        res.json({
            engine: { id: plan.engineId, label: plan.engine.label, nativeAudio: plan.engine.nativeAudio },
            format: plan.format,
            durationSec: plan.durationSec,
            resolution: plan.resolution,
            master: OUTRO_FORMATS[plan.format].master,
            voiceEnabled: plan.voiceEnabled,
            notes: plan.notes,
            sourceReport,
            speech: fit,
            creditEstimate: plan.creditEstimate
        });
    } catch (e) {
        console.error('[OUTRO] preflight:', e);
        res.status(500).json({ error: e.message });
    }
};

// Resume el texto con IA para que quepa en la duración disponible. Se ofrece
// cuando `checkSpeechFit` dice que no cabe; nunca se aplica solo.
export const summarizeOutroSpeech = async (req, res) => {
    try {
        const { text, voice = {}, format = DEFAULT_FORMAT, engine } = req.body || {};
        if (!text || !String(text).trim()) return res.status(400).json({ error: 'Falta el texto a resumir' });

        const cleanVoice = sanitizeVoice({ ...voice, enabled: true });
        const plan = resolveEngine({ engine, voiceEnabled: true, format });
        const budget = computeSpeechBudget({
            durationSec: plan.durationSec,
            language: cleanVoice.language,
            pace: cleanVoice.pace
        });
        const langLabel = VOICE_LANGUAGES[cleanVoice.language].label;

        const system = `Eres un redactor de cierres institucionales para video. Devuelves EXCLUSIVAMENTE la frase final, sin comillas, sin explicaciones y sin emojis.`;
        const userText = `Reescribe este mensaje de cierre para que se pueda locutar en ${budget.availableSec} segundos.
Idioma: ${langLabel}.
Máximo ABSOLUTO: ${budget.maxWords} palabras.
Conserva el nombre propio de la organización si aparece. Tono institucional, natural al oído, terminado con punto.

Mensaje original:
${text}`;

        const result = await generateCopy({ system, userText, temperature: 0.4, maxTokens: 200 });
        let summary = String(result.content || '').trim().replace(/^["'«»]+|["'«»]+$/g, '');

        // Red de seguridad: si el modelo se pasa igual, se recorta por palabras.
        if (countWords(summary) > budget.maxWords) {
            summary = summary.split(/\s+/).slice(0, budget.maxWords).join(' ').replace(/[,;:]$/, '') + '.';
        }

        res.json({
            summary,
            provider: result.provider,
            fit: checkSpeechFit(summary, { durationSec: plan.durationSec, language: cleanVoice.language, pace: cleanVoice.pace })
        });
    } catch (e) {
        console.error('[OUTRO] summarize:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Creación ──────────────────────────────────────────────────────────────

// Créditos que cuesta UN intento de esta fila. El audio nativo se cobra aparte,
// así que un outro con locución suma más por reintento que uno silencioso.
const attemptCredits = (row) => {
    const engine = OUTRO_ENGINES[row.engine] || OUTRO_ENGINES[DEFAULT_ENGINE];
    if (!engine) return 0;
    return (row.config?.voiceEnabled && row.speechUsed)
        ? (engine.creditEstimateAudio || engine.creditEstimate)
        : engine.creditEstimate;
};

// Lanza la tarea en KIE y deja la fila en `generating`. No espera el resultado.
const dispatchGeneration = async (row) => {
    const engine = OUTRO_ENGINES[row.engine] || OUTRO_ENGINES[DEFAULT_ENGINE];
    const durationSec = row.config?.durationSec || TARGET_DURATION_SEC;
    const withAudio = Boolean(row.config?.voiceEnabled && row.speechUsed);

    const prompt = buildOutroPrompt({
        style: row.style,
        durationSec,
        speech: row.speechUsed,
        voice: row.voice,
        withAudio
    });

    // El modelo se fijó al crear la fila (`engineModel`): puede diferir del
    // silencioso si el outro lleva voz o si el entorno lo redefinió. Recalcularlo
    // acá haría que un reintento se fuera a un modelo distinto del que se cobró.
    const model = row.engineModel || engine.model;

    const taskId = await createKieVideoTask({
        model,
        prompt,
        imageUrl: row.sourceImageUrl,
        aspectRatio: row.format,
        duration: durationSec,
        resolution: row.config?.resolution === '4k' ? '4k' : '1080p',
        enableAudio: withAudio,
        callBackUrl: `${process.env.APP_URL || 'https://app.clubplatform.org'}/api/content-studio/webhook`,
        metadata: { outroId: row.id, kind: 'outro' }
    });

    // `statusDetail` NO se toca acá: quien llama ya decidió qué debe decir. En un
    // reintento automático lleva el motivo del fallo anterior, y esa es
    // justamente la información que el usuario necesita ver mientras se
    // regenera. Los reintentos manuales lo limpian antes de llegar acá.
    const { rows } = await db.query(
        `UPDATE "OutroProject"
         SET "kieJobId" = $2, prompt = $3, "engineModel" = $4, status = 'generating', "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [row.id, taskId, prompt, model]
    );
    return rows[0];
};

export const createOutro = async (req, res) => {
    try {
        await ensureOutroSchema();

        const {
            imageUrl, imageMediaId = null,
            speechText = '', organizationName = '',
            style = DEFAULT_STYLE, format = DEFAULT_FORMAT,
            engine, voice = {}, title = null, clubId = null
        } = req.body || {};

        if (!imageUrl) return res.status(400).json({ error: 'Falta la imagen de origen del outro' });
        if (!process.env.KIE_API_KEY) return res.status(503).json({ error: 'El motor de video no está configurado (KIE_API_KEY)' });

        const usage = await creditUsage(req.user);
        if (usage.exceeded) {
            return res.status(429).json({
                error: `Se alcanzó el tope de consumo del mes (${usage.spent}/${usage.limit} créditos estimados).`,
                credits: usage
            });
        }

        const cleanStyle = OUTRO_STYLES[style] ? style : DEFAULT_STYLE;
        const cleanVoice = sanitizeVoice(voice);
        const plan = resolveEngine({ engine, voiceEnabled: cleanVoice.enabled, format });

        // La locución se corta por presupuesto de palabras, no por caracteres: es
        // lo que determina si entra en la duración del clip. Si no entra, se
        // rechaza con el dato exacto para que la UI ofrezca el resumen con IA.
        let speechUsed = null;
        if (plan.voiceEnabled) {
            const text = String(speechText || '').trim();
            if (!text) return res.status(400).json({ error: 'Activaste la voz en off pero no escribiste el texto a pronunciar' });
            const fit = checkSpeechFit(text, {
                durationSec: plan.durationSec,
                language: cleanVoice.language,
                pace: cleanVoice.pace
            });
            if (!fit.fits) {
                return res.status(400).json({
                    error: `El texto no cabe en ${plan.durationSec} segundos: ${fit.words} palabras y caben ${fit.maxWords}.`,
                    speech: fit,
                    needsSummary: true
                });
            }
            speechUsed = text;
        }

        // El club de destino: un super admin puede generar para cualquier sitio;
        // el resto queda atado al suyo.
        const requestedClub = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;
        const targetClubId = requestedClub && UUID_RE.test(requestedClub) ? requestedClub : null;

        // Medición de la imagen de origen. No bloquea: los avisos viajan con el
        // outro para que se vean junto al resultado.
        let sourceReport = null;
        try {
            const resp = await fetch(imageUrl);
            if (resp.ok) {
                sourceReport = await inspectSourceImage(Buffer.from(await resp.arrayBuffer()), { format: plan.format });
            }
        } catch { /* la imagen se valida igual del lado del proveedor */ }

        const id = randomUUID();
        const finalTitle = title?.trim() || buildOutroTitle({ organizationName, style: cleanStyle, format: plan.format });

        const config = {
            durationSec: plan.durationSec,
            resolution: plan.resolution,
            master: OUTRO_FORMATS[plan.format].master,
            voiceEnabled: plan.voiceEnabled,
            requestedFormat: format,
            requestedEngine: engine || null,
            notes: plan.notes
        };

        const { rows } = await db.query(
            `INSERT INTO "OutroProject"
             (id, title, "clubId", "userId", "userEmail", "organizationName",
              "sourceImageUrl", "sourceMediaId", "sourceReport",
              style, format, "speechText", "speechUsed", voice, config,
              engine, "engineModel", status, "creditsEstimated", version)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pending',$18,$19)
             RETURNING *`,
            [
                id, finalTitle, targetClubId, req.user.id || null, req.user.email || null,
                organizationName || null, imageUrl, imageMediaId, JSON.stringify(sourceReport),
                cleanStyle, plan.format, speechText || null, speechUsed,
                JSON.stringify(cleanVoice), JSON.stringify(config),
                plan.engineId, plan.model, plan.creditEstimate, OUTRO_MODULE_VERSION
            ]
        );

        let row = rows[0];
        try {
            row = await dispatchGeneration(row);
        } catch (e) {
            const { rows: failed } = await db.query(
                `UPDATE "OutroProject" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW()
                 WHERE id = $1 RETURNING *`,
                [id, e.message]
            );
            return res.status(502).json({ ...rowToDto(failed[0]), error: e.message });
        }

        res.status(201).json({ ...rowToDto(row), notes: plan.notes, credits: await creditUsage(req.user) });
    } catch (e) {
        console.error('[OUTRO] create:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Sincronización, descarga y validación ─────────────────────────────────

// Baja el archivo de KIE, lo mide, lo valida y lo sube a nuestro bucket.
// Es el único punto donde un outro pasa a `ready` o a `needs_review`.
const ingestFinishedVideo = async (row, providerUrl) => {
    // La pantalla sondea cada 6 s y el webhook de KIE puede llegar en el medio,
    // así que dos peticiones pueden ver "success" a la vez. Este UPDATE
    // condicional es el que decide cuál de las dos hace el trabajo: la que no
    // logra pasar la fila a `validating` se va sin descargar ni subir nada.
    //
    // La ventana de 5 minutos es la salida de emergencia: si la petición que
    // reclamó la fila muere a mitad de camino (timeout de la función), el outro
    // no queda atrapado en `validating` para siempre.
    const { rows: claimed } = await db.query(
        `UPDATE "OutroProject"
         SET status = 'validating', "providerUrl" = $2, "updatedAt" = NOW()
         WHERE id = $1
           AND (status <> 'validating' OR "updatedAt" < NOW() - INTERVAL '5 minutes')
         RETURNING id`,
        [row.id, providerUrl]
    );
    if (claimed.length === 0) {
        const { rows: current } = await db.query('SELECT * FROM "OutroProject" WHERE id = $1', [row.id]);
        return current[0] || row;
    }

    const buffer = await fetchKieVideoBuffer(providerUrl);

    // Medición sobre el archivo real. Lectura pura: el buffer que se sube es
    // exactamente el que llegó.
    const probe = probeMp4(buffer);
    const quality = validateOutroFile(probe, {
        format: row.format,
        expectedDurationSec: row.config?.durationSec || TARGET_DURATION_SEC,
        expectVoice: Boolean(row.config?.voiceEnabled && row.speechUsed)
    });

    const { s3, PutObjectCommand } = await getS3();
    const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
    const key = `clubs/${row.clubId || 'global'}/outros/${Date.now()}-${slugify(row.title)}.mp4`;
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: 'video/mp4',
        CacheControl: 'public, max-age=31536000'
    }));
    const videoUrl = publicUrlFor(bucket, key);

    const { rows } = await db.query(
        `UPDATE "OutroProject"
         SET status = $2, "statusDetail" = $3, "videoUrl" = $4, "s3Key" = $5,
             "durationSec" = $6, width = $7, height = $8, "bitrateKbps" = $9,
             "sizeBytes" = $10, "hasAudio" = $11, quality = $12, "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [
            row.id, quality.verdict,
            quality.failures.length ? quality.failures.join(' · ') : null,
            videoUrl, key,
            probe.durationSec, probe.width, probe.height, probe.bitrateKbps,
            probe.sizeBytes, probe.hasAudio, JSON.stringify(quality)
        ]
    );

    console.log(`[OUTRO] ${row.id} → ${quality.verdict} (${probe.width}×${probe.height}, ${probe.durationSec}s, ${probe.bitrateKbps} kbps, audio=${probe.hasAudio})`);
    return rows[0];
};

// Reintento: crea una tarea nueva conservando la configuración. `auto` distingue
// los reintentos automáticos (tras un fallo del proveedor) de los que pide el
// usuario, que no consumen el cupo de automáticos.
const relaunch = async (row, { auto = false, reason = null } = {}) => {
    const { rows } = await db.query(
        `UPDATE "OutroProject"
         SET attempts = attempts + 1, status = 'pending',
             "statusDetail" = $2, "creditsEstimated" = "creditsEstimated" + $3, "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [row.id, auto ? `Reintento automático tras: ${reason}` : null, attemptCredits(row)]
    );
    return dispatchGeneration(rows[0]);
};

// Avanza el estado consultando a KIE. Idempotente: si el outro ya terminó,
// devuelve la fila sin volver a llamar al proveedor.
const advance = async (row) => {
    if (OUTRO_STATUSES[row.status]?.terminal) return row;
    if (!row.kieJobId) return row;

    const task = await getKieVideoTask(row.kieJobId);

    if (task.state === 'success') {
        try {
            return await ingestFinishedVideo(row, task.videoUrl);
        } catch (e) {
            // El video existe en KIE pero no se pudo guardar (fallo de red o de
            // S3). Se anota el motivo y se deja la fila en `validating`: cuando
            // venza la ventana de 5 minutos, el siguiente sondeo lo reintenta.
            // `updatedAt` NO se toca a propósito, para no correr esa ventana.
            console.error(`[OUTRO] ${row.id} no se pudo guardar:`, e.message);
            await db.query('UPDATE "OutroProject" SET "statusDetail" = $2 WHERE id = $1',
                [row.id, `No se pudo guardar el archivo generado: ${e.message}`]);
            throw e;
        }
    }

    if (task.state === 'failed') {
        if (row.attempts < MAX_AUTO_RETRIES) {
            console.warn(`[OUTRO] ${row.id} falló (${task.failMsg}). Reintento ${row.attempts + 1}/${MAX_AUTO_RETRIES}.`);
            try {
                return await relaunch(row, { auto: true, reason: task.failMsg });
            } catch (e) {
                const { rows } = await db.query(
                    `UPDATE "OutroProject" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
                    [row.id, `${task.failMsg} — el reintento tampoco pudo lanzarse: ${e.message}`]
                );
                return rows[0];
            }
        }
        const { rows } = await db.query(
            `UPDATE "OutroProject" SET status = 'error', "statusDetail" = $2, "kieRaw" = $3, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [row.id, task.failMsg, JSON.stringify(task.raw || null)]
        );
        return rows[0];
    }

    const nextStatus = task.state === 'queued' ? 'generating' : 'rendering';
    if (nextStatus === row.status) return row;
    const { rows } = await db.query(
        `UPDATE "OutroProject" SET status = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
        [row.id, nextStatus]
    );
    return rows[0];
};

export const syncOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const row = await fetchOutro(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Outro no encontrado' });
        const updated = await advance(row);
        res.json(rowToDto(updated));
    } catch (e) {
        console.error('[OUTRO] sync:', e);
        // Un fallo de red al consultar no debe marcar el outro como perdido: se
        // informa y el siguiente sondeo lo vuelve a intentar.
        res.status(502).json({ error: e.message });
    }
};

// Segunda vía: KIE avisa por webhook. Se llama desde handleKieWebhook cuando el
// task_id no corresponde a un VideoProject.
export const handleOutroWebhook = async (taskId, payload = {}) => {
    await ensureOutroSchema();
    const { rows } = await db.query('SELECT * FROM "OutroProject" WHERE "kieJobId" = $1', [taskId]);
    const row = rows[0];
    if (!row) return false;

    await db.query('UPDATE "OutroProject" SET "kieRaw" = $2, "updatedAt" = NOW() WHERE id = $1',
        [row.id, JSON.stringify(payload)]);

    try {
        await advance(row);
    } catch (e) {
        console.error(`[OUTRO] webhook ${taskId}:`, e.message);
    }
    return true;
};

// ─── Listado y ficha ───────────────────────────────────────────────────────

export const listOutros = async (req, res) => {
    try {
        await ensureOutroSchema();
        const { status, format, readyOnly } = req.query;

        const where = [];
        const params = [];
        let p = 1;

        const scope = scopeClause(req.user, p);
        if (scope.sql) { where.push(scope.sql); params.push(...scope.params); p = scope.next; }

        if (readyOnly === 'true') {
            where.push(`status = 'ready'`);
        } else if (status && OUTRO_STATUSES[status]) {
            where.push(`status = $${p}`); params.push(status); p += 1;
        }
        if (format && OUTRO_FORMATS[format]) {
            where.push(`format = $${p}`); params.push(format); p += 1;
        }

        const sql = `SELECT * FROM "OutroProject"${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY "createdAt" DESC LIMIT 200`;
        const { rows } = await db.query(sql, params);
        res.json({ outros: rows.map(rowToDto), credits: await creditUsage(req.user) });
    } catch (e) {
        console.error('[OUTRO] list:', e);
        res.status(500).json({ error: e.message });
    }
};

export const getOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const row = await fetchOutro(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Outro no encontrado' });
        res.json(rowToDto(row));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Acciones sobre un outro ───────────────────────────────────────────────

export const retryOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const row = await fetchOutro(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Outro no encontrado' });

        const usage = await creditUsage(req.user);
        if (usage.exceeded) return res.status(429).json({ error: `Se alcanzó el tope de consumo del mes (${usage.spent}/${usage.limit}).`, credits: usage });

        const updated = await relaunch(row);
        res.json({ ...rowToDto(updated), credits: await creditUsage(req.user) });
    } catch (e) {
        console.error('[OUTRO] retry:', e);
        res.status(502).json({ error: e.message });
    }
};

// Duplicar = crear una variante. Acepta cambios puntuales (otra voz, otro
// estilo, otro formato) sin volver a llenar el formulario.
export const duplicateOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const source = await fetchOutro(req.params.id, req.user);
        if (!source) return res.status(404).json({ error: 'Outro no encontrado' });

        const usage = await creditUsage(req.user);
        if (usage.exceeded) return res.status(429).json({ error: `Se alcanzó el tope de consumo del mes (${usage.spent}/${usage.limit}).`, credits: usage });

        const overrides = req.body || {};
        const cleanStyle = OUTRO_STYLES[overrides.style] ? overrides.style : source.style;
        const cleanVoice = sanitizeVoice({ ...(source.voice || {}), ...(overrides.voice || {}) });
        const format = OUTRO_FORMATS[overrides.format] ? overrides.format : source.format;
        const plan = resolveEngine({ engine: overrides.engine || source.engine, voiceEnabled: cleanVoice.enabled, format });

        let speechUsed = null;
        if (plan.voiceEnabled) {
            const text = String(overrides.speechText ?? source.speechUsed ?? source.speechText ?? '').trim();
            if (!text) return res.status(400).json({ error: 'La variante lleva voz en off pero no tiene texto' });
            const fit = checkSpeechFit(text, { durationSec: plan.durationSec, language: cleanVoice.language, pace: cleanVoice.pace });
            if (!fit.fits) return res.status(400).json({ error: `El texto no cabe en ${plan.durationSec} segundos (${fit.words} de ${fit.maxWords} palabras).`, speech: fit, needsSummary: true });
            speechUsed = text;
        }

        const id = randomUUID();
        const config = {
            durationSec: plan.durationSec,
            resolution: plan.resolution,
            master: OUTRO_FORMATS[plan.format].master,
            voiceEnabled: plan.voiceEnabled,
            requestedFormat: format,
            requestedEngine: overrides.engine || source.engine,
            notes: plan.notes
        };

        const { rows } = await db.query(
            `INSERT INTO "OutroProject"
             (id, title, "clubId", "userId", "userEmail", "organizationName",
              "sourceImageUrl", "sourceMediaId", "sourceReport",
              style, format, "speechText", "speechUsed", voice, config,
              engine, "engineModel", status, "creditsEstimated", "parentId", version)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pending',$18,$19,$20)
             RETURNING *`,
            [
                id,
                overrides.title?.trim() || `${source.title} (variante)`,
                source.clubId, req.user.id || null, req.user.email || null, source.organizationName,
                source.sourceImageUrl, source.sourceMediaId, JSON.stringify(source.sourceReport),
                cleanStyle, plan.format,
                overrides.speechText ?? source.speechText, speechUsed,
                JSON.stringify(cleanVoice), JSON.stringify(config),
                plan.engineId, plan.model, plan.creditEstimate, source.id, OUTRO_MODULE_VERSION
            ]
        );

        const started = await dispatchGeneration(rows[0]);
        res.status(201).json({ ...rowToDto(started), notes: plan.notes, credits: await creditUsage(req.user) });
    } catch (e) {
        console.error('[OUTRO] duplicate:', e);
        res.status(502).json({ error: e.message });
    }
};

// Guardar en la Biblioteca multimedia. El archivo ya está en S3 desde que se
// validó; esto es lo que lo hace VISIBLE en la Biblioteca, dentro de la carpeta
// "outros", con toda la metadata del trabajo.
export const saveOutroToLibrary = async (req, res) => {
    try {
        await ensureOutroSchema();
        const row = await fetchOutro(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Outro no encontrado' });
        if (!row.videoUrl) return res.status(400).json({ error: 'El outro todavía no tiene archivo generado' });
        if (row.status !== 'ready' && !req.body?.force) {
            return res.status(400).json({
                error: 'El outro no pasó la validación de calidad. Revisá el informe o regeneralo antes de guardarlo.',
                quality: row.quality
            });
        }
        if (row.mediaId) {
            const { rows: existing } = await db.query('SELECT * FROM "Media" WHERE id = $1', [row.mediaId]);
            if (existing[0]) return res.json({ media: existing[0], outro: rowToDto(row), alreadySaved: true });
        }

        // sourceLabel: el nombre del club si lo hay; si no, la organización que
        // escribió el usuario. Es lo que la Biblioteca muestra bajo cada ficha.
        let sourceLabel = row.organizationName || null;
        if (row.clubId) {
            try {
                const { rows: club } = await db.query('SELECT name FROM "Club" WHERE id = $1', [row.clubId]);
                if (club[0]?.name) sourceLabel = club[0].name;
            } catch { /* se queda con el nombre escrito */ }
        }

        const filename = `${slugify(row.title)}-${row.format.replace(':', 'x')}.mp4`;
        const { rows: media } = await db.query(
            `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key",
                                  "sourceType", "sourceId", "sourceLabel", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, 'video', $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             RETURNING *`,
            [
                filename, row.videoUrl, Number(row.sizeBytes || 0),
                process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
                process.env.AWS_REGION || 'us-east-1',
                row.clubId, row.s3Key,
                row.clubId ? 'club' : 'platform', row.clubId, sourceLabel
            ]
        );

        const { rows: updated } = await db.query(
            `UPDATE "OutroProject" SET "mediaId" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [row.id, media[0].id]
        );

        console.log(`[OUTRO] ${row.id} guardado en la Biblioteca como ${media[0].id} (${row.s3Key})`);
        res.status(201).json({ media: media[0], outro: rowToDto(updated[0]) });
    } catch (e) {
        console.error('[OUTRO] library:', e);
        res.status(500).json({ error: e.message });
    }
};

export const deleteOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const row = await fetchOutro(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Outro no encontrado' });

        // Sólo se borra el registro del generador. El archivo en S3 y la ficha de
        // la Biblioteca se conservan: si el outro ya se guardó, puede estar usado
        // al final de un video publicado.
        await db.query('DELETE FROM "OutroProject" WHERE id = $1', [row.id]);
        res.json({ success: true, keptInLibrary: Boolean(row.mediaId) });
    } catch (e) {
        console.error('[OUTRO] delete:', e);
        res.status(500).json({ error: e.message });
    }
};
