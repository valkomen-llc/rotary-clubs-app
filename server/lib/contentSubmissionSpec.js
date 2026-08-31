// ════════════════════════════════════════════════════════════════════
// Aportes de contenido a una campaña — el CRITERIO
// v4.968.0
//
// Un club documenta desde el teléfono lo que hizo por una campaña; el equipo
// lo revisa, lo aprueba, y desde ese momento el material vive en la Biblioteca
// con su historia pegada y puede convertirse en publicaciones.
//
// Este archivo es PURO: sin base, sin red, sin IA, sin reloj propio —toda
// función que dependa del tiempo recibe `now` como parámetro—. Por eso se
// prueba entero con `npm run test:submissions` y por eso la orquestación no
// contiene criterio.
//
// ─── Decisiones que viven acá y conviene no mover ────────────────────
//
// - APROBADO NO ES PUBLICADO, y son dos estados distintos a propósito. Un
//   material puede estar aprobado y no haberse usado todavía en ninguna
//   comunicación; fundirlos haría imposible contestar «¿qué nos falta por
//   difundir?», que es justamente para lo que sirve una bandeja.
//
// - EL CONSENTIMIENTO SE GUARDA CON LA SOLICITUD, NO SE REFERENCIA. Se copia
//   el TEXTO aceptado dentro de la fila. Si mañana alguien cambia el texto de
//   la campaña, hay que poder decir qué aceptó esa persona ese día: con una
//   referencia, el cambio reescribiría retroactivamente lo que se aceptó, que
//   es exactamente lo que un consentimiento no puede hacer.
//
// - EL TEXTO LEGAL NO SE INVENTA. La plataforma no tiene hoy ninguna política
//   de uso de imagen (no hay `/politica`, `/privacidad` ni equivalente: se
//   buscó). `DEFAULT_CONSENT_TEXT` es un MARCADOR que dice que hace falta
//   configurarlo, y `consentIsConfigured` lo distingue de un texto real para
//   que la pantalla lo avise. Redactar términos legales por nuestra cuenta
//   sería peor que no tenerlos.
//
// - LO QUE ESCRIBE QUIEN ENVÍA ES DATO, NO ADORNO. La historia, el club, la
//   ubicación y la fecha son lo único que después impide que un modelo invente
//   quién aparece en una fotografía. Es la misma regla del tipo «Maneras de
//   Contribuir» (v4.967): sin contexto registrado, lo que no se sabe se declara
//   como desconocido en vez de completarse.
// ════════════════════════════════════════════════════════════════════

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const multi = (v, max) => String(v ?? '').trim().slice(0, max);   // conserva saltos de línea
const arr = (v) => (Array.isArray(v) ? v : []);

// ─── Los estados ───────────────────────────────────────────────────────
//
// El camino principal avanza; `requiere_info` y `descartado` son salidas
// laterales. `order` es lo que hace que la bandeja se pueda ordenar por avance
// sin escribir la comparación en la pantalla.
export const SUBMISSION_STATES = {
    recibido: { id: 'recibido', label: 'Recibido', order: 10, tone: 'sky', help: 'Llegó por el formulario y nadie la miró todavía.' },
    en_revision: { id: 'en_revision', label: 'En revisión', order: 20, tone: 'amber', help: 'Alguien la está mirando.' },
    requiere_info: { id: 'requiere_info', label: 'Requiere información', order: 25, tone: 'amber', help: 'Falta algo y hay que pedírselo a quien la envió.' },
    aprobado: { id: 'aprobado', label: 'Aprobado', order: 30, tone: 'emerald', help: 'El material sirve. Todavía no se usó en ninguna comunicación.' },
    listo_difusion: { id: 'listo_difusion', label: 'Listo para difusión', order: 40, tone: 'emerald', help: 'Está en la Biblioteca y se puede convertir en publicaciones.' },
    publicado: { id: 'publicado', label: 'Publicado', order: 50, tone: 'blue', help: 'Se usó en al menos una comunicación.' },
    descartado: { id: 'descartado', label: 'Descartado', order: 90, tone: 'gray', help: 'No se va a usar. Se conserva con su motivo.' },
};

