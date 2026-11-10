/**
 * SUSTITUIR UNA POSTULACIÓN POR OTRA DEL MISMO CLUB, CON SU PAGO — v4.1311.
 *
 * Pedido del comité (XII Feria, Valledupar 2027) con un caso delante: el club
 * Cúcuta Ciudad de los Árboles tenía dos proyectos postulados. El que NO va a
 * la feria (FP-GLMGQL) tenía el pago real de la inscripción, hecho por otra
 * socia; el que SÍ va (FP-GVGEQX) tenía un pago de prueba de USD 1. Hay que
 * retirar el primero, dejar el segundo respaldado por el pago real y no perder
 * ni duplicar un peso. Hasta ahora eso se hacía con un script suelto con los
 * identificadores escritos a mano (`scripts/reconcile-clara-hernandez.mjs`),
 * que copiaba los datos de Stripe de una fila a otra.
 *
 * ⚠️ EL DINERO NO SE MUEVE DE FILA. Se reutiliza la regla de la inscripción
 * conjunta (v4.1299): el pago vive UNA sola vez, en su ANCLA, y el proyecto
 * que respalda queda `paid` con `metadata.payment.coveredBy` y SIN
 * `amountReceived`. Así:
 *   - la Bóveda sigue emparejando el cobro por su referencia de Stripe, que
 *     no cambia de fila (`providerRefOf`): ni se duplica ni se desempareja;
 *   - un reembolso del pago real alcanza al proyecto respaldado por la misma
 *     vía que en la inscripción conjunta (`coveredSubmissionIds`);
 *   - la ficha, el perfil del club y el comprobante leen la transacción del
 *     ancla, como ya hacen con cualquier proyecto cubierto.
 * Copiar los identificadores de Stripe a la otra fila (lo que hacía el script)
 * deja dos filas con la misma referencia, y la Bóveda y los webhooks eligen
 * una al azar.
 *
 * Este archivo es el CRITERIO, **puro**: qué se comprueba, qué bloquea, cómo se
 * clasifica el pago que deja de respaldar al proyecto y la huella que ata lo
 * que se verificó con lo que se aplica. La consulta a la base y a Stripe, y la
 * transacción, viven en `projectFairAdminController.js`.
 */

import crypto from 'node:crypto';

export const SUBSTITUTION_VERSION = 1;

/** Sin tildes, en minúsculas y con los espacios colapsados. */
export const normalizeText = (value) => String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Las palabras que cambian entre dos maneras de escribir el mismo club:
// «Cúcuta Ciudad de Árboles» y «cucuta ciudad de los arboles».
const CLUB_STOPWORDS = new Set(['club', 'rotario', 'rotary', 'de', 'del', 'la', 'las', 'los', 'el', 'y']);

/** La llave de comparación de un nombre de club. */
export const clubKey = (name) => normalizeText(name).split(' ').filter(w => w && !CLUB_STOPWORDS.has(w)).join(' ');

/** El número del distrito, venga como «4271» o «Rotary Distrito 4271». */
export const districtKey = (district) => (String(district ?? '').match(/\d{4}/) || [''])[0];

/** Una fecha como ISO; lo que no se pueda leer como fecha, como texto (nunca lanza). */
const iso = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const fullName = (row) => `${row?.firstName || ''} ${row?.lastName || ''}`.replace(/\s+/g, ' ').trim();

