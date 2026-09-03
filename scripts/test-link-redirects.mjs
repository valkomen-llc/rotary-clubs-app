#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Enlaces medibles: el criterio de la medición y el camino completo
//
//   npm run test:links
//
// Qué se comprueba: qué cuenta como clic humano, de dónde vino, con qué
// dispositivo, qué código HTTP corresponde — y después el CAMINO: crear,
// editar sin perder el historial, pausar, borrar en suave, el aislamiento por
// sitio y las estadísticas.
//
// No necesita Postgres, credenciales ni red: la base se sustituye en memoria
// con un hook de resolución de módulos.
// Necesita esbuild para el espejo del navegador:  npm i --no-save esbuild
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const STUB = new URL('./scripts/fixtures/db-redirects-stub.mjs', HERE).href;
register(
    `data:text/javascript,export async function resolve(s,c,n){return (s==='./db.js'||s.endsWith('/lib/db.js'))?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    HERE
);

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

// User-agents reales, no inventados para que la prueba pase.
const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1',
    tabletAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    // La vista previa de WhatsApp, textual.
    whatsappPreview: 'WhatsApp/2.23.20.0 A',
    facebookPreview: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    curl: 'curl/8.4.0',
    // Un teléfono REAL cuya marca lleva «bot» adentro.
    cubot: 'Mozilla/5.0 (Linux; Android 12; CUBOT NOTE 20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36',
};

console.log('\n── Bots, vistas previas y precargas ───────────────────');

check('⚠️ la vista previa de WhatsApp NO es un clic', () => {
    // Es el ruido principal de este módulo: WhatsApp pide el enlace UNA VEZ
    // POR CHAT para dibujar la tarjeta, así que contarlo infla el número en
    // proporción a lo bien que se compartió.
    const r = T.classifyAgent(UA.whatsappPreview);
    assert.equal(r.isBot, true);
    assert.equal(r.botKind, 'preview');
});
check('la de Facebook tampoco', () => assert.equal(T.classifyAgent(UA.facebookPreview).isBot, true));
check('un buscador tampoco', () => assert.equal(T.classifyAgent(UA.googlebot).botKind, 'crawler'));
check('una herramienta de línea de comandos tampoco', () => assert.equal(T.classifyAgent(UA.curl).botKind, 'tool'));
check('una persona SÍ cuenta', () => assert.equal(T.classifyAgent(UA.iphone).isBot, false));
check('⚠️ un CUBOT es un teléfono, no un bot', () =>
    // `bot` aparece dentro de cadenas legítimas: por eso el patrón genérico
    // exige un límite de palabra y va al final de la lista.
    assert.equal(T.classifyAgent(UA.cubot).isBot, false));
check('sin user-agent se toma por automático', () =>
    // Todo navegador real manda uno; lo que llega sin él es casi siempre un
    // script. Ante la duda, no se cuenta como persona.
    assert.equal(T.classifyAgent('').isBot, true));
check('una PRECARGA del navegador no es un clic', () =>
    // Chrome pide el enlace porque el usuario pasó el cursor por encima:
    // nadie decidió nada todavía.
    assert.equal(T.classifyAgent(UA.win, { 'sec-purpose': 'prefetch' }).botKind, 'prefetch'));
check('la cabecera de intención se lee sin distinguir mayúsculas', () =>
    assert.equal(T.classifyAgent(UA.win, { 'Purpose': 'Prefetch' }).isBot, true));

console.log('\n── Dispositivo, navegador y sistema ───────────────────');

check('iPhone → móvil / iOS / Safari', () => {
    const r = T.parseUserAgent(UA.iphone);
    assert.deepEqual([r.device, r.os, r.browser], ['movil', 'iOS', 'Safari']);
});
check('Android con «Mobile» → móvil', () => assert.equal(T.parseUserAgent(UA.android).device, 'movil'));
check('⚠️ un iPad es TABLET, aunque diga «Macintosh» no lo dice: dice iPad', () =>
    assert.equal(T.parseUserAgent(UA.ipad).device, 'tablet'));
check('⚠️ un Android SIN «Mobile» es una tablet', () =>
    // Es la convención de Android y el orden de la comprobación importa: sin
    // esa regla, toda tablet Android se contaría como computador.
    assert.equal(T.parseUserAgent(UA.tabletAndroid).device, 'tablet'));
check('Windows → desktop / Windows', () => {
    const r = T.parseUserAgent(UA.win);
    assert.deepEqual([r.device, r.os], ['desktop', 'Windows']);
});
check('⚠️ Edge NO se confunde con Chrome', () =>
    // Edge dice «Chrome» y «Safari» en su cadena: el orden de las
    // comprobaciones es lo único que evita el falso positivo.
    assert.equal(T.parseUserAgent(UA.edge).browser, 'Edge'));
check('⚠️ Chrome NO se confunde con Safari', () =>
    assert.equal(T.parseUserAgent(UA.win).browser, 'Chrome'));
check('Safari de escritorio sigue siendo Safari', () =>
    assert.equal(T.parseUserAgent(UA.mac).browser, 'Safari'));
check('Firefox se reconoce', () => assert.equal(T.parseUserAgent(UA.firefox).browser, 'Firefox'));
check('sin user-agent no se inventa un dispositivo', () =>
    assert.equal(T.parseUserAgent('').device, 'desconocido'));

console.log('\n── De dónde vino: la evidencia manda ──────────────────');

check('⚠️ sin Referer y sin UTM la visita es DIRECTA, no de WhatsApp', () => {
    // La regla del módulo. WhatsApp en el móvil NO manda `Referer`, así que su
    // tráfico legítimo cae acá; atribuírselo «porque suele ser» sería inventar
    // la única cifra por la que alguien va a tomar una decisión.
    const r = T.attributeSource({});
    assert.equal(r.kind, 'directo');
    assert.equal(r.evidence, 'ninguna');
});
check('y se dice «Directo o desconocido», no «Directo» a secas', () =>
    // Las dos cosas se ven igual desde acá y el matiz tiene que poder leerse.
    assert.match(T.attributeSource({}).label, /desconocido/i));
check('con Referer de WhatsApp SÍ se atribuye', () => {
    const r = T.attributeSource({ referrer: 'https://api.whatsapp.com/' });
    assert.equal(r.kind, 'whatsapp');
    assert.equal(r.evidence, 'referrer');
});
check('un subdominio de Facebook también', () =>
    assert.equal(T.attributeSource({ referrer: 'https://l.facebook.com/l.php?u=x' }).kind, 'facebook'));
check('⚠️ el UTM GANA sobre el Referer', () => {
    // Lo declaró quien armó el enlace: es la evidencia más fuerte.
    const r = T.attributeSource({ referrer: 'https://www.google.com/', utm: { utmSource: 'instagram' } });
    assert.equal(r.kind, 'campana');
    assert.equal(r.label, 'instagram');
    assert.equal(r.evidence, 'utm');
});
check('un dominio desconocido se reporta con su host, no se inventa', () => {
    const r = T.attributeSource({ referrer: 'https://boletin.rotary4281.org/n/5' });
    assert.equal(r.kind, 'referencia');
    assert.equal(r.label, 'boletin.rotary4281.org');
});
check('un Referer ilegible no rompe nada', () =>
    assert.equal(T.attributeSource({ referrer: 'no-es-una-url' }).kind, 'directo'));

console.log('\n── Los parámetros de campaña ──────────────────────────');

check('se leen los cinco', () => {
    const u = T.readUtm('?utm_source=instagram&utm_medium=social&utm_campaign=feria2026&utm_content=story&utm_term=rotary');
    assert.deepEqual(u, {
        utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'feria2026',
        utmContent: 'story', utmTerm: 'rotary',
    });
});
check('sin query no hay UTM y no falla', () => assert.equal(T.readUtm('').utmSource, ''));
check('una query con basura no rompe la lectura', () => assert.equal(T.readUtm('?%%%=1').utmSource, ''));
check('el ejemplo del pedido se lee entero', () => {
    const u = T.readUtm('utm_source=instagram&utm_medium=social&utm_campaign=feria2026');
    assert.equal(u.utmCampaign, 'feria2026');
});

console.log('\n── El salto ───────────────────────────────────────────');

check('⚠️ por defecto es 302, no 301', () =>
    // Un 301 lo cachean el navegador y los proxies durante meses: un destino
    // corregido sigue llevando al viejo Y deja de contarse, porque el navegador
    // ya no vuelve a preguntar.
    assert.equal(T.redirectStatus({}), 302));
check('permanente es 301 sólo si alguien lo eligió', () =>
    assert.equal(T.redirectStatus({ permanent: true }), 301));
check('⚠️ un POST usa 307, no 302', () =>
    // 301 y 302 autorizan al navegador a cambiar el método a GET y perder el
    // cuerpo; 307 y 308 lo conservan.
    assert.equal(T.redirectStatus({ method: 'POST' }), 307));
check('y un POST permanente usa 308', () =>
    assert.equal(T.redirectStatus({ permanent: true, method: 'POST' }), 308));
check('HEAD se comporta como GET', () =>
    assert.equal(T.redirectStatus({ method: 'HEAD' }), 302));

check('la query se propaga cuando el enlace lo dice', () =>
    assert.equal(T.forwardedSearch('?utm_source=x', { forwardQuery: true }), '?utm_source=x'));
check('y NO se propaga cuando no', () =>
    assert.equal(T.forwardedSearch('?utm_source=x', { forwardQuery: false }), ''));
check('una query vacía no ensucia el destino', () =>
    assert.equal(T.forwardedSearch('?', { forwardQuery: true }), ''));

console.log('\n── La forma del clic ──────────────────────────────────');

const clic = T.describeClick({
    headers: {
        referer: 'https://l.instagram.com/',
        'x-vercel-ip-country': 'co',
        'x-vercel-ip-city': 'Bogot%C3%A1',
        'x-vercel-ip-country-region': 'DC',
    },
    search: '?utm_source=instagram&utm_medium=social',
    userAgent: UA.iphone,
    ip: '190.1.2.3',
    method: 'GET',
    clubId: 'sitio-4281',
});
check('junta agente, campaña, dispositivo y ubicación', () => {
    assert.equal(clic.isBot, false);
    assert.equal(clic.device, 'movil');
    assert.equal(clic.sourceKind, 'campana');
    assert.equal(clic.utmMedium, 'social');
    assert.equal(clic.country, 'CO');
});
check('la ciudad llega percent-encoded y se decodifica', () =>
    assert.equal(clic.city, 'Bogotá'));
check('un país que no son dos letras se descarta en vez de guardarse mal', () =>
    assert.equal(T.describeClick({ headers: { 'x-vercel-ip-country': 'XYZ1' } }).country, ''));

console.log('\n── El identificador del visitante ─────────────────────');

check('⚠️ la IP entra en la semilla y NO se guarda en ninguna parte', () => {
    // Se persiste el hash. Es lo que permite contar visitantes sin conservar un
    // dato que identifica a una persona.
    const ESQUEMA = readFileSync('server/lib/ensureLinkRedirectSchema.js', 'utf8');
    assert.doesNotMatch(ESQUEMA, /"ip"|\bip TEXT\b|"ipAddress"/i);
});
check('⚠️ el sitio entra en la semilla', () => {
    // Sin él, la misma persona tendría el mismo identificador en los enlaces de
    // dos organizaciones del ecosistema: eso es rastreo entre sitios.
    const a = T.visitorSeed({ clubId: 'cali', ip: '1.2.3.4', userAgent: UA.win });
    const b = T.visitorSeed({ clubId: 'sitio-4281', ip: '1.2.3.4', userAgent: UA.win });
    assert.notEqual(a, b);
});
check('la misma persona en el mismo sitio da la misma semilla', () =>
    assert.equal(
        T.visitorSeed({ clubId: 'cali', ip: '1.2.3.4', userAgent: UA.win }),
        T.visitorSeed({ clubId: 'cali', ip: ' 1.2.3.4 ', userAgent: UA.win })
    ));
check('una lista de IPs reenviadas toma la primera', () =>
    assert.ok(T.visitorSeed({ ip: '190.1.2.3, 10.0.0.1' }).includes('190.1.2.3')));
check('sin IP y sin user-agent NO se identifica a nadie', () =>
    // La semilla sería la misma para todo el mundo y el contador diría 1 para
    // siempre. Ante la duda, el clic se cuenta y el visitante no.
    assert.equal(T.canIdentifyVisitor({}), false));

console.log('\n── Los días y los períodos ────────────────────────────');

check('⚠️ el día se cuenta en la zona del sitio, no en UTC', () => {
    // La función corre en UTC: un clic de las 8 de la noche en Colombia caería
    // en el día siguiente y el gráfico se leería mal en la franja de más
    // tráfico.
    const nocheEnBogota = new Date('2026-09-03T02:30:00Z');   // 21:30 del 2 en Bogotá
    assert.equal(T.dayKey(nocheEnBogota, 'America/Bogota'), '2026-09-02');
    assert.equal(T.dayKey(nocheEnBogota, 'UTC'), '2026-09-03');
});
check('«últimos 7 días» son 7 días ENTEROS, contando hoy', () => {
    const r = T.periodRange('d7', new Date('2026-09-03T15:00:00Z'), 'America/Bogota');
    assert.equal(r.toDay, '2026-09-03');
    assert.equal(r.fromDay, '2026-08-28');
});
check('«todo el historial» no acota por fecha', () =>
    assert.equal(T.periodRange('todo', new Date()).fromDay, null));
check('un período desconocido cae en 30 días, no en vacío', () =>
    assert.equal(T.periodRange('inventado', new Date('2026-09-03T15:00:00Z')).days, 30));
check('el gráfico rellena los días sin clics', () => {
    // Sin esto, el gráfico une dos puntos lejanos con una recta y hace creer
    // que hubo tráfico donde no lo hubo.
    const s = T.fillDays([{ day: '2026-09-03', clicks: 5 }], { fromDay: '2026-09-01', toDay: '2026-09-03' });
    assert.equal(s.length, 3);
    assert.deepEqual(s.map(d => d.clicks), [0, 0, 5]);
});

console.log('\n── El espejo del navegador ────────────────────────────');

const outDir = mkdtempSync(join(tmpdir(), 'links-test-'));
process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { } });
let C = null;
try {
    const BUILT = join(outDir, 'linkTracking.js');
    execFileSync('npx', ['esbuild', 'src/lib/linkTracking.ts',
        `--outfile=${BUILT}`, '--format=esm', '--platform=neutral'], { stdio: 'pipe' });
    C = await import(BUILT);
} catch { console.log('  … se salta: falta esbuild (npm i --no-save esbuild)'); }

if (C) {
    check('todo `sourceKind` que el servidor puede emitir tiene rótulo', () => {
        const posibles = new Set(['directo', 'campana', 'referencia', ...T.SOURCE_RULES.map(r => r.kind)]);
        for (const k of posibles) {
            assert.ok(C.SOURCE_LABELS[k], `falta el rótulo de «${k}»`);
        }
    });
    check('todo dispositivo que el servidor puede emitir tiene rótulo', () => {
        for (const d of ['movil', 'desktop', 'tablet', 'desconocido']) {
            assert.ok(C.DEVICE_LABELS[d], `falta el rótulo de «${d}»`);
        }
    });
    check('los períodos son los mismos en los dos', () =>
        assert.deepEqual(Object.keys(C.PERIOD_LABELS).sort(), Object.keys(T.PERIODS).sort()));
    check('⚠️ el espejo NO trae el criterio, sólo los rótulos', () => {
        // Quien decide qué es un bot y de dónde vino es el servidor: copiarlo
        // daría dos criterios sobre el mismo clic.
        assert.equal(C.classifyAgent, undefined);
        assert.equal(C.attributeSource, undefined);
        assert.equal(C.visitorSeed, undefined);
    });
    check('la pantalla explica por qué «directo» no es «nadie vino por el enlace»', () =>
        assert.match(C.describeSourceEvidence(), /utm_source/));
}

// ════════════════════════════════════════════════════════════════════
// EL CAMINO. Con la base sustituida en memoria.
// ════════════════════════════════════════════════════════════════════

const store = await import('../server/lib/linkRedirectStore.js');
const stub = await import(STUB);
const SITIO = 'sitio-4281';
const OTRO = 'cali';
const yo = { id: 'u1', name: 'Daniel Yazo' };

const limpio = () => { stub.reset(); stub.DATA.settings = []; store.invalidateRedirectCache(); };

console.log('\n── Crear, editar, pausar, borrar ──────────────────────');

limpio();
let creada = await store.createRedirect({
    clubId: SITIO, slug: 'Evento2026/', target: 'https://destino.com/inscripcion', actor: yo,
});
await acheck('se crea activa y con la dirección canonizada', () => {
    assert.equal(creada.ok, true);
    assert.equal(creada.link.slug, '/evento2026');
    assert.equal(creada.link.status, 'active');
    assert.equal(creada.link.permanent, false, 'el default tiene que ser temporal');
});
await acheck('queda quién la creó', () =>
    assert.equal(creada.link.createdByName, 'Daniel Yazo'));

await acheck('⚠️ NO se puede redirigir /admin', async () => {
    // Dejaría al administrador sin panel y sin forma de entrar a quitarla.
    const r = await store.createRedirect({ clubId: SITIO, slug: '/admin', target: 'https://x.org' });
    assert.equal(r.ok, false);
    assert.match(r.error, /sistema/i);
});
await acheck('ni la portada', async () =>
    assert.equal((await store.createRedirect({ clubId: SITIO, slug: '/', target: 'https://x.org' })).ok, false));
await acheck('ni un destino `javascript:`', async () =>
    assert.equal((await store.createRedirect({ clubId: SITIO, slug: '/malo', target: 'javascript:alert(1)' })).ok, false));
await acheck('⚠️ dos enlaces vivos no pueden compartir dirección', async () => {
    const r = await store.createRedirect({ clubId: SITIO, slug: '/evento2026', target: 'https://otro.org' });
    assert.equal(r.ok, false);
    assert.match(r.error, /Ya hay una redirección/);
});
await acheck('pero OTRO sitio sí puede usar la misma', async () => {
    const r = await store.createRedirect({ clubId: OTRO, slug: '/evento2026', target: 'https://cali.org' });
    assert.equal(r.ok, true);
});

console.log('\n── El clic ────────────────────────────────────────────');

const link = creada.link;
const visita = (over = {}) => T.describeClick({
    headers: { referer: '', ...(over.headers || {}) },
    search: over.search || '',
    userAgent: over.userAgent ?? UA.iphone,
    ip: over.ip ?? '190.1.2.3',
    clubId: SITIO,
});

await store.recordClick({ link, click: visita() });
await acheck('un clic humano suma clic Y visitante', () => {
    const l = stub.DATA.links.find(x => x.id === link.id);
    assert.equal(l.totalClicks, 1);
    assert.equal(l.uniqueVisitors, 1);
    assert.ok(l.lastClickAt, 'tiene que quedar la fecha del último clic');
});

await store.recordClick({ link, click: visita() });
await acheck('⚠️ el MISMO visitante vuelve: suma clic y NO suma visitante', () => {
    const l = stub.DATA.links.find(x => x.id === link.id);
    assert.equal(l.totalClicks, 2);
    assert.equal(l.uniqueVisitors, 1, 'un visitante que vuelve no es uno nuevo');
});

await store.recordClick({ link, click: visita({ ip: '200.9.9.9' }) });
await acheck('otro visitante sí suma', () =>
    assert.equal(stub.DATA.links.find(x => x.id === link.id).uniqueVisitors, 2));

await store.recordClick({ link, click: visita({ userAgent: UA.whatsappPreview }) });
await acheck('⚠️ la vista previa de WhatsApp NO suma clics', () => {
    const l = stub.DATA.links.find(x => x.id === link.id);
    assert.equal(l.totalClicks, 3, 'la vista previa se coló como clic');
    assert.equal(l.botHits, 1, 'y tiene que quedar contada aparte');
});
await acheck('y no deja evento: se registra que ocurrió, no cada vez', () =>
    assert.equal(stub.DATA.events.filter(e => e.userAgent.includes('WhatsApp')).length, 0));

await store.recordClick({
    link,
    click: visita({ search: '?utm_source=instagram&utm_medium=social&utm_campaign=feria2026', ip: '201.1.1.1' }),
});
await acheck('los UTM quedan guardados con el clic', () => {
    const e = stub.DATA.events.find(x => x.utmCampaign === 'feria2026');
    assert.ok(e, 'no se guardó la campaña');
    assert.equal(e.sourceKind, 'campana');
});

await acheck('un fallo midiendo NO tumba nada', async () => {
    stub.setFail(true);
    const r = await store.recordClick({ link, click: visita() });
    stub.setFail(false);
    assert.equal(r.ok, false);   // devuelve el motivo en vez de lanzar
});

console.log('\n── Editar sin perder el historial ─────────────────────');

const antes = stub.DATA.links.find(x => x.id === link.id).totalClicks;
const editada = await store.updateRedirect(link.id, SITIO, { target: 'https://destino.com/NUEVO' }, yo);
await acheck('⚠️ cambiar el destino conserva cada clic', () => {
    assert.equal(editada.ok, true);
    assert.equal(editada.link.target, 'https://destino.com/NUEVO');
    assert.equal(editada.link.totalClicks, antes, 'se perdió el historial al editar');
});
await acheck('y el cambio de destino queda en la auditoría, con quién', () => {
    const a = stub.DATA.audit.find(x => x.action === 'edited');
    assert.ok(a, 'no quedó registrado');
    assert.equal(a.fromTarget, 'https://destino.com/inscripcion');
    assert.equal(a.toTarget, 'https://destino.com/NUEVO');
    assert.equal(a.actorName, 'Daniel Yazo');
});

const cambiarSlug = await store.updateRedirect(link.id, SITIO, { slug: '/conferencia' }, yo);
await acheck('⚠️ cambiar la DIRECCIÓN tampoco pierde el historial', () =>
    // La analítica cuelga del id del enlace, no del texto del slug.
    assert.equal(cambiarSlug.link.totalClicks, antes));

console.log('\n── Pausar y borrar ────────────────────────────────────');

const pausada = await store.setRedirectStatus(link.id, SITIO, 'paused', yo);
await acheck('⚠️ pausar NO borra las estadísticas', () => {
    assert.equal(pausada.link.status, 'paused');
    assert.equal(pausada.link.totalClicks, antes);
});
await acheck('un enlace pausado deja de resolver', async () => {
    store.invalidateRedirectCache();
    const vivos = await store.readRedirectsForHost('rotary4281.org');
    assert.equal(vivos.find(l => l.id === link.id), undefined);
});
await store.setRedirectStatus(link.id, SITIO, 'active', yo);

const borrada = await store.deleteRedirect(link.id, SITIO, yo);
await acheck('⚠️ eliminar es SUAVE: la fila y su historial se quedan', () => {
    assert.equal(borrada.ok, true);
    const l = stub.DATA.links.find(x => x.id === link.id);
    assert.ok(l, 'la fila desapareció');
    assert.ok(l.deletedAt, 'no se marcó como borrada');
    assert.equal(l.totalClicks, antes, 'se perdió el historial al borrar');
});
await acheck('y deja de aparecer en el listado', async () => {
    const lista = await store.listRedirects(SITIO);
    assert.equal(lista.items.find(i => i.id === link.id), undefined);
});
await acheck('la dirección queda LIBRE para volver a usarse', async () => {
    const r = await store.createRedirect({ clubId: SITIO, slug: '/conferencia', target: 'https://otra.org' });
    assert.equal(r.ok, true, r.error);
    assert.notEqual(r.link.id, link.id, 'tiene que ser un enlace NUEVO, con su propia historia');
});

console.log('\n── El aislamiento por sitio ───────────────────────────');

limpio();
const deOtro = await store.createRedirect({ clubId: OTRO, slug: '/suyo', target: 'https://cali.org', actor: yo });
await acheck('⚠️ una redirección ajena NO EXISTE: 404, no 403', async () => {
    // Confirmar que existe es la mitad de lo que hace falta para ir a buscarla.
    assert.equal(await store.getRedirect(deOtro.link.id, SITIO), null);
    const r = await store.updateRedirect(deOtro.link.id, SITIO, { target: 'https://robado.org' }, yo);
    assert.equal(r.status, 404);
});
await acheck('ni se puede pausar ni borrar desde otro sitio', async () => {
    assert.equal((await store.setRedirectStatus(deOtro.link.id, SITIO, 'paused', yo)).status, 404);
    assert.equal((await store.deleteRedirect(deOtro.link.id, SITIO, yo)).status, 404);
    assert.equal(stub.DATA.links.find(l => l.id === deOtro.link.id).deletedAt, null);
});
await acheck('y el listado de un sitio no ve las del otro', async () => {
    const lista = await store.listRedirects(SITIO);
    assert.equal(lista.items.length, 0);
});

console.log('\n── Las estadísticas ───────────────────────────────────');

limpio();
const medible = (await store.createRedirect({
    clubId: SITIO, slug: '/feria', target: 'https://feria.org', actor: yo,
})).link;

const ahora = new Date();
for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
    await store.recordClick({ link: medible, click: visita({ ip }), now: ahora });
}
await store.recordClick({ link: medible, click: visita({ ip: '1.1.1.1' }), now: ahora });
await store.recordClick({
    link: medible, now: ahora,
    click: visita({ ip: '4.4.4.4', userAgent: UA.win, headers: { referer: 'https://www.facebook.com/' } }),
});
await store.recordClick({ link: medible, click: visita({ userAgent: UA.googlebot }), now: ahora });

const st = await store.statsFor(medible.id, SITIO, { period: 'd30', now: ahora });
await acheck('clics totales y visitantes únicos se distinguen', () => {
    assert.equal(st.totals.clicks, 5, 'un visitante que vuelve suma clic');
    assert.equal(st.totals.uniqueVisitors, 4, 'pero no suma visitante');
});
await acheck('los accesos automáticos se cuentan APARTE', () =>
    assert.equal(st.totals.bots, 1));
await acheck('«hoy» sale del agregado diario', () => assert.equal(st.totals.today, 5));
await acheck('el desglose por fuente distingue directo de Facebook', () => {
    const porTipo = Object.fromEntries(st.sources.map(s => [s.kind, s.clicks]));
    assert.equal(porTipo.directo, 4);
    assert.equal(porTipo.facebook, 1);
});
await acheck('el desglose por dispositivo separa móvil de computador', () => {
    const porDisp = Object.fromEntries(st.devices.map(d => [d.device, d.clicks]));
    assert.equal(porDisp.movil, 4);
    assert.equal(porDisp.desktop, 1);
});
await acheck('la serie cubre el rango entero, con los días vacíos', () =>
    assert.equal(st.series.length, 30));
await acheck('un enlace ajeno no entrega estadísticas', async () =>
    assert.equal((await store.statsFor(medible.id, OTRO)).status, 404));

console.log('\n── Rendimiento: el listado no toca los eventos ────────');

await acheck('⚠️ pintar el listado NO recorre ni un evento', async () => {
    // Es el requisito de rendimiento: los contadores viven en la propia fila,
    // así que cien enlaces cuestan una consulta tenga la plataforma mil clics
    // o diez millones.
    stub.clearLog();
    await store.listRedirects(SITIO);
    const tocaEventos = stub.SQL_LOG.filter(q => q.includes('"LinkRedirectEvent"'));
    assert.deepEqual(tocaEventos, []);
});
await acheck('el listado pagina', async () => {
    const p = await store.listRedirects(SITIO, { page: 1, perPage: 1 });
    assert.equal(p.perPage, 1);
    assert.ok(typeof p.total === 'number');
});
await acheck('la cabecera de las estadísticas sale del AGREGADO, no de los eventos', async () => {
    stub.clearLog();
    await store.statsFor(medible.id, SITIO, { period: 'd7', now: ahora });
    const cabecera = stub.SQL_LOG.find(q => q.includes('FILTER (WHERE day'));
    assert.ok(cabecera, 'las cifras de cabecera tienen que salir del agregado diario');
    assert.ok(cabecera.includes('LinkRedirectDaily'));
});

console.log('\n── El SQL que el doble no puede probar ────────────────');

const STORE = readFileSync('server/lib/linkRedirectStore.js', 'utf8');
check('⚠️ el clic se registra en UNA sola ida a la base', () => {
    // En Vercel la función se congela al cerrar la respuesta, así que medir
    // después no existe; y cuatro escrituras sueltas son cuatro viajes de red
    // ANTES del salto. Con CTEs encadenadas se resuelve en un viaje.
    const cuerpo = STORE.slice(STORE.indexOf('export async function recordClick'));
    const fin = cuerpo.indexOf('\n}\n');
    const consultas = (cuerpo.slice(0, fin).match(/db\.query\(/g) || []).length;
    assert.equal(consultas, 2, 'una sentencia para el clic humano y otra para el bot, nada más');
});
check('el agregado diario usa ON CONFLICT sobre su clave primaria', () =>
    assert.match(STORE, /ON CONFLICT \("linkId", day\)/));
check('⚠️ el índice único del slug es PARCIAL, así que no se usa ON CONFLICT contra él', () => {
    // Tendría que repetir el predicado o la sentencia falla entera (v4.648).
    assert.doesNotMatch(STORE, /ON CONFLICT[^\n]*"clubId", slug/);
    assert.match(STORE, /LinkRedirect_slug_key/);
});
check('toda escritura del panel invalida la caché', () => {
    // Quien acaba de guardar espera probar el enlace en seguida.
    for (const fn of ['createRedirect', 'updateRedirect', 'setRedirectStatus', 'deleteRedirect']) {
        const i = STORE.indexOf(`export async function ${fn}`);
        const j = STORE.indexOf('\n}\n', i);
        assert.match(STORE.slice(i, j), /invalidateRedirectCache\(\)/, `${fn} no invalida la caché`);
    }
});
check('la auditoría SÓLO agrega: ni UPDATE ni DELETE sobre sus filas', () =>
    // Corregir es escribir otro evento. Un historial que se puede editar no
    // contesta «¿qué decía esto en marzo?».
    assert.doesNotMatch(STORE, /(UPDATE|DELETE FROM) "LinkRedirectAudit"/));
check('⚠️ ninguna comilla invertida dentro del SQL del esquema', () => {
    // Cierra el literal a mitad y el módulo entero deja de parsear (v4.721.1).
    const ESQ = readFileSync('server/lib/ensureLinkRedirectSchema.js', 'utf8');
    const bloques = ESQ.match(/db\.query\(`[\s\S]*?`\)/g) || [];
    for (const b of bloques) assert.equal((b.match(/`/g) || []).length, 2);
});
check('las cinco tablas están en la lista del guardián de db:push', () => {
    const GUARD = readFileSync('scripts/db-push-guard.mjs', 'utf8');
    for (const t of ['LinkRedirect', 'LinkRedirectEvent', 'LinkRedirectDaily',
        'LinkRedirectVisitor', 'LinkRedirectAudit']) {
        assert.ok(GUARD.includes(t), `falta ${t}: un db:push se la llevaría con su historial`);
    }
});
check('todo ADD COLUMN del esquema está enumerado en el atajo', () => {
    // `CREATE TABLE IF NOT EXISTS` no amplía nada: con el atajo mirando sólo
    // tablas, el ALTER no correría nunca (la trampa de v4.908).
    const ESQ = readFileSync('server/lib/ensureLinkRedirectSchema.js', 'utf8');
    const cols = [...ESQ.matchAll(/ALTER TABLE "(\w+)"\s+ADD COLUMN IF NOT EXISTS "(\w+)"/g)];
    for (const [, tabla, col] of cols) {
        assert.ok(
            new RegExp(`\\['${tabla}',\\s*'${col}'\\]`).test(ESQ),
            `${tabla}.${col} no está en EXPECTED_COLUMNS`
        );
    }
});

const CTRL2 = readFileSync('server/controllers/linkRedirectController.js', 'utf8');
check('⚠️ el sitio sale del TOKEN, no del cuerpo de la petición', () => {
    // Si viniera en el body, acotar las redirecciones a un sitio no serviría
    // de nada.
    assert.doesNotMatch(CTRL2, /req\.body[?.]*\.clubId/);
    assert.match(CTRL2, /req\.user\?\.clubId/);
});
check('eliminar exige confirmación explícita (428)', () =>
    assert.match(CTRL2, /428/));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
