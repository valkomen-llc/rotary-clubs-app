// ════════════════════════════════════════════════════════════════════
// La TRAZA de cada mensaje entrante de WhatsApp — la I/O (v4.1285).
//
// El criterio vive en `whatsappInbound.js` (puro). Acá se habla con Postgres.
//
// ⚠️ NINGUNA FUNCIÓN DE ESTE ARCHIVO PUEDE TUMBAR EL WEBHOOK. La traza es
// observabilidad: si su tabla no se puede crear, el mensaje se procesa igual
// que antes y la traza queda en `null`. Perder la traza es malo; perder el
// mensaje, o no contestarle a alguien, es peor.
//
// ⚠️ LA TABLA VA EN LA LISTA DEL GUARDIÁN DE `db:push`
// (`scripts/db-push-guard.mjs`) y en la de CLAUDE.md. Se crea en runtime, fuera
// de Prisma, como todo lo de este módulo desde el incidente del 2026-07-13.
// ════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import db from './db.js';
import { stageOrd, REASONS, maskPhone, previewText } from './whatsappInbound.js';

let _ready = false;
let _failed = false;

const EXPECTED_TABLES = ['WhatsAppInboundTrace'];

export async function ensureInboundTraceSchema() {
  if (_ready) return true;
  try {
    const r = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [EXPECTED_TABLES]
    );
    if (EXPECTED_TABLES.every((t) => r.rows.some((x) => x.table_name === t))) {
      _ready = true;
      return true;
    }
    await db.query(`
      -- Una fila por mensaje entrante: su recorrido completo, de Meta a Meta.
      --
      -- NO guarda el mensaje: ese vive en WhatsAppMessageLog y duplicarlo daría
      -- dos verdades. Guarda el ESTADO del procesamiento y lo necesario para
      -- retomarlo si la invocación muere a mitad de camino.
      CREATE TABLE IF NOT EXISTS "WhatsAppInboundTrace" (
        id TEXT PRIMARY KEY,
        -- El identificador de Meta (wamid). Es la clave de IDEMPOTENCIA: un
        -- reintento del webhook trae el mismo, y el índice único hace que sólo
        -- UNA entrega lo procese aunque lleguen dos a la vez.
        "messageId" TEXT NOT NULL,
        "clubId" TEXT,
        "connectionId" TEXT,
        "contactId" TEXT,
        "phoneNumberId" TEXT,
        "wabaId" TEXT,
        phone TEXT,
        "waId" TEXT,
        "contactName" TEXT,
        "messageType" TEXT,
        preview TEXT,
        -- El texto que se le pasa al agente. Hace falta para RETOMAR un
        -- procesamiento interrumpido sin volver a leer el payload.
        "messageText" TEXT,
        "probeCode" TEXT,
        -- valida | invalida | sin_comprobar
        signature TEXT,
        stage TEXT NOT NULL DEFAULT 'received',
        -- pending | replied | skipped | failed
        outcome TEXT NOT NULL DEFAULT 'pending',
        reason TEXT,
        "reasonDetail" TEXT,
        "agentSource" TEXT,
        "agentName" TEXT,
        "modelSlug" TEXT,
        action TEXT,
        "usedFallback" BOOLEAN NOT NULL DEFAULT false,
        "replyMessageId" TEXT,
        "replyStatus" TEXT,
        "replyStatusAt" TIMESTAMPTZ,
        "metaErrorCode" TEXT,
        "metaErrorMessage" TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        "aiMs" INTEGER,
        "sendMs" INTEGER,
        "totalMs" INTEGER,
        -- Cuándo pasó por cada etapa: { "received": "2026-11-05T…", … }.
        stamps JSONB NOT NULL DEFAULT '{}'::jsonb,
        "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "webhookEventId" TEXT,
        -- Seguimiento humano de lo que quedó sin respuesta.
        "reviewedAt" TIMESTAMPTZ,
        "reviewedBy" TEXT,
        "reviewNote" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_wa_inbound_trace_message"
        ON "WhatsAppInboundTrace" ("messageId");
      CREATE INDEX IF NOT EXISTS "idx_wa_inbound_trace_conn"
        ON "WhatsAppInboundTrace" ("connectionId", "receivedAt" DESC);
      CREATE INDEX IF NOT EXISTS "idx_wa_inbound_trace_reply"
        ON "WhatsAppInboundTrace" ("replyMessageId");
      CREATE INDEX IF NOT EXISTS "idx_wa_inbound_trace_probe"
        ON "WhatsAppInboundTrace" ("probeCode");
      CREATE INDEX IF NOT EXISTS "idx_wa_inbound_trace_pending"
        ON "WhatsAppInboundTrace" (outcome, "updatedAt");
    `);
    _ready = true;
    return true;
  } catch (err) {
    if (!_failed) console.error('[WA-Trace] No se pudo preparar WhatsAppInboundTrace:', err.message);
    _failed = true;
    return false;
  }
}

