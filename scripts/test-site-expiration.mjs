#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA BARRA DE VENCIMIENTO.  npm run test:expiration
// v4.878.0
//
// El bloque del criterio y el de archivos no necesitan base, credenciales ni
// red; piden `esbuild`. El de navegador pide además `playwright` y se salta
// solo si falta.
//
// ── QUÉ PROTEGE ─────────────────────────────────────────────────────
//
// El defecto reportado con dos sitios delante: `rotarypasto.org` muestra la
// barra roja de vencimiento y `rotarynuevocali.org` no, estando los dos
// marcados como «Expirado / Vencido» en el panel. La barra no miraba el estado
// de la suscripción — dependía sólo de una casilla aparte que alguien había
// marcado a mano en uno y no en el otro.
//
// Por eso el bloque de navegador monta el componente REAL: lo que estaba mal
// era su condición, así que reproducirla en la prueba no demostraría nada.
// Es la lección de v4.744 —el criterio era correcto y el fallo estaba en el
// camino— y la de v4.717, donde se verificó la ficha y no el editor.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');

const PANTALLAS = ['Clubs', 'Programas', 'Asociaciones', 'Ferias', 'Zonas', 'Eventos'];

let build, chromium;
try { ({ build } = await import('esbuild')); }
catch { console.log('⚠ Se omite: falta esbuild.  npm i --no-save esbuild'); process.exit(0); }

const out = await build({
    entryPoints: ['src/lib/siteExpiration.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
});
const spec = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
const {
    EXPIRED_SUBSCRIPTION_STATUSES, isExpiredSubscription,
    expirationBannerReason, showsExpirationBanner, bannerLockNotice,
} = spec;

// ════════════════════════════════════════════════════════════════════
grupo('1. El caso reportado: Nuevo Cali frente a Pasto');

// Nuevo Cali: marcado «Expirado» en el panel, con la casilla SIN marcar.
// Hasta v4.877 esto no mostraba nada. Es el defecto entero en una línea.
const NUEVO_CALI = { subscriptionStatus: 'expired', expirationBannerActive: false };
check('un sitio vencido muestra la barra aunque la casilla esté sin marcar',
    showsExpirationBanner(NUEVO_CALI) === true);
eq('y el motivo es la suscripción', expirationBannerReason(NUEVO_CALI), 'suscripcion');

// Pasto: la casilla marcada a mano. No puede haberse roto.
const PASTO = { subscriptionStatus: 'active', expirationBannerActive: true };
check('la casilla marcada a mano sigue mostrando la barra',
    showsExpirationBanner(PASTO) === true);
eq('con su propio motivo', expirationBannerReason(PASTO), 'manual');

// Un sitio al día y sin casilla no muestra nada — lo normal en la plataforma.
const AL_DIA = { subscriptionStatus: 'active', expirationBannerActive: false };
check('un sitio al día no muestra nada', showsExpirationBanner(AL_DIA) === false);
eq('y no hay motivo', expirationBannerReason(AL_DIA), null);

// ════════════════════════════════════════════════════════════════════
grupo('2. El catálogo de estados es CERRADO');

eq('sólo `expired` enciende la barra', [...EXPIRED_SUBSCRIPTION_STATUSES], ['expired']);
check('«expired» está vencido', isExpiredSubscription('expired') === true);

// ⚠️ `inactive` es un prospecto que nunca contrató y `pending` es un cobro en
// curso: en ninguno de los dos «Sitio en periodo de renovación» sería cierto.
for (const s of ['active', 'inactive', 'pending', 'suspended', '', null, undefined]) {
    check(`«${s}» no enciende la barra`, isExpiredSubscription(s) === false);
}

check('se normaliza el espacio y la mayúscula', isExpiredSubscription('  Expired ') === true);
check('un valor que no es texto no rompe', isExpiredSubscription(42) === false);

// ════════════════════════════════════════════════════════════════════
grupo('3. Sin sitio no se decide nada');

check('null no muestra barra', showsExpirationBanner(null) === false);
check('undefined tampoco', showsExpirationBanner(undefined) === false);
eq('y no hay motivo que explicar', expirationBannerReason(null), null);
eq('ni aviso para el panel', bannerLockNotice(null), null);

// ════════════════════════════════════════════════════════════════════
grupo('4. El estado manda sobre la casilla, y se DICE');

// Con el sitio vencido, desmarcar la casilla no apaga la barra. Eso está bien
// —es lo que se pidió— pero deja la pantalla contradiciendo a la portada si no
// se explica. Es el defecto que este proyecto ya documentó una vez: pintar el
// indicador en contra del veredicto (v4.787).
const notice = bannerLockNotice(NUEVO_CALI);
check('un sitio vencido explica por qué la casilla no manda', typeof notice === 'string' && notice.length > 40);
check('y el aviso dice para qué sirve la casilla', /antes/i.test(notice || ''));
eq('un sitio al día no necesita aviso', bannerLockNotice(AL_DIA), null);
eq('y uno con la casilla marcada a mano tampoco', bannerLockNotice(PASTO), null);

// El estado gana al evaluar el motivo, aunque las dos condiciones se cumplan.
eq('con las dos cosas, manda el estado',
    expirationBannerReason({ subscriptionStatus: 'expired', expirationBannerActive: true }), 'suscripcion');

// ════════════════════════════════════════════════════════════════════
grupo('5. ⚠️ NO se deriva de la fecha de expiración');

// Sería lo aparentemente natural y es justo lo que no se puede hacer sin mirar
// la base de producción: hay sitios con una fecha vieja y la suscripción al
// día, y la consecuencia de equivocarse es una barra ROJA de impago en la
// portada de un club que sí pagó.
const criterio = leer('src/lib/siteExpiration.ts');
check('el criterio no lee `expirationDate`',
    !/\bexpirationDate\b\s*[).,;]/.test(criterio.replace(/\/\/.*$/gm, '')),
    'aparece fuera de los comentarios');
