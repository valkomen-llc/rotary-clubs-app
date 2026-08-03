// Alertas internas del WhatsApp CRM.
//
// SON PARA EL EQUIPO. Ninguna de estas se le manda a un club: son las cosas que
// alguien de la plataforma tiene que mirar.
//
// TODAS SE OBSERVAN, igual que los eventos del ciclo de vida: una pasada mira el
// estado real y levanta lo que encuentra. Es idempotente por `dedupeKey`, así que
// puede correr cada cinco minutos sin llenar la tabla de repetidos, y una alerta
// resuelta a mano no vuelve a aparecer mientras la condición no cambie de
// período.
//
// LO QUE NO SE INVENTA: el pedido pide avisar cuando «un token esté próximo a
// vencer». La Cloud API no nos dice cuándo vence un token de sistema, y no
// tenemos las credenciales de la app para consultarlo. Así que NO se declara una
// fecha de vencimiento: se avisa por lo que sí es observable —que Meta rechazó
// una llamada por token inválido (código 190), o que hace mucho que nadie
// verifica la conexión—. Decir «vence en 5 días» sin poder saberlo sería peor
// que no avisar.
import crypto from 'crypto';
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { costEstimate } from './crmAnalytics.js';

export const ALERT_TYPES = [
  { type: 'high_error_rate',      label: 'Tasa alta de errores de envío',        severity: 'error' },
  { type: 'token_invalid',        label: 'Meta rechazó el token',               severity: 'error' },
  { type: 'token_stale',          label: 'Conexión sin verificar hace tiempo',  severity: 'warning' },
  { type: 'template_rejected',    label: 'Plantilla rechazada por Meta',        severity: 'error' },
  { type: 'help_requested',       label: 'Un club pidió ayuda y nadie respondió', severity: 'warning' },
  { type: 'unattended',           label: 'Conversaciones sin atender',          severity: 'warning' },
  { type: 'renewal_pending',      label: 'Renovación pendiente',                severity: 'warning' },
  { type: 'active_no_onboarding', label: 'Sitio activo sin onboarding',         severity: 'warning' },
  { type: 'no_activity',          label: 'Club sin actividad',                  severity: 'info' },
  { type: 'budget_threshold',     label: 'Presupuesto mensual',                 severity: 'warning' },
  { type: 'webhook_unrouted',     label: 'Webhook sin sitio que lo reciba',     severity: 'error' },
];

const BY_TYPE = Object.fromEntries(ALERT_TYPES.map(a => [a.type, a]));
export const alertLabel = (t) => BY_TYPE[t]?.label || t;

// Período de la clave de deduplicación. Con el día, una condición que persiste
// vuelve a avisar mañana —que es lo que se quiere de «sigue sin atenderse»— y no
// cada cinco minutos.
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

async function raise({ clubId, type, severity, title, detail, siteId = null, entityId = null, dedupeKey }) {
  const r = await db.query(
    `INSERT INTO "CrmAlert" (id,"clubId",type,severity,title,detail,"siteId","entityId","dedupeKey")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT DO NOTHING RETURNING id`,
    [crypto.randomUUID(), clubId, type, severity || BY_TYPE[type]?.severity || 'info',
     title, detail || null, siteId, entityId, dedupeKey]
  );
  return r.rows.length > 0;
}

// ── Presupuesto ─────────────────────────────────────────────────────────────
/**
 * Estado del presupuesto del mes.
 *
 * Devuelve `configured:false` cuando no hay presupuesto ni tarifas. NO se
 * inventa un gasto: sin tarifa configurada el costo es desconocido, no cero.
 */
export async function budgetStatus(clubId, settings = {}) {
  const budget = Number(settings.monthlyBudget);
  const rates = settings.rates || {};
  if (!Number.isFinite(budget) || budget <= 0) {
    return { configured: false, reason: 'sin_presupuesto' };
  }

  const daysIntoMonth = new Date().getUTCDate();
  const cost = await costEstimate(clubId, { days: daysIntoMonth, rates });
  if (cost.totalCost === null) {
    return { configured: false, reason: 'sin_tarifas', budget, missingRates: cost.missingRates };
  }

  const used = cost.totalCost;
  const ratio = used / budget;
  return {
    configured: true,
    budget, used,
    remaining: Math.round((budget - used) * 100) / 100,
    ratio: Math.round(ratio * 1000) / 10,
    exceeded: used >= budget,
    // El corte duro es opcional y apagado por defecto: frenar los envíos por un
    // número ESTIMADO puede dejar sin avisar a un club que vence mañana. Quien
    // lo encienda está eligiendo ese riesgo a sabiendas.
    hardStop: !!settings.budgetHardStop && used >= budget,
  };
}

