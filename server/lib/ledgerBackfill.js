// Cargar el HISTORIAL en el libro mayor. El criterio; puro.
//
// v4.848 — Fase 2, primer paso. El libro se estrenó en sombra con las tablas
// vacías, así que sólo tiene los hechos posteriores a v4.847 y el informe de
// conciliación dice «difiere» por definición. Esto lo llena hacia atrás con lo
// que la plataforma YA registró, para que ese informe pueda llegar a cuadrar.
// Sólo cuando cuadre se cambia la fuente de los saldos de la Bóveda — ése es
// el segundo paso, y no se da hasta entonces.
//
// ─────────────────────────────────────────────────────────────────────
// LA REGLA DE LA QUE CUELGA TODO: SE REPRODUCE, NO SE CORRIGE
// ─────────────────────────────────────────────────────────────────────
//
// La comisión que se asienta NO se recalcula: se DERIVA restando, de modo que
// el neto del libro sea exactamente el `netAmount` que la plataforma tiene
// guardado. Suena al revés y es lo único que funciona.
//
// Varios aportes anteriores a v4.845 tienen el neto mal calculado —se les
// restó una comisión en dólares como si fueran pesos—. La tentación es
// arreglarlos al cargarlos. Si se hace, el libro deja de reproducir a la Bóveda
// y el informe de conciliación pasa a mezclar dos cosas: lo que falta por
// cargar y lo que decidimos corregir. Entonces ya no se puede saber si un
// descuadre es un fallo de la carga o una corrección deliberada, y el informe
// —que es el único instrumento que tenemos para autorizar el cambio de
// fuente— deja de servir.
//
// Un neto mal calculado se corrige DESPUÉS, con un asiento de reverso que lo
// dice. Es exactamente para lo que existe un libro que sólo agrega.

import { normalizeCurrency } from './money.js';
import { toMinor, buildDonationEntry, buildReleaseEntry, buildPayoutEntry } from './ledgerSpec.js';
import { parsePayload } from './paymentTrace.js';

/** Los estados de retiro que la Bóveda CUENTA. Tiene que ser la misma lista que
 *  usa `computeBalances`, o el libro y la Bóveda contarían retiros distintos. */
export const PAYOUT_COUNTED = ['pending', 'processing', 'completed'];

/** La referencia con la que se asienta un pago. Es la MISMA que usa el webhook
 *  en vivo, y eso es lo que impide que un pago se asiente dos veces: si la
 *  carga alcanza a uno que el webhook ya asentó, el índice único lo rechaza.
 *  Sin `providerRef` se usa el id con prefijo, para no chocar por casualidad
 *  con el `providerRef` de otro pago. */
export const refOf = (payment) =>
    payment?.providerRef ? String(payment.providerRef) : `id:${payment?.id}`;

/**
 * Qué asientos le tocan a un pago histórico — o por qué no se le puede asentar
 * ninguno.
 *
 * @returns { ok: true, entries: [...] } | { ok: false, reason, detail }
 */
