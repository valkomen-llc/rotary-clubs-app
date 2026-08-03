// API de analítica, centro de campañas, calendario y recomendaciones (Fase 4).
//
// El aislamiento sigue la misma regla que el resto del módulo: el operador de la
// plataforma ve todo; cualquier otro rol administrativo, sólo su sitio.
import db from '../../lib/db.js';
import { resolvePlatformClubId } from '../../lib/crmTenant.js';
import { ensureAutomationSchema } from '../../lib/ensureAutomationSchema.js';
import {
  CONVERSIONS, messagingMetrics, conversionsByJourney, templatePerformance,
  performanceByLifecycle, journeyFunnel, inboxMetrics, costEstimate, dailySeries,
} from '../../lib/crmAnalytics.js';
import { ALERT_TYPES, sweepAlerts, budgetStatus } from '../../lib/crmAlerts.js';
import { recommendations } from '../../lib/crmRecommendations.js';
import { getAutomationSettings, saveAutomationSettings } from '../../lib/crmGuardrails.js';

const OPERATOR_ROLES = ['administrator', 'superadmin'];
const isOperator = (req) => OPERATOR_ROLES.includes(req.user?.role);

function denyUnlessOperator(req, res) {
  if (isOperator(req)) return false;
  res.status(403).json({ error: 'Sólo el superadministrador de la plataforma puede ver la analítica completa.' });
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
  if (status >= 500) console.error('[CRM analytics]', err);
  res.status(status).json({ error: err.message });
};

const windowDays = (req) => {
  const n = Number(req.query.days);
  return Number.isFinite(n) && n > 0 && n <= 365 ? Math.floor(n) : 30;
};

// ── Panel de analítica ──────────────────────────────────────────────────────
export const getAnalyticsDashboard = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const days = windowDays(req);
    const settings = await getAutomationSettings();

    const [messaging, series, templates, segments, journeys, inbox, cost, budget] = await Promise.all([
      messagingMetrics(clubId, { days }),
      dailySeries(clubId, { days }),
      templatePerformance(clubId, { days: days * 3 }),
      performanceByLifecycle(clubId, { days: days * 3 }),
      conversionsByJourney(clubId, { days: days * 3 }),
      inboxMetrics(clubId, { days }),
      costEstimate(clubId, { days, rates: settings.rates || {} }),
      budgetStatus(clubId, settings),
    ]);

    res.json({
      days,
      messaging, series, templates, segments, journeys, inbox, cost, budget,
      conversionTypes: CONVERSIONS,
      // La atribución se declara en la respuesta, no sólo en un tooltip: el
      // número no demuestra causalidad y la UI tiene que poder decirlo.
      attributionNote: 'Las conversiones son por ATRIBUCIÓN: el sitio hizo eso después de recibir el mensaje, dentro de la ventana. No demuestra que el mensaje lo haya causado.',
    });
  } catch (err) { fail(res, err); }
};

export const getJourneyFunnel = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const funnel = await journeyFunnel(clubId, req.params.id);
    if (!funnel) return res.status(404).json({ error: 'El recorrido no existe' });

    // Resultados por variante de las pruebas A/B del recorrido. Se leen del
    // contexto de cada inscripción, que es donde el motor guardó qué variante le
    // tocó a cada contacto.
    const variants = await db.query(
      `SELECT s."nodeId", s.detail->>'variant' AS variant, COUNT(*)::int AS assigned,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM "WhatsAppMessageLog" l
                WHERE l."journeyRunId" = s."runId" AND l."readAt" IS NOT NULL
              ))::int AS "withRead"
       FROM "CrmJourneyStep" s
       WHERE s."journeyId"=$1 AND s.outcome='split'
       GROUP BY s."nodeId", s.detail->>'variant'
       ORDER BY s."nodeId", variant`,
      [req.params.id]
    );

    res.json({
      ...funnel,
      variants: variants.rows.map(v => ({
        ...v,
        readRate: v.assigned > 0 ? Math.round((v.withRead / v.assigned) * 1000) / 10 : null,
        // Con muestras chicas no se declara ganador: se dice que no alcanza.
        enoughSample: v.assigned >= 30,
      })),
    });
  } catch (err) { fail(res, err); }
};

