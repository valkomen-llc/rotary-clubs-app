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
    REEL_STATUSES, SCENE_STATUSES, SCENE_COUNT, TARGET_TOTAL_SEC, estimateRemainingSec, isEngineless,
    MOTION_INTENSITY, DEFAULT_MOTION_INTENSITY,
    MIN_SCENE_SEC, MAX_SCENE_SEC, MAX_AUTO_RETRIES,
    distributeDurations, resolveEngine, buildScenePrompt, buildReelTitle, computeProgress
} from '../lib/reelSpec.js';
import { directReel } from '../lib/reelDirector.js';
import {
    probeMp4, inspectSourceImages, validateSceneFile, validateReelFile,
    checkSceneFidelity, summarizeFidelity, REEL_THRESHOLDS, FROZEN_LIFE_SCORE
} from '../lib/reelQuality.js';
import {
    RENDER_PROVIDERS, activeRenderProvider, availableRenderProviders,
    renderChain, refreshFfmpegAvailability,
    buildEditSpec, submitRender, pollRender, fetchRenderBuffer
} from '../lib/reelRenderProviders.js';
import { extractFrames, isFfmpegAvailable, checkFfmpegEnvironment, renderStillMotion } from '../lib/reelFfmpeg.js';
import {
    EXPANSION_PROVIDERS, DEFAULT_EXPANSION_PROVIDER, isExpansionProviderAvailable,
    EXPANSION_SETTINGS, PHOTO_TYPES,
    planExpansion, analyzeForExpansion, buildExpansionPrompt,
    startExpansion, pollExpansion, fetchExpandedImage,
    verifyExpansion, judgeExpansion
} from '../lib/canvasExpansion.js';
import {
    MUSIC_PROVIDERS, DEFAULT_MUSIC_PROVIDER, isMusicProviderAvailable, musicChain,
    startSoundtrack, pollSoundtrack, fetchAudioBuffer
} from '../lib/reelMusic.js';
import { createKieVideoTask, getKieVideoTask, fetchKieVideoBuffer } from '../services/kieService.js';
import {
    publicationTypes, interestAreas, resolveContext,
    DEFAULT_TYPE, DEFAULT_AREA
} from '../lib/publicationContext.js';
import {
    NARRATION_LANGUAGES, NARRATION_STYLES, NARRATION_GENDERS,
    TTS_PROVIDERS, DEFAULT_LANGUAGE as NARRATION_DEFAULT_LANGUAGE,
    DEFAULT_STYLE as NARRATION_DEFAULT_STYLE,
    isTtsAvailable, activeTtsProvider, availableTtsProviders,
    computeWordBudget, fitNarrationToDuration, describeTiming,
    NARRATION_TOLERANCE_SEC
} from '../lib/reelNarration.js';
import { measureAudioDuration } from '../lib/reelFfmpeg.js';
import {
    COPY_PLATFORMS, DEFAULT_PLATFORMS, CAMPAIGN_CATEGORIES, MARKETING_GOALS,
    generateReelCopy, regeneratePlatformCopy,
    copyToText, copyToCsv, copyToJson
} from '../lib/reelCopy.js';

import {
    recordUsage, usageReport, tokensOf,
    USAGE_PROVIDERS, USAGE_OPERATIONS, CREDIT_ESTIMATES
} from '../lib/reelUsage.js';

export const REEL_MODULE_VERSION = '4.669.0';

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

const projectToDto = (row, scenes = [], copies = [], narration = null) => {
    const sceneDtos = scenes.map(sceneToDto);
    const scenesReady = sceneDtos.filter(s => SCENE_STATUSES[s.status]?.terminal).length;
    return {
        id: row.id,
        title: row.title,
        description: row.description || null,
        tags: row.tags || [],
        clubId: row.clubId,
        organizationName: row.organizationName,
        // Quién lo creó: la Biblioteca lo muestra en la ficha y es lo que
        // permite saber a quién preguntarle por una pieza publicada.
        userId: row.userId,
        userEmail: row.userEmail,
        format: row.format,
        formatLabel: REEL_FORMATS[row.format]?.label || row.format,
        qualityTier: row.qualityTier,
        qualityLabel: resolveTier(row.format, row.qualityTier).label,
        publicationType: row.publicationType,
        interestArea: row.interestArea,
        context: resolveContext({ type: row.publicationType, interestArea: row.interestArea }),
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
        // Segundos que faltan, aproximadamente. `null` en los estados
        // terminales. Es una estimación por etapas y así se nombra en la
        // interfaz: la cola del proveedor no la controlamos.
        etaSec: estimateRemainingSec(row.status, { scenesReady, scenesTotal: sceneDtos.length || SCENE_COUNT }),
        cancellable: !REEL_STATUSES[row.status]?.terminal,
        retryable: row.status === 'error' || row.status === 'cancelled',
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
        savedToLibraryAt: row.savedToLibraryAt || null,
        parentId: row.parentId,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        scenes: sceneDtos,
        copies: copies.map(copyRowToDto),
        narration: narration ? narrationToDto(narration) : null
    };
};

