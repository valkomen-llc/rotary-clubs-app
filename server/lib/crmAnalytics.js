// Analítica del WhatsApp CRM.
//
// LA REGLA DE ESTE ARCHIVO: una conversión se DERIVA de un hecho observable, no
// se declara. El pedido pide medir «renovaciones generadas» y «capacitaciones
// agendadas», y la tentación es poner un contador que alguien incremente al
// mandar el mensaje. Eso mide envíos, no resultados.
//
// Acá una conversión es la coincidencia de dos cosas que ya existen por
// separado: un mensaje que salió (`WhatsAppMessageLog`, con su recorrido) y un
// evento del sistema que ocurrió DESPUÉS, para el MISMO sitio, dentro de una
// ventana (`CrmEvent`). Si el club renovó tres días después de recibir el aviso,
// eso cuenta; si renovó dos semanas antes, no.
//
// ES ATRIBUCIÓN, NO CAUSALIDAD, y la UI tiene que decirlo. Un club pudo renovar
// por su cuenta. Lo que el número responde es «de los que recibieron esto,
// cuántos hicieron aquello después», que es una pregunta útil y honesta. Llamarlo
// «renovaciones generadas por la campaña» sería atribuirse un mérito que este
// dato no demuestra.
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { lifecycleLabel } from './lifecycleSpec.js';
import { intentLabel } from './crmIntents.js';

