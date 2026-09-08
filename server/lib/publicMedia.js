/**
 * El acceso PÚBLICO a un archivo de la Biblioteca de Medios.
 *
 * ⚠️ LA CAUSA QUE ABRIÓ ESTE MÓDULO NO ERA DE PERMISOS. Un PDF de la Carta del
 * Gobernador daba `AccessDenied` en el móvil y abría bien en el escritorio.
 * Medido contra el bucket real:
 *
 *   .../documents/…Edicio%CC%81n,_Julio-Agosto_(Rotary_4281).pdf  → 200 (15,2 MB)
 *   .../documents/…Edici%C3%B3n,_Julio-Agosto_(Rotary_4281).pdf   → 403 AccessDenied
 *
 * Son la MISMA palabra: «Edición» descompuesta (NFD, la `o` y su tilde por
 * separado — así la escribe macOS en el nombre de archivo) y compuesta (NFC,
 * un solo carácter). La clave real del objeto es la primera. Un cliente que
 * normaliza la dirección a NFC —iOS/Safari y los navegadores integrados de
 * WhatsApp lo hacen— pide una clave que NO EXISTE, y como el bucket no concede
 * `s3:ListBucket` anónimo (comprobado: listar da 403), S3 **disfraza el 404 de
 * 403 AccessDenied**. De ahí que se leyera como un problema de permisos.
 *
 * De eso salen las dos mitades de este módulo:
 *
 *  1. `canonicalObjectName` — una clave de S3 nueva NO lleva caracteres que un
 *     cliente pueda normalizar. El nombre bonito se conserva aparte, en
 *     `Media.filename`, y viaja en el `Content-Disposition`.
 *  2. `publicMediaPath` — la dirección que se comparte es NUESTRA y sólo lleva
 *     el id del archivo. No hay Unicode que normalizar, no caduca, no depende
 *     de una sesión y sobrevive a que el objeto cambie de sitio en S3.
 *
 * Es PURO a propósito: sin base, sin red, sin SDK. Un criterio de acceso que
 * sólo se ejercita contra S3 termina sin pruebas, y entonces nadie se entera
 * de que un prefijo privado dejó de estarlo.
 */

/**
 * Los prefijos que NUNCA se sirven por la vía pública. Catálogo CERRADO: lo
 * que no está declarado acá no se puede volver privado por descuido, y lo que
 * está no se puede abrir sin tocar esta lista.
 *
 * Son los tres que la plataforma ya usa para documentos que no son de nadie
 * más que de quien los subió: comprobantes de pago de inscripciones, material
 * de una solicitud de contenido antes de aprobarse y adjuntos de correo.
 */
export const PRIVATE_PREFIXES = Object.freeze(['private/']);

/**
 * Lo que no es secreto pero TAMPOCO es de la Biblioteca: el prefijo temporal
 * donde aterriza la fotografía anónima del portal de Plantillas IA para que el
 * motor generativo pueda descargarla. Se vacía con una regla de ciclo de vida,
 * así que un enlace estable hacia ahí prometería un archivo que va a
 * desaparecer. Se distingue de `privado` porque se corrige en otro sitio.
 */
export const EPHEMERAL_PREFIXES = Object.freeze(['public-tmp/']);

/** ¿La clave cae bajo un prefijo que NUNCA se sirve sin autenticación? */
export function isPrivateKey(key) {
    const k = String(key ?? '').replace(/^\/+/, '');
    if (!k) return true; // sin clave no hay nada que servir: el lado seguro.
    return PRIVATE_PREFIXES.some(p => k.startsWith(p));
}

/** ¿La clave apunta a un objeto que se va a borrar solo? */
export function isEphemeralKey(key) {
    const k = String(key ?? '').replace(/^\/+/, '');
    return EPHEMERAL_PREFIXES.some(p => k.startsWith(p));
}

/**
 * ¿Este archivo se puede entregar a alguien sin sesión, y si no, por qué?
 *
 * Devuelve el MOTIVO además del veredicto: «no se puede» a secas obliga a
 * diagnosticar a ciegas, y acá las tres causas —no existe, es privado, no
 * tiene objeto detrás— se corrigen en sitios distintos.
 */
