// ════════════════════════════════════════════════════════════════════════════
// Solicitud → artículo — la API — v4.1000
//
// Todas las rutas del workflow cuelgan de la campaña
// (`/:id/submissions/:submissionId/article…`) y pasan por
// `requireCampaignAccess`: el aislamiento es el MISMO con el que ese sitio abre
// la solicitud. Publicar exige además `news.publish`, que es el permiso con el
// que ese mismo usuario publicaría desde Noticias — no hay un segundo criterio.
//
// El beacon público (`POST /clubs/:clubId/posts/:postId/view`) es la única
// ruta sin sesión: acepta un cuerpo acotado y sólo mide artículos publicados y
// visibles para ese sitio.
// ════════════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import {
    articleOf, mediaOf, postOf, versionsOf, pendingDrafts, enqueueArticle, advanceArticle,
    updateArticleMedia, transitionArticle, retryArticleStage, publishArticle, duplicateArticle, sendMediaToLibrary,
    restoreVersion, regenerateSection, publicUrlFor, autoArticlesEnabled,
} from '../lib/submissionArticleEngine.js';
import { recordArticleHit, articleStats, impactSummary } from '../lib/articleAnalytics.js';
import { getSubmission, getInboxSubmission } from '../lib/contentSubmissionStore.js';
import { signedSubmissionUrl } from '../lib/submissionFiles.js';
import { submissionFolderView } from '../lib/submissionFolders.js';
import { STAGES, ARTICLE_STATES, nextArticleStates, isWorkingState, GALLERY_ROLES, REGENERABLE_SECTIONS, IMPACT_PERIODS, originNote } from '../lib/submissionArticleSpec.js';
import { campaignIdsInScope } from './contributionCampaignController.js';
import { POST_VISIBILITY_SQL } from '../lib/postScope.js';

const fail = (res, e, code = 500) => {
    console.error('[articles]', e);
    res.status(code).json({ error: e?.message || 'Error inesperado' });
};
const actorOf = (req) => ({ actor: req.user?.id || null, actorName: req.user?.name || req.user?.email || null });

