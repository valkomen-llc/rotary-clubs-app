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
import { existsSync, readFileSync } from 'fs';
import S from '../server/lib/rbacSpec.js';
import B from '../server/lib/campaignBoard.js';
import { destinoKeyOf as destinoKeyServidor } from '../server/lib/walletFilters.js';

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
const TABLERO = leer('src/components/admin/contribution/CampaignBoard.tsx');
const BOARD = leer('server/lib/campaignBoard.js');
const BOVEDA = leer('src/pages/admin/WalletManagement.tsx');

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
grupo('3 · ⚠️ Un sitio EDITA toda campaña que lo alcanza; el CONTROL es del dueño (v4.988)');
// ════════════════════════════════════════════════════════════════════

check('`own` lo decide el servidor y la puerta distingue escribir de CONTROLAR',
    /const scopedCampaign = async \(req, id, \{ write = false, control = false \} = \{\}\) => \{/.test(CTRL));
check('⚠️ una campaña ajena que alcanza al sitio se mira Y se edita: `write` ya no exige propiedad',
    !/if \(write\) return null;/.test(CTRL)
    && /if \(control\) return null;/.test(CTRL)
    && /preparableForSite\(c, site, new Date\(\)\)\) return null;\s*\n\s*void write;/.test(CTRL));
check('⚠️ …y lo que no la alcanza sigue sin existir (404), no 403',
    /if \(!site \|\| !preparableForSite\(c, site, new Date\(\)\)\) return null;/.test(CTRL)
    && !/status\(403\)/.test(CTRL.slice(CTRL.indexOf('const scopedCampaign'), CTRL.indexOf('const scopedCampaign') + 1200)));
check('las cuatro escrituras de CONTENIDO pasan por `write`',
    ['updateCampaign', 'saveCenters', 'runReadings', 'decideReading']
        .every(n => {
            const i = CTRL.indexOf(`export const ${n} = async`);
            return CTRL.slice(i, i + 1600).includes('{ write: true }');
        }));
check('⚠️ el ESTADO y el BORRADO exigen `control`: publicar o archivar una campaña compartida cambia lo que ven todos',
    ['transitionCampaign', 'deleteCampaign']
        .every(n => {
            const i = CTRL.indexOf(`export const ${n} = async`);
            const cuerpo = CTRL.slice(i, i + 1600);
            return cuerpo.includes('{ control: true }') && !cuerpo.includes('{ write: true }');
        }));
