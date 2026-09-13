// ════════════════════════════════════════════════════════════════════════════
// Compartir contenido en redes — el CRITERIO (v4.1013)
//
// **Puro**: sin base, sin red, sin Meta, sin DOM. Decide qué red puede recibir
// qué contenido, si una entidad se puede compartir, qué texto se manda, cómo
// se llama cada fallo y qué se le dice a quien lo ve.
//
// Vive aparte de la orquestación por el mismo motivo que `seoRules.js` vive
// aparte de `seoAudit.js`: un motor que sólo se ejercita contra Meta y una base
// real termina sin pruebas, y entonces nadie se entera de que una regla cambió
// de signo.
//
// ⚠️ NO HAY UN SEGUNDO MOTOR DE META. Quien habla con la Graph API es
// `services/socialPublishService.js` (`publishContentToTarget`), el mismo que
// usa la Distribución multi-destino. Acá se decide QUÉ se le pide; allá, CÓMO
// se le pide. Con dos caminos hacia el proveedor, el día que se corrija el
// manejo de un error de Meta una mitad se queda atrás y el fallo es MUDO: las
// dos siguen publicando.
// ════════════════════════════════════════════════════════════════════════════

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ─── Las redes ──────────────────────────────────────────────────────────────
//
// ⚠️ `available` NO ES UNA PREFERENCIA: dice si existe el adaptador. LinkedIn y
// X están declarados y sin implementar — el único proveedor conectado es Meta
// (`socialPublishingController` sólo tiene OAuth de Facebook e Instagram).
// Ofrecerlos daría una casilla que no hace nada (regla del sitio desde v4.650)
// y, peor acá, una que promete que la noticia salió.
//
// `linkable` dice si la red publica un ENLACE, que es la forma de un artículo.
// Instagram NO: su pie no admite enlaces pulsables, así que un artículo
// compartido ahí sería una URL que nadie puede tocar. Se dice con esas
// palabras en vez de esconderlo.
export const NETWORKS = [
    {
        id: 'facebook',
        label: 'Facebook',
        available: true,
        linkable: true,
        // ⚠️ `kinds` ES EL DESTINO DE UNA PÁGINA, NO DE UN GRUPO (v4.1042). La
        // Página publica por la Graph API (`/{page}/feed` y `/{page}/videos`);
        // un grupo NO tiene endpoint desde que Meta retiró la Groups API el 22
        // de abril de 2024, y por eso vive en otro módulo con otro tipo de
        // destino (`group_manual` en `distributionSpec.js`). Acá no hay grupos.
        kinds: ['link', 'video'],
        note: null,
    },
    {
        id: 'instagram',
        label: 'Instagram',
        available: true,
        linkable: false,
        // Instagram sí recibe un Reel: `media_type=REELS` con `video_url`. Lo
        // que no recibe es un enlace suelto.
        kinds: ['video'],
        note: 'Instagram no publica enlaces: su pie no los hace pulsables. Para llevar tráfico al artículo, usá Facebook.',
    },
    {
        id: 'linkedin',
        label: 'LinkedIn',
        available: false,
        linkable: true,
        kinds: ['link'],
        note: 'Todavía no hay conexión de LinkedIn en la plataforma. El único proveedor conectado es Meta.',
    },
    {
        id: 'x',
        label: 'X (Twitter)',
        available: false,
        linkable: true,
        kinds: ['link'],
        note: 'Todavía no hay conexión de X en la plataforma. El único proveedor conectado es Meta.',
    },
];

export const NETWORK_IDS = NETWORKS.map(n => n.id);
export const networkOf = (id) => NETWORKS.find(n => n.id === str(id)) || null;

/** Las redes que pueden recibir un ENLACE hoy. Es lo que un artículo necesita. */
export const linkNetworks = () => NETWORKS.filter(n => n.available && n.linkable).map(n => n.id);

/** ¿Esta red puede con esta forma de contenido? Es UN solo punto de decisión:
 *  lo consultan `accountReadiness` (para decir qué cuenta sirve) y el modal
 *  (para pintarla). Escrito dos veces, la pantalla ofrecería una cuenta que el
 *  servidor rechaza — y eso se lee como que el módulo está roto. */