/** La vista completa del artículo de una solicitud. */
async function articleView(campaignId, submissionId) {
    const submission = await getSubmission(campaignId, submissionId);
    if (!submission) return null;
    const row = await articleOf(submissionId);
    if (!row) return { submission: { id: submission.id, status: submission.status }, article: null, autoEnabled: autoArticlesEnabled() };
    const [post, media, versions] = await Promise.all([postOf(row.postId), mediaOf(row.id), versionsOf(row.id)]);
    const mediaConUrl = [];
    for (const m of media) {
        mediaConUrl.push({
            fileId: m.fileId, kind: m.kind, role: m.role, roleLabel: GALLERY_ROLES[m.role]?.label || m.role,
            isCover: m.isCover, sortOrder: m.sortOrder, excluded: m.excluded, excludedReason: m.excludedReason,
            alt: m.alt, caption: m.caption, score: m.score, reasons: m.analysis?.reasons || [],
            measured: m.analysis?.measured || null, vision: m.analysis?.vision || null,
            filename: m.filename, inLibrary: Boolean(m.mediaId),
            // Por qué ESE archivo no llegó. Un «faltan 3» sin el motivo obliga
            // a reintentar a ciegas; con él se sabe cuál reintentar y por qué
            // (requisito de errores: un archivo caído no bloquea a los demás).
            libraryError: m.promoteError || null,
            // El archivo se MIRA sin URL compartible mientras no esté aprobado.
            url: m.mediaUrl || await signedSubmissionUrl(m.s3Key),
        });
    }
    let site = null;
    if (row.clubId) {
        const { rows } = await db.query(`SELECT id, name, domain, subdomain, type, "districtId", district FROM "Club" WHERE id = $1`, [row.clubId]);
        site = rows[0] || null;
    }
    const stages = STAGES.map(s => ({ id: s.id, label: s.label, optional: s.optional, ...(row.stages?.[s.id] || { status: 'pending' }) }));
    // ⚠️ LA CARPETA SE DERIVA, NO SE GUARDA EN EL ARTÍCULO (v4.1004). El
    // vínculo vive en `MediaFolder.sourceId` y se resuelve por índice único:
    // una columna `mediaFolderId` en `SubmissionArticle` sería una SEGUNDA
    // verdad sobre lo mismo y se contradiría en cuanto alguien borrara la
    // carpeta desde la Librería. DEGRADA a `null` — todavía no existe hasta
    // que el material se promueve, y ninguna de las dos pantallas puede
    // quedarse sin cargar por eso.
    const folder = await submissionFolderView({ clubId: row.clubId, submissionId: row.submissionId });
    return {
        submission: { id: submission.id, status: submission.status, title: submission.title, club: submission.club },
        article: {
            id: row.id, status: row.status, statusLabel: ARTICLE_STATES[row.status]?.label || row.status, statusDetail: row.statusDetail,
            working: isWorkingState(row.status), stages, lastError: row.lastError,
            generated: {
                title: row.generated?.title, excerpt: row.generated?.excerpt, category: row.generated?.category, categoryIsNew: row.generated?.categoryIsNew,
                suggestedCategory: row.generated?.suggestedCategory, tags: row.generated?.tags, notProvided: row.generated?.notProvided,
                missingInfo: row.generated?.missingInfo, copyIssues: row.generated?.copyIssues, validation: row.generated?.validation,
                depth: row.generated?.depth || null, depthReason: row.generated?.depthReason || null,
                meta: row.generated?.meta ? { model: row.generated.meta.model, attempts: row.generated.meta.attempts, warnings: row.generated.meta.warnings, wordCount: row.generated.meta.wordCount } : null,
                ogTitle: row.generated?.ogTitle, ogDescription: row.generated?.ogDescription,
            },
            mediaPlan: row.mediaPlan || {},
            postId: row.postId, clubId: row.clubId, siteName: site?.name || null,
            generatedBy: row.generatedBy, generatedAt: row.generatedAt, approvedAt: row.approvedAt, publishedAt: row.publishedAt,
            publicUrl: row.publicUrl || (post && post.published ? await publicUrlFor(site, post) : null),
            originNote: originNote(row.submissionId),
            nextStates: nextArticleStates(row.status),
            createdAt: row.createdAt, updatedAt: row.updatedAt,
        },
        post: post ? {
            id: post.id, title: post.title, slug: post.slug, published: post.published, category: post.category, tags: post.tags,
            keywords: post.keywords, seoTitle: post.seoTitle, seoDescription: post.seoDescription, image: post.image,
            images: post.images || [], videoGallery: post.videoGallery || [], socialCopy: post.socialCopy,
            createdAt: post.createdAt, updatedAt: post.updatedAt, wordCount: String(post.content || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
            editUrl: `/admin/noticias?post=${post.id}`,
        } : null,
        media: mediaConUrl,
        // La carpeta de la Biblioteca donde vive el material de esta solicitud.
        // Es lo que permite que el selector de portada ABRA ahí en vez de en el
        // explorador de archivos del computador.
        folder,
        // Cuántos archivos siguen esperando la aprobación del material. Es lo
        // que permite decir «faltan 6 fotos» y ofrecer el botón que las trae,
        // en vez de entregar un borrador sin portada sin explicar por qué.
        pendingLibrary: mediaConUrl.filter(m => !m.inLibrary && !m.excluded).length,
        versions,
        sections: Object.values(REGENERABLE_SECTIONS),
        autoEnabled: autoArticlesEnabled(),
    };
}

export const getSubmissionArticle = async (req, res) => {
    try {
        const v = await articleView(req.params.id, req.params.submissionId);
        if (!v) return res.status(404).json({ error: 'No encontramos esa solicitud.' });
        res.json(v);
    } catch (e) { fail(res, e); }
};

/** «Generar artículo»: encola si no había y avanza una etapa. Si ya existe
 *  uno, lo DICE en vez de crear otro. */
export const generateSubmissionArticle = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const submission = await getSubmission(id, submissionId);
        if (!submission) return res.status(404).json({ error: 'No encontramos esa solicitud.' });
        const existente = await articleOf(submissionId);
        if (existente && !['error'].includes(existente.status)) {
            return res.status(409).json({ error: 'Esta solicitud ya tiene un artículo relacionado. Para otro, usá «Duplicar».', article: { id: existente.id, status: existente.status, postId: existente.postId } });
        }
        if (existente?.status === 'error') {
            const r = await transitionArticle({ row: existente, to: 'recibida', ...actorOf(req) });
            if (!r.ok) return res.status(409).json({ error: r.detalle });
        } else {
            await enqueueArticle({ submissionId, campaignId: id, clubId: submission.originClubId || req.user?.clubId || null });
        }
        const paso = await advanceArticle(submissionId);
        res.json({ ok: true, step: paso.stage || null, ...(await articleView(id, submissionId)) });
    } catch (e) { fail(res, e); }
};

/** Una etapa por llamada: es lo que sondea la ficha mientras trabaja. */
export const advanceSubmissionArticle = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row) return res.status(404).json({ error: 'Esta solicitud no tiene artículo en cola.' });
        const paso = await advanceArticle(row);
        res.json({ ok: paso.ok !== false, step: paso.stage || null, busy: Boolean(paso.busy), error: paso.error || null, ...(await articleView(id, submissionId)) });
    } catch (e) { fail(res, e); }
};

