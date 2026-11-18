// ════════════════════════════════════════════════════════════════════
// EXCHANGE — traslados y conciliación financiera de la Feria — el criterio — v4.1335
//
// Pedido del comité (XII Feria, Valledupar 2027): documentar el traslado de lo
// recaudado por inscripción de proyectos desde la cuenta que recibe (Mercury)
// hasta la cuenta del organizador (Colrotarios), asociarlo a cada proyecto y
// CONCILIARLO, con una columna «Exchange» en «Proyectos postulados».
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ EXCHANGE NO ES UN SEGUNDO MOTOR DE DESEMBOLSOS.
// ═════════════════════════════════════════════════════════════════════
//
// El traslado de una inscripción de la Feria YA se registra desde v4.1025–
// v4.1026 con el motor de la Bóveda (`Disbursement` por cobro, `DisbursementBatch`
// para el giro agrupado con su comprobante compartido, reversión con motivo,
// idempotencia por operación, «ninguna inscripción se traslada dos veces» por
// `balanceFor`). Ésa es la regla durable «no hay un segundo motor de
// desembolsos»: con dos caminos, uno se queda atrás y el fallo es MUDO.
//
// Exchange es la CAPA DE CONTROL encima de ese registro:
//
//   · OPERACIÓN (la «Transferencia Exchange») = el giro de la Bóveda: un lote
//     (`b:<batchId>`) o un desembolso suelto (`d:<disbursementId>`).
//   · ASIGNACIÓN a un proyecto = cada fila de `Disbursement` del lote: su cobro
//     (la inscripción), su valor y su moneda. Un comprobante compartido vive UNA
//     vez en el lote y la operación se cuenta UNA vez en los totales.
//   · Lo que la Bóveda NO tiene y Exchange agrega (tablas `Exchange*`): la
//     CONCILIACIÓN (en conciliación / conciliado / con diferencia, con quién y
//     cuándo), los datos de la operación bancaria (importe enviado y recibido,
//     monedas, tasa REGISTRADA, comisiones, referencia, cuentas), soportes
//     adicionales, el historial, las cuentas configuradas y los accesos de
//     consulta del administrador del evento.
//
// Tres procesos con estados INDEPENDIENTES (punto 7 del pedido):
//   A. el PAGO de la inscripción (`ProjectFairSubmission.status`, lo escribe Stripe
//      o la confirmación manual);
//   B. el TRASLADO (`Disbursement` de la Bóveda);
//   C. la CONCILIACIÓN (`ExchangeReconciliation`).
// Ningún archivo de Exchange escribe A ni B. Lo fija la prueba.
//
// Este archivo es PURO (sin base, sin red).
// ════════════════════════════════════════════════════════════════════

export const TOL = 0.005;
const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
export const round2 = (n) => Math.round(num(n) * 100) / 100;
export const cur = (c) => String(c || '').trim().toUpperCase().slice(0, 3);

// ── La CONCILIACIÓN de una operación (proceso C) ────────────────────────────

export const RECON_STATUSES = ['en_conciliacion', 'conciliado', 'con_diferencia'];
export const RECON_LABELS = {
    en_conciliacion: 'En conciliación',
    conciliado: 'Conciliado',
    con_diferencia: 'Con diferencia',
};

const RECON_TRANSITIONS = {
    en_conciliacion: ['conciliado', 'con_diferencia'],
    con_diferencia: ['conciliado', 'en_conciliacion'],
    // Reabrir: un conciliado no se edita; se reabre con su motivo y el
    // registro original queda en el historial (la reversión controlada).
    conciliado: ['en_conciliacion'],
};

/**
 * ¿Se puede pasar la conciliación de `from` a `to`?
 *
 * ⚠️ ADJUNTAR NO ES CONCILIAR. Para «Conciliado» hacen falta un comprobante
 * (el del giro en la Bóveda o un soporte de Exchange) Y la referencia de la
 * operación; y si hay una diferencia medible, la explicación de por qué se
 * acepta (comisión, redondeo). «Con diferencia» y «Reabrir» exigen el motivo.
 */
