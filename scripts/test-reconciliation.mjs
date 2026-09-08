#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL CRITERIO de la conciliación de un traslado.  npm run test:reconciliation
// v4.1014.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. Prueba lo que DECIDE —qué se puede
// seleccionar, sobre qué traslado, qué dice el documento, cómo se lee el
// historial— separado de la orquestación, por el mismo motivo por el que
// `seoRules.js` vive aparte de `seoAudit.js`.
//
// La parte del PDF y del CSV se ejercita de verdad: `jspdf` es dependencia y
// corre en Node. Lo que ese bloque demuestra es que el documento se compone y
// que los acentos sobreviven; que se VEA bien es otra cosa y no se afirma.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

/**
 * ⚠️ EL CÓDIGO SIN SUS COMENTARIOS.
 *
 * Es la trampa de v4.1005 y esta prueba la pagó al escribirse: el comentario
 * que explica «acá NO hay un `INSERT INTO "Disbursement"`» CONTIENE esa
 * cadena, así que la comprobación se encontraba a sí misma en su propia
 * explicación y fallaba con el código correcto delante. Un guardián que grita
 * en falso se termina desactivando, que es peor que no tenerlo.
 */
const codigo = (p) => read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')      // bloques
    .replace(/^\s*\/\/.*$/gm, '')          // líneas
    .replace(/(^|[^:])\/\/.*$/gm, '$1');    // al final de una línea, sin comerse las URLs
let pass = 0, fail = 0;
const ok = (n, c, d = '') => {
    if (c) { pass++; console.log(`  ✓ ${n}`); }
    else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); }
};
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

const spec = await import('../server/lib/reconciliationSpec.js');
const pdf = await import('../server/lib/reconciliationPdf.js');

// ────────────────────────────────────────────────────────────────────
section('· Qué cuenta como trasladado');

ok('las DOS formas del giro cuentan', spec.isDisbursedBucket('disbursed') && spec.isDisbursedBucket('disbursing'));
ok('lo disponible NO cuenta', !spec.isDisbursedBucket('available'));
ok('⚠️ el catálogo es CERRADO: un estado inventado no se puede conciliar', !spec.isDisbursedBucket('trasladado_quizas'));

section('· La clase de un aporte para la selección');

eq('un aporte girado es «trasladado»',
    spec.selectionClassOf({ id: 'p1', status: 'succeeded', bucket: 'disbursed' }), 'trasladado');
eq('un giro PARCIAL también: el dinero se movió',
    spec.selectionClassOf({ id: 'p1', status: 'succeeded', bucket: 'disbursing' }), 'trasladado');
eq('uno disponible con saldo es «disponible»',
    spec.selectionClassOf({ id: 'p1', status: 'succeeded', bucket: 'available' }, { restante: 100 }), 'disponible');
eq('uno disponible SIN saldo pendiente no participa',
    spec.selectionClassOf({ id: 'p1', status: 'succeeded', bucket: 'available' }, { restante: 0 }), 'ninguna');
eq('un reembolsado no participa',
    spec.selectionClassOf({ id: 'p1', status: 'refunded', bucket: 'refunded' }, { restante: 100 }), 'ninguna');
eq('⚠️ un reembolsado GIRADO tampoco: el reembolso es el hecho más tardío',
    spec.selectionClassOf({ id: 'p1', status: 'refunded', bucket: 'disbursed' }), 'ninguna');
eq('lo que el proveedor todavía retiene no se puede girar',
    spec.selectionClassOf({ id: 'p1', status: 'succeeded', bucket: 'available', availableOn: new Date(Date.now() + 864e5).toISOString() }, { restante: 100 }),
    'ninguna');
eq('⚠️ pero un aporte YA GIRADO sigue siendo conciliable aunque tenga fecha futura',
    spec.selectionClassOf({ id: 'p1', status: 'succeeded', bucket: 'disbursed', availableOn: new Date(Date.now() + 864e5).toISOString() }),
    'trasladado');
eq('sin movimiento no hay clase', spec.selectionClassOf(null), 'ninguna');

section('· Una selección mezclada no ejecuta nada');

