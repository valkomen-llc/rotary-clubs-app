#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// «Inscripción a la Feria de Proyectos» en /mi-proyecto como ACORDEÓN (v4.1343)
//
// La caja real (`PaymentCallout`) en un navegador, con un pago confirmado y
// otro pendiente: minimizada por defecto con el concepto, el estado y el
// proyecto; «Ver detalle» la abre; con el pago pendiente «Pagar inscripción»
// sigue a la vista cerrada. 1280 y 390 px. Necesita playwright, esbuild y
// dist/assets (`npx vite build`); se salta sin ellos. Capturas: ACCORDION_UI_SHOT.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);
let chromium, build;
try {
    try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = require('playwright')); }
    ({ build } = await import('esbuild'));
} catch { console.log('… se salta: faltan playwright o esbuild'); process.exit(0); }
const CSS = (() => {
    try {
        const f = readdirSync(join(REPO, 'dist/assets')).find(n => /^index-.*\.css$/.test(n));
        return f ? readFileSync(join(REPO, 'dist/assets', f), 'utf8') : null;
    } catch { return null; }
})();
if (!CSS) { console.log('… se salta: falta dist/assets (correr `npx vite build`)'); process.exit(0); }
const SHOT = process.env.ACCORDION_UI_SHOT || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PaymentCallout } from './src/pages/MiProyecto';
const base = { charge: { currency: 'COP', base: 250000, total: 262500, final: true, lines: [
    { key: 'gateway', label: 'Comisión de la pasarela de pagos', percent: 0.029, amount: 7250 },
    { key: 'transfer', label: 'Traslado interbancario', percent: 0.021, amount: 5250 } ] },
    amountCop: 250000, amountUsd: null, priceMode: 'COP', receiptUrl: null, attempts: [{ n: 1, status: 'paid', label: 'Pagado', reason: null, at: '2026-10-07T17:16:00Z' }] };
const PAGADO = { ...base, state: 'paid', status: 'confirmed', statusLabel: 'Confirmado', paid: true, canPay: false, label: 'Pagado', detail: null, actionLabel: null,
    paidAt: '2026-10-07T17:16:00Z', transaction: { reference: 'Fw3dp7kmT71mLVP39b', method: 'tarjeta', amount: 262500, currency: 'COP', refundedAmount: null }, receiptUrl: 'https://pay.stripe.com/receipts/x' };
const PENDIENTE = { ...base, attempts: [], state: 'pending', status: 'pending', statusLabel: 'Pendiente', paid: false, canPay: true, label: 'Pendiente', detail: 'Tu proyecto ya está postulado. El pago de la inscripción sigue pendiente.', actionLabel: 'Pagar inscripción', paidAt: null, transaction: null };
const DOS = { ...PENDIENTE, payOptions: [
    { scope: 'all', label: 'Pagar los 2 proyectos', detail: 'Primer proyecto: Agua · Segundo proyecto: Salud', total: 367500, currency: 'COP' },
    { scope: 'first', label: 'Pagar solo el primer proyecto', detail: 'Agua. El segundo queda pendiente con su tarifa especial.', total: 262500, currency: 'COP' } ] };
