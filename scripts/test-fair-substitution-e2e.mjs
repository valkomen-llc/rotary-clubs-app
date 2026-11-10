#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Sustituir una postulación por otra del mismo club, con su pago — E2E (v4.1311)
// FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:substitution:e2e
//
// Postgres REAL + el router real del módulo + un Stripe simulado. Reproduce el
// caso que lo motivó: el pago real (COP 250.000) está en el proyecto que se
// retira y lo hizo otra persona; el proyecto que se conserva tiene un pago de
// prueba de USD 1. Comprueba verificación, bloqueos, aplicación, idempotencia,
// ROLLBACK real a mitad de la transacción, indicadores, exportación, ficha,
// perfil del club, Bóveda y webhooks de reembolso.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ. No lee DATABASE_URL: exige
// FAIR_E2E_DATABASE_URL apuntando a localhost, y una base VACÍA y desechable.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:substitution:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
const require = createRequire(`${REPO}/package.json`);

// ── Stripe simulado ──────────────────────────────────────────────────
const intents = new Map();
const stripeSrv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const m = /^\/v1\/payment_intents\/([^/]+)$/.exec(u.pathname);
    const pi = m && intents.get(m[1]);
    res.setHeader('Content-Type', 'application/json');
    if (!pi) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such payment_intent: '${m?.[1] || u.pathname}'` } }));
    }
    res.writeHead(200);
    res.end(JSON.stringify(pi));
});
await new Promise(r => stripeSrv.listen(0, '127.0.0.1', r));

process.env.DATABASE_URL = E2E_DB;
process.env.STRIPE_SECRET_KEY = 'sk_live_fake_for_e2e';
process.env.STRIPE_API_BASE = `http://127.0.0.1:${stripeSrv.address().port}`;

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);

await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
// La Bóveda: sólo lo que la sustitución lee (el movimiento por su referencia).
await db.query(`CREATE TABLE IF NOT EXISTS "Payment" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, provider TEXT, "providerRef" TEXT, status TEXT, amount NUMERIC, currency TEXT, "rawPayload" JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW(), UNIQUE (provider, "providerRef"))`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-xii','XII Feria','xii') ON CONFLICT DO NOTHING`);

const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const fairCtl = await import(`${REPO}/server/controllers/projectFairController.js`);
await fairCtl.ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-xii','evt-xii', $1::jsonb) ON CONFLICT DO NOTHING`,
    [JSON.stringify({ registration: { priceMode: 'COP', amountCop: 250000, secondProjectAmountCop: 100000 } })]);

const registration = async (club, email) => (await db.query(
    `INSERT INTO "ProjectFairRegistration" ("eventId", "clubName", district, email, modality) VALUES ('evt-xii',$1,'Rotary Distrito 4271',$2,'single') RETURNING id`,
    [club, email])).rows[0].id;

const sub = async (ref, f) => {
    const { rows } = await db.query(`
        INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, phone, "clubName", district,
            "projectName", "projectDescription", "focusArea", "budgetUsd", "workflowStatus", status, "amountCop", "amountUsd",
            "amountReceived", "chargeCurrency", "paidAt", "stripePaymentIntentId", "stripeSessionId", "stripeChargeId", "receiptUrl",
            "paymentConfirmationOrigin", "paymentMethod", metadata, "registrationId", "projectIndex", "appliedAt", "createdAt")
        VALUES ($1,'evt-xii',$2,$3,$4,$5,$6,'Rotary Distrito 4271',$7,$8,'paz',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24,1,NOW(),$25)
        RETURNING id`,
    [ref, f.firstName, f.lastName, f.email, f.phone, f.club, f.projectName, f.description || 'Descripción del proyecto', f.budgetUsd ?? 1000,
        f.wf || 'received', f.status || 'paid', f.amountCop ?? 250000, f.amountUsd ?? 62.5, f.amountReceived ?? null, f.chargeCurrency || null,
        f.paidAt || null, f.pi || null, f.cs || null, f.ch || null, f.receiptUrl || null, f.origin || 'stripe', f.method || 'card',
        JSON.stringify(f.metadata || {}), f.registrationId || null, f.createdAt || new Date().toISOString()]);
    return rows[0].id;
};

