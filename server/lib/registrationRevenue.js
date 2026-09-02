// ════════════════════════════════════════════════════════════════════
// Lo que la plataforma monetiza en las inscripciones — v4.984
//
// Los aportes de «Maneras de Contribuir» y las inscripciones cobran comisión
// de dos maneras OPUESTAS, y de ahí cuelga todo lo que hay aquí:
//
//   Aportes       → la comisión se DESCUENTA del receptor. El aportante da
//                   100, la organización recibe 95, y lo retenido vive en
//                   `Payment.applicationFee`, que es lo que ya suma la Bóveda
//                   Central.
//   Inscripciones → la comisión se SUMA a quien paga (v4.980). El precio
//                   publicado es lo que la organización tiene que recibir, así
//                   que las dos líneas del recargo —pasarela y traslado
//                   interbancario— las paga de más quien se inscribe.
//
// La pregunta que este módulo contesta es la segunda: cuánto ha comisionado la
// plataforma por el traslado interbancario en la Feria de Proyectos y en el
// registro de asistentes.
//
// ⚠️ NO TODO EL RECARGO ES INGRESO, y presentarlo junto sería afirmar algo
// falso. La línea `transfer` es lo que la plataforma monetiza; la línea
// `gateway` se cobra para CUBRIR lo que se lleva el procesador y no es
// ganancia nuestra. Van separadas y rotuladas, nunca sumadas en una sola
// cifra.
//
// Es PURO: sin base, sin red, sin Prisma. La orquestación —de qué tablas sale
// cada registro— vive en `payoutController.js`, por el mismo motivo que
// `seoRules.js` vive aparte de `seoAudit.js`.
// ════════════════════════════════════════════════════════════════════

import { LINE_KEYS } from './checkoutSurcharge.js';
import { roundMoney, normalizeCurrency } from './money.js';

/**
 * Qué significa cada línea del recargo y de quién es el dinero.
 *
 * Catálogo CERRADO: una línea que no esté aquí no se puede clasificar, así que
 * no se cuenta como ingreso —se reporta como desconocida—. Al agregar una
 * línea a `SURCHARGE_LINES`, agregarla aquí: sin eso se cobraría y no se
 * sabría de quién es.
 */
export const LINE_MEANING = {
    gateway: {
        key: 'gateway',
        label: 'Comisión de la pasarela de pagos',
        /** Se cobra para cubrir lo que se lleva el procesador. No es ingreso. */
        ours: false,
        note: 'Cubre lo que cobra la pasarela; no es ingreso de la plataforma.',
    },
    transfer: {
        key: 'transfer',
        label: 'Traslado interbancario',
        /** Esto SÍ lo monetiza la plataforma. */
        ours: true,
        note: 'Lo que la plataforma comisiona por el traslado de los fondos.',
    },
};

/** Los flujos que cobran recargo, con el rótulo con el que se presentan. */
export const REVENUE_FLOWS = [
    { key: 'project_fair', label: 'Inscripción de proyectos (Feria de Proyectos)' },
    { key: 'event_registration', label: 'Registro de asistentes al evento' },
];

export const FLOW_LABELS = Object.fromEntries(REVENUE_FLOWS.map(f => [f.key, f.label]));

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * El desglose, venga como venga.
 *
 * ⚠️ LAS DOS PUNTAS LO GUARDAN DISTINTO y por eso hay UN solo lector: la Feria
 * lo escribe como objeto (`{ gateway: 11600, transfer: 8400 }`) y el registro
 * de asistentes como la cadena que viajó en la metadata de Stripe
 * (`"gateway:11600,transfer:8400"`). Con un lector por punta, el día que se
 * agregue una línea una de las dos se queda sin ella y el fallo es MUDO: el
 * total sigue cuadrando y la línea nueva no aparece.
 *
 * @returns {Record<string, number>} sólo las claves con valor numérico.
 */
export const parseSurchargeLines = (raw) => {
    if (!raw) return {};
    const out = {};
    if (typeof raw === 'string') {
        for (const par of raw.split(',')) {
            const [k, v] = par.split(':');
            const key = String(k || '').trim();
            if (!key) continue;
            const n = Number(v);
            if (Number.isFinite(n)) out[key] = n;
        }
        return out;
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw)) {
            const n = Number(v);
            if (Number.isFinite(n)) out[String(k)] = n;
        }
    }
    return out;
};

/**
 * Lo que un cobro dejó, separado por quién se queda con cada parte.
 *
 * `total` es lo que se le sumó a quien pagó; `ours` lo que la plataforma
 * monetiza; `passthrough` lo que cubre al procesador. Una línea que el
 * catálogo no reconoce va a `unknown` y NO se cuenta como ingreso: ante la
 * duda, no es nuestro.
 */
