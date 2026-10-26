// ════════════════════════════════════════════════════════════════════
// Conciliación de fondos de un evento — pruebas — v4.1248
//
// Sin Postgres, sin Stripe, sin red. Tres partes:
//   1. El CRITERIO (`eventFundsSpec.js`): emparejar inscripción ↔ pago por
//      identificador de Stripe y los cinco estados financieros.
//   2. El CAMINO real de `GET /financial/wallet?eventId=` con la base
//      sustituida en memoria.
//   3. Lo que tiene que seguir siendo verdad en el código: que se REUSA la
//      Bóveda y no se escribe un segundo sistema.
//
//   npm run test:event-funds
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    matchRegistrationsToPayments, fundStatesOf, eventFundTotals, registrationFundBadge,
    PAID_REGISTRATION_STATUSES,
} from '../server/lib/eventFundsSpec.js';

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);
const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 1. El criterio ──────────────────────────────────────────────────
grupo('1. Inscripción ↔ pago: por identificador de Stripe, nunca por nombre');
{
    const regs = [
        { id: 'r1', status: 'paid', stripePaymentIntentId: 'pi_1', stripeSessionId: 'cs_1', email: 'x@x' },
        { id: 'r2', status: 'accredited', stripePaymentIntentId: null, stripeSessionId: 'cs_2' },
        { id: 'r3', status: 'paid', stripePaymentIntentId: 'pi_3' },
        { id: 'r4', status: 'paid' },
        { id: 'r5', status: 'pending_payment', stripeSessionId: 'cs_5' },
        { id: 'r6', status: 'refunded', stripePaymentIntentId: 'pi_6' },
    ];
    const pagos = [
        { id: 'p1', providerRef: 'pi_1' },
        { id: 'p2', providerRef: 'cs_2' },          // registrado con la Session
        { id: 'pX', providerRef: 'pi_otro_evento' }, // de otro evento: no se toca
    ];
    const m = matchRegistrationsToPayments(regs, pagos);
    check('Por PaymentIntent', m.byPayment.p1?.id === 'r1');
    check('Por Checkout Session cuando no hay PaymentIntent', m.byPayment.p2?.id === 'r2');
    check('Un pago de otro evento no se asocia', !m.paymentIds.includes('pX'));
    check('Pagada con referencia y sin pago → «sin movimiento»', m.sinMovimiento.map(r => r.id).join() === 'r3');
    check('Pagada SIN referencia → no se asocia a nada (revisión manual)', m.sinReferencia.map(r => r.id).join() === 'r4');
    check('Una pendiente de pago no se reclama', ![...m.sinMovimiento, ...m.sinReferencia].some(r => r.id === 'r5'));
    check('Una reembolsada sin pago no se reclama (no hay dinero que trasladar)', ![...m.sinMovimiento, ...m.sinReferencia].some(r => r.id === 'r6'));
    const mismoCorreo = matchRegistrationsToPayments([{ id: 'a', status: 'paid', email: 'x@x' }], [{ id: 'p', providerRef: 'x@x' }]);
    check('El correo nunca sirve de identificador', mismoCorreo.paymentIds.length === 0);
    check('Acreditada y asistió cuentan como cobradas', ['accredited', 'attended', 'no_show', 'paid'].every(s => PAID_REGISTRATION_STATUSES.includes(s)));
}

