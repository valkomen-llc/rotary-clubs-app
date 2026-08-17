// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — el CRITERIO
// v4.855.0 (Fase 0)
//
// Puro: sin base, sin red, sin IA, sin DOM. Todo lo que decide algo vive
// acá y se prueba con `npm run test:notifications`; la orquestación —hablar
// con Resend, escribir en la base— vive en `notificationLog.js` y en el
// remitente de las fases siguientes. Es el mismo reparto que `seoRules.js`
// frente a `seoAudit.js`, y existe por el mismo motivo: un motor que sólo se
// puede ejercitar contra una base real termina sin pruebas.
//
// ── LO QUE ESTA FASE RESUELVE ───────────────────────────────────────
//
// Hoy el recibo de un aporte se manda con `EmailService.sendPlatformEmail`,
// que NO registra nada —`logCommunication` sólo se llama desde `sendEmail`,
// el camino del correo de club—. El resultado es que «¿le llegó la
// confirmación a este aportante?» no tiene dónde mirarse: la respuesta vivía
// en un `console.log`, y en Vercel eso es efímero. Es el mismo vacío que
// tenía el CRM antes de `CrmWebhookEvent` (v4.702), y se resuelve igual:
// una fila por envío, con su motivo cuando falla.
//
// Esta fase NO cambia lo que recibe el aportante. Registra lo que ya se
// envía. El correo se sigue componiendo y mandando exactamente igual.
// ════════════════════════════════════════════════════════════════════

/* ─── LOS EVENTOS ────────────────────────────────────────────────────
 *
 * Catálogo CERRADO, y cada entrada DECLARA de dónde sale. `available`
 * distingue lo que la plataforma puede observar hoy de lo que necesitaría
 * trabajo nuevo — misma honestidad que los motores con `available:false` del
 * Generador de Publicaciones. Un evento que no se puede observar y se ofrece
 * igual en la pantalla es una casilla que no hace nada (v4.650).
 *
 * `source` no es decorativo: es la respuesta a «¿por qué este aporte no
 * disparó nada?» sin tener que leer el código.
 */
export const NOTIFICATION_EVENTS = [
    {
        id: 'payment_confirmed',
        label: 'Pago confirmado',
        help: 'Stripe confirmó el cobro. Es el único momento en que se puede afirmar que el aporte se recibió.',
        source: 'checkout.session.completed',
        available: true,
    },
    {
        id: 'in_transit',
        label: 'Fondos en tránsito',
        help: 'Stripe retiene el dinero hasta su fecha de liberación. Ya se mide (availableOn), todavía no se notifica.',
        source: 'balance_transaction.available_on',
        available: false,
    },
    {
        id: 'refunded',
        label: 'Aporte reembolsado',
        help: 'Necesita enrutar charge.refunded hacia donaciones: hoy sólo llega a la Feria de Proyectos y a las inscripciones de evento.',
        source: 'charge.refunded',
        available: false,
    },
    {
        id: 'failed',
        label: 'Pago fallido',
        help: 'Necesita suscribir payment_intent.payment_failed en el webhook de Stripe.',
        source: 'payment_intent.payment_failed',
        available: false,
    },
];

export const EVENT_IDS = NOTIFICATION_EVENTS.map(e => e.id);
export const eventById = (id) => NOTIFICATION_EVENTS.find(e => e.id === id) || null;
export const isKnownEvent = (id) => EVENT_IDS.includes(id);
/** Los que la plataforma puede observar HOY. Lo demás no se ofrece. */
export const availableEvents = () => NOTIFICATION_EVENTS.filter(e => e.available);

/* ─── A QUIÉN SE LE ESCRIBE ──────────────────────────────────────────
 *
 * También cerrado. El tipo no es el correo: es el PAPEL de quien lo recibe,
 * y es lo que permite decir «al aportante sí, al sitio no» sin enumerar
 * direcciones. Las direcciones concretas las resuelve la fase siguiente.
 */
