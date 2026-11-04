// ════════════════════════════════════════════════════════════════════
// Programas — ESPEJO del criterio en el navegador — v4.1280.0
//
// Duplicado a propósito, como `governorVisitSpec.ts`: el servidor decide qué
// RESPONDE y éste decide qué se PINTA (rótulos, pasos, validación previa del
// formulario). ⚠️ SI CAMBIA `server/lib/programSpec.js`, CAMBIA ESTO. Lo
// comprueba `scripts/test-programas.mjs` comparando catálogos y validaciones.
// ════════════════════════════════════════════════════════════════════

export interface Labeled { id: string; label: string; help?: string }
export interface StateSpec { id: string; label: string; tone: string }

export const PROGRAM_STATES: Record<string, StateSpec> = {
    borrador: { id: 'borrador', label: 'Borrador', tone: 'amber' },
    activo: { id: 'activo', label: 'Activo', tone: 'emerald' },
    archivado: { id: 'archivado', label: 'Archivado', tone: 'gray' },
};
export const PROGRAM_CATEGORIES: Labeled[] = [
    { id: 'salud', label: 'Salud' },
    { id: 'educacion', label: 'Educación' },
    { id: 'agua_saneamiento', label: 'Agua y saneamiento' },
    { id: 'paz', label: 'Paz y resolución de conflictos' },
    { id: 'desarrollo_economico', label: 'Desarrollo económico' },
    { id: 'medio_ambiente', label: 'Medio ambiente' },
    { id: 'comunidad', label: 'Comunidad' },
    { id: 'otro', label: 'Otro' },
];
export const RELATION_TYPES: Labeled[] = [
    { id: 'respaldo_institucional', label: 'Respaldo institucional' },
    { id: 'difusion', label: 'Difusión' },
    { id: 'apoyo_financiero', label: 'Apoyo financiero' },
    { id: 'otra', label: 'Otra relación (descrita)' },
];
export const LINK_STATES: Record<string, StateSpec> = {
    activa: { id: 'activa', label: 'Activa', tone: 'emerald' },
    pausada: { id: 'pausada', label: 'Pausada', tone: 'amber' },
    finalizada: { id: 'finalizada', label: 'Finalizada', tone: 'gray' },
};
export const ACTIVATION_STATES: Record<string, StateSpec> = {
    activa: { id: 'activa', label: 'Activa', tone: 'emerald' },
    inactiva: { id: 'inactiva', label: 'Inactiva', tone: 'gray' },
};
export const PROGRAM_ROLES: Labeled[] = [
    { id: 'coordinador', label: 'Coordinador del programa', help: 'Edita la información, aprueba y publica contenidos, gestiona responsables y clubes.' },
    { id: 'comunicaciones', label: 'Comunicaciones', help: 'Propone y publica historias, noticias, recursos y eventos. No aprueba contenido clínico.' },
    { id: 'revisor_medico', label: 'Revisor médico', help: 'Aprueba el contenido clasificado como información clínica o educativa que lo requiera.' },
    { id: 'gestor_solicitudes', label: 'Gestor de solicitudes', help: 'Atiende las solicitudes públicas (orientación, apoyo, clubes).' },
    { id: 'colaborador', label: 'Colaborador', help: 'Propone contenidos mediante el formato de gestión; no aprueba ni publica.' },
];
export interface SectionSpec { key: string; label: string; defaultEnabled: boolean; feeds: string | null }
export const SECTIONS: SectionSpec[] = [
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
export interface ContentKindSpec { id: string; label: string; plural: string; section: string; localAllowed: boolean }
export const CONTENT_KINDS: Record<string, ContentKindSpec> = {
    clinic: { id: 'clinic', label: 'Clínica o centro', plural: 'Clínicas y centros', section: 'clinicas', localAllowed: false },
    team: { id: 'team', label: 'Integrante del equipo', plural: 'Equipo y protagonistas', section: 'equipo', localAllowed: true },
    story: { id: 'story', label: 'Historia o testimonio', plural: 'Historias y testimonios', section: 'historias', localAllowed: true },
    resource: { id: 'resource', label: 'Recurso educativo', plural: 'Recursos educativos', section: 'familias', localAllowed: false },
    news: { id: 'news', label: 'Noticia o evento', plural: 'Noticias y eventos', section: 'noticias', localAllowed: true },
    indicator: { id: 'indicator', label: 'Indicador de impacto', plural: 'Indicadores de impacto', section: 'impacto', localAllowed: false },
    donation: { id: 'donation', label: 'Enlace de donación', plural: 'Enlaces y canales de donación', section: 'ayudar', localAllowed: false },
};
export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS);
export const CHANGE_KINDS: Labeled[] = [
    { id: 'info', label: 'Información institucional', help: 'Identidad, atención, participación o presentación del programa.' },
    ...CONTENT_KIND_IDS.map(k => ({ id: k, label: CONTENT_KINDS[k].label, help: '' })),
    { id: 'correction', label: 'Corrección de información', help: 'Un error puntual en algo ya publicado.' },
];
export const OPERATIONS: Labeled[] = [
    { id: 'crear', label: 'Crear' },
    { id: 'actualizar', label: 'Actualizar' },
    { id: 'retirar', label: 'Solicitar retiro' },
];
export const SCOPE_TYPES: Labeled[] = [
    { id: 'central', label: 'Contenido central' },
    { id: 'district', label: 'Contenido de una vinculación distrital' },
    { id: 'club', label: 'Contenido local de un club' },
];
export const EDITORIAL_STATES: Record<string, StateSpec> = {
    borrador: { id: 'borrador', label: 'Borrador', tone: 'gray' },
    enviado: { id: 'enviado', label: 'Enviado', tone: 'sky' },
    en_revision: { id: 'en_revision', label: 'En revisión', tone: 'amber' },
    ajustes: { id: 'ajustes', label: 'Ajustes solicitados', tone: 'orange' },
    aprobado: { id: 'aprobado', label: 'Aprobado', tone: 'emerald' },
    publicado: { id: 'publicado', label: 'Publicado', tone: 'blue' },
    archivado: { id: 'archivado', label: 'Archivado', tone: 'gray' },
};
const EDITORIAL_FLOW: Record<string, string[]> = {
    borrador: ['enviado', 'archivado'],
    enviado: ['en_revision', 'ajustes', 'aprobado', 'archivado'],
    en_revision: ['ajustes', 'aprobado', 'archivado', 'enviado'],
    ajustes: ['enviado', 'archivado'],
    aprobado: ['en_revision', 'archivado'],
    publicado: [],
    archivado: ['borrador'],
};
export const canTransitionRequest = (from: string, to: string) => Array.isArray(EDITORIAL_FLOW[from]) && EDITORIAL_FLOW[from].includes(to);
export const requestNeedsReason = (to: string) => ['ajustes', 'archivado'].includes(to);
export const PUBLIC_REQUEST_TYPES: Record<string, Labeled> = {
    orientacion: { id: 'orientacion', label: 'Necesito orientación' },
    apoyo: { id: 'apoyo', label: 'Quiero apoyar' },
    club: { id: 'club', label: 'Mi club quiere participar' },
};
export const REQUEST_STATES: Record<string, StateSpec> = {
    nueva: { id: 'nueva', label: 'Nueva', tone: 'sky' },
    asignada: { id: 'asignada', label: 'Asignada', tone: 'amber' },
    en_contacto: { id: 'en_contacto', label: 'En contacto', tone: 'blue' },
    derivada: { id: 'derivada', label: 'Derivada', tone: 'violet' },
    cerrada: { id: 'cerrada', label: 'Cerrada', tone: 'gray' },
};
export const SUPPORT_TYPES: Labeled[] = [
    { id: 'donacion', label: 'Aporte económico' },
    { id: 'especie', label: 'Aporte en especie' },
    { id: 'voluntariado', label: 'Voluntariado' },
    { id: 'empresa', label: 'Alianza empresarial' },
    { id: 'difusion', label: 'Difusión' },
    { id: 'otro', label: 'Otro' },
];
export const CLUB_PARTICIPATION_TYPES: Labeled[] = [
    { id: 'activar', label: 'Activar el programa en nuestro sitio' },
    { id: 'jornada', label: 'Organizar una jornada o actividad' },
    { id: 'recursos', label: 'Aportar recursos' },
    { id: 'difusion', label: 'Difundir en nuestra comunidad' },
    { id: 'otro', label: 'Otro' },
];
export const CONTACT_MEANS: Labeled[] = [
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'telefono', label: 'Llamada telefónica' },
    { id: 'correo', label: 'Correo electrónico' },
];
export const RESOURCE_TYPES: Labeled[] = [
    { id: 'documento', label: 'Documento' },
    { id: 'video', label: 'Video' },
    { id: 'audio', label: 'Audio' },
    { id: 'podcast', label: 'Podcast' },
    { id: 'enlace', label: 'Enlace' },
];
export const INDICATOR_MODES: Labeled[] = [
    { id: 'acumulado', label: 'Acumulado (desde el inicio)' },
    { id: 'periodo', label: 'Por período' },
];
export const PERMISSION_SCOPES: Labeled[] = [
    { id: 'programa', label: 'Sólo el programa' },
    { id: 'distrito', label: 'Programa y distrito' },
    { id: 'clubes', label: 'Programa, distrito y clubes participantes' },
];
export const PRIVATE_FILE_KINDS = ['autorizacion', 'documento_respaldo', 'recurso'];
export const PRIVATE_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const PRIVATE_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx';

