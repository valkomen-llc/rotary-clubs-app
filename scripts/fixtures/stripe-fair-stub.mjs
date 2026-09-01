// La pasarela, en memoria. Doble de `stripe` para probar el CAMINO del pago.
// v4.978.0
//
// Reproduce lo que de verdad importa del contrato de Checkout: una sesión
// nace `open`, puede pagarse, caducar o expirarse a mano, y `retrieve`
// devuelve su estado actual. Nada de red.
let seq = 0;
export const sesiones = new Map();
export const llamadas = { create: 0, retrieve: 0, expire: 0 };
export let fallarAlCrear = null;
export let fallarAlLeer = null;

export const reset = () => {
    seq = 0;
    sesiones.clear();
    llamadas.create = 0; llamadas.retrieve = 0; llamadas.expire = 0;
    fallarAlCrear = null; fallarAlLeer = null;
};
export const romperCreacion = (msg) => { fallarAlCrear = msg; };
export const romperLectura = (msg) => { fallarAlLeer = msg; };

/** Marca una sesión como pagada, como haría el usuario en la pasarela. */
export const pagar = (id, { paymentIntentId = 'pi_ok' } = {}) => {
    const s = sesiones.get(id);
    if (!s) throw new Error(`sesión desconocida: ${id}`);
    s.status = 'complete';
    s.payment_status = 'paid';
    s.payment_intent = paymentIntentId;
    return s;
};
/** La sesión caduca sin pagarse. */
export const caducar = (id) => {
    const s = sesiones.get(id);
    if (s) { s.status = 'expired'; s.payment_status = 'unpaid'; }
    return s;
};

export default class Stripe {
    constructor() {
        this.checkout = {
            sessions: {
                create: async (payload) => {
                    llamadas.create++;
                    if (fallarAlCrear) throw new Error(fallarAlCrear);
                    const id = `cs_test_${++seq}`;
                    const s = {
                        id,
                        object: 'checkout.session',
                        url: `https://pasarela.test/${id}`,
                        status: 'open',
                        payment_status: 'unpaid',
                        expires_at: Math.floor((Date.now() + 24 * 3600_000) / 1000),
                        amount_total: payload?.line_items?.[0]?.price_data?.unit_amount ?? 0,
                        currency: 'usd',
                        customer: null,
                        payment_intent: null,
                        metadata: payload?.metadata || {},
                    };
                    sesiones.set(id, s);
                    return s;
                },
                retrieve: async (id) => {
                    llamadas.retrieve++;
                    if (fallarAlLeer) throw new Error(fallarAlLeer);
                    const s = sesiones.get(id);
                    if (!s) throw new Error(`No such checkout.session: ${id}`);
                    return { ...s };
                },
                expire: async (id) => {
                    llamadas.expire++;
                    const s = sesiones.get(id);
                    if (s) { s.status = 'expired'; s.payment_status = 'unpaid'; }
                    return s || {};
                },
            },
        };
        this.paymentIntents = {
            retrieve: async (id) => ({
                id, object: 'payment_intent', customer: null,
                latest_charge: { id: `ch_${id}`, amount: 6200, receipt_url: 'https://recibo.test/1', payment_method_details: { type: 'card' } },
            }),
        };
    }
}
