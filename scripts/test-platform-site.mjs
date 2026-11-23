#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Sitio web de Club Platform — EL CRITERIO (v4.1348.0)
// npm run test:platform-site (en `prebuild`)
//
// Parte 1, sin base ni red:
//   · el saneado: nunca HTML/JS, catálogos cerrados, direcciones reservadas;
//   · lo PÚBLICO sólo lleva lo publicable: capacidades verificadas, sitios
//     elegidos, contenedores con datos; la vista previa lo muestra todo;
//   · el flujo editorial: quién puede qué, y que una edición invalida la
//     aprobación;
//   · SEO: sitemap, robots cerrado sin sitio en vivo, head en servidor;
//   · el aislamiento: ninguna tabla con `clubId`, ninguna fila en `Club`;
//   · espejo servidor ↔ navegador, rutas, montajes, guardián y CLAUDE.md.
//
// Parte 2 (con `TEST_DATABASE_URL`): integración contra un Postgres real —
// crear, guardar con bloqueo optimista, revisar, publicar, revertir, accesos,
// solicitudes y visitas.
//   TEST_DATABASE_URL='postgresql://postgres@localhost:5433/rot?sslmode=disable&host=/tmp' npm run test:platform-site
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const S = await import(`${REPO}/server/lib/platformSiteSpec.js`);
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ── 1. El sitio inicial ──────────────────────────────────────────────
const site = S.defaultSite();
ok(site.pages.length === 1 && site.pages[0].slug === '', 'nace con la portada en «/»');
eq(site.pages[0].blocks.map(b => b.type), ['hero', 'about', 'solutions', 'steps', 'architecture', 'benefits', 'sites', 'faq', 'contact'], 'las nueve secciones del encargo, en orden');
ok(site.settings.name === 'Club Platform for Rotary' && site.settings.language === 'es', 'nombre e idioma inicial');
ok(S.validateSite(site).ok, 'el sitio inicial es un borrador válido');
ok(S.publishChecklist(site).ok, 'y no tiene bloqueos para publicar');
ok(site.pages[0].blocks.find(b => b.type === 'solutions').content.items.every(i => i.verified === false), 'las capacidades nacen SIN verificar');
ok(S.publishChecklist(site).warnings.some(w => /sin verificar/.test(w)), 'y el resumen lo avisa');
ok(JSON.stringify(S.shapeSite(site)) === JSON.stringify(site), 'sanear es idempotente');

// ── 2. Saneado ───────────────────────────────────────────────────────
const sucio = S.shapeSite({ settings: { name: '<script>alert(1)</script>', logoUrl: 'javascript:alert(1)', accent: 'rojo', header: 'x', contact: { email: 'no-es-correo' } }, pages: [
    { title: 'Inicio', blocks: [{ type: 'hero', content: { title: 'T', buttons: [{ label: 'Malo', action: { type: 'external', target: 'javascript:alert(1)' } }, { label: 'Otro', action: { type: 'inventada', target: 'x' } }] }, style: { background: 'rosa', spacing: 'gigante', animation: 'explota' } }, { type: 'no-existe', content: {} }] },
    { title: 'Admin', slug: 'admin', blocks: [{ type: 'text', content: { title: 'x' } }] },
    { title: 'Admin dos', slug: 'admin', blocks: [{ type: 'text', content: { title: 'x' } }] },
] });
ok(sucio.settings.logoUrl === '' && sucio.settings.accent === 'gold' && sucio.settings.header === 'dark' && sucio.settings.contact.email === '', 'ajustes fuera de catálogo vuelven al valor por omisión');
ok(sucio.pages[0].blocks.length === 1, 'un tipo de contenedor desconocido se descarta');
const hb = sucio.pages[0].blocks[0];
ok(hb.content.buttons[0].action.target === '' && hb.content.buttons[1].action.type === 'none', 'javascript: no es un enlace; una acción inventada queda sin acción');
eq([hb.style.background, hb.style.spacing, hb.style.animation], ['navy', 'normal', 'rise'], 'estilo de lista cerrada');
ok(sucio.pages[1].slug === 'admin' && sucio.pages[2].slug === 'admin-2', 'direcciones repetidas se distinguen');
const v = S.validateSite(sucio);
ok(!v.ok && v.errors.some(e => /reservada/.test(e.message)), '«/admin» está reservada: no se puede guardar');
ok(v.errors.some(e => /enlace externo inválido/.test(e.message)), 'un botón con enlace inválido se dice');
for (const r of ['admin', 'api', 'login', 'registro']) ok(S.RESERVED_SLUGS.includes(r), `«${r}» reservada`);
ok(S.normalizeHost('https://www.ClubPlatform.org/x') === 'clubplatform.org' && S.normalizeHost('localhost') === '' && S.normalizeHost('a b.com') === '', 'el dominio se normaliza y lo inválido se rechaza');
const sinAlt = S.shapeSite({ pages: [{ title: 'Inicio', blocks: [{ type: 'hero', content: { title: 'T', visual: 'image', image: { url: 'https://x.org/a.png' } } }] }] });
ok(S.validateSite(sinAlt).errors.some(e => /texto alternativo/.test(e.message)), 'una imagen sin texto alternativo no se guarda');
ok(!S.publishChecklist(S.shapeSite({ pages: [{ title: 'Inicio', blocks: [{ type: 'text', content: { title: 'x' } }] }] })).ok, 'sin portada no se publica');