export const canReconcile = (from, to, { hasReceipt = false, reference = '', note = '', difference = null } = {}) => {
    const desde = RECON_STATUSES.includes(from) ? from : 'en_conciliacion';
    if (!RECON_STATUSES.includes(to)) return { ok: false, error: 'Estado de conciliación desconocido.' };
    if (!(RECON_TRANSITIONS[desde] || []).includes(to)) {
        return { ok: false, error: `No se puede pasar de «${RECON_LABELS[desde]}» a «${RECON_LABELS[to]}».` };
    }
    const nota = String(note || '').trim();
    if (to === 'conciliado') {
        if (!hasReceipt) return { ok: false, error: 'Para conciliar hace falta el comprobante del traslado.' };
        if (!String(reference || '').trim()) return { ok: false, error: 'Para conciliar registra la referencia de la transacción bancaria.' };
        if (difference !== null && Math.abs(num(difference)) > TOL && nota.length < 5) {
            return { ok: false, error: 'Hay una diferencia entre lo asignado y lo recibido: explica por qué se acepta (queda en el historial).' };
        }
    }
    if (to === 'con_diferencia' && nota.length < 5) return { ok: false, error: 'Describe la diferencia (queda en el historial).' };
    if (desde === 'conciliado' && nota.length < 5) return { ok: false, error: 'Indica el motivo para reabrir la conciliación (queda en el historial).' };
    return { ok: true };
};

// ── Los datos de la operación bancaria ──────────────────────────────────────

export const RECON_DATA_FIELDS = [
    'sentAmount', 'sentCurrency', 'receivedAmount', 'receivedCurrency', 'exchangeRate',
    'rateSource', 'feeAmount', 'feeCurrency', 'bankReference', 'transferDate', 'notes',
];

const optAmount = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const optText = (v, max) => {
    const s = String(v ?? '').replace(/[\r\u0000]/g, '').trim();
    return s ? s.slice(0, max) : null;
};

/**
 * Normaliza y valida los datos que registra quien concilia.
 *
 * ⚠️ NO SE CONVIERTE NADA CON UNA TASA DE HOY. La tasa es la REAL de la
 * operación (la registra quien tiene el extracto delante) y su fuente queda
 * escrita. Un importe en otra moneda no se compara contra lo asignado: se
 * muestra tal cual y la diferencia sólo se mide en la misma moneda.
 */
export const normalizeReconData = (input = {}, { now = new Date() } = {}) => {
    const errores = [];
    const out = {
        sentAmount: optAmount(input.sentAmount),
        sentCurrency: input.sentCurrency ? cur(input.sentCurrency) : null,
        receivedAmount: optAmount(input.receivedAmount),
        receivedCurrency: input.receivedCurrency ? cur(input.receivedCurrency) : null,
        exchangeRate: optAmount(input.exchangeRate),
        rateSource: optText(input.rateSource, 200),
        feeAmount: optAmount(input.feeAmount),
        feeCurrency: input.feeCurrency ? cur(input.feeCurrency) : null,
        bankReference: optText(input.bankReference, 160),
        transferDate: null,
        notes: optText(input.notes, 2000),
    };
    for (const [k, label] of [['sentAmount', 'importe enviado'], ['receivedAmount', 'importe recibido'], ['feeAmount', 'comisión']]) {
        if (out[k] !== null && (!Number.isFinite(out[k]) || out[k] < 0)) errores.push(`El ${label} tiene que ser un número mayor o igual a cero.`);
        else if (out[k] !== null) out[k] = round2(out[k]);
    }
    if (out.exchangeRate !== null && (!Number.isFinite(out.exchangeRate) || out.exchangeRate <= 0)) errores.push('La tasa de cambio tiene que ser mayor que cero.');
    for (const [k, label] of [['sentCurrency', 'enviada'], ['receivedCurrency', 'recibida'], ['feeCurrency', 'de la comisión']]) {
        if (out[k] && !/^[A-Z]{3}$/.test(out[k])) errores.push(`La moneda ${label} no es válida.`);
    }
    if (out.sentAmount !== null && !out.sentCurrency) errores.push('Indica la moneda del importe enviado.');
    if (out.receivedAmount !== null && !out.receivedCurrency) errores.push('Indica la moneda del importe recibido.');
    if (out.feeAmount !== null && out.feeAmount > 0 && !out.feeCurrency) errores.push('Indica la moneda de la comisión.');
    if (out.exchangeRate !== null && !out.rateSource) errores.push('Indica de dónde sale la tasa (extracto, comprobante del banco): no se usa una tasa de hoy.');
    if (input.transferDate) {
        const d = new Date(input.transferDate);
        if (Number.isNaN(d.getTime())) errores.push('La fecha de la transferencia no es válida.');
        else if (d.getTime() > now.getTime() + 24 * 3600 * 1000) errores.push('La fecha de la transferencia no puede estar en el futuro.');
        else out.transferDate = d.toISOString();
    }
    return { ok: errores.length === 0, errores, data: out };
};

