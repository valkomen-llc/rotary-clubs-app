#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Archivos del Directorio Distrital de Clubes — EXTREMO A EXTREMO — v4.1306.0
// CLUB_MEDIA_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:club-media:e2e
//
// Postgres REAL + S3 simulado (que exige el Content-Type firmado) + el router
// REAL de /api/district-clubs. Las diez pruebas obligatorias del pedido, a
// nivel de API, con los bytes de verdad:
//   1 logo PNG · 2 foto JPG · 3 móvil (HEIC con tipo vacío de Android, foto
//   acostada de iPhone) · 4 persistencia (cerrar y volver) · 5 reemplazo ·
//   6 galería múltiple y duplicados · 7 conexión interrumpida y reintento ·
//   8 archivo inválido · 9 permisos entre clubes · 10 panel administrativo
//   (ver, aprobar y publicar) — más el portal del club y la contraseña que ya
//   no queda en los borradores.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige una URL local.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.CLUB_MEDIA_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) { console.log('[test:club-media:e2e] Sin CLUB_MEDIA_E2E_DATABASE_URL local: se omite.'); process.exit(0); }
const require = createRequire(`${REPO}/package.json`);

// ─── S3 simulado ──────────────────────────────────────────────────────
// Guarda lo que recibe y, como S3, deja leer por GET (también con firma).
const objects = new Map();
let failNextPut = false;
const s3 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const key = decodeURIComponent(u.pathname.replace(/^\/test_bucket\//, ''));
    if (req.method === 'PUT') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            if (failNextPut) { failNextPut = false; res.writeHead(500); return res.end(); }
            const copySource = req.headers['x-amz-copy-source'];
            if (copySource) {
                const from = decodeURIComponent(String(copySource).replace(/^\/?test_bucket\//, ''));
                const o = objects.get(from);
                if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
                objects.set(key, { body: o.body, type: req.headers['content-type'] || o.type });
                res.writeHead(200, { 'Content-Type': 'application/xml' });
                return res.end('<CopyObjectResult><ETag>"x"</ETag></CopyObjectResult>');
            }
            objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] });
            res.writeHead(200, { ETag: '"x"' });
            res.end();
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
process.env.AWS_BUCKET_NAME = 'test_bucket'; process.env.AWS_ACCESS_KEY_ID = 'test'; process.env.AWS_SECRET_ACCESS_KEY = 'test'; process.env.AWS_REGION = 'us-east-1';
process.env.CLUB_MEDIA_MAX_MB_LOGO = '2'; // tope chico para probar el exceso sin generar 15 MB

const express = require('express');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
for (const t of ['DistrictClubMedia', 'DistrictClubSubmission', 'DistrictClubAccount', 'DistrictClubProfile']) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
const { default: router } = await import(`${REPO}/server/routes/district-clubs.js`);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api/district-clubs', router);
const api = http.createServer(app);
await new Promise(r => api.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${api.address().port}/api/district-clubs`;

const JWT_SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const adminToken = jwt.sign({ id: 'admin-1', email: 'admin@d4281.org', role: 'administrator', name: 'Comité Distrital' }, JWT_SECRET);

let failed = 0;
let passed = 0;
const check = async (name, fn) => {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e?.stack?.split('\n').slice(0, 3).join('\n      ') || e}`); }
};

