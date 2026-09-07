// ════════════════════════════════════════════════════════════════════════════
// La bandeja de solicitudes de contenido — v4.999
//
// Qué protege, en orden de lo que costaría equivocarse:
//
//   1. QUE UN SITIO NO VEA LAS SOLICITUDES DE OTRO. Es lo único de este módulo
//      que no admite un error: el material trae nombre, correo y teléfono de
//      personas reales. Se ejercita el CAMINO —el controlador de verdad, con
//      la base sustituida en memoria— y no sólo el criterio: `pickDistrictSite`
//      era correcto y el defecto vivía en el camino (v4.744).
//
//   2. QUE NO SE PUEDA SALTAR CAMBIANDO LA URL. `?campana=<ajena>` responde
//      404, no una lista vacía y no las filas de la otra organización.
//
//   3. QUE EL DOBLE DE LA BASE NO VUELVA VACUA LA COMPROBACIÓN. Filtra leyendo
//      el SQL: quitar la cláusula del alcance del `WHERE` real tiene que hacer
//      fallar estas pruebas (v4.896).
//
//   4. QUE «15 SIN REVISAR» SEA EXACTAMENTE LO QUE HAY. El contador sale de
//      los estados guardados, no de la página que se está viendo.
//
//   5. QUE LA FICHA SIGA SIENDO UNA SOLA. Dos copias se separan en silencio.
//
// Sin base, credenciales ni red.
// ════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-inbox-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js` y no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como `'./db.js'` y con el sufijo largo no
// casarían — no fallaría ruidosamente, se conectaría a un Postgres que no está.
register(
    `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        return n(s,c);
     }`,
    HERE
);

