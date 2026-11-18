#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EXCHANGE — el criterio y sus invariantes (v4.1335.0). Corre en `prebuild`.
// Sin base, sin red, sin credenciales. El recorrido con Postgres real es
// `npm run test:fair:exchange:e2e` (FAIR_E2E_DATABASE_URL local).
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
const X = await import(`${REPO}/server/lib/exchangeSpec.js`);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── Conciliación: adjuntar no es conciliar ──────────────────────────
ok(!X.canReconcile('en_conciliacion', 'conciliado', { hasReceipt: false, reference: 'R1' }).ok, 'sin comprobante no se concilia');
ok(!X.canReconcile('en_conciliacion', 'conciliado', { hasReceipt: true, reference: '' }).ok, 'sin referencia no se concilia');
ok(X.canReconcile('en_conciliacion', 'conciliado', { hasReceipt: true, reference: 'R1' }).ok, 'comprobante + referencia concilian');
ok(!X.canReconcile('en_conciliacion', 'conciliado', { hasReceipt: true, reference: 'R1', difference: -5000 }).ok, 'una diferencia medible exige explicación');
ok(X.canReconcile('en_conciliacion', 'conciliado', { hasReceipt: true, reference: 'R1', difference: -5000, note: 'Comisión del banco' }).ok, 'con la explicación, sí');
ok(X.canReconcile('en_conciliacion', 'conciliado', { hasReceipt: true, reference: 'R1', difference: 0.001 }).ok, 'una diferencia por redondeo no bloquea');
ok(!X.canReconcile('conciliado', 'conciliado', { hasReceipt: true, reference: 'R1' }).ok, 'no se concilia dos veces');
ok(!X.canReconcile('conciliado', 'en_conciliacion', {}).ok, 'reabrir exige motivo');
ok(X.canReconcile('conciliado', 'en_conciliacion', { note: 'Referencia errada' }).ok, 'reabrir con motivo');
ok(!X.canReconcile('conciliado', 'con_diferencia', { note: 'xxxxx' }).ok, 'de conciliado sólo se reabre');
ok(!X.canReconcile('en_conciliacion', 'con_diferencia', {}).ok, 'una diferencia se describe');
ok(!X.canReconcile('en_conciliacion', 'inventado', {}).ok, 'estado desconocido');

// ── Datos de la operación: sin tasa de hoy ──────────────────────────
let d = X.normalizeReconData({ sentAmount: 125, sentCurrency: 'usd', receivedAmount: '495000', receivedCurrency: 'cop', exchangeRate: 3960 });
ok(!d.ok && d.errores.some(e => /tasa/.test(e)), 'una tasa sin fuente se rechaza');
d = X.normalizeReconData({ sentAmount: 125, sentCurrency: 'usd', receivedAmount: '495000', receivedCurrency: 'cop', exchangeRate: 3960, rateSource: 'Extracto' });
ok(d.ok && d.data.sentCurrency === 'USD' && d.data.receivedAmount === 495000, 'normaliza monedas e importes');
ok(!X.normalizeReconData({ sentAmount: -1, sentCurrency: 'USD' }).ok, 'importe negativo');
ok(!X.normalizeReconData({ sentAmount: 10 }).ok, 'importe sin moneda');
ok(!X.normalizeReconData({ transferDate: '2999-01-01' }).ok, 'fecha futura');
ok(!X.normalizeReconData({ exchangeRate: 0, rateSource: 'x' }).ok, 'tasa cero');
ok(X.reconDataDiff({ sentAmount: 125, notes: null }, { sentAmount: 125, notes: 'x' }).map(c => c.field).join() === 'notes', 'el historial guarda sólo lo que cambió');
ok(X.reconDataDiff({ sentAmount: null }, { sentAmount: 0 }).length === 1, 'vacío → 0 es un cambio');

