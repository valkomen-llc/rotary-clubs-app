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

// ════════════════════════════════════════════════════════════════════
// v4.1015 — LA CONCILIACIÓN NO EXIGE UN TRASLADO AGRUPADO
// ════════════════════════════════════════════════════════════════════

section('· El ámbito de una conciliación');

const D = (id, pago, lote, estado = 'confirmado') => ({ id, paymentId: pago, batchId: lote, status: estado });

{
    const p = spec.planReconciliation({
        paymentIds: ['p1', 'p2', 'p3'],
        filas: [D('d1', 'p1', 'b1'), D('d2', 'p2', 'b1'), D('d3', 'p3', 'b1')],
        batchSizes: { b1: 3 },
    });
    eq('todos de un mismo lote → el camino del TRASLADO, intacto', [p.scope, p.batchId], ['traslado', 'b1']);
}
{
    const p = spec.planReconciliation({
        paymentIds: ['p1', 'p2'],
        filas: [D('d1', 'p1', 'b1'), D('d2', 'p2', 'b2')],
        batchSizes: { b1: 1, b2: 1 },
    });
    eq('⚠️ dos lotes → UNA conciliación consolidada, no dos correos', p.scope, 'seleccion');
    eq('y conserva los dos movimientos', p.batchIds.sort(), ['b1', 'b2']);
}
{
    // EL CASO DEL REPORTE: ocho aportes girados de a uno, sin lote.
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const p = spec.planReconciliation({
        paymentIds: ids,
        filas: ids.map((id, i) => D(`d${i}`, id, null)),
    });
    eq('⚠️ OCHO GIROS SUELTOS SÍ SE CONCILIAN: es el defecto que se corrige', p.scope, 'seleccion');
    eq('los ocho entran', p.paymentIds.length, 8);
    eq('ninguno queda fuera', p.excluidos.length, 0);
    ok('y NO se inventa ningún lote', p.batchIds.length === 0 && p.sueltos.length === 8);
}
{
    const p = spec.planReconciliation({
        paymentIds: ['p1', 'p2'],
        filas: [D('d1', 'p1', 'b1'), D('d2', 'p2', null)],
        batchSizes: { b1: 4 },
    });
    eq('un lote MÁS un suelto también consolida', p.scope, 'seleccion');
    eq('⚠️ y se dice que del lote entra sólo una parte', p.parciales, [{ batchId: 'b1', incluidos: 1, total: 4 }]);
}
{
    const p = spec.planReconciliation({
        paymentIds: ['p1', 'p2'],
        filas: [D('d1', 'p1', null), D('d2', 'p2', null, 'reversado')],
    });
    eq('⚠️ un desembolso reversado no traslada nada: su aporte queda fuera', p.excluidos, ['p2']);
    eq('y el otro entra igual', p.paymentIds, ['p1']);
}
eq('un aporte sin ningún desembolso se nombra, no se calla',
    spec.planReconciliation({ paymentIds: ['p9'], filas: [] }).excluidos, ['p9']);

ok('⚠️ la referencia de una consolidada es CONC-, no LOTE-',
    /^CONC-[0-9A-F]{8}$/.test(spec.reconciliationRef('aaaa-bbbb-cccc-dd12ef34')),
    'un LOTE- inventado afirmaría una transferencia que el banco nunca vio');
eq('sin id no se inventa una referencia', spec.reconciliationRef(''), '');

section('· Lo que se DICE antes de mandar una consolidada');
{
    const p = spec.planReconciliation({
        paymentIds: ['p1', 'p2', 'p3'],
        filas: [D('d1', 'p1', 'b1'), D('d2', 'p2', 'b2'), D('d3', 'p3', null)],
        batchSizes: { b1: 5, b2: 1 },
    });
    const dichos = spec.describeReconciliationPlan(p, { batchRefOf: (id) => `LOTE-${id}` });
    ok('se dice de cuántos movimientos viene', dichos.some(a => /2 traslados agrupados y 1 giro suelto/.test(a)));
    ok('y que el documento conserva cada referencia', dichos.some(a => /referencia de cada movimiento original/.test(a)));
    ok('⚠️ y que NO se modifica ninguno', dichos.some(a => /no se modifica ninguno/.test(a)));
    ok('la cobertura parcial de un lote se nombra', dichos.some(a => /LOTE-b1[\s\S]*1 de sus 5/.test(a)));
    ok('⚠️ NINGUNA de estas frases dice que no se pueda continuar',
        !dichos.some(a => /no tiene|no se puede|ninguno pertenece/i.test(a)),
        'el aviso bloqueante de v4.1014 era falso: sí hay conciliación, sólo que no es la de un lote');
}
ok('un traslado que cubre más de lo elegido conserva su aviso de siempre',
    spec.describeReconciliationPlan({ scope: 'traslado', cubiertos: 8, paymentIds: ['p1', 'p2', 'p3'] })
        .some(a => /va COMPLETA/.test(a)));
