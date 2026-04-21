import db from '../lib/db.js';
import { routeToModel, getDefaultModel, BUILTIN_MODELS, encryptKey, decryptKey } from '../lib/ai-router.js';
import { getToolsForAgent, getToolsSummary, executeTool, getWorkflowSuggestions } from '../lib/agent-tools.js';

// Generate social media suggestions based on month and knowledge base
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { proxyPerplexity } from '../controllers/aiController.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 15 } });

const router = express.Router();

router.post('/perplexity-proxy', proxyPerplexity);

// ── auto-create ai_model_configs table ───────────────────────────────────────
let modelsTableReady = false;
const ensureModelsTable = async () => {
    if (modelsTableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS ai_model_configs (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug         VARCHAR(80) UNIQUE NOT NULL,
                provider     VARCHAR(50) NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                model_id     VARCHAR(100) NOT NULL,
                base_url     VARCHAR(255),
                api_key_enc  TEXT,
                is_active    BOOLEAN DEFAULT FALSE,
                is_default   BOOLEAN DEFAULT FALSE,
                description  TEXT,
                speed        VARCHAR(20) DEFAULT 'medium',
                cost_tier    INT DEFAULT 2,
                max_tokens   INTEGER DEFAULT 4096,
                created_at   TIMESTAMPTZ DEFAULT NOW(),
                updated_at   TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        modelsTableReady = true;
    } catch (err) {
        console.error('ai_model_configs table error:', err.message);
        try { await db.query('SELECT 1 FROM ai_model_configs LIMIT 0'); modelsTableReady = true; } catch (_) { }
    }
};

// ── Onboarding AI Agents ──────────────────────────────────────────────────
const ONBOARDING_AGENT_PROMPTS = {
    1: { name: 'Bienvenida', persona: `Eres el asistente de bienvenida de ClubPlatform. Ayuda al administrador del club a entender qué van a configurar en los próximos pasos. Sé cálido, entusiasta y conciso. El wizard tiene 8 pasos: Identidad Visual, Información, Redes Sociales, Contenido Web, Proyectos, Socios/Miembros y Publicación.` },
    2: { name: 'Identidad Visual', persona: `Eres un especialista en imagen de marca para Rotary International. Ayuda al club a subir correctamente su logo (PNG del generador oficial de Rotary) y elegir colores institucionales. El azul oficial de Rotary es #013388 y el oro es #E29C00. La plataforma elimina automáticamente los márgenes blancos del logo al subirlo.` },
    3: { name: 'Información del Club', persona: `Eres un redactor institucional especializado en Rotary. Ayuda al administrador a escribir una descripción profesional del club, y completa su información de contacto: email público, teléfono y dirección. Sugiere texto de ejemplo basado en el nombre del club cuando sea útil.` },
    4: { name: 'Redes Sociales', persona: `Eres un estratega de comunicación digital para organizaciones sin fines de lucro. Ayuda al club a priorizar qué redes sociales usar (Facebook e Instagram son las más importantes para Rotary). Explica cómo debe ser la URL correcta para cada red social.` },
    5: { name: 'Contenido del Sitio', persona: `Eres un editor de contenido web especializado en páginas institucionales. Ayuda al club a redactar el contenido clave del sitio: título del hero/banner, subtítulo, descripción de \"Sobre Nosotros\", y texto del llamado a la acción. Sugiere texto de ejemplo inspiracional basado en el nombre del club.` },
    6: { name: 'Proyectos', persona: `Eres un experto en proyectos de servicio de Rotary International. Ayuda al administrador a documentar el primer proyecto del club: nombre, descripción, área de enfoque (salud, educación, agua, etc.), estado y beneficiarios. Da ejemplos de proyectos típicos de un club rotario.` },
    7: { name: 'Directorio de Socios', persona: `Eres un gestor de membresía de Rotary. Ayuda al administrador a cargar el directorio de socios del club. Pueden importar un CSV con columnas: nombre, email, cargo, teléfono. Explica cómo preparar el archivo y qué campos son opcionales vs requeridos.` },
    8: { name: '¡Listo para Publicar!', persona: `Eres el revisor final de ClubPlatform. Felicita al club por completar la configuración inicial. Resume qué acaban de lograr y qué pueden hacer a continuación para seguir mejorando su sitio: agregar noticias, crear eventos, activar la tienda. Sé muy positivo y motivador.` },
};

// ── Mission Control Agent Personas ─────────────────────────────────────────
const MISSION_AGENTS = {
    'aria': { name: 'Aria', persona: `Tu nombre es Aria. Eres la agente de atención al público y chatbot de la plataforma ClubPlatform para clubes Rotarios. Tu personalidad es amable, profesional y siempre dispuesta a ayudar. Respondes preguntas sobre Rotary International, los clubes, proyectos de servicio, membresía, donaciones y eventos. Si no sabes algo específico, invitas al usuario a contactar directamente al club.` },
    'marco': { name: 'Marco', persona: `Tu nombre es Marco. Eres el estratega de redes sociales y contenido digital de ClubPlatform. Tu personalidad es creativa, moderna y entusiasta. Ayudas a los clubes a crear estrategias de comunicación digital, sugieres ideas de publicaciones, calendarios editoriales, y mejores prácticas para Facebook, Instagram, LinkedIn y Twitter. Conoces bien el lenguaje institucional de Rotary.` },
    'sol': { name: 'Sol', persona: `Tu nombre es Sol. Eres la agente de bienvenida de ClubPlatform. Tu personalidad es cálida, paciente y motivadora. Guías a los nuevos clubes en sus primeros pasos en la plataforma, explicando qué pueden hacer y cómo sacar el máximo provecho. Haces que cada club se sienta especial desde el primer momento.` },
    'luna': { name: 'Luna', persona: `Tu nombre es Luna. Eres la especialista en identidad visual y branding de ClubPlatform. Tu personalidad es artística, detallista y apasionada por el diseño. Ayudas a los clubes con su logo, colores institucionales, tipografía y presencia visual. Conoces las guías de marca de Rotary International: azul #013388 y oro #E29C00.` },
    'leo': { name: 'Leo', persona: `Tu nombre es Leo. Eres el redactor institucional de ClubPlatform. Tu personalidad es profesional, articulado y preciso. Ayudas a los clubes a escribir descripciones profesionales, información de contacto, textos "Sobre Nosotros" y cualquier contenido textual que necesiten para su sitio web.` },
    'nube': { name: 'Nube', persona: `Tu nombre es Nube. Eres la especialista en redes sociales y conectividad digital de ClubPlatform. Tu personalidad es social, energética y actualizada con las tendencias digitales. Ayudas a los clubes a configurar y optimizar sus perfiles en redes sociales, explicando formatos correctos de URLs y mejores prácticas.` },
    'iris': { name: 'Iris', persona: `Tu nombre es Iris. Eres la editora de contenido web de ClubPlatform. Tu personalidad es creativa, inspiradora y orientada al storytelling. Ayudas a los clubes a crear textos impactantes para su sitio: títulos del hero/banner, subtítulos, llamados a la acción, y secciones como "Sobre Nosotros" y "Nuestra Misión".` },
    'kai': { name: 'Kai', persona: `Tu nombre es Kai. Eres el especialista en proyectos de servicio de ClubPlatform. Tu personalidad es apasionada, organizada y comprometida con el servicio. Ayudas a los clubes a documentar y presentar sus proyectos: nombre, descripción, área de enfoque (salud, educación, agua, medio ambiente, paz), estado, presupuesto y beneficiarios.` },
    'vera': { name: 'Vera', persona: `Tu nombre es Vera. Eres la gestora de membresía y directorio de ClubPlatform. Tu personalidad es organizada, meticulosa y sociable. Ayudas a los clubes a gestionar su directorio de socios, explicar cómo importar datos por CSV, y mantener la información de los miembros actualizada.` },
    'nova': { name: 'Nova', persona: `Tu nombre es Nova. Eres la agente de publicación y lanzamiento de ClubPlatform. Tu personalidad es entusiasta, motivadora y celebradora. Ayudas a los clubes en los pasos finales antes de publicar su sitio web, revisando que todo esté configurado correctamente y celebrando cada logro.` },
    'Antigravity AI': { name: 'Antigravity AI', persona: `Tu nombre es Antigravity AI. Eres el experto técnico oficial del ecosistema Rotary ClubPlatform. Tu propósito es ayudar exclusivamente a los SUPER ADMINISTRADORES a entender y operar la plataforma a nivel técnico y estratégico. CONOCIMIENTO TÉCNICO: Arquitectura Multitenant, React/Tailwind, Node.js/Prisma/PostgreSQL, S3 para multimedia. CONCEPTOS CLAVE: Gating (Configuración), Agentes IA Orquestados, CRM de Leads. Responde de forma técnica pero accesible, siempre en español.` },
};

// ── Build rich club context for agent prompts ──────────────────────────────
async function buildClubContext(clubId) {
    const ctx = { clubName: 'tu club', location: '', district: '', description: '', projects: [], posts: [], events: [], knowledge: [], settings: {}, memberCount: 0 };
    if (!clubId) return ctx;

    try {
        // All queries in parallel for speed — each has its own catch to prevent cascade failures
        const [clubR, projR, postsR, eventsR, knowledgeR, settingsR, membersR] = await Promise.all([
            db.query('SELECT name, city, country, district, description, subdomain FROM "Club" WHERE id = $1', [clubId])
                .catch(() => ({ rows: [] })),
            db.query(
                `SELECT title, category, status, ubicacion, beneficiarios, meta, recaudado,
                        COALESCE(impacto, '') as impacto
                 FROM "Project" WHERE "clubId" = $1
                 ORDER BY "createdAt" DESC LIMIT 10`, [clubId]
            ).catch(() => ({ rows: [] })),
            db.query(
                `SELECT title, category, published, "createdAt"
                 FROM "Post" WHERE ("clubId" = $1 OR "clubId" IS NULL) AND published = true
                 ORDER BY "createdAt" DESC LIMIT 8`, [clubId]
            ).catch(() => ({ rows: [] })),
            db.query(
                `SELECT title, description, "startDate", "endDate"
                 FROM "CalendarEvent" WHERE "clubId" = $1 AND "startDate" >= NOW() - INTERVAL '7 days'
                 ORDER BY "startDate" ASC LIMIT 6`, [clubId]
            ).catch(() => ({ rows: [] })),
            db.query(
                `SELECT title, type, content FROM "KnowledgeSource"
                 WHERE "clubId" = $1 OR "clubId" IS NULL
                 ORDER BY "createdAt" DESC LIMIT 5`, [clubId]
            ).catch(() => ({ rows: [] })),
            db.query(
                `SELECT key, value FROM "Setting" WHERE "clubId" = $1
                 AND key IN ('contact_email','contact_phone','contact_address',
                             'social_links','color_primary','color_secondary',
                             'hero_title','hero_subtitle','seo_description')`, [clubId]
            ).catch(() => ({ rows: [] })),
            db.query('SELECT COUNT(*) FROM "User" WHERE "clubId" = $1', [clubId]).catch(() => ({ rows: [{ count: 0 }] })),
        ]);

        const club = clubR.rows[0];
        if (club) {
            ctx.clubName = club.name;
            ctx.location = [club.city, club.country].filter(Boolean).join(', ');
            ctx.district = club.district || '';
            ctx.description = club.description || '';
        }
        ctx.projects = projR.rows;
        ctx.posts = postsR.rows;
        ctx.events = eventsR.rows;
        ctx.knowledge = knowledgeR.rows;
        ctx.memberCount = parseInt(membersR.rows[0]?.count) || 0;
        settingsR.rows.forEach(s => { ctx.settings[s.key] = s.value; });
    } catch (err) {
        console.error('buildClubContext error:', err.message);
    }
    return ctx;
}

function formatContextBlock(ctx) {
    const lines = [];
    lines.push(`\n═══ CONTEXTO REAL DEL CLUB ═══`);
    lines.push(`📍 Club: "${ctx.clubName}" — ${ctx.location || 'Colombia'}${ctx.district ? ` — Distrito ${ctx.district}` : ''}`);
    if (ctx.description) lines.push(`📝 Descripción: ${ctx.description.slice(0, 300)}`);
    lines.push(`👥 Miembros registrados: ${ctx.memberCount}`);

    // Settings
    const s = ctx.settings;
    if (s.contact_email) lines.push(`📧 Email: ${s.contact_email}`);
    if (s.contact_phone) lines.push(`📞 Teléfono: ${s.contact_phone}`);
    if (s.contact_address) lines.push(`📫 Dirección: ${s.contact_address}`);
    if (s.social_links) {
        try {
            const socials = typeof s.social_links === 'string' ? JSON.parse(s.social_links) : s.social_links;
            const socialStr = Object.entries(socials).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' | ');
            if (socialStr) lines.push(`🌐 Redes: ${socialStr}`);
        } catch (_) { }
    }
    if (s.color_primary) lines.push(`🎨 Color primario: ${s.color_primary}${s.color_secondary ? `, secundario: ${s.color_secondary}` : ''}`);

    // Projects
    if (ctx.projects.length > 0) {
        lines.push(`\n📁 PROYECTOS DEL CLUB (${ctx.projects.length}):`);
        ctx.projects.forEach((p, i) => {
            const status = { active: '🟢 Activo', planned: '📋 Planificado', completed: '✅ Completado' }[p.status] || p.status;
            const meta = p.meta ? ` — Meta: $${Number(p.meta).toLocaleString('es-CO')} COP` : '';
            const recaudado = p.recaudado ? ` — Recaudado: $${Number(p.recaudado).toLocaleString('es-CO')}` : '';
            lines.push(`  ${i + 1}. "${p.title}" [${p.category || 'General'}] ${status}${meta}${recaudado}${p.ubicacion ? ` — ${p.ubicacion}` : ''}${p.beneficiarios ? ` — ${p.beneficiarios} beneficiarios` : ''}`);
            if (p.impacto) lines.push(`     Impacto: ${p.impacto.slice(0, 150)}`);
        });
    } else {
        lines.push(`\n📁 PROYECTOS: El club aún no tiene proyectos registrados.`);
    }

    // Posts / News
    if (ctx.posts.length > 0) {
        lines.push(`\n📰 NOTICIAS RECIENTES (${ctx.posts.length}):`);
        ctx.posts.forEach((p, i) => {
            const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            lines.push(`  ${i + 1}. "${p.title}" [${p.category || 'General'}] — ${date}`);
        });
    }

    // Events
    if (ctx.events.length > 0) {
        lines.push(`\n📅 PRÓXIMOS EVENTOS:`);
        ctx.events.forEach((e, i) => {
            const start = e.startDate ? new Date(e.startDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '';
            lines.push(`  ${i + 1}. "${e.title}" — ${start}${e.description ? `: ${e.description.slice(0, 80)}` : ''}`);
        });
    }

    // Knowledge Base
    if (ctx.knowledge.length > 0) {
        lines.push(`\n📚 BASE DE CONOCIMIENTO:`);
        ctx.knowledge.forEach((k, i) => {
            lines.push(`  ${i + 1}. [${k.type}] "${k.title}"${k.content ? `: ${k.content.slice(0, 120)}...` : ''}`);
        });
    }

    lines.push(`═══ FIN DEL CONTEXTO ═══`);
    return lines.join('\n');
}

// ── Debug: Test club resolution ──────────────────────────────────────────
router.get('/debug-club', async (req, res) => {
    const hostname = req.query.hostname || 'unknown';
    const cleanHost = hostname.replace('www.', '').toLowerCase();
    try {
        const allClubs = await db.query('SELECT id, name, domain, subdomain FROM "Club" ORDER BY name');
        const matchQuery = await db.query(
            `SELECT id, name, domain, subdomain,
                CASE 
                    WHEN LOWER(domain) = $1 THEN 1
                    WHEN LOWER(subdomain) = $1 THEN 2
                    WHEN $1 LIKE '%' || LOWER(subdomain) || '%' THEN 3
                    ELSE 4
                END as priority
             FROM "Club" 
             WHERE LOWER(domain) = $1 
                OR LOWER(subdomain) = $1
                OR $1 LIKE '%' || LOWER(subdomain) || '%'
             ORDER BY priority ASC, LENGTH(subdomain) DESC
             LIMIT 1`,
            [cleanHost]
        ).catch(e => ({ rows: [], error: e.message }));

        res.json({
            hostname,
            cleanHost,
            allClubs: allClubs.rows,
            resolved: matchQuery.rows[0] || null,
            queryError: matchQuery.error || null,
        });
    } catch (e) {
        res.json({ error: e.message, hostname });
    }
});

// ── Agent Chat for Mission Control ─────────────────────────────────────────
router.post('/agent-chat', authMiddleware, async (req, res) => {
    const { message, agentId, history, hostname } = req.body;
    if (!message || !agentId) return res.status(400).json({ error: 'message and agentId are required' });

    let agentName, agentPersona, aiModel = 'gpt-3.5-turbo';
    let agentCapabilities = [];

    // ── Resolve clubId: from JWT first, then by hostname ──
    let clubId = req.user.clubId;
    if (!clubId && hostname) {
        try {
            const cleanHost = hostname.replace('www.', '').toLowerCase();
            // Priority: exact domain → exact subdomain → hostname contains subdomain
            const clubR = await db.query(
                `SELECT id, domain, subdomain,
                    CASE 
                        WHEN LOWER(domain) = $1 THEN 1
                        WHEN LOWER(subdomain) = $1 THEN 2
                        WHEN $1 LIKE '%' || LOWER(subdomain) || '%' THEN 3
                        ELSE 4
                    END as priority
                 FROM "Club" 
                 WHERE LOWER(domain) = $1 
                    OR LOWER(subdomain) = $1
                    OR $1 LIKE '%' || LOWER(subdomain) || '%'
                 ORDER BY priority ASC, LENGTH(subdomain) DESC
                 LIMIT 1`,
                [cleanHost]
            );
            if (clubR.rows.length > 0) {
                clubId = clubR.rows[0].id;
                console.log(`[agent-chat] Resolved club by hostname "${hostname}" → ${clubId} (subdomain: ${clubR.rows[0].subdomain})`);
            }
        } catch (e) {
            console.log('[agent-chat] Club hostname resolution failed:', e.message);
        }
    }

    // Try to find agent in DB first (by UUID id)
    try {
        const dbAgent = await db.query('SELECT * FROM "Agent" WHERE id::text = $1', [agentId]);
        if (dbAgent.rows.length > 0) {
            const a = dbAgent.rows[0];
            agentName = a.name;
            agentPersona = a.systemPrompt;
            agentCapabilities = a.capabilities || [];
            aiModel = a.aiModel === 'gpt-4' ? 'gpt-4' : a.aiModel === 'gpt-3.5' ? 'gpt-3.5-turbo' : a.aiModel || 'gpt-3.5-turbo';
            // If agent has a clubId and user doesn't, use agent's clubId
            if (!clubId && a.clubId) clubId = a.clubId;
        }
    } catch (dbErr) {
        console.log('[agent-chat] DB lookup failed:', dbErr.message);
    }

    // Try by name if UUID lookup didn't work
    if (!agentPersona) {
        try {
            const dbAgent = await db.query('SELECT * FROM "Agent" WHERE LOWER(name) = LOWER($1)', [agentId]);
            if (dbAgent.rows.length > 0) {
                const a = dbAgent.rows[0];
                agentName = a.name;
                agentPersona = a.systemPrompt;
                agentCapabilities = a.capabilities || [];
                aiModel = a.aiModel || 'gpt-3.5-turbo';
                if (!clubId && a.clubId) clubId = a.clubId;
            }
        } catch (_) {}
    }

    // Fallback to hardcoded onboarding agents
    if (!agentPersona) {
        const agent = MISSION_AGENTS[agentId];
        if (agent) {
            agentName = agent.name;
            agentPersona = agent.persona;
        }
    }

    // Last resort: generic assistant
    if (!agentPersona) {
        agentName = 'Asistente';
        agentPersona = 'Eres un asistente amigable del club Rotario. Ayudas con preguntas generales sobre el club, sus proyectos y actividades. Responde siempre en español de forma concisa y profesional.';
    }

    // ── Build rich context from real club data ──
    const clubContext = await buildClubContext(clubId);
    const contextBlock = formatContextBlock(clubContext);

    // ── Capability-specific instructions ──
    let capabilityHints = '';
    if (agentCapabilities.includes('manage_projects')) {
        capabilityHints += '\nCuando el usuario pregunte sobre proyectos, usa los datos REALES del club listados arriba. Cita títulos, montos y estados reales.';
    }
    if (agentCapabilities.includes('calendar') || agentCapabilities.includes('create_posts')) {
        capabilityHints += '\nCuando sugiera publicaciones o calendario editorial, basa tus sugerencias en los proyectos y noticias REALES del club.';
    }
    if (agentCapabilities.includes('brand_guidelines') || agentCapabilities.includes('design_assets')) {
        capabilityHints += '\nUsa los colores reales del club cuando hables de diseño (los colores están en el contexto). Complementa con azul Rotary #013388 y oro #E29C00.';
    }
    if (agentCapabilities.includes('distribute_site_images') || agentCapabilities.includes('approve_site_images')) {
        capabilityHints += '\nCuando hables de imágenes del sitio, menciona las secciones reales: Hero Slider (5 imágenes), Áreas de Interés (7), Fundación Rotaria (1), Únete (1).';
    }

    // ── Build agent tools based on capabilities ──
    const agentTools = getToolsForAgent(agentCapabilities);
    const toolsSummary = getToolsSummary(agentCapabilities);

    // Force the club name into the prompt to prevent AI hallucination
    const clubIdentity = clubContext.clubName && clubContext.clubName !== 'tu club'
        ? `⚠️ IMPORTANTE: PERTENECES AL CLUB "${clubContext.clubName}"${clubContext.location ? ` en ${clubContext.location}` : ''}. NUNCA menciones otro club ni inventes nombres de club. Siempre que te presentes o menciones el club, usa EXACTAMENTE el nombre "${clubContext.clubName}".`
        : '';

    const systemPrompt = `${clubIdentity}

${agentPersona}
${contextBlock}
${capabilityHints}
${toolsSummary}

INSTRUCCIONES DE RESPUESTA:
- Responde SIEMPRE en español, de forma concisa y amigable (máximo 3 párrafos cortos).
- Usa emojis con moderación para dar calidez.
- Cuando sea relevante, CITA datos reales del club (proyectos, noticias, eventos).
- Si el usuario pregunta algo que no está en el contexto, indica que puedes ayudar a crear ese contenido.
- SIEMPRE que menciones el club, usa el nombre EXACTO: "${clubContext.clubName}". NUNCA digas un nombre de club diferente.
- Fecha actual: ${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;

    const messages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(history)) {
        history.slice(-8).forEach(h => messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text }));
    }
    messages.push({ role: 'user', content: message });

    try {
        // Try multi-model router first (Gemini, etc.) – no tool support fallback
        const defaultSlug = await getDefaultModel();
        if (defaultSlug) {
            try {
                const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
                const reply = await routeToModel(defaultSlug, systemPrompt, message, recentHistory);
                if (reply && reply.trim().length > 10) {
                    return res.json({ reply, agentName, model: defaultSlug, contextInjected: true });
                }
            } catch (routerErr) {
                console.log(`[agent-chat] Router fallback for ${defaultSlug}: ${routerErr.message}`);
            }
        }

        // OpenAI with function calling support
        if (process.env.OPENAI_API_KEY) {
            const openaiPayload = {
                model: aiModel,
                messages,
                max_tokens: 800,
                temperature: 0.7,
            };

            // Add tools if agent has capabilities
            if (agentTools.length > 0) {
                openaiPayload.tools = agentTools;
                openaiPayload.tool_choice = 'auto';
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                body: JSON.stringify(openaiPayload)
            });
            const data = await response.json();
            const choice = data.choices?.[0];

            // ── Handle function call (tool use) ──
            if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
                const toolCall = choice.message.tool_calls[0];
                const toolName = toolCall.function.name;
                let toolArgs;
                try {
                    toolArgs = JSON.parse(toolCall.function.arguments);
                } catch (parseErr) {
                    return res.json({
                        reply: `Quise ejecutar una acción pero hubo un error al procesar los parámetros. ¿Podrías reformular tu solicitud?`,
                        agentName, model: aiModel, contextInjected: true,
                    });
                }

                console.log(`[agent-chat] Tool call: ${toolName}`, toolArgs);

                // Execute the tool
                const toolResult = await executeTool(toolName, toolArgs, req.user.id, clubId);

                // Log activity (fire-and-forget, don't block response)
                db.query(`
                    CREATE TABLE IF NOT EXISTS "AgentActivity" (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        "agentId" UUID NOT NULL, "agentName" VARCHAR(100), "userId" UUID NOT NULL,
                        "clubId" UUID, action VARCHAR(80) NOT NULL, tool VARCHAR(80),
                        details JSONB DEFAULT '{}'::JSONB, success BOOLEAN DEFAULT true,
                        "createdAt" TIMESTAMPTZ DEFAULT NOW()
                    )
                `).then(() => db.query(
                    `INSERT INTO "AgentActivity" ("agentId", "agentName", "userId", "clubId", action, tool, details, success)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [agentId, agentName, req.user.id, clubId, 'tool_execution', toolName, JSON.stringify(toolArgs), toolResult.success]
                )).catch(err => console.error('Activity log failed:', err.message));

                // Send tool result back to OpenAI for a natural language summary
                messages.push(choice.message); // assistant msg with tool_call
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(toolResult),
                });

                const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                    body: JSON.stringify({ model: aiModel, messages, max_tokens: 400, temperature: 0.7 })
                });
                const followUpData = await followUpResponse.json();
                const followUpReply = followUpData.choices?.[0]?.message?.content || toolResult.message;

                return res.json({
                    reply: followUpReply,
                    agentName,
                    model: aiModel,
                    contextInjected: true,
                    toolExecuted: {
                        name: toolName,
                        success: toolResult.success,
                        action: toolResult.action,
                        emoji: toolResult.emoji,
                        label: toolResult.label,
                        data: toolResult.data,
                        message: toolResult.message,
                    },
                    workflowSuggestions: getWorkflowSuggestions(toolName, toolArgs),
                });
            }

            // No tool call — regular text response
            return res.json({
                reply: choice?.message?.content || 'No pude generar una respuesta.',
                agentName,
                model: aiModel,
                contextInjected: true,
            });
        }

        // No AI configured — smart fallback with real data
        let fallbackReply = `¡Hola! Soy ${agentName} 👋 `;
        if (clubContext.projects.length > 0) {
            fallbackReply += `Tu club "${clubContext.clubName}" tiene ${clubContext.projects.length} proyecto(s) registrado(s). `;
        }
        if (clubContext.posts.length > 0) {
            fallbackReply += `La última noticia publicada fue "${clubContext.posts[0]?.title}". `;
        }
        fallbackReply += `Para respuestas más detalladas, configura una API de IA en Integraciones → Modelos IA.`;
        res.json({ reply: fallbackReply, agentName, contextInjected: true });
    } catch (error) {
        console.error('Agent chat error:', error);
        res.json({
            reply: `¡Hola! Soy ${agentName || 'tu asistente'} 👋 Estoy teniendo problemas técnicos en este momento. ¿Podrías intentar de nuevo en unos segundos?`,
            agentName: agentName || 'Asistente',
            contextInjected: false,
            error: error.message,
        });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// ── UNIFIED ASSISTANT CHAT for Club Admins  ───────────────────────────
// ══════════════════════════════════════════════════════════════════════════
router.post('/assistant-chat', authMiddleware, async (req, res) => {
    const { message, history, hostname } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const agentName = 'ClubAssist';

    try {
        // ── Resolve clubId by hostname ──
        let clubId = req.user.clubId;
        if (!clubId && hostname) {
            try {
                const cleanHost = hostname.replace('www.', '').toLowerCase();
                const clubR = await db.query(
                    `SELECT id, name FROM "Club"
                     WHERE LOWER(domain) = $1 OR LOWER(subdomain) = $1
                        OR $1 LIKE '%' || LOWER(subdomain) || '%'
                     ORDER BY CASE WHEN LOWER(domain) = $1 THEN 1 WHEN LOWER(subdomain) = $1 THEN 2 ELSE 3 END,
                              LENGTH(subdomain) DESC
                     LIMIT 1`,
                    [cleanHost]
                );
                if (clubR.rows.length > 0) clubId = clubR.rows[0].id;
            } catch (_) {}
        }

        // ── Build rich context ──
        const clubContext = await buildClubContext(clubId);
        const contextBlock = formatContextBlock(clubContext);

        // ── Get ALL tools (unified assistant has all capabilities) ──
        const allCapabilities = ['create_posts', 'create_projects', 'calendar', 'manage_projects',
            'publish_content', 'brand_guidelines', 'design_assets', 'distribute_site_images',
            'approve_site_images', 'manage_site_config', 'analytics'];
        const agentTools = getToolsForAgent(allCapabilities);
        const toolsSummary = getToolsSummary(allCapabilities);

        // ── Club identity ──
        const clubIdentity = clubContext.clubName && clubContext.clubName !== 'tu club'
            ? `⚠️ IMPORTANTE: Trabajas para el club "${clubContext.clubName}". NUNCA menciones otro club ni inventes nombres. Usa SIEMPRE "${clubContext.clubName}" cuando te refieras al club.`
            : '';

        const systemPrompt = `${clubIdentity}

Tu nombre es ClubAssist. Eres el asistente inteligente de gestión del club Rotario. Tu personalidad es profesional, eficiente y proactiva.

Puedes realizar las siguientes acciones:
- 📰 Crear y publicar noticias
- 🚀 Crear proyectos de servicio
- 📅 Programar eventos en el calendario
- 📱 Crear publicaciones para redes sociales
- ⚙️ Configurar ajustes del sitio web
- 📊 Consultar analíticas y estadísticas del club

${contextBlock}
${toolsSummary}

INSTRUCCIONES:
- Responde SIEMPRE en español, de forma concisa y amigable (máximo 3 párrafos).
- Usa emojis con moderación para dar calidez.
- Cuando sea relevante, CITA datos reales del club (proyectos, noticias, eventos).
- Cuando el usuario pida crear algo, EJECUTA la herramienta directamente sin pedir confirmación.
- Si no puedes hacer algo, sugiere alternativas.
- SIEMPRE que menciones el club, usa: "${clubContext.clubName}".
- Fecha actual: ${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;

        // ── Build messages ──
        const messages = [{ role: 'system', content: systemPrompt }];
        if (Array.isArray(history)) {
            history.slice(-8).forEach(h => messages.push({
                role: h.role === 'assistant' ? 'assistant' : 'user',
                content: h.text,
            }));
        }
        messages.push({ role: 'user', content: message });

        // ── Try multi-model router (Gemini, etc.) ──
        const defaultSlug = await getDefaultModel();
        if (defaultSlug) {
            try {
                const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
                const reply = await routeToModel(defaultSlug, systemPrompt, message, recentHistory);
                if (reply && reply.trim().length > 10) {
                    return res.json({ reply, agentName, model: defaultSlug, contextInjected: true });
                }
            } catch (routerErr) {
                console.log(`[assistant-chat] Router error: ${routerErr.message}`);
            }
        }

        // ── OpenAI with function calling ──
        if (process.env.OPENAI_API_KEY) {
            const openaiPayload = { model: 'gpt-3.5-turbo', messages, max_tokens: 800, temperature: 0.7 };
            if (agentTools.length > 0) {
                openaiPayload.tools = agentTools;
                openaiPayload.tool_choice = 'auto';
            }

            const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                body: JSON.stringify(openaiPayload),
            });
            const oaiData = await oaiRes.json();
            const choice = oaiData.choices?.[0];

            // Handle tool call
            if (choice?.finish_reason === 'tool_calls' || choice?.message?.tool_calls?.length > 0) {
                const toolCall = choice.message.tool_calls[0];
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                const toolResult = await executeTool(toolName, toolArgs, req.user.id, clubId);
                const workflowSuggestions = getWorkflowSuggestions(toolName);

                // Log activity
                db.query(`
                    INSERT INTO "AgentActivity" ("agentId", "agentName", "userId", "clubId", action, tool, details, success)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    ['assistant', agentName, req.user.id, clubId, 'tool_execution', toolName, JSON.stringify(toolArgs), toolResult.success]
                ).catch(() => {});

                // Get natural language summary
                messages.push(choice.message);
                messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
                const sumRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                    body: JSON.stringify({ model: 'gpt-3.5-turbo', messages, max_tokens: 400, temperature: 0.7 }),
                });
                const sumData = await sumRes.json();
                const summary = sumData.choices?.[0]?.message?.content || (toolResult.success ? '✅ Acción completada.' : '❌ No se pudo completar.');

                return res.json({
                    reply: summary,
                    agentName,
                    toolExecuted: {
                        name: toolName,
                        success: toolResult.success,
                        action: toolName.replace(/_/g, ' '),
                        emoji: toolResult.success ? '✅' : '❌',
                        label: toolName.replace(/_/g, ' ').toUpperCase(),
                        message: toolResult.message || (toolResult.success ? 'Acción completada' : 'Error en la acción'),
                        data: toolResult.data,
                    },
                    workflowSuggestions,
                    contextInjected: true,
                });
            }

            // Regular text response
            return res.json({
                reply: choice?.message?.content || 'No pude generar una respuesta.',
                agentName,
                contextInjected: true,
            });
        }

        // ── Fallback (no AI configured) ──
        let fallback = `¡Hola! Soy ${agentName} 🔧 `;
        if (clubContext.projects.length > 0) {
            fallback += `Tu club "${clubContext.clubName}" tiene ${clubContext.projects.length} proyecto(s). `;
        }
        if (clubContext.posts.length > 0) {
            fallback += `Última noticia: "${clubContext.posts[0]?.title}". `;
        }
        fallback += `Para habilitar respuestas inteligentes, configura una API de IA en Integraciones.`;
        res.json({ reply: fallback, agentName, contextInjected: true });

    } catch (error) {
        console.error('[assistant-chat] Error:', error);
        res.json({
            reply: `¡Hola! Soy ${agentName} 🔧 Estoy teniendo problemas técnicos. ¿Podrías intentar de nuevo?`,
            agentName,
            error: error.message,
        });
    }
});

