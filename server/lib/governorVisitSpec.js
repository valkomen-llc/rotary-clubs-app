// ════════════════════════════════════════════════════════════════════
// Visitas del Gobernador — el criterio — v4.1260.0
//
// Puro: sin base, sin S3, sin red. Lo usan el controlador, las pruebas y
// (por espejo) `src/lib/governorVisitSpec.ts`. Al tocar uno, tocar el otro:
// lo fija `scripts/test-governor-visits.mjs`.
//
// UNA VISITA NO ES UNA SOLICITUD DE CONTENIDO. Es un registro institucional
// —quién visitó qué club, cuándo y con qué resultado— que existe aunque nunca
// se publique, y del que el Gobernador saca su informe de gestión. Por eso
// tiene su propia fila (`GovernorVisit`) y su propio flujo. Lo que SÍ se
// reutiliza es lo de publicar: al aprobarla y publicarla se crea UNA solicitud
// de Rotary en Acción que apunta a los MISMOS objetos de S3 (nada se copia ni
// se re-sube) y desde ahí corre el flujo editorial de siempre (Biblioteca,
// artículo, difusión). Ver `docs/claude/visitas-del-gobernador.md`.
// ════════════════════════════════════════════════════════════════════
import { kindOf, checkFileMeta } from './contentSubmissionSpec.js';

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const multi = (v, max) => String(v ?? '').trim().replace(/\r\n/g, '\n').slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);

export const GOVERNOR_VISIT_DISTRICT = 4281;

// ─── Los estados ───────────────────────────────────────────────────────
//
// «Publicada» NO se alcanza con una transición: sólo la acción de publicar,
// que crea el contenido en Rotary en Acción, deja la visita en ese estado.
// Así no existe una visita «publicada» sin publicación detrás.
export const VISIT_STATES = {
    recibida: { id: 'recibida', label: 'Recibida', tone: 'sky' },
    en_revision: { id: 'en_revision', label: 'En revisión', tone: 'amber' },
    correcciones: { id: 'correcciones', label: 'Correcciones solicitadas', tone: 'orange' },
    aprobada: { id: 'aprobada', label: 'Aprobada', tone: 'emerald' },
    rechazada: { id: 'rechazada', label: 'Rechazada', tone: 'rose' },
    publicada: { id: 'publicada', label: 'Publicada', tone: 'blue' },
};
export const VISIT_STATE_IDS = Object.keys(VISIT_STATES);
export const VISIT_INITIAL_STATE = 'recibida';
export const VISIT_PENDING_STATES = ['recibida', 'en_revision', 'correcciones'];

const FLOW = {
    recibida: ['en_revision', 'aprobada', 'correcciones', 'rechazada'],
    en_revision: ['aprobada', 'correcciones', 'rechazada', 'recibida'],
    correcciones: ['en_revision', 'aprobada', 'rechazada'],
    aprobada: ['en_revision', 'correcciones', 'rechazada'],
    // Rechazar no es irreversible: se puede volver a revisar.
    rechazada: ['en_revision'],
    // Publicada es el final del registro: la vida del contenido sigue en
    // Rotary en Acción, con su propio flujo.
    publicada: [],
};

export const visitStateLabel = (id) => VISIT_STATES[id]?.label || id;
export const canTransitionVisit = (from, to) => Array.isArray(FLOW[from]) && FLOW[from].includes(to);
export const nextVisitStates = (from) => (FLOW[from] || []).map(id => ({ id, label: visitStateLabel(id) }));
export const VISIT_REASON_REQUIRED = ['correcciones', 'rechazada'];
export const visitNeedsReason = (to) => VISIT_REASON_REQUIRED.includes(to);
export const canPublishVisit = (status) => status === 'aprobada';

// ─── La galería ────────────────────────────────────────────────────────
//
// Los topes de peso por archivo son los de Rotary en Acción (50 MB la foto,
// 2 GB el video): los archivos van del navegador a S3 con URL prefirmada, por
// el mismo `presignSubmissionUpload`, y se comprueban otra vez contra el
// objeto REAL al enviar.
export const VISIT_MAX_PHOTOS = 20;
export const VISIT_MAX_VIDEOS = 3;
export const VISIT_MAX_LINKS = 10;
export const VISIT_CAPTION_MAX = 300;

/** Un enlace audiovisual: http(s), con host, sin credenciales. */
export const normalizeVisitLink = (raw) => {
    const value = str(raw, 600);
    if (!value) return null;
    let url;
    try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || !url.hostname.includes('.')) return null;
    if (url.username || url.password) return null;
    return { url: url.toString(), host: url.hostname.replace(/^www\./, '') };
};

// ─── Dar forma a lo que llega ──────────────────────────────────────────