export const planPayment = (payment, now = new Date()) => {
    if (!payment?.clubId) return { ok: false, reason: 'sin_club', detail: 'el pago no dice de qué sitio es' };

    const currency = normalizeCurrency(payment.currency);
    if (!currency) return { ok: false, reason: 'sin_moneda', detail: 'el pago no dice en qué moneda fue' };

    const bruto = Number(payment.amount);
    if (!Number.isFinite(bruto) || bruto <= 0) {
        return { ok: false, reason: 'sin_importe', detail: `importe ilegible: ${payment.amount}` };
    }

    // Un pago SIN neto registrado no se asienta, y no es una omisión: la Bóveda
    // lo cuenta como cero —`Number(null) || 0`—, así que dejarlo fuera hace que
    // los dos libros coincidan. Asentarlo con neto cero diría que el procesador
    // se quedó con todo el aporte, que es falso.
    if (payment.netAmount === null || payment.netAmount === undefined) {
        return { ok: false, reason: 'sin_neto', detail: 'la Bóveda lo cuenta como cero; asentarlo diría que el procesador se quedó con todo' };
    }

    const neto = Number(payment.netAmount);
    const plataforma = Number(payment.applicationFee) || 0;
    if (!Number.isFinite(neto)) {
        return { ok: false, reason: 'sin_neto', detail: `neto ilegible: ${payment.netAmount}` };
    }

    // Se DERIVA para que el neto del libro sea el neto registrado. Ver la nota
    // de arriba: reproducir, no corregir.
    const procesadorMinor = toMinor(bruto, currency) - toMinor(plataforma, currency) - toMinor(neto, currency);
    if (procesadorMinor < 0) {
        return {
            ok: false, reason: 'neto_mayor_que_bruto',
            detail: `el neto (${neto}) más la retención (${plataforma}) superan el aporte (${bruto})`,
        };
    }

    const payload = parsePayload(payment.rawPayload);
    // La comisión sólo es un dato MEDIDO si se leyó de Stripe y —cuando hubo
    // conversión— con una tasa declarada. En todo lo demás es una cuenta
    // nuestra, y se marca como tal: presentarlas igual es lo que hace que un
    // libro deje de servir para cuadrar.
    const medida = payload.stripeFeeRate != null || payload.stripeFeeConverted === false;

    const entries = [buildDonationEntry({
        clubId: payment.clubId,
        currency,
        grossMinor: toMinor(bruto, currency),
        processorFeeMinor: procesadorMinor,
        platformFeeMinor: toMinor(plataforma, currency),
        processorFeeBasis: medida ? 'real' : 'estimado',
        processorFeeMeta: {
            // ⚠️ La comisión se dedujo restando; no es la cifra que devolvió el
            // proveedor. Decirlo es lo que impide leer un asiento reconstruido
            // como si fuera una observación.
            derivada: true,
            original: payload.stripeFeeOriginal || null,
            rate: payload.stripeFeeRate ?? null,
            rateSource: payload.stripeFeeRateSource || null,
            rateDate: payload.stripeFeeRateDate || null,
            rateOfficial: !!payload.stripeFeeRateOfficial,
        },
        sourceRef: refOf(payment),
        occurredAt: payment.createdAt || null,
        meta: {
            reconstruido: true,
            desde: 'Payment',
            paymentId: payment.id,
            stripeBalanceTxId: payment.stripeBalanceTxId || null,
        },
    })];

    // La liberación, sólo si el club YA lo puede pedir. Mismo criterio que el
    // sync en vivo: entre que Stripe suelta y que la Bóveda deja retirar hay un
    // período de retención, y asentar antes pondría en «disponible» un dinero
    // que la pantalla no deja pedir.
    const liberado = payment.clubAvailableOn && new Date(payment.clubAvailableOn) <= now;
    const netoMinor = toMinor(neto, currency);
    if (liberado && netoMinor > 0) {
        entries.push(buildReleaseEntry({
            clubId: payment.clubId,
            currency,
            netMinor: netoMinor,
            sourceRef: String(payment.id),
            occurredAt: payment.clubAvailableOn,
            meta: { reconstruido: true, desde: 'Payment' },
        }));
    }

    return { ok: true, entries };
};

/**
 * Qué asiento le toca a un retiro histórico.
 *
 * Los RECHAZADOS no se asientan, y tampoco es una omisión: la Bóveda tampoco
 * los cuenta, así que dejarlos fuera hace coincidir a los dos. Asentarlos
 * completos —el retiro y su anulación— exigiría inventar cuándo se pidió y
 * cuándo se rechazó, y ninguna de las dos fechas está guardada.
 */
