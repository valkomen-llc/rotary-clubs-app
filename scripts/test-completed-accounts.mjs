#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// La cuenta del participante en «Completar inscripción» — v4.1267.0
//
//   npm run test:completed:accounts
//   COMPLETED_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:completed:accounts
//
// Dos partes:
//
// 1. CRITERIO (siempre, sin base ni red): la política de contraseñas, las
//    etapas que ve el participante, el historial que se le muestra, la
//    paridad con el espejo del navegador y las guardas del código (la
//    contraseña nunca entra en el borrador, la columna está en el atajo…).
//
// 2. EXTREMO A EXTREMO (sólo con COMPLETED_E2E_DATABASE_URL a localhost):
//    Postgres REAL + el router REAL del módulo; el correo y el S3 de los
//    comprobantes se sustituyen con los dobles de `test:completed:path`. Recorre
//    los doce escenarios del pedido del Distrito.
//
// ⚠️ La parte 2 ESCRIBE en la base que se le dé: exige localhost y una base
// VACÍA y desechable. Nunca lee DATABASE_URL.
// ════════════════════════════════════════════════════════════════════
import { readFileSync, unlinkSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

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

grupo('1.1 El modo de cuentas vive en la configuración del evento');
check('por omisión se OFRECE (optional)', spec.normalizeCompletedConfig({}).accountMode === 'optional');
check('una configuración anterior (sin la clave) queda en optional', spec.normalizeCompletedConfig({ enabled: true }).accountMode === 'optional');
check('required y off se respetan',
    spec.normalizeCompletedConfig({ accountMode: 'required' }).accountMode === 'required'
    && spec.normalizeCompletedConfig({ accountMode: 'off' }).accountMode === 'off');
check('un valor inventado cae al de omisión', spec.normalizeCompletedConfig({ accountMode: 'obligatorio' }).accountMode === 'optional');

grupo('1.2 La contraseña');
check('en optional, las dos vacías no son error', Object.keys(spec.validateAccessPassword('', '', { allowEmpty: true })).length === 0);
check('en optional, una sola escrita sí lo es', Boolean(spec.validateAccessPassword('secreta123', '', { allowEmpty: true }).passwordConfirm));
check('menos de 8 caracteres no pasa', /8 caracteres/.test(spec.validateAccessPassword('corta', 'corta').password || ''));
check('si no coinciden se dice', spec.validateAccessPassword('secreta123', 'secreta124').passwordConfirm === 'Las contraseñas no coinciden.');
check('8 caracteres que coinciden pasan', Object.keys(spec.validateAccessPassword('secreta1', 'secreta1')).length === 0);

grupo('1.3 Las etapas que ve el participante salen del estado REAL');
{
    const pend = spec.participantStages('submitted');
    check('recibido siempre cumplido', pend[0].done === true && pend[0].label === 'Registro recibido');
    check('pendiente de revisión es la etapa actual', pend[1].current === true && pend[1].done === false);
    check('el resultado todavía no se afirma', pend[2].done === false);
    const val = spec.participantStages('validated');
    check('validado: las tres cumplidas', val.every(s => s.done) && val[2].label === 'Validado');
    check('pago confirmado se dice así', spec.participantStages('payment_confirmed')[2].label === 'Pago confirmado');
    check('requiere corrección se distingue', spec.participantStages('needs_correction')[2].key === 'needs_correction');
}

grupo('1.4 El historial del participante es una lista CERRADA');
{
    const e = (type, extra = {}) => spec.participantHistoryEntry({ id: '1', type, createdAt: 'x', ...extra });
    check('el envío se muestra', e('completed_submitted')?.label === 'Inscripción enviada');
    check('la vinculación se muestra', e('account_linked')?.label === 'Inscripción vinculada a tu cuenta');
    check('un duplicado (trabajo del panel) NO', e('duplicate_flagged') === null);
    check('una edición del equipo NO', e('completed_edited') === null);
    check('una importación NO', e('imported') === null);
    const corr = e('completed_status_changed', { toStatus: 'needs_correction', comment: 'El comprobante está borroso.' });
    check('el motivo de una corrección SÍ le llega', corr?.comment === 'El comprobante está borroso.');
    const auto = e('completed_status_changed', { toStatus: 'validated', comment: 'Cambio manual a "Validado"' });
    check('el comentario automático no se muestra como motivo', auto?.comment === null && /Validado/.test(auto?.label));
}

grupo('1.5 El espejo del navegador dice lo mismo');
{
    const archivo = `${REPO}/scripts/.tmp-accounts-mirror-${process.pid}.mjs`;
    await build({
        entryPoints: [`${REPO}/src/lib/completedRegistrationSpec.ts`],
        bundle: true, format: 'esm', platform: 'neutral', outfile: archivo, logLevel: 'silent',
    });
    let ts;
    try { ts = await import(pathToFileURL(archivo).href); }
    finally { try { unlinkSync(archivo); } catch { /* ya no está */ } }
    const casos = [['', '', true], ['', '', false], ['abc', 'abc', false], ['secreta123', 'secreta12', false],
        ['secreta123', 'secreta123', false], ['secreta123', '', true]];
    check('validateAccessPassword devuelve lo mismo en los dos lados',
        casos.every(([a, b, e]) => JSON.stringify(ts.validateAccessPassword(a, b, { allowEmpty: e }))
            === JSON.stringify(spec.validateAccessPassword(a, b, { allowEmpty: e }))));
    check('el mínimo es el mismo', ts.ACCESS_PASSWORD_MIN === spec.ACCESS_PASSWORD_MIN);
}

grupo('1.6 Guardas del código');
{
    const ensure = leer('server/lib/ensureEventRegistrationSchema.js');
    check('accountId y submissionKey están ENUMERADAS en el atajo (trampa v4.908)',
        /OWNED_COMPLETED_COLUMNS = \[[^\]]*'accountId'[^\]]*'submissionKey'/.test(ensure));
    check('y tienen su ADD COLUMN', /addColumn\('EventCompletedRegistration', 'accountId'/.test(ensure)
        && /addColumn\('EventCompletedRegistration', 'submissionKey'/.test(ensure));
    check('la clave de envío es única por evento', /EventCompletedRegistration_submission_uniq/.test(ensure));

    const form = leer('src/pages/CompletarInscripcion.tsx');
    const draftDecl = form.slice(form.indexOf('interface Draft'), form.indexOf('const draftKey'));
    check('el borrador NO declara contraseña', !/password/i.test(draftDecl));
    // v4.1268 — el borrador también lleva el paso y la INTENCIÓN de crear
    // cuenta (un booleano); la contraseña sigue fuera.
    {
        const m = /const value: Draft = \{([^}]*)\}/.exec(form);
        check('el borrador se arma sin las credenciales',
            Boolean(m) && !/password|credential/i.test(m[1]) && /answers/.test(m[1]), m?.[1]);
    }
    check('la sección de acceso es un componente de NIVEL SUPERIOR (no pierde el foco)',
        /\nconst AccessSection = \(/.test(form));
    check('el texto introductorio pedido', form.includes('Con tu cuenta podrás consultar el estado de tu inscripción, verificar tus comprobantes'));

    const attendee = leer('server/controllers/eventAttendeeController.js');
    check('una cuenta sin contraseña elegida NO se estrena desde el formulario',
        /passwordHash === UNUSABLE_HASH\) \{\s*\/\/ Vinculada[\s\S]{0,200}return \{ outcome: 'exists'/.test(attendee));
    check('el panel filtra los registros por cuenta EN EL WHERE',
        /WHERE c\.id = \$1 AND c\."accountId" = \$2/.test(attendee));
    const ctrl = leer('server/controllers/completedRegistrationController.js');
    check('crear la cuenta no toca el estado: el insert sigue naciendo submitted',
        /'submitted', COMPLETED_SOURCE/.test(leer('server/lib/completedRegistrationStore.js'))
        && !/status\s*=\s*'validated'/.test(ctrl));
}

// ════════════════════════════════════════════════════════════════════
// 2. EXTREMO A EXTREMO (Postgres real)
// ════════════════════════════════════════════════════════════════════
const E2E_DB = process.env.COMPLETED_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB) && !/host=\/[^&]+/.test(E2E_DB)) {
    console.log('\n[test:completed:accounts] Sin COMPLETED_E2E_DATABASE_URL local: se omite la parte de extremo a extremo.');
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
    const mail = await import(MAIL);
    const receipts = await import(RECEIPTS);

    // Tablas mínimas de la plataforma que el módulo consulta.
    await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, "clubId" TEXT, metadata JSONB DEFAULT '{}')`);
    await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, logo TEXT, "footerLogo" TEXT)`);
    await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, phone TEXT, "clubId" TEXT)`);
    await db.query(`CREATE TABLE IF NOT EXISTS "ProjectFairAccount" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, email TEXT, "passwordHash" TEXT, "clubName" TEXT, "submissionId" TEXT)`);
    await db.query(`CREATE TABLE IF NOT EXISTS "ProjectFairSubmission" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, email TEXT, "firstName" TEXT, "lastName" TEXT, phone TEXT, "clubName" TEXT, district TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
    await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "startDate", "endDate", location, "clubId") VALUES
        ('ev-xiii','XIII Conferencia Rotaria del Distrito 4281 – Villavicencio 2027','villavicencio2027','2027-05-28','2027-05-30','Villavicencio, Meta, Colombia','club-4281')
        ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO "Club" (id, name) VALUES ('club-4281','Distrito 4281') ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO "ProjectFairAccount" (email, "passwordHash", "clubName") VALUES ('gestor@club.org', '$2a$10$abcdefghijklmnopqrstuv', 'Club Neiva') ON CONFLICT DO NOTHING`);

    const { default: router } = await import(`${REPO}/server/routes/event-registrations.js`);
    const app = express();
    app.use('/api/event-registrations', router);
    const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const BASE = `http://127.0.0.1:${srv.address().port}/api/event-registrations`;
    const SLUG = 'inscripcion-conferencia-distrital-villavicencio-2027';

    const call = async (method, path, { token, body, headers = {} } = {}) => {
        const r = await fetch(`${BASE}${path}`, {
            method,
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await r.text();
        let data = null; try { data = JSON.parse(text); } catch { data = text; }
        return { status: r.status, data };
    };
    let n = 0;
    const comprobante = () => {
        const key = `private/event-receipts/ev-xiii/recibo-${++n}.pdf`;
        receipts.objetos.set(key, { bytes: 120000, mime: 'application/pdf' });
        return { key, name: `recibo-${n}.pdf`, contentType: 'application/pdf' };
    };
    const respuestas = (email, extra = {}) => ({
        firstName: 'Daniel', lastName: 'Yazo', documentNumber: `1116${String(Math.random()).slice(2, 8)}`,
        email, phone: '+57 3158372895', district: '4281', clubName: 'E-Club Origen',
        membershipType: 'socio_activo', clubRole: 'presidente_electo', eps: 'Sanitas', foodAllergy: 'Ninguno',
        emergencyName: 'María', emergencyPhone: '+57 3000000000', paymentMethod: 'transferencia', ...extra,
    });
    const enviar = (email, { password, passwordConfirm, token, submissionKey, extra } = {}) => call('POST', `/public/completed/${SLUG}`, {
        token,
        body: {
            answers: respuestas(email, extra), receipt: comprobante(),
            submissionKey: submissionKey || `k-${Math.random().toString(36).slice(2)}`,
            ...(password !== undefined ? { password, passwordConfirm: passwordConfirm ?? password } : {}),
        },
    });
    const filas = async (email) => (await db.query(
        `SELECT * FROM "EventCompletedRegistration" WHERE lower(email) = $1 ORDER BY "createdAt"`, [email])).rows;
    const cuentas = async (email) => (await db.query(
        `SELECT * FROM "EventAttendeeAccount" WHERE lower(email) = $1`, [email])).rows;

    // La configuración siembra el slug y crea las tablas.
    grupo('2.0 El formulario carga y ofrece el acceso');
    {
        const r = await call('GET', `/public/completed/${SLUG}`);
        check('el formulario carga', r.status === 200 && r.data?.event?.id === 'ev-xiii', JSON.stringify(r.data).slice(0, 200));
        check('ofrece crear el acceso (optional)', r.data?.access?.mode === 'optional');
        check('sin sesión no hay identidad', r.data?.identity === null);
    }
    // Registros que NO se tocan: una inscripción en línea pagada con su pago.
    await db.query(`INSERT INTO "EventRegistration" (id, "eventId", email, "firstName", status, "totalAmount", currency, "stripePaymentIntentId", "paidAt", "submittedAt")
        VALUES ('reg-pagada','ev-xiii','pagada@club.org','Pagada','paid',850000,'COP','pi_123',NOW(),NOW()) ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO "EventRegistrationPayment" ("registrationId","eventId", status, amount, currency, "stripeEventId")
        VALUES ('reg-pagada','ev-xiii','paid',850000,'COP','evt_1')`).catch(() => { });
    const intocables = async () => JSON.stringify((await db.query(`SELECT * FROM "EventRegistration" ORDER BY id`)).rows)
        + JSON.stringify((await db.query(`SELECT * FROM "EventRegistrationPayment" ORDER BY id`)).rows);
    const antes = await intocables();

    // Un registro HISTÓRICO, enviado antes de que existieran las cuentas.
    await db.query(`INSERT INTO "EventCompletedRegistration" ("eventId", email, "firstName", "lastName", status, "registrationCode", "receiptKey", "receiptName", "paymentMethod")
        VALUES ('ev-xiii','historico@club.org','Ana','Histórica','validated','CR4281-2027-HIST1','private/event-receipts/ev-xiii/viejo.pdf','viejo.pdf','transferencia')`);
    receipts.objetos.set('private/event-receipts/ev-xiii/viejo.pdf', { bytes: 1000, mime: 'application/pdf' });
    const historicoAntes = (await filas('historico@club.org'))[0];

    grupo('2.1 Usuario nuevo crea su cuenta y completa la inscripción');
    let tokenA = '';
    let filaA = null;
    {
        const chk = await call('POST', `/public/completed/${SLUG}/access`, { body: { email: 'nuevo@club.org', password: 'Rotary2027!' } });
        check('el paso 1 dice «nuevo»', chk.data?.status === 'new', JSON.stringify(chk.data));
        check('la comprobación NO crea la cuenta', (await cuentas('nuevo@club.org')).length === 0);
        const r = await enviar('nuevo@club.org', { password: 'Rotary2027!' });
        check('201 con código', r.status === 201 && Boolean(r.data?.registrationCode), JSON.stringify(r.data).slice(0, 300));
        check('la respuesta trae la sesión del asistente', Boolean(r.data?.session?.token) && r.data?.hasAccount === true);
        tokenA = r.data?.session?.token || '';
        const acc = await cuentas('nuevo@club.org');
        check('se creó UNA cuenta', acc.length === 1);
        check('la contraseña se guarda como hash bcrypt, nunca en claro',
            /^\$2[aby]\$/.test(acc[0]?.passwordHash || '') && acc[0]?.passwordHash !== 'Rotary2027!');
        filaA = (await filas('nuevo@club.org'))[0];
        check('el registro queda atado a la cuenta', filaA?.accountId === acc[0]?.id);
        check('crear la cuenta NO confirma: nace «submitted»', filaA?.status === 'submitted');
        check('la contraseña no está en las respuestas guardadas', !JSON.stringify(filaA?.answers || {}).includes('Rotary2027!'));
        const hist = (await db.query(`SELECT type FROM "EventRegistrationHistory" WHERE "registrationId" = $1`, [filaA?.id])).rows.map(h => h.type);
        check('el historial dice que se vinculó', hist.includes('account_linked') && hist.includes('completed_submitted'));
        check('el correo de confirmación salió como siempre', mail.enviados.some(m => m.to === 'nuevo@club.org'));
    }

    grupo('2.2 Mis eventos muestra la inscripción con su trazabilidad');
    {
        const me = await call('GET', '/portal/me', { token: tokenA });
        check('aparece en «Mis eventos»', me.status === 200 && me.data?.completed?.length === 1, JSON.stringify(me.data).slice(0, 200));
        const c = me.data?.completed?.[0] || {};
        check('con evento, fecha y lugar', c.event?.title?.includes('Villavicencio') && Boolean(c.event?.startDate) && c.event?.location?.includes('Meta'));
        check('con código, club y distrito', Boolean(c.registrationCode) && c.clubName === 'E-Club Origen' && c.district === '4281');
        check('estado: pendiente de validación (12: comprobante aún no validado)',
            c.statusLabel === 'Pendiente de validación' && c.stages?.[1]?.current === true && c.stages?.[2]?.done === false);
        check('no expone notas internas, alertas ni la clave del comprobante',
            !('internalNotes' in c) && !('flags' in c) && !('receiptKey' in c) && c.hasReceipt === true);
        const d = await call('GET', `/portal/completed/${filaA.id}`, { token: tokenA });
        check('la ficha trae el historial real', d.status === 200 && d.data?.history?.some(h => h.type === 'completed_submitted'));
        const rc = await call('GET', `/portal/completed/${filaA.id}/receipt`, { token: tokenA });
        check('su comprobante se abre con enlace firmado', rc.status === 200 && /lectura-firmada/.test(rc.data?.url || ''));
    }

    grupo('2.3 Usuario existente inicia sesión y continúa');
    {
        const mal = await call('POST', `/public/completed/${SLUG}/access`, { body: { email: 'nuevo@club.org', password: 'otraClave99' } });
        check('con otra clave: «este correo ya está asociado…»', mal.data?.status === 'exists'
            && mal.data?.message === 'Este correo ya está asociado a una cuenta de Rotary Distrito 4281. Inicia sesión para continuar con tu inscripción.');
        const bien = await call('POST', `/public/completed/${SLUG}/access`, { body: { email: 'nuevo@club.org', password: 'Rotary2027!' } });
        check('con su clave: entra (sesión abierta)', bien.data?.status === 'signed_in' && Boolean(bien.data?.session?.token));
        const r = await enviar('nuevo@club.org', { token: bien.data?.session?.token });
        check('envía con la sesión, sin volver a crear contraseña', r.status === 201 && r.data?.hasAccount === true, JSON.stringify(r.data).slice(0, 200));
        check('sigue habiendo UNA cuenta', (await cuentas('nuevo@club.org')).length === 1);
        const me = await call('GET', '/portal/me', { token: tokenA });
        check('las dos inscripciones están en la misma cuenta', me.data?.completed?.length === 2);
    }

    grupo('2.4 Usuario autenticado: no se le pide contraseña');
    {
        const cfg = await call('GET', `/public/completed/${SLUG}`, { token: tokenA });
        check('la configuración lo reconoce', cfg.data?.identity?.email === 'nuevo@club.org');
        check('y precarga SUS datos', cfg.data?.prefill?.email === 'nuevo@club.org');
        const sinClave = await enviar('nuevo@club.org', { token: tokenA });
        check('envía sin contraseña', sinClave.status === 201 && sinClave.data?.hasAccount === true);
        const otro = await enviar('esposa@club.org', { token: tokenA });
        check('con sesión, inscribir OTRO correo no lo ata a la sesión', otro.status === 201 && otro.data?.hasAccount === false);
        check('…ni le crea cuenta sin contraseña', (await cuentas('esposa@club.org')).length === 0);
    }

    grupo('2.5 Usuario que olvidó la contraseña / inscripción histórica sin cuenta');
    {
        mail.resetEnviados();
        const f = await call('POST', '/portal/forgot', { body: { email: 'historico@club.org' } });
        check('la respuesta es la genérica (no revela si hay cuenta)', f.status === 200 && /Si el correo está registrado/.test(f.data?.message || ''));
        const acc = await cuentas('historico@club.org');
        check('se le crea la cuenta pendiente', acc.length === 1 && acc[0].passwordHash === '!');
        check('y le llega el enlace a SU correo', mail.enviados.some(m => m.to === 'historico@club.org' && /reset=/.test(m.html)));
        check('ANTES de abrir el enlace, el histórico sigue sin cuenta', (await filas('historico@club.org'))[0].accountId === null);
        const resetToken = acc[0].resetToken;
        const r = await call('POST', '/portal/reset', { body: { token: resetToken, password: 'NuevaClave1' } });
        check('al crear la contraseña desde el enlace, entra', r.status === 200 && Boolean(r.data?.token));
        const h = (await filas('historico@club.org'))[0];
        check('…y su inscripción histórica queda vinculada', h.accountId === acc[0].id);
        check('sin tocar su estado, código ni comprobante',
            h.status === historicoAntes.status && h.registrationCode === historicoAntes.registrationCode
            && h.receiptKey === historicoAntes.receiptKey && h.email === historicoAntes.email);
        const me = await call('GET', '/portal/me', { token: r.data?.token });
        check('ahora la ve en «Mis eventos», validada',
            me.data?.completed?.[0]?.registrationCode === 'CR4281-2027-HIST1' && me.data?.completed?.[0]?.stages?.[2]?.done === true);
    }

    grupo('2.6 Reclamar lo anterior exige demostrar el correo');
    {
        // Alguien envía con contraseña: su cuenta NO arrastra un histórico de su correo.
        await db.query(`INSERT INTO "EventCompletedRegistration" ("eventId", email, "firstName", status, "registrationCode")
            VALUES ('ev-xiii','reclamo@club.org','Rita','submitted','CR4281-2027-OLD22')`);
        const r = await enviar('reclamo@club.org', { password: 'ClaveRita1' });
        const tok = r.data?.session?.token;
        const rows = await filas('reclamo@club.org');
        check('crear la cuenta ata SÓLO el registro que se acaba de enviar',
            rows.filter(x => x.accountId).length === 1 && rows.find(x => x.registrationCode === 'CR4281-2027-OLD22').accountId === null);
        mail.resetEnviados();
        const claim = await call('POST', '/portal/completed/claim', { token: tok });
        check('pedir la vinculación manda un enlace al correo', claim.data?.sent === true && mail.enviados.some(m => m.to === 'reclamo@club.org' && /vincular=/.test(m.html)));
        check('todavía no se vinculó nada', (await filas('reclamo@club.org')).find(x => x.registrationCode === 'CR4281-2027-OLD22').accountId === null);
        const link = /vincular=([^"&]+)/.exec(mail.enviados.at(-1)?.html || '')?.[1];
        const ajeno = jwt.sign({ sub: 'otra-cuenta', email: 'reclamo@club.org', purpose: 'completed_claim' }, process.env.JWT_SECRET || 'rotary_secret_key_2026');
        const falso = await call('POST', '/portal/completed/claim/confirm', { body: { token: ajeno } });
        check('un enlace de otra cuenta no vincula', falso.status === 400);
        const ok = await call('POST', '/portal/completed/claim/confirm', { body: { token: decodeURIComponent(link || '') } });
        check('con el enlace del correo, se vincula', ok.status === 200 && ok.data?.linked === 1, JSON.stringify(ok.data).slice(0, 200));
        check('el histórico quedó en su cuenta', (await filas('reclamo@club.org')).every(x => x.accountId));
    }

    grupo('2.7 Nadie consulta la inscripción de otra persona');
    {
        const ajena = (await filas('historico@club.org'))[0];
        const d = await call('GET', `/portal/completed/${ajena.id}`, { token: tokenA });
        check('la ficha ajena da 404', d.status === 404);
        const rc = await call('GET', `/portal/completed/${ajena.id}/receipt`, { token: tokenA });
        check('su comprobante también', rc.status === 404);
        const me = await call('GET', '/portal/me', { token: tokenA });
        check('«Mis eventos» sólo trae las suyas', (me.data?.completed || []).every(c => c.email === 'nuevo@club.org'));
        const sin = await call('GET', `/portal/completed/${filaA.id}`);
        check('sin sesión, 401', sin.status === 401);
        const admin = await call('GET', '/admin/completed/list?eventRef=ev-xiii', { token: tokenA });
        check('el token del participante NO abre el panel administrativo', admin.status === 401 || admin.status === 403, String(admin.status));
    }

    grupo('2.8 No se crea una cuenta duplicada');
    {
        const antesCuentas = (await cuentas('nuevo@club.org')).length;
        const antesFilas = (await filas('nuevo@club.org')).length;
        const r = await enviar('nuevo@club.org', { password: 'OtraClave123' });
        check('enviar con otra clave: 409 «ya está asociado»', r.status === 409 && r.data?.accountExists === true);
        check('no se creó cuenta ni registro', (await cuentas('nuevo@club.org')).length === antesCuentas && (await filas('nuevo@club.org')).length === antesFilas);
        const gestor = await call('POST', `/public/completed/${SLUG}/access`, { body: { email: 'gestor@club.org', password: 'Cualquiera1' } });
        check('el correo del Gestor de Proyectos tampoco se duplica', gestor.data?.status === 'exists');
        await db.query(`INSERT INTO "EventAttendeeAccount" (email, "passwordHash", role) VALUES ('pendiente@club.org','!','event_attendee')`);
        const pend = await call('POST', `/public/completed/${SLUG}/access`, { body: { email: 'pendiente@club.org', password: 'Secuestro1' } });
        check('una cuenta sin clave NO se estrena desde el formulario: se recupera', pend.data?.status === 'exists' && pend.data?.recover === true);
        const env = await enviar('pendiente@club.org', { password: 'Secuestro1' });
        check('…ni al enviar', env.status === 409 && (await cuentas('pendiente@club.org'))[0].passwordHash === '!');
    }

    grupo('2.9 El mismo envío dos veces deja UN registro');
    {
        const key = `doble-${Date.now()}`;
        const a = await enviar('doble@club.org', { password: 'Doble12345', submissionKey: key });
        const b = await enviar('doble@club.org', { password: 'Doble12345', submissionKey: key });
        check('el segundo devuelve el mismo registro', a.status === 201 && b.status === 200 && a.data?.id === b.data?.id && b.data?.repeated === true);
        check('el repetido no abre sesión (la clave de envío no prueba identidad)', !b.data?.session);
        const key2 = `simultaneo-${Date.now()}`;
        const [c, d] = await Promise.all([
            enviar('simultaneo@club.org', { submissionKey: key2 }),
            enviar('simultaneo@club.org', { submissionKey: key2 }),
        ]);
        check('dos envíos simultáneos: un solo registro', c.data?.id === d.data?.id && (await filas('simultaneo@club.org')).length === 1,
            `${c.status}/${d.status}`);
        check('y una sola cuenta', (await cuentas('doble@club.org')).length === 1);
    }

    grupo('2.10 El Equipo de Registro sigue validando como siempre');
    {
        const admin = await import(`${REPO}/server/controllers/completedRegistrationAdminController.js`);
        const resDoble = () => { const r = { statusCode: 200 }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
        const req = (over) => ({ user: { id: 'u-admin', name: 'Equipo Registro', email: 'registro@rotary4281.org', role: 'administrator' }, headers: {}, query: { eventRef: 'ev-xiii' }, ...over });
        const res1 = resDoble();
        await admin.changeStatus(req({ params: { id: filaA.id }, body: { status: 'needs_correction', comment: 'El comprobante está borroso.' } }), res1);
        check('el panel cambia el estado', res1.statusCode === 200 && res1.body?.registration?.status === 'needs_correction', JSON.stringify(res1.body).slice(0, 200));
        check('y ve que tiene cuenta', res1.body?.registration?.hasAccount === true);
        const d = await call('GET', `/portal/completed/${filaA.id}`, { token: tokenA });
        check('el participante ve «Requiere corrección» con el motivo',
            d.data?.statusLabel === 'Requiere corrección' && d.data?.history?.some(h => h.comment === 'El comprobante está borroso.'));
        const res2 = resDoble();
        await admin.changeStatus(req({ params: { id: filaA.id }, body: { status: 'validated' } }), res2);
        const d2 = await call('GET', `/portal/completed/${filaA.id}`, { token: tokenA });
        check('y luego «Validado», con las tres etapas cumplidas', d2.data?.statusLabel === 'Validado' && d2.data?.stages?.every(s => s.done));
    }

    grupo('2.11 Nada de lo existente se tocó');
    check('inscripciones en línea y pagos idénticos', (await intocables()) === antes);

    srv.close();
    await db.pool.end();
}
