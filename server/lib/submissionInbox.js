// ════════════════════════════════════════════════════════════════════════════
// La bandeja TRANSVERSAL de solicitudes de contenido — v4.999.0
//
// El CRITERIO de «Solicitudes de contenido» como módulo de trabajo: qué
// solicitudes alcanza una sesión, cómo se sanean sus filtros y cómo se resume
// lo que se está mirando. **Puro**: sin base, sin red, sin DOM — por eso se
// puede probar el aislamiento sin levantar Postgres, que es exactamente la
// parte que no puede fallar.
//
// ⚠️ NO ES UN SEGUNDO MODELO DE DATOS. Las solicitudes siguen viviendo donde
// v4.968 las puso —`ContributionSubmission` y sus cuatro tablas hijas— y los
// estados siguen siendo los de `contentSubmissionSpec.js`. Lo que se agrega
// acá es poder mirarlas SIN pasar por el editor de una campaña, que es lo que
// las tenía enterradas: hasta v4.998 la única vía era abrir la campaña, abrir
// la sección plegada, y sólo si eras el operador de la plataforma.
//
// ⚠️ EL ALCANCE SE RESUELVE POR CAMPAÑA, Y ESO NO ES UN ATAJO. Una solicitud
// llega por un formulario PÚBLICO y anónimo: no hay sesión que registrar, así
// que la solicitud no «pertenece» a un sitio — pertenece a una CAMPAÑA. Quién
// puede verla se deduce de quién alcanza esa campaña, con el MISMO criterio
// (`scopeForSite`) con el que el sitio ya la edita y la publica. Inventar un
// `tenant_id` deducido del club que escribió quien envía sería adivinar: ese
// campo es texto libre de un formulario abierto.
//
// Lo que SÍ se puede saber sin adivinar es por qué PUERTA entró: desde v4.999
// se guarda `originClubId`, el sitio de cuyo dominio salió el formulario. Es
// aditivo y vale `null` para todo lo anterior — un hueco es la verdad, y
// rellenarlo hacia atrás sería inventar el dato que se vino a medir.
// ════════════════════════════════════════════════════════════════════════════

import { SUBMISSION_STATES, SUBMISSION_STATE_IDS, stateLabel } from './contentSubmissionSpec.js';

const str = (v, max = 200) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

// ─── Qué cuenta como «sin revisar» ─────────────────────────────────────────
//
// ⚠️ ES UNA LISTA DECLARADA, NO «el primer estado». El rótulo de la tarjeta
// dice «15 sin revisar» y tiene que corresponder EXACTAMENTE a lo que hay en
// la base: deducirlo del orden dejaría el número a merced de que alguien
// reordene el catálogo. `recibido` es donde nace toda solicitud (v4.968) y
// `requiere_info` vuelve a estar en manos del equipo — le pedimos algo a quien
// envió y hasta que conteste sigue esperando a que alguien la atienda.
export const PENDING_STATES = ['recibido', 'requiere_info'];
export const isPending = (status) => PENDING_STATES.includes(String(status || ''));

/** Las que ya no esperan trabajo: no entran en «pendientes» ni en el destacado. */
export const CLOSED_STATES = ['publicado', 'descartado', 'archivado'];
export const isClosed = (status) => CLOSED_STATES.includes(String(status || ''));

// ─── Los filtros ───────────────────────────────────────────────────────────
//
// ⚠️ CATÁLOGO CERRADO. Ningún valor del cliente entra en el SQL: un filtro
// desconocido se DESCARTA y se reporta, nunca se ignora en silencio — un
// filtro que no se aplica ENSANCHA lo que se ve, que acá es el error caro
// (misma regla que las audiencias del CRM, v4.701).
export const INBOX_FILTERS = {
    campaign: { id: 'campaign', label: 'Campaña' },
    status: { id: 'status', label: 'Estado' },
    site: { id: 'site', label: 'Sitio' },
    district: { id: 'district', label: 'Distrito' },
    assignee: { id: 'assignee', label: 'Responsable' },
    kind: { id: 'kind', label: 'Tipo de contenido' },
    from: { id: 'from', label: 'Desde' },
    to: { id: 'to', label: 'Hasta' },
    q: { id: 'q', label: 'Búsqueda' },
};
export const INBOX_FILTER_IDS = Object.keys(INBOX_FILTERS);

/** Los tipos de contenido por los que se puede acotar. Salen de `kindOf`. */
export const CONTENT_KINDS = {
    image: { id: 'image', label: 'Fotografías' },
    video: { id: 'video', label: 'Videos' },
    none: { id: 'none', label: 'Sin archivos' },
};
export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS);

