// ════════════════════════════════════════════════════════════════════════════
// Espejo MÍNIMO de `server/lib/submissionInbox.js` — v4.999
//
// Sólo lo que la pantalla necesita para PINTAR: qué estados cuentan como «sin
// revisar» —para destacarlos— y los rótulos de los filtros. Quien DECIDE sigue
// siendo el servidor: el alcance (`campaignIdsInScope`), el saneado de los
// filtros y el resumen viajan RESUELTOS en la respuesta.
//
// ⚠️ NO SE ESPEJA EL ALCANCE, Y ES DELIBERADO. Con `reachesSubmission` acá, la
// pantalla y el `WHERE` podrían discrepar sobre quién ve qué — y lo que se
// separaría en silencio es el aislamiento entre organizaciones. La regla del
// sitio: nunca confiar en un filtro del navegador para acotar datos.
//
// La paridad de lo que SÍ se espeja se comprueba comparando SALIDAS en
// `npm run test:submissions:inbox`. Al tocar uno, tocar el otro.
// ════════════════════════════════════════════════════════════════════════════

/** Los estados que todavía esperan que alguien los atienda. Es lo que hace
 *  que «15 sin revisar» corresponda EXACTAMENTE a lo que hay en la base. */
export const PENDING_STATES = ['recibido', 'requiere_info'];
export const isPending = (status: string) => PENDING_STATES.includes(String(status || ''));

export const CLOSED_STATES = ['publicado', 'descartado', 'archivado'];
export const isClosed = (status: string) => CLOSED_STATES.includes(String(status || ''));

export const CONTENT_KINDS: Record<string, { id: string; label: string }> = {
    image: { id: 'image', label: 'Fotografías' },
    video: { id: 'video', label: 'Videos' },
    none: { id: 'none', label: 'Sin archivos' },
};
export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS);

/** El valor con el que se pide «las que no tiene nadie». Una cadena vacía
 *  significaría «sin filtro», que es otra cosa. */
export const UNASSIGNED = '__sin__';

export const INBOX_PAGE_SIZE = 50;

export interface InboxQuery {
    campaign: string; status: string; site: string; district: string;
    assignee: string; kind: string; from: string; to: string; q: string;
    contentType: string; area: string; program: string; topic: string; priority: string;
    club: string;
    page: number;
}

export const EMPTY_QUERY: InboxQuery = {
    campaign: '', status: '', site: '', district: '',
    assignee: '', kind: '', from: '', to: '', q: '',
    contentType: '', area: '', program: '', topic: '', priority: '',
    club: '', page: 1,
};

/** ¿Hay algún filtro puesto? Distingue «no hay nada» de «lo filtraste», que se
 *  dicen distinto — un vacío sin explicación es indistinguible de un módulo
 *  roto (v4.938). La página NO entra en la cuenta: pasar a la 2 no es filtrar. */
export const hasFilters = (q: Partial<InboxQuery>): boolean =>
    Boolean(q.campaign || q.status || q.site || q.district || q.assignee || q.kind || q.from || q.to || q.q
        || q.contentType || q.area || q.program || q.topic || q.priority || q.club);

/** Cómo se llama cada filtro en la dirección. En español, como el resto de
 *  las URLs del sitio, y en UN solo mapa: escribir con un nombre y leer con
 *  otro daría un enlace que se abre sin el filtro que dice llevar. */
const PARAM: Record<keyof Omit<InboxQuery, 'page'>, string> = {
    campaign: 'campana', status: 'estado', site: 'sitio', district: 'distrito',
    assignee: 'responsable', kind: 'tipo', from: 'desde', to: 'hasta', q: 'q',
    contentType: 'actividad', area: 'area', program: 'programa', topic: 'tema', priority: 'prioridad',
    club: 'club',
};

/** Los filtros como parámetros de la dirección. Lo vacío no se escribe: una
 *  URL llena de `&estado=` es ilegible y no se puede compartir. */
