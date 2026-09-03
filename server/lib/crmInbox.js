// Bandeja de conversaciones del WhatsApp CRM.
//
// UNA CONVERSACIÓN NO GUARDA MENSAJES. Los mensajes ya viven en
// `WhatsAppMessageLog` desde antes de este módulo, y duplicarlos daría dos
// verdades sobre el mismo hilo. Esta capa administra el ESTADO de la atención:
// en qué punto está, quién la tiene, qué quería la persona y qué sitio hay
// detrás.
//
// UN HILO ABIERTO POR CONTACTO, por índice único parcial (`WHERE closedAt IS
// NULL`). Al cerrarse deja el lugar libre y el mensaje siguiente abre otro: así
// el historial queda separado por episodio en vez de ser un hilo eterno donde
// «resuelto» no significa nada.
import crypto from 'crypto';
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { EQUIPO_KEYS, isIntent } from './crmIntents.js';
import { buildAudienceSql } from './crmSegments.js';

// ── Estados ─────────────────────────────────────────────────────────────────
// Los del pedido. `nuevo` y `pendiente_respuesta` son los dos que la máquina
// mueve sola; el resto los mueve una persona.
export const CONVERSATION_STATES = [
  { key: 'nuevo',               label: 'Nuevo',                 open: true,  description: 'Entró y todavía no lo tomó nadie.' },
  { key: 'en_atencion',         label: 'En atención',           open: true,  description: 'Un agente lo tomó y está trabajando en él.' },
  { key: 'pendiente_respuesta', label: 'Pendiente de respuesta', open: true, description: 'Le contestamos y esperamos al contacto.' },
  { key: 'seguimiento',         label: 'Seguimiento',           open: true,  description: 'Necesita una acción futura.' },
  { key: 'resuelto',            label: 'Resuelto',              open: false, description: 'Se resolvió, pero el hilo sigue abierto por si vuelve.' },
  { key: 'cerrado',             label: 'Cerrado',               open: false, description: 'Se cerró. Un mensaje nuevo abre otra conversación.' },
];
export const STATE_KEYS = CONVERSATION_STATES.map(s => s.key);
const STATE_BY_KEY = Object.fromEntries(CONVERSATION_STATES.map(s => [s.key, s]));

export const isConversationState = (k) => Object.prototype.hasOwnProperty.call(STATE_BY_KEY, k);
export const conversationStateLabel = (k) => STATE_BY_KEY[k]?.label || k || '—';

export const PRIORITIES = ['baja', 'normal', 'alta', 'urgente'];