const respondProject = async (res, row, status = 200) => {
    const [scenes, copies, narration] = await Promise.all([
        fetchScenes(row.id), fetchCopies(row.id), fetchNarration(row.id)
    ]);
    res.status(status).json(projectToDto(row, scenes, copies, narration));
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
            // Intensidad del movimiento: cuánta actividad se le pide al motor.
            motionIntensities: Object.values(MOTION_INTENSITY).map(i => ({
                id: i.id, label: i.label, description: i.description,
                isDefault: i.id === DEFAULT_MOTION_INTENSITY
            })),
            defaultMotionIntensity: DEFAULT_MOTION_INTENSITY,

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
                // La licencia se expone: quien cambie el proveedor desde el
                // panel tiene que saber qué está aceptando para una pieza que
                // se publica en YouTube.
                licensing: p.licensing,
                licensingNote: p.licensingNote,
                mode: p.mode,
                available: isMusicProviderAvailable(p.id),
                isDefault: p.id === DEFAULT_MUSIC_PROVIDER
            })),
            musicChain: musicChain(),

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

            // Contexto estratégico, compartido con el Generador de Publicaciones.
            context: {
                types: publicationTypes(),
                areas: interestAreas(),
                defaultType: DEFAULT_TYPE,
                defaultArea: DEFAULT_AREA
            },

            // Narración IA.
            narration: {
                available: Boolean(activeTtsProvider()),
                provider: activeTtsProvider(),
                providers: Object.values(TTS_PROVIDERS).map(p => ({
                    id: p.id, label: p.label, note: p.note,
                    accentControl: p.accentControl,
                    available: isTtsAvailable(p.id),
                    isDefault: p.id === activeTtsProvider()
                })),
                languages: Object.entries(NARRATION_LANGUAGES).map(([id, l]) => ({
                    id, label: l.label, wordsPerSecond: l.wordsPerSecond,
                    isDefault: id === NARRATION_DEFAULT_LANGUAGE
                })),
                styles: Object.entries(NARRATION_STYLES).map(([id, st]) => ({
                    id, label: st.label, pace: st.pace, isDefault: id === NARRATION_DEFAULT_STYLE
                })),
                genders: Object.entries(NARRATION_GENDERS).map(([id, g]) => ({ id, label: g.label })),
                defaultLanguage: NARRATION_DEFAULT_LANGUAGE,
                defaultStyle: NARRATION_DEFAULT_STYLE,
                toleranceSec: NARRATION_TOLERANCE_SEC,
                // Se dice si el motor activo puede hacer el acento pedido. Es el
                // dato honesto: OpenAI tiene voces buenas pero no elige acento.
                accentControlled: TTS_PROVIDERS[activeTtsProvider()]?.accentControl ?? null,
                unavailableReason: activeTtsProvider() ? null
                    : 'Sin proveedor de voz configurado. El Reel se monta con música sola.'
            },

            // Copies: qué plataformas se generan y con qué límites.
            copy: {
                platforms: Object.values(COPY_PLATFORMS).map(p => ({
                    id: p.id, label: p.label, maxChars: p.maxChars,
                    sweetSpot: p.sweetSpot, maxHashtags: p.maxHashtags, priority: p.priority
                })),
                categories: CAMPAIGN_CATEGORIES,
                goals: MARKETING_GOALS,
                exportFormats: ['txt', 'csv', 'json', 'zip']
            },

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
    const analysedAt = Date.now();
    const analysis = await analyzeForExpansion(scene.sourceImageUrl);
    await recordUsage({
        projectId: scene.projectId, clubId: scene.clubId, sceneId: scene.id,
        operation: 'expansion.judge', provider: 'llm',
        model: analysis?.usage?.model || null,
        units: tokensOf(analysis?.usage?.raw), unit: 'tokens',
        ms: Date.now() - analysedAt, target: `Escena ${scene.position + 1}`,
        status: analysis?.failed ? 'error' : 'ok'
    });
    const prompt = buildExpansionPrompt({
        analysis, plan,
        targetLabel: `${targetWidth}x${targetHeight}`
    });

    try {
        const startedExpansionAt = Date.now();
        const { provider, taskId } = await startExpansion({
            imageUrl: scene.sourceImageUrl,
            prompt, targetWidth, targetHeight,
            provider: settings.provider
        });
        await recordUsage({
            projectId: scene.projectId, clubId: scene.clubId, sceneId: scene.id,
            operation: 'scene.expand', provider: 'kie', model: provider,
            units: CREDIT_ESTIMATES.expansion, unit: 'credits',
            credits: CREDIT_ESTIMATES.expansion,
            ms: Date.now() - startedExpansionAt,
            target: `Escena ${scene.position + 1}`,
            detail: `${meta.width}x${meta.height} → ${targetWidth}x${targetHeight}`
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

/**
 * Resuelve una escena SIN motor generativo: anima la fotografía con un
 * desplazamiento lento de la ventana de encuadre.
 *
 * Es síncrona y termina en segundos, así que la escena queda `ready` en la
 * misma llamada — no hay tarea que sondear ni webhook que esperar.
 *
 * Se usa en dos situaciones y por el mismo motivo:
 *
 *  · El usuario eligió el estilo «Fotográfico», normalmente porque la foto es
 *    de grupo y no quiere que un modelo le rehaga las caras.
 *  · La medición de fidelidad dijo que el motor NO conservó a las personas.
 *    Regenerar con el mismo motor vuelve a redibujarlas —es repetir el problema
 *    pagándolo otra vez—, así que se cae a esta vía, que no reinterpreta nada.
 *
 * La fidelidad no se mide acá: no hay nada que medir. Los píxeles son los de la
 * fotografía, y decirlo es más honesto que inventar una nota del 100 %.
 */
const resolveSceneWithStillMotion = async (scene, { reason = null } = {}) => {
    const startedAt = Date.now();
    const tier = resolveTier(scene.format || DEFAULT_FORMAT, DEFAULT_QUALITY_TIER);
    const sourceUrl = animationSourceOf(scene);

    const resp = await fetch(sourceUrl);
    if (!resp.ok) throw new Error(`No se pudo descargar la imagen de la escena (${resp.status}).`);
    const imageBuffer = Buffer.from(await resp.arrayBuffer());

    // La dirección del desplazamiento se alterna por posición para que las tres
    // escenas no se muevan igual: un Reel con tres paneos idénticos se lee como
    // un error de montaje.
    const drift = ['up', 'left', 'down'][scene.position % 3] || 'up';

    const buffer = await renderStillMotion(imageBuffer, {
        width: tier.width, height: tier.height, fps: 30,
        durationSec: scene.durationSec || 5, drift
    });

    const probe = probeMp4(buffer);
    const upload = await uploadBuffer(
        buffer,
        `clubs/${scene.clubId || 'global'}/reels/scenes/${scene.id}-still-${Date.now()}.mp4`,
        'video/mp4'
    );

    await recordUsage({
        projectId: scene.projectId, clubId: scene.clubId, sceneId: scene.id,
        operation: 'scene.animate', provider: 'ffmpeg', model: 'still-motion-2.5d',
        units: (Date.now() - startedAt) / 1000, unit: 'seconds',
        credits: 0, ms: Date.now() - startedAt,
        target: `Escena ${scene.position + 1}`,
        detail: `Movimiento 2.5D sobre la fotografía (${drift}). Sin motor generativo, sin créditos.`
    });

    const { rows } = await db.query(
        `UPDATE "ReelScene"
            SET status = 'ready', "statusDetail" = NULL, "videoUrl" = $2, "s3Key" = $3,
                "durationSec" = $4, engine = 'still_motion', "engineModel" = 'ffmpeg-2.5d',
                fidelity = $5, "updatedAt" = NOW()
          WHERE id = $1 RETURNING *`,
        [
            scene.id, upload.url, upload.key, probe.durationSec || scene.durationSec,
            JSON.stringify({
                // La escala de fidelidad es 0-10, no 0-1: `score: 1` mostraba
                // «1/10» —la peor nota posible— en una escena que es la
                // fotografía misma. Error de v4.672.
                state: 'ok', score: 10, framesChecked: 0, issues: [], frames: [],
                method: 'still-motion',
                // Se dice CÓMO se conservó, no una nota inventada: no hubo
                // modelo que pudiera alterar nada.
                reason: 'La escena es la fotografía en movimiento, sin pasar por un modelo generativo: rostros, manos, insignias y textos son los originales.'
            })
        ]
    );

    console.log(`[REEL] escena ${scene.id} resuelta con movimiento 2.5D (${drift}) en ${Date.now() - startedAt}ms${reason ? ` — ${reason}` : ''}`);
    return rows[0];
};

// Recalcula el total de créditos del proyecto a partir de sus escenas.
//
// Existe porque el total se calculaba UNA sola vez, dentro de `createReel`, y en
// ese momento las escenas que necesitan adaptación de lienzo todavía no se han
// despachado —se despachan más tarde, en `advance`, cuando su imagen está
// lista—. Con las tres fotos apaisadas el total quedaba en 0 para siempre, y la
// ficha decía «0 créditos» de un Reel que sí los había gastado.
//
// Es lectura, no cobro: no cambia lo que se consume, sólo lo que se informa.
const refreshProjectCredits = async (projectId) => {
    try {
        await db.query(
            `UPDATE "ReelProject"
                SET "creditsEstimated" = (
                        SELECT COALESCE(SUM("creditsEstimated"), 0)::int
                          FROM "ReelScene" WHERE "projectId" = $1)
              WHERE id = $1`,
            [projectId]
        );
    } catch (e) {
        console.warn(`[REEL] ${projectId} no se pudo recalcular el consumo: ${e.message}`);
    }
};

// Lanza la tarea de video de UNA escena. Se usa al crear y al regenerar.
const dispatchScene = async (scene, { engineId, model }) => {
    // Estilo sin motor: se resuelve acá mismo, sin crear tarea en el proveedor.
    if (isEngineless(scene.style)) {
        return resolveSceneWithStillMotion(scene, { reason: 'estilo Fotográfico elegido por el usuario' });
    }
    const engine = VIDEO_ENGINES[engineId];
    const dispatchedAt = Date.now();
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

    // El `ms` de acá es el de CREAR la tarea, no el de generar el clip: KIE es
    // asíncrono. El tiempo de generación se anota al ingerirla, que es cuando
    // se conoce de verdad.
    await recordUsage({
        projectId: scene.projectId, clubId: scene.clubId, sceneId: scene.id,
        operation: 'scene.animate', provider: 'kie', model,
        units: engine?.creditEstimate || 0, unit: 'credits',
        credits: engine?.creditEstimate || 0,
        ms: Date.now() - dispatchedAt,
        target: `Escena ${scene.position + 1}`,
        detail: `${engine?.label || engineId} · ${scene.generatedDurationSec || scene.durationSec}s · mudo`
    });
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
            withMusic = true,
            // Contexto estratégico, el mismo del Generador de Publicaciones.
            publicationType = DEFAULT_TYPE,
            interestArea = DEFAULT_AREA,
            narration = null
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
        // Intensidad del movimiento: cuántas acciones se le piden al motor. Es
        // el mando de la cadencia — pedir de más da un clip acelerado.
        const safeIntensity = MOTION_INTENSITY[req.body?.motionIntensity]
            ? req.body.motionIntensity : DEFAULT_MOTION_INTENSITY;

        let engineChoice;
        try {
            engineChoice = resolveEngine({ engine: requestedEngine, format: safeFormat, qualityTier });
        } catch (e) {
            return res.status(503).json({ error: e.message });
        }

        const context = resolveContext({ type: publicationType, interestArea });
        const projectId = randomUUID();

        // ── El Reel existe ANTES de llamar a ningún proveedor (v4.670) ──
        //
        // La fila se inserta acá, en `queued`, y no después de dirigir. Dirigir
        // cuesta ~20 s de visión y narrativa, y durante esos 20 s el Reel no
        // existía en ninguna parte: quien abría la Biblioteca no veía nada y
        // quien cerraba la pestaña perdía el rastro de lo que acababa de pedir.
        //
        // Con la fila creada primero, la tarjeta aparece en el instante en que
        // se pulsa «Renderizar», el barrido del cron puede recogerlo aunque
        // esta petición muera a mitad, y un fallo al dirigir deja un Reel con
        // su motivo escrito en vez de no dejar nada.
        await db.query(
            `INSERT INTO "ReelProject" (
                id, title, "clubId", "userId", "userEmail", "organizationName",
                "publicationType", "interestArea",
                format, "qualityTier", "motionStyle", transition, "musicStyle", config,
                engine, "engineModel", status, notes, "creditsEstimated", version,
                "createdAt", "updatedAt"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'queued','[]'::jsonb,0,$17,NOW(),NOW())`,
            [
                projectId,
                title || buildReelTitle({ organizationName, motionStyle: safeMotion, format: safeFormat }),
                req.user?.clubId || null, req.user?.id || null, req.user?.email || null, organizationName,
                context.type, context.interestArea,
                safeFormat, engineChoice.qualityTier, safeMotion, safeTransition, safeMusic,
                JSON.stringify({
                    withMusic: Boolean(withMusic),
                    motionIntensity: safeIntensity,
                    requestedEngine: requestedEngine || null,
                    sourceImages: images.map(i => ({ id: i.id || null, url: i.url })),
                    copyLocale: req.body?.copyLocale || 'es',
                    narration: {
                        enabled: Boolean(narration?.enabled),
                        language: NARRATION_LANGUAGES[narration?.language] ? narration.language : NARRATION_DEFAULT_LANGUAGE,
                        style: NARRATION_STYLES[narration?.style] ? narration.style : NARRATION_DEFAULT_STYLE,
                        gender: NARRATION_GENDERS[narration?.gender] ? narration.gender : 'female',
                        speed: Number.isFinite(Number(narration?.speed)) ? Math.min(1.15, Math.max(0.85, Number(narration.speed))) : 1,
                        provider: narration?.provider || null
                    }
                }),
                engineChoice.engineId, engineChoice.model, REEL_MODULE_VERSION
            ]
        );

        // 1. Dirección: análisis de las tres fotos + narrativa. El contexto se
        //    resuelve ANTES de dirigir: el tipo de publicación y el área de
        //    enfoque cambian qué historia cuenta la pieza, no sólo cómo se
        //    escribe el copy.
        await db.query(`UPDATE "ReelProject" SET status = 'analyzing', "updatedAt" = NOW() WHERE id = $1`, [projectId]);

        let analyses, directionRaw, warnings, directorUsage;
        try {
            ({ analyses, direction: directionRaw, warnings, usage: directorUsage } = await directReel(images, {
                motionStyle: safeMotion, transition: safeTransition, musicStyle: safeMusic,
                context
            }));
        } catch (e) {
            // El Reel ya existe: se marca con el motivo en vez de desaparecer.
            console.error('[REEL] dirección falló:', e.message);
            await db.query(
                `UPDATE "ReelProject" SET status = 'error', "statusDetail" = $2, "updatedAt" = NOW() WHERE id = $1`,
                [projectId, `No se pudo analizar las fotografías: ${e.message}`]
            );
            const { rows } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [projectId]);
            return respondProject(res, rows[0], 502);
        }

        // `rawResponse` es la respuesta entera del proveedor: sirve para contar
        // tokens y no tiene por qué acabar guardada en la columna `direction`,
        // que se lee en cada listado.
        const { rawResponse: _directionRaw, ...direction } = directionRaw;

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

        // La fila ya existe desde `queued`: acá se COMPLETA con lo que sólo se
        // sabe después de dirigir. `config` se fusiona en vez de reemplazarse
        // para no perder lo que se guardó al crearla.
        await db.query(
            `UPDATE "ReelProject"
                SET title = $2, analysis = $3, direction = $4, notes = $5,
                    config = config || $6::jsonb,
                    status = 'directing', "updatedAt" = NOW()
              WHERE id = $1`,
            [
                projectId, resolvedTitle,
                JSON.stringify(analyses), JSON.stringify(direction), JSON.stringify(notes),
                JSON.stringify({ timing })
            ]
        );

        // El consumo del director se registra ACÁ y no dentro de `directReel`
        // porque hasta esta línea el proyecto no tenía fila a la que colgarlo.
        for (const u of directorUsage || []) {
            await recordUsage({
                projectId, clubId: req.user?.clubId || null,
                operation: u.operation, provider: 'llm', model: u.model,
                units: tokensOf(u.raw), unit: 'tokens',
                ms: u.ms, status: u.status, detail: u.detail, target: u.target
            });
        }

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
                musicStyle: direction.musicStyle,
                intensity: safeIntensity
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

        // 4. Música, copies y locución NO se hacen acá (v4.669).
        //
        //    Hasta v4.668 las tres se resolvían dentro de esta petición, y las
        //    tres son lentas: la música de ElevenLabs es SÍNCRONA (20-40 s), el
        //    copy es una llamada de texto (~10 s) y la locución son varias
        //    síntesis seguidas. Sumaban ~40-60 s a un `POST /reels` que sólo
        //    tenía que confirmar que el Reel arrancó, así que el usuario se
        //    quedaba mirando "Analizando las fotos..." mientras los clips —lo
        //    único de verdad largo— ya estaban corriendo en KIE.
        //
        //    Ahora se lanzan en el PRIMER sondeo (`advanceSideTracks`), que
        //    ocurre unos segundos después y en su propia invocación. Siguen
        //    yendo en paralelo con los clips, que es lo que importaba, y la
        //    respuesta de creación baja a lo que tarda dirigir y despachar.
        //
        //    En Vercel no sirve dispararlas sin `await` y responder: la función
        //    se congela al cerrar la respuesta y el trabajo quedaría a medias.
        //    Por eso se difieren a un sondeo en vez de soltarse en segundo plano.

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

        // ── Se compara contra la imagen que SE ANIMÓ (v4.671) ──
        //
        // `animationSourceOf` es el único sitio donde se decide qué imagen va al
        // motor de video, y la comprobación tiene que usar la misma. Hasta
        // v4.670 comparaba siempre contra `sourceImageUrl`, la foto ORIGINAL, y
        // eso rompía las escenas cuyo lienzo se había adaptado: el clip es 9:16
        // y la foto original es apaisada, así que la huella perceptual daba una
        // nota baja POR CONSTRUCCIÓN, no por deriva del modelo.
        //
        // El daño no era sólo una etiqueta equivocada. Una escena marcada
        // `failed` se regenera sola, y la regeneración parte de la MISMA imagen
        // adaptada: vuelve a fallar igual. Eran dos rondas de créditos de video
        // gastados en un problema que no existía y que no se podía arreglar así.
        //
        // Lo que sí conserva sentido es medir la adaptación contra el original:
        // de eso se encarga `verifyExpansion`, que recorta la región donde vive
        // la foto y sólo compara ahí. Son dos comprobaciones distintas y cada
        // una mira su par correcto.
        const comparisonUrl = animationSourceOf(scene);
        const srcResp = await fetch(comparisonUrl);
        if (!srcResp.ok) {
            return {
                state: 'unavailable', score: null, issues: [],
                frames: frames.map(({ at, position, url }) => ({ at, position, frameUrl: url })),
                reason: `No se pudo descargar la imagen de origen (${srcResp.status}).`
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

    // ── Narración ──
    //
    // Normalmente ya está: se genera en paralelo con los clips desde v4.669
    // (`advanceSideTracks`). Esto es la red de seguridad para el Reel cuyo
    // intento anterior falló o que se creó con una versión previa — y para el
    // montaje relanzado a mano, que puede llegar acá sin haber pasado por un
    // sondeo. Sincroniza contra `config.timing.finalDurationSec`, el mismo
    // número en los dos caminos.
    let narration = await fetchNarration(project.id);
    if (!narration && project.config?.narration?.enabled) {
        narration = await produceNarration(project, usable);
    }

    const spec = buildEditSpec({
        scenes: usable.map(s => ({
            videoUrl: s.videoUrl,
            durationSec: Number(s.durationSec),
            transitionOut: s.transitionOut
        })),
        tier: resolveTier(project.format, project.qualityTier),
        soundtrackUrl: project.musicUrl || null,
        voice: narration ? {
            src: narration.audioUrl,
            leadIn: narration.timing?.leadInSec ?? 0.35,
            stretch: narration.timing?.stretch ?? 1
        } : null,
        callbackUrl: `${process.env.APP_URL || 'https://app.clubplatform.org'}/api/content-studio/reel-webhook`
    });

    await db.query(
        `UPDATE "ReelProject" SET status = 'assembling', "statusDetail" = NULL, "renderSpec" = $2, "updatedAt" = NOW() WHERE id = $1`,
        [project.id, JSON.stringify(spec)]
    );

    let submitted;
    const renderStartedAt = Date.now();
    try {
        submitted = await submitRender(spec, project.config?.renderProvider || null);
        // Con montaje local el trabajo YA está hecho cuando esto vuelve, así
        // que el tiempo medido es el del render completo. Con un proveedor
        // alojado es sólo el de crear el trabajo, y se dice en el detalle.
        await recordUsage({
            projectId: project.id, clubId: project.clubId,
            operation: 'render.compose',
            provider: submitted.mode === 'local' ? 'ffmpeg' : 'render',
            model: submitted.provider,
            units: submitted.mode === 'local' ? (Date.now() - renderStartedAt) / 1000 : 0,
            unit: 'seconds',
            ms: Date.now() - renderStartedAt,
            target: 'Montaje final',
            detail: submitted.mode === 'local'
                ? `${usable.length} clips · ${project.config?.timing?.finalDurationSec || '?'}s`
                : `Trabajo creado en ${submitted.provider}; el tiempo de render corre en el proveedor.`
        });
    } catch (e) {
        console.error(`[REEL] ${project.id} montaje no se pudo lanzar:`, e.message);
        await recordUsage({
            projectId: project.id, clubId: project.clubId,
            operation: 'render.compose', provider: 'ffmpeg',
            ms: Date.now() - renderStartedAt, status: 'error', detail: e.message,
            target: 'Montaje final'
        });
        // El diagnóstico técnico se guarda en la fila, no sólo en el log: un
        // «no se pudo montar» sin el comando, el código de salida y la cola de
        // stderr obliga a reproducir el fallo a ciegas. Lo lee el panel de
        // administración; al usuario se le sigue mostrando el mensaje llano.
        if (e.diagnostics?.length) {
            await db.query(
                `UPDATE "ReelProject" SET "renderRaw" = $2, "updatedAt" = NOW() WHERE id = $1`,
                [project.id, JSON.stringify({ failedAt: new Date().toISOString(), diagnostics: e.diagnostics })]
            ).catch(() => { /* el diagnóstico no puede tumbar el manejo del error */ });
        }
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
    await autoSaveToLibrary(rows[0]);
    return rows[0];
};

// Guarda el Reel en la Biblioteca en cuanto hay archivo, sin que nadie lo pida.
//
// Hasta v4.668 sólo entraba con veredicto `ready`, y como la validación marca
// `review` por cosas menores —una tasa de bits baja en un plano fijo, un desvío
// de dos décimas en la duración— había Reels perfectamente utilizables que no
// aparecían nunca. El criterio era equivocado: la Biblioteca es el inventario
// de lo que se generó, no la lista de lo aprobado. El estado viaja con la ficha
// y se ve en la tarjeta; quien mire sabe cuál pasó la validación y cuál no.
//
// Nunca lanza: que la Biblioteca falle no puede convertir un Reel terminado en
// un Reel con error.
const autoSaveToLibrary = async (project) => {
    if (!project?.videoUrl || project.mediaId) return project;
    if (project.status !== 'ready' && project.status !== 'needs_review') return project;
    try {
        const media = await createLibraryEntry(project);
        console.log(`[REEL] ${project.id} guardado automáticamente en la Biblioteca (${media.id})`);
    } catch (e) {
        console.error(`[REEL] ${project.id} no se pudo guardar en la Biblioteca:`, e.message);
        await appendNote(project.id, `No se pudo guardar automáticamente en la Biblioteca: ${e.message} Se puede guardar a mano desde la ficha.`);
    }
    return project;
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
    await autoSaveToLibrary(rows[0]);
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
// Lanza en paralelo lo que NO depende de que los clips estén listos: la banda
// sonora, los copies y la locución. Se llama desde el primer sondeo.
//
// Por qué acá y no al crear el Reel: las tres son lentas y ninguna hace falta
// para contestar «el Reel arrancó». Corriéndolas dentro del `POST` sumaban
// ~40-60 s a la espera inicial mientras los clips —lo realmente largo— ya iban
// avanzando por su cuenta. Acá siguen siendo paralelas a los clips, que es lo
// que las hacía gratis en tiempo de reloj, pero ya no retrasan la respuesta.
//
// El UPDATE condicional es la reserva: dos sondeos simultáneos —el del
// navegador y el del webhook— no pueden lanzar la música dos veces. La ventana
// de 5 minutos deja que un intento que murió a medias se reintente.
const advanceSideTracks = async (project) => {
    const { rows: claimed } = await db.query(
        `UPDATE "ReelProject" SET "sideTracksAt" = NOW()
         WHERE id = $1 AND ("sideTracksAt" IS NULL OR "sideTracksAt" < NOW() - INTERVAL '5 minutes')
         RETURNING id`,
        [project.id]
    );
    if (!claimed.length) return;

    const scenes = await fetchScenes(project.id);
    const jobs = [];

    if (project.config?.withMusic && !project.musicUrl && !project.musicTaskId) {
        jobs.push((async () => {
            try {
                await resolveSoundtrack(project, {
                    style: project.direction?.musicStyle || project.musicStyle,
                    durationSec: project.config?.timing?.finalDurationSec || TARGET_TOTAL_SEC
                });
            } catch (e) {
                console.error(`[REEL] ${project.id} música no se pudo lanzar:`, e.message);
                await appendNote(project.id, `No se pudo generar la banda sonora: ${e.message} El Reel se monta sin música.`);
            }
        })());
    }

    if (!(await fetchCopies(project.id)).length) {
        jobs.push(produceCopy(project, scenes, {
            locale: project.config?.copyLocale || 'es',
            createdBy: project.userId || null
        }));
    }

    // La locución también sale de acá, no del montaje. El Narrative Timing
    // Engine se sincroniza contra `config.timing.finalDurationSec`, que se
    // calcula al crear el Reel y no cambia porque una escena se regenere: la
    // duración de cada escena está fijada desde el principio. Generarla al
    // montar no la hacía más exacta, sólo la ponía en el camino crítico.
    if (project.config?.narration?.enabled && !(await fetchNarration(project.id))) {
        jobs.push(produceNarration(project, scenes));
    }

    if (jobs.length) {
        await Promise.allSettled(jobs);
        console.log(`[REEL] ${project.id}: ${jobs.length} tarea/s paralelas (música/copy/voz) resueltas`);
    }
};

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

    // ── Música, copies y locución, en paralelo con los clips ──
    //
    // Se intenta en cada sondeo, pero la reserva de dentro hace que sólo el
    // primero trabaje. Va antes de las escenas para que arranque cuanto antes.
    await advanceSideTracks(project);

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
        // Estas escenas se despachan DESPUÉS de crear el Reel, así que su
        // consumo no estaba en el total que se calculó entonces.
        await refreshProjectCredits(project.id);

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
        await refreshProjectCredits(project.id);
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
    // ── Escenas congeladas (v4.675) ──
    //
    // Una escena puede conservar la fotografía perfectamente y no tener vida
    // ninguna: es el defecto que se reportó —«las escenas 2 y 3 permanecen
    // prácticamente estáticas»— y la comprobación de fidelidad no lo ve, porque
    // mide justo lo contrario. Con `lifeScore` sí se ve, y una escena congelada
    // se relanza como cualquier otra que no cumplió.
    //
    // Sólo cuenta cuando el modelo de visión pudo emitir el juicio: es el único
    // que distingue «se movió la gente» de «se movió el encuadre». Sin él no se
    // regenera a ciegas.
    const frozen = finalScenes.filter(sc =>
        sc.fidelity?.state === 'ok'
        && (sc.fidelity?.lifeSource === 'vision' || sc.fidelity?.lifeSource === 'frames')
        && sc.fidelity?.lifeScore != null
        && sc.fidelity.lifeScore < FROZEN_LIFE_SCORE
        && sc.engine !== 'still_motion'
        && sc.attempts < MAX_AUTO_RETRIES
    );
    if (frozen.length) {
        console.warn(`[REEL] ${project.id}: ${frozen.length} escena(s) sin movimiento interno; se regeneran.`);
        await Promise.allSettled(frozen.map(sc =>
            relaunchScene(sc, { auto: true, reason: 'la escena quedó prácticamente estática' })));
        await appendNote(project.id,
            `Se regeneraron ${frozen.length} escena(s) que quedaron sin movimiento interno: el motor conservó la fotografía pero no la animó.`);
        const { rows } = await db.query(
            `UPDATE "ReelProject" SET status = 'generating', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [project.id]
        );
        return rows[0];
    }

    const infidel = finalScenes.filter(s => s.fidelity?.state === 'failed');
    if (infidel.length) {
        // ── Alternativa segura en vez de regenerar (v4.672) ──
        //
        // Una escena con PERSONAS que no conservó la fotografía no se arregla
        // volviendo a pedírsela al mismo motor: un modelo image-to-video
        // redibuja lo que anima, así que la segunda pasada vuelve a rehacer los
        // rostros. Era gastar créditos para repetir el problema.
        //
        // Se cae a movimiento 2.5D sobre la propia foto, que conserva la
        // identidad por construcción —los píxeles son los del original— y
        // cuesta segundos y cero créditos.
        //
        // Sin personas sí tiene sentido reintentar con el motor: ahí lo que
        // falló fue el encuadre o la estabilidad, no una cara, y el motor puede
        // acertar en la segunda.
        // ── El respaldo 2.5D deja de sustituir al clip animado (v4.676) ──
        //
        // Hasta v4.675 una escena con personas que fallaba la fidelidad DOS
        // veces se reemplazaba por un paneo sobre la foto quieta. El resultado
        // es exactamente lo reportado: «una escena animada y dos que se mueven
        // de un lado a otro». Y era irreversible — el rescate de escenas
        // congeladas excluye a `still_motion`, así que ese paneo se quedaba.
        //
        // Peor: el criterio se volvía en contra del objetivo. Una escena que
        // cobró MÁS vida se parece MENOS a la foto de origen, así que es la más
        // propensa a suspender la fidelidad. Se estaba castigando justo lo que
        // se busca, y sustituyéndolo por lo que no se busca.
        //
        // Ahora el clip animado SE CONSERVA. Lo que falla la fidelidad se
        // anota y se muestra en la ficha, y la decisión de descartarlo es del
        // usuario, que es quien puede mirar el video. El paneo queda para lo
        // único que siempre fue: la elección expresa del estilo «Fotográfico».
        //
        // La excepción son los defectos que sí descalifican una pieza
        // institucional —un logotipo redibujado o un texto ilegible—: ahí no
        // hay criterio estético que valga y se reintenta mientras queden
        // intentos.
        const descalificados = infidel.filter(sc =>
            (sc.fidelity?.brandAltered || sc.fidelity?.textIllegible) && sc.attempts < MAX_AUTO_RETRIES);
        const conservados = infidel.filter(sc => !descalificados.includes(sc));

        if (descalificados.length) {
            await Promise.allSettled(descalificados.map(sc =>
                relaunchScene(sc, { auto: true, reason: 'la marca o el texto quedaron alterados' })));
            await appendNote(project.id,
                `Se regeneraron ${descalificados.length} escena(s) donde un logotipo o un texto quedó alterado.`);
        }

        if (conservados.length) {
            // Se marcan como listas: el clip existe y se usa. La nota explica
            // qué se midió para que la decisión de rehacerlas sea informada.
            await db.query(
                `UPDATE "ReelScene" SET status = 'needs_review', "updatedAt" = NOW() WHERE id = ANY($1)`,
                [conservados.map(sc => sc.id)]
            );
            await appendNote(project.id,
                `${conservados.length} escena(s) se apartan de la fotografía más de lo habitual —normal cuando el motor anima mucho—. Se conservan animadas; se pueden regenerar una a una desde la línea de tiempo.`);
        }

        if (descalificados.length) {
            const { rows } = await db.query(
                `UPDATE "ReelProject" SET status = 'generating', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
                [project.id]
            );
            return rows[0];
        }
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
            musicStyle: project.direction?.musicStyle || DEFAULT_MUSIC_STYLE,
            intensity: project.config?.motionIntensity || DEFAULT_MOTION_INTENSITY
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
            await db.query(
                `UPDATE "ReelProject"
                 SET "musicUrl" = NULL, "musicTaskId" = NULL, "musicStyle" = $2,
                     direction = jsonb_set(COALESCE(direction,'{}'::jsonb), '{musicStyle}', $3::jsonb),
                     config = jsonb_set(config, '{withMusic}', 'true'::jsonb),
                     "renderJobId" = NULL, "updatedAt" = NOW()
                 WHERE id = $1`,
                [project.id, style, JSON.stringify(style)]
            );
            const track = await resolveSoundtrack(project, {
                style,
                durationSec: project.config?.timing?.finalDurationSec || TARGET_TOTAL_SEC
            });
            // Con un proveedor síncrono la pista ya está: no hay nada que
            // sondear y el montaje puede relanzarse en el acto.
            if (track.state === 'queued') {
                await db.query(`UPDATE "ReelProject" SET status = 'scoring', "updatedAt" = NOW() WHERE id = $1`, [project.id]);
            }
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

// ─── Banda sonora ──────────────────────────────────────────────────────────
//
// `startSoundtrack` devuelve una de tres formas según el proveedor que resolvió
// la cadena: un buffer (síncrono), una URL (biblioteca) o un id de tarea
// (asíncrono). Este helper las unifica y deja el proyecto con `musicUrl` puesto
// cuando ya hay archivo, para que el resto del flujo no tenga que saber por
// dónde vino.
const resolveSoundtrack = async (project, { style, durationSec }) => {
    const musicStartedAt = Date.now();
    const track = await startSoundtrack({
        style,
        durationSec,
        clubId: project.clubId,
        metadata: { reelProjectId: project.id }
    });

    // La música se registra contra el proveedor que REALMENTE la atendió, no
    // contra el que se pidió: si el principal cayó y respondió el respaldo, el
    // panel tiene que mostrar el respaldo.
    await recordUsage({
        projectId: project.id, clubId: project.clubId,
        operation: 'music.generate',
        provider: track.provider === 'stable_audio' ? 'stability'
            : track.provider === 'kie_music' ? 'kie' : 'elevenlabs',
        model: track.model || track.provider || null,
        units: durationSec, unit: 'seconds',
        ms: Date.now() - musicStartedAt,
        status: track.state === 'failed' ? 'error' : 'ok',
        detail: track.state === 'failed' ? track.failMsg : `${style} · ${durationSec}s`,
        target: 'Banda sonora'
    });

    // Lo que se intentó y falló va al historial: que el principal cayera y lo
    // salvara el respaldo es exactamente lo que hay que poder ver después.
    for (const note of track.attempted || []) {
        await appendNote(project.id, `Música: falló ${note}${track.provider ? `; se usó ${track.provider}.` : '.'}`);
    }

    let url = track.url;
    let s3Key = null;

    // Modo síncrono: el audio ya está en memoria. Se sube y queda listo — sin
    // sondeo y sin URL de proveedor que caduque antes de copiarla.
    if (track.buffer) {
        const upload = await uploadBuffer(
            track.buffer,
            `clubs/${project.clubId || 'global'}/reels/music/${project.id}-${Date.now()}.${track.extension || 'mp3'}`,
            track.contentType || 'audio/mpeg'
        );
        url = upload.url;
        s3Key = upload.key;
    }

    await db.query(
        `UPDATE "ReelProject"
         SET "musicProvider" = $2, "musicTaskId" = $3, "musicUrl" = $4,
             "musicS3Key" = COALESCE($5, "musicS3Key"), "musicPrompt" = $6, "updatedAt" = NOW()
         WHERE id = $1`,
        [project.id, track.provider, track.taskId, url, s3Key, track.prompt || null]
    );

    if (track.state === 'failed') {
        await appendNote(project.id, `${track.failMsg} El Reel se monta sin música.`);
    }

    return { ...track, url, s3Key };
};

// ─── Narración ─────────────────────────────────────────────────────────────
//
// El guion NO es el copy: uno se lee y el otro se escucha. Un texto con
// hashtags narrado en voz alta suena absurdo, así que son dos generadores.
//
// La sincronía no se pide, se construye: el Narrative Timing Engine escribe,
// sintetiza, MIDE el archivo real con FFmpeg y corrige el presupuesto de
// palabras hasta que la locución entra en el hueco disponible.

const insertNarrationVersion = async (project, fitted, meta) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: prev } = await client.query(
            'SELECT COALESCE(MAX(version), 0) AS v FROM "ReelNarration" WHERE "projectId" = $1',
            [project.id]
        );
        await client.query(
            'UPDATE "ReelNarration" SET "isCurrent" = FALSE WHERE "projectId" = $1 AND "isCurrent"',
            [project.id]
        );
        const { rows } = await client.query(
            `INSERT INTO "ReelNarration" (
                id, "projectId", "clubId", version, "isCurrent",
                script, words, rationale, language, style, gender, speed,
                "audioUrl", "audioS3Key", "ttsProvider", "voiceId",
                timing, "actualSec", "targetSec", "driftSec", "withinTolerance",
                source, "scriptProvider", "scriptModel", "createdBy", "createdAt"
             ) VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW())
             RETURNING *`,
            [
                randomUUID(), project.id, project.clubId, Number(prev[0].v) + 1,
                fitted.script, fitted.words, fitted.rationale,
                meta.language, meta.style, meta.gender, meta.speed,
                meta.audioUrl, meta.audioS3Key, fitted.ttsProvider, fitted.voiceId,
                JSON.stringify({
                    attempts: fitted.attempts, budget: fitted.budget,
                    leadInSec: fitted.leadInSec, stretch: fitted.stretch
                }),
                fitted.actualSec, fitted.targetSec, fitted.driftSec, fitted.withinTolerance,
                meta.source || 'ai', fitted.scriptProvider, fitted.scriptModel,
                meta.createdBy || null
            ]
        );
        await client.query('COMMIT');
        return rows[0];
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    } finally {
        client.release();
    }
};

// Genera guion + voz y la deja lista para el montaje. Nunca lanza hacia arriba:
// un fallo de la narración no puede tumbar un Reel que se está renderizando
// bien — se anota y el Reel sale con música sola.
const produceNarration = async (project, scenes, opts = {}) => {
    const cfg = project.config?.narration || {};
    if (!cfg.enabled) return null;

    const language = NARRATION_LANGUAGES[opts.language || cfg.language] ? (opts.language || cfg.language) : NARRATION_DEFAULT_LANGUAGE;
    const style = NARRATION_STYLES[opts.style || cfg.style] ? (opts.style || cfg.style) : NARRATION_DEFAULT_STYLE;
    const gender = NARRATION_GENDERS[opts.gender || cfg.gender] ? (opts.gender || cfg.gender) : 'female';
    const speed = Number(opts.speed ?? cfg.speed ?? 1);
    const ttsProvider = opts.ttsProvider || cfg.provider || null;

    const narrationStartedAt = Date.now();
    try {
        const entity = await entityFor(project);
        const context = resolveContext({
            type: project.publicationType,
            interestArea: project.interestArea
        });

        const fitted = await fitNarrationToDuration({
            scenes,
            durationSec: project.config?.timing?.finalDurationSec || TARGET_TOTAL_SEC,
            language, style, speed, gender, context,
            clubName: entity.clubName, clubCity: entity.clubCity,
            ttsProvider,
            measureAudio: measureAudioDuration,
            scriptOverride: opts.scriptOverride || null
        });

        const upload = await uploadBuffer(
            fitted.audioBuffer,
            `clubs/${project.clubId || 'global'}/reels/narration/${project.id}-${Date.now()}.mp3`,
            'audio/mpeg'
        );

        const saved = await insertNarrationVersion(project, fitted, {
            language, style, gender, speed,
            audioUrl: upload.url, audioS3Key: upload.key,
            source: opts.scriptOverride ? 'manual' : 'ai',
            createdBy: opts.createdBy || null
        });

        if (!fitted.withinTolerance) {
            await appendNote(project.id,
                `${describeTiming(fitted)} Se puede regenerar el guion o ajustar la velocidad desde la ficha.`);
        }

        // Dos filas, porque son dos proveedores distintos: el guion lo escribe
        // el modelo de lenguaje y la voz la sintetiza el motor de audio.
        // Meterlas juntas escondería justamente el reparto que hay que auditar.
        //
        // Los caracteres son los de TODOS los intentos del Narrative Timing
        // Engine, no los del texto final: el motor de voz cobra cada síntesis,
        // y contar sólo la última haría parecer más barato de lo que fue.
        await recordUsage({
            projectId: project.id, clubId: project.clubId,
            operation: 'script.generate', provider: 'llm',
            model: fitted.scriptModel || null,
            units: tokensOf(fitted.scriptRaw), unit: 'tokens',
            target: 'Guion de la locución',
            detail: `${fitted.words} palabras · ${(fitted.attempts || []).length} intento/s`
        });
        await recordUsage({
            projectId: project.id, clubId: project.clubId,
            operation: 'voice.synthesize',
            provider: fitted.ttsProvider === 'openai' ? 'llm' : 'elevenlabs',
            model: fitted.voiceId || fitted.ttsProvider || null,
            units: fitted.charsSynthesized || 0, unit: 'characters',
            ms: Date.now() - narrationStartedAt,
            target: 'Locución',
            detail: `${language} · ${fitted.actualSec}s de ${fitted.targetSec}s`
        });

        console.log(`[REEL] ${project.id} narración lista: ${fitted.words} palabras, ${fitted.actualSec}s de ${fitted.targetSec}s (desvío ${fitted.driftSec}s, ${fitted.attempts.length} intento/s)`);
        return saved;
    } catch (e) {
        console.error(`[REEL] ${project.id} narración falló:`, e.message);
        await recordUsage({
            projectId: project.id, clubId: project.clubId,
            operation: 'voice.synthesize', provider: 'elevenlabs',
            ms: Date.now() - narrationStartedAt, status: 'error', detail: e.message,
            target: 'Locución'
        });
        await appendNote(project.id, `La narración no se pudo generar: ${e.message} El Reel se monta con la música sola.`);
        return null;
    }
};

const fetchNarration = async (projectId, { includeHistory = false } = {}) => {
    const { rows } = await db.query(
        `SELECT * FROM "ReelNarration" WHERE "projectId" = $1 ${includeHistory ? '' : 'AND "isCurrent"'}
         ORDER BY version DESC`,
        [projectId]
    );
    return includeHistory ? rows : (rows[0] || null);
};

const narrationToDto = (row) => row && ({
    id: row.id,
    version: row.version,
    isCurrent: row.isCurrent,
    script: row.script,
    words: row.words,
    rationale: row.rationale,
    language: row.language,
    languageLabel: NARRATION_LANGUAGES[row.language]?.label || row.language,
    style: row.style,
    styleLabel: NARRATION_STYLES[row.style]?.label || row.style,
    gender: row.gender,
    speed: row.speed,
    audioUrl: row.audioUrl,
    ttsProvider: row.ttsProvider,
    ttsProviderLabel: TTS_PROVIDERS[row.ttsProvider]?.label || row.ttsProvider,
    // Se dice si el motor usado puede hacer el acento pedido. Prometer «acento
    // colombiano» con un motor que no lo controla sería justo el tipo de
    // afirmación que este módulo no hace.
    accentControlled: TTS_PROVIDERS[row.ttsProvider]?.accentControl ?? null,
    voiceId: row.voiceId,
    actualSec: row.actualSec,
    targetSec: row.targetSec,
    driftSec: row.driftSec,
    withinTolerance: row.withinTolerance,
    timing: row.timing,
    source: row.source,
    createdAt: row.createdAt,
    summary: describeTiming({
        actualSec: row.actualSec, targetSec: row.targetSec, driftSec: row.driftSec,
        withinTolerance: row.withinTolerance, attempts: row.timing?.attempts || []
    })
});

export const getReelNarration = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });
        const history = req.query.history === 'true';
        const data = await fetchNarration(project.id, { includeHistory: history });
        res.json({
            narration: history ? data.map(narrationToDto) : narrationToDto(data),
            budget: computeWordBudget({
                durationSec: project.config?.timing?.finalDurationSec || TARGET_TOTAL_SEC
            })
        });
    } catch (e) {
        console.error('[REEL] narration:', e);
        res.status(500).json({ error: e.message });
    }
};

