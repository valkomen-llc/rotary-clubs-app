// ════════════════════════════════════════════════════════════════════
// Registro de asistentes a un evento — fuente de verdad — v4.648.0
//
// Aquí viven las decisiones del módulo: qué categorías existen, qué campos
// pide cada una, qué estados puede tener una inscripción, cómo se calcula el
// cobro cuando la moneda que se muestra no es la que cobra la pasarela y cómo
// se arma el código de inscripción.
//
// Todo está agrupado por evento. Una categoría, un precio, un formulario y un
// acompañante pertenecen SIEMPRE a un `eventId`: la XII Feria de Valledupar no
// comparte nada con las ediciones que vengan después.
//
// El navegador tiene un espejo reducido en `src/lib/eventRegistrationSpec.ts`
// (etiquetas y estados). El servidor valida siempre, aunque el navegador ya lo
// haya hecho.
// ════════════════════════════════════════════════════════════════════

// ── Monedas ──────────────────────────────────────────────────────────

/** Monedas que Stripe cobra sin decimales: el importe va tal cual. */
export const ZERO_DECIMAL = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
    'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export const toStripeAmount = (amount, currency) =>
    ZERO_DECIMAL.has(String(currency || '').toLowerCase())
        ? Math.round(Number(amount) || 0)
        : Math.round((Number(amount) || 0) * 100);

/** Monedas que el módulo sabe presentar. La lista no restringe a Stripe. */
export const CURRENCIES = [
    { code: 'USD', label: 'Dólar estadounidense', symbol: 'US$', decimals: 2 },
    { code: 'COP', label: 'Peso colombiano', symbol: '$', decimals: 0 },
    { code: 'EUR', label: 'Euro', symbol: '€', decimals: 2 },
    { code: 'MXN', label: 'Peso mexicano', symbol: '$', decimals: 2 },
    { code: 'BRL', label: 'Real brasileño', symbol: 'R$', decimals: 2 },
];

export const currencyMeta = (code) =>
    CURRENCIES.find(c => c.code === String(code || '').toUpperCase())
    || { code: String(code || 'USD').toUpperCase(), label: code, symbol: '', decimals: 2 };

/** Redondea al número de decimales con que se factura esa moneda. */
export const roundMoney = (amount, currency) => {
    const decimals = currencyMeta(currency).decimals;
    const factor = 10 ** decimals;
    return Math.round((Number(amount) || 0) * factor) / factor;
};

export const formatMoney = (amount, currency) => {
    const meta = currencyMeta(currency);
    return `${Number(amount || 0).toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: meta.decimals,
    })} ${meta.code}`;
};

// ── Estados de una inscripción ───────────────────────────────────────
//
// `committed` = ocupa cupo. `settled` = el dinero entró.
// `terminal` = no admite más cambios automáticos desde Stripe.

export const STATUSES = [
    { key: 'draft', label: 'Borrador', tone: 'slate', committed: false, settled: false, terminal: false, description: 'El formulario se abrió pero no se envió.' },
    { key: 'started', label: 'Registro iniciado', tone: 'slate', committed: false, settled: false, terminal: false, description: 'Se enviaron los datos, falta llegar al pago.' },
    { key: 'pending_payment', label: 'Pendiente de pago', tone: 'amber', committed: true, settled: false, terminal: false, description: 'Se generó el cobro y está a la espera de Stripe.' },
    { key: 'payment_failed', label: 'Pago fallido', tone: 'red', committed: false, settled: false, terminal: false, description: 'Stripe rechazó el cobro. Se puede reintentar.' },
    { key: 'expired', label: 'Cobro expirado', tone: 'slate', committed: false, settled: false, terminal: false, description: 'La sesión de pago venció sin completarse.' },
    { key: 'paid', label: 'Pago confirmado', tone: 'emerald', committed: true, settled: true, terminal: false, description: 'Stripe confirmó el pago por webhook.' },
    { key: 'confirmed', label: 'Confirmado', tone: 'emerald', committed: true, settled: true, terminal: false, description: 'Inscripción en firme (incluye las categorías sin costo).' },
    { key: 'waitlist', label: 'Lista de espera', tone: 'indigo', committed: false, settled: false, terminal: false, description: 'Sin cupo disponible; queda en espera.' },
    { key: 'accredited', label: 'Acreditado', tone: 'sky', committed: true, settled: true, terminal: false, description: 'Recogió su escarapela en la sede.' },
    { key: 'attended', label: 'Asistió', tone: 'sky', committed: true, settled: true, terminal: false, description: 'Se registró su asistencia al evento.' },
    { key: 'no_show', label: 'No asistió', tone: 'slate', committed: true, settled: true, terminal: true, description: 'Pagó pero no se presentó.' },
    { key: 'cancelled', label: 'Cancelado', tone: 'red', committed: false, settled: false, terminal: true, description: 'Anulada por el titular o por el equipo.' },
    { key: 'refunded', label: 'Reembolsado', tone: 'indigo', committed: false, settled: false, terminal: true, description: 'Stripe devolvió el dinero.' },
];

export const STATUS_KEYS = STATUSES.map(s => s.key);
export const statusMeta = (key) => STATUSES.find(s => s.key === key) || { key, label: key, tone: 'slate', committed: false, settled: false, terminal: false };

/** Estados que ocupan cupo: se descuentan del disponible de la categoría. */
export const COMMITTED_STATUSES = STATUSES.filter(s => s.committed).map(s => s.key);
/** Estados en los que el dinero se considera recaudado. */
export const SETTLED_STATUSES = STATUSES.filter(s => s.settled).map(s => s.key);

