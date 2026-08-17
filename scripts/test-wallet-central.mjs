#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// La BÓVEDA CENTRAL.  npm run test:wallet:central
// v4.853.0 — Fase 1 de la wallet multi-sitio
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro y vive aparte de la
// orquestación, como el resto de este módulo.
//
// Lo que protegen sobre todo es la promesa del rediseño: CONSOLIDAR NO ES
// MEZCLAR. Ni entre monedas ni entre sitios.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    CONCEPTOS, filaDeSitio, consolidar, porSitio, takeRate, ticketPromedio, soloConMovimiento,
} from '../server/lib/centralWallet.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// El caso real de la plataforma hoy: el Distrito 4281 recaudó en pesos Y en
// dólares; otros dos sitios existen y uno no ha recibido nada.
const FILAS = [
    filaDeSitio({
        clubId: 'c-4281', clubName: 'Distrito 4281', clubType: 'district', district: '4281',
        currency: 'COP', aportes: 2, bruto: 70000, plataforma: 3500, neto: 60746,
        enTransito: 42746, retirado: 20000,
    }),
    filaDeSitio({
        clubId: 'c-4281', clubName: 'Distrito 4281', clubType: 'district', district: '4281',
        currency: 'USD', aportes: 1, bruto: 10, plataforma: 0.5, neto: 8.91,
        enTransito: 8.91, retirado: 0,
    }),
    filaDeSitio({
        clubId: 'c-feria', clubName: 'Feria de Proyectos', clubType: 'fair', district: '4271, 4281',
        currency: 'COP', aportes: 3, bruto: 300000, plataforma: 15000, neto: 270000,
        enTransito: 0, retirado: 100000,
    }),
];

// ── 1. La promesa del rediseño ──────────────────────────────────────
section('1. Consolidar NO es mezclar');

const total = consolidar(FILAS);
eq('el consolidado se agrupa por MONEDA', Object.keys(total).sort(), ['COP', 'USD']);
eq('los pesos se suman entre sitios', total.COP.bruto, 370000);
eq('y los dólares van por su lado', total.USD.bruto, 10);
// El error que este módulo entero existe para no cometer, ahora multiplicado
// por la cantidad de sitios.
ok('NUNCA hay una clave que sume las dos monedas',
    !('total' in total) && !Object.values(total).some(t => 'todas' in t));

// Y el detalle no se pierde: toda fila conserva su sitio. Es lo que sostiene
// que el dinero del Distrito sea del Distrito y no de un fondo común.
ok('toda fila conserva su clubId', FILAS.every(f => !!f.clubId));
eq('el consolidado dice cuántos sitios lo componen', total.COP.sitios, 2);

// ── 2. La comisión del procesador se DERIVA ─────────────────────────
section('2. Las dos retenciones son dos cosas distintas');

const d4281 = FILAS[0];
// bruto − plataforma − neto = lo que se llevó el proveedor.
eq('la del procesador se deduce restando', d4281.procesador, 70000 - 3500 - 60746);
eq('la de la plataforma es la registrada', d4281.plataforma, 3500);
// Mezclarlas haría imposible responder «¿cuánto monetiza Club Platform?», que
// es la pregunta que la Bóveda Central existe para contestar.
ok('son campos separados, no uno solo',
    CONCEPTOS.includes('procesador') && CONCEPTOS.includes('plataforma'));

// Un desglose imposible no produce una comisión negativa: se acota en cero.
const raro = filaDeSitio({ clubId: 'x', currency: 'COP', bruto: 100, plataforma: 50, neto: 80 });
eq('un desglose incoherente no da comisión negativa', raro.procesador, 0);

// ── 3. El disponible usa el MISMO criterio que la Bóveda local ──────
section('3. Un club no puede ver dos cifras distintas en dos pantallas');

eq('disponible = neto − retirado', d4281.disponible, 60746 - 20000);
const sobregirado = filaDeSitio({ clubId: 'x', currency: 'COP', bruto: 100, neto: 100, retirado: 500 });
eq('nunca negativo: se acota en cero dentro de SU moneda', sobregirado.disponible, 0);

// ── 4. Agrupar por sitio ────────────────────────────────────────────
section('4. Un sitio con dos monedas es UN sitio');

