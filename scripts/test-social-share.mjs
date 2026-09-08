#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// DIFUSIÓN DE CONTENIDO EN REDES.  npm run test:social:share
// v4.1013.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro; el CAMINO corre de
// verdad con la base, Meta y el descifrado sustituidos por un hook de
// resolución de módulos.
//
// ⚠️ LAS DOS MITADES HACEN FALTA, y es la lección de v4.744 y v4.889: el
// criterio puede estar entero y el defecto vivir en el camino. Acá se ejercita
// que el candado contra el doble clic sea de la BASE, que el token descifrado
// llegue a Meta y NO vuelva en ninguna respuesta, que una cuenta ajena no se
// pueda usar y que un borrador no llegue a gastar una llamada al proveedor.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE UN DOBLE CLIC NO PUBLIQUE DOS VECES. El precio de equivocarse es una
//      publicación duplicada en la página de una institución, que hay que ir a
//      borrar a mano en Facebook.
//
//   2. QUE NO SE PUEDA PUBLICAR EN LA PÁGINA DE OTRO TENANT. El aislamiento va
//      en el `WHERE`, no en la pantalla.
//
//   3. QUE EL TOKEN NO VIAJE AL NAVEGADOR, ni recortado.
//
//   4. QUE UN BORRADOR NO SE COMPARTA. Su dirección pública devuelve 404 y
//      Facebook mostraría una tarjeta rota que después no se puede arreglar
//      editando el artículo.
//
//   5. QUE UN FALLO DE META SE DIGA CON SU CAUSA Y SU SALIDA, nunca «no se
//      pudo publicar».
//
//   6. QUE NO HAYA UN SEGUNDO MOTOR DE META. Con dos caminos al proveedor, el
//      día que se corrija el manejo de un rechazo una mitad se queda atrás y el
//      fallo es MUDO: las dos siguen publicando.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-share-stub.mjs', HERE).href;
const META = new URL('./scripts/fixtures/meta-share-stub.mjs', HERE).href;
const CRYPTO = new URL('./scripts/fixtures/crypto-share-stub.mjs', HERE).href;
const PRISMA = new URL('./scripts/fixtures/prisma-share-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como `'./db.js'` y con el sufijo largo no
// casarían — no fallaría ruidosamente, se conectaría a un Postgres que no está.
register(
    `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        if(/socialPublishService\\.js$/.test(s)) return {url:${JSON.stringify(META)},shortCircuit:true};
        if(/tokenCrypto\\.js$/.test(s)) return {url:${JSON.stringify(CRYPTO)},shortCircuit:true};
        if(/(^|\\/)prisma\\.js$/.test(s)) return {url:${JSON.stringify(PRISMA)},shortCircuit:true};
        return n(s,c);
     }`,
    HERE
);

const SPEC = await import('../server/lib/socialShareSpec.js');
const URLS = await import('../server/lib/postPublicUrl.js');
const SVC = await import('../server/lib/socialPublishingService.js');
const CTRL = await import('../server/controllers/contentShareController.js');
const db = await import(DB);
const meta = await import(META);
const prismaStub = await import(PRISMA);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
/** El archivo SIN comentarios: el comentario que explica un cambio no puede
 *  hacer fallar la comprobación que lo defiende (la lección de v4.1005). */
const codigo = f => leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const fakeRes = () => {
    const r = { statusCode: 200, body: null, headers: {} };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.set = (k, v) => { r.headers[k] = v; return r; };
    return r;
};

// ── El escenario ────────────────────────────────────────────────────
const ADMIN_A = { id: 'ua', role: 'club_admin', email: 'a@a.org', name: 'Daniel Yazo', clubId: 'A' };
const ADMIN_B = { id: 'ub', role: 'club_admin', email: 'b@b.org', clubId: 'B' };
const OPERADOR = { id: 'op', role: 'administrator', email: 'op@p.org', clubId: 'origen' };

const CLUBS = [
    { id: 'A', name: 'Distrito 4281', type: 'district', district: '4281', domain: null, subdomain: 'd4281' },
    { id: 'B', name: 'Club Cali', type: 'club', domain: 'clubcali.org' },
    { id: 'origen', name: 'Origen', type: 'club', domain: null, subdomain: 'origen' },
];
const DISTRITOS = [{ id: 'dis-4281', number: 4281, domain: 'rotary4281.org', subdomain: 'd4281' }];

const PUBLICADO = {
    id: 'p1', title: 'Club Rotario Pereira dona rotomartillos a Bomberos',
    clubId: 'A', targetClubIds: [], published: true, slug: 'club-rotario-pereira-dona-rotomartillos',
    socialCopy: 'El Club Rotario Pereira entregó dos rotomartillos a los Bomberos Voluntarios.',
    excerpt: 'Un resumen', image: 'https://cdn/foto.jpg',
};
const BORRADOR = { id: 'p2', title: 'Sevilla Capital Cafetera apoya a damnificados', clubId: 'A', published: false, slug: 'sevilla' };
const DE_OTRO = { id: 'p3', title: 'Noticia de Cali', clubId: 'B', published: true, slug: 'cali' };

const PAGINA_A = { id: 'acc-a', clubId: 'A', platform: 'facebook', platformId: '111', accountName: 'Página oficial Distrito 4281', accessToken: 'v1:TOKEN-A' };
const PAGINA_A2 = { id: 'acc-a2', clubId: 'A', platform: 'facebook', platformId: '112', accountName: 'Segunda página del 4281', accessToken: 'v1:TOKEN-A2' };
const PAGINA_B = { id: 'acc-b', clubId: 'B', platform: 'facebook', platformId: '222', accountName: 'Página de Cali', accessToken: 'v1:TOKEN-B' };
const PAGINA_VIEJA = { id: 'acc-old', clubId: 'A', platform: 'facebook', platformId: '113', accountName: 'Conectada antes del cifrado', tokenVersion: 0, accessToken: 'plano' };
const PAGINA_IG = { id: 'acc-ig', clubId: 'A', platform: 'instagram', platformId: 'ig1', accountName: 'IG del 4281', accessToken: 'v1:TOKEN-IG' };

const sembrar = (extra = {}) => {
    db.seed({
        posts: [PUBLICADO, BORRADOR, DE_OTRO].map(p => ({ ...p })),
        clubs: CLUBS, districts: DISTRITOS,
        accounts: [PAGINA_A, PAGINA_A2, PAGINA_B, PAGINA_VIEJA, PAGINA_IG].map(a => ({ ...a })),
        ...extra,
    });
    meta.reset();
    prismaStub.reset();
};

// ════════════════════════════════════════════════════════════════════
grupo('1. Las redes — qué hay y qué se declara sin implementar');

const fb = SPEC.networkOf('facebook');
const ig = SPEC.networkOf('instagram');
const li = SPEC.networkOf('linkedin');
check('Facebook está disponible y admite enlaces', fb.available && fb.linkable);
check('Instagram está disponible y NO admite enlaces', ig.available && !ig.linkable);
check('Instagram dice POR QUÉ no admite un enlace', /pie|enlace/i.test(ig.note || ''));
check('LinkedIn está DECLARADO y sin adaptador', !li.available && !!li.note);
eq('Sólo Facebook puede recibir un artículo hoy', SPEC.linkNetworks(), ['facebook']);
check('El catálogo de entidades es CERRADO', SPEC.isEntityType('post') && !SPEC.isEntityType('cualquier-cosa'));

// ════════════════════════════════════════════════════════════════════
grupo('2. Se puede compartir — el borrador no, y se dice por qué');

const okShare = SPEC.shareability({ post: { published: true }, publicUrl: 'https://rotary4281.org/blog/x' });
check('Un artículo publicado con dirección pública se comparte', okShare.ok);

const borrador = SPEC.shareability({ post: { published: false }, publicUrl: 'https://rotary4281.org/blog/x' });
check('Un BORRADOR no se comparte', !borrador.ok);
check('…y lo dice con las palabras del pedido', /todavía no está publicado/i.test(borrador.reason));
check('…y ofrece la SALIDA, no sólo el motivo', !!borrador.fix && /publicalo/i.test(borrador.fix));
check('…y explica la consecuencia (404 / tarjeta rota)', /404|rota/i.test(borrador.fix));

const sinUrl = SPEC.shareability({ post: { published: true }, publicUrl: '' });
check('Sin dirección pública no se comparte', !sinUrl.ok);
check('…y dice dónde se configura el dominio', /Configuración|Identidad/i.test(sinUrl.fix || ''));

const relativa = SPEC.shareability({ post: { published: true }, publicUrl: '/blog/x' });
check('Una dirección relativa no sirve para Facebook', !relativa.ok);

// ════════════════════════════════════════════════════════════════════
grupo('3. La cuenta está lista — cada fallo con su causa y su salida');

check('Una página activa y cifrada está lista', SPEC.accountReadiness({ platform: 'facebook', status: 'active', tokenVersion: 1 }).ok);

const legacy = SPEC.accountReadiness({ platform: 'facebook', status: 'active', tokenVersion: 0 });
check('Un token del formato anterior NO se usa', !legacy.ok);
eq('…y se nombra el código', legacy.code, 'token_legacy');
check('…y dice dónde reconectar', /Redes Sociales|Hub Social/i.test(legacy.fix || ''));

const revocada = SPEC.accountReadiness({ platform: 'facebook', status: 'revoked', tokenVersion: 1 });
check('Una página que revocó la autorización no publica', !revocada.ok);
check('…y el motivo distingue revocada de vencida', /revocó/i.test(revocada.reason));

const vencida = SPEC.accountReadiness({ platform: 'facebook', status: 'active', tokenVersion: 1, expiresAt: '2020-01-01T00:00:00Z' });
check('Una credencial vencida no publica', !vencida.ok && vencida.code === 'token_expired');

const sinPermiso = SPEC.accountReadiness({ platform: 'facebook', status: 'active', tokenVersion: 1, metadata: { tasks: ['ANALYZE'] } });
check('Sin permiso de creación de contenido no publica', !sinPermiso.ok && sinPermiso.code === 'no_permission');

const sinTasks = SPEC.accountReadiness({ platform: 'facebook', status: 'active', tokenVersion: 1, metadata: {} });
check('Una conexión antigua SIN permisos declarados no se descalifica', sinTasks.ok);

const igLink = SPEC.accountReadiness({ platform: 'instagram', status: 'active', tokenVersion: 1 }, { kind: 'link' });
check('Instagram no recibe un enlace, y se dice el motivo', !igLink.ok && /enlace/i.test(igLink.reason));

// ════════════════════════════════════════════════════════════════════
grupo('4. El texto que se publica');

eq('El copy estratégico es el defecto', SPEC.defaultShareMessage({ socialCopy: 'copy', excerpt: 'ex', title: 't' }), 'copy');
eq('Sin copy, el extracto', SPEC.defaultShareMessage({ excerpt: 'ex', title: 't' }), 'ex');
eq('Sin extracto, el titular', SPEC.defaultShareMessage({ title: 't' }), 't');
eq('Sin nada, cadena vacía — no se inventa un texto', SPEC.defaultShareMessage({}), '');

const contenido = SPEC.buildShareContent({ message: 'hola', link: 'https://x.org/blog/a' });
eq('Un artículo viaja SIEMPRE como enlace', contenido.kind, 'link');
check('…sin archivo adjunto: la imagen la toma Facebook del Open Graph', contenido.mediaUrl === null);
check('Un texto vacío se rechaza con su motivo', !SPEC.validateShareMessage('   ').ok);

// ════════════════════════════════════════════════════════════════════
grupo('5. Los fallos de Meta se traducen SIN perder el original');

const t190 = SPEC.describeMetaFailure('(#190) Error validating access token: Session has expired');
eq('Un token vencido se nombra', t190.code, 'token_expired');
check('…y se dice DÓNDE se corrige', /Reconectala desde Configuración → Redes Sociales/.test(t190.message));
check('…y el texto original de Meta se CONSERVA', /#190/.test(t190.message));
check('Un 200 es falta de permiso', SPEC.describeMetaFailure('(#200) Permissions error').code === 'no_permission');
check('Un 368 es política y NO se reintenta', SPEC.describeMetaFailure('(#368) blocked by policy').retryable === false);
check('Un límite de tasa SÍ se puede reintentar', SPEC.describeMetaFailure('(#4) rate limit reached').retryable === true);
const desconocido = SPEC.describeMetaFailure('algo rarísimo');
check('Un error desconocido NO se disfraza de conocido', desconocido.code === 'unknown');
check('…y sale con el texto de Meta, no con «no se pudo publicar»', /algo rarísimo/.test(desconocido.message));

// ════════════════════════════════════════════════════════════════════
grupo('6. En qué sitio se publica cada artículo');

eq('Una propia resuelve a su sitio', URLS.siteForPost({ clubId: 'A' }, 'A').clubId, 'A');
eq('Una réplica resuelve al sitio DESDE EL QUE SE MIRA',
   URLS.siteForPost({ clubId: null, targetClubIds: ['A', 'B'] }, 'A').clubId, 'A');
eq('…y desde el otro destino, al otro',
   URLS.siteForPost({ clubId: null, targetClubIds: ['A', 'B'] }, 'B').clubId, 'B');
const noDirigida = URLS.siteForPost({ clubId: null, targetClubIds: ['B'] }, 'A');
check('Una que NO está dirigida a este sitio no tiene dirección acá', noDirigida.clubId === null);
eq('…y se dice el motivo', noDirigida.source, 'no_dirigida_a_este_sitio');
eq('Una global heredada resuelve al sitio de la sesión',
   URLS.siteForPost({ clubId: null, targetClubIds: [] }, 'A').clubId, 'A');

sembrar();
const urlDistrito = await URLS.publicUrlForPost(PUBLICADO, 'A');
eq('⚠️ El dominio de un DISTRITO sale de la fila de District, no de Club (v4.744)',
   urlDistrito.url, 'https://rotary4281.org/blog/club-rotario-pereira-dona-rotomartillos');

sembrar();
const urlClub = await URLS.publicUrlForPost(DE_OTRO, 'B');
eq('Un club usa su propio dominio', urlClub.url, 'https://clubcali.org/blog/cali');

// ════════════════════════════════════════════════════════════════════
grupo('7. El CAMINO — qué páginas ve cada tenant');

sembrar();
let res = fakeRes();
await CTRL.getShareTargets({ user: ADMIN_A, query: { entityType: 'post', entityId: 'p1' } }, res);
eq('El sitio A ve sus páginas', res.body.targets.map(t => t.id).sort(), ['acc-a', 'acc-a2', 'acc-ig', 'acc-old']);
check('…y NUNCA la de otro sitio', !res.body.targets.some(t => t.id === 'acc-b'));
check('⚠️ NINGUNA respuesta lleva un access token, ni recortado',
      !JSON.stringify(res.body).toLowerCase().includes('token-a'));
check('Cada página dice si SIRVE', res.body.targets.find(t => t.id === 'acc-a').ready === true);
check('…y la que no, POR QUÉ', res.body.targets.find(t => t.id === 'acc-old').ready === false
      && /formato anterior/i.test(res.body.targets.find(t => t.id === 'acc-old').reason));
eq('La dirección pública viaja resuelta', res.body.publicUrl, 'https://rotary4281.org/blog/club-rotario-pereira-dona-rotomartillos');
eq('El copy estratégico es el texto propuesto', res.body.defaultMessage, PUBLICADO.socialCopy);
check('El artículo se puede compartir', res.body.shareable === true);

sembrar();
res = fakeRes();
await CTRL.getShareTargets({ user: ADMIN_B, query: { entityType: 'post', entityId: 'p1' } }, res);
eq('⚠️ Un artículo de OTRO sitio responde 404, no 403 — un 403 confirmaría que existe', res.statusCode, 404);

sembrar();
res = fakeRes();
await CTRL.getShareTargets({ user: ADMIN_A, query: { entityType: 'post', entityId: 'p2' } }, res);
check('Un borrador SÍ abre el modal…', res.statusCode === 200);
check('…y dice que todavía no se puede compartir', res.body.shareable === false);
check('…con su motivo a la vista', /todavía no está publicado/i.test(res.body.shareReason));

// ════════════════════════════════════════════════════════════════════
grupo('8. El CAMINO — publicar');

sembrar();
let r = await SVC.shareEntity({
    entityType: 'post', entityId: 'p1', accountIds: ['acc-a'],
    message: 'Texto de prueba', operationKey: 'op-1', user: ADMIN_A,
});
check('Publica', r.ok === true && r.status === 'published');
eq('Meta recibió UNA llamada', meta.llamadas.length, 1);
eq('…de tipo enlace', meta.llamadas[0].kind, 'link');
eq('…con la dirección pública del sitio', meta.llamadas[0].link, 'https://rotary4281.org/blog/club-rotario-pereira-dona-rotomartillos');
eq('…con el texto que se escribió', meta.llamadas[0].message, 'Texto de prueba');
eq('⚠️ …y con el token DESCIFRADO', meta.llamadas[0].token, 'TOKEN-A');
check('El desenlace trae el id externo de Meta', !!r.outcomes[0].externalId);
check('…y su URL, para poder abrir la publicación después', !!r.outcomes[0].externalUrl);
check('⚠️ El token NO viaja en la respuesta', !JSON.stringify(r).includes('TOKEN-A'));
eq('Queda UN registro de difusión', db.tablas.ContentDistribution.length, 1);
eq('…en estado publicado', db.tablas.ContentDistribution[0].status, 'published');
eq('…con quién lo publicó', db.tablas.ContentDistribution[0].userName, 'Daniel Yazo');
check('…y con el texto que de verdad salió', db.tablas.ContentDistribution[0].message === 'Texto de prueba');

// ════════════════════════════════════════════════════════════════════
grupo('9. ⚠️ El doble clic NO publica dos veces');

sembrar();
const [r1, r2] = await Promise.all([
    SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'Hola', operationKey: 'op-doble', user: ADMIN_A }),
    SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'Hola', operationKey: 'op-doble', user: ADMIN_A }),
]);
eq('Meta recibió UNA sola llamada con la misma clave de operación', meta.llamadas.length, 1);
eq('…y hay UNA sola fila de difusión', db.tablas.ContentDistribution.length, 1);
check('La segunda se reconoce como repetida, no como un fallo',
      [r1, r2].some(x => x.outcomes?.[0]?.duplicate === true));