// ── El caso real ─────────────────────────────────────────────────────
const REG_X = await registration('Cúcuta Ciudad de Árboles', 'ximena-caicedo@hotmail.com');
const RETIRED = await sub('FP-GLMGQL', {
    firstName: 'XIMENA', lastName: 'CAICEDO', email: 'ximena-caicedo@hotmail.com', phone: '+57 3153813747',
    club: 'Cúcuta Ciudad de Árboles', projectName: 'Adecuación de salón para apoyo socio-emocional', budgetUsd: 65390,
    amountReceived: 262500, chargeCurrency: 'COP', paidAt: '2026-08-11T15:20:00Z',
    pi: 'pi_live_ximena', cs: 'cs_live_ximena', ch: 'ch_live_ximena', receiptUrl: 'https://pay.stripe.com/receipts/x',
    registrationId: REG_X, createdAt: '2026-08-11T15:00:00Z',
});
await db.query(`UPDATE "ProjectFairSubmission" SET metadata = $2::jsonb WHERE id = $1`, [RETIRED, JSON.stringify({
    payment: { sessionId: 'cs_live_ximena', paymentIntentId: 'pi_live_ximena', coveredSubmissionIds: [RETIRED],
        coveredProjects: [{ id: RETIRED, publicRef: 'FP-GLMGQL', projectName: 'Adecuación de salón para apoyo socio-emocional', projectIndex: 1, amountCop: 250000, amountUsd: 62.5 }] },
})]);
const REG_F = await registration('cucuta ciudad de los arboles', 'francycalb@hotmail.com');
const KEPT = await sub('FP-GVGEQX', {
    firstName: 'francy', lastName: 'calderon bonilla', email: 'francycalb@hotmail.com', phone: '+57 3158074933',
    club: 'cucuta ciudad de los arboles', projectName: 'Centro para la Paz y la Convivencia Escolar', budgetUsd: 98,
    description: 'Descripción ORIGINAL del Centro para la Paz', wf: 'in_review',
    amountReceived: 1, chargeCurrency: 'USD', paidAt: '2026-07-31T18:00:00Z', amountCop: 250000,
    pi: 'pi_prueba_francy', cs: 'cs_prueba_francy', ch: 'ch_prueba_francy', receiptUrl: 'https://pay.stripe.com/receipts/f',
    metadata: { payment: { sessionId: 'cs_prueba_francy', amountTotal: 100, currency: 'USD', coveredSubmissionIds: [] }, addedVia: 'wizard' },
    registrationId: REG_F, createdAt: '2026-07-31T17:00:00Z',
});
// Un club ajeno, pagado: no puede moverse ni un campo.
const OTRO = await sub('FP-AJENO', {
    firstName: 'Ana', lastName: 'Ruiz', email: 'ana@club.org', phone: '+57 300', club: 'Club Pasto', projectName: 'Agua para Pasto',
    amountReceived: 262500, chargeCurrency: 'COP', paidAt: '2026-08-01T10:00:00Z', pi: 'pi_live_otro',
});

intents.set('pi_live_ximena', {
    id: 'pi_live_ximena', object: 'payment_intent', livemode: true, status: 'succeeded', amount: 26250000, amount_received: 26250000,
    currency: 'cop', metadata: { submissionId: RETIRED }, created: 1786461600,
    latest_charge: { id: 'ch_live_ximena', object: 'charge', amount: 26250000, amount_refunded: 0, refunded: false, disputed: false,
        billing_details: { name: 'Ximena Caicedo', email: 'ximena-caicedo@hotmail.com' } },
});
// `pi_prueba_francy` NO existe para la clave real: se hizo en modo de pruebas.

await db.query(`INSERT INTO "Payment" (provider, "providerRef", status, amount, currency, "rawPayload") VALUES
    ('stripe','pi_live_ximena','succeeded',262500,'COP',$1::jsonb), ('stripe','pi_live_otro','succeeded',262500,'COP','{}'::jsonb)`,
[JSON.stringify({ type: 'project_fair_registration', submissionId: RETIRED })]);
await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", "lastEditedAt") VALUES ($1, $2::jsonb, 40, NOW())`,
    [KEPT, JSON.stringify({ resumen: 'Respuestas ORIGINALES del Centro para la Paz' })]);