export const RECIPIENT_KINDS = [
    { id: 'donor', label: 'Aportante', help: 'La persona que hizo el aporte.' },
    { id: 'beneficiary', label: 'Entidad beneficiaria', help: 'La organización que gestiona lo recaudado.' },
    { id: 'site', label: 'Administrador del sitio', help: 'El sitio desde el que se originó el aporte.' },
    { id: 'campaign', label: 'Responsable de campaña', help: 'Quien responde por esa campaña en concreto.' },
];

export const RECIPIENT_IDS = RECIPIENT_KINDS.map(r => r.id);
export const isKnownRecipientKind = (id) => RECIPIENT_IDS.includes(id);

/* ─── LOS ESTADOS DE UNA ENTREGA ─────────────────────────────────────
 *
 * Dos familias, y la diferencia importa:
 *
 *   · PROGRESO  (pending → sent → delivered → opened) — avanza y no retrocede.
 *   · FALLO     (bounced, failed, blocked) — termina el camino.
 *
 * `unknown` NO existe como estado: acá siempre sabemos si intentamos enviar.
 * Lo que puede faltar es la confirmación del proveedor, y eso es `sent`.
 */
export const DELIVERY_STATES = [
    { id: 'pending', label: 'Pendiente', kind: 'progress', help: 'Se registró la intención; todavía no salió.' },
    { id: 'sent', label: 'Enviado', kind: 'progress', help: 'El proveedor lo aceptó. Todavía no confirmó la entrega.' },
    { id: 'delivered', label: 'Entregado', kind: 'progress', help: 'El servidor del destinatario lo aceptó.' },
    { id: 'opened', label: 'Abierto', kind: 'progress', help: 'Se abrió el correo. No todos los clientes lo reportan.' },
    { id: 'bounced', label: 'Rebotado', kind: 'failure', help: 'La dirección rechazó el correo.' },
    { id: 'failed', label: 'Fallido', kind: 'failure', help: 'No se pudo enviar. El motivo queda escrito.' },
    { id: 'blocked', label: 'Bloqueado', kind: 'failure', help: 'No se intentó: baja, queja previa o dirección inválida.' },
];

export const DELIVERY_STATE_IDS = DELIVERY_STATES.map(s => s.id);
export const deliveryStateById = (id) => DELIVERY_STATES.find(s => s.id === id) || null;
export const isKnownDeliveryState = (id) => DELIVERY_STATE_IDS.includes(id);
export const isFailureState = (id) => deliveryStateById(id)?.kind === 'failure';

/** El orden del carril de PROGRESO. Sólo tiene sentido dentro de esa familia:
 *  un fallo no es «más avanzado» que un envío, es otra cosa. */
const PROGRESS_RANK = { pending: 0, sent: 1, delivered: 2, opened: 3 };

/** Los dos que DEMUESTRAN que el correo llegó. Se usan abajo. */
const PROBADA_LA_ENTREGA = new Set(['delivered', 'opened']);

/**
 * Con qué estado se queda una entrega cuando llega un evento nuevo.
 *
 * ── LOS EVENTOS DEL PROVEEDOR LLEGAN DESORDENADOS ────────────────
 *
 * Resend entrega por webhook y no garantiza el orden: es normal recibir
 * `delivered` DESPUÉS de `opened`, porque son dos peticiones HTTP distintas
 * compitiendo. Si el último que llega pisara al anterior, una entrega abierta
 * volvería a «Entregado» y la pantalla contaría mal las aperturas. Por eso el
 * progreso sólo avanza.
 *
 * ── UN FALLO GANA, SALVO CONTRA LA ENTREGA PROBADA ───────────────
 *
 * Un rebote después de un `sent` es la corrección de lo que creíamos; manda.
 * Un rebote después de un `opened` es una CONTRADICCIÓN —nadie abre un correo
 * que rebotó— y ahí se conserva la evidencia más fuerte, que es la apertura.
 * Dejar ganar al fallo pintaría de rojo una entrega que el destinatario
 * demostró haber leído.
 *
 * Un estado desconocido no cambia nada: es dato de un tercero y no se
 * inventa una traducción.
 */
