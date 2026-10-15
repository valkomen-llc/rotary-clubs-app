#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA BARRA DE VENCIMIENTO.  npm run test:expiration
// v4.1204.0 (criterio de v4.878, rehecho con la fecha)
//
// El bloque del criterio y el de archivos no necesitan base, credenciales ni
// red; piden `esbuild`. El de navegador pide además `playwright` y se salta
// solo si falta.
//
// ── QUÉ PROTEGE ─────────────────────────────────────────────────────
//
// v4.878: marcar un sitio «Expirado» no mostraba nada (Nuevo Cali frente a
// Pasto). Se corrigió leyendo el estado de la suscripción.
//
// v4.1204: el defecto contrario. El Club Rotario Bogotá Occidente está Activo,
// «Pagado / Activo» y vence el 04/09/2027, y su portada mostraba la barra roja
// «VENCIMIENTO». La causa: la casilla manual `expirationBannerActive` quedó
// marcada de un ciclo anterior y NADA la desmarcaba al renovar desde el panel.
// Desde v4.1204 la suscripción vigente manda sobre la casilla, la fecha entra
// al criterio con la MISMA ventana que el cron, y el servidor desmarca la
// casilla vieja al guardar.
//
// El bloque de navegador monta el componente REAL: reproducir su condición en
// la prueba no demostraría nada (lección de v4.744 y v4.717).
// ════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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
    EXPIRED_SUBSCRIPTION_STATUSES, RENEWAL_WINDOW_DAYS, GRACE_DAYS,
    isExpiredSubscription, subscriptionHealth, daysUntilExpiration, todayIn,
    expirationBannerReason, showsExpirationBanner, bannerLockNotice,
} = spec;

const server = await import(resolve('server/lib/subscriptionHealth.js'));

// El día del reporte, fijado: 15 de octubre de 2026 a media mañana en Bogotá.
const HOY = new Date('2026-10-15T15:00:00Z');
const enDias = n => {
    const d = new Date(Date.UTC(2026, 9, 15 + n));
    return d.toISOString().slice(0, 10);
};
const salud = s => subscriptionHealth(s, HOY);

// ════════════════════════════════════════════════════════════════════
grupo('1. El caso reportado: Club Rotario Bogotá Occidente');

// Exactamente lo que el panel mostraba: Activo, Pagado / Activo, vence el
// 04/09/2027 — y la casilla manual marcada de un ciclo anterior.
const BOGOTA_OCCIDENTE = {
    status: 'active', subscriptionStatus: 'active',
    expirationDate: '2027-09-04T00:00:00.000Z', expirationBannerActive: true,
};
const hb = salud(BOGOTA_OCCIDENTE);
eq('está al día', hb.phase, 'al_dia');
eq('NO pinta ninguna barra', hb.banner, null);
check('showsExpirationBanner dice que no', showsExpirationBanner(BOGOTA_OCCIDENTE, HOY) === false);
eq('ni da motivo', expirationBannerReason(BOGOTA_OCCIDENTE, HOY), null);
check('la casilla marcada se reconoce como ignorada', hb.manualFlagIgnored === true);
eq('le quedan 324 días', hb.daysLeft, 324);
eq('la fecha se lee en UTC (no el 3 de septiembre)', hb.expiresOn, '2027-09-04');
check('el panel explica que la casilla no manda y que se desmarca sola',
    /al día/i.test(bannerLockNotice(BOGOTA_OCCIDENTE, HOY) || '') && /desmarca/i.test(bannerLockNotice(BOGOTA_OCCIDENTE, HOY) || ''));
check('el servidor la desmarca al guardar',
    server.shouldClearManualBanner(BOGOTA_OCCIDENTE, {}, HOY) === true);

// ════════════════════════════════════════════════════════════════════
grupo('2. Los escenarios del pedido');

// Activo y pagado, lejos del vencimiento.
const AL_DIA = { status: 'active', subscriptionStatus: 'active', expirationDate: enDias(200) };
eq('activo y pagado → al día', salud(AL_DIA).phase, 'al_dia');
eq('sin barra', salud(AL_DIA).banner, null);

// Próximo a vencer: sólo dentro de la ventana, y preventivo, no rojo.
const POR_VENCER = { status: 'active', subscriptionStatus: 'active', expirationDate: enDias(10) };
eq('a 10 días → por vencer', salud(POR_VENCER).phase, 'por_vencer');
eq('aviso preventivo', salud(POR_VENCER).banner, 'preventivo');
eq('en tono de aviso, no de alerta', salud(POR_VENCER).tone, 'aviso');
check('el texto dice cuándo vence', /en 10 días/.test(salud(POR_VENCER).message || ''));
eq(`a ${RENEWAL_WINDOW_DAYS} días exactos ya avisa`,
    salud({ subscriptionStatus: 'active', expirationDate: enDias(RENEWAL_WINDOW_DAYS) }).banner, 'preventivo');
