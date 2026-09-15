// La I/O del aislamiento por cuenta de WhatsApp (v4.1060).
//
// El CRITERIO vive en `whatsappScope.js` (puro) y acá está lo que toca la base:
// qué conexiones alcanza una sesión, cuál es la activa, y la MIGRACIÓN PEREZOSA
// que ata las filas heredadas a su línea.
//
// ⚠️ LA MIGRACIÓN OCURRE AL LEER, NO AL DESPLEGAR. Un despliegue no escribe en
// la base —regla durable desde el incidente del 2026-07-13— así que esto no
// podía ser un script: la primera vez que alguien abre Plantillas con una
// cuenta seleccionada, las filas que tienen señal quedan atadas y las que no,
// se cuentan y se dicen. Es el patrón de `migrateFromLegacyConfig` (v4.992),
// los grupos de distribución (v4.876) y `bindLegacyEdition` (v4.683).
//
// ⚠️ Y NO ADIVINA. `attributeLegacyRow` sólo escribe cuando la señal es
// inequívoca —la WABA coincide, o hay una sola cuenta—; lo demás queda en NULL
// y viaja en el resumen para revisión administrativa, que es literalmente el
// punto 11 del encargo.
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { listConnections, getConnection } from './whatsappConnectionStore.js';
import {
  resolveActiveConnection, describeConnection,
  attributeLegacyRow, attributionIsSafe, summarizeAttribution,
} from './whatsappScope.js';

/** La WABA de la línea heredada (`WhatsAppConfig`), si todavía existe. */
export async function legacyWabaOf(clubId) {
  if (!clubId) return null;
  try {
    const r = await db.query(
      `SELECT "wabaId" FROM "WhatsAppConfig" WHERE "clubId"=$1 LIMIT 1`,
      [clubId]
    );
    return r.rows[0]?.wabaId || null;
  } catch {
    // Degrada: la tabla heredada puede no existir en una instalación nueva, y
    // no poder leerla no puede costar la pantalla de plantillas.
    return null;
  }
}

/**
 * Las cuentas que alcanza la sesión y cuál es la activa.
 *
 * ⚠️ EL SITIO SALE DEL TOKEN Y LA CUENTA SE COMPRUEBA CONTRA LA LISTA. El
 * navegador PROPONE un `connectionId` por query; si no está entre las del
 * sitio, `resolveActiveConnection` devuelve `seleccion_invalida` y NO se
 * sustituye por la principal en silencio — sustituirla mostraría los datos de
 * otra cuenta bajo el rótulo de la pedida, que es contaminación con otro
 * nombre.
 */
export async function resolveScope(clubId, { requested = null, entityConnectionId = null } = {}) {
  const connections = clubId ? await listConnections(clubId).catch(() => []) : [];
  const resolved = resolveActiveConnection({ entityConnectionId, requested, connections });
  return {
    clubId,
    connections,
    connection: resolved.connection,
    connectionId: resolved.connection?.id || null,
    source: resolved.source,
    requestedMissing: resolved.requestedMissing,
    describe: describeConnection(resolved.connection),
  };
}

/** La conexión de una entidad, comprobada contra el sitio. Ajena → null. */
export async function connectionForEntity(clubId, connectionId) {
  if (!connectionId) return null;
  const conn = await getConnection(connectionId).catch(() => null);
  if (!conn) return null;
  // El aislamiento va acá y no en la pantalla: una conexión de otro sitio no
  // existe para quien pregunta (404, no 403 — confirmar que existe es la mitad
  // de lo que hace falta para ir a buscarla).
  if (clubId && conn.clubId && conn.clubId !== clubId) return null;
  return conn;
}

// ── Migración perezosa ─────────────────────────────────────────────────────

const TABLAS = {
  template: { table: 'WhatsAppTemplate', conWaba: true },
  campaign: { table: 'WhatsAppCampaign', conWaba: false },
};

