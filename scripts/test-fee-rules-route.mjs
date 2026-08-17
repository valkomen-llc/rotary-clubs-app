#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA RUTA de las reglas de comisión.  npm run test:fee-rules:route
// v4.860.0
//
// Reproduce el defecto reportado: «intento cambiar el porcentaje a 2,1 y no me
// deja guardar». Monta el ROUTER REAL con la base sustituida en memoria y hace
// la petición de verdad.
//
// ⚠️ Es la lección de v4.744: `pickDistrictSite` era correcto y el defecto
// estaba en el CAMINO. `test:fee-rules` comprueba el criterio y pasa entero —
// el criterio nunca estuvo mal. Lo que estaba mal era a qué manejador llega la
// petición.
//
// SIN POSTGRES, SIN CREDENCIALES Y SIN RED.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Se sustituyen `db.js` y `prisma.js` ANTES de importar el router: los módulos
// del servidor los importan de forma relativa, así que el gancho tiene que
// reconocer las dos formas.
const hook = `
export async function resolve(specifier, context, next) {
    if (/(^|\\/)db\\.js$/.test(specifier)) return next('${pathToFileURL(process.cwd()).href}/scripts/fixtures/db-fee-stub.mjs', context);
    if (/(^|\\/)prisma\\.js$/.test(specifier)) return next('${pathToFileURL(process.cwd()).href}/scripts/fixtures/prisma-fee-stub.mjs', context);
    return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba';

const express = (await import('express')).default;
const jwt = (await import('jsonwebtoken')).default;
const { default: payoutsRouter } = await import('../server/routes/payouts.js');
const { guardado } = await import('./fixtures/prisma-fee-stub.mjs');

const app = express();
app.use(express.json());
app.use('/api/payouts', payoutsRouter);

const server = app.listen(0);
const puerto = server.address().port;
const base = `http://127.0.0.1:${puerto}/api/payouts`;

// El operador de la plataforma, con la MISMA forma de token que emite el login.
const token = jwt.sign(
    { id: 'u1', role: 'administrator', clubId: 'origen' },
    process.env.JWT_SECRET,
    { audience: 'rotary-platform', expiresIn: '1d' }
);
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}`);

// ── 1. Lo que reportó el cliente ────────────────────────────────────
section('1. Cambiar el porcentaje a 2,1 % y guardar');

const put = await fetch(`${base}/admin/fee-rules`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ rules: { platform: { percent: 0.021, fixed: 0 } } }),
});
const cuerpo = await put.json().catch(() => ({}));

// ⚠️ EL DEFECTO. `PUT /admin/:id` estaba declarado ANTES que
// `PUT /admin/fee-rules`, y Express casa en ORDEN: la petición caía en
// `updatePayoutStatus` con `id = 'fee-rules'`. El propio archivo de rutas
// llevaba escrito el aviso —«al agregar un GET /admin/:id, éstas tienen que
// quedar ANTES»— y el defecto entró por la otra puerta, con un PUT.
ok('guardar responde 200, no un error', put.status === 200,
    `dio ${put.status}: ${JSON.stringify(cuerpo).slice(0, 200)}`);
ok('NO cae en el manejador de retiros',
    !/Estado inválido/i.test(JSON.stringify(cuerpo)),
    JSON.stringify(cuerpo).slice(0, 200));
ok('se guardó la tarifa nueva',
    guardado.at(-1)?.key === 'financial_fee_rules', JSON.stringify(guardado.at(-1)));

const escrito = JSON.parse(guardado.at(-1)?.value || '{}');
ok('y quedó en 2,1 %, no en 5 %', escrito?.platform?.percent === 0.021,
    JSON.stringify(escrito?.platform));

// El aviso de que no reescribe la historia viaja en la respuesta.
ok('la respuesta dice que no toca los cobros anteriores',
    /de ahora en adelante/i.test(cuerpo?.aviso || ''), JSON.stringify(cuerpo?.aviso));

// ── 2. Leer sigue funcionando ───────────────────────────────────────
section('2. Y leer no se rompió');

const get = await fetch(`${base}/admin/fee-rules`, { headers: auth });
const leido = await get.json().catch(() => ({}));
ok('el GET responde 200', get.status === 200, `dio ${get.status}`);
ok('devuelve la tarifa vigente', typeof leido?.rules?.platform?.percent === 'number');
ok('y la resuelve por moneda', !!leido?.resuelto?.COP && !!leido?.resuelto?.USD);

// ── 3. Las otras rutas de /admin no se rompieron ────────────────────
section('3. Las rutas vecinas siguen en su sitio');

// `overview` y `ledger` NO pueden caer en `:id` tampoco. Van por GET y el
// parámetro es un PUT, pero el orden correcto las protege de todos modos.
const ov = await fetch(`${base}/admin/overview`, { headers: auth });
ok('overview responde', ov.status === 200, `dio ${ov.status}`);

// El manejador de retiros TIENE que seguir alcanzable: mover las rutas nuevas
// arriba no puede dejar sin efecto la que ya existía.
const retiro = await fetch(`${base}/admin/algun-retiro-id`, {
    method: 'PUT', headers: auth, body: JSON.stringify({ status: 'completed' }),
});
ok('actualizar un retiro sigue llegando a su manejador',
    retiro.status !== 404, `dio ${retiro.status}`);
const retiroCuerpo = await retiro.json().catch(() => ({}));
ok('y un estado inválido sigue rechazándose ahí',
    (await (await fetch(`${base}/admin/otro-id`, {
        method: 'PUT', headers: auth, body: JSON.stringify({ status: 'inventado' }),
    })).json())?.error?.includes('Estado inválido'));

// ── 4. Los permisos ─────────────────────────────────────────────────
section('4. La tarifa es de la infraestructura, no de una organización');

const sinToken = await fetch(`${base}/admin/fee-rules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: {} }),
});
ok('sin token no se guarda', sinToken.status === 401, `dio ${sinToken.status}`);