eq(`a ${RENEWAL_WINDOW_DAYS + 1} días todavía no`,
    salud({ subscriptionStatus: 'active', expirationDate: enDias(RENEWAL_WINDOW_DAYS + 1) }).banner, null);
const HOY_VENCE = salud({ subscriptionStatus: 'active', expirationDate: enDias(0) });
eq('vence hoy → preventivo', HOY_VENCE.banner, 'preventivo');
check('y lo dice', /hoy/.test(HOY_VENCE.message || '') && HOY_VENCE.label === 'Vence hoy');

// Período de gracia: la fecha pasó y el cron todavía no suspendió.
const GRACIA = { status: 'active', subscriptionStatus: 'active', expirationDate: enDias(-2) };
eq('venció hace 2 días → gracia', salud(GRACIA).phase, 'gracia');
eq('barra de vencimiento', salud(GRACIA).banner, 'vencimiento');
eq('motivo: la fecha', salud(GRACIA).reason, 'fecha');
check('dice cuántos días quedan antes de la suspensión', /en 3 días/.test(salud(GRACIA).message || ''));
check(`el último día de gracia (${GRACE_DAYS}) lo dice`,
    /hoy termina/.test(salud({ subscriptionStatus: 'active', expirationDate: enDias(-GRACE_DAYS) }).message || ''));

// Vencido sin renovación (marcado por facturación o por el cron).
const VENCIDO = { status: 'active', subscriptionStatus: 'expired', expirationDate: enDias(-3) };
eq('marcado vencido → vencido', salud(VENCIDO).phase, 'vencido');
eq('barra de vencimiento', salud(VENCIDO).banner, 'vencimiento');
eq('motivo: la suscripción', salud(VENCIDO).reason, 'suscripcion');
const PASADO_GRACIA = salud({ subscriptionStatus: 'active', expirationDate: enDias(-30) });
eq('pagado pero vencido hace 30 días → vencido', PASADO_GRACIA.phase, 'vencido');
check('y advierte al administrador la contradicción', PASADO_GRACIA.warnings.length > 0);

// Suspendido: vencido y el sitio quedó inactivo (lo hace el cron).
const SUSPENDIDO = { status: 'inactive', subscriptionStatus: 'expired', expirationDate: enDias(-20) };
eq('vencido + sitio inactivo → suspendido', salud(SUSPENDIDO).phase, 'suspendido');
eq('barra de suspensión', salud(SUSPENDIDO).banner, 'suspension');
check('el texto dice «suspendido»', /suspendido/i.test(salud(SUSPENDIDO).message || ''));

// Pendiente de pago: nunca se presenta como suspendido.
const PENDIENTE_CERCA = { status: 'active', subscriptionStatus: 'pending', expirationDate: enDias(5) };
const PENDIENTE_LEJOS = { status: 'active', subscriptionStatus: 'pending', expirationDate: enDias(90) };
eq('pendiente cerca del vencimiento → aviso de pago', salud(PENDIENTE_CERCA).banner, 'pendiente');
eq('pendiente lejos del vencimiento → sin barra', salud(PENDIENTE_LEJOS).banner, null);
check('pendiente nunca dice suspendido',
    ![salud(PENDIENTE_CERCA), salud(PENDIENTE_LEJOS), salud({ subscriptionStatus: 'pending' })]
        .some(h => h.banner === 'suspension' || /suspendid/i.test(h.message || '')));
eq('pendiente en tono de aviso', salud(PENDIENTE_CERCA).tone, 'aviso');

// Renovado: el mismo sitio vencido, ya pagado y con fecha nueva.
const RENOVADO = { ...VENCIDO, subscriptionStatus: 'active', expirationDate: enDias(365), expirationBannerActive: true };
eq('renovado → al día', salud(RENOVADO).phase, 'al_dia');
eq('la barra desaparece aunque la casilla siga marcada', salud(RENOVADO).banner, null);

// El estado del SITIO y el de la SUSCRIPCIÓN son independientes.
eq('un sitio en construcción al día no pinta barra',
    salud({ status: 'draft', subscriptionStatus: 'active', expirationDate: enDias(200) }).banner, null);
