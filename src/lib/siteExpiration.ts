// ════════════════════════════════════════════════════════════════════
// CUÁNDO SE VE LA BARRA DE VENCIMIENTO — v4.878
//
// El CRITERIO, y es PURO: sin red, sin base y sin DOM.
//
// ── EL DEFECTO QUE CORRIGE ──────────────────────────────────────────
//
// Se reportó con dos sitios delante: `rotarypasto.org` muestra la barra roja
// de vencimiento y `rotarynuevocali.org` no, aunque los dos están marcados
// como «Expirado / Vencido» en la ficha del panel.
//
// El motivo es que la barra NUNCA miró el estado de la suscripción. Dependía
// sólo de `expirationBannerActive`, una casilla aparte —«Activar Banner de
// Vencimiento»— que alguien había marcado a mano en Pasto y no en Nuevo Cali.
// O sea: poner un sitio en «Expirado» no hacía absolutamente nada visible, y
// no había forma de notarlo salvo comparando dos sitios.
//
// ── EL ESTADO MANDA; LA CASILLA SUMA ────────────────────────────────
//
// Un sitio expirado muestra la barra SIEMPRE. La casilla se conserva y sigue
// sirviendo para lo único que no cubre el estado: avisar ANTES de que venza,
// con el sitio todavía activo. Es la regla del sitio de que un estado se
// DERIVA y no se empuja — el mismo criterio con el que `effectiveStatus`
// resuelve una campaña programada cuyo inicio ya venció.
//
// ── ⚠️ NO SE DERIVA DE `expirationDate` ─────────────────────────────
//
// Sería lo aparentemente natural —«si la fecha pasó, está vencido»— y es
// justo lo que no se puede hacer sin mirar la base de producción primero: hay
// sitios con una fecha de expiración vieja y la suscripción al día, y la
// consecuencia de equivocarse es una barra ROJA de impago en la portada de un
// club que sí pagó. La fecha es un dato de facturación; el estado es la
// decisión. Se lee la decisión.
//
// ── EL CATÁLOGO ES CERRADO ──────────────────────────────────────────
//
// `inactive` es un prospecto que nunca contrató y `pending` es un cobro en
// curso: en ninguno de los dos la frase «Sitio en periodo de renovación» sería
// cierta. Sólo `expired` enciende la barra.
// ════════════════════════════════════════════════════════════════════

/** Los estados de suscripción que encienden la barra. Cerrado a propósito. */
export const EXPIRED_SUBSCRIPTION_STATUSES = ['expired'] as const;

/** Por qué se está viendo la barra. `null` = no se ve. */
export type ExpirationBannerReason = 'suscripcion' | 'manual' | null;

/** Lo que hace falta saber de un sitio para decidir. */
export interface ExpirationSource {
    subscriptionStatus?: string | null;
    expirationBannerActive?: boolean | null;
}

const normalizar = (v: unknown): string =>
    typeof v === 'string' ? v.trim().toLowerCase() : '';

/** El sitio está vencido según su estado de suscripción. */
export const isExpiredSubscription = (status?: string | null): boolean =>
    (EXPIRED_SUBSCRIPTION_STATUSES as readonly string[]).includes(normalizar(status));

/**
 * Por qué se ve la barra en este sitio.
 *
 * El MOTIVO importa tanto como el booleano: es lo que permite que el panel
 * explique una casilla sin marcar junto a una barra visible. Pintar el
 * indicador en contra del veredicto es el defecto que este proyecto ya
 * documentó una vez (v4.787).
 */
export const expirationBannerReason = (site?: ExpirationSource | null): ExpirationBannerReason => {
    if (!site) return null;
    // El estado va primero: es la decisión de facturación, y la casilla no
    // puede apagarlo. Un sitio vencido que no lo dijera es justamente lo que
    // se reportó.
    if (isExpiredSubscription(site.subscriptionStatus)) return 'suscripcion';
    if (site.expirationBannerActive === true) return 'manual';
    return null;
};

/**
 * Si este sitio muestra la barra de vencimiento.
 *
 * ⚠️ Lo consumen la barra (`ExpirationBanner`) y el desplazamiento del menú
 * (`Navbar`). Tienen que dar la MISMA respuesta: la barra es `sticky`, así que
 * si una dice que sí y la otra que no, el menú se monta encima del aviso.
 * Con la condición escrita en cada sitio eso pasa en silencio.
 */
export const showsExpirationBanner = (site?: ExpirationSource | null): boolean =>
    expirationBannerReason(site) !== null;

/**
 * Lo que el panel le dice a quien mira la casilla.
 *
 * Se devuelve el texto y no un booleano porque la casilla y el aviso son la
 * misma explicación: con el sitio vencido, la casilla no cambia nada.
 */
export const bannerLockNotice = (site?: ExpirationSource | null): string | null =>
    expirationBannerReason(site) === 'suscripcion'
        ? 'Este sitio está marcado como vencido, así que la barra ya se muestra en su portada. La casilla sirve para mostrarla ANTES del vencimiento, con el sitio todavía activo.'
        : null;