export const toSearchParams = (q: Partial<InboxQuery>): URLSearchParams => {
    const p = new URLSearchParams();
    for (const [k, nombre] of Object.entries(PARAM) as [keyof typeof PARAM, string][]) {
        const v = q[k];
        if (v) p.set(nombre, String(v));
    }
    if (Number(q.page) > 1) p.set('page', String(q.page));
    return p;
};

/** …y de vuelta. Es lo que hace que la dirección con `?campana=<id>` abra la
 *  bandeja ya filtrada por esa campaña, y que recargar no pierda el filtro. */
export const fromSearchParams = (p: URLSearchParams): InboxQuery => ({
    // Se lee el nombre en español Y el interno: así una dirección escrita a
    // mano con `?campaign=` tampoco se pierde el filtro.
    campaign: p.get(PARAM.campaign) || p.get('campaign') || '',
    status: p.get(PARAM.status) || p.get('status') || '',
    site: p.get(PARAM.site) || p.get('site') || '',
    district: p.get(PARAM.district) || p.get('district') || '',
    assignee: p.get(PARAM.assignee) || p.get('assignee') || '',
    kind: p.get(PARAM.kind) || p.get('kind') || '',
    contentType: p.get(PARAM.contentType) || p.get('contentType') || '',
    area: p.get(PARAM.area) || p.get('area') || '',
    program: p.get(PARAM.program) || p.get('program') || '',
    topic: p.get(PARAM.topic) || p.get('topic') || '',
    priority: p.get(PARAM.priority) || p.get('priority') || '',
    club: p.get(PARAM.club) || p.get('club') || '',
    from: p.get(PARAM.from) || p.get('from') || '',
    to: p.get(PARAM.to) || p.get('to') || '',
    q: p.get('q') || '',
    page: Math.max(1, Number(p.get('page')) || 1),
});

/** La frase de la cabecera. La MISMA que el servidor, para que no digan cosas
 *  distintas sobre la misma vista. */
