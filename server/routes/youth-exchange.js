import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * ==========================================
 * YOUTH EXCHANGE STUDENTS
 * ==========================================
 */

/**
 * GET /api/youth-exchange/students
 */
router.get('/students', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const students = await prisma.exchangeStudent.findMany({
            where: { clubId },
            include: { hostFamilies: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(students);
    } catch (error) {
        console.error('Error fetching exchange students:', error);
        res.status(500).json({ error: 'Error fetching exchange students' });
    }
});

/**
 * POST /api/youth-exchange/students
 */
router.post('/students', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { id, type, name, email, phone, country, sponsorClubName, academicYear, status, image, counselorName } = req.body;

        const studentData = {
            type,
            name,
            email,
            phone,
            country,
            sponsorClubName,
            academicYear,
            status,
            image,
            counselorName
        };

        let student;
        if (id) {
            student = await prisma.exchangeStudent.update({
                where: { id },
                data: studentData
            });
        } else {
            student = await prisma.exchangeStudent.create({
                data: {
                    ...studentData,
                    clubId
                }
            });
        }

        res.json(student);
    } catch (error) {
        console.error('Error saving exchange student:', error);
        res.status(500).json({ error: 'Error saving exchange student record' });
    }
});

/**
 * DELETE /api/youth-exchange/students/:id
 */
router.delete('/students/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.exchangeStudent.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting exchange student:', error);
        res.status(500).json({ error: 'Error deleting exchange student record' });
    }
});

/**
 * ==========================================
 * YOUTH EXCHANGE HOST FAMILIES
 * ==========================================
 */

/**
 * GET /api/youth-exchange/families
 */
router.get('/families', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const families = await prisma.exchangeHostFamily.findMany({
            where: { clubId },
            include: { student: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(families);
    } catch (error) {
        console.error('Error fetching host families:', error);
        res.status(500).json({ error: 'Error fetching host families' });
    }
});

/**
 * POST /api/youth-exchange/families
 */
router.post('/families', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { id, familyName, address, phone, email, studentId, startDate, endDate } = req.body;

        const familyData = {
            familyName,
            address,
            phone,
            email,
            studentId: studentId || null,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null
        };

        let family;
        if (id) {
            family = await prisma.exchangeHostFamily.update({
                where: { id },
                data: familyData
            });
        } else {
            family = await prisma.exchangeHostFamily.create({
                data: {
                    ...familyData,
                    clubId
                }
            });
        }

        res.json(family);
    } catch (error) {
        console.error('Error saving host family:', error);
        res.status(500).json({ error: 'Error saving host family record' });
    }
});

/**
 * DELETE /api/youth-exchange/families/:id
 */
router.delete('/families/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.exchangeHostFamily.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting host family:', error);
        res.status(500).json({ error: 'Error deleting host family record' });
    }
});

export default router;
