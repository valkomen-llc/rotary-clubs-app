import db from '../lib/db.js';
import { PrismaClient } from '@prisma/client';
import VercelService from '../services/VercelService.js';

const prisma = new PrismaClient();

export const getAllClubs = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT c.*, 
                (SELECT COUNT(*) FROM "User" u WHERE u."clubId" = c.id) as "userCount",
                (SELECT COUNT(*) FROM "Project" p WHERE p."clubId" = c.id) as "projectCount",
                (SELECT COUNT(*) FROM "Post" po WHERE po."clubId" = c.id) as "postCount"
            FROM "Club" c ORDER BY c."createdAt" DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching clubs' });
    }
};

export const getClubById = async (req, res) => {
    const { id } = req.params;
    try {
        if (req.user.role !== 'administrator' && req.user.clubId !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const clubResult = await db.query('SELECT * FROM "Club" WHERE id = $1', [id]);
        const settingsResult = await db.query('SELECT * FROM "Setting" WHERE "clubId" = $1', [id]);
        const paymentConfigs = await prisma.paymentProviderConfig.findMany({ where: { clubId: id } });

        const club = clubResult.rows[0];
        if (!club) return res.status(404).json({ error: 'Club not found' });

        club.settings = settingsResult.rows;
        club.paymentConfigs = paymentConfigs;

        // Build modules map from settings for frontend convenience
        const settingsMap = {};
        settingsResult.rows.forEach(s => { settingsMap[s.key] = s.value; });
        club.modules = {
            memberCount: settingsMap['member_count'] || '20',
            projects: settingsMap['module_projects'] !== 'false',
            events: settingsMap['module_events'] !== 'false',
            rotaract: settingsMap['module_rotaract'] === 'true',
            interact: settingsMap['module_interact'] === 'true',
            ecommerce: settingsMap['module_ecommerce'] === 'true',
            dian: settingsMap['module_dian'] === 'true',
            youth_exchange: settingsMap['module_youth_exchange'] === 'true',
            ngse: settingsMap['module_ngse'] === 'true',
            rotex: settingsMap['module_rotex'] === 'true',
        };

        res.json(club);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching club' });
    }
};

export const createClub = async (req, res) => {
    const { name, city, country, district, domain, subdomain, description, status } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO "Club" (id, name, city, country, district, domain, subdomain, description, status, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *`,
            [name, city, country, district, domain, subdomain, description, status || 'active']
        );

        if (domain) {
            await VercelService.addDomain(domain);
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating club:', error);
        res.status(500).json({ error: 'Error creating club' });
    }
};

export const updateClub = async (req, res) => {
    const { id } = req.params;
    const {
        name, description, city, country, district, domain, subdomain,
        email, phone, address, state, socialLinks, customSocialLinks, siteImages, galleryImages,
        primaryColor, secondaryColor, logo, footerLogo, endPolioLogo, favicon, status,
        stripePublicKey, stripeSecretKey, useStripe,
        usePaypal, paypalSandbox, paypalClientId, paypalSecretKey,
        storeActive, logoHeaderSize,
        memberCount, moduleProjects, moduleEvents, moduleRotaract, moduleInteract, moduleEcommerce, moduleDian,
        moduleYouthExchange, moduleNgse, moduleRotex
    } = req.body;

    try {
        if (req.user.role !== 'administrator' && req.user.clubId !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const currentClub = await db.query('SELECT * FROM "Club" WHERE id = $1', [id]);
        if (!currentClub.rows[0]) return res.status(404).json({ error: 'Club not found' });

        const params = [
            name, description, city, country, district, domain, subdomain,
            logo, footerLogo, endPolioLogo, favicon, status, id
        ].map(val => val === undefined ? null : val);

        const result = await db.query(
            `UPDATE "Club" SET 
             name=COALESCE($1, name), 
             description=COALESCE($2, description), 
             city=COALESCE($3, city), 
             country=COALESCE($4, country), 
             district=COALESCE($5, district), 
             domain=COALESCE($6, domain), 
             subdomain=COALESCE($7, subdomain),
             logo=COALESCE($8, logo), 
             "footerLogo"=COALESCE($9, "footerLogo"), 
             "endPolioLogo"=COALESCE($10, "endPolioLogo"), 
             favicon=COALESCE($11, favicon),
             status=COALESCE($12, status), 
             "updatedAt"=NOW()
             WHERE id=$13 RETURNING *`,
            params
        );

        // Vercel Auto-provision: If domain has changed or is being set
        const existingDomain = currentClub.rows[0].domain;
        if (domain && domain !== existingDomain) {
            await VercelService.addDomain(domain);
        }

        // Build settings map — all key-value pairs that go to the Settings table
        const settingsToUpdate = {
            'contact_email': email,
            'contact_phone': phone,
            'contact_address': address,
            'club_state': state,
            'social_links': socialLinks ? JSON.stringify(socialLinks) : undefined,
            'custom_social_links': customSocialLinks ? JSON.stringify(customSocialLinks) : undefined,
            'site_images': siteImages ? JSON.stringify(siteImages) : undefined,
            'gallery_images': galleryImages ? JSON.stringify(galleryImages) : undefined,
            'color_primary': primaryColor,
            'color_secondary': secondaryColor,
            'store_active': storeActive !== undefined ? String(storeActive) : undefined,
            'logo_header_size': logoHeaderSize !== undefined ? String(logoHeaderSize) : undefined,
            'member_count': memberCount,
            'module_projects': moduleProjects !== undefined ? String(moduleProjects) : undefined,
            'module_events': moduleEvents !== undefined ? String(moduleEvents) : undefined,
            'module_rotaract': moduleRotaract !== undefined ? String(moduleRotaract) : undefined,
            'module_interact': moduleInteract !== undefined ? String(moduleInteract) : undefined,
            'module_ecommerce': moduleEcommerce !== undefined ? String(moduleEcommerce) : undefined,
            'module_dian': moduleDian !== undefined ? String(moduleDian) : undefined,
            'module_youth_exchange': moduleYouthExchange !== undefined ? String(moduleYouthExchange) : undefined,
            'module_ngse': moduleNgse !== undefined ? String(moduleNgse) : undefined,
            'module_rotex': moduleRotex !== undefined ? String(moduleRotex) : undefined,
        };

        for (const [key, value] of Object.entries(settingsToUpdate)) {
            if (value !== undefined) {
                await db.query(
                    `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, NOW())
                     ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
                    [key, value.toString(), id]
                );
            }
        }

        if (useStripe !== undefined) {
            await prisma.paymentProviderConfig.upsert({
                where: { provider_clubId: { provider: 'stripe', clubId: id } },
                update: {
                    enabled: useStripe,
                    ...(stripePublicKey ? { publicKey: stripePublicKey } : {}),
                    ...(stripeSecretKey ? { secretRef: stripeSecretKey } : {})
                },
                create: {
                    provider: 'stripe',
                    enabled: useStripe,
                    publicKey: stripePublicKey || null,
                    secretRef: stripeSecretKey || null,
                    clubId: id
                }
            });
        }

        if (usePaypal !== undefined) {
            const paypalSettings = JSON.stringify({ sandbox: paypalSandbox !== false });
            await prisma.paymentProviderConfig.upsert({
                where: { provider_clubId: { provider: 'paypal', clubId: id } },
                update: {
                    enabled: usePaypal,
                    ...(paypalClientId ? { publicKey: paypalClientId } : {}),
                    ...(paypalSecretKey ? { secretRef: paypalSecretKey } : {}),
                    settings: paypalSettings
                },
                create: {
                    provider: 'paypal',
                    enabled: usePaypal,
                    publicKey: paypalClientId || null,
                    secretRef: paypalSecretKey || null,
                    settings: paypalSettings,
                    clubId: id
                }
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating club:', error);
        res.status(500).json({ error: 'Error updating club' });
    }
};

export const deleteClub = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM "Club" WHERE id = $1', [id]);
        res.json({ message: 'Club deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting club' });
    }
};

export const batchUpsertMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const { members } = req.body;
        
        if (req.user.role !== 'administrator' && req.user.clubId !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Delete old members and insert new ones
        await prisma.$transaction([
            prisma.clubMember.deleteMany({ where: { clubId: id } }),
            ...(members && members.length > 0 ? [
                prisma.clubMember.createMany({
                    data: members.map(m => ({
                        clubId: id,
                        name: m.name || 'Sin nombre',
                        image: m.image || null,
                        description: m.description || null,
                        isBoard: !!m.isBoard,
                        boardRole: m.boardRole || null
                    }))
                })
            ] : [])
        ]);
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Error in batchUpsertMembers:', error);
        res.status(500).json({ error: 'Error agregando socios' });
    }
};
