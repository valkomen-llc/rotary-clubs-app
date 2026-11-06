// ════════════════════════════════════════════════════════════════════
// Programas — el criterio — v4.1280.0
//
// Puro: sin base, sin S3, sin red. Lo usan el controlador, las pruebas y
// (por espejo) `src/lib/programSpec.ts`. Al tocar uno, tocar el otro: lo
// fija `scripts/test-programas.mjs`.
//
// UN PROGRAMA ES UNA IDENTIDAD INSTITUCIONAL ÚNICA (`Program`), que se
// VINCULA a uno o varios distritos (`ProgramDistrictLink`) y que los clubes
// de esos distritos ACTIVAN en su sitio (`ProgramClubActivation`). El
// contenido central tiene UNA fila por registro (`ProgramContent` con
// `scopeType = 'central'`); un club sólo agrega extensiones locales
// (`scopeType = 'club'`) y nunca copia ni modifica lo central.
//
// Todo cambio de contenido —también el de un coordinador— entra como una
// SOLICITUD DE CAMBIO (`ProgramChangeRequest`) con flujo editorial; lo
// publicado sigue publicado hasta que se aprueba y publica su reemplazo.
// Ver `docs/claude/programas.md`.
// ════════════════════════════════════════════════════════════════════

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const multi = (v, max) => String(v ?? '').trim().replace(/\r\n/g, '\n').slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);
const bool = (v) => v === true;
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─── Catálogos cerrados ───────────────────────────────────────────────

export const PROGRAM_STATES = {
    borrador: { id: 'borrador', label: 'Borrador', tone: 'amber' },
    activo: { id: 'activo', label: 'Activo', tone: 'emerald' },
    archivado: { id: 'archivado', label: 'Archivado', tone: 'gray' },
};
export const PROGRAM_STATE_IDS = Object.keys(PROGRAM_STATES);

export const PROGRAM_CATEGORIES = [
    { id: 'salud', label: 'Salud' },
    { id: 'educacion', label: 'Educación' },
    { id: 'agua_saneamiento', label: 'Agua y saneamiento' },
    { id: 'paz', label: 'Paz y resolución de conflictos' },
    { id: 'desarrollo_economico', label: 'Desarrollo económico' },
    { id: 'medio_ambiente', label: 'Medio ambiente' },
    { id: 'comunidad', label: 'Comunidad' },
    { id: 'otro', label: 'Otro' },
];
export const PROGRAM_CATEGORY_IDS = PROGRAM_CATEGORIES.map(c => c.id);

/** Tipo de relación entre un distrito y un programa. NINGUNO implica que el
 *  distrito opere el servicio ni reciba donaciones: eso lo dice el texto. */
export const RELATION_TYPES = [
    { id: 'respaldo_institucional', label: 'Respaldo institucional' },
    { id: 'difusion', label: 'Difusión' },
    { id: 'apoyo_financiero', label: 'Apoyo financiero' },
    { id: 'otra', label: 'Otra relación (descrita)' },
];
export const RELATION_TYPE_IDS = RELATION_TYPES.map(r => r.id);

export const LINK_STATES = {
    activa: { id: 'activa', label: 'Activa', tone: 'emerald' },
    pausada: { id: 'pausada', label: 'Pausada', tone: 'amber' },
    finalizada: { id: 'finalizada', label: 'Finalizada', tone: 'gray' },
};
export const LINK_STATE_IDS = Object.keys(LINK_STATES);

export const ACTIVATION_STATES = {
    activa: { id: 'activa', label: 'Activa', tone: 'emerald' },
    inactiva: { id: 'inactiva', label: 'Inactiva', tone: 'gray' },
};

/** Perfiles funcionales POR PROGRAMA. Una persona puede tener varios. */
export const PROGRAM_ROLES = [
    { id: 'coordinador', label: 'Coordinador del programa', help: 'Edita la información, aprueba y publica contenidos, gestiona responsables y clubes.' },
    { id: 'comunicaciones', label: 'Comunicaciones', help: 'Propone y publica historias, noticias, recursos y eventos. No aprueba contenido clínico.' },
    { id: 'revisor_medico', label: 'Revisor médico', help: 'Aprueba el contenido clasificado como información clínica o educativa que lo requiera.' },
    { id: 'gestor_solicitudes', label: 'Gestor de solicitudes', help: 'Atiende las solicitudes públicas (orientación, apoyo, clubes).' },
    { id: 'colaborador', label: 'Colaborador', help: 'Propone contenidos mediante el formato de gestión; no aprueba ni publica.' },
];
export const PROGRAM_ROLE_IDS = PROGRAM_ROLES.map(r => r.id);

/** Secciones de la página pública, en el orden por omisión. `feeds` es el
 *  tipo de contenido que la llena (una sección sin contenido NO se pinta). */
export const SECTIONS = [
    { key: 'inicio', label: 'Inicio', defaultEnabled: true, feeds: null },
    { key: 'programa', label: 'El programa', defaultEnabled: true, feeds: null },
    { key: 'clinicas', label: 'Encuentra una clínica o centro', defaultEnabled: true, feeds: 'clinic' },
    { key: 'familias', label: 'Información para familias', defaultEnabled: true, feeds: 'resource' },
    { key: 'historias', label: 'Historias que inspiran', defaultEnabled: true, feeds: 'story' },
    { key: 'equipo', label: 'Nuestro equipo', defaultEnabled: true, feeds: 'team' },
    { key: 'impacto', label: 'Impacto', defaultEnabled: true, feeds: 'indicator' },
    { key: 'ayudar', label: 'Cómo ayudar', defaultEnabled: true, feeds: 'donation' },
    { key: 'noticias', label: 'Noticias y eventos', defaultEnabled: true, feeds: 'news' },
    { key: 'aliados', label: 'Aliados', defaultEnabled: true, feeds: null },
    { key: 'contacto', label: 'Contacto y formularios', defaultEnabled: true, feeds: null },
];
export const SECTION_KEYS = SECTIONS.map(s => s.key);

/** Los tipos de registro de contenido. `section` es a dónde van. */
export const CONTENT_KINDS = {
    clinic: { id: 'clinic', label: 'Clínica o centro', plural: 'Clínicas y centros', section: 'clinicas', localAllowed: false },
    team: { id: 'team', label: 'Integrante del equipo', plural: 'Equipo y protagonistas', section: 'equipo', localAllowed: true },
    story: { id: 'story', label: 'Historia o testimonio', plural: 'Historias y testimonios', section: 'historias', localAllowed: true },
    resource: { id: 'resource', label: 'Recurso educativo', plural: 'Recursos educativos', section: 'familias', localAllowed: false },
    news: { id: 'news', label: 'Noticia o evento', plural: 'Noticias y eventos', section: 'noticias', localAllowed: true },
    indicator: { id: 'indicator', label: 'Indicador de impacto', plural: 'Indicadores de impacto', section: 'impacto', localAllowed: false },
    donation: { id: 'donation', label: 'Enlace de donación', plural: 'Enlaces y canales de donación', section: 'ayudar', localAllowed: false },
};
export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS);

/** Lo que el formato «Gestión de contenidos» deja elegir en el primer paso. */
export const CHANGE_KINDS = [
    { id: 'info', label: 'Información institucional', help: 'Identidad, atención, participación o presentación del programa.' },
    ...CONTENT_KIND_IDS.map(k => ({ id: k, label: CONTENT_KINDS[k].label, help: '' })),
    { id: 'correction', label: 'Corrección de información', help: 'Un error puntual en algo ya publicado.' },
];
export const CHANGE_KIND_IDS = CHANGE_KINDS.map(k => k.id);

export const OPERATIONS = [
    { id: 'crear', label: 'Crear' },
    { id: 'actualizar', label: 'Actualizar' },
    { id: 'retirar', label: 'Solicitar retiro' },
];
export const OPERATION_IDS = OPERATIONS.map(o => o.id);

export const SCOPE_TYPES = [
    { id: 'central', label: 'Contenido central' },
    { id: 'district', label: 'Contenido de una vinculación distrital' },
    { id: 'club', label: 'Contenido local de un club' },
];
export const SCOPE_TYPE_IDS = SCOPE_TYPES.map(s => s.id);

// ─── Flujo editorial ──────────────────────────────────────────────────

export const EDITORIAL_STATES = {
    borrador: { id: 'borrador', label: 'Borrador', tone: 'gray' },
    enviado: { id: 'enviado', label: 'Enviado', tone: 'sky' },
    en_revision: { id: 'en_revision', label: 'En revisión', tone: 'amber' },
    ajustes: { id: 'ajustes', label: 'Ajustes solicitados', tone: 'orange' },
    aprobado: { id: 'aprobado', label: 'Aprobado', tone: 'emerald' },
    publicado: { id: 'publicado', label: 'Publicado', tone: 'blue' },
    archivado: { id: 'archivado', label: 'Archivado', tone: 'gray' },
};
export const EDITORIAL_STATE_IDS = Object.keys(EDITORIAL_STATES);
export const EDITORIAL_PENDING = ['enviado', 'en_revision', 'ajustes'];

// «Publicado» NO se alcanza por transición: sólo la acción de publicar, que
// aplica el cambio al contenido vivo, deja la solicitud en ese estado.
const EDITORIAL_FLOW = {
    borrador: ['enviado', 'archivado'],
    enviado: ['en_revision', 'ajustes', 'aprobado', 'archivado'],
    en_revision: ['ajustes', 'aprobado', 'archivado', 'enviado'],
    ajustes: ['enviado', 'archivado'],
    aprobado: ['en_revision', 'archivado'],
    publicado: [],
    archivado: ['borrador'],
};
export const canTransitionRequest = (from, to) => Array.isArray(EDITORIAL_FLOW[from]) && EDITORIAL_FLOW[from].includes(to);
export const nextRequestStates = (from) => (EDITORIAL_FLOW[from] || []).map(id => ({ id, label: editorialLabel(id) }));
export const editorialLabel = (id) => EDITORIAL_STATES[id]?.label || id;
export const REQUEST_REASON_REQUIRED = ['ajustes', 'archivado'];
export const requestNeedsReason = (to) => REQUEST_REASON_REQUIRED.includes(to);
export const canPublishRequest = (status) => status === 'aprobado';
/** Quién puede mover a cada estado (acciones del criterio de acceso). */
export const TRANSITION_ABILITY = {
    enviado: 'submit', en_revision: 'review', ajustes: 'review', aprobado: 'approve', archivado: 'review', borrador: 'submit',
};