export function servability(media) {
    if (!media || typeof media !== 'object') {
        return { ok: false, reason: 'no_existe' };
    }
    const key = objectKeyOf(media);
    if (!key) return { ok: false, reason: 'sin_objeto' };
    if (isPrivateKey(key)) return { ok: false, reason: 'privado' };
    if (isEphemeralKey(key)) return { ok: false, reason: 'efimero' };
    return { ok: true, reason: null, key };
}

/**
 * La clave del objeto, mirando primero la columna y después la URL guardada.
 *
 * `s3Key` es la fuente de verdad y existe desde hace versiones, pero hay filas
 * anteriores que sólo guardaron la `url` — derivarla de ahí es lo que hace que
 * esta vía sirva TAMBIÉN los archivos viejos, sin migrar una sola fila.
 */
export function objectKeyOf(media) {
    const directa = String(media?.s3Key ?? '').replace(/^\/+/, '').trim();
    if (directa) return directa;
    return keyFromBucketUrl(media?.url, { bucket: media?.bucket }) || '';
}

/**
 * De una URL de nuestro bucket a su clave, ya decodificada.
 *
 * Se decodifica a propósito: la clave que va al SDK son los BYTES del objeto,
 * no su forma percent-encoded — firmarla codificada la buscaría con los `%` de
 * verdad dentro del nombre. Y **no se normaliza a NFC ni a NFD**: normalizar
 * acá es exactamente el defecto que este módulo existe para no repetir.
 */
export function keyFromBucketUrl(url, { bucket = null } = {}) {
    const raw = String(url ?? '').trim();
    if (!raw) return null;
    let u;
    try { u = new URL(raw); } catch { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

    const host = u.hostname.toLowerCase();
    // Las dos formas en que S3 nombra un objeto: `bucket.s3.region.amazonaws.com/key`
    // y `s3.region.amazonaws.com/bucket/key`.
    const esS3 = /(^|\.)s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host) || host === 's3.amazonaws.com';
    if (!esS3) return null;

    let ruta = u.pathname.replace(/^\/+/, '');
    const sub = host.endsWith('.amazonaws.com') ? host.split('.s3')[0] : '';
    const propio = sub && sub !== host ? sub : null;

    if (!propio) {
        // Forma con el bucket en la ruta: el primer segmento es el bucket.
        const corte = ruta.indexOf('/');
        if (corte < 0) return null;
        const enRuta = ruta.slice(0, corte);
        if (bucket && enRuta !== bucket) return null;
        ruta = ruta.slice(corte + 1);
    } else if (bucket && propio !== bucket) {
        return null;
    }

    if (!ruta) return null;
    try {
        return ruta.split('/').map(decodeURIComponent).join('/');
    } catch {
        return null; // percent-encoding inválido: no se adivina.
    }
}

/** ¿Esta dirección apunta a un objeto de NUESTRO bucket? */
export function pointsToOwnBucket(url, { bucket }) {
    if (!bucket) return false;
    return keyFromBucketUrl(url, { bucket }) !== null;
}

/**
 * El nombre de archivo saneado con el que se compone una clave de S3 NUEVA.
 *
 * ⚠️ ES LA MITAD ESTRUCTURAL DE LA CORRECCIÓN. Una clave que sólo contiene
 * `[A-Za-z0-9._-]` no tiene forma compuesta ni descompuesta, así que ningún
 * cliente puede pedir una variante que no existe. El acento no se «pierde»:
 * el nombre original se guarda íntegro en `Media.filename` y es el que ve el
 * usuario al descargar.
 *
 * Los paréntesis y las comas también salen. Son legales en S3 y son justo los
 * que cada cliente codifica a su manera —unos los dejan crudos, otros los
 * escapan—, así que una clave con ellos tiene más de una dirección válida.
 */
export function canonicalObjectName(name, { maxLength = 120 } = {}) {
    const original = String(name ?? '').trim();
    const punto = original.lastIndexOf('.');
    const tieneExt = punto > 0 && punto < original.length - 1;

    const base = tieneExt ? original.slice(0, punto) : original;
    const ext = tieneExt ? original.slice(punto + 1) : '';

    const limpio = (texto) => texto
        .normalize('NFD')                    // separa la letra de su tilde…
        .replace(/[̀-ͯ]/g, '')     // …y la tilde se descarta.
        .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    let nombre = limpio(base).slice(0, maxLength);
    if (!nombre) nombre = 'archivo';

    const extension = limpio(ext).toLowerCase().slice(0, 12);
    return extension ? `${nombre}.${extension}` : nombre;
}

