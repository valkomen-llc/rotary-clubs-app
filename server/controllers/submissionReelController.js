// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel — la API — v4.1006 · asistente v4.1012
//
// Todas las rutas cuelgan de la campaña
// (`/:id/submissions/:submissionId/reel…`) y pasan por
// `requireCampaignAccess`: el aislamiento es el MISMO con el que ese sitio abre
// la solicitud y genera su artículo. No hay un segundo criterio de alcance.
//
// ⚠️ NINGUNA DE ESTAS RUTAS PUBLICA NADA. El Reel queda SIEMPRE en borrador
// hasta que una persona lo apruebe, y aprobar tampoco publica: publicar es el
// paso siguiente y lo hacen los módulos que ya existen (la Distribución
// multi-destino y las Cuentas Sociales). Lo garantiza el flujo de estados
// —`FLOW` no tiene ningún camino a `publicado` que saltee `aprobado`— y lo
// comprueba una prueba que lo recorre entero.
// ════════════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import {
    reelOf, reelById, reelVersionsOf, enqueueReel, newReelVersion, advanceReel,
    updateReelSelection, transitionReel, retryReelStage, pendingReelDrafts, autoReelsEnabled,
    updateReelPlan, suggestReelSelection, reorderReelSelection, confirmReelPlan,
    reelPlanView, planContextFor,
    resumeSubmissionReelProject,
    fallbackSubmissionReelScene as engineFallbackScene,
    regenerateSubmissionReelScene as engineRegenerateScene,
} from '../lib/submissionReelEngine.js';
import {
    SCENE_STATUSES, SCENE_STRATEGIES, SCENE_FAILURE_CODES, DEFAULT_SCENE_STRATEGY, isSceneStrategy,
    isUsableSceneStatus, isResumableReelStatus, planSceneRecovery, REEL_STATUSES,
} from '../lib/reelSpec.js';
import { reelStageToRetry } from '../lib/submissionReelSpec.js';
import { articleOf } from '../lib/submissionArticleEngine.js';
import { getSubmission, filesOf } from '../lib/contentSubmissionStore.js';
import { signedSubmissionUrl } from '../lib/submissionFiles.js';
import { submissionFolderView } from '../lib/submissionFolders.js';
import {
    REEL_STAGES, REEL_STATES, nextReelStates, isReelWorking, reelStateLabel,
    CONTENT_MODES, MIN_REEL_IMAGES, MAX_REEL_IMAGES, STORY_SLOT_LABELS, estimateReelCredits,
    REEL_DURATIONS, DEFAULT_REEL_DURATION, NARRATION_MODES, musicChoices, ON_SCREEN_TEXT,
    FREE_REEL_STAGES, defaultDurationFor, resolveReelTiming, NARRATION_SCRIPT_MAX,
} from '../lib/submissionReelSpec.js';
import { campaignIdsInScope } from './contributionCampaignController.js';

const fail = (res, e, code = 500) => {
    console.error('[reels-solicitud]', e);
    res.status(code).json({ error: e?.message || 'Error inesperado' });
};
const actorOf = (req) => ({ actor: req.user?.id || null, actorName: req.user?.name || req.user?.email || null });

