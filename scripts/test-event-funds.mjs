// ════════════════════════════════════════════════════════════════════
// Conciliación de inscripciones y traslados de un evento — pruebas — v4.1250
//
// Sin Postgres, sin S3, sin Stripe, sin correo real. Tres partes:
//   1. El CRITERIO (`eventFundsSpec.js`).
//   2. El CAMINO real de los controladores con la base en memoria: registrar
//      un traslado individual y uno consolidado, no trasladar dos veces,
//      confirmar sólo con evidencia, enviar el comprobante (idempotente).
//   3. La INDEPENDENCIA de la Bóveda de Fondos: ni una consulta a sus tablas.
//
//   npm run test:event-funds
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    paymentOf, registrationTransferState, validateTransfer, canTransition, checkPdf, maskAccount,
    transferEmail, eventFundTotals, allocatedOf, PAID_REGISTRATION_STATUSES,
} from '../server/lib/eventFundsSpec.js';

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);
const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Los dos casos reales de la captura: 265,63 USD cobrados a cada una por
// Stripe (850.000 COP publicados), con su recargo de pasarela.
const MARTHA = { id: 'r-martha', eventId: 'ev', registrationCode: 'RPF13-38QE9', firstName: 'Martha Isabel', lastName: 'Ballen Alarcón', status: 'paid', chargeCurrency: 'USD', chargeAmount: 278.91, stripePaymentIntentId: 'pi_3UJbA5', stripeSessionId: 'cs_live_b1', paidAt: '2026-09-25T15:36:00Z', createdAt: '2026-09-25T15:35:00Z' };
const LAURA = { ...MARTHA, id: 'r-laura', registrationCode: 'RPF13-DMY77', firstName: 'Laura', lastName: 'Espinel Ballen', stripePaymentIntentId: 'pi_laura', stripeSessionId: 'cs_laura' };
const DANIEL = { ...MARTHA, id: 'r-daniel', registrationCode: 'EV-VYU24Y', firstName: 'Daniel', lastName: 'Yazo', status: 'pending_payment', stripePaymentIntentId: null, paidAt: null };
const COP = { ...MARTHA, id: 'r-cop', registrationCode: 'EV-COP', chargeCurrency: 'COP', chargeAmount: 850000, stripePaymentIntentId: 'pi_cop' };
const pagoDe = (reg) => ({ registrationId: reg.id, status: 'succeeded', currency: reg.chargeCurrency, amount: reg.chargeAmount, payload: { surcharge: { amount: reg.chargeCurrency === 'USD' ? 13.28 : 0 } }, paymentIntentId: reg.stripePaymentIntentId, occurredAt: reg.paidAt });
const PAGOS = [pagoDe(MARTHA), pagoDe(LAURA), pagoDe(COP)];

// ── 1. El criterio ──────────────────────────────────────────────────
grupo('Proceso A — el pago del participante (datos del propio módulo)');
{
    const p = paymentOf(MARTHA, PAGOS);
    check('Pagado 278,91 USD', p.charged === 278.91 && p.currency === 'USD');
    check('El recargo de la pasarela no es del evento', p.surcharge === 13.28 && p.eventAmount === 265.63, JSON.stringify(p));
    check('Pago confirmado con su referencia de Stripe', p.status === 'confirmado' && p.paymentIntentId === 'pi_3UJbA5' && p.viaStripe);
    check('Pendiente de pago → no confirmado', paymentOf(DANIEL, PAGOS).status === 'pendiente');
    const reemb = paymentOf({ ...MARTHA, status: 'refunded' }, [...PAGOS, { registrationId: MARTHA.id, status: 'refunded', refundedAmount: 278.91, currency: 'USD' }]);
    check('Reembolsado → nada que trasladar', reemb.status === 'reembolsado' && reemb.eventAmount === 0);
    check('Acreditada y asistió cuentan como pagadas', ['accredited', 'attended'].every(s => PAID_REGISTRATION_STATUSES.includes(s)));
}