const isoDate = (v) => {
    const s = str(v, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? '' : s;
};

/** Lo que el formulario manda, recortado y con tipos ciertos. No decide nada. */
export const shapeVisit = (raw = {}) => {
    const media = arr(raw.media).slice(0, VISIT_MAX_PHOTOS + VISIT_MAX_VIDEOS + 5).map((m) => ({
        key: str(m?.key, 300),
        filename: str(m?.filename, 240),
        contentType: str(m?.contentType, 120),
        caption: str(m?.caption, VISIT_CAPTION_MAX),
    })).filter((m) => m.key);
    const links = arr(raw.links).slice(0, VISIT_MAX_LINKS + 5).map((l) => {
        const n = normalizeVisitLink(typeof l === 'string' ? l : l?.url);
        return n ? { ...n, caption: str(l?.caption, VISIT_CAPTION_MAX) } : null;
    }).filter(Boolean);
    return {
        clubProfileId: str(raw.clubProfileId, 80),
        visitDate: isoDate(raw.visitDate),
        governorName: str(raw.governorName, 160),
        venue: str(raw.venue, 240),
        title: str(raw.title, 160),
        reason: multi(raw.reason, 1500),
        description: multi(raw.description, 6000),
        activities: multi(raw.activities, 3000),
        topics: multi(raw.topics, 3000),
        recognitions: multi(raw.recognitions, 3000),
        agreements: multi(raw.agreements, 3000),
        commitments: multi(raw.commitments, 3000),
        highlights: multi(raw.highlights, 3000),
        media,
        links,
        responsibleName: str(raw.responsibleName, 160),
        responsibleRole: str(raw.responsibleRole, 120),
        responsibleEmail: str(raw.responsibleEmail, 200).toLowerCase(),
        responsiblePhone: str(raw.responsiblePhone, 30).replace(/[^\d+]/g, ''),
        truthConfirmed: raw.truthConfirmed === true,
        publicationConsent: raw.publicationConsent === true,
    };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * ¿Se puede guardar? Devuelve los errores por PASO para que el formulario
 * lleve a quien envía al paso exacto. Tres pasos desde v4.1262: 1 club y
 * visita, 2 memoria y galería, 3 responsable y envío. `today` se inyecta para poder probarlo.
 *
 * `admin: true` es la edición desde el panel: no vuelve a exigir el
 * consentimiento ni la confirmación (ya los dio quien envió) y no toca la
 * galería (la edición de texto no re-sube nada).
 */
export const validateVisit = (v, { today = new Date().toISOString().slice(0, 10), admin = false } = {}) => {
    const errors = [];
    const push = (step, field, message) => errors.push({ step, field, message });

    if (!v.clubProfileId) push(1, 'clubProfileId', 'Selecciona el club visitado del catálogo oficial del Distrito 4281.');

    if (!v.visitDate) push(1, 'visitDate', 'Indica la fecha real de la visita.');
    else if (v.visitDate > today) push(1, 'visitDate', 'La fecha de la visita no puede ser posterior a hoy: se reporta una visita ya realizada.');
    else if (v.visitDate < '2000-01-01') push(1, 'visitDate', 'Revisa la fecha de la visita.');
    if (v.governorName.length < 3) push(1, 'governorName', 'Escribe el nombre del Gobernador visitante.');
    if (v.venue.length < 3) push(1, 'venue', 'Indica el lugar de la visita.');
    if (v.title.length < 5) push(1, 'title', 'Escribe un título para la visita (mínimo 5 caracteres).');
    if (v.reason.length < 10) push(1, 'reason', 'Describe brevemente el motivo del encuentro.');

    if (v.description.length < 80) push(2, 'description', 'La descripción de la visita debe tener al menos 80 caracteres: es la memoria institucional.');

    if (!admin) {
        const photos = v.media.filter((m) => kindOf(m.contentType, m.filename) === 'image').length;
        const videos = v.media.filter((m) => kindOf(m.contentType, m.filename) === 'video').length;
        const unknown = v.media.filter((m) => !kindOf(m.contentType, m.filename)).length;
        if (unknown) push(2, 'media', 'Sólo se admiten fotografías (JPG, PNG, WEBP, HEIC) y videos (MP4, MOV, WEBM).');
        if (photos > VISIT_MAX_PHOTOS) push(2, 'media', `Máximo ${VISIT_MAX_PHOTOS} fotografías por visita.`);
        if (videos > VISIT_MAX_VIDEOS) push(2, 'media', `Máximo ${VISIT_MAX_VIDEOS} videos por visita.`);
        if (v.links.length > VISIT_MAX_LINKS) push(2, 'links', `Máximo ${VISIT_MAX_LINKS} enlaces audiovisuales.`);
        if (photos + videos + v.links.length === 0) push(2, 'media', 'Agrega al menos una fotografía, un video o un enlace audiovisual de la visita.');
        const keys = v.media.map((m) => m.key);
        if (new Set(keys).size !== keys.length) push(2, 'media', 'Hay un archivo repetido en la galería.');
    }

    if (v.responsibleName.length < 3) push(3, 'responsibleName', 'Escribe el nombre de quien reporta la visita.');
    if (v.responsibleRole.length < 3) push(3, 'responsibleRole', 'Indica el cargo de quien reporta (por ejemplo, Secretario/a del club).');
    if (!EMAIL_RE.test(v.responsibleEmail)) push(3, 'responsibleEmail', 'Escribe un correo electrónico válido.');
    const digits = v.responsiblePhone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) push(3, 'responsiblePhone', 'Escribe un número de WhatsApp válido, con indicativo de país.');
    if (!admin) {
        if (!v.truthConfirmed) push(3, 'truthConfirmed', 'Confirma que la información reportada es veraz.');
        if (!v.publicationConsent) push(3, 'publicationConsent', 'Autoriza el uso y la publicación del material para poder enviarlo.');
    }

    return { ok: errors.length === 0, errors };
};

/** Comprobación previa de un archivo, antes de prefirmar. Mismos topes. */
export const checkVisitFile = (meta) => checkFileMeta(meta);

// ─── Identificador público ─────────────────────────────────────────────

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I: se dicta por teléfono
/** «VG-2026-7KQ4MZ». `rand` se inyecta para probarlo. */
export const makeVisitRef = (date = new Date(), rand = Math.random) => {
    let code = '';
    for (let i = 0; i < 6; i++) code += ALFABETO[Math.floor(rand() * ALFABETO.length)];
    return `VG-${date.getUTCFullYear()}-${code}`;
};

// ─── Hacia Rotary en Acción ────────────────────────────────────────────

/**
 * «2026-10-29». ⚠️ `pg` devuelve una columna DATE como `Date`, y
 * `String(fecha).slice(0, 10)` da «Thu Oct 29»: se formatea explícito.
 */
export const visitDateIso = (value) => {
    if (!value) return '';
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '';
        const p = (n) => String(n).padStart(2, '0');
        return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
    }
    return isoDate(value);
};

