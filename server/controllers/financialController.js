// v4.409 — Motor de donaciones vía Stripe Checkout (Maneras de Contribuir)
// Centraliza el flujo público de aportes: el visitante elige monto + datos,
// el backend crea una Checkout Session de Stripe (cuenta master Valkomen),
// el webhook (paymentController.handleSuccessfulCheckoutSession) registra
// Payment + Donation. El balance del club queda disponible automáticamente
// vía /api/payouts/balance porque Payment.isPlatformCollection = true.
import Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import db from '../lib/db.js'; // v4.414 — pg directo para LECTURAS (cold-start de Prisma es muy lento en Vercel)
import EmailService from '../services/EmailService.js';

console.log('[FINANCIAL v4.422] Controller cargado — donaciones Stripe Checkout + sync retroactivo');

// v4.422 — Margen Valkomen para retiro (debe coincidir con paymentController)
const PLATFORM_HOLDING_DAYS = 6;
const PLATFORM_FEE_PERCENTAGE = 0.05;

const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.05; // 5% Valkomen fee
const DEFAULT_FRONTEND_URL = 'https://app.clubplatform.org';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');

const resolveOrigin = (req, returnUrl) => {
    if (returnUrl && /^https?:\/\//.test(returnUrl)) return returnUrl.replace(/\/$/, '');
    const headerOrigin = req.headers.origin;
    if (headerOrigin && /^https?:\/\//.test(headerOrigin)) return headerOrigin.replace(/\/$/, '');
    return DEFAULT_FRONTEND_URL;
};

// POST /api/financial/donate  (público — cualquier visitante puede donar)
// Body: { clubId, amount, currency?, frequency?, donorEmail, donorName?, message?, isAnonymous?, projectId?, returnUrl? }
export const createDonationCheckout = async (req, res) => {
    try {
        const {
            clubId,
            amount,
            currency = 'USD',
            frequency = 'one-time',
            donorEmail,
            donorName = '',
            message = '',
            isAnonymous = false,
            projectId = null, // v4.416 — donación asociada a proyecto (opcional)
            returnUrl
        } = req.body || {};

        if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });
        const numericAmount = parseFloat(amount);
        if (!numericAmount || numericAmount <= 0) {
            return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        }
        if (numericAmount < 1) {
            return res.status(400).json({ error: 'El monto mínimo es 1' });
        }
        if (frequency !== 'one-time') {
            return res.status(400).json({ error: 'Las donaciones recurrentes estarán disponibles próximamente' });
        }
        if (!donorEmail || !/^\S+@\S+\.\S+$/.test(donorEmail)) {
            return res.status(400).json({ error: 'Email del donante es obligatorio y debe ser válido' });
        }

        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: { id: true, name: true }
        });
        if (!club) return res.status(404).json({ error: 'Club no encontrado' });

        // v4.416 — Si la donación va a un proyecto, validar que existe y pertenece al club
        // v4.420 — el frontend puede mandar el slug en vez del UUID si la URL es amigable
        let project = null;
        if (projectId) {
            project = await prisma.project.findFirst({
                where: {
                    OR: [{ id: projectId }, { slug: projectId }]
                },
                select: { id: true, title: true, clubId: true, image: true, slug: true }
            });
            if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
            if (project.clubId !== clubId) {
                return res.status(400).json({ error: 'El proyecto no pertenece al club indicado' });
            }
        }

        const stripe = getStripe();
        const amountInCents = Math.round(numericAmount * 100);
        const origin = resolveOrigin(req, returnUrl);
        const normalizedCurrency = String(currency).toLowerCase();

        const productName = project
            ? `Aporte al proyecto: ${project.title}`
            : `Donación a ${club.name}`;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: donorEmail,
            line_items: [{
                price_data: {
                    currency: normalizedCurrency,
                    product_data: {
                        name: productName,
                        description: message
                            ? `Mensaje del donante: ${String(message).slice(0, 180)}`
                            : (project ? `${club.name} — proyecto de impacto social` : 'Aporte voluntario')
                    },
                    unit_amount: amountInCents
                },
                quantity: 1
            }],
            success_url: `${origin}/donacion/exito?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: project ? `${origin}/proyectos/${project.slug || project.id}` : `${origin}/donacion/cancelada`,
            metadata: {
                type: 'donation',
                donationType: 'one-time',
                clubId,
                // v4.420 — guardamos siempre el UUID real, aunque el cliente haya mandado el slug
                projectId: project?.id || '',
                donorEmail,
                donorName: String(donorName || '').slice(0, 150),
                message: String(message || '').slice(0, 500),
                isAnonymous: isAnonymous ? 'true' : 'false'
            }
        });

        return res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('[FINANCIAL] Error creating donation checkout:', error);
        return res.status(500).json({ error: error.message || 'Error creando la sesión de pago' });
    }
};

// GET /api/financial/donate/session/:id  (público — la página de éxito la consulta)
export const getDonationSessionStatus = async (req, res) => {
    try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(req.params.id);

        let donation = null;
        if (session.metadata?.clubId) {
            donation = await prisma.donation.findFirst({
                where: {
                    clubId: session.metadata.clubId,
                    donorEmail: session.metadata.donorEmail || session.customer_details?.email || undefined,
                    amount: session.amount_total ? session.amount_total / 100 : undefined
                },
                orderBy: { date: 'desc' }
            });
        }

        return res.json({
            status: session.status,
            paymentStatus: session.payment_status,
            amount: session.amount_total ? session.amount_total / 100 : null,
            currency: (session.currency || 'usd').toUpperCase(),
            customerEmail: session.customer_details?.email || session.customer_email,
            customerName: session.customer_details?.name || session.metadata?.donorName,
            clubId: session.metadata?.clubId || null,
            donationRecorded: !!donation
        });
    } catch (error) {
        console.error('[FINANCIAL] Error retrieving session:', error);
        return res.status(500).json({ error: 'Error consultando la sesión de pago' });
    }
};

// GET /api/financial/donations  (autenticado — el admin del club ve su historial)
// v4.414 — pg directo. El query engine de Prisma cold-starts demasiado lento.
export const listClubDonations = async (req, res) => {
    try {
        const clubId = req.user?.role === 'administrator' && req.query.clubId
            ? req.query.clubId
            : req.user?.clubId;

        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const result = await db.query(
            `SELECT id, amount, currency, "donorName", "donorEmail", status,
                    "isAnonymous", message, date, "projectId"
             FROM "Donation"
             WHERE "clubId" = $1 AND status = 'success'
             ORDER BY date DESC
             LIMIT 200`,
            [clubId]
        );

        const donations = result.rows.map(row => ({
            ...row,
            amount: parseFloat(row.amount),
            isAnonymous: !!row.isAnonymous
        }));

        const totalAmount = donations.reduce((acc, d) => acc + (d.amount || 0), 0);

        return res.json({
            donations,
            totalAmount,
            totalCount: donations.length,
            currency: donations[0]?.currency || 'USD'
        });
    } catch (error) {
        console.error('[FINANCIAL] Error listing donations:', error);
        return res.status(500).json({ error: 'Error listando donaciones', detail: error.message?.slice(0, 200) });
    }
};

// v4.421 — Mini-wallet financiera con sync Stripe. Devuelve los Payments del
// club agrupados en buckets por estado real del dinero, con fechas estimadas
// de disponibilidad (Stripe) y de retiro (Stripe + 6 días margen Valkomen).
// GET /api/financial/wallet  (auth, ?clubId opcional para super admin)
export const getClubWallet = async (req, res) => {
    try {
        const clubId = req.user?.role === 'administrator' && req.query.clubId
            ? req.query.clubId
            : req.user?.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const now = new Date();

        // pg directo (cold-start safe — ver v4.414)
        const paymentsResult = await db.query(
            `SELECT id, "providerRef", status, amount, currency, "applicationFee",
                    "netAmount", "stripeBalanceTxId", "stripeStatus",
                    "availableOn", "clubAvailableOn", "paymentMethod",
                    "createdAt"
             FROM "Payment"
             WHERE "clubId" = $1 AND "isPlatformCollection" = true
             ORDER BY "createdAt" DESC
             LIMIT 500`,
            [clubId]
        );

        const payoutsResult = await db.query(
            `SELECT id, amount, status, "createdAt"
             FROM "PayoutRequest"
             WHERE "clubId" = $1
             ORDER BY "createdAt" DESC`,
            [clubId]
        );

        // Bucketización
        const buckets = {
            processing: [],          // status='pending' (Stripe aún no confirma)
            in_transit: [],          // succeeded + Stripe pending (availableOn > now o stripeStatus='pending')
            available_soon: [],      // Stripe available pero margen Valkomen no completado
            available: [],           // Listo para retiro
            refunded: [],
            failed: []
        };

        for (const p of paymentsResult.rows) {
            const grossAmount = parseFloat(p.amount || 0);
            const netClub = parseFloat(p.netAmount || 0);
            const valkomenFee = parseFloat(p.applicationFee || 0);
            // Stripe fee = lo que falta entre el bruto, el net que recibe el club, y el fee Valkomen
            const stripeFee = Math.max(0, grossAmount - netClub - valkomenFee);
            const netStripe = grossAmount - stripeFee; // lo que entra a la cuenta master Valkomen
            const item = {
                id: p.id,
                providerRef: p.providerRef,
                amount: netClub,           // net final para el club (retirable)
                grossAmount,
                stripeFee,                 // v4.422 — fee Stripe explícito
                netStripe,                 // v4.422 — net después de Stripe (antes de Valkomen)
                applicationFee: valkomenFee, // fee Valkomen
                fee: stripeFee + valkomenFee, // total fees (compat)
                currency: p.currency,
                status: p.status,
                stripeStatus: p.stripeStatus,
                availableOn: p.availableOn,
                clubAvailableOn: p.clubAvailableOn,
                paymentMethod: p.paymentMethod || 'card',
                stripeBalanceTxId: p.stripeBalanceTxId,
                createdAt: p.createdAt
            };

            if (p.status === 'refunded') {
                buckets.refunded.push(item);
            } else if (p.status === 'failed') {
                buckets.failed.push(item);
            } else if (p.status === 'pending') {
                buckets.processing.push(item);
            } else if (p.stripeStatus === 'pending' || (p.availableOn && new Date(p.availableOn) > now)) {
                buckets.in_transit.push(item);
            } else if (p.clubAvailableOn && new Date(p.clubAvailableOn) > now) {
                buckets.available_soon.push(item);
            } else {
                buckets.available.push(item);
            }
        }

        const sum = (arr) => arr.reduce((acc, it) => acc + (it.amount || 0), 0);

        // Total transferido = payouts completados (los fondos ya salieron)
        const transferredAmount = payoutsResult.rows
            .filter(p => p.status === 'completed')
            .reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);

        // Compromisos pendientes (payouts requested/processing)
        const requestedAmount = payoutsResult.rows
            .filter(p => ['pending', 'processing'].includes(p.status))
            .reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);

        const availableForWithdrawal = Math.max(0, sum(buckets.available) - transferredAmount - requestedAmount);

        return res.json({
            currency: 'USD',
            buckets: {
                processing: { total: sum(buckets.processing), count: buckets.processing.length, items: buckets.processing },
                in_transit: { total: sum(buckets.in_transit), count: buckets.in_transit.length, items: buckets.in_transit },
                available_soon: { total: sum(buckets.available_soon), count: buckets.available_soon.length, items: buckets.available_soon },
                available: { total: sum(buckets.available), count: buckets.available.length, items: buckets.available },
                refunded: { total: sum(buckets.refunded), count: buckets.refunded.length, items: buckets.refunded },
                failed: { total: sum(buckets.failed), count: buckets.failed.length, items: buckets.failed }
            },
            summary: {
                grossTotal: paymentsResult.rows.reduce((acc, p) => acc + parseFloat(p.amount || 0), 0),
                netTotal: paymentsResult.rows.reduce((acc, p) => acc + parseFloat(p.netAmount || 0), 0),
                inTransit: sum(buckets.in_transit) + sum(buckets.processing),
                availableSoon: sum(buckets.available_soon),
                availableForWithdrawal,
                transferred: transferredAmount,
                requested: requestedAmount,
                refunded: sum(buckets.refunded)
            },
            platformHoldingDays: 6
        });
    } catch (error) {
        console.error('[FINANCIAL] Error en wallet:', error);
        return res.status(500).json({ error: 'Error consultando wallet', detail: error.message?.slice(0, 200) });
    }
};

// v4.418 — Diagnóstico de configuración de email. Sin exponer secretos:
// solo reporta presencia/ausencia de keys, lista de dominios verificados en
// Resend (si la API lo permite), y conteo de SMTP fallbacks disponibles.
// GET /api/financial/email-status  (auth, super admin)
export const getEmailDiagnostics = async (req, res) => {
    if (req.user?.role !== 'administrator') {
        return res.status(403).json({ error: 'Solo super administradores' });
    }

    const hasResendKey = !!process.env.RESEND_API_KEY;
    const result = {
        resend: { configured: hasResendKey, domains: null, error: null },
        smtpFallback: { available: false, count: 0 },
        sender: '"Club Platform for Rotary" <noreply@clubplatform.org>',
        platformConfig: { emailFrom: null, emailProvider: null }
    };

    // Verifica si Resend acepta la API key y lista dominios
    if (hasResendKey) {
        try {
            const resp = await fetch('https://api.resend.com/domains', {
                headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
            });
            const data = await resp.json();
            if (!resp.ok) {
                result.resend.error = data.message || `HTTP ${resp.status}`;
            } else {
                result.resend.domains = (data.data || []).map(d => ({
                    name: d.name,
                    status: d.status,
                    region: d.region
                }));
            }
        } catch (e) {
            result.resend.error = e.message?.slice(0, 200);
        }
    }

    // Cuenta SMTP fallbacks (super admin SMTP)
    try {
        const smtpCount = await prisma.notificationConfig.count({
            where: { type: 'smtp', enabled: true }
        });
        result.smtpFallback.available = smtpCount > 0;
        result.smtpFallback.count = smtpCount;
    } catch { /* ignore */ }

    // PlatformConfig overrides
    try {
        const configs = await prisma.platformConfig.findMany({
            where: { key: { in: ['email_from', 'email_provider'] } }
        });
        configs.forEach(c => {
            if (c.key === 'email_from') result.platformConfig.emailFrom = c.value;
            if (c.key === 'email_provider') result.platformConfig.emailProvider = c.value;
        });
    } catch { /* ignore */ }

    return res.json(result);
};

// v4.418 — Disparar un email de prueba para verificar que la pipeline funciona.
// POST /api/financial/email-test  (auth, super admin)
// Body: { to: '...' }
export const sendTestEmail = async (req, res) => {
    if (req.user?.role !== 'administrator') {
        return res.status(403).json({ error: 'Solo super administradores' });
    }

    const { to } = req.body || {};
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
        return res.status(400).json({ error: 'Email destinatario inválido' });
    }

    const html = `
