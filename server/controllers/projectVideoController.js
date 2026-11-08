// ════════════════════════════════════════════════════════════════════
// Videos de proyectos — el video PROPIO del club (v4.1298.0)
// Feria de Proyectos Rotary Colombia
//
// Modalidad A, sin costo: el club que YA tiene un video de su proyecto lo
// sube desde «Mi proyecto», comprueba que quedó guardado, lo reproduce, lo
// envía a revisión y sigue su estado; el comité lo revisa, aprueba, pide
// correcciones o rechaza desde «Videos de proyectos → Videos propios».
//
// Convive con el Video Pitch Profesional (modalidad B) sobre la misma
// postulación con tablas, estados y archivos INDEPENDIENTES: subir un video
// propio no toca una solicitud de Video Pitch, su plan ni su pago, y al revés.
//
// ⚠️ «RECIBIDO» ES LO QUE EL SERVIDOR PUEDE AFIRMAR: el objeto existe en el
// almacenamiento, su tipo real es video, y quedó registrado como versión. El
// navegador no dice «subido correctamente» hasta que esta API lo confirma.
//
// ⚠️ EL ESTADO SÓLO CAMBIA POR `applyStatus`: valida la transición según quién
// actúa, escribe el historial y avisa UNA vez. Nadie escribe `status` en otro
// sitio. Nada se publica solo: la aprobación del comité y la autorización de
// difusión son cosas distintas (`publicVisibility` queda como llave futura).
//
// Permisos: los del módulo de la Feria (`withAccess`). Ver → 'view'; revisar
// (estado, observaciones) → 'changeStatus'; configurar → 'config'.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import { ensureTables, logEvent, readConfigForSubmission, portalLinkFor, sendFairEmail } from './projectFairController.js';
import { withAccess, actorFrom } from './projectFairAdminController.js';
import { projectStateOf, projectStateMeta } from '../lib/projectFairLifecycle.js';
import { ensureProjectVideoSchema } from '../lib/ensureProjectVideoSchema.js';
import { portalIdentity, participantActor, availabilityOf, loadSubmission } from './videoPitchController.js';
import {
    STATUSES, statusMeta, isStatus, canTransition, participantCanEdit, ADMIN_TRANSITIONS, PARTICIPANT_TRANSITIONS, FORMATS, LANGUAGES,
    REPLACEMENT_POLICIES, normalizeConfig, consentVersionOf, deadlinePassed, checkUploadMeta, judgeUploadedVideo, videoWarnings, fmtDuration,
    normalizeMeta, validateForSubmit, canReplace, cardCopyOf, summarize, notificationFor,
} from '../lib/projectVideoSpec.js';
import {
    presignProjectVideoUpload, inspectProjectVideoObject, videoKeyBelongs, projectVideoObjectExists, signedProjectVideoUrl, deleteProjectVideoObject,
} from '../lib/projectVideoStorage.js';

