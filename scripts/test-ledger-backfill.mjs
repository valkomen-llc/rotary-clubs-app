#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// La CARGA del historial en el libro mayor.  npm run test:ledger:backfill
// v4.848.0 — Fase 2, primer paso
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. `ledgerBackfill.js` es puro: recibe las
// filas ya leídas y decide qué se asienta y qué no. La lectura y la escritura
// viven en `ledger.js` y se ejercitan en `test:ledger:write`.
//
// Las filas de los ejemplos son las del Distrito 4281: el aporte de 50.000 COP
// con el neto BIEN calculado (v4.846) y el de 10 USD con el neto MAL calculado
// (anterior a v4.845, con la comisión restada como si fuera de otra moneda). El
// segundo importa más que el primero — es el que prueba que la carga reproduce
// en vez de corregir.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    PAYOUT_COUNTED, refOf, planPayment, planPayout, planBackfill, summarizeSkipped,
} from '../server/lib/ledgerBackfill.js';
import { balancesOf, fromMinor } from '../server/lib/ledgerSpec.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const AYER = new Date('2026-08-10T00:00:00Z');
const HOY = new Date('2026-08-17T00:00:00Z');

// El aporte con el neto BIEN calculado: 50.000 − 4.750,87 − 2.500 = 42.749,13
const aporteBueno = {
    id: 'pay-1', providerRef: 'pi_4281', clubId: 'club-4281',
    amount: 50000, currency: 'COP', applicationFee: 2500, netAmount: 42749.13,
    clubAvailableOn: AYER, createdAt: new Date('2026-08-16T14:31:00Z'),
    rawPayload: JSON.stringify({ stripeFeeRate: 4095.58, stripeFeeConverted: true }),
};

// ── 1. Reproducir, no corregir ──────────────────────────────────────
section('1. La carga REPRODUCE lo que la plataforma registró');

const bueno = planPayment(aporteBueno, HOY);
ok('el aporte se puede asentar', bueno.ok, JSON.stringify(bueno));
const cuentas = balancesOf(bueno.entries[0].lines);
eq('el bruto es el registrado', cuentas.ingreso_aportes.COP, -5000000);
eq('la retención de la plataforma es la registrada', cuentas.gasto_plataforma.COP, 250000);
eq('la comisión se DERIVA restando', cuentas.gasto_procesador.COP, 5000000 - 250000 - 4274913);
eq('y el neto del libro es EXACTAMENTE el neto registrado',
    fromMinor(cuentas.stripe_pendiente.COP, 'COP'), 42749.13);

// ⚠️ EL CASO QUE IMPORTA. Este aporte tiene el neto MAL: es anterior a v4.845,
// cuando se restaba la comisión en dólares como si fuera de la moneda del
// cobro. 10 − 0,50 − 1,16 debería ser 8,34 y quedó en 8,91 porque se restó
// otra cosa. La carga NO lo arregla: si lo arreglara, el informe de
// conciliación mezclaría «lo que falta por cargar» con «lo que decidimos
// corregir» y dejaría de servir para autorizar el cambio de fuente.
const aporteMalo = {
    id: 'pay-2', providerRef: 'pi_viejo', clubId: 'club-4281',
    amount: 10, currency: 'USD', applicationFee: 0.5, netAmount: 8.91,
    clubAvailableOn: AYER, createdAt: new Date('2026-08-01T10:00:00Z'),
    rawPayload: JSON.stringify({ stripeFee: 0.59 }),
};
const malo = planPayment(aporteMalo, HOY);
ok('un aporte con el neto mal calculado también se asienta', malo.ok);
const cm = balancesOf(malo.entries[0].lines);
eq('con el neto EQUIVOCADO que tiene guardado, a propósito',
    fromMinor(cm.stripe_pendiente.USD, 'USD'), 8.91);
eq('y la comisión derivada es la que hace que cuadre', cm.gasto_procesador.USD, 1000 - 50 - 891);
ok('el asiento cuadra igual', Object.values(balancesOf(malo.entries[0].lines)).length > 0);

// Y se marca como ESTIMADA: no se leyó del proveedor con una tasa declarada,
// se dedujo restando. Presentarla como medida sería afirmar de más.
const lineaMala = malo.entries[0].lines.find(l => l.account === 'gasto_procesador');
eq('una comisión sin tasa declarada es ESTIMADA', lineaMala.basis, 'estimado');
ok('y dice que se dedujo restando', lineaMala.meta.derivada === true);

const lineaBuena = bueno.entries[0].lines.find(l => l.account === 'gasto_procesador');
eq('una con tasa declarada es REAL', lineaBuena.basis, 'real');
eq('y conserva la tasa con que se convirtió', lineaBuena.meta.rate, 4095.58);

