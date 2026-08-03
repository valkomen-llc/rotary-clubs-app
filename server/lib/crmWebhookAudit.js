// Bitácora de webhooks y de llamadas salientes a Meta.
//
// POR QUÉ EXISTE ESTE ARCHIVO: el 3 de agosto de 2026 se pidió auditar por qué
// los mensajes entrantes no aparecían y las campañas no mostraban entregas. La
// auditoría se topó con que NO SE PODÍA HACER: el webhook escribía todo con
// `console.warn` / `console.error`, y en Vercel esos registros son efímeros. No
// había forma de responder la pregunta más básica —«¿Meta nos mandó el evento?»—
// para un hecho de hace unas horas.
//
// La evidencia del propio panel mostraba que el webhook SÍ funcionó (una campaña
// del 18 de julio tenía 54 entregados y 39 leídos) y dejó de funcionar después.
// Sin rastro persistente, distinguir entre «Meta dejó de enviar», «llegó y lo
// descartamos» y «llegó, lo procesamos y falló» era imposible.
//
// REGLA: la fila se escribe ANTES de procesar. Si el procesamiento revienta, la
// evidencia ya está guardada. Escribirla al final habría perdido justamente los
// casos que interesan.
import crypto from 'crypto';
import db from './db.js';

let _ready = false;

const EXPECTED = ['CrmWebhookEvent', 'CrmOutboundLog'];

export async function ensureWebhookAuditSchema() {
  if (_ready) return;
  const r = await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [EXPECTED]
  );
  if (EXPECTED.every(t => r.rows.some(x => x.table_name === t))) { _ready = true; return; }

  await db.query(`
    -- Todo webhook que Meta nos manda, tal como llega.
    --
    -- El payload es el cuerpo COMPLETO sin recortar: cuando algo no cuadra, el
    -- campo que falta es siempre el que no guardamos. Con el volumen de este
    -- módulo (decenas de eventos por día) el costo es despreciable.
    CREATE TABLE IF NOT EXISTS "CrmWebhookEvent" (
      id TEXT PRIMARY KEY,
      "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "phoneNumberId" TEXT,
      "wabaId" TEXT,
      "clubId" TEXT,
      -- Qué traía: messages | statuses | template_status | otro
      kind TEXT,
      "eventCount" INTEGER NOT NULL DEFAULT 0,
      -- Resultado de la resolución del sitio. unknown_phone_number_id es el
      -- descarte que antes sólo dejaba un console.warn.
      resolution TEXT,
      -- Resultado del procesamiento: ok | partial | error | skipped
      outcome TEXT,
      "errorMessage" TEXT,
      "errorStack" TEXT,
      "durationMs" INTEGER,
      "signatureValid" BOOLEAN,
      payload JSONB,
      headers JSONB
    );
    CREATE INDEX IF NOT EXISTS "CrmWebhookEvent_time_idx" ON "CrmWebhookEvent"("receivedAt" DESC);
    CREATE INDEX IF NOT EXISTS "CrmWebhookEvent_club_idx" ON "CrmWebhookEvent"("clubId","receivedAt" DESC);
    CREATE INDEX IF NOT EXISTS "CrmWebhookEvent_problem_idx" ON "CrmWebhookEvent"(outcome,"receivedAt" DESC);

    -- Toda llamada SALIENTE a la Cloud API: qué mandamos, qué contestó Meta y
    -- cuánto tardó. Es la otra mitad de la pregunta «¿se envió de verdad?».
    CREATE TABLE IF NOT EXISTS "CrmOutboundLog" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      operation TEXT NOT NULL,
      "campaignId" TEXT,
      "journeyId" TEXT,
      "contactId" TEXT,
      phone TEXT,
      "templateName" TEXT,
      "userId" TEXT,
      endpoint TEXT,
      "requestBody" JSONB,
      "httpStatus" INTEGER,
      "responseBody" JSONB,
      "messageId" TEXT,
      "errorCode" TEXT,
      "errorMessage" TEXT,
      "durationMs" INTEGER,
      ok BOOLEAN NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS "CrmOutboundLog_time_idx" ON "CrmOutboundLog"("createdAt" DESC);
    CREATE INDEX IF NOT EXISTS "CrmOutboundLog_campaign_idx" ON "CrmOutboundLog"("campaignId");
    CREATE INDEX IF NOT EXISTS "CrmOutboundLog_fail_idx" ON "CrmOutboundLog"(ok,"createdAt" DESC);
  `);
  _ready = true;
}

