// Calendario editorial por campaña y global (v4.1171, FASE 2).
//
// Flujo = REGLAS, Calendario = EJECUCIONES proyectadas de esas reglas con
// estados reales. La matemática vive en `contentActivationSchedule` (única
// fuente, compartida con el tick); aquí solo se resuelven estados con datos
// (ejecuciones + eventos + inscripciones + overrides) y se agrega global.
import db from './db.js';
import { occurrencesForCampaign } from './contentActivationSchedule.js';
import { loadScheduleOverrides } from './contentActivationEngine.js';

export const SEND_EVENTS = ['email_enviado', 'whatsapp_enviado', 'recordatorio_enviado'];
export const FAIL_EVENTS = ['email_fallido', 'whatsapp_fallido', 'error'];

const execAnchor = (e) => new Date(e.startAt || e.createdAt || 0).getTime();

export function resolveOccurrenceState(o, { executions, eventsByExecStep, enrollPauseByExec, campaignStatus, now }) {
  if (o.estadoBase === 'omitido') return 'omitido';
  let exec = null;
  for (const e of executions) {
    if (execAnchor(e) <= new Date(o.scheduledAt).getTime()) exec = e;
  }
  const evts = exec ? (eventsByExecStep.get(`${exec.id}:${o.stepKey}`) || []) : [];
  const types = new Set(evts.map((v) => v.type));
  if ([...types].some((t) => SEND_EVENTS.includes(t))) return 'enviado';
  if ([...types].some((t) => FAIL_EVENTS.includes(t))) return 'fallido';
  if (exec?.status === 'cerrada') return 'cancelado';
  if (exec && (enrollPauseByExec.get(exec.id) || 0) > 0) return 'pausado';
  if (campaignStatus === 'pausada' && new Date(o.scheduledAt).getTime() > now) return 'pausado';
  if (['finalizada', 'archivada'].includes(campaignStatus) && new Date(o.scheduledAt).getTime() > now) return 'cancelado';
  if (new Date(o.scheduledAt).getTime() > now) return 'programado';
  return 'pendiente';
}

/** Calendario completo de UNA campaña (proyección + estados + próxima/serie). */
export async function getCampaignCalendar(campaign, { from = null, to = null, now = Date.now() } = {}) {
  const overrides = await loadScheduleOverrides(campaign.id);
  let occ = occurrencesForCampaign(campaign, { overrides: [...overrides.values()] });
  if (from) occ = occ.filter((o) => new Date(o.scheduledAt).getTime() >= from);
  if (to) occ = occ.filter((o) => new Date(o.scheduledAt).getTime() <= to);
  const { rows: executions } = await db.query(
    `SELECT id, "periodoLabel", "startAt", "endAt", status, "createdAt" FROM "ContentActivationExecution" WHERE "campaignId"=$1 ORDER BY "createdAt" ASC`,
    [campaign.id]).catch(() => ({ rows: [] }));
  const { rows: events } = await db.query(
    `SELECT type, channel, metadata, "executionId", "createdAt" FROM "ContentActivationEvent" WHERE "campaignId"=$1`,
    [campaign.id]).catch(() => ({ rows: [] }));
  const eventsByExecStep = new Map();
  for (const v of events) {
    const k = `${v.executionId}:${v.metadata?.step}`;
    if (!eventsByExecStep.has(k)) eventsByExecStep.set(k, []);
    eventsByExecStep.get(k).push(v);
  }
  const enrollPauseByExec = new Map();
  for (const e of executions) {
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS n FROM "ContentActivationEnrollment" WHERE "executionId"=$1 GROUP BY 1`,
      [e.id]).catch(() => ({ rows: [] }));
    enrollPauseByExec.set(e.id, rows.filter((r) => r.status === 'pausada').reduce((a, r) => a + Number(r.n), 0));
  }
  const withState = occ.map((o) => ({
    ...o,
    estado: resolveOccurrenceState(o, { executions, eventsByExecStep, enrollPauseByExec, campaignStatus: campaign.status, now }),
  }));
  const nextByStep = {};
  for (const o of withState) {
    if (o.estado === 'omitido' || o.estado === 'cancelado') continue;
    if (new Date(o.scheduledAt).getTime() <= now) continue;
    if (!nextByStep[o.stepKey]) nextByStep[o.stepKey] = o.scheduledAt;
  }
  return {
    campaign: {
      id: campaign.id, name: campaign.name, status: campaign.status,
      startAt: campaign.startAt, endAt: campaign.endAt, timezone: campaign.timezone,
      frecuencia: campaign.frecuencia, canales: campaign.canales || [], audienceMode: campaign.audienceMode || 'dynamic',
    },
    occurrences: withState.map((o) => ({ ...o, proximaEnSerie: nextByStep[o.stepKey] || null })),
    total: withState.length,
  };
}

/**
 * Calendario GLOBAL de marketing (v4.1171): agrega las ocurrencias de todas
 * las campañas visibles y activas (activa/programada/pausada). Cada evento
 * lleva campaña + estado; orden cronológico; tope `limit` (def. 500).
 */
export async function getGlobalCalendar(campaigns, { from = null, to = null, limit = 500, now = Date.now() } = {}) {
  const all = [];
  for (const c of campaigns) {
    const cal = await getCampaignCalendar(c, { from, to, now }).catch(() => null);
    if (!cal) continue;
    for (const o of cal.occurrences) {
      all.push({
        ...o,
        campaignId: c.id, campaignName: c.name, campaignStatus: c.status,
      });
      if (all.length >= limit) break;
    }
    if (all.length >= limit) break;
  }
  all.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  return { occurrences: all.slice(0, limit), total: all.length, truncated: all.length >= limit };
}

export default { SEND_EVENTS, FAIL_EVENTS, resolveOccurrenceState, getCampaignCalendar, getGlobalCalendar };
