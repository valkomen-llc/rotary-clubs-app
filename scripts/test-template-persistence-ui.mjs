#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Persistencia del Editor Visual de Plantillas, de punta a punta — v4.1235
//
// El editor REAL en Chromium, montado con las mismas props que le pasa
// Rotary en Acción. Cada llamada a /api del navegador se atiende con los
// CONTROLADORES REALES contra un Postgres REAL, y entre "visitas" se simula un
// arranque en frío del servidor (que era lo que borraba lo guardado).
//
// Por cada canal (Rotary en Acción, Directorio de Clubes, Feria de Proyectos):
//   abrir → editar asunto, texto con negrilla, agregar y reordenar un bloque →
//   «Guardar y Sincronizar» → arranque en frío → recargar → todo sigue ahí.
// Además: autoguardado, salir con cambios (guardar / descartar), cierre de la
// pestaña con cambios, desmontaje sin pasar por «Volver», correo de prueba con
// la versión persistida y error de guardado sin perder lo editado.
//
//   TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/base_vacia \
//     node scripts/test-template-persistence-ui.mjs
//
// ¡Borra y recrea las tablas de marketing de esa base! Pide playwright y
// esbuild; sin TEST_DATABASE_URL o sin ellos se omite.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync } from 'node:fs';

if (!process.env.TEST_DATABASE_URL) {
  console.log('test-template-persistence-ui: omitida (define TEST_DATABASE_URL con una base de prueba).');
  process.exit(0);
}
let chromium, build;
try {
  ({ chromium } = await import('playwright'));
  ({ build } = await import('esbuild'));
} catch {
  console.log('test-template-persistence-ui: falta playwright o esbuild, se omite.');
  process.exit(0);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { default: db } = await import('../server/lib/db.js');
const { ensureTemplateSchema } = await import('../server/lib/contentActivationTemplates.js');
const ctrl = await import('../server/controllers/rotaryMarketingController.js');

let ok = 0;
const malos = [];
const check = (nombre, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { malos.push(nombre); console.log(`  ✗ ${nombre}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = (t) => console.log(`\n── ${t} ──`);

let arranques = 0;
const arranqueEnFrio = async () => {
  arranques++;
  const mod = await import(`../server/lib/ensureRotaryMarketingSchema.js?ui=${arranques}`);
  await mod.ensureRotaryMarketingSchema();
};
const llamar = async (handler, req) => {
  const res = {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  await handler({ user: { id: 'u-test', role: 'superadmin' }, params: {}, query: {}, body: {}, headers: {}, ...req }, res);
  return res;
};
const fila = async (id) => (await db.query(`SELECT * FROM "RotaryMarketingCampaign" WHERE id=$1`, [id])).rows[0];
const asObj = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

// ── Base limpia ───────────────────────────────────────────────────────────
for (const t of ['RotaryMarketingCampaign', 'RotaryMarketingGlobalBlock', 'ContentActivationTemplate', 'ContentActivationTemplateVersion']) {
  await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
}
await ensureTemplateSchema();
await arranqueEnFrio();

// ── El editor, montado como en Rotary en Acción ───────────────────────────
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import VisualTemplateEditor from './src/components/admin/email-marketing/VisualTemplateEditor';
import { normalizeInstitutionalDesign, createChannelCampaignDesign } from './src/lib/emailBlocks';
window.go = async (campId) => {
  const r = await fetch('/api/rotary-en-accion/marketing/campaigns');
  const data = await r.json();
  const c = data.campaigns.find((x) => x.id === campId);
  window.__closed = false; window.__saved = null; window.__autosaved = 0;
  const root = createRoot(document.getElementById('root'));
  window.__unmount = () => root.unmount();
  const conProveedores = (hijo) => React.createElement(MemoryRouter, null,
    React.createElement(AuthProvider, null,
      React.createElement(ClubProvider, null,
        React.createElement(LanguageProvider, null, hijo))));
  root.render(conProveedores(React.createElement(React.Fragment, null,
    React.createElement(Toaster),
    React.createElement(VisualTemplateEditor, {
      campaignContext: c,
      initialDesign: normalizeInstitutionalDesign(c.design
        ? (typeof c.design === 'string' ? JSON.parse(c.design) : c.design)
        : createChannelCampaignDesign(c.initiative || 'rotary_en_accion', c)),
      initialName: '[' + (c.code || '').toUpperCase() + '] ' + c.name,
      initialSubject: c.subject,
      initialPreheader: c.preheader,
      onSave: (s) => { window.__saved = s; },
      onAutoSaved: () => { window.__autosaved++; },
      onClose: () => { window.__closed = true; root.unmount(); },
    }))));
};
`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-test"' },
  jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

const abrir = async (campId, { falla = false } = {}) => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const log = [];
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('dialog', (d) => { log.push({ dialog: d.type(), msg: d.message() }); page.__dialog?.(d); });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    if (url.pathname === '/api/rotary-en-accion/marketing/campaigns') {
      const r = await llamar(ctrl.getCampaigns, { query: { ...Object.fromEntries(url.searchParams), clubId: 'club-test' } });
      return route.fulfill({ status: r.statusCode, json: r.body });
    }
    const m = url.pathname.match(/^\/api\/rotary-en-accion\/marketing\/campaigns\/([^/]+)\/apply-template$/);
    if (m) {
      log.push({ req: 'apply-template', body, keepalive: !body.html });
      if (falla) return route.fulfill({ status: 500, json: { error: 'falla simulada del servidor' } });
      const r = await llamar(ctrl.applyCampaignTemplate, { params: { id: decodeURIComponent(m[1]) }, body });
      return route.fulfill({ status: r.statusCode, json: JSON.parse(JSON.stringify(r.body)) });
    }
    if (url.pathname === '/api/rotary-en-accion/marketing/templates/test-email') {
      log.push({ req: 'test-email', body });
      return route.fulfill({ json: { ok: true, messageId: 'msg-test', timestamp: new Date().toISOString() } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route('http://localhost/', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
  await page.goto('http://localhost/');
  await page.evaluate(() => localStorage.setItem('rotary_token', 't-test'));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate((id) => window.go(id), campId);
  try {
    await page.getByText('Guardar y Sincronizar').first().waitFor({ state: 'attached', timeout: 15000 });
  } catch (e) {
    console.log('  (no abrió el editor)', errores.join(' | '), (await page.content()).slice(0, 600));
    throw e;
  }
  return { page, log, errores };
};
const estado = (page) => page.locator('[role="status"]').first().innerText().catch(() => '');
const clic = (loc) => loc.dispatchEvent('click');
const asunto = (page) => page.locator('input[placeholder="Asunto llamativo del correo..."]');
const preheader = (page) => page.locator('input[placeholder^="Texto secundario"]');
const esperar = async (page, fn, arg, ms = 10000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const ordenDom = (page) => page.$$eval('[data-block-id]', (els) => els.map((e) => e.getAttribute('data-block-id')));

const CANALES = [
  { canal: 'Rotary en Acción', id: 'rmk-sem-01' },
  { canal: 'Directorio de Clubes', id: 'rmk-dir-sem-02' },
  { canal: 'Feria de Proyectos', id: 'rmk-feria-sem-01' },
];

for (const c of CANALES) {
  grupo(`${c.canal} (${c.id})`);
  let { page, errores } = await abrir(c.id);
  check('abre sin errores y «Sin cambios»', errores.length === 0 && /Sin cambios/.test(await estado(page)), `${errores.join(' | ')} · ${await estado(page)}`);

  // 1. Asunto y preheader
  await asunto(page).fill(`Asunto E2E ${c.id}`);
  await preheader(page).fill(`Preheader E2E ${c.id}`);
  check('al editar muestra «Cambios sin guardar»', /Cambios sin guardar/.test(await estado(page)), await estado(page));

  // 2. Texto enriquecido: reescribir el cuerpo y ponerlo en negrilla
  const textoId = asObj((await fila(c.id)).design).blocks.find((b) => b.type === 'text').id;
  const editable = page.locator(`div[data-text-block-id="${textoId}"]`);
  await editable.dispatchEvent('dblclick');
  await page.waitForTimeout(200);
  await editable.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(`Texto E2E ${c.id} con formato`);
  await page.keyboard.press('Control+A');
  await clic(page.locator('button[title="Negrita (Cmd+B)"]').first());
  await page.waitForTimeout(150);
  await editable.evaluate((el) => el.blur());
  await clic(page.locator('button[title="Cerrar inspector"]').first());
  await page.waitForTimeout(150);

  // 3. Agregar un bloque (Divisor) y subirlo una posición
  const antes = await ordenDom(page);
  await clic(page.locator('button', { hasText: 'DIVISOR' }).first());
  await page.waitForTimeout(200);
  const conNuevo = await ordenDom(page);
  const nuevoId = conNuevo.find((id) => !antes.includes(id));
  await clic(page.locator(`#canvas-block-${nuevoId} button[title="Subir bloque"]`).first());
  await page.waitForTimeout(200);
  const ordenEditado = await ordenDom(page);
  check('bloque nuevo agregado y reordenado en el lienzo', nuevoId && ordenEditado.indexOf(nuevoId) === ordenEditado.length - 2, ordenEditado.join(','));

  // 4. Guardar y Sincronizar
  await clic(page.getByText('Guardar y Sincronizar').first());
  check('«Guardar y Sincronizar» confirma y cierra', await esperar(page, () => window.__closed === true));
  const f = await fila(c.id);
  const d = asObj(f.design);
  const texto = d.blocks.find((b) => b.id === textoId)?.text || '';
  check('BD: asunto y preheader', f.subject === `Asunto E2E ${c.id}` && f.preheader === `Preheader E2E ${c.id}`, `${f.subject} | ${f.preheader}`);
  check('BD: texto nuevo con negrilla', texto.includes(`Texto E2E ${c.id} con formato`) && /<b>|<strong>|font-weight:\s*(bold|700)/i.test(texto), texto.slice(0, 200));
  check('BD: mismo orden de bloques que el lienzo, con el bloque nuevo', JSON.stringify(d.blocks.map((b) => b.id)) === JSON.stringify(ordenEditado));
  check('BD: contentHtml generado del diseño guardado', (f.contentHtml || '').includes(`Texto E2E ${c.id}`));
  await page.close();

  // 5. Arranque en frío + volver a entrar
  await arranqueEnFrio();
  ({ page, errores } = await abrir(c.id));
  check('tras arranque en frío: asunto y preheader en el editor', (await asunto(page).inputValue()) === `Asunto E2E ${c.id}` && (await preheader(page).inputValue()) === `Preheader E2E ${c.id}`);
  const html = await page.locator(`div[data-text-block-id="${textoId}"]`).innerHTML({ timeout: 3000 }).catch(() => '(el bloque ya no existe)');
  check('tras arranque en frío: texto con negrilla en el lienzo', html.includes(`Texto E2E ${c.id} con formato`) && /<b>|<strong>|font-weight:\s*(bold|700)/i.test(html), html.slice(0, 200));
  check('tras arranque en frío: mismo orden de bloques', JSON.stringify(await ordenDom(page)) === JSON.stringify(ordenEditado));
  check('tras arranque en frío: «Sin cambios»', /Sin cambios/.test(await estado(page)), await estado(page));
  await page.close();
}

const ID = 'rmk-sem-01';

grupo('Autoguardado con debounce');
{
  const { page } = await abrir(ID);
  await preheader(page).fill('Preheader autoguardado');
  const guardo = await esperar(page, () => window.__autosaved > 0, null, 12000);
  check('se autoguarda solo, sin pulsar Guardar', guardo && (await fila(ID)).preheader === 'Preheader autoguardado');
  check('indicador «Guardado correctamente»', /Guardado correctamente/.test(await estado(page)), await estado(page));
  check('el editor sigue abierto', !(await page.evaluate(() => window.__closed)));
  await page.close();
}

grupo('Salir con cambios: guardar');
{
  const { page, log } = await abrir(ID);
  page.__dialog = (dlg) => dlg.accept();
  await asunto(page).fill('Asunto al salir');
  await clic(page.locator('button[title="Volver"]').first());
  check('pregunta antes de salir', await esperar(page, () => window.__closed === true) && log.some((l) => l.dialog === 'confirm'));
  check('BD: guardado al salir', (await fila(ID)).subject === 'Asunto al salir');
  await page.close();
}

grupo('Salir con cambios: descartar');
{
  const { page, log } = await abrir(ID);
  let n = 0;
  page.__dialog = (dlg) => (n++ === 0 ? dlg.dismiss() : dlg.accept());
  await asunto(page).fill('Asunto descartado');
  await clic(page.locator('button[title="Volver"]').first());
  await esperar(page, () => window.__closed === true);
  await page.waitForTimeout(800);
  check('pide confirmar el descarte', log.filter((l) => l.dialog === 'confirm').length === 2);
  check('BD: lo descartado NO se guarda (ni por keepalive)', (await fila(ID)).subject === 'Asunto al salir' && !log.some((l) => l.req === 'apply-template'));
  await page.close();
}

grupo('Recargar o cerrar la pestaña con cambios');
{
  // El aviso nativo depende de heurísticas de Chrome (gesto del usuario); lo
  // que es del editor es CANCELAR el beforeunload mientras haya algo pendiente.
  const { page } = await abrir(ID);
  const cancela = () => page.evaluate(() => {
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  check('sin cambios: deja salir', (await cancela()) === false);
  await asunto(page).fill('Asunto sin guardar');
  check('con cambios: el navegador pide confirmar', (await cancela()) === true);
  await page.close();
}

grupo('Desmontaje sin pasar por «Volver» (navegación interna)');
{
  const { page, log } = await abrir(ID);
  await asunto(page).fill('Asunto por keepalive');
  await page.evaluate(() => window.__unmount());
  await page.waitForTimeout(1200);
  check('envía lo pendiente con keepalive (sin HTML; lo compila el servidor)', log.some((l) => l.req === 'apply-template' && l.keepalive));
  const f = await fila(ID);
  check('BD: guardado y con HTML compilado', f.subject === 'Asunto por keepalive' && (f.contentHtml || '').length > 500);
  await page.close();
}

grupo('Correo de prueba usa la versión persistida');
{
  const { page, log } = await abrir(ID);
  await asunto(page).fill('Asunto de prueba');
  await clic(page.locator('button[title="Enviar Correo de Prueba"]').first());
  await page.locator('input[placeholder="ejemplo@rotary.org"]').fill('socio@club.org');
  await clic(page.locator('button', { hasText: 'Enviar Prueba' }).last());
  await esperar(page, () => document.body.innerText.includes('aceptado por el proveedor'));
  const iGuardar = log.findIndex((l) => l.req === 'apply-template');
  const iPrueba = log.findIndex((l) => l.req === 'test-email');
  check('guarda ANTES de enviar la prueba', iGuardar >= 0 && iPrueba > iGuardar, JSON.stringify(log.map((l) => l.req || l.dialog)));
  const f = await fila(ID);
  check('la prueba lleva el asunto y el HTML guardados', log[iPrueba]?.body.subject === f.subject && f.subject === 'Asunto de prueba' && log[iPrueba]?.body.html === f.contentHtml);
  await page.close();
}

grupo('Error al guardar: no se pierde nada ni se cierra');
{
  const { page } = await abrir(ID, { falla: true });
  await asunto(page).fill('Asunto que falla');
  await clic(page.getByText('Guardar y Sincronizar').first());
  await page.waitForTimeout(1200);
  check('indicador «Error al guardar»', /Error al guardar/.test(await estado(page)), await estado(page));
  check('el editor sigue abierto con lo editado', !(await page.evaluate(() => window.__closed)) && (await asunto(page).inputValue()) === 'Asunto que falla');
  check('BD: sin cambios', (await fila(ID)).subject === 'Asunto de prueba');
  await page.close();
}

await browser.close();
await db.pool.end().catch(() => {});
console.log(`\n${ok} comprobaciones OK${malos.length ? `, ${malos.length} FALLAN:\n - ${malos.join('\n - ')}` : ''}`);
process.exit(malos.length ? 1 : 0);
