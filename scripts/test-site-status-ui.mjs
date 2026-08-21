// ════════════════════════════════════════════════════════════════════
// El estado «En construcción», en un navegador — v4.883
//
//   npm run test:site-status:ui
//
// El criterio puede estar bien y el defecto vivir en el camino: es la lección
// de v4.744 (`pickDistrictSite` era correcto y el fallo estaba en la ruta) y
// la de v4.737 (nadie abrió la portada de un distrito durante versiones).
// Acá se monta la APLICACIÓN REAL sobre el `dist` compilado y se navega.
//
// Pide `playwright` y `dist/`; se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('⚠ Se omite: falta playwright.  npm i --no-save playwright'); process.exit(0); }
if (!existsSync('dist/index.html')) { console.log('⚠ Se omite: no hay dist/.  npm run build'); process.exit(0); }

const TIPOS = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = createServer((req, res) => {
    const u = req.url.split('?')[0];
    let f = join('dist', u);
    if (!existsSync(f) || u === '/') f = 'dist/index.html';
    try {
        const b = readFileSync(f);
        res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const port = srv.address().port;

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

const SITIO = (status, extra = {}) => ({
    id: 'c1', name: 'Programa de Intercambios 4281', type: 'Programa de Intercambio',
    status, settings: [], colors: { primary: '#17458F' }, ...extra,
});

/** Abre una ruta con el sitio en el estado dado, opcionalmente con sesión. */
async function abrir(ruta, club, conSesion = false) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const fallos = [];
    page.on('pageerror', e => fallos.push(e.message));
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.route('**/clubs/by-domain**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(club) }));
    if (conSesion) {
        await page.addInitScript(() => {
            localStorage.setItem('rotary_token', 'x.' + btoa(JSON.stringify({
                role: 'administrator', aud: 'rotary-platform', email: 'a@b.org', exp: 4102444800,
            })) + '.y');
            localStorage.setItem('rotary_user', JSON.stringify({ role: 'administrator', name: 'A', clubId: 'c1' }));
        });
    }
    await page.goto(`http://localhost:${port}${ruta}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => { });
    await page.waitForTimeout(900);
    return { page, fallos };
}

const enConstruccion = p => p.getByText('Estamos preparando algo especial').count();

// ════════════════════════════════════════════════════════════════════
grupo('── Sitio ACTIVO: nada cambia ─────────────────────────────');
{
    const { page, fallos } = await abrir('/', SITIO('active'));
    check('la portada se pinta', (await page.locator('main').count()) > 0);
    check('NO aparece la pantalla de construcción', (await enConstruccion(page)) === 0);
    check('sin errores de render', fallos.length === 0, fallos.join(' | '));
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── Sitio EN CONSTRUCCIÓN, visitante sin sesión ───────────');
{
    const { page, fallos } = await abrir('/', SITIO('draft'));
    check('la portada NO se ve', (await enConstruccion(page)) > 0);
    check('se ve el nombre del sitio',
        (await page.getByText('Programa de Intercambios 4281').count()) > 0);
    check('hay botón de iniciar sesión', (await page.getByRole('link', { name: /iniciar sesión/i }).count()) > 0);
    // ⚠️ El menú es un mapa de lo que hay dentro.
    check('NO se ve la navegación del sitio',
        (await page.getByRole('link', { name: /^Proyectos$/ }).count()) === 0);
    check('sin errores de render', fallos.length === 0, fallos.join(' | '));
    await page.close();
}
{
    // ⚠️ El defecto concreto: el corte vivía sólo en la portada.
    const { page } = await abrir('/proyectos', SITIO('draft'));
    check('una página interna por URL directa también queda tapada', (await enConstruccion(page)) > 0);
    await page.close();
}
{
    const { page } = await abrir('/nuestra-historia', SITIO('draft'));
    check('…y cualquier otra', (await enConstruccion(page)) > 0);
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── La llave NO se queda adentro ──────────────────────────');
{
    const { page } = await abrir('/login', SITIO('draft'));
    check('el inicio de sesión se sirve igual', (await enConstruccion(page)) === 0);
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── Con sesión: el sitio COMPLETO ─────────────────────────');
{
    const { page, fallos } = await abrir('/', SITIO('draft'), true);
    check('la portada se ve', (await enConstruccion(page)) === 0);
    check('…y es la portada de verdad, no una vista previa',
        (await page.locator('main').count()) > 0);
    check('sin errores de render', fallos.length === 0, fallos.join(' | '));
    await page.close();
}
{
    const { page } = await abrir('/proyectos', SITIO('draft'), true);
    check('las páginas internas también', (await enConstruccion(page)) === 0);
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── El contacto sólo si el sitio lo tiene ─────────────────');
{
    const { page } = await abrir('/', SITIO('draft'));
    check('sin contacto configurado, no se ofrece el botón',
        (await page.getByRole('link', { name: /^Contacto$/ }).count()) === 0);
    await page.close();
}
{
    const { page } = await abrir('/', SITIO('draft', { contact: { email: 'hola@rye4281.org', phone: '' } }));
    check('con correo configurado, sí se ofrece',
        (await page.getByRole('link', { name: /^Contacto$/ }).count()) > 0);
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── Volver a Activo publica en el acto ────────────────────');
{
    // Sin migraciones ni pasos extra: es la exigencia expresa del pedido.
    const { page } = await abrir('/', SITIO('active'));
    check('el mismo sitio en «Activo» ya es público', (await enConstruccion(page)) === 0);
    await page.close();
}

await browser.close();
srv.close();

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallaron de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones en el navegador, todas bien.`);
