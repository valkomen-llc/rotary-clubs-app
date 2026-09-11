// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel — la ORQUESTACIÓN — v4.1006 · asistente v4.1012
//
// Ejecuta las etapas, reclama la fila, y al final le pide el Reel al MOTOR DE
// SIEMPRE (`startReelProject`). No genera un solo fotograma por su cuenta.
//
// ─── QUÉ REUTILIZA, PIEZA POR PIEZA ────────────────────────────────────────
//
//   El material          `filesOf` + la carpeta de la Biblioteca que ya creó
//                        el artículo (v4.1004). NO se copia ni se sube nada.
//   El análisis de fotos `SubmissionArticleMedia`: nitidez, brillo, duplicados
//                        por dHash y la descripción del modelo de visión. Ya
//                        está pagado — volver a mirarlas serían N llamadas de
//                        visión para saber lo mismo.
//   El universo de datos `veracityContextFor`, el mismo del artículo.
//   El validador         `validateEmergencyCopy`, el mismo de la Campaña de
//                        Emergencia y del Generador de Publicaciones.
//   El Reel              `startReelProject`, con el preset `solicitud`.
//   La voz               `reelNarration.js` y su Narrative Timing Engine.
//   La música            `reelMusic.js`, con su cadena por licencia.
//   El copy              `reelCopy.js`, con sus cuatro plataformas.
//   El montaje           `reelFfmpeg.js` / `reelRenderProviders.js`.
//
// Lo ÚNICO propio de este módulo es: qué fotos, en qué orden, qué cuenta cada
// una y con qué hechos. El resto ya existía.
//
// NUNCA LANZA hacia afuera: corre dentro de un cron y dentro del sondeo de una
// pantalla, igual que el motor del artículo.
// ════════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import db from './db.js';
import { ensureSubmissionReelSchema } from './ensureSubmissionReelSchema.js';
import { ensureContentSubmissionSchema } from './ensureContentSubmissionSchema.js';
import { ensureSubmissionArticleSchema } from './ensureSubmissionArticleSchema.js';
import { filesOf, clubsOf, logEvent } from './contentSubmissionStore.js';
import { articleOf, mediaOf, postOf } from './submissionArticleEngine.js';
import { veracityContextFor } from './submissionArticleSpec.js';
import { activityDateLabel } from './contentSubmissionSpec.js';
import { generateCopy } from '../services/copywritingService.js';
import { startReelProject, resumeReelProject, fallbackReelScene, regenerateReelScene } from '../controllers/reelController.js';
import { targetTotalSecFor, MIN_SCENE_COUNT, resolvePreset } from './reelPresets.js';
import { resolveEngine, DEFAULT_FORMAT } from './reelSpec.js';
import {
    REEL_STAGES, REEL_STAGE_MAX_TRIES, REEL_CLAIM_WINDOW_MIN,
    deriveReelWorkflowStatus, reelStageToRetry, isReelWorking, reelStateLabel,
    classifyAssets, checkReelReady, selectStoryImages, applyManualSelection,
    buildStoryboardBrief, STORYBOARD_SYSTEM, parseStoryboard, checkStoryboardFacts,
    reelFactGuard, estimateReelCredits, nextVersionNumber,
    MAX_REEL_IMAGES, CONTENT_MODES,
    normalizeReelPlan, planIsConfirmed, validateReelPlan,
    summarizeReelPlan, resolveReelTiming, durationOptionsFor, defaultDurationFor,
    orderSelectionNarrative, applySelectionOrder, reslotSelection,
    MUSIC_NONE, NARRATION_MODES,
} from './submissionReelSpec.js';

const now = () => new Date().toISOString();
const nuevoId = () => randomUUID();
const str = (v, max = 600) => String(v ?? '').trim().slice(0, max);
const WORKING = ['recibida', 'analizando', 'preparando', 'generando', 'componiendo'];

/** El interruptor de entorno. Apagado, nada se genera solo; el botón sigue. */
export const autoReelsEnabled = () => String(process.env.SUBMISSION_REELS || 'on').toLowerCase() !== 'off';

let _schemas = false;
const ensureAll = async () => {
    if (_schemas) return;
    await ensureContentSubmissionSchema();
    await ensureSubmissionArticleSchema();
    await ensureSubmissionReelSchema();
    _schemas = true;
};

// ─── Lecturas ──────────────────────────────────────────────────────────────

/** La versión VIGENTE del Reel de una solicitud. */
export async function reelOf(submissionId) {
    await ensureAll();
    const { rows } = await db.query(
        `SELECT * FROM "SubmissionReel" WHERE "submissionId" = $1 AND "isCurrent" ORDER BY "versionNumber" DESC LIMIT 1`,
        [submissionId]
    );
    return rows[0] || null;
}

export async function reelById(id) {
    await ensureAll();
    const { rows } = await db.query(`SELECT * FROM "SubmissionReel" WHERE id = $1`, [id]);
    return rows[0] || null;
}

/** Todas las versiones, la más nueva primero. */
export async function reelVersionsOf(submissionId) {
    await ensureAll();
    const { rows } = await db.query(
        `SELECT id, "versionNumber", "isCurrent", status, "reelProjectId", "creditsEstimated", "createdAt", "generatedAt"
           FROM "SubmissionReel" WHERE "submissionId" = $1 ORDER BY "versionNumber" DESC`,
        [submissionId]
    );
    return rows;
}

/** Los Reels de varias solicitudes, para pintar la bandeja sin N consultas. */
export async function reelsFor(submissionIds = []) {
    const ids = (Array.isArray(submissionIds) ? submissionIds : []).filter(Boolean);
    if (!ids.length) return {};
    try {
        await ensureAll();
        const { rows } = await db.query(
            `SELECT "submissionId", id, status, "reelProjectId", "versionNumber"
               FROM "SubmissionReel" WHERE "submissionId" = ANY($1) AND "isCurrent"`,
            [ids]
        );
        return Object.fromEntries(rows.map(r => [r.submissionId, r]));
    } catch (e) {
        console.warn('[reels-solicitud] listado degradado:', e.message);
        return {};
    }
}

/**
 * De qué solicitud salió un ReelProject. Lo consume la Biblioteca de Reels
 * para pintar la insignia «Generado desde Solicitud». DEGRADA a {}: la
 * Biblioteca no puede caerse porque falte una tabla de otro módulo.
 */
export async function originsForReels(projectIds = []) {
    const ids = (Array.isArray(projectIds) ? projectIds : []).filter(Boolean);
    if (!ids.length) return {};
    try {
        await ensureAll();
        const { rows } = await db.query(
            `SELECT r."reelProjectId", r.id, r.status, r."submissionId", r."campaignId", r."versionNumber",
                    s.club, s."senderName", s.title AS "submissionTitle", c.name AS "campaignName",
                    a."postId", a.generated->>'title' AS "articleTitle"
               FROM "SubmissionReel" r
               LEFT JOIN "ContributionSubmission" s ON s.id = r."submissionId"
               LEFT JOIN "ContributionCampaign" c ON c.id = r."campaignId"
               LEFT JOIN "SubmissionArticle" a ON a."submissionId" = r."submissionId"
              WHERE r."reelProjectId" = ANY($1)`,
            [ids]
        );
        return Object.fromEntries(rows.map(r => [r.reelProjectId, {
            reelId: r.id, status: r.status, submissionId: r.submissionId, campaignId: r.campaignId,
            versionNumber: Number(r.versionNumber) || 1,
            club: r.club, senderName: r.senderName, submissionTitle: r.submissionTitle,
            campaignName: r.campaignName, postId: r.postId || null, articleTitle: r.articleTitle || null,
        }]));
    } catch (e) {
        console.warn('[reels-solicitud] origen degradado:', e.message);
        return {};
    }
}

