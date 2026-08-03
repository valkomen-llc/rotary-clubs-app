// API del panel de diagnóstico del CRM (v4.702).
//
// Responde tres preguntas que hasta ahora sólo se podían contestar leyendo el
// código y adivinando: qué dice Meta de nuestra conexión, qué nos llegó de
// verdad y qué salió de verdad.
//
// Es SÓLO LECTURA excepto la prueba controlada, que sí manda un mensaje y lo
// avisa. Un panel de diagnóstico que cambia cosas al mirarlas no sirve para
// diagnosticar.
import db from '../../lib/db.js';
import { resolvePlatformClubId } from '../../lib/crmTenant.js';
import { diagnoseClub, auditTemplates } from '../../lib/crmDiagnostics.js';
import {
  ensureWebhookAuditSchema, recentWebhooks, webhookEventDetail,
  recentOutbound, auditSummary,
} from '../../lib/crmWebhookAudit.js';

const OPERATOR_ROLES = ['administrator', 'superadmin'];

/**
 * El diagnóstico es del OPERADOR de la plataforma, no del administrador de un
 * sitio. Lleva el token, los identificadores de Meta y el payload crudo de los
 * webhooks: cosas de la infraestructura compartida, no de una organización.
 */
function denyUnlessOperator(req, res) {
  if (OPERATOR_ROLES.includes(req.user?.role)) return false;
  res.status(403).json({ error: 'Sólo el superadministrador de la plataforma puede ver el diagnóstico técnico.' });
  return true;
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
  if (status >= 500) console.error('[CRM diagnostics]', err);
  res.status(status).json({ error: err.message });
};

/** Estado completo: Meta + nuestra base. */
export async function getDiagnostics(req, res) {
  if (denyUnlessOperator(req, res)) return;
  try {
    const clubId = await tenant();
    await ensureWebhookAuditSchema().catch(() => {});
    const [diagnosis, summary] = await Promise.all([
      diagnoseClub(clubId),
      auditSummary(clubId).catch(() => null),
    ]);

    // El veredicto se DERIVA de las comprobaciones, no se escribe aparte: si se
    // escribiera aparte podría contradecir la lista que está justo debajo.
    const errors = diagnosis.checks.filter(c => c.state === 'error');
    const warns = diagnosis.checks.filter(c => c.state === 'warn');
    const unknown = diagnosis.checks.filter(c => c.state === 'unknown');

    res.json({
      ...diagnosis,
      summary,
      verdict: errors.length ? 'error' : warns.length ? 'warn' : unknown.length ? 'parcial' : 'ok',
      counts: { error: errors.length, warn: warns.length, unknown: unknown.length, ok: diagnosis.checks.length - errors.length - warns.length - unknown.length },
      // La URL que Meta tiene que tener configurada. Se arma con la petición en
      // curso porque es el único dato fiable del dominio en el que corre esto.
      webhookUrl: `${req.protocol}://${req.get('host')}/api/crm/webhook`,
    });
  } catch (err) { fail(res, err); }
}

/** Los últimos webhooks recibidos, con su resultado. */
export async function getWebhookLog(req, res) {
  if (denyUnlessOperator(req, res)) return;
  try {
    const clubId = await tenant();
    await ensureWebhookAuditSchema();
    const rows = await recentWebhooks({
      clubId,
      limit: Math.min(parseInt(req.query.limit || '50', 10) || 50, 200),
      onlyProblems: req.query.problems === 'true',
    });
    res.json({ rows });
  } catch (err) { fail(res, err); }
}

/** El payload completo de un webhook. */
export async function getWebhookDetail(req, res) {
  if (denyUnlessOperator(req, res)) return;
  try {
    await ensureWebhookAuditSchema();
    const row = await webhookEventDetail(req.params.id);
    if (!row) return res.status(404).json({ error: 'No existe ese evento.' });
    res.json({ row });
  } catch (err) { fail(res, err); }
}

/** Las últimas llamadas salientes a Meta, con petición y respuesta. */
export async function getOutboundLog(req, res) {
  if (denyUnlessOperator(req, res)) return;
  try {
    const clubId = await tenant();
    await ensureWebhookAuditSchema();
    const rows = await recentOutbound({
      clubId,
      limit: Math.min(parseInt(req.query.limit || '50', 10) || 50, 200),
      onlyFailures: req.query.failures === 'true',
    });
    res.json({ rows });
  } catch (err) { fail(res, err); }
}

/** Plantillas locales frente a las de Meta. */
export async function getTemplateAudit(req, res) {
  if (denyUnlessOperator(req, res)) return;
  try {
    const clubId = await tenant();
    res.json(await auditTemplates(clubId));
  } catch (err) { fail(res, err); }
}

/**
 * Prueba controlada: manda un mensaje real a un número y devuelve la respuesta
 * de Meta tal cual.
 *
 * Manda de verdad —por eso exige el número explícito y no lo toma de ninguna
 * lista—: una prueba que no sale no prueba nada. Queda registrada como
 * cualquier otro envío.
 */
export async function runSendTest(req, res) {
  if (denyUnlessOperator(req, res)) return;
  try {
    const clubId = await tenant();
    const { phone, text } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Falta el número de destino.' });

    const { validateForMeta } = await import('../../lib/phone.js');
    const v = validateForMeta(phone);
    if (!v.ok) return res.status(400).json({ error: `Número inválido: ${v.reason}` });

    const cfgR = await db.query(`SELECT * FROM "WhatsAppConfig" WHERE "clubId"=$1 LIMIT 1`, [clubId]);
    const cfg = cfgR.rows[0];
    if (!cfg) return res.status(409).json({ error: 'No hay configuración de WhatsApp.' });

    const started = Date.now();
    const body = {
      messaging_product: 'whatsapp',
      to: v.e164,
      type: 'text',
      text: { preview_url: false, body: text || 'Prueba de diagnóstico de la plataforma.' },
    };
    const base = `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v21.0'}`;
    const r = await fetch(`${base}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));

    const { logOutbound } = await import('../../lib/crmWebhookAudit.js');
    await logOutbound({
      clubId, operation: 'diagnostic_test', endpoint: `${base}/${cfg.phoneNumberId}/messages`,
      requestBody: body, httpStatus: r.status, responseBody: data,
      messageId: data?.messages?.[0]?.id || null,
      errorCode: data?.error?.code || null, errorMessage: data?.error?.message || null,
      durationMs: Date.now() - started, ok: r.ok && !data.error,
      phone: v.e164, userId: req.user?.id || null,
    });

    res.json({
      ok: r.ok && !data.error,
      httpStatus: r.status,
      messageId: data?.messages?.[0]?.id || null,
      // La respuesta de Meta va ENTERA y sin interpretar. Es el punto de la
      // prueba: ver lo que contestó, no nuestra lectura de lo que contestó.
      response: data,
      // Un mensaje libre sólo se entrega dentro de la ventana de 24 h desde el
      // último entrante de esa persona. Fuera de ella Meta acepta la llamada y
      // no entrega nada, así que un 200 acá no prueba la entrega.
      nota: 'Un 200 confirma que Meta aceptó la llamada, no que el mensaje se entregó. La entrega la confirma el webhook: volver a este panel en un minuto y mirar si llegó el estado.',
      durationMs: Date.now() - started,
    });
  } catch (err) { fail(res, err); }
}

export default {
  getDiagnostics, getWebhookLog, getWebhookDetail,
  getOutboundLog, getTemplateAudit, runSendTest,
};
