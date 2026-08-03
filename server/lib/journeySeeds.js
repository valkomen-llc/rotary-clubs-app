// Recorridos precargados: Bienvenida (A) y Renovación (E).
//
// Se siembran en estado `draft` Y CON `templateId` EN NULL, a propósito.
//
// POR QUÉ NO VIENEN LISTOS PARA ENVIAR: una plantilla de WhatsApp no es un texto
// nuestro, es un objeto que Meta tiene que aprobar y que vive en la cuenta de
// WhatsApp Business del cliente. Sembrar un recorrido que apunte a plantillas
// inventadas produciría una de dos cosas: un recorrido activo que falla en el
// primer envío, o —peor— uno que parece funcionar porque nadie lo probó. Cada
// paso trae en `templateHint` qué debe decir esa plantilla; el operador la crea
// en Meta, la sincroniza desde la pestaña Templates y la asigna. Hasta entonces
// `validateJourney` impide activarlo, que es el comportamiento correcto.
//
// La siembra es ADITIVA e IDEMPOTENTE (`ON CONFLICT DO NOTHING` sobre
// clubId+key): una vez creado, el recorrido es del operador. Un despliegue no
// vuelve a tocarlo — misma regla que la plantilla del Generador de Pendones.
import crypto from 'crypto';
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';

const send = (id, hint, variables, next, extra = {}) => ({
  id, type: 'send_template', templateId: null, templateHint: hint, variables, next, ...extra,
});
const wait = (id, days, next) => ({ id, type: 'wait', days, next });
const cond = (id, condition, nextTrue, nextFalse) => ({ id, type: 'condition', condition, nextTrue, nextFalse });

// ── A. Bienvenida y activación ──────────────────────────────────────────────
// Disparador: `site.created`.
//
// El pedido lo enuncia como "suscripción activada". El motor observa el estado
// real de la plataforma y el hecho observable equivalente es que el sitio exista
// (`site.created`, con la ventana de 7 días del bus de eventos). Si el módulo de
// facturación empieza a empujar `subscription.paid` con `recordEvent`, cambiar
// el disparador de este recorrido es editar un campo — no tocar el motor.
const WELCOME = {
  key: 'bienvenida_activacion',
  name: 'Bienvenida y activación',
  goal: 'Que el club agende su onboarding dentro del primer mes.',
  status: 'draft',
  trigger: { type: 'site.created' },
  audience: {
    match: 'all',
    rules: [{ field: 'orgRole', op: 'in', value: ['president', 'platform_admin', 'communications'] }],
  },
  settings: {
    reentry: 'once',
    // Si completa el onboarding o agenda una capacitación, el recorrido sobra.
    exitOnEvents: ['onboarding.completed', 'training.scheduled'],
    exitWhen: { match: 'any', rules: [{ field: 'trainingCompleted', op: 'gte', value: 1 }] },
  },
  entryNodeId: 'bienvenida',
  nodes: [
    send('bienvenida',
      'Bienvenida: saluda al club por su nombre, confirma que su sitio está activo y entrega el enlace al panel.',
      ['nombre_contacto', 'nombre_club', 'link_admin'], 'espera_1'),

    wait('espera_1', 1, 'invitacion_onboarding'),
    send('invitacion_onboarding',
      'Invitación a agendar la sesión de onboarding, con el enlace al calendario.',
      ['nombre_contacto', 'link_capacitacion'], 'espera_2'),

    wait('espera_2', 2, 'agendo_1'),
    cond('agendo_1', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'trainingScheduled', op: 'gte', value: 1 }] } },
      'fin_agendo', 'recordatorio_1'),
    send('recordatorio_1',
      'Recordatorio suave: todavía no agendó. Repite el enlace y menciona que la sesión dura menos de una hora.',
      ['nombre_contacto', 'link_capacitacion'], 'espera_3'),

    wait('espera_3', 4, 'agendo_2'),
    cond('agendo_2', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'trainingScheduled', op: 'gte', value: 1 }] } },
      'fin_agendo', 'segunda_invitacion'),
    send('segunda_invitacion',
      'Segunda invitación: enumera dos o tres cosas concretas que el club podrá hacer después de la sesión.',
      ['nombre_contacto', 'nombre_club', 'link_capacitacion'], 'espera_4'),

    wait('espera_4', 8, 'agendo_3'),
    cond('agendo_3', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'trainingScheduled', op: 'gte', value: 1 }] } },
      'fin_agendo', 'seguimiento'),
    send('seguimiento',
      'Seguimiento personalizado: pregunta si necesita ayuda para empezar y ofrece el canal de soporte.',
      ['nombre_contacto', 'link_admin'], 'espera_5'),

    wait('espera_5', 15, 'agendo_4'),
    cond('agendo_4', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'trainingScheduled', op: 'gte', value: 1 }] } },
      'fin_agendo', 'alerta_humana'),
    {
      id: 'alerta_humana', type: 'alert', severity: 'warning',
      title: 'Club sin onboarding a 30 días de la activación',
      detail: 'Recibió los cinco mensajes de bienvenida y no agendó. Corresponde contacto humano.',
      next: 'fin_sin_agendar',
    },
    { id: 'fin_sin_agendar', type: 'exit', reason: 'sin_onboarding_tras_30_dias', goalReached: false },
    { id: 'fin_agendo', type: 'exit', reason: 'onboarding_agendado', goalReached: true },
  ],
};

