// API del motor de automatización del WhatsApp CRM.
//
// PERMISOS — el módulo tiene dos audiencias y no se mezclan:
//
//   · El SUPERADMINISTRADOR de la plataforma configura y opera: crea recorridos,
//     los activa, cambia los guardrails, ve el tablero de todos los sitios.
//   · El ADMINISTRADOR DE UN SITIO sólo CONSULTA lo que su organización recibió.
//     No emite, no configura y no ve nada de otro sitio.
//
// El aislamiento vive en `scopeSiteFilter`, que es el único punto por donde pasa
// esa decisión. Al agregar un endpoint de lectura, usarlo: consultar la tabla
// por fuera pierde el aislamiento en silencio, que es exactamente el defecto que
// la sección de identidades de CLAUDE.md documenta para `authMiddleware`.
import crypto from 'crypto';
import db from '../../lib/db.js';
import { ensureAutomationSchema } from '../../lib/ensureAutomationSchema.js';
import { resolvePlatformClubId } from '../../lib/crmTenant.js';
import { runLifecycleSweep, setManualLifecycleState } from '../../lib/crmLifecycle.js';
import {
  LIFECYCLE_STATES, LIFECYCLE_KEYS, lifecycleLabel, isLifecycleKey, LIFECYCLE_THRESHOLDS,
} from '../../lib/lifecycleSpec.js';
import { EVENT_TYPES } from '../../lib/crmEventBus.js';
import {
  segmentCatalog, countAudience, resolveAudience, validateAudience, ORG_ROLES,
} from '../../lib/crmSegments.js';
import {
  getAutomationSettings, saveAutomationSettings, listSuppressions,
  suppressContact, unsuppressContact, GUARDRAIL_REASONS,
} from '../../lib/crmGuardrails.js';
import {
  NODE_TYPES, CONDITION_KINDS, MESSAGE_OUTCOMES, TEMPLATE_VARIABLES, validateJourney,
} from '../../lib/journeySpec.js';
import { enrollFromEvents, advanceRuns, enrollContact } from '../../lib/journeyEngine.js';
import { ensureSeedJourneys } from '../../lib/journeySeeds.js';

const SUPERADMIN_ROLES = ['administrator', 'superadmin'];

const isPlatformOperator = (req) => SUPERADMIN_ROLES.includes(req.user?.role);

/** Rechaza a quien no opera la plataforma. Devuelve true si ya respondió. */
function denyIfNotOperator(req, res) {
  if (isPlatformOperator(req)) return false;
  res.status(403).json({ error: 'Sólo el superadministrador de la plataforma puede operar el motor de automatización.' });
  return true;
}

/**
 * Filtro de sitio según quién pregunta.
 *
 * El operador de la plataforma ve todo. Cualquier otro rol administrativo queda
 * acotado a SU sitio, y si su token no trae sitio no ve nada — negar es la
 * respuesta correcta ante un token que no dice a qué organización pertenece.
 */
function scopeSiteFilter(req) {
  if (isPlatformOperator(req)) return { all: true, siteIds: null };
  const own = [req.user?.clubId, req.user?.districtId].filter(Boolean);
  return { all: false, siteIds: own };
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
  if (status >= 500) console.error('[CRM automation]', err);
  res.status(status).json({ error: err.message });
};

// ── Catálogo ────────────────────────────────────────────────────────────────
// Todo lo que el constructor visual necesita para dibujarse, en una sola
// llamada. Sin esto el frontend tendría que repetir los catálogos y se
// desincronizarían al agregar un tipo de nodo.
export const getCatalog = async (req, res) => {
  try {
    await ensureAutomationSchema();
    const clubId = await resolvePlatformClubId();
    const templates = clubId
      ? (await db.query(
          `SELECT id, name, "displayName", category, language, status
           FROM "WhatsAppTemplate" WHERE "clubId"=$1 ORDER BY "displayName" ASC`, [clubId])).rows
      : [];

    res.json({
      nodeTypes: NODE_TYPES,
      conditionKinds: CONDITION_KINDS,
      messageOutcomes: MESSAGE_OUTCOMES,
      variables: TEMPLATE_VARIABLES,
      events: EVENT_TYPES,
      lifecycleStates: LIFECYCLE_STATES,
      thresholds: LIFECYCLE_THRESHOLDS,
      orgRoles: ORG_ROLES,
      segments: segmentCatalog(),
      guardrailReasons: GUARDRAIL_REASONS,
      templates,
      platformClubId: clubId,
    });
  } catch (err) { fail(res, err); }
};