export const SUBMISSION_STATE_IDS = Object.keys(SUBMISSION_STATES);
export const INITIAL_STATE = 'recibido';

/**
 * ⚠️ EL INSERT PÚBLICO NO ACEPTA OTRO ESTADO QUE `recibido`.
 *
 * Enviar no aprueba nada: es el requisito 13 y es estructural, no una regla de
 * pantalla. Lo fija una prueba.
 */
export const stateLabel = (id) => SUBMISSION_STATES[id]?.label || id;

const FLOW = {
    recibido: ['en_revision', 'requiere_info', 'aprobado', 'descartado'],
    en_revision: ['aprobado', 'requiere_info', 'descartado', 'recibido'],
    requiere_info: ['en_revision', 'aprobado', 'descartado', 'recibido'],
    // «Aprobado» no salta a «Publicado» por su cuenta: entre los dos está
    // llevarlo a la Biblioteca, que es un acto con su propia acción.
    aprobado: ['listo_difusion', 'requiere_info', 'descartado', 'en_revision'],
    listo_difusion: ['publicado', 'aprobado', 'descartado'],
    publicado: ['listo_difusion', 'descartado'],
    // Descartar no es terminal: alguien puede recuperar una solicitud.
    descartado: ['recibido', 'en_revision'],
};

export const canTransitionSubmission = (from, to) =>
    Array.isArray(FLOW[from]) && FLOW[from].includes(to);

/** Los estados a los que se puede ir desde uno dado, con su etiqueta. */
export const nextStates = (from) => (FLOW[from] || []).map(id => ({ id, label: stateLabel(id) }));

/** Los que EXIGEN un motivo escrito: sin él, nadie sabe qué pedir ni por qué. */
export const REASON_REQUIRED = ['requiere_info', 'descartado'];
export const needsReason = (to) => REASON_REQUIRED.includes(to);

// ─── Los archivos ──────────────────────────────────────────────────────

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export const MAX_FILES = 10;
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;   // una foto de móvil pesa 2-8 MB
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;  // un clip de teléfono, decenas

const EXTENSIONS = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

export const kindOf = (contentType, filename = '') => {
    const t = String(contentType || '').toLowerCase();
    if (IMAGE_TYPES.includes(t)) return 'image';
    if (VIDEO_TYPES.includes(t)) return 'video';
    // El MIME llega vacío o genérico desde varios navegadores al elegir un
    // archivo, así que la extensión es el respaldo — es la misma cautela que
    // `isHeicFile` con las fotos de iPhone (v4.739).
    const ext = String(filename || '').toLowerCase().split('.').pop();
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
    return null;
};

export const extensionFor = (contentType, filename = '') => {
    const known = EXTENSIONS[String(contentType || '').toLowerCase()];
    if (known) return known;
    // ⚠️ `split('.').pop()` sobre un nombre SIN punto devuelve el nombre
    // entero, así que «mi-video» se guardaría como `.mi-video`. Se exige que
    // haya un punto de verdad antes de fiarse de lo que sigue.
    const nombre = String(filename || '').toLowerCase();
    const punto = nombre.lastIndexOf('.');
    const ext = punto > 0 ? nombre.slice(punto + 1) : '';
    return /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'bin';
};

/**
 * ¿Se puede subir este archivo? Se comprueba al prefirmar Y otra vez contra el
 * objeto REAL al enviar: lo que el navegador declara no obliga a nada.
 */