export const TONE_CLASS: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
};
export const stateChip = (spec: Record<string, StateSpec>, id: string) => ({ label: spec[id]?.label || id, className: TONE_CLASS[spec[id]?.tone || 'gray'] });

export const DATA_CONSENT_TEXT = 'Autorizo el tratamiento de mis datos personales con la única finalidad de atender esta solicitud, de acuerdo con la política de tratamiento de datos del programa. Mis datos no se publican ni se usan para enviarme campañas sin mi consentimiento expreso.';
export const NEWSLETTER_CONSENT_TEXT = 'Acepto recibir novedades y comunicaciones del programa por correo electrónico. Puedo retirar este consentimiento en cualquier momento.';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const phoneOk = (p: string) => { const n = String(p || '').replace(/\D/g, ''); return n.length >= 7 && n.length <= 15; };

export interface FieldError { field: string; message: string; step?: number }

/** Validación previa de los formularios públicos (el servidor repite la misma). */
export const validatePublicRequest = (type: string, d: Record<string, any>): FieldError[] => {
    const errors: FieldError[] = [];
    const e = (field: string, message: string) => errors.push({ field, message });
    if (type === 'orientacion') {
        if (String(d.adultName || '').trim().length < 3) e('adultName', 'Escribe el nombre del adulto responsable.');
        if (!String(d.city || '').trim() && !String(d.region || '').trim()) e('city', 'Indica la ciudad o el departamento.');
        if (!d.contactMeans) e('contactMeans', 'Elige por qué medio prefieres que te contacten.');
        if (d.contactMeans === 'correo' && !EMAIL_RE.test(String(d.email || ''))) e('email', 'Escribe un correo válido.');
        if ((d.contactMeans === 'whatsapp' || d.contactMeans === 'telefono') && !phoneOk(d.phone)) e('phone', 'Escribe un número de teléfono válido.');
        if (String(d.reason || '').trim().length < 10) e('reason', 'Cuéntanos brevemente el motivo general (sin datos médicos detallados).');
    } else if (type === 'apoyo') {
        if (String(d.contactName || '').trim().length < 3) e('contactName', 'Escribe el nombre de contacto.');
        if (d.entityKind === 'empresa' && !String(d.organization || '').trim()) e('organization', 'Indica el nombre de la empresa.');
        if (!EMAIL_RE.test(String(d.email || '')) && !phoneOk(d.phone)) e('email', 'Indica un correo o un teléfono de contacto.');
        if (!d.supportType) e('supportType', 'Elige el tipo de apoyo.');
    } else if (type === 'club') {
        if (String(d.clubName || '').trim().length < 3) e('clubName', 'Indica el club.');
        if (!(Number(d.districtNumber) > 0)) e('districtNumber', 'Indica el distrito.');
        if (String(d.responsibleName || '').trim().length < 3) e('responsibleName', 'Escribe el nombre del responsable.');
        if (!EMAIL_RE.test(String(d.email || '')) && !phoneOk(d.phone)) e('email', 'Indica un correo o un teléfono de contacto.');
        if (!d.participationType) e('participationType', 'Elige el tipo de participación.');
    }
    if (d.dataConsent !== true) e('dataConsent', 'Autoriza el tratamiento de tus datos para poder enviar la solicitud.');
    return errors;
};

