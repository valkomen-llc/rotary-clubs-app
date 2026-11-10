// ════════════════════════════════════════════════════════════════════
// La INSCRIPCIÓN de un club a la Feria de Proyectos: uno o dos proyectos,
// un solo pago — EL CRITERIO
// v4.1299.0
//
// PURO: sin base, sin red, sin Stripe, sin DOM. Responde las preguntas que
// hasta v4.1298 ni siquiera se podían hacer, porque el módulo daba por hecho
// que una fila de `ProjectFairSubmission` era a la vez el proyecto, la
// inscripción y el cobro:
//
//   · ¿Cuántos proyectos puede postular un club y a qué precio cada uno?
//   · ¿Qué proyectos cubre el pago que se va a abrir ahora, y cuánto suma?
//   · ¿Puede este club agregar un segundo proyecto? ¿Puede quitarlo?
//
// EL MODELO. La fila de `ProjectFairSubmission` sigue siendo EL PROYECTO —de
// ella cuelgan la Formulación, el FDD, los videos, los recursos y el
// historial, y nada de eso cambia—. Lo nuevo es `ProjectFairRegistration`,
// la INSCRIPCIÓN del club: agrupa sus proyectos (`registrationId`), numera a
// cada uno (`projectIndex`: 1 es la inscripción principal, 2 la adicional) y
// es la unidad a la que se le cobra. Cada proyecto guarda SU LÍNEA de precio
// (`amountCop`/`amountUsd`: 250.000 el primero, 100.000 el segundo), así que
// el recaudo por primeras y por segundas postulaciones se suma fila por fila
// sin repartir nada; lo que la pasarela cobró de verdad (`amountReceived`)
// vive en el proyecto ANCLA de la orden, y los demás proyectos cubiertos por
// ese cobro quedan pagados con la marca de quién los cubrió.
//
// ⚠️ UN COBRO CUBRE TODO LO QUE EL CLUB DEBE EN ESE MOMENTO. Con dos
// proyectos postulados y nada pagado, el pago es UNO de 350.000; con el
// primero ya pagado, agregar el segundo abre un cobro COMPLEMENTARIO de
// 100.000, independiente, que no toca ni vuelve a cobrar la transacción
// original. Es la misma regla vista desde dos momentos.
// ════════════════════════════════════════════════════════════════════

import { isApplied, owesRegistration, projectStateOf, NO_OBLIGATION_STATES } from './projectFairLifecycle.js';

/** Modalidades de inscripción. Catálogo cerrado. */
export const MODALITIES = [
    { key: 'single', projects: 1, label: 'Un proyecto', detail: 'Inscripción estándar' },
    { key: 'double', projects: 2, label: 'Dos proyectos', detail: 'Segundo proyecto con tarifa especial' },
];

export const modalityOf = (count) => (Number(count) >= 2 ? 'double' : 'single');
export const projectCountOf = (modality) => (modality === 'double' ? 2 : 1);

const money = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const dateOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim());

/**
 * Las TARIFAS de la convocatoria, leídas una sola vez. Todo lo demás de este
 * archivo recibe este objeto, nunca la configuración entera: así el precio de
 * un segundo proyecto no se puede leer de dos sitios distintos.
 *
 *   mode            'COP' | 'USD' — la moneda en la que se fija y se cobra
 *   maxProjects     tope de proyectos por club (2 para esta convocatoria)
 *   first / second  el valor de la primera y de la segunda postulación
 *   secondEnabled   ¿se ofrece el segundo proyecto? (interruptor + tope + valor)
 *   secondDeadline  fecha límite para AGREGAR un segundo proyecto (opcional)
 *   deadline        fecha límite general de postulación (opcional)
 */
export const pricingRulesOf = (cfg = {}) => {
    const reg = cfg?.registration || {};
    const mode = String(reg.priceMode || reg.currency || 'COP').toUpperCase() === 'USD' ? 'USD' : 'COP';
    const maxRaw = Number(reg.maxProjectsPerClub);
    // Un tope raro no amplía nada: si no es un entero ≥ 1 vale 1, y nunca
    // pasa de 2 — es la regla administrativa aprobada para esta convocatoria.
    const maxProjects = Number.isInteger(maxRaw) && maxRaw >= 1 ? Math.min(maxRaw, 2) : 1;
    const first = mode === 'USD' ? money(reg.amountUsd) : money(reg.amountCop);
    const second = mode === 'USD' ? money(reg.secondProjectAmountUsd) : money(reg.secondProjectAmountCop);
    const secondEnabled = reg.secondProjectEnabled !== false && maxProjects >= 2 && second > 0;
    return {
        mode,
        maxProjects: secondEnabled ? maxProjects : 1,
        first,
        second,
        secondEnabled,
        secondDeadline: dateOk(reg.secondProjectDeadline) ? String(reg.secondProjectDeadline).trim() : null,
        deadline: dateOk(cfg?.deadline) ? String(cfg.deadline).trim() : null,
    };
};