export const checkFileMeta = ({ contentType, filename, size } = {}) => {
    const errores = [];
    const kind = kindOf(contentType, filename);
    if (!kind) {
        errores.push('Sólo se pueden enviar fotografías (JPG, PNG, WEBP, HEIC) y videos (MP4, MOV, WEBM).');
        return { ok: false, errores, kind: null };
    }
    const bytes = Number(size) || 0;
    const max = kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (bytes <= 0) errores.push('El archivo llegó vacío.');
    else if (bytes > max) {
        errores.push(`${kind === 'video' ? 'El video' : 'La fotografía'} pesa ${(bytes / 1048576).toFixed(1)} MB y el máximo es ${max / 1048576} MB.`);
    }
    return { ok: errores.length === 0, errores, kind };
};

// ─── El consentimiento ─────────────────────────────────────────────────

/**
 * ⚠️ NO ES UN TEXTO LEGAL: ES UN MARCADOR DE QUE FALTA UNO.
 *
 * La plataforma no tiene hoy ninguna política de uso de imagen que reutilizar,
 * y redactar términos por nuestra cuenta sería peor que no tenerlos. Esto dice
 * lo mínimo cierto y `consentIsConfigured` lo distingue de un texto real, para
 * que el panel avise que hay que configurarlo.
 */
export const DEFAULT_CONSENT_TEXT =
    'Autorizo a Rotary y a esta campaña a conservar y utilizar el material que envío para comunicar esta iniciativa, y declaro que cuento con el permiso de las personas que aparecen en él. (Texto provisional: la organización debe configurar aquí su política definitiva.)';

export const consentIsConfigured = (text) => {
    const t = str(text, 4000);
    return Boolean(t) && t !== DEFAULT_CONSENT_TEXT;
};

export const consentTextFor = (config = {}) => str(config?.consentText, 4000) || DEFAULT_CONSENT_TEXT;

// ─── La configuración del formulario, dentro de la campaña ─────────────
//
// Vive en `content.submissions` y la normaliza `contributionSpec.normalizeContent`
// como todo lo demás — una clave que ese normalizador no enumere se pierde al
// guardar, en silencio (la lección de `normalizeNode`).
export const normalizeSubmissionsConfig = (raw = {}) => {
    const c = raw && typeof raw === 'object' ? raw : {};
    return {
        // NACE APAGADO: abrir un formulario público que recibe fotografías de
        // personas es una decisión, no un valor por omisión.
        enabled: c.enabled === true,
        headline: str(c.headline, 160),
        intro: multi(c.intro, 1200),
        consentText: multi(c.consentText, 4000),
        inviteMessage: multi(c.inviteMessage, 600),
        // A quién se le avisa cuando llega una solicitud. Vacío = a nadie, y
        // la pantalla lo dice: un formulario que recibe y no avisa se llena
        // sin que nadie lo mire.
        notifyEmails: arr(c.notifyEmails).map(e => str(e, 200).toLowerCase()).filter(Boolean).slice(0, 10),
        thanksMessage: multi(c.thanksMessage, 600),
    };
};

// ─── El mensaje de invitación ──────────────────────────────────────────

/**
 * El texto para compartir el enlace, con el nombre de la campaña puesto
 * (requisito 12). Es un DEFAULT: `content.submissions.inviteMessage` lo pisa.
 */
export const defaultInviteMessage = (campaignName, url = '') => {
    const nombre = str(campaignName, 160) || 'esta campaña';
    const base = `¿Tu club está desarrollando una iniciativa en apoyo a ${nombre}? Comparte aquí fotografías, videos y la historia de la actividad para ayudarnos a amplificar su impacto.`;
    return url ? `${base}\n\n${url}` : base;
};

export const inviteMessageFor = (campaign, config = {}, url = '') => {
    const propio = multi(config?.inviteMessage, 600);
    if (!propio) return defaultInviteMessage(campaign?.name, url);
    return url && !propio.includes(url) ? `${propio}\n\n${url}` : propio;
};

// ─── El envío ──────────────────────────────────────────────────────────