const SECCIONES = [
    ['description', 'Descripción de la visita'],
    ['activities', 'Actividades desarrolladas'],
    ['topics', 'Temas abordados'],
    ['recognitions', 'Reconocimientos'],
    ['agreements', 'Acuerdos'],
    ['commitments', 'Compromisos'],
    ['highlights', 'Resultados destacados'],
];

/** La memoria completa en texto, por secciones, sin las vacías. */
export const visitMemoryText = (visit = {}) => SECCIONES
    .filter(([k]) => String(visit[k] || '').trim())
    .map(([k, titulo]) => `${titulo}:\n${String(visit[k]).trim()}`)
    .join('\n\n');

/**
 * Los datos de la solicitud de Rotary en Acción que nace de una visita
 * aprobada. Mismo formato que `shapeSubmission`, para que `createSubmission`
 * la guarde como cualquier otra. El texto se REUTILIZA tal cual; los archivos
 * son los mismos objetos de S3.
 */
export const visitToSubmissionData = (visit = {}) => ({
    senderName: visit.responsibleName,
    senderEmail: visit.responsibleEmail,
    senderPhone: visit.responsiblePhone || null,
    senderPhoneE164: visit.responsiblePhone && visit.responsiblePhone.startsWith('+') ? visit.responsiblePhone : null,
    district: String(visit.districtNumber || GOVERNOR_VISIT_DISTRICT),
    club: visit.clubName,
    mainClub: visit.clubName,
    role: visit.responsibleRole,
    title: String(visit.title || '').slice(0, 160),
    description: [visit.reason, visit.venue ? `Lugar: ${visit.venue}` : ''].filter(Boolean).join('\n').slice(0, 3000),
    location: visit.venue || null,
    city: visit.clubCity || null,
    activityDate: visitDateIso(visit.visitDate) || null,
    story: visitMemoryText(visit).slice(0, 4000),
    extra: `Visita oficial del Gobernador ${visit.governorName || ''} · Ref. ${visit.publicRef || ''}`.slice(0, 2000),
    // Una visita es un encuentro institucional: se clasifica como «Evento»
    // (taxonomía existente) y se distingue por su tipo de solicitud y su
    // etiqueta, sin abrir un tipo nuevo en el formulario general.
    contentType: 'evento',
    submissionType: 'governor_visit',
    tags: ['visita-del-gobernador'],
    clubs: [],
    posts: [],
    hasPosts: false,
    notifyUpdates: false,
});

/** Los archivos de la visita en el formato de `createSubmission`. */
export const visitFilesForSubmission = (visit = {}) => arr(visit.media)
    .filter((m) => m?.key && (m.kind === 'image' || m.kind === 'video'))
    .map((m) => ({ key: m.key, kind: m.kind, filename: m.filename, contentType: m.contentType, bytes: Number(m.bytes) || 0 }));

export const GOVERNOR_VISIT_CONSENT_TEXT = 'Confirmo que la información reportada sobre la visita del Gobernador es veraz y autorizo al Distrito 4281 de Rotary International a usar y publicar el texto, las fotografías, los videos y los enlaces enviados en sus canales institucionales (incluido Rotary en Acción), de acuerdo con los Términos de Servicio (https://my.rotary.org/terms-of-use) y la Política de Privacidad (https://my.rotary.org/privacy-policy). Los datos de contacto del responsable sólo se usan para gestionar este reporte y no se publican.';
