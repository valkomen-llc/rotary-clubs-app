// ════════════════════════════════════════════════════════════════════
// Procesa UN mensaje entrante ya guardado: bandeja → agente → Meta (v4.1285).
//
// Antes vivía dentro de `handleWebhook`. Se separó por dos motivos:
//
//   1. La TRAZA. Cada paso avisa su etapa y todo camino termina en un
//      desenlace explícito con su motivo. Antes, siete caminos distintos
//      terminaban en «no respondió» sin dejar rastro.
//   2. El REINTENTO. Si la invocación muere a mitad (tiempo agotado, reinicio),
//      el cron retoma la traza y llama a esta misma función con lo que quedó
//      guardado. Un solo camino: el reintento no puede comportarse distinto
//      del webhook.
//
// Nunca lanza: devuelve el desenlace.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import { updateTrace, finishTrace } from '../lib/whatsappInboundStore.js';
import { extractProbe } from '../lib/whatsappInbound.js';

/** Los tipos que el agente sabe leer: texto y las respuestas a botones. */
const AGENT_TYPES = new Set(['text', 'button', 'interactive']);

export async function processInbound({
  trace = null,
  clubId, contactId, connection = null,
  phone, contactName = null,
  bodyText = '', msgType = 'text', timestamp = new Date(),
  signature = 'sin_comprobar',
  // Sólo el reintento lo pone en `true`: la bandeja ya corrió la primera vez
  // (abrió el hilo y clasificó la intención) y repetirla duplicaría eventos.
  skipInbox = false,
}) {
  const stage = (k, patch = {}) => updateTrace(trace, { stage: k, ...patch });
  const finish = async (outcome, reason = null, detail = null, patch = {}) => {
    await finishTrace(trace, { outcome, reason, detail, ...patch });
    return { outcome, reason, detail, ...patch };
  };

  try {
    // ── La firma ───────────────────────────────────────────────────────
    //
    // Se REGISTRA siempre y sólo BLOQUEA con WA_ENFORCE_SIGNATURE=true. Es
    // deliberado: con varias WABAs, una cuenta suscrita a OTRA aplicación de
    // Meta (con override de callback) firma con el secreto de esa aplicación y
    // la firma no coincide con META_APP_SECRET aunque el evento sea legítimo.
    // Bloquear por defecto volvería a dejar muda justo a la línea que este
    // cambio intenta arreglar. Cuando todas las líneas entreguen por la App de
    // la plataforma, encender la variable.
    if (signature === 'invalida' && String(process.env.WA_ENFORCE_SIGNATURE || '').toLowerCase() === 'true') {
      return finish('skipped', 'firma_invalida', 'La firma X-Hub-Signature-256 no coincide con META_APP_SECRET y WA_ENFORCE_SIGNATURE está activo.');
    }

    // ── La prueba real de punta a punta ───────────────────────────────
    const probe = extractProbe(bodyText);
    const agentText = probe.code ? probe.text : bodyText;
    if (probe.code) await updateTrace(trace, { probeCode: probe.code });

    // ── Bandeja, intención y enrutamiento (v4.696) ──────────────────────
    //
    // Corre ANTES del agente y, por defecto, NO manda nada: abre la
    // conversación, clasifica y enruta. La única excepción es la BAJA, que se
    // atiende siempre. Con `chatbot.enabled`, una intención reconocida se
    // contesta acá y el agente se saltea para no mandar dos mensajes.
    // ⚠️ El menú del chatbot es de la PLATAFORMA (un único ajuste global) y
    // trae sus intenciones —renovación, soporte—. Una línea con agente PROPIO
    // —la Feria de Proyectos— no puede contestar con ese menú a su «Hola»: la
    // persona recibiría las opciones de otra organización en vez de su
    // asistente. Para esas líneas la bandeja sólo clasifica, enruta y atiende
    // la BAJA; contesta su agente (v4.1285).
    let lineHasOwnAgent = false;
    if (connection) {
      try {
        const { resolveAgentForConnection } = await import('../lib/whatsappConnectionStore.js');
        const r = await resolveAgentForConnection(connection);
        lineHasOwnAgent = r?.source === 'connection';
      } catch (_) { /* sin dato, se comporta como siempre */ }
    }

    if (!skipInbox) {
      try {
        const { handleInboundMessage } = await import('../lib/crmChatbot.js');
        const out = await handleInboundMessage({
          clubId, contactId, messageText: agentText, at: timestamp,
          // La conversación se abre POR LÍNEA: sin esto, quien escriba al
          // Distrito y a la Feria caería en el mismo hilo.
          connectionId: connection?.id || '',
        });
        if (out?.optedOut) {
          if (out.reply) await sendChatbotReply({ clubId, contactId, text: out.reply, connection, stage });
          return finish('skipped', 'baja_solicitada', 'La persona pidió no recibir más mensajes; se registró la baja.');
        }
        if (out?.reply && !lineHasOwnAgent) {
          const r = await sendChatbotReply({ clubId, contactId, text: out.reply, connection, stage });
          if (r.ok) {
            await stage('meta_accepted', { replyMessageId: r.messageId });
            return finish('replied', 'respondido_por_chatbot', 'Respondió el menú del chatbot de la plataforma.', { action: 'chatbot', replyMessageId: r.messageId });
          }
          // Si el menú no pudo salir, se sigue con el agente: mejor una
          // respuesta del agente que ninguna.
        }
      } catch (botErr) {
        // La bandeja no puede tumbar el procesamiento: el mensaje ya quedó
        // guardado y el agente sigue funcionando como siempre.
        console.error('[WA-Inbox] Error en la bandeja:', botErr.message);
      }
    }

    // ── El agente ─────────────────────────────────────────────────────
    if (!AGENT_TYPES.has(msgType) || !String(agentText || '').trim()) {
      return finish('skipped', 'no_es_texto', `Mensaje de tipo «${msgType}»: queda en la bandeja para una persona.`);
    }

    const { runWhatsAppAutomation } = await import('./whatsappAgent.js');
    console.log(`[WA-Auto] Procesando entrante club=${clubId} línea=${connection?.id || '—'} traza=${trace?.id || '—'}`);
    const result = await runWhatsAppAutomation({
      clubId, contactId, phone, contactName,
      messageText: agentText,
      connection,
      onStage: (k, patch) => stage(k, patch),
    });
    console.log(`[WA-Auto] traza=${trace?.id || '—'} → ${result.replied ? `respondido (${result.action})` : `sin respuesta (${result.reason})`}`);

    const common = {
      action: result.action || null,
      agentSource: result.agentSource || null,
      agentName: result.agentName || null,
      modelSlug: result.modelSlug || null,
      usedFallback: !!result.usedFallback,
      aiMs: result.aiMs ?? null,
      sendMs: result.sendMs ?? null,
    };
    if (result.replied) {
      await stage('meta_accepted', { replyMessageId: result.replyMessageId || null });
      return finish('replied', null, result.usedFallback ? `La IA falló (${result.aiError || 'sin detalle'}) y se envió el mensaje de respaldo.` : null, {
        ...common, replyMessageId: result.replyMessageId || null,
      });
    }

    const humanReasons = new Set(['pausa_humana', 'contacto_silenciado']);
    return finish(humanReasons.has(result.reason) ? 'skipped' : (['sin_agente', 'agente_apagado', 'agente_sin_instruccion'].includes(result.reason) ? 'skipped' : 'failed'),
      result.reason || 'error_interno', result.detail || null, {
        ...common,
        metaErrorCode: result.metaCode != null ? String(result.metaCode) : null,
        metaErrorMessage: result.metaCode != null ? result.detail : null,
      });
  } catch (err) {
    console.error('[WA-Auto] Error procesando el entrante:', err.message, err.stack);
    return finish('failed', 'error_interno', err.message);
  }
}

