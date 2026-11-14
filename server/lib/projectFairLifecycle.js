// ════════════════════════════════════════════════════════════════════
// El ciclo de vida de una postulación a la Feria de Proyectos — EL CRITERIO
// v4.1253.0
//
// PURO: sin base, sin red, sin Stripe, sin DOM. Responde dos preguntas que
// hasta v4.1252 vivían mezcladas en la misma columna:
//
//   1. ¿En qué va el PROYECTO?  → `workflowStatus` (Borrador, Postulado, En
//      revisión, Aprobado…). Lo mueven el club y el comité.
//   2. ¿En qué va el PAGO?      → `status` (pendiente, pagado, fallido,
//      reembolsado). Lo mueve la pasarela.
//
// ⚠️ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA NO REPETIR. Hasta v4.1252 el
// webhook de Stripe ESCRIBÍA en el estado del proyecto: un pago rechazado
// dejaba el proyecto en «Pago fallido», una sesión caducada en «Pendiente de
// pago», y un pago confirmado en «Pago confirmado» — pisando lo que el comité
// hubiera decidido. Y el wizard terminaba en «Confirmar y continuar al pago»,
// así que un club que no tenía con qué pagar ese día se iba sin la
// confirmación de que su proyecto SÍ había quedado postulado. Pedido del
// cliente: la postulación NO requiere un pago previo; el pago es una acción
// posterior e independiente.
//
// «Proyecto: Postulado · Pago: Pendiente» es una combinación VÁLIDA.
// «Proyecto: En revisión · Pago: Confirmado» también. Ninguno de los dos
// estados se deduce del otro.
// ════════════════════════════════════════════════════════════════════

// La única regla de «¿está pagado?» del módulo. Importarla —y no escribir
// `status === 'paid'` otra vez— es lo que impide dos criterios del cobro.
import { hasConfirmedPayment } from './projectFairPayment.js';
// v4.1330 — La edición después del cierre: criterio GENÉRICO de la plataforma.
// Acá sólo vive lo propio de la Feria (sus estados y sus campos sensibles).
import { normalizePostClosePolicy, postCloseVerdict, isPastDeadline, formatDateEs } from './postCloseEditPolicy.js';

/**
 * Estados del PROYECTO. Catálogo cerrado. `applied` dice si la postulación ya
 * se envió formalmente; `legacy` marca los que se siguen leyendo pero ya no se
 * ofrecen al elegir.
 */
export const PROJECT_STATES = [
    { key: 'draft', label: 'Borrador', color: 'slate', applied: false },
    { key: 'formulating', label: 'En formulación', color: 'sky', applied: false },
    { key: 'received', label: 'Postulado', color: 'blue', applied: true },
    { key: 'in_review', label: 'En revisión', color: 'indigo', applied: true },
    { key: 'needs_changes', label: 'Requiere ajustes', color: 'amber', applied: true },
    { key: 'approved', label: 'Aprobado', color: 'emerald', applied: true },
    { key: 'rejected', label: 'Rechazado', color: 'red', applied: true },
    { key: 'withdrawn', label: 'Retirado', color: 'slate', applied: true },
    { key: 'sent_to_grants', label: 'Enviado a Rotary Grants', color: 'violet', applied: true },
    { key: 'closed', label: 'Cerrado', color: 'slate', applied: true },
];
export const PROJECT_STATE_KEYS = PROJECT_STATES.map(s => s.key);

/**
 * ⚠️ LOS VALORES DE PAGO QUE SE COLARON EN EL ESTADO DEL PROYECTO. Hasta
 * v4.1252 `workflowStatus` aceptaba `pending_payment`, `payment_confirmed`,
 * `payment_failed` y `refunded`: eran el pago escrito en el lugar del
 * proyecto. Todos corresponden a una postulación que el club YA ENVIÓ —la fila
 * sólo existía si había pulsado «Confirmar y continuar al pago»—, así que su
 * estado de proyecto es «Postulado». Lo que decían del pago no se pierde: está
 * en `status`, que nunca dejó de ser la fuente de verdad del cobro.
 */
export const LEGACY_PAYMENT_WORKFLOW = ['pending_payment', 'payment_confirmed', 'payment_failed', 'refunded'];

/** Estados en los que la postulación todavía NO se ha enviado. */
export const NOT_APPLIED_STATES = PROJECT_STATES.filter(s => !s.applied).map(s => s.key);

/**
 * Estados en los que una postulación enviada NO genera una obligación de
 * pago: quien se retiró o fue rechazado no debe la inscripción. Contarlos
 * como «pendiente de recaudo» inflaría lo que se espera cobrar.
 */
