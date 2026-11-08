// ════════════════════════════════════════════════════════════════════
// Videos de proyectos — el video PROPIO del club, el criterio puro (v4.1298.0)
// Feria de Proyectos Rotary Colombia
//
// La modalidad A: el club YA tiene un video de su proyecto y lo sube para
// que el comité lo revise. Sin producción, sin plan, sin Stripe. Convive con
// el Video Pitch Profesional (modalidad B, `videoPitchSpec.js`) sobre la
// misma postulación, con estados, archivos y tablas INDEPENDIENTES.
//
// Acá vive todo lo que decide el módulo sin base ni red: estados y
// transiciones, formatos por su tipo REAL, la configuración administrable
// (topes, duraciones, recomendaciones, política de reemplazo, consentimiento),
// la validación para enviar a revisión, las advertencias de calidad (nunca
// rechazan) y lo que dice la tarjeta de «Mi proyecto».
// ════════════════════════════════════════════════════════════════════
import { qualityWarnings as pitchQualityWarnings } from './videoPitchSpec.js';

// ── Estados ──────────────────────────────────────────────────────────
export const STATUSES = [
    { key: 'none',              label: 'Sin video',                 tone: 'slate',   terminal: false },
    { key: 'draft',             label: 'Borrador',                  tone: 'amber',   terminal: false },
    { key: 'received',          label: 'Video recibido',            tone: 'blue',    terminal: false },
    { key: 'in_review',         label: 'En revisión',               tone: 'indigo',  terminal: false },
    { key: 'changes_requested', label: 'Correcciones solicitadas',  tone: 'orange',  terminal: false },
    { key: 'approved',          label: 'Aprobado',                  tone: 'emerald', terminal: false },
    { key: 'rejected',          label: 'Rechazado',                 tone: 'slate',   terminal: true },
    { key: 'withdrawn',         label: 'Retirado',                  tone: 'slate',   terminal: false },
];
export const STATUS_KEYS = STATUSES.map(s => s.key);
export const STORED_STATUS_KEYS = STATUS_KEYS.filter(k => k !== 'none');
export const statusMeta = (key) => STATUSES.find(s => s.key === key) || STATUSES[0];
export const isStatus = (k) => STORED_STATUS_KEYS.includes(k);

export const ADMIN_TRANSITIONS = {
    received:          ['in_review', 'approved', 'changes_requested', 'rejected'],
    in_review:         ['approved', 'changes_requested', 'rejected'],
    changes_requested: ['in_review', 'approved', 'rejected'],
    approved:          ['in_review', 'changes_requested'],
    rejected:          ['in_review'],
    withdrawn:         [],
    draft:             [],
};
export const PARTICIPANT_TRANSITIONS = {
    draft:             ['received'],
    changes_requested: ['received'],
    withdrawn:         ['received'],
    received:          ['withdrawn'],
    in_review:         ['withdrawn'],
};
export const canTransition = (from, to, { actor = 'admin' } = {}) => {
    const table = actor === 'participant' ? PARTICIPANT_TRANSITIONS : ADMIN_TRANSITIONS;
    return Array.isArray(table[from]) && table[from].includes(to);
};
/** El club edita la ficha y el archivo mientras no esté en manos del comité o aprobado. */
export const EDITABLE_STATUSES = ['draft', 'changes_requested', 'withdrawn'];
export const participantCanEdit = (status) => EDITABLE_STATUSES.includes(status);
/** Estados en los que el comité PIDE algo o decidió: lo que el club ve destacado. */
export const NEEDS_ATTENTION = ['changes_requested', 'rejected'];

// ── Formatos ─────────────────────────────────────────────────────────
export const FORMATS = {
    mp4:  { label: 'MP4',  mime: 'video/mp4',       preferred: true },
    mov:  { label: 'MOV',  mime: 'video/quicktime', preferred: false },
    webm: { label: 'WebM', mime: 'video/webm',      preferred: false },
};
export const LANGUAGES = [
    { key: 'es', label: 'Español' }, { key: 'en', label: 'Inglés' }, { key: 'es_en', label: 'Español con subtítulos en inglés' },
    { key: 'en_es', label: 'Inglés con subtítulos en español' }, { key: 'other', label: 'Otro' },
];
export const extensionOf = (filename) => String(filename || '').toLowerCase().split('.').pop() || '';