const mezcla = spec.classifySelection([{ clase: 'disponible' }, { clase: 'trasladado' }]);
ok('se detecta la mezcla', mezcla.mezclada && mezcla.clase === 'mezclada');
eq('y se dice cuántos hay de cada clase', [mezcla.disponibles.length, mezcla.trasladados.length], [1, 1]);
ok('con una sola clase hay acción', !spec.classifySelection([{ clase: 'trasladado' }, { clase: 'trasladado' }]).mezclada);
eq('y se nombra', spec.classifySelection([{ clase: 'trasladado' }]).clase, 'trasladado');
eq('vacía no es ninguna clase', spec.classifySelection([]).clase, 'ninguna');

section('· La agrupación por traslado');

const grupos = spec.groupByTransfer([
    { paymentId: 'p1', batchId: 'b1', status: 'confirmado' },
    { paymentId: 'p2', batchId: 'b1', status: 'confirmado' },
    { paymentId: 'p3', batchId: 'b2', status: 'confirmado' },
    { paymentId: 'p4', batchId: null, status: 'confirmado' },
    { paymentId: 'p5', batchId: 'b1', status: 'reversado' },
]);
eq('los aportes se agrupan por su traslado', grupos.batchIds.sort(), ['b1', 'b2']);
eq('y se sabe cuáles caen en cada uno', grupos.porLote.b1, ['p1', 'p2']);
eq('⚠️ un desembolso REVERSADO no arrastra a su aporte: no trasladó nada', grupos.porLote.b1.includes('p5'), false);
eq('un giro suelto se declara aparte, no se le inventa un lote', grupos.sueltos, ['p4']);
eq('sin nada, nada', spec.groupByTransfer([]).batchIds, []);

section('· El alcance se DICE antes de mandar');

const avisos = spec.describeTransferScope({ elegidos: 3, cubiertos: 8, lotes: 1, sueltos: 0 });
ok('⚠️ se avisa que la conciliación va del traslado COMPLETO',
    avisos.some(a => /completa/i.test(a) && /8/.test(a) && /extracto/i.test(a)));
ok('con varios traslados se dice que son varias conciliaciones',
    spec.describeTransferScope({ elegidos: 4, cubiertos: 4, lotes: 2 }).some(a => /2 traslados/.test(a)));
ok('y los sueltos se nombran',
    spec.describeTransferScope({ elegidos: 2, cubiertos: 0, lotes: 0, sueltos: 2 }).some(a => /suelto/i.test(a)));
eq('cuando la selección ES el traslado, no hay nada que avisar',
    spec.describeTransferScope({ elegidos: 8, cubiertos: 8, lotes: 1, sueltos: 0 }), []);

section('· La validación del reenvío');

const lote = { id: 'b1', status: 'confirmado' };
const items = [{ status: 'confirmado' }, { status: 'confirmado' }];
const conCorreo = { email: ['a@club.org'], whatsapp: [], descartados: [] };

ok('con traslado, aportes y destinatario, se puede',
    spec.validateResend({ batch: lote, items, recipients: conCorreo }).ok);
ok('⚠️ sin destinatario NO se puede, y se dice por qué',
    !spec.validateResend({ batch: lote, items, recipients: { email: [], whatsapp: [], descartados: [] } }).ok);
ok('un traslado reversado no tiene conciliación que reenviar',
    !spec.validateResend({ batch: { id: 'b1', status: 'reversado' }, items, recipients: conCorreo }).ok);
ok('con TODOS los aportes reversados la conciliación quedaría vacía',
    !spec.validateResend({ batch: lote, items: [{ status: 'reversado' }], recipients: conCorreo }).ok);
{
    const r = spec.validateResend({ batch: lote, items: [...items, { status: 'reversado' }], recipients: conCorreo });
    ok('⚠️ un reversado entre otros AVISA pero NO bloquea', r.ok && r.avisos.some(a => /reversado/.test(a)));
}
{
    const r = spec.validateResend({
        batch: lote, items,
        recipients: { email: ['a@club.org'], whatsapp: [], descartados: [{ valor: 'roto', motivo: 'no parece un correo' }] },
    });
    ok('lo descartado se DICE con su motivo, no desaparece',
        r.ok && r.avisos.some(a => /roto/.test(a) && /no parece un correo/.test(a)));
}
ok('por encima del tope de destinatarios se rechaza',
    !spec.validateResend({ batch: lote, items, recipients: { email: Array.from({ length: 40 }, (_, i) => `d${i}@x.org`), whatsapp: [], descartados: [] } }).ok);