// ── 3. Público frente a vista previa ─────────────────────────────────
const pub = S.resolvePage(site, '', { sites: [] });
const prev = S.resolvePage(site, '', { sites: [] }, { preview: true, base: '/vista-previa/sitio-institucional' });
ok(!pub.blocks.some(b => b.type === 'solutions'), 'PÚBLICO: sin capacidades verificadas, «Soluciones» no se pinta');
ok(!pub.blocks.some(b => b.type === 'sites'), 'PÚBLICO: sin sitios elegidos, «Sitios del ecosistema» no se pinta');
ok(prev.blocks.find(b => b.type === 'solutions')?.data.items.length === 8 && prev.blocks.find(b => b.type === 'sites'), 'VISTA PREVIA: se pintan con su aviso');
const conUna = structuredClone(site); conUna.pages[0].blocks.find(b => b.type === 'solutions').content.items[0].verified = true;
eq(S.resolvePage(conUna, '', {}).blocks.find(b => b.type === 'solutions').data.items.map(i => i.id), ['sol-sitios'], 'PÚBLICO: sólo la capacidad verificada');
ok(S.resolvePage(conUna, '', {}).blocks.every(b => b.notes.length === 0) && S.resolvePage(conUna, '', {}, { preview: true }).blocks.some(b => b.notes.length), 'los avisos de edición no llegan al público');
const conSitios = structuredClone(site); conSitios.pages[0].blocks.find(b => b.type === 'sites').content.siteIds = ['a', 'b-oculto'];
const rs = S.resolvePage(conSitios, '', { sites: [{ id: 'a', name: 'Rotary A', logo: 'https://x/l.png', url: 'https://a.org', internal: 'secreto', email: 'x@y.z' }] }).blocks.find(b => b.type === 'sites');
eq(rs.data.sites, [{ id: 'a', name: 'Rotary A', logo: 'https://x/l.png', url: 'https://a.org', kind: '' }], 'de un sitio sólo salen nombre, logotipo y enlace; lo que no está publicado no aparece');
ok(pub.chrome.nav.every(l => l.href) && !pub.chrome.nav.some(l => l.href === '#soluciones'), 'el menú no enlaza a un contenedor que no se pinta');
ok(pub.chrome.cta?.href === '#contacto' && pub.chrome.loginHref === 'https://app.clubplatform.org/', 'el botón del menú va al contacto; «Ingresar» al panel');
ok(prev.chrome.home === '/vista-previa/sitio-institucional/', 'la vista previa navega dentro de su ruta privada');
const dos = S.shapeSite({ ...site, pages: [...site.pages, { title: 'Condiciones', showInNav: true, blocks: [{ type: 'text', content: { title: 'Condiciones', body: 'Texto' } }] }, { title: 'Oculta', enabled: false, blocks: [{ type: 'text', content: { title: 'x' } }] }] });
ok(S.resolvePage(dos, 'condiciones', {})?.page.title === 'Condiciones', 'una página se resuelve por su dirección');
ok(S.resolvePage(dos, 'oculta', {}) === null && S.resolvePage(dos, 'oculta', {}, { preview: true }) !== null, 'una página inactiva no existe en público');
ok(S.resolvePage(dos, 'no-existe', {}) === null, 'una dirección desconocida no resuelve');
ok(S.resolvePage(dos, 'condiciones', {}).chrome.cta.href === '/#contacto', 'desde otra página, el contacto vuelve a la portada');
ok(S.resolvePage(dos, '', {}).chrome.nav.some(l => l.href === '/condiciones') && !S.resolvePage(dos, '', {}).chrome.nav.some(l => /oculta/.test(l.href)), 'el menú suma las páginas activas');