eq('un sitio inactivo con el pago al día no se lee como suspendido',
    salud({ status: 'inactive', subscriptionStatus: 'active', expirationDate: enDias(200) }).phase, 'al_dia');

// ════════════════════════════════════════════════════════════════════
grupo('3. La casilla manual: sólo decide donde la plataforma no puede');

const PASTO = { subscriptionStatus: 'active', expirationBannerActive: true };   // sin fecha
eq('pagado sin fecha y casilla marcada → barra manual', salud(PASTO).banner, 'manual');
eq('con su motivo', expirationBannerReason(PASTO, HOY), 'manual');
check('con el mensaje configurado si lo hay',
    salud({ ...PASTO, expirationBannerMessage: 'Texto propio' }).message === 'Texto propio');
eq('pagado sin fecha y sin casilla → nada', salud({ subscriptionStatus: 'active' }).banner, null);
check('y advierte que falta la fecha', salud({ subscriptionStatus: 'active' }).warnings.length > 0);
eq('prospecto → nada', salud({ subscriptionStatus: 'inactive' }).banner, null);
eq('prospecto con casilla → manual', salud({ subscriptionStatus: 'inactive', expirationBannerActive: true }).banner, 'manual');
eq('la casilla en un sitio por vencer no cambia la barra',
    salud({ ...POR_VENCER, expirationBannerActive: true }).banner, 'preventivo');

const NUEVO_CALI = { subscriptionStatus: 'expired', expirationBannerActive: false };
check('v4.878 sigue en pie: vencido sin casilla muestra la barra', showsExpirationBanner(NUEVO_CALI, HOY) === true);
eq('con las dos cosas, manda el estado',
    expirationBannerReason({ subscriptionStatus: 'expired', expirationBannerActive: true }, HOY), 'suscripcion');
check('un vencido explica para qué sirve la casilla', /sin fecha/i.test(bannerLockNotice(NUEVO_CALI, HOY) || ''));
check('un sitio por fecha también lo explica', typeof bannerLockNotice(POR_VENCER, HOY) === 'string');
eq('un sitio al día SIN casilla no necesita aviso', bannerLockNotice(AL_DIA, HOY), null);
eq('una casilla que sí manda no necesita aviso', bannerLockNotice(PASTO, HOY), null);

// ════════════════════════════════════════════════════════════════════
grupo('4. El catálogo de estados es CERRADO y lo desconocido no inventa');

eq('sólo `expired` es vencido', [...EXPIRED_SUBSCRIPTION_STATUSES], ['expired']);
check('se normaliza el espacio y la mayúscula', isExpiredSubscription('  Expired ') === true);
for (const s of ['active', 'inactive', 'pending', 'suspended', '', null, undefined, 42]) {
    check(`«${s}» no es vencido`, isExpiredSubscription(s) === false);
}
check('null no muestra barra', showsExpirationBanner(null) === false);
eq('ni aviso para el panel', bannerLockNotice(null), null);
eq('una fecha ilegible cuenta como sin fecha', salud({ subscriptionStatus: 'active', expirationDate: 'mañana' }).daysLeft, null);
eq('un estado desconocido no pinta nada', salud({ subscriptionStatus: 'zzz', expirationDate: enDias(-90) }).banner, null);

// ════════════════════════════════════════════════════════════════════
grupo('5. Los días se cuentan en Bogotá, no en UTC');

// A las 10 p. m. del 15 en Bogotá ya es 16 en UTC: el aviso no puede saltar.
const NOCHE = new Date('2026-10-16T03:00:00Z');
eq('hoy en Bogotá sigue siendo el 15', todayIn(NOCHE), '2026-10-15');
eq('y los días no cambian', daysUntilExpiration('2026-10-20', NOCHE), 5);
eq('una fecha guardada como medianoche UTC es ese día', daysUntilExpiration('2027-09-04T00:00:00.000Z', HOY), 324);

// ════════════════════════════════════════════════════════════════════
grupo('6. El servidor y el navegador cuentan lo mismo');

const fechas = [-400, -30, -6, -5, -1, 0, 1, 14, 15, 16, 17, 60, 324, 800].map(enDias)
    .concat(['2027-09-04T00:00:00.000Z', null, '', 'x']);
