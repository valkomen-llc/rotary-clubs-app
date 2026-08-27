import express from 'express';
import db from '../lib/db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
// ⚠️ EL ROL DE SIEMPRE **O** EL PERMISO (v4.941). Es lo que abre una ruta de
// contenido a un usuario institucional sin tocar a nadie más: quien pasa hoy
// por su rol sigue pasando, y quien no está en la lista entra por su permiso.
// Y se declara POR ACCIÓN: leer no puede abrir la puerta de borrar.
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
import { getSections, updateSection, createSection, batchUpsertSections } from '../controllers/cmsController.js';
import { getAllClubs, getClubById, createClub, updateClub, deleteClub, batchUpsertMembers } from '../controllers/clubController.js';
import {
    getClubPosts, createPost, updatePost, deletePost, bulkDeletePosts, reconcilePosts,
    getPublications, createPublication, updatePublication, deletePublication,
    getClubProjects, getTrashedProjects, createProject, updateProject, deleteProject,
    bulkDeleteProjects, restoreProject, permanentDeleteProject,
    getTestimonials, createTestimonial, updateTestimonial, deleteTestimonial, permanentDeleteTestimonial,
    getClubAgentContext
} from '../controllers/contentController.js';
import {
    getUsers, createUser, updateUser, deleteUser
} from '../controllers/userController.js';
import { getWalletStats, getPools } from '../controllers/crowdfundController.js';
import { getPhases, evaluateClubActivation } from '../services/activationService.js';
import prisma from '../lib/prisma.js'; // IMPORTACIÓN CRÍTICA PARA EL DASHBOARD
import { sumByCurrency, subtractByCurrency, currenciesOf, primaryCurrency } from '../lib/money.js';
import { siteCurrency } from '../lib/clubCurrency.js';

const router = express.Router();

// All admin routes are protected
router.use(authMiddleware);

router.get('/crowdfund/wallet', getWalletStats);

