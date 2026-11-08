// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — solicitudes, guiones y producción (v4.1293.0)
// Feria de Proyectos Rotary Colombia
//
// Un club que postuló un proyecto pide desde «Mi proyecto» un video de
// presentación para movilizar apoyo (donantes, clubes patrocinadores,
// distritos, fundaciones, aliados). El comité lo gestiona desde la pestaña
// «Video Pitch» de Postulación de Proyectos.
//
//   Participante (/mi-proyecto → tarjeta «Video Pitch Profesional»)
//     abre el formulario PRECARGADO (nombre, correo, teléfono, club, distrito
//     y proyecto salen del token y de la postulación; las preguntas guiadas se
//     sugieren desde la Formulación) → adjunta fotos, videos y PDF (PUT
//     prefirmado a S3, validado después por sus bytes) → guarda solo → envía
//     → sigue el estado → aprueba o pide ajustes al guion → ve el video.
//
//   Comité (Postulación de Proyectos → Video Pitch)
//     bandeja con indicadores, filtros y acciones en bloque → ficha con el
//     proyecto, la galería, el historial → genera el guion con IA sobre el
//     EXPEDIENTE real, lo edita, versiona, compara y aprueba → sube el video
//     final → entrega.
//
// ⚠️ EL ESTADO SÓLO CAMBIA POR `applyStatus`: valida la transición
// (`videoPitchSpec.js`), exige lo que el destino necesita (guion aprobado para
// producir, video para entregar), escribe el historial y avisa UNA vez por
// cambio. Nadie escribe `status` en otro sitio.
//
// ⚠️ INDEPENDIENTE DE LAS POSTULACIONES Y DE LOS FORMULARIOS. Lo único que
// escribe fuera de sus tablas son dos entradas en el historial de la
// postulación (`video_pitch_requested`, `video_pitch_delivered`). Nunca toca
// el pago, `workflowStatus` ni los formularios del proyecto.
//
// Permisos: los del módulo (`withAccess`). Ver → 'view'; comentar → 'comment';
// cambiar estado, asignar, guiones y archivos → 'changeStatus'; exportar →
// 'export'.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import { ensureTables, logEvent, readConfigForSubmission, portalLinkFor, sendFairEmail } from './projectFairController.js';
import { withAccess, actorFrom } from './projectFairAdminController.js';
import { isApplied, projectStateOf, projectStateMeta } from '../lib/projectFairLifecycle.js';
import { ensureVideoPitchSchema } from '../lib/ensureVideoPitchSchema.js';
import {
    STATUSES, statusMeta, isStatus, canTransition, participantCanEdit, bulkStatusAllowed, transitionRequirements,
    ADMIN_TRANSITIONS, PARTICIPANT_TRANSITIONS, summarizeRequests, LANGUAGES, OBJECTIVES, TONES, GUIDED_QUESTIONS, CONTEXT_TOPICS,
    DESCRIPTION_MIN, normalizeAnswers, lockedIdentity, prefillFrom, projectContextOf, completionOf, validateForSubmit,
    FILE_KINDS, FILE_ROLES, MAX_FILES_PER_REQUEST, ACCEPTED_EXTENSIONS, maxMbFor, checkUploadMeta, judgeUploadedFile,
    qualityWarnings, fmtBytes, MATERIAL_TIPS, TARGET_SECONDS_DEFAULT, TARGET_SECONDS_MAX, clampTargetSeconds,
    SCENE_PLAN, normalizeScript, narrationFits, notificationFor, requestNumber, normalizeSort, requestsCsv,
} from '../lib/videoPitchSpec.js';
import {
    presignVideoPitchUpload, inspectVideoPitchObject, storageKeyBelongs, videoPitchObjectExists, signedVideoPitchUrl,
    deleteVideoPitchObject,
} from '../lib/videoPitchStorage.js';
import { buildDossier, generateVideoPitchScript, auditScript } from '../lib/videoPitchAI.js';
import { productionGate, commercialMeta, cardCopyOf } from '../lib/videoPitchCommerce.js';

// La capa comercial vive en su propio controlador y nos importa a nosotros: se
// carga perezosamente para que el ciclo de importación no evalúe nada a medias.
const commerce = async () => import('./videoPitchCommerceController.js');

console.log('[videoPitchController] v4.1296.0 cargado — Video Pitch Profesional: solicitud precargada con materiales, planes y pago por Stripe (o pagar después), bandeja administrativa, guiones con IA sobre hechos verificados, aprobación, producción y entrega auditadas.');

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const refOf = (id) => String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ensureAll = async () => { await ensureTables(); await ensureVideoPitchSchema(); };

// ── Lectura ──────────────────────────────────────────────────────────
export const loadRequest = async (id) => {
    const { rows } = await db.query('SELECT * FROM "VideoPitchRequest" WHERE id = $1 LIMIT 1', [id]);
    return rows[0] || null;
};
const loadRequestBySubmission = async (submissionId) => {
    const { rows } = await db.query('SELECT * FROM "VideoPitchRequest" WHERE "submissionId" = $1 LIMIT 1', [submissionId]);
    return rows[0] || null;
};
export const loadSubmission = async (id) => {
    const { rows } = await db.query(`
        SELECT id, "publicRef", "eventId", "firstName", "lastName", email, phone, "clubName", district, "projectName",
               "projectDescription", "focusArea", "focusAreaLabel", "budgetUsd", status, "workflowStatus", "archivedAt", metadata, "createdAt"
        FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] || null;
};
export const loadMasterAnswers = async (submissionId) => {
    try {
        const { rows } = await db.query('SELECT answers FROM "ProjectFairMasterForm" WHERE "submissionId" = $1 LIMIT 1', [submissionId]);
        return rows[0]?.answers || null;
    } catch { return null; }
};
export const loadFiles = async (requestId, { includeDeleted = false } = {}) => {
    const { rows } = await db.query(
        `SELECT * FROM "VideoPitchFile" WHERE "requestId" = $1 ${includeDeleted ? '' : 'AND "deletedAt" IS NULL'} ORDER BY "createdAt" ASC`, [requestId]);
    return rows;
};
const loadScripts = async (requestId) => {
    const { rows } = await db.query('SELECT * FROM "VideoPitchScript" WHERE "requestId" = $1 ORDER BY "versionNumber" DESC', [requestId]);
    return rows;
};
const loadScript = async (requestId, scriptId) => {
    const { rows } = await db.query('SELECT * FROM "VideoPitchScript" WHERE id = $1 AND "requestId" = $2 LIMIT 1', [scriptId, requestId]);
    return rows[0] || null;
};
const loadEvents = async (requestId, { participant = false } = {}) => {
    const { rows } = await db.query(
        `SELECT id, type, title, detail, metadata, "actorName", "actorRole", visibility, "createdAt" FROM "VideoPitchEvent"
         WHERE "requestId" = $1 ${participant ? "AND visibility = 'all'" : ''} ORDER BY "createdAt" DESC LIMIT 200`, [requestId]);
    return rows;
};

export const logVpEvent = async (requestId, { type, title, detail = null, metadata = {}, actor = null, visibility = 'all' }) => {
    try {
        const { rows } = await db.query(`
            INSERT INTO "VideoPitchEvent" ("requestId", type, title, detail, metadata, "actorId", "actorName", "actorRole", visibility)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) RETURNING *
        `, [requestId, type, title, detail, JSON.stringify(metadata || {}), actor?.id || null, actor?.name || null, actor?.role || null, visibility]);
        return rows[0];
    } catch (err) {
        console.warn('[video-pitch] no pude registrar el evento:', err?.message);
        return null;
    }
};

// ── Forma de salida ──────────────────────────────────────────────────
const shapeFile = (f) => ({
    id: f.id, role: f.role, kind: f.kind, kindLabel: FILE_KINDS[f.kind]?.label || f.kind,
    fileName: f.fileName, contentType: f.contentType, sizeBytes: Number(f.sizeBytes) || 0, sizeLabel: fmtBytes(f.sizeBytes),
    width: f.width || null, height: f.height || null, durationSec: f.durationSec === null || f.durationSec === undefined ? null : Number(f.durationSec),
    warnings: Array.isArray(f.warnings) ? f.warnings : [], caption: f.caption || '',
    uploadedBy: f.uploadedByName || null, uploadedByRole: f.uploadedByRole || null, createdAt: f.createdAt, deletedAt: f.deletedAt || null,
});
const shapeScript = (s, request, { withContent = true } = {}) => ({
    id: s.id, versionNumber: Number(s.versionNumber), source: s.source, status: s.status,
    language: s.language, tone: s.tone, targetSeconds: s.targetSeconds, instructions: s.instructions || '',
    provider: s.provider || null, model: s.model || null, basedOnId: s.basedOnId || null,
    createdBy: s.createdByName || null, createdAt: s.createdAt,
    current: request?.currentScriptId === s.id, approved: request?.approvedScriptId === s.id,
    totalSeconds: Number(s.content?.totalSeconds) || 0,
    missingInfoCount: Array.isArray(s.content?.missingInfo) ? s.content.missingInfo.length : 0,
    ...(withContent ? { content: s.content || {} } : {}),
});
const shapeRequest = (r, submission) => ({
    id: r.id, number: r.number || null, status: r.status, statusLabel: statusMeta(r.status).label, statusTone: statusMeta(r.status).tone,
    stage: statusMeta(r.status).stage, terminal: statusMeta(r.status).terminal,
    submissionId: r.submissionId, eventId: r.eventId || null,
    answers: normalizeAnswers(r.answers), completionPct: Number(r.completionPct) || 0,
    assigneeId: r.assigneeId || null, assigneeName: r.assigneeName || null,
    currentScriptId: r.currentScriptId || null, approvedScriptId: r.approvedScriptId || null,
    deliverableFileId: r.deliverableFileId || null, thumbnailFileId: r.thumbnailFileId || null,
    infoRequest: r.infoRequest || null, adminNotes: r.adminNotes || null,
    commercialStatus: r.commercialStatus || 'no_plan', planId: r.planId || null, currentOrderId: r.currentOrderId || null,
    paymentWaived: Boolean(r.paymentWaived), paymentWaivedNote: r.paymentWaivedNote || null, paymentWaivedBy: r.paymentWaivedBy || null,
    submittedAt: r.submittedAt, deliveredAt: r.deliveredAt, lastEditedAt: r.lastEditedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
    identity: lockedIdentity(submission),
});

const CATALOG = {
    statuses: STATUSES, languages: LANGUAGES, objectives: OBJECTIVES, tones: TONES, guidedQuestions: GUIDED_QUESTIONS, contextTopics: CONTEXT_TOPICS,
    descriptionMin: DESCRIPTION_MIN, accept: ACCEPTED_EXTENSIONS.join(','), maxFiles: MAX_FILES_PER_REQUEST,
    limits: Object.fromEntries(Object.keys(FILE_KINDS).map(k => [k, maxMbFor(k)])), tips: MATERIAL_TIPS,
    scenePlan: SCENE_PLAN, targetSecondsDefault: TARGET_SECONDS_DEFAULT, targetSecondsMax: TARGET_SECONDS_MAX,
};

// ── Notificaciones ───────────────────────────────────────────────────
const statusMailHtml = ({ request, submission, cfg, status, note }) => {
    const primary = '#17458F';
    const edition = cfg?.edition?.name || 'Feria de Proyectos Rotary Colombia';
    const link = `${portalLinkFor(submission, cfg)}?videoPitch=1`;
    const name = [submission.firstName, submission.lastName].filter(Boolean).join(' ') || 'equipo del proyecto';
    const body = {
        submitted: `Recibimos la solicitud de <strong>Video Pitch Profesional</strong> para el proyecto <strong>«${esc(submission.projectName)}»</strong>${request.number ? ` con el número <strong>${esc(request.number)}</strong>` : ''}. El comité la revisará y te avisaremos de cada avance desde tu perfil.`,
        info_required: `Para avanzar con tu Video Pitch necesitamos información o materiales adicionales:${note ? `<br><br><em>${esc(note)}</em>` : ''}<br><br>Entra a tu perfil, completa lo que falta y vuelve a enviar la solicitud.`,
        script_pending_approval: `El guion de tu Video Pitch está listo. Léelo en tu perfil y apruébalo o pide los ajustes que consideres: el video no se produce hasta que el guion esté aprobado.`,
        script_approved: `El guion de tu Video Pitch quedó aprobado. El siguiente paso es la producción del video.`,
        in_production: `Tu Video Pitch entró en producción. Te avisaremos cuando esté terminado.`,
        finished: `La producción de tu Video Pitch terminó y está en revisión final del comité. Pronto estará disponible en tu perfil.`,
        delivered: `Tu Video Pitch Profesional ya está disponible. Entra a tu perfil para verlo y compartirlo con potenciales aliados y donantes.`,
    }[status] || '';
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:620px;margin:0 auto;padding:24px 0">
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:${primary};color:#fff;padding:26px 32px">
      <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Video Pitch Profesional</div>
      <div style="font-size:18px;font-weight:700">${esc(edition)}</div>
    </div>
    <div style="padding:30px 32px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hola, ${esc(name)}:</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${body}</p>
      <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:${primary};color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">Ver mi solicitud</a></p>
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0">Proyecto: ${esc(submission.projectName)} · ${esc(submission.clubName)} · ${esc(submission.district)}${request.number ? ` · Solicitud ${esc(request.number)}` : ''}</p>
    </div>
  </div>
</div>`;
};

