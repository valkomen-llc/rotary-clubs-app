#!/usr/bin/env node
/**
 * Pruebas del registro de auditoría y del diagnóstico del CRM (v4.702).
 *
 * Necesita una `DATABASE_URL` de una base VACÍA con las tablas de WhatsApp ya
 * creadas. Aborta si la cadena parece de un entorno real, igual que
 * `test-crm-automation.mjs`.
 *
 * Las llamadas a Meta se interceptan reemplazando `globalThis.fetch`: lo que se
 * comprueba es cómo LEEMOS sus respuestas, no que Meta funcione.
 */
import crypto from 'crypto';

const url = process.env.DATABASE_URL || '';
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
if (/prod|neon\.tech|amazonaws|supabase/i.test(url)) {
  console.error('DATABASE_URL parece de un entorno real. Abortando.');
  process.exit(1);
}

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function group(t) { results.push(`\n${t}`); }

const db = (await import('../server/lib/db.js')).default;

// Las tablas se vacían al empezar, no al terminar: si una corrida se cae a la
// mitad deja filas, y la siguiente contaría las suyas más las de la anterior.
// Limpiar al final sólo funciona cuando todo sale bien, que es justo cuando no
// hace falta.
const RESET = ['CrmWebhookEvent', 'CrmOutboundLog', 'WhatsAppMessageLog', 'WhatsAppTemplate', 'WhatsAppContact', 'CrmAlert'];

// ── Fixtures mínimos ────────────────────────────────────────────────────────
const CLUB = 'club-diag-test';
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "WhatsAppConfig" (
  id TEXT PRIMARY KEY, "clubId" TEXT UNIQUE, "phoneNumberId" TEXT, "wabaId" TEXT,
  "accessToken" TEXT, "verifyToken" TEXT, "appId" TEXT, enabled BOOLEAN DEFAULT true,
  "lastVerifiedAt" TIMESTAMP(3))`);
await db.query(`CREATE TABLE IF NOT EXISTS "WhatsAppContact" (
  id TEXT PRIMARY KEY, "clubId" TEXT, name TEXT, phone TEXT, source TEXT,
  "profilePictureUrl" TEXT, "autoReplyPausedUntil" TIMESTAMP(3), "lastInboundAt" TIMESTAMP(3),
  "totalSent" INT DEFAULT 0, "totalDelivered" INT DEFAULT 0, "totalRead" INT DEFAULT 0,
  "totalFailed" INT DEFAULT 0, "createdAt" TIMESTAMP(3) DEFAULT NOW(), "updatedAt" TIMESTAMP(3) DEFAULT NOW())`);
await db.query(`CREATE TABLE IF NOT EXISTS "WhatsAppMessageLog" (
  id TEXT PRIMARY KEY, "clubId" TEXT, "campaignId" TEXT, "contactId" TEXT, phone TEXT,
  "messageId" TEXT, "templateName" TEXT, "bodyText" TEXT, status TEXT, direction TEXT,
  "errorCode" TEXT, "errorMessage" TEXT, "sentAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "journeyId" TEXT, "journeyRunId" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT NOW(), "updatedAt" TIMESTAMP(3) DEFAULT NOW())`);
await db.query(`CREATE TABLE IF NOT EXISTS "WhatsAppTemplate" (
  id TEXT PRIMARY KEY, "clubId" TEXT, name TEXT, "displayName" TEXT, category TEXT,
  language TEXT, status TEXT, "bodyText" TEXT, folder TEXT)`);

for (const t of RESET) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
await db.query(`CREATE TABLE IF NOT EXISTS "WhatsAppContact" (
  id TEXT PRIMARY KEY, "clubId" TEXT, name TEXT, phone TEXT, source TEXT,
  "profilePictureUrl" TEXT, "autoReplyPausedUntil" TIMESTAMP(3), "lastInboundAt" TIMESTAMP(3),
  "totalSent" INT DEFAULT 0, "totalDelivered" INT DEFAULT 0, "totalRead" INT DEFAULT 0,
  "totalFailed" INT DEFAULT 0, "createdAt" TIMESTAMP(3) DEFAULT NOW(), "updatedAt" TIMESTAMP(3) DEFAULT NOW())`);
await db.query(`CREATE TABLE IF NOT EXISTS "WhatsAppMessageLog" (
  id TEXT PRIMARY KEY, "clubId" TEXT, "campaignId" TEXT, "contactId" TEXT, phone TEXT,
  "messageId" TEXT, "templateName" TEXT, "bodyText" TEXT, status TEXT, direction TEXT,
  "errorCode" TEXT, "errorMessage" TEXT, "sentAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "journeyId" TEXT, "journeyRunId" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT NOW(), "updatedAt" TIMESTAMP(3) DEFAULT NOW())`);
await db.query(`CREATE TABLE IF NOT EXISTS "WhatsAppTemplate" (
  id TEXT PRIMARY KEY, "clubId" TEXT, name TEXT, "displayName" TEXT, category TEXT,
  language TEXT, status TEXT, "bodyText" TEXT, folder TEXT)`);

await db.query(`INSERT INTO "Club" (id,name,type) VALUES ($1,'Distrito Prueba','district') ON CONFLICT (id) DO NOTHING`, [CLUB]);
await db.query(
  `INSERT INTO "WhatsAppConfig" (id,"clubId","phoneNumberId","wabaId","accessToken","verifyToken",enabled)
   VALUES ($1,$2,'PHONE_A','WABA_1','tok','verif',true) ON CONFLICT ("clubId") DO NOTHING`,
  [crypto.randomUUID(), CLUB]
);

// ── 1. El esquema de auditoría se crea y es idempotente ─────────────────────
group('Esquema de auditoría');
const audit = await import('../server/lib/crmWebhookAudit.js');
await audit.ensureWebhookAuditSchema();
await audit.ensureWebhookAuditSchema();
const tbls = await db.query(
  `SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1)`,
  [['CrmWebhookEvent', 'CrmOutboundLog']]
);
ok('crea CrmWebhookEvent y CrmOutboundLog', tbls.rows.length === 2, `encontró ${tbls.rows.length}`);

// ── 2. Clasificación del webhook ────────────────────────────────────────────
group('Clasificación');
const msgBody = { object: 'whatsapp_business_account', entry: [{ id: 'WABA_1', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'PHONE_A' }, messages: [{ id: 'wamid.1', from: '573001112233', type: 'text', text: { body: 'hola' } }] } }] }] };
const stBody = { object: 'whatsapp_business_account', entry: [{ id: 'WABA_1', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'PHONE_A' }, statuses: [{ id: 'wamid.out1', status: 'delivered', timestamp: '1700000000' }] } }] }] };
ok('reconoce mensajes', audit.classifyWebhook(msgBody).kind === 'messages');
ok('reconoce estados', audit.classifyWebhook(stBody).kind === 'statuses');
ok('cuenta los eventos', audit.classifyWebhook(stBody).count === 1);

