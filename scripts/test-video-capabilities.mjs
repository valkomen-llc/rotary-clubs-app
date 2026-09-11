#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Capacidades de los modelos image-to-video (v4.1030)
//
// Prueba el CRITERIO —qué acepta cada modelo, cómo se ajusta una duración,
// qué se rechaza antes de llamar al proveedor, cómo se clasifica un rechazo
// de parámetros y cómo se desglosa el ledger de generaciones— y el CABLEADO
// leído de los archivos: que el despacho ya no mande la duración MEDIDA, que
// `createKieVideoTask` normalice antes de armar el payload, y que el enlace
// «Editar en el Estudio» abra el Reel existente.
//
// Sin base, credenciales ni red. `npm run test:reels:capabilities`.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
    getModelCapabilities, snapDuration, validateGenerationRequest,
    normalizeGenerationRequest, GenerationValidationError, DURATION_SNAP_TOLERANCE_SEC
} from '../server/lib/videoModelCapabilities.js';
import {
    VIDEO_ENGINES, engineRequestDuration, resolveFallbackEngine, classifyProviderFailure,
    SCENE_FAILURE_CODES, summarizeGenerationLedger, MIN_SCENE_SEC, MAX_SCENE_SEC
} from '../server/lib/reelSpec.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const codigo = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
    if (ok) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};
const fnBody = (src, name) => {
    const i = src.indexOf(name);
    if (i < 0) return '';
    // El cuerpo empieza en `=> {`, no en la primera llave: la firma puede
    // llevar un parámetro desestructurado (`({ engineId, model })`).
    const open = src.indexOf('{', src.indexOf('=>', i));
    let depth = 0;
    for (let j = open; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
    }
    return src.slice(i);
};

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 1. Capacidades por modelo');
const kling = getModelCapabilities('kling-2.6/image-to-video');
check('kling-2.6/image-to-video es una familia conocida', kling.known && kling.id === 'kling_i2v');
check('Kling entrega 5 o 10 segundos y nada más', JSON.stringify(kling.durations) === '[5,10]');
check('Kling hereda la relación de aspecto de la imagen (no recibe aspect_ratio)', kling.aspectRatios === null && !kling.fields.includes('aspect_ratio'));
check('Kling exige `sound` y admite `negative_prompt`', kling.fields.includes('sound') && kling.optionalFields.includes('negative_prompt'));
check('Kling recibe UNA imagen', kling.imageCount === 1);
check('un id renombrado de la misma familia se reconoce igual (kling-2.1, kling-3.0)',
    getModelCapabilities('kling-2.1/image-to-video').id === 'kling_i2v' && getModelCapabilities('kling-3.0/image-to-video').id === 'kling_i2v');
check('Veo 3 sólo entrega 8 s', JSON.stringify(getModelCapabilities('google/veo-3-fast-image-to-video').durations) === '[8]');
check('un modelo desconocido cae en genérico y LO DICE (known:false)', getModelCapabilities('otro/modelo').known === false);
check('nunca lanza con un modelo vacío', getModelCapabilities(null).id === 'generic');

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 2. Ajuste de la duración');
check('5.04 (la duración MEDIDA de un clip) se ajusta a 5, no a 10', snapDuration(5.04, [5, 10]) === 5);
check('4.96 se ajusta a 5', snapDuration(4.96, [5, 10]) === 5);
check('4.5 (reparto fijado a mano) sube a 5', snapDuration(4.5, [5, 10]) === 5);
check('6 (MAX_SCENE_SEC) sube a 10: nunca falta metraje', snapDuration(6, [5, 10]) === 10);
check('una duración exacta se conserva', snapDuration(10, [5, 10]) === 10);
check('por encima del máximo devuelve el máximo', snapDuration(14, [5, 10]) === 10);
check('sin duraciones declaradas devuelve null: no se inventa una', snapDuration(5, []) === null);
check('la tolerancia está declarada y es de fracciones de segundo', DURATION_SNAP_TOLERANCE_SEC > 0 && DURATION_SNAP_TOLERANCE_SEC < 1);
check('TODO el rango de montaje [MIN, MAX] cae en una duración que Kling entrega', (() => {
    for (let d = MIN_SCENE_SEC; d <= MAX_SCENE_SEC + 0.001; d += 0.1) {
        if (![5, 10].includes(engineRequestDuration('kling26', d))) return false;
    }
    return true;
})());
check('engineRequestDuration acepta el id del motor o el id del modelo',
    engineRequestDuration('kling26', 5.04) === 5 && engineRequestDuration('kling-2.6/image-to-video', 5.04) === 5);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 3. Validación y normalización ANTES del proveedor');