// Alias que conserva el nombre corto que usaba el controlador antes de v4.648.
export const STATUS = {
    DRAFT: 'draft',
    STARTED: 'started',
    PENDING: 'pending_payment',
    PAID: 'paid',
    FREE: 'confirmed',
    FAILED: 'payment_failed',
    EXPIRED: 'expired',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled',
    WAITLIST: 'waitlist',
    ACCREDITED: 'accredited',
    ATTENDED: 'attended',
    NO_SHOW: 'no_show',
};

// ── Etiquetas de segmentación ────────────────────────────────────────
//
// Las `system: true` las pone el propio módulo al guardar la inscripción y no
// se pueden borrar a mano: describen un hecho (la categoría, el pago, si trae
// acompañantes). Las demás las administra el equipo.

export const SYSTEM_TAGS = [
    { key: 'internacional', label: 'Internacional', tone: 'sky', system: true },
    { key: 'nacional', label: 'Nacional', tone: 'emerald', system: true },
    { key: 'cadres', label: 'CADRES', tone: 'violet', system: true },
    { key: 'pago_confirmado', label: 'Pago confirmado', tone: 'emerald', system: true },
    { key: 'pendiente', label: 'Pendiente', tone: 'amber', system: true },
    { key: 'con_acompanantes', label: 'Con acompañantes', tone: 'indigo', system: true },
    { key: 'requiere_visa', label: 'Requiere visa', tone: 'red', system: false },
    { key: 'requiere_traduccion', label: 'Requiere traducción', tone: 'violet', system: false },
    { key: 'necesidad_alimentaria', label: 'Necesidad alimentaria', tone: 'amber', system: false },
    { key: 'prioridad_logistica', label: 'Prioridad logística', tone: 'red', system: false },
];

export const SYSTEM_TAG_KEYS = SYSTEM_TAGS.filter(t => t.system).map(t => t.key);

export const normalizeTag = (raw) =>
    String(raw || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);

/**
 * Etiquetas que el módulo deduce de la propia inscripción. Se recalculan en
 * cada guardado; las manuales del equipo se conservan aparte.
 */
export const deriveSystemTags = ({ categoryKey, audience, status, companionsCount }) => {
    const tags = [];
    const scope = audience || AUDIENCE_BY_CATEGORY[categoryKey];
    if (scope === 'international') tags.push('internacional');
    if (scope === 'national') tags.push('nacional');
    if (scope === 'cadre') tags.push('cadres');
    if (SETTLED_STATUSES.includes(status)) tags.push('pago_confirmado');
    else if (status === 'pending_payment' || status === 'payment_failed') tags.push('pendiente');
    if (Number(companionsCount) > 0) tags.push('con_acompanantes');
    return tags;
};

// ── Campos del formulario ────────────────────────────────────────────
//
// Un campo es `{ key, label, type, required, options?, help?, max? }`.
// El paso `rotary` y `personal` los comparten todas las categorías; cada
// audiencia agrega los suyos.

const YES_NO = [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }];

const LANGUAGES = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'Inglés' },
    { value: 'pt', label: 'Portugués' },
    { value: 'fr', label: 'Francés' },
    { value: 'other', label: 'Otro' },
];

const ROTARY_ROLES = [
    { value: 'socio', label: 'Socio de club' },
    { value: 'presidente', label: 'Presidente de club' },
    { value: 'secretario', label: 'Secretario de club' },
    { value: 'tesorero', label: 'Tesorero de club' },
    { value: 'gobernador', label: 'Gobernador de distrito' },
    { value: 'gobernador_electo', label: 'Gobernador electo' },
    { value: 'asistente_gobernador', label: 'Asistente del gobernador' },
    { value: 'presidente_comite', label: 'Presidente de comité' },
    { value: 'rotaract', label: 'Rotaract' },
    { value: 'invitado', label: 'Invitado / no rotario' },
    { value: 'otro', label: 'Otro' },
];

const DIETARY = [
    { value: 'ninguna', label: 'Ninguna' },
    { value: 'vegetariana', label: 'Vegetariana' },
    { value: 'vegana', label: 'Vegana' },
    { value: 'sin_gluten', label: 'Sin gluten' },
    { value: 'sin_lactosa', label: 'Sin lactosa' },
    { value: 'alergia', label: 'Alergia alimentaria' },
    { value: 'otra', label: 'Otra' },
];

/** Campos comunes a toda inscripción, sin importar la categoría. */
export const CORE_PERSONAL_FIELDS = [
    { key: 'firstName', label: 'Nombres', type: 'text', required: true, max: 120, column: 'firstName' },
    { key: 'lastName', label: 'Apellidos', type: 'text', required: true, max: 120, column: 'lastName' },
    { key: 'email', label: 'Correo electrónico', type: 'email', required: true, max: 200, column: 'email' },
    { key: 'phone', label: 'Teléfono o WhatsApp', type: 'tel', required: true, max: 60, column: 'phone', help: 'Incluye el indicativo del país.' },
    { key: 'documentType', label: 'Tipo de documento', type: 'select', required: true, options: [
        { value: 'cedula', label: 'Cédula de ciudadanía' },
        { value: 'cedula_extranjeria', label: 'Cédula de extranjería' },
        { value: 'pasaporte', label: 'Pasaporte' },
        { value: 'otro', label: 'Otro' },
    ] },
    { key: 'documentNumber', label: 'Número de documento o pasaporte', type: 'text', required: true, max: 60 },
    { key: 'country', label: 'País', type: 'country', required: true, max: 120, column: 'country' },
    { key: 'city', label: 'Ciudad', type: 'text', required: true, max: 120 },
    { key: 'language', label: 'Idioma', type: 'select', required: true, options: LANGUAGES },
];

