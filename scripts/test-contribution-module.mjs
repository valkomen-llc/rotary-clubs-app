// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución — UNA SOLA HERRAMIENTA (v4.987)
//
// Qué protege, en orden de lo que costaría equivocarse:
//
//   1. QUE NO VUELVA A HABER UNA SEGUNDA PANTALLA. v4.986 le dio al sitio la
//      vieja «Maneras de Contribuir» rebautizada: una copia que se queda
//      atrás en cada mejora de la del operador. Ahora hay UNA, y lo que
//      cambia es el ALCANCE que resuelve el servidor.
//
//   2. QUE UN SITIO NO PUEDA REESCRIBIR NI REPUBLICAR LO AJENO. Una campaña
//      de la plataforma alcanza a muchos sitios: escribirla desde uno les
//      cambiaría la página a todos. Y su alcance se impone al crear Y al
//      guardar — esconder el selector no protege el endpoint.
//
//   3. QUE LA VIEJA DIRECCIÓN NO SE ROMPA. Está en marcadores y en enlaces.
//
//   4. QUE EL USUARIO INSTITUCIONAL ENTRE — y que entrar a las campañas no le
//      abra además los importes de la página de aportes.
//
//   5. QUE NO SE PIERDA NADA AL BORRAR LA PANTALLA VIEJA: la información
//      local por campaña y los textos de la página sin campaña siguen
//      teniendo dónde editarse.
//
// Sin base, credenciales ni red.
// ════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'fs';
import S from '../server/lib/rbacSpec.js';

let ok = 0; const fallos = [];
const check = (t, c) => { if (c) { ok++; console.log('  ✓', t); } else { fallos.push(t); console.log('  ✗', t); } };
const grupo = (t) => console.log(`\n── ${t} ──`);
const leer = (p) => readFileSync(p, 'utf8');

const LAYOUT = leer('src/components/admin/AdminLayout.tsx');
const APP = leer('src/App.tsx');
const RUTAS = leer('server/routes/contribution-campaigns.js');
const CTRL = leer('server/controllers/contributionCampaignController.js');
const ENSURE = leer('server/lib/ensureContributionSchema.js');
const PANTALLA = leer('src/pages/admin/ContributionCampaigns.tsx');
const LOCAL = leer('src/components/admin/contribution/SiteLocalPanel.tsx');
const TEXTOS = leer('src/components/admin/contribution/DonatePageTextsCard.tsx');

// ════════════════════════════════════════════════════════════════════
grupo('1 · ⚠️ UNA SOLA PANTALLA, no una por audiencia');
// ════════════════════════════════════════════════════════════════════

check('la pantalla del sitio de v4.986 se BORRÓ',
    !existsSync('src/pages/admin/SiteContributionCampaigns.tsx'));
check('…y el envoltorio que elegía entre dos, también',
    !existsSync('src/pages/admin/ContributionCampaignsHome.tsx'));
check('la pantalla anterior a v4.986 tampoco volvió',
    !existsSync('src/pages/admin/ManerasContribuirEditor.tsx'));
check('⚠️ la ruta monta la MISMA pantalla para todos',
    /path="\/admin\/campanas-contribucion"[\s\S]{0,140}<ContributionCampaigns \/>/.test(APP)
    && !/ContributionCampaignsHome|SiteContributionCampaigns/.test(APP));
check('⚠️ y hay UNA sola ruta del panel para este módulo',
    (APP.match(/path="\/admin\/campanas-contribucion"/g) || []).length === 1);
check('el menú no ofrece «Maneras de Contribuir» en NINGÚN rol',
    !/label: 'Maneras de Contribuir'/.test(LAYOUT));
