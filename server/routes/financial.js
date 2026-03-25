import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';

const prisma = new PrismaClient();
const router = express.Router();

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