// ── Operación y proyecto ────────────────────────────────────────────
ok(X.operationKeyOf({ id: 'd1', batchId: 'L1' }) === 'b:L1' && X.operationKeyOf({ id: 'd1' }) === 'd:d1', 'la operación es el lote o el desembolso suelto');
ok(X.isOperationKey('b:abc-1') && !X.isOperationKey('b:../x') && !X.isOperationKey('x:1'), 'claves de operación validadas');
const allocs = [{ id: 'd1', paymentId: 'p1', amount: 250000, currency: 'cop', submissionId: 's1' }, { id: 'd2', paymentId: 'p2', amount: 250000, currency: 'cop', submissionId: 's2' }];
let op = X.resolveOperation({ key: 'b:L1', allocations: allocs, batch: { currency: 'COP', receiptKey: 'k', reference: 'M-7' } });
ok(op.allocated === 500000 && op.projectsCount === 2 && op.hasReceipt && op.status === 'en_conciliacion', 'operación agrupada resuelta');
op = X.resolveOperation({ key: 'b:L1', allocations: allocs, batch: { currency: 'COP' }, recon: { receivedAmount: 495000, receivedCurrency: 'COP' } });
ok(op.difference === -5000 && !op.hasReceipt, 'diferencia en la misma moneda');
op = X.resolveOperation({ key: 'b:L1', allocations: allocs, batch: { currency: 'COP' }, recon: { receivedAmount: 125, receivedCurrency: 'USD' } });
ok(op.difference === null, 'en otra moneda NO se compara (no se convierte)');
op = X.resolveOperation({ key: 'd:d1', allocations: [{ ...allocs[0], status: 'reversado' }] });
ok(op.reversed && op.status === 'revertido' && op.allocated === 0, 'revertido en la Bóveda: no suma');
op = X.resolveOperation({ key: 'd:d1', allocations: [allocs[0]], exchangeDocs: 1 });
ok(op.hasReceipt && !op.bovedaReceipt, 'un soporte de Exchange cuenta como comprobante');

const mov = { id: 'p1', amount: 262000, netAmount: 250000, currency: 'cop' };
const ops = {
    'd:a': { key: 'd:a', status: 'en_conciliacion', hasReceipt: true, transferDate: '2026-10-01' },
    'd:b': { key: 'd:b', status: 'conciliado', hasReceipt: true, transferDate: '2026-10-05' },
    'd:c': { key: 'd:c', status: 'en_conciliacion', hasReceipt: false },
    'd:e': { key: 'd:e', status: 'con_diferencia', hasReceipt: true },
};
const st = (allocations, extra = {}) => X.projectExchangeState({ paid: true, movement: mov, allocations, operations: ops, ...extra }).state;
ok(X.expectedOf(mov).amount === 250000 && X.expectedOf(mov).currency === 'COP', 'lo esperado es el neto del movimiento, en su moneda');
ok(X.projectExchangeState({ paid: false }).state === 'no_aplica', 'sin pago: no aplica');
ok(X.projectExchangeState({ paid: true, manual: true }).state === 'pago_directo', 'confirmación manual: pago directo');
ok(X.projectExchangeState({ paid: true }).needsMovement, 'pagado por Stripe sin movimiento: lo dice');
ok(st([]) === 'sin_traslado', 'sin asignaciones: pendiente');
ok(st([{ amount: 250000, operationKey: 'd:a' }]) === 'en_conciliacion', 'con comprobante sin verificar: en conciliación');
ok(st([{ amount: 250000, operationKey: 'd:c' }]) === 'sin_comprobante', 'sin comprobante: lo dice');
ok(st([{ amount: 250000, operationKey: 'd:b' }]) === 'conciliado', 'conciliado');
ok(st([{ amount: 100000, operationKey: 'd:b' }]) === 'parcial', 'parcial aunque lo trasladado esté conciliado');
ok(st([{ amount: 150000, operationKey: 'd:b' }, { amount: 100000, operationKey: 'd:a' }]) === 'en_conciliacion', 'varios traslados: conciliado sólo si TODOS lo están');
ok(st([{ amount: 300000, operationKey: 'd:a' }]) === 'con_diferencia', 'trasladar de más es una diferencia');
ok(st([{ amount: 250000, operationKey: 'd:e' }]) === 'con_diferencia', 'operación con diferencia');
ok(st([{ amount: 250000, operationKey: 'd:a', status: 'reversado' }]) === 'sin_traslado', 'un traslado revertido no cuenta');

