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
    const data = req.body;
    try {
        const club = await prisma.club.update({
            where: { id },
            data
        });
        res.json(club);
    } catch (error) {
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
