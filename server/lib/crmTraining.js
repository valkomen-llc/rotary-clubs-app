// Puente entre el WhatsApp CRM y el módulo de Capacitaciones.
//
// LAS CATEGORÍAS NO SE DUPLICAN. El catálogo vive en `TrainingCategory` y lo
// administra el módulo de capacitaciones; acá sólo se lee. Copiarlo daría dos
// listas que se separan en silencio el día que alguien agregue una categoría —y
// el CRM ofrecería un tema que no se puede reservar.
//
// La cita también es la del módulo (`TrainingAppointment`): este archivo no crea
// reservas. Reservar exige disponibilidad, responsable, enlace de reunión y
// notificaciones, todo eso ya resuelto ahí. Lo que el CRM aporta es el ENLACE
// correcto, el dato de la cita para las plantillas, y el registro de que esa
// conversación derivó en una capacitación.
import db from './db.js';

/** Categorías activas del catálogo, tal como las publica el módulo. */
export async function listTrainingCategories() {
  const r = await db.query(
    `SELECT id, name, description, emoji, color, "openToAll", "sortOrder"
     FROM "TrainingCategory" WHERE active = true ORDER BY "sortOrder" ASC, name ASC`
  );
  return r.rows;
}

/** Tipos de cita reservables, con su categoría. */
export async function listTrainingTypes() {
  const r = await db.query(
    `SELECT t.id, t.name, t."categoryId", t."durationMin", t.modality, t.price,
            c.name AS "categoryName", c.emoji
     FROM "TrainingAppointmentType" t
     LEFT JOIN "TrainingCategory" c ON c.id = t."categoryId"
     WHERE t.active = true ORDER BY c."sortOrder" ASC NULLS LAST, t.name ASC`
  );
  return r.rows;
}

/**
 * Enlace de reserva. `categoryId` lo preselecciona.
 *
 * La base sale de los enlaces institucionales (`settings.links.training`), que
 * es lo mismo que usan las plantillas del motor: si se configurara aparte,
 * un recorrido y el chatbot podrían mandar a dos lugares distintos.
 */
export function buildBookingLink(links = {}, { categoryId = null, typeId = null } = {}) {
  const base = links.training;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (categoryId) url.searchParams.set('categoria', categoryId);
    if (typeId) url.searchParams.set('tipo', typeId);
    return url.toString();
  } catch {
    // Si lo configurado no es una URL válida se devuelve tal cual: es mejor
    // mandar lo que el operador escribió que romper el mensaje. La validación
    // corresponde al formulario de configuración, no acá.
    return base;
  }
}

/**
 * Citas de un sitio, ordenadas por fecha. Se usa para resolver las variables
 * `nombre_capacitacion`, `fecha_capacitacion` y `hora_capacitacion`.
 */
export async function appointmentsForSite(siteId, { siteType = 'club', limit = 20 } = {}) {
  const column = siteType === 'district' ? '"districtId"' : '"clubId"';
  const r = await db.query(
    `SELECT a.id, a."startAt", a."endAt", a.status, a.timezone, a."meetingUrl",
            t.name AS "typeName", c.name AS "categoryName", c.id AS "categoryId"
     FROM "TrainingAppointment" a
     LEFT JOIN "TrainingAppointmentType" t ON t.id = a."appointmentTypeId"
     LEFT JOIN "TrainingCategory" c ON c.id = t."categoryId"
     WHERE a.${column} = $1
     ORDER BY a."startAt" DESC LIMIT $2`,
    [siteId, limit]
  );
  return r.rows;
}

/**
 * La cita que le interesa a una plantilla: la PRÓXIMA en pie; si no hay, la
 * última completada.
 *
 * El orden importa: un recordatorio habla de la que viene, y un mensaje de
 * seguimiento, de la que pasó. Devolver siempre la más reciente por fecha
 * mezclaría las dos.
 */
export async function relevantAppointment(siteId, { siteType = 'club', now = new Date() } = {}) {
  const all = await appointmentsForSite(siteId, { siteType, limit: 50 });
  const upcoming = all
    .filter(a => ['pending', 'confirmed', 'rescheduled'].includes(a.status) && new Date(a.startAt) > now)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  if (upcoming.length) return { ...upcoming[0], when: 'upcoming' };

  const done = all
    .filter(a => a.status === 'completed')
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
  if (done.length) return { ...done[0], when: 'past' };

  return null;
}

/**
 * Qué capacitación recomendarle a un sitio.
 *
 * La regla es simple y se puede explicar: la primera categoría del catálogo que
 * ese sitio TODAVÍA no haya completado. El orden del catálogo (`sortOrder`) ya
 * es el itinerario que definió el equipo de capacitación —onboarding primero,
 * después contenido, después redes— así que respetarlo evita inventar un
 * segundo criterio que se contradiga con el suyo.
 *
 * Devuelve null cuando ya las hizo todas: no recomendar nada es la respuesta
 * correcta, y repetir la última sería empujar por empujar.
 */
export async function recommendNextTraining(siteId, { siteType = 'club' } = {}) {
  const [categories, appointments] = await Promise.all([
    listTrainingCategories(),
    appointmentsForSite(siteId, { siteType, limit: 200 }),
  ]);
  const completed = new Set(
    appointments.filter(a => a.status === 'completed' && a.categoryId).map(a => a.categoryId)
  );
  return categories.find(c => !completed.has(c.id)) || null;
}

/**
 * Marca que una conversación derivó en una capacitación agendada.
 *
 * Es lo que permite responder «¿cuántas capacitaciones salieron del CRM?» sin
 * cruzar a mano dos módulos. La cita en sí la creó el módulo de capacitaciones;
 * acá sólo se guarda el vínculo y se cierra el hilo con su motivo.
 */
export async function linkAppointmentToConversation({ conversationId, appointmentId, actorId = null }) {
  const r = await db.query(
    `UPDATE "CrmConversation"
     SET tags = ARRAY(SELECT DISTINCT t FROM unnest(COALESCE(tags,ARRAY[]::text[]) || ARRAY['capacitacion_agendada']) AS t),
         state = CASE WHEN state IN ('nuevo','en_atencion') THEN 'seguimiento' ELSE state END,
         "updatedAt" = NOW()
     WHERE id=$1 RETURNING *`,
    [conversationId]
  );
  await db.query(
    `INSERT INTO "CrmConversationEvent" (id,"conversationId",type,"actorId",detail)
     VALUES (gen_random_uuid()::text,$1,'capacitacion',$2,$3::jsonb)`,
    [conversationId, actorId, JSON.stringify({ appointmentId })]
  ).catch(() => {});
  return r.rows[0] || null;
}

/**
 * Resumen de capacitaciones de un sitio para la ficha de la conversación: qué
 * hizo, qué tiene agendado y qué le tocaría.
 */
export async function trainingSummary(siteId, { siteType = 'club' } = {}) {
  if (!siteId) return null;
  const [appointments, next] = await Promise.all([
    appointmentsForSite(siteId, { siteType, limit: 10 }),
    recommendNextTraining(siteId, { siteType }),
  ]);
  return {
    completed: appointments.filter(a => a.status === 'completed').length,
    upcoming: appointments.filter(a => ['pending', 'confirmed', 'rescheduled'].includes(a.status)
      && new Date(a.startAt) > new Date()).length,
    recent: appointments.slice(0, 5),
    recommended: next,
  };
}

export default {
  listTrainingCategories, listTrainingTypes, buildBookingLink,
  appointmentsForSite, relevantAppointment, recommendNextTraining,
  linkAppointmentToConversation, trainingSummary,
};