/** El tipo REAL por los bytes: MP4/MOV (átomos `ftyp`, `moov`…) o WebM (cabecera EBML). */
export const sniffVideo = (head) => {
    const b = Buffer.isBuffer(head) ? head : Buffer.from(head || []);
    if (b.length < 12) return null;
    if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'webm';
    const atom = b.toString('ascii', 4, 8);
    if (atom === 'ftyp') return b.toString('ascii', 8, 12).toLowerCase().startsWith('qt') ? 'mov' : 'mp4';
    if (['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(atom)) return 'mov';
    return null;
};

// ── Configuración administrable ──────────────────────────────────────
export const DEFAULT_RECOMMENDATIONS = [
    'Orientación horizontal, relación 16:9; resolución recomendada 1920 × 1080 píxeles o superior.',
    'Duración sugerida entre 90 segundos y 3 minutos: lo justo para captar interés.',
    'Contenido: el problema comunitario, la solución propuesta, los beneficiarios, el impacto esperado, la participación del club, el apoyo o financiación requerida y un llamado a la acción.',
    'Imagen estable, audio claro y buena iluminación. Preferible MP4 (H.264 con audio AAC).',
    'Evita música o imágenes sin autorización y marcas de agua innecesarias.',
    'Verifica los permisos de imagen de las personas que aparecen, en especial de menores de edad.',
];
export const DEFAULT_CONSENT_TEXT = 'Confirmo que el club cuenta con las autorizaciones necesarias para compartir este material con el comité organizador de la Feria de Proyectos Rotary Colombia: imágenes de personas identificables y, cuando corresponda, de menores de edad; música, fotografías y material audiovisual de terceros. Autorizo a la organización a usar el video dentro del alcance informado en la Feria; su difusión pública requiere una autorización aparte.';
export const REPLACEMENT_POLICIES = [
    { key: 'until_approved', label: 'Hasta que el video esté aprobado' },
    { key: 'always',         label: 'Siempre (también después de aprobado; la nueva versión vuelve a revisión)' },
];

export const DEFAULT_CONFIG = {
    allowedFormats: ['mp4', 'mov', 'webm'],
    maxSizeMb: 500,
    recommendedMinSec: 90,
    recommendedMaxSec: 180,
    maxDurationSec: 0,                   // 0 = sin tope reglamentario
    recommendedResolution: '1920 × 1080 (Full HD) o superior',
    maxActiveVideos: 1,
    deadline: '',                         // AAAA-MM-DD; vacío = sin fecha límite
    recommendations: DEFAULT_RECOMMENDATIONS,
    replacementPolicy: 'until_approved',
    requireConsent: true,
    consentText: DEFAULT_CONSENT_TEXT,
    reviewFlow: 'committee',              // 'committee' = pasa por revisión; 'auto_receive' = sólo se registra
    publicVisibility: false,              // nunca se publica solo; esto es una llave para una galería futura
    enabled: true,
};
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const int = (v, min, max, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt; };

/** Normaliza lo guardado (o lo que manda el panel) sobre los valores por defecto. */
export const normalizeConfig = (input = {}) => {
    const i = input || {};
    const formats = (Array.isArray(i.allowedFormats) ? i.allowedFormats : DEFAULT_CONFIG.allowedFormats).map(f => String(f).toLowerCase()).filter(f => FORMATS[f]);
    const recs = (Array.isArray(i.recommendations) ? i.recommendations : String(i.recommendations ?? '').split('\n')).map(r => str(r, 400)).filter(Boolean);
    const minSec = int(i.recommendedMinSec, 0, 3600, DEFAULT_CONFIG.recommendedMinSec);
    const maxRec = int(i.recommendedMaxSec, 0, 7200, DEFAULT_CONFIG.recommendedMaxSec);
    return {
        allowedFormats: formats.length ? formats : DEFAULT_CONFIG.allowedFormats,
        maxSizeMb: int(i.maxSizeMb, 10, 5000, DEFAULT_CONFIG.maxSizeMb),
        recommendedMinSec: Math.min(minSec, maxRec),
        recommendedMaxSec: Math.max(minSec, maxRec),
        maxDurationSec: int(i.maxDurationSec, 0, 7200, 0),
        recommendedResolution: str(i.recommendedResolution, 120) || DEFAULT_CONFIG.recommendedResolution,
        maxActiveVideos: int(i.maxActiveVideos, 1, 10, 1),
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(i.deadline || '')) ? String(i.deadline) : '',
        recommendations: recs.length ? recs.slice(0, 20) : DEFAULT_RECOMMENDATIONS,
        replacementPolicy: REPLACEMENT_POLICIES.some(p => p.key === i.replacementPolicy) ? i.replacementPolicy : 'until_approved',
        requireConsent: i.requireConsent === undefined ? true : Boolean(i.requireConsent),
        consentText: str(i.consentText, 2000) || DEFAULT_CONSENT_TEXT,
        reviewFlow: i.reviewFlow === 'auto_receive' ? 'auto_receive' : 'committee',
        publicVisibility: Boolean(i.publicVisibility),
        enabled: i.enabled === undefined ? true : Boolean(i.enabled),
    };
};
/** Versión del texto de consentimiento aceptado: lo que queda como evidencia. */
export const consentVersionOf = (text) => {
    let h = 0; const s = String(text || '');
    for (let k = 0; k < s.length; k++) h = ((h << 5) - h + s.charCodeAt(k)) | 0;
    return `c${(h >>> 0).toString(16)}-${s.length}`;
};
export const deadlinePassed = (cfg, now = Date.now()) => Boolean(cfg?.deadline) && now > new Date(`${cfg.deadline}T23:59:59-05:00`).getTime();

// ── Archivos ─────────────────────────────────────────────────────────
export const checkUploadMeta = ({ filename, size, cfg }) => {
    const c = normalizeConfig(cfg);
    const ext = extensionOf(filename);
    const errores = [];
    if (!c.allowedFormats.includes(ext)) errores.push(`Formato no admitido. Acepta ${c.allowedFormats.map(f => FORMATS[f].label).join(', ')}.`);
    const bytes = Number(size) || 0;
    if (bytes <= 0) errores.push('El archivo está vacío.');
    if (bytes > c.maxSizeMb * 1024 * 1024) errores.push(`El video supera el tope de ${c.maxSizeMb} MB.`);
    return { ok: errores.length === 0, errores, ext, contentType: FORMATS[ext]?.mime || null };
};
export const judgeUploadedVideo = ({ filename, bytes, head, cfg }) => {
    const meta = checkUploadMeta({ filename, size: bytes, cfg });
    if (!meta.ok) return { ok: false, error: meta.errores.join(' ') };
    const real = sniffVideo(head);
    if (!real) return { ok: false, error: 'El contenido del archivo no es un video MP4, MOV ni WebM.' };
    // MP4 y MOV comparten contenedor: una extensión «equivocada» entre ellos no se castiga; un WebM llamado .mp4 sí.
    const compatible = real === meta.ext || (['mp4', 'mov'].includes(real) && ['mp4', 'mov'].includes(meta.ext));
    if (!compatible) return { ok: false, error: `El archivo dice ser ${FORMATS[meta.ext].label} pero su contenido es ${FORMATS[real].label}.` };
    return { ok: true, format: real, contentType: FORMATS[real].mime };
};
/** Advertencias (nunca rechazan): las del Video Pitch más la duración frente a lo recomendado/reglamentario. */
export const videoWarnings = ({ width, height, durationSec, cfg }) => {
    const c = normalizeConfig(cfg);
    const out = pitchQualityWarnings({ kind: 'video', width, height, durationSec });
    const d = Number(durationSec) || 0;
    if (d > 0) {
        if (c.maxDurationSec && d > c.maxDurationSec) out.push(`Supera la duración máxima del reglamento (${Math.round(c.maxDurationSec / 60)} min): el comité podría pedir una versión más corta.`);
        else if (d > c.recommendedMaxSec) out.push(`Dura más de lo sugerido (${Math.round(c.recommendedMaxSec / 60)} min): una versión más breve suele captar mejor el interés.`);
        else if (d < c.recommendedMinSec) out.push(`Dura menos de lo sugerido (${c.recommendedMinSec} s): revisa que alcance a contar el proyecto.`);
    }
    return out;
};
export const fmtDuration = (s) => { const n = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

// ── Ficha del video ──────────────────────────────────────────────────
export const normalizeMeta = (input = {}) => {
    const i = input || {};
    const year = Number(i.productionYear);
    return {
        title: str(i.title, 160),
        description: str(i.description, 2000),
        language: LANGUAGES.some(l => l.key === i.language) ? i.language : '',
        productionYear: Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : null,
        notes: str(i.notes, 2000),
    };
};
/** Lo que impide ENVIAR a revisión. */
export const validateForSubmit = ({ meta, hasVersion, consentAccepted, cfg }) => {
    const c = normalizeConfig(cfg);
    const m = normalizeMeta(meta);
    const errors = [];
    if (!m.title) errors.push({ field: 'title', message: 'Dale un título al video.' });
    if (!hasVersion) errors.push({ field: 'file', message: 'Sube el archivo del video antes de enviarlo.' });
    if (c.requireConsent && !consentAccepted) errors.push({ field: 'consent', message: 'Confirma que el club cuenta con las autorizaciones para compartir el material.' });
    if (!c.enabled) errors.push({ field: 'config', message: 'La recepción de videos no está habilitada.' });
    if (deadlinePassed(c)) errors.push({ field: 'deadline', message: `La fecha límite de recepción (${c.deadline}) ya pasó.` });
    return { ok: errors.length === 0, errors };
};
/**
 * ¿Puede el club subir otra versión? En manos del comité (`received`,
 * `in_review`) no: primero lo retira. Rechazado, nunca. Aprobado, sólo con la
 * política «siempre» (y entonces vuelve a revisión).
 */
export const canReplace = ({ status, cfg }) => {
    const c = normalizeConfig(cfg);
    if (['rejected', 'received', 'in_review'].includes(status)) return false;
    if (status === 'approved') return c.replacementPolicy === 'always';
    return true;
};

// ── La tarjeta de «Mi proyecto» ──────────────────────────────────────
export const cardCopyOf = ({ status, available }) => {
    if (!available) return { headline: null, actions: [] };
    switch (status) {
        case 'none':
            return { headline: '¿Tu club ya cuenta con un video de presentación? Súbelo aquí para compartirlo con el comité organizador.', actions: [{ key: 'open', label: 'Subir video del proyecto' }] };
        case 'draft':
            return { headline: 'Tu video está guardado como borrador. Cuando esté listo, envíalo a revisión.', actions: [{ key: 'open', label: 'Continuar' }] };
        case 'received':
            return { headline: 'Video recibido. El comité lo revisará y te avisará.', actions: [{ key: 'open', label: 'Ver video' }, { key: 'edit', label: 'Editar información' }] };
        case 'in_review':
            return { headline: 'El comité está revisando tu video.', actions: [{ key: 'open', label: 'Ver video' }] };
        case 'changes_requested':
            return { headline: 'El comité pidió correcciones. Revisa las observaciones y sube una nueva versión.', actions: [{ key: 'open', label: 'Consultar observaciones' }, { key: 'replace', label: 'Reemplazar video' }] };
        case 'approved':
            return { headline: 'Tu video fue aprobado por el comité.', actions: [{ key: 'open', label: 'Ver video' }] };
        case 'rejected':
            return { headline: 'El comité no aprobó este video. Consulta el motivo.', actions: [{ key: 'open', label: 'Consultar observaciones' }] };
        case 'withdrawn':
            return { headline: 'Retiraste el video de la revisión. Puedes volver a enviarlo cuando quieras.', actions: [{ key: 'open', label: 'Ver video' }] };
        default:
            return { headline: null, actions: [{ key: 'open', label: 'Ver video' }] };
    }
};

// ── Bandeja ──────────────────────────────────────────────────────────
export const KPI_GROUPS = {
    total:      { label: 'Proyectos con video', statuses: STORED_STATUS_KEYS.filter(k => k !== 'draft') },
    received:   { label: 'Recibidos',           statuses: ['received'] },
    pending:    { label: 'Pendientes de revisión', statuses: ['received', 'in_review'] },
    approved:   { label: 'Aprobados',           statuses: ['approved'] },
    observed:   { label: 'Con observaciones',   statuses: ['changes_requested', 'rejected'] },
};
export const summarize = (rows) => Object.fromEntries(Object.entries(KPI_GROUPS).map(([k, g]) => [k, rows.filter(r => g.statuses.includes(r.status)).length]));

// ── Avisos ───────────────────────────────────────────────────────────
export const PARTICIPANT_NOTIFICATIONS = {
    received:          { kind: 'received',          subject: 'Recibimos el video de tu proyecto' },
    approved:          { kind: 'approved',          subject: 'El video de tu proyecto fue aprobado' },
    changes_requested: { kind: 'changes_requested', subject: 'El comité pidió correcciones al video de tu proyecto' },
    rejected:          { kind: 'rejected',          subject: 'El comité no aprobó el video de tu proyecto' },
};
export const notificationFor = (status) => PARTICIPANT_NOTIFICATIONS[status] || null;

export default {
    STATUSES, STATUS_KEYS, STORED_STATUS_KEYS, statusMeta, isStatus, ADMIN_TRANSITIONS, PARTICIPANT_TRANSITIONS, canTransition,
    EDITABLE_STATUSES, participantCanEdit, NEEDS_ATTENTION, FORMATS, LANGUAGES, extensionOf, sniffVideo, DEFAULT_RECOMMENDATIONS,
    DEFAULT_CONSENT_TEXT, REPLACEMENT_POLICIES, DEFAULT_CONFIG, normalizeConfig, consentVersionOf, deadlinePassed, checkUploadMeta,
    judgeUploadedVideo, videoWarnings, fmtDuration, normalizeMeta, validateForSubmit, canReplace, cardCopyOf, KPI_GROUPS, summarize,
    PARTICIPANT_NOTIFICATIONS, notificationFor,
};
