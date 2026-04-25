import express from 'express';
import { Route53DomainsClient, CheckDomainAvailabilityCommand } from '@aws-sdk/client-route-53-domains';
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

export default router;
