import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import db from '../lib/db.js';

const router = express.Router();

// Get all publications and events for the club
router.get('/', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId && req.user.role !== 'administrator') {
            return res.status(400).json({ error: 'Club ID is required' });
        }

        const whereClause = clubId ? `WHERE "clubId" = $1` : '';
        const params = clubId ? [clubId] : [];

        const [publications, events] = await Promise.all([
            db.query(`SELECT * FROM "Publication" ${whereClause} ORDER BY "publishDate" ASC`, params),
            db.query(`SELECT * FROM "CalendarEvent" ${whereClause} ORDER BY "startDate" ASC`, params)
        ]);

        res.json({ publications: publications.rows, events: events.rows });
    } catch (error) {
        console.error('Calendar Fetch Error:', error);
        res.status(500).json({ error: 'Error al cargar el calendario' });
    }
});

router.post('/publications', authMiddleware, async (req, res) => {
    try {
        const { title, content, platform, publishDate, mediaUrl, aiGenerated } = req.body;
        const result = await db.query(
            `INSERT INTO "Publication" (id, title, content, platform, status, "publishDate", "mediaUrl", "aiGenerated", "clubId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, 'draft', $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
            [title, content, platform, new Date(publishDate), mediaUrl, aiGenerated || false, req.user.clubId]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear la publicación' });
    }
});

router.post('/events', authMiddleware, async (req, res) => {
    try {
        const { title, description, startDate, endDate, location, type } = req.body;
        const result = await db.query(
            `INSERT INTO "CalendarEvent" (id, title, description, "startDate", "endDate", location, type, "clubId", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
            [title, description, new Date(startDate), endDate ? new Date(endDate) : null, location, type, req.user.clubId]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el evento' });
    }
});

router.put('/events/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const event = await db.query('SELECT * FROM "CalendarEvent" WHERE id = $1', [id]);
        if (!event.rows[0]) return res.status(404).json({ error: 'Evento no encontrado' });
        if (req.user.role !== 'administrator' && event.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        const { title, description, startDate, endDate, location, type } = req.body;
        const result = await db.query(
            `UPDATE "CalendarEvent" SET title=$1, description=$2, "startDate"=$3, "endDate"=$4, location=$5, type=$6
             WHERE id=$7 RETURNING *`,
            [title, description, new Date(startDate), endDate ? new Date(endDate) : null, location, type, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el evento' });
    }
});

router.delete('/events/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const event = await db.query('SELECT * FROM "CalendarEvent" WHERE id = $1', [id]);
        if (!event.rows[0]) return res.status(404).json({ error: 'Evento no encontrado' });
        if (req.user.role !== 'administrator' && event.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await db.query('DELETE FROM "CalendarEvent" WHERE id = $1', [id]);
        res.json({ message: 'Evento eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el evento' });
    }
});

router.delete('/publications/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const pub = await db.query('SELECT * FROM "Publication" WHERE id = $1', [id]);
        if (!pub.rows[0]) return res.status(404).json({ error: 'No encontrada' });
        if (req.user.role !== 'administrator' && pub.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await db.query('DELETE FROM "Publication" WHERE id = $1', [id]);
        res.json({ message: 'Eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

export default router;