/**
 * Da forma a lo que llega del formulario público.
 *
 * ⚠️ NO ACEPTA `status`, `campaignId` NI NADA DEL CIRCUITO INTERNO. Es la
 * frontera ESTRUCTURAL del portal de Plantillas IA: lo que no se puede
 * expresar en la petición no se puede pedir. La campaña la resuelve el
 * servidor por el enlace, y el estado inicial lo fija el código.
 */
export const shapeSubmission = (raw = {}) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        senderName: str(r.senderName, 160),
        senderEmail: str(r.senderEmail, 200).toLowerCase(),
        senderPhone: str(r.senderPhone, 40),
        district: str(r.district, 80),
        club: str(r.club, 160),
        role: str(r.role, 120),
        title: str(r.title, 160),
        description: multi(r.description, 3000),
        location: str(r.location, 200),
        city: str(r.city, 120),
        activityDate: str(r.activityDate, 40),
        participatingClubs: str(r.participatingClubs, 400),
        // El campo del requisito 3: qué pasó y qué querrías que Rotary cuente.
        story: multi(r.story, 4000),
        extra: multi(r.extra, 2000),
        consent: r.consent === true,
        files: arr(r.files).slice(0, MAX_FILES).map(f => ({
            key: str(f?.key, 400),
            filename: str(f?.filename, 240),
            contentType: str(f?.contentType, 120),
        })).filter(f => f.key),
    };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Qué se exige y qué no.
 *
 * SE EXIGE POCO A PROPÓSITO (requisito 2): quién envía, cómo contestarle, el
 * consentimiento y al menos un archivo — que es el motivo del formulario. Todo
 * lo demás enriquece y se pide, pero no bloquea: un club que documenta desde el
 * teléfono en la calle no puede quedarse fuera por no saber el nombre exacto de
 * la vereda.
 *
 * Lo que falta se DEVUELVE como aviso, no se descarta en silencio: es lo que
 * después le permite al panel pedirlo con «Requiere información».
 */
export const validateSubmission = (data, { consentRequired = true } = {}) => {
    const errors = [];
    const warnings = [];

    if (!data.senderName) errors.push('Escribí tu nombre.');
    if (!data.senderEmail) errors.push('Escribí tu correo electrónico.');
    else if (!EMAIL_RE.test(data.senderEmail)) errors.push('El correo electrónico no parece válido.');
    if (consentRequired && !data.consent) errors.push('Hay que aceptar las condiciones para poder enviar el material.');
    if (!data.files.length) errors.push('Adjuntá al menos una fotografía o un video.');
    if (data.files.length > MAX_FILES) errors.push(`Se pueden enviar hasta ${MAX_FILES} archivos por envío.`);

    if (!data.story && !data.description) {
        warnings.push('No contaste qué ocurrió. Sin ese contexto, el material se puede archivar pero no se puede comunicar bien.');
    }
    if (!data.club) warnings.push('No indicaste el club o la entidad.');
    if (!data.city && !data.location) warnings.push('No indicaste dónde fue la actividad.');
    if (!data.activityDate) warnings.push('No indicaste la fecha de la actividad.');

    return { ok: errors.length === 0, errors, warnings };
};

// ─── El contexto que viaja hacia la difusión ───────────────────────────

/**
 * Lo que quien envió contó, en la forma en que lo consume el Generador de
 * Publicaciones (requisito 8).
 *
 * ⚠️ NO INTERPRETA NI COMPLETA. Enumera lo que hay y **declara lo que no se
 * sabe**, porque un hueco en silencio es una invitación a completarlo y un
 * modelo de lenguaje completa huecos por diseño — la lección de la Campaña de
 * Emergencia (v4.783) y la del tipo «Maneras de Contribuir» (v4.967).
 */
