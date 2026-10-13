#!/usr/bin/env node
// npm run test:resilience — v4.1180.
//
// Qué se comprueba: que ninguna dependencia lenta deje un sitio en blanco.
// El documento y `/clubs/by-domain` se resuelven con TOPE de tiempo y con una
// copia de respaldo; el navegador arranca con tope, reintentos acotados y una
// pantalla con salida; y el monitor clasifica cada fallo por CAPA.
//
// Sin Postgres, credenciales ni red: el criterio es puro, y la ruta real se
// ejercita con la base sustituida en memoria (el mismo stub de
// test:district-site).

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const read = (p) => readFileSync(new URL(p, HERE), 'utf8');

let pass = 0, fail = 0;
const check = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { withDeadline, DeadlineExceeded, createSwrCache, serverTiming } = await import('../server/lib/resilience.js');
const budget = await import('../server/lib/documentBudget.js');
const health = await import('../server/lib/siteHealthSpec.js');

console.log('\n── withDeadline ───────────────────────────────────────');
await check('resuelve con el valor si llega a tiempo', async () => {
    assert.equal(await withDeadline(Promise.resolve(7), 100, 'x'), 7);
});
await check('rechaza con DeadlineExceeded al vencer el tope', async () => {
    const lenta = new Promise((r) => setTimeout(() => r(1), 200));
    await assert.rejects(withDeadline(lenta, 20, 'lenta'), (e) => e instanceof DeadlineExceeded && e.code === 'DEADLINE_EXCEEDED');
});
await check('un rechazo tardío no produce unhandledRejection', async () => {
    let unhandled = false;
    const h = () => { unhandled = true; };
    process.on('unhandledRejection', h);
    const tarde = new Promise((_, rej) => setTimeout(() => rej(new Error('tarde')), 30));
    await assert.rejects(withDeadline(tarde, 5, 't'));
    await sleep(60);
    process.off('unhandledRejection', h);
    assert.equal(unhandled, false);
});
await check('sin tope válido devuelve la promesa tal cual', async () => {
    assert.equal(await withDeadline(Promise.resolve('ok'), 0), 'ok');
});

console.log('\n── Caché con respaldo (stale-while-error) ─────────────');
await check('lo fresco se sirve sin volver a calcular', async () => {
    let t = 0, calls = 0;
    const c = createSwrCache({ ttlMs: 100, staleMs: 1000, now: () => t });
    const f = async () => ++calls;
    assert.deepEqual(await c.get('k', f), { value: 1, source: 'computed' });
    t = 50;
    assert.deepEqual(await c.get('k', f), { value: 1, source: 'fresh' });
    assert.equal(calls, 1);
});
await check('vencido y con la base FALLANDO, sirve lo viejo y lo dice', async () => {
    let t = 0;
    const c = createSwrCache({ ttlMs: 100, staleMs: 1000, now: () => t });
    await c.get('k', async () => 'bueno');
    t = 500;
    const r = await c.get('k', async () => { throw new Error('base caída'); });
    assert.equal(r.value, 'bueno');
    assert.equal(r.source, 'stale');
});
await check('vencido y con la base LENTA, sirve lo viejo al vencer el tope', async () => {
    let t = 0;
    const c = createSwrCache({ ttlMs: 100, staleMs: 1000, now: () => t });
    await c.get('k', async () => 'bueno');
    t = 500;
    const r = await c.get('k', () => sleep(200).then(() => 'nuevo'), { deadlineMs: 20 });
    assert.equal(r.source, 'stale');
    assert.equal(r.value, 'bueno');
});
await check('sin copia y con la base caída, el error SUBE (no se inventa nada)', async () => {
    const c = createSwrCache();
    await assert.rejects(c.get('k', async () => { throw new Error('x'); }));
});
await check('lo vencido más allá de staleMs ya no se sirve', async () => {
    let t = 0;
    const c = createSwrCache({ ttlMs: 10, staleMs: 100, now: () => t });
    await c.get('k', async () => 'viejo');
    t = 500;
    await assert.rejects(c.get('k', async () => { throw new Error('caída'); }));
});
await check('cien peticiones simultáneas comparten UN cálculo', async () => {
    const c = createSwrCache();
    let calls = 0;
    const f = () => sleep(20).then(() => ++calls);
    const rs = await Promise.all(Array.from({ length: 100 }, () => c.get('k', f)));
    assert.equal(calls, 1);
    assert.ok(rs.every((r) => r.value === 1));
});
await check('bypass recalcula aunque haya copia fresca, y conserva el respaldo', async () => {
    let calls = 0;
    const c = createSwrCache({ ttlMs: 10000 });
    await c.get('k', async () => ++calls);
    const r = await c.get('k', async () => ++calls, { bypass: true });
    assert.equal(r.value, 2);
    const r2 = await c.get('k', async () => { throw new Error('x'); }, { bypass: true });
    assert.equal(r2.source, 'stale');
});
await check('el tope de entradas se respeta', async () => {
    const c = createSwrCache({ max: 3 });
    for (const k of 'abcde') await c.get(k, async () => k);
    assert.equal(c.size(), 3);
});
await check('Server-Timing se compone y se sanea', async () => {
    assert.equal(serverTiming([['doc', 12.4, 'fre"sh'], ['x y', 3]]), 'doc;dur=12;desc="fresh", x_y;dur=3');
});