// ── Recorridos ──────────────────────────────────────────────────────────────
export const getJourneys = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    await ensureSeedJourneys(clubId);

    const r = await db.query(
      `SELECT j.*,
              (SELECT COUNT(*)::int FROM "CrmJourneyRun" r WHERE r."journeyId"=j.id AND r.status='active')    AS "activeRuns",
              (SELECT COUNT(*)::int FROM "CrmJourneyRun" r WHERE r."journeyId"=j.id AND r.status='completed') AS "completedRuns",
              (SELECT COUNT(*)::int FROM "CrmJourneyRun" r WHERE r."journeyId"=j.id)                          AS "totalRuns",
              (SELECT COUNT(*)::int FROM "WhatsAppMessageLog" l WHERE l."journeyId"=j.id AND l.status IN ('sent','delivered','read')) AS "messagesSent"
       FROM "CrmJourney" j WHERE j."clubId"=$1 ORDER BY j."createdAt" ASC`,
      [clubId]
    );
    res.json(r.rows.map(j => ({ ...j, validation: validateJourney(j) })));
  } catch (err) { fail(res, err); }
};

export const getJourneyDetail = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const r = await db.query(`SELECT * FROM "CrmJourney" WHERE "clubId"=$1 AND id=$2`, [clubId, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'El recorrido no existe' });
    const journey = r.rows[0];

    // Rendimiento por paso: es la pregunta que se hace de verdad ("¿en qué
    // mensaje se caen?"), y responderla desde la traza es lo que justifica
    // guardar `CrmJourneyStep`.
    const [stepStats, audience] = await Promise.all([
      db.query(
        `SELECT "nodeId", "nodeType", outcome, COUNT(*)::int AS n
         FROM "CrmJourneyStep" WHERE "journeyId"=$1 GROUP BY "nodeId","nodeType",outcome`,
        [journey.id]
      ),
      countAudience(clubId, journey.audience || {}).catch(() => ({ total: 0, sites: 0 })),
    ]);

    res.json({ ...journey, validation: validateJourney(journey), stepStats: stepStats.rows, audienceSize: audience });
  } catch (err) { fail(res, err); }
};

const journeyPayload = (body) => ({
  name: body.name,
  goal: body.goal || null,
  audience: body.audience || { match: 'all', rules: [] },
  trigger: body.trigger || {},
  nodes: Array.isArray(body.nodes) ? body.nodes : [],
  settings: body.settings || {},
});

export const createJourney = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const p = journeyPayload(req.body);
    if (!p.name) return res.status(400).json({ error: 'El recorrido necesita un nombre.' });

    const audienceErrors = validateAudience(p.audience);
    if (audienceErrors.length) return res.status(400).json({ error: audienceErrors.join(' ') });

    const key = (req.body.key || p.name).toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || `recorrido_${Date.now()}`;

    // Nace SIEMPRE en borrador. Activar es una decisión explícita: crear un
    // recorrido y que empiece a escribirle a los clubes en el mismo gesto es
    // justo lo que no se puede deshacer.
    const r = await db.query(
      `INSERT INTO "CrmJourney" (id,"clubId",key,name,goal,status,audience,trigger,nodes,settings)
       VALUES ($1,$2,$3,$4,$5,'draft',$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb)
       ON CONFLICT ("clubId", key) DO NOTHING
       RETURNING *`,
      [crypto.randomUUID(), clubId, key, p.name, p.goal,
       JSON.stringify(p.audience), JSON.stringify(p.trigger), JSON.stringify(p.nodes), JSON.stringify(p.settings)]
    );
    if (!r.rows.length) return res.status(409).json({ error: `Ya existe un recorrido con la clave "${key}".` });
    res.status(201).json({ ...r.rows[0], validation: validateJourney(r.rows[0]) });
  } catch (err) { fail(res, err); }
};

