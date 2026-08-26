#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// PUBLICACIONES: MAESTRO Y RÉPLICAS.  npm run test:posts
// v4.938.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro; el CAMINO corre de
// verdad con la base sustituida en memoria por un hook de resolución de módulos.
//
// ⚠️ LAS DOS MITADES HACEN FALTA, y es la lección de v4.744 y v4.889: el
// criterio de visibilidad NUNCA estuvo mal —la cláusula pública era correcta
// desde v4.548—; lo que estaba mal era el CAMINO, o sea el `WHERE` que escribía
// `getClubPosts`. Una prueba que sólo ejercite el criterio habría pasado en
// verde con la publicación fantasma delante.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE UNA PUBLICACIÓN DIRIGIDA A UN SITIO APAREZCA EN SU PANEL. Es el
//      defecto reportado: se publicaba, se veía en la página pública y no
//      existía en `/admin/noticias`.
//
//   2. QUE NO APAREZCA EN EL DE OTRO. La corrección no puede abrir el
//      aislamiento por el otro lado.
//
//   3. QUE EL PANEL Y LA PÁGINA PÚBLICA USEN LA MISMA CLÁUSULA. Dos criterios
//      sobre la misma pregunta es exactamente lo que produjo el fantasma.
//
//   4. QUE RETIRAR NO BORRE EL MAESTRO. Al hacer visibles las réplicas aparece
//      el riesgo de que un sitio destino borre la fila y la publicación
//      desaparezca de los otros dos.
//
//   5. QUE QUITAR EL ÚLTIMO DESTINO NO LA VUELVA GLOBAL. Con `clubId` NULL y el
//      array vacío, la cláusula la lee como global y pasaría a verse en TODOS.
//
//   6. QUE NO SE CREE UNA SEGUNDA TABLA. La relación maestro↔réplica ya existe.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-posts-stub.mjs', HERE).href;
const PRISMA = new URL('./scripts/fixtures/prisma-posts-stub.mjs', HERE).href;
const BRAIN = new URL('./scripts/fixtures/brain-posts-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como `'./db.js'` y con el sufijo largo no
// casarían. No fallaría ruidosamente — se conectaría a un Postgres que no está
// y todo daría error de conexión (la lección de `test:ledger:write`).
register(
    `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        if(/(^|\\/)prisma\\.js$/.test(s)) return {url:${JSON.stringify(PRISMA)},shortCircuit:true};
        if(/brainService\\.js$/.test(s)) return {url:${JSON.stringify(BRAIN)},shortCircuit:true};
        return n(s,c);
     }`,
    HERE
);

const S = await import('../server/lib/postScope.js');
const C = await import('../server/controllers/contentController.js');
const stub = await import(DB);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
const codigo = f => leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

/** Un `res` de mentira que guarda lo que el controlador contestó. */
const fakeRes = () => {
    const r = { statusCode: 200, body: null, headers: {} };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.set = (k, v) => { r.headers[k] = v; return r; };
    return r;
};

const OPERADOR = { id: 'op', role: 'administrator', email: 'admin@rotary.org', clubId: 'origen' };
const ADMIN_A = { id: 'ua', role: 'club_admin', email: 'a@a.org', clubId: 'A' };
const ADMIN_B = { id: 'ub', role: 'club_admin', email: 'b@b.org', clubId: 'B' };
const EDITOR_A = { id: 'ea', role: 'editor', email: 'e@a.org', clubId: 'A' };
const SIN_SITIO = { id: 'us', role: 'club_admin', email: 's@s.org', clubId: null };

const CLUBS = [
    { id: 'A', name: 'Distrito 4281' },
    { id: 'B', name: 'Club Cali' },
    { id: 'C', name: 'Club Pasto' },
    { id: 'origen', name: 'Origen' },
];

/** El caso del reporte: una creada en Club Platform y dirigida a tres sitios. */
const CENTRAL = {
    id: 'p-central', title: 'Filtros de agua para El Hormiguero',
    clubId: null, targetClubIds: ['A', 'B', 'C'], published: true,
    slug: 'filtros-de-agua', createdAt: '2026-08-24T10:00:00Z',
};
const PROPIA_A = { id: 'p-a', title: 'Noticia propia de A', clubId: 'A', targetClubIds: [], published: true, createdAt: '2026-08-20T10:00:00Z' };
const PROPIA_B = { id: 'p-b', title: 'Noticia propia de B', clubId: 'B', targetClubIds: [], published: true, createdAt: '2026-08-19T10:00:00Z' };
const GLOBAL = { id: 'p-g', title: 'Global heredada', clubId: null, targetClubIds: [], published: true, createdAt: '2026-08-18T10:00:00Z' };

const sembrar = () => stub.seed({ posts: [CENTRAL, PROPIA_A, PROPIA_B, GLOBAL].map(p => ({ ...p })), clubs: CLUBS });

const listar = async (user, query = {}) => {
    sembrar();
    const res = fakeRes();
    await C.getClubPosts({ user, query }, res);
    return res;
};

// ════════════════════════════════════════════════════════════════════
grupo('1 · El criterio: qué es cada fila para cada sitio');
// ════════════════════════════════════════════════════════════════════

eq('la centralizada es una RÉPLICA para un destino', S.originOf(CENTRAL, 'A'), 'replicated');
eq('…y AJENA para quien no lo es', S.originOf(CENTRAL, 'Z'), 'foreign');
eq('…y CENTRAL vista desde la plataforma', S.originOf(CENTRAL, null), 'central');
eq('una noticia del sitio es PROPIA', S.originOf(PROPIA_A, 'A'), 'own');
eq('…y ajena para otro sitio', S.originOf(PROPIA_A, 'B'), 'foreign');
eq('una sin dueño y sin destinos es GLOBAL', S.originOf(GLOBAL, 'A'), 'global');
check('la global se ve en cualquier sitio', S.isVisibleTo(GLOBAL, 'A') && S.isVisibleTo(GLOBAL, 'B'));

// ⚠️ El aislamiento: la cláusula en JavaScript tiene que decir lo mismo que la
// de SQL, o el diagnóstico de reconciliación mediría con otra vara.
check('⚠️ la cláusula SQL trae las TRES ramas',
    /"clubId" = \$CLUB/.test(S.POST_VISIBILITY_SQL)
    && /cardinality/.test(S.POST_VISIBILITY_SQL)
    && /ANY\(COALESCE\("targetClubIds"/.test(S.POST_VISIBILITY_SQL));
eq('la cláusula se parametriza', S.visibilitySql(2).includes('$2'), true);

// ════════════════════════════════════════════════════════════════════
grupo('2 · ⚠️ EL DEFECTO REPORTADO: la réplica aparece en el panel del sitio');
// ════════════════════════════════════════════════════════════════════

const rA = await listar(ADMIN_A);
check('el panel de A responde 200 (no un 400 mudo)', rA.statusCode === 200, `dio ${rA.statusCode}`);
const idsA = (rA.body || []).map(p => p.id);
check('⚠️ la publicación dirigida a A APARECE en su panel', idsA.includes('p-central'),
    `devolvió ${JSON.stringify(idsA)}`);
check('…marcada como replicada', (rA.body || []).find(p => p.id === 'p-central')?.origin === 'replicated');
check('…con sus tres destinos', (rA.body || []).find(p => p.id === 'p-central')?.targetCount === 3);
check('…y nombrando los sitios',
    ((rA.body || []).find(p => p.id === 'p-central')?.targetNames || []).includes('Club Cali'));
check('la propia de A también está', idsA.includes('p-a'));
check('la global heredada también', idsA.includes('p-g'));
check('⚠️ la propia de B NO está', !idsA.includes('p-b'));

const rB = await listar(ADMIN_B);
const idsB = (rB.body || []).map(p => p.id);
check('el panel de B ve la misma réplica', idsB.includes('p-central'));
check('⚠️ …y no ve la noticia propia de A', !idsB.includes('p-a'));

// ⚠️ La fuga inversa que existía: `OR "clubId" IS NULL` le daba a cualquier
// editor TODAS las centralizadas, dirigidas a él o no.
stub.seed({
    posts: [{ id: 'p-otro', title: 'Dirigida sólo a C', clubId: null, targetClubIds: ['C'], published: true, createdAt: '2026-08-01T00:00:00Z' }],
    clubs: CLUBS,
});
const resFuga = fakeRes();
await C.getClubPosts({ user: EDITOR_A, query: {} }, resFuga);
check('⚠️ un editor de A NO ve una centralizada dirigida sólo a C',
    !(resFuga.body || []).some(p => p.id === 'p-otro'),
    JSON.stringify((resFuga.body || []).map(p => p.id)));

// ════════════════════════════════════════════════════════════════════
grupo('3 · ⚠️ EL OTRO FANTASMA: Club Platform listaba CERO');
// ════════════════════════════════════════════════════════════════════

// Hasta v4.937: `clubId = req.query.clubId` y `News.tsx` no lo manda → 400
// «clubId is required» → la pantalla lo pinta como «0 noticias registradas».
const rOp = await listar(OPERADOR);
check('⚠️ el operador SIN clubId ya no recibe un 400', rOp.statusCode === 200, `dio ${rOp.statusCode}`);
check('⚠️ …y ve el ecosistema entero', (rOp.body || []).length === 4,
    `devolvió ${(rOp.body || []).length}`);
check('la centralizada se le presenta como central',
    (rOp.body || []).find(p => p.id === 'p-central')?.origin === 'central');
check('el alcance viaja en la cabecera', rOp.headers['X-Posts-Scope'] === 'all');

const rOpSitio = await listar(OPERADOR, { clubId: 'B' });
const idsOpB = (rOpSitio.body || []).map(p => p.id);
check('el operador puede mirar UN sitio', idsOpB.includes('p-b') && idsOpB.includes('p-central'));
check('…y entonces no ve lo de A', !idsOpB.includes('p-a'));

const rSin = await listar(SIN_SITIO);
check('una sesión sin sitio recibe lista vacía CON su motivo',
    rSin.statusCode === 200 && Array.isArray(rSin.body?.posts) && !!rSin.body?.notice,
    JSON.stringify(rSin.body));

// ⚠️ Un 400 se convertía en «0 noticias» porque la pantalla se lo tragaba.
const news = codigo('src/pages/admin/News.tsx');
check('⚠️ la pantalla ya no se traga el fallo: lo DICE', /setAvisoDeCarga\(/.test(news));
check('…y lo pinta', /avisoDeCarga && \(/.test(news));
check('el listado sigue aceptando el array de siempre (aditivo)',
    /Array\.isArray\(dbPosts\) \? dbPosts/.test(news));

// ════════════════════════════════════════════════════════════════════
grupo('4 · ⚠️ EL PANEL Y LA PÁGINA PÚBLICA USAN LA MISMA CLÁUSULA');
// ════════════════════════════════════════════════════════════════════

const ctrl = codigo('server/controllers/contentController.js');
check('⚠️ la cláusula no está escrita a mano en el controlador',
    !/const CLUB_VISIBILITY_CLAUSE = `\(/.test(ctrl));
check('…se importa de `postScope.js`', /CLUB_VISIBILITY_CLAUSE = POST_VISIBILITY_SQL/.test(ctrl));
check('⚠️ el listado del panel mira los destinos', /visibilitySql\(1\)/.test(ctrl));
check('⚠️ y ya no filtra con el WHERE viejo',
    !/WHERE "clubId" = \$1 OR "clubId" IS NULL ORDER BY/.test(ctrl));
// ⚠️ Se mira el CUERPO de `getClubPosts`, no el archivo entero: el mismo
// patrón sigue en `getTrashedProjects`, que es otro módulo y no se toca acá —
// cambiarlo movería una pantalla que hoy funciona.
const cuerpoListado = ctrl.slice(ctrl.indexOf('export const getClubPosts'), ctrl.indexOf('export const createPost'));
check('⚠️ el listado ya no devuelve 400 por falta de clubId',
    !/clubId is required/.test(cuerpoListado));

// Las dos consultas —pública y administrativa— tienen que traer las tres ramas.
sembrar();
const resPub = fakeRes();
await C.getPublicPosts({ params: { clubId: 'A' }, query: {} }, resPub);
const idsPub = (resPub.body || []).map(p => p.id);
check('la página pública de A ve la réplica', idsPub.includes('p-central'));
check('⚠️ y el panel de A ve exactamente lo mismo publicado',
    idsPub.every(id => idsA.includes(id)),
    `público ${JSON.stringify(idsPub)} vs panel ${JSON.stringify(idsA)}`);

// ════════════════════════════════════════════════════════════════════
grupo('5 · ⚠️ RETIRAR NO ES ELIMINAR (punto H)');
// ════════════════════════════════════════════════════════════════════

eq('sobre una réplica, el botón RETIRA', S.removalIntent(ADMIN_A, CENTRAL, 'A').action, 'retire');
eq('sobre lo propio, ELIMINA', S.removalIntent(ADMIN_A, PROPIA_A, 'A').action, 'delete');
eq('⚠️ sobre una global, un sitio no puede nada', S.removalIntent(ADMIN_A, GLOBAL, 'A').action, 'none');
eq('el operador sí elimina el maestro', S.removalIntent(OPERADOR, CENTRAL, null).action, 'delete');
check('⚠️ una réplica NO se edita desde el sitio destino', !S.canEditPost(ADMIN_A, CENTRAL, 'A'));
check('…y lo propio sí', S.canEditPost(ADMIN_A, PROPIA_A, 'A'));

sembrar();
const resRet = fakeRes();
await C.deletePost({ user: ADMIN_A, params: { id: 'p-central' } }, resRet);
check('retirar contesta que RETIRÓ, no que eliminó', resRet.body?.action === 'retired', JSON.stringify(resRet.body));
check('⚠️ el maestro SIGUE existiendo', stub.tablas.Post.some(p => p.id === 'p-central'));
eq('⚠️ …y conserva los otros dos destinos',
    stub.tablas.Post.find(p => p.id === 'p-central').targetClubIds, ['B', 'C']);
check('sigue publicada para los demás', stub.tablas.Post.find(p => p.id === 'p-central').published === true);

// Y B la sigue viendo.
const resB2 = fakeRes();
await C.getClubPosts({ user: ADMIN_B, query: {} }, resB2);
check('⚠️ B la sigue viendo después de que A la retirara',
    (resB2.body || []).some(p => p.id === 'p-central'));

// El sitio no puede borrar el maestro por la puerta de atrás.
sembrar();
const resNo = fakeRes();
await C.deletePost({ user: ADMIN_A, params: { id: 'p-g' } }, resNo);
check('⚠️ un sitio no borra una publicación global', resNo.statusCode === 403);
check('…y la fila sigue ahí', stub.tablas.Post.some(p => p.id === 'p-g'));

// Lo propio sí se borra.
sembrar();
const resSi = fakeRes();
await C.deletePost({ user: ADMIN_A, params: { id: 'p-a' } }, resSi);
check('lo propio sí se elimina', resSi.body?.action === 'deleted' && !stub.tablas.Post.some(p => p.id === 'p-a'));

// ════════════════════════════════════════════════════════════════════
grupo('6 · ⚠️ QUITAR EL ÚLTIMO DESTINO NO LA VUELVE GLOBAL');
// ════════════════════════════════════════════════════════════════════

const unico = { id: 'p-uno', title: 'Sólo en A', clubId: null, targetClubIds: ['A'], published: true, createdAt: '2026-08-01T00:00:00Z' };
const plan = S.retirePlan(unico, 'A');
check('el criterio lo detecta', plan.unpublish === true && plan.targets.length === 0);
check('…y lo DICE con su consecuencia', /despublicada/.test(plan.notice || ''));

stub.seed({ posts: [{ ...unico }], clubs: CLUBS });
const resU = fakeRes();
await C.deletePost({ user: ADMIN_A, params: { id: 'p-uno' } }, resU);
const tras = stub.tablas.Post.find(p => p.id === 'p-uno');
check('⚠️ quedó DESPUBLICADA, no global visible en todos', tras.published === false,
    JSON.stringify(tras));
check('el contenido se conserva', tras.title === 'Sólo en A');
check('y se avisa', !!resU.body?.notice);

// Comprobado por el otro lado: si se hubiera dejado publicada con 0 destinos,
// B la vería. Es exactamente lo que la despublicación evita.
const resBGlobal = fakeRes();
await C.getClubPosts({ user: ADMIN_B, query: {} }, resBGlobal);
const filaB = (resBGlobal.body || []).find(p => p.id === 'p-uno');
check('⚠️ B no la ve publicada', !filaB || filaB.published === false);

// ════════════════════════════════════════════════════════════════════
grupo('7 · El borrado en bloque no miente');
// ════════════════════════════════════════════════════════════════════

sembrar();
const resBulk = fakeRes();
await C.bulkDeletePosts({ user: ADMIN_A, body: { ids: ['p-a', 'p-central', 'p-g', 'p-b'] } }, resBulk);
eq('elimina sólo lo propio', resBulk.body?.deleted, 1);
eq('retira la réplica', resBulk.body?.retired, 1);
check('⚠️ y DICE lo que no pudo tocar', (resBulk.body?.skipped || []).length === 2,
    JSON.stringify(resBulk.body?.skipped));
check('⚠️ la global sigue existiendo', stub.tablas.Post.some(p => p.id === 'p-g'));
check('⚠️ la de B sigue existiendo', stub.tablas.Post.some(p => p.id === 'p-b'));
check('el maestro de la réplica sigue existiendo', stub.tablas.Post.some(p => p.id === 'p-central'));

// ════════════════════════════════════════════════════════════════════
grupo('8 · Estados y reconciliación');
// ════════════════════════════════════════════════════════════════════

eq('sin publicar es borrador', S.syncStateOf({ published: false }), 'draft');
eq('publicada y con destinos vivos', S.syncStateOf(CENTRAL, { knownSiteIds: ['A', 'B', 'C'] }), 'published');
eq('⚠️ un destino que ya no existe la DESINCRONIZA',
    S.syncStateOf(CENTRAL, { knownSiteIds: ['A', 'B'] }), 'orphaned');
eq('…y se nombra cuál', S.orphanTargets(CENTRAL, ['A', 'B']), ['C']);
// ⚠️ Sin saber qué sitios existen NO se inventa un diagnóstico.
eq('sin el dato de sitios no se afirma nada', S.syncStateOf(CENTRAL), 'published');

sembrar();
const resRec = fakeRes();
await C.reconcilePosts({ user: OPERADOR, query: {} }, resRec);
check('el diagnóstico corre', resRec.statusCode === 200, JSON.stringify(resRec.body).slice(0, 200));
check('⚠️ y NO encuentra fantasmas', resRec.body?.fantasmas === 0 && resRec.body?.ok === true);
eq('cuenta las centralizadas', resRec.body?.resumen?.centralizadas, 1);
check('reporta por sitio', (resRec.body?.porSitio || []).some(s => s.siteId === 'A' && s.replicadas === 1));
check('⚠️ el diagnóstico es del operador', (await (async () => {
    const r = fakeRes();
    await C.reconcilePosts({ user: ADMIN_A, query: {} }, r);
    return r.statusCode;
})()) === 403);

// Un destino huérfano SÍ se reporta.
stub.seed({ posts: [{ ...CENTRAL, targetClubIds: ['A', 'ZZZ'] }], clubs: CLUBS });
const resRec2 = fakeRes();
await C.reconcilePosts({ user: OPERADOR, query: {} }, resRec2);
check('⚠️ un destino que apunta a un sitio inexistente se reporta',
    (resRec2.body?.hallazgos?.destinosHuerfanos || []).some(h => h.orphanTargets.includes('ZZZ')));

// ⚠️ Es de SÓLO LECTURA: un diagnóstico que cambia cosas al mirarlas no sirve.
const antes = JSON.stringify(stub.tablas.Post);
const resRec3 = fakeRes();
await C.reconcilePosts({ user: OPERADOR, query: {} }, resRec3);
check('⚠️ el diagnóstico no escribe nada', JSON.stringify(stub.tablas.Post) === antes);

// ════════════════════════════════════════════════════════════════════
grupo('9 · ⚠️ NO SE CREÓ UNA SEGUNDA TABLA');
// ════════════════════════════════════════════════════════════════════

const schema = leer('server/prisma/schema.prisma');
check('⚠️ no hay MasterArticle ni SitePublication',
    !/model MasterArticle|model SitePublication/.test(schema));
check('la relación maestro↔réplica sigue siendo `targetClubIds`',
    /targetClubIds\s+String\[\]/.test(schema));
check('⚠️ no se creó un esquema en runtime para publicaciones',
    !/ensurePostReplicaSchema|SitePublication/.test(codigo('server/lib/postScope.js')));
check('el criterio es PURO: no importa la base', !/from '\.\/db\.js'/.test(leer('server/lib/postScope.js')));

// Lo que el pedido llama «estado por destino» no se inventó: con UNA fila un
// destino no puede fallar a medias, y fabricar una tabla para reportar un fallo
// imposible sería inventar estado.
check('⚠️ el archivo DICE por qué no hay estado por destino',
    /no puede fallar a medias/.test(leer('server/lib/postScope.js')));

// ════════════════════════════════════════════════════════════════════
grupo('10 · El doble no implementa las reglas que la prueba comprueba');
// ════════════════════════════════════════════════════════════════════

const doble = leer('scripts/fixtures/db-posts-stub.mjs');
// ⚠️ Es la lección de v4.896: un doble que reescribe la condición que la prueba
// dice comprobar la vuelve vacua. Acá el filtrado se decide LEYENDO el SQL.
// Se mira el CÓDIGO, no el archivo: el comentario que explica la decisión
// tiene que poder nombrar lo que NO hace (la lección de v4.840).
check('⚠️ el doble filtra interpretando el SQL, no reimplantando el criterio',
    /miraDestinos\(q\)/.test(codigo('scripts/fixtures/db-posts-stub.mjs'))
    && !/isVisibleTo|originOf/.test(codigo('scripts/fixtures/db-posts-stub.mjs')));
check('…y guarda las consultas para poder mirarlas', /consultas\.push/.test(doble));
check('la consulta del panel de A llevó el parámetro del sitio',
    stub.consultas.some(c => /targetClubIds/.test(c.sql)));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