grupo('Proceso B — el traslado: un pago confirmado NO es un traslado confirmado');
{
    const p = paymentOf(MARTHA, PAGOS);
    check('Pago confirmado sin traslado → «Pendiente de traslado»', registrationTransferState(p, []) === 'sin_traslado');
    check('Con traslado registrado', registrationTransferState(p, [{ amount: 265.63, transferStatus: 'registrado' }]) === 'registrado');
    check('Confirmado sólo si lo confirmado cubre lo del evento', registrationTransferState(p, [{ amount: 100, transferStatus: 'confirmado' }]) === 'parcial'
        && registrationTransferState(p, [{ amount: 265.63, transferStatus: 'confirmado' }]) === 'confirmado');
    check('Un traslado revertido no cuenta', registrationTransferState(p, [{ amount: 265.63, transferStatus: 'revertido' }]) === 'sin_traslado'
        && allocatedOf([{ amount: 265.63, transferStatus: 'revertido' }]) === 0);
    check('Sin pago confirmado no aplica', registrationTransferState(paymentOf(DANIEL, PAGOS), []) === 'no_aplica');
}

grupo('Validar un traslado (individual y consolidado)');
{
    const registrations = { [MARTHA.id]: MARTHA, [LAURA.id]: LAURA, [DANIEL.id]: DANIEL, [COP.id]: COP };
    const paymentsByRegistration = Object.fromEntries(Object.values(registrations).map(r => [r.id, paymentOf(r, PAGOS)]));
    const ctx = { registrations, paymentsByRegistration, allocationsByRegistration: {} };
    const ok = validateTransfer({ kind: 'consolidado', currency: 'USD', amount: 531.26, allocations: [{ registrationId: MARTHA.id, amount: 265.63 }, { registrationId: LAURA.id, amount: 265.63 }] }, ctx);
    check('Consolidado Martha + Laura: válido, sin diferencia', ok.ok && ok.asignado === 531.26 && ok.diferencia === 0, ok.errores.join(' '));
    check('Individual con dos inscripciones: no', !validateTransfer({ kind: 'individual', currency: 'USD', amount: 1, allocations: [{ registrationId: MARTHA.id, amount: 1 }, { registrationId: LAURA.id, amount: 1 }] }, ctx).ok);
    check('COP y USD no se mezclan', !validateTransfer({ kind: 'consolidado', currency: 'USD', amount: 10, allocations: [{ registrationId: COP.id, amount: 10 }] }, ctx).ok);
    check('Sin pago confirmado no se traslada', !validateTransfer({ currency: 'USD', amount: 10, allocations: [{ registrationId: DANIEL.id, amount: 10 }] }, ctx).ok);
    const doble = validateTransfer({ currency: 'USD', amount: 265.63, allocations: [{ registrationId: MARTHA.id, amount: 265.63 }] },
        { ...ctx, allocationsByRegistration: { [MARTHA.id]: [{ transferId: 't1', amount: 265.63, transferStatus: 'registrado' }] } });
    check('⚠️ No se traslada dos veces la misma inscripción', !doble.ok && /ya hay/.test(doble.errores.join(' ')));
    const trasRevertir = validateTransfer({ currency: 'USD', amount: 265.63, allocations: [{ registrationId: MARTHA.id, amount: 265.63 }] },
        { ...ctx, allocationsByRegistration: { [MARTHA.id]: [{ transferId: 't1', amount: 265.63, transferStatus: 'revertido' }] } });
    check('…pero sí después de revertir el anterior', trasRevertir.ok);
    const dif = validateTransfer({ currency: 'USD', amount: 520, allocations: [{ registrationId: MARTHA.id, amount: 265.63 }, { registrationId: LAURA.id, amount: 265.63 }], kind: 'consolidado' }, ctx);
    check('Costos bancarios: la diferencia se guarda y se informa', dif.ok && dif.diferencia === -11.26);
}

