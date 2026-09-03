// API de la bandeja de conversaciones.
//
// TRES AUDIENCIAS, y el aislamiento vive en `scope`:
//
//   · OPERADOR de la plataforma (administrator/superadmin) — ve todo, configura
//     reglas de enrutamiento y administra agentes.
//   · AGENTE (`crm_agent`) — ve la bandeja para atenderla, pero no configura
//     nada. Puede tomar conversaciones sin asignar y trabajar las suyas.
//   · ADMINISTRADOR DE UN SITIO — sólo lo que su organización conversó.
//
// Al agregar un endpoint, pasar por `scope`. Consultar la tabla por fuera pierde
// el aislamiento en silencio.
import db from '../../lib/db.js';
import { resolvePlatformClubId } from '../../lib/crmTenant.js';
import { ensureAutomationSchema } from '../../lib/ensureAutomationSchema.js';
import {
  CONVERSATION_STATES, PRIORITIES, listConversations, getConversationDetail,
  inboxCounters, assignConversation, setConversationState, tagConversation,
  addNote, setPriority, escalateToSupport, setConversationIntent,
  listAgents, upsertAgent, removeAgent,
} from '../../lib/crmInbox.js';
import { INTENTS, EQUIPOS, MENU_INTENTS, buildMenuText } from '../../lib/crmIntents.js';
import { trainingSummary, listTrainingCategories, buildBookingLink, linkAppointmentToConversation } from '../../lib/crmTraining.js';
import { getAutomationSettings, saveAutomationSettings } from '../../lib/crmGuardrails.js';
import { sendWhatsAppTextMessage } from '../crmController.js';

const OPERATOR_ROLES = ['administrator', 'superadmin'];
const AGENT_ROLES = [...OPERATOR_ROLES, 'crm_agent'];

const isOperator = (req) => OPERATOR_ROLES.includes(req.user?.role);
const isAgent = (req) => AGENT_ROLES.includes(req.user?.role);

function denyUnlessOperator(req, res) {
  if (isOperator(req)) return false;
  res.status(403).json({ error: 'Sólo el superadministrador de la plataforma puede hacer esto.' });
  return true;
}

function denyUnlessAgent(req, res) {
  if (isAgent(req)) return false;
  res.status(403).json({ error: 'Necesitás permisos de agente para atender la bandeja.' });
  return true;
}

/** Qué sitios puede ver quien pregunta. `null` = todos. */
function scopeSites(req) {
  if (isAgent(req)) return null;
  return [req.user?.clubId, req.user?.districtId].filter(Boolean);
}

const tenant = async () => {
  const clubId = await resolvePlatformClubId();
  if (!clubId) {
    const err = new Error('No hay ninguna cuenta de WhatsApp Business configurada en la plataforma.');
    err.status = 409;
    throw err;
  }
  return clubId;
};

const fail = (res, err) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[CRM inbox]', err);
  res.status(status).json({ error: err.message });
};

const actor = (req) => ({ actorId: req.user?.id || null, actorName: req.user?.name || req.user?.email || null });

/**
 * Comprueba que la conversación esté dentro del alcance de quien pregunta.
 * Devuelve la fila o lanza. NO se resuelve "traer y comparar después": el
 * `WHERE` lleva el filtro.
 */
async function fetchInScope(req, clubId, conversationId) {
  const sites = scopeSites(req);
  const params = [clubId, conversationId];
  let extra = '';
  if (sites) {
    if (!sites.length) { const e = new Error('No encontrada'); e.status = 404; throw e; }
    params.push(sites);
    extra = ` AND "siteId" = ANY($3)`;
  }
  const r = await db.query(
    `SELECT * FROM "CrmConversation" WHERE "clubId"=$1 AND id=$2${extra}`, params
  );
  if (!r.rows.length) { const e = new Error('La conversación no existe'); e.status = 404; throw e; }
  return r.rows[0];
}

// ── Catálogo ────────────────────────────────────────────────────────────────
export const getInboxCatalog = async (req, res) => {
  try {
    await ensureAutomationSchema();
    const clubId = await resolvePlatformClubId();
    const [settings, categories, agents] = await Promise.all([
      getAutomationSettings(),
      listTrainingCategories().catch(() => []),
      clubId && isAgent(req) ? listAgents(clubId) : Promise.resolve([]),
    ]);
    res.json({
      states: CONVERSATION_STATES,
      priorities: PRIORITIES,
      intents: INTENTS.map(i => ({ key: i.key, label: i.label, team: i.team, menuLabel: i.menuLabel })),
      teams: EQUIPOS,
      agents,
      trainingCategories: categories,
      chatbot: { ...(settings.chatbot || {}), menuPreview: buildMenuText((settings.chatbot || {}).greeting) },
      menuIntents: MENU_INTENTS.map(i => i.menuLabel),
      canOperate: isOperator(req),
      canAttend: isAgent(req),
    });
  } catch (err) { fail(res, err); }
};

