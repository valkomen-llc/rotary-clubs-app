#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El CRITERIO del libro mayor.  npm run test:ledger
// v4.847.0 — Fase 1 del rediseño de la Bóveda
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. Prueban `ledgerSpec.js`, que es puro,
// separado de `ledger.js`, que orquesta — por el mismo motivo que `seoRules.js`
// vive aparte de `seoAudit.js`: un motor contable que sólo se ejercita contra
// una base real termina sin pruebas, y entonces nadie se entera de que una
// regla cambió de signo.
//
// Los importes de los ejemplos son los REALES del Distrito 4281 —el aporte de
// 50.000 COP con su comisión de USD 1,16— y no unos inventados para que la
// prueba pase.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    ACCOUNTS, ACCOUNT_IDS, isAccount, ENTRY_IDS, isEntryType,
    toMinor, fromMinor, line, imbalanceOf, assertBalanced, balancesOf,
    buildDonationEntry, buildReleaseEntry, buildPayoutEntry, buildPayoutCancelEntry, buildReversal,
    compareBalances,
} from '../server/lib/ledgerSpec.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const throws = (name, fn, match) => {
    try { fn(); ok(name, false, 'no lanzó'); }
    catch (e) { ok(name, !match || new RegExp(match, 'i').test(e.message), `lanzó "${e.message}"`); }
};
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 1. Unidad mínima ────────────────────────────────────────────────
section('1. Todo entra al libro como ENTERO en unidad mínima');

eq('COP se lleva con dos decimales — es la unidad con que Stripe cobra', toMinor(50000, 'COP'), 5000000);
eq('USD 1,16 son 116', toMinor(1.16, 'USD'), 116);
eq('JPY no tiene unidad menor', toMinor(1250, 'JPY'), 1250);
eq('ida y vuelta en COP', fromMinor(toMinor(50000, 'COP'), 'COP'), 50000);
eq('ida y vuelta en JPY', fromMinor(toMinor(1250, 'JPY'), 'JPY'), 1250);

// ⚠️ Éste es el hallazgo que obligó a llevar el libro en enteros. `8.915` no
// existe como doble: el más cercano es 8.9149999…, así que redondear a dos
// decimales da 8,91 y no 8,92. Sobre un aporte suelto es un centavo; sobre un
// libro que se suma miles de veces es un descuadre que nadie puede explicar.
eq('el redondeo binario pierde un centavo — POR ESO se llevan enteros', Math.round(8.915 * 100), 891);
eq('en enteros ese centavo no existe', toMinor(8.91, 'USD') + toMinor(0.01, 'USD'), 892);

throws('un importe no numérico no entra al libro', () => toMinor('abc', 'USD'), 'no numérico');
throws('NaN tampoco', () => toMinor(NaN, 'USD'), 'no numérico');

// ── 2. Catálogos cerrados ───────────────────────────────────────────
section('2. Las cuentas y los tipos de asiento son catálogos CERRADOS');

ok('hay seis cuentas', ACCOUNT_IDS.length === 6, `hay ${ACCOUNT_IDS.length}`);
ok('toda cuenta declara etiqueta, signo y ayuda',
    ACCOUNT_IDS.every(k => ACCOUNTS[k].label && ACCOUNTS[k].help && [1, -1].includes(ACCOUNTS[k].sign)));
ok('los aportes son un ingreso: su saldo natural es negativo', ACCOUNTS.ingreso_aportes.sign === -1);
ok('el disponible es un activo: su saldo natural es positivo', ACCOUNTS.club_disponible.sign === +1);
ok('una cuenta inventada no existe', !isAccount('caja_chica'));
ok('un tipo de asiento inventado no existe', !isEntryType('lo_que_sea'));
ok('los cinco tipos declarados existen', ENTRY_IDS.every(isEntryType));

// La etiqueta que pidió el cliente, textual. Es una REGLA EXPRESA y la prueba
// la fija: renombrarla de vuelta «por criterio propio» tiene que fallar acá.
eq('la tarifa del procesador lleva el nombre que pidió el cliente',
    ACCOUNTS.gasto_procesador.label, 'Tarifa de procesamiento de traslado desde interbancos');