/** El proyecto del motor de siempre, con lo que la ficha necesita pintar. */
const projectView = async (projectId) => {
    if (!projectId) return null;
    const { rows } = await db.query(
        `SELECT id, title, status, "statusDetail", "videoUrl", "posterUrl", "durationSec", format,
                "creditsEstimated", "mediaId", notes, config
           FROM "ReelProject" WHERE id = $1`,
        [projectId]
    );
    const p = rows[0];
    if (!p) return null;
    const { rows: escenas } = await db.query(
        `SELECT id, position, status, "statusDetail", "durationSec", "videoUrl", "posterUrl", style,
                "sourceImageUrl", "sourceMediaId", attempts, strategy, "promptVersion", "errorCode",
                "nextAttemptAt", "mediaId", lifecycle, "creditsEstimated", fidelity
           FROM "ReelScene" WHERE "projectId" = $1 ORDER BY position`,
        [projectId]
    );
    const usable = (s) => Boolean(s.videoUrl) && isUsableSceneStatus(s.status);
    const now = new Date();
    const scenes = escenas.map(s => {
        const strategy = isSceneStrategy(s.strategy) ? s.strategy : (s.status === 'fallback_ready' ? 'fotografico' : DEFAULT_SCENE_STRATEGY);
        const life = s.lifecycle && typeof s.lifecycle === 'object' ? s.lifecycle : {};
        return {
            id: s.id, position: s.position, status: s.status, statusDetail: s.statusDetail,
            statusLabel: SCENE_STATUSES[s.status]?.label || s.status,
            durationSec: s.durationSec, videoUrl: s.videoUrl, posterUrl: s.posterUrl, style: s.style,
            sourceImageUrl: s.sourceImageUrl, sourceMediaId: s.sourceMediaId,
            // ── El ciclo de vida de la escena (v4.1028) ──
            usable: usable(s),
            fallback: s.status === 'fallback_ready',
            strategy, strategyLabel: SCENE_STRATEGIES[strategy]?.label || strategy,
            promptVersion: Number(s.promptVersion) || 1,
            paidGenerations: Number(s.attempts) || 0,
            strategiesTried: Array.isArray(life.strategiesTried) ? life.strategiesTried : [],
            errorCode: s.errorCode || null,
            errorLabel: s.errorCode ? (SCENE_FAILURE_CODES[s.errorCode]?.label || s.errorCode) : null,
            errorKind: s.errorCode ? (SCENE_FAILURE_CODES[s.errorCode]?.kind || null) : null,
            nextAttemptAt: s.nextAttemptAt || null,
            mediaId: s.mediaId || null,
            creditsEstimated: Number(s.creditsEstimated) || 0,
            fidelityScore: s.fidelity?.score ?? null,
            // Qué se haría con ella al continuar. Sólo para las que no tienen
            // clip: para una lista, la única respuesta es «no se toca».
            recovery: usable(s) ? null : planSceneRecovery(s, { now }),
        };
    });
    const scenesUsable = scenes.filter(s => s.usable).length;
    return {
        id: p.id, title: p.title, status: p.status, statusDetail: p.statusDetail,
        statusLabel: REEL_STATUSES[p.status]?.label || p.status,
        videoUrl: p.videoUrl, posterUrl: p.posterUrl, durationSec: p.durationSec, format: p.format,
        creditsEstimated: p.creditsEstimated, mediaId: p.mediaId,
        notes: Array.isArray(p.notes) ? p.notes : [],
        // ⚠️ SE DICE CUÁNTAS ESCENAS TERMINARON, no sólo si el Reel está listo.
        // Es el punto 26 del pedido: una escena que falla no cancela el
        // proyecto, y «4 de 5» con el botón de reintentar sobre la que falló es
        // lo que evita volver a pagar las cuatro que ya salieron.
        scenes,
        scenesReady: scenesUsable,
        scenesUsable,
        scenesPending: scenes.length - scenesUsable,
        scenesFallback: scenes.filter(s => s.fallback).length,
        scenesTotal: scenes.length,
        // Un proyecto terminal que no se entregó se CONTINÚA (v4.1028).
        resumable: isResumableReelStatus(p.status),
        working: !REEL_STATUSES[p.status]?.terminal,
        // Medidor PROPIO: generaciones lanzadas y créditos estimados por
        // escena. No es el saldo del proveedor ni un precio.
        costSummary: {
            paidGenerations: scenes.reduce((n, s) => n + s.paidGenerations, 0),
            fallbackScenes: scenes.filter(s => s.fallback).length,
            creditsEstimated: Number(p.creditsEstimated) || 0,
            note: 'Medidor propio por escena: créditos estimados por generación lanzada. No es el saldo real del proveedor ni un precio.',
        },
        editUrl: `/admin/content-studio?tab=library&reel=${p.id}`,
    };
};