/**
 * Los requisitos editoriales POR TIPO. La revisión médica sólo es obligatoria
 * para lo clasificado como información clínica o educativa que la requiera:
 * una corrección administrativa no la recorre.
 */
export const EDITORIAL_REQUIREMENTS = {
    info: { medical: 'si_clinico', help: 'Médica sólo si cambia la ruta de orientación, las condiciones de acceso o el texto de costos.' },
    clinic: { medical: 'si_clinico', help: 'Médica sólo si trae o cambia las condiciones de atención.' },
    team: { medical: 'nunca' },
    story: { medical: 'si_clinico', help: 'Médica sólo si trae la descripción del proceso asistencial (v4.1286).' },
    resource: { medical: 'si_clinico', help: 'Médica cuando el recurso se clasifica como información clínica.' },
    news: { medical: 'nunca' },
    indicator: { medical: 'nunca' },
    donation: { medical: 'nunca' },
    correction: { medical: 'si_clinico', help: 'Médica sólo si la corrección toca texto clínico.' },
};

const CLINICAL_INFO_FIELDS = ['guidancePath', 'accessConditions', 'costsText'];

/** ¿Esta solicitud exige aprobación del revisor médico? Decidido por el
 *  servidor al enviar, nunca por quien envía. */
export const requestNeedsMedicalReview = (request = {}) => {
    const kind = request.kind;
    const rule = EDITORIAL_REQUIREMENTS[kind]?.medical || 'nunca';
    if (rule === 'nunca') return false;
    if (rule === 'siempre') return true;
    const payload = obj(request.payload);
    if (payload.clinical === true) return true;
    if (kind === 'info') {
        const care = obj(payload.care);
        if (arr(care.faqsUpsert).some(f => obj(f).clinical === true)) return true;
        return CLINICAL_INFO_FIELDS.some(f => String(care[f] || '').trim());
    }
    if (kind === 'story') return Boolean(String(payload.careProcess || '').trim());
    if (kind === 'clinic') return Boolean(String(payload.careConditions || '').trim());
    if (kind === 'resource') return payload.clinical === true;
    return false;
};

// ─── Solicitudes públicas ─────────────────────────────────────────────

export const PUBLIC_REQUEST_TYPES = {
    orientacion: { id: 'orientacion', label: 'Necesito orientación', subscribes: false },
    apoyo: { id: 'apoyo', label: 'Quiero apoyar', subscribes: false },
    club: { id: 'club', label: 'Mi club quiere participar', subscribes: false },
};
export const PUBLIC_REQUEST_TYPE_IDS = Object.keys(PUBLIC_REQUEST_TYPES);

export const REQUEST_STATES = {
    nueva: { id: 'nueva', label: 'Nueva', tone: 'sky' },
    asignada: { id: 'asignada', label: 'Asignada', tone: 'amber' },
    en_contacto: { id: 'en_contacto', label: 'En contacto', tone: 'blue' },
    derivada: { id: 'derivada', label: 'Derivada', tone: 'violet' },
    cerrada: { id: 'cerrada', label: 'Cerrada', tone: 'gray' },
};
export const REQUEST_STATE_IDS = Object.keys(REQUEST_STATES);
const REQUEST_FLOW = {
    nueva: ['asignada', 'en_contacto', 'derivada', 'cerrada'],
    asignada: ['en_contacto', 'derivada', 'cerrada', 'nueva'],
    en_contacto: ['derivada', 'cerrada', 'asignada'],
    derivada: ['cerrada', 'en_contacto'],
    cerrada: ['nueva'],
};
export const canTransitionPublicRequest = (from, to) => Array.isArray(REQUEST_FLOW[from]) && REQUEST_FLOW[from].includes(to);
export const nextPublicRequestStates = (from) => (REQUEST_FLOW[from] || []).map(id => ({ id, label: REQUEST_STATES[id]?.label || id }));
/** El primer contacto se marca al pasar a «En contacto» por primera vez. */
export const marksFirstContact = (to) => to === 'en_contacto';

export const SUPPORT_TYPES = [
    { id: 'donacion', label: 'Aporte económico' },
    { id: 'especie', label: 'Aporte en especie' },
    { id: 'voluntariado', label: 'Voluntariado' },
    { id: 'empresa', label: 'Alianza empresarial' },
    { id: 'difusion', label: 'Difusión' },
    { id: 'otro', label: 'Otro' },
];
export const CLUB_PARTICIPATION_TYPES = [
    { id: 'activar', label: 'Activar el programa en nuestro sitio' },
    { id: 'jornada', label: 'Organizar una jornada o actividad' },
    { id: 'recursos', label: 'Aportar recursos' },
    { id: 'difusion', label: 'Difundir en nuestra comunidad' },
    { id: 'otro', label: 'Otro' },
];
export const CONTACT_MEANS = [
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'telefono', label: 'Llamada telefónica' },
    { id: 'correo', label: 'Correo electrónico' },
];

export const RESOURCE_TYPES = [
    { id: 'documento', label: 'Documento' },
    { id: 'video', label: 'Video' },
    { id: 'audio', label: 'Audio' },
    { id: 'podcast', label: 'Podcast' },
    { id: 'enlace', label: 'Enlace' },
];
export const RESOURCE_TYPE_IDS = RESOURCE_TYPES.map(r => r.id);

export const INDICATOR_MODES = [
    { id: 'acumulado', label: 'Acumulado (desde el inicio)' },
    { id: 'periodo', label: 'Por período' },
];

/** Alcance del permiso de uso de una pieza multimedia. */
export const PERMISSION_SCOPES = [
    { id: 'programa', label: 'Sólo el programa' },
    { id: 'distrito', label: 'Programa y distrito' },
    { id: 'clubes', label: 'Programa, distrito y clubes participantes' },
];

/** Comprobantes de autorización: PRIVADOS, nunca con URL pública. */
export const PRIVATE_FILE_KINDS = ['autorizacion', 'documento_respaldo', 'recurso'];
export const PRIVATE_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const PRIVATE_FILE_FORMATS = {
    pdf: { mime: 'application/pdf', short: 'PDF', magic: [[0x25, 0x50, 0x44, 0x46]] },
    jpg: { mime: 'image/jpeg', short: 'JPG', magic: [[0xff, 0xd8, 0xff]] },
    jpeg: { mime: 'image/jpeg', short: 'JPG', magic: [[0xff, 0xd8, 0xff]] },
    png: { mime: 'image/png', short: 'PNG', magic: [[0x89, 0x50, 0x4e, 0x47]] },
    docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', short: 'DOCX', magic: [[0x50, 0x4b, 0x03, 0x04]] },
};
export const privateFileExtension = (filename) => {
    const m = /\.([a-z0-9]+)$/i.exec(String(filename || ''));
    return m ? m[1].toLowerCase() : '';
};
export const checkPrivateFileMeta = ({ filename, size, kind }) => {
    const errores = [];
    const ext = privateFileExtension(filename);
    if (!PRIVATE_FILE_KINDS.includes(kind)) errores.push('Indica qué es el archivo (autorización, documento de respaldo o recurso).');
    if (!ext || !PRIVATE_FILE_FORMATS[ext]) errores.push('Formato no admitido. Se acepta PDF, JPG, PNG o DOCX.');
    const bytes = Number(size) || 0;
    if (bytes <= 0) errores.push('El archivo llegó vacío.');
    if (bytes > PRIVATE_FILE_MAX_BYTES) errores.push('El archivo supera los 25 MB.');
    return { ok: errores.length === 0, errores, ext: PRIVATE_FILE_FORMATS[ext] ? ext : null };
};
/** El tipo REAL por los primeros bytes; `null` si no coincide con lo declarado. */
export const sniffPrivateFile = (head, ext) => {
    const fmt = PRIVATE_FILE_FORMATS[ext];
    if (!fmt || !head || !head.length) return null;
    return fmt.magic.some(sig => sig.every((b, i) => head[i] === b)) ? ext : null;
};

// ─── Enlaces y embebidos seguros ──────────────────────────────────────

/** Un enlace externo: http(s), con host, sin credenciales. */
export const normalizeLink = (raw) => {
    const value = str(raw, 800);
    if (!value) return null;
    let url;
    try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || !url.hostname.includes('.')) return null;
    if (url.username || url.password) return null;
    return url.toString();
};

/**
 * YouTube y Spotify (y Vimeo) a un `src` de embebido de LISTA CERRADA. Nada
 * de HTML pegado: sólo la URL, y sólo si se reconoce. `null` = no se embebe.
 */
export const resolveEmbed = (raw) => {
    const link = normalizeLink(raw);
    if (!link) return null;
    let u;
    try { u = new URL(link); } catch { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
    const id = (s) => (/^[A-Za-z0-9_-]{6,64}$/.test(s || '') ? s : '');
    if (host === 'youtu.be') {
        const v = id(u.pathname.slice(1).split('/')[0]);
        return v ? { provider: 'youtube', id: v, src: `https://www.youtube-nocookie.com/embed/${v}?rel=0&modestbranding=1&playsinline=1`, aspect: '16/9' } : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        let v = id(u.searchParams.get('v') || '');
        if (!v) {
            const m = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,64})/.exec(u.pathname);
            v = m ? m[1] : '';
        }
        return v ? { provider: 'youtube', id: v, src: `https://www.youtube-nocookie.com/embed/${v}?rel=0&modestbranding=1&playsinline=1`, aspect: '16/9' } : null;
    }
    if (host === 'open.spotify.com') {
        const m = /^\/(?:embed\/)?(?:intl-[a-z]{2}\/)?(episode|show|track|playlist|album)\/([A-Za-z0-9]{22})/.exec(u.pathname);
        return m ? { provider: 'spotify', id: m[2], type: m[1], src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, aspect: m[1] === 'track' ? 'compact' : 'podcast' } : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const m = /(\d{6,12})/.exec(u.pathname);
        return m ? { provider: 'vimeo', id: m[1], src: `https://player.vimeo.com/video/${m[1]}?dnt=1`, aspect: '16/9' } : null;
    }
    return null;
};

