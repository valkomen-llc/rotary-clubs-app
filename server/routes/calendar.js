import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import db from '../lib/db.js';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { s3 } from '../lib/storage.js';

const router = express.Router();

// ── S3 Upload for event cover image ──────────────────────────────────────────
const uploadEventImage = multer({
    storage: multerS3({
        s3,
        bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req, file, cb) => {
            const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
            cb(null, `events/${Date.now()}-${safe}`);
        },
    }),
    fileFilter: (req, file, cb) => {
        if (/image\/(jpeg|jpg|png|webp|gif)/.test(file.mimetype)) return cb(null, true);
        cb(new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF'));
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// POST /api/calendar/events/upload-image — sube portada o imagen a galería
router.post('/events/upload-image', authMiddleware, (req, res, next) => {
    uploadEventImage.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
    res.json({ url: req.file.location });
});

// GET /api/calendar/events/image-proxy — proxy same-origin para canvas (evita CORS de S3)
router.get('/events/image-proxy', authMiddleware, async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL requerida' });
    try {
        const response = await fetch(url);
        if (!response.ok) return res.status(502).json({ error: 'No se pudo obtener la imagen' });
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=3600');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(buffer);
    } catch (err) {
        console.error('Image proxy error:', err);
        res.status(500).json({ error: 'Error al obtener la imagen' });
    }
});

// ── Publications ──────────────────────────────────────────────────────────────
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

// ── Events ────────────────────────────────────────────────────────────────────
router.post('/events', authMiddleware, async (req, res) => {
    try {
        const { title, description, htmlContent, startDate, endDate, location, type, image, images, metadata } = req.body;
        const result = await db.query(
            `INSERT INTO "CalendarEvent" (id, title, description, "htmlContent", "startDate", "endDate", location, type, image, images, "clubId", "createdAt", metadata)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11) RETURNING *`,
            [title, description, htmlContent || null, new Date(startDate), endDate ? new Date(endDate) : null, location, type, image || null, images || [], req.user.clubId, metadata || {}]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
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
        const { title, description, htmlContent, startDate, endDate, location, type, image, images, metadata } = req.body;
        const result = await db.query(
            `UPDATE "CalendarEvent"
             SET title=$1, description=$2, "htmlContent"=$3, "startDate"=$4, "endDate"=$5,
                 location=$6, type=$7, image=$8, images=$9, metadata=$10
             WHERE id=$11 RETURNING *`,
            [title, description, htmlContent || null, new Date(startDate), endDate ? new Date(endDate) : null, location, type, image || null, images || [], metadata || {}, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
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


