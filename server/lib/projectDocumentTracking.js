// ════════════════════════════════════════════════════════════════════
// Seguimiento documental de los proyectos — el CRITERIO, puro (v4.1332.0)
//
// Sin base de datos ni red. Recibe lo que ya está guardado (respuestas de los
// formularios, archivo de la presentación, video propio, Video Pitch,
// revisiones del comité, recordatorios) y decide, para UN proyecto:
//
//   · el avance de cada formulario  → `formProgressOf` del motor (el MISMO
//     que usa «Mi Proyecto»: no hay un segundo cálculo),
//   · el estado de entrega de cada archivo,
//   · la validación administrativa de cada requisito,
//   · el avance documental global, sólo sobre lo que APLICA,
//   · el semáforo de cumplimiento frente a la fecha límite,
//   · qué falta, para el panel de detalle y para el recordatorio.
//
// ⚠️ TRES COSAS DISTINTAS QUE NO SE MEZCLAN:
//   1. DILIGENCIADO  — un formulario al 100 % (campos obligatorios válidos).
//   2. ENTREGADO     — un archivo recibido y guardado por el servidor.
//   3. VALIDADO      — el comité lo revisó y lo dio por bueno.
// El avance documental mide 1 y 2. La validación es otra columna.
//
// ⚠️ EL VIDEO PITCH PROFESIONAL ES UN SERVICIO, NO UN REQUISITO: se muestra
// aparte y nunca suma ni resta al avance documental. Su pago tampoco es el de
// la inscripción.
// ════════════════════════════════════════════════════════════════════
import { formProgressOf } from './projectFormEngine.js';

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const clampInt = (v, min, max, def) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const dateOrNull = (v) => (typeof v === 'string' && DATE_RE.test(v.trim()) && !Number.isNaN(new Date(`${v.trim()}T00:00:00Z`).getTime()) ? v.trim() : null);

/** Fin del día en Colombia (UTC-5), la hora de corte de toda la Feria. */
export const endOfDayBogota = (date) => (dateOrNull(date) ? new Date(`${date}T23:59:59-05:00`).getTime() : null);

// ── Requisitos ───────────────────────────────────────────────────────
/**
 * Los requisitos documentales que el comité puede exigir. `kind`:
 *   form  — se mide por avance (formulario del proyecto),
 *   file  — se mide por entrega (archivo).
 * Las claves de formulario son las del registro (`projectFormsRegistry.js`).
 */
export const FDD_KEY = 'fdd_2026_2027';
export const REQUIREMENTS = [
    { key: 'master', kind: 'form', label: 'Formulación del proyecto', short: 'Formulación' },
    { key: FDD_KEY, kind: 'form', label: 'Solicitud de Aportes del FDD', short: 'FDD' },
    { key: 'presentation', kind: 'file', label: 'Presentación del proyecto', short: 'Presentación' },
    { key: 'video', kind: 'file', label: 'Video del proyecto', short: 'Video' },
];
export const REQUIREMENT_KEYS = REQUIREMENTS.map(r => r.key);
export const requirementMeta = (key) => REQUIREMENTS.find(r => r.key === key) || null;

export const MODES = [
    { key: 'required', label: 'Obligatorio' },
    { key: 'optional', label: 'Opcional (se muestra, no suma al avance)' },
    { key: 'not_applicable', label: 'No aplica' },
];
const MODE_KEYS = MODES.map(m => m.key);

/**
 * Configuración de fábrica. Decisión de diseño, no del código: TODO se cambia
 * en la Convocatoria (`cfg.documentTracking`). No hay ninguna fecha escrita
 * aquí: sin fecha límite el semáforo dice «sin fecha límite».
 */
export const DOCUMENT_TRACKING_DEFAULTS = {
    enabled: true,
    deadline: null,
    requirements: {
        master: { mode: 'required', weight: 1, deadline: null },
        [FDD_KEY]: { mode: 'required', weight: 1, deadline: null },
        presentation: { mode: 'required', weight: 1, deadline: null },
        video: { mode: 'required', weight: 1, deadline: null },
    },
    // Semáforo: «urgente» a N días o menos del vencimiento; «atención» a M.
    urgentDays: 3,
    attentionDays: 10,
    // «Sin actividad reciente»: días sin que el club toque nada.
    inactivityDays: 14,
    // Recordatorios: intervalo mínimo y tope por proyecto.
    reminders: { enabled: true, minDays: 3, max: 5 },
    // Instrucciones adicionales que van en el correo (texto plano).
    reminderNote: '',
    // Tope de la presentación que entrega el club (PDF o PPTX).
    presentationMaxMb: 50,
};