const stampJson = (stage, at = new Date()) => JSON.stringify({ [stage]: new Date(at).toISOString() });

/**
 * Reclama un mensaje para procesarlo. Es la IDEMPOTENCIA.
 *
 * Devuelve `{ trace, duplicate }`. `duplicate: true` = otra entrega del mismo
 * mensaje ya lo reclamó (reintento de Meta): NO se procesa ni se responde.
 * `trace: null, duplicate: false` = la tabla no está disponible: se procesa
 * igual, con la deduplicación de siempre por `WhatsAppMessageLog`.
 */
export async function claimInbound({
  messageId, wabaId = null, phoneNumberId = null, phone = null, waId = null,
  contactName = null, messageType = null, text = '', signature = 'sin_comprobar',
  webhookEventId = null, receivedAt = new Date(),
}) {
  if (!(await ensureInboundTraceSchema())) return { trace: null, duplicate: false };
  const id = crypto.randomUUID();
  const mid = messageId || `sin-id:${id}`;
  try {
    const r = await db.query(
      `INSERT INTO "WhatsAppInboundTrace"
         (id,"messageId","wabaId","phoneNumberId",phone,"waId","contactName","messageType",preview,"messageText",signature,stage,outcome,stamps,"receivedAt","webhookEventId","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'received','pending',$12::jsonb,$13,$14,NOW(),NOW())
       ON CONFLICT ("messageId") DO NOTHING
       RETURNING id`,
      [
        id, mid, wabaId, phoneNumberId, phone, waId, contactName, messageType,
        previewText(text), text, signature, stampJson('received', receivedAt),
        receivedAt, webhookEventId,
      ]
    );
    if (!r.rows.length) return { trace: null, duplicate: true };
    return {
      trace: { id, messageId: mid, stage: 'received', startedAt: Date.now() },
      duplicate: false,
    };
  } catch (err) {
    console.error('[WA-Trace] No se pudo reclamar el mensaje:', err.message);
    return { trace: null, duplicate: false };
  }
}

const COLUMNS = new Set([
  'clubId', 'connectionId', 'contactId', 'outcome', 'reason', 'reasonDetail',
  'agentSource', 'agentName', 'modelSlug', 'action', 'usedFallback',
  'replyMessageId', 'replyStatus', 'replyStatusAt', 'metaErrorCode',
  'metaErrorMessage', 'aiMs', 'sendMs', 'totalMs', 'probeCode', 'messageText',
  'contactName',
]);

/**
 * Avanza la traza. La etapa SÓLO avanza: un `stage` anterior al actual se
 * ignora (los estados de entrega pueden llegar desordenados).
 */
export async function updateTrace(trace, { stage = null, ...patch } = {}) {
  if (!trace?.id) return;
  const sets = [];
  const params = [trace.id];
  const push = (col, val) => { params.push(val); sets.push(`"${col}"=$${params.length}`); };
  for (const [k, v] of Object.entries(patch)) {
    if (!COLUMNS.has(k) || v === undefined) continue;
    push(k, typeof v === 'string' ? v.slice(0, 2000) : v);
  }
  if (stage && stageOrd(stage) > stageOrd(trace.stage)) {
    trace.stage = stage;
    push('stage', stage);
  }
  if (stage) {
    params.push(stampJson(stage));
    sets.push(`stamps = COALESCE(stamps, '{}'::jsonb) || $${params.length}::jsonb`);
  }
  if (!sets.length) return;
  await db.query(
    `UPDATE "WhatsAppInboundTrace" SET ${sets.join(',')},"updatedAt"=NOW() WHERE id=$1`,
    params
  ).catch((err) => console.error('[WA-Trace] No se pudo actualizar la traza:', err.message));
}