// ── 3. La firma distingue «no se pudo comprobar» de «inválida» ─────────────
group('Firma');
delete process.env.META_APP_SECRET;
delete process.env.WA_APP_SECRET;
ok('sin App Secret devuelve null, no false', audit.verifySignature(Buffer.from('{}'), 'sha256=abc') === null);

process.env.META_APP_SECRET = 'secreto-de-prueba';
const raw = Buffer.from(JSON.stringify(msgBody));
const good = 'sha256=' + crypto.createHmac('sha256', 'secreto-de-prueba').update(raw).digest('hex');
ok('acepta la firma correcta', audit.verifySignature(raw, good) === true);
ok('rechaza una firma alterada', audit.verifySignature(raw, good.slice(0, -1) + (good.slice(-1) === 'a' ? 'b' : 'a')) === false);
ok('sin cuerpo crudo devuelve null', audit.verifySignature(null, good) === null);

// ── 4. La fila se abre ANTES de procesar y se cierra con el resultado ──────
group('Persistencia del webhook');
const id1 = await audit.openWebhookEvent({ body: msgBody, headers: { 'x-hub-signature-256': good, 'user-agent': 'facebookexternalua', cookie: 'no-guardar' }, signatureValid: true });
ok('devuelve un id', !!id1);
const opened = await audit.webhookEventDetail(id1);
// `payload` es jsonb: Postgres normaliza el orden de las claves, así que se
// compara la ESTRUCTURA, no el texto. Lo que la regla exige es que no se
// recorte nada, no que se conserven los bytes.
const deepEq = (a, b) => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => deepEq(a[k], b[k]));
};
ok('guarda el payload completo', deepEq(opened.payload, msgBody),
   JSON.stringify(opened.payload));
