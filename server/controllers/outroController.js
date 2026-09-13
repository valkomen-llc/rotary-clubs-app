// ════════════════════════════════════════════════════════════════════
// Generador de Outro IA — controlador
// v4.1038.0 (duración dinámica por locución medida; v4.1035.0 el motor determinista; v4.647.0 el original)
//
// Crea cierres audiovisuales de ~5 segundos a partir de una imagen fija, con
// voz en off opcional, y los deja listos para colgarse al final de un Reel.
//
// DOS MOTORES, DOS FLUJOS:
//
//   · `motion` (default desde v4.1035): MOTION GRAPHICS DETERMINISTA. La
//     imagen se anima con ffmpeg sin pasar por ningún modelo —los píxeles del
//     logotipo y los textos son los de la imagen—, la voz la sintetiza el TTS
//     de la plataforma y se mezcla sin recodificar el video. Corre por ETAPAS
//     (`advanceMotion`: video → voz → mezcla) y cada etapa deja su asset en
//     S3 y su estado en `config.stages`: un fallo de voz NO tira el video ya
//     renderizado ni lo vuelve a renderizar. Se ejecuta dentro del POST (2-15
//     s) y, si la petición muere a mitad, el siguiente `sync` REANUDA desde la
//     etapa que quedó.
//
//   · `kling` (IA generativa vía KIE): el flujo asíncrono de siempre, abajo.
//
// FLUJO GENERATIVO (asíncrono a propósito):
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
    MOTION_PRESETS, DEFAULT_MOTION_PRESET, isMotionPreset, styleLabelFor, TTS_CREDIT_ESTIMATE, MUSIC_CREDIT_ESTIMATE,
    resolveEngine, buildOutroPrompt, buildOutroTitle, checkSpeechFit, computeSpeechBudget, countWords
} from '../lib/outroSpec.js';
import { MOTION_ENGINE_ID, emptyStages, stagesSummary, planOutroDuration } from '../lib/outroMotion.js';
import { renderMotionOutro, synthesizeOutroVoice, mixOutroVoice, extractPosterFrame, measureMusic, mixImportedOutro } from '../lib/outroMotionRender.js';
import {
    IMPORT_ENGINE_ID, ORIGINS, IMPORT_MAX_BYTES, IMPORT_MIN_SEC, IMPORT_MAX_SEC, validateImportedVideo,
    MUSIC_MODES, normalizeMusicConfig, estimateImportCosts, planImportAudio, voiceWindowFor,
    validateImportedOutput, emptyImportStages, importStagesSummary, voiceVolumeGainDb, MUSIC_GAIN_DB
} from '../lib/outroImport.js';
import { startSoundtrack, musicChain, fetchAudioBuffer } from '../lib/reelMusic.js';
import { MUSIC_STYLES, DEFAULT_MUSIC_STYLE } from '../lib/reelSpec.js';
import { activeTtsProvider } from '../lib/reelNarration.js';
import { generateThumbBuffer, thumbKeyFor } from '../lib/mediaThumbs.js';
import { ensureChildFolder } from '../lib/submissionFolders.js';
import { probeMp4, validateOutroFile, inspectSourceImage } from '../lib/outroQuality.js';
import { createKieVideoTask, getKieVideoTask, fetchKieVideoBuffer } from '../services/kieService.js';
import { generateCopy } from '../services/copywritingService.js';

export const OUTRO_MODULE_VERSION = '4.1038.0';

console.log(`[outroController] v${OUTRO_MODULE_VERSION} cargado — Generador de Outro IA: Motion Graphics determinista por defecto, modo «Importar video MP4» (el archivo es el maestro: sólo voz, música y mezcla con ducking, cero créditos de generación), voz sin presupuesto de palabras —la locución se mide y el outro se extiende manteniendo el último fotograma—, Kling como alternativa, outro predeterminado por sitio y guardado en la Biblioteca`);

// Llave del ajuste por sitio que guarda el outro predeterminado (`Setting`).
export const DEFAULT_OUTRO_SETTING_KEY = 'default_outro';
// Carpeta de la Biblioteca donde entran los outros. La identidad es
// (clubId, sourceType, sourceId), no el nombre (v4.1004).
const OUTRO_FOLDER = { name: 'Outros', sourceType: 'outro_root', sourceId: 'outros' };

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

// El sitio cuyo outro predeterminado se lee o se escribe. Para un
// administrador de sitio es SIEMPRE el suyo (el cuerpo no elige); el operador
// de la plataforma puede nombrar otro. Sin sitio no hay predeterminado: es un
// ajuste del tenant, no de la plataforma.
const defaultClubFor = (req) => {
    const asked = req.user?.role === 'administrator'
        ? (req.query?.clubId || req.body?.clubId || req.user?.clubId)
        : req.user?.clubId;
    return asked && UUID_RE.test(String(asked)) ? String(asked) : null;
};

// Lee el id guardado. Degrada a null: esto lo consulta también el Creador de
// Reels al abrirse, y un fallo leyendo un ajuste no puede tumbar esa pantalla.
const readDefaultOutroId = async (clubId) => {
    if (!clubId) return null;
    try {
        const { rows } = await db.query(
            `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" = $2 LIMIT 1`,
            [DEFAULT_OUTRO_SETTING_KEY, clubId]
        );
        if (!rows[0]?.value) return null;
        const parsed = JSON.parse(rows[0].value);
        return parsed?.outroId && UUID_RE.test(parsed.outroId) ? parsed.outroId : null;
    } catch { return null; }
};