export const updateJourney = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const p = journeyPayload(req.body);

    const audienceErrors = validateAudience(p.audience);
    if (audienceErrors.length) return res.status(400).json({ error: audienceErrors.join(' ') });

    const r = await db.query(
      `UPDATE "CrmJourney"
       SET name=COALESCE($1,name), goal=$2, audience=$3::jsonb, trigger=$4::jsonb,
           nodes=$5::jsonb, settings=$6::jsonb, "updatedAt"=NOW()
       WHERE "clubId"=$7 AND id=$8 RETURNING *`,
      [p.name, p.goal, JSON.stringify(p.audience), JSON.stringify(p.trigger),
       JSON.stringify(p.nodes), JSON.stringify(p.settings), clubId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'El recorrido no existe' });

    const journey = r.rows[0];
    const errors = validateJourney(journey);
    // Un recorrido activo que se edita hasta quedar inválido se PAUSA. Dejarlo
    // activo lo haría fallar contacto por contacto en el próximo tick.
    if (errors.length && journey.status === 'active') {
      await db.query(`UPDATE "CrmJourney" SET status='paused',"updatedAt"=NOW() WHERE id=$1`, [journey.id]);
      journey.status = 'paused';
    }
    res.json({ ...journey, validation: errors });
  } catch (err) { fail(res, err); }
};

export const setJourneyStatus = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const status = String(req.body?.status || '').toLowerCase();
    if (!['draft', 'active', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido. Use draft, active o paused.' });
    }

    const cur = await db.query(`SELECT * FROM "CrmJourney" WHERE "clubId"=$1 AND id=$2`, [clubId, req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'El recorrido no existe' });

    if (status === 'active') {
      // Se revalida al activar y no sólo al guardar: entre una cosa y la otra
      // alguien pudo borrar la plantilla que usaba un paso.
      const errors = validateJourney(cur.rows[0]);
      if (errors.length) return res.status(400).json({ error: 'No se puede activar.', validation: errors });

      const missing = (cur.rows[0].nodes || [])
        .filter(n => n.type === 'send_template')
        .filter(n => !n.templateId);
      if (missing.length) {
        return res.status(400).json({
          error: `Faltan plantillas en ${missing.length} paso(s). Creálas en Meta, sincronizalas y asignalas antes de activar.`,
        });
      }
    }

    const r = await db.query(
      `UPDATE "CrmJourney" SET status=$1,"updatedAt"=NOW() WHERE "clubId"=$2 AND id=$3 RETURNING *`,
      [status, clubId, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) { fail(res, err); }
};

export const deleteJourney = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const active = await db.query(
      `SELECT COUNT(*)::int AS n FROM "CrmJourneyRun" WHERE "journeyId"=$1 AND status='active'`,
      [req.params.id]
    );
    // Un recorrido con inscripciones vivas no se borra: se pausa. Borrarlo
    // dejaría inscripciones apuntando a un grafo inexistente, y con ellas la
    // única traza de por qué un club recibió lo que recibió.
    if (active.rows[0]?.n > 0) {
      return res.status(409).json({
        error: `Tiene ${active.rows[0].n} inscripción(es) activa(s). Pausalo en vez de borrarlo, o esperá a que terminen.`,
      });
    }
    const r = await db.query(`DELETE FROM "CrmJourney" WHERE "clubId"=$1 AND id=$2 RETURNING id`, [clubId, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'El recorrido no existe' });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
};