export const validateSubscriber = (d: Record<string, any>): FieldError[] => {
    const errors: FieldError[] = [];
    if (String(d.name || '').trim().length < 2) errors.push({ field: 'name', message: 'Escribe tu nombre.' });
    if (!EMAIL_RE.test(String(d.email || ''))) errors.push({ field: 'email', message: 'Escribe un correo válido.' });
    if (d.newsletterConsent !== true) errors.push({ field: 'newsletterConsent', message: 'Acepta recibir comunicaciones del programa para suscribirte.' });
    return errors;
};

/** Validación por paso del formato «Gestión de contenidos» (espejo de `validateChangeRequest`). */
export const validateChangeRequestStep = (r: Record<string, any>, { submit = true } = {}): FieldError[] => {
    const errors: FieldError[] = [];
    const push = (step: number, field: string, message: string) => errors.push({ step, field, message });
    const p = r.payload || {};
    if (!r.kind) push(1, 'kind', 'Elige qué deseas gestionar.');
    if (String(r.title || '').trim().length < 5) push(2, 'title', 'Escribe un título o asunto (mínimo 5 caracteres).');
    if (!submit) return errors;
    if (r.operation !== 'crear' && !r.contentId && r.kind !== 'info' && r.kind !== 'correction') push(1, 'contentId', 'Indica qué registro deseas modificar o retirar.');
    if (r.scopeType === 'district' && !(Number(r.districtNumber) > 0)) push(1, 'districtNumber', 'Indica el distrito de la vinculación.');
    if (r.scopeType === 'club' && !r.clubActivationId) push(1, 'clubActivationId', 'Indica el club.');
    if (r.scopeType === 'club' && CONTENT_KINDS[r.kind] && !CONTENT_KINDS[r.kind].localAllowed) push(1, 'kind', `Un club no puede agregar «${CONTENT_KINDS[r.kind].label}» como contenido local: propónlo como contenido central.`);
    if (r.scopeType === 'club' && r.kind === 'info') push(1, 'kind', 'La información institucional es contenido central: un club no la modifica.');
    if (r.operation === 'retirar') {
        if (String(p.reason || '').trim().length < 10) push(2, 'payload.reason', 'Explica por qué se retira el registro.');
    } else if (r.kind === 'clinic') {
        if (String(p.name || '').trim().length < 3) push(2, 'payload.name', 'Escribe el nombre de la clínica o centro.');
        if (!String(p.city || '').trim()) push(2, 'payload.city', 'Indica la ciudad.');
        if (!String(p.region || '').trim()) push(2, 'payload.region', 'Indica el departamento o región.');
        if (p.email && !EMAIL_RE.test(String(p.email))) push(2, 'payload.email', 'Revisa el correo público.');
        if (!p.verifiedAt || !String(p.verifiedBy || '').trim()) push(2, 'payload.verifiedAt', 'Registra fecha y responsable de la verificación de los datos.');
    } else if (r.kind === 'team') {
        if (String(p.name || '').trim().length < 3) push(2, 'payload.name', 'Escribe el nombre de la persona.');
        if (!String(p.role || '').trim()) push(2, 'payload.role', 'Indica su rol.');
        if (p.photoUrl && !String(p.photoAlt || '').trim()) push(2, 'payload.photoAlt', 'Escribe el texto alternativo de la fotografía.');
    } else if (r.kind === 'story') {
        if (String(p.title || '').trim().length < 5) push(2, 'payload.title', 'Escribe un título (mínimo 5 caracteres).');
        if (String(p.summary || '').trim().length < 20) push(2, 'payload.summary', 'Escribe un resumen (mínimo 20 caracteres).');
        if ((p.media || []).some((m: any) => m.kind !== 'embed' && !String(m.alt || '').trim())) push(2, 'payload.media', 'Cada imagen necesita texto alternativo.');
    } else if (r.kind === 'resource') {
        if (String(p.title || '').trim().length < 3) push(2, 'payload.title', 'Escribe el título del recurso.');
        if (!String(p.url || '').trim() && !p.fileId) push(2, 'payload.url', 'Adjunta un archivo o indica la URL del recurso.');
        if (['video', 'podcast', 'audio'].includes(p.type) && p.url && !resolveEmbed(p.url)) push(2, 'payload.url', 'Sólo se embeben enlaces de YouTube, Vimeo o Spotify. Otros enlaces se muestran como enlace externo: cambia el tipo a «Enlace».');
        if (!String(p.source || '').trim()) push(2, 'payload.source', 'Indica la fuente del recurso.');
    } else if (r.kind === 'news') {
        if (String(p.title || '').trim().length < 5) push(2, 'payload.title', 'Escribe el título.');
        if (p.type === 'evento' && !p.date) push(2, 'payload.date', 'Un evento necesita fecha.');
        if (p.imageUrl && !String(p.imageAlt || '').trim()) push(2, 'payload.imageAlt', 'Escribe el texto alternativo de la imagen.');
    } else if (r.kind === 'indicator') {
        if (String(p.name || '').trim().length < 3) push(2, 'payload.name', 'Escribe el nombre del indicador.');
        if (!String(p.definition || '').trim()) push(2, 'payload.definition', 'Escribe la definición: qué mide y cómo.');
        if (!String(p.value || '').trim()) push(2, 'payload.value', 'Indica el valor.');
        if (!String(p.period || '').trim()) push(2, 'payload.period', 'Indica el período al que corresponde.');
        if (!String(p.source || '').trim()) push(2, 'payload.source', 'Indica la fuente del dato.');
        if (!String(p.validatedBy || '').trim()) push(2, 'payload.validatedBy', 'Indica quién validó el dato.');
        if (!p.updatedOn) push(2, 'payload.updatedOn', 'Indica la fecha de actualización.');
    } else if (r.kind === 'donation') {
        if (!String(p.buttonLabel || '').trim()) push(2, 'payload.buttonLabel', 'Escribe el texto del botón.');
        if (!String(p.url || '').trim()) push(2, 'payload.url', 'Indica la URL oficial del canal de donación.');
        if (!String(p.receiver || '').trim()) push(2, 'payload.receiver', 'Indica la entidad que recibe y administra el aporte.');
        if (!String(p.purpose || '').trim()) push(2, 'payload.purpose', 'Indica el destino o finalidad informada del aporte.');
    } else if (r.kind === 'correction') {
        if (!String(p.proposed || '').trim()) push(2, 'payload.proposed', 'Escribe el texto corregido.');
    } else if (r.kind === 'info') {
        if (!Object.keys(p).some(k => k !== 'clinical')) push(2, 'payload', 'Indica qué bloque de información cambia (identidad, atención, participación o gobernanza).');
    }
    if (String(r.responsibleName || '').trim().length < 3) push(3, 'responsibleName', 'Escribe el nombre de la persona responsable.');
    if (!EMAIL_RE.test(String(r.responsibleEmail || ''))) push(3, 'responsibleEmail', 'Escribe un correo válido.');
    const a = r.authorizations || {};
    if ((r.kind === 'story' || r.kind === 'team') && r.operation !== 'retirar' && a.imageRights !== true) push(3, 'authorizations.imageRights', 'Confirma que cuentas con la autorización de las personas que aparecen.');
    if (r.kind === 'story' && r.operation !== 'retirar' && a.dataConsent !== true) push(3, 'authorizations.dataConsent', 'Confirma el consentimiento para el tratamiento de los datos de quienes aparecen.');
    if ((r.kind === 'indicator' || r.kind === 'donation' || r.kind === 'clinic') && r.operation !== 'retirar' && a.sourceVerified !== true) push(3, 'authorizations.sourceVerified', 'Confirma que la fuente fue verificada.');
    return errors;
};

