import express from 'express';
import db from '../lib/db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { getSections, updateSection, createSection, batchUpsertSections } from '../controllers/cmsController.js';
import { getAllClubs, getClubById, createClub, updateClub, deleteClub } from '../controllers/clubController.js';
import {
    getClubPosts, createPost, updatePost, deletePost,
    getClubProjects, getTrashedProjects, createProject, updateProject, deleteProject,
    bulkDeleteProjects, restoreProject, permanentDeleteProject,
    getClubAgentContext
} from '../controllers/contentController.js';
import {
    getUsers, createUser, updateUser, deleteUser
} from '../controllers/userController.js';

const router = express.Router();

// All admin routes are protected
router.use(authMiddleware);

// --- DASHBOARD STATS ---
router.get('/stats', async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const whereClub = clubId ? `WHERE "clubId" = $1` : '';
        const params = clubId ? [clubId] : [];

        const [users, posts, projects, media, publications, knowledge, clubInfo, platformPaymentsSum, payoutRequestsSum, activeClubsCount, donationsSum, products] = await Promise.all([
            db.query(`SELECT COUNT(*) FROM "User" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Post" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Project" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Media" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Publication" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "KnowledgeSource" WHERE "clubId" = $1 OR "clubId" IS NULL`, clubId ? [clubId] : [null]),
            clubId ? db.query('SELECT name, city, country, domain, subdomain FROM "Club" WHERE id = $1', [clubId]) : Promise.resolve({ rows: [] }),
            db.query(`SELECT SUM("netAmount") FROM "Payment" WHERE "isPlatformCollection" = true AND status = 'succeeded' ${clubId ? `AND "clubId" = $1` : ''}`, params),
            db.query(`SELECT SUM(amount) FROM "PayoutRequest" WHERE status IN ('pending', 'processing', 'completed') ${clubId ? `AND "clubId" = $1` : ''}`, params),
            db.query(`SELECT COUNT(*) FROM "Club" WHERE status = 'active'`),
            db.query(`SELECT SUM(amount) FROM "Donation" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Product" ${whereClub}`, params),
        ]);

        // Lead table may not exist yet on first deploy
        let leadsCount = 0;
        try {
            const lr = await db.query(`SELECT COUNT(*) FROM "Lead" ${whereClub}`, params);
            leadsCount = parseInt(lr.rows[0].count);
        } catch { /* table not created yet */ }

        const club = clubInfo.rows[0];
        const totalCollected = parseFloat(platformPaymentsSum.rows[0]?.sum || 0);
        const totalRequested = parseFloat(payoutRequestsSum.rows[0]?.sum || 0);
        const availableFunds = Math.max(0, totalCollected - totalRequested);
        const donations = parseFloat(donationsSum.rows[0]?.sum || 0);

        res.json({
            users: parseInt(users.rows[0].count),
            posts: parseInt(posts.rows[0].count),
            projects: parseInt(projects.rows[0].count),
            media: parseInt(media.rows[0].count),
            publications: parseInt(publications.rows[0].count),
            knowledgeSources: parseInt(knowledge.rows[0].count),
            clubName: club?.name || 'Panel Global',
            clubCity: club?.city || '',
            clubCountry: club?.country || '',
            clubDomain: club?.domain || club?.subdomain || '',
            availableFunds,
            activeClubs: parseInt(activeClubsCount.rows[0].count),
            donations,
            products: parseInt(products.rows[0].count),
            leads: leadsCount,
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Error fetching stats' });
    }
});

// --- SUPER ADMIN ROUTES ---
const superAdminOnly = roleMiddleware(['administrator']);

router.get('/clubs', superAdminOnly, getAllClubs);
router.post('/clubs', superAdminOnly, createClub);
router.delete('/clubs/:id', superAdminOnly, deleteClub);
router.get('/clubs/:clubId/agent-context', roleMiddleware(['administrator', 'club_admin']), getClubAgentContext);

// --- CLUB ADMIN & SUPER ADMIN ROUTES ---
const adminRoles = ['administrator', 'club_admin'];

