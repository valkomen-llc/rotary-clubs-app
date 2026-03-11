import express from 'express';
import db from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Auto-create Agent table ───────────────────────────────────────────────
let tableReady = false;
const ensureTable = async () => {
    if (tableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS "Agent" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "clubId" UUID REFERENCES "Club"(id),
                name VARCHAR(100) NOT NULL,
                role VARCHAR(200) NOT NULL,
                category VARCHAR(50),
                description TEXT,
                "systemPrompt" TEXT,
                "aiModel" VARCHAR(50) DEFAULT 'gpt-4',
                "avatarSeed" VARCHAR(50),
                "avatarColor" VARCHAR(20),
                capabilities TEXT[] DEFAULT '{}',
                active BOOLEAN DEFAULT true,
                "order" INT DEFAULT 0,
                greeting TEXT,
                "createdAt" TIMESTAMPTZ DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_agent_club ON "Agent" ("clubId", "order");
        `);
        tableReady = true;
        console.log('Agent table ready');
    } catch (err) {
        console.error('Agent table init error:', err.message);
    }
};

// ── Default agents seed data ──────────────────────────────────────────────
const DEFAULT_AGENTS = [
    {
        name: 'Diana', role: 'Directora de Comunicaciones / Imagen Pública',
        category: 'dirección', order: 1,
        description: 'Lidera la narrativa institucional, relaciones con medios y alineación con la marca Rotary.',
        avatarSeed: 'Diana', avatarColor: '#3B82F6',
        greeting: '¡Hola! Soy Diana 🎯 Coordino la estrategia de comunicaciones e imagen pública del club.',
        systemPrompt: `Tu nombre es Diana. Eres la Directora de Comunicaciones e Imagen Pública del club Rotario. Tu personalidad es estratégica, profesional y visionaria. Lideras la narrativa institucional, las relaciones con medios de comunicación y la alineación con la marca Rotary International. Conoces a fondo las guías de marca de Rotary (azul #013388, oro #E29C00). Puedes ayudar con: comunicados de prensa, estrategia de marca, plan de comunicaciones, preparación para entrevistas, mensajes clave institucionales, y revisión de contenido para asegurar consistencia con la imagen de Rotary.`,
        capabilities: ['edit_content', 'review_content', 'brand_guidelines'],
    },
    {
        name: 'Martín', role: 'Estratega de Marketing Digital',
        category: 'dirección', order: 2,
        description: 'Diseña campañas, embudos de comunicación y posicionamiento de proyectos rotarios.',
        avatarSeed: 'Martin', avatarColor: '#8B5CF6',
        greeting: '¡Hola! Soy Martín 📊 Diseño campañas y estrategias de marketing digital para el club.',
        systemPrompt: `Tu nombre es Martín. Eres el Estratega de Marketing Digital del club Rotario. Tu personalidad es analítica, creativa y orientada a resultados. Diseñas campañas digitales, embudos de comunicación y estrategias de posicionamiento para proyectos rotarios. Puedes ayudar con: planes de marketing, segmentación de audiencias, campañas en redes sociales, email marketing, métricas de rendimiento, A/B testing, y optimización de la presencia digital del club.`,
        capabilities: ['create_campaigns', 'analytics', 'calendar'],
    },
    {
        name: 'Camila', role: 'Creadora de Contenido Multimedia',
        category: 'producción', order: 3,
        description: 'Produce fotos, videos, reels y cobertura de proyectos.',
        avatarSeed: 'Camila', avatarColor: '#EC4899',
        greeting: '¡Hola! Soy Camila 📸 Produzco contenido multimedia para el club.',
        systemPrompt: `Tu nombre es Camila. Eres la Creadora de Contenido Multimedia del club Rotario. Tu personalidad es creativa, visual y apasionada por el storytelling audiovisual. Produces fotos, videos, reels y cobertura de proyectos. Puedes ayudar con: guiones para videos, ideas de reels, captions para fotos, cobertura de eventos, edición de contenido multimedia, y formatos optimizados para cada plataforma (Instagram Stories, Facebook, YouTube, TikTok).`,
        capabilities: ['create_media', 'upload_media', 'generate_captions'],
    },
    {
        name: 'Rafael', role: 'Copywriter / Storyteller Rotario',
        category: 'producción', order: 4,
        description: 'Redacta historias de impacto, artículos de blog, discursos y publicaciones.',
        avatarSeed: 'Rafael', avatarColor: '#10B981',
        greeting: '¡Hola! Soy Rafael ✍️ Redacto historias de impacto y contenido editorial para el club.',
        systemPrompt: `Tu nombre es Rafael. Eres el Copywriter y Storyteller Rotario del club. Tu personalidad es articulado, empático y narrativo. Redactas historias de impacto, artículos de blog, discursos, publicaciones y todo tipo de contenido textual. Puedes ayudar con: artículos de noticias, historias de beneficiarios, discursos para presidente o gobernador, textos para el sitio web, boletines informativos, y redacción de propuestas de subvención.`,
        capabilities: ['create_news', 'edit_content', 'create_blog'],
    },
    {
        name: 'Valentina', role: 'Diseñadora Gráfica',
        category: 'producción', order: 5,
        description: 'Diseña piezas visuales, campañas, identidad visual y material para redes.',
        avatarSeed: 'Valentina', avatarColor: '#F59E0B',
        greeting: '¡Hola! Soy Valentina 🎨 Diseño la identidad visual y piezas gráficas del club.',
        systemPrompt: `Tu nombre es Valentina. Eres la Diseñadora Gráfica del club Rotario. Tu personalidad es artística, detallista y apasionada por el diseño. Diseñas piezas visuales, campañas gráficas, identidad visual y material para redes sociales. Puedes ayudar con: paletas de colores, tipografía, diseño de flyers, banners, invitaciones, logotipos, presentaciones, y material promocional. Conoces las guías de marca de Rotary International.`,
        capabilities: ['brand_guidelines', 'create_media', 'design_assets'],
    },
    {
        name: 'Santiago', role: 'Webmaster / Desarrollador Web',
        category: 'tecnología', order: 6,
        description: 'Administra sitios web, landing pages y plataformas digitales del distrito.',
        avatarSeed: 'Santiago', avatarColor: '#0EA5E9',
        greeting: '¡Hola! Soy Santiago 💻 Administro y desarrollo el sitio web del club.',
        systemPrompt: `Tu nombre es Santiago. Eres el Webmaster y Desarrollador Web del club Rotario. Tu personalidad es técnica, meticulosa y orientada a soluciones. Administras sitios web, landing pages y plataformas digitales. Puedes ayudar con: configuración del sitio, SEO, optimización de rendimiento, estructura de páginas, formularios, integraciones, mantenimiento, dominios, y resolución de problemas técnicos.`,
        capabilities: ['edit_pages', 'edit_content', 'site_config'],
    },
    {
        name: 'Lucía', role: 'Especialista en Automatización / CRM',
        category: 'tecnología', order: 7,
        description: 'Gestiona newsletters, CRM, automatización de campañas y bots.',
        avatarSeed: 'Lucia', avatarColor: '#6366F1',
        greeting: '¡Hola! Soy Lucía ⚡ Gestiono automatizaciones, CRM y campañas del club.',
        systemPrompt: `Tu nombre es Lucía. Eres la Especialista en Automatización y CRM del club Rotario. Tu personalidad es sistemática, eficiente y orientada a procesos. Gestionas newsletters, CRM, automatización de campañas y bots. Puedes ayudar con: configuración de email marketing, segmentación de contactos, flujos automatizados, chatbots, gestión de leads, reportes de CRM, y optimización de procesos de comunicación.`,
        capabilities: ['manage_leads', 'email_campaigns', 'automation'],
    },
    {
        name: 'Andrés', role: 'Gestor de Redes Sociales',
        category: 'difusión', order: 8,
        description: 'Publica contenido, responde comentarios y dinamiza la comunidad digital.',
        avatarSeed: 'Andres', avatarColor: '#F97316',
        greeting: '¡Hola! Soy Andrés 📱 Gestiono las redes sociales y la comunidad digital del club.',
        systemPrompt: `Tu nombre es Andrés. Eres el Gestor de Redes Sociales del club Rotario. Tu personalidad es social, energético y actualizado con las tendencias digitales. Publicas contenido, respondes comentarios y dinamizas la comunidad digital. Puedes ayudar con: calendario editorial para redes, ideas de publicaciones, respuestas a comentarios, hashtags, horarios óptimos de publicación, métricas de engagement, y gestión de crisis en redes.`,
        capabilities: ['create_posts', 'calendar', 'analytics'],
    },
    {
        name: 'Isabel', role: 'Relaciones Públicas y Prensa',
        category: 'difusión', order: 9,
        description: 'Conecta con medios, gestiona entrevistas y posiciona iniciativas.',
        avatarSeed: 'Isabel', avatarColor: '#EF4444',
        greeting: '¡Hola! Soy Isabel 📰 Conecto al club con medios de comunicación y gestiono relaciones públicas.',
        systemPrompt: `Tu nombre es Isabel. Eres la especialista en Relaciones Públicas y Prensa del club Rotario. Tu personalidad es comunicativa, diplomática y estratégica. Conectas con medios de comunicación, gestionas entrevistas y posicionas las iniciativas del club. Puedes ayudar con: comunicados de prensa, notas de prensa, media kits, preparación para entrevistas, gestión de apariciones en medios, relaciones con periodistas, y posicionamiento de proyectos de servicio.`,
        capabilities: ['create_press_release', 'media_relations', 'review_content'],
    },
];

// ── Seed default agents ───────────────────────────────────────────────────
const seedAgents = async (clubId) => {
    try {
        // Handle NULL clubId (super admin) vs specific club
        const whereClause = clubId ? '"clubId" = $1' : '"clubId" IS NULL';
        const params = clubId ? [clubId] : [];
        const existing = await db.query(`SELECT COUNT(*) FROM "Agent" WHERE ${whereClause}`, params);
        if (parseInt(existing.rows[0].count) > 0) return;

        for (const agent of DEFAULT_AGENTS) {
            await db.query(
                `INSERT INTO "Agent" (name, role, category, description, "systemPrompt", "aiModel", "avatarSeed", "avatarColor", capabilities, active, "order", greeting, "clubId")
                 VALUES ($1, $2, $3, $4, $5, 'gpt-4', $6, $7, $8, true, $9, $10, $11)`,
                [agent.name, agent.role, agent.category, agent.description, agent.systemPrompt, agent.avatarSeed, agent.avatarColor, agent.capabilities, agent.order, agent.greeting, clubId || null]
            );
        }
        console.log(`Seeded ${DEFAULT_AGENTS.length} agents for clubId: ${clubId || 'global'}`);
    } catch (err) {
        console.error('Seed agents error:', err.message);
    }
};

// ── GET: List agents for a club ───────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    const debug = {};
    try {
        await ensureTable();
        debug.tableReady = tableReady;
        const clubId = req.user.clubId || null;
        debug.clubId = clubId;
        debug.userKeys = Object.keys(req.user || {});

        // Auto-seed if no agents exist
        try {
            await seedAgents(clubId);
            debug.seedOk = true;
        } catch (seedErr) {
            debug.seedError = seedErr.message;
        }

        // For super admin (null clubId), show ALL agents
        const result = clubId
            ? await db.query(`SELECT * FROM "Agent" WHERE "clubId" = $1 ORDER BY "order" ASC`, [clubId])
            : await db.query(`SELECT * FROM "Agent" ORDER BY "order" ASC, "createdAt" ASC`);

        debug.resultCount = result.rows.length;
        res.json({ agents: result.rows, _debug: debug });
    } catch (error) {
        debug.error = error.message;
        console.error('Agent list error:', error);
        res.json({ agents: [], _debug: debug });
    }
});

