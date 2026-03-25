import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * ==========================================
 * ROTEX (ALUMNI EX-INTERCAMBISTAS)
 * ==========================================
 */

/**
 * GET /api/rotex/members
 */
router.get('/members', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const members = await prisma.rotexMember.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(members);
    } catch (error) {
        console.error('Error fetching ROTEX members:', error);
        res.status(500).json({ error: 'Error fetching ROTEX members' });
    }
});

/**
 * POST /api/rotex/members
 */
router.post('/members', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { id, name, email, phone, exchangeYear, exchangeCountry, role, status, image } = req.body;

        const memberData = {
            name,
            email,
            phone,
            exchangeYear,
            exchangeCountry,
            role,
            status,
            image
        };

        let member;
        if (id) {
            member = await prisma.rotexMember.update({
                where: { id },
                data: memberData
            });
        } else {
            member = await prisma.rotexMember.create({
                data: {
                    ...memberData,
                    clubId
                }
            });
        }

        res.json(member);
    } catch (error) {
        console.error('Error saving ROTEX member:', error);
        res.status(500).json({ error: 'Error saving ROTEX member record' });
    }
});

/**
 * DELETE /api/rotex/members/:id
 */
router.delete('/members/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.rotexMember.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting ROTEX member:', error);
        res.status(500).json({ error: 'Error deleting ROTEX member record' });
    }
});

export default router;