export const NO_OBLIGATION_STATES = ['withdrawn', 'rejected'];

/** Estados del cobro (`status`) que significan «todavía no se ha pagado». */
export const UNPAID_PAYMENT_STATUSES = ['pending_payment', 'failed'];

/**
 * El estado del proyecto, normalizado. Un valor heredado del pago pasa a
 * «Postulado»; vacío —filas anteriores a la columna— es el valor por defecto
 * de la columna, que también es «Postulado». Un valor que no reconocemos se
 * conserva tal cual (lo pudo escribir una versión más nueva) y se trata como
 * postulado: equivocarse hacia ese lado no le quita a nadie su postulación.
 */
export const projectStateOf = (row) => {
    const raw = String(row?.workflowStatus || '').trim();
    if (!raw) return 'received';
    if (LEGACY_PAYMENT_WORKFLOW.includes(raw)) return 'received';
    return raw;
};

export const projectStateMeta = (key) =>
    PROJECT_STATES.find(s => s.key === key) || { key, label: key, color: 'slate', applied: true };

/** ¿La postulación ya se envió formalmente? */
export const isApplied = (row) => !NOT_APPLIED_STATES.includes(projectStateOf(row));

/**
 * ¿Esta postulación es una OBLIGACIÓN de pago válida? Sólo lo es si se envió,
 * no se retiró ni se rechazó, no está archivada y no se ha pagado ni
 * reembolsado. Un borrador NUNCA es deuda: es un club que todavía está
 * escribiendo su proyecto.
 */
export const owesRegistration = (row) =>
    isApplied(row)
    && !NO_OBLIGATION_STATES.includes(projectStateOf(row))
    && !row?.archivedAt
    && UNPAID_PAYMENT_STATUSES.includes(String(row?.status || 'pending_payment'));

// ── Las mismas reglas, en SQL ────────────────────────────────────────
// Se ARMAN desde las listas de arriba —no se escriben a mano— para que el
// tablero y el criterio no puedan separarse: si mañana se agrega un estado a
// `NOT_APPLIED_STATES`, la consulta lo hereda sola. Son literales controlados
// (claves del catálogo), nunca datos de la petición.
const sqlList = (keys) => keys.map(k => `'${String(k).replace(/'/g, "''")}'`).join(',');
const WF = `COALESCE("workflowStatus",'received')`;
export const SQL_APPLIED = `${WF} NOT IN (${sqlList(NOT_APPLIED_STATES)})`;
export const SQL_DRAFT = `${WF} IN (${sqlList(NOT_APPLIED_STATES)})`;
export const SQL_OWES = `(${SQL_APPLIED} AND ${WF} NOT IN (${sqlList(NO_OBLIGATION_STATES)}) AND status IN (${sqlList(UNPAID_PAYMENT_STATUSES)}))`;

// ── El estado del PAGO, para leerlo ──────────────────────────────────
export const PAYMENT_VIEW_STATES = [
    { key: 'pending', label: 'Pendiente', color: 'amber' },
    { key: 'processing', label: 'En proceso', color: 'sky' },
    { key: 'confirmed', label: 'Confirmado', color: 'emerald' },
    { key: 'failed', label: 'Fallido', color: 'red' },
    { key: 'refunded', label: 'Reembolsado', color: 'orange' },
    { key: 'partially_refunded', label: 'Parcialmente reembolsado', color: 'orange' },
];

/**
 * El estado del pago tal como se le explica a una persona. Sale de `status`
 * —que escribe la pasarela— más dos señales: si hay un intento ABIERTO (el
 * club está en el checkout) y si hubo un reembolso parcial, que deja la fila
 * en `paid` con `refundedAmount` escrito.
 */
export const paymentStatusOf = (row, { openAttempt = false } = {}) => {
    const status = String(row?.status || 'pending_payment');
    if (status === 'paid') {
        const refunded = Number(row?.refundedAmount || 0);
        return refunded > 0 ? 'partially_refunded' : 'confirmed';
    }
    if (status === 'refunded') return 'refunded';
    if (openAttempt) return 'processing';
    if (status === 'failed') return 'failed';
    return 'pending';
};

export const paymentStatusLabel = (key) =>
    PAYMENT_VIEW_STATES.find(s => s.key === key)?.label || 'Pendiente';

