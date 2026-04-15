import express from 'express';
import db from '../lib/db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { getEmailConfig, updateEmailConfig, sendTestEmail } from '../controllers/verificationController.js';
import { uploadMemory, s3 } from '../lib/storage.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const router = express.Router();

// ── Public: no auth required ──────────────────────────────────
router.get('/logo', async (_req, res) => {
    try {
        const result = await db.query(`SELECT value FROM "PlatformConfig" WHERE key = 'platform_logo'`);
        res.json({ url: result.rows[0]?.value || null });
    } catch {
        res.json({ url: null });
    }
});

// All routes below require authentication + administrator role (super admin)
router.use(authMiddleware);
router.use(roleMiddleware('administrator'));

router.get('/email', getEmailConfig);
router.post('/email', updateEmailConfig);
router.post('/email/test', sendTestEmail);

// ── Upload platform login logo ────────────────────────────────
router.post('/logo/upload', (req, res) => {
    uploadMemory.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
            const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            const s3Key = `platform/logo/${fileName}`;

            await s3.send(new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            }));

            const encodedKey = s3Key.split('/').map(seg => encodeURIComponent(seg)).join('/');
            const url = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;

            await db.query(
                `INSERT INTO "PlatformConfig" (id, key, value, "updatedAt")
                 VALUES (gen_random_uuid(), 'platform_logo', $1, NOW())
                 ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
                [url]
            );

            res.json({ url });
        } catch (error) {
            console.error('[PlatformConfig] Logo upload error:', error);
            res.status(500).json({ error: 'Error al subir el logo' });
        }
    });
});

export default router;