const rowToDto = (row) => ({
    id: row.id,
    title: row.title,
    clubId: row.clubId,
    organizationName: row.organizationName,
    sourceImageUrl: row.sourceImageUrl,
    sourceMediaId: row.sourceMediaId,
    sourceReport: row.sourceReport,
    style: row.style,
    styleLabel: styleLabelFor(row.style),
    format: row.format,
    speechText: row.speechText,
    speechUsed: row.speechUsed,
    voice: row.voice,
    config: row.config,
    engine: row.engine,
    engineLabel: OUTRO_ENGINES[row.engine]?.label || row.engine,
    deterministic: Boolean(OUTRO_ENGINES[row.engine]?.deterministic),
    // El desglose del costo y el estado de cada etapa viajan RESUELTOS: la
    // pantalla pinta, no decide.
    costs: row.config?.costs || null,
    stages: row.engine === MOTION_ENGINE_ID ? stagesSummary(row.config?.stages)
        : row.engine === IMPORT_ENGINE_ID ? importStagesSummary(row.config?.stages) : null,
    // De dónde salió el maestro visual (v4.1036). Una fila anterior no lo
    // trae y es, por definición, generada.
    origin: row.origin || (row.engine === IMPORT_ENGINE_ID ? ORIGINS.imported : ORIGINS.generated),
    imported: row.engine === IMPORT_ENGINE_ID,
    sourceVideoUrl: row.sourceVideoUrl || null,
    sourceVideoMediaId: row.sourceVideoMediaId || null,
    music: row.music || null,
    importReport: row.engine === IMPORT_ENGINE_ID ? (row.config?.importReport || null) : null,
    audioPlan: row.engine === IMPORT_ENGINE_ID ? (row.config?.audioPlan || null) : null,
    // v4.1038: cuánto se extendió la pieza para que la locución entre entera (0 créditos).
    extension: row.config?.extension || null,
    isDefault: Boolean(row.__isDefault),
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
                id: e.id, label: e.label, nativeAudio: e.nativeAudio, ttsVoice: Boolean(e.ttsVoice),
                deterministic: Boolean(e.deterministic),
                durations: e.durations, customDuration: e.customDuration || null,
                aspectRatios: e.aspectRatios, resolutions: e.resolutions,
                creditEstimate: e.creditEstimate,
                creditEstimateAudio: e.creditEstimateAudio || e.creditEstimate,
                note: e.note,
                available: isEngineAvailable(e.id),
                isDefault: e.id === DEFAULT_ENGINE,
                // El modo importado no es un motor de generación: la pantalla
                // no lo ofrece en el selector de motores.
                imported: Boolean(e.imported)
            })),
            // Modo «Importar video MP4» (v4.1036).
            importing: {
                maxBytes: IMPORT_MAX_BYTES,
                minSec: IMPORT_MIN_SEC,
                maxSec: IMPORT_MAX_SEC,
                music: {
                    modes: Object.values(MUSIC_MODES),
                    generateAvailable: musicChain().length > 0,
                    styles: Object.entries(MUSIC_STYLES).map(([id, m]) => ({ id, label: m.label })),
                    defaultStyle: DEFAULT_MUSIC_STYLE,
                    creditEstimate: MUSIC_CREDIT_ESTIMATE
                }
            },
            defaultEngine: DEFAULT_ENGINE,
            presets: Object.values(MOTION_PRESETS).map(p => ({ id: p.id, label: p.label, description: p.description, isDefault: Boolean(p.isDefault) })),
            defaultPreset: DEFAULT_MOTION_PRESET,
            tts: { configured: Boolean(activeTtsProvider()), provider: activeTtsProvider(), creditEstimate: TTS_CREDIT_ESTIMATE },
            defaultOutroId: await readDefaultOutroId(defaultClubFor(req)),
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
            // Sólo el motor GENERATIVO exige credencial: el determinista viaja
            // con la aplicación.
            providerConfigured: Boolean(process.env.KIE_API_KEY),
            motionAvailable: true
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
        const { imageUrl, format = DEFAULT_FORMAT, engine, voice = {}, speechText = '', durationSec = null } = req.body || {};
        if (!imageUrl) return res.status(400).json({ error: 'Falta la imagen de origen' });

        const cleanVoice = sanitizeVoice(voice);
        const plan = resolveEngine({ engine, voiceEnabled: cleanVoice.enabled, format, durationSec });
        if (plan.voiceMode === 'tts' && !activeTtsProvider()) {
            plan.notes.push('No hay proveedor de voz configurado (ELEVENLABS_API_KEY u OPENAI_API_KEY): el outro saldría sin locución.');
        }

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
            engine: { id: plan.engineId, label: plan.engine.label, nativeAudio: plan.engine.nativeAudio, deterministic: plan.deterministic },
            format: plan.format,
            durationSec: plan.durationSec,
            resolution: plan.resolution,
            master: OUTRO_FORMATS[plan.format].master,
            voiceEnabled: plan.voiceEnabled,
            voiceMode: plan.voiceMode,
            ttsConfigured: Boolean(activeTtsProvider()),
            notes: plan.notes,
            sourceReport,
            speech: fit,
            creditEstimate: plan.creditEstimate,
            costs: plan.costs
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
        const { text, voice = {}, format = DEFAULT_FORMAT, engine, durationSec = null } = req.body || {};
        if (!text || !String(text).trim()) return res.status(400).json({ error: 'Falta el texto a resumir' });

        const cleanVoice = sanitizeVoice({ ...voice, enabled: true });
        const plan = resolveEngine({ engine, voiceEnabled: true, format, durationSec });
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
            style = null, preset = null, format = DEFAULT_FORMAT, durationSec = null,
            engine, voice = {}, title = null, clubId = null
        } = req.body || {};

        if (!imageUrl) return res.status(400).json({ error: 'Falta la imagen de origen del outro' });

        const cleanVoice = sanitizeVoice(voice);
        const plan = resolveEngine({ engine, voiceEnabled: cleanVoice.enabled, format, durationSec });

        // La credencial de la pasarela sólo hace falta para el motor GENERATIVO.
        if (!plan.deterministic && !process.env.KIE_API_KEY) {
            return res.status(503).json({ error: 'El motor de video generativo no está configurado (KIE_API_KEY). El motor de Motion Graphics no la necesita.' });
        }
        // Y la voz por TTS necesita un proveedor de voz. Se dice ANTES de crear
        // nada: un outro que nace sin poder locutar es un outro que hay que
        // rehacer.
        if (plan.voiceMode === 'tts' && !activeTtsProvider()) {
            return res.status(503).json({ error: 'No hay proveedor de voz configurado (ELEVENLABS_API_KEY u OPENAI_API_KEY). Desactivá la voz en off o configurá uno.' });
        }

        const usage = await creditUsage(req.user);
        if (usage.exceeded && plan.creditEstimate > 0) {
            return res.status(429).json({
                error: `Se alcanzó el tope de consumo del mes (${usage.spent}/${usage.limit} créditos estimados).`,
                credits: usage
            });
        }

        // El «estilo» guardado es el PRESET de Motion Graphics en el motor
        // determinista y el estilo de prompt en el generativo. Un solo campo,
        // dos catálogos, y `styleLabelFor` los rotula a los dos.
        const cleanStyle = plan.deterministic
            ? (isMotionPreset(preset || style) ? (preset || style) : DEFAULT_MOTION_PRESET)
            : (OUTRO_STYLES[style] ? style : DEFAULT_STYLE);

        // El texto se pronuncia ENTERO (v4.1038): con el motor determinista la
        // locución se sintetiza, se MIDE, y si dura más que el video es la
        // pieza la que se alarga — nunca se acorta ni se acelera la voz. El
        // presupuesto de palabras sólo sigue valiendo para el motor GENERATIVO,
        // cuya voz la produce el propio modelo dentro de un clip de 5 o 10 s
        // que no se puede extender sin regenerarlo.
        let speechUsed = null;
        if (plan.voiceEnabled) {
            const text = String(speechText || '').trim();
            if (!text) return res.status(400).json({ error: 'Activaste la voz en off pero no escribiste el texto a pronunciar' });
            const fit = checkSpeechFit(text, {
                durationSec: plan.durationSec,
                language: cleanVoice.language,
                pace: cleanVoice.pace
            });
            if (!fit.fits && !plan.deterministic) {
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
            requestedDurationSec: Number.isFinite(Number(durationSec)) ? Number(durationSec) : null,
            resolution: plan.resolution,
            master: OUTRO_FORMATS[plan.format].master,
            voiceEnabled: plan.voiceEnabled,
            voiceMode: plan.voiceMode,
            requestedFormat: format,
            requestedEngine: engine || null,
            // Los TRES costos por separado (generación · voz · composición). Lo
            // que se descuenta al crear es la generación; la voz se suma cuando
            // la síntesis de verdad ocurre.
            costs: plan.costs,
            preset: plan.deterministic ? cleanStyle : null,
            stages: plan.deterministic ? emptyStages() : null,
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
                plan.engineId, plan.model, plan.costs.generationCost, OUTRO_MODULE_VERSION
            ]
        );

        let row = rows[0];

        // Motor determinista: se renderiza ACÁ, dentro de la petición (2-15 s).
        // `advanceMotion` nunca lanza: deja la fila en `ready`, `needs_review`
        // o `error` con su motivo, y lo que haya quedado a medias lo reanuda
        // el siguiente sondeo.
        if (plan.deterministic) {
            row = await advanceMotion(row);
            return res.status(201).json({ ...rowToDto(row), notes: plan.notes, credits: await creditUsage(req.user) });
        }

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
    // Motor determinista: se REANUDA desde la etapa que falló. Las etapas ya
    // hechas (video renderizado, voz sintetizada) se conservan en `config` y
    // no se repiten; la generación no cuesta créditos y la voz sólo se vuelve
    // a cobrar si de verdad se vuelve a sintetizar.
    if (row.engine === MOTION_ENGINE_ID) {
        const { rows } = await db.query(
            `UPDATE "OutroProject"
             SET attempts = attempts + 1, status = 'pending', "statusDetail" = $2, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [row.id, auto ? `Reintento automático tras: ${reason}` : null]
        );
        return advanceMotion(rows[0]);
    }
    // MP4 importado: se reanuda igual, y una etapa que FALLÓ (voz, música)
    // vuelve a `pending` para intentarse otra vez; lo que salió se conserva.
    // Nunca hay nada visual que regenerar.
    if (row.engine === IMPORT_ENGINE_ID) {
        const stages = { ...emptyImportStages(), ...(row.config?.stages || {}) };
        for (const k of Object.keys(stages)) if (stages[k]?.state === 'failed') stages[k] = { state: 'pending' };
        stages.mix = { state: 'pending' };
        const { rows } = await db.query(
            `UPDATE "OutroProject"
             SET attempts = attempts + 1, status = 'pending', "statusDetail" = $2, config = $3, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [row.id, auto ? `Reintento automático tras: ${reason}` : null, JSON.stringify({ ...(row.config || {}), stages })]
        );
        return advanceImport(rows[0]);
    }
    const { rows } = await db.query(
        `UPDATE "OutroProject"
         SET attempts = attempts + 1, status = 'pending',
             "statusDetail" = $2, "creditsEstimated" = "creditsEstimated" + $3, "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [row.id, auto ? `Reintento automático tras: ${reason}` : null, attemptCredits(row)]
    );
    return dispatchGeneration(rows[0]);
};

// ─── Motor determinista: las tres etapas ───────────────────────────────────
//
// video → voz → mezcla. Cada etapa deja su archivo en S3 y su estado en
// `config.stages`; `config.intermediate` guarda las URL de lo ya producido.
// Reanudar es volver a llamar: lo que está en `ok` se descarga en vez de
// rehacerse. Nunca lanza — el desenlace queda escrito en la fila.
//
// El claim es un UPDATE condicional: el POST que crea el outro, el sondeo
// cada 6 s y un reintento manual pueden coincidir, y sólo uno renderiza. La
// ventana de 5 minutos es la salida de emergencia si la petición que reclamó
// muere a mitad (tiempo agotado de la función).
const s3Put = async (key, body, contentType) => {
    const { s3, PutObjectCommand } = await getS3();
    const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
    await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000'
    }));
    return { key, url: publicUrlFor(bucket, key) };
};

const fetchBuffer = async (url, label) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No se pudo descargar ${label} (HTTP ${resp.status})`);
    return Buffer.from(await resp.arrayBuffer());
};