// Regenera la voz: otro idioma, otro acento, otro estilo, otra velocidad — o un
// guion escrito a mano. NO vuelve a renderizar el video: sólo relanza el
// montaje, que es lo que permite probar voces sin gastar créditos de video.
export const regenerateNarration = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        if (!activeTtsProvider() && !req.body?.ttsProvider) {
            return res.status(503).json({
                error: 'No hay proveedor de voz disponible. Configurar ELEVENLABS_API_KEY o OPENAI_API_KEY.'
            });
        }

        // Si la narración estaba apagada, pedirla la enciende.
        const { rows: enabled } = await db.query(
            `UPDATE "ReelProject"
             SET config = jsonb_set(config, '{narration,enabled}', 'true'::jsonb, true), "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [project.id]
        );

        const scenes = await fetchScenes(project.id);
        const saved = await produceNarration(enabled[0], scenes, {
            language: req.body?.language,
            style: req.body?.style,
            gender: req.body?.gender,
            speed: req.body?.speed,
            ttsProvider: req.body?.ttsProvider,
            scriptOverride: typeof req.body?.script === 'string' && req.body.script.trim()
                ? req.body.script.trim() : null,
            createdBy: req.user?.id || null
        });

        if (!saved) return res.status(502).json({ error: 'No se pudo generar la narración. Revisá los avisos del Reel.' });

        // El montaje anterior no lleva esta voz: se limpia el job para que el
        // siguiente sondeo rehaga la mezcla. El VIDEO no se regenera.
        const { rows: proj } = await db.query(
            `UPDATE "ReelProject" SET "renderJobId" = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [project.id]
        );

        if (req.body?.remount !== false) {
            const updated = await submitAssembly(proj[0], scenes);
            return respondProject(res, updated);
        }
        await respondProject(res, proj[0]);
    } catch (e) {
        console.error('[REEL] regenerate narration:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Copies de publicación ─────────────────────────────────────────────────
//
// Se generan al crear el Reel, EN PARALELO con los clips: el análisis de las
// tres fotos ya está hecho (lo hizo el director), así que escribir los textos
// cuesta una llamada de texto y ~10 s. Los clips tardan 1-3 minutos. Cuando el
// video está listo, los copies llevan rato esperando.
//
// VERSIONADO: nunca se actualiza una fila. Editar o regenerar inserta una
// versión nueva y baja la bandera de la anterior, así se puede volver a un
// texto que ya gustaba. Un índice único parcial impide que dos versiones se
// declaren vigentes a la vez.

// Datos de la entidad para el prompt. Sin club, el copy habla en primera
// persona plural sin inventar nombres — lo resuelve `identityClause`.
const entityFor = async (project) => {
    if (!project.clubId) {
        return { clubName: project.organizationName || null, clubCategory: null, clubCity: null };
    }
    try {
        const { rows } = await db.query('SELECT name, type, city FROM "Club" WHERE id = $1', [project.clubId]);
        return {
            clubName: rows[0]?.name || project.organizationName || null,
            clubCategory: rows[0]?.type || null,
            clubCity: rows[0]?.city || null
        };
    } catch {
        return { clubName: project.organizationName || null, clubCategory: null, clubCity: null };
    }
};

// Inserta una versión nueva y desmarca la anterior, en una transacción: si el
// UPDATE pasara y el INSERT fallara, la plataforma quedaría sin copy vigente.
const insertCopyVersion = async (projectId, clubId, platformData, common, meta) => {
    // `db` expone `query`, no `connect`: para una transacción hay que tomar un
    // cliente del pool y devolverlo siempre (el `finally`), o en serverless se
    // agotan las 10 conexiones del pool en pocas peticiones.
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: prev } = await client.query(
            `SELECT COALESCE(MAX(version), 0) AS v FROM "ReelCopy"
             WHERE "projectId" = $1 AND platform = $2 AND locale = $3`,
            [projectId, platformData.platform, common.locale]
        );
        await client.query(
            `UPDATE "ReelCopy" SET "isCurrent" = FALSE
             WHERE "projectId" = $1 AND platform = $2 AND locale = $3 AND "isCurrent"`,
            [projectId, platformData.platform, common.locale]
        );
        const { rows } = await client.query(
            `INSERT INTO "ReelCopy" (
                id, "projectId", "clubId", platform, locale, version, "isCurrent",
                title, subtitle, hook, category, "marketingGoal", audience, keywords,
                description, cta, hashtags, "fullText", "charCount",
                source, provider, model, prompt, "createdBy", "createdAt"
             ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
             RETURNING *`,
            [
                randomUUID(), projectId, clubId, platformData.platform, common.locale,
                Number(prev[0].v) + 1,
                common.title, common.subtitle, common.hook, common.category,
                common.marketingGoal, common.audience, JSON.stringify(common.keywords || []),
                platformData.description, platformData.cta,
                JSON.stringify(platformData.hashtags || []),
                platformData.fullText, platformData.charCount,
                meta.source || 'ai', meta.provider || null, meta.model || null,
                meta.prompt || null, meta.createdBy || null
            ]
        );
        await client.query('COMMIT');
        return rows[0];
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    } finally {
        client.release();
    }
};

