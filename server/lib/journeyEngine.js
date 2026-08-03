// Motor de recorridos automatizados del WhatsApp CRM.
//
// Dos trabajos, que corren en el mismo tick del cron:
//
//   1. INSCRIBIR — leer los eventos pendientes y, por cada recorrido cuyo
//      disparador coincida, meter a los contactos que correspondan.
//   2. AVANZAR   — tomar las inscripciones vencidas y caminar el grafo hasta
//      toparse con una espera, una salida o el presupuesto de tiempo.
//
// POR QUÉ UN CRON Y NO UNA COLA: en Vercel la función se congela al cerrar la
// respuesta, así que un trabajador persistente exigiría infraestructura aparte.
// Es la misma decisión —y el mismo patrón de UPDATE condicional— que el Creador
// de Reels documenta en CLAUDE.md. Los tres caminos que pueden mover una
// inscripción (el cron, el webhook de Meta y el panel) llaman a las MISMAS
// funciones, y el bloqueo por fila es lo que impide que hagan el trabajo dos
// veces.
import crypto from 'crypto';
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { takePendingEvents, markEventsProcessed } from './crmEventBus.js';
import { resolvePlatformClubId } from './crmTenant.js';
import { resolveAudience, buildAudienceSql } from './crmSegments.js';
import { evaluateSend, getAutomationSettings } from './crmGuardrails.js';
import { sendTemplate, getWhatsAppConfig } from './whatsappSender.js';
import { lifecycleLabel } from './lifecycleSpec.js';
import {
  validateJourney, nodeById, entryNodeId, waitMs, resolveVariables,
} from './journeySpec.js';

// Tope de nodos que una inscripción puede recorrer en un solo tick. Existe como
// red contra un grafo con un ciclo que la validación no atrapó: sin él, una
// inscripción sola consumiría el presupuesto entero del cron.
const MAX_NODES_PER_TICK = 25;
// Una inscripción bloqueada más de esto se da por abandonada (la función murió a
// mitad) y otro tick puede retomarla.
const LOCK_TIMEOUT_MS = 5 * 60_000;

// ── Carga de recorridos ─────────────────────────────────────────────────────
export async function listJourneys(clubId, { status = null } = {}) {
  await ensureAutomationSchema();
  const params = [clubId];
  let sql = `SELECT * FROM "CrmJourney" WHERE "clubId"=$1`;
  if (status) { sql += ` AND status=$2`; params.push(status); }
  sql += ` ORDER BY "createdAt" ASC`;
  const r = await db.query(sql, params);
  return r.rows;
}

export async function getJourney(clubId, id) {
  await ensureAutomationSchema();
  const r = await db.query(`SELECT * FROM "CrmJourney" WHERE "clubId"=$1 AND (id=$2 OR key=$2) LIMIT 1`, [clubId, id]);
  return r.rows[0] || null;
}

// ── Inscripción ─────────────────────────────────────────────────────────────
function triggerMatches(journey, event) {
  const t = journey.trigger || {};
  if (!t.type || t.type !== event.type) return false;
  // Un disparador de ciclo de vida puede acotarse a un estado concreto; sin
  // `state` vale cualquier transición.
  if (t.state) {
    const payload = event.payload || {};
    if (payload.state !== t.state) return false;
  }
  if (t.siteTypes?.length && !t.siteTypes.includes(event.siteType || 'club')) return false;
  return true;
}

function runDedupeKey(journey, event, contactId) {
  const policy = journey.settings?.reentry || 'per_event';
  if (policy === 'always') return null;                       // se puede reinscribir sin límite
  if (policy === 'once') return `${journey.id}:${contactId}`; // una sola vez en la vida
  return `${journey.id}:${contactId}:${event.dedupeKey || event.id}`;
}

/**
 * Lee los eventos pendientes y crea las inscripciones que correspondan.
 *
 * Un evento se marca procesado aunque no haya inscrito a nadie: "ningún
 * recorrido escucha esto" es un resultado, no un pendiente. Dejarlo sin marcar
 * lo haría reevaluar en cada tick para siempre.
 */
