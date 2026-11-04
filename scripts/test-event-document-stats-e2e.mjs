#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Estadísticas de descarga de los documentos de un evento — de EXTREMO A EXTREMO — v4.1279.0
// EVENT_DOCS_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:event-documents:e2e
//
// Postgres REAL: lo único que la prueba sin base no puede afirmar es que las
// sentencias (CTEs con UPSERT, ventana de repetición, agregados) sean válidas
// y hagan lo que dicen. Acá se crean las cinco tablas desde cero con el
// `ensure`, se registran descargas (humanas, repetidas, simultáneas, bots),
// se reemplaza el archivo, se leen el resumen y las estadísticas con todos
// los períodos, y se pasa por el controlador público y el del panel.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige una base LOCAL y desechable.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const E2E_DB = process.env.EVENT_DOCS_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:event-documents:e2e] Sin EVENT_DOCS_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
process.env.DATABASE_URL = E2E_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prueba-local';

const { default: db } = await import('../server/lib/db.js');
const C = await import('../server/lib/eventDocumentStats.js');
const S = await import('../server/lib/eventDocumentStore.js');
const K = await import('../server/controllers/eventDocumentController.js');

let ok = 0; const malos = [];
const acheck = async (n, fn) => {
    try { await fn(); ok++; console.log(`  ✓ ${n}`); }
    catch (e) { malos.push(n); console.log(`  ✗ ${n} — ${e.message}`); }
};
const grupo = t => console.log(`\n${t}`);

const S3 = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/';
const URL_V1 = `${S3}events/hotels/evt-villavo/docs/aaa/boletin-1.pdf`;
const URL_V2 = `${S3}events/hotels/evt-villavo/docs/bbb/boletin-2.pdf`;
const hotels = (doc = { url: URL_V1, fileName: 'Boletín 1.pdf', sizeBytes: 2700000, uploadedAt: '2026-11-04T09:37:00Z' }, extra = {}) => ({
    enabled: true, title: 'Hoteles', description: '', showThumbnails: true, allowDownload: true,
    slides: [{ id: 'hs-1', imageUrl: `${S3}events/hotels/evt-villavo/slides/1.webp`, altText: '', enabled: true }],
    document: doc, ratesUpdatedOn: '', ...extra,
});

// ── Base desechable: tablas desde cero ──
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (
    id TEXT PRIMARY KEY, title TEXT, description TEXT, "htmlContent" TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ,
    location TEXT, type TEXT DEFAULT 'meeting', image TEXT, images TEXT[] DEFAULT '{}', metadata JSONB DEFAULT '{}', slug TEXT,
    "clubId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`DELETE FROM "CalendarEvent" WHERE id IN ('evt-villavo','evt-otro','evt-borrador')`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "startDate", "clubId", metadata) VALUES
    ('evt-villavo','XIII Conferencia','villavicencio2027','2027-05-28T14:00:00Z','club-4281',$1),
    ('evt-otro','Instituto Rotary','instituto','2027-09-01T14:00:00Z','club-4281',$2),
    ('evt-borrador','Borrador','borrador','2027-09-01T14:00:00Z','club-4281',$3)`,
    [JSON.stringify({ hotels: hotels() }), JSON.stringify({ hotels: hotels({ url: `${S3}events/hotels/evt-otro/docs/x/g.pdf`, fileName: 'g.pdf' }) }), JSON.stringify({ status: 'draft', hotels: hotels() })]);
await db.query(`DROP TABLE IF EXISTS "EventDocument", "EventDocumentVersion", "EventDocumentDownload", "EventDocumentDaily", "EventDocumentVisitor"`);

const loadEvent = async (id) => (await db.query(`SELECT id, slug, title, "startDate", "endDate", location, "clubId", metadata FROM "CalendarEvent" WHERE id = $1`, [id])).rows[0];
const AHORA = new Date('2026-11-04T15:00:00Z');
const human = (ip, extra = {}) => C.describeDownloadRequest({ headers: {}, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', ip, clubId: 'club-4281', ...extra });
const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n);

grupo('1. Esquema y versión');
let ev = await loadEvent('evt-villavo');
let doc;
await acheck('el ensure crea las cinco tablas desde cero', async () => {
    doc = await S.ensureDocumentVersion({ event: ev, document: ev.metadata.hotels.document, now: AHORA });
    const { rows } = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE 'EventDocument%' ORDER BY 1`);
    assert.deepEqual(rows.map(r => r.table_name), ['EventDocument', 'EventDocumentDaily', 'EventDocumentDownload', 'EventDocumentVersion', 'EventDocumentVisitor']);
    assert.ok(doc?.documentId && doc?.versionId);
});
await acheck('la versión 1 queda vigente; volver a sincronizar no duplica', async () => {
    const again = await S.ensureDocumentVersion({ event: ev, document: ev.metadata.hotels.document, now: AHORA });
    assert.equal(again.versionId, doc.versionId);
    assert.equal(await count(`SELECT COUNT(*)::int AS n FROM "EventDocumentVersion"`), 1);
    const { rows } = await db.query(`SELECT "currentVersionId", "clubId", title FROM "EventDocument" WHERE id = $1`, [doc.documentId]);
    assert.equal(rows[0].currentVersionId, doc.versionId);
    assert.equal(rows[0].clubId, 'club-4281');
    assert.equal(rows[0].title, 'Boletín 1.pdf');
});

