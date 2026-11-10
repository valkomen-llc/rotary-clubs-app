#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Confirmación MANUAL de pagos de la Feria — criterio e invariantes (v4.1308.0)
// npm run test:fair:manual-payment
//
// Sin Postgres, sin S3 y sin red. El recorrido completo contra una base real
// está en `test-fair-manual-payment-e2e.mjs` (FAIR_E2E_DATABASE_URL).
//
//   1. `manualCoverageFor`: qué proyectos de la inscripción puede cubrir un
//      pago confirmado a mano, y con qué línea.
//   2. `receiptKindOf`: qué es un archivo por sus primeros bytes.
//   3. `manualReceiptKeyBelongs`: una clave de otra postulación no se reclama.
//   4. Los ayudantes de la ventana (fecha local, propuesta y valor esperado).
//   5. Invariantes leídas de los archivos.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const leer = (p) => readFileSync(join(REPO, p), 'utf8');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };

const { manualCoverageFor } = await import(`${REPO}/server/lib/projectFairRegistration.js`);
const { receiptKindOf } = await import(`${REPO}/server/lib/completedReceipts.js`);
const { manualReceiptKeyBelongs, MANUAL_RECEIPT_PREFIX } = await import(`${REPO}/server/lib/projectFairManualReceipts.js`);

const rules = { mode: 'COP', first: 250000, second: 100000 };
const fila = (id, extra = {}) => ({ id, projectIndex: 1, workflowStatus: 'received', status: 'pending_payment', archivedAt: null, projectName: `P ${id}`, ...extra });

console.log('── 1. Qué cubre una confirmación manual');
{
    const uno = fila('a');
    const dos = fila('b', { projectIndex: 2 });
    let c = manualCoverageFor([uno, dos], 'a', ['b'], rules);
    ok(c.coveredIds.length === 1 && c.coveredIds[0] === 'b' && !c.rejected.length, 'el segundo proyecto que debe se cubre');
    ok(c.total === 350000 && c.lines.find(l => l.submissionId === 'b').amount === 100000, 'líneas: 250.000 + 100.000 = 350.000');
    c = manualCoverageFor([uno, dos], 'a', [], rules);
    ok(!c.coveredIds.length && c.total === 250000, 'sin declarar nada, cubre sólo esta fila (no se deduce de «lo que debe hoy»)');
    c = manualCoverageFor([uno, dos], 'a', undefined, rules);
    ok(!c.coveredIds.length, 'sin el campo: igual que antes de v4.1308');
    c = manualCoverageFor([uno, dos], 'a', ['a', 'b', 'b'], rules);
    ok(c.coveredIds.length === 1, 'el ancla y los repetidos no se cuentan dos veces');
    c = manualCoverageFor([uno, fila('b', { projectIndex: 2, status: 'paid' })], 'a', ['b'], rules);
    ok(c.rejected.length === 1 && /ya tiene el pago/.test(c.rejected[0].reason), 'uno ya pagado se RECHAZA con su motivo (no se ignora)');
    c = manualCoverageFor([uno, fila('b', { projectIndex: 2, workflowStatus: 'draft' })], 'a', ['b'], rules);
    ok(c.rejected.length === 1 && /borrador/.test(c.rejected[0].reason), 'un borrador no debe la inscripción: rechazado');
    c = manualCoverageFor([uno, fila('b', { projectIndex: 2, workflowStatus: 'withdrawn' })], 'a', ['b'], rules);
    ok(c.rejected.length === 1 && /retirado/.test(c.rejected[0].reason), 'un retirado: rechazado');
    c = manualCoverageFor([uno, fila('b', { projectIndex: 2, archivedAt: new Date() })], 'a', ['b'], rules);
    ok(c.rejected.length === 1, 'un archivado: rechazado');
    c = manualCoverageFor([uno, fila('b', { projectIndex: 2, workflowStatus: 'rejected' })], 'a', ['b'], rules);
    ok(c.rejected.length === 1, 'un rechazado por el comité no tiene obligación: rechazado');
    c = manualCoverageFor([uno, dos], 'a', ['zzz'], rules);
    ok(c.rejected.length === 1 && /No pertenece/.test(c.rejected[0].reason), 'un proyecto de OTRA inscripción: rechazado');
    c = manualCoverageFor([uno], 'a', [], { mode: 'USD', first: 60, second: 25 });
    ok(c.total === 60, 'en USD, la línea en dólares');
}