const horas = [HOY, NOCHE, new Date('2026-12-31T23:59:00Z'), new Date('2027-01-01T04:30:00Z')];
let paridad = true; let paridadAlDia = true;
for (const h of horas) for (const f of fechas) {
    if (daysUntilExpiration(f, h) !== server.daysUntilExpiration(f, h)) paridad = false;
    for (const sub of ['active', 'expired', 'pending', 'inactive']) {
        const sitio = { subscriptionStatus: sub, expirationDate: f };
        const navegador = subscriptionHealth(sitio, h).phase === 'al_dia';
        if (navegador !== server.isComfortablyActive(sitio, h)) paridadAlDia = false;
    }
}
check('daysUntilExpiration da lo mismo en las dos puntas', paridad);
check('«al día» del panel = isComfortablyActive del servidor', paridadAlDia);
eq('la ventana es la misma', server.RENEWAL_WINDOW_DAYS, RENEWAL_WINDOW_DAYS);

// ════════════════════════════════════════════════════════════════════
grupo('7. El servidor desmarca la casilla vieja al guardar — y sólo esa');

const C = server.shouldClearManualBanner;
check('se decide sobre lo que va a quedar escrito (fila + petición)',
    C({ subscriptionStatus: 'expired', expirationDate: enDias(-3), expirationBannerActive: true },
      { subscriptionStatus: 'active', expirationDate: enDias(365) }, HOY) === true);
check('guardar otro campo también limpia una casilla vieja',
    C(BOGOTA_OCCIDENTE, { name: 'Rotary Club Bogotá Occidente' }, HOY) === true);
check('acepta la casilla como texto «true»',
    C({ subscriptionStatus: 'active', expirationDate: enDias(200) }, { expirationBannerActive: 'true' }, HOY) === true);
check('no toca la casilla si no está marcada',
    C({ subscriptionStatus: 'active', expirationDate: enDias(200) }, { expirationBannerActive: false }, HOY) === false);
check('no la toca dentro de la ventana de aviso',
    C({ ...POR_VENCER, expirationBannerActive: true }, {}, HOY) === false);
check('no la toca en un sitio vencido', C({ ...VENCIDO, expirationBannerActive: true }, {}, HOY) === false);
check('no la toca en un pendiente', C({ ...PENDIENTE_LEJOS, expirationBannerActive: true }, {}, HOY) === false);
check('no la toca sin fecha (ahí es la única que decide)', C({ ...PASTO }, {}, HOY) === false);
check('sin datos no hace nada', C(undefined, undefined, HOY) === false);

// ════════════════════════════════════════════════════════════════════
grupo('8. El cableado: guardar sincroniza sin tocar el sitio a mano');