/** Qué cambió entre dos juegos de datos (para el historial antes/después). */
export const reconDataDiff = (before = {}, after = {}) => {
    const cambios = [];
    for (const k of RECON_DATA_FIELDS) {
        const a = before?.[k] ?? null;
        const b = after?.[k] ?? null;
        let same;
        if (a === null && b === null) same = true;
        else if (a === null || b === null) same = false;
        else if (typeof a === 'number' || typeof b === 'number') same = Math.abs(num(a) - num(b)) <= TOL;
        else same = String(a) === String(b);
        if (!same) cambios.push({ field: k, before: a, after: b });
    }
    return cambios;
};

// ── La OPERACIÓN: el giro de la Bóveda visto por Exchange ───────────────────

/** La clave de la operación: el lote o el desembolso suelto. */
export const operationKeyOf = (disbursement = {}) =>
    disbursement.batchId ? `b:${disbursement.batchId}` : `d:${disbursement.id}`;

export const OPERATION_KEY_RE = /^[bd]:[A-Za-z0-9_-]{1,80}$/;
export const isOperationKey = (k) => OPERATION_KEY_RE.test(String(k || ''));
/** La misma clave, segura para un prefijo de S3. */
export const operationSlug = (k) => String(k || '').replace(':', '-');

const isActiveAllocation = (d) => String(d?.status || 'confirmado') !== 'reversado';

/**
 * La operación resuelta: asignaciones activas, total asignado, si tiene
 * comprobante y la diferencia contra lo recibido (sólo en la misma moneda).
 *
 * `allocations` son TODAS las filas de `Disbursement` de la operación (de
 * cualquier proyecto), `batch` la fila del lote (o null), `recon` la fila de
 * `ExchangeReconciliation` (o null), `exchangeDocs` cuántos soportes propios.
 */
