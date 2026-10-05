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
 * Descarga un recurso multimedia a un archivo local temporal.
 * Estrategia de triple resolución con diagnóstico detallado:
 * 1. Acceso directo a AWS S3 mediante SDK autenticado si la URL o el clip tienen clave S3 o coinciden con la tabla Media.
 * 2. Descarga HTTP/HTTPS con resolución de rutas relativas locales y reintentos automáticos (3 intentos con backoff exponencial).
 * 3. Preflight y verificación de integridad (tamaño > 0 bytes).
 */
export async function downloadMediaAsset(clipOrUrl, destPath, timeoutMs = 60_000) {
    const url = typeof clipOrUrl === 'string' ? clipOrUrl : (clipOrUrl?.url || '');
    const clipName = typeof clipOrUrl === 'object' ? (clipOrUrl.name || clipOrUrl.type || 'recurso') : 'recurso';
    const mediaId = typeof clipOrUrl === 'object' ? clipOrUrl.mediaId : null;

    if (!url || typeof url !== 'string' || !url.trim()) {
        throw new Error(`[ASSET] URL de recurso inválida o vacía para "${clipName}"`);
    }

    const cleanUrl = url.trim();
    console.log(`[ASSET] Iniciando descarga de recurso "${clipName}": ${cleanUrl.split('?')[0]}`);

    // 1. Buscar en la tabla Media si tenemos URL, ID o nombre
    let mediaRow = null;
    try {
        const queryRes = await db.query(
            `SELECT id, filename, url, "s3Key", bucket, mimetype, type 
               FROM "Media" 
              WHERE url = $1 
                 OR "s3Key" = $1 
                 OR id::text = $1
                 OR ($2::text IS NOT NULL AND id::text = $2::text)
                 OR ($3::text IS NOT NULL AND filename = $3::text)
              LIMIT 1`,
            [cleanUrl, mediaId || null, clipName || null]
        );
        if (queryRes.rows && queryRes.rows.length > 0) {
            mediaRow = queryRes.rows[0];
        }
    } catch (dbErr) {
        console.warn(`[ASSET] Aviso al consultar tabla Media: ${dbErr.message}`);
    }

    // 2. Resolver bucket y s3Key
    const bucket = mediaRow?.bucket || process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
    let s3Key = mediaRow?.s3Key;

    if (!s3Key) {
        // Intentar deducir la clave S3 a partir de la URL (soporta amazonaws.com y s3.amazonaws.com)
        const s3Regex = /https:\/\/[^/]+\.amazonaws\.com\/(.+)/i;
        const match = cleanUrl.match(s3Regex);
        if (match && match[1]) {
            s3Key = decodeURIComponent(match[1].split('?')[0]);
        }
    }

    // Si tenemos clave S3, descargar directamente vía AWS S3 Client
    if (s3Key) {
        try {
            console.log(`[ASSET] Descargando desde AWS S3 (Bucket: ${bucket}, Key: ${s3Key})`);
            const s3 = await getS3Client();
            const { GetObjectCommand } = await import('@aws-sdk/client-s3');
            const s3Response = await s3.send(new GetObjectCommand({
                Bucket: bucket,
                Key: s3Key
            }));

            const stream = createWriteStream(destPath);
            await pipeline(s3Response.Body, stream);

            const fileStat = await stat(destPath).catch(() => ({ size: 0 }));
            if (fileStat.size > 0) {
                console.log(`[ASSET] Descarga completada exitosamente desde S3: ${destPath} (${fileStat.size} bytes)`);
                return destPath;
            }
            console.warn(`[ASSET] Archivo descargado desde S3 está vacío, intentando vía HTTP...`);
        } catch (s3Err) {
            console.warn(`[ASSET] Falló descarga directa desde S3 (${s3Key}): ${s3Err.message}, reintentando vía HTTP...`);
        }
    }

    // 3. Descarga vía HTTP/HTTPS con reintentos
    let fetchUrl = cleanUrl;
    if (fetchUrl.startsWith('/')) {
        const baseUrl = process.env.PUBLIC_APP_URL || `http://127.0.0.1:${process.env.PORT || 5001}`;
        fetchUrl = `${baseUrl.replace(/\/$/, '')}${fetchUrl}`;
    }

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            console.log(`[ASSET] Intento ${attempt}/${maxRetries} descargando vía HTTP: ${fetchUrl.split('?')[0]}`);
            const res = await fetch(fetchUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (ClubPlatform VideoEditor/4.1153)',
                    'Accept': '*/*'
                }
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }

            const stream = createWriteStream(destPath);
            await pipeline(res.body, stream);

            const fileStat = await stat(destPath).catch(() => ({ size: 0 }));
            if (!fileStat.size || fileStat.size === 0) {
                throw new Error(`Archivo recibido vacío (0 bytes)`);
            }

            console.log(`[ASSET] Descarga completada exitosamente vía HTTP: ${destPath} (${fileStat.size} bytes)`);
            return destPath;
        } catch (err) {
            lastError = err;
            console.warn(`[ASSET] Intento ${attempt}/${maxRetries} falló (${err.message})`);
            if (attempt < maxRetries) {
                const backoffMs = attempt * 1200;
                await new Promise(r => setTimeout(r, backoffMs));
            }
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error(`Fallo tras ${maxRetries} intentos al descargar recurso "${clipName}": ${lastError?.message || 'Error desconocido'}`);
}

