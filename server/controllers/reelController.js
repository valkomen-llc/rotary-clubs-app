// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — controlador
// v4.663.0
//
// Convierte TRES fotografías de la Biblioteca en un Reel vertical de ~15 s con
// movimiento cinematográfico, transiciones y banda sonora.
//
// FLUJO (asíncrono a propósito):
//
//   1. POST /reels           → inspecciona las fotos, las analiza, arma la
//                              narrativa, crea UNA tarea de video POR ESCENA y
//                              lanza la música. Responde de inmediato.
//   2. GET  /reels/:id/sync  → el navegador pregunta cada pocos segundos. Este
//                              paso hace avanzar la máquina de estados:
//                              escenas → música → montaje → validación.
//   3. POST /reels/:id/library → el usuario aprueba y recién ahí aparece en la
//                              Biblioteca multimedia.
//
// Por qué asíncrono: cada clip tarda 1-3 minutos en KIE, el montaje otro tanto,
// y la función de la API corta a los 120 s (vercel.json). Esperar dentro del
// request garantizaría un timeout. El webhook es la segunda vía.
//
// UNA TAREA POR ESCENA es la corrección de fondo respecto del módulo anterior:
// `triggerVideoGeneration` mandaba las tres imágenes juntas a UNA llamada de
// `kling-2.6/image-to-video`, que recibe UNA imagen. Nunca hubo tres clips.
//
// REGLA DURABLE HEREDADA: el archivo que devuelve un modelo NO se postprocesa.
// El buffer de cada clip se sube a S3 tal cual llega. Las mediciones de calidad
// son LECTURA. Lo único que se declara aparte es el MONTAJE —qué clip va
// cuándo, cómo se encadenan, qué suena debajo—, que es edición, no retoque.
// ════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import db from '../lib/db.js';
import { ensureReelSchema } from '../lib/ensureReelSchema.js';
import {
    REEL_FORMATS, DEFAULT_FORMAT, DEFAULT_QUALITY_TIER, resolveTier,
    VIDEO_ENGINES, DEFAULT_ENGINE, isEngineAvailable,
    MOTION_STYLES, DEFAULT_MOTION_STYLE, AUTO_MOTION_STYLE,
    TRANSITIONS, DEFAULT_TRANSITION, AUTO_TRANSITION,
    MUSIC_STYLES, DEFAULT_MUSIC_STYLE, AUTO_MUSIC_STYLE,
    REEL_STATUSES, SCENE_STATUSES, SCENE_COUNT, TARGET_TOTAL_SEC,
    MIN_SCENE_SEC, MAX_SCENE_SEC, MAX_AUTO_RETRIES,
    distributeDurations, resolveEngine, buildScenePrompt, buildReelTitle, computeProgress
} from '../lib/reelSpec.js';
import { directReel } from '../lib/reelDirector.js';
import {
    probeMp4, inspectSourceImages, validateSceneFile, validateReelFile,
    checkSceneFidelity, summarizeFidelity, REEL_THRESHOLDS
} from '../lib/reelQuality.js';
import {
    RENDER_PROVIDERS, activeRenderProvider, availableRenderProviders,
    renderChain, refreshFfmpegAvailability,
    buildEditSpec, submitRender, pollRender, fetchRenderBuffer
} from '../lib/reelRenderProviders.js';
import { extractFrames, isFfmpegAvailable } from '../lib/reelFfmpeg.js';
import {
    EXPANSION_PROVIDERS, DEFAULT_EXPANSION_PROVIDER, isExpansionProviderAvailable,
    EXPANSION_SETTINGS, PHOTO_TYPES,
    planExpansion, analyzeForExpansion, buildExpansionPrompt,
    startExpansion, pollExpansion, fetchExpandedImage,
    verifyExpansion, judgeExpansion
} from '../lib/canvasExpansion.js';
import {
    MUSIC_PROVIDERS, DEFAULT_MUSIC_PROVIDER, isMusicProviderAvailable,
    startSoundtrack, pollSoundtrack, fetchAudioBuffer
} from '../lib/reelMusic.js';
import { createKieVideoTask, getKieVideoTask, fetchKieVideoBuffer } from '../services/kieService.js';

export const REEL_MODULE_VERSION = '4.665.0';

console.log(`[reelController] v${REEL_MODULE_VERSION} cargado — Creador de Reels IA: 3 fotos → 3 escenas image-to-video (motor ${DEFAULT_ENGINE}), dirección con visión, fidelidad sobre fotogramas extraídos, música generativa y montaje con la cadena [${renderChain().join(' → ') || 'ninguno'}]`);

// La disponibilidad real de FFmpeg se comprueba una vez al arrancar, sin
// bloquear la carga del módulo: hasta que responda, el registro lo da por
// disponible (es un binario que viaja con la aplicación).
refreshFfmpegAvailability()
    .then(ok => console.log(`[reelController] FFmpeg ${ok ? 'disponible' : 'NO disponible — el montaje usará un proveedor alojado'}`))
    .catch(() => { });

// ─── Utilidades ────────────────────────────────────────────────────────────

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

const fetchProject = async (id, user) => {
    const { sql, params } = scopeClause(user, 2);
    const where = sql ? `id = $1 AND ${sql}` : 'id = $1';
    const { rows } = await db.query(`SELECT * FROM "ReelProject" WHERE ${where}`, [id, ...params]);
    return rows[0] || null;
};

const fetchScenes = async (projectId) => {
    const { rows } = await db.query(
        'SELECT * FROM "ReelScene" WHERE "projectId" = $1 ORDER BY position ASC', [projectId]
    );
    return rows;
};

// Cliente S3 propio y perezoso, igual que en el Generador de Outros: el de
// lib/storage.js fija socketTimeout en 5 s, suficiente para una imagen pero
// corto para subir un MP4 de varios megas.
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

const slugify = (text, fallback = 'reel') => {
    const s = String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s.slice(0, 60) || fallback;
};

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