export const resolveOperation = ({ key, allocations = [], batch = null, recon = null, exchangeDocs = 0 } = {}) => {
    const activas = allocations.filter(isActiveAllocation);
    const primera = allocations[0] || {};
    const currency = cur(batch?.currency || primera.currency);
    const allocated = round2(activas.reduce((s, a) => s + num(a.amount), 0));
    const bovedaReceipt = Boolean(batch ? (batch.hasReceipt || batch.receiptKey) : allocations.some(a => a.hasReceipt || a.receiptKey));
    const hasReceipt = bovedaReceipt || num(exchangeDocs) > 0;
    const reference = String(recon?.bankReference || batch?.reference || primera.reference || '').trim();
    const received = recon?.receivedAmount === null || recon?.receivedAmount === undefined ? null : num(recon.receivedAmount);
    const comparable = received !== null && cur(recon?.receivedCurrency) === currency;
    const difference = comparable ? round2(received - allocated) : null;
    const reversed = allocations.length > 0 && activas.length === 0;
    const status = RECON_STATUSES.includes(recon?.status) ? recon.status : 'en_conciliacion';
    return {
        key,
        kind: key && key.startsWith('b:') ? 'agrupada' : 'individual',
        currency,
        allocated,
        allocationsCount: activas.length,
        projectsCount: new Set(activas.map(a => a.submissionId || a.paymentId)).size,
        hasReceipt,
        bovedaReceipt,
        exchangeDocs: num(exchangeDocs),
        reference,
        transferDate: recon?.transferDate || batch?.disbursedAt || primera.disbursedAt || null,
        received,
        receivedCurrency: recon?.receivedCurrency ? cur(recon.receivedCurrency) : null,
        difference,
        reversed,
        status: reversed ? 'revertido' : status,
        statusLabel: reversed ? 'Traslado revertido' : RECON_LABELS[status],
        reconciledAt: status === 'conciliado' ? (recon?.reconciledAt || null) : null,
        reconciledByName: status === 'conciliado' ? (recon?.reconciledByName || null) : null,
    };
};

// ── El estado EXCHANGE de un proyecto (la columna) ──────────────────────────

export const EXCHANGE_STATES = [
    'no_aplica', 'pago_directo', 'sin_traslado', 'sin_comprobante', 'en_conciliacion', 'parcial', 'con_diferencia', 'conciliado',
];

export const EXCHANGE_LABELS = {
    no_aplica: '—',
    pago_directo: 'Pago directo',
    sin_traslado: 'Pendiente',
    sin_comprobante: 'Falta comprobante',
    en_conciliacion: 'En conciliación',
    parcial: 'Parcial',
    con_diferencia: 'Diferencia',
    conciliado: 'Conciliado',
};

/** El color del indicador (el panel sólo pinta). */
export const EXCHANGE_TONES = {
    no_aplica: 'slate', pago_directo: 'slate', sin_traslado: 'slate', sin_comprobante: 'amber',
    en_conciliacion: 'orange', parcial: 'sky', con_diferencia: 'red', conciliado: 'emerald',
};

export const EXCHANGE_HELP = {
    no_aplica: 'El pago de la inscripción no está confirmado: todavía no hay nada que trasladar.',
    pago_directo: 'El pago se confirmó a mano (transferencia o consignación al comité): el dinero no pasó por la cuenta de la plataforma y no requiere traslado.',
    sin_traslado: 'El pago está confirmado y todavía no hay ningún traslado registrado.',
    sin_comprobante: 'Hay un traslado registrado sin comprobante adjunto.',
    en_conciliacion: 'El comprobante está adjunto y la transferencia aún no se verificó.',
    parcial: 'Sólo una parte del valor del proyecto se ha trasladado.',
    con_diferencia: 'Hay una inconsistencia entre el valor esperado y el trasladado o recibido.',
    conciliado: 'Un administrador autorizado confirmó la correspondencia entre el pago, el traslado y el proyecto.',
};

/**
 * El valor que el proyecto tiene que trasladar, en la moneda de su cobro.
 *
 * Es el neto del movimiento de la Bóveda (`netAmount`): en la Feria el recargo
 * de la pasarela se le SUMÓ a quien se inscribió (v4.980), así que el neto es
 * el precio publicado. Sin neto, lo cobrado. Nunca una conversión.
 */
export const expectedOf = (movement) => {
    if (!movement) return { amount: 0, currency: null };
    const net = num(movement.netAmount);
    return { amount: round2(net > 0 ? net : num(movement.amount)), currency: cur(movement.currency) };
};