/** Cierra la traza con su desenlace y el tiempo total. */
export async function finishTrace(trace, { outcome, reason = null, detail = null, ...patch } = {}) {
  if (!trace?.id) return;
  const totalMs = trace.startedAt ? Date.now() - trace.startedAt : null;
  await updateTrace(trace, {
    ...patch, outcome, reason, reasonDetail: detail, totalMs,
  });
}

/**
 * Reclama un REINTENTO. Condicional sobre el número de intentos que se leyó:
 * si dos vueltas del cron toman la misma traza, sólo una gana y la otra la
 * suelta. Sin la condición, las dos responderían al mismo mensaje.
 */
export async function claimRetry(trace, attemptsSeen) {
  if (!trace?.id) return false;
  const r = await db.query(
    `UPDATE "WhatsAppInboundTrace" SET "attempts"="attempts"+1,"updatedAt"=NOW()
     WHERE id=$1 AND "attempts"=$2 AND outcome='pending' RETURNING id`,
    [trace.id, Number(attemptsSeen) || 0]
  ).catch(() => ({ rows: [] }));
  return r.rows.length > 0;
}

/**
 * Un estado de entrega de Meta que corresponde a una RESPUESTA automática.
 *
 * Es la etapa que cierra el recorrido: «Meta aceptó» (200 al enviar) no es
 * «el usuario lo recibió». Fuera de la ventana de 24 h, Meta acepta y no
 * entrega; sólo este evento lo dice.
 */
export async function recordReplyStatus({ messageId, status, at = new Date(), errorCode = null, errorMessage = null }) {
  if (!messageId || !_ready) {
    if (!messageId || !(await ensureInboundTraceSchema())) return null;
  }
  try {
    const r = await db.query(
      `SELECT id, stage FROM "WhatsAppInboundTrace" WHERE "replyMessageId"=$1 LIMIT 1`,
      [messageId]
    );
    const row = r.rows[0];
    if (!row) return null;
    const trace = { id: row.id, stage: row.stage };
    const stage = status === 'delivered' ? 'delivered' : status === 'read' ? 'read' : null;
    await updateTrace(trace, {
      stage,
      replyStatus: status,
      replyStatusAt: new Date(at),
      ...(status === 'failed'
        ? { metaErrorCode: errorCode != null ? String(errorCode) : null, metaErrorMessage: errorMessage, outcome: 'failed', reason: 'meta_rechazo', reasonDetail: `Meta aceptó la respuesta y después informó que falló: ${errorMessage || 'sin detalle'}${errorCode ? ` (código ${errorCode})` : ''}.` }
        : {}),
    });
    return row.id;
  } catch (err) {
    console.error('[WA-Trace] No se pudo registrar el estado de la respuesta:', err.message);
    return null;
  }
}

// ── Lecturas para el panel ──────────────────────────────────────────────────

const shapeTrace = (r) => {
  const reason = r.reason ? { code: r.reason, ...(REASONS[r.reason] || {}) } : null;
  return {
    id: r.id,
    messageId: r.messageId,
    receivedAt: r.receivedAt,
    connectionId: r.connectionId,
    contactId: r.contactId,
    contactName: r.contactName || null,
    // El teléfono enmascarado: el panel de diagnóstico no necesita el número
    // entero para reconocer una conversación, y el chat sí lo tiene.
    phone: maskPhone(r.phone || r.waId),
    messageType: r.messageType,
    preview: r.preview,
    probeCode: r.probeCode || null,
    signature: r.signature,
    stage: r.stage,
    outcome: r.outcome,
    reason,
    reasonDetail: r.reasonDetail || null,
    agentSource: r.agentSource, agentName: r.agentName, modelSlug: r.modelSlug,
    action: r.action, usedFallback: !!r.usedFallback,
    replyStatus: r.replyStatus, replyStatusAt: r.replyStatusAt,
    metaErrorCode: r.metaErrorCode, metaErrorMessage: r.metaErrorMessage,
    attempts: r.attempts, aiMs: r.aiMs, sendMs: r.sendMs, totalMs: r.totalMs,
    stamps: r.stamps || {},
    reviewedAt: r.reviewedAt, reviewNote: r.reviewNote || null,
  };
};

