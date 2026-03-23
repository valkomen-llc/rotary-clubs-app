import express from 'express';
import { autoRegisterClub } from '../controllers/saasController.js';

const router = express.Router();

// This endpoint is used by the generic SaaS landing page (RegisterClub.tsx wizard)
router.post('/register-club', autoRegisterClub);

// TEMP: test which domain works with Resend
router.post('/test-email-debug', async (req, res) => {
    const { to } = req.body;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.json({ error: 'NO KEY' });

    const domains = ['noreply@clubplatform.org', 'noreply@valkomen.com'];
    const results = {};

    for (const from of domains) {
        try {
            const r = await fetch('https://api.resend.com/emails', {
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: `ClubPlatform <${from}>`, to: [to || 'dyazo@valkomen.com'], subject: 'Test - ClubPlatform', html: '<h2>Email de prueba</h2><p>Si ves esto, funciona correctamente.</p>' }),
            });
            results[from] = { status: r.status, body: await r.json() };
        } catch (e) { results[from] = { error: e.message }; }
    }
    res.json(results);
});

export default router;
