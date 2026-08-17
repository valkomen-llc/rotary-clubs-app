// El criterio del LIBRO MAYOR. Puro: sin base, sin red, sin IA, sin DOM.
//
// v4.847 — Fase 1 del rediseño de la Bóveda: el ledger EN SOMBRA. Las tablas
// se crean y los asientos se escriben en paralelo con lo que ya existe, y
// NADIE los lee todavía. La Bóveda sigue calculando sus saldos desde `Payment`
// y `PayoutRequest`, exactamente como hoy. La reversa es dejar de escribir: las
// tablas quedan sin consumidor y no hay nada que deshacer.
//
// Por qué en sombra y no de una vez: los saldos que esta pantalla muestra son
// dinero que un club va a pedir. Cambiar de dónde salen sin haber comprobado
// antes que el libro nuevo dice lo mismo que el viejo sería estrenar un motor
// contable sobre producción. Lo que este archivo permite es CONTRASTARLOS.
//
// ─────────────────────────────────────────────────────────────────────
// LAS CUATRO REGLAS QUE NO SE NEGOCIAN
// ─────────────────────────────────────────────────────────────────────
//
// 1. TODO EN ENTEROS, EN LA UNIDAD MÍNIMA. Ni un solo `Number` con decimales
//    entra al libro. El motivo está MEDIDO en la Fase 0: `roundMoney(8.915,
//    'USD')` devuelve 8,91 y no 8,92 —el doble más cercano a 8.915 es
//    8.9149999…—, así que el redondeo de un importe con decimales depende de
//    cómo cayó el binario. Sobre un aporte suelto es un centavo; sobre un libro
//    que se suma miles de veces es un descuadre que nadie puede explicar.
//
// 2. UN ASIENTO CUADRA POR MONEDA, NO EN TOTAL. La suma de las líneas tiene que
//    dar cero DENTRO de cada moneda. Un asiento con +10 USD y −40.000 COP no
//    «cuadra en cero» de ninguna forma útil: es la misma mezcla que producía el
//    «$47.507,75» del Distrito, escondida detrás de una invariante que parece
//    rigurosa. Una operación que cruza monedas son DOS asientos, cada uno
//    cuadrado en la suya, atados por una operación de cambio con su tasa y su
//    fuente declaradas.
//
// 3. SÓLO SE AGREGA. No hay UPDATE ni DELETE sobre una línea. Corregir es
//    escribir un asiento que REVIERTE al anterior y lo nombra. Un libro que se
//    puede editar no responde «¿qué decía esto en marzo?», que es la única
//    pregunta para la que existe un libro.
//
// 4. NADIE PAGA POR EL LIBRO. Escribir un asiento va después de acreditar el
//    cobro y en su propio `try`. Si el ledger falla, el aporte queda registrado
//    igual y se anota el fallo. Al revés —un cobro que se pierde porque no se
//    pudo escribir su asiento— sería cambiar un problema de auditoría por uno
//    de dinero.

import { normalizeCurrency, stripeDecimals } from './money.js';

// ── Cuentas ──────────────────────────────────────────────────────────
//
// El catálogo es CERRADO. Una cuenta inventada no la sabe leer ninguna
// conciliación y no se puede reportar — misma regla que las intenciones del
// CRM y que `METRIC_TYPES` en las campañas.
//
// `sign` es la naturaleza de la cuenta y sirve para leer un saldo sin tener que
// acordarse de la convención: +1 significa que un saldo positivo es lo normal
// (un activo, un gasto), −1 que lo normal es negativo (un ingreso, un pasivo).
// No cambia la aritmética; cambia cómo se PRESENTA.

