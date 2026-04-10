import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';
import VercelService from '../services/VercelService.js';
import bcrypt from 'bcryptjs';

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
    const { number, name, governor, governorEmail, countries, website, subdomain, domain, description, status, adminUserId } = req.body;
    if (!number || !name) return res.status(400).json({ error: 'Número y nombre son requeridos' });

    try {
        const result = await db.query(
            `INSERT INTO "District" (id, number, name, governor, "governorEmail", countries, website, subdomain, domain, description, status, "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             RETURNING *`,
            [number, name, governor || null, governorEmail || null,
             countries || [], website || null, subdomain || null, domain || null,
             description || null, status || 'active']
        );
        const district = result.rows[0];

        // 🟢 FIX: Create a mirror/shadow 'Club' for the district so it can use the website CMS platform correctly
        let mirrorClubId = null;
        try {
            const clubResult = await db.query(
                `INSERT INTO "Club" (id, name, type, district, domain, subdomain, status, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), $1, 'district', $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
                [`Distrito ${number}`, String(number), domain || null, subdomain || null, status || 'active']
            );
            mirrorClubId = clubResult.rows[0].id;
        } catch (e) {
            console.warn('⚠️ Error creating shadow club for district:', e.message);
        }

        // Auto-provisionar dominio en Vercel si se ha especificado
        if (domain) {
            const vercelResult = await VercelService.addDomain(domain);
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
    const { number, name, governor, governorEmail, countries, website, subdomain, domain, description, status } = req.body;

    try {
        // Obtener dominio actual para comparar
        const current = await db.query('SELECT domain FROM "District" WHERE id = $1', [id]);
        const currentDomain = current.rows[0]?.domain;

        const result = await db.query(
            `UPDATE "District"
             SET number = $1, name = $2, governor = $3, "governorEmail" = $4,
                 countries = $5, website = $6, subdomain = $7, domain = $8,
                 description = $9, status = $10, "updatedAt" = NOW()
             WHERE id = $11
             RETURNING *`,
            [number, name, governor || null, governorEmail || null,
             countries || [], website || null, subdomain || null, domain || null,
             description || null, status || 'active', id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Distrito no encontrado' });

        // Auto-provisionar en Vercel si el dominio cambió o es nuevo
        if (domain && domain !== currentDomain) {
            const vercelResult = await VercelService.addDomain(domain);
            if (vercelResult.success) {
                console.log(`✅ Dominio del distrito ${domain} registrado en Vercel`);
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
        const dist = await db.query('SELECT domain, subdomain FROM "District" WHERE id = $1', [id]);
        if (!dist.rows[0]) return res.status(404).json({ error: 'Distrito no encontrado' });

        const { domain } = dist.rows[0];
        if (!domain) return res.json({ domain: null, status: 'no_domain', message: 'No hay dominio configurado' });

        const vercelStatus = await VercelService.verifyDomain(domain);
        res.json({
            domain,
            status: vercelStatus.success ? 'verified' : 'pending',
            vercel: vercelStatus.data || null,
            message: vercelStatus.success
                ? '✅ Dominio verificado y activo'
                : '⏳ Pendiente — Revisa la configuración DNS',
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
