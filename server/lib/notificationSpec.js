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
//
// El ALCANCE de un perfil se resuelve con `targetsSite` de
// `contributionSpec.js`, no con un criterio propio: ya trata `Club.district`
// como una LISTA (v4.748) y ya está probado. Con dos criterios, un perfil
// podría alcanzar a un sitio que la campaña no alcanza, y el correo hablaría
// de una campaña que ese sitio no muestra.
import { targetsSite } from './contributionSpec.js';

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

/* ════════════════════════════════════════════════════════════════════
   FASE 1 — LA ENTIDAD BENEFICIARIA Y EL PERFIL
   ════════════════════════════════════════════════════════════════════ */

/* ─── EL BENEFICIARIO ────────────────────────────────────────────────
 *
 * La organización que gestiona lo recaudado: Colrotarios es el primer caso, y
 * la forma es genérica a propósito — un distrito, una fundación o un programa
 * entran igual sin tocar código.
 *
 * ── NO LLEVA CUENTAS BANCARIAS, Y NO ES UN OLVIDO ────────────────
 *
 * El dinero entra a la cuenta Stripe de la plataforma y se liquida por la
 * Bóveda. Poner acá datos de recaudo crearía una SEGUNDA VERDAD sobre a dónde
 * va el dinero, y sería falsa: nadie transfiere a esa cuenta. Cuando alguna
 * campaña necesite cobrar a otra cuenta, eso se resuelve en el cobro, no en la
 * identidad del correo.
 */
export const beneficiaryShape = (raw) => {
    const b = raw && typeof raw === 'object' ? raw : {};
    const legalName = recorta(b.legalName, 200);
    if (!legalName) return null; // sin nombre legal no hay entidad que nombrar
    return {
        legalName,
        // El nombre COMERCIAL es el que firma el correo: «Colrotarios» se lee
        // y «Fundación Colombiana de Rotarios» es lo que va en el pie legal.
        // Si no se declara, se usa el legal — nunca queda vacío.
        tradeName: recorta(b.tradeName, 200) || legalName,
        taxId: recorta(b.taxId, 60),
        logoUrl: recorta(b.logoUrl, 600),
        email: b.email ? normalizeEmail(b.email) : null,
        website: recorta(b.website, 300),
        phone: recorta(b.phone, 60),
        address: recorta(b.address, 400),
        contactName: recorta(b.contactName, 200),
        notes: recorta(b.notes, 1000),
    };
};

/* ─── LA IDENTIDAD DEL REMITENTE ─────────────────────────────────────
 *
 * Lo que ve el aportante en su bandeja. `fromName` y `replyTo` son cosas
 * distintas y la diferencia importa: el nombre visible representa a la ENTIDAD
 * («Fundación Colombiana de Rotarios») y el reply-to es a dónde contesta la
 * gente, que puede ser otra dirección y otro equipo.
 *
 * La DIRECCIÓN de envío NO se declara acá: la resuelve el servidor con el
 * sitio de origen y el estado de verificación del dominio (Fase 2). Dejarla
 * escribir a mano permitiría firmar desde un dominio ajeno, que es
 * exactamente lo que el criterio 23 del pedido prohíbe.
 */
export const identityShape = (raw) => {
    const i = raw && typeof raw === 'object' ? raw : {};
    return {
        fromName: recorta(i.fromName, 120),
        replyTo: i.replyTo ? normalizeEmail(i.replyTo) : null,
        logoUrl: recorta(i.logoUrl, 600),
        signature: recorta(i.signature, 300),
        primaryColor: hexOrNull(i.primaryColor),
        ctaColor: hexOrNull(i.ctaColor),
        footer: recorta(i.footer, 1000),
        legalText: recorta(i.legalText, 1000),
    };
};

/** Un color sólo puede ser un hexadecimal. Termina dentro de un atributo
 *  `style` de un correo: cualquier otra cosa es una vía de inyección, y además
 *  un valor inválido rompe el bloque entero en algunos clientes. */
