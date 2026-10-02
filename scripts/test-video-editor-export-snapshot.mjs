// ════════════════════════════════════════════════════════════════════════════
// Test suite: Snapshot de exportación de subtítulos ([EXPORT_SNAPSHOT])
// Valida que el renderer reciba exactamente la versión ACTIVA:
// editor con 7 segmentos → payload con esos mismos 7, y que
// editor 7 → payload 0 se bloquee y registre (EMPTY_SUBTITLE_SNAPSHOT).
// ════════════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import { buildSubtitleSnapshot } from '../server/controllers/videoEditorController.js';

const ES = [
    'Hola, soy Jeferson Mosquera, residente del barrio Jardín.',
    'Hoy, nuestras vidas cambiaron después del terremoto.',
    'Ese día, solo pensábamos en proteger a la familia.',
    'Esta era mi casa, la que construimos con esfuerzo.',
    'Y hoy, pedimos ayuda a todas las entidades necesarias.',
    'Y también en ayudar a la comunidad que lo perdió todo.',
    'Gracias.',
];
const EN = [
    "Hello, I'm Jeferson Mosquera, a resident of Jardín neighborhood.",
    'Today, our lives changed after the earthquake.',
    'That day, we only thought about protecting the family.',
    'This was my house, the one we built with effort.',
    'And today, we ask all the necessary entities for help.',
    'And also to help the community that lost everything.',
    'Thank you.',
];
const starts = [0, 3, 6, 11, 14, 19, 24];
const ends = [3, 6, 11, 14, 19, 24, 28];
const STYLE = { fontFamily: 'Inter, sans-serif', fontSize: 28, color: '#FFFFFF', backgroundColor: '#000000', position: 'bottom', align: 'center' };

function makeSubtitles(active) {
    return {
        segments: ES.map((t, i) => ({
            id: `sub-${i + 1}`, start: starts[i], end: ends[i],
            text: active === 'en' ? EN[i] : t,
            translations: { es: t, en: EN[i] },
            style: { ...STYLE },
        })),
        style: { ...STYLE },
        sourceLanguage: 'es',
        activeLanguage: active,
        language: active,
        translations: {
            es: { language: 'es', isOriginal: true, segments: ES.map((t, i) => ({ id: `sub-${i + 1}`, start: starts[i], end: ends[i], text: t })) },
            en: { language: 'en', isOriginal: false, segments: EN.map((t, i) => ({ id: `sub-${i + 1}`, start: starts[i], end: ends[i], text: t })) },
        },
    };
}

console.log('\n▸ 1. Snapshot EN: 7 del editor → 7 al renderer, con idioma, tiempos y estilo');
{
    const snap = buildSubtitleSnapshot(makeSubtitles('en'));
    assert.equal(snap.activeLanguage, 'en');
    assert.equal(snap.rawSegmentCount, 7);
    assert.equal(snap.resolvedSegmentCount, 7);
    assert.equal(snap.consistent, true);
    assert.deepEqual(snap.segments.map(e => e.text), EN, 'textos EN');
    assert.ok(snap.segments.every(e => e.language === 'en'), 'idioma EN en cada entrada');
    assert.deepEqual(snap.segments.map(e => [e.startTime, e.endTime]), starts.map((s, i) => [s, ends[i]]), 'tiempos intactos');
    assert.ok(snap.segments.every(e => e.style?.fontSize === 28), 'estilo presente');
    assert.ok(snap.segments.every(e => typeof e.subtitleId === 'string' && e.subtitleId.length > 0), 'trazabilidad por subtitleId');
}
console.log('  OK');

console.log('\n▸ 2. Prueba inversa EN → ES: genérica, no hardcodeada al inglés');
{
    const snap = buildSubtitleSnapshot(makeSubtitles('es'));
    assert.equal(snap.activeLanguage, 'es');
    assert.deepEqual(snap.segments.map(e => e.text), ES, 'textos ES');
    assert.ok(snap.segments.every(e => e.language === 'es'), 'idioma ES en cada entrada');
    assert.equal(snap.consistent, true);
}
console.log('  OK');

console.log('\n▸ 3. Proyectos sin subtítulos renderizan normal (sin falso bloqueo)');
{
    const snap = buildSubtitleSnapshot({ segments: [], activeLanguage: 'es', sourceLanguage: 'es', style: {}, translations: {} });
    assert.equal(snap.rawSegmentCount, 0);
    assert.equal(snap.resolvedSegmentCount, 0);
    assert.equal(snap.consistent, true, 'pista vacía es legítima');
}
console.log('  OK');

console.log('\n▸ 4. Editor 7 → payload 0 se marca inconsistente (antes: MP4 exitoso sin captions)');
{
    const broken = {
        segments: starts.map((s, i) => ({ id: `sub-${i + 1}`, start: s, end: ends[i], text: '' })),
        style: { ...STYLE },
        sourceLanguage: 'es',
        activeLanguage: 'en',
        language: 'en',
        translations: {},
    };
    const snap = buildSubtitleSnapshot(broken);
    assert.equal(snap.rawSegmentCount, 7);
    assert.equal(snap.resolvedSegmentCount, 0);
    assert.equal(snap.consistent, false, 'debe quedar registrado como inconsistencia');
}
console.log('  OK');

console.log('\n▸ 5. El snapshot resuelve desde el catálogo aunque seg.text esté rancio');
{
    const subs = makeSubtitles('en');
    subs.segments = subs.segments.map((s, i) => ({ ...s, text: ES[i] })); // texto directo obsoleto
    const snap = buildSubtitleSnapshot(subs);
    assert.deepEqual(snap.segments.map(e => e.text), EN, 'catálogo manda sobre texto rancio');
    assert.equal(snap.consistent, true);
}
console.log('  OK');

console.log('\n✨ Snapshot de exportación: todas las pruebas pasaron.\n');
