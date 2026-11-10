#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Editar el valor de la inscripción de un proyecto de la Feria (v4.1313.0)
// npm run test:fair:amount-override
//
// Sin Postgres, sin Stripe y sin red.
//   1. `parseAmountInput`: cómo se lee un valor escrito por una persona.
//   2. `amountOverridePlan`: cuándo se puede cambiar y a cuánto queda.
//   3. `lineAmountOfRow`: el valor ajustado manda en la orden, el desglose y
//      la confirmación manual (lo que el club paga = lo que el panel muestra).
//   4. Invariantes leídas de los archivos.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const leer = (p) => readFileSync(join(REPO, p), 'utf8');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };

const {
    parseAmountInput, amountOverridePlan, amountOverrideOf, lineAmountOfRow,
    orderFor, registrationBreakdown, manualCoverageFor, AMOUNT_OVERRIDE_MAX,
} = await import(`${REPO}/server/lib/projectFairRegistration.js`);

const rules = { mode: 'COP', first: 250000, second: 100000 };
const fila = (id, extra = {}) => ({
    id, projectIndex: 1, workflowStatus: 'received', status: 'pending_payment', archivedAt: null,
    projectName: `P ${id}`, amountCop: 250000, amountUsd: null, metadata: {}, ...extra,
});
const ajuste = (amount, currency = 'COP') => ({ amountOverride: { amount, currency, reason: 'acuerdo del comité' } });

console.log('── 1. Leer el valor escrito');
ok(parseAmountInput('100000') === 100000, '«100000»');
ok(parseAmountInput('100.000') === 100000, '«100.000» = cien mil (punto de miles)');
ok(parseAmountInput('$ 1.250.000') === 1250000, '«$ 1.250.000»');
ok(parseAmountInput('100000,50') === 100000.5, '«100000,50» (coma decimal)');
ok(parseAmountInput('60.5') === 60.5, '«60.5» en dólares');
ok(parseAmountInput(100000) === 100000, 'un número');
ok(Number.isNaN(parseAmountInput('cien mil')), 'texto: ilegible');
ok(Number.isNaN(parseAmountInput('')), 'vacío: ilegible');
ok(Number.isNaN(parseAmountInput('1.00.0')), 'separadores mal puestos: ilegible');

console.log('── 2. El veredicto');
{
    let p = amountOverridePlan(fila('a'), { amount: '100.000', reason: 'tarifa especial' }, rules);
    ok(p.ok && p.amount === 100000 && p.previous === 250000 && p.tariff === 250000 && p.keepsOverride, '250.000 → 100.000 en un primer proyecto: ajuste');
    p = amountOverridePlan(fila('a'), { amount: 100000, reason: 'x' }, rules);
    ok(!p.ok && p.status === 400 && /motivo/.test(p.error), 'sin motivo (≥ 5): 400');
    p = amountOverridePlan(fila('a'), { amount: 0, reason: 'tarifa especial' }, rules);
    ok(!p.ok && p.status === 400, 'cero: 400');
    p = amountOverridePlan(fila('a'), { amount: '-5', reason: 'tarifa especial' }, rules);
    ok(!p.ok && p.status === 400, 'negativo: 400');
    p = amountOverridePlan(fila('a'), { amount: 'abc', reason: 'tarifa especial' }, rules);
    ok(!p.ok && p.status === 400, 'texto: 400');
    p = amountOverridePlan(fila('a'), { amount: AMOUNT_OVERRIDE_MAX.COP + 1, reason: 'tarifa especial' }, rules);
    ok(!p.ok && p.status === 400 && /máximo/.test(p.error), 'un cero de más no llega a Stripe: 400');
    p = amountOverridePlan(fila('a'), { amount: 250000, reason: 'tarifa especial' }, rules);
    ok(!p.ok && p.status === 409, 'el mismo valor que ya tiene: 409');
    p = amountOverridePlan(fila('a', { status: 'refunded' }), { amount: 100000, reason: 'tarifa especial' }, rules);
    ok(!p.ok && p.status === 409 && /reembolsada/.test(p.error), 'reembolsada: no se toca');
    p = amountOverridePlan(fila('a', { status: 'paid' }), { amount: 100000, reason: 'tarifa especial' }, rules);
    ok(p.ok && p.paid, 'pagada: se puede ajustar la línea (y se avisa que no cambia lo recibido)');
    p = amountOverridePlan(fila('b', { projectIndex: 2, amountCop: 100000 }), { amount: 250000, reason: 'segundo cobrado completo' }, rules);
    ok(p.ok && p.tariff === 100000 && p.keepsOverride, 'segundo proyecto 100.000 → 250.000: ajuste');
    p = amountOverridePlan(fila('a', { metadata: ajuste(100000), amountCop: 100000 }), { amount: 250000, reason: 'vuelve a la tarifa' }, rules);
    ok(p.ok && !p.keepsOverride, 'escribir la tarifa de su posición quita la marca (los cambios de tarifa vuelven a aplicarle)');
    p = amountOverridePlan(fila('a', { metadata: ajuste(100000), amountCop: 100000 }), { clear: true, reason: 'vuelve a la tarifa' }, rules);
    ok(p.ok && p.amount === 250000 && !p.keepsOverride, '«Volver a la tarifa»: 250.000 sin marca');
    p = amountOverridePlan(fila('a'), { clear: true, reason: 'vuelve a la tarifa' }, rules);
    ok(!p.ok && p.status === 409, '«Volver a la tarifa» sin ajuste previo: 409');
    p = amountOverridePlan(fila('a', { amountCop: null, amountUsd: 60 }), { amount: '45.5', reason: 'tarifa especial' }, { mode: 'USD', first: 60, second: 25 });
    ok(p.ok && p.currency === 'USD' && p.amount === 45.5 && p.previous === 60, 'en USD, con centavos');
    p = amountOverridePlan(null, { amount: 1, reason: 'tarifa especial' }, rules);
    ok(!p.ok && p.status === 404, 'sin fila: 404');
}

