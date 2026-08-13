#!/usr/bin/env node
/**
 * Subida desde el dispositivo — el camino compartido (v4.784)
 * ===========================================================
 *
 * Ejercita `src/lib/mediaUpload.ts` EN UN NAVEGADOR de verdad, con la API
 * interceptada. Es una prueba de pantalla y no de criterio a propósito: lo que
 * puede fallar acá no es una decisión, es el CAMINO —qué peticiones salen, en
 * qué orden y con qué datos—, y eso desde el servidor no se ve.
 *
 * Es la misma lección que `test-ecosystem-ui.mjs` (v4.747) y la del editor de
 * la sede (v4.717): se verificó cómo se veía y no cómo se usaba, y el defecto
 * llegó a producción.
 *
 * Qué se comprueba:
 *   · que salgan los TRES pasos, en orden: presigned-url → PUT a S3 → save;
 *   · que se use el nombre y la URL que devuelve el servidor y NO los que se
 *     mandaron — con un HEIC son distintos, y quedarse con los enviados deja
 *     una tarjeta apuntando a un archivo que el navegador no dibuja;
 *   · que un fallo a mitad de una tanda no se lleve por delante los demás;
 *   · que un HEIC que no se pudo convertir se REPORTE en vez de entregarse como
 *     una foto válida e invisible.
 *
 * Pide `playwright` y `esbuild`, que se instalan aparte, y SE SALTA SOLO si no
 * están — un despliegue no debe caerse por una dependencia de desarrollo.
 *
 *   npm i --no-save playwright esbuild
 *   npm run test:media:upload
 */

let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:media:upload — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// El módulo se compila con esbuild porque es TypeScript y porque importa
// `compressImage` y `heicImages`: hay que traer el grafo entero, no el archivo
// suelto.
const bundle = await build({
    entryPoints: ['src/lib/mediaUpload.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'MU',
    platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"' }
});
const code = bundle.outputFiles[0].text;

// El contenedor trae Chromium preinstalado, y su versión no tiene por qué
// coincidir con la que espera el playwright del momento. Se apunta al binario
// del sistema cuando existe, en vez de descargar otro — que en un entorno sin
// red saldría mal y aquí sólo sería peso.
const { existsSync } = await import('fs');
const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(
    existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {}
);
const ctx = await browser.newContext();
const page = await ctx.newPage();

// ── Un ORIGEN real, no `about:blank` ──
//
// Sobre `about:blank` un `fetch('/api/…')` no tiene base contra la que resolver
// y falla antes de salir, así que la prueba pasaría sin haber ejercitado nada.
// Es la lección de `test-design-render.mjs`.
await page.route('**/*', route => {
    if (route.request().url() === 'http://localhost/') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    }
    return route.continue();
});

// Las peticiones que salen, en orden. Es lo que se inspecciona después.
const calls = [];

await page.route('**/api/media/presigned-url*', route => {
    const url = new URL(route.request().url());
    calls.push({ step: 'presign', fileName: url.searchParams.get('fileName') });
    route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
            uploadUrl: 'https://s3.example.test/put/abc',
            fileUrl: 'https://bucket.s3.amazonaws.com/clubs/x/images/original.jpg',
            key: 'clubs/x/images/original.jpg',
            fileTypeLocal: 'image'
        })
    });
});

await page.route('https://s3.example.test/**', route => {
    calls.push({ step: 's3', method: route.request().method() });
    route.fulfill({ status: 200, body: '' });
});

// El servidor devuelve OTRO nombre y OTRA url, como haría con un HEIC
// convertido. Es el caso que distingue «se usa lo devuelto» de «se usa lo
// mandado».
await page.route('**/api/media/save', route => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push({ step: 'save', fileName: body.fileName, folderId: body.folderId });
    route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
            id: 'media-123',
            filename: 'convertida.jpg',
            url: 'https://bucket.s3.amazonaws.com/clubs/x/images/convertida.jpg',
            type: 'image',
            conversion: { from: 'heic', to: 'jpeg' }
        })
    });
});

await page.goto('http://localhost/');
await page.addScriptTag({ content: code });
await page.evaluate(() => localStorage.setItem('rotary_token', 't-prueba'));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Los tres pasos, en orden');

const r1 = await page.evaluate(async () => {
    // Un PNG mínimo de verdad: `compressImage` carga la imagen en un canvas, y
    // con bytes inventados fallaría la carga y devolvería el archivo intacto —
    // pasando la prueba por el camino equivocado.
    const png = Uint8Array.from(atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    ), c => c.charCodeAt(0));
    const file = new File([png], 'foto.png', { type: 'image/png' });
    return await window.MU.uploadMediaFiles([file]);
});

check('la subida devuelve un archivo', r1.uploaded.length === 1, JSON.stringify(r1.failed));
check('no hubo fallos', r1.failed.length === 0, JSON.stringify(r1.failed));
check('salieron los tres pasos EN ORDEN',
    calls.map(c => c.step).join(' → ') === 'presign → s3 → save',
    calls.map(c => c.step).join(' → '));