/** La configuración de UNA edición, saneada sobre la de fábrica. */
export const normalizeTrackingConfig = (raw) => {
    const r = isPlainObject(raw) ? raw : {};
    const d = DOCUMENT_TRACKING_DEFAULTS;
    const requirements = {};
    for (const req of REQUIREMENTS) {
        const inc = isPlainObject(r.requirements?.[req.key]) ? r.requirements[req.key] : {};
        const def = d.requirements[req.key];
        requirements[req.key] = {
            mode: MODE_KEYS.includes(inc.mode) ? inc.mode : def.mode,
            weight: Math.min(10, Math.max(0.1, Number(inc.weight) > 0 ? Number(inc.weight) : def.weight)),
            deadline: dateOrNull(inc.deadline),
        };
    }
    const urgentDays = clampInt(r.urgentDays, 0, 60, d.urgentDays);
    return {
        enabled: r.enabled !== false,
        deadline: dateOrNull(r.deadline),
        requirements,
        urgentDays,
        attentionDays: Math.max(urgentDays, clampInt(r.attentionDays, 0, 120, d.attentionDays)),
        inactivityDays: clampInt(r.inactivityDays, 1, 180, d.inactivityDays),
        reminders: {
            enabled: r.reminders?.enabled !== false,
            minDays: clampInt(r.reminders?.minDays, 1, 60, d.reminders.minDays),
            max: clampInt(r.reminders?.max, 1, 20, d.reminders.max),
        },
        reminderNote: String(r.reminderNote ?? '').trim().slice(0, 1200),
        presentationMaxMb: clampInt(r.presentationMaxMb, 1, 200, d.presentationMaxMb),
    };
};

/** Fecha límite de UN requisito: la suya o, si no tiene, la general. */
export const deadlineOf = (config, key) => config?.requirements?.[key]?.deadline || config?.deadline || null;

// ── Validación administrativa ────────────────────────────────────────
export const REVIEW_STATUSES = [
    { key: 'in_review', label: 'En revisión' },
    { key: 'validated', label: 'Validado' },
    { key: 'changes_requested', label: 'Requiere corrección' },
];
export const REVIEW_KEYS = REVIEW_STATUSES.map(s => s.key);

/**
 * La revisión vale para lo que el comité VIO. Se guarda la huella de lo
 * revisado (`fingerprint`): la fecha de edición de un formulario o el id de la
 * versión de un archivo. Si el club cambió algo después, la revisión queda
 * «desactualizada» y el requisito vuelve a «pendiente de revisión», sin que
 * nadie tenga que acordarse de reabrirla.
 */
export const reviewApplies = (review, fingerprint) =>
    !!review?.status && REVIEW_KEYS.includes(review.status)
    && (!review.fingerprint || !fingerprint || String(review.fingerprint) === String(fingerprint));

// ── Estados de entrega de los archivos ───────────────────────────────
export const DELIVERY_STATES = {
    pending:           { label: 'Pendiente', tone: 'amber', delivered: false },
    uploaded:          { label: 'Cargada', tone: 'blue', delivered: true },
    in_review:         { label: 'En revisión', tone: 'indigo', delivered: true },
    validated:         { label: 'Validada', tone: 'emerald', delivered: true },
    changes_requested: { label: 'Requiere corrección', tone: 'orange', delivered: false },
    rejected:          { label: 'Rechazado', tone: 'red', delivered: false },
    not_applicable:    { label: 'No aplica', tone: 'slate', delivered: false },
};
const VIDEO_LABELS = { uploaded: 'Cargado', validated: 'Validado' };

/**
 * Presentación. El archivo lo guarda el servidor (versión vigente); la
 * validación es la revisión del comité sobre ESA versión.
 */
export const presentationStateOf = ({ file, review }) => {
    if (!file) {
        // Una corrección pedida sin archivo nuevo sigue siendo «requiere corrección».
        return review?.status === 'changes_requested' ? 'changes_requested' : 'pending';
    }
    if (reviewApplies(review, file.id)) {
        if (review.status === 'validated') return 'validated';
        if (review.status === 'changes_requested') return 'changes_requested';
        if (review.status === 'in_review') return 'in_review';
    }
    return 'uploaded';
};