/** La vista completa del Reel de una solicitud. */
async function reelView(campaignId, submissionId) {
    const submission = await getSubmission(campaignId, submissionId);
    if (!submission) return null;

    const row = await reelOf(submissionId);
    const archivos = await filesOf(submissionId).catch(() => []);
    const articulo = await articleOf(submissionId).catch(() => null);

    // El material elegible, con su URL. Lo que todavía es privado se mira con
    // enlace firmado y se DICE que no se puede animar hasta aprobarlo.
    const material = [];
    for (const f of archivos) {
        if (f.kind !== 'image' && f.kind !== 'video') continue;
        material.push({
            fileId: f.id, kind: f.kind, filename: f.filename,
            inLibrary: Boolean(f.mediaId && f.mediaUrl),
            url: f.mediaUrl || await signedSubmissionUrl(f.s3Key),
            sortOrder: f.sortOrder ?? 0,
        });
    }

    const folder = await submissionFolderView({ clubId: row?.clubId || submission.originClubId || null, submissionId });

    const base = {
        submission: { id: submission.id, status: submission.status, title: submission.title, club: submission.club },
        material,
        folder,
        limits: { min: MIN_REEL_IMAGES, max: MAX_REEL_IMAGES },
        slotLabels: STORY_SLOT_LABELS,
        contentModes: Object.values(CONTENT_MODES),
        article: articulo ? { id: articulo.id, status: articulo.status, postId: articulo.postId, title: articulo.generated?.title || null } : null,
        autoEnabled: autoReelsEnabled(),
        // ── Los catálogos del asistente «Preparar Reel» (v4.1012) ──
        //
        // Viajan RESUELTOS: la pantalla no decide qué duración se puede pedir ni
        // qué música existe. Con dos catálogos, el asistente ofrecería una
        // duración que el motor no puede dar o una música que el montaje no sabe
        // pedir — y lo que se separaría es cuánto se le cobra a alguien.
        catalogs: {
            durations: REEL_DURATIONS,
            defaultDuration: DEFAULT_REEL_DURATION,
            narrationModes: Object.values(NARRATION_MODES),
            narrationScriptMax: NARRATION_SCRIPT_MAX,
            music: musicChoices(),
            onScreenText: ON_SCREEN_TEXT,
            engineLabel: planContextFor().engineLabel,
        },
    };

    if (!row) {
        // Sin Reel todavía: se dice qué se va a gastar ANTES de gastarlo.
        //
        // ⚠️ LA DURACIÓN SE RESUELVE, NO SE ESTIMA A OJO. Hasta v4.1011 acá había
        // `escenas * 5 - (escenas - 1) * 0.5` escrito a mano: un segundo cálculo
        // de duración que se habría separado del reparto real en cuanto cambiara
        // el techo por escena. Ahora sale del mismo criterio que la usa.
        const fotos = material.filter(m => m.kind === 'image' && m.inLibrary).length;
        const escenas = Math.min(MAX_REEL_IMAGES, fotos);
        const pc = planContextFor();
        const t = escenas >= MIN_REEL_IMAGES
            ? resolveReelTiming({
                targetSec: defaultDurationFor({ sceneCount: escenas, engineDurations: pc.engineDurations, transition: pc.transition }),
                sceneCount: escenas, engineDurations: pc.engineDurations, transition: pc.transition,
            })
            : null;
        return {
            ...base,
            reel: null,
            versions: [],
            estimate: t
                ? { scenes: escenas, durationSec: t.finalSec, ...estimateReelCredits({ sceneCount: escenas, creditsPerScene: pc.creditsPerScene }) }
                : null,
        };
    }

    const stages = REEL_STAGES.map(s => ({
        id: s.id, label: s.label, optional: s.optional, ...(row.stages?.[s.id] || { status: 'pending' }),
    }));

    return {
        ...base,
        reel: {
            id: row.id, status: row.status, statusLabel: reelStateLabel(row.status), statusDetail: row.statusDetail,
            working: isReelWorking(row.status), stages, lastError: row.lastError,
            contentMode: row.contentMode,
            contentModeLabel: CONTENT_MODES[row.contentMode]?.label || row.contentMode,
            classification: row.classification || {},
            selection: row.selection || {},
            storyboard: row.storyboard || {},
            versionNumber: Number(row.versionNumber) || 1,
            creditsEstimated: Number(row.creditsEstimated) || 0,
            reelProjectId: row.reelProjectId,
            articleId: row.articleId,
            generatedBy: row.generatedBy, generatedAt: row.generatedAt,
            approvedAt: row.approvedAt, publishedAt: row.publishedAt,
            nextStates: nextReelStates(row.status),
            createdAt: row.createdAt, updatedAt: row.updatedAt,
        },
        project: await projectView(row.reelProjectId),
        versions: await reelVersionsOf(submissionId),
        estimate: null,
        // El asistente entero, ya resuelto: el plan, las cuatro duraciones con
        // lo que cada una daría de verdad, el resumen y si se puede confirmar.
        planner: await reelPlanView(row),
    };
}