// ── Bandeja ─────────────────────────────────────────────────────────────────
export const getInbox = async (req, res) => {
  try {
    const clubId = await tenant();
    const sites = scopeSites(req);
    if (sites && !sites.length) return res.json({ conversations: [], counters: { states: CONVERSATION_STATES, unassigned: 0 } });

    const [conversations, counters] = await Promise.all([
      listConversations({
        clubId,
        state: req.query.state || null,
        team: req.query.team || null,
        assignedTo: req.query.assignedTo === 'me' ? req.user?.id : (req.query.assignedTo || null),
        unassigned: req.query.unassigned === 'true',
        intent: req.query.intent || null,
        siteIds: sites,
        limit: Math.min(Number(req.query.limit) || 100, 300),
      }),
      inboxCounters(clubId, { siteIds: sites }),
    ]);
    res.json({ conversations, counters, restricted: !!sites });
  } catch (err) { fail(res, err); }
};

export const getConversation = async (req, res) => {
  try {
    const clubId = await tenant();
    await fetchInScope(req, clubId, req.params.id);
    const detail = await getConversationDetail(clubId, req.params.id);
    if (!detail) return res.status(404).json({ error: 'La conversación no existe' });

    // El resumen de capacitaciones va en la ficha porque es la pregunta que más
    // se hace al atender: si ya tuvo su sesión, la conversación se lleva de otra
    // manera.
    const training = detail.siteId
      ? await trainingSummary(detail.siteId, { siteType: detail.siteType }).catch(() => null)
      : null;

    // Un administrador de sitio no ve las notas internas del equipo: están
    // escritas para nosotros y hablan de su organización.
    if (!isAgent(req)) {
      delete detail.notes;
      delete detail.events;
    }
    res.json({ ...detail, training });
  } catch (err) { fail(res, err); }
};

// ── Acciones del agente ─────────────────────────────────────────────────────
export const patchConversation = async (req, res) => {
  try {
    if (denyUnlessAgent(req, res)) return;
    const clubId = await tenant();
    await fetchInScope(req, clubId, req.params.id);
    const a = actor(req);
    let result = null;

    if (req.body.state !== undefined) result = await setConversationState(req.params.id, req.body.state, a);
    if (req.body.priority !== undefined) result = await setPriority(req.params.id, req.body.priority, a);
    if (req.body.assignedTo !== undefined) {
      result = await assignConversation(req.params.id, { userId: req.body.assignedTo || null, ...a });
    }
    if (req.body.addTags || req.body.removeTags) {
      result = await tagConversation(req.params.id, {
        add: req.body.addTags || [], remove: req.body.removeTags || [], ...a,
      });
    }
    if (req.body.intent !== undefined) {
      // Una intención puesta a mano gana sobre la detectada, y se marca como
      // `manual` para que la detección automática no la vuelva a pisar.
      result = await setConversationIntent(req.params.id, { key: req.body.intent, method: 'manual', force: true });
    }
    if (!result) return res.status(400).json({ error: 'No se indicó ningún cambio.' });
    res.json(result);
  } catch (err) { fail(res, err); }
};

/** Tomar una conversación sin asignar. Es el gesto más común de un agente. */
export const claimConversation = async (req, res) => {
  try {
    if (denyUnlessAgent(req, res)) return;
    const clubId = await tenant();
    await fetchInScope(req, clubId, req.params.id);
    // UPDATE condicional: si otro agente la tomó primero, este pierde y se le
    // dice. Sin la condición, dos personas creerían tenerla.
    const r = await db.query(
      `UPDATE "CrmConversation"
       SET "assignedTo"=$1,"assignedAt"=NOW(),
           state=CASE WHEN state='nuevo' THEN 'en_atencion' ELSE state END,"updatedAt"=NOW()
       WHERE id=$2 AND "assignedTo" IS NULL RETURNING *`,
      [req.user?.id, req.params.id]
    );
    if (!r.rows.length) {
      const current = await db.query(
        `SELECT u.name, u.email FROM "CrmConversation" c LEFT JOIN "User" u ON u.id=c."assignedTo" WHERE c.id=$1`,
        [req.params.id]
      );
      const who = current.rows[0]?.name || current.rows[0]?.email || 'otra persona';
      return res.status(409).json({ error: `La tomó ${who} antes que vos.` });
    }
    res.json(r.rows[0]);
  } catch (err) { fail(res, err); }
};

