import express from 'express';
import { Route53DomainsClient, CheckDomainAvailabilityCommand } from '@aws-sdk/client-route-53-domains';
import Stripe from 'stripe';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import DomainProvisioningService from '../services/DomainProvisioningService.js';

const router = express.Router();

// v4.438.1 — Gestión de dominios .org desde la plataforma: comprar / conectar / transferir (Route53 + Vercel) + cobro independiente vía Stripe.
console.log('[Domains] Router cargado — v4.438.1 (registrar/conectar/transferir .org + cobro Stripe)');

// Creamos el cliente de Route 53 Domains
// NOTA: La API de Route 53 Domains solo opera en la región us-east-1 independientemente de dónde estén tus otros recursos.
const route53DomainsClient = new Route53DomainsClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    }
});

// Roles que pueden gestionar dominios (operaciones con costo real).
const DOMAIN_ROLES = ['administrator', 'club_admin', 'district_admin'];

// Resuelve el clubId objetivo: un administrador puede pasar uno explícito en el
// body; cualquier otro rol queda atado al club de su propio token.
const resolveClubId = (req) => {
    if (req.user?.role === 'administrator' && req.body?.clubId) return req.body.clubId;
    return req.user?.clubId;
};

// GET /api/domains/check?domain=ejemplo.org
router.get('/check', authMiddleware, async (req, res) => {
    try {
        const { domain } = req.query;
        if (!domain) {
            return res.status(400).json({ error: 'Debes proporcionar un dominio válido' });
        }

        // Limpiar el dominio (quitar https:// y www.)
        const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();

        // Política del equipo: solo .org
        if (!cleanDomain.endsWith('.org')) {
            return res.status(400).json({ error: 'Solo se permiten dominios .org', domain: cleanDomain });
        }

        const command = new CheckDomainAvailabilityCommand({
            DomainName: cleanDomain
        });

        const response = await route53DomainsClient.send(command);

        // AWS devuelve varios estados, los "AVAILABLE" significan que se puede comprar a precio regular
        const isAvailable = response.Availability === 'AVAILABLE';

        // Adjuntamos el precio del .org para que el panel pueda mostrarlo (manual independiente).
        const price = await DomainProvisioningService.getPrice();

        res.json({
            domain: cleanDomain,
            isAvailable,
            status: response.Availability,
            price
        });
    } catch (error) {
        console.error('[Domains] Error checking domain:', error);
        res.status(500).json({ error: 'Error verificando la disponibilidad del dominio', details: error.message });
    }
});

// GET /api/domains/price → precio del TLD .org (registro/renovación/transferencia)
router.get('/price', authMiddleware, async (_req, res) => {
    const price = await DomainProvisioningService.getPrice();
    if (!price) return res.status(502).json({ error: 'No se pudo obtener el precio del .org' });
    res.json(price);
});

// POST /api/domains/register → compra real del dominio en Route53 (.org)
router.post('/register', authMiddleware, roleMiddleware(DOMAIN_ROLES), async (req, res) => {
    try {
        const { domain } = req.body;
        const clubId = resolveClubId(req);
        if (!domain) return res.status(400).json({ error: 'Falta el dominio' });
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club destino' });

        const result = await DomainProvisioningService.registerDomain(clubId, domain);
        res.json(result);
    } catch (error) {
        console.error('[Domains] Error registrando dominio:', error);
        const status = error.code === 'TLD_NOT_ALLOWED' ? 400 : 500;
        res.status(status).json({ error: error.message, code: error.code });
    }
});

// POST /api/domains/transfer → transferencia desde otro registrador (requiere AuthCode/EPP)
router.post('/transfer', authMiddleware, roleMiddleware(DOMAIN_ROLES), async (req, res) => {
    try {
        const { domain, authCode } = req.body;
        const clubId = resolveClubId(req);
        if (!domain) return res.status(400).json({ error: 'Falta el dominio' });
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club destino' });

        const result = await DomainProvisioningService.transferDomain(clubId, domain, authCode);
        res.json(result);
    } catch (error) {
        console.error('[Domains] Error transfiriendo dominio:', error);
        const status = ['TLD_NOT_ALLOWED', 'MISSING_AUTH_CODE'].includes(error.code) ? 400 : 500;
        res.status(status).json({ error: error.message, code: error.code });
    }
});

// POST /api/domains/connect → conectar un dominio que el club ya posee en otro proveedor
router.post('/connect', authMiddleware, roleMiddleware(DOMAIN_ROLES), async (req, res) => {
    try {
        const { domain } = req.body;
        const clubId = resolveClubId(req);
        if (!domain) return res.status(400).json({ error: 'Falta el dominio' });
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club destino' });

        const result = await DomainProvisioningService.connectDomain(clubId, domain);
        res.json(result);
    } catch (error) {
        console.error('[Domains] Error conectando dominio:', error);
        const status = error.code === 'TLD_NOT_ALLOWED' ? 400 : 500;
        res.status(status).json({ error: error.message, code: error.code });
    }
});

// GET /api/domains/operation/:id?domain=ejemplo.org → estado de registro/transferencia
router.get('/operation/:id', authMiddleware, roleMiddleware(DOMAIN_ROLES), async (req, res) => {
    try {
        const result = await DomainProvisioningService.getOperationStatus(req.params.id, req.query.domain);
        res.json(result);
    } catch (error) {
        console.error('[Domains] Error consultando operación:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/domains/checkout-domain
// Cobro INDEPENDIENTE del dominio (flujo manual): genera una sesión de Stripe
// Checkout por el precio real del .org (vía ListPrices), aparte del plan anual.
// Útil cuando el club quiere pagar el dominio por su cuenta desde la plataforma.
router.post('/checkout-domain', authMiddleware, roleMiddleware(DOMAIN_ROLES), async (req, res) => {
    try {
        const { domain } = req.body;
        const clubId = resolveClubId(req);
        if (!domain) return res.status(400).json({ error: 'Falta el dominio' });

        const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
        if (!cleanDomain.endsWith('.org')) {
            return res.status(400).json({ error: 'Solo se permiten dominios .org', domain: cleanDomain });
        }

        // Precio real del .org. Si AWS no responde, usamos un fallback razonable.
        const price = await DomainProvisioningService.getPrice();
        const registration = price?.registration;
        if (registration == null) {
            return res.status(502).json({ error: 'No se pudo obtener el precio del dominio en este momento' });
        }
        const currency = (price?.currency || 'USD').toLowerCase();

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
        const origin = req.headers.origin || 'https://app.clubplatform.org';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency,
                        product_data: {
                            name: `Registro de dominio: ${cleanDomain}`,
                            description: 'Registro anual del dominio .org (independiente del plan del ecosistema).',
                        },
                        unit_amount: Math.round(registration * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${origin}/admin/clubs?domain_paid=true&domain=${cleanDomain}`,
            cancel_url: `${origin}/admin/clubs?domain_paid=false`,
            metadata: {
                type: 'domain_purchase',
                clubId: clubId || '',
                domainName: cleanDomain
            }
        });

        res.json({ url: session.url, amount: registration, currency: price?.currency || 'USD' });
    } catch (error) {
        console.error('[Domains] Error creando checkout de dominio:', error);
        res.status(500).json({ error: 'Error al generar la sesión de pago del dominio', details: error.message });
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
