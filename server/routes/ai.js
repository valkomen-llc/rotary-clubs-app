import db from '../lib/db.js';
import { routeToModel, getDefaultModel, BUILTIN_MODELS, encryptKey, decryptKey } from '../lib/ai-router.js';

// Generate social media suggestions based on month and knowledge base
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 15 } });

const router = express.Router();

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
};

// ── Agent Chat for Mission Control ─────────────────────────────────────────
router.post('/agent-chat', authMiddleware, async (req, res) => {
    const { message, agentId, history } = req.body;
    if (!message || !agentId) return res.status(400).json({ error: 'message and agentId are required' });

    let agentName, agentPersona, aiModel = 'gpt-3.5-turbo';

    // Try to find agent in DB first
    try {
        const dbAgent = await db.query('SELECT * FROM "Agent" WHERE id = $1 OR LOWER(name) = $1', [agentId]);
        if (dbAgent.rows.length > 0) {
            const a = dbAgent.rows[0];
            agentName = a.name;
            agentPersona = a.systemPrompt;
            aiModel = a.aiModel === 'gpt-4' ? 'gpt-4' : a.aiModel === 'gpt-3.5' ? 'gpt-3.5-turbo' : a.aiModel || 'gpt-3.5-turbo';
        }
    } catch (_) { }

    // Fallback to hardcoded agents
    if (!agentPersona) {
        const agent = MISSION_AGENTS[agentId];
        if (!agent) return res.status(404).json({ error: 'Agent not found' });
        agentName = agent.name;
        agentPersona = agent.persona;
    }

    let clubName = 'tu club';
    try {
        const clubResult = await db.query('SELECT name FROM "Club" WHERE id = $1', [req.user.clubId]);
        if (clubResult.rows[0]) clubName = clubResult.rows[0].name;
    } catch (_) { }

    const systemPrompt = `${agentPersona}\nEl nombre del club del usuario es: "${clubName}". Responde SIEMPRE en español, de forma concisa y amigable (máximo 3 párrafos cortos). Usa emojis con moderación para dar calidez.`;

    const messages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(history)) {
        history.slice(-6).forEach(h => messages.push({ role: h.role, content: h.text }));
    }
    messages.push({ role: 'user', content: message });

    try {
        if (process.env.OPENAI_API_KEY) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                body: JSON.stringify({ model: aiModel, messages, max_tokens: 400, temperature: 0.7 })
            });
            const data = await response.json();
            return res.json({ reply: data.choices?.[0]?.message?.content || 'No pude generar una respuesta.', agentName });
        }
        res.json({ reply: `¡Hola! Soy ${agentName} 👋 En este momento necesito que se configure la API de OpenAI para poder ayudarte. ¡Pronto estaré disponible!`, agentName });
    } catch (error) {
        res.status(500).json({ error: 'Error en el agente IA' });
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

// PUBLIC chatbot endpoint — no auth required
router.post('/chat', async (req, res) => {
    const { message, clubId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        // Fetch club info for context
        let clubContext = '';
        if (clubId) {
            const clubResult = await db.query(
                'SELECT name, city, country, district, description FROM "Club" WHERE id = $1',
                [clubId]
            );
            const club = clubResult.rows[0];
            if (club) {
                clubContext = `El club se llama "${club.name}", se encuentra en ${club.city}, ${club.country}, pertenece al distrito ${club.district}. ${club.description || ''}`;
            }
        }

        const systemPrompt = `Eres el asistente virtual de un Club Rotario. ${clubContext}
Rotary es una organización mundial de líderes cívicos y profesionales que se reúnen para brindar servicio humanitario, fomentar principios éticos en todos los oficios y profesiones, y contribuir a establecer la buena voluntad y la paz en el mundo.
Responde de forma amable, concisa y profesional en español. Si no sabes algo específico del club, invita al visitante a contactar directamente. No inventes información.`;

        if (process.env.OPENAI_API_KEY) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 400,
                    temperature: 0.7
                })
            });

            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
            return res.json({ reply });
        }

        // Smart fallback responses when no OpenAI key
        const msgLower = message.toLowerCase();
        let reply = '';

        if (msgLower.match(/hola|buenos|buenas|hi/)) {
            reply = `¡Hola! 👋 Bienvenido al asistente virtual de Rotary. ¿En qué puedo ayudarte hoy?`;
        } else if (msgLower.match(/proyecto|proyectos/)) {
            reply = `Nuestro club realiza proyectos de servicio en áreas como salud, educación, agua potable, medio ambiente y paz. 🌍 Visita nuestra sección de Proyectos para conocer más.`;
        } else if (msgLower.match(/socio|unirse|miembro|pertenecer|ingresar/)) {
            reply = `¡Nos alegra tu interés en unirte a Rotary! 🤝 Para convertirte en socio, contáctanos a través del formulario de Contacto o visítanos en una de nuestras reuniones.`;
        } else if (msgLower.match(/reunión|reuni|cuándo|cuando/)) {
            reply = `Para conocer los horarios de nuestras reuniones, te invitamos a comunicarte directamente con el club a través de la sección de Contacto.`;
        } else if (msgLower.match(/donar|donación|contribuir|apoyo/)) {
            reply = `Puedes contribuir con Rotary a través de La Fundación Rotaria. Tu donación apoya proyectos de paz, salud y educación en todo el mundo. 💙`;
        } else if (msgLower.match(/rotaract/)) {
            reply = `Rotaract es el programa de Rotary para jóvenes de 18 años en adelante. ¡Es una forma excelente de servir y desarrollar habilidades de liderazgo!`;
        } else if (msgLower.match(/interact/)) {
            reply = `Interact es el programa de Rotary para jóvenes de 12 a 18 años. ¡Una gran oportunidad para los estudiantes de secundaria!`;
        } else if (msgLower.match(/contact|correo|email|teléfono|telefono/)) {
            reply = `Puedes contactarnos a través de nuestra sección de Contacto en el sitio web. ¡Con gusto te atenderemos!`;
        } else {
            reply = `Gracias por tu mensaje. 😊 Para obtener información más específica, te invitamos a visitar nuestras secciones de Proyectos, Noticias o Contacto. También puedes comunicarte directamente con el club. ¡Estamos para servirte!`;
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

const PROJECT_SYSTEM_PROMPT = `Eres ProyectIA, un experto en diseño de proyectos sociales y crowdfunding digital para clubes Rotary en Latinoamérica.
Tu rol es tomar una idea en lenguaje natural y convertirla en un proyecto de crowdfunding completo, alineado con los valores de Rotary International ("Service Above Self") y las 7 Áreas de Enfoque de The Rotary Foundation:
1. Promoción de la paz | 2. Prevención y tratamiento de enfermedades | 3. Agua, saneamiento e higiene
4. Salud de la madre y el niño | 5. Apoyo a la educación | 6. Desarrollo económico y comunitario | 7. Medioambiente

Debes responder SIEMPRE con un JSON válido con esta estructura exacta (sin markdown, sin comentarios):
{
  "title": "Título emotivo y memorable — máx 70 caracteres",
  "description": "<p>Descripción HTML 300-500 palabras. Contexto del problema, solución propuesta, metodología.</p>",
  "category": "Área de enfoque Rotary más relevante",
  "tags": ["etiqueta1", "etiqueta2", "etiqueta3"],
  "status": "planned",
  "ubicacion": "Ciudad o región específica del proyecto",
  "meta": 0,
  "beneficiarios": 0,
  "fechaEstimada": "YYYY-MM-DD",
  "impacto": "<p>HTML con impacto: métricas, ODS, cambio social esperado.</p>",
  "actualizaciones": "<p>HTML con plan de hitos y seguimiento inicial.</p>",
  "seoDescription": "Meta description de exactamente 155 caracteres para SEO",
  "callToAction": "Texto del botón de donación (máx 40 chars)",
  "fundraisingFormats": [
    { "type": "donacion_unica", "label": "Donación única", "amounts": [25000, 50000, 100000, 500000], "description": "Qué cubre cada monto" },
    { "type": "socio_proyecto", "label": "Socio del Proyecto (mensual)", "amounts": [20000, 50000, 100000], "description": "Beneficios del socio mensual" }
  ],
  "suggestedImageKeywords": ["keyword1", "keyword2"]
}
REGLAS CRÍTICAS:
- MONTOS en COP (pesos colombianos).
- TÍTULO memorable y emocional.
- HTML real (etiquetas <p>, <strong>, <ul>, <li>) en description/impacto/actualizaciones.
- Beneficiarios conservadores y realistas.
- No inventes nombres reales ni datos verificables.
- IMPORTANTÍSIMO: Tu respuesta debe ser ÚNICAMENTE el JSON. Ni una sola palabra antes ni después del JSON. Sin saludos, sin explicaciones, sin ```json, sin ```. Solo el objeto JSON crudo empezando con { y terminando con }.`;

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

    // Contexto del club
    let clubContext = '';
    try {
        const targetClubId = clubId || req.user.clubId;
        const clubResult = await db.query(
            `SELECT name, city, country, description FROM "Club" WHERE id = $1`,
            [targetClubId]
        );
        const c = clubResult.rows[0];
        if (c) clubContext = `\nContexto del club: "${c.name}", ubicado en ${c.city}, ${c.country}. ${c.description || ''}`;
    } catch (_) { }

    // Elegir modelo — forzar gemini-2.5-flash que está verificado para este API key
    // Los modelos 2.0 están deprecados y causarían latencia extra en el fallback
    const FAST_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];
    const slug = FAST_MODELS.includes(modelSlug) ? modelSlug : 'gemini-2.5-flash';
    const currentDate = new Date().toISOString().split('T')[0];
    const userPrompt = `Fecha actual: ${currentDate}.${clubContext}${fileContext}\n\nIdea del administrador:\n"${prompt.trim()}"`;

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

        res.json({
            project,
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
