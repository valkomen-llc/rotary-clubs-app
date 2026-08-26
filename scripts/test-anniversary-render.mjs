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

// v4.907 — flujo simple: con `simple: true` el compositor NO imprime la capa
// de texto — el texto viene DENTRO de la imagen del modelo, como en el
// ejemplo de ChatGPT del cliente. Mismo documento sobre fondo blanco: sin
// `simple` escribe; con `simple`, ni un glifo (sólo queda el pie, que se
// excluye midiendo hasta y=0,84).
const CUERPO = { x: 0, y: 0, w: 1, h: 0.84 };
const conCapa = await tinta({ ...DOC, renderMode: 'ai', backdropUrl: BLANCO, branding: {} }, CUERPO);
const sinCapa = await tinta({ ...DOC, renderMode: 'ai', simple: true, backdropUrl: BLANCO, branding: {} }, CUERPO);
check('v4.907: `simple` apaga la capa de texto del compositor',
    conCapa > 0.005 && sinCapa < 0.0005, `con ${conCapa.toFixed(4)} / sin ${sinCapa.toFixed(4)}`);
// v4.924: LA FRASE SE RETIRÓ por directiva expresa. La guardia que queda es
// para las piezas VIEJAS: un documento guardado con `phraseOverlay` y
// `message` (v4.920-v4.923) NO imprime nada — el compositor ya no tiene ese
// bloque, y reintroducirlo haría fallar esto.
const FRANJA_FRASE = { x: 0.05, y: 0.62, w: 0.90, h: 0.21 };
const piezaVieja = await tinta({
    ...DOC, renderMode: 'ai', simple: true, backdropUrl: BLANCO, branding: {},
    phraseOverlay: true, message: 'Una historia de servicio que sigue transformando comunidades.',
}, FRANJA_FRASE);
check('v4.924: una pieza vieja con `phraseOverlay` guardado NO imprime ninguna frase',
    piezaVieja < 0.0005, `tinta ${piezaVieja.toFixed(4)}`);

// Y en `plain` (el respaldo sin imagen del modelo) la estructura de texto SÍ
// sale aunque el documento diga simple: ahí no hay imagen que traiga el texto.
const plainSimple = await tinta({ ...DOC, renderMode: 'plain', simple: true, zoneId: 'left', branding: {} },
    { x: 0.05, y: 0.15, w: 0.42, h: 0.60 });
check('v4.907: en `plain` el texto propio SÍ sale aunque el documento diga simple',
    plainSimple > 0.003, `tinta ${plainSimple.toFixed(4)}`);

// v4.911 — UNA CARGA COLGADA NO DEJA LA VISTA EN BLANCO PARA SIEMPRE. El
// reporte: pieza lista, botones pintados, lienzo vacío por minutos sin un
// solo error — una petición de imagen que nunca terminaba dejaba la promesa
// sin resolver. El tope la convierte en el rechazo que los caminos de
// degradación ya saben pintar.
// Por PREDICADO, no por glob: la URL viaja codificada dentro de ?url= y el
// «/» previo es %2F, así que '**/hang-image**' no casaría y la petición
// caería en la ruta del API — que contesta, y entonces no hay cuelgue que
// probar.
await page.route(u => u.href.includes('hang-image'), () => { /* nunca se contesta */ });
const colgada = await page.evaluate(async () => {
    const guardia = new Promise(res => setTimeout(() => res('sigue-colgada'), 5000));
    const carga = window.AR.loadImage('https://bucket.s3.amazonaws.com/hang-image.png', { timeoutMs: 600 })
        .then(() => 'resolvió', (e) => String(e.message));
    return Promise.race([carga, guardia]);
});
check('v4.911: una imagen que nunca llega RECHAZA por tope, no cuelga',
    /tardó demasiado/.test(String(colgada)), String(colgada));

// v4.915 — EL DISEÑO YA PAGADO NO SE PIERDE POR UN TROPIEZO DE CARGA. Del
// reporte con captura: el diseño existía en el almacenamiento y la pieza
// salió plana —y SIN un solo texto— porque el ÚNICO intento de cargarlo
// falló. Dos mitades: el reintento salva el tropiezo puntual, y cuando ni
// así carga, el respaldo imprime la estructura de texto (en modo simple la
// capa venía apagada «porque la imagen trae el texto» — acá no hay imagen).
// La ruta va DESPUÉS del catch-all a propósito: Playwright resuelve la
// última registrada primero (lección de este mismo arnés).
let flakyIntentos = 0;
await page.route(u => u.href.includes('flaky-backdrop'), (route) => {
    flakyIntentos += 1;
    if (flakyIntentos === 1) return route.fulfill({ status: 502, body: '' });
    return route.fulfill({
        contentType: 'image/svg+xml',
        body: Buffer.from(PNG_FONDO.split(',')[1], 'base64'),
        headers: { 'Access-Control-Allow-Origin': '*' },
    });
});
const reintentado = await page.evaluate(async (doc) => {
    const r = await window.AR.renderAnniversary(doc);
    return { failed: r.backdropFailed, avisos: r.warnings.length };
}, { ...DOC, simple: true, backdropUrl: 'https://bucket.s3.amazonaws.com/flaky-backdrop.png', branding: {} });
check('v4.915: un 502 puntual NO pierde el diseño — el reintento lo carga',
    reintentado.failed === false && reintentado.avisos === 0 && flakyIntentos === 2,
    JSON.stringify({ ...reintentado, flakyIntentos }));

