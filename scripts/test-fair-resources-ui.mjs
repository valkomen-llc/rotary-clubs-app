// ════════════════════════════════════════════════════════════════════════════
// Plantilla oficial de presentación, EN UN NAVEGADOR — v4.1264.0
// npm run test:fair:resources:ui
//
// Lo que ninguna prueba de criterio puede ver: que en «Mi proyecto» la
// plantilla quede DEBAJO de la Formulación y Rotary 31A DEBAJO del FDD (dos
// columnas a 1280 px, una sola a 390 px y en el mismo orden), que el botón
// pida la descarga al servidor y siga el enlace firmado, y que los estados
// —próximamente, error— se pinten. Y que la pestaña «Recursos y plantillas»
// del administrador abra con sus indicadores.
//
// API simulada. Se salta solo si faltan `playwright` o `esbuild`. Con
// SHOTS=<carpeta> guarda capturas; con TW_CSS=<archivo> usa ese CSS (si no,
// el de `dist/`).
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const CSS = (() => {
    if (process.env.TW_CSS && existsSync(process.env.TW_CSS)) return readFileSync(process.env.TW_CSS, 'utf8');
    try {
        const f = readdirSync('dist/assets').find(n => /^index-.*\.css$/.test(n));
        return f ? readFileSync(`dist/assets/${f}`, 'utf8') : null;
    } catch { return null; }
})();

