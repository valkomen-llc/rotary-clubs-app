import db from '../lib/db.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Public: Get posts for a specific club
export const getPublicPosts = async (req, res) => {
    const { clubId } = req.params;
    const { limit } = req.query;
    try {
        const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';
        const result = await db.query(
            `SELECT * FROM "Post" WHERE ("clubId" = $1 OR "clubId" IS NULL) AND published = true
             ORDER BY "createdAt" DESC ${limitClause}`,
            [clubId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching posts' });
    }
};

// Public: Get a single post by ID
export const getPublicPostById = async (req, res) => {
    const { clubId, postId } = req.params;
    try {
        const result = await db.query(
            `SELECT * FROM "Post" WHERE id = $1 AND ("clubId" = $2 OR "clubId" IS NULL) AND published = true`,
            [postId, clubId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Noticia no encontrada' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({ error: 'Error fetching post' });
    }
};

// Public: Get projects for a specific club
export const getPublicProjects = async (req, res) => {
    const { clubId } = req.params;
    const { limit } = req.query;
    try {
        const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';
        const result = await db.query(
            `SELECT * FROM "Project" WHERE "clubId" = $1 AND ("deletedAt" IS NULL)
             ORDER BY "createdAt" DESC ${limitClause}`,
            [clubId]
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching projects' });
    }
};

// Public: Get a single project by ID
export const getPublicProjectById = async (req, res) => {
    const { clubId, projectId } = req.params;
    try {
        const result = await db.query(
            `SELECT p.*, 
                    COALESCE(SUM(d.amount), 0) as "realRecaudado",
                    COUNT(DISTINCT d.id) as "realDonantes"
             FROM "Project" p
             LEFT JOIN "Donation" d ON d."projectId" = p.id AND d.status = 'completed'
             WHERE p.id = $1 AND p."clubId" = $2 AND p."deletedAt" IS NULL
             GROUP BY p.id`,
            [projectId, clubId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }
        res.set('Cache-Control', 'no-store');
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Error fetching project' });
    }
};

// Admin: Get posts
export const getClubPosts = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });
        
        // Solo incluimos noticias globales (NULL) si eres super admin, 
        // o si eres editor (permitido para Rotary Latir) para que puedan administrarlas y verlas.
        const query = (req.user.role === 'administrator' || req.user.role === 'editor')
            ? `SELECT * FROM "Post" WHERE "clubId" = $1 OR "clubId" IS NULL ORDER BY "createdAt" DESC`
            : `SELECT * FROM "Post" WHERE "clubId" = $1 ORDER BY "createdAt" DESC`;

        const result = await db.query(query, [clubId]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching club posts' });
    }
};

export const createPost = async (req, res) => {
    const { title, content, image, published, clubId, category, tags, keywords, seoTitle, seoDescription, videoUrl, images, isAI } = req.body;
    try {
        let targetClubId = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;
        if (clubId === 'global' && req.user.role === 'administrator') targetClubId = null;

        const result = await db.query(
            `INSERT INTO "Post" (id, title, content, image, published, "clubId", category, tags, keywords, "seoTitle", "seoDescription", "videoUrl", images, "isAI", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) RETURNING *`,
            [title, content, image, published || false, targetClubId, category, tags || [], keywords, seoTitle, seoDescription, videoUrl, images || [], isAI || false]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating post' });
    }
};

export const updatePost = async (req, res) => {
    const { id } = req.params;
    const { title, content, image, published, category, tags, keywords, seoTitle, seoDescription, videoUrl, images } = req.body;
    try {
        const existing = await db.query('SELECT * FROM "Post" WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Post not found' });
        if (req.user.role !== 'administrator' && existing.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const result = await db.query(
            `UPDATE "Post" SET title=$1, content=$2, image=$3, published=$4, category=$5, tags=$6, keywords=$7,
             "seoTitle"=$8, "seoDescription"=$9, "videoUrl"=$10, images=$11, "updatedAt"=NOW()
             WHERE id=$12 RETURNING *`,
            [title, content, image, published, category, tags, keywords, seoTitle, seoDescription, videoUrl, images, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error updating post' });
    }
};

export const deletePost = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await db.query('SELECT * FROM "Post" WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Post not found' });
        if (req.user.role !== 'administrator' && existing.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await db.query('DELETE FROM "Post" WHERE id = $1', [id]);
        res.json({ message: 'Post deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting post' });
    }
};

// Bulk delete posts
export const bulkDeletePosts = async (req, res) => {
    const { ids } = req.body;
    try {
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] required' });
        
        await prisma.post.deleteMany({
            where: {
                id: { in: ids },
                ...(req.user.role !== 'administrator' ? { clubId: req.user.clubId } : {})
            }
        });
        
        res.json({ message: `${ids.length} posts deleted` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error bulk deleting posts' });
    }
};

export const getClubProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator'
            ? (req.query.clubId || null)
            : req.user.clubId;

        // Super admin sin clubId específico: retorna todos los proyectos
        const whereClause = clubId
            ? { clubId, deletedAt: null }
            : { deletedAt: null };

        const projects = await prisma.project.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: { club: { select: { id: true, name: true, subdomain: true } } }
        });
        res.set('Cache-Control', 'no-store');
        res.json(projects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching club projects' });
    }
};

// Papelera: proyectos con soft-delete
export const getTrashedProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });

        const projects = await prisma.project.findMany({
            where: { clubId, deletedAt: { not: null } },
            orderBy: { deletedAt: 'desc' }
        });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching trashed projects' });
    }
};

