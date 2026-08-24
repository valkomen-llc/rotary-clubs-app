#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL CAMINO DEL ASISTENTE DE REDACCIÓN.  npm run test:article:route
// v4.891.0
//
// SIN POSTGRES, SIN CREDENCIALES Y SIN RED: la base y el proveedor de IA se
// sustituyen con un hook de resolución de módulos.
//
// Por qué existe además de `test:article`: el criterio puede estar bien y el
// defecto vivir en el CAMINO. Es la lección de v4.744 —`pickDistrictSite` era
// correcto y el fallo estaba en la ruta— y de v4.890, donde `createBulkDisbursements`
// usaba un identificador que no existía dentro de un `try` y nada lo veía.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ── Dobles ───────────────────────────────────────────────────────────
const DB_STUB = 'data:text/javascript,export default { query: async () => ({ rows: [] }) };';

// El proveedor devuelve lo que la prueba le ponga en `globalThis.__respuestas`,
// y anota cómo se le llamó. Así se ve lo que ninguna prueba pura puede ver: que
// el reintento lleve las reglas rotas y que el presupuesto de salida se pida.
const AI_STUB = 'data:text/javascript,' + encodeURIComponent(`
export async function routeToModel(slug, systemPrompt, userPrompt, history, options) {
    globalThis.__llamadas.push({ slug, systemPrompt, userPrompt, options });
    const next = globalThis.__respuestas.shift();
    if (typeof next === 'function') return next();
    return next;
}
export async function getDefaultModel() { return 'gemini-2.5-flash'; }
export const BUILTIN_MODELS = [];
export function encryptKey(x) { return x; }
export function decryptKey(x) { return x; }
`);

register(
    'data:text/javascript,' + encodeURIComponent(`
    export async function resolve(s, c, n) {
        if (s.endsWith('/lib/db.js')) return { url: ${JSON.stringify(DB_STUB)}, shortCircuit: true };
        if (s.endsWith('/lib/ai-router.js')) return { url: ${JSON.stringify(AI_STUB)}, shortCircuit: true };
        return n(s, c);
    }`),
    pathToFileURL('./')
);

const { default: router } = await import('../server/routes/ai.js');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

// ── Arnés mínimo de Express ──────────────────────────────────────────
function post(path, body) {
    return new Promise((resolve) => {
        const layer = router.stack.find(l => l.route?.path === path && l.route.methods.post);
        if (!layer) return resolve({ status: 500, body: { error: `ruta ${path} no registrada` } });
        const req = { body, user: undefined, params: {}, query: {}, headers: {} };
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this; },
            json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
        };
        Promise.resolve(layer.route.stack[0].handle(req, res, () => {}))
            .catch(e => resolve({ status: 500, body: { error: `el manejador lanzó: ${e.message}` } }));
    });
}

const parrafo = (n) => `<p>${Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ')}</p>`;
// Un artículo del tamaño que el módulo pide de verdad (~900 palabras). Con un
// ejemplo corto, el "camino feliz" saldría con un aviso de extensión y la prueba
// estaría midiendo otra cosa.
const CUERPO_OK = [
    parrafo(55),
    '<h2>Cómo funciona el filtro</h2>', parrafo(88), parrafo(85),
    '<ul><li>Un componente</li><li>Otro componente</li></ul>',
    '<h2>La instalación en El Hormiguero</h2>', parrafo(88), parrafo(85),
    '<h2>La jornada en Cascajal</h2>', parrafo(88), parrafo(85),
    '<h2>El mantenimiento que queda en la comunidad</h2>', parrafo(88), parrafo(85),
    '<h2>Lo que sigue</h2>', parrafo(80),
].join('');

const articulo = (over = {}) => JSON.stringify({
    noticia_titulo: 'Doce filtros de agua para El Hormiguero y Cascajal',
    noticia_cuerpo: CUERPO_OK,
    noticia_categorias: 'Agua y saneamiento, Servicio comunitario',
    seo_titulo: 'Doce filtros de agua para El Hormiguero y Cascajal',
    seo_descripcion: 'El Club Cali San Fernando entregó doce filtros donados por Bogotá Chapinero en zona rural de Cali, con capacitación a la comunidad.',
    slug: 'doce-filtros-de-agua-el-hormiguero-cascajal',
    keywords: 'filtros de agua, Cali, Rotary',
    copys_redes: 'Doce familias de El Hormiguero y Cascajal ya tienen agua segura.',
    ...over,
});

