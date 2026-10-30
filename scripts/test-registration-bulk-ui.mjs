// ════════════════════════════════════════════════════════════════════════════
// Seleccionar, editar y eliminar inscripciones, EN UN NAVEGADOR — v4.1263
//
// Lo que la prueba de criterio no ve: que las casillas se pinten, que marcar no
// abra la ficha, que «Editar» con una abra SUS datos y mande sólo lo cambiado,
// y que eliminar mande los ids con `confirm: true` y diga lo que se conservó.
//
// Se salta solo si faltan `playwright` o `esbuild`. Con `dist/` (o
// `UI_CSS=<archivo>`) carga el CSS real; `UI_SHOTS=<carpeta>` guarda capturas.
// ════════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const CSS = (() => {
    try {
        if (process.env.UI_CSS) return readFileSync(process.env.UI_CSS, 'utf8');
        const f = readdirSync('dist/assets').find(n => /^index-.*\.css$/.test(n));
        return f ? readFileSync(`dist/assets/${f}`, 'utf8') : null;
    } catch { return null; }
})();
const SHOTS = process.env.UI_SHOTS || '';

let chromium, build;
try {
    // El Playwright del entorno suele estar instalado global: `import` no lo
    // encuentra y `require` sí, con NODE_PATH.
    ({ chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright')));
    ({ build } = await import('esbuild'));
} catch {
    console.log('… se salta: faltan playwright o esbuild');
    process.exit(0);
}

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 260)}` : ''); }
};

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Pantalla from './src/components/admin/events/EventRegistrationsManager';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement('div', { style: { maxWidth: 1280, margin: '0 auto', padding: 16 } },
        React.createElement(Pantalla, {
            eventId: 'ev-feria', eventTitle: 'XII Feria',
            categories: [{ key: 'registro_nacional', name: 'Registro Nacional' }],
            statuses: [{ key: 'paid', label: 'Pago confirmado' }, { key: 'cancelled', label: 'Cancelado' }],
        })));
`;
const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent',
});

const browser = await chromium.launch();

const NOMBRES = [['Paula Andrea', 'CRUZ MEJIA'], ['Jose Ivan', 'Granada Jimenez'], ['PEDRO JULIO', 'HERNANDEZ']];
const fila = (i, extra = {}) => ({
    id: `r-${i}`, publicRef: `PUB${i}`, registrationCode: `RPF12-AB${i}CD`, status: 'paid',
    categoryKey: 'registro_nacional', categoryLabel: 'Registro Nacional', audience: 'national',
    firstName: NOMBRES[i % 3][0], lastName: NOMBRES[i % 3][1], email: `p${i}@correo.com`, phone: '300',
    country: 'Colombia', city: 'Valledupar', district: '4271', documentNumber: `10${i}`,
    clubName: i === 2 ? 'ximena-caicedo@hotmail.com' : 'Medellín El Poblado', rotaryRole: '', language: '', dietary: 'ninguna',
    answers: { firstName: NOMBRES[i % 3][0], lastName: NOMBRES[i % 3][1], email: `p${i}@correo.com`, clubName: 'Medellín El Poblado', fairRole: 'expositor', dietary: 'ninguna', acceptTerms: true },
    tags: [], pricing: {}, baseCurrency: 'COP', baseAmount: 800000, chargeCurrency: 'COP', chargeAmount: 800000,
    fxRate: null, companionsCount: 0, companionsAmount: 0, stripeSessionId: null, stripePaymentIntentId: null,
    stripeChargeId: null, stripeCustomerId: null, paymentMethod: null, receiptUrl: null, refundedAmount: null,
    notes: null, internalNotes: null, checkedInAt: i === 1 ? '2027-01-28T10:00:00Z' : null, paidAt: null,
    createdAt: '2026-10-24T10:00:00Z', ...extra,
});
const FORM = {
    audience: 'national',
    steps: [
        { key: 'personal', label: 'Datos personales', fields: [
            { key: 'firstName', label: 'Nombres', type: 'text', max: 120 },
            { key: 'lastName', label: 'Apellidos', type: 'text', max: 120 },
            { key: 'email', label: 'Correo electrónico', type: 'email', max: 200 },
            { key: 'clubName', label: 'Club Rotario', type: 'text', max: 200 },
            { key: 'fairRole', label: 'Rol dentro de la feria', type: 'select', options: [{ value: 'expositor', label: 'Expositor' }, { value: 'prensa', label: 'Prensa / Medios' }] },
        ] },
        { key: 'needs', label: 'Necesidades y condiciones', fields: [
            { key: 'dietary', label: 'Necesidades alimentarias', type: 'select', options: [{ value: 'ninguna', label: 'Ninguna' }] },
            { key: 'acceptTerms', label: 'Acepto', type: 'checkbox' },
        ] },
    ],
};