/**
 * La dirección pública y ESTABLE de un archivo.
 *
 * El id es lo único que decide qué se sirve; el nombre que va detrás es
 * decorativo —para que el enlace se lea y para que el navegador acierte con el
 * nombre al guardar— y **no se comprueba**: si alguien lo cambia, se sigue
 * sirviendo el mismo archivo. Con el nombre dentro de la comprobación, un
 * enlace ya repartido dejaría de funcionar al renombrar el archivo.
 */
export function publicMediaPath(id, filename = '') {
    const clave = String(id ?? '').trim();
    if (!clave) return null;
    const bonito = canonicalObjectName(filename);
    return bonito && bonito !== 'archivo'
        ? `/api/public/media/${encodeURIComponent(clave)}/${encodeURIComponent(bonito)}`
        : `/api/public/media/${encodeURIComponent(clave)}`;
}

/** La misma dirección, absoluta, para copiarla o mandarla por WhatsApp. */
export function publicMediaUrl(id, filename = '', origin = '') {
    const ruta = publicMediaPath(id, filename);
    if (!ruta) return null;
    const base = String(origin ?? '').replace(/\/+$/, '');
    return base ? `${base}${ruta}` : ruta;
}

/**
 * Qué tipos se enseñan DENTRO del navegador y cuáles se bajan.
 *
 * El PDF va inline porque es lo que la gente espera al pulsar «Carta del
 * Gobernador», y porque iOS lo dibuja de sobra. Lo que no se puede dibujar se
 * marca `attachment` en vez de dejar que el navegador decida: un `.docx`
 * servido inline abre una pestaña en blanco.
 */
export const INLINE_TYPES = Object.freeze([
    'application/pdf',
    'image/', 'video/', 'audio/',
    'text/plain',
]);

export function isInlineType(contentType) {
    const t = String(contentType ?? '').toLowerCase().split(';')[0].trim();
    if (!t) return false;
    return INLINE_TYPES.some(p => (p.endsWith('/') ? t.startsWith(p) : t === p));
}

/**
 * El `Content-Disposition`, con las DOS formas del nombre.
 *
 * `filename=` va en ASCII para el cliente que no entiende la otra, y
 * `filename*=UTF-8''…` lleva el nombre real con sus tildes. Mandar sólo el
 * segundo deja a algún cliente viejo sin nombre; sólo el primero le quita la
 * tilde a todo el mundo.
 */
export function contentDispositionFor(filename, { download = false, contentType = '' } = {}) {
    const modo = download || !isInlineType(contentType) ? 'attachment' : 'inline';
    const real = String(filename ?? '').trim();
    if (!real) return modo;
    const ascii = canonicalObjectName(real).replace(/"/g, '');
    return `${modo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(real)}`;
}

/** El tipo con el que se responde, mirando la columna y cayendo a la extensión. */
const POR_EXTENSION = {
    pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', heic: 'image/heic',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    mp3: 'audio/mpeg', m4a: 'audio/mp4',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv', txt: 'text/plain', zip: 'application/zip',
};

export function contentTypeFor({ contentType = '', filename = '', key = '' } = {}) {
    const declarado = String(contentType ?? '').toLowerCase().split(';')[0].trim();
    // `application/octet-stream` es lo que manda el carrete de un móvil cuando
    // no sabe qué es: no se toma por bueno, se deduce de la extensión.
    if (declarado && declarado !== 'application/octet-stream') return declarado;
    const fuente = String(filename || key || '');
    const ext = fuente.slice(fuente.lastIndexOf('.') + 1).toLowerCase();
    return POR_EXTENSION[ext] || 'application/octet-stream';
}

export default {
    PRIVATE_PREFIXES, EPHEMERAL_PREFIXES, isPrivateKey, isEphemeralKey, servability, objectKeyOf,
    keyFromBucketUrl, pointsToOwnBucket, canonicalObjectName,
    publicMediaPath, publicMediaUrl, isInlineType, contentDispositionFor, contentTypeFor,
};