export const createNote = async (req, res) => {
  try {
    if (denyUnlessAgent(req, res)) return;
    const clubId = await tenant();
    await fetchInScope(req, clubId, req.params.id);
    const note = await addNote(req.params.id, {
      body: req.body?.body,
      authorId: req.user?.id, authorName: req.user?.name || req.user?.email,
    });
    res.status(201).json(note);
  } catch (err) {
    if (!err.status) err.status = 400;
    fail(res, err);
  }
};

export const escalate = async (req, res) => {
  try {
    if (denyUnlessAgent(req, res)) return;
    const clubId = await tenant();
    await fetchInScope(req, clubId, req.params.id);
    const out = await escalateToSupport(req.params.id, {
      title: req.body?.title, description: req.body?.description, ...actor(req),
    });
    res.json(out);
  } catch (err) {
    if (!err.status) err.status = 400;
    fail(res, err);
  }
};

/**
 * Responde por el chat.
 *
 * Reutiliza `sendWhatsAppTextMessage`, que es el mismo camino del chat que ya
 * existía: no hay una segunda forma de mandar un mensaje libre.
 *
 * OJO — la ventana de 24 horas de Meta: fuera de ella un mensaje de texto libre
 * se rechaza y hay que usar una plantilla. No se disimula ni se convierte en
 * plantilla por lo bajo: el error de Meta se propaga textual para que quien
 * atiende entienda por qué y elija una plantilla a propósito.
 */
export const replyConversation = async (req, res) => {
  try {
    if (denyUnlessAgent(req, res)) return;
    const clubId = await tenant();
    const conv = await fetchInScope(req, clubId, req.params.id);
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });

    const contact = (await db.query(
      `SELECT id, phone FROM "WhatsAppContact" WHERE id=$1`, [conv.contactId]
    )).rows[0];
    if (!contact) return res.status(404).json({ error: 'El contacto ya no existe.' });

    // ⚠️ SE RESPONDE POR LA LÍNEA DE LA CONVERSACIÓN (v4.992, multi-WABA).
    //
    // Es el segundo camino que podía contestar desde el número equivocado: hasta
    // v4.991 el emisor deducía la credencial del sitio, así que un hilo de la
    // Feria de Proyectos se respondía por el número del Distrito. La conexión
    // sale de la fila de la conversación —la escribió el router al abrirla—, no
    // de nada que mande el navegador: si viniera del cuerpo, quien conociera el
    // endpoint elegiría desde qué número escribe.
    //
    // Con `connectionId` vacío —conversaciones anteriores a multi-cuenta— el
    // emisor cae en la principal del sitio, que es el comportamiento de siempre.
    let connection = null;
    if (conv.connectionId) {
      const { getConnection } = await import('../../lib/whatsappConnectionStore.js');
      connection = await getConnection(conv.connectionId, { clubId }).catch(() => null);
      if (!connection) {
        // La línea se desconectó con el hilo abierto. No se responde por otra:
        // sería escribirle a esa persona desde un número que no reconoce.
        return res.status(409).json({
          error:
            'La línea de WhatsApp con la que se abrió esta conversación ya no está conectada, ' +
            'así que no se puede responder por ella. Volver a conectarla en Configuración → ' +
            'WhatsApp → Cuentas conectadas, o abrir un hilo nuevo desde la línea que corresponda.',
        });
      }
    }

    const sent = await sendWhatsAppTextMessage({ clubId, contact, text, connection });
    await db.query(
      `UPDATE "CrmConversation"
       SET "lastOutboundAt"=NOW(),
           state=CASE WHEN state IN ('nuevo','en_atencion') THEN 'pendiente_respuesta' ELSE state END,
           "assignedTo"=COALESCE("assignedTo",$1),"updatedAt"=NOW()
       WHERE id=$2`,
      [req.user?.id || null, req.params.id]
    );
    res.json({ ok: true, messageId: sent.messageId });
  } catch (err) {
    err.status = 400;
    fail(res, err);
  }
};

export const linkTraining = async (req, res) => {
  try {
    if (denyUnlessAgent(req, res)) return;
    const clubId = await tenant();
    await fetchInScope(req, clubId, req.params.id);
    const out = await linkAppointmentToConversation({
      conversationId: req.params.id,
      appointmentId: req.body?.appointmentId || null,
      actorId: req.user?.id || null,
    });
    res.json(out);
  } catch (err) { fail(res, err); }
};

