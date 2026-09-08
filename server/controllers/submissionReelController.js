// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel — la API — v4.1006
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
} from '../lib/submissionReelEngine.js';
import { articleOf } from '../lib/submissionArticleEngine.js';
import { getSubmission, filesOf } from '../lib/contentSubmissionStore.js';
import { signedSubmissionUrl } from '../lib/submissionFiles.js';
import { submissionFolderView } from '../lib/submissionFolders.js';
import {
    REEL_STAGES, REEL_STATES, nextReelStates, isReelWorking, reelStateLabel,
    CONTENT_MODES, MIN_REEL_IMAGES, MAX_REEL_IMAGES, STORY_SLOT_LABELS, estimateReelCredits,
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
        `SELECT id, position, status, "statusDetail", "durationSec", "videoUrl", "posterUrl", style
           FROM "ReelScene" WHERE "projectId" = $1 ORDER BY position`,
        [projectId]
    );
    return {
        id: p.id, title: p.title, status: p.status, statusDetail: p.statusDetail,
        videoUrl: p.videoUrl, posterUrl: p.posterUrl, durationSec: p.durationSec, format: p.format,
        creditsEstimated: p.creditsEstimated, mediaId: p.mediaId,
        notes: Array.isArray(p.notes) ? p.notes : [],
        // ⚠️ SE DICE CUÁNTAS ESCENAS TERMINARON, no sólo si el Reel está listo.
        // Es el punto 26 del pedido: una escena que falla no cancela el
        // proyecto, y «4 de 5» con el botón de reintentar sobre la que falló es
        // lo que evita volver a pagar las cuatro que ya salieron.
        scenes: escenas.map(s => ({
            id: s.id, position: s.position, status: s.status, statusDetail: s.statusDetail,
            durationSec: s.durationSec, videoUrl: s.videoUrl, posterUrl: s.posterUrl, style: s.style,
        })),
        scenesReady: escenas.filter(s => ['ready', 'needs_review'].includes(s.status)).length,
        scenesTotal: escenas.length,
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
    };

    if (!row) {
        // Sin Reel todavía: se dice qué se va a gastar ANTES de gastarlo.
        const fotos = material.filter(m => m.kind === 'image' && m.inLibrary).length;
        const escenas = Math.min(MAX_REEL_IMAGES, fotos);
        return {
            ...base,
            reel: null,
            versions: [],
            estimate: escenas >= MIN_REEL_IMAGES
                ? { scenes: escenas, durationSec: escenas * 5 - (escenas - 1) * 0.5, ...estimateReelCredits({ sceneCount: escenas }) }
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
 * «Generar Reel».
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
        // La primera etapa corre YA: quien pulsa espera ver que arrancó, no un
        // «en cola» hasta el minuto siguiente.
        if (reel) await advanceReel(reel).catch(() => {});
        res.status(201).json({ ...(await reelView(req.params.id, submission.id)), created: true });
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
        const r = await retryReelStage({ row, stage: String(req.body?.stage || '') });
        if (!r.ok) return res.status(409).json({ error: r.error });
        await advanceReel(r.reel).catch(() => {});
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
