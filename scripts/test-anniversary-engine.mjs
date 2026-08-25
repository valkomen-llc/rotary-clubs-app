// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — el CRITERIO del motor — v4.897
//
// Sin base, sin credenciales y sin red. Lo que se comprueba acá no se ve
// mirando la pantalla:
//
//   1. Que la ELEGIBILIDAD bloquee de verdad un modelo texto-a-imagen.
//   2. Que la RECOMENDACIÓN sea determinista y descalifique por inestabilidad.
//   3. Que el score se calcule SOBRE LO MEDIDO y declare lo que no se midió —
//      un cero inventado hundiría un modelo por lo que nadie pudo mirar.
//   4. Que el FALLBACK sea de infraestructura y NUNCA estético.
//   5. Que producción no se cambie sola: `resolveProduction` lee lo ACTIVADO.
//
//   npm run test:anniversary:engine
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const E = await import('../server/lib/anniversaryEngineSpec.js');

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
const sinComentarios = (src) => String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// ════════════════════════════════════════════════════════════════════
grupo('1 — El catálogo declarado');
check('trae al menos tres modelos', E.MODEL_CATALOG.length >= 3);
check('el default es el modelo de producción actual (no se cambió sin benchmark)',
    E.DEFAULT_MODEL_ID.includes('nano-banana-edit'), E.DEFAULT_MODEL_ID);
check('todos los declarados son elegibles',
    E.MODEL_CATALOG.every(m => E.eligibility(m).eligible));
check('cada modelo lleva su crédito estimado (medidor propio)',
    E.MODEL_CATALOG.every(m => Number.isFinite(m.creditsEstimated)));
check('los ids son configurables por entorno (KIE los renombra)',
    /process\.env\.ANNIVERSARY_MODEL_NANO_BANANA/.test(leer('server/lib/anniversaryEngineSpec.js')));

grupo('2 — La elegibilidad BLOQUEA lo que no sirve');
const soloTexto = { capabilities: { imageToImage: false, referenceImages: 0, minSide: 2048 } };
const e1 = E.eligibility(soloTexto);
check('un modelo texto-a-imagen NO es elegible', !e1.eligible);
check('y el motivo nombra la fotografía', e1.errors.some(x => /fotograf/i.test(x)), e1.errors.join(' | '));
check('resolución corta tampoco', !E.eligibility({ capabilities: { imageToImage: true, referenceImages: 2, minSide: 512 } }).eligible);
const unaRef = E.eligibility({ capabilities: { imageToImage: true, referenceImages: 1, minSide: 1024, negativePrompt: true, outpainting: true } });
check('una sola imagen de referencia AVISA, no bloquea',
    unaRef.eligible && unaRef.warnings.some(w => /referencia/i.test(w)));
check('sin prompt negativo AVISA',
    E.eligibility({ capabilities: { imageToImage: true, referenceImages: 2, minSide: 1024, negativePrompt: false, outpainting: true } }).warnings.some(w => /negativo/i.test(w)));

grupo('3 — Candidatos a mano');
check('un id sin forma familia/modelo se rechaza', E.normalizeCustomModel({ id: 'basura' }) === null);
const cand = E.normalizeCustomModel({ id: 'acme/super-edit', label: 'Acme', creditsEstimated: 7 });
check('uno válido entra con capacidades declaradas', !!cand && cand.capabilities.imageToImage === true);
const cat = E.catalogFor({ customModels: [cand, { id: E.DEFAULT_MODEL_ID, creditsEstimated: 99 }] });
check('el candidato aparece en el catálogo', cat.some(m => m.id === 'acme/super-edit'));
check('redeclarar un id del catálogo lo SOBREESCRIBE (corregir sin desplegar)',
    cat.find(m => m.id === E.DEFAULT_MODEL_ID).creditsEstimated === 99);
check('el catálogo no duplica ids', new Set(cat.map(m => m.id)).size === cat.length);

grupo('4 — Producción no se cambia sola');
check('sin nada activado manda el default',
    E.resolveProduction({}, {}).primary === E.DEFAULT_MODEL_ID);
