// ════════════════════════════════════════════════════════════════════════════
// Motor de Transcripción y Subtítulos con IA — v4.1144.0
//
// Extrae el audio de clips de video o pistas de audio, detecta el idioma
// hablado, transcribe la voz con marcas de tiempo (timestamps) de alta precisión,
// ajusta los desfases según la posición del clip en la línea de tiempo y
// genera segmentos sincronizados para la pista de subtítulos con persistencia.
//
// Proveedores: OpenAI Whisper (prioritario si está configurado) con fallback
// automático a Google Gemini (gemini-2.5-flash / gemini-1.5-flash).
// ════════════════════════════════════════════════════════════════════════════

import { runFfmpeg } from './reelFfmpeg.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import db from './db.js';
import { decryptKey } from './ai-router.js';
import { getUploadDeps } from '../routes/media.js';

/**
 * Error tipado con códigos técnicos estandarizados para telemetría y UI.
 */
export class SubtitleError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = 'SubtitleError';
        this.code = code;
        this.details = details;
    }
}

/**
 * Resuelve las credenciales de IA disponibles en el entorno (.env)
 * o guardadas de forma segura en la tabla ai_model_configs de PostgreSQL.
 */
export async function resolveTranscriptionCredentials() {
    let openaiKey = process.env.OPENAI_API_KEY || null;
    let geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;

    // Buscar en la base de datos si falta alguna credencial en process.env
    try {
        const dbConfigs = await db.query(
            `SELECT provider, api_key_enc FROM ai_model_configs WHERE is_active = TRUE AND api_key_enc IS NOT NULL`
        );
        for (const row of dbConfigs.rows || []) {
            if (row.provider === 'openai' && !openaiKey && row.api_key_enc) {
                openaiKey = decryptKey(row.api_key_enc);
            }
            if ((row.provider === 'google' || row.provider === 'gemini') && !geminiKey && row.api_key_enc) {
                geminiKey = decryptKey(row.api_key_enc);
            }
        }
    } catch (_) {
        // Ignorar si la tabla aún no existe o el pool local no conecta
    }

    if (!openaiKey && !geminiKey) {
        throw new SubtitleError(
            'MISSING_AI_CREDENTIALS',
            'No hay credenciales activas de IA configuradas para transcripción. Configura OPENAI_API_KEY o GEMINI_API_KEY en Integraciones → Modelos IA.'
        );
    }

    return { openaiKey, geminiKey };
}

/**
 * Descarga el archivo de video o audio al sistema de archivos local temporal.
 * Soporta claves de S3, URLs de S3 públicas o privadas, URLs relativas y URLs HTTP/HTTPS externas.
 */
