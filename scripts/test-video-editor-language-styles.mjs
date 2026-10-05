// ════════════════════════════════════════════════════════════════════════════
// Test suite: Regresión contenido/idioma vs estilos visuales (Video Editor)
// Valida que el contenido del subtítulo (ES/EN/FR según idioma activo) y su
// estilo visual (fuente, tamaño, color, fondo, posición, sombra, etc.) sean
// propiedades independientes en: panel lateral, línea de tiempo, canvas/vista
// previa, inspector, reproducción, persistencia y exportación FFmpeg.
// ════════════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esbuildBin = path.join(repoRoot, 'node_modules', '.bin', 'esbuild');
const buildDir = mkdtempSync(path.join(tmpdir(), 've-lang-style-'));

function bundleTs(relSrc, outName) {
    const src = path.join(repoRoot, relSrc);
    const out = path.join(buildDir, outName);
    execFileSync(esbuildBin, [src, '--bundle', '--format=esm', '--platform=node', '--external:react', `--outfile=${out}`, '--log-level=error']);
    return pathToFileURL(out).href;
}

const timelineUtils = await import(bundleTs('src/components/admin/video-editor/timelineUtils.ts', 'timelineUtils.mjs'));
const textStyleUtils = await import(bundleTs('src/components/admin/video-editor/textStyleUtils.ts', 'textStyleUtils.mjs'));
const {
    getSegmentText,
    getVisibleSubtitleSegments,
    normalizeLangCode,
    resolveActiveSubtitleSegments,
    switchSubtitleLanguage,
    updateSubtitleSegmentText,
} = timelineUtils;
const { applyStyleToAllSubtitles } = textStyleUtils;

const {
    buildSubtitleForceStyle,
    downloadMediaAsset,
    normalizeOpacityFraction,
    resolveActiveSubtitleText,
    sanitizeFontName,
} = await import('../server/lib/videoEditorRender.js');

// ── Fixture: proyecto ES original con estilos configurados ──────────────────
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
const FR = [
    'Bonjour, je suis Jeferson Mosquera, résident du quartier Jardín.',
    'Aujourd’hui, nos vies ont changé après le tremblement de terre.',
    'Ce jour-là, nous ne pensions qu’à protéger la famille.',
    'C’était ma maison, celle que nous avons construite avec effort.',
    'Et aujourd’hui, nous demandons de l’aide à toutes les entités nécessaires.',
    'Et aussi à aider la communauté qui a tout perdu.',
    'Merci.',
];
const starts = [0, 3, 6, 11, 14, 19, 24];
const ends = [3, 6, 11, 14, 19, 24, 28];

const STYLE_A = {
    fontFamily: 'Playfair Display, serif', fontSize: 30, color: '#FFEEDD',
    backgroundColor: '#112233', backgroundOpacity: 80, backgroundPadding: 8,
    borderRadius: 8, backgroundEnabled: true, position: 'bottom', align: 'center',
    fontWeight: '700', opacity: 100, strokeColor: '#000000', strokeWidth: 1,
    shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 0, shadowOffsetY: 2,
    shadowOpacity: 50, x: 0, y: 5, scale: 1, rotation: 0,
};

function makeEsProject() {
    const segments = ES.map((t, i) => ({
        id: `sub-${i + 1}`, start: starts[i], end: ends[i], text: t,
        translations: { es: t }, style: { ...STYLE_A },
    }));
    return {
        segments,
        style: { ...STYLE_A },
        sourceLanguage: 'es', sourceLanguageName: 'Español',
        activeLanguage: 'es', language: 'es',
        availableLanguages: ['es'],
        translations: { es: { language: 'es', isOriginal: true, segments: segments.map(s => ({ ...s })) } },
    };
}

// Réplica fiel de VideoEditorSidebar.handleTranslateSubtitles (merge cliente)
function clientMergeTranslation(subtitles, targetTexts, normSource, normTarget) {
    const translatedSegments = targetTexts.map((t, i) => ({ ...subtitles.segments[i], text: t }));
    const segmentsWithTranslations = translatedSegments.map((ts, idx) => {
        const orig = subtitles.segments[idx] || {};
        const trs = {};
        for (const [k, v] of Object.entries(orig.translations || {})) trs[normalizeLangCode(k)] = v;
        if (ts.translations) for (const [k, v] of Object.entries(ts.translations)) trs[normalizeLangCode(k)] = v;
        trs[normSource] = trs[normSource] || orig.text || '';
        trs[normTarget] = ts.text;
        return { ...orig, ...ts, text: ts.text, style: ts.style ?? orig.style, translations: trs };
    });
    return {
        ...subtitles,
        segments: segmentsWithTranslations,
        activeLanguage: normTarget, language: normTarget, sourceLanguage: normSource,
        translations: {
            ...subtitles.translations,
            [normSource]: subtitles.translations?.[normSource] || { language: normSource, isOriginal: true, segments: subtitles.segments },
            [normTarget]: { language: normTarget, isOriginal: false, segments: segmentsWithTranslations },
        },
    };
}