check('la ficha de una campaña ajena viaja ENTERA (historial y bloqueos), con `own` y `local`',
    !/return res\.json\(\{ campaign, own: false, local, history: \[\], publishErrors: \[\] \}\);/.test(CTRL)
    && /res\.json\(\{\s*campaign,\s*own,\s*local: clubId \? await localDataOf\(row\.id, clubId\) : null,/.test(CTRL));
check('⚠️ el ALCANCE de una campaña de un sitio se impone al CREAR',
    /const targeting = operador\s*\n\s*\? normalizeTargeting\(req\.body\?\.targeting\)\s*\n\s*: normalizeTargeting\(\{ mode: 'clubs', clubIds: \[ownerClubId\] \}\)/.test(CTRL));
check('⚠️ …y también al GUARDAR: sin eso, un PUT publicaría en los demás sitios',
    /const targeting = prev\.ownerClubId\s*\n\s*\? normalizeTargeting\(\{ mode: 'clubs', clubIds: \[prev\.ownerClubId\] \}\)/.test(CTRL));
check('⚠️ y el alcance de una campaña de la PLATAFORMA sólo lo mueve el operador: lo que mande un sitio se ignora',
    /const puedeApuntar = isPlatformOperator\(req\) && b\.targeting !== undefined;/.test(CTRL)
    && /: \(puedeApuntar \? normalizeTargeting\(b\.targeting\) : prev\.targeting\);/.test(CTRL)
    && /if \(puedeApuntar\) changed\.push\('targeting'\);/.test(CTRL));
check('la pantalla no ofrece el editor de alcance a un sitio',
    /\{esOperador && <>/.test(PANTALLA));
check('⚠️ una campaña ajena se abre en el MISMO editor: no hay rama que la mande a otra pantalla',
    !/if \(!own\) \{/.test(PANTALLA) && !/if \(!esPropia\) return;/.test(PANTALLA));
check('…y lo local de ese sitio va como una CARD dentro del editor, sólo para la ajena',
    /\{!own && \(\s*<Card id="local"[\s\S]{0,400}<SiteLocalPanel campaignId=\{c\.id\} initial=\{local\} \/>/.test(PANTALLA)
    && /'aliados', 'seo', 'resultados', 'historial',\n\s*'local',/.test(PANTALLA));
check('…sin los botones de estado ni el de borrar, y DICIENDO por qué',
    /\{own && \(\[/.test(PANTALLA)
    && /\{own && c\.status === 'draft' && !c\.publishedAt && \(/.test(PANTALLA)
    && /el estado de una campaña compartida lo maneja el Administrador del Sistema/.test(PANTALLA));

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
check('⚠️ v4.989 — el accesorio «Página de aportes sin campaña» se QUITÓ (pedido expreso): ni componente ni card',
    !existsSync('src/components/admin/contribution/DonatePageTextsCard.tsx')
    && !/DonatePageTextsCard/.test(PANTALLA)
    && !/Página de aportes sin campaña/.test(PANTALLA)
    && !/'aportes'/.test(PANTALLA));

// La vía de v4.807/v4.986 se conserva: la usa el panel local.
check('/site/override y /site/centers siguen existiendo (regla aditiva)',
    /router\.put\('\/site\/override'/.test(RUTAS) && /router\.put\('\/site\/centers'/.test(RUTAS));
const funcionesDelSitio = ['listSiteCampaigns', 'getSiteCampaign', 'saveSiteOverride', 'saveSiteCenters']
    .map(n => { const i = CTRL.indexOf(`export const ${n} = async`); return CTRL.slice(i, CTRL.indexOf('\n};', i)); });
check('el clubId de la vía del sitio sale del token, nunca del cuerpo',
    funcionesDelSitio.every(f => f.includes('const clubId = req.user.clubId') && !/req\.body\?\.clubId/.test(f)));


// ════════════════════════════════════════════════════════════════════
grupo('9 · ⚠️ TABLERO DE CAMPAÑAS (v4.990): lo que se mide y lo que no');
// ════════════════════════════════════════════════════════════════════

const aportes = [
    { amount: 50000, currency: 'COP', status: 'success', donorEmail: 'Ana@Club.org' },
    { amount: 30000, currency: 'cop', status: 'success', donorEmail: 'ana@club.org' },
    { amount: 10, currency: 'USD', status: 'success', donorEmail: '' },
    { amount: 999, currency: 'COP', status: 'refunded', donorEmail: 'x@y.z' },
];

check('⚠️ LAS MONEDAS NO SE SUMAN: una fila por moneda y ningún total que las junte',
    (() => {
        const r = B.recaudoPorMoneda(aportes);
        return r.length === 2
            && r.find(x => x.currency === 'COP').amount === 80000
            && r.find(x => x.currency === 'USD').amount === 10
            && r.every(x => !('total' in x));
    })());
check('…y el código de moneda se normaliza: «cop» y «COP» son la misma',
    B.recaudoPorMoneda(aportes).filter(r => r.currency === 'COP').length === 1);
check('⚠️ un aporte REEMBOLSADO no cuenta ni en el dinero ni en los aportes',
    B.recaudoPorMoneda(aportes).every(r => r.amount !== 999)
    && B.conteoDeAportes(aportes).aportes === 3);
check('⚠️ «personas» cuenta correos DECLARADOS y en minúsculas, no aportes',
    B.conteoDeAportes(aportes).personas === 1);
check('el tablero NO tiene ningún total entre monedas',
    (() => {
        const t = B.buildCampaignBoard({
            campaigns: [{ id: 'a' }],
            aportesPorCampana: new Map([['a', aportes]]),
        }).totales;
        return Array.isArray(t.recaudado) && t.recaudado.length === 2
            && typeof t.recaudado[0].amount === 'number'
            && !('recaudadoTotal' in t) && !('total' in t);
    })());
check('las solicitudes destacan las que NADIE miró todavía',
    (() => {
        const r = B.resumenDeSolicitudes([{ status: 'recibido', n: 4 }, { status: 'aprobado', n: 2 }]);
        return r.total === 6 && r.pendientes === 4;
    })());
check('⚠️ el estado inicial que se destaca es el MISMO del formulario público',
    B.PENDING_SUBMISSION_STATE === 'recibido');
check('⚠️ y lo que cuenta como dinero recibido es el MISMO estado que la línea pública',
    B.COUNTED_STATUS === 'success');
check('una campaña sin nada devuelve ceros propios, no rompe el tablero',
    (() => {
        const b = B.buildCampaignBoard({ campaigns: [{ id: 'z' }] });
        return b.filas[0].aportes === 0 && b.filas[0].recaudado.length === 0
            && b.totales.campanas === 1;
    })());
check('⚠️ lo que no se pudo leer se DECLARA (no se pinta en cero)',
    (() => {
        const b = B.buildCampaignBoard({ campaigns: [{ id: 'z' }], medido: { aportes: false, solicitudes: true } });
        return b.medido.aportes === false && b.medido.solicitudes === true;
    })()
    && /medido\.aportes \? formatNumber\(t\.aportes\) : '—'/.test(TABLERO));

check('⚠️ NO se lee el contador diario: no baja con un reembolso',
    // El criterio es PURO —no consulta nada— y el camino agrega sobre
    // `Donation`, no sobre la tabla de contadores. Que el comentario NOMBRE el
    // contador es justamente lo que explica por qué no se usa.
    !/db\.query/.test(BOARD) && /donation_completed/.test(BOARD)
    && /COUNTED_STATUS/.test(BOARD));

// ── El camino: alcance, aislamiento y degradación ──
const _bi = CTRL.indexOf('const boardDonations');
const board = CTRL.slice(_bi, CTRL.indexOf('export const getCampaign =', _bi));
check('⚠️ el aislamiento del dinero va en el WHERE, no en una comprobación posterior',
    /AND "clubId" = \$\$\{params\.length\}/.test(board) || /AND "clubId" = \$\$\{/.test(board));
check('⚠️ el operador ve la campaña entera y un sitio sólo lo que entró por su página',
    /const clubId = operador \? null : askingClubId\(req\)/.test(board)
    && /siteScoped: !operador/.test(board));
check('el JSON del pago se filtra amplio y se comprueba EXACTO en JavaScript',
    /LIKE ANY\(\$1::text\[\]\)/.test(board) && !/::jsonb/.test(board)
    && /conocidas\.has\(campaignId\)/.test(board));
check('⚠️ el número de consultas es FIJO y no crece con las campañas',
    // Cinco: las campañas del alcance, sus fechas, los pagos que las
    // mencionan, los aportes de esos pagos y las solicitudes agrupadas. Una
    // consulta POR campaña dejaría el tablero inservible con el segundo
    // cliente grande — es el punto de escalabilidad de `getCentralOverview`.
    // Si este número cambia, hay que volver a mirar POR QUÉ cambió.
    (board.match(/await db\.query/g) || []).length === 5);
check('⚠️ el tablero DEGRADA y nunca tumba el listado (cada bloque en su try)',
    /medidoAportes = false/.test(board) && /medidoSolicitudes = false/.test(board)
    && /res\.json\(\{\s*\n\s*scope: 'site', siteScoped: true, filas: \[\], totales: null/.test(board));
check('⚠️ la ruta del tablero va ANTES de la paramétrica /:id',
    RUTAS.indexOf("router.get('/board'") > 0
    && RUTAS.indexOf("router.get('/board'") < RUTAS.indexOf("router.get('/:id'"));
check('el tablero se pide APARTE del listado: un fallo suyo no deja sin campañas',
    /contribution-campaigns\/board/.test(PANTALLA)
    && /\/\* el listado no depende de esto \*\//.test(PANTALLA));

// ── El enlace a la Bóveda ──
check('⚠️ la clave del filtro la arma destinoKeyOf, no una cadena a mano',
    /destinoKeyOf\(\{ kind: 'campana'/.test(TABLERO)
    && !/`campana:\$\{/.test(TABLERO));
check('⚠️ el espejo de destinoKeyOf da lo MISMO que el servidor',
    (() => {
        const casos = [
            { kind: 'campana', id: 'abc-123', label: 'Terremoto' },
            { kind: 'campana', id: null, label: 'Sin id' },
            { kind: 'destino', id: 'blk', label: 'Bloque' },
            null,
        ];
        const MIRROR = leer('src/lib/walletFilters.ts');
        return /export const destinoKeyOf/.test(MIRROR)
            && casos.every(c => {
                const esperado = destinoKeyServidor(c);
                const espejo = !c || !c.label ? 'sin_destino' : `${c.kind}:${c.id || c.label}`;
                return esperado === espejo;
            });
    })());
check('el enlace lleva el histórico completo: la cifra del tablero es del histórico',
    /rango: 'todo'/.test(TABLERO));
check('⚠️ la Bóveda LEE los filtros de la dirección (si no, el enlace no filtra nada)',
    /useSearchParams/.test(BOVEDA)
    && /searchParams\.get\('destino'\)/.test(BOVEDA)
    && /searchParams\.get\('moneda'\)/.test(BOVEDA));
check('…y un rango inventado se ignora en vez de dejarla en un estado inválido',
    /isRango\(pedido\) \? pedido : RANGO_DEFAULT/.test(BOVEDA));
check('…y una moneda que este sitio no cobra se corrige sola',
    /rows\.some\(b => b\.currency === activeCurrency\)\) return;/.test(BOVEDA));
check('⚠️ la cifra enlazada NO va dentro del botón de abrir la campaña',
    (() => {
        const i = PANTALLA.indexOf('{campaigns.map(row => (');
        const trozo = PANTALLA.slice(i, i + 4200);
        return /<div key=\{row\.id\}/.test(trozo)
            && trozo.indexOf('</button>') < trozo.indexOf('<CampaignIndicators');
    })());


console.log('\n' + '─'.repeat(60));
if (fallos.length) {
    console.log(`❌ ${fallos.length} fallo(s) de ${ok + fallos.length}:`);
    fallos.forEach(f => console.log('   ·', f));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