// ── 3. Una línea se valida al construirla ───────────────────────────
section('3. Una línea inválida no llega a escribirse');

throws('cuenta desconocida', () => line({ account: 'x', currency: 'COP', minor: 1 }), 'desconocida');
throws('sin moneda', () => line({ account: 'club_disponible', currency: '', minor: 1 }), 'sin moneda');
throws('importe con decimales', () => line({ account: 'club_disponible', currency: 'COP', minor: 1.5 }), 'entero');
throws('base desconocida', () => line({ account: 'club_disponible', currency: 'COP', minor: 1, basis: 'quizas' }), 'base');
eq('la moneda se normaliza', line({ account: 'club_disponible', currency: 'cop', minor: 1 }).currency, 'COP');
ok('«estimado» es una base válida y se conserva',
    line({ account: 'gasto_procesador', currency: 'USD', minor: 1, basis: 'estimado' }).basis === 'estimado');

// ── 4. El cuadre es POR MONEDA ──────────────────────────────────────
section('4. Un asiento cuadra POR MONEDA, no en total');

const mezclado = [
    { account: 'club_disponible', currency: 'USD', minor: 1000 },
    { account: 'ingreso_aportes', currency: 'COP', minor: -1000 },
];
eq('+10 USD y −10 COP NO cuadran, aunque sumen cero', imbalanceOf(mezclado), { USD: 1000, COP: -1000 });
throws('y por eso no se pueden escribir', () => assertBalanced(mezclado), 'no cuadra');

eq('cuadrado en su moneda no reporta nada', imbalanceOf([
    { account: 'club_disponible', currency: 'COP', minor: 5000000 },
    { account: 'stripe_pendiente', currency: 'COP', minor: -5000000 },
]), {});

eq('dos monedas, cada una cuadrada en la suya, es válido', imbalanceOf([
    { account: 'club_disponible', currency: 'COP', minor: 100 },
    { account: 'stripe_pendiente', currency: 'COP', minor: -100 },
    { account: 'club_disponible', currency: 'USD', minor: 50 },
    { account: 'stripe_pendiente', currency: 'USD', minor: -50 },
]), {});

eq('los saldos se agrupan por cuenta Y moneda', balancesOf([
    { account: 'club_disponible', currency: 'COP', minor: 100 },
    { account: 'club_disponible', currency: 'USD', minor: 7 },
    { account: 'club_disponible', currency: 'COP', minor: 25 },
]), { club_disponible: { COP: 125, USD: 7 } });

// ── 5. El asiento de un aporte ──────────────────────────────────────
section('5. El aporte real del Distrito, asentado');

// 50.000 COP. Stripe cobró USD 1,16, que a la TRM del día (≈ 4.095,58) son
// 4.750,87 COP. La plataforma retiene el 5 %: 2.500 COP.
const aporte = buildDonationEntry({
    clubId: 'club-4281',
    currency: 'COP',
    grossMinor: toMinor(50000, 'COP'),
    processorFeeMinor: toMinor(4750.87, 'COP'),
    platformFeeMinor: toMinor(2500, 'COP'),
    processorFeeMeta: { original: { amount: 1.16, currency: 'USD' }, rate: 4095.58, rateSource: 'Superintendencia Financiera' },
    sourceRef: 'pi_test_4281',
    occurredAt: new Date('2026-08-16T14:31:00Z'),
});

ok('cuadra', imbalanceOf(aporte.lines) && Object.keys(imbalanceOf(aporte.lines)).length === 0);
eq('lleva cuatro líneas', aporte.lines.length, 4);
const cuentas = balancesOf(aporte.lines);
eq('el bruto entra como ingreso, en negativo', cuentas.ingreso_aportes.COP, -5000000);
eq('la comisión del procesador queda en pesos', cuentas.gasto_procesador.COP, 475087);
eq('la retención de la plataforma también', cuentas.gasto_plataforma.COP, 250000);
eq('y el NETO queda en tránsito', cuentas.stripe_pendiente.COP, 5000000 - 475087 - 250000);
eq('el neto en importe legible', fromMinor(cuentas.stripe_pendiente.COP, 'COP'), 42749.13);

