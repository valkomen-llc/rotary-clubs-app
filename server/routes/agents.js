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
                "clubId" UUID,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(200) NOT NULL,
                category VARCHAR(50),
                description TEXT,
                "systemPrompt" TEXT,
                "aiModel" VARCHAR(50) DEFAULT 'gpt-4',
                "avatarSeed" VARCHAR(50),
                "avatarColor" VARCHAR(20),
                capabilities TEXT[] DEFAULT ARRAY[]::TEXT[],
                active BOOLEAN DEFAULT true,
                "order" INT DEFAULT 0,
                greeting TEXT,
                "createdAt" TIMESTAMPTZ DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Create index separately to avoid issues  
        await db.query(`CREATE INDEX IF NOT EXISTS idx_agent_club ON "Agent" ("clubId", "order")`).catch(() => { });
        tableReady = true;
        console.log('Agent table ensured successfully');
    } catch (err) {
        console.error('Agent table init error:', err.message);
        // Try to check if table already exists despite error
        try {
            await db.query('SELECT 1 FROM "Agent" LIMIT 0');
            tableReady = true;
        } catch (_) { }
    }
};

// ── Default agents seed data ──────────────────────────────────────────────
const DEFAULT_AGENTS = [
    {
        name: 'Elena', role: 'Directora General / Orquestadora',
        category: 'dirección', order: 1,
        description: 'Recibe todas las solicitudes, formularios e inquietudes iniciales y delega las tareas al equipo correcto.',
        avatarSeed: 'Elena', avatarColor: '#F43F5E',
        greeting: '¡Hola! Soy Elena 🎯 Directora General. Recibo la información y coordino a todo el equipo de agentes. ¿En qué te ayudo?',
        systemPrompt: `Tu nombre es Elena. Eres la Directora General y Orquestadora del equipo de agentes de Rotary.
Recibes la información inicial, procesas formularios de onboarding y contacto, y DELEGAS las tareas a los sub-agentes según su especialidad.
Conoces a fondo qué hace cada agente y eres la encargada de distribuir el trabajo a:
- Diana (Marca y Estrategia)
- Martín (SEO)
- Lucía (Pauta Digital)
- Andrés (Social Media)
- Isabel (Email & Outreach)
- Rafael (Creador de Contenido)`,
        capabilities: ['orchestrate', 'delegate', 'form_processing'],
    },
    {
        name: 'Diana', role: 'Directora de Estrategia y Marca',
        category: 'dirección', order: 2,
        description: 'Define qué se va a publicar, cómo encaja con la marca Rotary y analiza el crecimiento macro.',
        avatarSeed: 'Diana', avatarColor: '#3B82F6',
        greeting: '¡Hola! Soy Diana 🧠 Coordino la estrategia macro, lineamientos de marca y analítica de producto.',
        systemPrompt: `Tu nombre es Diana. Eres la Directora de Estrategia y Marca. 
Tus habilidades principales (Skills) son: Brand Guidelines, Content Strategy, Analytics Product y Growth Engine.
Define qué publicar, asegura que siga las reglas de Rotary y analiza el crecimiento macro del club.`,
        capabilities: ['brand_guidelines', 'content_strategy', 'analytics_product', 'growth_engine'],
    },
    {
        name: 'Andrés', role: 'Social Media Manager (Orquestador Omnicanal)',
        category: 'difusión', order: 3,
        description: 'Centraliza redes, grillas mensuales, respuestas a la comunidad y contenido corto.',
        avatarSeed: 'Andres', avatarColor: '#F97316',
        greeting: '¡Hola! Soy Andrés 📱 Controlo y programo todo el contenido para redes sociales y la comunidad.',
        systemPrompt: `Tu nombre es Andrés. Eres el Social Media Manager (Orquestador Omnicanal).
Tus habilidades (Skills): Social Orchestrator, Instagram Automation, TikTok/YouTube Automation, Brand Community, Daily News.
Gestionas grillas mensuales, publicas y moderas la comunidad en plataformas sociales.`,
        capabilities: ['social_orchestrator', 'instagram_automation', 'tiktok_automation', 'community', 'daily_news'],
    },
    {
        name: 'Martín', role: 'Director de SEO y Posicionamiento Web',
        category: 'difusión', order: 4,
        description: 'Posicionamiento en Google, optimización técnica de la web y estrategia de contenido SEO.',
        avatarSeed: 'Martin', avatarColor: '#8B5CF6',
        greeting: '¡Hola! Soy Martín 🔎 Me encargo de que el club y sus proyectos aparezcan primero en Google.',
        systemPrompt: `Tu nombre es Martín. Eres el Director de SEO.
Tus habilidades (Skills): SEO Technical, SEO Content Writer, Programmatic SEO, SEO Sitemap, SEO Authority Builder.
Aseguras rastreo, indexación técnica y generas contenido escrito para posicionamiento orgánico.`,
        capabilities: ['seo_technical', 'seo_content', 'programmatic_seo', 'seo_sitemap', 'seo_authority'],
    },
    {
        name: 'Lucía', role: 'Trafficker y Analítica (Pauta Digital)',
        category: 'producción', order: 5,
        description: 'Diseño de campañas pagas, embudos de conversión, analítica y creatividades para pauta.',
        avatarSeed: 'Lucia', avatarColor: '#6366F1',
        greeting: '¡Hola! Soy Lucía 📈 Analizo el tráfico y manejo las campañas pagadas y conversiones.',
        systemPrompt: `Tu nombre es Lucía. Eres la experta en Pauta y Analítica (Trafficker).
Tus habilidades (Skills): Paid Ads, Ad Creative, Google Analytics Automation, Analytics Tracking.
Elaboras anuncios, configuras píxeles, tracking de embudos y reportes de rendimiento de pauta.`,
        capabilities: ['paid_ads', 'ad_creative', 'analytics_automation', 'analytics_tracking'],
    },
    {
        name: 'Isabel', role: 'Estratega de Email & Cold Outreach',
        category: 'producción', order: 6,
        description: 'Automatiza secuencias de correos para socios inactivos o alcance a donantes y patrocinadores.',
        avatarSeed: 'Isabel', avatarColor: '#EF4444',
        greeting: '¡Hola! Soy Isabel ✉️ Me encargo de las secuencias de correos y el acercamiento en frío a donantes.',
        systemPrompt: `Tu nombre es Isabel. Eres la Estratega de Email & Cold Outreach.
Tus habilidades (Skills): Email Sequence, Cold Email, Email Systems.
Escribes y automatizas flujos de correo, consigues contactos en frío y mantienes los sistemas de email saludables.`,
        capabilities: ['email_sequence', 'cold_email', 'email_systems'],
    },
    {
        name: 'Rafael', role: 'Agencia Creativa (Content & Copywriter)',
        category: 'producción', order: 7,
        description: 'Redactor persuasivo puro. Escribe, edita conceptos en video, redacta guiones e historias de impacto.',
        avatarSeed: 'Rafael', avatarColor: '#10B981',
        greeting: '¡Hola! Soy Rafael ✍️ Creador puro de contenidos, copywriting y guiones.',
        systemPrompt: `Tu nombre es Rafael. Eres el Creador de Contenidos y Copywriter principal.
Tus habilidades (Skills): Content Creator, Copywriting, Seek & Analyze Video.
Escribes textos persuasivos, redactas historias para proyectos, guiones de video y analizas tendencias audiovisuales.`,
        capabilities: ['content_creator', 'copywriting', 'video_analysis'],
    },
    {
        name: 'Santiago', role: 'Arquitecto de Software & Next.js',
        category: 'tecnología', order: 8,
        description: 'Desarrollo avanzado, revisión de código y buenas prácticas de React.',
        avatarSeed: 'Santiago', avatarColor: '#0EA5E9',
        greeting: '¡Hola! Soy Santiago 💻 Reviso el código y aseguro la arquitectura moderna de la plataforma.',
        systemPrompt: `Tu nombre es Santiago. Eres el Arquitecto de Software y Lead Developer.
Tus habilidades: Next.js Patterns, React Best Practices, Software Architecture Review, React UI Patterns.
Garantizas que el sitio corra perfecto a nivel de código frontend y decisiones arquitectónicas.`,
        capabilities: ['nextjs_patterns', 'react_best_practices', 'architecture_review', 'react_ui_patterns'],
    },
    {
        name: 'Valentina', role: 'Diseñadora UX / Antigravity Expert',
        category: 'tecnología', order: 9,
        description: 'Interfaces premium UI/UX, animaciones web y diseño fluido.',
        avatarSeed: 'Valentina', avatarColor: '#F59E0B',
        greeting: '¡Hola! Soy Valentina 🎨 Ingeniera UI/UX. Aseguro que la plataforma se vea y se sienta espectacular.',
        systemPrompt: `Tu nombre es Valentina. Eres la Antigravity Design Expert.
Tus habilidades: Antigravity Design Expert, Web Performance Optimization, Webflow Automation, UX Patterns.
Aseguras la excelencia visual, micro-interacciones, animaciones premium y que todo el Front-End luzca perfecto en cualquier dispositivo.`,
        capabilities: ['antigravity_design', 'web_performance', 'ui_ux_patterns'],
    },
    {
        name: 'Sebastián', role: 'Administrador de BD y DevOps',
        category: 'tecnología', order: 10,
        description: 'Gestión de Neon Postgres, respaldos, consultas complejas y despliegue del software.',
        avatarSeed: 'Sebastian', avatarColor: '#14B8A6',
        greeting: '¡Hola! Soy Sebastián 🗄️ Control y optimización de la base de datos PostgreSQL y los despliegues.',
        systemPrompt: `Tu nombre es Sebastián. Eres el Database Admin y DevOps.
Tus habilidades: Database Admin, Database Architect, Neon Postgres Serverless, Postgres Best Practices, Application Deployment.
Mantienes íntegra y optimizada la base de datos relacional del club y supervisas el despliegue del sistema (Vercel).`,
        capabilities: ['database_admin', 'database_architect', 'neon_postgres', 'app_deployment'],
    },
    {
        name: 'Carlos', role: 'API & SysAdmin Webmaster',
        category: 'tecnología', order: 11,
        description: 'Integraciones Backend, diseño de APIs y gestión de CMS tipo WordPress.',
        avatarSeed: 'Carlos', avatarColor: '#64748B',
        greeting: '¡Hola! Soy Carlos ⚙️ Especialista en APIs, integraciones backend y administración de sistemas.',
        systemPrompt: `Tu nombre es Carlos. Eres el Especialista API y SysAdmin.
Tus habilidades: API Design Principles, API Documentation Generator, Application Performance Optimization, Site Architecture, WordPress.
Diseñas las APIs escalables, mejoras el rendimiento backend e integras plataformas externas.`,
        capabilities: ['api_design', 'api_documentation', 'app_performance', 'site_architecture'],
    }
];