check('el archivo se sube a S3 con PUT (no por el cuerpo de la API)',
    calls.find(c => c.step === 's3')?.method === 'PUT');

// Con un HEIC el servidor cambia el nombre y la URL. Quedarse con los enviados
// dejaría una tarjeta apuntando al archivo que el navegador no dibuja.
check('se usa el NOMBRE que devuelve el servidor, no el que se mandó',
    r1.uploaded[0].filename === 'convertida.jpg', r1.uploaded[0].filename);
check('se usa la URL que devuelve el servidor',
    r1.uploaded[0].url.includes('convertida.jpg'), r1.uploaded[0].url);
check('se usa el id de la fila de `Media`', r1.uploaded[0].id === 'media-123');

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Un fallo no se lleva por delante los demás');

calls.length = 0;
let n = 0;
await page.unroute('**/api/media/save');
await page.route('**/api/media/save', route => {
    n++;
    // El segundo falla; el primero y el tercero pasan.
    if (n === 2) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
    route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: `m${n}`, filename: `f${n}.jpg`, url: `https://x/f${n}.jpg`, type: 'image' })
    });
});

const r2 = await page.evaluate(async () => {
    const png = Uint8Array.from(atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    ), c => c.charCodeAt(0));
    const files = [1, 2, 3].map(i => new File([png], `foto${i}.png`, { type: 'image/png' }));
    return await window.MU.uploadMediaFiles(files);
});

check('los otros dos se suben igual', r2.uploaded.length === 2, JSON.stringify(r2.uploaded));
check('el que falló se reporta', r2.failed.length === 1);
check('el fallo trae el NOMBRE del archivo, no sólo un contador',
    r2.failed[0]?.name === 'foto2.png', JSON.stringify(r2.failed[0]));
check('y trae un motivo accionable',
    typeof r2.failed[0]?.reason === 'string' && r2.failed[0].reason.length > 5,
    r2.failed[0]?.reason);
check('`uploadMediaFiles` nunca lanza: devuelve las dos listas',
    Array.isArray(r2.uploaded) && Array.isArray(r2.failed));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Un HEIC que no se pudo convertir se DICE');

await page.unroute('**/api/media/save');
await page.route('**/api/media/save', route => {
    route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
            id: 'm-heic', filename: 'foto.heic', url: 'https://x/foto.heic', type: 'image',
            conversion: { from: 'heic', to: null, error: 'formato no soportado' }
        })
    });
});

const r3 = await page.evaluate(async () => {
    const png = Uint8Array.from(atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    ), c => c.charCodeAt(0));
    return await window.MU.uploadMediaFiles([new File([png], 'foto.png', { type: 'image/png' })]);
});

// Un archivo que el navegador no puede dibujar NO se entrega como si sirviera:
// el usuario vería un recuadro roto sin ningún motivo.
check('no se entrega como foto válida', r3.uploaded.length === 0, JSON.stringify(r3.uploaded));
check('se reporta con su motivo',
    r3.failed.length === 1 && /convert/i.test(r3.failed[0].reason), JSON.stringify(r3.failed));
check('y se dice que quedó guardada en la Biblioteca',
    /Biblioteca/i.test(r3.failed[0]?.reason || ''), r3.failed[0]?.reason);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La pantalla ofrece LAS DOS vías, juntas');

// Regla de v4.700. Se comprueba leyendo el archivo porque montar el
// `VideoCreator` entero exigiría simular su docena de endpoints, y lo que
// importa acá es que el botón EXISTA junto al otro y dispare el input.
const { readFileSync } = await import('fs');
const src = readFileSync('src/components/admin/content-studio/VideoCreator.tsx', 'utf8');

check('hay un botón de subir fotos', /Subir fotos/.test(src));
check('dispara el input de archivo oculto', /fileInputRef\.current\?\.click\(\)/.test(src));
check('el input acepta HEIC (es el formato por defecto del iPhone)',
    /accept=\{IMAGE_ACCEPT\}/.test(src) && /heic/i.test(readFileSync('src/lib/mediaUpload.ts', 'utf8')));
// Se busca la LLAMADA, no la mención. Es la misma lección que `test-cta-styles`
// dejó escrita: un comentario que explica de dónde se viene tiene que poder
// nombrar el endpoint sin hacer fallar la prueba. Lo que no puede haber es un
// `fetch` propio a `presigned-url` — eso sería el segundo camino hacia S3 que
// este módulo existe para no tener.
check('usa el camino compartido y NO repite los tres pasos a mano',
    /uploadMediaFiles/.test(src) && !/fetch\([^)]*presigned-url/.test(src),
    (src.match(/fetch\([^)]*presigned-url[^)]*\)/) || [''])[0]);
check('el input se limpia para poder reelegir el mismo archivo',
    /e\.target\.value = ''/.test(src));
check('los dos botones viven en el MISMO contenedor',
    /Subir fotos[\s\S]{0,600}Elegir fotos/.test(src));

await browser.close();

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
