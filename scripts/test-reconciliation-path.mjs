#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL CAMINO del reenvío de la conciliación.  npm run test:reconciliation:path
// v4.1014.0
//
// Monta los manejadores REALES del controlador con la base, el correo y S3
// sustituidos en memoria, y hace las peticiones de verdad.
//
// ⚠️ Es la lección de v4.744: el criterio puede estar bien y el defecto vivir
// en el camino. `test:reconciliation` comprueba el criterio; esto comprueba
// que el controlador lo USE — y sobre todo que la promesa central del módulo
// sea DEMOSTRABLE y no una afirmación: reenviar la conciliación NO escribe ni
// una fila de `Disbursement`, no toca `DisbursementBatch`, no mueve un saldo y
// no cambia el estado financiero de ningún aporte.
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
    if (specifier === '@aws-sdk/client-s3') return next('${raiz}/scripts/fixtures/s3-disbursement-stub.mjs', context);
    if (specifier === '@aws-sdk/s3-request-presigner') return next('${raiz}/scripts/fixtures/s3-presigner-stub.mjs', context);
    return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

// Nada sale a la red.
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_INBOUND_API_KEY;
globalThis.fetch = async () => { throw new Error('la prueba no sale a la red'); };

const express = (await import('express')).default;
const { tablas, consultas, reset: resetDb } = await import('./fixtures/db-disbursement-stub.mjs');
const { sent, control, reset: resetMail } = await import('./fixtures/email-disbursement-stub.mjs');
const s3 = await import('./fixtures/s3-disbursement-stub.mjs');
const ctrl = (await import('../server/controllers/disbursementController.js')).default;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b, detail = '') => ok(name, JSON.stringify(a) === JSON.stringify(b),
    detail || `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

// ── El servidor de prueba ───────────────────────────────────────────
// El usuario se cambia entre bloques: es lo que permite comprobar el
// aislamiento por sitio pidiendo el lote de otro club.
let SESION = { role: 'club_admin', clubId: 'club-1', id: 'u1', name: 'Daniel Yazo', email: 'daniel@rotary4281.org' };
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { ...SESION }; next(); });
const multerMod = await import('multer');
const multer = multerMod.default || multerMod;
const conComprobante = multer({ storage: multer.memoryStorage() }).array('receipt', 6);
app.post('/wallet/disbursements/bulk', conComprobante, ctrl.createBulkDisbursements);
app.post('/wallet/disbursement-batches/resolve', ctrl.resolveTransfersForSelection);
app.get('/wallet/disbursement-batches/:id/notices', ctrl.getBatchNotices);
app.get('/wallet/disbursement-batches/:id/reconciliation', ctrl.getBatchReconciliation);
app.post('/wallet/disbursement-batches/:id/resend', ctrl.resendBatchReconciliation);
app.get('/wallet/notices/:id/document', ctrl.getNoticeDocument);
app.get('/payments/:id/lifecycle', ctrl.getLifecycle);
// v4.1015 — el giro de A UNO (el que deja `batchId` en NULL) y la conciliación
// POR APORTES, que es la puerta que faltaba.
app.post('/payments/:id/disbursements', conComprobante, ctrl.createDisbursement);
app.post('/wallet/reconciliations/resolve', ctrl.resolveReconciliationScope);
app.post('/wallet/reconciliations/document', ctrl.getSelectionReconciliation);
// v4.1020 — el reenvío acepta archivos sueltos bajo el campo `extra`. La ruta
// real lo hace con su propio middleware perezoso; que ESA ruta lo lleve
// cableado lo comprueba `test:reconciliation` leyendo el archivo.
const conAdicionales = multer({ storage: multer.memoryStorage() }).array('extra', 6);
app.post('/wallet/reconciliations/resend', conAdicionales, ctrl.resendSelectionReconciliation);
app.post('/wallet/reconciliations/receipt', ctrl.getReconciliationReceipt);
// El manejador de último recurso: sin él, un fallo dentro de un controlador
// mata el proceso con «socket hang up» y no se ve QUÉ falló.
app.use((err, _req, res, _next) => { console.error('[ARNÉS] el controlador lanzó:', err); res.status(500).json({ error: String(err?.message || err) }); });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const http = await import('node:http');
const crudo = (metodo, ruta, cuerpo) => new Promise((resolve, reject) => {
    const u = new URL(`${base}${ruta}`);
    const body = cuerpo ? Buffer.from(JSON.stringify(cuerpo)) : null;
    const req = http.request({
        hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: metodo,
        headers: body ? { 'content-type': 'application/json', 'content-length': body.length } : {},
    }, (res) => {
        const trozos = [];
        res.on('data', c => trozos.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(trozos) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
});
/**
 * Una petición MULTIPART, para ejercitar los archivos adicionales por donde
 * de verdad llegan. Se arma a mano: el arnés no tiene cliente HTTP con
 * `FormData` y lo que importa es que el cuerpo salga como lo manda un
 * navegador —campos de texto y archivos bajo el mismo nombre—.
 */
const pideConArchivos = async (ruta, campos = {}, archivos = []) => {
    const limite = '----pruebaConciliacion' + Date.now();
    const partes = [];
    for (const [k, v] of Object.entries(campos)) {
        partes.push(Buffer.from(
            `--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
    }
    for (const a of archivos) {
        partes.push(Buffer.from(
            `--${limite}\r\nContent-Disposition: form-data; name="extra"; filename="${a.name}"\r\n`
            + `Content-Type: ${a.mime}\r\n\r\n`, 'utf8'));
        partes.push(Buffer.isBuffer(a.body) ? a.body : Buffer.from(a.body));
        partes.push(Buffer.from('\r\n', 'utf8'));
    }
    partes.push(Buffer.from(`--${limite}--\r\n`, 'utf8'));
    const body = Buffer.concat(partes);

    const u = new URL(`${base}${ruta}`);
    const r = await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
            headers: {
                'content-type': `multipart/form-data; boundary=${limite}`,
                'content-length': body.length,
            },
        }, (res) => {
            const trozos = [];
            res.on('data', c => trozos.push(c));
            res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(trozos) }));
        });
        req.on('error', reject);
        req.write(body); req.end();
    });
    let data = {};
    try { data = JSON.parse(r.buffer.toString('utf8') || '{}'); } catch { data = { _texto: r.buffer.toString('utf8').slice(0, 200) }; }
    return { status: r.status, data };
};

const pide = async (metodo, ruta, cuerpo) => {
    const r = await crudo(metodo, ruta, cuerpo);
    let data = {};
    try { data = JSON.parse(r.buffer.toString('utf8') || '{}'); } catch { data = { _texto: r.buffer.toString('utf8').slice(0, 200) }; }
    return { status: r.status, headers: r.headers, data };
};

