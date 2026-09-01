// ════════════════════════════════════════════════════════════════════
// Espejo MÍNIMO de `server/lib/contentSubmissionSpec.js` — v4.972
//
// Sólo lo que la pantalla necesita para PINTAR y para acotar antes de mandar:
// los estados con su rótulo y su color, los topes de archivo y qué se acepta.
// Quien DECIDE sigue siendo el servidor —`validateSubmission`, las
// transiciones y el consentimiento viven allá— y esto no los duplica: un
// espejo que decidiera daría dos veredictos sobre el mismo envío.
//
// La paridad se comprueba comparando SALIDAS en `npm run test:submissions`, no
// sólo claves. Al tocar uno, tocar el otro.
// ════════════════════════════════════════════════════════════════════

export interface SubmissionState {
    id: string;
    label: string;
    order: number;
    tone: string;
    help: string;
}

export const SUBMISSION_STATES: Record<string, SubmissionState> = {
    recibido: { id: 'recibido', label: 'Recibido', order: 10, tone: 'sky', help: 'Llegó por el formulario y nadie la miró todavía.' },
    en_revision: { id: 'en_revision', label: 'En revisión', order: 20, tone: 'amber', help: 'Alguien la está mirando.' },
    requiere_info: { id: 'requiere_info', label: 'Requiere información', order: 25, tone: 'amber', help: 'Falta algo y hay que pedírselo a quien la envió.' },
    aprobado: { id: 'aprobado', label: 'Aprobado', order: 30, tone: 'emerald', help: 'El material sirve. Todavía no se usó en ninguna comunicación.' },
    listo_difusion: { id: 'listo_difusion', label: 'Listo para difusión', order: 40, tone: 'emerald', help: 'Está en la Biblioteca y se puede convertir en publicaciones.' },
    publicado: { id: 'publicado', label: 'Publicado', order: 50, tone: 'blue', help: 'Se usó en al menos una comunicación.' },
    descartado: { id: 'descartado', label: 'Descartado', order: 90, tone: 'gray', help: 'No se va a usar. Se conserva con su motivo.' },
};

export const SUBMISSION_STATE_IDS = Object.keys(SUBMISSION_STATES);
export const stateLabel = (id: string) => SUBMISSION_STATES[id]?.label || id;

/** Las clases de la insignia. El TONO vive en el criterio; el color concreto
 *  es de la pantalla — el servidor no tiene por qué saber de Tailwind. */
export const STATE_CHIP: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    gray: 'bg-gray-100 text-gray-500',
};
export const stateChip = (id: string) => STATE_CHIP[SUBMISSION_STATES[id]?.tone || 'gray'] || STATE_CHIP.gray;

export const MAX_FILES = 10;
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/**
 * El `accept` del input y del drag & drop.
 *
 * Lleva las EXTENSIONES además de los MIME a propósito: al elegir un archivo
 * desde un móvil, varios navegadores mandan el tipo vacío o genérico —es la
 * misma cautela que `isHeicFile` con las fotos de iPhone (v4.739)— y con sólo
 * los MIME el selector no ofrecería las fotos del carrete.
 */
export const ACCEPT_ATTR = [
    ...IMAGE_TYPES, ...VIDEO_TYPES,
    '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.mp4', '.mov', '.webm',
].join(',');

export const kindOf = (contentType: string, filename = ''): 'image' | 'video' | null => {
    const t = String(contentType || '').toLowerCase();
    if (IMAGE_TYPES.includes(t)) return 'image';
    if (VIDEO_TYPES.includes(t)) return 'video';
    const ext = String(filename || '').toLowerCase().split('.').pop() || '';
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
    return null;
};

/** El mismo veredicto que el servidor, para avisar ANTES de subir 200 MB. */
export const checkFileMeta = ({ contentType, filename, size }: { contentType?: string; filename?: string; size?: number }) => {
    const errores: string[] = [];
    const kind = kindOf(contentType || '', filename || '');
    if (!kind) {
        errores.push('Sólo se pueden enviar fotografías (JPG, PNG, WEBP, HEIC) y videos (MP4, MOV, WEBM).');
        return { ok: false, errores, kind: null as null };
    }
    const bytes = Number(size) || 0;
    const max = kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (bytes <= 0) errores.push('El archivo llegó vacío.');
    else if (bytes > max) {
        errores.push(`${kind === 'video' ? 'El video' : 'La fotografía'} pesa ${(bytes / 1048576).toFixed(1)} MB y el máximo es ${max / 1048576} MB.`);
    }
    return { ok: errores.length === 0, errores, kind };
};

/**
 * El marcador de posición del consentimiento en el panel.
 *
 * NO es el texto que se usa —ése lo resuelve el servidor con
 * `consentTextFor`—: es lo que se le enseña a quien configura para que se vea
 * que hay que reemplazarlo. Duplicar acá el texto completo daría dos versiones
 * de un texto legal, que es la peor cosa que se puede duplicar.
 */
