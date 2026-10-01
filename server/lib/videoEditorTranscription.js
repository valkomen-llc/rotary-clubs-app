// ════════════════════════════════════════════════════════════════════════════
// Motor de Transcripción y Subtítulos con IA — v4.1141.0
//
// Extrae el audio de clips de video o pistas de audio, detecta el idioma
// hablado, transcribe la voz con marcas de tiempo (timestamps) y genera
// segmentos editables para la pista de subtítulos.
// ════════════════════════════════════════════════════════════════════════════

import { runFfmpeg } from './reelFfmpeg.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Extrae y normaliza el audio de un archivo o URL a MP3 mono 16kHz optimizado para Whisper / Gemini.
 */
export async function extractAudioFromMedia(inputPathOrUrl) {
    const dir = await mkdtemp(path.join(tmpdir(), 'v-editor-audio-'));
    const outputPath = path.join(dir, 'extracted.mp3');

    try {
        await runFfmpeg([
            '-i', inputPathOrUrl,
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-c:a', 'libmp3lame',
            '-b:a', '64k',
            '-y', outputPath
        ], { timeoutMs: 45_000, label: 'extract-audio-transcription' });

        const buffer = await readFile(outputPath);
        return { buffer, tempDir: dir };
    } catch (err) {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        throw new Error(`Error extrayendo audio: ${err.message}`);
    }
}

/**
 * Transcribe un buffer de audio utilizando OpenAI Whisper API con marcas de tiempo detalladas.
 */
async function transcribeWithWhisper(audioBuffer) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY no configurada');
    }

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
    formData.append('file', blob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('prompt', 'Rotary International, Club Rotario, proyectos, servicio comunitario, liderazgo.');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData,
        signal: AbortSignal.timeout(60_000)
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Whisper API error (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    const fullText = (data.text || '').trim();
    const detectedLang = data.language || 'es';

    const segments = (data.segments || []).map((seg, idx) => ({
        id: `sub-${idx + 1}`,
        start: Number(seg.start) || 0,
        end: Number(seg.end) || 0,
        text: (seg.text || '').trim()
    })).filter(s => s.text.length > 0);

    return {
        transcript: fullText,
        language: detectedLang,
        segments: segments.length > 0 ? segments : (fullText ? [{ id: 'sub-1', start: 0, end: 5, text: fullText }] : []),
        provider: 'openai-whisper'
    };
}

/**
 * Respaldo con Gemini 2.5 Flash en caso de que Whisper no esté disponible.
 */
async function transcribeWithGemini(audioBuffer) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('Ni OPENAI_API_KEY ni GEMINI_API_KEY están disponibles.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const base64Audio = audioBuffer.toString('base64');
    const prompt = `Analiza este audio y devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{
  "language": "es",
  "transcript": "Transcripción completa y exacta de la voz...",
  "segments": [
    {
      "id": "sub-1",
      "start": 0.0,
      "end": 3.2,
      "text": "Frase hablada con timestamps sincronizados"
    }
  ]
}
Cada segmento debe contener entre 3 y 8 palabras para lectura fluida de subtítulos en video. No agregues bloques de formato markdown ni explicaciones adicionales.`;

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: base64Audio,
                mimeType: 'audio/mp3'
            }
        }
    ]);

    const rawResponse = result.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');

    const parsed = JSON.parse(rawResponse);
    return {
        transcript: parsed.transcript || '',
        language: parsed.language || 'es',
        segments: Array.isArray(parsed.segments) ? parsed.segments : [],
        provider: 'gemini-flash'
    };
}

/**
 * Transcribe un archivo o URL de audio/video de forma resiliente.
 */
export async function transcribeMedia(mediaUrlOrPath) {
    const { buffer, tempDir } = await extractAudioFromMedia(mediaUrlOrPath);

    try {
        let result;
        if (process.env.OPENAI_API_KEY) {
            try {
                result = await transcribeWithWhisper(buffer);
            } catch (wErr) {
                console.warn('[VideoEditorTranscription] Whisper falló, probando Gemini:', wErr.message);
                result = await transcribeWithGemini(buffer);
            }
        } else {
            result = await transcribeWithGemini(buffer);
        }
        return result;
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}
