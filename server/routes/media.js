import express from 'express';
import multer from 'multer';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Local lightweight multer (memory-only, no S3 dependency) ──
const localUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ── Lazy loaders for heavy native modules (prevents cold-start timeout) ──
let _s3Client = null;
let _awsCmds = null;

const getS3Client = async () => {
    if (!_s3Client) {
        const storageMod = await import('../lib/storage.js');
        _s3Client = storageMod.s3;
    }
    return _s3Client;
};

const getAwsCommands = async () => {
    if (!_awsCmds) {
        const mod = await import('@aws-sdk/client-s3');
        // Handle CJS/ESM interop: commands could be on mod directly or on mod.default
        _awsCmds = {
            PutObjectCommand: mod.PutObjectCommand || mod.default?.PutObjectCommand,
            DeleteObjectCommand: mod.DeleteObjectCommand || mod.default?.DeleteObjectCommand
        };
    }
    return _awsCmds;
};

let _sharp = null;
const getSharp = async () => {
    if (!_sharp) {
        const mod = await import('sharp');
        _sharp = mod.default || mod;
    }
    return _sharp;
};

const getMediaType = (mimetype) => {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    return 'document';
};

router.post('/upload', authMiddleware, (req, res) => {
    localUpload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
            const s3 = await getS3Client();
            const { PutObjectCommand } = await getAwsCommands();
            const targetClubIdRaw = (req.user.role === 'administrator') ? (req.query.clubId || req.body.clubId || req.user.clubId) : req.user.clubId;
            
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const targetClubId = (targetClubIdRaw && uuidRegex.test(targetClubIdRaw)) ? targetClubIdRaw : null;

            const fileTypeLocal = getMediaType(req.file.mimetype);
            const folderStr = fileTypeLocal === 'image' ? 'images' : fileTypeLocal === 'video' ? 'videos' : 'documents';
            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            const s3Key = `clubs/${targetClubId || 'global'}/${folderStr}/${fileName}`;
            const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

            try {
                await s3.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: s3Key,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                }));
            } catch (s3Error) {
                console.error('S3 Upload Error:', s3Error);
                return res.status(500).json({ error: 'Error al subir archivo a S3', details: s3Error.message });
            }

            const encodedKey = s3Key.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;

            try {
                const result = await db.query(
                    `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "createdAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
                    [req.file.originalname, fileUrl, fileTypeLocal, req.file.buffer.length, bucket, process.env.AWS_REGION || 'us-east-1', targetClubId, s3Key]
                );
                res.json(result.rows[0]);
            } catch (dbError) {
                console.error('Database Media Error:', dbError);
                res.status(500).json({ error: 'Error al registrar en base de datos', details: dbError.message });
            }
        } catch (error) {
            console.error('General Media upload error:', error);
            res.status(500).json({ error: 'Error interno en el servidor de medios' });
        }
    });
});

// ── Auto-Crop Logo Upload ──────────────────────────────────────
// Receives image in memory, trims whitespace/transparent margins
// using sharp, then uploads the clean result to S3.
router.post('/upload-logo', authMiddleware, (req, res) => {
    localUpload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
            const s3 = await getS3Client();
            const { PutObjectCommand } = await getAwsCommands();
            const sharp = await getSharp();
            const targetClubId = (req.user.role === 'administrator')
                ? (req.query.clubId || req.body.clubId || req.user.clubId)
                : req.user.clubId;
            const folder = req.query.folder || req.body.folder || 'logos';

            let trimmedBuffer;
            let finalContentType = 'image/png';
            try {
                trimmedBuffer = await sharp(req.file.buffer)
                    .trim(30) 
                    .png()
                    .toBuffer();
                console.log('✅ Logo auto-trimmed successfully via Sharp');
            } catch (trimError) {
                console.warn('⚠️ Auto-trim failed, uploading original image:', trimError.message);
                trimmedBuffer = req.file.buffer;
                finalContentType = req.file.mimetype;
            }

            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            const s3Key = `clubs/${targetClubId}/${folder}/${fileName}`;
            const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

            await s3.send(new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: trimmedBuffer,
                ContentType: finalContentType,
            }));

            const encodedKey = s3Key.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;

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
        const { role, clubId: userClubId, districtId } = req.user;
        const requestedClubId = req.query.clubId;
        
        let query = 'SELECT * FROM "Media"';
        let params = [];

        if (role === 'administrator') {
            if (requestedClubId) {
                query += ' WHERE "clubId" = $1';
                params.push(requestedClubId);
            }
        } else if (role === 'district_admin') {
            // District admin sees media from their club OR any club in their district
            // Also include media where clubId is NULL if they are at the district level
            const dId = districtId || userClubId;
            query += ` WHERE ("clubId" = $1 OR "clubId" IN (SELECT id FROM "Club" WHERE "districtId" = $2) OR "clubId" IS NULL)`;
            params.push(userClubId, dId);
        } else if (userClubId) {
            // Regular club admin only sees their own club's media
            query += ' WHERE "clubId" = $1';
            params.push(userClubId);
        } else {
            // Fallback for users without clubId
            query += ' WHERE "clubId" IS NULL';
        }

        query += ' ORDER BY "createdAt" DESC';
        
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Fetch media error:', error);
        res.status(500).json({ error: 'Error fetching media library' });
    }
});

router.get('/debug-me', authMiddleware, async (req, res) => {
    try {
        const { role, clubId, districtId, email } = req.user;
        const mediaCount = await db.query('SELECT COUNT(*) FROM \"Media\" WHERE \"clubId\" = $1', [clubId]);
        const club = await db.query('SELECT name, domain FROM \"Club\" WHERE id = $1', [clubId]);
        
        res.json({
            user: { role, clubId, districtId, email },
            club: club.rows[0],
            mediaInDb: mediaCount.rows[0].count,
            paramsUsed: [clubId]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
                const s3 = await getS3Client();
                const { DeleteObjectCommand } = await getAwsCommands();
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

// GET /api/media/proxy — proxy same-origin para canvas (evita CORS)
router.get('/proxy', authMiddleware, async (req, res) => {
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


export default router;
