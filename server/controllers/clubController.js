import db from '../lib/db.js';
import VercelService from '../services/VercelService.js';
import prisma from '../lib/prisma.js'; // CLIENTE CENTRALIZADO (EVITA ERROR 500 POR CONEXIONES)

export const getAllClubs = async (req, res) => {
    try {
        const { type } = req.query;
        const condition = type ? `WHERE c.type = $1` : '';
        const params = type ? [type] : [];
        
        const result = await db.query(`
            SELECT c.*, 
                (SELECT COUNT(*) FROM "User" u WHERE u."clubId" = c.id) as "userCount",
                (SELECT COUNT(*) FROM "Project" p WHERE p."clubId" = c.id) as "projectCount",
                (SELECT COUNT(*) FROM "Post" po WHERE po."clubId" = c.id) as "postCount"
            FROM "Club" c ${condition} ORDER BY c."createdAt" DESC
        `, params);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching clubs' });
    }
};

export const getClubById = async (req, res) => {
    const { id } = req.params;
    try {
        // Access Control: Super Admin or Member of the entity
        const isDistrictAdmin = req.user.role === 'district_admin' && req.user.districtId === id;
        const isClubAdmin = (req.user.role === 'club_admin' || req.user.role === 'editor') && req.user.clubId === id;
        
        if (req.user.role !== 'administrator' && !isClubAdmin && !isDistrictAdmin) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // 1. Try Club
        let clubResult = await db.query('SELECT * FROM "Club" WHERE id = $1', [id]);
        let entity = clubResult.rows[0];
        let entityType = 'club';

        // 2. Try District if not a club
        if (!entity) {
            const districtResult = await db.query('SELECT * FROM "District" WHERE id = $1', [id]);
            entity = districtResult.rows[0];
            if (entity) {
                entityType = 'district';
                entity.type = 'district'; // Ensure type is present
            }
        }

        if (!entity) return res.status(404).json({ error: 'Entidad no encontrada' });

        const settingsResult = await db.query('SELECT * FROM "Setting" WHERE "clubId" = $1', [id]);
        const paymentConfigs = await prisma.paymentProviderConfig.findMany({ where: { clubId: id } });
        const membersResult = await db.query('SELECT id, name, image, description, "isBoard", "boardRole", position FROM "ClubMember" WHERE "clubId" = $1 ORDER BY position ASC, "createdAt" DESC', [id]);

        entity.settings = settingsResult.rows;
        entity.paymentConfigs = paymentConfigs;
        entity.members = membersResult.rows;

        // Map settings
        const settingsMap = {};
        settingsResult.rows.forEach(s => { settingsMap[s.key] = s.value; });
        
        // Modules (Compatibility layer)
        entity.modules = {
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
        
        entity.settings = settingsMap;
        
        if (settingsMap['club_archetype']) {
            try { entity.archetype = JSON.parse(settingsMap['club_archetype']); } catch(e) {}
        }

        res.json(entity);
    } catch (error) {
        console.error('getClubById Error:', error);
        res.status(500).json({ error: 'Error fetching entity' });
    }
};

export const createClub = async (req, res) => {
    const { 
        name, city, country, district, domain, subdomain, description, 
        status, type, adminUserId,
        subscriptionStatus, expirationDate,
        billingContactEmail, billingContactPhone,
        expirationBannerActive, expirationBannerMessage,
        developmentBannerActive, developmentBannerMessage
    } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO "Club" (id, name, city, country, district, domain, subdomain, description, status, type, "subscriptionStatus", "expirationDate", "billingContactEmail", "billingContactPhone", "expirationBannerActive", "expirationBannerMessage", "developmentBannerActive", "developmentBannerMessage", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()) RETURNING *`,
            [
                name, 
                city || null, 
                country || null, 
                district || null, 
                domain || null, 
                subdomain || null, 
                description || null, 
                status || 'active', 
                type || 'club',
                subscriptionStatus || 'inactive',
                expirationDate ? new Date(expirationDate) : null,
                billingContactEmail || null,
                billingContactPhone || null,
                !!expirationBannerActive,
                expirationBannerMessage || null,
                !!developmentBannerActive,
                developmentBannerMessage || null
            ]
        );

        const newClub = result.rows[0];

        if (domain) {
            await VercelService.addDomain(domain);
        }

        if (adminUserId) {
            // Unifica el clubId en el usuario y asegura que tenga un rol de administración (club_admin o administrator)
            await db.query(
                `UPDATE "User" SET "clubId" = $1 WHERE id = $2`,
                [newClub.id, adminUserId]
            );
        }

        res.status(201).json(newClub);
    } catch (error) {
        console.error('Error creating club:', error);
        res.status(500).json({ error: 'Error creating club: ' + (error.detail || error.message) });
    }
};

export const updateClub = async (req, res) => {
    const { id } = req.params;
    const {
        name, description, city, country, district, domain, subdomain, type,
        email, phone, address, state, facebook, instagram, twitter, youtube, linkedin, tiktok, 
        socialLinks, customSocialLinks, siteImages, galleryImages,
        primaryColor, secondaryColor, logo, footerLogo, endPolioLogo, rotaractLogo, interactLogo, youthExchangeLogo, favicon, status,
        stripePublicKey, stripeSecretKey, useStripe,
        usePaypal, paypalSandbox, paypalClientId, paypalSecretKey,
        storeActive, logoHeaderSize, autoGenerateCalendar, mapStyle,
        memberCount, moduleProjects, moduleEvents, moduleRotaract, moduleInteract, moduleEcommerce, moduleDian,
        moduleYouthExchange, moduleNgse, moduleRotex,
        expirationBannerActive, expirationBannerMessage,
        developmentBannerActive, developmentBannerMessage,
        subscriptionStatus, expirationDate,
        billingContactEmail, billingContactPhone
    } = req.body;

        try {
            // Access Control
            const isDistrictAdmin = req.user.role === 'district_admin' && req.user.districtId === id;
            const isClubAdmin = (req.user.role === 'club_admin' || req.user.role === 'editor') && req.user.clubId === id;
            
            if (req.user.role !== 'administrator' && !isClubAdmin && !isDistrictAdmin) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // 1. Try Club
            let currentResult = await db.query('SELECT * FROM "Club" WHERE id = $1', [id]);
            let entity = currentResult.rows[0];
            let tableName = 'Club';

            // 2. Try District
            if (!entity) {
                currentResult = await db.query('SELECT * FROM "District" WHERE id = $1', [id]);
                entity = currentResult.rows[0];
                if (entity) tableName = 'District';
            }

            if (!entity) return res.status(404).json({ error: 'Entidad no encontrada' });

            const updateFields = [];
            const params = [];
            let pIdx = 1;

            const addField = (fieldName, val) => {
                if (val !== undefined) {
                    updateFields.push(`"${fieldName}" = $${pIdx++}`);
                    params.push(val === '' ? null : val);
                }
            };

            addField('name', name);
            addField('description', description);
            addField('domain', domain);
            addField('subdomain', subdomain);
            addField('logo', logo);
            addField('footerLogo', footerLogo);
            addField('favicon', favicon);
            addField('subscriptionStatus', subscriptionStatus);
            addField('expirationDate', expirationDate ? new Date(expirationDate) : undefined);
            addField('billingContactEmail', billingContactEmail);
            addField('billingContactPhone', billingContactPhone);
            addField('expirationBannerActive', expirationBannerActive);
            addField('expirationBannerMessage', expirationBannerMessage);
            addField('developmentBannerActive', developmentBannerActive);
            addField('developmentBannerMessage', developmentBannerMessage);
            addField('logoHeaderSize', logoHeaderSize ? parseInt(logoHeaderSize) : undefined);

            // Special fields for Club
            if (tableName === 'Club') {
                addField('city', city);
                addField('country', country);
                addField('district', district);
                addField('type', type);
            } else {
                // Special fields for District (if we use the colors column)
                if (primaryColor || secondaryColor) {
                    const currentColors = typeof entity.colors === 'string' ? JSON.parse(entity.colors) : (entity.colors || {});
                    const newColors = {
                        primary: primaryColor || currentColors.primary || '#013388',
                        secondary: secondaryColor || currentColors.secondary || '#E29C00'
                    };
                    addField('colors', JSON.stringify(newColors));
                }
            }

            const hasUpdates = updateFields.length > 0;
            let result;

            if (hasUpdates) {
                updateFields.push(`"updatedAt" = NOW()`);
                params.push(id);
                const query = `UPDATE "${tableName}" SET ${updateFields.join(', ')} WHERE id = $${pIdx} RETURNING *`;
                result = await db.query(query, params);
            } else {
                result = await db.query(`UPDATE "${tableName}" SET "updatedAt" = NOW() WHERE id = $1 RETURNING *`, [id]);
            }

            // Vercel Auto-provision
            const existingDomain = entity.domain;
            if (domain && domain !== existingDomain) {
                await VercelService.addDomain(domain);
            }

            // Build settings map — all key-value pairs that go to the Settings table
            const settingsToUpdate = {
                'contact_email': email,
                'contact_phone': phone,
                'contact_address': address,
                'club_state': state,
                'social_facebook': facebook,
                'social_instagram': instagram,
                'social_twitter': twitter,
                'social_youtube': youtube,
                'social_linkedin': linkedin,
                'social_tiktok': tiktok,
                'social_links': socialLinks ? JSON.stringify(socialLinks) : undefined,
                'custom_social_links': customSocialLinks ? JSON.stringify(customSocialLinks) : undefined,
                'site_images': siteImages ? JSON.stringify(siteImages) : undefined,
                'gallery_images': galleryImages ? JSON.stringify(galleryImages) : undefined,
                'color_primary': primaryColor,
                'color_secondary': secondaryColor,
                'rotaract_logo': rotaractLogo,
                'interact_logo': interactLogo,
                'youth_exchange_logo': youthExchangeLogo,
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
                'auto_generate_calendar': autoGenerateCalendar !== undefined ? String(autoGenerateCalendar) : undefined,
                'map_style': mapStyle !== undefined ? String(mapStyle) : undefined,
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

        if (req.body.adminUserId) {
            await db.query(
                `UPDATE "User" SET "clubId" = $1 WHERE id = $2`,
                [id, req.body.adminUserId]
            );
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating club:', error);
        res.status(500).json({ error: 'Error updating club: ' + (error.detail || error.message) });
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
                        boardRole: m.boardRole || null,
                        position: m.position || 0
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
