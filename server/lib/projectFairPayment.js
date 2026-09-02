// ════════════════════════════════════════════════════════════════════
// El pago de una inscripción a la Feria de Proyectos — EL CRITERIO
// v4.982.0
//
// PURO: sin base, sin red, sin Stripe, sin DOM. Vive aparte de
// `projectFairController.js` por el mismo motivo que `seoRules.js` vive aparte
// de `seoAudit.js`: un criterio que sólo se ejercita contra Stripe y contra
// Postgres termina sin pruebas, y entonces nadie se entera de que una regla
// cambió de signo. Acá se responde UNA pregunta y todo lo demás cuelga de
// ella: ¿esta inscripción tiene un pago CONFIRMADO?
//
// ⚠️ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA NO REPETIR. Hasta v4.977 el panel
// del club (`/mi-proyecto`) pintaba «Pendiente de pago» y NO ofrecía ninguna
// acción: quien creaba su cuenta, postulaba su proyecto y recibía un rechazo
// del banco quedaba en un callejón sin salida —con los formularios bloqueados
// y sin forma de volver a intentarlo—. La única vía de reintento vivía en el
// wizard público y exigía volver con `?submission=` en la URL, que nadie
// conserva. Un pago rechazado no es una inscripción pagada, y tampoco puede
// ser el final del camino.
// ════════════════════════════════════════════════════════════════════

import { toStripeAmount } from './money.js';

/**
 * Estados del PAGO de una inscripción (`ProjectFairSubmission.status`).
 * Catálogo CERRADO: lo que no esté acá no puede decidir nada — un estado
 * inventado no se puede rotular ni reportar.
 *
 * `pending_payment` es además el DEFAULT de la columna, así que es el que
 * recibe cualquier valor que no reconozcamos: ante la duda, la inscripción no
 * está pagada. Equivocarse hacia ese lado deja al club con un botón de más;
 * hacia el otro, con un cobro que no debía existir.
 */
export const PAYMENT_STATES = ['pending_payment', 'failed', 'paid', 'refunded'];

/** Desenlaces de un intento de cobro. También cerrado. */
export const ATTEMPT_STATES = ['open', 'succeeded', 'failed', 'expired', 'canceled'];

/**
 * ⚠️ LA REGLA DE NEGOCIO ENTERA, EN UNA LÍNEA. ¿Existe un pago válido y
 * confirmado asociado a esta inscripción?
 *
 * Lo que NO cuenta como pago confirmado, y es justamente lo que se confundía:
 * que exista un `stripeSessionId`, un `stripePaymentIntentId`, un intento
 * anterior o una fila en el historial. Todo eso demuestra que alguien
 * INTENTÓ pagar, no que haya pagado. Sólo `status = 'paid'` —que lo escribe
 * `confirmPaidSession` con la confirmación del proveedor delante— lo demuestra.
 */
export const hasConfirmedPayment = (submission) => submission?.status === 'paid';

/**
 * ¿Se le puede ofrecer pagar? Es la negación de la anterior, con una sola
 * excepción declarada: un reembolso es una decisión administrativa, y volver
 * a cobrarle por su cuenta a quien acaba de recibir su dinero de vuelta sería
 * desobedecer esa decisión. Ahí la salida es escribirle al comité.
 */
export const canStartPayment = (submission) =>
    !hasConfirmedPayment(submission) && submission?.status !== 'refunded';

