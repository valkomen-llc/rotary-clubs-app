#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Los FILTROS de la Bóveda.  npm run test:wallet:filters
// v4.849.0 — Bloque A del informe por período
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro y vive aparte de la
// orquestación, como `seoRules.js` frente a `seoAudit.js`.
//
// Lo que estas pruebas protegen sobre todo es UNA regla: un saldo no se filtra
// por fecha. Es la que evita que alguien elija «últimos 7 días», vea «US$ 0,00»
// y concluya que no tiene dinero — justo en el número con el que decide si pide
// un retiro.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
    FILTRABLE, NO_FILTRABLE, RANGOS, RANGO_DEFAULT, isRango, resolveRango,
    dentroDelRango, parseFecha, DESTINO_TODOS, DESTINO_SIN_DECLARAR,
    destinoKeyOf, catalogoDestinos, esDelDestino, aplicarFiltros, hayFiltro,
    resumenDelPeriodo,
} from '../server/lib/walletFilters.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const AHORA = new Date('2026-08-17T09:00:00Z');

// ── 1. La regla de la que cuelga todo ───────────────────────────────
section('1. Un SALDO no se filtra por fecha');

ok('el saldo disponible NO está entre lo filtrable', !FILTRABLE.includes('saldo_disponible'));
ok('ni el dinero en tránsito', !FILTRABLE.includes('en_transito'));
ok('y los dos están nombrados como NO filtrables',
    !!NO_FILTRABLE.saldo_disponible && !!NO_FILTRABLE.en_transito);
ok('con el motivo escrito, no sólo el hecho',
    /saldo, no un flujo/i.test(NO_FILTRABLE.saldo_disponible), NO_FILTRABLE.saldo_disponible);
eq('lo que SÍ se filtra son flujos y movimientos',
    FILTRABLE, ['aportes', 'comisiones', 'neto_periodo', 'movimientos']);

// ── 2. Los rangos ───────────────────────────────────────────────────
section('2. Los rangos, y por qué el default es «todo»');

eq('el valor por defecto es todo el histórico', RANGO_DEFAULT, 'todo');
// ⚠️ Con «hoy» por defecto la Bóveda abriría casi siempre en cero —los aportes
// de un club no son diarios— y se leería como un módulo roto. Y `todo` es lo
// que la pantalla muestra desde siempre: el filtro es ADITIVO.
ok('«hoy» NO es un rango ofrecido', !isRango('hoy'));
ok('un rango inventado no existe', !isRango('lo_que_sea'));
eq('se ofrecen seis', RANGOS.length, 6);
ok('todos declaran id, rótulo y días', RANGOS.every(r => r.id && r.label && 'dias' in r));

const todo = resolveRango({}, AHORA);
eq('«todo» no pone límite por abajo', todo.desde, null);
eq('ni por arriba', todo.hasta, null);
// No se inventa una fecha de inicio: el club puede llevar años y un tope
// arbitrario escondería aportes reales.

const siete = resolveRango({ rango: '7d' }, AHORA);
eq('«últimos 7 días» arranca hace seis días, a las 00:00',
    siete.desde.toISOString(), '2026-08-11T00:00:00.000Z');
// Incluye HOY: contar siete hacia atrás desde ayer daría ocho días de ventana
// o dejaría hoy fuera, y quien lo elige espera ver lo de hoy.
eq('y termina hoy al final del día', siete.hasta.toISOString(), '2026-08-17T23:59:59.999Z');
eq('son siete días exactos',
    Math.round((siete.hasta - siete.desde) / 86400000), 7);

const noventa = resolveRango({ rango: '90d' }, AHORA);
eq('noventa días son noventa', Math.round((noventa.hasta - noventa.desde) / 86400000), 90);

// ── 3. El rango personalizado ───────────────────────────────────────
section('3. El rango personalizado no se rompe con lo que llegue');