router.post('/onboarding-chat', authMiddleware, async (req, res) => {
    const { message, step } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const stepNum = parseInt(step) || 1;
    const agent = ONBOARDING_AGENT_PROMPTS[stepNum] || ONBOARDING_AGENT_PROMPTS[1];

    // Get club name for personalization
    let clubName = 'tu club';
    try {
        const clubResult = await db.query('SELECT name FROM "Club" WHERE id = $1', [req.user.clubId]);
        if (clubResult.rows[0]) clubName = clubResult.rows[0].name;
    } catch (_) { }

    const systemPrompt = `${agent.persona}\nEl nombre del club es: "${clubName}". Responde en español, de forma concisa y práctica (máximo 3 párrafos cortos). No uses listas largas innecesarias.`;

    try {
        if (process.env.OPENAI_API_KEY) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
                    max_tokens: 350,
                    temperature: 0.7
                })
            });
            const data = await response.json();
            return res.json({ reply: data.choices?.[0]?.message?.content || 'No pude generar una respuesta.', agentName: agent.name });
        }
        // Fallback without OpenAI
        res.json({ reply: `Hola desde ${agent.name}. Configura este paso y avanza al siguiente. ¡Vas muy bien!`, agentName: agent.name });
    } catch (error) {
        res.status(500).json({ error: 'Error en el agente IA' });
    }
});