// ── Traza ───────────────────────────────────────────────────────────────────
async function trace(conversationId, type, { actorId = null, actorName = null, detail = {} } = {}) {
  await db.query(
    `INSERT INTO "CrmConversationEvent" (id,"conversationId",type,"actorId","actorName",detail)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [crypto.randomUUID(), conversationId, type, actorId, actorName, JSON.stringify(detail || {})]
  ).catch(() => {});
}

/**
 * Devuelve la conversación abierta del contacto, creándola si no hay.
 *
 * La llama el webhook por cada mensaje entrante, así que tiene que ser barata y
 * a prueba de concurrencia: dos mensajes seguidos del mismo contacto pueden
 * llegar en paralelo. El `ON CONFLICT` repite el predicado del índice parcial
 * porque, siendo parcial, sin eso la sentencia falla entera.
 */
export async function openConversation({
  clubId, contactId, siteId = null, siteType = 'club', at = new Date(),
  // ⚠️ LA LÍNEA POR LA QUE SE ABRE EL HILO (v4.992, multi-WABA).
  //
  // Hasta v4.991 el hilo abierto era uno por contacto y por SITIO, así que con
  // dos líneas del mismo sitio quien escribiera a las dos caía en el MISMO
  // hilo, con el agente de una leyendo el contexto de la otra. Ahora la Feria
  // de Proyectos y el Distrito tienen su propio hilo con la misma persona.
  //
  // Cadena VACÍA y no null cuando no se sabe: la columna es NOT NULL DEFAULT ''
  // porque en Postgres NULL nunca es igual a NULL y el índice único parcial no
  // restringiría las filas heredadas. Ver `ensureWhatsAppConnectionSchema.js`.
  connectionId = '',
}) {
  await ensureAutomationSchema();
  // El ALTER de `connectionId` y el índice nuevo los crea el otro ensure.
  const { ensureWhatsAppConnectionSchema } = await import('./ensureWhatsAppConnectionSchema.js');
  await ensureWhatsAppConnectionSchema();

  const conn = connectionId || '';

  const existing = await db.query(
    `SELECT * FROM "CrmConversation"
     WHERE "clubId"=$1 AND "contactId"=$2 AND "connectionId"=$3 AND "closedAt" IS NULL LIMIT 1`,
    [clubId, contactId, conn]
  );
  if (existing.rows.length) {
    const conv = existing.rows[0];
    // Una conversación marcada resuelta que recibe un mensaje nuevo vuelve a
    // estar viva: si no, el hilo se queda en «resuelto» con alguien esperando.
    const reopen = conv.state === 'resuelto';
    const r = await db.query(
      `UPDATE "CrmConversation"
       SET "lastInboundAt"=$1, state=CASE WHEN state='resuelto' THEN 'nuevo' ELSE state END, "updatedAt"=NOW()
       WHERE id=$2 RETURNING *`,
      [at, conv.id]
    );
    if (reopen) await trace(conv.id, 'reabierta', { detail: { from: 'resuelto' } });
    return { conversation: r.rows[0], created: false };
  }

  const id = crypto.randomUUID();
  const ins = await db.query(
    `INSERT INTO "CrmConversation" (id,"clubId","contactId","connectionId","siteId","siteType",state,"lastInboundAt","openedAt")
     VALUES ($1,$2,$3,$7,$4,$5,'nuevo',$6,$6)
     ON CONFLICT ("clubId","connectionId","contactId") WHERE "closedAt" IS NULL DO NOTHING
     RETURNING *`,
    [id, clubId, contactId, siteId, siteType, at, conn]
  );
  if (ins.rows.length) {
    await trace(id, 'abierta', { detail: { siteId, connectionId: conn || null } });
    return { conversation: ins.rows[0], created: true };
  }

  // Perdió la carrera contra otro mensaje: la fila que ganó es la buena.
  const retry = await db.query(
    `SELECT * FROM "CrmConversation"
     WHERE "clubId"=$1 AND "contactId"=$2 AND "connectionId"=$3 AND "closedAt" IS NULL LIMIT 1`,
    [clubId, contactId, conn]
  );
  return { conversation: retry.rows[0] || null, created: false };
}

/** Registra la intención detectada. No pisa una intención puesta a mano. */
export async function setConversationIntent(conversationId, { key, method, force = false }) {
  if (!isIntent(key)) return null;
  const r = await db.query(
    `UPDATE "CrmConversation"
     SET intent=$1,"intentMethod"=$2,"intentAt"=NOW(),"updatedAt"=NOW()
     WHERE id=$3 AND ($4 OR intent IS NULL OR "intentMethod" <> 'manual')
     RETURNING *`,
    [key, method || null, conversationId, force]
  );
  if (r.rows.length) await trace(conversationId, 'intencion', { detail: { key, method } });
  return r.rows[0] || null;
}

// ── Enrutamiento ────────────────────────────────────────────────────────────
async function contactMatchesAudience(clubId, contactId, audience) {
  if (!audience?.rules?.length) return true;
  const built = buildAudienceSql(audience, { startIndex: 3 });
  if (!built.where) return true;
  const r = await db.query(
    `SELECT 1 FROM "WhatsAppContact" c
     LEFT JOIN "CrmLifecycleState" ls ON ls."siteId" = c."siteId"
     WHERE c."clubId"=$1 AND c.id=$2 AND (${built.where}) LIMIT 1`,
    [clubId, contactId, ...built.params]
  );
  return r.rows.length > 0;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Elige el agente de un equipo con MENOS conversaciones abiertas.
 *
 * Reparto por carga y no por turnos rotativos: con turnos, un agente que estuvo
 * ausente vuelve y recibe lo mismo que quien atendió todo el día. `maxOpen`
 * permite que alguien declare su tope; en 0 significa sin tope.
 */
async function pickAgent(clubId, team) {
  const r = await db.query(
    `SELECT a."userId", a."displayName", a."maxOpen",
            (SELECT COUNT(*)::int FROM "CrmConversation" c
             WHERE c."assignedTo"=a."userId" AND c."closedAt" IS NULL
               AND c.state IN ('nuevo','en_atencion','pendiente_respuesta','seguimiento')) AS "openCount"
     FROM "CrmAgent" a
     WHERE a."clubId"=$1 AND a.available = true
       AND ($2::text IS NULL OR $2 = ANY(a.teams))
     ORDER BY "openCount" ASC`,
    [clubId, team || null]
  );
  const eligible = r.rows.filter(a => !a.maxOpen || a.openCount < a.maxOpen);
  return eligible[0] || null;
}

/**
 * Aplica las reglas de enrutamiento a una conversación.
 *
 * Gana la primera regla activa que coincide, por prioridad. Una regla sin
 * ninguna condición coincide siempre y sirve de respaldo — es la forma de
 * declarar «todo lo demás va a soporte» sin código.
 *
 * Si no hay agente disponible la conversación se enruta al EQUIPO igual y queda
 * sin asignar. Dejarla sin equipo porque nadie estaba libre la volvería
 * invisible en los filtros del panel, que es peor que verla sin dueño.
 */
export async function routeConversation({ clubId, conversationId, contactId, intentKey, messageText }) {
  await ensureAutomationSchema();

  const rules = await db.query(
    `SELECT * FROM "CrmRoutingRule" WHERE "clubId"=$1 AND active = true ORDER BY priority ASC, "createdAt" ASC`,
    [clubId]
  );

  const text = norm(messageText);
  let chosen = null;

  for (const rule of rules.rows) {
    if (rule.intents?.length && (!intentKey || !rule.intents.includes(intentKey))) continue;
    if (rule.keywords?.length && !rule.keywords.some(k => text.includes(norm(k)))) continue;
    if (rule.audience?.rules?.length && !(await contactMatchesAudience(clubId, contactId, rule.audience))) continue;
    chosen = rule;
    break;
  }

  let team = chosen?.team || null;
  let assignTo = null;
  let priority = chosen?.priorityLevel || 'normal';

  if (chosen?.assignMode === 'agent' && chosen.assignTo) {
    assignTo = chosen.assignTo;
  } else if (team) {
    const agent = await pickAgent(clubId, team);
    assignTo = agent?.userId || null;
  }

  if (!chosen && !team) return { routed: false };

  const r = await db.query(
    `UPDATE "CrmConversation"
     SET team=COALESCE($1,team),
         "assignedTo"=COALESCE($2,"assignedTo"),
         "assignedAt"=CASE WHEN $2 IS NOT NULL THEN NOW() ELSE "assignedAt" END,
         priority=$3,
         state=CASE WHEN state='nuevo' AND $2 IS NOT NULL THEN 'en_atencion' ELSE state END,
         "updatedAt"=NOW()
     WHERE id=$4 RETURNING *`,
    [team, assignTo, PRIORITIES.includes(priority) ? priority : 'normal', conversationId]
  );

  await trace(conversationId, 'enrutada', {
    detail: { rule: chosen?.name || null, team, assignTo, unassignedReason: team && !assignTo ? 'sin_agente_disponible' : null },
  });

  return { routed: true, team, assignTo, rule: chosen?.name || null, conversation: r.rows[0] };
}

// ── Operaciones del panel ───────────────────────────────────────────────────
export async function assignConversation(conversationId, { userId, actorId, actorName }) {
  const r = await db.query(
    `UPDATE "CrmConversation"
     SET "assignedTo"=$1,"assignedAt"=NOW(),"assignedBy"=$2,
         state=CASE WHEN state='nuevo' THEN 'en_atencion' ELSE state END,"updatedAt"=NOW()
     WHERE id=$3 RETURNING *`,
    [userId || null, actorId || null, conversationId]
  );
  await trace(conversationId, userId ? 'asignada' : 'desasignada', { actorId, actorName, detail: { userId } });
  return r.rows[0] || null;
}

export async function setConversationState(conversationId, state, { actorId, actorName } = {}) {
  if (!isConversationState(state)) throw new Error(`Estado desconocido: ${state}`);
  // `cerrado` es lo único que libera el índice único parcial y permite que un
  // mensaje nuevo abra otra conversación. `resuelto` NO cierra a propósito: deja
  // el hilo disponible por si la persona vuelve sobre lo mismo.
  const r = await db.query(
    `UPDATE "CrmConversation"
     SET state=$1,
         "resolvedAt"=CASE WHEN $1 IN ('resuelto','cerrado') THEN COALESCE("resolvedAt",NOW()) ELSE NULL END,
         "closedAt"=CASE WHEN $1='cerrado' THEN NOW() ELSE NULL END,
         "updatedAt"=NOW()
     WHERE id=$2 RETURNING *`,
    [state, conversationId]
  );
  await trace(conversationId, 'estado', { actorId, actorName, detail: { state } });
  return r.rows[0] || null;
}

export async function tagConversation(conversationId, { add = [], remove = [], actorId, actorName }) {
  const r = await db.query(
    `UPDATE "CrmConversation"
     SET tags = ARRAY(
           SELECT DISTINCT t FROM unnest(COALESCE(tags,ARRAY[]::text[]) || $1::text[]) AS t
           WHERE NOT (t = ANY($2::text[]))
         ), "updatedAt"=NOW()
     WHERE id=$3 RETURNING *`,
    [add.filter(Boolean), remove.filter(Boolean), conversationId]
  );
  await trace(conversationId, 'etiquetas', { actorId, actorName, detail: { add, remove } });
  return r.rows[0] || null;
}

export async function addNote(conversationId, { body, authorId, authorName }) {
  if (!body?.trim()) throw new Error('La nota no puede estar vacía');
  const r = await db.query(
    `INSERT INTO "CrmConversationNote" (id,"conversationId","authorId","authorName",body)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [crypto.randomUUID(), conversationId, authorId || null, authorName || null, body.trim()]
  );
  await trace(conversationId, 'nota', { actorId: authorId, actorName: authorName });
  return r.rows[0];
}