// Todo asiento cargado se marca como RECONSTRUIDO. Sin eso, dentro de un año
// nadie distingue lo que se observó en vivo de lo que se dedujo del historial.
ok('el asiento se marca como reconstruido', bueno.entries[0].meta.reconstruido === true);
eq('y dice de dónde salió', bueno.entries[0].meta.desde, 'Payment');

// ── 2. La referencia es la MISMA que en vivo ────────────────────────
section('2. La carga no puede duplicar lo que el webhook ya asentó');

eq('se usa el providerRef, igual que el webhook', refOf(aporteBueno), 'pi_4281');
eq('sin providerRef se usa el id, con prefijo para no chocar por casualidad',
    refOf({ id: 'abc' }), 'id:abc');
eq('la referencia del asiento es la del cobro', bueno.entries[0].sourceRef, 'pi_4281');

// ── 3. La liberación depende de la fecha ────────────────────────────
section('3. Sólo se libera lo que el club YA puede pedir');

eq('con la fecha vencida se asienta también la liberación', bueno.entries.length, 2);
eq('la liberación mueve el neto', balancesOf(bueno.entries[1].lines).club_disponible.COP, 4274913);
eq('y sale de en tránsito', balancesOf(bueno.entries[1].lines).stripe_pendiente.COP, -4274913);

const enTransito = planPayment({ ...aporteBueno, clubAvailableOn: new Date('2026-09-01T00:00:00Z') }, HOY);
eq('con la fecha por venir sólo se asienta el aporte', enTransito.entries.length, 1);

const sinFecha = planPayment({ ...aporteBueno, clubAvailableOn: null }, HOY);
eq('sin fecha de liberación tampoco se libera', sinFecha.entries.length, 1);

// ── 4. Lo que NO se puede cargar se DICE ────────────────────────────
section('4. Un descarte silencioso es la peor forma de fallar');

const sinNeto = planPayment({ ...aporteBueno, netAmount: null }, HOY);
ok('un pago sin neto registrado no se asienta', !sinNeto.ok);
eq('y dice por qué', sinNeto.reason, 'sin_neto');
// No es una omisión: la Bóveda lo cuenta como cero, así que dejarlo fuera hace
// que los dos libros coincidan. Asentarlo con neto cero diría que el procesador
// se quedó con todo el aporte, que es falso.
ok('el motivo explica la consecuencia, no sólo el hecho',
    /cero|todo/i.test(sinNeto.detail), sinNeto.detail);

const raro = planPayment({ ...aporteBueno, netAmount: 60000 }, HOY);
ok('un neto mayor que el bruto no se asienta', !raro.ok);
eq('y se nombra', raro.reason, 'neto_mayor_que_bruto');

ok('sin club no se asienta', !planPayment({ ...aporteBueno, clubId: null }, HOY).ok);
ok('sin moneda no se asienta', !planPayment({ ...aporteBueno, currency: '' }, HOY).ok);
ok('sin importe no se asienta', !planPayment({ ...aporteBueno, amount: 0 }, HOY).ok);

// ── 5. Los retiros ──────────────────────────────────────────────────
section('5. El libro cuenta los mismos retiros que la Bóveda');

eq('los estados contados son los de computeBalances',
    PAYOUT_COUNTED, ['pending', 'processing', 'completed']);

const retiro = planPayout({ id: 'po-1', clubId: 'c', amount: 40000, currency: 'COP', status: 'completed', createdAt: AYER }, ['COP']);
ok('un retiro completado se asienta', retiro.ok);
eq('sale de disponible', balancesOf(retiro.entries[0].lines).club_disponible.COP, -4000000);

const rechazado = planPayout({ id: 'po-2', clubId: 'c', amount: 40000, currency: 'COP', status: 'rejected' }, ['COP']);
ok('un retiro RECHAZADO no se asienta', !rechazado.ok);
eq('y el motivo dice que la Bóveda tampoco lo cuenta', rechazado.reason, 'no_contado');
ok('el detalle lo explica', /tampoco lo cuenta/i.test(rechazado.detail), rechazado.detail);

// ⚠️ Hasta v4.840 la moneda del retiro no se escribía nunca y toda fila vieja
// quedó en USD por el valor por omisión de la columna. Adivinar cuál era es
// adivinar cuánto dinero salió.
const monedaFantasma = planPayout({ id: 'po-3', clubId: 'c', amount: 100, currency: 'USD', status: 'pending' }, ['COP']);
ok('un retiro en una moneda sin aportes NO se asienta', !monedaFantasma.ok);
eq('y se nombra', monedaFantasma.reason, 'moneda_sin_aportes');
ok('el motivo dice que no se adivina', /no se adivina/i.test(monedaFantasma.detail));

