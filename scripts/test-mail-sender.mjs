#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL ENVÍO DESDE UNA CUENTA INSTITUCIONAL.  npm run test:mail-sender
// v4.942.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED: prisma y `fetch` se sustituyen. El
// criterio del remitente es puro; el CAMINO se ejercita de punta a punta.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE EL NOMBRE VISIBLE NO SEA UNA DIRECCIÓN. El respaldo salía como
//      `"presidencia@dominio.org" <noreply@clubplatform.org>` — el patrón que
//      los filtros leen como suplantación: el proveedor lo acepta y el
//      destinatario no lo recibe. Es la causa de «no llegan los correos».
//
//   2. QUE LA PANTALLA NO AFIRME LO QUE NO PASÓ. Decía «enviado desde
//      presidencia@…» aunque hubiera salido por el respaldo, así que no había
//      forma de enterarse ni de saber qué corregir.
//
//   3. QUE EL MOTIVO DEL PROVEEDOR LLEGUE, traducido con qué hacer y con el
//      original entre paréntesis.
//
//   4. QUE UN CLUB CON SMTP PROPIO SIGA ENVIANDO POR EL SUYO.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const PRISMA = new URL('./scripts/fixtures/prisma-mail-stub.mjs', HERE).href;

register(
    `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)prisma\\.js$/.test(s)) return {url:${JSON.stringify(PRISMA)},shortCircuit:true};
        if(/(^|\\/)db\\.js$/.test(s)) return {url:'data:text/javascript,export default {query:async()=>({rows:[]})};',shortCircuit:true};
        return n(s,c);
     }`,
    HERE
);

const M = await import('../server/lib/mailboxSender.js');
const C = await import('../server/controllers/communicationController.js');
const stub = await import(PRISMA);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
const codigo = f => leer(f).replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const BUZON = 'presidencia@rotaryecluborigen.org';
const SITIO = 'Rotary E-Club Origen';

// ════════════════════════════════════════════════════════════════════
grupo('1 · ⚠️ EL NOMBRE VISIBLE NUNCA ES UNA DIRECCIÓN');
// ════════════════════════════════════════════════════════════════════

const plan = M.mailboxSenderPlan({ mailbox: BUZON, siteName: SITIO });
eq('el plan tiene dos escalones: la propia y el respaldo', plan.map(p => p.level), [1, 2]);
eq('el primero es la cuenta institucional', plan[0].from, `"${SITIO}" <${BUZON}>`);
check('⚠️ el respaldo NO pone la dirección como nombre visible', !/"[^"]*@[^"]*"\s*</.test(plan[1].from));
eq('…lleva el NOMBRE del sitio', plan[1].from, `"${SITIO}" <noreply@clubplatform.org>`);
check('⚠️ …y la cuenta institucional queda como Reply-To', plan[1].replyTo === BUZON);
check('el respaldo dice POR QUÉ se usó', /no está verificado/.test(plan[1].reason));

check('sin nombre del sitio se usa la parte local, no la dirección',
    !M.mailboxSenderPlan({ mailbox: BUZON }).some(p => /@/.test(p.from.split('<')[0])));
eq('una comilla en el nombre no parte la cabecera',
    M.formatFrom('a@b.org', 'Club "X"'), '"Club X" <a@b.org>');
check('el dominio se lee sin `www.`', M.domainOf('a@www.club.org') === 'club.org');
check('sin buzón hay un solo escalón', M.mailboxSenderPlan({ siteName: SITIO }).length === 1);
check('⚠️ el respaldo NUNCA inventa una dirección en el dominio central',
    M.mailboxSenderPlan({ mailbox: BUZON, siteName: SITIO })[1].address === 'noreply@clubplatform.org');

// ════════════════════════════════════════════════════════════════════
grupo('2 · El motivo del proveedor, traducido y textual');
// ════════════════════════════════════════════════════════════════════