grupo('2. Registrar');
await acheck('una descarga humana: fila, visitante, día, versión y documento', async () => {
    const r = await S.recordDownload({ doc, event: ev, hit: human('10.0.0.1'), now: AHORA });
    assert.equal(r.ok, true, r.reason); assert.equal(r.counted, true); assert.equal(r.newVisitor, true);
    const d = (await db.query(`SELECT * FROM "EventDocument" WHERE id = $1`, [doc.documentId])).rows[0];
    assert.equal(d.totalDownloads, 1); assert.equal(d.uniqueVisitors, 1);
    assert.equal(new Date(d.lastDownloadAt).toISOString(), AHORA.toISOString());
    assert.equal(await count(`SELECT COUNT(*)::int AS n FROM "EventDocumentDownload"`), 1);
    assert.equal(await count(`SELECT COUNT(*)::int AS n FROM "EventDocumentVisitor"`), 1);
    const dia = (await db.query(`SELECT * FROM "EventDocumentDaily"`)).rows[0];
    assert.equal(dia.downloads, 1); assert.equal(dia.uniques, 1); assert.equal(String(dia.day).slice(0, 10).length, 10);
    assert.equal((await db.query(`SELECT downloads FROM "EventDocumentVersion" WHERE id = $1`, [doc.versionId])).rows[0].downloads, 1);
});
await acheck(`⚠️ la misma persona otra vez dentro de ${C.REPEAT_WINDOW_SEC} s: repetición, no suma`, async () => {
    const r = await S.recordDownload({ doc, event: ev, hit: human('10.0.0.1'), now: new Date(AHORA.getTime() + 5000) });
    assert.equal(r.ok, true, r.reason); assert.equal(r.counted, false); assert.equal(r.repeat, true);
    const d = (await db.query(`SELECT "totalDownloads", "repeatHits" FROM "EventDocument" WHERE id = $1`, [doc.documentId])).rows[0];
    assert.equal(d.totalDownloads, 1); assert.equal(d.repeatHits, 1);
    const v = (await db.query(`SELECT downloads, "prevSeenAt", "lastSeenAt" FROM "EventDocumentVisitor"`)).rows[0];
    assert.equal(v.downloads, 1);
    assert.equal(new Date(v.prevSeenAt).toISOString(), AHORA.toISOString());
    assert.equal(await count(`SELECT COALESCE(SUM(repeats),0)::int AS n FROM "EventDocumentDaily"`), 1);
});
await acheck('pasada la ventana vuelve a contar, sin sumar visitante', async () => {
    const r = await S.recordDownload({ doc, event: ev, hit: human('10.0.0.1'), now: new Date(AHORA.getTime() + 120000) });
    assert.equal(r.counted, true); assert.equal(r.newVisitor, false);
    const d = (await db.query(`SELECT "totalDownloads", "uniqueVisitors" FROM "EventDocument" WHERE id = $1`, [doc.documentId])).rows[0];
    assert.equal(d.totalDownloads, 2); assert.equal(d.uniqueVisitors, 1);
    assert.equal((await db.query(`SELECT downloads FROM "EventDocumentVisitor"`)).rows[0].downloads, 2);
});
await acheck('un bot sólo suma a bots (día y documento)', async () => {
    const bot = C.describeDownloadRequest({ headers: {}, userAgent: 'WhatsApp/2.23 A', ip: '3.3.3.3', clubId: 'club-4281' });
    const r = await S.recordDownload({ doc, event: ev, hit: bot, now: AHORA });
    assert.equal(r.ok, true, r.reason); assert.equal(r.bot, true);
    const d = (await db.query(`SELECT "totalDownloads", "botHits" FROM "EventDocument" WHERE id = $1`, [doc.documentId])).rows[0];
    assert.equal(d.totalDownloads, 2); assert.equal(d.botHits, 1);
    assert.equal(await count(`SELECT COALESCE(SUM(bots),0)::int AS n FROM "EventDocumentDaily"`), 1);
});
await acheck('un visitante no identificable cuenta la descarga y no el visitante', async () => {
    const anon = { ...human('1.1.1.1'), identifiable: false, seed: '' };
    const r = await S.recordDownload({ doc, event: ev, hit: anon, now: AHORA });
    assert.equal(r.ok, true, r.reason); assert.equal(r.counted, true); assert.equal(r.newVisitor, false);
    const d = (await db.query(`SELECT "totalDownloads", "uniqueVisitors" FROM "EventDocument" WHERE id = $1`, [doc.documentId])).rows[0];
    assert.equal(d.totalDownloads, 3); assert.equal(d.uniqueVisitors, 1);
    assert.equal(await count(`SELECT COUNT(*)::int AS n FROM "EventDocumentDownload" WHERE "visitorKey" = ''`), 1);
});
await acheck('⚠️ 30 solicitudes SIMULTÁNEAS (20 visitantes distintos + 10 del mismo) no pierden ni duplican', async () => {
    const antes = (await db.query(`SELECT "totalDownloads", "uniqueVisitors" FROM "EventDocument" WHERE id = $1`, [doc.documentId])).rows[0];
    const t = new Date(AHORA.getTime() + 600000);
    const rs = await Promise.all([
        ...Array.from({ length: 20 }, (_, i) => S.recordDownload({ doc, event: ev, hit: human(`10.1.0.${i}`), now: t })),
        ...Array.from({ length: 10 }, () => S.recordDownload({ doc, event: ev, hit: human('10.9.9.9'), now: t })),
    ]);
    assert.ok(rs.every(r => r.ok), rs.find(r => !r.ok)?.reason);
    const d = (await db.query(`SELECT "totalDownloads", "uniqueVisitors", "repeatHits" FROM "EventDocument" WHERE id = $1`, [doc.documentId])).rows[0];
    assert.equal(d.totalDownloads, antes.totalDownloads + 21, 'el mismo visitante diez veces a la vez cuenta UNA');
    assert.equal(d.uniqueVisitors, antes.uniqueVisitors + 21);
    assert.equal(rs.filter(r => r.repeat).length, 9);
});

