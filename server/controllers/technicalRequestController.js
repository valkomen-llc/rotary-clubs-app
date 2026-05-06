import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export const createTechnicalRequest = async (req, res) => {
    try {
        const { clubId, type, subject, description, details, amount } = req.body;
        
        const request = await prisma.technicalRequest.create({
            data: {
                clubId,
                type: type || 'domain_transfer',
                subject,
                description,
                details: details || {},
                amount: amount || 29.00,
                status: 'pending',
                paymentStatus: 'unpaid'
            }
        });
        res.status(201).json(request);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createCheckoutSession = async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) return res.status(400).json({ error: 'requestId required' });

        const request = await prisma.technicalRequest.findUnique({
            where: { id: requestId },
            include: { club: true }
        });

        if (!request) {
            console.error(`[Stripe Checkout] Request not found for ID: ${requestId}`);
            return res.status(404).json({ error: 'Request not found' });
        }

        // Construct base URL from club domain or origin
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = request.club?.domain || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        console.log(`[Stripe Checkout] Creating session for request ${requestId}. Base URL: ${baseUrl}`);

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Servicio Técnico: ${request.subject}`,
                            description: `Costo de renovación y liberación de dominio (${request.details.domainName || ''}). Solicitado por ${request.details.requester?.name || 'Admin'}.`,
                            images: ['https://rotary.clubplatform.org/logo-main.png'],
                        },
                        unit_amount: Math.round(request.amount * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${baseUrl}/admin/technical-requests?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/admin/technical-requests?canceled=true`,
            metadata: {
                requestId: request.id,
                clubId: request.clubId,
                type: 'technical_service'
            }
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('[Stripe Checkout Error]:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getClubRequests = async (req, res) => {
    try {
        const { clubId } = req.query;
        if (!clubId) return res.status(400).json({ error: 'clubId required' });

        const requests = await prisma.technicalRequest.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