// ── Lo que el fallo del proveedor le dice al USUARIO ─────────────────
// El error crudo de Stripe se conserva SIEMPRE en `lastPaymentError` y en el
// intento —lo necesita soporte—, pero NO se le muestra a quien paga: es texto
// de un tercero, en inglés, y a veces nombra objetos internos de la pasarela.
// Lo que se muestra sale de este catálogo cerrado. Un código que no esté acá
// cae en la frase genérica; nunca en el mensaje del gateway.
const FAILURE_MESSAGES = {
    card_declined: 'Tu banco rechazó la tarjeta.',
    do_not_honor: 'Tu banco rechazó la tarjeta.',
    generic_decline: 'Tu banco rechazó la tarjeta.',
    insufficient_funds: 'La tarjeta no tenía fondos suficientes.',
    expired_card: 'La tarjeta está vencida.',
    incorrect_cvc: 'El código de seguridad no coincide.',
    invalid_cvc: 'El código de seguridad no coincide.',
    incorrect_number: 'El número de la tarjeta no es correcto.',
    invalid_number: 'El número de la tarjeta no es correcto.',
    incorrect_zip: 'Los datos de facturación no coincidieron.',
    processing_error: 'Hubo un problema al procesar el cobro.',
    authentication_required: 'El banco pidió una verificación que no se completó.',
    card_not_supported: 'Esa tarjeta no admite este tipo de cobro.',
    currency_not_supported: 'Esa tarjeta no admite cobros en dólares.',
    withdrawal_count_limit_exceeded: 'La tarjeta superó su límite de operaciones.',
};

/** La frase que ve el usuario. Nunca el texto del gateway. */
export const friendlyFailure = (code) => {
    const key = String(code || '').trim().toLowerCase();
    return FAILURE_MESSAGES[key] || 'El intento anterior no pudo procesarse.';
};

// ── Qué se pinta en la tarjeta INSCRIPCIÓN ──────────────────────────
// El VEREDICTO lo arma el servidor y viaja resuelto: el navegador no vuelve a
// decidir si hay pago o no. Es la exigencia expresa del pedido —«el frontend
// nunca debe ser la fuente de verdad del estado del pago»— y por eso no hay
// espejo de este archivo en `src/`: una segunda copia del criterio en el
// navegador es exactamente la segunda verdad que esto evita.

/**
 * @param {object} submission  fila de ProjectFairSubmission
 * @param {object} opts.lastFailure  { code, at } del último intento fallido, si lo hubo
 * @returns {{state,paid,canPay,label,detail,actionLabel}}
 */
export const paymentViewOf = (submission, { lastFailure = null } = {}) => {
    const status = String(submission?.status || 'pending_payment');

    if (status === 'paid') {
        return {
            state: 'paid', paid: true, canPay: false,
            label: 'Pago confirmado',
            detail: null,
            actionLabel: null,
        };
    }

    if (status === 'refunded') {
        return {
            state: 'refunded', paid: false, canPay: false,
            label: 'Reembolsado',
            detail: 'Tu inscripción fue reembolsada. Escríbenos si necesitas volver a inscribir el proyecto.',
            actionLabel: null,
        };
    }

    // Hubo un intento que no llegó a término. Se distingue del «nunca lo
    // intentó» porque son dos situaciones distintas para quien lee: una es un
    // trámite pendiente y la otra, algo que salió mal y hay que resolver.
    // La marca puede venir del estado (`failed`, que escribe el webhook) o del
    // historial —un rechazo cuya sesión venció después deja la inscripción en
    // `pending_payment` y el intento fallido en su fila—.
    if (status === 'failed' || lastFailure) {
        return {
            state: 'failed', paid: false, canPay: true,
            label: 'Pago no completado',
            detail: `${friendlyFailure(lastFailure?.code)} Puedes intentarlo nuevamente con el mismo u otro medio de pago.`,
            actionLabel: 'Reintentar pago',
        };
    }

    return {
        state: 'pending', paid: false, canPay: true,
        label: 'Pendiente de pago',
        detail: 'Tu inscripción quedó guardada. Completa el pago para habilitar los formularios del proyecto.',
        actionLabel: 'Completar pago',
    };
};

// ── Reutilizar la sesión de pago que ya está abierta ────────────────
// Es lo que hace que un doble clic, dos pestañas o un refresco a mitad del
// checkout no generen dos cobros: si la sesión anterior sigue viva y por el
// mismo importe, se devuelve ESA en vez de crear otra.

