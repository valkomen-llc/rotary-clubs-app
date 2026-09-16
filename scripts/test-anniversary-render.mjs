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
// ⚠️ LAS BANDAS SE LEEN DE LA FUENTE DE VERDAD, no se escriben a mano acá.
// Copiadas, mover una banda dejaría esta prueba midiendo la franja anterior y
// pasando en verde con el nombre del club impreso en otro sitio — que es el
// defecto que v4.1065 vino a cerrar. El espejo del navegador se compara contra
// este mismo archivo en `npm run test:anniversary`.
import { STANDARD_LAYOUT, PHOTO_FRAME } from '../server/lib/anniversarySpec.js';

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

// ⚠️ v4.1064 SUPERSEDE v4.907 EN ESTE PUNTO. Aquélla apagaba la capa de texto
// del compositor «porque el texto viene DENTRO de la imagen del modelo», y eso
// es justo lo que producía «Club Rotario Bogota Capital»: un modelo de imagen
// no escribe nombres propios de forma fiable. Ahora el flujo simple SÍ imprime
// —el modelo entrega un fondo sin una sola letra— y lo único que apaga la capa
// es `lettered: true`, o sea un prompt EDITADO que vuelva a pedirle rotular.
const CUERPO = { x: 0, y: 0, w: 1, h: 0.84 };
const conCapa = await tinta({ ...DOC, renderMode: 'ai', backdropUrl: BLANCO, branding: {} }, CUERPO);
const simpleEscribe = await tinta({ ...DOC, renderMode: 'ai', simple: true, backdropUrl: BLANCO, branding: {} }, CUERPO);
const modeloRotula = await tinta({ ...DOC, renderMode: 'ai', simple: true, lettered: true, backdropUrl: BLANCO, branding: {} }, CUERPO);
check('v4.1064: el flujo simple SÍ imprime los textos institucionales',
    simpleEscribe > 0.005, `tinta ${simpleEscribe.toFixed(4)}`);
check('v4.1064: y si el modelo ya rotuló, el compositor NO escribe encima',
    modeloRotula < 0.0005, `tinta ${modeloRotula.toFixed(4)}`);
check('la estructura completa (modo plain) sigue escribiendo como siempre',
    conCapa > 0.005, `tinta ${conCapa.toFixed(4)}`);
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


// ════════════════════════════════════════════════════════════════════
grupo('5 — v4.1064: EL CASO DE ACEPTACIÓN, rasterizado');

// ⚠️ ESTA ES LA COMPROBACIÓN QUE EL REPORTE EXIGE: no que el string llegue
// bien, sino que el PNG salga bien. «Bogotá Capital» / 10 años, con el
// compositor REAL y la fotografía REAL, y se mira el LIENZO.
//
// Las tres formas de fallar que esto atrapa y una prueba de criterio no:
//   · que la «á» no exista en la tipografía y salga un cuadrito (o nada);
//   · que el compositor mida con una letra y dibuje con otra;
//   · que el texto caiga fuera de la franja que el prompt dejó limpia.

const ACEPTACION = {
    ...DOC,
    renderMode: 'ai', simple: true, backdropUrl: BLANCO, branding: {},
    clubName: 'Club Rotario Bogotá Capital', years: 10,
    title: '', message: '',
};