// La procedencia del importe convertido viaja con su línea: sin ella, «¿por
// qué la comisión son 4.750 pesos?» no se puede contestar dentro del libro.
const lineaComision = aporte.lines.find(l => l.account === 'gasto_procesador');
eq('la línea conserva el importe ORIGINAL en dólares', lineaComision.meta.original, { amount: 1.16, currency: 'USD' });
eq('y la tasa con la que se convirtió', lineaComision.meta.rate, 4095.58);
eq('y su fuente', lineaComision.meta.rateSource, 'Superintendencia Financiera');

ok('NINGUNA línea del asiento está en dólares — la conversión ya ocurrió',
    aporte.lines.every(l => l.currency === 'COP'));

// El neto no se recibe de fuera: se deriva. Aceptarlo permitiría escribir un
// asiento que cuadra porque alguien mandó el número que hacía falta.
ok('el constructor no acepta un neto', !('netMinor' in aporte));

// ── 6. Un aporte imposible no se asienta ────────────────────────────
section('6. Lo que no puede haber ocurrido, no se escribe');

throws('bruto en cero', () => buildDonationEntry({
    clubId: 'c', currency: 'COP', grossMinor: 0, sourceRef: 'x',
}), 'bruto');
throws('bruto con decimales', () => buildDonationEntry({
    clubId: 'c', currency: 'COP', grossMinor: 100.5, sourceRef: 'x',
}), 'bruto');
throws('sin club', () => buildDonationEntry({
    currency: 'COP', grossMinor: 100, sourceRef: 'x',
}), 'club');
throws('sin referencia de origen — sin ella no hay idempotencia', () => buildDonationEntry({
    clubId: 'c', currency: 'COP', grossMinor: 100,
}), 'referencia');
throws('retención negativa', () => buildDonationEntry({
    clubId: 'c', currency: 'COP', grossMinor: 100, processorFeeMinor: -5, sourceRef: 'x',
}), 'negativa');
throws('retenciones mayores que el aporte', () => buildDonationEntry({
    clubId: 'c', currency: 'COP', grossMinor: 100, processorFeeMinor: 200, sourceRef: 'x',
}), 'superan');

// Un aporte sin comisiones —el caso de un cobro en la moneda de liquidación con
// la retención en cero— no deja líneas de cero: un libro lleno de ceros esconde
// las líneas que sí dicen algo.
const limpio = buildDonationEntry({ clubId: 'c', currency: 'USD', grossMinor: 1000, sourceRef: 'y' });
eq('sin retenciones son dos líneas, no cuatro con ceros', limpio.lines.length, 2);

// ── 7. Liberación y retiro ──────────────────────────────────────────
section('7. El dinero cambia de sitio sin entrar ni salir');

const liberacion = buildReleaseEntry({ clubId: 'c', currency: 'COP', netMinor: 4274913, sourceRef: 'pay_1' });
const bl = balancesOf(liberacion.lines);
eq('sale de en tránsito', bl.stripe_pendiente.COP, -4274913);
eq('y entra a disponible', bl.club_disponible.COP, 4274913);
ok('no toca ingresos ni gastos: no entró ni salió nada',
    !bl.ingreso_aportes && !bl.gasto_procesador && !bl.gasto_plataforma);

const retiro = buildPayoutEntry({ clubId: 'c', currency: 'COP', amountMinor: 1000000, sourceRef: 'po_1' });
const br = balancesOf(retiro.lines);
eq('el retiro sale de disponible', br.club_disponible.COP, -1000000);
eq('y queda como transferido', br.club_transferido.COP, 1000000);

throws('un retiro de cero no es un hecho', () => buildPayoutEntry({
    clubId: 'c', currency: 'COP', amountMinor: 0, sourceRef: 'x',
}), 'inválido');
throws('ni uno con decimales', () => buildPayoutEntry({
    clubId: 'c', currency: 'COP', amountMinor: 10.5, sourceRef: 'x',
}), 'inválido');