/** El tope de filas por página. Un listado sin tope se vuelve inservible con
 *  el segundo cliente grande, y un total truncado presentado como total es
 *  peor que no mostrar ninguno — por eso el resumen se cuenta APARTE. */
export const INBOX_PAGE_SIZE = 50;
export const INBOX_MAX_PAGE_SIZE = 200;

const SIN_RESPONSABLE = '__sin__';
export const UNASSIGNED = SIN_RESPONSABLE;

/**
 * Sanea lo que llega de la petición.
 *
 * Devuelve SIEMPRE un objeto utilizable y la lista de lo que se descartó con
 * su motivo: quien filtró tiene que poder saber qué quedó fuera, o «no hay
 * resultados» es indistinguible de «el filtro se comió algo» (v4.849).
 */
export const shapeInboxQuery = (raw = {}) => {
    const descartados = [];
    const drop = (campo, motivo) => descartados.push({ campo, motivo });

    const status = str(raw.status, 40);
    let estado = '';
    if (status) {
        if (SUBMISSION_STATE_IDS.includes(status)) estado = status;
        else drop('status', `«${status}» no es un estado de este módulo`);
    }

    const kindRaw = str(raw.kind, 20);
    let kind = '';
    if (kindRaw) {
        if (CONTENT_KIND_IDS.includes(kindRaw)) kind = kindRaw;
        else drop('kind', `«${kindRaw}» no es un tipo de contenido`);
    }

    const fecha = (v, campo) => {
        const s = str(v, 40);
        if (!s) return '';
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) { drop(campo, `«${s}» no es una fecha legible`); return ''; }
        return s;
    };
    let from = fecha(raw.from, 'from');
    let to = fecha(raw.to, 'to');
    // Un rango invertido es un error de dedo y se endereza, no se rechaza:
    // vaciar la lista por eso obliga a adivinar qué pasó (v4.849).
    if (from && to && new Date(from) > new Date(to)) { const t = from; from = to; to = t; }

    const perPageRaw = Number(raw.perPage);
    const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0
        ? Math.min(Math.trunc(perPageRaw), INBOX_MAX_PAGE_SIZE)
        : INBOX_PAGE_SIZE;
    const pageRaw = Number(raw.page);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.trunc(pageRaw) : 1;

    return {
        campaign: str(raw.campaign, 80),
        status: estado,
        site: str(raw.site, 80),
        district: str(raw.district, 40),
        assignee: str(raw.assignee, 160),
        kind,
        // Dimensiones Rotary en Acción (v4.1118). Texto libre acotado: filtran,
        // no validan contra taxonomía (una solicitud vieja puede traer otro valor).
        contentType: str(raw.contentType || raw.tipo, 60).toLowerCase(),
        area: str(raw.area, 60).toLowerCase(),
        program: str(raw.program || raw.programa, 60).toLowerCase(),
        topic: str(raw.topic || raw.tema, 60).toLowerCase(),
        priority: str(raw.priority, 20),
        from, to,
        q: str(raw.q, 160),
        page, perPage,
        descartados,
    };
};

/** ¿Hay algún filtro puesto? Es lo que distingue «no hay nada» de «lo
 *  filtraste», que se dicen distinto (v4.938). */
export const hasFilters = (q = {}) =>
    Boolean(q.campaign || q.status || q.site || q.district || q.assignee || q.kind || q.from || q.to || q.q
        || q.contentType || q.area || q.program || q.topic || q.priority);

// ─── El alcance ────────────────────────────────────────────────────────────

/**
 * ¿Esta sesión alcanza esta solicitud?
 *
 * ⚠️ LA PUERTA ES LA CAMPAÑA Y SE COMPRUEBA CONTRA LA LISTA YA RESUELTA. El
 * operador de la plataforma alcanza todas; cualquier otro, sólo las de las
 * campañas que su sitio alcanza —las suyas y las que le llegan del Distrito—.
 *
 * Devuelve un BOOLEANO y nada más: quien pregunta por una solicitud fuera de
 * su alcance recibe un 404, no un 403 — confirmar que existe es la mitad de lo
 * que hace falta para ir a buscarla.
 */
export const reachesSubmission = ({ isOperator = false, campaignIds = [], submission = null } = {}) => {
    if (!submission || !submission.campaignId) return false;
    if (isOperator) return true;
    return campaignIds.map(String).includes(String(submission.campaignId));
};

/**
 * Las campañas que de verdad se van a consultar.
 *
 * Si se pidió UNA por filtro, se comprueba que esté en el alcance ANTES de
 * consultar: sin eso, `?campana=<ajena>` devolvería vacío en vez de decir que
 * no existe, y un vacío mudo se lee como que el módulo está roto. Para el
 * operador el filtro se acepta tal cual — su alcance es todo.
 */