ok('lo excluido se dice con su motivo',
    spec.describeReconciliationPlan({ scope: 'seleccion', paymentIds: ['p1'], excluidos: ['p2'], batchIds: [], sueltos: ['p1'] })
        .some(a => /no tiene un traslado vigente/.test(a)));

section('· La validación ya no exige un lote');
{
    const items2 = [{ status: 'confirmado', currency: 'COP' }];
    ok('⚠️ SIN LOTE Y CON ÁMBITO DE SELECCIÓN, SE PUEDE. Es la corrección.',
        spec.validateResend({ batch: null, items: items2, recipients: conCorreo, scope: 'seleccion' }).ok);
    ok('el ámbito se deduce del plan cuando no se declara',
        spec.validateResend({ batch: null, items: items2, recipients: conCorreo, plan: { scope: 'seleccion' } }).ok);
    ok('sin aportes vivos no hay nada que conciliar, y se dice con su motivo',
        !spec.validateResend({ batch: null, items: [], recipients: conCorreo, scope: 'seleccion' }).ok);
    ok('⚠️ sin lote y con ámbito de TRASLADO se sigue rechazando',
        !spec.validateResend({ batch: null, items: items2, recipients: conCorreo, scope: 'traslado' }).ok,
        'la regla de v4.1014 sigue entera en su propio ámbito');
}
{
    const r = spec.validateResend({
        batch: null, scope: 'seleccion', recipients: conCorreo,
        items: [{ status: 'confirmado', currency: 'COP' }, { status: 'confirmado', currency: 'USD' }],
    });
    ok('⚠️ una conciliación NO mezcla monedas, y se dice cómo salir',
        !r.ok && r.errores.some(e => /COP y USD/.test(e) && /Filtrá por moneda/.test(e)),
        'sumar pesos con dólares es el defecto que abrió el rediseño financiero (v4.841)');
}

section('· El documento consolidado conserva cada movimiento');
eq('la conciliación de un lote lleva las columnas de siempre',
    spec.columnsForScope('traslado').map(c => c.key),
    ['donante', 'fecha', 'referencia', 'bruto', 'comision', 'retencion', 'neto', 'estado']);
ok('⚠️ la consolidada agrega la columna del TRASLADO DE ORIGEN',
    spec.columnsForScope('seleccion').map(c => c.key).includes('traslado'),
    'sin ella, ocho filas de tres transferencias no se cruzan contra ningún extracto');
eq('y va justo antes de las cifras',
    spec.columnsForScope('seleccion').map(c => c.key).indexOf('traslado'), 3);
