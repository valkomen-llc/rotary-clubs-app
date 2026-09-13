#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// QUÉ PÁGINAS DE FACEBOOK ALCANZA UNA AUTORIZACIÓN
// npm run test:meta:pages  ·  v4.1046.0
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

// `debug_token` exige el secreto de la aplicación. Es un doble: la Graph
// API está sustituida y no sale ninguna petición de verdad.
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'secreto-de-prueba';
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
        // `#min` distingue el sondeo mínimo (`fields=id,name`) del completo:
        // el módulo reintenta sin `access_token` cuando el completo falla, y
        // sin esta distinción el doble contestaría lo mismo a los dos.
        const minimo = qs.get('fields') === 'id,name';
        const clave = qs.get('__pagina') ? `${sinToken}#${qs.get('__pagina')}`
            : (minimo && rutas[`${sinToken}#min`]) ? `${sinToken}#min` : sinToken;
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
grupo('11. Lo que ESTA autorización concedió (v4.1045)');

// El caso del segundo reporte: Facebook enseña la lista completa, se marca la
// Página del Distrito y su Instagram, se pulsa Guardar… y las tres vías
// anteriores devuelven CERO. Lo único que habla de esta autorización —y no de
// la cuenta— es `granular_scopes`.
graph({
    'me/accounts': { data: [] },
    'me/businesses': { data: [] },
    // ⚠️ LA FORMA REAL DE `/debug_token`: los permisos por activo cuelgan de
    // `data`, no de la raíz. Un doble que devuelva de menos —o de más— deja
    // en verde un lector que en producción no encuentra nada (v4.1005).
    'debug_token': {
        data: {
            is_valid: true,
            granular_scopes: [
                { scope: 'pages_manage_posts', target_ids: ['728932976959414'] },
                { scope: 'pages_show_list', target_ids: ['728932976959414'] },
                { scope: 'instagram_basic', target_ids: ['17841408037178163'] },
            ],
        },
    },
    '728932976959414': pagina('728932976959414', 'Distrito 4281 de RI'),
    // El id de Instagram NO es una Página: la Graph API no lo devuelve como tal.
    '17841408037178163': { error: 'no es una Página' },
});
r = await META.discoverUserPages('user-token');
check('⚠️ La Página que la autorización concedió LLEGA aunque /me/accounts venga vacío',
      r.pages.length === 1 && r.pages[0].id === '728932976959414');
check('…con su token de publicación', r.pages[0].accessToken === 'tok-728932976959414');
check('…y se dice que salió de la autorización', r.pages[0].sources.includes('autorizado'));
check('El id de Instagram NO se inventa como Página',
      !r.pages.some(p => p.id === '17841408037178163'));
check('Lo concedido se informa por id, para poder contrastarlo con Facebook',
      r.granted.some(g => g.id === '728932976959414') && r.granted.some(g => g.id === '17841408037178163'));
check('…con los permisos que lo concedieron',
      r.granted.find(g => g.id === '728932976959414')?.scopes.includes('pages_manage_posts'));
check('Un id que no resultó ser Página se anota aparte',
      r.unresolved.some(g => g.id === '17841408037178163'));

// ⚠️ A LA INVERSA: sin esta fuente, esa MISMA autorización devuelve cero
// Páginas — que es exactamente lo que se reportó.
graph({ 'me/accounts': { data: [] }, 'me/businesses': { data: [] } });
r = await META.discoverUserPages('user-token');
check('(a la inversa) Sin activos autorizados no hay ninguna Página', r.pages.length === 0);
check('⚠️ Y CERO PÁGINAS SE DICE: «SIN CONEXIÓN» no distingue «nunca conecté» de «Meta no devolvió nada»',
      r.notes.some(n => n.code === 'sin_paginas'));

// Lo que ya llegó por otra vía no se vuelve a pedir de a uno.
graph({
    'me/accounts': { data: [pagina('728932976959414', 'Distrito 4281 de RI')] },
    'me/businesses': { data: [] },
    'debug_token': { data: { granular_scopes: [{ scope: 'pages_show_list', target_ids: ['728932976959414'] }] } },
});
r = await META.discoverUserPages('user-token');
check('Una Página ya descubierta no se pide otra vez',
      r.pages.length === 1 && !llamadas.some(l => /\/728932976959414\?/.test(l.url)));
check('…y se anota que además estaba autorizada', r.pages[0].sources.includes('autorizado'));

// Que esta fuente falle no puede costar lo que las otras sí trajeron.
graph({
    'me/accounts': { data: [pagina('p1', 'Una')] },
    'me/businesses': { data: [] },
    'debug_token': { error: 'permiso retirado' },
});
r = await META.discoverUserPages('user-token');
check('Un fallo leyendo los activos NO tumba la sincronización', r.pages.length === 1);
check('…y se dice con su motivo', r.notes.some(n => n.code === 'granular_scopes_unreachable'));

