/**
 * Video Listo para Publicar — Controlador y Pipeline Multimedia
 * =============================================================
 *
 * Módulo para preparar videos previamente grabados/editados para su publicación
 * institucional en redes sociales (Rotary Distrito 4281):
 *
 * 1. Normalización técnica automática (FFmpeg: transcodificación a MP4 H.264/AAC,
 *    conservando el original en S3 si proviene de AVI, MOV, WebM, etc.).
 * 2. Análisis multimodal con IA (fotogramas, transcripción/detección de voz con
 *    Whisper/Gemini, análisis de música y contenido visual).
 * 3. Cierre institucional (outro) con transiciones suaves (fade, dissolve, cut).
 * 4. Música de fondo opcional con ducking inteligente para no tapar los diálogos.
 * 5. Generación de copy institucional con IA conforme a la Regla 10 del Distrito 4281
 *    (sin muletillas repetitivas, enfocado en impacto y servicio).
 * 6. Publicación social directa en cuentas conectadas (Facebook Pages e Instagram).
 */

import path from 'path';
import { writeFile, readFile, stat } from 'fs/promises';
import db from '../lib/db.js';
import prisma from '../lib/prisma.js';
import { runFfmpeg, withTempDir, isFfmpegAvailable } from '../lib/reelFfmpeg.js';
import { probeMp4 } from '../lib/outroQuality.js';
import { planLibraryOutro, buildLibraryOutroGraph, buildLibraryOutroArgs, validateComposedOutro } from '../lib/libraryOutro.js';
import { generateCopy, DEFAULT_COPY_PROVIDER } from '../services/copywritingService.js';
import { publishContentToTarget } from '../services/socialPublishService.js';
import { decryptToken } from '../lib/tokenCrypto.js';
import { INSTITUTIONAL_VOICE } from '../lib/institutionalVoice.js';
import { resolveBrainsForClub } from '../services/brainService.js';
import { cleanVideoReadyCopy, buildAudioDuckingFiltergraph } from '../lib/videoReadySpec.js';

import { loadOutroProject } from '../lib/outroAssets.js';
import { startSoundtrack, pollSoundtrack } from '../lib/reelMusic.js';
import { ensureReelSchema } from '../lib/ensureReelSchema.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FETCH_TIMEOUT_MS = 90_000;
const FFMPEG_TIMEOUT_MS = 240_000;

const pickAudioFromLibrary = async (style, clubId) => {
    try {
        const { rows } = await db.query(
            `SELECT id, url, filename FROM "Media"
             WHERE type = 'audio'
               AND (lower(filename) LIKE $1 OR lower(filename) LIKE '%musica%' OR lower(filename) LIKE '%audio%')
               AND ("clubId" = $2 OR "clubId" IS NULL)
             ORDER BY (lower(filename) LIKE $1) DESC, "createdAt" DESC
             LIMIT 1`,
            [`%${style}%`, clubId || null]
        );
        return rows[0] || null;
    } catch {
        return null;
    }
};

const mediaDeps = async () => {
    const mod = await import('../routes/media.js');
    return { deps: await mod.getUploadDeps(), publicUrlFor: mod.publicUrlFor };
};

