import express from 'express';
import { autoRegisterClub } from '../controllers/saasController.js';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { s3 } from '../lib/storage.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

// 1. Endpoint para pre-firmar la carga directa a S3 desde el cliente (evita timeout y max-body en Vercel)
router.get('/district-media/presign', async (req, res) => {
    try {
        const { fileName, fileType } = req.query;
        if (!fileName || !fileType) return res.status(400).json({ error: 'Faltan parámetros' });

        const submissionId = randomUUID();
        const date = new Date().toISOString().split('T')[0];
        const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');
        const key = `district-submissions/${date}/${submissionId}/${Date.now()}-${safeName}`;
        
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: fileType });
        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        
        const encodedKey = key.split('/').map(seg => encodeURIComponent(seg)).join('/');
        const url = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;
        
        res.json({ uploadUrl, url, s3Key: key });
    } catch (e) {
        console.error('Error presigning S3 URL:', e);
        res.status(500).json({ error: 'Error presigning' });
    }
});

// 2. Endpoint final para guardar la Metadata en BD y S3 (payload liviano JSON)
router.post('/district-media', express.json(), async (req, res) => {
    try {
        const { firstName, lastName, email, phone, clubName, role, message, uploadedFiles } = req.body;
        
        const fileData = uploadedFiles || [];
        const submissionId = randomUUID();

        const metadataPayload = {
            submissionId: submissionId,
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
        const s3Key = `district-submissions/${date}/${submissionId}/metadata.json`;

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: JSON.stringify(metadataPayload, null, 2),
            ContentType: 'application/json'
        }));

        // Buscamos el ID del distrito 4271 para asociarlo, de lo contrario quedará huérfano
        const districtRes = await db.query(
            'SELECT id FROM "Club" WHERE name ILIKE $1 OR domain ILIKE $1 OR subdomain ILIKE $1 LIMIT 1', 
            ['%4271%']
        );
        const clubId = districtRes.rows[0]?.id || null;

        await db.query(`
        CREATE TABLE IF NOT EXISTS "Lead" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId" TEXT REFERENCES "Club"(id),
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            subject VARCHAR(255),
            message TEXT,
            source VARCHAR(50) DEFAULT 'contact_form',
            status VARCHAR(30) DEFAULT 'new',
            notes TEXT,
            metadata JSONB DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );`);
        await db.query(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`).catch(() => { });

        await db.query(
            `INSERT INTO "Lead" (name, email, phone, subject, message, "clubId", source, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                `${firstName || ''} ${lastName || ''}`.trim() || 'Sin Nombre',
                email || 'sin-correo@example.com',
                phone || null,
                `Multimedia: ${clubName || 'N/A'}`,
                message || null,
                clubId || null,
                'district_multimedia_form',
                JSON.stringify({ 
                    ...(metadataPayload.user || {}),
                    files: fileData || [],
                    s3MetadataKey: s3Key || null
                })
            ]
        );

        if (clubId) {
            // Auto-heal leads huérfanos anteriores por culpa del error de mapeo
            await db.query(`UPDATE "Lead" SET "clubId" = $1 WHERE "clubId" IS NULL AND source = 'district_multimedia_form'`, [clubId]).catch(() => {});
        }

        res.json({ success: true, submissionId: submissionId, filesCount: fileData.length });
    } catch (error) {
        console.error('Error procesando metadata del distrito:', error);
        res.status(500).json({ error: error.message || 'Error finalizando el envío de multimedia.' });
    }
});

export default router;
