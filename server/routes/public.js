import express from 'express';
import { autoRegisterClub } from '../controllers/saasController.js';

const router = express.Router();

// This endpoint is used by the generic SaaS landing page (RegisterClub.tsx wizard)
router.post('/register-club', autoRegisterClub);

// TEMPORARY: Diagnostic endpoint to test Resend API directly
router.post('/test-email-debug', async (req, res) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'to is required' });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.json({ error: 'RESEND_API_KEY not set', keyExists: false });

    try {
        const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'ClubPlatform <onboarding@resend.dev>',
                to: [to],
                subject: 'Test Email - ClubPlatform',
                html: '<h2>Email de prueba</h2><p>Si ves esto, Resend funciona correctamente.</p>',
            }),
        });

        const data = await resp.json();
        res.json({
            statusCode: resp.status,
            resendResponse: data,
            keyPrefix: apiKey.substring(0, 8) + '...',
            from: 'onboarding@resend.dev',
            to,
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

export default router;