const saveConfig = async (id, config) => {
    const { rows } = await db.query(
        `UPDATE "OutroProject" SET config = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
        [id, JSON.stringify(config)]
    );
    return rows[0];
};

const advanceMotion = async (row) => {
    if (OUTRO_STATUSES[row.status]?.terminal) return row;

    const { rows: claimed } = await db.query(
        `UPDATE "OutroProject"
         SET status = 'rendering', "updatedAt" = NOW()
         WHERE id = $1
           AND (status = 'pending' OR (status IN ('rendering', 'validating') AND "updatedAt" < NOW() - INTERVAL '5 minutes'))
         RETURNING *`,
        [row.id]
    );
    if (claimed.length === 0) {
        const { rows: current } = await db.query('SELECT * FROM "OutroProject" WHERE id = $1', [row.id]);
        return current[0] || row;
    }

    let cur = claimed[0];
    const config = { ...(cur.config || {}) };
    const stages = { ...emptyStages(), ...(config.stages || {}) };
    const intermediate = { ...(config.intermediate || {}) };
    const durationSec = Number(config.durationSec) || TARGET_DURATION_SEC;
    const preset = isMotionPreset(config.preset || cur.style) ? (config.preset || cur.style) : DEFAULT_MOTION_PRESET;
    const base = intermediate.base || `clubs/${cur.clubId || 'global'}/outros/${Date.now()}-${slugify(cur.title)}`;
    intermediate.base = base;
    const notes = [...(config.notes || [])];
    const persist = async () => { cur = await saveConfig(cur.id, { ...config, stages, intermediate, notes }); };

    try {
        // ── Etapa 1: el video, mudo ──
        let videoBuffer;
        if (stages.video.state === 'ok' && intermediate.videoUrl) {
            videoBuffer = await fetchBuffer(intermediate.videoUrl, 'el video ya renderizado');
        } else {
            const started = Date.now();
            const image = await fetchBuffer(cur.sourceImageUrl, 'la imagen de origen');
            const rendered = await renderMotionOutro(image, { format: cur.format, preset, durationSec });
            const put = await s3Put(`${base}-video.mp4`, rendered.buffer, 'video/mp4');
            intermediate.videoKey = put.key; intermediate.videoUrl = put.url;
            stages.video = { state: 'ok', ms: Date.now() - started, plan: rendered.plan };
            for (const n of rendered.notes) if (!notes.includes(n)) notes.push(n);
            videoBuffer = rendered.buffer;
            await persist();
        }

        // ── Etapa 2: la voz (opcional) ──
        const wantsVoice = Boolean(config.voiceEnabled && cur.speechUsed && config.voiceMode === 'tts');
        let voiceBuffer = null;
        if (!wantsVoice) {
            stages.voice = { state: 'skipped' };
        } else if (stages.voice.state === 'ok' && intermediate.voiceUrl) {
            voiceBuffer = await fetchBuffer(intermediate.voiceUrl, 'la locución ya sintetizada');
        } else {
            try {
                const started = Date.now();
                const synth = await synthesizeOutroVoice({ text: cur.speechUsed, voice: cur.voice || {}, durationSec });
                // La síntesis ya se pagó al proveedor, se use o no: se cuenta.
                const ttsCredits = Number(config.costs?.ttsCost) || TTS_CREDIT_ESTIMATE;
                await db.query(`UPDATE "OutroProject" SET "creditsEstimated" = "creditsEstimated" + $2 WHERE id = $1`, [cur.id, ttsCredits]);
                if (!synth.timing.ok) {
                    stages.voice = { state: 'failed', reason: synth.timing.reason, measuredSec: synth.measuredSec, provider: synth.provider, ms: Date.now() - started };
                } else {
                    const put = await s3Put(`${base}-voice.mp3`, synth.buffer, 'audio/mpeg');
                    intermediate.voiceKey = put.key; intermediate.voiceUrl = put.url;
                    stages.voice = {
                        state: 'ok', provider: synth.provider, voiceId: synth.voiceId, language: synth.language,
                        measuredSec: synth.measuredSec, leadInSec: synth.timing.leadInSec, ms: Date.now() - started
                    };
                    voiceBuffer = synth.buffer;
                }
            } catch (e) {
                stages.voice = { state: 'failed', reason: e.message };
            }
            await persist();
        }

        // ── La duración FINAL sale de la locución MEDIDA (v4.1038) ──
        // La voz nunca se acelera ni se corta: si mide más que el video, la
        // pieza se alarga. En Motion Graphics eso es volver a renderizar a la
        // duración final —cuesta segundos y cero créditos; congelar el último
        // fotograma daría el negro del fundido de salida—.
        const hasVoice = Boolean(voiceBuffer && stages.voice.state === 'ok');
        const timeline = planOutroDuration({ sourceDurationSec: durationSec, voiceMeasuredSec: hasVoice ? stages.voice.measuredSec : null });
        const finalDurationSec = timeline.finalDurationSec || durationSec;
        config.finalDurationSec = finalDurationSec;
        config.extension = { sourceDurationSec: durationSec, finalDurationSec, extendSec: timeline.extendSec, extended: timeline.extended, method: timeline.extended ? 'rerender' : null, credits: 0 };
        if (timeline.note && !notes.includes(timeline.note)) notes.push(timeline.note);
        const renderedFor = Number(stages.video?.plan?.durationSec) || durationSec;
        if (Math.abs(renderedFor - finalDurationSec) > 0.05) {
            const started = Date.now();
            const image = await fetchBuffer(cur.sourceImageUrl, 'la imagen de origen');
            const rendered = await renderMotionOutro(image, { format: cur.format, preset, durationSec: finalDurationSec });
            const put = await s3Put(`${base}-video.mp4`, rendered.buffer, 'video/mp4');
            intermediate.videoKey = put.key; intermediate.videoUrl = put.url;
            stages.video = { state: 'ok', ms: Date.now() - started, plan: rendered.plan, rerenderedFor: 'voice' };
            videoBuffer = rendered.buffer;
            await persist();
        }

        // ── Etapa 3: la mezcla — o el video tal cual si no hay voz ──
        let finalBuffer;
        if (hasVoice) {
            const started = Date.now();
            finalBuffer = await mixOutroVoice({
                videoBuffer, voiceBuffer, durationSec: finalDurationSec,
                timing: { leadInSec: stages.voice.leadInSec }
            });
            stages.mix = { state: 'ok', mode: 'voice', durationSec: finalDurationSec, ms: Date.now() - started };
        } else {
            finalBuffer = videoBuffer;
            stages.mix = { state: 'ok', mode: 'silent' };
        }

        const put = await s3Put(`${base}.mp4`, finalBuffer, 'video/mp4');
        const probe = probeMp4(finalBuffer);
        const quality = validateOutroFile(probe, {
            format: cur.format,
            expectedDurationSec: finalDurationSec,
            expectVoice: stages.voice.state === 'ok'
        });

        // Una voz que no salió no tira el outro: el video existe y sirve. Queda
        // en revisión CON el motivo, y «Regenerar» reintenta sólo la voz.
        const voiceFailed = stages.voice.state === 'failed';
        const verdict = voiceFailed ? 'needs_review' : quality.verdict;
        const detail = [
            voiceFailed ? `La voz en off no se pudo incorporar: ${stages.voice.reason} El video quedó listo sin locución.` : null,
            quality.failures.length ? quality.failures.join(' · ') : null
        ].filter(Boolean).join(' ') || null;

        const { rows } = await db.query(
            `UPDATE "OutroProject"
             SET status = $2, "statusDetail" = $3, "videoUrl" = $4, "s3Key" = $5,
                 "durationSec" = $6, width = $7, height = $8, "bitrateKbps" = $9,
                 "sizeBytes" = $10, "hasAudio" = $11, quality = $12, config = $13, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [
                cur.id, verdict, detail, put.url, put.key,
                probe.durationSec, probe.width, probe.height, probe.bitrateKbps,
                probe.sizeBytes, probe.hasAudio, JSON.stringify(quality),
                JSON.stringify({ ...config, stages, intermediate, notes })
            ]
        );
        console.log(`[OUTRO] ${cur.id} motion → ${verdict} (${probe.width}×${probe.height}, ${probe.durationSec}s, voz=${stages.voice.state})`);
        return rows[0];
    } catch (e) {
        console.error(`[OUTRO] ${cur.id} motion falló:`, e.message, e.ffmpeg?.stderrTail || '');
        const { rows } = await db.query(
            `UPDATE "OutroProject" SET status = 'error', "statusDetail" = $2, config = $3, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [cur.id, e.message, JSON.stringify({ ...config, stages, intermediate, notes, lastError: { message: e.message, ffmpeg: e.ffmpeg || null } })]
        );
        return rows[0];
    }
};

// Avanza el estado consultando a KIE. Idempotente: si el outro ya terminó,
// devuelve la fila sin volver a llamar al proveedor.
const advance = async (row) => {
    if (OUTRO_STATUSES[row.status]?.terminal) return row;
    if (row.engine === MOTION_ENGINE_ID) return advanceMotion(row);
    if (row.engine === IMPORT_ENGINE_ID) return advanceImport(row);
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

// ─── Modo «Importar video MP4» (v4.1036) ───────────────────────────────────
//
// El usuario trae un outro YA TERMINADO por fuera (After Effects, Canva, una
// agencia) y la plataforma le pone SÓLO el audio: voz por TTS, música y la
// mezcla con ducking. El MP4 es el MAESTRO VISUAL: no pasa por ningún modelo,
// no se regenera un fotograma, no se toca el diseño, y la generación visual
// cuesta CERO créditos siempre. Criterio en `outroImport.js`; render en
// `outroMotionRender.js`. Corre por ETAPAS reanudables, como Motion Graphics:
// fuente → voz → música → mezcla.

const fetchVideoBuffer = async (url) => {
    const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) throw new Error(`No se pudo descargar el video (HTTP ${resp.status})`);
    const len = Number(resp.headers.get('content-length'));
    const tooBig = (n) => `El archivo pesa ${(n / 1024 / 1024).toFixed(1)} MB y el tope es ${Math.round(IMPORT_MAX_BYTES / 1024 / 1024)} MB.`;
    if (Number.isFinite(len) && len > IMPORT_MAX_BYTES) throw new Error(tooBig(len));
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > IMPORT_MAX_BYTES) throw new Error(tooBig(buffer.length));
    return buffer;
};

// El asset elegido de la Biblioteca tiene que ser del alcance de quien edita:
// el WHERE lleva el sitio. Para un asset ajeno la respuesta es «no existe».
const fetchVideoMedia = async (mediaId, user) => {
    if (!mediaId || !UUID_RE.test(String(mediaId))) return null;
    const { sql, params } = scopeClause(user, 2);
    const where = sql ? `id = $1 AND (${sql} OR "clubId" IS NULL)` : 'id = $1';
    const { rows } = await db.query(`SELECT id, filename, url, type, "clubId", size FROM "Media" WHERE ${where}`, [mediaId, ...params]);
    return rows[0] || null;
};

const basenameOf = (url) => {
    try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch { return ''; }
};

// Descarga, mide y valida el archivo de origen. Es el MISMO paso para la
// comprobación previa y para la etapa `source` del render: un archivo que
// pasa el preflight no puede reprobar después por otro criterio.
const inspectImportedSource = async ({ videoUrl, mediaId, user }) => {
    const media = await fetchVideoMedia(mediaId, user);
    if (mediaId && !media) throw Object.assign(new Error('Ese video no existe en la Biblioteca de este sitio.'), { status: 404 });
    if (media && media.type !== 'video') throw Object.assign(new Error('El archivo elegido no es un video.'), { status: 400 });
    const url = media?.url || (typeof videoUrl === 'string' ? videoUrl.trim() : '');
    if (!url) throw Object.assign(new Error('Falta el video a importar (URL o archivo de la Biblioteca).'), { status: 400 });
    const buffer = await fetchVideoBuffer(url);
    const probe = probeMp4(buffer);
    const report = validateImportedVideo(probe, { sizeBytes: buffer.length, filename: media?.filename || basenameOf(url) });
    return { url, media, buffer, probe, report, filename: media?.filename || basenameOf(url) || 'outro.mp4' };
};

// El contador de la pantalla, INFORMATIVO (v4.1038): cuántas palabras hay,
// cuánto se estima que duren y cuánto entra en el archivo sin extenderlo. No
// bloquea nada: la duración real se mide al generar el TTS y, si la locución
// no entra, el outro se extiende solo manteniendo el último fotograma. La voz
// nunca se acelera ni se corta y no hay que acortar el texto.
const importSpeechFit = (text, { durationSec, voice }) => {
    const fit = checkSpeechFit(text, { durationSec, language: voice.language, pace: voice.pace });
    const window = voiceWindowFor(durationSec);
    const mayExtend = fit.words > 0 && fit.estimatedSec > window.availableSec;
    return {
        ...fit,
        // Nada de lo que devuelve esto bloquea: `fits` queda como ESTIMACIÓN.
        blocking: false,
        window,
        mayExtend,
        message: null,
        note: mayExtend
            ? `La locución se estima en ≈${fit.estimatedSec} s y el video dura ${durationSec} s: si al generarla mide más, el outro se extiende solo manteniendo el último fotograma. La voz no se acelera ni se corta.`
            : null
    };
};

export const preflightImport = async (req, res) => {
    try {
        await ensureOutroSchema();
        const { videoUrl = null, mediaId = null, voice = {}, speechText = '', music = {}, keepOriginalAudio = true } = req.body || {};
        const cleanVoice = sanitizeVoice(voice);
        const cleanMusic = normalizeMusicConfig(music);
        const src = await inspectImportedSource({ videoUrl, mediaId, user: req.user });
        const { report } = src;
        const durationSec = report.durationSec || 0;
        const speech = cleanVoice.enabled ? importSpeechFit(speechText, { durationSec, voice: cleanVoice }) : null;
        const audioPlan = planImportAudio({
            hasOriginalAudio: report.hasAudio, keepOriginalAudio: keepOriginalAudio !== false,
            voiceEnabled: cleanVoice.enabled, musicMode: cleanMusic.mode
        });
        const costs = estimateImportCosts({ voiceEnabled: cleanVoice.enabled, music: cleanMusic });
        const notes = [...report.warnings];
        if (report.normalization.needed) notes.push(`El video se normaliza técnicamente (${report.normalization.reasons.join('; ')}). El contenido no cambia: mismo fotograma, misma resolución.`);
        if (audioPlan.note) notes.push(audioPlan.note);
        if (cleanVoice.enabled && !activeTtsProvider()) notes.push('No hay proveedor de voz configurado (ELEVENLABS_API_KEY u OPENAI_API_KEY): el outro saldría sin locución.');
        if (cleanMusic.mode === 'generate' && !musicChain().length) notes.push('No hay motor de música configurado: elegí una pista de la Biblioteca o subí una.');
        res.json({
            engine: { id: IMPORT_ENGINE_ID, label: OUTRO_ENGINES.imported.label, deterministic: true, imported: true },
            source: {
                url: src.url, mediaId: src.media?.id || null, filename: src.filename,
                ok: report.ok, failures: report.failures, warnings: report.warnings,
                durationSec, width: report.width, height: report.height, aspect: report.aspect,
                format: report.format, formatDetected: report.formatDetected,
                sizeBytes: report.sizeBytes, hasAudio: report.hasAudio,
                videoCodec: report.videoCodec, audioCodec: report.audioCodec, fps: report.fps,
                normalization: report.normalization
            },
            // El espejo tipado (`OutroImportPreflight.report`) y la pantalla leen
            // el informe ENTERO acá: `report.ok`, `report.failures`,
            // `report.warnings`, `report.normalization`. v4.1036 lo aplanaba sólo
            // dentro de `source` y la pantalla reventaba al primer render tras
            // subir el video («Esta pantalla no se pudo mostrar»). Las dos formas
            // conviven a propósito: `source` es lo que se PINTA en la ficha y
            // `report` es el VEREDICTO, con el que se decide si se puede procesar.
            report,
            format: report.format,
            durationSec,
            resolution: 'source',
            master: { width: report.width, height: report.height },
            voiceEnabled: cleanVoice.enabled,
            voiceMode: cleanVoice.enabled ? 'tts' : null,
            ttsConfigured: Boolean(activeTtsProvider()),
            speech,
            music: cleanMusic,
            audioPlan,
            notes,
            creditEstimate: costs.total,
            costs
        });
    } catch (e) {
        console.error('[OUTRO] import preflight:', e);
        res.status(e.status || (/(HTTP|descargar|tope)/.test(e.message) ? 400 : 500)).json({ error: e.message });
    }
};

// Inserta la fila del outro importado. Lo comparten la importación, la
// variante (`duplicateOutro`) y nada más: un segundo INSERT se separaría.
const createImportedRow = async ({
    user, src, voice, speechText, speechUsed, music, keepOriginalAudio, organizationName, title, clubId, parentId = null
}) => {
    const { report } = src;
    const requestedClub = user.role === 'administrator' ? (clubId || user.clubId) : user.clubId;
    const targetClubId = requestedClub && UUID_RE.test(requestedClub) ? requestedClub : null;
    const audioPlan = planImportAudio({
        hasOriginalAudio: report.hasAudio, keepOriginalAudio, voiceEnabled: voice.enabled, musicMode: music.mode
    });
    const costs = estimateImportCosts({ voiceEnabled: voice.enabled, music });
    const id = randomUUID();
    const finalTitle = title?.trim() || `${organizationName ? `${organizationName} · ` : ''}Outro importado ${report.format}`;
    const config = {
        durationSec: report.durationSec,
        resolution: 'source',
        master: { width: report.width, height: report.height },
        voiceEnabled: voice.enabled,
        voiceMode: voice.enabled ? 'tts' : null,
        keepOriginalAudio,
        importReport: report,
        audioPlan,
        costs,
        preset: null,
        stages: emptyImportStages(),
        notes: [...report.warnings, ...(audioPlan.note ? [audioPlan.note] : [])]
    };
    const { rows } = await db.query(
        `INSERT INTO "OutroProject"
         (id, title, "clubId", "userId", "userEmail", "organizationName",
          "sourceImageUrl", "sourceMediaId", "sourceReport",
          style, format, "speechText", "speechUsed", voice, config,
          engine, "engineModel", status, "creditsEstimated", "parentId", version,
          origin, "sourceVideoUrl", "sourceVideoMediaId", music)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pending',0,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
            id, finalTitle, targetClubId, user.id || null, user.email || null, organizationName || null,
            // El fotograma de portada se saca en la etapa `source`; hasta
            // entonces la ficha apunta al propio video.
            src.url, null, JSON.stringify({ ok: report.ok, warnings: report.warnings, width: report.width, height: report.height }),
            'importado', report.format, speechText || null, speechUsed,
            JSON.stringify(voice), JSON.stringify(config),
            IMPORT_ENGINE_ID, OUTRO_ENGINES.imported.model, parentId, OUTRO_MODULE_VERSION,
            ORIGINS.imported, src.url, src.media?.id || null, JSON.stringify(music)
        ]
    );
    return rows[0];
};