ok('las columnas de la consolidada se DERIVAN de las otras, no se copian',
    /CONSOLIDATED_COLUMNS = \[\s*\.\.\.RECONCILIATION_COLUMNS/.test(read('server/lib/reconciliationSpec.js')),
    'con dos listas, una columna corregida en una no llegaría a la otra');

{
    const r = spec.dateRangeOf(['2026-08-20T10:00:00Z', '2026-08-25T10:00:00Z', '2026-08-22T10:00:00Z']);
    ok('el rango toma la primera y la última', r.from.toISOString() < r.to.toISOString() && !r.single);
    ok('un solo día se marca como uno solo', spec.dateRangeOf(['2026-08-20T01:00:00Z', '2026-08-20T20:00:00Z']).single);
    eq('sin fechas no se inventa ninguna', spec.dateRangeOf([]).from, null);
}

section('· El documento y el correo lo dicen con las palabras correctas');
{
    const items3 = [{ status: 'confirmado', paymentId: 'p1', disbursementId: 'd1', batchId: 'b1', gross: 200000, netContribution: 190000, platformFee: 4200, amount: 190000, currency: 'COP', donorName: 'Ana', date: '2026-08-19', disbursedAt: '2026-08-20' }];
    const cab = {
        ref: 'CONC-AB12CD34', currency: 'COP', beneficiary: 'Club X', dateLabel: '20/08/2026 a 25/08/2026',
        sources: [{ kind: 'lote', ref: 'LOTE-0000B1', date: '2026-08-20', method: 'Transferencia', bankRef: 'TRX-1', count: 1, total: 3 }],
    };
    const csv = pdf.buildReconciliationCsv({ batch: cab, items: items3, scope: 'seleccion' });
    ok('el CSV se titula CONSOLIDADA', /Conciliación consolidada/.test(csv));
    ok('⚠️ y no dice «Traslado»: dice «Referencia de la conciliación»',
        /Referencia de la conciliación";"CONC-AB12CD34/.test(csv) && !/^"Traslado";/m.test(csv));
    ok('lleva la sección de movimientos de origen', /Movimientos de origen/.test(csv));
    ok('con la referencia, la fecha y la referencia bancaria de cada uno',
        /LOTE-0000B1";"Traslado agrupado/.test(csv) && /TRX-1/.test(csv));
    ok('y dice cuando de un traslado entra sólo una parte', /"1 de 3"/.test(csv));
    ok('la tabla lleva la columna del traslado de origen', /"Traslado de origen"/.test(csv));
    ok('el rango de fechas, no una fecha sola', /Fechas de los traslados";"20\/08\/2026 a 25\/08\/2026/.test(csv));

    const csvLote = pdf.buildReconciliationCsv({ batch: { id: 'b1', currency: 'COP', beneficiary: 'X', disbursedAt: '2026-08-20' }, items: items3 });
    ok('⚠️ y la conciliación de un LOTE sale como siempre',
        /^\uFEFF"Conciliación de aportes trasladados"/.test(csvLote) && !/Traslado de origen/.test(csvLote));
}

const correoSrc = read('server/lib/disbursementBatch.js');
ok('⚠️ el correo consolidado NO llama «traslado» a la referencia',
    /consolidada \? 'Referencia de la conciliación'/.test(correoSrc));
ok('la referencia declarada manda sobre la del lote',
    /batch_ref: String\(batch\.ref \|\| batchRef\(batch\.id\)\)/.test(correoSrc),
    'una consolidada no tiene id de lote: sin esto el correo se detendría por una variable obligatoria vacía');
ok('y la fecha admite un RANGO',
    /disbursement_date: String\(batch\.dateLabel \|\| formatDate/.test(correoSrc));

section('· El bloqueo de v4.1014 desapareció, y no sólo de la pantalla');
{
    const barra = codigo('src/components/admin/wallet/BulkReconciliationBar.tsx');
    ok('⚠️ la frase que bloqueaba ya no está', !/pertenece a un traslado agrupado/.test(barra));
    ok('⚠️ y el botón NO depende de que haya lotes',
        !/lotes\.length > 0/.test(barra) && /conciliables > 0/.test(barra),
        'no se resolvió escondiendo el mensaje: el botón mira si hay aportes conciliables');
    ok('la barra pide el ámbito al servidor', /reconciliations\/resolve/.test(barra));
    ok('y el modal trabaja con APORTES, no con lotes',
        /paymentIds=\{elegidos\.map/.test(barra) && !/batchIds=\{/.test(barra));
}
{
    const modal = codigo('src/components/admin/wallet/ResendNoticeModal.tsx');
    ok('el modal recibe los aportes', /paymentIds: string\[\]/.test(modal));
    ok('⚠️ y NO deduce el ámbito: lo lee de la respuesta', !/scope === 'seleccion' \? .*batchId/.test(modal) && /setScope\(data\.scope\)/.test(modal));
    ok('pinta los movimientos de origen', /Movimientos de origen/.test(modal));
}
{
    const espejo2 = codigo('src/lib/reconciliationSpec.ts');
    ok('⚠️ el espejo NO trae el criterio del ámbito', !/planReconciliation/.test(espejo2),
        'con dos criterios, la pantalla prometería un documento y saldría otro');
    ok('sólo trae los rótulos', /AMBITO_LABEL/.test(espejo2));
}

section('· El esquema y las rutas de la conciliación por aportes');
{
    const ensure = read('server/lib/ensureDisbursementSchema.js');
    ok('⚠️ `batchId` del reenvío ya NO es obligatorio',
        !/"batchId"\s+TEXT NOT NULL,/.test(ensure),
        'esa columna era, ella sola, el bloqueo: sin lote no se podía ni escribir la fila');
    ok('y se afloja también en una base que ya la tenía',
        /ALTER TABLE "DisbursementNotice" ALTER COLUMN "batchId" DROP NOT NULL/.test(ensure));
    for (const col of ['scope', '"paymentIds"', '"disbursementIds"', '"batchIds"']) {
        ok(`⚠️ la columna ${col} está ENUMERADA en los ALTER (trampa de v4.908)`,
            new RegExp(`ALTER TABLE "DisbursementNotice" ADD COLUMN IF NOT EXISTS ${col.replace(/"/g, '"')}`).test(ensure));
    }
    ok('⚠️ los ALTER corren por LAS DOS vías del ensure',
        /await db\.query\(ALTERS \+ BATCH_SQL \+ NOTICE_SQL\)/.test(ensure)
        && /ALTER TABLE "DisbursementNotice"/.test(ensure.slice(ensure.indexOf('const NOTICE_SQL'))),
        'CREATE TABLE IF NOT EXISTS no amplía nada, y la base de producción ya tiene la tabla');
}
{
    const rutas = read('server/routes/financial.js');
    for (const r2 of ['resolve', 'document', 'resend']) {
        ok(`la ruta /wallet/reconciliations/${r2} existe y pide rol administrativo`,
            new RegExp(`'/wallet/reconciliations/${r2}', authMiddleware, requireSiteAdmin`).test(rutas));
    }
    ok('⚠️ las del LOTE se conservan enteras: un bundle en caché sigue andando',
        /'\/wallet\/disbursement-batches\/:id\/resend'/.test(rutas));
}
{
    // ⚠️ `codigo()` Y NO `read()`. El encabezado de ese archivo EXPLICA la
    // regla nombrando `INSERT INTO "Disbursement"`, así que leído entero la
    // comprobación falla contra su propia documentación — es la lección de
    // v4.991: el comentario que explica una comprobación puede romperla.
    const orq = codigo('server/lib/reconciliationNotices.js');
    ok('⚠️ el reenvío NO crea un desembolso',
        !/INSERT INTO "Disbursement"/.test(orq) && !/INSERT INTO "DisbursementBatch"/.test(orq),
        'fabricar un lote para poder conciliar sería el movimiento de dinero que este módulo tiene prohibido');
    ok('⚠️ ni toca un estado financiero',
        !/UPDATE "Disbursement"/.test(orq) && !/UPDATE "Payment"/.test(orq) && !/UPDATE "DisbursementBatch"/.test(orq));
    ok('⚠️ las tres vías pasan por el MISMO punto de resolución',
        (orq.match(/await resolveReconciliation\(/g) || []).length >= 2
        && /export const resolveReconciliation/.test(orq),
        'con tres resoluciones, la vista previa prometería un documento y el correo llevaría otro');
    ok('y la fila guarda su ALCANCE, no sólo el lote',
        /"paymentIds", "disbursementIds", "batchIds"/.test(orq));
}
{
    const mapper = codigo('server/lib/disbursements.js');
    ok('⚠️ hay UN solo mapeador de aportes conciliables',
        (mapper.match(/const mapearAportes = async/g) || []).length === 1
        && /return mapearAportes\(des\);[\s\S]*return mapearAportes\(des\);/.test(mapper),
        'con dos, la conciliación de un lote y la consolidada mostrarían cifras distintas del mismo aporte');
}

// ════════════════════════════════════════════════════════════════════
// UNA MARCA DE AGRUPACIÓN NO ES UN LOTE (v4.1017)
//
// `Disbursement.batchId` agrupa los movimientos de un mismo giro desde v4.887 y
// `DisbursementBatch` es de v4.996: los giros en bloque de en medio —los que
// hay en producción— tienen la marca y no tienen ficha. Cuatro puertas daban
// al mismo 404 y ninguna la veía una prueba de criterio.
// ════════════════════════════════════════════════════════════════════
section('Una marca de agrupación no es un lote');
{
    const plan = spec.planReconciliation({
        paymentIds: ['p1', 'p2'],
        filas: [
            { id: 'd1', paymentId: 'p1', batchId: 'grp-viejo', status: 'confirmado' },
            { id: 'd2', paymentId: 'p2', batchId: 'grp-viejo', status: 'confirmado' },
        ],
        knownBatches: [],           // ninguna ficha: es el estado de producción
        batchSizes: { 'grp-viejo': 5 },
    });
    eq('⚠️ sin ficha NO se abre el camino del traslado', plan.scope, 'seleccion');
    eq('la marca se nombra aparte de los lotes', plan.agrupaciones, ['grp-viejo']);
    eq('y no se cuela en batchIds', plan.batchIds, []);
    eq('los dos aportes entran igual', plan.paymentIds.length, 2);
    ok('y se DICE que del giro entran 2 de sus 5',
        spec.describeReconciliationPlan(plan).some(a => /2 de sus 5/.test(a)),
        JSON.stringify(spec.describeReconciliationPlan(plan)));
    ok('sin ningún aviso que impida continuar',
        !spec.describeReconciliationPlan(plan).some(a => /no existe|no se puede|ninguno pertenece/i.test(a)));

    const conFicha = spec.planReconciliation({
        paymentIds: ['p1', 'p2'],
        filas: [
            { id: 'd1', paymentId: 'p1', batchId: 'lote-real', status: 'confirmado' },
            { id: 'd2', paymentId: 'p2', batchId: 'lote-real', status: 'confirmado' },
        ],
        knownBatches: ['lote-real'],
        batchSizes: { 'lote-real': 2 },
    });
    eq('⚠️ y con ficha sigue siendo el camino de siempre', conFicha.scope, 'traslado');
    eq('apuntando a su lote', conFicha.batchId, 'lote-real');

    const sinCatalogo = spec.planReconciliation({
        paymentIds: ['p1'],
        filas: [{ id: 'd1', paymentId: 'p1', batchId: 'lote-real', status: 'confirmado' }],
    });
    eq('⚠️ omitir el catálogo se comporta como antes de v4.1017', sinCatalogo.scope, 'traslado');
}
{
    const orq = codigo('server/lib/reconciliationNotices.js');
    ok('⚠️ el ámbito se decide con las fichas que EXISTEN, no con la marca',
        /knownBatches:\s*conFicha/.test(orq) && /batches\.map\(b => String\(b\.id\)\)/.test(orq),
        'sin esto, una agrupación sin ficha vuelve a resolver al camino del lote y muere en batchRow');
    ok('y el tamaño de una agrupación se DERIVA de sus filas',
        /groupSizes\(huerfanos, clubId\)/.test(orq));
}
{
    const lector = codigo('server/lib/disbursements.js');
    ok('⚠️ el desembolso DICE si su marca tiene ficha de traslado',
        /AS "batchTracked"/.test(lector) && /batchTracked: r\.batchId \?/.test(lector),
        'es el dato con el que la pantalla decide si ofrece un botón que lleva a alguna parte');
    ok('el tamaño de la agrupación sale de UNA consulta agrupada, no de una por marca',
        /GROUP BY "batchId"/.test(lector));
    ok('⚠️ y LAS DOS lecturas de desembolsos piden lo mismo',
        (lector.match(/\$\{BATCH_COLS\}/g) || []).length === 2
        && !/SELECT \* FROM "Disbursement" WHERE "paymentId"/.test(lector),
        'la ficha del aporte lo traía y el listado de la Bóveda leía con SELECT *: '
        + 'el campo llegaba undefined y el botón se pintaba igual (la lección de providerRef)');
}
{
    const ficha = codigo('src/pages/admin/WalletManagement.tsx');
    ok('⚠️ «Ver traslado y conciliación» exige que la ficha EXISTA',
        /batchTracked !== false/.test(ficha),
        'con sólo batchId, el botón se pinta sobre un giro sin ficha y da 404');
    ok('y un giro conjunto sin ficha se explica en vez de dejar el hueco',
        /giroSinFicha/.test(ficha) && /Reenviar notificación/.test(ficha));
    ok('⚠️ el modal de conciliación se monta con APORTES, no con lotes',
        !/batchIds=\{/.test(ficha) && /paymentIds=\{\[trasladoAbierto\]\}/.test(ficha),
        'v4.1015 renombró la prop y este montaje se quedó con la vieja: abría sin ningún aporte');

    const seccion = codigo('src/components/admin/wallet/DisbursementSection.tsx');
    ok('⚠️ «Ver desembolso» también exige la ficha',
        /batchTracked !== false/.test(seccion));
}

console.log(`\n${'─'.repeat(60)}\n${pass} pasaron, ${fail} fallaron`);
if (!fail) console.log('Reenviar la conciliación no mueve dinero, y se puede demostrar.');
process.exit(fail ? 1 : 0);