await db.query(`INSERT INTO "ProjectFairFile" ("submissionId", "fileName", "fileUrl") VALUES ($1, 'plan.pdf', 'https://x/plan.pdf')`, [KEPT]);

// ── Servidor ─────────────────────────────────────────────────────────
const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}/api/project-fair`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const admin = jwt.sign({ id: 'u-admin', email: 'comite@feria.org', role: 'administrator', clubId: 'c1' }, SECRET);
const viewer = jwt.sign({ id: 'u-view', email: 'viewer@x.org', role: 'editor' }, SECRET);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
const EV = '?evento=evt-xii';
const fila = async (id) => (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [id])).rows[0];
const count = async (sql, p = []) => Number((await db.query(sql, p)).rows[0].n);
const intel = async () => (await call('GET', `/admin/inteligencia${EV}`, admin)).data;
const BODY = { retiredRef: 'FP-GLMGQL', keptRef: 'FP-GVGEQX', amount: 250000, currency: 'COP' };
const REASON = 'Consolidación administrativa solicitada por la organización. El proyecto que participará es Centro para la Paz y la Convivencia Escolar.';

const antes = { retired: await fila(RETIRED), kept: await fila(KEPT), otro: await fila(OTRO) };
const intelAntes = await intel();
const pagosAntes = await count('SELECT COUNT(*) AS n FROM "Payment"');
console.log(`  (antes: ${intelAntes.participation.paid} pagadas, recaudo ${intelAntes.participation.collectedAmount})`);

console.log('── Verificar: permisos y diferencias que DETIENEN');
ok((await call('POST', `/admin/postulaciones/sustitucion/verificar${EV}`, viewer, BODY)).status === 403, 'un perfil sin permiso no verifica (403)');
let r = await call('POST', `/admin/postulaciones/sustitucion/verificar${EV}`, admin, { ...BODY, amount: 300000 });
ok(r.status === 200 && !r.data.plan.ok && r.data.plan.blocking.includes('official_amount'), 'un importe informado que no coincide con la base bloquea');
r = await call('POST', `/admin/postulaciones/sustitucion/verificar${EV}`, admin, { ...BODY, keptRef: 'FP-AJENO' });
ok(!r.data.plan.ok && r.data.plan.blocking.includes('same_club'), 'un proyecto de OTRO club bloquea');
r = await call('POST', `/admin/postulaciones/sustitucion/verificar${EV}`, admin, { ...BODY, keptRef: 'FP-NOEXISTE' });
ok(!r.data.plan.ok && r.data.plan.blocking.includes('kept_found'), 'una referencia inexistente bloquea');

console.log('── Verificar: el caso real pasa');
r = await call('POST', `/admin/postulaciones/sustitucion/verificar${EV}`, admin, BODY);
const plan = r.data.plan;
ok(r.status === 200 && plan.ok, `todas las comprobaciones pasan (${plan.checks.length})`);
ok(plan.retiredStripe.found && plan.retiredStripe.livemode && plan.retiredStripe.status === 'succeeded' && !plan.retiredStripe.refunded, 'Stripe confirma el pago oficial: real, capturado, sin reembolso');
ok(plan.payer.name === 'XIMENA CAICEDO' && plan.payer.gatewayName === 'Ximena Caicedo', 'el pagador es Ximena Caicedo (fila y titular en Stripe)');
ok(plan.replacedPayment.kind === 'stripe_test' && plan.replacedPayment.realMoney === false, 'el USD 1 se clasifica como prueba (la cuenta real no lo tiene)');
ok(plan.ledger.retiredMovement?.found === true && plan.ledger.keptMovement?.found === false, 'la Bóveda tiene el movimiento del pago oficial y ninguno del de prueba');
ok((await fila(RETIRED)).updatedAt.getTime() === antes.retired.updatedAt.getTime(), 'verificar no escribe nada');

console.log('── Aplicar: lo que se rechaza sin tocar nada');
ok((await call('POST', `/admin/postulaciones/sustitucion/aplicar${EV}`, admin, { ...BODY, reason: REASON, fingerprint: plan.fingerprint })).status === 428, 'sin confirmación explícita: 428');
ok((await call('POST', `/admin/postulaciones/sustitucion/aplicar${EV}`, admin, { ...BODY, reason: 'corto', fingerprint: plan.fingerprint, confirm: true })).status === 400, 'sin motivo suficiente: 400');
r = await call('POST', `/admin/postulaciones/sustitucion/aplicar${EV}`, admin, { ...BODY, reason: REASON, fingerprint: 'f'.repeat(64), confirm: true });
ok(r.status === 409 && /cambiaron/.test(r.data.error), 'con una huella que no es la verificada: 409');
ok(!(await fila(RETIRED)).archivedAt && (await fila(KEPT)).stripePaymentIntentId === 'pi_prueba_francy', '…y las dos filas siguen intactas');

console.log('── ROLLBACK real: un fallo a mitad de la transacción no deja estado parcial');
await db.query(`CREATE OR REPLACE FUNCTION e2e_falla() RETURNS trigger AS $$ BEGIN IF NEW.type = 'payment_reclassified' THEN RAISE EXCEPTION 'fallo simulado en la auditoría'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
await db.query(`CREATE TRIGGER e2e_falla BEFORE INSERT ON "ProjectFairEvent" FOR EACH ROW EXECUTE FUNCTION e2e_falla()`);
r = await call('POST', `/admin/postulaciones/sustitucion/aplicar${EV}`, admin, { ...BODY, reason: REASON, fingerprint: plan.fingerprint, confirm: true });
ok(r.status === 500 && /ningún cambio parcial/.test(r.data.error), 'el fallo se informa');
const trasFallo = { retired: await fila(RETIRED), kept: await fila(KEPT) };
ok(!trasFallo.retired.archivedAt && trasFallo.retired.workflowStatus === 'received', 'el retirado NO quedó archivado (las dos UPDATE se revirtieron)');
ok(!trasFallo.kept.metadata?.payment?.coveredBy && trasFallo.kept.stripePaymentIntentId === 'pi_prueba_francy', 'el conservado NO quedó respaldado y conserva su pago');
ok(await count(`SELECT COUNT(*) AS n FROM "ProjectFairEvent" WHERE type = 'substitution'`) === 0, 'ni un evento de auditoría a medias');
await db.query(`DROP TRIGGER e2e_falla ON "ProjectFairEvent"`);

