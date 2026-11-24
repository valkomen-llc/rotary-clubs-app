#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Presentación comercial de Club Platform — EL CRITERIO (v4.1356.0)
// npm run test:presentation (en `prebuild`). Sin base ni red.
//
//   · son EXACTAMENTE seis slides, y hay un componente por cada uno;
//   · los precios vigentes y su equivalente mensual cuadran;
//   · los botones del cierre apuntan a rutas que EXISTEN en la aplicación;
//   · el <head> del servidor (lo que lee WhatsApp) dice lo mismo que la
//     configuración, sale para `/presentacion` y no deja etiquetas dobles;
//   · la ruta es pública, está registrada y reservada frente al sitio
//     institucional; la hoja de estilos trae impresión y movimiento reducido.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
const H = await import(`${REPO}/server/lib/presentationHead.js`);
const S = await import(`${REPO}/server/lib/platformSiteSpec.js`);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };

const config = read('src/config/clubPlatformPresentation.ts');
const app = read('src/App.tsx');
const css = read('src/components/presentation/presentation.css');
const api = read('api/index.js');

// ── Cinco slides ────────────────────────────────────────────────────
const ids = [...config.matchAll(/^ {12}id: '([a-z-]+)',$/gm)].map(m => m[1]);
eq(ids.length, 6, `la presentación tiene exactamente seis slides (hay ${ids.length})`);
eq(new Set(ids).size, 6, 'los identificadores de slide no se repiten');
const comps = read('src/pages/PresentacionClubPlatform.tsx').match(/SLIDE_COMPONENTS = \[([^\]]+)\]/)?.[1].split(',').map(s => s.trim()).filter(Boolean) || [];
eq(comps.length, 6, 'hay un componente por slide');

// ── Slide 6: cada logotipo existe y declara su proporción ───────────
const logos = [...config.matchAll(/src: '(\/presentacion\/logos\/[^']+)', ratio: ([\d.]+)/g)];
ok(logos.length >= 12, `el slide de la comunidad lista sus logotipos (${logos.length})`);
const { existsSync } = await import('node:fs');
for (const [, src] of logos) ok(existsSync(`${REPO}/public${src}`), `existe ${src}`);
eq(new Set(logos.map(m => m[1])).size, logos.length, 'ningún logotipo está repetido');

// ── Precios vigentes ────────────────────────────────────────────────
const cop = (v) => `$${Math.round(v).toLocaleString('de-DE')}`;
const plans = [...config.matchAll(/price: '([^']+)',\s+priceAmount: (\d+),[\s\S]*?monthly: '([^']+)'/g)].map(m => ({ price: m[1], amount: Number(m[2]), monthly: m[3] }));
eq(plans.length, 2, 'son dos planes');
eq(plans[0].amount, 1000000, 'Club Digital: $1.000.000 COP al año');
eq(plans[1].amount, 1480000, 'Club Inteligente: $1.480.000 COP al año');
for (const p of plans) {
    eq(p.price, cop(p.amount), `el precio mostrado (${p.price}) es el del monto`);
    eq(p.monthly, `${cop(Math.floor(p.amount / 12))} COP`, `el equivalente mensual de ${p.price} cuadra`);
}
ok(!/garantiza(mos)? (resultados|posicionamiento)/i.test(config.replace(/No se garantizan resultados financieros/g, '')), 'no se promete un resultado garantizado');

// ── Los botones llevan a rutas reales ───────────────────────────────
const hrefs = [...config.matchAll(/label: '[^']+',\s+href: ('([^']+)'|null)/g)].map(m => m[2] ?? null);
eq(hrefs.length, 2, 'el cierre tiene dos acciones');
for (const h of hrefs.filter(Boolean)) {
    if (/^https?:\/\//.test(h)) continue;
    ok(app.includes(`<Route path="${h}"`), `«${h}» es una ruta registrada en App.tsx`);
}

// ── WhatsApp: los botones abren el chat con el mensaje ya escrito ───
const wa = config.match(/whatsapp: '([^']+)'/)?.[1] || '';
const waDigits = wa.replace(/\D/g, '');
ok(/^57\d{10}$/.test(waDigits), `la línea de WhatsApp es un número colombiano completo (${wa})`);
const messages = [...config.matchAll(/message: '([^']+)'/g)].map(m => m[1]);
eq(messages.length, 2, 'cada botón tiene su mensaje');
ok(messages.every(m => m.includes('{club}')), 'los mensajes nombran al destinatario');
ok(/solicitar la implementación/.test(messages[0]) && /agendar una demostración/.test(messages[1]), 'cada mensaje dice lo que pide su botón');
ok(read('src/components/presentation/whatsapp.ts').includes('https://wa.me/${digits}?text=${encodeURIComponent(message)}'), 'el enlace es wa.me con el mensaje codificado');