// ── Los formularios del proyecto ─────────────────────────────────────
/**
 * ¿La convocatoria EXIGE el pago para diligenciar los formularios del
 * proyecto (Formulación, Solicitud del FDD…)?
 *
 * ⚠️ POR DEFECTO, NO (v4.1253). Hasta v4.1252 el bloqueo era fijo: sin pago
 * confirmado no se abría ningún formulario (v4.979). El pedido de v4.1253 es
 * el contrario —«no bloquear proyectos por pagos pendientes»— y dice cómo
 * tratar una exigencia de pago para una etapa posterior: «esa regla debe
 * configurarse expresamente». Así que es un interruptor de la Convocatoria,
 * apagado salvo que alguien lo encienda, y sólo `true` lo enciende: un valor
 * raro no puede volver a encerrar a nadie.
 */
export const formsRequirePayment = (cfg) => cfg?.registration?.requirePaymentForForms === true;

/**
 * ¿Se pueden ABRIR los formularios del proyecto? Dos condiciones:
 *   - que la postulación se haya enviado (un borrador todavía se está
 *     escribiendo en el propio panel, y la Formulación se precarga con él);
 *   - y, SÓLO si la convocatoria lo exige, que el pago esté confirmado.
 */
export const formAccessOf = (row, cfg) => {
    if (!isApplied(row)) {
        return {
            available: false, code: 'not_applied',
            reason: 'Los formularios del proyecto se habilitan cuando envíes tu postulación.',
        };
    }
    if (formsRequirePayment(cfg) && !hasConfirmedPayment(row)) {
        return {
            available: false, code: 'needs_payment',
            reason: 'Tu formulario se habilita cuando se confirme el pago de la inscripción.',
        };
    }
    return { available: true, code: null, reason: null };
};

// ── Fecha límite de pago ─────────────────────────────────────────────
/**
 * La fecha límite de PAGO, si la convocatoria la definió (`AAAA-MM-DD`).
 * Sin ella no se inventa ninguna: el perfil no muestra fecha y los
 * recordatorios no hablan de plazos.
 */