/**
 * Un aviso por cambio: la clave (solicitud, tipo:evento) es única, así que si
 * dos peticiones aplican el mismo cambio a la vez sale UN correo.
 */
const notifyParticipant = async ({ request, submission, cfg, status, eventId, note = null }) => {
    const spec = notificationFor(status);
    if (!spec || !submission?.email) return;
    const dedupeKey = `${spec.kind}:${eventId || 'manual'}`;
    const inserted = await db.query(`
        INSERT INTO "VideoPitchNotification" ("requestId", kind, "dedupeKey", channel, recipient, status)
        VALUES ($1, $2, $3, 'email', $4, 'pending') ON CONFLICT ("requestId", "dedupeKey") DO NOTHING RETURNING id
    `, [request.id, spec.kind, dedupeKey, submission.email]).catch(() => ({ rows: [] }));
    const notifId = inserted.rows[0]?.id;
    if (!notifId) return;
    try {
        const result = await sendFairEmail({
            to: submission.email,
            subject: `${spec.subject} — ${cfg?.edition?.name || 'Feria de Proyectos Rotary Colombia'}`,
            html: statusMailHtml({ request, submission, cfg, status, note }),
            cfg,
        });
        await db.query('UPDATE "VideoPitchNotification" SET status = $2, error = $3 WHERE id = $1',
            [notifId, result?.success ? 'sent' : 'failed', result?.success ? null : clean(result?.error, 500) || 'sin detalle']);
    } catch (e) {
        await db.query('UPDATE "VideoPitchNotification" SET status = $2, error = $3 WHERE id = $1', [notifId, 'failed', clean(e?.message, 500)]).catch(() => {});
    }
};

export const systemActor = (name = 'Sistema') => ({ id: null, name, role: 'system' });

/** Avisos COMERCIALES al club (pendiente de pago, pago confirmado, pago fallido): misma deduplicación por clave. */
const COMMERCIAL_MAIL = {
    pending_payment: { subject: 'Tu solicitud de Video Pitch está guardada: falta el pago', body: ({ request, order }) => `Guardamos tu solicitud de <strong>Video Pitch Profesional</strong>${request.number ? ` (${esc(request.number)})` : ''} con el plan <strong>${esc(order?.planName || '')}</strong>${order ? ` por <strong>${esc(order.amountLabel || '')}</strong>` : ''}. Tus datos y materiales quedan guardados: cuando estés listo, entra a tu perfil y completa el pago. La producción empieza con el pago confirmado y los materiales necesarios.` },
    payment_confirmed: { subject: 'Pago confirmado: tu Video Pitch entra en revisión', body: ({ order }) => `Recibimos tu pago del plan <strong>${esc(order?.planName || '')}</strong>${order ? ` (${esc(order.amountLabel || '')})` : ''}. Tu solicitud quedó enviada al comité, que revisará la información de tu proyecto y te avisará de cada avance. El comprobante de pago está disponible en tu perfil.` },
    payment_failed: { subject: 'El pago de tu Video Pitch no se completó', body: () => `El pago no se pudo procesar. Tu solicitud y tus materiales siguen guardados: entra a tu perfil e intenta pagar de nuevo cuando quieras.` },
};
export const notifyParticipantKind = async ({ request, submission, cfg, kind, eventKey }) => {
    const spec = COMMERCIAL_MAIL[kind];
    if (!spec || !submission?.email) return;
    const dedupeKey = `${kind}:${eventKey || 'manual'}`;
    const inserted = await db.query(`
        INSERT INTO "VideoPitchNotification" ("requestId", kind, "dedupeKey", channel, recipient, status)
        VALUES ($1, $2, $3, 'email', $4, 'pending') ON CONFLICT ("requestId", "dedupeKey") DO NOTHING RETURNING id
    `, [request.id, kind, dedupeKey, submission.email]).catch(() => ({ rows: [] }));
    const notifId = inserted.rows[0]?.id;
    if (!notifId) return;
    const { shapeOrder, currentOrderOf } = await commerce();
    const order = shapeOrder(await currentOrderOf(request));
    const primary = '#17458F';
    const edition = cfg?.edition?.name || 'Feria de Proyectos Rotary Colombia';
    const link = `${portalLinkFor(submission, cfg)}?videoPitch=1`;
    const name = [submission.firstName, submission.lastName].filter(Boolean).join(' ') || 'equipo del proyecto';
    // Nada sensible del pago viaja por correo: ni tarjeta, ni referencias de Stripe.
    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:620px;margin:0 auto;padding:24px 0">
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:${primary};color:#fff;padding:26px 32px"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Video Pitch Profesional</div><div style="font-size:18px;font-weight:700">${esc(edition)}</div></div>
    <div style="padding:30px 32px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hola, ${esc(name)}:</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${spec.body({ request, order })}</p>
      <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:${primary};color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">Ir a mi solicitud</a></p>
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0">Proyecto: ${esc(submission.projectName)} · ${esc(submission.clubName)} · ${esc(submission.district)}</p>
    </div>
  </div>
</div>`;
    try {
        const result = await sendFairEmail({ to: submission.email, subject: `${spec.subject} — ${edition}`, html, cfg });
        await db.query('UPDATE "VideoPitchNotification" SET status = $2, error = $3 WHERE id = $1', [notifId, result?.success ? 'sent' : 'failed', result?.success ? null : clean(result?.error, 500) || 'sin detalle']);
    } catch (e) {
        await db.query('UPDATE "VideoPitchNotification" SET status = $2, error = $3 WHERE id = $1', [notifId, 'failed', clean(e?.message, 500)]).catch(() => {});
    }
};

const notifyAdmins = async ({ request, submission, cfg, eventId }) => {
    const emails = Array.isArray(cfg?.notifications?.adminEmails) ? cfg.notifications.adminEmails.filter(Boolean) : [];
    if (!emails.length) return;
    const dedupeKey = `admin_new:${eventId || 'manual'}`;
    const inserted = await db.query(`
        INSERT INTO "VideoPitchNotification" ("requestId", kind, "dedupeKey", channel, recipient, status)
        VALUES ($1, 'admin_new', $2, 'email', $3, 'pending') ON CONFLICT ("requestId", "dedupeKey") DO NOTHING RETURNING id
    `, [request.id, dedupeKey, emails.join(',')]).catch(() => ({ rows: [] }));
    const notifId = inserted.rows[0]?.id;
    if (!notifId) return;
    const html = `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto">
  <h2 style="color:#17458F">Nueva solicitud de Video Pitch ${esc(request.number || '')}</h2>
  <p><strong>Proyecto:</strong> ${esc(submission.projectName)}<br><strong>Club:</strong> ${esc(submission.clubName)} · ${esc(submission.district)}<br><strong>Responsable:</strong> ${esc(request.answers?.identification?.responsibleName || '')} · ${esc(request.answers?.identification?.email || submission.email)}</p>
  <p>Revísala en Postulación de Proyectos → Video Pitch.</p></div>`;
    const result = await sendFairEmail({ to: emails, subject: `Nueva solicitud de Video Pitch ${request.number || ''} — ${submission.projectName}`, html, cfg }).catch(e => ({ success: false, error: e?.message }));
    await db.query('UPDATE "VideoPitchNotification" SET status = $2, error = $3 WHERE id = $1',
        [notifId, result?.success ? 'sent' : 'failed', result?.success ? null : clean(result?.error, 500)]).catch(() => {});
};

// ── El cambio de estado, en UN solo sitio ────────────────────────────
const nextNumber = async () => {
    const year = new Date().getFullYear();
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM "VideoPitchRequest" WHERE number LIKE $1`, [`VP-${year}-%`]);
    return requestNumber(year, (rows[0]?.n || 0) + 1);
};