export async function setPriority(conversationId, priority, { actorId, actorName } = {}) {
  if (!PRIORITIES.includes(priority)) throw new Error(`Prioridad desconocida: ${priority}`);
  const r = await db.query(
    `UPDATE "CrmConversation" SET priority=$1,"updatedAt"=NOW() WHERE id=$2 RETURNING *`,
    [priority, conversationId]
  );
  await trace(conversationId, 'prioridad', { actorId, actorName, detail: { priority } });
  return r.rows[0] || null;
}

/**
 * Escala a soporte creando un `TechnicalRequest` real.
 *
 * Se crea la fila del módulo de soporte en vez de una "tarea" propia porque el
 * equipo ya trabaja ahí: una cola paralela dentro del CRM sería un segundo lugar
 * donde mirar, y las que se olvidan son siempre las del segundo lugar. El id
 * queda guardado en la conversación para poder volver.
 */
export async function escalateToSupport(conversationId, { title, description, actorId, actorName }) {
  const conv = (await db.query(`SELECT * FROM "CrmConversation" WHERE id=$1`, [conversationId])).rows[0];
  if (!conv) throw new Error('La conversación no existe');
  if (conv.technicalRequestId) return { alreadyEscalated: true, technicalRequestId: conv.technicalRequestId };
  // El módulo de soporte cuelga de un club real. Sin sitio vinculado no se puede
  // crear la solicitud, y decirlo es mejor que crearla colgando del Origen, que
  // la dejaría en la cola equivocada.
  if (!conv.siteId || conv.siteType !== 'club') {
    throw new Error('La conversación no está vinculada a un club, así que no se puede abrir una solicitud de soporte. Vinculá el contacto a su organización primero.');
  }

  const contact = (await db.query(`SELECT name, phone FROM "WhatsAppContact" WHERE id=$1`, [conv.contactId])).rows[0];
  const id = crypto.randomUUID();
  // `TechnicalRequest` no tiene columna de prioridad: la nuestra viaja en
  // `details`, que es el Json que el módulo ya usa para lo suyo. Inventarle una
  // columna a una tabla de Prisma sólo para esto sería peor.
  await db.query(
    `INSERT INTO "TechnicalRequest" (id,"clubId",type,subject,description,details,status,"createdAt","updatedAt")
     VALUES ($1,$2,'whatsapp_crm',$3,$4,$5::jsonb,'pending',NOW(),NOW())`,
    [
      id, conv.siteId,
      title || `Consulta por WhatsApp de ${contact?.name || conv.contactId}`,
      `${description || ''}\n\nOrigen: conversación de WhatsApp con ${contact?.name || ''} (${contact?.phone || ''}).`.trim(),
      JSON.stringify({ source: 'whatsapp_crm', conversationId, priority: conv.priority, phone: contact?.phone || null }),
    ]
  );
  await db.query(
    `UPDATE "CrmConversation" SET "technicalRequestId"=$1,"escalatedAt"=NOW(),state='seguimiento',"updatedAt"=NOW() WHERE id=$2`,
    [id, conversationId]
  );
  await trace(conversationId, 'escalada', { actorId, actorName, detail: { technicalRequestId: id } });
  return { technicalRequestId: id };
}