export const buildSubmissionContext = (s = {}) => {
    const L = [];
    if (s.title) L.push(`Actividad: «${s.title}».`);
    if (s.story) L.push(`Lo que contó quien la envió: «${s.story}»`);
    if (s.description && s.description !== s.story) L.push(`Descripción: «${s.description}»`);

    const donde = [s.location, s.city].filter(Boolean).join(', ');
    if (donde) L.push(`Dónde ocurrió: ${donde}. Podés nombrarlo.`);
    else L.push('NO se indicó dónde ocurrió: no nombres ninguna ciudad ni lugar.');

    if (s.activityDate) L.push(`Cuándo ocurrió: ${s.activityDate}. Podés nombrarlo.`);
    else L.push('NO se indicó la fecha de la actividad: no la menciones ni la calcules.');

    const clubes = [s.club, s.participatingClubs].filter(Boolean).join('; ');
    if (clubes) L.push(`Clubes o entidades participantes: ${clubes}. No nombres ningún otro.`);
    else L.push('NO se indicó qué club participó: no nombres ninguno.');

    if (s.extra) L.push(`Información adicional: «${s.extra}»`);
    L.push('Todo esto lo escribió quien envió el material y es información suministrada: podés usarla y nombrarla. Lo que no esté acá, no existe — no deduzcas de la fotografía cuántas personas hay, qué se entregó ni dónde fue tomada.');
    return L.join('\n');
};

/** Una línea corta para la tarjeta de la foto en el selector. */
export const submissionCaption = (s = {}) => {
    const partes = [s.title, [s.city, s.activityDate].filter(Boolean).join(' · ')].filter(Boolean);
    return str(partes.join(' — '), 200);
};

// ─── El uso: dónde terminó cada solicitud ──────────────────────────────
//
// Catálogo CERRADO. Sin esta puerta, el seguimiento aceptaría cualquier
// etiqueta y la pregunta «¿dónde se usó esto?» dejaría de tener respuesta
// comparable entre solicitudes.
export const USAGE_CHANNELS = {
    instagram: { id: 'instagram', label: 'Instagram', auto: true },
    facebook: { id: 'facebook', label: 'Facebook', auto: true },
    x: { id: 'x', label: 'X', auto: true },
    linkedin: { id: 'linkedin', label: 'LinkedIn', auto: true },
    email: { id: 'email', label: 'Correo', auto: false },
    whatsapp: { id: 'whatsapp', label: 'WhatsApp', auto: false },
    web: { id: 'web', label: 'Sitio web', auto: false },
};
export const USAGE_CHANNEL_IDS = Object.keys(USAGE_CHANNELS);
export const isUsageChannel = (id) => USAGE_CHANNEL_IDS.includes(id);

/**
 * `auto` distingue lo MEDIDO de lo DECLARADO, y la pantalla lo dice.
 *
 * Las cuatro redes se derivan de las publicaciones que de verdad usaron ese
 * archivo (`SocialPublicationOrigin`, v4.967); correo y WhatsApp los marca una
 * persona, porque esos módulos no registran hoy qué archivo usaron. Presentar
 * las dos cosas igual haría creer que se midió algo que se declaró.
 */
export const usageIsMeasured = (channel) => USAGE_CHANNELS[channel]?.auto === true;

export default {
    SUBMISSION_STATES, SUBMISSION_STATE_IDS, INITIAL_STATE, stateLabel,
    canTransitionSubmission, nextStates, needsReason, REASON_REQUIRED,
    IMAGE_TYPES, VIDEO_TYPES, MAX_FILES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES,
    kindOf, extensionFor, checkFileMeta,
    DEFAULT_CONSENT_TEXT, consentIsConfigured, consentTextFor,
    normalizeSubmissionsConfig, defaultInviteMessage, inviteMessageFor,
    shapeSubmission, validateSubmission, buildSubmissionContext, submissionCaption,
    USAGE_CHANNELS, USAGE_CHANNEL_IDS, isUsageChannel, usageIsMeasured,
};