/** Qué tipo de evento trae el webhook, para poder filtrar después. */
export function classifyWebhook(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const field = body?.entry?.[0]?.changes?.[0]?.field;
  if (value?.messages) return { kind: 'messages', count: value.messages.length };
  if (value?.statuses) return { kind: 'statuses', count: value.statuses.length };
  if (field) return { kind: field, count: 1 };
  return { kind: 'desconocido', count: 0 };
}

/**
 * Cabeceras que vale la pena guardar. NO se guardan todas: llevan cookies y el
 * `authorization` de otros intermediarios, y esto lo lee el panel.
 */
function safeHeaders(headers = {}) {
  const keep = ['x-hub-signature-256', 'x-hub-signature', 'user-agent', 'content-type', 'content-length'];
  const out = {};
  for (const k of keep) if (headers[k]) out[k] = headers[k];
  return out;
}

/**
 * Comprueba la firma de Meta (`X-Hub-Signature-256`) contra el App Secret.
 *
 * Devuelve `null` cuando no se puede comprobar —sin `META_APP_SECRET` o sin
 * cuerpo crudo—, que es DISTINTO de `false`. Decir «firma inválida» cuando en
 * realidad no se verificó mandaría a buscar un problema de seguridad
 * inexistente.
 */
export function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.META_APP_SECRET || process.env.WA_APP_SECRET;
  if (!secret || !rawBody || !signatureHeader) return null;
  try {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signatureHeader));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return null;
  }
}

/** Abre la fila del webhook. Devuelve su id para cerrarla después. */
export async function openWebhookEvent({ body, headers, signatureValid = null }) {
  try {
    await ensureWebhookAuditSchema();
    const { kind, count } = classifyWebhook(body);
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO "CrmWebhookEvent"
         (id,"phoneNumberId","wabaId",kind,"eventCount","signatureValid",payload,headers,outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'recibido')`,
      [
        id,
        value?.metadata?.phone_number_id || null,
        body?.entry?.[0]?.id || null,
        kind, count, signatureValid,
        JSON.stringify(body || {}),
        JSON.stringify(safeHeaders(headers)),
      ]
    );
    return id;
  } catch (err) {
    // La bitácora NUNCA puede tumbar el webhook: si no se puede escribir, se
    // sigue procesando y Meta recibe su 200.
    console.error('[WA-Audit] No se pudo abrir la fila del webhook:', err.message);
    return null;
  }
}

/** Cierra la fila con el resultado. */
export async function closeWebhookEvent(id, { clubId, resolution, outcome, error, durationMs }) {
  if (!id) return;
  try {
    await db.query(
      `UPDATE "CrmWebhookEvent"
       SET "clubId"=$1, resolution=$2, outcome=$3, "errorMessage"=$4, "errorStack"=$5, "durationMs"=$6
       WHERE id=$7`,
      [
        clubId || null, resolution || null, outcome || null,
        error ? String(error.message || error).slice(0, 1000) : null,
        error?.stack ? String(error.stack).slice(0, 4000) : null,
        Number.isFinite(durationMs) ? Math.round(durationMs) : null,
        id,
      ]
    );
  } catch (err) {
    console.error('[WA-Audit] No se pudo cerrar la fila del webhook:', err.message);
  }
}

/** Registra una llamada saliente a Meta. */
export async function logOutbound({
  clubId, operation, endpoint, requestBody, httpStatus, responseBody,
  messageId, errorCode, errorMessage, durationMs, ok,
  campaignId, journeyId, contactId, phone, templateName, userId,
}) {
  try {
    await ensureWebhookAuditSchema();
    await db.query(
      `INSERT INTO "CrmOutboundLog"
         (id,"clubId",operation,endpoint,"requestBody","httpStatus","responseBody","messageId",
          "errorCode","errorMessage","durationMs",ok,"campaignId","journeyId","contactId",phone,"templateName","userId")
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        crypto.randomUUID(), clubId || null, operation, endpoint || null,
        JSON.stringify(requestBody || {}), httpStatus || null,
        JSON.stringify(responseBody || {}), messageId || null,
        errorCode ? String(errorCode) : null,
        errorMessage ? String(errorMessage).slice(0, 1000) : null,
        Number.isFinite(durationMs) ? Math.round(durationMs) : null, !!ok,
        campaignId || null, journeyId || null, contactId || null,
        phone || null, templateName || null, userId || null,
      ]
    );
  } catch (err) {
    console.error('[WA-Audit] No se pudo registrar la salida:', err.message);
  }
}

