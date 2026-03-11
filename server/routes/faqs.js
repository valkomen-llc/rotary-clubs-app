import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Auto-create FAQ table ─────────────────────────────────────────────────
const ensureTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS "FAQ" (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "clubId" UUID REFERENCES "Club"(id),
            question VARCHAR(500) NOT NULL,
            answer TEXT NOT NULL,
            "order" INT DEFAULT 0,
            active BOOLEAN DEFAULT true,
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_faq_club ON "FAQ" ("clubId", "order");
    `);
};
ensureTable().catch(err => console.error('FAQ table init:', err.message));

// ── PUBLIC: Get FAQs for a club ───────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { clubId } = req.query;
        let query = `SELECT * FROM "FAQ" WHERE active = true`;
        const params = [];

        if (clubId) {
            query += ` AND "clubId" = $1`;
            params.push(clubId);
        }
        query += ` ORDER BY "order" ASC, "createdAt" ASC`;

        const result = await db.query(query, params);
        res.json({ faqs: result.rows });
    } catch (error) {
        console.error('FAQ list error:', error);
        res.json({ faqs: [] });
    }
});

// ── ADMIN: Create FAQ ─────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { question, answer, clubId, order } = req.body;
        if (!question || !answer) return res.status(400).json({ error: 'question and answer are required' });

        const result = await db.query(
            `INSERT INTO "FAQ" (question, answer, "clubId", "order")
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [question, answer, clubId || null, order || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('FAQ create error:', error);
        res.status(500).json({ error: 'Error creating FAQ' });
    }
});

// ── ADMIN: Update FAQ ─────────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { question, answer, order, active } = req.body;
        const result = await db.query(
            `UPDATE "FAQ"
             SET question = COALESCE($1, question),
                 answer = COALESCE($2, answer),
                 "order" = COALESCE($3, "order"),
                 active = COALESCE($4, active),
                 "updatedAt" = NOW()
             WHERE id = $5
             RETURNING *`,
            [question, answer, order, active, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'FAQ not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('FAQ update error:', error);
        res.status(500).json({ error: 'Error updating FAQ' });
    }
});

// ── ADMIN: Delete FAQ ─────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await db.query(`DELETE FROM "FAQ" WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('FAQ delete error:', error);
        res.status(500).json({ error: 'Error deleting FAQ' });
    }
});

export default router;