ok('conserva el mensaje entrante dentro del payload',
   opened.payload.entry[0].changes[0].value.messages[0].text.body === 'hola');
ok('nace con outcome recibido', opened.outcome === 'recibido');
ok('extrae el phoneNumberId', opened.phoneNumberId === 'PHONE_A');
ok('extrae el wabaId', opened.wabaId === 'WABA_1');
ok('no guarda cookies', !('cookie' in (opened.headers || {})), JSON.stringify(opened.headers));
ok('guarda la firma recibida', !!opened.headers['x-hub-signature-256']);

await audit.closeWebhookEvent(id1, { clubId: CLUB, resolution: 'phone_number_id', outcome: 'ok', durationMs: 42 });
const closed = await audit.webhookEventDetail(id1);
ok('cierra con el resultado', closed.outcome === 'ok' && closed.resolution === 'phone_number_id');
ok('guarda la duración', closed.durationMs === 42);
ok('ata la fila al sitio', closed.clubId === CLUB);

const id2 = await audit.openWebhookEvent({ body: stBody, headers: {}, signatureValid: null });
await audit.closeWebhookEvent(id2, { clubId: null, resolution: 'unknown_phone_number_id', outcome: 'skipped' });
const problems = await audit.recentWebhooks({ onlyProblems: true, limit: 10 });
ok('el filtro de problemas excluye los ok', problems.every(r => r.outcome !== 'ok') && problems.some(r => r.id === id2));

// El error se guarda con su traza: es lo que permite diagnosticar sin reproducir.
const id3 = await audit.openWebhookEvent({ body: msgBody, headers: {} });
await audit.closeWebhookEvent(id3, { outcome: 'error', error: new Error('estalló al procesar') });
const errored = await audit.webhookEventDetail(id3);
ok('guarda el mensaje del error', errored.errorMessage === 'estalló al procesar');
ok('guarda la traza', !!errored.errorStack);

// ── 5. Registro de salidas ─────────────────────────────────────────────────
group('Registro de salidas');
await audit.logOutbound({
  clubId: CLUB, operation: 'campaign_send', endpoint: 'https://graph.facebook.com/v21.0/PHONE_A/messages',
  requestBody: { to: '573001112233' }, httpStatus: 200, responseBody: { messages: [{ id: 'wamid.out1' }] },
  messageId: 'wamid.out1', durationMs: 310, ok: true, campaignId: 'camp-1', phone: '+573001112233',
  templateName: 'bienvenida',
});
await audit.logOutbound({
  clubId: CLUB, operation: 'campaign_send', endpoint: 'https://graph.facebook.com/v21.0/PHONE_A/messages',
  requestBody: { to: '573009998877' }, httpStatus: 400,
  responseBody: { error: { code: 132001, message: 'Template name does not exist' } },
  errorCode: 132001, errorMessage: 'Template name does not exist', durationMs: 120, ok: false,
  campaignId: 'camp-1', phone: '+573009998877', templateName: 'inexistente',
});
const outs = await audit.recentOutbound({ clubId: CLUB, limit: 10 });
ok('registra las dos llamadas', outs.length === 2, `${outs.length}`);
ok('guarda la respuesta cruda de Meta', outs.some(o => o.responseBody?.error?.code === 132001));
const failures = await audit.recentOutbound({ clubId: CLUB, onlyFailures: true, limit: 10 });
ok('el filtro de fallos deja sólo los fallidos', failures.length === 1 && failures[0].ok === false);

const summary = await audit.auditSummary(CLUB);
ok('el resumen cuenta los webhooks', summary.webhooks24h.reduce((a, r) => a + r.n, 0) >= 3);
ok('el resumen cuenta las salidas', summary.outbound24h.reduce((a, r) => a + r.n, 0) === 2);

// ── 6. Diagnóstico: cómo leemos lo que contesta Meta ───────────────────────
group('Diagnóstico contra Meta');
const { diagnoseClub, auditTemplates } = await import('../server/lib/crmDiagnostics.js');
const realFetch = globalThis.fetch;
const stateOf = (d, id) => d.checks.find(c => c.id === id)?.state;