section('· Las cifras del documento');

const filas = [
    { status: 'confirmado', gross: 200000, netContribution: 185554, platformFee: 4200, amount: 185554 },
    { status: 'confirmado', gross: 100000, netContribution: 92777, platformFee: 2100, amount: 92777 },
    { status: 'reversado', gross: 999, netContribution: 999, platformFee: 0, amount: 999 },
];
const tot = spec.reconciliationTotals(filas);
eq('los reversados no entran en el total', tot.count, 2);
eq('el bruto es la suma de los brutos', tot.bruto, 300000);
eq('la retención es la de la plataforma', tot.retencion, 6300);
eq('⚠️ la comisión del procesador se DERIVA (bruto − retención − neto)', tot.comision, 300000 - 278331 - 6300);
eq('el neto es lo que de verdad se giró', tot.neto, 278331);
ok('⚠️ y todo cuadra: bruto = comisión + retención + neto',
    Math.abs(tot.bruto - (tot.comision + tot.retencion + tot.neto)) < 0.01);
eq('una comisión no puede ser negativa',
    spec.processorFeeOf({ gross: 100, netContribution: 200, platformFee: 0 }), 0);

section('· El saneado para el PDF');

eq('⚠️ el guion largo se sustituye: WinAnsi lo DESCARTA en silencio',
    spec.toWinAnsi('Club — Rotario'), 'Club - Rotario');
eq('las comillas tipográficas también', spec.toWinAnsi('«a» “b” ‘c’'), '«a» "b" \'c\'');
eq('los acentos y la eñe SÍ sobreviven', spec.toWinAnsi('Ñandú áéíóú ÁÉ ü'), 'Ñandú áéíóú ÁÉ ü');
eq('los puntos suspensivos se abren', spec.toWinAnsi('espera…'), 'espera...');
eq('lo que no cabe en Latin-1 se MARCA, no desaparece', spec.toWinAnsi('Wrocław'), 'Wroc?aw');
// Un emoji es un PAR SUSTITUTO (dos unidades UTF-16), así que deja dos marcas.
// Se comprueba la intención —que se vea que faltaba algo—, no cuántas.
ok('un emoji deja marca en vez de desaparecer',
    /^emoji \?+$/.test(spec.toWinAnsi('emoji 😀')));

section('· El correo de conciliación');

ok('⚠️ la frase que lo distingue de un traslado nuevo es una constante',
    /No representa un nuevo traslado/.test(spec.RECONCILIATION_NOTE));
ok('el asunto nombra la campaña o el beneficiario',
    /Conciliación de aportes trasladados – Club Rotario Ibagué/.test(
        spec.buildReconciliationSubject({ beneficiary: 'Club Rotario Ibagué' })));
ok('y no se rompe sin ninguno de los dos',
    typeof spec.buildReconciliationSubject({}) === 'string');

section('· El reenvío es un EVENTO propio del registro de entregas');

{
    const ns = await import('../server/lib/notificationSpec.js');
    // El id se LEE del módulo de I/O en vez de escribirlo otra vez acá: con la
    // cadena en dos sitios, renombrarla dejaría la prueba en verde sobre un
    // evento que ya no existe.
    const io_RESEND_EVENT = /RESEND_EVENT = '([^']+)'/.exec(read('server/lib/reconciliationNotices.js'))?.[1];
    ok('el evento del reenvío está declarado en el módulo de I/O', !!io_RESEND_EVENT);
    ok('⚠️ está en el catálogo CERRADO: sin él, `claimDelivery` lo rechaza y no queda traza',
        ns.isKnownEvent(io_RESEND_EVENT),
        'la llave de la bitácora es contribución + evento + destinatario, y un evento desconocido no se normaliza');
    ok('⚠️ y NO es `disbursed`: con el mismo evento, reenviarle la conciliación a quien ya recibió el aviso del giro se marcaría duplicado y no saldría nunca',
        io_RESEND_EVENT !== 'disbursed');
    ok('se declara disponible: lo dispara una persona, no un webhook de un tercero',
        ns.eventById(io_RESEND_EVENT)?.available === true);
    ok('⚠️ pero NO se ofrece como interruptor de perfil: ninguna regla lo dispara (v4.650)',
        !ns.configurableEvents().some(e => e.id === io_RESEND_EVENT)
        && !Object.prototype.hasOwnProperty.call(ns.eventRulesShape({}), io_RESEND_EVENT));
}