export const revenueOfRecord = ({ currency, surchargeAmount = null, lines = null } = {}) => {
    const code = normalizeCurrency(currency);
    const desglose = parseSurchargeLines(lines);
    const claves = Object.keys(desglose);

    // Sin desglose no se reparte nada, aunque se sepa el total: atribuirle el
    // 2,1 % con la tarifa de HOY sería inventar el dato que se vino a medir —
    // la tarifa es configurable y pudo ser otra el día del cobro. El total sí
    // se conserva, marcado, porque es una medida.
    if (!claves.length) {
        const total = num(surchargeAmount);
        return {
            currency: code,
            hasBreakdown: false,
            total: roundMoney(total, code),
            ours: 0,
            passthrough: 0,
            unknown: 0,
            byLine: {},
        };
    }

    let ours = 0;
    let passthrough = 0;
    let unknown = 0;
    const byLine = {};
    for (const [key, valor] of claves.map(k => [k, num(desglose[k])])) {
        byLine[key] = roundMoney(valor, code);
        const meaning = LINE_MEANING[key];
        if (!meaning) unknown += valor;
        else if (meaning.ours) ours += valor;
        else passthrough += valor;
    }

    // El total del desglose manda sobre el declarado: es la suma de lo que de
    // verdad se cobró línea por línea.
    const total = claves.reduce((a, k) => a + num(desglose[k]), 0);
    return {
        currency: code,
        hasBreakdown: true,
        total: roundMoney(total, code),
        ours: roundMoney(ours, code),
        passthrough: roundMoney(passthrough, code),
        unknown: roundMoney(unknown, code),
        byLine,
    };
};

/**
 * Agrega los cobros por MONEDA, nunca entre ellas.
 *
 * Es la regla del módulo financiero desde v4.841 y aquí pesa igual: los pesos
 * comisionados no son dólares. Cada moneda es una fila y no existe un total
 * general.
 */
export const aggregateRevenue = (records = []) => {
    const porMoneda = new Map();
    const porFlujo = new Map();

    const acumular = (mapa, clave, r, code) => {
        const actual = mapa.get(clave) || {
            currency: code, cobros: 0, conDesglose: 0, sinDesglose: 0,
            total: 0, ours: 0, passthrough: 0, unknown: 0, byLine: {},
        };
        actual.cobros += 1;
        if (r.hasBreakdown) actual.conDesglose += 1; else actual.sinDesglose += 1;
        actual.total += r.total;
        actual.ours += r.ours;
        actual.passthrough += r.passthrough;
        actual.unknown += r.unknown;
        for (const [k, v] of Object.entries(r.byLine)) {
            actual.byLine[k] = (actual.byLine[k] || 0) + v;
        }
        mapa.set(clave, actual);
        return actual;
    };

    for (const rec of records) {
        const r = revenueOfRecord(rec);
        if (!r.currency) continue;
        acumular(porMoneda, r.currency, r, r.currency);
        const flujo = FLOW_LABELS[rec?.flow] ? rec.flow : 'otro';
        acumular(porFlujo, `${flujo}|${r.currency}`, r, r.currency).flow = flujo;
    }

    // El redondeo se hace UNA vez al final, no por cobro: acumular redondeos
    // corre el total en los céntimos, y aquí se acumulan tantos como cobros
    // haya (regla de `consolidar` en la Bóveda Central).
    const cerrar = (fila) => ({
        ...fila,
        total: roundMoney(fila.total, fila.currency),
        ours: roundMoney(fila.ours, fila.currency),
        passthrough: roundMoney(fila.passthrough, fila.currency),
        unknown: roundMoney(fila.unknown, fila.currency),
        byLine: Object.fromEntries(
            Object.entries(fila.byLine).map(([k, v]) => [k, roundMoney(v, fila.currency)])),
    });

    const monedas = [...porMoneda.values()].map(cerrar)
        .sort((a, b) => a.currency.localeCompare(b.currency));
    const flujos = [...porFlujo.values()].map(cerrar)
        .sort((a, b) => (a.flow || '').localeCompare(b.flow || '') || a.currency.localeCompare(b.currency));

    return { monedas, flujos };
};

/**
 * Las líneas cobradas que el catálogo no reconoce.
 *
 * Se DICEN en vez de descartarse: una línea que se cobra y que nadie sabe de
 * quién es, es exactamente el dato que hay que ver.
 */
export const unknownLines = (records = []) => {
    const vistas = new Set();
    for (const rec of records) {
        for (const key of Object.keys(parseSurchargeLines(rec?.lines))) {
            if (!LINE_MEANING[key]) vistas.add(key);
        }
    }
    return [...vistas].sort();
};

/** Las líneas declaradas del recargo que este módulo todavía no clasifica. */
export const unclassifiedLineKeys = () => LINE_KEYS.filter(k => !LINE_MEANING[k]);

export default {
    LINE_MEANING, REVENUE_FLOWS, FLOW_LABELS,
    parseSurchargeLines, revenueOfRecord, aggregateRevenue,
    unknownLines, unclassifiedLineKeys,
};
