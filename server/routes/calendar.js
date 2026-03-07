const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Get all publications and events for the club
router.get('/', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId && req.user.role !== 'administrator') {
            return res.status(400).json({ error: 'Club ID is required' });
        }

        const [publications, events] = await Promise.all([
            prisma.publication.findMany({
                where: clubId ? { clubId } : {},
                orderBy: { publishDate: 'asc' }
            }),
            prisma.calendarEvent.findMany({
                where: clubId ? { clubId } : {},
                orderBy: { startDate: 'asc' }
            })
        ]);

        res.json({ publications, events });
    } catch (error) {
        console.error('Calendar Fetch Error:', error);
        res.status(500).json({ error: 'Error al cargar el calendario' });
    }
});

// Create a new publication
router.post('/publications', authMiddleware, async (req, res) => {
    try {
        const { title, content, platform, publishDate, mediaUrl, aiGenerated } = req.body;

        const publication = await prisma.publication.create({
            data: {
                title,
                content,
                platform,
                publishDate: new Date(publishDate),
                mediaUrl,
                aiGenerated: aiGenerated || false,
                clubId: req.user.clubId
            }
        });

        res.json(publication);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear la publicación' });
    }
});

// Create a new event
router.post('/events', authMiddleware, async (req, res) => {
    try {
        const { title, description, startDate, endDate, location, type } = req.body;

        const event = await prisma.calendarEvent.create({
            data: {
                title,
                description,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                location,
                type,
                clubId: req.user.clubId
            }
        });

        res.json(event);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el evento' });
    }
});

// Delete publication
router.delete('/publications/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const pub = await prisma.publication.findUnique({ where: { id } });

        if (!pub) return res.status(404).json({ error: 'No encontrada' });
        if (req.user.role !== 'administrator' && pub.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        await prisma.publication.delete({ where: { id } });
        res.json({ message: 'Eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

module.exports = router;