// ── Consulta ────────────────────────────────────────────────────────────────
/**
 * Lista la bandeja. `scope` decide qué se ve y es el ÚNICO punto donde se
 * aplica el aislamiento: por fuera de acá no se consulta la tabla.
 */
export async function listConversations({ clubId, state, team, assignedTo, intent, siteIds = null, unassigned = false, limit = 100 }) {
  await ensureAutomationSchema();
  const where = [`c."clubId" = $1`];
  const params = [clubId];
  let i = 2;

  if (state) { where.push(`c.state = $${i++}`); params.push(state); }
  else where.push(`c."closedAt" IS NULL`);
  if (team) { where.push(`c.team = $${i++}`); params.push(team); }
  if (assignedTo) { where.push(`c."assignedTo" = $${i++}`); params.push(assignedTo); }
  if (unassigned) where.push(`c."assignedTo" IS NULL`);
  if (intent) { where.push(`c.intent = $${i++}`); params.push(intent); }
  if (siteIds) { where.push(`c."siteId" = ANY($${i++})`); params.push(siteIds); }

  params.push(limit);
  const r = await db.query(
    `SELECT c.*,
            ct.name AS "contactName", ct.phone, ct."orgRole",
            COALESCE(cl.name, d.name) AS "siteName",
            ls.state AS "lifecycleState",
            u.name AS "assigneeName", u.email AS "assigneeEmail",
            (SELECT COUNT(*)::int FROM "CrmConversationNote" n WHERE n."conversationId"=c.id) AS "noteCount",
            (SELECT l."bodyText" FROM "WhatsAppMessageLog" l
             WHERE l."contactId"=c."contactId" ORDER BY l."createdAt" DESC LIMIT 1) AS "lastMessage"
     FROM "CrmConversation" c
     LEFT JOIN "WhatsAppContact" ct ON ct.id = c."contactId"
     LEFT JOIN "Club" cl ON cl.id = c."siteId"
     LEFT JOIN "District" d ON d.id = c."siteId"
     LEFT JOIN "CrmLifecycleState" ls ON ls."siteId" = c."siteId"
     LEFT JOIN "User" u ON u.id = c."assignedTo"
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE c.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       c."lastInboundAt" DESC NULLS LAST
     LIMIT $${i}`,
    params
  );
  return r.rows;
}