const publicUrlFor = (bucket, key) => {
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encoded}`;
};

const uploadBuffer = async (buffer, key, contentType) => {
    const { s3, PutObjectCommand } = await getS3();
    const bucket = bucketName();
    await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000'
    }));
    return { url: publicUrlFor(bucket, key), key, bucket };
};

const appendNote = async (projectId, note) => {
    if (!note) return;
    await db.query(
        `UPDATE "ReelProject" SET notes = notes || $2::jsonb, "updatedAt" = NOW() WHERE id = $1`,
        [projectId, JSON.stringify([note])]
    );
};

// ─── DTOs ──────────────────────────────────────────────────────────────────

const sceneToDto = (row) => ({
    id: row.id,
    projectId: row.projectId,
    position: row.position,
    sourceIndex: row.sourceIndex,
    sourceImageUrl: row.sourceImageUrl,
    sourceMediaId: row.sourceMediaId,
    sourceReport: row.sourceReport,
    // La imagen que realmente se anima. Se expone junto a la original para que
    // la pantalla pueda mostrar las dos y el usuario vea qué se generó.
    expandedImageUrl: row.expandedImageUrl,
    animationSourceUrl: row.expandedImageUrl || row.sourceImageUrl,
    expansionProvider: row.expansionProvider,
    expansionReport: row.expansionReport,
    expansionAttempts: row.expansionAttempts,
    style: row.style,
    styleLabel: MOTION_STYLES[row.style]?.label || row.style,
    transitionOut: row.transitionOut,
    transitionLabel: TRANSITIONS[row.transitionOut]?.label || row.transitionOut,
    prompt: row.prompt,
    analysis: row.analysis,
    note: row.note,
    durationSec: row.durationSec != null ? Number(row.durationSec) : null,
    generatedDurationSec: row.generatedDurationSec != null ? Number(row.generatedDurationSec) : null,
    engine: row.engine,
    engineLabel: VIDEO_ENGINES[row.engine]?.label || row.engine,
    status: row.status,
    statusLabel: SCENE_STATUSES[row.status]?.label || row.status,
    statusDetail: row.statusDetail,
    attempts: row.attempts,
    videoUrl: row.videoUrl,
    posterUrl: row.posterUrl,
    width: row.width,
    height: row.height,
    bitrateKbps: row.bitrateKbps,
    sizeBytes: row.sizeBytes != null ? Number(row.sizeBytes) : null,
    quality: row.quality,
    fidelity: row.fidelity,
    frames: row.frames || [],
    creditsEstimated: row.creditsEstimated
});

const projectToDto = (row, scenes = []) => {
    const sceneDtos = scenes.map(sceneToDto);
    const scenesReady = sceneDtos.filter(s => SCENE_STATUSES[s.status]?.terminal).length;
    return {
        id: row.id,
        title: row.title,
        clubId: row.clubId,
        organizationName: row.organizationName,
        format: row.format,
        formatLabel: REEL_FORMATS[row.format]?.label || row.format,
        qualityTier: row.qualityTier,
        qualityLabel: resolveTier(row.format, row.qualityTier).label,
        motionStyle: row.motionStyle,
        transition: row.transition,
        musicStyle: row.musicStyle,
        musicStyleLabel: MUSIC_STYLES[row.direction?.musicStyle || row.musicStyle]?.label || null,
        config: row.config,
        engine: row.engine,
        engineLabel: VIDEO_ENGINES[row.engine]?.label || row.engine,
        engineModel: row.engineModel,
        analysis: row.analysis,
        direction: row.direction,
        musicProvider: row.musicProvider,
        musicUrl: row.musicUrl,
        musicPrompt: row.musicPrompt,
        renderProvider: row.renderProvider,
        renderProviderLabel: RENDER_PROVIDERS[row.renderProvider]?.label || row.renderProvider,
        status: row.status,
        statusLabel: REEL_STATUSES[row.status]?.label || row.status,
        statusDetail: row.statusDetail,
        // El progreso se calcula con la misma función en los dos lados, para
        // que la barra no diga una cosa y la ficha otra.
        progress: computeProgress(row.status, { scenesReady, scenesTotal: sceneDtos.length || SCENE_COUNT }),
        attempts: row.attempts,
        notes: row.notes || [],
        videoUrl: row.videoUrl,
        posterUrl: row.posterUrl,
        durationSec: row.durationSec != null ? Number(row.durationSec) : null,
        width: row.width,
        height: row.height,
        bitrateKbps: row.bitrateKbps,
        sizeBytes: row.sizeBytes != null ? Number(row.sizeBytes) : null,
        hasAudio: row.hasAudio,
        quality: row.quality,
        fidelitySummary: summarizeFidelity(sceneDtos),
        creditsEstimated: row.creditsEstimated,
        processingMs: row.processingMs,
        mediaId: row.mediaId,
        parentId: row.parentId,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        scenes: sceneDtos
    };
};

const respondProject = async (res, row, status = 200) => {
    const scenes = await fetchScenes(row.id);
    res.status(status).json(projectToDto(row, scenes));
};

// ─── Consumo de créditos ───────────────────────────────────────────────────
//
// Medidor PROPIO, no el saldo real de KIE: la pasarela no expone el balance de
// forma estable. Sirve para ver el gasto del mes y frenar antes de dispararlo
// (REEL_MONTHLY_CREDIT_LIMIT). No presentarlo como el saldo del proveedor.
const monthlyLimit = () => {
    const raw = Number(process.env.REEL_MONTHLY_CREDIT_LIMIT);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
};

const creditUsage = async (user) => {
    const { sql, params } = scopeClause(user, 1);
    const where = [`"createdAt" >= date_trunc('month', CURRENT_DATE)`];
    if (sql) where.push(sql);
    const { rows } = await db.query(
        `SELECT COALESCE(SUM("creditsEstimated"), 0)::int AS spent, COUNT(*)::int AS generations
         FROM "ReelProject" WHERE ${where.join(' AND ')}`,
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

export const getReelOptions = async (req, res) => {
    try {
        await ensureReelSchema();
        const usage = await creditUsage(req.user);
        const renderProvider = activeRenderProvider();

        res.json({
            formats: Object.values(REEL_FORMATS).map(f => ({
                id: f.id, label: f.label, master: f.master,
                isDefault: Boolean(f.isDefault),
                tiers: Object.values(f.tiers)
            })),
            defaultFormat: DEFAULT_FORMAT,
            defaultQualityTier: DEFAULT_QUALITY_TIER,

            engines: Object.values(VIDEO_ENGINES).map(e => ({
                id: e.id, label: e.label, provider: e.provider,
                durations: e.durations, nativeAudio: e.nativeAudio,
                fidelity: e.fidelity, creditEstimate: e.creditEstimate,
                available: isEngineAvailable(e.id),
                isDefault: e.id === DEFAULT_ENGINE,
                note: e.note
            })),
            defaultEngine: DEFAULT_ENGINE,

            motionStyles: Object.entries(MOTION_STYLES).map(([id, s]) => ({
                id, label: s.label, description: s.description, intensity: s.intensity
            })),
            defaultMotionStyle: AUTO_MOTION_STYLE,

            transitions: Object.entries(TRANSITIONS).map(([id, t]) => ({
                id, label: t.label, description: t.description, overlap: t.overlap
            })),
            defaultTransition: AUTO_TRANSITION,

            musicStyles: Object.entries(MUSIC_STYLES).map(([id, m]) => ({
                id, label: m.label, mood: m.mood, bpm: m.bpm
            })),
            defaultMusicStyle: AUTO_MUSIC_STYLE,
            musicProviders: Object.values(MUSIC_PROVIDERS).map(p => ({
                id: p.id, label: p.label, note: p.note,
                available: isMusicProviderAvailable(p.id),
                isDefault: p.id === DEFAULT_MUSIC_PROVIDER
            })),

            // El montaje es lo único que puede faltar por completo. La UI lo
            // dice de frente en vez de dejar al usuario descubrirlo al final.
            render: {
                provider: renderProvider,
                providerLabel: RENDER_PROVIDERS[renderProvider]?.label || null,
                available: Boolean(renderProvider),
                candidates: Object.values(RENDER_PROVIDERS).map(p => ({
                    id: p.id, label: p.label, note: p.note,
                    available: availableRenderProviders().includes(p.id),
                    envKey: p.envKey
                })),
                unavailableReason: renderProvider ? null
                    : 'Sin proveedor de montaje configurado, las escenas se generan y quedan descargables por separado, pero no se unen en un solo Reel.'
            },

            // Expansión Inteligente: qué proveedor hay y con qué ajustes. Se
            // expone entero para que el panel pueda mostrarlo sin adivinar.
            expansion: (() => {
                const settings = EXPANSION_SETTINGS();
                return {
                    available: isExpansionProviderAvailable(settings.provider),
                    provider: settings.provider,
                    providerLabel: EXPANSION_PROVIDERS[settings.provider]?.label || null,
                    providers: Object.values(EXPANSION_PROVIDERS).map(p => ({
                        id: p.id, label: p.label, note: p.note,
                        preservation: p.preservation,
                        available: isExpansionProviderAvailable(p.id),
                        isDefault: p.id === DEFAULT_EXPANSION_PROVIDER
                    })),
                    photoTypes: Object.entries(PHOTO_TYPES).map(([id, t]) => ({ id, label: t.label })),
                    settings,
                    // Se nombra lo que hace y lo que NO: sin composite del
                    // original no hay 100% garantizado, hay un porcentaje
                    // medido. Prometer lo primero sería mentir.
                    note: 'Las fotos que no están en el formato del Reel se adaptan generando el lienzo que falta, sin recortar. La conservación del original se mide sobre su propia región y se rehace la adaptación si no llega al umbral.'
                };
            })(),

            timing: {
                sceneCount: SCENE_COUNT,
                targetTotalSec: TARGET_TOTAL_SEC,
                minSceneSec: MIN_SCENE_SEC,
                maxSceneSec: MAX_SCENE_SEC
            },
            statuses: REEL_STATUSES,
            sceneStatuses: SCENE_STATUSES,
            thresholds: REEL_THRESHOLDS,
            usage
        });
    } catch (e) {
        console.error('[REEL] options:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Comprobación previa ───────────────────────────────────────────────────
//
// Mira las tres fotos ANTES de gastar créditos. Devuelve avisos, no bloqueos:
// quien sube una foto un poco blanda puede querer generar igual.
export const preflightReel = async (req, res) => {
    try {
        const { images, format = DEFAULT_FORMAT } = req.body || {};
        if (!Array.isArray(images) || images.length !== SCENE_COUNT) {
            return res.status(400).json({ error: `El Reel se arma con exactamente ${SCENE_COUNT} imágenes.` });
        }

        const buffers = await Promise.all(images.map(async (img) => {
            const resp = await fetch(img.url);
            if (!resp.ok) throw new Error(`No se pudo leer la imagen ${img.url} (${resp.status})`);
            return Buffer.from(await resp.arrayBuffer());
        }));

        const inspection = await inspectSourceImages(buffers, { format });

        let engine;
        try {
            engine = resolveEngine({ engine: req.body?.engine, format, qualityTier: req.body?.qualityTier });
        } catch (err) {
            // Sin motor no hay Reel posible, pero la inspección de las fotos ya
            // se hizo y vale: se devuelve junto al motivo, que es accionable
            // (falta una credencial), en vez de un 500 genérico.
            return res.status(503).json({ ...inspection, error: err.message });
        }

        const usage = await creditUsage(req.user);

        res.json({
            ...inspection,
            engine: { id: engine.engineId, label: engine.engine.label, notes: engine.notes },
            creditEstimate: engine.creditEstimatePerScene * SCENE_COUNT,
            usage,
            render: { provider: activeRenderProvider(), available: Boolean(activeRenderProvider()) }
        });
    } catch (e) {
        console.error('[REEL] preflight:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Creación ──────────────────────────────────────────────────────────────

// ─── Adaptación del lienzo (AI Canvas Expansion) ───────────────────────────
//
// Corre ANTES de animar. Los motores image-to-video heredan la proporción de la
// imagen: una foto apaisada da un clip apaisado que el montaje tenía que
// recortar. Expandir el lienzo es lo único que evita esa pérdida.
//
// La foto ORIGINAL nunca se pisa. `sourceImageUrl` sigue apuntando a ella y la
// adaptada vive en `expandedImageUrl`: así se pueden comparar las dos, rehacer
// la adaptación y volver atrás.

// Qué imagen se le manda al motor de video: la adaptada si existe, la original
// si no. Una sola función para que no se decida distinto en dos sitios.
const animationSourceOf = (scene) => scene.expandedImageUrl || scene.sourceImageUrl;

// Decide y lanza la adaptación de UNA escena. Devuelve la fila actualizada.
const startSceneExpansion = async (scene, { targetWidth, targetHeight, settings }) => {
    // 1. ¿Hace falta? Una foto que ya está en el formato no se toca — es lo más
    //    importante que hace este paso: no gastar créditos ni arriesgar deriva.
    let meta = null;
    try {
        const resp = await fetch(scene.sourceImageUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buffer = Buffer.from(await resp.arrayBuffer());
        const sharp = (await import('sharp')).default;
        meta = await sharp(buffer, { failOn: 'none' }).metadata();
    } catch (e) {
        const { rows } = await db.query(
            `UPDATE "ReelScene" SET status = 'pending',
                 "expansionReport" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [scene.id, JSON.stringify({ action: 'skip', ok: false, reason: `No se pudo leer la fotografía: ${e.message}` })]
        );
        return rows[0];
    }

    const plan = planExpansion({
        width: meta.width, height: meta.height,
        targetWidth, targetHeight, settings
    });

    if (plan.action === 'skip') {
        const { rows } = await db.query(
            `UPDATE "ReelScene" SET status = 'pending',
                 "expansionReport" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [scene.id, JSON.stringify({ ...plan, sourceWidth: meta.width, sourceHeight: meta.height })]
        );
        return rows[0];
    }

    // 2. Mirar la foto para saber CÓMO continuarla. Sin esto el modelo rellena
    //    con lo que le parece y se nota dónde termina el original.
    const analysis = await analyzeForExpansion(scene.sourceImageUrl);
    const prompt = buildExpansionPrompt({
        analysis, plan,
        targetLabel: `${targetWidth}x${targetHeight}`
    });

    try {
        const { provider, taskId } = await startExpansion({
            imageUrl: scene.sourceImageUrl,
            prompt, targetWidth, targetHeight,
            provider: settings.provider
        });
        const { rows } = await db.query(
            `UPDATE "ReelScene"
             SET status = 'expanding', "expansionTaskId" = $2, "expansionProvider" = $3,
                 "expansionPrompt" = $4, "expansionReport" = $5,
                 "expansionAttempts" = "expansionAttempts" + 1, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [
                scene.id, taskId, provider, prompt,
                JSON.stringify({ ...plan, analysis, sourceWidth: meta.width, sourceHeight: meta.height, state: 'running' })
            ]
        );
        console.log(`[EXPANSION] escena ${scene.id}: ${meta.width}x${meta.height} → ${targetWidth}x${targetHeight} (${plan.orientation}, ${Math.round(plan.generatedFraction * 100)}% nuevo) con ${provider}`);
        return rows[0];
    } catch (e) {
        // Sin adaptación se anima la original: el Reel sale, con el encuadre
        // recortado por el montaje. Degradar es mejor que no entregar nada.
        console.error(`[EXPANSION] escena ${scene.id} no se pudo lanzar:`, e.message);
        const { rows } = await db.query(
            `UPDATE "ReelScene" SET status = 'pending',
                 "expansionReport" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [scene.id, JSON.stringify({ ...plan, analysis, ok: false, failed: true, reason: `No se pudo adaptar la imagen: ${e.message} Se anima la original.` })]
        );
        return rows[0];
    }
};

// Hace avanzar la adaptación de UNA escena: consulta, descarga, verifica y
// decide si vale o hay que rehacerla.
const advanceSceneExpansion = async (scene, settings) => {
    if (scene.status !== 'expanding' || !scene.expansionTaskId) return scene;

    const task = await pollExpansion(scene.expansionTaskId);
    if (task.state === 'queued' || task.state === 'running') return scene;

    const report = scene.expansionReport || {};

    if (task.state === 'failed') {
        console.warn(`[EXPANSION] escena ${scene.id} falló: ${task.failMsg}`);
        const { rows } = await db.query(
            `UPDATE "ReelScene" SET status = 'pending',
                 "expansionReport" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [scene.id, JSON.stringify({ ...report, ok: false, failed: true, reason: `La adaptación falló: ${task.failMsg} Se anima la fotografía original.` })]
        );
        return rows[0];
    }

    // Llegó. Se descarga, se mide cuánto se conservó y se decide.
    try {
        const expandedBuffer = await fetchExpandedImage(task.imageUrl);
        const originalResp = await fetch(scene.sourceImageUrl);
        const originalBuffer = Buffer.from(await originalResp.arrayBuffer());

        const verification = await verifyExpansion(originalBuffer, expandedBuffer, report);
        const judgement = judgeExpansion(verification, settings);

        // Por debajo del umbral se rehace, mientras queden intentos. Es el
        // único uso legítimo de un reintento: no se reintenta "por si acaso",
        // se reintenta porque una medición dijo que no alcanzó.
        if (judgement.verdict === 'failed' && settings.autoRegenerate && scene.expansionAttempts < settings.maxRetries + 1) {
            console.warn(`[EXPANSION] escena ${scene.id}: ${judgement.reason} Reintento ${scene.expansionAttempts}/${settings.maxRetries}.`);
            await db.query(
                `UPDATE "ReelScene" SET "expansionTaskId" = NULL, "expansionReport" = $2, "updatedAt" = NOW() WHERE id = $1`,
                [scene.id, JSON.stringify({ ...report, verification, judgement, retrying: true })]
            );
            const { rows: fresh } = await db.query('SELECT * FROM "ReelScene" WHERE id = $1', [scene.id]);
            return startSceneExpansion(fresh[0], {
                targetWidth: verification.width || 1080,
                targetHeight: verification.height || 1920,
                settings
            });
        }

        const upload = await uploadBuffer(
            expandedBuffer,
            `clubs/${scene.clubId || 'global'}/reels/expanded/${scene.id}-${Date.now()}.png`,
            'image/png'
        );

        const { rows } = await db.query(
            `UPDATE "ReelScene"
             SET status = 'pending', "expandedImageUrl" = $2, "expandedS3Key" = $3,
                 "expansionReport" = $4, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [scene.id, upload.url, upload.key, JSON.stringify({ ...report, state: 'done', verification, judgement })]
        );

        console.log(`[EXPANSION] escena ${scene.id} adaptada → ${judgement.verdict} (${judgement.reason})`);
        return rows[0];
    } catch (e) {
        console.error(`[EXPANSION] escena ${scene.id} no se pudo guardar:`, e.message);
        const { rows } = await db.query(
            `UPDATE "ReelScene" SET status = 'pending',
                 "expansionReport" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [scene.id, JSON.stringify({ ...report, ok: false, failed: true, reason: `No se pudo guardar la imagen adaptada: ${e.message} Se anima la original.` })]
        );
        return rows[0];
    }
};