const I = await import('../server/lib/submissionInbox.js');
const SPEC = await import('../server/lib/contentSubmissionSpec.js');
const CTRL = await import('../server/controllers/contentSubmissionController.js');
const stub = await import(DB);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n── ${t} ──`);
const leer = f => readFileSync(f, 'utf8');

// ════════════════════════════════════════════════════════════════════
grupo('1 · El criterio: qué cuenta como «sin revisar»');
// ════════════════════════════════════════════════════════════════════

check('«recibido» está sin revisar', I.isPending('recibido'));
check('…y «requiere_info» también: la pelota está de nuestro lado', I.isPending('requiere_info'));
check('«aprobado» NO está sin revisar', !I.isPending('aprobado'));
check('«publicado» está cerrado', I.isClosed('publicado'));
check('⚠️ los pendientes son una lista DECLARADA, no «el primer estado»',
    /export const PENDING_STATES = \['recibido', 'requiere_info'\]/.test(leer('server/lib/submissionInbox.js')));

// `abiertas` son las que NO están cerradas —o sea, todo lo que todavía puede
// moverse—, así que INCLUYE a las pendientes: 15 recibidas + 2 aprobadas. Lo
// cerrado (publicado, descartado, archivado) queda fuera.
eq('el resumen cuenta total, pendientes y abiertas',
    (() => { const r = I.summarizeInbox({ recibido: 15, aprobado: 2, publicado: 1 });
        return [r.total, r.pendientes, r.abiertas]; })(), [18, 15, 17]);
eq('un estado en cero no ensucia el resumen',
    Object.keys(I.summarizeInbox({ recibido: 3, aprobado: 0 }).porEstado), ['recibido']);
check('⚠️ un estado que la base tenga y el catálogo no se CUENTA igual y se NOMBRA',
    (() => { const r = I.summarizeInbox({ recibido: 2, inventado: 5 });
        return r.total === 7 && r.desconocidos.includes('inventado'); })());

check('las pestañas van en el orden del catálogo',
    (() => { const t = I.stateTabs({ recibido: 1 });
        return t[0].id === 'recibido' && t.every((x, i, a) => i === 0 || a[i - 1].order <= x.order); })());

// ════════════════════════════════════════════════════════════════════
grupo('2 · Los filtros: catálogo CERRADO y lo descartado se dice');
// ════════════════════════════════════════════════════════════════════

check('un estado inventado se DESCARTA y se reporta',
    (() => { const q = I.shapeInboxQuery({ status: 'inventado' });
        return q.status === '' && q.descartados.some(d => d.campo === 'status'); })());
check('un tipo de contenido inventado, igual',
    (() => { const q = I.shapeInboxQuery({ kind: 'audio' });
        return q.kind === '' && q.descartados.some(d => d.campo === 'kind'); })());
check('un estado real pasa', I.shapeInboxQuery({ status: 'aprobado' }).status === 'aprobado');
check('una fecha ilegible se descarta con su motivo',
    (() => { const q = I.shapeInboxQuery({ from: 'ayer' });
        return q.from === '' && q.descartados.some(d => d.campo === 'from'); })());
check('un rango invertido se ENDEREZA, no se rechaza',
    (() => { const q = I.shapeInboxQuery({ from: '2026-03-01', to: '2026-01-01' });
        return q.from === '2026-01-01' && q.to === '2026-03-01'; })());
check('el tamaño de página tiene tope',
    I.shapeInboxQuery({ perPage: 99999 }).perPage === I.INBOX_MAX_PAGE_SIZE);
check('la página nunca es menor que 1', I.shapeInboxQuery({ page: -3 }).page === 1);
check('sin filtros, `hasFilters` es falso', !I.hasFilters(I.shapeInboxQuery({})));
check('con búsqueda, verdadero', I.hasFilters(I.shapeInboxQuery({ q: 'ana' })));

// ════════════════════════════════════════════════════════════════════
grupo('3 · ⚠️ EL ALCANCE (criterio puro)');
// ════════════════════════════════════════════════════════════════════

check('el operador alcanza cualquier solicitud',
    I.reachesSubmission({ isOperator: true, campaignIds: [], submission: { campaignId: 'X' } }));
check('un sitio alcanza la de una campaña suya',
    I.reachesSubmission({ isOperator: false, campaignIds: ['A'], submission: { campaignId: 'A' } }));
check('⚠️ …y NO la de una campaña que no lo alcanza',
    !I.reachesSubmission({ isOperator: false, campaignIds: ['A'], submission: { campaignId: 'B' } }));
check('sin solicitud no alcanza nada', !I.reachesSubmission({ isOperator: true }));

eq('el operador sin filtro consulta TODAS (`null`)',
    I.resolveInboxCampaigns({ isOperator: true, campaignIds: [], wanted: '' }).ids, null);
eq('un sitio sin filtro consulta SU lista',
    I.resolveInboxCampaigns({ isOperator: false, campaignIds: ['A', 'B'], wanted: '' }).ids, ['A', 'B']);
eq('⚠️ un sitio SIN campañas consulta [] — que NO es «todas»',
    I.resolveInboxCampaigns({ isOperator: false, campaignIds: [], wanted: '' }).ids, []);
check('⚠️ pedir una campaña AJENA se rechaza ANTES de consultar',
    (() => { const r = I.resolveInboxCampaigns({ isOperator: false, campaignIds: ['A'], wanted: 'B' });
        return !r.ok && r.reason === 'fuera_de_alcance'; })());
eq('pedir una campaña propia acota a ella',
    I.resolveInboxCampaigns({ isOperator: false, campaignIds: ['A', 'B'], wanted: 'A' }).ids, ['A']);

// ════════════════════════════════════════════════════════════════════
grupo('4 · ⚠️ EL CAMINO: un tenant NO ve lo de otro');
// ════════════════════════════════════════════════════════════════════

const res = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
};
const correr = async (handler, req) => { const r = res(); await handler(req, r); return r; };

// Dos organizaciones y una campaña de la plataforma que alcanza a la primera.
const sembrar = () => {
    stub.reset();
    stub.datos.clubs.push({ id: 'club-4281', name: 'Distrito 4281' }, { id: 'club-otro', name: 'Otro Distrito' });
    stub.datos.campaigns.push(
        { id: 'camp-plataforma', name: 'Emergencia Terremoto Colombia 2026', slug: 'emergencia', ownerClubId: null, status: 'active', targeting: { mode: 'all' }, content: {}, stats: [] },
        { id: 'camp-otro', name: 'Campaña de otro sitio', slug: 'otra', ownerClubId: 'club-otro', status: 'active', targeting: { mode: 'clubs', clubIds: ['club-otro'] }, content: {}, stats: [] },
    );
    for (let i = 0; i < 15; i++) {
        stub.datos.submissions.push({
            id: `s-plat-${i}`, campaignId: 'camp-plataforma', status: 'recibido',
            senderName: `Rotario ${i}`, senderEmail: `r${i}@club.org`, club: 'Club Rotario Cali',
            district: '4281', title: `Entrega ${i}`, createdAt: `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
            originClubId: i < 3 ? 'club-4281' : null, assignee: null,
        });
    }
    stub.datos.submissions.push({
        id: 's-ajena-1', campaignId: 'camp-otro', status: 'recibido',
        senderName: 'Persona de otra organización', senderEmail: 'privado@otro.org',
        club: 'Club del otro distrito', district: '4271', title: 'Material ajeno',
        createdAt: '2026-08-20T10:00:00Z', originClubId: 'club-otro', assignee: null,
    });
};

