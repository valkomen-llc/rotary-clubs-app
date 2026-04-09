import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, upload, uploadMemory } from '../lib/storage.js';
import sharp from 'sharp';

const router = express.Router();

const getMediaType = (mimetype) => {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    return 'document';
};

router.post('/upload', authMiddleware, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
            const targetClubId = (req.user.role === 'administrator') ? (req.query.clubId || req.body.clubId || req.user.clubId) : req.user.clubId;

            const result = await db.query(
                `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "createdAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
                [req.file.originalname, req.file.location, getMediaType(req.file.mimetype), req.file.size, req.file.bucket, process.env.AWS_REGION || 'us-east-1', targetClubId, req.file.key]
            );
            res.json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ error: 'Error al guardar en la base de datos' });
        }
    });
});

// ── Auto-Crop Logo Upload ──────────────────────────────────────
// Receives image in memory, trims whitespace/transparent margins
// using sharp, then uploads the clean result to S3.
router.post('/upload-logo', authMiddleware, (req, res) => {
    uploadMemory.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
            const targetClubId = (req.user.role === 'administrator')
                ? (req.query.clubId || req.body.clubId || req.user.clubId)
                : req.user.clubId;
            const folder = req.query.folder || req.body.folder || 'logos';

            // Auto-trim whitespace/transparent margins
            // threshold:30 catches near-white pixels (Rotary logos have white bg)
            let trimmedBuffer;
            let finalContentType = 'image/png';
            try {
                trimmedBuffer = await sharp(req.file.buffer)
                    .trim({ threshold: 30 })
                    .png()
                    .toBuffer();
                console.log('✅ Logo auto-cropped successfully');
            } catch (trimError) {
                // Fallback: if trim fails for any reason, upload original image
                console.warn('⚠️ Auto-trim failed, uploading original image:', trimError.message);
                trimmedBuffer = req.file.buffer;
                finalContentType = req.file.mimetype; // Use original if we did not encode as PNG
            }

            // Build S3 key the same way as regular uploads
            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            const s3Key = `clubs/${targetClubId}/${folder}/${fileName}`;
            const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

            // Upload trimmed image to S3
            await s3.send(new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: trimmedBuffer,
                ContentType: finalContentType,
            }));

            const encodedKey = s3Key.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;

            // Save record to Media table
            const result = await db.query(
                `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "createdAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
                [req.file.originalname, fileUrl, 'image', trimmedBuffer.length, bucket, process.env.AWS_REGION || 'us-east-1', targetClubId, s3Key]
            );

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Auto-crop logo upload error:', error);
            res.status(500).json({ error: 'Error al procesar y subir el logo' });
        }
    });
});

router.get('/folders', authMiddleware, async (req, res) => {
    if (req.user.role !== 'administrator') return res.status(403).json({ error: 'No autorizado' });
    try {
        const result = await db.query(
            `SELECT c.id, c.name, COUNT(m.id) as count FROM "Club" c LEFT JOIN "Media" m ON m."clubId" = c.id GROUP BY c.id, c.name`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching folders' });
    }
});

router.get('/', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const result = clubId
            ? await db.query('SELECT * FROM "Media" WHERE "clubId" = $1 ORDER BY "createdAt" DESC', [clubId])
            : await db.query('SELECT * FROM "Media" ORDER BY "createdAt" DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching media library' });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const media = await db.query('SELECT * FROM "Media" WHERE id = $1', [id]);
        if (!media.rows[0]) return res.status(404).json({ error: 'Archivo no encontrado' });
        if (req.user.role !== 'administrator' && media.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        if (media.rows[0].s3Key && media.rows[0].bucket) {
            try {
                await s3.send(new DeleteObjectCommand({ Bucket: media.rows[0].bucket, Key: media.rows[0].s3Key }));
            } catch (s3Err) {
                console.error('S3 delete error:', s3Err);
            }
        }
        await db.query('DELETE FROM "Media" WHERE id = $1', [id]);
        res.json({ message: 'Archivo eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el archivo' });
    }
});

export default router;