/** Datos rotarios: comunes, con el club obligatorio según la categoría. */
export const CORE_ROTARY_FIELDS = [
    { key: 'clubName', label: 'Club rotario', type: 'text', required: true, max: 200, column: 'clubName' },
    { key: 'district', label: 'Distrito', type: 'text', required: true, max: 40, help: 'Por ejemplo: 4281' },
    { key: 'rotaryRole', label: 'Cargo dentro de Rotary', type: 'select', required: true, options: ROTARY_ROLES },
];

/** Necesidades y aceptación: cierran el formulario en todas las categorías. */
export const CORE_NEEDS_FIELDS = [
    { key: 'dietary', label: 'Necesidades alimentarias', type: 'select', required: true, options: DIETARY },
    { key: 'dietaryDetail', label: 'Detalle de la necesidad alimentaria', type: 'text', required: false, max: 300, showIf: { key: 'dietary', notIn: ['ninguna'] } },
    { key: 'accessibility', label: 'Requerimientos especiales', type: 'textarea', required: false, max: 600, help: 'Movilidad, salud, acompañamiento, lo que necesites que sepamos.' },
];

export const TERMS_FIELD = {
    key: 'acceptTerms', label: 'Acepto los términos y el tratamiento de mis datos personales',
    type: 'checkbox', required: true,
};

/** Campos que sólo ve la audiencia internacional. */
export const INTERNATIONAL_FIELDS = [
    { key: 'residenceCountry', label: 'País de residencia', type: 'country', required: true, max: 120 },
    { key: 'arrivalDate', label: 'Fecha estimada de llegada', type: 'date', required: true },
    { key: 'departureDate', label: 'Fecha estimada de salida', type: 'date', required: true },
    { key: 'lodging', label: 'Hospedaje previsto', type: 'select', required: true, options: [
        { value: 'sede', label: 'Hotel sede del evento' },
        { value: 'otro_hotel', label: 'Otro hotel' },
        { value: 'familia', label: 'Casa de familia / anfitrión' },
        { value: 'por_definir', label: 'Por definir' },
    ] },
    { key: 'lodgingDetail', label: 'Nombre del hospedaje', type: 'text', required: false, max: 200, showIf: { key: 'lodging', notIn: ['por_definir'] } },
    { key: 'preferredLanguage', label: 'Idioma preferido durante el evento', type: 'select', required: true, options: LANGUAGES },
    { key: 'needsVisa', label: '¿Necesitas carta de invitación para visa?', type: 'select', required: true, options: YES_NO },
    { key: 'emergencyName', label: 'Contacto de emergencia — nombre', type: 'text', required: true, max: 160 },
    { key: 'emergencyPhone', label: 'Contacto de emergencia — teléfono', type: 'tel', required: true, max: 60 },
    { key: 'emergencyRelation', label: 'Contacto de emergencia — parentesco', type: 'text', required: false, max: 80 },
];

/** Campos que sólo ve la audiencia nacional. */
export const NATIONAL_FIELDS = [
    { key: 'department', label: 'Departamento', type: 'text', required: true, max: 120 },
];

/** Campos que sólo ven los CADRES. */
export const CADRE_FIELDS = [
    { key: 'technicalExperience', label: 'Experiencia técnica', type: 'textarea', required: true, max: 1200, help: 'Años de trabajo con proyectos, subvenciones o formulación.' },
    { key: 'specialties', label: 'Áreas de especialidad', type: 'multiselect', required: true, options: [
        { value: 'paz', label: 'Paz y prevención de conflictos' },
        { value: 'enfermedades', label: 'Prevención y tratamiento de enfermedades' },
        { value: 'agua', label: 'Agua, saneamiento e higiene' },
        { value: 'madres', label: 'Salud materno-infantil' },
        { value: 'educacion', label: 'Educación básica y alfabetización' },
        { value: 'economia', label: 'Desarrollo económico de la comunidad' },
        { value: 'ambiente', label: 'Medio ambiente' },
        { value: 'subvenciones', label: 'Subvenciones globales' },
        { value: 'formulacion', label: 'Formulación y evaluación de proyectos' },
    ] },
    { key: 'availability', label: 'Disponibilidad durante la feria', type: 'multiselect', required: true, options: [
        { value: 'dia_1', label: 'Día 1' },
        { value: 'dia_2', label: 'Día 2' },
        { value: 'dia_3', label: 'Día 3' },
        { value: 'completa', label: 'Toda la feria' },
    ] },
    { key: 'supportedClubs', label: 'Proyectos o clubes a los que apoyará', type: 'textarea', required: false, max: 1200, help: 'Si aún no lo sabes, déjalo en blanco: lo completamos contigo más adelante.' },
];

export const AUDIENCES = [
    { key: 'international', label: 'Internacional', extraFields: INTERNATIONAL_FIELDS },
    { key: 'national', label: 'Nacional', extraFields: NATIONAL_FIELDS },
    { key: 'cadre', label: 'CADRES', extraFields: CADRE_FIELDS },
    { key: 'general', label: 'General', extraFields: [] },
];

export const AUDIENCE_BY_CATEGORY = {
    rotario_internacional: 'international',
    rotario_nacional: 'national',
    cadres: 'cadre',
};

const audienceFields = (audience) =>
    (AUDIENCES.find(a => a.key === audience) || AUDIENCES[3]).extraFields;

/**
 * Arma el formulario completo de una categoría: los campos comunes, los de su
 * audiencia y los que el administrador haya agregado desde el panel.
 * Devuelve los pasos del asistente en el orden en que se muestran.
 */