/**
 * Video propio del club. Su revisión vive en SU módulo («Videos de
 * proyectos», con `applyStatus`); aquí sólo se traduce a los estados comunes.
 */
export const videoStateOf = (video) => {
    const s = String(video?.status || 'none');
    if (!video || s === 'none' || s === 'draft' || s === 'withdrawn' || !video.currentVersionId) {
        return s === 'changes_requested' ? 'changes_requested' : 'pending';
    }
    if (s === 'approved') return 'validated';
    if (s === 'in_review') return 'in_review';
    if (s === 'changes_requested') return 'changes_requested';
    if (s === 'rejected') return 'rejected';
    return 'uploaded'; // received
};

// ── Video Pitch Profesional (servicio, aparte) ───────────────────────
export const PITCH_STATES = {
    not_requested:   { label: 'No solicitado', tone: 'slate' },
    draft:           { label: 'Solicitud en borrador', tone: 'slate' },
    requested:       { label: 'Solicitado', tone: 'blue' },
    payment_pending: { label: 'Pago pendiente', tone: 'amber' },
    in_production:   { label: 'En producción', tone: 'indigo' },
    delivered:       { label: 'Entregado', tone: 'emerald' },
    cancelled:       { label: 'Cancelado', tone: 'slate' },
};
export const pitchStateOf = (req) => {
    if (!req) return 'not_requested';
    const s = String(req.status || '');
    if (s === 'cancelled') return 'cancelled';
    if (s === 'delivered') return 'delivered';
    if (s === 'draft') return 'draft';
    const commercial = String(req.commercialStatus || 'no_plan');
    const cleared = commercial === 'paid' || req.paymentWaived === true;
    if (['in_production', 'video_in_review', 'finished'].includes(s)) return 'in_production';
    if (!cleared && ['pending_payment', 'processing', 'failed', 'plan_selected'].includes(commercial)) return 'payment_pending';
    return 'requested';
};

// ── El cálculo de UN proyecto ────────────────────────────────────────
const FORM_REVIEW_LABEL = { validated: 'Validado', changes_requested: 'Requiere corrección', in_review: 'En revisión' };

const formStatusLabel = (pct, started) => {
    if (!started || pct <= 0) return { key: 'not_started', label: 'Sin iniciar' };
    if (pct >= 100) return { key: 'complete', label: 'Diligenciado' };
    if (pct < 50) return { key: 'incomplete', label: 'Incompleto' };
    return { key: 'in_progress', label: 'En progreso' };
};

const applicabilityOf = (config, key, review) => {
    const forced = review?.applicability;
    if (forced === 'not_applicable') return { mode: 'not_applicable', source: 'project', reason: review?.applicabilityReason || null };
    if (forced === 'required') return { mode: 'required', source: 'project', reason: review?.applicabilityReason || null };
    return { mode: config.requirements[key]?.mode || 'required', source: 'policy', reason: null };
};

/**
 * Seguimiento documental de UN proyecto.
 *
 * @param {object}  p
 * @param {object}  p.submission  fila de `ProjectFairSubmission`
 * @param {Array}   p.forms       [{ key, title, template, record }] (formularios vigentes)
 * @param {object}  p.presentation { file } versión vigente o null
 * @param {object}  p.video       fila de `ProjectVideo` (o null)
 * @param {object}  p.pitch       fila de `VideoPitchRequest` (o null)
 * @param {object}  p.reviews     { [requirementKey]: fila de `ProjectDocumentReview` }
 * @param {Array}   p.reminders   fechas de los recordatorios ENVIADOS
 * @param {object}  p.config      `normalizeTrackingConfig(...)`
 */