/**
 * Aplica una transición. `actorKind` decide qué tabla de transiciones manda.
 * Devuelve la solicitud actualizada; lanza con `.code` 409 si no se puede.
 */
export const applyStatus = async ({ request, submission, cfg, to, actor, actorKind = 'admin', note = null, metadata = {} }) => {
    const from = request.status;
    if (!isStatus(to)) { const e = new Error('Estado desconocido.'); e.code = 400; throw e; }
    if (!canTransition(from, to, { actor: actorKind })) {
        const allowed = (actorKind === 'participant' ? PARTICIPANT_TRANSITIONS : ADMIN_TRANSITIONS)[from] || [];
        const e = new Error(`No se puede pasar de «${statusMeta(from).label}» a «${statusMeta(to).label}».${allowed.length ? ` Desde aquí se puede ir a: ${allowed.map(k => statusMeta(k).label).join(', ')}.` : ''}`);
        e.code = 409; e.allowed = allowed; throw e;
    }
    const requirement = transitionRequirements(to, { hasApprovedScript: Boolean(request.approvedScriptId), hasDeliverable: Boolean(request.deliverableFileId) });
    if (requirement) { const e = new Error(requirement); e.code = 409; throw e; }
    // v4.1296 — La compuerta COMERCIAL: sin pago confirmado (o exoneración
    // expresa de un administrador) no se pasa de la revisión a producir.
    const gate = productionGate(to, { commercialStatus: request.commercialStatus, paymentWaived: request.paymentWaived });
    if (gate) { const e = new Error(gate); e.code = 409; throw e; }

    const sets = ['status = $2', '"updatedAt" = NOW()'];
    const params = [request.id, to];
    let number = request.number;
    if (to === 'submitted' && !number) {
        // Número único: el índice lo garantiza; ante una colisión se reintenta.
        for (let i = 0; i < 3 && !number; i++) {
            const candidate = await nextNumber();
            const { rowCount } = await db.query('UPDATE "VideoPitchRequest" SET number = $2 WHERE id = $1 AND number IS NULL AND NOT EXISTS (SELECT 1 FROM "VideoPitchRequest" WHERE number = $2)', [request.id, candidate]).catch(() => ({ rowCount: 0 }));
            if (rowCount) number = candidate;
        }
    }
    if (to === 'submitted') { sets.push('"submittedAt" = COALESCE("submittedAt", NOW())'); sets.push('"infoRequest" = NULL'); }
    if (to === 'info_required') { params.push(clean(note, 2000) || null); sets.push(`"infoRequest" = $${params.length}`); }
    if (to === 'delivered') sets.push('"deliveredAt" = NOW()');
    await db.query(`UPDATE "VideoPitchRequest" SET ${sets.join(', ')} WHERE id = $1`, params);

    const event = await logVpEvent(request.id, {
        type: 'status_changed',
        title: `${statusMeta(from).label} → ${statusMeta(to).label}`,
        detail: clean(note, 2000) || null,
        metadata: { from, to, ...metadata },
        actor,
    });
    const updated = await loadRequest(request.id);
    if (to === 'submitted' && from === 'draft') {
        await logEvent(submission.id, {
            type: 'video_pitch_requested', title: 'Solicitud de Video Pitch enviada',
            detail: `Solicitud ${updated.number || ''}`.trim(), actor, metadata: { requestId: request.id, number: updated.number },
        });
        await notifyAdmins({ request: updated, submission, cfg, eventId: event?.id });
    }
    if (to === 'delivered') {
        await logEvent(submission.id, {
            type: 'video_pitch_delivered', title: 'Video Pitch entregado', detail: `Solicitud ${updated.number || ''}`.trim(),
            actor, metadata: { requestId: request.id, fileId: updated.deliverableFileId },
        });
    }
    // El participante no se avisa a sí mismo de lo que acaba de hacer.
    if (actorKind !== 'participant' || to === 'submitted') {
        await notifyParticipant({ request: updated, submission, cfg, status: to, eventId: event?.id, note });
    }
    return updated;
};

// ════════════════════════════════════════════════════════════════════
// PORTAL DEL PARTICIPANTE
// ════════════════════════════════════════════════════════════════════
export const portalIdentity = async (req) => {
    const submission = await loadSubmission(req.portal.submissionId);
    if (!submission) return { submission: null, account: null };
    const acc = await db.query('SELECT id, email FROM "ProjectFairAccount" WHERE id = $1 AND "submissionId" = $2 LIMIT 1', [req.portal.sub, submission.id]);
    return { submission, account: acc.rows[0] || null };
};
export const participantActor = (account, submission) => ({ id: account?.id || null, name: account?.email || submission?.email || 'Club', role: 'club' });

/**
 * El club puede pedir el video cuando su proyecto está POSTULADO (no en
 * borrador). No depende del pago, y una postulación ARCHIVADA tampoco lo
 * impide (v4.1294): archivar es una decisión administrativa que el club no ve
 * ni puede revertir, y bloquearlo acá dejaba la tarjeta muerta con un aviso
 * que no le decía qué hacer. La bandeja marca la postulación «Archivada» y el
 * comité decide si cancela la solicitud.
 */
export const availabilityOf = (submission) => {
    if (!isApplied(submission)) return { available: false, reason: 'Podrás solicitar el Video Pitch cuando tu proyecto esté postulado.' };
    return { available: true, reason: null };
};

const portalView = async ({ request, submission, account }) => {
    const availability = availabilityOf(submission);
    const masterAnswers = await loadMasterAnswers(submission.id);
    const prefill = prefillFrom({ submission, masterAnswers });
    // v4.1295 — Lo que el sistema YA sabe del proyecto, para mostrarlo en
    // sólo lectura: el club agrega sólo lo que falte.
    const context = projectContextOf({ submission, masterAnswers });
    const { listPlans, commercialViewOf } = await commerce();
    const plans = await listPlans({ onlyActive: true });
    if (!request) {
        return {
            exists: false, status: 'not_requested', statusLabel: statusMeta('not_requested').label, ...availability,
            identity: lockedIdentity(submission), prefill, context, catalog: CATALOG, request: null, files: [], scripts: [], events: [],
            canEdit: availability.available, deliverable: null, plans,
            commercial: { status: 'no_plan', label: commercialMeta('no_plan').label, tone: 'slate', planId: null, order: null, paymentWaived: false, canChoosePlan: true, canPay: false },
            card: cardCopyOf({ exists: false, requestStatus: 'not_requested', commercialStatus: 'no_plan', available: availability.available }),
        };
    }
    const commercial = await commercialViewOf(request);
    const [files, scripts, events] = await Promise.all([loadFiles(request.id), loadScripts(request.id), loadEvents(request.id, { participant: true })]);
    const materials = files.filter(f => f.role === 'material');
    const deliverable = files.find(f => f.id === request.deliverableFileId) || null;
    const thumbnail = files.find(f => f.id === request.thumbnailFileId) || null;
    // El club sólo ve los guiones que el comité le MANDÓ (o aprobó), nunca los borradores internos.
    const visibleScripts = scripts.filter(s => ['sent_to_participant', 'approved'].includes(s.status) && (s.id === request.currentScriptId || s.id === request.approvedScriptId));
    const canEdit = participantCanEdit(request.status) && availability.available;
    return {
        exists: true, ...availability,
        status: request.status, statusLabel: statusMeta(request.status).label,
        request: shapeRequest(request, submission),
        identity: lockedIdentity(submission), prefill, context, catalog: CATALOG, plans, commercial,
        card: cardCopyOf({ exists: true, requestStatus: request.status, commercialStatus: commercial.status, available: availability.available }),
        revision: request.lastEditedAt ? new Date(request.lastEditedAt).toISOString() : null,
        files: materials.map(shapeFile),
        scripts: visibleScripts.map(s => shapeScript(s, request)),
        events,
        canEdit,
        canDecideScript: request.status === 'script_pending_approval' && Boolean(request.currentScriptId),
        validation: validateForSubmit(request.answers, { fileCount: materials.length, hasProjectContext: context.hasProjectContext }),
        deliverable: deliverable ? shapeFile(deliverable) : null,
        thumbnail: thumbnail ? shapeFile(thumbnail) : null,
    };
};

