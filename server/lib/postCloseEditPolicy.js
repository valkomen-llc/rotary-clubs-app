// ════════════════════════════════════════════════════════════════════
// Edición después del cierre — el CRITERIO, reutilizable (v4.1330.0)
//
// ⚠️ LA FECHA DE CIERRE Y EL PERMISO DE EDITAR SON DOS REGLAS DISTINTAS.
// Hasta v4.1329 la «Fecha límite de postulación» de la Feria cerraba la
// EDICIÓN de los formularios de los proyectos ya inscritos (y no cerraba la
// creación de postulaciones nuevas: justo al revés de lo que pide el negocio).
// Un club con la Formulación al 53 % quedaba sin poder terminarla.
//
// Este módulo decide, sin base de datos ni red, si un formulario de un
// registro EXISTENTE se puede seguir editando cuando su convocatoria ya
// cerró, y qué campos quedan bloqueados. No sabe nada de la Feria: recibe la
// fecha, la política, el estado del registro y la autorización individual.
// Así lo puede usar cualquier convocatoria con fecha límite de la plataforma
// (eventos, subvenciones, programas) con su PROPIA política: la de una feria
// vive en la configuración de esa edición y no toca a ninguna otra.
//
// Qué NO decide: si se pueden CREAR registros nuevos (eso es la fecha de
// cierre a secas, `isPastDeadline`), ni quién es el dueño del registro (eso
// es la sesión, en el servidor de cada módulo).
// ════════════════════════════════════════════════════════════════════

/** Cómo trata la política cada estado del registro. */
export const STATE_RULES = [
    { key: 'edit', label: 'Editable' },
    { key: 'restricted', label: 'Editable con restricciones (campos sensibles bloqueados)' },
    { key: 'authorization', label: 'Requiere autorización' },
    { key: 'locked', label: 'No editable' },
];
const STATE_RULE_KEYS = STATE_RULES.map(r => r.key);

/** Vigencia de la edición posterior al cierre. */
export const VALIDITY_MODES = [
    { key: 'open', label: 'Sin fecha límite adicional' },
    { key: 'until', label: 'Hasta una fecha específica' },
    { key: 'individual', label: 'Solo mediante autorización individual' },
];
const VALIDITY_KEYS = VALIDITY_MODES.map(m => m.key);

/** Alcance: qué campos se pueden tocar. */
export const SCOPE_MODES = [
    { key: 'all', label: 'Todos los campos autorizados' },
    { key: 'pending', label: 'Solo campos pendientes' },
    { key: 'selected', label: 'Campos seleccionados por el administrador' },
];
const SCOPE_KEYS = SCOPE_MODES.map(m => m.key);

/** Cuándo se bloquean los campos sensibles. */
export const SENSITIVE_MODES = [
    { key: 'restricted', label: 'Solo en los estados «con restricciones»' },
    { key: 'always', label: 'Siempre, después del cierre' },
    { key: 'never', label: 'Nunca (se editan, pero quedan marcados para revisión)' },
];
const SENSITIVE_KEYS = SENSITIVE_MODES.map(m => m.key);

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOk = (v) => typeof v === 'string' && DATE_RE.test(v.trim()) && !Number.isNaN(new Date(`${v.trim()}T00:00:00Z`).getTime());

/**
 * Fin del día calendario en Colombia (UTC-5, sin horario de verano). Es la
 * misma hora de corte que usaba `editability` desde v4.642: un plazo «hasta
 * el 9 de noviembre» vale todo el 9 de noviembre.
 */
export const endOfDayBogota = (date) => (dateOk(date) ? new Date(`${String(date).trim()}T23:59:59-05:00`).getTime() : null);

/** ¿Ya pasó la fecha? Sin fecha válida nunca pasa. */
export const isPastDeadline = (date, now = Date.now()) => {
    const end = endOfDayBogota(date);
    return end !== null && Number(now) > end;
};

const pathList = (v) => (Array.isArray(v) ? v : [])
    .map(p => String(p ?? '').trim())
    .filter(p => /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+|\*)$/.test(p))
    .slice(0, 500);

