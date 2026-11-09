// ════════════════════════════════════════════════════════════════════════════
// FDD y FAP en el listado de proyectos postulados, EN UN NAVEGADOR — v4.1304
//   npm run test:fair:fdd-columns:ui
//
// Monta la pantalla real (PostulacionesPagos) con la API simulada y comprueba
// lo que sólo se ve pintado: el orden de las columnas, «—» frente a «USD 0»,
// la ayuda de FDD/FAP al pasar el cursor y al llegar con el teclado, que
// ordenar y filtrar viajen al SERVIDOR, y que la tabla no se rompa en móvil.
// Las filas son las que devolvió `listSubmissions` contra Postgres real.
//
// Con FDD_UI_SHOT=<carpeta> deja capturas de escritorio y móvil.
// Se salta solo si faltan `playwright` o `esbuild`.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const CSS = (() => {
    try {
        const dir = 'dist/assets';
        const f = readdirSync(dir).find(n => /^index-.*\.css$/.test(n));
        return f ? readFileSync(`${dir}/${f}`, 'utf8') : null;
    } catch { return null; }
})();

let chromium, build;
try {
    // `require` respeta NODE_PATH (donde el entorno deja Playwright); `import` no.
    try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }
    ({ build } = await import('esbuild'));
} catch {
    console.log('… se salta: faltan playwright o esbuild (npm i --no-save playwright esbuild)');
    process.exit(0);
}

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 300)}` : ''); }
};

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Pantalla from './src/pages/admin/PostulacionesPagos';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, { initialEntries: ['/admin/postulaciones-pagos'] },
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(Pantalla))))));
`;
const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent',
});

const base = (i, o) => ({
    id: `p${i}`, createdAt: `2026-11-0${i}T10:00:00Z`, updatedAt: `2026-11-0${i}T10:00:00Z`,
    firstName: 'Ana', lastName: 'Pérez', responsable: 'Ana Pérez', email: `p${i}@x.org`, phone: '+57 300',
    focusArea: 'agua', focusAreaLabel: 'Agua, Saneamiento e Higiene', paymentStatus: 'pending_payment', priority: 'normal',
    amountCop: 250000, amountUsd: null, amountReceived: null, refundedAmount: null, paidAt: null, tags: [], archivedAt: null,
    projectIndex: 1, registrationProjects: 1, ...o,
});
// Lo que respondió `listSubmissions` (Postgres real) para estos escenarios.
const FILAS = [
    base(1, { publicRef: 'FP-EQD5Y3', projectName: 'Dotación materno-infantil', clubName: 'Cúcuta Ciudad de los Patios', district: 'Rotary Distrito 4271', workflowStatus: 'received', budgetUsd: 30066, fddRequestedUsd: 5000, fapGoalUsd: 2000, fddRequestedReading: 'ok', fapGoalReading: 'ok' }),
    base(2, { publicRef: 'FP-ZQ7P84', projectName: 'Vida Digna Rural', clubName: 'Nuevo Ibagué', district: 'Rotary Distrito 4281', workflowStatus: 'draft', budgetUsd: 184985, fddRequestedUsd: 12000, fapGoalUsd: 4000, fddRequestedReading: 'ok', fapGoalReading: 'ok', registrationId: 'r1', projectIndex: 2, registrationProjects: 2, amountCop: 100000 }),
    base(3, { publicRef: 'FP-5C9RUE', projectName: 'Forjando Líderes del Futuro', clubName: 'Nuevo Ibagué', district: 'Rotary Distrito 4281', workflowStatus: 'in_review', budgetUsd: 48715, fddRequestedUsd: 8000, fapGoalUsd: null, fddRequestedReading: 'ok', fapGoalReading: 'empty', registrationId: 'r1', registrationProjects: 2 }),
    base(4, { publicRef: 'FP-2EAXT6', projectName: 'VTT for Firefighters', clubName: 'Cartagena de Indias', district: 'Rotary Distrito 4271', workflowStatus: 'received', budgetUsd: 84050, fddRequestedUsd: null, fapGoalUsd: 3000, fddRequestedReading: 'empty', fapGoalReading: 'ok' }),
    base(5, { publicRef: 'FP-CERO01', projectName: 'Proyecto con ceros', clubName: 'Valledupar', district: 'Rotary Distrito 4271', workflowStatus: 'received', budgetUsd: 10000, fddRequestedUsd: 0, fapGoalUsd: 0, fddRequestedReading: 'ok', fapGoalReading: 'ok' }),
    base(6, { publicRef: 'FP-MILES1', projectName: 'Formato con miles', clubName: 'Medellín', district: 'Rotary Distrito 4271', workflowStatus: 'received', budgetUsd: 15000, fddRequestedUsd: 5000, fapGoalUsd: null, fddRequestedReading: 'normalized', fddRequestedRaw: '5.000', fapGoalReading: 'unreadable', fapGoalRaw: 'abc' }),
];
const ACCESS = { role: 'admin', view: true, managePayments: true, viewPayments: true, comment: true, edit: true, changeStatus: true, manageTags: true, export: true, config: true, remove: true };

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