grupo('6. Cinco estados que no se funden en un «Pagado»');
{
    const base = { id: 'p1', status: 'succeeded', amount: 800, grossAmount: 850, fee: 50, currency: 'COP' };
    const enTransito = fundStatesOf({ ...base, financialBucket: 'in_transit', disbursedAmount: 0 });
    check('Pago confirmado NO implica traslado', enTransito.pago === 'confirmado' && enTransito.traslado === 'no_registrado');
    check('Pago confirmado en tránsito: liquidación pendiente', enTransito.liquidacion === 'pendiente');
    check('Sin balance transaction: «Sin verificar» en Stripe', enTransito.stripe === 'pendiente');
    check('Con balance transaction: verificado', fundStatesOf({ ...base, stripeBalanceTxId: 'txn' }).stripe === 'verificado');
    check('Disponible antes de liberar → «Por liberar»', fundStatesOf({ ...base, financialBucket: 'available_soon' }).liquidacion === 'por_liberar');
    const parcial = fundStatesOf({ ...base, financialBucket: 'available', disbursedAmount: 300 });
    check('Traslado parcial', parcial.traslado === 'parcial' && parcial.liquidacion === 'disponible');
    check('Traslado completo → confirmado', fundStatesOf({ ...base, financialBucket: 'disbursed', disbursedAmount: 800 }).traslado === 'confirmado');
    check('Traslado sin comprobante enviado → comprobante pendiente', parcial.comprobante === 'pendiente');
    check('Comprobante aceptado por el proveedor → «Enviado»',
        fundStatesOf({ ...base, disbursedAmount: 800 }, { notices: [{ paymentIds: ['p1'], state: 'enviado' }] }).comprobante === 'enviado');
    check('Comprobante rechazado → «Error de envío»',
        fundStatesOf({ ...base, disbursedAmount: 800 }, { notices: [{ paymentIds: ['p1'], state: 'fallido' }] }).comprobante === 'error');
    check('Un aviso de OTRO pago no cuenta',
        fundStatesOf({ ...base, disbursedAmount: 800 }, { notices: [{ paymentIds: ['p9'], state: 'enviado' }] }).comprobante === 'pendiente');
    const reemb = fundStatesOf({ ...base, status: 'refunded', financialBucket: 'refunded' });
    check('Reembolso: pago y liquidación reembolsados, traslado no aplica', reemb.pago === 'reembolsado' && reemb.liquidacion === 'reembolsado' && reemb.traslado === 'no_aplica');
    check('Etiqueta del listado: sin pago → «Sin movimiento en la Bóveda»', registrationFundBadge(null).key === 'sin_movimiento');
    check('Etiqueta del listado: trasladado', registrationFundBadge(fundStatesOf({ ...base, disbursedAmount: 800 })).key === 'trasladado');
}

grupo('7. Totales por moneda (COP y USD nunca se suman)');
{
    const items = [
        { id: 'a', status: 'succeeded', currency: 'COP', amount: 800, grossAmount: 850, fee: 50, financialBucket: 'available', disbursedAmount: 300 },
        { id: 'b', status: 'succeeded', currency: 'COP', amount: 400, grossAmount: 420, fee: 20, financialBucket: 'in_transit', disbursedAmount: 0 },
        { id: 'c', status: 'refunded', currency: 'COP', amount: 100, grossAmount: 110, fee: 10, financialBucket: 'refunded' },
        { id: 'd', status: 'succeeded', currency: 'USD', amount: 90, grossAmount: 100, fee: 10, financialBucket: 'available', disbursedAmount: 90 },
    ];
    const t = Object.fromEntries(eventFundTotals(items).map(x => [x.currency, x]));
    check('Dos monedas, dos resúmenes', Object.keys(t).sort().join() === 'COP,USD');
    check('COP: bruto y neto sin el reembolso', t.COP.bruto === 1270 && t.COP.neto === 1200, JSON.stringify(t.COP));
    check('COP: reembolsado aparte', t.COP.reembolsado === 100);
    check('COP: trasladado = sólo lo confirmado', t.COP.trasladado === 300);
    check('COP: disponible descuenta lo trasladado; en liquidación aparte', t.COP.disponible === 500 && t.COP.enLiquidacion === 400);
    check('COP: pendiente de traslado', t.COP.pendienteTraslado === 900);
    check('USD no se contamina con COP', t.USD.bruto === 100 && t.USD.trasladado === 90 && t.USD.pendienteTraslado === 0);
}