console.log('[projectVideoController] v4.1298.0 cargado — Videos de proyectos: el video propio del club sin costo, subida privada validada por bytes, versiones, revisión del comité con observaciones, configuración administrable y avisos; independiente del Video Pitch Profesional.');

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtBytes = (n) => { const b = Number(n) || 0; return b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.round(b / 1024)} KB`; };
const ensureAll = async () => { await ensureTables(); await ensureProjectVideoSchema(); };

// ── Configuración ────────────────────────────────────────────────────
const scopeOf = (eventId) => clean(eventId, 60) || 'global';
/** La configuración de la EDICIÓN del proyecto, con la global de respaldo y los valores por defecto debajo. */
export const readVideoConfig = async (eventId) => {
    const { rows } = await db.query('SELECT scope, config FROM "ProjectVideoConfig" WHERE scope = ANY($1::text[])', [[scopeOf(eventId), 'global']]);
    const own = rows.find(r => r.scope === scopeOf(eventId))?.config;
    const global = rows.find(r => r.scope === 'global')?.config;
    return normalizeConfig(own || global || {});
};

// ── Lectura ──────────────────────────────────────────────────────────
const loadVideo = async (id) => { const { rows } = await db.query('SELECT * FROM "ProjectVideo" WHERE id = $1 LIMIT 1', [id]); return rows[0] || null; };
const loadVideosOf = async (submissionId) => (await db.query('SELECT * FROM "ProjectVideo" WHERE "submissionId" = $1 ORDER BY "createdAt" ASC', [submissionId])).rows;
const loadVersions = async (videoId) => (await db.query('SELECT * FROM "ProjectVideoVersion" WHERE "videoId" = $1 ORDER BY "versionNumber" DESC', [videoId])).rows;
const loadVersion = async (videoId, versionId) => { const { rows } = await db.query('SELECT * FROM "ProjectVideoVersion" WHERE id = $1 AND "videoId" = $2 LIMIT 1', [versionId, videoId]); return rows[0] || null; };
const loadEvents = async (videoId, { participant = false } = {}) => (await db.query(
    `SELECT id, type, title, detail, metadata, "actorName", "actorRole", visibility, "createdAt" FROM "ProjectVideoEvent" WHERE "videoId" = $1 ${participant ? "AND visibility = 'all'" : ''} ORDER BY "createdAt" DESC LIMIT 200`, [videoId])).rows;

const logPvEvent = async (videoId, { type, title, detail = null, metadata = {}, actor = null, visibility = 'all' }) => {
    try {
        const { rows } = await db.query(`INSERT INTO "ProjectVideoEvent" ("videoId", type, title, detail, metadata, "actorId", "actorName", "actorRole", visibility) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) RETURNING *`,
            [videoId, type, title, detail, JSON.stringify(metadata || {}), actor?.id || null, actor?.name || null, actor?.role || null, visibility]);
        return rows[0];
    } catch (e) { console.warn('[project-videos] no pude registrar el evento:', e?.message); return null; }
};

const shapeVersion = (v, currentId) => (v ? {
    id: v.id, number: Number(v.versionNumber), fileName: v.fileName, format: v.format, formatLabel: FORMATS[v.format]?.label || String(v.format).toUpperCase(),
    contentType: v.contentType, sizeBytes: Number(v.sizeBytes) || 0, sizeLabel: fmtBytes(v.sizeBytes),
    width: v.width || null, height: v.height || null, durationSec: v.durationSec === null || v.durationSec === undefined ? null : Number(v.durationSec),
    durationLabel: v.durationSec ? fmtDuration(v.durationSec) : null, warnings: Array.isArray(v.warnings) ? v.warnings : [],
    processingStatus: v.processingStatus || 'ready', uploadedBy: v.uploadedByName || null, uploadedByRole: v.uploadedByRole || null,
    current: v.id === currentId, retiredAt: v.retiredAt || null, createdAt: v.createdAt,
} : null);
const shapeVideo = (v, current) => ({
    id: v.id, submissionId: v.submissionId, status: v.status, statusLabel: statusMeta(v.status).label, statusTone: statusMeta(v.status).tone,
    title: v.title || '', description: v.description || '', language: v.language || '', productionYear: v.productionYear || null, notes: v.notes || '',
    currentVersion: shapeVersion(current, v.currentVersionId), consentAccepted: Boolean(v.consentAccepted), consentVersion: v.consentVersion || null, consentAt: v.consentAt || null,
    reviewNote: v.reviewNote || null, adminNotes: v.adminNotes || null,
    submittedAt: v.submittedAt, reviewedAt: v.reviewedAt, approvedAt: v.approvedAt, lastEditedAt: v.lastEditedAt, createdAt: v.createdAt, updatedAt: v.updatedAt,
});
const currentVersionOf = async (video) => (video?.currentVersionId ? (await db.query('SELECT * FROM "ProjectVideoVersion" WHERE id = $1', [video.currentVersionId])).rows[0] || null : null);

// ── Avisos ───────────────────────────────────────────────────────────
const mailHtml = ({ video, submission, cfg, status, note }) => {
    const primary = '#17458F';
    const edition = cfg?.edition?.name || 'Feria de Proyectos Rotary Colombia';
    const link = `${portalLinkFor(submission, cfg)}?projectVideo=1`;
    const name = [submission.firstName, submission.lastName].filter(Boolean).join(' ') || 'equipo del proyecto';
    const body = {
        received: `Recibimos el video <strong>«${esc(video.title || 'del proyecto')}»</strong> del proyecto <strong>«${esc(submission.projectName)}»</strong>. El comité organizador lo revisará y te avisaremos del resultado.`,
        approved: `El comité aprobó el video <strong>«${esc(video.title || 'del proyecto')}»</strong>.${note ? `<br><br><em>${esc(note)}</em>` : ''}`,
        changes_requested: `El comité revisó el video <strong>«${esc(video.title || 'del proyecto')}»</strong> y pide correcciones:<br><br><em>${esc(note || '')}</em><br><br>Entra a tu perfil, revisa las observaciones y sube una nueva versión.`,
        rejected: `El comité no aprobó el video <strong>«${esc(video.title || 'del proyecto')}»</strong>.${note ? `<br><br><em>${esc(note)}</em>` : ''}`,
    }[status] || '';
    return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:620px;margin:0 auto;padding:24px 0"><div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb"><div style="background:${primary};color:#fff;padding:26px 32px"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Video del proyecto</div><div style="font-size:18px;font-weight:700">${esc(edition)}</div></div><div style="padding:30px 32px"><p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hola, ${esc(name)}:</p><p style="font-size:15px;line-height:1.6;margin:0 0 14px">${body}</p><p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:${primary};color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">Ver mi video</a></p><p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0">Proyecto: ${esc(submission.projectName)} · ${esc(submission.clubName)} · ${esc(submission.district)}</p></div></div></div>`;
};
const notifyParticipant = async ({ video, submission, cfg, status, eventId, note }) => {
    const spec = notificationFor(status);
    if (!spec || !submission?.email) return;
    const ins = await db.query(`INSERT INTO "ProjectVideoNotification" ("videoId", kind, "dedupeKey", recipient, status) VALUES ($1,$2,$3,$4,'pending') ON CONFLICT ("videoId", "dedupeKey") DO NOTHING RETURNING id`,
        [video.id, spec.kind, `${spec.kind}:${eventId || 'manual'}`, submission.email]).catch(() => ({ rows: [] }));
    const id = ins.rows[0]?.id; if (!id) return;
    try {
        const r = await sendFairEmail({ to: submission.email, subject: `${spec.subject} — ${cfg?.edition?.name || 'Feria de Proyectos Rotary Colombia'}`, html: mailHtml({ video, submission, cfg, status, note }), cfg });
        await db.query('UPDATE "ProjectVideoNotification" SET status = $2, error = $3 WHERE id = $1', [id, r?.success ? 'sent' : 'failed', r?.success ? null : clean(r?.error, 500) || 'sin detalle']);
    } catch (e) { await db.query('UPDATE "ProjectVideoNotification" SET status = $2, error = $3 WHERE id = $1', [id, 'failed', clean(e?.message, 500)]).catch(() => {}); }
};
const notifyAdmins = async ({ video, submission, cfg, eventId }) => {
    const emails = Array.isArray(cfg?.notifications?.adminEmails) ? cfg.notifications.adminEmails.filter(Boolean) : [];
    if (!emails.length) return;
    const ins = await db.query(`INSERT INTO "ProjectVideoNotification" ("videoId", kind, "dedupeKey", recipient, status) VALUES ($1,'admin_received',$2,$3,'pending') ON CONFLICT ("videoId", "dedupeKey") DO NOTHING RETURNING id`,
        [video.id, `admin_received:${eventId || 'manual'}`, emails.join(',')]).catch(() => ({ rows: [] }));
    const id = ins.rows[0]?.id; if (!id) return;
    const r = await sendFairEmail({ to: emails, subject: `Video propio recibido — ${submission.projectName}`, html: `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto"><h2 style="color:#17458F">Video del proyecto recibido</h2><p><strong>Proyecto:</strong> ${esc(submission.projectName)}<br><strong>Club:</strong> ${esc(submission.clubName)} · ${esc(submission.district)}<br><strong>Video:</strong> ${esc(video.title || '')}</p><p>Revísalo en Postulación de Proyectos → Videos de proyectos → Videos propios.</p></div>`, cfg }).catch(e => ({ success: false, error: e?.message }));
    await db.query('UPDATE "ProjectVideoNotification" SET status = $2, error = $3 WHERE id = $1', [id, r?.success ? 'sent' : 'failed', r?.success ? null : clean(r?.error, 500)]).catch(() => {});
};

