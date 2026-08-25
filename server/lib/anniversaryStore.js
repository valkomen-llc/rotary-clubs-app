// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — la I/O
// v4.895.0
//
// Lee y escribe. NO decide nada: el criterio vive en `anniversarySpec.js`, que
// es puro y tiene pruebas. Si acá aparece una decisión, va allá.
//
// ── BORRADOR → PROBAR → PUBLICAR ────────────────────────────────────
//
// Es la regla 17 del pedido y la razón por la que hay dos documentos en la
// misma fila. `readDraftConfig` es lo que edita y prueba el administrador;
// `readPublishedConfig` es lo único que ve el formulario público. Sin esa
// separación, corregir una coma en una instrucción cambiaría en el acto lo que
// está generando la gente en ese momento.
//
// ── NADA DE ESTO LANZA HACIA EL CAMINO PÚBLICO ──────────────────────
//
// La lectura pública corre en una página abierta a Internet. Si la tabla
// todavía no existe —primer despliegue— o la base tropieza, lo que corresponde
// es «este generador no está disponible», no un 500.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAnniversarySchema } from './ensureAnniversarySchema.js';
import {
    GENERATOR_KIND, normalizeConfig, fingerprintOf, isSignificantChange, DEFAULT_CONFIG,
} from './anniversarySpec.js';

// ─── La fila de configuración ──────────────────────────────────────────
//
// Hoy SIEMPRE la de la plataforma (`clubId IS NULL`). `clubId` viaja como
// parámetro para que el día que un sitio tenga la suya no haya que reescribir
// estas cuatro funciones.

const selectConfig = async (clubId = null) => {
    const { rows } = await db.query(
        `SELECT * FROM "AnniversaryConfig"
          WHERE kind = $1 AND "clubId" IS NOT DISTINCT FROM $2
          LIMIT 1`,
        [GENERATOR_KIND, clubId]
    );
    return rows[0] || null;
};

/** La fila, creándola vacía la primera vez. Sólo la llama el panel: la lectura
 *  pública nunca escribe. */
export const ensureConfigRow = async (clubId = null) => {
    await ensureAnniversarySchema();
    const existente = await selectConfig(clubId);
    if (existente) return existente;

    // Sin `ON CONFLICT`: los índices únicos son PARCIALES y habría que repetir
    // su predicado o la sentencia falla entera (v4.648). Dos altas simultáneas
    // de la misma fila son un caso que no ocurre —esto lo abre una persona
    // desde el panel— y si ocurriera, el índice lo rechaza y la vuelta
    // siguiente lee la que ganó.
    const { rows } = await db.query(
        `INSERT INTO "AnniversaryConfig" (kind, "clubId", name, enabled, draft)
         VALUES ($1, $2, $3, false, $4::jsonb)
         RETURNING *`,
        [GENERATOR_KIND, clubId, DEFAULT_CONFIG.name, JSON.stringify(normalizeConfig(DEFAULT_CONFIG))]
    );
    return rows[0];
};

/** Lo que edita y prueba el administrador. */
export const readDraftConfig = async (clubId = null) => {
    const row = await ensureConfigRow(clubId);
    return { row, config: normalizeConfig(row.draft) };
};

/**
 * Lo que ve el formulario público. DEGRADA SIEMPRE: devuelve `null` ante
 * cualquier fallo —incluida la tabla todavía inexistente— en vez de lanzar.
 */
export const readPublishedConfig = async (clubId = null) => {
    try {
        await ensureAnniversarySchema();
        const row = await selectConfig(clubId);
        if (!row || !row.published) return null;
        return {
            configId: row.id,
            versionId: row.publishedVersionId || null,
            enabled: !!row.enabled,
            config: normalizeConfig(row.published),
            publishedAt: row.publishedAt,
        };
    } catch (e) {
        console.error('[anniversaryStore] readPublishedConfig:', e.message);
        return null;
    }
};

/** Guarda el BORRADOR. No publica: eso es un gesto aparte y explícito. */
export const saveDraftConfig = async (clubId, raw) => {
    const row = await ensureConfigRow(clubId);
    const config = normalizeConfig(raw);
    const { rows } = await db.query(
        `UPDATE "AnniversaryConfig"
            SET draft = $1::jsonb, name = $2, enabled = $3, "updatedAt" = NOW()
          WHERE id = $4
      RETURNING *`,
        [JSON.stringify(config), config.name, config.enabled, row.id]
    );
    return { row: rows[0], config, changed: isSignificantChange(row.draft, config) };
};