const abrir = async ({ total = 3, ancho = 1280 } = {}) => {
    const page = await browser.newPage({ viewport: { width: ancho, height: 1100 } });
    const errores = [];
    const pedidos = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 200)); });
    const filas = Array.from({ length: Math.min(total, 50) }, (_, i) => fila(i));

    await page.route('**/api/**', r => { pedidos.push({ url: r.request().url(), method: r.request().method(), body: r.request().postData() }); return r.fulfill({ json: {} }); });
    await page.route('**/api/event-registrations/admin/dashboard*', r => r.fulfill({ json: { totals: { registrations: total }, byCurrency: [], byCategory: [], byCountry: [], byClub: [], timeline: [] } }));
    await page.route('**/api/event-registrations/admin/list*', r => r.fulfill({ json: { total, registrations: filas } }));
    await page.route('**/api/event-registrations/admin/registrations/select-all*', r => {
        pedidos.push({ url: r.request().url(), method: 'GET' });
        return r.fulfill({ json: { total, truncated: false, max: 5000, registrations: Array.from({ length: total }, (_, i) => fila(i)) } });
    });
    await page.route('**/api/event-registrations/admin/registrations/r-0', r => {
        pedidos.push({ url: r.request().url(), method: r.request().method(), body: r.request().postData() });
        if (r.request().method() === 'PATCH') return r.fulfill({ json: { registration: fila(0) } });
        return r.fulfill({ json: { registration: fila(0), companions: [], history: [], payments: [], messages: [], form: FORM } });
    });
    await page.route('**/api/event-registrations/admin/registrations/bulk-delete', r => {
        const body = JSON.parse(r.request().postData() || '{}');
        pedidos.push({ url: r.request().url(), method: 'POST', body: r.request().postData() });
        const outcomes = body.ids.map(id => (id === 'r-1' ? { id, outcome: 'conservada', motivo: 'ya_acreditada' } : { id, outcome: 'borrada' }));
        return r.fulfill({ json: { outcomes, conservadas: outcomes.filter(o => o.outcome === 'conservada'), totals: { borradas: outcomes.filter(o => o.outcome === 'borrada').length, conservadas: 1 } } });
    });

    await page.route('http://localhost/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="background:#f9fafb"><div id="root"></div></body>' }));
    await page.goto('http://localhost/');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate(() => localStorage.setItem('rotary_token', 't-diag'));
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(700);
    return { page, errores, pedidos, texto: () => page.locator('#root').innerText() };
};