export const hexOrNull = (v) => {
    const s = String(v ?? '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : null;
};

/* ─── EL ENRUTAMIENTO DEL REMITENTE ──────────────────────────────────
 *
 * Qué dominio se prefiere. La jerarquía real —y la comprobación de que el
 * dominio esté verificado— vive en la Fase 2; acá se declara la PREFERENCIA.
 *
 * `allowSiteDomain: false` es la salida para una entidad que quiere firmar
 * siempre desde lo central aunque el sitio tenga su dominio verificado. Es una
 * decisión institucional, no técnica.
 */
export const PREFERRED_SENDERS = ['site', 'central'];

export const routingShape = (raw) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        prefer: PREFERRED_SENDERS.includes(r.prefer) ? r.prefer : 'site',
        allowSiteDomain: r.allowSiteDomain !== false,
        // Buzón preferido dentro del dominio que se elija («aportes», «hola»).
        // Sólo la parte local: el dominio lo pone el resolutor.
        localPart: recorta(r.localPart, 60),
    };
};

/* ─── QUÉ EVENTOS NOTIFICAN, Y A QUIÉN ───────────────────────────────
 *
 * NO se manda todo por defecto (criterio 12 del pedido). Un perfil recién
 * creado avisa al aportante de su pago confirmado y a nadie más: es lo mínimo
 * que hace útil el módulo y lo único que nadie discutiría.
 *
 * Un evento que la plataforma todavía no puede observar se DESCARTA aunque
 * venga marcado: encenderlo daría una casilla que no dispara nunca.
 */
export const defaultEventRules = () => ({
    payment_confirmed: { donor: true, beneficiary: false, site: false, campaign: false },
});

export const eventRulesShape = (raw) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const ev of availableEvents()) {
        const fila = r[ev.id] && typeof r[ev.id] === 'object' ? r[ev.id] : {};
        out[ev.id] = {};
        for (const k of RECIPIENT_IDS) out[ev.id][k] = fila[k] === true;
    }
    return out;
};

/** Los papeles que este perfil va a notificar para un evento dado. */
export const recipientsFor = (profile, event) => {
    const fila = profile?.events?.[event];
    if (!fila) return [];
    return RECIPIENT_IDS.filter(k => fila[k] === true);
};

/* ─── EL PERFIL ──────────────────────────────────────────────────────
 *
 * `targeting` NO se define acá: se reutiliza el de `contributionSpec.js`. Ya
 * resuelve «todos / por distrito / sitios específicos», ya trata `Club.district`
 * como una LISTA (v4.748) y ya está probado. Un segundo criterio de alcance se
 * separaría en silencio del que decide qué campaña ve un sitio, y entonces un
 * perfil podría alcanzar a un sitio que la campaña no alcanza.
 */
export const profileShape = (raw) => {
    const p = raw && typeof raw === 'object' ? raw : {};
    const name = recorta(p.name, 200);
    if (!name) return null;
    return {
        name,
        active: p.active !== false,
        // Un perfil GLOBAL es el último recurso de la resolución. Es lo que
        // impide que un aporte se quede sin notificación por no tener perfil
        // (criterio 19 del pedido).
        isDefault: p.isDefault === true,
        priority: Number.isFinite(Number(p.priority)) ? Math.trunc(Number(p.priority)) : 0,
        beneficiaryId: recorta(p.beneficiaryId, 64),
        identity: identityShape(p.identity),
        routing: routingShape(p.routing),
        events: eventRulesShape(p.events),
        internalRecipients: emailList(p.internalRecipients),
        notes: recorta(p.notes, 1000),
    };
};

/** Una lista de correos, sin repetidos y sin basura. Acotada a propósito: una
 *  notificación interna con cincuenta destinatarios es una lista de correo, y
 *  eso se administra en otra parte. */
export const INTERNAL_RECIPIENTS_MAX = 10;

export const emailList = (raw) => {
    const items = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,;\n]/);
    const vistos = new Set();
    const out = [];
    for (const x of items) {
        const e = normalizeEmail(x);
        // Comprobación deliberadamente simple: acá no se valida una dirección,
        // se descarta lo que evidentemente no lo es. Quien decide de verdad es
        // el proveedor al intentar entregarlo.
        if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || vistos.has(e)) continue;
        vistos.add(e);
        out.push(e);
        if (out.length >= INTERNAL_RECIPIENTS_MAX) break;
    }
    return out;
};