export const mergeDeliveryState = (actual, entrante) => {
    if (!isKnownDeliveryState(entrante)) return isKnownDeliveryState(actual) ? actual : 'pending';
    if (!isKnownDeliveryState(actual)) return entrante;
    if (actual === entrante) return actual;

    if (isFailureState(entrante)) {
        return PROBADA_LA_ENTREGA.has(actual) ? actual : entrante;
    }
    // El entrante es de progreso. Contra un fallo ya escrito no retrocede:
    // que el proveedor mande un `sent` tardío no deshace un rebote.
    if (isFailureState(actual)) return actual;
    return PROGRESS_RANK[entrante] > PROGRESS_RANK[actual] ? entrante : actual;
};

/* ─── LA LLAVE DE IDEMPOTENCIA ───────────────────────────────────────
 *
 * `contribution + evento + destinatario`, que es lo que pide el criterio 15
 * del pedido. Se normaliza acá y no en el SQL porque de acá sale el índice
 * único: si la llave se construyera distinto en dos sitios, el índice dejaría
 * pasar el duplicado que existe para impedir.
 *
 * El correo va en minúsculas y sin espacios: `Ana@Club.org` y `ana@club.org`
 * son la misma persona, y con dos llaves distintas recibiría el mismo aviso
 * dos veces — que es exactamente lo que no puede pasar en un correo que dice
 * «recibimos tu aporte».
 */
export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

export const deliveryKey = ({ contributionId, event, recipient }) => {
    const c = String(contributionId ?? '').trim();
    const e = String(event ?? '').trim();
    const r = normalizeEmail(recipient);
    if (!c || !e || !r) return null;
    return `${c}::${e}::${r}`;
};

/* ─── LOS REINTENTOS ─────────────────────────────────────────────────
 *
 * Se reintenta lo TEMPORAL y no lo definitivo. Un rebote duro o una dirección
 * bloqueada no mejoran por insistir: reintentarlos es mandar correo a una
 * dirección que ya dijo que no, y en volumen eso es lo que arruina la
 * reputación del dominio desde el que envía toda la plataforma.
 *
 * `retryable` es lo que declara el que registra el fallo. Ante la duda, NO se
 * reintenta: un aviso que no sale se ve y se puede reenviar a mano; uno que
 * sale cinco veces ya salió.
 */
export const MAX_RETRIES = 3;

export const canRetry = ({ state, retryCount = 0, retryable = false }) => {
    if (!isFailureState(state)) return false;
    if (state === 'bounced' || state === 'blocked') return false;
    if (!retryable) return false;
    return Number(retryCount) < MAX_RETRIES;
};

/** Espera antes del siguiente intento, en minutos. Creciente: un proveedor que
 *  acaba de rechazar por saturación necesita tiempo, no otro intento en el
 *  acto. El primer reintento va rápido porque el fallo más común —un tiempo
 *  agotado suelto— se resuelve solo. */
export const RETRY_DELAYS_MIN = [2, 15, 60];
export const nextRetryDelay = (retryCount = 0) =>
    RETRY_DELAYS_MIN[Math.min(Math.max(0, Number(retryCount) || 0), RETRY_DELAYS_MIN.length - 1)];

/* ─── QUÉ SE GUARDA DE UN ENVÍO ──────────────────────────────────────
 *
 * La forma de la fila, normalizada en un solo sitio. Todo lo que llega de
 * afuera pasa por acá: el `provider_message_id` lo da Resend, el motivo del
 * error puede venir de cualquier proveedor, y ninguno de los dos se guarda en
 * crudo sin acotar — una respuesta de error puede traer el cuerpo entero.
 */
export const ERROR_MAX_CHARS = 500;
export const SUBJECT_MAX_CHARS = 300;

const recorta = (v, max) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : null;
};

/**
 * Normaliza lo que se va a registrar de un envío.
 *
 * Devuelve `null` cuando falta lo que hace identificable la fila —la
 * contribución, el evento o el destinatario—. Registrar una entrega que no se
 * puede atar a nada es peor que no registrarla: ocupa sitio en la ficha y no
 * contesta ninguna pregunta.
 */