export const getJourneyRuns = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const status = req.query.status || null;
    const params = [clubId, req.params.id];
    let sql = `SELECT r.*, c.name AS "contactName", c.phone, ls.state AS "lifecycleState"
               FROM "CrmJourneyRun" r
               LEFT JOIN "WhatsAppContact" c ON c.id = r."contactId"
               LEFT JOIN "CrmLifecycleState" ls ON ls."siteId" = r."siteId"
               WHERE r."clubId"=$1 AND r."journeyId"=$2`;
    if (status) { sql += ` AND r.status=$3`; params.push(status); }
    sql += ` ORDER BY r."enrolledAt" DESC LIMIT 300`;
    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (err) { fail(res, err); }
};

export const getRunTrace = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const runR = await db.query(`SELECT * FROM "CrmJourneyRun" WHERE id=$1 AND "clubId"=$2`, [req.params.runId, clubId]);
    if (!runR.rows.length) return res.status(404).json({ error: 'La inscripción no existe' });
    const steps = await db.query(
      `SELECT * FROM "CrmJourneyStep" WHERE "runId"=$1 ORDER BY "createdAt" ASC`, [req.params.runId]
    );
    res.json({ run: runR.rows[0], steps: steps.rows });
  } catch (err) { fail(res, err); }
};

export const enrollInJourney = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const run = await enrollContact({ clubId, journeyId: req.params.id, contactId: req.body?.contactId });
    if (!run) return res.status(409).json({ error: 'Ese contacto ya está inscrito en este recorrido.' });
    res.status(201).json(run);
  } catch (err) {
    // Los fallos de `enrollContact` son de validación (recorrido inválido,
    // contacto inexistente), no del servidor. Se marca el estado sobre el propio
    // Error: copiarlo con spread perdería `message`, que en un Error no es
    // enumerable.
    if (!err.status) err.status = 400;
    fail(res, err);
  }
};

/** Corre el tick a mano. Es lo que permite probar sin esperar al cron. */
export const runTickNow = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const now = new Date();
    const lifecycle = await runLifecycleSweep({ now });
    const clubId = await resolvePlatformClubId();
    let enrollment = { events: 0, enrolled: 0 }, delivery = { processed: 0, sent: 0 };
    if (clubId) {
      enrollment = await enrollFromEvents({ clubId, now });
      delivery = await advanceRuns({ clubId, now, timeBudgetMs: 45_000 });
    }
    res.json({ ok: true, lifecycle, enrollment, delivery });
  } catch (err) { fail(res, err); }
};

// ── Ciclo de vida ───────────────────────────────────────────────────────────
export const getLifecycleBoard = async (req, res) => {
  try {
    await ensureAutomationSchema();
    const scope = scopeSiteFilter(req);
    if (!scope.all && !scope.siteIds.length) return res.json({ counts: [], sites: [], states: LIFECYCLE_STATES });

    const params = [];
    let where = '';
    if (!scope.all) { params.push(scope.siteIds); where = `WHERE ls."siteId" = ANY($1)`; }
    if (req.query.state && isLifecycleKey(req.query.state)) {
      params.push(req.query.state);
      where += `${where ? ' AND' : 'WHERE'} ls.state = $${params.length}`;
    }

    const [counts, sites] = await Promise.all([
      db.query(`SELECT state, COUNT(*)::int AS n FROM "CrmLifecycleState" ls ${where} GROUP BY state`, params),
      db.query(
        `SELECT ls.*, COALESCE(c.name, d.name) AS "siteName",
                (SELECT COUNT(*)::int FROM "WhatsAppContact" wc WHERE wc."siteId" = ls."siteId") AS "contactCount"
         FROM "CrmLifecycleState" ls
         LEFT JOIN "Club" c ON c.id = ls."siteId"
         LEFT JOIN "District" d ON d.id = ls."siteId"
         ${where}
         ORDER BY ls."updatedAt" DESC LIMIT 500`,
        params
      ),
    ]);

    res.json({
      states: LIFECYCLE_STATES,
      counts: LIFECYCLE_KEYS.map(k => ({
        state: k, label: lifecycleLabel(k),
        n: counts.rows.find(r => r.state === k)?.n || 0,
      })),
      sites: sites.rows,
    });
  } catch (err) { fail(res, err); }
};