/** Lo que una fila dice de su pago, en una forma estable. */
export const paymentFactsOf = (row) => {
    if (!row) return null;
    const pay = row.metadata?.payment || {};
    return {
        status: row.status || null,
        origin: row.paymentConfirmationOrigin
            || (row.status === 'paid' ? (row.stripeSessionId || row.stripePaymentIntentId ? 'stripe' : 'manual_admin') : null),
        amountReceived: num(row.amountReceived),
        chargeCurrency: row.chargeCurrency || null,
        amountCop: num(row.amountCop),
        amountUsd: num(row.amountUsd),
        paidAt: iso(row.paidAt),
        refundedAmount: num(row.refundedAmount),
        stripeSessionId: row.stripeSessionId || null,
        stripePaymentIntentId: row.stripePaymentIntentId || null,
        stripeChargeId: row.stripeChargeId || null,
        stripeCustomerId: row.stripeCustomerId || null,
        receiptUrl: row.receiptUrl || null,
        paymentMethod: row.paymentMethod || null,
        manualPaymentRef: row.manualPaymentRef || null,
        manualPaymentEvidence: row.manualPaymentEvidence || null,
        manualPaymentReason: row.manualPaymentReason || null,
        manualPaymentBy: row.manualPaymentBy || null,
        manualPaymentAt: iso(row.manualPaymentAt),
        manualPaymentReceiptKey: row.manualPaymentReceiptKey || null,
        manualPaymentReceiptName: row.manualPaymentReceiptName || null,
        manualPaymentReceiptMime: row.manualPaymentReceiptMime || null,
        manualPaymentReceiptBytes: num(row.manualPaymentReceiptBytes),
        coveredBy: pay.coveredBy || null,
        coveredSubmissionIds: Array.isArray(pay.coveredSubmissionIds) ? pay.coveredSubmissionIds : [],
        coveredProjects: Array.isArray(pay.coveredProjects) ? pay.coveredProjects : [],
        metadataPayment: Object.keys(pay).length ? pay : null,
    };
};

/**
 * Lo que Stripe dice de un PaymentIntent, reducido a lo que decide algo.
 * Recibe el objeto ya consultado (con `latest_charge` expandido) o el error.
 */
export const stripeFactsOf = (pi, error = null) => {
    if (error) {
        const missing = error?.code === 'resource_missing' || error?.statusCode === 404;
        return { found: false, missing, error: String(error?.message || error).slice(0, 300) };
    }
    if (!pi) return null;
    const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const amountRefunded = Number(charge?.amount_refunded || 0);
    return {
        found: true,
        id: pi.id,
        livemode: pi.livemode === true,
        status: pi.status || null,
        currency: String(pi.currency || '').toUpperCase() || null,
        // En la unidad mínima de su moneda, como la da Stripe.
        amountMinor: Number(pi.amount_received ?? pi.amount ?? 0),
        amountRefundedMinor: amountRefunded,
        refunded: !!charge?.refunded || amountRefunded > 0,
        disputed: !!charge?.disputed,
        chargeId: charge?.id || null,
        billingName: charge?.billing_details?.name || null,
        billingEmail: charge?.billing_details?.email || charge?.receipt_email || pi.receipt_email || null,
        metadataSubmissionId: pi.metadata?.submissionId || null,
        created: pi.created ? new Date(pi.created * 1000).toISOString() : null,
    };
};

/**
 * EL PAGO QUE DEJA DE RESPALDAR AL PROYECTO CONSERVADO, clasificado.
 *
 * No se borra ni se reembolsa nada: se etiqueta, para que nadie lo confunda con
 * el pago oficial. Lo que decide la etiqueta es si hubo dinero de verdad:
 *   - `none`          — el proyecto no tenía pago.
 *   - `stripe_test`   — Stripe en modo de pruebas: no hubo dinero.
 *   - `stripe_live`   — cobro REAL en Stripe: el dinero existe, sigue en la
 *                       Bóveda con su referencia y su tratamiento (conservar o
 *                       reembolsar) es una decisión financiera aparte.
 *   - `manual`        — confirmación administrativa sin pasarela.
 *   - `unverified`    — tenía referencia de Stripe y Stripe no respondió.
 */
