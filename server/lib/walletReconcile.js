// LA RECONCILIACIÓN de los aportes históricos.
//
// v4.885 — Al desplegar el ciclo de vida hay aportes vivos que llevan meses con
// el estado local desactualizado: la columna `stripeStatus` se quedó en
// «pending» el día del cobro y nadie volvió a mirarla. El barrido los alcanza
// solos, pero de a poco y dentro de su ventana; esto es la pasada explícita que
// los mira TODOS y deja un informe.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ NO SE INVENTA UNA TRANSACCIÓN PARA CORREGIR UN ESTADO VISUAL.
// ═════════════════════════════════════════════════════════════════════
//
// Es la exigencia expresa del pedido y la regla que gobierna este archivo. Lo
// que hace la reconciliación es PREGUNTARLE A STRIPE y escribir lo que Stripe
// conteste. Si Stripe no contesta, el aporte queda como está y se REPORTA por
// qué. En ningún caso se escribe una fecha inventada para que la pantalla se
// vea coherente: una Bóveda que se ve bien y miente es peor que una que enseña
// el problema.
//
// Tampoco se tocan BALANCES. El neto sólo se completa cuando nunca se pudo
// leer la comisión real —y ahí no se corrige una decisión nuestra, se rellena
// un dato que el proveedor no había dado—; la retención de la plataforma no se
// recalcula jamás, porque aplicarle a un cobro de marzo la tarifa de agosto es
// reescribir historia financiera (regla de v4.854).
//
// ═════════════════════════════════════════════════════════════════════
// DE ENSAYO POR DEFECTO.
// ═════════════════════════════════════════════════════════════════════
//
// Sin `apply: true` no escribe: devuelve lo que haría, agrupado por motivo. Es
// el patrón de `ledgerBackfill` (v4.848), y lo valioso es lo mismo — mirar
// antes de tocar, y que lo que NO se pudo corregir tenga su explicación.

import db from './db.js';
import { reconcileOne, findCalendarCandidates } from './walletSweep.js';
import { recordEvent, lastStatesFor } from './paymentLifecycle.js';
import { bucketOf, planFor, scheduleOf, stateLabel, PLATFORM_HOLDING_DAYS } from './walletLifecycle.js';
import { postRelease } from './ledger.js';
import { normalizeCurrency } from './money.js';
import Stripe from 'stripe';

const DIA_MS = 24 * 60 * 60 * 1000;
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');

/* ─── EL DIAGNÓSTICO DE UN APORTE ────────────────────────────────────
 *
 * Puro: recibe la fila y devuelve qué le pasa. Se puede probar con fechas
 * fabricadas, que es lo que hace falta para saber que la clasificación no
 * cambió de signo sin que nadie se entere.
 */
export const diagnose = (p, { anotado = null, now = new Date() } = {}) => {
    const estado = bucketOf(p, now);
    const cal = scheduleOf(p, now);
    const hallazgos = [];

    if (!p.availableOn) {
        hallazgos.push({
            clase: 'sin_fecha_de_stripe',
            detalle: 'El aporte no tiene fecha de liberación del proveedor: nunca se pudo leer su balance transaction.',
        });
    }

    if (p.stripeStatus === 'pending' && p.availableOn && new Date(p.availableOn) <= now) {
        hallazgos.push({
            clase: 'columna_desactualizada',
            detalle: 'La fecha de liberación ya pasó y la columna del proveedor sigue diciendo «pending». '
                + 'Es el aporte que se quedaba «En tránsito» para siempre.',
        });
    }

    if (anotado && anotado !== estado) {
        hallazgos.push({
            clase: 'estado_local_atrasado',
            detalle: `El calendario dice «${stateLabel(estado)}» y lo último registrado era «${stateLabel(anotado)}».`,
        });
    }
    if (!anotado) {
        hallazgos.push({
            clase: 'sin_traza',
            detalle: 'El aporte no tiene ningún evento registrado: es anterior al ciclo de vida.',
        });
    }

    // Una incoherencia que no se corrige sola y que hay que MIRAR: el club
    // puede disponer del dinero antes que el proveedor lo suelte. Si aparece,
    // es un dato mal escrito, no un aporte lento.
    if (p.availableOn && p.clubAvailableOn && new Date(p.clubAvailableOn) < new Date(p.availableOn)) {
        hallazgos.push({
            clase: 'fechas_incoherentes',
            detalle: 'La fecha en que el club dispone del dinero es ANTERIOR a la de liberación del proveedor.',
        });
    }

    return { estado, calendario: cal, hallazgos, vencido: cal.diasRestantes === 0 };
};

/* ─── LA PASADA ──────────────────────────────────────────────────────*/

