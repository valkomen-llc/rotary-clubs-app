// ════════════════════════════════════════════════════════════════════
// Leer y escribir la huella de lo traído del ecosistema — v4.749
//
// La ORQUESTACIÓN de `EcosystemClone`. El criterio —qué se copia, cómo se
// rotula, qué cuenta como divergencia— sigue en `districtEcosystem.js`, que es
// puro y está probado.
//
// TODA LECTURA DEGRADA, NUNCA REVIENTA. Si la tabla aún no existe —primer
// despliegue, base recién restaurada— lo que corresponde es que nada figure
// como traído, no que se caiga la página pública de un proyecto. Es la misma
// postura que `buildFolderTree` con una carpeta inexistente: se muestra lo que
// hay y no se esconde el problema.
// ════════════════════════════════════════════════════════════════════

import db from './db.js';
import { ensureEcosystemCloneSchema } from './ensureEcosystemCloneSchema.js';

/** Registra —o actualiza— de dónde vino una copia. */
export async function recordClone({ ownerClubId, kind, localId, source }) {
    await ensureEcosystemCloneSchema();
    await db.query(
        `INSERT INTO "EcosystemClone"
            ("ownerClubId", kind, "localId", "sourceId", "sourceClubId", "sourceName", "sourceUrl", "clonedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT ("ownerClubId", kind, "sourceId") DO UPDATE
            SET "localId"     = EXCLUDED."localId",
                "sourceName"  = EXCLUDED."sourceName",
                "sourceUrl"   = EXCLUDED."sourceUrl",
                "refreshedAt" = NOW()`,
        [
            ownerClubId, kind, localId,
            source?.id || '', source?.clubId || '',
            source?.clubName || null, source?.url || null,
        ],
    );
}

/** Marca que una copia se acaba de releer del original. */
export async function markRefreshed({ kind, localId }) {
    await ensureEcosystemCloneSchema();
    await db.query(
        `UPDATE "EcosystemClone" SET "refreshedAt" = NOW() WHERE kind = $1 AND "localId" = $2`,
        [kind, localId],
    );
}

/** Las copias que este sitio trajo, por el id del ORIGINAL. */
export async function clonesBySource(ownerClubId, kind) {
    try {
        await ensureEcosystemCloneSchema();
        const res = await db.query(
            `SELECT * FROM "EcosystemClone" WHERE "ownerClubId" = $1 AND kind = $2`,
            [ownerClubId, kind],
        );
        return new Map(res.rows.map(r => [r.sourceId, r]));
    } catch (error) {
        console.warn('[ecosystemClones] clonesBySource:', error.message);
        return new Map();
    }
}

/** La procedencia de UNA copia, o null si no es una copia. */
export async function cloneOf(kind, localId) {
    if (!localId) return null;
    try {
        await ensureEcosystemCloneSchema();
        const res = await db.query(
            `SELECT * FROM "EcosystemClone" WHERE kind = $1 AND "localId" = $2 LIMIT 1`,
            [kind, localId],
        );
        return res.rows[0] || null;
    } catch (error) {
        // Degrada: sin huella, la ficha se comporta como un contenido propio.
        console.warn('[ecosystemClones] cloneOf:', error.message);
        return null;
    }
}

/** Deja de considerar copia a algo que se borró del sitio que la trajo. */
export async function forgetClone(kind, localId) {
    try {
        await ensureEcosystemCloneSchema();
        await db.query('DELETE FROM "EcosystemClone" WHERE kind = $1 AND "localId" = $2', [kind, localId]);
    } catch (error) {
        console.warn('[ecosystemClones] forgetClone:', error.message);
    }
}

export default { recordClone, markRefreshed, clonesBySource, cloneOf, forgetClone };