export const resolveInboxCampaigns = ({ isOperator = false, campaignIds = [], wanted = '' } = {}) => {
    const alcance = campaignIds.map(String);
    const pedida = str(wanted, 80);
    if (!pedida) return { ok: true, ids: isOperator ? null : alcance, filtered: false };
    if (!isOperator && !alcance.includes(pedida)) {
        return { ok: false, ids: [], filtered: true, reason: 'fuera_de_alcance' };
    }
    return { ok: true, ids: [pedida], filtered: true };
};

// ─── El resumen ────────────────────────────────────────────────────────────

/**
 * El resumen de lo que hay, a partir de los contadores por estado.
 *
 * ⚠️ SE CUENTA SOBRE LO QUE HAY EN LA BASE, NO SOBRE LA PÁGINA. El listado
 * está paginado: contar las filas visibles diría «12» en una bandeja de 200 y
 * el número de la tarjeta dejaría de cuadrar con el de la lista.
 *
 * @param porEstado `{ recibido: 15, aprobado: 2, … }`
 */
export const summarizeInbox = (porEstado = {}) => {
    const limpio = {};
    let total = 0;
    let pendientes = 0;
    let abiertas = 0;
    for (const id of SUBMISSION_STATE_IDS) {
        const n = Number(porEstado[id]) || 0;
        if (n <= 0) continue;
        limpio[id] = n;
        total += n;
        if (isPending(id)) pendientes += n;
        if (!isClosed(id)) abiertas += n;
    }
    // Un estado que la base tenga y el catálogo no se CUENTA igual y se
    // NOMBRA: descartarlo escondería filas reales, y el total dejaría de
    // cuadrar con el listado sin que nadie supiera por qué.
    const desconocidos = [];
    for (const [id, v] of Object.entries(porEstado || {})) {
        if (SUBMISSION_STATE_IDS.includes(id)) continue;
        const n = Number(v) || 0;
        if (n <= 0) continue;
        limpio[id] = n;
        total += n;
        abiertas += n;
        desconocidos.push(id);
    }
    return { total, pendientes, abiertas, porEstado: limpio, desconocidos };
};

/** Los estados con su rótulo y su cuenta, en el orden del catálogo. Es lo que
 *  pinta la fila de pestañas: un estado sin ninguna solicitud se muestra en
 *  cero a propósito —acá el cero es una respuesta, no una afirmación falsa—. */
export const stateTabs = (porEstado = {}) =>
    SUBMISSION_STATE_IDS
        .map(id => ({
            id,
            label: stateLabel(id),
            tone: SUBMISSION_STATES[id]?.tone || 'gray',
            order: SUBMISSION_STATES[id]?.order ?? 999,
            n: Number(porEstado?.[id]) || 0,
            pending: isPending(id),
        }))
        .sort((a, b) => a.order - b.order);

/** La frase de la cabecera. Dice cuántas se están viendo de cuántas hay, que
 *  es lo que faltaba para distinguir un filtro de un vacío (v4.985). */
export const describeInboxView = ({ mostradas = 0, total = 0, pendientes = 0, filtrada = false } = {}) => {
    const m = Math.max(0, Number(mostradas) || 0);
    const t = Math.max(0, Number(total) || 0);
    const p = Math.max(0, Number(pendientes) || 0);
    if (t === 0) {
        return filtrada
            ? 'Ninguna solicitud coincide con los filtros.'
            : 'Todavía no ha llegado ninguna solicitud de contenido.';
    }
    const base = filtrada
        ? `Mostrando ${m} de ${t} solicitud${t === 1 ? '' : 'es'} filtrada${t === 1 ? '' : 's'}`
        : `Mostrando ${m} de ${t} solicitud${t === 1 ? '' : 'es'}`;
    return p > 0 ? `${base} · ${p} sin revisar` : `${base} · ninguna sin revisar`;
};

export const PLATFORM_HOSTS = [
    'clubplatform.org',
    'www.clubplatform.org',
    'app.clubplatform.org',
    'localhost',
    '127.0.0.1',
];

