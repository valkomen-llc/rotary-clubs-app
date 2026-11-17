// ════════════════════════════════════════════════════════════════════
// Seguimiento documental de los proyectos de la Feria (v4.1332.0)
//
// Convierte «Proyectos postulados» en un centro de control del cumplimiento
// documental: indicadores, detalle por proyecto, revisión del comité,
// aplicabilidad por proyecto, recordatorios con vista previa y registro, la
// configuración (fecha límite y requisitos) y, del lado del club, la ENTREGA
// de la presentación y su propio avance documental.
//
// ⚠️ UNA SOLA CUENTA. Todo porcentaje sale de `trackingOf` (criterio puro) con
// `formProgressOf` (motor de formularios): el mismo número en el listado, el
// detalle, los indicadores, las exportaciones, el correo y «Mi Proyecto».
//
// ⚠️ EL COMITÉ NO EDITA LAS RESPUESTAS DEL CLUB DESDE AQUÍ. Revisar, pedir una
// corrección, marcar «No aplica» u observar escriben SÓLO en
// `ProjectDocumentReview` / el historial: ninguna ruta de este archivo hace
// UPDATE a los formularios, al pago ni al estado del proyecto.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import db from '../lib/db.js';
import { withAccess, actorFrom, buildFilters } from './projectFairAdminController.js';
import {
    readConfigForSubmission, logEvent, sendFairEmail, portalLinkFor, headerLogoHtml, footerBrandingHtml,
} from './projectFairController.js';
import { editability, readRecord, formIsAvailable } from './projectFormsController.js';
import { MASTER_FORM_KEY } from '../lib/projectFormsRegistry.js';
import { fairPostClosePolicyOf, fairFormEditVerdict } from '../lib/projectFairLifecycle.js';
import { ensureProjectDocumentSchema } from '../lib/ensureProjectDocumentSchema.js';
import { loadTracking } from '../lib/projectDocumentTrackingStore.js';
import {
    normalizeTrackingConfig, compactTracking, summarizeTracking, matchesDocFilters, docViewOptions,
    REQUIREMENTS, REQUIREMENT_KEYS, requirementMeta, MODES, REVIEW_KEYS, REMINDER_SCOPES, REMINDER_SCOPE_KEYS,
    inReminderScope, documentReminderVerdict, groupByRecipient, reminderDedupeKey, fmtDateEs, deadlineOf,
} from '../lib/projectDocumentTracking.js';
import {
    checkUploadMeta, judgeUploadedFile, fmtBytes, RESOURCE_FORMATS, ACCEPTED_EXTENSIONS,
} from '../lib/projectFairResourceSpec.js';
import {
    presignResourceUpload, inspectResourceObject, resourceKeyBelongs, resourceObjectExists,
    signedResourceDownload, deleteRejectedObject,
} from '../lib/projectFairResourceStorage.js';

console.log('[projectDocumentTrackingController] v4.1332.0 cargado — Seguimiento documental de proyectos: avance real de Formulación y FDD con el motor de «Mi Proyecto», entrega y validación de la presentación, video, Video Pitch aparte, semáforo con fecha límite configurable y recordatorios con vista previa, tope y registro.');

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SUBJECT = 'Actualización pendiente de documentación — Feria de Proyectos Rotary Colombia';
// La presentación vive bajo el prefijo PRIVADO de los recursos de la Feria,
// en su propio ámbito por proyecto: private/project-fair-resources/club-presentations/{id}/
const PRESENTATION_SCOPE = 'club-presentations';
const MAX_BATCH = 300;

// ════════════════════════════════════════════════════════════════════
// Lectura común
// ════════════════════════════════════════════════════════════════════
const loadSubmission = async (id) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [clean(id, 60)]);
    return rows[0] || null;
};

/** El seguimiento completo de UN proyecto, con la convocatoria de SU edición. */
const trackingFor = async (submission) => {
    const cfg = await readConfigForSubmission(submission.eventId || null);
    const map = await loadTracking([submission], cfg);
    return { cfg, config: normalizeTrackingConfig(cfg.documentTracking), tracking: map.get(submission.id) };
};

/** Lo que se sabe del cierre de la EDICIÓN de formularios (para avisar si choca con la fecha documental). */
const editingCloseOf = (cfg) => {
    const policy = fairPostClosePolicyOf(cfg);
    return {
        applicationsDeadline: cfg?.deadline || null,
        postCloseEnabled: policy.enabled !== false,
        validity: policy.validity,
        until: policy.validity === 'until' ? policy.until : null,
    };
};

const configWarnings = (config, cfg) => {
    const out = [];
    const close = editingCloseOf(cfg);
    const dates = [config.deadline, ...Object.values(config.requirements).map(r => r.deadline)].filter(Boolean);
    if (!close.postCloseEnabled && cfg?.deadline) {
        out.push('La edición posterior al cierre está desactivada: después del cierre de postulaciones los clubes no pueden actualizar sus formularios, aunque haya una fecha límite documental.');
    } else if (close.validity === 'individual') {
        out.push('La edición posterior al cierre es «solo con autorización individual»: los clubes necesitan que el comité les reabra la edición para cumplir la fecha documental.');
    } else if (close.until && dates.some(d => d > close.until)) {
        out.push(`Hay una fecha límite documental posterior al cierre de la edición de formularios (${fmtDateEs(close.until)}): después de ese día los clubes no podrán editar aunque la fecha documental siga vigente.`);
    }
    if (!dates.length) out.push('No hay fecha límite documental: el semáforo no puede priorizar por vencimiento.');
    return out;
};

// ════════════════════════════════════════════════════════════════════
// Comité
// ════════════════════════════════════════════════════════════════════

/**
 * GET /admin/seguimiento-documental?evento=…&<filtros del listado>
 * Indicadores sobre los proyectos que pasan los filtros activos (también los
 * rangos documentales), SIN la vista documental elegida: así cada tarjeta dice
 * cuántos hay en su grupo y sirve de filtro.
 */