export const reconcileHistory = async ({
    clubId = null, apply = false, limit = 200, timeBudgetMs = 120_000,
    actor = null, now = new Date(),
} = {}) => {
    const t0 = Date.now();
    const informe = {
        modo: apply ? 'aplicado' : 'ensayo',
        revisados: 0,
        consultadosAStripe: 0,
        corregidos: 0,
        anotados: 0,
        sinCambio: 0,
        // Lo que NO se pudo corregir, agrupado por MOTIVO con ejemplos: un
        // listado de doscientas filas no lo lee nadie.
        noCorregidos: {},
        hallazgos: {},
        pendientes: 0,
        detalle: [],
        elapsedMs: 0,
    };

    const sumar = (mapa, clave, id) => {
        const e = (mapa[clave] ||= { cuantos: 0, ejemplos: [] });
        e.cuantos++;
        if (e.ejemplos.length < 5) e.ejemplos.push(id);
    };

    try {
        const pagos = await findCalendarCandidates({ clubId, limit, ventanaDias: 3650 });
        const anotados = await lastStatesFor(pagos.map(p => p.id));
        const api = getStripe();

        for (const p of pagos) {
            if (Date.now() - t0 > timeBudgetMs) {
                informe.pendientes = pagos.length - informe.revisados;
                break;
            }
            informe.revisados++;

            let fila = p;
            const dx = diagnose(fila, { anotado: anotados[p.id] || null, now });
            for (const h of dx.hallazgos) sumar(informe.hallazgos, h.clase, p.id);

            const necesitaStripe = dx.hallazgos.some(h =>
                h.clase === 'sin_fecha_de_stripe' || h.clase === 'columna_desactualizada');

            // ── Paso 1: preguntarle al proveedor ─────────────────────
            if (necesitaStripe && p.providerRef) {
                if (!apply) {
                    informe.detalle.push({
                        id: p.id, accion: 'se_consultaria_a_stripe',
                        estado: dx.estado, hallazgos: dx.hallazgos.map(h => h.clase),
                    });
                } else {
                    informe.consultadosAStripe++;
                    const r = await reconcileOne(fila, { stripe: api, now });
                    if (!r.ok) {
                        sumar(informe.noCorregidos, r.reason === 'stripe' ? `stripe: ${r.detail}` : r.reason, p.id);
                        continue;
                    }
                    if (r.cambio) {
                        informe.corregidos++;
                        fila = r.payment;
                        informe.detalle.push({
                            id: p.id, accion: 'corregido',
                            antes: r.antes, despues: r.despues,
                            availableOn: r.availableOn, stripeStatus: r.stripeStatus,
                        });
                    } else {
                        sumar(informe.noCorregidos, r.reason || 'sin_cambio', p.id);
                    }
                }
            } else if (necesitaStripe && !p.providerRef) {
                // Sin referencia del proveedor no hay a quién preguntarle, y
                // NO se adivina: inventarle una fecha de liberación a un cobro
                // que no se puede consultar es exactamente lo que esta pasada
                // no hace.
                sumar(informe.noCorregidos, 'sin_referencia_del_proveedor', p.id);
            }

            // ── Paso 2: anotar el estado que dicen las fechas ────────
            const plan = planFor({ ...fila, lifecycleState: anotados[p.id] || null }, now);
            if (plan.accion === 'anotar_estado') {
                if (!apply) {
                    informe.detalle.push({
                        id: p.id, accion: 'se_anotaria', desde: plan.desde, hacia: plan.estado, motivo: plan.motivo,
                    });
                } else {
                    await recordEvent({
                        paymentId: fila.id, clubId: fila.clubId,
                        kind: plan.estado, fromState: plan.desde, toState: plan.estado,
                        actorKind: 'system',
                        actorLabel: actor?.name ? `Reconciliación (${actor.name})` : 'Reconciliación de la Bóveda',
                        reference: fila.stripeBalanceTxId || fila.providerRef || null,
                        note: plan.motivo,
                        occurredAt: fechaDelEstado(fila, plan.estado) || now,
                    });
                    // El asiento de liberación, si corresponde. Idempotente por
                    // el índice único de `LedgerTransaction`: correr la
                    // reconciliación dos veces no duplica dinero.
                    if (plan.estado === 'available' && Number(fila.netAmount) > 0) {
                        await postRelease({
                            clubId: fila.clubId,
                            currency: normalizeCurrency(fila.currency),
                            net: Number(fila.netAmount),
                            sourceRef: fila.id,
                            occurredAt: fechaDelEstado(fila, 'available') || now,
                            meta: { origen: 'reconciliacion' },
                        });
                    }
                    informe.anotados++;
                }
            } else {
                informe.sinCambio++;
            }
        }
    } catch (e) {
        console.error('[WALLET RECONCILE] error general:', e?.message);
        informe.detalle.push({ error: e?.message });
    }

    informe.elapsedMs = Date.now() - t0;

    // El informe se DICE entero, incluido lo que no se hizo. Un corte mudo se
    // lee como «ya está todo al día», que es la conclusión equivocada.
    if (!apply) {
        informe.nota = 'Ensayo: no se escribió nada. Volvé a llamar con {"apply": true} para aplicar.';
    }
    return informe;
};

/** Cuándo ocurrió de verdad un estado. Duplica a propósito el criterio de
 *  `walletSweep`: son dos llamadores del mismo dato y unificarlo exigiría
 *  exportar una función que sólo sirve acá. Al tocar uno, tocar el otro. */
const fechaDelEstado = (payment, estado) => {
    const av = payment.availableOn ? new Date(payment.availableOn) : null;
    const cl = payment.clubAvailableOn ? new Date(payment.clubAvailableOn) : null;
    if (estado === 'available_soon' && av) return av;
    if (estado === 'available') return cl || (av ? new Date(av.getTime() + PLATFORM_HOLDING_DAYS * DIA_MS) : null);
    if (estado === 'in_transit' || estado === 'processing') return payment.createdAt ? new Date(payment.createdAt) : null;
    return null;
};

export default { reconcileHistory, diagnose };
