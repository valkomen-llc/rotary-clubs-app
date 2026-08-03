// Estados del ciclo de vida de un sitio — fuente de verdad del motor de
// automatización del WhatsApp CRM.
//
// QUÉ RESUELVE: hasta ahora "en qué momento está este club" se deducía a mano en
// cada pantalla a partir de tres campos sueltos (`status`, `subscriptionStatus`,
// `expirationDate`) y del pipeline de `SiteActivationPhase`. Eso alcanza para
// pintar un semáforo, pero no para decidir A QUIÉN se le escribe hoy: la misma
// combinación de campos significa cosas distintas según si el club ya hizo su
// onboarding, si publicó algo el mes pasado o si acaba de renovar.
//
// El estado NO se escribe a mano: se DERIVA de señales observables (§
// `deriveLifecycleState`) y se guarda en `CrmLifecycleState` para poder detectar
// la TRANSICIÓN, que es lo que dispara los recorridos. Guardar sólo el estado
// actual no bastaría: "está vencido" no es un evento, "acaba de vencer" sí.
//
// La única excepción es `manualState`: un operador puede fijar el estado de un
// sitio (típicamente `prospecto` o `cancelado`, que no se deducen de nada que la
// plataforma observe) y entonces la derivación no lo pisa.

// ── Catálogo de estados ─────────────────────────────────────────────────────
// `order` sirve para ordenar el tablero, no para comparar: el ciclo no es lineal
// (un sitio reactivado vuelve atrás). `group` es lo que usa la UI para agrupar.
export const LIFECYCLE_STATES = [
  { key: 'prospecto',            label: 'Prospecto',                     order: 1,  group: 'previo',      manualOnly: true,
    description: 'Todavía no es cliente. No se deduce de la plataforma: se fija a mano o llega desde el módulo de leads.' },
  { key: 'pendiente_activacion', label: 'Pendiente de activación',       order: 2,  group: 'previo',
    description: 'La suscripción está pagada pero el sitio aún no tiene dominio ni usuario administrador.' },
  { key: 'suscripcion_activa',   label: 'Suscripción activa',            order: 3,  group: 'activo',
    description: 'Estado de respaldo: la suscripción está vigente y ninguna señal más específica aplica.' },
  { key: 'onboarding_pendiente', label: 'Onboarding pendiente',          order: 4,  group: 'implantacion',
    description: 'El sitio existe pero no completó ninguna fase de activación.' },
  { key: 'onboarding_iniciado',  label: 'Onboarding iniciado',           order: 5,  group: 'implantacion',
    description: 'Avanzó algunas fases de activación pero no todas.' },
  { key: 'en_implementacion',    label: 'En implementación',             order: 6,  group: 'implantacion',
    description: 'Completó las fases de activación pero todavía no publicó contenido propio.' },
  { key: 'sitio_pruebas',        label: 'Sitio en pruebas',              order: 7,  group: 'implantacion',
    description: 'Tiene el aviso de sitio en desarrollo encendido o todavía no conectó un dominio propio.' },
  { key: 'sitio_produccion',     label: 'Sitio en producción',           order: 8,  group: 'activo',
    description: 'Dominio conectado, activación completa y sin aviso de desarrollo.' },
  { key: 'capacitacion_pendiente', label: 'Capacitación pendiente',      order: 9,  group: 'activo',
    description: 'En producción pero sin ninguna capacitación completada.' },
  { key: 'activo_bajo_uso',      label: 'Sitio activo con bajo uso',     order: 10, group: 'activo',
    description: 'Sin contenido nuevo en el período de inactividad configurado.' },
  { key: 'activo_uso_frecuente', label: 'Sitio activo con uso frecuente', order: 11, group: 'activo',
    description: 'Publicó contenido dentro del período de actividad configurado.' },
  { key: 'proximo_renovar',      label: 'Próximo a renovar',             order: 12, group: 'renovacion',
    description: 'La fecha de vencimiento entra en la ventana de preaviso.' },
  { key: 'suscripcion_vencida',  label: 'Suscripción vencida',           order: 13, group: 'renovacion',
    description: 'Pasó la fecha de vencimiento y todavía no empezó el período de gracia.' },
  { key: 'periodo_gracia',       label: 'En período de gracia',          order: 14, group: 'renovacion',
    description: 'Vencido, con los servicios aún disponibles mientras dura la gracia.' },
  { key: 'suspendido',           label: 'Suspendido',                    order: 15, group: 'renovacion',
    description: 'El sitio quedó inactivo: se agotó la gracia o un operador lo suspendió.' },
  { key: 'reactivado',           label: 'Reactivado',                    order: 16, group: 'renovacion',
    description: 'Volvió a estar vigente después de haber estado vencido, suspendido o en gracia.' },
  { key: 'cancelado',            label: 'Cancelado',                     order: 17, group: 'final',      manualOnly: true,
    description: 'Bajó del servicio. No se deduce: lo fija un operador.' },
];