const req = async (method, path, body, headers = {}) => {
    const r = await fetch(`${BASE}${path}`, {
        method, redirect: 'manual',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* redirección o vacío */ }
    return { status: r.status, data, location: r.headers.get('location') };
};

const newDraft = async (payload = { officialName: 'Club Rotario Prueba', city: 'Pereira' }) => {
    const r = await req('POST', '/draft', { draftToken: `draft_${Date.now()}`, payload, stepReached: 1 });
    assert.equal(r.status, 200);
    return r.data.draftToken;
};

/** El recorrido del navegador: prefirmar → PUT directo → confirmar. */
const upload = async ({ owner, role, filename, contentType, body, putType, skipPut = false }) => {
    const auth = owner.portal ? { headers: { Authorization: `Bearer ${owner.portal}` }, extra: { context: 'portal' } } : { headers: {}, extra: { context: 'borrador', draftToken: owner.draft } };
    const pre = await req('POST', '/media/presign', { role, filename, contentType, size: body.length, ...auth.extra }, auth.headers);
    if (pre.status !== 200) return { stage: 'presign', ...pre };
    if (!skipPut) {
        const put = await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': putType || pre.data.contentType }, body });
        if (!put.ok) return { stage: 'put', status: put.status, id: pre.data.id };
    }
    const conf = await req('POST', '/media/confirm', { id: pre.data.id, ...auth.extra }, auth.headers);
    return { stage: 'confirm', id: pre.data.id, ...conf };
};

const followView = async (url) => {
    const path = url.replace(/^\/api\/district-clubs/, '');
    const r = await req('GET', path);
    assert.equal(r.status, 302, `la vista redirige (HTTP ${r.status})`);
    const img = await fetch(r.location);
    assert.equal(img.status, 200);
    return { location: r.location, bytes: Buffer.from(await img.arrayBuffer()) };
};

const logoPng = await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 1, g: 70, b: 160, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="600" height="600"><circle cx="300" cy="300" r="200" fill="#f7a81b"/></svg>'), top: 0, left: 0 }])
    .png().toBuffer();
const photo = (color, w = 1600, h = 1200) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();

console.log('\nPrueba 1 — logotipo PNG');
const draftA = await newDraft();
let logoId;
await check('el formulario sube el PNG y el servidor lo confirma GUARDADO (no antes)', async () => {
    const r = await upload({ owner: { draft: draftA }, role: 'logo', filename: 'logotipo-club.png', contentType: 'image/png', body: logoPng });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.media.status, 'guardado');
    assert.equal(r.data.media.name, 'logotipo-club.png');
    assert.equal(r.data.media.outputType, 'image/png');
    assert.match(r.data.media.url, /^\/api\/district-clubs\/media\/[0-9a-f-]{36}$/);
    logoId = r.data.media.id;
});
await check('la vista previa se ve: la URL estable entrega un PNG transparente', async () => {
    const v = await followView(`/api/district-clubs/media/${logoId}`);
    const meta = await sharp(v.bytes).metadata();
    assert.equal(meta.format, 'png');
    assert.ok(meta.hasAlpha);
    assert.match(v.location, /private\/directorio-clubes\/archivos\//, 'privado mientras no se aprueba');
});
await check('el original queda intacto y privado, aparte de la versión limpia', async () => {
    const keys = [...objects.keys()];
    assert.ok(keys.some(k => k.startsWith('private/directorio-clubes/originales/') && k.includes(logoId)));
    assert.ok(keys.some(k => k === `private/directorio-clubes/archivos/${logoId}.png`));
    assert.ok(!keys.some(k => k.startsWith('directorio-clubes/')), 'nada público todavía');
});

console.log('\nPrueba 2 — fotografía JPG');
let coverId;
await check('una portada JPG queda almacenada y se puede leer', async () => {
    const r = await upload({ owner: { draft: draftA }, role: 'cover', filename: 'portada.jpg', contentType: 'image/jpeg', body: await photo('#2266aa') });
    assert.equal(r.data?.media?.status, 'guardado', JSON.stringify(r.data));
    coverId = r.data.media.id;
    const v = await followView(r.data.media.url);
    assert.equal((await sharp(v.bytes).metadata()).format, 'jpeg');
});

console.log('\nPrueba 3 — dispositivos móviles');
await check('Android: un .heic con tipo VACÍO (en realidad JPEG) se acepta y se procesa por su contenido', async () => {
    const r = await upload({ owner: { draft: draftA }, role: 'gallery', filename: '20261026_102617.heic', contentType: '', body: await photo('#aa3322', 900, 600) });
    assert.equal(r.data?.media?.status, 'guardado', JSON.stringify(r.data));
    assert.equal(r.data.media.format, 'jpeg');
});
await check('iPhone: una foto acostada (EXIF 6) con GPS queda derecha y SIN metadatos', async () => {
    const tilted = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#336633' } }).jpeg()
        .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'Apple', Model: 'iPhone' } } }).toBuffer();
    const r = await upload({ owner: { draft: draftA }, role: 'gallery', filename: 'IMG_0042.JPG', contentType: 'image/jpeg', body: tilted });
    assert.equal(r.data?.media?.status, 'guardado', JSON.stringify(r.data));
    assert.equal(r.data.media.width, 900);
    assert.equal(r.data.media.height, 1200);
    const v = await followView(r.data.media.url);
    const meta = await sharp(v.bytes).metadata();
    assert.equal(meta.exif, undefined);
});

