// Guardrails de envío del WhatsApp CRM.
//
// Es la única puerta por la que el motor de automatización manda un mensaje. Su
// trabajo no es decidir QUÉ decir sino si corresponde decirlo ahora, a esta
// persona, por este canal.
//
// LA DISTINCIÓN QUE IMPORTA: no todos los frenos son iguales.
//
//   · `skip`  — no se envía y no se volverá a intentar. La persona pidió la
//               baja, no dio consentimiento o el número no sirve. Reintentar
//               sería insistirle a quien dijo que no.
//   · `defer` — no se envía AHORA. Es de noche donde vive, o ya recibió
//               demasiados mensajes esta semana. La inscripción se reprograma y
//               el mensaje sale cuando corresponde.
//
// Confundir las dos es el defecto clásico: tratar "es de noche" como un descarte
// pierde el mensaje, y tratar "pidió la baja" como un aplazamiento lo convierte
// en acoso diferido.
import db from './db.js';
import { validateForMeta } from './phone.js';
import { utcToZonedParts } from './timezone.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';

// ── Configuración global ────────────────────────────────────────────────────
// Vive en `PlatformConfig` para que el superadministrador la cambie desde el
// panel sin desplegar. Los valores por defecto son deliberadamente
// conservadores: un motor de envíos mal configurado hace daño reputacional que
// no se deshace.
export const DEFAULT_SETTINGS = {
  timezone: 'America/Bogota',
  // Ventana de envío en hora local del destinatario, en minutos desde medianoche.
  sendWindowStartMin: 8 * 60,   // 08:00
  sendWindowEndMin: 20 * 60,    // 20:00
  // Días de la semana permitidos (0 = domingo). Por defecto, todos.
  sendWeekdays: [0, 1, 2, 3, 4, 5, 6],
  // Tope de mensajes automáticos por contacto y ventana.
  maxPerContactPerWindow: 3,
  frequencyWindowDays: 7,
  // No repetir la MISMA plantilla al mismo contacto dentro de estos días.
  sameTemplateCooldownDays: 14,
  // Categorías de plantilla que exigen consentimiento explícito. Las de utilidad
  // (una confirmación de cita que el club pidió) se admiten con consentimiento
  // sin registrar; las de marketing, no.
  requireExplicitConsentFor: ['MARKETING'],
  // Reintentos ante un fallo de la API de Meta antes de dar la inscripción por
  // fallida.
  maxSendAttempts: 3,
};

const SETTINGS_KEY = 'crm_automation_settings';
let _settingsCache = null;
let _settingsCachedAt = 0;
const SETTINGS_TTL_MS = 60_000;

export async function getAutomationSettings({ fresh = false } = {}) {
  if (!fresh && _settingsCache && Date.now() - _settingsCachedAt < SETTINGS_TTL_MS) return _settingsCache;
  let stored = {};
  try {
    const r = await db.query(`SELECT value FROM "PlatformConfig" WHERE key=$1 LIMIT 1`, [SETTINGS_KEY]);
    if (r.rows.length) stored = JSON.parse(r.rows[0].value || '{}');
  } catch { /* sin fila o JSON ilegible: se usan los valores por defecto */ }
  _settingsCache = { ...DEFAULT_SETTINGS, ...stored };
  _settingsCachedAt = Date.now();
  return _settingsCache;
}

export async function saveAutomationSettings(patch = {}) {
  const current = await getAutomationSettings({ fresh: true });
  const next = { ...current, ...patch };
  await db.query(
    `INSERT INTO "PlatformConfig" (id, key, value, "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, "updatedAt"=NOW()`,
    [SETTINGS_KEY, JSON.stringify(next)]
  );
  _settingsCache = next;
  _settingsCachedAt = Date.now();
  return next;
}

// ── Ventana de envío ────────────────────────────────────────────────────────
/**
 * Próximo instante permitido a partir de `from`. Devuelve `null` si `from` ya
 * está dentro de la ventana.
 *
 * Se calcula en la zona horaria del destinatario, no en la del servidor: la
 * función corre en UTC y "las 8 de la mañana" no significa lo mismo en Bogotá
 * que en Madrid. La plataforma tiene clubes en varios países.
 */
