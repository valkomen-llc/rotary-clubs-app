// RECALCULAR LA RETENCIÓN DE UN APORTE YA REGISTRADO. Puro.
//
// v4.861 — Corrección deliberada, no un efecto secundario.
//
// ═════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO EXISTE, HABIENDO PROHIBIDO EXACTAMENTE ESTO
// ═════════════════════════════════════════════════════════════════════
//
// v4.854 quitó el recálculo de `syncPaymentsWithStripe` con este argumento, que
// sigue siendo cierto: sincronizar un aporte de marzo NO puede aplicarle la
// tarifa de abril. Un cálculo que se dispara solo, como parte de otra
// operación, reescribe la contabilidad sin que nadie lo decida.
//
// Corregir A PROPÓSITO es otra cosa, y es lo que pide la especificación del
// rediseño: «los movimientos financieros confirmados no deben editarse
// directamente; si se necesita corregir, crear un adjustment entry». Lo que
// distingue una corrección de una reescritura son tres cosas, y las tres están
// acá:
//
//   1. La pide una persona, explícitamente, y de ENSAYO por defecto.
//   2. Queda REGISTRADA: de cuánto a cuánto, con qué regla, quién y cuándo.
//   3. Tiene un LÍMITE que se puede demostrar: sólo alcanza el dinero que el
//      club todavía no puede retirar.
//
// ═════════════════════════════════════════════════════════════════════
// EL LÍMITE, Y POR QUÉ ES ÉSE
// ═════════════════════════════════════════════════════════════════════
//
// No hay vínculo por fila entre un `Payment` y el retiro que se lo llevó:
// `PayoutRequest` es por club y por importe. Así que «¿este aporte ya se
// retiró?» no se puede contestar directamente. Lo que SÍ se puede demostrar es
// lo contrario: si el dinero todavía no está disponible para retiro
// (`clubAvailableOn` en el futuro), NO PUEDE haber salido en ningún retiro.
//
// Ése es el límite: se corrige lo que es imposible que se haya pagado. Todo lo
// demás se rechaza CON SU MOTIVO — cambiar el registro de un dinero que ya se
// giró dejaría los libros diciendo algo distinto de lo que de verdad pasó.

import { normalizeCurrency, roundMoney } from './money.js';
import { platformFee, resolveRate, describeRate } from './feeRules.js';

/** Motivos por los que un aporte no se recalcula. Catálogo CERRADO: un descarte
 *  sin motivo obliga a adivinar, y acá lo que se está mirando es dinero. */