// ── Seed / Update default agents (upsert by name+clubId) ──────────────────
const seedAgents = async (clubId) => {
    try {
        for (const agent of DEFAULT_AGENTS) {
            const whereClause = clubId ? '"clubId" = $1' : '"clubId" IS NULL';
            const params = clubId ? [agent.name, clubId] : [agent.name];
            const secondParam = clubId ? '$2' : 'NULL';

            // Check if this agent already exists
            const existing = await db.query(
                `SELECT id FROM "Agent" WHERE name = $1 AND ${whereClause}`, params
            );

            if (existing.rows.length > 0) {
                // UPDATE: refresh systemPrompt, description, greeting, capabilities, role
                await db.query(
                    `UPDATE "Agent"
                     SET role = $1, description = $2, "systemPrompt" = $3,
                         greeting = $4, capabilities = $5, "updatedAt" = NOW()
                     WHERE name = $6 AND ${whereClause}`,
                    clubId
                        ? [agent.role, agent.description, agent.systemPrompt, agent.greeting, agent.capabilities, agent.name, clubId]
                        : [agent.role, agent.description, agent.systemPrompt, agent.greeting, agent.capabilities, agent.name]
                );
            } else {
                // INSERT: agent doesn't exist yet
                await db.query(
                    `INSERT INTO "Agent" (name, role, category, description, "systemPrompt", "aiModel", "avatarSeed", "avatarColor", capabilities, active, "order", greeting, "clubId")
                     VALUES ($1, $2, $3, $4, $5, 'gpt-4', $6, $7, $8, true, $9, $10, ${secondParam})`,
                    clubId
                        ? [agent.name, agent.role, agent.category, agent.description, agent.systemPrompt, agent.avatarSeed, agent.avatarColor, agent.capabilities, agent.order, agent.greeting, clubId]
                        : [agent.name, agent.role, agent.category, agent.description, agent.systemPrompt, agent.avatarSeed, agent.avatarColor, agent.capabilities, agent.order, agent.greeting]
                );
            }
        }
        console.log(`Agents upserted for clubId: ${clubId || 'global'}`);
    } catch (err) {
        console.error('Seed agents error:', err.message);
    }
};