const noVerificado = 'The rotaryecluborigen.org domain is not verified. Please, add and verify your domain on https://resend.com/domains';
const traducido = M.explainSendFailure(noVerificado, { mailbox: BUZON });
check('dice el diagnóstico en español', /no está verificado/.test(traducido));
check('…y dónde se corrige', /Diagn[óo]stico/i.test(traducido));
check('⚠️ …y conserva el original entre paréntesis', traducido.includes(noVerificado));
check('la credencial ausente se dice como tal',
    /credencial del proveedor/.test(M.explainSendFailure('RESEND_API_KEY not configured')));
check('el límite por volumen también', /limitando los envíos/.test(M.explainSendFailure('rate limit exceeded')));
check('un motivo desconocido se propaga tal cual',
    M.explainSendFailure('algo raro').includes('algo raro'));
check('sin motivo se dice que no lo dijo', /no dijo por qué/.test(M.explainSendFailure('')));

// ════════════════════════════════════════════════════════════════════
grupo('3 · ⚠️ LO QUE SE LE DICE A QUIEN ENVIÓ');
// ════════════════════════════════════════════════════════════════════

check('desde su cuenta: se dice y nada más', M.describeSend(plan[0]) === `Mensaje enviado desde ${BUZON}.`);
const aviso = M.describeSend(plan[1]);
check('⚠️ por el respaldo: NO se afirma que salió desde su cuenta', !aviso.startsWith(`Mensaje enviado desde ${BUZON}`));
check('…se dice desde dónde salió', aviso.includes('noreply@clubplatform.org'));
check('…por qué', /no está verificado/.test(aviso));
check('…y que las respuestas le llegan igual', aviso.includes(BUZON) && /respuestas/i.test(aviso));

// ════════════════════════════════════════════════════════════════════
grupo('4 · EL CAMINO: enviar desde la bandeja');
// ════════════════════════════════════════════════════════════════════

