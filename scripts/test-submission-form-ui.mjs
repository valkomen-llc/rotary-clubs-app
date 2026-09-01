#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El formulario público de aportes SE PUEDE ESCRIBIR — v4.972
//
// Reproduce el reporte literal: «cuando empiezo a escribir me lleva a la
// parte frontal y no me deja escribir más de una letra cada casilla».
//
// Es la prueba que faltaba: el defecto de v4.969 era de COMPORTAMIENTO en
// React —un componente declarado dentro de otro remonta el árbol en cada
// render— y no lo ve el typecheck, ni `check:hooks`, ni ninguna prueba de
// criterio. Sólo se ve escribiendo MÁS DE UNA LETRA.
//
// Desde v4.972 comprueba además lo que sólo se ve en una pantalla: que el
// selector de clubes deje elegir VARIOS y quitarlos, que las publicaciones no
// aparezcan hasta que se conteste que sí, y que el teléfono lleve su país.
//
// Pide `playwright` y el `dist/` compilado; se salta sola si faltan.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('· playwright no está instalado — se salta.'); process.exit(0); }
if (!existsSync('dist/index.html')) { console.log('· no hay dist/ — se salta.'); process.exit(0); }

const EJECUTABLE = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2','.jpg':'image/jpeg' };

const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(path.resolve('dist'), u);
    if (existsSync(f) && path.extname(f)) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        return res.end(readFileSync(f));
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(path.join(path.resolve('dist'), 'index.html')));
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let pass = 0, fail = 0;
const check = (nombre, ok, detalle = '') => {
    if (ok) { pass++; console.log(`  ✓ ${nombre}`); }
    else { fail++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};

const club = { id:'c1', name:'Distrito 4281', subdomain:'d4281', domain:'localhost', type:'district', status:'active', subscriptionStatus:'active', logo:'', settings:[], primaryColor:'#0c3c7c' };
const DISTRITOS = [
    { value: '4271', label: 'Distrito 4271', clubs: ['Barrancabermeja', 'Barranquilla'] },
    { value: '4281', label: 'Distrito 4281', clubs: ['Amazonas', 'Armenia International', 'Bogotá', 'Bogotá Norte'] },
];

const nav = await chromium.launch(EJECUTABLE ? { executablePath: EJECUTABLE } : {});
const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
// El comodín va PRIMERO: Playwright resuelve la ÚLTIMA ruta registrada antes.
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.route('**/api/clubs/by-domain**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(club) }));
await page.route('**/api/contribution-campaigns/submissions/form/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
        campaign: { id:'k1', slug:'emergencia', name:'Emergencia Terremoto Colombia 2026', title:'', badge:'EMERGENCIA', location:'Colombia', image:'', theme:{} },
        open: true, closedReason: null, headline: '', intro: '', thanksMessage: '',
        consentText: 'Autorizo…', consentIsProvisional: true,
        catalogs: { districts: DISTRITOS },
        defaultDistrict: '',
        platforms: [
            { id: 'instagram', label: 'Instagram' }, { id: 'facebook', label: 'Facebook' },
            { id: 'tiktok', label: 'TikTok' }, { id: 'otra', label: 'Otra' },
        ],
        limits: { maxFiles: 10, imageTypes: ['image/jpeg'], videoTypes: ['video/mp4'], imageMaxMb: 25, videoMaxMb: 200, maxClubs: 20, maxPosts: 20 },
    }),
}));

const errores = [];
page.on('pageerror', e => errores.push(String(e)));

