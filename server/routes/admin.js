const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { getSections, updateSection, createSection, batchUpsertSections } = require('../controllers/cmsController');
const { getAllClubs, getClubById, createClub, updateClub, deleteClub } = require('../controllers/clubController');
const {
    getClubPosts, createPost, updatePost, deletePost,
    getClubProjects, createProject, updateProject, deleteProject,
    getClubAgentContext
} = require('../controllers/contentController');

const {
    getUsers, createUser, updateUser, deleteUser
} = require('../controllers/userController');

// All admin routes are protected
router.use(authMiddleware);

// --- SUPER ADMIN ROUTES ---
const superAdminOnly = roleMiddleware(['administrator']);

router.get('/clubs', superAdminOnly, getAllClubs);
router.post('/clubs', superAdminOnly, createClub);
router.delete('/clubs/:id', superAdminOnly, deleteClub);
router.get('/clubs/:clubId/agent-context', roleMiddleware(['administrator', 'club_admin']), getClubAgentContext);

// --- CLUB ADMIN & SUPER ADMIN ROUTES ---
const adminRoles = ['administrator', 'club_admin'];

// Club profile management
router.get('/clubs/:id', roleMiddleware(adminRoles), getClubById);
router.put('/clubs/:id', roleMiddleware(adminRoles), updateClub);

// Users management
router.get('/users', roleMiddleware(adminRoles), getUsers);
router.post('/users', roleMiddleware(adminRoles), createUser);
router.put('/users/:id', roleMiddleware(adminRoles), updateUser);
router.delete('/users/:id', roleMiddleware(adminRoles), deleteUser);

// CMS Content management
router.get('/sections', roleMiddleware(adminRoles), getSections);
router.post('/sections', roleMiddleware(adminRoles), createSection);
router.post('/sections/batch-upsert', roleMiddleware(adminRoles), batchUpsertSections);
router.put('/sections/:id', roleMiddleware(adminRoles), updateSection);

// Posts management
router.get('/posts', roleMiddleware(adminRoles), getClubPosts);
router.post('/posts', roleMiddleware(adminRoles), createPost);
router.put('/posts/:id', roleMiddleware(adminRoles), updatePost);
router.delete('/posts/:id', roleMiddleware(adminRoles), deletePost);

// Projects management
router.get('/projects', roleMiddleware(adminRoles), getClubProjects);
router.post('/projects', roleMiddleware(adminRoles), createProject);
router.put('/projects/:id', roleMiddleware(adminRoles), updateProject);
router.delete('/projects/:id', roleMiddleware(adminRoles), deleteProject);

// AI processing (mocked for now, will integrate with n8n)
router.post('/ai/process-document', roleMiddleware(adminRoles), async (req, res) => {
    const { clubId } = req.body;
    // Mocked response simulating a professional "Strategist Agent"
    res.json({
        sections: [
            // Page: Quienes Somos
            {
                page: 'quienes-somos',
                section: 'intro',
                content: {
                    quote: "Desde nuestra fundación, hemos creído que el servicio es el puente que une a las personas y transforma comunidades."
                }
            },
            {
                page: 'quienes-somos',
                section: 'main',
                content: {
                    description: "Nuestro club se distingue por proyectos educativos que han beneficiado a cientos de niños en sectores vulnerables.",
                    highlight: "Construyendo esperanza a través de la acción rotaria.",
                    items: ["Becas escolares", "Dotación de bibliotecas", "Talleres de liderazgo"]
                }
            },
            // Page: Nuestra Historia
            {
                page: 'nuestra-historia',
                section: 'header',
                content: {
                    title: "Décadas de Servicio Local",
                    subtitle: "Un legado que comenzó en el corazón de nuestra ciudad."
                }
            },
            {
                page: 'nuestra-historia',
                section: 'local',
                content: {
                    title: "Nuestra llegada a la comunidad",
                    content: "El club fue fundado por un grupo de líderes visionarios que decidieron traer la antorcha de Rotary para iluminar los desafíos locales."
                }
            },
            // Page: Interact
            {
                page: 'interact',
                section: 'intro',
                content: {
                    text: "En nuestro club Interact, los jóvenes no solo aprenden a servir, aprenden a liderar el cambio que el mundo necesita."
                }
            }
        ]
    });
});

module.exports = router;