/** El valor de la línea de UN proyecto según su posición en la inscripción. */
export const lineAmountFor = (rules, projectIndex) => (Number(projectIndex) >= 2 ? rules.second : rules.first);

/**
 * v4.1313 — EL VALOR AJUSTADO POR EL COMITÉ.
 *
 * El comité puede fijar a mano el valor de la inscripción de UN proyecto
 * (250.000 → 100.000, o cualquier otro): un club con tarifa especial, una
 * segunda postulación que entró como primera, un acuerdo puntual. Vive en
 * `metadata.amountOverride` de la fila —sin columna nueva— y sólo vale en la
 * moneda de la convocatoria: si la convocatoria cambiara de moneda, el ajuste
 * deja de aplicar en vez de cobrar pesos como dólares.
 */
export const amountOverrideOf = (row) => {
    const o = row?.metadata?.amountOverride;
    if (!o || typeof o !== 'object') return null;
    const amount = Number(o.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const currency = String(o.currency || '').toUpperCase() === 'USD' ? 'USD' : 'COP';
    return { ...o, amount, currency };
};

/**
 * ⚠️ LA LÍNEA DE UN PROYECTO: su valor ajustado si lo tiene, si no la tarifa
 * de su posición. Es la ÚNICA puerta por la que la orden (`orderFor`), el
 * desglose (`registrationBreakdown`) y la confirmación manual
 * (`manualCoverageFor`) leen cuánto vale un proyecto: así lo que el panel
 * muestra, lo que el perfil anuncia y lo que Stripe cobra no se separan.
 */
export const lineAmountOfRow = (rules, row) => {
    const o = amountOverrideOf(row);
    if (o && o.currency === rules.mode) return o.amount;
    return lineAmountFor(rules, indexOf(row));
};

/** Topes de cordura del valor ajustado: un error de tipeo no llega a Stripe. */
export const AMOUNT_OVERRIDE_MAX = { COP: 50000000, USD: 20000 };

/**
 * Lee un valor escrito por una persona: número, «100000», «100.000»,
 * «$ 100.000», «100000,50». El punto seguido de tres dígitos es de miles
 * (así se escribe en Colombia); la coma, decimal.
 */
export const parseAmountInput = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const t = String(v ?? '').replace(/[\s$]/g, '').replace(/(COP|USD)$/i, '');
    if (!t) return NaN;
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return NaN;
    const sinMiles = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) ? t.replace(/\./g, '') : t;
    return Number(sinMiles.replace(',', '.'));
};

/**
 * v4.1313 — ¿Se puede cambiar el valor de este proyecto, y a cuánto queda?
 * PURO: recibe la fila, lo pedido y las tarifas; devuelve el veredicto con su
 * motivo, o lo que hay que escribir.
 *
 *   input.amount   el valor nuevo (en la moneda de la convocatoria)
 *   input.clear    true = volver a la tarifa de su posición (quita el ajuste)
 *   input.reason   motivo obligatorio (≥ 5 caracteres): queda en el historial
 *
 * Un proyecto PAGADO se puede ajustar: cambia su LÍNEA (lo que suma al
 * recaudo), no lo que recibió la pasarela (`amountReceived`), y no genera
 * cobros ni reembolsos. Uno REEMBOLSADO no: ese dinero ya se devolvió.
 */
