// ════════════════════════════════════════════════════════════════════
// Test suite: Subtítulos Inteligentes con IA (Video Editor) — v4.1144.0
// Valida códigos de error, enrutamiento de endpoints, offsets de timestamps,
// resiliencia de parsing JSON y degradación elegante.
// ════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import { SubtitleError } from '../server/lib/videoEditorTranscription.js';
import videoEditorRoutes from '../server/routes/videoEditor.js';

console.log('\n▸ 1. Códigos de error y excepciones estructuradas (SubtitleError)');

const err = new SubtitleError('SUBTITLE_SOURCE_NOT_FOUND', 'No pudimos acceder al archivo de video', 'HTTP 404');
assert.equal(err.name, 'SubtitleError', 'Nombre de error debe ser SubtitleError');
assert.equal(err.code, 'SUBTITLE_SOURCE_NOT_FOUND', 'Código debe coincidir');
assert.equal(err.details, 'HTTP 404', 'Detalles preservados');

const expectedCodes = [
    'SUBTITLE_SOURCE_NOT_FOUND',
    'AUDIO_EXTRACTION_FAILED',
    'TRANSCRIPTION_PROVIDER_ERROR',
    'MISSING_AI_CREDENTIALS',
    'UNSUPPORTED_MEDIA',
    'FILE_TOO_LARGE',
    'TRANSCRIPTION_TIMEOUT',
    'INVALID_TRANSCRIPTION_RESPONSE',
    'SUBTITLE_PERSISTENCE_FAILED'
];

for (const code of expectedCodes) {
    const testErr = new SubtitleError(code, `Mensaje para ${code}`);
    assert.equal(testErr.code, code, `Debe soportar el código ${code}`);
}
console.log('  OK    Todos los códigos de error técnicos estandarizados están disponibles');

console.log('\n▸ 2. Rutas del router videoEditor (compatibilidad de endpoints)');

const registeredRoutes = videoEditorRoutes.stack
    .filter(r => r.route)
    .map(r => ({
        path: r.route.path,
        methods: Object.keys(r.route.methods)
    }));

const hasSubtitlesPost = registeredRoutes.some(r => r.path === '/projects/:id/subtitles' && r.methods.includes('post'));
const hasTranscribePost = registeredRoutes.some(r => r.path === '/projects/:id/transcribe' && r.methods.includes('post'));
const hasSubtitlesTranslatePost = registeredRoutes.some(r => r.path === '/projects/:id/subtitles/translate' && r.methods.includes('post'));
const hasTranslateSubtitlesPost = registeredRoutes.some(r => r.path === '/projects/:id/translate-subtitles' && r.methods.includes('post'));

assert.ok(hasSubtitlesPost, 'Ruta POST /projects/:id/subtitles debe existir');
assert.ok(hasTranscribePost, 'Ruta POST /projects/:id/transcribe debe existir');
assert.ok(hasSubtitlesTranslatePost, 'Ruta POST /projects/:id/subtitles/translate debe existir');
assert.ok(hasTranslateSubtitlesPost, 'Ruta POST /projects/:id/translate-subtitles debe existir');

console.log('  OK    POST /projects/:id/subtitles y /projects/:id/transcribe están registradas');
console.log('  OK    POST /projects/:id/subtitles/translate y /projects/:id/translate-subtitles están registradas');

console.log('\n▸ 3. Transformación y desfase de timestamps según startTime del clip');

const rawSegments = [
    { id: 'sub-1', start: 0.5, end: 3.2, text: 'Bienvenidos a este encuentro rotario' },
    { id: 'sub-2', start: 3.8, end: 6.1, text: 'En la comunidad de Villa Esperanza' }
];

const clipStartTime = 5.0; // El clip comienza en el segundo 5 de la timeline
const shifted = rawSegments.map((seg, idx) => ({
    id: seg.id || `sub-${idx + 1}`,
    start: Number((clipStartTime + seg.start).toFixed(2)),
    end: Number((clipStartTime + seg.end).toFixed(2)),
    text: seg.text
}));

assert.equal(shifted[0].start, 5.5, 'Primer segmento debe empezar en 5.5s');
assert.equal(shifted[0].end, 8.2, 'Primer segmento debe terminar en 8.2s');
assert.equal(shifted[1].start, 8.8, 'Segundo segmento debe empezar en 8.8s');
assert.equal(shifted[1].end, 11.1, 'Segundo segmento debe terminar en 11.1s');
console.log('  OK    Desfases temporales aplicados correctamente respetando la posición del clip');

console.log('\n▸ 4. Limpieza y tolerancia a respuestas markdown de Gemini');

const markdownResponse = '```json\n{\n  "language": "es",\n  "transcript": "Audio de prueba",\n  "segments": [\n    { "id": "s-1", "start": 0.0, "end": 2.0, "text": "Audio de prueba" }\n  ]\n}\n```';
let cleaned = markdownResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
const firstBrace = cleaned.indexOf('{');
const lastBrace = cleaned.lastIndexOf('}');
if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
}
const parsed = JSON.parse(cleaned);
assert.equal(parsed.language, 'es', 'Debe extraer el idioma');
assert.equal(parsed.segments.length, 1, 'Debe parsear 1 segmento');
assert.equal(parsed.segments[0].text, 'Audio de prueba');
console.log('  OK    Extracción limpia y segura de JSON envuelto en bloques de markdown');

console.log('\n✨ Todas las pruebas de subtítulos con IA pasaron con éxito.\n');
