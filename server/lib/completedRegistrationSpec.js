// ════════════════════════════════════════════════════════════════════
// Inscripciones completadas de un evento — el CRITERIO — v4.943.0
//
// «Inscripciones completadas» registra a quienes YA se inscribieron y pagaron
// POR FUERA de la página —transferencia bancaria, pasarela externa, efectivo—
// y a quienes sólo les falta entregar la información para quedar formalmente
// en el sistema. NO reemplaza al flujo de «Inscripciones»: convive con él.
//
// Este archivo es PURO: sin base, sin red, sin S3. Define los estados, el
// formulario de cuatro pasos, la validación, el comprobante aceptado, el
// código de inscripción y la semilla que ata la URL pública de la XIII
// Conferencia. La orquestación vive en `completedRegistrationStore.js` y en
// los dos controladores; es la misma separación de `seoRules.js` frente a
// `seoAudit.js`.
//
// Decisión de fondo: estas inscripciones viven en SU PROPIA tabla
// (`EventCompletedRegistration`), no en `EventRegistration` con una columna de
// origen. Con una columna, cada consulta existente del módulo —el tablero, el
// cupo, el panel del asistente, `attachOrphanRegistrations`, el webhook— sería
// un punto donde mezclar en silencio, que es exactamente el defecto que el
// pedido prohíbe («no mezclar silenciosamente los registros»). Con tabla
// propia la separación es estructural y los puntos de contacto son EXPLÍCITOS:
// la detección de duplicados y la acreditación.
// ════════════════════════════════════════════════════════════════════

import { randomCodeSuffix, clubContradictsDistrict, isFieldVisible } from './eventRegistrationSpec.js';

// ── Origen del registro ──────────────────────────────────────────────
//
// `registrationSource` distingue de dónde salió cada participante. En la tabla
// nueva el valor es siempre el manual —la separación ya es estructural—, pero
// el campo existe igual: es lo que permite que Acreditación, los exportes y
// cualquier consumidor futuro digan la fuente sin deducirla de en qué tabla
// estaba la fila.

export const COMPLETED_SOURCE = 'manual_completed_registration';
export const ONLINE_SOURCE = 'online_registration';

export const SOURCE_LABELS = {
    [COMPLETED_SOURCE]: 'Inscripción completada (manual)',
    [ONLINE_SOURCE]: 'Formulario de inscripción en línea',
};

// ── Estados ──────────────────────────────────────────────────────────
//
// Es un catálogo PROPIO, no el de `EventRegistration`: acá no hay Stripe, no
// hay cupo y no hay borradores. El envío del formulario NUNCA confirma nada
// por sí solo — nace «Pendiente de validación» y es el Equipo de Registro
// quien decide, revisando el comprobante.
//
// `accreditable` = puede pasar a Acreditación el día del evento.

export const COMPLETED_STATUSES = [
    { key: 'submitted', label: 'Pendiente de validación', tone: 'amber', accreditable: false, description: 'La información llegó y espera la revisión del Equipo de Registro.' },
    { key: 'validated', label: 'Validado', tone: 'emerald', accreditable: true, description: 'El equipo revisó los datos y el comprobante: la inscripción queda en firme.' },
    { key: 'payment_confirmed', label: 'Pago confirmado', tone: 'emerald', accreditable: true, description: 'El equipo verificó que el dinero efectivamente entró.' },
    { key: 'needs_correction', label: 'Requiere corrección', tone: 'red', accreditable: false, description: 'Falta o no coincide algo; se le pidió al participante corregirlo.' },
    { key: 'rejected', label: 'Rechazado', tone: 'slate', accreditable: false, description: 'El registro no procede. La fila se conserva con su motivo.' },
];

export const COMPLETED_STATUS_KEYS = COMPLETED_STATUSES.map(s => s.key);
export const ACCREDITABLE_STATUSES = COMPLETED_STATUSES.filter(s => s.accreditable).map(s => s.key);

export const completedStatusMeta = (key) =>
    COMPLETED_STATUSES.find(s => s.key === key)
    || { key, label: key, tone: 'slate', accreditable: false, description: '' };

// ── Catálogos del formulario ─────────────────────────────────────────

export const PAYMENT_METHODS = [
    { value: 'pasarela_colrotarios', label: 'Pasarela de pagos de COLROTARIOS' },
    { value: 'transferencia', label: 'Transferencia Bancaria' },
    { value: 'otro', label: 'Otro' },
];

export const paymentMethodLabel = (value) =>
    PAYMENT_METHODS.find(m => m.value === value)?.label || value || '';

