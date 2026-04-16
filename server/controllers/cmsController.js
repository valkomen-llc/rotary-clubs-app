import db from '../lib/db.js';

export const getSections = async (req, res) => {
    const { page, clubId } = req.query;
    try {
        let queryText = 'SELECT * FROM "ContentSection" WHERE 1=1';
        const params = [];
        if (page) { params.push(page); queryText += ` AND page = $${params.length}`; }
        if (req.user.role !== 'administrator') {
            params.push(req.user.clubId);
            queryText += ` AND "clubId" = $${params.length}`;
        } else if (clubId) {
            params.push(clubId);
            queryText += ` AND "clubId" = $${params.length}`;
        }
        const result = await db.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching sections' });
    }
};

export const updateSection = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    try {
        const existing = await db.query('SELECT * FROM "ContentSection" WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Section not found' });
        if (req.user.role !== 'administrator' && existing.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const result = await db.query(
            'UPDATE "ContentSection" SET content = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING *',
            [contentStr, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error updating section' });
    }
};

export const createSection = async (req, res) => {
    const { page, section, content, clubId } = req.body;
    try {
        const targetClubId = req.user.role === 'administrator' ? clubId : req.user.clubId;
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const result = await db.query(
            `INSERT INTO "ContentSection" (id, page, section, content, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW()) RETURNING *`,
            [page, section, contentStr, targetClubId]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error creating section' });
    }
};

export const getPublicSections = async (req, res) => {
    const { clubId } = req.params;
    const { page, clubId: queryClubId } = req.query;
    
    // Fallback to query param if not in URL params
    const targetClubId = clubId || queryClubId;

    try {
        if (!targetClubId) {
            // If no clubId provided, return platform defaults (global)
            const query = page 
                ? 'SELECT * FROM "ContentSection" WHERE "clubId" IS NULL AND page = $1'
                : 'SELECT * FROM "ContentSection" WHERE "clubId" IS NULL';
            const params = page ? [page] : [];
            const result = await db.query(query, params);
            return res.json(result.rows);
        }

        // 1. Fetch sections for the specific club
        let query = 'SELECT * FROM "ContentSection" WHERE "clubId" = $1';
        const params = [targetClubId];
        if (page) {
            query += ' AND page = $2';
            params.push(page);
        }
        const result = await db.query(query, params);

        // 2. If results found for THIS club, return them
        if (result.rows.length > 0) {
            return res.json(result.rows);
        }

        // 3. Fallback: If no results for this club, return platform defaults
        const defaultQuery = page 
            ? 'SELECT * FROM "ContentSection" WHERE "clubId" IS NULL AND page = $1'
            : 'SELECT * FROM "ContentSection" WHERE "clubId" IS NULL';
        const defaultParams = page ? [page] : [];
        const defaultResult = await db.query(defaultQuery, defaultParams);
        
        res.json(defaultResult.rows);
    } catch (err) {
        console.error('getPublicSections error:', err);
        res.status(500).json({ error: 'Error fetching sections' });
    }
};

export const batchUpsertSections = async (req, res) => {
    const { sections } = req.body;
    const clubId = req.user.role === 'administrator'
        ? (req.body.clubId || null)   // super admin: explicit null for global, or specific clubId
        : (req.user.clubId || req.body.clubId);
    if (!Array.isArray(sections)) return res.status(400).json({ error: 'Sections must be an array' });
    try {
        const results = [];
        for (const item of sections) {
            const { page, section, content } = item;
            const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

            if (clubId === null || clubId === undefined) {
                // NULL-safe upsert: ON CONFLICT doesn't fire when clubId IS NULL
                // (NULL != NULL in unique index semantics). Use DELETE + INSERT instead.
                await db.query(
                    `DELETE FROM "ContentSection" WHERE page = $1 AND section = $2 AND "clubId" IS NULL`,
                    [page, section]
                );
                const result = await db.query(
                    `INSERT INTO "ContentSection" (id, page, section, content, "clubId", "updatedAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, NULL, NOW()) RETURNING *`,
                    [page, section, contentStr]
                );
                results.push(result.rows[0]);
            } else {
                const result = await db.query(
                    `INSERT INTO "ContentSection" (id, page, section, content, "clubId", "updatedAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
                     ON CONFLICT (page, section, "clubId") DO UPDATE SET content = $3, "updatedAt" = NOW()
                     RETURNING *`,
                    [page, section, contentStr, clubId]
                );
                results.push(result.rows[0]);
            }
        }
        res.json(results);
    } catch (err) {
        console.error('Batch error:', err);
        res.status(500).json({ error: 'Error processing batch' });
    }
};

export default { getSections, getPublicSections, updateSection, createSection, batchUpsertSections };