export const importOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const {
            videoUrl = null, mediaId = null, voice = {}, speechText = '', music = {},
            keepOriginalAudio = true, organizationName = '', title = null, clubId = null
        } = req.body || {};
        const cleanVoice = sanitizeVoice(voice);
        const cleanMusic = normalizeMusicConfig(music);

        if (cleanVoice.enabled && !activeTtsProvider()) {
            return res.status(503).json({ error: 'No hay proveedor de voz configurado (ELEVENLABS_API_KEY u OPENAI_API_KEY). Desactivá la voz en off o configurá uno.' });
        }
        if (cleanMusic.mode === 'generate' && !musicChain().length) {
            return res.status(503).json({ error: 'No hay motor de música configurado: elegí una pista de la Biblioteca o subí una.' });
        }

        const src = await inspectImportedSource({ videoUrl, mediaId, user: req.user });
        if (!src.report.ok) {
            return res.status(400).json({ error: `El video no se puede importar: ${src.report.failures.join(' · ')}`, source: src.report });
        }

        let speechUsed = null;
        if (cleanVoice.enabled) {
            const text = String(speechText || '').trim();
            if (!text) return res.status(400).json({ error: 'Activaste la voz en off pero no escribiste el texto a pronunciar' });
            // Sin presupuesto (v4.1038): el texto entero se pronuncia y la
            // duración final la decide la locución medida en `advanceImport`.
            speechUsed = text;
        }

        const costs = estimateImportCosts({ voiceEnabled: cleanVoice.enabled, music: cleanMusic });
        const usage = await creditUsage(req.user);
        if (usage.exceeded && costs.total > 0) {
            return res.status(429).json({ error: `Se alcanzó el tope de consumo del mes (${usage.spent}/${usage.limit} créditos estimados).`, credits: usage });
        }

        let row = await createImportedRow({
            user: req.user, src, voice: cleanVoice, speechText, speechUsed, music: cleanMusic,
            keepOriginalAudio: keepOriginalAudio !== false, organizationName, title, clubId
        });
        row = await advanceImport(row, { sourceBuffer: src.buffer });
        res.status(201).json({ ...rowToDto(row), notes: row.config?.notes || [], credits: await creditUsage(req.user) });
    } catch (e) {
        console.error('[OUTRO] import:', e);
        res.status(e.status || 500).json({ error: e.message });
    }
};