process.env.RESEND_API_KEY = 'test-key';
const res = () => { const r = { code: 200, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
let enviados = [];

/** Resend acepta sólo los dominios de la lista. */
const resendConDominios = (verificados) => async (url, opts) => {
    const body = JSON.parse(opts.body);
    enviados.push(body);
    const dom = String(body.from).split('@').pop().replace('>', '').trim();
    if (!verificados.includes(dom)) {
        return { ok: false, status: 403, json: async () => ({ message: `The ${dom} domain is not verified. Please, add and verify your domain on https://resend.com/domains` }) };
    }
    return { ok: true, json: async () => ({ id: `msg-${dom}` }) };
};

const sembrar = () => {
    stub.reset(); enviados = [];
    stub.state.clubs.push({ id: 'A', name: SITIO });
    stub.state.accounts.push({ id: '1', email: BUZON, clubId: 'A' });
};

const enviar = async (user, body = {}) => {
    const r = res();
    await C.sendCommunication({ user, body: {
        type: 'email', recipient: 'destino@ejemplo.org', subject: 'Prueba',
        content: '<p>hola</p>', fromEmail: BUZON, clubId: 'A', ...body,
    } }, r);
    return r;
};

const INSTI = { id: 'in', role: 'institutional_user', email: BUZON, clubId: 'A' };
const ADMIN = { id: 'ad', role: 'club_admin', email: 'presidente@club.org', clubId: 'A' };

// ── El dominio SÍ está verificado: sale desde la cuenta institucional ──
sembrar();
globalThis.fetch = resendConDominios(['rotaryecluborigen.org', 'clubplatform.org']);
let r = await enviar(INSTI);
check('con el dominio verificado sale desde la cuenta institucional',
    r.code === 200 && r.body?.sender?.usedOwnMailbox === true && r.body.sender.address === BUZON);
check('…con UN solo intento', enviados.length === 1);
eq('…y el remitente lleva el nombre del sitio', enviados[0].from, `"${SITIO}" <${BUZON}>`);
check('…queda anotado como enviado', stub.state.logs.some(l => l.status === 'sent'));

// ── El dominio NO está verificado: sale por el respaldo Y SE DICE ──
sembrar();
globalThis.fetch = resendConDominios(['clubplatform.org']);
r = await enviar(INSTI);
check('⚠️ sin verificar, el correo SALE igual', r.code === 200 && r.body?.success);
check('⚠️ …pero NO desde la cuenta institucional, y se declara',
    r.body?.sender?.usedOwnMailbox === false && r.body.sender.address === 'noreply@clubplatform.org');
check('⚠️ …el nombre visible NO es una dirección',
    !/"[^"]*@[^"]*"\s*</.test(enviados[enviados.length - 1].from));
check('⚠️ …y la respuesta se le devuelve a su cuenta',
    enviados[enviados.length - 1].reply_to === BUZON);
check('el mensaje que ve el usuario dice desde dónde salió y por qué',
    /noreply@clubplatform\.org/.test(r.body?.message || '') && /no está verificado/.test(r.body?.message || ''));
check('el motivo del proveedor viaja para poder diagnosticar',
    /not verified/.test(r.body?.sender?.providerError || ''));

// ── Nada verificado: falla y DICE qué hacer ──
sembrar();
globalThis.fetch = resendConDominios([]);
r = await enviar(INSTI);
check('sin ningún dominio verificado, el envío falla', r.code === 500);
check('⚠️ …con el diagnóstico y el original', /no está verificado/.test(r.body?.error || '') && /resend\.com\/domains/.test(r.body?.error || ''));
check('…y queda anotado como fallido', stub.state.logs.some(l => l.status === 'failed'));

// ── Una dirección que no es buzón del sitio ──
sembrar();
globalThis.fetch = resendConDominios(['clubplatform.org']);
r = await enviar(ADMIN, { fromEmail: 'ajena@otrodominio.org' });
check('⚠️ una dirección que no es buzón del sitio no se intenta',
    !enviados.some(e => /ajena@otrodominio\.org>/.test(e.from)));
check('…y el correo sale por el respaldo', r.code === 200 && r.body?.sender?.usedOwnMailbox === false);

// ── El aislamiento del remitente sigue en pie ──
sembrar();
globalThis.fetch = resendConDominios(['rotaryecluborigen.org', 'clubplatform.org']);
r = await enviar(INSTI, { fromEmail: 'tesoreria@rotaryecluborigen.org' });
check('⚠️ un institucional NO puede firmar con la cuenta de otro', r.code === 403);
check('…y no salió nada', enviados.length === 0);

// ── Un club con SMTP propio conserva su camino ──
sembrar();
stub.state.notif.push({ clubId: 'A', type: 'smtp', enabled: true, host: 'smtp.club.org', port: 587, user: 'u', password: 'p', fromEmail: 'no-reply@club.org' });
globalThis.fetch = resendConDominios(['clubplatform.org']);
const ctrl = codigo('server/services/EmailService.js');
check('⚠️ con SMTP propio el respaldo de la plataforma NO se usa',
    /paso\.usedOwnMailbox \|\| !transporter/.test(ctrl));
check('…y si la institucional falla, se sigue al SMTP del sitio',
    /if \(!transporter\) \{[\s\S]{0,400}return \{ success: false/.test(ctrl));

// ════════════════════════════════════════════════════════════════════
grupo('5 · El criterio vive en UN solo sitio');
// ════════════════════════════════════════════════════════════════════

check('⚠️ el servicio no arma el remitente a mano: usa el plan',
    /mailboxSenderPlan\(/.test(ctrl));
check('⚠️ …y ya no existe el nombre visible con la dirección',
    !/`"\$\{fromEmail\}" <noreply/.test(ctrl));
check('el criterio es puro: no importa la base ni la red',
    !/from '\.\/db\.js'|from '\.\/prisma\.js'|fetch\(/.test(codigo('server/lib/mailboxSender.js')));
check('el dominio central sale de `notificationSpec`, no de una constante nueva',
    /from '\.\/notificationSpec\.js'/.test(codigo('server/lib/mailboxSender.js')));
check('la pantalla PINTA el mensaje del servidor, no lo redacta',
    /result\?\.message/.test(codigo('src/pages/admin/EmailManagement.tsx')));
check('⚠️ …y avisa cuando no salió desde su cuenta',
    /usedOwnMailbox === false/.test(codigo('src/pages/admin/EmailManagement.tsx')));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
