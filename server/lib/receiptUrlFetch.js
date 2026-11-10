// ════════════════════════════════════════════════════════════════════
// Traer un comprobante desde una URL externa, con seguridad — v4.1312
//
// Pedido del Distrito 4281: los registros migrados de otra plataforma
// («Importación histórica») dejaron sus comprobantes allá. El Equipo de
// Registro pega el enlace y Club Platform guarda UNA COPIA propia.
//
// Este módulo es la parte que toca la red de un TERCERO desde el servidor, y
// por eso es la parte peligrosa (SSRF: que un enlace haga que la función
// consulte su propia red, la de Vercel o el servicio de metadatos). Reglas:
//
//   · Sólo HTTPS, sólo el puerto 443, sin usuario ni contraseña en el enlace.
//   · ⚠️ La dirección se valida DESPUÉS de resolver el DNS y DENTRO del mismo
//     `lookup` con el que se abre el socket: validar en un paso y conectar en
//     otro deja la puerta del «DNS rebinding» (el nombre cambia de dirección
//     entre la consulta y la conexión). Un host que es una IP literal no pasa
//     por `lookup` (Node conecta directo), así que se revisa antes.
//   · Cada redirección se revisa con las mismas reglas (máximo 5); bajar de
//     HTTPS a HTTP no se sigue.
//   · Topes de tiempo (conexión y total) y de peso: se corta al pasar los
//     10 MB aunque el servidor no haya declarado el tamaño.
//   · No viajan cookies, tokens ni cabeceras de Club Platform: la petición
//     sale con un User-Agent propio y nada más.
//   · QUÉ ES el archivo se lee de sus primeros bytes (`receiptKindOf`): ni la
//     extensión ni el Content-Type obligan a nada. Nada se ejecuta.
//
// Un enlace que exige iniciar sesión en el proveedor NO se intenta eludir:
// se responde «acceso restringido» y la salida es «Subir comprobante».
//
// Lo PURO (validar una URL, una dirección, redactar un enlace con tokens,
// sacar el nombre del archivo) se exporta aparte y lo prueba
// `npm run test:receipt-url-import` sin red.
// ════════════════════════════════════════════════════════════════════
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { RECEIPT_MAX_BYTES } from './completedRegistrationSpec.js';
import { receiptKindOf } from './completedReceipts.js';

export const IMPORT_MAX_REDIRECTS = 5;
export const IMPORT_CONNECT_TIMEOUT_MS = 8000;
export const IMPORT_TOTAL_TIMEOUT_MS = 25000;
export const IMPORT_USER_AGENT = 'ClubPlatform-ReceiptImporter/1.0 (+https://rotary4281.org)';

// ── Los mensajes, uno por desenlace ──────────────────────────────────
//
// Son los del pedido, textuales: el administrador tiene que saber QUÉ hacer,
// no sólo que algo falló.
export const IMPORT_ERRORS = {
    invalid_url: 'El enlace introducido no es válido. Debe ser una dirección HTTPS completa (https://…).',
    blocked: 'Por seguridad, Club Platform no puede consultar esa dirección. Usa un enlace público del proveedor o «Subir comprobante».',
    not_found: 'No fue posible localizar el comprobante en la dirección indicada.',
    restricted: 'El archivo requiere permisos adicionales. Descárgalo desde la plataforma original y utiliza «Subir comprobante».',
    html: 'El enlace abre una página web (posiblemente de inicio de sesión), no el archivo. Usa el enlace de descarga directa o descárgalo desde la plataforma original y utiliza «Subir comprobante».',
    unsupported: 'El archivo no corresponde a un formato permitido (PDF, JPG, PNG o WebP).',
    too_large: `El comprobante supera el límite de almacenamiento (${RECEIPT_MAX_BYTES / 1024 / 1024} MB).`,
    empty: 'El enlace respondió, pero sin ningún archivo.',
    timeout: 'El servidor del enlace tardó demasiado en responder. Intenta de nuevo o utiliza «Subir comprobante».',
    unreachable: 'No fue posible conectarse con el servidor del enlace. Revisa la dirección o intenta más tarde.',
    unavailable: 'El servidor del enlace no entregó el archivo en este momento. Intenta más tarde o utiliza «Subir comprobante».',
    too_many_redirects: 'El enlace redirige demasiadas veces. Usa el enlace directo del archivo.',
    duplicate: 'Comprobante duplicado: este archivo ya se encuentra asociado a la inscripción.',
    storage: 'No fue posible guardar el archivo en Club Platform. Intenta de nuevo.',
    link: 'El archivo se recibió, pero no se pudo asociar correctamente a la inscripción. Puedes reintentar con seguridad: no quedó ningún cambio a medias.',
    staged: 'La verificación anterior ya no es válida. Vuelve a verificar el enlace.',
};

