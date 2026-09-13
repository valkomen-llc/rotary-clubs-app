#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// QUÉ PÁGINAS DE FACEBOOK ALCANZA UNA AUTORIZACIÓN
// npm run test:meta:pages  ·  v4.1044.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED: se ejercita el módulo REAL
// (`server/services/metaService.js`) con `fetch` sustituido.
//
// El defecto que originó esto: una Página que la persona MARCA en la pantalla
// de autorización de Facebook —la del Distrito 4281— no aparecía nunca en el
// panel, y no había ningún error que mirar. Dos causas, las dos mudas:
//
//   1. SE PREGUNTABA POR UNA SOLA VÍA. `/me/accounts` devuelve las Páginas en
//      las que la persona tiene un rol DIRECTO. Una Página administrada desde
//      un PORTAFOLIO DE META BUSINESS —que es como está organizada una
//      institución— puede no estar ahí y aun así ofrecerse para marcar.
//
//   2. NO SE PAGINABA. Esa arista devuelve 25 por defecto; sin seguir
//      `paging.next`, el resto se pierde en silencio.
//
// Y una tercera, del lado de Facebook: a la SEGUNDA vuelta el diálogo no
// muestra la lista de activos, muestra una confirmación y reutiliza la
// selección anterior. Por eso el enlace lleva `auth_type=rerequest`.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (t, c) => { if (c) { ok++; console.log(`  ✓ ${t}`); } else { malos.push(t); console.log(`  ✗ ${t}`); } };
const grupo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`);
const lee = (p) => readFileSync(p, 'utf8');
/** El archivo SIN comentarios: un comentario que explica una regla no puede
 *  hacer fallar —ni pasar— la comprobación que la defiende (v4.991). */
const codigo = (p) => lee(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const META = await import('../server/services/metaService.js');

// ── La Graph API, sustituida ────────────────────────────────────────────────
// Devuelve la forma REAL de la API: `{ data: [...], paging: { next } }`.
let rutas = {};
let llamadas = [];
const graph = (respuestas) => {
    rutas = respuestas;
    llamadas = [];
    globalThis.fetch = async (url, init) => {
        llamadas.push({ url: String(url), signal: init?.signal || null });
        const sinToken = String(url).split('?')[0].replace('https://graph.facebook.com/v18.0/', '');
        const qs = new URLSearchParams(String(url).split('?')[1] || '');
        const clave = qs.get('__pagina') ? `${sinToken}#${qs.get('__pagina')}` : sinToken;
        const r = rutas[clave];
        if (!r) return { ok: false, status: 404, json: async () => ({ error: { message: `sin doble para ${clave}` } }) };
        if (r.error) return { ok: false, status: r.status || 400, json: async () => ({ error: { message: r.error } }) };
        return { ok: true, status: 200, json: async () => r };
    };
};
const pagina = (id, name, conToken = true) => ({
    id, name, category: 'Nonprofit', tasks: ['CREATE_CONTENT'],
    ...(conToken ? { access_token: `tok-${id}` } : {}),
});

// ════════════════════════════════════════════════════════════════════
grupo('1. El caso reportado: la Página vive en un portafolio de negocio');

graph({
    // Lo que /me/accounts devolvía: las dos que el sitio ya tenía.
    'me/accounts': { data: [pagina('175397702326386', 'Rotary E-Club Origen'), pagina('1069684432899390', 'Plataforma de Club para Rotary')] },
    'me/businesses': { data: [{ id: 'biz-4281', name: 'Distrito 4281' }] },
    'biz-4281/owned_pages': { data: [pagina('728932976959414', 'Distrito 4281 de RI')] },
    'biz-4281/client_pages': { data: [] },
});
let r = await META.discoverUserPages('user-token');
check('⚠️ La Página del portafolio de negocio LLEGA (era la que faltaba)',
      r.pages.some(p => p.id === '728932976959414' && p.name === 'Distrito 4281 de RI'));
check('…con su token de publicación', r.pages.find(p => p.id === '728932976959414')?.accessToken === 'tok-728932976959414');
check('…y las de rol directo siguen estando', r.pages.length === 3);
check('Se dice de dónde salió cada una', r.pages.find(p => p.id === '728932976959414')?.sources?.some(s => /Distrito 4281/.test(s)));
check('El informe enumera las fuentes consultadas',
      r.sources.some(f => f.source === 'me/accounts') && r.sources.some(f => /owned_pages/.test(f.source)));

// ⚠️ VERIFICACIÓN A LA INVERSA: sin recorrer los portafolios —que es lo que
// hacía la versión anterior— esta misma autorización devuelve 2 y la Página
// del Distrito no aparece por ningún lado.
graph({ 'me/accounts': { data: [pagina('175397702326386', 'Rotary E-Club Origen'), pagina('1069684432899390', 'Plataforma de Club para Rotary')] }, 'me/businesses': { data: [] } });
r = await META.discoverUserPages('user-token');
check('(a la inversa) Sin portafolios sólo llegan las de rol directo', r.pages.length === 2);

