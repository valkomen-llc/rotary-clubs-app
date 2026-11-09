// ════════════════════════════════════════════════════════════════════
// Archivos del Directorio Distrital de Clubes — lo que el NAVEGADOR sabe
// antes de subir — v4.1306.0
//
// Espejo de `server/lib/clubMediaSpec.js` (lo comprueba
// `npm run test:club-media`): al tocar uno, tocar el otro. El servidor es el
// que decide de verdad —mira los BYTES, no el nombre—; esto sólo evita
// esperar una subida entera para enterarse de que el archivo no servía.
// ════════════════════════════════════════════════════════════════════

export type ClubMediaRole = 'logo' | 'cover' | 'gallery';

export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.hif'];

export const ACCEPTED_MIME = [
    'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp',
    'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
];

/** Lo que va en `accept` del `<input type="file">`. Con la lista explícita,
 *  iOS sigue ofreciendo la fototeca y Android la galería. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_MIME.filter(m => !m.includes('sequence') && m !== 'image/jpg' && m !== 'image/pjpeg'), ...ACCEPTED_EXTENSIONS].join(',');

/** Topes por defecto (el servidor manda los vigentes en `/media/limits`). */
export const DEFAULT_MAX_MB: Record<ClubMediaRole, number> = { logo: 15, cover: 30, gallery: 30 };

export const DEFAULT_GALLERY_MAX = 30;

const MB = 1024 * 1024;

export const formatLimit = (bytes: number): string => {
    const mb = Number(bytes) / MB;
    return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
};

export const formatBytes = (bytes?: number | null): string => {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < MB) return `${Math.round(n / 1024)} KB`;
    return `${(n / MB).toFixed(1)} MB`;
};

const extOf = (name?: string | null) => {
    const m = /\.([a-z0-9]{1,6})$/i.exec(String(name || '').trim());
    return m ? `.${m[1].toLowerCase()}` : '';
};
const mimeOf = (type?: string | null) => String(type || '').toLowerCase().split(';')[0].trim();

export const declaredAsAccepted = ({ filename, contentType }: { filename?: string; contentType?: string }): boolean => {
    const mime = mimeOf(contentType);
    const ext = extOf(filename);
    if (mime === 'image/svg+xml' || ext === '.svg') return false;
    return ACCEPTED_MIME.includes(mime) || ACCEPTED_EXTENSIONS.includes(ext);
};

export const uploadContentType = ({ filename, contentType }: { filename?: string; contentType?: string }): string => {
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

export interface MetaVerdict { ok: boolean; code?: string; error?: string; hint?: string }

/** Juicio previo, con el mismo texto que daría el servidor. */
export const checkFileBeforeUpload = (file: File, role: ClubMediaRole, maxBytes?: number): MetaVerdict => {
    if (!declaredAsAccepted({ filename: file.name, contentType: file.type })) {
        return {
            ok: false,
            code: 'format',
            error: `«${file.name || 'El archivo'}» no es un formato admitido.`,
            hint: 'Usa una imagen PNG, JPG, WEBP o HEIC (fotos de iPhone). Los SVG y los PDF no se admiten en este campo.',
        };
    }
    if (!file.size) {
        return { ok: false, code: 'empty', error: 'El archivo está vacío o el navegador no pudo leerlo.', hint: 'Vuelve a elegirlo; si viene de la nube (iCloud, Google Drive), descárgalo primero al dispositivo.' };
    }
    const max = maxBytes || DEFAULT_MAX_MB[role] * MB;
    if (file.size > max) {
        return {
            ok: false,
            code: 'too_large',
            error: `«${file.name}» pesa ${(file.size / MB).toFixed(1)} MB y el límite para este campo es ${formatLimit(max)}.`,
            hint: 'Reduce el tamaño (por ejemplo, compartiéndola por WhatsApp o exportándola en calidad media) y vuelve a intentarlo.',
        };
    }
    return { ok: true };
};

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const VIEW_RE = new RegExp(`/district-clubs/media/(${UUID})(?:[/?#]|$)`, 'i');
const PUBLIC_RE = new RegExp(`/directorio-clubes/[^/?#]+/(${UUID})\\.(?:png|jpe?g|webp)(?:[?#]|$)`, 'i');

/** El id de un archivo del módulo a partir de su URL; `null` si es otra imagen. */
export const mediaIdFromUrl = (url?: string | null): string | null => {
    const v = String(url || '');
    const m = VIEW_RE.exec(v) || PUBLIC_RE.exec(v);
    return m ? m[1].toLowerCase() : null;
};

/** Lo que nunca se manda en un borrador. */
export const SECRET_FIELDS = ['password', 'confirmPassword', 'currentPassword', 'newPassword'];
export const stripSecrets = <T extends Record<string, any>>(payload: T): T => {
    const out: Record<string, any> = { ...payload };
    for (const k of SECRET_FIELDS) delete out[k];
    return out as T;
};

export const ROLE_TEXT: Record<ClubMediaRole, { label: string; saved: string; button: string; hint: string }> = {
    logo: { label: 'Logotipo oficial del club', saved: 'Logotipo guardado correctamente', button: 'Subir Logotipo', hint: 'PNG transparente recomendado' },
    cover: { label: 'Imagen de portada', saved: 'Imagen de portada guardada correctamente', button: 'Subir Portada', hint: 'Fotografía panorámica del club (1600×600 px)' },
    gallery: { label: 'Fotografías institucionales', saved: 'Fotografía guardada correctamente', button: 'Seleccionar fotografías', hint: 'Fotografías de servicio y compañerismo' },
};