// Las cuatro etapas del outro importado. NUNCA lanza: el desenlace queda en la
// fila. `sourceBuffer` evita volver a descargar el archivo que el POST acaba
// de medir; un sondeo posterior lo baja de `sourceVideoUrl`.
const advanceImport = async (row, { sourceBuffer = null } = {}) => {
    if (OUTRO_STATUSES[row.status]?.terminal) return row;

    const { rows: claimed } = await db.query(
        `UPDATE "OutroProject"
         SET status = 'rendering', "updatedAt" = NOW()
         WHERE id = $1
           AND (status = 'pending' OR (status IN ('rendering', 'validating') AND "updatedAt" < NOW() - INTERVAL '5 minutes'))
         RETURNING *`,
        [row.id]
    );
    if (claimed.length === 0) {
        const { rows: current } = await db.query('SELECT * FROM "OutroProject" WHERE id = $1', [row.id]);
        return current[0] || row;
    }

    let cur = claimed[0];
    const config = { ...(cur.config || {}) };
    const stages = { ...emptyImportStages(), ...(config.stages || {}) };
    const intermediate = { ...(config.intermediate || {}) };
    const music = normalizeMusicConfig(cur.music || {});
    const base = intermediate.base || `clubs/${cur.clubId || 'global'}/outros/${Date.now()}-${slugify(cur.title)}`;
    intermediate.base = base;
    const notes = [...(config.notes || [])];
    const addNote = (n) => { if (n && !notes.includes(n)) notes.push(n); };
    const persist = async () => { cur = await saveConfig(cur.id, { ...config, stages, intermediate, notes }); };

    try {
        // ── Etapa 1: la fuente — se mide, se valida y se le saca la portada ──
        const started1 = Date.now();
        const videoBuffer = sourceBuffer || await fetchVideoBuffer(cur.sourceVideoUrl);
        const probe = probeMp4(videoBuffer);
        const report = validateImportedVideo(probe, { sizeBytes: videoBuffer.length, filename: basenameOf(cur.sourceVideoUrl) });
        if (!report.ok) throw new Error(`El video no se puede importar: ${report.failures.join(' · ')}`);
        config.importReport = report;
        config.durationSec = report.durationSec;
        const durationSec = report.durationSec;
        if (!intermediate.posterUrl) {
            const poster = await extractPosterFrame(videoBuffer, { durationSec });
            if (poster) {
                const put = await s3Put(`${base}-poster.jpg`, poster, 'image/jpeg');
                intermediate.posterUrl = put.url;
                const { rows: withPoster } = await db.query(`UPDATE "OutroProject" SET "sourceImageUrl" = $2 WHERE id = $1 RETURNING *`, [cur.id, put.url]);
                if (withPoster[0]) cur = withPoster[0];
            } else {
                addNote('No se pudo extraer un fotograma de portada; la ficha usa el video.');
            }
        }
        stages.source = { state: 'ok', ms: Date.now() - started1, normalization: report.normalization };
        await persist();

        // ── Etapa 2: la voz (opcional) — contra la duración REAL del archivo ──
        const wantsVoice = Boolean(config.voiceEnabled && cur.speechUsed);
        let voiceBuffer = null;
        if (!wantsVoice) {
            stages.voice = { state: 'skipped' };
        } else if (stages.voice.state === 'ok' && intermediate.voiceUrl) {
            voiceBuffer = await fetchBuffer(intermediate.voiceUrl, 'la locución ya sintetizada');
        } else {
            try {
                const started = Date.now();
                const synth = await synthesizeOutroVoice({ text: cur.speechUsed, voice: cur.voice || {}, durationSec });
                const ttsCredits = Number(config.costs?.ttsCost) || TTS_CREDIT_ESTIMATE;
                await db.query(`UPDATE "OutroProject" SET "creditsEstimated" = "creditsEstimated" + $2 WHERE id = $1`, [cur.id, ttsCredits]);
                if (!synth.timing.ok) {
                    stages.voice = { state: 'failed', reason: synth.timing.reason, measuredSec: synth.measuredSec, provider: synth.provider, ms: Date.now() - started };
                } else {
                    const put = await s3Put(`${base}-voice.mp3`, synth.buffer, 'audio/mpeg');
                    intermediate.voiceKey = put.key; intermediate.voiceUrl = put.url;
                    stages.voice = {
                        state: 'ok', provider: synth.provider, voiceId: synth.voiceId, language: synth.language,
                        measuredSec: synth.measuredSec, leadInSec: synth.timing.leadInSec, ms: Date.now() - started
                    };
                    voiceBuffer = synth.buffer;
                }
            } catch (e) {
                stages.voice = { state: 'failed', reason: e.message };
            }
            await persist();
        }

        // ── La duración FINAL sale de la locución MEDIDA (v4.1038) ──
        // Voz más corta que el MP4: se conserva la duración original. Voz
        // más larga: el outro se extiende manteniendo el último fotograma
        // (nunca se acelera, nunca se corta, nunca se regenera nada). La
        // música se pide y se recorta para la duración FINAL.
        const hasVoice = Boolean(voiceBuffer && stages.voice.state === 'ok');
        const timeline = planOutroDuration({ sourceDurationSec: durationSec, voiceMeasuredSec: hasVoice ? stages.voice.measuredSec : null });
        const finalDurationSec = timeline.finalDurationSec || durationSec;
        config.finalDurationSec = finalDurationSec;
        config.extension = { sourceDurationSec: durationSec, finalDurationSec, extendSec: timeline.extendSec, extended: timeline.extended, method: timeline.extended ? 'hold_last_frame' : null, credits: 0 };
        if (timeline.note) addNote(timeline.note);

        // ── Etapa 3: la música (opcional) — una pista propia o generada ──
        let musicBuffer = null;
        if (music.mode === 'none') {
            stages.music = { state: 'skipped' };
        } else if (stages.music.state === 'ok' && intermediate.musicUrl) {
            musicBuffer = await fetchAudioBuffer(intermediate.musicUrl);
        } else {
            try {
                const started = Date.now();
                if (music.mode === 'library') {
                    musicBuffer = await fetchAudioBuffer(music.url);
                    intermediate.musicUrl = music.url;
                    stages.music = { state: 'ok', provider: music.source, mediaId: music.mediaId, ms: Date.now() - started };
                } else {
                    const track = await startSoundtrack({ style: music.style || DEFAULT_MUSIC_STYLE, durationSec: finalDurationSec, clubId: cur.clubId });
                    if (track.state === 'success' && track.buffer) {
                        const ext = track.extension || 'mp3';
                        const put = await s3Put(`${base}-music.${ext}`, track.buffer, track.contentType || 'audio/mpeg');
                        intermediate.musicKey = put.key; intermediate.musicUrl = put.url;
                        musicBuffer = track.buffer;
                        // Se pagó al proveedor: se cuenta. Una pista de la
                        // Biblioteca como respaldo no cuesta.
                        const musicCredits = Number(config.costs?.musicCost) || MUSIC_CREDIT_ESTIMATE;
                        await db.query(`UPDATE "OutroProject" SET "creditsEstimated" = "creditsEstimated" + $2 WHERE id = $1`, [cur.id, musicCredits]);
                        stages.music = { state: 'ok', provider: track.provider, style: track.style, ms: Date.now() - started };
                    } else if (track.state === 'success' && track.url) {
                        musicBuffer = await fetchAudioBuffer(track.url);
                        intermediate.musicUrl = track.url;
                        stages.music = { state: 'ok', provider: 'library', mediaId: track.mediaId || null, ms: Date.now() - started };
                        addNote('El motor de música no respondió: se usó una pista de la Biblioteca.');
                    } else if (track.state === 'queued') {
                        stages.music = { state: 'failed', reason: 'El motor de música configurado es asíncrono y el outro no lo sondea; elegí una pista de la Biblioteca.' };
                    } else {
                        stages.music = { state: 'failed', reason: track.failMsg || 'No se pudo generar la música.' };
                    }
                }
                if (musicBuffer) {
                    intermediate.musicDurationSec = await measureMusic(musicBuffer);
                    if (intermediate.musicDurationSec == null) addNote('No se pudo medir la pista musical: si es más corta que el outro, no se repite.');
                }
            } catch (e) {
                stages.music = { state: 'failed', reason: e.message };
            }
            await persist();
        }

        // ── Etapa 4: la mezcla — o el archivo TAL CUAL ──
        const started4 = Date.now();
        const plan = planImportAudio({
            hasOriginalAudio: report.hasAudio,
            keepOriginalAudio: config.keepOriginalAudio !== false,
            voiceEnabled: Boolean(voiceBuffer && stages.voice.state === 'ok'),
            musicMode: musicBuffer && stages.music.state === 'ok' ? music.mode : 'none'
        });
        config.audioPlan = plan;
        let finalBuffer;
        let mixInfo = null;
        if (plan.passthrough && !report.normalization.needed && !timeline.extended) {
            // Nada que mezclar ni normalizar: el maestro es el archivo, byte a byte.
            finalBuffer = videoBuffer;
            stages.mix = { state: 'ok', mode: 'passthrough', ms: 0 };
        } else {
            const mixed = await mixImportedOutro({
                videoBuffer, durationSec: finalDurationSec, extendSec: timeline.extendSec,
                normalize: report.normalization.needed,
                hasOriginalAudio: report.hasAudio,
                keepOriginalAudio: config.keepOriginalAudio !== false,
                voiceBuffer: stages.voice.state === 'ok' ? voiceBuffer : null,
                voiceTiming: { leadInSec: stages.voice.leadInSec },
                voiceGainDb: voiceVolumeGainDb(cur.voice?.volume),
                musicBuffer: stages.music.state === 'ok' ? musicBuffer : null,
                musicDurationSec: intermediate.musicDurationSec ?? null,
                musicGainDb: Number.isFinite(Number(config.musicGainDb)) ? Number(config.musicGainDb) : null
            });
            finalBuffer = mixed.buffer;
            mixInfo = { filter: mixed.filter, videoFilter: mixed.videoFilter, inputs: mixed.inputs, normalized: mixed.normalized, extended: mixed.extended, extendSec: mixed.extendSec };
            stages.mix = { state: 'ok', mode: plan.scenario, ducking: plan.ducking, normalized: mixed.normalized, extended: mixed.extended, extendSec: mixed.extendSec, durationSec: finalDurationSec, ms: Date.now() - started4 };
        }

        const put = await s3Put(`${base}.mp4`, finalBuffer, 'video/mp4');
        const finalProbe = probeMp4(finalBuffer);
        const quality = validateImportedOutput(finalProbe, {
            expectedDurationSec: finalDurationSec,
            expectAudio: plan.original || plan.voice || plan.music,
            expectVoice: plan.voice
        });
        const voiceFailed = stages.voice.state === 'failed';
        const musicFailed = stages.music.state === 'failed';
        const verdict = (voiceFailed || musicFailed) ? 'needs_review' : quality.verdict;
        const detail = [
            voiceFailed ? `La voz en off no se pudo incorporar: ${stages.voice.reason} El outro quedó listo sin locución.` : null,
            musicFailed ? `La música no se pudo incorporar: ${stages.music.reason}` : null,
            quality.failures.length ? quality.failures.join(' · ') : null
        ].filter(Boolean).join(' ') || null;

        const { rows } = await db.query(
            `UPDATE "OutroProject"
             SET status = $2, "statusDetail" = $3, "videoUrl" = $4, "s3Key" = $5,
                 "durationSec" = $6, width = $7, height = $8, "bitrateKbps" = $9,
                 "sizeBytes" = $10, "hasAudio" = $11, quality = $12, config = $13, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [
                cur.id, verdict, detail, put.url, put.key,
                finalProbe.durationSec, finalProbe.width, finalProbe.height, finalProbe.bitrateKbps,
                finalProbe.sizeBytes, finalProbe.hasAudio, JSON.stringify(quality),
                JSON.stringify({ ...config, stages, intermediate, notes, mix: mixInfo })
            ]
        );
        console.log(`[OUTRO] ${cur.id} importado → ${verdict} (${finalProbe.width}×${finalProbe.height}, ${finalProbe.durationSec}s, escenario ${plan.scenario}, voz=${stages.voice.state}, música=${stages.music.state})`);
        return rows[0];
    } catch (e) {
        console.error(`[OUTRO] ${cur.id} importación falló:`, e.message, e.ffmpeg?.stderrTail || '');
        const { rows } = await db.query(
            `UPDATE "OutroProject" SET status = 'error', "statusDetail" = $2, config = $3, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [cur.id, e.message, JSON.stringify({ ...config, stages, intermediate, notes, lastError: { message: e.message, ffmpeg: e.ffmpeg || null } })]
        );
        return rows[0];
    }
};