// ════════════════════════════════════════════════════════════════════
grupo('2. Paginación: 25 por defecto no es «todas»');

graph({
    'me/accounts': { data: [pagina('p1', 'Una'), pagina('p2', 'Dos')], paging: { next: 'https://graph.facebook.com/v18.0/me/accounts?__pagina=2&access_token=x' } },
    'me/accounts#2': { data: [pagina('p3', 'Tres')] },
    'me/businesses': { data: [] },
});
r = await META.discoverUserPages('user-token');
check('⚠️ Se sigue `paging.next` — sin esto la lista sale corta EN SILENCIO', r.pages.length === 3 && r.pages.some(p => p.id === 'p3'));
check('Se pide el máximo por vuelta (`limit=100`)', llamadas.some(l => /me\/accounts\?.*limit=100/.test(l.url)));

// ════════════════════════════════════════════════════════════════════
grupo('3. Una Página sin token de publicación no se pierde en silencio');

graph({
    'me/accounts': { data: [] },
    'me/businesses': { data: [{ id: 'b', name: 'Negocio' }] },
    'b/owned_pages': { data: [pagina('sin-tok', 'Sin token', false)] },
    'b/client_pages': { data: [] },
    'sin-tok': { id: 'sin-tok', access_token: 'tok-recuperado' },
});
r = await META.discoverUserPages('user-token');
check('Se pide el token de la Página por su cuenta antes de darla por perdida',
      r.pages.length === 1 && r.pages[0].accessToken === 'tok-recuperado');

graph({
    'me/accounts': { data: [] },
    'me/businesses': { data: [{ id: 'b', name: 'Negocio' }] },
    'b/owned_pages': { data: [pagina('sin-tok', 'Sin token', false)] },
    'b/client_pages': { data: [] },
    'sin-tok': { error: 'no hay permiso' },
});
r = await META.discoverUserPages('user-token');
check('⚠️ Y si aun así no hay token, se DICE con su motivo y su salida',
      r.pages.length === 0 &&
      r.notes.some(n => n.code === 'page_without_token' && /token de publicación/.test(n.reason) && n.fix));

// ════════════════════════════════════════════════════════════════════
grupo('4. Qué falla y qué no puede costar la sincronización');

graph({
    'me/accounts': { data: [pagina('p1', 'Una')] },
    'me/businesses': { error: 'permiso business_management no concedido' },
});
r = await META.discoverUserPages('user-token');
check('Un fallo leyendo los portafolios NO tumba lo que sí se pudo leer', r.pages.length === 1);
check('…y se anota con su motivo textual',
      r.notes.some(n => n.code === 'businesses_unreachable' && /business_management/.test(n.reason)));

graph({
    'me/accounts': { data: [pagina('p1', 'Una')] },
    'me/businesses': { data: [{ id: 'b', name: 'Negocio' }] },
    'b/owned_pages': { error: 'el portafolio no quedó incluido' },
    'b/client_pages': { data: [] },
});
r = await META.discoverUserPages('user-token');
check('Un portafolio ilegible se anota nombrándolo, y el resto sigue',
      r.pages.length === 1 && r.notes.some(n => n.code === 'business_pages_unreachable' && n.title === 'Negocio'));

graph({ 'me/accounts': { error: 'Error validating access token' } });
let propago = false;
try { await META.discoverUserPages('user-token'); } catch (e) { propago = /Error validating access token/.test(e.message); }
check('⚠️ Que falle la vía principal SÍ se propaga: no hay nada que sincronizar', propago);

// ════════════════════════════════════════════════════════════════════
grupo('5. La misma Página por dos vías es UNA Página');

graph({
    'me/accounts': { data: [pagina('dup', 'Distrito')] },
    'me/businesses': { data: [{ id: 'b', name: 'Negocio' }] },
    'b/owned_pages': { data: [pagina('dup', 'Distrito')] },
    'b/client_pages': { data: [] },
});
r = await META.discoverUserPages('user-token');
check('Se junta por id de Página, no se duplica', r.pages.length === 1);
check('…y se conservan las DOS procedencias', r.pages[0].sources.length === 2);

// ════════════════════════════════════════════════════════════════════
grupo('6. Ninguna consulta a Meta sin tope de tiempo');

check('⚠️ Toda llamada del descubrimiento lleva `signal` — una respuesta que no llega deja el callback colgado, y eso vuelve a ser la pantalla en blanco',
      llamadas.length > 0 && llamadas.every(l => !!l.signal));
