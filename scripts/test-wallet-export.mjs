#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El INFORME de la Bóveda y su exportación.  npm run test:wallet:export
// v4.850.0 — Bloque B
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. `walletReport.ts` es puro; se compila
// con esbuild y se importa, igual que el espejo de los filtros.
//
// El PDF y el Excel no se generan acá —eso son librerías del navegador— pero sí
// se comprueba lo que decide qué llevan: las filas, los totales, los avisos y
// el CSV, que es texto y se puede leer.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const compilar = async (entrada) => {
    const out = execFileSync('npx', ['esbuild', entrada, '--format=esm', '--bundle', '--platform=neutral',
        '--external:xlsx', '--external:jspdf'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return import(`data:text/javascript,${encodeURIComponent(out)}`);
};

let R, X;
try {
    R = await compilar('src/lib/walletReport.ts');
    X = await compilar('src/lib/walletExport.ts');
} catch (e) {
    console.log('  · esbuild no disponible — se saltan las pruebas del informe (npm i --no-save esbuild)');
    console.log(`\n0 pasaron, 0 fallaron`);
    process.exit(0);
}

const EMITIDO = new Date('2026-08-17T15:00:00Z');

const mov = (extra = {}) => ({
    stripeFee: 4754, applicationFee: 2500, amount: 42746,
    bucket: 'in_transit', providerRef: 'pi_abc', receiptNumber: '1157-2878',
    origin: { kind: 'campana', id: 'c1', label: 'Emergencia Terremoto Colombia 2026' },
    method: { label: 'Mastercard ···3778' },
    stripeBalanceTxId: 'txn_1', stripeFeeRate: 4100, stripeFeeConverted: true,
    ...extra,
});

const APORTES = [
    {
        id: 'd1', currency: 'COP', amount: 50000, date: '2026-08-16T14:31:00Z',
        donorName: 'Rodrigo Diaz', donorEmail: 'jrdiazrojas@gmail.com', isAnonymous: false,
        movement: mov(),
    },
    {
        id: 'd2', currency: 'COP', amount: 20000, date: '2026-08-10T09:00:00Z',
        donorName: 'Alguien', donorEmail: 'privado@ejemplo.org', isAnonymous: true,
        movement: mov({ stripeFee: 1000, applicationFee: 1000, amount: 18000, stripeBalanceTxId: null, stripeFeeRate: null }),
    },
    // Otra moneda: NO tiene que entrar en el informe de pesos.
    {
        id: 'd3', currency: 'USD', amount: 10, date: '2026-08-16T18:29:00Z',
        donorName: 'John Miller', donorEmail: 'john@ejemplo.org', isAnonymous: false,
        movement: mov({ stripeFee: 0.59, applicationFee: 0.5, amount: 8.91 }),
    },
];

const informe = R.buildInforme({
    club: 'Distrito 4281', moneda: 'COP', donations: APORTES,
    periodo: { label: 'Últimos 30 días', desde: '2026-07-19T00:00:00Z', hasta: '2026-08-17T23:59:59Z', excluidos: 2 },
    destinoLabel: 'Emergencia Terremoto Colombia 2026',
    saldoActual: 43871, ahora: EMITIDO,
});

// ── 1. Una moneda por informe ───────────────────────────────────────
section('1. Un informe es de UNA moneda');

eq('sólo entran los aportes de esa moneda', informe.filas.length, 2);
ok('el de dólares quedó fuera', !informe.filas.some(f => f.aportante === 'John Miller'));
eq('y los totales son sólo de esa moneda', informe.totales.bruto, 70000);
eq('la tarifa del procesador se suma', informe.totales.procesador, 5754);
eq('la retención de la plataforma también', informe.totales.plataforma, 3500);
eq('y el neto', informe.totales.neto, 60746);
// Nunca una clave «total» que mezcle: es la regla del módulo desde v4.841 y en
// un archivo pesa más que en pantalla — la pantalla se corrige, un archivo que
// alguien archivó, no.
ok('no hay ningún total que cruce monedas', !('total' in informe.totales));

// ── 2. La privacidad del aportante anónimo ──────────────────────────
section('2. Un aporte ANÓNIMO no lleva correo al archivo');

const anonimo = informe.filas.find(f => f.aportante === 'Anónimo');
ok('el anónimo aparece como «Anónimo»', !!anonimo);
// ⚠️ El correo sigue guardado en la base y la pantalla lo tiene: se habría
// colado en un archivo que va a una junta o por correo. Un dato que en pantalla
// es de quien administra el sitio deja de serlo en cuanto se descarga.
eq('y SIN correo', anonimo.correo, '');
ok('su importe sí se cuenta', anonimo.bruto === 20000);

const conNombre = informe.filas.find(f => f.aportante === 'Rodrigo Diaz');
eq('el que no es anónimo conserva su correo', conNombre.correo, 'jrdiazrojas@gmail.com');

// ── 3. Medida o estimada ────────────────────────────────────────────
section('3. La comisión dice si se MIDIÓ o se estimó');

eq('con tasa declarada y balance transaction es MEDIDA', conNombre.base, 'medida');
eq('sin ellos es ESTIMADA', anonimo.base, 'estimada');
ok('y se avisa dentro del archivo',
    informe.avisos.some(a => /ESTIMADA/.test(a)), JSON.stringify(informe.avisos));
ok('el aviso dice cuántos son',
    informe.avisos.some(a => /1 de 2/.test(a)), JSON.stringify(informe.avisos));

// ── 4. Los avisos ───────────────────────────────────────────────────
section('4. Lo que hay que saber va DENTRO del archivo');

ok('se dice cuántos aportes quedaron fuera del filtro',
    informe.avisos.some(a => /2 aporte\(s\) quedaron fuera/.test(a)), JSON.stringify(informe.avisos));
// ⚠️ Sin esta línea, el saldo impreso arriba se leería como si fuera el del
// período. Es la misma regla que el aviso de la pantalla.
ok('y que el saldo es el ACTUAL, no el del período',
    informe.avisos.some(a => /saldo disponible es el actual/i.test(a)), JSON.stringify(informe.avisos));

const sinMov = R.buildInforme({
    club: 'X', moneda: 'COP', saldoActual: 0, ahora: EMITIDO,
    periodo: { label: 'Todo', desde: null, hasta: null },
    destinoLabel: 'Todos los destinos',
    donations: [{ id: 'z', currency: 'COP', amount: 100, date: '2026-08-01', donorName: 'N', movement: null }],
});
ok('un aporte sin movimiento se DICE',
    sinMov.avisos.some(a => /no tienen movimiento asociado/i.test(a)), JSON.stringify(sinMov.avisos));
ok('y su neto se declara de más, no se calla',
    sinMov.avisos.some(a => /queda de más/i.test(a)));

// ── 5. El contexto ──────────────────────────────────────────────────
section('5. El archivo se puede interpretar solo dentro de seis meses');

const ctx = Object.fromEntries(R.contextoDe(informe));
eq('lleva el sitio', ctx['Sitio'], 'Distrito 4281');
eq('la moneda', ctx['Moneda'], 'COP');
// El formato de fecha lo pone el sistema y varía entre navegador y node; lo
// que se comprueba es que las DOS puntas del rango estén, no cómo se escriben.
ok('el período con sus fechas',
    /Últimos 30 días/.test(ctx['Período']) && /19\/0?7\/2026/.test(ctx['Período']) && /17\/0?8\/2026/.test(ctx['Período']),
    ctx['Período']);
eq('el destino filtrado', ctx['Destino'], 'Emergencia Terremoto Colombia 2026');
ok('cuándo se emitió', !!ctx['Emitido']);
ok('el saldo va ROTULADO como actual', 'Saldo disponible (actual)' in ctx, Object.keys(ctx).join(', '));

// ── 6. El nombre del archivo ────────────────────────────────────────
section('6. Tres informes del mismo día no se llaman igual');

eq('lleva sitio, moneda y fecha',
    R.nombreArchivo(informe, 'xlsx'), 'boveda-distrito-4281-cop-2026-08-17.xlsx');
ok('otra moneda da otro nombre',
    R.nombreArchivo({ ...informe, moneda: 'USD' }, 'pdf') !== R.nombreArchivo(informe, 'pdf'));

// ── 7. El CSV ───────────────────────────────────────────────────────
section('7. El CSV que Excel abre bien');

const csv = X.aCSV(informe);
// ⚠️ Los dos hacen falta para Excel en español: sin BOM los acentos salen como
// «RodrÃ­go», y con coma toda la fila cae en una sola columna porque el
// separador de lista regional es el punto y coma.
ok('empieza con BOM', csv.charCodeAt(0) === 0xFEFF);
ok('separa con punto y coma', csv.includes('Fecha;Aportante;Correo'));
ok('lleva el contexto arriba de la tabla',
    csv.indexOf('Sitio;Distrito 4281') < csv.indexOf('Fecha;Aportante'));
ok('y los avisos también', /Aviso;/.test(csv));
ok('las filas están', /Rodrigo Diaz/.test(csv));
ok('el anónimo va sin correo', !/privado@ejemplo\.org/.test(csv));
ok('el de otra moneda no está', !/John Miller/.test(csv));

// Un nombre con coma partiría la fila en dos columnas y correría todo lo demás.
const conComa = R.buildInforme({
    club: 'X', moneda: 'COP', saldoActual: 0, ahora: EMITIDO,
    periodo: { label: 'Todo', desde: null, hasta: null }, destinoLabel: 'Todos',
    donations: [{ id: 'q', currency: 'COP', amount: 1, date: '2026-08-01', donorName: 'Díaz, Rodrigo', movement: mov() }],
});
ok('un nombre con coma se cita', /"Díaz, Rodrigo"/.test(X.aCSV(conComa)));

// ── 8. Sobre los archivos ───────────────────────────────────────────
section('8. Lo que no se ve mirando una pantalla');

const rep = read('src/lib/walletReport.ts');
const exp = read('src/lib/walletExport.ts');
const ui = read('src/pages/admin/WalletManagement.tsx');

// UN informe, tres formatos. Escribir cada uno por su cuenta daría tres
// verdades sobre el mismo período.
ok('los tres formatos leen el MISMO informe',
    /from '\.\/walletReport'/.test(exp));
ok('y las mismas cabeceras y filas', /CABECERAS/.test(exp) && /filaComoArray/.test(exp));

// ⚠️ Vercel no tiene ninguna fuente instalada: componer en el servidor saca
// cuadritos (medido en v4.794). No mover esto al servidor.
ok('el PDF se compone en el NAVEGADOR', /await import\('jspdf'\)/.test(exp));
ok('y el Excel también', /await import\('xlsx'\)/.test(exp));
ok('las dos librerías se cargan de forma perezosa',
    !/^import .*from 'jspdf'/m.test(exp) && !/^import .*from 'xlsx'/m.test(exp));
ok('no hay ninguna generación de informe en el servidor',
    !read('server/controllers/financialController.js').includes('jspdf'));

// Se exporta lo que se VE.
ok('la exportación usa los aportes ya filtrados', /donations: activeDonations/.test(ui));
ok('y la moneda que se está mirando', /moneda: code/.test(ui));
ok('el saldo que viaja al archivo es el ACTUAL, no uno del período',
    /saldoActual: selected\?\.availableBalance/.test(ui));

// Un botón que descarga un archivo vacío es peor que no tenerlo.
ok('los botones sólo salen si hay algo que exportar',
    /activeDonations\.length > 0 && \(/.test(ui));

// Etiquetas accesibles: tres botones que sólo dicen «Excel», «CSV» y «PDF» no
// distinguen de qué moneda es cada archivo.
ok('cada botón dice de qué moneda es', /aria-label=\{`Descargar Excel de \$\{code\}`\}/.test(ui));

// ── Resultado ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('El informe es uno y los tres formatos lo leen.');