// Réplica de VideoEditor.handleUpdateSubtitleSegment (rama tiempos/estilo)
function updateSegmentMeta(subtitles, segmentId, updates) {
    const activeLang = normalizeLangCode(subtitles.activeLanguage || subtitles.sourceLanguage || 'es');
    const updatedSegments = (subtitles.segments || []).map(s => {
        if (s.id !== segmentId) return s;
        const nextSeg = { ...s, ...updates };
        if (updates.text !== undefined) nextSeg.translations = { ...(nextSeg.translations || {}), [activeLang]: updates.text };
        return nextSeg;
    });
    const updatedTranslations = { ...(subtitles.translations || {}) };
    for (const [langKey, langObj] of Object.entries(updatedTranslations)) {
        if (langObj && Array.isArray(langObj.segments)) {
            const normKey = normalizeLangCode(langKey);
            updatedTranslations[normKey] = {
                ...langObj,
                segments: langObj.segments.map(seg => {
                    if (seg.id !== segmentId) return seg;
                    const modSeg = { ...seg };
                    if (updates.start !== undefined) modSeg.start = updates.start;
                    if (updates.end !== undefined) modSeg.end = updates.end;
                    if (normKey === activeLang && updates.text !== undefined) modSeg.text = updates.text;
                    if (updates.style !== undefined) modSeg.style = { ...(seg.style || {}), ...updates.style };
                    return modSeg;
                }),
            };
        }
    }
    return { ...subtitles, segments: updatedSegments, translations: updatedTranslations };
}

// Las 6 superficies resuelven el texto visible con el mismo resolver central.
function allSurfacesTexts(subtitles) {
    const active = normalizeLangCode(subtitles.activeLanguage || 'es');
    const source = normalizeLangCode(subtitles.sourceLanguage || 'es');
    const sidebar = getVisibleSubtitleSegments(subtitles).map(s => getSegmentText(s, active, source, subtitles.translations));
    const timeline = getVisibleSubtitleSegments(subtitles).map(s => s.text);
    const canvasSeg = getVisibleSubtitleSegments(subtitles).find(s => 1.5 >= s.start && 1.5 <= s.end);
    const canvas = canvasSeg ? getSegmentText(canvasSeg, active, source, subtitles.translations) : null;
    const inspectorSeg = (subtitles.segments || []).find(s => s.id === 'sub-1');
    const inspector = inspectorSeg ? getSegmentText(inspectorSeg, active, source, subtitles.translations) : null;
    const playbackSeg = (subtitles.segments || []).find(s => 1.5 >= s.start && 1.5 <= s.end);
    const playback = playbackSeg ? getSegmentText(playbackSeg, active, source, subtitles.translations) : null;
    const exported = (subtitles.segments || []).map((s, i) => resolveActiveSubtitleText(s, active, subtitles, i));
    return { sidebar, timeline, canvas, inspector, playback, exported };
}

function expectAllEn(subtitles, label) {
    const v = allSurfacesTexts(subtitles);
    assert.deepEqual(v.sidebar, EN, `${label}: panel lateral en EN`);
    assert.deepEqual(v.timeline, EN, `${label}: timeline en EN`);
    assert.equal(v.canvas, EN[0], `${label}: canvas en EN`);
    assert.equal(v.inspector, EN[0], `${label}: inspector en EN`);
    assert.equal(v.playback, EN[0], `${label}: reproducción en EN`);
    assert.deepEqual(v.exported, EN, `${label}: exportación en EN`);
}

function expectAllEs(subtitles, label) {
    const v = allSurfacesTexts(subtitles);
    assert.deepEqual(v.sidebar, ES, `${label}: panel lateral en ES`);
    assert.deepEqual(v.timeline, ES, `${label}: timeline en ES`);
    assert.equal(v.canvas, ES[0], `${label}: canvas en ES`);
    assert.deepEqual(v.exported, ES, `${label}: exportación en ES`);
}

