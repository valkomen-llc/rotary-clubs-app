import db from '../lib/db.js';

let bcrypt = null;
let jwt = null;

const getBcrypt = async () => {
    if (!bcrypt) { const m = await import('bcryptjs'); bcrypt = m.default; }
    return bcrypt;
};
const getJwt = async () => {
    if (!jwt) { const m = await import('jsonwebtoken'); jwt = m.default; }
    return jwt;
};

export const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db.query(
            `SELECT u.*, c.name as "clubName", c.subdomain as "clubSubdomain" 
             FROM "User" u LEFT JOIN "Club" c ON u."clubId" = c.id WHERE u.email = $1`,
            [email]
        );
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const bcryptLib = await getBcrypt();
        const isMatch = await bcryptLib.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        const jwtLib = await getJwt();
        const token = jwtLib.sign(
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
                clubId: user.clubId || null,
                club: user.clubId ? { id: user.clubId, name: user.clubName, subdomain: user.clubSubdomain } : null
            }
        });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

export const createInitialAdmin = async () => {
    try {
        const bcryptLib = await getBcrypt();
        let clubResult = await db.query('SELECT * FROM "Club" LIMIT 1');
        let club = clubResult.rows[0];

        if (!club) {
            const insertClub = await db.query(
                `INSERT INTO "Club" (id, name, city, country, district, domain, subdomain, status, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), 'Rotary Club Origen', 'Bogotá', 'Colombia', '4281', 'localhost', 'origen', 'active', NOW(), NOW())
                 RETURNING *`
            );
            club = insertClub.rows[0];
        }

        const superEmail = 'admin@rotary.org';
        const superPass = await bcryptLib.hash('admin123', 10);
        await db.query(
            `INSERT INTO "User" (id, email, password, role, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, 'administrator', NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET password = $2, role = 'administrator'`,
            [superEmail, superPass]
        );

        const clubEmail = 'club@rotary.org';
        const clubPass = await bcryptLib.hash('club123', 10);
        await db.query(
            `INSERT INTO "User" (id, email, password, role, "clubId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, 'club_admin', $3, NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET password = $2, role = 'club_admin', "clubId" = $3`,
            [clubEmail, clubPass, club.id]
        );

        console.log('Auth credentials ensured');
    } catch (err) {
        console.error('Initial setup error:', err.message);
    }
};

export const impersonate = async (req, res) => {
    try {
        const { targetId, type = 'club' } = req.body;
        
        // Ensure requester is an actual administrator
        if (req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Forbidden. Solo los super administradores pueden usar la simulación.' });
        }

        if (type === 'district') {
            const distResult = await db.query('SELECT id, name, subdomain, number FROM "District" WHERE id = $1', [targetId]);
            const district = distResult.rows[0];
            if (!district) return res.status(404).json({ error: 'Distrito no encontrado' });

            // Buscar si hay un Club espejo para el Distrito
            const clubRes = await db.query("SELECT id FROM \"Club\" WHERE type = 'district' AND district = $1 LIMIT 1", [String(district.number)]);
            const mirrorClubId = clubRes.rows[0]?.id || null;

            const jwtLib = await getJwt();
            const token = jwtLib.sign(
                { id: req.user.id, email: req.user.email, role: 'district_admin', districtId: district.id, clubId: mirrorClubId },
                process.env.JWT_SECRET || 'rotary_secret_key',
                { expiresIn: '3h' }
            );

            return res.json({
                token,
                user: {
                    id: req.user.id,
                    email: req.user.email,
                    role: 'district_admin',
                    districtId: district.id,
                    clubId: mirrorClubId,
                    district: { id: district.id, name: district.name, subdomain: district.subdomain }
                }
            });
        }

        // Validate the target club exists
        const clubResult = await db.query('SELECT id, name, subdomain FROM "Club" WHERE id = $1', [targetId]);
        const club = clubResult.rows[0];

        if (!club) {
            return res.status(404).json({ error: 'Club no encontrado' });
        }

        // Generate a synthetic token
        // Use the same user ID/Email but force role to 'club_admin' and assign the clubId
        const jwtLib = await getJwt();
        const token = jwtLib.sign(
            { id: req.user.id, email: req.user.email, role: 'club_admin', clubId: club.id },
            process.env.JWT_SECRET || 'rotary_secret_key',
            { expiresIn: '3h' }
        );

        res.json({
            token,
            user: {
                id: req.user.id,
                email: req.user.email,
                role: 'club_admin',
                clubId: club.id,
                club: { id: club.id, name: club.name, subdomain: club.subdomain }
            }
        });
    } catch (err) {
        console.error('Impersonate error:', err.message);
        res.status(500).json({ error: 'Server error al simular sesión' });
    }
};

export default { login, createInitialAdmin, impersonate };
