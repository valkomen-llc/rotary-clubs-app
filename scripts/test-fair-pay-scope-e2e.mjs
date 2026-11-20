// ════════════════════════════════════════════════════════════════════
// test:fair:pay-scope:e2e — «Pagar los dos» o «Pagar solo el primero»
// (v4.1344), contra un Postgres LOCAL y desechable, sin Stripe:
//
//   FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:pay-scope:e2e
//
// Una inscripción con dos proyectos postulados y sin pagar (caso del club de
// Fusagasugá): el perfil recibe las dos opciones con el total que cobraría la
// pasarela; el cálculo con alcance «first» cubre y ancla sólo el primero;
// pagado el primero, queda el cobro complementario del segundo y ya no hay
// opciones. Precio en dólares para no depender de la TRM (red).
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige FAIR_E2E_DATABASE_URL local.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:pay-scope:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
process.env.DATABASE_URL = E2E_DB;
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-pay','XII Feria','xii') ON CONFLICT DO NOTHING`);
const fair = await import(`${REPO}/server/controllers/projectFairController.js`);
await fair.ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-pay','evt-pay', $1::jsonb)
    ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO UPDATE SET config = $1::jsonb`,
[JSON.stringify({ deadline: '2026-11-09', registration: { priceMode: 'USD', amountUsd: 60, secondProjectAmountUsd: 25, secondProjectAmountCop: 100000, amountCop: 250000, maxProjectsPerClub: 2 } })]);

const reg = (await db.query(`INSERT INTO "ProjectFairRegistration" ("eventId", "clubName", district, email, modality) VALUES ('evt-pay','Fusagasugá','4281','angelica@club.org','double') RETURNING *`)
    .catch(async () => db.query(`INSERT INTO "ProjectFairRegistration" ("eventId", "clubName", email) VALUES ('evt-pay','Fusagasugá','angelica@club.org') RETURNING *`))).rows[0];
const sub = async (ref, idx, name, amount) => (await db.query(`
    INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountUsd", "priceMode", "projectIndex", "registrationId", "appliedAt")
    VALUES ($1,'evt-pay','Angélica','González','angelica@club.org','Fusagasugá','4281',$2,'received','pending_payment','+573000000000','agua',$3,'USD',$4,$5, NOW()) RETURNING *`,
[ref, name, amount, idx, reg.id])).rows[0];
const p1 = await sub('FP-FUSA1', 1, 'Agua para la vereda', 60);
const p2 = await sub('FP-FUSA2', 2, 'Salud comunitaria', 25);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
try {
    console.log('── Dos proyectos postulados sin pagar');
    let pago = await fair.paymentStateFor(p1);
    ok(pago.canPay === true, 'se puede pagar');
    ok(Array.isArray(pago.payOptions) && pago.payOptions.length === 2, 'el perfil recibe DOS opciones');
    const [todos, primero] = pago.payOptions;
    ok(todos.scope === 'all' && todos.label === 'Pagar los 2 proyectos' && todos.total === pago.charge.total, '«Pagar los 2 proyectos» con el total de la pasarela');
    ok(primero.scope === 'first' && primero.label === 'Pagar solo el primer proyecto' && primero.total < todos.total, '«Pagar solo el primer proyecto», por menos');
    ok(/Agua para la vereda/.test(primero.detail), 'y nombra el proyecto que cubre');

    const completo = await fair.priceSubmission(p1);
    const solo = await fair.priceSubmission(p1, { scope: 'first' });
    ok(JSON.stringify(completo.order.coveredIds) === JSON.stringify([p1.id, p2.id]) && completo.order.total === 85, 'la orden completa cubre los dos (60 + 25)');
    ok(JSON.stringify(solo.order.coveredIds) === JSON.stringify([p1.id]) && solo.order.anchorId === p1.id && solo.order.total === 60, '«sólo el primero» cubre y ancla sólo el primero (60)');
    ok(solo.quote.chargeAmount === primero.total, 'el total mostrado es el que se cobraría');
    const desde2 = await fair.priceSubmission(p2, { scope: 'first' });
    ok(desde2.order.coveredIds.length === 2, 'si el ancla no es el primero, no se recorta (se cobra todo)');

    console.log('── Pagado sólo el primero');
    await db.query(`UPDATE "ProjectFairSubmission" SET status = 'paid', "paidAt" = NOW() WHERE id = $1`, [p1.id]);
    const p2fresh = (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [p2.id])).rows[0];
    pago = await fair.paymentStateFor(p2fresh);
    ok(pago.canPay === true && !pago.payOptions, 'queda el segundo por pagar, sin opciones (un solo proyecto)');
    ok(pago.order?.total === 25 && JSON.stringify(pago.order.coveredIds) === JSON.stringify([p2.id]), 'es el cobro complementario del segundo (25)');
    const p1fresh = (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [p1.id])).rows[0];
    ok((await fair.paymentStateFor(p1fresh)).payOptions === null, 'el pagado no ofrece opciones');
} finally {
    await db.end?.().catch(() => {});
}
console.log(`\n✅ test:fair:pay-scope:e2e — ${n} comprobaciones contra Postgres real.`);
process.exit(0);