const persistCopy = async (project, copy, meta) => {
    const common = {
        locale: copy.locale, title: copy.title, subtitle: copy.subtitle, hook: copy.hook,
        category: copy.category, marketingGoal: copy.marketingGoal,
        audience: copy.audience, keywords: copy.keywords
    };
    const saved = [];
    for (const p of Object.values(copy.platforms)) {
        saved.push(await insertCopyVersion(project.id, project.clubId, p, common, meta));
    }
    return saved;
};

// Genera y guarda los copies. Nunca lanza hacia arriba: un fallo del
// copywriter no puede tumbar un Reel que se está renderizando bien. Se anota y
// el usuario puede regenerarlos desde la ficha.
const produceCopy = async (project, scenes, { locale = 'es', createdBy = null } = {}) => {
    const copyStartedAt = Date.now();
    try {
        const entity = await entityFor(project);
        const { copy, provider, model, prompt, rawResponse } = await generateReelCopy({
            reel: project, scenes, ...entity, locale,
            context: resolveContext({ type: project.publicationType, interestArea: project.interestArea })
        });
        await persistCopy(project, copy, { source: 'ai', provider, model, prompt, createdBy });
        await recordUsage({
            projectId: project.id, clubId: project.clubId,
            operation: 'copy.generate', provider: 'llm', model,
            units: tokensOf(rawResponse), unit: 'tokens',
            ms: Date.now() - copyStartedAt,
            target: 'Copies por plataforma',
            detail: `${Object.keys(copy?.platforms || {}).length} plataforma/s · ${locale}`
        });
        console.log(`[REEL] ${project.id} copies generados (${locale}) por ${provider}/${model}`);
        return copy;
    } catch (e) {
        console.error(`[REEL] ${project.id} copies fallaron:`, e.message);
        await recordUsage({
            projectId: project.id, clubId: project.clubId,
            operation: 'copy.generate', provider: 'llm',
            ms: Date.now() - copyStartedAt, status: 'error', detail: e.message,
            target: 'Copies por plataforma'
        });
        await appendNote(project.id, `Los textos de publicación no se pudieron generar: ${e.message} Se pueden regenerar desde la ficha del Reel.`);
        return null;
    }
};