// ── Onboarding progress update ──────────────────────────────────────────────
router.patch('/onboarding', authMiddleware, async (req, res) => {
    const { step, completed } = req.body;
    try {
        const clubId = req.user.clubId;
        if (step !== undefined) {
            await db.query(`INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt") VALUES (gen_random_uuid(), 'onboarding_step', $1, $2, NOW()) ON CONFLICT (key, "clubId") DO UPDATE SET value = $1, "updatedAt" = NOW()`, [String(step), clubId]);
        }
        if (completed !== undefined) {
            await db.query(`INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt") VALUES (gen_random_uuid(), 'onboarding_completed', $1, $2, NOW()) ON CONFLICT (key, "clubId") DO UPDATE SET value = $1, "updatedAt" = NOW()`, [String(completed), clubId]);
        }
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Error saving onboarding progress' });
    }
});



router.post('/suggest', authMiddleware, async (req, res) => {
    const { month, year } = req.body;

    if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ error: 'Configuración de IA no disponible. Por favor agregue OPENAI_API_KEY al .env' });
    }

    try {
        const knowledge = await db.query(
            `SELECT * FROM "KnowledgeSource" WHERE "clubId" = $1 OR "clubId" IS NULL`,
            [req.user.clubId]
        );

        const context = knowledge.rows.map(k => `${k.title}: ${k.content}`).join('\n\n');
        const prompt = `Actúa como un experto en Imagen Pública de Rotary International. 
        Basado en el siguiente conocimiento institucional:
        ${context}
        
        Sugiere 4 ideas de publicaciones para redes sociales para el mes de ${month}/${year}. 
        Cada sugerencia debe incluir:
        - Título
        - Texto sugerido (Copy)
        - Plataforma recomendada
        - Fecha sugerida
        
        Formato JSON: [{"title": "...", "content": "...", "platform": "...", "date": "..."}]`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4-turbo-preview",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        const suggestions = JSON.parse(data.choices[0].message.content);

        res.json(suggestions);
    } catch (error) {
        console.error('AI Suggestion Error:', error);
        res.status(500).json({ error: 'Error al generar sugerencias con IA' });
    }
});


