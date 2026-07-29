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
];

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const anyCellFilled = (obj) =>
    !!obj && typeof obj === 'object' && Object.values(obj).some(row =>
        row && typeof row === 'object'
            ? Object.values(row).some(v => String(v ?? '').trim() !== '')
            : String(row ?? '').trim() !== ''
    );

/** ¿El campo tiene contenido? Depende del tipo: una tabla vacía no cuenta. */
export const hasValue = (value, type) => {
    if (value === null || value === undefined) return false;
    if (type === 'repeater') {
        return Array.isArray(value) && value.some(row =>
            row && Object.values(row).some(v => String(v ?? '').trim() !== '')
        );
    }
    if (type === 'matrix') return anyCellFilled(value);
    if (type === 'multiselect') return Array.isArray(value) && value.length > 0;
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

/**
 * Porcentaje de avance: proporción de campos obligatorios con contenido.
 * Si la plantilla no tiene obligatorios, se mide sobre todos los del club.
 */
export const completionOf = (template, answers = {}) => {
    const fields = applicantFields(template);
    const required = fields.filter(f => f.required);
    const target = required.length ? required : fields;
    if (!target.length) return 0;

    const filled = target.filter(f => hasValue(answers?.[f.sectionKey]?.[f.key], f.type)).length;
    return Math.round((filled / target.length) * 100);
};

/** Campos obligatorios sin responder (para avisar antes de enviar). */
export const missingRequired = (template, answers = {}) =>
    applicantFields(template)
        .filter(f => f.required && !hasValue(answers?.[f.sectionKey]?.[f.key], f.type))
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