export const amountOverridePlan = (row, input = {}, rules = { mode: 'COP', first: 0, second: 0 }) => {
    const fail = (status, error) => ({ ok: false, status, error });
    if (!row) return fail(404, 'Postulación no encontrada.');
    if (String(row.status) === 'refunded') {
        return fail(409, 'Esta inscripción fue reembolsada: su valor ya no se puede cambiar.');
    }
    const reason = String(input.reason ?? '').trim();
    if (reason.length < 5) return fail(400, 'Escribe el motivo del cambio de valor (mínimo 5 caracteres).');

    const currency = rules.mode === 'USD' ? 'USD' : 'COP';
    const tariff = lineAmountFor(rules, indexOf(row));
    const stored = money(currency === 'USD' ? row.amountUsd : row.amountCop);
    const previous = stored || lineAmountOfRow(rules, row);
    const clear = input.clear === true;
    const hadOverride = !!amountOverrideOf(row);

    let amount;
    if (clear) {
        if (!(tariff > 0)) return fail(409, 'La convocatoria no tiene una tarifa configurada para esta posición; escribe el valor.');
        if (!hadOverride && previous === tariff) return fail(409, 'El proyecto ya está con la tarifa de su posición.');
        amount = tariff;
    } else {
        const n = parseAmountInput(input.amount);
        if (!Number.isFinite(n)) return fail(400, 'Escribe un valor numérico, por ejemplo 100000.');
        if (n <= 0) return fail(400, 'El valor debe ser mayor que cero.');
        if (n > AMOUNT_OVERRIDE_MAX[currency]) {
            return fail(400, `El valor supera el máximo permitido (${AMOUNT_OVERRIDE_MAX[currency].toLocaleString('es-CO')} ${currency}). Revisa que no sobren ceros.`);
        }
        amount = currency === 'USD' ? Math.round(n * 100) / 100 : Math.round(n);
        if (amount === previous) return fail(409, 'El proyecto ya tiene ese valor.');
    }

    // Un valor igual a la tarifa no es un ajuste: se guarda sin la marca, para
    // que un cambio de tarifas en Convocatoria vuelva a aplicarle.
    const keepsOverride = !clear && amount !== tariff;
    return {
        ok: true,
        currency,
        amount,
        previous,
        tariff,
        paid: String(row.status) === 'paid',
        keepsOverride,
        reason,
    };
};

/** Rótulo corto de la posición: «Primer proyecto», «Segundo proyecto». */
export const projectIndexLabel = (projectIndex) => (Number(projectIndex) >= 2 ? 'Segundo proyecto' : 'Primer proyecto');

/** Total publicado de una modalidad: 1 → first; 2 → first + second. */
export const modalityTotal = (rules, count) => {
    const n = Math.max(1, Math.min(Number(count) || 1, rules.maxProjects));
    let total = 0;
    for (let i = 1; i <= n; i++) total += lineAmountFor(rules, i);
    return Math.round(total * 100) / 100;
};

/**
 * ¿Este proyecto cuenta dentro de la inscripción? No cuenta lo archivado ni
 * lo que el club retiró (un segundo proyecto quitado antes de pagar queda
 * «Retirado» con su información intacta, para poder restaurarlo). Un
 * proyecto rechazado SÍ cuenta: estuvo inscrito.
 */
export const isActiveProject = (row) => !!row && !row.archivedAt && projectStateOf(row) !== 'withdrawn';

/** Los proyectos activos de una inscripción, ordenados por su posición. */
export const activeProjects = (rows = []) =>
    rows.filter(isActiveProject).sort((a, b) => indexOf(a) - indexOf(b));

export const indexOf = (row) => {
    const n = Number(row?.projectIndex);
    return Number.isInteger(n) && n >= 1 ? n : 1;
};

/**
 * ⚠️ QUÉ CUBRE EL PAGO QUE SE ABRE AHORA: todo proyecto de la inscripción
 * que DEBE la inscripción —postulado, no retirado ni rechazado, no
 * archivado, sin pagar—. Un borrador no se cobra (v4.1253) y un proyecto ya
 * pagado no se vuelve a cobrar. El ancla de la orden es el primero de ellos.
 */
export const coveredByCheckout = (rows = []) => activeProjects(rows).filter(owesRegistration);

/**
 * La ORDEN: una línea por proyecto cubierto, con su posición, su rótulo y su
 * importe, y el total que suma. El importe de cada línea sale de la posición
 * del proyecto en la inscripción y de las tarifas VIGENTES: una orden
 * pendiente se cobra al precio del momento del pago (política explícita de
 * vigencia); una ya pagada conserva lo que se cobró.
 */
export const orderFor = (rows = [], rules) => {
    const covered = coveredByCheckout(rows);
    const lines = covered.map(row => ({
        submissionId: row.id,
        projectIndex: indexOf(row),
        projectName: row.projectName || '',
        publicRef: row.publicRef || null,
        label: `${projectIndexLabel(indexOf(row))} — ${row.projectName || ''}`.trim(),
        // v4.1313 — El valor ajustado por el comité manda sobre la tarifa.
        amount: lineAmountOfRow(rules, row),
    }));
    const total = Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    return {
        currency: rules.mode,
        count: lines.length,
        anchorId: lines[0]?.submissionId || null,
        coveredIds: lines.map(l => l.submissionId),
        lines,
        total,
    };
};