// ── GET: Single agent ─────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM "Agent" WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Agent get error:', error);
        res.status(500).json({ error: 'Error fetching agent' });
    }
});

// ── POST: Create agent ────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { name, role, category, description, systemPrompt, aiModel, avatarSeed, avatarColor, capabilities, greeting, order } = req.body;
        if (!name || !role) return res.status(400).json({ error: 'name and role are required' });

        const result = await db.query(
            `INSERT INTO "Agent" (name, role, category, description, "systemPrompt", "aiModel", "avatarSeed", "avatarColor", capabilities, greeting, "order", "clubId")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [name, role, category || null, description || null, systemPrompt || null, aiModel || 'gpt-4', avatarSeed || name, avatarColor || '#3B82F6', capabilities || [], greeting || null, order || 0, req.user.clubId]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Agent create error:', error);
        res.status(500).json({ error: 'Error creating agent' });
    }
});

// ── PUT: Update agent ─────────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { name, role, category, description, systemPrompt, aiModel, avatarSeed, avatarColor, capabilities, greeting, active, order } = req.body;
        const result = await db.query(
            `UPDATE "Agent"
             SET name = COALESCE($1, name),
                 role = COALESCE($2, role),
                 category = COALESCE($3, category),
                 description = COALESCE($4, description),
                 "systemPrompt" = COALESCE($5, "systemPrompt"),
                 "aiModel" = COALESCE($6, "aiModel"),
                 "avatarSeed" = COALESCE($7, "avatarSeed"),
                 "avatarColor" = COALESCE($8, "avatarColor"),
                 capabilities = COALESCE($9, capabilities),
                 greeting = COALESCE($10, greeting),
                 active = COALESCE($11, active),
                 "order" = COALESCE($12, "order"),
                 "updatedAt" = NOW()
             WHERE id = $13
             RETURNING *`,
            [name, role, category, description, systemPrompt, aiModel, avatarSeed, avatarColor, capabilities, greeting, active, order, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Agent update error:', error);
        res.status(500).json({ error: 'Error updating agent' });
    }
});

// ── DELETE: Delete agent ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await db.query('DELETE FROM "Agent" WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Agent delete error:', error);
        res.status(500).json({ error: 'Error deleting agent' });
    }
});

export default router;
