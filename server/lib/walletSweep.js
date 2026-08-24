// EL BARRIDO de la Bóveda: pone al día el estado del dinero sin que nadie abra
// la plataforma.
//
// v4.885 — Es la mitad que faltaba. Hasta ahora el único proceso que consultaba
// a Stripe por un aporte ya registrado era el botón «Sincronizar con Stripe»,
// que es MANUAL: si nadie entraba a la Bóveda, la columna `stripeStatus` se
// quedaba en «pending» para siempre y con ella el aporte se quedaba «En
// tránsito» aunque hubieran pasado seis días o seis meses.
//
// ═════════════════════════════════════════════════════════════════════
// POR QUÉ ES UN CRON Y NO UNA COLA CON TRABAJADOR.
// ═════════════════════════════════════════════════════════════════════
//
// En Vercel la función se CONGELA al cerrar la respuesta, así que un proceso
// persistente no existe: una cola con trabajador clásico exigiría
// infraestructura aparte. Es la misma decisión que el Creador de Reels
// (v4.670) y la Distribución multi-destino (v4.864), y por el mismo motivo.
//
// Hay TRES vías que llaman al mismo `sweepWallet`: el cron cada quince minutos
// (siempre), el botón de sincronizar (el más rápido cuando alguien mira) y la
// reconciliación histórica. No quitar el cron: sin él, un aporte se queda
// parado en cuanto el administrador cierra la pestaña, que es exactamente el
// defecto que esto viene a corregir.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ LA IDEMPOTENCIA NO ES UN CANDADO: ES LA FORMA DE LA CONSULTA.
// ═════════════════════════════════════════════════════════════════════
//
// Los candidatos se eligen por CRITERIO —«a este pago le falta la fecha de
// Stripe» o «su columna dice pending y la fecha ya pasó»—, no por «a éste no lo
// he mirado». Así, un pago corregido DEJA DE SER CANDIDATO SOLO, y correr el
// barrido diez veces seguidas hace trabajo la primera vez y ninguno las otras
// nueve. Es el mismo patrón que estrenó v4.846 con `stripeFeeRate`.
//
// Y no hay dinero que duplicar: este barrido **no crea ni un movimiento**.
// Escribe fechas que vienen de Stripe —el mismo valor cada vez— y anota
// eventos cuya repetición rechaza un índice único. El único asiento que dispara
// es el de liberación en el libro mayor, y ése lo protege el índice único de
// `LedgerTransaction`. Al agregar acá un paso que gaste dinero, preguntarse
// quién más puede llegar a la vez.

import Stripe from 'stripe';
import db from './db.js';
import { normalizeCurrency } from './money.js';
import { trmForDate } from './trm.js';
import { fromStripeAmount } from './money.js';
import { stripeFeeInChargeCurrency } from './paymentTrace.js';
import { postRelease } from './ledger.js';
import { recordEvent } from './paymentLifecycle.js';
import { bucketOf, planFor, scheduleOf, PLATFORM_HOLDING_DAYS, stateLabel } from './walletLifecycle.js';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cuánto hacia atrás se barre.
 *
 * Un aporte sin resolver de hace cuatro meses no es un cobro lento: es uno
 * roto, y seguir gastando una llamada a Stripe por él en cada vuelta deja sin
 * atender a los vivos. Es el presupuesto con ventana del Creador de Reels
 * (v4.670), con un plazo mucho más largo porque acá lo que espera es dinero.
 * Lo que queda fuera NO se pierde: la reconciliación histórica lo alcanza
 * cuando se la pide a mano, y el barrido lo DICE.
 */
const VENTANA_DIAS = 120;

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');

const parsePayload = (raw) => {
    if (!raw) return {};
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
};

/* ─── QUIÉNES ENTRAN AL BARRIDO ──────────────────────────────────────
 *
 * Dos poblaciones distintas y NO se mezclan, porque cuestan cosas distintas:
 *
 *   · Los que necesitan a STRIPE — les falta la fecha o su columna se quedó
 *     atrás. Cuestan una llamada de red cada uno, así que van acotados.
 *
 *   · Los que sólo necesitan que ALGUIEN MIRE EL CALENDARIO — su fecha venció
 *     y su estado anotado se quedó viejo. No cuestan nada de red.
 *
 * Tratarlos igual haría que el presupuesto de tiempo se lo comieran los
 * segundos, que son los baratos.
 */