// ── 4. SEO ───────────────────────────────────────────────────────────
ok(pub.seo.title.includes('Club Platform') && pub.seo.path === '/', 'la portada toma el SEO del sitio');
ok(S.resolvePage(dos, 'condiciones', {}).seo.title === 'Condiciones | Club Platform for Rotary', 'una página sin metatítulo usa «Título | Sitio»');
const xml = S.sitemapXml(dos, 'clubplatform.org', '2026-11-23T10:00:00Z');
ok(xml.includes('<loc>https://clubplatform.org/</loc>') && xml.includes('/condiciones') && !xml.includes('oculta') && xml.includes('<lastmod>2026-11-23</lastmod>'), 'sitemap: sólo páginas activas');
ok(S.robotsTxt('clubplatform.org') === 'User-agent: *\nDisallow: /\n', 'robots: todo cerrado mientras no esté en vivo');
const rb = S.robotsTxt('clubplatform.org', { live: true });
ok(/Disallow: \/admin/.test(rb) && /Disallow: \/api\//.test(rb) && /Disallow: \/vista-previa/.test(rb) && /Sitemap: https:\/\/clubplatform\.org\/sitemap\.xml/.test(rb), 'robots en vivo: nunca el panel, la API ni la vista previa');
const ld = S.structuredData(site, 'clubplatform.org');
ok(ld['@graph'].length === 2 && !JSON.stringify(ld).match(/aggregateRating|review/i), 'datos estructurados: organización y sitio, sin valoraciones');
const { renderPlatformHead, hostMatches, liveSite, resetLiveSiteCache } = await import(`${REPO}/server/lib/platformSiteServe.js`);
const base = '<html lang="es-CO"><head><title>Viejo</title><meta name="description" content="vieja"><meta property="og:url" content="https://clubplatform.org/"><link rel="canonical" href="https://x/"></head><body></body></html>';
const head = renderPlatformHead(base, { config: dos, host: 'clubplatform.org', path: '/condiciones' });
ok(head.includes('<title>Condiciones | Club Platform for Rotary</title>') && head.includes('<link rel="canonical" href="https://clubplatform.org/condiciones">') && !head.includes('Viejo') && head.includes('lang="es"'), 'el head se resuelve en el servidor');
ok(!head.includes('application/ld+json') && renderPlatformHead(base, { config: dos, host: 'clubplatform.org', path: '/' }).includes('application/ld+json'), 'el JSON-LD va sólo en la portada');
ok(renderPlatformHead(base, { config: dos, host: 'clubplatform.org', path: '/oculta' }) === null, 'una página inactiva no tiene documento propio');
resetLiveSiteCache();
ok(await liveSite({ load: async () => ({ publicLive: false, published: site, publicHost: 'clubplatform.org' }) }) === null, 'publicado pero SIN activar: el dominio no cambia');
resetLiveSiteCache();
const live = await liveSite({ load: async () => ({ publicLive: true, published: site, publicHost: 'clubplatform.org' }) });
ok(hostMatches(live, 'www.clubplatform.org') && !hostMatches(live, 'app.clubplatform.org') && !hostMatches(live, 'rotarypasto.org') && !hostMatches(null, 'clubplatform.org'), 'en vivo: sólo SU dominio; nunca el panel ni el sitio de un club');
resetLiveSiteCache();

// ── 5. Roles y flujo editorial ───────────────────────────────────────
ok(S.can('admin', 'publish') && S.can('admin', 'domain') && S.can('admin', 'members'), 'el administrador central puede todo');
ok(S.can('editor', 'edit') && !S.can('editor', 'publish') && !S.can('editor', 'review') && !S.can('editor', 'domain') && !S.can('editor', 'members'), 'el editor edita y NO publica');
ok(S.can('reviewer', 'review') && S.can('reviewer', 'view') && !S.can('reviewer', 'edit') && !S.can('reviewer', 'publish'), 'el revisor revisa y NO edita');
ok(!S.can(null, 'view') && !S.can('club_admin', 'view'), 'sin rol en el sitio no hay acceso');
ok(S.isCentralAdmin({ role: 'administrator' }) && S.isCentralAdmin({ role: 'superadmin', clubId: 'x' }) && S.isCentralAdmin({ role: 'editor', isSuperAdmin: true }), 'administrador central: superadmin, o administrator sin club');
ok(!S.isCentralAdmin({ role: 'administrator', clubId: 'club-1' }) && !S.isCentralAdmin({ role: 'club_admin' }) && !S.isCentralAdmin({ role: 'district_admin' }) && !S.isCentralAdmin(null), 'el administrador LOCAL de un club no hereda el sitio institucional');
eq(S.ASSIGNABLE_ROLES, ['editor', 'reviewer'], 'el rol de administrador central no se asigna desde el módulo');
const gate = (o) => S.canPublishNow({ role: 'admin', requireReview: true, reviewStatus: 'approved', reviewedVersion: 4, draftVersion: 4, ...o });
ok(gate({}).ok, 'aprobado tal como está: se publica');
ok(!gate({ draftVersion: 5 }).ok, 'una edición posterior INVALIDA la aprobación');
ok(!gate({ reviewStatus: 'in_review' }).ok && !gate({ role: 'editor' }).ok && !gate({ role: 'reviewer' }).ok, 'ni en revisión, ni un editor, ni un revisor');
ok(gate({ requireReview: false, reviewStatus: 'draft' }).ok, 'sin revisión obligatoria, el administrador central publica');
const cambiado = structuredClone(site); cambiado.pages[0].blocks[0].content.title = 'Otro'; cambiado.pages[0].blocks[1].enabled = false; cambiado.pages[0].blocks.pop();
const diff = S.diffSummary(site, S.shapeSite(cambiado));
ok(diff.some(d => /cambios en «Portada»/.test(d)) && diff.some(d => /ahora oculto/.test(d)) && diff.some(d => /eliminado «Llamado final/.test(d)), 'el historial dice QUÉ cambió');
eq(S.diffSummary(null, site), ['Primera publicación del sitio.'], 'y la primera publicación');
ok(S.PLATFORM_FACTS.some(f => /no deben mencionarse/.test(f)), 'el asistente recibe la prohibición de inventar cifras y clientes');

// ── 6. Controlador: vista previa firmada y asistente ─────────────────
const C = await import(`${REPO}/server/controllers/platformSiteController.js`);
const tok = C.signPreview(1_000_000);
ok(C.verifyPreview(tok, 1_000_001) && !C.verifyPreview(tok, 1_000_000 + 61 * 60 * 1000), 'el token de vista previa vale una hora');
ok(!C.verifyPreview(`${tok}x`, 1_000_001) && !C.verifyPreview('', 0) && !C.verifyPreview('abc.def', 0) && !C.verifyPreview(`${9e15}.${'0'.repeat(64)}`, 0), 'uno alterado o inventado no vale');
const heroC = site.pages[0].blocks[0].content;
const tv = C.textView(heroC);
ok(tv.title && !('buttons' in tv) && !('image' in tv) && !('visual' in tv), 'el asistente sólo lee textos');
const merged = C.mergeText(heroC, { title: 'Nuevo título', visual: 'none', buttons: [{ label: 'HACK', action: { type: 'external', target: 'https://malo.example' } }], image: { url: 'https://malo.example/x.png' }, inventado: 'x' });
ok(merged.title === 'Nuevo título' && merged.visual === 'product' && merged.buttons[0].label === 'Conocer la plataforma' && !('inventado' in merged) && merged.image.url === '', 'y sólo cambia textos: ni enlaces, ni imágenes, ni estructura');
const sol = site.pages[0].blocks.find(b => b.type === 'solutions').content;
ok(C.mergeText(sol, { items: [{ title: 'X', verified: true }] }).items[0].verified === false, 'el asistente NO puede marcar una capacidad como verificada');

// ── 7. Estructura: aislamiento, rutas, montajes, espejo ──────────────
const ensure = read('server/lib/ensurePlatformSiteSchema.js');
const { OWNED_COLUMNS, PLATFORM_SITE_TABLES } = await import(`${REPO}/server/lib/ensurePlatformSiteSchema.js`);
eq(PLATFORM_SITE_TABLES, ['PlatformSite', 'PlatformSiteVersion', 'PlatformSiteEvent', 'PlatformSiteMember', 'PlatformSiteLead', 'PlatformSiteDaily'], 'seis tablas propias');
ok(!/"clubId"/.test(ensure) && !/REFERENCES/i.test(ensure), 'ninguna tabla con `clubId` ni claves foráneas: no es un tenant');
ok(!/DROP |RENAME /.test(ensure), 'ningún DROP ni RENAME');
const addCols = [...ensure.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)].map(m => m[1]);
ok(addCols.every(c => Object.values(OWNED_COLUMNS).flat().includes(c)), 'todo ADD COLUMN va enumerado en el atajo');
const store = read('server/lib/platformSiteStore.js');
ok(!/INSERT INTO "Club"|UPDATE "Club"|DELETE FROM "Club"/.test(store), 'el módulo NO escribe en la tabla de clubes');
ok(/SELECT id, name, logo, domain, type FROM "Club"/.test(store) && /status = 'active'/.test(store), 'y de un club sólo LEE columnas públicas de sitios publicados');
for (const f of ['server/lib/platformSiteStore.js', 'server/controllers/platformSiteController.js', 'server/lib/ensurePlatformSiteSchema.js']) {
    const src = read(f);
    for (const m of src.matchAll(/db\.query\(\s*`([\s\S]*?)`\s*[,)]/g)) ok(!m[1].includes('`'), `${f}: sin comilla invertida dentro de un SQL`);
}
const routes = read('server/routes/platform-site.js');
const adminLines = routes.split('\n').filter(l => /router\.(get|post|put|patch|delete)\('\/admin/.test(l));
ok(adminLines.length >= 24, `rutas del panel (${adminLines.length})`);
ok(adminLines.every(l => /ctrl\.can\w+/.test(l) || /\/admin\/access'/.test(l)), 'TODA ruta del panel pasa por una barrera de permiso');
ok(/router\.use\('\/admin', authMiddleware\)/.test(routes), 'y por la sesión');
ok(/'\/admin\/publish', ctrl\.canPublish/.test(routes) && /'\/admin\/rollback', ctrl\.canPublish/.test(routes) && /'\/admin\/config', ctrl\.canDomain/.test(routes) && /'\/admin\/members', ctrl\.canMembers/.test(routes) && /'\/admin\/create', ctrl\.canPublish/.test(routes), 'publicar, revertir, dominio, accesos y crear: sólo el administrador central');
ok(routes.indexOf("'/admin/members/:id'") > routes.indexOf("'/admin/members'") && routes.indexOf("router.get('/admin',") > routes.indexOf("'/admin/leads/:id'"), 'literal antes que paramétrica');
ok(read('api/index.js').includes("import('../server/routes/platform-site.js')") && read('server/server.js').includes("app.use('/api/platform-site'"), 'montado en producción (api/index.js) y en local');
const ctrlSrc = read('server/controllers/platformSiteController.js');
ok(/confirmHost/.test(ctrlSrc) && /No-store|no-store/.test(ctrlSrc) && /X-Robots-Tag/.test(ctrlSrc), 'activar el dominio exige confirmarlo; la vista previa no se cachea ni se indexa');
ok(/!req\.headers\.authorization/.test(ctrlSrc), 'una petición con sesión del panel no cuenta como visita');
ok(read('scripts/db-push-guard.mjs').includes('PlatformSiteVersion') && PLATFORM_SITE_TABLES.every(t => read('CLAUDE.md').includes(`\`${t}\``)), 'las tablas están en el guardián de db:push y en CLAUDE.md');

// espejo
const mirror = read('src/lib/platformSiteSpec.ts');
const idsOf = (name) => [...(mirror.match(new RegExp(`export const ${name}[^=]*=\\s*([\\s\\S]*?)\\n(?:\\];|\\};)`))?.[1] || '').matchAll(/id: '([a-z-]+)'/g)].map(m => m[1]);
eq(idsOf('BACKGROUNDS'), S.BACKGROUNDS.map(b => b.id), 'espejo: fondos');
eq(idsOf('ICONS'), S.ICONS.map(b => b.id), 'espejo: íconos');
eq(idsOf('BUTTON_ACTIONS'), S.BUTTON_ACTIONS.map(b => b.id), 'espejo: acciones de botón');
eq([...new Set(idsOf('BLOCK_TYPES'))], S.BLOCK_TYPE_IDS, 'espejo: tipos de contenedor');
for (const t of S.BLOCK_TYPE_IDS) ok(mirror.includes(`single: ${S.BLOCK_TYPES[t].single}`) && mirror.includes(S.BLOCK_TYPES[t].label), `espejo: ${t}`);
const iconSrc = read('src/components/platform-site/PlatformIcon.tsx');
for (const i of S.ICON_IDS) ok(new RegExp(`\\b${i}: `).test(iconSrc), `ícono «${i}» se sabe dibujar`);
const view = read('src/components/platform-site/PlatformSiteView.tsx');
for (const t of S.BLOCK_TYPE_IDS) ok(view.includes(`case '${t}':`), `el renderizador pinta «${t}»`);
ok(view.includes('SITE_ACTION_BG') && view.includes('SITE_FOOTER_BG') && view.includes('ctaSkin(CTA_SOLID)') && view.includes('bg-rotary-topbar'), 'reutiliza los patrones de la plantilla institucional');
ok(!/(?:bg|text|border)-rotary-[a-z]+\/\d+/.test(view.replace(/\/\*[\s\S]*?\*\//g, '')), 'ninguna clase rotary-* con opacidad: no existen (v4.719)');
ok(view.includes('data-no-translate'), 'la marca no se traduce');
// La cabecera es la de un sitio institucional, no una propia (v4.1349).
const navbar = read('src/sections/Navbar.tsx'); const topbar = read('src/components/PublicTopBar.tsx');
ok(view.includes('<PublicTopBar rotaryLinks />') && topbar.includes('bg-rotary-topbar') && topbar.includes('https://www.endpolio.org') && topbar.includes('https://my.rotary.org'), 'barra superior institucional: Endpolio.org · My Rotary · idioma');
ok(/rotaryLinks = false/.test(topbar) && topbar.includes('Iniciar sesión'), 'y la barra del calendario no cambia para quien ya la usaba');
ok(view.includes('bg-white shadow-sm sticky top-0 z-50') && navbar.includes('bg-white shadow-sm sticky'), 'cabecera blanca y fija, como el Navbar');
for (const cls of ['text-rotary-blue font-medium text-sm hover:text-rotary-gold transition-colors', 'items-center justify-center gap-2 font-bold text-sm px-5 py-2.5 rounded-full transition-colors', 'bg-white text-rotary-blue ring-1 ring-inset ring-rotary-blue/25 hover:bg-rotary-blue hover:text-white hover:ring-rotary-blue', 'flex items-center justify-between min-h-[4rem] py-2'])
    ok(view.includes(cls) && navbar.includes(cls), `mismas clases que el Navbar: «${cls.slice(0, 40)}…»`);
ok(!/chrome\.header/.test(view), 'ya no hay cabecera oscura propia');
ok(!/dangerouslySetInnerHTML/.test(view + read('src/pages/PlatformSitePage.tsx')), 'nunca HTML crudo');

// dominio y entornos
const app = read('src/App.tsx');
ok(app.includes('path="/admin/sitio-institucional"') && app.includes('path="/vista-previa/sitio-institucional/*"'), 'rutas del módulo y de la vista previa');
ok(/if \(isMainPlatform\) return <PlatformSitePage mode="public" \/>/.test(app), 'el dominio de la plataforma pinta su sitio institucional');
ok(!/location\.replace\('https:\/\/app\.clubplatform\.org\/'\)/.test(read('index.html') + read('src/contexts/ClubContext.tsx')), 'ya no hay redirección a ciegas en el dominio principal');
ok(/window\.location\.replace\(`https:\/\/\$\{ADMIN_HOST\}\/`\)/.test(read('src/pages/PlatformSitePage.tsx')), 'sin sitio en vivo, el dominio sigue llevando al panel');
const apiIdx = read('api/index.js');
ok(/isMainDomain && !isSystemPath && !institutionalLive/.test(apiIdx), 'la redirección del servidor se apaga SÓLO con el sitio en vivo');
ok(/req\.path\.startsWith\('\/vista-previa'\)\) res\.setHeader\('X-Robots-Tag', 'noindex, nofollow'\)/.test(apiIdx), 'la vista previa nunca se indexa');
const an = read('server/routes/analytics.js');
ok(an.includes("id: 'platform-site'") && an.includes('Club Platform — Institucional') && an.includes('exactHostnames: true') && /BEGINS_WITH', value: '\/admin'/.test(an), 'analíticas: entrada propia, host exacto y sin /admin');
ok(read('src/components/admin/AdminLayout.tsx').includes("path: '/admin/sitio-institucional'"), 'entrada en el menú del panel central');
ok(!read('server/lib/entityTypes.js').includes("'platform'"), 'NO se agregó un tipo de sitio «platform» a los tenants');

console.log(`✓ [test-platform-site] ${n} comprobaciones del criterio.`);

// ════════════════════════════════════════════════════════════════════
// Parte 2 — integración
// ════════════════════════════════════════════════════════════════════
if (!process.env.TEST_DATABASE_URL) {
    console.log('  (Sin TEST_DATABASE_URL: se omite la integración con la base.)');
    process.exit(0);
}
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.TEST_DATABASE_URL)) { console.error('TEST_DATABASE_URL parece de un entorno real. Abortando.'); process.exit(1); }
const { default: db } = await import(`${REPO}/server/lib/db.js`);
let m = 0;
const check = (name, c) => { assert.ok(c, name); m++; console.log(`  ✓ ${name}`); };
try {
    for (const t of PLATFORM_SITE_TABLES) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    // Base de PRUEBA y local: las dos tablas ajenas se recrean con lo mínimo.
    await db.query(`DROP TABLE IF EXISTS "User", "Club" CASCADE`);
    await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT UNIQUE, role TEXT)`);
    await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY, name TEXT, logo TEXT, domain TEXT, type TEXT, status TEXT)`);
    await db.query(`INSERT INTO "User" (id, email, role) VALUES ('ps-ed', 'editora@ejemplo.org', 'editor'), ('ps-rev', 'revisor@ejemplo.org', 'editor')`);
    await db.query(`INSERT INTO "Club" (id, name, logo, domain, type, status) VALUES ('ps-a', 'Rotary Publicado', 'https://x/l.png', 'rotarypublicado.org', 'club', 'active'), ('ps-b', 'En subdominio', NULL, 'x.clubplatform.org', 'club', 'active'), ('ps-c', 'Suspendido', NULL, 'suspendido.org', 'club', 'suspended')`);
    const { default: St } = await import(`${REPO}/server/lib/platformSiteStore.js`);
    const admin = { id: 'u-admin', name: 'Admin Central' };

    check('sin crear, el sitio no existe', (await St.getSite()) === null);
    const c1 = await St.createSite({ actor: admin });
    check('se crea en BORRADOR, sin versión publicada y sin dominio activo', c1.created && c1.site.published === null && c1.site.publicLive === false && c1.site.draftVersion === 1 && c1.site.requireReview === true);
    check('crear dos veces no duplica', (await St.createSite({ actor: admin })).created === false && (await db.query(`SELECT COUNT(*)::int n FROM "PlatformSite"`)).rows[0].n === 1);
    check('el dominio no se puede activar sin publicar', (await St.updateConfig({ publicLive: true }, { actor: admin })).ok === false);

    const d = structuredClone(c1.site.draft); d.pages[0].blocks[0].content.title = 'Título editado';
    const s1 = await St.saveDraft(S.shapeSite(d), { actor: { id: 'ps-ed', name: 'Editora' }, baseVersion: 1 });
    check('guardar sube la versión del borrador', s1.ok && s1.site.draftVersion === 2 && s1.site.updatedByName === 'Editora');
    check('guardar sobre una versión vieja es un CONFLICTO, no una sobrescritura', (await St.saveDraft(S.shapeSite(d), { actor: admin, baseVersion: 1 })).conflict === true);
    check('el borrador no es público', (await St.getSite()).published === null);

    check('publicar sobre una versión vieja no publica', (await St.publish({ actor: admin, baseVersion: 1 })).conflict === true);
    await St.setReview('in_review', { actor: { id: 'ps-ed', name: 'Editora' }, baseVersion: 2 });
    const ap = await St.setReview('approved', { actor: { id: 'ps-rev', name: 'Revisor' }, baseVersion: 2, note: 'ok' });
    check('la aprobación queda atada a ESA versión del borrador', ap.site.reviewStatus === 'approved' && ap.site.reviewedVersion === 2 && ap.site.reviewedByName === 'Revisor');
    const p1 = await St.publish({ actor: admin, baseVersion: 2, note: 'Lanzamiento' });
    check('publicar escribe la versión 1 con su resumen', p1.ok && p1.site.publishedVersion === 1 && p1.site.published.pages[0].blocks[0].content.title === 'Título editado');
    const vs1 = await St.versions();
    check('la versión es inmutable y dice qué cambió', vs1.length === 1 && vs1[0].summary[0] === 'Primera publicación del sitio.' && vs1[0].note === 'Lanzamiento');

    const d2 = structuredClone(p1.site.draft); d2.pages[0].blocks[0].content.title = 'Título con error';
    const s2 = await St.saveDraft(S.shapeSite(d2), { actor: admin, baseVersion: 2 });
    check('editar después de aprobar vuelve a «borrador»', s2.site.reviewStatus === 'draft' && s2.site.draftVersion === 3);
    check('y lo publicado NO cambia', (await St.getSite()).published.pages[0].blocks[0].content.title === 'Título editado');
    check('la compuerta lo rechaza', S.canPublishNow({ role: 'admin', requireReview: true, reviewStatus: s2.site.reviewStatus, reviewedVersion: s2.site.reviewedVersion, draftVersion: s2.site.draftVersion }).ok === false);
    await St.setReview('approved', { actor: admin, baseVersion: 3 });
    const p2 = await St.publish({ actor: admin, baseVersion: 3, note: 'Con error' });
    check('segunda publicación', p2.ok && p2.site.publishedVersion === 2 && (await St.versions())[0].summary.some(x => /cambios en «Portada»/.test(x)));

    const rbk = await St.rollback(1, { actor: admin, note: 'Título equivocado' });
    check('REVERSIÓN: el público vuelve a ver la versión 1, como versión nueva', rbk.ok && rbk.site.publishedVersion === 3 && rbk.site.published.pages[0].blocks[0].content.title === 'Título editado');
    const vs3 = await St.versions();
    check('sin borrar nada: quedan las tres, y la última anota de cuál salió', vs3.length === 3 && vs3[0].restoredFrom === 1 && vs3[1].version === 2);
    check('el borrador queda igual a lo publicado', rbk.site.draft.pages[0].blocks[0].content.title === 'Título editado' && Number(rbk.site.publishedDraftVersion) === Number(rbk.site.draftVersion));
    const rtd = await St.restoreToDraft(2, { actor: admin });
    check('restaurar al borrador no toca lo publicado', rtd.ok && rtd.site.draft.pages[0].blocks[0].content.title === 'Título con error' && rtd.site.published.pages[0].blocks[0].content.title === 'Título editado');
    check('una versión que no existe no se restaura', (await St.rollback(99, { actor: admin })).ok === false);

    check('dominio inválido rechazado', (await St.updateConfig({ publicHost: 'no es un dominio' }, { actor: admin })).ok === false);
    const liveOn = await St.updateConfig({ publicLive: true }, { actor: admin });
    check('con versión publicada, el sitio se activa y queda quién y cuándo', liveOn.ok && liveOn.site.publicLive === true && liveOn.site.liveByName === 'Admin Central' && liveOn.site.liveAt);
    check('y se desactiva', (await St.updateConfig({ publicLive: false }, { actor: admin })).site.publicLive === false);

    check('acceso sólo a cuentas que existen', (await St.upsertMember({ email: 'nadie@ejemplo.org', role: 'editor' }, { actor: admin })).ok === false);
    check('el rol de administrador no se concede aquí', (await St.upsertMember({ email: 'editora@ejemplo.org', role: 'admin' }, { actor: admin })).ok === false);
    await St.upsertMember({ email: 'Editora@Ejemplo.org', role: 'editor' }, { actor: admin });
    await St.upsertMember({ email: 'revisor@ejemplo.org', role: 'reviewer' }, { actor: admin });
    check('rol por id o por correo', (await St.memberRole({ userId: 'ps-ed' })) === 'editor' && (await St.memberRole({ email: 'REVISOR@ejemplo.org' })) === 'reviewer');
    check('quien no está en la lista no tiene rol', (await St.memberRole({ userId: 'otro', email: 'club@ejemplo.org' })) === null && (await St.memberRole({})) === null);
    const mem = await St.members();
    await St.removeMember(mem.find(x => x.role === 'editor').id, { actor: admin });
    check('retirar un acceso surte efecto en la siguiente petición', (await St.memberRole({ userId: 'ps-ed', email: 'editora@ejemplo.org' })) === null);

    const eco = await St.ecosystemSites();
    check('sitios del ecosistema: sólo publicados y con dominio propio', eco.some(x => x.id === 'ps-a') && !eco.some(x => ['ps-b', 'ps-c'].includes(x.id)));
    check('y sólo datos públicos', JSON.stringify(Object.keys(eco.find(x => x.id === 'ps-a')).sort()) === JSON.stringify(['id', 'kind', 'logo', 'name', 'url']));
    check('acotado a los elegidos', (await St.ecosystemSites(['ps-a', 'ps-c'])).length === 1 && (await St.ecosystemSites([])).length === 0);

    const lead = await St.createLead({ name: 'Ana', email: 'ana@ejemplo.org', organization: 'Rotary X', message: 'Hola', consentText: 'Autorizo' });
    check('una solicitud queda guardada con su consentimiento', lead.id && (await db.query(`SELECT "consentAt", status FROM "PlatformSiteLead" WHERE id = $1`, [lead.id])).rows[0].status === 'nueva');
    check('freno por correo', (await St.recentLeadCount('ANA@ejemplo.org')) === 1);
    await St.updateLead(lead.id, { status: 'respondida' }, { actor: admin });
    const ll = await St.listLeads({ status: 'respondida' });
    check('se gestiona y se filtra', ll.leads.length === 1 && ll.counts.respondida === 1 && ll.leads[0].handledByName === 'Admin Central');
    check('la tabla de solicitudes no guarda IP', !(await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'PlatformSiteLead'`)).rows.some(r => /ip|agent/i.test(r.column_name)));

    await St.recordVisit('/', { firstToday: true }); await St.recordVisit('/', {}); await St.recordVisit('/condiciones', { firstToday: true });
    const stats = await St.visitStats(30);
    check('visitas por día y página, sin datos personales', stats.totals.views === 3 && stats.totals.visitors === 2 && stats.pages[0].path === '/' && stats.pages[0].views === 2);

    const ev = await St.events(200);
    for (const a of ['site_created', 'draft_saved', 'review_approved', 'published', 'rolled_back', 'version_restored_to_draft', 'config_updated', 'member_granted', 'member_removed', 'lead_updated']) check(`bitácora: ${a}`, ev.some(e => e.action === a));
    check('ninguna fila nueva en la tabla de clubes', (await db.query(`SELECT COUNT(*)::int n FROM "Club" WHERE type = 'platform' OR name ILIKE '%Club Platform%'`)).rows[0].n === 0);
    console.log(`✓ [test-platform-site] integración: ${m} comprobaciones.`);
} finally {
    await db.pool.end().catch(() => {});
}