// ── E. Renovación ───────────────────────────────────────────────────────────
// Disparador: entrada en `proximo_renovar`, que la derivación fija al cruzar la
// ventana de preaviso (45 días por defecto, `LIFECYCLE_RENEWAL_WINDOW_DAYS`).
//
// Las esperas son DIFERENCIAS entre los hitos del pedido (45→30→15→7→0→+3→+7→
// +15→+30), no días absolutos: el recorrido arranca cuando el sitio entra en la
// ventana, así que encadenar diferencias es lo que hace que los mensajes caigan
// en la fecha correcta aunque el motor haya estado caído unas horas.
const RENEWAL = {
  key: 'renovacion_suscripcion',
  name: 'Renovación de la suscripción',
  goal: 'Que el club renueve antes de que se agote el período de gracia.',
  status: 'draft',
  trigger: { type: 'lifecycle.entered', state: 'proximo_renovar' },
  audience: {
    match: 'all',
    rules: [{ field: 'orgRole', op: 'in', value: ['president', 'treasurer', 'platform_admin'] }],
  },
  settings: {
    reentry: 'per_event',
    // Lo que impide cobrarle la renovación a quien ya renovó. Se evalúa ANTES DE
    // CADA PASO, no sólo al inscribir: el recorrido dura 75 días y la renovación
    // ocurre en medio.
    exitOnEvents: ['subscription.renewed'],
    exitWhen: {
      match: 'any',
      rules: [{ field: 'lifecycleState', op: 'in', value: ['reactivado', 'activo_uso_frecuente', 'activo_bajo_uso', 'sitio_produccion'] }],
    },
  },
  entryNodeId: 'aviso_45',
  nodes: [
    send('aviso_45',
      'Aviso preventivo a 45 días: informa la fecha de vencimiento sin urgencia y agradece el año.',
      ['nombre_contacto', 'nombre_club', 'fecha_vencimiento'], 'e_30'),

    wait('e_30', 15, 'aviso_30'),
    send('aviso_30',
      'A 30 días: recuerda qué módulos seguirá teniendo el club al renovar y entrega el enlace de renovación.',
      ['nombre_contacto', 'fecha_vencimiento', 'link_renovacion'], 'e_15'),

    wait('e_15', 15, 'aviso_15'),
    send('aviso_15',
      'A 15 días: recordatorio breve con la fecha y el enlace.',
      ['nombre_contacto', 'fecha_vencimiento', 'link_renovacion'], 'e_7'),

    wait('e_7', 8, 'aviso_7'),
    send('aviso_7',
      'A 7 días: prioridad alta. Menciona que el sitio dejaría de estar disponible.',
      ['nombre_contacto', 'nombre_club', 'fecha_vencimiento', 'link_renovacion'], 'e_0'),

    wait('e_0', 7, 'aviso_vencimiento'),
    send('aviso_vencimiento',
      'Día del vencimiento: notificación formal, con el enlace y el canal de soporte.',
      ['nombre_contacto', 'nombre_club', 'link_renovacion'], 'e_g3'),

    wait('e_g3', 3, 'aviso_gracia'),
    send('aviso_gracia',
      'Período de gracia: el sitio sigue en pie unos días más; explica hasta cuándo.',
      ['nombre_contacto', 'estado_suscripcion', 'link_renovacion'], 'e_g7'),

    wait('e_g7', 4, 'aviso_suspension'),
    send('aviso_suspension',
      'Riesgo de suspensión: enumera qué deja de estar disponible al suspenderse.',
      ['nombre_contacto', 'nombre_club', 'link_renovacion'], 'e_g15'),

    wait('e_g15', 8, 'invitacion_reactivar'),
    send('invitacion_reactivar',
      'Invitación a reactivar: ofrece agendar una capacitación después de la reactivación.',
      ['nombre_contacto', 'link_renovacion', 'link_capacitacion'], 'e_g30'),

    wait('e_g30', 15, 'ultimo_seguimiento'),
    send('ultimo_seguimiento',
      'Último seguimiento: pregunta si hubo un motivo para no renovar y deja el canal abierto.',
      ['nombre_contacto', 'nombre_club'], 'alerta_no_renovo'),

    {
      id: 'alerta_no_renovo', type: 'alert', severity: 'error',
      title: 'Club sin renovar a 30 días del vencimiento',
      detail: 'Completó el recorrido de renovación sin renovar. Corresponde contacto humano antes de darlo de baja.',
      next: 'fin_no_renovo',
    },
    { id: 'fin_no_renovo', type: 'exit', reason: 'no_renovo', goalReached: false },
  ],
};

