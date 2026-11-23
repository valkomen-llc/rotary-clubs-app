#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Sitio web de Club Platform — de punta a punta (v4.1348.0)
//   DATABASE_URL='postgresql://postgres@localhost:5433/rot?sslmode=disable&host=/tmp' node scripts/test-platform-site-e2e.mjs [carpeta-de-capturas]
//
// Base LOCAL, las rutas REALES por HTTP con tokens reales y, si existe
// `dist/`, el navegador sobre el build real:
//   · la matriz de permisos por HTTP (sin sesión, club, editor, revisor, central);
//   · el borrador no se filtra: lo público responde 404 hasta publicar Y activar;
//   · vista previa firmada, formulario, visitas, sitemap y robots;
//   · en el navegador: crear el sitio desde el panel, editar, guardar, vista
//     previa en escritorio/tableta/móvil, publicar, activar y ver el sitio en
//     `clubplatform.org` sin desbordes horizontales ni errores de consola.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const url = process.env.DATABASE_URL || '';
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) { console.error('DATABASE_URL parece de un entorno real. Abortando.'); process.exit(1); }

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SHOTS = process.argv[2] || '';
const require = createRequire(import.meta.url);
const { default: express } = await import('express');
const { default: jwt } = await import('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const { JWT_SECRET, PLATFORM_AUDIENCE } = await import(`${REPO}/server/middleware/auth.js`);
const { PLATFORM_SITE_TABLES } = await import(`${REPO}/server/lib/ensurePlatformSiteSchema.js`);
const { resetLiveSiteCache, platformDocument, platformRobots } = await import(`${REPO}/server/lib/platformSiteServe.js`);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };

