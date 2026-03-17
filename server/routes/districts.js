import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Middleware: solo super admin
const superAdminOnly = (req, res, next) => {
    if (req.user?.role !== 'administrator') {
        return res.status(403).json({ error: 'Solo el super administrador puede acceder a esta sección.' });
    }
    next();
};

// GET /api/admin/districts — lista todos los distritos con conteo de clubes
router.get('/', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT d.*,
                   COUNT(DISTINCT c.id) AS "clubCount"
            FROM "District" d
            LEFT JOIN "Club" c ON c."districtId" = d.id
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

// GET /api/admin/districts/:id — detalle de un distrito con sus clubes
router.get('/:id', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const distResult = await db.query('SELECT * FROM "District" WHERE id = $1', [id]);
        if (distResult.rows.length === 0) return res.status(404).json({ error: 'Distrito no encontrado' });

        const clubsResult = await db.query(
            'SELECT id, name, city, country, subdomain, domain, status FROM "Club" WHERE "districtId" = $1 ORDER BY name',
            [id]
        );
        res.set('Cache-Control', 'no-store');
        res.json({ ...distResult.rows[0], clubs: clubsResult.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener distrito' });
    }
});

// POST /api/admin/districts — crear un nuevo distrito
router.post('/', authMiddleware, superAdminOnly, async (req, res) => {
    const { number, name, governor, governorEmail, countries, website, subdomain, domain, description, status } = req.body;
    if (!number || !name) return res.status(400).json({ error: 'Número y nombre son requeridos' });

    try {
        const result = await db.query(
            `INSERT INTO "District" (number, name, governor, "governorEmail", countries, website, subdomain, domain, description, status, "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             RETURNING *`,
            [number, name, governor || null, governorEmail || null,
             countries || [], website || null, subdomain || null, domain || null,
             description || null, status || 'active']
        );
        res.set('Cache-Control', 'no-store');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating district:', error);
        res.status(500).json({ error: 'Error al crear distrito' });
    }
});

// PUT /api/admin/districts/:id — actualizar distrito
router.put('/:id', authMiddleware, superAdminOnly, async (req, res) => {
    const { id } = req.params;
    const { number, name, governor, governorEmail, countries, website, subdomain, domain, description, status } = req.body;

    try {
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
        res.set('Cache-Control', 'no-store');
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar distrito' });
    }
});

// PATCH /api/admin/districts/:id/assign-club — asignar un club a este distrito
router.patch('/:id/assign-club', authMiddleware, superAdminOnly, async (req, res) => {
    const { id } = req.params;
    const { clubId } = req.body;
    if (!clubId) return res.status(400).json({ error: 'clubId es requerido' });

    try {
        await db.query('UPDATE "Club" SET "districtId" = $1, "updatedAt" = NOW() WHERE id = $2', [id, clubId]);
        res.json({ success: true, message: 'Club asignado al distrito' });
    } catch (error) {
        res.status(500).json({ error: 'Error al asignar club' });
    }
});

// DELETE /api/admin/districts/:id — eliminar distrito
router.delete('/:id', authMiddleware, superAdminOnly, async (req, res) => {
    const { id } = req.params;
    try {
        // Desasociar clubes antes de eliminar
        await db.query('UPDATE "Club" SET "districtId" = NULL WHERE "districtId" = $1', [id]);
        await db.query('DELETE FROM "District" WHERE id = $1', [id]);
        res.json({ success: true, message: 'Distrito eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar distrito' });
    }
});

export default router;
