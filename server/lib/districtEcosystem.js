// ════════════════════════════════════════════════════════════════════
// El ecosistema de un distrito, y cómo se trae un evento suyo — v4.747
//
// PURO a propósito: sin base, sin red, sin DOM. Igual que `districtSite.js`,
// `domains.js` y `seoRules.js`, y por el mismo motivo — este criterio decide
// qué se copia dentro del sitio de un distrito y tiene que poder probarse sin
// levantar nada. La orquestación vive en el controlador.
//
// QUÉ RESUELVE
// ------------
// El sitio de un distrito quiere mostrar en su propia agenda los eventos de
// los sitios vinculados a él —clubes, la Feria de Proyectos, RYE, fundaciones—.
// Se resolvió CLONANDO el evento, no referenciándolo: el clon es una fila más
// de `CalendarEvent` en el sitio del distrito, así que no hace falta ninguna
// tabla nueva, ninguna columna nueva y ningún cambio de esquema. El módulo de
// eventos que ya existe lo lista, lo edita y lo publica sin enterarse.
//
// EL PRECIO DEL CLON, Y CÓMO SE PAGA
// ----------------------------------
// Un clon es una COPIA: el día que el club de origen corrige la hora, la copia
// se queda con la vieja. En un evento, la fecha equivocada es el peor fallo
// posible —la gente llega el día que no es— y además es MUDO. Por eso el clon
// no es una copia anónima: lleva su procedencia escrita en
// `metadata.source`, y de esa huella salen las tres cosas que hacen el clon
// sostenible:
//
//   1. ATRIBUCIÓN — la ficha pública dice de quién es el evento y enlaza al
//      original, así que el clon promociona en vez de apropiarse.
//   2. DIVERGENCIA — `divergenceOf` compara el clon con su original y dice qué
//      cambió. Sin la huella no hay contra qué comparar.
//   3. ACTUALIZAR — con el id del original se puede releer y refrescar el clon.
//      Es lo que convierte «se desincronizó» en un botón.
//
// La huella cuesta una línea al clonar y es lo único que separa esta solución
// de una copia-y-pega irrecuperable.
//
// LO QUE EL CLON NO SE LLEVA
// --------------------------
// La INSCRIPCIÓN. `EventEdition."eventId"` es UNIQUE y `EventRegistration`,
// `EventRegistrationCategory` y `EventRegistrationPayment` cuelgan todas de
// `eventId`. El clon nace con un id nuevo, así que no tiene edición, ni
// categorías, ni precios: copiar `metadata.registration` le pondría un botón
// «Inscribirme» que lleva a un formulario vacío. Quien se inscribiera desde el
// sitio del distrito no se estaría inscribiendo a nada. El botón del clon
// lleva SIEMPRE al evento original, que es donde el formulario existe.
// ════════════════════════════════════════════════════════════════════

const norm = (s) => (s == null ? '' : String(s).trim().toLowerCase());

/**
 * Cómo se rotula la organización dueña de un evento.
 *
 * El color va como HEXADECIMAL, no como clase de Tailwind, y no es un capricho:
 * Tailwind sólo genera las clases que puede LEER en el código, así que una
 * clase armada al vuelo (`bg-${color}-100`) no existe en el CSS compilado y la
 * regla no se aplica —en silencio, sin error—. Es exactamente el fallo que este
 * proyecto ya documentó con `bg-rotary-blue/90` en v4.719. Con un hexadecimal y
 * un `style` en línea, el color llega siempre.
 */
export const ORG_BADGES = [
    { key: 'district',   label: 'Distrito',   color: '#17458F', types: ['district', 'distrito rotario'] },
    { key: 'club',       label: 'Club',       color: '#2C6FD1', types: ['club', 'club rotario'] },
    { key: 'foundation', label: 'Fundación',  color: '#2E7D5B', types: ['colrotarios', 'foundation'] },
    { key: 'exchange',   label: 'RYE',        color: '#C97A22', types: ['programa de intercambio', 'exchange_program'] },
    { key: 'fair',       label: 'Feria',      color: '#7A55B8', types: ['feria de proyectos', 'project_fair'] },
    { key: 'event',      label: 'Evento',     color: '#B5417A', types: ['evento o convención', 'conference', 'event'] },
    { key: 'association',label: 'Asociación', color: '#0E7C86', types: ['association', 'asociación rotaria'] },
    { key: 'zone',       label: 'Zona',       color: '#7A6A55', types: ['zona'] },
];