// ── El cambio de estado, en UN solo sitio ────────────────────────────
const applyStatus = async ({ video, submission, cfg, to, actor, actorKind = 'admin', note = null, metadata = {} }) => {
    const from = video.status;
    if (!isStatus(to)) { const e = new Error('Estado desconocido.'); e.code = 400; throw e; }
    if (!canTransition(from, to, { actor: actorKind })) {
        const allowed = (actorKind === 'participant' ? PARTICIPANT_TRANSITIONS : ADMIN_TRANSITIONS)[from] || [];
        const e = new Error(`No se puede pasar de «${statusMeta(from).label}» a «${statusMeta(to).label}».${allowed.length ? ` Desde aquí se puede ir a: ${allowed.map(k => statusMeta(k).label).join(', ')}.` : ''}`);
        e.code = 409; throw e;
    }
    const sets = ['status = $2', '"updatedAt" = NOW()'];
    const params = [video.id, to];
    if (to === 'received') { sets.push('"submittedAt" = NOW()'); sets.push('"reviewNote" = NULL'); }
    if (['changes_requested', 'rejected', 'approved'].includes(to)) { params.push(clean(note, 2000) || null); sets.push(`"reviewNote" = $${params.length}`); sets.push('"reviewedAt" = NOW()'); }
    if (to === 'approved') sets.push('"approvedAt" = NOW()');
    await db.query(`UPDATE "ProjectVideo" SET ${sets.join(', ')} WHERE id = $1`, params);
    const event = await logPvEvent(video.id, { type: 'status_changed', title: `${statusMeta(from).label} → ${statusMeta(to).label}`, detail: clean(note, 2000) || null, metadata: { from, to, ...metadata }, actor });
    const fresh = await loadVideo(video.id);
    if (to === 'received') {
        await logEvent(submission.id, { type: 'project_video_received', title: 'Video propio del proyecto recibido', detail: fresh.title || null, actor, metadata: { videoId: video.id, resubmission: from !== 'draft' } });
        await notifyAdmins({ video: fresh, submission, cfg, eventId: event?.id });
    }
    if (to === 'approved') await logEvent(submission.id, { type: 'project_video_approved', title: 'Video propio del proyecto aprobado', detail: fresh.title || null, actor, metadata: { videoId: video.id } });
    if (actorKind !== 'participant' || to === 'received') await notifyParticipant({ video: fresh, submission, cfg, status: to, eventId: event?.id, note });
    return fresh;
};