export const ACCOUNTS = {
    // Lo que el proveedor nos debe y todavía no liberó. Es un activo del club.
    stripe_pendiente: {
        label: 'En tránsito en Stripe',
        sign: +1,
        scope: 'club',
        help: 'Cobrado y aún retenido por el proveedor.',
    },
    // Liberado por el proveedor y disponible para que el club lo pida.
    club_disponible: {
        label: 'Disponible para retiro',
        sign: +1,
        scope: 'club',
        help: 'Liberado por el proveedor y sin retirar.',
    },
    // Ya transferido al club.
    club_transferido: {
        label: 'Transferido al club',
        sign: +1,
        scope: 'club',
        help: 'Salió hacia la cuenta del club.',
    },
    // Lo que entró. Es un ingreso, así que su saldo natural es negativo.
    ingreso_aportes: {
        label: 'Aportes recibidos',
        sign: -1,
        scope: 'club',
        help: 'El bruto de lo que aportaron los donantes.',
    },
    // Lo que cobró el procesador de pagos. Gasto.
    gasto_procesador: {
        label: 'Tarifa de procesamiento de traslado desde interbancos',
        sign: +1,
        scope: 'club',
        help: 'Lo que retiene el procesador por mover el dinero.',
    },
    // Lo que retiene la plataforma. Gasto para el club, ingreso para nosotros;
    // la contrapartida de la plataforma no se lleva en este libro, que es el
    // libro DEL CLUB.
    gasto_plataforma: {
        label: 'Retención de la plataforma',
        sign: +1,
        scope: 'club',
        help: 'La retención de la plataforma sobre el aporte.',
    },
};

export const ACCOUNT_IDS = Object.keys(ACCOUNTS);
export const isAccount = (kind) => Object.prototype.hasOwnProperty.call(ACCOUNTS, String(kind || ''));

// ── Tipos de asiento ─────────────────────────────────────────────────
//
// También cerrado, y por el mismo motivo: la conciliación pregunta por tipo.

export const ENTRY_TYPES = {
    aporte: { label: 'Aporte recibido', help: 'Un cobro acreditado, con sus retenciones.' },
    liberacion: { label: 'Liberación del proveedor', help: 'El proveedor liberó el dinero: pasa a disponible.' },
    retiro: { label: 'Retiro solicitado', help: 'El club pidió que se le transfiera.' },
    retiro_anulado: { label: 'Retiro anulado', help: 'Un retiro que se rechazó: el dinero vuelve a disponible.' },
    reverso: { label: 'Reverso', help: 'Corrige un asiento anterior, que se nombra.' },
};

export const ENTRY_IDS = Object.keys(ENTRY_TYPES);
export const isEntryType = (kind) => Object.prototype.hasOwnProperty.call(ENTRY_TYPES, String(kind || ''));

// ── Unidad mínima ────────────────────────────────────────────────────
//
// ⚠️ La unidad del LIBRO es la unidad con que cobra el proveedor
// (`stripeDecimals`), NO la que se usa para escribir el importe en pantalla.
// Son dos nociones distintas y confundirlas acá es el error caro: el peso
// colombiano se cobra con dos decimales y se ESCRIBE sin ninguno, así que
// llevar el libro en la unidad de presentación tiraría los centavos de cada
// comisión —y la comisión de Stripe es justamente la cifra con centavos—.

/** Importe → entero en la unidad mínima. Lanza si no es un número finito: un
 *  asiento con `NaN` adentro es peor que un asiento que no se escribió. */
export const toMinor = (amount, currency) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) throw new Error(`Importe no numérico para el libro: ${amount}`);
    const factor = 10 ** stripeDecimals(currency);
    return Math.round(n * factor);
};

/** Entero de la unidad mínima → importe. El inverso exacto. */
export const fromMinor = (minor, currency) => {
    const n = Number(minor) || 0;
    const factor = 10 ** stripeDecimals(currency);
    return factor === 1 ? n : n / factor;
};

// ── Líneas y cuadre ──────────────────────────────────────────────────

/**
 * Una línea del asiento.
 *
 * `meta` es donde vive la procedencia de un importe convertido: cuánto era en
 * origen, en qué moneda, con qué tasa, de qué fuente y de qué día. Sin eso, la
 * comisión de un aporte es un número sin respuesta a «¿de dónde salió?» — que
 * es el vacío que este módulo entero viene a cerrar.
 *
 * `basis` separa lo MEDIDO de lo ESTIMADO. La comisión que devolvió el proveedor
 * es un hecho; la que calculamos con su tarifa publicada porque la consulta
 * falló es una cuenta nuestra. Presentarlas igual es lo que hace que un libro
 * deje de servir para cuadrar.
 */