const tokenClub = jwt.sign({ id: 'u2', role: 'club_admin', clubId: 'c1' },
    process.env.JWT_SECRET, { audience: 'rotary-platform', expiresIn: '1d' });
const comoClub = await fetch(`${base}/admin/fee-rules`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenClub}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { platform: { percent: 0 } } }),
});
ok('un administrador de SITIO no puede cambiar la tarifa de la plataforma',
    comoClub.status === 403, `dio ${comoClub.status}`);

// ── 5. El cuerpo llega parseado ─────────────────────────────────────
section('5. El cuerpo de la petición llega al manejador');

// ⚠️ `payouts.js` NO declara `express.json()` en sus rutas: depende del parser
// global de `api/index.js`. Si algún día se monta este router sin él, `req.body`
// sería `undefined` y guardar escribiría la tarifa por defecto SIN avisar —
// que es peor que fallar. Lo comprueba el valor escrito de arriba.
const vacio = await fetch(`${base}/admin/fee-rules`, {
    method: 'PUT', headers: auth, body: JSON.stringify({}),
});
ok('un cuerpo sin reglas no rompe', vacio.status === 200, `dio ${vacio.status}`);
const trasVacio = JSON.parse(guardado.at(-1)?.value || '{}');
ok('y conserva la tarifa por defecto en vez de vaciarla',
    trasVacio?.platform?.percent === 0.05, JSON.stringify(trasVacio?.platform));

// ── 6. Escribir «2.1» en la casilla ─────────────────────────────────
section('6. El error de dedo que sí tiene que rechazarse');

// La pantalla convierte por ciento → tanto por uno. Si esa conversión se
// perdiera, llegaría «2.1» y serían 210 %: el servidor lo rechaza.
const enPorCiento = await fetch(`${base}/admin/fee-rules`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ rules: { platform: { percent: 2.1 } } }),
});
ok('«2.1» como tanto por uno se RECHAZA', enPorCiento.status === 422,
    `dio ${enPorCiento.status}`);
const errCuerpo = await enPorCiento.json().catch(() => ({}));
ok('y el error dice cómo se escribe',
    /tanto por uno/i.test(JSON.stringify(errCuerpo?.errors || [])),
    JSON.stringify(errCuerpo).slice(0, 200));

// ── 7. Que no vuelva a pasar ────────────────────────────────────────
section('7. Ninguna ruta literal por debajo de su paramétrica');

// ⚠️ EL AVISO YA ESTABA ESCRITO en `payouts.js` desde v4.847 y el defecto entró
// igual, por la otra puerta: el comentario hablaba de un GET y llegó un PUT. Un
// comentario que depende de que alguien lo lea no protege nada. Esto sí: lee el
// archivo y compara el ORDEN de declaración por método.
const { readFileSync } = await import('node:fs');
const rutas = readFileSync(new URL('../server/routes/payouts.js', import.meta.url), 'utf8')
    .split('\n')
    .map((linea, i) => {
        const m = linea.match(/router\.(get|put|post|delete|patch)\(\s*'([^']+)'/);
        return m ? { n: i + 1, metodo: m[1], ruta: m[2] } : null;
    })
    .filter(Boolean);

const desordenadas = [];
for (const parametrica of rutas.filter(r => /\/:/.test(r.ruta))) {
    // El prefijo antes del primer parámetro: `/admin/:id` → `/admin/`.
    const prefijo = parametrica.ruta.slice(0, parametrica.ruta.indexOf('/:') + 1);
    for (const literal of rutas) {
        if (literal.metodo !== parametrica.metodo) continue;
        if (/\/:/.test(literal.ruta)) continue;
        if (!literal.ruta.startsWith(prefijo) || literal.ruta === prefijo.slice(0, -1)) continue;
        // Una literal DESPUÉS de la paramétrica es inalcanzable: Express casa
        // en orden y la paramétrica se la traga.
        if (literal.n > parametrica.n) {
            desordenadas.push(`${literal.metodo.toUpperCase()} ${literal.ruta} (línea ${literal.n}) queda por debajo de ${parametrica.ruta} (línea ${parametrica.n})`);
        }
    }
}
ok('toda ruta literal se declara antes que su paramétrica',
    desordenadas.length === 0, desordenadas.join(' | '));

// La comprobación tiene que poder FALLAR, o no protege nada: se verifica contra
// el orden que tenía el archivo cuando se reportó el defecto.
const ordenRoto = [
    { n: 35, metodo: 'put', ruta: '/admin/:id' },
    { n: 45, metodo: 'put', ruta: '/admin/fee-rules' },
];
const detecta = ordenRoto.some(l => !/\/:/.test(l.ruta)
    && l.n > ordenRoto.find(p => /\/:/.test(p.ruta) && p.metodo === l.metodo).n);
ok('y detecta el orden que causó el defecto', detecta);

server.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('Guardar la tarifa llega a su manejador.');