/**
 * ¿Tiene este sitio / sesión habilitado el módulo de solicitudes de contenido (Rotary en Acción)?
 *
 * Restringido EXCLUSIVAMENTE a las 4 entidades principales:
 * 1. Club Platform (app.clubplatform.org / localhost / plataforma global super admin)
 * 2. Rotary 4281 (Sitio oficial del Distrito 4281: rotary4281.org, rotary4281, d4281)
 * 3. Feria de Proyectos (feriadeproyectos.org / tipo o nombre Feria de Proyectos)
 * 4. Colrotarios (colrotarios.org / tipo o nombre Colrotarios)
 *
 * Los sitios de clubes regulares (ej. Rotary Nuevo Cali, Pereira del Café, Quimbaya, etc.)
 * NO tienen habilitado este módulo ni deben ver la trazabilidad ni el buzón de solicitudes.
 */
export const isContentSubmissionsAllowedSite = ({ host = '', origin = '', user = null, club = null } = {}) => {
    // ── Super Admin global de Club Platform (v4.1162) ─────────────────────
    // Espejo del navegador (`src/lib/submissionInbox.ts`): la paridad se
    // comprueba comparando SALIDAS. No depende de host ni de club asignado;
    // la marca es el rol `superadmin` (o `isSuperAdmin`), nunca asignado a un
    // administrador local. Quien decide QUÉ ve después es el alcance
    // (`campaignIdsInScope` → `null` = todo, sólo operador), no esta puerta.
    const superRole = String(user?.role || '');
    if (superRole === 'superadmin' || user?.isSuperAdmin === true) {
        return true;
    }

    const rawHost = String(host || '').toLowerCase().trim();
    const rawOrigin = String(origin || '').toLowerCase().trim();
    const effectiveHost = (rawHost || rawOrigin).replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

    const clubType = String(club?.type || '').toLowerCase().trim();
    const clubCategory = String(club?.category || '').toLowerCase().trim();
    const clubName = String(club?.name || '').toLowerCase().trim();
    const clubSubdomain = String(club?.subdomain || '').toLowerCase().trim();
    const clubDomain = String(club?.domain || '').toLowerCase().trim();

    // 1. Rotary 4281 (Sitio Distrital 4281)
    const isRotary4281Host = effectiveHost.includes('rotary4281');
    const isRotary4281Sub = clubSubdomain.includes('rotary4281') || clubSubdomain === 'd4281' || clubSubdomain === 'distrito-4281';
    const isRotary4281Domain = clubDomain.includes('rotary4281');
    const isDistrictSite = clubType === 'district' || clubType === 'distrito rotario' || clubType === 'distrito';
    const isDistrict4281Club = isDistrictSite && (clubName.includes('4281') || isRotary4281Sub || isRotary4281Domain);

    if (isRotary4281Host || isRotary4281Sub || isRotary4281Domain || isDistrict4281Club) {
        return true;
    }

    // 2. Feria de Proyectos
    const isFeriaHost = effectiveHost.includes('feriadeproyectos') || effectiveHost.includes('feria-de-proyectos');
    const isFeriaClub = clubType === 'feria de proyectos' || clubType === 'project_fair' || clubCategory === 'project_fair' ||
        clubName.includes('feria de proyectos') || clubSubdomain.includes('feriadeproyectos') || clubDomain.includes('feriadeproyectos');

    if (isFeriaHost || isFeriaClub) {
        return true;
    }

    // 3. Colrotarios
    const isColrotariosHost = effectiveHost.includes('colrotarios');
    const isColrotariosClub = clubType === 'colrotarios' || clubCategory === 'colrotarios' ||
        clubName.includes('colrotarios') || clubSubdomain.includes('colrotarios') || clubDomain.includes('colrotarios');

    if (isColrotariosHost || isColrotariosClub) {
        return true;
    }

    // 4. Club Platform (Super Admin sin club regular en host de plataforma)
    const isPlatformHost = PLATFORM_HOSTS.includes(effectiveHost);
    if (!isPlatformHost) {
        return false;
    }

    const hasAssignedClub = !!(user?.clubId && user.clubId !== 'platform' && user.clubId !== 'global');
    const isSuperAdminRole = String(user?.role || '') === 'administrator' ||
        String(user?.role || '') === 'superadmin' ||
        user?.isSuperAdmin === true;

    if (isSuperAdminRole && !hasAssignedClub) {
        return true;
    }

    return false;
};

export default {
    PENDING_STATES, isPending, CLOSED_STATES, isClosed,
    INBOX_FILTERS, INBOX_FILTER_IDS, CONTENT_KINDS, CONTENT_KIND_IDS,
    INBOX_PAGE_SIZE, INBOX_MAX_PAGE_SIZE, UNASSIGNED,
    shapeInboxQuery, hasFilters,
    reachesSubmission, resolveInboxCampaigns,
    summarizeInbox, stateTabs, describeInboxView,
    PLATFORM_HOSTS, isContentSubmissionsAllowedSite,
};
