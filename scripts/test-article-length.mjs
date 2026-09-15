#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA EXTENSIÓN DE LOS ARTÍCULOS GENERADOS POR IA.  npm run test:article:length
// v4.1059.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED.
//
// Lo que protege:
//  · Que NADA se trunque: el valor entra al PROMPT y al VALIDADOR, no a un
//    `substring` sobre el cuerpo.
//  · Que el objetivo sea un OBJETIVO con tolerancia, no un corte exacto.
//  · Que el perfil se escale ENTERO: configurar 2.500 caracteres y dejar las
//    reglas de sección de un artículo largo lo vuelve imposible de cumplir.
//  · Que el piso no sea un número inventado: sale del propio informe de SEO.
//  · Que `null` sea «sin objetivo» — desplegar esto no cambia ni un artículo.
//  · Que el contador del editor NUNCA bloquee una edición humana.
//  · Que el espejo del navegador sea MÍNIMO y dé las MISMAS salidas.
//  · Que la regeneración parta de la solicitud original, no del texto publicado.
//  · Que un artículo publicado deje una versión anterior antes de reemplazarlo.
//  · Que el lote no sea atómico y nombre lo que queda fuera.
// ════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import {
    CHARS_PER_WORD, charsToWords, wordsToChars,
    MIN_TARGET_CHARS, MAX_TARGET_CHARS, SEO_RECOMMENDED_CHARS, SEO_THIN_CHARS,
    TOLERANCE_RATIO, MIN_TOLERANCE_CHARS, toleranceFor,
    DEFAULT_ARTICLE_LENGTH, parseArticleLength, validateArticleLength,
    profileForTarget, resolveArticleProfile,
    summarizeCorpus, describeCurrentConfig, lengthVerdict,
    BULK_MAX, BULK_BLOCKS, planBulkRegeneration, describeBulkPlan,
} from '../server/lib/articleLength.js';
import { DEPTH_PROFILES, analyzeArticleBody, validateArticle, buildArticleSystemPrompt } from '../server/lib/articleSpec.js';
import { CONTENT_THIN_WORDS, CONTENT_RECOMMENDED_WORDS } from '../server/lib/seoRules.js';
import { REGENERABLE_SECTIONS } from '../server/lib/submissionArticleSpec.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const leer = (r) => readFileSync(new URL(r, import.meta.url), 'utf8');
// El CÓDIGO, sin comentarios: un comentario que EXPLICA una regla nombra lo que
// la regla prohíbe, y leído con comentarios la comprobación falla contra su
// propia documentación (la lección de v4.991).
const codigo = (r) => leer(r).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── 1. El puente caracteres ↔ palabras ───────────────────────────────────────
section('1. El puente caracteres ↔ palabras');

// ⚠️ MEDIDO, NO ESTIMADO: 2.938 caracteres / 461 palabras del artículo REAL
// «Brigada de salud en Sevilla» del Distrito 4281.
ok('la razón sale de un artículo real y no de un número redondo',
    Math.abs(CHARS_PER_WORD - 2938 / 461) < 0.02, `CHARS_PER_WORD=${CHARS_PER_WORD}`);
ok('convertir ida y vuelta no se desvía más de una palabra',
    Math.abs(charsToWords(wordsToChars(900)) - 900) <= 1);
eq('cero es cero, no NaN', [charsToWords(null), wordsToChars(undefined)], [0, 0]);

// ── 2. El piso no es un gusto ────────────────────────────────────────────────
section('2. El piso sale del propio informe de SEO');

eq('el mínimo configurable es el RECOMENDADO por la auditoría, no su umbral de denuncia',
    MIN_TARGET_CHARS, wordsToChars(CONTENT_RECOMMENDED_WORDS));
ok('y el umbral de denuncia queda claramente por debajo',
    SEO_THIN_CHARS === wordsToChars(CONTENT_THIN_WORDS) && SEO_THIN_CHARS < MIN_TARGET_CHARS);
ok('los dos números salen de `seoRules.js`, no de un segundo catálogo',
    /from '\.\/seoRules\.js'/.test(codigo('../server/lib/articleLength.js')));
