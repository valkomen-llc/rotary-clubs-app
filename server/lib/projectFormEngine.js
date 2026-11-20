// ════════════════════════════════════════════════════════════════════
// Motor de formularios del proyecto
// v4.642.0
//
// Lógica común a TODOS los formularios que cuelgan de un proyecto (la
// Formulación, la Solicitud de Aportes del FDD y los que vengan después):
// recorrer una plantilla, medir el avance, calcular campos derivados y
// validar las respuestas.
//
// Vivía dentro de `projectFairMasterForm.js` cuando sólo existía un
// formulario. Se extrajo aquí para que agregar un formulario nuevo sea
// escribir su plantilla y registrarla, sin duplicar esta lógica; ese archivo
// la sigue reexportando para no romper a quien ya la importaba.
//
// Reglas que valen para todos los formularios:
//   · Un campo `computed` lo calcula el motor: nunca se guarda como respuesta
//     del club ni cuenta para el avance.
//   · Una sección `adminOnly` no la diligencia el club: se guarda aparte, en
//     la columna `approval`, y toda escritura que llega del panel del club la
//     descarta.
//   · Una sección `districtSpace` es el espacio institucional del formato (la
//     aprobación del Gobernador de Distrito y del presidente del Comité de
//     LFRI): la diligencia el club Y el Distrito, y es la que apunta el
//     endpoint de aprobación del panel administrativo. Se guarda con el resto
//     de las respuestas.
//
// La diferencia entre las dos es quién escribe, no cómo se ve: las dos se
// dibujan como espacio institucional.
// ════════════════════════════════════════════════════════════════════

export const FIELD_TYPES = [
    'text', 'textarea', 'number', 'currency', 'percent', 'date', 'select',
    'multiselect', 'checkbox', 'url', 'email', 'phone', 'repeater', 'matrix',
    'file', 'computed',
    // v4.1346 — Varios clubes del Catálogo Maestro (lista de nombres).
    'clubs',
];

/** v4.1346 — Tope de clubes en un campo `clubs`. */
export const MAX_CLUBS_PER_FIELD = 12;

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const anyCellFilled = (obj) =>
    !!obj && typeof obj === 'object' && Object.values(obj).some(row =>
        row && typeof row === 'object'
            ? Object.values(row).some(v => String(v ?? '').trim() !== '')
            : String(row ?? '').trim() !== ''
    );

/** ¿El campo tiene contenido? Depende del tipo: una tabla vacía no cuenta. */
/**
 * Las filas que hay que DIBUJAR de una tabla de filas fijas.
 *
 * Son las vigentes más las RETIRADAS que ya tengan algún valor escrito. Un club
 * pudo haber diligenciado un concepto que después se quitó del formulario, y
 * las tres vistas administrativas —la ficha, el PDF y el Word— dibujan la tabla
 * recorriendo `rows`: sin esto, ese valor seguiría en la base y no lo vería
 * nadie. Retirar un campo es dejar de PEDIRLO, no dejar de mostrarlo — misma
 * regla que `RETIRED_LABELS` en el registro de eventos.
 *
 * Una fila retirada sin valor no se dibuja: nadie necesita ver un concepto que
 * ya no se pide y que además está vacío.
 */
export const matrixRowsToShow = (field, value) => {
    const rows = Array.isArray(field?.rows) ? field.rows : [];
    const retired = Array.isArray(field?.retiredRows) ? field.retiredRows : [];
    if (!retired.length) return rows;

    const vigentes = new Set(rows.map(r => r?.key));
    const conValor = retired.filter(r =>
        r?.key && !vigentes.has(r.key)
        && value?.[r.key]
        && Object.values(value[r.key]).some(v => String(v ?? '').trim() !== '')
    ).map(r => ({
        ...r, retired: true,
        // Se rotula en la propia etiqueta y no en cada vista: son tres —ficha,
        // PDF y Word— y escribirlo tres veces las deja separarse. Sin el
        // rótulo, un concepto retirado se lee como si el formulario todavía lo
        // pidiera.
        label: `${r.label} (retirado del formulario)`
    }));

    return conValor.length ? [...rows, ...conValor] : rows;
};

export const hasValue = (value, type) => {
    if (value === null || value === undefined) return false;
    if (type === 'repeater') {
        return Array.isArray(value) && value.some(row =>
            row && Object.values(row).some(v => String(v ?? '').trim() !== '')
        );
    }
    if (type === 'matrix') return anyCellFilled(value);
    if (type === 'multiselect') return Array.isArray(value) && value.length > 0;
    // Un texto suelto cuenta como respondido para que la validación lo rechace.
    if (type === 'clubs') return Array.isArray(value) ? value.some(v => String(v ?? '').trim() !== '') : String(value).trim() !== '';
    if (type === 'checkbox') return value === true;
    if (type === 'number' || type === 'currency' || type === 'percent') {
        return String(value).trim() !== '' && !Number.isNaN(Number(value));
    }
    return String(value).trim() !== '';
};