function mockMeta(routes) {
  globalThis.fetch = async (u) => {
    const path = String(u).replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, '');
    for (const [re, resp] of routes) {
      if (re.test(path)) return { ok: !resp.error, status: resp.error ? 400 : 200, json: async () => resp };
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'sin ruta simulada', code: 404 } }) };
  };
}

// Caso sano.
mockMeta([
  [/^\/PHONE_A\?/, { verified_name: 'Distrito 4281', display_phone_number: '+57 300 000', quality_rating: 'GREEN' }],
  [/phone_numbers/, { data: [{ id: 'PHONE_A', display_phone_number: '+57 300 000' }] }],
  [/subscribed_apps/, { data: [{ whatsapp_business_api_data: { id: 'app-1' } }] }],
]);
let d = await diagnoseClub(CLUB);
ok('token válido → ok', stateOf(d, 'token') === 'ok');
ok('el número coincide → ok', stateOf(d, 'phone_id_match') === 'ok');
ok('suscripción presente → ok', stateOf(d, 'webhook_subscription') === 'ok');

// Token vencido: el 190 se distingue del resto.
mockMeta([[/./, { error: { code: 190, message: 'Session has expired' } }]]);
d = await diagnoseClub(CLUB);
ok('token 190 → error', stateOf(d, 'token') === 'error');
ok('el 190 se explica como token vencido', /vencido|revocado/i.test(d.checks.find(c => c.id === 'token').detail));
ok('lo que no se pudo comprobar queda en unknown, no en ok', stateOf(d, 'phone_number') === 'unknown');

// La avería principal: el phoneNumberId guardado no es el de la cuenta.
mockMeta([
  [/^\/PHONE_A\?/, { verified_name: 'Distrito 4281', quality_rating: 'GREEN' }],
  [/phone_numbers/, { data: [{ id: 'PHONE_B', display_phone_number: '+57 300 111' }] }],
  [/subscribed_apps/, { data: [{ whatsapp_business_api_data: { id: 'app-1' } }] }],
]);
d = await diagnoseClub(CLUB);
ok('phoneNumberId que no coincide → error', stateOf(d, 'phone_id_match') === 'error');
ok('explica que los webhooks se descartan', /descartan/i.test(d.checks.find(c => c.id === 'phone_id_match').detail));

// Meta dio de baja la suscripción: todo lo demás sano.
mockMeta([
  [/^\/PHONE_A\?/, { verified_name: 'Distrito 4281', quality_rating: 'GREEN' }],
  [/phone_numbers/, { data: [{ id: 'PHONE_A' }] }],
  [/subscribed_apps/, { data: [] }],
]);
d = await diagnoseClub(CLUB);
ok('sin apps suscritas → error', stateOf(d, 'webhook_subscription') === 'error');
ok('el veredicto general no queda en ok', d.checks.some(c => c.state === 'error'));

// ── 7. El síntoma que motivó la auditoría ─────────────────────────────────
group('Envíos sin ninguna confirmación');
for (let i = 0; i < 8; i++) {
  await db.query(
    `INSERT INTO "WhatsAppMessageLog" (id,"clubId",phone,"messageId",status,direction,"sentAt")
     VALUES ($1,$2,$3,$4,'sent','outgoing',NOW())`,
    [crypto.randomUUID(), CLUB, '+5730011122' + i, 'wamid.sin' + i]
  );
}
d = await diagnoseClub(CLUB);
const feedback = d.checks.find(c => c.id === 'delivery_feedback');
ok('8 enviados y 0 confirmados → error', feedback.state === 'error', feedback.detail);
ok('dice que el problema es la vuelta, no la entrega', /no llega es la respuesta|NINGUNA confirmación/i.test(feedback.detail));

// Con confirmaciones, deja de ser un error.
await db.query(`UPDATE "WhatsAppMessageLog" SET "deliveredAt"=NOW() WHERE "clubId"=$1`, [CLUB]);
d = await diagnoseClub(CLUB);
ok('con entregas → ok', d.checks.find(c => c.id === 'delivery_feedback').state === 'ok');