// Y publicar de nuevo A PROPÓSITO sí publica: otra operación, otra clave.
await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'Hola', operationKey: 'op-otra', user: ADMIN_A });
eq('«Publicar nuevamente» sí llama a Meta otra vez', meta.llamadas.length, 2);
eq('…y deja su propio registro', db.tablas.ContentDistribution.length, 2);

sembrar();
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'x', operationKey: '', user: ADMIN_A });
eq('Sin clave de operación se rechaza', r.code, 400);
check('…y se dice para qué sirve', /doble clic/i.test(r.error));

// ════════════════════════════════════════════════════════════════════
grupo('10. ⚠️ Lo que NO se publica, y por qué');

sembrar();
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p2', accountIds: ['acc-a'], message: 'x', operationKey: 'op-b', user: ADMIN_A });
eq('Un borrador se rechaza ANTES de gastar una llamada a Meta', r.code, 409);
eq('…y Meta no se llamó', meta.llamadas.length, 0);
eq('…y no quedó ningún registro a medias', db.tablas.ContentDistribution.length, 0);

sembrar();
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-b'], message: 'x', operationKey: 'op-c', user: ADMIN_A });
eq('⚠️ La página de OTRO tenant no se puede usar', r.code, 404);
eq('…y Meta no se llamó', meta.llamadas.length, 0);

