// ════════════════════════════════════════════════════════════════════════════
// Seguimiento y verificación de traducciones por Cadres — el CRITERIO (v4.1356.0)
//
// Puro: sin base, sin red, sin reloj propio (`now` entra por parámetro). Se
// apoya en el estado que YA deriva el expediente (`translationStatus` de
// `projectDossier.js`): no hay un segundo cálculo de qué campo está
// traducido, revisado o desactualizado. Lo que agrega:
//
//   · el estado de SEGUIMIENTO de la traducción para el listado (sin traducir,
//     en progreso, pendiente de revisión, en revisión, verificada, requiere
//     actualización), derivado — nunca escrito —;
//   · los DOS porcentajes (traducción y revisión) sobre los campos aplicables;
//   · la regla de VERIFICACIÓN (qué bloquea, qué exige justificación);
//   · la VIGENCIA: una verificación vale para la huella exacta que se revisó;
//   · filtros, orden, indicadores, carga por Cadre y recordatorios.
//
// ⚠️ UNA SOLA FUENTE DE VERDAD. La verificación ES la aprobación de siempre
// (`ProjectDossierTranslation.approved*` + una fila inmutable en
// `ProjectDossierTranslationVersion`), reforzada: ya no hay un botón
// «Aprobar» y otro «Verificar». Lo que distingue una verificación de una
// aprobación heredada (anterior a v4.1356) es `approvalKind = 'verification'`:
// las heredadas NO se certifican retroactivamente.
// ════════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';

const str = (v) => (v === null || v === undefined ? '' : String(v));
const hashOf = (text) => crypto.createHash('sha256').update(str(text), 'utf8').digest('hex').slice(0, 24);

export const VERIFICATION_KIND = 'verification';

// ── Estados del seguimiento ────────────────────────────────────────────────
// `tone` es el color institucional que pinta el cliente; `order` ordena la
// columna de «menos avanzada» a «verificada».
export const TRACKING_STATES = {
    no_content: { label: 'Sin textos para traducir', short: 'Sin textos', tone: 'slate', order: 0 },
    untranslated: { label: 'Sin traducir', short: 'Sin traducir', tone: 'slate', order: 1 },
    in_progress: { label: 'Traducción en progreso', short: 'En progreso', tone: 'sky', order: 2 },
    pending_review: { label: 'Pendiente de revisión', short: 'Por revisar', tone: 'orange', order: 3 },
    in_review: { label: 'En revisión', short: 'En revisión', tone: 'blue', order: 4 },
    needs_update: { label: 'Requiere actualización', short: 'Actualizar', tone: 'red', order: 5 },
    verified: { label: 'Verificada', short: 'Verificada', tone: 'emerald', order: 6 },
};
export const TRACKING_KEYS = Object.keys(TRACKING_STATES);

// Avisos que NO se resuelven con una justificación: un correo o un enlace que
// cambió en la traducción es un dato equivocado en la ficha oficial. Cifras y
// largo pueden tener explicación («dos» escrito en letras, una frase que en
// inglés es más corta): se justifican por escrito al verificar.
export const BLOCKING_WARNING_CODES = new Set(['emails', 'urls']);
export const JUSTIFICATION_MIN = 15;

/** Porcentaje entero que sólo llega a 100 cuando TODO está (199/200 → 99). */
export const pctOf = (n, total) => {
    if (!total) return null;
    if (n >= total) return 100;
    return Math.min(99, Math.floor((n / total) * 100));
};

/**
 * ¿La aprobación guardada en la cabecera es una VERIFICACIÓN (v4.1356) o una
 * aprobación heredada? Sólo la primera certifica.
 */
export const isVerification = (header) => !!(header?.approvedAt && header?.approvalKind === VERIFICATION_KIND);

/**
 * El seguimiento de UNA traducción.
 *
 * @param status  translationStatus(...) del expediente (con o sin `fields`)
 * @param header  fila de ProjectDossierTranslation (o null)
 * @returns objeto compacto, apto para el listado, los filtros y las exportaciones
 */