/** ¿La sección la escribe únicamente el panel administrativo? */
export const isProtectedSection = (section) => section?.adminOnly === true;

/** ¿Es el espacio institucional del formato (aprobación del Distrito)? */
export const isDistrictSection = (section) =>
    section?.districtSpace === true || section?.adminOnly === true;

/**
 * La sección de aprobación institucional de una plantilla, si la tiene. Es la
 * que apunta `PUT /admin/postulaciones/:id/forms/:formKey/approval`.
 */
export const districtSectionOf = (template) =>
    (template?.sections || []).find(isDistrictSection) || null;

/** Todos los campos de la plantilla, aplanados, con su sección de origen. */
export const flattenFields = (template) =>
    (template?.sections || []).flatMap(section =>
        (section.fields || []).map(field => ({
            ...field,
            sectionKey: section.key,
            sectionTitle: section.title,
            sectionAdminOnly: section.adminOnly === true,
        }))
    );

/**
 * Campos que le tocan al club: los que no son derivados ni de una sección
 * reservada al Distrito. Son la base del avance y de la validación de envío.
 */
export const applicantFields = (template) =>
    flattenFields(template).filter(f => f.type !== 'computed' && !f.sectionAdminOnly);

// ── Condiciones (v4.1332) ────────────────────────────────────────────
// Un campo o una sección pueden declarar `appliesIf` (si no se cumple, NO
// aplica: ni cuenta para el avance ni se exige) y un campo `requiredIf` (es
// obligatorio sólo cuando se cumple). La condición mira OTRA respuesta:
//   { field: 'seccion.campo', equals: 'Sí' }
//   { field: 'seccion.campo', in: ['Sí', 'En trámite'] }
//   { field: 'seccion.campo', filled: true }
// Ninguna plantilla de hoy las usa: el motor las entiende para que una
// sección condicional se declare en la plantilla y no en el código.
const conditionHolds = (cond, answers = {}) => {
    if (!cond || typeof cond !== 'object') return true;
    const [sectionKey, fieldKey] = String(cond.field || '').split('.');
    if (!sectionKey || !fieldKey) return true;
    const value = answers?.[sectionKey]?.[fieldKey];
    const text = Array.isArray(value) ? value.map(v => String(v)) : String(value ?? '').trim();
    if (cond.filled === true) return Array.isArray(text) ? text.length > 0 : text !== '';
    if (cond.filled === false) return Array.isArray(text) ? text.length === 0 : text === '';
    if (Array.isArray(cond.in)) {
        const opts = cond.in.map(v => String(v));
        return Array.isArray(text) ? text.some(t => opts.includes(t)) : opts.includes(text);
    }
    if (cond.equals !== undefined) {
        return Array.isArray(text) ? text.includes(String(cond.equals)) : text === String(cond.equals);
    }
    return true;
};

/** ¿Aplica el campo con estas respuestas? (sección y campo). */
export const fieldApplies = (field, template, answers = {}) => {
    const section = (template?.sections || []).find(s => s.key === field.sectionKey);
    return conditionHolds(section?.appliesIf, answers) && conditionHolds(field.appliesIf, answers);
};

/** ¿Es obligatorio el campo con estas respuestas? */
export const fieldIsRequired = (field, answers = {}) =>
    field.required === true || (field.requiredIf ? conditionHolds(field.requiredIf, answers) : false);

/**
 * Problemas de FORMATO de UN campo ya diligenciado (vacío = sin problemas).
 * Es la misma regla que `validateAnswers`, campo por campo, para que el
 * avance no cuente como hecho un correo o una fecha que el envío rechazaría.
 */
export const fieldProblem = (field, value) => {
    if (!hasValue(value, field.type)) return null;
    const one = validateAnswers({ sections: [{ key: field.sectionKey, title: field.sectionTitle, fields: [{ ...field }] }] },
        { [field.sectionKey]: { [field.key]: value } });
    return one[0]?.message || null;
};

/**
 * EL AVANCE DE UN FORMULARIO (v4.1332) — la ÚNICA cuenta. La usan la tarjeta
 * de «Mi Proyecto», el guardado, el envío y el Seguimiento documental del
 * comité: no hay un segundo cálculo que pueda dar otra cifra.
 *
 *   avance = obligatorios APLICABLES, con valor Y con formato válido
 *            ÷ obligatorios APLICABLES
 *
 * · Los opcionales no impiden llegar al 100 %.
 * · Un campo con valor inválido (correo mal escrito) NO cuenta como hecho.
 * · Un archivo cuenta cuando hay un enlace válido guardado.
 * · Sin obligatorios, se mide sobre todos los campos del club (regla de
 *   siempre).
 * · 100 % sólo si TODO está hecho: 99,6 % se muestra 99 %, nunca 100 %.
 */
