#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LOS ADJUNTOS DEL REENVÍO, en un navegador.  npm run test:reconciliation:ui
// v4.1018.0
//
// Comprueba lo que una prueba de criterio no puede ver: que la sección
// «Archivos adjuntos» se pinte con los comprobantes que devolvió el servidor,
// que la conciliación y los comprobantes vengan MARCADOS por defecto, que sin
// comprobantes se explique en vez de dejar un hueco —y sobre todo que la
// preferencia LLEGUE a la petición—.
//
// ⚠️ Esa última es la lección de `conQr` (v4.836) y `profileId` (v4.838): una
// dependencia que falta en un manejador no la ve el typecheck, el código es
// válido y el ajuste simplemente no viaja nunca.
//
// Pide `playwright` y `esbuild` y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:reconciliation:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}
import { existsSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const section = (t) => console.log(`\n${t}`);

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ResendNoticeModal from './src/components/admin/wallet/ResendNoticeModal';
window.go = (ids) => createRoot(document.getElementById('root')).render(
    React.createElement(ResendNoticeModal, {
        paymentIds: ids, clubId: 'club-1', onCerrar: () => {}, onEnviado: () => {},
    }));
`;
const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

/** Monta el modal con la respuesta de `resolve` que se le pase. Devuelve la
 *  página y lo que la pantalla haya MANDADO al servidor. */
const montar = async (comprobantes, omitidos = []) => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    const enviado = [];

    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/financial/wallet/reconciliations/resolve', r => r.fulfill({ json: {
        scope: 'seleccion', batchId: null,
        header: {
            ref: 'CONC-8D533994', beneficiary: 'COLROTARIOS', campaignName: null, currency: 'COP',
            count: 8, grossAmount: 1600000, fees: 81963, platformRetention: 33600, netAmount: 1484437,
            method: '', methodLabel: 'Varios movimientos', reference: null,
            disbursedAt: '2026-08-31T10:00:00Z', dateLabel: '31/08/2026',
            sources: [{ kind: 'agrupacion', ref: 'LOTE-2ACAF47C', date: '2026-08-31T10:00:00Z', method: 'Transferencia', bankRef: null, count: 8, total: 8 }],
        },
        plan: {}, avisos: [], batches: [], items: [],
        historial: [{
            id: 'n1', kind: 'reenvio', kindLabel: 'Reenvío', emails: ['presidencia@club.org'],
            phones: [], results: [], state: 'enviado', error: null, at: '2026-09-01T10:00:00Z',
            byName: 'Daniel Yazo', note: null, documentName: 'conciliacion-CONC-8D533994.pdf', derived: false,
        }],
        yaAvisados: [],
        comprobantes, comprobantesOmitidos: omitidos,
    } }));
    await page.route('**/api/financial/wallet/reconciliations/resend', r => {
        // ⚠️ EL CUERPO PUEDE SER JSON O MULTIPART. Con `JSON.parse` a secas —lo
        // que había— la ruta LANZA en cuanto la pantalla manda un archivo, y la
        // prueba culpa al modal de algo que hace el arnés.
        const tipo = String(r.request().headers()['content-type'] || '');
        const crudo = r.request().postData() || '';
        if (tipo.includes('multipart/form-data')) {
            const campo = (n) => new RegExp(`name="${n}"\\r?\\n\\r?\\n([\\s\\S]*?)\\r?\\n--`).exec(crudo)?.[1] ?? null;
            enviado.push({
                _multipart: true,
                _archivos: [...crudo.matchAll(/name="extra"; filename="([^"]*)"/g)].map(m => m[1]),
                paymentIds: campo('paymentIds'), emails: campo('emails'),
                confirm: campo('confirm'), includeReceipts: campo('includeReceipts'),
                operationKey: campo('operationKey'),
            });
        } else {
            enviado.push(JSON.parse(crudo || '{}'));
        }
        return r.fulfill({ json: {
            estado: 'enviado', resultados: [{ channel: 'email', target: 'x@y.org', state: 'enviado' }],
            documento: { name: 'conciliacion-CONC-8D533994.pdf', guardado: true, error: null },
            adjuntos: { conciliacion: true, comprobantes: comprobantes.length, archivos: [], omitidos: [] },
        } });
    });

    // ⚠️ CON UN ORIGEN REAL. Sobre `about:blank` —lo que deja `setContent`— una
    // dirección relativa no tiene base contra la que resolverse: la petición no
    // llega a salir y la prueba pasaría sin ejercitar nada (la lección de
    // v4.720, que este repositorio ya pagó dos veces).
    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body><div id="root"></div></body>',
    }));
    await page.goto('http://localhost/');
    await page.evaluate(() => localStorage.setItem('rotary_token', 't-diag'));
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go(['p1', 'p2']));
    await page.waitForTimeout(700);
    return { page, errores, enviado };
};

const UNO = [{ index: 0, name: 'comprobante-LOTE-2ACAF47C.pdf', originalName: 'Captura de pantalla.png', mime: 'application/pdf', bytes: 240000, sourceKind: 'agrupacion', sourceRef: 'LOTE-2ACAF47C' }];
const DOS = [
    UNO[0],
    { index: 1, name: 'comprobante-LOTE-9F13A2B0.pdf', originalName: 'soporte.pdf', mime: 'application/pdf', bytes: 120000, sourceKind: 'lote', sourceRef: 'LOTE-9F13A2B0' },
];

section('BLOQUE 1 — la sección se pinta con los comprobantes reales');
{
    const { page, errores, enviado } = await montar(DOS);
    const texto = await page.locator('#root').innerText();
    ok('el modal se montó sin errores de consola', errores.length === 0, errores.join(' | '));
    ok('⚠️ existe la sección «Archivos adjuntos»', /ARCHIVOS ADJUNTOS/i.test(texto));
    ok('nombra la conciliación consolidada', /Conciliación consolidada \(PDF\)/i.test(texto));
    ok('y su nombre de archivo', texto.includes('conciliacion-CONC-8D533994.pdf'));
    ok('⚠️ lista los DOS comprobantes con su referencia',
        texto.includes('comprobante-LOTE-2ACAF47C.pdf') && texto.includes('comprobante-LOTE-9F13A2B0.pdf')
        && texto.includes('LOTE-9F13A2B0'));
    ok('dice el peso de cada uno', /234 KB|240 KB|117 KB|120 KB/.test(texto), texto.slice(0, 400));

    const casillas = page.locator('#root input[type="checkbox"]');
    ok('hay DOS casillas: la conciliación y los comprobantes', await casillas.count() === 2);
    ok('⚠️ las dos vienen MARCADAS por defecto',
        await casillas.nth(0).isChecked() && await casillas.nth(1).isChecked());
    ok('y se dice cuántos archivos van a salir', /Se enviarán\s*3\s*archivo/i.test(texto.replace(/\s+/g, ' ')));

    // Que la preferencia LLEGUE a la petición.
    await page.locator('#root textarea').first().fill('presidencia@club.org');
    await page.getByRole('button', { name: /Enviar conciliación/i }).click();
    await page.waitForTimeout(400);
    ok('⚠️ el envío MANDA includeReceipts en true', enviado[0]?.includeReceipts === true, JSON.stringify(enviado[0]));

    await page.close();
}

section('BLOQUE 2 — desmarcar los comprobantes viaja al servidor');
{
    const { page, enviado } = await montar(DOS);
    await page.locator('#root input[type="checkbox"]').nth(1).uncheck();
    const texto = await page.locator('#root').innerText();
    ok('el contador baja a un solo archivo', /Se enviarán\s*1\s*archivo/i.test(texto.replace(/\s+/g, ' ')));
    await page.locator('#root textarea').first().fill('presidencia@club.org');
    await page.getByRole('button', { name: /Enviar conciliación/i }).click();
    await page.waitForTimeout(400);
    ok('⚠️ y el servidor recibe includeReceipts en false', enviado[0]?.includeReceipts === false, JSON.stringify(enviado[0]));
    await page.close();
}

section('BLOQUE 3 — sin comprobantes NO se bloquea, se explica');
{
    const { page } = await montar([]);
    const texto = await page.locator('#root').innerText();
    ok('⚠️ lo dice con esas palabras', /No se encontró un comprobante asociado/i.test(texto));
    ok('y no pinta la casilla de comprobantes',
        await page.locator('#root input[type="checkbox"]').count() === 1);
    // ⚠️ Sin `|| true`: una comprobación que no puede fallar afirma lo
    // contrario de lo que dice (la lección de v4.896). Lo que de verdad
    // demuestra que no bloquea es la de abajo, con destinatario escrito.
    await page.locator('#root textarea').first().fill('x@y.org');
    ok('con destinatario, se puede enviar igual',
        await page.getByRole('button', { name: /Enviar conciliación/i }).isEnabled());
    await page.close();
}

section('BLOQUE 4 — lo que no entra se DICE, y «Reenviar nuevamente» rellena');
{
    const { page } = await montar(UNO, [{ name: 'soporte-grande.pdf', motivo: 'no entra en el tope de peso del correo' }]);
    let texto = await page.locator('#root').innerText();
    ok('⚠️ el comprobante omitido se nombra con su motivo',
        texto.includes('soporte-grande.pdf') && /tope de peso del correo/i.test(texto));

    ok('la notificación anterior ofrece «Reenviar nuevamente»',
        await page.getByRole('button', { name: /Reenviar nuevamente/i }).count() === 1);
    await page.getByRole('button', { name: /Reenviar nuevamente/i }).click();
    await page.waitForTimeout(300);
    const valor = await page.locator('#root textarea').first().inputValue();
    ok('⚠️ y trae sus destinatarios al formulario, SIN enviar nada',
        valor.includes('presidencia@club.org'), `valor: ${valor}`);
    await page.close();
}

if (process.env.SHOT) {
    const { page } = await montar(DOS, [{ name: 'soporte-grande.pdf', motivo: 'no entra en el tope de peso del correo' }]);
    await page.screenshot({ path: process.env.SHOT, fullPage: true });
    await page.close();
    console.log(`\ncaptura en ${process.env.SHOT}`);
}

section('BLOQUE 5 — los archivos adicionales se eligen, se ven y VIAJAN');
{
    const { page, errores, enviado } = await montar(UNO);
    ok('el modal se montó sin errores', errores.length === 0, errores.join(' | '));

    let texto = await page.locator('#root').innerText();
    ok('⚠️ existe el bloque «Otros archivos»', /Otros archivos/i.test(texto));
    ok('y DICE sus topes antes de que alguien elija nada',
        /Hasta 5 archivos/i.test(texto.replace(/\s+/g, ' ')) && /PDF, JPG o PNG/i.test(texto),
        'un tope que se descubre con un error es un tope que no se dijo');
    ok('con su botón de agregar', await page.getByText(/Agregar archivo/i).count() > 0);

    // Elegir dos archivos, como haría una persona.
    const entrada = page.locator('#root input[type="file"]');
    await entrada.setInputFiles([
        { name: 'Carta del presidente.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 carta') },
        { name: 'extracto.png', mimeType: 'image/png', buffer: Buffer.from('PNG') },
    ]);
    await page.waitForTimeout(200);
    texto = await page.locator('#root').innerText();
    ok('⚠️ los dos aparecen listados con su nombre',
        texto.includes('Carta del presidente.pdf') && texto.includes('extracto.png'), texto.slice(-600));
    ok('con la opción de mirarlos y de quitarlos',
        /Quitar/i.test(texto) && (await page.getByRole('button', { name: /^Ver$/ }).count()) > 0);
    ok('⚠️ y el contador de abajo los SUMA a los de arriba',
        /Se enviarán\s*4\s*archivo/i.test(texto.replace(/\s+/g, ' ')),
        'conciliación + 1 comprobante + 2 adicionales');

    // Quitar uno vuelve atrás sin tocar los demás.
    await page.getByRole('button', { name: /Quitar/i }).first().click();
    await page.waitForTimeout(150);
    texto = await page.locator('#root').innerText();
    ok('quitar uno deja el otro', !texto.includes('Carta del presidente.pdf') && texto.includes('extracto.png'));
    ok('y el contador baja', /Se enviarán\s*3\s*archivo/i.test(texto.replace(/\s+/g, ' ')));

    // Un tipo que no se admite se rechaza NOMBRÁNDOLO, sin llegar al servidor.
    await entrada.setInputFiles([{ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') }]);
    await page.waitForTimeout(250);
    texto = await page.locator('body').innerText();
    ok('⚠️ un tipo no admitido se rechaza en la pantalla y se NOMBRA',
        /virus\.exe/.test(texto), texto.slice(-300));
    // ⚠️ NOMBRARLO NO ES ADJUNTARLO: el aviso lo menciona a propósito, así que
    // lo que se cuenta son los archivos que de verdad quedaron elegidos.
    ok('y NO entra en la lista de lo que se va a mandar',
        await page.getByRole('button', { name: /Quitar/i }).count() === 1,
        'sólo tendría que quedar extracto.png');
    ok('el contador sigue diciendo 3', /Se enviarán\s*3\s*archivo/i.test(
        (await page.locator('#root').innerText()).replace(/\s+/g, ' ')));

    // Y lo que queda VIAJA.
    await page.locator('#root textarea').first().fill('presidencia@club.org');
    await page.getByRole('button', { name: /Enviar conciliación/i }).click();
    await page.waitForTimeout(900);
    ok('⚠️ el envío sale como MULTIPART cuando hay archivos', enviado[0]?._multipart === true,
        JSON.stringify(enviado[0] || {}).slice(0, 300));
    ok('⚠️ y el archivo VIAJA en la petición', (enviado[0]?._archivos || []).includes('extracto.png'),
        JSON.stringify(enviado[0]?._archivos || []));
    ok('con los campos de siempre al lado',
        enviado[0]?.confirm === 'true' && enviado[0]?.paymentIds === 'p1,p2'
        && enviado[0]?.emails === 'presidencia@club.org',
        JSON.stringify(enviado[0] || {}));
    await page.close();
}

await browser.close();
console.log(`\n${'─'.repeat(60)}\n${pass} pasaron, ${fail} fallaron`);
if (!fail) console.log('Lo que se va a adjuntar se ve antes de mandarlo.');
process.exit(fail ? 1 : 0);
