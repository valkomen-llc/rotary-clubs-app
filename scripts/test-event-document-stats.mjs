#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Estadísticas de descarga de los documentos de un evento — pruebas — v4.1279.0
//
// Sin Postgres, sin S3 y sin red: el CRITERIO (qué se puede descargar, qué
// cuenta, qué es repetición, períodos), el ALMACÉN contra una base en memoria
// que reproduce la semántica de cada sentencia (y se mira cuántas sentencias
// corren y qué NO viaja en ellas), el CONTROLADOR con peticiones simuladas
// (404 de lo no publicado, 302 de lo publicado, bots que no cuentan, tope de
// solicitudes, permisos del panel) y la PÁGINA (el botón apunta a la
// plataforma, la vista previa al archivo).
//
//   npm run test:event-documents
//
// Lo que NO demuestra: que el SQL sea válido para Postgres. Eso lo hace
// `npm run test:event-documents:e2e` con una base LOCAL.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

const HERE = new URL('..', import.meta.url);
const STUB = new URL('./scripts/fixtures/db-event-documents-stub.mjs', HERE).href;
register(
    `data:text/javascript,export async function resolve(s,c,n){return (s==='./db.js'||s.endsWith('/lib/db.js'))?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    import.meta.url,
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prueba-local';

const stub = await import(STUB);
const C = await import('../server/lib/eventDocumentStats.js');
const S = await import('../server/lib/eventDocumentStore.js');
const K = await import('../server/controllers/eventDocumentController.js');

let ok = 0; const malos = [];
const check = (n, fn) => {
    try { fn(); ok++; console.log(`  ✓ ${n}`); }
    catch (e) { malos.push(n); console.log(`  ✗ ${n} — ${e.message}`); }
};
const acheck = async (n, fn) => {
    try { await fn(); ok++; console.log(`  ✓ ${n}`); }
    catch (e) { malos.push(n); console.log(`  ✗ ${n} — ${e.message}`); }
};
const grupo = t => console.log(`\n${t}`);
const src = (p) => readFileSync(new URL(p, HERE), 'utf8');

const AHORA = new Date('2026-11-04T15:00:00Z');
const S3 = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/';
const URL_V1 = `${S3}events/hotels/evt-villavo/docs/aaa/boletin-1.pdf`;
const URL_V2 = `${S3}events/hotels/evt-villavo/docs/bbb/boletin-2.pdf`;
const hotels = (extra = {}) => ({
    enabled: true, title: 'Hoteles', description: '', showThumbnails: true, allowDownload: true,
    slides: [{ id: 'hs-1', imageUrl: `${S3}events/hotels/evt-villavo/slides/1.webp`, altText: '', enabled: true }],
    document: { url: URL_V1, fileName: 'Boletín 1 - XIII Conferencia.pdf', sizeBytes: 2_700_000, uploadedAt: '2026-11-04T09:37:00Z' },
    ratesUpdatedOn: '',
    ...extra,
});
const evento = (extra = {}) => ({
    id: 'evt-villavo', slug: 'villavicencio2027', title: 'XIII Conferencia', clubId: 'club-4281',
    startDate: '2027-05-28T14:00:00Z', endDate: null, location: 'Villavicencio',
    metadata: { hotels: hotels() }, ...extra,
});

// ── 1. El criterio ──────────────────────────────────────────────────
grupo('1. Qué se puede descargar públicamente');
check('publicado, descarga permitida y archivo → ok con el documento vigente', () => {
    const v = C.resolvePublicDownload(evento());
    assert.equal(v.ok, true); assert.equal(v.document.url, URL_V1);
});
check('un borrador «no existe» (404)', () => {
    const v = C.resolvePublicDownload(evento({ metadata: { status: 'draft', hotels: hotels() } }));
    assert.equal(v.ok, false); assert.equal(v.status, 404); assert.equal(v.code, 'not_found');
});
check('descarga desactivada → 404 aunque haya archivo', () => {
    const v = C.resolvePublicDownload(evento({ metadata: { hotels: hotels({ allowDownload: false }) } }));
    assert.equal(v.ok, false); assert.equal(v.code, 'not_available');
});
check('sección apagada → 404', () => {
    assert.equal(C.resolvePublicDownload(evento({ metadata: { hotels: hotels({ enabled: false }) } })).ok, false);
});
check('sin archivo → 404; sin diapositivas → 404 (la sección no existe)', () => {
    assert.equal(C.resolvePublicDownload(evento({ metadata: { hotels: hotels({ document: null }) } })).ok, false);
    assert.equal(C.resolvePublicDownload(evento({ metadata: { hotels: hotels({ slides: [] }) } })).ok, false);
});
check('evento inexistente o recurso desconocido → 404', () => {
    assert.equal(C.resolvePublicDownload(null).status, 404);
    assert.equal(C.resolvePublicDownload(evento(), 'boletin').ok, false);
});

grupo('2. La dirección del botón y la solicitud');
check('el botón apunta a la plataforma, con el origen', () => {
    assert.equal(C.hotelsGuideDownloadPath('evt-villavo'), '/calendar/events/evt-villavo/hotels/document/download?from=section');
    assert.equal(C.hotelsGuideDownloadPath('evt-villavo', 'lightbox').endsWith('from=lightbox'), true);
    assert.equal(C.hotelsGuideDownloadPath('a b').includes('a%20b'), true);
});
check('un origen desconocido cae en «section»', () => {
    assert.equal(C.normalizeDownloadSource('otro'), 'section');
    assert.equal(C.normalizeDownloadSource('LIGHTBOX'), 'lightbox');
});
check('una vista previa de WhatsApp es un bot; un teléfono real no', () => {
    const bot = C.describeDownloadRequest({ headers: {}, userAgent: 'WhatsApp/2.23.20.0 A', ip: '1.1.1.1', clubId: 'club-4281' });
    const humano = C.describeDownloadRequest({ headers: {}, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', ip: '1.1.1.1', clubId: 'club-4281', source: 'lightbox' });
    assert.equal(bot.isBot, true);
    assert.equal(humano.isBot, false); assert.equal(humano.device, 'movil'); assert.equal(humano.source, 'lightbox');
    assert.equal(humano.identifiable, true);
});
check('una precarga del navegador (Sec-Purpose: prefetch) no es una descarga', () => {
    const r = C.describeDownloadRequest({ headers: { 'sec-purpose': 'prefetch' }, userAgent: 'Mozilla/5.0 Chrome/120', ip: '1.1.1.1' });
    assert.equal(r.isBot, true);
});
check('el tope por dirección: por encima del máximo, se marca; la ventana pasa y se libera', () => {
    const t = C.createRequestThrottle({ windowMs: 1000, max: 2 });
    assert.deepEqual([t('a', 0), t('a', 1), t('a', 2), t('b', 2), t('a', 1500)], [false, false, true, false, false]);
});

grupo('3. Períodos');
check('los fijos: hoy, 7, 30, todo; lo desconocido cae en 30', () => {
    assert.equal(C.resolveRange({ period: 'hoy' }, AHORA).days, 1);
    assert.equal(C.resolveRange({ period: 'd7' }, AHORA).days, 7);
    assert.equal(C.resolveRange({ period: 'todo' }, AHORA).fromDay, null);
    assert.equal(C.resolveRange({ period: 'xx' }, AHORA).period, 'd30');
});
check('el día se corta en Bogotá: las 03:30 UTC del 4 son todavía el 3', () => {
    assert.equal(C.resolveRange({ period: 'hoy' }, new Date('2026-11-04T03:30:00Z')).toDay, '2026-11-03');
});
check('rango propio válido', () => {
    const r = C.resolveRange({ period: 'custom', from: '2026-10-01', to: '2026-10-31' }, AHORA);
    assert.equal(r.custom, true); assert.equal(r.fromDay, '2026-10-01'); assert.equal(r.toDay, '2026-10-31'); assert.equal(r.days, 31);
});
check('rango propio: «hasta» futuro se recorta a hoy; invertido se corrige; inválido cae a 30 días', () => {
    assert.equal(C.customRange('2026-11-01', '2027-01-01', AHORA).toDay, '2026-11-04');
    const inv = C.customRange('2026-11-03', '2026-11-01', AHORA);
    assert.equal(inv.fromDay, '2026-11-01'); assert.equal(inv.toDay, '2026-11-01');
    assert.equal(C.customRange('ayer', '', AHORA), null);
    assert.equal(C.resolveRange({ period: 'custom', from: 'ayer' }, AHORA).period, 'd30');
});
check(`rango propio: nunca más de ${C.MAX_RANGE_DAYS} días`, () => {
    const r = C.customRange('2020-01-01', '2026-11-04', AHORA);
    assert.equal(r.days, C.MAX_RANGE_DAYS);
});
check('un día sin descargas se rellena en cero (el gráfico no une puntos lejanos)', () => {
    const f = C.fillDownloadDays([{ day: '2026-11-02', downloads: '3', uniques: 1 }], { fromDay: '2026-11-01', toDay: '2026-11-03' });
    assert.deepEqual(f.map(d => d.downloads), [0, 3, 0]);
    assert.equal(C.fillDownloadDays([{ day: '2026-01-01', downloads: 2 }], { fromDay: null }).length, 1);
});
check('estado del documento y rótulo de la cifra', () => {
    assert.equal(C.documentState({ hasRow: false, currentDocument: null }), 'none');
    assert.equal(C.documentState({ hasRow: true, currentDocument: null }), 'archived');
    assert.equal(C.documentState({ hasRow: false, currentDocument: { url: 'x' } }), 'current');
    assert.equal(C.downloadsLabel(0), 'Sin descargas todavía');
    assert.equal(C.downloadsLabel(1), '1 descarga');
    assert.equal(C.downloadsLabel(128), '128 descargas');
});

// ── 2. El almacén ───────────────────────────────────────────────────
grupo('4. Registrar descargas (base en memoria)');
stub.reset();
const ev = evento();
stub.DATA.events.push(ev);
const human = (ip, extra = {}) => C.describeDownloadRequest({
    headers: {}, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', ip, clubId: ev.clubId, ...extra,
});
let doc;
await acheck('la primera vez se crea el documento lógico y la versión 1 (vigente)', async () => {
    doc = await S.ensureDocumentVersion({ event: ev, document: ev.metadata.hotels.document, now: AHORA });
    assert.ok(doc.documentId && doc.versionId);
    assert.equal(stub.DATA.documents.length, 1);
    assert.equal(stub.DATA.versions.length, 1);
    assert.equal(stub.DATA.documents[0].currentVersionId, doc.versionId);
    assert.equal(stub.DATA.documents[0].clubId, 'club-4281');
});
await acheck('volver a sincronizar la misma URL no crea nada', async () => {
    stub.clearLog();
    const again = await S.ensureDocumentVersion({ event: ev, document: ev.metadata.hotels.document, now: AHORA });
    assert.equal(again.versionId, doc.versionId);
    assert.equal(stub.DATA.versions.length, 1);
    assert.equal(stub.SQL_LOG.filter(q => q.sql.startsWith('WITH d AS')).length, 1, 'una sentencia');
    assert.equal(stub.SQL_LOG.some(q => q.sql.startsWith('UPDATE "EventDocument" SET "currentVersionId"')), false, 'sin segunda sentencia si no cambió');
});
await acheck('⚠️ una descarga humana se registra en UNA sentencia y suma al documento, la versión y el día', async () => {
    stub.clearLog();
    const r = await S.recordDownload({ doc, event: ev, hit: human('10.0.0.1'), now: AHORA });
    assert.equal(r.counted, true); assert.equal(r.newVisitor, true);
    assert.equal(stub.SQL_LOG.length, 1);
    const d = stub.DATA.documents[0];
    assert.equal(d.totalDownloads, 1); assert.equal(d.uniqueVisitors, 1);
    assert.equal(stub.DATA.versions[0].downloads, 1);
    assert.equal(stub.DATA.daily[0].downloads, 1); assert.equal(stub.DATA.daily[0].uniques, 1);
    assert.equal(stub.DATA.downloads.length, 1);
});
await acheck('⚠️ la IP y el user-agent completo NO viajan a la base', async () => {
    const q = stub.SQL_LOG[0];
    const params = q.params.map(String).join(' ');
    assert.equal(params.includes('10.0.0.1'), false, 'la IP no es parámetro');
    assert.equal(params.includes('Mozilla'), false, 'el user-agent no es parámetro');
    assert.equal(q.sql.includes('"userAgent"'), false);
});
await acheck(`una segunda solicitud del mismo visitante dentro de ${C.REPEAT_WINDOW_SEC} s es REPETICIÓN: no suma`, async () => {
    const r = await S.recordDownload({ doc, event: ev, hit: human('10.0.0.1'), now: new Date(AHORA.getTime() + 5000) });
    assert.equal(r.counted, false); assert.equal(r.repeat, true);
    assert.equal(stub.DATA.documents[0].totalDownloads, 1);
    assert.equal(stub.DATA.documents[0].repeatHits, 1);
    assert.equal(stub.DATA.daily[0].repeats, 1);
    assert.equal(stub.DATA.downloads.length, 1);
});
await acheck('pasada la ventana, el mismo visitante vuelve a contar (pero no como nuevo)', async () => {
    const r = await S.recordDownload({ doc, event: ev, hit: human('10.0.0.1'), now: new Date(AHORA.getTime() + 120_000) });
    assert.equal(r.counted, true); assert.equal(r.newVisitor, false);
    assert.equal(stub.DATA.documents[0].totalDownloads, 2);
    assert.equal(stub.DATA.documents[0].uniqueVisitors, 1);
});
await acheck('otro visitante: suma descarga y visitante', async () => {
    await S.recordDownload({ doc, event: ev, hit: human('10.0.0.2', { source: 'lightbox' }), now: AHORA });
    assert.equal(stub.DATA.documents[0].totalDownloads, 3);
    assert.equal(stub.DATA.documents[0].uniqueVisitors, 2);
    assert.equal(stub.DATA.downloads.filter(x => x.source === 'lightbox').length, 1);
});
await acheck('⚠️ un bot deja sólo su contador: ni fila, ni visitante, ni descarga', async () => {
    stub.clearLog();
    const bot = C.describeDownloadRequest({ headers: {}, userAgent: 'facebookexternalhit/1.1', ip: '2.2.2.2', clubId: ev.clubId });
    const r = await S.recordDownload({ doc, event: ev, hit: bot, now: AHORA });
    assert.equal(r.counted, false); assert.equal(r.bot, true);
    assert.equal(stub.SQL_LOG.length, 1);
    assert.equal(stub.DATA.documents[0].totalDownloads, 3);
    assert.equal(stub.DATA.documents[0].botHits, 1);
    assert.equal(stub.DATA.downloads.length, 3);
});
await acheck('un visitante sin identificar cuenta la descarga pero no como visitante', async () => {
    const anon = C.describeDownloadRequest({ headers: {}, userAgent: '', ip: '', clubId: ev.clubId });
    // Sin user-agent es «herramienta» (bot): se fuerza el caso de visitante no identificable.
    const r = await S.recordDownload({ doc, event: ev, hit: { ...anon, isBot: false, identifiable: false }, now: AHORA });
    assert.equal(r.counted, true); assert.equal(r.newVisitor, false);
    assert.equal(stub.DATA.documents[0].totalDownloads, 4);
    assert.equal(stub.DATA.documents[0].uniqueVisitors, 2);
});
await acheck('⚠️ veinte solicitudes simultáneas de visitantes distintos no pierden ninguna', async () => {
    const antes = stub.DATA.documents[0].totalDownloads;
    await Promise.all(Array.from({ length: 20 }, (_, i) => S.recordDownload({ doc, event: ev, hit: human(`10.1.0.${i}`), now: AHORA })));
    assert.equal(stub.DATA.documents[0].totalDownloads, antes + 20);
});
await acheck('un fallo de la base no lanza y la descarga NO se cuenta', async () => {
    stub.setFail(true);
    const r = await S.recordDownload({ doc, event: ev, hit: human('9.9.9.9'), now: AHORA });
    stub.setFail(false);
    assert.equal(r.ok, false); assert.equal(r.counted, undefined);
});

grupo('5. Reemplazar, quitar y reactivar conservan el histórico');
let docV2;
await acheck('reemplazar el PDF crea la versión 2 y la deja vigente; la 1 y sus descargas siguen', async () => {
    const total = stub.DATA.documents[0].totalDownloads;
    ev.metadata.hotels.document = { url: URL_V2, fileName: 'Boletín 2.pdf', sizeBytes: 3_000_000 };
    stub.clearLog();
    docV2 = await S.ensureDocumentVersion({ event: ev, document: ev.metadata.hotels.document, now: AHORA });
    assert.equal(docV2.documentId, doc.documentId, 'mismo documento lógico');
    assert.notEqual(docV2.versionId, doc.versionId);
    assert.equal(stub.DATA.versions.length, 2);
    assert.equal(stub.DATA.versions[1].versionNumber, 2);
    assert.equal(stub.DATA.documents[0].currentVersionId, docV2.versionId);
    assert.equal(stub.DATA.documents[0].totalDownloads, total, 'el histórico no se toca');
    assert.equal(stub.DATA.versions[0].downloads, 24, 'las descargas de la v1 se conservan');
    assert.equal(stub.SQL_LOG.some(q => q.sql.startsWith('UPDATE "EventDocument" SET "currentVersionId"')), true);
});
await acheck('una descarga de la v2 suma al histórico y a la v2, no a la v1', async () => {
    await S.recordDownload({ doc: docV2, event: ev, hit: human('10.2.0.1'), now: AHORA });
    assert.equal(stub.DATA.versions[1].downloads, 1);
    assert.equal(stub.DATA.versions[0].downloads, 24);
    assert.equal(stub.DATA.documents[0].totalDownloads, 25);
});
await acheck('el resumen del panel: total histórico + versión vigente', async () => {
    const s = await S.summaryFor({ event: ev, currentDocument: ev.metadata.hotels.document, now: AHORA });
    assert.equal(s.state, 'current');
    assert.equal(s.totalDownloads, 25);
    assert.equal(s.current.downloads, 1);
    assert.equal(s.current.versionNumber, 2);
});
await acheck('quitar el archivo: estado «archived», el histórico se conserva, sin versión vigente', async () => {
    const s = await S.summaryFor({ event: ev, currentDocument: null, now: AHORA });
    assert.equal(s.state, 'archived');
    assert.equal(s.totalDownloads, 25);
    assert.equal(s.current, null);
});
await acheck('un evento sin nada registrado y sin archivo: «none» (sin inventar historial)', async () => {
    const s = await S.summaryFor({ event: { id: 'evt-nuevo', clubId: 'club-4281' }, currentDocument: null, now: AHORA });
    assert.equal(s.state, 'none'); assert.equal(s.totalDownloads, 0);
});
await acheck('⚠️ un archivo recién guardado aparece con 0 descargas (versión creada), no con «sin datos»', async () => {
    const s = await S.summaryFor({ event: { id: 'evt-nuevo', clubId: 'club-4281' }, currentDocument: { url: `${S3}events/hotels/evt-nuevo/docs/x/g.pdf`, fileName: 'g.pdf' }, now: AHORA });
    assert.equal(s.state, 'current'); assert.equal(s.totalDownloads, 0); assert.equal(s.current.downloads, 0);
});
await acheck('⚠️ las estadísticas de un evento no se mezclan con las de otro', async () => {
    const otro = { id: 'evt-otro', clubId: 'club-4281', metadata: { hotels: hotels({ document: { url: `${S3}events/hotels/evt-otro/docs/y/g.pdf`, fileName: 'g.pdf' } }) } };
    const d2 = await S.ensureDocumentVersion({ event: otro, document: otro.metadata.hotels.document, now: AHORA });
    await S.recordDownload({ doc: d2, event: otro, hit: human('10.3.0.1'), now: AHORA });
    const a = await S.summaryFor({ event: ev, currentDocument: ev.metadata.hotels.document, now: AHORA });
    const b = await S.summaryFor({ event: otro, currentDocument: otro.metadata.hotels.document, now: AHORA });
    assert.equal(a.totalDownloads, 25); assert.equal(b.totalDownloads, 1);
});

grupo('6. Las estadísticas completas y sus filtros');
await acheck('cabecera, serie rellenada, versiones y desgloses', async () => {
    const s = await S.statsFor({ event: ev, currentDocument: ev.metadata.hotels.document, period: 'd7', now: AHORA });
    assert.equal(s.state, 'current');
    assert.equal(s.totals.all, 25);
    assert.equal(s.totals.today, 25);
    assert.equal(s.totals.last7, 25);
    assert.equal(s.totals.currentVersion, 1);
    assert.equal(s.totals.repeats, 1);
    assert.equal(s.totals.bots, 1);
    assert.equal(s.series.length, 7, 'siete días, los vacíos en cero');
    assert.equal(s.series[6].downloads, 25);
    assert.equal(s.versions.length, 2);
    assert.equal(s.versions[0].current, true, 'la vigente primero');
    assert.equal(s.breakdown.sources.find(x => x.key === 'lightbox').value, 1);
    assert.equal(s.recent.length, 20);
    assert.ok(s.totals.periodUniques >= 20);
});
await acheck('«hoy» y «todo el historial»', async () => {
    const hoy = await S.statsFor({ event: ev, currentDocument: ev.metadata.hotels.document, period: 'hoy', now: AHORA });
    assert.equal(hoy.series.length, 1); assert.equal(hoy.series[0].downloads, 25);
    const todo = await S.statsFor({ event: ev, currentDocument: ev.metadata.hotels.document, period: 'todo', now: AHORA });
    assert.equal(todo.period.fromDay, null); assert.equal(todo.series.length, 1);
});
await acheck('un rango personalizado que no incluye hoy devuelve ceros, no inventa', async () => {
    const s = await S.statsFor({ event: ev, currentDocument: ev.metadata.hotels.document, period: 'custom', from: '2026-10-01', to: '2026-10-07', now: AHORA });
    assert.equal(s.period.custom, true);
    assert.equal(s.series.length, 7);
    assert.equal(s.series.reduce((a, d) => a + d.downloads, 0), 0);
    assert.equal(s.totals.periodDownloads, 0);
    assert.equal(s.recent.length, 0);
    assert.equal(s.totals.all, 25, 'el total histórico no depende del filtro');
});
await acheck('sin fila en la base: «none», sin totales', async () => {
    const s = await S.statsFor({ event: { id: 'evt-vacio', clubId: 'club-4281' }, currentDocument: null, now: AHORA });
    assert.equal(s.state, 'none'); assert.equal(s.totals, null); assert.equal(s.versions.length, 0);
});

// ── 3. El controlador ───────────────────────────────────────────────
grupo('7. La descarga pública (controlador)');
const fakeRes = () => {
    const r = { statusCode: 200, headers: {}, body: null, redirected: null, headersSent: false };
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; r.headersSent = true; return r; };
    r.redirect = (c, u) => { r.statusCode = c; r.redirected = u; r.headersSent = true; return r; };
    return r;
};
const req = (id, { ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', ip = '5.5.5.5', from = 'section', user } = {}) => ({
    params: { id }, query: { from }, headers: { 'user-agent': ua, 'x-forwarded-for': ip }, ip, user,
});
stub.reset();
const evPub = evento();
stub.DATA.events.push(evPub);
stub.DATA.events.push(evento({ id: 'evt-borrador', slug: 'borrador', metadata: { status: 'draft', hotels: hotels() } }));
stub.DATA.events.push(evento({ id: 'evt-apagado', slug: 'apagado', metadata: { hotels: hotels({ allowDownload: false }) } }));

await acheck('⚠️ un evento publicado redirige (302) al archivo vigente, sin caché, y la solicitud queda registrada', async () => {
    const res = fakeRes();
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.0.1' }), res);
    assert.equal(res.statusCode, 302);
    assert.equal(res.redirected, URL_V1);
    assert.match(res.headers['cache-control'], /no-store/);
    assert.equal(stub.DATA.documents[0].totalDownloads, 1);
});
await acheck('también por slug', async () => {
    const res = fakeRes();
    await K.downloadHotelsGuide(req('villavicencio2027', { ip: '7.0.0.2' }), res);
    assert.equal(res.redirected, URL_V1);
    assert.equal(stub.DATA.documents[0].totalDownloads, 2);
});
await acheck('el origen «lightbox» se registra como tal', async () => {
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.0.3', from: 'lightbox' }), fakeRes());
    assert.equal(stub.DATA.downloads.at(-1).source, 'lightbox');
});
await acheck('un borrador → 404 y no se registra nada', async () => {
    const res = fakeRes();
    await K.downloadHotelsGuide(req('evt-borrador', { ip: '7.0.0.4' }), res);
    assert.equal(res.statusCode, 404);
    assert.equal(stub.DATA.documents.length, 1);
});
await acheck('⚠️ con la descarga desactivada → 404 (deshabilitar impide nuevas solicitudes públicas)', async () => {
    const res = fakeRes();
    await K.downloadHotelsGuide(req('evt-apagado', { ip: '7.0.0.5' }), res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, C.DOWNLOAD_ERRORS.not_available);
});
await acheck('desactivar y reactivar la descarga conserva el histórico', async () => {
    const antes = stub.DATA.documents[0].totalDownloads;
    evPub.metadata.hotels.allowDownload = false;
    const off = fakeRes();
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.0.6' }), off);
    assert.equal(off.statusCode, 404);
    evPub.metadata.hotels.allowDownload = true;
    const on = fakeRes();
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.0.6' }), on);
    assert.equal(on.statusCode, 302);
    assert.equal(stub.DATA.documents[0].totalDownloads, antes + 1);
});
await acheck('un evento inexistente → 404', async () => {
    const res = fakeRes();
    await K.downloadHotelsGuide(req('no-existe'), res);
    assert.equal(res.statusCode, 404);
});
await acheck('⚠️ un bot (vista previa de WhatsApp) recibe el archivo pero NO cuenta', async () => {
    const antes = stub.DATA.documents[0].totalDownloads;
    const res = fakeRes();
    await K.downloadHotelsGuide(req('evt-villavo', { ua: 'WhatsApp/2.23.20.0 A', ip: '7.0.0.7' }), res);
    assert.equal(res.statusCode, 302);
    assert.equal(stub.DATA.documents[0].totalDownloads, antes);
    assert.equal(stub.DATA.documents[0].botHits, 1);
});
await acheck('⚠️ un doble clic cuenta UNA vez', async () => {
    const antes = stub.DATA.documents[0].totalDownloads;
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.0.8' }), fakeRes());
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.0.8' }), fakeRes());
    assert.equal(stub.DATA.documents[0].totalDownloads, antes + 1);
    assert.equal(stub.DATA.documents[0].repeatHits, 1);
});
await acheck(`⚠️ por encima de ${C.THROTTLE.max} solicitudes por minuto desde una dirección se entrega igual pero no se cuenta`, async () => {
    const antes = stub.DATA.documents[0].totalDownloads;
    let ultimo;
    for (let i = 0; i < C.THROTTLE.max + 5; i++) {
        ultimo = fakeRes();
        await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.0.9', ua: `Mozilla/5.0 (X11; Linux x86_64) Chrome/${100 + i}` }), ultimo);
    }
    assert.equal(ultimo.statusCode, 302, 'la descarga nunca se bloquea');
    assert.equal(stub.DATA.documents[0].totalDownloads, antes + C.THROTTLE.max);
});
await acheck('⚠️ con la base caída, la persona recibe su archivo igual y la solicitud NO se cuenta', async () => {
    const res = fakeRes();
    stub.setFail(true);
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.1.1' }), res);
    stub.setFail(false);
    // Sin base no se puede ni leer el evento: 500 honesto (no hay destino conocido).
    assert.equal(res.statusCode, 500);
    assert.equal(res.redirected, null);
});
await acheck('si la base cae DESPUÉS de resolver el destino, se redirige igual (sin contar)', async () => {
    const antes = stub.DATA.documents[0].totalDownloads;
    const original = stub.default.query;
    let n = 0;
    stub.default.query = async (...a) => { n++; if (n > 1) throw new Error('cayó'); return original(...a); };
    const res = fakeRes();
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '7.0.1.2' }), res);
    stub.default.query = original;
    assert.equal(res.statusCode, 302);
    assert.equal(stub.DATA.documents[0].totalDownloads, antes);
});

grupo('8. Las estadísticas del panel (controlador)');
const admin = { id: 'u1', role: 'district_admin', clubId: 'club-4281' };
await acheck('un administrador del sitio lee el resumen y las estadísticas', async () => {
    const r1 = fakeRes();
    await K.hotelsGuideSummary(req('evt-villavo', { user: admin }), r1);
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.body.state, 'current');
    assert.ok(r1.body.totalDownloads > 0);
    assert.equal(r1.body.publicDownload, true);
    const r2 = fakeRes();
    await K.hotelsGuideStats({ ...req('evt-villavo', { user: admin }), query: { period: 'd30' } }, r2);
    assert.equal(r2.statusCode, 200);
    assert.equal(r2.body.series.length, 30);
    assert.equal(r2.body.totals.all, r1.body.totalDownloads);
});
await acheck('⚠️ un evento de otro sitio «no existe» para el panel (404)', async () => {
    const res = fakeRes();
    await K.hotelsGuideSummary(req('evt-villavo', { user: { id: 'u2', role: 'district_admin', clubId: 'club-otro' } }), res);
    assert.equal(res.statusCode, 404);
});
await acheck('⚠️ una sesión sin rol de administración → 403', async () => {
    const res = fakeRes();
    await K.hotelsGuideStats({ ...req('evt-villavo', { user: { id: 'u3', role: 'member', clubId: 'club-4281' } }), query: {} }, res);
    assert.equal(res.statusCode, 403);
});
await acheck('sin sesión no hay lectura: el controlador exige usuario (la ruta lleva authMiddleware)', async () => {
    const res = fakeRes();
    await K.hotelsGuideSummary(req('evt-villavo'), res);
    assert.notEqual(res.statusCode, 200);
    const rutas = src('server/routes/calendar.js');
    assert.match(rutas, /hotels\/document\/summary', authMiddleware, hotelsGuideSummary/);
    assert.match(rutas, /hotels\/document\/stats', authMiddleware, hotelsGuideStats/);
    assert.match(rutas, /hotels\/document\/download', downloadHotelsGuide\)/, 'la descarga es pública');
});
await acheck('el resumen con la descarga apagada lo dice (publicDownload: false) y conserva la cifra', async () => {
    evPub.metadata.hotels.allowDownload = false;
    const res = fakeRes();
    await K.hotelsGuideSummary(req('evt-villavo', { user: admin }), res);
    evPub.metadata.hotels.allowDownload = true;
    assert.equal(res.body.publicDownload, false);
    assert.ok(res.body.totalDownloads > 0);
});

// ── 4. La página y el panel ─────────────────────────────────────────
grupo('9. La página pública y el panel (código fuente)');
check('⚠️ el botón público apunta a la plataforma; la vista previa del panel al archivo directo', () => {
    const s = src('src/components/EventHotelsSection.tsx');
    assert.match(s, /hotelsGuideDownloadPath\(eventId as string, 'section'\)/);
    assert.match(s, /const tracked = Boolean\(eventId\) && !preview/);
    assert.match(s, /tracked \? `\$\{API\}\$\{hotelsGuideDownloadPath\(eventId as string, 'section'\)\}` : view\.download\.url/);
    assert.match(s, /downloadHref=\{tracked && view\.download \? `\$\{API\}\$\{hotelsGuideDownloadPath\(eventId as string, 'lightbox'\)\}` : undefined\}/);
});
check('la vista ampliada usa la dirección medible si la recibe', () => {
    const s = src('src/components/EventHotelsLightbox.tsx');
    assert.match(s, /href=\{downloadHref \|\| download\.url\}/);
});
check('la ficha pública pasa el id del evento; el panel previsualiza con `preview` (no cuenta)', () => {
    assert.match(src('src/pages/EventoDetalle.tsx'), /<EventHotelsSection[\s\S]*?eventId=\{event\.id\}/);
    assert.match(src('src/components/admin/events/EventHotelsEditor.tsx'), /<EventHotelsSection hotels=\{previewConfig\} eventTitle=\{eventTitle\} preview \/>/);
});
check('⚠️ la página pública no pinta contadores ni estadísticas', () => {
    const s = src('src/components/EventHotelsSection.tsx') + src('src/components/EventHotelsLightbox.tsx');
    assert.equal(/descargas registradas|Ver estadísticas|totalDownloads|fetchDocument/i.test(s), false);
});
check('el panel muestra la cifra real y «Ver estadísticas», y dice «Sin datos» cuando no hay', () => {
    const s = src('src/components/admin/events/EventHotelsEditor.tsx');
    assert.match(s, /downloadsLabel\(docStats\.totalDownloads\)/);
    assert.match(s, /Ver estadísticas/);
    assert.match(s, /Sin datos registrados todavía/);
    assert.match(s, /EventDocumentStatsModal/);
    assert.equal(/\b128 descargas\b/.test(s), false, 'ninguna cifra ilustrativa en el código');
});
check('el panel de estadísticas ofrece hoy, 7, 30, todo y rango propio', () => {
    const s = src('src/components/admin/events/EventDocumentStatsModal.tsx');
    assert.match(s, /PERIOD_OPTIONS/);
    assert.match(s, /type="date"/);
    assert.deepEqual(Object.keys(C.PERIOD_OPTIONS), ['hoy', 'd7', 'd30', 'todo', 'custom']);
});
check('⚠️ las cinco tablas están en la lista del guardián de db:push', () => {
    const g = src('scripts/db-push-guard.mjs');
    for (const t of ['EventDocument', 'EventDocumentVersion', 'EventDocumentDownload', 'EventDocumentDaily', 'EventDocumentVisitor']) {
        assert.ok(new RegExp(`\\b${t}\\b`).test(g), `${t} protegida`);
    }
});

console.log(`\n${ok} comprobaciones en verde${malos.length ? `, ${malos.length} en rojo:\n  - ${malos.join('\n  - ')}` : '.'}`);
process.exit(malos.length ? 1 : 0);
