// Resolución del sitio "Origen" — el remitente único del WhatsApp CRM.
//
// El motor de automatización manda SIEMPRE desde la cuenta de WhatsApp Business
// de la plataforma hacia los dirigentes de cada club cliente. No hay un WABA por
// club: el administrador de un sitio consulta lo que su organización recibió,
// pero no emite.
//
// Esta resolución existía dentro de `resolveClubId` en `crmController.js`, atada
// a un `req`. El cron no tiene `req`, y copiar la cadena de respaldo habría
// dejado dos verdades sobre cuál es el remitente: el panel mostrando una cuenta
// y el motor enviando por otra.
import db from './db.js';

// Club "Origen" histórico de esta instalación. Se conserva como respaldo para no
// cambiar el comportamiento de las instalaciones que ya dependen de él; lo
// correcto en un entorno nuevo es fijar `CRM_PLATFORM_CLUB_ID`.
const LEGACY_PLATFORM_CLUB_ID = '3c648ce7-3c47-41e2-9461-6e40a8615ae6';

let _cached = null;
let _cachedAt = 0;
const TTL_MS = 5 * 60_000;

/**
 * Devuelve el clubId desde el que emite la plataforma, o null si no hay ninguna
 * cuenta de WhatsApp configurada.
 *
 * El orden es deliberado: lo que diga el entorno, después el Origen histórico
 * (sólo si de verdad tiene configuración), y por último la cuenta verificada más
 * recientemente. Nunca "el primer club de la tabla": enviar desde un club
 * cualquiera porque es el que salió primero es peor que no enviar.
 */
export async function resolvePlatformClubId({ fresh = false } = {}) {
  if (!fresh && _cached && Date.now() - _cachedAt < TTL_MS) return _cached;

  const candidates = [process.env.CRM_PLATFORM_CLUB_ID, LEGACY_PLATFORM_CLUB_ID].filter(Boolean);
  for (const id of candidates) {
    const r = await db.query(`SELECT "clubId" FROM "WhatsAppConfig" WHERE "clubId"=$1 LIMIT 1`, [id]);
    if (r.rows.length) { _cached = id; _cachedAt = Date.now(); return id; }
  }

  const r = await db.query(
    `SELECT "clubId" FROM "WhatsAppConfig" WHERE enabled = true
     ORDER BY "lastVerifiedAt" DESC NULLS LAST LIMIT 1`
  );
  _cached = r.rows[0]?.clubId || null;
  _cachedAt = Date.now();
  return _cached;
}

export default { resolvePlatformClubId };