router.get('/clubs/:id', roleMiddleware(adminRoles), getClubById);
router.put('/clubs/:id', roleMiddleware(adminRoles), updateClub);

router.get('/users', roleMiddleware(adminRoles), getUsers);
router.post('/users', roleMiddleware(adminRoles), createUser);
router.put('/users/:id', roleMiddleware(adminRoles), updateUser);
router.delete('/users/:id', roleMiddleware(adminRoles), deleteUser);

router.get('/sections', roleMiddleware(adminRoles), getSections);
router.post('/sections', roleMiddleware(adminRoles), createSection);
router.post('/sections/batch-upsert', roleMiddleware(adminRoles), batchUpsertSections);
router.put('/sections/:id', roleMiddleware(adminRoles), updateSection);

router.get('/posts', roleMiddleware(adminRoles), getClubPosts);
router.post('/posts', roleMiddleware(adminRoles), createPost);
router.put('/posts/:id', roleMiddleware(adminRoles), updatePost);
router.delete('/posts/:id', roleMiddleware(adminRoles), deletePost);

router.get('/projects', roleMiddleware(adminRoles), getClubProjects);
router.post('/projects', roleMiddleware(adminRoles), createProject);

// Rutas específicas PRIMERO (antes de /:id para evitar que Express las trate como parámetros)
router.get('/projects/trash', roleMiddleware(adminRoles), getTrashedProjects);
router.post('/projects/bulk-delete', roleMiddleware(adminRoles), bulkDeleteProjects);

// Rutas con parámetro dinámico
router.put('/projects/:id', roleMiddleware(adminRoles), updateProject);
router.delete('/projects/:id', roleMiddleware(adminRoles), deleteProject);          // soft-delete → papelera
router.put('/projects/:id/restore', roleMiddleware(adminRoles), restoreProject);
router.delete('/projects/:id/permanent', roleMiddleware(adminRoles), permanentDeleteProject); // borrado real

// --- PUBLISH / UNPUBLISH CLUB SITE ---
router.patch('/clubs/:id/publish', roleMiddleware(adminRoles), async (req, res) => {
    try {
        const clubId = req.params.id;
        // Club admins can only publish their own club
        if (req.user.role !== 'administrator' && req.user.clubId !== clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await db.query(`UPDATE "Club" SET status = 'active', "updatedAt" = NOW() WHERE id = $1`, [clubId]);
        res.json({ ok: true, status: 'active' });
    } catch (error) {
        res.status(500).json({ error: 'Error al publicar' });
    }
});

router.patch('/clubs/:id/unpublish', roleMiddleware(adminRoles), async (req, res) => {
    try {
        const clubId = req.params.id;
        if (req.user.role !== 'administrator' && req.user.clubId !== clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await db.query(`UPDATE "Club" SET status = 'draft', "updatedAt" = NOW() WHERE id = $1`, [clubId]);
        res.json({ ok: true, status: 'draft' });
    } catch (error) {
        res.status(500).json({ error: 'Error al despublicar' });
    }
});

// AI processing (mocked)
router.post('/ai/process-document', roleMiddleware(adminRoles), async (req, res) => {
    res.json({
        sections: [
            { page: 'quienes-somos', section: 'intro', content: { quote: "Desde nuestra fundación, hemos creído que el servicio es el puente que une a las personas y transforma comunidades." } },
            { page: 'quienes-somos', section: 'main', content: { description: "Nuestro club se distingue por proyectos educativos.", highlight: "Construyendo esperanza.", items: ["Becas escolares", "Dotación de bibliotecas"] } },
            { page: 'nuestra-historia', section: 'header', content: { title: "Décadas de Servicio Local", subtitle: "Un legado que comenzó en el corazón de nuestra ciudad." } },
            { page: 'interact', section: 'intro', content: { text: "En nuestro club Interact, los jóvenes no solo aprenden a servir, aprenden a liderar." } }
        ]
    });
});

export default router;
