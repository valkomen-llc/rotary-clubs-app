// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — el compositor, en un NAVEGADOR de verdad — v4.895
//
// Lo que se comprueba acá NO se ve en una prueba de criterio, y es
// exactamente lo que sostiene el módulo:
//
//   1. Que el TEXTO CAIGA EN LA FRANJA QUE EL PROMPT RESERVÓ. Todo el diseño
//      depende de ese acuerdo: el servidor le pide al modelo que deje libre
//      «la mitad izquierda» y el compositor escribe ahí. Si se despistara, la
//      pieza saldría con el título sobre una cara y NADA daría error. Se mide
//      contando píxeles de tinta por región — la misma técnica con la que se
//      destapó que los rótulos de los Reels no se pintaban (v4.783).
//
//   2. Que la VISTA PREVIA SEA EL ARCHIVO. No se comparan dos composiciones:
//      se comprueba que sólo haya UNA, que el lienzo montado sea el mismo
//      objeto que se exporta y que el PNG salga con los bytes de ese lienzo.
//
//   3. Que el modo `plain` dibuje la fotografía y el modo `ai` el fondo.
//
//   npm run test:anniversary:render
//   (pide `npm i --no-save playwright esbuild`; se salta solo si faltan)
// ════════════════════════════════════════════════════════════════════
import { existsSync } from 'node:fs';

let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch (e) {
    console.log(`⚠️  Se omite: falta playwright o esbuild (${e.message.split('\n')[0]}).`);
    console.log('   npm i --no-save playwright esbuild');
    process.exit(0);
}
if (!existsSync('dist')) {
    console.log('⚠️  Se omite: no hay `dist/`. Corré `npm run build` primero.');
    process.exit(0);
}

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

// El compositor, empaquetado para el navegador. Las tipografías se sustituyen:
// acá se mide DÓNDE cae el texto, no con qué letra sale, y depender de la
// descarga de un woff2 haría la prueba frágil por un motivo que no es el suyo.
const paquete = await build({
    entryPoints: ['src/lib/anniversaryRender.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'AR',
    platform: 'browser', target: 'es2020',
    define: { 'import.meta.env.VITE_API_URL': '"/api"' },
    plugins: [{
        name: 'sin-fuentes',
        setup(b) {
            b.onResolve({ filter: /designFonts$/ }, () => ({ path: 'designFonts', namespace: 'stub' }));
            b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                contents: 'export const ensureDesignFonts = async () => "ready";', loader: 'js',
            }));
        },
    }],
});

// Dos imágenes sintéticas, en data URL: la prueba no sale a la red.
//   · el «fondo»: blanco con una mancha oscura ARRIBA A LA DERECHA, que es
//     donde estarían las personas si el análisis dijo «sujetos a la derecha».
//   · la «fotografía»: un degradado reconocible.
const PNG_FONDO = 'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
        <rect width="1080" height="1080" fill="#ffffff"/>
        <circle cx="800" cy="380" r="240" fill="#2b3a4a"/>
     </svg>`).toString('base64');
const PNG_FOTO = 'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
        <rect width="1200" height="800" fill="#c0392b"/>
     </svg>`).toString('base64');

