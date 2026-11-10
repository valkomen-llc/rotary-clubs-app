#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Importar el comprobante de una inscripción desde una URL externa — v4.1312
//
//   npm run test:receipt-url-import
//   RECEIPT_IMPORT_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:receipt-url-import
//
// 1. CRITERIO (sin red): qué direcciones nunca se consultan, qué enlaces se
//    aceptan, cómo se redacta un enlace con tokens, el nombre del archivo y
//    las guardas del código.
// 2. LA DESCARGA, contra un servidor HTTPS LOCAL con un certificado propio:
//    los cuatro formatos, redirecciones (buenas y malas), 401/404, una página
//    HTML, un ejecutable, el tope de peso con y sin Content-Length, el tope
//    de tiempo y la guarda real ante 127.0.0.1.
// 3. EXTREMO A EXTREMO (sólo con RECEIPT_IMPORT_E2E_DATABASE_URL a
//    localhost): Postgres REAL + el router REAL por HTTP, el S3 en memoria
//    (`receipts-completed-stub.mjs`) y la descarga real apuntando al servidor
//    local (`receipt-url-fetch-local.mjs`).
//
// ⚠️ La parte 3 ESCRIBE en la base que se le dé: exige localhost y una base
// VACÍA y desechable. Nunca lee DATABASE_URL.
// ════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { register, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const HERE = pathToFileURL(`${REPO}/`).href;

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);
const leer = (f) => readFileSync(`${REPO}/${f}`, 'utf8');

// Archivos de muestra: lo que importa son sus PRIMEROS BYTES.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]), Buffer.from('JFIF\0 comprobante jpg'), Buffer.from([0xFF, 0xD9])]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from('IHDR comprobante png')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 comprobante webp')]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
const HTML = Buffer.from('<!DOCTYPE html><html><body>Inicia sesión para ver este archivo</body></html>');

// ════════════════════════════════════════════════════════════════════
// 1. CRITERIO
// ════════════════════════════════════════════════════════════════════
const f = await import('../server/lib/receiptUrlFetch.js');

grupo('1.1 Direcciones que nunca se consultan');
for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1',
    '::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', '2002:a00:1::', 'ff02::1', 'no-es-ip']) {
    check(`bloqueada: ${ip}`, f.isBlockedAddress(ip));
}
for (const ip of ['8.8.8.8', '52.216.1.1', '172.32.0.1', '2607:f8b0:4005:80a::200e', '::ffff:8.8.8.8']) {
    check(`pública: ${ip}`, !f.isBlockedAddress(ip));
}

grupo('1.2 Qué enlaces se aceptan');
const codigo = (u) => { const r = f.checkImportUrl(u); return r.ok ? 'ok' : r.code; };
check('https público', codigo('https://drive.google.com/file/d/abc/view') === 'ok');
check('http → no válido', codigo('http://ejemplo.com/a.pdf') === 'invalid_url');
check('ftp / file / javascript / data → no válidos', ['ftp://x.com/a', 'file:///etc/passwd', 'javascript:alert(1)', 'data:application/pdf;base64,AA'].every(u => codigo(u) === 'invalid_url'));
check('vacío o con espacios → no válido', codigo('') === 'invalid_url' && codigo('https://a.com/un archivo.pdf') === 'invalid_url');
check('localhost → bloqueado', codigo('https://localhost/a.pdf') === 'blocked' && codigo('https://api.localhost/a') === 'blocked');
check('IP privada literal → bloqueada', codigo('https://10.0.0.5/a.pdf') === 'blocked' && codigo('https://169.254.169.254/latest/meta-data/') === 'blocked');
check('IPv6 loopback literal → bloqueada', codigo('https://[::1]/a.pdf') === 'blocked');
check('host interno sin punto → bloqueado', codigo('https://intranet/a.pdf') === 'blocked' && codigo('https://db.internal/a') === 'blocked');
check('otro puerto → bloqueado', codigo('https://ejemplo.com:8443/a.pdf') === 'blocked');
check('puerto 443 explícito → ok', codigo('https://ejemplo.com:443/a.pdf') === 'ok');
check('usuario:contraseña en el enlace → bloqueado', codigo('https://user:pass@ejemplo.com/a.pdf') === 'blocked');