let chromium, build;
try {
    // `require` como respaldo: respeta NODE_PATH, donde algunos entornos
    // instalan Playwright de forma global.
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

const bundleOf = async (importLine, element, path) => (await build({
    stdin: {
        contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
${importLine}
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { CartProvider } from './src/contexts/CartContext';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, { initialEntries: ['${path}'] },
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(CartProvider, null, ${element}))))));
`,
        resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent',
})).outputFiles[0].text;

const portalJs = await bundleOf("import Pantalla from './src/pages/MiProyecto';", 'React.createElement(Pantalla)', '/mi-proyecto');
const adminJs = await bundleOf("import Pantalla from './src/pages/admin/PostulacionesPagos';", 'React.createElement(Pantalla)', '/admin/postulaciones-pagos');

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

const FORM = (key, title, pct) => ({
    key, title, shortTitle: title, subtitle: key === 'fdd_2026_2027' ? 'Subvenciones globales · Distrito 4271' : '', intro: 'Completa la información de tu proyecto. Puedes guardar y volver cuantas veces necesites.',
    icon: key === 'master' ? 'file' : 'wallet', sections: 6, state: 'in_progress', status: 'draft', reviewStatus: null, reviewNote: null,
    completionPct: pct, submittedAt: null, lastEditedAt: '2026-08-05T22:23:00Z', lockedAt: null, canEdit: true, reason: null,
    available: true, hasApproval: false, approvalFilled: false,
});
const PORTAL_ME = {
    role: 'project_manager', roleLabel: 'Gestor de proyecto',
    submission: { id: 's1', publicRef: 'FP-2027-ABC', projectName: 'Agua para Valledupar', clubName: 'Club Rotario Valledupar', district: '4271', email: 'club@x.org', paymentStatus: 'paid', paidAt: null, amountCop: null, amountUsd: null },
    forms: [FORM('master', 'Formulación del proyecto', 53), FORM('fdd_2026_2027', 'Solicitud de Aportes del FDD 2026-2027', 21)],
    edition: { name: 'XII Feria', city: 'Valledupar', country: 'Colombia' }, event: null, deadline: null,
    nextStep: { url: 'https://grants31a.org/', name: 'Subvenciones de Rotary 31A', label: 'Continuar hacia Subvenciones de Rotary 31A' },
    canEdit: true, reason: null,
};
const CARD = {
    key: 'presentation_template', title: 'Plantilla de presentación del proyecto',
    description: 'Descarga la plantilla oficial de la XII Feria de Proyectos Rotary Colombia 2027 y prepara la presentación de tu proyecto siguiendo el formato establecido por el comité organizador.',
    available: true, message: null, version: { number: 2, format: 'pptx', formatLabel: 'PPTX', sizeBytes: 2500000, sizeLabel: '2,4 MB', publishedAt: '2026-10-20T15:00:00Z' },
    updated: true, downloaded: false, lastDownloadedAt: null, newerSinceDownload: false,
};

const abrirPortal = async ({ width, card = CARD, download = { status: 200, json: { url: 'https://signed.example/plantilla.pptx?X-Amz-Expires=120', fileName: 'x.pptx', versionNumber: 2, ref: 'ABCD1234' } } }) => {
    const page = await browser.newPage({ viewport: { width, height: 1400 } });
    const errores = []; const pedidos = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('https://signed.example/**', r => { pedidos.push({ url: r.request().url(), method: 'GET-SIGNED' }); return r.fulfill({ status: 204, body: '' }); });
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria de Proyectos', domain: 'localhost', settings: [] } }));
    await page.route('**/api/project-fair/portal/me', r => r.fulfill({ json: PORTAL_ME }));
    await page.route('**/api/project-fair/portal/resources', r => { pedidos.push({ url: r.request().url(), method: r.request().method() }); return r.fulfill({ json: { resources: [card] } }); });
    await page.route('**/api/project-fair/portal/resources/presentation_template/download', r => {
        pedidos.push({ url: r.request().url(), method: r.request().method(), auth: r.request().headers().authorization });
        return r.fulfill({ status: download.status, json: download.json });
    });
    await page.goto('http://localhost/mi-proyecto');
    await page.evaluate(() => localStorage.setItem('feria_portal_token', 'tok-club'));
    await page.addScriptTag({ content: portalJs });
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate(() => (window).go());
    await page.getByText('Descargar plantilla').waitFor({ timeout: 15000 });
    // La tarjeta pide su estado aparte: se espera a que lo tenga.
    await page.getByText('Consultando la plantilla…').waitFor({ state: 'detached', timeout: 15000 });
    return { page, errores, pedidos };
};

const box = async (page, text) => {
    const el = page.locator('h3', { hasText: text }).first();
    await el.waitFor();
    return el.boundingBox();
};

console.log('── «Mi proyecto» a 1280 px');
{
    const { page, errores, pedidos } = await abrirPortal({ width: 1280 });
    const fm = await box(page, 'Formulación del proyecto');
    const fdd = await box(page, 'Solicitud de Aportes del FDD');
    const tpl = await box(page, 'Plantilla de presentación del proyecto');
    const g31 = await box(page, 'Subvenciones de Rotary 31A');
    check('fila 1: Formulación a la izquierda, FDD a la derecha', Math.abs(fm.y - fdd.y) < 4 && fm.x < fdd.x);
    check('fila 2: plantilla debajo de la Formulación', tpl.y > fm.y + 50 && Math.abs(tpl.x - fm.x) < 4);
    check('fila 2: Rotary 31A debajo del FDD', g31.y > fdd.y + 50 && Math.abs(g31.x - fdd.x) < 4 && Math.abs(g31.y - tpl.y) < 4);
    check('31A conserva su enlace', await page.locator('a[href="https://grants31a.org/"]').count() === 1);
    check('estado «Plantilla actualizada» y formato', await page.getByText('Plantilla actualizada el').count() === 1 && await page.getByText('PPTX · 2,4 MB · Versión 2').count() === 1);
    const anchoPagina = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('sin desbordamiento horizontal', anchoPagina);
    if (process.env.SHOTS) await page.locator('section', { hasText: 'Formularios y recursos del proyecto' }).screenshot({ path: `${process.env.SHOTS}/mi-proyecto-1280.png` });
    await page.getByRole('button', { name: 'Descargar plantilla' }).click();
    await page.getByText('Tu descarga comenzó').waitFor({ timeout: 5000 }).catch(() => {});
    const post = pedidos.find(p => p.method === 'POST');
    check('el botón hace POST al servidor con la sesión del club', post && post.auth === 'Bearer tok-club');
    check('y sigue el enlace firmado que devuelve el servidor', pedidos.some(p => p.method === 'GET-SIGNED'));
    check('mensaje de éxito', await page.getByText('Tu descarga comenzó').count() === 1);
    check('sin errores de página', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('── «Mi proyecto» a 390 px (móvil)');
{
    const { page, errores } = await abrirPortal({ width: 390 });
    const ys = [];
    for (const t of ['Formulación del proyecto', 'Solicitud de Aportes del FDD', 'Plantilla de presentación del proyecto', 'Subvenciones de Rotary 31A']) ys.push((await box(page, t)).y);
    check('una sola columna en orden: Formulación, FDD, plantilla, 31A', ys.every((y, i) => i === 0 || y > ys[i - 1] + 40), ys.join(','));
    check('sin desbordamiento horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (process.env.SHOTS) await page.locator('section', { hasText: 'Formularios y recursos del proyecto' }).screenshot({ path: `${process.env.SHOTS}/mi-proyecto-390.png` });
    check('sin errores de página', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('── Estados de la tarjeta');
{
    const { page } = await abrirPortal({ width: 1280, card: { ...CARD, available: false, version: null, message: 'La plantilla oficial estará disponible próximamente.', updated: false } });
    check('sin plantilla: «disponible próximamente»', await page.getByText('La plantilla oficial estará disponible próximamente.').count() === 1);
    check('y el botón deshabilitado', await page.getByRole('button', { name: 'Descargar plantilla' }).isDisabled());
    if (process.env.SHOTS) await page.locator('section', { hasText: 'Formularios y recursos del proyecto' }).screenshot({ path: `${process.env.SHOTS}/mi-proyecto-proximamente.png` });
    await page.close();
}
{
    const { page, pedidos } = await abrirPortal({ width: 1280, download: { status: 503, json: { error: 'No fue posible descargar la plantilla. Inténtalo nuevamente.', code: 'storage_missing', ref: 'ABCD1234' } } });
    await page.getByRole('button', { name: 'Descargar plantilla' }).click();
    await page.getByText('No fue posible descargar la plantilla').waitFor({ timeout: 5000 }).catch(() => {});
    check('error: mensaje del pedido con su referencia', await page.getByText('No fue posible descargar la plantilla. Inténtalo nuevamente.').count() === 1 && await page.getByText('Referencia: ABCD1234').count() === 1);
    check('error: no se sigue ningún enlace', !pedidos.some(p => p.method === 'GET-SIGNED'));
    check('el botón queda disponible para reintentar', await page.getByRole('button', { name: 'Descargar plantilla' }).isEnabled());
    await page.close();
}
{
    const { page } = await abrirPortal({ width: 1280, card: { ...CARD, downloaded: true, lastDownloadedAt: '2026-10-25T14:00:00Z' } });
    check('ya descargada: aviso discreto y el botón sigue activo', await page.getByText(/Ya descargaste esta plantilla/).count() === 1 && await page.getByRole('button', { name: 'Descargar plantilla' }).isEnabled());
    await page.close();
}

console.log('── Administrador: «Recursos y plantillas»');
{
    const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    const ACCESS = { role: 'admin', view: true, managePayments: true, viewPayments: true, comment: true, edit: true, changeStatus: true, manageTags: true, export: true, config: true, remove: true };
    const version = (n, cur) => ({ id: `v${n}`, number: n, fileName: `Plantilla Feria 2027 v${n}.pptx`, format: 'pptx', formatLabel: 'PPTX', contentType: 'x', sizeBytes: 2500000, note: n === 2 ? 'Ajuste de logos' : null, publishedAt: '2026-10-20T15:00:00Z', publishedBy: 'admin@feria.org', current: cur, deliveredCount: cur ? 4 : 7 });
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria de Proyectos', domain: 'localhost', settings: [] } }));
    await page.route('**/api/project-fair/admin/catalog*', r => r.fulfill({ json: { workflowStates: [], paymentStates: [], priorities: [], districts: [], focusAreas: [], access: ACCESS } }));
    await page.route('**/api/project-fair/admin/recursos?*', r => r.fulfill({ json: {
        resources: [{ key: 'presentation_template', exists: true, id: 'r1', title: CARD.title, description: CARD.description, active: true, maxSizeMb: 50,
            current: version(2, true), versions: [version(2, true), version(1, false)], history: [{ id: 'h1', type: 'version_replaced', title: 'Plantilla reemplazada por la versión 2', detail: 'Plantilla v2.pptx · PPTX', actorName: 'admin@feria.org', createdAt: '2026-10-20T15:00:00Z' }], status: 'published' }],
        access: { config: true, export: true, view: true }, accept: '.pptx,.pdf', limits: { min: 1, max: 200, default: 50 },
    } }));
    const fila = (ref, club, d, del) => ({ submissionId: ref, accountId: ref, publicRef: ref, responsible: `Responsable ${ref}`, email: `${ref}@club.org`, clubName: club, district: d, projectName: `Proyecto ${ref}`, projectStateLabel: 'Postulado', eligible: true, deliveredCount: del, failedCount: 0, firstDeliveredAt: del ? '2026-10-21T10:00:00Z' : null, lastDeliveredAt: del ? '2026-10-24T10:00:00Z' : null, lastVersionNumber: del ? 2 : null });
    await page.route('**/api/project-fair/admin/recursos/presentation_template/analytics?*', r => r.fulfill({ json: {
        exists: true, currentVersion: 2, active: true,
        kpis: { eligibleProjects: 16, projectsWithDownload: 11, pendingProjects: 5, uniqueUsers: 11, totalDelivered: 19, totalFailed: 1, adoptionPct: 68.8, clubsWithDownload: 9, clubsPending: 4, lastDeliveredAt: '2026-10-24T10:00:00Z' },
        byDistrict: [{ district: '4271', eligible: 9, withDownload: 7, delivered: 12, adoptionPct: 77.8 }, { district: '4281', eligible: 7, withDownload: 4, delivered: 7, adoptionPct: 57.1 }],
        timeline: [{ day: '2026-10-20', delivered: 6, projects: 5 }, { day: '2026-10-21', delivered: 4, projects: 3 }, { day: '2026-10-23', delivered: 9, projects: 6 }],
        rows: [fila('FP-A', 'Club Valledupar', '4271', 3), fila('FP-B', 'Club Cartagena', '4281', 0)], total: 16,
        filters: [{ key: 'all', label: 'Todos' }, { key: 'downloaded', label: 'Ya descargaron' }, { key: 'pending', label: 'No han descargado' }],
        versions: [2, 1], clubs: ['Club Cartagena', 'Club Valledupar'], districts: ['4271', '4281'],
    } }));
    await page.goto('http://localhost/admin/postulaciones-pagos?evento=ev1&tab=resources');
    await page.evaluate(() => {
        localStorage.setItem('rotary_token', 't-diag');
        localStorage.setItem('rotary_user', JSON.stringify({ id: 'u', email: 'admin@feria.org', firstName: 'Admin', lastName: 'Feria', role: 'administrator', clubId: 'club-feria' }));
    });
    await page.addScriptTag({ content: adminJs });
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate(() => (window).go());
    await page.getByText('Analítica de descargas de plantillas').waitFor({ timeout: 15000 }).catch(async (e) => {
        if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/admin-debug.png`, fullPage: true });
        console.log(errores.join(' | '), (await page.evaluate(() => document.body.innerText)).slice(0, 800));
        throw e;
    });
    await page.getByText('Seguimiento por proyecto').waitFor({ timeout: 15000 });
    check('pestaña con la plantilla vigente y su historial', await page.getByText('Plantilla Feria 2027 v2.pptx').count() >= 1 && await page.getByText('Historial de versiones').count() === 1);
    check('indicadores: adopción 68,8 %', await page.getByText('68,8 %').count() >= 1);
    check('tabla de seguimiento con estados', await page.getByText('No ha descargado').count() === 1 && await page.getByText('Descargó').count() >= 1);
    check('acciones: subir versión nueva, desactivar, exportar', await page.getByText('Subir versión nueva').count() === 1 && await page.getByText('Desactivar').count() === 1 && await page.locator('div', { hasText: 'Seguimiento por proyecto' }).last().getByRole('button', { name: 'CSV' }).count() >= 1);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/admin-recursos.png`, fullPage: true });
    check('sin errores de página', errores.length === 0, errores.join(' | '));
    await page.close();
}

await browser.close();
console.log(malos.length ? `\n❌ ${malos.length} fallaron: ${malos.join(' · ')}` : `\n✅ ${ok} comprobaciones en el navegador, todas en verde.`);
process.exit(malos.length ? 1 : 0);