console.log('\n── Claves y cabeceras del documento ───────────────────');
await check('la clave del documento ignora www, mayúsculas, query y barra final', async () => {
    assert.equal(budget.documentCacheKey('WWW.Rotary4281.org', '/proyectos/'), budget.documentCacheKey('rotary4281.org', '/proyectos'));
    assert.notEqual(budget.documentCacheKey('a.org', '/x'), budget.documentCacheKey('b.org', '/x'));
});
await check('la vista previa no comparte caché con el sitio publicado', async () => {
    assert.notEqual(budget.siteConfigCacheKey('rotary4281.org', true), budget.siteConfigCacheKey('rotary4281.org', false));
});
await check('el documento NUNCA se cachea en el navegador', async () => {
    assert.match(budget.baseDocumentHeaders()['Cache-Control'], /no-store/);
});
await check('los topes del documento dejan margen bajo el de la función', async () => {
    assert.ok(budget.DOCUMENT_BUDGET.renderMs + budget.DOCUMENT_BUDGET.redirectsMs < 10000);
    assert.ok(budget.SITE_CONFIG_BUDGET.computeMs < 10000);
});

console.log('\n── Arranque del navegador (siteBoot) ──────────────────');
let boot = null;
try {
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: ['src/lib/siteBoot.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
    boot = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
} catch { console.log('  · esbuild no disponible: se saltan las pruebas de siteBoot'); }
if (boot) {
    await check('2xx carga, red/5xx/408/429 reintenta, 4xx cae al respaldo', async () => {
        assert.equal(boot.classifyBootResponse(200), 'ok');
        for (const s of [null, 500, 502, 503, 504, 408, 429]) assert.equal(boot.classifyBootResponse(s), 'retry', String(s));
        for (const s of [400, 404]) assert.equal(boot.classifyBootResponse(s), 'fallback');
    });
    await check('los reintentos están ACOTADOS (nunca un giro sin fin)', async () => {
        assert.ok(boot.BOOT_RETRY_DELAYS_MS.length <= 4);
        const peor = boot.BOOT_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + boot.BOOT_RETRY_DELAYS_MS.length * boot.BOOT_TIMEOUT_MS;
        assert.ok(peor <= 60000, `peor caso ${peor} ms`);
    });
    await check('la copia buena guardada se lee y vence', async () => {
        const mem = new Map();
        globalThis.window = { localStorage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) } };
        boot.writeLastGoodSite('rotary4281.org', { id: 's' }, 1000);
        assert.deepEqual(boot.readLastGoodSite('rotary4281.org', 2000), { id: 's' });
        assert.deepEqual(boot.readLastGoodSite('WWW.rotary4281.org', 2000), { id: 's' });
        assert.equal(boot.readLastGoodSite('rotary4281.org', 1000 + boot.LAST_GOOD_MAX_AGE_MS + 1), null);
        delete globalThis.window;
    });
    await check('sin almacenamiento disponible no lanza', async () => {
        globalThis.window = { localStorage: { getItem() { throw new Error('privado'); }, setItem() { throw new Error('privado'); } } };
        assert.equal(boot.readLastGoodSite('x'), null);
        boot.writeLastGoodSite('x', {});
        delete globalThis.window;
    });
    await check('fetchWithTimeout aborta al vencer', async () => {
        const orig = globalThis.fetch;
        globalThis.fetch = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
        try { await assert.rejects(boot.fetchWithTimeout('/x', 20)); }
        finally { globalThis.fetch = orig; }
    });
}