/**
 * El estado Exchange de UN proyecto.
 *
 *   · `paid`      — el pago de la inscripción está confirmado (proceso A).
 *   · `manual`    — se confirmó a mano: no pasó por la cuenta de la plataforma.
 *   · `movement`  — su cobro en la Bóveda (`Payment`) o null.
 *   · `allocations` — sus filas de `Disbursement` (con `operationKey`).
 *   · `operations`  — mapa clave → operación resuelta (`resolveOperation`).
 *
 * Orden de prioridad: diferencia > parcial > falta comprobante > en
 * conciliación > conciliado. Un proyecto es «Conciliado» sólo si TODAS sus
 * operaciones activas lo están y lo trasladado cubre lo esperado.
 */
export const projectExchangeState = ({ paid = false, manual = false, movement = null, allocations = [], operations = {} } = {}) => {
    const expected = expectedOf(movement);
    const base = {
        expected: expected.amount, currency: expected.currency, allocated: 0, confirmedAmount: 0,
        operationKeys: [], hasReceipt: false, needsMovement: false, lastTransferDate: null,
    };
    const fin = (state, extra = {}) => ({ ...base, ...extra, state, label: EXCHANGE_LABELS[state], tone: EXCHANGE_TONES[state], help: EXCHANGE_HELP[state] });
    if (!paid) return fin('no_aplica');
    if (!movement) return manual ? fin('pago_directo') : fin('sin_traslado', { needsMovement: true });

    const activas = (allocations || []).filter(isActiveAllocation);
    if (!activas.length) return fin('sin_traslado');

    const keys = [...new Set(activas.map(a => a.operationKey))];
    const ops = keys.map(k => operations[k]).filter(Boolean);
    const allocated = round2(activas.reduce((s, a) => s + num(a.amount), 0));
    const confirmedAmount = round2(activas
        .filter(a => operations[a.operationKey]?.status === 'conciliado')
        .reduce((s, a) => s + num(a.amount), 0));
    const hasReceipt = ops.some(o => o.hasReceipt);
    const fechas = ops.map(o => o.transferDate).filter(Boolean).sort();
    const extra = { allocated, confirmedAmount, operationKeys: keys, hasReceipt, lastTransferDate: fechas[fechas.length - 1] || null };

    if (ops.some(o => o.status === 'con_diferencia') || allocated > expected.amount + TOL) return fin('con_diferencia', extra);
    if (allocated + TOL < expected.amount) return fin('parcial', extra);
    if (ops.length && ops.every(o => o.status === 'conciliado')) return fin('conciliado', extra);
    if (ops.some(o => !o.hasReceipt)) return fin('sin_comprobante', extra);
    return fin('en_conciliacion', extra);
};

// ── Filtros ────────────────────────────────────────────────────────────────

export const EXCHANGE_FILTERS = [
    { key: 'sin_traslado', label: 'Sin traslado' },
    { key: 'comprobante', label: 'Comprobante adjunto' },
    { key: 'en_conciliacion', label: 'En conciliación' },
    { key: 'conciliado', label: 'Conciliado' },
    { key: 'parcial', label: 'Parcial' },
    { key: 'con_diferencia', label: 'Con diferencias' },
    { key: 'sin_comprobante', label: 'Falta comprobante' },
    { key: 'pago_directo', label: 'Pago directo' },
];
const FILTER_KEYS = EXCHANGE_FILTERS.map(f => f.key);

/** ¿La consulta pide algo de Exchange que obligue a calcular todas las filas? */
export const hasExchangeQuery = (q = {}) =>
    FILTER_KEYS.includes(String(q.exchange || ''))
    || ['exchangeRef', 'trasladoDesde', 'trasladoHasta'].some(k => q[k] !== undefined && String(q[k]).trim() !== '');

