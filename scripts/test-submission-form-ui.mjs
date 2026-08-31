#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El formulario público de aportes SE PUEDE ESCRIBIR — v4.971
//
// Reproduce el reporte literal: «cuando empiezo a escribir me lleva a la
// parte frontal y no me deja escribir más de una letra cada casilla».
//
// Es la prueba que faltaba: el defecto de v4.969 era de COMPORTAMIENTO en
// React —un componente declarado dentro de otro remonta el árbol en cada
// render— y no lo ve el typecheck, ni `check:hooks`, ni ninguna prueba de
// criterio. Sólo se ve escribiendo MÁS DE UNA LETRA.
//
// Pide `playwright` y el `dist/` compilado; se salta sola si faltan.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('· playwright no está instalado — se salta.'); process.exit(0); }
if (!existsSync('dist/index.html')) { console.log('· no hay dist/ — se salta.'); process.exit(0); }

const EJECUTABLE = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2','.jpg':'image/jpeg' };

const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(path.resolve('dist'), u);
    if (existsSync(f) && path.extname(f)) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        return res.end(readFileSync(f));
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(path.join(path.resolve('dist'), 'index.html')));
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let pass = 0, fail = 0;
const check = (nombre, ok, detalle = '') => {
    if (ok) { pass++; console.log(`  ✓ ${nombre}`); }
    else { fail++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};

const club = { id:'c1', name:'Distrito 4281', subdomain:'d4281', domain:'localhost', type:'district', status:'active', subscriptionStatus:'active', logo:'', settings:[], primaryColor:'#0c3c7c' };
const DISTRITOS = [
    { value: '4271', label: 'Distrito 4271', clubs: ['Barrancabermeja', 'Barranquilla'] },
    { value: '4281', label: 'Distrito 4281', clubs: ['Amazonas', 'Armenia International'] },
];

const nav = await chromium.launch(EJECUTABLE ? { executablePath: EJECUTABLE } : {});
const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
// El comodín va PRIMERO: Playwright resuelve la ÚLTIMA ruta registrada antes.
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.route('**/api/clubs/by-domain**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(club) }));
await page.route('**/api/contribution-campaigns/submissions/form/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
        campaign: { id:'k1', slug:'emergencia', name:'Emergencia Terremoto Colombia 2026', title:'', badge:'EMERGENCIA', location:'Colombia', image:'', theme:{} },
        open: true, closedReason: null, headline: '', intro: '', thanksMessage: '',
        consentText: 'Autorizo…', consentIsProvisional: true,
        catalogs: { districts: DISTRITOS },
        limits: { maxFiles: 10, imageTypes: ['image/jpeg'], videoTypes: ['video/mp4'], imageMaxMb: 25, videoMaxMb: 200 },
    }),
}));

const errores = [];
page.on('pageerror', e => errores.push(String(e)));

console.log('\n── El formulario público de aportes ──');
await page.goto(`${base}/aportar-contenido/emergencia`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// ── Escribir en una casilla de texto ────────────────────────────────
const NOMBRE = 'María Fernanda Restrepo';
const campoNombre = page.locator('input[autocomplete="name"]');
check('la casilla del nombre existe', await campoNombre.count() === 1);

await campoNombre.click();
// Se escribe TECLA POR TECLA, que es como escribe una persona: con `fill()`
// el valor se pone de una vez y el defecto —perder el foco tras cada
// pulsación— no se manifestaría. Ésta es la diferencia entre reproducir el
// reporte y pasar por el motivo equivocado.
await page.keyboard.type(NOMBRE, { delay: 25 });

const valorNombre = await campoNombre.inputValue();
check('conserva TODO lo escrito, no la primera letra', valorNombre === NOMBRE,
    `quedó «${valorNombre}» de «${NOMBRE}»`);

const sigueEnfocada = await page.evaluate(() =>
    document.activeElement?.getAttribute('autocomplete') === 'name');
check('la casilla NO pierde el foco al escribir', sigueEnfocada);

// ── La página no salta al principio ─────────────────────────────────
await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(150);
const antes = await page.evaluate(() => window.scrollY);
const correo = page.locator('input[autocomplete="email"]');
await correo.click();
await page.keyboard.type('maria@clubrotario.org', { delay: 25 });
await page.waitForTimeout(150);
const despues = await page.evaluate(() => window.scrollY);
check('la página no salta al principio al escribir', despues > 50,
    `estaba en ${antes}px y quedó en ${despues}px`);
check('el correo conserva lo escrito', await correo.inputValue() === 'maria@clubrotario.org');

// ── Un área de texto larga ──────────────────────────────────────────
const HISTORIA = 'Entregamos mercados en la vereda con veinte voluntarios del club.';
const relato = page.locator('textarea').first();
await relato.click();
await page.keyboard.type(HISTORIA, { delay: 10 });
check('el área de texto conserva la frase completa', await relato.inputValue() === HISTORIA,
    `quedó «${await relato.inputValue()}»`);

// ── Los desplegables dependientes siguen funcionando ────────────────
const selects = page.locator('select');
await selects.nth(0).selectOption('4281');
await page.waitForTimeout(200);
check('elegir distrito ofrece sus clubes', (await page.locator('select').nth(1).locator('option').count()) > 2);
await page.locator('select').nth(1).selectOption('Amazonas');
check('el club elegido se conserva', await page.locator('select').nth(1).inputValue() === 'Amazonas');
check('lo escrito antes SIGUE ahí tras usar los desplegables',
    await campoNombre.inputValue() === NOMBRE);

check('sin errores de render', errores.length === 0, errores.join(' | '));

await nav.close();
server.close();

console.log(`\n${pass} comprobaciones pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