export const trackingOf = (status, header = null) => {
    const counts = status?.counts || { missing: 0, draft: 0, reviewed: 0, outdated: 0 };
    const total = Number(status?.total) || 0;
    const valid = (counts.draft || 0) + (counts.reviewed || 0);
    const reviewed = counts.reviewed || 0;
    const verified = isVerification(header);
    const legacyApproved = !!(header?.approvedAt && !verified);
    const vigente = verified && status?.state === 'approved';
    // La verificación perdió vigencia por un cambio del ORIGINAL (un campo
    // quedó desactualizado o apareció uno nuevo), o la barrida ya lo registró
    // para esta misma versión: sigue «Requiere actualización» aunque el Cadre
    // ya haya retraducido los campos, hasta que se vuelva a verificar.
    const sourceChanged = (counts.outdated || 0) > 0 || (counts.missing || 0) > 0;
    const invalidatedThisVersion = !!(header?.invalidatedAt && header?.invalidatedVersionId && header.invalidatedVersionId === header.approvedVersionId);

    let state;
    if (!total) state = 'no_content';
    else if (vigente) state = 'verified';
    else if (verified && (sourceChanged || invalidatedThisVersion)) state = 'needs_update';
    else if (status?.state === 'generating') state = 'in_progress';
    else if (valid === 0) state = (counts.outdated || 0) > 0 ? 'in_progress' : 'untranslated';
    else if ((counts.missing || 0) > 0 || (counts.outdated || 0) > 0) state = 'in_progress';
    else if (reviewed === 0) state = 'pending_review';
    else state = 'in_review';

    const meta = TRACKING_STATES[state];
    return {
        state, label: meta.label, tone: meta.tone,
        total, translated: valid, reviewed,
        missing: counts.missing || 0, unreviewed: counts.draft || 0, outdated: counts.outdated || 0,
        translatedPct: pctOf(valid, total), reviewedPct: pctOf(reviewed, total),
        warnings: Number(status?.warnings) || 0,
        readyToVerify: total > 0 && !vigente && !counts.missing && !counts.outdated && !counts.draft && status?.state !== 'generating',
        generating: status?.state === 'generating',
        lastError: status?.lastError || null,
        verification: header?.approvedAt ? {
            kind: verified ? VERIFICATION_KIND : 'legacy',
            at: header.approvedAt, by: header.approvedBy || null, role: header.approvedRole || null,
            versionId: header.approvedVersionId || null, versionNumber: header.approvedVersionNumber ?? null,
            fieldCount: header.approvedFieldCount ?? null,
            vigente: verified ? vigente : false,
        } : null,
        legacyApproved,
        invalidatedAt: invalidatedThisVersion ? header.invalidatedAt : null,
        invalidatedPaths: invalidatedThisVersion && Array.isArray(header.invalidatedPaths) ? header.invalidatedPaths : [],
        revokedAt: header?.revokedAt || null,
        revokeReason: header?.revokedAt ? (header.revokeReason || null) : null,
        assignee: header?.assigneeEmail ? { email: header.assigneeEmail, name: header.assigneeName || null, assignedAt: header.assignedAt || null, assignedBy: header.assignedBy || null } : null,
    };
};

/** La huella del ORIGINAL que se traduce (qué textos en español, en qué versión). */
export const sourceFingerprintOf = (items = []) => hashOf(
    [...items].sort((a, b) => str(a.path).localeCompare(str(b.path))).map(i => `${i.path}|${i.hash}`).join('\n'));

// ── Verificar ──────────────────────────────────────────────────────────────
/**
 * ¿Se puede verificar? Devuelve el motivo exacto cuando no.
 *
 * Exige: textos para traducir, ninguna generación en curso, todo traducido,
 * nada desactualizado, todo revisado por una persona, ningún aviso
 * BLOQUEANTE, una justificación escrita si quedan avisos no bloqueantes, que
 * quien verifica no sea el responsable del proyecto y que lo que se verifica
 * sea exactamente lo que la persona tenía en pantalla.
 */