export const trackingOf = ({ submission = {}, forms = [], presentation = null, video = null, pitch = null, reviews = {}, reminders = [], config, now = Date.now() }) => {
    const cfg = config || normalizeTrackingConfig(null);
    const requirements = [];

    for (const meta of REQUIREMENTS) {
        const review = reviews?.[meta.key] || null;
        const app = applicabilityOf(cfg, meta.key, review);
        const base = {
            key: meta.key, kind: meta.kind, label: meta.label, short: meta.short,
            mode: app.mode, applies: app.mode !== 'not_applicable', counts: app.mode === 'required',
            applicabilitySource: app.source, applicabilityReason: app.reason,
            deadline: deadlineOf(cfg, meta.key),
            review: null, reviewNote: null, reviewedAt: null, reviewedBy: null, reviewStale: false,
        };

        if (meta.kind === 'form') {
            const form = forms.find(f => f.key === meta.key) || null;
            if (!form) {
                // El formulario no existe en esta edición (apagado en la plantilla):
                // no se le puede pedir al club.
                requirements.push({ ...base, mode: 'not_applicable', applies: false, counts: false, available: false, pct: 0, status: { key: 'not_applicable', label: 'No aplica' }, progress: 0, complete: false });
                continue;
            }
            const record = form.record || null;
            const prog = formProgressOf(form.template, record?.answers || {});
            const started = !!record;
            const fp = record?.lastEditedAt ? new Date(record.lastEditedAt).toISOString() : null;
            const reviewOk = reviewApplies(review, fp);
            requirements.push({
                ...base,
                title: form.title,
                available: true,
                pct: started ? prog.pct : 0,
                progress: started ? prog.pct / 100 : 0,
                complete: started && prog.pct >= 100,
                status: base.applies ? formStatusLabel(started ? prog.pct : 0, started) : { key: 'not_applicable', label: 'No aplica' },
                submitted: record?.status === 'submitted',
                submittedAt: record?.submittedAt || null,
                lastEditedAt: record?.lastEditedAt || null,
                districtReview: record?.reviewStatus || null,
                sections: prog.sections.map(s => ({ key: s.key, title: s.title, pct: started ? s.pct : 0, total: s.total, done: started ? s.done : 0, complete: started && s.complete })),
                missing: prog.missing,
                invalid: prog.invalid,
                requiredTotal: prog.total,
                requiredDone: started ? prog.done : 0,
                review: reviewOk ? review.status : null,
                reviewLabel: reviewOk ? FORM_REVIEW_LABEL[review.status] : null,
                reviewNote: review?.note || null,
                reviewedAt: review?.reviewedAt || null,
                reviewedBy: review?.reviewedBy || null,
                reviewStale: !!review?.status && REVIEW_KEYS.includes(review.status) && !reviewOk,
                fingerprint: fp,
            });
            continue;
        }

        // Archivos
        let key;
        let extra = {};
        if (meta.key === 'presentation') {
            const file = presentation?.file || null;
            key = presentationStateOf({ file, review });
            extra = {
                file: file ? { id: file.id, fileName: file.fileName, format: file.format, sizeBytes: Number(file.sizeBytes) || 0, versionNumber: file.versionNumber, uploadedAt: file.createdAt, uploadedByName: file.uploadedByName || null } : null,
                versions: presentation?.versions || (file ? 1 : 0),
                fingerprint: file?.id || null,
                review: reviewApplies(review, file?.id) ? review.status : null,
                reviewNote: review?.note || null,
                reviewedAt: review?.reviewedAt || null,
                reviewedBy: review?.reviewedBy || null,
                reviewStale: !!file && !!review?.status && REVIEW_KEYS.includes(review.status) && !reviewApplies(review, file.id),
            };
        } else {
            key = videoStateOf(video);
            extra = {
                videoId: video?.id || null,
                videoStatus: video?.status || 'none',
                file: video?.currentVersionId ? { id: video.currentVersionId, fileName: video.cvFileName || null, uploadedAt: video.submittedAt || video.updatedAt || null } : null,
                review: key === 'validated' ? 'validated' : key === 'changes_requested' ? 'changes_requested' : key === 'in_review' ? 'in_review' : null,
                reviewNote: video?.reviewNote || null,
                reviewedAt: video?.reviewedAt || null,
                fingerprint: video?.currentVersionId || null,
            };
        }
        const stateKey = base.applies ? key : 'not_applicable';
        const st = DELIVERY_STATES[stateKey];
        const label = meta.key === 'video' && VIDEO_LABELS[stateKey] ? VIDEO_LABELS[stateKey] : st.label;
        requirements.push({
            ...base, ...extra,
            available: true,
            status: { key: stateKey, label, tone: st.tone },
            delivered: base.applies && st.delivered,
            complete: base.applies && st.delivered,
            progress: base.applies && st.delivered ? 1 : 0,
            pct: base.applies && st.delivered ? 100 : 0,
        });
    }

    // ── Avance documental global (sólo lo obligatorio que aplica) ─────
    const counted = requirements.filter(r => r.counts && r.applies);
    const weight = (r) => cfg.requirements[r.key]?.weight || 1;
    const totalWeight = counted.reduce((a, r) => a + weight(r), 0);
    const allComplete = counted.length > 0 && counted.every(r => r.complete);
    const rawOverall = totalWeight ? counted.reduce((a, r) => a + weight(r) * r.progress, 0) / totalWeight * 100 : 0;
    const overallPct = !counted.length ? 100 : (allComplete ? 100 : Math.min(99, Math.round(rawOverall)));
    const formsCounted = counted.filter(r => r.kind === 'form');
    const formsPct = formsCounted.length
        ? (formsCounted.every(r => r.complete) ? 100 : Math.min(99, Math.round(formsCounted.reduce((a, r) => a + r.pct, 0) / formsCounted.length)))
        : null;
    const filesCounted = counted.filter(r => r.kind === 'file');
    const filesDelivered = filesCounted.filter(r => r.delivered).length;

    const docStatus = !counted.length
        ? { key: 'complete', label: 'Sin requisitos aplicables' }
        : allComplete ? { key: 'complete', label: 'Documentación diligenciada' }
            : overallPct >= 80 ? { key: 'almost', label: 'Casi completo' }
                : overallPct > 0 ? { key: 'pending', label: 'Información pendiente' }
                    : { key: 'not_started', label: 'Sin iniciar' };

    // ── Validación administrativa (aparte del avance) ─────────────────
    const applicable = requirements.filter(r => r.applies && r.counts);
    const needsCorrection = applicable.filter(r => r.review === 'changes_requested' || r.status?.key === 'changes_requested' || r.status?.key === 'rejected');
    const readyForReview = applicable.filter(r => r.complete && r.review !== 'validated' && r.review !== 'changes_requested');
    const validated = applicable.filter(r => r.review === 'validated');
    const validation = needsCorrection.length
        ? { key: 'changes_requested', label: 'Requiere correcciones', count: needsCorrection.length }
        : (applicable.length && validated.length === applicable.length)
            ? { key: 'validated', label: 'Validado' }
            : readyForReview.length
                ? { key: 'pending_review', label: 'Pendiente de validación', count: readyForReview.length }
                : validated.length
                    ? { key: 'partial', label: 'Validación parcial', count: validated.length }
                    : { key: 'not_ready', label: 'Sin documentación por revisar' };

    // ── Qué falta (para el detalle y el recordatorio) ─────────────────
    const pending = counted.filter(r => !r.complete).map(r => ({
        key: r.key, label: r.label, short: r.short, kind: r.kind,
        detail: r.kind === 'form'
            ? `${r.pct} % diligenciado${r.missing?.length ? ` · ${r.missing.length} campo${r.missing.length === 1 ? '' : 's'} obligatorio${r.missing.length === 1 ? '' : 's'} sin responder` : ''}${r.invalid?.length ? ` · ${r.invalid.length} con formato incorrecto` : ''}`
            : r.status.label,
        deadline: r.deadline,
    }));

    // ── Semáforo frente a la fecha límite ─────────────────────────────
    // Días de CALENDARIO en Colombia (no horas): el 19 visto el 17 es «en 2
    // días» a cualquier hora del 17.
    const pendingDates = pending.map(p => dateOrNull(p.deadline)).filter(Boolean).sort();
    const nearestDate = pendingDates[0] || null;
    const nearest = nearestDate ? endOfDayBogota(nearestDate) : null;
    const todayBogota = new Date(now - 5 * 3600_000).toISOString().slice(0, 10);
    const daysLeft = nearestDate === null ? null : Math.round((Date.parse(`${nearestDate}T00:00:00Z`) - Date.parse(`${todayBogota}T00:00:00Z`)) / DAY);
    let risk;
    if (!pending.length) risk = { key: 'complete', label: 'Al día', tone: 'emerald' };
    else if (nearest === null) risk = { key: 'no_deadline', label: 'Sin fecha límite', tone: 'slate' };
    else if (now > nearest) risk = { key: 'overdue', label: `Vencido hace ${Math.max(1, Math.abs(daysLeft))} día${Math.abs(daysLeft) === 1 ? '' : 's'}`, tone: 'red' };
    else if (daysLeft <= cfg.urgentDays) risk = { key: 'urgent', label: daysLeft <= 0 ? 'Vence hoy' : `Vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`, tone: 'red' };
    else if (daysLeft <= cfg.attentionDays) risk = { key: 'attention', label: `Vence en ${daysLeft} días`, tone: 'amber' };
    else risk = { key: 'on_track', label: `${daysLeft} días para el cierre`, tone: 'sky' };
    // Prioridad de seguimiento: lo vencido y lo próximo primero; a igual
    // plazo, el que menos avanzó. Un número para ordenar, no para mostrar.
    const riskRank = { overdue: 0, urgent: 1, attention: 2, on_track: 3, no_deadline: 4, complete: 9 }[risk.key];
    const priority = riskRank * 1000 + (daysLeft === null ? 500 : Math.max(-499, Math.min(499, daysLeft))) + overallPct / 1000;

    // ── Actividad y recordatorios ─────────────────────────────────────
    const stamps = [
        submission?.metadata?.lastClubEditAt, submission?.appliedAt, submission?.createdAt,
        ...requirements.map(r => r.lastEditedAt || r.file?.uploadedAt),
        video?.lastEditedAt, pitch?.lastEditedAt,
    ].map(v => (v ? new Date(v).getTime() : NaN)).filter(Number.isFinite);
    const lastActivityAt = stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
    const inactive = !lastActivityAt || (now - new Date(lastActivityAt).getTime()) > cfg.inactivityDays * DAY;
    const sent = (reminders || []).map(d => new Date(d).getTime()).filter(Number.isFinite).sort((a, b) => b - a);

    const pitchKey = pitchStateOf(pitch);
    return {
        overallPct,
        formsPct,
        filesDelivered,
        filesRequired: filesCounted.length,
        docStatus,
        complete: allComplete || !counted.length,
        validation,
        risk: { ...risk, daysLeft, deadline: nearest ? new Date(nearest).toISOString() : null },
        priority,
        requirements,
        pending,
        pitch: { key: pitchKey, label: PITCH_STATES[pitchKey].label, tone: PITCH_STATES[pitchKey].tone, number: pitch?.number || null, requestId: pitch?.id || null },
        lastActivityAt,
        inactive,
        reminderCount: sent.length,
        lastReminderAt: sent.length ? new Date(sent[0]).toISOString() : null,
    };
};