/**
 * El DESGLOSE completo de la inscripción, para mostrarlo: todos los proyectos
 * activos con su línea y si ya está pagada. Es lo que el club ve como
 * «Primer proyecto $250.000 · Segundo proyecto $100.000 · Total $350.000».
 */
export const registrationBreakdown = (rows = [], rules) => {
    const lines = activeProjects(rows).map(row => ({
        submissionId: row.id,
        projectIndex: indexOf(row),
        projectName: row.projectName || '',
        label: projectIndexLabel(indexOf(row)),
        // Pagado: lo que quedó en la fila (su línea congelada). Pendiente: la
        // tarifa vigente para su posición.
        // v4.1313 — Pendiente con valor ajustado por el comité: ese valor.
        amount: String(row.status) === 'paid'
            ? money(rules.mode === 'USD' ? row.amountUsd : row.amountCop) || lineAmountOfRow(rules, row)
            : lineAmountOfRow(rules, row),
        paid: String(row.status) === 'paid',
        owes: owesRegistration(row),
        applied: isApplied(row),
        noObligation: NO_OBLIGATION_STATES.includes(projectStateOf(row)),
    }));
    return {
        currency: rules.mode,
        count: lines.length,
        modality: modalityOf(lines.length),
        lines,
        total: Math.round(lines.filter(l => !l.noObligation).reduce((a, l) => a + l.amount, 0) * 100) / 100,
        paidTotal: Math.round(lines.filter(l => l.paid).reduce((a, l) => a + l.amount, 0) * 100) / 100,
        pendingTotal: Math.round(lines.filter(l => l.owes).reduce((a, l) => a + l.amount, 0) * 100) / 100,
    };
};

const endOfDay = (d) => new Date(`${d}T23:59:59-05:00`).getTime();

/**
 * ¿Puede este club AGREGAR un segundo proyecto? Cada «no» trae su código y
 * su motivo escrito, porque un bloqueo sin salida se lee como una avería.
 *
 *   disabled     la convocatoria no ofrece segundo proyecto
 *   closed       la convocatoria está cerrada
 *   max_reached  ya tiene el máximo de proyectos activos
 *   deadline     venció la fecha límite (la del segundo proyecto o la general)
 *   restorable   ya existe un segundo proyecto RETIRADO por el club: se
 *                restaura en vez de crear otro (su información sigue ahí)
 */
export const secondProjectVerdict = (rows = [], cfg = {}, { now = Date.now() } = {}) => {
    const rules = pricingRulesOf(cfg);
    const active = activeProjects(rows);
    if (!rules.secondEnabled) {
        return { ok: false, code: 'disabled', reason: 'Esta convocatoria no ofrece la inscripción de un segundo proyecto.', rules };
    }
    if (cfg?.enabled === false) {
        return { ok: false, code: 'closed', reason: 'La convocatoria no está recibiendo postulaciones en este momento.', rules };
    }
    if (active.length >= rules.maxProjects) {
        return { ok: false, code: 'max_reached', reason: `Tu club ya tiene el máximo de ${rules.maxProjects} proyectos inscritos en esta convocatoria.`, rules };
    }
    const limit = rules.secondDeadline || rules.deadline;
    if (limit && now > endOfDay(limit)) {
        return { ok: false, code: 'deadline', reason: 'La fecha límite para agregar un segundo proyecto ya venció.', rules };
    }
    const parked = rows.find(r => !r.archivedAt && projectStateOf(r) === 'withdrawn' && r?.metadata?.withdrawnByClub && indexOf(r) >= 2);
    if (parked) {
        return { ok: true, code: 'restorable', reason: null, restoreId: parked.id, rules };
    }
    return { ok: true, code: null, reason: null, nextIndex: active.length + 1, rules };
};

/**
 * ¿Puede el club QUITAR este proyecto (volver de dos a uno)? Sólo un
 * proyecto adicional (posición ≥ 2) y sólo mientras NO esté pagado: después
 * de pagar dos proyectos no se reduce la modalidad ni se devuelve dinero sin
 * un procedimiento administrativo. Un reembolso también lo saca de acá.
 */
export const removeProjectVerdict = (row) => {
    if (!row) return { ok: false, code: 'not_found', reason: 'No encontramos ese proyecto.' };
    if (indexOf(row) < 2) return { ok: false, code: 'primary', reason: 'El proyecto principal de la inscripción no se puede quitar desde acá.' };
    if (projectStateOf(row) === 'withdrawn') return { ok: false, code: 'already', reason: 'Ese proyecto ya fue retirado.' };
    if (String(row.status) === 'paid' || String(row.status) === 'refunded') {
        return { ok: false, code: 'paid', reason: 'La inscripción de este proyecto ya está pagada. Para retirarlo, escríbele al comité.' };
    }
    return { ok: true, code: null, reason: null };
};