// ════════════════════════════════════════════════════════════════════
// PORTAL
// ════════════════════════════════════════════════════════════════════
const portalView = async ({ submission, account }) => {
    const availability = availabilityOf(submission);
    const cfg = await readVideoConfig(submission.eventId);
    const videos = await loadVideosOf(submission.id);
    const shaped = [];
    for (const v of videos) {
        const current = await currentVersionOf(v);
        const versions = await loadVersions(v.id);
        const events = await loadEvents(v.id, { participant: true });
        shaped.push({
            ...shapeVideo(v, current), versions: versions.map(x => shapeVersion(x, v.currentVersionId)), events,
            canEdit: availability.available && participantCanEdit(v.status),
            canReplace: availability.available && canReplace({ status: v.status, cfg }),
            canSubmit: availability.available && participantCanEdit(v.status) && Boolean(v.currentVersionId),
            canWithdraw: ['received', 'in_review'].includes(v.status),
            validation: validateForSubmit({ meta: v, hasVersion: Boolean(v.currentVersionId), consentAccepted: v.consentAccepted, cfg }),
        });
    }
    const main = shaped[shaped.length - 1] || null;
    const status = main ? main.status : 'none';
    const canCreate = availability.available && cfg.enabled && !deadlinePassed(cfg) && videos.filter(v => !['rejected', 'withdrawn'].includes(v.status)).length < cfg.maxActiveVideos;
    return {
        available: availability.available, reason: availability.reason,
        status, statusLabel: statusMeta(status).label, statusTone: statusMeta(status).tone,
        identity: { projectName: submission.projectName || '', clubName: submission.clubName || '', district: submission.district || '', publicRef: submission.publicRef || '', responsible: [submission.firstName, submission.lastName].filter(Boolean).join(' ') },
        config: { ...cfg, consentVersion: consentVersionOf(cfg.consentText), deadlinePassed: deadlinePassed(cfg), accept: cfg.allowedFormats.map(f => `.${f}`).join(','), formats: cfg.allowedFormats.map(f => FORMATS[f].label) },
        catalog: { statuses: STATUSES, languages: LANGUAGES },
        videos: shaped, main, canCreate,
        card: cardCopyOf({ status, available: availability.available && (status !== 'none' || canCreate) }),
    };
};

// GET /portal/project-video
export const portalGet = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        res.json(await portalView({ submission, account }));
    } catch (error) { console.error('[project-videos] portalGet:', error); res.status(500).json({ error: 'No pudimos cargar tu video.' }); }
};

const ownVideoOr404 = async (req, res, submission) => {
    const video = await loadVideo(clean(req.params.id, 60));
    if (!video || video.submissionId !== submission.id) { res.status(404).json({ error: 'Video no encontrado.' }); return null; }
    return video;
};

// POST /portal/project-video — crea un borrador (o actualiza la ficha si manda `id`): { id?, title, description, language, productionYear, notes, consentAccepted }
export const portalSave = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const availability = availabilityOf(submission);
        if (!availability.available) return res.status(403).json({ error: availability.reason });
        const cfg = await readVideoConfig(submission.eventId);
        const meta = normalizeMeta(req.body || {});
        const actor = participantActor(account, submission);
        let video = req.body?.id ? await loadVideo(clean(req.body.id, 60)) : null;
        if (video && video.submissionId !== submission.id) return res.status(404).json({ error: 'Video no encontrado.' });
        if (!video) {
            if (!cfg.enabled) return res.status(403).json({ error: 'La recepción de videos no está habilitada.' });
            if (deadlinePassed(cfg)) return res.status(403).json({ error: `La fecha límite de recepción (${cfg.deadline}) ya pasó.` });
            const active = (await loadVideosOf(submission.id)).filter(v => !['rejected', 'withdrawn'].includes(v.status)).length;
            if (active >= cfg.maxActiveVideos) return res.status(409).json({ error: `Ya tienes ${active} video(s) activo(s); el máximo es ${cfg.maxActiveVideos}. Reemplaza el existente en vez de crear otro.` });
            const { rows } = await db.query(`INSERT INTO "ProjectVideo" ("submissionId", "accountId", "eventId", status, title, description, language, "productionYear", notes, "lastEditedAt") VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,NOW()) RETURNING *`,
                [submission.id, account?.id || null, submission.eventId || null, meta.title, meta.description, meta.language || null, meta.productionYear, meta.notes]);
            video = rows[0];
            await logPvEvent(video.id, { type: 'created', title: 'Ficha del video creada', actor });
        } else {
            if (!participantCanEdit(video.status) && !['received'].includes(video.status)) return res.status(409).json({ error: `El video está «${statusMeta(video.status).label}» y su ficha ya no se puede editar.` });
            await db.query('UPDATE "ProjectVideo" SET title = $2, description = $3, language = $4, "productionYear" = $5, notes = $6, "lastEditedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1',
                [video.id, meta.title, meta.description, meta.language || null, meta.productionYear, meta.notes]);
        }
        // El consentimiento guarda el TEXTO aceptado y su versión: es la evidencia.
        if (req.body?.consentAccepted === true && !video.consentAccepted) {
            await db.query('UPDATE "ProjectVideo" SET "consentAccepted" = TRUE, "consentVersion" = $2, "consentText" = $3, "consentAt" = NOW() WHERE id = $1', [video.id, consentVersionOf(cfg.consentText), cfg.consentText]);
            await logPvEvent(video.id, { type: 'consent_accepted', title: 'Autorización de uso del material aceptada', metadata: { consentVersion: consentVersionOf(cfg.consentText) }, actor });
        } else if (req.body?.consentAccepted === false && video.consentAccepted && participantCanEdit(video.status)) {
            await db.query('UPDATE "ProjectVideo" SET "consentAccepted" = FALSE, "consentVersion" = NULL, "consentText" = NULL, "consentAt" = NULL WHERE id = $1', [video.id]);
        }
        const fresh = await loadVideo(video.id);
        res.json({ ok: true, video: shapeVideo(fresh, await currentVersionOf(fresh)), savedAt: new Date().toISOString() });
    } catch (error) { console.error('[project-videos] portalSave:', error); res.status(500).json({ error: 'No pudimos guardar la ficha del video.' }); }
};