const FALLBACK_BADGE = { key: 'other', label: 'Organización', color: '#64748B' };

/**
 * La etiqueta de una organización a partir de su sitio.
 *
 * Mira `type`, `organizationType` y `category` porque el modelo `Club` guarda
 * la clasificación en los tres según por dónde se haya creado el sitio, y
 * `entityTypes.js` ya documenta que se desincronizan. Acá se prefiere el más
 * específico que se reconozca, en vez de confiar en uno solo y rotular media
 * plataforma como «Organización».
 */
export function orgBadgeOf(club) {
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
 * ESE CAMPO ES UNA LISTA, no un valor. El formulario del panel lo dice desde
 * siempre en su marcador de posición («Ej: 4271, 4281, 4290…») y una Feria de
 * Proyectos o una Zona pertenecen de verdad a varios distritos a la vez. La
 * v4.747 comparaba por IGUALDAD EXACTA (`btrim(district) = numero`), así que un
 * sitio con «4271, 4281» no lo reconocía NINGUNO de los dos distritos y su
 * evento no aparecía en «Traer del ecosistema». Se reportó con la Feria.
 *
 * Se parte por todo lo que no sea dígito, en vez de buscar un patrón: así
 * «4271, 4281», «Distrito 4281» y «D-4281» dan lo mismo, y «42811» NO cuenta
 * como 4281 —es otro número, no ese—.
 *
 * ES EL MISMO CRITERIO QUE EL SQL del controlador
 * (`regexp_split_to_table(district, '[^0-9]+')`). Si cambia uno, cambiar el
 * otro: la prueba compara los dos contra los mismos casos.
 */
export function parseDistrictTags(value) {
    const out = [];
    for (const tok of String(value ?? '').split(/[^0-9]+/)) {
        if (!tok) continue;
        if (!out.includes(tok)) out.push(tok);
    }
    return out;
}

/** Cómo se guarda la lista de vuelta en `Club.district`. */
export function formatDistrictTags(tags) {
    return (Array.isArray(tags) ? tags : []).filter(Boolean).join(', ');
}

/** ¿Este sitio declara pertenecer al distrito número N? */
export function districtTagsMatch(value, number) {
    const n = String(number ?? '').trim();
    if (!n) return false;
    return parseDistrictTags(value).includes(n);
}

/**
 * La dirección PÚBLICA de un evento en el sitio de su dueño.
 *
 * Dos reglas heredadas y las dos importan:
 *
 *   - Se prefiere el SLUG sobre el id (v4.658): lo que se guarda es el id
 *     —lo único que no cambia— y lo que se PUBLICA es el slug.
 *   - El dominio propio manda y el subdominio de plataforma es el respaldo. Un
 *     sitio sin dominio propio sigue teniendo dirección; devolver cadena vacía
 *     dejaría el botón «Ver evento original» sin destino, que es peor que una
 *     dirección larga.
 */
export function publicUrlOf(club, event) {
    const ref = event?.slug || event?.id;
    if (!ref) return '';

    const domain = norm(club?.domain).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (domain) return `https://${domain}/eventos/${ref}`;

    const sub = norm(club?.subdomain);
    if (sub) return `https://${sub}.clubplatform.org/eventos/${ref}`;

    return '';
}

/**
 * La huella que convierte una copia en un clon con procedencia.
 *
 * `clonedAt` entra como PARÁMETRO y no se lee del reloj acá dentro: una
 * función que consulta la hora por su cuenta no se puede probar. Es la misma
 * razón por la que `yearsSince` y `rotaryPeriod` reciben `today` en
 * `designSpec.js`.
 */
export function buildSourceTrace({ event, club, clonedAt }) {
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

/** La huella de un evento, o null si no es un clon. Tolera `metadata` en texto. */
export function sourceTraceOf(event) {
    let meta = event?.metadata;
    if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { return null; }
    }
    const source = meta?.source;
    if (!source || typeof source !== 'object') return null;
    if (!source.eventId) return null;
    return source;
}

/** ¿Este evento del sitio es una copia traída de otra organización? */
export function isClone(event) {
    return sourceTraceOf(event) !== null;
}

/**
 * Qué campos del evento se copian, y con qué `metadata`.
 *
 * `registration` y `latir` se RETIRAN a propósito: son las dos llaves que
 * encienden el panel de inscripción en la ficha pública, y el clon no tiene
 * ni edición ni categorías detrás (ver la cabecera de este archivo). `venue`
 * SÍ se conserva —la sede es un dato del lugar, no del cobro— y se dibuja bien
 * en cualquier sitio.
 */
export function buildClonePayload({ event, club, clonedAt, slug }) {
    let meta = event?.metadata;
    if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
    }
    const { registration, latir, source, ...rest } = meta || {};

    return {
        title: event?.title || '',
        description: event?.description || '',
        htmlContent: event?.htmlContent || '',
        startDate: event?.startDate || null,
        endDate: event?.endDate || null,
        location: event?.location || '',
        type: event?.type || 'meeting',
        image: event?.image || '',
        images: Array.isArray(event?.images) ? event.images : [],
        slug: slug ?? null,
        metadata: { ...rest, source: buildSourceTrace({ event, club, clonedAt }) },
    };
}