/** Ficha completa: la conversación, sus notas, su traza y las campañas que recibió. */
export async function getConversationDetail(clubId, conversationId) {
  await ensureAutomationSchema();
  const convR = await db.query(
    `SELECT c.*, ct.name AS "contactName", ct.phone, ct."orgRole", ct.tags AS "contactTags",
            ct."consentState", ct.language,
            COALESCE(cl.name, d.name) AS "siteName", ls.state AS "lifecycleState", ls.signals AS "siteSignals"
     FROM "CrmConversation" c
     LEFT JOIN "WhatsAppContact" ct ON ct.id = c."contactId"
     LEFT JOIN "Club" cl ON cl.id = c."siteId"
     LEFT JOIN "District" d ON d.id = c."siteId"
     LEFT JOIN "CrmLifecycleState" ls ON ls."siteId" = c."siteId"
     WHERE c."clubId"=$1 AND c.id=$2`,
    [clubId, conversationId]
  );
  if (!convR.rows.length) return null;
  const conv = convR.rows[0];

  const [notes, events, messages, campaigns] = await Promise.all([
    db.query(`SELECT * FROM "CrmConversationNote" WHERE "conversationId"=$1 ORDER BY "createdAt" ASC`, [conversationId]),
    db.query(`SELECT * FROM "CrmConversationEvent" WHERE "conversationId"=$1 ORDER BY "createdAt" ASC`, [conversationId]),
    db.query(
      `SELECT id, direction, "bodyText", status, "templateName", "createdAt", "readAt"
       FROM "WhatsAppMessageLog" WHERE "contactId"=$1 ORDER BY "createdAt" DESC LIMIT 100`,
      [conv.contactId]
    ),
    // El historial de campañas y recorridos que recibió: es lo que evita
    // preguntarle a alguien algo que ya se le explicó por mensaje automático.
    db.query(
      `SELECT l."templateName", l.status, l."createdAt",
              cp.name AS "campaignName", j.name AS "journeyName"
       FROM "WhatsAppMessageLog" l
       LEFT JOIN "WhatsAppCampaign" cp ON cp.id = l."campaignId"
       LEFT JOIN "CrmJourney" j ON j.id = l."journeyId"
       WHERE l."contactId"=$1 AND (l."campaignId" IS NOT NULL OR l."journeyId" IS NOT NULL)
       ORDER BY l."createdAt" DESC LIMIT 50`,
      [conv.contactId]
    ),
  ]);

  return {
    ...conv,
    notes: notes.rows,
    events: events.rows,
    messages: messages.rows,
    campaigns: campaigns.rows,
  };
}