export const classifyReplacedPayment = (facts, stripe) => {
    if (!facts || facts.status !== 'paid') {
        return { kind: 'none', realMoney: false, label: 'Sin pago propio' };
    }
    const hasStripeRef = !!(facts.stripePaymentIntentId || facts.stripeSessionId);
    if (!hasStripeRef || facts.origin === 'manual_admin') {
        return {
            kind: 'manual', realMoney: null,
            label: 'Confirmación administrativa sin pasarela (no hay cobro en Stripe)',
        };
    }
    if (stripe?.found && stripe.livemode === false) {
        return { kind: 'stripe_test', realMoney: false, label: 'Pago de prueba en modo de pruebas de Stripe (sin dinero real)' };
    }
    if (stripe?.found && stripe.livemode === true) {
        return {
            kind: 'stripe_live', realMoney: true,
            label: stripe.refunded
                ? 'Cobro real en Stripe usado como prueba, ya reembolsado'
                : 'Cobro real en Stripe usado como prueba (el dinero existe y se conserva registrado)',
        };
    }
    if (stripe && !stripe.found && stripe.missing) {
        // La clave de producción no encuentra el objeto: se creó con la de
        // pruebas. Es lo que pasa con un pago hecho en modo de pruebas.
        return { kind: 'stripe_test', realMoney: false, label: 'La cuenta real de Stripe no tiene esa transacción: se hizo en modo de pruebas' };
    }
    return { kind: 'unverified', realMoney: null, label: 'No se pudo verificar en Stripe' };
};

/** Las comprobaciones, cada una con su motivo. Las `blocking` impiden aplicar. */
const check = (key, label, ok, detail, blocking = true) => ({ key, label, ok: !!ok, detail: detail || null, blocking });

/** ¿El ancla ya cubre al conservado? Es la marca de una sustitución aplicada. */
export const isAlreadyApplied = (retired, kept) => !!(retired && kept
    && kept.metadata?.payment?.coveredBy === retired.id
    && kept.metadata?.substitution?.fromId === retired.id
    && retired.metadata?.substitution?.replacedBy === kept.id
    && retired.archivedAt);

/**
 * EL VEREDICTO. Dadas las dos filas FRESCAS, lo que Stripe dijo de cada pago y
 * lo que el comité declaró que espera, devuelve qué pasa, por qué y la huella.
 *
 * `expected`: { retiredRef, keptRef, amount, currency } — lo que el comité dice
 * que es el pago oficial. Una diferencia con la base DETIENE la operación: es
 * la exigencia expresa del pedido.
 */