// ── Filtros ─────────────────────────────────────────────────────────
const px = { state: 'en_conciliacion', hasReceipt: true, lastTransferDate: '2026-10-20T15:00:00Z' };
ok(X.hasExchangeQuery({ exchange: 'parcial' }) && X.hasExchangeQuery({ exchangeRef: 'M' }) && !X.hasExchangeQuery({ exchange: 'all' }), 'qué consultas obligan a calcular');
ok(X.matchesExchangeFilters(px, { exchange: 'comprobante' }) && !X.matchesExchangeFilters({ ...px, hasReceipt: false }, { exchange: 'comprobante' }), '«Comprobante adjunto»');
ok(X.matchesExchangeFilters(px, { exchangeRef: 'merc' }, { refs: ['MERC-7'] }) && !X.matchesExchangeFilters(px, { exchangeRef: 'zzz' }, { refs: ['MERC-7'] }), 'referencia bancaria');
ok(X.matchesExchangeFilters(px, { trasladoDesde: '2026-10-20', trasladoHasta: '2026-10-20' }) && !X.matchesExchangeFilters(px, { trasladoDesde: '2026-10-21' }), 'fecha del traslado');

// ── Totales: por moneda y una operación UNA vez ─────────────────────
const tot = X.exchangeTotals([
    { anchor: true, exchange: { state: 'en_conciliacion', currency: 'COP', expected: 250000, allocated: 250000 } },
    { anchor: true, exchange: { state: 'en_conciliacion', currency: 'COP', expected: 250000, allocated: 250000 } },
    { anchor: false, exchange: { state: 'en_conciliacion', currency: 'COP', expected: 350000, allocated: 0 } },
    { anchor: true, exchange: { state: 'sin_traslado', currency: 'USD', expected: 70, allocated: 0 } },
    { anchor: true, exchange: { state: 'pago_directo' } },
], { 'b:L1': { key: 'b:L1', currency: 'COP', allocated: 500000, status: 'en_conciliacion', difference: null } });
const tc = tot.porMoneda.find(t => t.currency === 'COP');
ok(tc.trasladado === 500000 && tc.operaciones === 1, 'un comprobante compartido no duplica el importe');
ok(tc.recibido === 500000, 'un proyecto cubierto no suma dos veces');
ok(tot.porMoneda.find(t => t.currency === 'USD').recibido === 70 && !('total' in tot), 'COP y USD por separado; ningún total mezclado');
ok(tot.pagosDirectos === 1, 'los pagos directos se cuentan aparte');

// ── Cuentas y accesos ───────────────────────────────────────────────
ok(X.maskAccount('9988776655') === '****6655' && X.maskAccount('12') === '****', 'cuenta enmascarada');
ok(X.normalizeAccount({ accountNumber: '****6655' }, { accountNumber: '9988776655' }).accountNumber === '9988776655', 'la máscara no pisa la cuenta guardada');
ok(X.grantMatches({ userId: 'u1', email: 'a@x.org' }, { id: 'u1', email: 'otro@x.org' }), 'el acceso ligado sigue al USUARIO aunque cambie el correo');
ok(!X.grantMatches({ userId: 'u1', email: 'a@x.org' }, { id: 'u2', email: 'a@x.org' }), 'otra cuenta con el mismo correo NO lo hereda');
ok(X.grantMatches({ userId: null, email: 'A@x.org' }, { id: 'u9', email: 'a@x.org' }), 'sin ligar todavía: el correo enlaza la primera vez');
ok(!X.grantMatches({ userId: 'u1', revokedAt: new Date() }, { id: 'u1' }), 'revocado no vale');
ok(X.csvCell('=CMD()').startsWith("'"), 'el CSV no ejecuta fórmulas');

// ── Invariantes leídas de los archivos ──────────────────────────────
const store = read('server/lib/exchangeStore.js');
const ctrl = read('server/controllers/exchangeController.js');
const strip = (src) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
for (const [name, src] of [['exchangeStore', strip(store)], ['exchangeController', strip(ctrl)]]) {
    ok(!/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(Payment|Disbursement|DisbursementBatch|DisbursementNotice|ProjectFairSubmission|LedgerLine|LedgerTransaction)"/i.test(src),
        `${name}: no escribe pagos, traslados de la Bóveda, postulaciones ni el libro mayor`);
    ok(!/disbursements\/bulk/.test(src), `${name}: no registra traslados por su cuenta (un solo motor)`);
}
ok(!/DELETE\s+FROM\s+"Exchange/i.test(strip(ctrl)), 'Exchange no borra registros: retira y revoca con motivo');
ok(/WHERE "operationKey" = \$1 AND status = \$8/.test(ctrl), 'el cambio de estado es CONDICIONAL al leído');
ok(/AND version = \$15 AND status <> 'conciliado'/.test(ctrl), 'la corrección exige versión y no toca un conciliado');
ok(/'exchangeReconcile'\);/.test(ctrl) && /'exchangeManage'\);/.test(ctrl) && /'exchangeConfig'\);/.test(ctrl), 'cada acción con su capacidad en el servidor');