const conActivo = E.resolveProduction({ active: E.MODEL_CATALOG[1].id }, {});
check('lo ACTIVADO manda', conActivo.primary === E.MODEL_CATALOG[1].id && conActivo.source === 'activated');
const conEnv = E.resolveProduction({ active: E.MODEL_CATALOG[1].id }, { ANNIVERSARY_MODEL: 'x/emergencia' });
check('el entorno gana SIEMPRE (salida de emergencia)', conEnv.primary === 'x/emergencia' && conEnv.source === 'env');
check('y lo DICE', conEnv.notes.some(n => /entorno|ANNIVERSARY_MODEL/.test(n)));
const activoRoto = E.resolveProduction({ active: 'no/existe' }, {});
check('un activo desconocido DEGRADA al default y lo dice',
    activoRoto.primary === E.DEFAULT_MODEL_ID,
    activoRoto.primary);
const fbIgual = E.resolveProduction({ active: E.DEFAULT_MODEL_ID, fallback: E.DEFAULT_MODEL_ID }, {});
check('un fallback igual al primario se ignora y se dice',
    fbIgual.fallback === null && fbIgual.notes.some(n => /mismo modelo/.test(n)));
const fbOk = E.resolveProduction({ fallback: E.MODEL_CATALOG[1].id }, {});
check('un fallback elegible y distinto queda', fbOk.fallback === E.MODEL_CATALOG[1].id);
// La regla 20 leída sobre el archivo: el spec NO escribe `active` en ninguna
// parte — recomendar y activar son actos separados y el segundo es humano.
check('el spec no tiene ninguna vía que escriba `active` solo',
    !/active\s*=(?!=)/.test(sinComentarios(leer('server/lib/anniversaryEngineSpec.js'))));

grupo('5 — El fallback es de infraestructura, NUNCA estético');
for (const [msg, clase] of [
    ['KIE createTask: 504 gateway timeout', 'infra'],
    ['request timed out after 100000ms', 'infra'],
    ['HTTP 503 service unavailable', 'infra'],
    ['rate limit exceeded, retry later', 'infra'],
    ['insufficient credits on account', 'infra'],
    ['model google/viejo not found', 'infra'],
    ['la composición quedó con el fondo gris', 'other'],
    ['content policy violation', 'other'],
    ['La fotografía no tiene un formato reconocible.', 'other'],
]) {
    check(`«${msg.slice(0, 44)}» → ${clase}`, E.classifyProviderError(msg) === clase, E.classifyProviderError(msg));
}
check('shouldFallback sólo con infra', E.shouldFallback('504 timeout') && !E.shouldFallback('quedó feo'));

grupo('6 — Los pesos');
const w = E.normalizeWeights({ humanFidelity: 40, latency: 0 });
check('se pueden reconfigurar', w.humanFidelity === 40 && w.latency === 0);
check('un valor absurdo cae al default', E.normalizeWeights({ humanFidelity: 999 }).humanFidelity === E.DEFAULT_WEIGHTS.humanFidelity);
check('todo en cero no apaga el benchmark en silencio',
    JSON.stringify(E.normalizeWeights(Object.fromEntries(E.CRITERIA_IDS.map(k => [k, 0])))) === JSON.stringify(E.DEFAULT_WEIGHTS));
check('fidelidad y rostros pesan más que costo y latencia (regla del producto)',
    E.DEFAULT_WEIGHTS.humanFidelity + E.DEFAULT_WEIGHTS.facePreservation
    > (E.DEFAULT_WEIGHTS.cost + E.DEFAULT_WEIGHTS.latency) * 4);

grupo('7 — Las subnotas automáticas');
const buenas = E.autoScoresFor({
    measurements: { meanLuma: 232, whiteShare: 0.6, zoneStdDev: 20, zoneLuma: 235, width: 1080, height: 1080 },
    preservation: { state: 'ok', use: true }, latencyMs: 25_000, credits: 4, minCredits: 4,
});
check('una pieza buena puntúa alto en instrucciones', buenas.instructionFollowing >= 9, String(buenas.instructionFollowing));
check('y en fidelidad', buenas.humanFidelity === 9 && buenas.facePreservation === 9 && buenas.noInvented === 10);
check('latencia corta puntúa 10', buenas.latency === 10);
check('el más barato del benchmark puntúa 10 en costo', buenas.cost === 10);
check('integración y composición quedan SIN medir (sólo votos)',
    buenas.photoIntegration === null && buenas.composition === null);