export const getSubmissionReel = async (req, res) => {
    try {
        const vista = await reelView(req.params.id, req.params.submissionId);
        if (!vista) return res.status(404).json({ error: 'La solicitud no existe en esta campaña.' });
        res.json(vista);
    } catch (e) { fail(res, e); }
};

/**
 * «Preparar Reel» — lo que antes era «Generar Reel».
 *
 * ⚠️ ESTA RUTA YA NO GENERA NADA (v4.1012). Crea la fila del workflow y corre
 * las etapas GRATUITAS —mirar el material, proponer las fotografías y escribir
 * el storyboard—, y ahí se detiene: el estado derivado se queda en
 * «configurando», que no es un estado de trabajo, así que ni el cron ni el
 * sondeo ni el botón la mueven hacia la etapa que llama al proveedor de video.
 *
 * El nombre importa: pulsar «Generar Reel» dejó de significar «gastar créditos»
 * y pasó a significar «abrir el asistente». Lo único que gasta es `/confirm`.
 *
 * ⚠️ IDEMPOTENTE: si ya hay un Reel para esta solicitud, NO se crea otro —se
 * devuelve el que está—. Crear uno nuevo es una acción aparte y explícita
 * (`/version`), porque cada Reel cuesta créditos de video de verdad.
 */
export const generateSubmissionReel = async (req, res) => {
    try {
        const submission = await getSubmission(req.params.id, req.params.submissionId);
        if (!submission) return res.status(404).json({ error: 'La solicitud no existe en esta campaña.' });

        const existente = await reelOf(submission.id);
        if (existente) {
            return res.json({ ...(await reelView(req.params.id, submission.id)), created: false, reused: true });
        }

        const articulo = await articleOf(submission.id).catch(() => null);
        const { reel } = await enqueueReel({
            submissionId: submission.id,
            campaignId: req.params.id,
            clubId: submission.originClubId || null,
            articleId: articulo?.id || null,
            generatedBy: req.user?.email || 'human',
        });
        // Las etapas GRATUITAS corren YA: quien pulsa espera abrir el asistente
        // con el material ya mirado y una propuesta delante, no un «en cola»
        // hasta el minuto siguiente. Son tres como mucho y la puerta del gasto
        // detiene la cuarta, así que este bucle no puede pagar nada.
        //
        // El tope de vueltas no es una precaución vaga: cada `advanceReel`
        // ejecuta UNA etapa, y sin tope un error que devolviera `retry` para
        // siempre dejaría la petición girando hasta el tiempo de función.
        let fila = reel;
        for (let i = 0; i < FREE_REEL_STAGES.length + 1 && fila; i++) {
            const r = await advanceReel(fila).catch(() => null);
            if (!r?.reel || r.done || r.busy) break;
            fila = r.reel;
        }
        res.status(201).json({ ...(await reelView(req.params.id, submission.id)), created: true });
    } catch (e) { fail(res, e); }
};

