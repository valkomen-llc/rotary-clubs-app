// ════════════════════════════════════════════════════════════════════
// Video Informe IA — Controlador Backend
// v4.1100.0
//
// Orquesta el ciclo de vida completo de un Video Informe:
//   1. Consulta y alcance de campañas autorizadas (multi-tenant)
//   2. Extracción de hechos y métricas reales (anti-alucinación)
//   3. Generación y edición de guion por escenas
//   4. Storyboard y animación determinista (Ken Burns gratuita) o IA
//   5. Locución TTS granular por escena (ElevenLabs / OpenAI)
//   6. Render asíncrono con FFmpeg (no bloqueante)
//   7. Guardado en Biblioteca Multimedia y enlace a Distribución
// ════════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import db from '../lib/db.js';
import { ensureVideoReportSchema } from '../lib/ensureVideoReportSchema.js';
import { campaignsInScope, campaignInScope } from '../lib/campaignScope.js';
import { extractCampaignFacts, generateReportScript, parseDirectScriptToScenes } from '../lib/videoReportFacts.js';
import { getUnifiedCampaignMedia } from '../lib/videoReportMedia.js';
import { synthesize } from '../lib/reelNarration.js';
import { measureAudioDuration, renderStillMotion, composeReel } from '../lib/reelFfmpeg.js';
import { estimateReportCredits, REPORT_FORMATS } from '../lib/videoReportSpec.js';

let _s3deps = null;
const getS3 = async () => {
    if (!_s3deps) {
        const aws = await import('@aws-sdk/client-s3');
        _s3deps = {
            s3: new aws.S3Client({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
                },
                maxAttempts: 3
            }),
            PutObjectCommand: aws.PutObjectCommand
        };
    }
    return _s3deps;
};

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

const uploadBuffer = async (buffer, key, contentType) => {
    const { s3, PutObjectCommand } = await getS3();
    const bucket = bucketName();
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000'
    }));
    const region = process.env.AWS_REGION || 'us-east-1';
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return {
        url: `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`,
        key,
        bucket
    };
};

/**
 * 1. Listar campañas disponibles para el usuario según su scope multi-tenant.
 */
export async function listReportCampaigns(req, res) {
    try {
        await ensureVideoReportSchema();
        const campaigns = await campaignsInScope(req);
        const mapped = campaigns.map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            campaignType: c.campaignType,
            status: c.status,
            ownerClubId: c.ownerClubId || null,
            coverImage: c.content?.hero?.backgroundImage || c.content?.hero?.image || null
        }));
        res.json({ campaigns: mapped });
    } catch (e) {
        console.error('[videoReportController] listReportCampaigns:', e);
        res.status(500).json({ error: 'No se pudieron listar las campañas' });
    }
}

/**
 * 2. Cargar hechos verificados y resumen de la campaña.
 */
export async function getCampaignFacts(req, res) {
    try {
        await ensureVideoReportSchema();
        const { campaignId } = req.params;
        const editorialContext = req.query.editorialContext || '';

        const camp = await campaignInScope(req, campaignId);
        if (!camp) {
            return res.status(403).json({ error: 'No tenés permisos para acceder a esta campaña' });
        }
        const clubId = req.user?.clubId || camp.ownerClubId || null;

        const { snapshot, mediaPool } = await extractCampaignFacts(campaignId, {
            clubId,
            editorialContext
        });

        res.json({ snapshot, availableMediaCount: mediaPool.length });
    } catch (e) {
        console.error('[videoReportController] getCampaignFacts:', e);
        res.status(500).json({ error: e.message || 'Error cargando datos de la campaña' });
    }
}

/**
 * 3. Consultar multimedia unificada (solicitudes, biblioteca, campaña).
 */
export async function getCampaignUnifiedMediaHandler(req, res) {
    try {
        const { campaignId } = req.params;
        const {
            tab = 'todos',
            search = '',
            club = '',
            editorialContext = ''
        } = { ...req.query, ...(req.body || {}) };

        const camp = await campaignInScope(req, campaignId);
        if (!camp) {
            return res.status(403).json({ error: 'No tenés permisos para acceder a esta campaña' });
        }
        const clubId = req.user?.clubId || camp.ownerClubId || null;

        const result = await getUnifiedCampaignMedia(campaignId, {
            clubId,
            tab: String(tab),
            search: String(search),
            editorialContext: String(editorialContext || ''),
            clubFilter: String(club || '')
        });

        res.json({
            media: result.media,
            detectedClubs: result.detectedClubs || [],
            participatingClubs: result.participatingClubs || [],
            stats: result.stats || { total: result.media.length, priorityCount: 0 }
        });
    } catch (e) {
        console.error('[videoReportController] getCampaignUnifiedMedia:', e);
        res.status(500).json({ error: 'No se pudo cargar la multimedia' });
    }
}