export const DEFAULT_CONSENT_TEXT_HINT =
    'Escribí acá la política de uso de imagen de la organización. Mientras esté vacío se usa un texto provisional y el formulario lo advierte.';

// ─── Difusión previa: lo que el club YA publicó ────────────────────────
//
// ⚠️ NO ES `USAGE_CHANNELS`, Y FUNDIRLOS BORRARÍA LA PREGUNTA. Aquél responde
// «¿dónde usamos NOSOTROS este material después de aprobarlo?»; esto, «¿dónde
// lo publicó el CLUB antes de mandárnoslo?». Son dos catálogos y dos tablas.
//
// El desplegable del formulario se pinta con lo que MANDA el servidor
// (`platforms` en la configuración); esta copia es el respaldo para un
// navegador que hable con un servidor anterior, y la paridad la comprueba
// `npm run test:submissions` comparando salidas.

export const POST_PLATFORM_OTHER = 'otra';

export const POST_PLATFORMS: Record<string, { id: string; label: string }> = {
    instagram: { id: 'instagram', label: 'Instagram' },
    facebook: { id: 'facebook', label: 'Facebook' },
    tiktok: { id: 'tiktok', label: 'TikTok' },
    youtube: { id: 'youtube', label: 'YouTube' },
    linkedin: { id: 'linkedin', label: 'LinkedIn' },
    x: { id: 'x', label: 'X' },
    web: { id: 'web', label: 'Página web' },
    blog: { id: 'blog', label: 'Blog' },
    [POST_PLATFORM_OTHER]: { id: POST_PLATFORM_OTHER, label: 'Otra' },
};
export const POST_PLATFORM_IDS = Object.keys(POST_PLATFORMS);
export const postPlatformLabel = (id: string, other = '') =>
    (id === POST_PLATFORM_OTHER ? String(other || '').trim() : '') || POST_PLATFORMS[id]?.label || id;

export const MAX_POSTS = 20;
export const MAX_PARTICIPATING_CLUBS = 20;
export const POST_URL_MAX = 600;

/**
 * El MISMO veredicto que el servidor, para avisar ANTES de mandar.
 *
 * Se valida la FORMA, no el dominio: un enlace puede venir acortado, con
 * redirección o desde un dominio propio. El esquema sí se cierra a
 * `http`/`https` porque el valor termina como `href` en el panel.
 *
 * Quien DECIDE sigue siendo el servidor: esto sólo evita mandar un enlace que
 * va a volver rechazado.
 */
export const normalizePostUrl = (raw: string): { ok: boolean; url: string; host: string; error: string } => {
    const texto = String(raw ?? '').trim().slice(0, POST_URL_MAX);
    if (!texto) return { ok: false, url: '', host: '', error: 'Falta el enlace de la publicación.' };
    if (/\s/.test(texto)) return { ok: false, url: '', host: '', error: 'El enlace no puede tener espacios.' };

    const conEsquema = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(texto) ? texto : `https://${texto}`;
    let u: URL;
    try { u = new URL(conEsquema); }
    catch { return { ok: false, url: '', host: '', error: `«${texto}» no parece un enlace.` }; }

    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, url: '', host: '', error: 'El enlace tiene que empezar por http:// o https://.' };
    }
    if (!u.hostname.includes('.') || u.hostname.endsWith('.')) {
        return { ok: false, url: '', host: '', error: `«${texto}» no parece un enlace de internet.` };
    }
    return { ok: true, url: u.toString().slice(0, POST_URL_MAX), host: u.hostname.replace(/^www\./, ''), error: '' };
};

export const USAGE_CHANNELS: Record<string, { id: string; label: string; auto: boolean }> = {
    instagram: { id: 'instagram', label: 'Instagram', auto: true },
    facebook: { id: 'facebook', label: 'Facebook', auto: true },
    x: { id: 'x', label: 'X', auto: true },
    linkedin: { id: 'linkedin', label: 'LinkedIn', auto: true },
    email: { id: 'email', label: 'Correo', auto: false },
    whatsapp: { id: 'whatsapp', label: 'WhatsApp', auto: false },
    web: { id: 'web', label: 'Sitio web', auto: false },
};
export const USAGE_CHANNEL_IDS = Object.keys(USAGE_CHANNELS);
export const usageIsMeasured = (channel: string) => USAGE_CHANNELS[channel]?.auto === true;

export default {
    SUBMISSION_STATES, SUBMISSION_STATE_IDS, stateLabel, stateChip,
    MAX_FILES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, IMAGE_TYPES, VIDEO_TYPES,
    ACCEPT_ATTR, kindOf, checkFileMeta, DEFAULT_CONSENT_TEXT_HINT,
    USAGE_CHANNELS, USAGE_CHANNEL_IDS, usageIsMeasured,
    POST_PLATFORMS, POST_PLATFORM_IDS, POST_PLATFORM_OTHER, postPlatformLabel,
    normalizePostUrl, MAX_POSTS, MAX_PARTICIPATING_CLUBS, POST_URL_MAX,
};