export async function downloadMediaSource(mediaUrlOrKey, targetDir) {
    if (!mediaUrlOrKey || typeof mediaUrlOrKey !== 'string') {
        throw new SubtitleError('SUBTITLE_SOURCE_NOT_FOUND', 'URL o identificador de multimedia inválido');
    }

    const cleanInput = mediaUrlOrKey.trim();
    const destPath = path.join(targetDir, `source_media_${Date.now()}`);

    // 1. Verificar si coincide con un registro en la tabla Media
    let mediaRow = null;
    try {
        const queryRes = await db.query(
            `SELECT id, filename, url, "s3Key", bucket, mimetype, type 
               FROM "Media" 
              WHERE url = $1 OR "s3Key" = $1 OR id::text = $1 
              LIMIT 1`,
            [cleanInput]
        );
        if (queryRes.rows && queryRes.rows.length > 0) {
            mediaRow = queryRes.rows[0];
        }
    } catch (_) {
        // Continuar con resolución por URL directa
    }

    // 2. Descargar desde AWS S3 si tenemos clave o registro Media
    let downloadedFromS3 = false;
    const bucket = mediaRow?.bucket || process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
    let s3Key = mediaRow?.s3Key;

    if (!s3Key) {
        // Intentar deducir la clave S3 a partir de la URL
        const s3Regex = /https:\/\/[^/]+\.amazonaws\.com\/(.+)/i;
        const match = cleanInput.match(s3Regex);
        if (match && match[1]) {
            s3Key = decodeURIComponent(match[1].split('?')[0]);
        }
    }

    if (s3Key) {
        try {
            const { s3, GetObjectCommand } = await getUploadDeps();
            const s3Response = await s3.send(new GetObjectCommand({
                Bucket: bucket,
                Key: s3Key
            }));

            const ws = createWriteStream(destPath);
            await pipeline(s3Response.Body, ws);
            downloadedFromS3 = true;
        } catch (s3Err) {
            console.warn(`[VideoEditorTranscription] Falló descarga directa desde S3 (${s3Key}):`, s3Err.message);
        }
    }

    // 3. Si no se descargó de S3, descargar por HTTP / HTTPS
    if (!downloadedFromS3) {
        let fetchUrl = cleanInput;
        if (fetchUrl.startsWith('/')) {
            const baseUrl = process.env.PUBLIC_APP_URL || `http://127.0.0.1:${process.env.PORT || 5001}`;
            fetchUrl = `${baseUrl.replace(/\/$/, '')}${fetchUrl}`;
        }

        try {
            const res = await fetch(fetchUrl, {
                signal: AbortSignal.timeout(60_000)
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const ws = createWriteStream(destPath);
            await pipeline(res.body, ws);
        } catch (fetchErr) {
            throw new SubtitleError(
                'SUBTITLE_SOURCE_NOT_FOUND',
                `No pudimos acceder al archivo de video para transcribir (${fetchErr.message})`,
                fetchErr.message
            );
        }
    }

    // 4. Validar el archivo descargado
    try {
        const fileStats = await stat(destPath);
        if (fileStats.size < 100) {
            throw new SubtitleError('UNSUPPORTED_MEDIA', 'El archivo multimedia obtenido está vacío o corrupto');
        }
        if (fileStats.size > 150 * 1024 * 1024) {
            throw new SubtitleError('FILE_TOO_LARGE', 'El archivo supera el tamaño máximo permitido de 150MB');
        }
        return {
            localFilePath: destPath,
            sizeBytes: fileStats.size,
            filename: mediaRow?.filename || path.basename(cleanInput.split('?')[0])
        };
    } catch (statErr) {
        if (statErr instanceof SubtitleError) throw statErr;
        throw new SubtitleError('SUBTITLE_SOURCE_NOT_FOUND', `Archivo no disponible en disco: ${statErr.message}`);
    }
}

/**
 * Extrae y normaliza el audio a MP3 mono 16kHz optimizado para modelos de reconocimiento de voz.
 * Si FFmpeg no está disponible o falla, proporciona fallback a ingesta directa del archivo multimedia.
 */
export async function prepareAudioOrMedia(localFilePath, targetDir) {
    const outputPath = path.join(targetDir, 'extracted_audio.mp3');

    // Intentar extracción de audio con FFmpeg
    try {
        await runFfmpeg([
            '-i', localFilePath,
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-c:a', 'libmp3lame',
            '-b:a', '64k',
            '-y', outputPath
        ], { timeoutMs: 60_000, label: 'extract-audio-transcription' });

        const buffer = await readFile(outputPath);
        if (buffer && buffer.length > 500) {
            return {
                buffer,
                mimeType: 'audio/mp3',
                wasExtracted: true
            };
        }
    } catch (ffmpegErr) {
        console.warn('[VideoEditorTranscription] Extracción FFmpeg no disponible o fallida, probando fallback directo:', ffmpegErr.message);
    }

    // Fallback directo: leer el archivo descargado tal cual si está dentro del límite de tamaño
    try {
        const rawBuffer = await readFile(localFilePath);
        const ext = path.extname(localFilePath).toLowerCase();
        const isAudio = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'].includes(ext);
        const mimeType = isAudio
            ? (ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mp3')
            : 'video/mp4';

        if (rawBuffer.length <= 25 * 1024 * 1024) {
            return {
                buffer: rawBuffer,
                mimeType,
                wasExtracted: false
            };
        }

        throw new SubtitleError(
            'AUDIO_EXTRACTION_FAILED',
            'No se pudo extraer la pista de audio y el archivo es demasiado grande para ingesta directa.'
        );
    } catch (readErr) {
        if (readErr instanceof SubtitleError) throw readErr;
        throw new SubtitleError(
            'AUDIO_EXTRACTION_FAILED',
            `Fallo al preparar audio para transcripción: ${readErr.message}`
        );
    }
}

/**
 * Transcribe el audio utilizando OpenAI Whisper API (verbose_json con marcas de tiempo).
 */
export async function transcribeWithWhisper({ audioBuffer, mimeType, apiKey, languageHint = 'es' }) {
    const formData = new FormData();
    const fileName = mimeType.startsWith('video') ? 'video.mp4' : 'audio.mp3';
    const blob = new Blob([audioBuffer], { type: mimeType });

    formData.append('file', blob, fileName);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    if (languageHint) {
        formData.append('language', languageHint);
    }
    formData.append('prompt', 'Rotary International, Club Rotario, proyectos, servicio comunitario, liderazgo humanitario.');

    let res;
    try {
        res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData,
            signal: AbortSignal.timeout(75_000)
        });
    } catch (fetchErr) {
        if (fetchErr.name === 'TimeoutError') {
            throw new SubtitleError('TRANSCRIPTION_TIMEOUT', 'La transcripción con Whisper tardó demasiado tiempo.');
        }
        throw new SubtitleError('TRANSCRIPTION_PROVIDER_ERROR', `Error de conexión con OpenAI Whisper: ${fetchErr.message}`);
    }

    if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new SubtitleError(
            'TRANSCRIPTION_PROVIDER_ERROR',
            `OpenAI Whisper API error (${res.status}): ${errorText}`
        );
    }

    const data = await res.json().catch(() => ({}));
    const fullText = (data.text || '').trim();
    const detectedLang = data.language || languageHint || 'es';

    const segments = (data.segments || []).map((seg, idx) => ({
        id: `sub-${idx + 1}`,
        start: Math.max(0, Number(seg.start) || 0),
        end: Math.max(Number(seg.start || 0) + 0.5, Number(seg.end) || 0),
        text: String(seg.text || '').trim()
    })).filter(s => s.text.length > 0);

    return {
        transcript: fullText,
        language: detectedLang,
        segments: segments.length > 0
            ? segments
            : (fullText ? [{ id: 'sub-1', start: 0, end: 4, text: fullText }] : []),
        provider: 'openai-whisper'
    };
}