export const describeInboxView = (
    { mostradas = 0, total = 0, pendientes = 0, filtrada = false }:
    { mostradas?: number; total?: number; pendientes?: number; filtrada?: boolean }
): string => {
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

/** La dirección de la bandeja, con sus filtros. En UN solo sitio: con la ruta
 *  escrita a mano en cada pantalla que enlaza, el día que cambie una se queda
 *  apuntando a una página que no existe. */
export const INBOX_PATH = '/admin/campanas-contribucion/solicitudes';
export const inboxLink = (q: Partial<InboxQuery> = {}): string => {
    const p = toSearchParams(q);
    const s = p.toString();
    return s ? `${INBOX_PATH}?${s}` : INBOX_PATH;
};

import { PLATFORM_HOSTS } from './platformAdmin';

export interface ContentSubmissionsSiteContext {
    user?: { role?: string; clubId?: string | null } | null;
    club?: {
        id?: string;
        name?: string | null;
        subdomain?: string | null;
        domain?: string | null;
        type?: string | null;
        category?: string | null;
        district?: string | null;
    } | null;
    hostname?: string;
}

/**
 * ¿Tiene este sitio habilitado el módulo de solicitudes de contenido (Rotary en Acción)?
 *
 * Restringido EXCLUSIVAMENTE a las 4 entidades principales:
 * 1. Club Platform (app.clubplatform.org / localhost / plataforma global)
 * 2. Rotary 4281 (Sitio oficial del Distrito 4281: rotary4281.org, rotary4281, d4281)
 * 3. Feria de Proyectos (feriadeproyectos.org / tipo o nombre Feria de Proyectos)
 * 4. Colrotarios (colrotarios.org / tipo o nombre Colrotarios)
 *
 * Los sitios de clubes regulares (ej. Rotary Nuevo Cali, Pereira del Café, Quimbaya, etc.)
 * NO tienen habilitado este módulo ni deben ver la trazabilidad ni el buzón de solicitudes.
 */
export const isContentSubmissionsAllowedSite = (ctx: ContentSubmissionsSiteContext = {}): boolean => {
    const rawHost = (ctx.hostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase().trim();
    const club = ctx.club;
    const user = ctx.user;

    // ── Super Admin global de Club Platform (v4.1162) ─────────────────────
    // No depende de estar asociado a un sitio o distrito: su alcance es todo
    // el ecosistema, abra el módulo desde el dominio que lo abra y tenga o no
    // un club asignado en su cuenta. La marca es el ROL `superadmin` (o el
    // indicador `isSuperAdmin`), que nunca se asigna a un administrador local:
    // los locales usan `administrator`/`district_admin`/`club_admin`/`editor`
    // con su clubId, y siguen entrando por las reglas de entidad de abajo.
    const superRole = String((user as any)?.role || '');
    if (superRole === 'superadmin' || (user as any)?.isSuperAdmin === true) {
        return true;
    }

    const clubType = String(club?.type || '').toLowerCase().trim();
    const clubCategory = String(club?.category || '').toLowerCase().trim();
    const clubName = String(club?.name || '').toLowerCase().trim();
    const clubSubdomain = String(club?.subdomain || '').toLowerCase().trim();
    const clubDomain = String(club?.domain || '').toLowerCase().trim();

    // 1. Rotary 4281 (Sitio Distrital 4281)
    const isRotary4281Host = rawHost.includes('rotary4281');
    const isRotary4281Sub = clubSubdomain.includes('rotary4281') || clubSubdomain === 'd4281' || clubSubdomain === 'distrito-4281';
    const isRotary4281Domain = clubDomain.includes('rotary4281');
    const isDistrictSite = clubType === 'district' || clubType === 'distrito rotario' || clubType === 'distrito';
    const isDistrict4281Club = isDistrictSite && (clubName.includes('4281') || isRotary4281Sub || isRotary4281Domain);

    if (isRotary4281Host || isRotary4281Sub || isRotary4281Domain || isDistrict4281Club) {
        return true;
    }

    // 2. Feria de Proyectos
    const isFeriaHost = rawHost.includes('feriadeproyectos') || rawHost.includes('feria-de-proyectos');
    const isFeriaClub = clubType === 'feria de proyectos' || clubType === 'project_fair' || clubCategory === 'project_fair' ||
        clubName.includes('feria de proyectos') || clubSubdomain.includes('feriadeproyectos') || clubDomain.includes('feriadeproyectos');

    if (isFeriaHost || isFeriaClub) {
        return true;
    }

    // 3. Colrotarios
    const isColrotariosHost = rawHost.includes('colrotarios');
    const isColrotariosClub = clubType === 'colrotarios' || clubCategory === 'colrotarios' ||
        clubName.includes('colrotarios') || clubSubdomain.includes('colrotarios') || clubDomain.includes('colrotarios');

    if (isColrotariosHost || isColrotariosClub) {
        return true;
    }

    // 4. Club Platform (Super Admin en host de plataforma)
    const isPlatformHost = PLATFORM_HOSTS.includes(rawHost);
    if (!isPlatformHost) {
        // En un dominio propio de un club (ej. rotarynuevocali.org) nunca es Club Platform
        return false;
    }

    // En host de plataforma: sólo permitido si el usuario es administrador global de la plataforma
    // (rol administrator/superadmin o flag isSuperAdmin) y NO pertenece a un club regular específico.
    // En frontend, club?.id suele resolver al club maestro por defecto en hosts de plataforma, por
    // lo que la no pertenencia a un club regular se valida rigurosamente contra user?.clubId.
    const hasAssignedClub = !!(user?.clubId && user.clubId !== 'platform' && user.clubId !== 'global');
    const isSuperAdminRole = String(user?.role || '') === 'administrator' ||
        String(user?.role || '') === 'superadmin' ||
        (user as any)?.isSuperAdmin === true;

    if (isSuperAdminRole && !hasAssignedClub) {
        return true;
    }

    return false;
};
