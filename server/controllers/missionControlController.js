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
    sweepArticles, sweepArticleLibrary, postOf, enqueueArticle, runArticleUntilDone,
} from '../lib/submissionArticleEngine.js';
import {
    reelsFor, enqueueReel, sweepReels, reelOf, updateReelSelection, retryReelStage,
} from '../lib/submissionReelEngine.js';
import { auditSubmissionPhotosForReel, MIN_OPTIMAL_REEL_PHOTOS } from '../lib/reelImageClassifier.js';
import {
    shareEntity, accountsForTenant,
} from '../lib/socialPublishingService.js';
import { resolveSuggestedDestinations } from '../lib/destinationEngine.js';
import { getSubmission, clubsOf, logEvent } from '../lib/contentSubmissionStore.js';
import { isWorkingState, stageToRetry } from '../lib/submissionArticleSpec.js';

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
    reels: {
        id: 'camila',
        name: 'Camila',
        role: 'Directora de Video Vertical & Reels IA',
        icon: '🎬',
        color: 'bg-rose-600',
    },
    redes: {
        id: 'lucas',
        name: 'Lucas',
        role: 'Especialista en Difusión Fanpage & X',
        icon: '📢',
        color: 'bg-sky-600',
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
 * Determina a qué columna del flujo editorial canónico pertenece una solicitud (FASE 1):
 * 01. 'entradas': Solicitud recibida recién ingresada desde formularios vinculados
 * 02. 'en_revision': Validación técnica y editorial, calidad de fotos, inconsistencias
 * 03. 'por_aprobar': Borrador listo o autorización editorial requerida para producción
 * 04. 'en_produccion': Preparación de entregables (redacción IA, reel vertical 9:16, piezas gráficas)
 * 05. 'listo_distribuir': Entregables obligatorios aprobados y listos para lanzamiento
 * 06. 'difusion': Programado para emisión futura o en difusión activa multicanal
 * 07. 'completado': Publicado y cerrado con trazabilidad en todos los canales obligatorios
 */
function resolveTaskColumn(submission, article, post, reel, socialDists = [], reelAudit = null) {
    const artStatus = article?.status || null;
    const subStatus = submission?.status || null;
    const postPublished = post?.published === true;
    const scheduledAt = post?.scheduledAt ? new Date(post.scheduledAt) : null;
    const reelStatus = reel?.status || null;

    const hasFb = socialDists.some(d => (d.network === 'facebook' || d.network === 'facebook_page') && d.status === 'published');
    const hasX = socialDists.some(d => d.network === 'x' && d.status === 'published');
    const isReelDone = ['aprobada', 'publicada'].includes(reelStatus);

    // 07. COMPLETADO: Artículo publicado y canales completados (o cerrado explícitamente)
    if (subStatus === 'publicado' && (postPublished || artStatus === 'publicado') && (isReelDone || !reelAudit?.isOptimal || hasFb || hasX)) {
        return 'completado';
    }

    // 06. PROGRAMADO / EN DIFUSIÓN: Emisión diferida programada a futuro o difusión activa
    if (scheduledAt && scheduledAt.getTime() > Date.now()) {
        return 'difusion';
    }
    if (postPublished && (!hasFb || !hasX) && (isReelDone || !reelAudit?.isOptimal)) {
        return 'difusion';
    }

    // 05. LISTO PARA DISTRIBUIR: Artículo aprobado/listo pero aún no emitido
    if ((artStatus === 'aprobado' || subStatus === 'listo_difusion') && !postPublished) {
        return 'listo_distribuir';
    }

    // 04. EN PRODUCCIÓN: Redacción de artículo en curso o Reel en producción activa
    const isReelWorking = ['recibida', 'analizando', 'preparando', 'generando', 'componiendo', 'configurando', 'lista'].includes(reelStatus);
    if (postPublished && isReelWorking) {
        return 'en_produccion';
    }
    if (['analizando', 'generando'].includes(artStatus) || subStatus === 'en_produccion') {
        return 'en_produccion';
    }

    // 03. POR APROBAR: Borrador editorial listo esperando visto bueno humano
    if ((artStatus === 'borrador_listo' || subStatus === 'por_aprobar') && !postPublished) {
        return 'por_aprobar';
    }

    // 02. EN REVISIÓN: En proceso de revisión editorial, o requiere info/ajustes, o validación
    if (['en_revision', 'requiere_info'].includes(artStatus) || subStatus === 'en_revision' || artStatus === 'error') {
        return 'en_revision';
    }

    // 01. ENTRADAS: Estado inicial de recepción
    return 'entradas';
}

/**
 * Resuelve el estado especial complementario (flags sin desarmar la columna principal).
 */
function resolveSpecialState(submission, article, reel) {
    if (submission?.status === 'rechazado') return 'rechazado';
    if (submission?.status === 'cancelado') return 'cancelado';
    if (submission?.status === 'bloqueado') return 'bloqueado';
    if (submission?.status === 'pausado') return 'pausado';
    if (submission?.status === 'requiere_ajustes' || article?.status === 'requiere_info' || article?.generated?.copyIssues?.length > 0) return 'requiere_ajustes';
    if (article?.status === 'error' || reel?.status === 'fallida' || reel?.status === 'error' || article?.lastError) return 'error_tecnico';
    return null;
}

/**
 * Resuelve el agente responsable según la etapa del flujo canónico.
 */
function resolveAssignedAgent(column, article, reel) {
    if (column === 'entradas') return AGENT_PERSONAS.analizando;
    if (column === 'en_revision') return AGENT_PERSONAS.por_aprobar;
    if (column === 'por_aprobar') return AGENT_PERSONAS.por_aprobar;
    if (column === 'en_produccion') {
        if (reel && ['analizando', 'preparando', 'generando', 'componiendo', 'configurando', 'lista'].includes(reel.status)) {
            return AGENT_PERSONAS.reels;
        }
        return AGENT_PERSONAS.generando;
    }
    if (column === 'listo_distribuir') return AGENT_PERSONAS.programado;
    if (column === 'difusion') return AGENT_PERSONAS.redes;
    if (column === 'completado') return AGENT_PERSONAS.publicado;
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
                    s."contentType", s.program, s."areaFocus", s.priority,
                    s."activationCampaignId",
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
        const reels = await reelsFor(subIds);

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

        // Consultar estado de difusión en redes (Facebook Fanpage, X, etc.)
        const socialDistsMap = {};
        if (postIds.length > 0) {
            try {
                const { rows: distRows } = await db.query(
                    `SELECT "entityId", network, status, "externalUrl", "createdAt", error
                     FROM "ContentDistribution"
                     WHERE "entityType" = 'post' AND "entityId" = ANY($1::text[])
                     ORDER BY "createdAt" DESC`,
                    [postIds]
                );
                for (const dr of distRows) {
                    if (!socialDistsMap[dr.entityId]) socialDistsMap[dr.entityId] = [];
                    socialDistsMap[dr.entityId].push(dr);
                }
            } catch (drErr) {
                console.warn('[missionControl] distRows error:', drErr?.message);
            }
        }

        // Consultar proyectos Reel asociados (video vertical 9:16 generado)
        const reelProjectIds = Object.values(reels).map(r => r?.reelProjectId).filter(Boolean);
        const reelProjectsMap = {};
        if (reelProjectIds.length > 0) {
            try {
                const { rows: rpRows } = await db.query(
                    `SELECT id, status, "statusDetail", "videoUrl", "posterUrl", "durationSec", "creditsEstimated"
                     FROM "ReelProject"
                     WHERE id = ANY($1::text[])`,
                    [reelProjectIds]
                );
                for (const rp of rpRows) reelProjectsMap[rp.id] = rp;
            } catch (rpErr) {
                console.warn('[missionControl] reelProjects error:', rpErr?.message);
            }
        }

        // Obtener archivos de medios para cada solicitud (imágenes/videos)
        const mediaMap = {};
        if (subIds.length > 0) {
            const { rows: files } = await db.query(
                `SELECT id, "submissionId", kind, "s3Key", filename, bytes, "sortOrder", "mediaId", "mediaUrl"
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

        // Consultar análisis multimedia en SubmissionArticleMedia (visión IA, notas de portada, descartes)
        const articleMediaMap = {};
        if (subIds.length > 0) {
            try {
                const { rows: artMediaRows } = await db.query(
                    `SELECT "submissionId", "fileId", role, score, analysis, "coverNote", excluded, "excludedReason"
                     FROM "SubmissionArticleMedia"
                     WHERE "submissionId" = ANY($1::text[])`,
                    [subIds]
                );
                for (const m of artMediaRows) {
                    if (!articleMediaMap[m.submissionId]) articleMediaMap[m.submissionId] = {};
                    articleMediaMap[m.submissionId][m.fileId] = m;
                }
            } catch (errMedia) {
                console.warn('[missionControl] artMediaRows error:', errMedia?.message);
            }
        }

        // Mapear cada registro a una OperationalTask del flujo editorial canónico
        const tasks = [];
        const counts = {
            total: 0,
            entradas: 0,
            en_revision: 0,
            por_aprobar: 0,
            en_produccion: 0,
            listo_distribuir: 0,
            difusion: 0,
            completado: 0,
            errores: 0,
            requiere_ajustes: 0,
        };

        for (const sub of submissions) {
            const art = articles[sub.id] || null;
            const post = art?.postId ? (postsMap[art.postId] || null) : null;
            const files = mediaMap[sub.id] || [];
            const subMediaAnalysis = articleMediaMap[sub.id] || {};
            const reelAudit = auditSubmissionPhotosForReel(files, subMediaAnalysis);
            const reel = reels[sub.id] || null;
            const reelProj = reel?.reelProjectId ? (reelProjectsMap[reel.reelProjectId] || null) : null;
            const postDists = post?.id ? (socialDistsMap[post.id] || []) : [];

            const col = resolveTaskColumn(sub, art, post, reel, postDists, reelAudit);
            const specialState = resolveSpecialState(sub, art, reel);
            const agent = resolveAssignedAgent(col, art, reel);

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

            const hasFacebook = postDists.some(d => (d.network === 'facebook' || d.network === 'facebook_page') && d.status === 'published');
            const hasX = postDists.some(d => d.network === 'x' && d.status === 'published');

            // Modelo desacoplado de entregables multiformato (FASE 1)
            const isReelDone = ['aprobada', 'publicada'].includes(reel?.status);
            const isReelWorking = ['recibida', 'analizando', 'preparando', 'generando', 'componiendo', 'configurando', 'lista'].includes(reel?.status);
            const deliverables = [
                {
                    id: 'article_web',
                    type: 'article_web',
                    label: 'Artículo Web',
                    status: (post?.published || art?.status === 'publicado') ? 'publicado' : (art?.status || 'pendiente'),
                    agent: 'Rafael',
                    completed: post?.published === true || art?.status === 'publicado',
                    publicUrl: art?.publicUrl || null,
                },
                {
                    id: 'reel_video',
                    type: 'reel_video',
                    label: 'Reel Vertical 9:16',
                    status: isReelDone ? 'publicado' : (isReelWorking ? 'en_produccion' : (reel?.status === 'fallida' ? 'error' : (reelAudit?.isOptimal ? 'listo' : 'no_requerido'))),
                    agent: 'Camila',
                    completed: isReelDone,
                    videoUrl: reelProj?.videoUrl || null,
                    isOptimal: reelAudit?.isOptimal,
                },
                {
                    id: 'copy_facebook',
                    type: 'copy_facebook',
                    label: 'Copy Fanpage',
                    status: hasFacebook ? 'publicado' : (post?.published ? 'listo' : 'pendiente'),
                    agent: 'Lucas',
                    completed: hasFacebook,
                },
                {
                    id: 'copy_x',
                    type: 'copy_x',
                    label: 'Copy Red X',
                    status: hasX ? 'publicado' : (post?.published ? 'listo' : 'pendiente'),
                    agent: 'Lucas',
                    completed: hasX,
                },
            ];

            const task = {
                id: sub.id,
                type: 'content_submission',
                title: post?.title || art?.generated?.title || sub.title || 'Aporte de contenido sin título',
                subtitle: `${sub.club || 'Club'} · ${sub.campaignName || 'Campaña'}`,
                campaignId: sub.campaignId,
                campaignName: sub.campaignName,
                activationCampaignId: sub.activationCampaignId || null,
                contentType: sub.contentType || null,
                program: sub.program || null,
                areaFocus: sub.areaFocus || null,
                priority: sub.priority || null,
                senderName: sub.senderName,
                senderEmail: sub.senderEmail,
                senderPhone: sub.senderPhone,
                club: sub.club,
                district: sub.district,
                date: sub.createdAt,
                activityDate: sub.activityDate,
                column: col,
                actualState: col,
                specialState,
                isError: specialState === 'error_tecnico' || art?.status === 'error' || reel?.status === 'fallida',
                working: isWorkingState(art?.status) || isReelWorking,
                stageLabel: reel?.statusDetail || art?.statusDetail || (art?.status ? `Estado: ${art.status}` : 'Recibido en cola'),
                assignedAgent: agent,
                deliverables,
                media: {
                    imageCount: imageFiles.length,
                    videoCount: videoFiles.length,
                    coverUrl: post?.image || art?.mediaPlan?.cover || null,
                    filesPreview: files.slice(0, 5).map(f => ({ filename: f.filename, kind: f.kind })),
                },
                reelAudit,
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
                reel: reel ? {
                    id: reel.id,
                    versionNumber: reel.versionNumber,
                    status: reel.status,
                    statusDetail: reel.statusDetail,
                    reelProjectId: reel.reelProjectId,
                    creditsEstimated: reel.creditsEstimated || reelProj?.creditsEstimated || 0,
                    generatedAt: reel.generatedAt,
                    lastError: reel.lastError,
                    videoUrl: reelProj?.videoUrl || null,
                    posterUrl: reelProj?.posterUrl || null,
                    durationSec: reelProj?.durationSec || null,
                    projectStatus: reelProj?.status || null,
                    auditStatus: reelAudit.status,
                    isOptimal: reelAudit.isOptimal,
                    realPhotoCount: reelAudit.realPhotoCount,
                    graphicCount: reelAudit.graphicCount,
                    auditDetail: reelAudit.statusDetail,
                } : {
                    id: null,
                    versionNumber: 1,
                    status: reelAudit.isOptimal ? 'pendiente_optimo' : 'requiere_mapeo',
                    statusDetail: reelAudit.statusDetail,
                    reelProjectId: null,
                    creditsEstimated: 40,
                    generatedAt: null,
                    lastError: null,
                    videoUrl: null,
                    posterUrl: null,
                    durationSec: null,
                    projectStatus: null,
                    auditStatus: reelAudit.status,
                    isOptimal: reelAudit.isOptimal,
                    realPhotoCount: reelAudit.realPhotoCount,
                    graphicCount: reelAudit.graphicCount,
                },
                social: {
                    distributions: postDists.map(d => ({
                        network: d.network,
                        status: d.status,
                        externalUrl: d.externalUrl,
                        createdAt: d.createdAt,
                        error: d.error,
                    })),
                    facebook: postDists.find(d => d.network === 'facebook' || d.network === 'facebook_page') || null,
                    x: postDists.find(d => d.network === 'x') || null,
                    hasFacebook,
                    hasX,
                    isFullyShared: hasFacebook && hasX,
                },
                destinations,
                lastError: art?.lastError || reel?.lastError || null,
            };

            tasks.push(task);

            // Contadores rigurosos y deduplicados
            counts.total++;
            counts[col] = (counts[col] || 0) + 1;
            if (task.isError) counts.errores++;
            if (specialState === 'requiere_ajustes') counts.requiere_ajustes++;
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
            const inProgress = c.inProgress || 0;
            const readyApproval = c.readyApproval || 0;
            const publicationProgress = total > 0 ? Math.min(100, Math.round((published / total) * 100)) : 0;
            const productionProgress = total > 0 ? Math.min(100, Math.round(((published + readyApproval + inProgress) / total) * 100)) : 0;
            const isPermanent = c.id === 'rotary-en-accion-universal' || c.slug === 'rotary-en-accion-universal';

            return {
                id: c.id,
                title: c.name,
                slug: c.slug,
                status: c.status || 'activa',
                isPermanent,
                kind: isPermanent ? 'institutional' : 'special',
                progress: publicationProgress,
                publicationProgress,
                productionProgress,
                total,
                published,
                inProgress,
                readyApproval,
                assignedAgents: ['rafael', 'mateo', 'valentina', 'camila', 'lucas'],
            };
        });

        // Garantizar que la Campaña Institucional Permanente aparezca al frente
        decorated.sort((a, b) => {
            if (a.isPermanent && !b.isPermanent) return -1;
            if (!a.isPermanent && b.isPermanent) return 1;
            return 0;
        });

        // Campañas de Activación de Contenido (v4.1117): subcampañas activas y programadas
        // Filtramos borradores y archivadas para evitar duplicación en la barra lateral
        try {
            const { rows: act } = await db.query(
                `SELECT c.id, c.name, c.status,
                  (SELECT COUNT(*)::int FROM "ContentActivationEnrollment" n WHERE n."campaignId"=c.id) AS total,
                  (SELECT COUNT(*)::int FROM "ContentActivationEnrollment" n WHERE n."campaignId"=c.id AND n.status='publicada') AS published,
                  (SELECT COUNT(*)::int FROM "ContentActivationEnrollment" n WHERE n."campaignId"=c.id AND n.status IN ('por_aprobar','contenido_recibido')) AS ready
                 FROM "ContentActivationCampaign" c
                 WHERE c.status NOT IN ('borrador', 'archivada')
                 ORDER BY c."updatedAt" DESC LIMIT 20`).catch(() => ({ rows: [] }));

            for (const a of act || []) {
                // Evitar duplicar si ya existe una campaña de contribución con nombre idéntico
                const exists = decorated.some(d => d.title.trim().toLowerCase() === a.name.trim().toLowerCase());
                if (!exists) {
                    const pubProg = a.total ? Math.min(100, Math.round((a.published / a.total) * 100)) : 0;
                    decorated.push({
                        id: `activation:${a.id}`,
                        title: `⚡ ${a.name}`,
                        slug: null,
                        status: a.status || 'activa',
                        isPermanent: false,
                        kind: 'subcampaign',
                        progress: pubProg,
                        publicationProgress: pubProg,
                        productionProgress: a.total ? Math.min(100, Math.round(((a.published + (a.ready || 0)) / a.total) * 100)) : 0,
                        total: a.total || 0,
                        published: a.published || 0,
                        inProgress: 0,
                        readyApproval: a.ready || 0,
                        assignedAgents: ['rafael', 'mateo', 'andres'],
                        activationId: a.id,
                    });
                }
            }
        } catch { /* módulo aún sin tablas: no rompe el tablero */ }

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
        // 1. Encolar solicitudes activas que aún no tengan SubmissionArticle
        const { rows: unenqueued } = await db.query(
            `SELECT s.id, s."campaignId", s."originClubId", c."ownerClubId", c."recipientClubId"
             FROM "ContributionSubmission" s
             JOIN "ContributionCampaign" c ON c.id = s."campaignId"
             LEFT JOIN "SubmissionArticle" a ON a."submissionId" = s.id
             WHERE a.id IS NULL AND s.status != 'descartado'
             ORDER BY s."createdAt" DESC
             LIMIT 25`
        );
        for (const sub of unenqueued) {
            try {
                await enqueueArticle({
                    submissionId: sub.id,
                    campaignId: sub.campaignId,
                    clubId: sub.originClubId || sub.ownerClubId || sub.recipientClubId || null,
                });
            } catch (err) {
                console.warn('[runAutomations] enqueue error:', sub.id, err?.message);
            }
        }

        // 2. Ejecutar barridos de generación y multimedia (artículos, biblioteca y reels)
        const sweepResult = await sweepArticles({ budgetMs: 40000 });
        const libraryResult = await sweepArticleLibrary({ budgetMs: 20000 });
        let reelSweepResult = { attended: [] };
        try {
            reelSweepResult = await sweepReels({ budgetMs: 30000, limit: 10 });
        } catch (rErr) {
            console.warn('[runAutomations] sweepReels warn:', rErr?.message);
        }

        const totalAttended = (sweepResult.attended?.length || 0) + (unenqueued.length || 0) + (reelSweepResult.attended?.length || 0);
        res.json({
            ok: true,
            message: `Automatizaciones ejecutadas: ${totalAttended} procesos atendidos (${unenqueued.length} nuevas solicitudes encoladas, ${sweepResult.attended?.length || 0} artículos redactados, ${reelSweepResult.attended?.length || 0} reels procesados).`,
            enqueued: unenqueued.length,
            attended: sweepResult.attended?.length || 0,
            libraryAttended: libraryResult.attended?.length || 0,
            reelsAttended: reelSweepResult.attended?.length || 0,
        });
    } catch (e) {
        console.error('[mission-control] runAutomations error:', e);
        res.status(500).json({ error: e?.message || 'Error al ejecutar automatizaciones' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/advance
 * Fuerza el avance inmediato de una tarea individual con IA.
 */
export const advanceTask = async (req, res) => {
    try {
        const { submissionId } = req.params;
        let art = await articleOf(submissionId);
        if (!art) {
            const { rows: subRows } = await db.query(
                `SELECT s.id, s."campaignId", s."originClubId", c."ownerClubId", c."recipientClubId"
                 FROM "ContributionSubmission" s
                 JOIN "ContributionCampaign" c ON c.id = s."campaignId"
                 WHERE s.id = $1`,
                [submissionId]
            );
            if (subRows[0]) {
                const s = subRows[0];
                await enqueueArticle({
                    submissionId: s.id,
                    campaignId: s.campaignId,
                    clubId: s.originClubId || s.ownerClubId || s.recipientClubId || null,
                });
            }
        }
        const sessionClubId = req.user?.clubId || null;
        const result = await runArticleUntilDone(submissionId, { sessionClubId, budgetMs: 40000 });
        res.json({ ok: true, article: result?.article || await articleOf(submissionId) });
    } catch (e) {
        console.error('[mission-control] advanceTask error:', e);
        res.status(500).json({ error: e?.message || 'No se pudo avanzar la tarea' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/approve-publish
 * Aprueba y publica el artículo en los destinos seleccionados y avanza automáticamente
 * a la etapa de Generación de Reels para redes audiovisuales (Instagram, TikTok, YouTube Shorts).
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
            detail: `Publicación web autorizada con ${targetClubIds.length} clubes destino y distrito=${publishToDistrict}`,
            actor,
            actorName,
        });

        // 🎬 AVANCE AUTOMÁTICO A GENERACIÓN DE REEL (IG Reels, TikTok, Shorts)
        // Regla inteligente: Solo encolar automáticamente si la IA verifica 5 o más fotografías reales
        let enqueuedReel = null;
        if (result.published) {
            try {
                const { rows: files } = await db.query(
                    `SELECT id, "submissionId", kind, "s3Key", filename, bytes, "sortOrder", "mediaId", "mediaUrl"
                     FROM "ContributionSubmissionFile"
                     WHERE "submissionId" = $1
                     ORDER BY "sortOrder" ASC`,
                    [submissionId]
                );
                const { rows: artMedia } = await db.query(
                    `SELECT "fileId", role, score, analysis, "coverNote", excluded, "excludedReason"
                     FROM "SubmissionArticleMedia"
                     WHERE "submissionId" = $1`,
                    [submissionId]
                );
                const artMediaMap = {};
                for (const m of artMedia) artMediaMap[m.fileId] = m;
                const audit = auditSubmissionPhotosForReel(files, artMediaMap);

                if (audit.isOptimal) {
                    const sub = await getSubmission(submissionId);
                    const reelRes = await enqueueReel({
                        submissionId,
                        campaignId,
                        clubId: row.clubId || sub?.originClubId || null,
                        articleId: row.id,
                        generatedBy: 'ai_workflow',
                    });
                    enqueuedReel = reelRes.reel || null;

                    await logEvent({
                        submissionId,
                        campaignId,
                        type: 'reel',
                        detail: `Artículo publicado: auditoría IA aprobada (${audit.realPhotoCount} fotos reales verificadas; ${audit.graphicCount} banners/invitaciones excluidos). Se avanzó automáticamente a Generación de Reels.`,
                        actor,
                        actorName,
                    });
                } else {
                    await logEvent({
                        submissionId,
                        campaignId,
                        type: 'reel',
                        detail: `Artículo publicado: material insuficiente o mixto para Reel automático (${audit.realPhotoCount} fotos reales de ${audit.totalImages} archivos; ${audit.graphicCount} banners/invitaciones detectados). Mínimo ${MIN_OPTIMAL_REEL_PHOTOS} fotos reales requeridas. Requiere mapeo por editor.`,
                        actor,
                        actorName,
                    });
                }
            } catch (reelErr) {
                console.warn('[missionControl] auto-enqueue reel error:', reelErr?.message);
            }
        }

        res.json({
            ok: true,
            published: result.published,
            scheduled: result.scheduled,
            publicUrl: result.publicUrl,
            article: result.article,
            reel: enqueuedReel,
        });
    } catch (e) {
        console.error('[mission-control] approveAndPublishTask error:', e);
        res.status(500).json({ error: e?.message || 'Error aprobando y publicando' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/generate-reel
 * Inicia o avanza de inmediato la producción del video Reel para esta solicitud.
 * Admite `selectedFileIds` si el editor mapeó/seleccionó fotos específicas.
 */
export const generateTaskReel = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { selectedFileIds } = req.body || {};
        const sub = await getSubmission(submissionId);
        if (!sub) return res.status(404).json({ error: 'Solicitud no encontrada' });

        const art = await articleOf(submissionId);
        const { reel } = await enqueueReel({
            submissionId,
            campaignId: sub.campaignId,
            clubId: sub.originClubId || null,
            articleId: art?.id || null,
            generatedBy: 'human_trigger',
        });

        // Si el editor mapeó manualmente fotografías específicas para este Reel:
        if (Array.isArray(selectedFileIds) && selectedFileIds.length > 0 && reel) {
            try {
                await updateReelSelection({
                    row: reel,
                    fileIds: selectedFileIds,
                    actor: req.user?.id || null,
                    actorName: req.user?.name || req.user?.email || 'Editor Mission Control',
                });
            } catch (selErr) {
                console.warn('[missionControl] updateReelSelection warn:', selErr?.message);
            }
        }

        try {
            await sweepReels({ budgetMs: 20000, limit: 3 });
        } catch (swErr) {
            console.warn('[missionControl] sweepReels on demand warn:', swErr?.message);
        }

        const updatedReel = await reelOf(submissionId);
        res.json({ ok: true, reel: updatedReel || reel });
    } catch (e) {
        console.error('[mission-control] generateTaskReel error:', e);
        res.status(500).json({ error: e?.message || 'Error al iniciar generación de Reel' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/share-social
 * Difunde el artículo web como publicación de blog / enlace en Facebook Fanpage y X.
 */
export const shareTaskSocial = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { networks = ['facebook', 'x'], message, messages } = req.body || {};

        const art = await articleOf(submissionId);
        if (!art || !art.postId) {
            return res.status(400).json({ error: 'El artículo debe estar publicado antes de difundirlo en redes.' });
        }

        const sub = await getSubmission(submissionId);
        const clubId = sub?.originClubId || req.user?.clubId || null;

        const accounts = await accountsForTenant(clubId);
        const targetAccounts = accounts.filter(a =>
            networks.includes(a.platform) || (networks.includes('facebook') && a.platform === 'facebook_page')
        );

        if (!targetAccounts.length) {
            return res.status(400).json({
                error: 'No se encontraron cuentas activas de Facebook Fanpage o X conectadas a este sitio.',
                fix: 'Conecta la Fanpage oficial o tu cuenta de X en Hub Social → Redes Sociales.',
            });
        }

        const accountIds = targetAccounts.map(a => a.id);
        const operationKey = `mc_${submissionId}_${Date.now()}`;

        const shareRes = await shareEntity({
            entityType: 'post',
            entityId: art.postId,
            accountIds,
            message: typeof message === 'string' ? message : (art.generated?.excerpt || art.generated?.title || ''),
            messages: messages || null,
            operationKey,
            user: req.user,
            siteId: clubId,
            publicUrl: art.publicUrl || null,
        });

        await logEvent({
            submissionId,
            campaignId: sub.campaignId,
            type: 'social',
            detail: `Difusión ejecutada en redes (${networks.join(', ')}): estado ${shareRes.status || 'procesado'}`,
            actor: req.user?.id || null,
            actorName: req.user?.name || req.user?.email || 'Administrador',
        });

        res.json({ ok: true, result: shareRes });
    } catch (e) {
        console.error('[mission-control] shareTaskSocial error:', e);
        res.status(500).json({ error: e?.message || 'Error al difundir en redes' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/retry
 * Reintenta una etapa fallida de manera segura, despachando al motor adecuado
 * (artículo o reel audiovisual) y reanudando el avance automático de IA.
 */
export const retryTask = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const art = await articleOf(submissionId);
        const reel = await reelOf(submissionId);

        let retriedArt = null;
        let retriedReel = null;

        // 1. Reintentar artículo si está en error o falló alguna de sus etapas
        if (art && (art.status === 'error' || art.lastError || Object.values(art.stages || {}).some(s => s?.status === 'error'))) {
            retriedArt = await retryArticleStage({ row: art });
            runArticleUntilDone(submissionId, { sessionClubId: req.user?.clubId || null, budgetMs: 35000 }).catch(e => {
                console.warn('[missionControl] auto-advance article after retry warn:', e?.message);
            });
        }

        // 2. Reintentar reel si está en error o su etapa falló
        if (reel && (reel.status === 'fallida' || reel.lastError || Object.values(reel.stages || {}).some(s => s?.status === 'error'))) {
            retriedReel = await retryReelStage({ row: reel });
            sweepReels({ budgetMs: 20000, limit: 1 }).catch(e => {
                console.warn('[missionControl] auto-advance reel after retry warn:', e?.message);
            });
        }

        // 3. Si no tenía flag de error explícito pero se solicitó retry:
        if (!retriedArt && !retriedReel) {
            if (art) {
                retriedArt = await retryArticleStage({ row: art });
                runArticleUntilDone(submissionId, { sessionClubId: req.user?.clubId || null, budgetMs: 35000 }).catch(() => {});
            } else if (reel) {
                retriedReel = await retryReelStage({ row: reel });
            }
        }

        res.json({
            ok: true,
            article: retriedArt || art,
            reel: retriedReel || reel,
            message: 'Etapa restablecida con éxito. El escuadrón de IA continuará el proceso.',
        });
    } catch (e) {
        console.error('[mission-control] retryTask error:', e);
        res.status(500).json({ error: e?.message || 'Error al reintentar la etapa' });
    }
};

/**
 * POST /api/mission-control/tasks/:submissionId/transition
 * Permite cambiar el estado editorial o especial de una solicitud (FASE 1),
 * registrando trazabilidad estricta e inalterable en ContributionSubmissionEvent.
 */
export const transitionTaskStage = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { targetColumn, specialState = null, note = '' } = req.body || {};

        const validColumns = ['entradas', 'en_revision', 'por_aprobar', 'en_produccion', 'listo_distribuir', 'difusion', 'completado'];
        if (targetColumn && !validColumns.includes(targetColumn)) {
            return res.status(400).json({ error: `Columna objetivo no válida: ${targetColumn}` });
        }

        const sub = await getSubmission(submissionId);
        if (!sub) {
            return res.status(404).json({ error: 'Solicitud no encontrada' });
        }

        const art = await articleOf(submissionId);
        const previousStatus = sub.status || 'recibido';
        const actor = req.user?.id || null;
        const actorName = req.user?.name || req.user?.email || 'Administrador';

        // Mapear columna a estado de ContributionSubmission
        let newSubStatus = sub.status;
        if (targetColumn === 'entradas') newSubStatus = 'recibido';
        else if (targetColumn === 'en_revision') newSubStatus = 'en_revision';
        else if (targetColumn === 'por_aprobar') newSubStatus = 'por_aprobar';
        else if (targetColumn === 'en_produccion') newSubStatus = 'en_produccion';
        else if (targetColumn === 'listo_distribuir') newSubStatus = 'listo_difusion';
        else if (targetColumn === 'difusion') newSubStatus = 'listo_difusion';
        else if (targetColumn === 'completado') newSubStatus = 'publicado';

        if (specialState) {
            if (['rechazado', 'cancelado', 'bloqueado', 'pausado', 'requiere_ajustes'].includes(specialState)) {
                newSubStatus = specialState;
            }
        }

        await db.query(
            `UPDATE "ContributionSubmission" SET status = $2, "updatedAt" = NOW() WHERE id = $1`,
            [submissionId, newSubStatus]
        );

        // Si se transicionó a por_aprobar y el artículo estaba en analizando o requiere_info, actualizar
        if (targetColumn === 'por_aprobar' && art && ['en_revision', 'requiere_info'].includes(art.status)) {
            await db.query(
                `UPDATE "SubmissionArticle" SET status = 'borrador_listo', "updatedAt" = NOW() WHERE id = $1`,
                [art.id]
            );
        }

        // Trazabilidad inalterable
        await logEvent({
            submissionId,
            campaignId: sub.campaignId,
            type: 'editorial_transition',
            fromState: previousStatus,
            toState: newSubStatus,
            detail: `Transición editorial a «${targetColumn}»${specialState ? ` (estado especial: ${specialState})` : ''}. ${note ? `Nota: ${note}` : ''}`,
            actor,
            actorName,
        });

        res.json({
            ok: true,
            submissionId,
            newStatus: newSubStatus,
            targetColumn,
            specialState,
        });
    } catch (e) {
        console.error('[mission-control] transitionTaskStage error:', e);
        res.status(500).json({ error: e?.message || 'Error al transicionar etapa' });
    }
};