console.log('\nPrueba 4 — persistencia (cerrar el navegador y volver)');
await check('el borrador guarda el logo; al volver, el servidor confirma que sigue GUARDADO', async () => {
    const payload = { officialName: 'Club Rotario Prueba', city: 'Pereira', logoUrl: `/api/district-clubs/media/${logoId}`, coverImageUrl: `/api/district-clubs/media/${coverId}`, password: 'NoDebeQuedar1', confirmPassword: 'NoDebeQuedar1' };
    const s = await req('POST', '/draft', { draftToken: draftA, payload, stepReached: 2 });
    assert.equal(s.data.draftToken, draftA, 'mismo borrador');
    // «Otro día»: sólo con el token.
    const back = await req('GET', `/draft/${draftA}`);
    assert.equal(back.data.payload.logoUrl, payload.logoUrl);
    const st = await req('POST', '/media/status', { context: 'borrador', draftToken: draftA, ids: [logoId, coverId] });
    assert.deepEqual(st.data.media.map(m => m.status).sort(), ['guardado', 'guardado']);
});
await check('la contraseña del portal NO quedó en el borrador', async () => {
    const { rows } = await db.query(`SELECT payload FROM "DistrictClubSubmission" WHERE "draftToken" = $1`, [draftA]);
    assert.ok(!JSON.stringify(rows[0].payload).includes('NoDebeQuedar1'));
});
await check('un token de borrador inventado por el navegador NO se acepta: el servidor genera uno aleatorio', async () => {
    const r = await req('POST', '/draft', { draftToken: 'draft_1700000000000', payload: { officialName: 'X' } });
    assert.notEqual(r.data.draftToken, 'draft_1700000000000');
    assert.match(r.data.draftToken, /^draft_[0-9a-f-]{36}$/);
});

console.log('\nPrueba 5 — reemplazo');
let logo2Id;
await check('reemplazar el logo: el nuevo queda guardado y asociado; el anterior se retira', async () => {
    const other = await sharp({ create: { width: 500, height: 500, channels: 4, background: { r: 200, g: 20, b: 20, alpha: 0.5 } } }).png().toBuffer();
    const r = await upload({ owner: { draft: draftA }, role: 'logo', filename: 'logo-nuevo.png', contentType: 'image/png', body: other });
    assert.equal(r.data?.media?.status, 'guardado');
    logo2Id = r.data.media.id;
    const del = await req('DELETE', `/media/${logoId}?context=borrador&draftToken=${encodeURIComponent(draftA)}`);
    assert.equal(del.status, 200, JSON.stringify(del.data));
    await req('POST', '/draft', { draftToken: draftA, payload: { officialName: 'Club Rotario Prueba', city: 'Pereira', logoUrl: r.data.media.url, coverImageUrl: `/api/district-clubs/media/${coverId}` } });
    const back = await req('GET', `/draft/${draftA}`);
    assert.equal(back.data.payload.logoUrl, r.data.media.url);
    const old = await req('GET', `/media/${logoId}`);
    assert.equal(old.status, 404, 'el eliminado ya no se sirve');
    assert.ok([...objects.keys()].some(k => k.includes(logoId)), 'pero sus bytes siguen (se purgan a los 30 días)');
});