<div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #f8fafc;">
    <div style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h2 style="color: #0B223F; margin: 0 0 16px;">✅ Email de prueba — Club Platform</h2>
        <p style="color: #4b5563; line-height: 1.6;">Este es un correo de prueba enviado desde Club Platform a través de Resend / SMTP fallback.</p>
        <p style="color: #6b7280; font-size: 14px;">Si recibiste este email, significa que la pipeline de notificaciones transaccionales está funcionando correctamente.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Disparado a las ${new Date().toISOString()}</p>
    </div>
</div>`;

    try {
        const result = await EmailService.sendPlatformEmail({
            to,
            subject: '✅ Email de prueba — Club Platform',
            html,
            from: '"Club Platform for Rotary" <noreply@clubplatform.org>'
        });
        console.log(`[FINANCIAL] Email test enviado a ${to}:`, result);
        return res.json({
            success: result.success === true,
            messageId: result.messageId || null,
            error: result.error || null,
            to
        });
    } catch (e) {
        console.error('[FINANCIAL] Email test error:', e);
        return res.status(500).json({ success: false, error: e.message?.slice(0, 200), to });
    }
};

// v4.422 — Sync retroactivo de Payments existentes con Stripe.
// Los Payments creados antes de v4.421 no tienen availableOn, stripeStatus
// ni fee real. Este endpoint los recorre, consulta Stripe, y los enriquece.
// POST /api/financial/wallet/sync-stripe  Body: { clubId?, force? }
//   - clubId opcional (super admin puede targetear un club específico)
//   - force=true reprocesa Payments que ya tienen availableOn
export const syncPaymentsWithStripe = async (req, res) => {
    try {
        const targetClubId = req.user?.role === 'administrator' && req.body?.clubId
            ? req.body.clubId
            : req.user?.clubId;
        if (!targetClubId) return res.status(400).json({ error: 'clubId requerido' });

        const force = req.body?.force === true;

        // Listamos Payments candidatos: del club, con providerRef, succeeded.
        // Por defecto sólo los que no tienen availableOn (los nuevos ya vienen sincronizados).
        const candidates = await prisma.payment.findMany({
            where: {
                clubId: targetClubId,
                provider: 'stripe',
                status: 'succeeded',
                providerRef: { not: null },
                ...(force ? {} : { availableOn: null })
            },
            select: {
                id: true, providerRef: true, amount: true, currency: true,
                applicationFee: true, availableOn: true, stripeBalanceTxId: true
            },
            take: 200
        });

        if (candidates.length === 0) {
            return res.json({ synced: 0, failed: 0, skipped: 0, total: 0, details: [] });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
        const results = { synced: 0, failed: 0, skipped: 0, total: candidates.length, details: [] };

        for (const payment of candidates) {
            try {
                let paymentIntentId = payment.providerRef;

                // El providerRef puede ser cs_... (Checkout Session) o pi_... (PaymentIntent)
                if (paymentIntentId.startsWith('cs_')) {
                    const session = await stripe.checkout.sessions.retrieve(paymentIntentId);
                    paymentIntentId = session.payment_intent;
                    if (!paymentIntentId) {
                        results.failed++;
                        results.details.push({ id: payment.id, error: 'Session sin payment_intent' });
                        continue;
                    }
                }

                const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
                    expand: ['latest_charge.balance_transaction', 'latest_charge.payment_method_details']
                });
                const charge = pi.latest_charge;
                const bt = charge?.balance_transaction;

                if (!bt) {
                    results.skipped++;
                    results.details.push({ id: payment.id, skipped: 'Charge sin balance transaction aún' });
                    continue;
                }

                const realFee = (bt.fee || 0) / 100;
                const totalAmount = payment.amount;
                const applicationFee = totalAmount * PLATFORM_FEE_PERCENTAGE;
                const newNetAmount = Math.max(0, totalAmount - applicationFee - realFee);

                const availableOn = bt.available_on ? new Date(bt.available_on * 1000) : null;
                const clubAvailableOn = availableOn
                    ? new Date(availableOn.getTime() + PLATFORM_HOLDING_DAYS * 24 * 60 * 60 * 1000)
                    : null;

                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        stripeBalanceTxId: bt.id,
                        stripeStatus: bt.status || 'pending',
                        availableOn,
                        clubAvailableOn,
                        paymentMethod: charge?.payment_method_details?.type || 'card',
                        applicationFee,
                        netAmount: newNetAmount
                    }
                });

                results.synced++;
                results.details.push({
                    id: payment.id,
                    stripeStatus: bt.status,
                    availableOn: availableOn?.toISOString(),
                    realFee,
                    newNetAmount
                });
            } catch (paymentErr) {
                results.failed++;
                results.details.push({ id: payment.id, error: paymentErr.message?.slice(0, 200) });
                console.error(`[Wallet Sync] Payment ${payment.id} failed:`, paymentErr.message);
            }
        }

        return res.json(results);
    } catch (error) {
        console.error('[FINANCIAL] Error syncing payments with Stripe:', error);
        return res.status(500).json({ error: 'Error sincronizando con Stripe', detail: error.message?.slice(0, 200) });
    }
};