sembrar();
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-old'], message: 'x', operationKey: 'op-d', user: ADMIN_A });
check('Una página con token legacy no llega a Meta', meta.llamadas.length === 0);
check('…y el motivo va con su salida', /formato anterior/i.test(r.outcomes[0].error) && /Redes Sociales/i.test(r.outcomes[0].fix || ''));
eq('…y no se escribe un registro de algo que no se intentó', db.tablas.ContentDistribution.length, 0);

sembrar();
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-ig'], message: 'x', operationKey: 'op-e', user: ADMIN_A });
check('Instagram no recibe un enlace y se dice el motivo', !r.ok && /enlace/i.test(r.outcomes[0].error));

sembrar();
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: '  ', operationKey: 'op-f', user: ADMIN_A });
eq('Un texto vacío se rechaza antes de publicar', r.code, 400);

// ════════════════════════════════════════════════════════════════════
grupo('11. Un fallo de Meta se guarda con su causa');

sembrar();
meta.responder([{ ok: false, error: '(#190) Error validating access token' }]);
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'x', operationKey: 'op-g', user: ADMIN_A });
check('El resultado no es exitoso', r.ok === false && r.status === 'error');
check('El motivo se tradujo y dice dónde se corrige', /Reconectala desde Configuración → Redes Sociales/.test(r.outcomes[0].error));
eq('El registro queda en error, no borrado', db.tablas.ContentDistribution[0].status, 'error');
eq('…con el código del fallo, para poder agrupar', db.tablas.ContentDistribution[0].errorCode, 'token_expired');

