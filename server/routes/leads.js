import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';
import EmailService from '../services/EmailService.js';

const prisma = new PrismaClient();
const router = express.Router();

// ── Auto-create Lead table if it doesn't exist ────────────────────────────
const ensureTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS "Lead" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId" TEXT REFERENCES "Club"(id),
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            subject VARCHAR(255),
            message TEXT,
            source VARCHAR(50) DEFAULT 'contact_form',
            status VARCHAR(30) DEFAULT 'new',
            notes TEXT,
            metadata JSONB DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_lead_club ON "Lead" ("clubId", "createdAt" DESC);
        CREATE INDEX IF NOT EXISTS idx_lead_status ON "Lead" (status);
    `);
    // Add metadata column if table already existed without it
    await db.query(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`).catch(() => { });
};
ensureTable().catch(err => console.error('Lead table init:', err.message));

// ── PUBLIC: Submit a lead from contact form (no auth needed) ──────────────
router.post('/submit', async (req, res) => {
    try {
        const { name, email, phone, subject, message, clubId, source, metadata } = req.body;
        if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

        const result = await db.query(
            `INSERT INTO "Lead" (name, email, phone, subject, message, "clubId", source, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, name, email, "createdAt"`,
            [name, email, phone || null, subject || null, message || null, clubId || null, source || 'contact_form', JSON.stringify(metadata || {})]
        );

        // --- TRANSACTIONS EMAIL HOOK --- //
        if (clubId) {
            try {
                // Get Club Data for branding
                const club = await prisma.club.findUnique({ where: { id: clubId } });
                if (club) {
                    const primaryColor = club.colors?.primary || '#0B223F';
                    
                    // 1. Email to the Citizen/Lead
                    const leadHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 12px;">
                        ${club.logo ? `<img src="${club.logo}" alt="${club.name}" style="height: 50px; margin-bottom: 20px;" />` : ''}
                        <h2 style="color: ${primaryColor}; margin-top: 0;">¡Hola ${name}!</h2>
                        <p style="color: #444; font-size: 16px; line-height: 1.5;">Gracias por ponerte en contacto con <strong>${club.name}</strong>.</p>
                        <p style="color: #444; font-size: 16px; line-height: 1.5;">Hemos registrado tu solicitud de soporte o voluntariado de forma exitosa. Nuestro equipo ejecutivo y la presidencia del club revisarán tus datos y se pondrán en contacto contigo a la brevedad posible.</p>
                        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
                        <p style="font-size: 12px; color: #888; text-align: center;">Este es un mensaje automático de Rotary ClubPlatform. Por favor no respondas directamente a este correo.</p>
                    </div>`;

                    await EmailService.sendEmail({
                        clubId,
                        to: email,
                        subject: `Hemos recibido tu solicitud | ${club.name}`,
                        html: leadHtml
                    });

                    // 2. Email Alert to the Club Administrators
                    const adminEmails = await prisma.user.findMany({ 
                        where: { clubId, role: 'administrator' },
                        select: { email: true, id: true }
                    });

                    if (adminEmails.length > 0) {
                        const adminHtml = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <h2 style="color: #0B223F; margin-top: 0;">🚨 Nuevo Lead / Formulario Web</h2>
                            <p style="color: #444; font-size: 15px;">Se acaba de registrar un nuevo Lead en tu portal de ClubPlatform a través del formulario de <strong>${source}</strong>.</p>
                            
                            <div style="background-color: #fff; padding: 20px; border-radius: 8px; border: 1px solid #eee; margin: 20px 0;">
                                <p style="margin: 0 0 10px 0; color: #222;"><strong>Nombre:</strong> ${name}</p>
                                <p style="margin: 0 0 10px 0; color: #222;"><strong>Email:</strong> ${email}</p>
                                <p style="margin: 0 0 10px 0; color: #222;"><strong>Teléfono:</strong> ${phone || 'N/A'}</p>
                                <p style="margin: 0 0 10px 0; color: #222;"><strong>Asunto:</strong> ${subject || 'N/A'}</p>
                                <p style="margin: 15px 0 0 0; color: #555; font-style: italic;">"${message || 'Sin mensaje adicional'}"</p>
                            </div>
                            
                            <a href="https://app.clubplatform.org/#/admin/leads" style="display:inline-block; padding: 12px 24px; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Gestionar en el CRM de Leads</a>
                        </div>`;

                        for (const admin of adminEmails) {
                            await EmailService.sendEmail({
                                clubId,
                                to: admin.email,
                                subject: `🔔 Nuevo Lead Web: ${name}`,
                                html: adminHtml,
                                userId: admin.id
                            });
                        }
                    }
                }
            } catch (emailError) {
                console.error('[Leads] Error dispatching transactional emails:', emailError);
                // Proceder sin fallar la petición HTTP, ya que el lead sí se guardó en BD.
            }
        }
        // --- END TRANSACTIONS EMAIL HOOK --- //

        res.status(201).json({ success: true, lead: result.rows[0] });
    } catch (error) {
        console.error('Lead submit error:', error);
        res.status(500).json({ error: 'Error saving lead' });
    }
});

// ── ADMIN: List leads for the club (or all for super admin) ───────────────
router.get('/', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const status = req.query.status;
        const search = req.query.search;

        let where = [];
        let params = [];
        let idx = 1;

        if (clubId) {
            where.push(`"clubId" = $${idx++}`);
            params.push(clubId);
        }
        if (status && status !== 'all') {
            where.push(`status = $${idx++}`);
            params.push(status);
        }
        if (search) {
            where.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
            params.push(`%${search}%`);
            idx++;
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const result = await db.query(
            `SELECT * FROM "Lead" ${whereClause} ORDER BY "createdAt" DESC LIMIT 200`,
            params
        );

        // Also return counts by status
        const countsWhere = clubId ? `WHERE "clubId" = $1` : '';
        const countsParams = clubId ? [clubId] : [];
        const counts = await db.query(
            `SELECT status, COUNT(*) as count FROM "Lead" ${countsWhere} GROUP BY status`,
            countsParams
        );

        const totalResult = await db.query(
            `SELECT COUNT(*) FROM "Lead" ${countsWhere}`,
            countsParams
        );

        res.json({
            leads: result.rows,
            total: parseInt(totalResult.rows[0].count),
            statusCounts: counts.rows.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }), {}),
        });
    } catch (error) {
        console.error('Lead list error:', error);
        res.status(500).json({ error: 'Error fetching leads' });
    }
});

// ── ADMIN: Update lead status or add notes ────────────────────────────────
router.patch('/:id', authMiddleware, async (req, res) => {
    try {
        const { status, notes } = req.body;
        const updates = [];
        const params = [];
        let idx = 1;

        if (status) { updates.push(`status = $${idx++}`); params.push(status); }
        if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
        updates.push(`"updatedAt" = NOW()`);

        params.push(req.params.id);
        const result = await db.query(
            `UPDATE "Lead" SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            params
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Lead update error:', error);
        res.status(500).json({ error: 'Error updating lead' });
    }
});

// ── ADMIN: Delete a lead ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await db.query(`DELETE FROM "Lead" WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Lead delete error:', error);
        res.status(500).json({ error: 'Error deleting lead' });
    }
});

export default router;