export const normalizeDelivery = (raw) => {
    const d = raw && typeof raw === 'object' ? raw : {};
    const key = deliveryKey({
        contributionId: d.contributionId,
        event: d.event,
        recipient: d.recipient,
    });
    if (!key) return null;
    if (!isKnownEvent(d.event)) return null;

    const state = isKnownDeliveryState(d.state) ? d.state : 'pending';
    return {
        key,
        contributionId: String(d.contributionId).trim(),
        event: d.event,
        recipient: normalizeEmail(d.recipient),
        recipientKind: isKnownRecipientKind(d.recipientKind) ? d.recipientKind : 'donor',
        state,
        // El contexto que hace útil la ficha. Todo opcional: en la Fase 0 hay
        // aporte, sitio y campaña, y todavía no hay perfil ni beneficiario —
        // se llenan cuando existan, sin migrar nada.
        clubId: recorta(d.clubId, 64),
        campaignId: recorta(d.campaignId, 64),
        beneficiaryId: recorta(d.beneficiaryId, 64),
        profileId: recorta(d.profileId, 64),
        templateVersion: Number.isFinite(Number(d.templateVersion)) ? Number(d.templateVersion) : null,
        provider: recorta(d.provider, 40) || 'resend',
        fromAddress: d.fromAddress ? normalizeEmail(d.fromAddress) : null,
        subject: recorta(d.subject, SUBJECT_MAX_CHARS),
        providerMessageId: recorta(d.providerMessageId, 200),
        // El motivo del fallo se recorta pero NUNCA se resume ni se traduce:
        // el error del proveedor se propaga textual, que es la regla del sitio
        // desde el CRM. Convertirlo en «no se pudo enviar» deja a quien
        // corrige sin saber qué.
        errorCode: recorta(d.errorCode, 80),
        errorMessage: recorta(d.errorMessage, ERROR_MAX_CHARS),
        retryable: !!d.retryable,
        retryCount: Math.max(0, Number(d.retryCount) || 0),
        sentAt: state === 'pending' ? null : (d.sentAt || null),
    };
};

/* ─── CÓMO SE CUENTA LO OCURRIDO ─────────────────────────────────────
 *
 * El resumen que pinta la ficha del aporte. Se calcula acá para que la
 * pantalla no tenga su propia idea de qué significa «le llegó»: con dos
 * criterios, la Bóveda diría una cosa y el panel de notificaciones otra.
 */
export const summarizeDeliveries = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const porEstado = {};
    for (const r of list) {
        const s = isKnownDeliveryState(r?.state) ? r.state : 'pending';
        porEstado[s] = (porEstado[s] || 0) + 1;
    }
    const fallidas = list.filter(r => isFailureState(r?.state));
    // «Le llegó» es `delivered` u `opened`. `sent` NO cuenta: significa que el
    // proveedor lo aceptó, que es otra cosa y es justo la distinción que hace
    // falta cuando alguien dice que no recibió nada.
    const entregadas = list.filter(r => PROBADA_LA_ENTREGA.has(r?.state));
    return {
        total: list.length,
        porEstado,
        entregadas: entregadas.length,
        fallidas: fallidas.length,
        // Sin ninguna fila la respuesta no es «no le llegó»: es que no se
        // registró nada. Son cosas distintas y confundirlas manda a buscar el
        // problema donde no está — la regla de `unknown` en el CRM.
        sinRegistro: list.length === 0,
    };
};

export default {
    NOTIFICATION_EVENTS, EVENT_IDS, eventById, isKnownEvent, availableEvents,
    RECIPIENT_KINDS, RECIPIENT_IDS, isKnownRecipientKind,
    DELIVERY_STATES, DELIVERY_STATE_IDS, deliveryStateById, isKnownDeliveryState,
    isFailureState, mergeDeliveryState,
    normalizeEmail, deliveryKey,
    MAX_RETRIES, canRetry, RETRY_DELAYS_MIN, nextRetryDelay,
    normalizeDelivery, summarizeDeliveries,
};