export const buildFormSchema = (category) => {
    const audience = category?.audience || AUDIENCE_BY_CATEGORY[category?.key] || 'general';
    const extra = Array.isArray(category?.extraFields) ? category.extraFields : [];
    const requireClub = category?.requireClub !== false;

    const rotaryFields = CORE_ROTARY_FIELDS.map(f =>
        f.key === 'clubName' || f.key === 'district' ? { ...f, required: requireClub } : f);

    const steps = [
        { key: 'personal', label: 'Datos personales', fields: [...CORE_PERSONAL_FIELDS] },
        { key: 'rotary', label: 'Información rotaria', fields: [...rotaryFields, ...audienceFields(audience)] },
    ];

    if (extra.length) {
        steps.push({ key: 'extra', label: category?.extraFieldsLabel || 'Información adicional', fields: extra });
    }

    steps.push({ key: 'needs', label: 'Necesidades y condiciones', fields: [...CORE_NEEDS_FIELDS, TERMS_FIELD] });
    return { audience, steps };
};

/** Todos los campos de una categoría, aplanados, para validar. */
export const flattenFields = (category) =>
    buildFormSchema(category).steps.flatMap(s => s.fields);

/** ¿Se debe pedir este campo, dadas las respuestas actuales? */
export const isFieldVisible = (field, answers) => {
    const cond = field?.showIf;
    if (!cond) return true;
    const value = answers?.[cond.key];
    if (Array.isArray(cond.notIn)) return !cond.notIn.includes(value);
    if (Array.isArray(cond.in)) return cond.in.includes(value);
    if ('equals' in cond) return value === cond.equals;
    return true;
};

/**
 * Valida las respuestas contra el formulario de la categoría.
 * Devuelve `{ ok, errors: { campo: mensaje } }`. El servidor la corre siempre.
 */
export const validateAnswers = (category, answers = {}) => {
    const errors = {};
    for (const field of flattenFields(category)) {
        if (!isFieldVisible(field, answers)) continue;
        const raw = answers[field.key];
        const empty = raw === undefined || raw === null || raw === ''
            || (Array.isArray(raw) && raw.length === 0)
            || (field.type === 'checkbox' && raw !== true);

        if (field.required && empty) {
            errors[field.key] = field.type === 'checkbox'
                ? 'Debes aceptarlo para continuar.'
                : `${field.label} es obligatorio.`;
            continue;
        }
        if (empty) continue;

        if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim())) {
            errors[field.key] = 'Escribe un correo electrónico válido.';
        }
        if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) {
            errors[field.key] = 'Escribe la fecha en formato AAAA-MM-DD.';
        }
        if (field.max && String(raw).length > field.max) {
            errors[field.key] = `Máximo ${field.max} caracteres.`;
        }
        if (field.type === 'select' && Array.isArray(field.options)
            && !field.options.some(o => o.value === raw)) {
            errors[field.key] = 'Elige una de las opciones.';
        }
    }

    // Coherencia de fechas de viaje: sólo aplica si vinieron las dos.
    const { arrivalDate, departureDate } = answers;
    if (arrivalDate && departureDate && String(departureDate) < String(arrivalDate)) {
        errors.departureDate = 'La salida no puede ser anterior a la llegada.';
    }

    return { ok: Object.keys(errors).length === 0, errors };
};

// ── Acompañantes ─────────────────────────────────────────────────────

export const COMPANION_FIELDS = [
    { key: 'firstName', label: 'Nombres', type: 'text', required: true, max: 120 },
    { key: 'lastName', label: 'Apellidos', type: 'text', required: true, max: 120 },
    { key: 'documentNumber', label: 'Documento o pasaporte', type: 'text', required: true, max: 60 },
    { key: 'relationship', label: 'Parentesco o relación', type: 'text', required: false, max: 80 },
    { key: 'email', label: 'Correo electrónico', type: 'email', required: false, max: 200 },
    { key: 'phone', label: 'Teléfono', type: 'tel', required: false, max: 60 },
    { key: 'dietary', label: 'Necesidades alimentarias', type: 'select', required: false, options: DIETARY },
    { key: 'notes', label: 'Observaciones', type: 'text', required: false, max: 300 },
];

export const validateCompanion = (companion = {}, rules = {}) => {
    const errors = {};
    for (const field of COMPANION_FIELDS) {
        if (field.key === 'documentNumber' && rules.requireDocument === false) continue;
        const raw = companion[field.key];
        const empty = raw === undefined || raw === null || raw === '';
        if (field.required && empty) errors[field.key] = `${field.label} es obligatorio.`;
        else if (!empty && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim())) {
            errors[field.key] = 'Correo electrónico inválido.';
        }
    }
    return { ok: Object.keys(errors).length === 0, errors };
};

// ── Categorías ───────────────────────────────────────────────────────
//
// Las tres categorías con las que arranca cada edición. Son una PLANTILLA: al
// sembrarlas se copian a la tabla `EventRegistrationCategory` del evento y de
// ahí en adelante las manda el administrador. Cambiar estos valores no toca
// ninguna edición ya sembrada.

