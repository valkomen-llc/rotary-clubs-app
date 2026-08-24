#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// A QUIÉN se avisa de un desembolso.  npm run test:disbursement:notice
// v4.888.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro y vive aparte de la
// orquestación, como `walletLifecycle.js` frente a `disbursements.js`.
//
// LO QUE ESTAS PRUEBAS PROTEGEN SOBRE TODO es el contrato con Meta: las
// variables de una plantilla de WhatsApp son POSICIONALES, así que reordenarlas
// sin volver a someter la plantilla pone cada dato en el hueco de otro —el
// nombre donde va el monto— y Meta no da ningún error por eso.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    NOTICE_CHANNELS, CHANNEL_IDS, isChannel,
    WA_VARIABLES, WA_VARIABLE_IDS, WA_TEMPLATE_NAME, WA_TEMPLATE,
    parseEmails, parsePhones, resolveRecipients,
    formatAmount, formatDate, buildNoticeData, buildWaParameters,
    canSendWhatsApp, noticeResult, summarizeResults, MAX_POR_CANAL,
} from '../server/lib/disbursementNotice.js';
import { validateForMeta } from '../server/lib/phone.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
    `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 1. Los canales ──────────────────────────────────────────────────
section('1. El catálogo de canales es cerrado');

ok('existen los dos canales', isChannel('email') && isChannel('whatsapp'));
ok('un canal inventado no existe', !isChannel('sms') && !isChannel(''));
ok('sólo WhatsApp exige plantilla aprobada',
    NOTICE_CHANNELS.whatsapp.requiresApprovedTemplate === true
    && NOTICE_CHANNELS.email.requiresApprovedTemplate === false);
eq('y son exactamente dos', CHANNEL_IDS, ['email', 'whatsapp']);

// ── 2. EL CONTRATO CON META ─────────────────────────────────────────
section('2. ⚠️ Las variables de WhatsApp son POSICIONALES');

const datos = buildNoticeData({
    disbursement: {
        beneficiary: 'Fundación Colombiana de Rotarios',
        amount: 182.43, currency: 'USD',
        disbursedAt: '2026-08-24T12:00:00Z',
        method: 'transferencia', reference: '0000054400',
    },
    siteName: 'Rotary Distrito 4281',
    methodLabel: 'Transferencia bancaria',
});

const params = buildWaParameters(datos);
eq('hay un parámetro por variable declarada', params.length, WA_VARIABLES.length);
eq('y salen EN EL ORDEN de WA_VARIABLES', params, [
    'Fundación Colombiana de Rotarios',
    formatAmount(182.43, 'USD'),
    '24 de agosto de 2026',
    'Transferencia bancaria',
    '0000054400',
    'Rotary Distrito 4281',
]);

// El cuerpo tiene que tener exactamente tantos `{{n}}` como variables, y
// numerados sin saltos: Meta rechaza la plantilla si no.
const marcadores = [...WA_TEMPLATE.bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
const delPie = [...String(WA_TEMPLATE.footerText || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
const todos = [...new Set([...marcadores, ...delPie])].sort((a, b) => a - b);
eq('los marcadores van de 1 a N sin saltos', todos, WA_VARIABLES.map((_, i) => i + 1));
ok('⚠️ ningún parámetro queda vacío: Meta los rechaza',
    params.every(p => p.length > 0), JSON.stringify(params));

ok('la categoría es UTILITY, no MARKETING',
    WA_TEMPLATE.category === 'UTILITY');
ok('el nombre es estable y en snake_case',
    WA_TEMPLATE_NAME === 'desembolso_confirmado' && /^[a-z0-9_]+$/.test(WA_TEMPLATE_NAME));
ok('el cuerpo NO agradece un aporte: el destinatario RECIBE dinero',
    !/gracias por tu aporte/i.test(WA_TEMPLATE.bodyText));
ok('y NO promete una fecha de acreditación',
    /puede tardar/i.test(WA_TEMPLATE.bodyText) && !/estará disponible el/i.test(WA_TEMPLATE.bodyText));

// ── 3. Los correos ──────────────────────────────────────────────────
section('3. Varios destinatarios, saneados');

eq('se parte por comas, punto y coma y saltos de línea',
    parseEmails('a@x.org, b@x.org;c@x.org\nd@x.org').validos,
    ['a@x.org', 'b@x.org', 'c@x.org', 'd@x.org']);

eq('se normalizan a minúsculas antes de deduplicar',
    parseEmails('Ana@Club.ORG, ana@club.org').validos, ['ana@club.org']);

const malo = parseEmails('bueno@x.org, esto-no-es-correo');
eq('lo válido pasa', malo.validos, ['bueno@x.org']);
ok('y lo descartado se DICE con su motivo',
    malo.descartados.length === 1 && /No parece una dirección/.test(malo.descartados[0].motivo));

const muchos = parseEmails(Array.from({ length: 15 }, (_, i) => `a${i}@x.org`).join(','));
eq(`se acota a ${MAX_POR_CANAL} por canal`, muchos.validos.length, MAX_POR_CANAL);
ok('y los que sobran se dicen, no se tiran en silencio',
    muchos.descartados.length === 5 && /Máximo/.test(muchos.descartados[0].motivo));

eq('vacío no da error, da lista vacía', parseEmails('').validos, []);
eq('un array también se acepta', parseEmails(['a@x.org', 'b@x.org']).validos, ['a@x.org', 'b@x.org']);

// ── 4. Los teléfonos ────────────────────────────────────────────────
section('4. ⚠️ Los teléfonos los valida `phone.js`, no este archivo');

const tel = parsePhones('3001234567\n+1 305 555 0100', validateForMeta);
eq('un móvil colombiano de 10 dígitos se completa con su código', tel.validos[0], '573001234567');
ok('y un internacional con + se conserva', tel.validos[1] === '13055550100', JSON.stringify(tel.validos));

const telMalo = parsePhones('12345', validateForMeta);
eq('un número ambiguo NO se adivina', telMalo.validos, []);
ok('y el motivo de `phone.js` se propaga TEXTUAL',
    /no reconocido como colombiano/i.test(telMalo.descartados[0].motivo),
    telMalo.descartados[0]?.motivo);

eq('el mismo número escrito distinto se deduplica',
    parsePhones('3001234567, +573001234567', validateForMeta).validos, ['573001234567']);

ok('sin validador no se inventan teléfonos',
    resolveRecipients({ phones: '3001234567' }).whatsapp.length === 0);

// ── 5. La resolución completa ───────────────────────────────────────
section('5. Los destinatarios de un desembolso');

const r = resolveRecipients({
    emails: 'a@x.org, roto',
    phones: '3001234567, 999',
}, validateForMeta);
eq('los correos válidos', r.email, ['a@x.org']);
eq('los teléfonos válidos', r.whatsapp, ['573001234567']);
eq('el total cuenta los dos canales', r.total, 2);
ok('los descartados llevan su CANAL, para saber qué campo corregir',
    r.descartados.length === 2
    && r.descartados.some(d => d.canal === 'email')
    && r.descartados.some(d => d.canal === 'whatsapp'));

eq('la dirección suelta de v4.885 sigue valiendo',
    resolveRecipients({ legacyEmail: 'viejo@x.org' }, validateForMeta).email, ['viejo@x.org']);
ok('y los nuevos MANDAN sobre ella cuando vienen',
    resolveRecipients({ emails: 'nuevo@x.org', legacyEmail: 'viejo@x.org' }, validateForMeta).email[0] === 'nuevo@x.org');

// ── 6. ¿Se puede mandar por WhatsApp? ───────────────────────────────
section('6. ⚠️ Meta SÓLO entrega plantillas aprobadas');

const cfg = { enabled: true, phoneNumberId: '1', accessToken: 'x' };
const aprobada = { name: WA_TEMPLATE_NAME, status: 'approved' };

ok('con configuración, plantilla aprobada y un número: se puede',
    canSendWhatsApp({ config: cfg, template: aprobada, phones: ['57300'] }).ok === true);

ok('sin número no se manda', !canSendWhatsApp({ config: cfg, template: aprobada, phones: [] }).ok);
ok('sin configuración tampoco, y dice DÓNDE se configura',
    /Comunicaciones CRM/.test(canSendWhatsApp({ config: null, template: aprobada, phones: ['1'] }).motivo));
ok('desactivada se dice como tal',
    /desactivada/i.test(canSendWhatsApp({ config: { enabled: false }, template: aprobada, phones: ['1'] }).motivo));
ok('sin plantilla se dice que hay que crearla y enviarla a Meta',
    /Creala desde/.test(canSendWhatsApp({ config: cfg, template: null, phones: ['1'] }).motivo));

const pend = canSendWhatsApp({ config: cfg, template: { status: 'pending' }, phones: ['1'] });
ok('⚠️ una plantilla PENDIENTE no se usa: Meta sólo entrega las aprobadas', pend.ok === false);
ok('y se dice cuánto suele tardar la revisión', /24 horas/.test(pend.motivo));

const rech = canSendWhatsApp({
    config: cfg, phones: ['1'],
    template: { status: 'rejected', rejectionReason: 'Contenido promocional en UTILITY' },
});
ok('una rechazada tampoco', rech.ok === false);
ok('y el motivo de Meta se propaga TEXTUAL',
    /Contenido promocional/.test(rech.motivo), rech.motivo);

// ── 7. Los datos del aviso ──────────────────────────────────────────
section('7. Los datos se arman UNA vez para los dos canales');

ok('el monto se escribe con su moneda para leerlo de corrido',
    /182,43/.test(formatAmount(182.43, 'USD')));
ok('los pesos van sin decimales',
    !/,\d\d$/.test(formatAmount(1484437, 'COP')), formatAmount(1484437, 'COP'));
eq('la fecha va en español y completa', formatDate('2026-08-24T12:00:00Z'), '24 de agosto de 2026');
eq('una fecha ilegible no revienta: devuelve vacío', formatDate('no-es-fecha'), '');

const sinRef = buildNoticeData({
    disbursement: { beneficiary: 'X', amount: 1, currency: 'USD', disbursedAt: new Date(), reference: '' },
    siteName: 'Sitio',
});
eq('⚠️ sin referencia dice «sin referencia», nunca un hueco', sinRef.reference, 'sin referencia');
ok('sin nombre de sitio hay un respaldo, no un vacío',
    buildNoticeData({ disbursement: { beneficiary: 'X' } }).site.length > 3);
ok('el monto crudo va aparte, sin símbolo, para el correo',
    !/\$/.test(String(datos.amountRaw)));

// ── 8. El registro por destinatario ─────────────────────────────────
section('8. Un resultado por canal Y por destinatario');

const resultados = [
    noticeResult({ channel: 'email', target: 'a@x.org', state: 'enviado' }),
    noticeResult({ channel: 'email', target: 'b@x.org', state: 'fallido', error: 'rebotó' }),
    noticeResult({ channel: 'whatsapp', target: '57300', state: 'omitido', error: 'plantilla pendiente' }),
];
const resumen = summarizeResults(resultados);
eq('se cuentan los enviados', resumen.enviados, 1);
eq('los fallidos', resumen.fallidos, 1);
eq('y los omitidos aparte: no se intentó, no es lo mismo que falló', resumen.omitidos, 1);
eq('desglosado por canal', resumen.porCanal.email, { enviados: 1, fallidos: 1, omitidos: 0 });
ok('sin resultados devuelve null, que NO es «no se avisó»',
    summarizeResults([]) === null && summarizeResults(null) === null);
ok('un canal inventado cae en email en vez de romper',
    noticeResult({ channel: 'paloma', target: 'x', state: 'enviado' }).channel === 'email');
ok('el error se acota para no llenar la fila', 
    noticeResult({ channel: 'email', target: 'x', state: 'fallido', error: 'y'.repeat(900) }).error.length === 500);

// ── 9. Las reglas del módulo ────────────────────────────────────────
section('9. Reglas, comprobadas sobre los archivos');

const notice = read('server/lib/disbursementNotice.js');
ok('⚠️ está escrito que WhatsApp no admite texto libre hacia un desconocido',
    /WHATSAPP NO ADMITE TEXTO LIBRE/.test(notice));
ok('y que el orden de las variables es el contrato con Meta',
    /EL ORDEN DE `WA_VARIABLES` ES EL CONTRATO CON META/.test(notice));
ok('los parámetros salen de WA_VARIABLES, no de una lista escrita a mano',
    /WA_VARIABLES\.map\(v => String\(data\?\.\[v\.id\]/.test(notice));
ok('es PURO: no importa la base ni la red',
    !/from '\.\/db\.js'/.test(notice) && !/fetch\(/.test(notice));
ok('y no valida teléfonos por su cuenta: recibe el validador',
    /export const parsePhones = \(raw, validar\)/.test(notice));

const disb = read('server/lib/disbursements.js');
ok('el envío de WhatsApp reutiliza `sendTemplate` del CRM',
    /await import\('\.\/whatsappSender\.js'\)/.test(disb) && /sendTemplate\(/.test(disb));
ok('⚠️ y sale del WABA de la PLATAFORMA, no del sitio',
    /resolvePlatformClubId/.test(disb) && /SALE DEL WABA DE LA PLATAFORMA/.test(disb));
ok('la siembra de la plantilla NO la envía a Meta',
    /NO LA ENVÍA A META/.test(disb) && /status.*'draft'/s.test(disb));
ok('y es idempotente: si ya existe no se pisa',
    /La plantilla ya existe; no se toca/.test(disb));
ok('⚠️ si el aviso falla el desembolso NO se revierte',
    /Se DEVUELVE el resultado, nunca se lanza/.test(disb));
ok('«omitido» se distingue de «fallido»',
    /state: 'omitido'/.test(disb));

const esquema = read('server/lib/ensureDisbursementSchema.js');
ok('las columnas nuevas son ADITIVAS y `notifyEmail` se conserva',
    /ADD COLUMN IF NOT EXISTS "notifyEmails"/.test(esquema)
    && /ADD COLUMN IF NOT EXISTS "notifyPhones"/.test(esquema)
    && /notifyEmail" se conserva/.test(esquema));
ok('el SQL no lleva comillas invertidas dentro',
    !esquema.split('const ALTERS = `')[1]?.split('`;')[0]?.includes('`'));