/* ─── LA RESOLUCIÓN ──────────────────────────────────────────────────
 *
 * De lo más específico a lo más general, y NUNCA en silencio: devuelve
 * también CÓMO se eligió, que es lo que contesta «¿por qué este aporte salió
 * firmado así?» dos semanas después.
 *
 *   1. el perfil que la CAMPAÑA eligió expresamente
 *   2. el perfil cuyo alcance cubre al SITIO, mayor prioridad
 *   3. el perfil marcado como global
 *   4. nada — y entonces sale el recibo de siempre
 *
 * El paso 4 es deliberado: una contribución no se queda sin notificación
 * porque falte una personalización (criterio 19).
 */
export const pickProfileFor = ({ profiles, site, campaign = null }) => {
    const vivos = (Array.isArray(profiles) ? profiles : []).filter(p => p && p.active !== false);
    if (!vivos.length) return { profile: null, reason: 'no hay ningún perfil activo' };

    if (campaign?.notificationProfileId) {
        const elegido = vivos.find(p => String(p.id) === String(campaign.notificationProfileId));
        if (elegido) return { profile: elegido, reason: 'elegido en la campaña' };
        // Que la campaña apunte a un perfil apagado o borrado NO puede dejar
        // el aporte sin aviso: se sigue bajando por la jerarquía y se DICE.
    }

    const delSitio = vivos
        .filter(p => !p.isDefault && targetsSite(p.targeting, site))
        .sort(ordenDePerfiles);
    if (delSitio.length) return { profile: delSitio[0], reason: 'alcanza a este sitio' };

    const global = vivos.filter(p => p.isDefault).sort(ordenDePerfiles);
    if (global.length) return { profile: global[0], reason: 'perfil global' };

    return { profile: null, reason: 'ningún perfil alcanza a este sitio' };
};

/** Prioridad explícita, y desempates ESTABLES. Si dependiera del orden en que
 *  la base devuelve las filas, el mismo sitio firmaría distinto en dos aportes
 *  seguidos — la lección de `pickDistrictSite` y de `pickCampaignForSite`. */
const ordenDePerfiles = (a, b) =>
    (Number(b.priority) || 0) - (Number(a.priority) || 0)
    || new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    || String(a.id).localeCompare(String(b.id));

/* ─── QUÉ FALTA PARA QUE UN PERFIL SIRVA ─────────────────────────────
 *
 * Se separa en `errors` —no se puede usar— y `warnings` —se puede, y hay que
 * decirlo—. Tratarlos igual convierte cualquier aviso en un bloqueo y se dejan
 * de leer, que es la lección de `validateBeforeGenerate` en las Infografías.
 */
export const validateProfile = (profile, { beneficiary = null } = {}) => {
    const errors = [];
    const warnings = [];
    if (!profile) return { ok: false, errors: ['El perfil no existe.'], warnings };

    if (!profile.identity?.fromName) {
        errors.push('Falta el nombre visible del remitente: es lo que el aportante ve en su bandeja.');
    }
    if (!profile.beneficiaryId) {
        errors.push('Falta la entidad beneficiaria: el correo tiene que decir quién gestiona el aporte.');
    } else if (beneficiary === null) {
        errors.push('La entidad beneficiaria del perfil ya no existe.');
    }
    const conAviso = Object.values(profile.events || {}).some(f => Object.values(f || {}).some(Boolean));
    if (!conAviso) {
        errors.push('Este perfil no notifica a nadie: hay que marcar al menos un destinatario.');
    }

    const necesitaInternos = Object.values(profile.events || {})
        .some(f => f?.beneficiary === true || f?.campaign === true);
    if (necesitaInternos && !profile.internalRecipients?.length && !beneficiary?.email) {
        warnings.push('Se marcó avisar a la entidad, pero no hay ninguna dirección interna ni correo del beneficiario: ese aviso no va a salir.');
    }
    if (!profile.identity?.replyTo) {
        warnings.push('Sin dirección de respuesta, quien conteste el correo escribirá a un buzón que nadie lee.');
    }
    if (!profile.identity?.logoUrl && !beneficiary?.logoUrl) {
        warnings.push('Sin logotipo, el correo sale sin la identidad de la entidad.');
    }
    return { ok: errors.length === 0, errors, warnings };
};

