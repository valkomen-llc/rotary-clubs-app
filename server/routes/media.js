import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Single lazy loader for ALL upload dependencies ──
// Creates a minimal S3 client directly — avoids loading storage.js
// which drags in multer-s3, s3-request-presigner, etc.
let _uploadDeps = null;
const getUploadDeps = async () => {
    if (!_uploadDeps) {
        const [multerMod, awsMod, presignerMod] = await Promise.all([
            import('multer'),
            import('@aws-sdk/client-s3'),
            import('@aws-sdk/s3-request-presigner')
        ]);
        
        const multer = multerMod.default || multerMod;
        const aws = awsMod.default || awsMod;
        
        // Create minimal S3 client (no storage.js needed)
        const s3 = new aws.S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
            },
            maxAttempts: 2,
        });

        _uploadDeps = {
            upload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }),
            s3,
            PutObjectCommand: aws.PutObjectCommand,
            DeleteObjectCommand: aws.DeleteObjectCommand,
            getSignedUrl: presignerMod.getSignedUrl
        };
    }
    return _uploadDeps;
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

// ── Proxy Endpoint to Bypass CORS for Canvas Operations ──
router.get('/proxy', authMiddleware, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL is required' });
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch image');
        
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type');
        
        if (contentType) res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Proxy failed' });
    }
});

// ── Diagnostic: test if upload deps can load ──
router.get('/test-deps', async (req, res) => {
    const steps = {};
    try {
        // Step 1: load multer
        const t1 = Date.now();
        const multerMod = await import('multer');
        steps.multer = { ok: true, ms: Date.now() - t1, type: typeof (multerMod.default || multerMod) };
        
        // Step 2: load AWS SDK
        const t2 = Date.now();
        const awsMod = await import('@aws-sdk/client-s3');
        const aws = awsMod.default || awsMod;
        steps.aws = { ok: true, ms: Date.now() - t2, hasS3Client: !!aws.S3Client, hasPut: !!aws.PutObjectCommand };
        
        // Step 3: create S3 client
        const t3 = Date.now();
        const s3 = new aws.S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || 'MISSING',
                secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || 'MISSING',
            },
            maxAttempts: 2,
        });
        steps.s3Client = { ok: true, ms: Date.now() - t3 };
        
        // Step 4: test small S3 put (1 byte)
        const t4 = Date.now();
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        await s3.send(new aws.PutObjectCommand({
            Bucket: bucket,
            Key: `_test/ping-${Date.now()}.txt`,
            Body: Buffer.from('ok'),
            ContentType: 'text/plain',
        }));
        steps.s3Upload = { ok: true, ms: Date.now() - t4, bucket };
        
        // Step 5: check env vars
        steps.env = {
            AWS_REGION: process.env.AWS_REGION || 'NOT SET',
            AWS_BUCKET: process.env.AWS_BUCKET_NAME || 'NOT SET',
            HAS_ACCESS_KEY: !!(process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID),
            HAS_SECRET_KEY: !!(process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY),
        };
        
        res.json({ success: true, steps });
    } catch (error) {
        steps.error = { message: error.message, name: error.name, code: error.code || error.$metadata?.httpStatusCode };
        res.status(500).json({ success: false, steps });
    }
});

// ── GET /api/media/presigned-url — Generate direct upload URL ──
router.get('/presigned-url', authMiddleware, async (req, res) => {
    try {
        const { fileName, fileType, clubId } = req.query;
        if (!fileName || !fileType) return res.status(400).json({ error: 'Faltan parámetros' });

        const targetClubIdRaw = (req.user.role === 'administrator') ? (clubId || req.user.clubId) : req.user.clubId;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const targetClubId = (targetClubIdRaw && uuidRegex.test(targetClubIdRaw)) ? targetClubIdRaw : null;

        const fileTypeLocal = getMediaType(fileType);
        const folderStr = fileTypeLocal === 'image' ? 'images' : fileTypeLocal === 'video' ? 'videos' : 'documents';
        
        const key = `clubs/${targetClubId || 'global'}/${folderStr}/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

        const { s3, PutObjectCommand, getSignedUrl } = await getUploadDeps();
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: fileType
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;

        res.json({ uploadUrl, fileUrl, key, fileTypeLocal });
    } catch (error) {
        console.error('[Media] Presigned URL error:', error);
        res.status(500).json({ error: 'Error al generar URL de subida' });
    }
});

// ── POST /api/media/save — Save media record after direct S3 upload ──
router.post('/save', authMiddleware, async (req, res) => {
    try {
        const { clubId, fileName, fileUrl, s3Key, fileType, fileSize } = req.body;
        
        const targetClubIdRaw = (req.user.role === 'administrator') ? (clubId || req.user.clubId) : req.user.clubId;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const targetClubId = (targetClubIdRaw && uuidRegex.test(targetClubIdRaw)) ? targetClubIdRaw : null;
        
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        const fileTypeLocal = getMediaType(fileType);

        const result = await db.query(
            `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
            [fileName, fileUrl, fileTypeLocal, fileSize, bucket, process.env.AWS_REGION || 'us-east-1', targetClubId, s3Key]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[Media] Save error:', error);
        res.status(500).json({ error: 'Error al registrar en base de datos', details: error.message });
    }
});

router.post('/upload', authMiddleware, async (req, res) => {
    const { upload, s3, PutObjectCommand } = await getUploadDeps();
    upload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
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
router.post('/upload-logo', authMiddleware, async (req, res) => {
    const { upload, s3, PutObjectCommand } = await getUploadDeps();
    const sharp = await getSharp();
    upload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
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
            // If no club requested, System Admin sees ALL media (no WHERE clause needed)
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
                const { s3, DeleteObjectCommand } = await getUploadDeps();
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
