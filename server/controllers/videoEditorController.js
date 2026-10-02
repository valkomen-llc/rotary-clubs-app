// ════════════════════════════════════════════════════════════════════════════
// Controlador del Editor de Video Profesional — v4.1148.0
//
// Gestión de proyectos, autoguardado, transcripción con timestamps,
// traducción multilingüe de subtítulos y despacho asíncrono de renderizado.
// ════════════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { ensureVideoEditorSchema } from '../lib/ensureVideoEditorSchema.js';
import { DEFAULT_TRACKS, DEFAULT_SUBTITLE_STYLE, resolveDimensions } from '../lib/videoEditorSpec.js';
import { transcribeMedia, SubtitleError } from '../lib/videoEditorTranscription.js';
import { translateSubtitles, TranslationError, getLanguageMeta } from '../lib/videoEditorTranslation.js';
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
        const { title, format, resolution, duration, tracks, clips, subtitles, config } = req.body || {};

        const id = `vep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const projectTitle = (title || '').trim() || `Video ${new Date().toLocaleDateString('es-CO')}`;
        const projectFormat = format || '16:9';
        const projectResolution = resolution || '1080p';
        const projectDuration = Math.max(0, Number(duration) || 0);
        const projectTracks = Array.isArray(tracks) && tracks.length > 0 ? tracks : DEFAULT_TRACKS;
        const projectClips = Array.isArray(clips) ? clips : [];
        const projectSubtitles = subtitles || { segments: [], style: DEFAULT_SUBTITLE_STYLE };

        const { rows } = await db.query(
            `INSERT INTO "VideoEditorProject" (
                id, title, "clubId", "userId", "userEmail", format, resolution, duration,
                tracks, clips, subtitles, config, status, "renderStatus", "renderProgress", "createdAt", "updatedAt"
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', 'idle', 0, NOW(), NOW()
            ) RETURNING *`,
            [
                id,
                projectTitle,
                scope.clubId,
                req.user.id || null,
                req.user.email || null,
                projectFormat,
                projectResolution,
                projectDuration,
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
            title, format, resolution, duration, tracks, clips, subtitles,
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
        if (duration !== undefined) {
            fields.push(`duration = $${p++}`);
            params.push(Math.max(0, Number(duration) || 0));
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
 * POST /api/video-editor/projects/:id/subtitles — Alias para generación de subtítulos.
 */
export async function transcribeProjectAudio(req, res) {
    const { id } = req.params;
    let { mediaUrl, clipStartTime, clipId, language } = req.body || {};

    try {
        await ensureVideoEditorSchema();

        // Si no se proporcionó mediaUrl en el body, intentar deducirlo del clip seleccionado o del proyecto en DB
        if (!mediaUrl) {
            const prjRes = await db.query(`SELECT clips FROM "VideoEditorProject" WHERE id = $1`, [id]);
            const clips = prjRes.rows[0]?.clips || [];
            let targetClip = null;
            if (clipId) {
                targetClip = clips.find(c => c.id === clipId && c.url);
            }
            if (!targetClip) {
                targetClip = clips.find(c => (c.type === 'video' || c.type === 'audio') && c.url);
            }
            if (targetClip) {
                mediaUrl = targetClip.url;
                if (clipStartTime === undefined) clipStartTime = targetClip.startTime || 0;
            }
        }

        if (!mediaUrl) {
            return res.status(400).json({
                ok: false,
                errorCode: 'SUBTITLE_SOURCE_NOT_FOUND',
                error: 'Se requiere la URL o identificador del recurso de audio/video para transcribir'
            });
        }

        console.log(`[VideoEditorController] Iniciando transcripción para proyecto ${id}, clipStartTime: ${clipStartTime || 0}, mediaUrl: ${String(mediaUrl).slice(0, 80)}...`);

        // Ejecutar transcripción con Whisper / Gemini
        const result = await transcribeMedia(mediaUrl, {
            clipStartTime: Number(clipStartTime) || 0,
            language: language || 'es',
            clipId
        });

        // Actualizar proyecto con los subtítulos y transcripción generados
        const detectedLang = result.language || 'es';
        const langMeta = getLanguageMeta(detectedLang);

        const prjPrev = await db.query(`SELECT clips, subtitles, duration FROM "VideoEditorProject" WHERE id = $1`, [id]);
        const currentSubtitles = prjPrev.rows[0]?.subtitles || {};
        const currentClips = prjPrev.rows[0]?.clips || [];
        let maxEnd = Number(prjPrev.rows[0]?.duration) || 0;
        if (Array.isArray(currentClips)) {
            for (const c of currentClips) {
                maxEnd = Math.max(maxEnd, (Number(c.startTime) || 0) + (Number(c.duration) || 0));
            }
        }
        if (Array.isArray(result.segments)) {
            for (const s of result.segments) {
                maxEnd = Math.max(maxEnd, Number(s.end) || 0);
            }
        }
        const updatedDuration = Math.max(10, Number(maxEnd.toFixed(2)));

        const initialTranslations = {
            ...(currentSubtitles.translations || {}),
            [detectedLang]: {
                language: detectedLang,
                languageName: langMeta.name,
                isOriginal: true,
                segments: result.segments,
                createdAt: new Date().toISOString()
            }
        };

        const updatedSubtitles = {
            ...currentSubtitles,
            sourceLanguage: detectedLang,
            sourceLanguageName: langMeta.name,
            activeLanguage: detectedLang,
            language: detectedLang,
            segments: result.segments,
            translations: initialTranslations
        };

        try {
            await db.query(
                `UPDATE "VideoEditorProject"
                    SET subtitles = $1::jsonb,
                        transcript = $2::jsonb,
                        duration = $3,
                        "updatedAt" = NOW()
                  WHERE id = $4`,
                [
                    JSON.stringify(updatedSubtitles),
                    JSON.stringify({ text: result.transcript, language: result.language, provider: result.provider }),
                    updatedDuration,
                    id
                ]
            );
        } catch (persistErr) {
            console.error('[VideoEditorController] SUBTITLE_PERSISTENCE_FAILED:', persistErr);
            throw new SubtitleError('SUBTITLE_PERSISTENCE_FAILED', 'No se pudieron guardar los subtítulos en la base de datos', persistErr.message);
        }

        console.log(`[VideoEditorController] Transcripción exitosa para proyecto ${id}: ${result.segments.length} segmentos (${detectedLang}) con proveedor ${result.provider}, nueva duración: ${updatedDuration}s`);

        res.json({
            ok: true,
            subtitles: updatedSubtitles,
            duration: updatedDuration,
            transcript: result.transcript,
            language: result.language,
            segments: result.segments,
            provider: result.provider
        });
    } catch (err) {
        const code = err.code || 'TRANSCRIPTION_PROVIDER_ERROR';
        console.error(`[VideoEditorController] transcribeProjectAudio [${code}]:`, err.message);

        const statusMap = {
            'SUBTITLE_SOURCE_NOT_FOUND': 404,
            'MISSING_AI_CREDENTIALS': 503,
            'FILE_TOO_LARGE': 413,
            'UNSUPPORTED_MEDIA': 415,
            'TRANSCRIPTION_TIMEOUT': 504
        };
        const statusCode = statusMap[code] || 500;

        res.status(statusCode).json({
            ok: false,
            errorCode: code,
            error: err.message || 'Error al generar subtítulos con IA',
            details: err.details || null
        });
    }
}

/**
 * POST /api/video-editor/projects/:id/translate-subtitles — Traduce los subtítulos manteniendo sincronización.
 * POST /api/video-editor/projects/:id/subtitles/translate — Alias para traducción de subtítulos.
 */
export async function translateProjectSubtitles(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const targetLang = req.body?.targetLang || req.body?.targetLanguage;
        let sourceLang = req.body?.sourceLang || req.body?.sourceLanguage;
        let segments = req.body?.segments;

        if (!targetLang) {
            return res.status(400).json({
                ok: false,
                errorCode: 'INVALID_TARGET_LANGUAGE',
                error: 'Se requiere el parámetro targetLang (código de idioma destino)'
            });
        }

        // Obtener subtítulos actuales del proyecto
        const prjRes = await db.query(
            `SELECT id, subtitles, title FROM "VideoEditorProject" WHERE id = $1`,
            [id]
        );
        if (prjRes.rows.length === 0) {
            return res.status(404).json({
                ok: false,
                errorCode: 'SUBTITLE_TRACK_NOT_FOUND',
                error: 'Proyecto no encontrado'
            });
        }

        const project = prjRes.rows[0];
        const currentSubtitles = project.subtitles || {};

        if (!sourceLang) {
            sourceLang = currentSubtitles.sourceLanguage || currentSubtitles.language || 'es';
        }

        const sourceMeta = getLanguageMeta(sourceLang);
        const targetMeta = getLanguageMeta(targetLang);

        if (sourceMeta.code === targetMeta.code) {
            return res.status(400).json({
                ok: false,
                errorCode: 'INVALID_TARGET_LANGUAGE',
                error: `El idioma destino (${targetMeta.name}) es idéntico al idioma de origen.`
            });
        }

        // Si no se enviaron segmentos, recuperarlos del idioma de origen o de los vigentes
        if (!Array.isArray(segments) || segments.length === 0) {
            if (currentSubtitles.translations?.[sourceMeta.code]?.segments?.length > 0) {
                segments = currentSubtitles.translations[sourceMeta.code].segments;
            } else if (Array.isArray(currentSubtitles.segments) && currentSubtitles.segments.length > 0) {
                segments = currentSubtitles.segments;
            }
        }

        if (!Array.isArray(segments) || segments.length === 0) {
            return res.status(400).json({
                ok: false,
                errorCode: 'EMPTY_SUBTITLE_SEGMENTS',
                error: 'No se encontraron segmentos de subtítulos para traducir'
            });
        }

        const existingTranslations = currentSubtitles.translations || {};
        const cachedTargetKey = Object.keys(existingTranslations).find(k => getLanguageMeta(k).code === targetMeta.code);

        const forceTranslate = Boolean(req.body.force);
        const cachedRaw = cachedTargetKey ? existingTranslations[cachedTargetKey]?.segments : null;

        // Validar si el caché es realmente utilizable y no corrupto/idéntico al origen
        const isCacheValid = !forceTranslate &&
            Array.isArray(cachedRaw) &&
            cachedRaw.length === segments.length &&
            cachedRaw.some(cs => typeof cs.text === 'string' && cs.text.trim().length > 0) &&
            // Si el idioma destino es distinto del origen, no debe ser 100% idéntico al texto de origen
            (targetMeta.code === sourceMeta.code || cachedRaw.some((cs, idx) => {
                const orig = segments.find(s => s.id === cs.id) || segments[idx] || {};
                return cs.text && orig.text && cs.text.trim().toLowerCase() !== orig.text.trim().toLowerCase();
            }));

        // Si ya existe una traducción generada para este idioma destino y es válida, usarla sin llamar a la IA
        if (isCacheValid) {
            console.log(`[VideoEditorController] Activando traducción en caché para ${targetMeta.code} en proyecto ${id}`);
            // Mapa de estilos vigentes por id (el estilo vive con el segmento visible,
            // no con el idioma: activar un caché jamás debe revertir lo visual).
            const liveStyleById = new Map((segments || []).map(s => [s.id, s.style]));
            const cachedSegments = cachedRaw.map((cs, idx) => {
                const orig = segments.find(s => s.id === cs.id) || segments[idx] || {};
                const origMap = orig.translations || {};
                return {
                    ...cs,
                    // Conservar el estilo vigente (segmento actual) sobre el snapshot del caché.
                    style: orig.style ?? liveStyleById.get(cs.id) ?? cs.style,
                    translations: {
                        ...origMap,
                        ...(cs.translations || {}),
                        [sourceMeta.code]: origMap[sourceMeta.code] || orig.text || cs.translations?.[sourceMeta.code] || '',
                        [targetMeta.code]: cs.text
                    }
                };
            });

            const availableLangs = Array.from(new Set([
                sourceMeta.code,
                targetMeta.code,
                ...Object.keys(existingTranslations).map(k => getLanguageMeta(k).code),
                ...(currentSubtitles.availableLanguages ? currentSubtitles.availableLanguages.map(k => getLanguageMeta(k).code) : [])
            ]));

            const updatedSubtitles = {
                ...currentSubtitles,
                sourceLanguage: sourceMeta.code,
                sourceLanguageName: currentSubtitles.sourceLanguageName || sourceMeta.name,
                activeLanguage: targetMeta.code,
                language: targetMeta.code,
                availableLanguages: availableLangs,
                segments: cachedSegments,
                translations: {
                    ...existingTranslations,
                    [sourceMeta.code]: existingTranslations[sourceMeta.code] || {
                        language: sourceMeta.code,
                        languageName: sourceMeta.name,
                        isOriginal: true,
                        segments: segments
                    },
                    [targetMeta.code]: {
                        ...existingTranslations[cachedTargetKey],
                        language: targetMeta.code,
                        languageName: targetMeta.name,
                        segments: cachedSegments
                    }
                }
            };

            await db.query(
                `UPDATE "VideoEditorProject"
                    SET subtitles = $1::jsonb,
                        "updatedAt" = NOW()
                  WHERE id = $2`,
                [JSON.stringify(updatedSubtitles), id]
            );

            return res.json({
                ok: true,
                cached: true,
                sourceLang: sourceMeta.code,
                sourceLanguageName: sourceMeta.name,
                targetLang: targetMeta.code,
                targetLanguageName: targetMeta.name,
                activeLanguage: targetMeta.code,
                segments: cachedSegments,
                subtitles: updatedSubtitles,
                provider: existingTranslations[cachedTargetKey]?.provider || 'cache',
                count: cachedSegments.length
            });
        }

        console.log(`[VideoEditorController] Traduciendo subtítulos para proyecto ${id}: ${sourceMeta.name} → ${targetMeta.name} (${segments.length} segmentos)`);

        // Ejecutar traducción contextual con IA
        const result = await translateSubtitles(segments, targetMeta.code, { sourceLang: sourceMeta.code });

        const translatedSegmentsWithMap = result.segments.map((ts, idx) => {
            const orig = segments.find(s => s.id === ts.id) || segments[idx] || {};
            const origMap = orig.translations || {};
            return {
                ...ts,
                translations: {
                    ...origMap,
                    [sourceMeta.code]: origMap[sourceMeta.code] || orig.text || '',
                    [targetMeta.code]: ts.text
                }
            };
        });

        const availableLangs = Array.from(new Set([
            sourceMeta.code,
            targetMeta.code,
            ...Object.keys(existingTranslations).map(k => getLanguageMeta(k).code),
            ...(currentSubtitles.availableLanguages ? currentSubtitles.availableLanguages.map(k => getLanguageMeta(k).code) : [])
        ]));

        const updatedTranslations = {
            ...existingTranslations,
            [sourceMeta.code]: existingTranslations[sourceMeta.code] || {
                language: sourceMeta.code,
                languageName: result.sourceLanguageName || sourceMeta.name,
                isOriginal: true,
                segments: segments.map((s, idx) => ({
                    ...s,
                    translations: {
                        ...(s.translations || {}),
                        [sourceMeta.code]: s.translations?.[sourceMeta.code] || s.text || '',
                        [targetMeta.code]: translatedSegmentsWithMap[idx]?.text || ''
                    }
                })),
                createdAt: new Date().toISOString()
            },
            [targetMeta.code]: {
                language: targetMeta.code,
                languageName: result.targetLanguageName || targetMeta.name,
                isOriginal: false,
                segments: translatedSegmentsWithMap,
                provider: result.provider,
                createdAt: new Date().toISOString()
            }
        };

        const updatedSubtitles = {
            ...currentSubtitles,
            sourceLanguage: sourceMeta.code,
            sourceLanguageName: result.sourceLanguageName || sourceMeta.name,
            activeLanguage: targetMeta.code,
            language: targetMeta.code,
            availableLanguages: availableLangs,
            segments: translatedSegmentsWithMap,
            translations: updatedTranslations
        };

        try {
            await db.query(
                `UPDATE "VideoEditorProject"
                    SET subtitles = $1::jsonb,
                        "updatedAt" = NOW()
                  WHERE id = $2`,
                [JSON.stringify(updatedSubtitles), id]
            );
        } catch (persistErr) {
            console.error('[VideoEditorController] TRANSLATION_PERSISTENCE_FAILED:', persistErr);
            throw new TranslationError('TRANSLATION_PERSISTENCE_FAILED', 'No se pudieron persistir los subtítulos traducidos', persistErr.message);
        }

        console.log(`[VideoEditorController] Traducción exitosa para proyecto ${id}: ${result.count} segmentos a ${targetMeta.code} con ${result.provider}`);

        res.json({
            ok: true,
            sourceLang: sourceMeta.code,
            sourceLanguageName: result.sourceLanguageName,
            targetLang: result.targetLang,
            targetLanguageName: result.targetLanguageName,
            activeLanguage: targetMeta.code,
            provider: result.provider,
            // Devolver los segmentos mapeados (con translations + estilo preservado),
            // consistentes con la ruta de caché: el frontend no debe reconstruirlos.
            segments: translatedSegmentsWithMap,
            subtitles: updatedSubtitles,
            count: result.count
        });
    } catch (err) {
        const code = err.code || 'TRANSLATION_PROVIDER_ERROR';
        console.error(`[VideoEditorController] translateProjectSubtitles [${code}]:`, err.message);

        const statusMap = {
            'INVALID_SOURCE_LANGUAGE': 400,
            'INVALID_TARGET_LANGUAGE': 400,
            'EMPTY_SUBTITLE_SEGMENTS': 400,
            'SUBTITLE_TRACK_NOT_FOUND': 404,
            'MISSING_AI_CREDENTIALS': 503,
            'TRANSLATION_TIMEOUT': 504
        };
        const statusCode = statusMap[code] || 500;

        res.status(statusCode).json({
            ok: false,
            errorCode: code,
            error: err.message || 'Error al traducir subtítulos con IA',
            details: err.details || null
        });
    }
}

/**
 * POST /api/video-editor/projects/:id/render — Inicia el renderizado asíncrono.
 */
export async function startRender(req, res) {
    try {
        await ensureVideoEditorSchema();
        const { id } = req.params;
        const { resolution, format, subtitles, clips, tracks } = req.body || {};

        const { rows } = await db.query(
            `SELECT * FROM "VideoEditorProject" WHERE id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Actualizar parámetros y estado en memoria del editor si fueron provistos
        const updateFields = [];
        const updateParams = [];
        let p = 1;

        if (resolution !== undefined) {
            updateFields.push(`resolution = $${p++}`);
            updateParams.push(resolution);
        }
        if (format !== undefined) {
            updateFields.push(`format = $${p++}`);
            updateParams.push(format);
        }
        if (subtitles !== undefined) {
            updateFields.push(`subtitles = $${p++}::jsonb`);
            updateParams.push(JSON.stringify(subtitles));
        }
        if (clips !== undefined) {
            updateFields.push(`clips = $${p++}::jsonb`);
            updateParams.push(JSON.stringify(clips));
        }
        if (tracks !== undefined) {
            updateFields.push(`tracks = $${p++}::jsonb`);
            updateParams.push(JSON.stringify(tracks));
        }

        // Marcar estado inicial del render
        updateFields.push(`"renderStatus" = 'rendering'`);
        updateFields.push(`"renderStage" = 'Preparando archivos'`);
        updateFields.push(`"renderProgress" = 5`);
        updateFields.push(`status = 'rendering'`);
        updateFields.push(`"errorDetail" = NULL`);
        updateFields.push(`"updatedAt" = NOW()`);

        updateParams.push(id);
        const updateSql = `UPDATE "VideoEditorProject" SET ${updateFields.join(', ')} WHERE id = $${p} RETURNING *`;
        await db.query(updateSql, updateParams);

        // Iniciar renderizado en segundo plano (asíncrono)
        renderProjectAsync(id).catch(err => {
            console.error(`[VideoEditorController] Error no capturado en renderProjectAsync(${id}):`, err);
        });

        res.json({
            ok: true,
            status: 'rendering',
            renderStage: 'Preparando archivos',
            renderProgress: 5
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