export const MEMBERSHIP_OPTIONS = [
    { value: 'socio_activo', label: 'Soy socio activo del Club' },
    { value: 'invitado', label: 'Soy invitado' },
    { value: 'sin_club', label: 'No pertenezco actualmente a un Club Rotario' },
];

export const membershipLabel = (value) =>
    MEMBERSHIP_OPTIONS.find(m => m.value === value)?.label || value || '';

/**
 * El cargo lleva el período rotario EN el rótulo («Presidente electo año
 * Rotario 2026-2027»), y el período es de la EDICIÓN, no del código: la XIV
 * Conferencia preguntará por otro período sin tocar nada de esto.
 */
export const DEFAULT_ROLE_PERIOD = '2026-2027';

export const clubRoleOptions = (period = DEFAULT_ROLE_PERIOD) => [
    { value: 'past_gobernador', label: 'Soy Past-gobernador' },
    { value: 'presidente_electo', label: `Presidente electo año Rotario ${period}` },
    { value: 'otro_cargo', label: 'Otro cargo asignado' },
    { value: 'sin_cargo', label: 'Aún no tengo asignado cargo, solo socio' },
];

export const clubRoleLabel = (value, period = DEFAULT_ROLE_PERIOD) =>
    clubRoleOptions(period).find(r => r.value === value)?.label || value || '';

// ── Comprobante de pago ──────────────────────────────────────────────
//
// El archivo NO viaja en el cuerpo de la petición: una función en Vercel corta
// los cuerpos en ~4,5 MB y el comprobante admite hasta 10 (una foto de móvil
// pesa 2-6). Sube DIRECTO a S3 con una URL prefirmada —el mismo camino que la
// Biblioteca Multimedia— a un prefijo propio (`private/event-receipts/`), que
// no tiene lectura pública: el panel lo lee con un enlace firmado que caduca,
// igual que el comprobante de un desembolso.

export const RECEIPT_TYPES = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

export const RECEIPT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** La extensión del archivo, decidida por el MIME y con la extensión de respaldo. */
export const receiptExtensionFor = (contentType, filename = '') => {
    const byMime = RECEIPT_TYPES[String(contentType || '').toLowerCase().split(';')[0].trim()];
    if (byMime) return byMime;
    const ext = String(filename || '').toLowerCase().split('.').pop();
    return RECEIPT_EXTENSIONS.includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : null;
};

/**
 * ¿Se acepta este archivo como comprobante? Se comprueba ANTES de prefirmar la
 * subida y OTRA VEZ contra el objeto real al enviar el formulario: lo que el
 * navegador declara no es lo que el objeto pesa.
 */
export const checkReceiptMeta = ({ contentType, filename, size } = {}) => {
    const errores = [];
    if (!receiptExtensionFor(contentType, filename)) {
        errores.push('El comprobante debe ser PDF, JPG, PNG o WebP.');
    }
    const bytes = Number(size);
    if (Number.isFinite(bytes) && bytes > RECEIPT_MAX_BYTES) {
        errores.push(`El comprobante pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo es ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.`);
    }
    if (Number.isFinite(bytes) && bytes <= 0) {
        errores.push('El archivo llegó vacío.');
    }
    return { ok: errores.length === 0, errores };
};

// ── Configuración por evento ─────────────────────────────────────────
//
// Vive en `EventEdition.settings.completedForm`: es POR EVENTO y se edita
// desde el panel, sin desplegar. La XIII Conferencia es la primera; otra
// edición u otro evento se enciende configurando su propio slug.

/**
 * Un slug es UN segmento de ruta. Los reservados son las rutas reales de la
 * aplicación: un formulario publicado en `/admin` o `/eventos` quedaría
 * inalcanzable —la ruta existente gana— y parecería un módulo roto.
 */
export const RESERVED_SLUGS = [
    'admin', 'api', 'login', 'registro', 'eventos', 'blog', 'proyectos',
    'plantillas', 'aniversarios', 'restablecer', 'mi-inscripcion', 'mi-proyecto',
    'checkout', 'contacto', 'registro-feria', 'feria-proyectos',
];

export const normalizeCompletedSlug = (raw) =>
    String(raw || '')
        .trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/^\/+/, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);

export const DEFAULT_COMPLETED_CONFIG = {
    enabled: false,
    slug: '',
    codePrefix: '',
    title: '',
    intro: '',
    headerImageUrl: '',
    rolePeriod: DEFAULT_ROLE_PERIOD,
    successMessage: '',
};

const cleanStr = (value, max) => String(value ?? '').trim().slice(0, max);