// ════════════════════════════════════════════════════════════════════════════
// EL ASISTENTE «PREPARAR REEL» (v4.1012)
//
// ⚠️ NINGUNA DE ESTAS CUATRO RUTAS GASTA UN CRÉDITO DE VIDEO, salvo `/confirm`,
// que es la única que existe para autorizarlo. Guardar, sugerir y reordenar se
// resuelven con el análisis que el workflow del artículo ya pagó.
// ════════════════════════════════════════════════════════════════════════════

const cargarReel = async (req, res) => {
    const row = await reelOf(req.params.submissionId);
    if (!row || row.campaignId !== req.params.id) {
        res.status(404).json({ error: 'Esta solicitud todavía no tiene Reel. Pulsá «Preparar Reel» para empezar.' });
        return null;
    }
    return row;
};

/** Guarda el plan. NO genera. */
export const updateSubmissionReelPlan = async (req, res) => {
    try {
        const row = await cargarReel(req, res); if (!row) return;
        const b = req.body || {};
        const r = await updateReelPlan({
            row,
            // ⚠️ EL CUERPO PROPONE Y EL CRITERIO DECIDE. `normalizeReelPlan`
            // acota contra los catálogos cerrados: una duración, un modo de voz
            // o una música que no estén declarados caen al valor anterior. Lo
            // que no se puede expresar en la petición no se puede pedir.
            patch: {
                durationSec: b.durationSec,
                perScene: b.perScene,
                narrationMode: b.narrationMode,
                narrationScript: b.narrationScript,
                music: b.music,
                onScreenText: b.onScreenText,
            },
            fileIds: Array.isArray(b.fileIds) ? b.fileIds : null,
            ...actorOf(req),
        });
        if (!r.ok) return res.status(422).json({ error: r.error, rejected: r.rejected });
        res.json({ ...(await reelView(req.params.id, req.params.submissionId)), note: r.note, rejected: r.rejected });
    } catch (e) { fail(res, e); }
};

/** «Sugerir mejores imágenes con IA». Sobre el análisis ya pagado: no cuesta. */
export const suggestSubmissionReelImages = async (req, res) => {
    try {
        const row = await cargarReel(req, res); if (!row) return;
        const r = await suggestReelSelection({ row, ...actorOf(req) });
        if (!r.ok) return res.status(422).json({ error: r.error });
        res.json({ ...(await reelView(req.params.id, req.params.submissionId)), note: r.note });
    } catch (e) { fail(res, e); }
};

/** El orden: manual (arrastrar) o narrativo. Tampoco cuesta. */
export const reorderSubmissionReel = async (req, res) => {
    try {
        const row = await cargarReel(req, res); if (!row) return;
        const r = await reorderReelSelection({
            row,
            fileIds: Array.isArray(req.body?.fileIds) ? req.body.fileIds : null,
            auto: req.body?.auto === true,
            ...actorOf(req),
        });
        if (!r.ok) return res.status(422).json({ error: r.error });
        res.json(await reelView(req.params.id, req.params.submissionId));
    } catch (e) { fail(res, e); }
};

/**
 * «Confirmar y generar Reel». LA ÚNICA RUTA DE TODO EL MÓDULO QUE AUTORIZA EL
 * GASTO, y por eso exige confirmación explícita (`confirm: true` → 428 sin
 * ella): lo que sigue crea escenas de video que se cobran y no se deshacen
 * pulsando «atrás». Es el mismo criterio que los desembolsos (v4.885).
 */
export const confirmSubmissionReel = async (req, res) => {
    try {
        const row = await cargarReel(req, res); if (!row) return;
        if (req.body?.confirm !== true) {
            return res.status(428).json({ error: 'Falta la confirmación explícita: desde acá se generan las escenas de video y eso consume créditos.' });
        }
        const r = await confirmReelPlan({ row, ...actorOf(req) });
        if (!r.ok) return res.status(422).json({ error: r.error, errors: r.errors, warnings: r.warnings });
        // Confirmado, el motor lo recoge: la primera vuelta corre en el acto y
        // el resto lo siguen el cron y el sondeo. El trabajo continúa aunque se
        // cierre el modal o se abandone la página (v4.670).
        await advanceReel(r.reel).catch(() => {});
        res.json({ ...(await reelView(req.params.id, req.params.submissionId)), confirmed: true, warnings: r.warnings });
    } catch (e) { fail(res, e); }
};

