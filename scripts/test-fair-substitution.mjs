#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Sustituir una postulación por otra del mismo club, con su pago — CRITERIO (v4.1311)
// npm run test:fair:substitution   (sin base ni red)
//
// El criterio puro (`server/lib/projectFairSubstitution.js`) y las
// invariantes leídas de los archivos. El recorrido completo contra Postgres
// real está en `test:fair:substitution:e2e` y en el navegador en `:ui`.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const {
    clubKey, districtKey, classifyReplacedPayment, paymentFactsOf, stripeFactsOf,
    substitutionPlan, substitutionWrites, isAlreadyApplied, fingerprintOf,
} = await import(`${REPO}/server/lib/projectFairSubstitution.js`);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };

console.log('── El mismo club, escrito de dos maneras');
ok(clubKey('Cúcuta Ciudad de Árboles') === clubKey('cucuta ciudad de los arboles'), '«Cúcuta Ciudad de Árboles» = «cucuta ciudad de los arboles»');
ok(clubKey('Club Rotario Pasto') !== clubKey('Cúcuta Ciudad de Árboles'), 'dos clubes distintos no se confunden');
ok(districtKey('Rotary Distrito 4271') === '4271' && districtKey('4271') === '4271', 'el distrito se compara por su número');

const retired = {
    id: 'r1', publicRef: 'FP-GLMGQL', projectName: 'Adecuación', eventId: 'e', clubName: 'Cúcuta Ciudad de Árboles', district: 'Rotary Distrito 4271',
    firstName: 'XIMENA', lastName: 'CAICEDO', email: 'x@h.com', workflowStatus: 'received', status: 'paid', amountCop: 250000, amountUsd: 62.5,
    amountReceived: 262500, chargeCurrency: 'COP', paidAt: '2026-08-11T15:20:00Z', stripePaymentIntentId: 'pi_x', stripeSessionId: 'cs_x',
    paymentConfirmationOrigin: 'stripe', metadata: { payment: { coveredSubmissionIds: ['r1'], coveredProjects: [{ id: 'r1', amountCop: 250000 }] } },
    updatedAt: '2026-08-11T15:20:00Z',
};
const kept = {
    id: 'k1', publicRef: 'FP-GVGEQX', projectName: 'Centro para la Paz', eventId: 'e', clubName: 'cucuta ciudad de los arboles', district: 'Rotary Distrito 4271',
    firstName: 'francy', lastName: 'calderon bonilla', workflowStatus: 'in_review', status: 'paid', amountCop: 250000, amountReceived: 1, chargeCurrency: 'USD',
    stripePaymentIntentId: 'pi_test', paymentConfirmationOrigin: 'stripe', metadata: { payment: { sessionId: 'cs_test' } }, updatedAt: '2026-07-31T18:00:00Z',
};
const live = stripeFactsOf({ id: 'pi_x', livemode: true, status: 'succeeded', amount: 26250000, currency: 'cop', metadata: { submissionId: 'r1' },
    latest_charge: { id: 'ch', amount_refunded: 0, refunded: false, disputed: false, billing_details: { name: 'Ximena Caicedo' } } });
const missing = stripeFactsOf(null, { code: 'resource_missing', message: 'No such payment_intent' });
const expected = { retiredRef: 'FP-GLMGQL', keptRef: 'FP-GVGEQX', amount: 250000, currency: 'COP' };

console.log('── El pago anterior, clasificado (no se borra)');
ok(classifyReplacedPayment(paymentFactsOf(kept), missing).kind === 'stripe_test', 'la cuenta real no lo encuentra → prueba sin dinero');
ok(classifyReplacedPayment(paymentFactsOf(kept), { ...live, livemode: true }).realMoney === true, 'en modo real → cobro real que se conserva');
ok(classifyReplacedPayment(paymentFactsOf(kept), { found: true, livemode: false }).kind === 'stripe_test', 'livemode false → prueba');
ok(classifyReplacedPayment(paymentFactsOf({ ...kept, stripePaymentIntentId: null, paymentConfirmationOrigin: 'manual_admin' }), null).kind === 'manual', 'confirmación manual → sin pasarela');
ok(classifyReplacedPayment(paymentFactsOf(kept), { found: false, missing: false, error: 'timeout' }).kind === 'unverified', 'Stripe sin respuesta → sin verificar (y eso bloquea)');

console.log('── El veredicto');
const plan = substitutionPlan({ retired, kept, retiredStripe: live, keptStripe: missing, expected });
ok(plan.ok && !plan.alreadyApplied, 'el caso real pasa');
ok(plan.payer.name === 'XIMENA CAICEDO', 'el pagador es quien figura en el pago oficial');
const bloquea = (cambio, clave, m) => {
    const p = substitutionPlan({ retired, kept, retiredStripe: live, keptStripe: missing, expected, ...cambio });
    ok(!p.ok && p.blocking.includes(clave), m);
};
bloquea({ expected: { ...expected, amount: 300000 } }, 'official_amount', 'un importe distinto al informado bloquea');
bloquea({ retiredStripe: { ...live, refunded: true } }, 'retired_gateway', 'un pago oficial reembolsado bloquea');
bloquea({ retiredStripe: { ...live, livemode: false } }, 'retired_gateway', 'un pago oficial en modo de pruebas bloquea');
bloquea({ retiredStripe: { ...live, metadataSubmissionId: 'otro' } }, 'retired_gateway', 'un pago que Stripe atribuye a otra inscripción bloquea');
bloquea({ retiredStripe: missing }, 'retired_gateway', 'un pago oficial que Stripe no encuentra bloquea');
bloquea({ kept: { ...kept, clubName: 'Club Pasto' } }, 'same_club', 'otro club bloquea');
bloquea({ kept: { ...kept, eventId: 'otra' } }, 'same_edition', 'otra edición bloquea');
bloquea({ kept: { ...kept, archivedAt: '2026-01-01' } }, 'kept_active', 'un conservado archivado bloquea');
bloquea({ retired: { ...retired, metadata: { payment: { coveredSubmissionIds: ['r1', 'z9'] } } } }, 'retired_not_shared', 'un pago que ya cubre a otro proyecto bloquea');
bloquea({ kept: { ...kept, metadata: { payment: { coveredBy: 'z9' } } } }, 'kept_not_covered', 'un conservado ya cubierto por otro pago bloquea');
bloquea({ keptStripe: { found: false, missing: false, error: 'timeout' } }, 'kept_payment_classified', 'un pago anterior sin verificar bloquea');
bloquea({ ledger: { keptOpenAttempt: true } }, 'kept_no_checkout', 'un cobro abierto en el conservado bloquea');

