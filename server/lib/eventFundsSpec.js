// ════════════════════════════════════════════════════════════════════════════
// La conciliación de fondos de un EVENTO — el criterio — v4.1248
//
// ⚠️ NO ES UN SEGUNDO SISTEMA DE CONCILIACIÓN. Los pagos de inscripción ya
// generan su fila de `Payment` en la Bóveda (`buildDraftForEventRegistration`,
// v4.1025), y desde ahí los giran, los concilian y les mandan comprobante las
// MISMAS piezas que usan las campañas de contribución (la del terremoto) y la
// Feria: `BulkDisbursementBar`, `BulkReconciliationBar`, `ResendNoticeModal`,
// `DisbursementSection` y `/financial/wallet/*`. Este archivo sólo contesta
// dos preguntas que esas piezas no tenían:
//
//   1. ¿Qué inscripción de ESTE evento corresponde a qué pago de la Bóveda?
//      → `matchRegistrationsToPayments`, por el IDENTIFICADOR de Stripe
//        (PaymentIntent o Checkout Session) — nunca por nombre ni por correo.
//   2. ¿En qué punto del camino del dinero está cada pago?
//      → `fundStatesOf`, con CINCO estados que no se funden en un «Pagado».
//
// Es PURO: sin base, sin red. El navegador importa este mismo archivo.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Inscripciones cuyo cobro entró y sigue vigente: deberían tener movimiento en
 * la Bóveda. Una REEMBOLSADA no está: no hay dinero que trasladar. La misma
 * lista decide qué registra «Registrar movimientos» (`pendingCollections`).
 */
export const PAID_REGISTRATION_STATUSES = ['paid', 'accredited', 'attended', 'no_show'];

const TOLERANCIA = 0.005;
const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Las referencias de Stripe que puede llevar una inscripción. */
export const stripeRefsOf = (reg = {}) =>
    [reg.stripePaymentIntentId, reg.stripeSessionId]
        .map(v => String(v || '').trim())
        .filter(Boolean);

/**
 * Empareja las inscripciones del evento con los pagos de la Bóveda.
 *
 * Un pago se reconoce por su `providerRef`, que es el PaymentIntent o, si el
 * cobro no lo tenía todavía, la Checkout Session — los mismos dos valores que
 * usa `pendingCollections` para decidir si a una inscripción le falta su
 * movimiento. Con otro criterio acá, una pantalla diría «sin movimiento» de un
 * pago que la reconstrucción considera registrado, o al revés.
 *
 * Devuelve:
 *   · `byPayment`     — paymentId → inscripción.
 *   · `paymentIds`    — los pagos de ESTE evento.
 *   · `sinMovimiento` — pagadas con referencia de Stripe y sin pago en la
 *                       Bóveda (se registran con «Registrar movimientos»).
 *   · `sinReferencia` — pagadas SIN referencia de Stripe (pago manual o por
 *                       fuera de la pasarela): no hay identificador que las
 *                       ate a un movimiento y NO se asocian a ninguno.
 */
export const matchRegistrationsToPayments = (registrations = [], payments = []) => {
    const porRef = new Map();
    for (const p of payments || []) {
        const ref = String(p?.providerRef || '').trim();
        if (ref && !porRef.has(ref)) porRef.set(ref, p);
    }
    const byPayment = {};
    const sinMovimiento = [];
    const sinReferencia = [];
    for (const reg of registrations || []) {
        const refs = stripeRefsOf(reg);
        const pagada = PAID_REGISTRATION_STATUSES.includes(String(reg?.status || ''));
        const pago = refs.map(r => porRef.get(r)).find(Boolean);
        if (pago) {
            if (!byPayment[pago.id]) byPayment[pago.id] = reg;
            continue;
        }
        if (!pagada) continue;
        if (refs.length) sinMovimiento.push(reg);
        else sinReferencia.push(reg);
    }
    return { byPayment, paymentIds: Object.keys(byPayment), sinMovimiento, sinReferencia };
};

// ── Los cinco estados ───────────────────────────────────────────────────────

export const FUND_STATE_LABELS = {
    pago: {
        confirmado: 'Confirmado', pendiente: 'Pendiente', fallido: 'Fallido',
        reembolsado: 'Reembolsado', disputa: 'En disputa',
    },
    stripe: {
        verificado: 'Verificado en Stripe', pendiente: 'Sin verificar',
    },
    liquidacion: {
        pendiente: 'Pendiente', por_liberar: 'Por liberar', disponible: 'Disponible',
        reembolsado: 'Reembolsado',
    },
    traslado: {
        no_registrado: 'No registrado', parcial: 'Parcial', confirmado: 'Confirmado',
        no_aplica: 'No aplica',
    },
    comprobante: {
        no_aplica: '—', pendiente: 'Pendiente', enviado: 'Enviado', error: 'Error de envío',
    },
};

/** Estados de un aviso de conciliación que dicen que el correo se aceptó. */
const AVISO_ENVIADO = ['enviado', 'parcial', 'reenviada'];