export async function listTraces({ connectionId, probeCode = null, limit = 30, onlyProblems = false } = {}) {
  if (!(await ensureInboundTraceSchema())) return [];
  const params = [connectionId];
  let where = `"connectionId"=$1`;
  if (probeCode) { params.push(probeCode); where += ` AND "probeCode"=$${params.length}`; }
  if (onlyProblems) where += ` AND outcome IN ('failed','pending')`;
  params.push(Math.min(Math.max(Number(limit) || 30, 1), 200));
  const r = await db.query(
    `SELECT * FROM "WhatsAppInboundTrace" WHERE ${where} ORDER BY "receivedAt" DESC LIMIT $${params.length}`,
    params
  ).catch(() => ({ rows: [] }));
  return r.rows.map(shapeTrace);
}

/** Una prueba real: la traza que trae ese código, venga de la línea que venga. */
export async function findProbe(probeCode) {
  if (!probeCode || !(await ensureInboundTraceSchema())) return null;
  const r = await db.query(
    `SELECT * FROM "WhatsAppInboundTrace" WHERE "probeCode"=$1 ORDER BY "receivedAt" DESC LIMIT 1`,
    [probeCode]
  ).catch(() => ({ rows: [] }));
  return r.rows[0] ? shapeTrace(r.rows[0]) : null;
}

/**
 * Conversaciones que se pueden DEMOSTRAR sin respuesta.
 *
 * Dos fuentes, y se dice cuál es cada una:
 *   · `traza` — desde v4.1285: el motivo exacto.
 *   · `registro` — antes de v4.1285 no había traza. Se toma de
 *     WhatsAppMessageLog: un entrante de la línea al que no le siguió NINGÚN
 *     saliente al mismo contacto. No se sabe por qué; se dice que no se sabe.
 *
 * ⚠️ LO QUE META NUNCA NOS ENTREGÓ NO ESTÁ ACÁ, y no se inventa. Si el webhook
 * apuntaba a otra aplicación, esos mensajes no existen en nuestra base y no se
 * pueden recuperar desde la plataforma: se ven en el teléfono o en WhatsApp
 * Business de esa línea.
 */