/** Lo que viaja en cada fila del listado: lo justo para las columnas. */
export const compactTracking = (t) => ({
    overallPct: t.overallPct,
    docStatus: t.docStatus,
    complete: t.complete,
    validation: t.validation,
    risk: t.risk,
    pitch: t.pitch,
    lastActivityAt: t.lastActivityAt,
    inactive: t.inactive,
    reminderCount: t.reminderCount,
    lastReminderAt: t.lastReminderAt,
    pendingCount: t.pending.length,
    requirements: t.requirements.map(r => ({
        key: r.key, kind: r.kind, short: r.short, mode: r.mode, applies: r.applies, counts: r.counts,
        pct: r.pct, complete: r.complete, status: r.status, review: r.review || null, reviewStale: !!r.reviewStale,
        submitted: r.submitted || false,
    })),
});

// ── Filtros, indicadores y orden ─────────────────────────────────────
const req = (t, key) => t.requirements.find(r => r.key === key);
const pendingReq = (t, key) => { const r = req(t, key); return !!r && r.counts && r.applies && !r.complete; };

export const DOC_VIEWS = [
    { key: 'completa', label: 'Documentación completa', test: (t) => t.complete },
    { key: 'incompleta', label: 'Documentación incompleta', test: (t) => !t.complete },
    { key: 'formulacion', label: 'Formulación inferior al 100 %', test: (t) => pendingReq(t, 'master') },
    { key: 'fdd', label: 'FDD inferior al 100 %', test: (t) => pendingReq(t, FDD_KEY) },
    { key: 'presentacion', label: 'Presentación pendiente', test: (t) => pendingReq(t, 'presentation') },
    { key: 'video', label: 'Video pendiente', test: (t) => pendingReq(t, 'video') },
    { key: 'por_validar', label: 'Entregada, pendiente de revisión', test: (t) => t.validation.key === 'pending_review' },
    { key: 'correcciones', label: 'Requieren correcciones', test: (t) => t.validation.key === 'changes_requested' },
    { key: 'sin_actividad', label: 'Sin actividad reciente', test: (t) => t.inactive && !t.complete },
    { key: 'recordatorio_pendiente', label: 'Recordatorio pendiente', test: (t) => !t.complete && t.reminderCount === 0 },
    { key: 'recordatorio_enviado', label: 'Recordatorio enviado', test: (t) => t.reminderCount > 0 },
    { key: 'urgentes', label: 'Vencidos o por vencer', test: (t) => ['overdue', 'urgent'].includes(t.risk.key) },
];
export const DOC_VIEW_KEYS = DOC_VIEWS.map(v => v.key);
export const docViewOptions = () => DOC_VIEWS.map(({ key, label }) => ({ key, label }));

