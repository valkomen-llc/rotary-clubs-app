import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { uploadDocuments, s3 } from '../lib/storage.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';

// ── GET /api/documents/presigned-url — Generate direct upload URL ──
router.get('/presigned-url', authMiddleware, async (req, res) => {
    try {
        const { fileName, fileType, clubId } = req.query;
        if (!fileName || !fileType || !clubId) {
            return res.status(400).json({ error: 'Faltan parámetros' });
        }

        const key = `clubs/${clubId}/documents/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: fileType
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${encodedKey}`;

        res.json({ uploadUrl, fileUrl, key });
    } catch (error) {
        console.error('[Documents] Presigned URL error:', error);
        res.status(500).json({ error: 'Error al generar URL de subida' });
    }
});

// ── POST /api/documents/save — Save document record after direct S3 upload ──
router.post('/save', authMiddleware, async (req, res) => {
    try {
        const { clubId, fileName, fileUrl, s3Key, fileType, fileSize, category } = req.body;
        
        const doc = await prisma.clubDocument.create({
            data: {
                clubId,
                fileName,
                fileUrl,
                s3Key,
                fileType,
                fileSize,
                category: category || 'general',
                uploadedById: req.user.id,
            }
        });

        res.json(doc);
    } catch (error) {
        console.error('[Documents] Save error:', error);
        res.status(500).json({ error: 'Error al guardar el registro del documento' });
    }
});

// ── POST /api/documents/upload — Legacy Upload document via server (4.5MB limit on Vercel) ──
router.post('/upload', authMiddleware, (req, res) => {
    uploadDocuments.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se seleccionó ningún archivo' });

        try {
            const clubId = req.user.role === 'administrator'
                ? (req.query.clubId || req.body.clubId || req.user.clubId)
                : req.user.clubId;

            if (!clubId) return res.status(400).json({ error: 'Club no asignado' });

            const category = req.body.category || 'general';

            const doc = await prisma.clubDocument.create({
                data: {
                    clubId,
                    fileName: req.file.originalname,
                    fileUrl: req.file.location,
                    s3Key: req.file.key,
                    fileType: req.file.mimetype,
                    fileSize: req.file.size,
                    category,
                    uploadedById: req.user.id,
                }
            });

            res.json(doc);
        } catch (error) {
            console.error('[Documents] Upload error:', error);
            res.status(500).json({ error: 'Error al guardar el documento' });
        }
    });
});

// ── GET /api/documents — List club documents ──
router.get('/', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator'
            ? (req.query.clubId || req.user.clubId)
            : req.user.clubId;

        if (!clubId) return res.json([]);

        const docs = await prisma.clubDocument.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' },
            include: { uploadedBy: { select: { name: true, email: true } } }
        });

        res.json(docs);
    } catch (error) {
        console.error('[Documents] List error:', error);
        res.status(500).json({ error: 'Error al obtener documentos' });
    }
});

// ── DELETE /api/documents/:id — Delete document from S3 + DB ──
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const doc = await prisma.clubDocument.findUnique({ where: { id: req.params.id } });
        if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

        // Check permissions
        if (req.user.role !== 'administrator' && doc.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        // Delete from S3
        if (doc.s3Key) {
            try {
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME || 'rotary-platform-assets',
                    Key: doc.s3Key
                }));
            } catch (s3Err) {
                console.error('[Documents] S3 delete error:', s3Err);
            }
        }

        await prisma.clubDocument.delete({ where: { id: doc.id } });
        res.json({ message: 'Documento eliminado correctamente' });
    } catch (error) {
        console.error('[Documents] Delete error:', error);
        res.status(500).json({ error: 'Error al eliminar el documento' });
    }
});

export default router;
