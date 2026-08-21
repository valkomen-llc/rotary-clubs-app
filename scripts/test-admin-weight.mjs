// ════════════════════════════════════════════════════════════════════
// Lo que el panel descarga para abrirse — v4.880
//
//   npm run test:admin-weight
//
// Nació de un reporte con captura: «a veces la configuración se queda en
// blanco, no carga, o se demora mucho». No era una pantalla rota —los hooks
// estaban en su sitio y no había ningún identificador inexistente—: era el
// PESO. Abrir Configuración descargaba 2.481 kB, de los cuales 1.096 eran el
// changelog completo de la plataforma y 206 un editor de texto que vive tres
// pestañas más allá de la de entrada.
//
// Las dos cosas eran INVISIBLES desde el código: el changelog entraba por un
// `import` de una línea en AdminLayout —para escribir un número de versión— y
// el editor por una hoja de estilos importada de forma estática. Ninguna la ve
// el typecheck, ninguna da error, y el changelog además CRECÍA con cada
// despliegue.
//
// La parte de archivos no necesita nada. La de navegador pide `playwright`,
// `dist/` compilado, y se salta sola si faltan.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

// ════════════════════════════════════════════════════════════════════
grupo('── El número de versión no arrastra el changelog ─────────');

const LAYOUT = readFileSync('src/components/admin/AdminLayout.tsx', 'utf8');
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const layoutCodigo = sinComentarios(LAYOUT);

// `AdminLayout` lo monta TODA pantalla del panel, así que lo que importe acá
// lo paga cada una. `SystemUpdates.tsx` es el historial entero (1,1 MB).
check('AdminLayout NO importa SYSTEM_UPDATES',
    !/from\s*['"][^'"]*SystemUpdates['"]/.test(layoutCodigo));
check('…y tampoco lo nombra en el código',
    !/SYSTEM_UPDATES/.test(layoutCodigo));
check('el número sale de `appVersion`, un módulo minúsculo',
    /from\s*['"][^'"]*lib\/appVersion['"]/.test(layoutCodigo) && /APP_VERSION/.test(layoutCodigo));

const VERSION_FILE = readFileSync('src/lib/appVersion.ts', 'utf8');
check('`appVersion` no importa nada: si importara, volvería a arrastrar',
    !/^\s*import\s/m.test(VERSION_FILE));