export const createProject = async (req, res) => {
    const { title, description, image, status, clubId, category, meta, recaudado, donantes, beneficiarios, ubicacion, fechaEstimada, videoUrl, images, impacto, actualizaciones } = req.body;
    try {
        const targetClubId = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;

        const project = await prisma.project.create({
            data: {
                title,
                description,
                image,
                status: status || 'planned',
                clubId: targetClubId,
                category,
                meta: meta ? parseFloat(meta) : 0,
                recaudado: recaudado ? parseFloat(recaudado) : 0,
                donantes: donantes ? parseInt(donantes) : 0,
                beneficiarios: beneficiarios ? parseInt(beneficiarios) : 0,
                ubicacion,
                fechaEstimada: fechaEstimada ? new Date(fechaEstimada) : null,
                videoUrl,
                images: images || [],
                impacto,
                actualizaciones
            }
        });
        res.set('Cache-Control', 'no-store');
        res.status(201).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating project' });
    }
};

export const updateProject = async (req, res) => {
    const { id } = req.params;
    const { title, description, image, status, category, meta, recaudado, donantes, beneficiarios, ubicacion, fechaEstimada, videoUrl, images, impacto, actualizaciones } = req.body;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const project = await prisma.project.update({
            where: { id },
            data: {
                title,
                description,
                image,
                status,
                category,
                meta: meta ? parseFloat(meta) : 0,
                recaudado: recaudado ? parseFloat(recaudado) : 0,
                donantes: donantes ? parseInt(donantes) : 0,
                beneficiarios: beneficiarios ? parseInt(beneficiarios) : 0,
                ubicacion,
                fechaEstimada: fechaEstimada ? new Date(fechaEstimada) : null,
                videoUrl,
                images: images || [],
                impacto,
                actualizaciones
            }
        });
        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error updating project' });
    }
};

// Soft delete (mover a papelera)
export const deleteProject = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });
        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
        res.json({ message: 'Project moved to trash' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error deleting project' });
    }
};

// Bulk soft-delete
export const bulkDeleteProjects = async (req, res) => {
    const { ids } = req.body; // array of UUIDs
    try {
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] required' });
        await prisma.project.updateMany({
            where: {
                id: { in: ids },
                ...(req.user.role !== 'administrator' ? { clubId: req.user.clubId } : {})
            },
            data: { deletedAt: new Date() }
        });
        res.json({ message: `${ids.length} projects moved to trash` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error bulk deleting projects' });
    }
};

// Restaurar desde papelera
export const restoreProject = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });
        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await prisma.project.update({ where: { id }, data: { deletedAt: null } });
        res.json({ message: 'Project restored' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error restoring project' });
    }
};