// GET /portal/video-pitch
export const portalGet = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const request = await loadRequestBySubmission(submission.id);
        res.json(await portalView({ request, submission, account }));
    } catch (error) {
        console.error('[video-pitch] portalGet:', error);
        res.status(500).json({ error: 'No pudimos cargar tu solicitud de Video Pitch.' });
    }
};

/** Crea el borrador si no existe, precargado. Idempotente: el índice único por postulación lo garantiza. */
export const ensureDraft = async ({ submission, account }) => {
    const existing = await loadRequestBySubmission(submission.id);
    if (existing) return existing;
    const masterAnswers = await loadMasterAnswers(submission.id);
    const prefill = prefillFrom({ submission, masterAnswers });
    // La descripción de la postulación NO se copia al campo: ya está en el expediente; el campo es para lo adicional.
    const answers = normalizeAnswers({ identification: prefill.identification, preferences: { language: 'es' } });
    await db.query(`
        INSERT INTO "VideoPitchRequest" ("submissionId", "accountId", "eventId", status, answers, "completionPct", "lastEditedAt")
        VALUES ($1, $2, $3, 'draft', $4::jsonb, $5, NOW()) ON CONFLICT ("submissionId") DO NOTHING
    `, [submission.id, account?.id || null, submission.eventId || null, JSON.stringify(answers), completionOf(answers)]);
    const created = await loadRequestBySubmission(submission.id);
    await logVpEvent(created.id, { type: 'draft_created', title: 'Borrador de la solicitud creado', actor: participantActor(account, submission) });
    return created;
};

// PUT /portal/video-pitch — guardado (automático o manual) del borrador.
export const portalSave = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const availability = availabilityOf(submission);
        if (!availability.available) return res.status(403).json({ error: availability.reason });
        const request = await ensureDraft({ submission, account });
        if (!participantCanEdit(request.status)) return res.status(409).json({ error: `La solicitud está «${statusMeta(request.status).label}» y ya no se puede editar.` });
        // v4.1296 — Ediciones simultáneas: el navegador manda la revisión que
        // cargó (`lastEditedAt`). Si otro guardó después, no se pisa: 409 con lo
        // guardado para que la pantalla lo muestre y la persona decida.
        const clientRevision = clean(req.body?.clientRevision, 40);
        if (clientRevision && request.lastEditedAt && new Date(request.lastEditedAt).getTime() > new Date(clientRevision).getTime() + 1500
            && JSON.stringify(normalizeAnswers(request.answers)) !== JSON.stringify(normalizeAnswers(req.body?.answers || {}))) {
            return res.status(409).json({ conflict: true, error: 'La solicitud se guardó desde otra pestaña o dispositivo. Mostramos la versión más reciente.', answers: normalizeAnswers(request.answers), revision: new Date(request.lastEditedAt).toISOString() });
        }
        const answers = normalizeAnswers(req.body?.answers || request.answers);
        const files = await loadFiles(request.id);
        const pct = completionOf(answers, { fileCount: files.filter(f => f.role === 'material').length });
        const { rows: saved } = await db.query('UPDATE "VideoPitchRequest" SET answers = $2::jsonb, "completionPct" = $3, "lastEditedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1 RETURNING "lastEditedAt"',
            [request.id, JSON.stringify(answers), pct]);
        const revision = saved[0]?.lastEditedAt ? new Date(saved[0].lastEditedAt).toISOString() : new Date().toISOString();
        res.json({ ok: true, savedAt: revision, revision, completionPct: pct, status: request.status, requestId: request.id });
    } catch (error) {
        console.error('[video-pitch] portalSave:', error);
        res.status(500).json({ error: 'No pudimos guardar tu solicitud.' });
    }
};

// POST /portal/video-pitch/submit
export const portalSubmit = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const availability = availabilityOf(submission);
        if (!availability.available) return res.status(403).json({ error: availability.reason });
        const request = await ensureDraft({ submission, account });
        if (!participantCanEdit(request.status)) return res.status(409).json({ error: `La solicitud ya fue enviada (${statusMeta(request.status).label}).`, status: request.status });
        const answers = normalizeAnswers(req.body?.answers !== undefined ? req.body.answers : request.answers);
        const files = await loadFiles(request.id);
        const materials = files.filter(f => f.role === 'material').length;
        const verdict = validateForSubmit(answers, { fileCount: materials, hasProjectContext: projectContextOf({ submission, masterAnswers: await loadMasterAnswers(submission.id) }).hasProjectContext });
        if (!verdict.ok) return res.status(400).json({ error: 'Faltan datos para enviar la solicitud.', errors: verdict.errors });
        const pct = completionOf(answers, { fileCount: materials });
        await db.query('UPDATE "VideoPitchRequest" SET answers = $2::jsonb, "completionPct" = $3, "lastEditedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1',
            [request.id, JSON.stringify(answers), pct]);
        const cfg = await readConfigForSubmission(submission.eventId || null);
        const fresh = await loadRequest(request.id);
        const resubmission = fresh.status === 'info_required';
        const updated = await applyStatus({
            request: fresh, submission, cfg, to: 'submitted', actor: participantActor(account, submission), actorKind: 'participant',
            note: resubmission ? 'El club completó la información solicitada.' : null, metadata: { resubmission, materials },
        });
        res.json({ ok: true, number: updated.number, status: updated.status, submittedAt: updated.submittedAt, warnings: verdict.warnings });
    } catch (error) {
        if (error?.code === 409 || error?.code === 400) return res.status(error.code).json({ error: error.message });
        console.error('[video-pitch] portalSubmit:', error);
        res.status(500).json({ error: 'No pudimos enviar tu solicitud. Inténtalo de nuevo.' });
    }
};

// ── Archivos del club ────────────────────────────────────────────────
const presignFor = async ({ request, role, body, actorRole }) => {
    const filename = clean(body?.filename, 200);
    const juicio = checkUploadMeta({ filename, size: body?.size, role });
    if (!juicio.ok) return { status: 400, body: { error: juicio.errores.join(' ') } };
    if (role === 'material') {
        const current = (await loadFiles(request.id)).filter(f => f.role === 'material').length;
        if (current >= MAX_FILES_PER_REQUEST) return { status: 409, body: { error: `Se admiten hasta ${MAX_FILES_PER_REQUEST} archivos por solicitud.` } };
    }
    try {
        const signed = await presignVideoPitchUpload({ requestId: request.id, role, ext: juicio.ext, contentType: juicio.contentType });
        // v4.1296 — Cada URL emitida queda anotada: lo que nunca se registre es
        // un huérfano que la limpieza administrativa puede borrar.
        await db.query('INSERT INTO "VideoPitchUploadIntent" ("requestId", "storageKey", role, "fileName", "declaredBytes") VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [request.id, signed.storageKey, role, filename, Number(body?.size) || null]).catch(() => {});
        return { status: 200, body: { ...signed, kind: juicio.kind, role, maxMb: maxMbFor(juicio.kind), actorRole } };
    } catch (e) {
        console.error('[video-pitch] no pude prefirmar la subida:', e?.message);
        return { status: 502, body: { error: 'No se pudo preparar la subida al almacenamiento. Inténtalo de nuevo.' } };
    }
};

const registerFor = async ({ request, role, body, actor }) => {
    const storageKey = clean(body?.storageKey, 400);
    const fileName = clean(body?.filename, 200);
    if (!storageKeyBelongs(storageKey, request.id)) return { status: 400, body: { error: 'El archivo no pertenece a esta solicitud.' } };
    const dup = await db.query('SELECT 1 FROM "VideoPitchFile" WHERE "storageKey" = $1 LIMIT 1', [storageKey]);
    if (dup.rows[0]) return { status: 409, body: { error: 'Ese archivo ya está registrado.' } };
    let inspected;
    try { inspected = await inspectVideoPitchObject(storageKey); }
    catch (e) { console.error('[video-pitch] no pude leer el objeto subido:', e?.message); return { status: 422, body: { error: 'No encontramos el archivo subido. Vuelve a intentarlo.' } }; }
    const juicio = judgeUploadedFile({ filename: fileName, bytes: inspected.bytes, head: inspected.head, role });
    if (!juicio.ok) { await deleteVideoPitchObject(storageKey); return { status: 422, body: { error: juicio.error } }; }
    const width = Number(body?.width) > 0 ? Math.round(Number(body.width)) : null;
    const height = Number(body?.height) > 0 ? Math.round(Number(body.height)) : null;
    const durationSec = Number(body?.durationSec) > 0 ? Math.round(Number(body.durationSec) * 100) / 100 : null;
    const warnings = qualityWarnings({ kind: juicio.kind, width, height, durationSec });
    const { rows } = await db.query(`
        INSERT INTO "VideoPitchFile" ("requestId", role, kind, "storageKey", "fileName", "contentType", "sizeBytes", width, height, "durationSec", warnings, caption, "uploadedById", "uploadedByName", "uploadedByRole")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15) RETURNING *
    `, [request.id, role, juicio.kind, storageKey, fileName, juicio.contentType, inspected.bytes, width, height, durationSec, JSON.stringify(warnings), clean(body?.caption, 300) || null, actor.id, actor.name, actor.role]);
    const file = rows[0];
    await db.query('UPDATE "VideoPitchUploadIntent" SET registered = TRUE WHERE "storageKey" = $1', [storageKey]).catch(() => {});
    await logVpEvent(request.id, {
        type: role === 'material' ? 'file_added' : role === 'deliverable' ? 'deliverable_uploaded' : 'thumbnail_uploaded',
        title: role === 'material' ? `Material adjuntado: ${fileName}` : role === 'deliverable' ? `Video final cargado: ${fileName}` : `Miniatura cargada: ${fileName}`,
        detail: `${FILE_KINDS[juicio.kind].label} · ${fmtBytes(inspected.bytes)}${warnings.length ? ` · ${warnings.length} advertencia(s)` : ''}`,
        metadata: { fileId: file.id, kind: juicio.kind, sizeBytes: inspected.bytes, warnings }, actor,
        visibility: role === 'material' ? 'all' : 'internal',
    });
    if (role === 'material') {
        const files = await loadFiles(request.id);
        await db.query('UPDATE "VideoPitchRequest" SET "completionPct" = $2, "lastEditedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1',
            [request.id, completionOf(request.answers, { fileCount: files.filter(f => f.role === 'material').length })]);
    }
    return { status: 201, body: { file: shapeFile(file) } };
};

// POST /portal/video-pitch/files/presign
export const portalPresign = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const availability = availabilityOf(submission);
        if (!availability.available) return res.status(403).json({ error: availability.reason });
        const request = await ensureDraft({ submission, account });
        if (!participantCanEdit(request.status)) return res.status(409).json({ error: 'La solicitud ya no admite cambios en los materiales.' });
        const out = await presignFor({ request, role: 'material', body: req.body, actorRole: 'club' });
        res.status(out.status).json(out.body);
    } catch (error) {
        console.error('[video-pitch] portalPresign:', error);
        res.status(500).json({ error: 'No pudimos preparar la subida.' });
    }
};