const pathMap = (v) => {
    if (!isPlainObject(v)) return {};
    const out = {};
    for (const [k, list] of Object.entries(v)) {
        if (!/^[A-Za-z0-9_-]{1,60}$/.test(k)) continue;
        out[k] = pathList(list);
    }
    return out;
};

/**
 * La política, saneada. Todo valor que no se reconozca cae al más PRUDENTE
 * para ese campo, salvo `enabled`, que sólo se apaga si dice `false`
 * explícitamente: el pedido del cliente es que lo ya inscrito se pueda seguir
 * trabajando, y una política a medio guardar no debe volver a encerrarlo.
 *
 * `defaults` es la política de fábrica del módulo que la usa (por ejemplo,
 * qué campos de SUS plantillas son sensibles).
 */
export const normalizePostClosePolicy = (raw, defaults = {}) => {
    const src = { ...(isPlainObject(defaults) ? defaults : {}), ...(isPlainObject(raw) ? raw : {}) };
    const states = {};
    const rawStates = { ...(isPlainObject(defaults?.states) ? defaults.states : {}), ...(isPlainObject(raw?.states) ? raw.states : {}) };
    for (const [k, v] of Object.entries(rawStates)) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(k)) continue;
        // Un valor raro no abre nada: pide autorización.
        states[k] = STATE_RULE_KEYS.includes(v) ? v : 'authorization';
    }
    return {
        enabled: src.enabled !== false,
        validity: VALIDITY_KEYS.includes(src.validity) ? src.validity : 'open',
        until: dateOk(src.until) ? String(src.until).trim() : null,
        // Vacío = todos los formularios del registro.
        forms: (Array.isArray(src.forms) ? src.forms : []).map(f => String(f ?? '').trim()).filter(f => /^[A-Za-z0-9_-]{1,60}$/.test(f)),
        states,
        // Un estado que la política no menciona pide autorización: es el
        // lado seguro y deja al club una salida (pedirla).
        unknownState: STATE_RULE_KEYS.includes(src.unknownState) ? src.unknownState : 'authorization',
        scope: SCOPE_KEYS.includes(src.scope) ? src.scope : 'all',
        selectedFields: pathMap(src.selectedFields),
        sensitiveFields: pathMap(src.sensitiveFields),
        lockSensitive: SENSITIVE_KEYS.includes(src.lockSensitive) ? src.lockSensitive : 'restricted',
    };
};

const formIncluded = (policy, formKey) => !policy.forms.length || policy.forms.includes(formKey);