grupo('3. Reemplazo y lecturas');
let docV2;
await acheck('reemplazar crea la v2 vigente y conserva la v1 con sus descargas', async () => {
    await db.query(`UPDATE "CalendarEvent" SET metadata = $2 WHERE id = $1`, ['evt-villavo', JSON.stringify({ hotels: hotels({ url: URL_V2, fileName: 'Boletín 2.pdf', sizeBytes: 3000000 }) })]);
    ev = await loadEvent('evt-villavo');
    docV2 = await S.ensureDocumentVersion({ event: ev, document: ev.metadata.hotels.document, now: AHORA });
    assert.equal(docV2.documentId, doc.documentId);
    const vs = (await db.query(`SELECT "versionNumber", downloads FROM "EventDocumentVersion" WHERE "documentId" = $1 ORDER BY "versionNumber"`, [doc.documentId])).rows;
    assert.deepEqual(vs.map(v => v.versionNumber), [1, 2]);
    assert.equal(vs[0].downloads, 24);
    const d = (await db.query(`SELECT "currentVersionId", "totalDownloads" FROM "EventDocument" WHERE id = $1`, [doc.documentId])).rows[0];
    assert.equal(d.currentVersionId, docV2.versionId); assert.equal(d.totalDownloads, 24);
    await S.recordDownload({ doc: docV2, event: ev, hit: human('10.2.0.1'), now: AHORA });
});
await acheck('resumen: histórico 25, versión vigente 1', async () => {
    const s = await S.summaryFor({ event: ev, currentDocument: ev.metadata.hotels.document, now: AHORA });
    assert.equal(s.state, 'current'); assert.equal(s.totalDownloads, 25); assert.equal(s.current.downloads, 1); assert.equal(s.current.versionNumber, 2);
});
await acheck('estadísticas: cabecera, serie, versiones, desgloses, recientes, únicos del período', async () => {
    const s = await S.statsFor({ event: ev, currentDocument: ev.metadata.hotels.document, period: 'd7', now: AHORA });
    assert.equal(s.totals.all, 25); assert.equal(s.totals.today, 25); assert.equal(s.totals.last7, 25); assert.equal(s.totals.last30, 25);
    assert.equal(s.totals.currentVersion, 1); assert.equal(s.totals.bots, 1); assert.equal(s.totals.repeats, 10);
    assert.equal(s.series.length, 7); assert.equal(s.series[6].downloads, 25); assert.equal(s.series[0].downloads, 0);
    assert.equal(s.versions[0].current, true); assert.equal(s.versions[0].versionNumber, 2);
    assert.equal(s.breakdown.sources[0].key, 'section');
    assert.equal(s.breakdown.devices[0].key, 'desktop');
    assert.equal(s.recent.length, 20);
    assert.equal(s.totals.periodDownloads, 25);
    assert.equal(s.totals.periodUniques, 23, 'visitantes distintos del período (sin el no identificable)');
});
await acheck('períodos: hoy, todo, y un rango propio fuera de fecha en cero', async () => {
    const hoy = await S.statsFor({ event: ev, currentDocument: ev.metadata.hotels.document, period: 'hoy', now: AHORA });
    assert.equal(hoy.series.length, 1); assert.equal(hoy.series[0].downloads, 25);
    const todo = await S.statsFor({ event: ev, currentDocument: ev.metadata.hotels.document, period: 'todo', now: AHORA });
    assert.equal(todo.series.length, 1); assert.equal(todo.period.fromDay, null);
    const c = await S.statsFor({ event: ev, currentDocument: ev.metadata.hotels.document, period: 'custom', from: '2026-10-01', to: '2026-10-07', now: AHORA });
    assert.equal(c.series.length, 7); assert.equal(c.totals.periodDownloads, 0); assert.equal(c.recent.length, 0); assert.equal(c.totals.all, 25);
});
await acheck('el día se corta en Bogotá: una descarga a las 03:30Z del 5 cae en el 4', async () => {
    await S.recordDownload({ doc: docV2, event: ev, hit: human('10.4.0.1'), now: new Date('2026-11-05T03:30:00Z') });
    const { rows } = await db.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, downloads FROM "EventDocumentDaily" WHERE "documentId" = $1 ORDER BY day`, [doc.documentId]);
    assert.deepEqual(rows.map(r => r.day), ['2026-11-04']);
    assert.equal(rows[0].downloads, 26);
});
await acheck('quitar el archivo: el histórico se conserva (archived); otro evento no se mezcla', async () => {
    const s = await S.summaryFor({ event: ev, currentDocument: null, now: AHORA });
    assert.equal(s.state, 'archived'); assert.equal(s.totalDownloads, 26); assert.equal(s.current, null);
    const otro = await loadEvent('evt-otro');
    const o = await S.summaryFor({ event: otro, currentDocument: otro.metadata.hotels.document, now: AHORA });
    assert.equal(o.state, 'current'); assert.equal(o.totalDownloads, 0);
});

grupo('4. Controladores');
const fakeRes = () => {
    const r = { statusCode: 200, headers: {}, body: null, redirected: null, headersSent: false };
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; r.headersSent = true; return r; };
    r.redirect = (c, u) => { r.statusCode = c; r.redirected = u; r.headersSent = true; return r; };
    return r;
};
const req = (id, { ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', ip = '5.5.5.5', from = 'section', user, query = {} } = {}) => ({
    params: { id }, query: { from, ...query }, headers: { 'user-agent': ua, 'x-forwarded-for': ip }, ip, user,
});
await acheck('⚠️ descarga pública: 302 al archivo vigente y la solicitud registrada', async () => {
    const antes = await count(`SELECT "totalDownloads"::int AS n FROM "EventDocument" WHERE id = $1`, [doc.documentId]);
    const res = fakeRes();
    await K.downloadHotelsGuide(req('evt-villavo', { ip: '8.0.0.1' }), res);
    assert.equal(res.statusCode, 302); assert.equal(res.redirected, URL_V2);
    assert.equal(await count(`SELECT "totalDownloads"::int AS n FROM "EventDocument" WHERE id = $1`, [doc.documentId]), antes + 1);
});
await acheck('borrador → 404; descarga desactivada → 404; bot → 302 sin contar', async () => {
    const b = fakeRes(); await K.downloadHotelsGuide(req('evt-borrador'), b); assert.equal(b.statusCode, 404);
    await db.query(`UPDATE "CalendarEvent" SET metadata = $2 WHERE id = $1`, ['evt-villavo', JSON.stringify({ hotels: hotels({ url: URL_V2, fileName: 'Boletín 2.pdf' }, { allowDownload: false }) })]);
    const off = fakeRes(); await K.downloadHotelsGuide(req('evt-villavo', { ip: '8.0.0.2' }), off); assert.equal(off.statusCode, 404);
    await db.query(`UPDATE "CalendarEvent" SET metadata = $2 WHERE id = $1`, ['evt-villavo', JSON.stringify({ hotels: hotels({ url: URL_V2, fileName: 'Boletín 2.pdf' }) })]);
    const antes = await count(`SELECT "totalDownloads"::int AS n FROM "EventDocument" WHERE id = $1`, [doc.documentId]);
    const bot = fakeRes(); await K.downloadHotelsGuide(req('evt-villavo', { ua: 'facebookexternalhit/1.1', ip: '8.0.0.3' }), bot);
    assert.equal(bot.statusCode, 302);
    assert.equal(await count(`SELECT "totalDownloads"::int AS n FROM "EventDocument" WHERE id = $1`, [doc.documentId]), antes);
});
await acheck('panel: resumen y estadísticas para un administrador; 404 para otro sitio; 403 sin rol', async () => {
    const admin = { id: 'u1', role: 'district_admin', clubId: 'club-4281' };
    const r1 = fakeRes(); await K.hotelsGuideSummary(req('evt-villavo', { user: admin }), r1);
    assert.equal(r1.statusCode, 200); assert.equal(r1.body.state, 'current'); assert.ok(r1.body.totalDownloads >= 27);
    const r2 = fakeRes(); await K.hotelsGuideStats(req('evt-villavo', { user: admin, query: { period: 'custom', from: '2026-11-01', to: '2026-11-04' } }), r2);
    assert.equal(r2.statusCode, 200); assert.equal(r2.body.period.custom, true); assert.equal(r2.body.series.length, 4);
    const r3 = fakeRes(); await K.hotelsGuideSummary(req('evt-villavo', { user: { id: 'u2', role: 'district_admin', clubId: 'club-otro' } }), r3);
    assert.equal(r3.statusCode, 404);
    const r4 = fakeRes(); await K.hotelsGuideSummary(req('evt-villavo', { user: { id: 'u3', role: 'member', clubId: 'club-4281' } }), r4);
    assert.equal(r4.statusCode, 403);
});

console.log(`\n${ok} comprobaciones en verde${malos.length ? `, ${malos.length} en rojo:\n  - ${malos.join('\n  - ')}` : '.'}`);
await db.pool.end();
process.exit(malos.length ? 1 : 0);
