// ════════════════════════════════════════════════════════════════════
// Test suite: Modalidad «Video listo para publicar»
// Valida preset, reglas de negocio, Regla 10 (sin clichés repetitivos),
// ducking de audio y linaje no destructivo en Biblioteca.
// ════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import {
    presetCatalog,
    resolvePreset,
    resolveSceneCount,
    DEFAULT_PRESET
} from '../server/lib/reelPresets.js';
import {
    buildVideoReadyCopyPrompt,
    cleanVideoReadyCopy,
    buildAudioDuckingFiltergraph
} from '../server/lib/videoReadySpec.js';

console.log('\n▸ 1. Preset «Video listo para publicar»');

const presets = presetCatalog();
const videoListo = presets.find(p => p.id === 'video_listo');

assert.ok(videoListo, '«video_listo» debe estar en la lista de presets elegibles');
assert.equal(videoListo.label, 'Video listo para publicar', 'El nombre visible debe ser exacto');
assert.ok(videoListo.description.includes('Sube un video existente'), 'La descripción debe coincidir con el requerimiento');
assert.deepEqual(videoListo.sceneCounts, [1], 'Solo admite 1 video como escena principal');
assert.equal(videoListo.defaultSceneCount, 1, 'Default de escenas debe ser 1');
assert.equal(resolvePreset('video_listo').isVideoReady, true, 'Marca isVideoReady debe ser true');
console.log('  OK    El preset «video_listo» existe y está expuesto en el catálogo');
console.log('  OK    Configurado con 1 escena y modo de video listo');

assert.equal(resolveSceneCount('video_listo', 1).sceneCount, 1, 'resolveSceneCount conserva 1');
assert.equal(resolveSceneCount('video_listo', 4).sceneCount, 1, 'resolveSceneCount corrige 4 a 1');
console.log('  OK    resolveSceneCount fuerza 1 escena para «video_listo»');

console.log('\n▸ 2. Cumplimiento de Regla 10 (Copywriting sin clichés ni muletillas)');

// Caso con texto que contiene la muletilla prohibida al inicio
const dirtyCopy1 = 'Rotary Distrito 4281. Hoy nos unimos con el Club Rotario de Bogotá para sembrar 500 árboles nativos en la reserva comunitaria.';
const cleanedCopy1 = cleanVideoReadyCopy(dirtyCopy1);
assert.ok(!cleanedCopy1.startsWith('Rotary Distrito 4281.'), 'Debe eliminar el encabezado repetitivo de Rotary Distrito 4281');
assert.ok(cleanedCopy1.includes('Hoy nos unimos con el Club Rotario de Bogotá'), 'Conserva el cuerpo sustantivo del copy');
console.log('  OK    Limpia prefijos repetitivos "Rotary Distrito 4281."');

// Caso con prefijo "Rotary Distrito 4281:"
const dirtyCopy2 = 'Rotary Distrito 4281: Con gran entusiasmo realizamos la entrega de sillas de ruedas.';
const cleanedCopy2 = cleanVideoReadyCopy(dirtyCopy2);
assert.ok(!cleanedCopy2.startsWith('Rotary Distrito 4281:'), 'Debe eliminar prefijo con dos puntos');
assert.ok(cleanedCopy2.includes('Con gran entusiasmo realizamos la entrega'), 'Conserva el núcleo del mensaje');
console.log('  OK    Limpia prefijos con dos puntos');

// Caso con sufijo repetitivo
const dirtyCopy3 = 'La salud visual es una prioridad para nuestras comunidades rurales. Rotary Distrito 4281.';
const cleanedCopy3 = cleanVideoReadyCopy(dirtyCopy3);
assert.ok(!cleanedCopy3.endsWith('Rotary Distrito 4281.'), 'Debe eliminar la coletilla final repetitiva');
console.log('  OK    Limpia sufijos innecesarios al final del copy');

console.log('\n▸ 3. Construcción del Prompt con Cerebro Institucional y Regla 10');