const fetchCopies = async (projectId, { locale = null, includeHistory = false } = {}) => {
    const where = ['"projectId" = $1'];
    const params = [projectId];
    if (!includeHistory) where.push('"isCurrent"');
    if (locale) { params.push(locale); where.push(`locale = $${params.length}`); }
    const { rows } = await db.query(
        `SELECT * FROM "ReelCopy" WHERE ${where.join(' AND ')}
         ORDER BY platform ASC, locale ASC, version DESC`,
        params
    );
    return rows;
};

const copyRowToDto = (row) => ({
    id: row.id,
    platform: row.platform,
    platformLabel: COPY_PLATFORMS[row.platform]?.label || row.platform,
    locale: row.locale,
    version: row.version,
    isCurrent: row.isCurrent,
    title: row.title,
    subtitle: row.subtitle,
    hook: row.hook,
    category: row.category,
    marketingGoal: row.marketingGoal,
    audience: row.audience,
    keywords: row.keywords || [],
    description: row.description,
    cta: row.cta,
    hashtags: row.hashtags || [],
    fullText: row.fullText,
    charCount: row.charCount,
    maxChars: COPY_PLATFORMS[row.platform]?.maxChars || null,
    source: row.source,
    provider: row.provider,
    model: row.model,
    isFavorite: row.isFavorite,
    createdBy: row.createdBy,
    createdAt: row.createdAt
});