// POST /portal/project-video/:id/presign — { filename, size }
export const portalPresign = async (req, res) => {
    try {
        await ensureAll();
        const { submission } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const video = await ownVideoOr404(req, res, submission); if (!video) return;
        const cfg = await readVideoConfig(submission.eventId);
        if (!canReplace({ status: video.status, cfg })) return res.status(409).json({ error: `El video está «${statusMeta(video.status).label}»: no admite otro archivo.` });
        const juicio = checkUploadMeta({ filename: clean(req.body?.filename, 200), size: req.body?.size, cfg });
        if (!juicio.ok) return res.status(400).json({ error: juicio.errores.join(' ') });
        const signed = await presignProjectVideoUpload({ videoId: video.id, ext: juicio.ext, contentType: juicio.contentType });
        res.json({ ...signed, maxMb: cfg.maxSizeMb });
    } catch (error) { console.error('[project-videos] portalPresign:', error); res.status(502).json({ error: 'No se pudo preparar la subida al almacenamiento. Inténtalo de nuevo.' }); }
};

// POST /portal/project-video/:id/versions — registra el archivo YA subido como versión nueva y vigente.
export const portalRegisterVersion = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const video = await ownVideoOr404(req, res, submission); if (!video) return;
        const cfg = await readVideoConfig(submission.eventId);
        if (!canReplace({ status: video.status, cfg })) return res.status(409).json({ error: `El video está «${statusMeta(video.status).label}»: no admite otro archivo.` });
        const storageKey = clean(req.body?.storageKey, 400);
        const fileName = clean(req.body?.filename, 200);
        if (!videoKeyBelongs(storageKey, video.id)) return res.status(400).json({ error: 'El archivo no pertenece a este video.' });
        if ((await db.query('SELECT 1 FROM "ProjectVideoVersion" WHERE "storageKey" = $1', [storageKey])).rows[0]) return res.status(409).json({ error: 'Ese archivo ya está registrado.' });
        let inspected;
        try { inspected = await inspectProjectVideoObject(storageKey); }
        catch (e) { console.error('[project-videos] no pude leer el objeto:', e?.message); return res.status(422).json({ error: 'No encontramos el archivo subido. Vuelve a intentarlo.' }); }
        const juicio = judgeUploadedVideo({ filename: fileName, bytes: inspected.bytes, head: inspected.head, cfg });
        if (!juicio.ok) { await deleteProjectVideoObject(storageKey); return res.status(422).json({ error: juicio.error }); }
        const width = Number(req.body?.width) > 0 ? Math.round(Number(req.body.width)) : null;
        const height = Number(req.body?.height) > 0 ? Math.round(Number(req.body.height)) : null;
        const durationSec = Number(req.body?.durationSec) > 0 ? Math.round(Number(req.body.durationSec) * 100) / 100 : null;
        const warnings = videoWarnings({ width, height, durationSec, cfg });
        const actor = participantActor(account, submission);
        let version = null;
        for (let i = 0; i < 2 && !version; i++) {
            try {
                const { rows } = await db.query(`INSERT INTO "ProjectVideoVersion" ("videoId", "versionNumber", "storageKey", "fileName", format, "contentType", "sizeBytes", width, height, "durationSec", warnings, "uploadedById", "uploadedByName", "uploadedByRole")
                    SELECT $1, COALESCE(MAX("versionNumber"), 0) + 1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13 FROM "ProjectVideoVersion" WHERE "videoId" = $1 RETURNING *`,
                    [video.id, storageKey, fileName, juicio.format, juicio.contentType, inspected.bytes, width, height, durationSec, JSON.stringify(warnings), actor.id, actor.name, actor.role]);
                version = rows[0];
            } catch (e) { if (e?.code !== '23505' || i === 1) throw e; }
        }
        const previousId = video.currentVersionId;
        await db.query('UPDATE "ProjectVideo" SET "currentVersionId" = $2, "lastEditedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1', [video.id, version.id]);
        await logPvEvent(video.id, {
            type: previousId ? 'version_replaced' : 'version_uploaded',
            title: previousId ? `Video reemplazado (versión ${version.versionNumber})` : 'Video cargado',
            detail: `${fileName} · ${FORMATS[juicio.format].label} · ${fmtBytes(inspected.bytes)}${durationSec ? ` · ${fmtDuration(durationSec)}` : ''}${warnings.length ? ` · ${warnings.length} advertencia(s)` : ''}`,
            metadata: { versionId: version.id, versionNumber: Number(version.versionNumber), previousVersionId: previousId, warnings }, actor,
        });
        // Un video aprobado que se reemplaza (política «siempre») vuelve a revisión: lo aprobado fue OTRO archivo.
        let fresh = await loadVideo(video.id);
        if (fresh.status === 'approved' && cfg.replacementPolicy === 'always') {
            fresh = await applyStatus({ video: fresh, submission, cfg: await readConfigForSubmission(submission.eventId || null), to: 'in_review', actor, note: 'Nueva versión del archivo: vuelve a revisión.' });
        }
        res.status(201).json({ ok: true, video: shapeVideo(fresh, version), version: shapeVersion(version, version.id) });
    } catch (error) { console.error('[project-videos] portalRegisterVersion:', error); res.status(500).json({ error: 'No pudimos registrar el video.' }); }
};