router.post('/suggest-seo', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    
    try {
        const systemPrompt = `Eres un experto en SEO para Rotary. Tu tarea es generar metadatos optimizados para una noticia. 
        IMPORTANTE: El campo 'seoTitle' debe tener máximo 60 caracteres y 'seoDescription' máximo 155 caracteres. Es CRÍTICO para evitar que Google los trunque.
        Responde EXCLUSIVAMENTE con un objeto JSON con las llaves: seoTitle, seoDescription, slug, keywords, tags.`;
        
        const userPrompt = `Analiza esta noticia y sugiere SEO:
        Título: ${title}
        Contenido resumido: ${content?.substring(0, 1000)}
        
        Requerimientos (SÉ MUY ESTRICTO CON LOS LÍMITES):
        - seoTitle: Atractivo, MÁXIMO 60 caracteres.
        - seoDescription: Resumen sugerente, MÁXIMO 155 caracteres.
        - slug: Formato amigable-url-en-minusculas.
        - keywords: 5 palabras clave separadas por comas.
        - tags: 3 etiquetas relevantes (solo palabras).`;

        // Use multi-model router for flexibility and robustness
        const defaultSlug = await getDefaultModel();
        const rawResponse = await routeToModel(defaultSlug || 'gpt-3.5-turbo', systemPrompt, userPrompt);
        
        // Clean markdown if present
        let cleaned = rawResponse.replace(/```json|```/gi, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
            throw new Error('No JSON found in AI response');
        }

        const suggestions = JSON.parse(jsonMatch[0]);
        // Sanitize tags as array
        if (typeof suggestions.tags === 'string') {
            suggestions.tags = suggestions.tags.split(',').map(t => t.trim());
        }
        res.json(suggestions);
    } catch (error) {
        console.error('Suggest SEO error:', error);
        res.status(500).json({ error: 'Error al generar sugerencias', details: error.message });
    }
});