// ── Las tres versiones son la misma ──
//
// Separar el número de su changelog es lo que quita el peso, y lo que lo hace
// seguro es que no puedan discrepar en silencio: la barra diría una versión y
// la pantalla de novedades otra.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const appVersion = VERSION_FILE.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const primeraEntrada = readFileSync('src/pages/SystemUpdates.tsx', 'utf8')
    .match(/SYSTEM_UPDATES:\s*UpdateItem\[\]\s*=\s*\[\s*\{\s*version:\s*['"]([^'"]+)['"]/)?.[1];

check('`appVersion` declara una versión legible', !!appVersion, String(appVersion));
check('coincide con la de package.json', appVersion === pkg.version,
    `appVersion=${appVersion} · package.json=${pkg.version}`);
check('coincide con la primera entrada del changelog', appVersion === primeraEntrada,
    `appVersion=${appVersion} · SYSTEM_UPDATES[0]=${primeraEntrada}`);

// ════════════════════════════════════════════════════════════════════
grupo('── El editor de texto viaja con su hoja de estilos ───────');

const RICH = readFileSync('src/components/admin/RichTextEditor.tsx', 'utf8');
const QUILL = readFileSync('src/components/admin/QuillEditor.tsx', 'utf8');

check('el editor se carga con `lazy`', /lazy\(\s*\(\)\s*=>\s*import\(/.test(RICH));
check('`Suspense` vive DENTRO del envoltorio, no en cada pantalla',
    /<Suspense/.test(RICH));
// ⚠️ Medido: con la hoja importada desde el módulo estático, Vite la asigna al
// chunk `vendor-editor` y ese chunk pasa a ser dependencia estática de la
// pantalla — `__vitePreload` lo descarga igual y los 206 kB vuelven, con el
// `lazy()` puesto y sin que nada avise.
check('la hoja de estilos NO se importa desde el módulo estático',
    !/quill\.snow\.css/.test(RICH));
check('…sino desde el módulo perezoso, que viaja con ella',
    /quill\.snow\.css/.test(QUILL));

const CS = sinComentarios(readFileSync('src/pages/admin/ClubSettings.tsx', 'utf8'));
check('Configuración ya no importa el editor de forma estática',
    !/from\s*['"]react-quill/.test(CS) && !/quill\.snow\.css/.test(CS));
check('…y usa el envoltorio', /RichTextEditor/.test(CS));

// ════════════════════════════════════════════════════════════════════
grupo('── En un navegador: qué se descarga de verdad ────────────');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('  ⚠ Se omite: falta playwright.  npm i --no-save playwright'); }

const hayDist = existsSync('dist/index.html') && existsSync('dist/assets');
if (chromium && !hayDist) console.log('  ⚠ Se omite: no hay dist/ compilado.  npm run build');

if (chromium && hayDist) {
    const TIPOS = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
    const srv = createServer((req, res) => {
        const u = req.url.split('?')[0];
        let f = join('dist', u);
        if (!existsSync(f) || u === '/') f = 'dist/index.html';
        try {
            const b = readFileSync(f);
            res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' });
            res.end(b);
        } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(r => srv.listen(0, r));
    const port = srv.address().port;

    const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
        .find(p => existsSync(p));
    const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const pedidos = [];
    const fallos = [];
    page.on('request', r => { if (r.url().includes('/assets/')) pedidos.push(r.url().split('/').pop()); });
    page.on('pageerror', e => fallos.push(e.message));

    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.route('**/api/clubs/by-domain**', r => r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id: 'c1', name: 'Sitio de prueba', type: 'district', description: '<p>x</p>', settings: [] }),
    }));
    await page.addInitScript(() => {
        localStorage.setItem('rotary_token', 'x.' + btoa(JSON.stringify({ role: 'administrator', aud: 'rotary-platform', exp: 4102444800 })) + '.y');
        localStorage.setItem('rotary_user', JSON.stringify({ role: 'administrator', name: 'X', clubId: 'c1' }));
    });
    await page.goto(`http://localhost:${port}/admin/configuracion`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => { });
    await page.waitForTimeout(800);

    // El `.js`, no el `.css`: `vendor-editor` tiene los dos y la hoja pesa
    // 24 kB frente a los 206 del código. Reportar el pequeño haría parecer
    // insignificante justo lo que se acaba de quitar del camino.
    const pesa = n => {
        const f = readdirSync('dist/assets').find(x => x.startsWith(n) && x.endsWith('.js'));
        return f ? Math.round(readFileSync(`dist/assets/${f}`).length / 1024) : 0;
    };
    check(`el changelog (${pesa('SystemUpdates')} kB) NO se descarga al abrir el panel`,
        !pedidos.some(p => p.includes('SystemUpdates')));
    check(`el editor (${pesa('vendor-editor')} kB) NO se descarga al abrir el panel`,
        !pedidos.some(p => p.includes('vendor-editor')));

    const kB = Math.round(pedidos.reduce((t, n) => {
        try { return t + readFileSync(`dist/assets/${n}`).length; } catch { return t; }
    }, 0) / 1024);
    // Antes del arreglo eran 2.481 kB. El techo deja margen para crecer sin
    // convertir la prueba en un estorbo, y salta si alguien vuelve a colgar un
    // megabyte del panel.
    check(`abrir Configuración descarga ${kB} kB (techo: 1.600)`, kB < 1600);
    check('sin errores de render', fallos.length === 0, fallos.join(' | '));

    // ── La otra mitad: que el editor SIGA funcionando ──
    //
    // Un ahorro que rompe la pantalla no es un ahorro. Se comprueba montándolo
    // de verdad, escribiendo dentro.
    const tab = page.getByRole('button', { name: /identidad/i }).first();
    if (await tab.count()) {
        await tab.click();
        await page.waitForTimeout(2500);
        check('al abrir «Identidad», el editor se monta',
            (await page.locator('.ql-editor').count()) > 0);
        check('…con su barra de herramientas, o sea con su CSS',
            (await page.locator('.ql-toolbar').count()) > 0);
        if (await page.locator('.ql-editor').count()) {
            await page.locator('.ql-editor').first().click();
            await page.keyboard.type('hola');
            check('…y se puede escribir en él',
                (await page.locator('.ql-editor').first().innerText()).includes('hola'));
        }
    } else {
        check('la pestaña «Identidad» existe', false, 'no se encontró el botón');
    }

    await browser.close();
    srv.close();
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallaron de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.`);