/* ════════════════════════════════════════════════════════════════════
   FASE 2 — LA JERARQUÍA DEL REMITENTE
   ════════════════════════════════════════════════════════════════════ */

/** El dominio central de la plataforma. Configurable porque la instalación
 *  puede no ser ésta, y porque si algún día deja de estar verificado en el
 *  proveedor hay que poder apuntar a otro sin desplegar. */
export const centralDomain = () =>
    normalizeDomain(process.env.NOTIFICATION_CENTRAL_DOMAIN) || 'clubplatform.org';

/** El último recurso. Es la dirección con la que sale el recibo desde v4.411 y
 *  la que se conserva cuando nada más se puede usar. */
export const fallbackSender = () =>
    normalizeEmail(process.env.NOTIFICATION_FALLBACK_FROM) || 'noreply@clubplatform.org';

/** El buzón por omisión dentro del dominio que se elija. */
export const DEFAULT_LOCAL_PART = 'aportes';

/**
 * El dominio, en su forma canónica.
 *
 * Se quita el `www.` porque el proveedor verifica el APEX, no el subdominio —
 * es lo mismo que hace `EmailService.normalizeSenderEmail` desde siempre, y si
 * las dos formas no se redujeran a la misma, un dominio verificado no se
 * reconocería y el correo caería al respaldo sin motivo.
 */