console.log('\n── Monitor: DNS y capas ───────────────────────────────');
await check('rotary4281.org hoy: un solo A → aviso, no crítico', async () => {
    const f = health.judgeDns({ apexA: ['216.150.1.1'], wwwCname: ['rotary4281.org.'] });
    assert.ok(f.some((x) => x.code === 'single_a' && x.level === 'warning'));
    assert.ok(!f.some((x) => x.level === 'critical'));
});
await check('una IP ajena es crítica; AAAA es aviso; sin registros es crítico', async () => {
    assert.ok(health.judgeDns({ apexA: ['1.2.3.4', '216.150.1.1'] }).some((x) => x.code === 'foreign_a' && x.level === 'critical'));
    assert.ok(health.judgeDns({ apexA: ['216.150.1.1', '216.150.16.1'], apexAAAA: ['::1'] }).some((x) => x.code === 'aaaa_present'));
    assert.equal(health.judgeDns({})[0].code, 'no_records');
});
await check('cada fallo cae en SU capa', async () => {
    assert.equal(health.classifyAttempt({ error: 'x', errorCode: 'ENOTFOUND' }).layer, 'dns');
    assert.equal(health.classifyAttempt({ error: 'x', errorCode: 'CERT_HAS_EXPIRED' }).layer, 'tls');
    assert.equal(health.classifyAttempt({ error: 'timeout', errorCode: 'UND_ERR_HEADERS_TIMEOUT' }).layer, 'function');
    assert.equal(health.classifyAttempt({ status: 503 }).layer, 'function');
    assert.equal(health.classifyAttempt({ status: 200, hasRoot: false }).layer, 'document');
    assert.equal(health.classifyAttempt({ status: 200, hasRoot: true, scriptSrc: '/a.js', assetStatus: 404 }).layer, 'asset');
    assert.deepEqual(health.classifyAttempt({ status: 200, hasRoot: true, scriptSrc: '/a.js', assetStatus: 200, assetType: 'text/javascript' }), { ok: true });
});
await check('el documento base es DEGRADADO, no caído', async () => {
    const v = health.classifyAttempt({ status: 200, hasRoot: true, scriptSrc: '/a.js', assetStatus: 200, docSource: 'base' });
    assert.equal(v.ok, true);
    assert.equal(v.degraded, true);
});
await check('el resumen marca crítica una carga lenta y aviso una copia de respaldo', async () => {
    const ok = { status: 200, hasRoot: true, scriptSrc: '/a.js', assetStatus: 200, ttfbMs: 300 };
    const s = health.summarize({ attempts: [ok, { ...ok, ttfbMs: 9000 }], siteConfig: [{ ok: true, ms: 100, source: 'stale' }] });
    assert.equal(s.status, 'critical');
    assert.ok(s.findings.some((f) => f.code === 'doc_max'));
    assert.ok(s.findings.some((f) => f.code === 'site_config_stale'));
    assert.equal(health.summarize({ attempts: [ok, ok, ok] }).status, 'ok');
});