console.log('\n▸ 1. Proyecto original ES: todas las superficies en español');
let subs = makeEsProject();
expectAllEs(subs, 'ES inicial');
console.log('  OK');

console.log('\n▸ 2. Traducción ES→EN: versión activa EN en las 6 superficies, estilos intactos');
subs = clientMergeTranslation(subs, EN, 'es', 'en');
expectAllEn(subs, 'tras traducir EN');
assert.ok(subs.segments.every(s => s.style?.fontFamily === STYLE_A.fontFamily && s.style?.fontSize === 30), 'estilos intactos tras traducir');
console.log('  OK');

console.log('\n▸ 3. Cambio de estilo con EN activo: solo cambia lo visual, el inglés permanece');
subs = updateSegmentMeta(subs, 'sub-1', { style: { ...STYLE_A, fontSize: 34, color: '#FF0000' } });
expectAllEn(subs, 'tras cambio de estilo');
assert.equal(subs.segments[0].style.fontSize, 34, 'estilo aplicado');
assert.equal(subs.translations.en.segments[0].style.fontSize, 34, 'estilo sincronizado en catálogo EN');
console.log('  OK');

console.log('\n▸ 4. ES→EN→ES→EN reutiliza traducciones existentes sin regenerar');
subs = switchSubtitleLanguage(subs, 'es');
expectAllEs(subs, 'switch a ES');
assert.equal(subs.segments[0].style.fontSize, 34, 'estilo individual conservado en ES');
subs = switchSubtitleLanguage(subs, 'en');
expectAllEn(subs, 'switch de vuelta a EN');
assert.equal(subs.segments[0].style.fontSize, 34, 'estilo individual conservado en EN');
console.log('  OK');

console.log('\n▸ 5. Conmutar con estado rancio no destruye la traducción guardada');
let stale = {
    sourceLanguage: 'es', activeLanguage: 'en', language: 'en',
    segments: [{ id: 'sub-1', start: 0, end: 3, text: ES[0], translations: { es: ES[0], en: EN[0] } }],
    translations: {
        es: { language: 'es', segments: [{ id: 'sub-1', start: 0, end: 3, text: ES[0] }] },
        en: { language: 'en', segments: [{ id: 'sub-1', start: 0, end: 3, text: EN[0] }] },
    },
};
stale = switchSubtitleLanguage(stale, 'es');
stale = switchSubtitleLanguage(stale, 'en');
assert.equal(getSegmentText(stale.segments[0], 'en', 'es', stale.translations), EN[0], 'EN sobrevive a conmutación con texto rancio');
console.log('  OK');

console.log('\n▸ 6. Guardar y reabrir: idioma activo, traducciones y estilos sincronizados');
const saved = JSON.parse(JSON.stringify(subs));
const reloaded = { ...saved, segments: resolveActiveSubtitleSegments(saved, saved.activeLanguage) };
expectAllEn(reloaded, 'tras reload con EN activo');
assert.equal(reloaded.segments[0].style.fontSize, 34, 'estilo individual persiste tras reload');
assert.equal(reloaded.segments[0].style.color, '#FF0000', 'color persiste tras reload');
subs = reloaded;
console.log('  OK');

console.log('\n▸ 7. Tercer idioma (FR): conmutación inmediata y reactiva sin regenerar');
subs = clientMergeTranslation(subs, FR, 'es', 'fr');
{
    const v = allSurfacesTexts(subs);
    assert.deepEqual(v.sidebar, FR, 'panel lateral en FR');
    assert.deepEqual(v.timeline, FR, 'timeline en FR');
    assert.equal(v.canvas, FR[0], 'canvas en FR');
    assert.deepEqual(v.exported, FR, 'exportación en FR');
}
subs = switchSubtitleLanguage(subs, 'en');
expectAllEn(subs, 'vuelta a EN sin IA');
subs = switchSubtitleLanguage(subs, 'es');
expectAllEs(subs, 'vuelta a ES sin IA');
subs = switchSubtitleLanguage(subs, 'en');
console.log('  OK');

console.log('\n▸ 8. Edición manual en EN no toca el ES original');
subs = updateSubtitleSegmentText(subs, 'sub-1', 'Hello, edited by human.', 'en');
assert.equal(getSegmentText(subs.segments[0], 'en', 'es', subs.translations), 'Hello, edited by human.', 'EN editado');
assert.equal(subs.segments[0].translations.es, ES[0], 'ES original intacto');
subs = switchSubtitleLanguage(subs, 'es');
assert.equal(getSegmentText(subs.segments[0], 'es', 'es', subs.translations), ES[0], 'ES intacto tras conmutar');
subs = switchSubtitleLanguage(subs, 'en');
assert.equal(getSegmentText(subs.segments[0], 'en', 'es', subs.translations), 'Hello, edited by human.', 'edición EN persiste');
console.log('  OK');

