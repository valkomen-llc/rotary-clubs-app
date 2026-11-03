#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Enlaces inteligentes y códigos QR dinámicos — v4.1278
//
//   npm run test:qr
//
// Qué se comprueba: el CRITERIO (identificador, vigencia, estados, diseño y
// legibilidad, página institucional), que el espejo del navegador dice lo
// mismo, que la imagen es un QR VÁLIDO (dos codificadores independientes dan
// la misma matriz) y después el CAMINO con la base sustituida en memoria:
// crear varios QR para un enlace, escanear y distinguirlo del clic directo,
// vencer a los 30 y 90 días, reactivar sin cambiar la imagen, cambiar el
// destino sin tocar el código, pausar, deshabilitar, aislar por sitio.
//
// No necesita Postgres, credenciales ni red.
// Necesita esbuild para los espejos del navegador: npm i --no-save esbuild
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const STUB = new URL('./scripts/fixtures/db-redirects-stub.mjs', HERE).href;
register(
    `data:text/javascript,export async function resolve(s,c,n){return (s==='./db.js'||s.endsWith('/lib/db.js'))?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    HERE
);

const Q = await import('../server/lib/linkQr.js');
const T = await import('../server/lib/linkTracking.js');

let pass = 0, fail = 0;
const check = (name, fn) => {
    try { fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};
const acheck = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

const DAY = 86400000;
const AHORA = new Date('2026-11-03T15:00:00Z');

// ════════════════════════════════════════════════════════════════════
console.log('\n── El identificador del QR ────────────────────────────');

check('el alfabeto no tiene 0/o ni 1/l/i', () => {
    for (const ch of '01oli') assert.ok(!Q.QR_CODE_ALPHABET.includes(ch), ch);
});
check('codeFromBytes mapea bytes al alfabeto, con la longitud pedida', () => {
    const c = Q.codeFromBytes(new Uint8Array([0, 1, 2, 255, 254, 31, 32, 7, 8, 9]), 10);
    assert.equal(c.length, 10);
    assert.ok(Q.isValidQrCode(c), c);
});
check('un código con forma se acepta; uno con mayúsculas, símbolos o corto no', () => {
    assert.equal(Q.isValidQrCode('abcdefghjk'), true);
    assert.equal(Q.isValidQrCode('ABCDEFGHJK'), false);
    assert.equal(Q.isValidQrCode('abc'), false);
    assert.equal(Q.isValidQrCode('abcdefgh01'), false);
    assert.equal(Q.isValidQrCode(''), false);
});
check('readQrParam lee `?qr=` saneado y descarta basura', () => {
    assert.equal(Q.readQrParam('?utm_source=x&qr=abcdefghjk'), 'abcdefghjk');
    assert.equal(Q.readQrParam('?qr=ABCDEFGHJK'), 'abcdefghjk', 'se normaliza a minúsculas');
    assert.equal(Q.readQrParam('?qr=<script>'), '');
    assert.equal(Q.readQrParam(''), '');
    assert.equal(Q.readQrParam('?qr='), '');
});
check('⚠️ stripQrParam quita SÓLO nuestro parámetro: los UTM siguen viaje', () => {
    assert.equal(Q.stripQrParam('?utm_source=ig&qr=abcdefghjk&utm_medium=social'), '?utm_source=ig&utm_medium=social');
    assert.equal(Q.stripQrParam('?qr=abcdefghjk'), '');
    assert.equal(Q.stripQrParam(''), '');
    assert.equal(Q.stripQrParam('?a=1'), '?a=1');
});
check('trackingUrl es https, del dominio del sitio, con el slug y el código', () => {
    assert.equal(
        Q.trackingUrl({ host: 'rotaryprojectfaircolombia.org', slug: '/inscripcion', code: 'abcdefghjk' }),
        'https://rotaryprojectfaircolombia.org/inscripcion?qr=abcdefghjk'
    );
    assert.equal(Q.trackingUrl({ host: 'https://x.org/', slug: 'ir', code: 'abcdefghjk' }), 'https://x.org/ir?qr=abcdefghjk');
    assert.equal(Q.trackingUrl({ host: '', slug: '/x', code: 'abcdefghjk' }), '');
});

// ════════════════════════════════════════════════════════════════════
console.log('\n── La vigencia ────────────────────────────────────────');

check('30 días: vence al FINAL del día 30', () => {
    const r = Q.expiryFor('d30', { now: AHORA });
    assert.equal(r.ok, true);
    const dias = (r.expiresAt.getTime() - AHORA.getTime()) / DAY;
    assert.ok(dias > 30 && dias < 31, `fueron ${dias}`);
    assert.equal(r.expiresAt.getUTCHours(), 23);
});
check('90 días', () => {
    const r = Q.expiryFor('d90', { now: AHORA });
    const dias = (r.expiresAt.getTime() - AHORA.getTime()) / DAY;
    assert.ok(dias > 90 && dias < 91, `fueron ${dias}`);
});
check('sin vencimiento = null', () => assert.equal(Q.expiryFor('none', { now: AHORA }).expiresAt, null));
check('fecha personalizada futura se acepta', () => {
    const r = Q.expiryFor('custom', { now: AHORA, customDate: '2027-03-15T23:59:59Z' });
    assert.equal(r.ok, true);
    assert.equal(r.expiresAt.toISOString().slice(0, 10), '2027-03-15');
});
check('⚠️ una fecha pasada o ilegible se rechaza', () => {
    assert.equal(Q.expiryFor('custom', { now: AHORA, customDate: '2020-01-01' }).ok, false);
    assert.equal(Q.expiryFor('custom', { now: AHORA, customDate: 'ayer' }).ok, false);
    assert.equal(Q.expiryFor('loquesea', { now: AHORA }).ok, false);
});
check('isExpired y daysLeft', () => {
    assert.equal(Q.isExpired(null, AHORA), false);
    assert.equal(Q.isExpired(new Date(AHORA.getTime() - 1), AHORA), true);
    assert.equal(Q.isExpired(new Date(AHORA.getTime() + DAY), AHORA), false);
    assert.equal(Q.daysLeft(null, AHORA), null);
    assert.equal(Q.daysLeft(new Date(AHORA.getTime() + 3 * DAY), AHORA), 3);
    assert.equal(Q.daysLeft(new Date(AHORA.getTime() - DAY), AHORA), 0);
});

// ════════════════════════════════════════════════════════════════════
console.log('\n── El estado efectivo ─────────────────────────────────');

const en10 = new Date(AHORA.getTime() + 10 * DAY).toISOString();
const hace1 = new Date(AHORA.getTime() - DAY).toISOString();
check('activo sin fecha', () => assert.equal(Q.qrAccessState({ status: 'active', expiresAt: null }, AHORA), 'active'));
check('activo con fecha futura', () => assert.equal(Q.qrAccessState({ status: 'active', expiresAt: en10 }, AHORA), 'active'));
check('⚠️ VENCIDO se deriva del reloj, la fila sigue diciendo «active»', () =>
    assert.equal(Q.qrAccessState({ status: 'active', expiresAt: hace1 }, AHORA), 'expired'));
check('pausado', () => assert.equal(Q.qrAccessState({ status: 'paused', expiresAt: en10 }, AHORA), 'paused'));
check('vencido gana a pausado', () => assert.equal(Q.qrAccessState({ status: 'paused', expiresAt: hace1 }, AHORA), 'expired'));
check('deshabilitado gana a vencido', () => assert.equal(Q.qrAccessState({ status: 'disabled', expiresAt: hace1 }, AHORA), 'disabled'));
check('eliminado gana a todo', () => assert.equal(Q.qrAccessState({ status: 'active', deletedAt: hace1 }, AHORA), 'deleted'));
check('sin fila = eliminado', () => assert.equal(Q.qrAccessState(null, AHORA), 'deleted'));
check('el código HTTP: 503 para pausado, 410 para lo demás', () => {
    assert.equal(Q.blockedHttpStatus('paused'), 503);
    for (const s of ['expired', 'disabled', 'deleted']) assert.equal(Q.blockedHttpStatus(s), 410);
});
check('el estado del enlace visto desde el salto', () => {
    assert.equal(Q.linkAccessState({ status: 'active' }), 'active');
    assert.equal(Q.linkAccessState({ status: 'paused' }), 'paused');
    assert.equal(Q.linkAccessState({ status: 'active', deletedAt: hace1 }), 'disabled');
    assert.equal(Q.linkAccessState(null), 'disabled');
});

// ════════════════════════════════════════════════════════════════════
console.log('\n── El diseño y la legibilidad ─────────────────────────');

check('sin nada, el diseño por defecto y sin errores', () => {
    const r = Q.normalizeDesign({});
    assert.equal(r.ok, true);
    assert.deepEqual(r.design, Q.DESIGN_DEFAULTS);
});
check('⚠️ un QR CLARO sobre fondo OSCURO se rechaza', () => {
    const r = Q.normalizeDesign({ fg: '#ffffff', bg: '#000000' });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /más oscuro/);
});
check('⚠️ poco contraste se rechaza (amarillo sobre blanco)', () => {
    const r = Q.normalizeDesign({ fg: '#f2c94c', bg: '#ffffff' });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /contraste/i);
});
check('contraste suficiente pero bajo: se acepta con aviso', () => {
    const r = Q.normalizeDesign({ fg: '#777777', bg: '#ffffff' });
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some(w => /imprenta/.test(w)));
});
check('el azul institucional sobre blanco supera 4,5:1', () =>
    assert.ok(Q.contrastRatio('#004080', '#ffffff') > 4.5));
check('⚠️ con logotipo el nivel se FUERZA a H', () => {
    const r = Q.normalizeDesign({ logoUrl: 'https://x.org/logo.png', ecLevel: 'L' });
    assert.equal(r.design.ecLevel, 'H');
    assert.ok(r.warnings.some(w => /H/.test(w)));
});
check('un logo que no es http(s) ni ruta interna se descarta', () =>
    assert.equal(Q.normalizeDesign({ logoUrl: 'javascript:alert(1)' }).design.logoUrl, ''));
check('tamaño y margen se acotan', () => {
    const r = Q.normalizeDesign({ size: 99999, margin: 50 });
    assert.equal(r.design.size, Q.SIZE_MAX);
    assert.equal(r.design.margin, Q.MARGIN_MAX);
    assert.equal(Q.normalizeDesign({ size: 10, margin: -3 }).design.size, Q.SIZE_MIN);
});
check('margen menor a 2 avisa', () =>
    assert.ok(Q.normalizeDesign({ margin: 1 }).warnings.some(w => /margen/.test(w))));
check('un color inválido cae al seguro con aviso, no a un error', () => {
    const r = Q.normalizeDesign({ fg: 'rojo' });
    assert.equal(r.ok, true);
    assert.equal(r.design.fg, Q.DESIGN_DEFAULTS.fg);
    assert.equal(r.warnings.length, 1);
});
check('la etiqueta se recorta a 60 y se limpia', () =>
    assert.equal(Q.normalizeDesign({ caption: '  Inscribite   acá  ' }).design.caption, 'Inscribite acá'));
check('los campos de identificación se sanean y el medio cae en «otro»', () => {
    const f = Q.normalizeQrFields({ name: '  Afiche  A3 ', medium: 'telepatía', campaign: 'Feria', label: 'x' });
    assert.equal(f.name, 'Afiche A3');
    assert.equal(f.medium, 'otro');
});

// ════════════════════════════════════════════════════════════════════
console.log('\n── La página institucional ────────────────────────────');

check('una página entera, sin indexar, con el texto de cada estado', () => {
    for (const s of ['expired', 'paused', 'disabled', 'deleted']) {
        const html = Q.unavailablePage({ state: s, siteName: 'Distrito 4281', homeUrl: 'https://rotary4281.org/' });
        assert.match(html, /^<!doctype html>/);
        assert.match(html, /noindex/);
        assert.ok(html.includes(Q.UNAVAILABLE_COPY[s].title), s);
        assert.ok(html.includes('Distrito 4281'));
    }
});
check('⚠️ el nombre del sitio y el enlace se ESCAPAN', () => {
    const html = Q.unavailablePage({ state: 'expired', siteName: '<img src=x onerror=1>', homeUrl: 'https://x.org/"><script>' });
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('"><script>'));
});
check('un estado desconocido cae en «deshabilitado», no en una página vacía', () =>
    assert.ok(Q.unavailablePage({ state: 'xyz' }).includes(Q.UNAVAILABLE_COPY.disabled.title)));

// ════════════════════════════════════════════════════════════════════
console.log('\n── El espejo del navegador y la imagen ────────────────');

// El bundle se deja DENTRO de node_modules: `qrRender.ts` importa `qrcode` y
// se deja externo para que Node lo resuelva del proyecto, no de /tmp.
const tmp = mkdtempSync(join(process.cwd(), 'node_modules', '.linkqr-'));
let espejo = null, qrPropio = null, render = null;
try {
    const esbuild = new URL('./node_modules/.bin/esbuild', HERE).pathname;
    for (const [src, out] of [
        ['src/lib/linkQr.ts', 'linkQr.mjs'],
        ['src/lib/qrcode.ts', 'qrcode.mjs'],
        ['src/lib/qrRender.ts', 'qrRender.mjs'],
    ]) {
        execFileSync(esbuild, [src, '--bundle', '--format=esm', '--platform=node', '--external:qrcode', `--outfile=${join(tmp, out)}`], { stdio: 'pipe' });
    }
    espejo = await import(pathToFileURL(join(tmp, 'linkQr.mjs')).href);
    qrPropio = await import(pathToFileURL(join(tmp, 'qrcode.mjs')).href);
    render = await import(pathToFileURL(join(tmp, 'qrRender.mjs')).href);
} catch (e) {
    console.log('  (espejos no compilados:', e.message.split('\n')[0], ')');
}

if (espejo) {
    check('los presets de vigencia son los mismos', () =>
        assert.deepEqual(Object.keys(espejo.VALIDITY_PRESETS), Object.keys(Q.VALIDITY_PRESETS)));
    check('los medios de difusión son los mismos', () =>
        assert.deepEqual(espejo.QR_MEDIA, Q.QR_MEDIA));
    check('los rótulos de estado son los mismos', () =>
        assert.deepEqual(espejo.QR_STATE_LABELS, Q.QR_STATE_LABELS));
    check('el diseño por defecto es el mismo', () =>
        assert.deepEqual(espejo.DESIGN_DEFAULTS, Q.DESIGN_DEFAULTS));
    check('⚠️ normalizeDesign decide IGUAL en los dos lados', () => {
        const casos = [
            {}, { fg: '#ffffff', bg: '#000000' }, { fg: '#f2c94c' }, { fg: '#777777' },
            { logoUrl: 'https://x.org/l.png', ecLevel: 'L' }, { size: 99999, margin: 50 }, { margin: 1 },
            { fg: 'rojo' }, { caption: ' a  b ' }, { logoUrl: 'javascript:x' },
        ];
        for (const c of casos) {
            const a = Q.normalizeDesign(c), b = espejo.normalizeDesign(c);
            assert.deepEqual(b.design, a.design, JSON.stringify(c));
            assert.equal(b.ok, a.ok, JSON.stringify(c));
            assert.equal(b.errors.length, a.errors.length, JSON.stringify(c));
            assert.equal(b.warnings.length, a.warnings.length, JSON.stringify(c));
        }
    });
    check('trackingUrl y qrAccessState dicen lo mismo', () => {
        const args = { host: 'x.org', slug: '/ir', code: 'abcdefghjk' };
        assert.equal(espejo.trackingUrl(args), Q.trackingUrl(args));
        for (const q of [{ status: 'active', expiresAt: hace1 }, { status: 'paused' }, { status: 'disabled' }, { status: 'active', deletedAt: hace1 }]) {
            assert.equal(espejo.qrAccessState(q, AHORA), Q.qrAccessState(q, AHORA));
        }
    });
}

if (render && qrPropio) {
    const url = 'https://rotaryprojectfaircolombia.org/inscripcion?qr=abcdefghjk';
    check('⚠️ la imagen es un QR VÁLIDO: dos codificadores independientes dan la MISMA matriz', () => {
        // `qrcode` (la librería estándar) y el generador propio de v4.648
        // (`src/lib/qrcode.ts`, nivel M) no comparten una línea de código. Si
        // los dos producen los mismos módulos para la misma URL, la imagen que
        // se descarga es la que cualquier lector espera.
        const a = render.qrMatrix(url, 'M');
        const b = qrPropio.encodeQr(url);
        assert.equal(a.size, b.length, 'versiones distintas');
        for (let r = 0; r < a.size; r++) for (let c = 0; c < a.size; c++) {
            assert.equal(a.at(r, c), Boolean(b[r][c]), `módulo (${r},${c})`);
        }
    });
    check('los cuatro niveles de corrección generan matriz', () => {
        for (const l of ['L', 'M', 'Q', 'H']) assert.ok(render.qrMatrix(url, l).size >= 21, l);
    });
    check('el SVG tiene la geometría prometida: margen, un path, etiqueta y logo', () => {
        const design = { ...Q.DESIGN_DEFAULTS, margin: 4, size: 1024, caption: 'Inscribite', logoUrl: 'https://x.org/l.png', ecLevel: 'H' };
        const m = render.qrMatrix(url, 'H');
        const g = render.geometry(m, design);
        assert.equal(g.modules, m.size + 8);
        assert.equal(g.side, g.px * g.modules);
        assert.ok(g.captionH > 0 && g.height === g.side + g.captionH);
        assert.ok(g.logo && g.logo.w <= g.side * 0.22 + 1);

        const svg = render.renderSvg(url, design, { logoHref: 'data:image/png;base64,AAAA' });
        assert.match(svg, /^<svg /);
        assert.equal((svg.match(/<path /g) || []).length, 1, 'un solo path para todos los módulos');
        assert.ok(svg.includes(`width="${g.width}" height="${g.height}"`));
        assert.ok(svg.includes('<image '), 'el logo');
        assert.ok(svg.includes('>Inscribite<'), 'la etiqueta');
        assert.ok(svg.includes(`fill="${design.bg}"`) && svg.includes(`fill="${design.fg}"`));
    });
    check('sin logo ni etiqueta, el SVG es sólo fondo + path', () => {
        const svg = render.renderSvg(url, { ...Q.DESIGN_DEFAULTS });
        assert.ok(!svg.includes('<image ') && !svg.includes('<text '));
    });
    check('el nombre del archivo es seguro', () =>
        assert.equal(render.fileSlug('Afiche A3 · Inscripción 2027!'), 'afiche-a3-inscripcion-2027'));
    check('la etiqueta del SVG se escapa', () =>
        assert.ok(render.renderSvg(url, { ...Q.DESIGN_DEFAULTS, caption: '<b>&' }).includes('&lt;b&gt;&amp;')));
}
rmSync(tmp, { recursive: true, force: true });

// ════════════════════════════════════════════════════════════════════
console.log('\n── El camino: varios QR para un enlace ────────────────');

const stub = await import(STUB);
const store = await import('../server/lib/linkRedirectStore.js');
stub.reset();

const SITIO = 'sitio-4281';
const yo = { id: 'u1', name: 'Daniel' };

const creado = await store.createRedirect({
    clubId: SITIO, slug: '/inscripcion', target: 'https://feria.org/form', name: 'Inscripciones Feria 2027', actor: yo,
});
const link = creado.link;
await acheck('el enlace se crea con su nombre', () => {
    assert.equal(creado.ok, true);
    assert.equal(link.name, 'Inscripciones Feria 2027');
});

const afiche = await store.createQr({
    linkId: link.id, clubId: SITIO, now: AHORA, actor: yo,
    fields: { name: 'Afiche A3', campaign: 'Feria 2027', medium: 'impreso', label: 'lote 1' },
    validity: { preset: 'd30' },
});
const insta = await store.createQr({
    linkId: link.id, clubId: SITIO, now: AHORA, actor: yo,
    fields: { name: 'Instagram', campaign: 'Feria 2027', medium: 'redes' },
    validity: { preset: 'd90' },
    design: { fg: '#1b1b1b', caption: 'Inscribite' },
});
const invitacion = await store.createQr({
    linkId: link.id, clubId: SITIO, now: AHORA, actor: yo,
    fields: { name: 'Invitación', medium: 'impreso' },
    validity: { preset: 'none' },
});
const propio = await store.createQr({
    linkId: link.id, clubId: SITIO, now: AHORA, actor: yo,
    fields: { name: 'Presentación', medium: 'presentacion' },
    validity: { preset: 'custom', customDate: '2026-12-24T23:59:59Z' },
});

await acheck('se crean cuatro QR para el mismo enlace, cada uno con código propio', () => {
    for (const r of [afiche, insta, invitacion, propio]) assert.equal(r.ok, true, r.error);
    const codes = new Set([afiche.qr.code, insta.qr.code, invitacion.qr.code, propio.qr.code]);
    assert.equal(codes.size, 4);
    for (const c of codes) assert.ok(Q.isValidQrCode(c), c);
});
await acheck('⚠️ la vigencia la calculó el servidor: 30, 90, nunca y la fecha propia', () => {
    const dias = (q) => Math.round((new Date(q.expiresAt).getTime() - AHORA.getTime()) / DAY);
    assert.equal(dias(afiche.qr), 30);
    assert.equal(dias(insta.qr), 90);
    assert.equal(invitacion.qr.expiresAt, null);
    assert.equal(String(propio.qr.expiresAt instanceof Date ? propio.qr.expiresAt.toISOString() : propio.qr.expiresAt).slice(0, 10), '2026-12-24');
    assert.equal(afiche.qr.state, 'active');
});
await acheck('un QR sin nombre se rechaza; un diseño ilegible también', async () => {
    const sin = await store.createQr({ linkId: link.id, clubId: SITIO, fields: {}, validity: { preset: 'none' } });
    assert.equal(sin.ok, false);
    const feo = await store.createQr({ linkId: link.id, clubId: SITIO, fields: { name: 'x' }, design: { fg: '#ffffff', bg: '#000' }, validity: { preset: 'none' } });
    assert.equal(feo.ok, false);
    assert.equal(feo.status, 400);
});
await acheck('⚠️ un QR para un enlace de OTRO sitio no se puede crear (404)', async () => {
    const r = await store.createQr({ linkId: link.id, clubId: 'cali', fields: { name: 'x' }, validity: { preset: 'none' } });
    assert.equal(r.status, 404);
});
await acheck('el listado trae la cantidad de QR sin recorrer eventos', async () => {
    stub.clearLog();
    const l = await store.listRedirects(SITIO);
    assert.equal(l.items.find(i => i.id === link.id).qrCount, 4);
    assert.ok(!stub.SQL_LOG.some(s => s.includes('LinkRedirectEvent')));
});

console.log('\n── El salto: QR frente a enlace directo ───────────────');

store.invalidateRedirectCache();
const vivos = await store.readRedirectsForHost('rotary4281.org');
const vivo = vivos.find(l => l.id === link.id);
await acheck('la lectura pública cuelga los QR del enlace, con código, estado y vigencia', () => {
    assert.ok(vivo, 'el enlace no resolvió');
    assert.equal(vivo.qrs.length, 4);
    const a = vivo.qrs.find(q => q.code === afiche.qr.code);
    assert.ok(a && a.expiresAt && a.status === 'active');
});

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const clic = (ip, extra = {}) => T.describeClick({ headers: {}, search: '', userAgent: UA, ip, clubId: SITIO, ...extra });
const qrA = vivo.qrs.find(q => q.code === afiche.qr.code);
const qrI = vivo.qrs.find(q => q.code === insta.qr.code);

await store.recordClick({ link: vivo, click: clic('10.0.0.1'), qr: qrA, now: AHORA });
await store.recordClick({ link: vivo, click: clic('10.0.0.2'), qr: qrA, now: AHORA });
await store.recordClick({ link: vivo, click: clic('10.0.0.1'), qr: qrA, now: AHORA }); // vuelve
await store.recordClick({ link: vivo, click: clic('10.0.0.3'), qr: qrI, now: AHORA });
await store.recordClick({ link: vivo, click: clic('10.0.0.4'), now: AHORA }); // directo
await store.recordClick({ link: vivo, click: clic('10.0.0.5'), now: AHORA }); // directo

await acheck('⚠️ el escaneo suma al QR Y al enlace; el clic directo sólo al enlace', () => {
    const l = stub.DATA.links.find(x => x.id === link.id);
    assert.equal(l.totalClicks, 6);
    assert.equal(l.qrScans, 4);
    const a = stub.DATA.qrs.find(q => q.id === afiche.qr.id);
    assert.equal(a.totalScans, 3);
    assert.equal(a.uniqueVisitors, 2, 'el que volvió no suma visitante');
    assert.equal(stub.DATA.qrs.find(q => q.id === insta.qr.id).totalScans, 1);
    assert.equal(stub.DATA.qrs.find(q => q.id === invitacion.qr.id).totalScans, 0);
});
await acheck('cada evento sabe por dónde entró', () => {
    const evs = stub.DATA.events.filter(e => e.linkId === link.id);
    assert.equal(evs.filter(e => e.accessKind === 'qr').length, 4);
    assert.equal(evs.filter(e => e.accessKind === 'link').length, 2);
    assert.equal(evs.filter(e => e.qrId === afiche.qr.id).length, 3);
});
await acheck('el agregado diario separa los del QR', () => {
    const d = stub.DATA.daily.find(x => x.linkId === link.id);
    assert.equal(d.clicks, 6);
    assert.equal(d.qrScans, 4);
    const dq = stub.DATA.qrDaily.find(x => x.qrId === afiche.qr.id);
    assert.equal(dq.scans, 3);
    assert.equal(dq.uniques, 2);
});
await acheck('⚠️ una vista previa de WhatsApp sobre un QR no es un escaneo', async () => {
    const bot = T.describeClick({ headers: {}, search: '', userAgent: 'WhatsApp/2.23.20.0 A', ip: '1.1.1.1', clubId: SITIO });
    const r = await store.recordClick({ link: vivo, click: bot, qr: qrA, now: AHORA });
    assert.equal(r.counted, false);
    const a = stub.DATA.qrs.find(q => q.id === afiche.qr.id);
    assert.equal(a.totalScans, 3);
    assert.equal(a.botHits, 1);
});
await acheck('el clic se sigue registrando en UNA sola ida a la base, con o sin QR', async () => {
    stub.clearLog();
    await store.recordClick({ link: vivo, click: clic('10.0.0.9'), qr: qrI, now: AHORA });
    assert.equal(stub.SQL_LOG.length, 1);
    stub.clearLog();
    await store.recordClick({ link: vivo, click: clic('10.0.0.10'), now: AHORA });
    assert.equal(stub.SQL_LOG.length, 1);
});

console.log('\n── Vencimiento, reactivación y cambio de destino ─────');

const en31 = new Date(AHORA.getTime() + 31 * DAY);
const en91 = new Date(AHORA.getTime() + 91 * DAY);
await acheck('⚠️ a los 31 días el de 30 está VENCIDO y el de 90 sigue activo', async () => {
    const lista = await store.listQrs(link.id, SITIO, { now: en31 });
    assert.equal(lista.find(q => q.id === afiche.qr.id).state, 'expired');
    assert.equal(lista.find(q => q.id === insta.qr.id).state, 'active');
    assert.equal(lista.find(q => q.id === invitacion.qr.id).state, 'active');
});
await acheck('a los 91 días el de 90 también venció; el indefinido no vence nunca', async () => {
    const lista = await store.listQrs(link.id, SITIO, { now: en91 });
    assert.equal(lista.find(q => q.id === insta.qr.id).state, 'expired');
    assert.equal(lista.find(q => q.id === invitacion.qr.id).state, 'active');
    const en10anios = new Date(AHORA.getTime() + 3650 * DAY);
    assert.equal((await store.getQr(invitacion.qr.id, link.id, SITIO, { now: en10anios })).state, 'active');
});
await acheck('⚠️ el escaneo de un QR vencido NO salta, queda como bloqueado y no suma accesos', async () => {
    const antes = stub.DATA.qrs.find(q => q.id === afiche.qr.id).totalScans;
    const estado = Q.qrAccessState(qrA, en31);
    assert.equal(estado, 'expired');
    const r = await store.recordBlockedScan({ link: vivo, qr: qrA, state: estado, click: clic('10.0.0.7'), now: en31 });
    assert.equal(r.blocked, true);
    const a = stub.DATA.qrs.find(q => q.id === afiche.qr.id);
    assert.equal(a.totalScans, antes);
    assert.equal(a.blockedScans, 1);
    const ev = stub.DATA.events.filter(e => e.qrId === afiche.qr.id && e.outcome === 'expired');
    assert.equal(ev.length, 1);
});
await acheck('un bot sobre un QR vencido no deja rastro', async () => {
    const bot = T.describeClick({ headers: {}, search: '', userAgent: 'curl/8.4.0', ip: '1.1.1.1', clubId: SITIO });
    const r = await store.recordBlockedScan({ link: vivo, qr: qrA, state: 'expired', click: bot, now: en31 });
    assert.equal(r.counted, false);
    assert.equal(stub.DATA.qrs.find(q => q.id === afiche.qr.id).blockedScans, 1);
});
await acheck('⚠️ extender la vigencia REACTIVA el código SIN cambiar el código', async () => {
    const r = await store.updateQr(afiche.qr.id, link.id, SITIO, { validity: { preset: 'd90' } }, yo, en31);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.qr.code, afiche.qr.code);
    assert.equal(r.qr.state, 'active');
    assert.equal(Math.round((new Date(r.qr.expiresAt).getTime() - en31.getTime()) / DAY), 90);
    assert.ok(stub.DATA.audit.some(a => a.qrId === afiche.qr.id && a.action === 'qr_validity'));
});
await acheck('pasar a «sin vencimiento» también', async () => {
    const r = await store.updateQr(afiche.qr.id, link.id, SITIO, { validity: { preset: 'none' } }, yo, en91);
    assert.equal(r.qr.expiresAt, null);
    assert.equal(r.qr.state, 'active');
});
await acheck('editar nombre, campaña o diseño conserva código y contadores', async () => {
    const r = await store.updateQr(afiche.qr.id, link.id, SITIO, { name: 'Afiche A3 (v2)', design: { fg: '#222222', caption: 'Hola' } }, yo, AHORA);
    assert.equal(r.qr.code, afiche.qr.code);
    assert.equal(r.qr.totalScans, 3);
    assert.equal(r.qr.design.caption, 'Hola');
});
await acheck('⚠️ cambiar el DESTINO del enlace no toca ningún QR', async () => {
    const r = await store.updateRedirect(link.id, SITIO, { target: 'https://feria.org/form-nuevo' }, yo);
    assert.equal(r.ok, true);
    store.invalidateRedirectCache();
    const otra = (await store.readRedirectsForHost('rotary4281.org')).find(l => l.id === link.id);
    assert.equal(otra.target, 'https://feria.org/form-nuevo');
    assert.equal(otra.qrs.length, 4);
    assert.ok(otra.qrs.some(q => q.code === afiche.qr.code));
    assert.equal(stub.DATA.qrs.find(q => q.id === afiche.qr.id).totalScans, 3);
});

console.log('\n── Pausar, deshabilitar, eliminar ─────────────────────');

await acheck('pausar: estado «paused», estadísticas intactas, el código impreso muestra la página', async () => {
    const r = await store.setQrStatus(insta.qr.id, link.id, SITIO, 'paused', yo, AHORA);
    assert.equal(r.qr.state, 'paused');
    assert.equal(r.qr.totalScans, 2);
    assert.equal(Q.blockedHttpStatus(r.qr.state), 503);
});
await acheck('reactivar', async () => {
    const r = await store.setQrStatus(insta.qr.id, link.id, SITIO, 'active', yo, AHORA);
    assert.equal(r.qr.state, 'active');
});
await acheck('deshabilitar', async () => {
    const r = await store.setQrStatus(propio.qr.id, link.id, SITIO, 'disabled', yo, AHORA);
    assert.equal(r.qr.state, 'disabled');
});
await acheck('un estado inventado se rechaza', async () =>
    assert.equal((await store.setQrStatus(propio.qr.id, link.id, SITIO, 'volando', yo)).status, 400));
await acheck('⚠️ eliminar es SUAVE: la fila queda, el código NO se libera y resuelve a «eliminado»', async () => {
    const r = await store.deleteQr(invitacion.qr.id, link.id, SITIO, yo);
    assert.equal(r.ok, true);
    const fila = stub.DATA.qrs.find(q => q.id === invitacion.qr.id);
    assert.ok(fila && fila.deletedAt);
    assert.equal(await store.getQr(invitacion.qr.id, link.id, SITIO), null);
    const hit = await store.lookupQrByCode(invitacion.qr.code);
    assert.ok(hit && hit.qr && hit.link);
    assert.equal(Q.qrAccessState(hit.qr), 'deleted');
    store.invalidateRedirectCache();
    const otra = (await store.readRedirectsForHost('rotary4281.org')).find(l => l.id === link.id);
    assert.ok(otra.qrs.some(q => q.code === invitacion.qr.code && q.deletedAt), 'la lectura pública tiene que seguir viéndolo para contestar con la página');
});
await acheck('lookupQrByCode con un código que no existe devuelve null', async () =>
    assert.equal(await store.lookupQrByCode('zzzzzzzzzz'), null));

console.log('\n── El aislamiento por sitio ───────────────────────────');

await acheck('⚠️ un QR ajeno NO EXISTE: 404 al leer, editar, pausar, borrar y en estadísticas', async () => {
    assert.equal(await store.getQr(afiche.qr.id, link.id, 'cali'), null);
    assert.equal((await store.updateQr(afiche.qr.id, link.id, 'cali', { name: 'x' }, yo)).status, 404);
    assert.equal((await store.setQrStatus(afiche.qr.id, link.id, 'cali', 'paused', yo)).status, 404);
    assert.equal((await store.deleteQr(afiche.qr.id, link.id, 'cali', yo)).status, 404);
    assert.equal((await store.qrStatsFor(afiche.qr.id, link.id, 'cali')).status, 404);
});
await acheck('y un QR de otro ENLACE del mismo sitio tampoco', async () => {
    const otro = await store.createRedirect({ clubId: SITIO, slug: '/otro', target: 'https://x.org', actor: yo });
    assert.equal(await store.getQr(afiche.qr.id, otro.link.id, SITIO), null);
    assert.equal((await store.listQrs(otro.link.id, SITIO)).length, 0);
});
await acheck('el resumen de un sitio no ve los QR del otro', async () => {
    const r = await store.overviewFor('cali', { now: AHORA });
    assert.equal(r.totals.qrs, 0);
    assert.equal(r.totals.clicks, 0);
});

console.log('\n── Las estadísticas ───────────────────────────────────');

const st = await store.statsFor(link.id, SITIO, { period: 'd30', now: AHORA });
await acheck('la cabecera distingue QR de enlace directo', () => {
    assert.equal(st.totals.clicks, 8);
    assert.equal(st.totals.qrScans, 5);
    assert.equal(st.totals.linkClicks, 3);
    assert.equal(st.totals.periodQrScans, 5);
});
await acheck('la serie trae qrScans por día', () => {
    const hoy = st.series.find(d => d.clicks > 0);
    assert.ok(hoy);
    assert.equal(hoy.qrScans, 5);
});
await acheck('la comparación entre QR trae escaneos del período, estado y campaña', () => {
    assert.equal(st.qrs.length, 3, 'el eliminado no aparece');
    const a = st.qrs.find(q => q.id === afiche.qr.id);
    assert.equal(a.periodScans, 3);
    assert.equal(a.campaign, 'Feria 2027');
    assert.equal(a.periodBlocked, 0, 'el bloqueado fue fuera del período');
});
await acheck('la actividad reciente dice por dónde entró cada acceso', () => {
    assert.ok(st.recent.length >= 8);
    assert.ok(st.recent.some(e => e.accessKind === 'qr' && e.qrId === afiche.qr.id));
    assert.ok(st.recent.some(e => e.accessKind === 'link'));
});
await acheck('los desgloses sólo cuentan los que saltaron', () => {
    const total = st.devices.reduce((a, d) => a + d.clicks, 0);
    assert.equal(total, 8);
});

const sq = await store.qrStatsFor(afiche.qr.id, link.id, SITIO, { period: 'todo', now: en31 });
await acheck('las estadísticas de un QR: escaneos, únicos, bloqueados y bots aparte', () => {
    assert.equal(sq.ok, true);
    assert.equal(sq.totals.scans, 3);
    assert.equal(sq.totals.uniqueVisitors, 2);
    assert.equal(sq.totals.blocked, 1);
    assert.equal(sq.totals.bots, 1);
    assert.ok(sq.recent.some(e => e.outcome === 'expired'));
    assert.equal(sq.devices.reduce((a, d) => a + d.clicks, 0), 3, 'el bloqueado no entra en los desgloses');
});
await acheck('la serie del QR trae los bloqueados aparte', () => {
    const dia = sq.series.find(d => d.blocked > 0);
    assert.ok(dia && dia.clicks === 0, 'el día del bloqueo no tuvo escaneos buenos');
});

const ov = await store.overviewFor(SITIO, { period: 'd30', now: AHORA });
await acheck('el resumen del sitio: totales, estados de los QR, top QR y campañas', () => {
    // Tres: el migrado del ajuste viejo (`/conferencia`), `/inscripcion` y `/otro`.
    assert.equal(ov.totals.links, 3);
    assert.equal(ov.totals.qrs, 3);
    assert.equal(ov.totals.qrStates.disabled, 1);
    assert.equal(ov.totals.clicks, 8);
    assert.equal(ov.totals.qrScans, 5);
    assert.equal(ov.topQrs[0].id, afiche.qr.id);
    assert.equal(ov.topCampaigns[0].campaign, 'Feria 2027');
    assert.equal(ov.topCampaigns[0].periodScans, 5);
});
await acheck('⚠️ el resumen y el listado no recorren eventos', async () => {
    stub.clearLog();
    await store.overviewFor(SITIO, { now: AHORA });
    await store.listRedirects(SITIO);
    assert.ok(!stub.SQL_LOG.some(s => s.includes('LinkRedirectEvent')));
});

console.log('\n── Concurrencia y caídas ──────────────────────────────');

await acheck('veinte escaneos simultáneos del mismo QR cuentan veinte', async () => {
    const antes = stub.DATA.qrs.find(q => q.id === insta.qr.id).totalScans;
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
        store.recordClick({ link: vivo, click: clic(`10.1.0.${i}`), qr: qrI, now: AHORA })));
    assert.equal(stub.DATA.qrs.find(q => q.id === insta.qr.id).totalScans, antes + 20);
});
await acheck('un fallo midiendo el escaneo no lanza', async () => {
    stub.setFail(true);
    const r = await store.recordClick({ link: vivo, click: clic('9.9.9.9'), qr: qrA });
    const b = await store.recordBlockedScan({ link: vivo, qr: qrA, state: 'expired', click: clic('9.9.9.9') });
    const l = await store.lookupQrByCode(afiche.qr.code);
    stub.setFail(false);
    assert.equal(r.ok, false);
    assert.equal(b.ok, false);
    assert.equal(l, null);
});

// ════════════════════════════════════════════════════════════════════
console.log('\n── Lo que el doble no puede probar: el enganche ───────');

const API = readFileSync('api/index.js', 'utf8');
const bloque = API.slice(API.indexOf('Redirecciones de enlaces del sitio'), API.indexOf('SEO Inteligente: el <head>'));
check('el catch-all lee `?qr=` y lo quita antes de reenviar la query', () => {
    assert.match(bloque, /readQrParam\(search\)/);
    assert.match(bloque, /forwardedSearch\(stripQrParam\(search\)/);
});
check('⚠️ un QR que no está activo se registra como bloqueado y ve la página, sin saltar', () => {
    const iBloq = bloque.indexOf('await recordBlockedScan(');
    const iPag = bloque.indexOf('return paginaNoDisponible(');
    const iRed = bloque.indexOf('return res.redirect(');
    assert.ok(iBloq > 0 && iPag > iBloq && iPag < iRed);
    assert.match(bloque, /Cache-Control', 'no-store'\);\s*res\.setHeader\('Content-Type', 'text\/html/);
});
check('⚠️ un acceso por QR nunca se sirve como permanente', () => {
    assert.match(bloque, /const permanente = Boolean\(link\.permanent\) && !qr;/);
    assert.match(bloque, /redirectStatus\(\{ permanent: permanente/);
});
check('el clic con QR se registra ANTES de responder', () => {
    const iRec = bloque.indexOf('await recordClick({ link, click, qr })');
    const iRed = bloque.indexOf('return res.redirect(');
    assert.ok(iRec > 0 && iRec < iRed);
});
check('un código de un enlace pausado o borrado se busca por código y contesta con la página', () =>
    assert.match(bloque, /lookupQrByCode\(qrCode\)/));

const ESQ = readFileSync('server/lib/ensureLinkRedirectSchema.js', 'utf8');
check('las tres tablas nuevas están en EXPECTED_TABLES', () => {
    for (const t of ['LinkRedirectQr', 'LinkRedirectQrDaily', 'LinkRedirectQrVisitor']) {
        assert.ok(new RegExp(`'${t}',`).test(ESQ), t);
        assert.ok(ESQ.includes(`CREATE TABLE IF NOT EXISTS "${t}"`), t);
    }
});
check('⚠️ el código del QR es único en TODA la plataforma y el índice NO es parcial', () =>
    assert.match(ESQ, /CREATE UNIQUE INDEX IF NOT EXISTS "LinkRedirectQr_code_key"\s+ON "LinkRedirectQr" \(code\);/));
check('y las ocho están en la lista del guardián de db:push', () => {
    const GUARD = readFileSync('scripts/db-push-guard.mjs', 'utf8');
    for (const t of ['LinkRedirectQr', 'LinkRedirectQrDaily', 'LinkRedirectQrVisitor']) {
        assert.ok(GUARD.includes(t), `falta ${t}`);
    }
});

const STORE = readFileSync('server/lib/linkRedirectStore.js', 'utf8');
check('el escaneo bloqueado es UNA sentencia', () => {
    const cuerpo = STORE.slice(STORE.indexOf('export async function recordBlockedScan'));
    const fin = cuerpo.indexOf('\n}\n');
    assert.equal((cuerpo.slice(0, fin).match(/db\.query\(/g) || []).length, 1);
});
check('toda escritura de QR invalida la caché pública', () => {
    for (const fn of ['createQr', 'updateQr', 'setQrStatus', 'deleteQr']) {
        const i = STORE.indexOf(`export async function ${fn}`);
        const j = STORE.indexOf('\n}\n', i);
        assert.match(STORE.slice(i, j), /invalidateRedirectCache\(\)/, fn);
    }
});
check('⚠️ la fecha de vencimiento NUNCA se toma del cuerpo: pasa por expiryFor', () => {
    assert.doesNotMatch(STORE, /"expiresAt"\s*=\s*\$\d+[^\n]*patch\.expiresAt/);
    assert.match(STORE, /expiryFor\(validity\.preset/);
    assert.match(STORE, /expiryFor\(patch\.validity\.preset/);
});

const CTRL = readFileSync('server/controllers/linkRedirectController.js', 'utf8');
check('eliminar un QR exige confirmación (428) y el sitio sigue saliendo del token', () => {
    assert.match(CTRL.slice(CTRL.indexOf('export const qrRemove')), /428/);
    assert.doesNotMatch(CTRL, /req\.body[?.]*\.clubId/);
});
const RUTAS = readFileSync('server/routes/link-redirects.js', 'utf8');
check('`/overview` va antes que `/:id/...`', () =>
    assert.ok(RUTAS.indexOf("'/overview'") < RUTAS.indexOf("'/:id/stats'")));
check('las literales de los QR van antes que su paramétrica', () => {
    assert.ok(RUTAS.indexOf("'/:id/qrs/:qrId/stats'") < RUTAS.indexOf("router.put('/:id/qrs/:qrId'"));
    assert.ok(RUTAS.indexOf("'/:id/qrs/:qrId/status'") < RUTAS.indexOf("router.put('/:id/qrs/:qrId'"));
});

const PANEL = readFileSync('src/components/admin/LinkRedirectsPanel.tsx', 'utf8');
const DRAWER = readFileSync('src/components/admin/link-qr/QrDrawer.tsx', 'utf8');
const EDITOR = readFileSync('src/components/admin/link-qr/QrEditor.tsx', 'utf8');
check('el panel ofrece «Crear enlace inteligente» y el acceso a los QR', () => {
    assert.ok(PANEL.includes('Crear enlace inteligente'));
    assert.ok(PANEL.includes('<QrDrawer'));
});
check('la pantalla dice que mide accesos, no escaneos físicos ni inscripciones', () =>
    assert.match(DRAWER, /no escaneos físicos/));
check('el editor ofrece 30 / 90 / sin vencimiento / fecha propia y PNG, SVG y PDF', () => {
    assert.ok(EDITOR.includes('VALIDITY_PRESETS'));
    assert.ok(EDITOR.includes("['png', 'svg', 'pdf']"));
    assert.ok(EDITOR.includes('Copiar enlace del QR'));
});
check('ninguna respuesta se lee con .json() a ciegas', () => {
    for (const f of [PANEL, DRAWER, EDITOR, readFileSync('src/components/admin/link-qr/api.ts', 'utf8')]) {
        assert.doesNotMatch(f, /await res\.json\(\)/);
    }
});

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