// ── Head en el servidor ─────────────────────────────────────────────
ok(config.includes(`title: '${H.PRESENTATION_META.title}'`), 'el título del servidor es el de la configuración');
ok(config.includes(`description: '${H.PRESENTATION_META.description}'`), 'la descripción del servidor es la de la configuración');
ok(config.includes(`PRESENTATION_PATH = '${H.PRESENTATION_PATH}'`), 'la dirección es la misma en el navegador y en el servidor');
ok(H.isPresentationPath('/presentacion') && H.isPresentationPath('/presentacion/'), 'reconoce la dirección, con o sin barra final');
ok(!H.isPresentationPath('/presentaciones') && !H.isPresentationPath('/'), 'no se queda con otras direcciones');
const doc = H.renderPresentationHead(read('index.html'), { host: 'app.clubplatform.org' });
for (const tag of ['og:title', 'og:description', 'og:url', 'og:image']) eq(doc.split(`property="${tag}"`).length - 1, 1, `una sola etiqueta ${tag}`);
eq(doc.split('rel="canonical"').length - 1, 1, 'una sola canonical');
eq(doc.split('<title>').length - 1, 1, 'un solo <title>');
ok(doc.includes('href="https://app.clubplatform.org/presentacion"'), 'la canonical es la de la presentación');
ok(doc.includes('<div id="root"></div>'), 'el documento conserva la aplicación');
const evil = H.renderPresentationHead('<html><head><title>x</title></head></html>', { host: 'a"><script>', meta: { ...H.PRESENTATION_META, title: '"<b>' } });
ok(!evil.includes('"><script>') && !evil.includes('<b>'), 'los valores se escapan');
ok(api.includes("import('../server/lib/presentationHead.js')"), 'producción (api/index.js) resuelve el head con ruta literal');

// ── Ruta pública, reservada y sin avisos del panel ──────────────────
ok(app.includes('<Route path="/presentacion" element={<PresentacionClubPlatform />} />'), 'la ruta está registrada');
ok(/HIDE_BANNERS_PATHS = \[[^\]]*'\/presentacion'/.test(app), 'sin barras de aviso encima de la presentación');
ok(S.RESERVED_SLUGS.includes('presentacion'), 'el sitio institucional no puede crear una página «presentacion»');
const page = read('src/pages/PresentacionClubPlatform.tsx');
ok(!/useAuth|ProtectedRoute/.test(page), 'la página no pide sesión');

// ── Estilos: tres modos ─────────────────────────────────────────────
ok(/@page \{ size: 1600px 900px; margin: 0; \}/.test(css), 'impresión en 16:9, sin márgenes');
ok(css.includes('break-after: page'), 'un slide por página');
ok(css.includes('prefers-reduced-motion: reduce'), 'respeta «reducir movimiento»');
ok(css.includes('.cpd--flow') && css.includes('.cpd--stage'), 'composición de escenario y de flujo');
ok(!/\.cpd--(stage|flow|present)[^{]*\{[^}]*\}/.test(css.split('@media screen')[0]), 'lo propio de pantalla no gobierna la impresión');
ok([...css.matchAll(/^\s*([.#a-z][^{@]*)\{/gm)].every(m => m[1].split(',').every(sel => /cpd-|^\s*(html|body|from|to|\d+%)/.test(sel))), 'ningún selector toca algo fuera de la presentación');

// ── Guía ────────────────────────────────────────────────────────────
ok(read('CLAUDE.md').includes('docs/claude/presentacion-comercial.md'), 'CLAUDE.md enlaza la guía del módulo');

console.log(`✓ [test-presentation] ${n} comprobaciones`);