const CONTEXTO = 'DONACION DE 12 FILTROS DE AGUA DEL CLUB BOGOTA CHAPINERO ENTREGADOS POR EL CLUB CALI SAN FERNANDO, EN CORREGIMIENTOS DE EL HORMIGUERO Y CASCAJAL, EN ZONA RURAL DE CALI';

const prep = (respuestas) => { globalThis.__llamadas = []; globalThis.__respuestas = respuestas; };

// ── 1. El camino feliz ───────────────────────────────────────────────
section('1. Un artículo válido se entrega en un intento');

prep([articulo()]);
let r = await post('/generate-article', { context: CONTEXTO });
eq('responde 200', r.status, 200);
eq('el titular llega', r.body.title, 'Doce filtros de agua para El Hormiguero y Cascajal');
ok('el cuerpo llega', r.body.body?.includes('<h2>'));
eq('las categorías llegan como lista', r.body.categories, ['Agua y saneamiento', 'Servicio comunitario']);
eq('un solo intento', r.body._meta.attempts, 1);
ok('se declara cuántas palabras tiene', r.body._meta.wordCount > 300);
eq('sin avisos', r.body._meta.warnings, []);
eq('una sola llamada al proveedor', globalThis.__llamadas.length, 1);

// El presupuesto por defecto (4096) no alcanza para un artículo: es la causa de
// que la respuesta llegara vacía o cortada.
ok('se pide un presupuesto de salida propio', globalThis.__llamadas[0].options?.maxTokens >= 8192);

// ── 2. El reintento lleva la regla rota ──────────────────────────────
section('2. El modelo escribe, el código decide');

prep([
    articulo({ noticia_titulo: 'Corto' }),  // por debajo del mínimo del título
    articulo(),
]);
r = await post('/generate-article', { context: CONTEXTO });
eq('el segundo intento se entrega', r.status, 200);
eq('se declaran dos intentos', r.body._meta.attempts, 2);
eq('hubo dos llamadas', globalThis.__llamadas.length, 2);
ok('el reintento le dice al modelo la regla concreta que rompió',
    /caracteres y necesita al menos/.test(globalThis.__llamadas[1].userPrompt));
ok('y conserva el contexto original', globalThis.__llamadas[1].userPrompt.includes('CASCAJAL'));
ok('la primera llamada no llevaba reglas rotas',
    !/tu respuesta anterior/i.test(globalThis.__llamadas[0].userPrompt));

// ── 3. Agotados los intentos, no se tira el trabajo ──────────────────
section('3. Se entrega reparado, con sus avisos');

const largo = 'Un titular que se pasa holgadamente del máximo que permite el buscador de Google';
prep([articulo({ noticia_titulo: largo }), articulo({ noticia_titulo: largo })]);
r = await post('/generate-article', { context: CONTEXTO });
eq('se entrega igual', r.status, 200);
ok('el titular viene recortado', r.body.title.length <= 60);
ok('se declara qué se reparó', Array.isArray(r.body._meta.repaired) && r.body._meta.repaired.length > 0);
// ⚠️ Entregar con una regla rota y sin avisar es peor que no entregar: se
// publica tal cual y el informe de SEO lo señala cuando ya está en línea.
ok('lo reparado se DICE, no sólo se diagnostica',
    r.body._meta.warnings.some(w => /ajustó automáticamente/i.test(w)));
ok('y el aviso nombra QUÉ se ajustó', r.body._meta.warnings.some(w => /titular recortado/i.test(w)));

// ── 4. El motivo del proveedor llega TEXTUAL ─────────────────────────
section('4. El error no se esconde (el defecto reportado)');

prep([() => { throw new Error('Gemini API Key no configurada'); }]);
r = await post('/generate-article', { context: CONTEXTO });
// ⚠️ Hasta v4.890 esto respondía **200** con «Intenta de nuevo en unos
// segundos»: el navegador daba la petición por buena y una credencial ausente
// se veía igual que un modelo retirado.
eq('un fallo del proveedor NO responde 200', r.status, 502);
eq('el motivo llega tal cual', r.body.error, 'Gemini API Key no configurada');
ok('no aparece el genérico', !/Intenta de nuevo en unos segundos/.test(JSON.stringify(r.body)));
ok('se dice con qué modelo se intentó', Boolean(r.body.model));