const s3ToFile = async (bucket, key, dest) => {
    const { deps } = await mediaDeps();
    const obj = await deps.s3.send(new deps.GetObjectCommand({ Bucket: bucket, Key: key }));
    const { createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');
    await pipeline(obj.Body, createWriteStream(dest));
};

const urlToFile = async (url, dest) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`No se pudo descargar el archivo (${url}): HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buffer);
    return buffer;
};

// ─── 1. NORMALIZACIÓN TÉCNICA ───────────────────────────────────────────────

export const normalizeVideoReady = async (req, res) => {
    try {
        const { mediaId, fileUrl, filename } = req.body || {};
        if (!mediaId && !fileUrl) {
            return res.status(400).json({ error: 'Se requiere mediaId o fileUrl' });
        }

        if (!(await isFfmpegAvailable())) {
            return res.status(503).json({ error: 'FFmpeg no está disponible en este servidor' });
        }

        let mediaItem = null;
        if (mediaId && UUID_RE.test(String(mediaId))) {
            const { rows } = await db.query('SELECT * FROM "Media" WHERE id = $1', [mediaId]);
            mediaItem = rows[0] || null;
        }

        const sourceUrl = mediaItem?.url || fileUrl;
        const sourceName = mediaItem?.filename || filename || 'video-input.mp4';
        const isAviOrNonMp4 = /\.(avi|mov|webm|m4v|mkv|wmv|flv)$/i.test(sourceName) ||
                              (mediaItem?.type && !mediaItem.type.includes('mp4'));

        const result = await withTempDir(async (dir) => {
            const inputPath = path.join(dir, 'input' + path.extname(sourceName));
            const outputPath = path.join(dir, 'normalized.mp4');
            const thumbPath = path.join(dir, 'thumb.jpg');

            if (mediaItem?.s3Key && mediaItem?.bucket) {
                await s3ToFile(mediaItem.bucket, mediaItem.s3Key, inputPath);
            } else {
                await urlToFile(sourceUrl, inputPath);
            }

            const inputBuffer = await readFile(inputPath);
            const probe = probeMp4(inputBuffer);

            const isAlreadyH264Mp4 = !probe.parseError &&
                                     probe.videoCodec === 'h264' &&
                                     (probe.audioCodec === 'aac' || !probe.hasAudio) &&
                                     !isAviOrNonMp4;

            let finalBuffer = inputBuffer;
            let normalized = false;
            let finalProbe = probe;

            if (!isAlreadyH264Mp4 || isAviOrNonMp4) {
                console.log(`[VIDEO-READY] Normalizando ${sourceName} a MP4 (H.264/AAC)...`);
                await runFfmpeg([
                    '-i', inputPath,
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'fast',
                    '-crf', '22',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-movflags', '+faststart',
                    '-y', outputPath
                ], { timeoutMs: FFMPEG_TIMEOUT_MS, label: 'normalización H.264/AAC' });

                finalBuffer = await readFile(outputPath);
                finalProbe = probeMp4(finalBuffer);
                normalized = true;
            }

            // Generar miniatura JPG en el segundo 1 (o 0.5 si es muy corto)
            let thumbBuffer = null;
            try {
                const seekSec = finalProbe.durationSec && finalProbe.durationSec > 1.5 ? '00:00:01' : '00:00:00.5';
                await runFfmpeg([
                    '-ss', seekSec,
                    '-i', normalized ? outputPath : inputPath,
                    '-vframes', '1',
                    '-q:v', '3',
                    '-y', thumbPath
                ], { timeoutMs: 30_000, label: 'extracción miniatura' });
                thumbBuffer = await readFile(thumbPath);
            } catch (err) {
                console.warn('[VIDEO-READY] No se pudo generar miniatura automática:', err.message);
            }

            return { finalBuffer, thumbBuffer, normalized, probe: finalProbe };
        });

        const { deps, publicUrlFor } = await mediaDeps();
        const bucket = mediaItem?.bucket || process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        let finalUrl = sourceUrl;
        let thumbUrl = mediaItem?.thumbUrl || null;
        let finalMediaId = mediaItem?.id || null;

        // Subir versión normalizada a S3 si se convirtió
        if (result.normalized) {
            const baseStem = path.basename(sourceName, path.extname(sourceName)).replace(/[^a-zA-Z0-9_-]/g, '_');
            const normKey = `videos/normalized/${Date.now()}-${baseStem}.mp4`;
            await deps.s3.send(new deps.PutObjectCommand({
                Bucket: bucket,
                Key: normKey,
                Body: result.finalBuffer,
                ContentType: 'video/mp4'
            }));
            finalUrl = publicUrlFor(bucket, normKey);

            // Subir thumbnail si se extrajo
            let normThumbKey = null;
            if (result.thumbBuffer) {
                normThumbKey = `thumbs/${Date.now()}-${baseStem}.jpg`;
                await deps.s3.send(new deps.PutObjectCommand({
                    Bucket: bucket,
                    Key: normThumbKey,
                    Body: result.thumbBuffer,
                    ContentType: 'image/jpeg'
                }));
                thumbUrl = publicUrlFor(bucket, normThumbKey);
            }

            // Actualizar o insertar fila en Media
            if (mediaItem) {
                const { rows } = await db.query(
                    `UPDATE "Media"
                        SET url = $2, "s3Key" = $3, size = $4, "thumbUrl" = COALESCE($5, "thumbUrl"),
                            filename = $6
                      WHERE id = $1 RETURNING *`,
                    [mediaItem.id, finalUrl, normKey, result.finalBuffer.length, thumbUrl, `${baseStem}.mp4`]
                );
                finalMediaId = rows[0]?.id;
            } else {
                const { rows } = await db.query(
                    `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "thumbUrl", "createdAt")
                     VALUES (gen_random_uuid(), $1, $2, 'video', $3, $4, $5, $6, $7, $8, NOW())
                     RETURNING *`,
                    [`${baseStem}.mp4`, finalUrl, result.finalBuffer.length, bucket,
                     process.env.AWS_REGION || 'us-east-1', req.user?.clubId || null, normKey, thumbUrl]
                );
                finalMediaId = rows[0]?.id;
            }
        } else if (!thumbUrl && result.thumbBuffer) {
            try {
                const baseStem = path.basename(sourceName, path.extname(sourceName)).replace(/[^a-zA-Z0-9_-]/g, '_');
                const normThumbKey = `thumbs/${Date.now()}-${baseStem}.jpg`;
                await deps.s3.send(new deps.PutObjectCommand({
                    Bucket: bucket,
                    Key: normThumbKey,
                    Body: result.thumbBuffer,
                    ContentType: 'image/jpeg'
                }));
                thumbUrl = publicUrlFor(bucket, normThumbKey);
                if (mediaItem?.id) {
                    await db.query(`UPDATE "Media" SET "thumbUrl" = $2 WHERE id = $1`, [mediaItem.id, thumbUrl]).catch(() => {});
                }
            } catch (err) {
                console.warn('[VIDEO-READY] No se pudo guardar miniatura de respaldo:', err.message);
            }
        }

        const gcd = (a, b) => (b ? gcd(b, a % b) : a);
        const w = result.probe.width || 1080;
        const h = result.probe.height || 1920;
        const g = gcd(Math.round(w), Math.round(h));
        const aspectLabel = `${Math.round(w) / g}:${Math.round(h) / g}`;

        return res.json({
            ok: true,
            normalized: result.normalized,
            media: {
                id: finalMediaId,
                filename: mediaItem?.filename || sourceName,
                url: finalUrl,
                thumbUrl,
                durationSec: result.probe.durationSec || 0,
                width: w,
                height: h,
                aspectRatio: aspectLabel,
                fps: result.probe.fps || 30,
                hasAudio: result.probe.hasAudio ?? false,
                bitrateKbps: result.probe.bitrateKbps || null,
                sizeBytes: result.finalBuffer.length
            }
        });
    } catch (error) {
        console.error('[VIDEO-READY] Normalization error:', error);
        res.status(500).json({ error: `Error durante la normalización del video: ${error.message}` });
    }
};

// ─── 2. ANÁLISIS DE VIDEO CON IA ──────────────────────────────────────────

export const analyzeVideoReady = async (req, res) => {
    try {
        const { mediaId, videoUrl, additionalContext } = req.body || {};
        if (!mediaId && !videoUrl) {
            return res.status(400).json({ error: 'Se requiere mediaId o videoUrl' });
        }

        let mediaItem = null;
        if (mediaId && UUID_RE.test(String(mediaId))) {
            const { rows } = await db.query('SELECT * FROM "Media" WHERE id = $1', [mediaId]);
            mediaItem = rows[0] || null;
        }

        const sourceUrl = mediaItem?.url || videoUrl;

        const analysisData = await withTempDir(async (dir) => {
            const videoPath = path.join(dir, 'input.mp4');
            if (mediaItem?.s3Key && mediaItem?.bucket) {
                await s3ToFile(mediaItem.bucket, mediaItem.s3Key, videoPath);
            } else {
                await urlToFile(sourceUrl, videoPath);
            }

            const videoBuf = await readFile(videoPath);
            const probe = probeMp4(videoBuf);
            const duration = probe.durationSec || 15;

            // Extraer 3 fotogramas clave a lo largo del video (15%, 50%, 85%)
            const frameOffsets = [
                Math.max(0.5, Number((duration * 0.15).toFixed(1))),
                Math.max(1.0, Number((duration * 0.50).toFixed(1))),
                Math.max(1.5, Number((duration * 0.85).toFixed(1)))
            ];

            const framePaths = [];
            for (let i = 0; i < frameOffsets.length; i++) {
                const fPath = path.join(dir, `frame_${i}.jpg`);
                try {
                    await runFfmpeg([
                        '-ss', String(frameOffsets[i]),
                        '-i', videoPath,
                        '-vframes', '1',
                        '-q:v', '3',
                        '-y', fPath
                    ], { timeoutMs: 30_000, label: `extract-frame-${i}` });
                    framePaths.push(fPath);
                } catch { /* continua con los fotogramas posibles */ }
            }

            // Detección / transcripción de voz si el video contiene audio
            let transcript = null;
            let hasSpeech = false;
            let audioAnalysis = probe.hasAudio ? 'Pista de audio presente' : 'Video sin audio';

            if (probe.hasAudio) {
                const audioClipPath = path.join(dir, 'audio_clip.mp3');
                try {
                    // Extraer los primeros 60 segundos de audio a mp3
                    await runFfmpeg([
                        '-i', videoPath,
                        '-t', '60',
                        '-vn',
                        '-ac', '1',
                        '-ar', '16000',
                        '-c:a', 'libmp3lame',
                        '-b:a', '64k',
                        '-y', audioClipPath
                    ], { timeoutMs: 30_000, label: 'extract-audio' });

                    const audioStat = await stat(audioClipPath);
                    if (audioStat.size > 2000 && process.env.OPENAI_API_KEY) {
                        // Llamar a Whisper API para transcribir diálogo si existe
                        const audioBuffer = await readFile(audioClipPath);
                        const formData = new FormData();
                        const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
                        formData.append('file', blob, 'audio.mp3');
                        formData.append('model', 'whisper-1');
                        formData.append('language', 'es');
                        formData.append('prompt', 'Rotary International, Club Rotario, Distrito 4281, servicio comunitario.');

                        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                            body: formData,
                            signal: AbortSignal.timeout(30_000)
                        });

                        if (whisperRes.ok) {
                            const wData = await whisperRes.json();
                            if (wData.text && wData.text.trim().length > 10) {
                                transcript = wData.text.trim();
                                hasSpeech = true;
                                audioAnalysis = 'Contiene diálogos o testimonios orales claros.';
                            }
                        }
                    }
                } catch (audioErr) {
                    console.warn('[VIDEO-READY] Audio transcription warning:', audioErr.message);
                }
            }

            // Preparar imagen para análisis visual con Gemini / GPT-4o
            let keyframeBuffer = null;
            if (framePaths.length > 0) {
                keyframeBuffer = await readFile(framePaths[Math.floor(framePaths.length / 2)] || framePaths[0]);
            }

            return { probe, transcript, hasSpeech, audioAnalysis, keyframeBuffer, frameOffsets };
        });

        // Contexto institucional del Cerebro si existe
        let brainContext = '';
        if (req.user?.clubId) {
            try {
                const brains = await resolveBrainsForClub(req.user.clubId);
                if (brains?.clubBrain?.identityPrompt) {
                    brainContext = brains.clubBrain.identityPrompt;
                }
            } catch { /* contexto opcional */ }
        }

        // Llamar al servicio de IA para analizar la escena
        const promptSystem = `Eres un director audiovisual y estratega de contenido institucional de Rotary International (Distrito 4281).