const ui = read('src/components/admin/wallet/NoticeRecipients.tsx');
ok('el componente de destinatarios es COMPARTIDO por los dos modales',
    read('src/components/admin/wallet/DisbursementSection.tsx').includes('NoticeRecipients')
    && read('src/components/admin/wallet/BulkDisbursementBar.tsx').includes('NoticeRecipients'));
ok('y dice por qué WhatsApp no está disponible, en vez de sólo apagarlo',
    /estadoWa\?\.motivo/.test(ui));
ok('el texto de WhatsApp NO se redacta en la pantalla, y se explica',
    /usa la plantilla aprobada por Meta/.test(ui));

// ── 10. Lo que se MANDA de verdad ───────────────────────────────────
section('10. ⚠️ El cuerpo que sale de la pantalla, campo por campo');

// El defecto de v4.888 fue un renombrado a medias: el estado pasó de `correo`
// a `correos` y la línea que armaba el cuerpo se quedó con el nombre viejo. Un
// `ReferenceError` dentro del `try`, que caía en el `catch`, mostraba un toast
// genérico y devolvía al formulario — «confirmo y no aparece nada».
//
// El typecheck REAL lo atrapa (`TS2552: Cannot find name 'correo'`), pero en un
// entorno sin `node_modules` sale en verde sin mirar nada: por eso existe
// `scripts/check-typecheck-real.mjs`. Esto es la segunda barrera, y comprueba
// lo que de verdad importa — que los nombres del cuerpo coincidan con los que
// el servidor lee.
const bulk = read('src/components/admin/wallet/BulkDisbursementBar.tsx');
const seccion = read('src/components/admin/wallet/DisbursementSection.tsx');
const ctrl2 = read('server/controllers/disbursementController.js');

for (const [archivo, fuente] of [['el modal del bloque', bulk], ['el modal de un aporte', seccion]]) {
    ok(`${archivo} manda \`notifyEmails\``, /notifyEmails/.test(fuente));
    ok(`${archivo} manda \`notifyPhones\``, /notifyPhones/.test(fuente));
    ok(`${archivo} ya NO usa el estado viejo \`correo\` suelto`,
        !/\bcorreo\b(?!s)/.test(fuente.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
}

ok('y el servidor LEE esos mismos nombres',
    /notifyEmails/.test(ctrl2) && /notifyPhones/.test(ctrl2));

// El beneficiario es obligatorio en el servidor: la pantalla no puede dejar
// llegar a la confirmación sin él y gastar la petición para volver con N
// errores iguales.
ok('⚠️ no se puede confirmar sin beneficiario, en los DOS modales',
    /disabled=\{!beneficiario\.trim\(\)\}/.test(bulk)
    && /disabled=\{!beneficiario\.trim\(\)\}/.test(seccion));
ok('y el motivo va a la vista, no sólo el botón apagado',
    /Hace falta para poder confirmar/.test(bulk) && /Hace falta para poder confirmar/.test(seccion));

// ── Cierre ──────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
