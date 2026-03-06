const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// Get club by domain or subdomain
router.get('/by-domain', async (req, res) => {
    const { domain } = req.query;

    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }

    try {
        // Try domain first, then subdomain
        let club = await prisma.club.findFirst({
            where: {
                OR: [
                    { domain: domain },
                    { subdomain: domain.split('.')[0] }
                ],
                status: 'active'
            },
            include: {
                settings: true
            }
        });

        if (!club) {
            // Return default club if not found (optional, or 404)
            club = await prisma.club.findFirst({
                where: { subdomain: 'origen' },
                include: { settings: true }
            });
        }

        if (!club) {
            return res.status(404).json({ error: 'Club not found' });
        }

        // Map settings array to a more useful nested object structure
        const settings = {};
        club.settings.forEach(s => {
            settings[s.key] = s.value;
        });

        const mappedClub = {
            ...club,
            contact: {
                email: settings['contact_email'] || '',
                phone: settings['contact_phone'] || '',
                address: settings['contact_address'] || '',
            },
            social: {
                facebook: settings['social_facebook'] || '',
                instagram: settings['social_instagram'] || '',
                twitter: settings['social_twitter'] || '',
                youtube: settings['social_youtube'] || '',
            },
            colors: {
                primary: settings['color_primary'] || '#013388',
                secondary: settings['color_secondary'] || '#E29C00',
            },
            logoText: club.name.split(' ').pop(), // Fallback logo text
        };

        res.json(mappedClub);
    } catch (error) {
        console.error('Error fetching club:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin: CRUD for clubs (only for Super Admin)
// ... will add later with protection

const { getPublicPosts, getPublicProjects } = require('../controllers/contentController');

router.get('/:clubId/posts', getPublicPosts);
router.get('/:clubId/projects', getPublicProjects);

module.exports = router;