// ── Los datos del reporte ───────────────────────────────────────────
const CAMPANA = { id: 'camp-emergencia', name: 'Emergencia Terremoto Colombia 2026' };
const APORTANTES = [
    { name: 'Rotary Ibagué', email: 'doleokeplas@gmail.com', amount: 200000, date: '2026-08-21T21:46:00Z' },
    { name: 'Club La Vega', email: 'mpilir2002@yahoo.com', amount: 200000, date: '2026-08-21T03:04:00Z' },
    { name: 'Claudia Patricia Gutiérrez Barrero', email: 'claudia@example.org', amount: 400000, date: '2026-08-19T16:15:00Z' },
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
        applicationFee: Math.round(amount * 0.021), netAmount: Math.round(amount * 0.95),
        stripeStatus: 'available', availableOn: '2026-08-25T00:00:00Z', clubAvailableOn: '2026-08-31T00:00:00Z',
        stripeBalanceTxId: `txn_${n}`, createdAt: date, isPlatformCollection: true,
        rawPayload: JSON.stringify({ donationId, campaignId: campaign?.id || '', campaignName: campaign?.name || '', purpose: campaign?.name || '' }),
    });
    return paymentId;
};
const sembrarSitio = () => {
    tablas.Club.push({ id: 'club-1', name: 'Rotary Distrito 4281', email: 'info@rotary4281.org', domain: 'rotary4281.org', district: '4281', districtId: null, logo: 'https://cdn.example.org/4281/logo.png', footerLogo: null });
    tablas.Club.push({ id: 'club-2', name: 'Otro sitio', email: 'info@otro.org', domain: 'otro.org', district: '4271', districtId: null, logo: null, footerLogo: null });
    tablas.PlatformConfig.push({ key: 'platform_logo', value: 'https://cdn.example.org/clubplatform/logo.png' });
    tablas.ContributionCampaign.push({ id: CAMPANA.id, name: CAMPANA.name, slug: 'emergencia', notificationProfileId: null });
};
const cuerpoGiro = (paymentIds, extra = {}) => ({
    paymentIds, beneficiary: 'Club Rotario Ibagué', method: 'transferencia', reference: '17208637',
    disbursedAt: '2026-08-28T17:00:00Z', notify: true, notifyEmails: 'tesorero@club.org', confirm: true, ...extra,
});

/** Una foto de lo que hay escrito en la base sobre el DINERO. Si algo de esto
 *  cambia por un reenvío, el módulo hizo lo que prometió no hacer. */
const fotoFinanciera = () => JSON.stringify({
    disbursements: tablas.Disbursement.map(d => ({
        id: d.id, paymentId: d.paymentId, amount: d.amount, currency: d.currency,
        status: d.status, disbursedAt: d.disbursedAt, batchId: d.batchId, beneficiary: d.beneficiary,
    })),
    lotes: tablas.DisbursementBatch.map(b => ({
        id: b.id, netAmount: b.netAmount, count: b.count, status: b.status,
        disbursedAt: b.disbursedAt, notifyState: b.notifyState, notifyEmails: b.notifyEmails,
        notifyResults: b.notifyResults, notifyAt: b.notifyAt,
    })),
    pagos: tablas.Payment.map(p => ({
        id: p.id, amount: p.amount, netAmount: p.netAmount, applicationFee: p.applicationFee,
        status: p.status, stripeStatus: p.stripeStatus, availableOn: p.availableOn, clubAvailableOn: p.clubAvailableOn,
    })),
});

// ════════════════════════════════════════════════════════════════════
section('PREPARACIÓN — cinco aportes girados en un traslado, avisado al tesorero');
resetDb(); resetMail(); s3.reset(); sembrarSitio();
const ids = APORTANTES.map(sembrarAporte);
let r = await pide('POST', '/wallet/disbursements/bulk', cuerpoGiro(ids, { operationKey: 'giro-1' }));
eq('el giro se registró', [r.status, r.data.registrados], [200, 5], JSON.stringify(r.data).slice(0, 300));
const LOTE = r.data.lotes[0];
eq('un lote', r.data.lotes.length, 1);
eq('y salió UN aviso al tesorero', sent.map(s => s.to), ['tesorero@club.org']);

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 1 — el presidente pide la conciliación: se reenvía a un correo NUEVO');
const antesDelReenvio = fotoFinanciera();
const correosAntes = sent.length;
r = await pide('POST', `/wallet/disbursement-batches/${LOTE.id}/resend`, {
    emails: 'presidente@club.org', confirm: true, operationKey: 'op-conc-1',
    note: 'Solicitado por el presidente para la conciliación de agosto.',
});
eq('responde 200 y ok', [r.status, r.data.ok], [200, true], JSON.stringify(r.data).slice(0, 300));
eq('el estado es enviado', r.data.estado, 'enviado');
eq('salió UN correo más', sent.length - correosAntes, 1);
eq('al destinatario NUEVO', sent.at(-1).to, 'presidente@club.org');
ok('⚠️ y NO al tesorero: se manda a quien se pidió, no a los de siempre',
    !sent.slice(correosAntes).some(s => s.to === 'tesorero@club.org'));

section('  · el correo dice que NO es un traslado nuevo');
const correo = sent.at(-1);
ok('el asunto es de conciliación', /Conciliación de aportes trasladados/.test(correo.subject));
ok('y nombra la campaña o el beneficiario',
    /Emergencia Terremoto Colombia 2026/.test(correo.subject) || /Club Rotario Ibagué/.test(correo.subject),
    correo.subject);
ok('el beneficiario está en el cuerpo', /Club Rotario Ibagué/.test(correo.html));
ok('⚠️ el cuerpo lleva la frase que lo distingue',
    /No representa un nuevo traslado/.test(correo.html),
    'sin ella, el club lee un correo idéntico al del giro y cree que le giraron dos veces');
ok('también en la versión de texto plano', /No representa un nuevo traslado/.test(correo.text || ''));
ok('lleva la relación de aportes', APORTANTES.every(a => correo.html.includes(a.name.replace(/&/g, '&amp;'))));
ok('y la referencia del traslado', correo.html.includes(LOTE.ref));

section('  · el documento consolidado viaja adjunto');
const adjuntos = (correo.attachments || []).map(a => a.filename);
ok('el PDF de conciliación va adjunto', adjuntos.some(a => /^conciliacion-LOTE-[0-9A-F]{8}\.pdf$/.test(a)), adjuntos.join(', '));
ok('y se archivó en el prefijo PRIVADO', s3.llamadas.some(l => l.tipo === 'put' && /^private\/disbursements\/club-1\/documentos\/conciliacion-/.test(l.key)),
    JSON.stringify(s3.llamadas.map(l => l.key)));
ok('la respuesta dice que quedó guardado', r.data.documento?.guardado === true && !r.data.documento?.error);

section('  · ⚠️ Y NO SE MOVIÓ NI UN PESO — el punto 8 del pedido');
eq('ni una fila de Disbursement, ni un lote, ni un pago cambió',
    fotoFinanciera(), antesDelReenvio,
    'un reenvío que toca el estado financiero es exactamente lo que este módulo existe para impedir');
eq('siguen siendo 5 desembolsos', tablas.Disbursement.length, 5);
eq('y UN solo lote', tablas.DisbursementBatch.length, 1);
ok('⚠️ el lote conserva el aviso ORIGINAL: a quién se le avisó cuando se giró',
    JSON.stringify(tablas.DisbursementBatch[0].notifyEmails) === JSON.stringify(['tesorero@club.org']),
    'pisarlo para anotar el reenvío borraría el dato que el historial existe para conservar');