export const retrySubmissionArticle = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row) return res.status(404).json({ error: 'Esta solicitud no tiene artículo.' });
        if (isWorkingState(row.status) && row.claimedAt) return res.status(409).json({ error: 'El artículo se está generando ahora mismo.' });
        const r = await retryArticleStage({ row, stage: String(req.body?.stage || '') });
        if (r.ok === false && r.reason === 'nada_que_reintentar') return res.status(409).json({ error: 'No hay ninguna etapa que reintentar.' });
        res.json({ ok: true, step: r.stage || null, error: r.error || null, ...(await articleView(id, submissionId)) });
    } catch (e) { fail(res, e); }
};

export const regenerateSubmissionArticle = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row?.postId) return res.status(404).json({ error: 'Todavía no hay un borrador que regenerar.' });
        const r = await regenerateSection({ row, section: String(req.body?.section || ''), apply: req.body?.apply === true, ...actorOf(req) });
        if (!r.ok) return res.status(400).json({ error: r.reason === 'seccion_desconocida' ? 'Esa sección no se puede regenerar.' : 'No se pudo regenerar.' });
        res.json({ ...r, ...(r.applied ? await articleView(id, submissionId) : {}) });
    } catch (e) { fail(res, e, 502); }
};

export const updateSubmissionArticleMedia = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row) return res.status(404).json({ error: 'Esta solicitud no tiene artículo.' });
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const r = await updateArticleMedia({ row, items, ...actorOf(req) });
        res.json({ ok: true, sync: r.sync, ...(await articleView(id, submissionId)) });
    } catch (e) { fail(res, e); }
};

export const changeSubmissionArticleStatus = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row) return res.status(404).json({ error: 'Esta solicitud no tiene artículo.' });
        const r = await transitionArticle({ row, to: String(req.body?.to || ''), reason: req.body?.reason || '', ...actorOf(req) });
        if (!r.ok) return res.status(409).json({ error: r.detalle || 'No se pudo cambiar el estado.', reason: r.reason });
        // Volver a la cola desde un error arranca la etapa en el acto.
        if (req.body?.to === 'recibida') await advanceArticle(r.article);
        res.json({ ok: true, ...(await articleView(id, submissionId)) });
    } catch (e) { fail(res, e); }
};

/** «Aprobar» (publish:false) o «Aprobar y publicar» (publish:true). */
export const publishSubmissionArticle = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row) return res.status(404).json({ error: 'Esta solicitud no tiene artículo.' });
        const { rows } = await db.query(`SELECT "recipientClubId" FROM "ContributionCampaign" WHERE id = $1`, [id]);
        const r = await publishArticle({
            campaignId: id, row, publish: req.body?.publish !== false,
            clubIdForLibrary: req.body?.clubId || rows[0]?.recipientClubId || row.clubId || req.user?.clubId || null,
            ...actorOf(req),
        });
        if (!r.ok) return res.status(409).json({ error: r.detalle || 'No se pudo publicar.', reason: r.reason });
        res.json({ ok: true, published: r.published, publicUrl: r.publicUrl || null, promotion: r.promotion || null, ...(await articleView(id, submissionId)) });
    } catch (e) { fail(res, e); }
};

/**
 * «Enviar fotos a la Biblioteca» desde el panel del artículo.
 *
 * No es un segundo camino: llama al MISMO `sendMediaToLibrary` que usa
 * publicar, que a su vez es la secuencia de «Aprobar y enviar a Biblioteca».
 * Existe porque el aviso de que las fotos faltan estaba donde el usuario NO
 * podía resolverlo: el borrador salía sin portada y sin galería y había que ir
 * a otra pantalla a aprobar el material.
 */
export const sendSubmissionArticleMediaToLibrary = async (req, res) => {
    try {
        const { id, submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row) return res.status(404).json({ error: 'Esta solicitud no tiene artículo.' });
        const { rows } = await db.query(`SELECT "recipientClubId" FROM "ContributionCampaign" WHERE id = $1`, [id]);
        const r = await sendMediaToLibrary({
            campaignId: id, row,
            clubIdForLibrary: req.body?.clubId || rows[0]?.recipientClubId || row.clubId || req.user?.clubId || null,
            ...actorOf(req),
        });
        if (!r.ok) return res.status(409).json({ error: r.detalle || 'No se pudo enviar el material a la Biblioteca.', reason: r.reason });
        const p = r.promotion;
        const message = r.reason === 'sin_archivos'
            ? 'La solicitud no trae archivos.'
            : r.reason === 'ya_estaban'
                ? 'El material ya estaba en la Biblioteca; el borrador quedó sincronizado.'
                : p?.fallidos
                    ? `${p.promovidos} de ${p.total} archivo(s) llegaron a la Biblioteca; ${p.fallidos} falló(aron).`
                    : `${p?.promovidos || 0} archivo(s) en la Biblioteca. La portada y la galería ya están en el borrador.`;
        res.json({ ok: !p?.fallidos, promotion: p, sync: r.sync || null, message, ...(await articleView(id, submissionId)) });
    } catch (e) { fail(res, e); }
};