/** Los campos cuya diferencia con el original le importa a alguien. */
export const TRACKED_FIELDS = [
    { key: 'title', label: 'el título' },
    { key: 'startDate', label: 'la fecha de inicio', date: true },
    { key: 'endDate', label: 'la fecha de fin', date: true },
    { key: 'location', label: 'la ubicación' },
];

const sameValue = (a, b, isDate) => {
    if (isDate) {
        const ta = a ? new Date(a).getTime() : 0;
        const tb = b ? new Date(b).getTime() : 0;
        return (Number.isNaN(ta) ? 0 : ta) === (Number.isNaN(tb) ? 0 : tb);
    }
    return String(a ?? '').trim() === String(b ?? '').trim();
};

/**
 * En qué se ha ido separando el clon de su original.
 *
 * Se comparan CUATRO campos, no todos. La descripción y el HTML cambian por
 * correcciones de redacción que a nadie le urge propagar; la fecha, la hora, el
 * título y el lugar son los que mandan a alguien al sitio equivocado el día
 * equivocado. Avisar de todo sería avisar de nada: el aviso que salta siempre
 * se deja de leer.
 *
 * Si el original ya no existe se devuelve `missing: true`, que es una situación
 * DISTINTA de «no cambió nada» y se dice distinto en la pantalla.
 */
export function divergenceOf(clone, origin) {
    if (!origin) return { missing: true, changed: [] };
    const changed = [];
    for (const f of TRACKED_FIELDS) {
        if (!sameValue(clone?.[f.key], origin?.[f.key], f.date)) {
            changed.push({ field: f.key, label: f.label });
        }
    }
    return { missing: false, changed };
}

/** Frase llana para la pantalla. No inventa: enumera lo que se midió. */
export function divergenceMessage(divergence) {
    if (!divergence) return '';
    if (divergence.missing) return 'El evento original ya no existe en su sitio.';
    if (!divergence.changed.length) return '';
    const labels = divergence.changed.map((c) => c.label);
    const list = labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
    return `En el sitio de origen cambió ${list}.`;
}

/**
 * Un slug libre dentro del sitio que clona.
 *
 * `CalendarEvent` tiene índice único `(clubId, slug)`. El slug del original no
 * choca con nada al llegar a otro sitio —es otro `clubId`—, pero clonar DOS
 * eventos con el mismo slug dentro del mismo distrito sí choca, y el error de
 * Postgres saldría como un 409 sin explicación. Se resuelve acá, con sufijo.
 */
export function freeSlug(base, taken) {
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
    return null;   // sin slug se entra por el id: el evento sigue siendo accesible
}

export default {
    ORG_BADGES, orgBadgeOf, publicUrlOf, buildSourceTrace, sourceTraceOf,
    isClone, buildClonePayload, TRACKED_FIELDS, divergenceOf, divergenceMessage, freeSlug,
    parseDistrictTags, formatDistrictTags, districtTagsMatch,
};
