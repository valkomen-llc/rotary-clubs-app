// ════════════════════════════════════════════════════════════════════
// La base, en memoria, para probar el CAMINO del pago de la Feria.
// v4.978.0
//
// ⚠️ ESTE DOBLE NO IMPLEMENTA LAS REGLAS QUE LA PRUEBA DICE COMPROBAR. Es la
// lección de v4.896: la primera versión de un doble parecido escribía en
// JavaScript el candado del reclamo, así que quitar el `ON CONFLICT` del SQL
// real no hacía fallar nada y la comprobación era vacua diciendo lo contrario.
// Acá el candado y las condiciones se LEEN DEL PROPIO SQL: si alguien borra el
// `ON CONFLICT ("submissionId") WHERE status = 'open' DO NOTHING`, este doble
// inserta los dos intentos y la prueba detecta el cobro duplicado.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres: eso
// se comprueba al desplegar, y no se afirma de más.
// ════════════════════════════════════════════════════════════════════
let seq = 0;
const uid = (p) => `${p}_${++seq}`;

export const tablas = {
    ProjectFairSubmission: [],
    ProjectFairPaymentAttempt: [],
    ProjectFairEvent: [],
    ProjectFairAccount: [],
    ProjectFairStripeEvent: [],
};
export const consultas = [];
export let config = {};

export const reset = (submission = {}, cfg = {}) => {
    seq = 0;
    for (const k of Object.keys(tablas)) tablas[k] = [];
    consultas.length = 0;
    config = {
        enabled: true,
        registration: { priceMode: 'USD', amountUsd: 62, concept: 'Inscripción de proyecto' },
        notifications: { sendReceipt: false, adminEmails: [] },
        portal: { path: '/mi-proyecto' },
        formPath: '/postular-proyecto',
        edition: { name: 'XII Feria', key: 'xii' },
        ...cfg,
    };
    tablas.ProjectFairSubmission.push({
        id: 'sub_1', publicRef: 'FP-TEST1', email: 'club@ejemplo.org',
        clubName: 'Club Rotario Barranquilla', district: '4271',
        projectName: 'Milagro entre hilos', status: 'pending_payment',
        workflowStatus: 'pending_payment', stripeSessionId: null,
        stripePaymentIntentId: null, stripeChargeId: null, amountCop: null,
        amountUsd: null, paidAt: null, clubId: null, eventId: null,
        metadata: {}, receiptUrl: null, lastPaymentError: null,
        ...submission,
    });
};

export const submission = () => tablas.ProjectFairSubmission[0];
export const intentos = () => tablas.ProjectFairPaymentAttempt.filter(a => a.submissionId === 'sub_1');
export const abiertos = () => intentos().filter(a => a.status === 'open');

// ── El motor mínimo ─────────────────────────────────────────────────
const noop = { rows: [], rowCount: 0 };
const soloEspacios = (s) => s.replace(/\s+/g, ' ').trim();