const base = { model: 'kling-2.6/image-to-video', prompt: 'a', imageUrls: ['https://x/y.jpg'], duration: 5.04, aspectRatio: '9:16', resolution: '1080p', enableAudio: false, negativePrompt: 'zoom' };
const v = validateGenerationRequest(base);
check('la petición del reporte (5.04 s) NO es un error: es un aviso con ajuste', v.ok && v.warnings.some(w => /5\.04/.test(w) && /ajusta a 5/.test(w)));
const n = normalizeGenerationRequest(base);
check('normalizar devuelve duration = 5 y anota el ajuste', n.request.duration === 5 && n.adjustments.some(a => /5\.04s → 5s/.test(a)));
check('una petición correcta no se toca ni se anota', normalizeGenerationRequest({ ...base, duration: 5 }).adjustments.length === 0);
check('sin imagen se rechaza ANTES de llamar: GenerationValidationError con kind validation', (() => {
    try { normalizeGenerationRequest({ ...base, imageUrls: [] }); return false; }
    catch (e) { return e instanceof GenerationValidationError && e.kind === 'validation' && /imagen/.test(e.message); }
})());
check('dos imágenes a un modelo de una se rechazan', !validateGenerationRequest({ ...base, imageUrls: ['a', 'b'] }).ok);
check('audio nativo pedido a un modelo mudo se apaga y se anota',
    normalizeGenerationRequest({ ...base, model: 'bytedance/seedance-v1-pro-i2v', enableAudio: true }).request.enableAudio === false);
check('negative_prompt se omite en un modelo que no lo declara',
    normalizeGenerationRequest({ ...base, model: 'bytedance/seedance-v1-pro-i2v' }).request.negativePrompt === null);
check('un prompt más largo que el tope se recorta por palabra entera', (() => {
    const long = 'palabra '.repeat(400);
    const r = normalizeGenerationRequest({ ...base, prompt: long });
    return r.request.prompt.length <= 2500 && !/\s$/.test(r.request.prompt) && r.adjustments.some(a => /recortado/.test(a));
})());

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 4. Una fuente para las duraciones de los motores');
for (const e of Object.values(VIDEO_ENGINES).filter(e => e.provider === 'kie')) {
    check(`${e.id}: durations = capacidades del modelo ${e.model}`,
        JSON.stringify(e.durations) === JSON.stringify(getModelCapabilities(e.model).durations));
}
check('el motor principal declara su respaldo y el respaldo comparte contrato de input (familia Kling)',
    VIDEO_ENGINES.kling26.fallbackEngine === 'kling21' && getModelCapabilities(VIDEO_ENGINES.kling21.model).id === 'kling_i2v');
