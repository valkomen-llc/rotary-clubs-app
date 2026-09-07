#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL ASISTENTE DE REDACCIÓN DE NOTICIAS.  npm run test:article
// v4.891.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED.
//
// Lo que protege:
//  · Que el error del proveedor llegue TEXTUAL a la pantalla. Lo reportado fue
//    «La IA dice: Intenta de nuevo en unos segundos» — un mensaje que no
//    distingue una credencial ausente de un presupuesto de tokens agotado.
//  · Que una respuesta VACÍA no se trate como éxito.
//  · Que un JSON truncado se rescate en vez de tirarse entero.
//  · Que las longitudes salgan de `seoSpec.LIMITS` y no de un segundo catálogo.
//  · Que el artículo generado no nazca ya señalado por nuestra propia auditoría.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    BODY, MAX_KEYWORDS, MAX_CATEGORIES, ALLOWED_BODY_TAGS,
    buildArticleSystemPrompt, buildArticleUserPrompt,
    parseArticle, closeTruncated, normalizeArticle,
    analyzeArticleBody, validateArticle, DEPTH_PROFILES, depthOf, repairArticle,
} from '../server/lib/articleSpec.js';
import {
    isAccountLevelFailure, describeProviderFailure,
    buildFallbackChain, PROVIDER_FALLBACK_ORDER,
} from '../server/lib/ai-router.js';
import { LIMITS } from '../server/lib/seoSpec.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

// El contexto REAL del reporte, no uno inventado para que la prueba pase.
const CONTEXTO = `DONACION DE 12 FILTROS DE AGUA DEL CLUB BOGOTA CHAPINERO ENTREGADOS POR EL CLUB CALI SAN FERNANDO, EN CORREGIMIENTOS DE EL HORMIGUERO Y CASCAJAL, EN ZONA RURAL DE CALI
A la Comunidad se explicó la utilidad del filtro, sus componentes, instalación, mantenimiento y cuidado.`;

const parrafo = (n) => `<p>${Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ')}</p>`;
// Un artículo DESARROLLADO: cada sección con dos bloques y su cuerpo. Hasta
// v4.1000 el fixture tenía secciones de un párrafo corto y se llamaba
// «correcto» — o sea que la prueba daba por bueno justo lo que el cliente
// reportó como débil.
const cuerpoBueno = [
    parrafo(55),
    '<h2>Cómo funciona el filtro</h2>', parrafo(60), parrafo(55), '<ul><li>Un punto</li><li>Otro punto</li></ul>',
    '<h2>La instalación en El Hormiguero</h2>', parrafo(60), parrafo(55),
    '<h2>El mantenimiento que queda en la comunidad</h2>', parrafo(85), parrafo(60),
].join('');

// La forma exacta del reporte: buena estructura, secciones de una sola frase.
const cuerpoFlojo = [
    parrafo(50),
    '<h2>Coordinación y puntos de entrega</h2>', parrafo(55),
    '<h2>Colaboración entre clubes rotarios</h2>', parrafo(55),
    '<h2>El compromiso de Sevilla Capital Cafetera</h2>', parrafo(55),
].join('');

// ── 1. La estructura viene de seoSpec, no de un segundo catálogo ─────
section('1. Un solo catálogo de límites');

const sys = buildArticleSystemPrompt({ siteName: 'Distrito 4281' });
ok('el prompt pide el máximo real del título', sys.includes(String(LIMITS.title.max)));
ok('el prompt pide el mínimo real del título', sys.includes(String(LIMITS.title.min)));
ok('el prompt pide el rango real de la descripción',
    sys.includes(String(LIMITS.description.min)) && sys.includes(String(LIMITS.description.max)));

// ⚠️ El prompt anterior pedía «Titular (máx 70 car)» mientras LIMITS.title.max
// es 60: el artículo nacía con un hallazgo de SEO encima. Un 70 suelto en el
// prompt es la marca de que alguien volvió a escribir el límite a mano.
ok('el prompt NO reintroduce el 70 del titular viejo', !/máx\s*70\s*car/i.test(sys));