// Anular un retiro NO es revertirlo, y la diferencia no es de estilo: el club
// pidió el retiro de verdad y ese hecho se queda.
const anulado = buildPayoutCancelEntry({
    clubId: 'c', currency: 'COP', amountMinor: 1000000, sourceRef: 'po_1:anulado', reason: 'sin cuenta verificada',
});
const ba = balancesOf(anulado.lines);
eq('anular devuelve el dinero a disponible', ba.club_disponible.COP, 1000000);
eq('y lo saca de transferido', ba.club_transferido.COP, -1000000);
eq('el tipo dice que es una anulación, no un reverso', anulado.kind, 'retiro_anulado');
eq('retiro + anulación dejan las cuentas en cero',
    Object.values(balancesOf([...retiro.lines, ...anulado.lines])).flatMap(Object.values).filter(v => v !== 0), []);

// ── 8. Corregir es AGREGAR ──────────────────────────────────────────
section('8. El libro sólo agrega: corregir es revertir');

const reverso = buildReversal({ entry: aporte, sourceRef: 'rev_1', reason: 'la comisión se leyó de otra moneda' });
eq('el reverso tiene las mismas líneas', reverso.lines.length, aporte.lines.length);
ok('con el signo cambiado', reverso.lines.every((l, i) => l.minor === -aporte.lines[i].minor));
ok('y también cuadra', Object.keys(imbalanceOf(reverso.lines)).length === 0);
eq('el original queda nombrado', reverso.meta.original.sourceRef, 'pi_test_4281');
eq('y el motivo también', reverso.meta.reason, 'la comisión se leyó de otra moneda');

// El asiento original más su reverso dejan el libro en cero. Es lo que hace que
// no haga falta borrar nunca.
eq('original + reverso = libro en cero',
    imbalanceOf([...aporte.lines, ...reverso.lines]), {});
eq('y todas las cuentas vuelven a cero',
    Object.values(balancesOf([...aporte.lines, ...reverso.lines])).flatMap(Object.values).filter(v => v !== 0), []);

throws('un reverso sin motivo no se puede auditar',
    () => buildReversal({ entry: aporte, sourceRef: 'r' }), 'motivo');
throws('no hay nada que revertir sin asiento',
    () => buildReversal({ entry: null, sourceRef: 'r', reason: 'x' }), 'revertir');

// ── 9. La conciliación ──────────────────────────────────────────────
section('9. Contrastar el libro con la Bóveda');

const igual = compareBalances({ COP: 4274913, USD: 891 }, { COP: 4274913, USD: 891 });
ok('cuadra cuando dicen lo mismo', igual.ok);
eq('sin diferencias', igual.off, []);

const difiere = compareBalances({ COP: 4274913 }, { COP: 5000000 });
ok('no cuadra cuando difieren', !difiere.ok);
eq('y dice cuánto, en su moneda', difiere.off, [{ currency: 'COP', ledger: 4274913, legacy: 5000000, diff: -725087 }]);

// Una moneda que sólo está de un lado es JUSTO lo que hay que ver: filtrarla
// escondería el caso que la comparación existe para encontrar.
const soloUno = compareBalances({ COP: 100 }, { USD: 50 });
eq('una moneda presente en un solo lado se reporta con el otro en cero', soloUno.byCurrency, {
    COP: { ledger: 100, legacy: 0, diff: 100 },
    USD: { ledger: 0, legacy: 50, diff: -50 },
});
ok('nunca se compensan entre monedas', soloUno.off.length === 2);

// ── 10. Sobre el archivo ────────────────────────────────────────────
section('10. Lo que no se ve mirando una pantalla');

const spec = read('server/lib/ledgerSpec.js');
const impl = read('server/lib/ledger.js');
const schema = read('server/lib/ensureLedgerSchema.js');

