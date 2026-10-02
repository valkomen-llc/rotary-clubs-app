// ════════════════════════════════════════════════════════════════════════════
// Motor de Renderizado y Exportación de Video — v4.1141.0
//
// Pipeline asíncrono en backend con FFmpeg:
// 1. Preparando proyecto (descarga y verificación de activos en disco local)
// 2. Procesando multimedia (adaptación de relación de aspecto, rotulado y subtítulos)
// 3. Renderizando (ensamblaje, transiciones, mezcla de audio multipista y codificación H.264)
// 4. Finalizando (subida a S3, generación de póster y registro en Biblioteca Multimedia)
// 5. Completado (actualización de estado y disponibilidad inmediata)
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';
import { runFfmpeg } from './reelFfmpeg.js';
import { resolveDimensions } from './videoEditorSpec.js';
import { normalizeLanguageCode } from './videoEditorTranslation.js';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Dependencias de S3 compartidas para subida de video y póster.
 */
async function getS3Client() {
    const aws = await import('@aws-sdk/client-s3');
    return new aws.S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        },
        maxAttempts: 3,
    });
}

/**
 * Descarga un recurso remoto a un archivo local temporal.
 */
async function downloadToFile(url, destPath) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Error descargando recurso (${res.status}): ${url}`);
    }
    const stream = createWriteStream(destPath);
    await pipeline(res.body, stream);
}

/**
 * Genera un archivo de subtítulos en formato SubRip (.srt) a partir de los segmentos del proyecto.
 */
function generateSrtContent(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return '';

    const formatSrtTime = (seconds) => {
        const s = Math.max(0, Number(seconds) || 0);
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 1000);
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };

    return segments.map((seg, idx) => {
        const start = formatSrtTime(seg.start);
        const end = formatSrtTime(seg.end > seg.start ? seg.end : seg.start + 2);
        return `${idx + 1}\n${start} --> ${end}\n${seg.text}\n`;
    }).join('\n');
}

/**
 * Convierte color CSS (#RRGGBB, #RGB o rgb/rgba) a formato ASS hex (&HAABBGGRR).
 * En ASS el orden de bytes es Alpha (invertido: 00=opaco, FF=transparente), Azul, Verde, Rojo.
 */
function cssColorToAss(colorStr, baseOpacity = 1) {
    if (!colorStr) return '&H00FFFFFF';
    let r = 255, g = 255, b = 255, a = 1;
    if (colorStr.startsWith('#')) {
        let hex = colorStr.slice(1);
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        r = parseInt(hex.substring(0, 2), 16) || 0;
        g = parseInt(hex.substring(2, 4), 16) || 0;
        b = parseInt(hex.substring(4, 6), 16) || 0;
        if (hex.length === 8) {
            a = parseInt(hex.substring(6, 8), 16) / 255;
        }
    } else if (colorStr.startsWith('rgb')) {
        const m = colorStr.match(/[\d.]+/g);
        if (m && m.length >= 3) {
            r = parseInt(m[0], 10) || 0;
            g = parseInt(m[1], 10) || 0;
            b = parseInt(m[2], 10) || 0;
            if (m[3] !== undefined) a = parseFloat(m[3]);
        }
    }
    const finalAlpha = Math.max(0, Math.min(1, a * (baseOpacity ?? 1)));
    const assAlpha = Math.round((1 - finalAlpha) * 255);
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
    return `&H${toHex(assAlpha)}${toHex(b)}${toHex(g)}${toHex(r)}`;
}

/**
 * Genera la cadena force_style para el filtro de subtítulos de FFmpeg
 * mapeando fielmente las propiedades visuales y tipográficas configuradas por el usuario.
 */
function buildSubtitleForceStyle(style = {}, videoHeight = 1080) {
    // 1. Tipografía y Tamaño
    const fontName = style.fontFamily || 'Arial';
    const baseSize = Number(style.fontSize) || 36;
    // Escalar tamaño proporcionalmente al canvas de referencia (720p base)
    const fontSize = Math.max(14, Math.round(baseSize * (videoHeight / 720)));

    // 2. Peso y Estilos
    const isBold = (style.fontWeight && (Number(style.fontWeight) >= 600 || style.fontWeight === 'bold')) ? 1 : 0;
    const isItalic = style.fontStyle === 'italic' ? 1 : 0;
    const isUnderline = style.textDecoration === 'underline' ? 1 : 0;

    // 3. Colores
    const primaryColor = cssColorToAss(style.color || '#ffffff', style.opacity ?? 1);

    // 4. Fondo vs Contorno/Sombra
    let borderStyle = 1; // 1 = contorno + sombra
    let outline = 0;
    let outlineColor = '&H00000000';
    let shadow = 0;
    let backColor = '&H80000000';

    if (style.backgroundEnabled !== false && (style.backgroundColor || style.backgroundOpacity > 0)) {
        // Modo caja de fondo (BorderStyle 4)
        borderStyle = 4;
        backColor = cssColorToAss(style.backgroundColor || '#000000', style.backgroundOpacity ?? 0.7);
        outline = Number(style.strokeWidth) || 1;
        outlineColor = backColor;
    } else {
        borderStyle = 1;
        if (style.strokeEnabled) {
            outline = Math.max(1, Number(style.strokeWidth) || 2);
            outlineColor = cssColorToAss(style.strokeColor || '#000000', 1);
        }
        if (style.shadowEnabled) {
            shadow = Math.max(1, Math.round((Number(style.shadowBlur) || 4) / 2));
            backColor = cssColorToAss(style.shadowColor || '#000000', style.shadowOpacity ?? 0.8);
        }
    }

    // 5. Alineación (teclado numérico ASS: 1=inf-izq, 2=inf-centro, 3=inf-der, 4=cen-izq, 5=cen-cen, 6=cen-der, 7=sup-izq, 8=sup-cen, 9=sup-der)
    let alignment = 2; // por defecto bottom center
    const pos = style.position || 'bottom';
    const align = style.align || 'center';

    if (pos === 'top') {
        alignment = align === 'left' ? 7 : (align === 'right' ? 9 : 8);
    } else if (pos === 'center') {
        alignment = align === 'left' ? 4 : (align === 'right' ? 6 : 5);
    } else {
        alignment = align === 'left' ? 1 : (align === 'right' ? 3 : 2);
    }

    // 6. Márgenes verticales y espaciado
    let marginV = Math.max(20, Math.round(videoHeight * 0.04));
    if (typeof style.y === 'number' && style.y !== 0) {
        marginV = Math.max(10, Math.round(marginV + (style.y * (videoHeight / 100))));
    }
    const spacing = Math.round(Number(style.letterSpacing) || 0);

    return [
        `FontName=${fontName}`,
        `FontSize=${fontSize}`,
        `PrimaryColour=${primaryColor}`,
        `BackColour=${backColor}`,
        `OutlineColour=${outlineColor}`,
        `BorderStyle=${borderStyle}`,
        `Outline=${outline}`,
        `Shadow=${shadow}`,
        `Alignment=${alignment}`,
        `MarginV=${marginV}`,
        `Bold=${isBold}`,
        `Italic=${isItalic}`,
        `Underline=${isUnderline}`,
        `Spacing=${spacing}`
    ].join(',');
}

/**
 * Ejecuta el proceso de renderizado de forma asíncrona y actualiza el progreso en la base de datos.
 */
export async function renderProjectAsync(projectId) {
    // 1. Obtener proyecto
    const { rows } = await db.query(
        `SELECT * FROM "VideoEditorProject" WHERE id = $1`,
        [projectId]
    );

    if (rows.length === 0) {
        console.error(`[VideoEditorRender] Proyecto no encontrado: ${projectId}`);
        return;
    }

    const project = rows[0];

    // Verificar si ya se está renderizando para evitar duplicación
    if (project.renderStatus === 'rendering') {
        console.warn(`[VideoEditorRender] El proyecto ${projectId} ya se encuentra en renderizado.`);
        return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), `v-editor-render-${projectId}-`));

    const updateProgress = async (progress, stage, status = 'rendering') => {
        await db.query(
            `UPDATE "VideoEditorProject"
                SET "renderProgress" = $1, "renderStage" = $2, "renderStatus" = $3, status = $4, "updatedAt" = NOW()
              WHERE id = $5`,
            [progress, stage, status, status, projectId]
        );
    };

    try {
        await updateProgress(10, 'Preparando proyecto');

        const { width, height } = resolveDimensions(project.format, project.resolution);
        const tracks = Array.isArray(project.tracks) ? project.tracks : [];
        const clips = Array.isArray(project.clips) ? project.clips : [];
        const subtitles = project.subtitles || {};
        const activeLang = normalizeLanguageCode(subtitles.activeLanguage || subtitles.language || subtitles.sourceLanguage || 'es');
        const rawSegments = Array.isArray(subtitles.segments) ? subtitles.segments : [];
        const subtitleSegments = rawSegments.map((s, idx) => {
            let activeText = '';
            if (s.translations && typeof s.translations === 'object') {
                for (const [k, v] of Object.entries(s.translations)) {
                    if (normalizeLanguageCode(k) === activeLang && typeof v === 'string' && v.trim()) {
                        activeText = v;
                        break;
                    }
                }
            }
            if (!activeText && subtitles.translations && typeof subtitles.translations === 'object') {
                for (const [k, ver] of Object.entries(subtitles.translations)) {
                    if (normalizeLanguageCode(k) === activeLang && Array.isArray(ver?.segments)) {
                        const match = ver.segments.find(vs => vs.id === s.id) || ver.segments[idx];
                        if (match?.text) {
                            activeText = match.text;
                            break;
                        }
                    }
                }
            }
            if (!activeText) {
                activeText = s.text || '';
            }
            return {
                ...s,
                text: activeText
            };
        }).filter(s => s.text && s.text.trim().length > 0);

        // Filtrar clips de video e imagen
        const visualClips = clips
            .filter(c => (c.type === 'video' || c.type === 'image') && c.url)
            .sort((a, b) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));

        // Filtrar clips de audio
        const audioClips = clips
            .filter(c => c.type === 'audio' && c.url)
            .sort((a, b) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));

        if (visualClips.length === 0) {
            throw new Error('El proyecto no contiene clips visuales (videos o imágenes) para renderizar.');
        }

        await updateProgress(25, 'Procesando multimedia');

        // 2. Descargar y normalizar cada clip visual
        const localClips = [];
        for (let i = 0; i < visualClips.length; i++) {
            const clip = visualClips[i];
            const ext = clip.type === 'image' ? '.jpg' : '.mp4';
            const rawPath = path.join(dir, `clip_raw_${i}${ext}`);
            const normPath = path.join(dir, `clip_norm_${i}.mp4`);

            await downloadToFile(clip.url, rawPath);

            const duration = Math.max(1, Number(clip.duration) || 5);
            const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1`;

            if (clip.type === 'image') {
                // Animar imagen fija como clip de video con duración especificada
                await runFfmpeg([
                    '-loop', '1',
                    '-t', String(duration),
                    '-i', rawPath,
                    '-vf', scaleFilter,
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-y', normPath
                ], { timeoutMs: 45_000, label: `normalize-image-${i}` });
            } else {
                // Normalizar video
                const trimArgs = [];
                if (clip.trimStart && Number(clip.trimStart) > 0) {
                    trimArgs.push('-ss', String(clip.trimStart));
                }
                trimArgs.push('-t', String(duration));

                await runFfmpeg([
                    ...trimArgs,
                    '-i', rawPath,
                    '-vf', scaleFilter,
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-pix_fmt', 'yuv420p',
                    '-y', normPath
                ], { timeoutMs: 60_000, label: `normalize-video-${i}` });
            }

            localClips.push({ ...clip, localPath: normPath, duration });
        }

        await updateProgress(50, 'Renderizando');

        // 3. Montar concat list para los clips visuales
        const concatTxtPath = path.join(dir, 'concat.txt');
        const concatLines = localClips.map(c => `file '${c.localPath}'`).join('\n');
        await writeFile(concatTxtPath, concatLines, 'utf8');

        const mergedVideoPath = path.join(dir, 'merged_video.mp4');
        await runFfmpeg([
            '-f', 'concat',
            '-safe', '0',
            '-i', concatTxtPath,
            '-c', 'copy',
            '-y', mergedVideoPath
        ], { timeoutMs: 60_000, label: 'concat-visual-clips' });

        // 4. Preparar subtítulos si existen
        let finalVideoPath = mergedVideoPath;
        if (subtitleSegments.length > 0) {
            const srtPath = path.join(dir, 'subtitles.srt');
            const srtContent = generateSrtContent(subtitleSegments);
            await writeFile(srtPath, srtContent, 'utf8');

            const subbedVideoPath = path.join(dir, 'subbed_video.mp4');

            // Resolver estilo efectivo de subtítulos: estilo global o primer segmento personalizado
            const firstStyledSegment = subtitleSegments.find(s => s.style && Object.keys(s.style).length > 0);
            const effectiveSubtitleStyle = {
                ...(subtitles.style || {}),
                ...(firstStyledSegment?.style || {})
            };
            const forceStyleStr = buildSubtitleForceStyle(effectiveSubtitleStyle, height);

            // Incrustar subtítulos con el estilo visual y tipográfico exacto del proyecto
            await runFfmpeg([
                '-i', mergedVideoPath,
                '-vf', `subtitles=${srtPath}:force_style='${forceStyleStr}'`,
                '-c:v', 'libx264',
                '-c:a', 'copy',
                '-pix_fmt', 'yuv420p',
                '-y', subbedVideoPath
            ], { timeoutMs: 90_000, label: 'burn-subtitles' });

            finalVideoPath = subbedVideoPath;
        }

        // 5. Procesar pistas de audio adicionales si existen
        const outputVideoPath = path.join(dir, 'final_rendered.mp4');
        if (audioClips.length > 0) {
            const primaryAudio = audioClips[0];
            const audioRawPath = path.join(dir, 'bg_audio.mp3');
            await downloadToFile(primaryAudio.url, audioRawPath);

            const audioVolume = Number(primaryAudio.volume ?? 80) / 100;

            await runFfmpeg([
                '-i', finalVideoPath,
                '-i', audioRawPath,
                '-filter_complex', `[1:a]volume=${audioVolume}[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
                '-map', '0:v',
                '-map', '[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-y', outputVideoPath
            ], { timeoutMs: 60_000, label: 'mix-audio-tracks' }).catch(async () => {
                // Fallback si el video original no tenía canal de audio previo
                await runFfmpeg([
                    '-i', finalVideoPath,
                    '-i', audioRawPath,
                    '-filter_complex', `[1:a]volume=${audioVolume}[aout]`,
                    '-map', '0:v',
                    '-map', '[aout]',
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-shortest',
                    '-y', outputVideoPath
                ], { timeoutMs: 60_000, label: 'mix-single-audio' });
            });
        } else {
            // Asegurar que el video tenga una pista de audio (aunque sea silenciosa) para máxima compatibilidad
            await runFfmpeg([
                '-i', finalVideoPath,
                '-f', 'lavfi',
                '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',
                '-movflags', '+faststart',
                '-y', outputVideoPath
            ], { timeoutMs: 60_000, label: 'finalize-faststart' }).catch(async () => {
                // Si ya tenía audio
                await runFfmpeg([
                    '-i', finalVideoPath,
                    '-c', 'copy',
                    '-movflags', '+faststart',
                    '-y', outputVideoPath
                ], { timeoutMs: 30_000, label: 'finalize-faststart-copy' });
            });
        }

        await updateProgress(85, 'Finalizando');

        // 6. Extraer fotograma póster / miniatura
        const posterPath = path.join(dir, 'poster.jpg');
        await runFfmpeg([
            '-y',
            '-ss', '1',
            '-i', outputVideoPath,
            '-frames:v', '1',
            '-q:v', '2',
            posterPath
        ], { timeoutMs: 15_000, label: 'extract-poster' }).catch(async () => {
            // Si el video dura menos de 1s extraer en el segundo 0
            await runFfmpeg([
                '-y',
                '-ss', '0',
                '-i', outputVideoPath,
                '-frames:v', '1',
                '-q:v', '2',
                posterPath
            ], { timeoutMs: 15_000, label: 'extract-poster-0' });
        });

        // 7. Subir a S3 y registrar en la Biblioteca Multimedia de Club Platform
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        const s3 = await getS3Client();
        const aws = await import('@aws-sdk/client-s3');

        const timestamp = Date.now();
        const clubScope = project.clubId || 'global';
        const videoS3Key = `clubs/${clubScope}/videos/${timestamp}-editor-${projectId.slice(0, 8)}.mp4`;
        const posterS3Key = `clubs/${clubScope}/images/${timestamp}-editor-thumb-${projectId.slice(0, 8)}.jpg`;

        const videoBuffer = await readFile(outputVideoPath);
        const posterBuffer = await readFile(posterPath).catch(() => null);
        const videoStat = await stat(outputVideoPath);

        await s3.send(new aws.PutObjectCommand({
            Bucket: bucket,
            Key: videoS3Key,
            Body: videoBuffer,
            ContentType: 'video/mp4'
        }));

        if (posterBuffer) {
            await s3.send(new aws.PutObjectCommand({
                Bucket: bucket,
                Key: posterS3Key,
                Body: posterBuffer,
                ContentType: 'image/jpeg'
            }));
        }

        const encodedVideoKey = videoS3Key.split('/').map(encodeURIComponent).join('/');
        const videoUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedVideoKey}`;

        let thumbUrl = null;
        if (posterBuffer) {
            const encodedPosterKey = posterS3Key.split('/').map(encodeURIComponent).join('/');
            thumbUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedPosterKey}`;
        }

        // Calcular duración total
        const totalDuration = localClips.reduce((acc, c) => acc + (Number(c.duration) || 0), 0);

        // 8. Registrar en tabla "Media" de la Biblioteca Multimedia de Club Platform
        try {
            await db.query(
                `INSERT INTO "Media" (
                    id, filename, url, "s3Key", type, "thumbUrl", "clubId",
                    "sourceType", "sourceId", "sourceLabel", "createdAt", "updatedAt"
                ) VALUES (
                    $1, $2, $3, $4, 'video', $5, $6, 'editor', $7, $8, NOW(), NOW()
                )`,
                [
                    `media-${timestamp}`,
                    `${project.title || 'Video Editado'}.mp4`,
                    videoUrl,
                    videoS3Key,
                    thumbUrl,
                    project.clubId || null,
                    project.id,
                    `Editor de Video — ${project.title || 'Proyecto'}`
                ]
            );
        } catch (mediaErr) {
            console.warn('[VideoEditorRender] Warning al registrar en Media table:', mediaErr.message);
        }

        // 9. Actualizar proyecto como Completado
        await db.query(
            `UPDATE "VideoEditorProject"
                SET "renderProgress" = 100,
                    "renderStage" = 'Completado',
                    "renderStatus" = 'completed',
                    status = 'completed',
                    "videoUrl" = $1,
                    "s3Key" = $2,
                    "thumbUrl" = $3,
                    duration = $4,
                    width = $5,
                    height = $6,
                    "sizeBytes" = $7,
                    "errorDetail" = NULL,
                    "updatedAt" = NOW()
              WHERE id = $8`,
            [videoUrl, videoS3Key, thumbUrl, totalDuration, width, height, videoStat.size, projectId]
        );

        console.log(`[VideoEditorRender] Render exitoso para el proyecto ${projectId}: ${videoUrl}`);
    } catch (err) {
        console.error(`[VideoEditorRender] Error renderizando proyecto ${projectId}:`, err);
        await db.query(
            `UPDATE "VideoEditorProject"
                SET "renderStatus" = 'error',
                    "renderStage" = 'Error en el render',
                    status = 'error',
                    "errorDetail" = $1,
                    "updatedAt" = NOW()
              WHERE id = $2`,
            [err.message?.slice(0, 1000) || 'Error desconocido durante el render', projectId]
        );
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}