export const normalizeCompletedConfig = (raw = {}) => ({
    enabled: raw?.enabled === true,
    slug: normalizeCompletedSlug(raw?.slug),
    codePrefix: cleanStr(raw?.codePrefix, 20).toUpperCase().replace(/[^A-Z0-9-]/g, ''),
    title: cleanStr(raw?.title, 300),
    intro: cleanStr(raw?.intro, 2000),
    headerImageUrl: cleanStr(raw?.headerImageUrl, 500),
    rolePeriod: cleanStr(raw?.rolePeriod, 20) || DEFAULT_ROLE_PERIOD,
    successMessage: cleanStr(raw?.successMessage, 600),
});

/**
 * Con qué prefijo nacen los códigos. El configurado manda; sin él se deriva
 * del prefijo de la edición para que un evento sin configurar no reparta
 * códigos anónimos.
 */
export const completedCodePrefixFor = (config = {}, edition = {}) =>
    config.codePrefix || (edition?.codePrefix ? `${edition.codePrefix}-C` : 'REG-C');

/** `CR4281-2027-XXXXX`: prefijo configurado + sufijo dictable por teléfono. */
export const buildCompletedCode = (prefix) =>
    `${prefix || 'REG-C'}-${randomCodeSuffix(5)}`;

// ── El formulario de cuatro pasos ────────────────────────────────────
//
// La estructura es FIJA —es el contrato del pedido, calcado del formulario de
// referencia— y lo configurable son los textos y el período del cargo. Los
// campos usan la misma forma `{ key, label, type, required, … }` que el
// formulario de inscripción normal, así que el navegador los pinta con las
// mismas piezas (`Field`, `PhoneField`).
//
// `requiredIf` es propio de este formulario: el distrito y el club se piden
// SIEMPRE pero sólo son obligatorios si la persona pertenece a un club —a
// quien marcó «No pertenezco actualmente a un Club Rotario» no se le puede
// exigir el nombre de un club que no tiene—.

export const buildCompletedSchema = (config = {}) => {
    const period = config.rolePeriod || DEFAULT_ROLE_PERIOD;
    return {
        steps: [
            {
                key: 'participante',
                label: 'Información del participante',
                fields: [
                    { key: 'firstName', label: 'Nombre', type: 'text', required: true, max: 120, placeholder: 'Escriba su primer nombre' },
                    { key: 'lastName', label: 'Apellido', type: 'text', required: true, max: 120, placeholder: 'Escriba su primer apellido' },
                    { key: 'documentNumber', label: 'Documento de identidad del participante', type: 'text', required: true, max: 60, placeholder: 'Sin puntos ni espacios' },
                    { key: 'email', label: 'Email', type: 'email', required: true, max: 200, placeholder: 'nombre@correo.com' },
                    { key: 'phone', label: 'Número de Contacto o WhatsApp', type: 'tel', required: true, max: 60 },
                    {
                        key: 'district', label: 'Distrito al que pertenece', type: 'text', required: true, max: 60,
                        catalog: 'districts', placeholder: 'Por ejemplo: 4281',
                        requiredIf: { key: 'membershipType', notIn: ['sin_club'] },
                    },
                    {
                        key: 'clubName', label: 'Nombre del club al que pertenece', type: 'text', required: true, max: 200,
                        catalog: 'clubs', dependsOn: 'district', placeholder: 'Nombre del club',
                        requiredIf: { key: 'membershipType', notIn: ['sin_club'] },
                    },
                    { key: 'membershipType', label: '¿Es socio activo o invitado?', type: 'select', required: true, options: MEMBERSHIP_OPTIONS },
                ],
            },
            {
                key: 'cargo',
                label: `Cargo en el Club para el periodo ${period}`,
                fields: [
                    {
                        key: 'clubRole', label: `Seleccione un cargo en el Club para el periodo ${period}`,
                        type: 'radio', required: true, options: clubRoleOptions(period),
                    },
                    {
                        key: 'clubRoleOther', label: 'Indique el cargo', type: 'text', required: true, max: 160,
                        placeholder: 'Escriba el cargo asignado', showIf: { key: 'clubRole', in: ['otro_cargo'] },
                    },
                ],
            },
            {
                key: 'evento',
                label: 'Información particular para el evento',
                fields: [
                    { key: 'eps', label: 'EPS a la que está afiliado el participante', type: 'text', required: true, max: 200 },
                    { key: 'foodAllergy', label: '¿Alérgico a algún alimento? Responda Ninguno o especifique cuál…', type: 'text', required: true, max: 300 },
                    { key: 'emergencyName', label: 'Nombre de la persona de contacto en caso de emergencia', type: 'text', required: true, max: 160 },
                    { key: 'emergencyPhone', label: 'Teléfono del contacto en caso de emergencia', type: 'tel', required: true, max: 60 },
                ],
            },
            {
                key: 'pago',
                label: 'Método de pago',
                fields: [
                    { key: 'paymentMethod', label: 'Seleccione el método de pago', type: 'radio', required: true, options: PAYMENT_METHODS },
                    {
                        // El comprobante se valida aparte (`checkReceiptMeta` +
                        // la verificación del objeto real): este campo existe
                        // para que el paso lo PINTE en su sitio.
                        key: 'receipt', label: 'Subir comprobante de pago del aporte', type: 'file', required: true,
                        help: `PDF, JPG, PNG o WebP · máximo ${RECEIPT_MAX_BYTES / 1024 / 1024} MB`,
                    },
                    { key: 'comments', label: 'Comentarios o peticiones especiales', type: 'textarea', required: false, max: 2000 },
                ],
            },
        ],
    };
};

