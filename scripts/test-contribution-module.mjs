// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución — UN SOLO MÓDULO (v4.986)
//
// Qué protege, en orden de lo que costaría equivocarse:
//
//   1. QUE NO VUELVAN A COEXISTIR DOS CONCEPTOS. «Maneras de Contribuir» era
//      otro nombre y otra pantalla para lo mismo —editaba justamente la
//      información local de una campaña— y convivía en el menú con «Campañas
//      de Contribución» sin que nadie supiera cuál abrir. Reintroducir la
//      entrada, la ruta o el componente hace fallar esto.
//
//   2. QUE LA VIEJA DIRECCIÓN NO SE ROMPA. Está en marcadores y en enlaces
//      internos: redirige, no da 404.
//
//   3. QUE EL SITIO PUEDA ADMINISTRAR VARIAS CAMPAÑAS. Era la razón de fondo
//      por la que no podía «administrar campañas»: la vía del sitio devolvía
//      UNA y la pantalla no tenía forma de nombrar más.
//
//   4. QUE EL USUARIO INSTITUCIONAL ENTRE — y que entrar a las campañas no le
//      abra además los importes de la página de aportes.
//
//   5. QUE NO SE PIERDA LA CONFIGURACIÓN LOCAL: el override y los centros
//      siguen guardándose por campaña, con la misma frontera de siempre.
//
// Sin base, credenciales ni red.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'fs';
import S from '../server/lib/rbacSpec.js';

let ok = 0; const fallos = [];
const check = (t, c) => { if (c) { ok++; console.log('  ✓', t); } else { fallos.push(t); console.log('  ✗', t); } };
const grupo = (t) => console.log(`\n── ${t} ──`);
const leer = (p) => readFileSync(p, 'utf8');

const LAYOUT = leer('src/components/admin/AdminLayout.tsx');
const APP = leer('src/App.tsx');
const RUTAS = leer('server/routes/contribution-campaigns.js');
const CTRL = leer('server/controllers/contributionCampaignController.js');
const SITIO = leer('src/pages/admin/SiteContributionCampaigns.tsx');
const HOME = leer('src/pages/admin/ContributionCampaignsHome.tsx');

// ════════════════════════════════════════════════════════════════════
grupo('1 · ⚠️ «Maneras de Contribuir» dejó de ser un módulo');
// ════════════════════════════════════════════════════════════════════