/**
 * Ata las filas heredadas de una tabla a su conexión, cuando se puede saber.
 *
 * Idempotente por construcción: sólo mira las filas con `connectionId` NULL, así
 * que una fila ya resuelta deja de ser candidata sola y correr esto diez veces
 * hace trabajo la primera. Es el criterio de elegibilidad de v4.846, no un
 * candado.
 *
 * NUNCA lanza: corre en el camino de lectura de una pantalla. Si la migración
 * falla, la pantalla muestra las filas sin atribuir —que es exactamente lo que
 * se veía antes— en vez de responder 500.
 */
export async function adoptLegacyRows(entity, clubId, connections, { legacyWabaId = null } = {}) {
  const spec = TABLAS[entity];
  if (!spec || !clubId) return { total: 0, asignadas: 0, pendientes: 0, porMotivo: {} };

  try {
    await ensureAutomationSchema();
    const cols = spec.conWaba ? `id, "connectionId", "wabaId"` : `id, "connectionId"`;
    const r = await db.query(
      `SELECT ${cols} FROM "${spec.table}" WHERE "clubId"=$1 AND "connectionId" IS NULL`,
      [clubId]
    );
    if (!r.rows.length) return { total: 0, asignadas: 0, pendientes: 0, porMotivo: {} };

    const resultados = [];
    for (const row of r.rows) {
      const att = attributeLegacyRow(row, { connections, legacyWabaId });
      resultados.push(att);
      if (!attributionIsSafe(att.reason) || !att.connectionId) continue;
      // El `WHERE "connectionId" IS NULL` se repite en la escritura a propósito:
      // entre la lectura y este UPDATE otro administrador pudo atarla a mano, y
      // una decisión de una persona no se pisa (regla de `ensureLibraryFiling`).
      if (spec.conWaba) {
        await db.query(
          `UPDATE "${spec.table}" SET "connectionId"=$1,
             "wabaId"=COALESCE("wabaId",$2), "updatedAt"=NOW()
           WHERE id=$3 AND "connectionId" IS NULL`,
          [att.connectionId, att.wabaId, row.id]
        );
      } else {
        await db.query(
          `UPDATE "${spec.table}" SET "connectionId"=$1, "updatedAt"=NOW()
           WHERE id=$2 AND "connectionId" IS NULL`,
          [att.connectionId, row.id]
        );
      }
    }
    return summarizeAttribution(resultados);
  } catch (err) {
    console.warn(`[WA-Scope] No se pudo atribuir ${entity}: ${err.message}`);
    return { total: 0, asignadas: 0, pendientes: 0, porMotivo: {}, error: err.message };
  }
}

/**
 * La migración completa de un sitio, para llamarla al abrir una pantalla.
 *
 * Con una sola cuenta no hace falta recorrer nada: `attributeLegacyRow`
 * devolvería `unica_cuenta` para todas, y eso es trabajo útil — pero sólo la
 * primera vez. El corte por «no hay conexiones» evita el caso en que no hay
 * nada a lo que atar.
 */
export async function adoptLegacyForClub(clubId, connections) {
  if (!clubId || !connections?.length) return null;
  const legacyWabaId = await legacyWabaOf(clubId);
  const [templates, campaigns] = await Promise.all([
    adoptLegacyRows('template', clubId, connections, { legacyWabaId }),
    adoptLegacyRows('campaign', clubId, connections, { legacyWabaId }),
  ]);
  const pendientes = (templates.pendientes || 0) + (campaigns.pendientes || 0);
  return {
    templates,
    campaigns,
    pendientes,
    // Lo que quedó sin resolver se DICE. Un descarte silencioso deja al
    // administrador mirando una lista sin saber qué falta (la regla de
    // `skipped` en los centros de acopio).
    note: pendientes
      ? `${pendientes} registro(s) no se pudieron atribuir a una cuenta y quedan para revisión.`
      : null,
  };
}

export default {
  legacyWabaOf, resolveScope, connectionForEntity, adoptLegacyRows, adoptLegacyForClub,
};