export const networkSupports = (network, kind) => {
    const net = typeof network === 'string' ? networkOf(network) : network;
    if (!net || !net.available) return false;
    const kinds = Array.isArray(net.kinds) ? net.kinds : (net.linkable ? ['link'] : []);
    return kinds.includes(str(kind) || 'link');
};

/** Las redes que pueden recibir un VIDEO hoy: Página de Facebook e Instagram. */
export const videoNetworks = () => NETWORKS.filter(n => networkSupports(n, 'video')).map(n => n.id);

// ─── Qué FORMA tiene lo que se comparte ─────────────────────────────────────
//
// ⚠️ EL `kind` LO DECIDE LA ENTIDAD, NO QUIEN PULSA (v4.1042). Un artículo es
// un ENLACE —la imagen y el titular los resuelve Facebook leyendo el Open
// Graph— y un Reel es un VIDEO: el archivo ya montado que vive en la
// Biblioteca. De esa diferencia cuelga todo lo demás: con `link`, Instagram no
// es un destino posible (su pie no hace pulsable una URL); con `video`, sí —y
// es el destino principal de un Reel vertical—.
export const SHARE_KINDS = {
    link:  { label: 'Enlace', needsLink: true,  needsMedia: false },
    video: { label: 'Video',  needsLink: false, needsMedia: true  },
};
export const SHARE_KIND_IDS = Object.keys(SHARE_KINDS);
export const isShareKind = (k) => Object.prototype.hasOwnProperty.call(SHARE_KINDS, str(k));

const ENTITY_KINDS = { post: 'link', event: 'link', project: 'link', campaign: 'link', reel: 'video' };

/** La forma que le toca a cada entidad. Catálogo, no deducción: el día que una
 *  entidad nueva se comparta como video, entra acá y el resto no cambia. */
export const shareKindOf = (entityType) => ENTITY_KINDS[str(entityType)] || 'link';

// ─── Lo que Instagram exige de un video ─────────────────────────────────────
//
// Los límites DECLARADOS de un contenedor `media_type=REELS`, tal como los
// publica Meta. Se comprueban ANTES de gastar la llamada porque el rechazo del
// proveedor llega como un código que no explica qué corregir.
//
// ⚠️ NO SE RECHAZA DE MÁS. Sólo bloquea lo que Meta rechaza seguro —una
// duración fuera de rango, una extensión que no acepta, una URL que no puede
// descargar—; lo demás AVISA con su consecuencia. Es la regla del Outro
// importado (v4.1036): un control demasiado estricto no falla ruidosamente,
// deja sin publicar una pieza que servía.
export const IG_VIDEO_LIMITS = {
    minDurationSec: 3,
    maxDurationSec: 900,          // 15 minutos
    minAspect: 0.01,
    maxAspect: 10,
    containers: ['mp4', 'mov'],
    maxBytes: 1024 * 1024 * 1024, // 1 GB
    recommendedAspect: 9 / 16,
};

const extensionDe = (url) => {
    const limpia = str(url).split('?')[0].split('#')[0];
    const punto = limpia.lastIndexOf('.');
    return punto > 0 ? limpia.slice(punto + 1).toLowerCase() : '';
};

/** ¿Meta va a poder DESCARGAR este archivo? Es la condición que comparten la
 *  Página y la cuenta de Instagram: los dos reciben una URL y la bajan ellos
 *  —el archivo ya vive en S3 y subirlo por partes desde una función que corta
 *  a los 300 s sería pagar dos veces el mismo tránsito (v4.864)—. */
export const mediaReachable = (url) => {
    const u = str(url);
    if (!u) return { ok: false, reason: 'Este contenido todavía no tiene archivo montado.', fix: null };
    if (!/^https?:\/\//i.test(u)) {
        return { ok: false, reason: 'La dirección del archivo no es una URL absoluta, así que Meta no puede descargarlo.', fix: null };
    }
    if (/^http:\/\//i.test(u)) {
        return { ok: false, reason: 'La dirección del archivo no es https y Meta no descarga por http.', fix: null };
    }
    return { ok: true, reason: null, fix: null };
};