export const normalizeDomain = (raw) => {
    let s = String(raw ?? '').trim().toLowerCase();
    if (!s) return '';
    // Se admite una URL entera: el administrador pega lo que copió del
    // navegador. Misma cortesía que `linkRedirects` con el destino.
    s = s.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
    s = s.replace(/^www\./, '').replace(/\.$/, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : '';
};

/** La parte local de una dirección, acotada a lo que un buzón admite. */
export const normalizeLocalPart = (raw) => {
    const s = String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return s.slice(0, 40);
};

/**
 * Desde qué dirección sale este correo.
 *
 * ── LA REGLA QUE NO SE NEGOCIA ──────────────────────────────────
 *
 * NUNCA se intenta enviar desde un dominio sin verificar. Hasta hoy
 * `EmailService.sendEmail` sí lo intentaba —le bastaba que existiera una fila
 * en `EmailAccount`— y descubría el problema por el rechazo del proveedor. Eso
 * es un correo perdido por intento, y en volumen es lo que hunde la reputación
 * del dominio desde el que envía TODA la plataforma.
 *
 * ── LA JERARQUÍA ────────────────────────────────────────────────
 *
 *   N1  el dominio propio del sitio, si está VERIFICADO y el perfil lo permite
 *   N2  el dominio central de la plataforma, si está verificado
 *   N3  la identidad de respaldo
 *
 * Es PURA: recibe el conjunto de dominios verificados en vez de consultarlo.
 * Consultar al proveedor por dentro la haría imposible de probar y metería una
 * llamada de red dentro del webhook de Stripe.
 *
 * Devuelve también el NIVEL y el MOTIVO: sin eso, «¿por qué este correo salió
 * desde clubplatform.org y no desde rotary4281.org?» no se puede contestar.
 */
export const resolveSenderPlan = ({
    profile = null,
    siteDomain = '',
    verifiedDomains = [],
    displayName = '',
    replyTo = '',
} = {}) => {
    const verificados = new Set(
        (Array.isArray(verifiedDomains) ? verifiedDomains : []).map(normalizeDomain).filter(Boolean)
    );
    const routing = routingShape(profile?.routing);
    const local = normalizeLocalPart(routing.localPart) || DEFAULT_LOCAL_PART;
    const nombre = String(displayName || profile?.identity?.fromName || '').trim();
    const responder = normalizeEmail(replyTo || profile?.identity?.replyTo || '') || null;

    const sitio = normalizeDomain(siteDomain);
    const central = centralDomain();

    const arma = (address, level, reason, domain) => ({
        address, level, reason, domain,
        // El nombre visible se escapa de comillas: va dentro de
        // `"Nombre" <dir>` y una comilla partiría la cabecera.
        from: nombre ? `"${nombre.replace(/"/g, '')}" <${address}>` : address,
        replyTo: responder,
    });

    if (routing.prefer === 'site' && routing.allowSiteDomain && sitio && verificados.has(sitio)) {
        return arma(`${local}@${sitio}`, 1, 'el dominio propio del sitio está verificado', sitio);
    }
    if (verificados.has(central)) {
        // Por qué NO se usó el del sitio: es la mitad del diagnóstico. «No está
        // verificado» y «el perfil no lo permite» se corrigen en sitios
        // distintos.
        const motivo = !routing.allowSiteDomain || routing.prefer !== 'site'
            ? 'el perfil pide el dominio central'
            : !sitio
                ? 'el sitio no tiene dominio propio configurado'
                : 'el dominio del sitio no está verificado en el proveedor';
        return arma(`${local}@${central}`, 2, motivo, central);
    }
    return arma(fallbackSender(), 3, 'no hay ningún dominio verificado disponible', normalizeDomain(fallbackSender().split('@')[1]));
};

/**
 * A qué direcciones se le escribe, por papel.
 *
 * Devuelve también los papeles que se PIDIERON y no se pudieron resolver, con
 * su motivo: un aviso marcado que no sale y no lo dice es exactamente el
 * silencio que este módulo existe para no tener.
 */
export const resolveRecipients = ({ profile, event, donorEmail = '', beneficiary = null, siteEmail = '' }) => {
    const papeles = recipientsFor(profile, event);
    const out = [];
    const skipped = [];

    for (const papel of papeles) {
        if (papel === 'donor') {
            const e = normalizeEmail(donorEmail);
            if (e) out.push({ kind: 'donor', email: e });
            else skipped.push({ kind: 'donor', reason: 'el aporte no trae correo de quien aportó' });
            continue;
        }
        if (papel === 'beneficiary') {
            // Las direcciones internas del perfil y el correo de la entidad son
            // dos cosas: la primera es a quién avisar en la operación, la
            // segunda el buzón institucional. Se juntan sin repetir.
            const lista = emailList([...(profile?.internalRecipients || []), beneficiary?.email || '']);
            if (lista.length) lista.forEach(e => out.push({ kind: 'beneficiary', email: e }));
            else skipped.push({ kind: 'beneficiary', reason: 'ni el perfil ni la entidad tienen una dirección' });
            continue;
        }
        if (papel === 'site') {
            const e = normalizeEmail(siteEmail);
            if (e) out.push({ kind: 'site', email: e });
            else skipped.push({ kind: 'site', reason: 'el sitio no tiene correo configurado' });
            continue;
        }
        if (papel === 'campaign') {
            // La plataforma NO guarda todavía un responsable por campaña. Se
            // dice así en vez de mandarlo a otra parte: un aviso que llega al
            // buzón equivocado es peor que uno que no llega.
            skipped.push({ kind: 'campaign', reason: 'una campaña todavía no declara responsable; usá las direcciones internas del perfil' });
        }
    }
    // Sin repetir: la misma persona puede ser dirección interna y correo del
    // sitio, y recibiría dos veces el mismo aviso.
    const vistos = new Set();
    return { recipients: out.filter(r => (vistos.has(r.email) ? false : vistos.add(r.email))), skipped };
};

export default {
    NOTIFICATION_EVENTS, EVENT_IDS, eventById, isKnownEvent, availableEvents,
    RECIPIENT_KINDS, RECIPIENT_IDS, isKnownRecipientKind,
    DELIVERY_STATES, DELIVERY_STATE_IDS, deliveryStateById, isKnownDeliveryState,
    isFailureState, mergeDeliveryState,
    normalizeEmail, deliveryKey,
    MAX_RETRIES, canRetry, RETRY_DELAYS_MIN, nextRetryDelay,
    normalizeDelivery, summarizeDeliveries,
    beneficiaryShape, identityShape, hexOrNull, routingShape, PREFERRED_SENDERS,
    defaultEventRules, eventRulesShape, recipientsFor,
    profileShape, emailList, INTERNAL_RECIPIENTS_MAX,
    pickProfileFor, validateProfile,
    centralDomain, fallbackSender, DEFAULT_LOCAL_PART,
    normalizeDomain, normalizeLocalPart, resolveSenderPlan, resolveRecipients,
};
