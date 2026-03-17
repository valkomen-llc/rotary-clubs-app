import express from 'express';
import db from '../lib/db.js';
import { getPublicPosts, getPublicProjects, getPublicProjectById, getPublicTestimonials } from '../controllers/contentController.js';
import { getPublicSections } from '../controllers/cmsController.js';

const router = express.Router();

// Get club by domain or subdomain
router.get('/by-domain', async (req, res) => {
    const { domain } = req.query;
    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }

    try {
        // 1. Fetch Master Club (origen) to get global logos
        // Use double quotes for camelCase columns to ensure Postgres matches Prisma's naming
        const masterResult = await db.query(
            'SELECT logo, "footerLogo", "endPolioLogo", favicon FROM "Club" WHERE subdomain = $1',
            ['origen']
        );
        const masterLogos = masterResult.rows[0] || {};

        // 2. Fetch Current Club
        let result = await db.query(
            `SELECT c.id, c.name, c.logo, c."footerLogo", c."endPolioLogo", c.favicon, c.domain, c.subdomain, c.status,
             s.key, s.value,
             (SELECT COUNT(*) FROM "Product" p WHERE p."clubId" = c.id AND p.status = 'active') as "productsCount",
             (SELECT COUNT(*) FROM "CalendarEvent" ce WHERE ce."clubId" = c.id) as "eventsCount"
             FROM "Club" c 
             LEFT JOIN "Setting" s ON s."clubId" = c.id
             WHERE (c.domain = $1 OR c.subdomain = $2) AND c.status = 'active'`,
            [domain, domain.split('.')[0]]
        );

        let rows = result.rows;

        if (!rows.length) {
            result = await db.query(
                `SELECT c.id, c.name, c.logo, c."footerLogo", c."endPolioLogo", c.favicon, c.domain, c.subdomain, c.status,
                 s.key, s.value,
                 (SELECT COUNT(*) FROM "Product" p WHERE p."clubId" = c.id AND p.status = 'active') as "productsCount",
                 (SELECT COUNT(*) FROM "CalendarEvent" ce WHERE ce."clubId" = c.id) as "eventsCount"
                 FROM "Club" c 
                 LEFT JOIN "Setting" s ON s."clubId" = c.id
                 WHERE c.subdomain = 'origen'`
            );
            rows = result.rows;
        }

        if (!rows.length) {
            return res.status(404).json({ error: 'Club not found' });
        }

        // Group settings
        const clubDataRaw = {};
        const settings = {};
        rows.forEach(r => {
            if (!clubDataRaw.id) {
                const { key, value, ...clubInfo } = r;
                Object.assign(clubDataRaw, clubInfo);
            }
            if (r.key) settings[r.key] = r.value;
        });

        // Use a consistent fallback for logo assets if neither the club nor master has them
        const defaultFooter = "https://rotary-platform-assets.s3.amazonaws.com/logos/rotary-logo-white-main.png";

        const mappedClub = {
            ...clubDataRaw,
            // LOGO INHERITANCE RULE:
            // 1. Header Logo: Use club's, fallback to master's
            logo: clubDataRaw.logo || masterLogos.logo,
            // 2. Footer Logo: Use club's, fallback to master's, fallback to hardcoded
            footerLogo: clubDataRaw.footerLogo || masterLogos.footerLogo || defaultFooter,
            // 3. End Polio Logo: Use club's, fallback to master's
            endPolioLogo: clubDataRaw.endPolioLogo || masterLogos.endPolioLogo,
            // 4. Favicon: Use club's, fallback to master's
            favicon: clubDataRaw.favicon || masterLogos.favicon,

            contact: {
                email: settings['contact_email'] || '',
                phone: settings['contact_phone'] || '',
                address: settings['contact_address'] || '',
            },
            social: settings['social_links'] ? JSON.parse(settings['social_links']) : [],
            colors: {
                primary: settings['color_primary'] || '#013388',
                secondary: settings['color_secondary'] || '#E29C00',
            },
            logoText: clubDataRaw.name?.split(' ').pop(),
            productsCount: parseInt(clubDataRaw.productsCount) || 0,
            eventsCount: parseInt(clubDataRaw.eventsCount) || 0,
            logoHeaderSize: parseInt(settings['logo_header_size']) || 150,
            onboardingCompleted: settings['onboarding_completed'] !== 'false',
            onboardingStep: parseInt(settings['onboarding_step']) || 1,
        };

        res.json(mappedClub);
    } catch (error) {
        console.error('Error fetching club:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:clubId/posts', getPublicPosts);
router.get('/:clubId/projects', getPublicProjects);
router.get('/:clubId/projects/:projectId', getPublicProjectById);
router.get('/:clubId/testimonials', getPublicTestimonials);
router.get('/:clubId/sections', getPublicSections);

// Convenience: get site-images map for a club
router.get('/:clubId/site-images', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT content FROM "ContentSection" WHERE page = 'home' AND section = 'images' AND "clubId" = $1`,
            [req.params.clubId]
        );
        if (result.rows.length === 0) return res.json({});
        const content = typeof result.rows[0].content === 'string'
            ? JSON.parse(result.rows[0].content) : result.rows[0].content;
        res.set('Cache-Control', 'public, max-age=300');
        res.json(content);
    } catch (error) {
        console.error('Error fetching site-images:', error);
        res.status(500).json({ error: 'Error fetching site images' });
    }
});

export default router;