/**
 * Lo que se sabe del archivo de una entidad, en la forma que espera
 * `videoReadiness`.
 *
 * ⚠️ ES EL ÚNICO PUNTO QUE TRADUCE LA ENTIDAD AL ARCHIVO, y hace falta porque
 * los dos nombres existen: la entidad llama `mediaUrl` a su master —es lo que
 * viaja al navegador y lo que se guarda en el registro de difusión— y el
 * criterio del archivo lo llama `url`. Con la traducción escrita en cada punto
 * de llamada, el que se olvide lee `undefined`, lo toma por «sin archivo» y
 * deja TODAS las cuentas sin poder publicar — sin ningún error, porque el
 * motivo que se pinta es exactamente el de un Reel a medio montar.
 */
export const videoOf = (entity = {}) => ({
    url: str(entity.url) || str(entity.mediaUrl),
    durationSec: entity.durationSec,
    width: entity.width,
    height: entity.height,
    sizeBytes: entity.sizeBytes,
});

/**
 * Si este video puede salir por esta red, con lo que se SABE del archivo.
 *
 * Devuelve `{ ok, code, reason, fix, warnings }`. Los avisos NO bloquean: un
 * 16:9 en Instagram se publica y se ve recortado, y decirlo es más útil que
 * impedirlo.
 */
export const videoReadiness = ({ network, video = {} } = {}) => {
    const avisos = [];
    const archivo = videoOf(video);
    const alcanzable = mediaReachable(archivo.url);
    if (!alcanzable.ok) return { ok: false, code: 'media_unreachable', reason: alcanzable.reason, fix: alcanzable.fix, warnings: avisos };

    const net = typeof network === 'string' ? networkOf(network) : network;
    if (!networkSupports(net, 'video')) {
        return { ok: false, code: 'kind_unsupported', reason: `${net?.label || network} no publica video desde la plataforma.`, fix: null, warnings: avisos };
    }

    const dur = Number(archivo.durationSec);
    const w = Number(archivo.width), h = Number(archivo.height);
    const ext = extensionDe(archivo.url);

    if (net.id === 'instagram') {
        const L = IG_VIDEO_LIMITS;
        if (ext && !L.containers.includes(ext)) {
            return {
                ok: false, code: 'ig_container',
                reason: `Instagram sólo acepta ${L.containers.join(' y ').toUpperCase()} y este archivo es .${ext}.`,
                fix: null, warnings: avisos,
            };
        }
        if (Number.isFinite(dur) && dur > 0) {
            if (dur < L.minDurationSec) {
                return {
                    ok: false, code: 'ig_too_short',
                    reason: `Instagram no publica un Reel de menos de ${L.minDurationSec} s y éste dura ${dur.toFixed(1)} s.`,
                    fix: 'Alargá la pieza —por ejemplo con un outro— y volvé a montarla.', warnings: avisos,
                };
            }
            if (dur > L.maxDurationSec) {
                return {
                    ok: false, code: 'ig_too_long',
                    reason: `Instagram no publica un Reel de más de ${Math.round(L.maxDurationSec / 60)} minutos y éste dura ${Math.round(dur)} s.`,
                    fix: null, warnings: avisos,
                };
            }
        } else {
            avisos.push('No se pudo medir la duración de este video, así que no se comprobó contra el límite de Instagram (3 s a 15 min).');
        }
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            const rel = w / h;
            if (rel < L.minAspect || rel > L.maxAspect) {
                return {
                    ok: false, code: 'ig_aspect',
                    reason: `Instagram no acepta esta relación de aspecto (${w}×${h}).`,
                    fix: null, warnings: avisos,
                };
            }
            if (rel > 1) avisos.push(`Este video es apaisado (${w}×${h}). Instagram lo va a mostrar recortado al centro: un Reel se ve entero en vertical (9:16).`);
        }
        if (Number.isFinite(Number(archivo.sizeBytes)) && Number(archivo.sizeBytes) > L.maxBytes) {
            return { ok: false, code: 'ig_too_big', reason: 'El archivo supera el gigabyte que admite Instagram.', fix: null, warnings: avisos };
        }
    }

    if (net.id === 'facebook' && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w / h > 1) {
        avisos.push('En Facebook este video sale como publicación de video normal, no como Reel: un apaisado se ve completo.');
    }

    return { ok: true, code: null, reason: null, fix: null, warnings: avisos };
};