// ── Base mínima ──────────────────────────────────────────────────────
for (const t of PLATFORM_SITE_TABLES) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
await db.query(`DROP TABLE IF EXISTS "User", "Club" CASCADE`);
await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT UNIQUE, role TEXT, name TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY, name TEXT, logo TEXT, domain TEXT, type TEXT, status TEXT)`);
await db.query(`INSERT INTO "User" (id, email, role, name, "clubId") VALUES ('u-admin', 'central@ejemplo.org', 'administrator', 'Admin Central', NULL), ('u-ed', 'editora@ejemplo.org', 'editor', 'Editora', 'club-1'), ('u-rev', 'revisor@ejemplo.org', 'editor', 'Revisor', 'club-1'), ('u-club', 'club@ejemplo.org', 'club_admin', 'Admin de Club', 'club-1'), ('u-local', 'local@ejemplo.org', 'administrator', 'Administrador local', 'club-1')`);
await db.query(`INSERT INTO "Club" (id, name, logo, domain, type, status) VALUES ('club-1', 'Rotary Club Ejemplo', NULL, 'rotaryejemplo.org', 'club', 'active'), ('club-2', 'Distrito Ejemplo', NULL, 'distritoejemplo.org', 'district', 'active')`);

const token = (u) => jwt.sign(u, JWT_SECRET, { audience: PLATFORM_AUDIENCE, expiresIn: '1h' });
const T = {
    admin: token({ id: 'u-admin', email: 'central@ejemplo.org', role: 'administrator', name: 'Admin Central' }),
    ed: token({ id: 'u-ed', email: 'editora@ejemplo.org', role: 'editor', name: 'Editora', clubId: 'club-1' }),
    rev: token({ id: 'u-rev', email: 'revisor@ejemplo.org', role: 'editor', name: 'Revisor', clubId: 'club-1' }),
    club: token({ id: 'u-club', email: 'club@ejemplo.org', role: 'club_admin', clubId: 'club-1' }),
    local: token({ id: 'u-local', email: 'local@ejemplo.org', role: 'administrator', clubId: 'club-1' }),
    portal: jwt.sign({ id: 'x', role: 'administrator' }, JWT_SECRET, { audience: 'project-fair-portal' }),
};

// ── Servidor: las rutas reales + el `dist` con el head resuelto ──────
const { default: router } = await import(`${REPO}/server/routes/platform-site.js`);
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '5mb' }));
app.use('/api/platform-site', router);
app.get('/api/platform-config/ping', (_q, r) => r.json({ status: 'ok' }));
app.get('/api/clubs/by-domain', (_q, r) => r.json({ id: 'origen', name: 'Club Platform', subdomain: 'origen', status: 'active', type: 'club', colors: {}, social: [] }));
app.get('/api/admin/stats', (_q, r) => r.json({}));
app.all('/api/*', (_q, r) => r.json({}));
const DIST = `${REPO}/dist`;
const hasDist = existsSync(`${DIST}/index.html`);
if (hasDist) {
    app.get('/robots.txt', async (q, r) => { const own = await platformRobots(q.hostname); r.type('text/plain').send(own || 'User-agent: *\nAllow: /\n'); });
    app.use(express.static(DIST, { index: false }));
    app.get('*', async (q, r) => {
        const html = readFileSync(`${DIST}/index.html`, 'utf8');
        const own = await platformDocument({ html, host: q.hostname, path: q.path });
        r.type('html').send(own ? own.html : html);
    });
}
const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
const PORT = server.address().port;
const B = `http://127.0.0.1:${PORT}/api/platform-site`;
const call = async (path, { method = 'GET', t, body } = {}) => {
    const r = await fetch(`${B}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* xml / txt */ }
    return { status: r.status, json, text, headers: r.headers };
};

let failed = false;
try {
    console.log('\n— Permisos por HTTP —');
    ok((await call('/admin')).status === 401, 'sin sesión: 401');
    ok((await call('/admin', { t: T.portal })).status === 403, 'un token de otro portal (otra audiencia): 403');
    ok((await call('/admin', { t: T.club })).status === 403, 'el administrador de un club: 403');
    ok((await call('/admin', { t: T.local })).status === 403, 'el «administrator» LOCAL de un club: 403');
    ok((await call('/admin/create', { method: 'POST', t: T.club })).status === 403, 'y no puede crear el sitio');
    const empty = await call('/admin', { t: T.admin });
    ok(empty.status === 200 && empty.json.exists === false && empty.json.role === 'admin', 'el administrador central ve «todavía no existe»');
    ok((await call('/public?path=/')).status === 404, 'sin sitio, lo público responde 404');
    const created = await call('/admin/create', { method: 'POST', t: T.admin });
    ok(created.status === 201 && created.json.status === 'draft' && created.json.draftVersion === 1, 'crear: 201, en borrador');
    ok((await call('/admin/create', { method: 'POST', t: T.admin })).status === 200, 'crear de nuevo no duplica (200)');
    ok((await call('/public?path=/')).status === 404, 'el BORRADOR no se filtra a lo público');
    ok((await call('/public/sitemap.xml')).status === 404 && (await call('/public/robots.txt')).text === 'User-agent: *\nDisallow: /\n', 'sin sitio en vivo: sin sitemap y robots cerrado');

    ok((await call('/admin/members', { method: 'POST', t: T.admin, body: { email: 'editora@ejemplo.org', role: 'editor' } })).status === 200, 'el central concede «editor»');
    ok((await call('/admin/members', { method: 'POST', t: T.admin, body: { email: 'revisor@ejemplo.org', role: 'reviewer' } })).status === 200, 'y «revisor»');
    ok((await call('/admin/members', { method: 'POST', t: T.ed, body: { email: 'club@ejemplo.org', role: 'editor' } })).status === 403, 'un editor NO concede accesos');
    const asEd = await call('/admin', { t: T.ed });
    ok(asEd.status === 200 && asEd.json.role === 'editor' && !asEd.json.abilities.includes('publish'), 'la editora entra con su rol');
    const draft = asEd.json.draft; draft.pages[0].blocks[0].content.title = 'Título de la editora';
    draft.pages[0].blocks.find(b => b.type === 'solutions').content.items[0].verified = true;
    draft.pages[0].blocks.find(b => b.type === 'sites').content.siteIds = ['club-1'];
    ok((await call('/admin/draft', { method: 'PUT', t: T.rev, body: { site: draft, baseVersion: 1 } })).status === 403, 'el revisor NO edita');
    const saved = await call('/admin/draft', { method: 'PUT', t: T.ed, body: { site: draft, baseVersion: 1 } });
    ok(saved.status === 200 && saved.json.draftVersion === 2 && saved.json.unpublishedChanges, 'la editora guarda el borrador');
    ok((await call('/admin/draft', { method: 'PUT', t: T.ed, body: { site: draft, baseVersion: 1 } })).json.code === 'SITE_CONFLICT', 'guardar sobre versión vieja: 409 SITE_CONFLICT');
    const bad = structuredClone(draft); bad.pages.push({ title: 'Admin', slug: 'admin', blocks: [{ type: 'text', content: { title: 'x' } }] });
    ok((await call('/admin/draft', { method: 'PUT', t: T.ed, body: { site: bad, baseVersion: 2 } })).status === 400, 'una página en «/admin» se rechaza');
    const xss = structuredClone(draft); xss.pages[0].blocks[0].content.title = '<img src=x onerror=alert(1)>'; xss.settings.footer.links = [{ label: 'x', action: { type: 'external', target: 'javascript:alert(1)' } }];
    const sx = await call('/admin/draft', { method: 'PUT', t: T.ed, body: { site: xss, baseVersion: 2 } });
    ok(sx.status === 200 && sx.json.draft.settings.footer.links.length === 0, 'un enlace javascript: se descarta al guardar');
    await call('/admin/draft', { method: 'PUT', t: T.ed, body: { site: draft, baseVersion: 3 } });

    ok((await call('/admin/publish', { method: 'POST', t: T.ed, body: { baseVersion: 4 } })).status === 403, 'la editora NO publica');
    ok((await call('/admin/publish', { method: 'POST', t: T.admin, body: { baseVersion: 4 } })).json.code === 'REVIEW_REQUIRED', 'ni el central publica sin revisión (es obligatoria)');
    ok((await call('/admin/review/decide', { method: 'POST', t: T.ed, body: { decision: 'approved', baseVersion: 4 } })).status === 403, 'la editora no se aprueba a sí misma');
    ok((await call('/admin/review/submit', { method: 'POST', t: T.ed, body: { baseVersion: 4 } })).json.review.status === 'in_review', 'envía a revisión');
    ok((await call('/admin/review/decide', { method: 'POST', t: T.rev, body: { decision: 'changes_requested', baseVersion: 4 } })).status === 400, 'pedir cambios exige decir cuáles');
    ok((await call('/admin/review/decide', { method: 'POST', t: T.rev, body: { decision: 'approved', baseVersion: 4, note: 'ok' } })).json.review.status === 'approved', 'el revisor aprueba');
    ok((await call('/admin/rollback', { method: 'POST', t: T.rev, body: { version: 1, note: 'x' } })).status === 403 && (await call('/admin/config', { method: 'PUT', t: T.ed, body: { publicLive: true } })).status === 403, 'revertir y el dominio: sólo el central');
    const pub = await call('/admin/publish', { method: 'POST', t: T.admin, body: { baseVersion: 4, note: 'Primera versión' } });
    ok(pub.status === 200 && pub.json.publishedVersion === 1 && pub.json.status === 'published_private', 'el central publica: versión 1, dominio aún sin activar');
    ok((await call('/public?path=/')).status === 404, 'PUBLICADO pero sin activar: lo público sigue en 404');

    console.log('\n— Vista previa, activación y lo público —');
    const pt = (await call('/admin/preview-token', { method: 'POST', t: T.rev })).json.token;
    const pv = await call(`/public?path=/&t=${encodeURIComponent(pt)}`);
    ok(pv.status === 200 && pv.json.preview === true && pv.headers.get('x-robots-tag') === 'noindex, nofollow' && pv.headers.get('cache-control') === 'no-store', 'vista previa con token: borrador, sin caché y sin indexar');
    ok((await call('/public?path=/&t=1.abc')).status === 404, 'un token inventado no abre nada');
    ok((await call('/public/lead', { method: 'POST', body: { name: 'Ana', email: 'ana@ejemplo.org', consent: true, t: pt } })).json.preview === true && (await db.query(`SELECT COUNT(*)::int n FROM "PlatformSiteLead"`)).rows[0].n === 0, 'el formulario se prueba en vista previa SIN guardar nada');
    ok((await call('/admin/config', { method: 'PUT', t: T.admin, body: { publicLive: true } })).status === 400, 'activar el dominio exige confirmarlo por escrito');
    const liveR = await call('/admin/config', { method: 'PUT', t: T.admin, body: { publicLive: true, confirmHost: 'clubplatform.org' } });
    ok(liveR.status === 200 && liveR.json.status === 'live', 'con la confirmación, el sitio queda en vivo');
    resetLiveSiteCache();
    const home = await call('/public?path=/');
    ok(home.status === 200 && home.json.preview === false && home.json.page.blocks[0].data.title === 'Título de la editora', 'lo público sirve la versión PUBLICADA');
    ok(home.json.page.blocks.find(b => b.type === 'solutions').data.items.length === 1, 'sólo la capacidad verificada');
    const sitesBlock = home.json.page.blocks.find(b => b.type === 'sites');
    ok(sitesBlock.data.sites.length === 1 && JSON.stringify(Object.keys(sitesBlock.data.sites[0]).sort()) === '["id","kind","logo","name","url"]', 'del club mostrado sólo salen datos públicos');
    ok(!JSON.stringify(home.json).match(/draftVersion|updatedBy|reviewNote|editora@|central@/), 'la respuesta pública no lleva datos del panel');
    ok((await call('/public?path=/no-existe')).json.notFound === true, 'una página que no existe: 404 con su motivo');
    ok(/<loc>https:\/\/clubplatform\.org\/<\/loc>/.test((await call('/public/sitemap.xml')).text) && /Sitemap:/.test((await call('/public/robots.txt')).text), 'en vivo: sitemap y robots abiertos');

    ok((await call('/public/lead', { method: 'POST', body: { name: 'Ana', email: 'mal', consent: true } })).status === 400 && (await call('/public/lead', { method: 'POST', body: { name: 'Ana', email: 'ana@ejemplo.org' } })).status === 400, 'el formulario valida correo y autorización');
    ok((await call('/public/lead', { method: 'POST', body: { name: 'Robot', email: 'r@ejemplo.org', consent: true, website: 'http://spam' } })).json.ok && (await db.query(`SELECT COUNT(*)::int n FROM "PlatformSiteLead"`)).rows[0].n === 0, 'la trampa para robots no guarda');
    for (let i = 0; i < 3; i++) await call('/public/lead', { method: 'POST', body: { name: 'Ana', email: 'ana@ejemplo.org', organization: 'Rotary X', message: `Hola ${i}`, consent: true } });
    ok((await call('/public/lead', { method: 'POST', body: { name: 'Ana', email: 'ana@ejemplo.org', consent: true } })).status === 429, 'freno: más de tres solicitudes por hora desde un correo');
    ok((await call('/admin/leads', { t: T.rev })).status === 403 && (await call('/admin/leads', { t: T.ed })).json.leads.length === 3, 'las solicitudes las ve quien las gestiona, no el revisor');
    await call('/public/visit', { method: 'POST', body: { path: '/', first: true } });
    await call('/public/visit', { method: 'POST', t: T.admin, body: { path: '/', first: true } });
    await call('/public/visit', { method: 'POST', body: { path: '/inventada', first: true } });
    const stats = (await call('/admin/stats', { t: T.admin })).json;
    ok(stats.totals.views === 1 && stats.totals.visitors === 1, 'visitas: cuenta la pública; no la del panel ni una ruta inventada');

    const d2 = (await call('/admin', { t: T.admin })).json;
    d2.draft.pages[0].blocks[0].content.title = 'Publicación con error';
    await call('/admin/draft', { method: 'PUT', t: T.admin, body: { site: d2.draft, baseVersion: d2.draftVersion } });
    await call('/admin/review/decide', { method: 'POST', t: T.admin, body: { decision: 'approved', baseVersion: d2.draftVersion + 1 } });
    await call('/admin/publish', { method: 'POST', t: T.admin, body: { baseVersion: d2.draftVersion + 1 } });
    ok((await call('/public?path=/')).json.page.blocks[0].data.title === 'Publicación con error', 'una segunda publicación llega al público');
    ok((await call('/admin/rollback', { method: 'POST', t: T.admin, body: { version: 1 } })).status === 400, 'revertir exige motivo');
    const rb = await call('/admin/rollback', { method: 'POST', t: T.admin, body: { version: 1, note: 'Error en el título' } });
    ok(rb.json.publishedVersion === 3 && (await call('/public?path=/')).json.page.blocks[0].data.title === 'Título de la editora', 'REVERSIÓN: el público vuelve a la versión 1');
    const vers = (await call('/admin/versions', { t: T.rev })).json.versions;
    ok(vers.length === 3 && vers[0].restoredFrom === 1, 'el historial conserva las tres versiones');
    const ms = (await call('/admin/members', { t: T.admin })).json.members;
    await call(`/admin/members/${ms.find(x => x.role === 'editor').id}`, { method: 'DELETE', t: T.admin });
    ok((await call('/admin', { t: T.ed })).status === 403, 'retirar el acceso surte efecto en el acto, con el mismo token');
    ok((await db.query(`SELECT COUNT(*)::int n FROM "Club"`)).rows[0].n === 2, 'la tabla de clubes quedó intacta');

    // ── Navegador ────────────────────────────────────────────────────
    if (!hasDist) { console.log('\n(Sin dist/: se omite el navegador. Corre `npm run build`.)'); }
    else {
        console.log('\n— Navegador sobre el build real —');
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP clubplatform.org 127.0.0.1, MAP www.clubplatform.org 127.0.0.1, MAP app.clubplatform.org 127.0.0.1, MAP rotaryejemplo.org 127.0.0.1`] });
        if (SHOTS) mkdirSync(SHOTS, { recursive: true });
        const errors = [];
        const open = async (viewport, scale = 1) => {
            const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale });
            const page = await ctx.newPage();
            page.on('pageerror', e => errors.push(`${page.url()} → ${e.message}`));
            await page.route(/googletagmanager|google-analytics|fonts\.g/, r => r.abort());
            return { ctx, page };
        };
        const noOverflow = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        const PUB = `http://clubplatform.org:${PORT}`; const APP = `http://app.clubplatform.org:${PORT}`;

        // Sitio público, en vivo.
        for (const [name, vp] of [['escritorio', { width: 1440, height: 900 }], ['tableta', { width: 820, height: 1100 }], ['movil', { width: 390, height: 844 }]]) {
            const { ctx, page } = await open(vp, SHOTS ? 2 : 1);
            await page.goto(`${PUB}/`, { waitUntil: 'networkidle' });
            await page.waitForSelector('[data-block="hero"] h1');
            ok((await page.textContent('h1')).includes('Título de la editora') && await noOverflow(page), `sitio público en ${name} (${vp.width}px): portada y sin desborde horizontal`);
            if (name === 'escritorio') {
                ok(page.url() === `${PUB}/`, 'clubplatform.org YA NO redirige al panel: muestra el sitio');
                ok(await page.locator('h1').count() === 1 && await page.locator('main#contenido').count() === 1 && await page.locator('a[href="#contenido"]').count() === 1, 'un solo h1, <main> y «Saltar al contenido»');
                ok((await page.title()).includes('Club Platform') && (await page.locator('link[rel="canonical"]').getAttribute('href')) === 'https://clubplatform.org/', 'título y canónica del sitio');
                ok(await page.locator('[data-block="solutions"] li').count() === 1 && await page.locator('[data-block="sites"] a[href="https://rotaryejemplo.org"]').count() === 1, 'una capacidad verificada y el sitio elegido');
                ok(await page.locator('img:not([alt])').count() === 0, 'ninguna imagen sin alt');
                const raw = await (await fetch(`http://127.0.0.1:${PORT}/`, { headers: { 'X-Forwarded-Host': 'clubplatform.org' } })).text();
                ok(raw.includes('<link rel="canonical" href="https://clubplatform.org/">') && raw.includes('application/ld+json') && raw.includes('og:title'), 'SIN JavaScript: el head ya viene resuelto del servidor');
                await page.fill('form input[autocomplete="name"]', 'Visitante'); await page.fill('form input[type="email"]', 'visitante@ejemplo.org'); await page.check('form input[type="checkbox"]');
                await page.click('form button[type="submit"]'); await page.waitForSelector('[role="status"]');
                ok((await db.query(`SELECT COUNT(*)::int n FROM "PlatformSiteLead" WHERE email = 'visitante@ejemplo.org'`)).rows[0].n === 1, 'el formulario real guarda la solicitud');
            }
            if (name === 'movil') { await page.click('button[aria-controls="menu-movil"]'); ok(await page.locator('#menu-movil a').count() >= 3, 'menú móvil accesible'); await page.keyboard.press('Escape'); }
            if (name === 'escritorio') ok(await page.locator('text=Vista previa:').count() === 0, 'el público no ve avisos de edición');
            // Las secciones aparecen al entrar en pantalla: se recorre la página antes de capturarla.
            await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); });
            await page.waitForTimeout(900);
            if (SHOTS) await page.screenshot({ path: `${SHOTS}/publico-${name}.png`, fullPage: true });
            await ctx.close();
        }

        // Aislamiento: el sitio de un club no cambia, y el panel sigue en su host.
        { const { ctx, page } = await open({ width: 1280, height: 800 });
            await page.goto(`http://rotaryejemplo.org:${PORT}/`, { waitUntil: 'networkidle' });
            ok(await page.locator('[data-block="hero"]').count() === 0, 'el sitio de un club NO muestra el sitio institucional');
            await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
            ok(page.url().startsWith(APP) && await page.locator('input[type="password"]').count() === 1 && await page.locator('[data-block="hero"]').count() === 0, 'app.clubplatform.org sigue mostrando el acceso al panel');
            await ctx.close(); }

        // Desactivado: el dominio vuelve a llevar al panel.
        await call('/admin/config', { method: 'PUT', t: T.admin, body: { publicLive: false } }); resetLiveSiteCache();
        { const { ctx, page } = await open({ width: 1280, height: 800 });
            await page.route(/app\.clubplatform\.org/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>panel</title>' }));
            await page.goto(`${PUB}/`); await page.waitForURL(/app\.clubplatform\.org/, { timeout: 15000 });
            ok(true, 'con el sitio DESACTIVADO, clubplatform.org lleva al panel como antes');
            await ctx.close(); }

        // El módulo del panel.
        { const { ctx, page } = await open({ width: 1440, height: 950 }, SHOTS ? 2 : 1);
            await page.addInitScript(([t]) => { localStorage.setItem('rotary_token', t); localStorage.setItem('rotary_user', JSON.stringify({ id: 'u-admin', email: 'central@ejemplo.org', role: 'administrator', name: 'Admin Central' })); localStorage.setItem('rotary_club', JSON.stringify({ onboardingCompleted: true })); }, [T.admin]);
            page.on('dialog', d => d.accept('Cambio desde la prueba'));
            await page.goto(`${APP}/admin/sitio-institucional`, { waitUntil: 'networkidle' });
            await page.waitForSelector('text=Vista general');
            ok(await page.locator('text=Institucional / Plataforma').count() === 1 && await page.locator('text=Estado de conexión del dominio').count() === 1 && await page.locator('text=Versión publicada').count() >= 1, 'Resumen: tipo, estado, dominio, versiones, responsable, SEO');
            if (SHOTS) await page.screenshot({ path: `${SHOTS}/panel-resumen.png`, fullPage: true });
            await page.click('[role="tab"]:has-text("Páginas y contenido")');
            await page.waitForSelector('text=Contenedores');
            const titleInput = page.locator('label:text-is("Título") + input').first();
            await titleInput.fill('Editado desde el panel');
            ok(await page.locator('text=cambios sin guardar').count() === 1, 'editar marca «cambios sin guardar»');
            if (SHOTS) await page.screenshot({ path: `${SHOTS}/panel-editor.png`, fullPage: true });
            await page.click('button:has-text("Guardar borrador")'); await page.waitForSelector('text=borrador con cambios sin publicar');
            ok((await call('/admin', { t: T.admin })).json.draft.pages[0].blocks[0].content.title === 'Editado desde el panel', 'guardar desde el panel escribe el borrador');
            ok((await call('/admin', { t: T.admin })).json.hasPublished && (await db.query(`SELECT published->'pages'->0->'blocks'->0->'content'->>'title' t FROM "PlatformSite"`)).rows[0].t === 'Título de la editora', 'y lo publicado no cambió');
            await page.click('[role="tab"]:has-text("Vista previa")');
            const frame = page.frameLocator('iframe[title^="Vista previa"]');
            await frame.locator('h1').waitFor({ timeout: 20000 });
            ok((await frame.locator('h1').textContent()).includes('Editado desde el panel') && await frame.locator('text=Vista previa del BORRADOR').count() === 1, 'la vista previa muestra el BORRADOR, con su aviso');
            for (const dev of ['Tableta', 'Móvil']) { await page.click(`button[aria-pressed]:has-text("${dev}")`); await page.frameLocator('iframe[title^="Vista previa"]').locator('h1').waitFor(); }
            ok((await page.locator('iframe[title^="Vista previa"]').evaluate(el => el.getBoundingClientRect().width)) === 390, 'vista previa en ancho de móvil (390 px)');
            if (SHOTS) await page.screenshot({ path: `${SHOTS}/panel-vista-previa-movil.png`, fullPage: true });
            for (const [tab, text, shot] of [['Diseño', 'Pie de página', 'panel-diseno'], ['SEO', 'SEO por página', 'panel-seo'], ['Dominio', 'Activación del sitio público', 'panel-dominio'], ['Versiones', 'Versiones publicadas', 'panel-versiones'], ['Solicitudes', 'Solicitudes de información', 'panel-solicitudes'], ['Accesos', 'Accesos al sitio institucional', 'panel-accesos']]) {
                await page.click(`[role="tablist"][aria-label="Secciones del módulo"] [role="tab"]:has-text("${tab}")`); await page.waitForSelector(`text=${text}`);
                await page.waitForLoadState('networkidle');
                if (SHOTS) await page.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: true });
            }
            ok(true, 'las pestañas Diseño, SEO, Dominio, Versiones, Solicitudes y Accesos cargan');
            await ctx.close(); }

        // Sin acceso: el panel lo dice.
        { const { ctx, page } = await open({ width: 1280, height: 800 });
            await page.addInitScript(([t]) => { localStorage.setItem('rotary_token', t); localStorage.setItem('rotary_user', JSON.stringify({ id: 'u-club', email: 'club@ejemplo.org', role: 'club_admin', clubId: 'club-1' })); localStorage.setItem('rotary_club', JSON.stringify({ onboardingCompleted: true })); }, [T.club]);
            await page.goto(`${APP}/admin/sitio-institucional`, { waitUntil: 'networkidle' });
            await page.waitForSelector('text=No tienes acceso al sitio institucional');
            ok(await page.locator('text=Vista general').count() === 0, 'el administrador de un club ve «No tienes acceso», no el módulo');
            await ctx.close(); }

        ok(errors.length === 0, `sin errores de JavaScript en el navegador${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
        await browser.close();
    }
    console.log(`\n✓ [test-platform-site-e2e] ${n} comprobaciones.`);
} catch (e) {
    failed = true; console.error('\n✗', e.message); console.error(e.stack?.split('\n').slice(1, 4).join('\n'));
} finally {
    server.close(); await db.pool.end().catch(() => {});
    process.exit(failed ? 1 : 0);
}
