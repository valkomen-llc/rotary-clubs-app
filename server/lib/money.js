// El criterio del DINERO. Puro: sin base, sin red, sin IA, sin DOM.
//
// v4.841 — Se extrae de `eventRegistrationSpec.js`, que lo tenía desde v4.648
// y era el único sitio de la plataforma que trataba las monedas bien. La
// Bóveda de Fondos no lo usaba y sumaba dólares con pesos; el arreglo NO es
// escribir un segundo catálogo acá —dos catálogos se separan en silencio, es
// la regla del sitio— sino mover éste a un módulo propio y que aquél lo
// re-exporte. Las inscripciones a eventos siguen importando lo mismo de donde
// siempre.
//
// DOS NOCIONES DE «DECIMALES», Y CONFUNDIRLAS ES EL ERROR CARO:
//
//   `stripeDecimals()` es la UNIDAD MÍNIMA con la que Stripe cobra. Decide si
//   un importe se multiplica por 100 antes de mandarlo y si se divide por 100
//   al recibirlo. Es una convención del proveedor, no del país.
//
//   `currencyMeta().decimals` es cómo se ESCRIBE el importe. El peso
//   colombiano se cobra en Stripe con dos decimales y se escribe sin ninguno:
//   «$ 50.000», no «$ 50.000,00».
//
// COP es exactamente el caso donde las dos difieren, así que no se puede
// deducir una de la otra. Al agregar una moneda, decidir las dos por separado.

// ── Monedas ──────────────────────────────────────────────────────────

/** Monedas que Stripe cobra sin decimales: el importe va tal cual. */
export const ZERO_DECIMAL = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
    'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/** Cuántos decimales tiene la unidad mínima de Stripe para esta moneda. */
export const stripeDecimals = (currency) =>
    ZERO_DECIMAL.has(String(currency || '').toLowerCase()) ? 0 : 2;

/** Monedas que la plataforma sabe PRESENTAR. La lista no restringe a Stripe:
 *  una moneda que no esté acá se muestra igual, con el criterio por omisión. */
export const CURRENCIES = [
    { code: 'USD', label: 'Dólar estadounidense', symbol: 'US$', decimals: 2 },
    { code: 'COP', label: 'Peso colombiano', symbol: '$', decimals: 0 },
    { code: 'EUR', label: 'Euro', symbol: '€', decimals: 2 },
    { code: 'MXN', label: 'Peso mexicano', symbol: '$', decimals: 2 },
    { code: 'BRL', label: 'Real brasileño', symbol: 'R$', decimals: 2 },
];

/** El código en la forma canónica: mayúsculas y sin espacios. `''` si no hay. */
export const normalizeCurrency = (code) => String(code || '').trim().toUpperCase();

export const currencyMeta = (code) => {
    const upper = normalizeCurrency(code);
    const known = CURRENCIES.find(c => c.code === upper);
    if (known) return known;
    // Una moneda fuera del catálogo se presenta con los decimales de su unidad
    // mínima. Antes se daban dos por omisión, y eso escribía «JPY 1.250,00»
    // por un importe que el yen no puede tener.
    return { code: upper || 'USD', label: upper, symbol: '', decimals: stripeDecimals(upper) };
};

// ── Unidad mínima ────────────────────────────────────────────────────

/** Importe → entero en la unidad mínima con que Stripe cobra esa moneda. */
export const toStripeAmount = (amount, currency) =>
    stripeDecimals(currency) === 0
        ? Math.round(Number(amount) || 0)
        : Math.round((Number(amount) || 0) * 100);

/** Entero de Stripe → importe. El inverso exacto de `toStripeAmount`.
 *
 *  Esto es lo que faltaba en el webhook de donaciones: `bt.fee / 100` sin
 *  mirar la moneda multiplica por cien la comisión de un cobro en yenes. */
export const fromStripeAmount = (minor, currency) =>
    stripeDecimals(currency) === 0
        ? Math.round(Number(minor) || 0)
        : (Number(minor) || 0) / 100;

/** Redondea al número de decimales con que se ESCRIBE esa moneda. */
export const roundMoney = (amount, currency) => {
    const factor = 10 ** currencyMeta(currency).decimals;
    return Math.round((Number(amount) || 0) * factor) / factor;
};