// ── B. Onboarding ───────────────────────────────────────────────────────────
// Disparador: `training.scheduled` — la cita quedó reservada.
//
// Los recordatorios de 24 h y 1 h de la CITA ya los manda el módulo de
// Capacitaciones (`/api/cron/training-reminders`, por correo). Este recorrido NO
// los repite: duplicarlos le llegaría dos veces a la misma persona por dos
// canales para el mismo hecho. Lo que aporta acá es la confirmación por WhatsApp
// y el seguimiento POSTERIOR, que el módulo de capacitaciones no cubre.
const ONBOARDING = {
  key: 'onboarding_capacitacion',
  name: 'Onboarding: confirmación y próximos pasos',
  goal: 'Que el club llegue a su sesión y salga de ella con la siguiente agendada.',
  status: 'draft',
  trigger: { type: 'training.scheduled' },
  audience: {
    match: 'all',
    rules: [{ field: 'orgRole', op: 'in', value: ['president', 'platform_admin', 'technology', 'communications'] }],
  },
  settings: {
    reentry: 'per_event',
    exitOnEvents: ['training.cancelled'],
  },
  entryNodeId: 'confirmacion',
  nodes: [
    send('confirmacion',
      'Confirmación de la sesión: fecha, hora y qué conviene tener a mano. Incluir el enlace al panel.',
      ['nombre_contacto', 'nombre_capacitacion', 'fecha_capacitacion', 'hora_capacitacion'], 'esperar_sesion'),

    // La espera cubre el tiempo hasta después de la sesión. El seguimiento sale
    // sólo si la cita llegó a completarse.
    wait('esperar_sesion', 8, 'se_hizo'),
    cond('se_hizo', { kind: 'event', eventType: 'training.completed', withinDays: 30 },
      'proximos_pasos', 'no_asistio'),

    send('proximos_pasos',
      'Después de la sesión: resumen de lo que se vio y qué hacer esta semana en el panel.',
      ['nombre_contacto', 'link_admin'], 'esperar_segunda'),

    wait('esperar_segunda', 7, 'invitar_segunda'),
    send('invitar_segunda',
      'Invitación a la siguiente capacitación del itinerario, con el enlace para reservarla.',
      ['nombre_contacto', 'link_capacitacion'], 'fin_ok'),

    send('no_asistio',
      'La sesión no llegó a hacerse: ofrecer reprogramarla sin fricción, con el enlace.',
      ['nombre_contacto', 'link_capacitacion'], 'fin_no_asistio'),

    { id: 'fin_ok', type: 'exit', reason: 'onboarding_completado', goalReached: true },
    { id: 'fin_no_asistio', type: 'exit', reason: 'no_asistio', goalReached: false },
  ],
};

