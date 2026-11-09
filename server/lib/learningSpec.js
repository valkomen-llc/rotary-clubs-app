// ════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones (LMS) — el CRITERIO, puro — v4.1302.0
//
// Sin base, sin red, sin Express: lo importa el controlador y lo importa la
// prueba. Aquí vive lo que decide:
//   · los estados de un curso y quién puede moverlo a cuál;
//   · las modalidades de acceso y quién pasa por cada una;
//   · qué archivos admite cada uso y con qué tope;
//   · cuándo un curso está LISTO para enviarse a revisión (y qué le falta,
//     con nombres, no con porcentajes inventados);
//   · la configuración administrable y sus valores por omisión.
//
// Lo que el navegador pinta (`src/lib/learningSpec.ts`) es un espejo de
// rótulos: no decide nada.
// ════════════════════════════════════════════════════════════════════
import { INTAKE_FORMATS, sniffIntakeFile, fileExtension } from './programIntakeSpec.js';

// ─── Estados del curso ────────────────────────────────────────────────
// `status` es el estado del FLUJO. «Borrador», «Incompleto» y «Listo para
// enviar» son tres lecturas del mismo `draft`, derivadas de lo que el curso
// tiene (ver `displayStatusOf`): así nunca se desincronizan.
export const COURSE_STATES = {
    draft: { label: 'Borrador', tone: 'gray' },
    in_review: { label: 'En revisión', tone: 'blue' },
    changes_requested: { label: 'Requiere correcciones', tone: 'amber' },
    approved: { label: 'Aprobado', tone: 'emerald' },
    published: { label: 'Publicado', tone: 'green' },
    archived: { label: 'Archivado', tone: 'slate' },
};
export const COURSE_STATE_IDS = Object.keys(COURSE_STATES);

export const DISPLAY_STATES = {
    borrador: { label: 'Borrador', tone: 'gray' },
    incompleto: { label: 'Incompleto', tone: 'amber' },
    listo: { label: 'Listo para enviar', tone: 'sky' },
    in_review: COURSE_STATES.in_review,
    changes_requested: COURSE_STATES.changes_requested,
    approved: COURSE_STATES.approved,
    published: COURSE_STATES.published,
    archived: COURSE_STATES.archived,
};

/** Lo que el CLUB puede hacer con su curso. */
export const CLUB_TRANSITIONS = {
    draft: ['in_review', 'archived'],
    changes_requested: ['in_review', 'archived'],
    in_review: ['draft'],            // retirar de la revisión
    approved: [],                    // en manos del comité: se pide despublicar/devolver
    published: [],
    archived: ['draft'],             // restaurar
};
/** Lo que el COMITÉ puede hacer. Publicar exige haber aprobado antes. */
export const ADMIN_TRANSITIONS = {
    draft: ['archived'],
    in_review: ['approved', 'changes_requested'],
    changes_requested: ['archived'],
    approved: ['published', 'changes_requested', 'archived'],
    published: ['approved', 'archived'],   // approved = despublicado, sigue aprobado
    archived: ['draft'],
};
/** Transiciones que EXIGEN motivo (el club lo lee en su ficha). */
export const NOTE_REQUIRED = new Set(['changes_requested']);
/** En qué estados el club edita ficha y contenido. */
export const CLUB_EDITABLE = ['draft', 'changes_requested'];
export const canTransition = (table, from, to) => Array.isArray(table[from]) && table[from].includes(to);

export const COLLECTION_STATES = {
    active: { label: 'Activa', tone: 'green' },
    archived: { label: 'Archivada', tone: 'slate' },
};

// ─── Catálogos ───────────────────────────────────────────────────────
export const ACCESS_MODES = {
    public: { label: 'Público', help: 'Cualquier persona con el enlace puede verlo.' },
    registered: { label: 'Solo usuarios registrados', help: 'Hay que iniciar sesión en la plataforma (cuenta del panel o del portal de eventos).' },
    rotarians: { label: 'Solo rotarios autorizados', help: 'Hay que iniciar sesión con una cuenta del panel de un club o distrito.' },
    private: { label: 'Privado por invitación', help: 'Solo con el enlace de invitación que genera el club.' },
};
export const ACCESS_MODE_IDS = Object.keys(ACCESS_MODES);

