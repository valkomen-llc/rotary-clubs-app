/**
 * Grupos de Facebook — EL CRITERIO.
 *
 * v4.876 — Puro: sin base, sin red, sin DOM. Vive aparte de
 * `distributionGroups.js`, que orquesta, por el mismo motivo que
 * `distributionSpec.js` vive aparte de `distributionQueue.js`.
 *
 * ⚠️ NINGÚN GRUPO SE DESCUBRE, Y NO ES UN PENDIENTE. Meta retiró la Groups API
 * entera el 22 de abril de 2024 —también la parte de LECTURA— y ni `User` ni
 * `Page` declaran una arista `groups`. No hay endpoint que consultar: en qué
 * grupos está una cuenta no se puede preguntar. La herramienta de referencia
 * que sí los lista es una EXTENSIÓN DE NAVEGADOR que trabaja con las cookies de
 * sesión del usuario; eso no es la Graph API y no se implementa acá.
 *
 * De ahí sale la decisión que gobierna este archivo: si la lista se DECLARA en
 * vez de detectarse, el trabajo no es descubrir sino que declarar cueste poco y
 * que lo declarado sea confiable. Eso es `parseImport` y son los estados.
 */

// ── Estados ─────────────────────────────────────────────────────────────────
//
// ⚠️ NO HAY ESTADOS DE ROL —«Administrador», «Moderador»— y su ausencia es
// deliberada: no existe API que devuelva el rol de nadie en un grupo. Pintarlos
// sería inventar un dato y presentarlo como verificado, y alguien lo usaría
// para decidir dónde publicar. `verificado` significa exactamente «una persona
// con nombre confirmó que puede publicar ahí», no que Meta lo haya dicho.
export const GROUP_STATES = {
    sin_verificar: {
        label: 'Sin verificar',
        canPublish: false,
        tone: 'warn',
        reason: 'Nadie confirmó todavía que se pueda publicar en este grupo.',
    },
    verificado: {
        label: 'Verificado',
        canPublish: true,
        tone: 'ok',
        reason: null,
    },
    sin_permiso: {
        label: 'Sin permiso',
        canPublish: false,
        tone: 'fail',
        reason: 'Se marcó que en este grupo no se puede publicar.',
    },
    retirado: {
        label: 'Retirado',
        canPublish: false,
        tone: 'off',
        reason: 'Este grupo se retiró de la lista de destinos.',
    },
};
export const GROUP_STATE_IDS = Object.keys(GROUP_STATES);
export const isGroupState = (s) => Object.prototype.hasOwnProperty.call(GROUP_STATES, s);
export const DEFAULT_GROUP_STATE = 'sin_verificar';

/** Transiciones permitidas. Un catálogo cerrado evita estados inventados. */
export const GROUP_TRANSITIONS = {
    sin_verificar: ['verificado', 'sin_permiso', 'retirado'],
    verificado: ['sin_permiso', 'retirado', 'sin_verificar'],
    sin_permiso: ['verificado', 'retirado', 'sin_verificar'],
    retirado: ['sin_verificar'],
};
export const canTransition = (from, to) =>
    isGroupState(from) && isGroupState(to) && (GROUP_TRANSITIONS[from] || []).includes(to);

// ── Proveedores ─────────────────────────────────────────────────────────────
//
// La costura de la detección automática se DECLARA aunque esté vacía —así el
// día que Meta reabra algo es una entrada más— pero NO se finge llena: una
// pantalla que dice «detectando grupos…» y siempre encuentra cero es una
// función rota. Mismo patrón que los motores «Próximamente» del Generador de
// Publicaciones.
export const GROUP_PROVIDERS = {
    manual: { label: 'Declarado a mano', available: true },
    import: { label: 'Importado de un archivo', available: true },
    api: {
        label: 'Detección automática',
        available: false,
        reason: 'Meta retiró la API de Grupos el 22 de abril de 2024, incluida la lectura. No hay endpoint que consultar.',
    },
};
export const GROUP_PROVIDER_IDS = Object.keys(GROUP_PROVIDERS);
export const availableProviders = () => GROUP_PROVIDER_IDS.filter(p => GROUP_PROVIDERS[p].available);