export const formProgressOf = (template, answers = {}) => {
    const fields = applicantFields(template).filter(f => fieldApplies(f, template, answers));
    const required = fields.filter(f => fieldIsRequired(f, answers));
    const target = required.length ? required : fields;
    const sections = new Map();
    for (const s of (template?.sections || []).filter(s => !s.adminOnly)) {
        sections.set(s.key, { key: s.key, title: s.title || s.key, total: 0, done: 0, missing: [], invalid: [] });
    }
    let done = 0;
    for (const f of target) {
        const value = answers?.[f.sectionKey]?.[f.key];
        const sec = sections.get(f.sectionKey) || { key: f.sectionKey, title: f.sectionTitle, total: 0, done: 0, missing: [], invalid: [] };
        sections.set(f.sectionKey, sec);
        sec.total += 1;
        const item = { section: f.sectionTitle, sectionKey: f.sectionKey, key: f.key, label: f.label, type: f.type };
        if (!hasValue(value, f.type)) { sec.missing.push(item); continue; }
        const problem = fieldProblem(f, value);
        if (problem) { sec.invalid.push({ ...item, message: problem }); continue; }
        sec.done += 1;
        done += 1;
    }
    const total = target.length;
    const raw = total ? (done / total) * 100 : 0;
    const pct = !total ? 0 : (done === total ? 100 : Math.min(99, Math.round(raw)));
    const list = [...sections.values()].filter(s => s.total > 0).map(s => ({
        ...s,
        pct: s.done === s.total ? 100 : Math.min(99, Math.round((s.done / s.total) * 100)),
        complete: s.done === s.total,
    }));
    return {
        pct,
        total,
        done,
        sections: list,
        missing: list.flatMap(s => s.missing),
        invalid: list.flatMap(s => s.invalid),
    };
};

/** Porcentaje de avance (ver `formProgressOf`). */
export const completionOf = (template, answers = {}) => formProgressOf(template, answers).pct;

/** Campos obligatorios sin responder (para avisar antes de enviar). */
export const missingRequired = (template, answers = {}) =>
    applicantFields(template)
        .filter(f => fieldApplies(f, template, answers) && fieldIsRequired(f, answers)
            && !hasValue(answers?.[f.sectionKey]?.[f.key], f.type))
        .map(f => ({ section: f.sectionTitle, sectionKey: f.sectionKey, key: f.key, label: f.label }));