const spec = readFileSync(new URL('../server/lib/articleSpec.js', import.meta.url), 'utf8');
ok('articleSpec no escribe sus propios números de título/descripción',
    !/title:\s*\{\s*min:/.test(spec) && !/description:\s*\{\s*min:/.test(spec));
ok('el criterio importa los límites de seoSpec', /from '\.\/seoSpec\.js'/.test(spec));

// ── 2. El cuerpo, medido como lo mide la auditoría ───────────────────
section('2. El cuerpo se mide con el criterio de la auditoría');

const rules = readFileSync(new URL('../server/lib/seoRules.js', import.meta.url), 'utf8');
const umbralAuditoria = Number(/wordCount\s*<\s*(\d+)/.exec(rules)?.[1]);
const recomendado = Number(/recommended:\s*(\d+)/.exec(rules)?.[1]);
ok('la auditoría marca contenido pobre por debajo de 150', umbralAuditoria === 150);

// ⚠️ El mínimo del generador es el RECOMENDADO de la auditoría, no su umbral de
// denuncia. Un artículo que nace justo por encima de 150 pasa el informe por un
// pelo y no compite por nada.
eq('el mínimo del generador es el recomendado de la auditoría', BODY.minWords, recomendado);
ok('el objetivo apunta bastante más alto que el mínimo', BODY.targetWords >= BODY.minWords * 2);
ok('el techo deja margen para el resto del JSON', BODY.maxWords > BODY.targetWords && BODY.maxWords <= 2000);

const medido = analyzeArticleBody(cuerpoBueno);
// 430 en párrafos + 16 en los tres H2 + 4 en la lista. Se cuenta TODO el texto
// visible, igual que `seoRules.analyzeBody`: un H2 lo lee Google.
ok('cuenta las palabras del texto visible, no del HTML', medido.wordCount === 450, `dio ${medido.wordCount}`);
eq('cuenta las secciones H2', medido.h2Count, 3);
ok('detecta la lista', medido.hasList);
eq('no hay H1 en el cuerpo', medido.h1Count, 0);
ok('mide el párrafo más largo', medido.longestParagraph === 85, `dio ${medido.longestParagraph}`);

// ⚠️ El total de palabras NO dice si el artículo está desarrollado: eso lo dice
// la sección. Es el defecto reportado con el artículo de Carmen Elena Román.
eq('parte el cuerpo en secciones', medido.sections.length, 3);
ok('una sección desarrollada se mide con sus bloques y sus palabras',
    medido.sections[0].blocks === 3 && medido.sections[0].words === 119, JSON.stringify(medido.sections[0]));
ok('la lista cuenta como bloque, no exige un segundo párrafo',
    analyzeArticleBody('<h2>Con lista</h2>' + parrafo(95) + '<ul><li>a</li><li>b</li></ul>').sections[0].blocks === 2);
ok('una cita suelta también cuenta como bloque',
    analyzeArticleBody('<h2>Con cita</h2>' + parrafo(95) + '<blockquote>Fue un día de servicio</blockquote>').sections[0].blocks === 2);
ok('una cita con párrafo adentro no se cuenta dos veces',
    analyzeArticleBody('<h2>Con cita</h2>' + parrafo(95) + '<blockquote><p>Fue un día de servicio</p></blockquote>').sections[0].blocks === 2);

// ── 3. El H1 del cuerpo es un error, no un detalle ───────────────────
section('3. El cuerpo no lleva H1');

// La página pública ya pinta el título como <h1> (`BlogPost.tsx`): un H1 dentro
// del cuerpo produce DOS en la misma página, que es lo que Google señala.
const blog = readFileSync(new URL('../src/pages/BlogPost.tsx', import.meta.url), 'utf8');
ok('la página pública pinta el título como h1', /motion\.h1|<h1/.test(blog));
ok('el prompt prohíbe el h1 en el cuerpo', /NO uses <h1>/i.test(sys));

const conH1 = validateArticle({
    title: 'Doce filtros de agua para El Hormiguero y Cascajal',
    seoTitle: 'Doce filtros de agua para El Hormiguero y Cascajal',
    seoDescription: 'El Club Cali San Fernando entregó doce filtros donados por Bogotá Chapinero en zona rural de Cali, con capacitación a la comunidad.',
    body: '<h1>Titular</h1>' + cuerpoBueno,
});
ok('un H1 en el cuerpo es error, no aviso', conH1.errors.some(e => /<h1>/.test(e)));

// ── 4. El modelo escribe, el código decide ───────────────────────────
section('4. Las reglas rotas se nombran, con su número');

const corto = validateArticle({
    title: 'Filtros de agua entregados en zona rural de Cali',
    seoTitle: 'Filtros de agua entregados en zona rural de Cali',
    seoDescription: 'El Club Cali San Fernando entregó doce filtros donados por Bogotá Chapinero en zona rural de Cali, con capacitación a la comunidad.',
    body: '<h2>Uno</h2><p>Muy corto.</p>',
});
ok('un cuerpo pobre es error', corto.errors.some(e => e.includes('palabras')));
ok('el error DICE cuántas palabras hay y cuántas hacen falta',
    corto.errors.some(e => /\d+ palabras.*al menos \d+/.test(e)));
ok('también señala que faltan secciones', corto.errors.some(e => /secciones/.test(e)));

const largo = validateArticle({
    title: 'Un titular que se pasa holgadamente del máximo permitido por el buscador de Google',
    seoTitle: 'Otro título que también se pasa del máximo permitido por Google sin ninguna duda',
    seoDescription: 'Corta.',
    body: cuerpoBueno,
});
ok('un título largo se nombra con su longitud', largo.errors.some(e => /caracteres y el máximo es 60/.test(e)));
ok('una descripción corta se nombra con su mínimo', largo.errors.some(e => /necesita al menos 70/.test(e)));

// Mayúsculas sostenidas: es exactamente como llegó el contexto del reporte, y un
// titular así se lee como un grito en el resultado de Google.
const gritado = validateArticle({
    title: 'DONACION DE DOCE FILTROS DE AGUA EN ZONA RURAL DE CALI',
    seoTitle: 'Doce filtros de agua para El Hormiguero y Cascajal, Cali',
    seoDescription: 'El Club Cali San Fernando entregó doce filtros donados por Bogotá Chapinero en zona rural de Cali, con capacitación a la comunidad.',
    body: cuerpoBueno,
});
ok('las mayúsculas sostenidas del titular se rechazan', gritado.errors.some(e => /mayúsculas/i.test(e)));

// ── 5. Aviso y error no son lo mismo ─────────────────────────────────
section('5. Un aviso no bloquea');

const sinLista = validateArticle({
    title: 'Doce filtros de agua para El Hormiguero y Cascajal',
    seoTitle: 'Doce filtros de agua para El Hormiguero y Cascajal',
    seoDescription: 'El Club Cali San Fernando entregó doce filtros donados por Bogotá Chapinero en zona rural de Cali, con capacitación a la comunidad.',
    body: cuerpoBueno.replace('<ul><li>Un punto</li><li>Otro punto</li></ul>', ''),
});
// Tratar los avisos como errores convierte cualquier observación en un bloqueo
// y se dejan de leer.
eq('faltar la lista no impide entregar', sinLista.errors.length, 0);
ok('pero se dice', sinLista.warnings.some(w => /lista/i.test(w)));

const bueno = validateArticle({
    title: 'Doce filtros de agua para El Hormiguero y Cascajal',
    seoTitle: 'Doce filtros de agua para El Hormiguero y Cascajal',
    seoDescription: 'El Club Cali San Fernando entregó doce filtros donados por Bogotá Chapinero en zona rural de Cali, con capacitación a la comunidad.',
    body: cuerpoBueno,
});
eq('un artículo correcto no tiene errores', bueno.errors, []);

// ── 6. El JSON truncado se rescata ───────────────────────────────────
section('6. Una respuesta cortada no se tira entera');

// Es lo que produce un modelo que agota su presupuesto: la respuesta llega sin
// la llave de cierre y un match(/\{[\s\S]*\}/) no casa con NADA.
const truncado = `{
  "noticia_titulo": "Doce filtros de agua para El Hormiguero y Cascajal",
  "seo_titulo": "Doce filtros de agua para El Hormiguero",
  "noticia_cuerpo": "<p>El Club Cali San Fern`;
const r1 = parseArticle(truncado);
ok('se rescatan los campos completos', r1.data?.noticia_titulo === 'Doce filtros de agua para El Hormiguero y Cascajal');
ok('y se declara que venía truncado', r1.truncated === true);
ok('el campo cortado se descarta, no se inventa', !r1.data?.noticia_cuerpo);

eq('un JSON completo no se marca truncado', parseArticle('{"a":1}').truncated, false);
eq('el envuelto en markdown se limpia', parseArticle('```json\n{"a":1}\n```').data, { a: 1 });
eq('sin nada que leer devuelve null', parseArticle('lo siento, no puedo').data, null);
eq('vacío devuelve null', parseArticle('').data, null);
// Sin un solo campo completo no hay nada que rescatar: cerrar la llave daría un
// objeto vacío presentado como respuesta del modelo.
eq('un corte antes del primer campo no rescata nada', parseArticle('{"noticia_tit').data, null);
eq('closeTruncated no toca un objeto ya cerrado', closeTruncated('{"a":1}'), null);

// ── 7. Reparar es ajustar, no inventar ───────────────────────────────
section('7. Agotados los intentos, se entrega lo ajustable');

const { article: rep, repaired } = repairArticle({
    title: 'Un titular larguísimo que se pasa del máximo permitido por el buscador de Google y sigue',
    body: cuerpoBueno,
    seoDescription: '',
});
ok('el titular se recorta', rep.title.length <= LIMITS.title.max);
ok('sin partir palabras', !/\w-…$/.test(rep.title) && / /.test(rep.title));
ok('el seo_titulo se deriva del titular', Boolean(rep.seoTitle) && rep.seoTitle.length <= LIMITS.title.max);
ok('la descripción se deriva del cuerpo', rep.seoDescription.length > 0 && rep.seoDescription.length <= LIMITS.description.max);
ok('el slug se deriva del titular', /^[a-z0-9-]+$/.test(rep.slug));
ok('se declara qué se reparó', repaired.length > 0);

// ⚠️ Reparar NO alarga un cuerpo pobre: si el artículo es corto sigue siendo
// corto, y la validación lo sigue diciendo. Inventar párrafos para pasar el
// umbral sería exactamente lo que este módulo no puede hacer.
const { article: repCorto } = repairArticle({ title: 'Filtros de agua en zona rural de Cali', body: '<h2>Uno</h2><p>Corto.</p>' });
ok('un cuerpo pobre sigue siendo pobre tras reparar',
    validateArticle(repCorto).errors.some(e => /palabras/.test(e)));

// ── 8. El motivo llega TEXTUAL a la pantalla ─────────────────────────
section('8. El error no se esconde');

const ruta = readFileSync(new URL('../server/routes/ai.js', import.meta.url), 'utf8');
const bloque = ruta.slice(ruta.indexOf("router.post('/generate-article'"), ruta.indexOf('export default router'));

// ⚠️ Esto es EL defecto reportado: se respondía 200 con un texto genérico, así
// que el navegador daba la petición por buena y el motivo real se perdía.
ok('no se responde 200 con un error dentro', !/status\(200\)[\s\S]{0,120}error:/.test(bloque));
ok('el genérico ya no existe', !/Intenta de nuevo en unos segundos/.test(bloque));
ok('un fallo del proveedor sale con estado de error', /status\(502\)/.test(bloque));
ok('el mensaje del proveedor se propaga', /error\.message/.test(bloque));

const news = readFileSync(new URL('../src/pages/admin/News.tsx', import.meta.url), 'utf8');
const handler = news.slice(news.indexOf('const handleGenerateArticle'), news.indexOf('const handleSubmit'));
ok('la pantalla muestra el motivo del servidor', /data\?\.error/.test(handler));
ok('y distingue sesión vencida de fallo del proveedor', /mensajeDeFalloIA/.test(handler));
ok('los avisos se muestran, no se descartan', /warnings/.test(handler));

// ⚠️ Con dos criterios de longitud, la pantalla recortaría a un límite y la
// auditoría aplicaría otro. El recorte vive en el servidor, en un solo sitio.
ok('la pantalla ya no recorta por su cuenta', !/safeTrim/.test(handler));

// ── 9. Una respuesta vacía no es un éxito ────────────────────────────
section('9. El router no da por buena una respuesta sin texto');

const router = readFileSync(new URL('../server/lib/ai-router.js', import.meta.url), 'utf8');
ok('sólo se devuelve texto con contenido', /if \(res\.ok && rawText\.trim\(\)\) return rawText;/.test(router));
ok('una respuesta vacía sigue probando el siguiente modelo', /if \(res\.ok\) \{[\s\S]{0,1200}?lastError = describeEmpty[\s\S]{0,80}continue;/.test(router));
ok('y el motivo se nombra', /describeEmpty/.test(router));
ok('MAX_TOKENS se distingue del filtro de contenido',
    /MAX_TOKENS/.test(router) && /SAFETY/.test(router));

// El razonamiento gasta del MISMO presupuesto que la respuesta: es la causa de
// que un artículo largo saliera vacío o cortado.
ok('el razonamiento se acota en los modelos que lo tienen', /thinkingBudget: 0/.test(router));
ok('sólo en los modelos que lo declaran', /supportsThinking/.test(router));
ok('quien llama puede subir el presupuesto', /options\.maxTokens \|\| config\.max_tokens/.test(router));
// v4.1000: el bucle —y con él el presupuesto— vive en articleGenerate.js,
// que la ruta y el workflow de Solicitudes comparten.
const generador = readFileSync(new URL('../server/lib/articleGenerate.js', import.meta.url), 'utf8');
ok('el artículo pide un presupuesto propio', /maxTokens: ARTICLE_MAX_TOKENS/.test(generador) && /generateArticleFromContext\(/.test(ruta));

// El Set de deduplicación vivía DENTRO del bucle: nacía vacío en cada vuelta y
// no deduplicaba nada, así que el modelo por defecto se llamaba dos veces.
const bucle = router.slice(router.indexOf('let lastError'), router.indexOf('throw new Error(`Error al conectar con Gemini'));
ok('el registro de modelos ya intentados vive fuera del bucle',
    bucle.indexOf('const seen = new Set()') < bucle.indexOf('for (const'));

// ── 10. El prompt no invita a inventar ───────────────────────────────
section('10. No se inventan datos');

ok('el prompt lo dice explícitamente', /NO INVENTAS DATOS/.test(sys));
ok('y dice qué hacer con lo que falta', /en vez de completarlo/i.test(sys));
ok('las etiquetas permitidas se enumeran', ALLOWED_BODY_TAGS.every(t => sys.includes(`<${t}>`)));

const user = buildArticleUserPrompt({ context: CONTEXTO, brokenRules: ['El titular tiene 84 caracteres y el máximo es 60.'] });
ok('el reintento lleva el contexto original', user.includes('CASCAJAL'));
ok('y la regla concreta que se rompió', user.includes('84 caracteres'));
// El proveedor trunca el prompt de USUARIO (no el del sistema), así que las
// reglas largas viven arriba y aquí sólo va lo justo.
ok('el mensaje del usuario se mantiene corto', buildArticleUserPrompt({ context: CONTEXTO }).length < 2500);

// ── 11. Normalización de la respuesta ────────────────────────────────
section('11. Los alias del modelo se resuelven en un solo sitio');

const n = normalizeArticle({
    title: 'Desde el alias en inglés',
    content: '<p>Cuerpo</p>',
    categories: 'Agua, Agua, Salud, Comunidad, Extra',
    keywords: 'filtros, agua, cali, rural, salud, comunidad, rotary, donacion, sobra',
});
eq('toma el alias en inglés', n.title, 'Desde el alias en inglés');
eq('las categorías se deduplican y se acotan', n.categories, ['Agua', 'Salud', 'Comunidad']);
ok('las categorías respetan su tope', n.categories.length <= MAX_CATEGORIES);
eq('las keywords se acotan', n.keywords.split(', ').length, MAX_KEYWORDS);
eq('un campo ausente queda vacío, no inventado', n.socialCopy, '');

// ── 12. Un fallo de proveedor no tumba toda la IA ────────────────────
section('12. La avería de un proveedor tiene respaldo');

// El mensaje REAL del segundo reporte, tal como lo devolvió Google.
const DUNNING = 'Lightning dunning decision is deny for project: projects/746648100373';

ok('un 403 es fallo de cuenta', isAccountLevelFailure(403, DUNNING));
ok('un 401 también', isAccountLevelFailure(401, ''));
ok('una deuda se reconoce por el texto aunque el estado no lo diga',
    isAccountLevelFailure(500, DUNNING));
// ⚠️ Un modelo que no existe NO es un fallo de cuenta: ahí sí vale probar el
// siguiente candidato con la misma clave.
ok('un modelo inexistente no es fallo de cuenta',
    !isAccountLevelFailure(404, 'models/gemini-9 is not found'));

const dicho = describeProviderFailure('google', 403, DUNNING);
ok('el diagnóstico nombra la FACTURACIÓN', /facturaci[óo]n/i.test(dicho));
ok('y el proyecto concreto', dicho.includes('746648100373'));
ok('y dice que no se arregla desde la plataforma', /no desde la plataforma/i.test(dicho));
// El texto original se conserva: es lo que se busca en el soporte del proveedor.
ok('el mensaje original viaja entre paréntesis', dicho.includes(DUNNING));

ok('una credencial inválida se dice distinto',
    /no es v[áa]lida/i.test(describeProviderFailure('openai', 401, 'Incorrect API key provided')));
ok('y una cuota agotada también',
    /cuota/i.test(describeProviderFailure('openai', 429, 'insufficient_quota')));
ok('la API deshabilitada se distingue de la deuda',
    /deshabilitada/i.test(describeProviderFailure('google', 403, 'SERVICE_DISABLED')));

// La cadena de respaldo: sólo proveedores CON credencial y nunca el que falló.
const conOpenAI = { GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' };
eq('con Gemini caído se cae a OpenAI', buildFallbackChain('gemini-2.5-flash', { env: conOpenAI }), ['gpt-4o']);
eq('un proveedor sin credencial no es respaldo',
    buildFallbackChain('gemini-2.5-flash', { env: { GEMINI_API_KEY: 'g' } }), []);
ok('el proveedor que falló no se reintenta',
    !buildFallbackChain('gemini-2.5-flash', { env: conOpenAI }).some(s2 => s2.startsWith('gemini')));
eq('el orden de respaldo está declarado, no deducido',
    PROVIDER_FALLBACK_ORDER, ['google', 'openai', 'anthropic', 'mistral']);

const router2 = readFileSync(new URL('../server/lib/ai-router.js', import.meta.url), 'utf8');
// ⚠️ Un modelo pedido a mano NO tiene respaldo: quien lo eligió eligió. Misma
// regla que el montaje y la música del Creador de Reels.
ok('un modelo pedido a mano no tiene respaldo', /options\.explicit \? \[slug\]/.test(router2));
ok('lo que se intentó queda escrito', /options\.notes/.test(router2));
ok('un fallo de cuenta corta la cadena de modelos', /isAccountLevelFailure\(res\.status/.test(router2));


// ── 13. Habilitar el respaldo no puede romper los chats ──────────────
section('13. El modo JSON sólo se pide cuando se pide JSON');

// ⚠️ Defecto LATENTE que el respaldo activaría: `callOpenAI` forzaba
// `response_format: json_object` a TODOS los que llaman. No se notaba porque el
// modelo por defecto es Gemini y nada caía en OpenAI; con respaldo entre
// proveedores, un endpoint de conversación aterrizaría ahí y recibiría JSON
// donde espera prosa —y OpenAI RECHAZA el modo si el prompt no nombra «json»—.
ok('el modo JSON es condicional', /wantsJson\(systemPrompt\)/.test(router2));
ok('y no está forzado para todos',
    !/temperature: 0\.7,\s*\n\s*response_format/.test(router2));

// Una respuesta vacía tampoco es un éxito en OpenAI, igual que en Gemini.
ok('OpenAI tampoco da por buena una respuesta vacía',
    /OpenAI devolvió una respuesta vacía/.test(router2));

// El diagnóstico accionable vale para los cuatro proveedores, no sólo Google:
// una credencial vencida de OpenAI merece el mismo mensaje que una de Google.
for (const p of ['openai', 'anthropic', 'mistral']) {
    ok(`${p} propaga el diagnóstico`, new RegExp(`describeProviderFailure\\('${p}'`).test(router2));
}

// ── 14. Un artículo es más que la suma de sus palabras ───────────────
section('14. Cada sección se desarrolla');

// ⚠️ Es el defecto reportado: «el artículo te da una buena estructura, siento
// que todavía le falta al cuerpo». Cinco subtítulos con una frase debajo suman
// palabras y no son un artículo; el total nunca pudo verlo.
const flojo = {
    title: 'Sevilla Capital Cafetera entregó mercados a familias del sismo',
    seoTitle: 'Sevilla Capital Cafetera entregó mercados a familias',
    seoDescription: 'El Club Rotario Sevilla Capital Cafetera entregó mercados y kits de aseo a familias afectadas por el sismo en la región cafetera.',
    body: cuerpoFlojo,
};
const vFlojo = validateArticle(flojo);
ok('una sección de un solo párrafo corto es ERROR, no aviso',
    vFlojo.errors.some(e => /Coordinación y puntos de entrega/.test(e)));
ok('el error NOMBRA la sección, sus bloques y sus palabras',
    vFlojo.errors.some(e => /«[^»]+» tiene \d+ bloque\(s\) de contenido y \d+ palabras/.test(e)));
ok('y dice cómo desarrollarla sin inventar',
    vFlojo.errors.some(e => /sin agregar datos nuevos/.test(e)));
eq('el mismo cuerpo desarrollado no da ningún error de sección',
    validateArticle({ ...flojo, body: cuerpoBueno }).errors.filter(e => /bloque\(s\) de contenido/.test(e)), []);

// ── 15. La profundidad es un parámetro, no una constante ─────────────
section('15. La exigencia sigue al material');

ok('el perfil estándar conserva los números de siempre',
    DEPTH_PROFILES.estandar.minWords === 300 && DEPTH_PROFILES.estandar.targetWords === 900);
ok('el reportaje exige más por sección, no un mínimo total mayor',
    DEPTH_PROFILES.reportaje.minSectionWords > DEPTH_PROFILES.estandar.minSectionWords
    && DEPTH_PROFILES.reportaje.minWords === DEPTH_PROFILES.estandar.minWords);
// Un mínimo TOTAL alto obligaría a rellenar, y rellenar sobre un contexto pobre
// es inventar: lo único que el flujo de solicitudes no puede hacer.
ok('el reportaje apunta más alto sin cerrarle la puerta a un artículo corto y cierto',
    DEPTH_PROFILES.reportaje.targetWords > DEPTH_PROFILES.estandar.targetWords);
ok('un perfil desconocido cae al estándar, no al exigente',
    depthOf('inventado').id === 'estandar' && depthOf(undefined).id === 'estandar');

const sysReportaje = buildArticleSystemPrompt({ depth: 'reportaje' });
ok('el prompt del reportaje pide sus propios números',
    sysReportaje.includes(String(DEPTH_PROFILES.reportaje.minSectionWords)));
ok('el prompt exige desarrollar cada sección', /CADA SECCIÓN SE DESARROLLA/.test(sysReportaje));
ok('y dice de dónde sale la profundidad', /LA PROFUNDIDAD SALE DE DESARROLLAR LO QUE EL CONTEXTO SÍ DICE/.test(sysReportaje));
ok('sin aflojar la veracidad', /NUNCA de agregar hechos, cifras, nombres, fechas ni declaraciones/.test(sysReportaje));

// ── 16. El contexto no se recorta a espaldas de quien llama ──────────
section('16. El tope de entrada es un parámetro');

const router3 = readFileSync(new URL('../server/lib/ai-router.js', import.meta.url), 'utf8');
ok('el tope sale del parámetro y cae a 2.500 por defecto',
    /Number\(maxInputChars\) > 0 \? Number\(maxInputChars\) : 2500/.test(router3));
ok('el recorte se anota para que quien llama lo vea', /notes\.push\(nota\)/.test(router3));
// Se busca la LLAMADA, no la mención: el comentario que explica por qué se
// quitó tiene que poder nombrar el recorte viejo sin hacer fallar la prueba.
ok('ya no se pega el resto en crudo llamándolo resumen',
    !/\+ userPrompt\.slice\(MAX_INPUT_CHARS/.test(router3));
ok('quien llama puede declarar el suyo', /maxInputChars: options\.maxInputChars/.test(router3));

const gen = readFileSync(new URL('../server/lib/articleGenerate.js', import.meta.url), 'utf8');
ok('el generador de artículos declara un tope de contexto amplio',
    /ARTICLE_MAX_INPUT_CHARS = \d{5}/.test(gen) && /maxInputChars: ARTICLE_MAX_INPUT_CHARS/.test(gen));
// El perfil viaja a las DOS puntas: pedirle un reportaje al modelo y validarlo
// con el criterio estándar dejaría la exigencia sin quien la haga cumplir.
ok('la profundidad llega al prompt y a la validación',
    /buildArticleSystemPrompt\(\{ siteName, extra, depth: perfil \}\)/.test(gen)
    && /validateArticle\(article, \{ siteName, depth: perfil \}\)/.test(gen));


console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