// ── Consulta ────────────────────────────────────────────────────────────────
export async function recentWebhooks({ clubId = null, limit = 50, onlyProblems = false } = {}) {
  await ensureWebhookAuditSchema();
  const params = [];
  const where = [];
  if (clubId) { params.push(clubId); where.push(`("clubId"=$${params.length} OR "clubId" IS NULL)`); }
  if (onlyProblems) where.push(`outcome <> 'ok'`);
  params.push(limit);
  const r = await db.query(
    `SELECT id,"receivedAt","phoneNumberId","wabaId","clubId",kind,"eventCount",
            resolution,outcome,"errorMessage","durationMs","signatureValid"
     FROM "CrmWebhookEvent"
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY "receivedAt" DESC LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

export async function webhookEventDetail(id) {
  await ensureWebhookAuditSchema();
  const r = await db.query(`SELECT * FROM "CrmWebhookEvent" WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

export async function recentOutbound({ clubId = null, limit = 50, onlyFailures = false } = {}) {
  await ensureWebhookAuditSchema();
  const params = [];
  const where = [];
  if (clubId) { params.push(clubId); where.push(`"clubId"=$${params.length}`); }
  if (onlyFailures) where.push(`ok = false`);
  params.push(limit);
  const r = await db.query(
    `SELECT * FROM "CrmOutboundLog"
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY "createdAt" DESC LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * Resumen de las últimas 24 h, que es lo que mira el panel primero.
 *
 * Se acota por sitio. Los webhooks se filtran con `IS NULL` incluido a
 * propósito: el que no se pudo encaminar no tiene `clubId` y es justamente el
 * que hay que ver — descartarlo del resumen escondería la avería que el
 * resumen existe para mostrar.
 */
export async function auditSummary(clubId = null) {
  await ensureWebhookAuditSchema();
  const inFilter = clubId ? `AND ("clubId"=$1 OR "clubId" IS NULL)` : '';
  const outFilter = clubId ? `AND "clubId"=$1` : '';
  const p = clubId ? [clubId] : [];

  const [webhooks, outbound, lastIn, lastOut] = await Promise.all([
    db.query(
      `SELECT kind, outcome, COUNT(*)::int AS n
       FROM "CrmWebhookEvent" WHERE "receivedAt" > NOW() - INTERVAL '24 hours' ${inFilter}
       GROUP BY kind, outcome`, p
    ),
    db.query(
      `SELECT operation, ok, COUNT(*)::int AS n, AVG("durationMs")::int AS "avgMs"
       FROM "CrmOutboundLog" WHERE "createdAt" > NOW() - INTERVAL '24 hours' ${outFilter}
       GROUP BY operation, ok`, p
    ),
    db.query(
      `SELECT "receivedAt", kind, outcome, resolution FROM "CrmWebhookEvent"
       WHERE true ${inFilter} ORDER BY "receivedAt" DESC LIMIT 1`, p
    ),
    db.query(
      `SELECT "createdAt", operation, ok, "errorMessage" FROM "CrmOutboundLog"
       WHERE true ${outFilter} ORDER BY "createdAt" DESC LIMIT 1`, p
    ),
  ]);
  return {
    webhooks24h: webhooks.rows,
    outbound24h: outbound.rows,
    lastWebhook: lastIn.rows[0] || null,
    lastOutbound: lastOut.rows[0] || null,
  };
}

export default {
  ensureWebhookAuditSchema, classifyWebhook, verifySignature,
  openWebhookEvent, closeWebhookEvent, logOutbound,
  recentWebhooks, webhookEventDetail, recentOutbound, auditSummary,
};