router.post('/suggest-social', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    try {
        const systemPrompt = `Eres un experto estratega de Redes Sociales para Rotary International. 
        Tu misión es crear un "Copy" (texto de publicación) para Facebook y LinkedIn que sirva como un puente irresistible hacia el artículo del blog.
        REGLAS CRÍTICAS: 
        1. El texto debe estar ESTRICTAMENTE basado en los detalles específicos de la noticia proporcionada (Título y Contenido).
        2. Debe actuar como un "teaser": resume lo más emocionante pero invita al usuario a leer la historia completa en nuestra web.
        3. El tono debe ser institucional, inspiracional y profesional (Gente de Acción). 
        4. Usa emojis de forma estratégica y termina con una invitación clara a leer más.
        5. Incluye 3 hashtags relevantes al final.
        Responde EXCLUSIVAMENTE con un objeto JSON con la llave: socialCopy.`;
        
        const userPrompt = `Genera un copy persuasivo que conecte a nuestra audiencia de Facebook/LinkedIn con este artículo:
        Título: ${title}
        Contenido resumido: ${content?.substring(0, 1500)}`;

        const defaultSlug = await getDefaultModel();
        const rawResponse = await routeToModel(defaultSlug || 'gpt-3.5-turbo', systemPrompt, userPrompt);
        
        let cleaned = rawResponse.replace(/```json|```/gi, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in AI response');
        const result = JSON.parse(jsonMatch[0]);
        res.json(result);
    } catch (error) {
        console.error('Suggest Social error:', error);
        res.status(500).json({ error: 'Error al generar copy para redes', details: error.message });
    }
});

