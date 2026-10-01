// ════════════════════════════════════════════════════════════════════════════
// Controlador del Editor de Video Profesional — v4.1141.0
//
// Gestión de proyectos, autoguardado, transcripción con timestamps,
// traducción multilingüe de subtítulos y despacho asíncrono de renderizado.
// ════════════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { ensureVideoEditorSchema } from '../lib/ensureVideoEditorSchema.js';
import { DEFAULT_TRACKS, DEFAULT_SUBTITLE_STYLE, resolveDimensions } from '../lib/videoEditorSpec.js';
import { transcribeMedia } from '../lib/videoEditorTranscription.js';
import { translateSubtitles } from '../lib/videoEditorTranslation.js';
import { renderProjectAsync } from '../lib/videoEditorRender.js';

/**
 * Resuelve el scope del tenant para aislamiento estricto multi-tenant.
 */
function resolveEditorScope(req) {
    const isGlobal = req.user.role === 'administrator';
    const askedClubId = req.query.clubId || req.body?.clubId || null;
    if (isGlobal) {
        return { isGlobal: true, clubId: askedClubId || req.user.clubId || null };
    }
    return { isGlobal: false, clubId: req.user.clubId || null };
}

/**
 * GET /api/video-editor/projects — Lista proyectos del tenant.
 */
export async function listProjects(req, res) {
    try {
        await ensureVideoEditorSchema();
        const scope = resolveEditorScope(req);

        let query = `SELECT id, title, "clubId", "userId", format, resolution, duration,
                            status, "renderStatus", "renderProgress", "renderStage",
                            "videoUrl", "thumbUrl", "createdAt", "updatedAt"
                       FROM "VideoEditorProject"`;
        const params = [];

        if (!scope.isGlobal) {
            query += ` WHERE "clubId" IS NOT DISTINCT FROM $1`;
            params.push(scope.clubId);
        } else if (scope.clubId) {
            query += ` WHERE "clubId" = $1`;
            params.push(scope.clubId);
        }

        query += ` ORDER BY "updatedAt" DESC LIMIT 50`;

        const { rows } = await db.query(query, params);
        res.json({ success: true, ok: true, data: rows, projects: rows });
    } catch (err) {
        console.error('[VideoEditorController] listProjects error:', err);
        res.status(500).json({ error: 'Error al listar los proyectos de video' });
    }
}

/**
 * GET /api/video-editor/projects/:id — Carga un proyecto completo.
 */
export async function getProject(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const scope = resolveEditorScope(req);

        const { rows } = await db.query(
            `SELECT * FROM "VideoEditorProject" WHERE id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        const project = rows[0];

        // Blindaje multi-tenant
        if (!scope.isGlobal && project.clubId && project.clubId !== scope.clubId) {
            return res.status(403).json({ error: 'No tienes permisos para acceder a este proyecto' });
        }

        res.json({ success: true, ok: true, data: project, project });
    } catch (err) {
        console.error('[VideoEditorController] getProject error:', err);
        res.status(500).json({ error: 'Error al obtener el proyecto' });
    }
}

/**
 * POST /api/video-editor/projects — Crea un nuevo proyecto.
 */
export async function createProject(req, res) {
    try {
        await ensureVideoEditorSchema();
        const scope = resolveEditorScope(req);
        const { title, format, resolution, tracks, clips, subtitles, config } = req.body || {};

        const id = `vep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const projectTitle = (title || '').trim() || `Video ${new Date().toLocaleDateString('es-CO')}`;
        const projectFormat = format || '16:9';
        const projectResolution = resolution || '1080p';
        const projectTracks = Array.isArray(tracks) && tracks.length > 0 ? tracks : DEFAULT_TRACKS;
        const projectClips = Array.isArray(clips) ? clips : [];
        const projectSubtitles = subtitles || { segments: [], style: DEFAULT_SUBTITLE_STYLE };

        const { rows } = await db.query(
            `INSERT INTO "VideoEditorProject" (
                id, title, "clubId", "userId", "userEmail", format, resolution,
                tracks, clips, subtitles, config, status, "renderStatus", "renderProgress", "createdAt", "updatedAt"
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', 'idle', 0, NOW(), NOW()
            ) RETURNING *`,
            [
                id,
                projectTitle,
                scope.clubId,
                req.user.id || null,
                req.user.email || null,
                projectFormat,
                projectResolution,
                JSON.stringify(projectTracks),
                JSON.stringify(projectClips),
                JSON.stringify(projectSubtitles),
                JSON.stringify(config || {})
            ]
        );

        res.status(201).json({ success: true, ok: true, data: rows[0], project: rows[0] });
    } catch (err) {
        console.error('[VideoEditorController] createProject error:', err);
        res.status(500).json({ error: 'Error al crear el proyecto' });
    }
}