// El navegador del entorno. `playwright install` no se corre acá: se apunta al
// que ya está empaquetado, como hacen el resto de las pruebas de navegador del
// repositorio.
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(existsSync) || process.env.CHROME_PATH;
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
// ⚠️ HACE FALTA UN ORIGEN REAL. Sobre `about:blank` —lo que deja `setContent`—
// una dirección relativa no tiene base contra la que resolverse, así que una
// petición no llega a salir y la prueba pasaría sin ejercitar nada. Es la
// lección de v4.720 y volvió a costar una vuelta en v4.864.
await page.route('**/*', route => {
    const u = route.request().url();
    if (u === 'http://localhost/lienzo') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    // El proxy de imágenes: se devuelve el data URL tal cual, decodificando el
    // parámetro. Así se ejercita el camino REAL del compositor.
    if (u.includes('/api/public/banner-image')) {
        const src = decodeURIComponent(new URL(u).searchParams.get('url') || '');
        const m = src.match(/^data:([^;]+);base64,(.+)$/);
        if (m) return route.fulfill({ contentType: m[1], body: Buffer.from(m[2], 'base64'), headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.fulfill({ status: 404, body: '' });
});
await page.goto('http://localhost/lienzo');
await page.addScriptTag({ content: paquete.outputFiles[0].text });

const DOC = {
    format: 'square_1080', width: 1080, height: 1080,
    renderMode: 'ai', backdropUrl: PNG_FONDO, photoUrl: PNG_FOTO,
    zoneId: 'left',
    clubName: 'Club Rotario Cali', years: 40,
    title: 'Celebramos juntos',
    message: 'Cuatro décadas de servicio, amistad y compromiso con nuestra comunidad.',
    branding: { clubLogo: null, districtLine: 'Distrito 4281 · Ana Gómez · 2026-2027', period: '2026-2027', footerImage: null, watermark: null },
};

/** Cuánta tinta OSCURA hay en una región normalizada del lienzo. El texto es
 *  oscuro sobre blanco, así que esto mide dónde se escribió. */
const tinta = async (doc, region) => page.evaluate(async ({ doc, region }) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const c = canvas.getContext('2d');
    const x = Math.round(region.x * canvas.width), y = Math.round(region.y * canvas.height);
    const w = Math.round(region.w * canvas.width), h = Math.round(region.h * canvas.height);
    const { data } = c.getImageData(x, y, w, h);
    let oscuros = 0;
    for (let i = 0; i < data.length; i += 4) {
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (l < 150) oscuros++;
    }
    return oscuros / (w * h);
}, { doc, region });

grupo('1 — El texto cae en la franja que el prompt reservó');

// ⚠️ MEDIR «¿hay tinta en la mitad izquierda?» NO DISCRIMINA, y la primera
// versión de esta prueba caía en esa trampa: las tres zonas SE SOLAPAN —`left`
// llega hasta y=0,74 y `bottom` empieza en y=0,50—, así que con el compositor
// escribiendo siempre abajo la comprobación pasaba igual. Verificado a la
// inversa: sólo el CENTROIDE de la tinta distingue una zona de otra.
//
// Se mide sobre un fondo BLANCO y sin branding, para que toda la tinta oscura
// del lienzo sea exactamente lo que escribimos nosotros.
const BLANCO = 'data:image/svg+xml;base64,' + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#ffffff"/></svg>'
).toString('base64');

const centroide = async (zoneId) => page.evaluate(async ({ doc }) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (l < 150) { const px = (i / 4) % canvas.width, py = Math.floor((i / 4) / canvas.width); sx += px; sy += py; n++; }
    }
    return n ? { x: sx / n / canvas.width, y: sy / n / canvas.height, n } : { x: -1, y: -1, n: 0 };
}, { doc: { ...DOC, zoneId, renderMode: 'ai', backdropUrl: BLANCO, branding: {} } });

const dentro = (c, z) => c.x >= z.x && c.x <= z.x + z.w && c.y >= z.y && c.y <= z.y + z.h;
const ZONAS = {
    left: { x: 0.070, y: 0.180, w: 0.400, h: 0.560 },
    right: { x: 0.530, y: 0.180, w: 0.400, h: 0.560 },
    bottom: { x: 0.090, y: 0.500, w: 0.820, h: 0.320 },
};

for (const id of ['left', 'right', 'bottom']) {
    const c = await centroide(id);
    check(`con la zona \`${id}\` el texto cae DENTRO de esa franja y no de otra`,
        c.n > 2000 && dentro(c, ZONAS[id]),
        `centro (${c.x.toFixed(3)}, ${c.y.toFixed(3)}) con ${c.n} píxeles; se esperaba dentro de ${JSON.stringify(ZONAS[id])}`);
}

// Y con la fotografía del modelo a la derecha, no se escribe encima. Se mide
// la MISMA región con y sin texto: la diferencia es lo que escribimos.
const DER_ALTA = { x: 0.56, y: 0.15, w: 0.40, h: 0.35 };
const derechaConTexto = await tinta({ ...DOC, zoneId: 'left' }, DER_ALTA);
const derechaSinTexto = await tinta({ ...DOC, zoneId: 'left', title: '', message: '', clubName: '', years: null }, DER_ALTA);
check('y NO escribe sobre el lado donde están las personas',
    Math.abs(derechaConTexto - derechaSinTexto) < 0.002,
    `con texto ${derechaConTexto.toFixed(4)} vs sin texto ${derechaSinTexto.toFixed(4)}`);

grupo('2 — La vista previa ES el archivo');