grupo('1.3 Enlaces de proveedores → descarga directa');
check('Google Drive /file/d/…/view', f.normalizeShareUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing') === 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp');
check('Google Drive /open?id=', f.normalizeShareUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp') === 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp');
check('Dropbox dl=0 → dl=1', f.normalizeShareUrl('https://www.dropbox.com/s/xyz/pago.pdf?dl=0') === 'https://www.dropbox.com/s/xyz/pago.pdf?dl=1');
check('cualquier otro, igual', f.normalizeShareUrl('https://ejemplo.com/a.pdf?x=1') === 'https://ejemplo.com/a.pdf?x=1');

grupo('1.4 El enlace se guarda REDACTADO (una URL firmada lleva su llave)');
{
    const r = f.redactSourceUrl('https://bucket.s3.amazonaws.com/c/pago.pdf?X-Amz-Signature=abc123&X-Amz-Credential=AKIA&id=77#frag');
    check('sin el valor de la firma ni la credencial', !/abc123|AKIA/.test(r), r);
    check('conserva host, ruta y parámetros inofensivos', r === 'https://bucket.s3.amazonaws.com/c/pago.pdf?X-Amz-Signature=***&X-Amz-Credential=***&id=77', r);
    check('sin usuario ni contraseña', !/secreta/.test(f.redactSourceUrl('https://yo:secreta@x.com/a.pdf')));
    check('token de Firebase tapado', !/tok-999/.test(f.redactSourceUrl('https://firebasestorage.googleapis.com/v0/b/x/o/a.pdf?alt=media&token=tok-999')));
}

grupo('1.5 El nombre del archivo, con la extensión del tipo REAL');
check('el que escribió el administrador', f.resolveReceiptName({ given: 'Transferencia Kely', mime: 'application/pdf' }) === 'Transferencia Kely.pdf');
check('del Content-Disposition (UTF-8)', f.resolveReceiptName({ disposition: "attachment; filename*=UTF-8''recibo%20%C3%B1.png", mime: 'image/png' }) === 'recibo ñ.png');
check('del Content-Disposition (simple)', f.resolveReceiptName({ disposition: 'inline; filename="pago.jpeg"', mime: 'image/jpeg' }) === 'pago.jpg');
check('de la ruta', f.resolveReceiptName({ finalUrl: 'https://x.com/a/soporte-pago.pdf?t=1', mime: 'application/pdf' }) === 'soporte-pago.pdf');
check('un .html que en verdad es PDF se nombra .pdf', f.resolveReceiptName({ given: 'factura.html', mime: 'application/pdf' }) === 'factura.pdf');
check('sin nombre → «comprobante»', f.resolveReceiptName({ finalUrl: 'https://x.com/descargar', mime: 'image/webp' }) === 'comprobante.webp');
check('sin caracteres de ruta', !/[\\/]/.test(f.resolveReceiptName({ given: '../../etc/passwd', mime: 'application/pdf' })));