check('el menú no lo ofrece en NINGÚN rol', !/label: 'Maneras de Contribuir'/.test(LAYOUT));
check('⚠️ y no hay dos entradas de menú para la misma dirección',
    (LAYOUT.match(/path: '\/admin\/campanas-contribucion'/g) || []).length === 2
    && /if \(!isSuperAdmin\) \{[\s\S]{0,400}path: '\/admin\/campanas-contribucion', category: 'Contenido'/.test(LAYOUT));
check('la pantalla vieja ya no existe con su nombre viejo',
    !/ManerasContribuirEditor/.test(APP) && !/pages\/admin\/ManerasContribuirEditor/.test(APP));
check('⚠️ ninguna otra ruta del panel monta una segunda pantalla de aportes',
    (APP.match(/path="\/admin\/campanas-contribucion"/g) || []).length === 1);

// ════════════════════════════════════════════════════════════════════
grupo('2 · ⚠️ La dirección vieja REDIRIGE; no da 404');
// ════════════════════════════════════════════════════════════════════

check('redirige a la nueva, con replace',
    /path="\/admin\/maneras-de-contribuir"\s*\n\s*element=\{<Navigate to="\/admin\/campanas-contribucion" replace \/>\}/.test(APP));
check('⚠️ y sigue DECLARADA en el registro: una redirección que su dueño no puede abrir no redirige a nadie',
    S.moduleOf('contribution_campaigns').routes.includes('/admin/maneras-de-contribuir'));
check('la página PÚBLICA de aportes no se toca — está en producción y enlazada',
    APP.includes('path="/maneras-de-contribuir"'));

// ════════════════════════════════════════════════════════════════════
grupo('3 · UNA dirección, dos vistas por rol');
// ════════════════════════════════════════════════════════════════════

check('el envoltorio decide por CONTEXTO DE PLATAFORMA, no por «hay club»',
    /isPlatformSuperAdmin\(user\) && isOnPlatformDomain\(\)/.test(HOME));
check('⚠️ y no escribe un segundo criterio: lo importa de platformAdmin',
    /from '\.\.\/\.\.\/lib\/platformAdmin'/.test(HOME));
check('las dos vistas se cargan PEREZOSAS y por separado (peso del panel, v4.880)',
    /lazyWithRetry\(\(\) => import\('\.\/ContributionCampaigns'\)/.test(HOME)
    && /lazyWithRetry\(\(\) => import\('\.\/SiteContributionCampaigns'\)/.test(HOME));

// ════════════════════════════════════════════════════════════════════
grupo('4 · ⚠️ El sitio administra VARIAS campañas');
// ════════════════════════════════════════════════════════════════════

check('el servidor lista las que alcanzan al sitio, no una',
    /export const campaignsForSiteAdmin/.test(CTRL) && /export const listSiteCampaigns/.test(CTRL));
check('⚠️ cuál se MUESTRA sale del mismo pickCampaignForSite de la página pública',
    /showingId = pickCampaignForSite\(all, site, now\)\?\.id \|\| null/.test(CTRL));
check('el orden es ESTABLE y declarado (prioridad → publicación → id)',
    /ordenDeCampanas = \(a, b\) =>[\s\S]{0,220}localeCompare/.test(CTRL));
check('⚠️ una campaña fuera del alcance del sitio NO EXISTE para él',
    /const siteCampaignById = async \(clubId, id\) => \{[\s\S]{0,300}campaigns\.find\(c => c\.id === String\(id\)\) \|\| null/.test(CTRL));
check('la ruta del listado va ANTES de /:id, o «site» se leería como un id',
    RUTAS.indexOf("'/site/campaigns'") < RUTAS.indexOf("'/:id/preview'"));
check('la pantalla lo consume y guarda POR CAMPAÑA',
    /site\/campaigns/.test(SITIO)
    && /JSON\.stringify\(\{ campaignId, content: override \}\)/.test(SITIO)
    && /JSON\.stringify\(\{ campaignId, centers: ownCenters \}\)/.test(SITIO));
check('⚠️ cambiar de campaña no se lleva el borrador a la campaña equivocada',
    /const elegirCampana = \(id: string\) => \{[\s\S]{0,400}overrideDirty \|\| ownCentersDirty[\s\S]{0,200}window\.confirm/.test(SITIO));
check('el selector sólo aparece con MÁS de una (v4.650)',
    /campaigns\.length > 1 && \(/.test(SITIO));
check('…y se dice CUÁL está al aire, que es por la que van a preguntar',
    /siteCampaign\.showing && \(/.test(SITIO) && /Se está mostrando/.test(SITIO));

// ════════════════════════════════════════════════════════════════════
grupo('5 · ⚠️ Compatibilidad: la vía de v4.807 contesta lo mismo');
// ════════════════════════════════════════════════════════════════════

check('/site/current sigue existiendo y sin campaignId devuelve la de siempre',
    /router\.get\('\/site\/current'/.test(RUTAS)
    && /siteCampaignById\(clubId, req\.query\?\.campaignId \|\| req\.params\?\.campaignId\)/.test(CTRL));
check('…y las dos escrituras aceptan campaignId opcional',
    (CTRL.match(/siteCampaignById\(clubId, req\.body\?\.campaignId/g) || []).length === 2);
check('⚠️ la frontera de lo local NO se aflojó: sigue siendo sanitizeOverride',
    /const local = await localDataOf/.test(CTRL) && /sanitizeOverride\(ov\[0\]\.content\)/.test(CTRL));
// El clubId de la vía del SITIO sale del token. (El endpoint público de
// métricas sí lo recibe en el cuerpo: no tiene sesión y no escribe nada del
// sitio — por eso se mira cada función, no el archivo entero.)
const funcionesDelSitio = ['listSiteCampaigns', 'getSiteCampaign', 'saveSiteOverride', 'saveSiteCenters']
    .map(n => { const i = CTRL.indexOf(`export const ${n} = async`); return CTRL.slice(i, CTRL.indexOf('\n};', i)); });
check('el clubId de la vía del sitio sale del token, nunca del cuerpo',
    funcionesDelSitio.every(f => f.includes('const clubId = req.user.clubId') && !/req\.body\?\.clubId/.test(f)));

// ════════════════════════════════════════════════════════════════════
grupo('6 · ⚠️ El usuario institucional entra — y sólo a esto');
// ════════════════════════════════════════════════════════════════════

const INSTI = { id: 'in', role: 'institutional_user', email: 'presidencia@club.org', clubId: 'A' };
const g = S.resolveGrant({ user: INSTI, siteId: 'A' });
check('ve «Campañas de Contribución»', S.canOpenPath(g, '/admin/campanas-contribucion'));
check('…y también la dirección vieja, que redirige ahí', S.canOpenPath(g, '/admin/maneras-de-contribuir'));
check('⚠️ y NO los bloques de pago: son otro módulo a propósito',
    !S.canOpenPath(g, '/admin/bloques-pago'));
check('puede editar lo suyo, no administrar el módulo',
    S.hasPermission(g, 'contribution_campaigns.edit') && !S.hasPermission(g, 'contribution_campaigns.manage'));
check('⚠️ y no alcanza el módulo central: es de plataforma',
    !S.hasPermission(g, 'platform_global.view'));

const ADMIN = { id: 'ad', role: 'club_admin', email: 'presidente@club.org', clubId: 'A' };
const gA = S.resolveGrant({ user: ADMIN, siteId: 'A' });
check('⚠️ un administrador de sitio no perdió nada al separar los dos módulos',
    ['contribution_campaigns.view', 'contribution_campaigns.edit', 'contribution_campaigns.manage',
        'contributions.view', 'contributions.edit', 'contributions.manage'].every(p => S.hasPermission(gA, p)));

// ════════════════════════════════════════════════════════════════════
grupo('7 · La página de aportes de siempre no se pierde');
// ════════════════════════════════════════════════════════════════════

check('los textos de la página sin campaña se siguen editando acá',
    /page: 'contribucion', section: 'header'/.test(SITIO)
    && /page: 'contribucion', section: 'card'/.test(SITIO)
    && /page: 'contribucion', section: 'style'/.test(SITIO));
check('⚠️ y se DICE cuándo se ven, o se leen como textos que no hacen nada',
    /La página de aportes cuando no hay campaña/.test(SITIO));
check('sin ninguna campaña la pantalla lo dice, en vez de quedar vacía',
    /campaigns\.length === 0 && \(/.test(SITIO));

console.log('\n' + '─'.repeat(60));
if (fallos.length) {
    console.log(`❌ ${fallos.length} fallo(s) de ${ok + fallos.length}:`);
    fallos.forEach(f => console.log('   ·', f));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
