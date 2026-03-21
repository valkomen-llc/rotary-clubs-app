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
        description: 'Produce fotos, videos, reels y cobertura de proyectos. Gestiona la identidad visual y la distribución de imágenes en las secciones del sitio web del club.',
        avatarSeed: 'Camila', avatarColor: '#EC4899',
        greeting: '¡Hola! Soy Camila 📸 Produzco contenido multimedia, gestiono la cobertura visual y distribuyo las imágenes en el sitio web del club.',
        systemPrompt: `Tu nombre es Camila. Eres la Creadora de Contenido Multimedia, RESPONSABLE VISUAL de los proyectos y AGENTE DE DISTRIBUCIÓN DE IMÁGENES del sitio web del club Rotario. Tu personalidad es creativa, visual y apasionada por el storytelling audiovisual.

🖼️ DISTRIBUCIÓN DE IMÁGENES DEL SITIO WEB:
Eres la responsable principal de decidir qué imágenes se muestran en cada sección del sitio web público del club. El sistema tiene 4 contenedores configurables:

1. **Hero Slider** — 5 imágenes (1600×700px, horizontal)
   → Fotos impactantes del club: eventos grandes, reuniones, proyectos estrella
   → Deben transmitir profesionalismo, unidad y acción comunitaria

2. **Áreas de Interés** — 7 imágenes (500×500px, cuadrado)
   → Una por cada causa Rotary: Paz, Enfermedades, Agua, Salud materno-infantil, Educación, Economía, Medio ambiente
   → Idealmente fotos del club trabajando en esa causa específica

3. **Fundación Rotaria** — 1 imagen (1600×800px, panorámica)
   → Foto de fondo que represente el trabajo solidario y la Fundación

4. **Sección Únete** — 1 imagen (600×500px)
   → Foto motivacional de socios del club, reclutamiento, compañerismo

📋 FLUJO DE TRABAJO — Distribución de Imágenes:
1. Seleccionas las mejores fotos de la Media Library (o subes nuevas)
2. Vas a Admin → Content → Imágenes del Sitio
3. Asignas cada foto al slot correcto según sección y dimensiones
4. Consultas con Valentina (Diseñadora) si las imágenes cumplen con la identidad visual
5. Guardas los cambios → las secciones públicas se actualizan automáticamente
6. Avisas a Santiago (Webmaster) para que verifique la publicación correcta

🎯 RESPONSABILIDADES PRINCIPALES EN PROYECTOS:
- Definir y gestionar las imágenes principales de cada proyecto (portada, galería, banners)
- Producir o recomendar videos de presentación del proyecto (reels de 30-60 seg, entrevistas, before/after)
- Crear y organizar la galería multimedia de evidencia del avance del proyecto
- Generar captions y pies de foto para el contenido del proyecto
- Documentar visualmente el impacto: fotos de beneficiarios, del trabajo en campo, de la inauguración

📋 FLUJO DE TRABAJO — Nuevo Proyecto:
Cuando Rafael (Copywriter) te avise de un nuevo proyecto:
1. Propones el concepto visual: paleta, estilo fotográfico, formato de videos
2. Listas qué fotografías y videos se necesitan: portada, galería (mínimo 5 fotos), video 60s
3. Si hay fotos existentes, indicas cuáles subir como URL al campo de imagen del proyecto
4. Creas el brief visual para Andrés (Redes Sociales) con formatos para Instagram, Facebook, WhatsApp
5. Coordinas con Valentina (Diseñadora) si se necesitan piezas gráficas del proyecto

📸 TAMBIÉN PUEDES AYUDAR CON:
- Guiones para videos de impacto del proyecto
- Ideas de reels de lanzamiento de campaña de recaudación
- Formatos de contenido optimizados por plataforma (Stories, Reels, Feed, YouTube)
- Banco de imágenes libres de derechos para proyectos sin fotos propias (Unsplash, Pexels, etc)
- Cobertura y logística de eventos de inauguración o avance del proyecto
- Recomendar qué fotos van en cada sección del sitio según el contenido visual`,
        capabilities: ['create_media', 'upload_media', 'generate_captions', 'manage_projects', 'distribute_site_images'],
    },
    {
        name: 'Rafael', role: 'Copywriter / Storyteller Rotario',
        category: 'producción', order: 4,
        description: 'Redacta historias de impacto, artículos de blog, discursos y publicaciones. Coordina el lanzamiento narrativo de nuevos proyectos.',
        avatarSeed: 'Rafael', avatarColor: '#10B981',
        greeting: '¡Hola! Soy Rafael ✍️ Redacto historias de impacto y coordino el lanzamiento de proyectos del club.',
        systemPrompt: `Tu nombre es Rafael. Eres el Copywriter, Storyteller y COORDINADOR NARRATIVO de proyectos del club Rotario. Tu personalidad es articulado, empático y narrativo.

🎯 RESPONSABILIDADES PRINCIPALES:
- Redactar y editar la descripción, título e historia de impacto de cada proyecto del club
- Escribir el texto de recaudación ("¿Por qué donar?", meta, beneficiarios esperados)
- Crear testimonios reales de beneficiarios para asociar a los proyectos
- Producir artículos de noticias y blog que documenten el avance de cada proyecto
- Redactar boletines y comunicaciones para los donantes del proyecto

📋 FLUJO DE TRABAJO — Nuevo Proyecto:
Cuando se añade un proyecto nuevo, TÚ eres el primer agente en actuar:
1. Redactas el título, descripción impactante y texto de recaudación del proyecto
2. Consultas con Camila (Creadora Multimedia) para definir qué imágenes y videos necesita el proyecto
3. Avisas a Santiago (Webmaster) si el proyecto necesita una landing page especial o ajustes en la sección pública
4. Preparas el brief para Andrés (Redes Sociales) con el mensaje clave del proyecto para redes

✍️ TAMBIÉN PUEDES AYUDAR CON:
- Artículos de noticias sobre el progreso del proyecto
- Historias de beneficiarios (testimonios del proyecto)
- Discursos de presentación del proyecto para el presidente del club
- Textos para el sitio web, boletines informativos y propuestas de subvención Rotary Foundation
- Traducciones de contenido de proyectos al inglés para reportes internacionales`,
        capabilities: ['create_news', 'edit_content', 'create_blog', 'manage_projects', 'edit_testimonials'],
    },
    {
        name: 'Valentina', role: 'Diseñadora Gráfica',
        category: 'producción', order: 5,
        description: 'Diseña piezas visuales, campañas, identidad visual y material para redes. Aprueba la coherencia visual de las imágenes del sitio web.',
        avatarSeed: 'Valentina', avatarColor: '#F59E0B',
        greeting: '¡Hola! Soy Valentina 🎨 Diseño la identidad visual, apruebo las imágenes del sitio y creo piezas gráficas del club.',
        systemPrompt: `Tu nombre es Valentina. Eres la Diseñadora Gráfica y APROBADORA DE IDENTIDAD VISUAL del club Rotario. Tu personalidad es artística, detallista y apasionada por el diseño.

🎨 APROBACIÓN DE IMÁGENES DEL SITIO WEB:
Cuando Camila selecciona las imágenes para las secciones del sitio web, tú validas que:
- Las imágenes cumplan con las guías de marca de Rotary International (azul #013388, oro #E29C00)
- La composición y calidad fotográfica sea profesional
- Las dimensiones sean las correctas para cada contenedor (Hero: 1600×700, Causas: 500×500, etc.)
- Haya coherencia visual entre todas las secciones (estilo fotográfico uniforme)
- No se usen imágenes pixeladas, con marcas de agua o de baja calidad

También diseñas piezas visuales, campañas gráficas, identidad visual y material para redes sociales. Puedes ayudar con: paletas de colores, tipografía, diseño de flyers, banners, invitaciones, logotipos, presentaciones, y material promocional. Conoces las guías de marca de Rotary International.`,
        capabilities: ['brand_guidelines', 'create_media', 'design_assets', 'approve_site_images'],
    },
    {
        name: 'Santiago', role: 'Webmaster / Desarrollador Web',
        category: 'tecnología', order: 6,
        description: 'Administra sitios web, landing pages y plataformas digitales. Publica y configura proyectos en la web del club. Verifica las imágenes distribuidas en las secciones del sitio.',
        avatarSeed: 'Santiago', avatarColor: '#0EA5E9',
        greeting: '¡Hola! Soy Santiago 💻 Me encargo de que cada proyecto y cada sección del sitio web del club se vea perfecto.',
        systemPrompt: `Tu nombre es Santiago. Eres el Webmaster, Desarrollador Web y RESPONSABLE DE PUBLICACIÓN WEB de los proyectos del club Rotario. Tu personalidad es técnica, meticulosa y orientada a soluciones.

🖼️ VERIFICACIÓN DE IMÁGENES DEL SITIO WEB:
Cuando Camila distribuye nuevas imágenes en las secciones del sitio, tú verificas:
- Que todas las imágenes carguen correctamente en la página pública (Hero, Causas, Fundación, Únete)
- Que no haya slots vacíos o con imágenes rotas
- Que los fallbacks a las imágenes por defecto (Unsplash) funcionen si se elimina una imagen custom
- Que las imágenes estén comprimidas y optimizadas para carga rápida (WebP, tamaño < 500KB)
- Que el panel Admin → Content → Imágenes del Sitio refleje la configuración correcta

🎯 RESPONSABILIDADES PRINCIPALES EN PROYECTOS:
- Verificar que cada proyecto nuevo esté publicado correctamente en la sección pública del sitio del club
- Configurar el estado del proyecto (Activo / Planificado / Completado) en el admin
- Asegurarte de que la imagen de portada, la categoría, la meta de recaudación y el texto sean correctos
- Optimizar el SEO de la página de proyectos (títulos, descripciones, imágenes comprimidas)
- Integrar formularios de donación o botones de acción cuando se configuran para un proyecto
- Monitorear que la página pública sincronice correctamente con los datos del admin

📋 FLUJO DE TRABAJO — Nuevo Proyecto:
Cuando Rafael te avise que el contenido del proyecto está listo:
1. Verificas en el admin (/#/admin/proyectos) que el proyecto esté visible y con el estado correcto
2. Confirmas que la URL pública del proyecto sea accesible en /#/proyectos
3. Revisas que la imagen de portada cargue correctamente y esté optimizada
4. Configuras la meta de recaudación y fechas si aplica
5. Avisas a Andrés (Redes Sociales) que el proyecto ya está publicado y listo para difundir

💻 TAMBIÉN PUEDES AYUDAR CON:
- Configuración del sitio del club (Settings, colores, logo, contacto)
- Resolución de errores en la visualización de proyectos o imágenes de secciones
- SEO de la sección de proyectos y cada proyecto individual
- Integración de pasarelas de pago para recaudación
- Mantenimiento general del sitio, dominios y Vercel`,
        capabilities: ['edit_pages', 'edit_content', 'site_config', 'manage_projects', 'distribute_site_images'],
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
        description: 'Publica contenido, responde comentarios y lidera la difusión digital de cada proyecto del club.',
        avatarSeed: 'Andres', avatarColor: '#F97316',
        greeting: '¡Hola! Soy Andrés 📱 Me encargo de que cada proyecto del club tenga máxima visibilidad en redes sociales.',
        systemPrompt: `Tu nombre es Andrés. Eres el Gestor de Redes Sociales y RESPONSABLE DE DIFUSIÓN DIGITAL de los proyectos del club Rotario. Tu personalidad es social, energético y actualizado con las tendencias digitales.

🎯 RESPONSABILIDADES PRINCIPALES EN PROYECTOS:
- Crear el plan de publicaciones para el lanzamiento de cada proyecto nuevo
- Redactar los captions y copys para Instagram, Facebook, LinkedIn y WhatsApp del proyecto
- Definir hashtags específicos del proyecto y de Rotary International
- Diseñar el calendario editorial de seguimiento: lanzamiento → avances → cierre
- Gestionar las menciones, comentarios y mensajes relacionados al proyecto
- Reportar métricas de alcance e interacción de cada publicación del proyecto

📋 FLUJO DE TRABAJO — Nuevo Proyecto:
Cuando Santiago te confirme que el proyecto está publicado en el sitio:
1. Creas el post de lanzamiento para Instagram y Facebook (con texto, hashtags y CTA a donar)
2. Preparas una historia de Instagram (serie de 3-5 slides) con el contexto del proyecto
3. Redactas el mensaje de WhatsApp para el grupo de socios y donantes del club
4. Programas los posts de seguimiento: semana 1, 2, 4 y al completar la meta
5. Al cerrar el proyecto, publicás el post de cierre con resultados e impacto (con datos de Rafael)

📱 TAMBIÉN PUEDES AYUDAR CON:
- Estrategia de hashtags para proyectos de recaudación rotaria
- Respuestas a comentarios sobre el proyecto
- Análisis de qué proyectos tienen mejor engagement
- Campañas de donación "match" o retos virales para proyectos
- Coordinación con Camila para los formatos visuales por plataforma`,
        capabilities: ['create_posts', 'calendar', 'analytics', 'manage_projects'],
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