console.log('\nPrueba 6 — galería múltiple');
const galleryUrls = [];
await check('tres fotografías distintas quedan guardadas', async () => {
    for (const c of ['#111188', '#118811', '#881111']) {
        const r = await upload({ owner: { draft: draftA }, role: 'gallery', filename: `foto-${c.slice(1)}.jpg`, contentType: 'image/jpeg', body: await photo(c, 1000, 700) });
        assert.equal(r.data?.media?.status, 'guardado', JSON.stringify(r.data));
        galleryUrls.push(r.data.media.url);
    }
    for (const u of galleryUrls) await followView(u);
});
await check('subir DOS veces la misma foto no la duplica: devuelve la que ya estaba', async () => {
    const same = await photo('#111188', 1000, 700);
    const r = await upload({ owner: { draft: draftA }, role: 'gallery', filename: 'copia.jpg', contentType: 'image/jpeg', body: same });
    assert.equal(r.data.duplicate, true);
    assert.equal(r.data.media.url, galleryUrls[0]);
});

console.log('\nPrueba 7 — conexión interrumpida');
await check('si el archivo no llegó, el error lo dice y se puede reintentar sin perder nada', async () => {
    const body = await photo('#555555', 800, 600);
    const r = await upload({ owner: { draft: draftA }, role: 'gallery', filename: 'cortada.jpg', contentType: 'image/jpeg', body, skipPut: true });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'missing');
    assert.match(r.data.hint, /demás datos siguen guardados/);
    // Reintento con la MISMA subida (como el botón «Reintentar»): llega y se confirma.
    const { rows } = await db.query(`SELECT "originalKey" FROM "DistrictClubMedia" WHERE id = $1`, [r.id]);
    objects.set(rows[0].originalKey, { body, type: 'image/jpeg' });
    const again = await req('POST', '/media/confirm', { id: r.id, context: 'borrador', draftToken: draftA });
    assert.equal(again.data?.media?.status, 'guardado', JSON.stringify(again.data));
    const back = await req('GET', `/draft/${draftA}`);
    assert.equal(back.data.payload.officialName, 'Club Rotario Prueba', 'el formulario sigue intacto');
});
await check('si el almacenamiento rechaza el PUT, el navegador lo sabe (no hay «guardado» falso)', async () => {
    failNextPut = true;
    const r = await upload({ owner: { draft: draftA }, role: 'gallery', filename: 'x.jpg', contentType: 'image/jpeg', body: await photo('#777777', 300, 300) });
    assert.equal(r.stage, 'put');
    assert.equal(r.status, 500);
    const { rows } = await db.query(`SELECT status FROM "DistrictClubMedia" WHERE id = $1`, [r.id]);
    assert.equal(rows[0].status, 'subiendo');
});
await check('lo que el navegador declara no decide nada: un JPEG subido como image/png se guarda por sus BYTES', async () => {
    const r = await upload({ owner: { draft: draftA }, role: 'gallery', filename: 'mal-nombrada.png', contentType: 'image/png', putType: 'image/png', body: await photo('#994400', 640, 480) });
    assert.equal(r.data?.media?.status, 'guardado', JSON.stringify(r.data));
    assert.equal(r.data.media.format, 'jpeg');
});

console.log('\nPrueba 8 — archivo inválido');
await check('SVG, PDF y archivos vacíos se rechazan ANTES de subir, con mensaje claro', async () => {
    for (const [filename, contentType, size, code] of [['logo.svg', 'image/svg+xml', 100, 'format'], ['logo.pdf', 'application/pdf', 100, 'format'], ['logo.png', 'image/png', 0, 'empty']]) {
        const r = await req('POST', '/media/presign', { role: 'logo', filename, contentType, size, context: 'borrador', draftToken: draftA });
        assert.equal(r.status, 400);
        assert.equal(r.data.code, code);
        assert.ok(r.data.error && r.data.hint);
    }
});
await check('un logo que pasa el tope dice el límite exacto', async () => {
    const r = await req('POST', '/media/presign', { role: 'logo', filename: 'enorme.png', contentType: 'image/png', size: 5 * 1024 * 1024, context: 'borrador', draftToken: draftA });
    assert.equal(r.data.code, 'too_large');
    assert.match(r.data.error, /2 MB/);
});
await check('un texto disfrazado de .png sube pero NO se guarda: not_image', async () => {
    const r = await upload({ owner: { draft: draftA }, role: 'logo', filename: 'malicioso.png', contentType: 'image/png', body: Buffer.from('<script>alert(1)</script> no soy una imagen') });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'not_image');
    const view = await req('GET', `/media/${r.id}`);
    assert.notEqual(view.status, 302, 'nunca se sirve');
});