// POST /portal/video-pitch/files
export const portalRegisterFile = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const request = await loadRequestBySubmission(submission.id);
        if (!request) return res.status(404).json({ error: 'Primero guarda la solicitud.' });
        if (!participantCanEdit(request.status)) return res.status(409).json({ error: 'La solicitud ya no admite cambios en los materiales.' });
        const out = await registerFor({ request, role: 'material', body: req.body, actor: participantActor(account, submission) });
        res.status(out.status).json(out.body);
    } catch (error) {
        console.error('[video-pitch] portalRegisterFile:', error);
        res.status(500).json({ error: 'No pudimos registrar el archivo.' });
    }
};

const softDeleteFile = async ({ request, fileId, actor }) => {
    const { rows } = await db.query('SELECT * FROM "VideoPitchFile" WHERE id = $1 AND "requestId" = $2 AND "deletedAt" IS NULL LIMIT 1', [fileId, request.id]);
    const file = rows[0];
    if (!file) return { status: 404, body: { error: 'Archivo no encontrado.' } };
    if (file.id === request.deliverableFileId) return { status: 409, body: { error: 'Este es el video entregado: reemplázalo subiendo otro, no se puede borrar.' } };
    await db.query('UPDATE "VideoPitchFile" SET "deletedAt" = NOW() WHERE id = $1', [file.id]);
    await deleteVideoPitchObject(file.storageKey);
    await logVpEvent(request.id, { type: 'file_removed', title: `Archivo retirado: ${file.fileName}`, metadata: { fileId: file.id, role: file.role }, actor, visibility: file.role === 'material' ? 'all' : 'internal' });
    if (file.role === 'material') {
        const files = await loadFiles(request.id);
        await db.query('UPDATE "VideoPitchRequest" SET "completionPct" = $2, "updatedAt" = NOW() WHERE id = $1',
            [request.id, completionOf(request.answers, { fileCount: files.filter(f => f.role === 'material').length })]);
    }
    return { status: 200, body: { ok: true } };
};

// DELETE /portal/video-pitch/files/:fileId
export const portalDeleteFile = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const request = await loadRequestBySubmission(submission.id);
        if (!request) return res.status(404).json({ error: 'No hay solicitud.' });
        if (!participantCanEdit(request.status)) return res.status(409).json({ error: 'La solicitud ya no admite cambios en los materiales.' });
        const out = await softDeleteFile({ request, fileId: clean(req.params.fileId, 60), actor: participantActor(account, submission) });
        res.status(out.status).json(out.body);
    } catch (error) {
        console.error('[video-pitch] portalDeleteFile:', error);
        res.status(500).json({ error: 'No pudimos retirar el archivo.' });
    }
};

// PATCH /portal/video-pitch/files/:fileId — la leyenda del material.
export const portalUpdateFile = async (req, res) => {
    try {
        await ensureAll();
        const { submission } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const request = await loadRequestBySubmission(submission.id);
        if (!request) return res.status(404).json({ error: 'No hay solicitud.' });
        if (!participantCanEdit(request.status)) return res.status(409).json({ error: 'La solicitud ya no admite cambios en los materiales.' });
        const { rows } = await db.query('UPDATE "VideoPitchFile" SET caption = $3 WHERE id = $1 AND "requestId" = $2 AND role = \'material\' AND "deletedAt" IS NULL RETURNING *',
            [clean(req.params.fileId, 60), request.id, clean(req.body?.caption, 300) || null]);
        if (!rows[0]) return res.status(404).json({ error: 'Archivo no encontrado.' });
        res.json({ file: shapeFile(rows[0]) });
    } catch (error) {
        console.error('[video-pitch] portalUpdateFile:', error);
        res.status(500).json({ error: 'No pudimos guardar la leyenda.' });
    }
};

const signedUrlFor = async (file, { download = false } = {}) => {
    if (!(await videoPitchObjectExists(file.storageKey))) return null;
    return signedVideoPitchUrl(file.storageKey, { fileName: file.fileName, contentType: file.contentType, disposition: download ? 'attachment' : 'inline' });
};

// GET /portal/video-pitch/files/:fileId/url — ver un material propio, la miniatura o el video entregado.
export const portalFileUrl = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const request = await loadRequestBySubmission(submission.id);
        if (!request) return res.status(404).json({ error: 'No hay solicitud.' });
        const { rows } = await db.query('SELECT * FROM "VideoPitchFile" WHERE id = $1 AND "requestId" = $2 AND "deletedAt" IS NULL LIMIT 1', [clean(req.params.fileId, 60), request.id]);
        const file = rows[0];
        if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
        // El video final sólo se ve cuando está ENTREGADO; antes es trabajo interno.
        const isDeliverable = file.role !== 'material';
        if (isDeliverable && !(request.status === 'delivered' && (file.id === request.deliverableFileId || file.id === request.thumbnailFileId))) {
            return res.status(403).json({ error: 'El video estará disponible cuando el comité lo entregue.' });
        }
        const url = await signedUrlFor(file, { download: req.query.download === '1' });
        if (!url) return res.status(503).json({ error: 'El archivo no está disponible en el almacenamiento.', ref: refOf(file.id) });
        if (isDeliverable && file.id === request.deliverableFileId && req.query.download === '1') {
            await logVpEvent(request.id, { type: 'deliverable_downloaded', title: 'El club descargó el video', actor: participantActor(account, submission), visibility: 'internal' });
        }
        res.json({ url, fileName: file.fileName, contentType: file.contentType });
    } catch (error) {
        console.error('[video-pitch] portalFileUrl:', error);
        res.status(500).json({ error: 'No pudimos abrir el archivo.' });
    }
};

// POST /portal/video-pitch/script/decision — { decision: 'approve' | 'changes', comment }
export const portalScriptDecision = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const request = await loadRequestBySubmission(submission.id);
        if (!request) return res.status(404).json({ error: 'No hay solicitud.' });
        if (request.status !== 'script_pending_approval' || !request.currentScriptId) return res.status(409).json({ error: 'No hay un guion pendiente de tu aprobación.' });
        const decision = clean(req.body?.decision, 20);
        const comment = clean(req.body?.comment, 2000);
        if (!['approve', 'changes'].includes(decision)) return res.status(400).json({ error: 'Indica si apruebas el guion o pides ajustes.' });
        if (decision === 'changes' && !comment) return res.status(400).json({ error: 'Cuéntanos qué ajustes necesita el guion.' });
        const cfg = await readConfigForSubmission(submission.eventId || null);
        const actor = participantActor(account, submission);
        if (decision === 'approve') {
            await db.query('UPDATE "VideoPitchScript" SET status = \'approved\' WHERE id = $1', [request.currentScriptId]);
            await db.query('UPDATE "VideoPitchRequest" SET "approvedScriptId" = $2, "updatedAt" = NOW() WHERE id = $1', [request.id, request.currentScriptId]);
            await logVpEvent(request.id, { type: 'script_approved', title: 'El club aprobó el guion', detail: comment || null, metadata: { scriptId: request.currentScriptId, by: 'participant' }, actor });
            const fresh = await loadRequest(request.id);
            await applyStatus({ request: fresh, submission, cfg, to: 'script_approved', actor, actorKind: 'participant', note: comment || null });
        } else {
            await logVpEvent(request.id, { type: 'script_changes_requested', title: 'El club pidió ajustes al guion', detail: comment, metadata: { scriptId: request.currentScriptId }, actor });
            await applyStatus({ request, submission, cfg, to: 'script_in_progress', actor, actorKind: 'participant', note: comment });
        }
        res.json({ ok: true });
    } catch (error) {
        if (error?.code === 409 || error?.code === 400) return res.status(error.code).json({ error: error.message });
        console.error('[video-pitch] portalScriptDecision:', error);
        res.status(500).json({ error: 'No pudimos registrar tu decisión.' });
    }
};

// POST /portal/video-pitch/messages — un mensaje del club al comité (queda en el historial).
export const portalMessage = async (req, res) => {
    try {
        await ensureAll();
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const request = await loadRequestBySubmission(submission.id);
        if (!request || request.status === 'draft') return res.status(409).json({ error: 'Envía primero la solicitud.' });
        const text = clean(req.body?.text, 2000);
        if (!text) return res.status(400).json({ error: 'Escribe el mensaje.' });
        const ev = await logVpEvent(request.id, { type: 'message', title: 'Mensaje del club', detail: text, actor: participantActor(account, submission) });
        await db.query('UPDATE "VideoPitchRequest" SET "updatedAt" = NOW() WHERE id = $1', [request.id]);
        res.status(201).json({ ok: true, event: ev });
    } catch (error) {
        console.error('[video-pitch] portalMessage:', error);
        res.status(500).json({ error: 'No pudimos enviar el mensaje.' });
    }
};