/** El sondeo de la pantalla: una etapa por llamada. */
export const advanceSubmissionReel = async (req, res) => {
    try {
        const row = await reelOf(req.params.submissionId);
        if (!row) return res.status(404).json({ error: 'Esta solicitud todavía no tiene Reel.' });
        if (row.campaignId !== req.params.id) return res.status(404).json({ error: 'La solicitud no existe en esta campaña.' });
        await advanceReel(row);
        res.json(await reelView(req.params.id, req.params.submissionId));
    } catch (e) { fail(res, e); }
};

/** Reintentar una etapa concreta sin regenerar lo que ya está bien. */
export const retrySubmissionReel = async (req, res) => {
    try {
        const row = await reelOf(req.params.submissionId);
        if (!row || row.campaignId !== req.params.id) return res.status(404).json({ error: 'Esta solicitud todavía no tiene Reel.' });
        // ── El callejón de v4.1027 ──
        //
        // Con todas las etapas en `ok` y el proyecto en error o incompleto,
        // «Reintentar esa etapa» contestaba 409 «no hay ninguna etapa que
        // reintentar»: la etapa que había fallado era una ESCENA, que no es
        // una etapa del workflow. Sin etapa que reintentar y con proyecto, se
        // CONTINÚA el proyecto — sólo lo que falta.
        const stage = reelStageToRetry(row.stages || {}, String(req.body?.stage || ''));
        if (!stage && row.reelProjectId) {
            const r = await resumeSubmissionReelProject({ row, ...actorOf(req) });
            if (!r.ok) return res.status(r.status || 409).json({ error: r.error });
            return res.json(await reelView(req.params.id, req.params.submissionId));
        }
        const r = await retryReelStage({ row, stage: String(req.body?.stage || '') });
        if (!r.ok) return res.status(409).json({ error: r.error });
        await advanceReel(r.reel).catch(() => {});
        res.json(await reelView(req.params.id, req.params.submissionId));
    } catch (e) { fail(res, e); }
};

/**
 * «Continuar N escenas pendientes» (v4.1028). NO regenera el Reel: sólo lo
 * que no tiene clip. `sceneIds` acota a unas escenas; `strategy` fuerza un
 * peldaño de la escalera para todas.
 */
export const resumeSubmissionReel = async (req, res) => {
    try {
        const row = await reelOf(req.params.submissionId);
        if (!row || row.campaignId !== req.params.id) return res.status(404).json({ error: 'Esta solicitud todavía no tiene Reel.' });
        const r = await resumeSubmissionReelProject({
            row,
            sceneIds: Array.isArray(req.body?.sceneIds) ? req.body.sceneIds : null,
            strategy: req.body?.strategy || null,
            ...actorOf(req),
        });
        if (!r.ok) return res.status(r.status || 409).json({ error: r.error });
        res.json(await reelView(req.params.id, req.params.submissionId));
    } catch (e) { fail(res, e); }
};

/** «Usar imagen con movimiento cinematográfico» para UNA escena: sin IA, sin créditos. */
export const fallbackSubmissionReelScene = async (req, res) => {
    try {
        const row = await reelOf(req.params.submissionId);
        if (!row || row.campaignId !== req.params.id) return res.status(404).json({ error: 'Esta solicitud todavía no tiene Reel.' });
        const r = await engineFallbackScene({ row, sceneId: req.params.sceneId, ...actorOf(req) });
        if (!r.ok) return res.status(r.status || 409).json({ error: r.error });
        res.json(await reelView(req.params.id, req.params.submissionId));
    } catch (e) { fail(res, e); }
};