// ─── Versiones ─────────────────────────────────────────────────────────
//
// Se crea una versión AL PUBLICAR, no al guardar el borrador: guardar es
// trabajo en curso y una versión por pulsación no es trazabilidad, es ruido.
//
// Y sólo si CAMBIÓ lo que se imprime (`fingerprintOf`). Volver a publicar sin
// tocar nada reutiliza la versión vigente: dos versiones idénticas con números
// distintos no dicen nada y rompen la pregunta que esto existe para responder
// —«¿con qué instrucciones salió esta pieza?»—.
export const publishConfig = async (clubId, { userId = null, userEmail = null, label = null } = {}) => {
    const row = await ensureConfigRow(clubId);
    const config = normalizeConfig(row.draft);
    const huella = fingerprintOf(config);

    const vigente = row.publishedVersionId
        ? (await db.query(`SELECT * FROM "AnniversaryConfigVersion" WHERE id = $1`, [row.publishedVersionId])).rows[0]
        : null;

    let version = vigente;
    if (!vigente || vigente.fingerprint !== huella) {
        const { rows: [{ siguiente }] } = await db.query(
            `SELECT COALESCE(MAX(version), 0) + 1 AS siguiente
               FROM "AnniversaryConfigVersion" WHERE "configId" = $1`, [row.id]
        );
        const { rows } = await db.query(
            `INSERT INTO "AnniversaryConfigVersion"
                 ("configId", version, label, config, fingerprint, "publishedBy", "publishedByEmail")
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
             RETURNING *`,
            [row.id, siguiente, label ? String(label).slice(0, 120) : null,
                JSON.stringify(config), huella, userId, userEmail]
        );
        version = rows[0];
    }

    const { rows } = await db.query(
        `UPDATE "AnniversaryConfig"
            SET published = $1::jsonb, "publishedVersionId" = $2, "publishedAt" = NOW(),
                "publishedBy" = $3, "updatedAt" = NOW()
          WHERE id = $4
      RETURNING *`,
        [JSON.stringify(config), version.id, userEmail || userId, row.id]
    );
    return { row: rows[0], config, version, reused: !!vigente && vigente.fingerprint === huella };
};

/** Retira la configuración del aire SIN borrar nada. Volver a publicar tiene
 *  que poder devolver la misma versión: las versiones son la traza, no un
 *  borrador. */