// POST /portal/project-video/:id/submit — enviar a revisión (o reenviar tras correcciones / retiro).
export const portalSubmit = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const video = await ownVideoOr404(req, res, submission); if (!video) return;
        const cfg = await readVideoConfig(submission.eventId);
        if (req.body?.consentAccepted === true && !video.consentAccepted) {
            await db.query('UPDATE "ProjectVideo" SET "consentAccepted" = TRUE, "consentVersion" = $2, "consentText" = $3, "consentAt" = NOW() WHERE id = $1', [video.id, consentVersionOf(cfg.consentText), cfg.consentText]);
            await logPvEvent(video.id, { type: 'consent_accepted', title: 'Autorización de uso del material aceptada', metadata: { consentVersion: consentVersionOf(cfg.consentText) }, actor: participantActor(account, submission) });
        }
        const fresh = await loadVideo(video.id);
        const verdict = validateForSubmit({ meta: fresh, hasVersion: Boolean(fresh.currentVersionId), consentAccepted: fresh.consentAccepted, cfg });
        if (!verdict.ok) return res.status(400).json({ error: 'Faltan datos para enviar el video a revisión.', errors: verdict.errors });
        if (fresh.status === 'received' || fresh.status === 'in_review') return res.status(409).json({ error: 'El video ya está en manos del comité.' });
        const fairCfg = await readConfigForSubmission(submission.eventId || null);
        // Con flujo «sólo registrar», el comité no revisa: queda aprobado al recibirse.
        let updated = await applyStatus({ video: fresh, submission, cfg: fairCfg, to: 'received', actor: participantActor(account, submission), actorKind: 'participant' });
        if (cfg.reviewFlow === 'auto_receive') updated = await applyStatus({ video: updated, submission, cfg: fairCfg, to: 'approved', actor: { id: null, name: 'Sistema', role: 'system' }, note: 'Recepción sin revisión del comité (configuración de la edición).' });
        res.json({ ok: true, status: updated.status, video: shapeVideo(updated, await currentVersionOf(updated)) });
    } catch (error) {
        if (error?.code === 409 || error?.code === 400) return res.status(error.code).json({ error: error.message });
        console.error('[project-videos] portalSubmit:', error); res.status(500).json({ error: 'No pudimos enviar el video.' });
    }
};

// POST /portal/project-video/:id/withdraw
export const portalWithdraw = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const video = await ownVideoOr404(req, res, submission); if (!video) return;
        const updated = await applyStatus({ video, submission, cfg: await readConfigForSubmission(submission.eventId || null), to: 'withdrawn', actor: participantActor(account, submission), actorKind: 'participant', note: clean(req.body?.note, 500) || null });
        res.json({ ok: true, status: updated.status });
    } catch (error) {
        if (error?.code === 409 || error?.code === 400) return res.status(error.code).json({ error: error.message });
        console.error('[project-videos] portalWithdraw:', error); res.status(500).json({ error: 'No pudimos retirar el video.' });
    }
};

// GET /portal/project-video/:id/url?version=&download=1
export const portalUrl = async (req, res) => {
    try {
        await ensureAll();
        const { submission } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const video = await ownVideoOr404(req, res, submission); if (!video) return;
        const version = req.query.version ? await loadVersion(video.id, clean(req.query.version, 60)) : await currentVersionOf(video);
        if (!version) return res.status(404).json({ error: 'Todavía no hay archivo.' });
        if (!(await projectVideoObjectExists(version.storageKey))) return res.status(503).json({ error: 'El archivo no está disponible en el almacenamiento.' });
        const url = await signedProjectVideoUrl(version.storageKey, { fileName: version.fileName, contentType: version.contentType, disposition: req.query.download === '1' ? 'attachment' : 'inline' });
        res.json({ url, fileName: version.fileName, contentType: version.contentType });
    } catch (error) { console.error('[project-videos] portalUrl:', error); res.status(500).json({ error: 'No pudimos abrir el video.' }); }
};

// ════════════════════════════════════════════════════════════════════
// ADMINISTRACIÓN
// ════════════════════════════════════════════════════════════════════
const withSchema = (handler, capability) => withAccess(async (req, res, ctx) => { await ensureProjectVideoSchema(); return handler(req, res, ctx); }, capability);

const LIST_SELECT = `
    SELECT v.*, s."publicRef", s."projectName", s."clubName", s.district, s.email, s."firstName", s."lastName", s."workflowStatus", s."archivedAt",
           cv."fileName" AS "cvFileName", cv."durationSec" AS "cvDuration", cv."sizeBytes" AS "cvSize", cv.format AS "cvFormat", cv."versionNumber" AS "cvNumber",
           (SELECT COUNT(*) FROM "ProjectVideoVersion" x WHERE x."videoId" = v.id)::int AS "versionCount"
    FROM "ProjectVideo" v
    JOIN "ProjectFairSubmission" s ON s.id = v."submissionId"
    LEFT JOIN "ProjectVideoVersion" cv ON cv.id = v."currentVersionId"`;