// ── 2. El camino real, con la base en memoria ──────────────────────
grupo('2. GET /financial/wallet?eventId= (camino real, base sustituida)');
{
    process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
    const { default: db } = await import('../server/lib/db.js');
    const vistos = [];
    db.query = async (sql, params = []) => {
        vistos.push(sql);
        if (sql.includes('FROM "CalendarEvent" WHERE id = $1 AND "clubId" = $2')) {
            return { rows: params[0] === 'ev1' && params[1] === 'c1' ? [{ id: 'ev1', title: 'Conferencia', slug: 'conf', clubId: 'c1' }] : [] };
        }
        if (sql.includes('FROM "EventRegistration"') && sql.includes('WHERE "eventId" = $1')) return { rows: [
            { id: 'r1', registrationCode: 'EV-1', firstName: 'Ana', lastName: 'P', email: 'a@x', status: 'paid', stripePaymentIntentId: 'pi_1', clubName: 'Club A' },
            { id: 'r2', registrationCode: 'EV-2', firstName: 'Beto', lastName: 'Q', status: 'paid', stripeSessionId: 'cs_2' },
        ] };
        if (sql.includes('"providerRef" = ANY($2::text[])')) return { rows: [{ id: 'p1', providerRef: 'pi_1' }] };
        if (sql.includes('FROM "Payment"') && sql.includes('id = ANY($2::text[])')) return { rows: [{
            id: 'p1', providerRef: 'pi_1', status: 'succeeded', amount: '850000', currency: 'COP', applicationFee: '20000',
            netAmount: '800000', stripeBalanceTxId: 'txn_1', availableOn: '2026-09-01T00:00:00Z', clubAvailableOn: '2026-09-01T00:00:00Z',
            rawPayload: '{"type":"event_registration","registrationId":"r1"}', createdAt: '2026-08-25T00:00:00Z',
        }] };
        if (sql.includes('"PayoutRequest"')) return { rows: [] };
        if (sql.includes('FROM "Payment"') && sql.includes('LIMIT 500')) return { rows: [] };
        if (sql.includes('FROM "Disbursement"') && sql.includes('GROUP BY "paymentId"')) return { rows: [{ paymentId: 'p1', cubierto: 300000, cuantos: 1 }] };
        if (sql.includes('FROM "Disbursement"') && sql.includes('GROUP BY currency')) return { rows: [{ currency: 'COP', total: 300000, cuantos: 1, ultimo: null }] };
        if (sql.includes('"DisbursementNotice"')) return { rows: [{ paymentIds: ['p1'], state: 'enviado' }] };
        return { rows: [] };
    };
    const { getClubWallet } = await import('../server/controllers/financialController.js');
    const llamar = async (query, user = { role: 'president', clubId: 'c1' }) => {
        const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
        await getClubWallet({ user, query }, res);
        return res;
    };
    const r = await llamar({ eventId: 'ev1' });
    const es = r.body?.eventScope;
    check('Responde 200 con la vista del evento', r.code === 200 && !!es, `status ${r.code}`);
    check('Sólo los pagos del evento (acotado por sitio y por id)', vistos.some(q => q.includes('"clubId" = $1') && q.includes('id = ANY($2::text[])')));
    check('El pago trae su inscripción', es?.items?.[0]?.registration?.code === 'EV-1');
    check('Los cinco estados viajan resueltos', es?.items?.[0]?.states?.traslado === 'parcial' && es?.items?.[0]?.states?.comprobante === 'enviado');
    check('Totales del evento por moneda', es?.totals?.[0]?.currency === 'COP' && es.totals[0].trasladado === 300000);
    check('Lo desembolsado se acota a los pagos del evento', vistos.some(q => q.includes('GROUP BY currency') && q.includes('"paymentId" = ANY($2::text[])')));
    check('No lee ni resta los payouts del sitio', r.body?.summary?.transferred === 0 && !vistos.some(q => q.includes('"PayoutRequest"')));
    check('Cobertura: la inscripción sin movimiento se informa', es?.coverage?.sinMovimiento?.[0]?.code === 'EV-2');
    check('Índice por inscripción para el listado', es?.byRegistration?.r1?.paymentId === 'p1');
    const ajeno = await llamar({ eventId: 'ev-de-otro-sitio' });
    check('Un evento de otro sitio responde 404 (no 403)', ajeno.code === 404);
    vistos.length = 0;
    const sitio = await llamar({});
    check('Sin eventId, la Bóveda del sitio sigue igual (lee sus payouts, sin eventScope)',
        sitio.code === 200 && vistos.some(q => q.includes('"PayoutRequest"')) && !sitio.body?.eventScope);
}

