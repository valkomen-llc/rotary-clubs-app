// Bus de eventos del motor de automatización.
//
// DECISIÓN DE DISEÑO — los eventos se OBSERVAN, no se empujan.
// El pedido enumera 21 eventos de activación repartidos por toda la plataforma
// (suscripción pagada, dominio conectado, proyecto publicado, tienda activada…).
// Instrumentar 21 puntos de llamada en once módulos ajenos habría significado
// tocar código que este PR no toca por ningún otro motivo, y —lo que importa
// más— un evento se perdería para siempre si esa línea fallara, si el módulo se
// reescribiera o si el hecho ocurriera por una vía que nadie instrumentó (una
// corrección a mano en la base, una importación masiva).
//
// Por eso la vía principal es `sweepDerivedEvents` (crmLifecycle.js): una pasada
// periódica que MIRA el estado real y registra lo que encuentra. Es idempotente
// por `dedupeKey`, así que puede correr mil veces; y es AUTORREPARABLE: si el
// motor estuvo caído dos días, al volver observa los hechos igual.
//
// `recordEvent` queda exportado para el caso en que la latencia importe: un
// módulo que quiera disparar en el acto puede llamarlo, y la pasada periódica no
// lo duplicará porque comparten la misma `dedupeKey`.
import crypto from 'crypto';
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';

// ── Catálogo de eventos ─────────────────────────────────────────────────────
// `derived: true` marca los que arma la pasada de observación. Los demás quedan
// declarados para que un módulo pueda empujarlos y para que el constructor
// visual pueda ofrecerlos como disparador.
export const EVENT_TYPES = [
  // Ciclo de vida — el disparador más usado. `payload.state` lleva el estado.
  { type: 'lifecycle.entered',      label: 'Entró en un estado del ciclo de vida', derived: true, group: 'ciclo' },

  // Activación / suscripción
  { type: 'subscription.paid',      label: 'Suscripción pagada',                group: 'suscripcion' },
  { type: 'subscription.expiring',  label: 'Suscripción próxima a vencer',      derived: true, group: 'suscripcion' },
  { type: 'subscription.expired',   label: 'Suscripción vencida',               derived: true, group: 'suscripcion' },
  { type: 'subscription.renewed',   label: 'Pago de renovación completado',     derived: true, group: 'suscripcion' },
  { type: 'site.created',           label: 'Sitio creado',                      derived: true, group: 'activacion' },
  { type: 'domain.connected',       label: 'Dominio conectado',                 derived: true, group: 'activacion' },
  { type: 'admin_user.created',     label: 'Usuario administrador creado',      derived: true, group: 'activacion' },
  { type: 'onboarding.completed',   label: 'Onboarding completado',             derived: true, group: 'activacion' },

  // Capacitaciones
  { type: 'training.scheduled',     label: 'Capacitación agendada',             derived: true, group: 'capacitacion' },
  { type: 'training.confirmed',     label: 'Capacitación confirmada',           derived: true, group: 'capacitacion' },
  { type: 'training.upcoming',      label: 'Capacitación próxima',              derived: true, group: 'capacitacion' },
  { type: 'training.completed',     label: 'Capacitación completada',           derived: true, group: 'capacitacion' },
  { type: 'training.cancelled',     label: 'Capacitación cancelada',            derived: true, group: 'capacitacion' },

  // Adopción de módulos
  { type: 'content.first_post',     label: 'Primera publicación creada',        derived: true, group: 'adopcion' },
  { type: 'social.connected',       label: 'Red social conectada',              derived: true, group: 'adopcion' },
  { type: 'project.published',      label: 'Proyecto publicado',                derived: true, group: 'adopcion' },
  { type: 'donation.received',      label: 'Donación recibida',                 derived: true, group: 'adopcion' },
  { type: 'event.created',          label: 'Evento creado',                     derived: true, group: 'adopcion' },
  { type: 'shop.activated',         label: 'Tienda activada',                   derived: true, group: 'adopcion' },

  // Soporte
  { type: 'support.requested',      label: 'Solicitud de soporte registrada',   derived: true, group: 'soporte' },
  { type: 'support.resolved',       label: 'Incidente resuelto',                derived: true, group: 'soporte' },

  // Inactividad
  { type: 'inactivity.no_content',   label: 'Sin publicar contenido',           derived: true, group: 'inactividad' },
  { type: 'inactivity.no_onboarding', label: 'Onboarding sin completar',        derived: true, group: 'inactividad' },
  { type: 'inactivity.no_social',    label: 'Sin redes sociales conectadas',    derived: true, group: 'inactividad' },
  { type: 'inactivity.no_projects',  label: 'Sin proyectos creados',            derived: true, group: 'inactividad' },
  { type: 'inactivity.no_training',  label: 'Sin capacitaciones agendadas',     derived: true, group: 'inactividad' },

  // Conversación (los escribe el webhook de Meta)
  { type: 'contact.replied',        label: 'El contacto respondió',             group: 'conversacion' },
  { type: 'contact.opted_out',      label: 'El contacto pidió la baja',         group: 'conversacion' },
];