/**
 * Los identificadores cubiertos por un cobro, tal como viajan en la metadata
 * de Stripe (una cadena separada por comas, acotada). Se LEEN sólo de ahí:
 * si una sesión antigua no los trae, el cobro cubre únicamente su ancla.
 * Deducirlos de «lo que debe hoy» marcaría como pagado un proyecto agregado
 * DESPUÉS de abrir el cobro.
 */
export const coveredIdsFromMetadata = (md = {}, anchorId = null) => {
    const ids = String(md?.coveredSubmissionIds || '')
        .split(',').map(s => s.trim()).filter(Boolean);
    // El ancla va primera: es la fila que guarda el cobro real.
    const set = new Set(anchorId ? [anchorId] : []);
    for (const id of ids) set.add(id);
    return [...set];
};

export const coveredIdsToMetadata = (ids = []) => ids.filter(Boolean).join(',').slice(0, 480);

/**
 * v4.1308 — QUÉ CUBRE UNA CONFIRMACIÓN MANUAL DE PAGO.
 *
 * Un club que pagó por fuera (transferencia, consignación) su inscripción de
 * dos proyectos hizo UN pago. Hasta v4.1307 el panel confirmaba una sola fila
 * y el otro proyecto seguía «debiendo»: la inscripción no quedaba pagada de
 * manera completa ni en el listado ni en los indicadores.
 *
 * Es la MISMA regla del cobro en línea (`coveredByCheckout`), con una
 * diferencia deliberada: acá no se deduce nada de «lo que debe hoy». Lo que
 * cubre el pago lo DECLARA quien lo confirma (`requestedIds`), porque es quien
 * tiene el soporte delante; el criterio sólo acepta lo que puede cubrirse:
 * otro proyecto de la MISMA inscripción, activo, postulado y sin pagar. Lo
 * demás se rechaza con su motivo, nunca se ignora en silencio.
 *
 * `lines` trae la línea de cada fila (la tarifa de su posición) para dejarla
 * escrita si la fila no la tenía: es lo que suma al recaudo.
 *
 * @returns {{ coveredIds: string[], rejected: {id: string, reason: string}[],
 *             lines: {submissionId: string, projectIndex: number, amount: number}[], total: number }}
 */
export const manualCoverageFor = (rows = [], anchorId, requestedIds = [], rules = { mode: 'COP', first: 0, second: 0 }) => {
    const byId = new Map(rows.filter(Boolean).map(r => [r.id, r]));
    const anchor = byId.get(anchorId) || null;
    const pedidos = [...new Set((Array.isArray(requestedIds) ? requestedIds : [])
        .map(v => String(v || '').trim()).filter(id => id && id !== anchorId))];
    const coveredIds = [];
    const rejected = [];
    for (const id of pedidos) {
        const row = byId.get(id);
        if (!row) { rejected.push({ id, reason: 'No pertenece a la inscripción de este proyecto.' }); continue; }
        if (!isActiveProject(row)) { rejected.push({ id, reason: 'El proyecto está retirado o archivado.' }); continue; }
        if (String(row.status) === 'paid') { rejected.push({ id, reason: 'Ese proyecto ya tiene el pago confirmado.' }); continue; }
        if (!owesRegistration(row)) { rejected.push({ id, reason: 'Ese proyecto no debe la inscripción (es un borrador o no tiene obligación de pago).' }); continue; }
        coveredIds.push(id);
    }
    const lines = [anchor, ...coveredIds.map(id => byId.get(id))]
        .filter(Boolean)
        .map(row => ({ submissionId: row.id, projectIndex: indexOf(row), amount: lineAmountOfRow(rules, row) }));
    const total = Math.round(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0) * 100) / 100;
    return { coveredIds, rejected, lines, total };
};

// ── Las mismas reglas, en SQL (literales controlados, sin datos de la petición) ──
export const SQL_ACTIVE_PROJECT = `("archivedAt" IS NULL AND COALESCE("workflowStatus",'received') <> 'withdrawn')`;
export const SQL_FIRST_PROJECT = `COALESCE("projectIndex",1) = 1`;
export const SQL_SECOND_PROJECT = `COALESCE("projectIndex",1) >= 2`;
/** La inscripción de una fila: su registro o, en una fila heredada sin registro, ella misma. */
export const SQL_REGISTRATION_KEY = `COALESCE("registrationId", id)`;
