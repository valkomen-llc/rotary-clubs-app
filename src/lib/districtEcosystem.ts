// ════════════════════════════════════════════════════════════════════
// Espejo en el navegador de `server/lib/districtEcosystem.js` — v4.747
//
// DUPLICADO A PROPÓSITO, igual que `ADMIN_ROLES`, `NATIONAL_LANGS` y los
// espejos de `designSpec` / `designFields`: el servidor no puede importar del
// bundle ni el bundle del servidor. **Si cambia uno, cambiar el otro** — lo
// comprueba `npm run test:ecosystem`, que carga los dos y compara LAS SALIDAS
// de las funciones, no sólo las constantes.
// ════════════════════════════════════════════════════════════════════

export interface OrgBadge {
    key: string;
    label: string;
    color: string;
}

export interface SourceTrace {
    eventId: string;
    clubId: string;
    clubName: string;
    clubType: string;
    url: string;
    clonedAt: string | null;
}

export interface Divergence {
    missing: boolean;
    changed: Array<{ field: string; label: string }>;
}

const norm = (s: unknown): string => (s == null ? '' : String(s).trim().toLowerCase());

/**
 * Espejo de `DISTRICT_SITE_TYPES` en `server/lib/districtSite.js`.
 *
 * Son DOS valores porque el alta desde /admin/distritos escribe la clave
 * máquina (`district`) y el formulario de sitios guarda la etiqueta legible
 * (`Distrito Rotario`). Comprobar sólo uno deja fuera a la mitad de los
 * distritos según por dónde se hayan creado. La paridad con el servidor la
 * comprueba `npm run test:ecosystem`.
 */
export const DISTRICT_SITE_TYPES = ['district', 'distrito rotario'];

export function isDistrictSiteType(type: unknown): boolean {
    return DISTRICT_SITE_TYPES.includes(norm(type));
}

/** El color va en HEXADECIMAL, no como clase de Tailwind: una clase armada al
 *  vuelo no llega al CSS compilado y la regla no existe, en silencio (v4.719). */
export const ORG_BADGES: Array<OrgBadge & { types: string[] }> = [
    { key: 'district',   label: 'Distrito',   color: '#17458F', types: ['district', 'distrito rotario'] },
    { key: 'club',       label: 'Club',       color: '#2C6FD1', types: ['club', 'club rotario'] },
    { key: 'foundation', label: 'Fundación',  color: '#2E7D5B', types: ['colrotarios', 'foundation'] },
    { key: 'exchange',   label: 'RYE',        color: '#C97A22', types: ['programa de intercambio', 'exchange_program'] },
    { key: 'fair',       label: 'Feria',      color: '#7A55B8', types: ['feria de proyectos', 'project_fair'] },
    { key: 'event',      label: 'Evento',     color: '#B5417A', types: ['evento o convención', 'conference', 'event'] },
    { key: 'association',label: 'Asociación', color: '#0E7C86', types: ['association', 'asociación rotaria'] },
    { key: 'zone',       label: 'Zona',       color: '#7A6A55', types: ['zona'] },
];

const FALLBACK_BADGE: OrgBadge = { key: 'other', label: 'Organización', color: '#64748B' };

export function orgBadgeOf(club: any): OrgBadge {
    if (!club) return FALLBACK_BADGE;
    for (const field of ['type', 'organizationType', 'category']) {
        const value = norm(club[field]);
        if (!value) continue;
        const hit = ORG_BADGES.find((b) => b.types.includes(value));
        if (hit) return { key: hit.key, label: hit.label, color: hit.color };
    }
    return FALLBACK_BADGE;
}

/**
 * Los números de distrito escritos en `Club.district` — v4.748.
 *
 * ESE CAMPO ES UNA LISTA: una Feria de Proyectos o una Zona pertenecen a varios
 * distritos. Se parte por todo lo que no sea dígito, que es EXACTAMENTE lo que
 * hace el SQL del controlador (`regexp_split_to_table(district, '[^0-9]+')`).
 * Si cambia uno, cambiar el otro.
 */
export function parseDistrictTags(value: unknown): string[] {
    const out: string[] = [];
    for (const tok of String(value ?? '').split(/[^0-9]+/)) {
        if (!tok) continue;
        if (!out.includes(tok)) out.push(tok);
    }
    return out;
}

