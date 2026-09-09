#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL DESEMBOLSO AGRUPADO — el criterio.  npm run test:disbursement:batch
// v4.996.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro y vive aparte de la
// orquestación, como `walletLifecycle.js` frente a `disbursements.js`.
//
// LO QUE ESTAS PRUEBAS PROTEGEN SOBRE TODO son tres cosas:
//   1. Que una selección se parta por sitio + moneda + campaña + beneficiario,
//      y NUNCA se mezclen en un correo aportes de destinos distintos.
//   2. Que ningún marcador sin resolver salga en un correo — el
//      «{{beneficiary_name}}» impreso que se reportó con captura.
//   3. Que el controlador del bloque NO vuelva a pedirle a cada fila que avise:
//      es la línea exacta que producía ocho correos por ocho aportes.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    BATCH_NOTIFICATION_TYPE, notificationKey, deliveryContributionId, batchRef,
    normalizeBeneficiary, batchGroupKey, groupForBatches, batchTotals,
    REQUIRED_VARS, OPTIONAL_VARS, moneyWithCode, shortDate, paymentRef, donorLine,
    resolveBatchVars, checkRendered, buildBatchEmail, describeBatches,
} from '../server/lib/disbursementBatch.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
    `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// `Intl` separa el símbolo con un espacio DURO (U+00A0); las comparaciones se
// hacen sobre el espacio normal para que la prueba se pueda leer.
const nbsp = (s) => String(s).replace(/\u00a0/g, ' ');

// Los cinco aportes del pedido, tal cual.
const APORTES = [
    { paymentId: 'f45d20db-1111-4111-8111-00000f45d20db', amount: 200000, currency: 'COP', gross: 200000, netContribution: 190000, platformFee: 4200, campaignId: 'c1', campaignName: 'Emergencia Terremoto Colombia 2026', donorName: 'Rotary Ibagué', donorEmail: 'doleokeplas@gmail.com', date: '2026-08-21T21:46:00Z' },
    { paymentId: 'd31d1e97-2222-4222-8222-00000d31d1e97', amount: 200000, currency: 'COP', gross: 200000, netContribution: 190000, platformFee: 4200, campaignId: 'c1', campaignName: 'Emergencia Terremoto Colombia 2026', donorName: 'Club La Vega', donorEmail: 'mpilir2002@yahoo.com', date: '2026-08-21T03:04:00Z' },
    { paymentId: 'dd4ac5de-3333-4333-8333-00000dd4ac5de', amount: 400000, currency: 'COP', gross: 400000, netContribution: 380000, platformFee: 8400, campaignId: 'c1', campaignName: 'Emergencia Terremoto Colombia 2026', donorName: 'Claudia Patricia Gutiérrez Barrero', donorEmail: 'alberto.garcia@drummondenergy.com', date: '2026-08-19T16:15:00Z' },
    { paymentId: '3f96556c-4444-4444-8444-000003f96556c', amount: 300000, currency: 'COP', gross: 300000, netContribution: 285000, platformFee: 6300, campaignId: 'c1', campaignName: 'Emergencia Terremoto Colombia 2026', donorName: 'Yaneth Solano', donorEmail: 'yaneth.solano@gmail.com', date: '2026-08-19T14:28:00Z' },
    { paymentId: 'adfc65dd-5555-4555-8555-00000adfc65dd', amount: 150000, currency: 'COP', gross: 150000, netContribution: 142500, platformFee: 3150, campaignId: 'c1', campaignName: 'Emergencia Terremoto Colombia 2026', donorName: 'Marcel van Opstal', donorEmail: 'mjhvanop@gmail.com', date: '2026-08-18T20:22:00Z' },
];
const LOTE = { id: 'e58db5cb-aab4-416c-8e52-304ff4af7e06', currency: 'COP', disbursedAt: '2026-08-31T17:00:00Z', method: 'transferencia', methodLabel: 'Transferencia bancaria', reference: '17208637', beneficiary: 'COLROTARIOS' };
const SITIO = { name: 'Rotary Distrito 4281', logoUrl: 'https://cdn.example.org/4281.png' };
const PLATAFORMA = { name: 'Club Platform for Rotary', logoUrl: 'https://cdn.example.org/cp.png' };
const CAMPANA = { name: 'Emergencia Terremoto Colombia 2026' };

// ── 1. Identidad ────────────────────────────────────────────────────
section('1. La identidad del lote');
eq('el tipo de notificación es uno', BATCH_NOTIFICATION_TYPE, 'disbursement_completed');
eq('la llave es lote + tipo', notificationKey('batch_123'), 'batch_123::disbursement_completed');
eq('la «contribución» de la bitácora lleva prefijo', deliveryContributionId('abc'), 'batch:abc');
eq('la referencia corta son los últimos 8 en mayúsculas', batchRef(LOTE.id), 'LOTE-F4AF7E06');
eq('sin id no hay referencia', batchRef(''), '');
eq('la referencia de un aporte es la de la Bóveda', paymentRef(APORTES[0].paymentId), '#F45D20DB');

// ── 2. Agrupación ───────────────────────────────────────────────────
section('2. ⚠️ Se agrupa por sitio + moneda + campaña + beneficiario');
eq('el beneficiario se compara sin mayúsculas ni espacios de más', normalizeBeneficiary('  COLROTARIOS  '), normalizeBeneficiary('colrotarios'));
ok('la llave lleva las cuatro partes', batchGroupKey({ clubId: 'club-1', currency: 'cop', campaignId: 'c1', beneficiary: 'X' }) === 'club-1|COP|c1|x');

let grupos = groupForBatches(APORTES, { clubId: 'club-1', beneficiary: 'COLROTARIOS' });
eq('cinco aportes del mismo destino → UN lote', grupos.length, 1);
eq('con los cinco adentro', grupos[0].items.length, 5);
eq('y el nombre de la campaña', grupos[0].campaignName, 'Emergencia Terremoto Colombia 2026');

const otra = { ...APORTES[0], paymentId: 'x1', campaignId: 'c2', campaignName: 'Becas' };
grupos = groupForBatches([...APORTES, otra], { clubId: 'club-1', beneficiary: 'COLROTARIOS' });
eq('otra campaña → otro lote', grupos.length, 2);
eq('en el orden en que apareció', grupos.map(g => g.campaignId), ['c1', 'c2']);

grupos = groupForBatches([...APORTES, { ...APORTES[0], paymentId: 'x2', currency: 'USD', amount: 50 }], { clubId: 'club-1', beneficiary: 'COLROTARIOS' });
eq('otra moneda → otro lote', grupos.map(g => g.currency), ['COP', 'USD']);

grupos = groupForBatches([{ ...APORTES[0], campaignId: null, campaignName: null }, APORTES[1]], { clubId: 'club-1', beneficiary: 'X' });
eq('un aporte sin campaña no se mezcla con uno con campaña', grupos.length, 2);
eq('y su campaña es null, no una cadena vacía', grupos[0].campaignId, null);

grupos = groupForBatches([{ ...APORTES[0], campaignName: null }, APORTES[1]], { clubId: 'club-1', beneficiary: 'X' });
eq('el nombre de la campaña se toma del primer aporte que lo traiga', grupos[0].campaignName, 'Emergencia Terremoto Colombia 2026');

eq('dos vueltas sobre la misma selección dan las mismas llaves',
    groupForBatches(APORTES, { clubId: 'c', beneficiary: 'B' }).map(g => g.key),
    groupForBatches([...APORTES].reverse(), { clubId: 'c', beneficiary: 'B' }).map(g => g.key));
eq('vacío → sin lotes', groupForBatches([], { clubId: 'c', beneficiary: 'B' }), []);

// ── 3. Totales ──────────────────────────────────────────────────────
section('3. Los totales: una moneda, redondeo al final, comisión derivada');
let t = batchTotals(APORTES);
eq('cuenta cinco', t.count, 5);
eq('lo girado suma 1.250.000', t.net, 1250000);
eq('el bruto de origen suma lo mismo acá', t.gross, 1250000);
eq('la retención de la plataforma se suma', t.platformRetention, 26250);
eq('la comisión del procesador se DERIVA: bruto − retención − neto del aporte', t.fees, 1250000 - 26250 - 1187500);
eq('y es COP', t.currency, 'COP');
t = batchTotals([APORTES[0], { ...APORTES[1], currency: 'USD' }]);
eq('dos monedas → no se suma y se dice', [t.ok, t.reason], [false, 'monedas_mezcladas']);
eq('sin aportes → sin totales', batchTotals([]).ok, false);
t = batchTotals([{ amount: 0.1, currency: 'USD' }, { amount: 0.2, currency: 'USD' }, { amount: 0.3, currency: 'USD' }]);
eq('el redondeo se hace una vez, al final', t.net, 0.6);
t = batchTotals([{ amount: 33333.4, currency: 'COP' }, { amount: 33333.4, currency: 'COP' }]);
eq('en pesos, sin decimales', t.net, 66667);

// ── 4. Presentación ─────────────────────────────────────────────────
section('4. Cómo se presenta cada dato');
eq('el importe lleva símbolo Y código', nbsp(moneyWithCode(1250000, 'COP')), '$ 1.250.000 COP');
ok('la fecha corta va en la zona del sitio', shortDate('2026-08-21T03:04:00Z') === '20/08/2026', shortDate('2026-08-21T03:04:00Z'));
eq('una fecha ilegible no inventa nada', shortDate('no es fecha'), '');
eq('un aporte anónimo no publica nombre ni correo', donorLine({ isAnonymous: true, donorName: 'X', donorEmail: 'x@y.org' }), { name: 'Aportante anónimo', email: '' });
eq('sin nombre, el correo hace de nombre', donorLine({ donorEmail: 'x@y.org' }), { name: 'x@y.org', email: 'x@y.org' });
eq('sin nada, se dice que no hay nombre', donorLine({}), { name: 'Aportante sin nombre', email: '' });

// ── 5. Variables ────────────────────────────────────────────────────
section('5. ⚠️ Lo obligatorio detiene; lo opcional se omite');
ok('las obligatorias son las que sin ellas el correo no dice nada', ['batch_ref', 'total_amount', 'currency', 'disbursement_date', 'site_name', 'count'].every(v => REQUIRED_VARS.includes(v)));
ok('la campaña, la referencia bancaria y los logotipos son opcionales', ['campaign_name', 'bank_reference', 'site_logo', 'platform_logo'].every(v => OPTIONAL_VARS.includes(v)));
let rv = resolveBatchVars({ batch: LOTE, items: APORTES, site: SITIO, campaign: CAMPANA, platform: PLATAFORMA });
eq('con todo, no falta nada obligatorio', rv.missingRequired, []);
// v4.1018 sumó `attachments_note`: la lista se comprueba por PERTENENCIA a lo
// opcional y por lo que de verdad falta, no como un literal que hay que
// reescribir cada vez que se declara una variable opcional nueva.
ok('nada de lo que falta es obligatorio', rv.missingOptional.every(v => OPTIONAL_VARS.includes(v)), rv.missingOptional.join(', '));
ok('faltan las notas y el comprobante (nadie los declaró)',
    ['notes', 'receipt_name'].every(v => rv.missingOptional.includes(v)), rv.missingOptional.join(', '));
ok('y el aviso de adjuntos, que este correo no declara',
    rv.missingOptional.includes('attachments_note'), rv.missingOptional.join(', '));
rv = resolveBatchVars({ batch: LOTE, items: APORTES, site: { name: '' }, campaign: null, platform: PLATAFORMA });
eq('sin sitio falta site_name', rv.missingRequired, ['site_name']);
rv = resolveBatchVars({ batch: { ...LOTE, disbursedAt: 'x' }, items: APORTES, site: SITIO, platform: PLATAFORMA });
eq('una fecha ilegible es una obligatoria que falta', rv.missingRequired, ['disbursement_date']);

// ── 6. La última puerta ─────────────────────────────────────────────
section('6. ⚠️ checkRendered: ningún marcador ni valor vacío sale');
eq('un {{marcador}} en el HTML lo atrapa', checkRendered({ html: '<p>Hola {{beneficiary_name}}</p>' }).ok, false);
eq('una ${interpolación} también', checkRendered({ text: 'Monto: ${amount}' }).ok, false);
eq('«undefined» también', checkRendered({ subject: 'Aporte de undefined' }).ok, false);
eq('«null» suelto también', checkRendered({ html: '<td>Campaña: null</td>' }).ok, false);
eq('«[object Object]» también', checkRendered({ html: '<td>[object Object]</td>' }).ok, false);
eq('«NaN» también', checkRendered({ html: '<td>NaN COP</td>' }).ok, false);
eq('un correo limpio pasa', checkRendered({ subject: 'Desembolso', html: '<p>Hola</p>', text: 'Hola' }).ok, true);
ok('«anular» no es «null»', checkRendered({ html: '<p>Se puede anular después.</p>' }).ok);
ok('y dice DÓNDE quedó el problema', /asunto/.test(checkRendered({ subject: '{{x}}' }).problemas[0]));

// ── 7. El correo consolidado ────────────────────────────────────────
section('7. El correo: uno, con todos los aportes y el total');
const correo = buildBatchEmail({ batch: LOTE, items: APORTES, site: SITIO, campaign: CAMPANA, platform: PLATAFORMA, recipientName: 'COLROTARIOS' });
eq('se compone', correo.ok, true);
eq('sin problemas', correo.problemas, []);
ok('el asunto dice cuántos y cuánto', /5 aportes/.test(correo.subject) && /1\.250\.000/.test(correo.subject));
const h = nbsp(correo.html);
ok('logotipo de la plataforma ARRIBA del título', h.indexOf('cp.png') < h.indexOf('El desembolso ha sido completado'));
ok('logotipo del sitio ABAJO del total', h.search(/total desembolsado/i) > 0 && h.lastIndexOf('4281.png') > h.search(/total desembolsado/i));
ok('título y subtítulo', h.includes('El desembolso ha sido completado') && h.includes('Confirmación de traslado de aportes'));
ok('saluda por nombre', h.includes('Hola COLROTARIOS,'));
ok('nombra a Club Platform como quien registra', h.includes('Club Platform for Rotary ha registrado como completado'));
ok('nombra la campaña en el cuerpo', h.includes('la campaña <strong style="color:#0f172a">Emergencia Terremoto Colombia 2026</strong>'));
for (const a of APORTES) ok(`lista a ${a.donorName}`, h.includes(a.donorName) && h.includes(a.donorEmail));
ok('cada aporte con su referencia de la Bóveda', ['#F45D20DB', '#D31D1E97', '#DD4AC5DE', '#3F96556C', '#ADFC65DD'].every(r => h.includes(r)));
ok('y con su fecha', h.includes('21/08/2026') && h.includes('18/08/2026'));
ok('la tarjeta: referencia del lote', h.includes('LOTE-F4AF7E06'));
ok('la tarjeta: 5 aportes, medio, referencia bancaria', h.includes('>5<') && h.includes('Transferencia bancaria') && h.includes('17208637'));
ok('total consolidado', /total desembolsado/i.test(h) && h.includes('$ 1.250.000 COP'));
ok('pie: sitio, campaña y quién lo generó', h.includes('Rotary Distrito 4281') && h.includes('Campaña: Emergencia Terremoto Colombia 2026') && h.includes('generado automáticamente por Club Platform for Rotary'));
ok('SIN «Observaciones» cuando no hay notas', !h.includes('Observaciones'));
ok('el texto plano lleva lo mismo', nbsp(correo.text).includes('TOTAL DESEMBOLSADO: $ 1.250.000 COP') && APORTES.every(a => correo.text.includes(a.donorName)));
ok('no queda ningún marcador', checkRendered(correo).ok);

section('  · lo opcional que falta NO deja renglones en blanco');
const sinCampana = buildBatchEmail({ batch: { ...LOTE, reference: null }, items: APORTES, site: { name: 'Sitio sin logo' }, campaign: null, platform: { name: 'Club Platform for Rotary' } });
eq('se compone igual', sinCampana.ok, true);
ok('sin campaña, el cuerpo habla del sitio', sinCampana.html.includes('a través de <strong style="color:#0f172a">Sitio sin logo</strong>'));
ok('sin campaña no hay renglón «Campaña:»', !sinCampana.html.includes('Campaña'));
ok('sin referencia bancaria no hay renglón', !sinCampana.html.includes('Referencia bancaria'));
ok('sin logotipos no hay <img>', !sinCampana.html.includes('<img'));
ok('pero sí el nombre de la plataforma arriba', sinCampana.html.indexOf('Club Platform for Rotary') < sinCampana.html.indexOf('El desembolso ha sido completado'));

section('  · v4.997 — el comprobante se DICE sólo cuando de verdad va adjunto');
ok('receipt_name es OPCIONAL: sin él el correo sale igual', OPTIONAL_VARS.includes('receipt_name') && !REQUIRED_VARS.includes('receipt_name'));
ok('sin `receipt` no hay renglón «Comprobante»', !correo.html.includes('Comprobante') && !correo.text.includes('Comprobante:'));
const conAdjunto = buildBatchEmail({ batch: { ...LOTE, receiptName: 'ignorado.pdf' }, items: APORTES, site: SITIO, campaign: CAMPANA, platform: PLATAFORMA, receipt: { name: 'soporte-giro.pdf', bytes: 1234 } });
ok('con `receipt` el detalle dice «Adjunto a este correo (nombre)»', conAdjunto.html.includes('Adjunto a este correo (soporte-giro.pdf)'));
ok('y el texto plano también', conAdjunto.text.includes('Comprobante: adjunto a este correo (soporte-giro.pdf)'));
ok('⚠️ el nombre NO se toma de batch.receiptName: lo declara quien envía, porque es quien sabe si lo pudo leer', !conAdjunto.html.includes('ignorado.pdf') && !buildBatchEmail({ batch: { ...LOTE, receiptName: 'ignorado.pdf' }, items: APORTES, site: SITIO, platform: PLATAFORMA }).html.includes('Adjunto a este correo'));
ok('un nombre de archivo malicioso va escapado', !buildBatchEmail({ batch: LOTE, items: APORTES, site: SITIO, platform: PLATAFORMA, receipt: { name: '<img src=x onerror=1>.pdf' } }).html.includes('<img src=x'));
ok('y sigue sin marcadores', checkRendered(conAdjunto).ok);

section('  · lo obligatorio que falta DETIENE');
const roto = buildBatchEmail({ batch: LOTE, items: APORTES, site: { name: '' }, platform: PLATAFORMA });
eq('no se compone', roto.ok, false);
ok('y nombra lo que faltó', /site_name/.test(roto.problemas.join(' ')));
eq('sin HTML que pueda salir por error', roto.html, '');

section('  · lo que escribe un desconocido va escapado');
const malicioso = buildBatchEmail({
    batch: { ...LOTE, notes: 'Giro <script>alert(1)</script>' },
    items: [{ ...APORTES[0], donorName: '<img src=x onerror=alert(1)>' }],
    site: SITIO, campaign: { name: 'Camp & "Co"' }, platform: PLATAFORMA,
});
ok('el nombre del aportante se escapa', !malicioso.html.includes('<img src=x') && malicioso.html.includes('&lt;img src=x'));
ok('las notas se escapan', !malicioso.html.includes('<script>') && malicioso.html.includes('&lt;script&gt;'));
ok('el nombre de la campaña se escapa', malicioso.html.includes('Camp &amp; &quot;Co&quot;'));

section('  · un aporte anónimo no viaja con nombre');
const anon = buildBatchEmail({ batch: LOTE, items: [APORTES[0], { ...APORTES[1], isAnonymous: true }], site: SITIO, campaign: CAMPANA, platform: PLATAFORMA });
ok('el anónimo sale como «Aportante anónimo»', anon.html.includes('Aportante anónimo') && !anon.html.includes('Club La Vega') && !anon.html.includes('mpilir2002'));
ok('pero cuenta en el total', nbsp(anon.html).includes('$ 400.000 COP'));

// ── 8. El resumen para la pantalla ──────────────────────────────────
section('8. describeBatches: una notificación por lote');
grupos = groupForBatches([...APORTES, otra], { clubId: 'club-1', beneficiary: 'COLROTARIOS' });
const desc = describeBatches(grupos);
eq('dos lotes', desc.cuantosLotes, 2);
eq('seis aportes', desc.cuantosAportes, 6);
eq('dos notificaciones, no seis', desc.cuantasNotificaciones, 2);
eq('cada lote con su total legible', desc.lotes.map(l => nbsp(l.totalLabel)), ['$ 1.250.000 COP', '$ 200.000 COP']);

// ── 9. Los archivos ─────────────────────────────────────────────────
section('9. ⚠️ El controlador ya no le pide a cada fila que avise');
const ctrl = read('server/controllers/disbursementController.js');
const bulk = ctrl.slice(ctrl.indexOf('export const createBulkDisbursements'), ctrl.indexOf('const respuestaDeLotes'));
ok('dentro del bucle del bloque, registerDisbursement va con notify: false', /registerDisbursement\(\{[\s\S]*?notify: false,[\s\S]*?batchId: lote\.id/.test(bulk));
ok('y NO con notify: true ni con el notify del cuerpo', !/notify: (true|req\.body\?\.notify)/.test(bulk));
ok('quien avisa es notifyBatch, una vez por lote', (bulk.match(/await notifyBatch\(/g) || []).length === 1);
ok('la agrupación la decide el criterio puro', /groupForBatches\(elegibles/.test(bulk));
ok('la operación repetida se contesta ANTES de registrar', bulk.indexOf('findBatchesByOperation') < bulk.indexOf('openBatch('));
ok('el lote se abre ANTES de registrar sus aportes', bulk.indexOf('await openBatch(') < bulk.indexOf('await registerDisbursement('));
ok('y se cierra con lo que de verdad entró', /closeBatch\(\{ batchId: lote\.id, items: hechos \}\)/.test(bulk));

section('  · disbursements.js: el lote y la puerta de los marcadores');
const lib = read('server/lib/disbursements.js');
ok('el reintento de un desembolso con lote va al lote', /if \(fila\.batchId\)[\s\S]*?retryBatchNotice\(/.test(lib));
ok('el camino de un solo desembolso ya no envía con variables sin resolver', /if \(salida\.missing\?\.length\)/.test(lib));
ok('beneficiary_name nunca queda vacío en ese camino', /beneficiary_name: beneficiario\?\.tradeName \|\| beneficiario\?\.legalName \|\| sitio\?\.name \|\| datos\.site/.test(lib));
ok('el lote se reclama en la bitácora bajo batch:<id>', /contributionId: deliveryContributionId\(lote\.id\)/.test(lib));
ok('un lote ya enviado no se repite sin reintento expreso', /lote\.notifyState === 'enviado' && !retry/.test(lib));
ok('el aviso del lote se propaga a sus N filas', /UPDATE "Disbursement"[\s\S]*?WHERE "batchId" = \$1/.test(lib));
ok('el ON CONFLICT del lote repite el predicado del índice parcial', /ON CONFLICT \("operationKey", "groupKey"\) WHERE "operationKey" <> '' DO NOTHING/.test(lib));
ok('el correo que no compone NO sale', /if \(!correo\.ok\)[\s\S]*?state: 'fallido'/.test(lib));
ok('el criterio del lote NO importa la base', !/from '\.\/db\.js'/.test(read('server/lib/disbursementBatch.js')));

section('  · v4.997 — el comprobante viaja ADJUNTO en los dos caminos de envío');
const enviosConAdjunto = (lib.match(/sendPlatformEmail\(\{[\s\S]*?\.\.\.\(attachments\?\.length \? \{ attachments \} : \{\}\),/g) || []).length;
eq('los DOS envíos del desembolso (lote y de a uno) pasan `attachments`', enviosConAdjunto, 2);
ok('el lote baja los comprobantes UNA vez, ANTES del bucle de destinatarios', (() => {
    const i = lib.indexOf('const adjunto = await receiptAttachments(lote)');
    const j = lib.indexOf('for (const destino of destinatarios.email) {', i);
    return i > 0 && j > i && !lib.slice(i, j).includes('for (const destino');
})());
ok('el de un aporte también', /const adjunto = await receiptAttachments\(disbursement\)/.test(lib));
ok('el correo sólo afirma el adjunto si se pudo leer', /receipt: adjunto\.ok \? \{ name: adjunto\.info\.name/.test(lib));
ok('leerlo NUNCA lanza: un comprobante ilegible no frena el aviso', /export const receiptAttachment = async[\s\S]*?catch \(e\) \{[\s\S]*?return \{ ok: false, motivo/.test(lib));
ok('se lee por el SDK con GetObjectCommand, no por la URL pública (v4.912)', /new GetObjectCommand\(\{ Bucket: bucketName\(\), Key: receiptKey \}\)/.test(lib));
ok('y en base64, que entienden Resend y SMTP por igual', /content: Buffer\.from\(bytes\)\.toString\('base64'\)/.test(lib));
ok('EmailService acepta `attachments` en el envío de plataforma', /static async sendPlatformEmail\(\{[^}]*attachments/.test(read('server/services/EmailService.js')));

section('  · v4.998 — VARIOS comprobantes por giro');
ok('la lista se lee por UN solo punto (`receiptFilesOf`), y cae a las cuatro columnas de siempre',
    /export const receiptFilesOf = \(row = \{\}\) =>[\s\S]*?if \(row\?\.receiptKey\) \{/.test(lib));
ok('cada archivo decide por su cuenta: uno ilegible no frena a los demás',
    /export const receiptAttachments = async[\s\S]*?for \(const f of archivos\) \{[\s\S]*?if \(r\.ok\) \{ attachments\.push[\s\S]*?else faltan\.push/.test(lib));
ok('los INSERT del desembolso y del lote escriben "receiptFiles"',
    (lib.match(/INSERT INTO "Disbursement"[\s\S]*?"receiptFiles"\)/) !== null) && (lib.match(/INSERT INTO "DisbursementBatch"[\s\S]*?"receiptFiles"\)/) !== null));
ok('y ninguna respuesta pública lleva la clave: `receiptFilesPublicos` la quita',
    /export const receiptFilesPublicos = [\s\S]*?\(\{ index, name: f\.name, mime: f\.mime, bytes: f\.bytes \}\)/.test(lib));
{
    const ensureTxt = read('server/lib/ensureDisbursementSchema.js');
    ok('"receiptFiles" se AGREGA con ADD COLUMN en las DOS tablas (una base de v4.996 ya las tiene sin ella)',
        /ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "receiptFiles" JSONB/.test(ensureTxt)
        && /ALTER TABLE "DisbursementBatch" ADD COLUMN IF NOT EXISTS "receiptFiles" JSONB/.test(ensureTxt));
    const ctrlTxt = read('server/controllers/disbursementController.js');
    ok('el controlador lee la LISTA de multer, no `req.file`', !/req\.file\?\.buffer/.test(ctrlTxt) && /uploadReceipts\(\{/.test(ctrlTxt));
    ok('se juzgan TODOS antes de subir ninguno', /const juicio = checkReceipts\([\s\S]*?if \(!juicio\.ok\) return[\s\S]*?for \(const f of lista\) \{[\s\S]*?await uploadReceipt\(/.test(lib));
    const rutaTxt = read('server/routes/financial.js');
    ok('la ruta recibe varios bajo el mismo campo', /_upload\.array\('receipt', RECEIPT_MAX_FILES \+ 1\)/.test(rutaTxt));
    const esp = read('src/lib/receiptFiles.ts');
    const srv = read('server/lib/walletLifecycle.js');
    const num = (txt, k) => (txt.match(new RegExp(`export const ${k} = ([^;]+);`)) || [])[1];
    eq('el espejo del navegador tiene el MISMO tope de archivos que el servidor', num(esp, 'RECEIPT_MAX_FILES'), num(srv, 'RECEIPT_MAX_FILES'));
    eq('y el mismo peso máximo', num(esp, 'RECEIPT_MAX_BYTES'), num(srv, 'RECEIPT_MAX_BYTES'));
    const input = read('src/components/admin/wallet/ReceiptFilesInput.tsx');
    ok('el selector es UNO, compartido, y admite varios', /multiple/.test(input)
        && /ReceiptFilesInput/.test(read('src/components/admin/wallet/BulkDisbursementBar.tsx'))
        && /ReceiptFilesInput/.test(read('src/components/admin/wallet/DisbursementSection.tsx')));
    ok('y cada archivo va bajo el campo `receipt`, como antes',
        /archivos\.forEach\(a => fd\.append\('receipt', a\)\)/.test(read('src/components/admin/wallet/BulkDisbursementBar.tsx'))
        && /archivos\.forEach\(a => fd\.append\('receipt', a\)\)/.test(read('src/components/admin/wallet/DisbursementSection.tsx')));
    const email = read('server/lib/disbursementBatch.js');
    ok('el correo dice «Comprobantes: adjuntos» en plural y nombra a todos', /Comprobantes' : 'Comprobante'/.test(email) && /receipt\.names\.filter\(Boolean\)\.join\(', '\)/.test(email));
}

section('  · el esquema, las rutas y el guardián');
const ensure = read('server/lib/ensureDisbursementSchema.js');
ok('la tabla del lote existe', /CREATE TABLE IF NOT EXISTS "DisbursementBatch"/.test(ensure));
// ⚠️ Se comprueba la INVARIANTE —que las dos vías ejecuten el SQL del lote—,
// NO la forma exacta de la concatenación. Fijada como
// `db.query(ALTERS + BATCH_SQL)`, esta prueba se rompe en cuanto se agrega una
// tabla al módulo con el criterio intacto, y lo cómodo entonces es actualizar
// el literal — que es perder la comprobación (la lección de v4.984).
const vias = [...ensure.matchAll(/await db\.query\(([^)]*)\)/g)].map(m => m[1]);
ok('y se crea también en el atajo de una base que ya tenía las otras dos',
    vias.some(v => /\bALTERS\b/.test(v) && /\bBATCH_SQL\b/.test(v))
    && vias.some(v => /\bSQL\b/.test(v) && /\bBATCH_SQL\b/.test(v)),
    'las DOS vías del ensure tienen que ejecutar BATCH_SQL');
ok('el índice de la operación es parcial y lo dice', /"DisbursementBatch_operation_key"[\s\S]*?WHERE "operationKey" <> ''/.test(ensure));
ok('ninguna comilla invertida dentro del SQL del lote', !/`[\s\S]*?BATCH_SQL = `[^`]*`[^`]*`/.test(ensure) || !/BATCH_SQL = `[^`]*`{2}/.test(ensure));
const rutas = read('server/routes/financial.js');
const iLista = rutas.indexOf("'/wallet/disbursement-batches'");
const iParam = rutas.indexOf("'/wallet/disbursement-batches/:id'");
ok('la literal va antes que la paramétrica', iLista > 0 && iParam > iLista);
ok('el previo del bloque existe', /'\/wallet\/disbursements\/bulk\/preview'/.test(rutas));
ok('el guardián documenta DisbursementBatch', /DisbursementBatch/.test(read('scripts/db-push-guard.mjs')));

section('  · la pantalla');
const barra = read('src/components/admin/wallet/BulkDisbursementBar.tsx');
ok('el modal manda operationKey', /operationKey,\s*\n\s*confirm: true/.test(barra));
ok('pide el previo al servidor en vez de agrupar por su cuenta', /\/wallet\/disbursements\/bulk\/preview/.test(barra) && !/groupForBatches/.test(barra));
ok('ofrece «Ver desembolso»', /Ver desembolso/.test(barra) && /DisbursementBatchModal/.test(barra));
const recipients = read('src/components/admin/wallet/NoticeRecipients.tsx');
ok('ya no promete «un aviso por cada aporte»', !/Se enviará un aviso por cada aporte/.test(recipients));
ok('dice «notificación consolidada»', /notificación consolidada/.test(recipients));
const ficha = read('src/components/admin/wallet/DisbursementSection.tsx');
ok('la ficha del aporte muestra la referencia del lote', /Desembolso: /.test(ficha) && /batchRef/.test(ficha));

console.log(`\n${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