// Reconstruye la forma que espera `reelCopy.js` a partir de las filas vigentes.
const copiesToShape = (rows) => {
    if (!rows.length) return null;
    const first = rows[0];
    const platforms = {};
    for (const r of rows) {
        platforms[r.platform] = {
            platform: r.platform,
            label: COPY_PLATFORMS[r.platform]?.label || r.platform,
            description: r.description, cta: r.cta,
            hashtags: r.hashtags || [], fullText: r.fullText,
            charCount: r.charCount, maxChars: COPY_PLATFORMS[r.platform]?.maxChars
        };
    }
    return {
        locale: first.locale, title: first.title, subtitle: first.subtitle,
        hook: first.hook, category: first.category, marketingGoal: first.marketingGoal,
        audience: first.audience, keywords: first.keywords || [], platforms
    };
};

export const getReelCopies = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });
        const rows = await fetchCopies(project.id, {
            locale: req.query.locale || null,
            includeHistory: req.query.history === 'true'
        });
        res.json({
            copies: rows.map(copyRowToDto),
            platforms: Object.values(COPY_PLATFORMS).map(p => ({
                id: p.id, label: p.label, maxChars: p.maxChars, priority: p.priority
            })),
            categories: CAMPAIGN_CATEGORIES,
            goals: MARKETING_GOALS
        });
    } catch (e) {
        console.error('[REEL] copies:', e);
        res.status(500).json({ error: e.message });
    }
};

// Regenera: todas las plataformas, o sólo una. `instruction` deja pedir un
// matiz ("más corto", "menos formal") sin tocar el prompt maestro.
export const regenerateReelCopy = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const { platform, locale = 'es', instruction = null } = req.body || {};
        const scenes = await fetchScenes(project.id);
        const entity = await entityFor(project);

        if (platform) {
            if (!COPY_PLATFORMS[platform]) return res.status(400).json({ error: `Plataforma desconocida: ${platform}` });
            const current = await fetchCopies(project.id, { locale });
            const common = copiesToShape(current);
            const { platform: data, provider, model, prompt } = await regeneratePlatformCopy({
                reel: project, scenes, platform, ...entity, locale, instruction,
                context: resolveContext({ type: project.publicationType, interestArea: project.interestArea })
            });
            await insertCopyVersion(project.id, project.clubId, data, {
                locale,
                title: common?.title, subtitle: common?.subtitle, hook: common?.hook,
                category: common?.category, marketingGoal: common?.marketingGoal,
                audience: common?.audience, keywords: common?.keywords
            }, { source: 'ai', provider, model, prompt, createdBy: req.user?.id || null });
        } else {
            const copy = await produceCopy(project, scenes, { locale, createdBy: req.user?.id || null });
            if (!copy) return res.status(502).json({ error: 'No se pudieron generar los textos. Reintentá en unos segundos.' });
        }

        const rows = await fetchCopies(project.id, { locale });
        res.json({ copies: rows.map(copyRowToDto) });
    } catch (e) {
        console.error('[REEL] regenerate copy:', e);
        res.status(500).json({ error: e.message });
    }
};

// Edición manual. Guarda una versión nueva con `source: 'manual'`: el texto
// escrito a mano no se distingue del generado sólo por quién lo escribió, y esa
// distinción importa cuando alguien pregunta por qué un copy dice lo que dice.
export const updateReelCopy = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const { platform, locale = 'es', description, cta, hashtags, title, subtitle } = req.body || {};
        if (!COPY_PLATFORMS[platform]) return res.status(400).json({ error: `Plataforma desconocida: ${platform}` });

        const current = await fetchCopies(project.id, { locale });
        const common = copiesToShape(current);
        const existing = current.find(r => r.platform === platform);

        const nextHashtags = Array.isArray(hashtags)
            ? hashtags.map(h => String(h).trim()).filter(Boolean).map(h => h.startsWith('#') ? h : `#${h}`)
            : (existing?.hashtags || []);
        const nextDescription = typeof description === 'string' ? description : (existing?.description || '');
        const nextCta = typeof cta === 'string' ? cta : (existing?.cta || '');
        const fullText = [nextDescription, nextCta, nextHashtags.join(' ')].filter(Boolean).join('\n\n');

        const saved = await insertCopyVersion(project.id, project.clubId, {
            platform,
            description: nextDescription,
            cta: nextCta,
            hashtags: nextHashtags,
            fullText,
            charCount: fullText.length
        }, {
            locale,
            title: typeof title === 'string' ? title : common?.title,
            subtitle: typeof subtitle === 'string' ? subtitle : common?.subtitle,
            hook: common?.hook, category: common?.category,
            marketingGoal: common?.marketingGoal, audience: common?.audience,
            keywords: common?.keywords
        }, { source: 'manual', createdBy: req.user?.id || null });

        res.json({ copy: copyRowToDto(saved) });
    } catch (e) {
        console.error('[REEL] update copy:', e);
        res.status(500).json({ error: e.message });
    }
};

// Vuelve a una versión anterior sin borrar nada: la recupera como versión
// nueva. Deshacer no puede destruir el historial que hace posible deshacer.
export const restoreReelCopy = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const { rows } = await db.query(
            'SELECT * FROM "ReelCopy" WHERE id = $1 AND "projectId" = $2',
            [req.body?.copyId, project.id]
        );
        const old = rows[0];
        if (!old) return res.status(404).json({ error: 'Versión no encontrada' });

        const saved = await insertCopyVersion(project.id, project.clubId, {
            platform: old.platform, description: old.description, cta: old.cta,
            hashtags: old.hashtags || [], fullText: old.fullText, charCount: old.charCount
        }, {
            locale: old.locale, title: old.title, subtitle: old.subtitle, hook: old.hook,
            category: old.category, marketingGoal: old.marketingGoal,
            audience: old.audience, keywords: old.keywords
        }, { source: old.source, provider: old.provider, model: old.model, createdBy: req.user?.id || null });

        res.json({ copy: copyRowToDto(saved) });
    } catch (e) {
        console.error('[REEL] restore copy:', e);
        res.status(500).json({ error: e.message });
    }
};