console.log('\n▸ Las casillas y la barra');
{
    const { page, errores, texto } = await abrir();
    check('se monta sin errores', errores.length === 0, errores.join(' | '));
    const casillas = page.locator('tbody input[type="checkbox"]');
    check('una casilla por fila', await casillas.count() === 3);
    check('la barra invita a marcar', /Marca una o varias inscripciones/.test(await texto()));
    await casillas.nth(0).check();
    await page.waitForTimeout(150);
    let t = await texto();
    check('marcar NO abre la ficha', !/Editar datos/.test(t));
    check('la barra dice «1 seleccionada» y ofrece Editar', /1 seleccionada/.test(t) && /\bEditar\b/.test(t));
    await casillas.nth(2).check();
    await page.waitForTimeout(150);
    t = await texto();
    check('con dos, «Editar campo (2)»', /2 seleccionadas/.test(t) && /Editar campo \(2\)/.test(t));
    await page.locator('thead input[type="checkbox"]').check();
    await page.waitForTimeout(150);
    check('la cabecera marca todas las visibles', /3 seleccionadas/.test(await texto()));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/seleccion.png`, fullPage: true });
    await page.close();
}

console.log('\n▸ Editar UNA inscripción');
{
    const { page, pedidos, texto } = await abrir();
    await page.locator('tbody input[type="checkbox"]').nth(0).check();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.waitForTimeout(500);
    let t = await texto();
    check('abre sus datos completos', /Editar inscripción/.test(t) && /Club Rotario/i.test(t));
    check('no ofrece reescribir la aceptación de términos', !/Acepto/.test(t));
    const club = page.locator('label', { hasText: 'Club Rotario' }).locator('xpath=following-sibling::input');
    await club.fill('Valledupar Sicarare');
    await page.waitForTimeout(100);
    t = await texto();
    check('el botón cuenta los cambios', /Guardar 1 cambio/.test(t));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/editar.png` });
    pedidos.length = 0;
    await page.locator('button', { hasText: 'Guardar 1 cambio' }).click();
    await page.waitForTimeout(500);
    const patch = pedidos.find(p => p.method === 'PATCH');
    check('manda SÓLO lo que cambió', patch && JSON.stringify(JSON.parse(patch.body)) === JSON.stringify({ answers: { clubName: 'Valledupar Sicarare' } }), patch?.body);
    check('avisa que se guardó', /Se guardaron los cambios/.test(await texto()));
    await page.close();
}

console.log('\n▸ Eliminar la selección');
{
    const { page, pedidos, texto } = await abrir();
    await page.locator('thead input[type="checkbox"]').check();
    await page.locator('button', { hasText: 'Eliminar (3)' }).click();
    await page.waitForTimeout(200);
    let t = await texto();
    check('la confirmación nombra a los elegidos', /Paula Andrea CRUZ MEJIA/.test(t) && /PEDRO JULIO HERNANDEZ/.test(t));
    check('advierte ANTES la acreditada', /1 de las 3 seleccionadas está acreditada/.test(t));
    check('advierte que eliminar no reembolsa', /no reembolsa/.test(t));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/eliminar.png` });
    await page.locator('button', { hasText: 'Eliminar 3' }).click();
    await page.waitForTimeout(500);
    const del = pedidos.find(p => /bulk-delete/.test(p.url));
    const body = del ? JSON.parse(del.body) : {};
    check('manda los ids, el evento y confirm: true', body.confirm === true && body.eventRef === 'ev-feria' && body.ids?.length === 3, del?.body);
    t = await texto();
    check('dice cuántas se eliminaron y cuál se conservó con su motivo',
        /Se eliminaron 2 de 3/.test(t) && /Se conservaron 1: RPF12-AB1CD \(ya acreditada\)/.test(t), t.slice(0, 400));
    check('lo conservado sigue marcado', /1 seleccionada/.test(t));
    await page.close();
}

console.log('\n▸ Seleccionar todo el filtro');
{
    const { page, pedidos, texto } = await abrir({ total: 120 });
    await page.locator('button', { hasText: 'Seleccionar las 120 que coinciden con el filtro' }).click();
    await page.waitForTimeout(400);
    check('lo resuelve el servidor', pedidos.some(p => /select-all\?eventRef=ev-feria/.test(p.url)));
    check('y queda todo marcado', /120 seleccionadas \(incluye inscripciones fuera de esta vista\)/.test(await texto()));
    await page.close();
}

console.log('\n▸ En el móvil');
{
    const { page, errores } = await abrir({ ancho: 390 });
    await page.locator('tbody input[type="checkbox"]').nth(0).check();
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    check('sin errores a 390 px', errores.length === 0, errores.join(' | '));
    check('la página no se desborda (la tabla desplaza dentro de su caja)', !CSS || ancho <= 390, String(ancho));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/movil.png`, fullPage: true });
    await page.close();
}

await browser.close();
console.log(`\n${ok} correctas, ${malos.length} fallidas\n`);
process.exit(malos.length ? 1 : 0);
