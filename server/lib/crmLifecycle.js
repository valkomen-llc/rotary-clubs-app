// Observación del ciclo de vida: mira el estado real de todos los sitios, guarda
// el estado derivado y registra los eventos que encuentra.
//
// Es la ENTRADA del motor de automatización. Corre en el cron
// `/api/cron/crm-automation-tick`.
//
// DOS SALVAGUARDAS que no son un detalle de implementación sino la diferencia
// entre estrenar el módulo y mandarle cientos de mensajes a los clubes el día
// del despliegue:
//
// 1. UN SITIO VISTO POR PRIMERA VEZ NO EMITE TRANSICIÓN. La primera vuelta
//    encuentra la tabla `CrmLifecycleState` vacía y, sin esto, TODOS los sitios
//    "entrarían" en su estado a la vez y se inscribirían en todos los recorridos.
//    La primera observación sólo fotografía; se dispara a partir del cambio.
//
// 2. LOS EVENTOS DERIVADOS TIENEN VENTANA (`EVENT_LOOKBACK_DAYS`, 7 por
//    defecto). Un proyecto publicado hace tres años es un hecho, no una noticia:
//    sin la ventana, la primera pasada emitiría el historial completo de la
//    plataforma como si acabara de ocurrir.
import crypto from 'crypto';
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { recordEvents } from './crmEventBus.js';
import { deriveLifecycleState, diffLifecycle, LIFECYCLE_THRESHOLDS, DAY_MS } from './lifecycleSpec.js';