export const importError = (code, extra = {}) => ({ ok: false, code, error: IMPORT_ERRORS[code] || IMPORT_ERRORS.unavailable, ...extra });

// ── Direcciones que nunca se consultan ───────────────────────────────

const v4ToInt = (ip) => ip.split('.').reduce((acc, p) => (acc * 256) + Number(p), 0);
const V4_BLOCKED = [
    ['0.0.0.0', 8],        // «esta» red
    ['10.0.0.0', 8],       // privada
    ['100.64.0.0', 10],    // CGNAT
    ['127.0.0.0', 8],      // loopback
    ['169.254.0.0', 16],   // link-local — incluye 169.254.169.254 (metadatos)
    ['172.16.0.0', 12],    // privada
    ['192.0.0.0', 24],     // asignaciones IETF
    ['192.0.2.0', 24],     // documentación
    ['192.88.99.0', 24],   // 6to4 relay
    ['192.168.0.0', 16],   // privada
    ['198.18.0.0', 15],    // pruebas de rendimiento
    ['198.51.100.0', 24],  // documentación
    ['203.0.113.0', 24],   // documentación
    ['224.0.0.0', 4],      // multicast
    ['240.0.0.0', 4],      // reservada + broadcast
].map(([base, bits]) => [v4ToInt(base), bits]);

const isBlockedV4 = (ip) => {
    if (!net.isIPv4(ip)) return true;
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
        const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
        return ((n & mask) >>> 0) === ((base & mask) >>> 0);
    });
};

/** Expande una IPv6 a sus 8 grupos de 16 bits. `null` si no se puede leer. */
const v6Groups = (ip) => {
    let value = String(ip || '').toLowerCase().split('%')[0];
    // Cola IPv4 incrustada («::ffff:10.0.0.1») → dos grupos hexadecimales.
    const tail = value.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (tail) {
        if (!net.isIPv4(tail[1])) return null;
        const n = v4ToInt(tail[1]);
        value = value.slice(0, -tail[1].length) + `${((n >>> 16) & 0xFFFF).toString(16)}:${(n & 0xFFFF).toString(16)}`;
    }
    const halves = value.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
    const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
    if (fill < 0) return null;
    const groups = [...head, ...Array(fill).fill('0'), ...rest].map(g => parseInt(g || '0', 16));
    return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xFFFF) ? groups : null;
};