const dateStart = (v) => (dateOrNull(v) ? new Date(`${v}T00:00:00-05:00`).getTime() : null);

/** ¿Pasa el proyecto los filtros documentales de la petición? */
export const matchesDocFilters = (t, query = {}) => {
    const view = DOC_VIEWS.find(v => v.key === String(query.doc || ''));
    if (view && !view.test(t)) return false;
    const min = query.docMin === undefined || query.docMin === '' ? null : Number(query.docMin);
    const max = query.docMax === undefined || query.docMax === '' ? null : Number(query.docMax);
    if (Number.isFinite(min) && t.overallPct < min) return false;
    if (Number.isFinite(max) && t.overallPct > max) return false;
    const from = dateStart(query.actividadDesde);
    const to = dateOrNull(query.actividadHasta) ? endOfDayBogota(query.actividadHasta) : null;
    const last = t.lastActivityAt ? new Date(t.lastActivityAt).getTime() : null;
    if (from !== null && (last === null || last < from)) return false;
    if (to !== null && (last === null || last > to)) return false;
    return true;
};

/** ¿La petición trae algún filtro u orden documental? (decide el camino del listado) */
export const DOC_SORTS = { docOverall: 'overallPct', docMaster: 'master', docFdd: FDD_KEY, docPriority: 'priority', docActivity: 'lastActivityAt' };
export const hasDocQuery = (query = {}) =>
    DOC_VIEW_KEYS.includes(String(query.doc || ''))
    || ['docMin', 'docMax', 'actividadDesde', 'actividadHasta'].some(k => query[k] !== undefined && query[k] !== '')
    || Object.prototype.hasOwnProperty.call(DOC_SORTS, String(query.sortBy || ''));

