const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { club: true }
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, clubId: user.clubId },
            process.env.JWT_SECRET || 'rotary_secret_key',
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                club: user.club
            },
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

const createInitialAdmin = async () => {
    const adminEmail = 'admin@rotary-platform.org';
    const adminPassword = 'RotaryAdmin2026!';

    try {
        const existingAdmin = await prisma.user.findUnique({
            where: { email: adminEmail },
        });

        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await prisma.user.create({
                data: {
                    email: adminEmail,
                    password: hashedPassword,
                    role: 'administrator',
                },
            });
            console.log('Initial admin user created');
        }
    } catch (err) {
        console.error('Error creating initial admin:', err);
    }
};

module.exports = { login, createInitialAdmin };