console.log('── 2. Qué es un archivo, por sus bytes');
{
    ok(receiptKindOf(Buffer.from('%PDF-1.7\n')) === 'application/pdf', 'PDF');
    ok(receiptKindOf(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])) === 'image/jpeg', 'JPEG');
    ok(receiptKindOf(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A])) === 'image/png', 'PNG');
    ok(receiptKindOf(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])) === 'image/webp', 'WebP');
    ok(receiptKindOf(Buffer.from('hola, soy un texto.pdf')) === null, 'un texto renombrado a .pdf: nada');
    ok(receiptKindOf(Buffer.from('PK\u0003\u0004')) === null, 'un DOCX/ZIP: nada');
    ok(receiptKindOf(Buffer.alloc(0)) === null, 'vacío: nada');
}

console.log('── 3. El prefijo privado de ESTA postulación');
{
    const id = '3f1c2a7e-1111-4222-8333-444455556666';
    ok(manualReceiptKeyBelongs(`${MANUAL_RECEIPT_PREFIX}/${id}/x.pdf`, id), 'su propia clave: sí');
    ok(!manualReceiptKeyBelongs(`${MANUAL_RECEIPT_PREFIX}/otra/x.pdf`, id), 'la de otra postulación: no');
    ok(!manualReceiptKeyBelongs(`private/event-receipts/${id}/x.pdf`, id), 'la de otro módulo: no');
    ok(!manualReceiptKeyBelongs(`${MANUAL_RECEIPT_PREFIX}/${id}/../../x.pdf`, id), 'con «..»: no');
    ok(!manualReceiptKeyBelongs(`${MANUAL_RECEIPT_PREFIX}//x.pdf`, ''), 'sin id: no');
    ok(!manualReceiptKeyBelongs(`${MANUAL_RECEIPT_PREFIX}/a b/x.pdf`, 'a b'), 'un id con caracteres raros: no');
}