const SUB = { projectName: 'Caimalito construye paz', publicRef: 'FP-6K5MAX', clubName: 'E-Club Origen' };
const APP = { publicRef: 'FP-6K5MAX', responsible: 'Leidy Avila', projectStateLabel: 'En revisión', appliedAt: '2026-10-06T20:13:00Z' };
const noop = () => {};
window.go = (cual) => createRoot(document.getElementById('root')).render(
  React.createElement('div', { style: { padding: 16 } }, React.createElement(PaymentCallout, {
    pago: cual === 'pendiente' ? PENDIENTE : cual === 'dos' ? DOS : PAGADO, application: APP, submission: SUB, registration: null,
    eventName: 'XII Rotary Project Fair Colombia 2027', bloqueo: null, onPay: (scope) => { window.__pagar = (window.__pagar || 0) + 1; window.__scope = scope; },
    onReceipt: noop, paying: false, esperando: false })));`;
const JS = (await build({ stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0"' }, jsx: 'automatic', logLevel: 'silent',
    loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' } })).outputFiles[0].text;

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
let okCount = 0; const malos = [];
const check = (name, cond, extra = '') => { if (cond) { okCount++; console.log(`  OK    ${name}`); } else { malos.push(name); console.log(`  FALLA ${name} ${extra}`); } };
const abrir = async (viewport, cual) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body>' }));
    await page.goto('http://localhost/mi-proyecto');
    await page.addStyleTag({ content: CSS });
    await page.addScriptTag({ content: JS });
    await page.evaluate((c) => window.go(c), cual);
    await page.locator('[data-inscripcion-feria]').waitFor({ timeout: 10000 });
    return { page, errores };
};
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name) => { if (SHOT) await page.locator('[data-inscripcion-feria]').screenshot({ path: join(SHOT, `${name}.png`) }); };

try {
    for (const [ancho, alto] of [[1280, 900], [390, 844]]) {
        console.log(`\n▸ Pago confirmado (${ancho} px)`);
        const { page, errores } = await abrir({ width: ancho, height: alto }, 'pagado');
        const caja = page.locator('[data-inscripcion-feria]');
        const boton = caja.getByRole('button', { name: /Inscripción a la Feria de Proyectos/ });
        check('arranca MINIMIZADA (aria-expanded=false)', await boton.getAttribute('aria-expanded') === 'false');
        check('cerrada muestra el concepto, el estado y el proyecto con su código',
            await caja.getByText('Inscripción a la Feria de Proyectos').isVisible() && await caja.getByText('Pago confirmado').first().isVisible()
            && await caja.getByText('Caimalito construye paz · FP-6K5MAX').isVisible());
        check('cerrada NO muestra el detalle (valor, cargos, transacción, comprobante)',
            !(await caja.getByText('Total pagado').isVisible()) && !(await caja.getByText('Comisión de la pasarela de pagos').isVisible())
            && !(await caja.getByRole('button', { name: /Descargar comprobante/ }).isVisible()));
        const anchoTitulo = await caja.locator('[data-inscripcion-titulo]').evaluate(el => el.getBoundingClientRect().width);
        const anchoCaja = (await caja.boundingBox())?.width || 1;
        check('el título no se aprieta contra los indicadores (≥ 70 % del ancho en el teléfono)', ancho > 640 || anchoTitulo >= anchoCaja * 0.7, `${Math.round(anchoTitulo)} de ${Math.round(anchoCaja)}`);
        const altoCerrada = (await caja.boundingBox())?.height || 0;
        await shot(page, `pagado-cerrada-${ancho}`);
        await boton.click();
        check('el clic la abre (aria-expanded=true)', await boton.getAttribute('aria-expanded') === 'true');
        check('abierta muestra todo: total, cargos, transacción y comprobante',
            await caja.getByText('Total pagado').isVisible() && await caja.getByText('$262.500 COP').isVisible()
            && await caja.getByText('…Fw3dp7kmT71mLVP39b').isVisible() && await caja.getByRole('button', { name: /Descargar comprobante/ }).isVisible());
        const altoAbierta = (await caja.boundingBox())?.height || 0;
        check('cerrada ocupa mucho menos que abierta', altoCerrada > 0 && altoCerrada < altoAbierta / 2, `${altoCerrada} vs ${altoAbierta}`);
        await shot(page, `pagado-abierta-${ancho}`);
        await boton.press('Enter');
        check('con el teclado (Enter) se vuelve a cerrar', await boton.getAttribute('aria-expanded') === 'false');
        check('sin desplazamiento horizontal', await sinDesborde(page));
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();

        console.log(`\n▸ Pago pendiente (${ancho} px)`);
        const p2 = await abrir({ width: ancho, height: alto }, 'pendiente');
        const caja2 = p2.page.locator('[data-inscripcion-feria]');
        check('también arranca minimizada', await caja2.getByRole('button', { name: /Inscripción a la Feria de Proyectos/ }).getAttribute('aria-expanded') === 'false');
        const pagar = caja2.getByRole('button', { name: /Pagar inscripción/ });
        check('cerrada, «Pagar inscripción» sigue a la vista', await pagar.count() === 1 && await pagar.isVisible());
        await pagar.click();
        check('y funciona sin abrir la caja', await p2.page.evaluate(() => window.__pagar) === 1);
        await shot(p2.page, `pendiente-cerrada-${ancho}`);
        await caja2.getByRole('button', { name: /Inscripción a la Feria de Proyectos/ }).click();
        check('abierta hay un solo botón de pago (no se duplica)', await caja2.getByRole('button', { name: /Pagar inscripción/ }).count() === 1);
        check('sin desplazamiento horizontal', await sinDesborde(p2.page));
        check('sin errores en la página', p2.errores.length === 0, p2.errores.join(' | '));
        await p2.page.close();

        console.log(`\n▸ Dos proyectos sin pagar: pagar uno o los dos (${ancho} px)`);
        const p3 = await abrir({ width: ancho, height: alto }, 'dos');
        const caja3 = p3.page.locator('[data-inscripcion-feria]');
        const ambos = caja3.getByRole('button', { name: /Pagar los 2 proyectos/ });
        const uno = caja3.getByRole('button', { name: /Pagar solo el primer proyecto/ });
        check('cerrada, se ven las dos opciones con su total', await ambos.isVisible() && await uno.isVisible()
            && await caja3.getByText('$367.500').first().isVisible() && await caja3.getByText('$262.500').first().isVisible());
        await uno.click();
        check('«Pagar solo el primer proyecto» pide el alcance «first»', await p3.page.evaluate(() => window.__scope) === 'first');
        await ambos.click();
        check('«Pagar los 2 proyectos» pide el alcance «all»', await p3.page.evaluate(() => window.__scope) === 'all');
        await shot(p3.page, `dos-cerrada-${ancho}`);
        check('sin desplazamiento horizontal', await sinDesborde(p3.page));
        check('sin errores en la página', p3.errores.length === 0, p3.errores.join(' | '));
        await p3.page.close();
    }
} finally { await browser.close(); }
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:registration-accordion:ui — ${okCount} comprobaciones, ${malos.length} fallas.`);
process.exit(malos.length ? 1 : 0);