check('Todas las consultas de activos llevan tope de tiempo',
      llamadas.every(l => l.signal));

// ════════════════════════════════════════════════════════════════════
grupo('12. Cero Páginas no es «ya no autorizaste nada»');

const SYNC2 = codigo('server/lib/metaSync.js');
check('⚠️ NO SE RETIRA NADA CUANDO EL DESCUBRIMIENTO VINO VACÍO',
      /descubrimientoVacio\s*=\s*!pages\.length/.test(SYNC2) &&
      /if \(deactivateMissing && !descubrimientoVacio\)/.test(SYNC2));
check('…y se dice que no se retiró nada, en vez de dejarlo mudo',
      /retirada_omitida/.test(SYNC2));
check('La guarda de la cuenta conectada directamente sigue en pie',
      /metadata\?\.directConnect/.test(SYNC2));

// ════════════════════════════════════════════════════════════════════
grupo('13. El informe se GUARDA y se puede leer desde el panel');

const REPORTE = await import('../server/lib/metaSyncReport.js');
const modelado = REPORTE.shapeReport({
    syncedAt: '2026-09-13T12:00:00.000Z',
    connectedBy: { id: '123', name: 'Felipe Peña' },
    counts: { facebook: 1, instagram: 1, revoked: 0 },
    pages: [{ pageId: '728932976959414', name: 'Distrito 4281 de RI' }],
    instagram: [{ igId: '17841408037178163', username: 'rotary4281', pageId: '728932976959414' }],
    sources: [{ source: 'me/granular_scopes', count: 2 }],
    granted: [{ id: '728932976959414', scopes: ['pages_manage_posts'] }],
    unresolved: [],
    notes: [{ code: 'ig_not_linked', title: 'X', reason: 'r', fix: 'f' }],
    // Lo que NO se enumera no se guarda: un token no puede colarse a una fila
    // que el panel lee.
    accessToken: 'EAAG-secreto',
    userToken: 'EAAG-secreto',
});
check('Se guarda el id de la Página, no sólo el nombre', modelado.pages[0].pageId === '728932976959414');
check('Se guarda el id de la cuenta de Instagram', modelado.instagram[0].igId === '17841408037178163');
check('Se guarda qué activos concedió la autorización', modelado.granted[0].id === '728932976959414');
check('⚠️ NI UN TOKEN LLEGA AL INFORME, NI RECORTADO',
      !JSON.stringify(modelado).includes('EAAG') && modelado.accessToken === undefined);

const REP_SRC = codigo('server/lib/metaSyncReport.js');
check('El informe vive en `Setting`, no en una columna de `SocialAccount`',
      /prisma\.setting\./.test(REP_SRC) && !/socialAccount/.test(REP_SRC));