/**
 * PUT /api/video-editor/projects/:id — Guarda/autoguarda cambios en el proyecto.
 */
export async function updateProject(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const scope = resolveEditorScope(req);

        // Verificar existencia y pertenencia
        const check = await db.query(
            `SELECT id, "clubId", "renderStatus" FROM "VideoEditorProject" WHERE id = $1`,
            [id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        if (!scope.isGlobal && check.rows[0].clubId && check.rows[0].clubId !== scope.clubId) {
            return res.status(403).json({ error: 'No tienes permisos para modificar este proyecto' });
        }

        const {
            title, format, resolution, tracks, clips, subtitles,
            transcript, transitions, config, status
        } = req.body || {};

        const fields = [];
        const params = [];
        let p = 1;

        if (title !== undefined) {
            fields.push(`title = $${p++}`);
            params.push(title.trim());
        }
        if (format !== undefined) {
            fields.push(`format = $${p++}`);
            params.push(format);
        }
        if (resolution !== undefined) {
            fields.push(`resolution = $${p++}`);
            params.push(resolution);
        }
        if (tracks !== undefined) {
            fields.push(`tracks = $${p++}`);
            params.push(JSON.stringify(tracks));
        }
        if (clips !== undefined) {
            fields.push(`clips = $${p++}`);
            params.push(JSON.stringify(clips));
        }
        if (subtitles !== undefined) {
            fields.push(`subtitles = $${p++}`);
            params.push(JSON.stringify(subtitles));
        }
        if (transcript !== undefined) {
            fields.push(`transcript = $${p++}`);
            params.push(JSON.stringify(transcript));
        }
        if (transitions !== undefined) {
            fields.push(`transitions = $${p++}`);
            params.push(JSON.stringify(transitions));
        }
        if (config !== undefined) {
            fields.push(`config = $${p++}`);
            params.push(JSON.stringify(config));
        }
        if (status !== undefined) {
            fields.push(`status = $${p++}`);
            params.push(status);
        }

        fields.push(`"updatedAt" = NOW()`);
        params.push(id);

        const updateSql = `UPDATE "VideoEditorProject" SET ${fields.join(', ')} WHERE id = $${p} RETURNING *`;
        const { rows } = await db.query(updateSql, params);

        res.json({ success: true, ok: true, data: rows[0], project: rows[0] });
    } catch (err) {
        console.error('[VideoEditorController] updateProject error:', err);
        res.status(500).json({ error: 'Error al guardar el proyecto' });
    }
}

/**
 * POST /api/video-editor/projects/:id/duplicate — Duplica un proyecto existente.
 */
export async function duplicateProject(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const scope = resolveEditorScope(req);

        const { rows: source } = await db.query(
            `SELECT * FROM "VideoEditorProject" WHERE id = $1`,
            [id]
        );

        if (source.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        const orig = source[0];
        if (!scope.isGlobal && orig.clubId && orig.clubId !== scope.clubId) {
            return res.status(403).json({ error: 'No tienes permisos para duplicar este proyecto' });
        }

        const newId = `vep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newTitle = `${orig.title} (Copia)`;

        const { rows } = await db.query(
            `INSERT INTO "VideoEditorProject" (
                id, title, "clubId", "userId", "userEmail", format, resolution,
                tracks, clips, subtitles, transcript, transitions, config, status, "renderStatus", "renderProgress", "createdAt", "updatedAt"
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', 'idle', 0, NOW(), NOW()
            ) RETURNING *`,
            [
                newId,
                newTitle,
                scope.clubId,
                req.user.id || null,
                req.user.email || null,
                orig.format,
                orig.resolution,
                JSON.stringify(orig.tracks || []),
                JSON.stringify(orig.clips || []),
                JSON.stringify(orig.subtitles || {}),
                JSON.stringify(orig.transcript || {}),
                JSON.stringify(orig.transitions || []),
                JSON.stringify(orig.config || {})
            ]
        );

        res.status(201).json({ success: true, ok: true, data: rows[0], project: rows[0] });
    } catch (err) {
        console.error('[VideoEditorController] duplicateProject error:', err);
        res.status(500).json({ error: 'Error al duplicar el proyecto' });
    }
}

/**
 * DELETE /api/video-editor/projects/:id — Elimina un proyecto.
 */
export async function deleteProject(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const scope = resolveEditorScope(req);

        const check = await db.query(
            `SELECT id, "clubId" FROM "VideoEditorProject" WHERE id = $1`,
            [id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        if (!scope.isGlobal && check.rows[0].clubId && check.rows[0].clubId !== scope.clubId) {
            return res.status(403).json({ error: 'No tienes permisos para eliminar este proyecto' });
        }

        await db.query(`DELETE FROM "VideoEditorProject" WHERE id = $1`, [id]);
        res.json({ success: true, ok: true, message: 'Proyecto eliminado exitosamente' });
    } catch (err) {
        console.error('[VideoEditorController] deleteProject error:', err);
        res.status(500).json({ error: 'Error al eliminar el proyecto' });
    }
}

/**
 * POST /api/video-editor/projects/:id/transcribe — Genera subtítulos automáticos con IA.
 */
export async function transcribeProjectAudio(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const { mediaUrl } = req.body || {};

        if (!mediaUrl) {
            return res.status(400).json({ error: 'Se requiere la URL del recurso de audio o video para transcribir' });
        }

        // Ejecutar transcripción con Whisper / Gemini
        const result = await transcribeMedia(mediaUrl);

        // Actualizar proyecto con los subtítulos y transcripción generados
        await db.query(
            `UPDATE "VideoEditorProject"
                SET subtitles = jsonb_set(
                    COALESCE(subtitles, '{}'::jsonb),
                    '{segments}',
                    $1::jsonb
                ),
                transcript = $2::jsonb,
                "updatedAt" = NOW()
              WHERE id = $3`,
            [
                JSON.stringify(result.segments),
                JSON.stringify({ text: result.transcript, language: result.language, provider: result.provider }),
                id
            ]
        );

        res.json({
            ok: true,
            transcript: result.transcript,
            language: result.language,
            segments: result.segments,
            provider: result.provider
        });
    } catch (err) {
        console.error('[VideoEditorController] transcribeProjectAudio error:', err);
        res.status(500).json({ error: `Error generando subtítulos con IA: ${err.message}` });
    }
}

/**
 * POST /api/video-editor/projects/:id/translate-subtitles — Traduce los subtítulos manteniendo sincronización.
 */
export async function translateProjectSubtitles(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const { targetLang, segments } = req.body || {};

        if (!targetLang || !Array.isArray(segments) || segments.length === 0) {
            return res.status(400).json({ error: 'targetLang y array de segments son obligatorios' });
        }

        const result = await translateSubtitles(segments, targetLang);

        res.json({
            ok: true,
            targetLang: result.targetLang,
            provider: result.provider,
            segments: result.segments,
            count: result.count
        });
    } catch (err) {
        console.error('[VideoEditorController] translateProjectSubtitles error:', err);
        res.status(500).json({ error: `Error traduciendo subtítulos: ${err.message}` });
    }
}

/**
 * POST /api/video-editor/projects/:id/render — Inicia el renderizado asíncrono.
 */
export async function startRender(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const { resolution, format } = req.body || {};

        const { rows } = await db.query(
            `SELECT * FROM "VideoEditorProject" WHERE id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        const project = rows[0];

        // Actualizar parámetros si fueron provistos
        if (resolution || format) {
            await db.query(
                `UPDATE "VideoEditorProject"
                    SET resolution = COALESCE($1, resolution),
                        format = COALESCE($2, format),
                        "updatedAt" = NOW()
                  WHERE id = $3`,
                [resolution || null, format || null, id]
            );
        }

        // Iniciar renderizado en segundo plano (asíncrono)
        renderProjectAsync(id).catch(err => {
            console.error(`[VideoEditorController] Error no capturado en renderProjectAsync(${id}):`, err);
        });

        res.json({
            ok: true,
            status: 'rendering',
            renderStage: 'Preparando proyecto',
            renderProgress: 10
        });
    } catch (err) {
        console.error('[VideoEditorController] startRender error:', err);
        res.status(500).json({ error: 'Error al iniciar el renderizado' });
    }
}

/**
 * GET /api/video-editor/projects/:id/render-status — Consulta el estado actual del render.
 */
export async function getRenderStatus(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;

        const { rows } = await db.query(
            `SELECT id, status, "renderStatus", "renderProgress", "renderStage",
                    "errorDetail", "videoUrl", "thumbUrl", duration, width, height
               FROM "VideoEditorProject"
              WHERE id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        res.json({ success: true, ok: true, data: rows[0], ...rows[0] });
    } catch (err) {
        console.error('[VideoEditorController] getRenderStatus error:', err);
        res.status(500).json({ error: 'Error al consultar estado de render' });
    }
}