export const CATEGORY_BLUEPRINTS = [
    {
        key: 'rotario_internacional',
        name: 'Rotario Internacional',
        audience: 'international',
        description: 'Participantes residentes fuera de Colombia que viajan al país para conocer los proyectos postulados, establecer alianzas, identificar oportunidades de cooperación y apoyar iniciativas alineadas con las áreas de enfoque de Rotary.',
        currency: 'USD',
        // La pasarela cobra en la misma moneda en que se publica el precio: no
        // hay conversión ni tasa que registrar.
        settlementCurrency: 'USD',
        price: 350,
        capacity: null,
        companions: { allowed: true, max: 3, price: 180, currency: 'USD', requireDocument: true },
        benefits: [
            'Acceso a las tres jornadas de la feria',
            'Material del evento y traducción simultánea',
            'Almuerzos y estaciones de café',
            'Cena de gala de clausura',
        ],
        sortOrder: 1,
        active: true,
    },
    {
        key: 'rotario_nacional',
        name: 'Rotario Nacional',
        audience: 'national',
        description: 'Participantes residentes en Colombia que se inscriben para asistir a la feria, aprender, hacer networking, conocer los proyectos y participar en las actividades del evento.',
        currency: 'COP',
        // El precio se publica en pesos. Si la cuenta de Stripe liquida en
        // dólares, `settlementCurrency: 'USD'` hace la conversión con la tasa
        // vigente del evento y deja registrados los dos valores y la tasa.
        settlementCurrency: 'COP',
        price: 850000,
        capacity: null,
        companions: { allowed: true, max: 3, price: 420000, currency: 'COP', requireDocument: true },
        benefits: [
            'Acceso a las tres jornadas de la feria',
            'Material del evento',
            'Almuerzos y estaciones de café',
            'Cena de gala de clausura',
        ],
        sortOrder: 2,
        active: true,
    },
    {
        key: 'cadres',
        name: 'CADRES',
        audience: 'cadre',
        description: 'Asistentes técnicos que apoyan a los clubes postulantes en la estructuración, revisión, preparación y presentación de los proyectos ante los rotarios internacionales.',
        // El administrador decide la moneda de esta categoría por evento (USD o
        // COP). El cambio no afecta a las inscripciones ya confirmadas: cada una
        // guarda su propia foto de precio.
        currency: 'USD',
        settlementCurrency: 'USD',
        price: 150,
        capacity: 40,
        companions: { allowed: false, max: 0, price: 0, currency: 'USD', requireDocument: true },
        benefits: [
            'Acceso a las tres jornadas de la feria',
            'Sesión técnica de preparación con los clubes',
            'Almuerzos y estaciones de café',
        ],
        sortOrder: 3,
        active: true,
    },
];

/**
 * Versión de tarifa: identifica el precio con el que se abrió una inscripción.
 *
 * Se deriva de la última modificación de la categoría, así que cambiar el
 * precio produce una versión nueva sin tener que llevar un contador aparte. Se
 * congela en `pricing.tariffVersion` de cada inscripción para poder responder
 * "con qué tarifa entró esta persona" aunque el precio ya haya cambiado.
 */
export const tariffVersionOf = (category) => {
    const stamp = category?.updatedAt ? new Date(category.updatedAt).getTime() : 0;
    return `${category?.key || 'categoria'}@${stamp}`;
};

/** Normaliza una categoría venida de la base o del panel. */
export const normalizeCategory = (raw = {}) => {
    const key = normalizeTag(raw.key) || 'categoria';
    const currency = String(raw.currency || 'USD').toUpperCase().slice(0, 3);
    const companions = raw.companions || {};
    return {
        id: raw.id || null,
        key,
        name: String(raw.name || '').trim().slice(0, 160) || key,
        audience: AUDIENCES.some(a => a.key === raw.audience) ? raw.audience : (AUDIENCE_BY_CATEGORY[key] || 'general'),
        description: String(raw.description || '').trim().slice(0, 1200),
        currency,
        settlementCurrency: String(raw.settlementCurrency || currency).toUpperCase().slice(0, 3),
        price: Math.max(0, Number(raw.price) || 0),
        capacity: Number(raw.capacity) > 0 ? Math.floor(Number(raw.capacity)) : null,
        opensAt: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.opensAt || '')) ? raw.opensAt : null,
        closesAt: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.closesAt || '')) ? raw.closesAt : null,
        requireClub: raw.requireClub !== false,
        companions: {
            allowed: companions.allowed === true,
            max: Math.max(0, Math.min(10, Math.floor(Number(companions.max) || 0))),
            price: Math.max(0, Number(companions.price) || 0),
            currency: String(companions.currency || currency).toUpperCase().slice(0, 3),
            requireDocument: companions.requireDocument !== false,
        },
        benefits: (Array.isArray(raw.benefits) ? raw.benefits : [])
            .map(b => String(b || '').trim().slice(0, 200)).filter(Boolean).slice(0, 20),
        extraFields: (Array.isArray(raw.extraFields) ? raw.extraFields : [])
            .map((f, i) => ({
                key: normalizeTag(f?.key) || `campo_${i + 1}`,
                label: String(f?.label || '').trim().slice(0, 160) || `Campo ${i + 1}`,
                type: ['text', 'textarea', 'select', 'date', 'tel', 'email', 'number', 'checkbox', 'multiselect'].includes(f?.type) ? f.type : 'text',
                required: f?.required === true,
                max: Number(f?.max) > 0 ? Math.floor(Number(f.max)) : 400,
                help: String(f?.help || '').trim().slice(0, 300) || undefined,
                options: Array.isArray(f?.options)
                    ? f.options.map(o => ({
                        value: normalizeTag(o?.value ?? o) || String(o?.label || o).slice(0, 40),
                        label: String(o?.label ?? o).trim().slice(0, 120),
                    })).filter(o => o.label)
                    : undefined,
            }))
            .slice(0, 30),
        extraFieldsLabel: String(raw.extraFieldsLabel || '').trim().slice(0, 80) || null,
        sortOrder: Number(raw.sortOrder) || 0,
        active: raw.active !== false,
        updatedAt: raw.updatedAt || null,
    };
};

/** ¿La categoría está recibiendo inscripciones ahora mismo? */
export const categoryWindow = (category, now = new Date()) => {
    if (!category?.active) return { open: false, reason: 'inactive' };
    const today = now.toISOString().slice(0, 10);
    if (category.opensAt && today < category.opensAt) return { open: false, reason: 'not_yet', opensAt: category.opensAt };
    if (category.closesAt && today > category.closesAt) return { open: false, reason: 'closed', closesAt: category.closesAt };
    return { open: true, reason: null };
};