// ─── Qué entidades se comparten ─────────────────────────────────────────────
//
// Catálogo CERRADO. `entityType` viaja desde el navegador y termina en un
// `WHERE`: sin esta puerta, cualquier cadena entraría a la consulta. Hoy sólo
// `post` tiene resolutor; los demás quedan DECLARADOS para que agregarlos sea
// una entrada más y su resolutor, no tocar el servicio (requisito 15).
export const ENTITY_TYPES = ['post', 'event', 'project', 'campaign', 'reel'];
export const isEntityType = (v) => ENTITY_TYPES.includes(str(v));

// ─── Estados de la DIFUSIÓN ─────────────────────────────────────────────────
//
// ⚠️ NO SE MEZCLAN CON EL ESTADO EDITORIAL DEL ARTÍCULO (requisito 11). Un
// artículo «Publicado en sitio» puede estar «No publicado en Facebook», y son
// dos hechos distintos sobre la misma pieza: fundirlos haría que despublicar
// del sitio pareciera retirar lo que ya salió a una red, que es falso — lo
// publicado en Facebook sigue ahí.
export const SHARE_STATES = [
    { key: 'published', label: 'Publicado', tone: 'ok' },
    { key: 'error', label: 'Error de publicación', tone: 'bad' },
    { key: 'pending', label: 'Enviando…', tone: 'wait' },
];
export const SHARE_STATE_KEYS = SHARE_STATES.map(s => s.key);
export const shareStateOf = (key) => SHARE_STATES.find(s => s.key === str(key)) || null;

// ─── Puede compartirse ──────────────────────────────────────────────────────
//
// ⚠️ UN BORRADOR NO SE COMPARTE, y el motivo no es de estilo: la URL pública
// de un artículo sin publicar devuelve 404, así que Facebook mostraría una
// tarjeta rota y el enlace no llevaría a ninguna parte. Es el requisito 3
// aplicado al requisito 8.
//
// Devuelve `{ ok, reason, fix }` — nunca un booleano suelto: un bloqueo sin
// motivo y sin salida se lee como una avería (la lección de v4.1008).
export const shareability = ({ post = null, publicUrl = '' } = {}) => {
    if (!post) return { ok: false, reason: 'El artículo no existe o no pertenece a este sitio.', fix: null };
    if (!post.published) {
        return {
            ok: false,
            reason: 'Este artículo todavía no está publicado.',
            fix: 'Publicalo en el sitio y volvé a compartirlo: mientras sea borrador, su dirección pública devuelve 404 y Facebook mostraría una tarjeta rota.',
        };
    }
    if (!str(publicUrl)) {
        return {
            ok: false,
            reason: 'No se pudo resolver la dirección pública de este artículo.',
            fix: 'El sitio no tiene dominio ni subdominio configurado. Se define en Configuración → Identidad.',
        };
    }
    if (!/^https?:\/\//i.test(str(publicUrl))) {
        return { ok: false, reason: 'La dirección pública del artículo no es una URL absoluta.', fix: null };
    }
    return { ok: true, reason: null, fix: null };
};

// ─── Puede publicar esta cuenta ─────────────────────────────────────────────
//
// El motivo por el que una cuenta NO sirve se dice con su SALIDA. «No se pudo
// publicar» a secas obliga a diagnosticar a ciegas (requisito 8): un token
// vencido, una cuenta sin permiso de publicación y una red sin adaptador se
// corrigen en tres sitios distintos.
export const PAGE_PUBLISH_TASKS = ['CREATE_CONTENT', 'MANAGE'];