const OPERADOR = { user: { role: 'administrator', id: 'u-op', name: 'Operador' } };
const SITIO_4281 = { user: { role: 'district_admin', clubId: 'club-4281', id: 'u-4281', name: 'Admin 4281' } };

sembrar();
const rOp = await correr(CTRL.listSubmissionsInbox, { ...OPERADOR, query: {} });
check('el operador ve TODAS las solicitudes de todas las campañas',
    rOp.body?.total === 16, `total=${rOp.body?.total}`);
check('…y su alcance se declara como «platform»', rOp.body?.scope === 'platform');

sembrar();
const r4281 = await correr(CTRL.listSubmissionsInbox, { ...SITIO_4281, query: {} });
check('⚠️ el sitio ve SÓLO las de la campaña que lo alcanza',
    r4281.body?.total === 15, `total=${r4281.body?.total}`);
check('⚠️ …y NINGUNA fila es de la campaña ajena',
    (r4281.body?.submissions || []).every(s => s.campaignId !== 'camp-otro'));
check('⚠️ …ni asoma el correo de la otra organización',
    !JSON.stringify(r4281.body || {}).includes('privado@otro.org'));
check('el alcance del sitio se declara', r4281.body?.scope === 'site' && r4281.body?.siteScoped === true);

sembrar();
const rUrl = await correr(CTRL.listSubmissionsInbox, { ...SITIO_4281, query: { campaign: 'camp-otro' } });
check('⚠️ CAMBIAR LA URL A UNA CAMPAÑA AJENA RESPONDE 404',
    rUrl.code === 404, `code=${rUrl.code}`);
check('⚠️ …y no devuelve ni una fila', !rUrl.body?.submissions);

sembrar();
const rSin = await correr(CTRL.listSubmissionsInbox, { user: { role: 'club_admin', clubId: null }, query: {} });
check('⚠️ una sesión sin sitio no ve NADA (alcance vacío ≠ todas)',
    rSin.body?.total === 0, `total=${rSin.body?.total}`);

// La cláusula del aislamiento tiene que estar de verdad en el SQL.
sembrar();
await correr(CTRL.listSubmissionsInbox, { ...SITIO_4281, query: {} });
check('⚠️ el aislamiento va en el WHERE del SQL, no en JavaScript',
    stub.datos.consultas.some(c => /s\."campaignId" = ANY\(\$\d+::text\[\]\)/.test(c.sql)));
sembrar();
await correr(CTRL.listSubmissionsInbox, { ...OPERADOR, query: {} });
check('…y el operador consulta SIN esa cláusula (su alcance es todo)',
    !stub.datos.consultas.some(c => /s\."campaignId" = ANY/.test(c.sql)));

// ════════════════════════════════════════════════════════════════════
grupo('5 · Filtros y contadores sobre el camino real');
// ════════════════════════════════════════════════════════════════════

sembrar();
const rEstado = await correr(CTRL.listSubmissionsInbox, { ...SITIO_4281, query: { status: 'recibido' } });
check('filtrar por estado acota el listado', rEstado.body?.total === 15);
check('⚠️ …y las pestañas SIGUEN contando todos los estados (el filtro de estado no se les aplica)',
    (rEstado.body?.tabs || []).find(t => t.id === 'recibido')?.n === 15);

sembrar();
const rBusca = await correr(CTRL.listSubmissionsInbox, { ...SITIO_4281, query: { q: 'Rotario 7' } });
check('la búsqueda encuentra por nombre', rBusca.body?.total === 1);
check('…y sigue acotada al alcance',
    (rBusca.body?.submissions || []).every(s => s.campaignId === 'camp-plataforma'));