export async function inboxCounters(clubId, { siteIds = null } = {}) {
  await ensureAutomationSchema();
  const params = [clubId];
  let extra = '';
  if (siteIds) { params.push(siteIds); extra = ` AND "siteId" = ANY($2)`; }
  const r = await db.query(
    `SELECT state, COUNT(*)::int AS n FROM "CrmConversation"
     WHERE "clubId"=$1 AND "closedAt" IS NULL${extra} GROUP BY state`,
    params
  );
  const unassigned = await db.query(
    `SELECT COUNT(*)::int AS n FROM "CrmConversation"
     WHERE "clubId"=$1 AND "closedAt" IS NULL AND "assignedTo" IS NULL${extra}`,
    params
  );
  return {
    states: CONVERSATION_STATES.map(s => ({ ...s, n: r.rows.find(x => x.state === s.key)?.n || 0 })),
    unassigned: unassigned.rows[0]?.n || 0,
  };
}

// ── Agentes ─────────────────────────────────────────────────────────────────
export async function listAgents(clubId) {
  await ensureAutomationSchema();
  const r = await db.query(
    `SELECT a.*, u.name, u.email, u.role,
            (SELECT COUNT(*)::int FROM "CrmConversation" c
             WHERE c."assignedTo"=a."userId" AND c."closedAt" IS NULL) AS "openCount"
     FROM "CrmAgent" a LEFT JOIN "User" u ON u.id = a."userId"
     WHERE a."clubId"=$1 ORDER BY u.name ASC NULLS LAST`,
    [clubId]
  );
  return r.rows;
}

export async function upsertAgent({ clubId, userId, displayName, teams = [], available = true, maxOpen = 0 }) {
  await ensureAutomationSchema();
  const clean = teams.filter(t => EQUIPO_KEYS.includes(t));
  const r = await db.query(
    `INSERT INTO "CrmAgent" (id,"clubId","userId","displayName",teams,available,"maxOpen")
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT ("clubId","userId") DO UPDATE
       SET "displayName"=EXCLUDED."displayName", teams=EXCLUDED.teams,
           available=EXCLUDED.available, "maxOpen"=EXCLUDED."maxOpen", "updatedAt"=NOW()
     RETURNING *`,
    [crypto.randomUUID(), clubId, userId, displayName || null, clean, !!available, Number(maxOpen) || 0]
  );
  return r.rows[0];
}

export async function removeAgent(clubId, userId) {
  // Las conversaciones que tenía quedan SIN asignar, no se borran ni se
  // reasignan solas: reasignarlas en silencio le pondría trabajo a alguien que
  // no se enteró.
  await db.query(
    `UPDATE "CrmConversation" SET "assignedTo"=NULL,"updatedAt"=NOW()
     WHERE "clubId"=$1 AND "assignedTo"=$2 AND "closedAt" IS NULL`,
    [clubId, userId]
  );
  await db.query(`DELETE FROM "CrmAgent" WHERE "clubId"=$1 AND "userId"=$2`, [clubId, userId]);
  return { ok: true };
}

export default {
  CONVERSATION_STATES, STATE_KEYS, PRIORITIES,
  openConversation, setConversationIntent, routeConversation,
  assignConversation, setConversationState, tagConversation, addNote, setPriority,
  escalateToSupport, listConversations, getConversationDetail, inboxCounters,
  listAgents, upsertAgent, removeAgent,
};
