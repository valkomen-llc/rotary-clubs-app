// ════════════════════════════════════════════════════════════════════
// Logo institucional embebido para PDFs ejecutivos — v4.1130.
//
// Los PDFs se generan en el NAVEGADOR y no pueden descargar el logo con
// fetch+CORS si el storage (S3) no envía `Access-Control-Allow-Origin`, ni
// pintar SVG/WEBP/GIF que jsPDF no come directo. Estas funciones corren en el
// SERVIDOR (en Node no hay CORS): descargan los bytes, normalizan a PNG/JPEG
// con sharp y los entregan como data URL dentro del `branding` del endpoint.
//
// Lo usan:
//   · projectFairAdminController.js (GET /project-fair/admin/inteligencia)
//   · eventRegistrationAdminController.js (GET /event-registrations/admin/dashboard)
//
// Un solo criterio de normalización para todos los informes: futuros cambios
// (formatos, tamaños, timeouts) se hacen aquí una vez.
// ════════════════════════════════════════════════════════════════════
import sharp from 'sharp';

export const LOGO_FETCH_TIMEOUT_MS = 8000;
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_PASSTHROUGH_MAX_BYTES = 900 * 1024;
export const LOGO_NORMALIZED_WIDTH = 600;

export const absolutizeLogoUrl = (url, req) => {
    const u = String(url || '').trim();
    if (!u || u.startsWith('data:')) return u;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return `https:${u}`;
    try {
        const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || '';
        const proto = (req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https').split(',')[0].trim() || 'https';
        if (host) return new URL(u, `${proto}://${String(host).split(',')[0].trim()}`).href;
    } catch { /* se intenta tal cual */ }
    return u;
};

export const sniffLogoMime = (buf, contentType, url) => {
    const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (ct.startsWith('image/')) return ct;
    const ext = String(url || '').split('?')[0].toLowerCase().match(/\.(png|jpe?g|webp|gif|svg)$/)?.[1];
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'svg') return 'image/svg+xml';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
        && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
    try {
        const head = Buffer.from(buf.slice(0, 512)).toString('utf8').toLowerCase();
        if (head.includes('<svg')) return 'image/svg+xml';
    } catch { /* binario puro */ }
    return null;
};

/**
 * Descarga el logo y lo deja listo para jsPDF. Devuelve
 * `{ dataUrl, format }` o `{ error }` con causa legible (`http-404`,
 * `timeout`, `too-large`, `not-an-image`, `unreachable`, `convert-failed`).
 * Nunca lanza: un logo que no se puede embeber no puede tumbar el informe.
 */
export const embedLogoDataUrl = async (url, req) => {
    const href = absolutizeLogoUrl(url, req);
    if (!href) return { error: 'empty-url' };
    if (href.startsWith('data:')) {
        const mime = href.slice(5, href.indexOf(';')).toLowerCase();
        if (mime === 'image/png') return { dataUrl: href, format: 'PNG' };
        if (mime === 'image/jpeg' || mime === 'image/jpg') return { dataUrl: href, format: 'JPEG' };
        return { error: 'unsupported-data-url' };
    }
    let res;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), LOGO_FETCH_TIMEOUT_MS);
        try {
            // Sin modo CORS a propósito: en Node no existe ese concepto y el
            // storage responde igual tenga o no cabeceras para navegadores.
            res = await fetch(href, { signal: ctrl.signal });
        } finally { clearTimeout(timer); }
    } catch (e) {
        return { error: e?.name === 'AbortError' ? 'timeout' : 'unreachable' };
    }
    if (!res.ok) return { error: `http-${res.status}` };
    let buf;
    try {
        buf = Buffer.from(await res.arrayBuffer());
    } catch { return { error: 'unreadable-body' }; }
    if (!buf.length) return { error: 'empty-body' };
    if (buf.length > LOGO_MAX_BYTES) return { error: 'too-large' };
    const mime = sniffLogoMime(buf, res.headers.get('content-type') || '', href);
    if (!mime) return { error: 'not-an-image' };
    // PNG/JPEG pequeños van directos (máxima resolución, sin recompresión).
    if ((mime === 'image/png' || mime === 'image/jpeg') && buf.length <= LOGO_PASSTHROUGH_MAX_BYTES) {
        return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, format: mime === 'image/png' ? 'PNG' : 'JPEG' };
    }
    // SVG / WEBP / GIF / imágenes grandes → PNG normalizado (proporción
    // intacta por construcción: sólo se limita el ancho máximo).
    try {
        const out = await sharp(buf, { limitInputPixels: 268435456 })
            .resize({ width: LOGO_NORMALIZED_WIDTH, withoutEnlargement: true })
            .png()
            .toBuffer();
        return { dataUrl: `data:image/png;base64,${out.toString('base64')}`, format: 'PNG' };
    } catch { return { error: 'convert-failed' }; }
};

export default { absolutizeLogoUrl, sniffLogoMime, embedLogoDataUrl };