// ── 8. Plantillas: local frente a Meta ────────────────────────────────────
group('Auditoría de plantillas');
await db.query(
  `INSERT INTO "WhatsAppTemplate" (id,"clubId",name,"displayName",category,language,status,"bodyText",folder)
   VALUES ($1,$2,'bienvenida','Bienvenida','UTILITY','es','approved','hola','bienvenida'),
          ($3,$2,'fantasma','Fantasma','UTILITY','es','approved','hola','otros'),
          ($4,$2,'desfasada','Desfasada','UTILITY','es','approved','hola','otros')`,
  [crypto.randomUUID(), CLUB, crypto.randomUUID(), crypto.randomUUID()]
);
mockMeta([[/message_templates/, { data: [
  { name: 'bienvenida', language: 'es', status: 'APPROVED', category: 'UTILITY' },
  { name: 'desfasada', language: 'es', status: 'REJECTED', category: 'UTILITY' },
  { name: 'solo_en_meta', language: 'es', status: 'APPROVED', category: 'MARKETING' },
] }]]);
const ta = await auditTemplates(CLUB);
ok('detecta la que no existe en Meta', ta.missingInMeta.length === 1 && ta.missingInMeta[0].name === 'fantasma');
ok('detecta el estado desactualizado', ta.outOfSync.length === 1 && ta.outOfSync[0].name === 'desfasada');
ok('lista la que sólo está en Meta', ta.onlyInMeta.some(t => t.name === 'solo_en_meta'));
ok('la que coincide no se marca', ta.rows.find(r => r.name === 'bienvenida').issue === null);

globalThis.fetch = realFetch;

// ── 9. El webhook de verdad, de punta a punta ─────────────────────────────
//
// Son las pruebas controladas que pide la auditoría. Llaman al `handleWebhook`
// real —no a una copia— con un `req`/`res` simulados, y comprueban lo que queda
// escrito en la base.
group('Webhook de punta a punta');

// Tablas que toca el camino completo.
await db.query(`CREATE TABLE IF NOT EXISTS "CrmAlert" (
  id TEXT PRIMARY KEY, "clubId" TEXT, type TEXT, severity TEXT, title TEXT, detail TEXT,
  "siteId" TEXT, "entityId" TEXT, "dedupeKey" TEXT UNIQUE, "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT NOW())`);

process.env.CRM_PLATFORM_CLUB_ID = CLUB;
const { handleWebhook } = await import('../server/controllers/crmController.js');