console.log('\n── El formulario público de aportes ──');
await page.goto(`${base}/aportar-contenido/emergencia`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// ── Las cuatro preguntas comparten UNA tarjeta ──────────────────────
//
// Se comprueba EN LA PANTALLA y no sólo leyendo el archivo porque es lo que
// se reportó mirándola: cuatro tarjetas blancas seguidas se leen como cuatro
// formularios distintos. La prueba de criterio fija que no se abra otro marco
// en el código; ésta fija que, ya pintado, el marco sea el mismo nodo.
const mismaTarjeta = await page.evaluate(() => {
    const titulos = ['¿Qué ocurrió?', 'Datos de la actividad', 'Participación rotaria', 'Difusión realizada'];
    const marcos = titulos.map(t => {
        const h = [...document.querySelectorAll('h2')].find(x => x.textContent?.trim() === t);
        return h ? h.closest('.rounded-3xl') : null;
    });
    if (marcos.some(m => !m)) return { ok: false, motivo: 'falta alguno de los cuatro títulos' };
    const distintos = new Set(marcos).size;
    return { ok: distintos === 1, motivo: `${distintos} tarjetas` };
});
check('las cuatro preguntas de la actividad van en una sola tarjeta',
    mismaTarjeta.ok, mismaTarjeta.motivo);

// ── Escribir en una casilla de texto ────────────────────────────────
const NOMBRE = 'María Fernanda Restrepo';
const campoNombre = page.locator('input[autocomplete="name"]');
check('la casilla del nombre existe', await campoNombre.count() === 1);

await campoNombre.click();
// Se escribe TECLA POR TECLA, que es como escribe una persona: con `fill()`
// el valor se pone de una vez y el defecto —perder el foco tras cada
// pulsación— no se manifestaría. Ésta es la diferencia entre reproducir el
// reporte y pasar por el motivo equivocado.
await page.keyboard.type(NOMBRE, { delay: 25 });

const valorNombre = await campoNombre.inputValue();
check('conserva TODO lo escrito, no la primera letra', valorNombre === NOMBRE,
    `quedó «${valorNombre}» de «${NOMBRE}»`);

const sigueEnfocada = await page.evaluate(() =>
    document.activeElement?.getAttribute('autocomplete') === 'name');
check('la casilla NO pierde el foco al escribir', sigueEnfocada);

// ── La página no salta al principio ─────────────────────────────────
await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(150);
const antes = await page.evaluate(() => window.scrollY);
const correo = page.locator('input[autocomplete="email"]');
await correo.click();
await page.keyboard.type('maria@clubrotario.org', { delay: 25 });
await page.waitForTimeout(150);
const despues = await page.evaluate(() => window.scrollY);
check('la página no salta al principio al escribir', despues > 50,
    `estaba en ${antes}px y quedó en ${despues}px`);
check('el correo conserva lo escrito', await correo.inputValue() === 'maria@clubrotario.org');

// ── Un área de texto larga ──────────────────────────────────────────
const HISTORIA = 'Entregamos mercados en la vereda con veinte voluntarios del club.';
const relato = page.locator('textarea').first();
await relato.click();
await page.keyboard.type(HISTORIA, { delay: 10 });
check('el área de texto conserva la frase completa', await relato.inputValue() === HISTORIA,
    `quedó «${await relato.inputValue()}»`);

// ── Participación rotaria: distrito → clubes, multiselección ────────
//
// Los clubes NO se ofrecen hasta que hay distrito: sin él la lista sería de
// mil nombres. Es lo que hace que el formulario no se sienta más largo.
const distrito = page.locator('#distrito');
check('sin distrito, los clubes no se ofrecen todavía',
    (await page.getByPlaceholder('Buscá un club por su nombre').count()) === 0);

// ⚠️ EL HUECO DE CLUBES MIDE LO MISMO QUE EL CAMPO DE DISTRITO. Comparten
// línea, así que una diferencia de alto desalinea la fila entera y se lee
// como un descuido. La altura no se deduce del marcado: depende de si el
// texto entra en una línea, y eso sólo se sabe con el CSS compilado y el
// ancho real de la columna. Por eso se MIDE.
const altos = await page.evaluate(() => {
    const campo = document.querySelector('#distrito');
    const hueco = [...document.querySelectorAll('p')]
        .find(el => (el.textContent || '').trim().startsWith('Elegí primero el distrito'));
    if (!campo || !hueco) return null;
    const a = campo.getBoundingClientRect(), b = hueco.getBoundingClientRect();
    return { campo: Math.round(a.height), hueco: Math.round(b.height) };
});
check('el hueco de clubes mide lo mismo que el campo de distrito',
    altos !== null && Math.abs(altos.campo - altos.hueco) <= 2,
    altos ? `distrito ${altos.campo}px, hueco ${altos.hueco}px` : 'no se encontraron las dos cajas');

await distrito.selectOption('4281');
await page.waitForTimeout(200);
const buscador = page.getByPlaceholder('Buscá un club por su nombre');
check('elegir distrito abre el buscador de clubes', await buscador.count() === 1);

// ⚠️ QUE COMPARTAN LÍNEA SE MIDE, NO SE DEDUCE DEL MARCADO (v4.975). Es
// literalmente lo que se pidió mirando la pantalla, y una clase de rejilla
// escrita en el atributo puede no llegar al CSS —o llegar y perder la
// cascada, que es lo que costó la v4.974—. Se compara la geometría REAL.
const medir = async () => await page.evaluate(() => {
    const d = document.querySelector('#distrito');
    const c = document.querySelector('input[aria-label="Buscar un club participante"]');
    if (!d || !c) return null;
    const a = d.getBoundingClientRect(), b = c.getBoundingClientRect();
    return {
        dTop: Math.round(a.top), dRight: Math.round(a.right), dAncho: Math.round(a.width),
        cTop: Math.round(b.top), cLeft: Math.round(b.left), cAncho: Math.round(b.width),
    };
});
const anchoM = await medir();
check('el distrito y los clubes van en la MISMA línea',
    anchoM !== null && Math.abs(anchoM.dTop - anchoM.cTop) < 40 && anchoM.dRight <= anchoM.cLeft + 1,
    anchoM ? `distrito hasta ${anchoM.dRight}px, clubes desde ${anchoM.cLeft}px` : 'no se encontraron los campos');
check('ninguno de los dos se queda sin ancho utilizable',
    anchoM !== null && anchoM.dAncho >= 180 && anchoM.cAncho >= 180,
    anchoM ? `${anchoM.dAncho}px y ${anchoM.cAncho}px` : '');

// En un teléfono se apilan: media pantalla no da para una lista de clubes.
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(200);
const angostoM = await medir();
check('en un teléfono vuelven a apilarse',
    angostoM !== null && angostoM.cTop > angostoM.dTop,
    angostoM ? `distrito en ${angostoM.dTop}px, clubes en ${angostoM.cTop}px` : '');
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(200);

// Buscar por nombre y elegir DOS: una actividad la pueden haber hecho varios.
await buscador.click();
await page.keyboard.type('Bogotá', { delay: 20 });
await page.waitForTimeout(200);
const opciones = page.locator('button', { hasText: /^Bogotá/ });
check('el buscador filtra por nombre', (await opciones.count()) >= 2);
await page.getByRole('button', { name: 'Bogotá', exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: 'Bogotá Norte', exact: true }).click();
await page.waitForTimeout(150);
check('se pueden elegir VARIOS clubes', (await page.getByRole('button', { name: /^Quitar / }).count()) === 2);

// Y quitarlos de un gesto.
await page.getByRole('button', { name: 'Quitar Bogotá Norte' }).click();
await page.waitForTimeout(150);
check('una ficha se quita de un toque', (await page.getByRole('button', { name: /^Quitar / }).count()) === 1);

// ── La difusión previa es CONDICIONAL ───────────────────────────────
check('las publicaciones no se piden antes de contestar',
    (await page.locator('select[aria-label="Plataforma de la publicación"]').count()) === 0);

await page.getByRole('radio', { name: 'No' }).check();
await page.waitForTimeout(150);
check('con «No» no aparece ninguna casilla más',
    (await page.locator('select[aria-label="Plataforma de la publicación"]').count()) === 0);

await page.getByRole('radio', { name: 'Sí' }).check();
await page.waitForTimeout(200);
check('con «Sí» aparece la primera publicación',
    (await page.locator('select[aria-label="Plataforma de la publicación"]').count()) === 1);

// El enlace se escribe TECLA POR TECLA, como todo lo demás de esta prueba.
const URL_POST = 'https://instagram.com/p/CxYz123/';
await page.locator('select[aria-label="Plataforma de la publicación"]').first().selectOption('instagram');
const campoUrl = page.locator('input[aria-label="Enlace de la publicación"]').first();

// ⚠️ ESCRIBIR EN UN CAMPO NO DEMUESTRA QUE SE VEA (v4.974). Se reportó que
// «al elegir la plataforma, la casilla del enlace se pierde»: el campo estaba
// en el DOM —por eso las pruebas de v4.972 pasaban rellenándolo— y el
// selector, con un ancho que el CSS pisaba, se llevaba la fila entera y lo
// empujaba fuera de la tarjeta. Se MIDE dónde cae.
const sitioDelEnlace = await page.evaluate(() => {
    const campo = document.querySelector('input[aria-label="Enlace de la publicación"]');
    const tarjeta = campo?.closest('.rounded-3xl');
    if (!campo || !tarjeta) return { ok: false, motivo: 'no se encontró el campo ni su tarjeta' };
    const c = campo.getBoundingClientRect(), t = tarjeta.getBoundingClientRect();
    const dentro = c.left >= t.left - 1 && c.right <= t.right + 1;
    const ancho = Math.round(c.width);
    return { ok: dentro && ancho >= 200, motivo: `${ancho}px de ancho, ${dentro ? 'dentro' : 'FUERA'} de la tarjeta` };
});
check('el campo del enlace cabe dentro de la tarjeta', sitioDelEnlace.ok, sitioDelEnlace.motivo);
await campoUrl.click();
await page.keyboard.type(URL_POST, { delay: 8 });
check('el enlace conserva TODO lo escrito', await campoUrl.inputValue() === URL_POST,
    `quedó «${await campoUrl.inputValue()}»`);

// Varias de la MISMA plataforma es el caso normal.
await page.getByRole('button', { name: /Agregar otra publicación/ }).click();
await page.waitForTimeout(150);
check('se puede agregar otra publicación',
    (await page.locator('select[aria-label="Plataforma de la publicación"]').count()) === 2);
await page.locator('select[aria-label="Plataforma de la publicación"]').nth(1).selectOption('instagram');
check('dos publicaciones de la MISMA plataforma son legítimas',
    await page.locator('select[aria-label="Plataforma de la publicación"]').nth(1).inputValue() === 'instagram');

// «Otra» pide el nombre del canal: sin él, la fila diría «Otra» y nadie
// sabría dónde se publicó.
await page.locator('select[aria-label="Plataforma de la publicación"]').nth(1).selectOption('otra');
await page.waitForTimeout(150);
check('«Otra» pide el nombre del canal',
    (await page.locator('input[aria-label="Nombre de la plataforma o canal"]').count()) === 1);

// Un enlace con esquema peligroso se AVISA antes de mandar nada.
await page.locator('input[aria-label="Enlace de la publicación"]').nth(1).click();
await page.keyboard.type('javascript://evil.com/%0aalert(1)', { delay: 5 });
await page.waitForTimeout(200);
check('un enlace que no es http/https se avisa en el acto',
    (await page.locator('text=/empezar por http/').count()) >= 1);

// ── El teléfono lleva su país ───────────────────────────────────────
const pais = page.locator('select[aria-label="País del teléfono"]');
check('el teléfono tiene selector de país', await pais.count() === 1);
check('Colombia viene por defecto', await pais.inputValue() === 'CO');
const numero = page.locator('input[aria-label="Número de teléfono"]');
await numero.click();
await page.keyboard.type('300 123 4567', { delay: 15 });
check('el número conserva lo escrito', await numero.inputValue() === '300 123 4567');
await pais.selectOption('MX');
check('se puede elegir otro país', await pais.inputValue() === 'MX');

// ── Nada de lo anterior se perdió ───────────────────────────────────
check('lo escrito al principio SIGUE ahí después de todo',
    await campoNombre.inputValue() === NOMBRE,
    `quedó «${await campoNombre.inputValue()}»`);
check('el relato sigue completo', await relato.inputValue() === HISTORIA);

// ════════════════════════════════════════════════════════════════════
// ⚠️ LO QUE DE VERDAD SE MANDA (v4.972)
//
// Es la lección de `conQr` (v4.836) y `profileId` (v4.838): una dependencia
// que falta en un manejador no la ve el typecheck, el código es válido y el
// ajuste simplemente NO LLEGA a la petición. Con datos estructurados que
// después alimentan CRM y difusión, un campo que no viaja no se nota hasta
// que alguien busca el informe y está vacío.
// ════════════════════════════════════════════════════════════════════
console.log('\n── Lo que llega al servidor ──');

// Se corrige el enlace malo antes de enviar: lo que se quiere comprobar es el
// cuerpo de un envío legítimo.
await page.locator('input[aria-label="Enlace de la publicación"]').nth(1).fill('');
await page.locator('input[aria-label="Enlace de la publicación"]').nth(1).click();
await page.keyboard.type('boletin-rotario.org/agosto', { delay: 5 });
await page.locator('input[aria-label="Nombre de la plataforma o canal"]').fill('Boletín del club');
await page.getByRole('checkbox').first().check();   // el consentimiento

// Un archivo de verdad: sin él, el formulario ni siquiera intenta enviar.
await page.locator('input[type="file"]').setInputFiles({
    name: 'foto.jpg', mimeType: 'image/jpeg',
    buffer: Buffer.from('\xFF\xD8\xFF\xE0 fotografía de prueba', 'binary'),
});
await page.waitForTimeout(300);

// La prefirma y la subida a S3 se interceptan: acá no se prueba S3.
await page.route('**/submissions/form/*/presign', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, uploadUrl: `${base}/__s3`, key: 'private/campaign-submissions/k1/foto.jpg', contentType: 'image/jpeg' }),
}));
await page.route('**/__s3', r => r.fulfill({ status: 200, body: '' }));