// ── Botones de inscripción de la ficha del evento ────────────────────
//
// La ficha pública muestra DOS botones: uno principal, que depende de si quien
// mira es de Colombia o de fuera, y debajo el de CADRES, que se ve siempre.
// Cada botón abre el formulario de UNA categoría, ya elegida y bloqueada.
//
// La configuración vive en `EventEdition.settings.cta`, así que es por evento:
// dos ediciones pueden tener botones y textos distintos.

/** Países que cuentan como "nacional" mientras el administrador no diga otra cosa. */
export const DEFAULT_NATIONAL_COUNTRIES = ['CO'];

/**
 * Idiomas del sitio que corresponden a la experiencia nacional.
 *
 * En este sitio el español ES el español de Colombia —el selector muestra una
 * sola opción «Español» con la bandera colombiana—, así que `es` y `es-CO` son
 * lo mismo. La comparación es EXACTA a propósito: `es-MX` o `es-ES` son
 * visitantes de fuera y deben ver la experiencia internacional.
 */
export const DEFAULT_NATIONAL_LOCALES = ['es', 'es-CO'];

/** ¿Este idioma activo corresponde a la experiencia nacional? */
export const isNationalLocale = (locale, nationalLocales = DEFAULT_NATIONAL_LOCALES) => {
    const value = String(locale || '').trim().toLowerCase();
    if (!value) return false;
    return (nationalLocales.length ? nationalLocales : DEFAULT_NATIONAL_LOCALES)
        .some(l => String(l).trim().toLowerCase() === value);
};

/**
 * Botones por defecto, deducidos de las categorías que tenga el evento.
 *
 * Se arman por `audience`, NO por el nombre ni por la clave: el administrador
 * puede renombrar "Rotario Internacional" a "Registro Internacional" —de hecho
 * ya lo hizo— y los botones tienen que seguir apuntando a donde deben.
 */
export const defaultCtaButtons = (categories = []) => {
    const byAudience = (audience) => categories.find(c => c.audience === audience);
    const buttons = [];

    const international = byAudience('international');
    if (international) {
        buttons.push({
            key: 'primary_international', categoryKey: international.key,
            label: 'Registro Internacional', role: 'primary', audience: 'international',
            active: true, order: 1, unavailableMessage: '',
        });
    }
    const national = byAudience('national');
    if (national) {
        buttons.push({
            key: 'primary_national', categoryKey: national.key,
            label: 'Registro Nacional', role: 'primary', audience: 'national',
            active: true, order: 2, unavailableMessage: '',
        });
    }
    const cadre = byAudience('cadre');
    if (cadre) {
        buttons.push({
            key: 'secondary_cadres', categoryKey: cadre.key,
            label: 'Registro CADRES', role: 'secondary', audience: null,
            active: true, order: 3, unavailableMessage: '',
        });
    }
    return buttons;
};

export const normalizeCtaConfig = (raw = {}, categories = []) => {
    const known = new Set(categories.map(c => c.key));
    const configured = (Array.isArray(raw.buttons) ? raw.buttons : [])
        .map((b, i) => ({
            key: normalizeTag(b?.key) || `boton_${i + 1}`,
            categoryKey: normalizeTag(b?.categoryKey),
            label: String(b?.label || '').trim().slice(0, 80),
            role: b?.role === 'secondary' ? 'secondary' : 'primary',
            audience: AUDIENCES.some(a => a.key === b?.audience) ? b.audience : null,
            active: b?.active !== false,
            order: Number(b?.order) || i + 1,
            unavailableMessage: String(b?.unavailableMessage || '').trim().slice(0, 240),
        }))
        // Un botón que apunte a una categoría borrada se descarta: no tiene a
        // dónde llevar.
        .filter(b => b.categoryKey && known.has(b.categoryKey) && b.label);

    const defaultByLanguage = {};
    if (raw.defaultByLanguage && typeof raw.defaultByLanguage === 'object') {
        for (const [lang, key] of Object.entries(raw.defaultByLanguage)) {
            const code = String(lang || '').toLowerCase().slice(0, 5);
            const target = normalizeTag(key);
            if (code && target && known.has(target)) defaultByLanguage[code] = target;
        }
    }

    return {
        enabled: raw.enabled !== false,
        buttons: configured.length ? configured.sort((a, b) => a.order - b.order) : defaultCtaButtons(categories),
        defaultByLanguage,
        nationalCountries: (Array.isArray(raw.nationalCountries) && raw.nationalCountries.length
            ? raw.nationalCountries
            : DEFAULT_NATIONAL_COUNTRIES)
            .map(c => String(c || '').toUpperCase().slice(0, 2)).filter(Boolean),
        // Idiomas del sitio que abren la experiencia nacional. Es lo que decide
        // el botón principal; los países ya sólo sirven de respaldo.
        nationalLocales: (Array.isArray(raw.nationalLocales) && raw.nationalLocales.length
            ? raw.nationalLocales
            : DEFAULT_NATIONAL_LOCALES)
            .map(l => String(l || '').trim().slice(0, 10)).filter(Boolean),
    };
};