router.post('/suggest-cta', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    try {
        const systemPrompt = `Eres el Embajador de Comunicación Global de Rotary. 
        Tu tarea es crear una frase corta de "Llamado a la Acción" (CTA) diseñada para compartir este artículo en GRUPOS INTERNACIONALES de Facebook de Rotary.
        REGLAS:
        1. Debe ser una sola frase corta e impactante (máximo 150 caracteres).
        2. Debe invitar a la colaboración, el intercambio de ideas o simplemente a conocer lo que está haciendo otro club.
        3. El tono debe ser de hermandad rotaria mundial. 
        4. No uses demasiados hashtags, solo la esencia.
        Responde EXCLUSIVAMENTE con un objeto JSON con la llave: ctaCopy.`;
        
        const userPrompt = `Crea un CTA para grupos internacionales sobre esta noticia:
        Título: ${title}
        Resumen: ${content?.substring(0, 1000)}`;

        const defaultSlug = await getDefaultModel();
        const rawResponse = await routeToModel(defaultSlug || 'gpt-3.5-turbo', systemPrompt, userPrompt);
        
        let cleaned = rawResponse.replace(/```json|```/gi, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in AI response');
        const result = JSON.parse(jsonMatch[0]);
        res.json(result);
    } catch (error) {
        console.error('Suggest CTA error:', error);
        res.status(500).json({ error: 'Error al generar CTA para grupos', details: error.message });
    }
});

// PUBLIC chatbot endpoint — no auth required
router.post('/chat', async (req, res) => {
    const { message, clubId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        // Build rich context using shared function
        const ctx = await buildClubContext(clubId);
        const contextBlock = formatContextBlock(ctx);

        const systemPrompt = `Eres el asistente virtual del club Rotario "${ctx.clubName}".
${contextBlock}

REGLAS:
- Responde de forma amable, concisa y persuasiva en español (máximo 2 párrafos cortos).
- Usa emojis con moderación.
- Cuando el visitante pregunte sobre proyectos, CITA los proyectos REALES del club por nombre.
- TAREA CRÍTICA (LEAD GEN): Si el usuario muestra intención de unirse al club, donar, colaborar o necesita contactar directo al club, NO ofrezcas correos o formularios crudos al instante. EN VEZ DE ESO, dile algo como: "¡Me encanta tu interés! Déjame tu nombre y número telefónico de WhatsApp e inmediatamente conectaremos esa info con nuestro equipo para que te hablen."
- SÓLO cuando el usuario te dé su nombre y teléfono, EJECUTA la herramienta "capture_whatsapp_lead" que tienes disponible y agradécele.
- NO inventes información que no esté en el contexto.
- Rotary es una organización mundial de líderes cívicos y profesionales que brindan servicio humanitario.`;

        // Try multi-model router first (Gemini, etc.)
        try {
            const defaultSlug = await getDefaultModel();
            if (defaultSlug) {
                const reply = await routeToModel(defaultSlug, systemPrompt, message);
                if (reply && reply.trim().length > 10) {
                    return res.json({ reply });
                }
            }
        } catch (routerErr) {
            console.log(`[public-chat] Router fallback: ${routerErr.message}`);
        }

        // Fallback to direct OpenAI with Tool Calling for CRM Lead Gen
        if (process.env.OPENAI_API_KEY) {
            const agentTools = getToolsForAgent(['lead_gen', 'public_chat']);
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ];

            const openaiPayload = {
                model: 'gpt-3.5-turbo',
                messages,
                max_tokens: 400,
                temperature: 0.7
            };

            if (agentTools.length > 0) {
                openaiPayload.tools = agentTools;
                openaiPayload.tool_choice = 'auto';
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify(openaiPayload)
            });

            const data = await response.json();
            const choice = data.choices?.[0];

            // Handle tool call (Lead Capture)
            if (choice?.finish_reason === 'tool_calls' || choice?.message?.tool_calls?.length > 0) {
                const toolCall = choice.message.tool_calls[0];
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                
                // Execute lead capture
                const toolResult = await executeTool(toolName, toolArgs, null, clubId);

                // Get natural language summary back to the user
                messages.push(choice.message);
                messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
                
                const sumRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                    body: JSON.stringify({ model: 'gpt-3.5-turbo', messages, max_tokens: 400, temperature: 0.7 }),
                });
                
                const sumData = await sumRes.json();
                const summary = sumData.choices?.[0]?.message?.content || toolResult.message;

                return res.json({
                    reply: summary,
                    toolExecuted: {
                        name: toolName,
                        success: toolResult.success,
                        action: toolName.replace(/_/g, ' '),
                        emoji: toolResult.emoji || (toolResult.success ? '✅' : '❌'),
                        label: toolResult.label || 'ACCIÓN',
                        message: toolResult.message || (toolResult.success ? 'Acción completada' : 'Error en la acción'),
                        data: toolResult.data,
                    }
                });
            }

            // Regular text response
            const reply = choice?.message?.content || 'Lo siento, no pude generar una respuesta.';
            return res.json({ reply });
        }

        // Smart fallback responses with REAL data when no AI key
        const msgLower = message.toLowerCase();
        const clubLabel = ctx.clubName !== 'tu club' ? ctx.clubName : 'Rotary';
        let reply = '';

        if (msgLower.match(/hola|buenos|buenas|hi|hey/)) {
            reply = `¡Hola! 👋 Bienvenido al asistente virtual de ${clubLabel}. ¿En qué puedo ayudarte hoy? Puedo contarte sobre nuestros proyectos, cómo unirte o cómo donar.`;
        } else if (msgLower.match(/proyecto|proyectos/)) {
            if (ctx.projects.length > 0) {
                const projectList = ctx.projects.slice(0, 3).map(p => `• "${p.title}" (${p.category || 'General'} — ${({ active: 'Activo', planned: 'Planificado', completed: 'Completado' })[p.status] || p.status})`).join('\n');
                reply = `Nuestro club tiene ${ctx.projects.length} proyecto(s) registrado(s) 🌍:\n${projectList}\n\nVisita la sección de Proyectos en el sitio para conocer más detalles y cómo apoyar.`;
            } else {
                reply = `Nuestro club realiza proyectos de servicio en áreas como salud, educación, agua potable, medio ambiente y paz. 🌍 Visita nuestra sección de Proyectos para conocer más.`;
            }
        } else if (msgLower.match(/socio|unirse|miembro|pertenecer|ingresar/)) {
            const contactInfo = ctx.settings.contact_email ? ` Escríbenos a ${ctx.settings.contact_email}.` : ' Visita la sección de Contacto.';
            reply = `¡Nos alegra tu interés en unirte a ${clubLabel}! 🤝 Tenemos ${ctx.memberCount || 'varios'} miembros activos.${contactInfo}`;
        } else if (msgLower.match(/reunión|reuni|cuándo|cuando|evento/)) {
            if (ctx.events.length > 0) {
                const eventList = ctx.events.slice(0, 2).map(e => {
                    const d = e.startDate ? new Date(e.startDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }) : '';
                    return `• "${e.title}" — ${d}`;
                }).join('\n');
                reply = `📅 Próximos eventos de ${clubLabel}:\n${eventList}\n\nPara más detalles, visita nuestra sección de Contacto.`;
            } else {
                reply = `Para conocer los horarios de nuestras reuniones, te invitamos a comunicarte con el club a través de la sección de Contacto.`;
            }
        } else if (msgLower.match(/donar|donación|contribuir|apoyo|ayudar/)) {
            if (ctx.projects.length > 0) {
                const activeProject = ctx.projects.find(p => p.status === 'active');
                const projectMention = activeProject ? ` Actualmente puedes apoyar el proyecto "${activeProject.title}".` : '';
                reply = `Puedes contribuir con ${clubLabel} a través de La Fundación Rotaria o apoyando nuestros proyectos directamente. 💙${projectMention}`;
            } else {
                reply = `Puedes contribuir con Rotary a través de La Fundación Rotaria. Tu donación apoya proyectos de paz, salud y educación en todo el mundo. 💙`;
            }
        } else if (msgLower.match(/rotaract/)) {
            reply = `Rotaract es el programa de Rotary para jóvenes de 18 años en adelante. ¡Es una forma excelente de servir y desarrollar habilidades de liderazgo! 🚀`;
        } else if (msgLower.match(/interact/)) {
            reply = `Interact es el programa de Rotary para jóvenes de 12 a 18 años. ¡Una gran oportunidad para estudiantes de secundaria! 🎓`;
        } else if (msgLower.match(/contact|correo|email|teléfono|telefono|dirección|direccion/)) {
            const parts = [];
            if (ctx.settings.contact_email) parts.push(`📧 ${ctx.settings.contact_email}`);
            if (ctx.settings.contact_phone) parts.push(`📞 ${ctx.settings.contact_phone}`);
            if (ctx.settings.contact_address) parts.push(`📫 ${ctx.settings.contact_address}`);
            if (parts.length > 0) {
                reply = `Datos de contacto de ${clubLabel}:\n${parts.join('\n')}\n\nTambién puedes usar el formulario en la sección de Contacto. 😊`;
            } else {
                reply = `Puedes contactarnos a través de la sección de Contacto en el sitio web. ¡Con gusto te atenderemos! 😊`;
            }
        } else {
            reply = `Gracias por tu mensaje. 😊 Puedo ayudarte con información sobre nuestros proyectos, cómo unirte al club, eventos, donaciones o datos de contacto. ¿Qué te interesa saber?`;
        }

        res.json({ reply });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ reply: 'Lo siento, tuve un problema al procesar tu mensaje. Por favor, intenta de nuevo.' });
    }
});