export const planPayout = (payout, monedasConAportes = null) => {
    if (!payout?.clubId) return { ok: false, reason: 'sin_club', detail: 'el retiro no dice de qué sitio es' };

    const estado = String(payout.status || '').toLowerCase();
    if (!PAYOUT_COUNTED.includes(estado)) {
        return { ok: false, reason: 'no_contado', detail: `estado «${estado}»: la Bóveda tampoco lo cuenta` };
    }

    const currency = normalizeCurrency(payout.currency);
    if (!currency) return { ok: false, reason: 'sin_moneda', detail: 'el retiro no dice en qué moneda fue' };

    const importe = Number(payout.amount);
    if (!Number.isFinite(importe) || importe <= 0) {
        return { ok: false, reason: 'sin_importe', detail: `importe ilegible: ${payout.amount}` };
    }

    // ⚠️ Hasta v4.840 la moneda del retiro NO se escribía nunca, así que toda
    // fila vieja quedó en USD por el valor por omisión de la columna, dijera lo
    // que dijera el cobro que la originó. Un retiro en una moneda en la que el
    // club nunca recibió nada se REPORTA en vez de asentarse: la alternativa
    // sería adivinar cuál era, y adivinar la moneda de un retiro es adivinar
    // cuánto dinero salió.
    if (monedasConAportes && !monedasConAportes.includes(currency)) {
        return {
            ok: false, reason: 'moneda_sin_aportes',
            detail: `el sitio nunca recibió aportes en ${currency}; su moneda real no está guardada y no se adivina`,
        };
    }

    return {
        ok: true,
        entries: [buildPayoutEntry({
            clubId: payout.clubId,
            currency,
            amountMinor: toMinor(importe, currency),
            sourceRef: String(payout.id),
            occurredAt: payout.createdAt || null,
            meta: { reconstruido: true, desde: 'PayoutRequest', estado },
        })],
    };
};

/**
 * El plan completo. PURO: recibe las filas ya leídas y devuelve qué se
 * asentaría y qué no, con el motivo.
 *
 * Lo que no se puede asentar NO se descarta en silencio. En un módulo de dinero
 * un descarte mudo es la peor forma de fallar: la conciliación diría «difiere»
 * sin decir por qué, y quien mire el informe no tendría dónde buscar.
 */
export const planBackfill = ({ payments = [], payouts = [], now = new Date() }) => {
    const monedasConAportes = [...new Set(
        payments.map(p => normalizeCurrency(p.currency)).filter(Boolean)
    )];

    const asentar = [];
    const omitidos = [];

    for (const p of payments) {
        const plan = planPayment(p, now);
        if (plan.ok) asentar.push(...plan.entries);
        else omitidos.push({ tipo: 'aporte', id: p.id, motivo: plan.reason, detalle: plan.detail, importe: p.amount, moneda: p.currency });
    }

    for (const p of payouts) {
        const plan = planPayout(p, monedasConAportes);
        if (plan.ok) asentar.push(...plan.entries);
        else omitidos.push({ tipo: 'retiro', id: p.id, motivo: plan.reason, detalle: plan.detail, importe: p.amount, moneda: p.currency });
    }

    return { asentar, omitidos, monedasConAportes };
};

/** Un resumen de los omitidos por motivo, para el informe. Un listado de
 *  doscientas filas no lo lee nadie; «12 sin neto» sí se lee. */
export const summarizeSkipped = (omitidos) => {
    const porMotivo = {};
    for (const o of omitidos || []) {
        (porMotivo[o.motivo] ||= { motivo: o.motivo, cuantos: 0, detalle: o.detalle, ejemplos: [] });
        porMotivo[o.motivo].cuantos++;
        if (porMotivo[o.motivo].ejemplos.length < 3) porMotivo[o.motivo].ejemplos.push(o.id);
    }
    return Object.values(porMotivo).sort((a, b) => b.cuantos - a.cuantos);
};

export default { PAYOUT_COUNTED, refOf, planPayment, planPayout, planBackfill, summarizeSkipped };
