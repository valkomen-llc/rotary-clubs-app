import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';
import VercelService from '../services/VercelService.js';
import bcrypt from 'bcryptjs';
import { canonicalDomain } from '../lib/domains.js';
import { DISTRICT_SITE_SQL, districtSiteParams, pickDistrictSite } from '../lib/districtSite.js';

const router = express.Router();

const superAdminOnly = (req, res, next) => {
    if (req.user?.role !== 'administrator') {
        return res.status(403).json({ error: 'Solo el super administrador puede acceder.' });
    }
    next();
};

// ── GET /api/admin/districts — lista todos los distritos con conteo de clubes
router.get('/', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT d.*,
                   COUNT(DISTINCT c.id)::int  AS "clubCount",
                   COUNT(DISTINCT u.id)::int  AS "adminCount"
            FROM "District" d
            LEFT JOIN "Club" c ON c."districtId" = d.id
            LEFT JOIN "User" u ON u."districtId" = d.id
            GROUP BY d.id
            ORDER BY d.number ASC
        `);
        res.set('Cache-Control', 'no-store');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching districts:', error);
        res.status(500).json({ error: 'Error al obtener distritos' });
    }
});

// ── GET /api/admin/districts/:id — detalle con clubes y admins
router.get('/:id', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const [distResult, clubsResult, adminsResult] = await Promise.all([
            db.query('SELECT * FROM "District" WHERE id = $1', [id]),
            db.query(
                'SELECT id, name, city, country, subdomain, domain, status FROM "Club" WHERE "districtId" = $1 ORDER BY name',
                [id]
            ),
            db.query(
                'SELECT id, email, role, "createdAt" FROM "User" WHERE "districtId" = $1 ORDER BY "createdAt" DESC',
                [id]
            ),
        ]);
        if (distResult.rows.length === 0) return res.status(404).json({ error: 'Distrito no encontrado' });
        res.set('Cache-Control', 'no-store');
        res.json({ ...distResult.rows[0], clubs: clubsResult.rows, admins: adminsResult.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener distrito' });
    }
});

// ── POST /api/admin/districts — crear nuevo distrito
router.post('/', authMiddleware, superAdminOnly, async (req, res) => {
    const { 
        number, name, governor, governorEmail, countries, website, 
        subdomain, domain, description, status, adminUserId,
        subscriptionStatus, expirationDate, billingContactEmail, billingContactPhone 
    } = req.body;
    if (!number || !name) return res.status(400).json({ error: 'Número y nombre son requeridos' });

    // Se guarda en la forma canónica, igual que el alta de un sitio: lo que uno
    // pega desde la barra del navegador trae `https://` y barra final, y así no
    // coincide con nada al resolver la visita (v4.743).
    const cleanDomain = canonicalDomain(domain) || null;

    try {
        const result = await db.query(
            `INSERT INTO "District" (
                id, number, name, governor, "governorEmail", countries, website, 
                subdomain, domain, description, status, "updatedAt",
                "subscriptionStatus", "expirationDate", "billingContactEmail", "billingContactPhone"
             )
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, $13, $14)
             RETURNING *`,
            [
                number, name, governor || null, governorEmail || null,
                countries || [], website || null, subdomain || null, cleanDomain,
                description || null, status || 'active',
                subscriptionStatus || 'active', expirationDate || null,
                billingContactEmail || null, billingContactPhone || null
            ]
        );
        const district = result.rows[0];

        // El SITIO del distrito: la fila de `Club` donde vive su configuración.
        // El registro de `District` es administrativo y no tiene ajustes, así
        // que sin esta fila el distrito no tendría web (ver districtSite.js).
        //
        // NO se le copia el dominio: vive en la fila de `District`, que es donde
        // lo escribe este panel y donde lo lee la provisión en Vercel, y
        // `by-domain` atraviesa desde ahí hasta este sitio. Con el dominio en
        // las dos filas —y las dos columnas son ÚNICAS— cambiarlo en una dejaba
        // la otra apuntando al valor viejo, que seguía resolviendo.
        let mirrorClubId = null;
        try {
            const clubResult = await db.query(
                `INSERT INTO "Club" (id, name, type, district, "districtId", subdomain, status, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), $1, 'district', $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
                [`Distrito ${number}`, String(number), district.id, subdomain || null, status || 'active']
            );
            mirrorClubId = clubResult.rows[0].id;
        } catch (e) {
            console.warn('⚠️ Error creating shadow club for district:', e.message);
        }

        // Auto-provisionar dominio en Vercel si se ha especificado
        if (cleanDomain) {
            const vercelResult = await VercelService.addDomain(cleanDomain);
            if (!vercelResult.success) {
                console.warn(`⚠️ Vercel domain provision for district: ${vercelResult.error}`);
            }
        }

        if (adminUserId) {
            // Asignar el administrador al distrito y opcionalmente al club espejo
            await db.query(
                `UPDATE "User" SET "districtId" = $1, "clubId" = $2 WHERE id = $3`,
                [district.id, mirrorClubId, adminUserId]
            );
        }

        res.set('Cache-Control', 'no-store');
        res.status(201).json(district);
    } catch (error) {
        console.error('Error creating district:', error);
        res.status(500).json({ error: 'Error al crear distrito' });
    }
});

// ── PUT /api/admin/districts/:id — actualizar distrito
router.put('/:id', authMiddleware, superAdminOnly, async (req, res) => {
    const { id } = req.params;
    const { 
        number, name, governor, governorEmail, countries, website, 
        subdomain, domain, description, status,
        subscriptionStatus, expirationDate, billingContactEmail, billingContactPhone 
    } = req.body;

    // Misma forma canónica que en el alta y que en la resolución de la visita.
    const cleanDomain = canonicalDomain(domain) || null;

    try {
        // Obtener dominio actual para comparar
        const current = await db.query('SELECT domain FROM "District" WHERE id = $1', [id]);
        const currentDomain = current.rows[0]?.domain;

        const result = await db.query(
            `UPDATE "District"
             SET number = $1, name = $2, governor = $3, "governorEmail" = $4,
                 countries = $5, website = $6, subdomain = $7, domain = $8,
                 description = $9, status = $10, 
                 "subscriptionStatus" = $11, "expirationDate" = $12, 
                 "billingContactEmail" = $13, "billingContactPhone" = $14,
                 "updatedAt" = NOW()
             WHERE id = $15
             RETURNING *`,
            [
                number, name, governor || null, governorEmail || null,
                countries || [], website || null, subdomain || null, cleanDomain,
                description || null, status || 'active',
                subscriptionStatus || 'active', expirationDate || null,
                billingContactEmail || null, billingContactPhone || null,
                id
            ]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Distrito no encontrado' });

        // Auto-provisionar en Vercel si el dominio cambió o es nuevo
        if (cleanDomain && cleanDomain !== canonicalDomain(currentDomain)) {
            const vercelResult = await VercelService.addDomain(cleanDomain);
            if (vercelResult.success) {
                console.log(`✅ Dominio del distrito ${cleanDomain} registrado en Vercel`);
            } else {
                console.warn(`⚠️ Vercel error: ${vercelResult.error}`);
            }
        }

        if (req.body.adminUserId) {
            await db.query(
                `UPDATE "User" SET "districtId" = $1 WHERE id = $2`,
                [id, req.body.adminUserId]
            );
        }

        res.set('Cache-Control', 'no-store');
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar distrito' });
    }
});

// ── GET /api/admin/districts/:id/domain-status — verificar DNS del dominio
router.get('/:id/domain-status', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const dist = await db.query('SELECT domain, subdomain, number FROM "District" WHERE id = $1', [id]);
        if (!dist.rows[0]) return res.status(404).json({ error: 'Distrito no encontrado' });

        const { domain } = dist.rows[0];
        if (!domain) return res.json({ domain: null, status: 'no_domain', message: 'No hay dominio configurado' });

        const vercelStatus = await VercelService.verifyDomain(domain);

        // El DNS y el CONTENIDO son dos cosas distintas, y confundirlas es lo
        // que dejó al Distrito 4281 con un «✅ verificado» sobre un sitio en
        // blanco: el dominio apuntaba bien a la plataforma y la plataforma no
        // tenía qué servir, porque el distrito no tenía su fila de sitio o la
        // que tenía estaba sin configurar. Se responden por separado.
        // La MISMA consulta y el MISMO criterio que usa `by-domain`: con una
        // copia propia, este panel acabaría afirmando de un sitio distinto del
        // que se sirve, que es justo lo que no puede pasar en un diagnóstico.
        const district = { id, ...dist.rows[0] };
        const candidates = await db.query(DISTRICT_SITE_SQL, districtSiteParams(district));
        const siteRow = pickDistrictSite(district, candidates.rows);

        res.json({
            domain,
            status: vercelStatus.success ? 'verified' : 'pending',
            vercel: vercelStatus.data || null,
            message: vercelStatus.success
                ? '✅ Dominio verificado y activo'
                : '⏳ Pendiente — Revisa la configuración DNS',
            site: siteRow
                ? { id: siteRow.id, name: siteRow.name, settingsCount: siteRow.settingsCount }
                : null,
            siteMessage: !siteRow
                ? 'El distrito no tiene un sitio propio: quien visite el dominio verá una página sin contenido. '
                  + 'Un sitio de distrito tiene que ser del tipo «Distrito Rotario» y llevar el número del distrito; '
                  + 'pertenecer al distrito no alcanza, porque eso lo cumplen todos sus clubes. '
                  + 'También sirve escribir acá arriba el subdominio de plataforma del sitio del distrito.'
                : siteRow.settingsCount === 0
                    ? `El dominio lleva al sitio «${siteRow.name}», que todavía no tiene ninguna configuración cargada.`
                    : `El dominio lleva al sitio «${siteRow.name}».`,
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al verificar dominio' });
    }
});

// ── POST /api/admin/districts/:id/provision-domain — registrar dominio en Vercel manualmente
router.post('/:id/provision-domain', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const dist = await db.query('SELECT domain FROM "District" WHERE id = $1', [id]);
        const domain = dist.rows[0]?.domain;
        if (!domain) return res.status(400).json({ error: 'El distrito no tiene dominio configurado' });

        const result = await VercelService.addDomain(domain);
        res.json({
            success: result.success,
            domain,
            message: result.success
                ? `✅ Dominio ${domain} registrado en Vercel`
                : `⚠️ ${result.error}`,
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al provisionar dominio' });
    }
});

// ── PATCH /api/admin/districts/:id/assign-club — asignar club al distrito
router.patch('/:id/assign-club', authMiddleware, superAdminOnly, async (req, res) => {
    const { id } = req.params;
    const { clubId } = req.body;
    if (!clubId) return res.status(400).json({ error: 'clubId es requerido' });
    try {
        await db.query('UPDATE "Club" SET "districtId" = $1, "updatedAt" = NOW() WHERE id = $2', [id, clubId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al asignar club' });
    }
});

// ── GET /api/admin/districts/:id/admins — listar admins del distrito
router.get('/:id/admins', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, email, role, "createdAt" FROM "User"
             WHERE "districtId" = $1 ORDER BY "createdAt" DESC`,
            [req.params.id]
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener administradores' });
    }
});

// ── POST /api/admin/districts/:id/admins — crear admin del distrito
router.post('/:id/admins', authMiddleware, superAdminOnly, async (req, res) => {
    const { id } = req.params;
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

    try {
        // Verificar que no exista
        const exists = await db.query('SELECT id FROM "User" WHERE email = $1', [email]);
        if (exists.rows.length > 0) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

        // Intentar buscar si este distrito tiene un "Club Sombra" de tipo district
        const districtRow = await db.query('SELECT number FROM "District" WHERE id = $1', [id]);
        const dNumber = districtRow.rows[0]?.number;
        let mirrorClubId = null;
        if (dNumber) {
            const cRow = await db.query("SELECT id FROM \"Club\" WHERE type = 'district' AND district = $1 LIMIT 1", [String(dNumber)]);
            mirrorClubId = cRow.rows[0]?.id || null;
        }

        const hash = await bcrypt.hash(password, 10);
        const result = await db.query(
            `INSERT INTO "User" (id, email, password, role, "districtId", "clubId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, 'district_admin', $3, $4, NOW(), NOW())
             RETURNING id, email, role, "createdAt"`,
            [email, hash, id, mirrorClubId]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating district admin:', error);
        res.status(500).json({ error: 'Error al crear administrador' });
    }
});

// ── DELETE /api/admin/districts/:id/admins/:userId — eliminar admin del distrito
router.delete('/:id/admins/:userId', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM "User" WHERE id = $1 AND "districtId" = $2', [req.params.userId, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar administrador' });
    }
});

// ── DELETE /api/admin/districts/:id — eliminar distrito
router.delete('/:id', authMiddleware, superAdminOnly, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE "Club" SET "districtId" = NULL WHERE "districtId" = $1', [id]);
        await db.query('UPDATE "User" SET "districtId" = NULL WHERE "districtId" = $1', [id]);
        await db.query('DELETE FROM "District" WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar distrito' });
    }
});

export default router;
