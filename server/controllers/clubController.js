const prisma = require('../lib/prisma');

const getAllClubs = async (req, res) => {
    try {
        const clubs = await prisma.club.findMany({
            include: {
                _count: {
                    select: { users: true, projects: true, posts: true }
                }
            }
        });
        res.json(clubs);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching clubs' });
    }
};

const createClub = async (req, res) => {
    const { name, city, country, district, domain, subdomain, description } = req.body;
    try {
        const club = await prisma.club.create({
            data: { name, city, country, district, domain, subdomain, description }
        });
        res.status(201).json(club);
    } catch (error) {
        res.status(500).json({ error: 'Error creating club' });
    }
};

const updateClub = async (req, res) => {
    const { id } = req.params;
    const {
        name, description, city, country, district, domain, subdomain,
        email, phone, address,
        facebook, instagram, twitter, youtube,
        primaryColor, secondaryColor, logo, footerLogo, endPolioLogo
    } = req.body;

    try {
        // Isolation check: only super admin or the club's own admin can edit
        if (req.user.role !== 'administrator' && req.user.clubId !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // 1. Update main club info
        const club = await prisma.club.update({
            where: { id },
            data: {
                name, description, city, country, district, domain, subdomain, logo, footerLogo, endPolioLogo
            }
        });

        // 2. Update/Upsert settings
        const settingsToUpdate = {
            'contact_email': email,
            'contact_phone': phone,
            'contact_address': address,
            'social_facebook': facebook,
            'social_instagram': instagram,
            'social_twitter': twitter,
            'social_youtube': youtube,
            'color_primary': primaryColor,
            'color_secondary': secondaryColor
        };

        for (const [key, value] of Object.entries(settingsToUpdate)) {
            if (value !== undefined) {
                await prisma.setting.upsert({
                    where: { key_clubId: { key, clubId: id } },
                    update: { value: value.toString() },
                    create: { key, value: value.toString(), clubId: id }
                });
            }
        }

        res.json(club);
    } catch (error) {
        console.error('Error updating club:', error);
        res.status(500).json({ error: 'Error updating club' });
    }
};

const deleteClub = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.club.delete({ where: { id } });
        res.json({ message: 'Club deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting club' });
    }
};

module.exports = {
    getAllClubs,
    createClub,
    updateClub,
    deleteClub
};
