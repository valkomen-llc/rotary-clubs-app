// ════════════════════════════════════════════════════════════════════════════
// Centro de Control — Controlador Operacional Unificado
//
// Conecta y supervisa en tiempo real los procesos automáticos de Club Platform:
//   - Solicitudes de contenido de campañas de contribución
//   - Generación de artículos y reels por agentes de IA
//   - Aprobación humana con matriz de destinos
//   - Publicación y distribución multi-tenant
// ════════════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import { campaignIdsInScope } from './contributionCampaignController.js';
import {
    articleOf, articlesFor, advanceArticle, retryArticleStage, publishArticle,
    sweepArticles, sweepArticleLibrary, postOf,
} from '../lib/submissionArticleEngine.js';
import { resolveSuggestedDestinations } from '../lib/destinationEngine.js';
import { getSubmission, clubsOf, logEvent } from '../lib/contentSubmissionStore.js';
import { isWorkingState } from '../lib/submissionArticleSpec.js';

const isOperator = (req) => req.user?.role === 'administrator' || req.user?.role === 'superadmin';

const AGENT_PERSONAS = {
    analizando: {
        id: 'valentina',
        name: 'Valentina',
        role: 'Ingeniera Multimedia & Visión',
        icon: '🎨',
        color: 'bg-amber-500',
    },
    generando: {
        id: 'rafael',
        name: 'Rafael',
        role: 'Agente Editorial & Copywriter',
        icon: '🤖',
        color: 'bg-blue-600',
    },
    por_aprobar: {
        id: 'mateo',
        name: 'Mateo',
        role: 'Editor Senior & Control de Calidad',
        icon: '🍷',
        color: 'bg-rose-600',
    },
    programado: {
        id: 'sofia',
        name: 'Sofía',
        role: 'Directora de Emisión & SEO',
        icon: '⚔️',
        color: 'bg-indigo-600',
    },
    publicado: {
        id: 'andres',
        name: 'Andrés',
        role: 'Orquestador Omnicanal',
        icon: '🐉',
        color: 'bg-emerald-600',
    },
    error: {
        id: 'diego',
        name: 'Diego',
        role: 'Diagnóstico & DevOps',
        icon: '🐺',
        color: 'bg-amber-600',
    },
    default: {
        id: 'rafael',
        name: 'Rafael',
        role: 'Director Operativo IA',
        icon: '🤖',
        color: 'bg-blue-600',
    },
};

/**
 * Determina a qué columna pertenece un proceso operativo.
 */
function resolveTaskColumn(submission, article, post) {
    const artStatus = article?.status || null;
    const subStatus = submission?.status || null;
    const postPublished = post?.published === true;
    const scheduledAt = post?.scheduledAt ? new Date(post.scheduledAt) : null;

    if (artStatus === 'publicado' || (subStatus === 'publicado' && postPublished)) {
        return 'publicado';
    }

    if (artStatus === 'error') {
        return 'error';
    }

    if (scheduledAt && scheduledAt.getTime() > Date.now()) {
        return 'programado';
    }

    if (['borrador_listo', 'en_revision', 'requiere_info', 'aprobado'].includes(artStatus)) {
        return 'por_aprobar';
    }

    if (['analizando', 'generando'].includes(artStatus)) {
        return 'en_proceso';
    }

    if (artStatus === 'recibida' || subStatus === 'recibido' || !artStatus) {
        return 'entradas';
    }

    return 'entradas';
}

/**
 * Resuelve el agente responsable según la etapa.
 */
function resolveAssignedAgent(column, article) {
    if (column === 'error') return AGENT_PERSONAS.error;
    if (column === 'por_aprobar') return AGENT_PERSONAS.por_aprobar;
    if (column === 'programado') return AGENT_PERSONAS.programado;
    if (column === 'publicado') return AGENT_PERSONAS.publicado;
    if (column === 'en_proceso') {
        if (article?.status === 'analizando') return AGENT_PERSONAS.analizando;
        return AGENT_PERSONAS.generando;
    }
    return AGENT_PERSONAS.default;
}