sembrar();
meta.responder([
    { ok: true, externalId: 'fb-1', externalUrl: 'https://facebook.com/1' },
    { ok: false, error: '(#200) Permissions error' },
]);
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a', 'acc-a2'], message: 'x', operationKey: 'op-h', user: ADMIN_A });
eq('⚠️ Con una página bien y otra mal el estado es PARCIAL, no «error»', r.status, 'partial');
check('…y se dice cuál falló y cuál no', r.outcomes.filter(o => o.ok).length === 1);

// ════════════════════════════════════════════════════════════════════
grupo('12. El historial de difusión');

sembrar();
await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'Primera', operationKey: 'h-1', user: ADMIN_A });
await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'Segunda', operationKey: 'h-2', user: ADMIN_A });
const hist = await SVC.historyFor({ entityType: 'post', entityId: 'p1', user: ADMIN_A });
eq('Quedan las DOS publicaciones: el historial sólo agrega', hist.entries.length, 2);
check('Se conserva el texto de cada una', hist.entries.map(e => e.message).sort().join('|') === 'Primera|Segunda');
check('El resumen dice que ya salió', hist.summary.published === true);
eq('…y en qué red', hist.summary.networks, ['facebook']);

const resumen = await SVC.historySummaryFor({ entityType: 'post', entityIds: ['p1', 'p2'], clubId: 'A' });
check('El resumen del listado sale en UNA consulta y sólo trae lo que hay',
      resumen.p1?.published === true && !resumen.p2);