section('· El historial se COMPONE, no se migra');

const historial = spec.noticeHistory({
    batch: {
        id: 'b1', notifyEmails: ['tesoreria@club.org'], notifyPhones: [], notifyState: 'enviado',
        notifyAt: '2026-08-28T21:42:00Z', createdByName: 'Ana Tesorera',
        notifyResults: [{ channel: 'email', target: 'tesoreria@club.org', state: 'enviado' }],
    },
    notices: [{
        id: 'n1', emails: ['presidencia@club.org'], phones: [], state: 'enviado',
        results: [{ channel: 'email', target: 'presidencia@club.org', state: 'enviado' }],
        sentAt: '2026-09-08T15:00:00Z', sentByName: 'Daniel Yazo', note: 'lo pidió el presidente',
    }],
});
eq('salen las dos entradas', historial.length, 2);
eq('lo más reciente primero', historial[0].id, 'n1');
eq('⚠️ el aviso original se DERIVA de las columnas del lote', historial[1].kind, 'original');
eq('y conserva a quién salió', historial[1].emails, ['tesoreria@club.org']);
eq('el reenvío dice QUIÉN lo pidió', historial[0].byName, 'Daniel Yazo');
ok('el original se marca como derivado: no es una fila y no admite acciones propias',
    historial[1].derived === true && historial[0].derived === false);
eq('sin nada, historial vacío', spec.noticeHistory({ batch: null, notices: [] }), []);
ok('un lote SIN aviso registrado no inventa una entrada',
    spec.noticeHistory({ batch: { id: 'b1', notifyEmails: [], notifyPhones: [] }, notices: [] }).length === 0);

const ya = spec.alreadyNotified(historial);
eq('se sabe quién ya recibió algo de este traslado',
    ya.map(y => y.target).sort(), ['presidencia@club.org', 'tesoreria@club.org']);
ok('sólo cuenta lo ENVIADO, no lo que falló',
    spec.alreadyNotified([{ results: [{ channel: 'email', target: 'x@x.org', state: 'fallido' }] }]).length === 0);
ok('un envío anterior al registro por destinatario usa sus direcciones',
    spec.alreadyNotified([{ emails: ['vieja@club.org'], results: [] }]).length === 1);

// ────────────────────────────────────────────────────────────────────
section('· El documento consolidado (PDF y CSV de verdad)');

const loteReal = {
    id: 'b-abcdef123456', beneficiary: 'Club Rotario Ibagué',
    campaignName: 'Emergencia Terremoto Colombia 2026', currency: 'COP',
    method: 'transferencia', methodLabel: 'Transferencia bancaria',
    reference: 'TRF-99881', disbursedAt: '2026-08-28T16:42:00Z',
};
const aportes = [
    { paymentId: 'pay-0001aaaa', status: 'confirmado', donorName: 'Ana — Pérez', donorEmail: 'ana@club.org', date: '2026-08-20T12:00:00Z', gross: 200000, netContribution: 185554, platformFee: 4200, amount: 185554 },
    { paymentId: 'pay-0002bbbb', status: 'confirmado', isAnonymous: true, donorName: 'Secreto', donorEmail: 's@x.org', date: '2026-08-21T12:00:00Z', gross: 100000, netContribution: 92777, platformFee: 2100, amount: 92777 },
    { paymentId: 'pay-0003cccc', status: 'reversado', gross: 1, netContribution: 1, platformFee: 0, amount: 1 },
];

const doc = await pdf.buildReconciliationPdf({ batch: loteReal, items: aportes, site: { name: 'Distrito 4281' } });
ok('el PDF se compone', doc.ok, doc.error || '');
ok('y es un PDF de verdad', doc.ok && Buffer.from(doc.buffer).subarray(0, 5).toString() === '%PDF-');
ok('el nombre lleva la referencia del traslado', /conciliacion-LOTE-/.test(doc.filename || ''));