export const line = ({ account, currency, minor, basis = 'real', meta = null }) => {
    if (!isAccount(account)) throw new Error(`Cuenta desconocida: ${account}`);
    const code = normalizeCurrency(currency);
    if (!code) throw new Error('Una línea sin moneda no se puede escribir');
    if (!Number.isInteger(minor)) throw new Error(`La línea de ${account} no es un entero: ${minor}`);
    if (basis !== 'real' && basis !== 'estimado') throw new Error(`Base desconocida: ${basis}`);
    return { account, currency: code, minor, basis, meta };
};

/** El descuadre de un asiento, POR MONEDA. `{}` si cuadra. */
export const imbalanceOf = (lines) => {
    const totals = {};
    for (const l of lines || []) {
        const code = normalizeCurrency(l.currency);
        totals[code] = (totals[code] || 0) + (Number(l.minor) || 0);
    }
    const off = {};
    for (const [code, sum] of Object.entries(totals)) if (sum !== 0) off[code] = sum;
    return off;
};

/** Lanza si el asiento no cuadra. Se comprueba ANTES de escribir: un asiento
 *  descuadrado guardado ya no se puede borrar —el libro sólo agrega— y habría
 *  que corregirlo con un reverso, cuando lo que había era un error de código. */
export const assertBalanced = (lines) => {
    const off = imbalanceOf(lines);
    const codes = Object.keys(off);
    if (codes.length) {
        const detalle = codes.map(c => `${c}: ${off[c]}`).join(', ');
        throw new Error(`El asiento no cuadra por moneda (${detalle})`);
    }
    return true;
};

/** Saldo por cuenta y moneda a partir de líneas sueltas.
 *  Devuelve `{ [cuenta]: { [moneda]: minor } }` — nunca un escalar, por el
 *  mismo motivo que `sumByCurrency`. */
export const balancesOf = (lines) => {
    const out = {};
    for (const l of lines || []) {
        const code = normalizeCurrency(l.currency);
        ((out[l.account] ||= {})[code] ??= 0);
        out[l.account][code] += Number(l.minor) || 0;
    }
    return out;
};

// ── Constructores de asiento ─────────────────────────────────────────
//
// Son funciones puras que devuelven el asiento COMPLETO. Escribirlo es otra
// cosa y vive en `ledger.js`: así el criterio se prueba sin base y sin red, que
// es la razón por la que `seoRules.js` vive aparte de `seoAudit.js`.

/**
 * El asiento de un APORTE.
 *
 * Cuenta la historia entera en un solo asiento, que es lo que permite leerlo
 * sin cruzar tablas:
 *
 *     en tránsito en Stripe   + neto
 *     tarifa del procesador   + comisión
 *     retención de plataforma + retención
 *     aportes recibidos       − bruto
 *                             ─────────
 *                                     0
 *
 * El neto NO se recibe: se DERIVA restando. Aceptarlo de fuera permitiría
 * escribir un asiento que cuadra porque alguien mandó el número que hacía
 * falta, y entonces el libro deja de comprobar nada.
 *
 * ⚠️ Sobre la comisión convertida: la comisión de un cobro en pesos la cobra
 * Stripe en dólares. Su línea va en PESOS —es lo que de verdad se le descontó
 * al cobro en pesos— y el importe original en dólares viaja en `meta`, con su
 * tasa y su fuente. No se escribe una línea en dólares dentro de un asiento en
 * pesos: eso sería mezclar monedas dentro de un asiento, que es la regla 2.
 */