// ── 3. Lo que tiene que seguir siendo verdad en el código ───────────
grupo('3. Se reusa la Bóveda; no hay un segundo sistema');
{
    const tab = leer('src/components/admin/events/EventFundsTab.tsx');
    for (const pieza of ['BulkDisbursementBar', 'BulkReconciliationBar', 'ResendNoticeModal', 'DisbursementSection']) {
        check(`La pestaña usa ${pieza} de la Bóveda`, tab.includes(`import ${pieza}`) && tab.includes(`<${pieza}`));
    }
    const endpoints = [...tab.matchAll(/\/financial\/([a-z\-/]+)/g)].map(m => m[1]);
    const conocidos = ['wallet', 'wallet/notices', 'wallet/audit-events', 'wallet/sync-stripe', 'wallet/rebuild-collections', 'wallet/notices/'];
    check('Sólo endpoints que ya existían en la Bóveda', endpoints.every(e => conocidos.includes(e)), endpoints.join(', '));
    check('Selección con el criterio de la Bóveda (selectionClassOf)', tab.includes('selectionClassOf('));
    check('El CSV lleva BOM y punto y coma', tab.includes("'\\ufeff'") && tab.includes(".join(';')"));

    const reg = leer('server/controllers/eventRegistrationController.js');
    const confirm = reg.slice(reg.indexOf('export const confirmPaidSession'), reg.indexOf('export const applyStripeStatus'));
    check('Al confirmarse el pago se registra el movimiento (mismo constructor)', confirm.includes('buildDraftForEventRegistration') && confirm.includes('insertPayment'));
    check('Registrar el movimiento nunca tumba la confirmación', /try \{[\s\S]*insertPayment[\s\S]*\} catch/.test(confirm));

    const col = leer('server/lib/projectFairCollections.js');
    check('La reconstrucción mira las DOS referencias (no duplica)', col.includes('p."providerRef" IN (r."stripePaymentIntentId", r."stripeSessionId")'));
    check('La reconstrucción usa la misma lista de estados cobrados', col.includes('PAID_REGISTRATION_STATUSES'));
    check('Se puede acotar a un evento', col.includes('AND r."eventId" = $2'));
    const draft = col.slice(col.indexOf('export const buildDraftForEventRegistration'), col.indexOf('export const paymentDraftFor'));
    check('El movimiento de una inscripción ya no se rotula «12-valledupar»', !draft.includes("'12-valledupar'") && draft.includes('eventId: reg.eventId'));

    const disb = leer('server/controllers/disbursementController.js');
    check('Avisos y auditoría acotables por evento', (disb.match(/eventPaymentIds\(/g) || []).length >= 2);
    // v4.1249 — «No encuentro la opción para enviar los comprobantes de
    // traslados»: la puerta tiene que estar a la vista, como en la Bóveda.
    const panel = leer('src/components/admin/events/RegistrationFundsPanel.tsx');
    check('La ficha del inscrito ofrece «Enviar comprobante de traslado» (ResendNoticeModal)',
        panel.includes('Enviar comprobante de traslado') && panel.includes('<ResendNoticeModal'));
    check('La ficha del inscrito trae los desembolsos de la Bóveda (DisbursementSection)', panel.includes('<DisbursementSection'));
    check('Sin movimiento, la ficha ofrece registrarlo', panel.includes('Registrar movimiento en la Bóveda'));
    check('El comprobante sólo se ofrece con un traslado registrado', /disabled=\{!trasladado\}/.test(panel));
    const manager = leer('src/components/admin/events/EventRegistrationsManager.tsx');
    check('La ficha del listado monta el panel', manager.includes('<RegistrationFundsPanel') && manager.includes('{fundsPanel}'));
    check('La tabla de la pestaña tiene el botón directo por fila', tab.includes("onClick={() => setResendIds([it.id])}"));
    const fin = leer('server/controllers/financialController.js');
    check('El índice por inscripción lleva el resumen del movimiento', /byRegistration[\s\S]{0,400}grossAmount[\s\S]{0,300}providerRef/.test(fin));

    const events = leer('src/pages/admin/Events.tsx');
    check('La pestaña la gobierna la capacidad sensible «payments»', /conciliacion:\s*'payments'/.test(events));
}

console.log(`\n${pasadas} pasadas, ${fallos.length} fallidas`);
if (fallos.length) {
    console.log('Fallaron:\n - ' + fallos.join('\n - '));
    process.exit(1);
}
process.exit(0);