const shapeRow = (r) => ({
    id: r.id, submissionId: r.submissionId, publicRef: r.publicRef, projectName: r.projectName, clubName: r.clubName, district: r.district,
    responsible: [r.firstName, r.lastName].filter(Boolean).join(' '), email: r.email,
    status: r.status, statusLabel: statusMeta(r.status).label, statusTone: statusMeta(r.status).tone, title: r.title || '',
    fileName: r.cvFileName || null, durationSec: r.cvDuration === null || r.cvDuration === undefined ? null : Number(r.cvDuration), durationLabel: r.cvDuration ? fmtDuration(r.cvDuration) : null,
    sizeLabel: r.cvSize ? fmtBytes(r.cvSize) : null, format: r.cvFormat || null, versionCount: Number(r.versionCount) || 0, versionNumber: r.cvNumber ? Number(r.cvNumber) : null,
    hasFile: Boolean(r.currentVersionId), consentAccepted: Boolean(r.consentAccepted),
    projectStateLabel: r.archivedAt ? 'Archivada' : projectStateMeta(projectStateOf(r)).label,
    submittedAt: r.submittedAt, reviewedAt: r.reviewedAt, approvedAt: r.approvedAt, updatedAt: r.updatedAt, createdAt: r.createdAt,
});
const listRows = async (query) => {
    const params = []; const cond = ["v.status <> 'draft'"];
    const add = (sql, v) => { params.push(v); cond.push(sql.split('$?').join(`$${params.length}`)); };
    const evento = clean(query.evento, 60); if (evento) add('v."eventId" = $?', evento);
    if (query.includeDrafts === '1') cond.shift();
    const status = clean(query.status, 40); if (status && isStatus(status)) add('v.status = $?', status);
    const district = clean(query.district, 120); if (district) add('s.district = $?', district);
    const q = clean(query.q, 120).toLowerCase();
    if (q) add(`(LOWER(s."projectName") LIKE $? OR LOWER(s."clubName") LIKE $? OR LOWER(COALESCE(s.district,'')) LIKE $? OR LOWER(s.email) LIKE $? OR LOWER(COALESCE(v.title,'')) LIKE $? OR LOWER(COALESCE(s."publicRef",'')) LIKE $?)`, `%${q}%`);
    const sortCol = { updatedAt: 'v."updatedAt"', submittedAt: 'v."submittedAt"', status: 'v.status', projectName: 's."projectName"', clubName: 's."clubName"', district: 's.district' }[clean(query.sort, 30)] || 'v."updatedAt"';
    const dir = clean(query.dir, 4).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const { rows } = await db.query(`${LIST_SELECT} WHERE ${cond.join(' AND ')} ORDER BY ${sortCol} ${dir} NULLS LAST, v."createdAt" DESC`, params);
    return rows.map(shapeRow);
};

// GET /admin/project-videos?evento=&q=&status=&district=&sort=&dir=&page=&pageSize=
export const adminList = withSchema(async (req, res, { access }) => {
    const all = await listRows(req.query);
    const base = await listRows({ evento: req.query.evento });
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));
    res.json({
        rows: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize,
        kpis: summarize(base),
        filters: { statuses: STATUSES.filter(s => !['none', 'draft'].includes(s.key)), districts: [...new Set(base.map(r => r.district).filter(Boolean))].sort() },
        access: { view: !!access.view, manage: !!access.changeStatus, config: !!access.config, comment: !!access.comment },
    });
}, 'view');

const adminCtx = async (req, res) => {
    const video = await loadVideo(clean(req.params.id, 60));
    if (!video) { res.status(404).json({ error: 'Video no encontrado.' }); return null; }
    const submission = await loadSubmission(video.submissionId);
    if (!submission) { res.status(404).json({ error: 'La postulación de este video ya no existe.' }); return null; }
    return { video, submission };
};
const detailOf = async (video, submission, access) => {
    const [versions, events, notifications, cfg] = await Promise.all([loadVersions(video.id), loadEvents(video.id), db.query('SELECT kind, recipient, status, error, "createdAt" FROM "ProjectVideoNotification" WHERE "videoId" = $1 ORDER BY "createdAt" DESC', [video.id]).then(r => r.rows), readVideoConfig(submission.eventId)]);
    return {
        video: shapeVideo(video, versions.find(v => v.id === video.currentVersionId) || null),
        submission: { id: submission.id, publicRef: submission.publicRef, projectName: submission.projectName, clubName: submission.clubName, district: submission.district, responsible: [submission.firstName, submission.lastName].filter(Boolean).join(' '), email: submission.email, phone: submission.phone || null, projectStateLabel: submission.archivedAt ? 'Archivada' : projectStateMeta(projectStateOf(submission)).label },
        versions: versions.map(v => shapeVersion(v, video.currentVersionId)), events, notifications,
        allowedTransitions: (ADMIN_TRANSITIONS[video.status] || []).map(k => ({ key: k, label: statusMeta(k).label, needsNote: ['changes_requested', 'rejected'].includes(k) })),
        config: cfg, access: { view: !!access.view, manage: !!access.changeStatus, config: !!access.config, comment: !!access.comment },
    };
};