/**
 * GET /api/mission-control/operational-board
 * Devuelve todas las tareas operacionales activas del Centro de Control.
 */
export const getOperationalBoard = async (req, res) => {
    try {
        const operador = isOperator(req);
        const alcance = await campaignIdsInScope(req);

        // Si es sitio y no tiene campañas en alcance, devolver tablero vacío
        if (!operador && Array.isArray(alcance) && alcance.length === 0) {
            return res.json({
                scope: 'site',
                tasks: [],
                counts: { total: 0, entradas: 0, en_proceso: 0, por_aprobar: 0, programado: 0, publicado: 0, errores: 0 },
            });
        }

        const whereCampaign = !operador && Array.isArray(alcance) ? `WHERE s."campaignId" = ANY($1::text[])` : '';
        const params = !operador && Array.isArray(alcance) ? [alcance] : [];

        // 1. Obtener solicitudes de contenido
        const { rows: submissions } = await db.query(
            `SELECT s.id, s."campaignId", s.status, s."senderName", s."senderEmail", s."senderPhone",
                    s.district, s.club, s.title, s.description, s.story, s."activityDate",
                    s."originClubId", s."originHost", s."createdAt", s."updatedAt",
                    c.name AS "campaignName", c.slug AS "campaignSlug", c.targeting AS "campaignTargeting",
                    c."ownerClubId" AS "campaignOwnerClubId", c."recipientClubId" AS "campaignRecipientClubId"
             FROM "ContributionSubmission" s
             JOIN "ContributionCampaign" c ON c.id = s."campaignId"
             ${whereCampaign}
             ORDER BY s."createdAt" DESC
             LIMIT 150`,
            params
        );

        const subIds = submissions.map(s => s.id);
        const articles = await articlesFor(subIds);

        // Recopilar postIds para consultar posts asociados
        const postIds = Object.values(articles).map(a => a?.postId).filter(Boolean);
        const postsMap = {};
        if (postIds.length > 0) {
            const { rows: postRows } = await db.query(
                `SELECT id, title, slug, published, "targetClubIds", "publishToDistrict", "scheduledAt", "distributionStatus", image, category, tags
                 FROM "Post"
                 WHERE id = ANY($1::text[])`,
                [postIds]
            );
            for (const p of postRows) postsMap[p.id] = p;
        }

        // Obtener archivos de medios para cada solicitud (imágenes/videos)
        const mediaMap = {};
        if (subIds.length > 0) {
            const { rows: files } = await db.query(
                `SELECT "submissionId", kind, "s3Key", filename, bytes, "sortOrder"
                 FROM "ContributionSubmissionFile"
                 WHERE "submissionId" = ANY($1::text[])
                 ORDER BY "sortOrder" ASC`,
                [subIds]
            );
            for (const f of files) {
                if (!mediaMap[f.submissionId]) mediaMap[f.submissionId] = [];
                mediaMap[f.submissionId].push(f);
            }
        }

        // Mapear cada registro a una OperationalTask
        const tasks = [];
        const counts = { total: 0, entradas: 0, en_proceso: 0, por_aprobar: 0, programado: 0, publicado: 0, errores: 0 };

        for (const sub of submissions) {
            const art = articles[sub.id] || null;
            const post = art?.postId ? (postsMap[art.postId] || null) : null;
            const files = mediaMap[sub.id] || [];

            const col = resolveTaskColumn(sub, art, post);
            const agent = resolveAssignedAgent(col, art);

            // Calcular destinos sugeridos
            const destinations = await resolveSuggestedDestinations({
                submission: sub,
                campaign: {
                    id: sub.campaignId,
                    targeting: sub.campaignTargeting,
                    ownerClubId: sub.campaignOwnerClubId,
                    recipientClubId: sub.campaignRecipientClubId,
                },
                article: art,
                post,
            });

            // Resumir fotos y portada
            const imageFiles = files.filter(f => f.kind === 'image');
            const videoFiles = files.filter(f => f.kind === 'video');

            const task = {
                id: sub.id,
                type: 'content_submission',
                title: post?.title || art?.generated?.title || sub.title || 'Aporte de contenido sin título',
                subtitle: `${sub.club || 'Club'} · ${sub.campaignName || 'Campaña'}`,
                campaignId: sub.campaignId,
                campaignName: sub.campaignName,
                senderName: sub.senderName,
                senderEmail: sub.senderEmail,
                senderPhone: sub.senderPhone,
                club: sub.club,
                district: sub.district,
                date: sub.createdAt,
                activityDate: sub.activityDate,
                column: col === 'error' ? 'en_proceso' : col, // Si es error, se muestra en En Proceso o Por Aprobar con badge explícito
                actualState: col,
                isError: col === 'error' || art?.status === 'error',
                working: isWorkingState(art?.status),
                stageLabel: art?.statusDetail || (art?.status ? `Estado: ${art.status}` : 'Recibido en cola'),
                assignedAgent: agent,
                media: {
                    imageCount: imageFiles.length,
                    videoCount: videoFiles.length,
                    coverUrl: post?.image || art?.mediaPlan?.cover || null,
                    filesPreview: files.slice(0, 4).map(f => ({ filename: f.filename, kind: f.kind })),
                },
                article: art ? {
                    id: art.id,
                    postId: art.postId,
                    status: art.status,
                    title: art.generated?.title,
                    excerpt: art.generated?.excerpt,
                    category: art.generated?.category,
                    tags: art.generated?.tags || [],
                    publicUrl: art.publicUrl,
                    missingInfo: art.generated?.missingInfo || [],
                    copyIssues: art.generated?.copyIssues || [],
                    lastError: art.lastError,
                } : null,
                post: post ? {
                    id: post.id,
                    title: post.title,
                    slug: post.slug,
                    published: post.published,
                    scheduledAt: post.scheduledAt,
                } : null,
                destinations,
                lastError: art?.lastError || null,
            };

            tasks.push(task);

            // Contadores
            counts.total++;
            if (col === 'error' || art?.status === 'error') counts.errores++;
            if (col === 'entradas') counts.entradas++;
            else if (col === 'en_proceso') counts.en_proceso++;
            else if (col === 'por_aprobar') counts.por_aprobar++;
            else if (col === 'programado') counts.programado++;
            else if (col === 'publicado') counts.publicado++;
        }

        res.json({
            scope: operador ? 'platform' : 'site',
            tasks,
            counts,
        });
    } catch (e) {
        console.error('[mission-control] getOperationalBoard error:', e);
        res.status(500).json({ error: e?.message || 'Error al cargar el Centro de Control' });
    }
};

