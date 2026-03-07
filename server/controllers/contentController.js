const prisma = require('../lib/prisma');

// Public: Get posts for a specific club
const getPublicPosts = async (req, res) => {
    const { clubId } = req.params;
    const { limit } = req.query;
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
    const { clubId } = req.params;
    const { limit } = req.query;
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
            where: { clubId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching club posts' });
    }
};

const createPost = async (req, res) => {
    const {
        title, content, image, published, clubId,
        category, tags, keywords, seoTitle, seoDescription,
        videoUrl, images
    } = req.body;
    try {
        const targetClubId = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;

        const post = await prisma.post.create({
            data: {
                title, content, image, published: published || false, clubId: targetClubId,
                category, tags: tags || [], keywords, seoTitle, seoDescription,
                videoUrl, images: images || []
            }
        });
        res.status(201).json(post);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating post' });
    }
};

const updatePost = async (req, res) => {
    const { id } = req.params;
    const {
        title, content, image, published,
        category, tags, keywords, seoTitle, seoDescription,
        videoUrl, images
    } = req.body;
    try {
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Post not found' });

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const post = await prisma.post.update({
            where: { id },
            data: {
                title, content, image, published,
                category, tags, keywords, seoTitle, seoDescription,
                videoUrl, images
            }
        });
        res.json(post);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error updating post' });
    }
};

const deletePost = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Post not found' });

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await prisma.post.delete({ where: { id } });
        res.json({ message: 'Post deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting post' });
    }
};

const getClubProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });

        const projects = await prisma.project.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching club projects' });
    }
};

const createProject = async (req, res) => {
    const {
        title, description, image, status, clubId,
        category, meta, recaudado, donantes, beneficiarios,
        ubicacion, fechaEstimada, videoUrl, images,
        impacto, actualizaciones
    } = req.body;
    try {
        const targetClubId = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;

        const project = await prisma.project.create({
            data: {
                title, description, image, status: status || 'planned', clubId: targetClubId,
                category, meta, recaudado, donantes, beneficiarios,
                ubicacion, fechaEstimada: fechaEstimada ? new Date(fechaEstimada) : null,
                videoUrl, images: images || [],
                impacto, actualizaciones
            }
        });
        res.status(201).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating project' });
    }
};

const updateProject = async (req, res) => {
    const { id } = req.params;
    const {
        title, description, image, status,
        category, meta, recaudado, donantes, beneficiarios,
        ubicacion, fechaEstimada, videoUrl, images,
        impacto, actualizaciones
    } = req.body;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const project = await prisma.project.update({
            where: { id },
            data: {
                title, description, image, status,
                category, meta, recaudado, donantes, beneficiarios,
                ubicacion, fechaEstimada: fechaEstimada ? new Date(fechaEstimada) : null,
                videoUrl, images,
                impacto, actualizaciones
            }
        });
        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error updating project' });
    }
};

const deleteProject = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await prisma.project.delete({ where: { id } });
        res.json({ message: 'Project deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting project' });
    }
};

module.exports = {
    getPublicPosts,
    getPublicProjects,
    getClubPosts,
    createPost,
    updatePost,
    deletePost,
    getClubProjects,
    createProject,
    updateProject,
    deleteProject
};