const rp = resolveRango({ rango: 'personalizado', desde: '2026-08-01', hasta: '2026-08-15' }, AHORA);
eq('empieza al comienzo del primer día', rp.desde.toISOString(), '2026-08-01T00:00:00.000Z');
// Un rango «del 1 al 15» tiene que incluir el día 15 entero: acotarlo a las
// 00:00 se come el último día y nadie entiende por qué falta un aporte.
eq('y termina al FINAL del último', rp.hasta.toISOString(), '2026-08-15T23:59:59.999Z');

const invertido = resolveRango({ rango: 'personalizado', desde: '2026-08-15', hasta: '2026-08-01' }, AHORA);
eq('invertido se endereza: es un error de dedo, no una petición vacía',
    [invertido.desde.toISOString(), invertido.hasta.toISOString()],
    ['2026-08-01T00:00:00.000Z', '2026-08-15T23:59:59.999Z']);

eq('sin ninguna de las dos puntas degrada a «todo» en vez de vaciar la lista',
    resolveRango({ rango: 'personalizado' }, AHORA).id, 'todo');

const soloDesde = resolveRango({ rango: 'personalizado', desde: '2026-08-01' }, AHORA);
ok('con una sola punta se respeta y la otra queda abierta',
    soloDesde.desde !== null && soloDesde.hasta === null);

eq('una fecha ilegible no lanza', resolveRango({ rango: 'personalizado', desde: 'ayer' }, AHORA).id, 'todo');
eq('parseFecha con basura devuelve null', parseFecha('no-es-fecha'), null);

// ── 4. Qué cae dentro ───────────────────────────────────────────────
section('4. Qué cae dentro del rango');

const r = resolveRango({ rango: 'personalizado', desde: '2026-08-01', hasta: '2026-08-15' }, AHORA);
ok('una fecha del medio entra', dentroDelRango('2026-08-07T12:00:00Z', r));
ok('el primer día entra', dentroDelRango('2026-08-01T00:00:01Z', r));
ok('el último día entra ENTERO', dentroDelRango('2026-08-15T23:59:00Z', r));
ok('un día antes no entra', !dentroDelRango('2026-07-31T23:00:00Z', r));
ok('un día después tampoco', !dentroDelRango('2026-08-16T00:00:01Z', r));
ok('sin rango entra todo', dentroDelRango('1999-01-01', todo));

// ⚠️ Una fila SIN fecha legible se INCLUYE. Descartarla haría desaparecer
// dinero de la pantalla por un dato ausente, que es el error que este módulo
// no puede cometer.
ok('una fila sin fecha se incluye, no se descarta', dentroDelRango(null, r));
ok('y una con fecha ilegible también', dentroDelRango('vaya usted a saber', r));

// ── 5. Los destinos ─────────────────────────────────────────────────
section('5. «Destino» son cuatro clases, no sólo campañas');

// ⚠️ Un aporte puede venir de una campaña, un proyecto, un bloque o del club a
// secas. Un filtro que sólo listara campañas haría desaparecer del listado a
// todos los demás sin que nadie supiera por qué.
eq('una campaña se agrupa por su id',
    destinoKeyOf({ kind: 'campana', id: 'c1', label: 'Terremoto Colombia' }), 'campana:c1');
eq('un proyecto también', destinoKeyOf({ kind: 'proyecto', id: 'p9', label: 'Agua' }), 'proyecto:p9');
eq('sin id se usa el rótulo, que es lo único que lo distingue',
    destinoKeyOf({ kind: 'destino', label: 'Aporte Voluntario' }), 'destino:Aporte Voluntario');
eq('sin origen cae en «sin destino declarado»', destinoKeyOf(null), DESTINO_SIN_DECLARAR);
eq('y un origen vacío también', destinoKeyOf({ kind: 'campana' }), DESTINO_SIN_DECLARAR);

