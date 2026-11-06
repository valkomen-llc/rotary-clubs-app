#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Subir o reemplazar el comprobante de una inscripción completada — v4.1291
//
//   npm run test:completed:receipt
//   COMPLETED_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:completed:receipt
//
// 1. CRITERIO (siempre, sin base ni red): cuándo puede el participante, qué
//    dice el historial, que la vista del participante no ve claves ni el
//    archivo anterior, y las guardas del código (rutas, permisos, un solo
//    camino para las dos puertas).
//
// 2. EXTREMO A EXTREMO (sólo con COMPLETED_E2E_DATABASE_URL a localhost):
//    Postgres REAL + el router REAL, por HTTP, con el panel (token de la
//    plataforma) y con «Mis eventos» (token del asistente). El S3 es el doble
//    de `test:completed:path`, que conserva el criterio REAL de las claves.
//
// ⚠️ La parte 2 ESCRIBE en la base que se le dé: exige localhost y una base
// VACÍA y desechable. Nunca lee DATABASE_URL.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
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

// ════════════════════════════════════════════════════════════════════
// 1. CRITERIO
// ════════════════════════════════════════════════════════════════════
const spec = await import('../server/lib/completedRegistrationSpec.js');

grupo('1.1 El participante puede mientras nadie haya resuelto la inscripción');
check('pendiente de validación: sí', spec.canParticipantReplaceReceipt('submitted'));
check('requiere corrección: sí', spec.canParticipantReplaceReceipt('needs_correction'));
for (const st of ['validated', 'payment_confirmed', 'rejected']) {
    check(`«${spec.completedStatusMeta(st).label}»: NO`, !spec.canParticipantReplaceReceipt(st));
    check(`…y se le dice por qué, con salida (el Equipo de Registro)`, /Equipo de Registro/.test(spec.participantReceiptLock(st) || ''));
}
check('un estado desconocido no abre la puerta', !spec.canParticipantReplaceReceipt('inventado') && !spec.canParticipantReplaceReceipt(undefined));
check('si puede, no hay candado', spec.participantReceiptLock('submitted') === null);

grupo('1.2 El historial');
check('primera subida', spec.describeReceiptChange({ nextName: 'pago.pdf', via: 'participant' }) === 'El participante subió el comprobante «pago.pdf».');
check('reemplazo por el equipo nombra los dos archivos',
    spec.describeReceiptChange({ previousName: 'viejo.pdf', nextName: 'nuevo.png', via: 'team' }) === 'El Equipo de Registro reemplazó el comprobante «viejo.pdf» por «nuevo.png».');
{
    const e = spec.participantHistoryEntry({
        id: 'h1', type: 'receipt_replaced', createdAt: 'x', comment: 'El Equipo de Registro reemplazó el comprobante «viejo.pdf» por «nuevo.png».',
        payload: { previous: { key: 'private/event-receipts/ev/abc.pdf' } },
    });
    check('el participante ve que se actualizó', e?.label === 'Comprobante de pago actualizado');
    check('⚠️ …sin el comentario ni la clave del anterior', e && e.comment === null && !JSON.stringify(e).includes('private/event-receipts'));
}