sembrar();
const rSitio = await correr(CTRL.listSubmissionsInbox, { ...SITIO_4281, query: { site: 'club-4281' } });
check('filtrar por sitio de origen usa `originClubId`', rSitio.body?.total === 3);

sembrar();
const rCuenta = await correr(CTRL.getInboxCounts, { ...SITIO_4281, query: {} });
check('⚠️ «sin revisar» es EXACTAMENTE lo que hay en la base',
    rCuenta.body?.pendientes === 15 && rCuenta.body?.total === 15);
check('el contador del sitio NO cuenta las de la campaña ajena',
    rCuenta.body?.total !== 16);

sembrar();
const rPag = await correr(CTRL.listSubmissionsInbox, { ...SITIO_4281, query: { perPage: 5, page: 2 } });
check('la paginación devuelve la página pedida y el TOTAL real',
    rPag.body?.submissions?.length === 5 && rPag.body?.total === 15);

// ════════════════════════════════════════════════════════════════════
grupo('6 · La puerta por campaña (`requireCampaignAccess`)');
// ════════════════════════════════════════════════════════════════════

const RUTAS = leer('server/routes/contribution-campaigns.js');
const CTRLTXT = leer('server/controllers/contentSubmissionController.js');

const rutasBandeja = RUTAS.split('\n').filter(l => /^router\.(get|post|delete)\('\/:id\/submissions/.test(l.trim()));
check('⚠️ las 8 rutas de la bandeja por campaña pasan por requireCampaignAccess',
    rutasBandeja.length === 8 && rutasBandeja.every(l => /requireCampaignAccess/.test(l)),
    `${rutasBandeja.length} rutas`);
check('⚠️ ninguna sigue siendo superAdminOnly',
    !rutasBandeja.some(l => /superAdminOnly/.test(l)));
check('⚠️ una campaña fuera del alcance responde 404, no 403',
    /requireCampaignAccess[\s\S]{0,400}status\(404\)/.test(CTRLTXT)
    && !/requireCampaignAccess[\s\S]{0,400}status\(403\)/.test(CTRLTXT));
check('la puerta reutiliza `scopedCampaign`, no un segundo criterio',
    /const scope = await scopedCampaign\(req, req\.params\.id\)/.test(CTRLTXT));
check('⚠️ el alcance transversal reutiliza `scopeForSite` (el mismo que edita y publica)',
    /const \{ mine, reaching \} = await scopeForSite\(clubId\)/.test(leer('server/controllers/contributionCampaignController.js')));
check('⚠️ y `campaignIdsInScope` distingue «todas» (null) de «ninguna» ([])',
    /if \(isPlatformOperator\(req\)\) return null;[\s\S]{0,200}if \(!clubId\) return \[\];/.test(leer('server/controllers/contributionCampaignController.js')));

check('⚠️ la bandeja transversal es de sólo LECTURA: las acciones siguen por la ruta de campaña',
    !/router\.post\('\/submissions\/inbox\/[^']*\/(status|approve|usage)'/.test(RUTAS));
check('el sitio de quien pregunta sale del TOKEN, nunca del cuerpo',
    !/campaignIdsInScope\(req\.body/.test(CTRLTXT));

// ════════════════════════════════════════════════════════════════════
grupo('7 · ⚠️ La ficha es UNA sola');
// ════════════════════════════════════════════════════════════════════

check('existe el componente compartido', existsSync('src/components/admin/contribution/SubmissionDetail.tsx'));
const PANEL = leer('src/components/admin/contribution/SubmissionsPanel.tsx');
const INBOX = leer('src/pages/admin/SubmissionsInbox.tsx');
check('⚠️ la sección de la campaña la MONTA, no la reimplementa',
    /import SubmissionDetail from '\.\/SubmissionDetail'/.test(PANEL)
    && /<SubmissionDetail/.test(PANEL));
check('⚠️ y la bandeja transversal monta LA MISMA',
    /import SubmissionDetail from '\.\.\/\.\.\/components\/admin\/contribution\/SubmissionDetail'/.test(INBOX)
    && /<SubmissionDetail/.test(INBOX));
check('⚠️ el panel ya no tiene su propia ficha (sin `nextStates` ni acciones duplicadas)',
    !/nextStates\.map/.test(PANEL) && !/aprobarYEnviar/.test(PANEL));
const DETALLE = leer('src/components/admin/contribution/SubmissionDetail.tsx');
check('las acciones de la ficha entran por la ruta de la CAMPAÑA',
    /submissions\/\$\{ficha\.submission\.id\}\/status/.test(DETALLE)
    && /contribution-campaigns\/\$\{campaignId\}/.test(DETALLE));
check('los estados a los que se puede ir salen del SERVIDOR, no de una lista en la pantalla',
    /ficha\.nextStates\.map/.test(DETALLE) && !/const FLOW/.test(DETALLE));

// ════════════════════════════════════════════════════════════════════
grupo('8 · La navegación: la tarjeta lleva a alguna parte');
// ════════════════════════════════════════════════════════════════════

const TABLERO = leer('src/components/admin/contribution/CampaignBoard.tsx');
const APP = leer('src/App.tsx');
check('⚠️ la ruta de la bandeja existe y monta la pantalla',
    /path="\/admin\/campanas-contribucion\/solicitudes"[\s\S]{0,160}<SubmissionsInbox \/>/.test(APP));
check('la pantalla se carga de forma perezosa con `lazyWithRetry` (v4.791)',
    /const SubmissionsInbox = lazyWithRetry\(/.test(APP));
check('⚠️ la tarjeta ENTERA es el enlace, no un enlace dentro',
    /to=\{board\.medido\.solicitudes \? inboxLink\(\) : undefined\}/.test(TABLERO)
    && /<Link to=\{to\}/.test(TABLERO));
check('…y sólo enlaza si se pudo medir: un «—» no lleva a una lista vacía',
    /board\.medido\.solicitudes \? inboxLink\(\) : undefined/.test(TABLERO));
check('⚠️ «N solicitud(es)» de una campaña abre la bandeja FILTRADA por ella',
    /inboxLink\(\{ campaign: fila\.id \}\)/.test(TABLERO));
check('…y no dispara además el botón de abrir la campaña',
    /inboxLink\(\{ campaign: fila\.id \}\)[\s\S]{0,200}stopPropagation/.test(TABLERO));
check('⚠️ la forma de la URL vive en UN solo sitio (`inboxLink`), no escrita a mano',
    !/campanas-contribucion\/solicitudes/.test(TABLERO)
    && !/campanas-contribucion\/solicitudes\?/.test(leer('src/pages/admin/ContributionCampaigns.tsx')));

// ⚠️ LA RUTA HIJA HEREDA EL PERMISO DE SU MÓDULO, no hace falta registrarla
// aparte: `matches` en `rbacSpec` casa por prefijo de segmento. Se comprueba
// porque si algún día deja de casar, la bandeja desaparecería de la barra
// lateral de quien tiene un rol acotado sin que nada avisara (v4.939).
const RBAC = await import('../server/lib/rbacSpec.js');
check('⚠️ la ruta de la bandeja hereda el módulo «contribution_campaigns»',
    RBAC.modulesForPath('/admin/campanas-contribucion/solicitudes')
        .some(m => m.key === 'contribution_campaigns'));
check('…también con sus filtros en la dirección',
    RBAC.modulesForPath('/admin/campanas-contribucion/solicitudes?campana=abc')
        .some(m => m.key === 'contribution_campaigns'));

const PANTALLA = leer('src/pages/admin/ContributionCampaigns.tsx');
const iOp = PANTALLA.indexOf('{esOperador && <>');
const iCierre = PANTALLA.indexOf('</>}', iOp);
const iCard = PANTALLA.indexOf('<Card id="solicitudes"');
check('⚠️ la sección de solicitudes SALIÓ del bloque del operador',
    iCard > iCierre, `card en ${iCard}, cierre en ${iCierre}`);

// ════════════════════════════════════════════════════════════════════
grupo('9 · El origen del sitio: aditivo y sin adivinar');
// ════════════════════════════════════════════════════════════════════

const ENSURE = leer('server/lib/ensureContentSubmissionSchema.js');
check('`originClubId` se agrega con ADD COLUMN IF NOT EXISTS',
    /'"originClubId" TEXT'/.test(ENSURE));
check('⚠️ …y está ENUMERADA en el atajo del ensure (la trampa de v4.908)',
    /column_name IN \([^)]*'originClubId'[^)]*\)/.test(ENSURE)
    && /rows\[0\]\?\.columnas === 7/.test(ENSURE));
check('el origen se resuelve con `resolveSiteId` (el camino de by-domain, no el atajo del SEO)',
    /import \{ resolveSiteId \} from '\.\.\/lib\/linkRedirectStore\.js'/.test(CTRLTXT));
check('⚠️ un origen que no se pudo resolver NO tumba el envío',
    /try \{ origin\.clubId = await resolveSiteId\(host\); \}[\s\S]{0,120}catch/.test(CTRLTXT));
check('⚠️ y no se rellena hacia atrás: NULL para lo anterior a v4.999',
    /origin\?\.clubId \|\| null/.test(leer('server/lib/contentSubmissionStore.js')));

// ════════════════════════════════════════════════════════════════════
grupo('10 · El estado «archivado»');
// ════════════════════════════════════════════════════════════════════

check('existe y es distinto de «descartado»',
    SPEC.SUBMISSION_STATES.archivado && SPEC.SUBMISSION_STATES.descartado);
check('⚠️ archivar NO exige motivo; descartar SÍ',
    !SPEC.needsReason('archivado') && SPEC.needsReason('descartado'));
check('se llega a archivado desde publicado y desde descartado',
    SPEC.canTransitionSubmission('publicado', 'archivado')
    && SPEC.canTransitionSubmission('descartado', 'archivado'));
check('⚠️ archivar no es irreversible: se puede recuperar',
    SPEC.canTransitionSubmission('archivado', 'en_revision'));
check('archivado cuenta como cerrado, no como pendiente',
    I.isClosed('archivado') && !I.isPending('archivado'));

// ════════════════════════════════════════════════════════════════════
grupo('11 · El espejo del navegador da lo MISMO');
// ════════════════════════════════════════════════════════════════════

let esbuild = null;
try { esbuild = (await import('esbuild')).default ?? await import('esbuild'); } catch { /* opcional */ }
if (!esbuild) {
    console.log('  … se salta: falta esbuild (npm i --no-save esbuild)');
} else {
    const out = esbuild.buildSync({
        entryPoints: ['src/lib/submissionInbox.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
    });
    const mod = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
    eq('PENDING_STATES coincide', mod.PENDING_STATES, I.PENDING_STATES);
    eq('CLOSED_STATES coincide', mod.CLOSED_STATES, I.CLOSED_STATES);
    eq('CONTENT_KIND_IDS coincide', mod.CONTENT_KIND_IDS, I.CONTENT_KIND_IDS);
    check('UNASSIGNED coincide', mod.UNASSIGNED === I.UNASSIGNED);
    // Comparado por SALIDAS, no por claves: es lo que sostiene que las dos
    // mitades digan lo mismo del mismo estado.
    check('isPending da lo mismo en los dos',
        [...SPEC.SUBMISSION_STATE_IDS, 'inventado'].every(id => mod.isPending(id) === I.isPending(id)));
    check('isClosed da lo mismo en los dos',
        [...SPEC.SUBMISSION_STATE_IDS, 'inventado'].every(id => mod.isClosed(id) === I.isClosed(id)));
    check('describeInboxView da lo mismo en los dos',
        [{ mostradas: 5, total: 15, pendientes: 15, filtrada: false },
         { mostradas: 0, total: 0, pendientes: 0, filtrada: true },
         { mostradas: 1, total: 1, pendientes: 0, filtrada: true }]
            .every(c => mod.describeInboxView(c) === I.describeInboxView(c)));
    check('⚠️ el espejo NO trae el alcance: quien decide quién ve qué es el servidor',
        mod.reachesSubmission === undefined && mod.resolveInboxCampaigns === undefined);
    check('la ida y vuelta de la URL conserva el filtro',
        (() => { const q = { ...mod.EMPTY_QUERY, campaign: 'abc', status: 'recibido', q: 'ana', page: 3 };
            const v = mod.fromSearchParams(mod.toSearchParams(q));
            return v.campaign === 'abc' && v.status === 'recibido' && v.q === 'ana' && v.page === 3; })());
    check('⚠️ el enlace con campaña lleva el parámetro que la pantalla LEE',
        mod.fromSearchParams(new URLSearchParams(mod.inboxLink({ campaign: 'X' }).split('?')[1])).campaign === 'X');
}

// ════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(60));
if (malos.length) {
    console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    for (const m of malos) console.log('   ·', m);
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