// Lanza la tarea de video de UNA escena. Se usa al crear y al regenerar.
const dispatchScene = async (scene, { engineId, model }) => {
    const engine = VIDEO_ENGINES[engineId];
    const taskId = await createKieVideoTask({
        model,
        prompt: scene.prompt,
        // La adaptada si existe; la original si la adaptación no hizo falta o
        // no salió. `animationSourceOf` es el único sitio donde se decide.
        imageUrl: animationSourceOf(scene),
        // La relación de aspecto la hereda de la imagen en los modelos
        // image-to-video: se manda por compatibilidad con los que sí la leen,
        // pero lo que vale es la proporción de la foto. Por eso se contrasta
        // antes (preflight) y después (validación), y nunca se recorta.
        aspectRatio: scene.format || DEFAULT_FORMAT,
        duration: scene.generatedDurationSec || scene.durationSec,
        resolution: '1080p',
        // Los clips van MUDOS a propósito cuando hay banda sonora del montaje:
        // dos pistas compitiendo suena peor que una sola bien puesta.
        enableAudio: false,
        callBackUrl: `${process.env.APP_URL || 'https://app.clubplatform.org'}/api/content-studio/webhook`,
        metadata: { reelSceneId: scene.id, reelProjectId: scene.projectId }
    });

    const { rows } = await db.query(
        `UPDATE "ReelScene"
         SET "kieJobId" = $2, status = 'generating', "statusDetail" = NULL,
             engine = $3, "engineModel" = $4,
             "creditsEstimated" = "creditsEstimated" + $5, "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [scene.id, taskId, engineId, model, engine?.creditEstimate || 0]
    );
    return rows[0];
};

export const createReel = async (req, res) => {
    const startedAt = Date.now();
    try {
        await ensureReelSchema();

        const {
            images,
            format = DEFAULT_FORMAT,
            qualityTier = DEFAULT_QUALITY_TIER,
            motionStyle = AUTO_MOTION_STYLE,
            transition = AUTO_TRANSITION,
            musicStyle = AUTO_MUSIC_STYLE,
            engine: requestedEngine = null,
            title = null,
            organizationName = null,
            withMusic = true
        } = req.body || {};

        if (!Array.isArray(images) || images.length !== SCENE_COUNT) {
            return res.status(400).json({ error: `El Reel se arma con exactamente ${SCENE_COUNT} imágenes.` });
        }
        if (images.some(i => !i?.url)) {
            return res.status(400).json({ error: 'Cada imagen debe traer su URL.' });
        }

        const usage = await creditUsage(req.user);
        if (usage.exceeded) {
            return res.status(429).json({
                error: `Se alcanzó el límite mensual de créditos (${usage.limit}). Ajustar REEL_MONTHLY_CREDIT_LIMIT o esperar al mes próximo.`,
                usage
            });
        }

        // Normalización contra los catálogos. Nada de confiar en el navegador.
        const safeFormat = REEL_FORMATS[format] ? format : DEFAULT_FORMAT;
        const safeMotion = (motionStyle === AUTO_MOTION_STYLE || MOTION_STYLES[motionStyle]) ? motionStyle : AUTO_MOTION_STYLE;
        const safeTransition = (transition === AUTO_TRANSITION || TRANSITIONS[transition]) ? transition : AUTO_TRANSITION;
        const safeMusic = (musicStyle === AUTO_MUSIC_STYLE || MUSIC_STYLES[musicStyle]) ? musicStyle : AUTO_MUSIC_STYLE;

        let engineChoice;
        try {
            engineChoice = resolveEngine({ engine: requestedEngine, format: safeFormat, qualityTier });
        } catch (e) {
            return res.status(503).json({ error: e.message });
        }

        // 1. Dirección: análisis de las tres fotos + narrativa. Es lo único
        //    síncrono del flujo y cuesta ~15 s; entra de sobra en los 120.
        const { analyses, direction, warnings } = await directReel(images, {
            motionStyle: safeMotion, transition: safeTransition, musicStyle: safeMusic
        });

        // 2. Reparto de la duración según los pesos que propuso el director,
        //    ajustado a lo que el motor sabe entregar.
        const transitionsUsed = direction.scenes.slice(0, -1).map(s => s.transitionOut);
        const timing = distributeDurations({
            weights: direction.scenes.map(s => s.weight),
            totalSec: TARGET_TOTAL_SEC,
            count: SCENE_COUNT,
            transitions: transitionsUsed,
            engineDurations: engineChoice.durations
        });

        const projectId = randomUUID();
        const resolvedTitle = title || buildReelTitle({
            organizationName,
            motionStyle: safeMotion === AUTO_MOTION_STYLE ? direction.scenes[0]?.style : safeMotion,
            format: safeFormat
        });

        const notes = [...engineChoice.notes, ...warnings];

        // Que fallen LAS TRES no es mala suerte con una foto: es el módulo de
        // visión caído o mal configurado. El fallback deja el Reel en pie —y
        // está bien que lo haga—, pero degradado sin decirlo se confunde con
        // funcionar. En v4.663.0 eso escondió un fallo propio durante todo un
        // despliegue. Se dice arriba del todo, no sólo foto por foto.
        if (analyses.every(a => a.failed)) {
            notes.push(
                'No se pudo analizar ninguna de las tres fotos: el Reel se armó con el criterio por defecto (abre la toma más abierta, cierra la que lleva la marca) y los prompts van sin refuerzo de marca ni de personas. Revisar las credenciales del proveedor de copy.'
            );
        }
        // La duración real se dice de frente. Con un motor que entrega clips de
        // 5 s exactos, tres escenas y dos fundidos dan 14 s, no 15: alargarlo
        // costaría generar clips de 10 s para tirar la mitad. Es la "duración
        // aproximada" del pedido, pero el número tiene que estar a la vista.
        if (Math.abs(timing.finalDurationSec - TARGET_TOTAL_SEC) > 0.6) {
            notes.push(
                `El Reel dura ${timing.finalDurationSec}s: ${engineChoice.engine.label} entrega clips de ${engineChoice.durations.join(' o ')}s y las transiciones solapan ${timing.overlapTotal}s.`
            );
        }
        if (!activeRenderProvider()) {
            notes.push('Sin proveedor de montaje configurado: las escenas se generan por separado y el Reel no se une automáticamente.');
        }

        await db.query(
            `INSERT INTO "ReelProject" (
                id, title, "clubId", "userId", "userEmail", "organizationName",
                format, "qualityTier", "motionStyle", transition, "musicStyle", config,
                engine, "engineModel", analysis, direction,
                status, notes, "creditsEstimated", version, "createdAt", "updatedAt"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'expanding',$17,0,$18,NOW(),NOW())`,
            [
                projectId, resolvedTitle, req.user?.clubId || null, req.user?.id || null,
                req.user?.email || null, organizationName,
                safeFormat, engineChoice.qualityTier, safeMotion, safeTransition, safeMusic,
                JSON.stringify({
                    timing,
                    withMusic: Boolean(withMusic),
                    requestedEngine: requestedEngine || null,
                    sourceImages: images.map(i => ({ id: i.id || null, url: i.url }))
                }),
                engineChoice.engineId, engineChoice.model,
                JSON.stringify(analyses), JSON.stringify(direction),
                JSON.stringify(notes), REEL_MODULE_VERSION
            ]
        );

        // 3. Una fila y una tarea POR ESCENA.
        const sceneRows = [];
        for (let position = 0; position < direction.scenes.length; position++) {
            const plan = direction.scenes[position];
            const source = images[plan.sourceIndex];
            const analysis = analyses[plan.sourceIndex];
            const prompt = buildScenePrompt({
                style: plan.style,
                durationSec: timing.generated[position],
                analysis,
                withAudio: false,
                musicStyle: direction.musicStyle
            });

            const sceneId = randomUUID();
            const { rows } = await db.query(
                `INSERT INTO "ReelScene" (
                    id, "projectId", "clubId", format, position, "sourceIndex", "sourceImageUrl", "sourceMediaId",
                    style, "transitionOut", prompt, analysis, note,
                    "durationSec", "generatedDurationSec", engine, "engineModel", status, "createdAt", "updatedAt"
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pending',NOW(),NOW())
                 RETURNING *`,
                [
                    sceneId, projectId, req.user?.clubId || null, safeFormat,
                    position, plan.sourceIndex, source.url, source.id || null,
                    plan.style, plan.transitionOut, prompt, JSON.stringify(analysis), plan.note,
                    timing.requested[position], timing.generated[position],
                    engineChoice.engineId, engineChoice.model
                ]
            );
            sceneRows.push(rows[0]);
        }

        // ── Adaptación del lienzo antes de animar ──
        //
        // Se lanza acá, no en el sondeo, porque decidir si hace falta es barato
        // (leer el tamaño de la foto) y así el usuario ve la etapa desde el
        // primer momento. Las que ya están en formato pasan directo a `pending`
        // sin gastar un crédito.
        const settings = EXPANSION_SETTINGS();
        const tier = resolveTier(safeFormat, engineChoice.qualityTier);
        const expanded = await Promise.allSettled(
            sceneRows.map(scene => startSceneExpansion(scene, {
                targetWidth: tier.width, targetHeight: tier.height, settings
            }))
        );
        const afterExpansion = expanded.map((r, i) => r.status === 'fulfilled' ? r.value : sceneRows[i]);
        const needExpansion = afterExpansion.filter(sc => sc.status === 'expanding');

        // Las que no necesitan adaptación arrancan el video ya; las demás lo
        // harán cuando su lienzo esté listo.
        const readyToAnimate = afterExpansion.filter(sc => sc.status === 'pending');
        const dispatched = await Promise.allSettled(
            readyToAnimate.map(scene => dispatchScene(scene, { engineId: engineChoice.engineId, model: engineChoice.model }))
        );
        const failures = dispatched
            .map((r, i) => ({ r, i }))
            .filter(({ r }) => r.status === 'rejected');

        for (const { r, i } of failures) {
            console.error(`[REEL] escena ${readyToAnimate[i].position} no se pudo lanzar:`, r.reason?.message);
            await db.query(
                `UPDATE "ReelScene" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW() WHERE id = $1`,
                [readyToAnimate[i].id, r.reason?.message || 'No se pudo crear la tarea en el proveedor']
            );
        }

        // Si NINGUNA escena se pudo lanzar —ni animar ni adaptar—, el proyecto
        // nace muerto y conviene decirlo con el error del proveedor tal cual:
        // es lo único que permite corregir un id de modelo mal configurado sin
        // desplegar.
        if (!needExpansion.length && failures.length === readyToAnimate.length && readyToAnimate.length > 0) {
            const reason = failures[0].r.reason?.message || 'Error desconocido';
            await db.query(
                `UPDATE "ReelProject" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW() WHERE id = $1`,
                [projectId, `Ninguna escena pudo lanzarse: ${reason}`]
            );
            const { rows } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [projectId]);
            return respondProject(res, rows[0], 502);
        }

        // 4. La música arranca en paralelo con las escenas: tarda menos y así
        //    ya está lista cuando los clips terminan.
        if (withMusic) {
            try {
                const track = await startSoundtrack({
                    style: direction.musicStyle,
                    durationSec: timing.finalDurationSec,
                    clubId: req.user?.clubId || null,
                    metadata: { reelProjectId: projectId }
                });
                await db.query(
                    `UPDATE "ReelProject"
                     SET "musicProvider" = $2, "musicTaskId" = $3, "musicUrl" = $4, "musicPrompt" = $5, "updatedAt" = NOW()
                     WHERE id = $1`,
                    [projectId, track.provider, track.taskId, track.url, track.prompt || null]
                );
                if (track.state === 'failed') {
                    await appendNote(projectId, `Banda sonora: ${track.failMsg} El Reel se monta sin música.`);
                }
            } catch (e) {
                console.error('[REEL] música no se pudo lanzar:', e.message);
                await appendNote(projectId, `No se pudo generar la banda sonora: ${e.message} El Reel se monta sin música.`);
            }
        }

        // Sin ninguna adaptación en curso, la etapa se atraviesa sin pararse.
        await db.query(
            `UPDATE "ReelProject"
             SET "creditsEstimated" = (SELECT COALESCE(SUM("creditsEstimated"),0)::int FROM "ReelScene" WHERE "projectId" = $1),
                 "processingMs" = $2, status = $3, "updatedAt" = NOW()
             WHERE id = $1`,
            [projectId, Date.now() - startedAt, needExpansion.length ? 'expanding' : 'generating']
        );

        for (const sc of afterExpansion) {
            const r = sc.expansionReport;
            if (r?.failed && r?.reason) await appendNote(projectId, `Escena ${sc.position + 1}: ${r.reason}`);
        }

        const { rows } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [projectId]);
        console.log(`[REEL] ${projectId} creado — ${sceneRows.length - failures.length}/${SCENE_COUNT} escenas lanzadas, ${timing.finalDurationSec}s, ${engineChoice.engine.label}`);
        await respondProject(res, rows[0], 201);
    } catch (e) {
        console.error('[REEL] create:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Avance de la máquina de estados ───────────────────────────────────────

// Baja el clip de una escena, lo mide, comprueba su fidelidad y lo sube a S3.
// El UPDATE condicional es el que decide quién hace el trabajo cuando el
// sondeo y el webhook ven "success" a la vez: la petición que no logra pasar la
// escena a `validating` se va sin descargar ni subir nada. La ventana de 5
// minutos es la salida de emergencia por si la que reclamó murió a mitad.
const ingestScene = async (scene, providerUrl, posterUrl = null) => {
    const { rows: claimed } = await db.query(
        `UPDATE "ReelScene"
         SET status = 'validating', "providerUrl" = $2, "updatedAt" = NOW()
         WHERE id = $1 AND (status <> 'validating' OR "updatedAt" < NOW() - INTERVAL '5 minutes')
         RETURNING id`,
        [scene.id, providerUrl]
    );
    if (claimed.length === 0) {
        const { rows } = await db.query('SELECT * FROM "ReelScene" WHERE id = $1', [scene.id]);
        return rows[0] || scene;
    }

    const buffer = await fetchKieVideoBuffer(providerUrl);

    // Lectura pura: el buffer que se sube es exactamente el que llegó.
    const probe = probeMp4(buffer);
    const quality = validateSceneFile(probe, { expectedDurationSec: Number(scene.durationSec) });

    const upload = await uploadBuffer(
        buffer,
        `clubs/${scene.clubId || 'global'}/reels/scenes/${scene.projectId}/${scene.position}-${Date.now()}.mp4`,
        'video/mp4'
    );

    // ── Fidelidad ──
    //
    // Los fotogramas se sacan del PROPIO clip con FFmpeg. Hasta v4.663 esto
    // dependía de que el proveedor entregara una portada, y Kling no la manda:
    // el resultado era «fidelidad no comprobada» en todas las escenas, siempre.
    // Depender de un dato opcional de un tercero para una comprobación propia
    // era el error.
    const fidelity = await runSceneFidelity(scene, buffer, probe, posterUrl);

    // Una escena que no conserva la fotografía no sirve, por buena que sea su
    // codificación. Es el sistema de preservación visual del módulo.
    const verdict = fidelity.state === 'failed' ? 'needs_review' : quality.verdict;
    const detail = [
        ...(quality.failures || []),
        ...(fidelity.state === 'failed' ? [fidelity.reason, ...(fidelity.issues || [])] : [])
    ].filter(Boolean);

    const { rows } = await db.query(
        `UPDATE "ReelScene"
         SET status = $2, "statusDetail" = $3, "videoUrl" = $4, "s3Key" = $5, "posterUrl" = $6,
             "generatedDurationSec" = $7, width = $8, height = $9, "bitrateKbps" = $10,
             "sizeBytes" = $11, quality = $12, fidelity = $13, frames = $14, "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [
            scene.id, verdict, detail.length ? detail.join(' · ') : null,
            upload.url, upload.key,
            fidelity.frames?.[0]?.frameUrl || posterUrl,
            probe.durationSec, probe.width, probe.height, probe.bitrateKbps,
            probe.sizeBytes, JSON.stringify(quality), JSON.stringify(fidelity),
            JSON.stringify(fidelity.frames || [])
        ]
    );

    console.log(`[REEL] escena ${scene.projectId}/${scene.position} → ${verdict} (${probe.width}×${probe.height}, ${probe.durationSec}s, fidelidad=${fidelity.score ?? 'n/d'} por ${fidelity.method || 'sin comprobar'})`);
    return rows[0];
};