const ctrl = sinComentarios(leer('server/controllers/clubController.js'));
check('updateClub usa shouldClearManualBanner', /shouldClearManualBanner\(/.test(ctrl));
check('y escribe el resultado, no la petición cruda',
    /addField\('expirationBannerActive',\s*bannerFlag\)/.test(ctrl));
check('updateClub vacía la caché de la configuración', /invalidateSiteConfig\(\)/.test(ctrl));
for (const [f, que] of [
    ['server/routes/districts.js', 'guardar un distrito'],
    ['server/controllers/paymentController.js', 'renovar por Stripe'],
    ['server/routes/cron.js', 'suspender por el cron'],
]) {
    check(`${que} vacía la caché`, /invalidateSiteConfig\(\)/.test(sinComentarios(leer(f))));
}
const rutas = leer('server/routes/clubs.js');
check('by-domain usa la caché COMPARTIDA', /from '\.\.\/lib\/siteConfigCache\.js'/.test(rutas));
check('`by-domain` manda la fila entera del sitio (estado y fecha incluidos)',
    /const mappedClub = \{\s*\n\s*\.\.\.activeClub,/.test(rutas),
    'si se pasa a una lista de campos, hay que incluir subscriptionStatus y expirationDate');
const tipo = leer('src/config/clubConfig.ts');
check('el tipo del sitio declara el estado', /subscriptionStatus\?: string;/.test(tipo));
check('y la fecha', /expirationDate\?: string \| null;/.test(tipo));

// Ninguna excepción por dominio ni la barra escondida con CSS.
const recorrer = (dir, acc = []) => {
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (n === 'node_modules' || n.startsWith('.')) continue;
        if (statSync(p).isDirectory()) recorrer(p, acc);
        else if (/\.(js|jsx|ts|tsx|css)$/.test(n)) acc.push(p);
    }
    return acc;
};
const codigo = [...recorrer('src'), ...recorrer('server'), 'api/index.js'];
check('ningún archivo nombra el dominio del caso reportado',
    !codigo.some(f => /bogotaoccidente/i.test(leer(f))));
const css = codigo.filter(f => f.endsWith('.css')).map(leer).join('\n');
check('la barra no se esconde con CSS', !/data-expiration-banner[^{]*\{[^}]*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(css));

// ════════════════════════════════════════════════════════════════════
grupo('9. Barra, menú y panel deciden con lo MISMO');

const banner = leer('src/components/ExpirationBanner.tsx');
const navbar = leer('src/sections/Navbar.tsx');
check('la barra usa subscriptionHealth', banner.includes('subscriptionHealth('));
check('el menú usa showsExpirationBanner (el mismo criterio)', navbar.includes('showsExpirationBanner('));
check('la barra no decide por su cuenta', !/club\.expirationBannerActive/.test(sinComentarios(banner)));
check('el menú tampoco', !/club\?\.expirationBannerActive\s*&&/.test(navbar));
check('la barra marca qué tipo pinta', banner.includes('data-expiration-banner'));

const panel = leer('src/components/admin/SubscriptionHealthPanel.tsx');
check('el panel administrativo usa el criterio compartido', panel.includes('subscriptionHealth('));
for (const k of ['Estado del sitio', 'Estado de pago', 'Fecha de expiración', 'Días restantes', 'Período de renovación', 'Barra en el sitio público', 'Última actualización']) {
    check(`el panel muestra «${k}»`, panel.includes(k));
}
for (const p of PANTALLAS) {
    const src = leer(`src/pages/admin/${p}.tsx`);
    check(`${p} monta el panel de suscripción`, src.includes('<SubscriptionHealthPanel'));
    check(`${p} muestra el aviso de la casilla`, src.includes('bannerLockNotice(formData)'));
}
check('Configuración del sitio usa el mismo criterio',
    leer('src/pages/admin/ClubSettings.tsx').includes('subscriptionHealth('));

// ════════════════════════════════════════════════════════════════════
try { ({ chromium } = await import('playwright')); }
catch { console.log('\n⚠ Se omite el bloque de navegador: falta playwright.'); }

if (chromium) {
    grupo('10. La barra se DIBUJA de verdad');

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
    const bundle = await build({
        stdin: { contents: ENTRY, resolveDir: 'scripts', loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        logLevel: 'silent',
        plugins: [{
            name: 'contextos-sustituidos',
            setup(b) {
                const stub = resolve('scripts/fixtures/expiration-context-stub.tsx');
                b.onResolve({ filter: /(contexts\/ClubContext|hooks\/useAuth)$/ }, () => ({ path: stub }));
            },
        }],
    });

    // El componente usa el reloj REAL: las fechas van relativas a hoy.
    const relativo = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

    const pintar = async (sitio) => {
        const page = await browser.newPage();
        const fallos = [];
        page.on('pageerror', e => fallos.push(e.message));
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
        const { page, fallos } = await pintar({ status: 'active', subscriptionStatus: 'active', expirationDate: relativo(324), expirationBannerActive: true });
        const html = await page.locator('#root').innerHTML().catch(() => 'x');
        check('sin errores al pintar', fallos.length === 0, fallos[0]);
        // Apagado es NO DIBUJADO, no escondido con CSS.
        check('el caso Bogotá Occidente no deja nada en el documento', html.trim() === '', `vio: ${html.slice(0, 80)}`);
        await page.close();
    }
    {
        const { page } = await pintar({ subscriptionStatus: 'expired', expirationBannerActive: false });
        const texto = await page.locator('#root').innerText().catch(() => '');
        check('un sitio vencido sigue pintando la barra', /VENCIMIENTO/i.test(texto), `vio: ${JSON.stringify(texto)}`);
        check('con el texto de vencida', /vencida/i.test(texto));
        await page.close();
    }
    {
        const { page } = await pintar({ status: 'inactive', subscriptionStatus: 'expired' });
        const tipoBarra = await page.locator('[data-expiration-banner]').getAttribute('data-expiration-banner').catch(() => null);
        eq('un sitio suspendido pinta la barra de suspensión', tipoBarra, 'suspension');
        await page.close();
    }
    {
        const { page } = await pintar({ subscriptionStatus: 'active', expirationDate: relativo(7) });
        const tipoBarra = await page.locator('[data-expiration-banner]').getAttribute('data-expiration-banner').catch(() => null);
        eq('a una semana del vencimiento pinta el aviso preventivo', tipoBarra, 'preventivo');
        await page.close();
    }
    {
        const { page } = await pintar({ subscriptionStatus: 'active', expirationBannerActive: true });
        const texto = await page.locator('#root').innerText().catch(() => '');
        check('la casilla sin fecha sigue pintando la barra', /VENCIMIENTO/i.test(texto));
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
console.log('Un sitio pagado y al día no muestra la barra; un vencimiento real sí.');