check('un sitio con fecha vencida y estado al día NO muestra la barra',
    showsExpirationBanner({ subscriptionStatus: 'active', expirationDate: '2001-01-01', expirationBannerActive: false }) === false);

// ════════════════════════════════════════════════════════════════════
grupo('6. La barra y el menú deciden con lo MISMO');

// La barra es `sticky` y el menú se desplaza para dejarle sitio. Con la
// condición escrita por separado, uno se monta encima del otro en silencio.
const banner = leer('src/components/ExpirationBanner.tsx');
const navbar = leer('src/sections/Navbar.tsx');

check('la barra usa el criterio compartido', banner.includes('showsExpirationBanner('));
check('el menú también', navbar.includes('showsExpirationBanner('));
check('la barra ya no decide por su cuenta',
    !/!club\.expirationBannerActive/.test(banner),
    'volvió la condición escrita a mano');
check('el menú tampoco',
    !/club\?\.expirationBannerActive\s*&&/.test(navbar),
    'volvió la condición escrita a mano');

// ════════════════════════════════════════════════════════════════════
grupo('7. El estado llega al navegador');

// Sin esto el criterio sería correcto y no serviría de nada: es el «camino»
// que la lección de v4.744 dice que hay que comprobar aparte.
const rutas = leer('server/routes/clubs.js');
check('`by-domain` manda la fila entera del sitio',
    /const mappedClub = \{\s*\n\s*\.\.\.activeClub,/.test(rutas),
    'si se pasa a una lista de campos, hay que incluir subscriptionStatus');
const tipo = leer('src/config/clubConfig.ts');
check('el tipo del sitio público declara el estado', /subscriptionStatus\?: string;/.test(tipo));

// ════════════════════════════════════════════════════════════════════
grupo('8. Las seis pantallas explican el estado');

for (const p of PANTALLAS) {
    const src = leer(`src/pages/admin/${p}.tsx`);
    check(`${p} muestra el aviso`, src.includes('bannerLockNotice(formData)'));
    check(`${p} lo toma del criterio compartido`,
        src.includes("from '../../lib/siteExpiration'"));
}

// ════════════════════════════════════════════════════════════════════
try { ({ chromium } = await import('playwright')); }
catch { console.log('\n⚠ Se omite el bloque de navegador: falta playwright.'); }

if (chromium) {
    grupo('9. La barra se DIBUJA de verdad');

    const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
        .find(p => existsSync(p));
    const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

    const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ExpirationBanner from '../src/components/ExpirationBanner';

window.pintar = (sitio) => {
    window.__sitio = sitio;
    createRoot(document.getElementById('root')).render(React.createElement(ExpirationBanner));
};
`;
    // Se sustituyen SÓLO los contextos: el componente es el de producción.
    const bundle = await build({
        stdin: { contents: ENTRY, resolveDir: 'scripts', loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        logLevel: 'silent',
        // ⚠️ `alias` de esbuild sólo acepta nombres de PAQUETE, no rutas
        // relativas: hace falta un plugin de resolución.
        plugins: [{
            name: 'contextos-sustituidos',
            setup(b) {
                const stub = resolve('scripts/fixtures/expiration-context-stub.tsx');
                b.onResolve({ filter: /(contexts\/ClubContext|hooks\/useAuth)$/ }, () => ({ path: stub }));
            },
        }],
    });

    const pintar = async (sitio) => {
        const page = await browser.newPage();
        const fallos = [];
        page.on('pageerror', e => fallos.push(e.message));
        // ⚠️ Hace falta un ORIGEN real: sobre `about:blank` nada se resuelve.
        await page.route('http://localhost/', r => r.fulfill({
            contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
        }));
        await page.goto('http://localhost/');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate(s => window.pintar(s), sitio);
        await page.waitForTimeout(150);
        return { page, fallos };
    };

    {
        const { page, fallos } = await pintar(NUEVO_CALI);
        const texto = await page.locator('#root').innerText().catch(() => '');
        check('sin errores al pintar', fallos.length === 0, fallos[0]);
        check('un sitio vencido pinta la barra', /VENCIMIENTO/i.test(texto), `vio: ${JSON.stringify(texto)}`);
        check('con el aviso de renovación', /periodo de renovación/i.test(texto));
        await page.close();
    }
    {
        const { page } = await pintar(AL_DIA);
        const html = await page.locator('#root').innerHTML().catch(() => 'x');
        // Apagado es NO DIBUJADO, no escondido con CSS: un aviso oculto lo
        // siguen leyendo el lector de pantalla y los buscadores.
        check('un sitio al día no deja nada en el documento', html.trim() === '', `vio: ${html.slice(0, 80)}`);
        await page.close();
    }
    {
        const { page } = await pintar(PASTO);
        const texto = await page.locator('#root').innerText().catch(() => '');
        check('la casilla a mano sigue pintando la barra', /VENCIMIENTO/i.test(texto));
        await page.close();
    }

    await browser.close();
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${ok} comprobaciones pasaron.`);
if (malos.length) {
    console.log(`${malos.length} fallaron:`);
    for (const m of malos) console.log(`  · ${m}`);
    process.exit(1);
}
console.log('Marcar un sitio como vencido muestra la barra en su portada.');