/** Margen: una sesión que vence en menos de esto no se reutiliza — mandar a alguien a un enlace que caduca a mitad del pago es peor que crear otro. */
export const REUSE_MARGIN_MS = 5 * 60 * 1000;

/**
 * Lee el desenlace de una Checkout Session tal como la devuelve Stripe.
 * Se mira `payment_status` ANTES que `status`: una sesión puede estar
 * `complete` y no pagada (por ejemplo, un método asíncrono que falló), y dar
 * por pagada una sesión completa sería el error caro de este archivo.
 */
export const readSessionOutcome = (session) => {
    if (!session) return 'unknown';
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') return 'paid';
    if (session.status === 'expired') return 'expired';
    if (session.status === 'open') return 'open';
    if (session.status === 'complete') return 'unpaid';
    return 'unknown';
};

/**
 * ¿Sirve esta sesión para mandar al usuario otra vez?
 *
 * CUATRO condiciones y las cuatro importan: que siga abierta, que le quede
 * bastante vida, que cobre en LA MISMA MONEDA y que cobre EL MISMO importe.
 *
 * ⚠️ LA MONEDA ES LA CUARTA DESDE v4.982, y no es defensa teórica: hasta
 * v4.981 la Feria cobraba en dólares y ahora cobra en pesos, así que toda
 * sesión abierta de antes cobra en otra moneda. Sin compararla, `amount_total`
 * —26.250.000 de centavos de peso contra 8.244 de centavos de dólar— nunca
 * casaría por casualidad, pero apoyarse en eso sería apoyarse en la suerte:
 * dos importes de monedas distintas pueden coincidir en su unidad mínima.
 *
 * Y el importe se compara en la UNIDAD MÍNIMA de su moneda, que es lo que
 * Stripe suma. `toStripeAmount` es el mismo criterio con el que se arman las
 * partidas: escribir `* 100` acá daría una comparación que se separa del cobro
 * en cuanto entre una moneda sin decimales.
 */
export const reusableCheckout = (session, { now = Date.now(), amount = null, currency = null } = {}) => {
    if (readSessionOutcome(session) !== 'open') return false;
    if (!session?.url) return false;
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (!expiresAt || expiresAt - now < REUSE_MARGIN_MS) return false;
    if (currency && String(session.currency || '').toUpperCase() !== String(currency).toUpperCase()) return false;
    if (amount != null && Number(session.amount_total) !== toStripeAmount(amount, currency || session.currency)) return false;
    return true;
};

/**
 * Los intentos, resumidos para el panel del club. El NÚMERO se deriva del
 * orden —no se guarda— por el mismo motivo de siempre: un contador guardado
 * es una segunda verdad sobre lo que las filas ya dicen, y se contradice en
 * cuanto alguien inserte una fuera de orden.
 *
 * El mensaje del gateway NO viaja: sólo su traducción de `friendlyFailure`.
 */
export const ATTEMPT_LABELS = {
    open: 'En curso',
    succeeded: 'Aprobado',
    failed: 'Rechazado',
    expired: 'Caducado',
    canceled: 'Cancelado',
};

export const attemptHistoryOf = (rows = []) => rows.map((row, i) => ({
    n: i + 1,
    status: ATTEMPT_STATES.includes(row?.status) ? row.status : 'canceled',
    label: ATTEMPT_LABELS[row?.status] || 'Sin desenlace',
    reason: row?.status === 'failed' ? friendlyFailure(row?.failureCode) : null,
    at: row?.resolvedAt || row?.startedAt || null,
}));

/**
 * El último intento fallido, para que la tarjeta pueda decir QUÉ pasó. Se
 * busca sobre la lista ya ordenada del más viejo al más nuevo.
 */
export const lastFailureOf = (rows = []) => {
    for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]?.status === 'failed') {
            return { code: rows[i].failureCode || null, at: rows[i].resolvedAt || rows[i].startedAt || null };
        }
    }
    return null;
};