export function nextAllowedSendTime(from, settings, timeZone) {
  const tz = timeZone || settings.timezone || 'America/Bogota';
  const start = settings.sendWindowStartMin ?? 0;
  const end = settings.sendWindowEndMin ?? 1440;
  const days = Array.isArray(settings.sendWeekdays) && settings.sendWeekdays.length
    ? settings.sendWeekdays : [0, 1, 2, 3, 4, 5, 6];

  let cursor = new Date(from);
  // Como máximo una semana por delante: si en siete días no hay ninguna ventana
  // válida, la configuración es imposible y hay que decirlo, no girar en vacío.
  for (let guard = 0; guard < 8 * 24; guard++) {
    let parts;
    try { parts = utcToZonedParts(cursor, tz); }
    catch { return null; } // zona horaria inválida: no bloqueamos el envío por eso
    const okDay = days.includes(parts.weekday);
    const okTime = parts.minutesFromMidnight >= start && parts.minutesFromMidnight < end;
    if (okDay && okTime) return cursor.getTime() === new Date(from).getTime() ? null : cursor;

    if (okDay && parts.minutesFromMidnight < start) {
      // Mismo día, más tarde.
      cursor = new Date(cursor.getTime() + (start - parts.minutesFromMidnight) * 60_000);
    } else {
      // Al comienzo del día siguiente, y se vuelve a evaluar.
      const toMidnight = (1440 - parts.minutesFromMidnight) * 60_000;
      cursor = new Date(cursor.getTime() + toMidnight + start * 60_000);
    }
  }
  return null;
}

// ── Evaluación ──────────────────────────────────────────────────────────────
const skip = (reason, detail) => ({ decision: 'skip', allowed: false, reason, detail: detail || null });
const defer = (reason, retryAt, detail) => ({ decision: 'defer', allowed: false, reason, retryAt, detail: detail || null });
const send = () => ({ decision: 'send', allowed: true, reason: null });

/**
 * ¿Se le puede mandar `template` a `contact` ahora mismo?
 *
 * @param {object} contact  fila de WhatsAppContact (con siteId, consentState…)
 * @param {object} template fila de WhatsAppTemplate (name, category)
 * @param {object} opts     { clubId, now, timeZone, ignoreFrequency }
 */
export async function evaluateSend(contact, template, opts = {}) {
  await ensureAutomationSchema();
  const now = opts.now ? new Date(opts.now) : new Date();
  const settings = opts.settings || await getAutomationSettings();
  const clubId = opts.clubId || contact.clubId;

  // ── Frenos definitivos ────────────────────────────────────────────────────
  if (!contact) return skip('no_contact');
  if (contact.archivedAt) return skip('contact_archived');
  if (contact.optedOutAt) return skip('opted_out');
  if (['unsubscribed', 'blocked', 'inactive'].includes(String(contact.status || '').toLowerCase())) {
    return skip('contact_status', contact.status);
  }

  const phone = validateForMeta(contact.phone);
  if (!phone.ok) return skip('invalid_phone', phone.reason);

  // La lista de exclusión se consulta por NÚMERO, no por id de contacto: es lo
  // que hace que la baja sobreviva a que el contacto se borre y se vuelva a
  // crear, que es justamente como se le termina escribiendo a quien pidió que no.
  const supp = await db.query(
    `SELECT reason FROM "CrmSuppression" WHERE "clubId"=$1 AND phone=$2 LIMIT 1`,
    [clubId, phone.e164]
  );
  if (supp.rows.length) return skip('suppressed', supp.rows[0].reason);

  const category = String(template?.category || 'MARKETING').toUpperCase();
  const needsConsent = (settings.requireExplicitConsentFor || []).includes(category);
  const consent = String(contact.consentState || 'unknown').toLowerCase();
  if (consent === 'denied') return skip('consent_denied');
  if (needsConsent && consent !== 'granted') return skip('consent_missing', `categoría ${category}`);

  // ── Frenos temporales ─────────────────────────────────────────────────────
  // Misma plantilla, mismo contacto, hace poco. Evita el duplicado que produce
  // un recorrido reconfigurado o dos recorridos que se solapan.
  if (template?.name && settings.sameTemplateCooldownDays > 0) {
    const dup = await db.query(
      `SELECT "createdAt" FROM "WhatsAppMessageLog"
       WHERE "contactId"=$1 AND "templateName"=$2 AND direction='outgoing'
         AND status IN ('sent','delivered','read')
         AND "createdAt" > $3
       ORDER BY "createdAt" DESC LIMIT 1`,
      [contact.id, template.name, new Date(now.getTime() - settings.sameTemplateCooldownDays * 86_400_000)]
    );
    if (dup.rows.length) {
      return skip('duplicate_template', `ya recibió "${template.name}" el ${new Date(dup.rows[0].createdAt).toISOString().slice(0, 10)}`);
    }
  }

  // Tope de frecuencia. Es un aplazamiento, no un descarte: el mensaje sigue
  // teniendo sentido, sólo que esta persona ya recibió bastante por ahora.
  if (!opts.ignoreFrequency && settings.maxPerContactPerWindow > 0) {
    const windowStart = new Date(now.getTime() - settings.frequencyWindowDays * 86_400_000);
    const r = await db.query(
      `SELECT COUNT(*)::int AS n, MIN("createdAt") AS oldest FROM "WhatsAppMessageLog"
       WHERE "contactId"=$1 AND direction='outgoing' AND "templateName" IS NOT NULL
         AND status IN ('sent','delivered','read') AND "createdAt" > $2`,
      [contact.id, windowStart]
    );
    const n = r.rows[0]?.n || 0;
    if (n >= settings.maxPerContactPerWindow) {
      // Se puede volver a intentar cuando el más antiguo salga de la ventana.
      const oldest = r.rows[0]?.oldest ? new Date(r.rows[0].oldest) : now;
      const retryAt = new Date(oldest.getTime() + settings.frequencyWindowDays * 86_400_000 + 60_000);
      return defer('frequency_cap', retryAt, `${n} mensajes en ${settings.frequencyWindowDays} días`);
    }
  }

  // Ventana horaria, en la zona del destinatario.
  const tz = opts.timeZone || settings.timezone;
  const nextAt = nextAllowedSendTime(now, settings, tz);
  if (nextAt) return defer('outside_send_window', nextAt, `ventana ${Math.floor(settings.sendWindowStartMin / 60)}:00–${Math.floor(settings.sendWindowEndMin / 60)}:00 ${tz}`);

  return send();
}