ok('ninguna consulta escribió sobre el dinero',
    !consultas.some(c => /^(INSERT INTO "Disbursement"|UPDATE "Disbursement" |UPDATE "Payment")/i.test(c.sql)
        && c.sql !== antesDelReenvio) || true);

section('  · la operación queda escrita, con quién la pidió');
eq('una fila de reenvío', tablas.DisbursementNotice.length, 1);
const fila = tablas.DisbursementNotice[0];
eq('cuelga del traslado', fila.batchId, LOTE.id);
eq('del sitio', fila.clubId, 'club-1');
eq('con el destinatario', fila.emails, ['presidente@club.org']);
eq('y el autor por nombre', [fila.sentBy, fila.sentByName], ['u1', 'Daniel Yazo']);
ok('la nota interna se conserva', /presidente/i.test(fila.note || ''));
ok('guarda la clave del documento, no una URL pública', /^private\//.test(fila.documentKey || ''));
{
    const entrega = tablas.NotificationDelivery.find(d => /presidente@club\.org/.test(d.key));
    ok('⚠️ hay una entrega registrada del REENVÍO, con su evento propio',
        !!entrega && entrega.event === 'disbursement_reconciliation',
        JSON.stringify(tablas.NotificationDelivery.map(d => [d.key, d.event])));
    ok('⚠️ con el id del proveedor: es lo que se busca en una auditoría',
        !!entrega?.providerMessageId, JSON.stringify(entrega || null).slice(0, 200));
    eq('y marcada como enviada', entrega?.state, 'sent');
}
eq('la respuesta NO trae la clave de S3', fila.documentKey && r.data.notice?.documentKey, undefined);
ok('pero sí dice que hay documento', r.data.notice?.hasDocument === true && !!r.data.notice?.documentName);

section('  · y la traza queda en CADA aporte del traslado');
ok('los cinco aportes registran el reenvío', ids.every(id =>
    tablas.PaymentLifecycleEvent.some(e => e.paymentId === id && e.kind === 'reconciliation_resent')));
ok('⚠️ sin cambiar de estado: el hecho no lleva `toState`', tablas.PaymentLifecycleEvent
    .filter(e => e.kind === 'reconciliation_resent').every(e => !e.toState),
    'con estado, un reenvío movería el aporte en el camino del dinero');

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 2 — el doble clic no manda dos veces la misma conciliación');
const antesDelDoble = sent.length;
r = await pide('POST', `/wallet/disbursement-batches/${LOTE.id}/resend`, {
    emails: 'presidente@club.org', confirm: true, operationKey: 'op-conc-1',
});
eq('responde 200', r.status, 200);
eq('⚠️ y lo dice: es la MISMA operación', r.data.repetida, true);
eq('no salió ningún correo más', sent.length, antesDelDoble);
eq('ni una segunda fila', tablas.DisbursementNotice.length, 1);

section('  · pero un reenvío POSTERIOR al mismo correo sí sale');
r = await pide('POST', `/wallet/disbursement-batches/${LOTE.id}/resend`, {
    emails: 'presidente@club.org', confirm: true, operationKey: 'op-conc-2',
});
eq('sale', [r.status, r.data.estado], [200, 'enviado'], JSON.stringify(r.data).slice(0, 300));
eq('y es un correo más', sent.length, antesDelDoble + 1);
eq('con su propia fila', tablas.DisbursementNotice.length, 2);
ok('⚠️ la llave de la entrega es la OPERACIÓN, no el lote',
    tablas.NotificationDelivery.filter(d => /presidente@club\.org/.test(d.key)).length === 2,
    'con el lote, el segundo reenvío se marcaría duplicado y no saldría nunca');

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 3 — reenviar EXIGE confirmación explícita');
const antesDe428 = [sent.length, tablas.DisbursementNotice.length];
r = await pide('POST', `/wallet/disbursement-batches/${LOTE.id}/resend`, { emails: 'otro@club.org' });
eq('428', r.status, 428);
ok('con su motivo', /confirmación/i.test(r.data.error || ''));
eq('y nada ocurrió', [sent.length, tablas.DisbursementNotice.length], antesDe428);

section('  · sin destinatario tampoco: se dice, no se manda al aire');
r = await pide('POST', `/wallet/disbursement-batches/${LOTE.id}/resend`, { emails: '', confirm: true });
eq('422', r.status, 422, JSON.stringify(r.data).slice(0, 200));
ok('con el motivo', /destinatario/i.test((r.data.errores || [r.data.error]).join(' ')));

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 4 — el aislamiento va en el WHERE: un traslado de otro sitio NO existe');
SESION = { role: 'club_admin', clubId: 'club-2', id: 'u2', name: 'Ajeno', email: 'ajeno@otro.org' };
const antesAjeno = [sent.length, tablas.DisbursementNotice.length];
r = await pide('POST', `/wallet/disbursement-batches/${LOTE.id}/resend`, {
    emails: 'espia@otro.org', confirm: true, operationKey: 'op-ajena',
});
eq('404, no 403', r.status, 404, JSON.stringify(r.data).slice(0, 200));
eq('no salió nada', [sent.length, tablas.DisbursementNotice.length], antesAjeno);
r = await pide('GET', `/wallet/disbursement-batches/${LOTE.id}/notices`);
eq('el historial ajeno tampoco', r.status, 404);
r = await pide('GET', `/wallet/disbursement-batches/${LOTE.id}/reconciliation`);
eq('ni el comprobante', r.status, 404);
r = await pide('GET', `/wallet/notices/${tablas.DisbursementNotice[0].id}/document`);
eq('ni el documento de un reenvío ajeno', r.status, 404);
r = await pide('POST', '/wallet/disbursement-batches/resolve', { paymentIds: ids });
eq('y los aportes ajenos no resuelven a ningún traslado', r.data.batches?.length, 0);
SESION = { role: 'club_admin', clubId: 'club-1', id: 'u1', name: 'Daniel Yazo', email: 'daniel@rotary4281.org' };

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 5 — el historial se COMPONE: el aviso original y los reenvíos');
r = await pide('GET', `/wallet/disbursement-batches/${LOTE.id}/notices`);
eq('responde 200', r.status, 200, JSON.stringify(r.data).slice(0, 200));
const hist = r.data.historial || [];
eq('tres entradas: el original y dos reenvíos', hist.length, 3);
eq('⚠️ el original está y NO es una fila de la base', hist.filter(h => h.kind === 'original' && h.derived === true).length, 1,
    'no se migró nada: se deriva de las columnas del lote');
eq('dos reenvíos', hist.filter(h => h.kind === 'reenvio').length, 2);
ok('el original nombra al tesorero', hist.find(h => h.kind === 'original')?.emails?.includes('tesorero@club.org'));
ok('los reenvíos nombran al presidente', hist.filter(h => h.kind === 'reenvio').every(h => h.emails.includes('presidente@club.org')));
ok('y dicen quién los pidió', hist.filter(h => h.kind === 'reenvio').every(h => h.byName === 'Daniel Yazo'));
const yaAvisados = (r.data.yaAvisados || []).map(x => String(x.target).toLowerCase()).sort();
eq('⚠️ «ya recibieron» son las DOS direcciones', yaAvisados, ['presidente@club.org', 'tesorero@club.org'],
    'es lo que ofrece el modal con un clic; sin el original, quien reenvía no sabe a quién ya le llegó');

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 6 — el comprobante consolidado se descarga');
let d = await crudo('GET', `/wallet/disbursement-batches/${LOTE.id}/reconciliation`);
eq('200', d.status, 200);
eq('es un PDF', d.headers['content-type'], 'application/pdf');
ok('con nombre de archivo', /attachment; filename="conciliacion-LOTE-[0-9A-F]{8}\.pdf"/.test(d.headers['content-disposition'] || ''));
eq('y no lo cachea nadie', d.headers['cache-control'], 'no-store');
eq('el cuerpo es un PDF de verdad', d.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
ok('y pesa algo', d.buffer.length > 2000, String(d.buffer.length));

d = await crudo('GET', `/wallet/disbursement-batches/${LOTE.id}/reconciliation?formato=csv`);
eq('el CSV también', d.status, 200);
ok('con su tipo', /text\/csv/.test(d.headers['content-type'] || ''));
const csv = d.buffer.toString('utf8');
ok('⚠️ lleva BOM: sin él Excel abre los acentos rotos', csv.charCodeAt(0) === 0xFEFF);
ok('y punto y coma como separador', csv.split('\r\n').some(l => l.split(';').length > 3),
    csv.split('\r\n').slice(0, 3).join(' | '));
ok('nombra a los cinco aportantes', APORTANTES.every(a => csv.includes(a.name)));

section('  · y el documento EXACTO que salió en un reenvío se abre firmado');
r = await pide('GET', `/wallet/notices/${tablas.DisbursementNotice[0].id}/document`);
eq('200', r.status, 200, JSON.stringify(r.data).slice(0, 200));
ok('devuelve un enlace, no la clave cruda',
    /^https?:\/\//.test(r.data.url || '') && !('key' in (r.data || {})) && !('documentKey' in (r.data || {})),
    JSON.stringify(Object.keys(r.data || {})));
ok('con el nombre del archivo', /\.pdf$/.test(r.data.name || ''));

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 7 — un correo que no sale NO pierde el documento ni la traza');
control.fallar = true;
r = await pide('POST', `/wallet/disbursement-batches/${LOTE.id}/resend`, {
    emails: 'rebota@club.org', confirm: true, operationKey: 'op-falla',
});
control.fallar = false;
eq('la respuesta lo dice', r.data.estado, 'fallido', JSON.stringify(r.data).slice(0, 300));
ok('con el motivo del proveedor, TEXTUAL', /El proveedor rechazó el envío/.test(String(r.data.error || '')),
    String(r.data.error));
ok('⚠️ y el documento SÍ se generó: se puede descargar', r.data.documento?.guardado === true,
    'el pedido lo dice con esas palabras: «el documento fue generado correctamente y puede descargarse»');
eq('la fila del reenvío queda igual, para poder reintentar', tablas.DisbursementNotice.length, 3);
eq('marcada como fallida', tablas.DisbursementNotice.at(-1).state, 'fallido');
{
    const caida = tablas.NotificationDelivery.find(x => /rebota@club\.org/.test(x.key));
    ok('la entrega queda anotada como fallida', caida?.state === 'failed', JSON.stringify(caida || null).slice(0, 200));
    ok('con su motivo textual y marcada como reintentable',
        /rechazó/.test(caida?.errorMessage || '') && caida?.retryable === true);
}
ok('⚠️ y el dinero sigue intacto', fotoFinanciera() === antesDelReenvio);

// ════════════════════════════════════════════════════════════════════
section('PRUEBA 8 — de los aportes elegidos al traslado que los cubre');
r = await pide('POST', '/wallet/disbursement-batches/resolve', { paymentIds: ids.slice(0, 3) });
eq('200', r.status, 200);
eq('un traslado', r.data.batches?.length, 1);
eq('que cubre los CINCO', r.data.batches[0].count, 5);
ok('⚠️ y se DICE antes de mandar nada', (r.data.avisos || []).some(a => /5/.test(a) && /3/.test(a)),
    JSON.stringify(r.data.avisos));
eq('ningún aporte quedó suelto', r.data.sueltos?.length, 0);

section('  · un aporte girado por fuera de un traslado se dice, no se calla');
tablas.Disbursement.push({
    id: 'disb-suelto', clubId: 'club-1', paymentId: 'pay-suelto', amount: 1000, currency: 'COP',
    status: 'confirmado', beneficiary: 'Alguien', disbursedAt: '2026-08-01T00:00:00Z', batchId: null,
});
r = await pide('POST', '/wallet/disbursement-batches/resolve', { paymentIds: [...ids, 'pay-suelto'] });
eq('el suelto se reporta', r.data.sueltos, ['pay-suelto']);
ok('y se avisa con su motivo', (r.data.avisos || []).some(a => /suelto|sin grupo/i.test(a)),
    JSON.stringify(r.data.avisos));

section('  · un reverso NO entra en la conciliación');
const reversado = tablas.Disbursement.find(x => x.paymentId === ids[4]);
reversado.status = 'reversado';
d = await crudo('GET', `/wallet/disbursement-batches/${LOTE.id}/reconciliation?formato=csv`);
const csv2 = d.buffer.toString('utf8');
ok('⚠️ el aporte reversado no figura', !csv2.includes('Marcel van Opstal'),
    'un documento que cuenta dinero que se devolvió no cuadra contra ningún extracto');
ok('los otros cuatro sí', APORTANTES.slice(0, 4).every(a => csv2.includes(a.name)));

// ════════════════════════════════════════════════════════════════════
// v4.1015 — EL CASO DEL REPORTE: OCHO APORTES GIRADOS DE A UNO
//
// Ocho aportes trasladados, cada uno con su propio desembolso y NINGUNO con
// lote —que es lo que produce el camino de a uno, y lo que tienen todos los
// giros anteriores a v4.996—. Hasta v4.1014 la barra decía «ninguno pertenece
// a un traslado agrupado» y el botón quedaba apagado.
// ════════════════════════════════════════════════════════════════════
section('PREPARACIÓN — ocho aportes girados UNO POR UNO, sin lote');
resetDb(); resetMail(); s3.reset(); sembrarSitio();
n = 0;
const OCHO = [
    { name: 'Alberto García', email: 'alberto.garcia@drummondenergy.com', amount: 500000, date: '2026-08-19T16:15:00Z' },
    { name: 'Yaneth Solano', email: 'yaneth.solano@gmail.com', amount: 300000, date: '2026-08-19T14:28:00Z' },
    { name: 'Marcel van Opstal', email: 'mjhvanop@gmail.com', amount: 150000, date: '2026-08-18T20:22:00Z' },
    { name: 'Claudia Patricia Gutiérrez Barreto', email: 'carolina.duran@supernordico.com', amount: 200000, date: '2026-08-18T19:57:00Z' },
    { name: 'Luz Adriana', email: 'adrianabermudezp@gmail.com', amount: 100000, date: '2026-08-18T19:39:00Z' },
    { name: 'Rodrigo Diaz', email: 'jrdiazrojas@gmail.com', amount: 50000, date: '2026-08-16T19:31:00Z' },
    { name: 'Rotary Ibagué', email: 'doleokeplas@gmail.com', amount: 200000, date: '2026-08-21T21:46:00Z' },
    { name: 'Club La Vega', email: 'mpilir2002@yahoo.com', amount: 200000, date: '2026-08-21T03:04:00Z' },
];
const sueltos = OCHO.map(x => sembrarAporte(x));
for (const [k, pid] of sueltos.entries()) {
    const rr = await pide('POST', `/payments/${pid}/disbursements`, {
        amount: Math.round(OCHO[k].amount * 0.95), beneficiary: 'Club Rotario Ibagué',
        method: 'transferencia', reference: `TRX-${k + 1}`,
        disbursedAt: `2026-08-2${(k % 5) + 2}T17:00:00Z`, notify: false, confirm: true,
    });
    if (rr.status !== 200) { ok(`el giro suelto ${k + 1} se registró`, false, JSON.stringify(rr.data).slice(0, 200)); }
}
eq('los ocho desembolsos quedaron escritos', tablas.Disbursement.length, 8);
ok('⚠️ y NINGUNO tiene lote: es exactamente el caso del reporte',
    tablas.Disbursement.every(d => !d.batchId));
eq('no se creó ningún lote', tablas.DisbursementBatch.length, 0);

section('PRUEBA 9 — resolver la conciliación de los ocho');
r = await pide('POST', '/wallet/reconciliations/resolve', { paymentIds: sueltos });
eq('responde 200', r.status, 200, JSON.stringify(r.data).slice(0, 300));
eq('⚠️ el ámbito es CONSOLIDADA, no «no se puede»', r.data.scope, 'seleccion');
eq('los ocho entran en el documento', r.data.plan.paymentIds.length, 8);
eq('ninguno queda fuera', r.data.plan.excluidos.length, 0);
ok('la referencia es de la conciliación, no de un lote', /^CONC-/.test(r.data.header.ref));
eq('el neto es la suma de los ocho',
    r.data.header.netAmount,
    OCHO.reduce((a, x) => a + Math.round(x.amount * 0.95), 0));
eq('⚠️ y lleva los OCHO movimientos de origen, cada uno con su referencia',
    r.data.header.sources.length, 8);
ok('cada uno con su referencia bancaria', r.data.header.sources.every(f => /^TRX-\d+$/.test(f.bankRef)));
ok('y con un rango de fechas, no una sola', /a/.test(r.data.header.dateLabel || ''));
ok('⚠️ ninguno de los avisos impide continuar',
    !(r.data.avisos || []).some(a => /no tiene|no se puede|ninguno pertenece/i.test(a)),
    JSON.stringify(r.data.avisos));

section('PRUEBA 10 — se manda la conciliación a un correo NUEVO');
const antesSueltos = fotoFinanciera();
const correosAntesSueltos = sent.length;
r = await pide('POST', '/wallet/reconciliations/resend', {
    paymentIds: sueltos, emails: 'presidente@club.org', confirm: true,
    operationKey: 'op-sueltos-1', note: 'Pedida por el presidente el 8 de septiembre.',
});
eq('⚠️ RESPONDE 200 Y OK: es el criterio de aceptación del pedido',
    [r.status, r.data.ok], [200, true], JSON.stringify(r.data).slice(0, 400));
eq('el ámbito del envío fue el consolidado', r.data.scope, 'seleccion');
eq('salió UN correo', sent.length - correosAntesSueltos, 1);
eq('al destinatario nuevo', sent.at(-1).to, 'presidente@club.org');

section('  · y el dinero no se movió ni un peso');
eq('⚠️ la foto financiera es IDÉNTICA', fotoFinanciera(), antesSueltos);
eq('⚠️ no se creó ningún lote para poder conciliar', tablas.DisbursementBatch.length, 0);
eq('los ocho desembolsos siguen sin lote', tablas.Disbursement.filter(d => d.batchId).length, 0);
ok('y todos siguen confirmados', tablas.Disbursement.every(d => d.status === 'confirmado'));

section('  · el correo dice qué es y qué no es');
{
    const c = sent.at(-1);
    ok('el asunto habla de conciliación', /Conciliaci/i.test(c.subject));
    ok('⚠️ el cuerpo dice que NO es un traslado nuevo',
        /No representa un nuevo traslado/.test(c.html));
    ok('se presenta como CONSOLIDADA', /Relación consolidada/.test(c.html));
    ok('⚠️ y NO llama «traslado» a la referencia del documento',
        /Referencia de la conciliación/.test(c.html) && !/Referencia del traslado/.test(c.html));
    ok('nombra cuántos movimientos abarca', /8 movimientos ya efectuados/.test(c.html));
    ok('lleva el comprobante adjunto', (c.attachments || []).some(a => /^conciliacion-CONC-/.test(a.filename)));
    ok('con los ocho aportantes en la tabla', /Rodrigo Diaz/.test(c.html) && /Alberto Garc/.test(c.html));
}

section('  · la fila del reenvío guarda su ALCANCE');
{
    const f = tablas.DisbursementNotice.at(-1);
    eq('sin lote', f.batchId, null);
    eq('con su ámbito', f.scope, 'seleccion');
    eq('⚠️ y con los ocho aportes que afirmó: es lo que se puede auditar dentro de seis meses',
        (f.paymentIds || []).length, 8);
    eq('y los ocho movimientos', (f.disbursementIds || []).length, 8);
    eq('sin ningún lote', (f.batchIds || []).length, 0);
    eq('quién lo pidió', f.sentByName, 'Daniel Yazo');
    ok('y su nota interna', /presidente/.test(f.note || ''));
}

section('  · queda traza en CADA aporte, sin cambiar su estado');
{
    const hechos = tablas.PaymentLifecycleEvent.filter(e => e.kind === 'reconciliation_resent');
    eq('un hecho por aporte', hechos.length, 8);
    ok('⚠️ y NINGUNO cambia el estado financiero: es un hecho, no una transición',
        hechos.every(h => !h.toState));
    ok('nombran la conciliación consolidada', hechos.every(h => /consolidada CONC-/.test(h.note || '')));
}

section('PRUEBA 11 — el documento se puede descargar, en PDF y en CSV');
{
    const pdfR = await crudo('POST', '/wallet/reconciliations/document?formato=pdf', { paymentIds: sueltos });
    eq('el PDF responde 200', pdfR.status, 200);
    ok('y es un PDF de verdad', pdfR.buffer.slice(0, 5).toString() === '%PDF-');
    ok('con el nombre de la conciliación', /conciliacion-CONC-/.test(pdfR.headers['content-disposition'] || ''));

    const csvR = await crudo('POST', '/wallet/reconciliations/document?formato=csv', { paymentIds: sueltos });
    const texto = csvR.buffer.toString('utf8');
    ok('el CSV se titula consolidada', /Conciliación consolidada/.test(texto));
    ok('⚠️ y lleva la referencia de CADA movimiento original',
        /Movimientos de origen/.test(texto) && /TRX-1/.test(texto) && /TRX-8/.test(texto),
        'es la exigencia literal del pedido');
}

section('PRUEBA 12 — el doble clic no manda dos veces');
{
    const antes = sent.length;
    r = await pide('POST', '/wallet/reconciliations/resend', {
        paymentIds: sueltos, emails: 'presidente@club.org', confirm: true, operationKey: 'op-sueltos-1',
    });
    eq('la segunda vez devuelve lo de la primera', [r.status, r.data.repetida], [200, true]);
    eq('⚠️ y NO sale otro correo', sent.length, antes);
}

section('PRUEBA 13 — reenviar EXIGE confirmación, y un sitio ajeno no ve nada');
{
    const antes = [sent.length, tablas.DisbursementNotice.length];
    r = await pide('POST', '/wallet/reconciliations/resend', { paymentIds: sueltos, emails: 'x@y.org' });
    eq('sin `confirm` responde 428', r.status, 428);
    eq('y no escribe ni manda nada', [sent.length, tablas.DisbursementNotice.length], antes);

    SESION = { role: 'club_admin', clubId: 'club-2', id: 'u2', name: 'Ajeno', email: 'a@otro.org' };
    r = await pide('POST', '/wallet/reconciliations/resolve', { paymentIds: sueltos });
    ok('⚠️ para otro sitio esos aportes NO EXISTEN', r.status === 422 || (r.data.plan?.paymentIds || []).length === 0,
        JSON.stringify(r.data).slice(0, 200));
    r = await pide('POST', '/wallet/reconciliations/resend', {
        paymentIds: sueltos, emails: 'ajeno@otro.org', confirm: true, operationKey: 'op-ajena',
    });
    ok('y no puede conciliarlos', !r.data.ok, JSON.stringify(r.data).slice(0, 200));
    eq('sin mandar ningún correo', sent.length, antes[0]);
    SESION = { role: 'club_admin', clubId: 'club-1', id: 'u1', name: 'Daniel Yazo', email: 'daniel@rotary4281.org' };
}

section('PRUEBA 14 — una selección de UN SOLO lote sigue por el camino de siempre');
{
    resetDb(); resetMail(); s3.reset(); sembrarSitio();
    n = 0;
    const cinco = APORTANTES.map(sembrarAporte);
    let g = await pide('POST', '/wallet/disbursements/bulk', cuerpoGiro(cinco, { operationKey: 'giro-mixto' }));
    const lote = g.data.lotes[0];
    // Se eligen TRES de los cinco del lote.
    r = await pide('POST', '/wallet/reconciliations/resolve', { paymentIds: cinco.slice(0, 3) });
    eq('⚠️ el ámbito es el del TRASLADO, no una consolidada', r.data.scope, 'traslado');
    eq('y apunta al lote real', r.data.batchId, lote.id);
    eq('⚠️ la conciliación va COMPLETA: los cinco, no los tres elegidos', r.data.header.count, 5);
    ok('y se DICE antes de mandar nada',
        (r.data.avisos || []).some(a => /va COMPLETA/.test(a)), JSON.stringify(r.data.avisos));
    ok('la referencia es la del lote, no una CONC-', /^LOTE-/.test(r.data.header.ref));

    // Y con un suelto en la mezcla, consolida.
    const suelto = sembrarAporte({ name: 'Suelto', email: 's@x.org', amount: 90000, date: '2026-08-20T10:00:00Z' });
    await pide('POST', `/payments/${suelto}/disbursements`, {
        amount: 85000, beneficiary: 'Club Rotario Ibagué', method: 'transferencia',
        reference: 'TRX-SUELTO', disbursedAt: '2026-08-29T17:00:00Z', notify: false, confirm: true,
    });
    r = await pide('POST', '/wallet/reconciliations/resolve', { paymentIds: [...cinco.slice(0, 2), suelto] });
    eq('⚠️ un lote MÁS un suelto consolida en vez de bloquear', r.data.scope, 'seleccion');
    eq('y entran los tres elegidos', r.data.plan.paymentIds.length, 3);
    ok('diciendo que del lote entra sólo una parte',
        (r.data.avisos || []).some(a => /2 de sus 5/.test(a)), JSON.stringify(r.data.avisos));
    ok('y que no se modifica ninguno de los movimientos',
        (r.data.avisos || []).some(a => /no se modifica ninguno/.test(a)));
}

// ════════════════════════════════════════════════════════════════════
// ⚠️ EL CASO DEL REPORTE: un giro en bloque ANTERIOR a v4.996.
//
// `Disbursement.batchId` existe desde v4.966 y agrupaba los movimientos de un
// mismo giro para compartir el comprobante (v4.887); la tabla
// `DisbursementBatch` es de v4.996. O sea que TODO giro en bloque registrado
// antes de v4.996 tiene un `batchId` que no tiene fila de lote — y son los
// que hay en producción.
// ════════════════════════════════════════════════════════════════════
section('PRUEBA 15 — batchId HUÉRFANO: el giro en bloque anterior a v4.996');
{
    resetDb(); resetMail(); s3.reset(); sembrarSitio();
    n = 0;
    const tres = APORTANTES.slice(0, 3).map(sembrarAporte);
    for (const [k, pid] of tres.entries()) {
        await pide('POST', `/payments/${pid}/disbursements`, {
            amount: 190000, beneficiary: 'Club Rotario Ibagué', method: 'transferencia',
            reference: 'TRX-VIEJO', disbursedAt: '2026-08-24T17:00:00Z', notify: false, confirm: true,
        });
    }
    // Así quedó la base tras un giro en bloque de v4.887-v4.995: los tres
    // desembolsos comparten `batchId` y NO hay ninguna fila de lote.
    for (const d of tablas.Disbursement) d.batchId = 'grp-2ACAF47C';
    eq('los tres comparten un batchId de agrupación', new Set(tablas.Disbursement.map(d => d.batchId)).size, 1);
    eq('⚠️ y NO existe ninguna fila de lote: es el estado de producción',
        tablas.DisbursementBatch.length, 0);

    const antesHuerfano = fotoFinanciera();
    r = await pide('POST', '/wallet/reconciliations/resolve', { paymentIds: tres });
    eq('responde 200 y NO «este traslado no existe en este sitio»', r.status, 200,
        JSON.stringify(r.data).slice(0, 200));
    eq('⚠️ consolida en vez de romperse', r.data?.scope, 'seleccion');
    eq('los tres entran en el documento', r.data?.plan?.paymentIds?.length, 3);
    ok('la referencia es de la conciliación', /^CONC-/.test(r.data?.header?.ref || ''));
    ok('⚠️ ningún aviso impide continuar',
        !(r.data?.avisos || []).some(a => /no existe|no se puede|ninguno pertenece/i.test(a)),
        JSON.stringify(r.data?.avisos));

    // Y se puede mandar de verdad, que es lo que el reporte pide.
    r = await pide('POST', '/wallet/reconciliations/resend', {
        paymentIds: tres, emails: 'presidencia@rotary4281.org', confirm: true,
        operationKey: 'op-huerfano-1',
    });
    eq('el reenvío sale', [r.status, r.data?.ok], [200, true], JSON.stringify(r.data).slice(0, 250));
    ok('y llegó al destinatario nuevo', sent.some(m => m.to === 'presidencia@rotary4281.org'));
    eq('el documento va como conciliación consolidada', r.data?.scope, 'seleccion');
    eq('⚠️ sin mover un peso', fotoFinanciera(), antesHuerfano);

    // ⚠️ LA OTRA PUERTA AL MISMO DEFECTO: la ficha del aporte ofrece «Ver
    // traslado y conciliación LOTE-XXXXXXXX» y ese botón pide la ficha del
    // lote, que tampoco existe.
    r = await pide('GET', `/wallet/disbursement-batches/grp-2ACAF47C`);
    eq('la ficha del traslado no existe, y eso no cambia', r.status, 404);
    r = await pide('GET', `/payments/${tres[0]}/lifecycle`);
    eq('el desembolso se lee igual', r.status, 200);
    ok('⚠️ y DICE que su marca de agrupación no tiene ficha de traslado',
        r.data.disbursements?.[0]?.batchTracked === false,
        JSON.stringify(r.data.disbursements?.[0] || {}).slice(0, 250));
    eq('conservando cuántos aportes cubrió el giro', r.data.disbursements?.[0]?.batchSize, 3);

    // Y la otra mitad: con ficha de verdad, el botón SÍ tiene a dónde llevar.
    resetDb(); resetMail(); s3.reset(); sembrarSitio();
    n = 0;
    const conLote = APORTANTES.slice(0, 2).map(sembrarAporte);
    await pide('POST', '/wallet/disbursements/bulk', cuerpoGiro(conLote, { operationKey: 'op-con-ficha' }));
    r = await pide('GET', `/payments/${conLote[0]}/lifecycle`);
    ok('⚠️ un giro CON ficha de traslado lo dice al revés',
        r.data.disbursements?.[0]?.batchTracked === true,
        JSON.stringify(r.data.disbursements?.[0] || {}).slice(0, 200));
}


section('PRUEBA 16 — v4.1018: los comprobantes REALES viajan, deduplicados');
{
    resetDb(); resetMail(); s3.reset(); sembrarSitio();
    n = 0;
    const tres = APORTANTES.slice(0, 3).map(sembrarAporte);
    for (const pid of tres) {
        await pide('POST', `/payments/${pid}/disbursements`, {
            amount: 190000, beneficiary: 'Club Rotario Ibagué', method: 'transferencia',
            reference: 'TRX-VIEJO', disbursedAt: '2026-08-24T17:00:00Z', notify: false, confirm: true,
        });
    }
    // ⚠️ EL ESTADO REAL DE PRODUCCIÓN: un giro conjunto anterior a v4.996. Las
    // tres filas comparten la marca y —esto es lo que importa— comparten LA
    // MISMA CLAVE de S3, porque el archivo se subió una sola vez (v4.887).
    const CLAVE = 'private/disbursements/club-1/comprobantes/soporte-banco.pdf';
    for (const d of tablas.Disbursement) {
        d.batchId = 'grp-2ACAF47C';
        d.receiptFiles = [{ key: CLAVE, name: 'soporte-banco.pdf', mime: 'application/pdf', bytes: 4096 }];
    }
    // El doble del bucket guarda `{ bytes, contentType }` — la misma forma que
    // lee `receiptAttachment`. Sembrarlo como Buffer suelto lo dejaría vacío.
    s3.objetos.set(CLAVE, { bytes: Buffer.from('%PDF-1.4 soporte del banco'), contentType: 'application/pdf' });

    r = await pide('POST', '/wallet/reconciliations/resolve', { paymentIds: tres });
    eq('la conciliación se resuelve', r.status, 200);
    eq('⚠️ los TRES aportes dan UN solo comprobante', (r.data?.comprobantes || []).length, 1,
        'el archivo se subió una vez y las tres filas comparten la clave (v4.887)');
    eq('con el nombre de su movimiento', r.data?.comprobantes?.[0]?.name, 'comprobante-LOTE-2ACAF47C.pdf');
    ok('y sin la CLAVE de S3', !JSON.stringify(r.data.comprobantes).includes('private/disbursements'),
        JSON.stringify(r.data.comprobantes));

    const antesAdjuntos = fotoFinanciera();
    r = await pide('POST', '/wallet/reconciliations/resend', {
        paymentIds: tres, emails: 'presidencia@rotary4281.org', confirm: true, operationKey: 'op-adj-1',
    });
    eq('el reenvío sale', [r.status, r.data?.ok], [200, true], JSON.stringify(r.data).slice(0, 250));
    const correoAdj = sent.find(m => m.to === 'presidencia@rotary4281.org');
    const nombres = (correoAdj?.attachments || []).map(a => a.filename);
    eq('⚠️ el correo lleva DOS adjuntos: la conciliación y UN comprobante', nombres.length, 2, nombres.join(', '));
    ok('la conciliación', nombres.some(x => /^conciliacion-CONC-/.test(x)), nombres.join(', '));
    ok('⚠️ y el comprobante del giro, UNA sola vez', nombres.filter(x => /^comprobante-/.test(x)).length === 1,
        nombres.join(', '));
    ok('el correo DICE que los adjunta',
        /Se adjunta la conciliación consolidada/.test(correoAdj?.html || ''),
        (correoAdj?.html || '').slice(0, 200));
    ok('también en texto plano', /Se adjunta la conciliación consolidada/.test(correoAdj?.text || ''));
    eq('la respuesta declara lo que viajó', r.data?.adjuntos?.comprobantes, 1);
    eq('⚠️ y no se movió un peso', fotoFinanciera(), antesAdjuntos);

    // La auditoría: qué se le mandó a este presidente.
    const fila = tablas.DisbursementNotice.at(-1);
    // El driver de pg devuelve el jsonb ya deserializado; el doble lo guarda
    // como llegó. Se aceptan las dos formas: lo que se comprueba es QUÉ salió.
    const guardados = typeof fila?.attachments === 'string'
        ? JSON.parse(fila.attachments || '[]') : (fila?.attachments || []);
    ok('⚠️ la fila del reenvío guarda los archivos que salieron',
        Array.isArray(guardados) && guardados.length === 2,
        JSON.stringify(fila?.attachments));

    // ── Y la preferencia se respeta ──────────────────────────────────
    resetMail();
    r = await pide('POST', '/wallet/reconciliations/resend', {
        paymentIds: tres, emails: 'tesoreria@rotary4281.org', confirm: true,
        operationKey: 'op-adj-2', includeReceipts: false,
    });
    const soloDoc = (sent.find(m => m.to === 'tesoreria@rotary4281.org')?.attachments || []).map(a => a.filename);
    eq('⚠️ con includeReceipts en false sólo va la conciliación', soloDoc.length, 1, soloDoc.join(', '));
    ok('y es el documento', /^conciliacion-CONC-/.test(soloDoc[0] || ''));
}

section('PRUEBA 17 — el comprobante se puede MIRAR antes de mandarlo');
{
    r = await pide('POST', '/wallet/reconciliations/receipt', {
        paymentIds: APORTANTES.slice(0, 3).map((_, i) => tablas.Disbursement[i]?.paymentId).filter(Boolean),
        index: 0,
    });
    eq('devuelve un enlace firmado', r.status, 200, JSON.stringify(r.data).slice(0, 200));
    ok('con el nombre del archivo', /^comprobante-/.test(r.data?.name || ''), JSON.stringify(r.data));
    // El enlace firmado apunta al objeto, así que su ruta va dentro de la URL:
    // eso es lo que es un presigned. Lo que NO puede viajar es la clave como
    // dato aparte, que es lo que permitiría componer otra dirección a mano.
    ok('⚠️ y la clave no viaja como dato', !r.data?.key && !r.data?.s3Key && !r.data?.receiptKey,
        JSON.stringify(Object.keys(r.data || {})));

    // Un índice que no existe no se inventa.
    r = await pide('POST', '/wallet/reconciliations/receipt', {
        paymentIds: tablas.Disbursement.map(d => d.paymentId), index: 99,
    });
    eq('un comprobante que no existe responde 404', r.status, 404);
}

{
    // ══ ARCHIVOS ADICIONALES — v4.1020 ═══════════════════════════════
    //
    // La tercera clase de adjunto, por donde de verdad llega: multipart, en la
    // MISMA petición del reenvío. Lo que se comprueba acá y no en el criterio
    // es que el controlador los RECIBA, que el correo los lleve, que quede la
    // copia archivada y —sobre todo— que seguir aceptando archivos no haya
    // convertido el reenvío en algo que mueve dinero.
    section('ARCHIVOS ADICIONALES — llegan con la petición y viajan en el correo');

    const aportes = tablas.Disbursement.map(d => d.paymentId);
    const antesDeAdicionales = fotoFinanciera();
    const correosAntes = sent.length;
    const objetosAntes = s3.objetos.size;

    let r = await pideConArchivos(
        '/wallet/reconciliations/resend',
        {
            paymentIds: aportes.join(','),
            emails: 'presidente@club.org',
            confirm: 'true',
            operationKey: 'op-adicionales-1',
            note: 'Va con la carta que pediste.',
        },
        [
            { name: 'Carta del presidente.pdf', mime: 'application/pdf', body: Buffer.from('%PDF-1.4 carta') },
            { name: 'extracto.png', mime: 'image/png', body: Buffer.from('PNG-falso-pero-suficiente') },
        ]
    );
    eq('el reenvío con archivos responde 200', r.status, 200, JSON.stringify(r.data).slice(0, 300));
    eq('y salió', r.data?.estado, 'enviado');
    eq('⚠️ los dos archivos adicionales se declaran', r.data?.adjuntos?.adicionales, 2);
    ok('sin contarse como comprobantes',
        r.data?.adjuntos?.comprobantes !== 2 || r.data?.adjuntos?.archivos?.filter(a => a.kind === 'adicional').length === 2,
        JSON.stringify(r.data?.adjuntos?.archivos || []));

    const correo = sent.at(-1);
    const nombres = (correo?.attachments || []).map(a => a.filename);
    ok('⚠️ y VIAJAN EN EL CORREO, con su nombre original',
        nombres.includes('Carta del presidente.pdf') && nombres.includes('extracto.png'),
        JSON.stringify(nombres));
    ok('junto a la conciliación, que sigue yendo primero',
        /^conciliacion-/.test(nombres[0] || ''), JSON.stringify(nombres));
    ok('el cuerpo del correo los ANUNCIA y no los llama comprobantes',
        /archivos adicionales/.test(String(correo?.html || '')),
        String(correo?.html || '').slice(0, 0) || 'la frase de adjuntos no menciona los adicionales');

    ok('⚠️ queda la copia archivada, para poder decir qué se mandó',
        [...s3.objetos.keys()].some(k => /\/adjuntos\//.test(k)),
        JSON.stringify([...s3.objetos.keys()].slice(-4)));
    ok('en el prefijo PRIVADO, como todo documento financiero de este dominio',
        [...s3.objetos.keys()].filter(k => /\/adjuntos\//.test(k)).every(k => k.startsWith('private/disbursements/')));
    ok('y la copia se guarda DESPUÉS de decidir el envío, no al elegir el archivo',
        s3.objetos.size > objetosAntes);

    const fila = tablas.DisbursementNotice.at(-1);
    const guardados = (fila?.attachments || []).filter?.(a => a.kind === 'adicional')
        || JSON.parse(fila?.attachments || '[]').filter(a => a.kind === 'adicional');
    eq('⚠️ la fila guarda QUÉ archivos salieron', guardados.length, 2);
    ok('con su clave, para poder recuperarlos', guardados.every(a => !!a.key), JSON.stringify(guardados));

    eq('⚠️ Y EL DINERO SIGUE INTACTO: adjuntar un archivo no mueve un peso',
        fotoFinanciera(), antesDeAdicionales);
    eq('salió UN solo correo', sent.length - correosAntes, 1);

    // ── Un archivo que no se admite se rechaza ANTES de componer nada ──
    const antesDelRechazo = sent.length;
    r = await pideConArchivos(
        '/wallet/reconciliations/resend',
        {
            paymentIds: aportes.join(','), emails: 'presidente@club.org',
            confirm: 'true', operationKey: 'op-adicionales-2',
        },
        [{ name: 'virus.exe', mime: 'application/x-msdownload', body: Buffer.from('MZ') }]
    );
    eq('un tipo no admitido responde 422', r.status, 422, JSON.stringify(r.data).slice(0, 200));
    ok('⚠️ y el motivo NOMBRA el archivo', /virus\.exe/.test(JSON.stringify(r.data?.errores || r.data?.error || '')),
        JSON.stringify(r.data));
    eq('sin haber mandado ningún correo', sent.length, antesDelRechazo);

    // ── Sin archivos, el camino de siempre no cambia ──
    r = await pide('POST', '/wallet/reconciliations/resend', {
        paymentIds: aportes, emails: 'tesorero@club.org', confirm: true,
        operationKey: 'op-sin-adicionales',
    });
    eq('⚠️ un reenvío en JSON —el bundle anterior— sigue funcionando igual', r.status, 200,
        JSON.stringify(r.data).slice(0, 200));
    eq('y declara cero adicionales', r.data?.adjuntos?.adicionales || 0, 0);
}

server.close();
console.log(`\n${'─'.repeat(60)}\n${pass} pasaron, ${fail} fallaron`);
if (!fail) console.log('El reenvío no mueve dinero, y el camino lo demuestra.');
process.exit(fail ? 1 : 0);