// ── La puerta ───────────────────────────────────────────────────────────────

/** ¿Este grupo puede recibir trabajo? */
export const canPublishTo = (group) => !!GROUP_STATES[group?.status]?.canPublish;

/**
 * Parte una selección de grupos en los que pueden recibir trabajo y los que no,
 * con el motivo de cada rechazo.
 *
 * ⚠️ Esto se aplica en el SERVIDOR, al crear la campaña. Si la comprobación
 * viviera sólo en la pantalla, quien conozca el endpoint se la saltea — y el
 * pedido dice expresamente «no permitir publicar en un grupo no autorizado».
 */
export const splitByPublishability = (groups = []) => {
    const allowed = [];
    const blocked = [];
    for (const g of groups) {
        if (canPublishTo(g)) allowed.push(g);
        else blocked.push({
            group: g,
            reason: GROUP_STATES[g?.status]?.reason || 'Este grupo no está en un estado que permita publicar.',
        });
    }
    return { allowed, blocked };
};

// ── Normalización ───────────────────────────────────────────────────────────

const GROUP_URL = /https?:\/\/(?:www\.|m\.|web\.|mbasic\.)?facebook\.com\/groups\/([^/?#\s]+)/i;

const nameFromSlug = (slug) => {
    if (/^\d+$/.test(slug)) return `Grupo ${slug}`;
    const limpio = String(slug).replace(/[-_]+/g, ' ').trim();
    return limpio.charAt(0).toUpperCase() + limpio.slice(1);
};

const asTags = (v) => {
    if (Array.isArray(v)) return v.map(t => String(t).trim()).filter(Boolean);
    return String(v || '').split(/[;,|]/).map(t => t.trim()).filter(Boolean);
};

/**
 * Una fila cruda —de un archivo, de un pegado o del formulario— a la forma que
 * guarda la base. Devuelve `null` con su motivo si no se puede sostener.
 */
export const normalizeGroup = (raw = {}) => {
    const url = String(raw.group_url || raw.url || raw.targetUrl || '').trim();
    const m = GROUP_URL.exec(url);
    // El identificador de un grupo sale del enlace cuando está: es lo estable.
    // El nombre lo pone la persona y puede cambiar; el id, no.
    const fromUrl = m ? m[1] : null;
    const groupId = String(raw.group_id || raw.id || raw.groupId || fromUrl || '').trim();
    let name = String(raw.group_name || raw.name || raw.targetName || '').trim();
    if (!name && fromUrl) name = nameFromSlug(fromUrl);

    // El motivo MÁS ESPECÍFICO va primero. Al revés, un enlace de publicación
    // se rechazaba con «sin identificador ni nombre», que manda a corregir lo
    // que no está mal: un motivo genérico donde había uno preciso es un aviso
    // que no sirve.
    if (url && !m && /^https?:\/\//i.test(url)) {
        // Casi seguro se pegó la publicación en vez del grupo.
        return { ok: false, reason: 'el enlace no es de un grupo' };
    }
    if (!groupId && !name) return { ok: false, reason: 'sin identificador ni nombre' };

    const status = isGroupState(raw.status) ? raw.status : DEFAULT_GROUP_STATE;
    return {
        ok: true,
        group: {
            groupId: groupId || name,
            name: name || nameFromSlug(groupId),
            url: m ? m[0] : null,
            socialAccountId: String(raw.account_id || raw.socialAccountId || '').trim() || null,
            // ⚠️ IMPORTAR NO AUTORIZA. Un archivo puede traer `status:
            // verificado` y no se respeta: la verificación es un acto de una
            // persona sobre esta plataforma, no un campo de un CSV. Lo dice el
            // pedido y lo fija una prueba.
            status: status === 'verificado' ? DEFAULT_GROUP_STATE : status,
            tags: asTags(raw.tags),
            notes: String(raw.notes || '').trim() || null,
        },
    };
};

// ── Importación ─────────────────────────────────────────────────────────────

/** CSV con comillas: un campo entrecomillado puede llevar comas y saltos. */
export const parseCsv = (text) => {
    const filas = [];
    let campo = '';
    let fila = [];
    let enComillas = false;
    const src = String(text || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (enComillas) {
            if (c === '"') {
                if (src[i + 1] === '"') { campo += '"'; i++; }  // comilla escapada
                else enComillas = false;
            } else campo += c;
        } else if (c === '"') enComillas = true;
        else if (c === ',' || c === ';') { fila.push(campo); campo = ''; }
        else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
        else campo += c;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(f => f.some(c => String(c).trim() !== ''));
};

const CANON = {
    group_id: 'group_id', groupid: 'group_id', id: 'group_id',
    group_name: 'group_name', groupname: 'group_name', name: 'group_name', nombre: 'group_name',
    group_url: 'group_url', groupurl: 'group_url', url: 'group_url', enlace: 'group_url',
    account_id: 'account_id', accountid: 'account_id', cuenta: 'account_id',
    status: 'status', estado: 'status',
    tags: 'tags', etiquetas: 'tags', lista: 'tags',
    notes: 'notes', notas: 'notes',
};
const canon = (h) => CANON[String(h || '').trim().toLowerCase().replace(/\s+/g, '_')] || null;

/**
 * Interpreta lo que llegue: JSON, CSV o líneas sueltas pegadas.
 *
 * El formato se DETECTA, no se pregunta: quien exporta de otra herramienta no
 * tiene por qué saber cómo se llama lo que tiene. Y lo descartado vuelve con su
 * motivo — con doscientas filas, un descarte silencioso deja sin saber cuáles
 * entraron.
 */
export const parseImport = (text) => {
    const src = String(text || '').trim();
    if (!src) return { format: null, groups: [], skipped: [] };

    // 1. JSON — un array, o un objeto con `groups` dentro (lo que exportamos).
    if (src.startsWith('[') || src.startsWith('{')) {
        try {
            const datos = JSON.parse(src);
            const filas = Array.isArray(datos) ? datos : (Array.isArray(datos.groups) ? datos.groups : null);
            if (filas) return { format: 'json', ...collect(filas) };
        } catch { /* no era JSON: se sigue probando */ }
    }

    // 2. CSV — si la primera fila trae encabezados reconocibles.
    const filas = parseCsv(src);
    if (filas.length) {
        const cabecera = filas[0].map(canon);
        if (cabecera.filter(Boolean).length >= 2) {
            const objetos = filas.slice(1).map(f => {
                const o = {};
                cabecera.forEach((k, i) => { if (k) o[k] = f[i]; });
                return o;
            });
            return { format: 'csv', ...collect(objetos) };
        }
    }

    // 3. Líneas sueltas: «Nombre | enlace», el enlace solo o un nombre.
    const lineas = src.split('\n').map(l => l.trim()).filter(Boolean).map(linea => {
        const m = GROUP_URL.exec(linea);
        const name = (m ? linea.replace(m[0], '') : linea)
            .replace(/^[\s|—–\-:·]+|[\s|—–\-:·]+$/g, '').trim();
        // ⚠️ Una línea que ES una dirección pero NO la de un grupo se pasa como
        // enlace, no como nombre: así `normalizeGroup` la rechaza con su motivo.
        // Dejándola como nombre se guardaba el enlace de una PUBLICACIÓN como si
        // fuera un destino — lo destapó la prueba, no la lectura.
        const esUrl = /^https?:\/\//i.test(linea);
        return {
            group_url: m ? m[0] : (esUrl ? linea : ''),
            group_name: esUrl && !m ? '' : name,
            __linea: linea,
        };
    });
    return { format: 'lines', ...collect(lineas) };
};

/** Normaliza, deduplica y reporta. Compartido por los tres formatos. */
const collect = (filas) => {
    const groups = [];
    const skipped = [];
    const vistos = new Set();
    for (const raw of filas) {
        const etiqueta = raw.__linea || raw.group_url || raw.group_name || raw.group_id || '(fila vacía)';
        const r = normalizeGroup(raw);
        if (!r.ok) { skipped.push({ line: String(etiqueta), reason: r.reason }); continue; }
        const clave = r.group.url || r.group.groupId;
        if (vistos.has(clave)) { skipped.push({ line: String(etiqueta), reason: 'repetido' }); continue; }
        vistos.add(clave);
        groups.push(r.group);
    }
    return { groups, skipped };
};

// ── Exportación ─────────────────────────────────────────────────────────────

export const EXPORT_COLUMNS = ['group_id', 'group_name', 'group_url', 'account_id', 'status', 'tags', 'notes'];

const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (groups = []) => {
    const filas = [EXPORT_COLUMNS.join(',')];
    for (const g of groups) {
        filas.push([
            g.groupId, g.name, g.url || '', g.socialAccountId || '',
            g.status, (g.tags || []).join(';'), g.notes || '',
        ].map(csvCell).join(','));
    }
    return filas.join('\n');
};

export const toJson = (groups = []) => JSON.stringify({
    exportedAt: null, // lo sella quien exporta: este módulo es puro
    groups: groups.map(g => ({
        group_id: g.groupId, group_name: g.name, group_url: g.url || null,
        account_id: g.socialAccountId || null, status: g.status,
        tags: g.tags || [], notes: g.notes || null,
    })),
}, null, 2);

// ── Filtro, orden y paginación ──────────────────────────────────────────────
//
// Vive acá y no en la pantalla para que «seleccionar todos» opere exactamente
// sobre lo que el filtro dejó a la vista. Con dos implementaciones, marcar
// «todos» seleccionaría grupos que no se están viendo — que es la forma más
// cara de equivocarse en este módulo.

export const filterGroups = (groups = [], { q = '', tag = '', status = '', accountId = '', onlyFavorites = false } = {}) => {
    const needle = String(q).trim().toLowerCase();
    return groups.filter(g => {
        if (onlyFavorites && !g.favorite) return false;
        if (status && g.status !== status) return false;
        if (tag && !(g.tags || []).includes(tag)) return false;
        // '' = sin filtro; 'none' = los que no tienen cuenta asignada. Son
        // cosas distintas: los grupos declarados antes de que existiera la
        // columna no tienen cuenta y hay que poder encontrarlos.
        if (accountId === 'none' && g.socialAccountId) return false;
        if (accountId && accountId !== 'none' && g.socialAccountId !== accountId) return false;
        if (!needle) return true;
        return `${g.name} ${g.groupId} ${(g.tags || []).join(' ')}`.toLowerCase().includes(needle);
    });
};

export const PER_PAGE = 10;

export const paginate = (list = [], { page = 1, perPage = PER_PAGE } = {}) => {
    const size = Math.max(1, Math.round(perPage) || PER_PAGE);
    const pages = Math.max(1, Math.ceil(list.length / size));
    const actual = Math.min(Math.max(1, Math.round(page) || 1), pages);
    const from = (actual - 1) * size;
    return { items: list.slice(from, from + size), page: actual, pages, total: list.length, perPage: size };
};

/** Las listas de distribución son las etiquetas que existen, con su conteo. */
export const listsOf = (groups = []) => {
    const cuenta = new Map();
    for (const g of groups) for (const t of g.tags || []) cuenta.set(t, (cuenta.get(t) || 0) + 1);
    return [...cuenta.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
};

export default {
    GROUP_STATES, GROUP_STATE_IDS, isGroupState, DEFAULT_GROUP_STATE,
    GROUP_TRANSITIONS, canTransition,
    GROUP_PROVIDERS, GROUP_PROVIDER_IDS, availableProviders,
    canPublishTo, splitByPublishability,
    normalizeGroup, parseCsv, parseImport,
    EXPORT_COLUMNS, toCsv, toJson,
    filterGroups, paginate, PER_PAGE, listsOf,
};
