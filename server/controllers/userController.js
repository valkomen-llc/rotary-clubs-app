import db from '../lib/db.js';
import bcrypt from 'bcryptjs';

export const getUsers = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        let queryText = `SELECT u.id, u.email, u.role, u."clubId", u."createdAt", u."updatedAt", c.name as "clubName"
                         FROM "User" u LEFT JOIN "Club" c ON u."clubId" = c.id`;
        const params = [];
        if (clubId) {
            params.push(clubId);
            queryText += ` WHERE u."clubId" = $1`;
        } else if (req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Access denied' });
        }
        queryText += ' ORDER BY u."createdAt" DESC';
        const result = await db.query(queryText, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching users' });
    }
};

export const createUser = async (req, res) => {
    const { email, password, role, clubId } = req.body;
    try {
        const existing = await db.query('SELECT id FROM "User" WHERE email = $1', [email]);
        if (existing.rows[0]) return res.status(400).json({ error: 'Email already exists' });

        let targetClubId = req.user.role === 'administrator' ? clubId : req.user.clubId;
        let targetRole = role || 'club_admin';
        if (req.user.role !== 'administrator') {
            targetClubId = req.user.clubId;
            if (targetRole === 'administrator') targetRole = 'club_admin';
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            `INSERT INTO "User" (id, email, password, role, "clubId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW()) RETURNING id, email, role, "clubId", "createdAt"`,
            [email, hashedPassword, targetRole, targetClubId]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error creating user' });
    }
};

export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { email, password, role, clubId } = req.body;
    try {
        const existing = await db.query('SELECT * FROM "User" WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'User not found' });
        if (req.user.role !== 'administrator' && existing.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        let newPassword = existing.rows[0].password;
        if (password && password.trim() !== '') {
            newPassword = await bcrypt.hash(password, 10);
        }

        const targetClubId = req.user.role === 'administrator' ? clubId : existing.rows[0].clubId;
        const result = await db.query(
            `UPDATE "User" SET email=$1, password=$2, role=$3, "clubId"=$4, "updatedAt"=NOW()
             WHERE id=$5 RETURNING id, email, role, "clubId", "updatedAt"`,
            [email, newPassword, role, targetClubId, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error updating user' });
    }
};

export const deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await db.query('SELECT * FROM "User" WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'User not found' });
        if (req.user.role !== 'administrator' && existing.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
        await db.query('DELETE FROM "User" WHERE id = $1', [id]);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting user' });
    }
};

export default { getUsers, createUser, updateUser, deleteUser };