/**
 * En qué punto del camino del dinero está UN pago.
 *
 * ⚠️ UN PAGO CONFIRMADO NO PRUEBA QUE EL BENEFICIARIO RECIBIÓ LOS FONDOS. Por
 * eso son estados separados y ninguno se deduce de otro:
 *
 *   · `pago`        — lo que Stripe dijo del cobro (`Payment.status`).
 *   · `stripe`      — si el cobro está atado a su balance transaction
 *                     (`stripeBalanceTxId`): es lo que permite cuadrarlo contra
 *                     las liquidaciones de Stripe.
 *   · `liquidacion` — si el dinero ya está libre en la cuenta de la plataforma
 *                     (`financialBucket`, el de `walletLifecycle`).
 *   · `traslado`    — cuánto se registró girado AL BENEFICIARIO, con estado
 *                     `confirmado` en `Disbursement`. Sólo eso cuenta.
 *   · `comprobante` — si se mandó la conciliación por correo. «Enviado» quiere
 *                     decir que el proveedor ACEPTÓ el correo, no que llegó.
 */
export const fundStatesOf = (item = {}, { notices = [] } = {}) => {
    const status = String(item.status || '').toLowerCase();
    const pago = status === 'succeeded' ? 'confirmado'
        : status === 'refunded' ? 'reembolsado'
            : status === 'failed' ? 'fallido'
                : status === 'disputed' ? 'disputa'
                    : 'pendiente';

    const fb = String(item.financialBucket || item.bucket || '');
    const liquidacion = fb === 'refunded' || pago === 'reembolsado' ? 'reembolsado'
        : fb === 'available' || fb === 'disbursing' || fb === 'disbursed' ? 'disponible'
            : fb === 'available_soon' ? 'por_liberar'
                : 'pendiente';

    const neto = num(item.amount);
    const girado = num(item.disbursedAmount);
    const traslado = pago === 'reembolsado' || pago === 'fallido'
        ? (girado > TOLERANCIA ? 'parcial' : 'no_aplica')
        : girado <= TOLERANCIA ? 'no_registrado'
            : girado + TOLERANCIA >= neto ? 'confirmado'
                : 'parcial';

    const propios = (notices || []).filter(n => Array.isArray(n?.paymentIds) && n.paymentIds.includes(item.id));
    const comprobante = propios.some(n => AVISO_ENVIADO.includes(String(n.state || '')))
        ? 'enviado'
        : propios.some(n => String(n.state || '') === 'fallido')
            ? 'error'
            : traslado === 'confirmado' || traslado === 'parcial' ? 'pendiente' : 'no_aplica';

    return {
        pago,
        stripe: item.stripeBalanceTxId ? 'verificado' : 'pendiente',
        liquidacion,
        traslado,
        comprobante,
    };
};

/**
 * Lo que la tabla de inscripciones dice en UNA etiqueta. No reemplaza a los
 * cinco estados: los resume para el listado, y el detalle vive en la pestaña
 * «Conciliación de fondos».
 */
export const registrationFundBadge = (states) => {
    if (!states) return { key: 'sin_movimiento', label: 'Sin movimiento en la Bóveda' };
    if (states.pago === 'reembolsado') return { key: 'reembolsado', label: 'Reembolsado' };
    if (states.traslado === 'confirmado') return { key: 'trasladado', label: 'Trasladado' };
    if (states.traslado === 'parcial') return { key: 'parcial', label: 'Traslado parcial' };
    if (states.liquidacion === 'disponible') return { key: 'disponible', label: 'Disponible para trasladar' };
    return { key: 'en_transito', label: 'En liquidación (Stripe)' };
};

/**
 * Totales del evento POR MONEDA. Nunca se suman COP y USD: cada moneda es su
 * propio resumen, como en la Bóveda (regla de v4.841).
 */
export const eventFundTotals = (items = []) => {
    const porMoneda = {};
    for (const it of items || []) {
        const cur = String(it.currency || '').toUpperCase() || 'USD';
        const t = porMoneda[cur] || (porMoneda[cur] = {
            currency: cur, pagos: 0, bruto: 0, comisiones: 0, neto: 0, reembolsado: 0,
            enLiquidacion: 0, disponible: 0, trasladado: 0, pendienteTraslado: 0,
            verificados: 0, comprobantesEnviados: 0,
        });
        const s = it.states || fundStatesOf(it);
        const neto = num(it.amount);
        const girado = num(it.disbursedAmount);
        t.pagos += 1;
        if (s.pago === 'reembolsado') { t.reembolsado += neto; continue; }
        if (s.pago !== 'confirmado') continue;
        t.bruto += num(it.grossAmount);
        t.comisiones += num(it.fee);
        t.neto += neto;
        t.trasladado += Math.min(girado, neto);
        if (s.liquidacion === 'disponible') t.disponible += Math.max(0, neto - girado);
        else t.enLiquidacion += neto;
        t.pendienteTraslado += Math.max(0, neto - girado);
        if (s.stripe === 'verificado') t.verificados += 1;
        if (s.comprobante === 'enviado') t.comprobantesEnviados += 1;
    }
    return Object.values(porMoneda);
};