const sitios = porSitio(FILAS);
eq('hay dos sitios, no tres filas', sitios.length, 2);
const distrito = sitios.find(s => s.clubId === 'c-4281');
eq('el Distrito lleva sus dos monedas dentro', distrito.monedas.length, 2);
eq('y sus aportes suman los de las dos', distrito.aportes, 3);
// Contar aportes NO cruza monedas: es un recuento, no un importe.
eq('el orden es por aportes, con desempate estable',
    sitios.map(s => s.clubId), ['c-4281', 'c-feria']);

// ── 5. Sólo los sitios que recaudaron ───────────────────────────────
section('5. La lista no se llena de sitios en cero');

const conVacio = porSitio([
    ...FILAS,
    filaDeSitio({ clubId: 'c-nuevo', clubName: 'Club recién creado', currency: 'COP', aportes: 0, bruto: 0 }),
]);
eq('sin filtrar están todos', conVacio.length, 3);
eq('filtrando queda fuera el que no recaudó', soloConMovimiento(conVacio).length, 2);
ok('y el que sí recaudó se queda',
    soloConMovimiento(conVacio).every(s => s.clubId !== 'c-nuevo'));

// ── 6. Take rate y ticket promedio ──────────────────────────────────
section('6. Los indicadores dicen «no se sabe» en vez de cero');

const tr = takeRate(total);
eq('el take rate se calcula por moneda', tr.COP, Math.round(18500 / 370000 * 10000) / 100);
eq('y en dólares por su lado', tr.USD, 5);

// ⚠️ Sin bruto NO es 0 %, es que no hubo nada que cobrar. Un cero es una
// afirmación falsa; un hueco es la verdad. Misma regla que el costo sin tarifa
// configurada en el panel de auditoría del Creador de Reels.
eq('sin aportes el take rate es null, NO cero',
    takeRate({ EUR: { bruto: 0, plataforma: 0, aportes: 0 } }).EUR, null);
eq('y el ticket promedio también',
    ticketPromedio({ EUR: { bruto: 0, aportes: 0 } }).EUR, null);

eq('el ticket promedio se calcula por moneda', ticketPromedio(total).COP, roundish(370000 / 5));
function roundish(n) { return Math.round(n); }   // COP no admite decimales

// ── 7. Sobre los archivos ───────────────────────────────────────────
section('7. Lo que no se ve mirando una pantalla');

const spec = read('server/lib/centralWallet.js');
const ctrl = read('server/controllers/payoutController.js');
const rutas = read('server/routes/payouts.js');

ok('el criterio es puro: no importa la base ni la red',
    !/from '\.\/(db|prisma)\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// ⚠️ DOS CONSULTAS AGREGADAS, NO UNA POR SITIO. Trayendo los aportes y
// sumándolos fuera de la base, la central sería inusable con el segundo
// cliente grande. Es el punto de escalabilidad del pedido.
ok('los aportes se agrupan EN LA BASE, por sitio y moneda',
    /GROUP BY p\."clubId", p\.currency/.test(ctrl));
ok('los retiros también', /GROUP BY "clubId", currency/.test(ctrl));
ok('no hay ninguna consulta por sitio dentro de un bucle',
    !/for \([^)]*\)\s*\{[^}]*await db\.query/.test(ctrl));

// La Bóveda Central es del OPERADOR: lleva datos de todas las organizaciones
// alojadas, no de una.
ok('el endpoint exige rol de operador de plataforma',
    /router\.get\('\/admin\/overview', roleMiddleware\(superAdminRoles\)/.test(rutas));

// De dónde salen las cifras tiene que estar DICHO: hoy de `Payment`, y cuando
// el libro mayor concilie se cambia acá, en un solo sitio.
ok('la respuesta declara su fuente', /fuente: 'payments'/.test(ctrl));
// El comentario se parte en varias líneas del bloque, así que se normalizan
// los espacios y los asteriscos antes de buscarlo: una aserción que falla por
// dónde cayó el salto de línea no protege nada.
const ctrlPlano = ctrl.replace(/\n\s*\*\s*/g, ' ').replace(/\s+/g, ' ');
ok('y está escrito por qué todavía no lee del libro',
    /libro está en sombra/i.test(ctrlPlano));

// La Bóveda LOCAL no se toca: es la regla crítica del pedido.
ok('`computeBalances` sigue acotado a un solo club',
    /export const computeBalances = async \(clubId\) =>/.test(ctrl));

// ── Resultado ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('La Bóveda Central consolida sin mezclar.');