check('El tope se declara en un solo sitio y es configurable',
      /META_GRAPH_TIMEOUT_MS/.test(codigo('server/services/metaService.js')));

// ════════════════════════════════════════════════════════════════════
grupo('7. El diálogo de Facebook vuelve a mostrar la lista de activos');

const url = META.buildAuthUrl({ state: 's', redirectUri: 'https://app.clubplatform.org/api/social/callback/meta' });
check('⚠️ Lleva `auth_type=rerequest`: sin él, a la segunda vuelta Facebook confirma la selección ANTERIOR y la Página nueva no llega nunca',
      /auth_type=rerequest/.test(url));
check('…y se puede desactivar expresamente',
      !/auth_type/.test(META.buildAuthUrl({ state: 's', redirectUri: 'x', forceReselect: false })));
check('Sigue sin `display=popup` (el artefacto «#_=_» de v4.331)', !/display=popup/.test(url));

// ════════════════════════════════════════════════════════════════════
grupo('8. El sincronizador consume el descubrimiento, no una vía suelta');

const SYNC = codigo('server/lib/metaSync.js');
check('⚠️ `metaSync` pide el descubrimiento COMPLETO, no `/me/accounts` a secas',
      /discoverUserPages/.test(SYNC) && !/\bgetUserPages\b/.test(SYNC));
check('Los avisos del descubrimiento viajan enteros al informe',
      /hallazgo\.notes/.test(SYNC));
check('…y las fuentes también', /hallazgo\.sources/.test(SYNC));
check('⚠️ Una cuenta conectada por su propio flujo NO la retira una sincronización de Facebook',
      /directConnect\) continue/.test(SYNC));

// ════════════════════════════════════════════════════════════════════
grupo('9. La vuelta de Facebook nunca deja una página en blanco');

let FB = null;
try {
    const esbuild = await import('esbuild');
    const { code } = await esbuild.transform(lee('src/lib/facebookRedirect.ts'), { loader: 'ts', format: 'esm' });
    FB = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
} catch { console.log('  (se salta el criterio: falta esbuild)'); }

if (FB) {
    check('El artefacto como RUTA se limpia — es el que deja la pantalla en blanco',
          FB.limpiarArtefactoDeFacebook('https://rotary4281.org/_=_') === 'https://rotary4281.org/');
    check('…también colgando de una ruta real',
          FB.limpiarArtefactoDeFacebook('https://rotary4281.org/admin/content-studio/_=_') === 'https://rotary4281.org/admin/content-studio');
    check('El artefacto como FRAGMENTO se limpia',
          FB.limpiarArtefactoDeFacebook('https://rotary4281.org/admin/content-studio?tab=accounts#_=_') === 'https://rotary4281.org/admin/content-studio?tab=accounts');
    check('⚠️ Una dirección sin artefacto devuelve `null` — no se reescribe el historial en cada visita',
          FB.limpiarArtefactoDeFacebook('https://rotary4281.org/admin/content-studio?tab=accounts') === null);
    check('Los parámetros de la vuelta se conservan',
          /meta=connected/.test(FB.limpiarArtefactoDeFacebook('https://rotary4281.org/x?meta=connected#_=_') || ''));
    check('Una dirección ilegible no rompe nada', FB.limpiarArtefactoDeFacebook('no-es-una-url') === null);
}

const MAIN = codigo('src/main.tsx');
check('⚠️ Se limpia ANTES de montar React: después, el enrutador ya decidió que no hay nada que pintar',
      /normalizarVueltaDeFacebook\(\)/.test(MAIN) &&
      // `createRoot` a secas casaría con su propio `import`, que va arriba de
      // todo: lo que hay que comparar es contra la LLAMADA que monta la app.
      MAIN.indexOf('normalizarVueltaDeFacebook()') < MAIN.indexOf('createRoot(document'));

const APP = codigo('src/App.tsx');
check('⚠️ Hay ruta comodín: sin ella, una dirección que no casa NO PINTA NADA',
      /<Route path="\*"/.test(APP));
check('…y va al final, después de las rutas reales',
      APP.indexOf('<Route path="*"') > APP.lastIndexOf('<Route path="/informe/:token"'));

// ════════════════════════════════════════════════════════════════════
grupo('10. Lo que se le dice a quien sincroniza');

const PANEL = lee('src/components/admin/content-studio/AccountManager.tsx');
check('Se dice CUÁNTAS Páginas entregó Meta y qué hacer si falta alguna',
      /Meta entregó/.test(PANEL) && /Conectar Meta/.test(PANEL));
check('Se dice con QUÉ cuenta de Meta se sincronizó', /connectedBy\?\.name/.test(PANEL));
check('Un aviso sin Página no imprime «undefined»',
      /n\.title \|\| n\.pageName \|\| 'Meta'/.test(PANEL));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