export const verificationCheck = (status, {
    justification = '', expectedFingerprint = null, currentFingerprint = null,
    actorEmail = '', projectEmail = '',
} = {}) => {
    const fields = Array.isArray(status?.fields) ? status.fields : [];
    const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
    if (!status || !status.total) return fail('no_content', 'Este proyecto no tiene textos para traducir todavía.');
    if (actorEmail && projectEmail && str(actorEmail).trim().toLowerCase() === str(projectEmail).trim().toLowerCase()) {
        return fail('self_certification', 'Quien es responsable del proyecto no puede verificar su propia traducción.');
    }
    if (status.state === 'generating') return fail('generating', 'Hay una traducción en curso: espera a que termine.');
    if (status.counts.missing) return fail('missing', `Faltan ${status.counts.missing} campo(s) por traducir.`);
    if (status.counts.outdated) return fail('outdated', `${status.counts.outdated} campo(s) cambiaron en español después de traducirse: revísalos antes de verificar.`);
    if (status.counts.draft) return fail('unreviewed', `Faltan ${status.counts.draft} campo(s) por marcar como revisados.`);
    const withWarnings = fields.filter(f => f.state !== 'missing' && Array.isArray(f.warnings) && f.warnings.length);
    const blocking = withWarnings.filter(f => f.warnings.some(w => BLOCKING_WARNING_CODES.has(w.code)))
        .map(f => ({ path: f.path, label: f.label, warnings: f.warnings.filter(w => BLOCKING_WARNING_CODES.has(w.code)) }));
    if (blocking.length) {
        return fail('blocking_warnings', `${blocking.length} campo(s) tienen un correo o un enlace distinto del original: corrígelos antes de verificar.`, { blocking });
    }
    const nonBlocking = withWarnings.map(f => ({ path: f.path, label: f.label, warnings: f.warnings }));
    if (nonBlocking.length && str(justification).trim().length < JUSTIFICATION_MIN) {
        return fail('needs_justification', `${nonBlocking.length} campo(s) tienen avisos (cifras o largo distinto del original). Escribe por qué la traducción es correcta (mínimo ${JUSTIFICATION_MIN} caracteres).`, { needsJustification: true, needsAcknowledge: true, nonBlocking });
    }
    if (expectedFingerprint && currentFingerprint && expectedFingerprint !== currentFingerprint) {
        return fail('changed', 'La traducción cambió mientras la revisabas (otra persona guardó o regeneró campos). Vuelve a cargarla y revisa antes de verificar.', { conflict: true });
    }
    return { ok: true, nonBlocking };
};

/**
 * v4.1357 — El estado COMO SI la persona marcara como revisados todos los
 * campos traducidos y vigentes («Marcar revisados y verificar» en un paso).
 * Nunca convierte en revisado un campo faltante ni uno desactualizado: esos
 * siguen bloqueando. Puro: sólo sirve para decidir antes de escribir.
 */
export const asIfReviewed = (status) => {
    if (!status) return status;
    const fields = Array.isArray(status.fields) ? status.fields.map(f => (f.state === 'draft' ? { ...f, state: 'reviewed', reviewed: true } : f)) : status.fields;
    const counts = { ...(status.counts || {}) };
    counts.reviewed = (counts.reviewed || 0) + (counts.draft || 0);
    counts.draft = 0;
    return { ...status, counts, fields };
};

/** Lo que se muestra en la ventana de confirmación (y se guarda con la versión). */
export const verificationSummary = (status, { nextVersionNumber = 1 } = {}) => {
    const fields = Array.isArray(status?.fields) ? status.fields : [];
    const reviewers = {};
    const translators = { ai: 0, manual: 0 };
    for (const f of fields) {
        if (f.reviewedBy) reviewers[f.reviewedBy] = (reviewers[f.reviewedBy] || 0) + 1;
        if (f.origin === 'ai') translators.ai += 1; else if (f.origin === 'manual') translators.manual += 1;
    }
    return {
        total: Number(status?.total) || 0,
        translated: (status?.counts?.draft || 0) + (status?.counts?.reviewed || 0),
        reviewed: status?.counts?.reviewed || 0,
        warnings: fields.filter(f => f.state !== 'missing' && f.warnings?.length).length,
        reviewers, origins: translators,
        nextVersionNumber,
    };
};

// ── Vigencia ───────────────────────────────────────────────────────────────
/**
 * ¿Hay que REGISTRAR que una verificación perdió vigencia por un cambio del
 * original? Sólo la primera vez por versión verificada (la cabecera guarda
 * `invalidatedVersionId`): así el aviso al Cadre sale una vez, no en cada
 * lectura del listado.
 *
 * @returns null o { paths } — los campos afectados (desactualizados o nuevos)
 */
export const invalidationOf = (status, header) => {
    if (!isVerification(header)) return null;
    if (status?.state === 'approved') return null;
    if (header.invalidatedVersionId && header.invalidatedVersionId === header.approvedVersionId) return null;
    const fields = Array.isArray(status?.fields) ? status.fields : [];
    const affected = fields.filter(f => f.state === 'outdated' || f.state === 'missing');
    if (!affected.length) return null;
    return { paths: affected.map(f => ({ path: f.path, label: f.label, state: f.state })) };
};

