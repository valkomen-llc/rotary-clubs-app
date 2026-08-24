#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El CICLO DE VIDA de un aporte.  npm run test:wallet:lifecycle
// v4.885.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro y vive aparte de la
// orquestación, como `seoRules.js` frente a `seoAudit.js` y `ledgerSpec.js`
// frente a `ledger.js`.
//
// LO QUE ESTAS PRUEBAS PROTEGEN SOBRE TODO es una regla: una FECHA VENCIDA gana
// sobre una columna sin actualizar. Es el defecto que se reportó con capturas
// —aportes del 19 de agosto todavía «En tránsito» el 24— y su causa era una
// condición que no dependía del tiempo:
//
//     if (p.stripeStatus === 'pending' || ...) return 'in_transit';
//
// Si alguien la reintroduce, el bloque 2 falla.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    PLATFORM_HOLDING_DAYS, LIFECYCLE_STATES, STATE_IDS, isState, stateLabel,
    canTransition, mergeState, bucketOf, scheduleOf, planFor, canDisburse,
    DISBURSEMENT_METHODS, METHOD_IDS, isMethod,
    RECEIPT_MIMES, RECEIPT_MAX_BYTES, receiptExtension, checkReceipt,
    disbursementBalance, stateFromDisbursements, validateDisbursement,
    disbursementShape, buildTimeline, eventLabel,
} from '../server/lib/walletLifecycle.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
    `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const DIA = 24 * 60 * 60 * 1000;
// El día del reporte real, con los aportes del 19-21 de agosto todavía en
// tránsito. Las fechas son las de las capturas, no unas inventadas para que la
// prueba pase — misma exigencia que las cifras del sismo en `test:contribution`.
const AHORA = new Date('2026-08-24T12:00:00Z');
const hace = (dias) => new Date(AHORA.getTime() - dias * DIA);
const dentro = (dias) => new Date(AHORA.getTime() + dias * DIA);

const pago = (extra = {}) => ({
    id: 'pay_1', clubId: 'club_1', status: 'succeeded',
    amount: 200000, currency: 'COP', netAmount: 185000,
    createdAt: hace(5), stripeStatus: 'pending',
    availableOn: null, clubAvailableOn: null, ...extra,
});

// ── 1. El catálogo ──────────────────────────────────────────────────
section('1. El catálogo de estados es cerrado y ordenado');

ok('los seis estados del camino existen',
    ['processing', 'in_transit', 'available_soon', 'available', 'disbursing', 'disbursed']
        .every(isState));
ok('y los dos terminales por hecho nuevo también', isState('refunded') && isState('failed'));
ok('un estado inventado no existe', !isState('disponible') && !isState(''));
ok('«disbursed» es terminal', LIFECYCLE_STATES.disbursed.terminal === true);
ok('«available» NO es terminal: el dinero sigue moviéndose después',
    LIFECYCLE_STATES.available.terminal === false);
ok('cada estado declara su rótulo en español',
    STATE_IDS.every(id => typeof LIFECYCLE_STATES[id].label === 'string' && LIFECYCLE_STATES[id].label.length > 2));
ok('y su ayuda, que es lo que explica la diferencia entre disponible y desembolsado',
    /no significa desembolsado/i.test(LIFECYCLE_STATES.available.help));
eq('el margen de la plataforma sigue siendo 6 días', PLATFORM_HOLDING_DAYS, 6);

// ── 2. EL DEFECTO REPORTADO ─────────────────────────────────────────
section('2. ⚠️ Una FECHA VENCIDA gana sobre una columna sin actualizar');

ok('un aporte con la fecha de Stripe vencida NO se queda «En tránsito» aunque la columna diga pending',
    bucketOf(pago({ stripeStatus: 'pending', availableOn: hace(12), clubAvailableOn: hace(6) }), AHORA) === 'available',
    bucketOf(pago({ stripeStatus: 'pending', availableOn: hace(12), clubAvailableOn: hace(6) }), AHORA));

ok('el caso exacto del reporte: cobro del 19/08, liberado por Stripe, mirado el 24/08',
    bucketOf(pago({
        createdAt: new Date('2026-08-19T11:15:00Z'),
        availableOn: new Date('2026-08-21T00:00:00Z'),
        clubAvailableOn: new Date('2026-08-27T00:00:00Z'),
        stripeStatus: 'pending',
    }), AHORA) === 'available_soon');

ok('con la fecha de Stripe todavía por venir, sí está en tránsito',
    bucketOf(pago({ availableOn: dentro(2), clubAvailableOn: dentro(8) }), AHORA) === 'in_transit');

ok('sin fecha de Stripe se queda en tránsito: no se afirma lo que no se sabe',
    bucketOf(pago({ availableOn: null, clubAvailableOn: null, stripeStatus: 'available' }), AHORA) === 'in_transit');

ok('el margen de la plataforma se DERIVA cuando clubAvailableOn falta',
    bucketOf(pago({ availableOn: hace(3), clubAvailableOn: null }), AHORA) === 'available_soon');
ok('y una vez pasados los 6 días, disponible',
    bucketOf(pago({ availableOn: hace(7), clubAvailableOn: null }), AHORA) === 'available');

ok('un reembolso manda sobre cualquier fecha',
    bucketOf(pago({ status: 'refunded', availableOn: hace(30) }), AHORA) === 'refunded');
ok('y un fallo también',
    bucketOf(pago({ status: 'failed', availableOn: hace(30) }), AHORA) === 'failed');
ok('un cobro pendiente es «processing», no «en tránsito»',
    bucketOf(pago({ status: 'pending' }), AHORA) === 'processing');

ok('PayPal, que no tiene tránsito del proveedor, decide por clubAvailableOn',
    bucketOf(pago({ availableOn: null, clubAvailableOn: hace(1) }), AHORA) === 'available');

ok('una fecha ilegible no rompe nada: se trata como ausente',
    bucketOf(pago({ availableOn: 'no-es-una-fecha' }), AHORA) === 'in_transit');
ok('un pago nulo no revienta', bucketOf(null, AHORA) === 'processing');

// La comprobación que impide la regresión, leyendo el archivo: el criterio ya
// no puede volver a decidir con una columna que nadie actualiza.
section('2b. La condición vieja no puede volver');
const fuente = read('server/lib/walletLifecycle.js');
const rama = fuente.slice(fuente.indexOf('export const bucketOf'), fuente.indexOf('const fechaValida'));
ok('`bucketOf` no vuelve a devolver in_transit por `stripeStatus`',
    !/stripeStatus[^\n]*===[^\n]*pending[^\n]*\n?[^\n]*in_transit/.test(rama)
    && !rama.includes("p.stripeStatus === 'pending' ||"));
ok('y `now` sigue entrando como parámetro, no leyéndose del reloj por dentro',
    /export const bucketOf = \(p, now = new Date\(\)\)/.test(fuente));

const controlador = read('server/controllers/financialController.js');
ok('el controlador ya NO tiene su propio criterio: importa el puro',
    controlador.includes("from '../lib/walletLifecycle.js'")
    && controlador.includes('const bucketOf = (p, now) => bucketOfPuro(p, now)'));

// ── 3. El camino no retrocede ───────────────────────────────────────
section('3. El camino del dinero no retrocede');

ok('se puede avanzar', canTransition('in_transit', 'available'));
ok('no se puede retroceder', !canTransition('available', 'in_transit'));
ok('ni quedarse quieto', !canTransition('available', 'available'));
ok('un reembolso llega desde donde sea', canTransition('available', 'refunded'));
ok('de un terminal no se sale', !canTransition('refunded', 'available'));
ok('ni siquiera hacia otro terminal', !canTransition('disbursed', 'available'));
ok('un estado inventado no transiciona', !canTransition('available', 'pagado'));

eq('mergeState conserva el más avanzado ante un evento fuera de orden',
    mergeState('available', 'in_transit'), 'available');
eq('y adopta el nuevo cuando de verdad avanza',
    mergeState('in_transit', 'available'), 'available');
eq('sin estado previo, adopta el nuevo', mergeState(null, 'in_transit'), 'in_transit');
eq('un estado desconocido no pisa al bueno', mergeState('available', 'vendido'), 'available');

// ── 4. El calendario ────────────────────────────────────────────────
section('4. El calendario de un aporte');

const cal = scheduleOf(pago({ availableOn: dentro(2), clubAvailableOn: dentro(8) }), AHORA);
eq('días restantes hasta que el club pueda usarlo', cal.diasRestantes, 8);
ok('no está liberado todavía', cal.liberadoEl === null);
ok('la fuente es la fecha guardada', cal.fuente === 'guardada');
ok('y no está marcado como estimado', cal.estimado === false);

const cal2 = scheduleOf(pago({ availableOn: hace(10), clubAvailableOn: hace(4) }), AHORA);
eq('un aporte ya liberado no debe días', cal2.diasRestantes, 0);
ok('y declara CUÁNDO se liberó de verdad', !!cal2.liberadoEl);

const cal3 = scheduleOf(pago({ availableOn: null, clubAvailableOn: null }), AHORA);
ok('⚠️ sin fecha de Stripe la fecha se ESTIMA y viaja MARCADA', cal3.estimado === true);
ok('con su fuente dicha', cal3.fuente === 'estimada');
ok('pero la estimación NO decide el estado', cal3.estado === 'in_transit');

const cal4 = scheduleOf(pago({ availableOn: hace(3), clubAvailableOn: null }), AHORA);
ok('derivar del availableOn no es estimar: es aritmética sobre un dato de Stripe',
    cal4.estimado === false && cal4.fuente === 'derivada_de_stripe');

ok('los días restantes se redondean HACIA ARRIBA',
    scheduleOf(pago({ clubAvailableOn: new Date(AHORA.getTime() + 1.2 * DIA) }), AHORA).diasRestantes === 2);
ok('y nunca son negativos',
    scheduleOf(pago({ clubAvailableOn: hace(40) }), AHORA).diasRestantes === 0);

// ── 5. El plan del barrido ──────────────────────────────────────────
section('5. Qué hacer con cada aporte');

eq('sin fecha de Stripe hay que preguntársela',
    planFor(pago({ availableOn: null }), AHORA).accion, 'consultar_stripe');
eq('con la columna atrasada y la fecha vencida, también',
    planFor(pago({ stripeStatus: 'pending', availableOn: hace(9), clubAvailableOn: hace(3), lifecycleState: 'available' }), AHORA).accion,
    'consultar_stripe');
eq('cuando sólo se movió el calendario, se anota sin gastar una llamada',
    planFor(pago({ stripeStatus: 'available', availableOn: hace(9), clubAvailableOn: hace(3), lifecycleState: 'in_transit' }), AHORA).accion,
    'anotar_estado');
eq('y si ya está al día, no se hace nada',
    planFor(pago({ stripeStatus: 'available', availableOn: hace(9), clubAvailableOn: hace(3), lifecycleState: 'available' }), AHORA).accion,
    'ninguna');
eq('un terminal no se consulta: gastar en confirmar un reembolso es gastar por nada',
    planFor(pago({ status: 'refunded' }), AHORA).accion, 'ninguna');
ok('el plan SIEMPRE dice el motivo',
    ['consultar_stripe', 'anotar_estado', 'ninguna'].every(() => true)
    && typeof planFor(pago(), AHORA).motivo === 'string'
    && planFor(pago(), AHORA).motivo.length > 5);

// ── 5b. ¿Se puede desembolsar? ──────────────────────────────────────
section('5b. ⚠️ «En tránsito» significa DOS cosas y sólo una bloquea');

ok('un aporte disponible se puede desembolsar',
    canDisburse(pago({ availableOn: hace(9), clubAvailableOn: hace(3) }), AHORA).ok === true);

const retenido = canDisburse(pago({ availableOn: dentro(3), clubAvailableOn: dentro(9) }), AHORA);
ok('⚠️ con fecha FUTURA de Stripe se bloquea: el dinero todavía no salió del proveedor',
    retenido.ok === false);
ok('y el motivo dice cuántos días faltan y desde cuándo',
    /libera en 3 día\(s\)/.test(retenido.motivo), retenido.motivo);

const sinFecha = canDisburse(pago({ availableOn: null, providerRef: null }), AHORA);
ok('⚠️ SIN fecha se PERMITE: el estado es una suposición prudente, no un dato',
    sinFecha.ok === true);
ok('y se avisa que la plataforma nunca lo va a resolver sola',
    /nunca se va a resolver solo/.test(sinFecha.aviso), sinFecha.aviso);
ok('con referencia del proveedor pero sin fecha, el aviso es otro',
    /suposición prudente/.test(canDisburse(pago({ availableOn: null, providerRef: 'pi_1' }), AHORA).aviso));

const enMargen = canDisburse(pago({ availableOn: hace(2), clubAvailableOn: dentro(4) }), AHORA);
ok('liberado por Stripe pero dentro del margen propio: se permite con aviso',
    enMargen.ok === true && /margen operativo/.test(enMargen.aviso));

ok('un reembolsado no se desembolsa',
    canDisburse(pago({ status: 'refunded' }), AHORA).ok === false);
ok('ni un cobro fallido',
    canDisburse(pago({ status: 'failed' }), AHORA).ok === false);
ok('ni uno todavía sin confirmar',
    canDisburse(pago({ status: 'pending' }), AHORA).ok === false);
ok('un aporte disponible no lleva aviso: es el camino normal',
    canDisburse(pago({ availableOn: hace(9), clubAvailableOn: hace(3) }), AHORA).aviso === null);

// ── 6. Desembolsos parciales ────────────────────────────────────────
section('6. Un aporte no se marca desembolsado hasta que la suma llega');

const b0 = disbursementBalance({ net: 1000, disbursements: [], currency: 'USD' });
ok('sin desembolsos no está completo', b0.completo === false && b0.restante === 1000);
ok('ni parcial', b0.parcial === false);
eq('y los desembolsos no dicen nada del estado', stateFromDisbursements(b0), null);

const b1 = disbursementBalance({ net: 1000, disbursements: [{ amount: 400, status: 'confirmado' }], currency: 'USD' });
ok('con un parcial, NO está completo', b1.completo === false);
ok('queda lo que falta', b1.restante === 600);
eq('y el estado es «desembolso iniciado»', stateFromDisbursements(b1), 'disbursing');

const b2 = disbursementBalance({
    net: 1000, currency: 'USD',
    disbursements: [{ amount: 400, status: 'confirmado' }, { amount: 600, status: 'confirmado' }],
});
ok('cuando la suma llega, está completo', b2.completo === true && b2.restante === 0);
eq('y el estado es «desembolsado»', stateFromDisbursements(b2), 'disbursed');

const b3 = disbursementBalance({
    net: 1000, currency: 'USD',
    disbursements: [{ amount: 400, status: 'confirmado' }, { amount: 600, status: 'reversado' }],
});
ok('⚠️ un desembolso REVERSADO no suma: no trasladó nada', b3.completo === false && b3.cubierto === 400);
eq('y se cuenta aparte', b3.reversados, 1);

const b4 = disbursementBalance({
    net: 1484437, currency: 'COP',
    disbursements: [{ amount: 494812.33, status: 'confirmado' },
                    { amount: 494812.33, status: 'confirmado' },
                    { amount: 494812.34, status: 'confirmado' }],
});
ok('tres giros exactos en pesos cierran el aporte pese al punto flotante', b4.completo === true);

// ── 7. La validación del formulario ─────────────────────────────────
section('7. El administrador escribe, el código decide');

const base = { amount: 500, disbursedAt: hace(1).toISOString(), beneficiary: 'Fundación X', method: 'transferencia', reference: 'TRF-1' };
const saldo = disbursementBalance({ net: 1000, disbursements: [], currency: 'USD' });

ok('un desembolso bien formado pasa',
    validateDisbursement(disbursementShape(base), { balance: saldo, now: AHORA }).ok);

ok('un monto que supera lo disponible se rechaza',
    !validateDisbursement(disbursementShape({ ...base, amount: 1500 }), { balance: saldo, now: AHORA }).ok);
ok('un monto cero también',
    !validateDisbursement(disbursementShape({ ...base, amount: 0 }), { balance: saldo, now: AHORA }).ok);
ok('una fecha futura se rechaza: se registra lo que ocurrió, no lo que se planea',
    !validateDisbursement(disbursementShape({ ...base, disbursedAt: dentro(5).toISOString() }), { balance: saldo, now: AHORA }).ok);
ok('sin beneficiario no se registra',
    !validateDisbursement(disbursementShape({ ...base, beneficiary: '  ' }), { balance: saldo, now: AHORA }).ok);
ok('un medio inventado se rechaza nombrando los válidos',
    /admitidos son/.test(validateDisbursement({ ...base, method: 'telepatia' }, { balance: saldo, now: AHORA }).errores.join(' ')));

const sinRef = validateDisbursement(disbursementShape({ ...base, reference: '' }), { balance: saldo, now: AHORA });
ok('⚠️ sin referencia se AVISA, no se bloquea: un traslado en efectivo puede no tenerla', sinRef.ok === true);
ok('y el aviso dice la consecuencia', /extracto bancario/i.test(sinRef.avisos.join(' ')));

ok('pedir notificar sin dirección se rechaza',
    !validateDisbursement(disbursementShape({ ...base, notify: true, notifyEmail: '' }), { balance: saldo, now: AHORA }).ok);
ok('un correo mal escrito se rechaza',
    !validateDisbursement(disbursementShape({ ...base, notifyEmail: 'no-es-correo' }), { balance: saldo, now: AHORA }).ok);
ok('se devuelven TODOS los errores, no el primero',
    validateDisbursement({ amount: -1, beneficiary: '', method: 'x', disbursedAt: null }, { balance: saldo, now: AHORA }).errores.length >= 4);

section('7b. El cuerpo se sanea: lo que no está declarado no se puede expresar');
const sucio = disbursementShape({ ...base, id: 'ajeno', status: 'reversado', clubId: 'otro', notes: 'ok' });
ok('un `id` del cuerpo no entra', sucio.id === undefined);
ok('un `status` del cuerpo no entra', sucio.status === undefined);
ok('un `clubId` del cuerpo no entra', sucio.clubId === undefined);
ok('el monto se redondea a dos decimales', disbursementShape({ ...base, amount: 12.3456 }).amount === 12.35);
ok('el correo se normaliza a minúsculas', disbursementShape({ ...base, notifyEmail: ' Ana@Club.ORG ' }).notifyEmail === 'ana@club.org');
ok('notify sólo es true si es exactamente true', disbursementShape({ ...base, notify: 'si' }).notify === false);

// ── 8. El comprobante ───────────────────────────────────────────────
section('8. El comprobante');

ok('PDF, JPG y PNG se aceptan',
    checkReceipt({ mime: 'application/pdf', bytes: 1000 }).ok
    && checkReceipt({ mime: 'image/jpeg', bytes: 1000 }).ok
    && checkReceipt({ mime: 'image/png', bytes: 1000 }).ok);
ok('un ejecutable no',
    !checkReceipt({ mime: 'application/x-msdownload', bytes: 1000 }).ok);
ok('y el motivo nombra lo que sí se admite',
    /PDF, JPG y PNG/.test(checkReceipt({ mime: 'text/html', bytes: 10 }).errores.join(' ')));
ok('un archivo vacío se rechaza aparte del tipo',
    /vacío/.test(checkReceipt({ mime: 'application/pdf', bytes: 0 }).errores.join(' ')));
ok('uno demasiado grande dice cuánto pesa y cuál es el máximo',
    /MB y el máximo es/.test(checkReceipt({ mime: 'application/pdf', bytes: RECEIPT_MAX_BYTES + 1 }).errores.join(' ')));
eq('la extensión sale del tipo, no del nombre del archivo', receiptExtension('image/jpeg'), 'jpg');
eq('un tipo desconocido no tiene extensión', receiptExtension('image/gif'), null);

// ── 9. La línea de tiempo ───────────────────────────────────────────
section('9. La línea de tiempo sale de datos, no del navegador');

const linea = buildTimeline([
    { kind: 'available', toState: 'available', occurredAt: '2026-08-25T00:00:00Z' },
    { kind: 'received', toState: 'processing', occurredAt: '2026-08-19T11:15:00Z' },
    { kind: 'disbursed', toState: 'disbursed', occurredAt: '2026-08-26T00:00:00Z', actorLabel: 'Ana' },
]);
eq('se ordena por cuándo ocurrió', linea.map(e => e.kind), ['received', 'available', 'disbursed']);
ok('cada evento sale rotulado en español', linea.every(e => e.label && e.label !== e.kind));
ok('y conserva quién lo hizo', linea[2].actor === 'Ana');
ok('un evento sin `kind` se descarta en vez de pintar un renglón vacío',
    buildTimeline([{ occurredAt: '2026-08-19T00:00:00Z' }]).length === 0);
ok('dos eventos del mismo instante salen SIEMPRE en el mismo orden',
    JSON.stringify(buildTimeline([
        { kind: 'available', toState: 'available', occurredAt: '2026-08-25T00:00:00Z' },
        { kind: 'in_transit', toState: 'in_transit', occurredAt: '2026-08-25T00:00:00Z' },
    ]).map(e => e.kind)) === JSON.stringify(['in_transit', 'available']));
ok('el rótulo de un evento desconocido no revienta', typeof eventLabel('inventado') === 'string');

// ── 10. Las reglas que no se pueden perder ──────────────────────────
section('10. Reglas del módulo, comprobadas sobre los archivos');

const disb = read('server/lib/disbursements.js');
ok('⚠️ NO hay un DELETE de desembolsos: corregir es reversar',
    !/DELETE\s+FROM\s+"Disbursement"/i.test(disb));
ok('el reverso EXIGE motivo escrito',
    /Un reverso necesita su motivo escrito/.test(disb));
ok('el comprobante se guarda como CLAVE, nunca como URL pública',
    disb.includes('private/disbursements/') && disb.includes('CacheControl:'));
ok('la clave de S3 NO viaja al navegador: sólo `hasReceipt`',
    /hasReceipt: !!r\.receiptKey/.test(disb) && !/receiptKey: r\.receiptKey/.test(disb));
ok('el `ON CONFLICT` del índice PARCIAL repite su predicado',
    /ON CONFLICT \("paymentId", reference\)[\s\S]{0,120}WHERE reference IS NOT NULL AND status = 'confirmado'/.test(disb));
ok('⚠️ si el correo falla el desembolso NO se revierte: se devuelve el fallo, no se lanza',
    /NO se lanza: el desembolso ya está escrito/.test(disb));
ok('no se escribe un segundo sistema de correo: se reutiliza EmailService y la bitácora',
    disb.includes('EmailService.sendPlatformEmail') && disb.includes('claimDelivery'));

const sweep = read('server/lib/walletSweep.js');
ok('el barrido elige candidatos por CRITERIO, así que un pago corregido deja de serlo solo',
    /availableOn" IS NULL OR \(p\."stripeStatus" = 'pending' AND p\."availableOn" <= NOW\(\)\)/.test(sweep));
ok('⚠️ el barrido NO recalcula la retención con la tarifa de hoy',
    /LA COMISIÓN SÓLO SE ESCRIBE SI FALTA/.test(sweep));
ok('y el error de Stripe se propaga TEXTUAL',
    /e\?\.code, e\?\.message/.test(sweep));
ok('lo que no entra en el presupuesto se DICE, no se corta en silencio',
    /resumen\.pendientes = candidatos\.length/.test(sweep));

// ⚠️ v4.886 — LA REGRESIÓN QUE COSTÓ LA PRIMERA VUELTA.
//
// `findCalendarCandidates` no pedía `providerRef`, así que la reconciliación
// —que pregunta `if (necesitaStripe && p.providerRef)`— lo leía como
// `undefined` y NINGÚN aporte llegaba a consultarse contra Stripe: todos caían
// en «sin referencia del proveedor». Se vio en producción como
// «5: no_provider_reference» sobre cinco pagos que sí la tenían.
//
// Es el mismo error que v4.847 con `clubId`. Se comprueba columna por columna
// porque el fallo es MUDO: el código es válido, los tipos están bien y la
// condición simplemente nunca se cumple.
section('10b. El SELECT pide todo lo que sus llamadores leen');
const selCalendario = sweep.slice(
    sweep.indexOf('export const findCalendarCandidates'),
    sweep.indexOf('/* ─── PREGUNTARLE A STRIPE'));
for (const col of ['providerRef', 'applicationFee', 'rawPayload', 'stripeBalanceTxId', 'netAmount', 'clubId']) {
    ok(`findCalendarCandidates pide "${col}"`, selCalendario.includes(`p."${col}"`));
}
const selStripe = sweep.slice(
    sweep.indexOf('export const findStripeCandidates'),
    sweep.indexOf('export const findCalendarCandidates'));
for (const col of ['providerRef', 'applicationFee', 'rawPayload', 'clubId']) {
    ok(`findStripeCandidates pide "${col}"`, selStripe.includes(`p."${col}"`));
}

const rec = read('server/lib/walletReconcile.js');
ok('⚠️ la reconciliación es de ENSAYO por defecto',
    /apply = false/.test(rec) && /Ensayo: no se escribió nada/.test(rec));
ok('y NO inventa una fecha cuando no puede consultar al proveedor',
    /sin_referencia_del_proveedor/.test(rec) && /no se adivina/i.test(rec));
ok('lo no corregido se agrupa por motivo con ejemplos',
    /noCorregidos/.test(rec) && /ejemplos/.test(rec));

const ctrl = read('server/controllers/disbursementController.js');
ok('⚠️ registrar un desembolso EXIGE confirmación explícita',
    /confirm === true/.test(ctrl) && /428/.test(ctrl));
ok('el reverso también', /Falta la confirmación explícita para reversar/.test(ctrl));
ok('el aislamiento va en el WHERE, no en una comprobación posterior',
    /WHERE id = \$1 AND "clubId" = \$2/.test(ctrl));
ok('lo que se bloquea es lo que el PROVEEDOR retiene, no todo lo no disponible',
    /canDisburse\(pago, new Date\(\)\)/.test(ctrl)
    && /No se puede registrar un desembolso de este aporte/.test(ctrl));
ok('el desembolso en bloque escribe UNA FILA POR APORTE, no un registro agregado',
    /UNA FILA POR APORTE, NUNCA UN REGISTRO AGREGADO/.test(ctrl));
ok('y el monto NO se recibe del cuerpo: se calcula por aporte',
    /EL MONTO NO SE RECIBE/.test(ctrl) && /amount: saldo\.restante/.test(ctrl));
ok('lo que no entró en el bloque se devuelve con su motivo',
    /saltados\.push\(\{ id, motivo/.test(ctrl));
ok('y el total del bloque va POR MONEDA, nunca sumado',
    /El total se devuelve POR MONEDA/.test(ctrl));

// ── v4.887 — El comprobante del giro ────────────────────────────────
section('10c. Un giro que cubre N aportes tiene UN comprobante');

ok('⚠️ el comprobante del bloque se sube UNA sola vez, fuera del bucle',
    ctrl.indexOf('EL COMPROBANTE DEL LOTE SE SUBE UNA SOLA VEZ') > 0
    && ctrl.indexOf('let comprobante = null;') < ctrl.indexOf('for (const id of ids)'),
    'la subida tiene que estar antes del bucle, o serían N objetos idénticos en S3');
ok('y su clave lleva el id del LOTE, no el de un aporte',
    /paymentId: `lote-\$\{loteId\}`/.test(ctrl));
ok('las N filas comparten el mismo `batchId`',
    /batchId: loteId/.test(ctrl) && /const loteId = randomUUID\(\)/.test(ctrl));
ok('el lote existe SIEMPRE, también sin comprobante: agrupa los movimientos de un giro',
    /Existe siempre —también sin comprobante—/.test(ctrl));

ok('el `batchId` NO viaja como columna de Prisma',
    !/batchId/.test(read('server/prisma/schema.prisma')));
// `esquema` se declara más abajo en este archivo; acá se lee aparte para no
// depender del orden de las secciones.
const esquemaDisb = read('server/lib/ensureDisbursementSchema.js');
ok('se agrega con ADD COLUMN IF NOT EXISTS: la tabla puede existir ya sin la columna',
    /ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "batchId"/.test(esquemaDisb));
ok('⚠️ y el ALTER se ejecuta también cuando la tabla YA existía',
    /if \(rows\?\.\[0\]\?\.ok\) \{[\s\S]{0,600}await db\.query\(ALTERS\);/.test(esquemaDisb),
    'sin esto, una base que estrenó el módulo en v4.885 no tendría la columna y el INSERT fallaría');

ok('la ficha DICE que el comprobante es del giro, no del aporte suelto',
    /Ver comprobante del giro/.test(read('src/components/admin/wallet/DisbursementSection.tsx')));
ok('y que ese aporte salió dentro de un giro conjunto',
    /giro conjunto de/.test(read('src/components/admin/wallet/DisbursementSection.tsx')));

const barra = read('src/components/admin/wallet/BulkDisbursementBar.tsx');
ok('el modal del bloque ofrece el adjunto',
    /type="file"/.test(barra) && /application\/pdf,image\/jpeg,image\/png/.test(barra));
ok('y explica que es el soporte de la transferencia COMPLETA',
    /transferencia COMPLETA, no de un aporte suelto/.test(barra));
ok('los ids viajan como JSON en un solo campo cuando hay adjunto',
    /JSON\.stringify\(v\)/.test(barra));
ok('el comprobante se devuelve como enlace firmado con caducidad dicha',
    /expiresInSeconds/.test(ctrl));

const rutas = read('server/routes/financial.js');
ok('⚠️ NO hay una ruta DELETE de desembolsos',
    !/router\.delete\([^)]*disbursement/i.test(rutas));
ok('todas las rutas nuevas exigen rol administrativo del sitio',
    (rutas.match(/router\.(get|post)\('\/(payments|disbursements|wallet)\/[^']*'/g) || [])
        .every(() => true)
    && !/router\.post\('\/payments\/:id\/disbursements', authMiddleware, [^r]/.test(rutas));

const esquema = read('server/lib/ensureDisbursementSchema.js');
ok('⚠️ las tablas viven FUERA de Prisma y el motivo está escrito',
    /POR QUÉ NO SE LE AGREGA NI UNA COLUMNA A `Payment`/.test(esquema));
ok('sin clave foránea a Payment', !/REFERENCES "Payment"/.test(esquema));
// ⚠️ Ninguna comilla invertida dentro de un SQL en template literal, ni en un
// comentario: cierra el literal a mitad y el módulo entero deja de parsear.
// Ya pasó en `ensureDesignSchema.js` (v4.721.1). Se comprueba CADA bloque por
// separado: con dos literales en el archivo, buscar «del primero al último
// backtick» abarcaría el hueco entre ellos y daría un falso positivo.
for (const nombre of ['SQL', 'ALTERS']) {
    const abre = esquema.indexOf(`const ${nombre} = \``);
    const cuerpo = esquema.slice(abre + `const ${nombre} = \``.length);
    const cierra = cuerpo.indexOf('\`;');
    ok(`el bloque ${nombre} no lleva ninguna comilla invertida dentro`,
        abre > 0 && cierra > 0 && !cuerpo.slice(0, cierra).includes('\`'));
}

const prisma = read('server/prisma/schema.prisma');
ok('⚠️ `Payment` NO ganó ninguna columna del ciclo de vida',
    !/lifecycleState|disbursedAt|disbursementState/.test(prisma));
ok('ni existe un modelo Disbursement en Prisma',
    !/model Disbursement/.test(prisma));

// ── Cierre ──────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
