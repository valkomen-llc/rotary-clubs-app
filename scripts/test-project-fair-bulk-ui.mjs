// ════════════════════════════════════════════════════════════════════════════
// La selección múltiple de postulaciones, EN UN NAVEGADOR — v4.1024
//
// ⚠️ LO QUE NINGUNA PRUEBA DE CRITERIO PUEDE VER, y que acá es lo caro: que lo
// que se MARCA sea exactamente lo que viaja al endpoint que BORRA. Una
// dependencia que falte en un `useCallback` no la ve el typecheck —el código
// es válido y el ajuste simplemente no llega nunca (la lección de `conQr`,
// v4.836)—, y en este módulo eso significaría eliminar filas que nadie eligió.
//
// Se salta solo si faltan `playwright` o `esbuild`.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const CSS = (() => {
    try {
        const dir = 'dist/assets';
        const f = readdirSync(dir).find(n => /^index-.*\.css$/.test(n));
        return f ? readFileSync(`${dir}/${f}`, 'utf8') : null;
    } catch { return null; }
})();

let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('… se salta: faltan playwright o esbuild (npm i --no-save playwright esbuild)');
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
    define: {
        'import.meta.env.VITE_API_URL': '"/api"',
        'process.env.NODE_ENV': '"production"',
        __APP_VERSION__: '"0.0.0-diag"',
    },
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

