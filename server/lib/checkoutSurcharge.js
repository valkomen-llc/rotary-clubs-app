// EL RECARGO QUE PAGA QUIEN SE INSCRIBE. Puro: sin base, sin red, sin DOM.
//
// v4.980 — Pedido del cliente: aplicar a la inscripción de proyectos de la
// Feria y al registro de asistentes al evento —nacional, internacional y
// CADRE— la misma comisión que ya se aplica a los aportes de «Maneras de
// Contribuir»: 2,9 % de pasarela de pagos y 2,1 % de traslado interbancario.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ ACÁ LA COMISIÓN SE SUMA; EN LOS APORTES SE DESCUENTA
// ═════════════════════════════════════════════════════════════════════
//
// Es la diferencia de la que cuelga todo lo demás y la razón por la que esto
// NO reutiliza `feeRules.js`. Allá el aportante da 100, la plataforma retiene
// su parte y la organización recibe 95: la comisión sale del RECEPTOR. Acá el
// precio publicado es lo que la organización tiene que recibir, así que la
// comisión la paga QUIEN SE INSCRIBE y se suma al valor —«aparezca la comisión
// al final y se le sume al valor del evento», con esas palabras—.
//
// Atarlos al mismo número tenía un precio concreto: cambiar la retención de
// los aportes movería en silencio lo que paga un inscrito, y al revés. Y hoy
// serían cifras distintas —la retención por defecto de `feeRules` es del 5 %,
// no del 2,1 %—, así que heredarla habría cobrado ~7,9 % a cada inscrito sin
// que nadie lo decidiera. Son dos preguntas distintas y por eso son dos
// configuraciones, cada una con su llave de `PlatformConfig`. Lo que NO se
// duplica es la pantalla: las dos se editan en el mismo panel de tarifas.
//
// ═════════════════════════════════════════════════════════════════════
// SE SUMA, NO SE HACE «GROSS-UP», Y CONVIENE SABER POR QUÉ
// ═════════════════════════════════════════════════════════════════════
//
// El recargo se calcula SOBRE EL PRECIO PUBLICADO. La alternativa aritmética
// —dividir por (1 − tasa) para que lo que quede después de la pasarela sea
// exactamente el precio— es más exacta y es inexplicable en una pantalla: el
// número que se le muestra a alguien dejaría de ser un porcentaje redondo de
// lo que está pagando. Medido sobre el caso real (250.000 COP al 5 %): sumando
// da 262.500 y quedan ~249.600 después de la pasarela; con gross-up daría
// 263.158. La diferencia es del 0,14 % y el primero se puede leer.
//
// ═════════════════════════════════════════════════════════════════════
// CADA LÍNEA SE REDONDEA Y EL TOTAL ES LA SUMA DE LAS LÍNEAS
// ═════════════════════════════════════════════════════════════════════
//
// No al revés. Si el total se redondeara por su cuenta, las líneas que se le
// muestran a quien paga no sumarían el total que se le cobra, y un desglose
// que no cuadra por un peso se lee como un error del sistema.

import { normalizeCurrency, roundMoney, currencyMeta } from './money.js';

/** La llave de `PlatformConfig`. Aparte de `financial_fee_rules` a propósito:
 *  ver la cabecera. Un guardado de una no puede corromper la otra. */
export const SURCHARGE_KEY = 'checkout_surcharge';

/**
 * Las líneas del recargo. Catálogo CERRADO: una clave que no esté acá no se
 * puede configurar, así que no puede aparecer un tercer cobro que nadie sepa
 * de dónde salió. Misma regla que `SCOPES` en `feeRules.js`.
 *
 * Los rótulos son los del cliente y se le MUESTRAN a quien paga: un recargo
 * sin nombre es un cobro sin explicar.
 */
export const SURCHARGE_LINES = [
    { key: 'gateway', label: 'Comisión de la pasarela de pagos', percent: 0.029, fixed: 0 },
    { key: 'transfer', label: 'Traslado interbancario', percent: 0.021, fixed: 0 },
];

export const LINE_KEYS = SURCHARGE_LINES.map(l => l.key);

/**
 * Dónde se aplica. Catálogo CERRADO y por FLUJO, no un interruptor único: la
 * Feria y el evento son dos cobros distintos y el cliente puede querer el
 * recargo en uno y no en el otro sin desplegar.
 */
export const SURCHARGE_FLOWS = [
    { key: 'project_fair', label: 'Inscripción de proyectos (Feria de Proyectos)' },
    { key: 'event_registration', label: 'Registro de asistentes al evento' },
];

