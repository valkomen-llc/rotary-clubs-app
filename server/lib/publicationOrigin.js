// ════════════════════════════════════════════════════════════════════
// La I/O de la procedencia de una publicación — v4.967.0
//
// NUNCA LANZA. Corre en el camino de generar y de publicar: una traza que no
// se puede escribir no puede costar una publicación que sí se generó. Toda
// función devuelve su resultado con el motivo escrito, igual que
// `notificationLog.js` dentro del webhook de Stripe.
//
// Y por lo mismo toda LECTURA degrada a null / []: si la tabla todavía no
// existe —arranque en frío tras el despliegue—, la Biblioteca de Publicaciones
// se ve exactamente como antes de este módulo, sin la insignia de campaña.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import ensurePublicationOriginSchema from './ensurePublicationOriginSchema.js';

const str = (v, max) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);
const list = (v, max = 40) => (Array.isArray(v) ? v : [])
    .map(x => String(x ?? '').trim()).filter(Boolean).slice(0, max);

/**
 * Guarda de dónde salió una publicación. Idempotente por `publicationId`:
 * regenerar sobre el mismo borrador ACTUALIZA en vez de duplicar.
 */
export async function savePublicationOrigin(origin = {}) {
    const publicationId = str(origin.publicationId, 64);
    if (!publicationId) return { ok: false, reason: 'sin publicationId' };
    try {
        await ensurePublicationOriginSchema();
        await db.query(
            `INSERT INTO "SocialPublicationOrigin"
                ("publicationId","clubId","publicationType","campaignId","campaignSlug","campaignName",
                 "objective","audience","language","additionalContext","mediaIds","mediaUrls","platforms","config","issues")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT ("publicationId") DO UPDATE SET
                "clubId" = EXCLUDED."clubId",
                "publicationType" = EXCLUDED."publicationType",
                "campaignId" = EXCLUDED."campaignId",
                "campaignSlug" = EXCLUDED."campaignSlug",
                "campaignName" = EXCLUDED."campaignName",
                "objective" = EXCLUDED."objective",
                "audience" = EXCLUDED."audience",
                "language" = EXCLUDED."language",
                "additionalContext" = EXCLUDED."additionalContext",
                "mediaIds" = EXCLUDED."mediaIds",
                "mediaUrls" = EXCLUDED."mediaUrls",
                "platforms" = EXCLUDED."platforms",
                "config" = EXCLUDED."config",
                "issues" = EXCLUDED."issues",
                "updatedAt" = CURRENT_TIMESTAMP`,
            [
                publicationId,
                str(origin.clubId, 64),
                str(origin.publicationType, 64),
                str(origin.campaignId, 64),
                str(origin.campaignSlug, 200),
                str(origin.campaignName, 200),
                str(origin.objective, 64),
                str(origin.audience, 64),
                str(origin.language, 16),
                str(origin.additionalContext, 2000),
                list(origin.mediaIds),
                list(origin.mediaUrls),
                list(origin.platforms, 12),
                origin.config ? JSON.stringify(origin.config) : null,
                origin.issues?.length ? JSON.stringify(origin.issues) : null,
            ]
        );
        return { ok: true };
    } catch (e) {
        console.warn(`[origin] No se pudo guardar la procedencia de ${publicationId}: ${e.message}`);
        return { ok: false, reason: e.message };
    }
}

/** La procedencia de varias publicaciones, para pintar un listado sin N consultas. */
export async function originsFor(publicationIds = []) {
    const ids = list(publicationIds, 500);
    if (!ids.length) return {};
    try {
        await ensurePublicationOriginSchema();
        const { rows } = await db.query(
            `SELECT * FROM "SocialPublicationOrigin" WHERE "publicationId" = ANY($1)`, [ids]
        );
        return Object.fromEntries(rows.map(r => [r.publicationId, r]));
    } catch (e) {
        console.warn(`[origin] Lectura degradada: ${e.message}`);
        return {};
    }
}

/** Qué publicaciones salieron de una campaña. La pregunta del punto 12. */
export async function publicationsOfCampaign(campaignId, { limit = 200 } = {}) {
    const id = str(campaignId, 64);
    if (!id) return [];
    try {
        await ensurePublicationOriginSchema();
        const { rows } = await db.query(
            `SELECT * FROM "SocialPublicationOrigin"
             WHERE "campaignId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
            [id, Math.min(Number(limit) || 200, 500)]
        );
        return rows;
    } catch (e) {
        console.warn(`[origin] Lectura degradada: ${e.message}`);
        return [];
    }
}

export default { savePublicationOrigin, originsFor, publicationsOfCampaign };
