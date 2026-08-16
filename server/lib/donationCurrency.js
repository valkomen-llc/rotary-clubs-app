// ════════════════════════════════════════════════════════════════════
// En qué moneda se cobra un aporte — el CRITERIO
// v4.834.0
//
// PURO: sin base, sin red. Decide si un visitante paga en la moneda del sitio
// o en dólares, y DICE por qué. La orquestación —leer el país del encabezado,
// consultar el `Setting` del club, crear la sesión de Stripe— vive fuera.
//
// ── EL DEFECTO QUE ESTO CORRIGE ─────────────────────────────────────
//
// Hasta v4.833 la moneda salía de `resolveClubCurrency` y nada más: la del
// SITIO. Con un sitio colombiano eso significa que TODO el mundo pagaba en
// pesos —un rotario de Estados Unidos leyendo la página en inglés veía «$» y
// se le cobraban pesos—. Y estaba declarado como pendiente conocido en
// CLAUDE.md: «la pasarela cobra en UNA sola moneda por club».
//
// ── LA REGLA, Y POR QUÉ ES UNA CONJUNCIÓN ───────────────────────────
//
// Se cobra en la moneda del sitio SÓLO si se cumplen las dos cosas: el idioma
// activo es el nacional Y el visitante está en el país del sitio. Cualquier
// otra combinación cobra en dólares.
//
//   · Idioma internacional (inglés y los otros seis) → dólares SIEMPRE. Quien
//     lee en inglés no espera que le cobren en pesos, y la cifra que ve en
//     pantalla tiene que ser la que le llega a la tarjeta.
//   · Español desde fuera del país → dólares. Es el caso que el idioma solo no
//     distingue: un rotario mexicano o español lee la página en español y no
//     tiene por qué recibir un cargo en pesos colombianos.
//
// El IDIOMA se compara con `isNationalLocale`, el mismo criterio que decide
// qué registro de evento se ofrece (v4.652) y qué logotipo se pinta (v4.699):
// `es` y `es-CO` son nacionales; `es-MX` o `es-ES` no lo son. Una segunda lista
// se separaría en silencio.
//
// ── SIN PAÍS SE DECIDE POR EL IDIOMA, Y ESO ES A PROPÓSITO ──────────
//
// La geolocalización del borde falla —red corporativa, VPN, un proveedor que
// no manda el encabezado— y ahí no hay dato que valga. Con el idioma nacional
// y sin país se conserva la moneda del sitio, que es lo que pasaba antes de
// esta versión: ante la duda no se cambia lo que ya funcionaba. Al revés
// —dólares por defecto— convertiría un fallo de geolocalización en un cambio
// de moneda para el visitante colombiano, que es el caso mayoritario.
//
// ── LO QUE ESTE CRITERIO NO HACE ────────────────────────────────────
//
// NO convierte importes. No hay tasa de cambio configurada en la plataforma y
// inventar una está prohibido por la regla del sitio —la misma que rige el
// `fx` de las inscripciones a eventos: «Sin tasa configurada NO se inventa
// una»—. Lo que cambia es la moneda EN LA QUE SE PIDE, con los montos
// sugeridos propios de esa moneda (`donationPresets`), no el mismo número
// releído en otra unidad.
// ════════════════════════════════════════════════════════════════════

import { isNationalLocale } from './eventRegistrationSpec.js';

/** La moneda internacional. Una sola: es la que acepta cualquier tarjeta y la
 *  única para la que hay montos sugeridos declarados. */
export const INTERNATIONAL_CURRENCY = 'USD';

/** Por qué se eligió la moneda. Viaja a la respuesta para que la pantalla
 *  pueda explicarlo y para poder diagnosticar un cobro sin mirar la base. */
export const REASONS = {
    club_is_international: 'El sitio ya cobra en dólares.',
    disabled: 'El cobro internacional está apagado en esta instalación.',
    foreign_language: 'El sitio se está leyendo en un idioma internacional.',
    foreign_country: 'La visita llega desde fuera del país del sitio.',
    national: 'Visita nacional: idioma y país del sitio.',
};

const upper = (v) => String(v ?? '').trim().toUpperCase();

/** El país al que pertenece un sitio, en ISO-3166 alpha-2.
 *
 *  `Club.country` es texto libre —«Colombia», «CO», «colombia»—, así que se
 *  normaliza acá y no en cada consumidor. Sin país declarado se deduce de la
 *  moneda, que es el dato que el operador sí configura siempre. */
export const countryOfSite = (rawCountry, clubCurrency) => {
    const c = String(rawCountry ?? '').trim().toLowerCase();
    if (/^co$/.test(c) || /colombia/.test(c)) return 'CO';
    if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
    // Sin país legible: la moneda es la mejor pista disponible.
    if (upper(clubCurrency) === 'COP') return 'CO';
    return '';
};

/**
 * En qué moneda se le cobra a ESTE visitante.
 *
 * @param clubCurrency  la del sitio (`Setting club_currency` o el país)
 * @param clubCountry   `Club.country`, texto libre
 * @param lang          el idioma ACTIVO del sitio, el que eligió el visitante
 * @param country       ISO-3166 alpha-2 del encabezado del borde, o vacío
 * @param enabled       el interruptor de la instalación
 */
export const resolveDonationCurrency = ({ clubCurrency, clubCountry = '', lang = '', country = '', enabled = true } = {}) => {
    const site = upper(clubCurrency) || INTERNATIONAL_CURRENCY;

    // Un sitio que ya cobra en dólares no tiene nada que decidir. Se contesta
    // antes que el interruptor para que apagarlo no cambie nada acá.
    if (site === INTERNATIONAL_CURRENCY) {
        return { currency: INTERNATIONAL_CURRENCY, siteCurrency: site, international: false, reason: 'club_is_international' };
    }
    if (!enabled) {
        return { currency: site, siteCurrency: site, international: false, reason: 'disabled' };
    }

    // Idioma internacional: dólares, sin mirar el país. Quien lee en inglés no
    // espera un cargo en pesos.
    if (!isNationalLocale(lang)) {
        return { currency: INTERNATIONAL_CURRENCY, siteCurrency: site, international: true, reason: 'foreign_language' };
    }

    // Español desde fuera del país del sitio: dólares. Es el caso que el idioma
    // por sí solo no distingue.
    const visitor = upper(country);
    const home = countryOfSite(clubCountry, site);
    if (visitor && home && visitor !== home) {
        return { currency: INTERNATIONAL_CURRENCY, siteCurrency: site, international: true, reason: 'foreign_country' };
    }

    // Idioma nacional y país del sitio —o país desconocido—: la moneda de
    // siempre. Sin geolocalización se conserva lo que ya funcionaba.
    return { currency: site, siteCurrency: site, international: false, reason: 'national' };
};

/**
 * ¿Sirven los montos sugeridos que configuró el club para ESTA moneda?
 *
 * NO, en cuanto la moneda cambia. Es la parte peligrosa de todo esto: un bloque
 * de Aportes guarda sus montos en la moneda del sitio —50.000, 100.000— y
 * ofrecerlos tal cual en dólares invitaría a un aporte de US$ 50.000. No se
 * convierten porque no hay tasa; se reemplazan por los propios de la moneda.
 */
export const blockAmountsApply = (blockCurrency, resolvedCurrency) =>
    upper(blockCurrency) === upper(resolvedCurrency);

export default {
    INTERNATIONAL_CURRENCY, REASONS, countryOfSite,
    resolveDonationCurrency, blockAmountsApply,
};