export const setLifecycleManual = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const state = req.body?.state || null;
    if (state && !isLifecycleKey(state)) return res.status(400).json({ error: 'Estado desconocido.' });
    const row = await setManualLifecycleState(req.params.siteId, state, { siteType: req.body?.siteType || 'club' });
    res.json(row);
  } catch (err) { fail(res, err); }
};

export const syncLifecycle = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const summary = await runLifecycleSweep({ now: new Date() });
    res.json({ ok: true, ...summary });
  } catch (err) { fail(res, err); }
};

// ── Segmentos ───────────────────────────────────────────────────────────────
export const previewSegment = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    const audience = req.body?.audience || {};
    const errors = validateAudience(audience);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const [count, sample] = await Promise.all([
      countAudience(clubId, audience),
      resolveAudience(clubId, audience, { limit: 25 }),
    ]);
    res.json({
      ...count,
      sample: sample.contacts.map(c => ({
        id: c.id, name: c.name, phone: c.phone, orgRole: c.orgRole,
        siteId: c.siteId, lifecycleState: c.lifecycleState, consentState: c.consentState,
      })),
      // Una regla descartada ENSANCHA la audiencia, así que se devuelve para
      // que la vista previa la muestre en vez de dar un número tranquilizador.
      skipped: count.skipped,
    });
  } catch (err) { fail(res, err); }
};

// ── Alertas ─────────────────────────────────────────────────────────────────
export const getAlerts = async (req, res) => {
  try {
    await ensureAutomationSchema();
    const scope = scopeSiteFilter(req);
    const params = [];
    let where = `WHERE "resolvedAt" IS NULL`;
    if (!scope.all) {
      if (!scope.siteIds.length) return res.json([]);
      params.push(scope.siteIds);
      where += ` AND "siteId" = ANY($1)`;
    }
    const r = await db.query(`SELECT * FROM "CrmAlert" ${where} ORDER BY "createdAt" DESC LIMIT 200`, params);
    res.json(r.rows);
  } catch (err) { fail(res, err); }
};