// El mapa de tinta de un texto dibujado con el MISMO cuerpo y la MISMA
// tipografía que usa la capa institucional. Si dos textos distintos dan el
// mismo mapa, la diferencia no se está rasterizando.
const mapa = (texto) => page.evaluate((t) => {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 200;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 200);
    g.fillStyle = '#000';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 110px 'Oswald', 'Open Sans', system-ui, sans-serif`;
    g.fillText(t, 450, 110);
    const { data } = g.getImageData(0, 0, 900, 200);
    let n = 0; const filas = new Set();
    const bits = [];
    for (let i = 0; i < data.length; i += 4) {
        const osc = data[i] < 150;
        bits.push(osc ? 1 : 0);
        if (osc) { n++; filas.add(Math.floor((i / 4) / 900)); }
    }
    return { n, alto: filas.size, huella: bits.join('') };
}, texto);

// ── 1. La tipografía DIBUJA los diacríticos ──────────────────────────
//
// Se compara la palabra con tilde contra la misma sin ella: si la fuente no
// tuviera la «Á», las dos darían el mismo mapa (o la acentuada daría un
// cuadrito de .notdef, que ocupa MÁS y es igual para toda letra ausente).
for (const [con, sin] of [
    ['BOGOTÁ', 'BOGOTA'], ['MEDELLÍN', 'MEDELLIN'], ['TULUÁ', 'TULUA'],
    ['MONTERÍA', 'MONTERIA'], ['CÚCUTA', 'CUCUTA'], ['JOSÉ', 'JOSE'],
    ['MUÑOZ', 'MUNOZ'], ['PEÑA', 'PENA'], ['PINGÜINO', 'PINGUINO'],
    ['INFORMACIÓN', 'INFORMACION'],
]) {
    const a = await mapa(con), b = await mapa(sin);
    check(`la tipografía dibuja «${con}» distinto de «${sin}»`,
        a.huella !== b.huella && a.n > b.n, `${a.n} vs ${b.n} píxeles`);
    // El diacrítico SUBE la caja del texto: si saliera un .notdef en su lugar,
    // el alto no cambiaría de esta forma.
    check(`  y «${con}» ocupa más alto — el acento se rasteriza`,
        a.alto > b.alto, `${a.alto} vs ${b.alto} filas`);
}
// Los signos de apertura del saludo y del español en general.
for (const g of ['¡', '¿', 'ü', 'Ü', 'ñ', 'Ñ']) {
    const m = await mapa(g);
    check(`la tipografía tiene glifo para «${g}»`, m.n > 0, `${m.n} píxeles`);
}

// ── 2. La pieza de aceptación, medida en el lienzo ───────────────────
const bandas = await page.evaluate(async ({ doc, L }) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const g = canvas.getContext('2d');
    const region = (y0, y1) => {
        const y = Math.round(y0 * canvas.height), h = Math.round((y1 - y0) * canvas.height);
        const { data } = g.getImageData(0, y, canvas.width, h);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
            const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (l < 200) n++;
        }
        return n / (canvas.width * h);
    };
    return {
        saludo: region(L.headline.y, L.headline.y + L.headline.h),
        club: region(L.club.y, L.club.y + L.club.h),
        anos: region(L.years.y, L.years.y + L.years.h),
        // La franja entre el nombre y el borde superior del marco tiene que
        // quedar limpia: es el aire de la composición aprobada, y es también
        // donde el prompt le pide al modelo que no decore.
        aire: region(L.club.y + L.club.h, L.photo.y),
        png: (await new Promise(r => canvas.toBlob(r, 'image/png'))).size,
        w: canvas.width, h: canvas.height,
    };
}, { doc: ACEPTACION, L: STANDARD_LAYOUT });

check('ACEPTACIÓN · el saludo se rasteriza en su banda', bandas.saludo > 0.01, bandas.saludo.toFixed(4));
check('ACEPTACIÓN · el nombre del club se rasteriza en la suya', bandas.club > 0.008, bandas.club.toFixed(4));
check('ACEPTACIÓN · la cifra y su cinta, en la suya', bandas.anos > 0.01, bandas.anos.toFixed(4));
check('ACEPTACIÓN · el aire entre bandas queda limpio', bandas.aire < 0.02, bandas.aire.toFixed(4));
check('ACEPTACIÓN · el PNG sale con las medidas de la pieza',
    bandas.w === 1080 && bandas.h === 1080 && bandas.png > 1000, `${bandas.w}×${bandas.h}, ${bandas.png} bytes`);

// ── 3. La tilde LLEGA AL LIENZO ──────────────────────────────────────
//
// La prueba definitiva: la MISMA pieza con «Bogotá» y con «Bogota». Si el
// compositor plegara el diacrítico en cualquier punto, las dos bandas del
// nombre saldrían idénticas píxel a píxel.
const dosPiezas = await page.evaluate(async ({ a, b, L }) => {
    const banda = async (doc) => {
        const { canvas } = await window.AR.renderAnniversary(doc);
        const y = Math.round(L.club.y * canvas.height), h = Math.round(L.club.h * canvas.height);
        const w = canvas.width;
        const { data } = canvas.getContext('2d').getImageData(0, y, w, h);
        let n = 0, primeraFila = -1; const bits = [];
        for (let i = 0; i < data.length; i += 4) {
            const osc = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 200;
            bits.push(osc ? 1 : 0);
            if (osc) { n++; if (primeraFila < 0) primeraFila = Math.floor((i / 4) / w); }
        }
        return { n, primeraFila, huella: bits.join('') };
    };
    return { conTilde: await banda(a), sinTilde: await banda(b) };
}, { a: ACEPTACION, b: { ...ACEPTACION, clubName: 'Club Rotario Bogota Capital' }, L: STANDARD_LAYOUT });

check('ACEPTACIÓN · «Bogotá» y «Bogota» NO dan el mismo lienzo',
    dosPiezas.conTilde.huella !== dosPiezas.sinTilde.huella,
    'el compositor está plegando el diacrítico');
// ⚠️ Y la diferencia es EL ACENTO, no ruido de antialias: la versión con
// tilde empieza a tener tinta MÁS ARRIBA dentro de la banda, porque la «Á»
// sube por encima de la altura de mayúscula. Contar píxeles totales NO sirve
// —un desplazamiento de medio píxel en el reparto de los dos tonos mueve la
// cuenta en una docena— y la primera vez esta comprobación falló por eso.
check('ACEPTACIÓN · y la diferencia es el ACENTO: la tinta empieza más arriba',
    dosPiezas.conTilde.primeraFila >= 0
    && dosPiezas.conTilde.primeraFila < dosPiezas.sinTilde.primeraFila,
    `fila ${dosPiezas.conTilde.primeraFila} vs ${dosPiezas.sinTilde.primeraFila}`);

// ── 4. Nunca el nombre DOS veces ─────────────────────────────────────
const doble = await page.evaluate(async ({ doc, L }) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const y = Math.round(L.club.y * canvas.height), h = Math.round(L.club.h * canvas.height);
    const { data } = canvas.getContext('2d').getImageData(0, y, canvas.width, h);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 200) n++;
    return n;
}, { doc: { ...ACEPTACION, lettered: true }, L: STANDARD_LAYOUT });
check('ACEPTACIÓN · con el prompt editado (el modelo rotula) el compositor NO escribe',
    doble === 0, `${doble} píxeles donde no debería haber ninguno`);


// ════════════════════════════════════════════════════════════════════
grupo('5 — v4.1065 · La PLANTILLA es determinista: Neiva 48 y Bogotá Centenario 10');

// ⚠️ ESTA ES LA REGRESIÓN QUE PIDE EL REPORTE, y son las dos generaciones
// exigidas: la pieza maestra aprobada (Club Rotario Neiva, 48 años) y la que
// falló (Club Rotario Bogotá Centenario, 10 años). Lo que se comprueba no es
// que «se vean bien» —eso no lo mide una prueba— sino las dos afirmaciones
// concretas del pedido:
//
//   · la CAPA FIJA es la misma en las dos piezas, píxel a píxel, salvo las
//     dos bandas de datos variables;
//   · la CAPA VARIABLE no invade nada: el nombre del club NO cae encima de la
//     fotografía, y la fotografía NO se sale de su marco.
//
// v4.1064 le pedía al modelo la geometría POR ESCRITO —«la foto del 40 % al
// 68 % del alto»— y un modelo generativo no la cumple: en el caso reportado la
// puso arrancando cerca del 29 %, la banda del nombre cayó DENTRO de ella y
// «CLUB ROTARIO BOGOTÁ CENTENARIO» salió impreso sobre la fotografía. Desde
// v4.1065 la fotografía la coloca el COMPOSITOR en el marco declarado, así que
// esto se puede medir.

const PIEZA = (clubName, years) => ({
    ...DOC,
    renderMode: 'ai', simple: true, framed: true,
    backdropUrl: BLANCO, photoUrl: PNG_FOTO, branding: {},
    title: '', message: '',
    clubName, years,
});

const medir = (doc) => page.evaluate(async ({ doc, L, F }) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const W = canvas.width, H = canvas.height;
    const g = canvas.getContext('2d');
    const box = window.AR.photoFrameBox(L.photo, W, H);
    const px = (x, y) => {
        const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return { r: d[0], g: d[1], b: d[2] };
    };
    const esRojo = (c) => c.r > 140 && c.g < 100 && c.b < 100;
    // Cuántos píxeles de LA FOTOGRAFÍA (el rojo del fixture) hay en una región.
    const rojos = (x0, y0, x1, y1) => {
        const x = Math.round(x0), y = Math.round(y0);
        const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
        const { data } = g.getImageData(x, y, w, h);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 140 && data[i + 1] < 100 && data[i + 2] < 100) n++;
        }
        return n / (w * h);
    };
    const oscuros = (x0, y0, x1, y1) => {
        const x = Math.round(x0), y = Math.round(y0);
        const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
        const { data } = g.getImageData(x, y, w, h);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 200) n++;
        }
        return n / (w * h);
    };
    return {
        box,
        centroFoto: esRojo(px(box.inner.x + box.inner.w / 2, box.inner.y + box.inner.h / 2)),
        // El interior del marco es la fotografía, de borde a borde (cover).
        interior: rojos(box.inner.x + 2, box.inner.y + 2, box.inner.x + box.inner.w - 2, box.inner.y + box.inner.h - 2),
        // El margen blanco del marco: la fotografía NO llega ahí.
        mat: rojos(box.x + 1, box.y + 1, box.x + box.w - 1, box.y + Math.max(2, (box.inner.y - box.y) - 1)),
        // ⚠️ LA BANDA DEL NOMBRE: acá NO puede haber un solo píxel de foto.
        bandaClub: rojos(0, L.club.y * H, W, (L.club.y + L.club.h) * H),
        // Ni arriba del marco.
        sobreMarco: rojos(0, L.headline.y * H, W, box.y - 1),
        // El nombre del club, rasterizado en su banda.
        tintaClub: oscuros(0, L.club.y * H, W, (L.club.y + L.club.h) * H),
        // La franja de aire entre el nombre y el marco queda limpia.
        aire: oscuros(0, (L.club.y + L.club.h) * H, W, box.y),
        // La cifra, en su banda.
        tintaAnos: oscuros(0, L.years.y * H, W, (L.years.y + L.years.h) * H),
        // El lienzo entero, para comparar las dos piezas.
        huella: [...g.getImageData(0, 0, W, H).data].join(','),
        W, H,
    };
}, { doc, L: STANDARD_LAYOUT, F: PHOTO_FRAME });

const neiva = await medir(PIEZA('Club Rotario Neiva', 48));
const centenario = await medir(PIEZA('Club Rotario Bogotá Centenario', 10));

for (const [rotulo, m] of [['A · Neiva 48', neiva], ['B · Bogotá Centenario 10', centenario]]) {
    check(`${rotulo} · la fotografía se dibuja DENTRO de su marco`, m.centroFoto === true);
    check(`${rotulo} · y llena el interior del marco (cover, sin deformarla)`,
        m.interior > 0.97, `${(m.interior * 100).toFixed(1)} %`);
    check(`${rotulo} · el margen blanco del marco queda limpio`,
        m.mat < 0.02, `${(m.mat * 100).toFixed(1)} %`);
    check(`${rotulo} · ⚠️ el nombre del club NO cae sobre la fotografía`,
        m.bandaClub === 0, `${(m.bandaClub * 100).toFixed(2)} % de la banda es foto`);
    check(`${rotulo} · la fotografía no sube por encima de su marco`,
        m.sobreMarco === 0, `${(m.sobreMarco * 100).toFixed(2)} %`);
    check(`${rotulo} · el nombre se rasteriza en su banda reservada`,
        m.tintaClub > 0.004, m.tintaClub.toFixed(4));
    check(`${rotulo} · el aire entre el nombre y el marco queda limpio`,
        m.aire < 0.03, m.aire.toFixed(4));
    check(`${rotulo} · la cifra y su cinta salen en su banda`,
        m.tintaAnos > 0.01, m.tintaAnos.toFixed(4));
}

// ⚠️ LA CAPA FIJA ES LA MISMA EN LAS DOS PIEZAS. Se comparan los dos lienzos
// fuera de las dos bandas de datos variables: si el compositor reorganizara el
// diseño según el largo del nombre —mover la foto, cambiar el marco, correr el
// pie— acá se vería. Es la afirmación literal del pedido: «el compositor
// simplemente sustituye esos campos en posiciones predefinidas».
const fijas = await page.evaluate(({ a, b, L, W }) => {
    const A = a.split(','), B = b.split(',');
    const y0 = Math.round(L.club.y * W), y1 = Math.round((L.club.y + L.club.h) * W);
    const y2 = Math.round(L.years.y * W), y3 = Math.round((L.years.y + L.years.h) * W);
    let distintos = 0, total = 0;
    for (let y = 0; y < W; y++) {
        if ((y >= y0 && y < y1) || (y >= y2 && y < y3)) continue;
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            total++;
            if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) distintos++;
        }
    }
    return { distintos, total };
}, { a: neiva.huella, b: centenario.huella, L: STANDARD_LAYOUT, W: neiva.W });

check('⚠️ la CAPA FIJA es idéntica en las dos piezas, píxel a píxel',
    fijas.distintos === 0, `${fijas.distintos} de ${fijas.total} píxeles difieren fuera de las bandas variables`);
check('y el marco de la fotografía cae en el MISMO sitio en las dos',
    JSON.stringify(neiva.box) === JSON.stringify(centenario.box));

// La tilde, en la pieza del reporte.
const tildeCentenario = await page.evaluate(async ({ a, b, L }) => {
    const banda = async (doc) => {
        const { canvas } = await window.AR.renderAnniversary(doc);
        const y = Math.round(L.club.y * canvas.height), h = Math.round(L.club.h * canvas.height);
        const { data } = canvas.getContext('2d').getImageData(0, y, canvas.width, h);
        let n = 0, primera = -1;
        for (let i = 0; i < data.length; i += 4) {
            if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 200) {
                n++; if (primera < 0) primera = Math.floor((i / 4) / canvas.width);
            }
        }
        return { n, primera };
    };
    return { con: await banda(a), sin: await banda(b) };
}, { a: PIEZA('Club Rotario Bogotá Centenario', 10), b: PIEZA('Club Rotario Bogota Centenario', 10), L: STANDARD_LAYOUT });

check('B · la tilde de «BOGOTÁ» llega al lienzo — la tinta empieza más arriba',
    tildeCentenario.con.primera >= 0 && tildeCentenario.con.primera < tildeCentenario.sin.primera,
    `fila ${tildeCentenario.con.primera} vs ${tildeCentenario.sin.primera}`);


// ════════════════════════════════════════════════════════════════════
grupo('5b — v4.1065 · La zona reservada NO depende de lo que devuelva el modelo');

// ⚠️ ESTO ES LA GARANTÍA, no una preferencia estética. El prompt le pide al
// modelo dejar la columna central limpia, y un pedido en palabras no obliga a
// nada: el defecto reportado fue justamente el modelo ocupando el centro con la
// fotografía. Acá se le da un fondo HOSTIL —el lienzo entero del rojo del
// fixture, que es lo que devolvería si editara la foto— y se mide que el
// saludo, el nombre y la cifra sigan legibles y que el velo no alcance a los
// márgenes, donde viven los globos.
const HOSTIL = (clubName, years) => ({ ...PIEZA(clubName, years), backdropUrl: PNG_FOTO });

const velo = await page.evaluate(async ({ doc, L }) => {
    const { canvas } = await window.AR.renderAnniversary(doc);
    const W = canvas.width, H = canvas.height;
    const g = canvas.getContext('2d');
    // ⚠️ SE MIDE SI EL FONDO DEL MODELO ASOMA, no la claridad promedio: el
    // promedio —y hasta la proporción de píxeles claros— los arrastra hacia
    // abajo NUESTRO propio texto azul, que es oscuro a propósito, así que
    // dirían que el velo no actuó cuando lo que se ve es la tinta del saludo.
    // Lo que de verdad importa es que en el corredor del texto no quede ni un
    // píxel del rojo del fixture — el fondo que el modelo devolvió.
    const rojos = (x0, y0, x1, y1) => {
        const x = Math.round(x0), y = Math.round(y0);
        const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
        const { data } = g.getImageData(x, y, w, h);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 140 && data[i + 1] < 120 && data[i + 2] < 120) n++;
        }
        return n / (w * h);
    };
    const claros = (x0, y0, x1, y1) => {
        const x = Math.round(x0), y = Math.round(y0);
        const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
        const { data } = g.getImageData(x, y, w, h);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] > 200) n++;
        }
        return n / (w * h);
    };
    const oscuros = (x0, y0, x1, y1) => {
        const x = Math.round(x0), y = Math.round(y0);
        const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
        const { data } = g.getImageData(x, y, w, h);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 160) n++;
        }
        return n / (w * h);
    };
    const banda = (b) => [b.x * W, b.y * H, (b.x + b.w) * W, (b.y + b.h) * H];
    // EL CORREDOR DEL TEXTO, no la banda entera: el saludo y el nombre van
    // centrados y acotados (el nombre, al 74 % de su banda), y los extremos de
    // la banda son donde van las líneas doradas. Pedir que la banda COMPLETA
    // saliera clara obligaría a estirar el velo hasta los márgenes laterales,
    // que es justo donde el modelo pone los globos.
    const corredor = (b) => [0.20 * W, b.y * H, 0.80 * W, (b.y + b.h) * H];
    return {
        // El centro de cada banda reservada queda CLARO pese al fondo rojo.
        headline: rojos(...corredor(L.headline)),
        club: rojos(...corredor(L.club)),
        // Y el texto se lee: hay tinta oscura donde se escribió.
        tintaHeadline: oscuros(...corredor(L.headline)),
        tintaClub: oscuros(...corredor(L.club)),
        // Los márgenes NO se lavan: ahí el fondo del modelo manda.
        esquina: rojos(4, 4, 80, 80),
        margenIzq: rojos(2, 0.45 * H, 24, 0.55 * H),
    };
}, { doc: HOSTIL('Club Rotario Bogotá Centenario', 10), L: STANDARD_LAYOUT });

check('⚠️ con el centro ocupado por el modelo, su fondo NO asoma donde va el saludo',
    velo.headline < 0.005, `${(velo.headline * 100).toFixed(2)} % del corredor sigue siendo el fondo`);
check('ni donde va el nombre del club',
    velo.club < 0.005, `${(velo.club * 100).toFixed(2)} %`);
check('el saludo sigue legible sobre ese fondo', velo.tintaHeadline > 0.01, velo.tintaHeadline.toFixed(4));
check('y el nombre del club también', velo.tintaClub > 0.003, velo.tintaClub.toFixed(4));
check('⚠️ y el fondo del modelo SOBREVIVE en las esquinas — ahí van los globos',
    velo.esquina > 0.95, `${(velo.esquina * 100).toFixed(1)} % de la esquina es fondo`);
check('y en el margen lateral', velo.margenIzq > 0.50, `${(velo.margenIzq * 100).toFixed(1)} %`);

// Con un fondo correcto —blanco liso en el centro, que es lo que el prompt
// pide— el velo no cambia NI UN PÍXEL: no es un elemento visual añadido.
const sinEfecto = await page.evaluate(async ({ a }) => {
    const h = async (doc) => {
        const { canvas } = await window.AR.renderAnniversary(doc);
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        return [...data].join(',');
    };
    const conVelo = await h(a);
    const sinVelo = await h({ ...a, framed: false, photoUrl: null });
    return { conVelo, sinVelo };
}, { a: PIEZA('Club Rotario Neiva', 48) });

const bandasFuera = await page.evaluate(({ a, b, L, W }) => {
    const A = a.split(','), B = b.split(',');
    // Fuera de la banda de la fotografía —lo único que el velo acompaña— el
    // lienzo blanco sale idéntico con velo y sin él.
    const y0 = Math.round((L.photo.y - 0.04) * W), y1 = Math.round((L.photo.y + L.photo.h + 0.06) * W);
    let distintos = 0;
    for (let y = 0; y < W; y++) {
        if (y >= y0 && y < y1) continue;
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) distintos++;
        }
    }
    return distintos;
}, { a: sinEfecto.conVelo, b: sinEfecto.sinVelo, L: STANDARD_LAYOUT, W: neiva.W });

check('sobre un fondo correcto el velo no cambia ni un píxel',
    bandasFuera === 0, `${bandasFuera} píxeles difieren`);


// ════════════════════════════════════════════════════════════════════
grupo('5c — v4.1066 · Consistencia entre clubes: Bogotá Chicó 10, Tuluá 50, Tuluá El Lago 60');

// ⚠️ ESTOS SON LOS TRES CASOS QUE EXIGE EL PEDIDO, y lo que se comprueba es la
// afirmación que los acompaña: «layout idéntico; sólo cambian foto, nombre y
// número». No es una repetición del bloque 5 con otros nombres — ahí se midió
// una pieza corta contra una larga; acá entra «CLUB ROTARIO TULUÁ EL LAGO»,
// que es el nombre más largo del pedido y el que obliga al auto-ajuste
// tipográfico a reducir el cuerpo o a partir en dos líneas. Justamente ahí es
// donde un compositor mal escrito empezaría a mover cosas: bajar la foto para
// hacerle sitio al segundo renglón, o desbordar la banda hacia el marco.
//
// Se mide que las TRES piezas compartan la capa fija píxel a píxel, que el
// nombre no se salga de su banda por ningún lado y que las tildes de «Chicó» y
// «Tuluá» lleguen al lienzo.

const TRES = [
    ['Bogotá Chicó 10', 'Club Rotario Bogotá Chicó', 10],
    ['Tuluá 50', 'Club Rotario Tuluá', 50],
    ['Tuluá El Lago 60', 'Club Rotario Tuluá El Lago', 60],
];

const medidas = [];
for (const [rotulo, nombre, anos] of TRES) {
    const m = await medir(PIEZA(nombre, anos));
    medidas.push([rotulo, m]);
    check(`${rotulo} · la fotografía se dibuja DENTRO de su marco`, m.centroFoto === true);
    check(`${rotulo} · ⚠️ el nombre del club NO cae sobre la fotografía`,
        m.bandaClub === 0, `${(m.bandaClub * 100).toFixed(2)} % de la banda es foto`);
    check(`${rotulo} · el nombre se rasteriza en su banda reservada`,
        m.tintaClub > 0.004, m.tintaClub.toFixed(4));
    check(`${rotulo} · la cifra y su cinta salen en su banda`,
        m.tintaAnos > 0.01, m.tintaAnos.toFixed(4));
    check(`${rotulo} · el aire entre el nombre y el marco queda limpio`,
        m.aire < 0.03, m.aire.toFixed(4));
}

// ⚠️ EL NOMBRE NO SE SALE DE SU BANDA POR NINGÚN LADO, Y ESO INCLUYE EL
// ACENTO. Se mide la caja de la TINTA del nombre —no la del texto que el
// compositor creía escribir— dentro de la ventana que va del final de la banda
// del saludo al principio de la de la fotografía: así la medición no arrastra
// el filete dorado del saludo ni el borde del marco, que son capa FIJA y
// estarían ahí midiera lo que midiera.
//
// Esto destapó un defecto real de v4.1066: el acento de una Á o una Ó
// MAYÚSCULA se dibuja por encima del borde superior de la caja em, así que con
// el centrado nominal la tinta dorada de «TULUÁ» caía una fila por encima de la
// banda. Se corrigió centrando por la tinta, no por la caja em — sin tocar el
// cuerpo ni la banda, que es lo que el pedido prohíbe.
const desborde = await page.evaluate(async ({ docs, L }) => {
    const salida = [];
    for (const doc of docs) {
        const { canvas } = await window.AR.renderAnniversary(doc);
        const W = canvas.width, H = canvas.height;
        const g = canvas.getContext('2d');
        const y0 = Math.ceil((L.headline.y + L.headline.h) * H);
        const y1 = Math.floor((L.club.y + L.club.h) * H);
        const { data } = g.getImageData(0, y0, W, y1 - y0);
        let arriba = -1, abajo = -1, izq = W, der = -1;
        for (let y = 0; y < y1 - y0; y++) {
            for (let x = 0; x < W; x++) {
                const i = ((y * W) + x) * 4;
                // ⚠️ SE BUSCA CUALQUIER PÍXEL QUE NO SEA BLANCO, no «tinta
                // oscura»: el acento sale en DORADO y su borde antialiasado da
                // una luminancia de ~205, así que un umbral de oscuridad lo
                // daría por blanco y la comprobación pasaría con el defecto
                // delante. Verificado a la inversa.
                if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
                    if (arriba < 0) arriba = y + y0;
                    abajo = y + y0;
                    if (x < izq) izq = x;
                    if (x > der) der = x;
                }
            }
        }
        salida.push({ arriba, abajo, izq, der, W, H, y0, y1 });
    }
    return salida;
}, { docs: TRES.map(([, n, a]) => PIEZA(n, a)), L: STANDARD_LAYOUT });

for (let i = 0; i < TRES.length; i++) {
    const [rotulo] = TRES[i];
    const d = desborde[i];
    const topeArriba = STANDARD_LAYOUT.club.y * d.H;
    const topeAbajo = (STANDARD_LAYOUT.club.y + STANDARD_LAYOUT.club.h) * d.H;
    const topeIzq = STANDARD_LAYOUT.club.x * d.W;
    const topeDer = (STANDARD_LAYOUT.club.x + STANDARD_LAYOUT.club.w) * d.W;
    check(`${rotulo} · ⚠️ el acento no se sale de la banda por arriba`,
        d.arriba >= topeArriba, `fila ${d.arriba} vs ${topeArriba.toFixed(0)}`);
    // El borde inferior NO se comprueba acá: la sombra del marco de la
    // fotografía bleedea legítimamente hacia arriba, es capa FIJA y saldría
    // como un falso desborde del nombre. Lo que de verdad hace falta —que ahí
    // abajo no aparezca nada que dependa del nombre— lo garantizan
    // `m.aire` y la comparación píxel a píxel de la capa fija.
    void topeAbajo;
    check(`${rotulo} · ni por los costados`,
        d.izq >= topeIzq - 1 && d.der <= topeDer + 1,
        `${d.izq}–${d.der} vs ${topeIzq.toFixed(0)}–${topeDer.toFixed(0)}`);
}

// ⚠️ LA CAPA FIJA ES LA MISMA EN LAS TRES. Es la afirmación del punto 9 del
// pedido, y la que se rompería si el compositor le hiciera sitio al nombre
// largo moviendo la fotografía o el bloque de los años.
const fijasTres = await page.evaluate(({ huellas, L, W }) => {
    const y0 = Math.round(L.club.y * W), y1 = Math.round((L.club.y + L.club.h) * W);
    const y2 = Math.round(L.years.y * W), y3 = Math.round((L.years.y + L.years.h) * W);
    const A = huellas[0].split(',');
    let peor = 0;
    for (let k = 1; k < huellas.length; k++) {
        const B = huellas[k].split(',');
        let distintos = 0;
        for (let y = 0; y < W; y++) {
            if ((y >= y0 && y < y1) || (y >= y2 && y < y3)) continue;
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) distintos++;
            }
        }
        if (distintos > peor) peor = distintos;
    }
    return peor;
}, { huellas: medidas.map(([, m]) => m.huella), L: STANDARD_LAYOUT, W: medidas[0][1].W });

check('⚠️ la CAPA FIJA es idéntica en las TRES piezas, píxel a píxel',
    fijasTres === 0, `${fijasTres} píxeles difieren fuera de las bandas variables`);
check('y el marco de la fotografía cae en el MISMO sitio en las tres',
    medidas.every(([, m]) => JSON.stringify(m.box) === JSON.stringify(medidas[0][1].box)));

// Las tildes de los tres nombres del pedido llegan al lienzo.
const tildesTres = await page.evaluate(async ({ pares, L }) => {
    const banda = async (doc) => {
        const { canvas } = await window.AR.renderAnniversary(doc);
        const y = Math.round(L.club.y * canvas.height), h = Math.round(L.club.h * canvas.height);
        const { data } = canvas.getContext('2d').getImageData(0, y, canvas.width, h);
        let primera = -1;
        for (let i = 0; i < data.length; i += 4) {
            if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 200) {
                primera = Math.floor((i / 4) / canvas.width); break;
            }
        }
        return primera;
    };
    const salida = [];
    for (const [con, sin] of pares) salida.push({ con: await banda(con), sin: await banda(sin) });
    return salida;
}, {
    pares: [
        [PIEZA('Club Rotario Bogotá Chicó', 10), PIEZA('Club Rotario Bogota Chico', 10)],
        [PIEZA('Club Rotario Tuluá', 50), PIEZA('Club Rotario Tulua', 50)],
        [PIEZA('Club Rotario Tuluá El Lago', 60), PIEZA('Club Rotario Tulua El Lago', 60)],
    ],
    L: STANDARD_LAYOUT,
});

for (let i = 0; i < TRES.length; i++) {
    check(`${TRES[i][0]} · las tildes llegan al lienzo — la tinta empieza más arriba`,
        tildesTres[i].con >= 0 && tildesTres[i].con < tildesTres[i].sin,
        `fila ${tildesTres[i].con} vs ${tildesTres[i].sin}`);
}


await browser.close();

console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} de ${ok + malos.length} comprobaciones fallaron:`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones en un navegador. El compositor se comporta.`);
