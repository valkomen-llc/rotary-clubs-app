// Envío de una plantilla por la Cloud API de Meta, con su registro en el log.
//
// Es la primitiva que usa el motor de automatización. Está aparte de
// `crmController.js` a propósito: importar el controlador desde el motor traería
// media docena de dependencias del panel a un proceso que corre en un cron, y
// crearía un ciclo (el controlador ya importa piezas del CRM).
//
// PENDIENTE CONOCIDO: `sendCampaign` en `crmController.js` conserva su propia
// copia de esta lógica, con su manejo de encabezados multimedia y su presupuesto
// de tiempo. Unificarlas es deseable pero cambia el camino por el que hoy salen
// las campañas manuales de producción, y este PR no lo toca. Al corregir algo
// del envío, mirar los dos sitios.
import crypto from 'crypto';
import db from './db.js';
import { validateForMeta } from './phone.js';
import { logOutbound } from './crmWebhookAudit.js';

const WA_API_BASE = `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v21.0'}`;

export async function getWhatsAppConfig(clubId) {
  const r = await db.query(`SELECT * FROM "WhatsAppConfig" WHERE "clubId"=$1 LIMIT 1`, [clubId]);
  return r.rows[0] || null;
}

async function metaApiCall({ method = 'POST', path, body, token, clubId = null, audit = {} }) {
  const url = `${WA_API_BASE}${path}`;
  const startedAt = Date.now();
  let httpStatus = null;
  let data = null;
  let thrown = null;
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    httpStatus = res.status;
    data = await res.json().catch(() => ({}));
  } catch (err) {
    thrown = err;
  }

  const metaError = data?.error || null;
  const failed = !!thrown || !!metaError || (httpStatus !== null && httpStatus >= 400);

  // Igual que en `crmController.js`: TODA salida hacia Meta queda registrada
  // con su petición y su respuesta. Acá importa el doble, porque estos envíos
  // los dispara un cron y no hay nadie mirando cuando fallan.
  await logOutbound({
    clubId,
    operation: audit.operation || 'journey_send',
    endpoint: url,
    requestBody: body || null,
    httpStatus,
    responseBody: data,
    messageId: data?.messages?.[0]?.id || null,
    errorCode: metaError?.code ?? (thrown ? 'network' : (failed ? httpStatus : null)),
    errorMessage: metaError?.message || thrown?.message || null,
    durationMs: Date.now() - startedAt,
    ok: !failed,
    campaignId: audit.campaignId || null,
    journeyId: audit.journeyId || null,
    contactId: audit.contactId || null,
    phone: audit.phone || null,
    templateName: audit.templateName || null,
  });

  if (thrown) throw thrown;
  if (failed) {
    const err = new Error(metaError?.message || `Meta respondió ${httpStatus}`);
    err.code = metaError?.code || httpStatus;
    err.details = metaError;
    throw err;
  }
  return data;
}

/**
 * Manda una plantilla y deja la fila en `WhatsAppMessageLog`.
 *
 * NO evalúa guardrails: eso lo hace quien llama (`journeyEngine`), porque la
 * decisión de aplazar frente a descartar es del motor, no del transporte.
 *
 * El log se escribe SIEMPRE, también cuando Meta falla: un envío que no dejó
 * rastro es un envío que nadie puede diagnosticar, y es además la fila de la que
 * depende el tope de frecuencia.
 */
export async function sendTemplate({
  clubId, contact, template, variables = [],
  journeyId = null, journeyRunId = null, campaignId = null, config = null,
}) {
  const cfg = config || await getWhatsAppConfig(clubId);
  if (!cfg) throw new Error('WhatsApp no está configurado para este sitio');
  if (cfg.enabled === false) throw new Error('La integración de WhatsApp está deshabilitada');

  const v = validateForMeta(contact.phone);
  if (!v.ok) throw new Error(`Número inválido: ${v.reason}`);

  const components = variables.length
    ? [{ type: 'body', parameters: variables.map(x => ({ type: 'text', text: String(x) })) }]
    : [];
  const payload = { name: template.name, language: { code: template.language || 'es' } };
  if (components.length) payload.components = components;

  const logId = crypto.randomUUID();
  const bodyText = template.bodyText || `[Plantilla: ${template.name}]`;

  try {
    const apiRes = await metaApiCall({
      path: `/${cfg.phoneNumberId}/messages`,
      token: cfg.accessToken,
      body: { messaging_product: 'whatsapp', to: v.e164, type: 'template', template: payload },
      clubId,
      audit: {
        operation: journeyId ? 'journey_send' : 'template_send',
        journeyId, campaignId, contactId: contact.id,
        phone: v.e164, templateName: template.name,
      },
    });
    const messageId = apiRes.messages?.[0]?.id || null;

    await db.query(
      `INSERT INTO "WhatsAppMessageLog"
         (id,"clubId","campaignId","contactId",phone,"messageId","templateName","bodyText",
          status,direction,"journeyId","journeyRunId","sentAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sent','outgoing',$9,$10,NOW(),NOW(),NOW())`,
      [logId, clubId, campaignId, contact.id, v.e164, messageId, template.name, bodyText, journeyId, journeyRunId]
    );
    await db.query(
      `UPDATE "WhatsAppContact" SET "totalSent"="totalSent"+1,"updatedAt"=NOW() WHERE id=$1`,
      [contact.id]
    ).catch(() => {});

    return { ok: true, messageId, logId };
  } catch (err) {
    await db.query(
      `INSERT INTO "WhatsAppMessageLog"
         (id,"clubId","campaignId","contactId",phone,"templateName","bodyText",
          status,direction,"journeyId","journeyRunId","errorCode","errorMessage","failedAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'failed','outgoing',$8,$9,$10,$11,NOW(),NOW(),NOW())`,
      [logId, clubId, campaignId, contact.id, v.e164, template.name, bodyText,
       journeyId, journeyRunId, err.code ? String(err.code) : null, err.message]
    ).catch(() => {});
    await db.query(
      `UPDATE "WhatsAppContact" SET "totalFailed"="totalFailed"+1,"updatedAt"=NOW() WHERE id=$1`,
      [contact.id]
    ).catch(() => {});

    err.logId = logId;
    throw err;
  }
}

export default { sendTemplate, getWhatsAppConfig };