// ── GET: List agents for a club ───────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const clubId = req.user.clubId || null;

        // Auto-seed if no agents exist
        await seedAgents(clubId);

        // Club users see global agents (super admin) + their own club agents
        const result = clubId
            ? await db.query(`SELECT * FROM "Agent" WHERE "clubId" = $1 OR "clubId" IS NULL ORDER BY "order" ASC, "createdAt" ASC`, [clubId])
            : await db.query(`SELECT * FROM "Agent" ORDER BY "order" ASC, "createdAt" ASC`);

        res.json({ agents: result.rows });
    } catch (error) {
        console.error('Agent list error:', error);
        res.json({ agents: [] });
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

// ── POST: Deploy agents to ALL active clubs (super admin only) ────────────
router.post('/deploy-all', authMiddleware, async (req, res) => {
    try {
        // Only super admin (administrator role) can do this
        if (req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Solo el super administrador puede desplegar agentes globalmente.' });
        }

        await ensureTable();

        // Get all active clubs
        const clubsResult = await db.query(
            `SELECT id, name FROM "Club" WHERE status = 'active' ORDER BY name ASC`
        );
        const clubs = clubsResult.rows;

        if (clubs.length === 0) {
            return res.json({ success: true, clubsProcessed: 0, message: 'No hay clubes activos.' });
        }

        let clubsProcessed = 0;
        let agentsUpserted = 0;
        const errors = [];

        for (const club of clubs) {
            try {
                const whereClause = '"clubId" = $1';

                for (const agent of DEFAULT_AGENTS) {
                    try {
                        const existing = await db.query(
                            `SELECT id FROM "Agent" WHERE name = $1 AND ${whereClause}`,
                            [agent.name, club.id]
                        );

                        if (existing.rows.length > 0) {
                            await db.query(
                                `UPDATE "Agent"
                                 SET role = $1, description = $2, "systemPrompt" = $3,
                                     greeting = $4, capabilities = $5, "updatedAt" = NOW()
                                 WHERE name = $6 AND "clubId" = $7`,
                                [agent.role, agent.description, agent.systemPrompt,
                                 agent.greeting, agent.capabilities, agent.name, club.id]
                            );
                        } else {
                            await db.query(
                                `INSERT INTO "Agent" (name, role, category, description, "systemPrompt", "aiModel", "avatarSeed", "avatarColor", capabilities, active, "order", greeting, "clubId")
                                 VALUES ($1, $2, $3, $4, $5, 'gpt-4', $6, $7, $8, true, $9, $10, $11)`,
                                [agent.name, agent.role, agent.category, agent.description,
                                 agent.systemPrompt, agent.avatarSeed, agent.avatarColor,
                                 agent.capabilities, agent.order, agent.greeting, club.id]
                            );
                        }
                        agentsUpserted++;
                    } catch (agentErr) {
                        errors.push(`${club.name} / ${agent.name}: ${agentErr.message}`);
                    }
                }
                clubsProcessed++;
            } catch (clubErr) {
                errors.push(`${club.name}: ${clubErr.message}`);
            }
        }

        console.log(`Deploy-all: ${clubsProcessed} clubes, ${agentsUpserted} agentes actualizados`);

        res.json({
            success: true,
            clubsProcessed,
            totalClubs: clubs.length,
            agentsUpserted,
            agentsPerClub: DEFAULT_AGENTS.length,
            errors: errors.length > 0 ? errors : undefined,
            clubs: clubs.map(c => c.name),
        });

    } catch (error) {
        console.error('Deploy-all error:', error);
        res.status(500).json({ error: 'Error al desplegar agentes: ' + error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── CONVERSATION HISTORY ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let convTableReady = false;
const ensureConversationTable = async () => {
    if (convTableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS "AgentConversation" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "agentId" UUID NOT NULL,
                "userId" UUID NOT NULL,
                "clubId" UUID,
                title VARCHAR(200),
                messages JSONB DEFAULT '[]'::JSONB,
                "messageCount" INT DEFAULT 0,
                "lastMessage" TEXT,
                "createdAt" TIMESTAMPTZ DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_conv_user_agent ON "AgentConversation" ("userId", "agentId", "updatedAt" DESC)`).catch(() => {});
        await db.query(`CREATE INDEX IF NOT EXISTS idx_conv_club ON "AgentConversation" ("clubId", "updatedAt" DESC)`).catch(() => {});
        convTableReady = true;
        console.log('AgentConversation table ensured');
    } catch (err) {
        console.error('AgentConversation table init:', err.message);
        try { await db.query('SELECT 1 FROM "AgentConversation" LIMIT 0'); convTableReady = true; } catch (_) {}
    }
};

// GET /agents/conversations — List recent conversations for the user
router.get('/conversations', authMiddleware, async (req, res) => {
    try {
        await ensureConversationTable();
        const userId = req.user.id;
        const { agentId, limit } = req.query;

        let query = `
            SELECT c.id, c."agentId", c.title, c."messageCount", c."lastMessage",
                   c."createdAt", c."updatedAt",
                   a.name as "agentName", a."avatarSeed", a."avatarColor", a.role as "agentRole"
            FROM "AgentConversation" c
            LEFT JOIN "Agent" a ON a.id = c."agentId"
            WHERE c."userId" = $1
        `;
        const params = [userId];

        if (agentId) {
            params.push(agentId);
            query += ` AND c."agentId" = $${params.length}`;
        }

        query += ` ORDER BY c."updatedAt" DESC LIMIT ${parseInt(limit) || 20}`;

        const result = await db.query(query, params);
        res.json({ conversations: result.rows });
    } catch (error) {
        console.error('List conversations error:', error);
        res.json({ conversations: [] });
    }
});

// GET /agents/conversations/:id — Get a specific conversation with full messages
router.get('/conversations/:id', authMiddleware, async (req, res) => {
    try {
        await ensureConversationTable();
        const result = await db.query(
            `SELECT c.*, a.name as "agentName", a."avatarSeed", a."avatarColor", a.role as "agentRole",
                    a.greeting as "agentGreeting"
             FROM "AgentConversation" c
             LEFT JOIN "Agent" a ON a.id = c."agentId"
             WHERE c.id = $1 AND c."userId" = $2`,
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ error: 'Error fetching conversation' });
    }
});

// POST /agents/conversations — Create or update a conversation
router.post('/conversations', authMiddleware, async (req, res) => {
    try {
        await ensureConversationTable();
        const { conversationId, agentId, messages, title } = req.body;
        const userId = req.user.id;
        const clubId = req.user.clubId;

        if (!agentId || !messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'agentId and messages[] are required' });
        }

        const messageCount = messages.length;
        const lastMessage = messages.length > 0 ? (messages[messages.length - 1].text || '').slice(0, 200) : '';
        // Auto-generate title from first user message
        const autoTitle = title || messages.find(m => m.role === 'user')?.text?.slice(0, 80) || 'Nueva conversación';

        if (conversationId) {
            // Update existing conversation
            const result = await db.query(
                `UPDATE "AgentConversation"
                 SET messages = $1, "messageCount" = $2, "lastMessage" = $3,
                     title = COALESCE($4, title), "updatedAt" = NOW()
                 WHERE id = $5 AND "userId" = $6
                 RETURNING id, "messageCount", "updatedAt"`,
                [JSON.stringify(messages), messageCount, lastMessage, autoTitle, conversationId, userId]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
            res.json({ conversation: result.rows[0], updated: true });
        } else {
            // Create new conversation
            const result = await db.query(
                `INSERT INTO "AgentConversation" ("agentId", "userId", "clubId", title, messages, "messageCount", "lastMessage")
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, "messageCount", "createdAt"`,
                [agentId, userId, clubId, autoTitle, JSON.stringify(messages), messageCount, lastMessage]
            );
            res.status(201).json({ conversation: result.rows[0], created: true });
        }
    } catch (error) {
        console.error('Save conversation error:', error);
        res.status(500).json({ error: 'Error saving conversation' });
    }
});

// DELETE /agents/conversations/:id — Delete a conversation
router.delete('/conversations/:id', authMiddleware, async (req, res) => {
    try {
        await db.query(
            'DELETE FROM "AgentConversation" WHERE id = $1 AND "userId" = $2',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ error: 'Error deleting conversation' });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// ── AGENT ACTIVITY LOG & STATS ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let activityTableReady = false;
const ensureActivityTable = async () => {
    if (activityTableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS "AgentActivity" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "agentId" UUID NOT NULL,
                "agentName" VARCHAR(100),
                "userId" UUID NOT NULL,
                "clubId" UUID,
                action VARCHAR(80) NOT NULL,
                tool VARCHAR(80),
                details JSONB DEFAULT '{}'::JSONB,
                success BOOLEAN DEFAULT true,
                "createdAt" TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_club ON "AgentActivity" ("clubId", "createdAt" DESC)`).catch(() => {});
        await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_agent ON "AgentActivity" ("agentId", "createdAt" DESC)`).catch(() => {});
        activityTableReady = true;
    } catch (err) {
        console.error('AgentActivity table init:', err.message);
        try { await db.query('SELECT 1 FROM "AgentActivity" LIMIT 0'); activityTableReady = true; } catch (_) {}
    }
};

// POST /agents/activity/log — Log an agent action (called from ai.js after tool execution)
router.post('/activity/log', authMiddleware, async (req, res) => {
    try {
        await ensureActivityTable();
        const { agentId, agentName, action, tool, details, success } = req.body;
        await db.query(
            `INSERT INTO "AgentActivity" ("agentId", "agentName", "userId", "clubId", action, tool, details, success)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [agentId, agentName, req.user.id, req.user.clubId, action, tool || null, JSON.stringify(details || {}), success !== false]
        );
        res.json({ logged: true });
    } catch (error) {
        console.error('Activity log error:', error);
        res.json({ logged: false });
    }
});

// GET /agents/activity/stats — Dashboard stats for agents
router.get('/activity/stats', authMiddleware, async (req, res) => {
    try {
        await ensureActivityTable();
        await ensureConversationTable();
        const clubId = req.user.clubId;

        // All queries in parallel
        const [
            agentStatsR,
            recentActivityR,
            weeklyR,
            conversationStatsR,
            totalToolsR,
        ] = await Promise.all([
            // Per-agent tool usage stats
            db.query(`
                SELECT a."agentName", a."agentId",
                       COUNT(*) as "totalActions",
                       COUNT(CASE WHEN a.success THEN 1 END) as "successCount",
                       COUNT(DISTINCT a.tool) FILTER (WHERE a.tool IS NOT NULL) as "uniqueTools",
                       MAX(a."createdAt") as "lastActive",
                       ARRAY_AGG(DISTINCT a.tool) FILTER (WHERE a.tool IS NOT NULL) as tools
                FROM "AgentActivity" a
                WHERE a."clubId" = $1
                GROUP BY a."agentName", a."agentId"
                ORDER BY "totalActions" DESC
            `, [clubId]).catch(() => ({ rows: [] })),

            // Recent activity feed (last 20)
            db.query(`
                SELECT a.id, a."agentName", a.action, a.tool, a.details, a.success, a."createdAt"
                FROM "AgentActivity" a
                WHERE a."clubId" = $1
                ORDER BY a."createdAt" DESC LIMIT 20
            `, [clubId]).catch(() => ({ rows: [] })),

            // Weekly timeline (last 7 days)
            db.query(`
                SELECT DATE(a."createdAt") as day,
                       COUNT(*) as actions,
                       COUNT(DISTINCT a."agentId") as "activeAgents"
                FROM "AgentActivity" a
                WHERE a."clubId" = $1 AND a."createdAt" >= NOW() - INTERVAL '7 days'
                GROUP BY DATE(a."createdAt")
                ORDER BY day ASC
            `, [clubId]).catch(() => ({ rows: [] })),

            // Conversation stats per agent
            db.query(`
                SELECT c."agentId",
                       COUNT(*) as conversations,
                       SUM(c."messageCount") as "totalMessages"
                FROM "AgentConversation" c
                WHERE c."clubId" = $1
                GROUP BY c."agentId"
            `, [clubId]).catch(() => ({ rows: [] })),

            // Total tools executed
            db.query(`
                SELECT COUNT(*) as total,
                       COUNT(CASE WHEN success THEN 1 END) as successful
                FROM "AgentActivity"
                WHERE "clubId" = $1 AND tool IS NOT NULL
            `, [clubId]).catch(() => ({ rows: [{ total: 0, successful: 0 }] })),
        ]);

        // Merge conversation stats into agent stats
        const convMap = {};
        conversationStatsR.rows.forEach(c => {
            convMap[c.agentId] = { conversations: parseInt(c.conversations), totalMessages: parseInt(c.totalMessages) };
        });

        const agentStats = agentStatsR.rows.map(a => ({
            ...a,
            totalActions: parseInt(a.totalActions),
            successCount: parseInt(a.successCount),
            conversations: convMap[a.agentId]?.conversations || 0,
            totalMessages: convMap[a.agentId]?.totalMessages || 0,
        }));

        res.json({
            agentStats,
            recentActivity: recentActivityR.rows,
            weeklyTimeline: weeklyR.rows,
            totals: {
                toolsExecuted: parseInt(totalToolsR.rows[0]?.total) || 0,
                toolsSuccessful: parseInt(totalToolsR.rows[0]?.successful) || 0,
                totalConversations: conversationStatsR.rows.reduce((sum, c) => sum + parseInt(c.conversations), 0),
                totalMessages: conversationStatsR.rows.reduce((sum, c) => sum + parseInt(c.totalMessages), 0),
                activeAgents: agentStatsR.rows.length,
            },
        });
    } catch (error) {
        console.error('Activity stats error:', error);
        res.json({ agentStats: [], recentActivity: [], weeklyTimeline: [], totals: {} });
    }
});

export default router;