// ── Campos derivados ─────────────────────────────────────────────────
const numberAt = (answers, path) => {
    const [sectionKey, fieldKey] = String(path || '').split('.');
    if (!sectionKey || !fieldKey) return 0;
    const raw = answers?.[sectionKey]?.[fieldKey];
    const n = Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

/**
 * Valor de un campo `computed`. Hoy sabe sumar campos y sacar un porcentaje
 * de otro; ambos casos vienen del formato del FDD (total de aportes esperados
 * y 25% mínimo del aporte al FAP). Devuelve null si no se puede calcular.
 *
 * El cliente calcula lo mismo para mostrarlo en vivo, pero el valor que se
 * guarda y el que va al documento salen SIEMPRE de aquí: el navegador no
 * decide una cifra que el Distrito va a leer.
 */
export const computeValue = (field, answers = {}) => {
    const spec = field?.compute;
    if (!spec) return null;
    if (spec.op === 'sum') {
        const sources = Array.isArray(spec.sources) ? spec.sources : [];
        if (!sources.some(s => hasValue(answers?.[String(s).split('.')[0]]?.[String(s).split('.')[1]], 'currency'))) return null;
        return sources.reduce((acc, s) => acc + numberAt(answers, s), 0);
    }
    if (spec.op === 'percent') {
        const [sectionKey, fieldKey] = String(spec.source || '').split('.');
        if (!hasValue(answers?.[sectionKey]?.[fieldKey], 'currency')) return null;
        return numberAt(answers, spec.source) * (Number(spec.factor) || 0);
    }
    return null;
};

/** Respuestas + los campos derivados resueltos, para mostrar o exportar. */
export const withComputed = (template, answers = {}) => {
    const out = { ...answers };
    flattenFields(template).filter(f => f.type === 'computed').forEach(f => {
        const value = computeValue(f, answers);
        if (value === null) return;
        out[f.sectionKey] = { ...(out[f.sectionKey] || {}), [f.key]: value };
    });
    return out;
};

// ── Validación ───────────────────────────────────────────────────────
// El servidor valida SIEMPRE, aunque el navegador ya lo haya hecho: el
// formulario del club no es la única forma de llegar al endpoint.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Teléfono internacional laxo: dígitos, espacios, guiones, paréntesis y un
// "+" inicial. No se exige formato colombiano: hay contactos del exterior.
const RE_PHONE = /^\+?[\d\s().-]{7,20}$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_URL = /^https?:\/\/\S+$/i;

/**
 * Comprueba el FORMATO de cada respuesta (no si está o no diligenciada, de
 * eso se ocupa `missingRequired`). Devuelve una lista de problemas legibles.
 */
export const validateAnswers = (template, answers = {}) => {
    const problems = [];
    const add = (field, message) => problems.push({
        section: field.sectionTitle, sectionKey: field.sectionKey,
        key: field.key, label: field.label, message,
    });

    applicantFields(template).forEach(field => {
        const value = answers?.[field.sectionKey]?.[field.key];
        if (!hasValue(value, field.type)) return;
        const text = String(value ?? '').trim();

        switch (field.type) {
            case 'email':
                if (!RE_EMAIL.test(text)) add(field, 'Escribe un correo electrónico válido (por ejemplo, nombre@dominio.com).');
                break;
            case 'phone':
                if (!RE_PHONE.test(text)) add(field, 'Escribe un número de teléfono válido (entre 7 y 20 dígitos).');
                break;
            case 'url':
            case 'file':
                if (!RE_URL.test(text)) add(field, 'Escribe un enlace que empiece por http:// o https://.');
                break;
            case 'date':
                if (!RE_DATE.test(text) || Number.isNaN(new Date(`${text}T12:00:00`).getTime())) {
                    add(field, 'Escribe una fecha válida.');
                }
                break;
            case 'number':
            case 'currency': {
                const n = Number(text);
                if (Number.isNaN(n)) add(field, 'Escribe un número.');
                else if (n < 0) add(field, 'El valor no puede ser negativo.');
                break;
            }
            case 'percent': {
                const n = Number(text);
                if (Number.isNaN(n)) add(field, 'Escribe un porcentaje.');
                else if (n < 0 || n > 100) add(field, 'El porcentaje debe estar entre 0 y 100.');
                break;
            }
            case 'clubs': {
                // v4.1346 — Una lista de nombres de club, sin repetidos y con tope.
                const list = Array.isArray(value) ? value.map(v => String(v ?? '').trim()).filter(Boolean) : null;
                if (!list) add(field, 'Selecciona los clubes de la lista.');
                else if (list.length > MAX_CLUBS_PER_FIELD) add(field, `Puedes agregar hasta ${MAX_CLUBS_PER_FIELD} clubes.`);
                else if (list.some(n => n.length > 160)) add(field, 'El nombre de un club es demasiado largo.');
                else if (new Set(list.map(n => n.toLowerCase())).size !== list.length) add(field, 'Un club está repetido.');
                return;
            }
            case 'select':
                // `optionsFrom` se resuelve con datos de la convocatoria, que
                // aquí no están: sólo se valida contra listas literales.
                if (Array.isArray(field.options) && field.options.length && !field.options.includes(text)) {
                    add(field, 'Selecciona una de las opciones disponibles.');
                }
                break;
            default:
                break;
        }

        if (field.maxLength && text.length > Number(field.maxLength)) {
            add(field, `Supera el máximo de ${field.maxLength} caracteres.`);
        }
    });

    return problems;
};

/**
 * Quita de un cuerpo recibido todo lo que el club no puede escribir: las
 * secciones `adminOnly` y los campos derivados. Se aplica ANTES de guardar,
 * de modo que una petición hecha a mano no puede firmar por el Gobernador.
 */
export const stripProtected = (template, answers = {}) => {
    if (!isPlainObject(answers)) return {};
    const out = {};
    const adminSections = new Set(
        (template?.sections || []).filter(s => s.adminOnly === true).map(s => s.key)
    );
    const computedBySection = flattenFields(template)
        .filter(f => f.type === 'computed')
        .reduce((acc, f) => {
            acc[f.sectionKey] = acc[f.sectionKey] || new Set();
            acc[f.sectionKey].add(f.key);
            return acc;
        }, {});

    for (const [sectionKey, section] of Object.entries(answers)) {
        if (adminSections.has(sectionKey)) continue;
        if (!isPlainObject(section)) { out[sectionKey] = section; continue; }
        const drop = computedBySection[sectionKey];
        out[sectionKey] = drop
            ? Object.fromEntries(Object.entries(section).filter(([k]) => !drop.has(k)))
            : section;
    }
    return out;
};

/** Sólo las respuestas de las secciones reservadas al Distrito. */
export const onlyAdminSections = (template, answers = {}) => {
    if (!isPlainObject(answers)) return {};
    const adminSections = new Set(
        (template?.sections || []).filter(s => s.adminOnly === true).map(s => s.key)
    );
    return Object.fromEntries(
        Object.entries(answers).filter(([k, v]) => adminSections.has(k) && isPlainObject(v))
    );
};