export const findStripeCandidates = async ({ clubId = null, limit = 40, ventanaDias = VENTANA_DIAS } = {}) => {
    const desde = new Date(Date.now() - ventanaDias * DIA_MS);
    const cond = [
        `p.status = 'succeeded'`,
        `p."isPlatformCollection" = true`,
        `p.provider = 'stripe'`,
        `p."providerRef" IS NOT NULL`,
        `p."createdAt" >= $1`,
        // Las DOS formas de estar desactualizado. La segunda es el defecto
        // reportado: la fecha ya pasó y la columna sigue diciendo «pending».
        `(p."availableOn" IS NULL OR (p."stripeStatus" = 'pending' AND p."availableOn" <= NOW()))`,
    ];
    const args = [desde];
    if (clubId) { args.push(clubId); cond.push(`p."clubId" = $${args.length}`); }
    args.push(limit);

    const { rows } = await db.query(
        `SELECT p.id, p."clubId", p."providerRef", p.amount, p.currency,
                p."applicationFee", p."netAmount", p."stripeBalanceTxId",
                p."stripeStatus", p."availableOn", p."clubAvailableOn",
                p."rawPayload", p."createdAt", p.status
           FROM "Payment" p
          WHERE ${cond.join(' AND ')}
          ORDER BY p."createdAt" ASC
          LIMIT $${args.length}`,
        args
    );
    return rows;
};

/** Los que sólo hay que mirar contra el calendario. Baratos: sin red. */
export const findCalendarCandidates = async ({ clubId = null, limit = 300, ventanaDias = VENTANA_DIAS } = {}) => {
    const desde = new Date(Date.now() - ventanaDias * DIA_MS);
    const cond = [
        `p.status = 'succeeded'`,
        `p."isPlatformCollection" = true`,
        `p."createdAt" >= $1`,
    ];
    const args = [desde];
    if (clubId) { args.push(clubId); cond.push(`p."clubId" = $${args.length}`); }
    args.push(limit);

    const { rows } = await db.query(
        `SELECT p.id, p."clubId", p.amount, p.currency, p."netAmount",
                p."stripeStatus", p."availableOn", p."clubAvailableOn",
                p."createdAt", p.status
           FROM "Payment" p
          WHERE ${cond.join(' AND ')}
          ORDER BY p."createdAt" DESC
          LIMIT $${args.length}`,
        args
    );
    return rows;
};

/* ─── PREGUNTARLE A STRIPE POR UN APORTE ─────────────────────────────
 *
 * ⚠️ EL ERROR DE STRIPE SE PROPAGA TEXTUAL. Convertirlo en «no se pudo
 * sincronizar» deja a quien corrige sin saber si el problema es la credencial,
 * un cobro que ya no existe o una cuenta sin permisos. Es la regla que el CRM
 * dejó escrita con `metaCode` y la Distribución con la clase del error.
 */
