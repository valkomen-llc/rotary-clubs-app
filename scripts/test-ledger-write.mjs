#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El CAMINO de escritura del libro mayor.  npm run test:ledger:write
// v4.847.0
//
// POR QUÉ NO ALCANZA `test:ledger`. Aquélla prueba el CRITERIO —que un asiento
// cuadre, que un importe entre como entero— y es puro, así que no ve nada de lo
// que de verdad puede fallar acá: que la consulta lleve los parámetros que
// lleva, que la cuenta se cree antes de la línea, que un evento reentregado no
// duplique dinero y que un fallo del libro no propague. Es la lección de
// v4.744: el criterio era correcto y el defecto estaba en el camino.
//
// No necesita Postgres: se sustituye `server/lib/db.js` por una base en memoria
// con un hook de resolución de módulos. Lo que ese doble NO demuestra es que el
// SQL sea válido para Postgres — eso se comprueba al desplegar.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const STUB = new URL('./scripts/fixtures/db-ledger-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como `'./db.js'` y con el sufijo largo no
// casarían. La prueba no fallaría ruidosamente — se conectaría a un Postgres
// que no está y todo daría «schema», que es lo que pasó al escribirla.
register(
    `data:text/javascript,export async function resolve(s,c,n){return /(^|\\/)db\\.js$/.test(s)?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    HERE
);

const ledger = await import('../server/lib/ledger.js');
const stub = await import(STUB);

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

const aporteReal = () => ledger.postDonation({
    clubId: 'club-4281',
    currency: 'COP',
    gross: 50000,
    processorFee: 4750.87,
    platformFee: 2500,
    processorFeeMeta: { original: { amount: 1.16, currency: 'USD' }, rate: 4095.58 },
    sourceRef: 'pi_4281',
    occurredAt: new Date('2026-08-16T14:31:00Z'),
});

// ── 1. Un aporte se asienta entero ──────────────────────────────────
section('1. El aporte real del Distrito, escrito');

stub.reset();
const r1 = await aporteReal();
ok('se escribió', r1.ok && !r1.duplicate, JSON.stringify(r1));
eq('un asiento', stub.tablas.LedgerTransaction.length, 1);
eq('cuatro líneas', stub.tablas.LedgerLine.length, 4);
eq('cuatro cuentas, una por concepto', stub.tablas.LedgerAccount.length, 4);
// `every` sobre una lista vacía es `true`: sin el largo, estas dos pasarían
// con el libro sin escribir nada. Es la trampa clásica de una aserción sobre
// una colección.
ok('TODA línea quedó atada a una cuenta',
    stub.tablas.LedgerLine.length === 4 && stub.tablas.LedgerLine.every(l => !!l.accountId));
ok('toda línea apunta a su asiento',
    stub.tablas.LedgerLine.length === 4
    && stub.tablas.LedgerLine.every(l => l.transactionId === stub.tablas.LedgerTransaction[0]?.id));
eq('el asiento es de tipo aporte', stub.tablas.LedgerTransaction[0].kind, 'aporte');
eq('y su referencia es la del cobro', stub.tablas.LedgerTransaction[0].sourceRef, 'pi_4281');

// Los importes llegan a la base como ENTEROS en unidad mínima. Es la regla 1 y
// acá se comprueba en el borde, que es donde se puede colar un decimal.
ok('ningún importe llegó con decimales',
    stub.tablas.LedgerLine.every(l => Number.isInteger(l.minor)));
eq('el bruto', stub.tablas.LedgerLine.find(l => l.account === 'ingreso_aportes').minor, -5000000);
eq('la comisión convertida', stub.tablas.LedgerLine.find(l => l.account === 'gasto_procesador').minor, 475087);
eq('las líneas suman cero', stub.tablas.LedgerLine.reduce((a, l) => a + l.minor, 0), 0);

// La procedencia del importe convertido llega a la base, no se pierde en el
// camino: es lo que contesta «¿por qué la comisión son 4.750 pesos?».
const metaComision = JSON.parse(stub.tablas.LedgerLine.find(l => l.account === 'gasto_procesador').meta);
eq('con su importe original en dólares', metaComision.original, { amount: 1.16, currency: 'USD' });
eq('y su tasa', metaComision.rate, 4095.58);

// ── 2. La idempotencia es REAL ──────────────────────────────────────
section('2. Un evento reentregado no duplica dinero');

const r2 = await aporteReal();
ok('el segundo intento se declara duplicado', r2.ok && r2.duplicate === true, JSON.stringify(r2));
eq('sigue habiendo UN asiento', stub.tablas.LedgerTransaction.length, 1);
eq('y CUATRO líneas', stub.tablas.LedgerLine.length, 4);

// ── 3. Las cuentas se reutilizan ────────────────────────────────────
section('3. Un segundo aporte no crea cuentas de nuevo');

await ledger.postDonation({
    clubId: 'club-4281', currency: 'COP', gross: 30000,
    processorFee: 1000, platformFee: 1500, sourceRef: 'pi_otro',
});
eq('dos asientos', stub.tablas.LedgerTransaction.length, 2);
eq('las mismas cuatro cuentas', stub.tablas.LedgerAccount.length, 4);

// Otra MONEDA sí abre cuentas nuevas: «disponible en pesos» y «disponible en
// dólares» son dos cuentas, no una con dos importes dentro.
await ledger.postDonation({
    clubId: 'club-4281', currency: 'USD', gross: 10, processorFee: 0.59, platformFee: 0.5, sourceRef: 'pi_usd',
});
eq('en dólares se abren las suyas', stub.tablas.LedgerAccount.length, 8);

// ── 4. Los saldos salen agrupados por moneda ────────────────────────
section('4. Los saldos NUNCA mezclan monedas');

const saldos = await ledger.ledgerBalances('club-4281');
ok('hay saldo en las dos monedas',
    saldos.ingreso_aportes.COP !== undefined && saldos.ingreso_aportes.USD !== undefined);
eq('los aportes en pesos', saldos.ingreso_aportes.COP, -(5000000 + 3000000));
eq('los aportes en dólares', saldos.ingreso_aportes.USD, -1000);
ok('y no se sumaron entre sí — el defecto que abrió el rediseño',
    saldos.ingreso_aportes.COP !== -(5000000 + 3000000 + 1000));

// ── 5. Liberación, retiro y anulación ───────────────────────────────
section('5. El dinero cambia de sitio');

stub.reset();
await ledger.postDonation({ clubId: 'c', currency: 'COP', gross: 50000, processorFee: 4750.87, platformFee: 2500, sourceRef: 'p1' });
await ledger.postRelease({ clubId: 'c', currency: 'COP', net: 42749.13, sourceRef: 'p1' });

let s = await ledger.ledgerBalances('c');
eq('en tránsito vuelve a cero', s.stripe_pendiente.COP, 0);
eq('y el neto queda disponible', s.club_disponible.COP, 4274913);

// El aporte y su liberación llevan la MISMA referencia y NO chocan: son hechos
// distintos y se distinguen por `sourceType`. Si chocaran, ninguna liberación
// se podría asentar.
eq('aporte y liberación conviven', stub.tablas.LedgerTransaction.length, 2);
eq('se distinguen por el tipo de origen',
    stub.tablas.LedgerTransaction.map(t => t.sourceType).sort(), ['payment', 'payment_release']);

await ledger.postPayout({ clubId: 'c', currency: 'COP', amount: 40000, sourceRef: 'po_1' });
s = await ledger.ledgerBalances('c');
eq('el retiro baja el disponible', s.club_disponible.COP, 4274913 - 4000000);
eq('y sube el transferido', s.club_transferido.COP, 4000000);

await ledger.postPayoutCancel({ clubId: 'c', currency: 'COP', amount: 40000, payoutId: 'po_1', reason: 'sin cuenta' });
s = await ledger.ledgerBalances('c');
eq('anularlo devuelve el dinero', s.club_disponible.COP, 4274913);
eq('y transferido vuelve a cero', s.club_transferido.COP, 0);
ok('el asiento del retiro NO se borró: se pidió de verdad',
    stub.tablas.LedgerTransaction.some(t => t.sourceType === 'payout'));

const dobleAnulacion = await ledger.postPayoutCancel({ clubId: 'c', currency: 'COP', amount: 40000, payoutId: 'po_1', reason: 'otra vez' });
ok('anular dos veces no devuelve el dinero dos veces', dobleAnulacion.duplicate === true);
eq('el disponible no se movió', (await ledger.ledgerBalances('c')).club_disponible.COP, 4274913);

// ── 6. Nadie paga por el libro ──────────────────────────────────────
section('6. Un fallo del libro NUNCA propaga');

stub.reset();
stub.romper('la base se cayó');
const roto = await ledger.postDonation({ clubId: 'c', currency: 'COP', gross: 1000, sourceRef: 'p_roto' });
ok('devuelve el motivo en vez de lanzar', roto.ok === false, JSON.stringify(roto));
ok('y dice cuál', typeof roto.reason === 'string' && roto.reason.length > 0);

// Un aporte imposible tampoco lanza: se rechaza al construirlo y se reporta.
const imposible = await ledger.postDonation({ clubId: 'c', currency: 'COP', gross: 100, processorFee: 500, sourceRef: 'p_mal' });
eq('un aporte imposible se rechaza al construirlo', imposible.reason, 'construccion');
eq('y no dejó nada escrito', stub.tablas.LedgerTransaction.length, 0);

// Sin club tampoco: sin él la fila no se puede aislar y el libro dejaría de
// ser el libro de alguien.
const sinClub = await ledger.postDonation({ currency: 'COP', gross: 100, sourceRef: 'p_x' });
eq('sin club se rechaza', sinClub.reason, 'construccion');

// ── 7. La conciliación ──────────────────────────────────────────────
section('7. El libro contra la Bóveda');

stub.reset();
await ledger.postDonation({ clubId: 'c', currency: 'COP', gross: 50000, processorFee: 4750.87, platformFee: 2500, sourceRef: 'p1' });

const cuadra = await ledger.reconcileClub('c', { collected: { COP: 42749.13 }, available: {} });
ok('cuadra cuando la Bóveda dice lo mismo', cuadra.neto.ok, JSON.stringify(cuadra.neto));

const difiere = await ledger.reconcileClub('c', { collected: { COP: 50000 }, available: {} });
ok('no cuadra cuando difieren', !difiere.neto.ok);
eq('y dice cuánto, en unidad mínima y en su moneda',
    difiere.neto.off, [{ currency: 'COP', ledger: 4274913, legacy: 5000000, diff: -725087 }]);

// La conciliación sólo LEE. Un diagnóstico que cambia cosas al mirarlas no
// sirve para diagnosticar.
const antes = stub.tablas.LedgerTransaction.length;
await ledger.reconcileClub('c', { collected: {}, available: {} });
eq('conciliar no escribe nada', stub.tablas.LedgerTransaction.length, antes);

// ── Resultado ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('El camino de escritura del libro hace lo que dice.');