export const unpublishConfig = async (clubId) => {
    const row = await ensureConfigRow(clubId);
    const { rows } = await db.query(
        `UPDATE "AnniversaryConfig" SET published = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
        [row.id]
    );
    return rows[0];
};

export const listVersions = async (clubId, limit = 20) => {
    const row = await ensureConfigRow(clubId);
    const { rows } = await db.query(
        `SELECT id, version, label, fingerprint, "publishedByEmail", "createdAt",
                (config ->> 'designInstruction') AS "designInstruction"
           FROM "AnniversaryConfigVersion"
          WHERE "configId" = $1
          ORDER BY version DESC
          LIMIT $2`,
        [row.id, Math.min(100, Math.max(1, Number(limit) || 20))]
    );
    return rows.map(v => ({
        id: v.id, version: v.version, label: v.label, fingerprint: v.fingerprint,
        publishedBy: v.publishedByEmail, createdAt: v.createdAt,
        // Un resumen, no la instrucción entera: el listado se lee de un
        // vistazo y el texto completo se consulta al restaurar.
        summary: String(v.designInstruction || '').slice(0, 140),
        current: v.id === row.publishedVersionId,
    }));
};

/** Trae una versión completa para poder devolverla al borrador. RESTAURAR NO
 *  PUBLICA: deja el texto en el borrador y quien publica decide. */
export const readVersion = async (clubId, versionId) => {
    const row = await ensureConfigRow(clubId);
    const { rows } = await db.query(
        `SELECT * FROM "AnniversaryConfigVersion" WHERE id = $1 AND "configId" = $2`,
        [String(versionId || ''), row.id]
    );
    return rows[0] ? { ...rows[0], config: normalizeConfig(rows[0].config) } : null;
};

// ─── Piezas ────────────────────────────────────────────────────────────

export const createPiece = async (data) => {
    await ensureAnniversarySchema();
    const { rows } = await db.query(
        `INSERT INTO "AnniversaryPiece"
             ("configId", "versionId", "versionNumber", mode, "clubId", "subjectClubId",
              "clubName", years, "photoUrl", "photoWidth", "photoHeight", status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')
         RETURNING *`,
        [data.configId || null, data.versionId || null, data.versionNumber ?? null,
            data.mode === 'test' ? 'test' : 'public',
            data.clubId || null, data.subjectClubId || null,
            String(data.clubName || '').slice(0, 120), data.years ?? null,
            data.photoUrl || null, data.photoWidth ?? null, data.photoHeight ?? null]
    );
    return rows[0];
};

export const readPiece = async (id) => {
    await ensureAnniversarySchema();
    const { rows } = await db.query(`SELECT * FROM "AnniversaryPiece" WHERE id = $1`, [String(id || '')]);
    return rows[0] || null;
};

/**
 * Escritura parcial. La lista de campos es CERRADA a propósito: con un
 * `Object.keys(patch)` suelto, cualquier clave que llegara del navegador
 * entraría al SQL, y este módulo tiene un camino público sin autenticación.
 */
const PIECE_FIELDS = new Set([
    'analysis', 'copy', 'branding', 'taskId', 'attempts', 'backdropUrl', 'zoneId',
    'renderMode', 'status', 'statusDetail', 'validation', 'subjectClubId',
]);
const JSON_FIELDS = new Set(['analysis', 'copy', 'branding', 'validation']);

export const updatePiece = async (id, patch) => {
    await ensureAnniversarySchema();
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(patch || {})) {
        if (!PIECE_FIELDS.has(k)) continue;
        params.push(JSON_FIELDS.has(k) ? JSON.stringify(v ?? null) : v);
        sets.push(`"${k}" = $${params.length}${JSON_FIELDS.has(k) ? '::jsonb' : ''}`);
    }
    if (!sets.length) return readPiece(id);
    params.push(String(id || ''));
    const { rows } = await db.query(
        `UPDATE "AnniversaryPiece" SET ${sets.join(', ')}, "updatedAt" = NOW()
          WHERE id = $${params.length} RETURNING *`, params
    );
    return rows[0] || null;
};

/**
 * Reclama la pieza para despachar una tarea al proveedor. El reclamo va sobre
 * `attempts`, que es un ENTERO EXACTO: sobre `updatedAt` no funcionaría porque
 * el driver de pg trunca los microsegundos del timestamp y la igualdad no
 * casaría nunca (v4.800). Sin candado, dos pulsaciones seguidas de «regenerar»
 * crearían DOS tareas para la misma pieza: dos cobros.
 */
export const claimPieceForDispatch = async (id, attempts) => {
    const { rows } = await db.query(
        `UPDATE "AnniversaryPiece"
            SET attempts = attempts + 1, status = 'composing', "statusDetail" = NULL, "updatedAt" = NOW()
          WHERE id = $1 AND attempts = $2
      RETURNING *`,
        [String(id || ''), Number(attempts) || 0]
    );
    return rows[0] || null;
};

/** El listado del panel de pruebas y de la ficha de uso. Sin la fotografía
 *  original: es contenido de un tercero y el listado no la necesita. */
export const listPieces = async (clubId, { mode = null, limit = 30 } = {}) => {
    const row = await ensureConfigRow(clubId);
    const params = [row.id];
    let where = `"configId" = $1`;
    if (mode === 'test' || mode === 'public') { params.push(mode); where += ` AND mode = $${params.length}`; }
    params.push(Math.min(100, Math.max(1, Number(limit) || 30)));
    const { rows } = await db.query(
        `SELECT id, mode, "clubName", years, "versionNumber", status, "statusDetail",
                "renderMode", "backdropUrl", "zoneId", copy, validation, "createdAt"
           FROM "AnniversaryPiece"
          WHERE ${where}
          ORDER BY "createdAt" DESC
          LIMIT $${params.length}`, params
    );
    return rows;
};

export default {
    ensureConfigRow, readDraftConfig, readPublishedConfig, saveDraftConfig,
    publishConfig, unpublishConfig, listVersions, readVersion,
    createPiece, readPiece, updatePiece, claimPieceForDispatch, listPieces,
};
