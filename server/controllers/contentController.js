const prisma = require('../lib/prisma');

// Public: Get posts for a specific club
const getPublicPosts = async (req, res) => {
    const { clubId, limit } = req.query;
    try {
        const posts = await prisma.post.findMany({
            where: {
                clubId: clubId,
                published: true
            },
            take: limit ? parseInt(limit) : undefined,
            orderBy: { createdAt: 'desc' }
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching posts' });
    }
};

// Public: Get projects for a specific club
const getPublicProjects = async (req, res) => {
    const { clubId, limit } = req.query;
    try {
        const projects = await prisma.project.findMany({
            where: {
                clubId: clubId
            },
            take: limit ? parseInt(limit) : undefined,
            orderBy: { createdAt: 'desc' }
        });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching projects' });
    }
};

// Admin: Manage club content (Isolation handled by user.clubId)
const getClubPosts = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });

        const posts = await prisma.post.findMany({
            where: { clubId }
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching club posts' });
    }
};

module.exports = {
    getPublicPosts,
    getPublicProjects,
    getClubPosts
};