/**
 * Respaldo con Google Gemini (soporta audio y video multimodal nativo con marcas de tiempo).
 */
export async function transcribeWithGemini({ mediaBuffer, mimeType, apiKey, languageHint = 'es' }) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];

    const base64Data = mediaBuffer.toString('base64');
    const prompt = `Actúa como un transcriptor profesional de audio para subtítulos sincronizados de video.
El idioma principal del contenido es "${languageHint || 'es'}".
Analiza la voz hablada y devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura exacta:
{
  "language": "${languageHint || 'es'}",
  "transcript": "Transcripción completa y exacta de la voz...",
  "segments": [
    {
      "id": "sub-1",
      "start": 0.0,
      "end": 2.8,
      "text": "Frase hablada con timestamps sincronizados"
    }
  ]
}

Reglas obligatorias:
1. Divide la transcripción en segmentos legibles de 3 a 8 palabras (máximo 45 caracteres por segmento).
2. Los valores "start" y "end" deben ser números reales en segundos exactos (ejemplo: 0.8, 3.4).
3. "end" debe ser estrictamente mayor que "start".
4. El primer segmento debe comenzar en el segundo en que inicia la voz hablada.
5. Si no hay voz inteligible en el archivo, devuelve "segments": [] y "transcript": "".
6. Devuelve EXCLUSIVAMENTE el JSON, sin texto explicativo previo ni posterior ni bloques de código adicionales.`;

    let lastError = null;

    for (const modelId of candidateModels) {
        try {
            const model = genAI.getGenerativeModel({ model: modelId });
            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType || 'audio/mp3'
                    }
                }
            ]);

            const rawText = result.response.text().trim();
            let jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

            const firstBrace = jsonText.indexOf('{');
            const lastBrace = jsonText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonText = jsonText.slice(firstBrace, lastBrace + 1);
            }

            const parsed = JSON.parse(jsonText);
            const fullTranscript = String(parsed.transcript || '').trim();
            const segments = (parsed.segments || []).map((seg, idx) => ({
                id: seg.id || `sub-${idx + 1}`,
                start: Math.max(0, Number(seg.start) || 0),
                end: Math.max(Number(seg.start || 0) + 0.5, Number(seg.end) || 0),
                text: String(seg.text || '').trim()
            })).filter(s => s.text.length > 0);

            return {
                transcript: fullTranscript,
                language: parsed.language || languageHint || 'es',
                segments: segments.length > 0
                    ? segments
                    : (fullTranscript ? [{ id: 'sub-1', start: 0, end: 4, text: fullTranscript }] : []),
                provider: `gemini (${modelId})`
            };
        } catch (err) {
            lastError = err;
            console.warn(`[VideoEditorTranscription] Gemini modelo ${modelId} falló:`, err.message);
        }
    }

    throw new SubtitleError(
        'TRANSCRIPTION_PROVIDER_ERROR',
        `Google Gemini no pudo transcribir el audio: ${lastError?.message || 'Error desconocido'}`
    );
}