export const substitutionPlan = ({
    retired, kept, retiredStripe = null, keptStripe = null, expected = {}, ledger = {},
} = {}) => {
    const checks = [];
    const retiredFacts = paymentFactsOf(retired);
    const keptFacts = paymentFactsOf(kept);
    const expRetired = String(expected.retiredRef || '').trim().toUpperCase();
    const expKept = String(expected.keptRef || '').trim().toUpperCase();

    checks.push(check('retired_found', 'El proyecto que se retira existe',
        retired && (!expRetired || String(retired.publicRef || '').toUpperCase() === expRetired),
        retired ? `${retired.publicRef} — ${retired.projectName}` : `No existe ${expRetired || 'el proyecto indicado'}`));
    checks.push(check('kept_found', 'El proyecto que se conserva existe',
        kept && (!expKept || String(kept.publicRef || '').toUpperCase() === expKept),
        kept ? `${kept.publicRef} — ${kept.projectName}` : `No existe ${expKept || 'el proyecto indicado'}`));

    if (!retired || !kept) {
        return finish({ retired, kept, checks, retiredFacts, keptFacts, retiredStripe, keptStripe, expected, ledger });
    }

    if (isAlreadyApplied(retired, kept)) {
        return finish({ retired, kept, checks, retiredFacts, keptFacts, retiredStripe, keptStripe, expected, ledger, alreadyApplied: true });
    }

    checks.push(check('distinct', 'Son dos proyectos distintos', retired.id !== kept.id));
    checks.push(check('same_edition', 'Son de la misma edición de la feria',
        (retired.eventId || null) === (kept.eventId || null),
        `${retired.eventId || 'sin edición'} / ${kept.eventId || 'sin edición'}`));
    const sameClub = clubKey(retired.clubName) && clubKey(retired.clubName) === clubKey(kept.clubName);
    const sameDistrict = districtKey(retired.district) === districtKey(kept.district);
    checks.push(check('same_club', 'Son del mismo club y distrito', sameClub && sameDistrict,
        `«${retired.clubName}» (${retired.district}) / «${kept.clubName}» (${kept.district})`));

    // El que se conserva tiene que seguir siendo una postulación viva.
    const keptState = kept.workflowStatus || 'received';
    checks.push(check('kept_active', 'El proyecto conservado está activo',
        !kept.archivedAt && !['withdrawn', 'rejected', 'draft', 'formulating'].includes(keptState),
        kept.archivedAt ? 'Está archivado' : `Estado: ${keptState}`));
    checks.push(check('retired_not_archived', 'El proyecto que se retira no está archivado todavía', !retired.archivedAt,
        retired.archivedAt ? `Archivado el ${iso(retired.archivedAt)}` : null));

    // ── El pago oficial ────────────────────────────────────────────────
    checks.push(check('retired_paid', 'El pago oficial está confirmado y sin reembolsos',
        retiredFacts.status === 'paid' && !(retiredFacts.refundedAmount > 0),
        `Estado: ${retiredFacts.status}${retiredFacts.refundedAmount > 0 ? ` · reembolsado ${retiredFacts.refundedAmount}` : ''}`));
    checks.push(check('retired_is_anchor', 'El pago oficial es propio (no cubierto por el de otro proyecto)',
        !retiredFacts.coveredBy, retiredFacts.coveredBy ? `Cubierto por ${retired.metadata?.payment?.coveredByRef || retiredFacts.coveredBy}` : null));
    const otherCovered = [
        ...retiredFacts.coveredSubmissionIds,
        ...retiredFacts.coveredProjects.map(p => p?.id),
    ].filter(id => id && id !== retired.id);
    checks.push(check('retired_not_shared', 'El pago oficial no está aplicado a otro proyecto',
        otherCovered.length === 0, otherCovered.length ? `Ya cubre: ${[...new Set(otherCovered)].join(', ')}` : null));

    const currency = String(expected.currency || 'COP').toUpperCase() === 'USD' ? 'USD' : 'COP';
    const line = currency === 'USD' ? retiredFacts.amountUsd : retiredFacts.amountCop;
    const expectedAmount = num(expected.amount);
    checks.push(check('official_amount', 'El importe del pago oficial coincide con lo informado',
        expectedAmount != null && line != null && Math.abs(line - expectedAmount) < 0.005,
        `Base: ${line == null ? 'sin valor' : `${line} ${currency}`} · informado: ${expectedAmount == null ? 'sin valor' : `${expectedAmount} ${currency}`}`
        + (retiredFacts.amountReceived != null ? ` · recibido por la pasarela: ${retiredFacts.amountReceived} ${retiredFacts.chargeCurrency || ''}`.trimEnd() : '')));

    // La pasarela: si el pago fue por Stripe, Stripe tiene que confirmarlo.
    const retiredViaStripe = !!(retiredFacts.stripePaymentIntentId || retiredFacts.stripeSessionId) && retiredFacts.origin !== 'manual_admin';
    if (retiredViaStripe) {
        const s = retiredStripe;
        const okStripe = !!(s?.found && s.livemode && s.status === 'succeeded' && !s.refunded && !s.disputed
            && (!s.metadataSubmissionId || s.metadataSubmissionId === retired.id));
        checks.push(check('retired_gateway', 'Stripe confirma el pago oficial (real, capturado, sin reembolso ni disputa)', okStripe,
            !s ? 'No se consultó Stripe'
                : !s.found ? `Stripe no lo encontró: ${s.error || 'sin detalle'}`
                    : [
                        `PaymentIntent ${s.id}`, s.livemode ? 'modo real' : 'MODO DE PRUEBAS', `estado ${s.status}`,
                        s.refunded ? 'CON REEMBOLSO' : 'sin reembolso', s.disputed ? 'EN DISPUTA' : null,
                        s.metadataSubmissionId && s.metadataSubmissionId !== retired.id ? `pertenece a ${s.metadataSubmissionId}` : null,
                    ].filter(Boolean).join(' · ')));
    } else {
        checks.push(check('retired_gateway', 'El pago oficial tiene soporte de la confirmación administrativa',
            !!(retiredFacts.manualPaymentRef && (retiredFacts.manualPaymentReceiptKey || retiredFacts.manualPaymentEvidence)),
            `Confirmación manual · ref ${retiredFacts.manualPaymentRef || '—'} · ${retiredFacts.manualPaymentReceiptName ? `comprobante ${retiredFacts.manualPaymentReceiptName}` : (retiredFacts.manualPaymentEvidence ? 'soporte escrito' : 'SIN SOPORTE')}`));
    }

    // ── El pago que tenía el proyecto conservado ───────────────────────
    checks.push(check('kept_not_covered', 'El proyecto conservado no está cubierto por otro pago',
        !keptFacts.coveredBy, keptFacts.coveredBy ? `Cubierto por ${kept.metadata?.payment?.coveredByRef || keptFacts.coveredBy}` : null));
    const keptShares = [
        ...keptFacts.coveredSubmissionIds,
        ...keptFacts.coveredProjects.map(p => p?.id),
    ].filter(id => id && id !== kept.id);
    checks.push(check('kept_not_shared', 'El pago anterior del proyecto conservado no cubre a otros proyectos',
        keptShares.length === 0, keptShares.length ? `Cubre: ${[...new Set(keptShares)].join(', ')}` : null));
    checks.push(check('kept_no_checkout', 'El proyecto conservado no tiene un cobro en curso',
        keptFacts.status !== 'processing' && !ledger.keptOpenAttempt,
        keptFacts.status === 'processing' || ledger.keptOpenAttempt ? 'Hay un intento de pago abierto' : null));
    const keptReplaced = classifyReplacedPayment(keptFacts, keptStripe);
    checks.push(check('kept_payment_classified', 'El pago anterior del proyecto conservado está identificado',
        keptReplaced.kind !== 'unverified', keptReplaced.label));

    return finish({ retired, kept, checks, retiredFacts, keptFacts, retiredStripe, keptStripe, expected, ledger, keptReplaced });
};