export const formatMoney = (amount, currency) => {
    const meta = currencyMeta(currency);
    return `${Number(amount || 0).toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: meta.decimals,
    })} ${meta.code}`;
};

// ── Sumar SIN mezclar ────────────────────────────────────────────────
//
// Éste es el motivo por el que el módulo existe. Un total sin moneda al lado
// no significa nada, así que acá no hay ninguna función que devuelva un
// número suelto: todas devuelven un mapa por moneda.

/**
 * Suma una lista agrupando por moneda.
 *
 * @param rows     filas con importe y moneda
 * @param amountOf cómo sacar el importe de una fila
 * @param currencyOf cómo sacar la moneda de una fila
 * @returns { USD: 8.91, COP: 47498.84 } — nunca un escalar
 *
 * Una fila sin moneda legible NO se descarta en silencio ni se mete en la
 * moneda de al lado: cae en `''`, que el consumidor puede ver y reportar.
 * Descartarla haría desaparecer dinero de la pantalla; meterla en otra moneda
 * es justamente el defecto que esto viene a impedir.
 */
export const sumByCurrency = (rows, amountOf, currencyOf) => {
    const totals = {};
    for (const row of rows || []) {
        const currency = normalizeCurrency(currencyOf(row));
        const amount = Number(amountOf(row)) || 0;
        totals[currency] = (totals[currency] || 0) + amount;
    }
    // Redondear una vez al final, no en cada suma: acumular redondeos por fila
    // corre el total en los céntimos.
    for (const code of Object.keys(totals)) totals[code] = roundMoney(totals[code], code);
    return totals;
};

/** Agrupa filas por moneda conservándolas. */
export const groupByCurrency = (rows, currencyOf) => {
    const groups = {};
    for (const row of rows || []) {
        const currency = normalizeCurrency(currencyOf(row));
        (groups[currency] ||= []).push(row);
    }
    return groups;
};

/** Resta dos mapas por moneda, moneda por moneda. Nunca cruza. */
export const subtractByCurrency = (minuend, subtrahend) => {
    const out = {};
    for (const code of new Set([...Object.keys(minuend || {}), ...Object.keys(subtrahend || {})])) {
        out[code] = roundMoney((minuend?.[code] || 0) - (subtrahend?.[code] || 0), code);
    }
    return out;
};

/** Las monedas presentes, ordenadas: primero la preferida del sitio, después
 *  por importe descendente. El orden es estable — con dos monedas del mismo
 *  importe manda el código, o la pantalla las alternaría entre visitas. */
export const currenciesOf = (totals, preferred) => {
    const wanted = normalizeCurrency(preferred);
    return Object.keys(totals || {}).sort((a, b) => {
        if (a === wanted) return -1;
        if (b === wanted) return 1;
        const diff = (totals[b] || 0) - (totals[a] || 0);
        return diff !== 0 ? diff : a.localeCompare(b);
    });
};

/**
 * Cuál es la moneda PRINCIPAL de un club.
 *
 * Sólo sirve para alimentar los campos sueltos que la API conservaba de
 * antes, para que un navegador con el bundle anterior en caché muestre UNA
 * cifra verdadera en vez de la mezcla. Se prefiere la moneda configurada del
 * sitio, y si ahí no hay nada, la de mayor importe: mostrar «0» teniendo
 * dinero en otra moneda sería el otro extremo del mismo error.
 *
 * NO se use para decidir un cobro ni un retiro. Ahí la moneda es explícita.
 */
export const primaryCurrency = (totals, preferred) => {
    const wanted = normalizeCurrency(preferred);
    if (wanted && (totals?.[wanted] || 0) !== 0) return wanted;
    // El respaldo se ordena SIN preferencia: con ella, la moneda del sitio
    // volvería a quedar primera y se devolvería aunque su saldo sea cero, que
    // es justo el caso que este respaldo existe para atender.
    const ordered = currenciesOf(totals, '').filter(Boolean);
    return ordered[0] || wanted || 'USD';
};

export default {
    ZERO_DECIMAL, stripeDecimals, CURRENCIES, normalizeCurrency, currencyMeta,
    toStripeAmount, fromStripeAmount, roundMoney, formatMoney,
    sumByCurrency, groupByCurrency, subtractByCurrency, currenciesOf, primaryCurrency,
};
