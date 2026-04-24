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
        const result = await db.query(
            `SELECT key, value FROM "PlatformConfig" WHERE key IN ('platform_logo', 'platform_logo_size', 'saas_redirect')`
        );
        const map = {};
        result.rows.forEach(r => { map[r.key] = r.value; });
        res.json({
            url: map['platform_logo'] || null,
            size: map['platform_logo_size'] ? parseInt(map['platform_logo_size'], 10) : 48,
            saasRedirect: map['saas_redirect'] === 'true'
        });
    } catch {
        res.json({ url: null, size: 48, saasRedirect: false });
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
            const region = process.env.AWS_REGION || 'us-east-1';
            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            const s3Key = `platform/logo/${fileName}`;

            console.log(`[PlatformConfig] Uploading logo to S3: ${s3Key} in bucket: ${bucket}`);

            await s3.send(new PutObjectCommand({
                Bucket: bucket,
                Key: s3Key,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            }));

            const encodedKey = s3Key.split('/').map(seg => encodeURIComponent(seg)).join('/');
            const url = `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;

            console.log(`[PlatformConfig] Logo uploaded to S3. URL: ${url}`);

            await db.query(
                `INSERT INTO "PlatformConfig" (id, key, value, "updatedAt")
                 VALUES (gen_random_uuid(), 'platform_logo', $1, NOW())
                 ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
                [url]
            );

            res.json({ url });
        } catch (error) {
            console.error('[PlatformConfig] Logo upload error:', error);
            res.status(500).json({ 
                error: 'Error al subir el logo a la infraestructura de la plataforma',
                details: error.message 
            });
        }
    });
});

// ── Save platform logo size ───────────────────────────────────
router.post('/logo/size', async (req, res) => {
    const size = parseInt(req.body.size, 10);
    if (!size || size < 24 || size > 200) {
        return res.status(400).json({ error: 'Tamaño inválido (24–200px)' });
    }
    try {
        await db.query(
            `INSERT INTO "PlatformConfig" (id, key, value, "updatedAt")
             VALUES (gen_random_uuid(), 'platform_logo_size', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
            [String(size)]
        );
        res.json({ size });
    } catch (error) {
        console.error('[PlatformConfig] Logo size error:', error);
        res.status(500).json({ error: 'Error al guardar el tamaño' });
    }
});

// ── Save platform redirect config ──────────────────────────────
router.post('/redirect', async (req, res) => {
    const { active } = req.body;
    try {
        await db.query(
            `INSERT INTO "PlatformConfig" (id, key, value, "updatedAt")
             VALUES (gen_random_uuid(), 'saas_redirect', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
            [active ? 'true' : 'false']
        );
        res.json({ active: !!active });
    } catch (error) {
        console.error('[PlatformConfig] Redirect save error:', error);
        res.status(500).json({ error: 'Error al actualizar redirección' });
    }
});

export default router;
