// ════════════════════════════════════════════════════════════════════
// Archivos del Directorio Distrital de Clubes — criterio PURO — v4.1306.0
//
// Sin base ni S3: qué se acepta en cada campo, con qué tope, cómo se nombra
// y cómo se reconoce un archivo del módulo dentro de un formulario. Lo prueba
// `npm run test:club-media` sin red. Espejo en `src/lib/clubMediaSpec.ts`
// (lo que el navegador necesita saber ANTES de subir): al tocar uno, tocar el
// otro — la prueba compara los dos.
//
// La causa del reporte «no deja subir el logo» (v4.1305 y antes) está contada
// en `docs/claude/archivos-del-directorio-de-clubes.md`.
// ════════════════════════════════════════════════════════════════════

/** Los campos que reciben archivos. Cada uno con su propósito y su tope. */
export const CLUB_MEDIA_ROLES = ['logo', 'cover', 'gallery'];

export const ROLE_LABELS = {
    logo: 'Logotipo oficial del club',
    cover: 'Imagen de portada',
    gallery: 'Fotografía institucional',
};

/** Formatos que se aceptan (por CONTENIDO, no por extensión). SVG no: no hay
 *  un proceso de sanitización en la plataforma y un SVG puede llevar script. */
export const ACCEPTED_FORMATS = ['jpeg', 'png', 'webp', 'heif'];

export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.hif'];

export const ACCEPTED_MIME = [
    'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp',
    'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
];

const MB = 1024 * 1024;

/** Tope por campo, en MB. Configurable por entorno sin tocar código. Los
 *  valores por defecto cubren de sobra una foto de 48 MP de un teléfono. */
const DEFAULT_MAX_MB = { logo: 15, cover: 30, gallery: 30 };
const ENV_KEYS = { logo: 'CLUB_MEDIA_MAX_MB_LOGO', cover: 'CLUB_MEDIA_MAX_MB_COVER', gallery: 'CLUB_MEDIA_MAX_MB_GALLERY' };

export const maxBytesFor = (role, env = process.env) => {
    const raw = Number(env?.[ENV_KEYS[role]]);
    const mb = Number.isFinite(raw) && raw > 0 ? raw : (DEFAULT_MAX_MB[role] || 15);
    return Math.round(mb * MB);
};

/** Cuántas fotos admite la galería de un club. */
export const galleryMax = (env = process.env) => {
    const raw = Number(env?.CLUB_MEDIA_GALLERY_MAX);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
};

/** Medida mayor de la versión que se guarda. El original se conserva aparte. */
export const OUTPUT_MAX_DIMENSION = { logo: 2000, cover: 2560, gallery: 2560 };
/** Menos que esto no es un logotipo ni una foto: es un ícono o un error. */
export const MIN_DIMENSION = 32;
/** Píxeles de entrada que se aceptan decodificar (una foto de 200 MP pasa). */
export const MAX_INPUT_PIXELS = 220_000_000;

export const formatLimit = (bytes) => {
    const mb = Number(bytes) / MB;
    return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
};
export const formatMB = (bytes) => `${(Number(bytes) / MB).toFixed(1)} MB`;

const extOf = (name) => {
    const m = /\.([a-z0-9]{1,6})$/i.exec(String(name || '').trim());
    return m ? `.${m[1].toLowerCase()}` : '';
};
const mimeOf = (type) => String(type || '').toLowerCase().split(';')[0].trim();

/** ¿El nombre o el tipo DECLARADO parecen una imagen aceptada? Basta uno de
 *  los dos: Android manda el tipo vacío al elegir un `.heic`, y hay apps que
 *  guardan sin extensión. El contenido real se mira después, en el servidor. */
export const declaredAsAccepted = ({ filename, contentType } = {}) => {
    const mime = mimeOf(contentType);
    const ext = extOf(filename);
    if (mime === 'image/svg+xml' || ext === '.svg') return false;
    return ACCEPTED_MIME.includes(mime) || ACCEPTED_EXTENSIONS.includes(ext);
};

/** El tipo que se FIRMA en la URL de subida: el que el navegador va a mandar
 *  en el PUT. Si no declaró ninguno, uno neutro que ambos lados conocen. */
export const uploadContentType = ({ filename, contentType } = {}) => {
    const mime = mimeOf(contentType);
    if (mime && mime !== 'application/octet-stream') return mime;
    const ext = extOf(filename);
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.heic' || ext === '.hif') return 'image/heic';
    if (ext === '.heif') return 'image/heif';
    return 'application/octet-stream';
};

/** Extensión del ORIGINAL guardado (sólo para reconocerlo en el bucket). */
export const originalExtension = ({ filename, contentType } = {}) => {
    const ext = extOf(filename);
    if (ACCEPTED_EXTENSIONS.includes(ext)) return ext.slice(1) === 'jpeg' ? 'jpg' : ext.slice(1);
    const mime = mimeOf(contentType);
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('hei')) return 'heic';
    return 'jpg';
};