console.log('\n▸ 9. Aplicar estilo a todos: conserva el idioma activo y propaga al catálogo');
{
    const before = allSurfacesTexts(subs).timeline.slice();
    subs = applyStyleToAllSubtitles(subs, { fontFamily: 'Montserrat, sans-serif', fontSize: 26 });
    assert.deepEqual(allSurfacesTexts(subs).timeline, before, 'contenido idéntico tras aplicar estilo');
    assert.ok(subs.segments.every(s => s.style?.fontFamily === 'Montserrat, sans-serif'), 'estilo global en segmentos');
    assert.ok(subs.translations.en.segments.every(s => s.style?.fontSize === 26), 'estilo global en catálogo EN');
    assert.ok(subs.translations.es.segments.every(s => s.style?.fontSize === 26), 'estilo global en catálogo ES');
    subs = switchSubtitleLanguage(subs, 'es');
    subs = switchSubtitleLanguage(subs, 'en');
    assert.ok(subs.segments.every(s => s.style?.fontFamily === 'Montserrat, sans-serif'), 'estilo sobrevive a conmutación');
}
console.log('  OK');

console.log('\n▸ 10. Exportación FFmpeg: idioma activo + estilos exactos');
{
    const force = buildSubtitleForceStyle(subs.style, 1080);
    assert.ok(!force.includes('sans-serif'), `FontName sanitizado sin comas: ${force}`);
    assert.ok(force.includes('FontName=Montserrat'), `fuente configurada aplicada: ${force}`);
    assert.ok(force.includes('FontSize=39'), `tamaño escalado a 1080p: ${force}`);
    assert.ok(force.includes('BorderStyle=4'), `caja de fondo activa: ${force}`);
    // Opacidad 100 % → alfa ASS 00 (opaco); 80 % fondo → alfa ≈ 33
    assert.ok(force.includes('PrimaryColour=&H00'), `opacidad de texto aplicada: ${force}`);
    const noBg = buildSubtitleForceStyle({ ...subs.style, backgroundEnabled: false, backgroundColor: 'transparent', strokeWidth: 2, strokeColor: '#000000', shadowBlur: 6, shadowOpacity: 70 }, 720);
    assert.ok(noBg.includes('BorderStyle=1'), `sin fondo usa contorno+sombra: ${noBg}`);
    assert.ok(!noBg.includes('Outline=0'), `trazo aplicado sin fondo: ${noBg}`);
    assert.ok(!noBg.includes('Shadow=0'), `sombra aplicada sin fondo: ${noBg}`);
    assert.equal(normalizeOpacityFraction(80, 1), 0.8, 'porcentaje 80 → 0.8');
    assert.equal(normalizeOpacityFraction(100, 1), 1, 'porcentaje 100 → 1');
    assert.equal(sanitizeFontName('Playfair Display, serif'), 'Playfair Display', 'primera familia');
    assert.equal(sanitizeFontName('"Bebas Neue", sans-serif'), 'Bebas Neue', 'sin comillas');
}
console.log('  OK');

console.log('\n▸ 11. Coincidencia magnética por timestamps cuando los IDs no coinciden o no se pasa índice');
{
    const subNoId = {
        start: 6.0,
        end: 11.0,
        text: 'English translation without matching ID',
        translations: { es: ES[2], en: EN[2] }
    };
    const resolvedText = getSegmentText(subNoId, 'en', 'es', subs.translations);
    assert.equal(resolvedText, EN[2], 'Coincide por timestamp aproximado sin necesidad de id exacto ni índice');

    const subWithDifferentId = {
        id: 'client-temp-id-999',
        start: 0.0,
        end: 3.0,
        text: 'Direct translated text',
        translations: { es: ES[0] }
    };
    const resolvedFromActive = getSegmentText(subWithDifferentId, 'en', 'es', subs.translations);
    assert.equal(resolvedFromActive, 'Hello, edited by human.', 'Catálogo EN resuelve por timestamps antes de tocar el español');
}
console.log('  OK');