// Vuelve a MEZCLAR con otros niveles (audio original sí/no, ganancia de la
// música, volumen de la voz) sin sintetizar ni descargar nada de nuevo: la
// voz y la música ya están en S3 y el video se copia. No cuesta créditos.
export const remixOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const row = await fetchOutro(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Outro no encontrado' });
        if (row.engine !== IMPORT_ENGINE_ID) return res.status(400).json({ error: 'Sólo un outro importado se puede remezclar sin regenerar.' });
        if (!OUTRO_STATUSES[row.status]?.terminal) return res.status(409).json({ error: 'El outro está en proceso. Esperá a que termine.' });

        const { keepOriginalAudio, musicGainDb, voiceVolume } = req.body || {};
        const config = { ...(row.config || {}) };
        if (typeof keepOriginalAudio === 'boolean') config.keepOriginalAudio = keepOriginalAudio;
        if (musicGainDb === null) delete config.musicGainDb;
        else if (Number.isFinite(Number(musicGainDb))) config.musicGainDb = Math.max(-30, Math.min(6, Number(musicGainDb)));
        const voice = { ...(row.voice || {}) };
        if (VOICE_VOLUMES[voiceVolume]) voice.volume = voiceVolume;
        const stages = { ...emptyImportStages(), ...(config.stages || {}), mix: { state: 'pending' } };

        const { rows } = await db.query(
            `UPDATE "OutroProject"
             SET status = 'pending', "statusDetail" = NULL, voice = $2, config = $3, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [row.id, JSON.stringify(voice), JSON.stringify({ ...config, stages })]
        );
        const done = await advanceImport(rows[0]);
        res.json({ ...rowToDto(done), credits: await creditUsage(req.user) });
    } catch (e) {
        console.error('[OUTRO] remix:', e);
        res.status(500).json({ error: e.message });
    }
};

// Las pistas de audio de la Biblioteca del sitio, para el selector de música.
// `Media.type` no distingue audio (v4.784 lo clasifica como documento), así
// que se mira también la extensión.
export const listOutroMusic = async (req, res) => {
    try {
        const { sql, params } = scopeClause(req.user, 1);
        const where = [`(type = 'audio' OR lower(filename) ~ '\\.(mp3|m4a|wav|aac|ogg|flac)$')`];
        if (sql) where.push(`(${sql} OR "clubId" IS NULL)`);
        const { rows } = await db.query(
            `SELECT id, filename, url, size, "createdAt" FROM "Media" WHERE ${where.join(' AND ')} ORDER BY "createdAt" DESC LIMIT 100`,
            params
        );
        res.json({ tracks: rows.map(r => ({ id: r.id, filename: r.filename, url: r.url, sizeBytes: r.size != null ? Number(r.size) : null, createdAt: r.createdAt })) });
    } catch (e) {
        console.error('[OUTRO] music library:', e);
        res.status(500).json({ error: e.message, tracks: [] });
    }
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
        const defaultId = await readDefaultOutroId(defaultClubFor(req));
        res.json({
            outros: rows.map(r => rowToDto(r.id === defaultId ? { ...r, __isDefault: true } : r)),
            defaultOutroId: defaultId,
            credits: await creditUsage(req.user)
        });
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

        // Una variante de un outro IMPORTADO reutiliza el MISMO archivo de
        // origen (otra voz, otra música, otro texto): vuelve a medirlo y
        // sigue por su propia vía. Nada visual se regenera.
        if (source.engine === IMPORT_ENGINE_ID) {
            const overrides = req.body || {};
            const cleanVoice = sanitizeVoice({ ...(source.voice || {}), ...(overrides.voice || {}) });
            const cleanMusic = normalizeMusicConfig(overrides.music ?? source.music ?? {});
            const src = await inspectImportedSource({ videoUrl: source.sourceVideoUrl, mediaId: null, user: req.user });
            if (!src.report.ok) return res.status(400).json({ error: `El video de origen ya no se puede importar: ${src.report.failures.join(' · ')}` });
            src.media = source.sourceVideoMediaId ? { id: source.sourceVideoMediaId } : null;
            let speechUsed = null;
            if (cleanVoice.enabled) {
                const text = String(overrides.speechText ?? source.speechUsed ?? source.speechText ?? '').trim();
                if (!text) return res.status(400).json({ error: 'La voz en off está activa pero no hay texto a pronunciar' });
                speechUsed = text;
            }
            let row = await createImportedRow({
                user: req.user, src, voice: cleanVoice, speechText: overrides.speechText ?? source.speechText, speechUsed,
                music: cleanMusic, keepOriginalAudio: typeof overrides.keepOriginalAudio === 'boolean' ? overrides.keepOriginalAudio : source.config?.keepOriginalAudio !== false,
                organizationName: source.organizationName, title: overrides.title?.trim() || `${source.title} (variante)`,
                clubId: source.clubId, parentId: source.id
            });
            row = await advanceImport(row, { sourceBuffer: src.buffer });
            return res.status(201).json({ ...rowToDto(row), credits: await creditUsage(req.user) });
        }

        const usage = await creditUsage(req.user);
        if (usage.exceeded) return res.status(429).json({ error: `Se alcanzó el tope de consumo del mes (${usage.spent}/${usage.limit}).`, credits: usage });

        const overrides = req.body || {};
        const cleanVoice = sanitizeVoice({ ...(source.voice || {}), ...(overrides.voice || {}) });
        const format = OUTRO_FORMATS[overrides.format] ? overrides.format : source.format;
        const plan = resolveEngine({
            engine: overrides.engine || source.engine, voiceEnabled: cleanVoice.enabled, format,
            durationSec: overrides.durationSec ?? source.config?.durationSec ?? null
        });
        const wanted = overrides.preset || overrides.style || source.style;
        const cleanStyle = plan.deterministic
            ? (isMotionPreset(wanted) ? wanted : DEFAULT_MOTION_PRESET)
            : (OUTRO_STYLES[wanted] ? wanted : DEFAULT_STYLE);
        if (plan.voiceMode === 'tts' && !activeTtsProvider()) {
            return res.status(503).json({ error: 'No hay proveedor de voz configurado. Desactivá la voz en off o configurá uno.' });
        }

        let speechUsed = null;
        if (plan.voiceEnabled) {
            const text = String(overrides.speechText ?? source.speechUsed ?? source.speechText ?? '').trim();
            if (!text) return res.status(400).json({ error: 'La variante lleva voz en off pero no tiene texto' });
            // El presupuesto sólo rige al motor GENERATIVO (v4.1038): con
            // Motion Graphics la pieza se alarga a la locución medida.
            const fit = checkSpeechFit(text, { durationSec: plan.durationSec, language: cleanVoice.language, pace: cleanVoice.pace });
            if (!fit.fits && !plan.deterministic) return res.status(400).json({ error: `El texto no cabe en ${plan.durationSec} segundos (${fit.words} de ${fit.maxWords} palabras).`, speech: fit, needsSummary: true });
            speechUsed = text;
        }

        const id = randomUUID();
        const config = {
            durationSec: plan.durationSec,
            resolution: plan.resolution,
            master: OUTRO_FORMATS[plan.format].master,
            voiceEnabled: plan.voiceEnabled,
            voiceMode: plan.voiceMode,
            requestedFormat: format,
            requestedEngine: overrides.engine || source.engine,
            costs: plan.costs,
            preset: plan.deterministic ? cleanStyle : null,
            stages: plan.deterministic ? emptyStages() : null,
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
                plan.engineId, plan.model, plan.costs.generationCost, source.id, OUTRO_MODULE_VERSION
            ]
        );

        if (plan.deterministic) {
            const done = await advanceMotion(rows[0]);
            return res.status(201).json({ ...rowToDto(done), notes: plan.notes, credits: await creditUsage(req.user) });
        }
        const started = await dispatchGeneration(rows[0]);
        res.status(201).json({ ...rowToDto(started), notes: plan.notes, credits: await creditUsage(req.user) });
    } catch (e) {
        console.error('[OUTRO] duplicate:', e);
        res.status(502).json({ error: e.message });
    }
};

// Guardar en la Biblioteca multimedia. El archivo ya está en S3 desde que se
// validó; esto es lo que lo hace VISIBLE en la Biblioteca, dentro de la
// carpeta «Outros» del sitio, con su miniatura y toda la metadata del trabajo.
// La miniatura sale de la IMAGEN DE ORIGEN: `shouldThumbnail` excluye a los
// videos desde siempre, y acá el primer fotograma ES esa imagen — no hace
// falta decodificar nada.
const outroThumbnail = async (row) => {
    try {
        if (!row.s3Key || !row.sourceImageUrl) return null;
        const image = await fetchBuffer(row.sourceImageUrl, 'la imagen de origen');
        const webp = await generateThumbBuffer(image);
        const key = thumbKeyFor(row.s3Key);
        const put = await s3Put(key, webp, 'image/webp');
        return put.url;
    } catch (e) {
        console.warn(`[OUTRO] ${row.id}: sin miniatura (${e.message})`);
        return null;
    }
};

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

        // La carpeta «Outros» del sitio. No poder ordenar NO cuesta el asset
        // (regla de v4.1004): sin carpeta el archivo va a la raíz y se anota.
        const notes = [];
        let folderId = null;
        const folder = await ensureChildFolder({ ...OUTRO_FOLDER, clubId: row.clubId, parentId: null, createdBy: req.user?.id || null });
        if (folder.ok) folderId = folder.folder.id;
        else notes.push(`Sin carpeta «Outros» (${folder.reason}): el archivo queda en la raíz de la Biblioteca.`);

        const thumbUrl = await outroThumbnail(row);
        if (!thumbUrl) notes.push('No se pudo generar la miniatura; la rejilla usa el archivo.');

        const filename = `${slugify(row.title)}-${row.format.replace(':', 'x')}.mp4`;
        const { rows: media } = await db.query(
            `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key",
                                  "sourceType", "sourceId", "sourceLabel", "thumbUrl", "folderId", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, 'video', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
             RETURNING *`,
            [
                filename, row.videoUrl, Number(row.sizeBytes || 0),
                process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
                process.env.AWS_REGION || 'us-east-1',
                row.clubId, row.s3Key,
                row.clubId ? 'club' : 'platform', row.clubId, sourceLabel,
                thumbUrl, folderId
            ]
        );

        const config = { ...(row.config || {}), library: { folderId, thumbUrl, savedAt: new Date().toISOString(), notes } };
        const { rows: updated } = await db.query(
            `UPDATE "OutroProject" SET "mediaId" = $2, config = $3, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [row.id, media[0].id, JSON.stringify(config)]
        );

        console.log(`[OUTRO] ${row.id} guardado en la Biblioteca como ${media[0].id} (${row.s3Key})${folderId ? ` en la carpeta ${folderId}` : ''}`);
        res.status(201).json({ media: media[0], outro: rowToDto(updated[0]), notes });
    } catch (e) {
        console.error('[OUTRO] library:', e);
        res.status(500).json({ error: e.message });
    }
};