export async function enrollFromEvents({ clubId, limit = 200, now = new Date() } = {}) {
  await ensureAutomationSchema();
  const tenant = clubId || await resolvePlatformClubId();
  if (!tenant) return { events: 0, enrolled: 0, reason: 'sin_cuenta_whatsapp' };

  const [events, journeys] = await Promise.all([
    takePendingEvents(limit),
    listJourneys(tenant, { status: 'active' }),
  ]);
  if (!events.length) return { events: 0, enrolled: 0 };

  let enrolled = 0;
  const processedIds = [];

  for (const event of events) {
    processedIds.push(event.id);
    const matching = journeys.filter(j => triggerMatches(j, event));
    if (!matching.length) continue;

    for (const journey of matching) {
      // La audiencia se acota al sitio del evento salvo que el recorrido diga lo
      // contrario. Es lo que hace que "venció el club A" le escriba a los
      // dirigentes del club A y no a los de los trescientos clubes que cumplen
      // el resto del filtro.
      const audience = { ...(journey.audience || {}) };
      if (event.siteId && journey.audience?.scopeToEventSite !== false) {
        audience.rules = [...(audience.rules || []), { field: 'siteId', op: 'eq', value: event.siteId }];
        audience.match = 'all';
      }

      const { contacts } = await resolveAudience(tenant, audience, { limit: 500 });
      for (const contact of contacts) {
        const dedupeKey = runDedupeKey(journey, event, contact.id);
        const r = await db.query(
          `INSERT INTO "CrmJourneyRun"
             (id,"journeyId","clubId","siteId","siteType","contactId",status,"currentNodeId","waitUntil",context,"dedupeKey","enrolledAt")
           VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9::jsonb,$10,$8)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            crypto.randomUUID(), journey.id, tenant,
            contact.siteId || event.siteId || null, contact.siteType || event.siteType || 'club',
            contact.id, entryNodeId(journey), now,
            JSON.stringify({ triggerEventId: event.id, triggerType: event.type, triggerPayload: event.payload || {} }),
            dedupeKey,
          ]
        );
        if (r.rows.length) enrolled++;
      }
    }
  }

  await markEventsProcessed(processedIds);
  return { events: events.length, enrolled };
}

// ── Evaluación de condiciones ───────────────────────────────────────────────
async function matchesAudience(clubId, contactId, audience) {
  const built = buildAudienceSql(audience || {}, { startIndex: 3 });
  const params = [clubId, contactId, ...built.params];
  const r = await db.query(
    `SELECT 1 FROM "WhatsAppContact" c
     LEFT JOIN "CrmLifecycleState" ls ON ls."siteId" = c."siteId"
     WHERE c."clubId"=$1 AND c.id=$2 ${built.where ? `AND (${built.where})` : ''}
     LIMIT 1`,
    params
  );
  return r.rows.length > 0;
}

async function evaluateCondition(condition, ctx) {
  const { run, contact, clubId } = ctx;
  const kind = condition?.kind;

  if (kind === 'audience') {
    return matchesAudience(clubId, contact.id, condition.audience);
  }

  if (kind === 'message') {
    // Qué pasó con un mensaje que ESTE recorrido mandó. `on` puede nombrar un
    // nodo concreto; sin él se mira el último envío de la inscripción.
    const params = [run.id];
    let sql = `SELECT l.* FROM "WhatsAppMessageLog" l WHERE l."journeyRunId"=$1 AND l.direction='outgoing'`;
    if (condition.on && condition.on !== 'last_send') {
      const stepR = await db.query(
        `SELECT "messageLogId" FROM "CrmJourneyStep"
         WHERE "runId"=$1 AND "nodeId"=$2 AND "messageLogId" IS NOT NULL
         ORDER BY "createdAt" DESC LIMIT 1`,
        [run.id, condition.on]
      );
      if (!stepR.rows.length) return false;
      sql += ` AND l.id=$2`;
      params.push(stepR.rows[0].messageLogId);
    }
    sql += ` ORDER BY l."createdAt" DESC LIMIT 1`;
    const r = await db.query(sql, params);
    if (!r.rows.length) return false;
    const log = r.rows[0];

    if (condition.is === 'replied') {
      // No hay campo "respondió": se mira si entró un mensaje de ese contacto
      // DESPUÉS del envío. Es también la única forma de observar un botón de
      // respuesta rápida, que llega como mensaje entrante.
      const since = log.sentAt || log.createdAt;
      const params2 = [contact.id, since];
      let sql2 = `SELECT 1 FROM "WhatsAppMessageLog"
                  WHERE "contactId"=$1 AND direction='incoming' AND "createdAt" > $2`;
      if (condition.withinHours) {
        sql2 += ` AND "createdAt" <= $3`;
        params2.push(new Date(new Date(since).getTime() + Number(condition.withinHours) * 3_600_000));
      }
      const rep = await db.query(sql2 + ' LIMIT 1', params2);
      return rep.rows.length > 0;
    }

    if (condition.is === 'read')      return !!log.readAt;
    if (condition.is === 'delivered') return !!(log.deliveredAt || log.readAt);
    if (condition.is === 'failed')    return log.status === 'failed';
    return false;
  }

  if (kind === 'event') {
    const since = condition.withinDays
      ? new Date(Date.now() - Number(condition.withinDays) * 86_400_000)
      : run.enrolledAt;
    const r = await db.query(
      `SELECT 1 FROM "CrmEvent" WHERE "siteId"=$1 AND type=$2 AND "occurredAt" > $3 LIMIT 1`,
      [run.siteId, condition.eventType, since]
    );
    return r.rows.length > 0;
  }

  return false;
}

/**
 * ¿Esta inscripción tiene que salirse antes de ejecutar el nodo?
 *
 * Es lo que impide los envíos que el pedido nombra como inaceptables: recordarle
 * la renovación a quien ya renovó, o el onboarding a quien ya lo completó. La
 * salida se evalúa ANTES DE CADA NODO y no sólo al inscribir, porque un
 * recorrido de renovación dura 75 días y el club renueva en medio.
 */
async function shouldExit(journey, ctx) {
  const settings = journey.settings || {};

  if (Array.isArray(settings.exitOnEvents) && settings.exitOnEvents.length) {
    for (const eventType of settings.exitOnEvents) {
      if (await evaluateCondition({ kind: 'event', eventType }, ctx)) {
        return { exit: true, reason: `evento:${eventType}` };
      }
    }
  }
  if (settings.exitWhen?.rules?.length) {
    if (await matchesAudience(ctx.clubId, ctx.contact.id, settings.exitWhen)) {
      return { exit: true, reason: 'condicion_de_salida' };
    }
  }
  return { exit: false };
}

// ── Ejecución ───────────────────────────────────────────────────────────────
async function recordStep(run, journey, node, outcome, detail = {}, messageLogId = null) {
  await db.query(
    `INSERT INTO "CrmJourneyStep" (id,"runId","journeyId","nodeId","nodeType",outcome,detail,"messageLogId")
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [crypto.randomUUID(), run.id, journey.id, node?.id || null, node?.type || null,
     outcome, JSON.stringify(detail || {}), messageLogId]
  );
}

async function finishRun(run, status, exitReason) {
  await db.query(
    `UPDATE "CrmJourneyRun"
     SET status=$1,"exitReason"=$2,"completedAt"=NOW(),"lockedAt"=NULL,"waitUntil"=NULL,"updatedAt"=NOW()
     WHERE id=$3`,
    [status, exitReason || null, run.id]
  );
}

async function parkRun(run, nodeId, waitUntil, note) {
  await db.query(
    `UPDATE "CrmJourneyRun"
     SET "currentNodeId"=$1,"waitUntil"=$2,"lockedAt"=NULL,"lastError"=$3,"updatedAt"=NOW()
     WHERE id=$4`,
    [nodeId, waitUntil, note || null, run.id]
  );
}

async function raiseAlert({ clubId, type, severity = 'warning', title, detail, siteId, entityId, dedupeKey }) {
  await db.query(
    `INSERT INTO "CrmAlert" (id,"clubId",type,severity,title,detail,"siteId","entityId","dedupeKey")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT DO NOTHING`,
    [crypto.randomUUID(), clubId, type, severity, title, detail || null, siteId || null, entityId || null, dedupeKey || null]
  );
}

async function loadRunContext(run, clubId) {
  const [contactR, stateR] = await Promise.all([
    db.query(`SELECT * FROM "WhatsAppContact" WHERE id=$1 LIMIT 1`, [run.contactId]),
    run.siteId
      ? db.query(`SELECT * FROM "CrmLifecycleState" WHERE "siteId"=$1 LIMIT 1`, [run.siteId])
      : Promise.resolve({ rows: [] }),
  ]);
  const contact = contactR.rows[0] || null;
  const lifecycleRow = stateR.rows[0] || null;
  return {
    run, clubId, contact,
    signals: lifecycleRow?.signals || {},
    lifecycle: lifecycleRow ? { state: lifecycleRow.state, label: lifecycleLabel(lifecycleRow.state) } : null,
  };
}

/**
 * Ejecuta una inscripción hasta que se topa con una espera, una salida o el tope
 * de nodos. Devuelve un resumen del tick.
 */
async function runOne(run, journey, { settings, now }) {
  const clubId = run.clubId;
  const ctx = await loadRunContext(run, clubId);

  if (!ctx.contact) {
    await recordStep(run, journey, null, 'failed', { error: 'El contacto ya no existe' });
    await finishRun(run, 'cancelled', 'contacto_inexistente');
    return { nodes: 0, sent: 0, ended: true };
  }

  let nodeId = run.currentNodeId || entryNodeId(journey);
  let sent = 0, visited = 0;

  while (nodeId && visited < MAX_NODES_PER_TICK) {
    const exit = await shouldExit(journey, ctx);
    if (exit.exit) {
      await recordStep(run, journey, nodeById(journey, nodeId), 'exited', { reason: exit.reason });
      await finishRun(run, 'completed', exit.reason);
      return { nodes: visited, sent, ended: true };
    }

    const node = nodeById(journey, nodeId);
    if (!node) {
      await recordStep(run, journey, null, 'failed', { error: `El paso "${nodeId}" no existe` });
      await finishRun(run, 'failed', 'paso_inexistente');
      return { nodes: visited, sent, ended: true };
    }
    visited++;

    // ── esperar ────────────────────────────────────────────────────────────
    if (node.type === 'wait') {
      const until = new Date(now.getTime() + waitMs(node));
      await recordStep(run, journey, node, 'waiting', { until });
      await parkRun(run, node.next || null, until, null);
      if (!node.next) await finishRun(run, 'completed', 'fin_del_recorrido');
      return { nodes: visited, sent, ended: !node.next };
    }

    // ── condición ──────────────────────────────────────────────────────────
    if (node.type === 'condition') {
      let result = false;
      try { result = await evaluateCondition(node.condition, ctx); }
      catch (err) {
        // Una condición que no se puede evaluar toma la rama negativa. Es la
        // opción conservadora: la rama positiva suele ser "ya hizo lo que
        // queríamos, no le insistas", y darla por buena sin poder comprobarlo
        // dejaría al club sin el mensaje.
        await recordStep(run, journey, node, 'error', { error: err.message, assumed: false });
      }
      await recordStep(run, journey, node, 'evaluated', { result });
      nodeId = result ? node.nextTrue : node.nextFalse;
      if (!nodeId) { await finishRun(run, 'completed', result ? 'rama_si_sin_continuacion' : 'rama_no_sin_continuacion'); return { nodes: visited, sent, ended: true }; }
      continue;
    }

    // ── etiquetar ──────────────────────────────────────────────────────────
    if (node.type === 'tag') {
      const add = (node.add || []).filter(Boolean);
      const remove = (node.remove || []).filter(Boolean);
      if (add.length || remove.length) {
        await db.query(
          `UPDATE "WhatsAppContact"
           SET tags = ARRAY(
                 SELECT DISTINCT t FROM unnest(COALESCE(tags,ARRAY[]::text[]) || $1::text[]) AS t
                 WHERE NOT (t = ANY($2::text[]))
               ),
               "updatedAt"=NOW()
           WHERE id=$3`,
          [add, remove, ctx.contact.id]
        );
      }
      await recordStep(run, journey, node, 'tagged', { add, remove });
      nodeId = node.next;
      if (!nodeId) { await finishRun(run, 'completed', 'fin_del_recorrido'); return { nodes: visited, sent, ended: true }; }
      continue;
    }

    // ── alerta interna ─────────────────────────────────────────────────────
    if (node.type === 'alert') {
      await raiseAlert({
        clubId, type: 'journey', severity: node.severity || 'warning',
        title: node.title || `Seguimiento manual: ${journey.name}`,
        detail: node.detail || null,
        siteId: run.siteId, entityId: run.id,
        dedupeKey: `journey_alert:${run.id}:${node.id}`,
      });
      await recordStep(run, journey, node, 'alerted', { severity: node.severity || 'warning' });
      nodeId = node.next;
      if (!nodeId) { await finishRun(run, 'completed', 'fin_del_recorrido'); return { nodes: visited, sent, ended: true }; }
      continue;
    }

    // ── salir ──────────────────────────────────────────────────────────────
    if (node.type === 'exit') {
      await recordStep(run, journey, node, 'exited', { reason: node.reason || null, goalReached: !!node.goalReached });
      await finishRun(run, 'completed', node.reason || 'fin_del_recorrido');
      return { nodes: visited, sent, ended: true };
    }

    // ── enviar plantilla ───────────────────────────────────────────────────
    if (node.type === 'send_template') {
      const tplR = await db.query(
        `SELECT * FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2 LIMIT 1`,
        [node.templateId, clubId]
      );
      const template = tplR.rows[0];

      if (!template) {
        await recordStep(run, journey, node, 'failed', { error: 'La plantilla ya no existe' });
        await raiseAlert({
          clubId, type: 'template_missing', severity: 'error',
          title: `El recorrido "${journey.name}" apunta a una plantilla que no existe`,
          detail: `Paso "${node.id}". El recorrido quedó pausado.`,
          entityId: journey.id, dedupeKey: `template_missing:${journey.id}:${node.id}`,
        });
        await db.query(`UPDATE "CrmJourney" SET status='paused',"updatedAt"=NOW() WHERE id=$1`, [journey.id]);
        await finishRun(run, 'failed', 'plantilla_inexistente');
        return { nodes: visited, sent, ended: true };
      }

      if (String(template.status).toLowerCase() !== 'approved') {
        // Meta rechaza una plantilla no aprobada. Se APLAZA en vez de descartar:
        // una plantilla en revisión suele aprobarse en horas y el mensaje sigue
        // teniendo sentido cuando eso pase.
        const retryAt = new Date(now.getTime() + 6 * 3_600_000);
        await recordStep(run, journey, node, 'deferred', { reason: 'plantilla_no_aprobada', status: template.status, retryAt });
        await raiseAlert({
          clubId, type: 'template_not_approved', severity: 'warning',
          title: `Plantilla sin aprobar en "${journey.name}"`,
          detail: `"${template.name}" está en estado "${template.status}".`,
          entityId: journey.id, dedupeKey: `template_not_approved:${journey.id}:${template.id}`,
        });
        await parkRun(run, node.id, retryAt, 'plantilla_no_aprobada');
        return { nodes: visited, sent, ended: false };
      }

      // Variables. Un hueco sin resolver NO se manda: Meta rechaza el parámetro
      // vacío y, aunque lo aceptara, un "tu sitio vence el " es peor que nada.
      const { values, missing } = resolveVariables(node.variables || [], {
        contact: ctx.contact,
        signals: { ...ctx.signals, siteType: run.siteType },
        lifecycle: ctx.lifecycle,
        links: settings.links || {},
        timeZone: settings.timezone,
      });
      if (missing.length) {
        await recordStep(run, journey, node, 'skipped', { reason: 'variables_sin_resolver', missing });
        await raiseAlert({
          clubId, type: 'variables_missing', severity: 'warning',
          title: `Faltan datos para "${journey.name}"`,
          detail: `No se pudo resolver: ${missing.join(', ')}. El contacto no recibió ese mensaje.`,
          siteId: run.siteId, entityId: run.id,
          dedupeKey: `variables_missing:${journey.id}:${node.id}:${run.siteId || run.contactId}`,
        });
        nodeId = node.next;
        if (!nodeId) { await finishRun(run, 'completed', 'fin_del_recorrido'); return { nodes: visited, sent, ended: true }; }
        continue;
      }

      const verdict = await evaluateSend(ctx.contact, template, {
        clubId, now, settings,
        timeZone: settings.timezone,
        ignoreFrequency: !!node.ignoreFrequency,
      });

      if (verdict.decision === 'defer') {
        await recordStep(run, journey, node, 'deferred', { reason: verdict.reason, detail: verdict.detail, retryAt: verdict.retryAt });
        await parkRun(run, node.id, verdict.retryAt, verdict.reason);
        return { nodes: visited, sent, ended: false };
      }
      if (verdict.decision === 'skip') {
        await recordStep(run, journey, node, 'skipped', { reason: verdict.reason, detail: verdict.detail });
        // Una baja o una exclusión terminan el recorrido entero: seguir con los
        // pasos siguientes sería insistirle a quien ya dijo que no.
        if (['opted_out', 'suppressed', 'consent_denied', 'invalid_phone', 'contact_archived'].includes(verdict.reason)) {
          await finishRun(run, 'cancelled', verdict.reason);
          return { nodes: visited, sent, ended: true };
        }
        nodeId = node.next;
        if (!nodeId) { await finishRun(run, 'completed', 'fin_del_recorrido'); return { nodes: visited, sent, ended: true }; }
        continue;
      }

      try {
        const res = await sendTemplate({
          clubId, contact: ctx.contact, template, variables: values,
          journeyId: journey.id, journeyRunId: run.id,
        });
        sent++;
        await recordStep(run, journey, node, 'sent', { templateName: template.name, variables: values }, res.logId);
      } catch (err) {
        const attempts = (run.attempts || 0) + 1;
        await db.query(`UPDATE "CrmJourneyRun" SET attempts=$1 WHERE id=$2`, [attempts, run.id]);
        await recordStep(run, journey, node, 'failed', { error: err.message, attempts }, err.logId || null);

        if (attempts >= (settings.maxSendAttempts || 3)) {
          await raiseAlert({
            clubId, type: 'journey_send_failed', severity: 'error',
            title: `Envío fallido en "${journey.name}"`,
            detail: `${err.message} (${attempts} intentos). La inscripción se marcó como fallida.`,
            siteId: run.siteId, entityId: run.id,
            dedupeKey: `journey_send_failed:${run.id}:${node.id}`,
          });
          await finishRun(run, 'failed', `envio_fallido:${err.message}`.slice(0, 200));
          return { nodes: visited, sent, ended: true };
        }
        // Reintento con espera creciente: un fallo de la API de Meta suele ser
        // transitorio (límite de tasa, corte momentáneo).
        const retryAt = new Date(now.getTime() + attempts * 15 * 60_000);
        await parkRun(run, node.id, retryAt, err.message);
        return { nodes: visited, sent, ended: false };
      }

      nodeId = node.next;
      if (!nodeId) { await finishRun(run, 'completed', 'fin_del_recorrido'); return { nodes: visited, sent, ended: true }; }
      continue;
    }

    // Tipo desconocido: se detiene y se dice. Seguir de largo dejaría un
    // recorrido que "funciona" salteándose pasos.
    await recordStep(run, journey, node, 'failed', { error: `Tipo de paso desconocido: ${node.type}` });
    await finishRun(run, 'failed', 'paso_desconocido');
    return { nodes: visited, sent, ended: true };
  }

  // Se agotó el tope de nodos sin llegar a una espera: se reprograma para el
  // tick siguiente en vez de girar acá.
  await parkRun(run, nodeId, new Date(now.getTime() + 60_000), 'tope_de_pasos_por_vuelta');
  return { nodes: visited, sent, ended: false };
}

/**
 * Avanza las inscripciones vencidas.
 *
 * El `timeBudgetMs` está por debajo de los 120 s de `vercel.json`: lo que no
 * entra en esta vuelta espera al minuto siguiente. No se pierde nada — la
 * condición de "vencida" sigue siendo verdadera.
 */
export async function advanceRuns({ clubId, timeBudgetMs = 60_000, now = new Date(), limit = 200 } = {}) {
  await ensureAutomationSchema();
  const tenant = clubId || await resolvePlatformClubId();
  if (!tenant) return { processed: 0, sent: 0, reason: 'sin_cuenta_whatsapp' };

  const settings = await getAutomationSettings();
  const config = await getWhatsAppConfig(tenant);
  if (!config || config.enabled === false) {
    return { processed: 0, sent: 0, reason: 'whatsapp_deshabilitado' };
  }

  const dueR = await db.query(
    `SELECT * FROM "CrmJourneyRun"
     WHERE "clubId"=$1 AND status='active'
       AND ("waitUntil" IS NULL OR "waitUntil" <= $2)
       AND ("lockedAt" IS NULL OR "lockedAt" < $3)
     ORDER BY "waitUntil" ASC NULLS FIRST
     LIMIT $4`,
    [tenant, now, new Date(now.getTime() - LOCK_TIMEOUT_MS), limit]
  );

  const journeyCache = new Map();
  const started = Date.now();
  let processed = 0, sent = 0, skippedLocked = 0;

  for (const row of dueR.rows) {
    if (Date.now() - started > timeBudgetMs) break;

    // Bloqueo por UPDATE condicional: si otro tick (o el webhook) ya la tomó,
    // esta pasada no la toca. Es lo que impide el doble envío.
    const lock = await db.query(
      `UPDATE "CrmJourneyRun" SET "lockedAt"=$1,"updatedAt"=$1
       WHERE id=$2 AND status='active' AND ("lockedAt" IS NULL OR "lockedAt" < $3)
       RETURNING *`,
      [now, row.id, new Date(now.getTime() - LOCK_TIMEOUT_MS)]
    );
    if (!lock.rows.length) { skippedLocked++; continue; }
    const run = lock.rows[0];

    let journey = journeyCache.get(run.journeyId);
    if (!journey) {
      const jr = await db.query(`SELECT * FROM "CrmJourney" WHERE id=$1 LIMIT 1`, [run.journeyId]);
      journey = jr.rows[0] || null;
      journeyCache.set(run.journeyId, journey);
    }
    if (!journey || journey.status !== 'active') {
      // El recorrido se pausó o se borró mientras esta inscripción esperaba. No
      // se cancela: se deja parada para que reanudarlo la retome donde estaba.
      await db.query(`UPDATE "CrmJourneyRun" SET "lockedAt"=NULL,"waitUntil"=$1,"updatedAt"=NOW() WHERE id=$2`,
        [new Date(now.getTime() + 3_600_000), run.id]);
      continue;
    }

    try {
      const res = await runOne(run, journey, { settings, now });
      processed++; sent += res.sent;
    } catch (err) {
      await db.query(
        `UPDATE "CrmJourneyRun" SET "lockedAt"=NULL,"lastError"=$1,"waitUntil"=$2,"updatedAt"=NOW() WHERE id=$3`,
        [String(err.message).slice(0, 500), new Date(now.getTime() + 10 * 60_000), run.id]
      ).catch(() => {});
    }
  }

  return { processed, sent, due: dueR.rows.length, skippedLocked };
}

/** Inscribe a mano — lo usa el panel para probar un recorrido. */
export async function enrollContact({ clubId, journeyId, contactId, now = new Date() }) {
  await ensureAutomationSchema();
  const [jr, cr] = await Promise.all([
    db.query(`SELECT * FROM "CrmJourney" WHERE id=$1 AND "clubId"=$2 LIMIT 1`, [journeyId, clubId]),
    db.query(`SELECT * FROM "WhatsAppContact" WHERE id=$1 AND "clubId"=$2 LIMIT 1`, [contactId, clubId]),
  ]);
  const journey = jr.rows[0];
  const contact = cr.rows[0];
  if (!journey) throw new Error('El recorrido no existe');
  if (!contact) throw new Error('El contacto no existe');

  const errors = validateJourney(journey);
  if (errors.length) throw new Error(`El recorrido tiene errores: ${errors.join(' ')}`);

  const r = await db.query(
    `INSERT INTO "CrmJourneyRun"
       (id,"journeyId","clubId","siteId","siteType","contactId",status,"currentNodeId","waitUntil",context,"dedupeKey","enrolledAt")
     VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9::jsonb,$10,$8)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [crypto.randomUUID(), journey.id, clubId, contact.siteId, contact.siteType || 'club', contact.id,
     entryNodeId(journey), now, JSON.stringify({ manual: true }), `${journey.id}:${contact.id}:manual:${now.toISOString()}`]
  );
  return r.rows[0] || null;
}

export default { enrollFromEvents, advanceRuns, enrollContact, listJourneys, getJourney };