check('…y trae la URL de la última publicación, para el enlace directo', !!resumen.p1.lastUrl);

// ════════════════════════════════════════════════════════════════════
grupo('12b. Un fallo de la auditoría NO cuesta la publicación');

sembrar();
prismaStub.setFallar(true);
r = await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'x', operationKey: 'aud-1', user: ADMIN_A });
check('⚠️ Con la auditoría caída, la publicación SALE igual', r.ok === true && r.status === 'published');
eq('…y su registro de difusión queda escrito', db.tablas.ContentDistribution[0].status, 'published');
prismaStub.setFallar(false);

sembrar();
await SVC.shareEntity({ entityType: 'post', entityId: 'p1', accountIds: ['acc-a'], message: 'x', operationKey: 'aud-2', user: ADMIN_A });
check('Con la auditoría sana, queda su asiento', prismaStub.registros.length === 1);
check('…que dice de qué entidad se trata', /post:p1/.test(JSON.stringify(prismaStub.registros[0])));

// ════════════════════════════════════════════════════════════════════
grupo('13. Invariantes que ninguna otra comprobación ve');

const svc = codigo('server/lib/socialPublishingService.js');
const ctrl = codigo('server/controllers/contentShareController.js');
const spec = codigo('server/lib/socialShareSpec.js');
const espejo = codigo('src/lib/socialShare.ts');
const news = codigo('src/pages/admin/News.tsx');
const modal = codigo('src/components/admin/social/ShareModal.tsx');
const prisma = leer('server/prisma/schema.prisma');
const ensure = leer('server/lib/ensureContentDistributionSchema.js');