// ── Filtros y orden del listado ────────────────────────────────────────────
export const TRANSLATION_VIEWS = [
    { key: 'sin_traducir', label: 'Sin traducir' },
    { key: 'incompleta', label: 'Traducción incompleta (en progreso)' },
    { key: 'por_revisar', label: 'Pendientes de revisión' },
    { key: 'en_revision', label: 'En revisión' },
    { key: 'lista', label: 'Lista para verificar' },
    { key: 'verificada', label: 'Verificadas' },
    { key: 'desactualizada', label: 'Requieren actualización' },
    { key: 'no_verificada', label: 'Sin verificar (todas las pendientes)' },
    { key: 'con_avisos', label: 'Con avisos' },
    { key: 'sin_cadre', label: 'Sin Cadre asignado' },
];
const VIEW_KEYS = new Set(TRANSLATION_VIEWS.map(v => v.key));
export const translationViewOptions = () => TRANSLATION_VIEWS;

const VIEW_TEST = {
    sin_traducir: t => t.state === 'untranslated',
    incompleta: t => t.state === 'in_progress',
    por_revisar: t => t.state === 'pending_review',
    en_revision: t => t.state === 'in_review',
    lista: t => t.readyToVerify,
    verificada: t => t.state === 'verified',
    desactualizada: t => t.state === 'needs_update',
    no_verificada: t => t.state !== 'verified' && t.state !== 'no_content',
    con_avisos: t => t.warnings > 0,
    sin_cadre: t => !t.assignee && t.state !== 'no_content',
};

/** ¿Hay en la consulta algún filtro u orden de traducción? */
export const hasTranslationQuery = (q = {}) => {
    const v = str(q.tr);
    return (v && v !== 'all' && VIEW_KEYS.has(v))
        || !!str(q.trCadre) || !!str(q.trDesde) || !!str(q.trHasta)
        || Object.prototype.hasOwnProperty.call(TRANSLATION_SORTS, str(q.sortBy));
};

/** `trCadre=me` → el correo de quien consulta (en el servidor, nunca del navegador). */
export const resolveCadreQuery = (query = {}, email = '') => {
    const q = { ...query };
    if (str(q.trCadre).toLowerCase() === 'me') q.trCadre = str(email).toLowerCase() || '__nadie__';
    return q;
};

/** Las celdas de traducción de una fila del CSV / Excel (mismas cifras de la columna). */
export const TRANSLATION_CSV_HEADERS = [
    'Traducción EN (estado)', 'Traducción EN (%)', 'Revisión EN (%)', 'Campos traducibles', 'Campos pendientes',
    'Campos desactualizados', 'Avisos de traducción', 'Cadre responsable', 'Verificada por', 'Rol de quien verificó',
    'Fecha de verificación', 'Versión verificada', 'Vigencia de la verificación', 'Observaciones de traducción',
];
const ROLE_LABELS = { cadre: 'Cadre', admin: 'Administrador', reviewer: 'Revisor', translator: 'Traductor' };
export const roleLabelOf = (role) => ROLE_LABELS[role] || role || '';
export const translationCsvValues = (t) => {
    if (!t) return TRANSLATION_CSV_HEADERS.map(() => '');
    const v = t.verification;
    const obs = [];
    if (t.state === 'needs_update') obs.push(`Cambiaron ${t.invalidatedPaths.length || t.outdated || t.missing} campo(s) del original después de verificar`);
    if (t.legacyApproved) obs.push('Aprobada antes de la verificación por Cadres: requiere verificación');
    if (t.revokeReason) obs.push(`Verificación revocada: ${t.revokeReason}`);
    return [
        t.label, t.translatedPct ?? '', t.reviewedPct ?? '', t.total, t.missing + t.unreviewed + t.outdated,
        t.outdated, t.warnings, t.assignee?.email || '',
        v?.kind === VERIFICATION_KIND ? (v.by || '') : '', v?.kind === VERIFICATION_KIND ? roleLabelOf(v.role) : '',
        v?.kind === VERIFICATION_KIND && v.at ? new Date(v.at).toISOString() : '',
        v?.kind === VERIFICATION_KIND ? (v.versionNumber ?? '') : '',
        v?.kind === VERIFICATION_KIND ? (v.vigente ? 'Vigente' : 'Sin vigencia') : '',
        obs.join(' · '),
    ];
};

const dayOf = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    // Día de calendario de Colombia (UTC-5, sin horario de verano).
    return new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
};

/**
 * ¿La traducción `t` (de trackingOf) pasa los filtros de la consulta?
 * `trCadre`: un correo, `me` (lo resuelve el servidor antes) o `none`.
 * `trDesde`/`trHasta`: fecha de la verificación VIGENTE (AAAA-MM-DD).
 */
