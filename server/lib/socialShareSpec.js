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
        note: null,
    },
    {
        id: 'instagram',
        label: 'Instagram',
        available: true,
        linkable: false,
        note: 'Instagram no publica enlaces: su pie no los hace pulsables. Para llevar tráfico al artículo, usá Facebook.',
    },
    {
        id: 'linkedin',
        label: 'LinkedIn',
        available: false,
        linkable: true,
        note: 'Todavía no hay conexión de LinkedIn en la plataforma. El único proveedor conectado es Meta.',
    },
    {
        id: 'x',
        label: 'X (Twitter)',
        available: false,
        linkable: true,
        note: 'Todavía no hay conexión de X en la plataforma. El único proveedor conectado es Meta.',
    },
];

export const NETWORK_IDS = NETWORKS.map(n => n.id);
export const networkOf = (id) => NETWORKS.find(n => n.id === str(id)) || null;

/** Las redes que pueden recibir un ENLACE hoy. Es lo que un artículo necesita. */
export const linkNetworks = () => NETWORKS.filter(n => n.available && n.linkable).map(n => n.id);

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
    if (kind === 'link' && !net.linkable) {
        return { ok: false, code: 'kind_unsupported', reason: net.note, fix: null };
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

/** Lo que se le manda al adaptador de Meta. Un artículo es SIEMPRE un enlace:
 *  la imagen y el titular los resuelve Facebook leyendo el Open Graph del
 *  `<head>`, que el servidor ya compone (v4.702). Mandarlo como foto perdería
 *  el enlace, que es justamente lo que este flujo existe para llevar. */
export const buildShareContent = ({ message = '', link = '' } = {}) => ({
    kind: 'link',
    message: str(message).slice(0, SHARE_MESSAGE_MAX),
    link: str(link),
    mediaUrl: null,
});

export const validateShareMessage = (message) => {
    const m = str(message);
    if (!m) return { ok: false, reason: 'Escribí el texto de la publicación: Facebook rechaza un enlace sin nada que decir.' };
    if (m.length > SHARE_MESSAGE_MAX) return { ok: false, reason: `El texto supera el máximo de ${SHARE_MESSAGE_MAX} caracteres.` };
    return { ok: true, reason: null };
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
    NETWORKS, NETWORK_IDS, networkOf, linkNetworks,
    ENTITY_TYPES, isEntityType,
    SHARE_STATES, SHARE_STATE_KEYS, shareStateOf,
    shareability, accountReadiness, PAGE_PUBLISH_TASKS,
    SHARE_MESSAGE_MAX, defaultShareMessage, buildShareContent, validateShareMessage,
    describeMetaFailure, summarizeHistory,
};