// GET /admin/project-videos/:id
export const adminGet = withSchema(async (req, res, { access }) => { const c = await adminCtx(req, res); if (!c) return; res.json(await detailOf(c.video, c.submission, access)); }, 'view');

// POST /admin/project-videos/:id/status — { status, note }
export const adminSetStatus = withSchema(async (req, res, { access }) => {
    const c = await adminCtx(req, res); if (!c) return;
    const to = clean(req.body?.status, 40); const note = clean(req.body?.note, 2000) || null;
    if (['changes_requested', 'rejected'].includes(to) && !note) return res.status(400).json({ error: 'Indica el motivo: el club lo verá en su perfil.' });
    try { await applyStatus({ video: c.video, submission: c.submission, cfg: await readConfigForSubmission(c.submission.eventId || null), to, actor: actorFrom(req, access), note }); }
    catch (e) { if (e?.code === 409 || e?.code === 400) return res.status(e.code).json({ error: e.message }); throw e; }
    res.json(await detailOf(await loadVideo(c.video.id), c.submission, access));
}, 'changeStatus');

// PATCH /admin/project-videos/:id — notas internas
export const adminUpdate = withSchema(async (req, res, { access }) => {
    const c = await adminCtx(req, res); if (!c) return;
    if (req.body?.adminNotes !== undefined) await db.query('UPDATE "ProjectVideo" SET "adminNotes" = $2, "updatedAt" = NOW() WHERE id = $1', [c.video.id, clean(req.body.adminNotes, 4000) || null]);
    res.json(await detailOf(await loadVideo(c.video.id), c.submission, access));
}, 'changeStatus');

// POST /admin/project-videos/:id/comments — { text, internal }
export const adminComment = withSchema(async (req, res, { access }) => {
    const c = await adminCtx(req, res); if (!c) return;
    const text = clean(req.body?.text, 2000); if (!text) return res.status(400).json({ error: 'Escribe la observación.' });
    const internal = req.body?.internal !== false;
    const ev = await logPvEvent(c.video.id, { type: internal ? 'internal_note' : 'message', title: internal ? 'Nota interna' : 'Observación del comité', detail: text, actor: actorFrom(req, access), visibility: internal ? 'internal' : 'all' });
    res.status(201).json({ ok: true, event: ev });
}, 'comment');

// GET /admin/project-videos/:id/versions/:versionId/url?download=1
export const adminUrl = withSchema(async (req, res, { access }) => {
    const c = await adminCtx(req, res); if (!c) return;
    const version = await loadVersion(c.video.id, clean(req.params.versionId, 60));
    if (!version) return res.status(404).json({ error: 'Versión no encontrada.' });
    if (!(await projectVideoObjectExists(version.storageKey))) return res.status(503).json({ error: 'El archivo no está disponible en el almacenamiento.' });
    const download = req.query.download === '1';
    if (download) await logPvEvent(c.video.id, { type: 'admin_download', title: `Versión ${version.versionNumber} descargada por el comité`, actor: actorFrom(req, access), visibility: 'internal' });
    res.json({ url: await signedProjectVideoUrl(version.storageKey, { fileName: version.fileName, contentType: version.contentType, disposition: download ? 'attachment' : 'inline' }) });
}, 'view');

// GET /admin/project-videos/config?evento=
export const adminGetConfig = withSchema(async (req, res, { access }) => {
    const scope = scopeOf(req.query.evento);
    const { rows } = await db.query('SELECT scope, config, "updatedAt", "updatedBy" FROM "ProjectVideoConfig" WHERE scope = $1', [scope]);
    res.json({ scope, config: await readVideoConfig(req.query.evento), own: Boolean(rows[0]), updatedAt: rows[0]?.updatedAt || null, updatedBy: rows[0]?.updatedBy || null, formats: Object.entries(FORMATS).map(([key, f]) => ({ key, label: f.label })), replacementPolicies: REPLACEMENT_POLICIES, access: { config: !!access.config } });
}, 'view');

// PUT /admin/project-videos/config?evento=
export const adminSaveConfig = withSchema(async (req, res, { access }) => {
    const scope = scopeOf(req.query.evento);
    const cfg = normalizeConfig(req.body || {});
    const actor = actorFrom(req, access);
    await db.query(`INSERT INTO "ProjectVideoConfig" (scope, config, "updatedBy") VALUES ($1, $2::jsonb, $3) ON CONFLICT (scope) DO UPDATE SET config = EXCLUDED.config, "updatedAt" = NOW(), "updatedBy" = EXCLUDED."updatedBy"`, [scope, JSON.stringify(cfg), actor.name]);
    await db.query(`INSERT INTO "ProjectVideoEvent" ("videoId", type, title, metadata, "actorId", "actorName", "actorRole", visibility) VALUES ('config', 'config_saved', $1, $2::jsonb, $3, $4, $5, 'internal')`, [`Configuración de videos propios guardada (${scope})`, JSON.stringify(cfg), actor.id, actor.name, actor.role]);
    res.json({ scope, config: cfg });
}, 'config');

export default { readVideoConfig, portalGet, portalSave, portalPresign, portalRegisterVersion, portalSubmit, portalWithdraw, portalUrl, adminList, adminGet, adminSetStatus, adminUpdate, adminComment, adminUrl, adminGetConfig, adminSaveConfig };