// ── Centro de campañas ──────────────────────────────────────────────────────
/**
 * Campañas manuales y recorridos en UNA lista.
 *
 * Son dos tablas distintas a propósito —una campaña es un envío puntual, un
 * recorrido es una máquina que corre sola— pero para quien mira el mes son lo
 * mismo: cosas que le llegaron a los clubes. Unificarlas en la LECTURA no obliga
 * a unificar los modelos.
 */
export const getCampaignCenter = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const days = windowDays(req);
    const since = new Date(Date.now() - days * 86_400_000);

    const [campaigns, journeys, templates, lists] = await Promise.all([
      db.query(
        `SELECT c.id, c.name, c.status, c."scheduledAt", c."sentAt", c."totalContacts",
                c.sent, c.delivered, c.read, c.failed, t."displayName" AS "templateName",
                l.name AS "listName"
         FROM "WhatsAppCampaign" c
         LEFT JOIN "WhatsAppTemplate" t ON t.id = c."templateId"
         LEFT JOIN "WhatsAppContactList" l ON l.id = c."listId"
         WHERE c."clubId"=$1 AND (c."createdAt" > $2 OR c.status IN ('draft','scheduled','sending'))
         ORDER BY COALESCE(c."sentAt", c."scheduledAt", c."createdAt") DESC LIMIT 200`,
        [clubId, since]
      ),
      db.query(
        `SELECT j.id, j.name, j.status, j.trigger,
                (SELECT COUNT(*)::int FROM "CrmJourneyRun" r WHERE r."journeyId"=j.id AND r.status='active') AS "activeRuns",
                (SELECT COUNT(*)::int FROM "WhatsAppMessageLog" l
                 WHERE l."journeyId"=j.id AND l."createdAt" > $2 AND l.status IN ('sent','delivered','read')) AS sent,
                (SELECT COUNT(*)::int FROM "WhatsAppMessageLog" l
                 WHERE l."journeyId"=j.id AND l."createdAt" > $2 AND l."readAt" IS NOT NULL) AS read,
                (SELECT COUNT(*)::int FROM "WhatsAppMessageLog" l
                 WHERE l."journeyId"=j.id AND l."createdAt" > $2 AND l.status='failed') AS failed
         FROM "CrmJourney" j WHERE j."clubId"=$1 ORDER BY j.name ASC`,
        [clubId, since]
      ),
      db.query(`SELECT COUNT(*)::int AS n, status FROM "WhatsAppTemplate" WHERE "clubId"=$1 GROUP BY status`, [clubId]),
      db.query(`SELECT COUNT(*)::int AS n FROM "WhatsAppContactList" WHERE "clubId"=$1`, [clubId]),
    ]);

    res.json({
      days,
      campaigns: campaigns.rows.map(c => ({ ...c, kind: 'campaign' })),
      journeys: journeys.rows.map(j => ({ ...j, kind: 'journey' })),
      templates: templates.rows,
      listCount: lists.rows[0]?.n || 0,
    });
  } catch (err) { fail(res, err); }
};

// ── Calendario de comunicaciones ────────────────────────────────────────────
/**
 * Qué va a pasar y qué pasó, día por día.
 *
 * Fuentes: campañas programadas, envíos ya realizados, esperas de recorrido que
 * vencen (que es lo que de verdad va a salir), capacitaciones agendadas y
 * vencimientos de suscripción.
 *
 * Lo FUTURO de un recorrido son las inscripciones con `waitUntil` en el futuro:
 * es una previsión REAL, no una proyección teórica del grafo. Un recorrido puede
 * tener diez pasos y ninguna inscripción viva, y entonces no va a salir nada.
 */