export const accountReadiness = (account, { kind = 'link' } = {}) => {
    if (!account) return { ok: false, code: 'not_found', reason: 'La cuenta no existe o no pertenece a este sitio.', fix: null };

    const net = networkOf(account.platform);
    if (!net || !net.available) {
        return {
            ok: false, code: 'network_unavailable',
            reason: `La red '${account.platform}' no tiene adaptador en la plataforma.`,
            fix: null,
        };
    }
    if (!networkSupports(net, kind)) {
        // El motivo lo escribe la red cuando lo tiene declarado —el de
        // Instagram explica POR QUÉ no recibe un enlace—; si no, se dice qué
        // forma se estaba pidiendo en vez de un «no se puede» a secas.
        const forma = SHARE_KINDS[str(kind)]?.label || str(kind);
        return {
            ok: false, code: 'kind_unsupported',
            reason: net.note || `${net.label} no publica «${forma}» desde la plataforma.`,
            fix: null,
        };
    }
    // ⚠️ UN TOKEN LEGACY NO SE USA. `tokenVersion === 0` son las filas
    // anteriores al cifrado (v4.554): están en claro y no se puede afirmar que
    // sigan siendo válidas. Reconectar las reescribe cifradas.
    if (Number(account.tokenVersion || 0) === 0) {
        return {
            ok: false, code: 'token_legacy',
            reason: 'Esta página quedó conectada con el formato anterior de credenciales.',
            fix: 'Reconectala desde Configuración → Redes Sociales (Hub Social).',
        };
    }
    if (str(account.status) !== 'active') {
        const porQue = {
            expired: 'El acceso a esta página venció.',
            revoked: 'Esta página revocó la autorización de la plataforma.',
            error: 'La última verificación de esta página falló.',
        }[str(account.status)] || `Esta página está en estado '${account.status}'.`;
        return {
            ok: false, code: `account_${str(account.status) || 'inactive'}`,
            reason: porQue,
            fix: 'Reconectala desde Configuración → Redes Sociales (Hub Social).',
        };
    }
    if (account.expiresAt && new Date(account.expiresAt).getTime() < Date.now()) {
        return {
            ok: false, code: 'token_expired',
            reason: 'La credencial de esta página venció.',
            fix: 'Reconectala desde Configuración → Redes Sociales (Hub Social).',
        };
    }
    // Los permisos que Meta declara para la página. Se COMPRUEBAN cuando
    // vienen; su ausencia no descalifica —hay conexiones antiguas que no los
    // guardaron— porque equivocarse hacia el otro lado deja a alguien sin
    // poder publicar en una página que sí administra. Meta rechaza igual, y
    // entonces el motivo llega textual.
    const tasks = Array.isArray(account.metadata?.tasks) ? account.metadata.tasks : null;
    if (tasks && tasks.length && !tasks.some(t => PAGE_PUBLISH_TASKS.includes(str(t).toUpperCase()))) {
        return {
            ok: false, code: 'no_permission',
            reason: 'Tu usuario no tiene permiso para publicar en esta página.',
            fix: 'Pedile a un administrador de la página que te dé el rol de creación de contenido en Meta Business.',
        };
    }
    return { ok: true, code: null, reason: null, fix: null };
};

// ─── El texto que se publica ────────────────────────────────────────────────
//
// El copy estratégico del artículo es el DEFECTO, no una imposición: quien
// comparte lo puede editar sin tocar el artículo (requisito 6). Sin copy se
// cae al extracto y después al titular — nunca se manda un mensaje vacío, que
// Meta rechaza con un error que no explica nada.
export const SHARE_MESSAGE_MAX = 63206; // el tope real de un post de Facebook

export const defaultShareMessage = (post = {}) =>
    str(post.socialCopy) || str(post.excerpt) || str(post.title) || '';