let cuerpo = null;
await page.route('**/api/contribution-campaigns/submissions/form/emergencia', async r => {
    if (r.request().method() === 'POST') {
        try { cuerpo = JSON.parse(r.request().postData() || '{}'); } catch { cuerpo = {}; }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, warnings: [] }) });
    }
    return r.fallback();
});

await page.getByRole('button', { name: /ENVIAR MI APORTE/ }).click();
await page.waitForTimeout(1500);

check('el envío llegó al servidor', cuerpo !== null);
if (cuerpo) {
    check('viajan los clubes participantes, con su origen',
        Array.isArray(cuerpo.clubs) && cuerpo.clubs.length === 1 && cuerpo.clubs[0].name === 'Bogotá' && cuerpo.clubs[0].source === 'catalogo',
        JSON.stringify(cuerpo.clubs));
    check('viaja el distrito de la actividad', cuerpo.district === '4281', String(cuerpo.district));
    check('viaja la RESPUESTA de si ya se publicó', cuerpo.hasPosts === true, String(cuerpo.hasPosts));
    check('viajan las DOS publicaciones, cada una con su plataforma y su enlace',
        Array.isArray(cuerpo.posts) && cuerpo.posts.length === 2
        && cuerpo.posts[0].platform === 'instagram' && cuerpo.posts[0].url.includes('instagram.com')
        && cuerpo.posts[1].platform === 'otra' && cuerpo.posts[1].platformOther === 'Boletín del club',
        JSON.stringify(cuerpo.posts));
    check('las URLs NO van concatenadas en un solo campo',
        typeof cuerpo.posts?.[0]?.url === 'string' && !String(cuerpo.posts?.[0]?.url).includes(','));
    check('viajan las PARTES del teléfono, no un número pegado',
        cuerpo.senderPhoneCountry === 'MX' && cuerpo.senderPhoneDial === '+52' && cuerpo.senderPhoneNational === '300 123 4567',
        JSON.stringify({ p: cuerpo.senderPhoneCountry, d: cuerpo.senderPhoneDial, n: cuerpo.senderPhoneNational }));
    // ⚠️ El E.164 lo compone el SERVIDOR: si el navegador lo mandara armado,
    // el número guardado podría contradecir a sus partes.
    check('el navegador NO manda el E.164 armado', cuerpo.senderPhoneE164 === undefined);
    check('el archivo viaja con su clave de staging',
        Array.isArray(cuerpo.files) && cuerpo.files.length === 1 && cuerpo.files[0].key.startsWith('private/'));
}

check('sin errores de render', errores.length === 0, errores.join(' | '));

await nav.close();
server.close();

console.log(`\n${pass} comprobaciones pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