export const LIFECYCLE_BY_KEY = Object.fromEntries(LIFECYCLE_STATES.map(s => [s.key, s]));
export const LIFECYCLE_KEYS = LIFECYCLE_STATES.map(s => s.key);

export function lifecycleLabel(key) {
  return LIFECYCLE_BY_KEY[key]?.label || key || '—';
}

export function isLifecycleKey(key) {
  return Object.prototype.hasOwnProperty.call(LIFECYCLE_BY_KEY, key);
}

// ── Umbrales ────────────────────────────────────────────────────────────────
// Configurables por entorno porque son decisiones comerciales, no técnicas: el
// día que el equipo quiera avisar con 60 días en vez de 45 no debería hacer
// falta desplegar. Los valores por defecto salen del pedido del cliente y del
// cron de expiraciones que ya existe (`process-expirations` usa 5 días de gracia).
const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const LIFECYCLE_THRESHOLDS = {
  // Días antes del vencimiento en que un sitio pasa a "próximo a renovar".
  renewalWindowDays: num(process.env.LIFECYCLE_RENEWAL_WINDOW_DAYS, 45),
  // Día, contado desde el vencimiento, en que "vencida" pasa a "período de gracia".
  graceStartDays: num(process.env.LIFECYCLE_GRACE_START_DAYS, 3),
  // Día en que se agota la gracia. Coincide con el cron de suspensión existente.
  graceEndDays: num(process.env.LIFECYCLE_GRACE_END_DAYS, 5),
  // Cuánto tiempo un sitio que volvió se muestra como "reactivado".
  reactivatedWindowDays: num(process.env.LIFECYCLE_REACTIVATED_WINDOW_DAYS, 14),
  // Días sin contenido nuevo para considerar bajo uso.
  lowUsageDays: num(process.env.LIFECYCLE_LOW_USAGE_DAYS, 30),
};

export const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (a, b) => (a.getTime() - b.getTime()) / DAY_MS;

