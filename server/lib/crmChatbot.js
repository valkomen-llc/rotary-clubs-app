// Orquestación de un mensaje entrante: conversación, intención, enrutamiento y
// —si está encendido— respuesta del chatbot.
//
// SE MONTA DELANTE DE LO QUE YA HABÍA, SIN PISARLO. El sitio ya tenía dos
// respondedores en producción: las reglas de palabra clave
// (`WhatsAppAutoReplyRule`) y el agente de IA (`WhatsAppAgentConfig`), ambos en
// `whatsappAgent.js`. Cambiar lo que reciben los contactos no es un efecto
// secundario aceptable de agregar una bandeja.
//
// Por eso esto se divide en dos mitades con distinto riesgo:
//
//   · SEGUIMIENTO (siempre activo, invisible para el contacto) — abrir o
//     recuperar la conversación, detectar la intención, enrutarla a un equipo y
//     registrar la respuesta. Nada de esto le manda nada a nadie.
//   · RESPUESTA DEL BOT (apagada por defecto, `chatbot.enabled`) — el menú de
//     opciones y las respuestas por intención. Sólo cuando alguien la enciende
//     a propósito, y aun entonces cede el turno al agente de IA si no reconoce
//     la intención.
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { getAutomationSettings, suppressContact } from './crmGuardrails.js';
import { recordEvent } from './crmEventBus.js';
import {
  detectIntent, detectIntentDeterministic, buildMenuText, buildIntentReply, intentByKey,
} from './crmIntents.js';
import {
  openConversation, setConversationIntent, routeConversation,
} from './crmInbox.js';

export const DEFAULT_CHATBOT_SETTINGS = {
  enabled: false,
  greeting: '¿En qué podemos apoyarte?',
  // Volver a mostrar el menú en cada mensaje sería insoportable. Se muestra al
  // abrir la conversación y cuando la persona lo pide.
  menuKeywords: ['menu', 'menú', 'opciones', 'ayuda', 'hola'],
  useModelForIntent: true,
  modelSlug: 'gemini-2.5-flash',
};

/**
 * Procesa un mensaje entrante.
 *
 * NO envía nada: devuelve el texto que habría que mandar (o null) y deja que lo
 * haga quien la llama. Así el webhook conserva un único punto de envío y esta
 * función se puede probar sin interceptar la red.
 */
export async function handleInboundMessage({
  clubId, contactId, contact = null, messageText = '', at = new Date(),
}) {
  await ensureAutomationSchema();

  const settings = await getAutomationSettings();
  const bot = { ...DEFAULT_CHATBOT_SETTINGS, ...(settings.chatbot || {}) };

  const row = contact || (await db.query(
    `SELECT * FROM "WhatsAppContact" WHERE id=$1 LIMIT 1`, [contactId]
  )).rows[0];
  if (!row) return { handled: false, reason: 'contacto_inexistente' };

  // ── Conversación ────────────────────────────────────────────────────────
  const { conversation, created } = await openConversation({
    clubId, contactId: row.id,
    siteId: row.siteId || null, siteType: row.siteType || 'club',
    at,
  });
  if (!conversation) return { handled: false, reason: 'sin_conversacion' };

  // ── Intención ───────────────────────────────────────────────────────────
  // Determinista primero, siempre. El modelo sólo si está permitido y lo
  // anterior no resolvió: cuesta una llamada y hace el enrutamiento menos
  // explicable.
  let intent = detectIntentDeterministic(messageText);
  if (!intent && bot.useModelForIntent) {
    intent = await detectIntent(messageText, { useModel: true, modelSlug: bot.modelSlug });
  }
  if (!intent) intent = { key: 'otro', method: 'fallback', matched: null };

  await setConversationIntent(conversation.id, { key: intent.key, method: intent.method });

  // Una respuesta entrante es un hecho que los recorridos preguntan
  // (`condition.is = 'replied'`). Sin `dedupeKey`: una respuesta se repite y
  // cada una cuenta.
  await recordEvent({
    type: 'contact.replied',
    siteId: row.siteId || null, siteType: row.siteType || 'club', contactId: row.id,
    payload: { intent: intent.key, method: intent.method, conversationId: conversation.id },
    occurredAt: at,
  }).catch(() => {});

  // ── Baja ────────────────────────────────────────────────────────────────
  // Se atiende SIEMPRE, esté el bot encendido o no, y antes que ninguna otra
  // cosa. Que la respuesta automática esté apagada no puede significar que
  // ignoremos a quien pide no recibir más mensajes.
  if (intent.key === 'baja') {
    await suppressContact({
      clubId, phone: row.phone, reason: 'opt_out', source: 'whatsapp_inbound',
      note: `Pedido por mensaje: "${String(messageText).slice(0, 120)}"`,
    });
    await recordEvent({
      type: 'contact.opted_out',
      siteId: row.siteId || null, contactId: row.id,
      payload: { conversationId: conversation.id },
      dedupeKey: `contact.opted_out:${row.id}`,
      occurredAt: at,
    }).catch(() => {});
    await routeConversation({
      clubId, conversationId: conversation.id, contactId: row.id,
      intentKey: intent.key, messageText,
    });
    return {
      handled: true, conversation, intent, optedOut: true,
      reply: intentByKey('baja')?.reply || null,
    };
  }

  // ── Enrutamiento ────────────────────────────────────────────────────────
  const routing = await routeConversation({
    clubId, conversationId: conversation.id, contactId: row.id,
    intentKey: intent.key, messageText,
  });

  // ── Respuesta ───────────────────────────────────────────────────────────
  if (!bot.enabled) {
    // Seguimiento sí, respuesta no: el contacto recibe exactamente lo que
    // recibía antes de este módulo.
    return { handled: true, conversation, intent, routing, reply: null, botDisabled: true };
  }

  const asksForMenu = bot.menuKeywords.some(k =>
    String(messageText || '').toLowerCase().includes(String(k).toLowerCase()));

  if (created || asksForMenu || intent.key === 'otro') {
    // Al abrir la conversación, o cuando no se entendió, el menú es más útil
    // que una respuesta inventada. Con la intención en `otro` se ofrece el menú
    // UNA vez; si la persona insiste, la conversación ya está enrutada a un
    // equipo y la sigue una persona.
    if (intent.key === 'otro' && !created && !asksForMenu) {
      return { handled: true, conversation, intent, routing, reply: null, deferredToHuman: true };
    }
    return { handled: true, conversation, intent, routing, reply: buildMenuText(bot.greeting), menu: true };
  }

  const reply = buildIntentReply(intent.key, settings.links || {});
  if (!reply) {
    // La intención necesitaba un enlace que nadie configuró. Se prefiere no
    // contestar antes que mandar un texto con el hueco a la vista — misma regla
    // que las variables de plantilla del motor de recorridos.
    return { handled: true, conversation, intent, routing, reply: null, missingLink: true };
  }

  await db.query(
    `UPDATE "CrmConversation" SET "botHandled"=true,"lastOutboundAt"=NOW(),
       state=CASE WHEN state='nuevo' THEN 'pendiente_respuesta' ELSE state END,"updatedAt"=NOW()
     WHERE id=$1`,
    [conversation.id]
  ).catch(() => {});

  return { handled: true, conversation, intent, routing, reply };
}

export default { handleInboundMessage, DEFAULT_CHATBOT_SETTINGS };
