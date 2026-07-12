import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import prisma from '../lib/prisma.js'; // v4.413 — singleton (evita pool exhaustion en Vercel)
import {
    createDonationCheckout,
    createSubscriptionCheckout,
    getDonationSessionStatus,
    listClubDonations,
    getEmailDiagnostics,
    sendTestEmail,
    getClubWallet,
    syncPaymentsWithStripe
} from '../controllers/financialController.js';

const router = express.Router();

/**
 * ==========================================
 * DONACIONES — Stripe Checkout (v4.409)
 * ==========================================
 * Endpoints públicos para Maneras de Contribuir.
 * El webhook (en /api/payments/webhook) registra Payment+Donation
 * cuando Stripe confirma el cobro.
 */

// PÚBLICO — cualquier visitante puede iniciar una donación
router.post('/donate', createDonationCheckout);
router.get('/donate/session/:id', getDonationSessionStatus);

// PÚBLICO — suscripción a membresía recurrente (Fase 2)
router.post('/subscribe', createSubscriptionCheckout);

// AUTENTICADO — listado de donaciones del club (panel admin)
router.get('/donations', authMiddleware, listClubDonations);

// AUTENTICADO — mini-wallet sincronizada con Stripe: buckets por estado
// (en tránsito / disponible próximamente / disponible / transferido)
router.get('/wallet', authMiddleware, getClubWallet);

// v4.422 — Sync retroactivo: enriquece Payments existentes con datos de
// Stripe (fee real, availableOn, status, payment method). Idempotente.
router.post('/wallet/sync-stripe', authMiddleware, syncPaymentsWithStripe);

// v4.418 — DIAGNÓSTICO de email (super admin) para debuggear que el recibo no llega
router.get('/email-status', authMiddleware, getEmailDiagnostics);
router.post('/email-test', authMiddleware, sendTestEmail);

/**
 * ==========================================
 * FINANCIAL & DIAN REPORTS (TRANSPARENCIA)
 * ==========================================
 */

/**
 * GET /api/financial/reports
 */
router.get('/reports', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const reports = await prisma.financialReport.findMany({
            where: { clubId },
            orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
        });
        res.json(reports);
    } catch (error) {
        console.error('Error fetching financial reports:', error);
        res.status(500).json({ error: 'Error fetching financial reports' });
    }
});

/**
 * POST /api/financial/reports
 */
router.post('/reports', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { id, year, title, documentUrl, category, status } = req.body;

        const reportData = {
            year,
            title,
            documentUrl,
            category,
            status
        };

        let report;
        if (id) {
            report = await prisma.financialReport.update({
                where: { id },
                data: reportData
            });
        } else {
            report = await prisma.financialReport.create({
                data: {
                    ...reportData,
                    clubId
                }
            });
        }

        res.json(report);
    } catch (error) {
        console.error('Error saving financial report:', error);
        res.status(500).json({ error: 'Error saving financial report' });
    }
});

/**
 * DELETE /api/financial/reports/:id
 */
router.delete('/reports/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.financialReport.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting financial report:', error);
        res.status(500).json({ error: 'Error deleting financial report' });
    }
});

export default router;