// Extrae los fotogramas, los publica y corre la comprobación de fidelidad.
// Aparte de `ingestScene` porque es la parte que puede fallar entera sin que
// eso invalide el clip: un fallo acá deja la escena sin comprobar, no rota.
const runSceneFidelity = async (scene, videoBuffer, probe, providerPosterUrl) => {
    try {
        const durationSec = probe.durationSec || Number(scene.durationSec) || 5;

        let frames = [];
        if (await isFfmpegAvailable()) {
            const raw = await extractFrames(videoBuffer, { durationSec, count: 3 });
            // Cada fotograma se sube: el modelo de visión los pide por URL, y
            // además quedan en el historial técnico de la escena.
            frames = await Promise.all(raw.map(async (f, i) => {
                const up = await uploadBuffer(
                    f.buffer,
                    `clubs/${scene.clubId || 'global'}/reels/frames/${scene.id}/${i}-${f.position}-${Date.now()}.jpg`,
                    'image/jpeg'
                );
                return {
                    ...f,
                    url: up.url,
                    // La comparación lado a lado se publica bajo demanda, sólo
                    // si se va a usar: son tres imágenes más por escena.
                    publish: async (composite) => {
                        const c = await uploadBuffer(
                            composite,
                            `clubs/${scene.clubId || 'global'}/reels/frames/${scene.id}/${i}-cmp-${Date.now()}.jpg`,
                            'image/jpeg'
                        );
                        return c.url;
                    }
                };
            }));
        } else if (providerPosterUrl) {
            // Sin FFmpeg se usa la portada del proveedor, si la hubo.
            const resp = await fetch(providerPosterUrl);
            if (resp.ok) {
                frames = [{
                    at: 0, position: 'inicio', url: providerPosterUrl,
                    buffer: Buffer.from(await resp.arrayBuffer()),
                    publish: async (composite) => {
                        const c = await uploadBuffer(
                            composite,
                            `clubs/${scene.clubId || 'global'}/reels/frames/${scene.id}/cmp-${Date.now()}.jpg`,
                            'image/jpeg'
                        );
                        return c.url;
                    }
                }];
            }
        }

        if (!frames.length) {
            return {
                state: 'unavailable', score: null, issues: [], frames: [],
                reason: 'No se pudieron extraer fotogramas del clip para comprobar la fidelidad.'
            };
        }

        // La foto original, para comparar contra ella.
        const srcResp = await fetch(scene.sourceImageUrl);
        if (!srcResp.ok) {
            return {
                state: 'unavailable', score: null, issues: [],
                frames: frames.map(({ at, position, url }) => ({ at, position, frameUrl: url })),
                reason: `No se pudo descargar la fotografía original (${srcResp.status}).`
            };
        }
        const originalBuffer = Buffer.from(await srcResp.arrayBuffer());

        return await checkSceneFidelity({
            originalBuffer,
            frames,
            analysis: scene.analysis
        });
    } catch (e) {
        console.error(`[REEL] fidelidad de la escena ${scene.id}:`, e.message);
        return {
            state: 'unavailable', score: null, issues: [], frames: [],
            reason: `No se pudo comprobar la fidelidad: ${e.message}`
        };
    }
};