grupo('1.6 Guardas del código');
{
    const fetchSrc = leer('server/lib/receiptUrlFetch.js');
    check('la dirección se valida en el MISMO lookup del socket', /lookup,\s*\n\s*ca,/.test(fetchSrc) && /guardedLookup/.test(fetchSrc));
    check('no se usa fetch() global (no deja validar la dirección conectada)', !/\bawait fetch\(/.test(fetchSrc));
    check('no viajan cookies ni Authorization', !/Cookie|Authorization/.test(fetchSrc.slice(fetchSrc.indexOf('headers: {'), fetchSrc.indexOf('lookup,'))));
    check('cada redirección pasa por checkImportUrl', /const juicio = checkImportUrl\(next\.toString\(\), rules\)/.test(fetchSrc));
    const imp = leer('server/lib/completedReceiptImport.js');
    check('⚠️ vincula por el camino único (replaceCompletedReceipt)', /replaceCompletedReceipt\(/.test(imp));
    check('⚠️ no cambia el estado ni toca pagos', !/status\s*=|EventRegistrationPayment|recordPayment|finalizePaid|ledger/i.test(imp.replace(/\/\/.*$/gm, '').replace(/\*[^\n]*/g, '')));
    check('sin huérfanos: borra la copia de ESA petición si la vinculación falla', /if \(uploadedNow\) await deleteReceiptObject\(staged\.key\);\s*\n\s*return fail\(importError\('link'/.test(imp));
    check('el intento fallido queda en el historial', /type: 'receipt_import_failed'/.test(imp));
    const rutas = leer('server/routes/event-registrations.js');
    check('rutas del panel con authMiddleware',
        /router\.post\('\/admin\/completed\/:id\/receipt-import\/verify', authMiddleware/.test(rutas)
        && /router\.post\('\/admin\/completed\/:id\/receipt-import', authMiddleware/.test(rutas));
    const adm = leer('server/controllers/completedRegistrationAdminController.js');
    check('las dos pasan por la capacidad del evento (loadDetail)',
        /export const verifyReceiptImportUrl[\s\S]{0,200}loadDetail\(req, res\)/.test(adm)
        && /export const importReceiptFromUrl[\s\S]{0,200}loadDetail\(req, res\)/.test(adm));
    const ui = leer('src/components/admin/events/ComprobanteDeLaInscripcion.tsx');
    check('el panel tiene el botón «Importar comprobante desde URL»', /Importar comprobante desde URL/.test(ui));
    check('…y el modal sus tres botones', /Cancelar/.test(ui) && /Verificar enlace/.test(ui) && /Importar comprobante'/.test(ui));
}

// ════════════════════════════════════════════════════════════════════
// 2. LA DESCARGA contra un servidor HTTPS local
// ════════════════════════════════════════════════════════════════════
const dir = mkdtempSync(join(tmpdir(), 'receipt-import-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
    '-subj', '/CN=comprobantes.test', '-addext', 'subjectAltName=DNS:comprobantes.test,DNS:espejo.test'], { stdio: 'ignore' });
const KEY = readFileSync(join(dir, 'key.pem'));
const CERT = readFileSync(join(dir, 'cert.pem'));
rmSync(dir, { recursive: true, force: true });

const borrados = new Set();
const vistos = [];
const servidor = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
    vistos.push({ url: req.url, headers: req.headers });
    const path = req.url.split('?')[0];
    const send = (status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
    if (borrados.has(path)) return send(404, 'no existe');
    switch (path) {
        case '/pago.pdf': return send(200, PDF, { 'Content-Type': 'application/pdf' });
        case '/foto.jpg': return send(200, JPG, { 'Content-Type': 'image/jpeg' });
        case '/captura.png': return send(200, PNG, { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="captura-banco.png"' });
        case '/recibo.webp': return send(200, WEBP, { 'Content-Type': 'image/webp' });
        case '/mentira.pdf': return send(200, PNG, { 'Content-Type': 'application/pdf' }); // dice PDF, es PNG
        case '/programa.pdf': return send(200, EXE, { 'Content-Type': 'application/pdf' });
        case '/login': return send(200, HTML, { 'Content-Type': 'text/html; charset=utf-8' });
        case '/privado.pdf': return send(403, 'prohibido');
        case '/caido.pdf': return send(503, 'caído');
        case '/vacio.pdf': return send(200, '', { 'Content-Type': 'application/pdf' });
        case '/gigante.pdf': return send(200, Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024, 0x20)]), { 'Content-Type': 'application/pdf' });
        case '/gigante-sin-largo.pdf': {
            res.writeHead(200, { 'Content-Type': 'application/pdf', 'Transfer-Encoding': 'chunked' });
            res.write(PDF);
            let n = 0;
            const t = setInterval(() => { if (n++ > 12 || res.destroyed) { clearInterval(t); res.end(); return; } res.write(Buffer.alloc(1024 * 1024, 0x20)); }, 5);
            return undefined;
        }
        case '/gzip.pdf': {
            const zlib = createRequire(import.meta.url)('node:zlib');
            return send(200, zlib.gzipSync(PDF), { 'Content-Type': 'application/pdf', 'Content-Encoding': 'gzip' });
        }
        case '/lento.pdf': return setTimeout(() => send(200, PDF), 3000);
        case '/salto': return send(302, '', { Location: '/pago.pdf' });
        case '/salto-espejo': return send(301, '', { Location: `https://espejo.test:${servidor.address().port}/foto.jpg` });
        case '/salto-http': return send(302, '', { Location: `http://comprobantes.test:${servidor.address().port}/pago.pdf` });
        case '/salto-interno': return send(302, '', { Location: 'https://169.254.169.254/latest/meta-data/' });
        case '/salto-localhost': return send(302, '', { Location: 'https://localhost/pago.pdf' });
        case '/bucle': return send(302, '', { Location: '/bucle' });
        default: return send(404, 'no existe');
    }
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const PORT = servidor.address().port;
const U = (p) => `https://comprobantes.test:${PORT}${p}`;
const TESTING = {
    ca: CERT,
    allowAnyPort: true,
    allowAddress: (ip) => ip === '127.0.0.1',
    resolve: (host, opts, cb) => (/\.test$/.test(host) ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(Object.assign(new Error('no resuelve'), { code: 'ENOTFOUND' }))),
    totalTimeoutMs: 1500,
};
const traer = (url, extra = {}) => f.fetchReceiptFromUrl(url, { testing: { ...TESTING, ...extra } });

grupo('2.1 Los cuatro formatos');
{
    const pdf = await traer(U('/pago.pdf?token=SECRETO'));
    check('PDF', pdf.ok && pdf.mime === 'application/pdf' && pdf.bytes === PDF.length && /^[0-9a-f]{64}$/.test(pdf.sha256), JSON.stringify({ ...pdf, buffer: undefined }));
    check('JPG', (await traer(U('/foto.jpg'))).mime === 'image/jpeg');
    const png = await traer(U('/captura.png'));
    check('PNG (con su Content-Disposition)', png.mime === 'image/png' && /captura-banco/.test(png.disposition || ''));
    check('WebP', (await traer(U('/recibo.webp'))).mime === 'image/webp');
    check('gzip se descomprime', (await traer(U('/gzip.pdf'))).mime === 'application/pdf');
    check('⚠️ el tipo sale de los BYTES, no del Content-Type', (await traer(U('/mentira.pdf'))).mime === 'image/png');
    const h = vistos.find(v => v.url.startsWith('/pago.pdf'))?.headers || {};
    check('⚠️ no viajan cookies ni credenciales de Club Platform', !h.cookie && !h.authorization && !h.referer && /ClubPlatform-ReceiptImporter/.test(h['user-agent'] || ''));
}

grupo('2.2 Lo que no se acepta, con su motivo');
const motivo = async (p, extra) => (await traer(U(p), extra)).code;
check('ejecutable con nombre .pdf → formato no admitido', await motivo('/programa.pdf') === 'unsupported');
check('página de inicio de sesión → «página web, no el archivo»', await motivo('/login') === 'html');
check('403 → acceso restringido', await motivo('/privado.pdf') === 'restricted');
check('404 → no encontrado', await motivo('/no-esta.pdf') === 'not_found');
check('503 → no disponible', await motivo('/caido.pdf') === 'unavailable');
check('vacío', await motivo('/vacio.pdf') === 'empty');
{ const g = await traer(U('/gigante.pdf')); check('> 10 MB con Content-Length → demasiado grande', g.code === 'too_large', JSON.stringify(g)); }
check('> 10 MB SIN Content-Length → se corta igual', await motivo('/gigante-sin-largo.pdf', { totalTimeoutMs: 8000 }) === 'too_large');
check('lento → tope de tiempo', await motivo('/lento.pdf') === 'timeout');
check('host que no resuelve → no encontrado', (await traer(`https://no-existe.ejemplo:${PORT}/a.pdf`)).code === 'not_found');

grupo('2.3 Redirecciones');
{
    const salto = await traer(U('/salto'));
    check('una redirección relativa se sigue', salto.ok && salto.redirects === 1 && salto.mime === 'application/pdf');
    const espejo = await traer(U('/salto-espejo'));
    check('a otro host público se sigue (y se informa)', espejo.ok && /espejo\.test/.test(espejo.finalUrl));
    check('⚠️ a http:// NO se sigue', (await traer(U('/salto-http'))).code === 'blocked');
    check('⚠️ a 169.254.169.254 (metadatos) NO se sigue', (await traer(U('/salto-interno'))).code === 'blocked');
    check('⚠️ a localhost NO se sigue', (await traer(U('/salto-localhost'))).code === 'blocked');
    check('un bucle se corta', (await traer(U('/bucle'))).code === 'too_many_redirects');
}

grupo('2.4 La guarda REAL, sin permisos de prueba');
{
    const antes = vistos.length;
    const sinPermiso = await f.fetchReceiptFromUrl(U('/pago.pdf'), { testing: { ...TESTING, allowAddress: null } });
    check('⚠️ un nombre que resuelve a 127.0.0.1 → bloqueado', sinPermiso.code === 'blocked', JSON.stringify(sinPermiso));
    check('⚠️ …y no se llegó a conectar', vistos.length === antes);
    const literal = await f.fetchReceiptFromUrl(`https://127.0.0.1:${PORT}/pago.pdf`, { testing: { ...TESTING, allowAddress: null } });
    check('⚠️ la IP literal 127.0.0.1 → bloqueada', literal.code === 'blocked');
    check('sin opciones de prueba: otro puerto → bloqueado', (await f.fetchReceiptFromUrl(U('/pago.pdf'))).code === 'blocked');
}

// ════════════════════════════════════════════════════════════════════
// 3. EXTREMO A EXTREMO (Postgres real)
// ════════════════════════════════════════════════════════════════════
const E2E_DB = process.env.RECEIPT_IMPORT_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('\n[test:receipt-url-import] Sin RECEIPT_IMPORT_E2E_DATABASE_URL local: se omite la parte de extremo a extremo.');
} else {
    await extremoAExtremo();
}
servidor.close();
console.log(`\n${pasadas} comprobaciones pasaron${fallos.length ? `, ${fallos.length} FALLARON:` : '.'}`);
for (const x of fallos) console.log(`  ✗ ${x}`);
process.exit(fallos.length ? 1 : 0);

async function extremoAExtremo() {
    process.env.DATABASE_URL = E2E_DB;
    globalThis.__receiptFetchTesting = { ...TESTING, totalTimeoutMs: 5000 };
    const MAIL = new URL('./scripts/fixtures/email-completed-stub.mjs', HERE).href;
    const RECEIPTS = new URL('./scripts/fixtures/receipts-completed-stub.mjs', HERE).href;
    const FETCH = new URL('./scripts/fixtures/receipt-url-fetch-local.mjs', HERE).href;
    register(
        `data:text/javascript,
         const M=${JSON.stringify(MAIL)}, R=${JSON.stringify(RECEIPTS)}, F=${JSON.stringify(FETCH)};
         export async function resolve(s,c,n){
           if(/EmailService\\.js$/.test(s)) return {url:M,shortCircuit:true};
           if(/completedReceipts\\.js$/.test(s)) return {url:R,shortCircuit:true};
           if(/receiptUrlFetch\\.js$/.test(s)) return {url:F,shortCircuit:true};
           return n(s,c);
         }`,
        HERE
    );
    const require = createRequire(`${REPO}/package.json`);
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const { default: db } = await import(`${REPO}/server/lib/db.js`);
    const receipts = await import(RECEIPTS);
    const { JWT_SECRET, PLATFORM_AUDIENCE } = await import(`${REPO}/server/middleware/auth.js`);

    await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, "clubId" TEXT, metadata JSONB DEFAULT '{}')`);
    await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, logo TEXT, "footerLogo" TEXT)`);
    await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, phone TEXT, "clubId" TEXT, role TEXT)`);
    await db.query(`CREATE TABLE IF NOT EXISTS "ProjectFairAccount" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, email TEXT, "passwordHash" TEXT, "clubName" TEXT, "submissionId" TEXT)`);
    await db.query(`CREATE TABLE IF NOT EXISTS "ProjectFairSubmission" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, email TEXT, "firstName" TEXT, "lastName" TEXT, phone TEXT, "clubName" TEXT, district TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
    await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "startDate", "endDate", location, "clubId") VALUES
        ('ev-xiii','XIII Conferencia Rotaria del Distrito 4281 – Villavicencio 2027','villavicencio2027','2027-05-28','2027-05-30','Villavicencio, Meta, Colombia','club-4281'),
        ('ev-otro','Otro evento','otro-evento','2027-01-01','2027-01-01','Bogotá','club-4281')
        ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO "Club" (id, name) VALUES ('club-4281','Distrito 4281') ON CONFLICT DO NOTHING`);

    const { default: router } = await import(`${REPO}/server/routes/event-registrations.js`);
    const app = express();
    app.use('/api/event-registrations', router);
    const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const BASE = `http://127.0.0.1:${srv.address().port}/api/event-registrations`;
    const call = async (method, path, { token, body } = {}) => {
        const r = await fetch(`${BASE}${path}`, {
            method,
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await r.text();
        let data = null; try { data = JSON.parse(text); } catch { data = text; }
        return { status: r.status, data };
    };
    const admin = jwt.sign({ id: 'u-admin', email: 'registro@rotary4281.org', name: 'Equipo Registro', role: 'administrator' }, JWT_SECRET, { audience: PLATFORM_AUDIENCE });
    const ajeno = jwt.sign({ id: 'u-ajeno', email: 'otro@club.org', name: 'Otro club', role: 'club_admin', clubId: 'club-ajeno' }, JWT_SECRET, { audience: PLATFORM_AUDIENCE });

    // El esquema lo crea la primera petición.
    await call('GET', '/admin/completed/no-existe', { token: admin });

    const crear = async ({ eventId = 'ev-xiii', code, status = 'submitted', source = 'historical_import', email, doc, importUrl = null }) => {
        const { rows } = await db.query(
            `INSERT INTO "EventCompletedRegistration"
                ("eventId", "clubId", status, "registrationSource", "registrationCode", "firstName", "lastName",
                 "documentNumber", email, phone, district, "clubName", answers, flags, "importMeta")
             VALUES ($1,'club-4281',$2,$3,$4,'Kely Johana','Gonzalez Salazar',$5,$6,'+57 3103086447','4281',
                     'Honda Ciudad de los Puentes','{}','{}',$7)
             RETURNING *`,
            [eventId, status, source, code, doc, email, importUrl ? JSON.stringify({ receiptUrl: importUrl }) : null]);
        return rows[0];
    };
    const fila = async (id) => (await db.query(`SELECT * FROM "EventCompletedRegistration" WHERE id = $1`, [id])).rows[0];
    const hist = async (id, type = 'receipt_replaced') => (await db.query(
        `SELECT * FROM "EventRegistrationHistory" WHERE "registrationId" = $1 AND type = $2 ORDER BY "createdAt"`, [id, type])).rows;
    const pagos = async () => Number((await db.query(`SELECT COUNT(*)::int AS n FROM "EventRegistrationPayment"`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
    const sinCambiosDeNegocio = (a, b) => ['status', 'firstName', 'lastName', 'email', 'documentNumber', 'paymentMethod', 'linkedRegistrationId', 'checkedInAt', 'accountId']
        .every(k => String(a[k] ?? '') === String(b[k] ?? ''));

    // Dos registros de la MISMA persona (como en la captura: DAQRY pendiente
    // e histórico F5FTK), y uno con el pago ya confirmado.
    const historico = await crear({ code: 'RPF13-C-DAQRY', email: 'kely@example.com', doc: '65795554', importUrl: U('/pago.pdf?token=SECRETO-HISTORICO') });
    const gemelo = await crear({ code: 'RPF13-C-F5FTK', source: 'manual', email: 'kely@example.com', doc: '65795554' });
    const confirmado = await crear({ code: 'RPF13-C-PAGO1', status: 'payment_confirmed', source: 'manual', email: 'otro@example.com', doc: '1000' });
    const deOtroEvento = await crear({ eventId: 'ev-otro', code: 'OTRO-C-0001', source: 'manual', email: 'x@example.com', doc: '2000' });
    const pagosAntes = await pagos();

    grupo('3.1 Verificar no vincula nada');
    const P = (id) => `/admin/completed/${id}/receipt-import`;
    const ver = await call('POST', `${P(historico.id)}/verify`, { token: admin, body: { url: U('/pago.pdf?token=SECRETO-HISTORICO') } });
    check('verificar un PDF público → 200 con vista previa', ver.status === 200 && ver.data?.file?.typeLabel === 'PDF' && Boolean(ver.data?.previewUrl) && Boolean(ver.data?.stagedKey), JSON.stringify(ver.data).slice(0, 300));
    check('la copia vive en el prefijo privado del evento', String(ver.data?.stagedKey || '').startsWith('private/event-receipts/ev-xiii/'));
    check('…atada a ESTA inscripción', receipts.objetos.get(ver.data?.stagedKey)?.metadata?.['registration-id'] === historico.id);
    check('la inscripción sigue sin comprobante', !(await fila(historico.id)).receiptKey);

    grupo('3.2 Importar a una inscripción HISTÓRICA');
    const imp = await call('POST', P(historico.id), { token: admin, body: { url: U('/pago.pdf?token=SECRETO-HISTORICO'), name: 'Transferencia Kely', stagedKey: ver.data?.stagedKey } });
    const trasImp = await fila(historico.id);
    check('200 y el comprobante queda vinculado', imp.status === 200 && imp.data?.registration?.hasReceipt === true && trasImp.receiptKey === ver.data?.stagedKey, JSON.stringify(imp.data).slice(0, 300));
    check('con el nombre dado y la extensión real', trasImp.receiptName === 'Transferencia Kely.pdf' && trasImp.receiptMime === 'application/pdf');
    check('⚠️ el estado NO cambió (sigue «Pendiente de validación»)', trasImp.status === 'submitted' && sinCambiosDeNegocio(historico, trasImp));
    check('⚠️ ningún movimiento de pago', await pagos() === pagosAntes);
    const [h1] = await hist(historico.id);
    const p1 = typeof h1?.payload === 'string' ? JSON.parse(h1.payload) : h1?.payload;
    check('historial: quién, vía url_import, huella, host', h1?.actorName === 'Equipo Registro' && p1?.via === 'url_import'
        && /^[0-9a-f]{64}$/.test(p1?.next?.sha256 || '') && p1?.import?.sourceHost === 'comprobantes.test', JSON.stringify(p1).slice(0, 300));
    check('⚠️ el historial NO guarda el token del enlace', !JSON.stringify(h1).includes('SECRETO-HISTORICO') && /token=\*\*\*/.test(p1?.import?.sourceUrl || ''));
    check('el comentario nombra el host, no el enlace', /importó el comprobante «Transferencia Kely\.pdf» desde un enlace externo \(comprobantes\.test\)/.test(h1?.comment || ''));
    check('⚠️ el gemelo (mismo correo y documento) no cambió', sinCambiosDeNegocio(gemelo, await fila(gemelo.id)) && !(await fila(gemelo.id)).receiptKey);

    grupo('3.3 Visible en la ficha y disponible aunque el original desaparezca');
    {
        const d = await call('GET', `/admin/completed/${historico.id}`, { token: admin });
        check('la ficha lo muestra con su tipo', d.data?.registration?.hasReceipt === true && d.data?.registration?.receiptMime === 'application/pdf');
        check('la ficha trae el origen en el historial', (d.data?.history || []).some(h => h.type === 'receipt_replaced' && h.payload?.via === 'url_import'));
        borrados.add('/pago.pdf');
        const v = await call('GET', `/admin/completed/${historico.id}/receipt`, { token: admin });
        check('⚠️ el enlace original ya da 404 y el comprobante se sigue abriendo', v.status === 200 && /lectura-firmada/.test(v.data?.url || ''));
        const dl = await call('GET', `/admin/completed/${historico.id}/receipt?download=1`, { token: admin });
        check('…y se descarga', dl.status === 200 && /descarga/.test(dl.data?.url || ''));
        borrados.delete('/pago.pdf');
    }

    grupo('3.4 Duplicados');
    {
        const otra = await call('POST', P(historico.id), { token: admin, body: { url: U('/pago.pdf') } });
        check('el mismo archivo otra vez → 409 «Comprobante duplicado»', otra.status === 409 && otra.data?.code === 'duplicate' && /duplicado/i.test(otra.data?.error || ''));
        const verDup = await call('POST', `${P(historico.id)}/verify`, { token: admin, body: { url: U('/salto') } });
        check('…también por otro enlace que entrega el mismo archivo', verDup.status === 409 && verDup.data?.code === 'duplicate');
        const aGemelo = await call('POST', `${P(gemelo.id)}/verify`, { token: admin, body: { url: U('/pago.pdf') } });
        check('el mismo archivo en el gemelo → se permite, con aviso', aGemelo.status === 200 && (aGemelo.data?.warnings || []).some(w => /RPF13-C-DAQRY/.test(w)), JSON.stringify(aGemelo.data?.warnings));
    }

    grupo('3.5 Reemplazar conserva el anterior');
    {
        const r = await call('POST', P(historico.id), { token: admin, body: { url: U('/foto.jpg') } });
        const ahora = await fila(historico.id);
        check('JPG reemplaza al PDF', r.status === 200 && ahora.receiptMime === 'image/jpeg' && ahora.receiptName === 'foto.jpg');
        const hs = await hist(historico.id);
        const ultimo = hs[hs.length - 1];
        const pl = typeof ultimo.payload === 'string' ? JSON.parse(ultimo.payload) : ultimo.payload;
        check('el anterior queda en el historial', pl?.previous?.key === trasImp.receiptKey && receipts.objetos.has(trasImp.receiptKey));
        const anterior = await call('GET', `/admin/completed/${historico.id}/receipt?version=${ultimo.id}`, { token: admin });
        check('…y se puede abrir', anterior.status === 200 && anterior.data?.name === 'Transferencia Kely.pdf');
        check('el estado sigue igual', ahora.status === 'submitted');
    }

    grupo('3.6 PNG y WebP; una inscripción con el pago confirmado; otro evento');
    {
        const png = await call('POST', P(confirmado.id), { token: admin, body: { url: U('/captura.png') } });
        const c = await fila(confirmado.id);
        check('PNG con el nombre del servidor', png.status === 200 && c.receiptName === 'captura-banco.png' && c.receiptMime === 'image/png');
        check('⚠️ «Pago confirmado» sigue igual', c.status === 'payment_confirmed' && sinCambiosDeNegocio(confirmado, c));
        const webp = await call('POST', P(deOtroEvento.id), { token: admin, body: { url: U('/recibo.webp') } });
        const o = await fila(deOtroEvento.id);
        check('WebP en OTRO evento, bajo SU prefijo', webp.status === 200 && o.receiptMime === 'image/webp' && o.receiptKey.startsWith('private/event-receipts/ev-otro/'));
        check('⚠️ ningún movimiento de pago en todo el recorrido', await pagos() === pagosAntes);
    }

    grupo('3.7 Enlaces y archivos que se rechazan (y lo dicen)');
    {
        const caso = async (url) => call('POST', P(gemelo.id), { token: admin, body: { url } });
        const http = await caso('http://comprobantes.test/pago.pdf');
        check('http → «El enlace introducido no es válido»', http.status === 422 && http.data?.code === 'invalid_url' && /no es válido/.test(http.data?.error));
        check('metadatos (169.254.169.254) → bloqueado', (await caso('https://169.254.169.254/latest/meta-data/')).data?.code === 'blocked');
        check('red privada (10.0.0.1) → bloqueado', (await caso('https://10.0.0.1/a.pdf')).data?.code === 'blocked');
        check('localhost → bloqueado', (await caso('https://localhost/a.pdf')).data?.code === 'blocked');
        const priv = await caso(U('/privado.pdf'));
        check('privado → «Descárgalo … y utiliza «Subir comprobante»»', priv.data?.code === 'restricted' && /Subir comprobante/.test(priv.data?.error));
        check('ejecutable → formato no admitido', (await caso(U('/programa.pdf'))).data?.code === 'unsupported');
        check('página HTML → no es el archivo', (await caso(U('/login'))).data?.code === 'html');
        check('demasiado grande', (await caso(U('/gigante.pdf'))).data?.code === 'too_large');
        check('no encontrado', (await caso(U('/no-esta.pdf'))).data?.code === 'not_found');
        const g = await fila(gemelo.id);
        check('⚠️ nada de eso tocó la inscripción', !g.receiptKey && sinCambiosDeNegocio(gemelo, g));
        check('los intentos fallidos quedan en el historial (sin el token)', (await hist(gemelo.id, 'receipt_import_failed')).length >= 5);
    }

    grupo('3.8 Error de almacenamiento: nada a medias');
    {
        receipts.fallarGuardado();
        const r = await call('POST', P(gemelo.id), { token: admin, body: { url: U('/recibo.webp') } });
        check('→ 502 «No fue posible guardar el archivo»', r.status === 502 && r.data?.code === 'storage');
        check('⚠️ la inscripción no quedó con un comprobante roto', !(await fila(gemelo.id)).receiptKey);
    }

    grupo('3.9 Una copia en espera sólo sirve para SU inscripción y SU enlace');
    {
        const v = await call('POST', `${P(gemelo.id)}/verify`, { token: admin, body: { url: U('/recibo.webp') } });
        const robo = await call('POST', P(confirmado.id), { token: admin, body: { url: U('/recibo.webp'), stagedKey: v.data?.stagedKey } });
        check('⚠️ otra inscripción no la reclama', robo.status === 422 && robo.data?.code === 'staged');
        const otroEnlace = await call('POST', P(gemelo.id), { token: admin, body: { url: U('/captura.png'), stagedKey: v.data?.stagedKey } });
        check('cambiar el enlace después de verificar → verificar de nuevo', otroEnlace.data?.code === 'staged');
        const ajena = await call('POST', P(gemelo.id), { token: admin, body: { url: U('/recibo.webp'), stagedKey: 'private/event-receipts/ev-otro/x.webp' } });
        check('una clave de otro evento → no', ajena.data?.code === 'staged');
        const ok = await call('POST', P(gemelo.id), { token: admin, body: { url: U('/recibo.webp'), stagedKey: v.data?.stagedKey } });
        check('la suya, sí', ok.status === 200 && (await fila(gemelo.id)).receiptKey === v.data?.stagedKey);
    }

    grupo('3.10 Permisos');
    {
        const sin = await call('POST', P(historico.id), { body: { url: U('/pago.pdf') } });
        check('sin sesión → 401', sin.status === 401);
        const otro = await call('POST', `${P(historico.id)}/verify`, { token: ajeno, body: { url: U('/recibo.webp') } });
        check('⚠️ un administrador de OTRO sitio → «Registro no encontrado»', otro.status === 404);
    }

    srv.close();
    await db.end?.();
}