/**
 * Función principal: orquesta la descarga, extracción de audio, reconocimiento con IA,
 * transformación de timestamps según el inicio del clip en la línea de tiempo y persistencia.
 */
export async function transcribeMedia(mediaUrlOrPath, options = {}) {
    const { clipStartTime = 0, language = 'es' } = options;
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rotary-subtitles-'));

    try {
        // 1. Descargar recurso multimedia a disco local
        const { localFilePath } = await downloadMediaSource(mediaUrlOrPath, tempDir);

        // 2. Extraer o preparar el audio normalizado
        const { buffer, mimeType } = await prepareAudioOrMedia(localFilePath, tempDir);

        // 3. Resolver credenciales de IA
        const { openaiKey, geminiKey } = await resolveTranscriptionCredentials();

        // 4. Ejecutar transcripción (Whisper prioritario, fallback a Gemini)
        let result;
        if (openaiKey) {
            try {
                result = await transcribeWithWhisper({
                    audioBuffer: buffer,
                    mimeType,
                    apiKey: openaiKey,
                    languageHint: language
                });
            } catch (whisperErr) {
                console.warn('[VideoEditorTranscription] Whisper falló, recurriendo a Gemini:', whisperErr.message);
                if (geminiKey) {
                    result = await transcribeWithGemini({
                        mediaBuffer: buffer,
                        mimeType,
                        apiKey: geminiKey,
                        languageHint: language
                    });
                } else {
                    throw whisperErr;
                }
            }
        } else if (geminiKey) {
            result = await transcribeWithGemini({
                mediaBuffer: buffer,
                mimeType,
                apiKey: geminiKey,
                languageHint: language
            });
        }

        if (!result) {
            throw new SubtitleError('INVALID_TRANSCRIPTION_RESPONSE', 'No se obtuvo respuesta válida del motor de IA');
        }

        // 5. Aplicar desfase temporal si el clip no comienza en 00:00 del proyecto
        const offsetSec = Math.max(0, Number(clipStartTime) || 0);
        const adjustedSegments = (result.segments || []).map((seg, idx) => {
            const rawStart = Number(seg.start) || 0;
            const rawEnd = Number(seg.end) || (rawStart + 2);
            return {
                id: seg.id || `sub-${idx + 1}`,
                start: Number((offsetSec + rawStart).toFixed(2)),
                end: Number((offsetSec + Math.max(rawStart + 0.5, rawEnd)).toFixed(2)),
                text: seg.text
            };
        });

        return {
            transcript: result.transcript,
            language: result.language,
            segments: adjustedSegments,
            provider: result.provider,
            count: adjustedSegments.length
        };
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}