// Relanza una escena conservando su dirección.
const relaunchScene = async (scene, { auto = false, reason = null } = {}) => {
    const { rows } = await db.query(
        `UPDATE "ReelScene"
         SET attempts = attempts + 1, status = 'pending', "statusDetail" = $2, "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [scene.id, auto ? `Reintento automático tras: ${reason}` : null]
    );
    return dispatchScene(rows[0], { engineId: rows[0].engine, model: rows[0].engineModel });
};

// Hace avanzar UNA escena consultando al proveedor.
const advanceScene = async (scene) => {
    if (SCENE_STATUSES[scene.status]?.terminal) return scene;
    // La adaptación del lienzo la resuelve `advanceSceneExpansion`, antes.
    if (scene.status === 'expanding') return scene;
    if (!scene.kieJobId) return scene;

    const task = await getKieVideoTask(scene.kieJobId);

    if (task.state === 'success') {
        // Algunos modelos devuelven una portada junto al video; es lo que
        // habilita la comprobación de fidelidad. Cuando no viene, no se
        // inventa: la comprobación queda como no realizada.
        const poster = extractPosterUrl(task.raw);
        return ingestScene(scene, task.videoUrl, poster);
    }

    if (task.state === 'failed') {
        if (scene.attempts < MAX_AUTO_RETRIES) {
            console.warn(`[REEL] escena ${scene.id} falló (${task.failMsg}). Reintento ${scene.attempts + 1}/${MAX_AUTO_RETRIES}.`);
            try {
                return await relaunchScene(scene, { auto: true, reason: task.failMsg });
            } catch (e) {
                const { rows } = await db.query(
                    `UPDATE "ReelScene" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
                    [scene.id, `${task.failMsg} — el reintento tampoco pudo lanzarse: ${e.message}`]
                );
                return rows[0];
            }
        }
        const { rows } = await db.query(
            `UPDATE "ReelScene" SET status = 'error', "statusDetail" = $2, "kieRaw" = $3, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [scene.id, task.failMsg, JSON.stringify(task.raw || null)]
        );
        return rows[0];
    }

    const next = task.state === 'queued' ? 'generating' : 'rendering';
    if (next === scene.status) return scene;
    const { rows } = await db.query(
        `UPDATE "ReelScene" SET status = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
        [scene.id, next]
    );
    return rows[0];
};

// Busca una URL de portada en la respuesta del proveedor. Las pasarelas la
// nombran de varias formas y muchas no la mandan; devolver null es un resultado
// legítimo, no un fallo.
const extractPosterUrl = (raw) => {
    try {
        let result = {};
        const rj = raw?.data?.resultJson ?? raw?.data?.result;
        if (typeof rj === 'string' && rj.length) { try { result = JSON.parse(rj); } catch { result = {}; } }
        else if (rj && typeof rj === 'object') result = rj;
        const candidate = Object.keys(result).length ? result : (raw?.data?.output || {});
        const url = candidate.coverUrl || candidate.cover_url || candidate.posterUrl
            || candidate.poster_url || candidate.thumbnailUrl || candidate.thumbnail_url
            || (Array.isArray(candidate.coverUrls) ? candidate.coverUrls[0] : null)
            || (Array.isArray(candidate.thumbnails) ? candidate.thumbnails[0] : null);
        return typeof url === 'string' && url.startsWith('http') ? url : null;
    } catch { return null; }
};

// Lanza el montaje. Sólo se llama con todas las escenas terminadas.
const submitAssembly = async (project, scenes) => {
    const usable = scenes
        .filter(s => s.videoUrl)
        .sort((a, b) => a.position - b.position);

    if (usable.length < SCENE_COUNT) {
        const { rows } = await db.query(
            `UPDATE "ReelProject" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [project.id, `Sólo ${usable.length} de ${SCENE_COUNT} escenas se generaron: no hay con qué montar el Reel.`]
        );
        return rows[0];
    }

    const spec = buildEditSpec({
        scenes: usable.map(s => ({
            videoUrl: s.videoUrl,
            durationSec: Number(s.durationSec),
            transitionOut: s.transitionOut
        })),
        tier: resolveTier(project.format, project.qualityTier),
        soundtrackUrl: project.musicUrl || null,
        callbackUrl: `${process.env.APP_URL || 'https://app.clubplatform.org'}/api/content-studio/reel-webhook`
    });

    await db.query(
        `UPDATE "ReelProject" SET status = 'assembling', "statusDetail" = NULL, "renderSpec" = $2, "updatedAt" = NOW() WHERE id = $1`,
        [project.id, JSON.stringify(spec)]
    );

    let submitted;
    try {
        submitted = await submitRender(spec, project.config?.renderProvider || null);
    } catch (e) {
        console.error(`[REEL] ${project.id} montaje no se pudo lanzar:`, e.message);
        const { rows } = await db.query(
            `UPDATE "ReelProject" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [project.id, e.code === 'NO_RENDER_PROVIDER'
                ? `${e.message} Las tres escenas están listas y se pueden descargar por separado.`
                : `No se pudo montar el Reel: ${e.message}`]
        );
        return rows[0];
    }

    // Que un proveedor fallara y lo salvara el siguiente es justo lo que hay
    // que poder ver después: va al historial del proyecto.
    for (const note of submitted.attempted || []) {
        await appendNote(project.id, `Montaje: falló ${note}; se usó ${submitted.provider}.`);
    }

    // ── Montaje local: ya está hecho cuando `submitRender` vuelve ──
    if (submitted.mode === 'local') {
        for (const note of submitted.output.notes || []) await appendNote(project.id, note);
        await db.query(
            'UPDATE "ReelProject" SET "renderProvider" = $2, "updatedAt" = NOW() WHERE id = $1',
            [project.id, submitted.provider]
        );
        const { rows: fresh } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [project.id]);
        return ingestLocalReel(fresh[0], submitted.output);
    }

    // ── Montaje alojado: crea el trabajo y se sondea ──
    const { rows } = await db.query(
        `UPDATE "ReelProject"
         SET status = 'assembling', "renderProvider" = $2, "renderJobId" = $3, "statusDetail" = NULL, "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [project.id, submitted.provider, submitted.jobId]
    );
    return rows[0];
};

// Guarda el resultado de un montaje LOCAL. Mismo destino que `ingestReel` pero
// sin descarga: el buffer ya está en memoria.
const ingestLocalReel = async (project, output) => {
    const probe = probeMp4(output.buffer);
    const quality = validateReelFile(probe, {
        format: project.format,
        qualityTier: project.qualityTier,
        expectedDurationSec: output.expectedDurationSec || project.config?.timing?.finalDurationSec || TARGET_TOTAL_SEC,
        expectAudio: Boolean(output.hasMusic),
        // Lo codificamos nosotros, con objetivo de bitrate conocido.
        encoder: 'local'
    });

    const upload = await uploadBuffer(
        output.buffer,
        `clubs/${project.clubId || 'global'}/reels/${Date.now()}-${slugify(project.title)}.mp4`,
        'video/mp4'
    );

    let posterUrl = null;
    if (output.posterBuffer) {
        try {
            const p = await uploadBuffer(
                output.posterBuffer,
                `clubs/${project.clubId || 'global'}/reels/posters/${project.id}-${Date.now()}.jpg`,
                'image/jpeg'
            );
            posterUrl = p.url;
        } catch (e) {
            console.warn(`[REEL] ${project.id} miniatura no se pudo subir: ${e.message}`);
        }
    }

    const { rows } = await db.query(
        `UPDATE "ReelProject"
         SET status = $2, "statusDetail" = $3, "videoUrl" = $4, "s3Key" = $5, "posterUrl" = COALESCE($6, "posterUrl"),
             "durationSec" = $7, width = $8, height = $9, "bitrateKbps" = $10,
             "sizeBytes" = $11, "hasAudio" = $12, quality = $13,
             "processingMs" = EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int * 1000,
             "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [
            project.id, quality.verdict,
            quality.failures.length ? quality.failures.join(' · ') : null,
            upload.url, upload.key, posterUrl,
            probe.durationSec, probe.width, probe.height, probe.bitrateKbps,
            probe.sizeBytes, probe.hasAudio, JSON.stringify(quality)
        ]
    );

    console.log(`[REEL] ${project.id} montado localmente → ${quality.verdict} (${probe.width}×${probe.height}, ${probe.durationSec}s, ${probe.bitrateKbps} kbps, audio=${probe.hasAudio})`);
    return rows[0];
};