/** Los campos con RESPUESTA, aplanados. El comprobante se valida aparte. */
export const flattenCompletedFields = (config = {}) =>
    buildCompletedSchema(config).steps.flatMap(s => s.fields).filter(f => f.type !== 'file');

/** ¿Este campo es obligatorio, dadas las respuestas actuales? */
export const isCompletedFieldRequired = (field, answers = {}) => {
    if (!field?.required) return false;
    const cond = field.requiredIf;
    if (!cond) return true;
    const value = answers?.[cond.key];
    if (Array.isArray(cond.notIn)) return !cond.notIn.includes(value);
    if (Array.isArray(cond.in)) return cond.in.includes(value);
    return true;
};

/**
 * Las opciones de un campo del formulario, dadas las respuestas.
 *
 * NO es `optionsForField` del registro normal: aquél condiciona el catálogo de
 * distritos a que el país sea Colombia, y este formulario no pregunta el país
 * —la lista se ofrece siempre y sigue sin cerrar los valores: quien es de otro
 * distrito lo escribe a mano («Mi club no está en la lista» / distrito
 * manual)—. `null` = texto libre; `[]` = catálogo vacío.
 */
export const completedOptionsFor = (field, answers = {}, catalogs = {}) => {
    if (field?.catalog === 'districts') {
        const districts = catalogs.districts || [];
        return districts.length ? districts.map(d => ({ value: d.value, label: d.label })) : null;
    }
    if (field?.catalog === 'clubs') {
        const chosen = String(answers[field.dependsOn || 'district'] || '').trim();
        if (!chosen) return null;
        const district = (catalogs.districts || []).find(d => d.value === chosen || d.label === chosen);
        return district && district.clubs?.length
            ? district.clubs.map(c => ({ value: c, label: c }))
            : null;
    }
    return Array.isArray(field?.options) ? field.options : null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida las respuestas completas contra el formulario. El servidor la corre
 * SIEMPRE, aunque el navegador ya haya validado paso a paso.
 */
export const validateCompletedAnswers = (config, answers = {}, catalogs = {}) => {
    const errors = {};
    for (const field of flattenCompletedFields(config)) {
        if (!isFieldVisible(field, answers)) continue;
        const raw = answers[field.key];
        const empty = raw === undefined || raw === null || String(raw).trim() === '';

        if (isCompletedFieldRequired(field, answers) && empty) {
            errors[field.key] = `${field.label} es obligatorio.`;
            continue;
        }
        if (empty) continue;

        if (field.type === 'email' && !EMAIL_RE.test(String(raw).trim())) {
            errors[field.key] = 'Escribe un correo electrónico válido.';
        }
        if (field.type === 'tel' && String(raw).replace(/\D/g, '').length < 7) {
            errors[field.key] = 'Escribe un número de teléfono válido.';
        }
        if (field.max && String(raw).length > field.max) {
            errors[field.key] = `Máximo ${field.max} caracteres.`;
        }
        // Sólo los catálogos CERRADOS (membresía, cargo, método de pago) se
        // validan contra sus opciones. Distrito y club son texto para el
        // servidor: la lista ayuda a escribir, no cierra los valores (v4.706).
        if ((field.type === 'select' || field.type === 'radio') && !field.catalog
            && Array.isArray(field.options) && !field.options.some(o => o.value === raw)) {
            errors[field.key] = 'Elige una de las opciones.';
        }
    }

    // Un club que figura en el catálogo de OTRO distrito no es un club que
    // falte: es una pareja distrito-club que se contradice. Misma regla que la
    // inscripción normal y la postulación (v4.706).
    if (!errors.clubName && clubContradictsDistrict(answers.district, answers.clubName, {
        districts: catalogs.districts || [],
    })) {
        errors.clubName = 'Ese club figura en otro distrito. Revisa el distrito que elegiste.';
    }

    return { ok: Object.keys(errors).length === 0, errors };
};

// ── Duplicados ───────────────────────────────────────────────────────
//
// Antes de crear el registro se busca al MISMO participante —por documento o
// por correo— entre las inscripciones normales del evento y entre las ya
// completadas. Lo que se hace con la coincidencia es MARCAR y RELACIONAR,
// nunca borrar ni fusionar: la alerta es del panel, y decidir es del equipo.

export const duplicateMatchKind = (row, { email, documentNumber } = {}) => {
    const mail = String(email || '').trim().toLowerCase();
    const doc = String(documentNumber || '').trim().toLowerCase();
    const rowMail = String(row?.email || '').trim().toLowerCase();
    const rowDoc = String(row?.documentNumber || '').trim().toLowerCase();
    const byMail = Boolean(mail && rowMail && mail === rowMail);
    const byDoc = Boolean(doc && rowDoc && doc === rowDoc);
    if (byMail && byDoc) return 'correo y documento';
    if (byDoc) return 'documento';
    if (byMail) return 'correo';
    return null;
};

/** El resumen que se guarda en `flags` y se pinta en la ficha. */
export const buildDuplicateFlags = ({ online = [], completed = [] } = {}, subject = {}) => {
    const summarize = (rows, source) => rows
        .map(r => ({
            id: r.id,
            source,
            code: r.registrationCode || r.publicRef || null,
            name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
            status: r.status,
            match: duplicateMatchKind(r, subject),
        }))
        .filter(r => r.match);
    const found = [
        ...summarize(online, ONLINE_SOURCE),
        ...summarize(completed, COMPLETED_SOURCE),
    ];
    return { hasDuplicates: found.length > 0, duplicates: found };
};

// ── Semilla de la XIII Conferencia ───────────────────────────────────
//
// La URL pedida — https://rotary4281.org/inscripcion-conferencia-distrital-
// villavicencio-2027 — tiene que funcionar sin que un DESPLIEGUE escriba en la
// base (regla del 2026-07-13). La semilla ata el slug a su evento AL LEER,
// como `bindLegacyEdition` en Postulaciones: la primera visita que resuelva el
// slug busca el evento, y sólo si lo identifica SIN AMBIGÜEDAD —exactamente
// uno cuyo título contenga todos los tokens— escribe la configuración en su
// edición. Con cero o varios candidatos no se toca nada: atar el formulario al
// evento equivocado es peor que pedirle al administrador que lo configure a
// mano desde la pestaña.

export const COMPLETED_FORM_SEEDS = [
    {
        slug: 'inscripcion-conferencia-distrital-villavicencio-2027',
        titleTokens: ['conferencia', 'villavicencio', '2027'],
        config: {
            enabled: true,
            codePrefix: 'CR4281-2027',
            rolePeriod: '2026-2027',
        },
    },
];

export const seedForSlug = (slug) =>
    COMPLETED_FORM_SEEDS.find(s => s.slug === normalizeCompletedSlug(slug)) || null;

/** El evento de la semilla, sólo si es inequívoco. `null` con 0 o varios. */
export const matchSeedEvent = (seed, events = []) => {
    const matches = events.filter(e => {
        const title = String(e?.title || '').toLowerCase();
        return seed.titleTokens.every(token => title.includes(token));
    });
    return matches.length === 1 ? matches[0] : null;
};

export default {
    COMPLETED_SOURCE, ONLINE_SOURCE, SOURCE_LABELS,
    COMPLETED_STATUSES, COMPLETED_STATUS_KEYS, ACCREDITABLE_STATUSES, completedStatusMeta,
    PAYMENT_METHODS, paymentMethodLabel, MEMBERSHIP_OPTIONS, membershipLabel,
    DEFAULT_ROLE_PERIOD, clubRoleOptions, clubRoleLabel,
    RECEIPT_TYPES, RECEIPT_EXTENSIONS, RECEIPT_MAX_BYTES, receiptExtensionFor, checkReceiptMeta,
    RESERVED_SLUGS, normalizeCompletedSlug, DEFAULT_COMPLETED_CONFIG, normalizeCompletedConfig,
    completedCodePrefixFor, buildCompletedCode,
    buildCompletedSchema, flattenCompletedFields, isCompletedFieldRequired,
    completedOptionsFor, validateCompletedAnswers,
    duplicateMatchKind, buildDuplicateFlags,
    COMPLETED_FORM_SEEDS, seedForSlug, matchSeedEvent,
};