// ── C. Adopción ─────────────────────────────────────────────────────────────
// Disparador: `onboarding.completed`. Es el recorrido más largo del pedido
// —doce meses— y por eso el que más depende de la condición de salida: en un
// año el club puede vencer, suspenderse o darse de baja.
const ADOPTION = {
  key: 'adopcion_modulos',
  name: 'Adopción de módulos (12 meses)',
  goal: 'Que el club use un módulo nuevo por mes y llegue a la renovación con el sitio vivo.',
  status: 'draft',
  trigger: { type: 'onboarding.completed' },
  audience: {
    match: 'all',
    rules: [{ field: 'orgRole', op: 'in', value: ['president', 'platform_admin', 'communications', 'public_image'] }],
  },
  settings: {
    reentry: 'once',
    // Un club vencido o suspendido no tiene por qué recibir consejos de uso.
    exitWhen: {
      match: 'any',
      rules: [{ field: 'lifecycleState', op: 'in', value: ['suscripcion_vencida', 'periodo_gracia', 'suspendido', 'cancelado'] }],
    },
  },
  entryNodeId: 'sem_1',
  nodes: [
    send('sem_1', 'Semana 1 — administración del sitio web: dónde se edita cada cosa.',
      ['nombre_contacto', 'link_admin'], 'e_s2'),
    wait('e_s2', 7, 'sem_2'),
    send('sem_2', 'Semana 2 — creación de contenido con IA: el Generador de Publicaciones.',
      ['nombre_contacto', 'link_admin'], 'e_s3'),
    wait('e_s3', 7, 'sem_3'),

    // Antes de empujar redes se comprueba si ya las conectó: insistir con algo
    // ya hecho es la forma más rápida de que dejen de leer.
    cond('sem_3', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'socialCount', op: 'lte', value: 0 }] } },
      'redes', 'e_s4'),
    send('redes', 'Semana 3 — conectar las redes sociales desde el Hub Social.',
      ['nombre_contacto', 'link_admin'], 'e_s4'),

    wait('e_s4', 7, 'sem_4'),
    send('sem_4', 'Semana 4 — noticias y posicionamiento: por qué publicar seguido mejora la visibilidad.',
      ['nombre_contacto', 'link_admin'], 'e_m2'),

    wait('e_m2', 30, 'mes_2'),
    cond('mes_2', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'projectCount', op: 'lte', value: 0 }] } },
      'proyectos', 'e_m3'),
    send('proyectos', 'Mes 2 — proyectos y crowdfunding: cómo publicar el primero.',
      ['nombre_contacto', 'link_admin'], 'e_m3'),

    wait('e_m3', 30, 'mes_3'),
    cond('mes_3', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'donationCount', op: 'lte', value: 0 }] } },
      'donaciones', 'e_m4'),
    send('donaciones', 'Mes 3 — fundraising: dejar el módulo de donaciones listo para recibir.',
      ['nombre_contacto', 'link_admin'], 'e_m4'),

    wait('e_m4', 30, 'mes_4'),
    cond('mes_4', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'eventCount', op: 'lte', value: 0 }] } },
      'eventos', 'e_m5'),
    send('eventos', 'Mes 4 — eventos e inscripciones: publicar el primero y cobrarlo.',
      ['nombre_contacto', 'link_admin'], 'e_m5'),

    wait('e_m5', 30, 'mes_5'),
    cond('mes_5', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'productCount', op: 'lte', value: 0 }] } },
      'tienda', 'e_m6'),
    send('tienda', 'Mes 5 — tienda virtual: vender productos del club.',
      ['nombre_contacto', 'link_admin'], 'e_m6'),

    wait('e_m6', 30, 'mes_6'),
    send('mes_6', 'Mes 6 — analítica: qué mirar para saber si el sitio está funcionando.',
      ['nombre_contacto', 'link_admin'], 'e_m9'),

    wait('e_m9', 90, 'mes_9'),
    send('mes_9', 'Mes 9 — revisión estratégica: invitación a una sesión para ver el año.',
      ['nombre_contacto', 'link_capacitacion'], 'e_m11'),

    wait('e_m11', 60, 'mes_11'),
    send('mes_11', 'Mes 11 — preparación de la renovación: qué viene el año próximo.',
      ['nombre_contacto', 'nombre_club', 'fecha_vencimiento'], 'fin'),

    { id: 'fin', type: 'exit', reason: 'ciclo_de_adopcion_completo', goalReached: true },
  ],
};