const fmtDate = (d) => {
    if (!dateOk(d)) return d || '';
    const [y, m, day] = String(d).split('-').map(Number);
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${day} de ${months[m - 1]} de ${y}`;
};
export const formatDateEs = fmtDate;

/**
 * EL VEREDICTO. Responde, para UN formulario de UN registro:
 *
 *   phase        'open'       la convocatoria no ha cerrado (o no tiene fecha)
 *                'post_close' ya cerró
 *   canEdit      si el servidor aceptará escrituras
 *   code         por qué (null cuando se puede editar sin más):
 *                  authorized          autorización individual vigente
 *                  archived            registro archivado
 *                  disabled            la política está apagada
 *                  form_not_included   ese formulario no está en la política
 *                  window_closed       venció la fecha adicional de edición
 *                  needs_authorization sólo con autorización (vigencia o estado)
 *                  state_locked        el estado no admite edición
 *   restricted   el estado es «con restricciones»: campos sensibles bloqueados
 *   requestable  el club puede PEDIR la autorización (no hay salida si no)
 *   until        hasta cuándo se puede editar después del cierre (o null)
 *   reason       texto para la persona, ya redactado
 *
 * `authorized` es la excepción administrativa (en la Feria, «Reabrir
 * edición» de un formulario): manda sobre todo lo demás, también sobre el
 * archivo, porque es una decisión explícita y registrada del comité.
 */
export const postCloseVerdict = ({
    deadline = null, policy: rawPolicy = null, now = Date.now(), formKey = null,
    state = null, archived = false, authorized = false, labels = {},
} = {}) => {
    const policy = rawPolicy?.states && rawPolicy?.validity ? rawPolicy : normalizePostClosePolicy(rawPolicy);
    const closed = isPastDeadline(deadline, now);
    const phase = closed ? 'post_close' : 'open';
    const base = { phase, deadline: dateOk(deadline) ? String(deadline).trim() : null, until: null, restricted: false, requestable: false };
    const contact = labels.contact || 'Escríbenos si necesitas hacer un ajuste.';
    const stateLabel = labels.state || 'su estado actual';

    if (authorized) return { ...base, canEdit: true, code: 'authorized', reason: null };
    if (archived) {
        return { ...base, canEdit: false, code: 'archived', reason: `Este proyecto está archivado: puedes consultarlo, pero ya no editarlo. ${contact}` };
    }
    if (!closed) return { ...base, canEdit: true, code: null, reason: null };

    const closedText = `La convocatoria cerró el ${fmtDate(base.deadline)}`;
    if (!policy.enabled) {
        return { ...base, canEdit: false, code: 'disabled', requestable: true, reason: `${closedText} y la edición de proyectos está cerrada. Puedes consultar tu información. ${contact}` };
    }
    if (!formIncluded(policy, formKey)) {
        return { ...base, canEdit: false, code: 'form_not_included', requestable: true, reason: `${closedText} y este formulario ya no admite cambios. Puedes consultarlo. ${contact}` };
    }
    if (policy.validity === 'until') {
        if (policy.until && isPastDeadline(policy.until, now)) {
            return { ...base, until: policy.until, canEdit: false, code: 'window_closed', requestable: true, reason: `El plazo para actualizar los proyectos terminó el ${fmtDate(policy.until)}. Puedes consultar tu información. ${contact}` };
        }
        base.until = policy.until;
    }
    if (policy.validity === 'individual') {
        return { ...base, canEdit: false, code: 'needs_authorization', requestable: true, reason: `${closedText}. Para editar este formulario necesitas una autorización del comité organizador.` };
    }
    const rule = (state && policy.states[state]) || policy.unknownState;
    if (rule === 'locked') {
        return { ...base, canEdit: false, code: 'state_locked', reason: `Con ${stateLabel}, este formulario ya no admite cambios. Puedes consultarlo. ${contact}` };
    }
    if (rule === 'authorization') {
        return { ...base, canEdit: false, code: 'needs_authorization', requestable: true, reason: `Con ${stateLabel}, editar este formulario requiere una autorización del comité organizador.` };
    }
    return { ...base, canEdit: true, code: null, reason: null, restricted: rule === 'restricted' };
};

// ── Campos ──────────────────────────────────────────────────────────

const matches = (list = [], sectionKey, fieldKey) =>
    list.includes(`${sectionKey}.${fieldKey}`) || list.includes(`${sectionKey}.*`);

const isEmpty = (v) => {
    if (v === undefined || v === null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0 || v.every(isEmpty);
    if (isPlainObject(v)) return Object.values(v).every(isEmpty);
    return false;
};

/**
 * Los campos editables de una plantilla: los que escribe quien llena el
 * formulario. Fuera los derivados y las secciones reservadas al administrador.
 */
export const editableFieldsOf = (template) =>
    (template?.sections || [])
        .filter(s => s && s.adminOnly !== true)
        .flatMap(s => (s.fields || [])
            .filter(f => f && f.key && f.type !== 'computed')
            .map(f => ({ ...f, sectionKey: s.key, sectionTitle: s.title || s.key })));

/** ¿Es sensible este campo? Lo dice la plantilla o la política. */
export const isSensitiveField = (field, policy, formKey) =>
    field?.sensitive === true || matches(policy?.sensitiveFields?.[formKey], field.sectionKey, field.key);

/**
 * Los campos que el servidor NO dejará cambiar, como rutas «seccion.campo».
 * Vacío cuando la convocatoria no ha cerrado o el comité autorizó la edición:
 * en esos casos manda lo de siempre.
 */
/**
 * Los campos PENDIENTES (vacíos) de un formulario, como rutas. Es la foto que
 * usa el alcance «solo campos pendientes»: se toma una vez, al primer acceso
 * después del cierre, y no con cada guardado.
 */
export const pendingFieldsOf = (template, answers = {}) =>
    editableFieldsOf(template)
        .filter(f => isEmpty(answers?.[f.sectionKey]?.[f.key]))
        .map(f => `${f.sectionKey}.${f.key}`);

export const lockedFieldsFor = ({ template, saved = {}, verdict, policy: rawPolicy, formKey, pendingPaths = null }) => {
    if (!verdict?.canEdit || verdict.phase !== 'post_close' || verdict.code === 'authorized') return [];
    const policy = rawPolicy?.states && rawPolicy?.validity ? rawPolicy : normalizePostClosePolicy(rawPolicy);
    const locked = [];
    for (const f of editableFieldsOf(template)) {
        const path = `${f.sectionKey}.${f.key}`;
        const sensitive = isSensitiveField(f, policy, formKey);
        if (sensitive && (policy.lockSensitive === 'always' || (policy.lockSensitive === 'restricted' && verdict.restricted))) {
            locked.push(path); continue;
        }
        if (policy.scope === 'pending') {
            const pending = Array.isArray(pendingPaths) ? pendingPaths.includes(path) : isEmpty(saved?.[f.sectionKey]?.[f.key]);
            if (!pending) { locked.push(path); continue; }
        }
        if (policy.scope === 'selected' && !matches(policy.selectedFields?.[formKey], f.sectionKey, f.key)) { locked.push(path); continue; }
    }
    return locked;
};

/**
 * Aplica el bloqueo a lo que llega del navegador: cada campo bloqueado
 * conserva EXACTAMENTE lo guardado, mande el navegador lo que mande. Es la
 * misma idea que `stripProtected`: la regla no depende de la pantalla.
 */
export const applyFieldLocks = (incoming = {}, saved = {}, locked = []) => {
    if (!locked.length) return incoming;
    const out = {};
    for (const [k, v] of Object.entries(isPlainObject(incoming) ? incoming : {})) out[k] = isPlainObject(v) ? { ...v } : v;
    for (const path of locked) {
        const [sectionKey, fieldKey] = path.split('.');
        const before = saved?.[sectionKey]?.[fieldKey];
        if (before === undefined) {
            if (isPlainObject(out[sectionKey])) delete out[sectionKey][fieldKey];
        } else {
            out[sectionKey] = { ...(isPlainObject(out[sectionKey]) ? out[sectionKey] : {}), [fieldKey]: before };
        }
    }
    return out;
};

// ── Bitácora ────────────────────────────────────────────────────────

const canonical = (v) => {
    if (isEmpty(v)) return null;
    if (Array.isArray(v)) return v.map(canonical);
    if (isPlainObject(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
    if (typeof v === 'string') return v.trim();
    return v;
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
/** ¿Son el mismo valor? Vacío, nulo y '' son lo mismo; el orden de las claves no importa. */
export const sameValue = same;

/** Correo y teléfono no se copian enteros a la bitácora. */
export const maskPersonal = (value, type) => {
    if (isEmpty(value)) return null;
    const s = String(value).trim();
    if (type === 'email') {
        const [user, domain] = s.split('@');
        return domain ? `${user.slice(0, 1)}***@${domain}` : '***';
    }
    if (type === 'phone') return s.length > 4 ? `***${s.slice(-4)}` : '***';
    return value;
};
const PERSONAL_TYPES = new Set(['email', 'phone']);

/**
 * Qué cambió, campo a campo, entre lo guardado y lo nuevo. Sólo campos que
 * escribe quien llena el formulario; correos y teléfonos, enmascarados.
 */
export const diffAnswers = ({ template, before = {}, after = {}, policy = null, formKey = null }) => {
    const out = [];
    for (const f of editableFieldsOf(template)) {
        const a = before?.[f.sectionKey]?.[f.key];
        const b = after?.[f.sectionKey]?.[f.key];
        if (same(a, b)) continue;
        const personal = PERSONAL_TYPES.has(f.type);
        out.push({
            path: `${f.sectionKey}.${f.key}`,
            label: `${f.sectionTitle} · ${f.label || f.key}`,
            type: f.type,
            sensitive: isSensitiveField(f, policy || {}, formKey),
            personal,
            before: personal ? maskPersonal(a, f.type) : (isEmpty(a) ? null : a),
            after: personal ? maskPersonal(b, f.type) : (isEmpty(b) ? null : b),
        });
    }
    return out;
};