export const getBookingLink = async (req, res) => {
  try {
    if (denyUnlessAgent(req, res)) return;
    const settings = await getAutomationSettings();
    const url = buildBookingLink(settings.links || {}, { categoryId: req.query.categoria || null });
    if (!url) {
      return res.status(409).json({
        error: 'No hay un enlace de capacitación configurado. Cargalo en Guardias de envío → Enlace para agendar.',
      });
    }
    res.json({ url });
  } catch (err) { fail(res, err); }
};

// ── Reglas de enrutamiento ──────────────────────────────────────────────────
export const getRoutingRules = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const r = await db.query(
      `SELECT * FROM "CrmRoutingRule" WHERE "clubId"=$1 ORDER BY priority ASC, "createdAt" ASC`, [clubId]
    );
    res.json(r.rows);
  } catch (err) { fail(res, err); }
};

export const upsertRoutingRule = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'La regla necesita un nombre.' });

    const values = [
      clubId, b.name, Number(b.priority) || 0, b.active !== false,
      (b.intents || []).filter(Boolean), (b.keywords || []).filter(Boolean),
      JSON.stringify(b.audience || {}), b.team || null, b.assignTo || null,
      b.assignMode === 'agent' ? 'agent' : 'team',
      PRIORITIES.includes(b.priorityLevel) ? b.priorityLevel : 'normal',
    ];

    if (req.params.id) {
      const r = await db.query(
        `UPDATE "CrmRoutingRule"
         SET name=$2,priority=$3,active=$4,intents=$5,keywords=$6,audience=$7::jsonb,
             team=$8,"assignTo"=$9,"assignMode"=$10,"priorityLevel"=$11,"updatedAt"=NOW()
         WHERE "clubId"=$1 AND id=$12 RETURNING *`,
        [...values, req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'La regla no existe' });
      return res.json(r.rows[0]);
    }

    const r = await db.query(
      `INSERT INTO "CrmRoutingRule"
         (id,"clubId",name,priority,active,intents,keywords,audience,team,"assignTo","assignMode","priorityLevel")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11) RETURNING *`,
      values
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { fail(res, err); }
};

export const deleteRoutingRule = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const r = await db.query(
      `DELETE FROM "CrmRoutingRule" WHERE "clubId"=$1 AND id=$2 RETURNING id`, [clubId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'La regla no existe' });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
};

// ── Agentes ─────────────────────────────────────────────────────────────────
export const getAgents = async (req, res) => {
  try {
    if (denyUnlessAgent(req, res)) return;
    const clubId = await tenant();
    res.json(await listAgents(clubId));
  } catch (err) { fail(res, err); }
};

export const putAgent = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    if (!req.body?.userId) return res.status(400).json({ error: 'Falta el usuario.' });
    res.json(await upsertAgent({ clubId, ...req.body }));
  } catch (err) { fail(res, err); }
};

export const deleteAgent = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    res.json(await removeAgent(clubId, req.params.userId));
  } catch (err) { fail(res, err); }
};

/** Usuarios candidatos a agente: los que pueden entrar al panel. */
export const getAssignableUsers = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const r = await db.query(
      `SELECT id, name, email, role FROM "User"
       WHERE role IN ('administrator','superadmin','crm_agent','editor','club_admin','district_admin')
       ORDER BY name ASC NULLS LAST LIMIT 200`
    );
    res.json(r.rows);
  } catch (err) { fail(res, err); }
};

// ── Chatbot ─────────────────────────────────────────────────────────────────
export const updateChatbotSettings = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const current = await getAutomationSettings({ fresh: true });
    const b = req.body || {};
    const chatbot = { ...(current.chatbot || {}) };
    if (b.enabled !== undefined) chatbot.enabled = !!b.enabled;
    if (b.greeting !== undefined) chatbot.greeting = String(b.greeting);
    if (Array.isArray(b.menuKeywords)) chatbot.menuKeywords = b.menuKeywords.map(String).filter(Boolean);
    if (b.useModelForIntent !== undefined) chatbot.useModelForIntent = !!b.useModelForIntent;
    if (b.modelSlug !== undefined) chatbot.modelSlug = String(b.modelSlug);
    const saved = await saveAutomationSettings({ chatbot });
    res.json({ ...saved.chatbot, menuPreview: buildMenuText(saved.chatbot?.greeting) });
  } catch (err) { fail(res, err); }
};

export default {
  getInboxCatalog, getInbox, getConversation, patchConversation, claimConversation,
  createNote, escalate, replyConversation, linkTraining, getBookingLink,
  getRoutingRules, upsertRoutingRule, deleteRoutingRule,
  getAgents, putAgent, deleteAgent, getAssignableUsers, updateChatbotSettings,
};
