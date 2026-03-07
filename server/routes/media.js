const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3, upload } = require('../lib/storage');

// Upload a single file
router.post('/upload', authMiddleware, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('Multer/S3 Error:', err);
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No se seleccionó ningún archivo' });
        }

        try {
            // Save file info to database
            const media = await prisma.media.create({
                data: {
                    filename: req.file.originalname,
                    url: req.file.location, // S3 Public URL
                    type: req.file.mimetype.startsWith('image/') ? 'image' : 'document',
                    size: req.file.size,
                    bucket: req.file.bucket,
                    region: process.env.AWS_REGION || 'us-east-1',
                    clubId: req.user.clubId,
                    s3Key: req.file.key // Storing key for deletion
                }
            });

            res.json(media);
        } catch (error) {
            console.error('Error saving media to DB:', error);
            res.status(500).json({ error: 'Error al guardar la información en la base de datos' });
        }
    });
});

// Get media for the current club
router.get('/', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;

        const media = await prisma.media.findMany({
            where: clubId ? { clubId } : {},
            orderBy: { createdAt: 'desc' }
        });

        res.json(media);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching media library' });
    }
});

// Delete media
router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const media = await prisma.media.findUnique({ where: { id } });
        if (!media) return res.status(404).json({ error: 'Archivo no encontrado' });

        // Security check
        if (req.user.role !== 'administrator' && media.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'No tienes permiso para borrar este archivo' });
        }

        // Delete from S3 if metadata exists
        if (media.s3Key && media.bucket) {
            try {
                const deleteParams = {
                    Bucket: media.bucket,
                    Key: media.s3Key
                };
                await s3.send(new DeleteObjectCommand(deleteParams));
                console.log(`Deleted from S3: ${media.s3Key}`);
            } catch (s3Err) {
                console.error('Failed to delete from S3:', s3Err);
                // Continue to delete from DB anyway to keep consistent with UI
            }
        }

        await prisma.media.delete({ where: { id } });
        res.json({ message: 'Archivo eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting media:', error);
        res.status(500).json({ error: 'Error al eliminar el archivo' });
    }
});

module.exports = router;