const filas = [
    { origen: { kind: 'campana', id: 'c1', label: 'Terremoto Colombia' }, currency: 'COP', amount: 50000 },
    { origen: { kind: 'campana', id: 'c1', label: 'Terremoto Colombia' }, currency: 'USD', amount: 10 },
    { origen: { kind: 'proyecto', id: 'p1', label: 'Agua potable' }, currency: 'COP', amount: 20000 },
    { origen: null, currency: 'USD', amount: 5 },
];
const cat = catalogoDestinos(filas);
eq('el catálogo sale de los aportes REALES, no de una lista de campañas', cat.length, 3);
eq('las campañas van primero', cat[0].kind, 'campana');
eq('y «sin destino» al final', cat[cat.length - 1].key, DESTINO_SIN_DECLARAR);
eq('cada destino cuenta sus aportes', cat[0].cuantos, 2);
// El importe se guarda POR MONEDA. Nunca un total que las mezcle: es la regla
// del módulo desde v4.841.
eq('y sus importes por moneda, sin mezclarlas', cat[0].porMoneda, { COP: 50000, USD: 10 });
ok('los aportes sin destino NO desaparecen del catálogo',
    cat.some(d => d.key === DESTINO_SIN_DECLARAR));

ok('«todos» no filtra', esDelDestino({ kind: 'campana', id: 'c1' }, DESTINO_TODOS));
ok('sin destino elegido tampoco', esDelDestino(null, null));
ok('un destino concreto sí', esDelDestino({ kind: 'campana', id: 'c1', label: 'x' }, 'campana:c1'));
ok('y deja fuera a los demás', !esDelDestino({ kind: 'campana', id: 'c2', label: 'y' }, 'campana:c1'));

// ── 6. El filtro completo ───────────────────────────────────────────
section('6. Aplicar los dos filtros, y decir qué quedó fuera');

const aportes = [
    { id: 'a', date: '2026-08-16T10:00:00Z', movement: { origin: { kind: 'campana', id: 'c1', label: 'Terremoto' } } },
    { id: 'b', date: '2026-06-01T10:00:00Z', movement: { origin: { kind: 'campana', id: 'c1', label: 'Terremoto' } } },
    { id: 'c', date: '2026-08-15T10:00:00Z', movement: { origin: { kind: 'proyecto', id: 'p1', label: 'Agua' } } },
    { id: 'd', date: '2026-08-15T10:00:00Z', movement: null },
];

const sinFiltro = aplicarFiltros(aportes, { rango: todo, destino: DESTINO_TODOS });
eq('sin filtro entran todos', sinFiltro.donations.length, 4);
eq('y no queda nada fuera', sinFiltro.excluidos, 0);

const ultimos7 = aplicarFiltros(aportes, { rango: resolveRango({ rango: '7d' }, AHORA), destino: DESTINO_TODOS });
eq('«últimos 7 días» deja tres', ultimos7.donations.map(d => d.id), ['a', 'c', 'd']);
// Sin este número, quien filtra no distingue «este período no tuvo aportes» de
// «el filtro se comió algo», y en dinero eso no se puede confundir.
eq('y DICE cuántos dejó fuera', ultimos7.excluidos, 1);

const porCampana = aplicarFiltros(aportes, { rango: todo, destino: 'campana:c1' });
eq('por destino deja los de esa campaña', porCampana.donations.map(d => d.id), ['a', 'b']);

const ambos = aplicarFiltros(aportes, { rango: resolveRango({ rango: '7d' }, AHORA), destino: 'campana:c1' });
eq('los dos filtros se aplican juntos', ambos.donations.map(d => d.id), ['a']);

const sinDestino = aplicarFiltros(aportes, { rango: todo, destino: DESTINO_SIN_DECLARAR });
eq('«sin destino declarado» es un filtro usable, no un hueco',
    sinDestino.donations.map(d => d.id), ['d']);

ok('sin filtros no hay nada que limpiar', !hayFiltro({ rango: { id: 'todo' }, destino: DESTINO_TODOS }));
ok('con un rango puesto sí', hayFiltro({ rango: { id: '7d' }, destino: DESTINO_TODOS }));
ok('con un destino puesto también', hayFiltro({ rango: { id: 'todo' }, destino: 'campana:c1' }));

// ── 6b. El resumen del período ──────────────────────────────────────
section('6b. Lo que el club recibió en el período');