/** El juicio previo a prefirmar. Mensajes para la persona, con la salida. */
export const checkUploadMeta = ({ role, filename, contentType, size } = {}, env = process.env) => {
    if (!CLUB_MEDIA_ROLES.includes(role)) {
        return { ok: false, code: 'role', error: 'Campo de archivo desconocido.' };
    }
    if (!declaredAsAccepted({ filename, contentType })) {
        return {
            ok: false,
            code: 'format',
            error: `«${String(filename || 'El archivo')}» no es un formato admitido.`,
            hint: 'Usa una imagen PNG, JPG, WEBP o HEIC (fotos de iPhone). Los SVG y los PDF no se admiten en este campo.',
        };
    }
    const bytes = Number(size) || 0;
    if (bytes <= 0) {
        return { ok: false, code: 'empty', error: 'El archivo está vacío o el navegador no pudo leerlo.', hint: 'Vuelve a elegirlo; si viene de la nube (iCloud, Google Drive), descárgalo primero al dispositivo.' };
    }
    const max = maxBytesFor(role, env);
    if (bytes > max) {
        return {
            ok: false,
            code: 'too_large',
            error: `«${String(filename || 'El archivo')}» pesa ${formatMB(bytes)} y el límite para este campo es ${formatLimit(max)}.`,
            hint: 'Reduce el tamaño (por ejemplo, compartiéndola por WhatsApp o exportándola en calidad media) y vuelve a intentarlo.',
            maxBytes: max,
        };
    }
    return { ok: true, maxBytes: max, uploadType: uploadContentType({ filename, contentType }), ext: originalExtension({ filename, contentType }) };
};

/** Nombre de archivo SEGURO para mostrar y para descargar (nunca para la clave). */
export const safeDisplayName = (name) => {
    const clean = String(name || '')
        .normalize('NFC')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return (clean || 'imagen').slice(0, 120);
};

// ─── Referencias dentro de un formulario ───────────────────────────────

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const VIEW_RE = new RegExp(`/district-clubs/media/(${UUID})(?:[/?#]|$)`, 'i');
const PUBLIC_RE = new RegExp(`/directorio-clubes/[^/?#]+/(${UUID})\\.(?:png|jpe?g|webp)(?:[?#]|$)`, 'i');

/** La dirección ESTABLE con la que el formulario guarda un archivo propio. No
 *  caduca: el servidor la resuelve en cada lectura (firmada mientras es
 *  privado, pública cuando ya está publicado). */
export const viewPathFor = (id) => `/api/district-clubs/media/${id}`;

/** El id de un archivo del módulo a partir de su URL (la estable o la
 *  pública ya publicada). `null` para cualquier otra imagen (p. ej. un logo
 *  que ya estaba en el perfil antes de este cambio). */
export const mediaIdFromUrl = (url) => {
    const v = String(url || '');
    const m = VIEW_RE.exec(v) || PUBLIC_RE.exec(v);
    return m ? m[1].toLowerCase() : null;
};

/** Todas las URLs de imagen que un formulario del directorio puede llevar. */
export const mediaUrlsIn = (payload = {}) => {
    const out = [];
    if (payload?.logoUrl) out.push({ role: 'logo', url: payload.logoUrl });
    if (payload?.coverImageUrl) out.push({ role: 'cover', url: payload.coverImageUrl });
    for (const g of Array.isArray(payload?.gallery) ? payload.gallery : []) {
        if (g?.url) out.push({ role: 'gallery', url: g.url });
    }
    return out;
};

/** Los ids de archivos del módulo que referencia un formulario, sin repetir. */
export const mediaIdsIn = (payload = {}) =>
    [...new Set(mediaUrlsIn(payload).map(r => mediaIdFromUrl(r.url)).filter(Boolean))];

/** Copia del formulario con cada URL del módulo reemplazada según `map(id)`.
 *  Lo que `map` devuelva vacío se QUITA (logo en blanco, foto fuera de la
 *  galería). Las URLs ajenas al módulo quedan intactas. */
export const rewriteMediaUrls = (payload = {}, map = () => undefined) => {
    const out = { ...payload };
    const swap = (url) => {
        const id = mediaIdFromUrl(url);
        if (!id) return url;
        const next = map(id, url);
        return next === undefined ? url : next;
    };
    if ('logoUrl' in out) out.logoUrl = out.logoUrl ? (swap(out.logoUrl) || '') : out.logoUrl;
    if ('coverImageUrl' in out) out.coverImageUrl = out.coverImageUrl ? (swap(out.coverImageUrl) || '') : out.coverImageUrl;
    if (Array.isArray(out.gallery)) {
        out.gallery = out.gallery
            .map(g => (g && g.url ? { ...g, url: swap(g.url) || '' } : g))
            .filter(g => g && g.url);
    }
    return out;
};

/** Lo que NUNCA se guarda en un borrador ni en la copia del envío: la
 *  contraseña del portal viajaba en el payload y quedaba en texto plano en
 *  `DistrictClubSubmission.payload` (corregido en v4.1306). */
export const SECRET_FIELDS = ['password', 'confirmPassword', 'currentPassword', 'newPassword'];
export const stripSecrets = (payload = {}) => {
    if (!payload || typeof payload !== 'object') return payload;
    const out = { ...payload };
    for (const k of SECRET_FIELDS) delete out[k];
    return out;
};

/** Estados de un archivo y su nombre para la persona. */
export const MEDIA_STATES = ['subiendo', 'procesando', 'guardado', 'publicado', 'error', 'duplicado', 'eliminado'];
export const STATE_LABELS = {
    subiendo: 'Subiendo',
    procesando: 'Procesando',
    guardado: 'Guardado',
    publicado: 'Publicado',
    error: 'Falló',
    duplicado: 'Duplicado',
    eliminado: 'Eliminado',
};

export default {
    CLUB_MEDIA_ROLES, ROLE_LABELS, ACCEPTED_FORMATS, ACCEPTED_EXTENSIONS, ACCEPTED_MIME,
    maxBytesFor, galleryMax, OUTPUT_MAX_DIMENSION, MIN_DIMENSION, MAX_INPUT_PIXELS,
    formatLimit, formatMB, declaredAsAccepted, uploadContentType, originalExtension,
    checkUploadMeta, safeDisplayName, viewPathFor, mediaIdFromUrl, mediaUrlsIn, mediaIdsIn,
    rewriteMediaUrls, SECRET_FIELDS, stripSecrets, MEDIA_STATES, STATE_LABELS,
};