export async function unansweredReport({ connectionId, clubId, days = 30, limit = 200 } = {}) {
  await ensureInboundTraceSchema();
  const since = new Date(Date.now() - Math.min(Math.max(Number(days) || 30, 1), 180) * 24 * 3600 * 1000);
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const traced = await db.query(
    `SELECT * FROM "WhatsAppInboundTrace"
     WHERE "connectionId"=$1 AND "receivedAt" >= $2
       AND (outcome IN ('failed','skipped')
            OR (outcome='pending' AND "updatedAt" < NOW() - INTERVAL '5 minutes'))
     ORDER BY "receivedAt" DESC LIMIT $3`,
    [connectionId, since, cap]
  ).catch(() => ({ rows: [] }));

  // Lo anterior a la traza: entrantes de ESTA línea sin un saliente posterior
  // al mismo contacto por la misma línea (o sin línea conocida). Se excluyen
  // los que ya tienen traza para no contarlos dos veces.
  const legacy = await db.query(
    `SELECT l.id, l."contactId", l.phone, l."bodyText", l."messageId", l."createdAt", c.name AS "contactName"
     FROM "WhatsAppMessageLog" l
     LEFT JOIN "WhatsAppContact" c ON c.id = l."contactId"
     WHERE l."clubId"=$1 AND l."connectionId"=$2 AND l.direction='incoming' AND l."createdAt" >= $3
       AND NOT EXISTS (
         SELECT 1 FROM "WhatsAppMessageLog" o
         WHERE o."contactId" = l."contactId" AND o.direction='outgoing'
           AND o."createdAt" >= l."createdAt"
           AND (o."connectionId" = l."connectionId" OR o."connectionId" IS NULL)
       )
       AND NOT EXISTS (SELECT 1 FROM "WhatsAppInboundTrace" t WHERE t."messageId" = l."messageId")
     ORDER BY l."createdAt" DESC LIMIT $4`,
    [clubId, connectionId, since, cap]
  ).catch(() => ({ rows: [] }));

  const items = [
    ...traced.rows.map((r) => {
      const t = shapeTrace(r);
      return {
        source: 'traza',
        id: t.id,
        contactId: t.contactId,
        contactName: t.contactName,
        phone: t.phone,
        at: t.receivedAt,
        preview: t.preview,
        stage: t.stage,
        outcome: t.outcome,
        reason: t.reason,
        reasonDetail: t.reasonDetail,
        replied: false,
        metaAccepted: !!t.stamps?.meta_accepted,
        metaError: t.metaErrorCode ? `${t.metaErrorMessage || ''} (código ${t.metaErrorCode})` : null,
        agentName: t.agentName,
        reviewedAt: t.reviewedAt,
        reviewNote: t.reviewNote,
      };
    }),
    ...legacy.rows.map((r) => ({
      source: 'registro',
      id: `log:${r.id}`,
      contactId: r.contactId,
      contactName: r.contactName || null,
      phone: maskPhone(r.phone),
      at: r.createdAt,
      preview: previewText(r.bodyText),
      stage: 'stored',
      outcome: 'sin_traza',
      reason: null,
      reasonDetail: 'Anterior a la traza por mensaje (v4.1285): el mensaje llegó y quedó guardado, y no hay ningún mensaje saliente posterior a ese contacto por esta línea. El motivo no quedó registrado.',
      replied: false,
      metaAccepted: false,
      metaError: null,
      agentName: null,
      reviewedAt: null,
      reviewNote: null,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const human = items.filter((i) => i.reason?.human).length;
  return {
    since,
    total: items.length,
    byCause: {
      averia: items.filter((i) => i.source === 'traza' && !i.reason?.human).length,
      regla: human,
      sinTraza: items.filter((i) => i.source === 'registro').length,
      pendientesDeRevision: items.filter((i) => !i.reviewedAt && !i.reason?.human).length,
    },
    items,
    note: 'Sólo se listan mensajes que llegaron a la plataforma. Si Meta entregaba los eventos de esta línea a otra aplicación, esos mensajes no están en nuestra base y no se pueden recuperar desde aquí.',
  };
}

export async function markReviewed(traceId, { userId = null, note = null, connectionId } = {}) {
  if (!(await ensureInboundTraceSchema())) return null;
  const r = await db.query(
    `UPDATE "WhatsAppInboundTrace" SET "reviewedAt"=NOW(),"reviewedBy"=$3,"reviewNote"=$4,"updatedAt"=NOW()
     WHERE id=$1 AND "connectionId"=$2 RETURNING id`,
    [traceId, connectionId, userId, note ? String(note).slice(0, 500) : null]
  ).catch(() => ({ rows: [] }));
  return r.rows[0] || null;
}

/**
 * Los hechos de salud de una línea para `evaluateLineHealth`. Sólo lectura.
 */
export async function healthFacts(connection) {
  await ensureInboundTraceSchema();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const q = (sql, params) => db.query(sql, params).then((r) => r.rows).catch(() => []);

  const [agg, lastReply, lastAi, lastSend, hook, unrouted, outbound] = await Promise.all([
    q(`SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE outcome='replied')::int AS replied,
              COUNT(*) FILTER (WHERE outcome='failed')::int AS failed,
              COUNT(*) FILTER (WHERE outcome='skipped' AND reason IN ('pausa_humana','contacto_silenciado','baja_solicitada','no_es_texto','respondido_por_chatbot'))::int AS "skippedHuman",
              COUNT(*) FILTER (WHERE outcome='skipped' AND reason NOT IN ('pausa_humana','contacto_silenciado','baja_solicitada','no_es_texto','respondido_por_chatbot'))::int AS "skippedFault",
              COUNT(*) FILTER (WHERE outcome='pending' AND "updatedAt" < NOW() - INTERVAL '5 minutes')::int AS "pendingStale",
              COUNT(*) FILTER (WHERE "aiMs" IS NOT NULL)::int AS generated,
              MAX("receivedAt") FILTER (WHERE stage NOT IN ('received','validated','line_identified','stored')) AS "lastRunAt",
              AVG("totalMs") FILTER (WHERE outcome='replied')::int AS "avgReplyMs"
       FROM "WhatsAppInboundTrace" WHERE "connectionId"=$1 AND "receivedAt" >= $2`, [connection.id, since]),
    q(`SELECT "receivedAt","replyStatus" FROM "WhatsAppInboundTrace" WHERE "connectionId"=$1 AND outcome='replied' ORDER BY "receivedAt" DESC LIMIT 1`, [connection.id]),
    q(`SELECT "reasonDetail","updatedAt" FROM "WhatsAppInboundTrace" WHERE "connectionId"=$1 AND reason='ia_sin_respuesta' OR ("connectionId"=$1 AND "usedFallback"=true) ORDER BY "updatedAt" DESC LIMIT 1`, [connection.id]),
    q(`SELECT "reasonDetail","metaErrorCode","metaErrorMessage","updatedAt" FROM "WhatsAppInboundTrace" WHERE "connectionId"=$1 AND reason IN ('meta_rechazo','meta_sin_respuesta','linea_no_puede_enviar','resultado_desconocido') ORDER BY "updatedAt" DESC LIMIT 1`, [connection.id]),
    q(`SELECT MAX("receivedAt") AS at FROM "CrmWebhookEvent" WHERE "phoneNumberId"=$1`, [connection.phoneNumberId]),
    q(`SELECT COUNT(*)::int AS n FROM "CrmWebhookEvent" WHERE "phoneNumberId"=$1 AND "clubId" IS NULL AND "receivedAt" >= $2`, [connection.phoneNumberId, since]),
    q(`SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE "deliveredAt" IS NOT NULL OR "readAt" IS NOT NULL OR status IN ('delivered','read') OR (status='failed' AND "errorCode" IS NOT NULL))::int AS back
       FROM "WhatsAppMessageLog" WHERE "connectionId"=$1 AND direction='outgoing' AND "messageId" IS NOT NULL AND "createdAt" >= $2`, [connection.id, since]),
  ]);

  const a = agg[0] || {};
  return {
    lastWebhookAt: hook[0]?.at || null,
    unroutedForNumber: unrouted[0]?.n || 0,
    outbound7d: outbound[0]?.total || 0,
    statusesBack7d: outbound[0]?.back || 0,
    traces: {
      total: a.total || 0,
      replied: a.replied || 0,
      failed: (a.failed || 0) + (a.skippedFault || 0),
      skippedHuman: a.skippedHuman || 0,
      pendingStale: a.pendingStale || 0,
      generated: a.generated || 0,
      lastRunAt: a.lastRunAt || null,
      avgReplyMs: a.avgReplyMs || null,
      lastReplyAt: lastReply[0]?.receivedAt || null,
      lastReplyStatus: lastReply[0]?.replyStatus || null,
      lastAiError: lastAi[0]?.reasonDetail || null,
      lastAiErrorAt: lastAi[0]?.updatedAt || null,
      lastSendError: lastSend[0] ? (lastSend[0].metaErrorMessage ? `${lastSend[0].metaErrorMessage}${lastSend[0].metaErrorCode ? ` (código ${lastSend[0].metaErrorCode})` : ''}` : lastSend[0].reasonDetail) : null,
      lastSendErrorAt: lastSend[0]?.updatedAt || null,
    },
  };
}

/**
 * Trazas que quedaron a medias: la invocación murió (tiempo agotado,
 * reinicio) antes de responder. Las retoma el cron.
 *
 * Ventana acotada a propósito: más allá de 30 minutos, contestar a un «Hola»
 * es peor que dejarlo para una persona, y cerca de las 24 h la ventana de
 * servicio de Meta ya ni lo permite.
 */
export async function stuckTraces({ olderThanMin = 3, newerThanMin = 30, maxAttempts = 3, limit = 10 } = {}) {
  if (!(await ensureInboundTraceSchema())) return [];
  const r = await db.query(
    `SELECT * FROM "WhatsAppInboundTrace"
     WHERE outcome='pending' AND attempts < $1
       AND "updatedAt" < NOW() - ($2::int * INTERVAL '1 minute')
       AND "receivedAt" > NOW() - ($3::int * INTERVAL '1 minute')
     ORDER BY "receivedAt" ASC LIMIT $4`,
    [maxAttempts, olderThanMin, newerThanMin, limit]
  ).catch(() => ({ rows: [] }));
  return r.rows;
}

export default {
  ensureInboundTraceSchema, claimInbound, updateTrace, finishTrace, claimRetry,
  recordReplyStatus, listTraces, findProbe, unansweredReport, markReviewed,
  healthFacts, stuckTraces,
};