export const buildDonationEntry = ({
    clubId, currency, grossMinor, processorFeeMinor = 0, platformFeeMinor = 0,
    processorFeeBasis = 'real', processorFeeMeta = null, platformFeeMeta = null,
    sourceRef, occurredAt, meta = null,
}) => {
    const code = normalizeCurrency(currency);
    if (!clubId) throw new Error('Un asiento de aporte necesita club');
    if (!sourceRef) throw new Error('Un asiento de aporte necesita su referencia de origen');
    if (!Number.isInteger(grossMinor) || grossMinor <= 0) {
        throw new Error(`Bruto inválido para el asiento: ${grossMinor}`);
    }
    const procesador = Number.isInteger(processorFeeMinor) ? processorFeeMinor : 0;
    const plataforma = Number.isInteger(platformFeeMinor) ? platformFeeMinor : 0;
    if (procesador < 0 || plataforma < 0) throw new Error('Una retención no puede ser negativa');

    const neto = grossMinor - procesador - plataforma;
    // Un neto negativo significa que las retenciones se comieron el aporte, y
    // eso no es un asiento raro: es un dato mal leído. Se rechaza acá, donde
    // todavía se puede, en vez de guardarlo y descubrirlo al conciliar.
    if (neto < 0) {
        throw new Error(
            `Las retenciones (${procesador + plataforma}) superan el aporte (${grossMinor}) en ${code}`
        );
    }

    const lines = [
        line({ account: 'stripe_pendiente', currency: code, minor: neto }),
        line({ account: 'ingreso_aportes', currency: code, minor: -grossMinor }),
    ];
    // Una retención en cero NO deja línea. Un libro lleno de ceros esconde las
    // líneas que sí dicen algo.
    if (procesador > 0) {
        lines.splice(1, 0, line({
            account: 'gasto_procesador', currency: code, minor: procesador,
            basis: processorFeeBasis, meta: processorFeeMeta,
        }));
    }
    if (plataforma > 0) {
        lines.splice(procesador > 0 ? 2 : 1, 0, line({
            account: 'gasto_plataforma', currency: code, minor: plataforma, meta: platformFeeMeta,
        }));
    }

    assertBalanced(lines);
    return { kind: 'aporte', clubId, currency: code, sourceType: 'payment', sourceRef, occurredAt, lines, meta };
};

/**
 * El asiento de una LIBERACIÓN: el proveedor soltó el dinero y pasa a estar
 * disponible para retiro. Mueve el neto de una cuenta a la otra, sin tocar
 * ingresos ni gastos — no entró ni salió nada, cambió de sitio.
 */
export const buildReleaseEntry = ({ clubId, currency, netMinor, sourceRef, occurredAt, meta = null }) => {
    const code = normalizeCurrency(currency);
    if (!clubId) throw new Error('Un asiento de liberación necesita club');
    if (!sourceRef) throw new Error('Un asiento de liberación necesita su referencia de origen');
    if (!Number.isInteger(netMinor) || netMinor <= 0) throw new Error(`Neto inválido: ${netMinor}`);

    const lines = [
        line({ account: 'club_disponible', currency: code, minor: netMinor }),
        line({ account: 'stripe_pendiente', currency: code, minor: -netMinor }),
    ];
    assertBalanced(lines);
    return { kind: 'liberacion', clubId, currency: code, sourceType: 'payment_release', sourceRef, occurredAt, lines, meta };
};

/** El asiento de un RETIRO: sale de disponible y pasa a transferido. */
export const buildPayoutEntry = ({ clubId, currency, amountMinor, sourceRef, occurredAt, meta = null }) => {
    const code = normalizeCurrency(currency);
    if (!clubId) throw new Error('Un asiento de retiro necesita club');
    if (!sourceRef) throw new Error('Un asiento de retiro necesita su referencia de origen');
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error(`Importe inválido: ${amountMinor}`);

    const lines = [
        line({ account: 'club_transferido', currency: code, minor: amountMinor }),
        line({ account: 'club_disponible', currency: code, minor: -amountMinor }),
    ];
    assertBalanced(lines);
    return { kind: 'retiro', clubId, currency: code, sourceType: 'payout', sourceRef, occurredAt, lines, meta };
};

/**
 * El asiento de un retiro ANULADO: el dinero vuelve a disponible.
 *
 * NO es el reverso del retiro y la diferencia importa: el retiro se pidió de
 * verdad y su asiento se queda —eso ocurrió—; encima queda el que lo anula. Un
 * reverso diría que el retiro nunca existió, y el club sí lo pidió.
 */