// ════════════════════════════════════════════════════════════════════
// ADMINISTRACIÓN
// ════════════════════════════════════════════════════════════════════
const withSchema = (handler, capability) => withAccess(async (req, res, ctx) => {
    await ensureVideoPitchSchema();
    return handler(req, res, ctx);
}, capability);

const LIST_SELECT = `
    SELECT r.*, s."publicRef", s."projectName", s."clubName", s.district, s.email AS "submissionEmail", s."firstName", s."lastName",
           s."workflowStatus", s."archivedAt",
           o."planName" AS "orderPlanName", o.amount AS "orderAmount", o.currency AS "orderCurrency", o.status AS "orderStatus", o."paidAt" AS "orderPaidAt",
           (SELECT COUNT(*) FROM "VideoPitchFile" f WHERE f."requestId" = r.id AND f.role = 'material' AND f."deletedAt" IS NULL)::int AS "materialCount",
           (SELECT COUNT(*) FROM "VideoPitchScript" sc WHERE sc."requestId" = r.id)::int AS "scriptCount"
    FROM "VideoPitchRequest" r
    JOIN "ProjectFairSubmission" s ON s.id = r."submissionId"
    LEFT JOIN "VideoPitchOrder" o ON o.id = r."currentOrderId"`;

const shapeRow = (r) => {
    const a = normalizeAnswers(r.answers);
    return {
        id: r.id, number: r.number || null, status: r.status, statusLabel: statusMeta(r.status).label, statusTone: statusMeta(r.status).tone,
        submissionId: r.submissionId, publicRef: r.publicRef, projectName: r.projectName, clubName: r.clubName, district: r.district,
        responsibleName: a.identification.responsibleName || [r.firstName, r.lastName].filter(Boolean).join(' '),
        email: a.identification.email || r.submissionEmail, whatsapp: a.identification.whatsapp,
        language: a.preferences.language, objective: a.preferences.objective,
        materialCount: Number(r.materialCount) || 0, scriptCount: Number(r.scriptCount) || 0,
        assigneeId: r.assigneeId || null, assigneeName: r.assigneeName || null,
        hasApprovedScript: Boolean(r.approvedScriptId), hasDeliverable: Boolean(r.deliverableFileId),
        completionPct: Number(r.completionPct) || 0,
        commercialStatus: r.commercialStatus || 'no_plan', commercialLabel: commercialMeta(r.commercialStatus || 'no_plan').label, commercialTone: commercialMeta(r.commercialStatus || 'no_plan').tone,
        planName: r.orderPlanName || null, amount: r.orderAmount === null || r.orderAmount === undefined ? null : Number(r.orderAmount), currency: r.orderCurrency || null,
        paidAt: r.orderPaidAt || null, paymentWaived: Boolean(r.paymentWaived),
        projectStateLabel: r.archivedAt ? 'Archivada' : projectStateMeta(projectStateOf(r)).label,
        submittedAt: r.submittedAt, deliveredAt: r.deliveredAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
};

const listRows = async (query, cfg) => {
    const params = [];
    // Los borradores son trabajo privado del club: la bandeja no los lista…
    // salvo que ya tengan un plan elegido (v4.1296): un «pendiente de pago» es
    // una venta por cerrar y el comité tiene que verla.
    const cond = ['(r.status <> \'draft\' OR COALESCE(r."commercialStatus", \'no_plan\') <> \'no_plan\')'];
    // `$?` se reemplaza —TODAS sus apariciones— por el índice del parámetro recién agregado.
    const add = (sql, v) => { params.push(v); cond.push(sql.split('$?').join(`$${params.length}`)); };
    const evento = clean(query.evento, 60);
    if (evento) add('r."eventId" = $?', evento);
    const status = clean(query.status, 40);
    if (status && isStatus(status)) add('r.status = $?', status);
    const commercial = clean(query.commercial, 40);
    if (commercial === 'open') cond.push(`COALESCE(r."commercialStatus", 'no_plan') IN ('pending_payment', 'processing', 'failed', 'plan_selected')`);
    else if (commercial) add('COALESCE(r."commercialStatus", \'no_plan\') = $?', commercial);
    const district = clean(query.district, 120);
    if (district) add('s.district = $?', district);
    const assignee = clean(query.assignee, 160);
    if (assignee === '__none__') cond.push('r."assigneeId" IS NULL');
    else if (assignee) add('(r."assigneeId" = $? OR r."assigneeName" = $?)', assignee);
    const q = clean(query.q, 120).toLowerCase();
    if (q) add(`(LOWER(COALESCE(r.number,'')) LIKE $? OR LOWER(s."projectName") LIKE $? OR LOWER(s."clubName") LIKE $? OR LOWER(COALESCE(s.district,'')) LIKE $? OR LOWER(s.email) LIKE $? OR LOWER(COALESCE(s."firstName",'') || ' ' || COALESCE(s."lastName",'')) LIKE $? OR LOWER(COALESCE(s."publicRef",'')) LIKE $?)`, `%${q}%`);
    const sort = normalizeSort(clean(query.sort, 30));
    const dir = clean(query.dir, 4).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sortCol = { createdAt: 'r."createdAt"', updatedAt: 'r."updatedAt"', submittedAt: 'r."submittedAt"', status: 'r.status', projectName: 's."projectName"', clubName: 's."clubName"', district: 's.district' }[sort];
    const { rows } = await db.query(`${LIST_SELECT} WHERE ${cond.join(' AND ')} ORDER BY ${sortCol} ${dir} NULLS LAST, r."createdAt" DESC`, params);
    void cfg;
    return rows.map(shapeRow);
};

// GET /admin/video-pitch?evento=&q=&status=&district=&assignee=&sort=&dir=&page=&pageSize=
export const adminList = withSchema(async (req, res, { access, cfg }) => {
    const all = await listRows(req.query, cfg);
    // Los indicadores se calculan sobre la EDICIÓN (sin los filtros de la tabla), para que no bailen al filtrar.
    const base = await listRows({ evento: req.query.evento }, cfg);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));
    const rows = all.slice((page - 1) * pageSize, page * pageSize);
    const assigneeOptions = [...new Set([
        ...(Array.isArray(cfg?.access?.admins) ? cfg.access.admins : []),
        ...(Array.isArray(cfg?.access?.reviewers) ? cfg.access.reviewers : []),
        req.user?.email,
        ...base.map(r => r.assigneeName),
    ].filter(Boolean).map(String))].sort();
    res.json({
        rows, total: all.length, page, pageSize,
        kpis: {
            ...summarizeRequests(base),
            pending_payment: base.filter(r => ['pending_payment', 'processing', 'failed', 'plan_selected'].includes(r.commercialStatus)).length,
            paid: base.filter(r => r.commercialStatus === 'paid').length,
            revenue: base.filter(r => r.commercialStatus === 'paid').reduce((a, r) => a + (Number(r.amount) || 0), 0),
        },
        filters: {
            statuses: STATUSES.filter(s => s.key !== 'not_requested'),
            districts: [...new Set(base.map(r => r.district).filter(Boolean))].sort(),
            assignees: assigneeOptions,
        },
        access: { view: !!access.view, comment: !!access.comment, manage: !!access.changeStatus, export: !!access.export, remove: !!access.remove, config: !!access.config },
        catalog: CATALOG,
        transitions: ADMIN_TRANSITIONS,
    });
}, 'view');

// GET /admin/video-pitch/export.csv
export const adminExportCsv = withSchema(async (req, res, { cfg }) => {
    const rows = await listRows(req.query, cfg);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="video-pitch-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(requestsCsv(rows));
}, 'export');

const adminContext = async (req, res) => {
    const request = await loadRequest(clean(req.params.id, 60));
    if (!request) { res.status(404).json({ error: 'Solicitud no encontrada.' }); return null; }
    const submission = await loadSubmission(request.submissionId);
    if (!submission) { res.status(404).json({ error: 'La postulación de esta solicitud ya no existe.' }); return null; }
    return { request, submission };
};

const detailOf = async (request, submission, access) => {
    const [files, scripts, events, notifications, masterAnswers] = await Promise.all([
        loadFiles(request.id, { includeDeleted: true }), loadScripts(request.id), loadEvents(request.id),
        db.query('SELECT kind, recipient, status, error, "createdAt" FROM "VideoPitchNotification" WHERE "requestId" = $1 ORDER BY "createdAt" DESC', [request.id]).then(r => r.rows),
        loadMasterAnswers(submission.id),
    ]);
    const dossier = buildDossier({ request, submission, masterAnswers, files });
    const { commercialViewOf, loadOrders, shapeOrder } = await commerce();
    const commercial = await commercialViewOf(request);
    const orders = (await loadOrders(request.id)).map(shapeOrder);
    return {
        request: shapeRequest(request, submission),
        commercial, orders,
        submission: {
            id: submission.id, publicRef: submission.publicRef, projectName: submission.projectName, clubName: submission.clubName,
            district: submission.district, responsible: [submission.firstName, submission.lastName].filter(Boolean).join(' '),
            email: submission.email, phone: submission.phone || null, focusAreaLabel: submission.focusAreaLabel || null,
            budgetUsd: submission.budgetUsd === null || submission.budgetUsd === undefined ? null : Number(submission.budgetUsd),
            projectDescription: submission.projectDescription || '', projectStateLabel: submission.archivedAt ? 'Archivada' : projectStateMeta(projectStateOf(submission)).label,
            hasMasterForm: Boolean(masterAnswers),
        },
        files: files.map(shapeFile),
        scripts: scripts.map(s => shapeScript(s, request)),
        events, notifications,
        dossier: dossier.lines,
        allowedTransitions: (ADMIN_TRANSITIONS[request.status] || []).map(k => ({
            key: k, label: statusMeta(k).label,
            requirement: transitionRequirements(k, { hasApprovedScript: Boolean(request.approvedScriptId), hasDeliverable: Boolean(request.deliverableFileId) })
                || productionGate(k, { commercialStatus: request.commercialStatus, paymentWaived: request.paymentWaived }),
        })),
        access: { view: !!access.view, comment: !!access.comment, manage: !!access.changeStatus, export: !!access.export, remove: !!access.remove, config: !!access.config },
        catalog: CATALOG,
    };
};