export const matchesTranslationFilters = (t, q = {}) => {
    if (!t) return false;
    const v = str(q.tr);
    if (v && v !== 'all' && VIEW_KEYS.has(v) && !VIEW_TEST[v](t)) return false;
    const cadre = str(q.trCadre).trim().toLowerCase();
    if (cadre) {
        if (cadre === 'none') { if (t.assignee) return false; }
        else if (str(t.assignee?.email).toLowerCase() !== cadre) return false;
    }
    const desde = str(q.trDesde).slice(0, 10);
    const hasta = str(q.trHasta).slice(0, 10);
    if (desde || hasta) {
        const day = t.state === 'verified' ? dayOf(t.verification?.at) : null;
        if (!day) return false;
        if (desde && day < desde) return false;
        if (hasta && day > hasta) return false;
    }
    return true;
};

export const TRANSLATION_SORTS = {
    trState: t => TRACKING_STATES[t?.state]?.order ?? -1,
    trTranslated: t => t?.translatedPct ?? -1,
    trReviewed: t => t?.reviewedPct ?? -1,
    trVerifiedAt: t => (t?.state === 'verified' && t.verification?.at ? new Date(t.verification.at).getTime() : 0),
};
export const translationSortValue = (t, key) => (TRANSLATION_SORTS[key] ? TRANSLATION_SORTS[key](t) : 0);

// ── Indicadores ────────────────────────────────────────────────────────────
/**
 * Los indicadores del bloque «Seguimiento de traducciones». `applicable` deja
 * fuera los proyectos sin textos para traducir: un proyecto vacío no es una
 * traducción pendiente.
 */
export const summarizeTranslations = (list = []) => {
    const k = { total: list.length, applicable: 0, untranslated: 0, inProgress: 0, pendingReview: 0, inReview: 0, verified: 0, needsUpdate: 0, readyToVerify: 0, withWarnings: 0, unassigned: 0, noContent: 0, verifiedPct: 0, translatedPct: 0, reviewedPct: 0 };
    let fieldsTotal = 0, fieldsTranslated = 0, fieldsReviewed = 0;
    for (const t of list) {
        if (!t) continue;
        if (t.state === 'no_content') { k.noContent += 1; continue; }
        k.applicable += 1;
        if (t.state === 'untranslated') k.untranslated += 1;
        else if (t.state === 'in_progress') k.inProgress += 1;
        else if (t.state === 'pending_review') k.pendingReview += 1;
        else if (t.state === 'in_review') k.inReview += 1;
        else if (t.state === 'verified') k.verified += 1;
        else if (t.state === 'needs_update') k.needsUpdate += 1;
        if (t.readyToVerify) k.readyToVerify += 1;
        if (t.warnings > 0) k.withWarnings += 1;
        if (!t.assignee) k.unassigned += 1;
        fieldsTotal += t.total; fieldsTranslated += t.translated; fieldsReviewed += t.reviewed;
    }
    k.verifiedPct = pctOf(k.verified, k.applicable) ?? 0;
    k.translatedPct = pctOf(fieldsTranslated, fieldsTotal) ?? 0;
    k.reviewedPct = pctOf(fieldsReviewed, fieldsTotal) ?? 0;
    return k;
};

/** La carga de trabajo por Cadre (sólo proyectos con textos para traducir). */
export const workloadByCadre = (entries = []) => {
    const by = new Map();
    for (const { tracking: t } of entries) {
        if (!t || t.state === 'no_content' || !t.assignee) continue;
        const key = t.assignee.email.toLowerCase();
        const row = by.get(key) || { email: t.assignee.email, name: t.assignee.name || null, assigned: 0, verified: 0, needsUpdate: 0, pending: 0, fields: 0, reviewedFields: 0, lastVerifiedAt: null };
        row.assigned += 1;
        if (t.state === 'verified') {
            row.verified += 1;
            if (!row.lastVerifiedAt || new Date(t.verification.at) > new Date(row.lastVerifiedAt)) row.lastVerifiedAt = t.verification.at;
        } else if (t.state === 'needs_update') row.needsUpdate += 1;
        else row.pending += 1;
        row.fields += t.total; row.reviewedFields += t.reviewed;
        by.set(key, row);
    }
    return [...by.values()]
        .map(r => ({ ...r, reviewedPct: pctOf(r.reviewedFields, r.fields) ?? 0 }))
        .sort((a, b) => (b.pending + b.needsUpdate) - (a.pending + a.needsUpdate) || a.email.localeCompare(b.email));
};