export const AUDIENCES = {
    comunidad: 'Comunidad en general',
    rotarios: 'Rotarios',
    clubes: 'Clubes rotarios',
    jovenes: 'Jóvenes',
    docentes: 'Docentes',
    beneficiarios: 'Beneficiarios de proyectos',
    otro: 'Otro',
};
export const AUDIENCE_IDS = Object.keys(AUDIENCES);

export const LEVELS = { basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' };
export const LEVEL_IDS = Object.keys(LEVELS);

export const LANGUAGES = { es: 'Español', en: 'Inglés', pt: 'Portugués', otro: 'Otro' };

/** Las siete áreas de interés de Rotary (mismos slugs que Rotary en Acción). */
export const AREAS = {
    paz: 'Paz y prevención de conflictos',
    enfermedades: 'Prevención y tratamiento de enfermedades',
    agua: 'Agua, saneamiento e higiene',
    'salud-materna': 'Salud materno-infantil',
    educacion: 'Alfabetización y educación básica',
    'desarrollo-economico': 'Desarrollo económico e integral',
    'medio-ambiente': 'Medio ambiente',
};

/** Funciones del LMS que el club puede PEDIR. Sólo `progress` se activa en
 *  Fase 2; las demás se registran como preferencia. Nunca se promete lo que
 *  no existe: `available` dice la verdad en el formulario. */
export const LMS_FEATURES = {
    progress: { label: 'Seguimiento de progreso', available: false, phase: 2 },
    assessment: { label: 'Evaluación final', available: false, phase: 3 },
    certificate: { label: 'Certificado de participación', available: false, phase: 3 },
};

// ─── Archivos ────────────────────────────────────────────────────────
// Imágenes de presentación: PÚBLICAS desde que se suben (se verán en la
// biblioteca); el resto es PRIVADO y se sirve con enlace firmado según la
// modalidad de acceso.
export const FILE_PURPOSES = {
    cover: { label: 'Imagen de portada', exts: ['jpg', 'jpeg', 'png', 'webp'], visibility: 'public', kind: 'image' },
    thumbnail: { label: 'Miniatura', exts: ['jpg', 'jpeg', 'png', 'webp'], visibility: 'public', kind: 'image' },
    instructor: { label: 'Imagen del instructor', exts: ['jpg', 'jpeg', 'png', 'webp'], visibility: 'public', kind: 'image' },
    collection_cover: { label: 'Portada de la colección', exts: ['jpg', 'jpeg', 'png', 'webp'], visibility: 'public', kind: 'image' },
    intro_video: { label: 'Video introductorio', exts: ['mp4', 'm4v', 'mov', 'webm'], visibility: 'private', kind: 'video' },
    lesson_video: { label: 'Video de la lección', exts: ['mp4', 'm4v', 'mov', 'webm'], visibility: 'private', kind: 'video' },
    lesson_audio: { label: 'Audio de la lección', exts: ['mp3', 'm4a', 'wav', 'ogg'], visibility: 'private', kind: 'audio' },
    document: { label: 'Documento', exts: ['pdf', 'docx', 'doc', 'pptx', 'xlsx'], visibility: 'private', kind: 'document' },
    resource: { label: 'Recurso descargable', exts: ['pdf', 'docx', 'doc', 'pptx', 'xlsx', 'jpg', 'jpeg', 'png', 'webp', 'mp3', 'm4a', 'zip'], visibility: 'private', kind: 'mixed' },
};
export const FILE_PURPOSE_IDS = Object.keys(FILE_PURPOSES);
export const PUBLIC_PURPOSES = FILE_PURPOSE_IDS.filter(p => FILE_PURPOSES[p].visibility === 'public');

const mb = (envName, fallback) => {
    const n = Number.parseInt(process.env[envName] || '', 10);
    return (Number.isFinite(n) && n > 0 ? n : fallback) * 1024 * 1024;
};
/** Topes por tipo, configurables por entorno. El navegador sube DIRECTO a
 *  S3 (Vercel corta el cuerpo en 4,5 MB): un PUT único hasta 64 MB; más,
 *  carga multiparte por partes de 16 MB, reanudable. */
export const learningLimits = () => ({
    image: mb('LEARNING_IMAGE_MB', 25),
    video: mb('LEARNING_VIDEO_MB', 4096),
    audio: mb('LEARNING_AUDIO_MB', 300),
    document: mb('LEARNING_DOCUMENT_MB', 200),
    design: mb('LEARNING_RESOURCE_MB', 500),
    filesPerCourse: Number.parseInt(process.env.LEARNING_MAX_FILES_PER_COURSE || '', 10) || 200,
    multipartThreshold: 64 * 1024 * 1024,
    partSize: 16 * 1024 * 1024,
});

export const fmtSize = (bytes) => {
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(n % 1024 ** 3 ? 1 : 0)} GB`;
    if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
};

/** Lo declarado ANTES de subir. El contenido real se mira al completar. */
export const checkLearningFile = ({ filename, size, purpose }, limits = learningLimits()) => {
    const errores = [];
    const ext = fileExtension(filename);
    const p = FILE_PURPOSES[purpose];
    const fmt = INTAKE_FORMATS[ext];
    if (!p) errores.push('Indica para qué es el archivo.');
    else if (!fmt || !p.exts.includes(ext)) errores.push(`Formato no admitido para «${p.label}». Se acepta: ${p.exts.map(e => e.toUpperCase()).join(', ')}.`);
    const bytes = Number(size) || 0;
    if (bytes <= 0) errores.push('El archivo llegó vacío.');
    const max = fmt ? (limits[fmt.kind] || limits.design) : 0;
    if (fmt && bytes > max) {
        errores.push(fmt.kind === 'video' || fmt.kind === 'audio'
            ? `El archivo supera ${fmtSize(max)}. Para materiales más grandes, comparte un enlace (YouTube, Vimeo o similar).`
            : `El archivo supera ${fmtSize(max)}.`);
    }
    return {
        ok: errores.length === 0, errores,
        ext: fmt ? ext : null, kind: fmt?.kind || null, mime: fmt?.mime || null,
        visibility: p?.visibility || 'private',
        multipart: bytes > limits.multipartThreshold,
    };
};
export const sniffLearningFile = sniffIntakeFile;
export const LEARNING_FORMATS = INTAKE_FORMATS;

// ─── Enlaces externos ────────────────────────────────────────────────
/** Un enlace externo se acepta sólo con http(s) y sin credenciales. */
export const checkExternalUrl = (value) => {
    const v = String(value || '').trim();
    if (!v) return { ok: false, error: 'Escribe el enlace.' };
    let u;
    try { u = new URL(v); } catch { return { ok: false, error: 'El enlace no es válido (debe empezar por https://).' }; }
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, error: 'Solo se admiten enlaces http(s).' };
    if (u.username || u.password) return { ok: false, error: 'El enlace no puede llevar usuario ni contraseña.' };
    return { ok: true, url: u.toString() };
};

/** Un video externo reproducible embebido: YouTube o Vimeo. Lo demás se abre en pestaña nueva. */
export const embedFor = (url) => {
    const v = String(url || '');
    let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(v);
    if (m) return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${m[1]}` };
    m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(v);
    if (m) return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${m[1]}` };
    return null;
};

// ─── Texto ───────────────────────────────────────────────────────────
export const slugify = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'curso';

export const clampText = (v, max) => (v === undefined || v === null) ? undefined : String(v).slice(0, max);
export const asArray = (v, allowed, max = 12) => {
    if (!Array.isArray(v)) return undefined;
    const out = [];
    for (const x of v) { const s = String(x || '').trim().slice(0, 60); if (s && (!allowed || allowed.includes(s)) && !out.includes(s)) out.push(s); }
    return out.slice(0, max);
};
export const asInt = (v, { min = 0, max = 100000 } = {}) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(max, Math.max(min, n));
};

// ─── Campos editables (lo que el PATCH acepta; lo demás se ignora) ───
export const COLLECTION_FIELDS = {
    name: { max: 160 }, description: { max: 4000 }, projectRef: { max: 80 }, projectFairSubmissionId: { max: 80 },
    audience: { array: AUDIENCE_IDS }, coverUrl: { max: 600 }, accessMode: { enum: ACCESS_MODE_IDS }, areaFocus: { enum: Object.keys(AREAS) },
    ownerClubName: { max: 160 },
};
export const COURSE_FIELDS = {
    title: { max: 160 }, subtitle: { max: 200 }, shortDescription: { max: 400 }, fullDescription: { max: 12000 },
    learningObjective: { max: 2000 }, audience: { array: AUDIENCE_IDS }, level: { enum: LEVEL_IDS }, language: { enum: Object.keys(LANGUAGES) },
    durationMinutes: { int: { min: 0, max: 100000 } }, durationAuto: { bool: true },
    instructorName: { max: 160 }, instructorBio: { max: 2000 }, instructorImageUrl: { max: 600 },
    organization: { max: 200 }, projectRef: { max: 80 }, tags: { array: null, max: 20 }, areaFocus: { enum: Object.keys(AREAS) },
    coverUrl: { max: 600 }, thumbnailUrl: { max: 600 }, introVideoFileId: { max: 80 }, introVideoUrl: { max: 600 },
    accessMode: { enum: ACCESS_MODE_IDS }, features: { json: true }, rightsAccepted: { bool: true },
};
export const MODULE_FIELDS = { title: { max: 160 }, description: { max: 2000 } };
export const LESSON_FIELDS = {
    title: { max: 160 }, description: { max: 2000 }, body: { max: 30000 }, videoFileId: { max: 80 }, videoUrl: { max: 600 },
    audioFileId: { max: 80 }, durationMinutes: { int: { min: 0, max: 100000 } }, moduleId: { max: 80, nullable: true },
};
export const RESOURCE_FIELDS = { title: { max: 160 }, description: { max: 1000 }, url: { max: 600 }, fileId: { max: 80 }, lessonId: { max: 80, nullable: true } };

/** Aplica un PATCH según su tabla de campos. Devuelve `{ values, errors }`. */
export const sanitizePatch = (body, FIELDS) => {
    const values = {}; const errors = [];
    for (const [k, rule] of Object.entries(FIELDS)) {
        if (!(k in (body || {}))) continue;
        const v = body[k];
        if (rule.nullable && (v === null || v === '')) { values[k] = null; continue; }
        if (rule.enum) { if (v === '' || v === null) { values[k] = null; continue; } if (!rule.enum.includes(v)) { errors.push({ field: k, message: 'Valor no admitido.' }); continue; } values[k] = v; continue; }
        if (rule.array !== undefined) { const a = asArray(v, rule.array, rule.max || 12); if (a) values[k] = a; continue; }
        if (rule.int) { const n = asInt(v, rule.int); values[k] = n === undefined ? null : n; continue; }
        if (rule.bool) { values[k] = Boolean(v); continue; }
        if (rule.json) { values[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; continue; }
        if (k.endsWith('Url') && v) { const c = checkExternalUrl(v); if (!c.ok) { errors.push({ field: k, message: c.error }); continue; } values[k] = c.url.slice(0, rule.max); continue; }
        values[k] = v === null ? null : clampText(v, rule.max);
    }
    return { values, errors };
};

// ─── Preparación para enviar ─────────────────────────────────────────
export const lessonHasContent = (lesson, filesById = {}, resources = []) => {
    if (!lesson) return false;
    if (lesson.videoUrl) return true;
    if (lesson.videoFileId && filesById[lesson.videoFileId]?.status === 'ready') return true;
    if (lesson.audioFileId && filesById[lesson.audioFileId]?.status === 'ready') return true;
    if (String(lesson.body || '').trim().length >= 40) return true;
    return resources.some(r => r.lessonId === lesson.id && (r.url || (r.fileId && filesById[r.fileId]?.status === 'ready')));
};

/**
 * ¿Qué le falta al curso para poder enviarse? Lista NOMINAL: lo que falta se
 * dice con su nombre. `warnings` recomienda sin bloquear.
 */
export const readinessOf = (course, { lessons = [], resources = [], files = [] } = {}, config = normalizeConfig()) => {
    const filesById = Object.fromEntries(files.map(f => [f.id, f]));
    const missing = []; const warnings = [];
    const req = [];
    req.push({ key: 'title', label: 'Título del curso', ok: String(course?.title || '').trim().length >= 4 });
    req.push({ key: 'shortDescription', label: 'Descripción breve (mínimo 20 caracteres)', ok: String(course?.shortDescription || '').trim().length >= 20 });
    req.push({ key: 'lesson', label: 'Al menos una lección con contenido (video, texto o documento)', ok: lessons.some(l => lessonHasContent(l, filesById, resources)) });
    req.push({ key: 'accessMode', label: 'Modalidad de acceso', ok: ACCESS_MODE_IDS.includes(course?.accessMode) });
    if (config.requireRights) req.push({ key: 'rights', label: 'Declaración de derechos de autor y autorizaciones', ok: Boolean(course?.rightsAccepted) });
    for (const r of req) if (!r.ok) missing.push({ key: r.key, label: r.label });
    if (!course?.coverUrl) warnings.push('Sin imagen de portada: se recomienda una horizontal 16:9.');
    if (!String(course?.fullDescription || '').trim()) warnings.push('Sin descripción completa.');
    if (!String(course?.learningObjective || '').trim()) warnings.push('Sin objetivo de aprendizaje.');
    if (!String(course?.instructorName || '').trim()) warnings.push('Sin instructor o facilitador.');
    if (!durationOf(course, lessons)) warnings.push('Sin duración estimada.');
    const uploading = files.filter(f => f.status === 'uploading' && !isUploadStale(f)).length;
    if (uploading) warnings.push(`${uploading} archivo(s) todavía en carga.`);
    return { ready: missing.length === 0, missing, warnings, requirements: req, done: req.filter(r => r.ok).length, total: req.length };
};

export const durationOf = (course, lessons = []) => {
    const auto = course?.durationAuto !== false;
    const sum = lessons.reduce((a, l) => a + (Number(l.durationMinutes) || 0), 0);
    if (auto && sum > 0) return sum;
    return Number(course?.durationMinutes) || sum || 0;
};

/** «Borrador» = sólo el título (y el acceso por omisión); «Incompleto» = se
 *  empezó a llenar algo más; «Listo» = cumple todo. Nunca un porcentaje. */
export const displayStatusOf = (course, readiness) => {
    if (!course) return 'borrador';
    if (course.status !== 'draft') return course.status;
    if (readiness?.ready) return 'listo';
    const avanzados = (readiness?.requirements || []).filter(r => r.ok && r.key !== 'accessMode' && r.key !== 'title').length;
    return avanzados > 0 ? 'incompleto' : 'borrador';
};

/** Una carga «uploading» más vieja que esto se considera abandonada: no bloquea el envío. */
export const UPLOAD_STALE_MS = 60 * 60 * 1000;
export const isUploadStale = (file, now = Date.now()) => file?.status === 'uploading' && (now - new Date(file.createdAt || 0).getTime()) > UPLOAD_STALE_MS;

// ─── Acceso a un curso publicado ─────────────────────────────────────
/**
 * `viewer`: { platform: bool, attendee: bool, owner: bool, admin: bool }.
 * `invite`: el token que llegó por la URL. Devuelve `{ allowed, reason }`.
 */
export const accessDecision = ({ accessMode, inviteToken }, viewer = {}, invite = '') => {
    if (viewer.owner || viewer.admin) return { allowed: true, reason: 'owner' };
    switch (accessMode) {
        case 'public': return { allowed: true, reason: 'public' };
        case 'registered': return viewer.platform || viewer.attendee ? { allowed: true, reason: 'registered' } : { allowed: false, reason: 'login' };
        case 'rotarians': return viewer.platform ? { allowed: true, reason: 'rotarian' } : { allowed: false, reason: 'rotarian_login' };
        case 'private': return inviteToken && invite && invite === inviteToken ? { allowed: true, reason: 'invite' } : { allowed: false, reason: 'invite' };
        default: return { allowed: false, reason: 'unknown' };
    }
};
export const ACCESS_DENIED_TEXT = {
    login: 'Este curso es para usuarios registrados. Inicia sesión para verlo.',
    rotarian_login: 'Este curso es exclusivo para rotarios. Inicia sesión con tu cuenta del panel.',
    invite: 'Este curso es privado: necesitas el enlace de invitación del club.',
    unknown: 'No es posible abrir este curso.',
};

// ─── Configuración administrable ─────────────────────────────────────
export const DEFAULT_RIGHTS_TEXT = 'Declaro que el club cuenta con los derechos de autor o las licencias necesarias sobre los videos, documentos e imágenes de este curso, y con las autorizaciones de uso de imagen de las personas que aparecen en ellos, y autorizo su publicación en el ecosistema digital del Distrito conforme a la Política de Privacidad aplicable.';
export const DEFAULT_CONFIG = {
    enabled: true,
    maxCoursesPerCollection: 0,          // 0 = sin tope
    requireRights: true,
    rightsText: DEFAULT_RIGHTS_TEXT,
    allowExternalVideo: true,
    autoPublishOnApprove: false,         // aprobar NO publica: son dos decisiones
    categories: ['Seguridad alimentaria', 'Salud', 'Educación', 'Medio ambiente', 'Liderazgo', 'Gestión de proyectos', 'Fundación Rotaria'],
    notifyEmails: [],
    libraryIntro: 'Cursos y capacitaciones que los clubes del distrito ponen al servicio de la comunidad.',
};
export const normalizeConfig = (raw = {}) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const cats = Array.isArray(r.categories) ? r.categories.map(c => String(c || '').trim().slice(0, 60)).filter(Boolean).slice(0, 60) : DEFAULT_CONFIG.categories;
    return {
        enabled: r.enabled !== false,
        maxCoursesPerCollection: Math.max(0, Math.min(500, Number.parseInt(r.maxCoursesPerCollection, 10) || 0)),
        requireRights: r.requireRights !== false,
        rightsText: String(r.rightsText || DEFAULT_RIGHTS_TEXT).slice(0, 2000),
        allowExternalVideo: r.allowExternalVideo !== false,
        autoPublishOnApprove: r.autoPublishOnApprove === true,
        categories: cats,
        notifyEmails: Array.isArray(r.notifyEmails) ? r.notifyEmails.map(e => String(e || '').trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)).slice(0, 20) : [],
        libraryIntro: String(r.libraryIntro || DEFAULT_CONFIG.libraryIntro).slice(0, 600),
    };
};

/** Resumen público de una colección/curso para tarjetas (sin datos del remitente). */
export const publicCourseCard = (c, extra = {}) => ({
    id: c.id, slug: c.slug, title: c.title, subtitle: c.subtitle || '', shortDescription: c.shortDescription || '',
    coverUrl: c.coverUrl || c.thumbnailUrl || '', thumbnailUrl: c.thumbnailUrl || c.coverUrl || '',
    level: c.level || '', levelLabel: LEVELS[c.level] || '', language: c.language || '', areaFocus: c.areaFocus || '', areaLabel: AREAS[c.areaFocus] || '',
    accessMode: c.accessMode || 'public', accessLabel: ACCESS_MODES[c.accessMode]?.label || '',
    audience: Array.isArray(c.audience) ? c.audience : [], tags: Array.isArray(c.tags) ? c.tags : [],
    instructorName: c.instructorName || '', durationMinutes: extra.durationMinutes ?? (Number(c.durationMinutes) || 0),
    lessonCount: extra.lessonCount ?? 0, ownerClubName: c.ownerClubName || '', projectRef: c.projectRef || '',
    collectionSlug: extra.collectionSlug || null, collectionName: extra.collectionName || null, publishedAt: c.publishedAt || null,
});

export default {
    COURSE_STATES, COURSE_STATE_IDS, DISPLAY_STATES, CLUB_TRANSITIONS, ADMIN_TRANSITIONS, NOTE_REQUIRED, CLUB_EDITABLE, canTransition,
    COLLECTION_STATES, ACCESS_MODES, ACCESS_MODE_IDS, AUDIENCES, AUDIENCE_IDS, LEVELS, LEVEL_IDS, LANGUAGES, AREAS, LMS_FEATURES,
    FILE_PURPOSES, FILE_PURPOSE_IDS, PUBLIC_PURPOSES, learningLimits, fmtSize, checkLearningFile, sniffLearningFile, LEARNING_FORMATS,
    checkExternalUrl, embedFor, slugify, sanitizePatch, COLLECTION_FIELDS, COURSE_FIELDS, MODULE_FIELDS, LESSON_FIELDS, RESOURCE_FIELDS,
    lessonHasContent, readinessOf, durationOf, displayStatusOf, UPLOAD_STALE_MS, isUploadStale, accessDecision, ACCESS_DENIED_TEXT, DEFAULT_CONFIG, normalizeConfig, publicCourseCard,
};
