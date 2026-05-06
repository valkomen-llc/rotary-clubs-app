import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET all requests for a club
router.get('/', authenticateToken, async (req, res) => {
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
});

// POST a new technical request
router.post('/', authenticateToken, async (req, res) => {
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
});

// PATCH a request (status/payment)
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, paymentStatus } = req.body;
        
        const request = await prisma.technicalRequest.update({
            where: { id },
            data: { status, paymentStatus }
        });
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