/**
 * Decide si a quien mira la ficha se le ofrece el registro nacional o el
 * internacional.
 *
 * **Manda el idioma activo del sitio, siempre.** Si el visitante está viendo el
 * sitio en Español (Colombia) ve el registro nacional; en cualquier otro idioma
 * —English, Français, Deutsch, Italiano, Português…— ve el internacional. Y sólo
 * uno de los dos: nunca los dos a la vez.
 *
 * La geolocalización quedó relegada a lo que pidió el cliente: una **sugerencia
 * inicial** para escoger el idioma. En cuanto hay idioma activo —y el navegador
 * siempre lo manda— el país deja de intervenir. Hasta v4.651 era al revés, y por
 * eso un visitante con el sitio en inglés desde Colombia veía el botón nacional.
 *
 * El orden es: idioma activo del sitio → idioma del navegador → país → default.
 * Los tres últimos sólo actúan cuando no llega el primero (por ejemplo, si algo
 * consulta la API sin decir en qué idioma está el sitio).
 */
export const resolveAudienceHint = ({ locale, countryCode, languages = [], config = {} } = {}) => {
    const nationalLocales = config.nationalLocales?.length ? config.nationalLocales : DEFAULT_NATIONAL_LOCALES;

    // 1. Idioma activo del sitio: decisión final, sin excepciones.
    const active = String(locale || '').trim();
    if (active) {
        return {
            audience: isNationalLocale(active, nationalLocales) ? 'national' : 'international',
            source: 'locale',
            locale: active,
        };
    }

    // 2. Idioma del navegador, si el sitio no dijo el suyo.
    for (const tag of languages.map(l => String(l || '').trim()).filter(Boolean)) {
        return {
            audience: isNationalLocale(tag, nationalLocales) ? 'national' : 'international',
            source: 'browser_language',
            locale: tag,
        };
    }

    // 3. País, como último recurso antes del default.
    const nationalCountries = config.nationalCountries?.length ? config.nationalCountries : DEFAULT_NATIONAL_COUNTRIES;
    const country = String(countryCode || '').toUpperCase().slice(0, 2);
    if (country) {
        return {
            audience: nationalCountries.includes(country) ? 'national' : 'international',
            source: 'country',
            countryCode: country,
        };
    }

    return { audience: 'international', source: 'fallback' };
};

/**
 * Resuelve los botones que se pintan en la ficha, ya cruzados con el estado
 * real de cada categoría (activa, dentro de fechas, con cupo).
 *
 * Devuelve `{ primary, secondary[] }`. Un botón cuya categoría esté cerrada se
 * muestra deshabilitado SI el administrador escribió un mensaje; si no lo
 * escribió, se oculta. Es la regla que pidió el cliente y evita botones mudos.
 */
export const resolveCtaButtons = ({ categories = [], config = {}, audience = 'international', language = '' } = {}) => {
    const cfg = normalizeCtaConfig(config, categories);
    if (!cfg.enabled) return { enabled: false, primary: null, secondary: [] };

    const categoryOf = (key) => categories.find(c => c.key === key) || null;

    const decorate = (button) => {
        const category = categoryOf(button.categoryKey);
        if (!category) return null;
        const window = categoryWindow(category);
        // Sólo se declara agotada si hay un número de cupos restantes. Comparar
        // `null <= 0` da `true` en JavaScript, y eso escondía el botón de una
        // categoría cuyo cupo simplemente no se había calculado.
        const soldOut = typeof category.remaining === 'number' && category.remaining <= 0;
        const available = window.open && !soldOut;
        return {
            key: button.key,
            label: button.label,
            role: button.role,
            categoryKey: category.key,
            categoryName: category.name,
            currency: category.currency,
            price: category.price,
            available,
            unavailableReason: available ? null : (soldOut ? 'sold_out' : window.reason),
            unavailableMessage: button.unavailableMessage,
            // Sin mensaje configurado, un botón que no lleva a ninguna parte se
            // esconde en vez de quedarse gris sin explicación.
            hidden: !available && !button.unavailableMessage,
            href: `/registro?categoria=${encodeURIComponent(category.key)}`,
        };
    };

    const active = cfg.buttons.filter(b => b.active);
    const primaries = active.filter(b => b.role === 'primary');

    // El administrador puede fijar el botón principal de cada versión
    // lingüística; eso gana sobre la audiencia deducida.
    const forcedKey = cfg.defaultByLanguage[String(language || '').toLowerCase()]
        || cfg.defaultByLanguage[String(language || '').toLowerCase().slice(0, 2)];

    const chosen =
        (forcedKey && primaries.find(b => b.categoryKey === forcedKey))
        || primaries.find(b => b.audience === audience)
        || primaries[0]
        || null;

    return {
        enabled: true,
        audience,
        forcedByAdmin: Boolean(forcedKey),
        primary: chosen ? decorate(chosen) : null,
        secondary: active.filter(b => b.role === 'secondary').map(decorate).filter(Boolean),
    };
};

// ── Cobro y conversión de moneda ─────────────────────────────────────

/**
 * Tasa de cambio del evento. `rates` es `{ 'COP_USD': 0.00024, ... }` o, más
 * cómodo para el administrador, `{ usdToCop: 4100 }`. Se acepta cualquiera de
 * las dos y se resuelve siempre a "cuántas unidades de `to` vale 1 de `from`".
 */
export const resolveRate = (fx = {}, from, to) => {
    const a = String(from || '').toUpperCase();
    const b = String(to || '').toUpperCase();
    if (a === b) return 1;

    const direct = Number(fx?.rates?.[`${a}_${b}`]);
    if (direct > 0) return direct;

    const inverse = Number(fx?.rates?.[`${b}_${a}`]);
    if (inverse > 0) return 1 / inverse;

    // Atajo del caso real del cliente: el administrador escribe cuántos pesos
    // vale un dólar y de ahí salen las dos direcciones.
    const usdToCop = Number(fx?.usdToCop);
    if (usdToCop > 0) {
        if (a === 'USD' && b === 'COP') return usdToCop;
        if (a === 'COP' && b === 'USD') return 1 / usdToCop;
    }
    return null;
};