const LOOKBACK_DAYS = (() => {
  const n = Number(process.env.CRM_EVENT_LOOKBACK_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 7;
})();

// Los eventos de inactividad describen una condición que se sostiene en el
// tiempo, no un instante. Sin un "cubo" temporal se emitirían en cada vuelta del
// cron —cada minuto— y saturarían la bitácora. Con el cubo semanal, una
// condición que persiste vuelve a anunciarse una vez por semana, que es el ritmo
// al que tiene sentido reaccionar.
function weekBucket(date) {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : 'none');

// ── Recolección de señales ──────────────────────────────────────────────────
// Todo en consultas agregadas sobre TODOS los sitios a la vez. Una consulta por
// señal, no una por sitio: con 300 clubes la diferencia es entre ~12 viajes a la
// base y ~3.600.
async function collectClubSignals() {
  const [
    clubs, phases, admins, activity, firstPost, social, projects,
    donations, events, products, support, trainings,
  ] = await Promise.all([
    db.query(`SELECT id, name, status, "subscriptionStatus", "expirationDate", domain, subdomain,
                     "developmentBannerActive", "createdAt", district, "districtId", country, city, type, category
              FROM "Club"`),
    db.query(`SELECT "clubId", COUNT(*)::int AS total,
                     COUNT(*) FILTER (WHERE status='completed')::int AS done,
                     MAX("completedAt") AS "lastCompletedAt"
              FROM "SiteActivationPhase" GROUP BY "clubId"`),
    db.query(`SELECT "clubId", COUNT(*)::int AS total, MIN("createdAt") AS "firstAt",
                     (ARRAY_AGG(id ORDER BY "createdAt"))[1] AS "firstId"
              FROM "User" WHERE "clubId" IS NOT NULL GROUP BY "clubId"`),
    // Última señal de vida del sitio, mirando todo lo que un club puede crear.
    db.query(`SELECT "clubId", MAX(ts) AS "lastAt", SUM(n)::int AS total FROM (
                SELECT "clubId", MAX("createdAt") ts, COUNT(*) n FROM "Post" WHERE "clubId" IS NOT NULL GROUP BY "clubId"
                UNION ALL SELECT "clubId", MAX("createdAt"), COUNT(*) FROM "Publication" GROUP BY "clubId"
                UNION ALL SELECT "clubId", MAX("createdAt"), COUNT(*) FROM "Project" GROUP BY "clubId"
                UNION ALL SELECT "clubId", MAX("createdAt"), COUNT(*) FROM "CalendarEvent" GROUP BY "clubId"
                UNION ALL SELECT "clubId", MAX("createdAt"), COUNT(*) FROM "SocialPublication" WHERE "clubId" IS NOT NULL GROUP BY "clubId"
              ) t GROUP BY "clubId"`),
    db.query(`SELECT "clubId", MIN("createdAt") AS "firstAt",
                     (ARRAY_AGG(id ORDER BY "createdAt"))[1] AS "firstId"
              FROM "Post" WHERE "clubId" IS NOT NULL GROUP BY "clubId"`),
    db.query(`SELECT "clubId", COUNT(*)::int AS total, MIN("createdAt") AS "firstAt",
                     (ARRAY_AGG(id ORDER BY "createdAt"))[1] AS "firstId",
                     MAX("createdAt") AS "lastAt"
              FROM "SocialAccount" WHERE "clubId" IS NOT NULL AND status='active' GROUP BY "clubId"`),
    db.query(`SELECT "clubId", COUNT(*)::int AS total, MAX("createdAt") AS "lastAt",
                     (ARRAY_AGG(id ORDER BY "createdAt" DESC))[1] AS "lastId"
              FROM "Project" GROUP BY "clubId"`),
    // `Donation` fecha con `date`, no con `createdAt`, a diferencia del resto de
    // las tablas de contenido.
    db.query(`SELECT "clubId", COUNT(*)::int AS total, MAX(date) AS "lastAt",
                     (ARRAY_AGG(id ORDER BY date DESC))[1] AS "lastId"
              FROM "Donation" WHERE "clubId" IS NOT NULL GROUP BY "clubId"`),
    db.query(`SELECT "clubId", COUNT(*)::int AS total, MAX("createdAt") AS "lastAt",
                     (ARRAY_AGG(id ORDER BY "createdAt" DESC))[1] AS "lastId"
              FROM "CalendarEvent" GROUP BY "clubId"`),
    db.query(`SELECT "clubId", COUNT(*)::int AS total, MIN("createdAt") AS "firstAt"
              FROM "Product" GROUP BY "clubId"`),
    db.query(`SELECT "clubId",
                     COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed','cancelled'))::int AS open,
                     MAX("createdAt") AS "lastAt",
                     (ARRAY_AGG(id ORDER BY "createdAt" DESC))[1] AS "lastId",
                     MAX("updatedAt") FILTER (WHERE status IN ('resolved','closed')) AS "lastResolvedAt",
                     (ARRAY_AGG(id ORDER BY "updatedAt" DESC) FILTER (WHERE status IN ('resolved','closed')))[1] AS "lastResolvedId"
              FROM "TechnicalRequest" GROUP BY "clubId"`),
    db.query(`SELECT id, "clubId", "districtId", status, "startAt", "createdAt", "updatedAt", "cancelledAt"
              FROM "TrainingAppointment"
              WHERE "startAt" > NOW() - INTERVAL '400 days'`),
  ]);

  const byId = new Map();
  for (const c of clubs.rows) {
    byId.set(c.id, {
      siteId: c.id, siteType: 'club', name: c.name,
      status: c.status, subscriptionStatus: c.subscriptionStatus, expirationDate: c.expirationDate,
      developmentBannerActive: c.developmentBannerActive,
      hasDomain: !!(c.domain || c.subdomain), domain: c.domain || c.subdomain || null,
      createdAt: c.createdAt, district: c.district, districtId: c.districtId,
      country: c.country, city: c.city, siteKind: c.type, category: c.category,
      contentTracked: true,
      activationPhasesTotal: 0, activationPhasesCompleted: 0,
      hasAdminUser: false, hasPublishedContent: false, lastActivityAt: null,
      trainingScheduled: 0, trainingCompleted: 0, hasCompletedTraining: false,
      socialCount: 0, projectCount: 0, donationCount: 0, eventCount: 0, productCount: 0,
      openSupport: 0, trainings: [],
    });
  }

  const put = (rows, fn) => { for (const r of rows) { const s = byId.get(r.clubId); if (s) fn(s, r); } };

  put(phases.rows, (s, r) => {
    s.activationPhasesTotal = r.total; s.activationPhasesCompleted = r.done;
    s.activationCompletedAt = r.done === r.total ? r.lastCompletedAt : null;
  });
  put(admins.rows, (s, r) => { s.hasAdminUser = r.total > 0; s.firstAdminAt = r.firstAt; s.firstAdminId = r.firstId; });
  put(activity.rows, (s, r) => { s.lastActivityAt = r.lastAt; s.hasPublishedContent = (r.total || 0) > 0; });
  put(firstPost.rows, (s, r) => { s.firstPostAt = r.firstAt; s.firstPostId = r.firstId; });
  put(social.rows, (s, r) => { s.socialCount = r.total; s.firstSocialAt = r.firstAt; s.firstSocialId = r.firstId; s.lastSocialAt = r.lastAt; });
  put(projects.rows, (s, r) => { s.projectCount = r.total; s.lastProjectAt = r.lastAt; s.lastProjectId = r.lastId; });
  put(donations.rows, (s, r) => { s.donationCount = r.total; s.lastDonationAt = r.lastAt; s.lastDonationId = r.lastId; });
  put(events.rows, (s, r) => { s.eventCount = r.total; s.lastEventAt = r.lastAt; s.lastEventId = r.lastId; });
  put(products.rows, (s, r) => { s.productCount = r.total; s.firstProductAt = r.firstAt; });
  put(support.rows, (s, r) => {
    s.openSupport = r.open; s.lastSupportAt = r.lastAt; s.lastSupportId = r.lastId;
    s.lastSupportResolvedAt = r.lastResolvedAt; s.lastSupportResolvedId = r.lastResolvedId;
  });

  for (const t of trainings.rows) {
    const s = byId.get(t.clubId);
    if (!s) continue;
    s.trainings.push(t);
    if (t.status === 'completed') { s.trainingCompleted++; s.hasCompletedTraining = true; }
    if (['pending', 'confirmed', 'rescheduled'].includes(t.status)) s.trainingScheduled++;
  }

  return byId;
}

async function collectDistrictSignals() {
  const [districts, admins, trainings] = await Promise.all([
    db.query(`SELECT id, name, status, "subscriptionStatus", "expirationDate", domain, subdomain,
                     "developmentBannerActive", "createdAt", countries
              FROM "District"`),
    db.query(`SELECT "districtId", COUNT(*)::int AS total, MIN("createdAt") AS "firstAt",
                     (ARRAY_AGG(id ORDER BY "createdAt"))[1] AS "firstId"
              FROM "User" WHERE "districtId" IS NOT NULL GROUP BY "districtId"`),
    db.query(`SELECT id, "districtId", status, "startAt", "createdAt", "updatedAt", "cancelledAt"
              FROM "TrainingAppointment"
              WHERE "districtId" IS NOT NULL AND "startAt" > NOW() - INTERVAL '400 days'`),
  ]);

  const byId = new Map();
  for (const d of districts.rows) {
    byId.set(d.id, {
      siteId: d.id, siteType: 'district', name: d.name,
      status: d.status, subscriptionStatus: d.subscriptionStatus, expirationDate: d.expirationDate,
      developmentBannerActive: d.developmentBannerActive,
      hasDomain: !!(d.domain || d.subdomain), domain: d.domain || d.subdomain || null,
      createdAt: d.createdAt, country: (d.countries || [])[0] || null,
      // Un distrito no tiene Post ni Publication colgando. Declararlo es más
      // honesto que dejar el contador en cero y que la derivación lo lea como
      // "no publica nada".
      contentTracked: false,
      activationPhasesTotal: 0, activationPhasesCompleted: 0,
      hasAdminUser: false, hasPublishedContent: false, lastActivityAt: null,
      trainingScheduled: 0, trainingCompleted: 0, hasCompletedTraining: false,
      socialCount: 0, projectCount: 0, donationCount: 0, eventCount: 0, productCount: 0,
      openSupport: 0, trainings: [],
    });
  }

  for (const r of admins.rows) {
    const s = byId.get(r.districtId);
    if (s) { s.hasAdminUser = r.total > 0; s.firstAdminAt = r.firstAt; s.firstAdminId = r.firstId; }
  }
  for (const t of trainings.rows) {
    const s = byId.get(t.districtId);
    if (!s) continue;
    s.trainings.push(t);
    if (t.status === 'completed') { s.trainingCompleted++; s.hasCompletedTraining = true; }
    if (['pending', 'confirmed', 'rescheduled'].includes(t.status)) s.trainingScheduled++;
  }

  return byId;
}

// ── Eventos derivados de un sitio ───────────────────────────────────────────
// Devuelve los eventos que las señales de ESTE sitio justifican, ya filtrados
// por la ventana. `previous` son las señales guardadas en la vuelta anterior:
// hacen falta para detectar la renovación, que no es un hecho observable en una
// sola foto sino un cambio (la fecha de vencimiento se movió hacia adelante).
function derivedEventsFor(signals, previous, now) {
  const out = [];
  const s = signals;
  const site = { siteId: s.siteId, siteType: s.siteType };
  const fresh = (d) => d && (now.getTime() - new Date(d).getTime()) <= LOOKBACK_DAYS * DAY_MS;
  const push = (type, at, dedupeKey, payload = {}) => {
    if (!fresh(at)) return;
    out.push({ ...site, type, occurredAt: at, dedupeKey, payload: { ...payload, siteName: s.name } });
  };

  push('site.created', s.createdAt, `site.created:${s.siteId}`);
  push('admin_user.created', s.firstAdminAt, `admin_user.created:${s.firstAdminId}`);
  if (s.hasDomain) push('domain.connected', s.createdAt, `domain.connected:${s.siteId}:${s.domain}`, { domain: s.domain });
  if (s.activationCompletedAt) push('onboarding.completed', s.activationCompletedAt, `onboarding.completed:${s.siteId}`);
  push('content.first_post', s.firstPostAt, `content.first_post:${s.firstPostId}`);
  push('social.connected', s.firstSocialAt, `social.connected:${s.firstSocialId}`);
  push('project.published', s.lastProjectAt, `project.published:${s.lastProjectId}`);
  push('donation.received', s.lastDonationAt, `donation.received:${s.lastDonationId}`);
  push('event.created', s.lastEventAt, `event.created:${s.lastEventId}`);
  if (s.productCount > 0) push('shop.activated', s.firstProductAt, `shop.activated:${s.siteId}`);
  push('support.requested', s.lastSupportAt, `support.requested:${s.lastSupportId}`);
  push('support.resolved', s.lastSupportResolvedAt, `support.resolved:${s.lastSupportResolvedId}`);

  // Capacitaciones. La clave es el id de la cita, así que la pasada puede verla
  // en cada vuelta sin volver a anunciarla.
  for (const t of s.trainings || []) {
    const start = t.startAt ? new Date(t.startAt) : null;
    if (t.status === 'cancelled') {
      push('training.cancelled', t.cancelledAt || t.updatedAt, `training.cancelled:${t.id}`, { appointmentId: t.id });
      continue;
    }
    push('training.scheduled', t.createdAt, `training.scheduled:${t.id}`, { appointmentId: t.id, startAt: t.startAt });
    if (t.status === 'confirmed') push('training.confirmed', t.updatedAt, `training.confirmed:${t.id}`, { appointmentId: t.id, startAt: t.startAt });
    if (t.status === 'completed') push('training.completed', t.updatedAt, `training.completed:${t.id}`, { appointmentId: t.id });
    // "Próxima" es una condición de tiempo, no un cambio de fila: se anuncia
    // cuando la cita entra en las 48 h y sigue en pie.
    if (start && ['pending', 'confirmed', 'rescheduled'].includes(t.status)) {
      const hours = (start.getTime() - now.getTime()) / 3_600_000;
      if (hours > 0 && hours <= 48) {
        out.push({ ...site, type: 'training.upcoming', occurredAt: now,
          dedupeKey: `training.upcoming:${t.id}`, payload: { appointmentId: t.id, startAt: t.startAt, siteName: s.name } });
      }
    }
  }

  // Suscripción. La clave lleva la fecha de vencimiento para que, al renovar,
  // el aviso del período siguiente sea un evento nuevo y no un repetido.
  const exp = s.expirationDate ? new Date(s.expirationDate) : null;
  if (exp) {
    const days = (exp.getTime() - now.getTime()) / DAY_MS;
    if (days > 0 && days <= LIFECYCLE_THRESHOLDS.renewalWindowDays) {
      out.push({ ...site, type: 'subscription.expiring', occurredAt: now,
        dedupeKey: `subscription.expiring:${s.siteId}:${isoDay(exp)}`,
        payload: { expirationDate: s.expirationDate, daysToExpiry: Math.ceil(days), siteName: s.name } });
    }
    if (days <= 0) {
      out.push({ ...site, type: 'subscription.expired', occurredAt: exp,
        dedupeKey: `subscription.expired:${s.siteId}:${isoDay(exp)}`,
        payload: { expirationDate: s.expirationDate, siteName: s.name } });
    }
    // Renovación: la fecha de vencimiento avanzó respecto de la vuelta anterior.
    const prevExp = previous?.expirationDate ? new Date(previous.expirationDate) : null;
    if (prevExp && exp.getTime() > prevExp.getTime()) {
      out.push({ ...site, type: 'subscription.renewed', occurredAt: now,
        dedupeKey: `subscription.renewed:${s.siteId}:${isoDay(exp)}`,
        payload: { from: previous.expirationDate, to: s.expirationDate, siteName: s.name } });
    }
  }

  // Inactividad: condiciones sostenidas, con cubo semanal.
  const bucket = weekBucket(now);
  const inactive = (type, cond) => {
    if (!cond) return;
    out.push({ ...site, type, occurredAt: now, dedupeKey: `${type}:${s.siteId}:${bucket}`, payload: { siteName: s.name } });
  };
  const stale = s.lastActivityAt && (now.getTime() - new Date(s.lastActivityAt).getTime()) > LIFECYCLE_THRESHOLDS.lowUsageDays * DAY_MS;
  if (s.contentTracked) {
    inactive('inactivity.no_content', stale || !s.lastActivityAt);
    inactive('inactivity.no_projects', s.projectCount === 0);
    inactive('inactivity.no_social', s.socialCount === 0);
    inactive('inactivity.no_onboarding', s.activationPhasesTotal > 0 && s.activationPhasesCompleted < s.activationPhasesTotal);
  }
  inactive('inactivity.no_training', s.trainingScheduled === 0 && s.trainingCompleted === 0);

  return out;
}

// ── Pasada completa ─────────────────────────────────────────────────────────
/**
 * Deriva y persiste el estado de todos los sitios, y registra los eventos
 * observados. Devuelve un resumen para el log del cron.
 */
export async function runLifecycleSweep({ now = new Date() } = {}) {
  await ensureAutomationSchema();

  const [clubSignals, districtSignals, storedR] = await Promise.all([
    collectClubSignals(),
    collectDistrictSignals(),
    db.query(`SELECT * FROM "CrmLifecycleState"`),
  ]);
  const stored = new Map(storedR.rows.map(r => [r.siteId, r]));

  const all = [...clubSignals.values(), ...districtSignals.values()];
  const events = [];
  let bootstrapped = 0, transitions = 0;

  for (const signals of all) {
    const prevRow = stored.get(signals.siteId) || null;
    const prevSignals = prevRow?.signals || null;

    const derived = deriveLifecycleState({
      ...signals,
      manualState: prevRow?.manualState || null,
      previousState: prevRow?.previousState || null,
      previousStateSince: prevRow?.previousStateSince || null,
    }, now);

    const transition = diffLifecycle(prevRow?.state || null, derived);
    const isFirstSight = !prevRow;

    if (isFirstSight) {
      bootstrapped++;
      await db.query(
        `INSERT INTO "CrmLifecycleState" (id,"siteId","siteType",state,reason,since,signals,"computedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$6)
         ON CONFLICT ("siteId") DO NOTHING`,
        [crypto.randomUUID(), signals.siteId, signals.siteType, derived.state, derived.reason || null, now, JSON.stringify(signals)]
      );
    } else if (transition) {
      transitions++;
      await db.query(
        `UPDATE "CrmLifecycleState"
         SET state=$1, reason=$2, since=$3, "previousState"=state, "previousStateSince"=since,
             signals=$4::jsonb, "computedAt"=$3, "updatedAt"=$3
         WHERE "siteId"=$5`,
        [derived.state, derived.reason || null, now, JSON.stringify(signals), signals.siteId]
      );
      // La transición SÓLO se emite cuando hubo estado anterior. Ver la nota de
      // la cabecera: sin esto, la primera vuelta inscribiría a todos.
      events.push({
        siteId: signals.siteId, siteType: signals.siteType,
        type: 'lifecycle.entered', occurredAt: now,
        dedupeKey: `lifecycle.entered:${signals.siteId}:${derived.state}:${now.toISOString()}`,
        payload: { state: derived.state, from: transition.from, reason: derived.reason, siteName: signals.name },
      });
    } else {
      // Sin cambio de estado: refrescamos las señales igual, porque de ellas sale
      // la detección de la renovación en la vuelta siguiente.
      await db.query(
        `UPDATE "CrmLifecycleState" SET signals=$1::jsonb, "computedAt"=$2, "updatedAt"=$2 WHERE "siteId"=$3`,
        [JSON.stringify(signals), now, signals.siteId]
      );
    }

    // Los eventos derivados se emiten siempre —incluida la primera vuelta—
    // porque ya vienen acotados por la ventana de `LOOKBACK_DAYS`.
    events.push(...derivedEventsFor(signals, prevSignals, now));
  }

  const { created } = await recordEvents(events);
  return {
    sites: all.length,
    bootstrapped,
    transitions,
    eventsSeen: events.length,
    eventsCreated: created,
  };
}

/** Estado guardado de un sitio (sin recalcular). */
export async function getLifecycleState(siteId) {
  await ensureAutomationSchema();
  const r = await db.query(`SELECT * FROM "CrmLifecycleState" WHERE "siteId"=$1`, [siteId]);
  return r.rows[0] || null;
}

/**
 * Fija o libera el estado manual de un sitio. Con `state=null` vuelve a
 * gobernar la derivación.
 */
export async function setManualLifecycleState(siteId, state, { siteType = 'club' } = {}) {
  await ensureAutomationSchema();
  const now = new Date();
  const r = await db.query(
    `INSERT INTO "CrmLifecycleState" (id,"siteId","siteType",state,"manualState",reason,since,"computedAt")
     VALUES ($1,$2,$3,COALESCE($4,'suscripcion_activa'),$4,'manual',$5,$5)
     ON CONFLICT ("siteId") DO UPDATE
       SET "manualState"=$4,
           state=COALESCE($4, "CrmLifecycleState".state),
           "previousState"="CrmLifecycleState".state,
           "previousStateSince"="CrmLifecycleState".since,
           since=$5, reason='manual', "updatedAt"=$5
     RETURNING *`,
    [crypto.randomUUID(), siteId, siteType, state || null, now]
  );
  return r.rows[0];
}

export default { runLifecycleSweep, getLifecycleState, setManualLifecycleState };