// ⚠️ Los nombres vienen de `movementOf`, NO de la columna de la base: la
// retención viaja como `applicationFee` y el neto como `amount`. Leerlos con el
// nombre de la columna no da error —da `undefined`, que suma cero— y el bloque
// habría mostrado «0» de retención y «0» de neto diciendo ser el del período.
// Por eso esta función vive acá y no en el controlador: ahí no se podía probar.
const resumen = resumenDelPeriodo([
    { currency: 'COP', amount: 50000, movement: { stripeFee: 4754, applicationFee: 2500, amount: 42746 } },
    { currency: 'USD', amount: 10, movement: { stripeFee: 0.59, applicationFee: 0.5, amount: 8.91 } },
    { currency: 'COP', amount: 1000, movement: null },
]);
eq('el bruto se agrupa por moneda', resumen.bruto, { COP: 51000, USD: 10 });
eq('la retención de la plataforma NO sale en cero', resumen.plataforma, { COP: 2500, USD: 0.5 });
eq('ni el neto', resumen.neto, { COP: 42746, USD: 8.91 });
eq('la tarifa del procesador tampoco', resumen.procesador, { COP: 4754, USD: 0.59 });
eq('se cuentan todos los aportes', resumen.aportes, 3);

// Un aporte sin movimiento aporta su BRUTO y no sus retenciones. Se cuenta lo
// que se sabe y se DICE cuántos quedaron sin medir, en vez de inventarles una
// comisión — pero callarlo haría que el neto pareciera completo.
eq('y se DICE cuántos no tienen movimiento', resumen.sinMovimiento, 1);
ok('el bruto del que no tiene movimiento SÍ se cuenta', resumen.bruto.COP === 51000);

eq('sin aportes devuelve mapas vacíos, no ceros inventados',
    resumenDelPeriodo([]), { bruto: {}, procesador: {}, plataforma: {}, neto: {}, aportes: 0, sinMovimiento: 0 });

// NUNCA un total que mezcle monedas: es la regla del módulo desde v4.841.
ok('no hay ninguna clave que sume las dos monedas',
    !('total' in resumen.bruto) && Object.keys(resumen.bruto).every(k => k === 'COP' || k === 'USD'));

// ── 7. El espejo del navegador ──────────────────────────────────────
section('7. Los dos espejos dicen lo mismo');