/** Lo que se le manda al adaptador de Meta.
 *
 *  Un artículo es SIEMPRE un enlace: la imagen y el titular los resuelve
 *  Facebook leyendo el Open Graph del `<head>`, que el servidor ya compone
 *  (v4.702). Mandarlo como foto perdería el enlace, que es justamente lo que
 *  ese flujo existe para llevar.
 *
 *  Un Reel es SIEMPRE un video: viaja `mediaUrl` con el MP4 ya montado que
 *  vive en la Biblioteca. ⚠️ NO SE VUELVE A MONTAR NADA acá — esto arma un
 *  payload, no toca el archivo (v4.1042).
 *
 *  `kind` por defecto es `link` para que los llamadores anteriores a v4.1042
 *  se comporten exactamente como antes. */
export const buildShareContent = ({ kind = 'link', message = '', link = '', mediaUrl = null } = {}) => ({
    kind: isShareKind(kind) ? str(kind) : 'link',
    message: str(message).slice(0, SHARE_MESSAGE_MAX),
    link: str(link),
    mediaUrl: str(mediaUrl) || null,
});

/**
 * Puede compartirse, sea cual sea la forma.
 *
 * Un enlace y un video se bloquean por motivos distintos —un borrador no tiene
 * dirección pública; un Reel sin montar no tiene archivo— y los dos se dicen
 * con su SALIDA. `shareability` se conserva entera para el camino del
 * artículo: es a lo que llama el controlador de Noticias.
 */
export const shareabilityOf = ({ kind = 'link', entity = null, publicUrl = '', mediaUrl = '' } = {}) => {
    if (str(kind) !== 'video') return shareability({ post: entity, publicUrl });
    if (!entity) return { ok: false, reason: 'Este contenido no existe o no pertenece a este sitio.', fix: null };
    const alcanzable = mediaReachable(mediaUrl);
    if (!alcanzable.ok) {
        return {
            ok: false,
            reason: alcanzable.reason,
            fix: alcanzable.fix || 'Montá la pieza y volvé a intentarlo: Meta descarga el archivo desde esa dirección, así que tiene que existir y ser pública.',
        };
    }
    // ⚠️ NO SE PUBLICA UN ARCHIVO QUE YA NO ES LA PIEZA (v4.1047).
    //
    // El master de un Reel puede haber quedado atrás respecto de su outro:
    // se enganchó un cierre y el archivo montado todavía es el de antes. Sin
    // esta puerta, el modal lee `videoUrl`, lo ve alcanzable y manda a
    // Facebook e Instagram la versión anterior —que es lo que se reportó, con
    // el Reel de 20 s saliendo sin su cierre—. Y una publicación no se
    // deshace: hay que ir a borrarla a mano en Meta.
    //
    // Quién decide que está desactualizado es `outroSyncState`, en el
    // resolutor de la entidad: acá sólo se traduce a un bloqueo con su SALIDA.
    if (entity.masterStale) {
        return {
            ok: false,
            reason: entity.masterStaleReason || 'El video montado no refleja el outro configurado.',
            fix: entity.masterStaleFix || 'Volvé a montar el Reel desde su ficha y publicá después: el montaje usa las escenas que ya existen y no consume créditos de video.',
        };
    }
    return { ok: true, reason: null, fix: null };
};

export const validateShareMessage = (message) => {
    const m = str(message);
    if (!m) return { ok: false, reason: 'Escribí el texto de la publicación: Facebook rechaza un enlace sin nada que decir.' };
    if (m.length > SHARE_MESSAGE_MAX) return { ok: false, reason: `El texto supera el máximo de ${SHARE_MESSAGE_MAX} caracteres.` };
    return { ok: true, reason: null };
};

// ─── El copy POR RED ────────────────────────────────────────────────────────
//
// ⚠️ UN REEL YA TIENE SU COPY ESCRITO POR PLATAFORMA (`ReelCopy`, v4.669), y
// mandarle a Facebook el de TikTok sería tirar trabajo que ya se pagó. El
// servidor PROPONE uno por red y quien publica lo edita; el texto editado no
// toca el Reel, igual que editar el copy de un artículo no toca el artículo.
//
// `REEL_COPY_BY_NETWORK` es la correspondencia entre la red donde se publica y
// la plataforma para la que se escribió el copy. Un catálogo, no una
// deducción por parecido de nombres.
export const REEL_COPY_BY_NETWORK = {
    facebook: ['facebook_reels', 'instagram_reels', 'tiktok', 'youtube_shorts'],
    instagram: ['instagram_reels', 'facebook_reels', 'tiktok', 'youtube_shorts'],
};