const isBlockedV6 = (ip) => {
    const g = v6Groups(ip);
    if (!g) return true;
    const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 0xFF}.${g[7] >> 8}.${g[7] & 0xFF}`;
    if (g.every(x => x === 0)) return true;                                   // ::
    if (g.slice(0, 7).every(x => x === 0) && g[7] === 1) return true;          // ::1
    if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xFFFF) return isBlockedV4(embeddedV4()); // ::ffff:a.b.c.d
    if (g.slice(0, 6).every(x => x === 0)) return true;                        // ::a.b.c.d (obsoleta)
    if (g[0] === 0x64 && g[1] === 0xFF9B && g.slice(2, 6).every(x => x === 0)) return isBlockedV4(embeddedV4()); // NAT64
    if ((g[0] & 0xFE00) === 0xFC00) return true;                               // fc00::/7 única local
    if ((g[0] & 0xFFC0) === 0xFE80) return true;                               // fe80::/10 link-local
    if ((g[0] & 0xFFC0) === 0xFEC0) return true;                               // fec0::/10 site-local
    if ((g[0] & 0xFF00) === 0xFF00) return true;                               // multicast
    if (g[0] === 0x2001 && g[1] === 0x0DB8) return true;                       // documentación
    if (g[0] === 0x2002) return isBlockedV4(`${g[1] >> 8}.${g[1] & 0xFF}.${g[2] >> 8}.${g[2] & 0xFF}`); // 6to4
    if (g[0] === 0x2001 && g[1] === 0) return true;                            // Teredo
    return false;
};

/** ¿Esta dirección es privada, interna, loopback, link-local o reservada? */
export const isBlockedAddress = (ip) => {
    const value = String(ip || '').trim().replace(/^\[|\]$/g, '');
    if (net.isIPv4(value)) return isBlockedV4(value);
    if (net.isIPv6(value)) return isBlockedV6(value);
    return true; // lo que no es una IP no se acepta como dirección
};

// ── Validar el enlace ────────────────────────────────────────────────

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp'];

/**
 * El enlace tal como lo pegó el administrador → `{ ok, url }` o el error.
 * Puro: no consulta el DNS (eso pasa al conectar, ver `guardedLookup`).
 */
export const checkImportUrl = (raw, { allowAnyPort = false, allowAddress = null } = {}) => {
    const text = String(raw ?? '').trim();
    if (!text || text.length > 4000 || /\s/.test(text)) return importError('invalid_url');
    let url;
    try { url = new URL(text); } catch { return importError('invalid_url'); }
    if (url.protocol !== 'https:') return importError('invalid_url');
    if (url.username || url.password) return importError('blocked');
    if (url.port && url.port !== '443' && !allowAnyPort) return importError('blocked');
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host) return importError('invalid_url');
    if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some(s => host.endsWith(s))) return importError('blocked');
    if (net.isIP(host)) {
        if (isBlockedAddress(host) && !(allowAddress && allowAddress(host))) return importError('blocked');
    } else if (!host.includes('.')) {
        // Un nombre sin punto sólo se resuelve dentro de una red interna.
        return importError('blocked');
    }
    url.hash = '';
    return { ok: true, url };
};

/**
 * Enlaces «para ver» de proveedores conocidos → su enlace de DESCARGA directa
 * (el que entrega el archivo y no una página). Sólo cambia la forma del enlace
 * público; si el archivo es privado, el proveedor igual pide iniciar sesión y
 * eso termina en «acceso restringido».
 */
export const normalizeShareUrl = (url) => {
    try {
        const u = new URL(String(url));
        const host = u.hostname.toLowerCase();
        if (host === 'drive.google.com' || host === 'docs.google.com') {
            const byPath = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
            const id = byPath?.[1] || (/^\/(open|uc)$/.test(u.pathname) ? u.searchParams.get('id') : null);
            if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) return `https://drive.google.com/uc?export=download&id=${id}`;
        }
        if (host === 'www.dropbox.com' || host === 'dropbox.com') {
            if (u.searchParams.get('dl') === '0' || !u.searchParams.has('dl')) {
                u.searchParams.set('dl', '1');
                return u.toString();
            }
        }
        return u.toString();
    } catch {
        return String(url);
    }
};

// Parámetros cuyo valor se puede guardar: no son secretos.
const SAFE_QUERY_PARAMS = new Set(['id', 'export', 'dl', 'usp', 'alt', 'format', 'download', 'raw', 'attachment', 'page']);

/**
 * El enlace como REFERENCIA ADMINISTRATIVA: sin usuario/contraseña, sin
 * fragmento y con el VALOR de cada parámetro de la consulta tapado salvo una
 * lista corta de inofensivos. Una URL firmada (S3, Firebase, Drive) lleva su
 * llave en la consulta, y el historial vive años: no se guarda la llave.
 */