const csv = pdf.buildReconciliationCsv({ batch: loteReal, items: aportes });
ok('⚠️ el CSV lleva BOM: sin él Excel abre «RodrÃ­go»', csv.charCodeAt(0) === 0xFEFF);
ok('⚠️ y punto y coma: con coma, Excel en español mete la fila en una columna', csv.includes(';'));
ok('el reversado NO está en el documento', !csv.includes('pay-0003'.toUpperCase()));

const filasDoc = pdf.reconciliationRows(aportes, 'COP');
eq('sólo entran los confirmados', filasDoc.length, 2);
eq('⚠️ un aportante ANÓNIMO no publica su nombre', filasDoc[1].donante, 'Aportante anónimo');
eq('ni su correo', filasDoc[1].correo, '');
ok('y el que no es anónimo sí', filasDoc[0].donante.includes('Ana'));

// ────────────────────────────────────────────────────────────────────
section('· Las invariantes que sostienen el módulo');

const io = codigo('server/lib/reconciliationNotices.js');
ok('⚠️ el reenvío NO registra ningún desembolso',
    !/INSERT INTO "Disbursement"/.test(io),
    'reenviar un documento no puede crear un movimiento financiero');
ok('⚠️ ni toca el estado financiero de nada',
    !/UPDATE "Disbursement"\s+SET/.test(io) && !/UPDATE "DisbursementBatch"/.test(io),
    'el estado FINANCIERO y el de COMUNICACIÓN son dos ejes');
ok('⚠️ ni pisa los destinatarios del aviso ORIGINAL',
    !/"notifyEmails"\s*=/.test(io) && !/"notifyState"\s*=/.test(io),
    'esas columnas son «a quién se le avisó cuando se hizo el giro»');
ok('la única escritura es la fila del reenvío',
    (io.match(/INSERT INTO "(\w+)"/g) || []).every(x => /DisbursementNotice/.test(x)));
ok('⚠️ el historial SÓLO AGREGA: ni UPDATE ni DELETE sobre un reenvío',
    !/UPDATE "DisbursementNotice"/.test(io) && !/DELETE FROM "DisbursementNotice"/.test(io));
ok('el aislamiento va en el WHERE, no en una comprobación posterior',
    (io.match(/FROM "DisbursementNotice"/g) || []).length ===
    (io.match(/FROM "DisbursementNotice"[\s\S]{0,200}?"clubId" = \$/g) || []).length);
ok('⚠️ el correo lo compone el MISMO constructor, no un segundo',
    /buildBatchEmail/.test(io) && !/const buildReconciliationEmail/.test(io));
ok('y el reclamo por destinatario es el registro de siempre',
    /claimDelivery/.test(io) && /markSent/.test(io) && /markFailed/.test(io));
ok('⚠️ el envío comprueba `success`: `sendPlatformEmail` NO lanza (v4.901)',
    /resultado\?\.success/.test(io));