// ── D. Reactivación por bajo uso ────────────────────────────────────────────
// Disparador: entrada en `activo_bajo_uso`, que la derivación fija tras
// `LIFECYCLE_LOW_USAGE_DAYS` (30) sin contenido nuevo.
const REACTIVATION = {
  key: 'reactivacion_bajo_uso',
  name: 'Reactivación por bajo uso',
  goal: 'Que un club sin actividad vuelva a publicar o agende una capacitación.',
  status: 'draft',
  trigger: { type: 'lifecycle.entered', state: 'activo_bajo_uso' },
  audience: {
    match: 'all',
    rules: [{ field: 'orgRole', op: 'in', value: ['president', 'platform_admin', 'communications'] }],
  },
  settings: {
    reentry: 'per_event',
    // Basta con que vuelva a publicar algo para que el recorrido sobre.
    exitOnEvents: ['content.first_post', 'project.published', 'social.connected', 'training.scheduled'],
    exitWhen: {
      match: 'any',
      rules: [{ field: 'lifecycleState', op: 'in', value: ['activo_uso_frecuente', 'suspendido', 'cancelado'] }],
    },
  },
  entryNodeId: 'recordatorio',
  nodes: [
    send('recordatorio',
      'Recordatorio amable de las herramientas disponibles, sin reproche. Enlace al panel.',
      ['nombre_contacto', 'nombre_club', 'link_admin'], 'e_1'),

    wait('e_1', 7, 'invitar_capacitacion'),
    send('invitar_capacitacion',
      'Invitación a una capacitación corta para retomar, con el enlace de reserva.',
      ['nombre_contacto', 'link_capacitacion'], 'e_2'),

    wait('e_2', 10, 'sugerencia'),
    // La sugerencia se elige por lo que le falta al club, no por un guion fijo.
    cond('sugerencia', { kind: 'audience', audience: { match: 'all', rules: [{ field: 'socialCount', op: 'lte', value: 0 }] } },
      'sugerir_redes', 'sugerir_contenido'),
    send('sugerir_redes',
      'Sugerencia concreta: conectar una red social lleva cinco minutos y multiplica el alcance.',
      ['nombre_contacto', 'link_admin'], 'e_3'),
    send('sugerir_contenido',
      'Sugerencia concreta: publicar una noticia del club con el generador de contenido.',
      ['nombre_contacto', 'link_admin'], 'e_3'),

    wait('e_3', 14, 'sin_respuesta'),
    {
      id: 'sin_respuesta', type: 'alert', severity: 'warning',
      title: 'Club con bajo uso que no reaccionó al recorrido',
      detail: 'Recibió los tres mensajes de reactivación y sigue sin publicar. Conviene una llamada.',
      next: 'fin',
    },
    { id: 'fin', type: 'exit', reason: 'sin_reaccion', goalReached: false },
  ],
};

