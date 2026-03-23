import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { uploadDocuments, s3 } from '../lib/storage.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// ── POST /api/documents/upload — Upload document to S3 + save to ClubDocument ──
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