// ── Barrido ─────────────────────────────────────────────────────────────────
/**
 * Levanta las alertas que correspondan. Devuelve cuántas se crearon de verdad.
 */
export async function sweepAlerts(clubId, { settings = {}, now = new Date() } = {}) {
  await ensureAutomationSchema();
  if (!clubId) return { created: 0, reason: 'sin_cuenta_whatsapp' };

  let created = 0;
  const bump = async (args) => { if (await raise({ clubId, ...args })) created++; };
  const today = dayKey(now);

  // 1. Tasa alta de errores en las últimas 24 h. El mínimo de 20 envíos existe
  //    para no gritar por 2 de 3: con muestras chicas la tasa no significa nada.
  const errors = await db.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='failed')::int AS failed
     FROM "WhatsAppMessageLog"
     WHERE "clubId"=$1 AND direction='outgoing' AND "createdAt" > NOW() - INTERVAL '24 hours'`,
    [clubId]
  );
  const e = errors.rows[0] || {};
  if (e.total >= 20 && e.failed / e.total >= 0.25) {
    await bump({
      type: 'high_error_rate',
      title: `${Math.round((e.failed / e.total) * 100)} % de los envíos falló en 24 h`,
      detail: `${e.failed} de ${e.total}. Revisá el token, el número remitente y el estado de las plantillas.`,
      dedupeKey: `high_error_rate:${clubId}:${today}`,
    });
  }

  // 2. Token: sólo lo observable.
  const tokenErr = await db.query(
    `SELECT COUNT(*)::int AS n FROM "WhatsAppMessageLog"
     WHERE "clubId"=$1 AND status='failed' AND "errorCode" IN ('190','200','10')
       AND "createdAt" > NOW() - INTERVAL '24 hours'`,
    [clubId]
  );
  if ((tokenErr.rows[0]?.n || 0) > 0) {
    await bump({
      type: 'token_invalid',
      title: 'Meta rechazó el token de acceso',
      detail: 'Hay envíos fallidos por credenciales. Regenerá el token en Meta Business y guardalo en Configuración.',
      dedupeKey: `token_invalid:${clubId}:${today}`,
    });
  }
  const cfg = await db.query(`SELECT "lastVerifiedAt" FROM "WhatsAppConfig" WHERE "clubId"=$1`, [clubId]);
  const verified = cfg.rows[0]?.lastVerifiedAt ? new Date(cfg.rows[0].lastVerifiedAt) : null;
  const staleDays = Number(settings.tokenStaleDays) || 60;
  if (!verified || (now - verified) / 86_400_000 > staleDays) {
    await bump({
      type: 'token_stale',
      title: `La conexión con Meta no se verifica hace más de ${staleDays} días`,
      detail: verified
        ? `Última verificación: ${verified.toISOString().slice(0, 10)}. Pulsá "Verificar" en Configuración.`
        : 'Nunca se verificó. Pulsá "Verificar" en Configuración.',
      dedupeKey: `token_stale:${clubId}:${monthKey(now)}`,
    });
  }

  // 3. Plantillas rechazadas.
  const rejected = await db.query(
    `SELECT id, name, "displayName" FROM "WhatsAppTemplate"
     WHERE "clubId"=$1 AND lower(status) IN ('rejected','disabled','paused')`,
    [clubId]
  );
  for (const t of rejected.rows) {
    await bump({
      type: 'template_rejected',
      title: `Plantilla rechazada: ${t.displayName || t.name}`,
      detail: 'Los recorridos que la usen no van a poder enviar. Corregila en Meta y sincronizá.',
      entityId: t.id,
      dedupeKey: `template_rejected:${t.id}`,
    });
  }

  // 4. Un club pidió ayuda y sigue sin respuesta.
  const helpHours = Number(settings.helpResponseHours) || 4;
  const help = await db.query(
    `SELECT c.id, c."siteId", ct.name AS "contactName", COALESCE(cl.name, d.name) AS "siteName"
     FROM "CrmConversation" c
     LEFT JOIN "WhatsAppContact" ct ON ct.id = c."contactId"
     LEFT JOIN "Club" cl ON cl.id = c."siteId"
     LEFT JOIN "District" d ON d.id = c."siteId"
     WHERE c."clubId"=$1 AND c."closedAt" IS NULL AND c.state='nuevo'
       AND c.intent IN ('soporte_tecnico','hablar_asesor')
       AND c."lastInboundAt" < NOW() - ($2 || ' hours')::interval`,
    [clubId, String(helpHours)]
  );
  for (const h of help.rows) {
    await bump({
      type: 'help_requested',
      title: `${h.contactName || 'Un contacto'} pidió ayuda y nadie respondió`,
      detail: `${h.siteName || 'Sitio sin vincular'} · más de ${helpHours} h sin atender.`,
      siteId: h.siteId, entityId: h.id,
      dedupeKey: `help_requested:${h.id}:${today}`,
    });
  }

  // 5. Volumen sin atender. Una sola alerta con el total, no una por hilo:
  //    veinte alertas iguales no informan más que una que diga «veinte».
  const unattendedHours = Number(settings.unattendedHours) || 24;
  const unattended = await db.query(
    `SELECT COUNT(*)::int AS n FROM "CrmConversation"
     WHERE "clubId"=$1 AND "closedAt" IS NULL AND state='nuevo'
       AND "lastInboundAt" < NOW() - ($2 || ' hours')::interval`,
    [clubId, String(unattendedHours)]
  );
  const un = unattended.rows[0]?.n || 0;
  if (un >= 5) {
    await bump({
      type: 'unattended',
      title: `${un} conversaciones llevan más de ${unattendedHours} h sin atender`,
      detail: 'Revisá las reglas de enrutamiento y la disponibilidad de los agentes.',
      dedupeKey: `unattended:${clubId}:${today}`,
    });
  }

  // 6, 7, 8. Situaciones de sitios, leídas del ciclo de vida ya calculado. Se
  //    acotan a los que tienen algún contacto: avisar de un sitio al que no se
  //    le puede escribir no le da a nadie nada que hacer.
  const sites = await db.query(
    `SELECT ls."siteId", ls.state, ls.signals, COALESCE(cl.name, d.name) AS "siteName"
     FROM "CrmLifecycleState" ls
     LEFT JOIN "Club" cl ON cl.id = ls."siteId"
     LEFT JOIN "District" d ON d.id = ls."siteId"
     WHERE EXISTS (SELECT 1 FROM "WhatsAppContact" wc WHERE wc."siteId" = ls."siteId" AND wc."clubId"=$1)`,
    [clubId]
  );
  for (const s of sites.rows) {
    const sig = s.signals || {};
    if (['proximo_renovar', 'suscripcion_vencida', 'periodo_gracia'].includes(s.state)) {
      await bump({
        type: 'renewal_pending',
        title: `Renovación pendiente: ${s.siteName || s.siteId}`,
        detail: sig.expirationDate ? `Vence el ${String(sig.expirationDate).slice(0, 10)}.` : null,
        siteId: s.siteId,
        dedupeKey: `renewal_pending:${s.siteId}:${monthKey(now)}`,
      });
    }
    if (['sitio_produccion', 'activo_uso_frecuente', 'activo_bajo_uso'].includes(s.state)
        && Number(sig.trainingCompleted || 0) === 0) {
      await bump({
        type: 'active_no_onboarding',
        title: `Sitio activo sin ninguna capacitación: ${s.siteName || s.siteId}`,
        detail: 'Está en producción y nunca completó una sesión.',
        siteId: s.siteId,
        dedupeKey: `active_no_onboarding:${s.siteId}:${monthKey(now)}`,
      });
    }
    if (s.state === 'activo_bajo_uso') {
      await bump({
        type: 'no_activity',
        title: `Sin actividad: ${s.siteName || s.siteId}`,
        detail: sig.lastActivityAt ? `Último contenido: ${String(sig.lastActivityAt).slice(0, 10)}.` : 'Sin contenido registrado.',
        siteId: s.siteId,
        dedupeKey: `no_activity:${s.siteId}:${monthKey(now)}`,
      });
    }
  }

  // 9. Presupuesto.
  const budget = await budgetStatus(clubId, settings);
  if (budget.configured) {
    if (budget.exceeded) {
      await bump({
        type: 'budget_threshold', severity: 'error',
        title: `Presupuesto mensual superado (${budget.ratio} %)`,
        detail: `Estimado ${budget.used} de ${budget.budget}. Es una estimación propia, no la factura de Meta.`
          + (budget.hardStop ? ' Los envíos automáticos están detenidos.' : ''),
        dedupeKey: `budget_exceeded:${clubId}:${monthKey(now)}`,
      });
    } else if (budget.ratio >= 80) {
      await bump({
        type: 'budget_threshold',
        title: `Presupuesto mensual al ${budget.ratio} %`,
        detail: `Estimado ${budget.used} de ${budget.budget}.`,
        dedupeKey: `budget_80:${clubId}:${monthKey(now)}`,
      });
    }
  }

  return { created };
}

/**
 * Levanta una alerta desde fuera del barrido.
 *
 * El barrido corre cada minuto y observa el estado; esto es para el hecho que
 * NO deja rastro observable después —un webhook que llegó y no se pudo
 * encaminar—: si no se anota en el momento, nadie va a poder deducirlo luego.
 */
export const raiseAlert = raise;

export default { ALERT_TYPES, alertLabel, sweepAlerts, budgetStatus, raiseAlert: raise };
