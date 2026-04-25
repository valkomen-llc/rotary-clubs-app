import express from 'express';
import { Route53DomainsClient, CheckDomainAvailabilityCommand } from '@aws-sdk/client-route-53-domains';
import Stripe from 'stripe';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Creamos el cliente de Route 53 Domains
// NOTA: La API de Route 53 Domains solo opera en la región us-east-1 independientemente de dónde estén tus otros recursos.
const route53DomainsClient = new Route53DomainsClient({
    region: 'us-east-1', 
    credentials: {
        accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    }
});

// GET /api/domains/check?domain=ejemplo.org
router.get('/check', authMiddleware, async (req, res) => {
    try {
        const { domain } = req.query;
        if (!domain) {
            return res.status(400).json({ error: 'Debes proporcionar un dominio válido' });
        }

        // Limpiar el dominio (quitar https:// y www.)
        const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();

        const command = new CheckDomainAvailabilityCommand({
            DomainName: cleanDomain
        });

        const response = await route53DomainsClient.send(command);
        
        // AWS devuelve varios estados, los "AVAILABLE" significan que se puede comprar a precio regular
        const isAvailable = response.Availability === 'AVAILABLE';

        res.json({
            domain: cleanDomain,
            isAvailable,
            status: response.Availability
        });
    } catch (error) {
        console.error('[Domains] Error checking domain:', error);
        res.status(500).json({ error: 'Error verificando la disponibilidad del dominio', details: error.message });
    }
});

// POST /api/domains/checkout
// Genera una sesión de Stripe Checkout para adquirir el "Ecosistema Digital"
router.post('/checkout', authMiddleware, async (req, res) => {
    try {
        const { domain } = req.body;
        const clubId = req.user.clubId;
        
        if (!domain) {
            return res.status(400).json({ error: 'Falta el dominio' });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');

        // Configuración de la sesión de Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Ecosistema Digital Rotary (Anual)',
                            description: `Plataforma Web + Correos Corporativos + Dominio: ${domain}`,
                            images: ['https://rotarylatir.org/assets/rotary_logo.png'],
                        },
                        unit_amount: 15000, // $150.00 USD
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment', // Podría ser 'subscription' en un futuro
            success_url: `${req.headers.origin || 'https://app.clubplatform.org'}/admin/mi-club?success=true&domain=${domain}`,
            cancel_url: `${req.headers.origin || 'https://app.clubplatform.org'}/admin/mi-club?canceled=true`,
            metadata: {
                type: 'ecosystem_purchase',
                clubId: clubId,
                domainName: domain
            }
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('[Domains] Error creating checkout session:', error);
        res.status(500).json({ error: 'Error al generar la sesión de pago', details: error.message });
    }
});

export default router;