export const EVENT_TYPE_KEYS = EVENT_TYPES.map(e => e.type);
const EVENT_BY_TYPE = Object.fromEntries(EVENT_TYPES.map(e => [e.type, e]));

export function eventLabel(type) {
  return EVENT_BY_TYPE[type]?.label || type;
}

export function isEventType(type) {
  return Object.prototype.hasOwnProperty.call(EVENT_BY_TYPE, type);
}

/**
 * Registra un evento. Idempotente por `dedupeKey`.
 *
 * La clave la arma quien llama y debe describir el HECHO, no el momento: para
 * "capacitación completada" la clave natural es el id de la cita, no la fecha —
 * así la pasada de observación puede volver a verla cien veces sin registrarla
 * de nuevo. Sin `dedupeKey` el evento siempre se inserta (útil para hechos que
 * de verdad se repiten, como una respuesta entrante).
 *
 * Devuelve { created, id }. `created:false` significa "ya estaba", que es una
 * respuesta correcta y no un error.
 */
export async function recordEvent({
  type,
  siteId = null,
  siteType = 'club',
  contactId = null,
  payload = {},
  dedupeKey = null,
  occurredAt = null,
} = {}) {
  if (!type) throw new Error('recordEvent: falta el tipo de evento');
  await ensureAutomationSchema();

  const id = crypto.randomUUID();
  const r = await db.query(
    `INSERT INTO "CrmEvent" (id, type, "siteId", "siteType", "contactId", payload, "dedupeKey", "occurredAt")
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7, COALESCE($8, CURRENT_TIMESTAMP))
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [id, type, siteId, siteType, contactId, JSON.stringify(payload || {}), dedupeKey, occurredAt]
  );
  if (r.rows.length) return { created: true, id: r.rows[0].id };

  // Ya existía: devolvemos el id de la fila que ganó, que es lo que necesita
  // quien quiera enlazar la inscripción con el evento que la originó.
  if (dedupeKey) {
    const prev = await db.query(`SELECT id FROM "CrmEvent" WHERE "dedupeKey"=$1 LIMIT 1`, [dedupeKey]);
    return { created: false, id: prev.rows[0]?.id || null };
  }
  return { created: false, id: null };
}

/**
 * Registra varios eventos en una sola sentencia. La pasada de observación
 * produce cientos por vuelta y hacerlos de a uno serían cientos de viajes.
 * Devuelve cuántos se crearon de verdad (los repetidos no cuentan).
 */
export async function recordEvents(events = []) {
  const list = (events || []).filter(e => e && e.type);
  if (!list.length) return { created: 0 };
  await ensureAutomationSchema();

  const values = [];
  const params = [];
  list.forEach((e, i) => {
    const b = i * 8;
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::jsonb,$${b + 7},COALESCE($${b + 8},CURRENT_TIMESTAMP))`);
    params.push(
      crypto.randomUUID(), e.type, e.siteId || null, e.siteType || 'club',
      e.contactId || null, JSON.stringify(e.payload || {}), e.dedupeKey || null,
      e.occurredAt || null
    );
  });

  const r = await db.query(
    `INSERT INTO "CrmEvent" (id, type, "siteId", "siteType", "contactId", payload, "dedupeKey", "occurredAt")
     VALUES ${values.join(',')}
     ON CONFLICT DO NOTHING
     RETURNING id`,
    params
  );
  return { created: r.rows.length };
}

/**
 * Toma los eventos sin procesar. El LIMIT existe porque la función serverless
 * corta a los 120 s: lo que no entra en esta vuelta espera a la siguiente, y no
 * se pierde porque `processedAt` sigue en NULL.
 */
export async function takePendingEvents(limit = 200) {
  await ensureAutomationSchema();
  const r = await db.query(
    `SELECT * FROM "CrmEvent"
     WHERE "processedAt" IS NULL
     ORDER BY "occurredAt" ASC
     LIMIT $1`,
    [limit]
  );
  return r.rows;
}

export async function markEventsProcessed(ids = []) {
  if (!ids.length) return 0;
  const r = await db.query(
    `UPDATE "CrmEvent" SET "processedAt"=CURRENT_TIMESTAMP WHERE id = ANY($1) AND "processedAt" IS NULL`,
    [ids]
  );
  return r.rowCount;
}

export default { EVENT_TYPES, recordEvent, recordEvents, takePendingEvents, markEventsProcessed, eventLabel, isEventType };