// GET /admin/video-pitch/:id
export const adminGet = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    res.json(await detailOf(ctx.request, ctx.submission, access));
}, 'view');

// PATCH /admin/video-pitch/:id — responsable de producción y notas internas.
export const adminUpdate = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const actor = actorFrom(req, access);
    const body = req.body || {};
    const sets = ['"updatedAt" = NOW()'];
    const params = [ctx.request.id];
    if (body.assigneeName !== undefined) {
        const name = clean(body.assigneeName, 160) || null;
        params.push(name); sets.push(`"assigneeName" = $${params.length}`);
        params.push(name ? clean(body.assigneeId, 120) || name : null); sets.push(`"assigneeId" = $${params.length}`);
        if (name !== (ctx.request.assigneeName || null)) {
            await logVpEvent(ctx.request.id, { type: 'assigned', title: name ? `Responsable de producción: ${name}` : 'Responsable de producción retirado', metadata: { before: ctx.request.assigneeName, after: name }, actor, visibility: 'internal' });
        }
    }
    if (body.adminNotes !== undefined) { params.push(clean(body.adminNotes, 4000) || null); sets.push(`"adminNotes" = $${params.length}`); }
    await db.query(`UPDATE "VideoPitchRequest" SET ${sets.join(', ')} WHERE id = $1`, params);
    res.json(await detailOf(await loadRequest(ctx.request.id), ctx.submission, access));
}, 'changeStatus');

// POST /admin/video-pitch/:id/status — { status, note }
export const adminSetStatus = withSchema(async (req, res, { access, cfg }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const to = clean(req.body?.status, 40);
    const note = clean(req.body?.note, 2000) || null;
    if (to === 'info_required' && !note) return res.status(400).json({ error: 'Indica qué información o materiales necesitas del club.' });
    try {
        // La convocatoria que manda en los correos es la de la EDICIÓN del proyecto, no la abierta en el panel.
        void cfg;
        const requestCfg = await readConfigForSubmission(ctx.submission.eventId || null);
        await applyStatus({ request: ctx.request, submission: ctx.submission, cfg: requestCfg, to, actor: actorFrom(req, access), note });
    } catch (e) {
        if (e?.code === 409 || e?.code === 400) return res.status(e.code).json({ error: e.message, allowed: e.allowed || undefined });
        throw e;
    }
    res.json(await detailOf(await loadRequest(ctx.request.id), ctx.submission, access));
}, 'changeStatus');

// POST /admin/video-pitch/:id/comments — { text, internal }
export const adminComment = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const text = clean(req.body?.text, 2000);
    if (!text) return res.status(400).json({ error: 'Escribe el comentario.' });
    const internal = req.body?.internal !== false;
    const ev = await logVpEvent(ctx.request.id, {
        type: internal ? 'internal_note' : 'message', title: internal ? 'Nota interna' : 'Mensaje del comité', detail: text,
        actor: actorFrom(req, access), visibility: internal ? 'internal' : 'all',
    });
    await db.query('UPDATE "VideoPitchRequest" SET "updatedAt" = NOW() WHERE id = $1', [ctx.request.id]);
    res.status(201).json({ ok: true, event: ev });
}, 'comment');

// POST /admin/video-pitch/bulk — { ids, action: 'assign' | 'status', assigneeName, status, confirm }
export const adminBulk = withSchema(async (req, res, { access, cfg }) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => clean(v, 60)).filter(Boolean).slice(0, 200) : [];
    const action = clean(req.body?.action, 20);
    if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos una solicitud.' });
    const actor = actorFrom(req, access);
    const results = { done: 0, skipped: [] };
    for (const id of ids) {
        const request = await loadRequest(id);
        if (!request) { results.skipped.push({ id, reason: 'no existe' }); continue; }
        if (action === 'assign') {
            const name = clean(req.body?.assigneeName, 160) || null;
            await db.query('UPDATE "VideoPitchRequest" SET "assigneeName" = $2, "assigneeId" = $3, "updatedAt" = NOW() WHERE id = $1', [id, name, name]);
            await logVpEvent(id, { type: 'assigned', title: name ? `Responsable de producción: ${name}` : 'Responsable de producción retirado', metadata: { bulk: true }, actor, visibility: 'internal' });
            results.done++;
        } else if (action === 'status') {
            const to = clean(req.body?.status, 40);
            if (!bulkStatusAllowed(request.status, to)) { results.skipped.push({ id, number: request.number, reason: `de «${statusMeta(request.status).label}» no se pasa en bloque a «${statusMeta(to).label || to}»` }); continue; }
            if (req.body?.confirm !== true) { results.done++; continue; }
            const submission = await loadSubmission(request.submissionId);
            try {
                await applyStatus({ request, submission, cfg: await readConfigForSubmission(submission?.eventId || null), to, actor, metadata: { bulk: true } });
                results.done++;
            } catch (e) { results.skipped.push({ id, number: request.number, reason: e.message }); }
        } else {
            return res.status(400).json({ error: 'Acción desconocida.' });
        }
    }
    void cfg;
    res.json({ ok: true, planned: req.body?.confirm !== true, ...results });
}, 'changeStatus');

// ── Archivos (administrador) ─────────────────────────────────────────
// GET /admin/video-pitch/:id/files/:fileId/url
export const adminFileUrl = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const { rows } = await db.query('SELECT * FROM "VideoPitchFile" WHERE id = $1 AND "requestId" = $2 LIMIT 1', [clean(req.params.fileId, 60), ctx.request.id]);
    const file = rows[0];
    if (!file || file.deletedAt) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const url = await signedUrlFor(file, { download: req.query.download === '1' });
    if (!url) return res.status(503).json({ error: 'El archivo no está disponible en el almacenamiento.', ref: refOf(file.id) });
    void access;
    res.json({ url, fileName: file.fileName, contentType: file.contentType });
}, 'view');

// POST /admin/video-pitch/:id/files/presign — { filename, size, role }
export const adminPresign = withSchema(async (req, res) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const role = FILE_ROLES.includes(req.body?.role) ? req.body.role : 'deliverable';
    const out = await presignFor({ request: ctx.request, role, body: req.body, actorRole: 'admin' });
    res.status(out.status).json(out.body);
}, 'changeStatus');

// POST /admin/video-pitch/:id/files — registra el archivo ya subido. Un video final nuevo reemplaza al vigente (el anterior se conserva en el historial).
export const adminRegisterFile = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const role = FILE_ROLES.includes(req.body?.role) ? req.body.role : 'deliverable';
    const actor = actorFrom(req, access);
    const out = await registerFor({ request: ctx.request, role, body: req.body, actor });
    if (out.status === 201) {
        const fileId = out.body.file.id;
        if (role === 'deliverable') await db.query('UPDATE "VideoPitchRequest" SET "deliverableFileId" = $2, "updatedAt" = NOW() WHERE id = $1', [ctx.request.id, fileId]);
        if (role === 'thumbnail') await db.query('UPDATE "VideoPitchRequest" SET "thumbnailFileId" = $2, "updatedAt" = NOW() WHERE id = $1', [ctx.request.id, fileId]);
        return res.status(201).json(await detailOf(await loadRequest(ctx.request.id), ctx.submission, access));
    }
    res.status(out.status).json(out.body);
}, 'changeStatus');

// DELETE /admin/video-pitch/:id/files/:fileId
export const adminDeleteFile = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const out = await softDeleteFile({ request: ctx.request, fileId: clean(req.params.fileId, 60), actor: actorFrom(req, access) });
    if (out.status !== 200) return res.status(out.status).json(out.body);
    res.json(await detailOf(await loadRequest(ctx.request.id), ctx.submission, access));
}, 'changeStatus');

// ── Guiones ──────────────────────────────────────────────────────────
const insertScript = async ({ request, source, content, language, tone, targetSeconds, instructions, provider, model, basedOnId, actor }) => {
    let row = null;
    for (let intento = 0; intento < 2 && !row; intento++) {
        try {
            const { rows } = await db.query(`
                INSERT INTO "VideoPitchScript" ("requestId", "versionNumber", source, status, language, tone, "targetSeconds", instructions, content, provider, model, "basedOnId", "createdById", "createdByName")
                SELECT $1, COALESCE(MAX("versionNumber"), 0) + 1, $2, 'draft', $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12
                FROM "VideoPitchScript" WHERE "requestId" = $1 RETURNING *
            `, [request.id, source, language || null, tone || null, targetSeconds || null, instructions || null, JSON.stringify(content), provider || null, model || null, basedOnId || null, actor.id, actor.name]);
            row = rows[0];
        } catch (e) { if (e?.code !== '23505' || intento === 1) throw e; }
    }
    // La versión nueva pasa a ser la vigente (sin tocar la aprobada, si la hay).
    await db.query('UPDATE "VideoPitchRequest" SET "currentScriptId" = $2, "updatedAt" = NOW() WHERE id = $1', [request.id, row.id]);
    return row;
};