const fair = read('server/controllers/projectFairAdminController.js');
ok(/exchange_viewer: \{ view: false,[^}]*viewPersonalData: false, exchangeView: true, exchangeDownload: false, exchangeManage: false, exchangeReconcile: false, exchangeConfig: false \}/.test(fair),
    'el administrador del evento sólo consulta (sin `view`, sin datos personales)');
ok(/reviewer:[^}]*exchangeView: false/.test(fair) && /translator:[^}]*exchangeView: false/.test(fair), 'revisores y traductores no ven Exchange (no ven pagos)');
ok(/finance:[^}]*exchangeReconcile: true, exchangeConfig: false/.test(fair), 'finanzas concilia y no configura');
const restricted = (fair.match(/RESTRICTED_ROW_FIELDS = \[([\s\S]*?)\];/) || [])[1] || '';
ok(restricted && !/'(email|phone|idNumber|responsable|firstName|lastName|notes|stripe\w*|manualPayment\w*|receiptUrl)'/.test(restricted), 'la lista blanca no lleva datos personales ni referencias de pago');
ok(/if \(access\.role === 'viewer'\) \{\s*const exchangeGrant = await exchangeGrantFor\(req\);/.test(fair), 'sólo quien no tiene perfil del comité cae al acceso de consulta');
ok(/assertEventCapability\(req, eventId, 'payments'\)/.test(fair), 'la relación con el evento (capacidad de pagos) da consulta');

const routes = read('server/routes/project-fair.js');
for (const r of ['/admin/exchange/config', '/admin/exchange/resumen', '/admin/exchange/postulaciones/:id', '/admin/exchange/operaciones/:opKey/archivo', '/admin/exchange/operaciones/:opKey/estado']) {
    ok(routes.includes(`'${r}'`), `ruta ${r}`);
}
ok(/put\('\/admin\/exchange\/config', authMiddleware, fairManage/.test(routes) && /post\('\/admin\/exchange\/operaciones\/:opKey\/estado', authMiddleware, fairEdit/.test(routes), 'las escrituras llevan además la guardia de rol');
ok(routes.indexOf("'/admin/exchange/postulaciones/:id'") < routes.indexOf("'/admin/postulaciones/:id'"), 'literales antes de la paramétrica');

const guard = read('scripts/db-push-guard.mjs');
const claude = read('CLAUDE.md');
for (const t of ['ExchangeReconciliation', 'ExchangeDocument', 'ExchangeEvent', 'ExchangeConfig', 'ExchangeAccessGrant']) {
    ok(guard.includes(t), `${t} documentada en el guardián de db:push`);
    ok(claude.includes(`\`${t}\``), `${t} listada en CLAUDE.md`);
}
const schema = read('server/lib/ensureExchangeSchema.js');
const alters = [...schema.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)];
const { OWNED_COLUMNS } = await import(`${REPO}/server/lib/ensureExchangeSchema.js`);
ok(alters.every(([, t, c]) => (OWNED_COLUMNS[t] || []).includes(c)), 'todo ADD COLUMN va enumerado en su atajo');
ok(!/`/.test(schema.slice(schema.indexOf('await db.query(`') + 16, schema.lastIndexOf('`);'))), 'ninguna comilla invertida dentro del SQL');

const ui = read('src/components/admin/feria/exchange/ExchangeDrawer.tsx') + read('src/components/admin/feria/exchange/ExchangeCells.tsx');
ok(!/disbursements\/bulk/.test(ui), 'el panel de Exchange no registra traslados: usa la barra de la Bóveda');
ok(/ReceiptViewer/.test(ui), 'reutiliza el visor de comprobantes de los inscritos a eventos');
const page = read('src/pages/admin/PostulacionesPagos.tsx');
ok(/resolverTraslado\(\[s\.id\]\)/.test(page) && /<BulkDisbursementBar/.test(page), '«Registrar traslado» desde la columna pasa por la MISMA resolución y la MISMA barra');
ok(/\['amountCop', 'Valor'\],\s*\/\/[^\n]*\n\s*\.\.\.\(access\?\.exchangeView \? \[\['', 'Exchange'\]\] : \[\]\)/.test(page), 'la columna va junto a Pago y Valor');

console.log(`✅ test:fair:exchange — ${n} comprobaciones (criterio e invariantes, sin base ni red).`);