// ── Derivación ──────────────────────────────────────────────────────────────
// `signals` es el objeto que arma `collectLifecycleSignals` (crmLifecycle.js).
// Esta función es PURA a propósito: es la parte que hay que poder razonar y
// probar sin base de datos.
//
// El orden importa y es el orden de la lista: gana la primera que aplica. La
// precedencia va de lo más terminal (cancelado, suspendido) a lo más matizado
// (bajo uso / uso frecuente), porque a un club suspendido no le interesa que le
// digamos que publica poco.
export function deriveLifecycleState(signals, now = new Date()) {
  const s = signals || {};
  const T = LIFECYCLE_THRESHOLDS;

  // Un estado fijado a mano manda sobre todo lo demás. Es la vía para
  // `prospecto` y `cancelado`, que no se observan desde la plataforma.
  if (s.manualState && isLifecycleKey(s.manualState)) {
    return { state: s.manualState, reason: 'manual', manual: true };
  }

  const status = String(s.status || 'active').toLowerCase();
  const sub = String(s.subscriptionStatus || 'active').toLowerCase();
  const exp = s.expirationDate ? new Date(s.expirationDate) : null;
  const expired = !!exp && exp.getTime() < now.getTime();
  const daysSinceExpiry = exp ? daysBetween(now, exp) : null;
  const daysToExpiry = exp ? daysBetween(exp, now) : null;

  if (status === 'cancelled' || sub === 'cancelled') {
    return { state: 'cancelado', reason: 'subscription_cancelled' };
  }

  // Suspendido: lo marca el cron de expiraciones (`status='inactive'`) o un
  // operador. También cae acá el vencido que agotó la gracia aunque el cron
  // todavía no haya corrido — así el estado no depende del reloj de otro proceso.
  if (status === 'inactive' || status === 'suspended') {
    return { state: 'suspendido', reason: 'site_inactive' };
  }
  if (expired && daysSinceExpiry > T.graceEndDays) {
    return { state: 'suspendido', reason: 'grace_exhausted', daysSinceExpiry };
  }
  if (expired && daysSinceExpiry >= T.graceStartDays) {
    return { state: 'periodo_gracia', reason: 'in_grace', daysSinceExpiry };
  }
  if (expired || sub === 'expired') {
    return { state: 'suscripcion_vencida', reason: 'past_due', daysSinceExpiry };
  }

  // Reactivado: vigente ahora, pero el estado ANTERIOR guardado decía que no lo
  // estaba. Es la única regla que mira el pasado, y por eso el estado se
  // persiste en vez de recalcularse y descartarse.
  const cameBackFrom = ['suscripcion_vencida', 'periodo_gracia', 'suspendido'];
  if (
    s.previousState && cameBackFrom.includes(s.previousState) &&
    s.previousStateSince && daysBetween(now, new Date(s.previousStateSince)) <= T.reactivatedWindowDays
  ) {
    return { state: 'reactivado', reason: 'back_from_' + s.previousState };
  }

  // Sin sitio publicado ni administrador: la suscripción se pagó pero no hay
  // nada que usar todavía.
  if (!s.hasDomain && !s.hasAdminUser) {
    return { state: 'pendiente_activacion', reason: 'no_site_no_admin' };
  }

  // Preaviso de renovación. Va ANTES del bloque de implantación y del de uso a
  // propósito: si al club le vence en tres semanas, ése es el mensaje que
  // importa, aunque además publique poco o le falte una capacitación.
  if (daysToExpiry !== null && daysToExpiry <= T.renewalWindowDays) {
    return { state: 'proximo_renovar', reason: 'renewal_window', daysToExpiry };
  }

  // Implantación, según el pipeline de `SiteActivationPhase`.
  const totalPhases = Number(s.activationPhasesTotal || 0);
  const donePhases = Number(s.activationPhasesCompleted || 0);
  if (totalPhases > 0 && donePhases === 0) {
    return { state: 'onboarding_pendiente', reason: 'no_phase_completed' };
  }
  if (totalPhases > 0 && donePhases < totalPhases) {
    return { state: 'onboarding_iniciado', reason: 'phases_in_progress', donePhases, totalPhases };
  }

  // `contentTracked:false` significa que para este tipo de sitio NO medimos
  // contenido, no que no tenga. Un distrito no tiene `Post` ni `Publication`
  // colgando: sin esta distinción todos los distritos caerían para siempre en
  // "en implementación" por una ausencia que nunca se va a llenar. Los estados
  // que dependen del contenido —implementación, bajo uso, uso frecuente— se
  // saltean para esos sitios en vez de resolverse con un dato inventado.
  const contentTracked = s.contentTracked !== false;

  if (contentTracked && !s.hasPublishedContent) {
    return { state: 'en_implementacion', reason: 'no_content_yet' };
  }

  // Pruebas frente a producción. El aviso de "sitio en desarrollo" es una
  // decisión explícita del operador, así que manda sobre el dominio.
  if (s.developmentBannerActive || !s.hasDomain) {
    return { state: 'sitio_pruebas', reason: s.developmentBannerActive ? 'development_banner' : 'no_domain' };
  }

  if (!s.hasCompletedTraining) {
    return { state: 'capacitacion_pendiente', reason: 'no_training_completed' };
  }

  if (contentTracked) {
    const lastActivity = s.lastActivityAt ? new Date(s.lastActivityAt) : null;
    if (!lastActivity || daysBetween(now, lastActivity) > T.lowUsageDays) {
      return {
        state: 'activo_bajo_uso',
        reason: 'no_recent_content',
        daysSinceActivity: lastActivity ? Math.floor(daysBetween(now, lastActivity)) : null,
      };
    }
    return { state: 'activo_uso_frecuente', reason: 'recent_content' };
  }

  return { state: 'sitio_produccion', reason: 'default_active' };
}

// ── Transiciones ────────────────────────────────────────────────────────────
// El motor no dispara por "estado igual a X" sino por "entró en X". Esto compara
// lo guardado con lo derivado y devuelve la transición, o null si no cambió.
export function diffLifecycle(previous, derived) {
  const from = previous || null;
  const to = derived?.state || null;
  if (!to || from === to) return null;
  return { from, to, reason: derived.reason || null };
}

export default {
  LIFECYCLE_STATES,
  LIFECYCLE_BY_KEY,
  LIFECYCLE_KEYS,
  LIFECYCLE_THRESHOLDS,
  lifecycleLabel,
  isLifecycleKey,
  deriveLifecycleState,
  diffLifecycle,
};
