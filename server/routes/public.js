import express from 'express';
import { autoRegisterClub } from '../controllers/saasController.js';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { s3 } from '../lib/storage.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const router = express.Router();

// This endpoint is used by the generic SaaS landing page (RegisterClub.tsx wizard)
router.post('/register-club', autoRegisterClub);

import { getRobotsTxt, getSitemap } from '../controllers/seoController.js';
router.get('/seo/robots.txt', getRobotsTxt);
router.get('/seo/sitemap.xml', getSitemap);

import db from '../lib/db.js';

router.get('/documents/:clubIdOrSubdomain', async (req, res) => {
    try {
        const { clubIdOrSubdomain } = req.params;
        // Search first by ID (UUID)
        let result = await db.query(
            'SELECT id, "fileName", "fileUrl", "fileSize", category, "createdAt" FROM "ClubDocument" WHERE "clubId" = $1 ORDER BY "createdAt" DESC',
            [clubIdOrSubdomain]
        );

        // If no results, search by subdomain in 'Club' table
        if (result.rows.length === 0) {
            const clubRes = await db.query('SELECT id FROM "Club" WHERE subdomain = $1 OR domain = $1 LIMIT 1', [clubIdOrSubdomain]);
            if (clubRes.rows.length > 0) {
                const realId = clubRes.rows[0].id;
                result = await db.query(
                    'SELECT id, "fileName", "fileUrl", "fileSize", category, "createdAt" FROM "ClubDocument" WHERE "clubId" = $1 ORDER BY "createdAt" DESC',
                    [realId]
                );
            }
        }

        res.json(result.rows);
    } catch (error) {
        console.error('[Public Documents] Error:', error);
        res.status(500).json({ error: 'Error al obtener recursos' });
    }
});

// --- DISTRICT MULTIMEDIA UPLOAD LOGIC ---
const uploadDistrictMedia = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            const date = new Date().toISOString().split('T')[0];
            if (!req.submissionId) req.submissionId = randomUUID();
            const fileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
            cb(null, `district-submissions/${date}/${req.submissionId}/${fileName}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|mp4|mov|quicktime/i;
        const mimetype = filetypes.test(file.mimetype);
        const nameMatch = filetypes.test(file.originalname);
        if (mimetype || nameMatch) return cb(null, true);
        cb(new Error("Formato no compatible. Solo JPG, PNG, WEBP y videos MP4/MOV."));
    },
    limits: { fileSize: 80 * 1024 * 1024 } // max 80MB per file (generous for standard mobile videos)
});

router.post('/district-media', (req, res, next) => {
    // We expect an array of files up to 13 total (10 imgs + 3 videos)
    uploadDistrictMedia.array('files', 15)(req, res, (err) => {
        if (err) {
            console.error('District Upload Error:', err);
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, clubName, role, message } = req.body;
        const files = req.files || [];

        const fileData = files.map(f => ({
            originalName: f.originalname,
            url: f.location,
            size: f.size,
            mimetype: f.mimetype
        }));

        const metadataPayload = {
            submissionId: req.submissionId,
            timestamp: new Date().toISOString(),
            user: {
                firstName,
                lastName,
                email,
                phone,
                clubName,
                role
            },
            message,
            files: fileData
        };

        // 1. Guardar metadata en S3 como archivo JSON (Respaldo)
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        const date = new Date().toISOString().split('T')[0];
        const s3Key = `district-submissions/${date}/${req.submissionId}/metadata.json`;

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: JSON.stringify(metadataPayload, null, 2),
            ContentType: 'application/json'
        }));

        // 2. persistir en la base de datos como un Lead para que sea visible en el Dashboard
        // Buscamos el ID del distrito 4271 para asociarlo, si no, lo dejamos huérfano o asociado a la plataforma
        const districtRes = await db.query('SELECT id FROM "Club" WHERE subdomain = $1 OR domain = $1 LIMIT 1', ['4271']);
        const clubId = districtRes.rows[0]?.id || null;

        await db.query(
            `INSERT INTO "Lead" (name, email, phone, subject, message, "clubId", source, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                `${firstName} ${lastName}`,
                email,
                phone,
                `Multimedia: ${clubName}`,
                message,
                clubId,
                'district_multimedia_form',
                JSON.stringify({ 
                    ...metadataPayload.user,
                    files: fileData,
                    s3MetadataKey: s3Key 
                })
            ]
        );

        res.json({ success: true, submissionId: req.submissionId, filesCount: files.length });
    } catch (error) {
        console.error('Error procesando metadata del distrito:', error);
        res.status(500).json({ error: 'Error finalizando el envío.' });
    }
});

export default router;