export const FLOW_KEYS = SURCHARGE_FLOWS.map(f => f.key);

/** Los aportes NO están en la lista, y su ausencia es deliberada: ahí la
 *  comisión se DESCUENTA y la gobierna `feeRules.js`. */
export const DEFAULT_SURCHARGE = {
    enabled: { project_fair: true, event_registration: true },
    lines: {
        gateway: { percent: 0.029, fixed: 0 },
        transfer: { percent: 0.021, fixed: 0 },
    },
    // { COP: { gateway: { percent, fixed }, transfer: { … } } } — el componente
    // fijo de una tarifa sólo significa algo en su moneda.
    byCurrency: {},
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** ¿Se aplica el recargo en este flujo? Ante un flujo desconocido, NO: cobrar
 *  de más por un identificador que nadie declaró es el lado caro. */
export const surchargeEnabled = (config, flow) => {
    if (!FLOW_KEYS.includes(flow)) return false;
    const value = (config || DEFAULT_SURCHARGE).enabled?.[flow];
    return value !== false;
};

/**
 * Las tasas vigentes para esta moneda, con su origen.
 *
 * De lo particular a lo general —la moneda, lo general—, igual que
 * `resolveRate` en `feeRules.js`. `0` es una tasa válida y `null` es «no
 * configurado»: con `||` los dos serían lo mismo y una línea puesta a cero se
 * leería como si no existiera.
 */
export const resolveSurchargeRates = (config, { currency } = {}) => {
    const cfg = config || DEFAULT_SURCHARGE;
    const code = normalizeCurrency(currency);
    const moneda = cfg.byCurrency?.[code] || null;

    return SURCHARGE_LINES.map((line) => {
        const general = cfg.lines?.[line.key] || {};
        const propia = moneda?.[line.key] || null;
        const pick = (key) => {
            if (propia && num(propia[key]) !== null) return { value: num(propia[key]), from: 'moneda' };
            if (num(general[key]) !== null) return { value: num(general[key]), from: 'general' };
            return { value: line[key], from: 'defecto' };
        };
        const percent = pick('percent');
        const fixed = pick('fixed');
        return {
            key: line.key,
            label: line.label,
            percent: percent.value,
            fixed: fixed.value,
            currency: code,
            source: { percent: percent.from, fixed: fixed.from },
        };
    });
};

/**
 * El recargo de un cobro, desglosado.
 *
 * ⚠️ El importe base NUNCA viene del navegador: quien llama a esto es el
 * servidor, con el precio que él mismo calculó o congeló. La versión del
 * navegador (`src/lib/checkoutSurcharge.ts`) existe sólo para MOSTRAR el
 * desglose sin pagar un viaje de red por pulsación, igual que `fxRates.ts`.
 */
export const computeSurcharge = (baseAmount, { config, currency, flow } = {}) => {
    const code = normalizeCurrency(currency) || 'USD';
    const base = roundMoney(Math.max(0, num(baseAmount) ?? 0), code);
    const enabled = surchargeEnabled(config, flow);

    // Una inscripción sin costo no lleva recargo: no hay nada que procesar ni
    // que trasladar, y cobrar una comisión sobre cero sería cobrar por nada.
    if (!enabled || base <= 0) {
        return {
            enabled, flow: flow || null, currency: code,
            base, lines: [], surcharge: 0, total: base,
            percent: 0,
        };
    }

    const rates = resolveSurchargeRates(config, { currency: code });
    const lines = rates
        .map(rate => ({
            key: rate.key,
            label: rate.label,
            percent: rate.percent,
            fixed: rate.fixed,
            // Cada línea redondeada a la unidad de SU moneda: es lo que se le
            // muestra a quien paga y tiene que sumar el total exacto.
            amount: roundMoney(base * (rate.percent || 0) + (rate.fixed || 0), code),
        }))
        // Una línea en cero no se pinta: un desglose lleno de ceros informa
        // menos que uno con las dos líneas que sí cobran.
        .filter(line => line.amount > 0);

    const surcharge = roundMoney(lines.reduce((acc, l) => acc + l.amount, 0), code);
    return {
        enabled: true,
        flow: flow || null,
        currency: code,
        base,
        lines,
        surcharge,
        total: roundMoney(base + surcharge, code),
        // La tasa EFECTIVA sobre el precio, ya redondeada: es lo que hace que
        // «5 %» de la pantalla coincida con los pesos que se cobran.
        percent: base > 0 ? surcharge / base : 0,
    };
};

/** Cómo se explica el recargo en una línea de texto. Va acá y no en el JSX
 *  para que la pantalla, el correo y la descripción de Stripe lo digan igual. */
export const describeSurcharge = (quote) => {
    if (!quote?.enabled || !(quote.surcharge > 0)) return '';
    const partes = (quote.lines || []).map(l => `${l.label} ${Math.round((l.percent || 0) * 10000) / 100} %`);
    return partes.join(' + ');
};

/** El porcentaje de una línea, escrito como lo lee una persona. */
export const percentLabel = (percent) =>
    `${(Math.round((Number(percent) || 0) * 10000) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;

/**
 * ⚠️ EL DESGLOSE QUE VE QUIEN PAGA LO PINTA LA PASARELA, NO NUESTRA PANTALLA
 * (v4.981, decisión expresa del cliente). Esto parte el cobro en las líneas que
 * Stripe va a listar: la inscripción y una por cada comisión. Antes se mandaba
 * UNA sola línea con el total y una descripción que decía «Incluye …»; el
 * cliente lo pidió al revés —que la comisión aparezca en la pasarela y no en
 * la plataforma— y una descripción no es un desglose.
 *
 * ⚠️ LA SUMA DE LAS LÍNEAS ES EXACTAMENTE LO QUE SE COBRA, y por eso el resto
 * del redondeo lo absorbe la INSCRIPCIÓN, nunca una línea de comisión. Importa
 * cuando el precio se publicó en pesos y se cobra en dólares: convertir cada
 * línea por separado no tiene por qué sumar la conversión del total, y un
 * céntimo de deriva es invisible sobre el precio y visible justo sobre la
 * comisión que se está explicando. Si el reparto no cierra —o dejaría la
 * inscripción en cero o en negativo— devuelve `null` y quien llama cobra en
 * una sola línea: un refinamiento de presentación no puede mover el cobro.
 */
export const buildChargeLines = (quote, { chargedAmount, currency, baseLabel = 'Inscripción' } = {}) => {
    const code = normalizeCurrency(currency) || normalizeCurrency(quote?.currency) || 'USD';
    const total = roundMoney(num(chargedAmount) ?? 0, code);
    if (!quote?.enabled || !(quote.surcharge > 0) || !(total > 0) || !(quote.total > 0)) return null;

    // La proporción que cada línea tiene sobre el total PUBLICADO se conserva
    // al pasar a la moneda del cobro: con la misma moneda el factor es 1 y las
    // líneas viajan tal cual.
    const factor = total / quote.total;
    const lines = (quote.lines || [])
        .filter(l => l.amount > 0)
        .map(l => ({
            key: l.key,
            label: `${l.label} (${percentLabel(l.percent)})`,
            amount: roundMoney(l.amount * factor, code),
        }))
        .filter(l => l.amount > 0);
    if (!lines.length) return null;

    const base = roundMoney(total - lines.reduce((acc, l) => acc + l.amount, 0), code);
    if (!(base > 0)) return null;
    return [{ key: 'base', label: baseLabel, amount: base }, ...lines];
};

/** El desglose como pares rótulo/importe, en el orden en que se muestra. */
export const surchargeSummary = (quote, { baseLabel = 'Valor de la inscripción', totalLabel = 'Total a pagar' } = {}) => {
    if (!quote) return [];
    const rows = [{ key: 'base', label: baseLabel, amount: quote.base, kind: 'base' }];
    for (const line of quote.lines || []) {
        rows.push({ key: line.key, label: line.label, amount: line.amount, kind: 'fee', percent: line.percent });
    }
    rows.push({ key: 'total', label: totalLabel, amount: quote.total, kind: 'total' });
    return rows;
};

/**
 * Valida lo que llega del panel. El operador escribe, el CÓDIGO decide — misma
 * regla que `validateRules` con las tarifas y que `validateTemplate` con Meta.
 *
 * Un error impide guardar; un aviso no. Tratarlos igual convierte cualquier
 * observación en un bloqueo y se dejan de leer.
 */
export const validateSurchargeConfig = (input) => {
    const errors = [];
    const warnings = [];
    const out = { enabled: {}, lines: {}, byCurrency: {} };

    for (const flow of FLOW_KEYS) {
        const v = input?.enabled?.[flow];
        if (v === undefined || v === null) continue;
        out.enabled[flow] = v === true || v === 'true';
    }

    const leer = (obj, donde) => {
        const r = {};
        for (const key of ['percent', 'fixed']) {
            if (obj?.[key] === undefined || obj?.[key] === null || obj?.[key] === '') continue;
            const v = num(obj[key]);
            if (v === null) { errors.push(`${donde}: «${obj[key]}» no es un número.`); continue; }
            if (v < 0) { errors.push(`${donde}: no puede ser negativa.`); continue; }
            // «2.9» queriendo decir 2,9 % se RECHAZA en vez de interpretarse:
            // adivinar acá es cobrarle a alguien el 290 % de su inscripción.
            if (key === 'percent' && v > 1) {
                errors.push(`${donde}: el porcentaje se escribe en tanto por uno (0.029 = 2,9 %), no «${obj[key]}».`);
                continue;
            }
            r[key] = v;
        }
        return r;
    };

    for (const line of SURCHARGE_LINES) {
        const r = leer(input?.lines?.[line.key], line.label);
        if (Object.keys(r).length) out.lines[line.key] = r;
    }

    for (const [code, val] of Object.entries(input?.byCurrency || {})) {
        const cur = normalizeCurrency(code);
        if (!cur) continue;
        const dst = {};
        for (const line of SURCHARGE_LINES) {
            const r = leer(val?.[line.key], `${line.label} en ${cur}`);
            if (Object.keys(r).length) dst[line.key] = r;
        }
        if (Object.keys(dst).length) out.byCurrency[cur] = dst;
    }

    const config = mergeSurchargeConfig(out);
    const total = resolveSurchargeRates(config, { currency: 'COP' })
        .reduce((acc, r) => acc + (r.percent || 0), 0);
    if (total > 0.2) {
        warnings.push(`El recargo sumaría el ${Math.round(total * 1000) / 10} % del valor de cada inscripción.`);
    }
    if (!FLOW_KEYS.some(f => surchargeEnabled(config, f))) {
        warnings.push('El recargo está apagado en los dos flujos: nadie pagará comisión y los precios se cobran tal cual.');
    }

    return { config, errors, warnings };
};

/**
 * Mezcla lo configurado sobre lo que hay hoy. Lo que el operador NO tocó
 * conserva su valor: un guardado parcial no puede dejar el recargo a medias.
 */
export const mergeSurchargeConfig = (saved) => {
    const out = JSON.parse(JSON.stringify(DEFAULT_SURCHARGE));
    if (!saved || typeof saved !== 'object') return out;

    for (const flow of FLOW_KEYS) {
        if (typeof saved.enabled?.[flow] === 'boolean') out.enabled[flow] = saved.enabled[flow];
    }
    for (const line of SURCHARGE_LINES) {
        const s = saved.lines?.[line.key];
        if (!s) continue;
        if (num(s.percent) !== null) out.lines[line.key].percent = num(s.percent);
        if (num(s.fixed) !== null) out.lines[line.key].fixed = num(s.fixed);
    }
    for (const [code, val] of Object.entries(saved.byCurrency || {})) {
        const cur = normalizeCurrency(code);
        if (!cur || !val) continue;
        const dst = out.byCurrency[cur] || {};
        for (const line of SURCHARGE_LINES) {
            const s = val[line.key];
            if (!s) continue;
            const r = { ...(dst[line.key] || {}) };
            if (num(s.percent) !== null) r.percent = num(s.percent);
            if (num(s.fixed) !== null) r.fixed = num(s.fixed);
            if (Object.keys(r).length) dst[line.key] = r;
        }
        if (Object.keys(dst).length) out.byCurrency[cur] = dst;
    }
    return out;
};

/**
 * Lee lo guardado. NUNCA lanza: esto corre en el camino del cobro. Una
 * configuración ilegible degrada a la vigente en vez de tumbar un pago.
 */
export const parseSurchargeConfig = (raw) => {
    if (!raw) return DEFAULT_SURCHARGE;
    try {
        return mergeSurchargeConfig(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch (e) {
        console.warn(`[SURCHARGE] Configuración ilegible, se usa la vigente: ${e?.message}`);
        return DEFAULT_SURCHARGE;
    }
};

/** El importe con los decimales de su moneda, para un rótulo. */
export const formatSurcharge = (amount, currency) => {
    const meta = currencyMeta(currency);
    return `${Number(amount || 0).toLocaleString('es-CO', {
        minimumFractionDigits: 0, maximumFractionDigits: meta.decimals,
    })} ${meta.code}`;
};

export default {
    SURCHARGE_KEY, SURCHARGE_LINES, LINE_KEYS, SURCHARGE_FLOWS, FLOW_KEYS, DEFAULT_SURCHARGE,
    surchargeEnabled, resolveSurchargeRates, computeSurcharge, describeSurcharge, surchargeSummary,
    percentLabel, buildChargeLines,
    validateSurchargeConfig, mergeSurchargeConfig, parseSurchargeConfig, formatSurcharge,
};