export const getCommunicationCalendar = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 7 * 86_400_000);
    const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 30 * 86_400_000);

    const [scheduled, sentDays, upcoming, trainings, expirations] = await Promise.all([
      db.query(
        `SELECT id, name, "scheduledAt" AS at, status, 'campaign_scheduled' AS kind
         FROM "WhatsAppCampaign"
         WHERE "clubId"=$1 AND "scheduledAt" BETWEEN $2 AND $3 AND status IN ('draft','scheduled')`,
        [clubId, from, to]
      ),
      db.query(
        `SELECT date_trunc('day', l."createdAt") AS at, COUNT(*)::int AS n, 'sent' AS kind
         FROM "WhatsAppMessageLog" l
         WHERE l."clubId"=$1 AND l.direction='outgoing' AND l."createdAt" BETWEEN $2 AND $3
         GROUP BY 1 ORDER BY 1`,
        [clubId, from, to]
      ),
      db.query(
        `SELECT date_trunc('day', r."waitUntil") AS at, j.name, COUNT(*)::int AS n, 'journey_due' AS kind
         FROM "CrmJourneyRun" r JOIN "CrmJourney" j ON j.id = r."journeyId"
         WHERE r."clubId"=$1 AND r.status='active' AND r."waitUntil" BETWEEN $2 AND $3
         GROUP BY 1, j.name ORDER BY 1`,
        [clubId, from, to]
      ),
      db.query(
        `SELECT a.id, a."startAt" AS at, COALESCE(cl.name,'Sin sitio') AS name, a.status, 'training' AS kind
         FROM "TrainingAppointment" a
         LEFT JOIN "Club" cl ON cl.id = a."clubId"
         WHERE a."startAt" BETWEEN $1 AND $2 AND a.status NOT IN ('cancelled')
         ORDER BY a."startAt" LIMIT 200`,
        [from, to]
      ),
      db.query(
        `SELECT ls."siteId" AS id, (ls.signals->>'expirationDate')::timestamptz AS at,
                COALESCE(cl.name, d.name) AS name, ls.state, 'expiration' AS kind
         FROM "CrmLifecycleState" ls
         LEFT JOIN "Club" cl ON cl.id = ls."siteId"
         LEFT JOIN "District" d ON d.id = ls."siteId"
         WHERE (ls.signals->>'expirationDate')::timestamptz BETWEEN $1 AND $2
         ORDER BY 2 LIMIT 200`,
        [from, to]
      ),
    ]);

    res.json({
      from, to,
      events: [
        ...scheduled.rows, ...sentDays.rows, ...upcoming.rows,
        ...trainings.rows, ...expirations.rows,
      ].filter(e => e.at),
      note: 'Lo futuro de un recorrido son sus inscripciones con espera vencida en ese día: es lo que va a salir de verdad, no una proyección del grafo.',
    });
  } catch (err) { fail(res, err); }
};

// ── Alertas y presupuesto ───────────────────────────────────────────────────
export const runAlertSweep = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const settings = await getAutomationSettings();
    const out = await sweepAlerts(clubId, { settings });
    res.json({ ok: true, ...out, types: ALERT_TYPES });
  } catch (err) { fail(res, err); }
};

export const updateBudget = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const b = req.body || {};
    const patch = {};
    if (b.monthlyBudget !== undefined) {
      const n = Number(b.monthlyBudget);
      patch.monthlyBudget = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    if (b.budgetHardStop !== undefined) patch.budgetHardStop = !!b.budgetHardStop;
    if (b.rates && typeof b.rates === 'object') {
      const rates = {};
      for (const [k, v] of Object.entries(b.rates)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) rates[String(k).toLowerCase()] = n;
      }
      patch.rates = rates;
    }
    const saved = await saveAutomationSettings(patch);
    const clubId = await tenant();
    res.json({ settings: saved, budget: await budgetStatus(clubId, saved) });
  } catch (err) { fail(res, err); }
};

// ── Recomendaciones ─────────────────────────────────────────────────────────
export const getRecommendations = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const out = await recommendations(clubId, {
      days: windowDays(req),
      narrate: req.query.narrate !== 'false',
    });
    res.json(out);
  } catch (err) { fail(res, err); }
};

export default {
  getAnalyticsDashboard, getJourneyFunnel, getCampaignCenter,
  getCommunicationCalendar, runAlertSweep, updateBudget, getRecommendations,
};