function fakeRes() {
  const r = { statusCode: null, headersSent: false };
  r.sendStatus = (c) => { r.statusCode = c; r.headersSent = true; return r; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = () => { r.headersSent = true; return r; };
  return r;
}
const post = async (body, headers = {}) => {
  const res = fakeRes();
  await handleWebhook({ body, headers, rawBody: Buffer.from(JSON.stringify(body)) }, res);
  return res;
};
const lastEvent = async () => (await db.query(
  `SELECT * FROM "CrmWebhookEvent" ORDER BY "receivedAt" DESC, ctid DESC LIMIT 1`)).rows[0];

// Prueba 1 — mensaje entrante con el número correcto.
await db.query(`DELETE FROM "CrmWebhookEvent"`);
let res = await post(msgBody);
ok('1. responde 200 a Meta', res.statusCode === 200);
let ev = await lastEvent();
ok('1. deja la fila del webhook', !!ev);
ok('1. lo encamina por phoneNumberId', ev.resolution === 'phone_number_id', ev.resolution);
ok('1. lo ata al sitio', ev.clubId === CLUB);
ok('1. mide cuánto tardó', ev.durationMs !== null);
ok('1. termina sin error', ev.outcome === 'ok', `${ev.outcome}: ${ev.errorMessage || ''}`);
const inMsg = await db.query(`SELECT * FROM "WhatsAppMessageLog" WHERE "messageId"='wamid.1'`);
ok('1. guarda el mensaje entrante', inMsg.rows.length === 1);
ok('1. guarda el texto', inMsg.rows[0]?.bodyText === 'hola');

// Prueba 2 — idempotencia: Meta reintenta el mismo webhook.
await post(msgBody);
const dupe = await db.query(`SELECT COUNT(*)::int AS n FROM "WhatsAppMessageLog" WHERE "messageId"='wamid.1'`);
ok('2. el reintento no duplica el mensaje', dupe.rows[0].n === 1, `${dupe.rows[0].n}`);
const evCount = await db.query(`SELECT COUNT(*)::int AS n FROM "CrmWebhookEvent"`);
ok('2. pero SÍ deja constancia del reintento', evCount.rows[0].n === 2, `${evCount.rows[0].n}`);

// Prueba 3 — el phoneNumberId cambió; el WABA sigue siendo el mismo.
// Es la avería que dejaba el módulo mudo, y ahora se resuelve por la cuenta.
const otroNumero = JSON.parse(JSON.stringify(msgBody));
otroNumero.entry[0].changes[0].value.metadata.phone_number_id = 'PHONE_CAMBIADO';
otroNumero.entry[0].changes[0].value.messages[0].id = 'wamid.2';
res = await post(otroNumero);
ev = await lastEvent();
ok('3. responde 200 igual', res.statusCode === 200);
ok('3. lo rescata por el WABA', ev.resolution === 'waba_id', ev.resolution);
ok('3. y guarda el mensaje', (await db.query(`SELECT 1 FROM "WhatsAppMessageLog" WHERE "messageId"='wamid.2'`)).rows.length === 1);

// Prueba 4 — ni el número ni la cuenta se reconocen: se descarta, PERO se anota.
const desconocido = JSON.parse(JSON.stringify(msgBody));
desconocido.entry[0].id = 'WABA_AJENA';
desconocido.entry[0].changes[0].value.metadata.phone_number_id = 'PHONE_AJENO';
res = await post(desconocido);
ev = await lastEvent();
ok('4. responde 200 (no se le devuelve un error a Meta)', res.statusCode === 200);
ok('4. queda registrado como no encaminado', ev.resolution === 'unknown_phone_number_id', ev.resolution);
ok('4. conserva el payload para poder diagnosticarlo', ev.payload?.entry?.[0]?.id === 'WABA_AJENA');
const alerta = await db.query(`SELECT * FROM "CrmAlert" WHERE type='webhook_unrouted'`);
ok('4. levanta la alerta', alerta.rows.length === 1, `${alerta.rows.length}`);
ok('4. la alerta nombra el número', /PHONE_AJENO/.test(alerta.rows[0]?.detail || ''));

// La alerta no se repite el mismo día: una condición que persiste avisa una vez.
await post(desconocido);
const alerta2 = await db.query(`SELECT COUNT(*)::int AS n FROM "CrmAlert" WHERE type='webhook_unrouted'`);
ok('4. no repite la alerta el mismo día', alerta2.rows[0].n === 1, `${alerta2.rows[0].n}`);

// Prueba 5 — estados de entrega: uno conocido y uno huérfano.
await db.query(
  `INSERT INTO "WhatsAppMessageLog" (id,"clubId",phone,"messageId",status,direction,"sentAt")
   VALUES ($1,$2,'+573001112233','wamid.conocido','sent','outgoing',NOW())`,
  [crypto.randomUUID(), CLUB]
);
const estados = JSON.parse(JSON.stringify(stBody));
estados.entry[0].changes[0].value.statuses = [
  { id: 'wamid.conocido', status: 'delivered', timestamp: '1700000000' },
  { id: 'wamid.huerfano', status: 'delivered', timestamp: '1700000000' },
];
res = await post(estados);
ev = await lastEvent();
const entregado = await db.query(`SELECT status,"deliveredAt" FROM "WhatsAppMessageLog" WHERE "messageId"='wamid.conocido'`);
ok('5. aplica el estado al mensaje que conoce', entregado.rows[0]?.status === 'delivered');
ok('5. sella la fecha de entrega', !!entregado.rows[0]?.deliveredAt);
ok('5. marca el lote como parcial', ev.outcome === 'partial', ev.outcome);
ok('5. dice cuántos estados quedaron sin envío', /1 de 2/.test(ev.resolution || ''), ev.resolution);

// Prueba 6 — un cuerpo que no es de WhatsApp no se procesa ni se pierde.
res = await post({ object: 'page', entry: [] });
ev = await lastEvent();
ok('6. responde 200 a un objeto ajeno', res.statusCode === 200);
ok('6. lo registra como ajeno', ev.resolution === 'objeto_ajeno', ev.resolution);


// ── Resultado ──────────────────────────────────────────────────────────────
console.log(results.join('\n'));
console.log(`\n${pass} pasaron, ${fail} fallaron\n`);
await db.end?.();
process.exit(fail ? 1 : 0);
