const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');

// Admin: Get users (Isolation: super_admin sees all, club_admin sees their club's users)
const getUsers = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;

        const where = {};
        if (clubId) {
            where.clubId = clubId;
        } else if (req.user.role !== 'administrator') {
            // If not super admin and no clubId, access denied
            return res.status(403).json({ error: 'Access denied' });
        }

        const users = await prisma.user.findMany({
            where,
            include: { club: { select: { name: true } } },
            orderBy: { createdAt: 'desc' }
        });

        // Don't send passwords
        const safeUsers = users.map(u => {
            const { password, ...safe } = u;
            return safe;
        });

        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching users' });
    }
};

const createUser = async (req, res) => {
    const { email, password, role, clubId } = req.body;
    try {
        // Validation
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ error: 'Email already exists' });

        let targetClubId = req.user.role === 'administrator' ? clubId : req.user.clubId;
        let targetRole = role || 'club_admin';

        // Security: club_admins can only create users for their club and cannot create super admins
        if (req.user.role !== 'administrator') {
            targetClubId = req.user.clubId;
            if (targetRole === 'administrator') targetRole = 'club_admin';
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role: targetRole,
                clubId: targetClubId
            }
        });

        const { password: _, ...safeUser } = user;
        res.status(201).json(safeUser);
    } catch (error) {
        res.status(500).json({ error: 'Error creating user' });
    }
};

const updateUser = async (req, res) => {
    const { id } = req.params;
    const { email, password, role, clubId } = req.body;
    try {
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'User not found' });

        // Security
        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const data = { email, role };

        if (req.user.role === 'administrator') {
            data.clubId = clubId;
        }

        if (password && password.trim() !== '') {
            data.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id },
            data
        });

        const { password: _, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ error: 'Error updating user' });
    }
};

const deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'User not found' });

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Don't delete self
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        await prisma.user.delete({ where: { id } });
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting user' });
    }
};

module.exports = {
    getUsers,
    createUser,
    updateUser,
    deleteUser
};