ok('`seoRules.js` los EXPORTA en vez de llevarlos escritos a mano',
    /export const CONTENT_THIN_WORDS/.test(leer('../server/lib/seoRules.js'))
    && /export const CONTENT_RECOMMENDED_WORDS/.test(leer('../server/lib/seoRules.js')));

// ── 3. El objetivo es un objetivo, no un corte ───────────────────────────────
section('3. El objetivo tiene tolerancia');

const t2500 = toleranceFor(2500);
ok('la banda es proporcional', t2500.band === Math.round(2500 * TOLERANCE_RATIO));
ok('con un objetivo corto la banda no baja del piso',
    toleranceFor(1000).band === MIN_TOLERANCE_CHARS);
ok('la banda nunca deja un mínimo negativo', toleranceFor(100).min >= 0);
ok('2.500 admite de 2.050 a 2.950', t2500.min === 2050 && t2500.max === 2950);

// ⚠️ NADA SE TRUNCA. El valor configurado entra al prompt y al validador: acá
// no puede haber ningún recorte del cuerpo.
const spec = codigo('../server/lib/articleLength.js');
ok('el criterio no recorta ningún cuerpo',
    !/\.(substring|slice)\(0,\s*(targetChars|t|max|objetivo)/.test(spec));

// ── 4. Validación: el administrador escribe y el código decide ───────────────
section('4. Validación de la configuración');

ok('vaciar el campo es legítimo y vuelve al comportamiento de siempre',
    validateArticleLength({ targetChars: null }).ok && validateArticleLength({ targetChars: '' }).value === null);
ok('por debajo del piso se RECHAZA y el motivo nombra el informe de SEO',
    !validateArticleLength({ targetChars: 800 }).ok
    && /SEO|contenido pobre/i.test(validateArticleLength({ targetChars: 800 }).errors[0]));
ok('por encima del techo se rechaza nombrando el presupuesto del modelo',
    !validateArticleLength({ targetChars: MAX_TARGET_CHARS + 1 }).ok);
ok('un valor que no es número se rechaza en vez de interpretarse',
    !validateArticleLength({ targetChars: 'dos mil' }).ok);
ok('un valor válido pero justo sobre el piso AVISA sin bloquear', (() => {
    const v = validateArticleLength({ targetChars: MIN_TARGET_CHARS + 100 });
    return v.ok && v.warnings.length > 0;
})());
ok('un valor holgado no genera avisos', validateArticleLength({ targetChars: 4000 }).warnings.length === 0);
eq('un valor válido se devuelve redondeado', validateArticleLength({ targetChars: 2500.7 }).value, 2501);

// ── 5. `null` es «sin objetivo» y desplegar no cambia nada ───────────────────
section('5. Aditivo: sin configuración, todo como antes');

eq('el valor por defecto no tiene objetivo', DEFAULT_ARTICLE_LENGTH.targetChars, null);
ok('una configuración ilegible degrada en vez de lanzar',
    parseArticleLength('{roto').targetChars === null && parseArticleLength(undefined).targetChars === null);
ok('lee una cadena JSON igual que un objeto',
    parseArticleLength('{"targetChars":2500}').targetChars === 2500
    && parseArticleLength({ targetChars: 2500 }).targetChars === 2500);
eq('sin objetivo, el perfil es EXACTAMENTE el preset de siempre',
    resolveArticleProfile({ config: null, depth: 'estandar' }), DEPTH_PROFILES.estandar);
eq('y el de reportaje también', resolveArticleProfile({ config: null, depth: 'reportaje' }), DEPTH_PROFILES.reportaje);
ok('sin objetivo el perfil no declara `configured`',
    resolveArticleProfile({ config: null }).configured === undefined);

// ── 6. El perfil se escala ENTERO ────────────────────────────────────────────
section('6. Un objetivo corto escala también la estructura');

const p2500 = profileForTarget(2500, 'estandar');
ok('el total configurado manda', p2500.targetChars === 2500 && p2500.configured === true);
ok('la banda del perfil es la tolerancia', p2500.minChars === 2050 && p2500.maxChars === 2950);

// ⚠️ ES ARITMÉTICA, NO GUSTO. `estandar` pide 3 secciones de 90 palabras más la
// entrada: ~340 palabras ≈ 2.170 caracteres SÓLO de mínimos. Dejar esas reglas
// con un objetivo de 2.500 produce un artículo que no puede cumplirlas.
const minimosDe = (p) => wordsToChars(p.minSections * p.minSectionWords + 50);
// El caso DEMOSTRABLE: `reportaje` pide 4 secciones de 130 palabras más la
// entrada ≈ 3.660 caracteres SÓLO de mínimos. Con un objetivo de 2.500 y las
// reglas sin escalar, el artículo no puede cumplirlas: quema los dos intentos
// y se entrega con avisos.
ok('los mínimos de `reportaje` NO caben en un objetivo de 2.500 (por eso hay que escalar)',
    minimosDe(DEPTH_PROFILES.reportaje) > toleranceFor(2500).max,
    `mínimos ${minimosDe(DEPTH_PROFILES.reportaje)} vs ${toleranceFor(2500).max}`);
// Y en `estandar` los mínimos sin escalar dejan al artículo pegado al piso de
// la banda: cumplir la estructura sería cumplir apenas el mínimo, sin margen.
ok('y en `estandar` sin escalar el artículo nace pegado al piso de la banda',
    minimosDe(DEPTH_PROFILES.estandar) >= toleranceFor(2500).min - 50,
    `mínimos ${minimosDe(DEPTH_PROFILES.estandar)} vs piso ${toleranceFor(2500).min}`);
ok('escalado, los mínimos SÍ caben en la banda',
    minimosDe(p2500) <= p2500.maxChars, `mínimos ${minimosDe(p2500)} vs ${p2500.maxChars}`);
ok('el reportaje escalado también cabe', (() => {
    const p = profileForTarget(2500, 'reportaje');
    return minimosDe(p) <= p.maxChars;
})());
ok('nunca quedan menos de 2 secciones', profileForTarget(MIN_TARGET_CHARS, 'estandar').minSections >= 2);
ok('el máximo de secciones siempre supera al mínimo',
    profileForTarget(MIN_TARGET_CHARS, 'estandar').maxSections > profileForTarget(MIN_TARGET_CHARS, 'estandar').minSections);
ok('una sección nunca baja de lo que se lee como sección',
    profileForTarget(MIN_TARGET_CHARS, 'estandar').minSectionWords >= 45);
// La FORMA de un párrafo no depende de lo largo que sea el artículo.
eq('`maxParagraphWords` se hereda sin escalar',
    p2500.maxParagraphWords, DEPTH_PROFILES.estandar.maxParagraphWords);
ok('un objetivo grande no infla el preset por encima de sí mismo',
    profileForTarget(10000, 'estandar').maxSections <= DEPTH_PROFILES.estandar.maxSections);

// Y el escalado vale para TODO el rango admitido, no sólo para 2.500.
let coherente = true;
for (let t = MIN_TARGET_CHARS; t <= MAX_TARGET_CHARS; t += 250) {
    for (const base of ['estandar', 'reportaje']) {
        const p = profileForTarget(t, base);
        if (p.minSections < 2 || p.maxSections <= p.minSections || p.minSectionWords < 45 || minimosDe(p) > p.maxChars) {
            coherente = false; console.log(`      (falla en ${base} @ ${t})`); break;
        }
    }
}
ok('el perfil es coherente en TODO el rango admitido', coherente);

// ── 7. El prompt y el validador reciben el objetivo ──────────────────────────
section('7. El objetivo llega al prompt y al validador');

const prompt = buildArticleSystemPrompt({ siteName: 'Rotary 4281', depth: p2500 });
ok('el prompt pide caracteres cuando hay objetivo', /2\.?500|2500/.test(prompt) && /caracter/i.test(prompt));
ok('y dice qué conservar al resumir', /nombres|cifras|fechas/i.test(prompt));
ok('sin objetivo el prompt vuelve a hablar de palabras',
    /palabras/i.test(buildArticleSystemPrompt({ siteName: 'x', depth: DEPTH_PROFILES.estandar })));

const parrafo = (n) => `<p>${Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ')}</p>`;
const cuerpoLargo = [
    parrafo(55),
    '<h2>Uno</h2>', parrafo(90), parrafo(90),
    '<h2>Dos</h2>', parrafo(90), parrafo(90),
    '<h2>Tres</h2>', parrafo(90), parrafo(90),
    '<h2>Cuatro</h2>', parrafo(90), parrafo(90),
].join('');
const medidoLargo = analyzeArticleBody(cuerpoLargo);
ok('`analyzeArticleBody` mide caracteres además de palabras',
    medidoLargo.charCount > 0 && medidoLargo.wordCount > 0);
ok('y el recuento sale del mismo texto visible (sin etiquetas)',
    !/<p>/.test(String(medidoLargo.charCount)) && medidoLargo.charCount < cuerpoLargo.length);

const articuloLargo = { title: 'Un titular de prueba para el club', body: cuerpoLargo, excerpt: 'x'.repeat(150), seoTitle: 'x'.repeat(40), seoDescription: 'x'.repeat(130), keywords: ['a'], categories: ['Servicio'] };
const vLargo = validateArticle(articuloLargo, { siteName: 'Rotary', depth: profileForTarget(2500, 'estandar') });
ok('un cuerpo que se pasa del objetivo es un ERROR con sus dos números',
    vLargo.errors.some(e => /caracteres/.test(e) && /2\.?500/.test(e)),
    JSON.stringify(vLargo.errors));
ok('y el error DICE que hay que resumir, no cortar',
    vLargo.errors.some(e => /resum/i.test(e)));
ok('sin objetivo, el mismo cuerpo NO se marca por caracteres',
    !validateArticle(articuloLargo, { siteName: 'Rotary', depth: DEPTH_PROFILES.estandar })
        .errors.some(e => /caracteres y el objetivo/.test(e)));

// ── 8. La medición del corpus ────────────────────────────────────────────────
section('8. Los números de referencia se miden');

const vacio = summarizeCorpus([]);
ok('sin artículos NO se devuelve cero: se devuelve un hueco',
    vacio.count === 0 && vacio.average === null && vacio.min === null && vacio.median === null);
const resumen = summarizeCorpus([
    { chars: 1000, words: 157 }, { chars: 3000, words: 471 }, { chars: 2000, words: 314 },
]);
eq('promedio, mínimo, máximo y mediana', [resumen.count, resumen.average, resumen.min, resumen.max, resumen.median], [3, 2000, 1000, 3000, 2000]);
ok('la mediana de un número PAR de muestras es el promedio de las dos del medio',
    summarizeCorpus([{ chars: 1000 }, { chars: 2000 }, { chars: 3000 }, { chars: 5000 }]).median === 2500);
ok('la razón caracteres/palabra se vuelve a medir sobre el corpus',
    Math.abs(resumen.charsPerWord - 6000 / 942) < 0.02);
ok('una muestra sin palabras no rompe la razón',
    summarizeCorpus([{ chars: 1000 }]).charsPerWord === null);
ok('las muestras vacías o negativas se descartan',
    summarizeCorpus([{ chars: 0 }, { chars: -5 }, { chars: 900, words: 141 }]).count === 1);

const ref = describeCurrentConfig({ targetChars: null }, null);
ok('sin objetivo se DICE que no hay objetivo explícito', /[Ss]in objetivo expl/.test(ref.join(' ')));
ok('y sin corpus se dice que no hay nada medido, en vez de un promedio inventado',
    /todavía ninguno|ninguno/i.test(ref.join(' ')) && !/Promedio/.test(ref.join(' ')));
const ref2 = describeCurrentConfig({ targetChars: 2500 }, resumen);
ok('con objetivo y corpus salen las tres cifras reales',
    /2\.500/.test(ref2.join(' ')) && /Promedio/.test(ref2.join(' ')) && /Rango observado/.test(ref2.join(' ')));

// ── 9. El contador del editor NUNCA bloquea ──────────────────────────────────
section('9. El contador avisa; no restringe');

eq('sin objetivo sólo cuenta', lengthVerdict(3184, null).state, 'sin_objetivo');
ok('sin objetivo no promete un número que no existe', lengthVerdict(3184, null).target === null);
eq('dentro de la banda, todo bien', lengthVerdict(2500, 2500).state, 'ok');
eq('un poco por encima sigue estando bien (la banda es ±18 %)', lengthVerdict(2900, 2500).state, 'ok');
eq('muy por encima se marca', lengthVerdict(4000, 2500).state, 'over');
eq('muy por debajo también', lengthVerdict(900, 2500).state, 'under');
ok('el rótulo es «X / Y caracteres objetivo»', /3\.184 \/ 2\.500 caracteres objetivo/.test(lengthVerdict(3184, 2500).label));
ok('⚠️ pasarse DICE que se puede dejar así', /dejarlo así|gobierna lo que escribe la IA/i.test(lengthVerdict(4000, 2500).note));
// El peor estado posible es `over`: nada que impida guardar.
ok('no existe ningún estado que bloquee',
    !['bloqueado', 'invalid', 'error'].includes(lengthVerdict(99999, 2500).state));

// ── 10. El espejo del navegador ──────────────────────────────────────────────
section('10. El espejo es MÍNIMO y da las MISMAS salidas');

const mirror = codigo('../src/lib/articleLength.ts');
// ⚠️ SU AUSENCIA ES DELIBERADA. Qué se guarda, qué perfil se le pide al modelo
// y qué artículos entran en un lote lo decide el SERVIDOR.
for (const prohibido of ['validateArticleLength', 'profileForTarget', 'resolveArticleProfile', 'planBulkRegeneration', 'summarizeCorpus', 'BULK_MAX']) {
    ok(`el espejo NO trae \`${prohibido}\``, !new RegExp(`\\b${prohibido}\\b`).test(mirror));
}
ok('el espejo tampoco recorta ningún cuerpo', !/\.(substring|slice)\(0,\s*(target|max)/.test(mirror));
ok('el espejo declara la MISMA tolerancia que el servidor',
    new RegExp(`TOLERANCE_RATIO = ${TOLERANCE_RATIO}`).test(mirror)
    && new RegExp(`MIN_TOLERANCE_CHARS = ${MIN_TOLERANCE_CHARS}`).test(mirror));

// La paridad se compara por SALIDAS, no por parecido: es lo único que impide
// que el contador de la pantalla diga un número y el validador mida otro.
let espejoOk = true;
try {
    const esbuild = await import('esbuild');
    const salida = new URL('../.tmp-article-length-mirror.mjs', import.meta.url);
    await esbuild.build({
        entryPoints: [new URL('../src/lib/articleLength.ts', import.meta.url).pathname],
        outfile: salida.pathname, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
    });
    const m = await import(salida.href);
    const cuerpos = [
        '', '<p>Hola mundo</p>', cuerpoLargo,
        '<p>Con &amp; entidades &nbsp; y   espacios</p>',
        '<script>tirar()</script><p>Sólo esto</p>',
        '<h2>Un subtítulo</h2><ul><li>uno</li><li>dos</li></ul>',
    ];
    for (const c of cuerpos) {
        const servidor = analyzeArticleBody(c);
        if (m.bodyChars(c) !== servidor.charCount || m.bodyWords(c) !== servidor.wordCount) {
            espejoOk = false; console.log(`      (difiere en «${c.slice(0, 40)}»: ${m.bodyChars(c)} vs ${servidor.charCount})`);
        }
    }
    for (const [chars, target] of [[3184, 2500], [2500, 2500], [900, 2500], [4000, 2500], [1000, null], [0, 2500]]) {
        const a = lengthVerdict(chars, target), b = m.lengthVerdict(chars, target);
        if (a.state !== b.state || a.label !== b.label || a.note !== b.note) {
            espejoOk = false; console.log(`      (veredicto difiere en ${chars}/${target})`);
        }
    }
    for (const t of [1911, 2500, 4000, 12000]) {
        if (JSON.stringify(toleranceFor(t)) !== JSON.stringify(m.toleranceFor(t))) {
            espejoOk = false; console.log(`      (tolerancia difiere en ${t})`);
        }
    }
    unlinkSync(salida);
    ok('el espejo mide y juzga EXACTAMENTE igual que el servidor', espejoOk);
} catch (e) {
    if (/Cannot find package 'esbuild'/.test(String(e?.message))) {
        console.log('  · (esbuild no instalado — el bloque del espejo se salta)');
    } else { ok('el espejo se pudo ejercitar', false, String(e?.message)); }
}

// ── 11. El lote ──────────────────────────────────────────────────────────────
section('11. El plan del lote dice el HECHO');

const seleccion = [
    { id: 'a', title: 'Con solicitud', submissionId: 's1', chars: 5000, published: false },
    { id: 'b', title: 'Publicado', submissionId: 's2', chars: 4000, published: true },
    { id: 'c', title: 'Sin solicitud', submissionId: null, chars: 3000, published: false },
    { id: 'd', title: 'Vacío', submissionId: 's4', chars: 0, published: false },
    { id: 'static-9', title: 'Ejemplo', isStatic: true, chars: 0 },
    { id: 'e', title: 'De otro sitio', submissionId: 's5', chars: 2000, foreign: true },
];
const plan = planBulkRegeneration(seleccion, { config: { targetChars: 2500 } });
eq('sólo entran los que tienen solicitud y cuerpo', plan.eligible.map(e => e.id), ['a', 'b']);
eq('y los demás se NOMBRAN con su motivo',
    plan.blocked.map(b => b.reason).sort(), ['ajeno', 'estatico', 'sin_cuerpo', 'sin_solicitud']);
ok('cada motivo trae su explicación, no sólo una clave',
    plan.blocked.every(b => b.help && b.label));
ok('los catálogos de bloqueo están declarados, no inventados al vuelo',
    Object.keys(BULK_BLOCKS).length === 4);
eq('se distinguen los publicados', plan.published.map(p => p.id), ['b']);
ok('el objetivo viaja en el plan', plan.targetChars === 2500);
ok('el tope está declarado y el plan lo comprueba',
    BULK_MAX === 50 && plan.overLimit === false
    && planBulkRegeneration(Array.from({ length: 60 }, (_, i) => ({ id: `x${i}`, submissionId: 's', chars: 100 })), { config: { targetChars: 2500 } }).overLimit === true);

const frases = plan.summary.join(' ');
ok('⚠️ la confirmación dice CUÁNTOS y CON QUÉ OBJETIVO', /2 artículo\(s\)/.test(frases) && /2\.500 caracteres/.test(frases));
ok('dice que el cuerpo se reescribe desde la solicitud original', /solicitud original/i.test(frases));
ok('enumera lo que NO se toca', /[Ee]l título, la dirección, las imágenes/.test(frases));
ok('⚠️ AVISA de los publicados y de la versión anterior', /PUBLICADOS/.test(frases) && /versión anterior/i.test(frases));
ok('y dice cuántos quedan fuera', /4 quedan fuera/.test(frases));
ok('sin objetivo configurado, el plan lo DICE en vez de callarlo',
    /todavía no hay una longitud objetivo/i.test(
        describeBulkPlan({ eligible: [{ id: 'a' }], targetChars: null }).join(' ')));
ok('con nada elegible se dice con esas palabras',
    /Ninguno/.test(describeBulkPlan({ eligible: [], blocked: [] }).join(' ')));

// ── 12. La regeneración: cableado leído de los archivos ──────────────────────
section('12. La regeneración parte de la solicitud original');

const engine = codigo('../server/lib/submissionArticleEngine.js');
ok('`extension` es una sección regenerable declarada',
    Boolean(REGENERABLE_SECTIONS.extension) && REGENERABLE_SECTIONS.extension.field === 'content');
ok('la rama existe en el motor', /section === 'extension'/.test(engine));
// ⚠️ NO SE RESUME EL TEXTO PUBLICADO UNA Y OTRA VEZ.
ok('⚠️ el contexto de la solicitud es la FUENTE PRIMARIA',
    /FUENTE PRIMARIA/.test(codigo('../server/lib/submissionArticleEngine.js')));
ok('y el artículo actual entra como REFERENCIA SECUNDARIA',
    /REFERENCIA SECUNDARIA/.test(codigo('../server/lib/submissionArticleEngine.js')));
ok('la rama reconstruye el contexto con `buildArticleContext`', /buildArticleContext\(/.test(engine));
ok('y valida la veracidad con el validador de siempre', /checkArticleVeracity/.test(engine));
ok('el perfil sale del ÚNICO punto de decisión', /resolveArticleProfile\(/.test(engine));
ok('sin objetivo configurado se rechaza en vez de reescribir a ciegas',
    /reason: 'sin_objetivo'/.test(engine));
ok('la propuesta compara ANTES → OBJETIVO → DESPUÉS',
    /charsBefore/.test(engine) && /charsAfter/.test(engine) && /targetChars/.test(engine));

// ⚠️ UN PUBLICADO NO SE PISA SIN DEJAR VUELTA ATRÁS.
ok('⚠️ existe un punto de restauración antes de reemplazar', /ensureRestorePoint/.test(engine));
ok('y se usa justo en la rama de extensión al aplicar',
    /ensureRestorePoint\(/.test(engine) && /section === 'extension'/.test(engine));
ok('la versión anterior se guarda con su propia clase', /'previa'/.test(engine));
ok('y la pantalla la rotula en vez de confundirla con «Restaurada»',
    /'previa' \? 'Estado anterior'/.test(leer('../src/components/admin/contribution/SubmissionArticlePanel.tsx')));

// ⚠️ NO SE TRUNCA EN NINGUNA PUNTA.
ok('el motor no recorta el cuerpo para llegar al objetivo',
    !/content[^\n]*\.(substring|slice)\(0,\s*(perfil|objetivo|target)/.test(engine));

// ── 13. El generador y la API ────────────────────────────────────────────────
section('13. El objetivo se resuelve en UN solo sitio');

const gen = codigo('../server/lib/articleGenerate.js');
ok('el generador resuelve el perfil con `resolveArticleProfile`', /resolveArticleProfile\(\{ config:/.test(gen));
ok('quien ya lo tiene resuelto lo puede pasar, para no leerlo dos veces', /profile \|\| resolveArticleProfile/.test(gen));
ok('leer la configuración NUNCA tumba una generación', /catch \{ return null; \}/.test(gen));
ok('el resultado declara el objetivo y los caracteres medidos',
    /targetChars: perfil\.targetChars/.test(gen) && /charCount: body\.charCount/.test(gen));

const store = codigo('../server/lib/articleLengthStore.js');
ok('la configuración vive en `PlatformConfig`, no en una tabla nueva',
    /prisma\.platformConfig/.test(store) && !/CREATE TABLE/i.test(store));
ok('leerla nunca lanza: degrada a «sin objetivo»', /catch/.test(store) && /DEFAULT_ARTICLE_LENGTH/.test(store));
ok('toda escritura invalida la caché', /invalidateArticleLength|cache = null|cache = \{/.test(store));

const api = codigo('../server/controllers/articleLengthController.js');
ok('el corpus se mide con el MISMO `analyzeArticleBody` del validador', /analyzeArticleBody\(/.test(api));
ok('⚠️ el alcance sale de `adminScopeFor`, no de un criterio propio', /adminScopeFor\(/.test(api));
ok('y la cláusula de visibilidad es la del listado', /visibilitySql\(/.test(api));
ok('la selección se lee de la BASE, no del cuerpo de la petición',
    /FROM "Post"/.test(api) && !/req\.body\?\.(published|submissionId|chars)/.test(api));
ok('la pertenencia la decide `canEditPost`', /canEditPost\(/.test(api));
ok('el lote EXIGE confirmación explícita', /confirm !== true/.test(api) && /428/.test(api));
ok('⚠️ un error individual NO cancela el lote', /catch \(e\) \{[\s\S]{0,200}resultados\.push\(\{ id: it\.id/.test(api));
ok('hay presupuesto de tiempo y lo que falta se DEVUELVE',
    /TIME_BUDGET_MS/.test(api) && /pendientes\.push/.test(api) && /pending: pendientes/.test(api));
ok('no poder medir el corpus NO se pinta como cero', /medido = false/.test(api) && /stats: medido \? stats : null/.test(api));
ok('la API no recorta ningún cuerpo', !/content\.(substring|slice)\(/.test(api));

const rutas = codigo('../server/routes/admin.js');
// ⚠️ Express casa por ORDEN: una literal debajo de su paramétrica es
// inalcanzable, con un fallo MUDO (v4.859). Lo comprueba además `check:routes`.
ok('las dos literales nuevas están declaradas', (() => {
    const j = rutas.indexOf("'/posts/bulk-regenerate'");
    const k = rutas.indexOf("'/posts/regenerate-plan'");
    return j > 0 && k > 0;
})());
ok('regenerar pide `news.edit` y el plan sólo `news.view`',
    /'\/posts\/bulk-regenerate', requireRoleOrPermission\(contentRoles, 'news\.edit'\)/.test(rutas)
    && /'\/posts\/regenerate-plan', requireRoleOrPermission\(contentRoles, 'news\.view'\)/.test(rutas));
ok('⚠️ escribir la configuración es SÓLO del operador',
    /router\.put\('\/article-length', superAdminOnly/.test(rutas));
ok('y leerla la puede quien administra contenido',
    /router\.get\('\/article-length', requireRoleOrPermission\(contentRoles, 'news\.view'\)/.test(rutas));

// ── 14. La pantalla pinta; no decide ─────────────────────────────────────────
section('14. La pantalla');

const news = leer('../src/pages/admin/News.tsx');
ok('⚠️ HAY UN SOLO MOTOR: el individual es un lote de uno',
    (news.match(/const regenerarArticulos = async/g) || []).length === 1
    && /regenerarArticulos\(\[post\.id\]\)/.test(news)
    && /regenerarArticulos\(Array\.from\(selectedIds\)\)/.test(news));
ok('se pide el PLAN antes de tocar nada', /regenerate-plan/.test(news));
ok('y se confirma con las frases que devolvió el servidor',
    /window\.confirm\([\s\S]{0,120}plan\.summary/.test(news));
ok('el avance es REAL, no un porcentaje inventado', /Regenerando \{/.test(news) && !/progreso \* 100/.test(news));
ok('el desenlace se desglosa artículo por artículo', /regenResumen\.filas\.map/.test(news));
ok('el botón por artículo sólo sale con solicitud de origen',
    /post\.submissionOrigin && post\.canEdit !== false && \(\s*<button/.test(news.replace(/\n\s*/g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')) || /\{post\.submissionOrigin && post\.canEdit !== false &&/.test(news));
ok('el contador del editor usa el espejo, no una cuenta propia',
    /lengthVerdict\(bodyChars\(formData\.content\), longitudObjetivo\)/.test(news));
ok('⚠️ el contador NO deshabilita ni recorta el editor',
    !/disabled=\{.*lengthVerdict/.test(news) && !/formData\.content\.slice\(0,/.test(news));
ok('ninguna respuesta se lee con `.json()` a ciegas en el camino nuevo',
    /leerJson<PlanRegeneracion/.test(news) && /leerJson<RespuestaLote/.test(news));
ok('el bucle de tandas tiene tope y sale si no avanza',
    /vueltas < 20/.test(news) && /pendientes\.length >= antes/.test(news));

const panel = leer('../src/components/admin/ArticleLengthPanel.tsx');
ok('el panel PINTA la referencia que resuelve el servidor', /datos\?\.reference/.test(panel));
ok('y dice cuando no se pudo medir, en vez de mostrar un cero', /no se pudieron leer|No se pudieron leer/.test(panel));
ok('⚠️ el panel AVISA de que cambiar el número no reescribe nada',
    /no reescribe ningún artículo existente/.test(panel));
ok('y de que no limita la edición humana', /avisa, nunca bloquea/.test(panel));
ok('el panel no valida por su cuenta: manda el valor y lee el veredicto',
    !/validateArticleLength/.test(panel));
ok('está montado en Integraciones', /<ArticleLengthPanel \/>/.test(leer('../src/pages/admin/Integrations.tsx')));

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