export const MOTIVOS = {
    ya_retirable: 'El dinero ya está disponible para retiro; puede haber salido en un giro.',
    sin_fecha: 'No tiene fecha de disponibilidad, así que no se puede demostrar que siga retenido.',
    no_cobrado: 'El cobro no está acreditado.',
    sin_importe: 'No tiene importe registrado.',
    sin_cambio: 'La retención ya coincide con la tarifa vigente.',
    ajena: 'No la recauda la plataforma, así que no hay retención nuestra que corregir.',
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * ¿Se puede corregir este aporte, y a cuánto?
 *
 * Devuelve siempre un objeto con `puede`; cuando no, con su `motivo`. Nunca
 * lanza y nunca decide en silencio.
 */
export const planPayment = (p, { rules, ahora = new Date() } = {}) => {
    const id = p?.id;
    const currency = normalizeCurrency(p?.currency);
    const base = { id, currency, clubId: p?.clubId || null, createdAt: p?.createdAt || null };

    if (p?.isPlatformCollection === false) return { ...base, puede: false, motivo: 'ajena' };
    if (p?.status && p.status !== 'succeeded') return { ...base, puede: false, motivo: 'no_cobrado' };

    const bruto = num(p?.amount);
    if (bruto === null || bruto <= 0) return { ...base, puede: false, motivo: 'sin_importe' };

    // ⚠️ EL LÍMITE. Sin fecha no se puede demostrar que el dinero siga acá, y
    // ante la duda NO se toca: es la diferencia entre corregir un registro y
    // falsear uno.
    const disponibleEl = p?.clubAvailableOn ? new Date(p.clubAvailableOn) : null;
    if (!disponibleEl || Number.isNaN(disponibleEl.getTime())) {
        return { ...base, puede: false, motivo: 'sin_fecha' };
    }
    if (disponibleEl.getTime() <= new Date(ahora).getTime()) {
        return { ...base, puede: false, motivo: 'ya_retirable', disponibleEl };
    }

    const plataformaAntes = num(p?.applicationFee) ?? 0;
    const netoAntes = num(p?.netAmount) ?? 0;

    // ⚠️ LA COMISIÓN DEL PROCESADOR SE CONSERVA INTACTA, y es el punto que hace
    // correcta la cuenta. No es nuestra y muchas veces está MEDIDA contra el
    // balance transaction de Stripe: recalcularla sería inventar. Se deduce de
    // lo que ya está guardado —es lo mismo que hace `movementOf` para pintarla—
    // y se vuelve a restar tal cual.
    const procesador = roundMoney(Math.max(0, bruto - netoAntes - plataformaAntes), currency);

    const plataformaAhora = platformFee(bruto, { rules, currency, clubId: p?.clubId });
    if (plataformaAhora === plataformaAntes) {
        return { ...base, puede: false, motivo: 'sin_cambio', plataformaAntes };
    }

    // El neto se DERIVA, como en todo el módulo: nunca se recibe de fuera.
    const netoAhora = roundMoney(Math.max(0, bruto - procesador - plataformaAhora), currency);
    const tarifa = resolveRate(rules, { scope: 'platform', currency, clubId: p?.clubId });

    return {
        ...base,
        puede: true,
        bruto,
        procesador,
        plataformaAntes,
        plataformaAhora,
        netoAntes,
        netoAhora,
        // Lo que cambia de bolsillo: lo que la plataforma deja de retener es lo
        // que le queda al club.
        diferencia: roundMoney(plataformaAntes - plataformaAhora, currency),
        tarifa: describeRate(tarifa),
        disponibleEl,
    };
};

/**
 * El plan de una tanda.
 *
 * ⚠️ Lo que NO se puede corregir es la mitad del resultado y se devuelve
 * agrupado por motivo: una lista de doscientas filas no la lee nadie, y sin los
 * motivos «no pasó nada» es indistinguible de «no se pudo».
 */
export const planRecalc = (payments, { rules, ahora = new Date() } = {}) => {
    const aplicables = [];
    const descartados = [];
    for (const p of payments || []) {
        const plan = planPayment(p, { rules, ahora });
        (plan.puede ? aplicables : descartados).push(plan);
    }

    // Los totales, POR MONEDA. Nunca una cifra que sume COP con USD — la regla
    // del módulo desde v4.841.
    const porMoneda = {};
    for (const a of aplicables) {
        const m = porMoneda[a.currency] || (porMoneda[a.currency] = {
            currency: a.currency, aportes: 0, bruto: 0,
            plataformaAntes: 0, plataformaAhora: 0, netoAntes: 0, netoAhora: 0,
        });
        m.aportes++;
        m.bruto += a.bruto;
        m.plataformaAntes += a.plataformaAntes;
        m.plataformaAhora += a.plataformaAhora;
        m.netoAntes += a.netoAntes;
        m.netoAhora += a.netoAhora;
    }
    for (const code of Object.keys(porMoneda)) {
        for (const k of ['bruto', 'plataformaAntes', 'plataformaAhora', 'netoAntes', 'netoAhora']) {
            porMoneda[code][k] = roundMoney(porMoneda[code][k], code);
        }
        porMoneda[code].diferencia = roundMoney(
            porMoneda[code].plataformaAntes - porMoneda[code].plataformaAhora, code
        );
    }

    const motivos = {};
    for (const d of descartados) {
        const m = motivos[d.motivo] || (motivos[d.motivo] = { motivo: d.motivo, texto: MOTIVOS[d.motivo] || d.motivo, cuantos: 0, ejemplos: [] });
        m.cuantos++;
        if (m.ejemplos.length < 3) m.ejemplos.push(d.id);
    }

    return {
        aplicables,
        porMoneda,
        descartados: Object.values(motivos),
        totalMirados: (payments || []).length,
    };
};

/**
 * La traza de la corrección, para guardar junto al aporte.
 *
 * Sin esto, dentro de seis meses «¿por qué este aporte retiene el 2,1 % y aquél
 * el 5 %?» no tiene dónde mirarse — el mismo vacío que el CRM tenía antes de
 * `CrmWebhookEvent`. Es una LISTA: una segunda corrección no borra la primera.
 */
export const registroDeCorreccion = (plan, { por, cuando = new Date(), motivo } = {}) => ({
    at: new Date(cuando).toISOString(),
    by: por || 'operador',
    rule: plan.tarifa,
    platformFrom: plan.plataformaAntes,
    platformTo: plan.plataformaAhora,
    netFrom: plan.netoAntes,
    netTo: plan.netoAhora,
    currency: plan.currency,
    reason: motivo || 'la tarifa de la plataforma cambió',
});

export default { MOTIVOS, planPayment, planRecalc, registroDeCorreccion };