/** ¿El proyecto pasa los filtros de Exchange? `refs` = referencias bancarias de sus operaciones. */
export const matchesExchangeFilters = (x, q = {}, { refs = [] } = {}) => {
    if (!x) return false;
    const f = String(q.exchange || '');
    if (FILTER_KEYS.includes(f)) {
        if (f === 'comprobante') { if (!x.hasReceipt) return false; }
        else if (x.state !== f) return false;
    }
    const ref = String(q.exchangeRef || '').trim().toLowerCase();
    if (ref && !refs.some(r => String(r || '').toLowerCase().includes(ref))) return false;
    const desde = String(q.trasladoDesde || '').trim();
    const hasta = String(q.trasladoHasta || '').trim();
    if (desde || hasta) {
        const fecha = x.lastTransferDate ? String(new Date(x.lastTransferDate).toISOString()).slice(0, 10) : '';
        if (!fecha) return false;
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;
    }
    return true;
};

// ── Indicadores (por moneda: COP y USD NUNCA se suman) ──────────────────────

/**
 * Los KPIs del resumen. `projects` = filas con `exchange` resuelto y `anchor`
 * (false para un proyecto cuyo dinero vive en el pago de otro: no se cuenta dos
 * veces). `operations` = mapa de operaciones resueltas: cada una se cuenta UNA
 * vez aunque cubra varios proyectos y comparta un comprobante.
 */
export const exchangeTotals = (projects = [], operations = {}, { counted = null } = {}) => {
    const out = {};
    const t = (c) => out[c] || (out[c] = {
        currency: c, recibido: 0, proyectosPagados: 0, trasladado: 0, conciliado: 0, pendienteTraslado: 0,
        proyectosSinTraslado: 0, pendienteConciliacion: 0, operaciones: 0, operacionesPendientes: 0,
        operacionesConciliadas: 0, diferencias: 0, valorDiferencias: 0, parciales: 0,
    });
    const general = { pagosDirectos: 0, sinMovimiento: 0, sinComprobante: 0 };
    for (const p of projects) {
        const x = p.exchange;
        if (!x || p.anchor === false) continue;
        if (x.state === 'no_aplica') continue;
        if (x.state === 'pago_directo') { general.pagosDirectos += 1; continue; }
        if (x.needsMovement) { general.sinMovimiento += 1; continue; }
        const k = t(x.currency || 'COP');
        k.proyectosPagados += 1;
        k.recibido += num(x.expected);
        k.pendienteTraslado += Math.max(0, num(x.expected) - num(x.allocated));
        if (x.state === 'sin_traslado') k.proyectosSinTraslado += 1;
        if (x.state === 'parcial') k.parciales += 1;
        if (x.state === 'sin_comprobante') general.sinComprobante += 1;
    }
    const usadas = counted ? new Set(counted) : null;
    for (const o of Object.values(operations)) {
        if (!o || o.reversed) continue;
        if (usadas && !usadas.has(o.key)) continue;
        const k = t(o.currency || 'COP');
        k.operaciones += 1;
        k.trasladado += num(o.allocated);
        if (o.status === 'conciliado') { k.conciliado += num(o.allocated); k.operacionesConciliadas += 1; }
        else { k.pendienteConciliacion += num(o.allocated); k.operacionesPendientes += 1; }
        const conDif = o.status === 'con_diferencia' || (o.status !== 'conciliado' && o.difference !== null && Math.abs(o.difference) > TOL);
        if (conDif) { k.diferencias += 1; k.valorDiferencias += Math.abs(num(o.difference)); }
    }
    for (const x of Object.values(out)) {
        for (const key of ['recibido', 'trasladado', 'conciliado', 'pendienteTraslado', 'pendienteConciliacion', 'valorDiferencias']) x[key] = round2(x[key]);
    }
    return { porMoneda: Object.values(out).sort((a, b) => a.currency.localeCompare(b.currency)), ...general };
};

// ── Cuentas (origen / destino) ──────────────────────────────────────────────

/** «****4521»: lo que ve quien no administra la configuración. */
export const maskAccount = (value) => {
    const s = String(value || '').replace(/\s+/g, '');
    if (!s) return '';
    return s.length <= 4 ? '****' : `****${s.slice(-4)}`;
};