export const paymentDeadlineOf = (cfg) => {
    const v = String(cfg?.registration?.paymentDeadline || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

export const paymentDeadlinePassed = (cfg, now = Date.now()) => {
    const d = paymentDeadlineOf(cfg);
    if (!d) return false;
    const end = new Date(`${d}T23:59:59-05:00`).getTime();
    return Number.isFinite(end) && now > end;
};

// ── Recordatorios de pago ────────────────────────────────────────────
export const REMINDER_DEFAULTS = { minDays: 7, max: 3 };

/**
 * ¿Se le puede mandar un recordatorio de pago a esta postulación?
 *
 * «No enviar recordatorios repetitivos o excesivos»: hay un intervalo mínimo
 * entre dos recordatorios y un tope total por postulación. Y sólo a una
 * obligación válida —un borrador, un proyecto retirado o uno ya pagado no
 * reciben nada—, nunca después de una fecha límite de pago ya vencida.
 *
 * @param {object} row          fila de ProjectFairSubmission
 * @param {Array<string|Date>} sent  fechas de los recordatorios ya enviados
 */
export const reminderVerdict = (row, sent = [], { now = Date.now(), cfg = null, minDays, max } = {}) => {
    const policy = cfg?.notifications?.paymentReminders || {};
    const gap = Number(minDays ?? policy.minDays ?? REMINDER_DEFAULTS.minDays);
    const cap = Number(max ?? policy.max ?? REMINDER_DEFAULTS.max);
    if (policy.enabled === false) return { ok: false, code: 'disabled', reason: 'Los recordatorios de pago están desactivados en la Convocatoria.' };
    if (!row?.email) return { ok: false, code: 'no_email', reason: 'No tiene correo.' };
    if (!owesRegistration(row)) {
        if (!isApplied(row)) return { ok: false, code: 'draft', reason: 'Todavía es un borrador: no debe la inscripción.' };
        if (String(row?.status) === 'paid') return { ok: false, code: 'paid', reason: 'El pago ya está confirmado.' };
        return { ok: false, code: 'no_obligation', reason: 'No tiene un pago pendiente.' };
    }
    if (cfg && paymentDeadlinePassed(cfg, now)) return { ok: false, code: 'deadline', reason: 'La fecha límite de pago ya venció.' };
    const fechas = sent.map(d => new Date(d).getTime()).filter(Number.isFinite).sort((a, b) => b - a);
    if (fechas.length >= cap) return { ok: false, code: 'cap', reason: `Ya recibió ${fechas.length} recordatorio${fechas.length === 1 ? '' : 's'} (máximo ${cap}).` };
    if (fechas.length && now - fechas[0] < gap * 86_400_000) {
        return { ok: false, code: 'too_soon', reason: `Recibió un recordatorio hace menos de ${gap} día${gap === 1 ? '' : 's'}.` };
    }
    return { ok: true, code: null, reason: null };
};

// ════════════════════════════════════════════════════════════════════
// v4.1330 — CREAR y EDITAR son dos reglas distintas
// ════════════════════════════════════════════════════════════════════

/**
 * ¿Recibe la convocatoria postulaciones NUEVAS? Cierra si el comité la apagó
 * (`enabled: false`) o si pasó la fecha límite de postulación. Hasta v4.1329
 * la fecha NO cerraba la creación —sólo la edición de los formularios—, que
 * es justo al revés de la regla del negocio.
 *
 * Lo usan el wizard público (`createSubmission`), el envío de un borrador
 * desde el perfil (`submitApplication`) y la configuración pública, para que
 * la pantalla diga «convocatoria cerrada» ANTES de que el club llene el
 * formulario entero. Las vías administrativas (importación, sustitución) no
 * pasan por acá: son las excepciones autorizadas.
 */
export const applicationsClosedOf = (cfg, now = Date.now()) => {
    if (cfg?.enabled === false) {
        return { closed: true, code: 'disabled', reason: 'La convocatoria no está recibiendo postulaciones en este momento.' };
    }
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(cfg?.deadline || '').trim()) ? String(cfg.deadline).trim() : null;
    if (deadline && isPastDeadline(deadline, now)) {
        return { closed: true, code: 'deadline', deadline, reason: `La convocatoria para nuevas postulaciones finalizó el ${formatDateEs(deadline)}.` };
    }
    return { closed: false, code: null, reason: null };
};

/**
 * La política de fábrica de la Feria para la edición después del cierre.
 * Decisión del cliente (v4.1330): ACTIVADA, sin fecha adicional, para todos
 * los formularios del proyecto, con alcance «todos los campos autorizados».
 *
 * Los ESTADOS son los de `PROJECT_STATES`. «Archivado» no es un estado (es
 * `archivedAt`) y lo resuelve el criterio aparte: no se edita salvo
 * autorización.
 *
 * Los campos SENSIBLES se declaran por ruta y no con `sensitive: true` en las
 * plantillas a propósito: la copia de la plantilla guardada en la
 * convocatoria reemplaza los arrays enteros (la trampa de v4.788), así que una
 * marca escrita en el archivo podría no llegar nunca a producción.
 */
export const FAIR_POST_CLOSE_DEFAULTS = {
    enabled: true,
    validity: 'open',
    until: null,
    forms: [],
    states: {
        draft: 'edit',
        formulating: 'edit',
        received: 'edit',
        needs_changes: 'edit',
        in_review: 'restricted',
        approved: 'authorization',
        rejected: 'authorization',
        withdrawn: 'authorization',
        sent_to_grants: 'authorization',
        closed: 'locked',
    },
    unknownState: 'authorization',
    scope: 'all',
    selectedFields: {},
    sensitiveFields: {
        master: [
            'identificacion.clubName', 'identificacion.district',
            'presupuesto.*', 'contacto.*',
        ],
        fdd_2026_2027: [
            'club.*', 'presidente.*', 'lfri.*', 'presupuesto.*', 'aportes.*',
            'fdd.*', 'declaraciones.*', 'aprobacion.*',
        ],
    },
    lockSensitive: 'restricted',
};

/** La política de UNA edición, saneada sobre la de fábrica. */
export const fairPostClosePolicyOf = (cfg) => normalizePostClosePolicy(cfg?.postCloseEditing, FAIR_POST_CLOSE_DEFAULTS);

/**
 * El veredicto de edición posterior al cierre para UN formulario de UNA
 * postulación. `record` es la fila del formulario: su `reopenedAt` es la
 * autorización individual del comité («Reabrir edición»).
 */
export const fairFormEditVerdict = (row, cfg, formKey, record = null, { now = Date.now() } = {}) => {
    const state = projectStateOf(row);
    return postCloseVerdict({
        deadline: cfg?.deadline || null,
        policy: fairPostClosePolicyOf(cfg),
        now,
        formKey,
        state,
        archived: !!row?.archivedAt,
        authorized: !!record?.reopenedAt,
        labels: {
            state: `el proyecto en estado «${projectStateMeta(state).label}»`,
            contact: 'Si necesitas hacer un ajuste, escríbele al comité organizador.',
        },
    });
};

/** ¿El club ya pidió autorización para editar este formulario? */
export const editRequestOf = (row, formKey) => {
    const r = row?.metadata?.editRequests?.[formKey];
    return r && typeof r === 'object' && r.at ? r : null;
};
