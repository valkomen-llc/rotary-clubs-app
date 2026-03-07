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
    try {
        // 1. Ensure a default club exists for testing
        let club = await prisma.club.findFirst();
        if (!club) {
            club = await prisma.club.create({
                data: {
                    name: 'Rotary Club Origen',
                    city: 'Bogotá',
                    country: 'Colombia',
                    district: '4281',
                    domain: 'localhost',
                    subdomain: 'origen',
                    status: 'active'
                }
            });
            console.log('Default club created');
        }

        // 2. Simplified Super Admin
        const superEmail = 'admin@rotary.org';
        const superPass = 'admin123';
        const hashedSuper = await bcrypt.hash(superPass, 10);

        await prisma.user.upsert({
            where: { email: superEmail },
            update: { password: hashedSuper, role: 'administrator' },
            create: {
                email: superEmail,
                password: hashedSuper,
                role: 'administrator'
            }
        });

        // 3. Simplified Club Admin
        const clubEmail = 'club@rotary.org';
        const clubPass = 'club123';
        const hashedClub = await bcrypt.hash(clubPass, 10);

        await prisma.user.upsert({
            where: { email: clubEmail },
            update: {
                password: hashedClub,
                role: 'club_admin',
                clubId: club.id
            },
            create: {
                email: clubEmail,
                password: hashedClub,
                role: 'club_admin',
                clubId: club.id
            }
        });

        console.log('Auth credentials ensured for testing');
    } catch (err) {
        console.error('Initial setup error:', err);
    }
};

module.exports = { login, createInitialAdmin };