router.get('/knowledge', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM "KnowledgeSource" WHERE "clubId" = $1 OR "clubId" IS NULL ORDER BY "createdAt" DESC`,
            [req.user.clubId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching knowledge base' });
    }
});

router.post('/knowledge', authMiddleware, async (req, res) => {
    try {
        const { title, type, content, fileUrl } = req.body;
        const targetClubId = req.user.role === 'administrator' && !req.body.isLocal ? null : req.user.clubId;
        const result = await db.query(
            `INSERT INTO "KnowledgeSource" (id, title, type, content, "fileUrl", "clubId", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW()) RETURNING *`,
            [title, type, content, fileUrl, targetClubId]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error adding knowledge source' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── AI MODEL REGISTRY ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/ai/models — Lista todos los modelos (builtin + configurados en BD)
router.get('/models', authMiddleware, async (req, res) => {
    await ensureModelsTable();
    try {
        // Modelos configurados en BD
        const dbResult = await db.query(
            `SELECT slug, provider, display_name, model_id, is_active, is_default,
                    description, speed, cost_tier, base_url,
                    CASE WHEN api_key_enc IS NOT NULL THEN TRUE ELSE FALSE END AS has_key
             FROM ai_model_configs ORDER BY is_default DESC, cost_tier ASC`
        );
        const dbSlugs = new Set(dbResult.rows.map(r => r.slug));

        // Combinar con builtin (los que no están en BD aparecen como 'sin configurar')
        const builtinRows = BUILTIN_MODELS
            .filter(m => !dbSlugs.has(m.slug))
            .map(m => ({ ...m, is_active: false, has_key: false, db_configured: false }));

        const dbRows = dbResult.rows.map(r => ({ ...r, db_configured: true }));
        res.json({ models: [...dbRows, ...builtinRows] });
    } catch (error) {
        console.error('GET /ai/models error:', error);
        res.status(500).json({ error: 'Error al listar modelos' });
    }
});

// POST /api/ai/models — Registrar/actualizar un modelo con API key
router.post('/models', authMiddleware, async (req, res) => {
    await ensureModelsTable();
    const { slug, provider, display_name, model_id, api_key, base_url, is_default, description, speed, cost_tier, max_tokens } = req.body;
    if (!slug || !provider || !display_name || !model_id) {
        return res.status(400).json({ error: 'slug, provider, display_name y model_id son requeridos' });
    }
    try {
        const apiKeyEnc = api_key ? encryptKey(api_key) : null;

        // Si se marca como default, quitar default de los demás
        if (is_default) await db.query(`UPDATE ai_model_configs SET is_default = FALSE`);

        const result = await db.query(
            `INSERT INTO ai_model_configs (slug, provider, display_name, model_id, api_key_enc, base_url, is_active, is_default, description, speed, cost_tier, max_tokens)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (slug) DO UPDATE SET
               provider = EXCLUDED.provider,
               display_name = EXCLUDED.display_name,
               model_id = EXCLUDED.model_id,
               api_key_enc = COALESCE(EXCLUDED.api_key_enc, ai_model_configs.api_key_enc),
               base_url = EXCLUDED.base_url,
               is_active = EXCLUDED.is_active,
               is_default = EXCLUDED.is_default,
               description = EXCLUDED.description,
               speed = EXCLUDED.speed,
               cost_tier = EXCLUDED.cost_tier,
               max_tokens = EXCLUDED.max_tokens,
               updated_at = NOW()
             RETURNING slug, provider, display_name, is_active, is_default`,
            [slug, provider, display_name, model_id, apiKeyEnc, base_url || null,
             req.body.is_active !== false, is_default || false,
             description || null, speed || 'medium', cost_tier || 2, max_tokens || 4096]
        );
        res.json({ model: result.rows[0] });
    } catch (error) {
        console.error('POST /ai/models error:', error);
        res.status(500).json({ error: 'Error al guardar modelo' });
    }
});

// PUT /api/ai/models/:slug — Actualizar un modelo (activar/desactivar, cambiar default)
router.put('/models/:slug', authMiddleware, async (req, res) => {
    await ensureModelsTable();
    const { slug } = req.params;
    const { is_active, is_default, api_key, display_name, description } = req.body;
    try {
        if (is_default === true) await db.query(`UPDATE ai_model_configs SET is_default = FALSE`);
        const apiKeyEnc = api_key ? encryptKey(api_key) : null;
        const result = await db.query(
            `UPDATE ai_model_configs SET
               is_active    = COALESCE($1, is_active),
               is_default   = COALESCE($2, is_default),
               api_key_enc  = CASE WHEN $3 IS NOT NULL THEN $3 ELSE api_key_enc END,
               display_name = COALESCE($4, display_name),
               description  = COALESCE($5, description),
               updated_at   = NOW()
             WHERE slug = $6
             RETURNING slug, provider, display_name, is_active, is_default`,
            [is_active, is_default, apiKeyEnc, display_name, description, slug]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Modelo no encontrado' });
        res.json({ model: result.rows[0] });
    } catch (error) {
        console.error('PUT /ai/models error:', error);
        res.status(500).json({ error: 'Error al actualizar modelo' });
    }
});

// DELETE /api/ai/models/:slug — Quitar API key / quitar de BD
router.delete('/models/:slug', authMiddleware, async (req, res) => {
    await ensureModelsTable();
    try {
        await db.query(`DELETE FROM ai_model_configs WHERE slug = $1`, [req.params.slug]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar modelo' });
    }
});

// POST /api/ai/models/:slug/test — Probar conectividad del modelo
router.post('/models/:slug/test', authMiddleware, async (req, res) => {
    await ensureModelsTable();
    try {
        const text = await routeToModel(
            req.params.slug,
            'Responde SOLO con la siguiente frase exacta en formato JSON: {"ok": true, "model": "<model_name>"}',
            'Test de conectividad'
        );
        // Intentar parsear como JSON
        try {
            const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
            res.json({ success: true, response: parsed });
        } catch {
            res.json({ success: true, response: { raw: text.slice(0, 200) } });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── PROJECT AI GENERATION ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_SYSTEM_PROMPT = `Eres ProyectIA, experto en redaccion de proyectos Rotary para plataformas de crowdfunding.
Genera un proyecto completo basado en la idea del administrador.
Responde UNICAMENTE con un JSON valido. Sin texto adicional, sin markdown, sin HTML en los campos.

ESTRUCTURA REQUERIDA:
{
  "title": "Titulo memorable y emotivo, maximo 70 caracteres",
  "subtitle": "Subtitulo con promesa clara al donante, maximo 120 caracteres",
  "description": "CRITICO: Exactamente 4 parrafos separados por \\n\\n. Total aproximado 280 palabras (1600 caracteres). Tono crowdfunding profesional y emotivo. PARRAFO 1 - EL PROBLEMA (70-80 palabras): Contexto social urgente con datos especificos del proyecto, dirigido al donante. PARRAFO 2 - QUIENES SON (60-70 palabras): Los beneficiarios especificos, cuantos son, sus situaciones concretas. Genera empatia sin sensacionalismo. PARRAFO 3 - TU DONACION HACE (70-80 palabras): Que se logra con el dinero: actividades concretas, resultados en 12 meses. Usa frases como Con tu apoyo y Cada peso que aportas. PARRAFO 4 - JUNTOS PODEMOS (40-50 palabras): Llamada a la accion final con urgencia y esperanza. Menciona al club Rotary como garantia de transparencia. REGLA: Sin comillas dobles dentro del texto.",
  "category": "Una de: Salud Materno-Infantil, Agua y Saneamiento, Educacion, Desarrollo Economico, Paz y Reconciliacion, Medio Ambiente, Prevencion de Enfermedades",
  "tags": ["etiqueta1", "etiqueta2", "etiqueta3", "etiqueta4"],
  "ubicacion": "Ciudad o municipio especifico donde se ejecuta el proyecto",
  "meta": 50000000,
  "beneficiarios": 100,
  "fechaEstimada": "2025-12-31",
  "impacto": "50 palabras maximo. Impacto social con 1 ODS de la ONU. Sin comillas dobles.",
  "actualizaciones": "40 palabras maximo. 4 fases: meses 1-3, 4-6, 7-9, 10-12. Sin comillas dobles.",
  "seoDescription": "Entre 140 y 155 caracteres para SEO con llamada a la accion.",
  "callToAction": "Maximo 40 caracteres. Frase imperativa y emotiva.",
  "fundraising": {"meta": 50000000, "montosUnico": [25000, 50000, 100000, 250000, 500000], "montosMensual": [20000, 50000, 100000]},
  "suggestedImageKeywords": ["keyword1", "keyword2", "keyword3"]
}
REGLAS: Montos en COP sin puntos ni comas. Datos realistas del proyecto. NO inventes nombres de personas reales.`;


// POST /api/ai/projects/generate — Genera un proyecto completo desde un prompt
router.post('/projects/generate', authMiddleware, upload.array('files', 15), async (req, res) => {
    const { prompt, modelSlug, clubId } = req.body;
    if (!prompt || prompt.trim().length < 10) {
        return res.status(400).json({ error: 'El prompt debe tener al menos 10 caracteres' });
    }

    // Contexto de archivos adjuntos (solo nombres/tipos como texto — no enviamos binarios a la API)
    let fileContext = '';
    if (req.files && req.files.length > 0) {
        const fileList = req.files.map(f => `- ${f.originalname} (${f.mimetype}, ${Math.round(f.size/1024)}KB)`).join('\n');
        fileContext = `\n\nArchivos de contexto adjuntos por el administrador (usar como referencia conceptual):\n${fileList}`;
    }

    // Contexto del club — solo nombre y ciudad, NO la descripción completa
    // (la descripción puede mencionar otras ciudades y confundir al modelo)
    let clubName = 'el Club Rotario';
    let clubCity = '';
    let clubContext = '';
    try {
        const targetClubId = clubId || req.user.clubId;
        const clubResult = await db.query(
            `SELECT name, city, country FROM "Club" WHERE id = $1`,
            [targetClubId]
        );
        const c = clubResult.rows[0];
        if (c) {
            clubName = c.name;
            // Si city está vacía, inferirla del nombre del club
            const knownCities = ['Bogotá','Medellín','Cali','Barranquilla','Cartagena',
                'Bucaramanga','Pereira','Armenia','Manizales','Pasto','Ibagué',
                'Buenaventura','Cúcuta','Villavicencio','Santa Marta','Popayán'];
            const inferredCity = c.city || knownCities.find(city => c.name.includes(city)) || '';
            clubCity = inferredCity;
            const loc = inferredCity ? ` (${inferredCity}, ${c.country || 'Colombia'})` : ` (Colombia)`;
            clubContext = `\nClub organizador: "${c.name}"${loc}.`;
        }
    } catch (_) { }

    // Elegir modelo — forzar gemini-2.5-flash que está verificado para este API key
    // Los modelos 2.0 están deprecados y causarían latencia extra en el fallback
    const FAST_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];
    const slug = FAST_MODELS.includes(modelSlug) ? modelSlug : 'gemini-2.5-flash';
    const currentDate = new Date().toISOString().split('T')[0];
    const userPrompt = `Fecha: ${currentDate}.${clubContext}${fileContext}\n\nIdea del proyecto:\n"${prompt.trim()}"`;

    try {
        const raw = await routeToModel(slug, PROJECT_SYSTEM_PROMPT, userPrompt);

        // Extracción robusta del JSON — Gemini 2.5 a veces añade texto extra
        let cleaned = raw
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();

        // Buscar el primer bloque JSON válido {  ...  } en la respuesta
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('No JSON found in response. Raw:', raw.slice(0, 300));
            return res.status(422).json({ error: 'El modelo no devolvió JSON válido. Intenta de nuevo.' });
        }

        let project;
        try {
            project = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            // Segundo intento: limpiar caracteres de control que rompen el parse
            const sanitized = jsonMatch[0]
                .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? c : '')
                .replace(/,\s*([}\]])/g, '$1'); // trailing commas
            project = JSON.parse(sanitized);
        }

        // Completar/enriquecer campos con defaults inteligentes del servidor
        const fullProject = {
            status: 'planned',
            // fundraisingFormats construido desde el campo fundraising de la IA
            fundraisingFormats: [
                {
                    type: 'donacion_unica',
                    label: 'Donación única',
                    amounts: project.fundraising?.montosUnico || [25000, 50000, 100000, 250000, 500000],
                    description: `Tu donación apoya directamente a ${project.beneficiarios || 'los'} beneficiarios del proyecto.`
                },
                {
                    type: 'socio_proyecto',
                    label: 'Socio del Proyecto (mensual)',
                    amounts: project.fundraising?.montosMensual || [20000, 50000, 100000],
                    description: `Como socio mensual, garantizas la continuidad y sostenibilidad de ${project.title || 'este proyecto'}.`
                }
            ],
            // Tomar meta del campo fundraising de la IA o del campo meta directo
            meta: project.fundraising?.meta || project.meta || 50000000,
            // Todos los demas campos vienen de la IA
            ...project,
            // Asegurar que meta no sea string
            meta: Number(project.fundraising?.meta || project.meta || 50000000),
            beneficiarios: Number(project.beneficiarios || 100),
        };
        // Limpiar campo fundraising auxiliar que no necesita el frontend
        delete fullProject.fundraising;

        res.json({
            project: fullProject,
            modelUsed: slug,
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Project generation error:', error.message);
        if (error instanceof SyntaxError) {
            return res.status(422).json({ error: 'El modelo no devolvió JSON válido. Intenta de nuevo o usa otro modelo.' });
        }
        res.status(500).json({ error: error.message || 'Error al generar el proyecto' });
    }
});

export default router;