const finish = ({ retired, kept, checks, retiredFacts, keptFacts, retiredStripe, keptStripe, expected, ledger, alreadyApplied = false, keptReplaced = null }) => {
    const blocking = checks.filter(c => c.blocking && !c.ok);
    const replaced = keptReplaced || classifyReplacedPayment(keptFacts, keptStripe);
    const plan = {
        version: SUBSTITUTION_VERSION,
        alreadyApplied,
        ok: !alreadyApplied && blocking.length === 0,
        checks,
        blocking: blocking.map(c => c.key),
        retired: retired ? {
            id: retired.id, publicRef: retired.publicRef, projectName: retired.projectName,
            clubName: retired.clubName, district: retired.district, responsable: fullName(retired),
            email: retired.email, workflowStatus: retired.workflowStatus || 'received',
            projectIndex: Number(retired.projectIndex) >= 2 ? 2 : 1,
            archivedAt: retired.archivedAt || null, payment: retiredFacts,
        } : null,
        kept: kept ? {
            id: kept.id, publicRef: kept.publicRef, projectName: kept.projectName,
            clubName: kept.clubName, district: kept.district, responsable: fullName(kept),
            email: kept.email, workflowStatus: kept.workflowStatus || 'received',
            projectIndex: Number(kept.projectIndex) >= 2 ? 2 : 1,
            archivedAt: kept.archivedAt || null, payment: keptFacts,
        } : null,
        // Quién pagó: la persona que figura en la fila del pago oficial, y lo
        // que Stripe registró como titular. NO se reemplaza por el responsable
        // del proyecto conservado.
        payer: retired ? {
            name: fullName(retired) || null,
            email: retired.email || null,
            phone: retired.phone || null,
            gatewayName: retiredStripe?.billingName || null,
            gatewayEmail: retiredStripe?.billingEmail || null,
        } : null,
        retiredStripe: retiredStripe || null,
        keptStripe: keptStripe || null,
        replacedPayment: replaced,
        ledger: {
            retiredMovement: ledger.retiredMovement || null,
            keptMovement: ledger.keptMovement || null,
        },
        expected: {
            amount: num(expected.amount),
            currency: String(expected.currency || 'COP').toUpperCase() === 'USD' ? 'USD' : 'COP',
        },
    };
    plan.fingerprint = fingerprintOf(retired, kept, retiredStripe, keptStripe, plan.expected);
    return plan;
};