check('⚠️ y no hay dos entradas de menú a la vez para la misma dirección',
    (LAYOUT.match(/path: '\/admin\/campanas-contribucion'/g) || []).length === 2
    && /if \(!isSuperAdmin\) \{[\s\S]{0,400}path: '\/admin\/campanas-contribucion', category: 'Contenido'/.test(LAYOUT));

// ════════════════════════════════════════════════════════════════════
grupo('2 · ⚠️ El ALCANCE lo resuelve el servidor, no la pantalla');
// ════════════════════════════════════════════════════════════════════

check('el criterio es el ROL, en el servidor',
    /const isPlatformOperator = \(req\) => String\(req\.user\?\.role \|\| ''\) === 'administrator'/.test(CTRL));
check('⚠️ el sitio de quien pregunta sale del TOKEN, nunca del cuerpo',
    /const askingClubId = \(req\) => req\.user\?\.clubId \|\| null/.test(CTRL)
    && !/ownerClubId = .*req\.body/.test(CTRL));
check('la pantalla NO decide el alcance: lo lee de la respuesta',
    /dc\?\.scope !== 'site'/.test(PANTALLA)
    && !/isPlatformSuperAdmin|isOnPlatformDomain/.test(PANTALLA));
check('⚠️ cuál se MUESTRA sale del mismo pickCampaignForSite de la página pública',
    /showingId = pickCampaignForSite\(all, site, now\)\?\.id \|\| null/.test(CTRL));
check('el listado del sitio trae las propias y las que le alcanzan',
    /const \{ mine, reaching, showingId \} = await scopeForSite\(clubId\)/.test(CTRL));
check('el orden es ESTABLE y declarado (prioridad → publicación → id)',
    /ordenDeCampanas = \(a, b\) =>[\s\S]{0,220}localeCompare/.test(CTRL));
check('un sitio no pide el catálogo de sitios ni los perfiles (403 garantizado)',
    /if \(operador\) \{[\s\S]{0,700}notification-profiles/.test(PANTALLA));

// ════════════════════════════════════════════════════════════════════
grupo('3 · ⚠️ Lo ajeno se mira; no se reescribe ni se republica');
// ════════════════════════════════════════════════════════════════════

check('`own` es la frontera y la decide el servidor',
    /const scopedCampaign = async \(req, id, \{ write = false \} = \{\} \)?/.test(CTRL.replace(/\s+/g, ' ')) === false
    ? /const scopedCampaign = async \(req, id, \{ write = false \} = \{\}\) => \{/.test(CTRL)
    : true);
check('⚠️ escribir exige PROPIEDAD y lo ajeno responde 404, no 403',
    /if \(write\) return null;/.test(CTRL)
    && (CTRL.match(/scopedCampaign\(req, req\.params\.id, \{ write: true \}\)/g) || []).length >= 6);
check('…y las cinco escrituras de campaña pasan por ahí',
    ['updateCampaign', 'transitionCampaign', 'deleteCampaign', 'saveCenters', 'decideReading']
        .every(n => {
            const i = CTRL.indexOf(`export const ${n} = async`);
            return CTRL.slice(i, i + 1600).includes('write: true');
        }));
check('⚠️ el ALCANCE de una campaña de un sitio se impone al CREAR',
    /const targeting = operador\s*\n\s*\? normalizeTargeting\(req\.body\?\.targeting\)\s*\n\s*: normalizeTargeting\(\{ mode: 'clubs', clubIds: \[ownerClubId\] \}\)/.test(CTRL));
check('⚠️ …y también al GUARDAR: sin eso, un PUT publicaría en los demás sitios',
    /const targeting = prev\.ownerClubId\s*\n\s*\? normalizeTargeting\(\{ mode: 'clubs', clubIds: \[prev\.ownerClubId\] \}\)/.test(CTRL));
check('la pantalla no ofrece el editor de alcance a un sitio',
    /\{esOperador && <>/.test(PANTALLA));
check('una campaña ajena se abre en su panel local, no en el editor',
    /if \(!own\) \{/.test(PANTALLA) && /<SiteLocalPanel campaignId=\{c\.id\} initial=\{local\} \/>/.test(PANTALLA));
check('…y no se le piden sus centros, lecturas ni métricas',
    /if \(!esPropia\) return;/.test(PANTALLA));

// ════════════════════════════════════════════════════════════════════
grupo('4 · ⚠️ El dueño es una columna, y su ALTER está enumerado');
// ════════════════════════════════════════════════════════════════════

check('la columna se agrega con ADD COLUMN IF NOT EXISTS',
    /ADD COLUMN IF NOT EXISTS "ownerClubId" TEXT/.test(ENSURE));
check('⚠️ y TODO ADD COLUMN está en el atajo del ensure (trampa de v4.908)',
    [...ENSURE.matchAll(/ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)]
        .map(m => m[1])
        .every(col => new RegExp(`column_name = '${col}'`).test(ENSURE)));
check('NULL es la campaña de la plataforma: las filas de siempre no cambian',
    /ADD COLUMN IF NOT EXISTS "ownerClubId" TEXT;/.test(ENSURE)
    && !/ADD COLUMN IF NOT EXISTS "ownerClubId"[^;]*NOT NULL/.test(ENSURE));
check('⚠️ y NO se declara en schema.prisma (regla de logo_intl, v4.699)',
    !/ownerClubId/.test(leer('server/prisma/schema.prisma')));

// ════════════════════════════════════════════════════════════════════
grupo('5 · ⚠️ La dirección vieja REDIRIGE; no da 404');
// ════════════════════════════════════════════════════════════════════

check('redirige a la nueva, con replace',
    /path="\/admin\/maneras-de-contribuir"\s*\n\s*element=\{<Navigate to="\/admin\/campanas-contribucion" replace \/>\}/.test(APP));
check('⚠️ y sigue DECLARADA en el registro: una redirección que su dueño no puede abrir no redirige a nadie',
    S.moduleOf('contribution_campaigns').routes.includes('/admin/maneras-de-contribuir'));
check('la página PÚBLICA de aportes no se toca — está en producción y enlazada',
    APP.includes('path="/maneras-de-contribuir"'));

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

// Las rutas de gestión dejaron de ser superAdminOnly, pero siguen exigiendo
// rol administrativo del sitio O el permiso (regla de v4.941).
check('⚠️ la gestión exige el rol de siempre O el permiso, por ACCIÓN',
    /const siteRead = requireRoleOrPermission\(SITE_ADMIN_ROLES, 'contribution_campaigns\.view'\)/.test(RUTAS)
    && /const siteWrite = requireRoleOrPermission\(SITE_ADMIN_ROLES, 'contribution_campaigns\.edit'\)/.test(RUTAS)
    && /router\.put\('\/:id', authMiddleware, siteWrite, updateCampaign\)/.test(RUTAS)
    && /router\.get\('\/:id', authMiddleware, siteRead, getCampaign\)/.test(RUTAS));
check('la bandeja de aportes de contenido sigue siendo del OPERADOR',
    /router\.get\('\/:id\/submissions', authMiddleware, superAdminOnly/.test(RUTAS));

// ════════════════════════════════════════════════════════════════════
grupo('7 · ⚠️ Borrar la pantalla vieja no perdió nada');
// ════════════════════════════════════════════════════════════════════

check('la información local se sigue guardando POR CAMPAÑA',
    /JSON\.stringify\(\{ campaignId, content: override \}\)/.test(LOCAL)
    && /JSON\.stringify\(\{ campaignId, centers \}\)/.test(LOCAL));
check('⚠️ cambiar de campaña descarta el borrador: es información POR campaña',
    /\}, \[campaignId, initial\]\);/.test(LOCAL));
check('la frontera de lo local NO se aflojó: sigue siendo sanitizeOverride',
    /const local = await localDataOf/.test(CTRL) && /sanitizeOverride\(ov\[0\]\.content\)/.test(CTRL));
check('⚠️ los textos de la página SIN campaña siguen teniendo editor',
    /page: 'contribucion', section: 'header'/.test(TEXTOS)
    && /page: 'contribucion', section: 'card'/.test(TEXTOS)
    && /page: 'contribucion', section: 'style'/.test(TEXTOS));
check('…montado como accesorio del módulo, no como una segunda pantalla',
    /<DonatePageTextsCard \/>/.test(PANTALLA) && !/path=".*DonatePageTexts/.test(APP));
check('y se DICE cuándo se ven, o se leen como textos que no hacen nada',
    /Sin ninguna campaña al aire/.test(TEXTOS));
check('⚠️ los respaldos son los MISMOS que pinta la página pública',
    /Maneras de contribuir/.test(TEXTOS) && /Aporte voluntario al Club/.test(TEXTOS));

// La vía de v4.807/v4.986 se conserva: la usa el panel local.
check('/site/override y /site/centers siguen existiendo (regla aditiva)',
    /router\.put\('\/site\/override'/.test(RUTAS) && /router\.put\('\/site\/centers'/.test(RUTAS));
const funcionesDelSitio = ['listSiteCampaigns', 'getSiteCampaign', 'saveSiteOverride', 'saveSiteCenters']
    .map(n => { const i = CTRL.indexOf(`export const ${n} = async`); return CTRL.slice(i, CTRL.indexOf('\n};', i)); });
check('el clubId de la vía del sitio sale del token, nunca del cuerpo',
    funcionesDelSitio.every(f => f.includes('const clubId = req.user.clubId') && !/req\.body\?\.clubId/.test(f)));

console.log('\n' + '─'.repeat(60));
if (fallos.length) {
    console.log(`❌ ${fallos.length} fallo(s) de ${ok + fallos.length}:`);
    fallos.forEach(f => console.log('   ·', f));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