console.log('\nPrueba 9 — permisos entre clubes');
const draftB = await newDraft({ officialName: 'Club Rotario Otro', city: 'Manizales' });
await check('otro club no puede confirmar, consultar ni eliminar archivos ajenos', async () => {
    const conf = await req('POST', '/media/confirm', { id: logo2Id, context: 'borrador', draftToken: draftB });
    assert.equal(conf.status, 403);
    const del = await req('DELETE', `/media/${logo2Id}?context=borrador&draftToken=${encodeURIComponent(draftB)}`);
    assert.equal(del.status, 403);
    const st = await req('POST', '/media/status', { context: 'borrador', draftToken: draftB, ids: [logo2Id] });
    assert.equal(st.data.media[0].status, 'ajeno');
    assert.equal(st.data.media[0].url, null);
});
await check('sin un borrador real no se prefirma nada', async () => {
    const r = await req('POST', '/media/presign', { role: 'logo', filename: 'a.png', contentType: 'image/png', size: 10, context: 'borrador', draftToken: 'draft_inventado_000' });
    assert.equal(r.status, 404);
});
await check('si otro club cuelga en SU envío un archivo ajeno, el servidor lo quita', async () => {
    const r = await req('POST', '/submit', {
        officialName: 'Club Rotario Otro', city: 'Manizales', applicantName: 'Ana', applicantEmail: 'ana@otro.org',
        draftToken: draftB, logoUrl: `/api/district-clubs/media/${logo2Id}`, dataConsent: true,
    });
    assert.equal(r.status, 200);
    const { rows } = await db.query(`SELECT payload FROM "DistrictClubSubmission" WHERE id = $1`, [r.data.submissionId]);
    assert.equal(rows[0].payload.logoUrl, '');
});