// Renombrar. Toca SÓLO el título del outro y, si ya está en la Biblioteca, el
// nombre del archivo que ésta muestra: la URL y la clave de S3 no cambian —
// un outro ya montado al final de un Reel sigue apuntando al mismo objeto.
export const renameOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const row = await fetchOutro(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Outro no encontrado' });
        const title = String(req.body?.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!title) return res.status(400).json({ error: 'El título no puede quedar vacío' });

        const { rows: updated } = await db.query(
            `UPDATE "OutroProject" SET title = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [row.id, title]
        );
        if (row.mediaId) {
            const filename = `${slugify(title)}-${row.format.replace(':', 'x')}.mp4`;
            await db.query('UPDATE "Media" SET filename = $2 WHERE id = $1', [row.mediaId, filename]).catch(() => {});
        }
        const defaultId = await readDefaultOutroId(row.clubId);
        if (defaultId === row.id) await writeDefaultOutro(row.clubId, updated[0]).catch(() => {});
        res.json(rowToDto(defaultId === row.id ? { ...updated[0], __isDefault: true } : updated[0]));
    } catch (e) {
        console.error('[OUTRO] rename:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Outro predeterminado del sitio ───────────────────────────────────────
//
// Vive en `Setting` (`default_outro`, único por (key, clubId)): es un ajuste
// del TENANT, como el logotipo o los botones del menú, y no una columna nueva
// en `OutroProject` — un booleano por fila permitiría dos predeterminados a
// la vez y obligaría a apagar el anterior en cada escritura. Lo que se guarda
// es lo que el Creador de Reels necesita para montar el clip sin volver a
// consultar el proyecto; el id es la verdad y el resto se refresca al leer.

const defaultPayloadOf = (row) => ({
    outroId: row.id,
    mediaId: row.mediaId || null,
    title: row.title,
    url: row.videoUrl,
    durationSec: row.durationSec != null ? Number(row.durationSec) : null,
    format: row.format,
    hasAudio: row.hasAudio === true,
    posterUrl: row.sourceImageUrl || null
});

const writeDefaultOutro = async (clubId, row) => {
    await db.query(
        `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())
         ON CONFLICT (key, "clubId") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
        [DEFAULT_OUTRO_SETTING_KEY, JSON.stringify(defaultPayloadOf(row)), clubId]
    );
};