export function formatDistrictTags(tags: string[]): string {
    return (Array.isArray(tags) ? tags : []).filter(Boolean).join(', ');
}

export function districtTagsMatch(value: unknown, number: unknown): boolean {
    const n = String(number ?? '').trim();
    if (!n) return false;
    return parseDistrictTags(value).includes(n);
}

export function publicUrlOf(club: any, entity: any, section = 'eventos'): string {
    const ref = entity?.slug || entity?.id;
    if (!ref) return '';

    const domain = norm(club?.domain).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (domain) return `https://${domain}/${section}/${ref}`;

    const sub = norm(club?.subdomain);
    if (sub) return `https://${sub}.clubplatform.org/${section}/${ref}`;

    return '';
}

/** La dirección pública de un PROYECTO en el sitio de su dueño. */
export function publicProjectUrlOf(club: any, project: any): string {
    return publicUrlOf(club, project, 'proyectos');
}

export function buildSourceTrace(
    { event, club, clonedAt }: { event: any; club: any; clonedAt?: string | null },
): SourceTrace | null {
    if (!event?.id || !club?.id) return null;
    return {
        eventId: String(event.id),
        clubId: String(club.id),
        clubName: club.name || '',
        clubType: orgBadgeOf(club).key,
        url: publicUrlOf(club, event),
        clonedAt: clonedAt || null,
    };
}

export function sourceTraceOf(event: any): SourceTrace | null {
    let meta = event?.metadata;
    if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { return null; }
    }
    const source = meta?.source;
    if (!source || typeof source !== 'object') return null;
    if (!source.eventId) return null;
    return source as SourceTrace;
}

export function isClone(event: any): boolean {
    return sourceTraceOf(event) !== null;
}

export const TRACKED_FIELDS = [
    { key: 'title', label: 'el título', date: false },
    { key: 'startDate', label: 'la fecha de inicio', date: true },
    { key: 'endDate', label: 'la fecha de fin', date: true },
    { key: 'location', label: 'la ubicación', date: false },
];

/**
 * Los campos de un PROYECTO que se vigilan.
 *
 * `recaudado` y `donantes` NO están a propósito: se mueven con cada aporte, así
 * que vigilarlos dejaría la copia marcada como «cambió» para siempre — y el
 * aviso que salta siempre se deja de leer. Se refrescan igual al pulsar
 * «Actualizar desde el origen».
 */
export const PROJECT_TRACKED_FIELDS = [
    { key: 'title', label: 'el título', date: false },
    { key: 'status', label: 'el estado', date: false },
    { key: 'ubicacion', label: 'la ubicación', date: false },
    { key: 'fechaEstimada', label: 'la fecha estimada', date: true },
    { key: 'meta', label: 'la meta de recaudación', date: false },
];

const sameValue = (a: any, b: any, isDate?: boolean): boolean => {
    if (isDate) {
        const ta = a ? new Date(a).getTime() : 0;
        const tb = b ? new Date(b).getTime() : 0;
        return (Number.isNaN(ta) ? 0 : ta) === (Number.isNaN(tb) ? 0 : tb);
    }
    return String(a ?? '').trim() === String(b ?? '').trim();
};

export function divergenceOf(
    clone: any, origin: any, fields = TRACKED_FIELDS,
): Divergence {
    if (!origin) return { missing: true, changed: [] };
    const changed: Array<{ field: string; label: string }> = [];
    for (const f of fields) {
        if (!sameValue(clone?.[f.key], origin?.[f.key], f.date)) {
            changed.push({ field: f.key, label: f.label });
        }
    }
    return { missing: false, changed };
}

export function divergenceMessage(divergence: Divergence | null | undefined): string {
    if (!divergence) return '';
    if (divergence.missing) return 'El evento original ya no existe en su sitio.';
    if (!divergence.changed.length) return '';
    const labels = divergence.changed.map((c) => c.label);
    const list = labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
    return `En el sitio de origen cambió ${list}.`;
}

export function freeSlug(base: string, taken: Array<string | null | undefined>): string | null {
    const clean = String(base ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 110);
    if (!clean) return null;

    const used = new Set((taken || []).filter(Boolean).map((s) => String(s).toLowerCase()));
    if (!used.has(clean)) return clean;
    for (let i = 2; i < 100; i++) {
        const candidate = `${clean}-${i}`;
        if (!used.has(candidate)) return candidate;
    }
    return null;
}