// Sin la lista de monedas —cuando quien llama no la tiene— no se juzga.
ok('sin lista de monedas no se descarta por eso',
    planPayout({ id: 'po-4', clubId: 'c', amount: 100, currency: 'USD', status: 'pending' }, null).ok);

// ── 6. El plan completo ─────────────────────────────────────────────
section('6. El plan dice qué entra y qué queda fuera');

const plan = planBackfill({
    payments: [aporteBueno, aporteMalo, { ...aporteBueno, id: 'pay-3', providerRef: 'pi_3', netAmount: null }],
    payouts: [
        { id: 'po-1', clubId: 'club-4281', amount: 10000, currency: 'COP', status: 'completed', createdAt: AYER },
        { id: 'po-2', clubId: 'club-4281', amount: 500, currency: 'EUR', status: 'pending', createdAt: AYER },
    ],
    now: HOY,
});

// dos aportes × (asiento + liberación) + un retiro
eq('se asentarían cinco cosas', plan.asentar.length, 5);
eq('y quedan dos fuera', plan.omitidos.length, 2);
eq('las monedas con aportes salen de los propios pagos', plan.monedasConAportes.sort(), ['COP', 'USD']);

const motivos = plan.omitidos.map(o => o.motivo).sort();
eq('con sus motivos', motivos, ['moneda_sin_aportes', 'sin_neto']);
ok('cada omitido lleva su id, importe y moneda',
    plan.omitidos.every(o => o.id && o.importe !== undefined && o.moneda !== undefined));

const resumen = summarizeSkipped([
    { motivo: 'sin_neto', id: 'a', detalle: 'x' },
    { motivo: 'sin_neto', id: 'b', detalle: 'x' },
    { motivo: 'no_contado', id: 'c', detalle: 'y' },
]);
eq('el resumen agrupa por motivo, de mayor a menor', resumen.map(r => [r.motivo, r.cuantos]),
    [['sin_neto', 2], ['no_contado', 1]]);
ok('y trae ejemplos para poder ir a mirarlos', resumen[0].ejemplos.length === 2);

// ── 7. Sobre los archivos ───────────────────────────────────────────
section('7. Lo que no se ve mirando una pantalla');

const spec = read('server/lib/ledgerBackfill.js');
const impl = read('server/lib/ledger.js');
const ctrl = read('server/controllers/payoutController.js');

ok('el criterio de la carga es puro: no importa la base',
    !/from '\.\/db\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// LA regla del módulo. Si alguien recalcula la comisión al cargar, el informe
// de conciliación deja de poder autorizar el cambio de fuente.
ok('la comisión se DERIVA restando, no se recalcula',
    /toMinor\(bruto, currency\) - toMinor\(plataforma, currency\) - toMinor\(neto, currency\)/.test(spec));
ok('y está escrito por qué', /reproduce, no se corrige/i.test(spec));

// De ensayo por defecto: sin `apply` no escribe.
ok('la carga es de ENSAYO salvo que se pida aplicarla', /apply = false/.test(impl));
ok('el endpoint sólo aplica con `apply: true` explícito', /req\.body\?\.apply === true/.test(ctrl));

// Y sigue siendo del operador.
ok('la carga es del operador de la plataforma',
    /router\.post\('\/admin\/ledger\/:clubId\/backfill', roleMiddleware\(superAdminRoles\)/.test(read('server/routes/payouts.js')));

// El presupuesto de tiempo REPORTA lo que dejó pendiente. Un corte mudo se lee
// como «ya está todo cargado», que es la conclusión equivocada.
ok('lo que no entra en el presupuesto se reporta', /pendientes/.test(impl));

// La Bóveda SIGUE sin leer el libro: el cambio de fuente es el segundo paso y
// no se da hasta que el informe cuadre.
const wallet = read('server/controllers/financialController.js');
ok('la Bóveda sigue sin leer saldos del libro', !/ledgerBalances|readableBalances/.test(wallet));

// ── 8. La conciliación compara lo COMPARABLE ────────────────────────
section('8. No se compara el disponible del libro contra el de la Bóveda');

// `computeBalances` calcula `collected − requested` SIN mirar el período de
// retención; el libro sólo llama disponible a lo liberado. Con un aporte en
// tránsito los dos difieren estando los dos bien.
ok('el informe compara `neto − transferido`, no `club_disponible`',
    /const saldo = \{\}/.test(impl) && /neto\[code\] \|\| 0\) - \(balances\.club_transferido/.test(impl));
ok('lo que sólo sabe el libro se devuelve aparte, sin comparar',
    /soloEnElLibro/.test(impl));
ok('y está escrito por qué', /no son la misma cantidad/i.test(impl));

// ── Resultado ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('La carga del historial reproduce en vez de corregir.');