// Agotados los reintentos (la URL cae en el 404 del catch-all las tres
// veces): v4.924 — SIN PIEZA SUSTITUTA, por directiva expresa («la IA genera
// A → A se muestra; nunca A falla → se muestra B»). El fallo se DECLARA y el
// lienzo queda vacío: ni la fotografía suelta ni la estructura de texto que
// v4.915 componía — eso presentaba como pieza algo que no corresponde a la
// generación. La pantalla muestra el error con «Reintentar la carga».
const DOC_CAIDO = { ...DOC, simple: true, zoneId: 'left', branding: {}, backdropUrl: 'https://bucket.s3.amazonaws.com/never-backdrop.png' };
const caido = await page.evaluate(async (doc) => {
    const r = await window.AR.renderAnniversary(doc);
    const { data } = r.canvas.getContext('2d').getImageData(0, 0, r.canvas.width, r.canvas.height);
    let rojos = 0, oscuros = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 140 && data[i + 1] < 100 && data[i + 2] < 100) rojos++;
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (l < 150) oscuros++;
    }
    const n = data.length / 4;
    return {
        failed: r.backdropFailed,
        aviso: r.warnings.some(w => /no se pudo cargar al navegador/i.test(w) && /MISMA pieza/.test(w)),
        rojos: rojos / n, oscuros: oscuros / n,
    };
}, DOC_CAIDO);
check('v4.924: agotados los reintentos, el fallo se DECLARA con el aviso de la MISMA pieza',
    caido.failed === true && caido.aviso === true, JSON.stringify(caido));
check('v4.924: y NO se compone ninguna pieza sustituta — ni foto suelta ni texto',
    caido.rojos < 0.0005 && caido.oscuros < 0.0005, JSON.stringify(caido));

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

// v4.917 — EL PIE INSTITUCIONAL SE IMPRIME TAL CUAL (pedido expreso): ancho
// completo, proporción NATIVA y anclado al borde inferior. Hasta v4.916 se
// dibujaba con cover recortado a la banda del 16 %: un pie de otra
// proporción salía mutilado. Se mide con un pie azul puro de proporción
// 0,12 (1000×120): el borde superior del azul tiene que caer en
// H − 0,12·W, no en el borde de la banda.
const PIE_AZUL = 'data:image/svg+xml;base64,' + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="120"><rect width="1000" height="120" fill="#0000ff"/></svg>').toString('base64');
const piePos = await page.evaluate(async (doc) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const c = canvas.getContext('2d');
    const esAzul = (x, y) => {
        const d = c.getImageData(x, y, 1, 1).data;
        return d[2] > 200 && d[0] < 80 && d[1] < 80;
    };
    // buscar el primer renglón azul desde arriba, por el centro
    let top = -1;
    for (let y = Math.round(canvas.height * 0.7); y < canvas.height; y += 2) {
        if (esAzul(Math.round(canvas.width / 2), y)) { top = y; break; }
    }
    return {
        top, H: canvas.height, W: canvas.width,
        izquierda: esAzul(2, canvas.height - 4),
        derecha: esAzul(canvas.width - 3, canvas.height - 4),
        fondo: esAzul(Math.round(canvas.width / 2), canvas.height - 4),
    };
}, { ...DOC, renderMode: 'ai', backdropUrl: BLANCO, branding: { footerImage: PIE_AZUL } });
const esperado = piePos.H - 0.12 * piePos.W;
check('v4.917: el pie va TAL CUAL — proporción nativa, anclado al borde inferior',
    piePos.fondo && piePos.top > 0 && Math.abs(piePos.top - esperado) < piePos.H * 0.02,
    `top ${piePos.top} vs esperado ${Math.round(esperado)}`);
check('y ocupa el ancho COMPLETO, sin recorte lateral',
    piePos.izquierda && piePos.derecha, JSON.stringify(piePos));

// ── v4.922 — el pie es la CAPA FINAL y la frase ESQUIVA lo ocupado ────

// Del reporte con captura: los «logos duplicados» del pie eran NUESTRO
// logotipo del club y NUESTRA línea de distrito pintados ENCIMA del PNG del
// pie (la regla de v4.917 los imprimía «en la banda»). Con el pie puesto,
// nada se imprime sobre él: el PNG es la firma completa y va pixel-perfect.
const LOGO_ROJO = 'data:image/svg+xml;base64,' + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ff0000"/></svg>').toString('base64');
const sobrePie = await page.evaluate(async (doc) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const c = canvas.getContext('2d');
    const y0 = Math.round(canvas.height * 0.86);
    const { data } = c.getImageData(0, y0, canvas.width, canvas.height - y0);
    let rojos = 0, azules = 0, oscuros = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 90) rojos++;
        if (data[i + 2] > 180 && data[i] < 90 && data[i + 1] < 90) azules++;
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // la tinta de la línea del distrito es gris oscura — el AZUL puro del
        // pie también tiene luminancia baja y no cuenta como tinta
        if (l < 60 && data[i + 2] < 120) oscuros++;
    }
    const n = data.length / 4;
    return { rojos: rojos / n, azules: azules / n, oscuros: oscuros / n };
}, {
    ...DOC, renderMode: 'ai', backdropUrl: BLANCO,
    branding: { footerImage: PIE_AZUL, clubLogo: LOGO_ROJO, districtLine: 'Distrito 4271 · 2026-2027' },
});
check('v4.922: con el pie puesto, el logotipo del club NO se imprime encima',
    sobrePie.rojos < 0.0005 && sobrePie.azules > 0.3,
    JSON.stringify(sobrePie));
check('…ni la línea del distrito: el PNG del pie queda pixel-perfect',
    sobrePie.oscuros < 0.002, JSON.stringify(sobrePie));

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