export const duplicateSubmissionArticle = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row?.postId) return res.status(404).json({ error: 'Todavía no hay un borrador que duplicar.' });
        const r = await duplicateArticle({ row, ...actorOf(req) });
        if (!r.ok) return res.status(409).json({ error: 'No se pudo duplicar.' });
        res.json({ ok: true, postId: r.postId, editUrl: `/admin/noticias?post=${r.postId}` });
    } catch (e) { fail(res, e); }
};

export const restoreSubmissionArticleVersion = async (req, res) => {
    try {
        const { id, submissionId, versionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row) return res.status(404).json({ error: 'Esta solicitud no tiene artículo.' });
        const r = await restoreVersion({ row, versionId, ...actorOf(req) });
        if (!r.ok) return res.status(404).json({ error: 'Esa versión no existe.' });
        res.json({ ok: true, ...(await articleView(id, submissionId)) });
    } catch (e) { fail(res, e); }
};

export const getSubmissionArticleStats = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row?.postId) return res.status(404).json({ error: 'Esta solicitud no tiene artículo.' });
        const post = await postOf(row.postId);
        const period = IMPACT_PERIODS[req.query.period] ? req.query.period : 'todo';
        const stats = await articleStats({ postId: row.postId, clubId: row.clubId || post?.clubId || null, period, publishedAt: row.publishedAt || (post?.published ? post.updatedAt : null) });
        const summary = req.query.summary === '1' ? await impactSummary(stats.facts) : null;
        res.json({
            published: Boolean(post?.published), publicUrl: row.publicUrl, publishedAt: row.publishedAt,
            article: stats, summary,
            // La arquitectura del informe completo: hoy sólo el artículo mide.
            channels: { article: { measured: true }, facebook: { measured: false, note: 'Fase siguiente' }, instagram: { measured: false, note: 'Fase siguiente' }, whatsapp: { measured: false }, email: { measured: false } },
        });
    } catch (e) { fail(res, e); }
};

/** Los borradores listos que alcanza esta sesión: la campana del panel. */
export const listPendingArticles = async (req, res) => {
    try {
        const alcance = await campaignIdsInScope(req);
        res.json(await pendingDrafts(alcance, { limit: Number(req.query.limit) || 20 }));
    } catch (e) { fail(res, e); }
};

/** Ubica una solicitud por id dentro del alcance: es lo que permite abrir la
 *  ficha desde un enlace (`?abrir=`) sin arrastrar la campaña por la URL. */
export const locateInboxSubmission = async (req, res) => {
    try {
        const alcance = await campaignIdsInScope(req);
        const s = await getInboxSubmission(alcance, req.params.submissionId);
        if (!s) return res.status(404).json({ error: 'No encontramos esa solicitud.' });
        res.json({ id: s.id, campaignId: s.campaignId, campaignName: s.campaignName, status: s.status, title: s.title });
    } catch (e) { fail(res, e); }
};

/**
 * El beacon público. Sólo mide un artículo PUBLICADO y visible para ese
 * sitio: la misma cláusula con la que se sirve la ficha pública.
 */
export const recordPublicArticleView = async (req, res) => {
    try {
        const { clubId, postId } = req.params;
        const { rows } = await db.query(
            `SELECT id, "clubId", published FROM "Post" WHERE (id = $1 OR slug = $1) AND ${POST_VISIBILITY_SQL.replace(/\$CLUB/g, '$2')} AND published = true LIMIT 1`,
            [postId, clubId]
        );
        const post = rows[0];
        if (!post) return res.status(204).end();
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
        // El tenant del evento es el sitio que SIRVE la página, no el dueño
        // del Post: una centralizada vista desde tres sitios se mide en cada uno.
        await recordArticleHit({ post: { id: post.id, clubId }, headers: req.headers, body: req.body || {}, ip, userAgent: req.headers['user-agent'] || '' });
        res.status(204).end();
    } catch (e) {
        // Un beacon nunca devuelve error al visitante.
        console.warn('[articles] beacon:', e.message);
        res.status(204).end();
    }
};

export default {
    getSubmissionArticle, generateSubmissionArticle, advanceSubmissionArticle, retrySubmissionArticle,
    regenerateSubmissionArticle, updateSubmissionArticleMedia, changeSubmissionArticleStatus, publishSubmissionArticle,
    duplicateSubmissionArticle, restoreSubmissionArticleVersion, getSubmissionArticleStats, listPendingArticles,
    locateInboxSubmission, recordPublicArticleView,
};