console.log('── 3. El valor ajustado manda en el cobro, el desglose y la confirmación manual');
{
    const uno = fila('a', { metadata: ajuste(100000), amountCop: 100000 });
    const dos = fila('b', { projectIndex: 2, amountCop: 100000 });
    ok(lineAmountOfRow(rules, uno) === 100000, 'la línea del ajustado: 100.000');
    ok(lineAmountOfRow(rules, dos) === 100000, 'la del otro: su tarifa');
    ok(lineAmountOfRow(rules, fila('c')) === 250000, 'sin ajuste: la tarifa de su posición');
    const orden = orderFor([uno, dos], rules);
    ok(orden.total === 200000 && orden.lines[0].amount === 100000, 'la ORDEN que paga el club: 100.000 + 100.000 = 200.000');
    const desglose = registrationBreakdown([uno, dos], rules);
    ok(desglose.total === 200000 && desglose.pendingTotal === 200000, 'el DESGLOSE de la inscripción coincide con la orden');
    const manual = manualCoverageFor([uno, dos], 'a', ['b'], rules);
    ok(manual.total === 200000, 'la CONFIRMACIÓN MANUAL propone el mismo total');
    ok(lineAmountOfRow(rules, fila('x', { metadata: ajuste(60, 'USD') })) === 250000, 'un ajuste en otra moneda no aplica (no se cobran dólares como pesos)');
    ok(amountOverrideOf(fila('x', { metadata: { amountOverride: { amount: 0 } } })) === null, 'un ajuste en cero o roto se ignora');
    const pagado = fila('p', { status: 'paid', amountCop: 120000, metadata: ajuste(120000) });
    ok(registrationBreakdown([pagado], rules).paidTotal === 120000, 'pagado: suma su línea escrita');
}

console.log('── 4. Invariantes');
{
    const reg = leer('server/lib/projectFairRegistration.js');
    const admin = leer('server/controllers/projectFairAdminController.js');
    const rutas = leer('server/routes/project-fair.js');
    const ui = leer('src/pages/admin/PostulacionesPagos.tsx');
    const ventana = leer('src/components/admin/feria/EditarValorProyecto.tsx');

    const cuerpo = (src, name) => {
        const i = src.indexOf(`export const ${name}`);
        return i < 0 ? '' : src.slice(i, src.indexOf('\nexport const', i + 10) > 0 ? src.indexOf('\nexport const', i + 10) : undefined);
    };
    ok(!/lineAmountFor\(/.test(cuerpo(reg, 'orderFor')), 'orderFor no lee la tarifa directo: pasa por lineAmountOfRow');
    ok(!/lineAmountFor\(/.test(cuerpo(reg, 'registrationBreakdown')), 'registrationBreakdown tampoco');
    ok(!/lineAmountFor\(/.test(cuerpo(reg, 'manualCoverageFor')), 'manualCoverageFor tampoco');

    const ep = cuerpo(admin, 'updateProjectAmount');
    ok(ep.length > 0, 'existe el endpoint updateProjectAmount');
    ok(/'managePayments'\)/.test(ep), 'exige el permiso de gestionar pagos');
    ok(/amountOverridePlan\(/.test(ep), 'el veredicto lo da el criterio puro');
    ok(/status IS NOT DISTINCT FROM \$5/.test(ep), 'UPDATE condicional sobre el estado del pago leído');
    ok(!/"amountReceived"\s*=/.test(ep), 'NO toca lo recibido por la pasarela');
    ok(!/status\s*=\s*'paid'/.test(ep), 'NO cambia el estado del pago');
    ok(/logEvent\(/.test(ep) && /before:/.test(ep) && /after:/.test(ep), 'deja el antes/después en el historial');
    ok(!ep.split('db.query(`')[1]?.split('`')[0]?.includes('`'), 'sin comillas invertidas dentro del SQL');
    ok(/router\.post\('\/admin\/postulaciones\/:id\/amount', authMiddleware, fairEdit/.test(rutas), 'ruta POST /admin/postulaciones/:id/amount con fairEdit');

    ok(/import EditarValorProyecto/.test(ui) && /<EditarValorProyecto/.test(ui), 'la ficha monta la ventana «Editar valor»');
    ok(/Editar valor/.test(ui), 'botón «Editar valor» en la ficha');
    ok(!/const EditarValorProyecto/.test(ui), 'la ventana NO se declara dentro de la ficha (perdería el foco)');
    ok(/Motivo del cambio/.test(ventana) && /clear: true/.test(ventana), 'la ventana pide el motivo y ofrece volver a la tarifa');
}

console.log(`\n${n} comprobaciones en verde.`);
