import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import db from '../lib/db.js';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { s3 } from '../lib/storage.js';
import { ingestMemorySafe } from '../services/brainService.js';

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

/**
 * v4.605 — Normaliza el slug público de un evento: minúsculas, sin tildes y
 * con guiones en lugar de espacios o signos. Devuelve null si queda vacío, que
 * es como se representa "sin slug" (el evento se abre por su id).
 */
const normalizeSlug = (value) => {
    const slug = String(value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita tildes
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
    return slug || null;
};

/** El slug ya está tomado por otro evento del mismo sitio (índice único). */
const isDuplicateSlug = (error) => error?.code === '23505';
const DUPLICATE_SLUG_MESSAGE = 'Ya hay otro evento de este sitio con esa dirección. Elige otra.';

router.post('/events', authMiddleware, async (req, res) => {
    try {
        const { title, description, htmlContent, startDate, endDate, location, type, image, images, metadata, slug } = req.body;
        const result = await db.query(
            `INSERT INTO "CalendarEvent" (id, title, description, "htmlContent", "startDate", "endDate", location, type, image, images, "clubId", "createdAt", metadata, slug)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12) RETURNING *`,
            [title, description, htmlContent || null, new Date(startDate), endDate ? new Date(endDate) : null, location, type, image || null, images || [], req.user.clubId, metadata || {}, normalizeSlug(slug)]
        );
        const event = result.rows[0];
        if (event?.clubId) {
            ingestMemorySafe({
                clubId: event.clubId,
                kind: 'EVENT',
                sourceType: 'CalendarEvent',
                sourceId: event.id,
                title: event.title,
                content: [event.description, (event.htmlContent || '').replace(/<[^>]+>/g, ' ')].filter(Boolean).join('\n\n'),
                metadata: { type: event.type, startDate: event.startDate, endDate: event.endDate, location: event.location },
            });
        }
        res.json(event);
    } catch (error) {
        if (isDuplicateSlug(error)) return res.status(409).json({ error: DUPLICATE_SLUG_MESSAGE });
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
        const { title, description, htmlContent, startDate, endDate, location, type, image, images, metadata, slug } = req.body;
        // `slug` ausente en el cuerpo = no se toca; presente (aunque vacío) sí.
        const nextSlug = slug === undefined ? event.rows[0].slug : normalizeSlug(slug);
        const result = await db.query(
            `UPDATE "CalendarEvent"
             SET title=$1, description=$2, "htmlContent"=$3, "startDate"=$4, "endDate"=$5,
                 location=$6, type=$7, image=$8, images=$9, metadata=$10, slug=$12
             WHERE id=$11 RETURNING *`,
            [title, description, htmlContent || null, new Date(startDate), endDate ? new Date(endDate) : null, location, type, image || null, images || [], metadata || {}, id, nextSlug]
        );
        const updated = result.rows[0];
        if (updated?.clubId) {
            ingestMemorySafe({
                clubId: updated.clubId,
                kind: 'EVENT',
                sourceType: 'CalendarEvent',
                sourceId: updated.id,
                title: updated.title,
                content: [updated.description, (updated.htmlContent || '').replace(/<[^>]+>/g, ' ')].filter(Boolean).join('\n\n'),
                metadata: { type: updated.type, startDate: updated.startDate, endDate: updated.endDate, location: updated.location },
            });
        }
        res.json(updated);
    } catch (error) {
        if (isDuplicateSlug(error)) return res.status(409).json({ error: DUPLICATE_SLUG_MESSAGE });
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