// Baja el montaje terminado, lo mide y lo sube a nuestro bucket.
const ingestReel = async (project, providerUrl, posterUrl = null) => {
    const { rows: claimed } = await db.query(
        `UPDATE "ReelProject"
         SET status = 'validating', "providerUrl" = $2, "updatedAt" = NOW()
         WHERE id = $1 AND (status <> 'validating' OR "updatedAt" < NOW() - INTERVAL '5 minutes')
         RETURNING id`,
        [project.id, providerUrl]
    );
    if (claimed.length === 0) {
        const { rows } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [project.id]);
        return rows[0] || project;
    }

    const buffer = await fetchRenderBuffer(providerUrl);
    const probe = probeMp4(buffer);
    const quality = validateReelFile(probe, {
        format: project.format,
        qualityTier: project.qualityTier,
        expectedDurationSec: project.config?.timing?.finalDurationSec || TARGET_TOTAL_SEC,
        expectAudio: Boolean(project.musicUrl)
    });

    const upload = await uploadBuffer(
        buffer,
        `clubs/${project.clubId || 'global'}/reels/${Date.now()}-${slugify(project.title)}.mp4`,
        'video/mp4'
    );

    const { rows } = await db.query(
        `UPDATE "ReelProject"
         SET status = $2, "statusDetail" = $3, "videoUrl" = $4, "s3Key" = $5, "posterUrl" = COALESCE($6, "posterUrl"),
             "durationSec" = $7, width = $8, height = $9, "bitrateKbps" = $10,
             "sizeBytes" = $11, "hasAudio" = $12, quality = $13,
             "processingMs" = EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int * 1000,
             "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [
            project.id, quality.verdict,
            quality.failures.length ? quality.failures.join(' · ') : null,
            upload.url, upload.key, posterUrl,
            probe.durationSec, probe.width, probe.height, probe.bitrateKbps,
            probe.sizeBytes, probe.hasAudio, JSON.stringify(quality)
        ]
    );

    console.log(`[REEL] ${project.id} → ${quality.verdict} (${probe.width}×${probe.height}, ${probe.durationSec}s, ${probe.bitrateKbps} kbps, audio=${probe.hasAudio})`);
    return rows[0];
};

// Resuelve la música pendiente. Devuelve true cuando ya no hay nada que esperar
// —esté lista o haya fallado—, que es lo que deja seguir al montaje.
const advanceMusic = async (project) => {
    if (!project.config?.withMusic) return true;
    if (project.musicUrl) return true;
    if (!project.musicTaskId) return true; // no se llegó a lanzar; ya está anotado

    let track;
    try {
        track = await pollSoundtrack(project.musicProvider, project.musicTaskId);
    } catch (e) {
        console.error(`[REEL] ${project.id} música:`, e.message);
        await appendNote(project.id, `La banda sonora falló: ${e.message} El Reel se monta sin música.`);
        await db.query('UPDATE "ReelProject" SET "musicTaskId" = NULL, "updatedAt" = NOW() WHERE id = $1', [project.id]);
        return true;
    }

    if (track.state === 'success' && track.url) {
        // Se copia a nuestro bucket por lo mismo que el video: la URL del
        // proveedor es efímera y el montaje puede reintentarse más tarde.
        try {
            const audio = await fetchAudioBuffer(track.url);
            const upload = await uploadBuffer(
                audio,
                `clubs/${project.clubId || 'global'}/reels/music/${project.id}-${Date.now()}.mp3`,
                'audio/mpeg'
            );
            await db.query(
                'UPDATE "ReelProject" SET "musicUrl" = $2, "musicS3Key" = $3, "updatedAt" = NOW() WHERE id = $1',
                [project.id, upload.url, upload.key]
            );
        } catch (e) {
            // Si no se pudo copiar, se usa la del proveedor: sirve para este
            // montaje aunque no sirva para uno futuro.
            console.warn(`[REEL] ${project.id} no se pudo copiar la música a S3: ${e.message}`);
            await db.query('UPDATE "ReelProject" SET "musicUrl" = $2, "updatedAt" = NOW() WHERE id = $1', [project.id, track.url]);
        }
        return true;
    }

    if (track.state === 'failed') {
        await appendNote(project.id, `La banda sonora falló: ${track.failMsg || 'sin detalle'} El Reel se monta sin música.`);
        await db.query('UPDATE "ReelProject" SET "musicTaskId" = NULL, "updatedAt" = NOW() WHERE id = $1', [project.id]);
        return true;
    }

    return false; // sigue generándose
};

// El corazón del módulo: mueve el proyecto un paso. Idempotente — si ya terminó,
// devuelve la fila sin llamar a nadie.
const advance = async (project) => {
    if (REEL_STATUSES[project.status]?.terminal) return project;

    // ── Montaje en curso ──
    if (project.status === 'assembling' || project.status === 'validating') {
        // Sin job de render el proyecto quedaría atascado para siempre en
        // `assembling`. Pasa cuando alguien cambió la música o la duración de
        // una escena —esas acciones invalidan el montaje anterior y limpian el
        // job— y el relanzamiento no llegó a salir. Se vuelve a lanzar en vez
        // de devolver la fila sin tocar.
        if (!project.renderJobId) {
            return submitAssembly(project, await fetchScenes(project.id));
        }
        const render = await pollRender(project.renderJobId, project.renderProvider);

        if (render.state === 'success') {
            try {
                return await ingestReel(project, render.url, render.posterUrl);
            } catch (e) {
                // El montaje existe pero no se pudo guardar (red o S3). Se anota
                // y se deja en `validating`: al vencer la ventana de 5 minutos el
                // siguiente sondeo lo reintenta. `updatedAt` no se toca a
                // propósito, para no correr esa ventana.
                console.error(`[REEL] ${project.id} no se pudo guardar:`, e.message);
                await db.query('UPDATE "ReelProject" SET "statusDetail" = $2 WHERE id = $1',
                    [project.id, `No se pudo guardar el montaje: ${e.message}`]);
                throw e;
            }
        }
        if (render.state === 'failed') {
            const { rows } = await db.query(
                `UPDATE "ReelProject" SET status = 'error', "statusDetail" = $2, "renderRaw" = $3, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
                [project.id, `El montaje falló: ${render.failMsg}`, JSON.stringify(render.raw || null)]
            );
            return rows[0];
        }
        return project; // sigue renderizando
    }

    // ── Adaptación del lienzo ──
    //
    // Va antes que las escenas de video porque es su entrada: no se puede
    // animar una foto cuyo lienzo todavía se está generando.
    const allScenes = await fetchScenes(project.id);
    const expanding = allScenes.filter(s => s.status === 'expanding');
    if (expanding.length) {
        const settings = EXPANSION_SETTINGS();
        const results = await Promise.allSettled(expanding.map(s => advanceSceneExpansion(s, settings)));
        results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`[EXPANSION] escena ${expanding[i].id}:`, r.reason?.message);
        });

        const after = await fetchScenes(project.id);
        // Las que ya tienen su lienzo listo arrancan el video en el acto: no
        // tienen por qué esperar a las otras dos.
        const ready = after.filter(s => s.status === 'pending' && !s.kieJobId);
        for (const sc of ready) {
            const r = sc.expansionReport;
            if (r?.judgement?.verdict) {
                await appendNote(project.id, `Escena ${sc.position + 1}: ${r.judgement.reason}`);
            } else if (r?.failed && r?.reason) {
                await appendNote(project.id, `Escena ${sc.position + 1}: ${r.reason}`);
            }
        }
        await Promise.allSettled(ready.map(sc =>
            dispatchScene(sc, { engineId: sc.engine || project.engine, model: sc.engineModel || project.engineModel })
        ));

        const stillExpanding = (await fetchScenes(project.id)).some(s => s.status === 'expanding');
        if (stillExpanding) {
            if (project.status !== 'expanding') {
                const { rows } = await db.query(
                    `UPDATE "ReelProject" SET status = 'expanding', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
                    [project.id]
                );
                return rows[0];
            }
            return project;
        }
    }

    // ── Escenas ──
    const scenes = await fetchScenes(project.id);
    const pending = scenes.filter(s => !SCENE_STATUSES[s.status]?.terminal);

    if (pending.length) {
        // En paralelo: son independientes y así un sondeo hace avanzar las tres.
        const results = await Promise.allSettled(pending.map(advanceScene));
        results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`[REEL] escena ${pending[i].id}:`, r.reason?.message);
        });

        const after = await fetchScenes(project.id);
        const stillPending = after.filter(s => !SCENE_STATUSES[s.status]?.terminal);
        if (stillPending.length) {
            if (project.status !== 'generating') {
                const { rows } = await db.query(
                    `UPDATE "ReelProject" SET status = 'generating', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
                    [project.id]
                );
                return rows[0];
            }
            return project;
        }
    }

    // ── Todas las escenas terminaron ──
    const finalScenes = await fetchScenes(project.id);
    const broken = finalScenes.filter(s => s.status === 'error');
    if (broken.length) {
        const { rows } = await db.query(
            `UPDATE "ReelProject" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [project.id, `${broken.length} escena(s) no se pudieron generar: ${broken.map(s => s.statusDetail).filter(Boolean).join(' · ')}`]
        );
        return rows[0];
    }

    // Una escena que no conservó la fotografía se regenera SOLA antes de entrar
    // al montaje. Es el sistema de preservación visual: no se ensambla un Reel
    // con una escena que ya se sabe que deformó la marca.
    const infidel = finalScenes.filter(
        s => s.fidelity?.state === 'failed' && s.attempts < MAX_AUTO_RETRIES
    );
    if (infidel.length) {
        console.warn(`[REEL] ${project.id}: ${infidel.length} escena(s) no conservan la foto; se regeneran.`);
        await Promise.allSettled(infidel.map(s => relaunchScene(s, { auto: true, reason: 'la escena no conservó la fotografía' })));
        await appendNote(project.id, `Se regeneraron ${infidel.length} escena(s) que no conservaban la fotografía original.`);
        const { rows } = await db.query(
            `UPDATE "ReelProject" SET status = 'generating', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [project.id]
        );
        return rows[0];
    }

    // ── Música ──
    const musicReady = await advanceMusic(project);
    if (!musicReady) {
        if (project.status !== 'scoring') {
            const { rows } = await db.query(
                `UPDATE "ReelProject" SET status = 'scoring', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
                [project.id]
            );
            return rows[0];
        }
        return project;
    }

    // ── Montaje ──
    const { rows: fresh } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [project.id]);
    return submitAssembly(fresh[0], finalScenes);
};

export const syncReel = async (req, res) => {
    try {
        await ensureReelSchema();
        const row = await fetchProject(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Reel no encontrado' });
        const updated = await advance(row);
        await respondProject(res, updated);
    } catch (e) {
        console.error('[REEL] sync:', e);
        // Un fallo de red al consultar no marca el Reel como perdido: se informa
        // y el siguiente sondeo lo vuelve a intentar.
        res.status(502).json({ error: e.message });
    }
};

// Segunda vía: el proveedor avisa por webhook. Se llama desde el webhook
// compartido de Content Studio cuando el task no es de otro módulo.
export const handleReelSceneWebhook = async (taskId, payload = {}) => {
    await ensureReelSchema();
    const { rows } = await db.query('SELECT * FROM "ReelScene" WHERE "kieJobId" = $1', [taskId]);
    const scene = rows[0];
    if (!scene) return false;

    await db.query('UPDATE "ReelScene" SET "kieRaw" = $2, "updatedAt" = NOW() WHERE id = $1',
        [scene.id, JSON.stringify(payload)]);

    try {
        await advanceScene(scene);
        const { rows: project } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [scene.projectId]);
        if (project[0]) await advance(project[0]);
    } catch (e) {
        console.error(`[REEL] webhook escena ${taskId}:`, e.message);
    }
    return true;
};

// Webhook del proveedor de montaje. Ruta propia porque el cuerpo lo manda un
// servicio distinto de KIE y no comparte la forma del payload.
export const handleRenderWebhook = async (req, res) => {
    try {
        await ensureReelSchema();
        const payload = req.body || {};
        // Cada proveedor nombra el id de otra forma; se prueban las conocidas.
        const jobId = payload.id || payload.render_id || payload.project
            || payload.response?.id || payload.data?.id;
        if (!jobId) return res.json({ success: true, ignored: true });

        const { rows } = await db.query('SELECT * FROM "ReelProject" WHERE "renderJobId" = $1', [String(jobId)]);
        const project = rows[0];
        // 200 a propósito si no es nuestro: un 404 haría que el proveedor
        // reintentara el webhook indefinidamente.
        if (!project) return res.json({ success: true, ignored: true });

        await db.query('UPDATE "ReelProject" SET "renderRaw" = $2, "updatedAt" = NOW() WHERE id = $1',
            [project.id, JSON.stringify(payload)]);

        try { await advance(project); } catch (e) { console.error('[REEL] webhook montaje:', e.message); }
        res.json({ success: true, kind: 'reel-render' });
    } catch (e) {
        console.error('[REEL] render webhook:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Listado y ficha ───────────────────────────────────────────────────────

export const listReels = async (req, res) => {
    try {
        await ensureReelSchema();
        const { status, readyOnly, limit = 50 } = req.query;

        const where = [];
        const params = [];
        let p = 1;

        const scope = scopeClause(req.user, p);
        if (scope.sql) { where.push(scope.sql); params.push(...scope.params); p = scope.next; }
        if (readyOnly === 'true') where.push(`status = 'ready' AND "videoUrl" IS NOT NULL`);
        else if (status && REEL_STATUSES[status]) { where.push(`status = $${p}`); params.push(status); p++; }

        const { rows } = await db.query(
            `SELECT * FROM "ReelProject"
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY "createdAt" DESC LIMIT $${p}`,
            [...params, Math.min(Number(limit) || 50, 200)]
        );

        // Las escenas de todos los proyectos en una sola consulta: con una por
        // proyecto, un listado de 50 dispararía 51 viajes a la base.
        const ids = rows.map(r => r.id);
        const scenesById = new Map();
        if (ids.length) {
            const { rows: allScenes } = await db.query(
                'SELECT * FROM "ReelScene" WHERE "projectId" = ANY($1) ORDER BY position ASC', [ids]
            );
            for (const s of allScenes) {
                if (!scenesById.has(s.projectId)) scenesById.set(s.projectId, []);
                scenesById.get(s.projectId).push(s);
            }
        }

        res.json({
            reels: rows.map(r => projectToDto(r, scenesById.get(r.id) || [])),
            usage: await creditUsage(req.user)
        });
    } catch (e) {
        console.error('[REEL] list:', e);
        res.status(500).json({ error: e.message });
    }
};

export const getReel = async (req, res) => {
    try {
        await ensureReelSchema();
        const row = await fetchProject(req.params.id, req.user);
        if (!row) return res.status(404).json({ error: 'Reel no encontrado' });
        await respondProject(res, row);
    } catch (e) {
        console.error('[REEL] get:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Acciones sobre una escena ─────────────────────────────────────────────
//
// Regenerar UNA escena sin volver a generar el resto es el pedido explícito de
// la previsualización. El proyecto vuelve a `generating` y, cuando la escena
// termina, el montaje se rehace solo con las otras dos intactas.
export const regenerateScene = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const { rows } = await db.query(
            'SELECT * FROM "ReelScene" WHERE id = $1 AND "projectId" = $2',
            [req.params.sceneId, project.id]
        );
        const scene = rows[0];
        if (!scene) return res.status(404).json({ error: 'Escena no encontrada' });

        // Un cambio de estilo o de imagen que venga con la regeneración se
        // aplica antes de lanzar: así el prompt se rearma con lo nuevo.
        const { style, sourceImageUrl, sourceMediaId, durationSec } = req.body || {};
        const nextStyle = MOTION_STYLES[style] ? style : scene.style;
        const nextImage = typeof sourceImageUrl === 'string' && sourceImageUrl.startsWith('http')
            ? sourceImageUrl : scene.sourceImageUrl;
        const nextDuration = Number.isFinite(Number(durationSec))
            ? Math.min(MAX_SCENE_SEC, Math.max(MIN_SCENE_SEC, Number(durationSec)))
            : Number(scene.durationSec);

        // Si cambió la imagen, el análisis viejo ya no describe nada: se
        // descarta y el prompt se arma sin refuerzos. Mantenerlo sería peor —
        // reforzaría la conservación de una marca que quizá ya no está.
        const analysis = nextImage === scene.sourceImageUrl ? scene.analysis : null;

        const engineId = isEngineAvailable(scene.engine) ? scene.engine : DEFAULT_ENGINE;
        const engineChoice = resolveEngine({ engine: engineId, format: project.format, qualityTier: project.qualityTier });
        const generated = engineChoice.durations
            .filter(d => d >= nextDuration - 0.01)
            .sort((a, b) => a - b)[0] || Math.max(...engineChoice.durations);

        const prompt = buildScenePrompt({
            style: nextStyle,
            durationSec: generated,
            analysis,
            withAudio: false,
            musicStyle: project.direction?.musicStyle || DEFAULT_MUSIC_STYLE
        });

        const { rows: updated } = await db.query(
            `UPDATE "ReelScene"
             SET style = $2, "sourceImageUrl" = $3, "sourceMediaId" = COALESCE($4, "sourceMediaId"),
                 analysis = $5, prompt = $6, "durationSec" = $7, "generatedDurationSec" = $8,
                 status = 'pending', "statusDetail" = NULL, attempts = 0,
                 quality = NULL, fidelity = NULL, "videoUrl" = NULL, "posterUrl" = NULL,
                 -- Con otra foto, la adaptación anterior ya no describe nada:
                 -- se descarta para que se rehaga desde la imagen nueva.
                 "expandedImageUrl" = CASE WHEN $9 THEN NULL ELSE "expandedImageUrl" END,
                 "expansionTaskId" = NULL,
                 "expansionReport" = CASE WHEN $9 THEN NULL ELSE "expansionReport" END,
                 "expansionAttempts" = CASE WHEN $9 THEN 0 ELSE "expansionAttempts" END,
                 "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [
                scene.id, nextStyle, nextImage, sourceMediaId || null,
                analysis ? JSON.stringify(analysis) : null, prompt,
                nextDuration, generated,
                nextImage !== scene.sourceImageUrl
            ]
        );

        // Con foto nueva hay que volver a adaptar el lienzo antes de animar.
        if (nextImage !== scene.sourceImageUrl) {
            const tier = resolveTier(project.format, project.qualityTier);
            const expandedScene = await startSceneExpansion(updated[0], {
                targetWidth: tier.width, targetHeight: tier.height, settings: EXPANSION_SETTINGS()
            });
            if (expandedScene.status === 'expanding') {
                const { rows: proj } = await db.query(
                    `UPDATE "ReelProject" SET status = 'expanding', "renderJobId" = NULL, "statusDetail" = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
                    [project.id]
                );
                return respondProject(res, proj[0]);
            }
            updated[0] = expandedScene;
        }

        await dispatchScene(updated[0], {
            engineId: engineChoice.engineId, model: engineChoice.model
        });

        // El montaje anterior deja de valer: se limpia el job para que el
        // siguiente sondeo lance uno nuevo con la escena regenerada.
        const { rows: proj } = await db.query(
            `UPDATE "ReelProject"
             SET status = 'generating', "renderJobId" = NULL, "statusDetail" = NULL, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [project.id]
        );

        console.log(`[REEL] escena ${scene.id} regenerada (estilo ${nextStyle}, ${nextDuration}s)`);
        await respondProject(res, proj[0]);
    } catch (e) {
        console.error('[REEL] regenerate scene:', e);
        res.status(500).json({ error: e.message });
    }
};

// Cambia la duración o la transición de una escena SIN regenerar el clip. Es
// una decisión de montaje: el clip ya existe y sólo se usa otro tramo de él.
export const updateScene = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const { rows } = await db.query(
            'SELECT * FROM "ReelScene" WHERE id = $1 AND "projectId" = $2',
            [req.params.sceneId, project.id]
        );
        const scene = rows[0];
        if (!scene) return res.status(404).json({ error: 'Escena no encontrada' });

        const { durationSec, transitionOut } = req.body || {};
        const updates = [];
        const params = [scene.id];
        let p = 2;

        if (Number.isFinite(Number(durationSec))) {
            const want = Math.min(MAX_SCENE_SEC, Math.max(MIN_SCENE_SEC, Number(durationSec)));
            // No se puede usar más metraje del que el clip tiene. Alargar más
            // allá de lo generado exigiría regenerar, y eso es otro endpoint.
            const available = Number(scene.generatedDurationSec || scene.durationSec);
            if (want > available + 0.01) {
                return res.status(400).json({
                    error: `El clip generado dura ${available}s: para llegar a ${want}s hay que regenerar la escena.`,
                    maxDurationSec: available
                });
            }
            updates.push(`"durationSec" = $${p++}`); params.push(want);
        }
        if (TRANSITIONS[transitionOut]) {
            updates.push(`"transitionOut" = $${p++}`); params.push(transitionOut);
        }
        if (!updates.length) return res.status(400).json({ error: 'Nada que cambiar.' });

        await db.query(
            `UPDATE "ReelScene" SET ${updates.join(', ')}, "updatedAt" = NOW() WHERE id = $1`,
            params
        );

        // El montaje hay que rehacerlo, pero los clips no: se limpia el job.
        const { rows: proj } = await db.query(
            `UPDATE "ReelProject"
             SET "renderJobId" = NULL, "statusDetail" = NULL, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [project.id]
        );

        const scenes = await fetchScenes(project.id);
        const relaunched = await submitAssembly(proj[0], scenes);
        await respondProject(res, relaunched);
    } catch (e) {
        console.error('[REEL] update scene:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Música ────────────────────────────────────────────────────────────────
//
// Reemplazar la pista desde la previsualización. Se puede pedir otro estilo
// —que regenera— o una URL concreta de la Biblioteca —que no cuesta nada—.
export const changeMusic = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const { style, url, mediaId, mute } = req.body || {};

        if (mute) {
            await db.query(
                `UPDATE "ReelProject"
                 SET "musicUrl" = NULL, "musicTaskId" = NULL, "musicProvider" = NULL,
                     config = jsonb_set(config, '{withMusic}', 'false'::jsonb),
                     "renderJobId" = NULL, "updatedAt" = NOW()
                 WHERE id = $1`,
                [project.id]
            );
        } else if (typeof url === 'string' && url.startsWith('http')) {
            await db.query(
                `UPDATE "ReelProject"
                 SET "musicUrl" = $2, "musicMediaId" = $3, "musicProvider" = 'library',
                     "musicTaskId" = NULL, config = jsonb_set(config, '{withMusic}', 'true'::jsonb),
                     "renderJobId" = NULL, "updatedAt" = NOW()
                 WHERE id = $1`,
                [project.id, url, mediaId || null]
            );
        } else if (MUSIC_STYLES[style]) {
            const track = await startSoundtrack({
                style,
                durationSec: project.config?.timing?.finalDurationSec || TARGET_TOTAL_SEC,
                clubId: project.clubId,
                metadata: { reelProjectId: project.id }
            });
            await db.query(
                `UPDATE "ReelProject"
                 SET "musicProvider" = $2, "musicTaskId" = $3, "musicUrl" = $4, "musicPrompt" = $5,
                     "musicStyle" = $6, direction = jsonb_set(COALESCE(direction,'{}'::jsonb), '{musicStyle}', $7::jsonb),
                     config = jsonb_set(config, '{withMusic}', 'true'::jsonb),
                     "renderJobId" = NULL, status = 'scoring', "updatedAt" = NOW()
                 WHERE id = $1`,
                [project.id, track.provider, track.taskId, track.url, track.prompt || null, style, JSON.stringify(style)]
            );
        } else {
            return res.status(400).json({ error: 'Indicá un estilo musical válido, una URL de pista o `mute: true`.' });
        }

        // Con la música resuelta en el acto (biblioteca o silencio) el montaje
        // se relanza ya; si hay que generarla, lo hará el sondeo.
        const { rows } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [project.id]);
        let updated = rows[0];
        if (updated.status !== 'scoring') {
            const scenes = await fetchScenes(project.id);
            updated = await submitAssembly(updated, scenes);
        }
        await respondProject(res, updated);
    } catch (e) {
        console.error('[REEL] change music:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Montaje manual ────────────────────────────────────────────────────────
//
// Rehace el montaje con lo que ya está generado. Sirve tras cambiar la calidad
// de salida o cuando el proveedor falló y ya se corrigió su configuración.
export const renderReel = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const { qualityTier } = req.body || {};
        let current = project;
        if (qualityTier && resolveTier(project.format, qualityTier).id === qualityTier) {
            const { rows } = await db.query(
                'UPDATE "ReelProject" SET "qualityTier" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *',
                [project.id, qualityTier]
            );
            current = rows[0];
        }

        const scenes = await fetchScenes(project.id);
        if (scenes.some(s => !s.videoUrl)) {
            return res.status(400).json({ error: 'Todavía hay escenas sin generar.' });
        }

        await db.query('UPDATE "ReelProject" SET "renderJobId" = NULL WHERE id = $1', [project.id]);
        const updated = await submitAssembly(current, scenes);
        await respondProject(res, updated);
    } catch (e) {
        console.error('[REEL] render:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Biblioteca ────────────────────────────────────────────────────────────
//
// Guardar en la Biblioteca es una acción EXPLÍCITA del usuario, distinta de
// copiar el archivo a S3 (que pasa solo, en cuanto está listo, porque la URL
// del proveedor caduca). Acá se crea la fila en `Media` con toda la metadata
// de producción, que es lo que permite reutilizar la pieza y versionarla.
export const saveReelToLibrary = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });
        if (!project.videoUrl) return res.status(400).json({ error: 'El Reel todavía no tiene archivo montado.' });
        if (project.status !== 'ready' && !req.body?.force) {
            return res.status(400).json({
                error: 'El Reel no pasó la validación de calidad. Revisá el informe o regenerá las escenas señaladas antes de guardarlo.',
                quality: project.quality
            });
        }
        if (project.mediaId) {
            const { rows } = await db.query('SELECT * FROM "Media" WHERE id = $1', [project.mediaId]);
            if (rows[0]) {
                const scenes = await fetchScenes(project.id);
                return res.json({ media: rows[0], reel: projectToDto(project, scenes), alreadySaved: true });
            }
        }

        let sourceLabel = project.organizationName || null;
        if (project.clubId) {
            try {
                const { rows } = await db.query('SELECT name FROM "Club" WHERE id = $1', [project.clubId]);
                if (rows[0]?.name) sourceLabel = rows[0].name;
            } catch { /* se queda con el nombre escrito */ }
        }

        const filename = `${slugify(project.title)}-${project.format.replace(':', 'x')}.mp4`;
        const { rows: media } = await db.query(
            `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key",
                                  "sourceType", "sourceId", "sourceLabel", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, 'video', $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             RETURNING *`,
            [
                filename, project.videoUrl, Number(project.sizeBytes || 0),
                bucketName(), process.env.AWS_REGION || 'us-east-1',
                project.clubId, project.s3Key,
                project.clubId ? 'club' : 'platform', project.clubId, sourceLabel
            ]
        );

        const { rows: updated } = await db.query(
            'UPDATE "ReelProject" SET "mediaId" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *',
            [project.id, media[0].id]
        );

        console.log(`[REEL] ${project.id} guardado en la Biblioteca como ${media[0].id}`);
        const scenes = await fetchScenes(project.id);
        res.status(201).json({ media: media[0], reel: projectToDto(updated[0], scenes) });
    } catch (e) {
        console.error('[REEL] library:', e);
        res.status(500).json({ error: e.message });
    }
};

export const deleteReel = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        // Sólo se borra el registro del creador. El archivo en S3 y la ficha de
        // la Biblioteca se conservan: si el Reel ya se guardó, puede estar
        // publicado. Las escenas caen por el ON DELETE CASCADE.
        await db.query('DELETE FROM "ReelProject" WHERE id = $1', [project.id]);
        res.json({ success: true, keptInLibrary: Boolean(project.mediaId) });
    } catch (e) {
        console.error('[REEL] delete:', e);
        res.status(500).json({ error: e.message });
    }
};