// ─── Identificadores ──────────────────────────────────────────────────

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
export const makeRef = (prefix, date = new Date(), rand = Math.random) => {
    let code = '';
    for (let i = 0; i < 6; i++) code += ALFABETO[Math.floor(rand() * ALFABETO.length)];
    return `${prefix}-${date.getUTCFullYear()}-${code}`;
};

export const slugify = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
export const isValidSlug = (s) => /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/.test(String(s || ''));
/** Slugs que el enrutado reserva (el catálogo y sus accesos). */
export const RESERVED_SLUGS = ['nuevo', 'admin', 'api', 'catalogo', 'activar', 'solicitudes'];

const isoDate = (v) => {
    const s = str(v, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? '' : s;
};
export const dateIso = (value) => {
    if (!value) return '';
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '';
        const p = (n) => String(n).padStart(2, '0');
        return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
    }
    return isoDate(value);
};

// ─── El programa ──────────────────────────────────────────────────────

const shapePerson = (raw) => {
    const p = obj(raw);
    return {
        name: str(p.name, 160), role: str(p.role, 120), email: str(p.email, 200).toLowerCase(),
        phone: str(p.phone, 40).replace(/[^\d+\s()-]/g, ''), userId: str(p.userId, 80) || null,
        public: bool(p.public), institution: str(p.institution, 200),
    };
};
export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'youtube', 'spotify', 'x', 'linkedin', 'tiktok', 'whatsapp'];
const shapeSocial = (raw) => {
    const s = obj(raw);
    const out = {};
    for (const k of SOCIAL_NETWORKS) {
        const v = normalizeLink(s[k]);
        if (v) out[k] = v;
    }
    return out;
};
/** v4.1286 — Qué hace cada entidad. Ninguna es financiadora ni operadora por omisión. */
export const PARTNER_RELATION_TYPES = [
    { id: 'respaldo_institucional', label: 'Respaldo institucional' },
    { id: 'alianza_cientifica', label: 'Alianza científica o académica' },
    { id: 'patrocinio', label: 'Patrocinio' },
    { id: 'operacion', label: 'Operación del programa' },
    { id: 'aliado_estrategico', label: 'Aliado estratégico' },
    { id: 'difusion', label: 'Apoyo en difusión' },
    { id: 'otra', label: 'Otra participación' },
];
const shapePartner = (raw) => {
    const p = obj(raw);
    const rel = str(p.relationType, 40);
    return {
        name: str(p.name, 160), logoUrl: normalizeLink(p.logoUrl) || '', url: normalizeLink(p.url) || '', logoAuthorized: bool(p.logoAuthorized), note: str(p.note, 300),
        id: str(p.id, 64) || undefined,
        relationType: PARTNER_RELATION_TYPES.some(r => r.id === rel) ? rel : '',
        participation: multi(p.participation, 1500), validFrom: isoDate(p.validFrom), validUntil: isoDate(p.validUntil),
        authorizationFileId: str(p.authorizationFileId, 80) || null,
    };
};
const NA_STATES = ['texto', 'no_aplica', 'pendiente'];
const shapeNa = (raw, max) => {
    if (raw && typeof raw === 'object') {
        const status = NA_STATES.includes(raw.status) ? raw.status : 'texto';
        const text = status === 'texto' ? multi(raw.text, max) : '';
        return status === 'texto' && !text ? null : { status, text };
    }
    const text = multi(raw, max);
    return text ? { status: 'texto', text } : null;
};
/**
 * v4.1286 — El perfil institucional del programa (lo que recoge el formulario
 * institucional): nombre corto, frase, propósito, quiénes somos, reseña, hitos,
 * misión/visión/valores/objetivos (que admiten «No aplica» o «Pendiente»),
 * marca, entidad que lo opera y contacto público. JSONB en `Program.profile`.
 */
export const shapeProfile = (raw = {}) => {
    const r = obj(raw);
    const b = obj(r.brand); const oe = obj(r.operatingEntity); const pc = obj(r.publicContact);
    const asset = (x) => { const o = obj(x); const url = normalizeLink(o.url) || ''; return url ? { url, description: str(o.description, 300), usage: str(o.usage, 300) } : null; };
    const year = Number.parseInt(r.startYear, 10);
    const LEGAL = ['personeria_propia', 'entidad_anfitriona', 'sin_personeria', 'otro'];
    const CH = ['whatsapp', 'telefono', 'correo', 'formulario'];
    return {
        shortName: str(r.shortName, 60), tagline: str(r.tagline, 140), purpose: multi(r.purpose, 2000), whoWeAre: multi(r.whoWeAre, 3000),
        about: multi(r.about, 4000), history: multi(r.history, 6000), startYear: year >= 1900 && year <= 2100 ? year : null,
        mission: shapeNa(r.mission, 3000), vision: shapeNa(r.vision, 3000), values: shapeNa(r.values, 3000), objectives: shapeNa(r.objectives, 3000),
        milestones: arr(r.milestones).slice(0, 60).map(m => { const o = obj(m); const y = Number.parseInt(o.year, 10); return { id: str(o.id, 64) || makeRef('H').slice(-6), year: y >= 1900 && y <= 2100 ? y : null, title: str(o.title, 200), description: multi(o.description, 800) }; }).filter(m => m.title),
        brand: {
            logo: asset(b.logo), variants: arr(b.variants).slice(0, 20).map(asset).filter(Boolean),
            privateFiles: arr(b.privateFiles).slice(0, 40).map(f => ({ fileId: str(obj(f).fileId, 80), description: str(obj(f).description, 300), usage: str(obj(f).usage, 300) })).filter(f => f.fileId),
        },
        operatingEntity: { publicName: str(oe.publicName, 200), operatorName: str(oe.operatorName, 200), legalStatus: LEGAL.includes(oe.legalStatus) ? oe.legalStatus : '', legalNote: multi(oe.legalNote, 1000) },
        publicContact: { hours: str(pc.hours, 300), preferredChannel: CH.includes(pc.preferredChannel) ? pc.preferredChannel : '' },
    };
};
/** Lo PÚBLICO del perfil: sin archivos privados; «No aplica»/«Pendiente» no se pintan. */
export const publicProfileView = (raw = {}) => {
    const p = shapeProfile(raw);
    const t = (v) => (v && v.status === 'texto' ? v.text : '');
    return {
        shortName: p.shortName, tagline: p.tagline, purpose: p.purpose, whoWeAre: p.whoWeAre, about: p.about, history: p.history, startYear: p.startYear,
        mission: t(p.mission), vision: t(p.vision), values: t(p.values), objectives: t(p.objectives), milestones: p.milestones,
        logoVariants: p.brand.variants, operatorName: p.operatingEntity.operatorName, publicContact: p.publicContact,
    };
};
const shapeEntryList = (raw, fields, max = 60) => arr(raw).slice(0, max).map(x => {
    const o = obj(x);
    const out = { id: str(o.id, 64) || makeRef('E').slice(-6) };
    for (const [k, n] of fields) out[k] = n > 400 ? multi(o[k], n) : str(o[k], n);
    if (o.clinical === true) out.clinical = true;
    return out;
}).filter(e => fields.some(([k]) => e[k]));
/** Fusiona por id (o por nombre) SIN borrar lo que no viene: un campo omitido no es una orden de borrado. */
export const upsertById = (current = [], incoming = [], keyOf = (x) => x.id) => {
    const out = arr(current).map(x => ({ ...x }));
    for (const inc of arr(incoming)) {
        const k = keyOf(inc);
        const i = out.findIndex(x => (x.id && inc.id && x.id === inc.id) || (k && keyOf(x) === k));
        const clean = Object.fromEntries(Object.entries(inc).filter(([, v]) => v !== undefined && v !== null && v !== ''));
        if (i >= 0) out[i] = { ...out[i], ...clean };
        else out.push(clean);
    }
    return out;
};
const lowerName = (x) => String(obj(x).name || '').trim().toLowerCase();
const mergeShallow = (cur, inc) => ({ ...obj(cur), ...Object.fromEntries(Object.entries(obj(inc)).filter(([, v]) => v !== undefined && v !== null && v !== '')) });
/**
 * v4.1286 — Aplica una solicitud de «Información institucional» SOBRE lo
 * vigente. Sólo cambian los campos que trae; las listas (`*Upsert`) se
 * fusionan por id; personas y perfil se fusionan campo a campo. La dirección
 * (slug) NO cambia aunque cambie el nombre. Puro: lo prueba test-programas.
 */
