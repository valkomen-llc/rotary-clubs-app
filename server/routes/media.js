const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../lib/storage');
const prisma = require('../lib/prisma');

// Upload a single file
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Save file info to database
        const media = await prisma.media.create({
            data: {
                filename: req.file.key.split('/').pop(),
                url: req.file.location, // S3 Public URL
                type: req.file.mimetype.startsWith('image/') ? 'image' : 'document',
                size: req.file.size,
                bucket: req.file.bucket,
                region: process.env.AWS_REGION || 'us-east-1',
                clubId: req.user.clubId
            }
        });

        res.json(media);
    } catch (error) {
        console.error('Error saving media to DB:', error);
        res.status(500).json({ error: 'Internal server error while saving media' });
    }
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

module.exports = router;