/**
 * Calcula lo que se le muestra al participante y lo que se le cobra.
 *
 * Devuelve la foto completa del cobro, que se congela en la inscripción: si
 * mañana el administrador cambia el precio o la moneda de la categoría, las
 * inscripciones ya creadas conservan estos valores.
 */
export const resolveCharge = ({ category, companionsCount = 0, fx = {} }) => {
    const cat = normalizeCategory(category);
    const count = Math.max(0, Math.floor(Number(companionsCount) || 0));

    const baseCurrency = cat.currency;
    const holderAmount = roundMoney(cat.price, baseCurrency);

    // El acompañante puede tener su propia moneda; si difiere de la del
    // titular se convierte antes de sumar, para no mezclar unidades.
    const companionUnitRaw = cat.companions.allowed ? cat.companions.price : 0;
    let companionUnit = companionUnitRaw;
    if (cat.companions.currency !== baseCurrency && companionUnitRaw > 0) {
        const r = resolveRate(fx, cat.companions.currency, baseCurrency);
        companionUnit = r ? roundMoney(companionUnitRaw * r, baseCurrency) : companionUnitRaw;
    }
    const companionsAmount = roundMoney(companionUnit * count, baseCurrency);
    const baseAmount = roundMoney(holderAmount + companionsAmount, baseCurrency);

    const settlementCurrency = cat.settlementCurrency || baseCurrency;
    if (settlementCurrency === baseCurrency) {
        return {
            baseCurrency, baseAmount, holderAmount, companionUnit, companionsAmount, companionsCount: count,
            chargeCurrency: baseCurrency, chargeAmount: baseAmount,
            fxRate: null, fxSource: null, converted: false,
        };
    }

    const rate = resolveRate(fx, baseCurrency, settlementCurrency);
    if (!rate) {
        // Sin tasa vigente no se inventa una: se cobra en la moneda publicada
        // y el panel avisa que falta configurarla.
        return {
            baseCurrency, baseAmount, holderAmount, companionUnit, companionsAmount, companionsCount: count,
            chargeCurrency: baseCurrency, chargeAmount: baseAmount,
            fxRate: null, fxSource: null, converted: false, fxMissing: true,
        };
    }

    return {
        baseCurrency, baseAmount, holderAmount, companionUnit, companionsAmount, companionsCount: count,
        chargeCurrency: settlementCurrency,
        chargeAmount: roundMoney(baseAmount * rate, settlementCurrency),
        fxRate: rate,
        fxSource: fx?.source || 'manual',
        fxUpdatedAt: fx?.updatedAt || null,
        converted: true,
    };
};

// ── Edición del evento ───────────────────────────────────────────────

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** "XII Rotary Project Fair Colombia 2027" → 12. Devuelve null si no hay. */
export const parseRomanEdition = (title) => {
    const match = /^\s*([IVXLCDM]{1,8})\b/i.exec(String(title || ''));
    if (!match) return null;
    const roman = match[1].toUpperCase();
    let total = 0;
    for (let i = 0; i < roman.length; i++) {
        const value = ROMAN[roman[i]];
        const next = ROMAN[roman[i + 1]];
        total += next && value < next ? -value : value;
    }
    return total > 0 && total < 200 ? total : null;
};

/** "Sonesta Hotel Valledupar, Valledupar, Cesar, Colombia" → Valledupar / Colombia. */
export const parseLocation = (location) => {
    const parts = String(location || '').split(',').map(p => p.trim()).filter(Boolean);
    if (!parts.length) return { venue: '', city: '', region: '', country: '' };
    return {
        venue: parts[0] || '',
        city: parts.length >= 2 ? parts[1] : '',
        region: parts.length >= 4 ? parts[2] : '',
        country: parts.length >= 3 ? parts[parts.length - 1] : '',
    };
};

/** Prefijo del código de inscripción: RPF12, RPF13… */
export const buildCodePrefix = (editionNumber) =>
    `RPF${Number(editionNumber) > 0 ? Math.floor(Number(editionNumber)) : ''}`.slice(0, 10);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Sufijo aleatorio sin caracteres que se confundan al dictarlos por teléfono. */
export const randomCodeSuffix = (length = 5) => {
    let out = '';
    for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return out;
};

export const buildRegistrationCode = (prefix) =>
    `${prefix || 'REG'}-${randomCodeSuffix(5)}`;

export default {
    ZERO_DECIMAL, toStripeAmount, CURRENCIES, currencyMeta, roundMoney, formatMoney,
    STATUSES, STATUS, STATUS_KEYS, statusMeta, COMMITTED_STATUSES, SETTLED_STATUSES,
    SYSTEM_TAGS, SYSTEM_TAG_KEYS, normalizeTag, deriveSystemTags,
    CORE_PERSONAL_FIELDS, CORE_ROTARY_FIELDS, CORE_NEEDS_FIELDS, TERMS_FIELD,
    INTERNATIONAL_FIELDS, NATIONAL_FIELDS, CADRE_FIELDS, AUDIENCES, AUDIENCE_BY_CATEGORY,
    buildFormSchema, flattenFields, isFieldVisible, validateAnswers,
    COMPANION_FIELDS, validateCompanion,
    CATEGORY_BLUEPRINTS, normalizeCategory, categoryWindow, tariffVersionOf,
    DEFAULT_NATIONAL_COUNTRIES, DEFAULT_NATIONAL_LOCALES, isNationalLocale,
    defaultCtaButtons, normalizeCtaConfig,
    resolveAudienceHint, resolveCtaButtons,
    resolveRate, resolveCharge,
    parseRomanEdition, parseLocation, buildCodePrefix, randomCodeSuffix, buildRegistrationCode,
};
