#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// «Hoteles de la conferencia» — de EXTREMO A EXTREMO — v4.1275.0
// HOTELS_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:event-hotels:e2e
//
// Postgres REAL + un S3 simulado en memoria + los routers REALES de
// `/api/calendar` y `/api/clubs`: permisos → subir una diapositiva (PUT
// prefirmado, validación por bytes, tres tamaños WebP) → rechazar un HTML
// disfrazado, una imagen diminuta y una clave de otro evento → guía en PDF
// (y un PDF con JavaScript) → guardar el evento (sello e historial que el
// navegador no puede falsificar) → ficha pública sin historial → limpieza
// de archivos sin uso que no toca lo que está en uso ni lo de otro evento.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige una base LOCAL y desechable.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.HOTELS_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:event-hotels:e2e] Sin HOTELS_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
const require = createRequire(`${REPO}/package.json`);

// ── S3 simulado (path-style), con listado y fechas manipulables ──
const objects = new Map();
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const s3 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET' && u.searchParams.get('list-type') === '2') {
        const prefix = u.searchParams.get('prefix') || '';
        const items = [...objects.entries()].filter(([k]) => k.startsWith(prefix));
        const body = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>test_bucket</Name><Prefix>${xmlEsc(prefix)}</Prefix><KeyCount>${items.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${
            items.map(([k, o]) => `<Contents><Key>${xmlEsc(k)}</Key><LastModified>${o.mtime.toISOString()}</LastModified><Size>${o.body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`).join('')
        }</ListBucketResult>`;
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        return res.end(body);
    }
    const key = decodeURIComponent(u.pathname.replace(/^\/test_bucket\//, ''));
    if (req.method === 'PUT') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'], disposition: req.headers['content-disposition'], cache: req.headers['cache-control'], mtime: new Date() });
            res.writeHead(200, { ETag: '"x"' }); res.end();
        });
        return;
    }
    const o = objects.get(key);
    if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
    if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>'); }
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type || 'application/octet-stream' }); return res.end(); }
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type }); return res.end(o.body); }
    res.writeHead(405); res.end();
});
await new Promise(r => s3.listen(0, '127.0.0.1', r));

process.env.DATABASE_URL = E2E_DB;
process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${s3.address().port}`;
process.env.AWS_BUCKET_NAME = 'test_bucket';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';

const express = require('express');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { default: db } = await import(`${REPO}/server/lib/db.js`);

await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (
    id TEXT PRIMARY KEY, title TEXT, description TEXT, "htmlContent" TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ,
    location TEXT, type TEXT DEFAULT 'meeting', image TEXT, images TEXT[] DEFAULT '{}', metadata JSONB DEFAULT '{}', slug TEXT,
    "clubId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`DELETE FROM "CalendarEvent" WHERE id IN ('evt-villavo','evt-otro')`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "startDate", "clubId", metadata) VALUES
    ('evt-villavo','XIII Conferencia Rotaria del Distrito 4281','villavicencio2027','2027-05-28T14:00:00Z','club-4281','{"venue":{"name":"Villavicencio"}}'),
    ('evt-otro','Instituto Rotary','instituto','2027-09-01T14:00:00Z','club-4281','{}')`);

const { default: calendar } = await import(`${REPO}/server/routes/calendar.js`);
const { default: clubs } = await import(`${REPO}/server/routes/clubs.js`);
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api/calendar', calendar);
app.use('/api/clubs', clubs);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}/api`;

const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const admin = jwt.sign({ id: 'u-admin', email: 'admin@rotary4281.org', role: 'club_admin', clubId: 'club-4281' }, SECRET);
const ajeno = jwt.sign({ id: 'u-x', email: 'x@otro.org', role: 'club_admin', clubId: 'club-otro' }, SECRET);
const socio = jwt.sign({ id: 'u-m', email: 'socio@rotary4281.org', role: 'member', clubId: 'club-4281' }, SECRET);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
const H = '/calendar/events/evt-villavo/hotels';

/** Una diapositiva de verdad: 1920×1080 con texto, como la del Hotel Estelar. */
const slidePng = async (w = 1920, h = 1080, label = 'Hotel Estelar') => sharp({ create: { width: w, height: h, channels: 4, background: '#ffffff' } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><text x="80" y="160" font-size="72" fill="#1a56db">${label}</text><text x="80" y="320" font-size="40" fill="#111">$340.000 + IVA · Reservas (+57) 316 692 6704</text></svg>`) }])
    .png().toBuffer();

const upload = async (kind, fileName, contentType, bytes, token = admin) => {
    const pre = await call('POST', `${H}/presign`, token, { kind, fileName, contentType, size: bytes.length });
    if (pre.status !== 200) return { stage: 'presign', ...pre };
    const put = await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.data.contentType }, body: bytes });
    assert.equal(put.status, 200, 'PUT a S3');
    const confirm = await call('POST', `${H}/${kind === 'image' ? 'slides' : 'document'}`, token, { storageKey: pre.data.storageKey, fileName });
    return { stage: 'confirm', storageKey: pre.data.storageKey, ...confirm };
};
const keyOf = (url) => decodeURIComponent(new URL(url).pathname.slice(1));

console.log('\n1. Permisos');
ok((await call('POST', `${H}/presign`, null, { kind: 'image', fileName: 'a.png' })).status === 401, 'sin sesión → 401');
ok((await call('POST', `${H}/presign`, ajeno, { kind: 'image', fileName: 'a.png' })).status === 404, 'administrador de OTRO sitio → 404 (el evento «no existe»)');
ok((await call('POST', `${H}/presign`, socio, { kind: 'image', fileName: 'a.png' })).status === 403, 'un socio con sesión no sube archivos → 403');
ok((await call('GET', `${H}/orphans`, socio)).status === 403, 'un socio no ve ni libera archivos → 403');

console.log('\n2. Diapositivas');
const pdfAsImage = await call('POST', `${H}/presign`, admin, { kind: 'image', fileName: 'hoteles.pdf', contentType: 'application/pdf', size: 1000 });
ok(pdfAsImage.status === 415 && pdfAsImage.data.hint === 'pdf', 'un PDF en el visor → 415 con la pista de la guía descargable');
ok((await call('POST', `${H}/presign`, admin, { kind: 'image', fileName: 'x.jpg', contentType: 'image/jpeg', size: 99 * 1024 * 1024 })).status === 413, 'imagen que supera el tope → 413');

const png = await slidePng();
const s1 = await upload('image', 'Hotel Estelar.png', 'image/png', png);
ok(s1.status === 200, `diapositiva aceptada (${JSON.stringify(s1.data).slice(0, 80)})`);
ok(s1.data.width === 1920 && s1.data.height === 1080, 'no se agranda ni se recorta: 1920×1080 se queda en 1920×1080');
const full = objects.get(keyOf(s1.data.imageUrl));
const md = objects.get(keyOf(s1.data.mediumUrl));
const th = objects.get(keyOf(s1.data.thumbUrl));
ok(full && md && th, 'tres tamaños publicados');
ok(full.type === 'image/webp' && /immutable/.test(full.cache), 'WebP con caché larga e inmutable');
ok((await sharp(md.body).metadata()).width === 1400 && (await sharp(th.body).metadata()).width === 480, 'tamaño medio 1400 px y miniatura 480 px, misma proporción');
ok(keyOf(s1.data.imageUrl).startsWith('events/hotels/evt-villavo/slides/'), 'publicada en el prefijo de ESTE evento');
ok(!objects.has(s1.storageKey), 'lo recibido (privado) se borra tras publicar');
ok(!(await sharp(full.body).metadata()).exif, 'sin metadatos EXIF en lo publicado');

const html = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(5000, ' '));
const fake = await upload('image', 'hotel.jpg', 'image/jpeg', html);
ok(fake.status === 415 && fake.data.code === 'not_image', 'HTML disfrazado de .jpg → 415 por sus bytes');
ok(!objects.has(fake.storageKey), 'y el objeto rechazado se borra');
const tiny = await upload('image', 'mini.png', 'image/png', await slidePng(500, 300));
ok(tiny.status === 422 && tiny.data.code === 'too_small', 'imagen ilegible por pequeña → 422 con explicación');
const otro = await call('POST', `${H}/presign`, admin, { kind: 'image', fileName: 'a.png', contentType: 'image/png', size: 10 });
const ajenaKey = otro.data.storageKey.replace('evt-villavo', 'evt-otro');
ok((await call('POST', `${H}/slides`, admin, { storageKey: ajenaKey })).data.code === 'foreign_key', 'clave de OTRO evento → rechazada');
ok((await call('POST', `${H}/slides`, admin, { storageKey: otro.data.storageKey })).status === 404, 'clave sin archivo subido → 404');
const s2 = await upload('image', 'Hotel Del Llano.jpg', 'image/jpeg', await sharp(await slidePng(2600, 1463, 'Hotel Del Llano')).jpeg().toBuffer());
ok(s2.status === 200 && s2.data.width === 2400, 'una diapositiva de 2600 px se reduce a 2400 px');

console.log('\n3. Guía descargable');
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n'), Buffer.alloc(20000, 32), Buffer.from('\n%%EOF\n')]);
const doc = await upload('document', 'Guía de hoteles Villavicencio.pdf', 'application/pdf', pdf);
ok(doc.status === 200 && doc.data.sizeBytes === pdf.length, 'PDF aceptado con su peso real');
const docObj = objects.get(keyOf(doc.data.url));
ok(docObj && docObj.type === 'application/pdf' && /attachment/.test(docObj.disposition) && /filename\*=UTF-8''Gu%C3%ADa/.test(docObj.disposition), 'se descarga con su nombre (acentos incluidos)');
const evil = await upload('document', 'malo.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n<< /S /JavaScript /JS (app.alert(1)) >>\n%%EOF\n'));
ok(evil.status === 422 && evil.data.code === 'active_content', 'PDF con JavaScript → rechazado');
ok((await upload('document', 'falso.pdf', 'application/pdf', Buffer.from('PK\u0003\u0004'.padEnd(500, 'x')))).data.code === 'not_pdf', 'ZIP disfrazado de PDF → rechazado');

console.log('\n4. Guardar el evento: sello e historial');
const slideOf = (s, id, alt) => ({ id, imageUrl: s.data.imageUrl, mediumUrl: s.data.mediumUrl, thumbUrl: s.data.thumbUrl, width: s.data.width, height: s.data.height, altText: alt, enabled: true });
const hotels = {
    enabled: true, title: 'Hoteles de la conferencia', description: 'Conoce las opciones de alojamiento.',
    slides: [slideOf(s1, 'hs-1', 'Hotel Estelar'), slideOf(s2, 'hs-2', 'Hotel Del Llano')],
    showThumbnails: true, allowDownload: true, document: doc.data, ratesUpdatedOn: '2026-11-03',
    history: [{ at: '2020-01-01', changes: ['falsificado'] }], updatedBy: { name: 'Otra persona' },
};
const base = { title: 'XIII Conferencia Rotaria del Distrito 4281', startDate: '2027-05-28T14:00:00Z', type: 'conference', images: [], metadata: { venue: { name: 'Villavicencio' }, hotels } };
const put1 = await call('PUT', '/calendar/events/evt-villavo', admin, base);
ok(put1.status === 200, 'el evento se guarda');
const h1 = put1.data.metadata.hotels;
ok(h1.history.length === 1 && !JSON.stringify(h1.history).includes('falsificado'), 'el historial del navegador se ignora; el servidor escribe el suyo');
ok(h1.updatedBy.name === 'admin@rotary4281.org' && h1.history[0].changes.includes('Publicó la sección'), 'sellado con quién y qué');
ok(put1.data.metadata.venue.name === 'Villavicencio', 'el resto de la metadata intacto');
const put2 = await call('PUT', '/calendar/events/evt-villavo', admin, { ...base, metadata: { ...base.metadata, hotels: { ...hotels, slides: [hotels.slides[1], hotels.slides[0]] } } });
ok(put2.data.metadata.hotels.history.length === 2 && put2.data.metadata.hotels.history[0].changes.includes('Cambió el orden de las diapositivas'), 'reordenar queda registrado');
const put3 = await call('PUT', '/calendar/events/evt-villavo', admin, { ...base, metadata: { ...base.metadata, hotels: put2.data.metadata.hotels } });
ok(put3.data.metadata.hotels.history.length === 2, 'guardar sin cambios no agrega entradas');
const otroEv = await db.query(`SELECT metadata FROM "CalendarEvent" WHERE id = 'evt-otro'`);
ok(!otroEv.rows[0].metadata.hotels, 'el otro evento sigue sin sección de hoteles');

console.log('\n5. Ficha pública');
const pub = await call('GET', '/clubs/club-4281/events/villavicencio2027');
ok(pub.status === 200 && pub.data.metadata.hotels.slides.length === 2, 'la ficha recibe las diapositivas');
ok(!('history' in pub.data.metadata.hotels) && !('updatedBy' in pub.data.metadata.hotels), 'sin historial ni autor');
const list = await call('GET', '/clubs/club-4281/events');
ok(list.data.every(e => !e.metadata?.hotels?.history), 'el listado público tampoco los lleva');

console.log('\n6. Archivos sin uso');
// Reemplazar la diapositiva 1 deja su archivo viejo sin uso.
const s3new = await upload('image', 'Hotel Estelar v2.png', 'image/png', await slidePng(1920, 1080, 'Hotel Estelar 2027'));
await call('PUT', '/calendar/events/evt-villavo', admin, { ...base, metadata: { ...base.metadata, hotels: { ...hotels, slides: [slideOf(s3new, 'hs-1', 'Hotel Estelar'), hotels.slides[1]] } } });
const recien = await call('GET', `${H}/orphans`, admin);
ok(recien.status === 200 && recien.data.orphans.length === 0, 'lo reemplazado HOY se conserva (24 h de gracia)');
for (const o of objects.values()) o.mtime = new Date(Date.now() - 3 * 24 * 3600 * 1000);
// Un archivo de OTRO evento, viejo y sin uso: no se toca desde aquí.
objects.set('events/hotels/evt-otro/slides/x.webp', { body: Buffer.from('x'), type: 'image/webp', mtime: new Date(0) });
// Y uno que alguien copió en el HTML de otro evento: tampoco.
const s4 = await upload('image', 'compartida.png', 'image/png', await slidePng());
objects.get(keyOf(s4.data.imageUrl)).mtime = new Date(0);
await db.query(`UPDATE "CalendarEvent" SET "htmlContent" = $1 WHERE id = 'evt-otro'`, [`<img src="${s4.data.imageUrl}">`]);
const viejos = await call('GET', `${H}/orphans`, admin);
const claves = viejos.data.orphans.map(o => o.key);
ok(claves.length === 3 && claves.every(k => k.includes(keyOf(s1.data.imageUrl).replace('.webp', ''))), `sólo los tres tamaños de la diapositiva reemplazada (${claves.length})`);
ok(!claves.some(k => k.includes('evt-otro')), 'nunca archivos de otro evento');
const del = await call('DELETE', `${H}/orphans`, admin);
ok(del.data.deleted === 3, 'se liberan los tres');
ok(objects.has(keyOf(s3new.data.imageUrl)) && objects.has(keyOf(s2.data.imageUrl)) && objects.has(keyOf(doc.data.url)), 'lo que está en uso sigue ahí');
ok(objects.has(keyOf(s4.data.imageUrl)), 'lo citado en el HTML de otro evento sigue ahí');
ok(objects.has('events/hotels/evt-otro/slides/x.webp'), 'lo del otro evento sigue ahí');

await db.query(`DELETE FROM "CalendarEvent" WHERE id IN ('evt-villavo','evt-otro')`);
srv.close(); s3.close();
await db.end?.().catch?.(() => {});
console.log(`\n✅ ${n} comprobaciones de extremo a extremo en verde.`);
process.exit(0);