export const redactSourceUrl = (raw) => {
    try {
        const u = new URL(String(raw));
        u.username = '';
        u.password = '';
        u.hash = '';
        const pairs = [...u.searchParams.entries()];
        const query = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${SAFE_QUERY_PARAMS.has(k.toLowerCase()) ? encodeURIComponent(v) : '***'}`).join('&');
        return `${u.origin}${u.pathname}${query ? `?${query}` : ''}`.slice(0, 1000);
    } catch {
        return null;
    }
};

export const hostOf = (raw) => { try { return new URL(String(raw)).hostname.toLowerCase(); } catch { return null; } };

// ── El nombre del archivo ────────────────────────────────────────────

const EXT_BY_MIME = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const extensionForMime = (mime) => EXT_BY_MIME[mime] || 'bin';
export const TYPE_LABELS = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' };

const cleanName = (value) => String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);

/** `filename*=UTF-8''…` o `filename="…"` de un Content-Disposition. */
export const filenameFromDisposition = (header) => {
    const value = String(header || '');
    const star = value.match(/filename\*\s*=\s*(?:UTF-8|utf-8)?'[^']*'([^;]+)/);
    if (star) { try { return cleanName(decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))); } catch { /* sigue */ } }
    const plain = value.match(/filename\s*=\s*"([^"]*)"/) || value.match(/filename\s*=\s*([^;]+)/);
    return plain ? cleanName(plain[1].trim()) : '';
};

/**
 * El nombre con el que se guarda: el que escribió el administrador; si no, el
 * que declara el servidor; si no, el último tramo de la ruta (sólo si parece
 * un archivo); si no, «comprobante». SIEMPRE con la extensión del tipo REAL.
 */
export const resolveReceiptName = ({ given, disposition, finalUrl, mime }) => {
    let base = cleanName(given) || filenameFromDisposition(disposition);
    if (!base) {
        try {
            const last = decodeURIComponent(new URL(String(finalUrl)).pathname.split('/').filter(Boolean).pop() || '');
            if (/\.[a-z0-9]{2,5}$/i.test(last)) base = cleanName(last);
        } catch { /* sin nombre en la ruta */ }
    }
    base = base || 'comprobante';
    const ext = extensionForMime(mime);
    const sinExt = base.replace(/\.(pdf|jpe?g|png|webp|gif|heic|bmp|tiff?|bin|html?|php|aspx?)$/i, '').trim() || 'comprobante';
    return `${sinExt}.${ext}`;
};

// ── La conexión ──────────────────────────────────────────────────────

/**
 * El `lookup` del socket: resuelve el nombre, RECHAZA si alguna de sus
 * direcciones es privada y entrega la que se va a usar. Como Node conecta con
 * lo que devuelve este mismo `lookup`, lo validado y lo conectado son lo mismo.
 */
export const guardedLookup = ({ resolve = dns.lookup, allowAddress = null } = {}) => (hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    resolve(hostname, { all: true, verbatim: true }, (err, addresses) => {
        if (err) return callback(err);
        const list = Array.isArray(addresses) ? addresses : [];
        const bloqueada = list.find(a => isBlockedAddress(a.address) && !(allowAddress && allowAddress(a.address)));
        if (!list.length || bloqueada) {
            const e = new Error('Dirección no permitida para importar un comprobante.');
            e.code = 'EBLOCKEDADDRESS';
            return callback(e);
        }
        const family = Number(options?.family) || 0;
        const usable = family ? list.filter(a => a.family === family) : list;
        if (!usable.length) {
            const e = new Error('Sin direcciones utilizables.');
            e.code = 'ENOTFOUND';
            return callback(e);
        }
        if (options?.all) return callback(null, usable);
        return callback(null, usable[0].address, usable[0].family);
    });
};

const statusVerdict = (status) => {
    if ([401, 403, 407].includes(status)) return 'restricted';
    if ([404, 410].includes(status)) return 'not_found';
    if (status === 429 || status >= 500) return 'unavailable';
    return 'not_found';
};

/** Una sola petición GET, sin seguir redirecciones. Resuelve con la respuesta o con un código de error. */
const requestOnce = (url, { lookup, ca, deadline, maxBytes, allowAnyPort }) => new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const remaining = deadline - Date.now();
    if (remaining <= 0) return done(importError('timeout'));

    const req = https.request({
        protocol: 'https:',
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: allowAnyPort && url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        servername: net.isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
        headers: {
            // Nada de Club Platform viaja: ni cookies, ni Authorization, ni Referer.
            'User-Agent': IMPORT_USER_AGENT,
            Accept: 'application/pdf,image/jpeg,image/png,image/webp,*/*;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
        },
        lookup,
        ca,
        agent: false,
        timeout: IMPORT_CONNECT_TIMEOUT_MS,
    });

    const timer = setTimeout(() => { req.destroy(); done(importError('timeout')); }, remaining);
    const fin = (value) => { clearTimeout(timer); done(value); };

    req.on('timeout', () => { req.destroy(); fin(importError('timeout')); });
    req.on('error', (err) => {
        if (err?.code === 'EBLOCKEDADDRESS') return fin(importError('blocked'));
        if (['ENOTFOUND', 'EAI_AGAIN'].includes(err?.code)) return fin(importError('not_found', { reason: 'dns' }));
        return fin(importError('unreachable', { reason: err?.code || 'error' }));
    });
    req.on('response', (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            return fin({ ok: true, redirect: String(res.headers.location) });
        }
        if (status !== 200) {
            res.resume();
            return fin(importError(statusVerdict(status), { httpStatus: status }));
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
            // Primero el desenlace, después cortar: `destroy()` emite
            // «aborted» y ganaría con un motivo equivocado.
            fin(importError('too_large', { bytes: declared }));
            return res.destroy();
        }
        const encoding = String(res.headers['content-encoding'] || '').toLowerCase().trim();
        let stream = res;
        if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks = [];
        let total = 0;
        stream.on('data', (chunk) => {
            if (settled) return;
            total += chunk.length;
            if (total > maxBytes) {
                fin(importError('too_large'));
                res.destroy();
                if (stream !== res) stream.destroy();
                return;
            }
            chunks.push(chunk);
        });
        stream.on('end', () => fin({
            ok: true,
            body: Buffer.concat(chunks),
            contentType: String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase() || null,
            disposition: res.headers['content-disposition'] || null,
        }));
        stream.on('error', () => fin(importError('unreachable', { reason: 'stream' })));
        res.on('aborted', () => fin(importError('unreachable', { reason: 'aborted' })));
    });
    req.end();
});

/**
 * Descarga el comprobante del enlace. Devuelve:
 *   { ok: true, buffer, mime, bytes, sha256, disposition, finalUrl, redirects, normalizedUrl }
 *   { ok: false, code, error }
 *
 * `testing` sólo lo usa la prueba (servidor HTTPS local con certificado
 * propio): ninguna ruta del servidor lo pasa.
 */
export const fetchReceiptFromUrl = async (rawUrl, { maxBytes = RECEIPT_MAX_BYTES, testing = null } = {}) => {
    const rules = { allowAnyPort: Boolean(testing?.allowAnyPort), allowAddress: testing?.allowAddress || null };
    const first = checkImportUrl(rawUrl, rules);
    if (!first.ok) return first;
    const normalizedUrl = normalizeShareUrl(first.url.toString());
    const lookup = guardedLookup({ resolve: testing?.resolve || dns.lookup, allowAddress: testing?.allowAddress || null });
    const deadline = Date.now() + (testing?.totalTimeoutMs || IMPORT_TOTAL_TIMEOUT_MS);

    let current = new URL(normalizedUrl);
    let redirects = 0;
    for (;;) {
        // El host que es una IP literal no pasa por `lookup` (Node conecta
        // directo): `checkImportUrl` ya lo revisó, en el enlace y en cada salto.
        const out = await requestOnce(current, { lookup, ca: testing?.ca, deadline, maxBytes, allowAnyPort: rules.allowAnyPort });
        if (!out.ok) return out;
        if (out.redirect) {
            redirects += 1;
            if (redirects > IMPORT_MAX_REDIRECTS) return importError('too_many_redirects');
            let next;
            try { next = new URL(out.redirect, current); } catch { return importError('invalid_url'); }
            // Cada salto pasa por las MISMAS reglas que el enlace pegado:
            // HTTPS, puerto 443, sin credenciales, sin hosts internos.
            const juicio = checkImportUrl(next.toString(), rules);
            if (!juicio.ok) return juicio.code === 'invalid_url' ? importError('blocked', { reason: 'redirect' }) : juicio;
            current = next;
            continue;
        }
        const buffer = out.body;
        if (!buffer.length) return importError('empty');
        const mime = receiptKindOf(buffer);
        if (!mime) {
            const head = buffer.subarray(0, 512).toString('latin1').trimStart().toLowerCase();
            const pareceHtml = out.contentType === 'text/html' || head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<');
            return importError(pareceHtml ? 'html' : 'unsupported', { declaredType: out.contentType || null });
        }
        return {
            ok: true,
            buffer,
            mime,
            bytes: buffer.length,
            sha256: createHash('sha256').update(buffer).digest('hex'),
            disposition: out.disposition,
            declaredType: out.contentType,
            finalUrl: current.toString(),
            normalizedUrl,
            redirects,
        };
    }
};

export default {
    IMPORT_ERRORS, importError, isBlockedAddress, checkImportUrl, normalizeShareUrl, redactSourceUrl, hostOf,
    resolveReceiptName, filenameFromDisposition, extensionForMime, guardedLookup, fetchReceiptFromUrl, TYPE_LABELS,
};