Tu objetivo es analizar un video proporcionado para redes sociales sin inventar nada que no sea visible o audible.
Devuelve SIEMPRE un JSON válido con la siguiente estructura:
{
  "summary": "Resumen conciso (2-3 oraciones) de lo que muestra el video",
  "topic": "Tema principal detectado (ej. Jornada de Salud, Donación, Medio Ambiente, Juventud, Recreación)",
  "visualElements": ["elementos visuales relevantes detectados, ej. personas trabajando, pendón de Rotary, entrega de insumos"],
  "detectedTexts": ["textos visibles en carteles, camisetas o letreros si los hay"],
  "musicRecommendation": "Recomendación sobre la música de fondo (ej. Si ya tiene música, o si tiene diálogos y requiere ducking para no taparlos)",
  "hasMusicDetected": true/false
}`;

        const userPrompt = `Analiza este video:
- Duración: ${analysisData.probe.durationSec || 0} segundos
- Resolución: ${analysisData.probe.width}x${analysisData.probe.height}
- Audio original: ${analysisData.audioAnalysis}
${analysisData.transcript ? `- Transcripción detectada en el audio: "${analysisData.transcript}"` : '- No se detectó transcripción de voz clara.'}
${additionalContext ? `- Contexto adicional suministrado por el usuario: "${additionalContext}"` : ''}
${brainContext ? `- Contexto institucional: "${brainContext.slice(0, 300)}"` : ''}