/**
 * GET /api/mission-control/operational-campaigns
 * Devuelve las campañas activas con métricas de automatización reales.
 */
export const getOperationalCampaigns = async (req, res) => {
    try {
        const operador = isOperator(req);
        const alcance = await campaignIdsInScope(req);

        const whereClause = !operador && Array.isArray(alcance) ? `WHERE c.id = ANY($1::text[])` : '';
        const params = !operador && Array.isArray(alcance) ? [alcance] : [];

        const { rows: campaigns } = await db.query(
            `SELECT c.id, c.name, c.slug, c.status, c.targeting, c."updatedAt",
                    COUNT(s.id)::int AS "totalSubmissions",
                    COUNT(CASE WHEN s.status = 'recibido' AND (a.status IS NULL OR a.status = 'recibida') THEN 1 END)::int AS "pendingInput",
                    COUNT(CASE WHEN a.status IN ('analizando', 'generando') THEN 1 END)::int AS "inProgress",
                    COUNT(CASE WHEN a.status IN ('borrador_listo', 'en_revision', 'requiere_info', 'aprobado') THEN 1 END)::int AS "readyApproval",
                    COUNT(CASE WHEN a.status = 'publicado' OR (s.status = 'publicado' AND p.published = true) THEN 1 END)::int AS "publishedCount"
             FROM "ContributionCampaign" c
             LEFT JOIN "ContributionSubmission" s ON s."campaignId" = c.id
             LEFT JOIN "SubmissionArticle" a ON a."submissionId" = s.id
             LEFT JOIN "Post" p ON p.id = a."postId"
             ${whereClause}
             GROUP BY c.id
             ORDER BY c."updatedAt" DESC
             LIMIT 50`,
            params
        );

        const decorated = campaigns.map(c => {
            const total = c.totalSubmissions || 0;
            const published = c.publishedCount || 0;
            const progress = total > 0 ? Math.min(100, Math.round((published / total) * 100)) : 0;

            return {
                id: c.id,
                title: c.name,
                slug: c.slug,
                status: c.status || 'active',
                progress,
                total,
                published,
                inProgress: c.inProgress,
                readyApproval: c.readyApproval,
                assignedAgents: ['rafael', 'mateo', 'valentina', 'andres'],
            };
        });

        res.json({ campaigns: decorated });
    } catch (e) {
        console.error('[mission-control] getOperationalCampaigns error:', e);
        res.status(500).json({ error: e?.message || 'Error cargando campañas operativas' });
    }
};