export interface Embed { provider: 'youtube' | 'spotify' | 'vimeo'; id: string; src: string; aspect: string; type?: string }

/** YouTube, Spotify y Vimeo a un `src` de lista cerrada. `null` = no se embebe. */
export const resolveEmbed = (raw: unknown): Embed | null => {
    const value = String(raw ?? '').trim();
    if (!value) return null;
    let u: URL;
    try { u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { return null; }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
    const id = (s: string) => (/^[A-Za-z0-9_-]{6,64}$/.test(s || '') ? s : '');
    if (host === 'youtu.be') {
        const v = id(u.pathname.slice(1).split('/')[0]);
        return v ? { provider: 'youtube', id: v, src: `https://www.youtube-nocookie.com/embed/${v}?rel=0&modestbranding=1&playsinline=1`, aspect: '16/9' } : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        let v = id(u.searchParams.get('v') || '');
        if (!v) { const m = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,64})/.exec(u.pathname); v = m ? m[1] : ''; }
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

export const slugify = (v: string) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** «2026-11-04» → «4 nov 2026», sin `new Date()` (en Colombia retrocedería un día). */
export const dateLabel = (iso?: string | null) => {
    const s = String(iso || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return '';
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${Number(m[3])} ${meses[Number(m[2]) - 1]} ${m[1]}`;
};
export const dateTimeLabel = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};
export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