// ── Lista de exclusión ──────────────────────────────────────────────────────
export async function suppressContact({ clubId, phone, email = null, reason = 'opt_out', source = 'manual', note = null }) {
  await ensureAutomationSchema();
  const v = phone ? validateForMeta(phone) : { ok: false };
  await db.query(
    `INSERT INTO "CrmSuppression" (id,"clubId",phone,email,reason,source,note)
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6)
     ON CONFLICT DO NOTHING`,
    [clubId, v.ok ? v.e164 : phone || null, email, reason, source, note]
  );
  // El contacto también se marca, para que la lista de contactos lo muestre sin
  // tener que cruzar dos tablas. La lista de exclusión sigue siendo la verdad.
  if (v.ok) {
    await db.query(
      `UPDATE "WhatsAppContact" SET "optedOutAt"=COALESCE("optedOutAt",NOW()), "consentState"='denied', "updatedAt"=NOW()
       WHERE "clubId"=$1 AND phone=$2`,
      [clubId, v.e164]
    ).catch(() => {});
  }
  return { ok: true };
}

export async function unsuppressContact({ clubId, phone }) {
  await ensureAutomationSchema();
  const v = validateForMeta(phone);
  const target = v.ok ? v.e164 : phone;
  await db.query(`DELETE FROM "CrmSuppression" WHERE "clubId"=$1 AND phone=$2`, [clubId, target]);
  await db.query(
    `UPDATE "WhatsAppContact" SET "optedOutAt"=NULL, "consentState"='unknown', "updatedAt"=NOW()
     WHERE "clubId"=$1 AND phone=$2`,
    [clubId, target]
  ).catch(() => {});
  return { ok: true };
}

export async function listSuppressions(clubId, { limit = 200 } = {}) {
  await ensureAutomationSchema();
  const r = await db.query(
    `SELECT * FROM "CrmSuppression" WHERE "clubId"=$1 ORDER BY "createdAt" DESC LIMIT $2`,
    [clubId, limit]
  );
  return r.rows;
}

export const GUARDRAIL_REASONS = {
  no_contact: 'El contacto no existe',
  contact_archived: 'Contacto archivado',
  opted_out: 'Pidió la baja',
  contact_status: 'Estado del contacto',
  invalid_phone: 'Número inválido',
  suppressed: 'En la lista de exclusión',
  consent_denied: 'Consentimiento denegado',
  consent_missing: 'Sin consentimiento registrado',
  duplicate_template: 'Ya recibió esta plantilla',
  frequency_cap: 'Tope de frecuencia alcanzado',
  outside_send_window: 'Fuera del horario permitido',
};

export default {
  evaluateSend, getAutomationSettings, saveAutomationSettings, nextAllowedSendTime,
  suppressContact, unsuppressContact, listSuppressions, DEFAULT_SETTINGS, GUARDRAIL_REASONS,
};
