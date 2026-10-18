// ════════════════════════════════════════════════════════════════════════════
// Controlador de Curaduría Visual Inteligente IA (v4.1210.0)
//
// Endpoints REST protegidos por RBAC (media.view, media.edit) y aislamiento
// estricto multi-tenant por clubId.
// ════════════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { ensureVisualCurationSchema } from '../lib/ensureVisualCurationSchema.js';
import {
    runCurationCycleForTenant,
    approveRecommendation,
    rejectRecommendation,
    rollbackHistoryVersion,
    saveRecommendationFraming,
} from '../lib/visualCurationEngine.js';
import {
    scoreCandidateForContainer,
    CONTAINER_SPECS,
    DEFAULT_CURATION_WEIGHTS,
} from '../lib/visualCurationSpec.js';

const resolveClubId = (req) => {
    if (req.user.role === 'administrator' || req.user.role === 'superadmin') {
        return req.query.clubId || req.body.clubId || req.user.clubId || '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a';
    }
    return req.user.clubId;
};

// ─── GET /api/admin/curation/config ────────────────────────────────────────
export async function getCurationConfig(req, res) {
    try {
        await ensureVisualCurationSchema();
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(403).json({ error: 'Contexto de tenant requerido' });

        const { rows } = await db.query(
            `SELECT * FROM "SiteImageCurationConfig" WHERE "clubId" = $1 LIMIT 1`,
            [clubId]
        );

        if (!rows[0]) {
            // Default para nuevo tenant
            const isD4281 = clubId === '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a';
            const { rows: inserted } = await db.query(
                `INSERT INTO "SiteImageCurationConfig"
                    ("clubId", enabled, mode, "intervalDays", "targetContainers", weights)
                 VALUES ($1, $2, 'recommendation', 15, '["hero", "foundation", "join"]'::jsonb, $3)
                 RETURNING *`,
                [clubId, isD4281, JSON.stringify(DEFAULT_CURATION_WEIGHTS)]
            );
            return res.json(inserted[0]);
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('[curation-controller] Error getCurationConfig:', err);
        res.status(500).json({ error: err.message || 'Error al obtener configuración de curaduría' });
    }
}

// ─── POST /api/admin/curation/config ───────────────────────────────────────
export async function updateCurationConfig(req, res) {
    try {
        await ensureVisualCurationSchema();
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(403).json({ error: 'Contexto de tenant requerido' });

        const { enabled, mode, intervalDays, targetContainers, weights } = req.body;

        const { rows } = await db.query(
            `INSERT INTO "SiteImageCurationConfig"
                ("clubId", enabled, mode, "intervalDays", "targetContainers", weights, "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT ("clubId") DO UPDATE
             SET enabled = COALESCE($2, "SiteImageCurationConfig".enabled),
                 mode = COALESCE($3, "SiteImageCurationConfig".mode),
                 "intervalDays" = COALESCE($4, "SiteImageCurationConfig"."intervalDays"),
                 "targetContainers" = COALESCE($5, "SiteImageCurationConfig"."targetContainers"),
                 weights = COALESCE($6, "SiteImageCurationConfig".weights),
                 "updatedAt" = NOW()
             RETURNING *`,
            [
                clubId,
                enabled !== undefined ? Boolean(enabled) : true,
                mode || 'recommendation',
                Number(intervalDays) || 15,
                targetContainers ? JSON.stringify(targetContainers) : JSON.stringify(['hero', 'foundation', 'join']),
                weights ? JSON.stringify(weights) : JSON.stringify(DEFAULT_CURATION_WEIGHTS),
            ]
        );

        res.json(rows[0]);
    } catch (err) {
        console.error('[curation-controller] Error updateCurationConfig:', err);
        res.status(500).json({ error: err.message || 'Error al actualizar configuración' });
    }
}

// ─── GET /api/admin/curation/recommendations ───────────────────────────────
export async function getRecommendations(req, res) {
    try {
        await ensureVisualCurationSchema();
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(403).json({ error: 'Contexto de tenant requerido' });

        const { status, containerKey } = req.query;
        let query = `
            SELECT r.*,
                   c.url AS "candidateUrl",
                   c.filename AS "candidateFilename",
                   c.title AS "candidateTitle",
                   c.club AS "candidateClub",
                   c."submissionId" AS "candidateSubmissionId",
                   c."activityDate" AS "candidateActivityDate",
                   c."technicalMetrics" AS "candidateTechnical",
                   c."semanticAnalysis" AS "candidateSemantic",
                   c."consentVerified" AS "candidateConsent"
              FROM "SiteImageRecommendation" r
              JOIN "SiteImageCandidate" c ON c.id = r."candidateId"
             WHERE r."clubId" = $1
        `;
        const params = [clubId];

        if (status) {
            params.push(status);
            query += ` AND r.status = $${params.length}`;
        }
        if (containerKey) {
            params.push(containerKey);
            query += ` AND r."containerKey" = $${params.length}`;
        }

        query += ` ORDER BY r.score DESC, r."createdAt" DESC`;

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('[curation-controller] Error getRecommendations:', err);
        res.status(500).json({ error: err.message || 'Error al listar recomendaciones' });
    }
}

// ─── POST /api/admin/curation/recommendations/:id/approve ──────────────────
export async function postApproveRecommendation(req, res) {
    try {
        const clubId = resolveClubId(req);
        const { id } = req.params;
        const { framingConfig } = req.body || {};
        const actorName = req.user.name || req.user.email || 'Administrador';

        const result = await approveRecommendation({
            recommendationId: id,
            framingConfig,
            actorId: req.user.id,
            actorName,
            clubId,
        });

        res.json({ ok: true, message: 'Recomendación aprobada y aplicada al sitio exitosamente', ...result });
    } catch (err) {
        console.error('[curation-controller] Error approveRecommendation:', err);
        res.status(500).json({ error: err.message || 'Error al aprobar recomendación' });
    }
}

// ─── POST /api/admin/curation/recommendations/:id/framing ──────────────────
export async function postSaveRecommendationFraming(req, res) {
    try {
        const clubId = resolveClubId(req);
        const { id } = req.params;
        const { framingConfig } = req.body || {};

        const updated = await saveRecommendationFraming({
            recommendationId: id,
            framingConfig,
            clubId,
        });

        res.json({ ok: true, message: 'Encuadre guardado exitosamente', framing: updated });
    } catch (err) {
        console.error('[curation-controller] Error postSaveRecommendationFraming:', err);
        res.status(500).json({ error: err.message || 'Error al guardar encuadre' });
    }
}

// ─── POST /api/admin/curation/recommendations/:id/reject ───────────────────
export async function postRejectRecommendation(req, res) {
    try {
        const clubId = resolveClubId(req);
        const { id } = req.params;
        const { reason } = req.body;
        const actorName = req.user.name || req.user.email || 'Administrador';

        const result = await rejectRecommendation({
            recommendationId: id,
            reason: reason || 'Rechazada por decisión editorial',
            actorId: req.user.id,
            actorName,
            clubId,
        });

        res.json({ ok: true, message: 'Recomendación rechazada', ...result });
    } catch (err) {
        console.error('[curation-controller] Error rejectRecommendation:', err);
        res.status(500).json({ error: err.message || 'Error al rechazar recomendación' });
    }
}

// ─── POST /api/admin/curation/recommendations/:id/reassign ─────────────────
export async function postReassignRecommendation(req, res) {
    try {
        await ensureVisualCurationSchema();
        const clubId = resolveClubId(req);
        const { id } = req.params;
        const { targetContainerKey, targetSlotIndex } = req.body;

        if (!targetContainerKey) return res.status(400).json({ error: 'Falta targetContainerKey' });

        // Obtener datos del candidato
        const { rows } = await db.query(
            `SELECT r.*, c."technicalMetrics", c."semanticAnalysis"
               FROM "SiteImageRecommendation" r
               JOIN "SiteImageCandidate" c ON c.id = r."candidateId"
              WHERE r.id = $1 AND r."clubId" = $2`,
            [id, clubId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Recomendación no encontrada' });

        const rec = rows[0];
        const evaluation = scoreCandidateForContainer(
            {
                technicalMetrics: rec.technicalMetrics,
                semanticAnalysis: rec.semanticAnalysis,
                consentVerified: true,
            },
            targetContainerKey,
            targetSlotIndex || 0
        );

        const { rows: updated } = await db.query(
            `UPDATE "SiteImageRecommendation"
                SET "containerKey" = $2,
                    "slotIndex" = $3,
                    score = $4,
                    breakdown = $5,
                    reasons = $6,
                    facts = $7,
                    interpretation = $8,
                    "cropSuggested" = $9,
                    "updatedAt" = NOW()
              WHERE id = $1 AND "clubId" = $10
              RETURNING *`,
            [
                id,
                targetContainerKey,
                Number(targetSlotIndex) || 0,
                evaluation.score,
                JSON.stringify(evaluation.breakdown),
                JSON.stringify(evaluation.reasons),
                JSON.stringify(evaluation.facts),
                evaluation.interpretation,
                JSON.stringify(evaluation.cropSuggested),
                clubId,
            ]
        );

        res.json({ ok: true, updated: updated[0] });
    } catch (err) {
        console.error('[curation-controller] Error postReassignRecommendation:', err);
        res.status(500).json({ error: err.message || 'Error al reasignar contenedor' });
    }
}

// ─── GET /api/admin/curation/candidates ────────────────────────────────────
export async function getCandidates(req, res) {
    try {
        await ensureVisualCurationSchema();
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(403).json({ error: 'Contexto de tenant requerido' });

        const { rows } = await db.query(
            `SELECT * FROM "SiteImageCandidate" WHERE "clubId" = $1 ORDER BY "analyzedAt" DESC LIMIT 100`,
            [clubId]
        );
        res.json(rows);
    } catch (err) {
        console.error('[curation-controller] Error getCandidates:', err);
        res.status(500).json({ error: err.message || 'Error al obtener candidatas' });
    }
}

// ─── POST /api/admin/curation/run-analysis ─────────────────────────────────
export async function postRunAnalysis(req, res) {
    try {
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(403).json({ error: 'Contexto de tenant requerido' });

        const result = await runCurationCycleForTenant(clubId);
        res.json({
            ok: true,
            message: `Análisis finalizado exitosamente. ${result.analyzedCount} fotos procesadas, ${result.recommendationsCount} recomendaciones generadas.`,
            ...result,
        });
    } catch (err) {
        console.error('[curation-controller] Error postRunAnalysis:', err);
        res.status(500).json({ error: err.message || 'Error ejecutando ciclo de análisis' });
    }
}

// ─── GET /api/admin/curation/history ───────────────────────────────────────
export async function getHistory(req, res) {
    try {
        await ensureVisualCurationSchema();
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(403).json({ error: 'Contexto de tenant requerido' });

        const { rows } = await db.query(
            `SELECT * FROM "SiteImageHistory" WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT 100`,
            [clubId]
        );
        res.json(rows);
    } catch (err) {
        console.error('[curation-controller] Error getHistory:', err);
        res.status(500).json({ error: err.message || 'Error al obtener historial' });
    }
}

// ─── POST /api/admin/curation/history/:id/rollback ─────────────────────────
export async function postRollback(req, res) {
    try {
        const clubId = resolveClubId(req);
        const { id } = req.params;
        const actorName = req.user.name || req.user.email || 'Administrador';

        const result = await rollbackHistoryVersion({
            historyId: id,
            actorId: req.user.id,
            actorName,
            clubId,
        });

        res.json({ ok: true, message: 'Versión anterior restaurada con éxito', ...result });
    } catch (err) {
        console.error('[curation-controller] Error postRollback:', err);
        res.status(500).json({ error: err.message || 'Error en reversión de historial' });
    }
}

// ─── GET /api/admin/curation/locks ─────────────────────────────────────────
export async function getLocks(req, res) {
    try {
        await ensureVisualCurationSchema();
        const clubId = resolveClubId(req);
        const { rows } = await db.query(
            `SELECT * FROM "SiteImageLock" WHERE "clubId" = $1`,
            [clubId]
        );
        res.json(rows);
    } catch (err) {
        console.error('[curation-controller] Error getLocks:', err);
        res.status(500).json({ error: err.message || 'Error al obtener bloqueos' });
    }
}

// ─── POST /api/admin/curation/locks ────────────────────────────────────────
export async function postToggleLock(req, res) {
    try {
        await ensureVisualCurationSchema();
        const clubId = resolveClubId(req);
        const { containerKey, slotIndex, locked, reason } = req.body;
        const actorName = req.user.name || req.user.email || 'Administrador';

        if (!containerKey) return res.status(400).json({ error: 'Falta containerKey' });
        const slot = Number(slotIndex) || 0;

        if (locked) {
            await db.query(
                `INSERT INTO "SiteImageLock" ("clubId", "containerKey", "slotIndex", "lockedBy", reason, "lockedAt")
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT ("clubId", "containerKey", "slotIndex") DO UPDATE
                 SET reason = $5, "lockedBy" = $4, "lockedAt" = NOW()`,
                [clubId, containerKey, slot, actorName, reason || 'Fijada manualmente por el administrador']
            );
        } else {
            await db.query(
                `DELETE FROM "SiteImageLock" WHERE "clubId" = $1 AND "containerKey" = $2 AND "slotIndex" = $3`,
                [clubId, containerKey, slot]
            );
        }

        res.json({ ok: true, locked: Boolean(locked) });
    } catch (err) {
        console.error('[curation-controller] Error postToggleLock:', err);
        res.status(500).json({ error: err.message || 'Error al actualizar bloqueo de contenedor' });
    }
}