console.log('\n▸ 12. Prioridad inmutable: seg.text traducido nunca es sustituido por el fallback español');
{
    const segOnlyEnglishText = {
        id: 'sub-unknown',
        start: 99.0,
        end: 102.0,
        text: 'This is pure English active text',
        translations: { es: 'Esto es español original' }
    };
    const resolvedPriority = getSegmentText(segOnlyEnglishText, 'en', 'es', null);
    assert.equal(resolvedPriority, 'This is pure English active text', 'Prioriza texto en inglés antes de caer a translations.es');
}
console.log('\n▸ 13. Conmutar a idioma no traducido no contamina el catálogo de traducciones con español');
{
    const esSubs = makeEsProject();
    const switchedToDe = switchSubtitleLanguage(esSubs, 'de');
    assert.equal(switchedToDe.translations?.de, undefined, 'No debe registrar entrada ficticia en translations.de con texto en español');
    assert.equal(switchedToDe.activeLanguage, 'de', 'Idioma activo sí conmuta');
    assert.equal(switchedToDe.segments[0].text, ES[0], 'Muestra fallback de texto para la vista sin corromper translations');
    assert.equal(switchedToDe.segments[0].translations?.de, undefined, 'No debe escribir texto en español dentro de translations.de');
}
console.log('  OK');

console.log('\n▸ 14. Anti-contaminación: descarta traducciones envenenadas con texto fuente y prioriza catálogo canónico');
{
    const poisonedSeg = {
        id: 'sub-1',
        start: 0,
        end: 3,
        text: 'Hola, soy Jeferson Mosquera...',
        translations: {
            es: 'Hola, soy Jeferson Mosquera...',
            en: 'Hola, soy Jeferson Mosquera...' // Contaminación previa con español
        },
        style: { ...STYLE_A }
    };
    const catalog = {
        es: {
            language: 'es',
            isOriginal: true,
            segments: [{ id: 'sub-1', start: 0, end: 3, text: 'Hola, soy Jeferson Mosquera...' }]
        },
        en: {
            language: 'en',
            isOriginal: false,
            segments: [{ id: 'sub-1', start: 0, end: 3, text: "Hello, I'm Jeferson Mosquera..." }]
        }
    };
    const poisonedSubs = {
        sourceLanguage: 'es',
        activeLanguage: 'en',
        language: 'en',
        segments: [poisonedSeg],
        translations: catalog
    };

    // 1. getSegmentText
    const resolvedText = getSegmentText(poisonedSeg, 'en', 'es', catalog, 0);
    assert.equal(resolvedText, "Hello, I'm Jeferson Mosquera...", 'getSegmentText debe ignorar entrada envenenada y consultar catálogo');

    // 2. resolveActiveSubtitleSegments
    const resolvedSegments = resolveActiveSubtitleSegments(poisonedSubs, 'en');
    assert.equal(resolvedSegments[0].text, "Hello, I'm Jeferson Mosquera...", 'resolveActiveSubtitleSegments debe resolver al inglés auténtico');
    assert.equal(resolvedSegments[0].translations.en, "Hello, I'm Jeferson Mosquera...", 'translations.en debe corregirse con el texto auténtico');

    // 3. switchSubtitleLanguage
    const switched = switchSubtitleLanguage(poisonedSubs, 'en');
    assert.equal(switched.segments[0].text, "Hello, I'm Jeferson Mosquera...", 'switchSubtitleLanguage debe conmutar al inglés auténtico');

    // 4. resolveActiveSubtitleText (Backend Render)
    const renderResolved = resolveActiveSubtitleText(poisonedSeg, 'en', poisonedSubs, 0);
    assert.equal(renderResolved, "Hello, I'm Jeferson Mosquera...", 'resolveActiveSubtitleText de render debe resolver al inglés auténtico');
}
console.log('  OK');

console.log('\n▸ 15. Pipeline de descarga: validación y diagnóstico de errores en downloadMediaAsset');
{
    // URL vacía
    await assert.rejects(
        () => downloadMediaAsset({ url: '', name: 'test_empty.mp4' }, '/tmp/null'),
        /URL de recurso inválida o vacía/
    );

    // Servidor inalcanzable genera error descriptivo con nombre del clip
    await assert.rejects(
        () => downloadMediaAsset({ url: 'http://127.0.0.1:59999/test.mp4', name: 'WhatsApp_Video_Test.mp4' }, '/tmp/ve-unreachable-test', 800),
        /Fallo tras 3 intentos al descargar recurso "WhatsApp_Video_Test.mp4"/
    );
}
console.log('  OK');

console.log('\n✨ Regresión contenido/idioma vs estilos: todas las pruebas pasaron.\n');