console.log('── Aplicar: el caso real');
r = await call('POST', `/admin/postulaciones/sustitucion/aplicar${EV}`, admin, { ...BODY, reason: REASON, fingerprint: plan.fingerprint, confirm: true });
ok(r.status === 200 && r.data.applied === true, 'aplicada');
const ret = await fila(RETIRED);
const kep = await fila(KEPT);
ok(ret.archivedAt && ret.archivedBy === 'comite@feria.org' && /sustituido por FP-GVGEQX/.test(ret.archivedReason), 'FP-GLMGQL archivado, con quién y por qué');
ok(ret.workflowStatus === 'withdrawn' && ret.metadata.substitution.previousWorkflowStatus === 'received', '…retirado de la feria, con su estado anterior guardado');
ok(ret.status === 'paid' && Number(ret.amountReceived) === 262500 && ret.stripePaymentIntentId === 'pi_live_ximena'
    && ret.stripeSessionId === 'cs_live_ximena' && ret.stripeChargeId === 'ch_live_ximena' && ret.receiptUrl === 'https://pay.stripe.com/receipts/x'
    && new Date(ret.paidAt).toISOString() === '2026-08-11T15:20:00.000Z' && ret.chargeCurrency === 'COP', 'el pago oficial conserva transacción, referencia, fecha, importe, moneda y comprobante');