const ACCOUNT_FIELDS = ['label', 'institution', 'holder', 'accountNumber', 'accountType', 'currency'];

/** Una cuenta configurada, limpia. Una cuenta enmascarada que vuelve NO pisa la guardada. */
export const normalizeAccount = (input = {}, previous = {}) => {
    const out = {};
    for (const f of ACCOUNT_FIELDS) out[f] = optText(input?.[f], f === 'accountNumber' ? 60 : 120) || null;
    if (out.currency) out.currency = cur(out.currency);
    if (out.accountNumber && /^\*{4}/.test(out.accountNumber)) out.accountNumber = previous?.accountNumber || null;
    return out;
};

export const publicAccount = (acc = {}, { full = false } = {}) => {
    if (!acc) return null;
    return { ...Object.fromEntries(ACCOUNT_FIELDS.map(f => [f, acc[f] ?? null])), accountNumber: full ? (acc.accountNumber || null) : maskAccount(acc.accountNumber) };
};

// ── Accesos de consulta (el administrador del evento) ───────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => EMAIL_RE.test(String(v || '').trim());

/**
 * ¿Este acceso es de este usuario?
 *
 * ⚠️ El vínculo que vale es el USUARIO (`userId`). El correo sólo sirve para
 * enlazar la primera vez a quien todavía no tenía cuenta al concederse; una vez
 * enlazado, cambiar el correo de la cuenta no lo pierde, y otra cuenta con ese
 * correo no lo hereda. Un acceso revocado no vale.
 */
export const grantMatches = (grant, user) => {
    if (!grant || !user || grant.revokedAt) return false;
    if (grant.userId) return String(grant.userId) === String(user.id || '');
    return Boolean(grant.email) && String(grant.email).trim().toLowerCase() === String(user.email || '').trim().toLowerCase();
};

/**
 * Los accesos de consulta que el comité PIDIÓ por escrito al estrenar Exchange
 * (v4.1335): el administrador de los eventos del Distrito 4281. Se SIEMBRAN una
 * sola vez en la edición abierta como una fila de `ExchangeAccessGrant` —que se
 * liga al usuario en su primer uso y se revoca desde el panel—; una vez
 * sembrado, revocarlo es definitivo (la marca queda en el historial y no se
 * vuelve a sembrar). Esta lista NO es una regla de permiso: ninguna comparación
 * de correo decide el acceso fuera de la fila sembrada.
 */
export const INITIAL_EVENT_ADMIN_GRANTS = [
    { email: 'valjupa@rotarydistrict4281colombia.org', canDownload: true, note: 'Administrador de los eventos del Distrito 4281 (pedido del comité al estrenar Exchange).' },
];

// ── Los archivos ────────────────────────────────────────────────────────────

export const EXCHANGE_DOC_KINDS = [
    { key: 'comprobante_envio', label: 'Comprobante de envío (origen)' },
    { key: 'comprobante_recepcion', label: 'Comprobante de recepción (destino)' },
    { key: 'extracto', label: 'Extracto bancario' },
    { key: 'otro', label: 'Otro soporte' },
];
export const isDocKind = (k) => EXCHANGE_DOC_KINDS.some(d => d.key === k);

/** La fila del CSV, con comillas y sin inyección de fórmulas. */
export const csvCell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default {
    TOL, RECON_STATUSES, RECON_LABELS, canReconcile, normalizeReconData, reconDataDiff, operationKeyOf, isOperationKey,
    operationSlug, resolveOperation, EXCHANGE_STATES, EXCHANGE_LABELS, EXCHANGE_TONES, EXCHANGE_HELP, expectedOf,
    projectExchangeState, EXCHANGE_FILTERS, hasExchangeQuery, matchesExchangeFilters, exchangeTotals, maskAccount,
    normalizeAccount, publicAccount, isEmail, grantMatches, EXCHANGE_DOC_KINDS, isDocKind, csvCell,
};