// Ventana de atribución por defecto: dentro de cuántos días de recibir el
// mensaje cuenta el evento posterior.
const ATTRIBUTION_DAYS = (() => {
  const n = Number(process.env.CRM_ATTRIBUTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 14;
})();

// Qué evento cuenta como conversión de qué. Catálogo cerrado y explícito: si
// mañana se quiere medir otra cosa, se agrega acá y se ve en el panel qué se
// está contando.
export const CONVERSIONS = [
  { key: 'renovacion',   label: 'Renovaciones',            eventType: 'subscription.renewed' },
  { key: 'capacitacion', label: 'Capacitaciones agendadas', eventType: 'training.scheduled' },
  { key: 'reactivacion', label: 'Clubes reactivados',       eventType: 'lifecycle.entered', state: 'reactivado' },
  { key: 'onboarding',   label: 'Onboarding completado',    eventType: 'onboarding.completed' },
  { key: 'contenido',    label: 'Primera publicación',      eventType: 'content.first_post' },
  { key: 'redes',        label: 'Red social conectada',     eventType: 'social.connected' },
];

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/**
 * Métricas de mensajería. Es el bloque de §17 que se puede responder con el
 * log tal como está.
 *
 * `responded` no sale de una columna: no existe «respondido» en el log. Se
 * cuenta el mensaje saliente que tuvo un entrante del mismo contacto DESPUÉS,
 * que es la única definición observable de «respondió».
 */
export async function messagingMetrics(clubId, { days = 30, siteIds = null } = {}) {
  await ensureAutomationSchema();
  const since = new Date(Date.now() - days * 86_400_000);
  const params = [clubId, since];
  let siteFilter = '';
  if (siteIds) {
    params.push(siteIds);
    siteFilter = ` AND l."contactId" IN (SELECT id FROM "WhatsAppContact" WHERE "siteId" = ANY($3))`;
  }

  const [totals, responded] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE l.direction='outgoing')::int                                   AS sent,
         COUNT(*) FILTER (WHERE l.direction='outgoing' AND l."deliveredAt" IS NOT NULL)::int   AS delivered,
         COUNT(*) FILTER (WHERE l.direction='outgoing' AND l."readAt" IS NOT NULL)::int        AS read,
         COUNT(*) FILTER (WHERE l.direction='outgoing' AND l.status='failed')::int             AS failed,
         COUNT(*) FILTER (WHERE l.direction='incoming')::int                                   AS inbound
       FROM "WhatsAppMessageLog" l
       WHERE l."clubId"=$1 AND l."createdAt" > $2${siteFilter}`,
      params
    ),
    db.query(
      `SELECT COUNT(DISTINCT out.id)::int AS n
       FROM "WhatsAppMessageLog" out
       WHERE out."clubId"=$1 AND out."createdAt" > $2 AND out.direction='outgoing'
         AND EXISTS (
           SELECT 1 FROM "WhatsAppMessageLog" inn
           WHERE inn."contactId" = out."contactId" AND inn.direction='incoming'
             AND inn."createdAt" > COALESCE(out."sentAt", out."createdAt")
             AND inn."createdAt" < COALESCE(out."sentAt", out."createdAt") + INTERVAL '7 days'
         )${siteFilter.replace(/l\./g, 'out.')}`,
      params
    ),
  ]);

  const t = totals.rows[0] || {};
  const answered = responded.rows[0]?.n || 0;
  return {
    days,
    sent: t.sent || 0,
    delivered: t.delivered || 0,
    read: t.read || 0,
    failed: t.failed || 0,
    inbound: t.inbound || 0,
    responded: answered,
    deliveryRate: pct(t.delivered, t.sent),
    readRate: pct(t.read, t.delivered || t.sent),
    responseRate: pct(answered, t.sent),
    failureRate: pct(t.failed, t.sent),
  };
}

/**
 * Conversiones atribuidas por recorrido.
 *
 * Se cuenta por SITIO y no por mensaje: si tres dirigentes del mismo club
 * reciben el aviso de renovación y el club renueva, es UNA renovación, no tres.
 * Contarla por mensaje inflaría el número por el tamaño de la audiencia, que es
 * exactamente lo que no se quiere de una métrica de resultado.
 */
export async function conversionsByJourney(clubId, { days = 90 } = {}) {
  await ensureAutomationSchema();
  const since = new Date(Date.now() - days * 86_400_000);

  const journeys = await db.query(
    `SELECT id, name, status FROM "CrmJourney" WHERE "clubId"=$1 ORDER BY name ASC`, [clubId]
  );
  if (!journeys.rows.length) return [];

  const out = [];
  for (const j of journeys.rows) {
    // Sitios que recibieron al menos un mensaje de este recorrido en la ventana.
    const reached = await db.query(
      `SELECT DISTINCT c."siteId", MIN(l."createdAt") AS "firstAt"
       FROM "WhatsAppMessageLog" l
       JOIN "WhatsAppContact" c ON c.id = l."contactId"
       WHERE l."journeyId"=$1 AND l."createdAt" > $2
         AND l.status IN ('sent','delivered','read') AND c."siteId" IS NOT NULL
       GROUP BY c."siteId"`,
      [j.id, since]
    );
    const sites = reached.rows.length;
    if (!sites) {
      out.push({ journeyId: j.id, name: j.name, status: j.status, sites: 0, conversions: [] });
      continue;
    }

    const conversions = [];
    for (const conv of CONVERSIONS) {
      const stateFilter = conv.state ? ` AND e.payload->>'state' = $4` : '';
      const params = [j.id, since, conv.eventType];
      if (conv.state) params.push(conv.state);

      const r = await db.query(
        `SELECT COUNT(DISTINCT e."siteId")::int AS n
         FROM "CrmEvent" e
         WHERE e.type = $3${stateFilter}
           AND e."siteId" IN (
             SELECT DISTINCT c."siteId" FROM "WhatsAppMessageLog" l
             JOIN "WhatsAppContact" c ON c.id = l."contactId"
             WHERE l."journeyId"=$1 AND l."createdAt" > $2
               AND l.status IN ('sent','delivered','read') AND c."siteId" IS NOT NULL
           )
           -- El evento tiene que ocurrir DESPUÉS del mensaje y dentro de la
           -- ventana. Sin esto contaríamos renovaciones anteriores al aviso.
           AND EXISTS (
             SELECT 1 FROM "WhatsAppMessageLog" l2
             JOIN "WhatsAppContact" c2 ON c2.id = l2."contactId"
             WHERE l2."journeyId"=$1 AND c2."siteId" = e."siteId"
               AND l2.status IN ('sent','delivered','read')
               AND e."occurredAt" > l2."createdAt"
               AND e."occurredAt" < l2."createdAt" + INTERVAL '${ATTRIBUTION_DAYS} days'
           )`,
        params
      );
      const n = r.rows[0]?.n || 0;
      if (n > 0) conversions.push({ ...conv, n, rate: pct(n, sites) });
    }
    out.push({ journeyId: j.id, name: j.name, status: j.status, sites, conversions });
  }
  return out;
}

/**
 * Rendimiento por plantilla. Responde «¿cuál funciona?» sobre lo único
 * observable: entrega, lectura y respuesta.
 *
 * Se excluyen las plantillas con menos de `minSample` envíos: con seis mensajes,
 * una tasa de lectura del 100 % no dice nada y ordenar por ella pondría arriba
 * justamente lo que menos se sabe.
 */
export async function templatePerformance(clubId, { days = 90, minSample = 20 } = {}) {
  await ensureAutomationSchema();
  const since = new Date(Date.now() - days * 86_400_000);
  const r = await db.query(
    `SELECT l."templateName",
            COUNT(*)::int                                            AS sent,
            COUNT(*) FILTER (WHERE l."deliveredAt" IS NOT NULL)::int AS delivered,
            COUNT(*) FILTER (WHERE l."readAt" IS NOT NULL)::int      AS read,
            COUNT(*) FILTER (WHERE l.status='failed')::int           AS failed,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM "WhatsAppMessageLog" inn
              WHERE inn."contactId" = l."contactId" AND inn.direction='incoming'
                AND inn."createdAt" > COALESCE(l."sentAt", l."createdAt")
                AND inn."createdAt" < COALESCE(l."sentAt", l."createdAt") + INTERVAL '7 days'
            ))::int AS responded
     FROM "WhatsAppMessageLog" l
     WHERE l."clubId"=$1 AND l."createdAt" > $2 AND l.direction='outgoing' AND l."templateName" IS NOT NULL
     GROUP BY l."templateName"
     ORDER BY sent DESC`,
    [clubId, since]
  );
  return r.rows.map(t => ({
    ...t,
    readRate: pct(t.read, t.delivered || t.sent),
    responseRate: pct(t.responded, t.sent),
    failureRate: pct(t.failed, t.sent),
    // La muestra se declara en vez de esconderse: quien mira decide si le sirve.
    enoughSample: t.sent >= minSample,
  }));
}

/** Rendimiento por segmento del ciclo de vida. */
export async function performanceByLifecycle(clubId, { days = 90 } = {}) {
  await ensureAutomationSchema();
  const since = new Date(Date.now() - days * 86_400_000);
  const r = await db.query(
    `SELECT COALESCE(ls.state,'sin_estado') AS state,
            COUNT(*)::int                                            AS sent,
            COUNT(*) FILTER (WHERE l."readAt" IS NOT NULL)::int      AS read,
            COUNT(*) FILTER (WHERE l.status='failed')::int           AS failed,
            COUNT(DISTINCT c."siteId")::int                          AS sites
     FROM "WhatsAppMessageLog" l
     JOIN "WhatsAppContact" c ON c.id = l."contactId"
     LEFT JOIN "CrmLifecycleState" ls ON ls."siteId" = c."siteId"
     WHERE l."clubId"=$1 AND l."createdAt" > $2 AND l.direction='outgoing'
     GROUP BY COALESCE(ls.state,'sin_estado')
     ORDER BY sent DESC`,
    [clubId, since]
  );
  return r.rows.map(s => ({
    ...s,
    label: s.state === 'sin_estado' ? 'Sin estado observado' : lifecycleLabel(s.state),
    readRate: pct(s.read, s.sent),
  }));
}

/** Dónde se cae la gente dentro de un recorrido. */
export async function journeyFunnel(clubId, journeyId) {
  await ensureAutomationSchema();
  const j = await db.query(`SELECT * FROM "CrmJourney" WHERE "clubId"=$1 AND id=$2`, [clubId, journeyId]);
  if (!j.rows.length) return null;
  const journey = j.rows[0];

  const steps = await db.query(
    `SELECT "nodeId","nodeType",outcome,COUNT(*)::int AS n
     FROM "CrmJourneyStep" WHERE "journeyId"=$1 GROUP BY "nodeId","nodeType",outcome`,
    [journeyId]
  );

  // El embudo se arma sobre los nodos que el grafo declara, en su orden, y sólo
  // con etapas que el módulo REGISTRA. No se inventa una etapa «leyó el mensaje»
  // que nadie marca: una etapa siempre en cero no dice dónde se pierde nadie.
  const byNode = new Map();
  for (const s of steps.rows) {
    if (!byNode.has(s.nodeId)) byNode.set(s.nodeId, { nodeId: s.nodeId, nodeType: s.nodeType, outcomes: {} });
    byNode.get(s.nodeId).outcomes[s.outcome] = s.n;
  }

  const order = (journey.nodes || []).map(n => n.id);
  const stages = order
    .filter(id => byNode.has(id))
    .map(id => {
      const node = byNode.get(id);
      const total = Object.values(node.outcomes).reduce((a, b) => a + b, 0);
      return {
        ...node,
        total,
        sent: node.outcomes.sent || 0,
        skipped: node.outcomes.skipped || 0,
        deferred: node.outcomes.deferred || 0,
        failed: node.outcomes.failed || 0,
        exited: node.outcomes.exited || 0,
      };
    });

  const runs = await db.query(
    `SELECT status, COUNT(*)::int AS n FROM "CrmJourneyRun" WHERE "journeyId"=$1 GROUP BY status`,
    [journeyId]
  );
  const exits = await db.query(
    `SELECT "exitReason", COUNT(*)::int AS n FROM "CrmJourneyRun"
     WHERE "journeyId"=$1 AND "exitReason" IS NOT NULL GROUP BY "exitReason" ORDER BY n DESC LIMIT 15`,
    [journeyId]
  );

  return { journey: { id: journey.id, name: journey.name, status: journey.status }, stages, runs: runs.rows, exits: exits.rows };
}

/** Actividad de la bandeja: volumen, intenciones y tiempos de atención. */
export async function inboxMetrics(clubId, { days = 30 } = {}) {
  await ensureAutomationSchema();
  const since = new Date(Date.now() - days * 86_400_000);

  const [byState, byIntent, timing, byAgent] = await Promise.all([
    db.query(
      `SELECT state, COUNT(*)::int AS n FROM "CrmConversation"
       WHERE "clubId"=$1 AND "openedAt" > $2 GROUP BY state`, [clubId, since]),
    db.query(
      `SELECT COALESCE(intent,'sin_clasificar') AS intent, "intentMethod", COUNT(*)::int AS n
       FROM "CrmConversation" WHERE "clubId"=$1 AND "openedAt" > $2
       GROUP BY COALESCE(intent,'sin_clasificar'), "intentMethod" ORDER BY n DESC`, [clubId, since]),
    // Mediana y no media: un hilo olvidado tres semanas arrastra la media y hace
    // parecer que se atiende mal cuando el resto se atendió en minutos.
    db.query(
      `SELECT
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("assignedAt" - "openedAt"))/60)  AS "medianAssignMin",
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("resolvedAt" - "openedAt"))/3600) AS "medianResolveHours"
       FROM "CrmConversation" WHERE "clubId"=$1 AND "openedAt" > $2`, [clubId, since]),
    db.query(
      `SELECT c."assignedTo", u.name, u.email,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE c."resolvedAt" IS NOT NULL)::int AS resolved,
              COUNT(*) FILTER (WHERE c."closedAt" IS NULL)::int AS open
       FROM "CrmConversation" c LEFT JOIN "User" u ON u.id = c."assignedTo"
       WHERE c."clubId"=$1 AND c."openedAt" > $2 AND c."assignedTo" IS NOT NULL
       GROUP BY c."assignedTo", u.name, u.email ORDER BY total DESC`, [clubId, since]),
  ]);

  return {
    days,
    byState: byState.rows,
    byIntent: byIntent.rows.map(i => ({ ...i, label: intentLabel(i.intent) })),
    medianAssignMin: timing.rows[0]?.medianAssignMin != null ? Math.round(timing.rows[0].medianAssignMin) : null,
    medianResolveHours: timing.rows[0]?.medianResolveHours != null ? Math.round(timing.rows[0].medianResolveHours * 10) / 10 : null,
    byAgent: byAgent.rows,
  };
}

/**
 * Costo estimado de las conversaciones.
 *
 * ES UNA ESTIMACIÓN PROPIA, no la factura de Meta. Meta cobra por CONVERSACIÓN
 * de 24 horas y por categoría, con tarifas que cambian por país; la Cloud API no
 * devuelve el importe en la respuesta del envío. Así que se cuentan ventanas de
 * conversación y se multiplica por la tarifa que el operador configure.
 *
 * Sin tarifa configurada NO se muestra un cero: se dice que no hay tarifa. Un
 * cero es una afirmación falsa; un hueco es la verdad. Misma regla que el panel
 * de auditoría del Creador de Reels.
 */
export async function costEstimate(clubId, { days = 30, rates = {} } = {}) {
  await ensureAutomationSchema();
  const since = new Date(Date.now() - days * 86_400_000);

  // Una «conversación» de Meta es una ventana de 24 h por contacto. Se aproxima
  // agrupando los envíos por contacto y día.
  const r = await db.query(
    `SELECT COALESCE(t.category,'MARKETING') AS category, COUNT(*)::int AS windows
     FROM (
       SELECT DISTINCT l."contactId", date_trunc('day', l."createdAt") AS d, l."templateName"
       FROM "WhatsAppMessageLog" l
       WHERE l."clubId"=$1 AND l."createdAt" > $2 AND l.direction='outgoing'
         AND l.status IN ('sent','delivered','read')
     ) w
     LEFT JOIN "WhatsAppTemplate" t ON t.name = w."templateName" AND t."clubId"=$1
     GROUP BY COALESCE(t.category,'MARKETING')`,
    [clubId, since]
  );

  const lines = r.rows.map(row => {
    const rate = Number(rates[String(row.category).toLowerCase()]);
    const hasRate = Number.isFinite(rate) && rate > 0;
    return {
      category: row.category,
      windows: row.windows,
      rate: hasRate ? rate : null,
      cost: hasRate ? Math.round(row.windows * rate * 100) / 100 : null,
    };
  });

  const priced = lines.filter(l => l.cost !== null);
  return {
    days,
    lines,
    totalWindows: lines.reduce((a, l) => a + l.windows, 0),
    totalCost: priced.length ? Math.round(priced.reduce((a, l) => a + l.cost, 0) * 100) / 100 : null,
    // Que falten tarifas se dice, no se disimula sumando sólo lo que sí tiene.
    missingRates: lines.filter(l => l.cost === null).map(l => l.category),
    note: 'Estimación propia sobre ventanas de conversación de 24 h. No es la facturación de Meta.',
  };
}

/** Serie diaria para el gráfico. */
export async function dailySeries(clubId, { days = 30 } = {}) {
  await ensureAutomationSchema();
  const r = await db.query(
    `SELECT date_trunc('day', l."createdAt")::date AS day,
            COUNT(*) FILTER (WHERE l.direction='outgoing')::int AS sent,
            COUNT(*) FILTER (WHERE l."readAt" IS NOT NULL)::int AS read,
            COUNT(*) FILTER (WHERE l.direction='incoming')::int AS inbound,
            COUNT(*) FILTER (WHERE l.status='failed')::int      AS failed
     FROM "WhatsAppMessageLog" l
     WHERE l."clubId"=$1 AND l."createdAt" > NOW() - ($2 || ' days')::interval
     GROUP BY 1 ORDER BY 1 ASC`,
    [clubId, String(days)]
  );
  return r.rows;
}

export default {
  CONVERSIONS, messagingMetrics, conversionsByJourney, templatePerformance,
  performanceByLifecycle, journeyFunnel, inboxMetrics, costEstimate, dailySeries,
};