Extrae los temas, acciones y elementos clave que servirán para redactar la publicación oficial.`;

        let rawAi = null;
        let aiResult = {
            summary: additionalContext || 'Video institucional documentando actividades de servicio y comunidad.',
            topic: 'Servicio en la Comunidad',
            visualElements: ['Actividad comunitaria', 'Participantes'],
            detectedTexts: [],
            musicRecommendation: analysisData.hasSpeech
                ? 'Este video contiene diálogo o testimonios. Se recomienda música suave con ducking automático.'
                : 'Se puede agregar una pista musical institucional para dinamizar el video.',
            hasMusicDetected: false
        };

        try {
            let base64Image = null;
            if (analysisData.keyframeBuffer) {
                base64Image = `data:image/jpeg;base64,${analysisData.keyframeBuffer.toString('base64')}`;
            }

            rawAi = await generateCopy({
                provider: DEFAULT_COPY_PROVIDER,
                system: promptSystem,
                userText: userPrompt,
                imageUrl: base64Image,
                jsonMode: true,
                temperature: 0.3
            });

            if (rawAi?.content) {
                const parsed = JSON.parse(rawAi.content);
                aiResult = { ...aiResult, ...parsed };
            }
        } catch (aiErr) {
            console.warn('[VIDEO-READY] AI Scene analysis fallback:', aiErr.message);
        }

        return res.json({
            ok: true,
            analysis: {
                ...aiResult,
                hasSpeech: analysisData.hasSpeech,
                transcript: analysisData.transcript,
                durationSec: analysisData.probe.durationSec || 0,
                width: analysisData.probe.width || 1080,
                height: analysisData.probe.height || 1920,
                fps: analysisData.probe.fps || 30,
                hasAudio: analysisData.probe.hasAudio
            }
        });
    } catch (error) {
        console.error('[VIDEO-READY] Analysis error:', error);
        res.status(500).json({ error: `Error al analizar el video con IA: ${error.message}` });
    }
};

// ─── 3. COMPOSICIÓN FINAL (FFmpeg: Video + Outro + Música con Ducking) ──────

export const composeVideoReady = async (req, res) => {
    try {
        const {
            mediaId,
            videoUrl,
            outro = null,     // { id, url, videoUrl, durationSec, transitionType, transitionSec }
            music = null,     // { withMusic, musicUrl, style, volume, voiceGainDb, ducking }
            title = null,
            copy = null,
            hashtags = [],
            reelProjectId = null
        } = req.body || {};

        if (!mediaId && !videoUrl) {
            return res.status(400).json({ error: 'Se requiere mediaId o videoUrl' });
        }

        if (!(await isFfmpegAvailable())) {
            return res.status(503).json({ error: 'FFmpeg no está disponible en este servidor' });
        }

        let mediaItem = null;
        if (mediaId && UUID_RE.test(String(mediaId))) {
            const { rows } = await db.query('SELECT * FROM "Media" WHERE id = $1', [mediaId]);
            mediaItem = rows[0] || null;
        }

        const sourceUrl = mediaItem?.url || videoUrl;

        // RESOLUCIÓN ROBUSTA DE OUTRO (v4.1095.0):
        let resolvedOutroUrl = outro?.videoUrl || outro?.url || null;
        let resolvedOutroTitle = outro?.title || null;
        if (!resolvedOutroUrl && outro?.id) {
            try {
                const outroRow = await loadOutroProject(outro.id, req.user);
                if (outroRow?.videoUrl) {
                    resolvedOutroUrl = outroRow.videoUrl;
                    resolvedOutroTitle = resolvedOutroTitle || outroRow.title;
                }
            } catch (err) {
                console.warn('[VIDEO-READY] No se pudo cargar el proyecto de outro por ID:', err.message);
            }
        }
        const hasOutro = Boolean(resolvedOutroUrl && String(resolvedOutroUrl).trim());

        // RESOLUCIÓN ROBUSTA DE MÚSICA Y CONTROLES DE AUDIO (v4.1095.0):
        const wantsMusic = Boolean(music?.withMusic);
        const voiceDb = Number(music?.voiceGainDb ?? 0);
        const styleMapping = {
            'institucional': 'institucional',
            'comunitario': 'calido',
            'dinamico': 'energico',
            'esperanzador': 'inspirador'
        };
        const requestedStyle = music?.style || 'institucional';
        const mappedStyle = styleMapping[requestedStyle] || requestedStyle;

        let resolvedMusicUrl = music?.musicUrl || null;
        if (wantsMusic && !resolvedMusicUrl) {
            // 1. Buscar audio previamente cargado en la biblioteca multimedia
            try {
                const audioMedia = (await pickAudioFromLibrary(requestedStyle, req.user?.clubId))
                    || (await pickAudioFromLibrary(mappedStyle, req.user?.clubId));
                if (audioMedia?.url) {
                    resolvedMusicUrl = audioMedia.url;
                }
            } catch (e) {
                console.warn('[VIDEO-READY] Error buscando audio en biblioteca:', e.message);
            }

            // 2. Si no hay en biblioteca, solicitar al motor de música (ElevenLabs / Stability / KIE)
            if (!resolvedMusicUrl) {
                try {
                    console.log(`[VIDEO-READY] Solicitando música al motor de audio (${requestedStyle} -> ${mappedStyle})...`);
                    const soundtrack = await startSoundtrack({
                        style: mappedStyle,
                        durationSec: 45,
                        clubId: req.user?.clubId
                    });

                    if (soundtrack?.state === 'success' && soundtrack.buffer) {
                        const { deps, publicUrlFor } = await mediaDeps();
                        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
                        const audioKey = `clubs/${req.user?.clubId || 'global'}/music/${Date.now()}-${requestedStyle}.mp3`;
                        await deps.s3.send(new deps.PutObjectCommand({
                            Bucket: bucket,
                            Key: audioKey,
                            Body: soundtrack.buffer,
                            ContentType: 'audio/mpeg'
                        }));
                        resolvedMusicUrl = publicUrlFor(bucket, audioKey);

                        await db.query(
                            `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key",
                                                  "sourceType", "sourceLabel", "createdAt")
                             VALUES (gen_random_uuid(), $1, $2, 'audio', $3, $4, $5, $6, $7, 'soundtrack', $8, NOW())`,
                            [
                                `musica-${requestedStyle}.mp3`, resolvedMusicUrl, soundtrack.buffer.length,
                                bucket, process.env.AWS_REGION || 'us-east-1', req.user?.clubId || null,
                                audioKey, `Música institucional: ${requestedStyle}`
                            ]
                        ).catch(() => {});
                    } else if (soundtrack?.state === 'success' && soundtrack.url) {
                        resolvedMusicUrl = soundtrack.url;
                    } else if (soundtrack?.state === 'queued' && soundtrack.taskId) {
                        let polled = await pollSoundtrack(soundtrack.provider, soundtrack.taskId);
                        for (let i = 0; i < 5 && (polled.state === 'queued' || polled.state === 'running'); i++) {
                            await new Promise(r => setTimeout(r, 2000));
                            polled = await pollSoundtrack(soundtrack.provider, soundtrack.taskId);
                        }
                        if (polled.state === 'success' && polled.url) {
                            resolvedMusicUrl = polled.url;
                        }
                    }
                } catch (genErr) {
                    console.warn('[VIDEO-READY] No se pudo generar pista con startSoundtrack:', genErr.message);
                }
            }
        }

        const result = await withTempDir(async (dir) => {
            const mainPath = path.join(dir, 'main.mp4');
            const outroPath = path.join(dir, 'outro.mp4');
            const musicPath = path.join(dir, 'bg_music.mp3');
            const finalPath = path.join(dir, 'final_composed.mp4');

            if (mediaItem?.s3Key && mediaItem?.bucket) {
                await s3ToFile(mediaItem.bucket, mediaItem.s3Key, mainPath);
            } else {
                await urlToFile(sourceUrl, mainPath);
            }

            const mainProbe = probeMp4(await readFile(mainPath));
            if (mainProbe.parseError) {
                throw new Error(`No se pudo leer el video principal: ${mainProbe.parseError}`);
            }

            let outroProbe = null;
            if (hasOutro) {
                await urlToFile(resolvedOutroUrl, outroPath);
                outroProbe = probeMp4(await readFile(outroPath));
                if (outroProbe.parseError) {
                    throw new Error(`No se pudo leer el archivo de outro: ${outroProbe.parseError}`);
                }
            }

            if (wantsMusic) {
                if (resolvedMusicUrl) {
                    try {
                        await urlToFile(resolvedMusicUrl, musicPath);
                    } catch (mErr) {
                        console.warn('[VIDEO-READY] No se pudo descargar pista musical de fondo:', mErr.message);
                    }
                }

                // Respaldo de síntesis en FFmpeg si no hay archivo externo descargado
                const hasDownloadedMusic = await stat(musicPath).then(() => true).catch(() => false);
                if (!hasDownloadedMusic) {
                    try {
                        console.log('[VIDEO-READY] Sintetizando cama sonora instrumental con FFmpeg...');
                        const durNeeded = Math.ceil((mainProbe.durationSec || 15) + (outro?.durationSec || 6) + 6);
                        let chords = '0.12*sin(2*PI*261.63*t)+0.09*sin(2*PI*329.63*t)+0.09*sin(2*PI*392.00*t)+0.06*sin(2*PI*523.25*t)';
                        if (requestedStyle === 'esperanzador' || mappedStyle === 'inspirador') {
                            chords = '0.12*sin(2*PI*174.61*t)+0.10*sin(2*PI*220.00*t)+0.10*sin(2*PI*261.63*t)+0.07*sin(2*PI*349.23*t)+0.05*sin(2*PI*440.00*t)';
                        } else if (requestedStyle === 'comunitario' || mappedStyle === 'calido') {
                            chords = '0.12*sin(2*PI*196.00*t)+0.10*sin(2*PI*246.94*t)+0.09*sin(2*PI*293.66*t)+0.06*sin(2*PI*392.00*t)';
                        } else if (requestedStyle === 'dinamico' || mappedStyle === 'energico') {
                            chords = '0.11*sin(2*PI*220.00*t)+0.11*sin(2*PI*293.66*t)+0.09*sin(2*PI*349.23*t)+0.07*sin(2*PI*440.00*t)';
                        }

                        await runFfmpeg([
                            '-f', 'lavfi',
                            '-i', `aevalsrc=exprs=${chords}:s=48000:d=${durNeeded}`,
                            '-filter_complex', `[0:a]lowpass=f=950,chorus=0.7:0.9:55:0.4:0.25:2,aecho=0.8:0.88:60:0.4,afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, durNeeded - 3)}:d=3[a]`,
                            '-map', '[a]',
                            '-c:a', 'libmp3lame',
                            '-b:a', '192k',
                            '-y', musicPath
                        ], { timeoutMs: 30_000, label: 'síntesis pista instrumental ambiental' });
                    } catch (synthErr) {
                        console.warn('[VIDEO-READY] No se pudo sintetizar música ambiental:', synthErr.message);
                    }
                }
            }

            const width = mainProbe.width || 1080;
            const height = mainProbe.height || 1920;
            const fps = mainProbe.fps && mainProbe.fps > 10 ? Number(mainProbe.fps.toFixed(2)) : 30;
            const mainDuration = mainProbe.durationSec || 15;
            const hasMusicFile = wantsMusic && (await stat(musicPath).catch(() => null));
            const effectiveMusicVol = Number(music?.volume ?? (mainProbe.hasAudio ? 0.22 : 0.45));

            // CASO A: Video + Outro (+ Música opcional con ducking y ganancia de voz)
            if (hasOutro) {
                const plan = planLibraryOutro({
                    main: mainProbe,
                    outro: { ...outroProbe, durationSec: outroProbe.durationSec || outro.durationSec || 4 },
                    transitionType: outro.transitionType || 'fade',
                    transitionSec: outro.transitionSec || 0.6,
                    outroAudio: true
                });

                if (!plan.ok) {
                    throw new Error(`Plan de outro inválido: ${plan.problems.join(', ')}`);
                }

                const baseGraph = buildLibraryOutroGraph(plan);
                let finalFilter = baseGraph.filter;
                let finalAudioLabel = baseGraph.audioLabel;
                const ffmpegInputs = ['-i', mainPath, '-i', outroPath];

                // Aplicar ganancia a la voz original si el usuario lo ajustó
                if (voiceDb && Math.abs(voiceDb) > 0.1 && finalAudioLabel) {
                    finalFilter += `;[${finalAudioLabel}]volume=${voiceDb}dB[voice_boosted]`;
                    finalAudioLabel = 'voice_boosted';
                }

                // Mezclar música de fondo con ducking inteligente
                if (hasMusicFile) {
                    ffmpegInputs.push('-i', musicPath);
                    const musicIdx = 2;
                    const totalDur = plan.finalDurationSec;

                    const duckingFilter = (mainProbe.hasAudio && finalAudioLabel)
                        // Ducking con sidechain: la voz del video atenúa la música dinámicamente
                        ? `;[${musicIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,aloop=loop=-1:size=2e+09,atrim=0:${totalDur},volume=${effectiveMusicVol}[bg_m];[bg_m][${finalAudioLabel}]sidechaincompress=threshold=0.08:ratio=6:attack=20:release=300:makeup=1[ducked_m];[${finalAudioLabel}][ducked_m]amix=inputs=2:duration=first:dropout_transition=0[final_a]`
                        // Sin audio original: la música suena continua con fades suaves
                        : `;[${musicIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,aloop=loop=-1:size=2e+09,atrim=0:${totalDur},volume=${effectiveMusicVol},afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, totalDur - 1.5)}:d=1.5[final_a]`;

                    finalFilter += duckingFilter;
                    finalAudioLabel = 'final_a';
                }

                const args = [
                    ...ffmpegInputs,
                    '-filter_complex', finalFilter,
                    '-map', '[vout]',
                    ...(finalAudioLabel ? ['-map', `[${finalAudioLabel}]`, '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '22',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    '-y', finalPath
                ];

                console.log(`[VIDEO-READY] Componiendo Video + Outro (${plan.finalDurationSec}s)...`);
                await runFfmpeg(args, { timeoutMs: FFMPEG_TIMEOUT_MS, label: 'composición video + outro + música' });

                const finalBuf = await readFile(finalPath);
                const finalProbe = probeMp4(finalBuf);
                return { finalBuf, probe: finalProbe, durationSec: plan.finalDurationSec };
            }

            // CASO B: Solo video + Música opcional (con ducking y ganancia de voz)
            if (hasMusicFile) {
                const totalDur = mainDuration;
                const musicIdx = 1;

                let filter = `[0:v]fps=${fps},format=yuv420p[v]`;
                const voiceVolumeFilter = (voiceDb && Math.abs(voiceDb) > 0.1) ? `,volume=${voiceDb}dB` : '';

                if (mainProbe.hasAudio) {
                    filter += `;[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${voiceVolumeFilter}[main_a];` +
                              `[${musicIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,aloop=loop=-1:size=2e+09,atrim=0:${totalDur},volume=${effectiveMusicVol}[bg];` +
                              `[bg][main_a]sidechaincompress=threshold=0.08:ratio=6:attack=20:release=300:makeup=1[ducked];` +
                              `[main_a][ducked]amix=inputs=2:duration=first:dropout_transition=0[a]`;
                } else {
                    filter += `;[${musicIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,aloop=loop=-1:size=2e+09,atrim=0:${totalDur},volume=${effectiveMusicVol},afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, totalDur - 1.5)}:d=1.5[a]`;
                }

                await runFfmpeg([
                    '-i', mainPath,
                    '-i', musicPath,
                    '-filter_complex', filter,
                    '-map', '[v]',
                    '-map', '[a]',
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '22',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-movflags', '+faststart',
                    '-y', finalPath
                ], { timeoutMs: FFMPEG_TIMEOUT_MS, label: 'composición video + música' });

                const finalBuf = await readFile(finalPath);
                const finalProbe = probeMp4(finalBuf);
                return { finalBuf, probe: finalProbe, durationSec: totalDur };
            }

            // CASO C: Sin música pero con ajuste de decibeles en la voz
            if (mainProbe.hasAudio && voiceDb && Math.abs(voiceDb) > 0.1) {
                await runFfmpeg([
                    '-i', mainPath,
                    '-filter_complex', `[0:v]fps=${fps},format=yuv420p[v];[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${voiceDb}dB[a]`,
                    '-map', '[v]',
                    '-map', '[a]',
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '22',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-movflags', '+faststart',
                    '-y', finalPath
                ], { timeoutMs: FFMPEG_TIMEOUT_MS, label: 'ajuste ganancia de voz' });
                const finalBuf = await readFile(finalPath);
                const finalProbe = probeMp4(finalBuf);
                return { finalBuf, probe: finalProbe, durationSec: mainDuration };
            }

            // CASO D: El video ya viene normalizado y no requiere outro, música ni ganancia
            return { finalBuf: await readFile(mainPath), probe: mainProbe, durationSec: mainDuration };
        });

        // Subir a S3 el video final compuesto
        const { deps, publicUrlFor } = await mediaDeps();
        const bucket = mediaItem?.bucket || process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        const key = `videos/ready/${Date.now()}-rotary-video.mp4`;

        await deps.s3.send(new deps.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: result.finalBuf,
            ContentType: 'video/mp4'
        }));
        const finalVideoUrl = publicUrlFor(bucket, key);

        // Guardar registro en Media
        const filename = `${title ? title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'video-preparado'}.mp4`;
        const { rows: mediaRows } = await db.query(
            `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key",
                                  "sourceType", "sourceLabel", "thumbUrl", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, 'video', $3, $4, $5, $6, $7, 'video_ready', $8, $9, NOW())
             RETURNING *`,
            [
                filename, finalVideoUrl, result.finalBuf.length, bucket,
                process.env.AWS_REGION || 'us-east-1', req.user?.clubId || null, key,
                'Video listo para publicar', mediaItem?.thumbUrl || null
            ]
        );

        // Registrar en MediaOutroComposition ÚNICAMENTE si llevó outro efectivo con URL válida (v4.1094.2)
        if (hasOutro && outro?.id && resolvedOutroUrl) {
            await db.query(
                `INSERT INTO "MediaOutroComposition" (
                    id, "originalMediaId", "versionMediaId", "outroId", "outroUrl", "outroTitle",
                    "transitionType", "transitionSec", "finalDurationSec", status, "s3Key", "sizeBytes",
                    "creditsUsed", "composedAt", "createdAt", "updatedAt"
                 ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'ready', $9, $10, 0, NOW(), NOW(), NOW()
                 )`,
                [
                    mediaItem?.id || mediaRows[0].id, mediaRows[0].id,
                    outro.id, resolvedOutroUrl, resolvedOutroTitle || outro.title || 'Cierre institucional',
                    outro.transitionType || 'fade', outro.transitionSec || 0.6,
                    result.durationSec, key, result.finalBuf.length
                ]
            ).catch(err => console.warn('[VIDEO-READY] Error guardando MediaOutroComposition:', err.message));
        }

        // GUARDADO AUTOMÁTICO EN LA BIBLIOTECA DE REELS (v4.1095.0):
        await ensureReelSchema().catch(() => {});

        const finalReelId = (reelProjectId && UUID_RE.test(String(reelProjectId)))
            ? reelProjectId
            : (await db.query('SELECT gen_random_uuid() AS id')).rows[0].id;

        const reelConfig = {
            preset: 'video_listo',
            withMusic: Boolean(wantsMusic),
            withOutro: Boolean(hasOutro),
            musicStyle: requestedStyle,
            voiceGainDb: voiceDb,
            musicVolume: effectiveMusicVol,
            originalMediaId: mediaItem?.id || null,
            outro: hasOutro ? { id: outro.id, title: resolvedOutroTitle } : null
        };

        await db.query(
            `INSERT INTO "ReelProject" (
                id, title, "clubId", "userId", "userEmail",
                "publicationType", format, "qualityTier", "motionStyle", transition,
                "musicStyle", "musicUrl", config, engine, status, "statusDetail",
                "videoUrl", "s3Key", "posterUrl", "durationSec", width, height,
                "sizeBytes", "hasAudio", "mediaId", "savedToLibraryAt", "createdAt", "updatedAt"
             ) VALUES (
                $1, $2, $3, $4, $5,
                'video_ready', '9:16', 'fullhd', 'video_ready', $6,
                $7, $8, $9, 'ffmpeg', 'ready', 'Listo para publicar',
                $10, $11, $12, $13, $14, $15,
                $16, $17, $18, NOW(), NOW(), NOW()
             )
             ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                "videoUrl" = EXCLUDED."videoUrl",
                "s3Key" = EXCLUDED."s3Key",
                "posterUrl" = EXCLUDED."posterUrl",
                "durationSec" = EXCLUDED."durationSec",
                width = EXCLUDED.width,
                height = EXCLUDED.height,
                "sizeBytes" = EXCLUDED."sizeBytes",
                "mediaId" = EXCLUDED."mediaId",
                "savedToLibraryAt" = NOW(),
                "updatedAt" = NOW()`,
            [
                finalReelId,
                title || 'Video listo para publicar',
                req.user?.clubId || null,
                req.user?.id || null,
                req.user?.email || null,
                outro?.transitionType || 'fade',
                requestedStyle,
                resolvedMusicUrl || null,
                JSON.stringify(reelConfig),
                finalVideoUrl,
                key,
                mediaItem?.thumbUrl || null,
                result.durationSec,
                result.probe.width || 1080,
                result.probe.height || 1920,
                result.finalBuf.length,
                true,
                mediaRows[0]?.id || null
            ]
        ).catch(err => console.warn('[VIDEO-READY] Error guardando ReelProject:', err.message));

        await db.query(
            `INSERT INTO "ReelScene" (
                id, "projectId", position, role, brief,
                status, "videoUrl", "durationSec", "createdAt", "updatedAt"
             ) VALUES (
                gen_random_uuid(), $1, 1, 'video_principal', 'Video original subido y procesado',
                'ready', $2, $3, NOW(), NOW()
             )
             ON CONFLICT DO NOTHING`,
            [finalReelId, finalVideoUrl, result.durationSec]
        ).catch(err => console.warn('[VIDEO-READY] Error guardando ReelScene:', err.message));

        const copyText = copy ? String(copy).trim() : '';
        if (copyText) {
            await db.query(
                `INSERT INTO "ReelCopy" (
                    id, "projectId", "clubId", platform, locale, version, "isCurrent",
                    title, description, hashtags, "fullText", "charCount", source
                 ) VALUES (
                    gen_random_uuid(), $1, $2, 'all', 'es', 1, true,
                    $3, $4, $5, $4, length($4), 'ai'
                 )
                 ON CONFLICT DO NOTHING`,
                [
                    finalReelId,
                    req.user?.clubId || null,
                    title || 'Video listo para publicar',
                    copyText,
                    JSON.stringify(hashtags || [])
                ]
            ).catch(err => console.warn('[VIDEO-READY] Error guardando ReelCopy:', err.message));
        }

        return res.json({
            ok: true,
            videoUrl: finalVideoUrl,
            thumbUrl: mediaItem?.thumbUrl || null,
            durationSec: result.durationSec,
            sizeBytes: result.finalBuf.length,
            width: result.probe.width || 1080,
            height: result.probe.height || 1920,
            bitrateKbps: result.probe.bitrateKbps || null,
            mediaId: mediaRows[0]?.id,
            reelProjectId: finalReelId
        });
    } catch (error) {
        console.error('[VIDEO-READY] Composition error:', error);
        res.status(500).json({ error: `Error al procesar el video final: ${error.message}` });
    }
};

// ─── 4. GENERACIÓN DE COPY INSTITUCIONAL (REGLA 10) ─────────────────────────

export const generateVideoReadyCopy = async (req, res) => {
    try {
        const {
            analysis = {},
            additionalContext = '',
            action = 'generate',   // 'generate' | 'shorter' | 'emotional' | 'institutional' | 'regenerate'
            previousCopy = ''
        } = req.body || {};

        let modifierInstruction = '';
        if (action === 'shorter') {
            modifierInstruction = 'Haz el texto significativamente más breve, conciso y de impacto directo en 1 o 2 oraciones.';
        } else if (action === 'emotional') {
            modifierInstruction = 'Aumenta el calor humano y la emotividad, destacando el impacto en las personas y la solidaridad comunitaria.';
        } else if (action === 'institutional') {
            modifierInstruction = 'Utiliza un tono más protocolario, formal y de liderazgo de servicio cívico.';
        }

        // Sistema con REGLA 10: Evitar repetir muletillas del Distrito
        const systemPrompt = `${INSTITUTIONAL_VOICE}

REGLA CLAVE DE COMUNICACIÓN (#10):
Como las publicaciones se realizan desde las cuentas oficiales del Distrito, EVITA REPETIR INNECESARIAMENTE frases como:
"Rotary Distrito 4281…"
al comienzo o al final de todos los copies.
Prioriza mensajes directamente relacionados con:
- servicio,
- impacto,
- comunidad,
- solidaridad,
- liderazgo,
- acción,
- voluntariado,
- transformación social.
Únicamente menciona el Distrito cuando sea información contextual realmente necesaria e indispensable.
PROHIBIDO inventar nombres, lugares, clubes, fechas, cifras o cargos no verificables.

Devuelve SIEMPRE un JSON válido con esta estructura:
{
  "copy": "Texto redactado para la publicación (incluye 1-3 emojis pertinentes bien ubicados y llamados a la acción)",
  "hashtags": ["#ServicioRotario", "#GenteDeAccion", "#ImpactoComunitario"],
  "notes": ["Breve justificación de las decisiones editoriales tomadas"]
}`;

        const userPrompt = `Redacta el texto de publicación para este video:
- Resumen del contenido: "${analysis.summary || 'Acción de servicio comunitario'}"
- Temática detectada: "${analysis.topic || 'Servicio'}"
${analysis.transcript ? `- Frases o diálogos presentes en el video: "${analysis.transcript}"` : ''}
${additionalContext ? `- Contexto suministrado por el organizador: "${additionalContext}"` : ''}
${previousCopy ? `- Texto anterior que se desea mejorar/ajustar: "${previousCopy}"` : ''}
${modifierInstruction ? `- Instrucción de ajuste: ${modifierInstruction}` : ''}`;

        const aiResponse = await generateCopy({
            provider: DEFAULT_COPY_PROVIDER,
            system: systemPrompt,
            userText: userPrompt,
            jsonMode: true,
            temperature: action === 'shorter' ? 0.3 : 0.6
        });

        let parsed = {
            copy: '',
            hashtags: ['#GenteDeAccion', '#RotaryEnAccion', '#ServicioComunitario'],
            notes: []
        };

        if (aiResponse?.content) {
            try {
                parsed = JSON.parse(aiResponse.content);
            } catch {
                parsed.copy = aiResponse.content.trim();
            }
        }

        const finalCopy = cleanVideoReadyCopy(parsed.copy);

        return res.json({
            ok: true,
            copy: finalCopy,
            hashtags: parsed.hashtags || [],
            notes: parsed.notes || []
        });
    } catch (error) {
        console.error('[VIDEO-READY] Copy generation error:', error);
        res.status(500).json({ error: `Error al generar copy con IA: ${error.message}` });
    }
};

// ─── 5. PUBLICACIÓN EN REDES SOCIALES ───────────────────────────────────────

export const publishVideoReady = async (req, res) => {
    try {
        const {
            mediaUrl,
            copy,
            accountIds = [],
            scheduledFor = null,
            timezone = null
        } = req.body || {};

        if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl requerido' });
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            return res.status(400).json({ error: 'Selecciona al menos una cuenta para publicar' });
        }

        const isAdmin = req.user?.role === 'administrator';
        const accountWhere = { id: { in: accountIds } };
        if (!isAdmin && req.user?.clubId) {
            accountWhere.clubId = req.user.clubId;
        }

        const accounts = await prisma.socialAccount.findMany({ where: accountWhere });
        if (!accounts.length) {
            return res.status(404).json({ error: 'No se encontraron las cuentas sociales seleccionadas o no tienes permiso para utilizarlas' });
        }

        // Si es programada
        if (scheduledFor) {
            const scheduledAt = new Date(scheduledFor);
            if (Number.isNaN(scheduledAt.getTime())) {
                return res.status(400).json({ error: 'Fecha programada inválida' });
            }
            if (scheduledAt.getTime() <= Date.now() + 60_000) {
                return res.status(400).json({ error: 'La fecha programada debe estar al menos a 1 minuto en el futuro' });
            }

            const pendingOutcomes = accounts.map(a => ({
                accountId: a.id,
                platform: a.platform,
                accountName: a.accountName,
                ok: false,
                pending: true
            }));

            const pub = await prisma.socialPublication.create({
                data: {
                    clubId: accounts[0].clubId || req.user?.clubId || null,
                    userId: req.user?.id || null,
                    imageUrl: mediaUrl,
                    platformCopies: { facebook: { copy }, instagram: { copy } },
                    targetAccounts: pendingOutcomes,
                    status: 'scheduled',
                    scheduledFor: scheduledAt,
                    timezone: timezone || null,
                    accounts: { set: accounts.map(a => ({ id: a.id })) }
                }
            });

            return res.json({
                ok: true,
                status: 'scheduled',
                publicationId: pub.id,
                scheduledFor: pub.scheduledFor,
                outcomes: pendingOutcomes
            });
        }

        // Publicación inmediata en paralelo
        const outcomes = await Promise.all(accounts.map(async (acc) => {
            if (acc.status !== 'active') {
                return { accountId: acc.id, platform: acc.platform, ok: false, error: `Cuenta inactiva (${acc.status})` };
            }
            try {
                const token = decryptToken(acc.accessToken);
                const resPub = await publishContentToTarget({
                    account: acc,
                    decryptedToken: token,
                    content: {
                        kind: 'video',
                        mediaUrl,
                        message: copy
                    }
                });
                return {
                    accountId: acc.id,
                    platform: acc.platform,
                    accountName: acc.accountName,
                    ok: resPub.ok,
                    externalId: resPub.externalId || null,
                    externalUrl: resPub.externalUrl || null,
                    error: resPub.error || null,
                    publishedAt: resPub.ok ? new Date().toISOString() : null
                };
            } catch (err) {
                return { accountId: acc.id, platform: acc.platform, ok: false, error: err.message };
            }
        }));

        const someOk = outcomes.some(o => o.ok);
        const allOk = outcomes.every(o => o.ok);
        const pubStatus = allOk ? 'published' : someOk ? 'partial' : 'error';

        await prisma.socialPublication.create({
            data: {
                clubId: accounts[0].clubId || req.user?.clubId || null,
                userId: req.user?.id || null,
                imageUrl: mediaUrl,
                platformCopies: { facebook: { copy }, instagram: { copy } },
                targetAccounts: outcomes,
                status: pubStatus,
                publishedAt: someOk ? new Date() : null,
                accounts: { set: accounts.map(a => ({ id: a.id })) }
            }
        });

        return res.json({
            ok: someOk,
            status: pubStatus,
            outcomes
        });
    } catch (error) {
        console.error('[VIDEO-READY] Publish error:', error);
        res.status(500).json({ error: `Error al publicar el video: ${error.message}` });
    }
};