// Resuelve el predeterminado DESDE el proyecto, acotado al sitio: un ajuste
// que apunte a un outro borrado o de otro sitio se lee como «ninguno», no
// como un clip que después no se puede montar.
const resolveDefaultOutro = async (clubId) => {
    const id = await readDefaultOutroId(clubId);
    if (!id) return null;
    const { rows } = await db.query(
        `SELECT * FROM "OutroProject" WHERE id = $1 AND "clubId" = $2 AND "videoUrl" IS NOT NULL`,
        [id, clubId]
    );
    return rows[0] ? { ...rows[0], __isDefault: true } : null;
};

export const getDefaultOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const clubId = defaultClubFor(req);
        if (!clubId) return res.json({ outro: null, reason: 'sin_sitio' });
        const row = await resolveDefaultOutro(clubId);
        res.json({ outro: row ? rowToDto(row) : null, clubId });
    } catch (e) {
        // Lo consulta el Creador de Reels al abrirse: un fallo acá no puede
        // dejar esa pantalla sin abrir. Se degrada y se dice.
        console.warn('[OUTRO] default (lectura):', e.message);
        res.json({ outro: null, error: e.message });
    }
};

export const setDefaultOutro = async (req, res) => {
    try {
        await ensureOutroSchema();
        const clubId = defaultClubFor(req);
        if (!clubId) return res.status(400).json({ error: 'El outro predeterminado es un ajuste de un sitio: entrá desde el panel del sitio que lo va a usar.' });
        const outroId = String(req.params.id || req.body?.outroId || '');
        if (!UUID_RE.test(outroId)) return res.status(400).json({ error: 'Falta el outro a predeterminar' });

        // El aislamiento va en el WHERE: un outro de otro sitio «no existe».
        const { rows } = await db.query(
            `SELECT * FROM "OutroProject" WHERE id = $1 AND "clubId" = $2`, [outroId, clubId]
        );
        const row = rows[0];
        if (!row) return res.status(404).json({ error: 'Outro no encontrado en este sitio' });
        if (!row.videoUrl) return res.status(400).json({ error: 'El outro todavía no tiene archivo generado: no se puede predeterminar' });

        await writeDefaultOutro(clubId, row);
        console.log(`[OUTRO] ${row.id} pasa a ser el outro predeterminado del sitio ${clubId}`);
        res.json({ outro: rowToDto({ ...row, __isDefault: true }), defaultOutroId: row.id });
    } catch (e) {
        console.error('[OUTRO] default (escritura):', e);
        res.status(500).json({ error: e.message });
    }
};

export const clearDefaultOutro = async (req, res) => {
    try {
        const clubId = defaultClubFor(req);
        if (!clubId) return res.status(400).json({ error: 'El outro predeterminado es un ajuste de un sitio' });
        await db.query(`DELETE FROM "Setting" WHERE key = $1 AND "clubId" = $2`, [DEFAULT_OUTRO_SETTING_KEY, clubId]);
        res.json({ success: true, defaultOutroId: null });
    } catch (e) {
        console.error('[OUTRO] default (borrado):', e);
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
        // Si era el predeterminado del sitio, el ajuste deja de apuntar a nada:
        // se suelta, o el Creador de Reels ofrecería un clip que ya no existe.
        let wasDefault = false;
        if (row.clubId && (await readDefaultOutroId(row.clubId)) === row.id) {
            wasDefault = true;
            await db.query(`DELETE FROM "Setting" WHERE key = $1 AND "clubId" = $2`, [DEFAULT_OUTRO_SETTING_KEY, row.clubId]).catch(() => {});
        }
        res.json({ success: true, keptInLibrary: Boolean(row.mediaId), wasDefault });
    } catch (e) {
        console.error('[OUTRO] delete:', e);
        res.status(500).json({ error: e.message });
    }
};
