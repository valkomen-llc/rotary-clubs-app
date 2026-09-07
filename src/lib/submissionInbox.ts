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
    page: number;
}

export const EMPTY_QUERY: InboxQuery = {
    campaign: '', status: '', site: '', district: '',
    assignee: '', kind: '', from: '', to: '', q: '', page: 1,
};

/** ¿Hay algún filtro puesto? Distingue «no hay nada» de «lo filtraste», que se
 *  dicen distinto — un vacío sin explicación es indistinguible de un módulo
 *  roto (v4.938). La página NO entra en la cuenta: pasar a la 2 no es filtrar. */
export const hasFilters = (q: Partial<InboxQuery>): boolean =>
    Boolean(q.campaign || q.status || q.site || q.district || q.assignee || q.kind || q.from || q.to || q.q);

/** Cómo se llama cada filtro en la dirección. En español, como el resto de
 *  las URLs del sitio, y en UN solo mapa: escribir con un nombre y leer con
 *  otro daría un enlace que se abre sin el filtro que dice llevar. */
const PARAM: Record<keyof Omit<InboxQuery, 'page'>, string> = {
    campaign: 'campana', status: 'estado', site: 'sitio', district: 'distrito',
    assignee: 'responsable', kind: 'tipo', from: 'desde', to: 'hasta', q: 'q',
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