const query = async (textoCrudo, params = []) => {
    const sql = soloEspacios(textoCrudo);
    consultas.push({ sql, params });

    // Esquema y siembra: no hacen nada acá y no deben.
    if (/^(CREATE|ALTER|DROP)\b/i.test(sql)) return noop;
    if (/INSERT INTO "ProjectFairTag"/i.test(sql)) return noop;
    if (/UPDATE "ProjectFairSubmission" SET "workflowStatus"/i.test(sql)) return noop;

    // Configuración de la convocatoria.
    if (/FROM "ProjectFairConfig"/i.test(sql)) return { rows: [{ config }], rowCount: 1 };
    if (/FROM "CalendarEvent"/i.test(sql)) return noop;

    // ── Inscripción ──
    if (/^SELECT \* FROM "ProjectFairSubmission" WHERE id = \$1/i.test(sql)) {
        const row = tablas.ProjectFairSubmission.find(r => r.id === params[0]);
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }
    if (/^UPDATE "ProjectFairSubmission"/i.test(sql)) {
        // ⚠️ El id NO siempre es el último parámetro —`confirmPaidSession` lo
        // pone en $9 de diez—: se toma del propio `WHERE id = $n`. Suponerlo
        // hacía que este doble actualizara la fila equivocada, o ninguna.
        const donde = sql.match(/WHERE id = \$(\d+)/i);
        const row = tablas.ProjectFairSubmission.find(r => r.id === params[Number(donde?.[1] || params.length) - 1]);
        if (!row) return noop;
        // Los pares `"campo" = $n` salen del SQL REAL, así que un campo que se
        // deje de escribir en la consulta deja de escribirse acá.
        for (const [, campo, idx] of sql.matchAll(/"(\w+)"\s*=\s*(?:COALESCE\(\s*)?\$(\d+)/g)) {
            row[campo] = params[Number(idx) - 1];
        }
        for (const [, campo, literal] of sql.matchAll(/"(\w+)"\s*=\s*'([^']*)'/g)) row[campo] = literal;
        for (const [, campo] of sql.matchAll(/SET\s+(\w+)\s*=\s*'paid'/gi)) row[campo] = 'paid';
        if (/SET status = 'paid'/i.test(sql)) { row.status = 'paid'; row.paidAt = new Date().toISOString(); }
        if (/status = 'failed'/i.test(sql)) row.status = 'failed';
        if (/status = 'pending_payment'/i.test(sql)) row.status = 'pending_payment';
        if (/"paidAt" = NOW\(\)/i.test(sql)) row.paidAt = new Date().toISOString();
        return { rows: [{ ...row }], rowCount: 1 };
    }

    // ── Intentos de pago ──
    if (/^INSERT INTO "ProjectFairPaymentAttempt"/i.test(sql)) {
        const [submissionId, sessionId, paymentIntentId, amountCop, amountUsd, currency, metadata] = params;
        // ⚠️ EL CANDADO SE LEE DEL SQL. Sin el ON CONFLICT parcial en la
        // consulta real, este doble inserta el segundo intento y la prueba de
        // la carrera falla — que es exactamente lo que tiene que pasar.
        const candado = /ON CONFLICT \("submissionId"\)\s+WHERE status = 'open'\s+DO NOTHING/i.test(sql);
        if (candado && tablas.ProjectFairPaymentAttempt.some(a => a.submissionId === submissionId && a.status === 'open')) {
            return noop;
        }
        const fila = {
            id: uid('att'), submissionId, sessionId, paymentIntentId, status: 'open',
            amountCop, amountUsd, currency, failureCode: null, failureMessage: null,
            startedAt: new Date(Date.now() + tablas.ProjectFairPaymentAttempt.length).toISOString(),
            resolvedAt: null, metadata: JSON.parse(metadata || '{}'),
        };
        tablas.ProjectFairPaymentAttempt.push(fila);
        return { rows: [{ ...fila }], rowCount: 1 };
    }
    if (/^UPDATE "ProjectFairPaymentAttempt"/i.test(sql)) {
        const donde = sql.match(/WHERE id = \$(\d+)/i);
        const fila = tablas.ProjectFairPaymentAttempt.find(a => a.id === params[Number(donde?.[1] || params.length) - 1]);
        if (!fila) return noop;
        // La condición `AND status = 'open'` también sale del SQL real: sin
        // ella, un webhook fuera de orden reescribiría un desenlace asentado.
        if (/AND status = 'open'/i.test(sql) && fila.status !== 'open') return noop;
        const [status, failureCode, failureMessage, paymentIntentId] = params;
        fila.status = status;
        fila.failureCode = failureCode ?? fila.failureCode;
        fila.failureMessage = failureMessage ?? fila.failureMessage;
        fila.paymentIntentId = paymentIntentId ?? fila.paymentIntentId;
        fila.resolvedAt = new Date().toISOString();
        return { rows: [{ ...fila }], rowCount: 1 };
    }
    if (/FROM "ProjectFairPaymentAttempt"/i.test(sql)) {
        let rows = tablas.ProjectFairPaymentAttempt.filter(a => a.submissionId === params[0]);
        if (/"sessionId" = \$1/i.test(sql)) rows = tablas.ProjectFairPaymentAttempt.filter(a => a.sessionId === params[0]);
        if (/"paymentIntentId" = \$1/i.test(sql)) rows = tablas.ProjectFairPaymentAttempt.filter(a => a.paymentIntentId === params[0]);
        if (/status = 'open'/i.test(sql)) rows = rows.filter(a => a.status === 'open');
        if (/ORDER BY "startedAt" ASC/i.test(sql)) rows = [...rows].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
        if (/LIMIT 1/i.test(sql)) rows = rows.slice(0, 1);
        return { rows: rows.map(r => ({ ...r })), rowCount: rows.length };
    }

    // ── Bitácora y cuentas ──
    if (/^INSERT INTO "ProjectFairEvent"/i.test(sql)) {
        tablas.ProjectFairEvent.push({ submissionId: params[0], type: params[1], title: params[2], detail: params[3] });
        return noop;
    }
    if (/^INSERT INTO "ProjectFairStripeEvent"/i.test(sql)) {
        const id = params[0];
        if (tablas.ProjectFairStripeEvent.some(e => e.stripeEventId === id)) return noop;
        tablas.ProjectFairStripeEvent.push({ stripeEventId: id, type: params[1] });
        return { rows: [{ id: uid('ev') }], rowCount: 1 };
    }
    if (/"ProjectFairAccount"/i.test(sql)) {
        if (/^SELECT/i.test(sql)) return { rows: tablas.ProjectFairAccount.map(r => ({ ...r })), rowCount: tablas.ProjectFairAccount.length };
        return noop;
    }
    if (/"ProjectFairMasterForm"|"ProjectFairProjectForm"|"ProjectFairFile"|"ProjectFairFormRevision"|"ProjectFairTrm"/i.test(sql)) return noop;

    return noop;
};

export default { query };
export { query };