ok(ret.firstName === 'XIMENA' && ret.email === 'ximena-caicedo@hotmail.com', 'el pagador no se tocó');
ok(ret.metadata.payment.coveredSubmissionIds.includes(KEPT) && ret.metadata.payment.coveredProjects.find(p => p.id === RETIRED).amountCop === 0, 'el ancla declara a quién respalda (y el retirado en cero)');
ok(kep.status === 'paid' && kep.metadata.payment.coveredBy === RETIRED && kep.metadata.payment.coveredByRef === 'FP-GLMGQL', 'FP-GVGEQX queda respaldado por el pago oficial');
ok(kep.amountReceived === null && kep.stripePaymentIntentId === null && kep.stripeSessionId === null && kep.receiptUrl === null, '…sin dinero propio: el cobro vive una sola vez, en el ancla');
ok(Number(kep.amountCop) === 250000 && new Date(kep.paidAt).toISOString() === '2026-08-11T15:20:00.000Z' && kep.chargeCurrency === 'COP', '…con la línea y la fecha del pago oficial');
ok(kep.workflowStatus === 'in_review', 'su estado de evaluación sigue «En revisión»');
ok(kep.firstName === 'francy' && kep.lastName === 'calderon bonilla' && kep.email === 'francycalb@hotmail.com', 'la responsable sigue siendo Francy Calderón Bonilla');
ok(kep.projectName === antes.kept.projectName && kep.projectDescription === antes.kept.projectDescription && Number(kep.budgetUsd) === 98, 'nombre, descripción y presupuesto del proyecto conservado intactos');
const sb = kep.metadata.substitution;
ok(sb.payer.name === 'XIMENA CAICEDO' && sb.fromRef === 'FP-GLMGQL' && sb.by === 'comite@feria.org' && sb.reason === REASON, 'la reasignación guarda pagador, origen, administrador y motivo');
ok(sb.official.stripePaymentIntentId === 'pi_live_ximena' && sb.official.amountReceived === 262500, '…y el identificador e importe originales');
ok(sb.previousPayment.stripePaymentIntentId === 'pi_prueba_francy' && sb.previousPayment.amountReceived === 1 && sb.previousPayment.chargeCurrency === 'USD'
    && sb.previousPayment.metadataPayment.sessionId === 'cs_prueba_francy' && sb.previousPayment.classification.kind === 'stripe_test', 'el pago de USD 1 queda guardado ENTERO y etiquetado como prueba');
ok(await count('SELECT COUNT(*) AS n FROM "Payment"') === pagosAntes, 'no se creó ninguna transacción nueva en la Bóveda');
ok(await count(`SELECT COUNT(*) AS n FROM "ProjectFairMasterForm" WHERE "submissionId" = $1 AND answers->>'resumen' = 'Respuestas ORIGINALES del Centro para la Paz'`, [KEPT]) === 1
    && await count(`SELECT COUNT(*) AS n FROM "ProjectFairFile" WHERE "submissionId" = $1`, [KEPT]) === 1, 'formulario y documentos del proyecto conservado intactos');
const otro = await fila(OTRO);
ok(otro.updatedAt.getTime() === antes.otro.updatedAt.getTime() && !otro.archivedAt, 'el proyecto de otro club no se tocó');
const evs = (await db.query(`SELECT * FROM "ProjectFairEvent" WHERE type IN ('substitution','payment_reclassified') ORDER BY "createdAt"`)).rows;
ok(evs.length === 3 && evs.every(e => e.actorName === 'comite@feria.org'), 'tres eventos de auditoría, con el administrador que autorizó');
const evR = evs.find(e => e.submissionId === RETIRED);
ok(evR.metadata.before.archivedAt === null && evR.metadata.after.archivedAt && evR.metadata.fingerprint === plan.fingerprint, 'la auditoría guarda el ANTES y el DESPUÉS y la huella verificada');

console.log('── Idempotencia');
r = await call('POST', `/admin/postulaciones/sustitucion/aplicar${EV}`, admin, { ...BODY, reason: REASON, fingerprint: plan.fingerprint, confirm: true });
ok(r.status === 200 && r.data.alreadyApplied === true && r.data.applied === false, 'aplicarla otra vez responde «ya aplicada»');
ok(await count(`SELECT COUNT(*) AS n FROM "ProjectFairEvent" WHERE type IN ('substitution','payment_reclassified')`) === 3, '…sin escribir un solo evento más');
r = await call('POST', `/admin/postulaciones/sustitucion/verificar${EV}`, admin, BODY);
ok(r.data.plan.alreadyApplied === true && r.data.plan.ok === false, 'verificarla otra vez la reconoce como aplicada');