export const buildPayoutCancelEntry = ({ clubId, currency, amountMinor, sourceRef, occurredAt, reason }) => {
    const code = normalizeCurrency(currency);
    if (!clubId) throw new Error('Un asiento de anulación necesita club');
    if (!sourceRef) throw new Error('Un asiento de anulación necesita su referencia de origen');
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error(`Importe inválido: ${amountMinor}`);

    const lines = [
        line({ account: 'club_disponible', currency: code, minor: amountMinor }),
        line({ account: 'club_transferido', currency: code, minor: -amountMinor }),
    ];
    assertBalanced(lines);
    return {
        kind: 'retiro_anulado', clubId, currency: code,
        sourceType: 'payout_cancel', sourceRef, occurredAt,
        lines, meta: { reason: reason || null },
    };
};

/**
 * El REVERSO de un asiento: las mismas líneas con el signo cambiado.
 *
 * Es la única forma de corregir, porque el libro sólo agrega. Nombra al
 * original (`reverses`) para que la pregunta «¿por qué este asiento existe?»
 * tenga respuesta dentro del propio libro.
 *
 * Un reverso siempre cuadra si el original cuadraba: negar cada línea no puede
 * romper una suma que ya daba cero. Se comprueba igual — el original pudo
 * escribirse con otra versión del código.
 */
export const buildReversal = ({ entry, sourceRef, occurredAt, reason }) => {
    if (!entry?.lines?.length) throw new Error('No hay asiento que revertir');
    if (!reason) throw new Error('Un reverso sin motivo no se puede auditar');
    const lines = entry.lines.map(l => line({
        account: l.account, currency: l.currency, minor: -Number(l.minor),
        basis: l.basis || 'real', meta: l.meta || null,
    }));
    assertBalanced(lines);
    return {
        kind: 'reverso',
        clubId: entry.clubId,
        currency: entry.currency,
        sourceType: 'reversal',
        sourceRef: sourceRef || `reverso:${entry.sourceType}:${entry.sourceRef}`,
        occurredAt,
        reverses: entry.id || null,
        lines,
        meta: { reason, original: { sourceType: entry.sourceType, sourceRef: entry.sourceRef } },
    };
};

// ── Conciliación ─────────────────────────────────────────────────────

/**
 * Compara el saldo del libro con el que muestra hoy la Bóveda.
 *
 * Es lo que hace útil una fase en sombra: sin esta comparación, el libro nuevo
 * sería una promesa. Ambos lados llegan como mapas por moneda EN UNIDAD MÍNIMA
 * —comparar importes con decimales devolvería descuadres de un centavo que son
 * del binario, no de la contabilidad, y es exactamente la trampa que la regla 1
 * evita—.
 *
 * Una moneda presente en un solo lado NO se descarta: se reporta con el otro
 * lado en cero. Filtrarla escondería justo el caso que se busca.
 *
 * @returns { ok, byCurrency: { [moneda]: { ledger, legacy, diff } }, off: [] }
 */
export const compareBalances = (ledgerMinor, legacyMinor) => {
    const codes = new Set([
        ...Object.keys(ledgerMinor || {}),
        ...Object.keys(legacyMinor || {}),
    ].map(normalizeCurrency).filter(Boolean));

    const byCurrency = {};
    const off = [];
    for (const code of [...codes].sort()) {
        const ledger = Number(ledgerMinor?.[code]) || 0;
        const legacy = Number(legacyMinor?.[code]) || 0;
        const diff = ledger - legacy;
        byCurrency[code] = { ledger, legacy, diff };
        if (diff !== 0) off.push({ currency: code, ledger, legacy, diff });
    }
    return { ok: off.length === 0, byCurrency, off };
};

export default {
    ACCOUNTS, ACCOUNT_IDS, isAccount,
    ENTRY_TYPES, ENTRY_IDS, isEntryType,
    toMinor, fromMinor,
    line, imbalanceOf, assertBalanced, balancesOf,
    buildDonationEntry, buildReleaseEntry, buildPayoutEntry, buildPayoutCancelEntry, buildReversal,
    compareBalances,
};