/** Valor para ordenar por una clave documental. */
export const docSortValue = (t, sortBy) => {
    const k = DOC_SORTS[sortBy];
    if (k === 'overallPct') return t.overallPct;
    if (k === 'priority') return t.priority;
    if (k === 'lastActivityAt') return t.lastActivityAt ? new Date(t.lastActivityAt).getTime() : 0;
    const r = req(t, k);
    return r && r.applies ? r.pct : -1;
};

/** Indicadores sobre un conjunto de proyectos (los de los filtros activos). */
export const summarizeTracking = (list = []) => {
    const count = (fn) => list.filter(fn).length;
    return {
        total: list.length,
        complete: count(t => t.complete),
        incomplete: count(t => !t.complete),
        pendingMaster: count(t => pendingReq(t, 'master')),
        pendingFdd: count(t => pendingReq(t, FDD_KEY)),
        pendingPresentation: count(t => pendingReq(t, 'presentation')),
        pendingVideo: count(t => pendingReq(t, 'video')),
        pendingValidation: count(t => t.validation.key === 'pending_review'),
        changesRequested: count(t => t.validation.key === 'changes_requested'),
        validated: count(t => t.validation.key === 'validated'),
        urgent: count(t => ['overdue', 'urgent'].includes(t.risk.key)),
        inactive: count(t => t.inactive && !t.complete),
        reminded: count(t => t.reminderCount > 0),
        averagePct: list.length ? Math.round(list.reduce((a, t) => a + t.overallPct, 0) / list.length) : 0,
    };
};