console.log('── Listado, indicadores, exportación y ficha');
const lista = (await call('GET', `/admin/postulaciones${EV}&pageSize=200`, admin)).data.submissions;
ok(!lista.some(s => s.id === RETIRED), 'FP-GLMGQL ya no está en el listado activo');
const enLista = lista.find(s => s.id === KEPT);
ok(enLista && enLista.paidByName === 'XIMENA CAICEDO' && enLista.coveredBy.publicRef === 'FP-GLMGQL' && enLista.responsable === 'francy calderon bonilla', 'FP-GVGEQX: responsable Francy, «Pagó: XIMENA CAICEDO», respaldado por FP-GLMGQL');
const arch = (await call('GET', `/admin/postulaciones${EV}&archivadas=archivadas`, admin)).data.submissions;
ok(arch.some(s => s.id === RETIRED && s.substitution?.toRef === 'FP-GVGEQX'), 'FP-GLMGQL sigue consultable en el historial de archivadas');
const intelDespues = await intel();
ok(intelDespues.participation.paid === intelAntes.participation.paid - 1, `pagadas: ${intelAntes.participation.paid} → ${intelDespues.participation.paid} (un proyecto menos, no un pago más)`);
ok(intelDespues.participation.collectedAmount === intelAntes.participation.collectedAmount - 250000, `recaudo: ${intelAntes.participation.collectedAmount} → ${intelDespues.participation.collectedAmount} (los 250.000 cuentan UNA vez)`);
const csv = (await call('GET', `/admin/export.csv${EV}`, admin)).data;
const csvLineas = String(csv).split('\n');
ok(!csvLineas.some(l => l.includes('FP-GLMGQL"') && l.startsWith('"FP-GLMGQL')), 'la exportación operativa no trae FP-GLMGQL');
ok(csvLineas.some(l => l.startsWith('"FP-GVGEQX') && l.includes('"XIMENA CAICEDO"') && l.includes('"FP-GLMGQL"')), 'la exportación trae a FP-GVGEQX con pagador y respaldo');
const ficha = (await call('GET', `/admin/postulaciones/${KEPT}${EV}`, admin)).data.submission;
ok(ficha.substitution.role === 'kept' && ficha.substitution.payer.name === 'XIMENA CAICEDO' && ficha.substitution.previousPayment.classification.kind === 'stripe_test', 'la ficha pinta el pago reasignado y el de prueba');
const hist = (await call('GET', `/admin/postulaciones/${KEPT}/payment-history${EV}`, admin)).data;
ok(hist.events.some(e => e.type === 'substitution') && hist.events.some(e => e.type === 'payment_reclassified'), 'el historial de pago trae la reasignación');
const forms = (await call('GET', `/admin/formularios${EV}`, admin)).data;
const formRows = forms.forms || forms.rows || forms.submissions || [];
ok(Array.isArray(formRows) && !formRows.some(f => f.id === RETIRED) && formRows.some(f => f.id === KEPT), 'la revisión de la Formulación ya no incluye al archivado');

console.log('── Perfil del club (Francy)');
const vista = await fairCtl.paymentStateFor(await fila(KEPT));
ok(vista.coveredBy?.publicRef === 'FP-GLMGQL' && vista.charge.total === 262500 && vista.charge.base === 250000, 'el perfil explica el cobro con el pago oficial: base 250.000 (no 500.000), total recibido 262.500');

console.log('── Stripe después de la sustitución');
ok((await call('POST', `/admin/postulaciones/${KEPT}/sync-stripe${EV}`, admin, {})).status === 409, '«Sincronizar con Stripe» en el conservado no le vuelve a pegar el pago de prueba (409)');
await fairCtl.handleRefund({ id: 'ch_prueba_francy', object: 'charge', amount: 100, amount_refunded: 100, currency: 'usd', metadata: { submissionId: KEPT } });
ok((await fila(KEPT)).status === 'paid', 'reembolsar el USD 1 de prueba NO tumba la inscripción');
await fairCtl.handleRefund({ id: 'ch_live_ximena', object: 'charge', amount: 26250000, amount_refunded: 26250000, currency: 'cop', metadata: { submissionId: RETIRED } });
ok((await fila(RETIRED)).status === 'refunded' && (await fila(KEPT)).status === 'refunded', 'reembolsar el pago oficial alcanza al proyecto que respaldaba');

console.log(`\n✅ test:fair:substitution:e2e — ${n} comprobaciones contra Postgres real.`);
srv.close(); stripeSrv.close();
await db.pool.end();
process.exit(0);