// ── Configuración por edición ──────────────────────────────────────────────
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(str(v));
export const normalizeTranslationConfig = (raw = {}) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        // Fecha límite de traducción, INDEPENDIENTE de la de postulación y de
        // la documental. Ninguna fecha vive en el código.
        deadline: isDay(r.deadline) ? r.deadline : null,
        // Avisar al Cadre asignado cuando el club cambia el original de una
        // traducción que él verificó.
        notifyOnInvalidation: r.notifyOnInvalidation !== false,
        notifyOnAssignment: r.notifyOnAssignment !== false,
        reminderNote: str(r.reminderNote).trim().slice(0, 1000) || null,
    };
};

/** Días que faltan para la fecha límite (calendario de Colombia), o null. */
export const daysToDeadline = (deadline, now = Date.now()) => {
    if (!isDay(deadline)) return null;
    const today = new Date(now - 5 * 3600 * 1000).toISOString().slice(0, 10);
    return Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
};

// ── Recordatorios ──────────────────────────────────────────────────────────
export const REMINDER_SCOPES = [
    { key: 'pendientes', label: 'Todos los asignados con trabajo pendiente' },
    { key: 'desactualizadas', label: 'Sólo traducciones que requieren actualización' },
    { key: 'seleccion', label: 'Los proyectos seleccionados' },
];
export const REMINDER_SCOPE_KEYS = REMINDER_SCOPES.map(s => s.key);

/** ¿Este proyecto entra en un recordatorio al Cadre? */
export const reminderVerdict = (t) => {
    if (!t || t.state === 'no_content') return { ok: false, code: 'no_content', reason: 'No tiene textos para traducir.' };
    if (t.state === 'verified') return { ok: false, code: 'verified', reason: 'La traducción ya está verificada y vigente.' };
    if (!t.assignee) return { ok: false, code: 'unassigned', reason: 'No tiene Cadre asignado: asígnalo primero.' };
    return { ok: true };
};

/** Un correo por Cadre con todos sus proyectos pendientes. */
export const groupByCadre = (plan = []) => {
    const by = new Map();
    for (const p of plan) {
        if (!p.send) continue;
        const key = str(p.cadreEmail).toLowerCase();
        if (!key) continue;
        const g = by.get(key) || { email: p.cadreEmail, name: p.cadreName || null, projects: [] };
        g.projects.push(p);
        by.set(key, g);
    }
    return [...by.values()];
};

/** Huella del envío: el mismo Cadre, los mismos proyectos y el mismo día → uno solo. */
export const reminderDedupeKey = (email, ids = [], now = Date.now()) =>
    `tr-reminder:${str(email).toLowerCase()}:${hashOf([...ids].sort().join(','))}:${new Date(now - 5 * 3600 * 1000).toISOString().slice(0, 10)}`;

// ── Permisos (documentación ejecutable: la prueba la compara con los perfiles) ─
export const PERMISSION_MATRIX = [
    { capability: 'view', label: 'Consultar proyectos, estado de traducción e insignias' },
    { capability: 'translate', label: 'Editar traducciones, revisar campos, guardar borradores' },
    { capability: 'approveTranslation', label: 'Verificar la traducción (certificar)' },
    { capability: 'manageTranslation', label: 'Asignar / reasignar Cadres, revocar verificaciones, recordatorios' },
    { capability: 'config', label: 'Fecha límite y preferencias de aviso de traducción' },
    { capability: 'export', label: 'Exportar informes y fichas' },
];

export default {
    VERIFICATION_KIND, TRACKING_STATES, TRACKING_KEYS, BLOCKING_WARNING_CODES, JUSTIFICATION_MIN,
    pctOf, isVerification, trackingOf, sourceFingerprintOf, verificationCheck, asIfReviewed, verificationSummary, invalidationOf,
    TRANSLATION_VIEWS, translationViewOptions, hasTranslationQuery, resolveCadreQuery, TRANSLATION_CSV_HEADERS, translationCsvValues, roleLabelOf, matchesTranslationFilters, TRANSLATION_SORTS, translationSortValue,
    summarizeTranslations, workloadByCadre, normalizeTranslationConfig, daysToDeadline,
    REMINDER_SCOPES, REMINDER_SCOPE_KEYS, reminderVerdict, groupByCadre, reminderDedupeKey, PERMISSION_MATRIX,
};