/** El texto de un copy de Reel, tal como saldría publicado. `fullText` es lo
 *  que el generador ya compuso; sin él se arma con las piezas, y nunca se
 *  devuelve un texto vacío que Meta rechazaría con un error que no explica
 *  nada. */
export const reelCopyText = (copy) => {
    if (!copy) return '';
    const completo = str(copy.fullText);
    if (completo) return completo;
    const etiquetas = Array.isArray(copy.hashtags) ? copy.hashtags.filter(Boolean) : [];
    return [str(copy.description), str(copy.cta), etiquetas.join(' ')]
        .filter(Boolean).join('\n\n');
};

/**
 * El texto que se propone para cada red.
 *
 * Recorre la preferencia declarada de esa red y se queda con el primer copy
 * que tenga algo escrito; sin ninguno, cae al título de la pieza. Devuelve un
 * mapa `{ facebook: '…', instagram: '…' }`.
 */
export const defaultMessagesForReel = ({ copies = [], title = '' } = {}) => {
    const vigentes = (Array.isArray(copies) ? copies : []).filter(c => c && c.isCurrent !== false);
    const porPlataforma = {};
    for (const c of vigentes) {
        const texto = reelCopyText(c);
        if (texto && !porPlataforma[str(c.platform)]) porPlataforma[str(c.platform)] = texto;
    }
    const salida = {};
    for (const [red, preferencia] of Object.entries(REEL_COPY_BY_NETWORK)) {
        salida[red] = preferencia.map(pl => porPlataforma[pl]).find(Boolean) || str(title) || '';
    }
    return salida;
};

/** Qué texto le toca a una cuenta: el de su red si viene, y el general si no.
 *  El general es el respaldo a propósito — un cliente que sólo mande `message`
 *  (el flujo de Noticias) se comporta exactamente como antes. */
export const messageForNetwork = ({ network, messages = {}, message = '' } = {}) => {
    const propio = messages && typeof messages === 'object' ? str(messages[str(network)]) : '';
    return propio || str(message);
};

