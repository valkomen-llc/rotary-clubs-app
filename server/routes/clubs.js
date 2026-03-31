import express from 'express';
import db from '../lib/db.js';
import { getPublicPosts, getPublicProjects, getPublicProjectById, getPublicTestimonials } from '../controllers/contentController.js';
import { getPublicSections } from '../controllers/cmsController.js';

const router = express.Router();

// Get club by domain or subdomain
router.get('/by-domain', async (req, res) => {
    const { domain, preview } = req.query;
    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }

    try {
        // 1. Fetch Master Club (origen) to get global logos and settings
        // Use double quotes for camelCase columns to ensure Postgres matches Prisma's naming
        const masterResult = await db.query(
            `SELECT c.logo, c."footerLogo", c."endPolioLogo", c.favicon, s.key, s.value 
             FROM "Club" c 
             LEFT JOIN "Setting" s ON s."clubId" = c.id 
             WHERE c.subdomain = $1`,
            ['origen']
        );
        
        const masterLogos = masterResult.rows.length ? {
            logo: masterResult.rows[0].logo,
            footerLogo: masterResult.rows[0].footerLogo,
            endPolioLogo: masterResult.rows[0].endPolioLogo,
            favicon: masterResult.rows[0].favicon
        } : {};

        const masterSettings = {};
        masterResult.rows.forEach(r => {
            if (r.key) masterSettings[r.key] = r.value;
        });

        // 2. Fetch Current Club
        // When preview=true, allow loading draft clubs too
        const statusFilter = preview === 'true' ? '' : "AND c.status = 'active'";
        let result = await db.query(
            `SELECT c.id, c.name, c.logo, c."footerLogo", c."endPolioLogo", c.favicon, c.domain, c.subdomain, c.status, c.type,
             s.key, s.value,
             (SELECT COUNT(*) FROM "Product" p WHERE p."clubId" = c.id AND p.status = 'active') as "productsCount",
             (SELECT COUNT(*) FROM "CalendarEvent" ce WHERE ce."clubId" = c.id) as "eventsCount"
             FROM "Club" c 
             LEFT JOIN "Setting" s ON s."clubId" = c.id
             WHERE (c.domain = $1 OR c.subdomain = $2) ${statusFilter}`,
            [domain, domain.split('.')[0]]
        );

        let rows = result.rows;

        if (!rows.length) {
            result = await db.query(
                `SELECT c.id, c.name, c.logo, c."footerLogo", c."endPolioLogo", c.favicon, c.domain, c.subdomain, c.status, c.type,
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

        // Fetch global settings
        const globalSettingsResult = await db.query('SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL', ['map_style']);
        const globalMapStyle = globalSettingsResult.rows[0]?.value || 'm';

        const mappedClub = {
            ...clubDataRaw,
            // Globally defined map style
            mapStyle: globalMapStyle,
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
            state: settings['club_state'] || '',
            social: settings['social_links'] ? JSON.parse(settings['social_links']) : [],
            customSocial: settings['custom_social_links'] ? JSON.parse(settings['custom_social_links']) : [],
            siteImages: settings['site_images'] ? JSON.parse(settings['site_images']) : {},
            galleryImages: settings['gallery_images'] ? JSON.parse(settings['gallery_images']) : [],
            modules: {
                memberCount: settings['member_count'] || '20 a 50',
                projects: settings['module_projects'] !== 'false',
                events: settings['module_events'] !== 'false',
                rotaract: settings['module_rotaract'] === 'true',
                interact: settings['module_interact'] === 'true',
                youthExchange: settings['module_youth_exchange'] === 'true',
                ngse: settings['module_ngse'] === 'true',
                rotex: settings['module_rotex'] === 'true',
                ecommerce: settings['module_ecommerce'] === 'true',
                dian: settings['module_dian'] === 'true',
            },
            colors: {
                primary: settings['color_primary'] || '#013388',
                secondary: settings['color_secondary'] || '#E29C00',
            },
            logoText: clubDataRaw.name?.split(' ').pop(),
            productsCount: parseInt(clubDataRaw.productsCount) || 0,
            eventsCount: parseInt(clubDataRaw.eventsCount) || 0,
            logoHeaderSize: parseInt(settings['logo_header_size']) || 200,
            onboardingCompleted: settings['onboarding_completed'] === 'true',
            onboardingStep: parseInt(settings['onboarding_step']) || 0,
            settings: {
                rotaract_logo: settings['rotaract_logo'] || masterSettings['rotaract_logo'] || null,
                interact_logo: settings['interact_logo'] || masterSettings['interact_logo'] || null,
                youth_exchange_logo: settings['youth_exchange_logo'] || masterSettings['youth_exchange_logo'] || null,
            }
        };

        res.json(mappedClub);
    } catch (error) {
        console.error('Error fetching club:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Public search endpoint — searches posts, projects, events for a club
router.get('/:clubId/search', async (req, res) => {
    const { clubId } = req.params;
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
        return res.json({ posts: [], projects: [], events: [] });
    }
    const query = `%${q.trim().toLowerCase()}%`;
    try {
        const [posts, projects, events] = await Promise.all([
            db.query(
                `SELECT id, title, excerpt, "coverImage", "createdAt" FROM "Post"
                 WHERE "clubId" = $1 AND status = 'published'
                 AND (LOWER(title) LIKE $2 OR LOWER(excerpt) LIKE $2 OR LOWER(content) LIKE $2)
                 ORDER BY "createdAt" DESC LIMIT 5`,
                [clubId, query]
            ),
            db.query(
                `SELECT id, title, description, "coverImage", "createdAt" FROM "Project"
                 WHERE "clubId" = $1
                 AND (LOWER(title) LIKE $2 OR LOWER(description) LIKE $2)
                 ORDER BY "createdAt" DESC LIMIT 5`,
                [clubId, query]
            ),
            db.query(
                `SELECT id, title, description, location, "startDate" FROM "Event"
                 WHERE "clubId" = $1
                 AND (LOWER(title) LIKE $2 OR LOWER(description) LIKE $2)
                 ORDER BY "startDate" DESC LIMIT 5`,
                [clubId, query]
            ).catch(() => ({ rows: [] })), // Event table may not exist
        ]);
        res.json({
            posts: posts.rows,
            projects: projects.rows,
            events: events.rows,
        });
    } catch (error) {
        console.error('Search error:', error.message);
        res.json({ posts: [], projects: [], events: [] });
    }
});

router.get('/:clubId/posts', getPublicPosts);
router.get('/:clubId/projects', getPublicProjects);
router.get('/:clubId/projects/:projectId', getPublicProjectById);
router.get('/:clubId/testimonials', getPublicTestimonials);
router.get('/:clubId/sections', getPublicSections);

// Public events endpoint — returns CalendarEvent records for public pages
router.get('/:clubId/events', async (req, res) => {
    try {
        const { clubId } = req.params;
        const result = await db.query(
            `SELECT id, title, description, "startDate", "endDate", location, type, "createdAt"
             FROM "CalendarEvent"
             WHERE "clubId" = $1
             ORDER BY "startDate" ASC`,
            [clubId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Public events error:', error.message);
        res.json([]);
    }
});

// Convenience: get site-images map for a club (merges global defaults + club overrides)
// Special: /_global/site-images returns only global images (clubId IS NULL)
router.get('/:clubId/site-images', async (req, res) => {
    try {
        const { clubId } = req.params;
        const isGlobal = clubId === '_global';

        if (isGlobal) {
            // Return only global images (super admin view)
            const result = await db.query(
                `SELECT content FROM "ContentSection" WHERE page = 'home' AND section = 'images' AND "clubId" IS NULL`
            );
            if (result.rows.length === 0) return res.json({});
            const content = typeof result.rows[0].content === 'string'
                ? JSON.parse(result.rows[0].content) : result.rows[0].content;
            return res.json(content || {});
        }
        // Fetch both global (super admin, clubId IS NULL) and club-specific images
        const [globalResult, clubResult] = await Promise.all([
            db.query(
                `SELECT content FROM "ContentSection" WHERE page = 'home' AND section = 'images' AND "clubId" IS NULL`
            ),
            db.query(
                `SELECT content FROM "ContentSection" WHERE page = 'home' AND section = 'images' AND "clubId" = $1`,
                [req.params.clubId]
            ),
        ]);

        const parse = (row) => {
            if (!row) return {};
            const c = row.content;
            return typeof c === 'string' ? JSON.parse(c) : (c || {});
        };

        const globalImages = globalResult.rows.length > 0 ? parse(globalResult.rows[0]) : {};
        const clubImages = clubResult.rows.length > 0 ? parse(clubResult.rows[0]) : {};

        // Helper: detect if a URL is an Unsplash default (not a real custom upload)
        const isDefault = (url) => !url || url.includes('images.unsplash.com');

        // Merge: start with global defaults, then overlay club-specific images
        const merged = { ...globalImages };

        // For single-value keys (foundation, join, aboutHero), overlay if club has custom
        for (const key of Object.keys(clubImages)) {
            if (['causes', 'hero', 'aboutCarousel'].includes(key)) continue; // handled below
            const clubVal = clubImages[key];
            if (clubVal && !isDefault(clubVal.url)) {
                merged[key] = clubVal;
            } else if (!merged[key]) {
                merged[key] = clubVal;
            }
        }

        // For array slots (causes, hero, aboutCarousel) — merge per-slot:
        // Only use club slot if it's a real custom upload (not Unsplash default)
        const arrayKeys = ['causes', 'hero', 'aboutCarousel'];
        for (const key of arrayKeys) {
            const globalArr = (globalImages[key] && Array.isArray(globalImages[key])) ? globalImages[key] : [];
            const clubArr = (clubImages[key] && Array.isArray(clubImages[key])) ? clubImages[key] : [];
            
            if (globalArr.length > 0) {
                merged[key] = globalArr.map((globalSlot, i) => {
                    const clubSlot = clubArr[i];
                    // Use club slot ONLY if it has a real custom URL (not Unsplash)
                    return (clubSlot && clubSlot.url && !isDefault(clubSlot.url)) ? clubSlot : globalSlot;
                });
                // If club has more slots than global, append custom ones
                if (clubArr.length > globalArr.length) {
                    for (let i = globalArr.length; i < clubArr.length; i++) {
                        if (clubArr[i] && !isDefault(clubArr[i].url)) {
                            merged[key].push(clubArr[i]);
                        }
                    }
                }
            } else if (clubArr.length > 0) {
                merged[key] = clubArr;
            }
        }

        res.json(merged);
    } catch (error) {
        console.error('Error fetching site-images:', error);
        res.status(500).json({ error: 'Error fetching site images' });
    }
});

export default router;