export const mergeInfoPayload = (cur = {}, payload = {}) => {
    const identity = obj(payload.identity);
    const { profile: idProfile, partnersUpsert, social: idSocial, slug: _ignored, ...plain } = identity;
    void _ignored;
    const curProfile = shapeProfile(cur.profile);
    const ip = obj(idProfile);
    const profile = {
        ...curProfile,
        ...Object.fromEntries(Object.entries(ip).filter(([k, v]) => !['brand', 'operatingEntity', 'publicContact', 'milestonesUpsert', 'milestones'].includes(k) && v !== undefined && v !== null && v !== '')),
        milestones: upsertById(curProfile.milestones, ip.milestonesUpsert || [], (x) => String(x.title || '').toLowerCase()),
        brand: { ...curProfile.brand, ...Object.fromEntries(Object.entries(obj(ip.brand)).filter(([, v]) => v)) },
        operatingEntity: mergeShallow(curProfile.operatingEntity, ip.operatingEntity),
        publicContact: mergeShallow(curProfile.publicContact, ip.publicContact),
    };
    if (obj(ip.brand).variants) profile.brand.variants = upsertById(curProfile.brand.variants, ip.brand.variants, (x) => x.url);
    if (obj(ip.brand).privateFiles) profile.brand.privateFiles = upsertById(curProfile.brand.privateFiles, ip.brand.privateFiles, (x) => x.fileId);
    const careIn = obj(payload.care); const curCare = obj(cur.care);
    const { servicesUpsert, stepsUpsert, faqsUpsert, ...carePlain } = careIn;
    const care = { ...mergeShallow(curCare, carePlain) };
    if (servicesUpsert) care.services = upsertById(curCare.services, servicesUpsert, (x) => String(x.name || '').toLowerCase());
    if (stepsUpsert) care.steps = upsertById(curCare.steps, stepsUpsert, (x) => String(x.title || '').toLowerCase());
    if (faqsUpsert) care.faqs = upsertById(curCare.faqs, faqsUpsert, (x) => String(x.question || '').toLowerCase());
    const g = obj(payload.governance); const curG = obj(cur.governance);
    const governance = { ...curG };
    for (const [k, v] of Object.entries(g)) governance[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeShallow(curG[k], v) : (v === undefined || v === '' ? curG[k] : v);
    return {
        ...cur, ...Object.fromEntries(Object.entries(plain).filter(([, v]) => v !== undefined && v !== null && v !== '')),
        slug: cur.slug,
        name: plain.name || cur.name,
        social: mergeShallow(cur.social, idSocial),
        partners: partnersUpsert ? upsertById(cur.partners, partnersUpsert, lowerName) : cur.partners,
        profile, care, governance,
        participation: mergeShallow(cur.participation, payload.participation),
    };
};
const shapeCta = (raw) => {
    const c = obj(raw);
    const target = str(c.target, 40);
    const TARGETS = ['orientacion', 'apoyo', 'club', 'novedades', 'clinicas', 'donar', 'enlace'];
    return {
        label: str(c.label, 60), target: TARGETS.includes(target) ? target : 'enlace',
        href: target === 'enlace' ? (normalizeLink(c.href) || '') : '', enabled: c.enabled !== false, skin: str(c.skin, 20) || 'solid',
    };
};

export const defaultSections = () => SECTIONS.map((s, i) => ({ key: s.key, enabled: s.defaultEnabled, order: i, title: '' }));

/** Las secciones tal como se guardan: cada clave UNA vez, en el orden dado. */
export const shapeSections = (raw) => {
    const given = arr(raw).map(s => obj(s)).filter(s => SECTION_KEYS.includes(s.key));
    const seen = new Set();
    const out = [];
    for (const s of given) {
        if (seen.has(s.key)) continue;
        seen.add(s.key);
        out.push({ key: s.key, enabled: s.enabled !== false, order: out.length, title: str(s.title, 80) });
    }
    for (const s of SECTIONS) if (!seen.has(s.key)) out.push({ key: s.key, enabled: s.defaultEnabled, order: out.length, title: '' });
    return out;
};

export const shapeProgram = (raw = {}) => {
    const g = obj(raw.governance);
    const care = obj(raw.care);
    const part = obj(raw.participation);
    const routing = obj(raw.requestRouting);
    const seo = obj(raw.seo);
    const routeOf = (k) => {
        const r = obj(routing[k]);
        return { assigneeUserId: str(r.assigneeUserId, 80) || null, assigneeName: str(r.assigneeName, 160), backupUserId: str(r.backupUserId, 80) || null, backupName: str(r.backupName, 160), notifyEmails: arr(r.notifyEmails).map(e => str(e, 200).toLowerCase()).filter(e => EMAIL_RE.test(e)).slice(0, 10) };
    };
    const status = str(raw.status, 20);
    const category = str(raw.category, 40);
    return {
        name: str(raw.name, 160),
        slug: slugify(raw.slug || raw.name),
        summary: multi(raw.summary, 400),
        description: multi(raw.description, 12000),
        category: PROGRAM_CATEGORY_IDS.includes(category) ? category : 'otro',
        status: PROGRAM_STATE_IDS.includes(status) ? status : 'borrador',
        logoUrl: normalizeLink(raw.logoUrl) || '',
        heroImageUrl: normalizeLink(raw.heroImageUrl) || '',
        heroImageAlt: str(raw.heroImageAlt, 200),
        website: normalizeLink(raw.website) || '',
        social: shapeSocial(raw.social),
        partners: arr(raw.partners).slice(0, 30).map(shapePartner).filter(p => p.name),
        governance: {
            coordinator: shapePerson(g.coordinator),
            communications: shapePerson(g.communications),
            medicalReviewer: shapePerson(g.medicalReviewer),
            requestsManager: shapePerson(g.requestsManager),
            requestsBackup: shapePerson(g.requestsBackup),
            institutionalEmail: str(g.institutionalEmail, 200).toLowerCase(),
            institutionalPhone: str(g.institutionalPhone, 40),
            institutionalEmailPublic: bool(g.institutionalEmailPublic),
            institutionalPhonePublic: bool(g.institutionalPhonePublic),
            lastVerifiedAt: isoDate(g.lastVerifiedAt),
            lastVerifiedBy: str(g.lastVerifiedBy, 160),
        },
        care: {
            audience: multi(care.audience, 1500),
            coverage: multi(care.coverage, 1500),
            guidancePath: multi(care.guidancePath, 4000),
            accessConditions: multi(care.accessConditions, 4000),
            officialChannels: multi(care.officialChannels, 1500),
            costsText: multi(care.costsText, 2000),
            contactHours: str(care.contactHours, 300),
            services: shapeEntryList(care.services, [['name', 200], ['description', 800]]),
            steps: shapeEntryList(care.steps, [['title', 200], ['description', 800]]),
            faqs: shapeEntryList(care.faqs, [['question', 300], ['answer', 2000]]),
            costsApproved: bool(care.costsApproved),
            costsApprovedBy: str(care.costsApprovedBy, 160),
            costsApprovedAt: isoDate(care.costsApprovedAt),
            medicalApprovedAt: isoDate(care.medicalApprovedAt),
            medicalApprovedBy: str(care.medicalApprovedBy, 160),
        },
        participation: {
            waysToSupport: multi(part.waysToSupport, 4000),
            clubParticipation: multi(part.clubParticipation, 4000),
            volunteering: multi(part.volunteering, 3000),
            corporateAlliances: multi(part.corporateAlliances, 3000),
            donationsEnabled: bool(part.donationsEnabled),
            donationsIntro: multi(part.donationsIntro, 1500),
            clubActions: multi(part.clubActions, 3000), currentNeeds: multi(part.currentNeeds, 3000),
            inKindSupport: multi(part.inKindSupport, 3000), fundraising: multi(part.fundraising, 3000),
        },
        profile: shapeProfile(raw.profile),
        sections: shapeSections(raw.sections),
        ctas: arr(raw.ctas).slice(0, 6).map(shapeCta).filter(c => c.label),
        seo: { title: str(seo.title, 70), description: str(seo.description, 170), image: normalizeLink(seo.image) || '' },
        requestRouting: { orientacion: routeOf('orientacion'), apoyo: routeOf('apoyo'), club: routeOf('club') },
        newsletterEnabled: raw.newsletterEnabled !== false,
        formsEnabled: {
            orientacion: obj(raw.formsEnabled).orientacion !== false,
            apoyo: obj(raw.formsEnabled).apoyo !== false,
            club: obj(raw.formsEnabled).club !== false,
            novedades: obj(raw.formsEnabled).novedades !== false,
        },
        pendingValidation: arr(raw.pendingValidation).map(v => str(v, 200)).filter(Boolean).slice(0, 40),
    };
};

/** Para GUARDAR sólo hace falta el nombre: lo incompleto es un borrador. */
export const validateProgramDraft = (p) => {
    const errors = [];
    if (p.name.length < 3) errors.push({ field: 'name', message: 'Escribe el nombre oficial del programa (mínimo 3 caracteres).' });
    if (!isValidSlug(p.slug)) errors.push({ field: 'slug', message: 'La dirección (slug) sólo admite letras minúsculas, números y guiones.' });
    else if (RESERVED_SLUGS.includes(p.slug)) errors.push({ field: 'slug', message: 'Esa dirección está reservada. Elige otra.' });
    for (const [k, person] of Object.entries(p.governance)) {
        if (person && typeof person === 'object' && person.email && !EMAIL_RE.test(person.email)) errors.push({ field: `governance.${k}.email`, message: 'Revisa el correo del responsable.' });
    }
    if (p.governance.institutionalEmail && !EMAIL_RE.test(p.governance.institutionalEmail)) errors.push({ field: 'governance.institutionalEmail', message: 'Revisa el correo institucional.' });
    for (const c of p.ctas) if (c.target === 'enlace' && !c.href) errors.push({ field: 'ctas', message: `El llamado «${c.label}» necesita un enlace válido.` });
    return { ok: errors.length === 0, errors };
};

/** Los requisitos de PUBLICACIÓN (pasar a «activo»). */
export const validateProgramForPublish = (p) => {
    const { errors } = validateProgramDraft(p);
    if (p.summary.length < 40) errors.push({ field: 'summary', message: 'El resumen debe tener al menos 40 caracteres: es lo que ve el catálogo.' });
    if (p.description.length < 120) errors.push({ field: 'description', message: 'La descripción debe tener al menos 120 caracteres.' });
    if (!p.logoUrl && !p.heroImageUrl) errors.push({ field: 'heroImageUrl', message: 'Sube un logo o una imagen principal.' });
    if (p.heroImageUrl && !p.heroImageAlt) errors.push({ field: 'heroImageAlt', message: 'Escribe el texto alternativo de la imagen principal (accesibilidad).' });
    if (!p.governance.coordinator.name) errors.push({ field: 'governance.coordinator', message: 'Indica el coordinador del programa.' });
    if (!p.governance.institutionalEmail && !p.governance.coordinator.email) errors.push({ field: 'governance.institutionalEmail', message: 'Indica un correo institucional o el del coordinador: es a donde llegan las solicitudes.' });
    if (!p.governance.lastVerifiedAt) errors.push({ field: 'governance.lastVerifiedAt', message: 'Registra la fecha de la última verificación de la información.' });
    if (p.care.costsText && !p.care.costsApproved) errors.push({ field: 'care.costsText', message: 'El texto sobre costos o gratuidad tiene que estar marcado como aprobado para publicarse.' });
    if (p.partners.some(x => x.logoUrl && !x.logoAuthorized)) errors.push({ field: 'partners', message: 'Hay logos de aliados sin autorización registrada: quítalos o marca la autorización.' });
    if (p.pendingValidation.length) errors.push({ field: 'pendingValidation', message: `Quedan ${p.pendingValidation.length} datos pendientes de validación. Resuélvelos o elimínalos de la lista antes de publicar.` });
    return { ok: errors.length === 0, errors };
};

/** La ficha PÚBLICA del programa: sin correos internos, sin enrutamiento, sin pendientes. */
export const publicProgramView = (p = {}) => {
    const g = obj(p.governance);
    const care = obj(p.care);
    const part = obj(p.participation);
    return {
        id: p.id, slug: p.slug, name: p.name, summary: p.summary, description: p.description, category: p.category,
        categoryLabel: PROGRAM_CATEGORIES.find(c => c.id === p.category)?.label || '',
        logoUrl: p.logoUrl || '', heroImageUrl: p.heroImageUrl || '', heroImageAlt: p.heroImageAlt || '',
        website: p.website || '', social: obj(p.social),
        partners: arr(p.partners).filter(x => !x.validUntil || x.validUntil >= new Date().toISOString().slice(0, 10)).map(x => ({
            name: x.name, url: x.url || '', logoUrl: x.logoAuthorized ? (x.logoUrl || '') : '',
            relationType: x.relationType || '', relationLabel: PARTNER_RELATION_TYPES.find(r => r.id === x.relationType)?.label || '', participation: x.participation || '',
        })),
        profile: publicProfileView(p.profile),
        contact: {
            email: g.institutionalEmailPublic ? (g.institutionalEmail || '') : '',
            phone: g.institutionalPhonePublic ? (g.institutionalPhone || '') : '',
            coordinatorName: obj(g.coordinator).public ? (obj(g.coordinator).name || '') : '',
            lastVerifiedAt: g.lastVerifiedAt || '',
        },
        care: {
            audience: care.audience || '', coverage: care.coverage || '', guidancePath: care.guidancePath || '',
            accessConditions: care.accessConditions || '', officialChannels: care.officialChannels || '',
            costsText: care.costsApproved ? (care.costsText || '') : '',
            contactHours: care.contactHours || '',
            services: arr(care.services), steps: arr(care.steps),
            // Una respuesta clínica sólo se publica con la aprobación médica de la ficha.
            faqs: arr(care.faqs).filter(f => !f.clinical || care.medicalApprovedAt),
        },
        participation: {
            waysToSupport: part.waysToSupport || '', clubParticipation: part.clubParticipation || '',
            volunteering: part.volunteering || '', corporateAlliances: part.corporateAlliances || '',
            donationsEnabled: part.donationsEnabled === true, donationsIntro: part.donationsIntro || '',
            clubActions: part.clubActions || '', currentNeeds: part.currentNeeds || '', inKindSupport: part.inKindSupport || '', fundraising: part.fundraising || '',
        },
        sections: arr(p.sections), ctas: arr(p.ctas).filter(c => c.enabled !== false),
        seo: obj(p.seo), formsEnabled: obj(p.formsEnabled), newsletterEnabled: p.newsletterEnabled !== false,
        publishedAt: p.publishedAt || null, updatedAt: p.updatedAt || null,
    };
};

// ─── Vinculación distrital y activación ───────────────────────────────

export const shapeLink = (raw = {}) => {
    const rel = str(raw.relationType, 40);
    const st = str(raw.status, 20);
    const c = obj(raw.contact);
    return {
        districtNumber: Number.parseInt(raw.districtNumber, 10) || 0,
        relationType: RELATION_TYPE_IDS.includes(rel) ? rel : 'respaldo_institucional',
        relationDescription: multi(raw.relationDescription, 1500),
        status: LINK_STATE_IDS.includes(st) ? st : 'activa',
        presentation: multi(raw.presentation, 4000),
        contact: { name: str(c.name, 160), role: str(c.role, 120), email: str(c.email, 200).toLowerCase(), phone: str(c.phone, 40), public: bool(c.public) },
        showInMenu: raw.showInMenu !== false,
        showInCatalog: raw.showInCatalog !== false,
        allowClubActivation: raw.allowClubActivation !== false,
        disclaimer: multi(raw.disclaimer, 800),
    };
};
export const validateLink = (l) => {
    const errors = [];
    if (!(l.districtNumber > 0)) errors.push({ field: 'districtNumber', message: 'Indica el número del distrito.' });
    if (l.relationType === 'otra' && l.relationDescription.length < 10) errors.push({ field: 'relationDescription', message: 'Describe la relación.' });
    if (l.contact.email && !EMAIL_RE.test(l.contact.email)) errors.push({ field: 'contact.email', message: 'Revisa el correo del contacto distrital.' });
    return { ok: errors.length === 0, errors };
};
export const publicLinkView = (l = {}) => ({
    districtNumber: l.districtNumber, relationType: l.relationType,
    relationLabel: RELATION_TYPES.find(r => r.id === l.relationType)?.label || '',
    relationDescription: l.relationDescription || '', presentation: l.presentation || '', disclaimer: l.disclaimer || '',
    contact: obj(l.contact).public ? { name: obj(l.contact).name || '', role: obj(l.contact).role || '', email: obj(l.contact).email || '', phone: obj(l.contact).phone || '' } : null,
});

export const shapeActivation = (raw = {}) => {
    const c = obj(raw.localContact);
    return {
        localContact: { name: str(c.name, 160), role: str(c.role, 120), email: str(c.email, 200).toLowerCase(), phone: str(c.phone, 40), public: bool(c.public) },
        localNote: multi(raw.localNote, 1500),
        showInMenu: raw.showInMenu !== false,
    };
};
export const validateActivation = (a) => {
    const errors = [];
    if (a.localContact.email && !EMAIL_RE.test(a.localContact.email)) errors.push({ field: 'localContact.email', message: 'Revisa el correo del contacto local.' });
    return { ok: errors.length === 0, errors };
};
export const publicActivationView = (a = {}) => ({
    clubName: a.clubName || '', localNote: a.localNote || '',
    localContact: obj(a.localContact).public ? { name: obj(a.localContact).name || '', role: obj(a.localContact).role || '', email: obj(a.localContact).email || '', phone: obj(a.localContact).phone || '' } : null,
});

// ─── Los registros de contenido ───────────────────────────────────────

const shapeMedia = (raw) => arr(raw).slice(0, 12).map(m => {
    const x = obj(m);
    const url = normalizeLink(x.url) || '';
    const embed = resolveEmbed(x.embedUrl || '');
    if (!url && !embed) return null;
    return {
        url, mediaId: str(x.mediaId, 80) || null, kind: embed ? 'embed' : (str(x.kind, 10) === 'video' ? 'video' : 'image'),
        embed, alt: str(x.alt, 200), author: str(x.author, 160), caption: str(x.caption, 300),
        permissionGranted: bool(x.permissionGranted), permissionScope: PERMISSION_SCOPES.some(s => s.id === x.permissionScope) ? x.permissionScope : 'programa',
        verifiedBy: str(x.verifiedBy, 160), verifiedAt: isoDate(x.verifiedAt),
        // El comprobante es un archivo PRIVADO (ProgramFile.id), nunca una URL.
        authorizationFileId: str(x.authorizationFileId, 80) || null,
    };
}).filter(Boolean);

export const STORY_IDENTITY_MODES = ['nombre_completo', 'solo_nombre', 'seudonimo', 'anonima', 'testimonio'];

const SHAPERS = {
    clinic: (r) => ({
        name: str(r.name, 160), institution: str(r.institution, 200), region: str(r.region, 120), city: str(r.city, 120),
        address: str(r.address, 300), phone: str(r.phone, 60), email: str(r.email, 200).toLowerCase(), url: normalizeLink(r.url) || '',
        referenceContact: str(r.referenceContact, 200), careConditions: multi(r.careConditions, 2000),
        schedule: str(r.schedule, 300), active: r.active !== false, services: multi(r.services, 1500),
        verifiedAt: isoDate(r.verifiedAt), verifiedBy: str(r.verifiedBy, 160),
        // Interno: NUNCA sale al público.
        internal: { contactName: str(obj(r.internal).contactName, 160), phone: str(obj(r.internal).phone, 60), email: str(obj(r.internal).email, 200).toLowerCase(), notes: multi(obj(r.internal).notes, 2000) },
    }),
    team: (r) => ({
        name: str(r.name, 160), role: str(r.role, 160), specialty: str(r.specialty, 160), institution: str(r.institution, 200), bio: multi(r.bio, 2000),
        photoUrl: normalizeLink(r.photoUrl) || '', photoAlt: str(r.photoAlt, 200), sortOrder: Number.parseInt(r.sortOrder, 10) || 0,
        publishAuthorized: bool(r.publishAuthorized), authorizationFileId: str(r.authorizationFileId, 80) || null,
    }),
    story: (r) => ({
        title: str(r.title, 160), summary: multi(r.summary, 500), body: multi(r.body, 12000), media: shapeMedia(r.media),
        location: str(r.location, 160), date: isoDate(r.date), author: str(r.author, 160),
        usagePermission: bool(r.usagePermission), usagePermissionScope: PERMISSION_SCOPES.some(s => s.id === r.usagePermissionScope) ? r.usagePermissionScope : 'programa',
        authorizationFileId: str(r.authorizationFileId, 80) || null, minorsInvolved: bool(r.minorsInvolved),
        // v4.1286 — Lo que agrega el formulario institucional. `format` separa
        // historias de testimonios (registros independientes en la misma colección).
        format: str(r.format, 20) === 'testimonio' ? 'testimonio' : 'historia',
        context: multi(r.context, 3000), accompaniment: multi(r.accompaniment, 3000), stages: multi(r.stages, 3000), changes: multi(r.changes, 3000),
        quotes: multi(r.quotes, 2000), careProcess: multi(r.careProcess, 3000),
        identityMode: STORY_IDENTITY_MODES.includes(str(r.identityMode, 20)) ? str(r.identityMode, 20) : 'nombre_completo',
        publicName: str(r.publicName, 160),
        namePermission: bool(r.namePermission), imagePermission: bool(r.imagePermission), videoPermission: bool(r.videoPermission),
        guardianAuthorized: bool(r.guardianAuthorized),
        channels: arr(r.channels).map(c => str(c, 20)).filter(c => ['programa', 'distrito', 'clubes', 'redes'].includes(c)),
        authorizationFileIds: arr(r.authorizationFileIds).map(x => str(x, 80)).filter(Boolean).slice(0, 10),
        verifiedBy: str(r.verifiedBy, 160), verifiedAt: isoDate(r.verifiedAt),
        testimonyMode: str(r.testimonyMode, 20), relation: str(r.relation, 160),
        display: ['nombre_completo', 'solo_nombre', 'iniciales', 'anonimo'].includes(str(r.display, 20)) ? str(r.display, 20) : 'solo_nombre',
        linkedStoryId: str(r.linkedStoryId, 80) || null,
        withdrawalRequested: bool(r.withdrawalRequested),
        // Interno: NUNCA sale al público (nombre real, referencia, representante).
        internal: { personName: str(obj(r.internal).personName, 160), internalRef: str(obj(r.internal).internalRef, 80), guardianName: str(obj(r.internal).guardianName, 160), firstName: str(obj(r.internal).firstName, 120), lastName: str(obj(r.internal).lastName, 120) },
    }),
    resource: (r) => ({
        title: str(r.title, 160), description: multi(r.description, 2000),
        type: RESOURCE_TYPE_IDS.includes(str(r.type, 20)) ? str(r.type, 20) : 'enlace',
        url: normalizeLink(r.url) || '', embed: resolveEmbed(r.url || ''), fileId: str(r.fileId, 80) || null,
        audience: str(r.audience, 160), source: str(r.source, 200), reviewedAt: isoDate(r.reviewedAt),
        clinical: bool(r.clinical), medicalApprovedBy: str(r.medicalApprovedBy, 160), medicalApprovedAt: isoDate(r.medicalApprovedAt),
        category: str(r.category, 30), publishedOn: isoDate(r.publishedOn),
    }),
    news: (r) => ({
        type: str(r.type, 10) === 'evento' ? 'evento' : 'noticia', title: str(r.title, 160), summary: multi(r.summary, 500), body: multi(r.body, 8000),
        date: isoDate(r.date), endDate: isoDate(r.endDate), location: str(r.location, 200), url: normalizeLink(r.url) || '',
        imageUrl: normalizeLink(r.imageUrl) || '', imageAlt: str(r.imageAlt, 200),
    }),
    indicator: (r) => ({
        name: str(r.name, 160), definition: multi(r.definition, 1000), value: str(r.value, 40), unit: str(r.unit, 40),
        mode: INDICATOR_MODES.some(m => m.id === r.mode) ? r.mode : 'acumulado', period: str(r.period, 80),
        source: str(r.source, 200), validatedBy: str(r.validatedBy, 160), updatedOn: isoDate(r.updatedOn), sortOrder: Number.parseInt(r.sortOrder, 10) || 0,
        geoScope: str(r.geoScope, 160), supportFileId: str(r.supportFileId, 80) || null,
    }),
    donation: (r) => ({
        buttonLabel: str(r.buttonLabel, 60), url: normalizeLink(r.url) || '', receiver: str(r.receiver, 200), purpose: multi(r.purpose, 600),
        disclaimer: multi(r.disclaimer, 1500), verifiedBy: str(r.verifiedBy, 160), verifiedAt: isoDate(r.verifiedAt), sortOrder: Number.parseInt(r.sortOrder, 10) || 0,
        taxClaimPending: bool(r.taxClaimPending),
        internal: { contactName: str(obj(r.internal).contactName, 160), email: str(obj(r.internal).email, 200).toLowerCase() },
    }),
};

export const shapeContent = (kind, raw = {}) => (SHAPERS[kind] ? SHAPERS[kind](obj(raw)) : null);

/** Título legible de un registro, para listados e historial. */
export const contentTitleOf = (kind, data = {}) => {
    const d = obj(data);
    if (kind === 'indicator') return d.name || 'Indicador';
    if (kind === 'donation') return d.buttonLabel || d.receiver || 'Enlace de donación';
    if (kind === 'clinic' || kind === 'team') return d.name || CONTENT_KINDS[kind]?.label || kind;
    return d.title || CONTENT_KINDS[kind]?.label || kind;
};

const VALIDATORS = {
    clinic: (d, e) => {
        if (d.name.length < 3) e('name', 'Escribe el nombre de la clínica o centro.');
        if (!d.city) e('city', 'Indica la ciudad.');
        if (!d.region) e('region', 'Indica el departamento o región.');
        if (d.email && !EMAIL_RE.test(d.email)) e('email', 'Revisa el correo público.');
        if (!d.verifiedAt || !d.verifiedBy) e('verifiedAt', 'Registra fecha y responsable de la verificación de los datos.');
    },
    team: (d, e, { publish }) => {
        if (d.name.length < 3) e('name', 'Escribe el nombre de la persona.');
        if (!d.role) e('role', 'Indica su rol.');
        if (publish && !d.publishAuthorized) e('publishAuthorized', 'No se publica a una persona sin su autorización registrada.');
        if (d.photoUrl && !d.photoAlt) e('photoAlt', 'Escribe el texto alternativo de la fotografía.');
    },
    story: (d, e, { publish }) => {
        if (d.title.length < 5) e('title', 'Escribe un título (mínimo 5 caracteres).');
        if (d.summary.length < 20) e('summary', 'Escribe un resumen (mínimo 20 caracteres).');
        if (publish && !d.usagePermission) e('usagePermission', 'No se publica una historia sin el permiso de uso registrado.');
        if (publish && d.media.some(m => !m.permissionGranted)) e('media', 'Hay piezas multimedia sin permiso de publicación.');
        if (publish && d.minorsInvolved && !d.guardianAuthorized) e('guardianAuthorized', 'Aparecen menores de edad: registra la autorización de su representante legal antes de publicar.');
        if (publish && d.withdrawalRequested) e('withdrawalRequested', 'Se pidió el retiro de esta historia: no se publica.');
        if (d.media.some(m => m.kind === 'image' && !m.alt)) e('media', 'Cada imagen necesita texto alternativo.');
    },
    resource: (d, e, { publish }) => {
        if (d.title.length < 3) e('title', 'Escribe el título del recurso.');
        if (!d.url && !d.fileId) e('url', 'Adjunta un archivo o indica la URL del recurso.');
        if ((d.type === 'video' || d.type === 'podcast' || d.type === 'audio') && d.url && !d.embed) e('url', 'Sólo se embeben enlaces de YouTube, Vimeo o Spotify. Otros enlaces se muestran como enlace externo: cambia el tipo a «Enlace».');
        if (!d.source) e('source', 'Indica la fuente del recurso.');
        if (publish && d.clinical && (!d.medicalApprovedBy || !d.medicalApprovedAt)) e('clinical', 'Un recurso clínico se publica sólo con aprobación médica registrada.');
    },
    news: (d, e) => {
        if (d.title.length < 5) e('title', 'Escribe el título.');
        if (d.type === 'evento' && !d.date) e('date', 'Un evento necesita fecha.');
        if (d.imageUrl && !d.imageAlt) e('imageAlt', 'Escribe el texto alternativo de la imagen.');
    },
    indicator: (d, e) => {
        if (d.name.length < 3) e('name', 'Escribe el nombre del indicador.');
        if (!d.definition) e('definition', 'Escribe la definición: qué mide y cómo.');
        if (!d.value) e('value', 'Indica el valor.');
        if (!d.period) e('period', 'Indica el período al que corresponde.');
        if (!d.source) e('source', 'Indica la fuente del dato.');
        if (!d.validatedBy) e('validatedBy', 'Indica quién validó el dato.');
        if (!d.updatedOn) e('updatedOn', 'Indica la fecha de actualización.');
        if (/\b(ni[ñn]o|ni[ñn]a|menor)\b.*\b[A-ZÁÉÍÓÚ][a-záéíóú]+\s+[A-ZÁÉÍÓÚ][a-záéíóú]+/.test(d.definition)) e('definition', 'No publiques nombres de menores junto a contadores.');
    },
    donation: (d, e, { publish }) => {
        if (!d.buttonLabel) e('buttonLabel', 'Escribe el texto del botón.');
        if (!d.url) e('url', 'Indica la URL oficial del canal de donación.');
        if (!d.receiver) e('receiver', 'Indica la entidad que recibe y administra el aporte.');
        if (!d.purpose) e('purpose', 'Indica el destino o finalidad informada del aporte.');
        if (publish && (!d.verifiedBy || !d.verifiedAt)) e('verifiedAt', 'Registra responsable y fecha de verificación del enlace.');
        if (publish && d.taxClaimPending && !/aprobad/i.test(d.disclaimer)) e('disclaimer', 'La afirmación sobre beneficios tributarios está pendiente de verificación: escribe el texto aprobado o quítala.');
        if (/\b(deducible|beneficio tributario|certificado de donaci)/i.test(`${d.purpose} ${d.disclaimer}`) && !/aprobad/i.test(d.disclaimer)) e('disclaimer', 'No afirmes beneficios tributarios ni certificaciones sin texto aprobado: indícalo en el texto aclaratorio.');
    },
};

/** ¿Puede guardarse (`publish:false`) o publicarse (`publish:true`)? */
export const validateContent = (kind, data, { publish = false } = {}) => {
    const errors = [];
    const e = (field, message) => errors.push({ field, message });
    if (!VALIDATORS[kind] || !data) return { ok: false, errors: [{ field: 'kind', message: 'Tipo de contenido desconocido.' }] };
    VALIDATORS[kind](data, e, { publish });
    return { ok: errors.length === 0, errors };
};

/** ¿Un registro publicado puede VERSE en público? Lo autorizado y lo vigente. */
export const isPubliclyVisible = (kind, data = {}) => {
    const d = obj(data);
    if (kind === 'clinic') return d.active !== false;
    if (kind === 'team') return d.publishAuthorized === true;
    if (kind === 'story') return d.usagePermission === true && d.withdrawalRequested !== true;
    if (kind === 'resource') return !d.clinical || Boolean(d.medicalApprovedAt);
    if (kind === 'donation') return Boolean(d.url && d.receiver);
    return true;
};

/** La vista PÚBLICA de un registro: sin internos, sin comprobantes. */
export const publicContentView = (row = {}) => {
    const kind = row.kind;
    const d = obj(row.data);
    const base = { id: row.id, kind, scopeType: row.scopeType, clubName: row.clubName || null, publishedAt: row.publishedAt || null };
    if (kind === 'clinic') {
        return { ...base, name: d.name, institution: d.institution, region: d.region, city: d.city, address: d.address, phone: d.phone, email: d.email, url: d.url, referenceContact: d.referenceContact, careConditions: d.careConditions, schedule: d.schedule, services: d.services || '', verifiedAt: d.verifiedAt };
    }
    if (kind === 'team') return { ...base, name: d.name, role: d.role, specialty: d.specialty || '', institution: d.institution, bio: d.bio, photoUrl: d.photoUrl, photoAlt: d.photoAlt, sortOrder: d.sortOrder };
    if (kind === 'story') {
        // v4.1286 — La identidad pública elegida se respeta en lo que sale: el
        // nombre real, la referencia interna y el representante nunca viajan.
        const media = arr(d.media).filter(m => m.permissionGranted)
            .map(m => ({ url: m.url, kind: m.kind, embed: m.embed, alt: m.alt, caption: m.caption, author: m.author }));
        const out = { ...base, format: d.format || 'historia', title: d.title, summary: d.summary, body: d.body, location: d.location, date: d.date, author: d.author, media };
        if (d.format === 'historia' || !d.format) {
            Object.assign(out, { context: d.context || '', accompaniment: d.accompaniment || '', stages: d.stages || '', changes: d.changes || '', quotes: d.quotes || '', careProcess: d.careProcess || '' });
            out.personLabel = d.identityMode === 'anonima' ? '' : (d.identityMode === 'seudonimo' || d.identityMode === 'solo_nombre') ? (d.publicName || '') : '';
        } else {
            out.displayName = storyTestimonyName(d);
            out.relation = d.relation || ''; out.testimonyMode = d.testimonyMode || ''; out.linkedStoryId = d.linkedStoryId || null;
        }
        return out;
    }
    if (kind === 'resource') return { ...base, title: d.title, description: d.description, type: d.type, url: d.url, embed: d.embed, hasFile: Boolean(d.fileId), audience: d.audience, source: d.source, reviewedAt: d.reviewedAt, clinical: d.clinical, medicalApprovedAt: d.medicalApprovedAt, category: d.category || '', publishedOn: d.publishedOn || '' };
    if (kind === 'news') return { ...base, type: d.type, title: d.title, summary: d.summary, body: d.body, date: d.date, endDate: d.endDate, location: d.location, url: d.url, imageUrl: d.imageUrl, imageAlt: d.imageAlt };
    if (kind === 'indicator') return { ...base, name: d.name, definition: d.definition, value: d.value, unit: d.unit, mode: d.mode, period: d.period, source: d.source, updatedOn: d.updatedOn, sortOrder: d.sortOrder, geoScope: d.geoScope || '' };
    if (kind === 'donation') return { ...base, buttonLabel: d.buttonLabel, url: d.url, receiver: d.receiver, purpose: d.purpose, disclaimer: d.disclaimer, verifiedAt: d.verifiedAt, sortOrder: d.sortOrder };
    return base;
};

/** El nombre visible de un testimonio según lo autorizado (nunca el apellido si no se eligió). */
export const storyTestimonyName = (d = {}) => {
    const i = obj(d.internal);
    const first = String(i.firstName || '').trim(); const last = String(i.lastName || '').trim();
    const rel = d.relation || ({ beneficiario: 'Beneficiario del programa', familiar: 'Familiar', profesional: 'Profesional', voluntario: 'Voluntario', aliado: 'Aliado', donante: 'Donante' })[d.testimonyMode] || '';
    if (d.display === 'nombre_completo' && first) return [first, last].filter(Boolean).join(' ');
    if (d.display === 'solo_nombre' && first) return first;
    if (d.display === 'iniciales' && first) return `${first[0]}.${last ? ` ${last[0]}.` : ''}`;
    return rel || 'Testimonio';
};

/**
 * v4.1286 — ¿Puede este registro verse en ESTE sitio? Una historia o un
 * testimonio sólo llega a los canales que autorizó: «programa» = el sitio
 * dueño del programa; «distrito» = además los sitios distritales vinculados;
 * «clubes» = además los clubes que activaron el programa. Lo demás, igual
 * que siempre.
 */
export const visibleOnSite = (kind, data = {}, siteKind = 'owner') => {
    if (kind !== 'story') return true;
    const d = obj(data);
    const channels = arr(d.channels);
    const scope = channels.length ? (channels.includes('clubes') ? 'clubes' : channels.includes('distrito') ? 'distrito' : 'programa') : (d.usagePermissionScope || 'programa');
    if (siteKind === 'owner' || siteKind === 'preview') return true;
    if (siteKind === 'district') return scope === 'distrito' || scope === 'clubes';
    if (siteKind === 'club') return scope === 'clubes';
    return false;
};

/** Qué secciones se pintan: activas, en su orden, y con contenido real. */
export const renderableSections = (program, { counts = {}, hasPartners = false, hasCare = false, hasParticipation = false, formsAny = true } = {}) => {
    const sections = arr(program?.sections).length ? arr(program.sections) : defaultSections();
    return [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter(s => s.enabled !== false).filter(s => {
        const spec = SECTIONS.find(x => x.key === s.key);
        if (!spec) return false;
        if (spec.feeds) return (counts[spec.feeds] || 0) > 0;
        if (s.key === 'inicio') return true;
        if (s.key === 'programa') return Boolean(String(program?.description || '').trim());
        if (s.key === 'aliados') return hasPartners;
        if (s.key === 'contacto') return formsAny;
        return true;
    }).map(s => ({ key: s.key, label: s.title || SECTIONS.find(x => x.key === s.key).label }));
};

// ─── Solicitudes de cambio (el formato de gestión) ────────────────────

export const shapeChangeRequest = (raw = {}) => {
    const kind = str(raw.kind, 20);
    const op = str(raw.operation, 20);
    const scope = str(raw.scopeType, 20);
    const auth = obj(raw.authorizations);
    const payloadRaw = obj(raw.payload);
    let payload;
    if (kind === 'info') {
        // Sólo los bloques que la solicitud toca; el resto se conserva al aplicar.
        payload = {};
        for (const k of ['identity', 'care', 'participation', 'governance']) if (payloadRaw[k] !== undefined) payload[k] = obj(payloadRaw[k]);
        payload.clinical = bool(payloadRaw.clinical);
    } else if (kind === 'correction') {
        payload = { field: str(payloadRaw.field, 160), current: multi(payloadRaw.current, 2000), proposed: multi(payloadRaw.proposed, 2000), clinical: bool(payloadRaw.clinical) };
    } else if (CONTENT_KINDS[kind]) {
        payload = op === 'retirar' ? { reason: multi(payloadRaw.reason, 1000) } : (shapeContent(kind, payloadRaw) || {});
        if (kind === 'resource' || kind === 'clinic') payload.clinical = kind === 'resource' ? bool(payloadRaw.clinical) : Boolean(payload.careConditions);
        if (kind === 'story' && op !== 'retirar') payload.clinical = Boolean(payload.careProcess);
    } else payload = {};
    return {
        kind: CHANGE_KIND_IDS.includes(kind) ? kind : '',
        operation: OPERATION_IDS.includes(op) ? op : 'crear',
        contentId: str(raw.contentId, 80) || null,
        scopeType: SCOPE_TYPE_IDS.includes(scope) ? scope : 'central',
        districtNumber: Number.parseInt(raw.districtNumber, 10) || 0,
        clubActivationId: str(raw.clubActivationId, 80) || null,
        targetSection: SECTION_KEYS.includes(str(raw.targetSection, 30)) ? str(raw.targetSection, 30) : '',
        title: str(raw.title, 160),
        body: multi(raw.body, 6000),
        payload,
        attachments: arr(raw.attachments).slice(0, 10).map(a => ({ fileId: str(obj(a).fileId, 80), label: str(obj(a).label, 160) })).filter(a => a.fileId),
        links: arr(raw.links).slice(0, 10).map(l => normalizeLink(typeof l === 'string' ? l : obj(l).url)).filter(Boolean),
        responsibleName: str(raw.responsibleName, 160),
        responsibleEmail: str(raw.responsibleEmail, 200).toLowerCase(),
        responsiblePhone: str(raw.responsiblePhone, 40),
        requestedReach: str(raw.requestedReach, 300),
        suggestedDate: isoDate(raw.suggestedDate),
        observations: multi(raw.observations, 3000),
        authorizations: {
            imageRights: bool(auth.imageRights), dataConsent: bool(auth.dataConsent), sourceVerified: bool(auth.sourceVerified),
            medicalReviewRequested: bool(auth.medicalReviewRequested), note: str(auth.note, 500),
        },
    };
};

/** Validación por paso: 1 qué y alcance, 2 contenido, 3 responsable y envío.
 *  `submit:false` es guardar borrador (sólo pide tipo y título). */
export const validateChangeRequest = (r, { submit = true } = {}) => {
    const errors = [];
    const push = (step, field, message) => errors.push({ step, field, message });
    if (!r.kind) push(1, 'kind', 'Elige qué deseas gestionar.');
    if (r.title.length < 5) push(2, 'title', 'Escribe un título o asunto (mínimo 5 caracteres).');
    if (!submit) return { ok: errors.length === 0, errors };

    if (r.operation !== 'crear' && !r.contentId && r.kind !== 'info' && r.kind !== 'correction') push(1, 'contentId', 'Indica qué registro deseas modificar o retirar.');
    if (r.scopeType === 'district' && !(r.districtNumber > 0)) push(1, 'districtNumber', 'Indica el distrito de la vinculación.');
    if (r.scopeType === 'club' && !r.clubActivationId) push(1, 'clubActivationId', 'Indica el club.');
    if (r.scopeType === 'club' && CONTENT_KINDS[r.kind] && !CONTENT_KINDS[r.kind].localAllowed) push(1, 'kind', `Un club no puede agregar «${CONTENT_KINDS[r.kind].label}» como contenido local: propónlo como contenido central.`);
    if (r.scopeType === 'club' && (r.kind === 'info' || r.kind === 'correction') && r.kind === 'info') push(1, 'kind', 'La información institucional es contenido central: un club no la modifica.');

    if (r.operation === 'retirar') {
        if (String(obj(r.payload).reason || '').length < 10) push(2, 'payload.reason', 'Explica por qué se retira el registro.');
    } else if (CONTENT_KINDS[r.kind]) {
        const v = validateContent(r.kind, r.payload, { publish: false });
        for (const e of v.errors) push(2, `payload.${e.field}`, e.message);
    } else if (r.kind === 'correction') {
        if (!obj(r.payload).proposed) push(2, 'payload.proposed', 'Escribe el texto corregido.');
    } else if (r.kind === 'info') {
        if (!Object.keys(r.payload).some(k => k !== 'clinical')) push(2, 'payload', 'Indica qué bloque de información cambia (identidad, atención, participación o gobernanza).');
    }
    if (r.responsibleName.length < 3) push(3, 'responsibleName', 'Escribe el nombre de la persona responsable.');
    if (!EMAIL_RE.test(r.responsibleEmail)) push(3, 'responsibleEmail', 'Escribe un correo válido.');
    if ((r.kind === 'story' || r.kind === 'team') && r.operation !== 'retirar' && !r.authorizations.imageRights) push(3, 'authorizations.imageRights', 'Confirma que cuentas con la autorización de las personas que aparecen.');
    if (r.kind === 'story' && r.operation !== 'retirar' && !r.authorizations.dataConsent) push(3, 'authorizations.dataConsent', 'Confirma el consentimiento para el tratamiento de los datos de quienes aparecen.');
    if ((r.kind === 'indicator' || r.kind === 'donation' || r.kind === 'clinic') && r.operation !== 'retirar' && !r.authorizations.sourceVerified) push(3, 'authorizations.sourceVerified', 'Confirma que la fuente fue verificada.');
    return { ok: errors.length === 0, errors };
};

/** ¿La solicitud cambia algo RELEVANTE respecto de la versión aprobada? Un
 *  cambio de payload tras aprobar invalida la aprobación (vuelve a revisión). */
export const payloadChanged = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

// ─── Solicitudes públicas ─────────────────────────────────────────────

/**
 * Cada tipo sólo admite SUS campos: lo que no está acá se descarta, así que
 * ninguna historia clínica, documento ni foto llega por «orientación».
 */
export const shapePublicRequest = (type, raw = {}) => {
    const r = obj(raw);
    const consent = bool(r.dataConsent);
    if (type === 'orientacion') {
        const means = str(r.contactMeans, 20);
        return {
            adultName: str(r.adultName, 160), city: str(r.city, 160), region: str(r.region, 120),
            contactMeans: CONTACT_MEANS.some(m => m.id === means) ? means : '',
            email: str(r.email, 200).toLowerCase(), phone: str(r.phone, 40).replace(/[^\d+\s()-]/g, ''),
            reason: multi(r.reason, 1500), dataConsent: consent,
        };
    }
    if (type === 'apoyo') {
        const st = str(r.supportType, 20);
        return {
            entityKind: str(r.entityKind, 10) === 'empresa' ? 'empresa' : 'persona', organization: str(r.organization, 200),
            contactName: str(r.contactName, 160), email: str(r.email, 200).toLowerCase(), phone: str(r.phone, 40).replace(/[^\d+\s()-]/g, ''),
            supportType: SUPPORT_TYPES.some(s => s.id === st) ? st : '', message: multi(r.message, 2000), dataConsent: consent,
        };
    }
    if (type === 'club') {
        const pt = str(r.participationType, 20);
        return {
            clubName: str(r.clubName, 200), clubProfileId: str(r.clubProfileId, 80) || null, districtNumber: Number.parseInt(r.districtNumber, 10) || 0,
            responsibleName: str(r.responsibleName, 160), email: str(r.email, 200).toLowerCase(), phone: str(r.phone, 40).replace(/[^\d+\s()-]/g, ''),
            participationType: CLUB_PARTICIPATION_TYPES.some(p => p.id === pt) ? pt : '', message: multi(r.message, 2000), dataConsent: consent,
        };
    }
    return null;
};

export const validatePublicRequest = (type, d) => {
    const errors = [];
    const e = (field, message) => errors.push({ field, message });
    if (!d) return { ok: false, errors: [{ field: 'type', message: 'Tipo de solicitud desconocido.' }] };
    const phoneOk = (p) => { const n = String(p || '').replace(/\D/g, ''); return n.length >= 7 && n.length <= 15; };
    if (type === 'orientacion') {
        if (d.adultName.length < 3) e('adultName', 'Escribe el nombre del adulto responsable.');
        if (!d.city && !d.region) e('city', 'Indica la ciudad o el departamento.');
        if (!d.contactMeans) e('contactMeans', 'Elige por qué medio prefieres que te contacten.');
        if (d.contactMeans === 'correo' && !EMAIL_RE.test(d.email)) e('email', 'Escribe un correo válido.');
        if ((d.contactMeans === 'whatsapp' || d.contactMeans === 'telefono') && !phoneOk(d.phone)) e('phone', 'Escribe un número de teléfono válido.');
        if (d.reason.length < 10) e('reason', 'Cuéntanos brevemente el motivo general (sin datos médicos detallados).');
    } else if (type === 'apoyo') {
        if (d.contactName.length < 3) e('contactName', 'Escribe el nombre de contacto.');
        if (d.entityKind === 'empresa' && !d.organization) e('organization', 'Indica el nombre de la empresa.');
        if (!EMAIL_RE.test(d.email) && !phoneOk(d.phone)) e('email', 'Indica un correo o un teléfono de contacto.');
        if (!d.supportType) e('supportType', 'Elige el tipo de apoyo.');
    } else if (type === 'club') {
        if (d.clubName.length < 3) e('clubName', 'Indica el club.');
        if (!(d.districtNumber > 0)) e('districtNumber', 'Indica el distrito.');
        if (d.responsibleName.length < 3) e('responsibleName', 'Escribe el nombre del responsable.');
        if (!EMAIL_RE.test(d.email) && !phoneOk(d.phone)) e('email', 'Indica un correo o un teléfono de contacto.');
        if (!d.participationType) e('participationType', 'Elige el tipo de participación.');
    }
    if (!d.dataConsent) e('dataConsent', 'Autoriza el tratamiento de tus datos para poder enviar la solicitud.');
    return { ok: errors.length === 0, errors };
};

export const shapeSubscriber = (raw = {}) => ({
    name: str(obj(raw).name, 160), email: str(obj(raw).email, 200).toLowerCase(), consent: bool(obj(raw).newsletterConsent),
});
export const validateSubscriber = (s) => {
    const errors = [];
    if (s.name.length < 2) errors.push({ field: 'name', message: 'Escribe tu nombre.' });
    if (!EMAIL_RE.test(s.email)) errors.push({ field: 'email', message: 'Escribe un correo válido.' });
    if (!s.consent) errors.push({ field: 'newsletterConsent', message: 'Acepta recibir comunicaciones del programa para suscribirte.' });
    return { ok: errors.length === 0, errors };
};

/** Lo que una solicitud pública devuelve al público: sólo la referencia. */
export const publicRequestReceipt = (row = {}) => ({ publicRef: row.publicRef, type: row.type, status: row.status, receivedAt: row.createdAt });

/** Lo que un CLUB de origen ve de las solicitudes que le atribuyen: nunca los
 *  datos de la familia o la persona, sólo referencia, tipo, estado y fecha. */
export const originClubRequestView = (row = {}) => ({
    publicRef: row.publicRef, type: row.type, typeLabel: PUBLIC_REQUEST_TYPES[row.type]?.label || row.type,
    status: row.status, statusLabel: REQUEST_STATES[row.status]?.label || row.status, receivedAt: row.createdAt,
});

export const DATA_CONSENT_TEXT = 'Autorizo el tratamiento de mis datos personales con la única finalidad de atender esta solicitud, de acuerdo con la política de tratamiento de datos del programa. Mis datos no se publican ni se usan para enviarme campañas sin mi consentimiento expreso.';
export const NEWSLETTER_CONSENT_TEXT = 'Acepto recibir novedades y comunicaciones del programa por correo electrónico. Puedo retirar este consentimiento en cualquier momento.';

// ─── Métricas ─────────────────────────────────────────────────────────

export const METRIC_KEYS = ['view', 'clinic_click', 'donation_click', 'form_orientacion', 'form_apoyo', 'form_club', 'form_novedades', 'resource_click'];
export const isMetricKey = (k) => METRIC_KEYS.includes(String(k || ''));
/** Un clic en «Donar» es una INTERACCIÓN, nunca una donación completada. */
export const METRIC_LABELS = {
    view: 'Visitas a la página', clinic_click: 'Clics hacia clínicas', donation_click: 'Clics en donar (interacción)',
    form_orientacion: 'Formularios: orientación', form_apoyo: 'Formularios: apoyo', form_club: 'Formularios: club', form_novedades: 'Formularios: novedades',
    resource_click: 'Clics en recursos',
};

export default {
    PROGRAM_STATES, PROGRAM_CATEGORIES, RELATION_TYPES, LINK_STATES, ACTIVATION_STATES, PROGRAM_ROLES, SECTIONS, CONTENT_KINDS,
    CHANGE_KINDS, OPERATIONS, SCOPE_TYPES, EDITORIAL_STATES, PUBLIC_REQUEST_TYPES, REQUEST_STATES, METRIC_KEYS,
    shapeProgram, validateProgramDraft, validateProgramForPublish, publicProgramView, shapeLink, validateLink, shapeActivation,
    shapeContent, validateContent, publicContentView, isPubliclyVisible, shapeChangeRequest, validateChangeRequest,
    shapePublicRequest, validatePublicRequest, shapeSubscriber, validateSubscriber, resolveEmbed, makeRef,
};