ok('la llave de la entrega es la OPERACIÓN, no el lote',
    /resend:\$\{/.test(io),
    'con el lote, un segundo reenvío al mismo correo se marcaría duplicado y no saldría nunca');

const ctrl = codigo('server/controllers/disbursementController.js');
ok('⚠️ reenviar EXIGE confirmación explícita (428 sin ella)',
    /resendBatchReconciliation[\s\S]{0,900}?status\(428\)/.test(ctrl));
ok('el sitio sale del token, nunca del cuerpo a secas',
    /const clubId = clubDe\(req\);[\s\S]{0,200}?resendReconciliation/.test(ctrl)
    || /resendBatchReconciliation = async[\s\S]{0,400}?clubDe\(req\)/.test(ctrl));

const rutas = codigo('server/routes/financial.js');
const iResolve = rutas.indexOf("'/wallet/disbursement-batches/resolve'");
const iParam = rutas.indexOf("'/wallet/disbursement-batches/:id'");
ok('⚠️ la literal `/resolve` va ANTES que la paramétrica `/:id`',
    iResolve > 0 && iParam > 0 && iResolve < iParam,
    'Express casa en ORDEN: debajo, «resolve» se leería como el id de un lote');
{
    // Se mira LÍNEA por línea: la declaración de una ruta cabe en una y así la
    // comprobación no depende de cómo esté partido el archivo.
    const lineas = rutas.split('\n');
    const guardada = (ruta) => lineas.some(l =>
        l.includes(`'${ruta}'`) && l.includes('authMiddleware') && l.includes('requireSiteAdmin'));
    ok('las cinco rutas nuevas piden rol administrativo del sitio',
        ['/wallet/disbursement-batches/resolve',
         '/wallet/disbursement-batches/:id/notices',
         '/wallet/disbursement-batches/:id/reconciliation',
         '/wallet/disbursement-batches/:id/resend',
         '/wallet/notices/:id/document'].every(guardada));
}

const ensure = read('server/lib/ensureDisbursementSchema.js');
ok('la tabla del reenvío existe', /CREATE TABLE IF NOT EXISTS "DisbursementNotice"/.test(ensure));
{
    // ⚠️ Se comprueba la INVARIANTE: las DOS vías del ensure ejecutan el SQL de
    // la tabla nueva. `CREATE TABLE IF NOT EXISTS` de la primera no corre en el
    // atajo, y ésa es la base de producción (la trampa de v4.908).
    const vias = [...ensure.matchAll(/await db\.query\(([^)]*)\)/g)].map(m => m[1]);
    ok('⚠️ y se crea también en el atajo de una base que ya tenía las otras',
        vias.filter(v => /\bNOTICE_SQL\b/.test(v)).length >= 2,
        'sin esto, la tabla no existiría en producción y el reenvío degradaría en silencio');
}
ok('el índice de la operación es parcial y lo dice',
    /"DisbursementNotice_operation_key"[\s\S]*?WHERE "operationKey" <> ''/.test(ensure));
ok('⚠️ ninguna comilla invertida dentro del SQL del reenvío',
    !/const NOTICE_SQL = `[^`]*`[^;]/.test(ensure.replace(/const NOTICE_SQL = `[\s\S]*?\n`;/, 'X')));
ok('⚠️ la tabla NO se declara en Prisma: se consulta con findMany sin select',
    !/DisbursementNotice/.test(read('server/prisma/schema.prisma')));

section('· El espejo del navegador es MÍNIMO');

const espejo = codigo('src/lib/reconciliationSpec.ts');
ok('⚠️ NO trae el agrupamiento por traslado', !/groupByTransfer/.test(espejo),
    'a qué lote pertenece un aporte lo resuelve el servidor y viaja resuelto');
ok('⚠️ NO trae la validación del reenvío', !/validateResend/.test(espejo),
    'quién decide si se puede enviar es el servidor');
ok('⚠️ NO trae la aritmética del documento', !/reconciliationTotals/.test(espejo),
    'dos aritméticas sobre el mismo traslado dirían dos totales');
ok('sí trae la clase de un aporte, que es lo que hace falta para pintar',
    /selectionClassOf/.test(espejo));

const pantalla = codigo('src/pages/admin/WalletManagement.tsx');
ok('la tarjeta «Desembolsado» filtra la lista',
    /onFiltrar=\{\(\) => filtrarPorEstado\('trasladado'\)\}/.test(pantalla));
ok('⚠️ y «Transferido» NO: cuenta payouts, no aportes',
    !/hint="Payouts completados al banco"[\s\S]{0,400}?onFiltrar=\{\(\) => filtrarPorEstado/.test(pantalla));
ok('⚠️ el filtro de estado viaja en la petición',
    /q\.set\('estado', estado\)/.test(pantalla));
ok('y `estado` está en las dependencias del armador de la query',
    /\}, \[rango, desde, hasta, destino, estado\]\);/.test(pantalla),
    'sin él, cambiar el filtro no llegaría NUNCA al servidor (la lección de `conQr`)');
ok('una selección mezclada no ofrece ninguna de las dos acciones',
    /seleccion\.mezclada &&/.test(pantalla) && /!seleccion\.mezclada &&/.test(pantalla));
ok('la casilla manda la CLASE del aporte', /clase,\n\s*\}, !elegido\)\}/.test(pantalla));

console.log(`\n${'─'.repeat(60)}\n${pass} pasaron, ${fail} fallaron`);
if (!fail) console.log('Reenviar la conciliación no mueve dinero, y se puede demostrar.');
process.exit(fail ? 1 : 0);
