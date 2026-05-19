// v4.409 — Motor de donaciones vía Stripe Checkout (Maneras de Contribuir)
// Centraliza el flujo público de aportes: el visitante elige monto + datos,
// el backend crea una Checkout Session de Stripe (cuenta master Valkomen),
// el webhook (paymentController.handleSuccessfulCheckoutSession) registra
// Payment + Donation. El balance del club queda disponible automáticamente
// vía /api/payouts/balance porque Payment.isPlatformCollection = true.
import Stripe from 'stripe';
import prisma from '../lib/prisma.js';

console.log('[FINANCIAL v4.409] Controller cargado — donaciones Stripe Checkout (master Valkomen + balance virtual por club)');

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
// Body: { clubId, amount, currency?, frequency?, donorEmail, donorName?, message?, isAnonymous?, returnUrl? }
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

        const stripe = getStripe();
        const amountInCents = Math.round(numericAmount * 100);
        const origin = resolveOrigin(req, returnUrl);
        const normalizedCurrency = String(currency).toLowerCase();

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: donorEmail,
            line_items: [{
                price_data: {
                    currency: normalizedCurrency,
                    product_data: {
                        name: `Donación a ${club.name}`,
                        description: message
                            ? `Mensaje del donante: ${String(message).slice(0, 180)}`
                            : 'Aporte voluntario'
                    },
                    unit_amount: amountInCents
                },
                quantity: 1
            }],
            success_url: `${origin}/donacion/exito?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/donacion/cancelada`,
            metadata: {
                type: 'donation',
                donationType: 'one-time',
                clubId,
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
export const listClubDonations = async (req, res) => {
    try {
        const clubId = req.user?.role === 'administrator' && req.query.clubId
            ? req.query.clubId
            : req.user?.clubId;

        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const donations = await prisma.donation.findMany({
            where: { clubId, status: 'success' },
            orderBy: { date: 'desc' },
            take: 200
        });

        const totalAmount = donations.reduce((acc, d) => acc + (d.amount || 0), 0);

        return res.json({
            donations,
            totalAmount,
            totalCount: donations.length,
            currency: donations[0]?.currency || 'USD'
        });
    } catch (error) {
        console.error('[FINANCIAL] Error listing donations:', error);
        return res.status(500).json({ error: 'Error listando donaciones' });
    }
};