grupo('Estados del traslado: no se confirma sin evidencia');
{
    check('Confirmar sin PDF: no', !canTransition('registrado', 'confirmado', { hasDocument: false, reference: 'x' }).ok);
    check('Confirmar sin referencia: no', !canTransition('registrado', 'confirmado', { hasDocument: true, reference: '' }).ok);
    check('Confirmar con PDF y referencia: sí', canTransition('pendiente_verificacion', 'confirmado', { hasDocument: true, reference: '17208637' }).ok);
    check('De «pendiente» no se salta a confirmado', !canTransition('pendiente', 'confirmado', { hasDocument: true, reference: 'x' }).ok);
    check('Revertir exige motivo', !canTransition('confirmado', 'revertido', { reason: '' }).ok && canTransition('confirmado', 'revertido', { reason: 'Transferencia devuelta por el banco' }).ok);
    check('Un traslado revertido no revive', !canTransition('revertido', 'registrado').ok);
}

grupo('Comprobantes, cuenta y correo');
{
    check('PDF válido', checkPdf({ mime: 'application/pdf', bytes: 2000, head: '%PDF-' }).ok);
    check('Una imagen no es comprobante', !checkPdf({ mime: 'image/png', bytes: 2000, head: '\x89PNG' }).ok);
    check('Firma %PDF- obligatoria', !checkPdf({ mime: 'application/pdf', bytes: 2000, head: 'MZ' }).ok);
    check('Más de 10 MB: no', !checkPdf({ mime: 'application/pdf', bytes: 11 * 1024 * 1024, head: '%PDF-' }).ok);
    check('Cuenta enmascarada', maskAccount('123-456-789 4521') === '****4521');
    const conf = transferEmail({ eventTitle: 'XIII Conferencia', beneficiary: 'Concorrotarios', transfer: { status: 'confirmado', amount: 531.26, currency: 'USD', reference: '17208637', transferDate: '2026-10-20' }, allocationsCount: 2 });
    check('Asunto institucional', conf.subject === 'Comprobante de traslado de fondos — XIII Conferencia');
    check('Confirmado: «traslado de fondos realizado a favor de Concorrotarios»', /realizado a favor de Concorrotarios/.test(conf.text) && /Inscripciones asociadas: 2/.test(conf.text));
    const pend = transferEmail({ eventTitle: 'XIII Conferencia', beneficiary: 'Concorrotarios', transfer: { status: 'registrado', amount: 10, currency: 'USD' } });
    check('⚠️ Sin confirmar NO dice «realizado»', !/realizado/.test(pend.text) && /todavía no ha sido confirmado/.test(pend.text));
}

grupo('Totales por moneda (COP y USD nunca se suman)');
{
    const rows = [MARTHA, LAURA, COP].map(r => ({ payment: paymentOf(r, PAGOS), allocated: r === MARTHA ? 265.63 : 0, confirmedAmount: r === MARTHA ? 265.63 : 0 }));
    const t = Object.fromEntries(eventFundTotals(rows, []).map(x => [x.currency, x]));
    check('Dos tarjetas', Object.keys(t).sort().join() === 'COP,USD');
    check('USD: recaudado, recargos y neto', t.USD.cobrado === 557.82 && t.USD.recargos === 26.56 && t.USD.valorEvento === 531.26);
    check('USD: confirmado y pendiente de traslado', t.USD.trasladoConfirmado === 265.63 && t.USD.pendienteTraslado === 265.63);
    check('COP aparte', t.COP.valorEvento === 850000 && t.COP.pendienteTraslado === 850000);
}