/**
 * LA HUELLA DE LO VERIFICADO. La pantalla la devuelve al aplicar; si entre la
 * verificación y la aplicación cambió cualquiera de las dos filas (un webhook,
 * otra persona) o lo que Stripe dice, la huella no coincide y no se aplica.
 */
export const fingerprintOf = (retired, kept, retiredStripe, keptStripe, expected) => {
    const pick = (row) => (row ? {
        id: row.id, publicRef: row.publicRef, updatedAt: iso(row.updatedAt),
        archivedAt: iso(row.archivedAt),
        workflowStatus: row.workflowStatus || null, payment: paymentFactsOf(row),
    } : null);
    const st = (s) => (s ? { found: s.found, id: s.id || null, livemode: s.livemode ?? null, status: s.status || null, refunded: s.refunded ?? null, disputed: s.disputed ?? null, amountMinor: s.amountMinor ?? null } : null);
    const payload = JSON.stringify({ v: SUBSTITUTION_VERSION, r: pick(retired), k: pick(kept), rs: st(retiredStripe), ks: st(keptStripe), e: expected || null });
    return crypto.createHash('sha256').update(payload).digest('hex');
};

/**
 * LO QUE SE ESCRIBE en cada fila, como datos (la sentencia vive en el
 * controlador). Separarlo deja probar sin base que el pago oficial NO pierde su
 * referencia de Stripe, que el conservado queda sin `amountReceived` y que el
 * pago anterior queda guardado entero.
 */
export const substitutionWrites = (plan, { actor = null, reason = '', at = new Date().toISOString() } = {}) => {
    const r = plan.retired;
    const k = plan.kept;
    const official = r.payment;
    const by = actor?.name || null;
    // Con la línea del pago oficial: es lo que el perfil del club pinta como
    // desglose de lo cobrado (`paymentStateFor` lee `coveredProjects`).
    const keptEntry = { id: k.id, publicRef: k.publicRef || null, projectName: k.projectName || '', projectIndex: k.projectIndex || 1, amountCop: official.amountCop, amountUsd: official.amountUsd, substituted: true };
    const retiredEntry = { id: r.id, publicRef: r.publicRef || null, projectName: r.projectName || '', projectIndex: r.projectIndex || 1, amountCop: official.amountCop, amountUsd: official.amountUsd };
    // ⚠️ EL RETIRADO QUEDA EN CERO: el perfil suma las líneas de
    // `coveredProjects` para explicar el cobro, y el dinero se cobró UNA vez.
    // Con las dos en 250.000 mostraría 500.000 pagados.
    const coveredProjects = (official.coveredProjects.length ? official.coveredProjects : [retiredEntry])
        .map(p => (p?.id === r.id ? { ...p, amountCop: 0, amountUsd: 0, withdrawn: true, substitutedBy: k.publicRef || k.id } : p));
    if (!coveredProjects.some(p => p?.id === k.id)) coveredProjects.push(keptEntry);
    const coveredSubmissionIds = [...new Set([...(official.coveredSubmissionIds.length ? official.coveredSubmissionIds : [r.id]), k.id])];

    const reassignment = {
        fromId: r.id, fromRef: r.publicRef, toId: k.id, toRef: k.publicRef,
        at, by, actorId: actor?.id || null, reason,
    };

    return {
        retired: {
            archivedReason: `Archivado — sustituido por ${k.publicRef}. ${reason}`.trim(),
            workflowStatus: 'withdrawn',
            // Se FUSIONA en `metadata.payment`: el registro del cobro real no se toca.
            paymentMerge: {
                coveredSubmissionIds,
                coveredProjects,
                reassignedTo: reassignment,
            },
            substitution: {
                role: 'retired', version: SUBSTITUTION_VERSION,
                replacedBy: k.id, replacedByRef: k.publicRef,
                previousWorkflowStatus: r.workflowStatus, ...reassignment,
            },
        },
        kept: {
            // La línea de la inscripción es la del pago oficial: es lo que suma
            // al recaudo de la feria (los indicadores suman la línea).
            amountCop: official.amountCop,
            amountUsd: official.amountUsd,
            paidAt: official.paidAt,
            chargeCurrency: official.chargeCurrency,
            paymentMethod: official.paymentMethod,
            paymentConfirmationOrigin: official.origin || 'stripe',
            // Si el pago oficial fue una confirmación administrativa, el
            // proyecto respaldado lleva su misma trazabilidad, como en v4.1308.
            manual: official.origin === 'manual_admin' ? {
                ref: official.manualPaymentRef, evidence: official.manualPaymentEvidence,
                reason: official.manualPaymentReason, by: official.manualPaymentBy, at: official.manualPaymentAt,
                receiptKey: official.manualPaymentReceiptKey, receiptName: official.manualPaymentReceiptName,
                receiptMime: official.manualPaymentReceiptMime, receiptBytes: official.manualPaymentReceiptBytes,
            } : null,
            // `metadata.payment` se REEMPLAZA: el anterior va entero a
            // `substitution.previousPayment`.
            payment: {
                coveredBy: r.id, coveredByRef: r.publicRef || null,
                sessionId: official.stripeSessionId, paymentIntentId: official.stripePaymentIntentId,
                reassigned: true, confirmedAt: at,
            },
            substitution: {
                role: 'kept', version: SUBSTITUTION_VERSION, ...reassignment,
                payer: plan.payer,
                official: {
                    amountReceived: official.amountReceived, currency: official.chargeCurrency,
                    amountCop: official.amountCop, amountUsd: official.amountUsd, paidAt: official.paidAt,
                    origin: official.origin, paymentMethod: official.paymentMethod,
                    stripeSessionId: official.stripeSessionId, stripePaymentIntentId: official.stripePaymentIntentId,
                    stripeChargeId: official.stripeChargeId, receiptUrl: official.receiptUrl,
                    manualPaymentRef: official.manualPaymentRef,
                },
                previousPayment: { ...k.payment, classification: plan.replacedPayment, stripe: plan.keptStripe || null },
                previousLines: { amountCop: k.payment.amountCop, amountUsd: k.payment.amountUsd },
                previousWorkflowStatus: k.workflowStatus,
            },
        },
    };
};