grupo('1.3 Guardas del código');
const rutas = leer('server/routes/event-registrations.js');
check('el panel prepara la subida', /router\.post\('\/admin\/completed\/:id\/receipt-url', authMiddleware/.test(rutas));
check('el panel confirma el reemplazo', /router\.put\('\/admin\/completed\/:id\/receipt', authMiddleware/.test(rutas));
check('el participante, con SU permiso', /\/portal\/completed\/:id\/receipt-url', attendeeAuth[\s\S]{0,80}UPDATE_OWN_RECEIPT/.test(rutas)
    && /\/portal\/completed\/:id\/receipt', attendeeAuth[\s\S]{0,80}UPDATE_OWN_RECEIPT/.test(rutas));
const att = leer('server/controllers/eventAttendeeController.js');
const roles = att.slice(att.indexOf('const ROLE_PERMISSIONS'), att.indexOf('export const permissionsFor'));
const suspendida = roles.slice(roles.indexOf('SUSPENDED]'));
check('el asistente lo tiene', /ATTENDEE\]:[\s\S]*UPDATE_OWN_RECEIPT[\s\S]*SUSPENDED\]/.test(roles));
check('⚠️ una cuenta suspendida NO', !/UPDATE_OWN_RECEIPT/.test(suspendida));
check('la pertenencia va en el WHERE (loadOwnCompletedRow)', /loadOwnEditableCompleted[\s\S]{0,300}loadOwnCompletedRow\(req\.params\.id, req\.attendee\.account\.id\)/.test(att));
const adm = leer('server/controllers/completedRegistrationAdminController.js');
check('el panel pasa por la capacidad del evento (loadDetail)',
    /export const receiptUploadUrl[\s\S]{0,200}loadDetail\(req, res\)/.test(adm) && /export const replaceReceipt[\s\S]{0,200}loadDetail\(req, res\)/.test(adm));
check('⚠️ UN solo camino: las dos puertas llaman a replaceCompletedReceipt',
    /replaceCompletedReceipt\(/.test(adm) && /replaceCompletedReceipt\(/.test(att));
const cambio = leer('server/lib/completedReceiptChange.js');
check('⚠️ reemplazar NO borra el anterior de S3', !/deleteReceiptObject/.test(cambio));
check('…ni cambia el estado', !/status\s*=/.test(cambio));
check('se comprueba el objeto REAL', /headReceipt\(key\)/.test(cambio) && /receiptKeyBelongs\(key, eventId\)/.test(cambio));

// ════════════════════════════════════════════════════════════════════
// 2. EXTREMO A EXTREMO (Postgres real)
// ════════════════════════════════════════════════════════════════════
const E2E_DB = process.env.COMPLETED_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB) && !/host=\/[^&]+/.test(E2E_DB)) {
    console.log('\n[test:completed:receipt] Sin COMPLETED_E2E_DATABASE_URL local: se omite la parte de extremo a extremo.');
    terminar();
} else {
    await extremoAExtremo();
    terminar();
}

function terminar() {
    console.log(`\n${pasadas} comprobaciones pasaron${fallos.length ? `, ${fallos.length} FALLARON:` : '.'}`);
    for (const f of fallos) console.log(`  ✗ ${f}`);
    process.exit(fallos.length ? 1 : 0);
}

async function extremoAExtremo() {
    process.env.DATABASE_URL = E2E_DB;
    const MAIL = new URL('./scripts/fixtures/email-completed-stub.mjs', HERE).href;
    const RECEIPTS = new URL('./scripts/fixtures/receipts-completed-stub.mjs', HERE).href;
    register(
        `data:text/javascript,
         const M=${JSON.stringify(MAIL)}, R=${JSON.stringify(RECEIPTS)};
         export async function resolve(s,c,n){
           if(/EmailService\\.js$/.test(s)) return {url:M,shortCircuit:true};
           if(/completedReceipts\\.js$/.test(s)) return {url:R,shortCircuit:true};
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
    const SLUG = 'inscripcion-conferencia-distrital-villavicencio-2027';

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
    // «Subir» con el doble: la URL prefirmada es real del servidor; el PUT a
    // S3 se simula sembrando el objeto bajo la clave que el servidor eligió.
    const subir = async (prefijo, token, { name = 'pago.pdf', bytes = 150000, mime = 'application/pdf' } = {}) => {
        const prep = await call('POST', `${prefijo}/receipt-url`, { token, body: { filename: name, contentType: mime, size: bytes } });
        if (prep.status !== 200) return { prep };
        receipts.objetos.set(prep.data.key, { bytes, mime });
        const conf = await call('PUT', `${prefijo}/receipt`, { token, body: { receipt: { key: prep.data.key, name, contentType: mime } } });
        return { prep, conf, key: prep.data.key };
    };
    const fila = async (id) => (await db.query(`SELECT * FROM "EventCompletedRegistration" WHERE id = $1`, [id])).rows[0];
    const historial = async (id) => (await db.query(
        `SELECT * FROM "EventRegistrationHistory" WHERE "registrationId" = $1 AND type = 'receipt_replaced' ORDER BY "createdAt"`, [id])).rows;
    const admin = jwt.sign({ id: 'u-admin', email: 'registro@rotary4281.org', name: 'Equipo Registro', role: 'administrator' }, JWT_SECRET, { audience: PLATFORM_AUDIENCE });

    // La configuración siembra el slug; un envío real crea el registro con cuenta.
    await call('GET', `/public/completed/${SLUG}`);
    let n = 0;
    const enviar = async (email, { password } = {}) => {
        const key = `private/event-receipts/ev-xiii/original-${++n}.pdf`;
        receipts.objetos.set(key, { bytes: 90000, mime: 'application/pdf' });
        return call('POST', `/public/completed/${SLUG}`, {
            body: {
                answers: {
                    firstName: 'Yaneth', lastName: 'Solano', documentNumber: `6332${n}017`, email,
                    phone: '3124285126', district: '4281', clubName: 'Bogotá Multicentro',
                    membershipType: 'socio_activo', clubRole: 'presidente_electo', eps: 'Sanitas', foodAllergy: 'No',
                    emergencyName: 'Luis Oscar Solano', emergencyPhone: '573124366162', paymentMethod: 'pasarela_colrotarios',
                },
                receipt: { key, name: `original-${n}.pdf`, contentType: 'application/pdf' },
                submissionKey: `k-${n}`,
                ...(password ? { password, passwordConfirm: password } : {}),
            },
        });
    };

    const env = await enviar('yaneth@club.org', { password: 'Rotary2027!' });
    const token = env.data?.session?.token || '';
    const id = (await db.query(`SELECT id FROM "EventCompletedRegistration" WHERE email = 'yaneth@club.org'`)).rows[0]?.id;
    grupo('2.0 Punto de partida');
    check('la inscripción existe con su comprobante y su cuenta', env.status === 201 && Boolean(token) && Boolean(id), JSON.stringify(env.data).slice(0, 200));

    grupo('2.1 El participante reemplaza su comprobante desde «Mis eventos»');
    {
        const antes = await fila(id);
        const d0 = await call('GET', `/portal/completed/${id}`, { token });
        check('la ficha le ofrece reemplazarlo', d0.data?.canReplaceReceipt === true && d0.data?.receiptLock === null);
        const { prep, conf, key } = await subir(`/portal/completed/${id}`, token, { name: 'pago-avalpay.png', mime: 'image/png', bytes: 210000 });
        check('la subida se prepara en el prefijo de SU evento', prep.status === 200 && prep.data.key.startsWith('private/event-receipts/ev-xiii/'));
        check('el reemplazo se confirma', conf?.status === 200 && conf.data?.receiptName === 'pago-avalpay.png', JSON.stringify(conf?.data).slice(0, 200));
        const despues = await fila(id);
        check('la inscripción apunta al nuevo', despues.receiptKey === key && despues.receiptName === 'pago-avalpay.png'
            && Number(despues.receiptBytes) === 210000 && despues.receiptMime === 'image/png');
        check('⚠️ el estado NO cambió', despues.status === antes.status);
        check('⚠️ el anterior sigue en S3', receipts.objetos.has(antes.receiptKey));
        const h = await historial(id);
        check('el historial lo dice, con quién y el archivo anterior', h.length === 1
            && h[0].comment === `El participante reemplazó el comprobante «${antes.receiptName}» por «pago-avalpay.png».`
            && h[0].payload?.previous?.key === antes.receiptKey && h[0].payload?.via === 'participant');
        check('la respuesta trae la ficha actualizada sin claves', !JSON.stringify(conf.data).includes('private/event-receipts')
            && conf.data?.history?.some(x => x.type === 'receipt_replaced'));
        const rc = await call('GET', `/portal/completed/${id}/receipt`, { token });
        check('y al abrirlo ve el NUEVO', rc.status === 200 && rc.data?.url?.includes(key));
    }

    grupo('2.2 Lo que el servidor rechaza');
    {
        const ajeno = await call('PUT', `/portal/completed/${id}/receipt`, { token, body: { receipt: { key: 'private/event-receipts/ev-otro/x.pdf', name: 'x.pdf' } } });
        check('una clave de OTRO evento', ajeno.status === 422 && /no corresponde/.test(ajeno.data?.error || ''));
        const fantasma = await call('PUT', `/portal/completed/${id}/receipt`, { token, body: { receipt: { key: 'private/event-receipts/ev-xiii/nunca-subido.pdf', name: 'n.pdf' } } });
        check('un objeto que nunca subió', fantasma.status === 422 && /No encontramos/.test(fantasma.data?.error || ''));
        receipts.objetos.set('private/event-receipts/ev-xiii/gigante.pdf', { bytes: 30 * 1024 * 1024, mime: 'application/pdf' });
        const gigante = await call('PUT', `/portal/completed/${id}/receipt`, { token, body: { receipt: { key: 'private/event-receipts/ev-xiii/gigante.pdf', name: 'g.pdf' } } });
        check('un objeto de más de 10 MB', gigante.status === 422 && /máximo es 10 MB/.test(gigante.data?.error || ''));
        const tipo = await call('POST', `/portal/completed/${id}/receipt-url`, { token, body: { filename: 'virus.exe', contentType: 'application/x-msdownload', size: 1000 } });
        check('un tipo que no es comprobante, antes de subir', tipo.status === 422);
        // Otra inscripción (otra persona) no puede reclamar el archivo de ésta.
        const otra = await enviar('otra@club.org', { password: 'OtraClave2027!' });
        const tokenOtra = otra.data?.session?.token;
        const idOtra = (await db.query(`SELECT id FROM "EventCompletedRegistration" WHERE email = 'otra@club.org'`)).rows[0]?.id;
        const robada = await call('PUT', `/portal/completed/${idOtra}/receipt`, { token: tokenOtra, body: { receipt: { key: (await fila(id)).receiptKey, name: 'robado.pdf' } } });
        check('el archivo de OTRA inscripción', robada.status === 409 && /otra inscripción/.test(robada.data?.error || ''));
        const cruzada = await call('POST', `/portal/completed/${id}/receipt-url`, { token: tokenOtra, body: { filename: 'a.pdf', contentType: 'application/pdf', size: 1000 } });
        check('⚠️ la inscripción de OTRA cuenta «no existe»', cruzada.status === 404);
        const cruzadaPut = await call('PUT', `/portal/completed/${id}/receipt`, { token: tokenOtra, body: { receipt: { key: 'private/event-receipts/ev-xiii/x.pdf' } } });
        check('⚠️ …tampoco para confirmar', cruzadaPut.status === 404);
        const sinSesion = await call('POST', `/portal/completed/${id}/receipt-url`, { body: { filename: 'a.pdf', contentType: 'application/pdf', size: 1000 } });
        check('sin sesión, nada', sinSesion.status === 401);
        const conPanel = await call('POST', `/portal/completed/${id}/receipt-url`, { token: admin, body: { filename: 'a.pdf', contentType: 'application/pdf', size: 1000 } });
        check('el token del panel no sirve en «Mis eventos»', [401, 403].includes(conPanel.status));
        check('ninguno de los rechazos tocó la inscripción', (await historial(id)).length === 1);
    }

    grupo('2.3 El Equipo de Registro sube y reemplaza desde la ficha');
    {
        // Un registro sin comprobante (p. ej. una importación histórica).
        const { rows } = await db.query(`INSERT INTO "EventCompletedRegistration" ("eventId", email, "firstName", "lastName", status, "registrationCode", "paymentMethod")
            VALUES ('ev-xiii','sin@club.org','Sin','Comprobante','submitted','CR4281-2027-SIN01','transferencia') RETURNING id`);
        const sinId = rows[0].id;
        const sinToken = await call('POST', `/admin/completed/${sinId}/receipt-url`, { body: { filename: 'a.pdf', contentType: 'application/pdf', size: 1000 } });
        check('sin sesión del panel, nada', sinToken.status === 401);
        const primera = await subir(`/admin/completed/${sinId}`, admin, { name: 'transferencia.pdf' });
        check('el equipo sube el primero', primera.conf?.status === 200 && primera.conf.data?.registration?.hasReceipt === true, JSON.stringify(primera.conf?.data || primera.prep?.data).slice(0, 200));
        const h1 = await historial(sinId);
        check('el historial dice «subió», con el nombre del equipo', h1.length === 1 && h1[0].comment === 'El Equipo de Registro subió el comprobante «transferencia.pdf».'
            && h1[0].actorName === 'Equipo Registro' && h1[0].payload?.previous === null);
        const segunda = await subir(`/admin/completed/${sinId}`, admin, { name: 'transferencia-2.pdf' });
        check('y lo reemplaza', segunda.conf?.status === 200 && (await historial(sinId)).length === 2);
        const hSin = await historial(sinId);

        // Validado: el participante ya no puede; el equipo sí.
        await db.query(`UPDATE "EventCompletedRegistration" SET status = 'validated' WHERE id = $1`, [id]);
        const d = await call('GET', `/portal/completed/${id}`, { token });
        check('validada: la ficha del participante ya no lo ofrece y dice por qué',
            d.data?.canReplaceReceipt === false && /Validado/.test(d.data?.receiptLock || ''));
        const bloqueada = await call('POST', `/portal/completed/${id}/receipt-url`, { token, body: { filename: 'a.pdf', contentType: 'application/pdf', size: 1000 } });
        check('⚠️ y el servidor lo niega (409 con el motivo)', bloqueada.status === 409 && /Equipo de Registro/.test(bloqueada.data?.error || ''));
        const vigente = (await fila(id)).receiptKey;
        const eq = await subir(`/admin/completed/${id}`, admin, { name: 'soporte-corregido.pdf' });
        check('el equipo sí lo reemplaza en una validada', eq.conf?.status === 200 && (await fila(id)).receiptName === 'soporte-corregido.pdf');
        check('⚠️ y sigue validada', (await fila(id)).status === 'validated');
        const h2 = await historial(id);
        check('el historial tiene los dos reemplazos, en orden', h2.length === 2 && h2[1].payload?.previous?.key === vigente && h2[1].payload?.via === 'team');

        grupo('2.4 El panel abre el comprobante ANTERIOR desde el historial');
        const v = await call('GET', `/admin/completed/${id}/receipt?version=${h2[1].id}`, { token: admin });
        check('abre el que estaba vigente antes de ese reemplazo', v.status === 200 && v.data?.url?.includes(vigente) && v.data?.name === 'pago-avalpay.png');
        const v0 = await call('GET', `/admin/completed/${id}/receipt?version=${h2[0].id}`, { token: admin });
        check('y el original del envío', v0.status === 200 && v0.data?.url?.includes('original-1.pdf'));
        // Una entrada de OTRA inscripción del MISMO evento, CON archivo anterior:
        // sólo la condición sobre el registro impide firmarlo.
        const ajena = await call('GET', `/admin/completed/${id}/receipt?version=${hSin[1].id}`, { token: admin });
        check('⚠️ un id de historial de OTRA inscripción no firma nada', ajena.status === 404);
        const actual = await call('GET', `/admin/completed/${id}/receipt`, { token: admin });
        check('sin versión, el vigente', actual.status === 200 && actual.data?.name === 'soporte-corregido.pdf');
        const vista = await call('GET', `/portal/completed/${id}`, { token });
        check('el participante ve «Comprobante de pago actualizado» sin nombres de archivos anteriores',
            vista.data?.history?.filter(x => x.type === 'receipt_replaced').length === 2
            && !JSON.stringify(vista.data?.history).includes('pago-avalpay.png'));
    }

    grupo('2.5 Un administrador de OTRO sitio no alcanza la ficha');
    {
        const ajeno = jwt.sign({ id: 'u-ajeno', email: 'admin@otroclub.org', role: 'club_admin', clubId: 'club-otro' }, JWT_SECRET, { audience: PLATFORM_AUDIENCE });
        const p = await call('POST', `/admin/completed/${id}/receipt-url`, { token: ajeno, body: { filename: 'a.pdf', contentType: 'application/pdf', size: 1000 } });
        check('preparar: «no existe»', p.status === 404, JSON.stringify(p.data));
        const c = await call('PUT', `/admin/completed/${id}/receipt`, { token: ajeno, body: { receipt: { key: 'private/event-receipts/ev-xiii/x.pdf' } } });
        check('confirmar: «no existe»', c.status === 404);
        check('y nada cambió', (await historial(id)).length === 2);
    }

    srv.close();
    await db.pool.end();
}