// ── 2. El camino real, con la base en memoria ──────────────────────
grupo('2. Camino real (controladores) con la base en memoria');
{
    process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
    const { default: db } = await import('../server/lib/db.js');
    const { s3 } = await import('../server/lib/storage.js');
    const { default: EmailService } = await import('../server/services/EmailService.js');
    const mem = { transfers: [], allocations: [], docs: [], notices: [], history: [], sql: [] };
    const EVENT = { id: 'ev', slug: 'villavicencio2027', title: 'XIII Conferencia Rotaria del Distrito 4281', clubId: 'c1' };
    const REGS = [MARTHA, LAURA, DANIEL, COP];
    const query = async (sql, p = []) => {
        mem.sql.push(sql);
        const has = (s) => sql.includes(s);
        if (has('information_schema.tables')) return { rows: Array.from({ length: 7 }, (_, i) => ({ table_name: `t${i}` })) };
        if (has('FROM "CalendarEvent"')) return { rows: p[0] === 'ev' ? [EVENT] : [] };
        if (/^\s*(BEGIN|COMMIT|ROLLBACK)/.test(sql) || has('pg_advisory_xact_lock')) return { rows: [] };
        if (has('SELECT "beneficiaryName" FROM "EventFundsConfig"')) return { rows: [{ beneficiaryName: 'Concorrotarios' }] };
        if (has('SELECT "beneficiaryName", recipients FROM "EventFundsConfig"')) return { rows: [{ beneficiaryName: 'Concorrotarios', recipients: [{ name: 'Tesorería', email: 'tesoreria@concorrotarios.org' }] }] };
        if (has('FROM "EventRegistration" WHERE "eventId" = $1 AND id = ANY')) return { rows: REGS.filter(r => p[1].includes(r.id)) };
        if (has('FROM "EventRegistrationPayment"')) return { rows: PAGOS.filter(x => !p[1] || p[1].includes(x.registrationId)) };
        if (has('FROM "EventStripeCheck"')) return { rows: [] };
        if (has('FROM "EventFundsAllocation" a JOIN "EventFundsTransfer" t')) {
            return { rows: mem.allocations.filter(a => p[1].includes(a.registrationId)).map(a => ({ ...a, transferStatus: mem.transfers.find(t => t.id === a.transferId)?.status })) };
        }
        if (has('INSERT INTO "EventFundsTransfer"')) { mem.transfers.push({ id: p[0], eventId: p[1], kind: p[3], currency: p[5], amount: p[6], reference: p[8], status: p[11] }); return { rows: [] }; }
        if (has('INSERT INTO "EventFundsAllocation"')) { mem.allocations.push({ transferId: p[0], registrationId: p[2], amount: p[3] }); return { rows: [] }; }
        if (has('INSERT INTO "EventFundsHistory"')) { mem.history.push({ kind: p[3], transferId: p[1] }); return { rows: [] }; }
        if (has('SELECT * FROM "EventFundsTransfer" WHERE id = $1')) return { rows: mem.transfers.filter(t => t.id === p[0] && t.eventId === p[1]) };
        if (has('FROM "EventFundsDocument" WHERE "transferId" = $1 AND "isCurrent" = true')) return { rows: mem.docs.filter(d => d.transferId === p[0]) };
        if (has('UPDATE "EventFundsTransfer"') && has('SET status')) {
            const t = mem.transfers.find(x => x.id === p[5] && x.status === p[6]);
            if (t) { t.status = p[0]; t.reference = p[2]; }
            return { rows: [], rowCount: t ? 1 : 0 };
        }
        if (has('COUNT(*)::int AS n FROM "EventFundsAllocation"')) return { rows: [{ n: mem.allocations.filter(a => a.transferId === p[0]).length }] };
        if (has('SELECT id, "fileName", version, "isCurrent" FROM "EventFundsDocument"')) return { rows: mem.docs.filter(d => d.transferId === p[0]) };
        if (has('INSERT INTO "EventFundsNotice"')) {
            if (p[2] && mem.notices.some(n => n.transferId === p[0] && n.operationKey === p[2])) return { rows: [] };
            const n = { id: `n${mem.notices.length + 1}`, transferId: p[0], operationKey: p[2], state: 'enviando' };
            mem.notices.push(n);
            return { rows: [{ id: n.id }] };
        }
        if (has('SELECT id, state, error FROM "EventFundsNotice"')) return { rows: mem.notices.filter(n => n.transferId === p[0] && n.operationKey === p[1]) };
        if (has('SELECT "s3Key" FROM "EventFundsDocument"')) return { rows: [{ s3Key: 'private/event-funds/c1/ev/t/x.pdf' }] };
        if (has('UPDATE "EventFundsNotice"')) { const n = mem.notices.find(x => x.id === p[3]); if (n) n.state = p[0]; return { rows: [] }; }
        return { rows: [] };
    };
    db.query = query;
    db.pool = { connect: async () => ({ query, release: () => { } }) };
    s3.send = async () => ({ Body: { transformToByteArray: async () => new Uint8Array([37, 80, 68, 70, 45]) } });
    const correos = [];
    EmailService.sendPlatformEmail = async (msg) => { correos.push(msg); return { success: true, messageId: 'msg_1' }; };

    const ctl = await import('../server/controllers/eventFundsController.js');
    const llamar = async (fn, { params = {}, body = {}, role = 'club_admin', file = null } = {}) => {
        const req = { params: { eventId: 'ev', ...params }, body, file, query: {}, user: { id: 'u1', name: 'Daniel Yazo', role, clubId: 'c1' }, rbacGrantLoaded: true, rbacGrant: null };
        const res = { code: 200, body: null, headersSent: false, setHeader() { }, status(c) { this.code = c; return this; }, json(b) { this.body = b; this.headersSent = true; return this; } };
        await fn(req, res);
        return res;
    };

    const consolidado = await llamar(ctl.createTransfer, { body: {
        kind: 'consolidado', currency: 'USD', amount: '531.26', status: 'registrado', reference: '17208637', transferDate: '2026-10-20', method: 'transferencia_bancaria',
        allocations: JSON.stringify([{ registrationId: MARTHA.id, amount: 265.63 }, { registrationId: LAURA.id, amount: 265.63 }]),
    } });
    check('Traslado consolidado Martha + Laura → 201', consolidado.code === 201, JSON.stringify(consolidado.body));
    check('Una sola operación con dos asignaciones', mem.transfers.length === 1 && mem.allocations.length === 2);
    const tid = consolidado.body?.id;

    const doble = await llamar(ctl.createTransfer, { body: { kind: 'individual', currency: 'USD', amount: '265.63', allocations: JSON.stringify([{ registrationId: MARTHA.id, amount: 265.63 }]) } });
    check('⚠️ Martha no se puede trasladar otra vez (400)', doble.code === 400 && mem.transfers.length === 1, JSON.stringify(doble.body));

    const ajeno = await llamar(ctl.createTransfer, { params: { eventId: 'otro' }, body: {} });
    check('Un evento ajeno responde 404', ajeno.code === 404);

    const sinPdf = await llamar(ctl.updateTransfer, { params: { transferId: tid }, body: { status: 'confirmado' }, role: 'club_admin' });
    check('Confirmar sin comprobante → 409', sinPdf.code === 409 && /comprobante PDF/.test(sinPdf.body?.error || ''));
    const editor = await llamar(ctl.updateTransfer, { params: { transferId: tid }, body: { status: 'confirmado' }, role: 'editor' });
    check('Un editor no confirma (403)', editor.code === 403);
    mem.docs.push({ id: 'd1', transferId: tid, fileName: 'comprobante.pdf', version: 1, isCurrent: true });
    const conf = await llamar(ctl.updateTransfer, { params: { transferId: tid }, body: { status: 'confirmado' } });
    check('Con PDF y referencia, el administrador confirma', conf.code === 200 && mem.transfers[0].status === 'confirmado', JSON.stringify(conf.body));

    const sinConfirmar = await llamar(ctl.sendNotice, { params: { transferId: tid }, body: { to: ['tesoreria@concorrotarios.org'] } });
    check('Enviar sin confirmación explícita → 428', sinConfirmar.code === 428);
    const envio = await llamar(ctl.sendNotice, { params: { transferId: tid }, body: { to: ['tesoreria@concorrotarios.org'], confirm: true, operationKey: 'op-1' } });
    check('Comprobante enviado con el PDF adjunto', envio.body?.ok === true && correos.length === 1 && correos[0].attachments?.[0]?.contentType === 'application/pdf', JSON.stringify(envio.body));
    check('El correo dice «realizado a favor de Concorrotarios»', /realizado a favor de Concorrotarios/.test(correos[0]?.text || ''));
    const repetido = await llamar(ctl.sendNotice, { params: { transferId: tid }, body: { to: ['tesoreria@concorrotarios.org'], confirm: true, operationKey: 'op-1' } });
    check('Doble clic: no se envía dos veces', repetido.body?.repetida === true && correos.length === 1);
    check('Todo queda en el historial', ['traslado_registrado', 'traslado_estado', 'comprobante_enviado'].every(k => mem.history.some(h => h.kind === k)));

    const boveda = mem.sql.filter(q => /"(Payment|Disbursement|DisbursementNotice|DisbursementBatch|PaymentLifecycleEvent|Ledger\w*)"/.test(q));
    check('⚠️ Ni una consulta a tablas de la Bóveda en todo el camino', boveda.length === 0, boveda[0]?.slice(0, 80));
}