export const resolveAlert = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const r = await db.query(
      `UPDATE "CrmAlert" SET "resolvedAt"=NOW() WHERE id=$1 AND "resolvedAt" IS NULL RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'La alerta no existe o ya estaba resuelta.' });
    res.json(r.rows[0]);
  } catch (err) { fail(res, err); }
};

// ── Consentimiento y exclusión ──────────────────────────────────────────────
export const getSuppressions = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    res.json(await listSuppressions(clubId));
  } catch (err) { fail(res, err); }
};

export const addSuppression = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    if (!req.body?.phone) return res.status(400).json({ error: 'Falta el número.' });
    await suppressContact({
      clubId, phone: req.body.phone, email: req.body.email || null,
      reason: req.body.reason || 'opt_out', source: 'manual', note: req.body.note || null,
    });
    res.status(201).json({ ok: true });
  } catch (err) { fail(res, err); }
};

export const removeSuppression = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const clubId = await tenant();
    await unsuppressContact({ clubId, phone: req.params.phone });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
};

// ── Configuración global ────────────────────────────────────────────────────
export const getSettings = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    res.json(await getAutomationSettings({ fresh: true }));
  } catch (err) { fail(res, err); }
};

export const updateSettings = async (req, res) => {
  try {
    if (denyIfNotOperator(req, res)) return;
    const b = req.body || {};
    const patch = {};
    const int = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; };

    if (b.timezone) patch.timezone = String(b.timezone);
    if (int(b.sendWindowStartMin) !== null) patch.sendWindowStartMin = int(b.sendWindowStartMin);
    if (int(b.sendWindowEndMin) !== null) patch.sendWindowEndMin = int(b.sendWindowEndMin);
    if (Array.isArray(b.sendWeekdays)) patch.sendWeekdays = b.sendWeekdays.map(Number).filter(d => d >= 0 && d <= 6);
    if (int(b.maxPerContactPerWindow) !== null) patch.maxPerContactPerWindow = int(b.maxPerContactPerWindow);
    if (int(b.frequencyWindowDays) !== null) patch.frequencyWindowDays = int(b.frequencyWindowDays);
    if (int(b.sameTemplateCooldownDays) !== null) patch.sameTemplateCooldownDays = int(b.sameTemplateCooldownDays);
    if (int(b.maxSendAttempts) !== null) patch.maxSendAttempts = int(b.maxSendAttempts);
    if (Array.isArray(b.requireExplicitConsentFor)) patch.requireExplicitConsentFor = b.requireExplicitConsentFor.map(String);
    if (b.links && typeof b.links === 'object') patch.links = b.links;

    if (patch.sendWindowStartMin !== undefined && patch.sendWindowEndMin !== undefined
        && patch.sendWindowStartMin >= patch.sendWindowEndMin) {
      return res.status(400).json({ error: 'La ventana de envío tiene que empezar antes de terminar.' });
    }

    res.json(await saveAutomationSettings(patch));
  } catch (err) { fail(res, err); }
};

// ── Panel ───────────────────────────────────────────────────────────────────
export const getAutomationOverview = async (req, res) => {
  try {
    await ensureAutomationSchema();
    const scope = scopeSiteFilter(req);
    const clubId = await resolvePlatformClubId();
    if (!clubId) return res.json({ configured: false });

    const siteWhere = scope.all ? '' : `AND l."contactId" IN (SELECT id FROM "WhatsAppContact" WHERE "siteId" = ANY($2))`;
    const params = scope.all ? [clubId] : [clubId, scope.siteIds];
    if (!scope.all && !scope.siteIds.length) return res.json({ configured: true, restricted: true, messages: [], journeys: [] });

    const [messages, journeys, runs, alerts] = await Promise.all([
      db.query(
        `SELECT status, COUNT(*)::int AS n FROM "WhatsAppMessageLog" l
         WHERE l."clubId"=$1 AND l."journeyId" IS NOT NULL AND l."createdAt" > NOW() - INTERVAL '30 days' ${siteWhere}
         GROUP BY status`, params),
      scope.all
        ? db.query(
            `SELECT j.id, j.name, j.status,
                    COUNT(l.id) FILTER (WHERE l.status IN ('sent','delivered','read'))::int AS sent,
                    COUNT(l.id) FILTER (WHERE l."readAt" IS NOT NULL)::int AS read,
                    COUNT(l.id) FILTER (WHERE l.status='failed')::int AS failed
             FROM "CrmJourney" j
             LEFT JOIN "WhatsAppMessageLog" l ON l."journeyId"=j.id AND l."createdAt" > NOW() - INTERVAL '30 days'
             WHERE j."clubId"=$1 GROUP BY j.id, j.name, j.status ORDER BY sent DESC`, [clubId])
        : Promise.resolve({ rows: [] }),
      scope.all
        ? db.query(`SELECT status, COUNT(*)::int AS n FROM "CrmJourneyRun" WHERE "clubId"=$1 GROUP BY status`, [clubId])
        : Promise.resolve({ rows: [] }),
      db.query(`SELECT COUNT(*)::int AS n FROM "CrmAlert" WHERE "clubId"=$1 AND "resolvedAt" IS NULL`, [clubId]),
    ]);

    res.json({
      configured: true,
      restricted: !scope.all,
      messages: messages.rows,
      journeys: journeys.rows,
      runs: runs.rows,
      openAlerts: alerts.rows[0]?.n || 0,
    });
  } catch (err) { fail(res, err); }
};

export default {
  getCatalog, getJourneys, getJourneyDetail, createJourney, updateJourney,
  setJourneyStatus, deleteJourney, getJourneyRuns, getRunTrace, enrollInJourney, runTickNow,
  getLifecycleBoard, setLifecycleManual, syncLifecycle, previewSegment,
  getAlerts, resolveAlert, getSuppressions, addSuppression, removeSuppression,
  getSettings, updateSettings, getAutomationOverview,
};