// ─── Traducción de los fallos de Meta ───────────────────────────────────────
//
// ⚠️ EL ERROR DEL PROVEEDOR SE PROPAGA TEXTUAL Y SE TRADUCE DELANTE. Es la
// regla del CRM (`metaCode`, v4.702) y del remitente institucional (v4.942):
// «(#190) Error validating access token» es exacto y no le dice a nadie qué
// hacer; traducirlo a secas lo vuelve irreconocible al buscarlo en el soporte
// de Meta. Va el diagnóstico en español, con DÓNDE se corrige, y el original
// entre paréntesis.
const META_HINTS = [
    { test: /190|access token|session has expired|token.*(expired|invalid)/i,
      code: 'token_expired',
      say: 'La página de Facebook perdió la autorización. Reconectala desde Configuración → Redes Sociales.' },
    { test: /\(#200\)|permission|not authorized|insufficient/i,
      code: 'no_permission',
      say: 'La plataforma no tiene permiso para publicar en esa página. Revisá los permisos de la app en Meta Business.' },
    { test: /\(#100\)|invalid parameter|unsupported.*url|could not.*(fetch|scrape)/i,
      code: 'bad_link',
      say: 'Facebook no pudo leer la dirección del artículo. Comprobá que la página pública abra desde fuera del panel.' },
    { test: /\(#4\)|\(#17\)|rate limit|too many/i,
      code: 'rate_limited',
      say: 'Meta está limitando las publicaciones de esta página. Esperá unos minutos y volvé a intentar.' },
    { test: /\(#368\)|policy|blocked|spam/i,
      code: 'policy',
      say: 'Meta bloqueó la publicación por política de contenido. No se reintenta: revisá el texto y el enlace.' },
    { test: /page.*(not|no longer).*(published|active)|unpublished/i,
      code: 'page_unpublished',
      say: 'La página de Facebook no está publicada. Publicala en Meta y volvé a intentar.' },
    // ── Propios del video (v4.1042) ──────────────────────────────────────────
    // Un contenedor de Instagram falla por motivos que no son los de un post
    // de enlace, y cada uno se corrige en otro sitio: el archivo, la cuenta o
    // la espera. Sin estas líneas los tres salían como «Facebook rechazó la
    // publicación», que manda a diagnosticar donde no está el problema.
    { test: /sigue procesando|still.*process|media.*not.*ready|IN_PROGRESS/i,
      code: 'ig_processing',
      say: 'Instagram sigue procesando el video. No se publicó: volvé a intentarlo en un minuto.' },
    { test: /container.*(status|falló|failed)|status (ERROR|EXPIRED)|no pudo preparar el video/i,
      code: 'ig_container',
      say: 'Instagram no pudo preparar el video. Comprobá que el archivo abra desde fuera del panel y que dure al menos 3 segundos.' },
    { test: /(#2207026)|unsupported.*(video|format)|media.*format|aspect ratio|duration/i,
      code: 'ig_media',
      say: 'Instagram rechazó el archivo por su formato, su duración o su relación de aspecto.' },
    { test: /(#10)|instagram.*(account|user).*(not|no).*(business|professional)|not.*a.*business/i,
      code: 'ig_not_business',
      say: 'Esa cuenta de Instagram no es Profesional o no está vinculada a la Página. Convertila a cuenta de empresa y volvé a conectarla desde Configuración → Redes Sociales.' },
    { test: /file_url|could not.*download|fetch.*(video|file)|url.*not.*(accessible|reachable)/i,
      code: 'media_unreachable',
      say: 'Meta no pudo descargar el archivo. La dirección del video tiene que ser pública: comprobá que abra en una ventana de incógnito.' },
];

export const describeMetaFailure = (raw) => {
    const original = str(raw) || 'Meta no explicó el motivo.';
    const hint = META_HINTS.find(h => h.test.test(original));
    if (!hint) return { code: 'unknown', message: `Facebook rechazó la publicación: ${original}`, retryable: false };
    return { code: hint.code, message: `${hint.say} (${original})`, retryable: hint.code === 'rate_limited' };
};

// ─── Historial ──────────────────────────────────────────────────────────────

/** ¿Esta entidad ya salió a esta red? Lo usa la insignia del listado y el
 *  modal para ofrecer «Publicar nuevamente» en vez de repetir en silencio. */
export const summarizeHistory = (rows = []) => {
    const ok = rows.filter(r => r.status === 'published');
    const byNetwork = {};
    for (const r of ok) {
        if (!byNetwork[r.network]) byNetwork[r.network] = [];
        byNetwork[r.network].push(r);
    }
    return {
        published: ok.length > 0,
        networks: Object.keys(byNetwork),
        count: ok.length,
        lastAt: ok.length ? ok.map(r => r.createdAt).sort().slice(-1)[0] : null,
        failed: rows.filter(r => r.status === 'error').length,
    };
};

export default {
    NETWORKS, NETWORK_IDS, networkOf, linkNetworks, networkSupports, videoNetworks,
    SHARE_KINDS, SHARE_KIND_IDS, isShareKind, shareKindOf,
    IG_VIDEO_LIMITS, mediaReachable, videoOf, videoReadiness,
    ENTITY_TYPES, isEntityType,
    SHARE_STATES, SHARE_STATE_KEYS, shareStateOf,
    shareability, shareabilityOf, accountReadiness, PAGE_PUBLISH_TASKS,
    SHARE_MESSAGE_MAX, defaultShareMessage, buildShareContent, validateShareMessage,
    REEL_COPY_BY_NETWORK, reelCopyText, defaultMessagesForReel, messageForNetwork,
    describeMetaFailure, summarizeHistory,
};