check('Guardarlo NUNCA lanza: a esa altura las cuentas ya están escritas',
      /catch \(e\) \{[\s\S]*?return false;/.test(REP_SRC));
check('El motor lo guarda al terminar', /await saveSyncReport\(clubId, informe\)/.test(SYNC2));

const CTRL = codigo('server/controllers/socialPublishingController.js');
check('El panel puede leerlo por su propio endpoint', /export const getMetaDiagnostics/.test(CTRL));
check('⚠️ Y el registro se escribe ANTES del corte por cero Páginas',
      CTRL.indexOf("console.log('[social] Meta sincronizado'") < CTRL.indexOf('if (!informe.pages.length)'));

const RUTAS = codigo('server/routes/social.js');
check('La ruta literal va ANTES de `/accounts/:id`',
      RUTAS.indexOf("'/accounts/diagnostics'") < RUTAS.indexOf("'/accounts/:id/verify'"));

check('El panel lo pinta y lo refresca al sincronizar',
      /<MetaDiagnostics /.test(PANEL) && /await fetchDiagnostics\(\)/.test(PANEL));
check('⚠️ El componente vive en el ÁMBITO DEL MÓDULO (v4.971)',
      /^const MetaDiagnostics/m.test(PANEL));
check('Se pintan los ids, no sólo los nombres',
      /\{p\.pageId\}/.test(PANEL) && /\{i\.igId\}/.test(PANEL));

// ════════════════════════════════════════════════════════════════════
grupo('14. El caso REAL del 13/09/2026, tal como lo devolvió Meta');

// El informe que dejó v4.1045 en producción, copiado literalmente:
//
//   me/accounts: 0
//   me/businesses: 1
//   863853759019296/owned_pages: 2   (dos Páginas ajenas, sin token)
//   client_pages: (#100) … requiere 'pages_read_engagement'
//   granular_scopes: (#100) Tried accessing nonexisting field
//
// La última línea era un defecto NUESTRO: ese campo no existe en `/me`.
graph({
    'me/accounts': { data: [] },
    'me/businesses': { data: [{ id: '863853759019296', name: 'Valkomen LLC' }] },
    '863853759019296/owned_pages': { data: [
        pagina('177382586258100', 'Maríalex Sánchez', false),
        pagina('183933968361265', 'Tickeala Store', false),
    ] },
    '863853759019296/client_pages': { error: "(#100) Object does not exist… requires the 'pages_read_engagement' permission" },
    'debug_token': { data: { granular_scopes: [
        { scope: 'pages_manage_posts', target_ids: ['728932976959414'] },
        { scope: 'instagram_basic', target_ids: ['17841408037178163'] },
    ] } },
    '728932976959414': pagina('728932976959414', 'Distrito 4281 de RI'),
    '177382586258100': { error: 'sin token' },
    '183933968361265': { error: 'sin token' },
    '17841408037178163': { error: 'no es una Página' },
});
r = await META.discoverUserPages('user-token');
check('⚠️ La Página del Distrito llega, con `me/accounts` en 0 y el portafolio devolviendo otras dos',
      r.pages.length === 1 && r.pages[0].id === '728932976959414');
check('…con su token de publicación', r.pages[0].accessToken === 'tok-728932976959414');
check('⚠️ Las Páginas que NADIE marcó no se reportan como un problema',
      !r.notes.some(n => n.code === 'page_without_token'));
check('El fallo de `client_pages` sí se dice, con su motivo textual de Meta',
      r.notes.some(n => n.code === 'business_pages_unreachable' && /pages_read_engagement/.test(n.reason)));
check('Ya no hay ningún aviso de que los activos no se pudieron leer',
      !r.notes.some(n => n.code === 'granular_scopes_unreachable'));

// ⚠️ A LA INVERSA, EL DEFECTO EXACTO DE v4.1045: pedirle `granular_scopes` a
// `/me` no devuelve una lista vacía — Meta lo rechaza, y entonces esta misma
// autorización vuelve a entregar CERO Páginas.
graph({
    'me/accounts': { data: [] },
    'me/businesses': { data: [] },
    'me': { error: '(#100) Tried accessing nonexisting field (granular_scopes)' },
    'debug_token': { data: { granular_scopes: [{ scope: 'pages_manage_posts', target_ids: ['728932976959414'] }] } },
    '728932976959414': pagina('728932976959414', 'Distrito 4281 de RI'),
});
r = await META.discoverUserPages('user-token');
check('Se consulta `/debug_token`, que es donde Meta publica los activos concedidos',
      llamadas.some(l => /\/debug_token\?/.test(l.url)));
check('…y NO `/me?fields=granular_scopes`, que Meta rechaza',
      !llamadas.some(l => /fields=granular_scopes/.test(l.url)));
check('(a la inversa) Con ese campo rechazado, la Página llega igual', r.pages.length === 1);

// Pedir `access_token` puede hacer fallar la consulta entera; la Página tiene
// que llegar igual, para poder decir que le falta el token.
graph({
    'me/accounts': { data: [] },
    'me/businesses': { data: [] },
    'debug_token': { data: { granular_scopes: [{ scope: 'pages_manage_posts', target_ids: ['728932976959414'] }] } },
    '728932976959414': { error: '(#100) no se puede pedir access_token' },
    '728932976959414#min': { id: '728932976959414', name: 'Distrito 4281 de RI' },
});
r = await META.discoverUserPages('user-token');
check('⚠️ Una Página autorizada NO desaparece porque falle el sondeo completo',
      r.notes.some(n => n.code === 'page_without_token' && n.pageId === '728932976959414'));
check('…y se la nombra por su nombre, no por su id',
      r.notes.some(n => n.code === 'page_without_token' && n.title === 'Distrito 4281 de RI'));

// Sin el secreto de la aplicación no se puede inspeccionar el token: se dice.
const secretoPrevio = process.env.META_APP_SECRET;
process.env.META_APP_SECRET = '';
graph({ 'me/accounts': { data: [pagina('p1', 'Una')] }, 'me/businesses': { data: [] } });
r = await META.discoverUserPages('user-token');
check('Sin `META_APP_SECRET` se dice que por eso no se pudieron leer los activos',
      r.notes.some(n => n.code === 'granular_scopes_unreachable' && /META_APP_SECRET/.test(n.reason)));
check('…y lo que sí se pudo leer no se pierde', r.pages.length === 1);
process.env.META_APP_SECRET = secretoPrevio;

// ⚠️ Esa dirección lleva el token de usuario Y el secreto de la aplicación.
const SRV = codigo('server/services/metaService.js');
check('⚠️ NINGUNA DIRECCIÓN SE REGISTRA: la de `debug_token` lleva el secreto de la aplicación',
      !/console\.(log|warn|error)\([^)]*url/i.test(SRV));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