// POST /admin/video-pitch/:id/scripts/generate — { language, tone, targetSeconds, instructions, provider, basedOnId, scene }
export const adminGenerateScript = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const { request, submission } = ctx;
    if (['draft', 'cancelled'].includes(request.status)) return res.status(409).json({ error: 'La solicitud todavía no se envió o está cancelada.' });
    const actor = actorFrom(req, access);
    const answers = normalizeAnswers(request.answers);
    const language = LANGUAGES.some(l => l.key === req.body?.language) ? req.body.language : (answers.preferences.language || 'es');
    const tone = TONES.some(t => t.key === req.body?.tone) ? req.body.tone : 'inspiring';
    const targetSeconds = clampTargetSeconds(req.body?.targetSeconds ?? TARGET_SECONDS_DEFAULT);
    const instructions = clean(req.body?.instructions, 2000);
    const provider = ['openai', 'anthropic', 'gemini'].includes(req.body?.provider) ? req.body.provider : undefined;
    const scene = Number(req.body?.scene) >= 1 && Number(req.body?.scene) <= 5 ? Number(req.body.scene) : null;
    const basedOn = req.body?.basedOnId ? await loadScript(request.id, clean(req.body.basedOnId, 60)) : (request.currentScriptId ? await loadScript(request.id, request.currentScriptId) : null);
    if (scene && !basedOn) return res.status(400).json({ error: 'Para regenerar una escena hace falta un guion de partida.' });

    const [files, masterAnswers, cfg] = await Promise.all([loadFiles(request.id), loadMasterAnswers(submission.id), readConfigForSubmission(submission.eventId || null)]);
    const dossier = buildDossier({ request, submission, masterAnswers, files, edition: cfg?.edition });
    let generated;
    try {
        generated = await generateVideoPitchScript({ dossier, language, tone, targetSeconds, instructions, previousScript: basedOn?.content || null, onlyScene: scene, provider });
    } catch (e) {
        console.error('[video-pitch] IA:', e?.message);
        return res.status(502).json({ error: `La IA no pudo generar el guion. ${e?.message || ''}`.trim() });
    }
    const content = { ...generated.script, audit: generated.audit };
    const row = await insertScript({ request, source: 'ai', content, language, tone, targetSeconds, instructions, provider: generated.provider, model: generated.model, basedOnId: basedOn?.id || null, actor });
    await logVpEvent(request.id, {
        type: scene ? 'scene_regenerated' : 'script_generated',
        title: scene ? `Escena ${scene} regenerada con IA (versión ${row.versionNumber})` : `Guion generado con IA (versión ${row.versionNumber})`,
        detail: `${generated.provider || 'IA'}${generated.model ? ` · ${generated.model}` : ''} · ${content.totalSeconds} s${generated.audit.suspicious.length ? ` · ${generated.audit.suspicious.length} cifra(s) por verificar` : ''}`,
        metadata: { scriptId: row.id, versionNumber: Number(row.versionNumber), language, tone, targetSeconds, scene, provider: generated.provider, model: generated.model, audit: generated.audit },
        actor, visibility: 'internal',
    });
    // Si el flujo estaba en revisión, pasa solo a «Guion en preparación»: es lo que acaba de ocurrir.
    if (request.status === 'in_review') {
        try { await applyStatus({ request: await loadRequest(request.id), submission, cfg, to: 'script_in_progress', actor, note: 'Primer guion generado.' }); } catch { /* el estado manda */ }
    }
    res.status(201).json(await detailOf(await loadRequest(request.id), submission, access));
}, 'changeStatus');

// POST /admin/video-pitch/:id/scripts — guardar una edición manual como versión nueva: { content, basedOnId, note }
export const adminSaveScript = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const { request, submission } = ctx;
    const actor = actorFrom(req, access);
    const basedOn = req.body?.basedOnId ? await loadScript(request.id, clean(req.body.basedOnId, 60)) : null;
    const files = await loadFiles(request.id);
    const targetSeconds = clampTargetSeconds(req.body?.content?.targetSeconds ?? basedOn?.targetSeconds ?? TARGET_SECONDS_DEFAULT);
    const norm = normalizeScript(req.body?.content, { targetSeconds, fileIds: files.map(f => f.id) });
    if (!norm.ok) return res.status(400).json({ error: norm.problems.join(' ') });
    const masterAnswers = await loadMasterAnswers(submission.id);
    const dossier = buildDossier({ request, submission, masterAnswers, files });
    const content = { ...norm.script, audit: auditScript(norm.script, dossier), note: clean(req.body?.note, 300) || null };
    const row = await insertScript({ request, source: 'manual', content, language: basedOn?.language || normalizeAnswers(request.answers).preferences.language, tone: basedOn?.tone, targetSeconds, instructions: basedOn?.instructions, basedOnId: basedOn?.id || null, actor });
    await logVpEvent(request.id, { type: 'script_edited', title: `Guion editado a mano (versión ${row.versionNumber})`, detail: content.note, metadata: { scriptId: row.id, versionNumber: Number(row.versionNumber), basedOnId: basedOn?.id || null }, actor, visibility: 'internal' });
    res.status(201).json(await detailOf(await loadRequest(request.id), submission, access));
}, 'changeStatus');

// POST /admin/video-pitch/:id/scripts/:scriptId/current — volver a una versión anterior como vigente.
export const adminSetCurrentScript = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const script = await loadScript(ctx.request.id, clean(req.params.scriptId, 60));
    if (!script) return res.status(404).json({ error: 'Versión no encontrada.' });
    await db.query('UPDATE "VideoPitchRequest" SET "currentScriptId" = $2, "updatedAt" = NOW() WHERE id = $1', [ctx.request.id, script.id]);
    await logVpEvent(ctx.request.id, { type: 'script_restored', title: `Versión ${script.versionNumber} marcada como vigente`, metadata: { scriptId: script.id }, actor: actorFrom(req, access), visibility: 'internal' });
    res.json(await detailOf(await loadRequest(ctx.request.id), ctx.submission, access));
}, 'changeStatus');

// POST /admin/video-pitch/:id/scripts/:scriptId/send — mandar al club para su aprobación.
export const adminSendScript = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const script = await loadScript(ctx.request.id, clean(req.params.scriptId, 60));
    if (!script) return res.status(404).json({ error: 'Versión no encontrada.' });
    const actor = actorFrom(req, access);
    const cfg = await readConfigForSubmission(ctx.submission.eventId || null);
    try {
        await db.query('UPDATE "VideoPitchScript" SET status = \'sent_to_participant\' WHERE id = $1', [script.id]);
        await db.query('UPDATE "VideoPitchRequest" SET "currentScriptId" = $2, "updatedAt" = NOW() WHERE id = $1', [ctx.request.id, script.id]);
        await logVpEvent(ctx.request.id, { type: 'script_sent', title: `Guion (versión ${script.versionNumber}) enviado al club para su aprobación`, metadata: { scriptId: script.id }, actor });
        const fresh = await loadRequest(ctx.request.id);
        if (fresh.status !== 'script_pending_approval') await applyStatus({ request: fresh, submission: ctx.submission, cfg, to: 'script_pending_approval', actor, note: clean(req.body?.note, 1000) || null });
    } catch (e) {
        if (e?.code === 409) return res.status(409).json({ error: e.message });
        throw e;
    }
    res.json(await detailOf(await loadRequest(ctx.request.id), ctx.submission, access));
}, 'changeStatus');

// POST /admin/video-pitch/:id/scripts/:scriptId/approve — el comité aprueba (con o sin el club).
export const adminApproveScript = withSchema(async (req, res, { access }) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const script = await loadScript(ctx.request.id, clean(req.params.scriptId, 60));
    if (!script) return res.status(404).json({ error: 'Versión no encontrada.' });
    const actor = actorFrom(req, access);
    const cfg = await readConfigForSubmission(ctx.submission.eventId || null);
    try {
        await db.query('UPDATE "VideoPitchScript" SET status = \'approved\' WHERE id = $1', [script.id]);
        await db.query('UPDATE "VideoPitchScript" SET status = \'superseded\' WHERE "requestId" = $1 AND id <> $2 AND status = \'approved\'', [ctx.request.id, script.id]);
        await db.query('UPDATE "VideoPitchRequest" SET "approvedScriptId" = $2, "currentScriptId" = $2, "updatedAt" = NOW() WHERE id = $1', [ctx.request.id, script.id]);
        await logVpEvent(ctx.request.id, { type: 'script_approved', title: `Guion (versión ${script.versionNumber}) aprobado por el comité`, detail: clean(req.body?.note, 1000) || null, metadata: { scriptId: script.id, by: 'admin' }, actor });
        const fresh = await loadRequest(ctx.request.id);
        if (fresh.status !== 'script_approved' && canTransition(fresh.status, 'script_approved')) {
            await applyStatus({ request: fresh, submission: ctx.submission, cfg, to: 'script_approved', actor, note: clean(req.body?.note, 1000) || null });
        }
    } catch (e) {
        if (e?.code === 409) return res.status(409).json({ error: e.message });
        throw e;
    }
    res.json(await detailOf(await loadRequest(ctx.request.id), ctx.submission, access));
}, 'changeStatus');

// GET /admin/video-pitch/:id/scripts/:scriptId — una versión, con la lectura de cuánto cabe cada narración.
export const adminGetScript = withSchema(async (req, res) => {
    const ctx = await adminContext(req, res); if (!ctx) return;
    const script = await loadScript(ctx.request.id, clean(req.params.scriptId, 60));
    if (!script) return res.status(404).json({ error: 'Versión no encontrada.' });
    const shaped = shapeScript(script, ctx.request);
    shaped.fit = (script.content?.scenes || []).map(s => ({ number: s.number, ...narrationFits(s.narration, s.durationSec) }));
    res.json(shaped);
}, 'view');

export default {
    portalGet, portalSave, portalSubmit, portalPresign, portalRegisterFile, portalDeleteFile, portalUpdateFile, portalFileUrl,
    portalScriptDecision, portalMessage,
    adminList, adminExportCsv, adminGet, adminUpdate, adminSetStatus, adminComment, adminBulk,
    adminFileUrl, adminPresign, adminRegisterFile, adminDeleteFile,
    adminGenerateScript, adminSaveScript, adminSetCurrentScript, adminSendScript, adminApproveScript, adminGetScript,
};