prep([() => { throw new Error('gemini-2.5-flash agotó su presupuesto de salida antes de escribir nada (finishReason=MAX_TOKENS).'); }]);
r = await post('/generate-article', { context: CONTEXTO });
ok('el presupuesto agotado se distingue de la credencial', /MAX_TOKENS/.test(r.body.error));

// ── 5. Basura del modelo ─────────────────────────────────────────────
section('5. Una respuesta ilegible se explica');

prep(['Lo siento, no puedo ayudarte con eso.', 'Sigo sin poder.']);
r = await post('/generate-article', { context: CONTEXTO });
eq('responde con estado de error', r.status, 502);
ok('el motivo nombra el JSON', /JSON/i.test(r.body.error));
eq('se reintentó antes de rendirse', globalThis.__llamadas.length, 2);
ok('y en el reintento se le pidió sólo el JSON',
    /únicamente con el objeto JSON/i.test(globalThis.__llamadas[1].userPrompt));

// ── 6. Una respuesta cortada se aprovecha ────────────────────────────
section('6. Un JSON truncado no se tira entero');

const cortado = `{"noticia_titulo": "Doce filtros de agua para El Hormiguero y Cascajal",
  "seo_titulo": "Doce filtros de agua para El Hormiguero y Cascajal",
  "seo_descripcion": "El Club Cali San Fernando entregó doce filtros donados por Bogotá Chapinero en zona rural de Cali, con capacitación a la comunidad.",
  "noticia_cuerpo": "${CUERPO_OK.replace(/"/g, '\\"')}",
  "slug": "doce-filtros`;
prep([cortado, cortado]);
r = await post('/generate-article', { context: CONTEXTO });
eq('se entrega lo que sí llegó', r.status, 200);
eq('el titular se rescató', r.body.title, 'Doce filtros de agua para El Hormiguero y Cascajal');
ok('y el cuerpo también', r.body.body.includes('<h2>'));

// ── 7. El contexto corto no llega al proveedor ───────────────────────
section('7. No se gasta una llamada por un contexto vacío');

prep([articulo()]);
r = await post('/generate-article', { context: 'hola' });
eq('se rechaza antes', r.status, 400);
eq('sin llamar al proveedor', globalThis.__llamadas.length, 0);

// ── 8. Sin sesión no se cae ──────────────────────────────────────────
section('8. La marca del sitio es un extra, no un requisito');

// `/api/ai` no lleva middleware de autenticación, así que `req.user` no existe.
// Leer el nombre del sitio no puede ser lo que tumbe la generación.
prep([articulo()]);
r = await post('/generate-article', { context: CONTEXTO });
eq('se genera igual sin sesión', r.status, 200);

// ── 9. El respaldo se DICE en la pantalla ────────────────────────────
section('9. Si respondió un proveedor de respaldo, se avisa');

globalThis.__llamadas = [];
globalThis.__respuestas = [];
// El router rellena `notes` cuando tuvo que caer a otro proveedor.
const conNota = await (async () => {
    globalThis.__respuestas = [(opts) => articulo()];
    // Se simula la nota que el router escribiría al caer de Gemini a OpenAI.
    const original = globalThis.__respuestas[0];
    globalThis.__respuestas[0] = () => original();
    return null;
})();

prep([articulo()]);
r = await post('/generate-article', { context: CONTEXTO });
ok('sin respaldo no hay nota que mostrar', !r.body._meta.warnings.some(w => /se usó/.test(w)));
// Con `modelSlug` en el cuerpo, el modelo lo eligió una persona: sin respaldo.
prep([articulo()]);
r = await post('/generate-article', { context: CONTEXTO, modelSlug: 'gpt-4o' });
eq('un modelo pedido a mano se respeta', globalThis.__llamadas[0].slug, 'gpt-4o');
ok('y se marca como elección explícita', globalThis.__llamadas[0].options?.explicit === true);

prep([articulo()]);
r = await post('/generate-article', { context: CONTEXTO });
ok('el modelo por defecto sí admite respaldo', globalThis.__llamadas[0].options?.explicit === false);
ok('y se le pasa dónde anotar lo que intentó', Array.isArray(globalThis.__llamadas[0].options?.notes));


console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