/**
 * POST /api/mission-control/run-automations
 * Ejecuta el barrido y avance inmediato de todas las tareas pendientes de IA.
 */
export const runAutomations = async (req, res) => {
    try {
        const sweepResult = await sweepArticles({ budgetMs: 60000 });
        const libraryResult = await sweepArticleLibrary({ budgetMs: 30000 });

        res.json({
            ok: true,
            message: `Automatizaciones ejecutadas con éxito. ${sweepResult.attended.length} artículos avanzados.`,
            attended: sweepResult.attended.length,
            libraryAttended: libraryResult.attended.length,
        });
    } catch (e) {
        console.error('[mission-control] runAutomations error:', e);
        res.status(500).json({ error: e?.message || 'Error al ejecutar automatizaciones' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/advance
 * Fuerza el avance inmediato de una tarea individual.
 */
export const advanceTask = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const result = await advanceArticle({ submissionId });
        res.json({ ok: true, article: result });
    } catch (e) {
        console.error('[mission-control] advanceTask error:', e);
        res.status(500).json({ error: e?.message || 'No se pudo avanzar la tarea' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/approve-publish
 * Aprueba y publica el artículo en los destinos seleccionados.
 */
export const approveAndPublishTask = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { campaignId, targetClubIds = [], publishToDistrict = true, publish = true, scheduledAt = null } = req.body;

        if (!campaignId) {
            return res.status(400).json({ error: 'campaignId es requerido' });
        }

        const row = await articleOf(submissionId);
        if (!row) {
            return res.status(404).json({ error: 'Artículo no encontrado para esta solicitud' });
        }

        const actor = req.user?.id || null;
        const actorName = req.user?.name || req.user?.email || 'Administrador';

        const result = await publishArticle({
            campaignId,
            row,
            publish,
            targetClubIds,
            publishToDistrict,
            scheduledAt,
            actor,
            actorName,
        });

        if (!result.ok) {
            return res.status(400).json({ error: result.detalle || result.reason || 'No se pudo publicar' });
        }

        // Trazabilidad de destinos en bitácora
        await logEvent({
            submissionId,
            campaignId,
            type: 'distribution',
            detail: `Publicación autorizada con ${targetClubIds.length} clubes destino y distrito=${publishToDistrict}`,
            actor,
            actorName,
        });

        res.json({
            ok: true,
            published: result.published,
            scheduled: result.scheduled,
            publicUrl: result.publicUrl,
            article: result.article,
        });
    } catch (e) {
        console.error('[mission-control] approveAndPublishTask error:', e);
        res.status(500).json({ error: e?.message || 'Error aprobando y publicando' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/retry
 * Reintenta una etapa fallida.
 */
export const retryTask = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const row = await articleOf(submissionId);
        if (!row) return res.status(404).json({ error: 'Artículo no encontrado' });

        const result = await retryArticleStage({ row });
        res.json({ ok: true, article: result });
    } catch (e) {
        console.error('[mission-control] retryTask error:', e);
        res.status(500).json({ error: e?.message || 'Error al reintentar la etapa' });
    }
};