export const toggleCopyFavorite = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });
        const { rows } = await db.query(
            `UPDATE "ReelCopy" SET "isFavorite" = NOT "isFavorite"
             WHERE id = $1 AND "projectId" = $2 RETURNING *`,
            [req.body?.copyId, project.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Copy no encontrado' });
        res.json({ copy: copyRowToDto(rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Exportación ───────────────────────────────────────────────────────────
//
// TXT, CSV, JSON y un ZIP con los tres más los metadatos. El PDF lo arma la
// pantalla con `jspdf`, que ya es dependencia del panel y es una librería de
// navegador: montarla en el servidor sería traer una segunda implementación
// para el mismo resultado.
export const exportReel = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const format = String(req.query.format || 'json').toLowerCase();
        const locale = req.query.locale || 'es';
        const rows = await fetchCopies(project.id, { locale });
        const copy = copiesToShape(rows);
        if (!copy) return res.status(400).json({ error: 'Este Reel todavía no tiene textos generados.' });

        const base = slugify(project.title);
        const send = (body, type, ext) => {
            res.setHeader('Content-Type', type);
            res.setHeader('Content-Disposition', `attachment; filename="${base}-${locale}.${ext}"`);
            res.send(body);
        };

        if (format === 'txt') return send(copyToText(copy, project), 'text/plain; charset=utf-8', 'txt');
        if (format === 'csv') return send(copyToCsv(copy, project), 'text/csv; charset=utf-8', 'csv');
        if (format === 'json') {
            return send(copyToJson(copy, project, {
                scenes: (await fetchScenes(project.id)).map(sceneToDto),
                versions: (await fetchCopies(project.id, { includeHistory: true })).map(copyRowToDto)
            }), 'application/json; charset=utf-8', 'json');
        }

        if (format === 'zip') {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            zip.file(`${base}-copies.txt`, copyToText(copy, project));
            zip.file(`${base}-copies.csv`, copyToCsv(copy, project));
            zip.file(`${base}-metadata.json`, copyToJson(copy, project, {
                scenes: (await fetchScenes(project.id)).map(sceneToDto)
            }));
            for (const p of Object.values(copy.platforms)) {
                zip.file(`copies/${p.platform}.txt`, p.fullText);
            }
            // El video va DENTRO del ZIP: el paquete tiene que servir para
            // publicar sin volver a la plataforma. Si falla la descarga, el ZIP
            // sale igual con los textos y un aviso — mejor que no salir.
            if (project.videoUrl) {
                try {
                    const resp = await fetch(project.videoUrl);
                    if (resp.ok) zip.file(`${base}.mp4`, Buffer.from(await resp.arrayBuffer()));
                    else zip.file('VIDEO-NO-INCLUIDO.txt', `No se pudo descargar el video (HTTP ${resp.status}). Está en: ${project.videoUrl}`);
                } catch (e) {
                    zip.file('VIDEO-NO-INCLUIDO.txt', `No se pudo descargar el video: ${e.message}\nEstá en: ${project.videoUrl}`);
                }
            }
            const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
            return send(buffer, 'application/zip', 'zip');
        }

        res.status(400).json({ error: `Formato no soportado: ${format}. Disponibles: txt, csv, json, zip.` });
    } catch (e) {
        console.error('[REEL] export:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Biblioteca ────────────────────────────────────────────────────────────
//
// Guardar en la Biblioteca es una acción EXPLÍCITA del usuario, distinta de
// copiar el archivo a S3 (que pasa solo, en cuanto está listo, porque la URL
// del proveedor caduca). Acá se crea la fila en `Media` con toda la metadata
// de producción, que es lo que permite reutilizar la pieza y versionarla.
// Crea la fila en `Media` con toda la metadata de producción. Una sola
// implementación para el guardado automático y el manual: si se duplicara, un
// Reel guardado solo y otro guardado a mano acabarían con fichas distintas.
//
// La metadata va en `Media.sourceLabel` y en la ficha del Reel; el archivo en
// S3 ya estaba subido desde antes (la URL del proveedor caduca, así que se
// copia en cuanto está listo). Guardar en la Biblioteca es OTRA cosa: es
// publicarlo como recurso reutilizable.
const createLibraryEntry = async (project) => {
    if (project.mediaId) {
        const { rows } = await db.query('SELECT * FROM "Media" WHERE id = $1', [project.mediaId]);
        if (rows[0]) return rows[0];
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

    await db.query(
        `UPDATE "ReelProject" SET "mediaId" = $2, "savedToLibraryAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
        [project.id, media[0].id]
    );
    return media[0];
};

// ─── Biblioteca de Reels ───────────────────────────────────────────────────
//
// La fila de `Media` es el ARCHIVO: nombre, url, peso, bucket. Es lo que ya
// consumen el resto de los módulos y por eso no cambia de forma.
//
// La FICHA —motor, escenas, copies, locución, prompts, créditos— vive en
// `ReelProject` y sus tres tablas hijas, y es lo que lee esta vista. No se
// duplica en `Media`: duplicarla obligaría a mantener dos verdades y a tocar el
// modelo de Prisma, que es justo lo que la regla de base de datos evita.
// `mediaId` es el puente entre las dos.
export const listReelLibrary = async (req, res) => {
    try {
        await ensureReelSchema();
        const { search = '', status = '', format = '', limit = '60', offset = '0' } = req.query;

        // Sin filtro de archivo: el Reel entra en la Biblioteca desde que se
        // pide, no desde que termina (v4.670). Un render en curso es
        // exactamente lo que el usuario necesita poder ver al volver.
        const where = ['1 = 1'];
        const params = [];

        // Aislamiento por club con el MISMO helper que el resto del módulo.
        // Escribirlo otra vez acá era la forma de que un día divergiera.
        // `sql` viene vacío sólo para quien lo ve todo.
        const scope = scopeClause(req.user, 1);
        if (scope.sql) { where.push(scope.sql); params.push(...scope.params); }

        if (search) {
            params.push(`%${search}%`);
            where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
        }
        if (status) { params.push(status); where.push(`status = $${params.length}`); }
        if (format) { params.push(format); where.push(`format = $${params.length}`); }

        const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 60));
        const off = Math.max(0, parseInt(offset, 10) || 0);
        params.push(lim, off);

        const { rows } = await db.query(
            `SELECT * FROM "ReelProject"
              WHERE ${where.join(' AND ')}
              ORDER BY COALESCE("savedToLibraryAt", "createdAt") DESC
              LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const { rows: counted } = await db.query(
            `SELECT COUNT(*)::int AS total FROM "ReelProject" WHERE ${where.join(' AND ')}`,
            params.slice(0, -2)
        );

        // Una consulta por las escenas de TODOS los Reels de la página, no una
        // por Reel: con 60 tarjetas la diferencia son 60 viajes a la base.
        const ids = rows.map(r => r.id);
        const scenesByProject = new Map();
        const copiesByProject = new Map();
        if (ids.length) {
            const { rows: sceneRows } = await db.query(
                `SELECT * FROM "ReelScene" WHERE "projectId" = ANY($1) ORDER BY position ASC`, [ids]
            );
            for (const sc of sceneRows) {
                if (!scenesByProject.has(sc.projectId)) scenesByProject.set(sc.projectId, []);
                scenesByProject.get(sc.projectId).push(sc);
            }
            const { rows: copyRows } = await db.query(
                `SELECT * FROM "ReelCopy" WHERE "projectId" = ANY($1) AND "isCurrent"`, [ids]
            );
            for (const c of copyRows) {
                if (!copiesByProject.has(c.projectId)) copiesByProject.set(c.projectId, []);
                copiesByProject.get(c.projectId).push(c);
            }
        }

        res.json({
            total: counted[0]?.total || 0,
            limit: lim,
            offset: off,
            reels: rows.map(r => ({
                ...projectToDto(r, scenesByProject.get(r.id) || []),
                copies: (copiesByProject.get(r.id) || []).map(copyRowToDto)
            }))
        });
    } catch (e) {
        console.error('[REEL] biblioteca:', e);
        res.status(500).json({ error: e.message });
    }
};

// Editar la ficha: título, descripción y etiquetas. No toca el archivo ni
// ninguna decisión de generación — para eso están regenerar y duplicar.
export const updateReelInfo = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const { title, description, tags } = req.body || {};
        const sets = [];
        const params = [project.id];

        if (typeof title === 'string' && title.trim()) {
            params.push(title.trim().slice(0, 200));
            sets.push(`title = $${params.length}`);
        }
        if (typeof description === 'string') {
            params.push(description.trim().slice(0, 2000) || null);
            sets.push(`description = $${params.length}`);
        }
        if (Array.isArray(tags)) {
            params.push(JSON.stringify(
                tags.filter(t => typeof t === 'string' && t.trim())
                    .map(t => t.trim().slice(0, 40)).slice(0, 20)
            ));
            sets.push(`tags = $${params.length}::jsonb`);
        }
        if (!sets.length) return res.status(400).json({ error: 'No hay nada que cambiar.' });

        const { rows } = await db.query(
            `UPDATE "ReelProject" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            params
        );
        await respondProject(res, rows[0]);
    } catch (e) {
        console.error('[REEL] editar ficha:', e);
        res.status(500).json({ error: e.message });
    }
};

// Duplicar: copia la configuración y las fotos de origen a un Reel NUEVO, sin
// copiar los clips.
//
// No se clonan los archivos a propósito: un duplicado existe para volver a
// generar con otra música, otro estilo o otro motor. Copiar los clips daría un
// gemelo idéntico e inútil, y copiar la ficha sin regenerar daría dos entradas
// de Biblioteca apuntando al MISMO mp4 — que es peor, porque borrar una
// rompería la otra.
export const duplicateReel = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const images = project.config?.sourceImages || [];
        if (images.length !== SCENE_COUNT) {
            return res.status(400).json({
                error: `El Reel original no conserva sus ${SCENE_COUNT} fotos de origen, así que no se puede duplicar. Se puede crear uno nuevo eligiéndolas otra vez.`
            });
        }

        // Se responde con lo necesario para que la pantalla abra el creador ya
        // relleno. Duplicar NO gasta créditos por sí solo: los gasta el usuario
        // cuando confirma, que es donde puede cambiar de idea.
        res.json({
            prefill: {
                images,
                format: project.format,
                qualityTier: project.qualityTier,
                motionStyle: project.motionStyle,
                transition: project.transition,
                musicStyle: project.musicStyle,
                engine: project.engine,
                publicationType: project.publicationType,
                interestArea: project.interestArea,
                withMusic: Boolean(project.config?.withMusic),
                narration: project.config?.narration || null,
                title: `${project.title} (copia)`
            },
            from: { id: project.id, title: project.title }
        });
    } catch (e) {
        console.error('[REEL] duplicar:', e);
        res.status(500).json({ error: e.message });
    }
};

// Cancelar un Reel en curso.
//
// No se puede retirar un trabajo que ya está corriendo en KIE —su API no lo
// permite y sus créditos ya se consumieron—, así que lo que hace la
// cancelación es DEJAR DE AVANZAR la máquina de estados: no se descargan los
// clips que lleguen, no se lanza la música ni la locución que faltaran y el
// montaje no se pide. Decirlo así en la interfaz es lo honesto; prometer que
// se detiene el proveedor sería falso.
//
// Los clips que ya se hubieran ingerido se conservan, igual que las fotos y la
// configuración: cancelar no es borrar, y desde `cancelled` se puede reintentar.
export const cancelReel = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });
        if (REEL_STATUSES[project.status]?.terminal) {
            return res.status(400).json({ error: `El Reel ya está en estado «${REEL_STATUSES[project.status].label}»: no hay nada que cancelar.` });
        }

        const { rows } = await db.query(
            `UPDATE "ReelProject"
                SET status = 'cancelled', "statusDetail" = $2, "updatedAt" = NOW()
              WHERE id = $1 RETURNING *`,
            [project.id, `Cancelado por ${req.user?.email || 'el usuario'}.`]
        );
        // Las escenas que seguían en vuelo se marcan también: si llega su
        // webhook, `advanceScene` no tiene por qué descargar nada.
        await db.query(
            `UPDATE "ReelScene" SET status = 'error', "statusDetail" = 'Cancelado con el Reel', "updatedAt" = NOW()
              WHERE "projectId" = $1 AND status NOT IN ('ready', 'needs_review', 'error')`,
            [project.id]
        );
        await appendNote(project.id, 'El usuario canceló la generación. Los clips que ya estaban descargados se conservan.');
        console.log(`[REEL] ${project.id} cancelado por ${req.user?.email || 'usuario'}`);
        await respondProject(res, rows[0]);
    } catch (e) {
        console.error('[REEL] cancelar:', e);
        res.status(500).json({ error: e.message });
    }
};

// Reintentar un Reel que falló o se canceló.
//
// Conserva TODO lo que ya costó dinero o tiempo: las fotos, la configuración,
// los copies, la banda sonora y la locución. Sólo se relanzan las escenas que
// no llegaron a buen puerto. Repetir el proceso entero por un fallo de montaje
// sería gastar tres veces los créditos de video para nada.
export const retryReel = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });
        if (project.status !== 'error' && project.status !== 'cancelled') {
            return res.status(400).json({ error: 'Sólo se reintenta un Reel con error o cancelado.' });
        }

        const scenes = await fetchScenes(project.id);
        const broken = scenes.filter(sc => sc.status === 'error' || !sc.videoUrl);

        // Las escenas rotas vuelven a `pending` sin su tarea anterior; el
        // barrido las despachará. Las que ya tienen clip no se tocan.
        for (const sc of broken) {
            await db.query(
                `UPDATE "ReelScene"
                    SET status = 'pending', "kieJobId" = NULL, "statusDetail" = NULL, "updatedAt" = NOW()
                  WHERE id = $1`,
                [sc.id]
            );
        }

        // Sin escenas rotas el fallo estaba en el montaje: se limpia el trabajo
        // de render para que se vuelva a pedir con los clips que ya existen.
        const nextStatus = broken.length ? 'generating' : 'assembling';
        const { rows } = await db.query(
            `UPDATE "ReelProject"
                SET status = $2, "statusDetail" = NULL, "renderJobId" = NULL,
                    attempts = attempts + 1, "updatedAt" = NOW()
              WHERE id = $1 RETURNING *`,
            [project.id, nextStatus]
        );
        await appendNote(project.id, broken.length
            ? `Reintento: se relanzan ${broken.length} escena(s). Se conservan las que ya estaban listas, los textos, la música y la locución.`
            : 'Reintento: se vuelve a montar con los clips que ya existen. No se regenera ninguna escena.');

        // Se le da un empujón ya, sin esperar al barrido.
        const advanced = await advance(rows[0]).catch(e => {
            console.error(`[REEL] ${project.id} reintento:`, e.message);
            return rows[0];
        });
        console.log(`[REEL] ${project.id} reintentado — ${broken.length} escena(s) relanzadas`);
        await respondProject(res, advanced);
    } catch (e) {
        console.error('[REEL] reintentar:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * Barrido de los Reels en curso. Es el "worker" del módulo.
 *
 * En Vercel no hay proceso persistente: la función se congela al cerrar la
 * respuesta, así que no se puede dejar un trabajador corriendo. Lo que sí hay
 * —y el proyecto ya usa para publicaciones y correos— es Vercel Cron. Este
 * barrido corre cada minuto y hace avanzar la máquina de estados de todo Reel
 * que no haya terminado.
 *
 * Con esto la generación deja de depender de que alguien tenga la pantalla
 * abierta. Las otras dos vías siguen existiendo y son más rápidas cuando el
 * usuario está mirando: el webhook de KIE y el sondeo del navegador. Las tres
 * llaman al MISMO `advance`, y los UPDATE condicionales de dentro son los que
 * impiden que dos de ellas hagan el mismo trabajo a la vez.
 *
 * `timeBudgetMs` existe porque la función corta a los 120 s: se atienden los
 * Reels que quepan y el resto espera al minuto siguiente. Un Reel que no se
 * atiende no se pierde — sigue en la cola.
 */
export const sweepActiveReels = async ({ limit = 10, timeBudgetMs = 90000 } = {}) => {
    await ensureReelSchema();
    const startedAt = Date.now();
    const summary = { evaluated: 0, advanced: 0, failed: 0, skipped: 0 };

    const terminal = Object.entries(REEL_STATUSES).filter(([, st]) => st.terminal).map(([id]) => id);
    const { rows } = await db.query(
        `SELECT * FROM "ReelProject"
          WHERE status <> ALL($1)
            -- Un Reel sin tocar en 6 horas no es un render lento, es uno
            -- perdido: se deja de barrer para no gastar el presupuesto del
            -- barrido en él indefinidamente.
            AND "updatedAt" > NOW() - INTERVAL '6 hours'
          ORDER BY "updatedAt" ASC
          LIMIT $2`,
        [terminal, limit]
    );

    for (const project of rows) {
        if (Date.now() - startedAt > timeBudgetMs) { summary.skipped += 1; continue; }
        summary.evaluated += 1;
        try {
            const before = project.status;
            const after = await advance(project);
            if (after?.status !== before) summary.advanced += 1;
        } catch (e) {
            // Un Reel que falla no puede cortar el barrido de los demás.
            summary.failed += 1;
            console.error(`[REEL-SWEEP] ${project.id}:`, e.message);
        }
    }

    return { ...summary, elapsedMs: Date.now() - startedAt };
};

// Reels en curso del usuario. Lo consume el aviso de recuperación del creador:
// «Existe un Reel generándose».
export const getActiveReels = async (req, res) => {
    try {
        await ensureReelSchema();
        const terminal = Object.entries(REEL_STATUSES).filter(([, st]) => st.terminal).map(([id]) => id);
        const scope = scopeClause(req.user, 2);
        const where = ['status <> ALL($1)'];
        const params = [terminal];
        if (scope.sql) { where.push(scope.sql); params.push(...scope.params); }

        const { rows } = await db.query(
            `SELECT * FROM "ReelProject" WHERE ${where.join(' AND ')} ORDER BY "createdAt" DESC LIMIT 10`,
            params
        );
        const scenesByProject = new Map();
        if (rows.length) {
            const { rows: sceneRows } = await db.query(
                `SELECT * FROM "ReelScene" WHERE "projectId" = ANY($1) ORDER BY position ASC`,
                [rows.map(r => r.id)]
            );
            for (const sc of sceneRows) {
                if (!scenesByProject.has(sc.projectId)) scenesByProject.set(sc.projectId, []);
                scenesByProject.get(sc.projectId).push(sc);
            }
        }
        res.json({ reels: rows.map(r => projectToDto(r, scenesByProject.get(r.id) || [])) });
    } catch (e) {
        console.error('[REEL] activos:', e);
        res.status(500).json({ error: e.message });
    }
};

// Panel de auditoría: qué proveedor hizo qué, cuánto tardó y cuánto costó.
export const getReelUsage = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });

        const report = await usageReport(project.id);
        res.json({
            ...report,
            // El reparto declarado viaja con el informe para que el panel pueda
            // contrastar lo que DEBE hacer cada motor con lo que hizo, sin
            // tener esa tabla escrita a mano en el navegador.
            contract: Object.values(USAGE_PROVIDERS).map(p => ({
                id: p.id, label: p.label, role: p.role, note: p.note, allows: p.allows
            })),
            operations: Object.entries(USAGE_OPERATIONS).map(([id, o]) => ({
                id, label: o.label, provider: o.provider, scope: o.scope
            })),
            processingMs: project.processingMs || null,
            // Diagnóstico del montaje. Va acá porque toda esta pantalla es
            // administrativa; al usuario del Reel se le muestra el mensaje
            // llano y nada de esto.
            render: {
                environment: await checkFfmpegEnvironment(),
                provider: project.renderProvider || null,
                diagnostics: project.renderRaw?.diagnostics || []
            }
        });
    } catch (e) {
        console.error('[REEL] auditoría:', e);
        res.status(500).json({ error: e.message });
    }
};

export const saveReelToLibrary = async (req, res) => {
    try {
        await ensureReelSchema();
        const project = await fetchProject(req.params.id, req.user);
        if (!project) return res.status(404).json({ error: 'Reel no encontrado' });
        if (!project.videoUrl) return res.status(400).json({ error: 'El Reel todavía no tiene archivo montado.' });
        // Mismo criterio que el guardado automático (v4.669): entra lo que se
        // generó, y el estado viaja con la ficha. Tenerlos distintos hacía que
        // el botón rechazara un Reel que el sistema ya había guardado solo.
        if (project.status !== 'ready' && project.status !== 'needs_review' && !req.body?.force) {
            return res.status(400).json({
                error: 'El Reel todavía no terminó de generarse.',
                quality: project.quality
            });
        }

        const alreadySaved = Boolean(project.mediaId);
        const media = await createLibraryEntry(project);
        const { rows: updated } = await db.query('SELECT * FROM "ReelProject" WHERE id = $1', [project.id]);
        const scenes = await fetchScenes(project.id);
        res.status(alreadySaved ? 200 : 201).json({
            media,
            reel: projectToDto(updated[0], scenes),
            alreadySaved
        });
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
