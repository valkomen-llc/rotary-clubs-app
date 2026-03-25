import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * ==========================================
 * NGSE PARTICIPANTS (NUEVAS GENERACIONES)
 * ==========================================
 */

/**
 * GET /api/ngse/participants
 */
router.get('/participants', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const participants = await prisma.ngseParticipant.findMany({
            where: { clubId },
            include: { hostFamilies: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(participants);
    } catch (error) {
        console.error('Error fetching NGSE participants:', error);
        res.status(500).json({ error: 'Error fetching NGSE participants' });
    }
});

/**
 * POST /api/ngse/participants
 */
router.post('/participants', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { id, type, name, email, phone, country, sponsorClubName, profession, serviceArea, status, image } = req.body;

        const participantData = {
            type,
            name,
            email,
            phone,
            country,
            sponsorClubName,
            profession,
            serviceArea,
            status,
            image
        };

        let participant;
        if (id) {
            participant = await prisma.ngseParticipant.update({
                where: { id },
                data: participantData
            });
        } else {
            participant = await prisma.ngseParticipant.create({
                data: {
                    ...participantData,
                    clubId
                }
            });
        }

        res.json(participant);
    } catch (error) {
        console.error('Error saving NGSE participant:', error);
        res.status(500).json({ error: 'Error saving NGSE participant record' });
    }
});

/**
 * DELETE /api/ngse/participants/:id
 */
router.delete('/participants/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.ngseParticipant.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting NGSE participant:', error);
        res.status(500).json({ error: 'Error deleting NGSE participant record' });
    }
});

/**
 * ==========================================
 * NGSE HOST FAMILIES
 * ==========================================
 */

/**
 * GET /api/ngse/families
 */
router.get('/families', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const families = await prisma.ngseHostFamily.findMany({
            where: { clubId },
            include: { participant: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(families);
    } catch (error) {
        console.error('Error fetching NGSE host families:', error);
        res.status(500).json({ error: 'Error fetching NGSE host families' });
    }
});

/**
 * POST /api/ngse/families
 */
router.post('/families', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { id, familyName, address, phone, email, participantId, startDate, endDate } = req.body;

        const familyData = {
            familyName,
            address,
            phone,
            email,
            participantId: participantId || null,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null
        };

        let family;
        if (id) {
            family = await prisma.ngseHostFamily.update({
                where: { id },
                data: familyData
            });
        } else {
            family = await prisma.ngseHostFamily.create({
                data: {
                    ...familyData,
                    clubId
                }
            });
        }

        res.json(family);
    } catch (error) {
        console.error('Error saving NGSE host family:', error);
        res.status(500).json({ error: 'Error saving NGSE host family record' });
    }
});

/**
 * DELETE /api/ngse/families/:id
 */
router.delete('/families/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.ngseHostFamily.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting NGSE host family:', error);
        res.status(500).json({ error: 'Error deleting NGSE host family record' });
    }
});

export default router;