check('la tarifa por motor se puede corregir por entorno (REEL_CREDITS_KLING26)', /REEL_CREDITS_KLING26/.test(read('server/lib/reelSpec.js')));
{
    const saved = { fb: process.env.REEL_FALLBACK_ENGINE, key: process.env.KIE_API_KEY };
    process.env.KIE_API_KEY = 'x';
    delete process.env.REEL_FALLBACK_ENGINE;
    check('sin variable, el respaldo de kling26 es kling21', resolveFallbackEngine('kling26')?.id === 'kling21');
    process.env.REEL_FALLBACK_ENGINE = 'off';
    check('REEL_FALLBACK_ENGINE=off lo apaga', resolveFallbackEngine('kling26') === null);
    process.env.REEL_FALLBACK_ENGINE = 'kling26';
    check('nunca el mismo motor que acaba de fallar', resolveFallbackEngine('kling26') === null);
    delete process.env.KIE_API_KEY;
    delete process.env.REEL_FALLBACK_ENGINE;
    check('sin credencial no hay respaldo', resolveFallbackEngine('kling26') === null);
    if (saved.fb != null) process.env.REEL_FALLBACK_ENGINE = saved.fb;
    if (saved.key != null) process.env.KIE_API_KEY = saved.key;
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 5. Clasificación del fallo: validación ≠ transitorio ≠ definitivo');
check('el mensaje del reporte se clasifica como VALIDACIÓN',
    classifyProviderFailure('KIE createTask (kling-2.6/image-to-video): la duración no está dentro del rango de opciones permitidas — campos enviados: prompt, image_urls, duration, sound, negative_prompt') === 'validation');
check('«not in the range of allowed options» también', classifyProviderFailure('duration is not within the range of allowed options') === 'validation');
check('un 429 sigue siendo transitorio', classifyProviderFailure('HTTP 429 too many requests') === 'transient');
check('un rechazo de contenido sigue siendo definitivo', classifyProviderFailure('content policy violation') === 'permanent');
check('invalid_request existe, es técnico y reanudable (misma estrategia, sin gastar)',
    SCENE_FAILURE_CODES.invalid_request?.kind === 'technical' && SCENE_FAILURE_CODES.invalid_request?.retryable === true);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 6. El ledger de generaciones');
const scenes = [
    { id: 's1', position: 0, engine: 'kling26', creditsEstimated: 20, lifecycle: { events: [{ type: 'dispatch', credits: 20, engine: 'kling26', taskId: 't1' }] } },
    { id: 's2', position: 1, engine: 'kling26', creditsEstimated: 40, lifecycle: { events: [
        { type: 'dispatch', credits: 20, engine: 'kling26', taskId: 't2' },
        { type: 'relaunch', auto: true },
        { type: 'dispatch', credits: 20, engine: 'kling26', taskId: 't3' }
    ] } },
    { id: 's3', position: 2, engine: 'kling21', creditsEstimated: 34, lifecycle: { events: [
        { type: 'dispatch', credits: 20, engine: 'kling26', taskId: 't4' },
        { type: 'provider_failure', code: 'provider_rejected' },
        { type: 'relaunch', auto: true, engineFrom: 'kling26', engineTo: 'kling21' },
        { type: 'dispatch', credits: 14, engine: 'kling21', taskId: 't5' }
    ] } },
    { id: 's4', position: 3, engine: 'kling26', creditsEstimated: 40, lifecycle: { events: [
        { type: 'dispatch', credits: 20, engine: 'kling26', taskId: 't6' },
        { type: 'transient' },
        { type: 'manual_regenerate' },
        { type: 'dispatch', credits: 20, engine: 'kling26', taskId: 't7' },
        { type: 'provider_failure', code: 'invalid_request' }
    ] } },
    { id: 's5', position: 4, engine: 'kling26', creditsEstimated: 20, lifecycle: { events: [{ type: 'dispatch', credits: 20, engine: 'kling26', taskId: 't8' }] } }
];
const L = summarizeGenerationLedger(scenes);
const line = (k) => L.lines.find(l => l.kind === k);
check('el estimado inicial es una generación por escena (5 × 20 = 100)', L.estimatedInitial === 100);
check('lo lanzado suma TODAS las generaciones (8 = 154 créditos)', L.launched.count === 8 && L.launched.credits === 154);
check('5 iniciales = 100', line('initial')?.count === 5 && line('initial')?.credits === 100);
check('1 reintento automático = 20', line('auto_retry')?.count === 1 && line('auto_retry')?.credits === 20);
check('1 generación en el motor de respaldo = 14', line('fallback_engine')?.count === 1 && line('fallback_engine')?.credits === 14);
check('1 regeneración a mano = 20', line('manual_regenerate')?.count === 1 && line('manual_regenerate')?.credits === 20);
check('lo NO cobrado se cuenta aparte: 1 transitorio, 1 rechazo, 1 petición inválida',
    L.unpaid.transient === 1 && L.unpaid.rejected === 1 && L.unpaid.invalid === 1);
check('el costo real es null: el proveedor no lo devuelve y no se inventa', L.actualCredits === null && /no lo devuelve/.test(L.note));
check('una escena sin motor no estima nada', summarizeGenerationLedger([{ engine: 'still_motion', lifecycle: {} }]).estimatedInitial === 0);
check('sin escenas devuelve ceros, no lanza', summarizeGenerationLedger(null).launched.count === 0);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 7. Cableado (leído de los archivos)');
const ctrl = codigo(read('server/controllers/reelController.js'));
const kie = codigo(read('server/services/kieService.js'));
const dispatch = fnBody(ctrl, 'const dispatchScene = async');
check('dispatchScene NO manda generatedDurationSec (la duración medida) al proveedor',
    !/duration:\s*scene\.generatedDurationSec/.test(dispatch) && /duration:\s*requestedDuration/.test(dispatch));
check('dispatchScene pide la duración por engineRequestDuration', /engineRequestDuration\(/.test(dispatch));
const relaunch = fnBody(ctrl, 'const relaunchScene = async');
check('relaunchScene arma el prompt con la duración pedida al motor, no con la medida',
    /engineRequestDuration\(/.test(relaunch) && !/durationSec:\s*scene\.generatedDurationSec/.test(relaunch));
check('relaunchScene sólo cambia de motor tras provider_rejected y por resolveFallbackEngine',
    /errorCode === 'provider_rejected' \? resolveFallbackEngine\(/.test(relaunch));
const create = fnBody(kie, 'export const createKieVideoTask = async');
check('createKieVideoTask normaliza contra las capacidades ANTES del submit',
    create.indexOf('normalizeGenerationRequest(') > -1 && create.indexOf('normalizeGenerationRequest(') < create.indexOf('const submit = async'));
check('kieService importa la capa de capacidades', /from '\.\.\/lib\/videoModelCapabilities\.js'/.test(kie));
const hpf = fnBody(ctrl, 'const handleProviderFailure = async');
check('un fallo de validación devuelve la generación reclamada y NO marca la estrategia como probada',
    /kind === 'validation'/.test(hpf) && /invalid_request/.test(hpf) && (() => {
        const i = hpf.indexOf("kind === 'validation'"); const j = hpf.indexOf('return rows[0] || scene;', i);
        return !/strategyTried/.test(hpf.slice(i, j));
    })());
check('el despacho registra en el ledger la tarea, la clase y el estimado (meta)',
    /meta:\s*\{\s*taskId,\s*kind:\s*generationKind/.test(dispatch));
check('recordUsage acepta y guarda meta', /meta = null/.test(read('server/lib/reelUsage.js')) && /meta, "createdAt"/.test(read('server/lib/reelUsage.js')));
check('la columna meta de ReelUsage está enumerada en el atajo del ensure',
    /\['ReelUsage', 'meta'\]/.test(read('server/lib/ensureReelSchema.js')) && /ALTER TABLE "ReelUsage" ADD COLUMN IF NOT EXISTS meta JSONB/.test(read('server/lib/ensureReelSchema.js')));
check('costSummary lleva el ledger', /ledger:\s*summarizeGenerationLedger\(scenes\)/.test(ctrl));
check('la ingesta guarda cada escena en la Biblioteca EN EL ACTO (antes del montaje)', (() => {
    const ingest = fnBody(ctrl, 'const ingestScene = async');
    return /saveSceneToLibrary\(/.test(ingest);
})());
check('ningún camino borra una fila de Media por un fallo del Reel', !/DELETE FROM "Media"/.test(ctrl));

const studio = codigo(read('src/pages/admin/ContentStudio.tsx'));
check('ContentStudio lee ?tab= SIEMPRE, no sólo con ?ways=', (() => {
    const i = studio.indexOf("p.get('tab')"); const j = studio.indexOf("p.get('ways')");
    return i > -1 && j > -1 && i < j;
})());
check('ContentStudio pasa el reel a abrir a la Biblioteca', /initialReelId=\{initialReelId\}/.test(studio) && /p\.get\('reel'\)/.test(studio));
const lib = codigo(read('src/components/admin/content-studio/ReelLibrary.tsx'));
check('ReelLibrary abre la ficha del Reel pedido por id (el MISMO proyecto, sin crear otro)',
    /initialReelId/.test(lib) && /content-studio\/reels\/\$\{initialReelId\}/.test(lib) && /setSelected\(data\)/.test(lib));
check('el enlace «Editar en el Estudio» de la solicitud apunta a la Biblioteca con el id del Reel',
    /tab=library&reel=\$\{p\.id\}/.test(read('server/controllers/submissionReelController.js')));
check('el panel de la solicitud pinta el desglose (estimado / lanzado / real)',
    /costSummary\.ledger/.test(read('src/components/admin/contribution/SubmissionReelPanel.tsx')) && /no lo devuelve el proveedor/.test(read('src/components/admin/contribution/SubmissionReelPanel.tsx')));

console.log(`\n${pass} OK, ${fail} FALLA\n`);
process.exit(fail ? 1 : 0);