console.log('── Lo que se escribe');
const w = substitutionWrites(plan, { actor: { id: 'u', name: 'comite@feria.org' }, reason: 'Motivo suficiente', at: '2026-11-10T00:00:00Z' });
ok(!('amountReceived' in w.kept) && w.kept.payment.coveredBy === 'r1', 'el conservado queda cubierto y sin `amountReceived` propio');
ok(!('stripePaymentIntentId' in w.retired) && w.retired.paymentMerge.coveredSubmissionIds.includes('k1'), 'el ancla no pierde su referencia: sólo SUMA a quién respalda');
ok(w.retired.paymentMerge.coveredProjects.find(p => p.id === 'r1').amountCop === 0
    && w.retired.paymentMerge.coveredProjects.find(p => p.id === 'k1').amountCop === 250000, 'la línea del retirado queda en 0: el perfil no suma 500.000');
ok(w.kept.substitution.previousPayment.stripePaymentIntentId === 'pi_test' && w.kept.substitution.previousPayment.metadataPayment.sessionId === 'cs_test', 'el pago anterior se guarda entero');
ok(w.kept.substitution.payer.name === 'XIMENA CAICEDO' && w.kept.substitution.by === 'comite@feria.org', 'pagador y administrador quedan en el registro');
ok(w.retired.workflowStatus === 'withdrawn' && /sustituido por FP-GVGEQX/.test(w.retired.archivedReason), 'el retirado: archivado y retirado de la feria');

console.log('── Idempotencia y huella');
const aplicado = {
    retired: { ...retired, archivedAt: '2026-11-10T00:00:00Z', metadata: { ...retired.metadata, substitution: { replacedBy: 'k1' } } },
    kept: { ...kept, metadata: { payment: { coveredBy: 'r1' }, substitution: { fromId: 'r1' } } },
};
ok(isAlreadyApplied(aplicado.retired, aplicado.kept), 'una sustitución aplicada se reconoce');
ok(substitutionPlan({ ...aplicado, retiredStripe: live, expected }).alreadyApplied, '…y el veredicto lo dice en vez de volver a aplicarla');
ok(fingerprintOf(retired, kept, live, missing, expected) !== fingerprintOf({ ...retired, updatedAt: '2026-08-12T00:00:00Z' }, kept, live, missing, expected), 'cualquier cambio en una fila cambia la huella');

console.log('── Invariantes en los archivos');
const ctl = readFileSync(`${REPO}/server/controllers/projectFairAdminController.js`, 'utf8');
const aplicar = ctl.slice(ctl.indexOf('export const applySubstitution'));
ok(/BEGIN/.test(aplicar) && /ROLLBACK/.test(aplicar) && /COMMIT/.test(aplicar) && /FOR UPDATE/.test(ctl), 'la aplicación es UNA transacción con filas bloqueadas');
ok(/plan\.fingerprint !== fingerprint/.test(aplicar), 'se exige la huella de lo verificado');
ok(!/INSERT INTO "Payment"/.test(aplicar) && !/refunds\.create|paymentIntents\.create|checkout\.sessions\.create/.test(aplicar), 'no crea cobros, movimientos ni reembolsos');
ok(/"amountReceived" = NULL/.test(aplicar) && !/SET "amountReceived"/.test(aplicar.slice(0, aplicar.indexOf('"workflowStatus" = $4') + 40)), 'el ancla conserva su `amountReceived`; sólo el conservado queda sin él');
const fair = readFileSync(`${REPO}/server/controllers/projectFairController.js`, 'utf8');
const refund = fair.slice(fair.indexOf('export const handleRefund'), fair.indexOf('export const getSubmissionStatus'));
ok(refund.indexOf('payment?.coveredBy') < refund.indexOf("SET status = $1"), 'un reembolso que encuentra a un proyecto cubierto no le cambia el estado');
ok(/metadata\?\.payment\?\.coveredBy[\s\S]{0,400}409/.test(ctl.slice(ctl.indexOf('export const syncStripe'))), '«Sincronizar con Stripe» no le pega un pago propio a un proyecto cubierto');
const forms = readFileSync(`${REPO}/server/controllers/projectFormsController.js`, 'utf8');
ok(/const where = \['s\."archivedAt" IS NULL'\]/.test(forms), 'la revisión de formularios no incluye proyectos archivados');

console.log(`\n✅ test:fair:substitution — ${n} comprobaciones, sin base ni red.`);
