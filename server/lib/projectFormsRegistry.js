// ════════════════════════════════════════════════════════════════════
// Registro de formularios del proyecto
// v4.642.0
//
// Un proyecto inscrito ya no tiene UN formulario, tiene varios: la
// Formulación del Proyecto y la Solicitud de Aportes del FDD 2026-2027, y
// mañana los que el Distrito necesite. Este archivo es la única lista de
// cuáles existen.
//
// Agregar un formulario nuevo es:
//   1. escribir su plantilla (secciones → campos) en `server/lib/`,
//   2. añadir una entrada aquí,
// y ya aparece como tarjeta en el panel del club, se guarda, se valida, se
// envía y se ve en el panel administrativo. Ni el panel ni las rutas ni el
// modelo de datos cambian.
//
// ALMACENAMIENTO — decisión deliberada: la Formulación conserva su tabla
// original (`ProjectFairMasterForm`) y los formularios nuevos viven en
// `ProjectFairProjectForm`, indexada por (submissionId, formKey). No se migran
// datos de una a otra: mover a mano las respuestas ya guardadas de los clubes
// sería una operación destructiva sobre datos de producción, justo lo que la
// guía del proyecto prohíbe. Las dos tablas tienen la misma forma, así que el
// resto del código las trata igual (ver `storageOf`).
// ════════════════════════════════════════════════════════════════════
import { DEFAULT_MASTER_FORM } from './projectFairMasterForm.js';
import { DEFAULT_FDD_FORM, FDD_FORM_KEY } from './projectFairFddForm.js';

export const MASTER_FORM_KEY = 'master';
export { FDD_FORM_KEY };

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const deepMerge = (base, over) => {
    if (over === undefined || over === null) return base;
    if (!isPlainObject(base) || !isPlainObject(over)) return over;
    const out = { ...base };
    for (const k of Object.keys(over)) {
        out[k] = (isPlainObject(base[k]) && isPlainObject(over[k])) ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
};

/**
 * Los formularios que existen, en el orden en que se le muestran al club.
 *
 *   key          identificador estable; va en la URL y en la base de datos
 *   configPath   de dónde sale la plantilla dentro de la configuración de la
 *                convocatoria, para que el admin pueda editarla sin tocar código
 *   template     plantilla por defecto (sólo respaldo: lo guardado manda)
 *   storage      tabla donde viven las respuestas
 *   docx         si el panel administrativo ofrece la descarga en Word
 */
export const PROJECT_FORMS = [
    {
        key: MASTER_FORM_KEY,
        configPath: 'masterForm',
        template: DEFAULT_MASTER_FORM,
        storage: 'master',
        docx: true,
        // El primer formulario del proceso: sin él, los demás no tienen de
        // dónde precargar. No lo bloquea, sólo se ordena primero.
        order: 1,
    },
    {
        key: FDD_FORM_KEY,
        configPath: 'fddForm',
        template: DEFAULT_FDD_FORM,
        storage: 'generic',
        docx: false,
        order: 2,
    },
];

const BY_KEY = new Map(PROJECT_FORMS.map(f => [f.key, f]));

export const isKnownForm = (formKey) => BY_KEY.has(String(formKey || ''));

/** Tabla donde viven las respuestas de un formulario. Identificador literal. */
export const storageOf = (formKey) =>
    (BY_KEY.get(formKey)?.storage === 'generic' ? 'ProjectFairProjectForm' : 'ProjectFairMasterForm');

/** ¿La tabla de este formulario distingue por `formKey`? */
export const storageIsShared = (formKey) => BY_KEY.get(formKey)?.storage === 'generic';

/**
 * Plantilla vigente de un formulario: la que guardó el administrador si la
 * hay, completada con la de por defecto (merge profundo, igual que el resto
 * de la configuración de la convocatoria).
 */
export const templateFor = (cfg, formKey) => {
    const def = BY_KEY.get(formKey);
    if (!def) return null;
    const saved = cfg?.[def.configPath];
    // Una copia guardada sin `version` viene de antes de que la plantilla
    // fuera editable: se descarta para que aplique la oficial.
    const usable = isPlainObject(saved) && saved.version !== undefined ? saved : null;
    return { ...deepMerge(def.template, usable), key: def.key };
};

/** Definición + plantilla vigente de cada formulario, en orden. */
export const resolveForms = (cfg) =>
    [...PROJECT_FORMS]
        .sort((a, b) => (a.order || 99) - (b.order || 99))
        .map(def => ({ ...def, template: templateFor(cfg, def.key) }))
        .filter(f => f.template?.enabled !== false);

/** Definición de un formulario concreto, con su plantilla vigente. */
export const resolveForm = (cfg, formKey) => {
    const def = BY_KEY.get(String(formKey || ''));
    if (!def) return null;
    const template = templateFor(cfg, def.key);
    if (template?.enabled === false) return null;
    return { ...def, template };
};