// --- DASHBOARD STATS ---
router.get('/stats', async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        const whereClub = clubId ? `WHERE "clubId" = $1` : '';
        const params = clubId ? [clubId] : [];

        const results = await Promise.all([
            db.query(`SELECT COUNT(*) FROM "User" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Post" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Project" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Media" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "Publication" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "KnowledgeSource" WHERE "clubId" = $1 OR "clubId" IS NULL`, clubId ? [clubId] : [null]),
            clubId ? db.query('SELECT name, city, country, domain, subdomain FROM "Club" WHERE id = $1', [clubId]) : Promise.resolve({ rows: [] }),
            // v4.843 — POR MONEDA. Hasta v4.842 estos tres eran un `SUM` sin
            // `GROUP BY currency` y de ahí salían los dos números de la barra
            // superior: «$50,010» eran 10 dólares más 50.000 pesos, y
            // «$47,507.75», 8,91 más 47.498,84. La Bóveda ya se había
            // corregido; esta consulta es otra y seguía mezclando.
            db.query(`SELECT currency, SUM("netAmount") AS total FROM "Payment" WHERE "isPlatformCollection" = true AND status = 'succeeded' ${clubId ? `AND "clubId" = $1` : ''} GROUP BY currency`, params),
            db.query(`SELECT currency, SUM(amount) AS total FROM "PayoutRequest" WHERE status IN ('pending', 'processing', 'completed') ${clubId ? `AND "clubId" = $1` : ''} GROUP BY currency`, params),
            db.query(`SELECT COUNT(*) FROM "Club" WHERE status = 'active'`),
            db.query(`SELECT currency, SUM(amount) AS total FROM "Donation" ${whereClub} GROUP BY currency`, params),
            db.query(`SELECT COUNT(*) FROM "Product" ${whereClub}`, params),
            db.query(`SELECT COUNT(*) FROM "ClubDocument" ${whereClub}`, params),
            // v4.863 — LO QUE HA COMISIONADO LA PLATAFORMA, por moneda.
            //
            // Es un dato de la INFRAESTRUCTURA, no de un sitio: sale sin filtro
            // de club porque la pregunta es «¿cuánto ha ganado Club Platform?»,
            // y sólo se consulta para el operador. Un administrador de sitio no
            // tiene por qué ver la utilidad de la plataforma, así que ni
            // siquiera se calcula — no es que se esconda en la pantalla.
            //
            // ⚠️ Es `applicationFee`, la retención NUESTRA. No confundirla con
            // la tarifa de Stripe, que es del procesador y no es un ingreso.
            req.user.role === 'administrator'
                ? db.query(`SELECT currency, SUM("applicationFee") AS total FROM "Payment"
                             WHERE "isPlatformCollection" = true AND status = 'succeeded'
                             GROUP BY currency`)
                : Promise.resolve({ rows: [] }),
        ]);

        const [users, posts, projects, media, publications, knowledge, clubInfo, platformPaymentsSum, payoutRequestsSum, activeClubsCount, donationsSum, products, documents, platformRevenueSum] = results;

        // Lead table may not exist yet on first deploy
        let leadsCount = 0;
        try {
            const lr = await db.query(`SELECT COUNT(*) FROM "Lead" ${whereClub}`, params);
            leadsCount = parseInt(lr.rows[0].count);
        } catch { /* table not created yet */ }

        const club = clubInfo.rows[0];

        // v4.843 — Los importes viajan POR MONEDA. Los campos sueltos se
        // conservan sobre la moneda principal —nunca sobre la mezcla— para que
        // un navegador con el bundle anterior en caché muestre una cifra
        // verdadera de una sola moneda en vez de la suma de todas. Es el mismo
        // criterio que `/payouts/balance` desde v4.841.
        const porMoneda = (rows) => sumByCurrency(rows, r => r.total, r => r.currency);

        const collected = porMoneda(platformPaymentsSum.rows);
        const requested = porMoneda(payoutRequestsSum.rows);
        const donated = porMoneda(donationsSum.rows);

        const disponible = {};
        for (const [c, v] of Object.entries(subtractByCurrency(collected, requested))) {
            disponible[c] = Math.max(0, v);
        }

        // La moneda que se muestra primero: la del sitio. Sin `clubId` —el
        // panel global del operador— no hay sitio del que deducirla, y manda
        // el importe.
        const preferida = clubId ? await siteCurrency(clubId) : '';
        const listaDe = (totales) => currenciesOf(totales, preferida)
            .filter(Boolean)
            .map(c => ({ currency: c, amount: totales[c] }));

        const availableFundsByCurrency = listaDe(disponible);
        const donationsByCurrency = listaDe(donated);

        // La utilidad de la plataforma, POR MONEDA y nunca sumada entre ellas:
        // los pesos que comisionó no son dólares. Para un administrador de
        // sitio la lista queda vacía, que es lo correcto — no es su dato.
        const platformRevenueByCurrency = listaDe(porMoneda(platformRevenueSum.rows));

        const availableFunds = availableFundsByCurrency.find(
            r => r.currency === primaryCurrency(disponible, preferida))?.amount || 0;
        const donations = donationsByCurrency.find(
            r => r.currency === primaryCurrency(donated, preferida))?.amount || 0;

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
            availableFundsByCurrency,
            platformRevenueByCurrency,
            activeClubs: parseInt(activeClubsCount.rows[0].count),
            donations,
            donationsByCurrency,
            products: parseInt(products.rows[0].count),
            documents: parseInt(documents?.rows[0]?.count || 0),
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
router.get('/crowdfund/pools', superAdminOnly, getPools);

// Pipeline de activación del sitio (solo super admin desde Gestión Global)
router.get('/clubs/:id/activation', superAdminOnly, async (req, res) => {
    try {
        const phases = await getPhases(req.params.id);
        res.json({ phases });
    } catch (e) {
        console.error('Activation pipeline error:', e);
        res.status(500).json({ error: e.message });
    }
});
router.post('/clubs/:id/activation/run', superAdminOnly, async (req, res) => {
    try {
        const result = await evaluateClubActivation(req.params.id, { notify: true });
        res.json(result);
    } catch (e) {
        console.error('Activation run error:', e);
        res.status(500).json({ error: e.message });
    }
});
router.post('/clubs', superAdminOnly, createClub);
router.delete('/clubs/:id', superAdminOnly, deleteClub);
router.get('/clubs/:clubId/agent-context', roleMiddleware(['administrator', 'club_admin', 'district_admin']), getClubAgentContext);

// Global Setup Routes
router.get('/global-map-style', superAdminOnly, async (req, res) => {
    try {
        const result = await db.query('SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1', ['map_style']);
        res.json({ mapStyle: result.rows[0]?.value || 'm' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/global-map-style', superAdminOnly, async (req, res) => {
    try {
        const { mapStyle } = req.body;
        const existing = await db.query('SELECT id FROM "Setting" WHERE key = $1 AND "clubId" IS NULL', ['map_style']);
        if (existing.rows.length > 0) {
            await db.query('UPDATE "Setting" SET value = $1, "updatedAt" = NOW() WHERE id = $2', [mapStyle, existing.rows[0].id]);
        } else {
            const prisma = (await import('../lib/prisma.js')).default;
            await prisma.setting.create({
                data: {
                    key: 'map_style',
                    value: mapStyle
                }
            });
            // No disconnect for singleton
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- CLUB ADMIN & SUPER ADMIN ROUTES ---
const adminRoles = ['administrator', 'club_admin', 'district_admin', 'crowdfunder'];
const contentRoles = ['administrator', 'club_admin', 'district_admin', 'editor', 'crowdfunder'];

router.get('/clubs/:id', roleMiddleware(contentRoles), getClubById);
router.put('/clubs/:id', roleMiddleware(adminRoles), updateClub);
router.get('/clubs/:id/settings', roleMiddleware(contentRoles), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query('SELECT key, value FROM "Setting" WHERE "clubId" = $1', [id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Get club settings error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/clubs/:id/members/batch', requireRoleOrPermission(adminRoles, 'members.edit'), batchUpsertMembers);

// Members/Users can be managed by editors if they need to see directory, but let's keep it adminRoles for modifying
router.get('/users', roleMiddleware(contentRoles), getUsers); // Editors may need to read users for authors/directory
router.post('/users', roleMiddleware(adminRoles), createUser);
router.put('/users/:id', roleMiddleware(adminRoles), updateUser);
router.delete('/users/:id', roleMiddleware(adminRoles), deleteUser);

router.get('/sections', roleMiddleware(contentRoles), getSections);
router.post('/sections', roleMiddleware(contentRoles), createSection);
router.post('/sections/batch-upsert', roleMiddleware(contentRoles), batchUpsertSections);
router.put('/sections/:id', roleMiddleware(contentRoles), updateSection);

// ⚠️ La literal ANTES que cualquier paramétrica del mismo grupo: Express casa
// por orden y una literal debajo de su `:id` es inalcanzable, con un fallo
// mudo (v4.859). Lo comprueba `npm run check:routes`.
router.get('/posts/reconcile', roleMiddleware(['administrator', 'superadmin']), reconcilePosts);
router.get('/posts', requireRoleOrPermission(contentRoles, 'news.view'), getClubPosts);
router.post('/posts', requireRoleOrPermission(contentRoles, 'news.create'), createPost);
router.put('/posts/:id', requireRoleOrPermission(contentRoles, 'news.edit'), updatePost);
router.delete('/posts/:id', requireRoleOrPermission(contentRoles, 'news.delete'), deletePost);
router.post('/posts/bulk-delete', requireRoleOrPermission(contentRoles, 'news.delete'), bulkDeletePosts);

// Publicaciones centralizadas (Difusión a múltiples clubes) — SOLO super-admin.
router.get('/publications', superAdminOnly, getPublications);
router.post('/publications', superAdminOnly, createPublication);
router.put('/publications/:id', superAdminOnly, updatePublication);
router.delete('/publications/:id', superAdminOnly, deletePublication);

router.get('/projects', requireRoleOrPermission(contentRoles, 'projects.view'), getClubProjects);
router.post('/projects', requireRoleOrPermission(contentRoles, 'projects.create'), createProject);

// Rutas específicas PRIMERO (antes de /:id para evitar que Express las trate como parámetros)
router.get('/projects/trash', requireRoleOrPermission(contentRoles, 'projects.delete'), getTrashedProjects);
router.post('/projects/bulk-delete', requireRoleOrPermission(contentRoles, 'projects.delete'), bulkDeleteProjects);

// Rutas con parámetro dinámico
router.put('/projects/:id', requireRoleOrPermission(contentRoles, 'projects.edit'), updateProject);
router.delete('/projects/:id', requireRoleOrPermission(contentRoles, 'projects.delete'), deleteProject);          // soft-delete → papelera
router.put('/projects/:id/restore', requireRoleOrPermission(contentRoles, 'projects.delete'), restoreProject);
router.delete('/projects/:id/permanent', requireRoleOrPermission(contentRoles, 'projects.delete'), permanentDeleteProject); // borrado real

// --- TESTIMONIOS ---
router.get('/testimonials', roleMiddleware(contentRoles), getTestimonials);
router.post('/testimonials', roleMiddleware(contentRoles), createTestimonial);
router.put('/testimonials/:id', roleMiddleware(contentRoles), updateTestimonial);
router.delete('/testimonials/:id', roleMiddleware(contentRoles), deleteTestimonial);         // soft-delete
router.delete('/testimonials/:id/permanent', roleMiddleware(contentRoles), permanentDeleteTestimonial);

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

// ── ONBOARDING: Save step progress ──
router.patch('/clubs/:id/onboarding-step', roleMiddleware(adminRoles), async (req, res) => {
    try {
        const clubId = req.params.id;
        if (req.user.role !== 'administrator' && req.user.clubId !== clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        const { step } = req.body;
        await db.query(
            `INSERT INTO "Setting" ("clubId", key, value) VALUES ($1, 'onboarding_step', $2)
             ON CONFLICT ("clubId", key) DO UPDATE SET value = $2`,
            [clubId, String(step)]
        );
        res.json({ ok: true, step });
    } catch (error) {
        res.status(500).json({ error: 'Error saving step' });
    }
});

// ── ONBOARDING: Complete ──
router.patch('/clubs/:id/complete-onboarding', roleMiddleware(adminRoles), async (req, res) => {
    try {
        const clubId = req.params.id;
        if (req.user.role !== 'administrator' && req.user.clubId !== clubId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        // Mark onboarding as completed
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt") VALUES (gen_random_uuid(), 'onboarding_completed', 'true', $1, NOW())
             ON CONFLICT ("clubId", key) DO UPDATE SET value = 'true', "updatedAt" = NOW()`,
            [clubId]
        );
        // Activate the club site
        await db.query(
            `UPDATE "Club" SET status = 'active', "updatedAt" = NOW() WHERE id = $1`,
            [clubId]
        );

        // Sync brain con la información del onboarding (fire-and-forget — si
        // falla el embed no rompemos el flujo).
        try {
            const { syncBrainWithOnboarding } = await import('../services/brainService.js');
            syncBrainWithOnboarding(clubId).catch(err =>
                console.warn('[admin] sync brain on complete-onboarding:', err.message)
            );
        } catch (err) {
            console.warn('[admin] brain sync setup:', err.message);
        }

        res.json({ ok: true, onboardingCompleted: true, status: 'active' });
    } catch (error) {
        console.error('Complete onboarding error:', error);
        res.status(500).json({ error: 'Error completing onboarding' });
    }
});

// Generic setting update
router.patch('/clubs/:id/settings/:key', roleMiddleware(adminRoles), async (req, res) => {
    try {
        const { id, key } = req.params;
        const { value } = req.body;
        if (req.user.role !== 'administrator' && req.user.clubId !== id) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, NOW())
             ON CONFLICT ("clubId", key) DO UPDATE SET value = $2, "updatedAt" = NOW()`,
            [key, String(value), id]
        );
        res.json({ ok: true, key, value });
    } catch (error) {
        res.status(500).json({ error: 'Error saving setting' });
    }
});
// Save Club Archetype Strategy
router.patch('/:id/save-archetype', roleMiddleware(['administrator', 'club_admin', 'district_admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { archetype } = req.body;

        if (!archetype) {
            return res.status(400).json({ error: 'Archetype data is required' });
        }

        // We save it as a JSON string in the Setting table with key 'club_archetype'
        const existingArchetype = await prisma.setting.findFirst({
            where: { clubId: id, key: 'club_archetype' }
        });

        if (existingArchetype) {
            await prisma.setting.update({
                where: { id: existingArchetype.id },
                data: { value: JSON.stringify(archetype) }
            });
        } else {
            await prisma.setting.create({
                data: {
                    clubId: id,
                    key: 'club_archetype',
                    value: JSON.stringify(archetype)
                }
            });
        }

        res.json({ message: 'Archetype saved successfully' });
    } catch (error) {
        console.error('Save archetype error:', error);
        res.status(500).json({ error: 'Error saving archetype' });
    }
});

import Stripe from 'stripe';

router.post('/clubs/:id/billing-portal', roleMiddleware(['administrator', 'club_admin', 'district_admin', 'editor', 'user']), async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(500).json({ error: 'La llave secreta de Stripe no está configurada en el servidor.' });
        }

        let entity = await prisma.club.findUnique({ where: { id } });
        let type = 'club';

        if (!entity) {
            entity = await prisma.district.findUnique({ where: { id } });
            if (entity) type = 'district';
        }
        
        if (!entity) {
            return res.status(404).json({ error: 'Entidad (Club o Distrito) no encontrada.' });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        if (!entity.stripeCustomerId) {
            // Si no tiene customerId, creamos una sesión de Checkout para el primer pago
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Ecosistema Digital - ${type === 'club' ? 'Club' : 'Distrito'} ${entity.name || entity.number}`,
                            description: `Inversión en infraestructura SaaS para la red Rotaria. Incluye hosting, dominios, IA, SSL y mantenimiento anual del ecosistema digital.`,
                            images: ['https://rotary-platform-assets.s3.us-east-1.amazonaws.com/platform/logo_clubplatform_premium.png'],
                        },
                        unit_amount: type === 'club' ? 29900 : 89900, // $299 Club, $899 Distrito (ejemplo)
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                client_reference_id: entity.id,
                success_url: `${req.headers.origin || 'https://' + req.headers.host}/admin/configuracion?refresh=true`,
                cancel_url: `${req.headers.origin || 'https://' + req.headers.host}/admin/configuracion`,
            });
            return res.json({ url: session.url });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: entity.stripeCustomerId,
            return_url: `${req.headers.origin || 'https://' + req.headers.host}/admin/configuracion?refresh=true`,
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('Stripe Portal Error:', error);
        res.status(500).json({ error: `Error de Stripe: ${error.message || 'Error desconocido'}` });
    }
});

export default router;