async function sendChatbotReply({ clubId, contactId, text, connection, stage }) {
  const row = (await db.query(`SELECT id, phone FROM "WhatsAppContact" WHERE id=$1`, [contactId])).rows[0];
  if (!row) return { ok: false };
  const { sendWhatsAppTextMessage } = await import('../controllers/crmController.js');
  try {
    await stage('reply_generated', { action: 'chatbot' });
    await stage('sent_to_meta', {});
    const r = await sendWhatsAppTextMessage({ clubId, contact: row, text, connection });
    return { ok: true, messageId: r?.messageId || null };
  } catch (err) {
    console.error('[WA-Inbox] No se pudo enviar la respuesta del chatbot:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * El REINTENTO: retoma las trazas que quedaron a medias.
 *
 * Lo llama el cron `crm-automation-tick`. Sólo retoma lo que no pudo haber
 * salido: una traza que ya pidió el envío a Meta (`sent_to_meta`) se cierra
 * como `resultado_desconocido` en vez de reintentarse, porque reintentarla
 * podría mandar la misma respuesta dos veces.
 */
export async function retryStuckInbound({ limit = 10 } = {}) {
  const { stuckTraces, claimRetry } = await import('../lib/whatsappInboundStore.js');
  const { getConnection } = await import('../lib/whatsappConnectionStore.js');
  const { stageOrd } = await import('../lib/whatsappInbound.js');
  const rows = await stuckTraces({ limit });
  const out = { found: rows.length, retried: 0, closed: 0 };
  for (const row of rows) {
    const trace = { id: row.id, stage: row.stage, startedAt: new Date(row.receivedAt).getTime() };
    if (stageOrd(row.stage) >= stageOrd('sent_to_meta')) {
      await finishTrace(trace, {
        outcome: 'failed', reason: 'resultado_desconocido',
        detail: 'La invocación se interrumpió después de pedir el envío a Meta; no se reintenta para no duplicar la respuesta.',
      });
      out.closed++;
      continue;
    }
    if (!row.connectionId || !row.contactId || !row.clubId) {
      await finishTrace(trace, { outcome: 'failed', reason: 'proceso_interrumpido', detail: 'Se interrumpió antes de identificar la línea o el contacto.' });
      out.closed++;
      continue;
    }
    if (!(await claimRetry(trace, row.attempts))) continue; // otra vuelta la tomó
    const connection = await getConnection(row.connectionId).catch(() => null);
    await processInbound({
      trace,
      clubId: row.clubId, contactId: row.contactId, connection,
      phone: row.phone, contactName: row.contactName,
      bodyText: row.messageText || '', msgType: row.messageType || 'text',
      timestamp: row.receivedAt, signature: row.signature,
      skipInbox: true,
    });
    out.retried++;
  }
  return out;
}

export default { processInbound, retryStuckInbound };