/** Los borradores listos que alcanza una sesión. Se OBSERVA del estado. */
export async function pendingReelDrafts(campaignIds, { limit = 20 } = {}) {
    try {
        await ensureAll();
        const params = [];
        let where = `r.status = 'borrador_listo' AND r."isCurrent"`;
        if (campaignIds !== null) {
            if (!Array.isArray(campaignIds) || !campaignIds.length) return { count: 0, items: [] };
            params.push(campaignIds.map(String));
            where += ` AND r."campaignId" = ANY($1::text[])`;
        }
        params.push(Math.min(Number(limit) || 20, 50));
        const { rows } = await db.query(
            `SELECT r.id, r."submissionId", r."campaignId", r."reelProjectId", r."generatedAt",
                    s.club, s."senderName", s.title, c.name AS "campaignName", COUNT(*) OVER() AS total
               FROM "SubmissionReel" r
               LEFT JOIN "ContributionSubmission" s ON s.id = r."submissionId"
               LEFT JOIN "ContributionCampaign" c ON c.id = r."campaignId"
              WHERE ${where}
              ORDER BY r."generatedAt" DESC NULLS LAST
              LIMIT $${params.length}`,
            params
        );
        return { count: Number(rows[0]?.total) || 0, items: rows.map(r => ({ ...r, total: undefined })) };
    } catch (e) {
        console.warn('[reels-solicitud] pendientes degradados:', e.message);
        return { count: 0, items: [] };
    }
}

// ─── Encolar ───────────────────────────────────────────────────────────────

/**
 * Crea la fila del workflow.
 *
 * ⚠️ LA IDEMPOTENCIA ES EL ÍNDICE ÚNICO, no una lectura previa: entre un SELECT
 * y un INSERT caben dos vueltas del cron, el sondeo del navegador y el botón, y
 * el precio de equivocarse acá es un Reel de más — o sea, créditos de video
 * pagados dos veces. Es la lección de `Payment_provider_providerRef_key`.
 *
 * Encolar diez veces la versión 1 de una solicitud crea UN Reel; devuelve el
 * que ya estaba y `created:false` para que quien llama sepa cuál de los dos es.
 */
export async function enqueueReel({ submissionId, campaignId, clubId = null, articleId = null, versionNumber = 1, generatedBy = 'ai_workflow' }) {
    await ensureAll();
    const { rows } = await db.query(
        `INSERT INTO "SubmissionReel" (id, "submissionId", "campaignId", "clubId", "articleId", "versionNumber", "isCurrent", status, "generatedBy")
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'recibida', $7)
         ON CONFLICT ("submissionId", "versionNumber") DO NOTHING
         RETURNING *`,
        [nuevoId(), submissionId, campaignId, clubId, articleId, versionNumber, generatedBy]
    );
    if (rows[0]) {
        await logEvent({ submissionId, campaignId, type: 'reel', detail: `Reel en cola (v${versionNumber}): se prepara solo.` }).catch(() => {});
        return { created: true, reel: rows[0] };
    }
    const { rows: existente } = await db.query(
        `SELECT * FROM "SubmissionReel" WHERE "submissionId" = $1 AND "versionNumber" = $2`,
        [submissionId, versionNumber]
    );
    return { created: false, reel: existente[0] || await reelOf(submissionId) };
}

/**
 * Una versión NUEVA. Es la salida explícita del punto 22: una solicitud no
 * genera varios Reels por accidente, pero SÍ a propósito.
 *
 * ⚠️ LA VIGENTE SE MARCA EN DOS PASOS Y NUNCA CON UN UPSERT: su índice único es
 * PARCIAL (`WHERE "isCurrent"`), así que un `ON CONFLICT` contra él tendría que
 * repetir el predicado o la sentencia falla entera (la trampa de v4.648).
 *
 * Los assets NO se duplican: la selección de la versión nueva apunta a los
 * mismos `fileId` de la solicitud.
 */
export async function newReelVersion({ submissionId, campaignId, clubId = null, articleId = null, generatedBy = 'human' }) {
    await ensureAll();
    const versiones = await reelVersionsOf(submissionId);
    const siguiente = nextVersionNumber(versiones);
    await db.query(`UPDATE "SubmissionReel" SET "isCurrent" = FALSE, "updatedAt" = NOW() WHERE "submissionId" = $1 AND "isCurrent"`, [submissionId]);
    const { rows } = await db.query(
        `INSERT INTO "SubmissionReel" (id, "submissionId", "campaignId", "clubId", "articleId", "versionNumber", "isCurrent", status, "generatedBy")
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'recibida', $7)
         ON CONFLICT ("submissionId", "versionNumber") DO NOTHING
         RETURNING *`,
        [nuevoId(), submissionId, campaignId, clubId, articleId, siguiente, generatedBy]
    );
    if (!rows[0]) return { created: false, reel: await reelOf(submissionId) };
    await logEvent({ submissionId, campaignId, type: 'reel', detail: `Nueva versión del Reel (v${siguiente}).` }).catch(() => {});
    return { created: true, reel: rows[0] };
}

// ─── El reclamo ────────────────────────────────────────────────────────────
//
// Sobre `attempts`, que es un entero EXACTO. Sobre `updatedAt` no funcionaría:
// el driver de pg trunca los microsegundos y la igualdad no casaría nunca
// (v4.800). Acá el precio de repetir ese error es pagar dos veces las mismas
// escenas de video.

const claim = async (row) => {
    const { rows } = await db.query(
        `UPDATE "SubmissionReel"
            SET attempts = attempts + 1, "claimedAt" = NOW(), "updatedAt" = NOW()
          WHERE id = $1 AND attempts = $2 AND status = ANY($3)
            AND ("claimedAt" IS NULL OR "claimedAt" < NOW() - ($4 || ' minutes')::interval)
          RETURNING *`,
        [row.id, row.attempts, WORKING, String(REEL_CLAIM_WINDOW_MIN)]
    );
    return rows[0] || null;
};

const JSONB_FIELDS = ['stages', 'classification', 'selection', 'storyboard', 'facts', 'plan'];