// El criterio es PURO: si importara la base, probarlo exigiría Postgres y en la
// práctica no se probaría.
ok('ledgerSpec.js no importa la base ni la red',
    !/from '\.\/(db|prisma)\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// El libro SÓLO AGREGA. Un UPDATE o un DELETE sobre una línea rompen la única
// propiedad que hace útil un libro, y no lo ve ninguna otra comprobación.
ok('nadie hace UPDATE sobre una línea', !/UPDATE\s+"LedgerLine"/i.test(impl));
ok('nadie hace DELETE sobre una línea', !/DELETE\s+FROM\s+"LedgerLine"/i.test(impl));
ok('nadie hace UPDATE sobre un asiento', !/UPDATE\s+"LedgerTransaction"/i.test(impl));

// La idempotencia es de la BASE, no de una lectura previa.
ok('el asiento lleva índice único por (sourceType, sourceRef)',
    /UNIQUE INDEX[^;]*"LedgerTransaction_source_key"[^;]*"sourceType", "sourceRef"/s.test(schema));
ok('y se apoya en él al insertar',
    /ON CONFLICT \("sourceType", "sourceRef"\) DO NOTHING/.test(impl));

// El importe es BIGINT: un `numeric` invitaría a meter decimales y un `int`
// desbordaría con un aporte grande en pesos (50.000 COP ya son 5.000.000).
ok('el importe de la línea es BIGINT', /minor\s+BIGINT NOT NULL/.test(schema));

// La consulta de saldos agrupa por moneda. ES el defecto que abrió todo esto.
// Cada `SUM(minor)` del libro tiene que quedar bajo un `GROUP BY` que incluya
// la moneda. Se comprueba una por una en vez de con una expresión regular
// astuta: una aserción que nadie puede leer no protege nada.
const sumas = impl.split('SUM(minor)').slice(1);
ok('hay al menos una consulta de saldos', sumas.length >= 1);
ok('TODA suma del libro agrupa por moneda — es el defecto que abrió el rediseño',
    sumas.every(cola => {
        const group = cola.match(/GROUP BY ([^\n`]*)/);
        return !!group && /currency/.test(group[1]);
    }));

// Nadie paga por el libro: las funciones de escritura no propagan.
ok('postEntry no propaga: devuelve el motivo', /return \{ ok: false, reason: 'escritura'/.test(impl));
ok('postDonation atrapa el fallo de construcción', /reason: 'construccion'/.test(impl));

// NADIE LO LEE TODAVÍA. Es la definición de la fase en sombra, y si algún día
// la Bóveda empieza a leer de acá tiene que ser a propósito, no por deriva.
const wallet = read('server/controllers/financialController.js');
ok('la Bóveda NO lee saldos del libro todavía (fase en sombra)',
    !/ledgerBalances|readableBalances/.test(wallet));
ok('lo único que escribe la Bóveda es la liberación', /postRelease/.test(wallet));

// ⚠️ Que el libro no propague tiene un precio: si quien lo llama le pasa un
// dato incompleto, el asiento se rechaza EN SILENCIO en todos los casos y
// nadie se entera. Pasó al escribir esto — el `select` del sync no pedía
// `clubId`, así que cada liberación se caía por «necesita club».
// Al enganchar un asiento nuevo, comprobar que su llamador tenga los datos.
const selectDelSync = wallet.match(/select: \{[\s\S]*?take: 200/);
ok('el sync pide `clubId`, que es lo que el asiento de liberación necesita',
    !!selectDelSync && /clubId: true/.test(selectDelSync[0]));

// El webhook saca el club de la metadata de la sesión, no de un `select`.
const pagos = read('server/controllers/paymentController.js');
ok('el webhook asienta el aporte con el club que ya tenía',
    /postDonation\(\{[\s\S]{0,80}clubId,/.test(pagos));

// No hay tabla de saldos: sería una segunda verdad sobre las mismas líneas.
ok('no hay tabla de saldos materializados',
    !/CREATE TABLE[^;]*"LedgerBalance"/i.test(schema));

// El guardián de db:push la nombra: la lista es documentación y se mantiene.
ok('el guardián de db:push nombra las tres tablas del libro',
    /LedgerAccount, LedgerTransaction y LedgerLine/.test(read('scripts/db-push-guard.mjs')));

// ── Resultado ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('El criterio del libro mayor está donde debe.');