export const reconcileOne = async (payment, { stripe = null, now = new Date() } = {}) => {
    const api = stripe || getStripe();
    const antes = bucketOf(payment, now);

    try {
        let piId = payment.providerRef;
        if (String(piId).startsWith('cs_')) {
            const sesion = await api.checkout.sessions.retrieve(piId);
            piId = sesion?.payment_intent;
            if (!piId) return { ok: false, id: payment.id, reason: 'sesion_sin_payment_intent' };
        }

        const pi = await api.paymentIntents.retrieve(piId, {
            expand: ['latest_charge.balance_transaction'],
        });
        const charge = pi?.latest_charge;
        const bt = charge?.balance_transaction;

        if (!bt) {
            // No es un fallo: la balance transaction todavía no existe. Se dice
            // así y el pago sigue siendo candidato para la vuelta siguiente.
            return { ok: true, id: payment.id, cambio: false, reason: 'sin_balance_transaction' };
        }

        const availableOn = bt.available_on ? new Date(bt.available_on * 1000) : null;
        const clubAvailableOn = availableOn
            ? new Date(availableOn.getTime() + PLATFORM_HOLDING_DAYS * DIA_MS)
            : null;
        const stripeStatus = bt.status || 'pending';

        // ⚠️ LA COMISIÓN SÓLO SE ESCRIBE SI FALTA, Y EL NETO NUNCA SE
        // RECALCULA CON LA TARIFA DE HOY.
        //
        // Es la regla de v4.854: sincronizar un aporte de marzo no puede
        // aplicarle la retención de agosto, porque eso es reescribir la
        // historia financiera de un cobro que ya ocurrió. Este barrido corre
        // solo y cada quince minutos, así que aquí el riesgo es mayor que en el
        // botón: un recálculo silencioso movería el neto de todos los aportes
        // vivos sin que nadie lo pidiera.
        //
        // Lo que sí se completa es la comisión del PROCESADOR cuando nunca se
        // pudo leer —el pago se registró con la estimación— porque ahí no se
        // está corrigiendo una decisión nuestra sino rellenando un dato que
        // Stripe no había dado todavía.
        const payload = parsePayload(payment.rawPayload);
        const campos = {
            stripeBalanceTxId: bt.id,
            stripeStatus,
            availableOn,
            clubAvailableOn,
        };
        let payloadNuevo = null;

        if (payload.stripeFeeRate === undefined || payload.stripeFee === undefined) {
            const trm = await trmForDate(charge?.created ? charge.created * 1000 : payment.createdAt);
            const comision = stripeFeeInChargeCurrency({
                fee: fromStripeAmount(bt.fee, bt.currency),
                feeCurrency: bt.currency,
                chargeCurrency: payment.currency,
                exchangeRate: bt.exchange_rate,
                trm,
            });
            if (comision.amount !== null) {
                const bruto = Number(payment.amount) || 0;
                const retencion = Number(payment.applicationFee) || 0;
                campos.netAmount = Math.max(0, bruto - retencion - comision.amount);
                payloadNuevo = JSON.stringify({
                    ...payload,
                    stripeFee: comision.amount,
                    stripeFeeOriginal: comision.original || null,
                    stripeFeeRate: comision.rate ?? null,
                    stripeFeeRateSource: comision.rateSource || null,
                    stripeFeeRateDate: comision.rateDate || null,
                    stripeFeeRateOfficial: !!comision.rateOfficial,
                    stripeFeeConverted: comision.converted ?? false,
                });
            }
            // Sin tasa NO se toca el neto: restar una moneda de otra es el
            // defecto que costó la v4.845. Se conserva la estimación.
        }

        const sets = Object.keys(campos).map((k, i) => `"${k}" = $${i + 2}`);
        const args = [payment.id, ...Object.values(campos)];
        if (payloadNuevo) { args.push(payloadNuevo); sets.push(`"rawPayload" = $${args.length}`); }

        await db.query(
            `UPDATE "Payment" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $1`,
            args
        );

        const actualizado = { ...payment, ...campos };
        const despues = bucketOf(actualizado, now);

        return {
            ok: true,
            id: payment.id,
            cambio: true,
            antes, despues,
            availableOn: availableOn ? availableOn.toISOString() : null,
            clubAvailableOn: clubAvailableOn ? clubAvailableOn.toISOString() : null,
            stripeStatus,
            payment: actualizado,
        };
    } catch (e) {
        // Textual, con el código de Stripe si lo trae.
        const detalle = [e?.code, e?.message].filter(Boolean).join(': ');
        return { ok: false, id: payment.id, reason: 'stripe', detail: detalle || 'error desconocido' };
    }
};

/* ─── ANOTAR LO QUE CAMBIÓ ───────────────────────────────────────────
 *
 * Escribe la traza y, cuando corresponde, el asiento de liberación en el libro
 * mayor. Las dos cosas son idempotentes por índice único, así que llamar a esto
 * dos veces por el mismo pago no duplica nada.
 */
const anotarAvance = async (payment, { desde, hacia, now, motivo }) => {
    const clubId = payment.clubId;
    await recordEvent({
        paymentId: payment.id,
        clubId,
        kind: hacia,
        fromState: desde,
        toState: hacia,
        actorKind: 'system',
        actorLabel: 'Barrido automático de la Bóveda',
        reference: payment.stripeBalanceTxId || payment.providerRef || null,
        note: motivo || null,
        occurredAt: fechaDelEstado(payment, hacia) || now,
    });

    // El asiento de LIBERACIÓN, en el libro mayor que sigue en sombra.
    //
    // Se asienta cuando el CLUB lo puede pedir, no cuando Stripe lo suelta:
    // entre las dos fechas hay el margen de la plataforma, y asentar en la
    // primera pondría en «disponible para retiro» un dinero que la Bóveda
    // todavía no deja retirar. Es la regla de v4.847 y no cambia acá.
    if (hacia === 'available') {
        const neto = Number(payment.netAmount) || 0;
        if (neto > 0) {
            await postRelease({
                clubId,
                currency: normalizeCurrency(payment.currency),
                net: neto,
                sourceRef: payment.id,
                occurredAt: fechaDelEstado(payment, 'available') || now,
                meta: { origen: 'barrido_automatico' },
            });
        }
    }
};

/** Cuándo OCURRIÓ de verdad un estado, según las fechas del pago. No es «ahora»:
 *  un aporte que venció hace tres días venció hace tres días, aunque lo
 *  descubramos hoy. Anotarlo con la fecha de hoy falsearía la línea de tiempo. */
const fechaDelEstado = (payment, estado) => {
    const av = payment.availableOn ? new Date(payment.availableOn) : null;
    const cl = payment.clubAvailableOn ? new Date(payment.clubAvailableOn) : null;
    if (estado === 'available_soon' && av) return av;
    if (estado === 'available') return cl || (av ? new Date(av.getTime() + PLATFORM_HOLDING_DAYS * DIA_MS) : null);
    if (estado === 'in_transit' || estado === 'processing') return payment.createdAt ? new Date(payment.createdAt) : null;
    return null;
};