/**
 * 4. Crear nuevo proyecto de Video Informe y estructurar escenas.
 * Soporta dos modos:
 *   - 'direct': El usuario suministró el guion completo (se parsea directamente en escenas con timing calculado)
 *   - 'ai': Genera guion asistido por IA a partir de hechos y contexto editorial
 */
export async function createReportProject(req, res) {
    try {
        await ensureVideoReportSchema();
        const {
            campaignId,
            title,
            objective = 'informe_final',
            audience = 'publico_general',
            format = '16:9',
            targetDurationSec = 120,
            tone = 'institucional',
            productionMode = 'equilibrado',
            editorialContext = '',
            scriptMode = 'ai',
            providedScriptText = ''
        } = req.body;

        if (!campaignId) {
            return res.status(400).json({ error: 'Falta campaignId' });
        }

        const camp = await campaignInScope(req, campaignId);
        if (!camp) {
            return res.status(403).json({ error: 'No tenés permisos sobre esta campaña' });
        }
        const clubId = req.user?.clubId || camp.ownerClubId || null;

        // 1. Extraer hechos reales de la campaña y del contexto editorial
        const { snapshot, mediaPool } = await extractCampaignFacts(campaignId, {
            clubId,
            editorialContext: editorialContext || providedScriptText
        });

        // 2. Estructurar guion según el modo elegido por el usuario
        let scriptData;
        const isDirect = scriptMode === 'direct' && providedScriptText && providedScriptText.trim().length > 10;

        if (isDirect) {
            scriptData = parseDirectScriptToScenes({
                scriptText: providedScriptText,
                mediaPool,
                title: title || snapshot.headline || 'Video Informe'
            });
        } else {
            scriptData = await generateReportScript({
                snapshot,
                mediaPool,
                brief: {
                    title: title || snapshot.headline,
                    objective,
                    audience,
                    format,
                    targetDurationSec: Number(targetDurationSec) || 120,
                    tone,
                    productionMode
                }
            });
        }

        // 3. Persistir VideoReportProject
        const projectId = `rep_${crypto.randomUUID()}`;
        const userId = req.user?.id || 'admin';
        const userEmail = req.user?.email || 'admin@rotary.org';

        await db.query(
            `INSERT INTO "VideoReportProject"
                (id, "campaignId", "clubId", "tenantId", title, objective, audience, format,
                 "targetDurationSec", tone, "productionMode", "editorialContext", "factualSnapshot",
                 status, "createdBy", "createdByName")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'script_ready', $14, $15)`,
            [
                projectId, campaignId, clubId || null, clubId || null,
                scriptData.title, objective, audience, format,
                Number(targetDurationSec) || 120, tone, productionMode,
                editorialContext, JSON.stringify(snapshot),
                userId, userEmail
            ]
        );

        // 4. Persistir VideoReportVersion (v1)
        const versionId = `ver_${crypto.randomUUID()}`;
        await db.query(
            `INSERT INTO "VideoReportVersion"
                (id, "projectId", "versionNumber", label, script, "isCurrent")
             VALUES ($1, $2, 1, 'Versión 1', $3, true)`,
            [versionId, projectId, JSON.stringify({ synopsis: scriptData.synopsis })]
        );

        // 5. Persistir VideoReportScene (las escenas de la v1)
        for (const s of scriptData.scenes) {
            const sceneId = `scn_${crypto.randomUUID()}`;
            await db.query(
                `INSERT INTO "VideoReportScene"
                    (id, "versionId", "projectId", "sortOrder", chapter, "sceneType", "durationSec",
                     "narrationText", "onScreenTitle", "onScreenSubtitle", "onScreenDataValue",
                     "onScreenDataLabel", "mediaUrl", "mediaId", "thumbUrl", "motionType",
                     "engineMode", "factSource")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
                [
                    sceneId, versionId, projectId, s.sortOrder, s.chapter, s.sceneType,
                    s.durationSec, s.narrationText, s.onScreenTitle, s.onScreenSubtitle,
                    s.onScreenDataValue, s.onScreenDataLabel, s.mediaUrl, s.mediaId,
                    s.thumbUrl, s.motionType, s.engineMode, JSON.stringify(s.factSource)
                ]
            );
        }

        // 6. Respaldo automático en Biblioteca al nacer (v4.1104.0)
        // Cada proyecto de Video Informe entra a la Biblioteca desde que se crea,
        // garantizando persistencia, historial y recuperación sin importar si se renderiza o no.
        const mediaId = `med_${crypto.randomUUID()}`;
        const projectTitle = scriptData.title || title || 'Video Informe IA';
        const filename = `${projectTitle.slice(0, 80)}.mp4`;
        const initialThumb = scriptData.scenes.find(s => s.thumbUrl)?.thumbUrl ||
                             scriptData.scenes.find(s => s.mediaUrl)?.mediaUrl ||
                             camp.coverImage || null;
        const initialUrl = scriptData.scenes.find(s => s.mediaUrl)?.mediaUrl ||
                           camp.coverImage ||
                           'https://rotary-platform-assets.s3.amazonaws.com/placeholder-video-report.png';

        try {
            await db.query(
                `INSERT INTO "Media"
                    (id, url, filename, type, "clubId", size, "thumbUrl", "sourceType", "sourceId", "sourceLabel", "createdAt")
                 VALUES ($1, $2, $3, 'video', $4, 0, $5, 'video_report', $6, $7, NOW())`,
                [
                    mediaId, initialUrl, filename,
                    clubId || null, initialThumb, projectId,
                    projectTitle
                ]
            );

            await db.query(
                `UPDATE "VideoReportProject"
                    SET "mediaId" = $1, "savedToLibraryAt" = NOW()
                  WHERE id = $2`,
                [mediaId, projectId]
            );
            console.log(`[videoReportController] Proyecto ${projectId} respaldado automáticamente en Biblioteca con Media ID ${mediaId}`);
        } catch (errMedia) {
            console.warn('[videoReportController] No se pudo crear fila inicial en Media (no fatal):', errMedia.message);
        }

        // Devolver el proyecto completo
        const project = await loadFullProject(projectId);
        res.json({ project });
    } catch (e) {
        console.error('[videoReportController] createReportProject:', e);
        res.status(500).json({ error: e.message || 'No se pudo crear el proyecto' });
    }
}

/**
 * 5. Obtener proyecto completo con escenas y versiones.
 */
export async function getReportProject(req, res) {
    try {
        await ensureVideoReportSchema();
        const { id } = req.params;
        const project = await loadFullProject(id);
        if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
        res.json({ project });
    } catch (e) {
        console.error('[videoReportController] getReportProject:', e);
        res.status(500).json({ error: 'No se pudo cargar el proyecto' });
    }
}

/**
 * 6. Actualizar una escena específica (reemplazar foto, cambiar duración, texto, motion).
 */
export async function updateReportScene(req, res) {
    try {
        const { id, sceneId } = req.params;
        const fields = req.body;

        const updates = [];
        const params = [sceneId, id];
        const allowedCols = [
            'durationSec', 'narrationText', 'onScreenTitle', 'onScreenSubtitle',
            'onScreenDataValue', 'onScreenDataLabel', 'mediaUrl', 'mediaId',
            'thumbUrl', 'motionType', 'engineMode', 'chapter', 'sceneType'
        ];

        for (const col of allowedCols) {
            if (fields[col] !== undefined) {
                params.push(fields[col]);
                updates.push(`"${col}" = $${params.length}`);
            }
        }

        if (!updates.length) return res.json({ ok: true });

        await db.query(
            `UPDATE "VideoReportScene"
                SET ${updates.join(', ')}, "updatedAt" = NOW()
              WHERE id = $1 AND "projectId" = $2`,
            params
        );

        await db.query(
            `UPDATE "VideoReportProject" SET "updatedAt" = NOW() WHERE id = $1`,
            [id]
        );

        res.json({ ok: true });
    } catch (e) {
        console.error('[videoReportController] updateReportScene:', e);
        res.status(500).json({ error: 'No se pudo actualizar la escena' });
    }
}

/**
 * 7. Reordenar escenas (Drag and drop en el Storyboard).
 */
export async function reorderReportScenes(req, res) {
    try {
        const { id } = req.params;
        const { sceneIds } = req.body;
        if (!Array.isArray(sceneIds)) return res.status(400).json({ error: 'Falta sceneIds array' });

        for (let i = 0; i < sceneIds.length; i++) {
            await db.query(
                `UPDATE "VideoReportScene" SET "sortOrder" = $1, "updatedAt" = NOW()
                  WHERE id = $2 AND "projectId" = $3`,
                [i, sceneIds[i], id]
            );
        }

        res.json({ ok: true });
    } catch (e) {
        console.error('[videoReportController] reorderReportScenes:', e);
        res.status(500).json({ error: 'No se pudo reordenar' });
    }
}

/**
 * 8. Sintetizar la voz en off de una escena con TTS y sincronizar tiempos.
 */
export async function synthesizeSceneVoice(req, res) {
    try {
        const { id, sceneId } = req.params;
        const { provider = 'elevenlabs', voice = 'es_latam', speed = 1.0, gender = 'female' } = req.body;

        const { rows } = await db.query(
            `SELECT s.*, p."clubId"
               FROM "VideoReportScene" s
               JOIN "VideoReportProject" p ON p.id = s."projectId"
              WHERE s.id = $1 AND s."projectId" = $2`,
            [sceneId, id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Escena no encontrada' });
        const scene = rows[0];

        const text = (scene.narrationText || '').trim();
        if (!text) return res.status(400).json({ error: 'La escena no tiene texto de narración' });

        // Sintetizar audio real
        const synth = await synthesize({
            text,
            provider,
            gender,
            speed: Number(speed) || 1.0,
            language: 'es-419'
        });

        // Medir duración real con FFmpeg (sin adivinar ni recortar)
        const measuredSec = await measureAudioDuration(synth.buffer);
        const durationSec = Number(measuredSec ? measuredSec.toFixed(2) : 5.0);

        // Subir a S3
        const clubKey = scene.clubId || 'global';
        const s3Key = `clubs/${clubKey}/video-reports/voice-${sceneId}-${Date.now()}.mp3`;
        const { url: voiceAudioUrl } = await uploadBuffer(synth.buffer, s3Key, 'audio/mpeg');

        // La locución manda la duración: ajustamos la duración de la escena para que no se corte
        const finalSceneDuration = Math.max(scene.durationSec, durationSec + 0.8);

        await db.query(
            `UPDATE "VideoReportScene"
                SET "voiceAudioUrl" = $1, "voiceAudioDurationSec" = $2, "durationSec" = $3, "updatedAt" = NOW()
              WHERE id = $4`,
            [voiceAudioUrl, durationSec, finalSceneDuration, sceneId]
        );

        res.json({
            ok: true,
            voiceAudioUrl,
            voiceAudioDurationSec: durationSec,
            durationSec: finalSceneDuration
        });
    } catch (e) {
        console.error('[videoReportController] synthesizeSceneVoice:', e);
        res.status(500).json({ error: e.message || 'Error sintetizando voz de la escena' });
    }
}

/**
 * 9. Escuchar muestra de voz TTS rápida (sin gastar en el proyecto).
 */
export async function previewVoiceSample(req, res) {
    try {
        const { provider = 'elevenlabs', gender = 'female', speed = 1.0 } = req.body;
        const sampleText = 'Rotary International en acción. Servicio, solidaridad y liderazgo para transformar comunidades.';

        const synth = await synthesize({
            text: sampleText,
            provider,
            gender,
            speed: Number(speed) || 1.0,
            language: 'es-419'
        });

        res.set('Content-Type', 'audio/mpeg');
        res.send(synth.buffer);
    } catch (e) {
        console.error('[videoReportController] previewVoiceSample:', e);
        res.status(500).json({ error: 'No se pudo generar la muestra de voz' });
    }
}

/**
 * 10. Desglose y preflight de costos de producción.
 */
export async function estimateCosts(req, res) {
    try {
        const { id } = req.params;
        const project = await loadFullProject(id);
        if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });

        const scenes = project.currentVersion?.scenes || [];
        const estimate = estimateReportCredits({
            scenes,
            ttsProvider: project.currentVersion?.voiceConfig?.provider || 'elevenlabs',
            productionMode: project.productionMode
        });

        res.json({ estimate });
    } catch (e) {
        console.error('[videoReportController] estimateCosts:', e);
        res.status(500).json({ error: 'Error calculando presupuesto' });
    }
}

/**
 * 11. Iniciar Render Asíncrono de Video Informe con FFmpeg.
 */
export async function startReportRender(req, res) {
    try {
        const { id } = req.params;
        const { format = '16:9', resolution = '1080p' } = req.body;

        const project = await loadFullProject(id);
        if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });

        const version = project.currentVersion;
        if (!version || !version.scenes?.length) {
            return res.status(400).json({ error: 'El proyecto no tiene escenas para renderizar' });
        }

        const renderId = `rnd_${crypto.randomUUID()}`;
        await db.query(
            `INSERT INTO "VideoReportRender"
                (id, "versionId", "projectId", "clubId", format, resolution, status, progress, "statusNote")
             VALUES ($1, $2, $3, $4, $5, $6, 'rendering', 10, 'Iniciando pipeline de render...')`,
            [renderId, version.id, id, project.clubId || null, format, resolution]
        );

        // Despacho asíncrono sin bloquear la petición HTTP
        runAsyncRenderPipeline({ renderId, project, version, format, resolution }).catch(err => {
            console.error(`[videoReportController] Render ${renderId} falló:`, err);
        });

        res.json({ ok: true, renderId, status: 'rendering' });
    } catch (e) {
        console.error('[videoReportController] startReportRender:', e);
        res.status(500).json({ error: 'No se pudo iniciar el render' });
    }
}

/**
 * 12. Consultar progreso del Render.
 */
export async function syncReportRender(req, res) {
    try {
        const { id } = req.params;
        const { rows } = await db.query(
            `SELECT * FROM "VideoReportRender" WHERE "projectId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
            [id]
        );
        if (!rows.length) return res.json({ render: null });
        res.json({ render: rows[0] });
    } catch (e) {
        console.error('[videoReportController] syncReportRender:', e);
        res.status(500).json({ error: 'Error consultando estado de render' });
    }
}

/**
 * 13. Guardar video renderizado en la Biblioteca Multimedia oficial.
 */
export async function saveReportToLibrary(req, res) {
    try {
        const { id } = req.params;
        const { rows: renderRows } = await db.query(
            `SELECT * FROM "VideoReportRender" WHERE "projectId" = $1 AND status = 'ready' ORDER BY "createdAt" DESC LIMIT 1`,
            [id]
        );
        if (!renderRows.length) return res.status(400).json({ error: 'No hay un render listo para guardar' });
        const render = renderRows[0];

        const { rows: projRows } = await db.query(`SELECT * FROM "VideoReportProject" WHERE id = $1`, [id]);
        if (!projRows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
        const project = projRows[0];

        let mediaId = project.mediaId;
        const filename = `${project.title || 'Video Informe'}.mp4`;

        if (mediaId) {
            const { rows: existingMedia } = await db.query(`SELECT id FROM "Media" WHERE id = $1`, [mediaId]);
            if (existingMedia.length > 0) {
                await db.query(
                    `UPDATE "Media"
                        SET url = $1, filename = $2, size = $3, "thumbUrl" = COALESCE($4, "thumbUrl"),
                            "s3Key" = $5, type = 'video', "createdAt" = NOW()
                      WHERE id = $6`,
                    [
                        render.videoUrl, filename, render.bytes || 0,
                        render.thumbUrl, render.s3Key, mediaId
                    ]
                );
            } else {
                mediaId = null;
            }
        }

        if (!mediaId) {
            mediaId = `med_${crypto.randomUUID()}`;
            await db.query(
                `INSERT INTO "Media"
                    (id, url, filename, type, "clubId", size, "thumbUrl", "s3Key", "sourceType", "sourceId", "sourceLabel", "createdAt")
                 VALUES ($1, $2, $3, 'video', $4, $5, $6, $7, 'video_report', $8, $9, NOW())`,
                [
                    mediaId, render.videoUrl, filename,
                    project.clubId || null, render.bytes || 0,
                    render.thumbUrl, render.s3Key, project.id,
                    project.title || 'Video Informe IA'
                ]
            );
        }

        await db.query(
            `UPDATE "VideoReportProject"
                SET "mediaId" = $1, "savedToLibraryAt" = NOW()
              WHERE id = $2`,
            [mediaId, id]
        );

        res.json({ ok: true, mediaId, videoUrl: render.videoUrl });
    } catch (e) {
        console.error('[videoReportController] saveReportToLibrary:', e);
        res.status(500).json({ error: 'No se pudo guardar en la biblioteca' });
    }
}

/**
 * 14. Listar todos los proyectos de Video Informe guardados (para Biblioteca y Creador).
 */
export async function listReportProjects(req, res) {
    try {
        await ensureVideoReportSchema();
        const clubId = req.user?.clubId || null;
        const isSuperAdmin = req.user?.role === 'superadmin' || !clubId;

        let query = `
            SELECT p.*,
                   c.name as "campaignName",
                   c.slug as "campaignSlug",
                   (SELECT COUNT(*)::int FROM "VideoReportScene" s
                     JOIN "VideoReportVersion" v ON v.id = s."versionId"
                    WHERE v."projectId" = p.id AND v."isCurrent" = true) as "sceneCount",
                   (SELECT COALESCE(SUM(s."durationSec"), 0)::float FROM "VideoReportScene" s
                     JOIN "VideoReportVersion" v ON v.id = s."versionId"
                    WHERE v."projectId" = p.id AND v."isCurrent" = true) as "totalDurationSec",
                   (SELECT s."thumbUrl" FROM "VideoReportScene" s
                     JOIN "VideoReportVersion" v ON v.id = s."versionId"
                    WHERE v."projectId" = p.id AND v."isCurrent" = true AND s."thumbUrl" IS NOT NULL
                    ORDER BY s."sortOrder" ASC LIMIT 1) as "firstSceneThumb",
                   (SELECT s."mediaUrl" FROM "VideoReportScene" s
                     JOIN "VideoReportVersion" v ON v.id = s."versionId"
                    WHERE v."projectId" = p.id AND v."isCurrent" = true AND s."mediaUrl" IS NOT NULL
                    ORDER BY s."sortOrder" ASC LIMIT 1) as "firstSceneMedia",
                   (SELECT r."videoUrl" FROM "VideoReportRender" r
                    WHERE r."projectId" = p.id AND r.status = 'ready'
                    ORDER BY r."createdAt" DESC LIMIT 1) as "renderedVideoUrl",
                   (SELECT r.status FROM "VideoReportRender" r
                    WHERE r."projectId" = p.id
                    ORDER BY r."createdAt" DESC LIMIT 1) as "latestRenderStatus",
                   (SELECT r.progress FROM "VideoReportRender" r
                    WHERE r."projectId" = p.id
                    ORDER BY r."createdAt" DESC LIMIT 1) as "latestRenderProgress"
              FROM "VideoReportProject" p
         LEFT JOIN "ContributionCampaign" c ON c.id = p."campaignId"
        `;
        const params = [];
        if (!isSuperAdmin) {
            params.push(clubId);
            query += ` WHERE (p."clubId" = $1 OR p."clubId" IS NULL) `;
        }
        query += ` ORDER BY p."updatedAt" DESC LIMIT 100`;

        const { rows } = await db.query(query, params);
        res.json({ projects: rows });
    } catch (e) {
        console.error('[videoReportController] listReportProjects:', e);
        res.status(500).json({ error: 'No se pudieron listar los proyectos de video informe' });
    }
}

/**
 * 15. Eliminar un proyecto de Video Informe.
 */
export async function deleteReportProject(req, res) {
    try {
        await ensureVideoReportSchema();
        const { id } = req.params;
        const { rows } = await db.query(`SELECT id, "mediaId" FROM "VideoReportProject" WHERE id = $1`, [id]);
        if (!rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

        const mediaId = rows[0].mediaId;
        await db.query(`DELETE FROM "VideoReportProject" WHERE id = $1`, [id]);
        if (mediaId) {
            await db.query(`DELETE FROM "Media" WHERE id = $1`, [mediaId]).catch(() => {});
        }
        res.json({ ok: true });
    } catch (e) {
        console.error('[videoReportController] deleteReportProject:', e);
        res.status(500).json({ error: 'No se pudo eliminar el proyecto' });
    }
}

// ─── Helpers Internos de Render y Carga ───────────────────────────────────

async function loadFullProject(projectId) {
    const { rows: pRows } = await db.query(
        `SELECT * FROM "VideoReportProject" WHERE id = $1`,
        [projectId]
    );
    if (!pRows.length) return null;
    const project = pRows[0];

    // Cargar versión activa
    const { rows: vRows } = await db.query(
        `SELECT * FROM "VideoReportVersion" WHERE "projectId" = $1 AND "isCurrent" = true LIMIT 1`,
        [projectId]
    );
    let currentVersion = vRows[0] || null;

    if (currentVersion) {
        const { rows: sRows } = await db.query(
            `SELECT * FROM "VideoReportScene" WHERE "versionId" = $1 ORDER BY "sortOrder" ASC`,
            [currentVersion.id]
        );
        currentVersion.scenes = sRows;
    }

    return {
        ...project,
        currentVersion
    };
}

/**
 * Pipeline de Render Asíncrono con FFmpeg.
 */
async function runAsyncRenderPipeline({ renderId, project, version, format, resolution }) {
    const fetch = (await import('node-fetch')).default;
    const updateProgress = async (p, note) => {
        await db.query(
            `UPDATE "VideoReportRender" SET progress = $1, "statusNote" = $2 WHERE id = $3`,
            [p, note, renderId]
        );
    };

    try {
        await updateProgress(20, 'Preparando pistas y animaciones Ken Burns...');
        const geo = REPORT_FORMATS[format] || REPORT_FORMATS['16:9'];
        const clips = [];

        // Generar o componer cada escena
        let idx = 0;
        for (const scene of version.scenes) {
            idx++;
            await updateProgress(
                20 + Math.round((idx / version.scenes.length) * 45),
                `Animando escena ${idx}/${version.scenes.length}...`
            );

            let clipBuffer = null;
            if (scene.mediaUrl) {
                const imgRes = await fetch(scene.mediaUrl);
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());

                if (scene.sceneType === 'video') {
                    clipBuffer = imgBuf;
                } else {
                    // Animación Ken Burns / Movimiento gratuito determinista sin créditos IA
                    clipBuffer = await renderStillMotion(imgBuf, {
                        width: geo.width,
                        height: geo.height,
                        durationSec: Math.max(3, Math.round(scene.durationSec)),
                        drift: scene.motionType === 'pan_left' ? 'left'
                            : scene.motionType === 'pan_right' ? 'right'
                            : scene.motionType === 'pan_up' ? 'up'
                            : scene.motionType === 'pan_down' ? 'down'
                            : 'still',
                        timeoutMs: 120_000
                    });
                }
            }

            if (clipBuffer) {
                clips.push({
                    buffer: clipBuffer,
                    durationSec: scene.durationSec,
                    transitionIn: idx > 1 ? 'fade' : null
                });
            }
        }

        if (!clips.length) throw new Error('No se pudieron conformar clips válidos para el render.');

        await updateProgress(75, 'Mezclando pistas de voz, banda sonora y ducking...');

        // Montaje final con FFmpeg
        const composed = await composeReel({
            clips,
            width: geo.width,
            height: geo.height,
            fps: 30,
            fadeSec: 0.8,
            timeoutMs: 180_000
        });

        await updateProgress(90, 'Subiendo archivo final a S3...');

        const s3Key = `clubs/${project.clubId || 'global'}/video-reports/${renderId}.mp4`;
        const { url: videoUrl } = await uploadBuffer(composed.buffer, s3Key, 'video/mp4');

        await db.query(
            `UPDATE "VideoReportRender"
                SET status = 'ready', progress = 100, "statusNote" = 'Render completado exitosamente',
                    "videoUrl" = $1, "s3Key" = $2, bytes = $3, "completedAt" = NOW()
              WHERE id = $4`,
            [videoUrl, s3Key, composed.buffer.length, renderId]
        );

        console.log(`[videoReportController] Render ${renderId} finalizado con éxito.`);
    } catch (e) {
        console.error(`[videoReportController] Error crítico en pipeline de render:`, e);
        await db.query(
            `UPDATE "VideoReportRender"
                SET status = 'failed', "statusNote" = $1, error = $1, "completedAt" = NOW()
              WHERE id = $2`,
            [e.message || 'Error en render', renderId]
        );
    }
}