console.log('\nPrueba 10 — panel administrativo');
let submissionId;
await check('el club envía: los archivos quedan VINCULADOS a la solicitud y la contraseña no se guarda', async () => {
    const r = await req('POST', '/submit', {
        officialName: 'Club Rotario Prueba', city: 'Pereira', applicantName: 'Luis', applicantEmail: 'luis@prueba.org',
        description: 'Club de prueba', currentPresident: 'Luis', draftToken: draftA, dataConsent: true,
        logoUrl: `/api/district-clubs/media/${logo2Id}`, coverImageUrl: `/api/district-clubs/media/${coverId}`,
        gallery: galleryUrls.map((url, i) => ({ url, isMain: i === 0 })), password: 'Secreta123', confirmPassword: 'Secreta123',
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    submissionId = r.data.submissionId;
    const { rows } = await db.query(`SELECT payload FROM "DistrictClubSubmission" WHERE id = $1`, [submissionId]);
    assert.ok(!JSON.stringify(rows[0].payload).includes('Secreta123'));
    const { rows: m } = await db.query(`SELECT count(*)::int n FROM "DistrictClubMedia" WHERE "submissionId" = $1`, [submissionId]);
    assert.equal(m[0].n, 5);
});
await check('el panel ve los archivos de la solicitud, también los que fallaron', async () => {
    const r = await req('GET', `/admin/submissions/${submissionId}/media`, null, { Authorization: `Bearer ${adminToken}` });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const inSub = r.data.media.filter(m => m.inSubmission);
    assert.equal(inSub.length, 5);
    assert.ok(r.data.media.some(m => m.status === 'error' && m.errorCode === 'not_image'), 'el inválido aparece como fallido');
    assert.ok(r.data.media.some(m => m.status === 'eliminado'), 'el reemplazado aparece como eliminado');
    for (const m of inSub) await followView(m.url);
});
await check('sin sesión de administración, el panel no responde', async () => {
    const r = await req('GET', `/admin/submissions/${submissionId}/media`);
    assert.equal(r.status, 401);
});
await check('al APROBAR, los archivos se publican en el perfil del club con URL pública', async () => {
    const r = await req('POST', `/admin/submissions/${submissionId}/review`, { action: 'approve' }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const { rows } = await db.query(`SELECT id, "logoUrl", "coverImageUrl", gallery FROM "DistrictClubProfile" WHERE "officialName" = 'Club Rotario Prueba'`);
    const p = rows[0];
    assert.ok(p, 'perfil creado');
    assert.match(p.logoUrl, new RegExp(`/test_bucket/directorio-clubes/${p.id}/${logo2Id}\\.png$`));
    assert.match(p.coverImageUrl, /\/directorio-clubes\//);
    assert.equal(p.gallery.length, 3);
    const pub = await fetch(p.logoUrl);
    assert.equal(pub.status, 200);
    // La dirección estable sigue sirviendo, ahora hacia lo público.
    const view = await req('GET', `/media/${logo2Id}`);
    assert.equal(view.location, p.logoUrl);
});

console.log('\nPortal del club (perfil ya publicado)');
await check('desde el portal: sube, se publica al instante y queda en el perfil al guardar', async () => {
    const { rows } = await db.query(`SELECT id FROM "DistrictClubProfile" WHERE "officialName" = 'Club Rotario Prueba'`);
    const profileId = rows[0].id;
    const portalToken = jwt.sign({ sub: 'acc-1', email: 'luis@prueba.org', profileId, aud: 'rotary-club-portal' }, JWT_SECRET);
    const r = await upload({ owner: { portal: portalToken }, role: 'logo', filename: 'logo-2027.png', contentType: 'image/png', body: await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.3 } } }).png().toBuffer() });
    assert.equal(r.data?.media?.status, 'publicado', JSON.stringify(r.data));
    assert.match(r.data.media.url, /\/directorio-clubes\//);
    const save = await req('PUT', '/portal/profile', { logoUrl: r.data.media.url }, { Authorization: `Bearer ${portalToken}` });
    assert.equal(save.status, 200, JSON.stringify(save.data));
    const { rows: after } = await db.query(`SELECT "logoUrl" FROM "DistrictClubProfile" WHERE id = $1`, [profileId]);
    assert.equal(after[0].logoUrl, r.data.media.url);
});
await check('el portal de OTRO club no puede borrar ese archivo', async () => {
    const other = jwt.sign({ sub: 'acc-2', email: 'x@otro.org', profileId: 'perfil-ajeno', aud: 'rotary-club-portal' }, JWT_SECRET);
    const del = await req('DELETE', `/media/${logo2Id}?context=portal`, null, { Authorization: `Bearer ${other}` });
    assert.equal(del.status, 403);
});

console.log('\nLimpieza');
await check('lo abandonado (subidas sin confirmar de hace días) se limpia; lo guardado no se toca', async () => {
    const { cleanupClubMedia } = await import(`${REPO}/server/lib/clubMediaStore.js`);
    await db.query(`UPDATE "DistrictClubMedia" SET "updatedAt" = NOW() - INTERVAL '5 days' WHERE status IN ('subiendo','error')`);
    const before = (await db.query(`SELECT count(*)::int n FROM "DistrictClubMedia" WHERE status IN ('guardado','publicado')`)).rows[0].n;
    const out = await cleanupClubMedia({ force: true });
    assert.ok(out.abandoned >= 2, JSON.stringify(out));
    const after = (await db.query(`SELECT count(*)::int n FROM "DistrictClubMedia" WHERE status IN ('guardado','publicado')`)).rows[0].n;
    assert.equal(after, before);
});

api.close(); s3.close();
await db.end?.().catch?.(() => {});
console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