// Dos sin cobrar y dos que SÍ cobraron: es la mezcla que hace visible la regla
// —lo que cobró se archiva, lo demás se elimina— en la propia pantalla.
const FILAS = [
    { id: 'p1', publicRef: 'FP-AAA', projectName: 'Sin pagar uno', clubName: 'Club A', district: '4281', responsable: 'Ana', email: 'a@x.co', phone: '1', focusArea: 'paz', focusAreaLabel: 'Paz', budgetUsd: 100, paymentStatus: 'pending_payment', workflowStatus: 'received', priority: 'normal', amountCop: null, amountUsd: null, amountReceived: null, refundedAmount: null, paidAt: null, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', tags: [], archivedAt: null },
    { id: 'p2', publicRef: 'FP-BBB', projectName: 'Pagada dos', clubName: 'Club B', district: '4271', responsable: 'Beto', email: 'b@x.co', phone: '2', focusArea: 'agua', focusAreaLabel: 'Agua', budgetUsd: 200, paymentStatus: 'paid', workflowStatus: 'payment_confirmed', priority: 'normal', amountCop: 500000, amountUsd: 120, amountReceived: 120, refundedAmount: null, paidAt: '2026-09-02T10:00:00Z', createdAt: '2026-09-02T10:00:00Z', updatedAt: '2026-09-02T10:00:00Z', tags: [], archivedAt: null },
    { id: 'p3', publicRef: 'FP-CCC', projectName: 'Sin pagar tres', clubName: 'Club C', district: '4281', responsable: 'Caro', email: 'c@x.co', phone: '3', focusArea: 'paz', focusAreaLabel: 'Paz', budgetUsd: 300, paymentStatus: 'pending_payment', workflowStatus: 'received', priority: 'normal', amountCop: null, amountUsd: null, amountReceived: null, refundedAmount: null, paidAt: null, createdAt: '2026-09-03T10:00:00Z', updatedAt: '2026-09-03T10:00:00Z', tags: [], archivedAt: null },
];

const ACCESS = {
    role: 'admin', view: true, managePayments: true, viewPayments: true, comment: true,
    edit: true, changeStatus: true, manageTags: true, export: true, config: true, remove: true,
};

const abrir = async ({ access = ACCESS } = {}) => {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
    const errores = [];
    const pedidos = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 220)); });

    // ⚠️ ORIGEN REAL y con `?evento=`: `currentEventId()` lo lee de
    // `window.location.search`, así que sobre `about:blank` —o sin la query—
    // la pantalla operaría sin edición y la prueba pasaría sin ejercitar nada
    // (la lección de v4.720).
    //
    // Y VA PRIMERA: Playwright resuelve la ÚLTIMA ruta declarada primero, así
    // que puesta al final se tragaba también las de `/api/` y la pantalla
    // recibía HTML donde esperaba JSON.
    await page.route('http://localhost/**', r => r.fulfill({
        contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
    }));
    await page.route('**/api/**', r => { pedidos.push({ url: r.request().url(), method: r.request().method() }); return r.fulfill({ json: {} }); });
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria', settings: [] } }));
    await page.route('**/api/project-fair/admin/catalog*', r => r.fulfill({
        json: {
            workflowStates: [{ key: 'received', label: 'Recibida', color: 'sky' }, { key: 'in_review', label: 'En revisión', color: 'indigo' }, { key: 'closed', label: 'Cerrada', color: 'slate' }],
            paymentStates: [{ key: 'pending_payment', label: 'Pendiente de pago', color: 'amber' }, { key: 'paid', label: 'Pagado', color: 'emerald' }],
            priorities: [{ key: 'normal', label: 'Normal', color: 'sky' }],
            districts: ['4271', '4281'], focusAreas: [{ key: 'paz', label: 'Paz' }],
            // ⚠️ El `access` de la pantalla sale del CATÁLOGO, no del listado
            // (`setAccess(cat.access)`): sin él la pantalla se queda en «Tu
            // perfil no tiene acceso» y la prueba pasaría por el motivo
            // equivocado.
            access,
        },
    }));
    await page.route('**/api/project-fair/admin/tags*', r => r.fulfill({ json: [{ id: 't1', label: 'Prueba', color: 'slate' }] }));
    await page.route('**/api/project-fair/admin/postulaciones?*', r => {
        pedidos.push({ url: r.request().url(), method: r.request().method() });
        return r.fulfill({ json: { submissions: FILAS, pagination: { page: 1, pageSize: 25, total: 3, pages: 1 }, access } });
    });
    // Las de bloque van DESPUÉS: Playwright resuelve la ÚLTIMA ruta declarada
    // primero, así que puestas antes las taparía el comodín del listado.
    await page.route('**/api/project-fair/admin/postulaciones/bulk-*', async r => {
        const req = r.request();
        pedidos.push({ url: req.url(), method: req.method(), body: req.postDataJSON() });
        return r.fulfill({
            json: {
                summary: 'se eliminará 1 postulación definitivamente y se archivará 1 postulación.',
                totals: { eliminada: 1, archivada: 1 },
                outcomes: [
                    { id: 'p1', label: 'FP-AAA · Sin pagar uno', outcome: 'eliminada', reason: null },
                    { id: 'p2', label: 'FP-BBB · Pagada dos', outcome: 'archivada', reason: 'tiene_cobro' },
                ],
            },
        });
    });

    await page.goto('http://localhost/?evento=ev1&tab=submissions');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate(() => {
        localStorage.setItem('rotary_token', 't-diag');
        localStorage.setItem('rotary_user', JSON.stringify({ id: 'u', role: 'administrator', clubId: 'club-feria' }));
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(900);
    return { page, errores, pedidos, texto: () => page.locator('#root').innerText() };
};

console.log('\n▸ La pantalla se abre y ofrece seleccionar');
{
    const { page, errores, texto } = await abrir();
    const t = await texto();
    check('se monta sin reventar', t.length > 100, t.slice(0, 200));
    check('pinta las postulaciones que mandó el servidor', /FP-AAA/.test(t) && /FP-BBB/.test(t));
    check('ofrece el botón «Seleccionar»', /Seleccionar/.test(t));
    check('sin activarlo NO hay casillas', await page.locator('tbody input[type=checkbox]').count() === 0);
    check('ofrece ver las archivadas', /Sin archivar/.test(t), t.slice(0, 400));
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ ⚠️ Lo que se MARCA es lo que viaja al endpoint que borra');
{
    const { page, pedidos, texto } = await abrir();
    await page.getByRole('button', { name: 'Seleccionar' }).click();
    await page.waitForTimeout(150);
    check('aparece una casilla por fila', await page.locator('tbody input[type=checkbox]').count() === 3);
    check('la casilla lleva el NOMBRE de su fila, no «Seleccionar» a secas',
        await page.getByLabel('Seleccionar FP-AAA · Sin pagar uno').count() === 1);

    // Se marcan la primera (sin pagar) y la segunda (PAGADA), a propósito.
    await page.getByLabel('Seleccionar FP-AAA · Sin pagar uno').check();
    await page.getByLabel('Seleccionar FP-BBB · Pagada dos').check();
    await page.waitForTimeout(150);
    check('la barra dice cuántas hay marcadas', /2 seleccionadas/.test(await texto()));

    await page.getByRole('button', { name: /Eliminar/ }).first().click();
    await page.waitForTimeout(200);
    const modal = await texto();
    check('⚠️ la confirmación DICE el hecho: 1 se elimina y 1 se archiva',
        /eliminará 1 postulación definitivamente/.test(modal) && /archivará 1 postulación/.test(modal), modal.slice(-900));
    check('…y avisa que lo eliminado no se recupera', /NO se puede recuperar/.test(modal));
    check('…y por qué la pagada no se elimina', /no se eliminan/.test(modal));
    check('el botón nombra lo que va a hacer', /Eliminar 1 y archivar 1/.test(modal), modal.slice(-500));

    pedidos.length = 0;
    await page.getByRole('button', { name: /Eliminar 1 y archivar 1/ }).click();
    await page.waitForTimeout(400);

    const envio = pedidos.find(p => p.method === 'POST' && /bulk-delete/.test(p.url));
    check('⚠️ se llamó a bulk-delete', !!envio, JSON.stringify(pedidos.slice(0, 4)));
    check('⚠️ con los ids EXACTOS que se marcaron',
        JSON.stringify(envio?.body?.ids) === JSON.stringify(['p1', 'p2']), JSON.stringify(envio?.body));
    check('⚠️ con `confirm: true` — sin él el servidor responde 428', envio?.body?.confirm === true);
    check('⚠️ y con la edición abierta en la URL', /evento=ev1/.test(envio?.url || ''), envio?.url);

    const tras = await texto();
    check('el desglose dice qué pasó con CADA una',
        /Eliminada definitivamente/.test(tras) && /Archivada/.test(tras), tras.slice(0, 600));
    check('…y el motivo de la que se archivó', /registró un cobro/.test(tras));
    await page.close();
}

console.log('\n▸ «Todos los visibles» y el motivo obligatorio del cambio de estado');
{
    const { page, texto } = await abrir();
    await page.getByRole('button', { name: 'Seleccionar' }).click();
    await page.waitForTimeout(150);
    await page.getByLabel('Seleccionar las postulaciones de esta página').check();
    await page.waitForTimeout(150);
    check('marca las tres de la página', /3 seleccionadas/.test(await texto()));

    await page.getByRole('button', { name: /Cambiar estado/ }).click();
    await page.waitForTimeout(200);
    const confirmar = page.getByRole('button', { name: 'Confirmar' });
    check('sin estado ni motivo, el botón está apagado', await confirmar.isDisabled());
    await page.selectOption('select:below(:text("Estado nuevo"))', 'in_review').catch(() => {});
    await page.waitForTimeout(120);
    check('con estado pero SIN motivo, sigue apagado', await confirmar.isDisabled());
    await page.locator('textarea').fill('revisión de la edición');
    await page.waitForTimeout(120);
    check('con el motivo escrito, ya se puede confirmar', !(await confirmar.isDisabled()));
    await page.close();
}

console.log('\n▸ Un perfil sin la capacidad `remove` no ve eliminar');
{
    const { page, texto } = await abrir({ access: { ...ACCESS, role: 'reviewer', remove: false, edit: false } });
    await page.getByRole('button', { name: 'Seleccionar' }).click();
    await page.waitForTimeout(150);
    await page.getByLabel('Seleccionar FP-AAA · Sin pagar uno').check();
    await page.waitForTimeout(200);
    const t = await texto();
    check('no se le ofrece Eliminar', !/Eliminar/.test(t), t.slice(-400));
    check('ni Archivar', !/Archivar/.test(t));
    check('pero sí Cambiar estado, que es su permiso', /Cambiar estado/.test(t));
    await page.close();
}

await browser.close();
console.log(`\n${malos.length ? '✗' : '✓'} ${ok} pasaron · ${malos.length} fallaron`);
if (malos.length) { console.log(malos.map(m => `  · ${m}`).join('\n')); process.exit(1); }