console.log('── 4. Los ayudantes de la ventana');
{
    const { build } = await import('esbuild');
    const dir = mkdtempSync(join(tmpdir(), 'manual-pay-'));
    try {
        const out = join(dir, 'm.mjs');
        await build({ entryPoints: [join(REPO, 'src/lib/comprobantePagoManual.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
        const m = await import(out);
        const d = new Date(2026, 10, 9, 21, 56);
        ok(m.fechaLocalParaInput(d) === '2026-11-09T21:56', 'el input se prellena con la hora LOCAL (no la UTC)');
        ok(m.fechaInputAIso('2026-11-09T21:56') === d.toISOString(), 'y viaja como instante ISO con zona');
        ok(m.fechaInputAIso('') === null && m.fechaInputAIso('nada') === null, 'una fecha vacía o rota no viaja');
        const lines = [
            { submissionId: 'a', projectIndex: 1, projectName: 'A', label: 'Primer proyecto', amount: 250000, paid: false, owes: true },
            { submissionId: 'b', projectIndex: 2, projectName: 'B', label: 'Segundo proyecto', amount: 100000, paid: false, owes: true },
        ];
        let p = m.propuestaConfirmacion('a', lines, 250000);
        ok(p.coverProjectIds.join() === 'b' && p.monto === 350000, 'propone cubrir el segundo y prellena 350.000');
        p = m.propuestaConfirmacion('a', [lines[0], { ...lines[1], paid: true, owes: false }], 250000);
        ok(!p.coverProjectIds.length && p.monto === 250000, 'con el segundo pagado, sólo 250.000');
        p = m.propuestaConfirmacion('b', lines, 100000);
        ok(p.coverProjectIds.join() === 'a' && p.monto === 350000, 'abierta desde el segundo, propone el primero');
        p = m.propuestaConfirmacion('a', null, 250000);
        ok(!p.coverProjectIds.length && p.monto === 250000, 'una fila heredada sin inscripción: su línea');
        ok(m.montoEsperado('a', lines, 250000, []) === 250000 && m.montoEsperado('a', lines, 250000, ['b']) === 350000, 'el valor esperado sigue a lo marcado');
    } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('── 5. Invariantes leídas de los archivos');
{
    const ctl = leer('server/controllers/projectFairAdminController.js');
    const ini = ctl.indexOf('export const confirmManualPayment');
    const fin = ctl.indexOf('export const manualReceiptUploadUrl');
    const cuerpo = ctl.slice(ini, fin);
    ok(ini > 0 && fin > ini, 'confirmManualPayment existe');
    const updates = cuerpo.split('UPDATE "ProjectFairSubmission"').slice(1);
    ok(updates.length === 2, 'dos UPDATE: el ancla y los proyectos cubiertos');
    ok(updates.every(u => /WHERE id = \$\d+ AND status <> 'paid'/.test(u)), 'los dos son CONDICIONALES (status <> paid): dos clics no confirman dos veces');
    const sqlCubiertos = updates[1].split('RETURNING')[0];
    ok(!/"amountReceived"/.test(sqlCubiertos), 'los cubiertos NO escriben amountReceived: el dinero vive una sola vez, en el ancla (v4.1299)');
    ok(/coveredBy: updated\.id/.test(cuerpo), 'los cubiertos guardan coveredBy = el ancla');
    ok(/manualCoverageFor\(/.test(cuerpo) && /coverage\.rejected\.length/.test(cuerpo), 'lo que no puede cubrirse se rechaza (409), no se ignora');
    ok(/verifyManualReceipt\(body\.receipt, submission\.id\)/.test(cuerpo), 'el comprobante se verifica contra ESTA postulación');
    ok(/!evidence && !receipt/.test(cuerpo), 'sin archivo ni referencia: 400');
    ok(/COALESCE\(NULLIF\(\$\{lineCol\}, 0\)/.test(cuerpo), 'la línea se escribe sólo si faltaba (no pisa una congelada)');
    ok(!/manualPaymentReceiptKey:/.test(ctl.slice(ctl.indexOf('const mapRow'), ctl.indexOf('const mapRow') + 8000)), 'la clave de S3 NO viaja a la pantalla');

    const rutas = leer('server/routes/project-fair.js');
    ok(/router\.post\('\/admin\/postulaciones\/:id\/manual-payment\/receipt-url', authMiddleware, fairEdit/.test(rutas), 'subir el comprobante exige editar');
    ok(/router\.get\('\/admin\/postulaciones\/:id\/manual-payment\/receipt', authMiddleware, fairRead/.test(rutas), 'abrirlo exige leer');
    ok(/manualReceiptUploadUrl = withAccess\([\s\S]*?\}, 'managePayments'\);/.test(ctl), 'y la capacidad de gestionar pagos');
    ok(/manualReceiptUrl = withAccess\([\s\S]*?\}, 'viewPayments'\);/.test(ctl), 'y la de ver pagos para abrirlo');

    const ensure = leer('server/controllers/projectFairController.js');
    for (const col of ['manualPaymentReceiptKey', 'manualPaymentReceiptName', 'manualPaymentReceiptMime', 'manualPaymentReceiptBytes']) {
        ok(ensure.includes(`ADD COLUMN IF NOT EXISTS "${col}"`), `ensure: ${col}`);
    }

    const ui = leer('src/pages/admin/PostulacionesPagos.tsx');
    ok(!ui.includes("toISOString().slice(0, 16)"), 'la ventana ya no prellena la fecha en UTC');
    ok(/if \(ok\) setShowManualModal\(false\)/.test(ui), 'la ventana sólo se cierra si se confirmó (antes se cerraba también con error)');
    ok(/type="file"/.test(ui) && /manual-payment\/receipt-url/.test(ui), 'la ventana adjunta el comprobante');
    ok(/coverProjectIds: manualForm\.coverProjectIds/.test(ui), 'y manda los proyectos que cubre');
    ok(/project-fair\/admin\/catalog`\), \{ headers: authHeaders\(\) \}\)\n\s*\.then\(r => r\.json\(\)\)\.then\(cat => \{ if \(cat && !cat\.error\) setCatalog\(cat\)/.test(ui), 'tras confirmar se refresca «N en el sistema · M pagadas»');
    ok(!/250000'/.test(ui.slice(ui.indexOf('const abrirConfirmacionManual'), ui.indexOf('const adjuntarComprobante'))), 'el valor ya no se prellena con 250.000 fijos');
}

console.log(`\n✅ test:fair:manual-payment — ${n} comprobaciones.`);