export const getSummary = withAccess(async (req, res, { cfg }) => {
    await ensureProjectDocumentSchema();
    const { clause, params } = buildFilters(req.query);
    const { rows } = await db.query(`SELECT * FROM "ProjectFairSubmission" ${clause} ORDER BY "createdAt" DESC LIMIT 5000`, params);
    const tracking = await loadTracking(rows, cfg);
    const list = rows.map(r => tracking.get(r.id)).filter(t => t && matchesDocFilters(t, { ...req.query, doc: undefined }));
    const config = normalizeTrackingConfig(cfg.documentTracking);
    res.json({
        kpis: summarizeTracking(list),
        config,
        requirements: REQUIREMENTS,
        modes: MODES,
        views: docViewOptions(),
        reminderScopes: REMINDER_SCOPES,
        editingClose: editingCloseOf(cfg),
        warnings: configWarnings(config, cfg),
        generatedAt: new Date().toISOString(),
    });
});

// ── Configuración ────────────────────────────────────────────────────
export const getConfig = withAccess(async (req, res, { cfg }) => {
    const config = normalizeTrackingConfig(cfg.documentTracking);
    res.json({
        config, requirements: REQUIREMENTS, modes: MODES,
        editingClose: editingCloseOf(cfg), warnings: configWarnings(config, cfg),
        history: Array.isArray(cfg.documentTrackingHistory) ? cfg.documentTrackingHistory.slice(0, 30) : [],
    });
});

/**
 * PUT /admin/seguimiento-documental/config?evento=… — sólo el perfil con
 * `config`. Se guarda SANEADA en la convocatoria de ESA edición, con una
 * línea de bitácora (quién, cuándo, qué cambió).
 */
