#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA UTILIDAD DE LA PLATAFORMA.  npm run test:platform-revenue
// v4.863.0
//
// Lo que la plataforma comisionó, por moneda, en la barra del panel central.
// Se ejercita el ENDPOINT REAL con la base sustituida en memoria — es la
// lección de v4.744: el criterio puede estar bien y el defecto vivir en el
// camino.
//
// SIN POSTGRES, SIN CREDENCIALES Y SIN RED.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const raiz = pathToFileURL(process.cwd()).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
    if (/(^|\\/)db\\.js$/.test(specifier)) return next('${raiz}/scripts/fixtures/db-stats-stub.mjs', context);
    return next(specifier, context);
}`)}`, import.meta.url);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba';

const express = (await import('express')).default;
const jwt = (await import('jsonwebtoken')).default;
const { default: adminRouter } = await import('../server/routes/admin.js');
const stub = await import('./fixtures/db-stats-stub.mjs');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/admin`;

const token = (rol, clubId) => jwt.sign(
    { id: 'u1', email: 'admin@rotary.org', role: rol, clubId },
    process.env.JWT_SECRET, { audience: 'rotary-platform', expiresIn: '1d' }
);

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const section = (t) => console.log(`\n${t}`);

// Los números de la Bóveda Central del reporte.
stub.utilidad.push({ currency: 'COP', total: '1050' }, { currency: 'USD', total: '31.41' });

// ── 1. El operador ve lo comisionado ────────────────────────────────
section('1. El operador ve lo que la plataforma comisionó');

const op = await (await fetch(`${base}/stats`, {
    headers: { Authorization: `Bearer ${token('administrator')}` },
})).json();

ok('la respuesta trae la utilidad por moneda',
    Array.isArray(op.platformRevenueByCurrency), JSON.stringify(op.platformRevenueByCurrency));
const porCodigo = Object.fromEntries((op.platformRevenueByCurrency || []).map(r => [r.currency, r.amount]));
ok('los pesos comisionados', porCodigo.COP === 1050, JSON.stringify(porCodigo));
ok('y los dólares, por su lado', porCodigo.USD === 31.41, JSON.stringify(porCodigo));

// ⚠️ La regla del módulo desde v4.841. Acá el error sería sobre la utilidad de
// la empresa, que es peor que sobre un saldo.
ok('NUNCA una cifra que sume las dos monedas',
    !(op.platformRevenueByCurrency || []).some(r => r.amount === 1081.41));
ok('son dos entradas, no una', (op.platformRevenueByCurrency || []).length === 2);

// ── 2. No es dato de un sitio ───────────────────────────────────────
section('2. Un administrador de sitio no ve la utilidad de la plataforma');

stub.consultas.length = 0;
const sitio = await (await fetch(`${base}/stats`, {
    headers: { Authorization: `Bearer ${token('club_admin', 'c-4281')}` },
})).json();

ok('la lista llega vacía', (sitio.platformRevenueByCurrency || []).length === 0,
    JSON.stringify(sitio.platformRevenueByCurrency));
// ⚠️ NI SIQUIERA SE CALCULA: no es que se esconda en la pantalla. Esconder un
// dato que el servidor manda no lo protege — quien conoce el endpoint lo ve.
ok('y la consulta NO llega a ejecutarse',
    !stub.consultas.some(q => /SUM\("applicationFee"\)/.test(q)));
// Su propio saldo lo sigue viendo, claro.
ok('pero su saldo sí viaja', Array.isArray(sitio.availableFundsByCurrency));

// ── 3. Es de la infraestructura, no de un sitio ─────────────────────
section('3. La utilidad es global, no del sitio que se esté mirando');

stub.consultas.length = 0;
await fetch(`${base}/stats?clubId=c-4281`, {
    headers: { Authorization: `Bearer ${token('administrator')}` },
});
const consulta = stub.consultas.find(q => /SUM\("applicationFee"\)/.test(q));
ok('la consulta se ejecuta', !!consulta);
// La pregunta es «¿cuánto ha ganado Club Platform?», no «¿cuánto con este
// sitio?»: si llevara filtro de club, el número cambiaría de significado según
// por dónde se entre.
ok('y NO lleva filtro de club', !!consulta && !/"clubId"/.test(consulta), consulta);

// ── 4. Sobre los archivos ───────────────────────────────────────────
section('4. Lo que no se ve mirando una pantalla');

const layout = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8');

// ⚠️ EL MODO SE DECIDE POR CONTEXTO DE PLATAFORMA, NO POR «NO HAY CLUB»: en el
// dominio de la plataforma `by-domain` devuelve «Origen», así que «no hay club»
// nunca es cierto para el operador. Es la lección de v4.853.
ok('el chip se decide con `isUIAdmin`, no con la ausencia de club',
    /rows=\{isUIAdmin \? stats\?\.platformRevenueByCurrency/.test(layout));

// Dos rótulos iguales con dos cifras distintas es el defecto que esta
// reingeniería vino a quitar: no es un saldo, es utilidad.
ok('el rótulo dice «comisionado», no «saldo»',
    /Comisionado por la plataforma · acumulado/.test(layout));
ok('y el lector de pantalla lo anuncia distinto',
    /aria-label=\{isUIAdmin \? 'Comisionado por la plataforma'/.test(layout));
ok('con otro icono, para que no se lea como el saldo de un club',
    /isUIAdmin[\s\S]{0,80}<Percent /.test(layout));

// El respaldo del campo suelto es del SALDO y se calcula sobre la moneda
// principal; aplicado a la utilidad mostraría el saldo de «Origen» como si
// fuera lo comisionado.
ok('no se cae al campo suelto del saldo', /legacy=\{isUIAdmin \? 0 :/.test(layout));

server.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('La utilidad de la plataforma se ve, por moneda y sin mezclarse.');