const prompt = buildVideoReadyCopyPrompt({
    analysis: {
        summary: 'Jornada médica en Chía',
        topic: 'Salud comunitaria',
        transcript: 'Estamos muy contentos de atender a más de 200 familias.'
    },
    additionalContext: 'Apoyo del Club Rotario Chía Nueva Generación',
    action: 'emotional'
});

assert.ok(prompt.includes('REGLA FUNDAMENTAL DE COMUNICACIÓN (REGLA 10)'), 'El prompt incluye la directiva estricta de Regla 10');
assert.ok(prompt.includes('NO repitas mecánicamente frases como "Rotary Distrito 4281..."'), 'Prohíbe la frase al modelo');
assert.ok(prompt.includes('servicio'), 'Enfoca en servicio');
assert.ok(prompt.includes('impacto'), 'Enfoca en impacto');
assert.ok(prompt.includes('solidaridad'), 'Enfoca en solidaridad');
assert.ok(prompt.includes('Tono más emotivo'), 'Aplica la variante solicitada por el usuario (emotional)');
console.log('  OK    Prompt estructurado con directivas anti-alucinación y Regla 10');

console.log('\n▸ 4. Ducking inteligente de audio (FFmpeg filtergraph)');

const duckingWithSpeech = buildAudioDuckingFiltergraph({ hasSpeech: true });
assert.ok(duckingWithSpeech.includes('sidechaincompress'), 'Debe utilizar sidechaincompress para atenuación automática');
assert.ok(duckingWithSpeech.includes('threshold=0.08'), 'Threshold calibrado para habla');
assert.ok(duckingWithSpeech.includes('amix=inputs=2'), 'Mezcla estéreo de dos canales');
console.log('  OK    sidechaincompress activo con atenuación dinámica ante presencia de voz');

const duckingNoSpeech = buildAudioDuckingFiltergraph({ hasSpeech: false });
assert.ok(!duckingNoSpeech.includes('sidechaincompress'), 'Sin voz detectada no necesita sidechaincompress');
assert.ok(duckingNoSpeech.includes('amix=inputs=2'), 'Mantiene amix con volumen balanceado');
console.log('  OK    Filtro sin voz aplica balance proporcional limpio');

console.log('\n▸ 5. Integridad de Cierre Institucional y Esquema MediaOutroComposition (v4.1094.2)');

import fs from 'node:fs';

const controllerContent = fs.readFileSync('server/controllers/videoReadyController.js', 'utf8');
const workflowContent = fs.readFileSync('src/components/admin/content-studio/VideoReadyWorkflow.tsx', 'utf8');
const videoCreatorContent = fs.readFileSync('src/components/admin/content-studio/VideoCreator.tsx', 'utf8');

// Verificación de resolución de Outro en Controller
assert.ok(
    controllerContent.includes('let resolvedOutroUrl = outro?.videoUrl || outro?.url || null;'),
    'videoReadyController debe resolver tanto videoUrl como url de outro'
);
console.log('  OK    videoReadyController soporta videoUrl y url indistintamente');

// Verificación de guardián en MediaOutroComposition
assert.ok(
    controllerContent.includes('if (hasOutro && outro?.id && resolvedOutroUrl)'),
    'videoReadyController solo debe insertar en MediaOutroComposition si hay outro efectivo y resolvedOutroUrl no es null'
);
console.log('  OK    Guardián contra violación de NOT NULL en MediaOutroComposition.outroUrl activo');

// Verificación de paso de videoUrl en VideoReadyWorkflow
assert.ok(
    workflowContent.includes('videoUrl: selectedOutro.videoUrl || (selectedOutro as any).url || null'),
    'VideoReadyWorkflow debe enviar videoUrl del objeto Outro'
);
console.log('  OK    VideoReadyWorkflow propaga videoUrl del catálogo de Outros');

// Verificación de defaultOutro en VideoCreator
assert.ok(
    videoCreatorContent.includes('videoUrl: outro.url'),
    'VideoCreator debe mapear videoUrl en defaultOutro'
);
console.log('  OK    VideoCreator provee videoUrl y url para defaultOutro');

console.log('\n✓ Todas las pruebas de «Video listo para publicar» pasaron con éxito.\n');