// ── 3. Independencia de la Bóveda (el código) ──────────────────────
grupo('3. Eventos no depende de la Bóveda de Fondos');
{
    const BOVEDA = /"(Payment|Disbursement|DisbursementNotice|DisbursementBatch|PaymentLifecycleEvent)"|\/financial\/|BulkDisbursementBar|BulkReconciliationBar|ResendNoticeModal|DisbursementSection/;
    for (const f of [
        'server/lib/eventFundsSpec.js', 'server/lib/eventFundsStore.js', 'server/lib/ensureEventFundsSchema.js',
        'server/controllers/eventFundsController.js', 'server/routes/event-funds.js',
        'src/components/admin/events/EventFundsTab.tsx', 'src/components/admin/events/RegistrationFundsPanel.tsx',
        'src/components/admin/events/funds/TransferCard.tsx', 'src/components/admin/events/funds/TransferFormModal.tsx',
        'src/components/admin/events/funds/SendTransferNoticeModal.tsx', 'src/components/admin/events/funds/BeneficiaryConfig.tsx',
        'src/components/admin/events/funds/eventFundsApi.ts',
    ]) {
        const src = leer(f).split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
        check(`${f} no toca la Bóveda`, !BOVEDA.test(src), src.match(BOVEDA)?.[0]);
    }
    const panel = leer('src/components/admin/events/RegistrationFundsPanel.tsx');
    check('Ya no existe «Registrar movimiento en la Bóveda»', !panel.includes('Registrar movimiento en la Bóveda'));
    check('La ficha ofrece «Gestionar traslado y comprobante» y su historial', panel.includes('Gestionar traslado y comprobante') && panel.includes('Historial financiero y comprobantes'));
    const manager = leer('src/components/admin/events/EventRegistrationsManager.tsx');
    check('El listado de inscripciones no lee la Bóveda', !manager.includes('/financial/'));
    const reg = leer('server/controllers/eventRegistrationController.js');
    check('Confirmar un pago ya NO crea un movimiento en la Bóveda', !reg.includes('insertPayment') && !reg.includes('buildDraftForEventRegistration'));
    const fin = leer('server/controllers/financialController.js');
    check('La Bóveda ya no tiene vista por evento', !fin.includes('eventScope') && !fin.includes('eventFunds'));
    const disb = leer('server/controllers/disbursementController.js');
    check('Avisos y auditoría de la Bóveda, sin filtros de eventos', !disb.includes('eventPaymentIds'));
    const col = leer('server/lib/projectFairCollections.js');
    check('La reconstrucción de la Bóveda vuelve a su criterio de siempre', !col.includes('PAID_REGISTRATION_STATUSES') && col.includes("edition: '12-valledupar'"));
    const audit = leer('server/lib/eventFundsVaultAudit.js');
    check('La auditoría de v4.1248–v4.1249 sólo lee', !/\b(INSERT|UPDATE|DELETE)\b/.test(audit.replace(/\/\/.*$/gm, '')));
    const schema = leer('server/lib/ensureEventFundsSchema.js');
    check('Las siete tablas propias se declaran', ['EventFundsConfig', 'EventFundsTransfer', 'EventFundsAllocation', 'EventFundsDocument', 'EventFundsNotice', 'EventFundsHistory', 'EventStripeCheck'].every(t => schema.includes(`"${t}"`)));
    const claude = leer('CLAUDE.md');
    check('CLAUDE.md protege las tablas nuevas de db:push', claude.includes('EventFundsTransfer') && claude.includes('EventStripeCheck'));
}

console.log(`\n${pasadas} pasadas, ${fallos.length} fallidas`);
if (fallos.length) {
    console.log('Fallaron:\n - ' + fallos.join('\n - '));
    process.exit(1);
}
process.exit(0);