// Borrado permanente (desde papelera)
export const permanentDeleteProject = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });
        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await prisma.project.delete({ where: { id } });
        res.json({ message: 'Project permanently deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error permanently deleting project' });
    }
};

export const getClubAgentContext = async (req, res) => {
    const { clubId } = req.params;
    try {
        const club = await db.query('SELECT * FROM "Club" WHERE id = $1', [clubId]);
        if (!club.rows[0]) return res.status(404).json({ error: 'Club not found' });
        const projects = await db.query(
            'SELECT title, description, category, status, ubicacion, impacto FROM "Project" WHERE "clubId" = $1',
            [clubId]
        );
        const posts = await db.query(
            'SELECT title, category FROM "Post" WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT 5',
            [clubId]
        );
        const c = club.rows[0];
        res.json({
            clubName: c.name,
            location: `${c.city || ''}, ${c.country || ''}`,
            district: c.district,
            description: c.description,
            recentProjects: projects.rows,
            lastPostTitles: posts.rows.map(p => p.title)
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching AI context' });
    }
};

// ─── TESTIMONIOS ───────────────────────────────────────────────────────────

export const getTestimonials = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator'
            ? (req.query.clubId || null)
            : req.user.clubId;
        const where = clubId
            ? { clubId, deletedAt: null }
            : { deletedAt: null };
        const testimonials = await prisma.testimonial.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { club: { select: { id: true, name: true } } }
        });
        res.json(testimonials);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error fetching testimonials' });
    }
};

export const getPublicTestimonials = async (req, res) => {
    try {
        const { clubId } = req.params;
        const testimonials = await prisma.testimonial.findMany({
            where: { clubId, deletedAt: null },
            orderBy: { createdAt: 'asc' }
        });
        res.json(testimonials);
    } catch (e) {
        res.status(500).json({ error: 'Error fetching testimonials' });
    }
};

export const createTestimonial = async (req, res) => {
    try {
        const { name, role, text, image, clubId: bodyClubId } = req.body;
        const clubId = req.user.role === 'administrator'
            ? (bodyClubId || req.user.clubId)
            : req.user.clubId;
        if (!clubId || !name || !text) return res.status(400).json({ error: 'Faltan campos: clubId, name, text' });
        const t = await prisma.testimonial.create({
            data: { clubId, name, role: role || '', text, image: image || null }
        });
        res.status(201).json(t);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error creating testimonial' });
    }
};

export const updateTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, text, image } = req.body;
        const t = await prisma.testimonial.update({
            where: { id },
            data: { name, role, text, image: image || null, updatedAt: new Date() }
        });
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: 'Error updating testimonial' });
    }
};

export const deleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.testimonial.update({ where: { id }, data: { deletedAt: new Date() } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error deleting testimonial' });
    }
};

export const permanentDeleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.testimonial.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error permanent deleting testimonial' });
    }
};

// Public: Get comments for a post
export const getPostComments = async (req, res) => {
    const { postId } = req.params;
    try {
        const comments = await prisma.comment.findMany({
            where: { postId, approved: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(comments);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching comments' });
    }
};

// Public: Create a comment
export const createPostComment = async (req, res) => {
    const { postId } = req.params;
    const { firstName, lastName, email, phone, country, rating, text } = req.body;
    try {
        const comment = await prisma.comment.create({
            data: {
                postId,
                firstName,
                lastName,
                email,
                phone,
                country,
                rating: parseInt(rating) || 5,
                text,
                approved: true // Auto-approve for now
            }
        });
        res.status(201).json(comment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating comment' });
    }
};

export default {
    getPublicPosts, getPublicPostById, getPublicProjects, getPublicProjectById, getClubPosts, createPost, updatePost, deletePost, bulkDeletePosts,
    getClubProjects, getTrashedProjects, createProject, updateProject,
    deleteProject, bulkDeleteProjects, restoreProject, permanentDeleteProject,
    getTestimonials, getPublicTestimonials, createTestimonial, updateTestimonial,
    deleteTestimonial, permanentDeleteTestimonial,
    getClubAgentContext, getPostComments, createPostComment
};