// ⚠️ NO HAY UN SEGUNDO MOTOR DE META. Se cuentan los LLAMADORES, no la forma
// de llamar: fijar la sintaxis se rompería al refactorizar con el criterio
// intacto (la lección de v4.984).
const llamadores = ['server/lib/socialPublishingService.js', 'server/controllers/contentShareController.js']
    .filter(f => /publishContentToTarget\s*\(/.test(codigo(f)));
eq('⚠️ `publishContentToTarget` se llama desde UN solo sitio del módulo', llamadores, ['server/lib/socialPublishingService.js']);
check('…y el módulo no reimplementa la Graph API', !/graph\.facebook\.com/i.test(svc + ctrl + spec));

// El token no puede salir por ninguna vía.
check('⚠️ El controlador nunca selecciona un accessToken', !/accessToken/i.test(ctrl));
check('…y el servicio lo lee en UN solo punto', (svc.match(/SELECT "accessToken"/g) || []).length === 1);
check('…que no es el que arma la lista de páginas', !/accessToken/.test(svc.split('export const describeTargets')[1].split('export const')[0]));

// El tenant sale del token.
check('⚠️ El tenant de las páginas NUNCA sale del cuerpo de la petición',
      !/req\.body[\s\S]{0,40}clubId/.test(ctrl));

// `Post` no gana columnas.
const modeloPost = prisma.split(/\nmodel Post\s/)[1]?.split('\n}')[0] || '';
check('⚠️ `Post` NO gana ninguna columna de difusión (regla de `logo_intl`, v4.699)',
      !/socialShare|distribution|externalPostId|facebookPostId/i.test(modeloPost));
check('…y `ContentDistribution` NO está declarada en Prisma', !/\nmodel ContentDistribution\s/.test(prisma));

// El ensure enumera sus ADD COLUMN (la trampa de v4.908).
const addColumns = [...ensure.matchAll(/ADD COLUMN IF NOT EXISTS\s+("?\w+"?)/gi)].map(m => m[1].replace(/"/g, ''));
const enumeradas = [...ensure.matchAll(/'"(\w+)" [A-Z]/g)].map(m => m[1]);
check('⚠️ Todo `ADD COLUMN` está enumerado en el atajo del ensure',
      addColumns.every(c => enumeradas.includes(c)), `ALTER: ${addColumns} / enumeradas: ${enumeradas}`);

// El índice único NO es parcial → el ON CONFLICT va a secas (v4.648).
check('El índice único de la operación NO es parcial', !/ContentDistribution_operation_account_key[\s\S]{0,200}WHERE/i.test(ensure));
check('…así que el `ON CONFLICT` va a secas', /ON CONFLICT \("operationKey","accountId"\) DO NOTHING/.test(svc));

// El espejo del navegador es MÍNIMO.
check('⚠️ El espejo NO trae el criterio de permisos', !/accountReadiness|shareability|PAGE_PUBLISH_TASKS/.test(espejo));
check('…ni la traducción de los fallos de Meta', !/describeMetaFailure|#190/.test(espejo));
check('…y la pantalla no vuelve a decidir quién puede publicar', !/tokenVersion|permissions/.test(modal));

// Las casillas mudas no vuelven.
check('⚠️ Las casillas que NO publicaban nada no vuelven a News.tsx',
      !/publishFacebook|publishLinkedin|publishTwitter/.test(news));
check('…ni la promesa de que publicaba al guardar',
      !/publicará automáticamente/.test(news));

// Un solo modal, montado por las DOS entradas.
eq('⚠️ UN solo `<ShareModal>` en News.tsx: el listado y el editor lo comparten',
   (news.match(/<ShareModal/g) || []).length, 1);
eq('…y las DOS entradas lo abren con el mismo estado (el listado y el editor)',
   (news.match(/setCompartiendo\((?!null)/g) || []).length, 2);
check('…y hay UNA sola forma de cerrarlo', (news.match(/setCompartiendo\(null\)/g) || []).length === 1);

// El modal no llama a `.json()` a ciegas (v4.946).
check('Ninguna respuesta se lee con `.json()` a ciegas', !/await\s+\w+\.json\(\)/.test(modal));

// Los componentes del modal viven en el ámbito del módulo (v4.971).
const dentroDelComponente = modal.split('const ShareModal:')[1] || '';
check('⚠️ Ningún componente se declara DENTRO de ShareModal (v4.971)',
      !/^\s{4}const [A-Z]\w*:\s*React\.FC/m.test(dentroDelComponente));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