let espejo = null;
try {
    const out = execFileSync('npx', ['esbuild', 'src/lib/walletFilters.ts', '--format=esm', '--bundle', '--platform=neutral'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    espejo = await import(`data:text/javascript,${encodeURIComponent(out)}`);
} catch { /* sin esbuild se salta */ }

if (!espejo) {
    console.log('  · esbuild no disponible — se salta la paridad (npm i --no-save esbuild)');
} else {
    eq('el catálogo de rangos es el mismo', espejo.RANGOS, RANGOS);
    eq('y el valor por defecto', espejo.RANGO_DEFAULT, RANGO_DEFAULT);
    eq('y la clave de «todos los destinos»', espejo.DESTINO_TODOS, DESTINO_TODOS);
    eq('y la de «sin destino declarado»', espejo.DESTINO_SIN_DECLARAR, DESTINO_SIN_DECLARAR);

    // Se comparan las SALIDAS, no sólo las constantes: es lo que sostiene que
    // la pantalla y el servidor estén de acuerdo sobre si hay filtro puesto.
    const casos = [
        {}, { rango: 'todo' }, { rango: '7d' }, { destino: 'todos' },
        { destino: 'campana:c1' }, { rango: '30d', destino: 'campana:c1' },
    ];
    ok('`hayFiltro` da lo mismo en los dos, caso por caso',
        casos.every(c => espejo.hayFiltro(c) === hayFiltro({ rango: { id: c.rango || 'todo' }, destino: c.destino })));
    ok('`isRango` también',
        ['todo', '7d', 'hoy', 'personalizado', 'x'].every(id => espejo.isRango(id) === isRango(id)));

    // El texto del aviso vive en el espejo, no suelto en el JSX: es una
    // afirmación sobre cómo se comporta el módulo, no una etiqueta.
    ok('el aviso dice que el saldo NO se filtra',
        /saldo disponible es el actual/i.test(espejo.AVISO_SALDO), espejo.AVISO_SALDO);
}

// ── 8. Sobre los archivos ───────────────────────────────────────────
section('8. Lo que no se ve mirando una pantalla');

const spec = read('server/lib/walletFilters.js');
const ctrl = read('server/controllers/financialController.js');
const ui = read('src/pages/admin/WalletManagement.tsx');
const payouts = read('server/controllers/payoutController.js');

ok('el criterio es puro: no importa la base ni la red',
    !/from '\.\/(db|prisma)\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// ⚠️ LA COMPROBACIÓN QUE IMPORTA. `computeBalances` es de donde sale el saldo
// disponible: si algún día aceptara un rango, el número que decide un retiro
// pasaría a depender de un filtro de pantalla.
ok('`computeBalances` NO recibe ningún rango de fechas',
    /export const computeBalances = async \(clubId\) =>/.test(payouts));
ok('y su SQL no filtra por fecha',
    !/FROM "Payment"[\s\S]{0,300}?(createdAt|date)\s*(>=|<=|BETWEEN)/i.test(payouts));

// El catálogo de destinos sale de TODOS los aportes, no de los filtrados: si
// saliera de los filtrados, elegir un destino haría desaparecer del desplegable
// a todos los demás y no habría forma de volver.
ok('el catálogo de destinos se arma ANTES de filtrar',
    ctrl.indexOf('const catalogo = catalogoDestinos(') < ctrl.indexOf('const filtrado = aplicarFiltros('));

// El período resuelto viaja del servidor a la pantalla, que no lo recalcula.
ok('el servidor devuelve el período ya resuelto', /periodo: \{[\s\S]{0,200}?desde:/.test(ctrl));
// El resumen es CRITERIO y vive en el módulo puro: en el controlador no se
// podía probar —importa la base— y ahí se coló leer el movimiento con los
// nombres de la columna en vez de los de `movementOf`.
ok('el resumen del período NO vive en el controlador',
    !/const resumenDelPeriodo = /.test(ctrl) && /resumenDelPeriodo,/.test(ctrl));
ok('y la pantalla no rehace la aritmética de fechas',
    !/setUTCHours|86400000|24 \* 60 \* 60 \* 1000/.test(ui));

// El aviso se pinta cuando hay filtro. Sin él, que el saldo no cambie al
// filtrar se lee como que el filtro no funciona.
ok('la pantalla enseña el aviso con un filtro puesto', /AVISO_SALDO/.test(ui));
ok('y ofrece limpiar', /Limpiar/.test(ui));

// El vacío con filtro dice algo distinto que el vacío sin filtro.
ok('«no hay aportes» distingue si hay un filtro puesto',
    /para el filtro elegido/.test(ui));

// v4.851 — El desplegable de campañas se muestra con UNA sola. Es un cambio
// deliberado respecto de v4.849 —donde la regla «un control que no controla
// nada» lo escondía hasta tener dos— y lo pidió el equipo: con una, filtrar no
// cambia el resultado, pero el desplegable NOMBRA de qué campaña vino el
// dinero, que es lo que se quiere ver sin abrir ninguna ficha.
ok('el filtro de campaña se muestra con UNA sola', /destinos\.length > 0 && \(/.test(ui));

// Todo va en UNA línea con los chips de moneda, alineado a la derecha. Que
// quepa o no se comprueba en el navegador con el CSS compilado; acá sólo que
// la fila exista y que el grupo derecho la empuje.
ok('los filtros comparten fila con las monedas',
    /flex flex-wrap items-center gap-x-3 gap-y-2/.test(ui));
ok('y el grupo de la derecha se alinea al final', /items-center gap-2 ml-auto/.test(ui));

// ── Resultado ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('El filtro mueve los flujos y deja el saldo en paz.');