/* ─── EL BARRIDO ─────────────────────────────────────────────────────
 *
 * ⚠️ NUNCA LANZA. Corre dentro de un cron y dentro del botón de sincronizar:
 * toda función devuelve su resultado con el motivo escrito, y un fallo sobre un
 * aporte no se lleva por delante a los demás. Es la regla de la cola de
 * distribución y del barrido de Reels.
 */
export const sweepWallet = async ({
    clubId = null,
    limit = 40,
    timeBudgetMs = 60_000,
    now = new Date(),
    stripe = null,
} = {}) => {
    const t0 = Date.now();
    const resumen = {
        revisados: 0,
        consultadosAStripe: 0,
        actualizados: 0,
        avanzados: 0,
        fallidos: 0,
        pendientes: 0,
        detalle: [],
        elapsedMs: 0,
        ventanaDias: VENTANA_DIAS,
    };

    try {
        const api = stripe || getStripe();

        // ── 1. Los que necesitan a Stripe ────────────────────────────
        let candidatos = [];
        try {
            candidatos = await findStripeCandidates({ clubId, limit });
        } catch (e) {
            console.warn('[WALLET SWEEP] no pude listar candidatos de Stripe:', e?.message);
        }

        const corregidos = new Map();

        for (const p of candidatos) {
            if (Date.now() - t0 > timeBudgetMs) {
                // Lo que no entra espera a la vuelta siguiente y se DICE. Un
                // corte mudo se lee como «ya está todo al día», que es la
                // conclusión equivocada.
                resumen.pendientes = candidatos.length - resumen.consultadosAStripe;
                break;
            }
            resumen.consultadosAStripe++;
            const r = await reconcileOne(p, { stripe: api, now });
            if (!r.ok) {
                resumen.fallidos++;
                resumen.detalle.push({ id: p.id, error: r.detail || r.reason });
                continue;
            }
            if (r.cambio) {
                resumen.actualizados++;
                corregidos.set(p.id, r.payment);
                resumen.detalle.push({
                    id: p.id, antes: r.antes, despues: r.despues,
                    availableOn: r.availableOn, stripeStatus: r.stripeStatus,
                });
            }
        }

        // ── 2. Los que sólo necesitan el calendario ──────────────────
        //
        // Incluye a los recién corregidos: su estado nuevo hay que anotarlo
        // igual, y hacerlo en el mismo lugar evita dos caminos que se separen.
        let pagos = [];
        try {
            pagos = await findCalendarCandidates({ clubId });
        } catch (e) {
            console.warn('[WALLET SWEEP] no pude listar candidatos de calendario:', e?.message);
        }
        // Lo que acaba de corregirse manda sobre lo que devolvió la consulta:
        // esa lectura puede ser anterior al UPDATE de arriba.
        pagos = pagos.map(p => corregidos.get(p.id) || p);
        for (const [id, p] of corregidos) if (!pagos.some(x => x.id === id)) pagos.push(p);

        const { lastStatesFor } = await import('./paymentLifecycle.js');
        const anotados = await lastStatesFor(pagos.map(p => p.id));

        for (const p of pagos) {
            if (Date.now() - t0 > timeBudgetMs) break;
            resumen.revisados++;
            const plan = planFor({ ...p, lifecycleState: anotados[p.id] || null }, now);
            if (plan.accion !== 'anotar_estado') continue;
            try {
                await anotarAvance(p, { desde: plan.desde, hacia: plan.estado, now, motivo: plan.motivo });
                resumen.avanzados++;
            } catch (e) {
                resumen.fallidos++;
                resumen.detalle.push({ id: p.id, error: e?.message });
            }
        }
    } catch (e) {
        // El barrido entero degradó. Se dice y se devuelve lo que se alcanzó.
        console.error('[WALLET SWEEP] error general:', e?.message);
        resumen.detalle.push({ error: e?.message });
    }

    resumen.elapsedMs = Date.now() - t0;
    return resumen;
};

/* ─── LA FOTO DE UN APORTE, PARA LA PANTALLA ─────────────────────────
 *
 * Todo derivado. No hay ninguna columna nueva que mantener sincronizada, así
 * que no hay dos verdades que puedan contradecirse.
 */
export const lifecycleOf = (payment, now = new Date()) => {
    const cal = scheduleOf(payment, now);
    return { ...cal, label: stateLabel(cal.estado) };
};

export default { sweepWallet, reconcileOne, findStripeCandidates, findCalendarCandidates, lifecycleOf };
