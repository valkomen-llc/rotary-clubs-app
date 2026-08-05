// ════════════════════════════════════════════════════════════════════
// La SEDE de un evento — v4.717.0
//
// Dónde se realiza el evento, con cara y con nombre: la foto del lugar, su
// sitio web, a quién escribirle y el mapa. Vive en `CalendarEvent.metadata.venue`
// —columna `Json` que ya existe— así que no hace falta tocar el esquema de
// Prisma ni sincronizar la base, que es justo lo que la sección de base de
// datos de CLAUDE.md manda evitar.
//
// Es POR EVENTO, no escrito en el código. Hasta ahora el único mapa del sitio
// era el de la Conferencia LATIR, con la dirección puesta a mano dentro de
// `EventoDetalle.tsx` y detrás de un `if` por id de evento: sólo servía para
// ese evento y nadie podía cambiarlo sin desplegar.
// ════════════════════════════════════════════════════════════════════

export interface VenueContact {
    name: string;
    role: string;
    email: string;
    phone: string;
    mobile: string;
}

export interface EventVenue {
    /** Nombre del lugar. Si falta, se usa `event.location`. */
    name: string;
    /** Dirección o ciudad, tal como se quiera leer bajo el nombre. */
    address: string;
    /** Foto del lugar. Se sube o se elige de la Biblioteca Multimedia. */
    image: string;
    /** Sitio web del lugar. */
    website: string;
    /** Dirección del mapa incrustado, ya normalizada. */
    mapUrl: string;
    contacts: VenueContact[];
}

export const emptyContact = (): VenueContact =>
    ({ name: '', role: '', email: '', phone: '', mobile: '' });

const text = (value: unknown, max = 300): string =>
    String(value ?? '').trim().slice(0, max);

/**
 * Sólo se admite un mapa de Google.
 *
 * El administrador pega lo que Google le da —el `<iframe>` completo— o la
 * dirección suelta; de las dos se saca el `src`. Se acota a Google Maps a
 * propósito: es un `<iframe>` que se va a dibujar en una página pública, y
 * aceptar cualquier dirección convertiría un campo de texto del panel en un
 * hueco por donde meter cualquier cosa en el sitio.
 */
export const normalizeMapUrl = (raw: unknown): string => {
    const value = String(raw ?? '').trim();
    if (!value) return '';

    // Del `<iframe …>` completo se toma el `src`.
    const fromIframe = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(value);
    const candidate = (fromIframe ? fromIframe[1] : value).trim();

    try {
        const url = new URL(candidate);
        if (url.protocol !== 'https:') return '';
        const host = url.hostname.toLowerCase();
        const isGoogle = host === 'www.google.com' || host === 'maps.google.com'
            || host === 'google.com' || /\.google\.[a-z.]+$/.test(host);
        if (!isGoogle || !url.pathname.toLowerCase().includes('map')) return '';
        return url.toString();
    } catch {
        return '';
    }
};

/** Enlace normalizado: se admite escribir el dominio sin `https://`. */
export const normalizeWebsite = (raw: unknown): string => {
    const value = text(raw, 300);
    if (!value) return '';
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
        const url = new URL(withScheme);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
    } catch {
        return '';
    }
};

/** Cómo se lee un enlace: sin esquema ni barra final, que es como se escribe. */
export const websiteLabel = (url: string): string =>
    String(url || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');

export const normalizeVenue = (raw: any): EventVenue => {
    const contacts = Array.isArray(raw?.contacts) ? raw.contacts : [];
    return {
        name: text(raw?.name, 200),
        address: text(raw?.address, 300),
        image: text(raw?.image, 600),
        website: normalizeWebsite(raw?.website),
        mapUrl: normalizeMapUrl(raw?.mapUrl ?? raw?.map),
        contacts: contacts
            .map((c: any) => ({
                name: text(c?.name, 160),
                role: text(c?.role, 160),
                email: text(c?.email, 200).toLowerCase(),
                phone: text(c?.phone, 60),
                mobile: text(c?.mobile, 60),
            }))
            // Un contacto sin nombre ni forma de contactarlo no es un contacto.
            .filter((c: VenueContact) => c.name || c.email || c.phone || c.mobile)
            .slice(0, 6),
    };
};

/**
 * ¿Hay algo que mostrar? La sede se dibuja sólo si tiene contenido propio:
 * un bloque vacío bajo la ubicación ocuparía sitio sin decir nada.
 */
export const venueHasContent = (venue: EventVenue): boolean =>
    Boolean(venue.image || venue.website || venue.mapUrl || venue.contacts.length
        || venue.name || venue.address);

/** Marcador para teléfonos: se deja marcar desde el móvil. */
export const telHref = (value: string): string =>
    `tel:${String(value || '').replace(/[^\d+]/g, '')}`;