const release = async (id, patch = {}) => {
    const sets = ['"claimedAt" = NULL', '"updatedAt" = NOW()'];
    const params = [id];
    for (const [k, v] of Object.entries(patch)) {
        params.push(JSONB_FIELDS.includes(k) ? JSON.stringify(v) : v);
        sets.push(`"${k}" = $${params.length}${JSONB_FIELDS.includes(k) ? '::jsonb' : ''}`);
    }
    const { rows } = await db.query(`UPDATE "SubmissionReel" SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
    return rows[0];
};

// ─── Contexto compartido por las etapas ────────────────────────────────────

const loadContext = async (row) => {
    const { rows: sub } = await db.query(`SELECT * FROM "ContributionSubmission" WHERE id = $1`, [row.submissionId]);
    const submission = sub[0];
    if (!submission) throw new Error('La solicitud ya no existe.');
    submission.clubs = await clubsOf(submission.id).catch(() => []);
    submission.activityDateLabel = activityDateLabel(submission.activityDate);

    const { rows: camp } = await db.query(
        `SELECT id, name, slug, content, "ownerClubId", "recipientClubId" FROM "ContributionCampaign" WHERE id = $1`,
        [row.campaignId]
    );
    const campaign = camp[0] || null;

    const clubId = row.clubId || submission.originClubId || campaign?.ownerClubId || campaign?.recipientClubId || null;
    let site = null;
    if (clubId) {
        const { rows: c } = await db.query(`SELECT id, name, domain, subdomain, type, "districtId", district FROM "Club" WHERE id = $1`, [clubId]);
        site = c[0] || null;
    }

    const files = await filesOf(submission.id);

    // ⚠️ EL ANÁLISIS DE LAS FOTOS SALE DEL ARTÍCULO, y por eso este módulo no
    // gasta una llamada de visión. `SubmissionArticleMedia` ya trae el puntaje,
    // la nitidez, el brillo, los duplicados por dHash y lo que el modelo vio en
    // cada fotografía. Sin artículo generado todavía, se degrada: la selección
    // cae al orden que mandó el club y se DICE.
    const article = await articleOf(submission.id).catch(() => null);
    const analysis = article ? await mediaOf(article.id).catch(() => []) : [];
    const post = article?.postId ? await postOf(article.postId).catch(() => null) : null;

    return { submission, campaign, clubId, site, files, article, analysis, post };
};

/**
 * El material que se puede animar, con su análisis pegado.
 *
 * ⚠️ SÓLO LO QUE YA ESTÁ EN LA BIBLIOTECA. Un archivo de una solicitud vive en
 * el prefijo PRIVADO hasta que alguien aprueba el material (v4.968): su URL no
 * es alcanzable desde fuera, y el motor de video la necesita pública para poder
 * descargarla. Eso es estructural y NO se afloja — lo que se hace es exigir la
 * promoción antes y decirlo, que es lo que ya hace el workflow del artículo
 * desde v4.1002.
 */
const animatableMedia = (ctx) => {
    const porId = new Map((ctx.analysis || []).map(m => [m.fileId, m]));
    return (ctx.files || []).map(f => {
        const a = porId.get(f.id) || {};
        return {
            fileId: f.id,
            kind: f.kind,
            filename: f.filename,
            mediaId: f.mediaId || null,
            url: f.mediaUrl || null,
            inLibrary: Boolean(f.mediaId && f.mediaUrl),
            sortOrder: f.sortOrder ?? 0,
            score: Number.isFinite(Number(a.score)) ? Number(a.score) : 50,
            role: a.role || null,
            alt: a.alt || null,
            excluded: Boolean(a.excluded),
            excludedReason: a.excludedReason || null,
            // ⚠️ Desde v4.1009 `excluded` significa SÓLO «lo dejó fuera una
            // persona»; los motivos automáticos —captura, documento,
            // desenfocada, oscura— viven en `coverNote`. Viaja porque la
            // selección de escenas distingue entre los dos (ver
            // `selectStoryImages`); una fila anterior lo trae en null.
            coverNote: a.coverNote || null,
            analysis: a.analysis || {},
            analyzed: porId.has(f.id),
        };
    });
};

// ─── El contexto del plan ──────────────────────────────────────────────────
//
// ⚠️ EL MOTOR Y LA TRANSICIÓN NO SE ESCRIBEN A MANO ACÁ. Salen del preset y del
// resolutor de siempre, porque de ellos depende el TECHO por escena: con Kling
// (clips de 5 o 10 s) el techo real son 5 s, así que cinco fotografías dan como
// mucho 23 s. Escribir esos números en el asistente daría una duración que la
// pantalla promete y el motor no puede dar — y el usuario lo descubriría con el
// Reel ya pagado.
//
// DEGRADA: si el motor no se puede resolver —sin credencial, un id retirado— se
// devuelve sin duraciones y el reparto cae al rango del módulo. Un asistente
// que no abre porque no se pudo consultar un catálogo es peor que uno que
// estima el techo con el rango por defecto.
export const planContextFor = () => {
    const preset = resolvePreset('solicitud');
    let engine = null;
    try {
        engine = resolveEngine({ engine: null, format: DEFAULT_FORMAT });
    } catch (e) {
        console.warn('[reels-solicitud] motor sin resolver, se estima con el rango por defecto:', e.message);
    }
    return {
        preset,
        format: DEFAULT_FORMAT,
        transition: preset.transition || 'fade',
        engineDurations: engine?.durations || null,
        engineLabel: engine?.engine?.label || null,
        creditsPerScene: engine?.creditEstimatePerScene ?? 20,
    };
};

// ─── Las etapas ────────────────────────────────────────────────────────────

const stageMaterial = async (row, ctx) => {
    const media = animatableMedia(ctx);
    const clasificacion = classifyAssets(media);

    // Las fotos tienen que estar en la Biblioteca para poder animarse.
    const enBiblioteca = media.filter(m => m.kind === 'image' && m.inLibrary && !m.excluded);
    const privadas = media.filter(m => m.kind === 'image' && !m.inLibrary).length;

    const juicio = checkReelReady({ ...clasificacion, images: enBiblioteca.length });
    if (!juicio.ok) {
        // El motivo se dice ENTERO, con su salida. Un «no se puede» a secas
        // obliga a diagnosticar a ciegas.
        const extra = privadas > 0
            ? ` ${privadas} fotografía(s) siguen en el prefijo privado de la solicitud: hay que enviar el material a la Biblioteca antes (se hace desde «Artículo de noticia» o aprobando la solicitud).`
            : '';
        throw new Error(juicio.errors.join(' ') + extra);
    }

    return {
        note: [
            `${clasificacion.images} fotografía(s), ${clasificacion.videos} video(s).`,
            ...juicio.warnings,
        ].filter(Boolean).join(' ') || null,
        patch: { contentMode: clasificacion.contentMode },
        classification: {
            ...clasificacion,
            inLibrary: enBiblioteca.length,
            privateFiles: privadas,
            analyzed: media.filter(m => m.analyzed).length,
        },
    };
};

const stageSeleccion = async (row, ctx) => {
    const media = animatableMedia(ctx).filter(m => m.kind === 'image' && m.inLibrary);

    // ⚠️ UNA SELECCIÓN MANUAL NO SE PISA. Si alguien ya eligió las fotos a mano,
    // esta etapa la respeta: reemplazarla por la automática desharía en silencio
    // una decisión humana. Es la regla de `putAuto` con las traducciones.
    if (row.selection?.source === 'manual' && Array.isArray(row.selection?.items) && row.selection.items.length) {
        const manual = applyManualSelection(media, row.selection.items.map(i => i.fileId));
        if (manual.ok) {
            return {
                note: 'Se conservó la selección hecha a mano.',
                selection: { ...row.selection, items: manual.selection },
                plan: seedPlanDuration(row.plan, manual.selection.length),
            };
        }
    }

    const sinAnalisis = media.every(m => !m.analyzed);
    const elegidas = selectStoryImages(media, { max: MAX_REEL_IMAGES });
    if (!elegidas.enough) {
        throw new Error(
            `Sólo hay ${elegidas.usable} fotografía(s) utilizable(s) y el Reel necesita al menos ${MIN_SCENE_COUNT}. ` +
            (elegidas.discarded.length ? `Quedaron fuera: ${elegidas.discarded.slice(0, 3).map(d => d.reason).join('; ')}.` : '')
        );
    }

    const nota = sinAnalisis
        ? 'Las fotografías se eligieron por el orden en que las mandó el club: todavía no hay análisis del artículo, así que no se pudo comparar nitidez ni descartar repetidas.'
        : `Se eligieron ${elegidas.selection.length} de ${elegidas.usable} fotografías.`;

    return {
        note: nota,
        selection: {
            source: 'auto',
            at: now(),
            items: elegidas.selection,
            discarded: elegidas.discarded,
            usable: elegidas.usable,
            degraded: sinAnalisis,
        },
        // ⚠️ EL ASISTENTE ABRE EN UNA DURACIÓN QUE ESTE MATERIAL PUEDE DAR. Con
        // tres fotografías los 20 s recomendados son inalcanzables —el techo son
        // 14—, y abrir en un valor imposible obliga a descubrir el límite
        // probando. `defaultDurationFor` elige la recomendada si se puede y la
        // alcanzable más cercana si no. Sólo siembra: una duración que una
        // persona ya eligió NO se pisa (la regla de `putAuto`).
        plan: seedPlanDuration(row.plan, elegidas.selection.length),
    };
};

/** Rellena lo que nadie eligió; nunca pisa lo elegido. */
const seedPlanDuration = (plan, sceneCount) => {
    const base = normalizeReelPlan({}, plan || {});
    if (plan?.durationSec) return base;
    const ctx = planContextFor();
    return { ...base, durationSec: defaultDurationFor({ sceneCount, engineDurations: ctx.engineDurations, transition: ctx.transition }) };
};

const stageStoryboard = async (row, ctx) => {
    const items = Array.isArray(row.selection?.items) ? row.selection.items : [];
    if (!items.length) throw new Error('No hay fotografías elegidas para armar el storyboard.');

    const media = animatableMedia(ctx);
    const porId = new Map(media.map(m => [m.fileId, m]));
    // ⚠️ LA DURACIÓN QUE LEE EL STORYBOARD ES LA DEL PLAN, no la de la tabla del
    // preset: es la que decide cuánto texto cabe por escena, y escribir un
    // guion para 25 s que después se monta en 18 deja la voz colgando. Sin plan
    // todavía —un Reel de antes de v4.1012— se cae a la tabla de siempre.
    const ctxPlan = planContextFor();
    const duracion = row.plan?.durationSec
        ? resolveReelTiming({
            targetSec: row.plan.durationSec, sceneCount: items.length,
            engineDurations: ctxPlan.engineDurations, transition: ctxPlan.transition,
            perScene: row.plan.perScene,
        }).finalSec
        : targetTotalSecFor('solicitud', items.length);

    // El universo de lo suministrado, con el MISMO criterio del artículo.
    const universe = veracityContextFor(ctx.submission, ctx.campaign);

    const brief = buildStoryboardBrief({
        submission: ctx.submission,
        campaign: ctx.campaign,
        article: ctx.post ? { title: ctx.post.title, excerpt: ctx.post.excerpt || ctx.article?.generated?.excerpt } : (ctx.article?.generated || null),
        siteName: ctx.site?.name || '',
        selection: items,
        mediaById: porId,
        durationSec: duracion,
    });

    const pedir = async (instruccion = null) => {
        const r = await generateCopy({
            system: STORYBOARD_SYSTEM,
            userText: [
                brief,
                '',
                `Escribí el storyboard: UNA línea por cada una de las ${items.length} escenas, en ese orden.`,
                'Cada línea es lo que se cuenta mientras se ve esa fotografía: una frase corta, en español, en presente o pasado según corresponda.',
                instruccion ? `\n${instruccion}` : '',
                '',
                'Devolvé este JSON exacto, sin texto alrededor y sin bloques de código:',
                '{',
                '  "hook": "la primera frase, la que engancha en dos segundos",',
                `  "scenes": [${items.map((_, i) => `{ "beat": "…", "line": "la línea de la escena ${i + 1}", "motion": "qué se mueve en esa foto" }`).join(', ')}],`,
                '  "closing": "el cierre",',
                '  "cta": "el llamado a la acción, corto",',
                '  "summary": "una frase que resuma la pieza"',
                '}',
            ].filter(l => l !== '').join('\n'),
            jsonMode: true, maxTokens: 1400, temperature: 0.6,
        });
        return parseStoryboard(r?.content ?? r?.text ?? r, items.length);
    };

    // ── El modelo escribe, el CÓDIGO decide ──
    //
    // Dos intentos y el reintento nombra LA REGLA CONCRETA que rompió: pedirle
    // «revisá el formato» no corrige nada. Agotados, el trabajo NO se tira —se
    // entrega con sus avisos, porque es editable— pero un storyboard con datos
    // inventados no llega al video: ahí sí se corta, porque lo que afirma se
    // hornea en la voz y en el copy.
    let sb = await pedir();
    if (!sb.ok) sb = await pedir(`El intento anterior falló: ${sb.error}`);
    if (!sb.ok) throw new Error(sb.error || 'El storyboard no llegó en una forma utilizable.');

    let veracidad = checkStoryboardFacts(sb, universe);
    if (!veracidad.ok) {
        const reintento = await pedir(
            `El texto anterior rompió estas reglas y hay que corregirlas exactamente:\n· ${veracidad.issues.join('\n· ')}`
        );
        if (reintento.ok) {
            const segunda = checkStoryboardFacts(reintento, universe);
            if (segunda.ok) { sb = reintento; veracidad = segunda; }
            else { sb = reintento; veracidad = segunda; }
        }
    }

    return {
        note: veracidad.ok
            ? null
            : `El storyboard tiene ${veracidad.issues.length} aviso(s) de datos: ${veracidad.issues[0]}`,
        storyboard: {
            ...sb,
            durationSec: duracion,
            factIssues: veracidad.issues,
            at: now(),
        },
        facts: reelFactGuard({ universe, brief }),
    };
};

/**
 * La etapa que CUESTA DINERO. Le pide el Reel al motor de siempre.
 *
 * ⚠️ ES LA ÚNICA QUE CREA UN `ReelProject`, y sólo si no hay uno ya: el
 * reclamo de la fila protege contra dos vueltas simultáneas, y esta guardia
 * contra un reintento que llegue después de que el proyecto ya nació.
 */
const stageProyecto = async (row, ctx) => {
    if (row.reelProjectId) return { note: 'El proyecto de Reel ya existe: no se vuelve a crear.' };

    // ⚠️ LA SEGUNDA PUERTA, Y NO SOBRA. `advanceReel` ya se detiene en
    // «configurando», pero esta etapa es lo ÚNICO del módulo que llama a un
    // proveedor de video: un reintento manual, un camino nuevo o un barrido que
    // llegue por otra vía tienen que encontrarse la puerta acá también. Con una
    // sola comprobación, el día que aparezca una segunda vía el gasto se
    // dispararía sin autorización y el fallo sería mudo — el Reel saldría bien.
    if (!planIsConfirmed(row.plan)) {
        throw new Error('El plan del Reel todavía no está confirmado: las escenas no se generan hasta que alguien confirme en «Preparar Reel».');
    }

    const items = Array.isArray(row.selection?.items) ? row.selection.items : [];
    const media = new Map(animatableMedia(ctx).map(m => [m.fileId, m]));
    const images = items.map(i => {
        const m = media.get(i.fileId);
        return m?.url ? { id: m.mediaId || null, url: m.url } : null;
    }).filter(Boolean);

    if (images.length !== items.length) {
        throw new Error('Alguna de las fotografías elegidas ya no está disponible en la Biblioteca. Volvé a elegir el material.');
    }

    const sb = row.storyboard || {};
    const titulo = str(ctx.submission.title, 120) || `Reel — ${str(ctx.submission.club, 80) || 'solicitud de contenido'}`;

    // El plan que una persona confirmó. Cada campo viaja al motor de siempre:
    // no hay un segundo camino, hay más parámetros en el mismo.
    const plan = normalizeReelPlan({}, row.plan || {});
    const pc = planContextFor();
    const timing = resolveReelTiming({
        targetSec: plan.durationSec, sceneCount: images.length,
        engineDurations: pc.engineDurations, transition: pc.transition, perScene: plan.perScene,
    });
    const conMusica = plan.music !== MUSIC_NONE;

    const r = await startReelProject({
        images,
        preset: 'solicitud',
        title: titulo,
        organizationName: ctx.site?.name || ctx.submission.club || null,
        withMusic: conMusica,
        // Un estilo pedido a mano manda sobre el del preset (es la regla de
        // `applyPresetDefaults`); sin música no se manda estilo alguno.
        ...(conMusica ? { musicStyle: plan.music } : {}),
        targetTotalSec: timing.targetSec,
        sceneDurations: timing.perScene,
        // El orden lo decide ESTE módulo con la estructura narrativa, no el
        // director mirando las fotos: la historia ya está escrita.
        autoOrder: false,
        narration: {
            enabled: plan.narrationMode !== 'none',
            style: 'institucional',
            // El guion aprobado a mano. `produceNarration` lo usa como
            // `scriptOverride`, así que el Narrative Timing Engine no lo
            // reescribe: lo mide y, si sobra, lo acelera hasta un 4 % —nunca
            // corta una palabra— y el resto lo resuelve con silencio.
            script: plan.narrationMode === 'manual' ? (plan.narrationScript || null) : null,
        },
        // La guardia de datos viaja al guion y al copy (v4.1006, `reelFacts.js`).
        facts: row.facts && row.facts.universe ? row.facts : null,
    }, {
        clubId: ctx.clubId,
        id: null,
        email: 'ai_workflow',
    });

    if (!r.ok && !r.project) throw new Error(r.error || 'El motor de Reels no pudo crear el proyecto.');

    const proyecto = r.project;
    const creditos = estimateReelCredits({ sceneCount: images.length, creditsPerScene: pc.creditsPerScene });

    // El arco escrito viaja a las notas del proyecto: quien abra el Reel dentro
    // de un mes tiene que poder ver de qué solicitud salió y qué se propuso
    // contar, sin volver a la bandeja.
    if (proyecto?.id) {
        await db.query(
            `UPDATE "ReelProject"
                SET config = config || $2::jsonb, "updatedAt" = NOW()
              WHERE id = $1`,
            [proyecto.id, JSON.stringify({
                origin: {
                    kind: 'submission',
                    submissionId: row.submissionId,
                    campaignId: row.campaignId,
                    reelId: row.id,
                    articleId: row.articleId || null,
                    versionNumber: row.versionNumber,
                },
                storyboard: sb,
                // El plan tal como se confirmó, con quién y cuándo. Quien abra
                // el Reel dentro de un mes tiene que poder contestar «¿por qué
                // esta pieza dura 20 s y lleva esta música?» sin volver a la
                // bandeja — y «¿quién autorizó el gasto?».
                submissionPlan: plan,
            })]
        ).catch(e => console.warn('[reels-solicitud] no se pudo anotar el origen:', e.message));
    }

    if (!r.ok) {
        // El proyecto nació con error: se conserva el vínculo para poder
        // reintentar sobre él en vez de crear otro y pagar dos veces.
        return {
            error: proyecto?.statusDetail || r.error || 'El proyecto de Reel nació con error.',
            patch: { reelProjectId: proyecto?.id || null, creditsEstimated: creditos.total },
        };
    }

    return {
        note: `Proyecto de Reel creado con ${images.length} escenas.`,
        patch: {
            reelProjectId: proyecto.id,
            creditsEstimated: creditos.total,
            generatedAt: new Date(),
        },
    };
};

const RUNNERS = {
    material: stageMaterial,
    seleccion: stageSeleccion,
    storyboard: stageStoryboard,
    proyecto: stageProyecto,
};

// ─── Avanzar ───────────────────────────────────────────────────────────────

/**
 * Ejecuta UNA etapa y suelta el reclamo. Nunca lanza.
 *
 * Con las etapas terminadas, quien manda es la máquina de estados del
 * `ReelProject`: este workflow SIGUE su estado en vez de duplicarlo — un
 * segundo estado sobre el mismo render daría dos verdades sobre lo mismo.
 */
export async function advanceReel(input) {
    let row = typeof input === 'string' ? await reelById(input) : input;
    if (!row) return { ok: false, reason: 'sin_fila' };

    // ⚠️ «TERMINADO» Y «ESPERANDO CONFIRMACIÓN» NO SON LO MISMO, y quien llama
    // tiene que poder distinguirlos: un Reel en «configurando» está detenido a
    // propósito, con todo listo y sin gastar nada, y presentarlo como terminado
    // haría que la pantalla dejara de ofrecer el botón que lo desbloquea.
    if (!isReelWorking(row.status)) {
        return { ok: true, done: true, reel: row, awaitingConfirmation: row.status === 'configurando' };
    }

    // ⚠️ LA PUERTA DEL GASTO. Con el plan sin confirmar, el derivado se queda en
    // «configurando» —que no es un estado de trabajo— y esta función sale sin
    // llamar a nadie. No hay una comprobación aparte que alguien pueda olvidar:
    // las TRES vías (cron, sondeo y botón) pasan por acá.
    const confirmado = planIsConfirmed(row.plan);
    const derivado = deriveReelWorkflowStatus(row.stages || {}, { confirmed: confirmado });
    if (derivado.awaitingConfirmation) {
        const parado = row.status === 'configurando' ? row : await release(row.id, {
            status: 'configurando',
            statusDetail: 'Preparado. Falta confirmar para generar las escenas.',
            lastError: null,
        });
        return { ok: true, done: true, awaitingConfirmation: true, reel: parado };
    }

    // Todas las etapas hechas: lo que queda es MIRAR el proyecto.
    if (derivado.status === 'seguimiento') {
        const seguido = await followReelProject(row);
        return { ok: true, reel: seguido, done: !isReelWorking(seguido.status) };
    }

    const etapa = derivado.nextStage ? REEL_STAGES.find(s => s.id === derivado.nextStage) : null;
    if (!etapa) {
        const final = await release(row.id, { status: derivado.status, lastError: derivado.error || null });
        return { ok: true, done: true, reel: final };
    }

    const reclamada = await claim(row);
    if (!reclamada) return { ok: true, busy: true, reel: row };
    row = reclamada;

    const stages = { ...(row.stages || {}) };
    const previo = stages[etapa.id] || {};
    const tries = Number(previo.tries || 0) + 1;

    try {
        const ctx = await loadContext(row);
        const r = await RUNNERS[etapa.id](row, ctx) || {};
        stages[etapa.id] = { status: r.error ? 'error' : 'ok', tries, at: now(), note: r.note || null, error: r.error || null };
        const nuevo = deriveReelWorkflowStatus(stages, { confirmed: confirmado });
        const patch = { stages, lastError: null, ...(r.patch || {}) };
        for (const k of ['classification', 'selection', 'storyboard', 'facts', 'plan']) if (r[k]) patch[k] = r[k];
        patch.status = nuevo.status === 'seguimiento' ? 'generando' : nuevo.status;
        patch.statusDetail = nuevo.status === 'seguimiento'
            ? 'Las escenas se están generando.'
            : nuevo.awaitingConfirmation
                ? 'Preparado. Falta confirmar para generar las escenas.'
                : (REEL_STAGES.find(s => s.id === nuevo.nextStage)?.label || null);
        const final = await release(row.id, patch);
        return { ok: true, reel: final, stage: etapa.id, done: false };
    } catch (e) {
        const agotado = tries >= REEL_STAGE_MAX_TRIES;
        stages[etapa.id] = { status: agotado ? 'error' : 'retry', tries, at: now(), error: str(e?.message || e, 600) };
        const nuevo = deriveReelWorkflowStatus(stages, { confirmed: confirmado });
        const final = await release(row.id, {
            stages,
            status: agotado ? (nuevo.status === 'seguimiento' ? 'generando' : nuevo.status) : etapa.state,
            lastError: str(e?.message || e, 600),
            statusDetail: agotado ? `Falló «${etapa.label}»: ${str(e?.message || e, 200)}` : `Reintentando «${etapa.label}»`,
        });
        if (final.status === 'error') {
            await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel', detail: `Falló la etapa ${etapa.id}: ${str(e?.message || e, 300)}` }).catch(() => {});
        }
        return { ok: false, reel: final, stage: etapa.id, error: e?.message };
    }
}

// ─── Seguir al proyecto ────────────────────────────────────────────────────
//
// ⚠️ EL ESTADO DEL RENDER NO SE DUPLICA: se LEE. `ReelProject` tiene su propia
// máquina de estados, su barrido, su webhook y su sondeo desde v4.670, y todo
// eso ya funciona. Este workflow traduce ese estado al suyo y nada más — con un
// segundo estado propio, un Reel podría estar «listo» acá y «montando» allá.

const PROJECT_TO_REEL = {
    queued: 'generando', analyzing: 'generando', directing: 'generando',
    expanding: 'generando', generating: 'generando', validating: 'generando',
    assembling: 'componiendo', rendering: 'componiendo', music: 'componiendo',
    ready: 'borrador_listo', needs_review: 'borrador_listo',
    failed: 'error', error: 'error', cancelled: 'descartado',
    // Un proyecto con escenas listas y otras sin resolver (v4.1028): no es un
    // error, es un Reel que se CONTINÚA.
    incomplete: 'incompleto',
};

const followReelProject = async (row) => {
    if (!row.reelProjectId) {
        return await release(row.id, { status: 'error', lastError: 'Las etapas terminaron y no hay proyecto de Reel: hay que reintentar la etapa «Generando las escenas».' });
    }
    const { rows } = await db.query(
        `SELECT id, status, "statusDetail", "videoUrl", "posterUrl", "durationSec", "creditsEstimated" FROM "ReelProject" WHERE id = $1`,
        [row.reelProjectId]
    );
    const p = rows[0];
    if (!p) {
        return await release(row.id, { status: 'error', lastError: 'El proyecto de Reel ya no existe: se puede crear una versión nueva.' });
    }

    const destino = PROJECT_TO_REEL[p.status] || 'generando';
    if (destino === row.status) return row;

    const patch = { status: destino, statusDetail: p.statusDetail || null, creditsEstimated: Number(p.creditsEstimated) || row.creditsEstimated };
    if (destino === 'borrador_listo') {
        patch.generatedAt = new Date();
        patch.statusDetail = p.status === 'needs_review'
            ? 'Borrador listo, con escenas marcadas para revisar.'
            : 'Borrador listo para revisión.';
    }
    if (destino === 'error') patch.lastError = p.statusDetail || 'El montaje falló.';
    if (destino === 'incompleto') patch.lastError = p.statusDetail || 'Faltan escenas por generar.';
    if (destino === 'generando' || destino === 'componiendo' || destino === 'borrador_listo') patch.lastError = null;

    const final = await release(row.id, patch);
    if (destino === 'borrador_listo') {
        await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel', detail: 'Reel listo para revisión.' }).catch(() => {});
    }
    return final;
};

// ─── Acciones humanas ──────────────────────────────────────────────────────

export async function transitionReel({ row, to, reason = '', actor = null, actorName = null }) {
    const { canTransitionReel, reelNeedsReason } = await import('./submissionReelSpec.js');
    if (!canTransitionReel(row.status, to)) {
        return { ok: false, error: `No se puede pasar de «${reelStateLabel(row.status)}» a «${reelStateLabel(to)}».` };
    }
    if (reelNeedsReason(to) && !String(reason || '').trim()) {
        return { ok: false, error: 'Hace falta el motivo: es lo que queda escrito y lo que explica la decisión dentro de seis meses.' };
    }
    const patch = { status: to, statusDetail: str(reason, 300) || null };
    if (to === 'aprobado') patch.approvedAt = new Date();
    if (to === 'publicado') patch.publishedAt = new Date();
    const final = await release(row.id, patch);
    await logEvent({
        submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel',
        detail: `Reel: ${reelStateLabel(row.status)} → ${reelStateLabel(to)}${reason ? ` · ${str(reason, 200)}` : ''}`,
        actor, actorName,
    }).catch(() => {});
    return { ok: true, reel: final };
}

/**
 * La selección MANUAL. Reemplaza a la automática, entera.
 *
 * ⚠️ CAMBIAR LAS FOTOS DESPUÉS DE GENERAR NO REHACE EL REEL SOLO. Las escenas
 * ya están pagadas: rehacerlas por un cambio de selección gastaría los créditos
 * otra vez sin que nadie lo pidiera. Se guarda, se DICE, y quien quiera el Reel
 * con las fotos nuevas crea una versión.
 */
export async function updateReelSelection({ row, fileIds = [], actor = null, actorName = null }) {
    const ctx = await loadContext(row);
    const media = animatableMedia(ctx).filter(m => m.kind === 'image' && m.inLibrary);
    const manual = applyManualSelection(media, fileIds);
    if (!manual.ok) return { ok: false, error: manual.error, rejected: manual.rejected };

    const stages = { ...(row.stages || {}) };
    const yaGenerado = Boolean(row.reelProjectId);
    if (!yaGenerado) {
        // Todavía no se pagó nada: la selección nueva vuelve a alimentar el
        // storyboard, que es lo que hace que la historia siga a las fotos.
        delete stages.storyboard;
    }
    const final = await release(row.id, {
        selection: { source: 'manual', at: now(), items: manual.selection, discarded: [], usable: media.length, degraded: false },
        stages,
        ...(yaGenerado ? {} : { status: 'preparando', statusDetail: 'Storyboard pendiente con la selección nueva.' }),
    });
    await logEvent({
        submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel',
        detail: `Selección de fotografías cambiada a mano (${manual.selection.length}).`, actor, actorName,
    }).catch(() => {});
    return {
        ok: true, reel: final, rejected: manual.rejected,
        note: yaGenerado
            ? 'La selección quedó guardada. El Reel ya generado NO se rehace solo: para verlo con estas fotografías hay que crear una versión nueva.'
            : null,
    };
}

// ════════════════════════════════════════════════════════════════════════════
// EL ASISTENTE «PREPARAR REEL» (v4.1012)
//
// Todo lo de acá es GRATIS en el medidor de créditos: reordena, acota y guarda.
// Ninguna de estas funciones llama a un proveedor de video ni crea un
// `ReelProject`. Lo comprueba una prueba que lee el archivo.
// ════════════════════════════════════════════════════════════════════════════

/** El material que se puede animar, ya cargado. Lo comparten las acciones. */
const animatableFor = async (row) => {
    const ctx = await loadContext(row);
    return { ctx, media: animatableMedia(ctx).filter(m => m.kind === 'image' && m.inLibrary) };
};

/**
 * Guarda el plan SIN generar nada.
 *
 * ⚠️ CONFIRMAR ES OTRA COSA Y OTRA RUTA. Guardar nunca pone `confirmedAt`: si
 * lo pusiera, el asistente dispararía el gasto cada vez que alguien cambia una
 * música. Y un plan ya confirmado que se toca se DESCONFIRMA sólo si el Reel
 * todavía no se generó —cambiar la duración de un Reel pagado no lo rehace, se
 * dice y se crea una versión (la regla de v4.1010 con la selección)—.
 */
export async function updateReelPlan({ row, patch = {}, fileIds = null, actor = null, actorName = null }) {
    const previo = row.plan || {};
    const yaGenerado = Boolean(row.reelProjectId);
    const cambios = {};

    // ── Las fotografías, si vinieron. Van por el camino de siempre. ──
    let seleccion = row.selection || {};
    let rechazados = [];
    if (Array.isArray(fileIds)) {
        const { media } = await animatableFor(row);
        const manual = applyManualSelection(media, fileIds);
        if (!manual.ok) return { ok: false, error: manual.error, rejected: manual.rejected };
        seleccion = { source: 'manual', at: now(), items: manual.selection, discarded: [], usable: media.length, degraded: false };
        rechazados = manual.rejected;
        cambios.selection = seleccion;
    }

    const escenas = Array.isArray(seleccion.items) ? seleccion.items.length : 0;

    // ⚠️ CAMBIAR LA CANTIDAD DE FOTOS INVALIDA LA DURACIÓN POR ESCENA. Es una
    // lista por índice: conservarla con otra cantidad dejaría una escena sin
    // duración o una duración sin escena, y el reparto la ignoraría en silencio.
    const cambioLaCantidad = Array.isArray(previo.perScene) && previo.perScene.length !== escenas;
    const plan = normalizeReelPlan(
        { ...patch, ...(cambioLaCantidad && !Array.isArray(patch.perScene) ? { perScene: null } : {}) },
        previo
    );
    plan.updatedAt = now();

    // Tocar el plan de un Reel que todavía no se generó lo devuelve a
    // «configurando»: hay que volver a confirmar, porque lo que se confirmó ya
    // no es lo que hay.
    if (!yaGenerado) { plan.confirmedAt = null; plan.confirmedBy = null; }
    cambios.plan = plan;

    // El storyboard se escribió para OTRA duración o para otras fotos: se
    // rehace en la próxima vuelta, que es gratis. Con el Reel ya generado no se
    // toca nada — el texto ya está horneado en la voz.
    const stages = { ...(row.stages || {}) };
    if (!yaGenerado && (Array.isArray(fileIds) || patch.durationSec !== undefined || patch.perScene !== undefined)) {
        delete stages.storyboard;
        cambios.stages = stages;
        cambios.status = 'preparando';
        cambios.statusDetail = 'Storyboard pendiente con la configuración nueva.';
    }

    const final = await release(row.id, cambios);
    await logEvent({
        submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel',
        detail: `Plan del Reel actualizado${Array.isArray(fileIds) ? ` (${escenas} fotografía(s))` : ''}. No se generó nada.`,
        actor, actorName,
    }).catch(() => {});

    return {
        ok: true, reel: final, rejected: rechazados,
        note: yaGenerado
            ? 'La configuración quedó guardada. El Reel ya generado NO se rehace solo: para verlo con estos ajustes hay que crear una versión nueva.'
            : null,
    };
}

/**
 * «Sugerir mejores imágenes con IA».
 *
 * ⚠️ NO CUESTA NI UNA LLAMADA A NINGÚN MODELO, y decirlo importa: lo que
 * propone sale del análisis que el workflow del artículo ya pagó —nitidez,
 * brillo, resolución, rostros, duplicados por dHash y lo que el modelo de
 * visión describió—. Volver a mirarlas serían N llamadas de visión para saber
 * lo mismo, y encima la propuesta cambiaría en cada pulsación.
 *
 * La propuesta es EDITABLE: se guarda como la selección y quien la abrió puede
 * cambiarla entera antes de confirmar.
 */
export async function suggestReelSelection({ row, actor = null, actorName = null }) {
    const { media } = await animatableFor(row);
    const elegidas = selectStoryImages(media, { max: MAX_REEL_IMAGES });
    if (!elegidas.enough) {
        return { ok: false, error: `Sólo hay ${elegidas.usable} fotografía(s) utilizable(s) y el Reel necesita al menos ${MIN_SCENE_COUNT}.` };
    }
    const sinAnalisis = media.every(m => !m.analyzed);
    const final = await release(row.id, {
        selection: {
            source: 'auto', at: now(), items: elegidas.selection,
            discarded: elegidas.discarded, usable: elegidas.usable, degraded: sinAnalisis,
        },
        plan: { ...seedPlanDuration(row.plan, elegidas.selection.length), confirmedAt: null, confirmedBy: null },
    });
    await logEvent({
        submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel',
        detail: `Selección sugerida con el análisis ya existente (${elegidas.selection.length} fotografías).`, actor, actorName,
    }).catch(() => {});
    return {
        ok: true, reel: final,
        note: sinAnalisis
            ? 'Se propusieron por el orden en que las mandó el club: todavía no hay análisis del artículo para comparar nitidez ni descartar repetidas.'
            : null,
    };
}

/**
 * El ORDEN: manual (arrastrar) o narrativo («Orden automático con IA»).
 *
 * El automático tampoco llama a ningún modelo: la función narrativa de cada
 * fotografía ya está decidida y ordenar es leerla. Y NO es obligatorio
 * aceptarlo — es una propuesta que se guarda y se puede volver a arrastrar.
 */
export async function reorderReelSelection({ row, fileIds = null, auto = false, actor = null, actorName = null }) {
    const items = Array.isArray(row.selection?.items) ? row.selection.items : [];
    if (!items.length) return { ok: false, error: 'Todavía no hay fotografías elegidas para ordenar.' };

    const ordenadas = auto ? orderSelectionNarrative(items).items : applySelectionOrder(items, fileIds || []);
    // La función narrativa la fija la POSICIÓN: la primera cuenta el contexto y
    // la última cierra. Conservar el rol viejo tras reordenar dejaría el cierre
    // en medio de la pieza.
    const conRoles = reslotSelection(ordenadas);

    const stages = { ...(row.stages || {}) };
    const yaGenerado = Boolean(row.reelProjectId);
    if (!yaGenerado) delete stages.storyboard;

    const final = await release(row.id, {
        selection: { ...(row.selection || {}), source: auto ? 'auto_order' : 'manual', at: now(), items: conRoles },
        stages,
        ...(yaGenerado ? {} : {
            plan: { ...normalizeReelPlan({}, row.plan || {}), confirmedAt: null, confirmedBy: null, updatedAt: now() },
            status: 'preparando',
            statusDetail: 'Storyboard pendiente con el orden nuevo.',
        }),
    });
    return { ok: true, reel: final };
}

/**
 * CONFIRMAR. Es el único gesto de todo el módulo que autoriza el gasto.
 *
 * Congela lo que se va a generar —fotos, orden, duración, guion, música—, deja
 * escrito quién lo autorizó y recién entonces devuelve la fila a un estado de
 * trabajo para que el motor la recoja. El primer avance corre en el acto: quien
 * confirma espera ver que arrancó, no un «en cola» hasta el minuto siguiente.
 */
export async function confirmReelPlan({ row, actor = null, actorName = null }) {
    if (row.reelProjectId) return { ok: false, error: 'Este Reel ya se generó. Para generarlo con otra configuración hay que crear una versión nueva.' };

    const items = Array.isArray(row.selection?.items) ? row.selection.items : [];
    const pc = planContextFor();
    const plan = normalizeReelPlan({}, row.plan || {});
    const juicio = validateReelPlan(plan, {
        sceneCount: items.length, engineDurations: pc.engineDurations, transition: pc.transition,
    });
    if (!juicio.ok) return { ok: false, error: juicio.errors.join(' '), errors: juicio.errors, warnings: juicio.warnings };

    const confirmado = {
        ...plan,
        confirmedAt: now(),
        confirmedBy: actorName || actor || 'humano',
        updatedAt: now(),
    };
    const final = await release(row.id, {
        plan: confirmado,
        status: 'preparando',
        statusDetail: 'Confirmado. Generando las escenas.',
        lastError: null,
    });
    await logEvent({
        submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel',
        detail: `Reel confirmado: ${items.length} fotografías, ${juicio.timing.finalSec} s, voz ${NARRATION_MODES[plan.narrationMode]?.label || plan.narrationMode}, música ${plan.music === MUSIC_NONE ? 'sin música' : plan.music}. Desde acá se gastan créditos.`,
        actor, actorName,
    }).catch(() => {});
    return { ok: true, reel: final, warnings: juicio.warnings, timing: juicio.timing };
}

/** El resumen del asistente, RESUELTO en el servidor. */
export async function reelPlanView(row, { sceneCount = null } = {}) {
    const items = Array.isArray(row?.selection?.items) ? row.selection.items : [];
    const n = Number.isFinite(sceneCount) ? sceneCount : items.length;
    const pc = planContextFor();
    const plan = normalizeReelPlan({}, row?.plan || {});
    const juicio = validateReelPlan(plan, { sceneCount: n, engineDurations: pc.engineDurations, transition: pc.transition });
    return {
        plan: { ...plan, confirmed: planIsConfirmed(row?.plan) },
        durationOptions: durationOptionsFor({ sceneCount: n, engineDurations: pc.engineDurations, transition: pc.transition }),
        timing: juicio.timing,
        canGenerate: juicio.ok,
        errors: juicio.errors,
        warnings: juicio.warnings,
        summary: summarizeReelPlan(plan, {
            sceneCount: n, engineDurations: pc.engineDurations, transition: pc.transition,
            creditsPerScene: pc.creditsPerScene, format: pc.format, engineLabel: pc.engineLabel,
        }),
    };
}

/** Reintenta UNA etapa sin regenerar lo que ya está en `ok`. */
export async function retryReelStage({ row, stage = '' }) {
    const objetivo = reelStageToRetry(row.stages || {}, stage);
    if (!objetivo) return { ok: false, error: 'No hay ninguna etapa que reintentar.' };
    const stages = { ...(row.stages || {}) };
    delete stages[objetivo];
    const final = await release(row.id, {
        stages, status: REEL_STAGES.find(s => s.id === objetivo)?.state || 'analizando',
        lastError: null, statusDetail: `Reintentando «${REEL_STAGES.find(s => s.id === objetivo)?.label || objetivo}»`,
    });
    return { ok: true, reel: final, stage: objetivo };
}

/**
 * Vuelve a seguir al proyecto DESPUÉS de una acción sobre él (continuar,
 * respaldo de una escena, regenerar). Existe porque `advanceReel` corta en su
 * primera línea cuando la fila no está en un estado de trabajo —«incompleto»
 * no lo es—, así que sin esto el proyecto arrancaría de nuevo y la fila se
 * quedaría diciendo «incompleto» para siempre.
 */
export async function refollowReel(row) {
    const fresh = await reelById(row.id);
    if (!fresh?.reelProjectId) return fresh;
    return followReelProject(fresh);
}

/**
 * «Continuar N escenas pendientes» (v4.1028). NO regenera el Reel: llama al
 * MISMO `resumeReelProject` del Estudio de Contenido, que saltea toda escena
 * con clip y retoma sólo lo que falta con la estrategia siguiente o el
 * respaldo sin IA. Después, la fila vuelve a seguir al proyecto.
 */
export async function resumeSubmissionReelProject({ row, sceneIds = null, strategy = null, actor = null, actorName = null }) {
    if (!row?.reelProjectId) return { ok: false, error: 'Esta solicitud todavía no tiene un proyecto de Reel: no hay escenas que continuar.' };
    const r = await resumeReelProject(row.reelProjectId, { sceneIds, strategy, actor: actorName || actor || 'panel' });
    if (!r.ok) return { ok: false, error: r.error, status: r.status };
    const final = await refollowReel(row);
    await logEvent({
        submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel',
        detail: `Reel: se continúan ${r.resumed} escena(s) pendiente(s); ${r.preserved} ya generada(s) se conservan sin volver a consumir créditos.`,
        actor, actorName,
    }).catch(() => {});
    return { ok: true, reel: final, resumed: r.resumed, preserved: r.preserved, outcomes: r.outcomes };
}

/** «Usar imagen con movimiento cinematográfico» para UNA escena: sin IA, sin créditos. */
export async function fallbackSubmissionReelScene({ row, sceneId, actor = null, actorName = null }) {
    if (!row?.reelProjectId) return { ok: false, error: 'Esta solicitud todavía no tiene un proyecto de Reel.' };
    const r = await fallbackReelScene(row.reelProjectId, sceneId, { actor: actorName || actor || 'panel' });
    if (!r.ok) return { ok: false, error: r.error, status: r.status };
    const final = await refollowReel(row);
    await logEvent({
        submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel',
        detail: 'Reel: una escena se resolvió a mano con la fotografía en movimiento cinematográfico (sin IA).',
        actor, actorName,
    }).catch(() => {});
    return { ok: true, reel: final };
}

/** Regenerar UNA escena con la estrategia pedida. Es el `regenerateReelScene` del Estudio. */
export async function regenerateSubmissionReelScene({ row, sceneId, body = {}, actor = null, actorName = null }) {
    if (!row?.reelProjectId) return { ok: false, error: 'Esta solicitud todavía no tiene un proyecto de Reel.' };
    const r = await regenerateReelScene(row.reelProjectId, sceneId, body || {}, { actor: actorName || actor || 'panel' });
    if (!r.ok) return { ok: false, error: r.error, status: r.status };
    const final = await refollowReel(row);
    await logEvent({
        submissionId: row.submissionId, campaignId: row.campaignId, type: 'reel',
        detail: `Reel: se regeneró una escena${body?.strategy ? ` (estrategia ${body.strategy})` : ''}.`,
        actor, actorName,
    }).catch(() => {});
    return { ok: true, reel: final };
}

// ─── El barrido ────────────────────────────────────────────────────────────
//
// La generación NO depende de la pantalla (v4.670): hay TRES vías que llaman al
// MISMO `advanceReel` —el cron cada minuto, el sondeo del navegador y el botón—
// y el reclamo de la fila es lo que impide que dos hagan el mismo trabajo. Sin
// el cron, un Reel se queda parado si el usuario cierra la pestaña.

export async function sweepReels({ budgetMs = 240000, windowHours = 6, limit = 10 } = {}) {
    const arranque = Date.now();
    const salida = { mirados: 0, avanzados: 0, errores: 0, pendientes: 0 };
    try {
        await ensureAll();
        if (!autoReelsEnabled()) return { ...salida, off: true };
        const { rows } = await db.query(
            `SELECT * FROM "SubmissionReel"
              WHERE status = ANY($1) AND "isCurrent"
                AND "updatedAt" > NOW() - ($2 || ' hours')::interval
              ORDER BY "updatedAt" ASC LIMIT $3`,
            [WORKING, String(windowHours), Math.min(Number(limit) || 10, 50)]
        );
        for (const row of rows) {
            // El presupuesto de tiempo: lo que no entra espera al minuto
            // siguiente, no se pierde. La función corta a los 300 s.
            if (Date.now() - arranque > budgetMs) { salida.pendientes = rows.length - salida.mirados; break; }
            salida.mirados++;
            const r = await advanceReel(row);
            if (r?.ok) salida.avanzados++; else salida.errores++;
        }
        if (salida.mirados) console.log(`[reels-solicitud] barrido: ${salida.avanzados}/${salida.mirados} avanzados${salida.pendientes ? `, ${salida.pendientes} para la próxima` : ''}`);
        return salida;
    } catch (e) {
        console.warn('[reels-solicitud] barrido degradado:', e.message);
        return { ...salida, error: e.message };
    }
}

export { CONTENT_MODES };