/** La sustitución vista desde la ficha: lo que el panel pinta. Sin claves privadas. */
export const substitutionViewOf = (row, { viewPayments = false } = {}) => {
    const sub = row?.metadata?.substitution;
    if (!sub || typeof sub !== 'object') return null;
    const base = {
        role: sub.role, at: sub.at || null, by: sub.by || null, reason: sub.reason || null,
        fromId: sub.fromId || null, fromRef: sub.fromRef || null, toId: sub.toId || null, toRef: sub.toRef || null,
    };
    if (sub.role !== 'kept') return base;
    const off = sub.official || {};
    const prev = sub.previousPayment || {};
    return {
        ...base,
        payer: sub.payer ? { name: sub.payer.name || null, email: sub.payer.email || null, gatewayName: sub.payer.gatewayName || null } : null,
        official: {
            amountReceived: num(off.amountReceived), currency: off.currency || null,
            amountCop: num(off.amountCop), amountUsd: num(off.amountUsd), paidAt: off.paidAt || null,
            origin: off.origin || null, paymentMethod: off.paymentMethod || null,
            ...(viewPayments ? { stripePaymentIntentId: off.stripePaymentIntentId || null, stripeSessionId: off.stripeSessionId || null, receiptUrl: off.receiptUrl || null, manualPaymentRef: off.manualPaymentRef || null } : {}),
        },
        previousPayment: {
            status: prev.status || null,
            amountReceived: num(prev.amountReceived), currency: prev.chargeCurrency || null,
            paidAt: prev.paidAt || null, origin: prev.origin || null,
            classification: prev.classification ? { kind: prev.classification.kind, label: prev.classification.label, realMoney: prev.classification.realMoney ?? null } : null,
            ...(viewPayments ? { stripePaymentIntentId: prev.stripePaymentIntentId || null, stripeSessionId: prev.stripeSessionId || null, livemode: prev.stripe?.livemode ?? null } : {}),
        },
    };
};