// ── Recordatorios ────────────────────────────────────────────────────
export const REMINDER_SCOPES = [
    { key: 'seleccion', label: 'Los proyectos seleccionados' },
    { key: 'incompletos', label: 'Todos los proyectos incompletos' },
    { key: 'formulacion', label: 'Sólo los que tienen la Formulación pendiente' },
    { key: 'fdd', label: 'Sólo los que tienen el FDD pendiente' },
    { key: 'documentos', label: 'Sólo los que tienen documentos (presentación o video) pendientes' },
];
export const REMINDER_SCOPE_KEYS = REMINDER_SCOPES.map(s => s.key);

export const inReminderScope = (t, scope) => {
    if (scope === 'formulacion') return pendingReq(t, 'master');
    if (scope === 'fdd') return pendingReq(t, FDD_KEY);
    if (scope === 'documentos') return pendingReq(t, 'presentation') || pendingReq(t, 'video');
    return !t.complete; // incompletos y selección: sólo a quien le falta algo
};

/**
 * ¿Se le puede escribir a ESTE proyecto ahora? Sólo a una obligación real:
 * postulado, no archivado, ni retirado/rechazado/cerrado, con algo pendiente,
 * con el formulario abierto para él (si no puede editar, recordarle es
 * pedirle algo imposible), dentro del intervalo y el tope configurados.
 */
export const documentReminderVerdict = ({ submission, tracking, config, formsOpen = true, now = Date.now() }) => {
    const cfg = config || normalizeTrackingConfig(null);
    if (!cfg.enabled || !cfg.reminders.enabled) return { ok: false, code: 'disabled', reason: 'Los recordatorios de documentación están desactivados en la configuración.' };
    if (!submission?.email) return { ok: false, code: 'no_email', reason: 'El proyecto no tiene correo del responsable.' };
    if (submission?.archivedAt) return { ok: false, code: 'archived', reason: 'El proyecto está archivado.' };
    const state = String(submission?.workflowStatus || 'received');
    if (['draft', 'formulating'].includes(state)) return { ok: false, code: 'draft', reason: 'Todavía es un borrador: no se ha postulado.' };
    if (['withdrawn', 'rejected', 'closed'].includes(state)) return { ok: false, code: 'closed', reason: 'El proyecto está retirado, rechazado o cerrado.' };
    if (tracking?.complete) return { ok: false, code: 'complete', reason: 'La documentación ya está completa.' };
    if (!formsOpen) return { ok: false, code: 'forms_closed', reason: 'El club no puede editar sus formularios ahora (pago pendiente, cierre o bloqueo del comité).' };
    const count = Number(tracking?.reminderCount) || 0;
    const last = tracking?.lastReminderAt ? new Date(tracking.lastReminderAt).getTime() : null;
    if (count >= cfg.reminders.max) return { ok: false, code: 'cap', reason: `Ya recibió ${count} recordatorio${count === 1 ? '' : 's'} de documentación (máximo ${cfg.reminders.max}).` };
    if (last !== null && now - last < cfg.reminders.minDays * DAY) {
        return { ok: false, code: 'too_soon', reason: `Recibió un recordatorio hace menos de ${cfg.reminders.minDays} día${cfg.reminders.minDays === 1 ? '' : 's'}.` };
    }
    return { ok: true, code: null, reason: null };
};

/**
 * Agrupa los proyectos a escribir por DESTINATARIO: un responsable con dos
 * proyectos recibe UN correo que detalla los dos (sin duplicar el envío y sin
 * perder el detalle de cada uno).
 */
export const groupByRecipient = (items = []) => {
    const map = new Map();
    for (const it of items) {
        const email = String(it.email || '').trim().toLowerCase();
        if (!email) continue;
        if (!map.has(email)) map.set(email, { email, name: it.name || '', projects: [] });
        map.get(email).projects.push(it);
    }
    return [...map.values()];
};

/** Huella de un envío: el mismo destinatario, los mismos proyectos, el mismo día → no se repite. */
export const reminderDedupeKey = (email, ids = [], now = Date.now()) => {
    const day = new Date(now - 5 * 3600_000).toISOString().slice(0, 10);
    return `${String(email).toLowerCase()}|${[...ids].sort().join(',')}|${day}`;
};

export const fmtDateEs = (date) => (dateOrNull(date)
    ? new Date(`${date}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' })
    : null);

export default {
    REQUIREMENTS, DOCUMENT_TRACKING_DEFAULTS, normalizeTrackingConfig, trackingOf, compactTracking,
    DOC_VIEWS, matchesDocFilters, summarizeTracking, documentReminderVerdict, groupByRecipient,
};