const abrir = async (viewport = { width: 1500, height: 1000 }) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: process.env.FDD_UI_SHOT ? 2 : 1 });
    const errores = [], pedidos = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 220)); });
    // ⚠️ La primera ruta va primera (Playwright resuelve la ÚLTIMA declarada).
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria', settings: [] } }));
    await page.route('**/api/project-fair/admin/catalog*', r => r.fulfill({ json: {
        workflowStates: [{ key: 'received', label: 'Postulado', color: 'slate' }, { key: 'draft', label: 'Borrador', color: 'slate' }, { key: 'in_review', label: 'En revisión', color: 'indigo' }],
        paymentStates: [{ key: 'pending_payment', label: 'Pendiente de pago', color: 'amber' }],
        priorities: [{ key: 'normal', label: 'Normal', color: 'sky' }], districts: ['4271', '4281'], focusAreas: [], access: ACCESS,
    } }));
    await page.route('**/api/project-fair/admin/tags*', r => r.fulfill({ json: [] }));
    await page.route('**/api/project-fair/admin/postulaciones?*', r => {
        pedidos.push(r.request().url());
        return r.fulfill({ json: { submissions: FILAS, pagination: { page: 1, pageSize: 25, total: FILAS.length, pages: 1 }, access: ACCESS } });
    });
    await page.goto('http://localhost/?evento=ev1&tab=submissions');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate(() => {
        localStorage.setItem('rotary_token', 't-diag');
        localStorage.setItem('rotary_user', JSON.stringify({ id: 'u', role: 'administrator', clubId: 'club-feria' }));
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForSelector('table thead th', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    return { page, errores, pedidos };
};

const celdas = (page, ref) => page.evaluate((ref) => {
    const heads = [...document.querySelectorAll('table.min-w-\\[1380px\\] thead th')].map(th => (th.querySelector('button')?.childNodes[0]?.textContent || th.textContent).trim());
    const tr = [...document.querySelectorAll('table.min-w-\\[1380px\\] tbody tr')].find(t => t.textContent.includes(ref));
    if (!tr) return null;
    const tds = [...tr.children].map(td => td.innerText.trim());
    return Object.fromEntries(heads.map((h, i) => [h, tds[i]]));
}, ref);

console.log('\n▸ Columnas y valores');
{
    const { page, errores, pedidos } = await abrir();
    const heads = await page.evaluate(() => [...document.querySelectorAll('table.min-w-\\[1380px\\] thead th')]
        .map(th => (th.querySelector('button')?.childNodes[0]?.textContent || th.textContent).trim()).filter(Boolean));
    const esperado = ['Registro', 'Inscripción', 'Proyecto', 'Club / Distrito', 'Responsable', 'Área de enfoque', 'Presupuesto', 'FDD', 'FAP', 'Estado', 'Pago', 'Valor'];
    check('orden: Registro … Presupuesto | FDD | FAP | Estado | Pago | Valor', JSON.stringify(heads) === JSON.stringify(esperado), heads.join(' | '));
    const a = await celdas(page, 'FP-EQD5Y3');
    check('1. FDD y FAP diligenciados', a?.FDD === 'USD 5.000' && a?.FAP === 'USD 2.000' && a?.Presupuesto === 'USD 30.066', JSON.stringify(a));
    const c = await celdas(page, 'FP-5C9RUE');
    check('3. FDD sí, FAP vacío → «—»', c?.FDD === 'USD 8.000' && c?.FAP === '—', JSON.stringify(c));
    const d = await celdas(page, 'FP-2EAXT6');
    check('4. FAP sí, FDD vacío → «—»', d?.FDD === '—' && d?.FAP === 'USD 3.000', JSON.stringify(d));
    const e = await celdas(page, 'FP-CERO01');
    check('5. cero explícito → «USD 0»', e?.FDD === 'USD 0' && e?.FAP === 'USD 0', JSON.stringify(e));
    const b = await celdas(page, 'FP-ZQ7P84');
    check('6/9. borrador y segundo proyecto del club, con SUS valores', b?.FDD === 'USD 12.000' && b?.FAP === 'USD 4.000' && /Borrador/.test(b?.Estado || ''), JSON.stringify(b));
    const m = await celdas(page, 'FP-MILES1');
    check('formato distinto: interpretado y marcado; ilegible: su texto, sin número',
        /^USD 5\.000/.test(m?.FDD || '') && /El club escribió «5\.000»/.test(m?.FDD || '') && /^abc/.test(m?.FAP || ''), JSON.stringify(m));
    const alineado = await page.evaluate(() => [...document.querySelectorAll('table.min-w-\\[1380px\\] tbody tr')][0].children[7].className);
    check('importes alineados a la derecha y sin partirse', /text-right/.test(alineado) && /whitespace-nowrap/.test(alineado));

    // Ayuda: por teclado.
    await page.getByRole('button', { name: /^FDD/ }).focus();
    const tipFoco = await page.locator('#pp-col-help-fddRequestedUsd').isVisible();
    const desc = await page.getByRole('button', { name: /^FDD/ }).getAttribute('aria-describedby');
    check('ayuda de FDD visible al enfocar con el teclado, vinculada por aria-describedby', tipFoco && desc === 'pp-col-help-fddRequestedUsd');
    check('el texto de la ayuda es el del pedido',
        /Cantidad solicitada al Distrito del Fondo Distrital Designado para el periodo 2026-2027\./.test(await page.locator('#pp-col-help-fddRequestedUsd').innerText()));
    if (process.env.FDD_UI_SHOT) await page.screenshot({ path: `${process.env.FDD_UI_SHOT}/fdd-ayuda-teclado.png`, clip: { x: 0, y: 0, width: 1500, height: 1000 } });
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.getByRole('button', { name: /^FAP/ }).hover();
    check('ayuda de FAP al pasar el cursor',
        await page.locator('#pp-col-help-fapGoalUsd').isVisible()
        && /Meta de aportes al Fondo Anual de Programas para el periodo 2026-2027\./.test(await page.locator('#pp-col-help-fapGoalUsd').innerText()));
    if (process.env.FDD_UI_SHOT) {
        await page.mouse.move(5, 5);
        await page.waitForTimeout(250);
        const tabla = page.locator('table.min-w-\\[1380px\\]');
        await tabla.evaluate(t => t.parentElement.scrollLeft = 520);
        await page.screenshot({ path: `${process.env.FDD_UI_SHOT}/fdd-listado-escritorio.png`, fullPage: false });
    }

    // Ordenar viaja al servidor.
    const antes = pedidos.length;
    await page.getByRole('button', { name: /^FDD/ }).click();
    await page.waitForTimeout(300);
    const url1 = new URL(pedidos.slice(antes).pop() || 'http://x/');
    check('ordenar por FDD pide sortBy=fddRequestedUsd al servidor', url1.searchParams.get('sortBy') === 'fddRequestedUsd' && url1.searchParams.get('sortDir') === 'desc', url1.search);
    await page.getByRole('button', { name: /^FDD/ }).click();
    await page.waitForTimeout(300);
    const url2 = new URL(pedidos.at(-1));
    check('segundo clic: ascendente', url2.searchParams.get('sortDir') === 'asc');
    check('la cabecera anuncia el orden (aria-sort)', await page.locator('th[aria-sort="ascending"]').count() === 1);
    await page.getByRole('button', { name: /^FAP/ }).click();
    await page.waitForTimeout(300);
    check('ordenar por FAP pide sortBy=fapGoalUsd', new URL(pedidos.at(-1)).searchParams.get('sortBy') === 'fapGoalUsd');

    // Filtros por rango.
    await page.getByRole('button', { name: 'Filtros' }).click();
    await page.getByLabel('FDD mín. (USD)').fill('5000');
    await page.getByLabel('Meta FAP máx. (USD)').fill('3000');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await page.waitForTimeout(300);
    const url3 = new URL(pedidos.at(-1));
    check('los rangos viajan al servidor (fddMin, fapMax)', url3.searchParams.get('fddMin') === '5000' && url3.searchParams.get('fapMax') === '3000', url3.search);
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Móvil (390 px)');
{
    const { page, errores } = await abrir({ width: 390, height: 844 });
    const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    check('la página no se desborda: la tabla se desplaza dentro de su caja', ancho.doc <= ancho.win + 1, JSON.stringify(ancho));
    const caja = await page.evaluate(() => { const t = document.querySelector('table.min-w-\\[1380px\\]'); const p = t.parentElement; return { over: getComputedStyle(p).overflowX, sw: p.scrollWidth, cw: p.clientWidth }; });
    check('desplazamiento horizontal disponible', caja.over === 'auto' && caja.sw > caja.cw, JSON.stringify(caja));
    const font = await page.evaluate(() => getComputedStyle(document.querySelector('table.min-w-\\[1380px\\] tbody td:nth-child(8)')).fontSize);
    check('la letra de los importes no se encoge (14 px)', font === '14px', font);
    if (process.env.FDD_UI_SHOT) {
        await page.evaluate(() => { const t = document.querySelector('table.min-w-\\[1380px\\]'); t.scrollIntoView(); t.parentElement.scrollLeft = 820; });
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${process.env.FDD_UI_SHOT}/fdd-listado-movil.png` });
    }
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

await browser.close();
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:fdd-columns:ui — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