export async function downloadToFile(url, destPath, timeoutMs = 60_000) {
    return downloadMediaAsset(url, destPath, timeoutMs);
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
 * Normaliza una opacidad del modelo de estilos (0-100 %) a fracción (0-1).
 * Acepta fracciones ya normalizadas por compatibilidad.
 */
export function normalizeOpacityFraction(value, fallback = 1) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return fallback;
    const n = Number(value);
    if (n <= 1 && n >= 0) return n;
    return Math.max(0, Math.min(1, n / 100));
}

/**
 * Sanitiza una familia tipográfica CSS ("Inter, sans-serif", '"Bebas Neue", sans-serif')
 * al nombre de fuente simple que exige el force_style de FFmpeg (sin comas ni comillas).
 */
export function sanitizeFontName(fontFamily, fallback = 'Arial') {
    if (!fontFamily || typeof fontFamily !== 'string') return fallback;
    const first = fontFamily.split(',')[0].replace(/["']/g, '').trim();
    return first || fallback;
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
 * Resuelve el texto visible de un segmento para el idioma activo con el mismo
 * orden de prioridad que el frontend (getSegmentText): translations del
 * segmento, catálogo global, idioma de respaldo y, en último lugar, seg.text.
 * Contenido y estilo permanecen independientes.
 */
export function resolveActiveSubtitleText(segment, activeLang, subtitles, index = -1) {
    if (!segment) return '';
    const normActive = normalizeLanguageCode(activeLang || 'es');
    const normFallback = normalizeLanguageCode(subtitles?.sourceLanguage || subtitles?.language || 'es');
    const segIdLower = (segment.id || '').toLowerCase();

    // Determinar texto fuente original
    let sourceText = '';
    if (segment.translations && typeof segment.translations === 'object') {
        for (const [k, v] of Object.entries(segment.translations)) {
            if (normalizeLanguageCode(k) === normFallback && typeof v === 'string' && v.trim()) {
                sourceText = v.trim();
                break;
            }
        }
    }
    const catalog = subtitles?.translations;
    if (!sourceText && catalog && typeof catalog === 'object') {
        for (const [k, ver] of Object.entries(catalog)) {
            if (normalizeLanguageCode(k) === normFallback && Array.isArray(ver?.segments)) {
                const srcMatch = ver.segments.find(vs => 
                    (vs.id && segment.id && (vs.id === segment.id || (segIdLower && vs.id.toLowerCase() === segIdLower))) ||
                    (Math.abs(vs.start - segment.start) < 0.08 && Math.abs(vs.end - segment.end) < 0.08)
                ) || (index >= 0 ? ver.segments[index] : undefined);
                if (srcMatch?.text && typeof srcMatch.text === 'string' && srcMatch.text.trim()) {
                    sourceText = srcMatch.text.trim();
                    break;
                }
            }
        }
    }
    if (!sourceText && normActive !== normFallback && segment.text) {
        sourceText = segment.text.trim();
    }

    // 1. Si el idioma activo es el de respaldo (origen), devolver texto fuente
    if (normActive === normFallback) {
        if (sourceText) return sourceText;
        if (segment.translations && typeof segment.translations === 'object') {
            for (const [k, v] of Object.entries(segment.translations)) {
                if (normalizeLanguageCode(k) === normFallback && typeof v === 'string' && v.trim()) {
                    return v;
                }
            }
        }
        return segment.text || '';
    }

    // 2. Idioma activo es traducción: prioridad 1 al catálogo global de versiones (fuente canónica)
    if (catalog && typeof catalog === 'object') {
        for (const [k, ver] of Object.entries(catalog)) {
            if (normalizeLanguageCode(k) === normActive && Array.isArray(ver?.segments)) {
                const match = ver.segments.find(vs => 
                    (vs.id && segment.id && (vs.id === segment.id || (segIdLower && vs.id.toLowerCase() === segIdLower))) ||
                    (Math.abs(vs.start - segment.start) < 0.08 && Math.abs(vs.end - segment.end) < 0.08)
                ) || (index >= 0 ? ver.segments[index] : undefined);
                if (match?.text && typeof match.text === 'string' && match.text.trim()) {
                    const matchTrim = match.text.trim();
                    // Descartar si es idéntico al texto fuente original (contaminación)
                    if (!sourceText || matchTrim.toLowerCase() !== sourceText.toLowerCase()) {
                        return matchTrim;
                    }
                }
            }
        }
    }

    // Prioridad 2: translations del segmento en idioma activo (verificando no contaminación)
    if (segment.translations && typeof segment.translations === 'object') {
        for (const [k, v] of Object.entries(segment.translations)) {
            if (normalizeLanguageCode(k) === normActive && typeof v === 'string' && v.trim()) {
                const vTrim = v.trim();
                if (!sourceText || vTrim.toLowerCase() !== sourceText.toLowerCase()) {
                    return vTrim;
                }
            }
        }
    }

    // Prioridad 3: segment.text si ya contiene la traducción
    if (segment.text && segment.text.trim()) {
        const segTextTrim = segment.text.trim();
        if (!sourceText || segTextTrim.toLowerCase() !== sourceText.toLowerCase()) {
            return segTextTrim;
        }
    }

    // Prioridad 4: Fallback al texto fuente de respaldo
    return sourceText || segment.text || '';
}

/**
 * Genera la cadena force_style para el filtro de subtítulos de FFmpeg
 * mapeando fielmente las propiedades visuales y tipográficas configuradas por el usuario.
 */
export function buildSubtitleForceStyle(style = {}, videoHeight = 1080) {
    // 1. Tipografía y Tamaño (nombre simple: FFmpeg no admite listas con comas)
    const fontName = sanitizeFontName(style.fontFamily, 'Arial');
    const baseSize = Number(style.fontSize) || 36;
    // Escalar tamaño proporcionalmente al canvas de referencia (720p base)
    const fontSize = Math.max(14, Math.round(baseSize * (videoHeight / 720)));

    // 2. Peso y Estilos
    const isBold = (style.fontWeight && (Number(style.fontWeight) >= 600 || style.fontWeight === 'bold')) ? 1 : 0;
    const isItalic = style.fontStyle === 'italic' ? 1 : 0;
    const isUnderline = style.textDecoration === 'underline' ? 1 : 0;

    // 3. Colores (opacidades del modelo en 0-100 %)
    const primaryColor = cssColorToAss(style.color || '#ffffff', normalizeOpacityFraction(style.opacity, 1));

    // 4. Fondo vs Contorno/Sombra.
    // Habilitación derivada de las propiedades reales del modelo (backgroundEnabled,
    // strokeWidth > 0, sombra configurada): el panel nunca persiste flags
    // strokeEnabled/shadowEnabled, así que no pueden exigirse aquí.
    const bgTransparent = !style.backgroundColor || style.backgroundColor === 'transparent';
    const bgEnabled = style.backgroundEnabled !== false && !bgTransparent;
    const strokeEnabled = Number(style.strokeWidth) > 0 && !!style.strokeColor;
    const shadowConfigured = normalizeOpacityFraction(style.shadowOpacity, 0) > 0
        && ((Number(style.shadowBlur) || 0) > 0 || Number(style.shadowOffsetX) !== 0 || Number(style.shadowOffsetY) !== 0);

    let borderStyle = 1; // 1 = contorno + sombra
    let outline = 0;
    let outlineColor = '&H00000000';
    let shadow = 0;
    let backColor = '&H80000000';

    if (bgEnabled) {
        // Modo caja de fondo (BorderStyle 4)
        borderStyle = 4;
        backColor = cssColorToAss(style.backgroundColor || '#000000', normalizeOpacityFraction(style.backgroundOpacity, 0.75));
        outline = strokeEnabled ? Number(style.strokeWidth) : 1;
        outlineColor = backColor;
    } else {
        borderStyle = 1;
        if (strokeEnabled) {
            outline = Math.max(1, Number(style.strokeWidth) || 2);
            outlineColor = cssColorToAss(style.strokeColor || '#000000', 1);
        }
        if (shadowConfigured) {
            shadow = Math.max(1, Math.round((Number(style.shadowBlur) || 4) / 2));
            backColor = cssColorToAss(style.shadowColor || '#000000', normalizeOpacityFraction(style.shadowOpacity, 0.8));
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
 * Ejecuta el proceso de renderizado de forma asíncrona y actualiza el progreso en la base de datos
 * atravesando 9 etapas granulares con diagnóstico técnico y codificación optimizada.
 */
export async function renderProjectAsync(projectId) {
    let currentStage = 'Preparando archivos';

    const updateProgress = async (progress, stage, status = 'rendering') => {
        currentStage = stage;
        await db.query(
            `UPDATE "VideoEditorProject"
                SET "renderProgress" = $1, "renderStage" = $2, "renderStatus" = $3, status = $4, "updatedAt" = NOW()
              WHERE id = $5`,
            [progress, stage, status, status, projectId]
        );
    };

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

    const dir = await mkdtemp(path.join(tmpdir(), `v-editor-render-${projectId}-`));

    try {
        // ─── ETAPA 1: Preparando archivos (5%) ───
        currentStage = 'Preparando archivos';
        await updateProgress(5, 'Preparando archivos');

        const { width, height } = resolveDimensions(project.format, project.resolution);
        const tracks = Array.isArray(project.tracks) ? project.tracks : [];
        const clips = Array.isArray(project.clips) ? project.clips : [];
        const subtitles = project.subtitles || {};
        const activeLang = normalizeLanguageCode(subtitles.activeLanguage || subtitles.language || subtitles.sourceLanguage || 'es');
        const rawSegments = Array.isArray(subtitles.segments) ? subtitles.segments : [];

        // Texto del idioma activo con la misma prioridad que el frontend
        // (translations → catálogo → respaldo → seg.text). El estilo viaja intacto en `s.style`.
        const subtitleSegments = rawSegments.map((s, idx) => ({
            ...s,
            text: resolveActiveSubtitleText(s, activeLang, subtitles, idx)
        })).filter(s => s.text && s.text.trim().length > 0);

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

        // ─── ETAPA 2: Descargando recursos (15%) ───
        currentStage = 'Descargando recursos';
        await updateProgress(15, 'Descargando recursos');
        console.log(`[RENDER] Etapa 2: Descargando ${visualClips.length} recursos visuales y ${audioClips.length} pistas de audio`);

        const downloadedVisuals = [];
        for (let i = 0; i < visualClips.length; i++) {
            const clip = visualClips[i];
            const ext = clip.type === 'image' ? '.jpg' : '.mp4';
            const rawPath = path.join(dir, `clip_raw_${i}${ext}`);
            try {
                await downloadMediaAsset(clip, rawPath, 60_000);
            } catch (dlErr) {
                console.error(`[RENDER] Error crítico al descargar recurso visual #${i + 1} (${clip.name || clip.type}):`, dlErr.message);
                throw new Error(`Fallo al descargar recurso visual #${i + 1} (${clip.name || clip.type}): ${dlErr.message}`);
            }
            downloadedVisuals.push({ ...clip, rawPath });
        }

        // Descargar pistas de audio complementarias
        const downloadedAudios = [];
        for (let i = 0; i < audioClips.length; i++) {
            const clip = audioClips[i];
            const audioPath = path.join(dir, `audio_raw_${i}.mp3`);
            try {
                await downloadMediaAsset(clip, audioPath, 60_000);
                downloadedAudios.push({ ...clip, localPath: audioPath });
            } catch (dlAudioErr) {
                console.warn(`[RENDER] Aviso al descargar audio complementario #${i + 1}: ${dlAudioErr.message}`);
            }
        }

        // Preflight de integridad de activos descargados
        for (let i = 0; i < downloadedVisuals.length; i++) {
            const v = downloadedVisuals[i];
            const s = await stat(v.rawPath).catch(() => null);
            if (!s || s.size === 0) {
                throw new Error(`[RENDER] Preflight falló: el recurso visual #${i + 1} (${v.name || v.type}) está vacío o no se guardó correctamente en disco.`);
            }
            console.log(`[RENDER] Preflight verificado: recurso visual #${i + 1} (${v.name || v.type}) en disco: ${s.size} bytes`);
        }

        // ─── ETAPA 3: Normalizando video (35%) ───
        currentStage = 'Normalizando video';
        await updateProgress(35, 'Normalizando video');

        const localClips = [];
        for (let i = 0; i < downloadedVisuals.length; i++) {
            const clip = downloadedVisuals[i];
            const normPath = path.join(dir, `clip_norm_${i}.mp4`);
            const duration = Math.max(0.5, Number(clip.duration) || 5);
            const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1`;

            if (clip.type === 'image') {
                // Animar imagen fija como clip de video con duración especificada
                await runFfmpeg([
                    '-loop', '1',
                    '-i', clip.rawPath,
                    '-t', String(duration),
                    '-vf', scaleFilter,
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '22',
                    '-threads', '0',
                    '-pix_fmt', 'yuv420p',
                    '-y', normPath
                ], { timeoutMs: 120_000, label: `normalize-image-${i}` });
            } else {
                // Normalizar video asegurando -ss antes de -i, -t después de -i, y preset veloz
                const seekArgs = [];
                if (clip.trimStart && Number(clip.trimStart) > 0) {
                    seekArgs.push('-ss', String(clip.trimStart));
                }

                await runFfmpeg([
                    ...seekArgs,
                    '-i', clip.rawPath,
                    '-t', String(duration),
                    '-vf', scaleFilter,
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '22',
                    '-threads', '0',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-ar', '44100',
                    '-ac', '2',
                    '-pix_fmt', 'yuv420p',
                    '-avoid_negative_ts', 'make_zero',
                    '-y', normPath
                ], { timeoutMs: 120_000, label: `normalize-video-${i}` });
            }

            localClips.push({ ...clip, localPath: normPath, duration });
        }

        // ─── ETAPA 4: Procesando audio (50%) ───
        currentStage = 'Procesando audio';
        await updateProgress(50, 'Procesando audio');

        // ─── ETAPA 5: Componiendo línea de tiempo (65%) ───
        currentStage = 'Componiendo línea de tiempo';
        await updateProgress(65, 'Componiendo línea de tiempo');

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
        ], { timeoutMs: 90_000, label: 'concat-visual-clips' });

        // ─── ETAPA 6: Renderizando subtítulos (75%) ───
        currentStage = 'Renderizando subtítulos';
        await updateProgress(75, 'Renderizando subtítulos');

        let subbedVideoPath = mergedVideoPath;
        if (subtitleSegments.length > 0) {
            console.log(`[RENDER] Etapa 6: Renderizando ${subtitleSegments.length} segmentos de subtítulos en idioma activo (${activeLang}): "${subtitleSegments[0]?.text?.slice(0, 40)}..."`);
            const srtPath = path.join(dir, 'subtitles.srt');
            const srtContent = generateSrtContent(subtitleSegments);
            await writeFile(srtPath, srtContent, 'utf8');

            const outSubbed = path.join(dir, 'subbed_video.mp4');

            // Resolver estilo efectivo de subtítulos: estilo global o primer segmento personalizado
            const firstStyledSegment = subtitleSegments.find(s => s.style && Object.keys(s.style).length > 0);
            const effectiveSubtitleStyle = {
                ...(subtitles.style || {}),
                ...(firstStyledSegment?.style || {})
            };
            const forceStyleStr = buildSubtitleForceStyle(effectiveSubtitleStyle, height);
            const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');

            // Incrustar subtítulos con aceleración y estilo visual fiel
            await runFfmpeg([
                '-i', mergedVideoPath,
                '-vf', `subtitles=filename='${escapedSrtPath}':force_style='${forceStyleStr}'`,
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '22',
                '-threads', '0',
                '-c:a', 'copy',
                '-pix_fmt', 'yuv420p',
                '-y', outSubbed
            ], { timeoutMs: 120_000, label: 'burn-subtitles' }).catch(async (burnErr) => {
                console.warn('[VideoEditorRender] Fallback burn subtitles sin copy de audio:', burnErr.message);
                await runFfmpeg([
                    '-i', mergedVideoPath,
                    '-vf', `subtitles=filename='${escapedSrtPath}':force_style='${forceStyleStr}'`,
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '22',
                    '-threads', '0',
                    '-pix_fmt', 'yuv420p',
                    '-y', outSubbed
                ], { timeoutMs: 120_000, label: 'burn-subtitles-fallback' });
            });

            subbedVideoPath = outSubbed;
        }

        // ─── ETAPA 7: Codificando video (85%) ───
        currentStage = 'Codificando video';
        await updateProgress(85, 'Codificando video');

        const outputVideoPath = path.join(dir, 'final_rendered.mp4');
        if (downloadedAudios.length > 0) {
            const primaryAudio = downloadedAudios[0];
            const audioVolume = Number(primaryAudio.volume ?? 80) / 100;

            await runFfmpeg([
                '-i', subbedVideoPath,
                '-i', primaryAudio.localPath,
                '-filter_complex', `[1:a]volume=${audioVolume}[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
                '-map', '0:v',
                '-map', '[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                '-y', outputVideoPath
            ], { timeoutMs: 90_000, label: 'mix-audio-tracks' }).catch(async () => {
                await runFfmpeg([
                    '-i', subbedVideoPath,
                    '-i', primaryAudio.localPath,
                    '-filter_complex', `[1:a]volume=${audioVolume}[aout]`,
                    '-map', '0:v',
                    '-map', '[aout]',
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-shortest',
                    '-movflags', '+faststart',
                    '-y', outputVideoPath
                ], { timeoutMs: 90_000, label: 'mix-single-audio' });
            });
        } else {
            // Optimizar contenedor final con +faststart preservando audio original
            await runFfmpeg([
                '-i', subbedVideoPath,
                '-c', 'copy',
                '-movflags', '+faststart',
                '-y', outputVideoPath
            ], { timeoutMs: 60_000, label: 'finalize-faststart-copy' }).catch(async () => {
                await runFfmpeg([
                    '-i', subbedVideoPath,
                    '-f', 'lavfi',
                    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-shortest',
                    '-movflags', '+faststart',
                    '-y', outputVideoPath
                ], { timeoutMs: 60_000, label: 'finalize-faststart-silent' });
            });
        }

        // ─── ETAPA 8: Generando archivo final (95%) ───
        currentStage = 'Generando archivo final';
        await updateProgress(95, 'Generando archivo final');

        // Extraer fotograma póster / miniatura
        const posterPath = path.join(dir, 'poster.jpg');
        await runFfmpeg([
            '-y',
            '-ss', '1',
            '-i', outputVideoPath,
            '-frames:v', '1',
            '-q:v', '2',
            posterPath
        ], { timeoutMs: 20_000, label: 'extract-poster' }).catch(async () => {
            await runFfmpeg([
                '-y',
                '-ss', '0',
                '-i', outputVideoPath,
                '-frames:v', '1',
                '-q:v', '2',
                posterPath
            ], { timeoutMs: 20_000, label: 'extract-poster-0' });
        });

        // Subir a S3 y registrar en la Biblioteca Multimedia de Club Platform
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

        const totalDuration = localClips.reduce((acc, c) => acc + (Number(c.duration) || 0), 0);

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

        // ─── ETAPA 9: Completado (100%) ───
        currentStage = 'Completado';
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
        console.error(`[VideoEditorRender] Error en etapa "${currentStage}" para el proyecto ${projectId}:`, err);
        const stderrSnippet = err.ffmpeg?.stderrTail
            ? ` — Diagnóstico: ${err.ffmpeg.stderrTail.split('\n').filter(Boolean).slice(-3).join(' ')}`
            : '';
        const userFriendlyDetail = `[${currentStage}] ${err.message}${stderrSnippet}`.slice(0, 1000);

        await db.query(
            `UPDATE "VideoEditorProject"
                SET "renderStatus" = 'error',
                    "renderStage" = $1,
                    status = 'error',
                    "errorDetail" = $2,
                    "updatedAt" = NOW()
              WHERE id = $3`,
            [currentStage, userFriendlyDetail, projectId]
        );
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}
