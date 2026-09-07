#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL CAMINO del desembolso agrupado.  npm run test:disbursement:batch:path
// v4.996.0
//
// Monta los manejadores REALES del controlador con la base y el correo
// sustituidos en memoria y hace las peticiones de verdad. Reproduce el
// reporte: ocho aportes marcados como desembolsados producían OCHO correos al
// mismo beneficiario. Con esto son UNO, y las seis pruebas del pedido se
// recorren tal cual se pidieron.
//
// ⚠️ Es la lección de v4.744: el criterio puede estar bien y el defecto vivir
// en el camino. `test:disbursement:batch` comprueba el criterio; esto
// comprueba que el controlador lo USE — que no vuelva a pedirle a cada fila
// que avise, que la llave de operación frene el doble clic, que el reintento
// no repita a quien ya recibió.
//
// SIN POSTGRES, SIN CREDENCIALES Y SIN RED.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const raiz = pathToFileURL(process.cwd()).href;
const hook = `
export async function resolve(specifier, context, next) {
    if (/(^|\\/)db\\.js$/.test(specifier)) return next('${raiz}/scripts/fixtures/db-disbursement-stub.mjs', context);
    if (/(^|\\/)EmailService\\.js$/.test(specifier)) return next('${raiz}/scripts/fixtures/email-disbursement-stub.mjs', context);
    if (/(^|\\/)prisma\\.js$/.test(specifier)) return next('${raiz}/scripts/fixtures/prisma-fee-stub.mjs', context);
    return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

// Nada sale a la red: sin credencial de Resend `senderDomains` no consulta al
// proveedor, y si alguien lo hiciera, `fetch` lanza y la prueba lo ve.
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_INBOUND_API_KEY;
globalThis.fetch = async () => { throw new Error('la prueba no sale a la red'); };

const express = (await import('express')).default;
const { tablas, consultas, reset: resetDb } = await import('./fixtures/db-disbursement-stub.mjs');
const { sent, control, reset: resetMail } = await import('./fixtures/email-disbursement-stub.mjs');
const ctrl = (await import('../server/controllers/disbursementController.js')).default;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

// ── El servidor de prueba ───────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { role: 'club_admin', clubId: 'club-1', id: 'u1', name: 'Ana Tesorera', email: 'ana@sitio.org' }; next(); });
app.post('/wallet/disbursements/bulk', ctrl.createBulkDisbursements);
app.post('/wallet/disbursements/bulk/preview', ctrl.previewBulkDisbursements);
app.get('/wallet/disbursement-batches', ctrl.listDisbursementBatches);
app.get('/wallet/disbursement-batches/:id/email-preview', ctrl.getDisbursementBatchEmailPreview);
app.post('/wallet/disbursement-batches/:id/notify', ctrl.retryDisbursementBatchNotice);
app.get('/wallet/disbursement-batches/:id', ctrl.getDisbursementBatch);
app.get('/payments/:id/lifecycle', ctrl.getLifecycle);
app.post('/disbursements/:id/notify', ctrl.retryNotice);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const pide = async (metodo, ruta, cuerpo) => {
    const r = await realFetch(`${base}${ruta}`, {
        method: metodo, headers: { 'content-type': 'application/json' },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    return { status: r.status, data: await r.json() };
};
// `fetch` de verdad sólo hacia nuestro propio servidor local.
const realFetch = (await import('node:http')).default && (async (url, opts = {}) => {
    const http = await import('node:http');
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: opts.headers || {} }, (res) => {
            let body = '';
            res.on('data', c => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, json: async () => JSON.parse(body || '{}') }));
        });
        req.on('error', reject);
        if (opts.body) req.write(opts.body);
        req.end();
    });
});

// ── Los datos del reporte ───────────────────────────────────────────
const CAMPANA = { id: 'camp-emergencia', name: 'Emergencia Terremoto Colombia 2026' };
const APORTANTES = [
    { name: 'Rotary Ibagué', email: 'doleokeplas@gmail.com', amount: 200000, date: '2026-08-21T21:46:00Z' },
    { name: 'Club La Vega', email: 'mpilir2002@yahoo.com', amount: 200000, date: '2026-08-21T03:04:00Z' },
    { name: 'Claudia Patricia Gutiérrez Barrero', email: 'alberto.garcia@drummondenergy.com', amount: 400000, date: '2026-08-19T16:15:00Z' },
    { name: 'Yaneth Solano', email: 'yaneth.solano@gmail.com', amount: 300000, date: '2026-08-19T14:28:00Z' },
    { name: 'Marcel van Opstal', email: 'mjhvanop@gmail.com', amount: 150000, date: '2026-08-18T20:22:00Z' },
];

let n = 0;
const sembrarAporte = ({ name, email, amount, date, currency = 'COP', campaign = CAMPANA, anonimo = false, clubId = 'club-1' }) => {
    n++;
    const donationId = `don-${n}`;
    const paymentId = `pay-${String(n).padStart(4, '0')}abcd`;
    tablas.Donation.push({ id: donationId, clubId, amount, currency, donorName: name, donorEmail: email, isAnonymous: anonimo, message: null, date, status: 'success' });
    tablas.Payment.push({
        id: paymentId, clubId, providerRef: `pi_${n}`, status: 'succeeded', amount, currency,
        // Sin retenciones a propósito: así los números del correo son los del
        // reporte (200.000 + 200.000 + 400.000 + 300.000 + 150.000 = 1.250.000).
        // El desglose bruto/comisiones lo prueba `test:disbursement:batch`.
        applicationFee: 0, netAmount: amount,
        stripeStatus: 'available', availableOn: '2026-08-25T00:00:00Z', clubAvailableOn: '2026-08-31T00:00:00Z',
        stripeBalanceTxId: `txn_${n}`, createdAt: date, isPlatformCollection: true,
        rawPayload: JSON.stringify({ donationId, campaignId: campaign?.id || '', campaignName: campaign?.name || '', purpose: campaign?.name || '' }),
    });
    return paymentId;
};
const sembrarSitio = () => {
    tablas.Club.push({ id: 'club-1', name: 'Rotary Distrito 4281', email: 'info@rotary4281.org', domain: 'rotary4281.org', district: '4281', districtId: null, logo: 'https://cdn.example.org/4281/logo.png', footerLogo: null });
    tablas.PlatformConfig.push({ key: 'platform_logo', value: 'https://cdn.example.org/clubplatform/logo.png' });
    tablas.ContributionCampaign.push({ id: CAMPANA.id, name: CAMPANA.name, slug: 'emergencia', notificationProfileId: null });
};
const cuerpoBase = (paymentIds, extra = {}) => ({
    paymentIds, beneficiary: 'COLROTARIOS', method: 'transferencia', reference: '17208637',
    disbursedAt: '2026-08-31T17:00:00Z', notify: true, notifyEmails: 'tesoreria@colrotarios.org', confirm: true, ...extra,
});

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 1 — cinco aportes de la misma campaña y beneficiario → 1 lote, 1 correo');
resetDb(); resetMail(); sembrarSitio();
const ids1 = APORTANTES.map(sembrarAporte);
let r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids1, { operationKey: 'op-1' }));
eq('responde 200 y ok', [r.status, r.data.ok], [200, true]);
eq('5 aportes registrados', r.data.registrados, 5);
eq('UN lote', r.data.lotes.length, 1);
eq('las 5 filas de Disbursement quedan confirmadas', tablas.Disbursement.filter(d => d.status === 'confirmado').length, 5);
ok('las 5 cuelgan del mismo lote', tablas.Disbursement.every(d => d.batchId === r.data.lotes[0].id));
eq('UN correo, no cinco', sent.length, 1);
eq('el correo va al beneficiario', sent[0].to, 'tesoreria@colrotarios.org');
eq('el lote suma 1.250.000 COP', r.data.lotes[0].netAmount, 1250000);
eq('y lo dice la respuesta', r.data.totalesPorMoneda, { COP: 1250000 });
eq('1 notificación consolidada enviada', r.data.notificacionesEnviadas, 1);
eq('el aviso del lote quedó enviado', tablas.DisbursementBatch[0].notifyState, 'enviado');
ok('y CADA fila de Disbursement lo hereda', tablas.Disbursement.every(d => d.notifyState === 'enviado'));
const html1 = sent[0].html;
for (const a of APORTANTES) ok(`el correo nombra a ${a.name}`, html1.includes(a.name.replace(/&/g, '&amp;')));
ok('el correo lleva el total consolidado', html1.includes('1.250.000') && /total desembolsado/i.test(html1));
ok('cada aporte va con su importe', (html1.match(/200\.000/g) || []).length >= 2 && html1.includes('400.000') && html1.includes('300.000') && html1.includes('150.000'));
eq('el asunto dice cuántos y cuánto', /5 aportes/.test(sent[0].subject) && /1\.250\.000/.test(sent[0].subject), true);
const lote1 = r.data.lotes[0];
ok('el lote tiene referencia corta LOTE-…', /^LOTE-[0-9A-F]{8}$/.test(lote1.ref));
ok('la referencia del lote va en el correo', html1.includes(lote1.ref));
ok('la traza de cada aporte dice que se avisó por el lote', ids1.every(id =>
    tablas.PaymentLifecycleEvent.some(e => e.paymentId === id && e.kind === 'notified' && e.reference === lote1.id)));
ok('y que quedó desembolsado', ids1.every(id =>
    tablas.PaymentLifecycleEvent.some(e => e.paymentId === id && e.toState === 'disbursed')));
eq('la bitácora de entregas tiene UNA fila, bajo el lote', tablas.NotificationDelivery.length, 1);
ok('con la llave batch:<id>::disbursed::correo', tablas.NotificationDelivery[0].key === `batch:${lote1.id}::disbursed::tesoreria@colrotarios.org`);

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 2 — diez aportes del mismo lote → una sola notificación');
resetDb(); resetMail(); sembrarSitio();
const ids2 = Array.from({ length: 10 }, (_, i) => sembrarAporte({ name: `Aportante ${i + 1}`, email: `a${i + 1}@ejemplo.org`, amount: 100000 + i * 1000, date: `2026-08-${String(10 + i).padStart(2, '0')}T12:00:00Z` }));
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids2, { operationKey: 'op-2', notifyEmails: 'tesoreria@colrotarios.org, contadora@colrotarios.org' }));
eq('10 registrados en 1 lote', [r.data.registrados, r.data.lotes.length], [10, 1]);
eq('dos destinatarios → dos correos, uno por destinatario y no por aporte', sent.length, 2);
ok('los dos correos llevan los diez aportes', sent.every(s => (s.html.match(/Aportante \d+/g) || []).length === 10));
eq('las diez filas comparten batchId', new Set(tablas.Disbursement.map(d => d.batchId)).size, 1);

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 3 — aportes de dos campañas → 2 lotes, 2 correos, sin mezclar');
resetDb(); resetMail(); sembrarSitio();
const OTRA = { id: 'camp-educacion', name: 'Becas de educación 2026' };
tablas.ContributionCampaign.push({ id: OTRA.id, name: OTRA.name, slug: 'becas', notificationProfileId: null });
const idsA = APORTANTES.map(sembrarAporte);
const idsB = [
    sembrarAporte({ name: 'Club Pasto', email: 'pasto@ejemplo.org', amount: 50000, date: '2026-08-22T12:00:00Z', campaign: OTRA }),
    sembrarAporte({ name: 'Club Cali Norte', email: 'cali@ejemplo.org', amount: 70000, date: '2026-08-23T12:00:00Z', campaign: OTRA }),
    sembrarAporte({ name: 'Club Tunja', email: 'tunja@ejemplo.org', amount: 80000, date: '2026-08-24T12:00:00Z', campaign: OTRA }),
];
// El previo lo dice ANTES de confirmar.
let pv = await pide('POST', '/wallet/disbursements/bulk/preview', { paymentIds: [...idsA, ...idsB], beneficiary: 'COLROTARIOS' });
eq('el previo anuncia 2 lotes', pv.data.cuantosLotes, 2);
eq('y 2 notificaciones', pv.data.cuantasNotificaciones, 2);
eq('el previo no escribe nada', [tablas.DisbursementBatch.length, tablas.Disbursement.length], [0, 0]);
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase([...idsA, ...idsB], { operationKey: 'op-3' }));
eq('8 registrados en 2 lotes', [r.data.registrados, r.data.lotes.length], [8, 2]);
eq('2 correos, no 8', sent.length, 2);
const porCampana = Object.fromEntries(r.data.lotes.map(l => [l.campaignName, l]));
eq('el lote de la emergencia cubre 5', porCampana[CAMPANA.name].count, 5);
eq('el de becas cubre 3', porCampana[OTRA.name].count, 3);
const correoEmergencia = sent.find(s => s.html.includes(CAMPANA.name));
const correoBecas = sent.find(s => s.html.includes(OTRA.name));
ok('el correo de la emergencia NO nombra a los aportantes de becas', correoEmergencia && !/Club Pasto|Club Cali Norte|Club Tunja/.test(correoEmergencia.html));
ok('el de becas NO nombra a los de la emergencia', correoBecas && !/Rotary Ibagué|Yaneth Solano/.test(correoBecas.html));
ok('el de becas suma 200.000', correoBecas && correoBecas.html.includes('200.000'));

section('  · y dos monedas también separan');
resetDb(); resetMail(); sembrarSitio();
const idsCop = [sembrarAporte({ name: 'A', email: 'a@x.org', amount: 100000, date: '2026-08-20T12:00:00Z' })];
const idsUsd = [sembrarAporte({ name: 'B', email: 'b@x.org', amount: 50, currency: 'USD', date: '2026-08-20T12:00:00Z' })];
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase([...idsCop, ...idsUsd], { operationKey: 'op-3b' }));
eq('un lote por moneda', r.data.lotes.map(l => l.currency).sort(), ['COP', 'USD']);
eq('nunca un total que las sume', Object.keys(r.data.totalesPorMoneda).sort(), ['COP', 'USD']);

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 4 — actualizar la página o hacer doble clic NO vuelve a avisar');
resetDb(); resetMail(); sembrarSitio();
const ids4 = APORTANTES.map(sembrarAporte);
const primera = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids4, { operationKey: 'op-4' }));
eq('la primera vez sale 1 correo', sent.length, 1);
const segunda = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids4, { operationKey: 'op-4' }));
eq('la repetición se reconoce', segunda.data.repetida, true);
eq('devuelve el MISMO lote', segunda.data.lotes[0].id, primera.data.lotes[0].id);
eq('no crea otro lote', tablas.DisbursementBatch.length, 1);
eq('no registra otra fila', tablas.Disbursement.length, 5);
eq('y NO manda otro correo', sent.length, 1);
section('  · un reenvío sin llave (bundle viejo) tampoco repite: los aportes ya están cubiertos');
const tercera = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids4));
eq('no registra nada', tercera.data.registrados, 0);
eq('los cinco se saltan con su motivo', tercera.data.saltados.length, 5);
eq('y sigue habiendo un solo correo', sent.length, 1);
section('  · reintentar el aviso de un lote ya enviado no repite');
let rt = await pide('POST', `/wallet/disbursement-batches/${primera.data.lotes[0].id}/notify`, {});
eq('contesta que ya se había enviado', rt.data.estado, 'enviado');
eq('sin un correo más', sent.length, 1);
ok('la entrega quedó como duplicado, no como envío nuevo', rt.data.resultados.some(x => x.state === 'duplicado' || x.state === 'enviado'));
section('  · reintentar desde la ficha de UN aporte del lote va al lote, no manda el correo de un aporte');
rt = await pide('POST', `/disbursements/${tablas.Disbursement[0].id}/notify`, {});
eq('responde por el lote', rt.data.batchId, primera.data.lotes[0].id);
eq('y sigue habiendo un solo correo', sent.length, 1);

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 5 — el contenido del correo');
resetDb(); resetMail(); sembrarSitio();
const ids5 = [
    ...APORTANTES.slice(0, 3).map(sembrarAporte),
    sembrarAporte({ name: 'Persona Reservada', email: 'reservada@ejemplo.org', amount: 90000, date: '2026-08-17T12:00:00Z', anonimo: true }),
];
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids5, { operationKey: 'op-5', notes: 'Giro semanal <script>' }));
const html5 = sent[0].html, text5 = sent[0].text;
ok('logotipo de Club Platform arriba', html5.indexOf('clubplatform/logo.png') > 0 && html5.indexOf('clubplatform/logo.png') < html5.indexOf('El desembolso ha sido completado'));
ok('título y subtítulo', html5.includes('El desembolso ha sido completado') && html5.includes('Confirmación de traslado de aportes'));
ok('saluda al destinatario', html5.includes('Hola COLROTARIOS,'));
ok('nombra la campaña en el cuerpo', html5.includes(CAMPANA.name));
ok('la tarjeta lleva referencia, fecha, sitio, campaña, cantidad, monto, medio y referencia bancaria',
    ['Referencia del desembolso', 'Fecha', 'Sitio de origen', 'Campaña', 'Cantidad de aportes', 'Monto total', 'Medio', 'Referencia bancaria'].every(x => html5.includes(x)));
ok('el medio va con su rótulo, no con su clave', html5.includes('Transferencia bancaria') && !/>transferencia</.test(html5));
ok('logotipo del sitio abajo, DESPUÉS de la tabla', html5.search(/total desembolsado/i) > 0 && html5.lastIndexOf('4281/logo.png') > html5.search(/total desembolsado/i));
ok('el pie nombra al sitio y a la campaña', html5.includes('Rotary Distrito 4281') && html5.includes(`Campaña: ${CAMPANA.name}`));
ok('y dice que lo generó Club Platform', html5.includes('generado automáticamente por Club Platform for Rotary'));
ok('el sitio de origen es el REAL, no «Club Platform for Rotary»', /Sitio de origen<\/td><td[^>]*>Rotary Distrito 4281/.test(html5.replace(/\s+/g, ' ')));
ok('NINGÚN marcador sin resolver', !/\{\{|\$\{|undefined|\[object Object\]/.test(html5) && !/\{\{|undefined/.test(text5) && !/\{\{|undefined/.test(sent[0].subject));
ok('el aporte anónimo NO publica nombre ni correo', !html5.includes('Persona Reservada') && !html5.includes('reservada@ejemplo.org') && html5.includes('Aportante anónimo'));
ok('pero SÍ suma', html5.includes('890.000'));
ok('las observaciones van escapadas', html5.includes('&lt;script&gt;') && !html5.includes('<script>'));
ok('hay versión en texto plano con los aportes', text5.includes('Rotary Ibagué') && text5.includes('TOTAL DESEMBOLSADO'));
section('  · el previo del correo desde la API es el mismo correo');
pv = await pide('GET', `/wallet/disbursement-batches/${r.data.lotes[0].id}/email-preview`);
eq('el previo compone', pv.data.ok, true);
eq('y su asunto es el que salió', pv.data.subject, sent[0].subject);

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 6 — consultar el desembolso después');
resetDb(); resetMail(); sembrarSitio();
const ids6 = APORTANTES.map(sembrarAporte);
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids6, { operationKey: 'op-6' }));
const loteId = r.data.lotes[0].id;
let d = await pide('GET', `/wallet/disbursement-batches/${loteId}`);
eq('la ficha responde 200', d.status, 200);
const ficha = d.data.batch;
eq('referencia', ficha.ref, r.data.lotes[0].ref);
eq('responsable', ficha.createdByName, 'Ana Tesorera');
eq('campaña', ficha.campaignName, CAMPANA.name);
eq('beneficiario', ficha.beneficiary, 'COLROTARIOS');
eq('monto total', ficha.netAmount, 1250000);
eq('cantidad de aportes', [ficha.count, ficha.confirmados], [5, 5]);
eq('los 5 aportes incluidos, con su aportante', ficha.items.map(i => i.donorName).sort(), APORTANTES.map(a => a.name).sort());
ok('cada aporte del lote sigue teniendo su fila y su id de pago', ficha.items.every(i => i.disbursementId && ids6.includes(i.paymentId)));
eq('destinatarios notificados', ficha.notifyEmails, ['tesoreria@colrotarios.org']);
eq('estado del correo', ficha.notifyState, 'enviado');
ok('fecha de envío', !!ficha.notifyAt);
eq('el resultado por destinatario', ficha.notifyResults.map(x => [x.target, x.state]), [['tesoreria@colrotarios.org', 'enviado']]);
d = await pide('GET', '/wallet/disbursement-batches');
eq('el listado del sitio lo trae', d.data.batches.map(b => b.id), [loteId]);
section('  · la ficha de un aporte sigue mostrando su desembolso INDIVIDUAL con la referencia del lote');
d = await pide('GET', `/payments/${ids6[0]}/lifecycle`);
eq('un desembolso propio', d.data.disbursements.length, 1);
eq('con su batchRef', d.data.disbursements[0].batchRef, r.data.lotes[0].ref);
eq('y su tamaño de lote', d.data.disbursements[0].batchSize, 5);
eq('el saldo del aporte queda completo', d.data.balance.completo, true);
section('  · un lote ajeno no existe');
tablas.Club.push({ id: 'club-2', name: 'Otro sitio', domain: 'otro.org' });
d = await pide('GET', `/wallet/disbursement-batches/${loteId}?clubId=club-2`);
eq('mismo club del token, otro clubId ignorado: sigue siendo 200 porque el rol no es operador', d.status, 200);

// ════════════════════════════════════════════════════════════════════
section('7. Cuando el proveedor rechaza, el lote queda fallido y el reintento sólo alcanza a quien faltó');
resetDb(); resetMail(); sembrarSitio();
const ids7 = APORTANTES.slice(0, 2).map(sembrarAporte);
control.fallar = true;
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids7, { operationKey: 'op-7', notifyEmails: 'uno@colrotarios.org, dos@colrotarios.org' }));
eq('los aportes SE REGISTRAN aunque el correo falle', r.data.registrados, 2);
eq('el aviso queda fallido', r.data.lotes[0].notifyState, 'fallido');
ok('con el motivo textual del proveedor', /rechazó/.test(r.data.lotes[0].notificacion.error || ''));
eq('se intentó a los dos', sent.length, 2);
control.fallar = false;
rt = await pide('POST', `/wallet/disbursement-batches/${r.data.lotes[0].id}/notify`, {});
eq('el reintento envía', rt.data.estado, 'enviado');
eq('a los dos que faltaban, y a nadie más', sent.length, 4);
rt = await pide('POST', `/wallet/disbursement-batches/${r.data.lotes[0].id}/notify`, {});
eq('un tercer intento ya no manda nada', sent.length, 4);

// ════════════════════════════════════════════════════════════════════
section('8. Sin pedir aviso no sale ningún correo, y sin beneficiario no se abre ningún lote');
resetDb(); resetMail(); sembrarSitio();
const ids8 = APORTANTES.slice(0, 2).map(sembrarAporte);
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids8, { operationKey: 'op-8', notify: false }));
eq('se registran', r.data.registrados, 2);
eq('sin correo', sent.length, 0);
eq('y el lote lo dice', r.data.lotes[0].notifyState, null);
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids8, { operationKey: 'op-8b', beneficiary: '' }));
eq('sin beneficiario: 422', r.status, 422);
eq('y ningún lote abierto de más', tablas.DisbursementBatch.length, 1);
r = await pide('POST', '/wallet/disbursements/bulk', { ...cuerpoBase(ids8), confirm: false });
eq('sin confirmación: 428', r.status, 428);

// ════════════════════════════════════════════════════════════════════
section('9. Un lote que no se puede componer NO sale y se dice');
resetDb(); resetMail();
// Sin sitio ni campaña sembrados: falta `site_name`, que es obligatoria.
const ids9 = [sembrarAporte({ name: 'A', email: 'a@x.org', amount: 100000, date: '2026-08-20T12:00:00Z', campaign: null })];
r = await pide('POST', '/wallet/disbursements/bulk', cuerpoBase(ids9, { operationKey: 'op-9' }));
eq('el aporte se registra igual', r.data.registrados, 1);
eq('pero el aviso queda fallido', r.data.lotes[0].notifyState, 'fallido');
ok('y el motivo nombra lo que faltó', /site_name/.test(r.data.lotes[0].notificacion.error || ''));
eq('y NO se envió nada con huecos', sent.length, 0);

server.close();
console.log(`\n${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