const sinVision = E.autoScoresFor({
    measurements: { meanLuma: 232, whiteShare: 0.6, width: 1080, height: 1080 },
    preservation: { state: 'unavailable', use: true }, latencyMs: 25_000,
});
check('«no se pudo comprobar» deja la fidelidad en null, no en un número',
    sinVision.humanFidelity === null && sinVision.facePreservation === null && sinVision.noInvented === null);

const alterada = E.autoScoresFor({
    measurements: { meanLuma: 232, whiteShare: 0.6, width: 1080, height: 1080 },
    preservation: { state: 'failed', use: false, reason: 'Hay una persona de más.' },
});
check('una persona inventada puntúa CERO en «sin inventados»', alterada.noInvented === 0);

grupo('8 — La nota total renormaliza sobre lo medido');
const t1 = E.totalScore(buenas);
check('con todo medido salvo los votos, hay total', t1.total !== null && t1.total > 8, String(t1.total));
check('y lo no medido se NOMBRA', t1.unmeasured.includes('photoIntegration') && t1.unmeasured.includes('composition'));
const soloUno = E.totalScore({ ...Object.fromEntries(E.CRITERIA_IDS.map(k => [k, null])), technical: 10 });
check('con un solo criterio medido, la nota es la de ese criterio (renormalizada)', soloUno.total === 10);
check('sin nada medido no hay total: un hueco es la verdad',
    E.totalScore(Object.fromEntries(E.CRITERIA_IDS.map(k => [k, null]))).total === null);

grupo('9 — El voto humano complementa');
const conVoto = E.applyVote(sinVision, 'star');
check('el voto llena integración y composición', conVoto.photoIntegration === 10 && conVoto.composition === 10);
check('y la fidelidad SÓLO si la visión no contestó', conVoto.humanFidelity === 10);
const votoConVision = E.applyVote(buenas, 'down');
check('con visión, el voto NO pisa la fidelidad medida', votoConVision.humanFidelity === 9 && votoConVision.photoIntegration === 2);
check('un voto desconocido no toca nada', E.applyVote(buenas, 'meh').photoIntegration === null);

grupo('10 — La recomendación');
const mk = (model, total10) => ({ model, status: 'ready', scores: { ...Object.fromEntries(E.CRITERIA_IDS.map(k => [k, null])), technical: total10 }, vote: null, latencyMs: 30_000 });
const rec = E.recommendModel([
    mk('google/nano-banana-edit', 6), mk('google/nano-banana-edit', 6),
    mk('black-forest-labs/flux-kontext-max', 9), mk('black-forest-labs/flux-kontext-max', 9),
]);
check('gana el de mejor score', rec.recommended === 'black-forest-labs/flux-kontext-max');
const empate = E.recommendModel([mk('google/nano-banana-edit', 8), mk('black-forest-labs/flux-kontext-max', 8)]);
check('un empate lo resuelve el ORDEN DEL CATÁLOGO (determinista)',
    empate.recommended === 'google/nano-banana-edit');
const inestable = E.recommendModel([
    mk('google/nano-banana-edit', 5),
    { model: 'black-forest-labs/flux-kontext-max', status: 'ready', scores: mk('x', 10).scores, vote: null, latencyMs: 1 },
    { model: 'black-forest-labs/flux-kontext-max', status: 'failed' },
    { model: 'black-forest-labs/flux-kontext-max', status: 'failed' },
]);
check('más fallos que éxitos DESCALIFICA por inestable, aunque su nota sea la mejor',
    inestable.recommended === 'google/nano-banana-edit'
    && inestable.table.find(t => t.model.includes('flux')).disqualified);
check('la tabla trae latencia media y tasa de error',
    inestable.table.every(t => 'avgLatencyMs' in t && 'errorRate' in t));

grupo('11 — El sello de auditoría por generación');
const sello = E.engineStampFor({ model: E.DEFAULT_MODEL_ID, fallbackUsed: true });
check('lleva proveedor, modelo, prompt y preset',
    sello.provider === 'kie' && sello.model === E.DEFAULT_MODEL_ID
    && !!sello.promptVersion && !!sello.presetVersion && sello.fallbackUsed === true);
check('el preset es POR MODELO: dos modelos, dos huellas',
    E.presetVersionFor(E.MODEL_CATALOG[0]) !== E.presetVersionFor(E.MODEL_CATALOG[1]));
check('la misma ficha da la misma huella (reproducible)',
    E.presetVersionFor(E.MODEL_CATALOG[0]) === E.presetVersionFor({ ...E.MODEL_CATALOG[0] }));