// ── F. Sitios vencidos ──────────────────────────────────────────────────────
// Disparador: entrada en `suspendido`.
//
// Es distinto del recorrido de renovación: aquél acompaña al club ANTES y
// durante la gracia; éste empieza cuando el sitio ya dejó de estar disponible.
// Por eso el tono y el contenido cambian —acá ya hay un servicio interrumpido
// que explicar— y por eso son dos recorridos y no uno con más pasos.
const EXPIRED = {
  key: 'sitios_vencidos',
  name: 'Sitios vencidos y suspendidos',
  goal: 'Recuperar al club después de la suspensión, o cerrar el ciclo con claridad.',
  status: 'draft',
  trigger: { type: 'lifecycle.entered', state: 'suspendido' },
  audience: {
    match: 'all',
    rules: [{ field: 'orgRole', op: 'in', value: ['president', 'treasurer', 'platform_admin'] }],
  },
  settings: {
    reentry: 'per_event',
    exitOnEvents: ['subscription.renewed'],
    exitWhen: {
      match: 'any',
      rules: [{ field: 'lifecycleState', op: 'in', value: ['reactivado', 'activo_uso_frecuente', 'activo_bajo_uso', 'sitio_produccion'] }],
    },
  },
  entryNodeId: 'estado_actual',
  nodes: [
    send('estado_actual',
      'Estado de la suscripción: qué pasó, desde cuándo, y que los datos del club siguen guardados.',
      ['nombre_contacto', 'nombre_club', 'estado_suscripcion', 'link_renovacion'], 'e_1'),

    wait('e_1', 5, 'que_se_pierde'),
    send('que_se_pierde',
      'Qué deja de estar disponible mientras el sitio esté suspendido, dicho sin dramatismo.',
      ['nombre_contacto', 'link_renovacion'], 'e_2'),

    wait('e_2', 10, 'reactivar'),
    send('reactivar',
      'Cómo reactivar y la oferta de una capacitación de puesta al día después de hacerlo.',
      ['nombre_contacto', 'link_renovacion', 'link_capacitacion'], 'e_3'),

    wait('e_3', 15, 'soporte'),
    send('soporte',
      'Canal de soporte abierto: si hubo un motivo para no renovar, queremos escucharlo.',
      ['nombre_contacto'], 'e_4'),

    wait('e_4', 20, 'alerta_final'),
    {
      id: 'alerta_final', type: 'alert', severity: 'error',
      title: 'Sitio suspendido sin recuperar tras 50 días',
      detail: 'Completó el recorrido de sitios vencidos sin renovar. Decidir si se archiva o se hace un último contacto.',
      next: 'fin',
    },
    { id: 'fin', type: 'exit', reason: 'no_recuperado', goalReached: false },
  ],
};

export const SEED_JOURNEYS = [WELCOME, ONBOARDING, ADOPTION, REACTIVATION, RENEWAL, EXPIRED];

/**
 * Siembra los recorridos que falten. No pisa los existentes.
 * Devuelve las claves de los que se crearon en esta llamada.
 */
export async function ensureSeedJourneys(clubId) {
  if (!clubId) return { created: [] };
  await ensureAutomationSchema();

  const created = [];
  for (const seed of SEED_JOURNEYS) {
    const r = await db.query(
      `INSERT INTO "CrmJourney" (id,"clubId",key,name,goal,status,audience,trigger,nodes,settings,"isSeed")
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,true)
       ON CONFLICT ("clubId", key) DO NOTHING
       RETURNING key`,
      [
        crypto.randomUUID(), clubId, seed.key, seed.name, seed.goal, seed.status,
        JSON.stringify(seed.audience), JSON.stringify(seed.trigger),
        JSON.stringify(seed.nodes),
        // `entryNodeId` viaja dentro de `settings` porque `CrmJourney` no tiene
        // columna propia para él. Dejarlo implícito en "el primer nodo del
        // array" funcionaría hoy —los dos recorridos empiezan por su primer
        // elemento— y se rompería el día que alguien reordene los pasos en el
        // constructor sin querer mover el comienzo.
        JSON.stringify({ ...seed.settings, entryNodeId: seed.entryNodeId }),
      ]
    );
    if (r.rows.length) created.push(r.rows[0].key);
  }
  return { created };
}

export default { SEED_JOURNEYS, ensureSeedJourneys };