/** Regenerar UNA escena (con la estrategia pedida, si viene). Reinicia SU ciclo, no el Reel. */
export const regenerateSubmissionReelScene = async (req, res) => {
    try {
        const row = await reelOf(req.params.submissionId);
        if (!row || row.campaignId !== req.params.id) return res.status(404).json({ error: 'Esta solicitud todavía no tiene Reel.' });
        const r = await engineRegenerateScene({ row, sceneId: req.params.sceneId, body: req.body || {}, ...actorOf(req) });
        if (!r.ok) return res.status(r.status || 409).json({ error: r.error });
        res.json(await reelView(req.params.id, req.params.submissionId));
    } catch (e) { fail(res, e); }
};

/** La selección manual de fotografías. Reemplaza a la automática. */
export const updateSubmissionReelSelection = async (req, res) => {
    try {
        const row = await reelOf(req.params.submissionId);
        if (!row || row.campaignId !== req.params.id) return res.status(404).json({ error: 'Esta solicitud todavía no tiene Reel.' });
        const ids = Array.isArray(req.body?.fileIds) ? req.body.fileIds : [];
        const r = await updateReelSelection({ row, fileIds: ids, ...actorOf(req) });
        if (!r.ok) return res.status(422).json({ error: r.error, rejected: r.rejected });
        res.json({ ...(await reelView(req.params.id, req.params.submissionId)), note: r.note, rejected: r.rejected });
    } catch (e) { fail(res, e); }
};

/** El estado editorial: revisar, aprobar, descartar. NUNCA publica. */
export const changeSubmissionReelStatus = async (req, res) => {
    try {
        const row = await reelOf(req.params.submissionId);
        if (!row || row.campaignId !== req.params.id) return res.status(404).json({ error: 'Esta solicitud todavía no tiene Reel.' });
        const r = await transitionReel({ row, to: String(req.body?.to || ''), reason: String(req.body?.reason || ''), ...actorOf(req) });
        if (!r.ok) return res.status(409).json({ error: r.error });
        res.json(await reelView(req.params.id, req.params.submissionId));
    } catch (e) { fail(res, e); }
};

/**
 * «Crear nueva versión». La salida explícita de la idempotencia.
 *
 * Los archivos originales NO se duplican: la versión nueva apunta a los mismos
 * `fileId` de la solicitud. Lo que se vuelve a pagar son las escenas de video,
 * y por eso es un gesto aparte con su confirmación en la pantalla.
 */
export const newSubmissionReelVersion = async (req, res) => {
    try {
        const submission = await getSubmission(req.params.id, req.params.submissionId);
        if (!submission) return res.status(404).json({ error: 'La solicitud no existe en esta campaña.' });
        const articulo = await articleOf(submission.id).catch(() => null);
        const { created, reel } = await newReelVersion({
            submissionId: submission.id, campaignId: req.params.id,
            clubId: submission.originClubId || null, articleId: articulo?.id || null,
            generatedBy: req.user?.email || 'human',
        });
        if (created && reel) await advanceReel(reel).catch(() => {});
        res.status(created ? 201 : 200).json({ ...(await reelView(req.params.id, submission.id)), created });
    } catch (e) { fail(res, e); }
};

/**
 * Los Reels en borrador que alcanza esta sesión. Es el contador de la barra
 * superior: se OBSERVA del estado, no se empuja (la regla del CRM).
 */
export const listPendingReels = async (req, res) => {
    try {
        const scope = await campaignIdsInScope(req);
        const r = await pendingReelDrafts(scope, { limit: Number(req.query?.limit) || 8 });
        res.json({ ...r, medido: true });
    } catch (e) {
        // NUNCA lanza: un contador roto no puede dejar sin barra superior a
        // quien está trabajando en otra cosa. La AUSENCIA de `medido` es lo que
        // distingue «no llegó ninguno» de «no se pudo mirar» (v4.1005).
        console.warn('[reels-solicitud] pendientes:', e.message);
        res.json({ count: 0, items: [], error: e?.message || 'No se pudo consultar.' });
    }
};

export { REEL_STATES };
