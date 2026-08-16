// ════════════════════════════════════════════════════════════════════
// Espejo en el navegador de `server/lib/donationCurrency.js` — v4.834
//
// Lo usa el modal de aporte para saber qué montos sugerir y cómo rotular la
// moneda ANTES de que el visitante escriba nada. La decisión de VERDAD —la que
// llega a la sesión de Stripe— la toma el servidor, que es el único que ve el
// encabezado del país; acá se replica el criterio para que la pantalla no
// prometa una moneda distinta de la que se va a cobrar.
//
// Está duplicado A PROPÓSITO, como `contributionSpec.ts` y los otros espejos:
// el servidor no puede importar del bundle ni al revés. `test:currency` carga
// los dos y compara LAS SALIDAS. Al tocar uno, tocar el otro.
//
// `isNationalLang` NO se reescribe: sale de `audienceAssets.ts`, que ya es el
// criterio de idioma nacional del navegador. Una segunda lista se separaría en
// silencio — es la lección de v4.699.
// ════════════════════════════════════════════════════════════════════

import { isNationalLang } from './audienceAssets';

export const INTERNATIONAL_CURRENCY = 'USD';

export type CurrencyReason =
    | 'club_is_international' | 'disabled' | 'foreign_language' | 'foreign_country' | 'national';

export interface CurrencyDecision {
    currency: string;
    siteCurrency: string;
    international: boolean;
    reason: CurrencyReason;
}

const upper = (v: unknown) => String(v ?? '').trim().toUpperCase();

export const countryOfSite = (rawCountry: unknown, clubCurrency: unknown): string => {
    const c = String(rawCountry ?? '').trim().toLowerCase();
    if (/^co$/.test(c) || /colombia/.test(c)) return 'CO';
    if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
    if (upper(clubCurrency) === 'COP') return 'CO';
    return '';
};

export const resolveDonationCurrency = ({
    clubCurrency, clubCountry = '', lang = '', country = '', enabled = true,
}: {
    clubCurrency?: unknown; clubCountry?: unknown; lang?: string | null; country?: string | null; enabled?: boolean;
} = {}): CurrencyDecision => {
    const site = upper(clubCurrency) || INTERNATIONAL_CURRENCY;

    if (site === INTERNATIONAL_CURRENCY) {
        return { currency: INTERNATIONAL_CURRENCY, siteCurrency: site, international: false, reason: 'club_is_international' };
    }
    if (!enabled) {
        return { currency: site, siteCurrency: site, international: false, reason: 'disabled' };
    }
    if (!isNationalLang(lang)) {
        return { currency: INTERNATIONAL_CURRENCY, siteCurrency: site, international: true, reason: 'foreign_language' };
    }
    const visitor = upper(country);
    const home = countryOfSite(clubCountry, site);
    if (visitor && home && visitor !== home) {
        return { currency: INTERNATIONAL_CURRENCY, siteCurrency: site, international: true, reason: 'foreign_country' };
    }
    return { currency: site, siteCurrency: site, international: false, reason: 'national' };
};

/** Los montos configurados por el club sólo valen en SU moneda. Ofrecer
 *  «50.000» como sugerencia en dólares invitaría a un aporte de US$ 50.000. */
export const blockAmountsApply = (blockCurrency: unknown, resolvedCurrency: unknown): boolean =>
    upper(blockCurrency) === upper(resolvedCurrency);

export default {
    INTERNATIONAL_CURRENCY, countryOfSite, resolveDonationCurrency, blockAmountsApply,
};