const identidad = await page.evaluate(async (doc) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    // Se monta EXACTAMENTE ese objeto, como hacen las dos pantallas.
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.appendChild(canvas);
    const montado = host.firstElementChild;
    const blob = await window.AR.canvasToBlob(canvas);
    // Y el PNG se vuelve a decodificar para comprobar que lleva los píxeles
    // del lienzo que está a la vista, no de una segunda composición.
    const bitmap = await createImageBitmap(blob);
    const off = document.createElement('canvas');
    off.width = bitmap.width; off.height = bitmap.height;
    off.getContext('2d').drawImage(bitmap, 0, 0);
    const a = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const b = off.getContext('2d').getImageData(0, 0, off.width, off.height).data;
    let distintos = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) distintos++;
    return {
        mismoObjeto: montado === canvas,
        tipo: montado?.tagName,
        mismasMedidas: bitmap.width === canvas.width && bitmap.height === canvas.height,
        distintos, total: a.length / 4,
        tipoBlob: blob.type,
    };
}, DOC);

check('lo que se monta en la pantalla es el propio lienzo', identidad.mismoObjeto && identidad.tipo === 'CANVAS', identidad.tipo);
check('el archivo tiene las mismas medidas', identidad.mismasMedidas);
check('y exactamente los mismos píxeles', identidad.distintos === 0, `${identidad.distintos} de ${identidad.total}`);
check('la descarga es un PNG', identidad.tipoBlob === 'image/png', identidad.tipoBlob);

grupo('3 — Las tres capas');

// Modo `ai`: el fondo del modelo se dibuja (la mancha oscura aparece).
const conFondo = await tinta({ ...DOC, renderMode: 'ai' }, DER_ALTA);
check('modo `ai`: se dibuja el fondo que devolvió el modelo', conFondo > 0.05, `tinta ${conFondo.toFixed(4)}`);

// Modo `plain`: no hay fondo y la fotografía se dibuja del lado contrario al
// texto. La foto sintética es roja, así que se mide el rojo.
const plainRojo = await page.evaluate(async (doc) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const { data } = canvas.getContext('2d').getImageData(
        Math.round(0.60 * canvas.width), Math.round(0.10 * canvas.height),
        Math.round(0.30 * canvas.width), Math.round(0.30 * canvas.height));
    let rojos = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 140 && data[i + 1] < 100 && data[i + 2] < 100) rojos++;
    return rojos / (data.length / 4);
}, { ...DOC, renderMode: 'plain', backdropUrl: null, zoneId: 'left' });
check('modo `plain`: la fotografía se dibuja del lado contrario al texto', plainRojo > 0.4, `rojo ${plainRojo.toFixed(3)}`);

// La capa 3 se dibuja en la banda del pie y no en otro sitio.
const pie = await tinta(DOC, { x: 0.04, y: 0.90, w: 0.60, h: 0.08 });
const sinPie = await tinta({ ...DOC, branding: {} }, { x: 0.04, y: 0.90, w: 0.60, h: 0.08 });
check('el branding se imprime en la banda del pie', pie > sinPie, `con ${pie.toFixed(4)} / sin ${sinPie.toFixed(4)}`);
check('sin branding no queda una banda vacía dibujada', sinPie < 0.02, `tinta ${sinPie.toFixed(4)}`);

grupo('4 — El texto exacto se escribe, no se genera');

// Los años y el club se imprimen desde los datos: se comprueba que la pieza
// cambie cuando cambian, que es lo que garantiza la exactitud por construcción.
const distintaCifra = await page.evaluate(async ({ a, b }) => {
    const uno = (await window.AR.renderAnniversary(a)).canvas;
    const dos = (await window.AR.renderAnniversary(b)).canvas;
    const da = uno.getContext('2d').getImageData(0, 0, uno.width, uno.height).data;
    const db = dos.getContext('2d').getImageData(0, 0, dos.width, dos.height).data;
    let distintos = 0;
    for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i]) distintos++;
    return distintos;
}, { a: { ...DOC, years: 40 }, b: { ...DOC, years: 75 } });
check('cambiar los años cambia la pieza', distintaCifra > 500, `${distintaCifra} píxeles`);

const avisoLargo = await page.evaluate(async (doc) => (await window.AR.renderAnniversary(doc)).overflow,
    { ...DOC, zoneId: 'left', message: 'palabra '.repeat(160) });
check('un mensaje que no entra se DECLARA, no se recorta en silencio', avisoLargo === true);

await browser.close();

console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} de ${ok + malos.length} comprobaciones fallaron:`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones en un navegador. El compositor se comporta.`);