console.log('\n── Cableado (leído de los archivos) ───────────────────');
const api = read('./api/index.js');
const clubs = read('./server/routes/clubs.js');
const ctx = read('./src/contexts/ClubContext.tsx');
await check('el documento se resuelve con caché y tope; la base nunca bloquea sin fin', async () => {
    assert.match(api, /documentCache\.get\(/);
    assert.match(api, /deadlineMs:\s*DOCUMENT_BUDGET\.renderMs/);
    assert.match(api, /withDeadline\([^)]*readRedirectsForHost/s);
    assert.match(api, /DOCUMENT_BUDGET\.redirectsMs,\s*'saas_redirect'/);
});
await check('el documento dice de dónde salió (X-Doc-Source, Server-Timing)', async () => {
    assert.match(api, /X-Doc-Source/);
    assert.match(api, /Server-Timing/);
});
await check('existen las sondas live (sin base) y deps (con tope)', async () => {
    assert.match(api, /\/api\/health\/live/);
    assert.match(api, /\/api\/health\/deps/);
});
await check('/by-domain pasa por la caché con tope y responde 503 al vencer', async () => {
    assert.match(clubs, /siteConfigCache\.get\(/);
    assert.match(clubs, /deadlineMs:\s*SITE_CONFIG_BUDGET\.computeMs/);
    assert.match(clubs, /DEADLINE_EXCEEDED/);
    assert.match(clubs, /unavailable \? 503 : 500/);
    assert.match(clubs, /PrismaClientInitializationError/);
    assert.doesNotMatch(clubs, /stack:\s*error\.stack/);
});
await check('el arranque del navegador tiene tope, reintentos y salida', async () => {
    assert.match(ctx, /fetchWithTimeout\(/);
    assert.match(ctx, /BOOT_RETRY_DELAYS_MS/);
    assert.match(ctx, /Reintentar/);
    assert.match(ctx, /readLastGoodSite/);
    // El fetch sin tope del arranque anterior no vuelve.
    assert.doesNotMatch(ctx, /await fetch\(`\$\{import\.meta\.env\.VITE_API_URL/);
});

console.log('\n── /clubs/by-domain de punta a punta (base en memoria) ─');
let routeOk = true;
let stub, base, server;
try {
    const STUB = new URL('./scripts/fixtures/db-district-stub.mjs', HERE).href;
    register(
        `data:text/javascript,export async function resolve(s,c,n){return s.endsWith('/lib/db.js')?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
        HERE
    );
    const express = (await import('express')).default;
    const router = (await import('../server/routes/clubs.js')).default;
    stub = await import(STUB);
    const app = express();
    app.use('/api/clubs', router);
    server = createServer(app);
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}/api/clubs/by-domain`;
} catch (e) {
    routeOk = false;
    console.log('  · no se pudo montar la ruta (¿faltan dependencias?):', e.message);
}
if (routeOk) {
    const get = async (q) => {
        const res = await fetch(`${base}?${q}`);
        return { status: res.status, src: res.headers.get('x-site-config'), cc: res.headers.get('cache-control'), body: await res.json() };
    };
    await check('primera visita calcula; la segunda sale de la caché', async () => {
        stub.reset();
        const a = await get('domain=rotary4281.org');
        assert.equal(a.status, 200);
        assert.equal(a.src, 'computed');
        const b = await get('domain=rotary4281.org');
        assert.equal(b.src, 'fresh');
        assert.equal(b.body.id, a.body.id);
        assert.match(a.cc || '', /no-store/);
    });
    await check('con la base CAÍDA, fresh=1 sirve la última copia buena (no un 500)', async () => {
        const d = stub.DATA;
        Object.defineProperty(d, 'districts', { configurable: true, get() { throw new Error('base caída'); } });
        Object.defineProperty(d, 'clubs', { configurable: true, get() { throw new Error('base caída'); } });
        const r = await get('domain=rotary4281.org&fresh=1');
        assert.equal(r.status, 200);
        assert.equal(r.src, 'stale');
        assert.ok(r.body.id);
    });
    await check('sin copia y con la base caída, responde un error con su código (no cuelga)', async () => {
        const r = await get('domain=otro-sitio-sin-copia.org');
        assert.ok(r.status >= 500);
        assert.ok(r.body.code || r.body.error);
    });
    await check('sin dominio responde 400', async () => {
        const res = await fetch(base);
        assert.equal(res.status, 400);
    });
    server.close();
    stub.reset();
}

console.log(`\n${fail ? '❌' : '✅'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