export const saveConfig = withAccess(async (req, res, { cfg, access }) => {
    const eventId = clean(req.query?.evento, 60);
    if (!eventId) return res.status(400).json({ error: 'Abre una edición para configurar su seguimiento documental.' });
    const { rows } = await db.query('SELECT config FROM "ProjectFairConfig" WHERE "eventId" = $1 LIMIT 1', [eventId]);
    if (!rows[0]) return res.status(409).json({ error: 'Esta edición todavía no tiene Convocatoria guardada. Guárdala primero.' });
    const before = normalizeTrackingConfig(cfg.documentTracking);
    const next = normalizeTrackingConfig({ ...before, ...(req.body?.config || req.body || {}) });
    const changed = Object.keys(next).filter(k => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
    const actor = actorFrom(req, access);
    const history = [{ at: new Date().toISOString(), by: actor.name, changed, deadline: next.deadline }, ...(Array.isArray(cfg.documentTrackingHistory) ? cfg.documentTrackingHistory : [])].slice(0, 30);
    await db.query(`UPDATE "ProjectFairConfig"
                    SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('documentTracking', $2::jsonb, 'documentTrackingHistory', $3::jsonb),
                        "updatedAt" = NOW()
                    WHERE "eventId" = $1`, [eventId, JSON.stringify(next), JSON.stringify(history)]);
    const merged = { ...cfg, documentTracking: next };
    res.json({ config: next, changed, history, editingClose: editingCloseOf(merged), warnings: configWarnings(next, merged) });
}, 'config');

// ── Detalle de un proyecto ───────────────────────────────────────────
const DOC_EVENT_TYPES = [
    'form_started', 'form_submitted_master', 'project_form_submitted', 'project_form_reviewed', 'form_reopened', 'form_locked',
    'document_review', 'document_applicability', 'document_observation', 'document_reminder',
    'presentation_uploaded', 'template_downloaded', 'project_video_received', 'project_video_approved',
    'video_pitch_requested', 'video_pitch_delivered', 'post_close_reviewed', 'edit_requested',
];

export const getDetail = withAccess(async (req, res, { access }) => {
    await ensureProjectDocumentSchema();
    const submission = await loadSubmission(req.params.id);
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada.' });
    const evento = clean(req.query?.evento, 60);
    if (evento && submission.eventId && evento !== submission.eventId) return res.status(404).json({ error: 'La postulación no pertenece a esta edición.' });
    const { config, tracking } = await trackingFor(submission);
    const [versions, events, reminders] = await Promise.all([
        db.query(`SELECT id, "versionNumber", "fileName", format, "sizeBytes", "uploadedByName", "uploadedByRole", note, "retiredAt", "createdAt"
                  FROM "ProjectPresentationFile" WHERE "submissionId" = $1 ORDER BY "versionNumber" DESC`, [submission.id]).then(r => r.rows),
        db.query(`SELECT id, type, title, detail, "actorName", "actorRole", metadata, "createdAt" FROM "ProjectFairEvent"
                  WHERE "submissionId" = $1 AND type = ANY($2::text[]) ORDER BY "createdAt" DESC LIMIT 80`, [submission.id, DOC_EVENT_TYPES]).then(r => r.rows).catch(() => []),
        db.query(`SELECT id, recipient, status, error, attempts, "sentAt", "createdAt", "actorName", snapshot
                  FROM "ProjectDocumentReminder" WHERE $1 = ANY("submissionIds") ORDER BY "createdAt" DESC LIMIT 30`, [submission.id]).then(r => r.rows),
    ]);
    res.json({
        submission: {
            id: submission.id, publicRef: submission.publicRef, projectName: submission.projectName,
            clubName: submission.clubName, district: submission.district, eventId: submission.eventId,
            responsible: [submission.firstName, submission.lastName].filter(Boolean).join(' '),
            email: submission.email, workflowStatus: submission.workflowStatus || 'received', paymentStatus: submission.status,
            archived: !!submission.archivedAt, updatedAt: submission.updatedAt,
        },
        tracking,
        compact: compactTracking(tracking),
        config,
        presentationVersions: versions.map(v => ({ ...v, sizeLabel: fmtBytes(v.sizeBytes) })),
        events,
        reminders,
        access: { review: !!access.changeStatus, comment: !!access.comment, remind: !!access.changeStatus, config: !!access.config },
    });
});

/** URL firmada (2 min) de una versión de la presentación, para el comité. */
export const adminPresentationUrl = withAccess(async (req, res, { access }) => {
    await ensureProjectDocumentSchema();
    const { rows } = await db.query('SELECT * FROM "ProjectPresentationFile" WHERE id = $1 AND "submissionId" = $2 LIMIT 1', [clean(req.params.fileId, 60), clean(req.params.id, 60)]);
    const file = rows[0];
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
    if (!(await resourceObjectExists(file.storageKey))) return res.status(503).json({ error: 'El archivo no está disponible en el almacenamiento. Pide al club que lo vuelva a cargar.' });
    const url = await signedResourceDownload(file.storageKey, { fileName: file.fileName, contentType: file.contentType });
    await logEvent(file.submissionId, { type: 'document_observation', title: 'Presentación consultada por el comité', detail: `Versión ${file.versionNumber} · ${file.fileName}`, actor: actorFrom(req, access), metadata: { requirement: 'presentation', fileId: file.id, internal: true } });
    res.json({ url, fileName: file.fileName });
});

// ── Revisión del comité ──────────────────────────────────────────────
const REVIEW_LABEL = { in_review: 'En revisión', validated: 'Validado', changes_requested: 'Requiere corrección', clear: 'Sin revisión' };

const correctionHtml = (submission, cfg, reqLabel, note) => {
    const primary = '#17458F';
    const edition = cfg.edition?.name || 'Feria de Proyectos Rotary Colombia';
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:620px;margin:0 auto;padding:24px 0">
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:${primary};color:#fff;padding:26px 32px">${headerLogoHtml(cfg)}<div style="font-size:18px;font-weight:700">${esc(edition)}</div></div>
    <div style="padding:30px 32px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Estimado equipo del club ${esc(submission.clubName)}:</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">El comité organizador revisó <strong>${esc(reqLabel)}</strong> del proyecto <strong>«${esc(submission.projectName)}»</strong> (${esc(submission.publicRef)}) y necesita que hagan una corrección:</p>
      <div style="background:#fff7ed;border-left:3px solid #f97316;padding:14px 18px;border-radius:8px;margin:0 0 18px;font-size:14px;line-height:1.6;white-space:pre-line">${esc(note)}</div>
      <p style="margin:22px 0"><a href="${esc(portalLinkFor(submission, cfg))}" style="display:inline-block;background:${primary};color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">Acceder a Mi Proyecto</a></p>
      <p style="font-size:15px;line-height:1.6;margin:0">Cordialmente,<br>Equipo organizador<br>Feria de Proyectos Rotary Colombia</p>
    </div>
    ${footerBrandingHtml(cfg)}
  </div>
</div>`;
};

/**
 * POST /admin/seguimiento-documental/:id/revision
 * { requirement: 'master'|'fdd_…'|'presentation', status: 'in_review'|'validated'|'changes_requested'|'clear', note?, notify? }
 *
 * Guarda la decisión con la HUELLA de lo revisado. El video NO pasa por aquí:
 * su revisión es la de «Videos de proyectos» (`applyStatus`), con su historial.
 */
export const saveReview = withAccess(async (req, res, { access }) => {
    await ensureProjectDocumentSchema();
    const submission = await loadSubmission(req.params.id);
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada.' });
    const requirement = clean(req.body?.requirement, 40);
    const status = clean(req.body?.status, 30);
    const note = clean(req.body?.note, 2000) || null;
    if (!REQUIREMENT_KEYS.includes(requirement)) return res.status(400).json({ error: 'Requisito desconocido.' });
    if (requirement === 'video') return res.status(409).json({ error: 'La revisión del video se hace en «Videos de proyectos», que guarda su propio historial.', code: 'USE_VIDEO_MODULE' });
    if (![...REVIEW_KEYS, 'clear'].includes(status)) return res.status(400).json({ error: 'Estado de revisión no válido.' });
    if (status === 'changes_requested' && !note) return res.status(400).json({ error: 'Indica qué debe corregir el club: lo verá en «Mi Proyecto».' });

    const { cfg, tracking } = await trackingFor(submission);
    const req0 = tracking.requirements.find(r => r.key === requirement);
    if (!req0?.applies) return res.status(409).json({ error: 'Este requisito no aplica al proyecto.' });
    if (status === 'validated' && !req0.complete) {
        return res.status(409).json({ error: req0.kind === 'form'
            ? `No se puede validar un formulario al ${req0.pct} %: primero debe estar diligenciado por completo.`
            : 'No hay un archivo entregado que validar.' });
    }
    if (status !== 'clear' && req0.kind === 'file' && !req0.fingerprint && status !== 'changes_requested') {
        return res.status(409).json({ error: 'No hay un archivo entregado que revisar.' });
    }
    const actor = actorFrom(req, access);
    await db.query(`
        INSERT INTO "ProjectDocumentReview" ("submissionId", "requirementKey", status, note, fingerprint, "reviewedById", "reviewedBy", "reviewedAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT ("submissionId", "requirementKey") DO UPDATE
        SET status = EXCLUDED.status, note = EXCLUDED.note, fingerprint = EXCLUDED.fingerprint,
            "reviewedById" = EXCLUDED."reviewedById", "reviewedBy" = EXCLUDED."reviewedBy", "reviewedAt" = NOW(), "updatedAt" = NOW()
    `, [submission.id, requirement, status === 'clear' ? null : status, note, req0.fingerprint || null, actor.id, actor.name]);
    const meta = requirementMeta(requirement);
    await logEvent(submission.id, {
        type: 'document_review',
        title: `${meta.label}: ${REVIEW_LABEL[status]}`,
        detail: note,
        actor,
        metadata: { requirement, status, fingerprint: req0.fingerprint || null },
    });
    let notified = null;
    if (status === 'changes_requested' && req.body?.notify !== false && submission.email) {
        const r = await sendFairEmail({ to: submission.email, subject: `Corrección solicitada — ${meta.label} — Feria de Proyectos Rotary Colombia`, html: correctionHtml(submission, cfg, meta.label, note), cfg });
        notified = !!r?.success;
        if (!notified) console.warn('[document-tracking] no se pudo avisar la corrección:', r?.error);
    }
    const fresh = await trackingFor(submission);
    res.json({ ok: true, notified, tracking: fresh.tracking, compact: compactTracking(fresh.tracking) });
}, 'changeStatus');

/**
 * POST /admin/seguimiento-documental/:id/aplicabilidad
 * { requirement, applicability: 'not_applicable'|'required'|null, reason }
 * «No aplica» para ESTE proyecto (p. ej. no solicita FDD). Con motivo y en el
 * historial: el 100 % sin ese requisito tiene que poder explicarse.
 */
export const saveApplicability = withAccess(async (req, res, { access }) => {
    await ensureProjectDocumentSchema();
    const submission = await loadSubmission(req.params.id);
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada.' });
    const requirement = clean(req.body?.requirement, 40);
    const raw = req.body?.applicability;
    const applicability = raw === 'not_applicable' || raw === 'required' ? raw : null;
    const reason = clean(req.body?.reason, 600) || null;
    if (!REQUIREMENT_KEYS.includes(requirement)) return res.status(400).json({ error: 'Requisito desconocido.' });
    if (applicability && !reason) return res.status(400).json({ error: 'Indica el motivo: queda en el historial del proyecto.' });
    const actor = actorFrom(req, access);
    await db.query(`
        INSERT INTO "ProjectDocumentReview" ("submissionId", "requirementKey", applicability, "applicabilityReason", "applicabilityBy", "applicabilityAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT ("submissionId", "requirementKey") DO UPDATE
        SET applicability = EXCLUDED.applicability, "applicabilityReason" = EXCLUDED."applicabilityReason",
            "applicabilityBy" = EXCLUDED."applicabilityBy", "applicabilityAt" = NOW(), "updatedAt" = NOW()
    `, [submission.id, requirement, applicability, reason, actor.name]);
    const meta = requirementMeta(requirement);
    await logEvent(submission.id, {
        type: 'document_applicability',
        title: `${meta.label}: ${applicability === 'not_applicable' ? 'no aplica a este proyecto' : applicability === 'required' ? 'obligatorio para este proyecto' : 'vuelve a la regla de la Convocatoria'}`,
        detail: reason, actor, metadata: { requirement, applicability },
    });
    const fresh = await trackingFor(submission);
    res.json({ ok: true, tracking: fresh.tracking, compact: compactTracking(fresh.tracking) });
}, 'changeStatus');

/** POST /admin/seguimiento-documental/:id/observacion { requirement?, note } — nota INTERNA en el historial. */
export const addObservation = withAccess(async (req, res, { access }) => {
    const submission = await loadSubmission(req.params.id);
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada.' });
    const note = clean(req.body?.note, 2000);
    if (!note) return res.status(400).json({ error: 'Escribe la observación.' });
    const requirement = REQUIREMENT_KEYS.includes(clean(req.body?.requirement, 40)) ? clean(req.body.requirement, 40) : null;
    const ev = await logEvent(submission.id, {
        type: 'document_observation',
        title: requirement ? `Observación · ${requirementMeta(requirement).label}` : 'Observación documental',
        detail: note, actor: actorFrom(req, access), metadata: { requirement, internal: true },
    });
    res.json({ ok: true, event: ev });
}, 'comment');

// ── Recordatorios ────────────────────────────────────────────────────
const pct = (r) => (!r ? '—' : !r.applies ? 'No aplica' : `${r.pct} %`);

/** El correo para UN destinatario con uno o varios proyectos. */
export const buildDocumentReminderHtml = ({ recipient, items, cfg, config }) => {
    const primary = '#17458F';
    const clubs = [...new Set(items.map(i => i.submission.clubName).filter(Boolean))].join(', ');
    const link = portalLinkFor(items[0].submission, cfg);
    const blocks = items.map(({ submission, tracking }) => {
        const f = tracking.requirements.find(r => r.key === 'master');
        const fdd = tracking.requirements.find(r => r.key === 'fdd_2026_2027');
        const pend = tracking.pending.map(p => {
            const req = tracking.requirements.find(r => r.key === p.key);
            const secciones = req?.kind === 'form' && req.sections ? req.sections.filter(s => !s.complete).map(s => s.title).slice(0, 6) : [];
            return `<li style="margin:0 0 6px">${esc(p.label)} — ${esc(p.detail)}${secciones.length ? `<br><span style="color:#64748b;font-size:13px">Secciones por completar: ${esc(secciones.join(' · '))}</span>` : ''}${p.deadline ? `<br><span style="color:#b45309;font-size:13px">Fecha límite: ${esc(fmtDateEs(p.deadline))}</span>` : ''}</li>`;
        }).join('');
        return `
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin:0 0 16px">
        <p style="margin:0 0 8px;font-size:15px"><strong>Proyecto:</strong> ${esc(submission.projectName)} <span style="color:#64748b">(${esc(submission.publicRef)})</span></p>
        <p style="margin:0 0 4px;font-size:14px"><strong>Club:</strong> ${esc(submission.clubName)}</p>
        <p style="margin:0 0 4px;font-size:14px"><strong>Avance documental:</strong> ${tracking.overallPct} %</p>
        <p style="margin:0 0 4px;font-size:14px"><strong>Avance de formulación:</strong> ${pct(f)}</p>
        <p style="margin:0 0 10px;font-size:14px"><strong>Avance de solicitud FDD:</strong> ${pct(fdd)}</p>
        <p style="margin:0 0 6px;font-size:14px"><strong>Documentación pendiente:</strong></p>
        <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5">${pend || '<li>—</li>'}</ul>
      </div>`;
    }).join('');
    const deadline = config.deadline ? fmtDateEs(config.deadline) : null;
    const note = config.reminderNote ? `<p style="font-size:14px;line-height:1.6;margin:0 0 14px;white-space:pre-line">${esc(config.reminderNote)}</p>` : '';
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:24px 0">
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:${primary};color:#fff;padding:26px 32px">${headerLogoHtml(cfg)}<div style="font-size:18px;font-weight:700">${esc(cfg.edition?.name || 'Feria de Proyectos Rotary Colombia')}</div></div>
    <div style="padding:30px 32px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Estimado equipo del club${clubs ? ` ${esc(clubs)}` : ''}:</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 18px">Durante la revisión del estado de ${items.length > 1 ? 'sus proyectos' : 'su proyecto'}, identificamos que todavía existen campos o documentos pendientes de completar.</p>
      ${blocks}
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Les invitamos a ingresar a la sección «Mi Proyecto» para completar o actualizar la información${deadline ? ` antes del <strong>${esc(deadline)}</strong>` : ''}.</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:#475569">Para actualizar: ingresen con el correo del responsable (${esc(recipient.email)}), abran cada formulario pendiente desde «Mi Proyecto» y guarden los cambios; las presentaciones y videos se cargan desde sus tarjetas en la misma página.</p>
      ${note}
      <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:${primary};color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">Acceder a Mi Proyecto</a></p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Agradecemos su colaboración para mantener actualizada la información de los proyectos participantes.</p>
      <p style="font-size:15px;line-height:1.6;margin:0">Equipo organizador<br>Feria de Proyectos Rotary Colombia</p>
    </div>
    ${footerBrandingHtml(cfg)}
  </div>
</div>`;
};

/** ¿Puede el club editar ahora sus formularios? (para no pedirle algo imposible). */
const formsOpenFor = (row, cfg) => {
    if (!formIsAvailable(row, cfg)) return false;
    return fairFormEditVerdict(row, cfg, MASTER_FORM_KEY, null).canEdit !== false;
};

/** El PLAN de un envío: quién lo recibe, quién no y por qué. No envía nada. */
const planReminders = async ({ cfg, eventId, scope, ids }) => {
    const config = normalizeTrackingConfig(cfg.documentTracking);
    let rows;
    if (scope === 'seleccion') {
        const q = await db.query(`SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[]) AND "eventId" = $2`, [ids, eventId]);
        rows = q.rows;
    } else {
        const { clause, params } = buildFilters({ evento: eventId, archivadas: 'activas' });
        rows = (await db.query(`SELECT * FROM "ProjectFairSubmission" ${clause} ORDER BY "createdAt" ASC LIMIT 2000`, params)).rows;
    }
    const tracking = await loadTracking(rows, cfg);
    const plan = [];
    for (const row of rows) {
        const t = tracking.get(row.id);
        if (!t) continue;
        if (scope !== 'seleccion' && !inReminderScope(t, scope)) continue;
        const v = documentReminderVerdict({ submission: row, tracking: t, config, formsOpen: formsOpenFor(row, cfg) });
        plan.push({
            id: row.id, publicRef: row.publicRef, projectName: row.projectName, clubName: row.clubName, email: row.email,
            name: [row.firstName, row.lastName].filter(Boolean).join(' '),
            overallPct: t.overallPct, pending: t.pending.map(p => p.short), reminderCount: t.reminderCount, lastReminderAt: t.lastReminderAt,
            send: v.ok, code: v.code, reason: v.reason,
            _row: row, _t: t,
        });
    }
    const recipients = groupByRecipient(plan.filter(p => p.send)).slice(0, MAX_BATCH);
    return { config, plan, recipients };
};

const publicPlan = (plan) => plan.map(({ _row, _t, ...rest }) => rest);

/**
 * POST /admin/seguimiento-documental/recordatorios?evento=…
 * { scope, ids?, confirm? }
 *
 * Sin `confirm: true` NO envía: devuelve el plan y la VISTA PREVIA del correo.
 * Con confirmación, un correo por DESTINATARIO (un responsable con dos
 * proyectos recibe uno con los dos), cada uno registrado antes de salir con
 * una huella única por día: un doble clic no manda dos correos.
 */
export const sendReminders = withAccess(async (req, res, { cfg, access }) => {
    await ensureProjectDocumentSchema();
    const eventId = clean(req.query?.evento, 60);
    if (!eventId) return res.status(400).json({ error: 'Abre una edición para enviar recordatorios: sin ella se mezclarían ferias.' });
    const scope = REMINDER_SCOPE_KEYS.includes(clean(req.body?.scope, 30)) ? clean(req.body.scope, 30) : 'incompletos';
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => clean(x, 60)).filter(Boolean).slice(0, 500) : [];
    if (scope === 'seleccion' && !ids.length) return res.status(400).json({ error: 'Selecciona al menos un proyecto.' });

    const { config, plan, recipients } = await planReminders({ cfg, eventId, scope, ids });
    const htmlFor = (rcp) => buildDocumentReminderHtml({
        recipient: rcp, cfg, config,
        items: rcp.projects.map(p => ({ submission: p._row, tracking: p._t })),
    });

    if (req.body?.confirm !== true) {
        return res.json({
            preview: true, scope,
            plan: publicPlan(plan),
            recipients: recipients.map(r => ({ email: r.email, name: r.name, projects: r.projects.map(p => ({ id: p.id, publicRef: p.publicRef, projectName: p.projectName })) })),
            willSend: recipients.length,
            projects: recipients.reduce((a, r) => a + r.projects.length, 0),
            skipped: plan.filter(p => !p.send).length,
            sample: recipients[0] ? { to: recipients[0].email, subject: SUBJECT, html: htmlFor(recipients[0]) } : null,
            deadline: config.deadline,
            limits: config.reminders,
        });
    }

    const actor = actorFrom(req, access);
    const batchId = randomUUID();
    const outcomes = [];
    for (const rcp of recipients) {
        const subIds = rcp.projects.map(p => p.id);
        const snapshot = { projects: rcp.projects.map(p => ({ id: p.id, publicRef: p.publicRef, projectName: p.projectName, overallPct: p.overallPct, pending: p.pending })), deadline: config.deadline };
        const ins = await db.query(`
            INSERT INTO "ProjectDocumentReminder" ("batchId", "eventId", recipient, "recipientName", "submissionIds", subject, snapshot, status, "dedupeKey", "actorId", "actorName")
            VALUES ($1, $2, $3, $4, $5::text[], $6, $7::jsonb, 'queued', $8, $9, $10)
            ON CONFLICT ("dedupeKey") DO NOTHING RETURNING id
        `, [batchId, eventId, rcp.email, rcp.name || null, subIds, SUBJECT, JSON.stringify(snapshot), reminderDedupeKey(rcp.email, subIds), actor.id, actor.name]);
        if (!ins.rows[0]) { outcomes.push({ email: rcp.email, status: 'duplicate', projects: subIds.length }); continue; }
        const id = ins.rows[0].id;
        const r = await sendFairEmail({ to: rcp.email, subject: SUBJECT, html: htmlFor(rcp), cfg });
        await db.query(`UPDATE "ProjectDocumentReminder" SET status = $2, error = $3, attempts = attempts + 1, "sentAt" = CASE WHEN $2 = 'sent' THEN NOW() ELSE "sentAt" END, "updatedAt" = NOW() WHERE id = $1`,
            [id, r?.success ? 'sent' : 'failed', r?.success ? null : clean(r?.error || 'No se pudo enviar', 500)]);
        if (r?.success) {
            for (const p of rcp.projects) {
                await logEvent(p.id, { type: 'document_reminder', title: 'Recordatorio de documentación enviado', detail: `Enviado a ${rcp.email} · avance ${p.overallPct} % · pendiente: ${p.pending.join(', ')}`, actor, metadata: { reminderId: id, batchId } });
            }
        }
        outcomes.push({ id, email: rcp.email, status: r?.success ? 'sent' : 'failed', error: r?.success ? null : (r?.error || 'No se pudo enviar'), projects: subIds.length });
    }
    res.json({
        preview: false, batchId,
        sent: outcomes.filter(o => o.status === 'sent').length,
        failed: outcomes.filter(o => o.status === 'failed').length,
        duplicates: outcomes.filter(o => o.status === 'duplicate').length,
        skipped: publicPlan(plan.filter(p => !p.send)),
        outcomes,
    });
}, 'changeStatus');

/** GET /admin/seguimiento-documental/recordatorios?evento=… — el registro de envíos. */
export const listReminders = withAccess(async (req, res) => {
    await ensureProjectDocumentSchema();
    const eventId = clean(req.query?.evento, 60);
    const { rows } = await db.query(`
        SELECT r.id, r."batchId", r.recipient, r."recipientName", r."submissionIds", r.status, r.error, r.attempts, r."sentAt", r."createdAt", r."actorName", r.snapshot
        FROM "ProjectDocumentReminder" r WHERE ($1::text IS NULL OR r."eventId" = $1) ORDER BY r."createdAt" DESC LIMIT 300
    `, [eventId || null]);
    res.json({
        reminders: rows,
        totals: { sent: rows.filter(r => r.status === 'sent').length, failed: rows.filter(r => r.status === 'failed').length },
    });
});

/** POST /admin/seguimiento-documental/recordatorios/:id/reintentar — sólo un envío FALLIDO, con los datos de hoy. */
export const retryReminder = withAccess(async (req, res, { cfg, access }) => {
    await ensureProjectDocumentSchema();
    const { rows } = await db.query('SELECT * FROM "ProjectDocumentReminder" WHERE id = $1 LIMIT 1', [clean(req.params.reminderId, 60)]);
    const rem = rows[0];
    if (!rem) return res.status(404).json({ error: 'Envío no encontrado.' });
    if (rem.status !== 'failed') return res.status(409).json({ error: 'Sólo se reintenta un envío fallido.' });
    const subs = (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[])', [rem.submissionIds])).rows;
    const editionCfg = subs[0] ? await readConfigForSubmission(subs[0].eventId || null) : cfg;
    const config = normalizeTrackingConfig(editionCfg.documentTracking);
    const tracking = await loadTracking(subs, editionCfg);
    const items = subs.map(s => ({ submission: s, tracking: tracking.get(s.id) })).filter(i => i.tracking && !i.tracking.complete);
    if (!items.length) {
        await db.query(`UPDATE "ProjectDocumentReminder" SET status = 'cancelled', error = 'La documentación ya está completa: no se reintenta.', "updatedAt" = NOW() WHERE id = $1`, [rem.id]);
        return res.json({ ok: true, status: 'cancelled' });
    }
    const r = await sendFairEmail({ to: rem.recipient, subject: SUBJECT, html: buildDocumentReminderHtml({ recipient: { email: rem.recipient }, items, cfg: editionCfg, config }), cfg: editionCfg });
    await db.query(`UPDATE "ProjectDocumentReminder" SET status = $2, error = $3, attempts = attempts + 1, "sentAt" = CASE WHEN $2 = 'sent' THEN NOW() ELSE "sentAt" END, "updatedAt" = NOW() WHERE id = $1`,
        [rem.id, r?.success ? 'sent' : 'failed', r?.success ? null : clean(r?.error || 'No se pudo enviar', 500)]);
    if (r?.success) {
        const actor = actorFrom(req, access);
        for (const i of items) await logEvent(i.submission.id, { type: 'document_reminder', title: 'Recordatorio de documentación enviado (reintento)', detail: `Enviado a ${rem.recipient}`, actor, metadata: { reminderId: rem.id } });
    }
    res.json({ ok: !!r?.success, status: r?.success ? 'sent' : 'failed', error: r?.success ? null : (r?.error || 'No se pudo enviar') });
}, 'changeStatus');

// ════════════════════════════════════════════════════════════════════
// Club («Mi Proyecto»)
// ════════════════════════════════════════════════════════════════════
const portalCtx = async (req, res) => {
    await ensureProjectDocumentSchema();
    const submission = await loadSubmission(req.portal?.submissionId);
    if (!submission) { res.status(404).json({ error: 'No encontramos tu inscripción.' }); return null; }
    const cfg = await readConfigForSubmission(submission.eventId || null);
    const { rows } = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "submissionId" = $1 LIMIT 1', [submission.id]);
    return { submission, cfg, account: rows[0] || null };
};

/**
 * La presentación sigue la MISMA regla de edición que la Formulación
 * (`editability`): si el club puede editar su proyecto —antes del cierre, en
 * el período posterior autorizado o con «Reabrir edición»—, puede entregarla.
 * Además: no se reemplaza una presentación EN REVISIÓN o VALIDADA (está en
 * manos del comité); una corrección pedida sí se atiende con un archivo nuevo.
 */
const presentationVerdict = async (ctx, tracking) => {
    const master = await readRecord(ctx.submission.id, MASTER_FORM_KEY).catch(() => null);
    const edit = editability(ctx.submission, master, ctx.cfg, ctx.account, MASTER_FORM_KEY);
    const req0 = tracking.requirements.find(r => r.key === 'presentation');
    if (!req0?.applies) return { canUpload: false, reason: 'La presentación no aplica a este proyecto.' };
    if (!edit.canEdit) return { canUpload: false, reason: edit.reason || 'La edición del proyecto está cerrada.' };
    if (req0.status?.key === 'validated') return { canUpload: false, reason: 'El comité ya validó tu presentación. Si necesitas cambiarla, escríbele al comité organizador.' };
    if (req0.status?.key === 'in_review') return { canUpload: false, reason: 'El comité está revisando tu presentación. Podrás reemplazarla si te pide una corrección.' };
    return { canUpload: true, reason: null };
};

/** Lo que el club ve de su seguimiento: sin notas internas ni datos del comité. */
const clubView = (t, config) => ({
    overallPct: t.overallPct,
    docStatus: t.docStatus,
    complete: t.complete,
    risk: t.risk,
    deadline: config.deadline,
    pending: t.pending,
    requirements: t.requirements.map(r => ({
        key: r.key, kind: r.kind, label: r.label, short: r.short, applies: r.applies, counts: r.counts,
        pct: r.pct, complete: r.complete, status: r.status, deadline: r.deadline,
        // La corrección pedida es para el club: la ve con su texto.
        correction: r.review === 'changes_requested' || r.status?.key === 'changes_requested' ? (r.reviewNote || null) : null,
        validated: r.review === 'validated',
        sections: r.kind === 'form' ? (r.sections || []).map(s => ({ title: s.title, pct: s.pct, complete: s.complete })) : undefined,
        missingCount: r.kind === 'form' ? (r.missing?.length || 0) : undefined,
        invalidCount: r.kind === 'form' ? (r.invalid?.length || 0) : undefined,
    })),
});

/** GET /portal/document-status — el avance documental del PROPIO proyecto (sale del token). */
export const portalStatus = async (req, res) => {
    try {
        const ctx = await portalCtx(req, res); if (!ctx) return;
        const config = normalizeTrackingConfig(ctx.cfg.documentTracking);
        const t = (await loadTracking([ctx.submission], ctx.cfg)).get(ctx.submission.id);
        res.json({ enabled: config.enabled, tracking: clubView(t, config) });
    } catch (error) {
        console.error('[document-tracking] portalStatus:', error);
        res.status(500).json({ error: 'No pudimos cargar el avance documental.' });
    }
};

const presentationPayload = async (ctx) => {
    const config = normalizeTrackingConfig(ctx.cfg.documentTracking);
    const t = (await loadTracking([ctx.submission], ctx.cfg)).get(ctx.submission.id);
    const req0 = t.requirements.find(r => r.key === 'presentation');
    const verdict = await presentationVerdict(ctx, t);
    const { rows } = await db.query(`SELECT id, "versionNumber", "fileName", format, "sizeBytes", "createdAt" FROM "ProjectPresentationFile"
                                     WHERE "submissionId" = $1 ORDER BY "versionNumber" DESC LIMIT 20`, [ctx.submission.id]);
    return {
        requirement: { applies: req0.applies, mode: req0.mode, status: req0.status, deadline: deadlineOf(config, 'presentation'), correction: req0.review === 'changes_requested' || req0.status?.key === 'changes_requested' ? req0.reviewNote : null },
        current: req0.file,
        versions: rows.map(v => ({ ...v, sizeLabel: fmtBytes(v.sizeBytes) })),
        canUpload: verdict.canUpload,
        reason: verdict.reason,
        maxMb: config.presentationMaxMb,
        accept: ACCEPTED_EXTENSIONS,
        formats: Object.values(RESOURCE_FORMATS).map(f => f.short),
    };
};

/** GET /portal/presentation */
export const portalPresentation = async (req, res) => {
    try {
        const ctx = await portalCtx(req, res); if (!ctx) return;
        res.json(await presentationPayload(ctx));
    } catch (error) {
        console.error('[document-tracking] portalPresentation:', error);
        res.status(500).json({ error: 'No pudimos cargar la presentación.' });
    }
};

/** POST /portal/presentation/presign { fileName, size } — URL de subida directa a S3. */
export const portalPresentationPresign = async (req, res) => {
    try {
        const ctx = await portalCtx(req, res); if (!ctx) return;
        const t = (await loadTracking([ctx.submission], ctx.cfg)).get(ctx.submission.id);
        const v = await presentationVerdict(ctx, t);
        if (!v.canUpload) return res.status(403).json({ error: v.reason });
        const config = normalizeTrackingConfig(ctx.cfg.documentTracking);
        const meta = checkUploadMeta({ filename: clean(req.body?.fileName, 200), size: req.body?.size, maxMb: config.presentationMaxMb });
        if (!meta.ok) return res.status(400).json({ error: meta.errores.join(' ') });
        const up = await presignResourceUpload({ scope: PRESENTATION_SCOPE, key: ctx.submission.id, filename: clean(req.body?.fileName, 200) });
        res.json(up);
    } catch (error) {
        console.error('[document-tracking] portalPresentationPresign:', error);
        res.status(500).json({ error: 'No pudimos preparar la carga. Inténtalo de nuevo.' });
    }
};

/**
 * POST /portal/presentation { storageKey, fileName, note? }
 * Registra la versión SÓLO después de mirar el objeto real (peso de S3 y
 * bytes): «Cargada» es lo que el servidor puede afirmar. Un objeto rechazado
 * se borra.
 */
export const portalPresentationRegister = async (req, res) => {
    try {
        const ctx = await portalCtx(req, res); if (!ctx) return;
        const t = (await loadTracking([ctx.submission], ctx.cfg)).get(ctx.submission.id);
        const v = await presentationVerdict(ctx, t);
        if (!v.canUpload) return res.status(403).json({ error: v.reason });
        const storageKey = clean(req.body?.storageKey, 400);
        const fileName = clean(req.body?.fileName, 200);
        if (!resourceKeyBelongs(storageKey, PRESENTATION_SCOPE, ctx.submission.id)) return res.status(400).json({ error: 'El archivo no corresponde a tu proyecto.' });
        const config = normalizeTrackingConfig(ctx.cfg.documentTracking);
        let obj;
        try { obj = await inspectResourceObject(storageKey); }
        catch { return res.status(422).json({ error: 'El archivo no llegó al almacenamiento. Vuelve a intentarlo.' }); }
        const verdict = judgeUploadedFile({ filename: fileName, bytes: obj.bytes, head: obj.head, tail: obj.tail, maxMb: config.presentationMaxMb });
        if (!verdict.ok) { await deleteRejectedObject(storageKey); return res.status(400).json({ error: verdict.error }); }
        const note = clean(req.body?.note, 600) || null;
        let row = null;
        for (let i = 0; i < 3 && !row; i++) {
            const ins = await db.query(`
                INSERT INTO "ProjectPresentationFile" ("submissionId", "eventId", "versionNumber", "storageKey", "fileName", format, "contentType", "sizeBytes", note, "uploadedById", "uploadedByName", "uploadedByRole")
                SELECT $1, $2, COALESCE(MAX("versionNumber"), 0) + 1, $3, $4, $5, $6, $7, $8, $9, $10, 'club'
                FROM "ProjectPresentationFile" WHERE "submissionId" = $1
                ON CONFLICT DO NOTHING RETURNING *
            `, [ctx.submission.id, ctx.submission.eventId || null, storageKey, fileName, verdict.format, verdict.contentType, obj.bytes, note, ctx.account?.id || null, ctx.submission.email]);
            row = ins.rows[0] || null;
            if (!row) {
                const dup = await db.query('SELECT * FROM "ProjectPresentationFile" WHERE "storageKey" = $1 LIMIT 1', [storageKey]);
                if (dup.rows[0]) row = dup.rows[0];
            }
        }
        if (!row) return res.status(409).json({ error: 'No pudimos registrar la versión. Vuelve a intentarlo.' });
        await logEvent(ctx.submission.id, {
            type: 'presentation_uploaded',
            title: `Presentación del proyecto: versión ${row.versionNumber} cargada`,
            detail: `${row.fileName} · ${fmtBytes(row.sizeBytes)}`,
            actor: { name: ctx.submission.email, role: 'club' },
            metadata: { fileId: row.id, versionNumber: row.versionNumber },
        });
        await db.query(`UPDATE "ProjectFairSubmission" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lastClubEditAt', NOW()::text) WHERE id = $1`, [ctx.submission.id]).catch(() => {});
        res.status(201).json(await presentationPayload(ctx));
    } catch (error) {
        console.error('[document-tracking] portalPresentationRegister:', error);
        res.status(500).json({ error: 'No pudimos registrar la presentación.' });
    }
};

/** GET /portal/presentation/:fileId/url — el club descarga SU archivo. */
export const portalPresentationUrl = async (req, res) => {
    try {
        const ctx = await portalCtx(req, res); if (!ctx) return;
        const { rows } = await db.query('SELECT * FROM "ProjectPresentationFile" WHERE id = $1 AND "submissionId" = $2 LIMIT 1', [clean(req.params.fileId, 60), ctx.submission.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Archivo no encontrado.' });
        if (!(await resourceObjectExists(rows[0].storageKey))) return res.status(503).json({ error: 'El archivo no está disponible. Vuelve a cargarlo.' });
        res.json({ url: await signedResourceDownload(rows[0].storageKey, { fileName: rows[0].fileName, contentType: rows[0].contentType }) });
    } catch (error) {
        console.error('[document-tracking] portalPresentationUrl:', error);
        res.status(500).json({ error: 'No pudimos preparar la descarga.' });
    }
};

export default {
    getSummary, getConfig, saveConfig, getDetail, adminPresentationUrl, saveReview, saveApplicability, addObservation,
    sendReminders, listReminders, retryReminder, buildDocumentReminderHtml,
    portalStatus, portalPresentation, portalPresentationPresign, portalPresentationRegister, portalPresentationUrl,
};