grupo('12 — Independencia y cableado');
const spec = leer('server/lib/anniversaryEngineSpec.js');
check('el spec del motor no importa nada del editor de Plantillas IA',
    ![...spec.matchAll(/^\s*import[^;]*from\s*['"]([^'"]+)['"]/gm)].some(m => /design(Spec|Compose|Templates|Render|Publish|Fields|Elements|AI)/.test(m[1])));
const engine = leer('server/lib/anniversaryEngine.js');
check('el despacho acepta el modelo como parámetro', /model = null, engineConfig = null/.test(engine));
check('un modelo sin prompt negativo declarado NO lo recibe (lección v4.645)',
    /negativePrompt: ficha && ficha\.capabilities\?\.negativePrompt === false \? null/.test(engine));
const ctrl = leer('server/controllers/anniversaryController.js');
// v4.907: el reintento de CALIDAD ya no existe — el flujo simple entrega tal
// cual, por decisión expresa del cliente. Lo que SÍ queda es el fallback de
// INFRAESTRUCTURA (la línea siguiente). Si el reintento estético reaparece,
// esto falla y hay que volver a discutirlo con el cliente delante.
check('v4.907: NO hay reintento de calidad en el sondeo',
    !/verifyComposition\(/.test(ctrl.slice(ctrl.indexOf('export const runSync'), ctrl.indexOf('export const pieceView'))));
check('el despacho de producción resuelve por `resolveProduction`', /resolveProduction\(engine\)/.test(ctrl));
check('agotada la cadena se propaga el motivo de CADA modelo', /también: \$\{e2\.message\}/.test(ctrl));
const rutas = leer('server/routes/anniversaries.js');
check('las literales del benchmark van antes que la paramétrica',
    rutas.indexOf("'/benchmark/vote'") < rutas.indexOf("'/benchmark/:id'"));
const publica = leer('src/pages/AniversarioIA.tsx');
check('NADA del motor llega al formulario público',
    !/benchmark|engine|modelo|fallback/i.test(sinComentarios(publica).replace(/renderMode|RENDER_MODES/g, '')));

// ════════════════════════════════════════════════════════════════════
grupo('El segundo proveedor: OpenAI (GPT Image)');

const gpt = E.MODEL_CATALOG.find(m => m.key === 'gpt_image');
check('GPT Image está en el catálogo declarado', !!gpt && gpt.provider === 'openai');
check('y es ELEGIBLE: imagen-a-imagen, referencia y resolución alcanzan',
    !!gpt && E.eligibility(gpt).eligible, gpt ? E.eligibility(gpt).errors.join(' | ') : 'sin ficha');
check('declara su presupuesto de prompt propio (mucho mayor que el de KIE)',
    !!gpt && gpt.capabilities.promptMaxChars > 2500);
check('sin prompt negativo, y la elegibilidad lo AVISA',
    !!gpt && gpt.capabilities.negativePrompt === false && E.eligibility(gpt).warnings.some(w => w.includes('negativo')));

check('providerOf resuelve el proveedor DEL MODELO',
    E.providerOf(gpt).id === 'openai' && E.providerOf(E.MODEL_CATALOG[0]).id === 'kie');
check('cada proveedor nombra SU credencial',
    E.PROVIDERS.openai.envKey === 'OPENAI_API_KEY' && E.PROVIDERS.kie.envKey === 'KIE_API_KEY');
check('un modelo sin proveedor declarado cae a KIE (los guardados de antes)',
    E.providerOf({ id: 'x' }).id === 'kie');

check('el sello de auditoría dice el proveedor REAL de la pieza',
    E.engineStampFor({ model: gpt.id }).provider === 'openai'
    && E.engineStampFor({ model: E.DEFAULT_MODEL_ID }).provider === 'kie');
check('un candidato agregado a mano es SIEMPRE de KIE (su id es de esa pasarela)',
    E.normalizeCustomModel({ id: 'familia/modelo' }).provider === 'kie');
check('el default de producción NO cambió: sigue siendo el del catálogo, no GPT Image',
    E.DEFAULT_MODEL_ID === E.MODEL_CATALOG[0].id && E.MODEL_CATALOG[0].provider === 'kie');

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} de ${ok + malos.length} comprobaciones fallaron:`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones. El criterio del motor está en orden.`);
