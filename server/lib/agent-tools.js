/**
 * Agent Tools — Real actions agents can execute on the platform
 * 
 * Each tool maps to a real API action (create post, create project, etc.)
 * Tools are matched to agent capabilities and executed server-side.
 */

import db from './db.js';

// ═══════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS — Used for OpenAI/Gemini function calling schemas
// ═══════════════════════════════════════════════════════════════════════════

export const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'capture_whatsapp_lead',
            description: 'Captura los datos de un prospecto o potencial donante (Lead) que navega la web y envíalos directamente al CRM de WhatsApp del club. Usa esta herramienta SÓLO cuando el usuario muestre intención de unirse, donar o contactar y te haya facilitado al menos su nombre y teléfono (o email).',
            parameters: {
                type: 'object',
                properties: {
                    name:  { type: 'string', description: 'Nombre completo del prospecto' },
                    phone: { type: 'string', description: 'Número de WhatsApp o teléfono celular del prospecto' },
                    email: { type: 'string', description: 'Correo electrónico del prospecto (opcional)' },
                    reason:{ type: 'string', description: 'Razón principal del contacto: unirse, donar, rotaract, interact, colaboracion, duda_general', enum: ['unirse', 'donar', 'rotaract', 'interact', 'colaboracion', 'duda_general'] },
                    message:{ type: 'string', description: 'Mensaje adicional o comentario dejado por el usuario en el chat' }
                },
                required: ['name', 'phone', 'reason'],
            },
        },
        requiredCapabilities: ['lead_gen', 'public_chat'],
    },
    {
        type: 'function',
        function: {
            name: 'create_news_post',
            description: 'Crea una noticia/artículo en el blog del club. Usa esta herramienta cuando el usuario te pida crear, redactar o publicar una noticia o artículo.',
            parameters: {
                type: 'object',
                properties: {
                    title:    { type: 'string', description: 'Título de la noticia' },
                    content:  { type: 'string', description: 'Contenido HTML o texto del artículo' },
                    category: { type: 'string', description: 'Categoría: noticias, proyectos, eventos, institucional, blog', enum: ['noticias', 'proyectos', 'eventos', 'institucional', 'blog'] },
                    published: { type: 'boolean', description: 'Si la noticia debe publicarse inmediatamente (true) o quedar como borrador (false). Default: false' },
                },
                required: ['title', 'content'],
            },
        },
        requiredCapabilities: ['create_news', 'create_blog', 'create_posts', 'edit_content'],
    },
    {
        type: 'function',
        function: {
            name: 'create_project',
            description: 'Crea un nuevo proyecto de servicio para el club. Usa esta herramienta cuando el usuario te pida crear o registrar un proyecto nuevo.',
            parameters: {
                type: 'object',
                properties: {
                    title:         { type: 'string', description: 'Nombre del proyecto' },
                    description:   { type: 'string', description: 'Descripción detallada del proyecto' },
                    category:      { type: 'string', description: 'Área de enfoque Rotary', enum: ['salud', 'educación', 'agua', 'medio-ambiente', 'paz', 'economía', 'polio', 'general'] },
                    status:        { type: 'string', description: 'Estado del proyecto', enum: ['planned', 'active', 'completed'] },
                    ubicacion:     { type: 'string', description: 'Ubicación geográfica del proyecto' },
                    meta:          { type: 'number', description: 'Meta de recaudación en COP' },
                    beneficiarios: { type: 'number', description: 'Número estimado de beneficiarios' },
                    impacto:       { type: 'string', description: 'Descripción del impacto esperado' },
                },
                required: ['title', 'description'],
            },
        },
        requiredCapabilities: ['manage_projects'],
    },
    {
        type: 'function',
        function: {
            name: 'create_calendar_event',
            description: 'Crea un evento en el calendario del club. Usa esta herramienta cuando el usuario te pida crear, agendar o programar un evento o reunión.',
            parameters: {
                type: 'object',
                properties: {
                    title:       { type: 'string', description: 'Título del evento' },
                    description: { type: 'string', description: 'Descripción del evento' },
                    startDate:   { type: 'string', description: 'Fecha y hora de inicio en formato ISO (YYYY-MM-DDTHH:MM:SS)' },
                    endDate:     { type: 'string', description: 'Fecha y hora de fin en formato ISO (opcional)' },
                    location:    { type: 'string', description: 'Lugar del evento' },
                    type:        { type: 'string', description: 'Tipo de evento', enum: ['reunion', 'servicio', 'social', 'capacitacion', 'recaudacion', 'otro'] },
                },
                required: ['title', 'startDate'],
            },
        },
        requiredCapabilities: ['calendar', 'create_posts'],
    },
    {
        type: 'function',
        function: {
            name: 'create_publication',
            description: 'Crea una publicación programada para redes sociales en el calendario editorial. Usa esta herramienta cuando el usuario te pida crear, programar o agendar una publicación para redes sociales.',
            parameters: {
                type: 'object',
                properties: {
                    title:       { type: 'string', description: 'Título de la publicación' },
                    content:     { type: 'string', description: 'Texto/Caption de la publicación para redes' },
                    platform:    { type: 'string', description: 'Plataforma de destino', enum: ['instagram', 'facebook', 'linkedin', 'whatsapp', 'twitter', 'todas'] },
                    publishDate: { type: 'string', description: 'Fecha programada en formato ISO (YYYY-MM-DDTHH:MM:SS)' },
                },
                required: ['title', 'content', 'platform', 'publishDate'],
            },
        },
        requiredCapabilities: ['create_posts', 'calendar'],
    },
    {
        type: 'function',
        function: {
            name: 'update_site_setting',
            description: 'Actualiza una configuración del sitio web del club (colores, contacto, textos del hero, etc.). Usa esta herramienta cuando el usuario te pida cambiar un ajuste del sitio.',
            parameters: {
                type: 'object',
                properties: {
                    key:   { type: 'string', description: 'Clave de configuración', enum: ['hero_title', 'hero_subtitle', 'seo_title', 'seo_description', 'contact_email', 'contact_phone', 'contact_address', 'color_primary', 'color_secondary'] },
                    value: { type: 'string', description: 'Nuevo valor' },
                },
                required: ['key', 'value'],
            },
        },
        requiredCapabilities: ['site_config', 'edit_pages'],
    },
    {
        type: 'function',
        function: {
            name: 'trigger_n8n_webhook',
            description: 'Dispara un flujo de trabajo (workflow) en n8n mediante un webhook. Usa esta herramienta cuando necesites iniciar una campaña, automatización, análisis masivo o secuencia de correos en n8n.',
            parameters: {
                type: 'object',
                properties: {
                    workflowName: { type: 'string', description: 'Nombre del workflow a disparar (ej: cold_email_sequence, seo_report, social_publish)' },
                    payload:      { type: 'string', description: 'Objeto JSON en formato string con los datos y parámetros que necesita el workflow para funcionar' },
                },
                required: ['workflowName', 'payload'],
            },
        },
        requiredCapabilities: ['trigger_n8n'],
    },
    {
        type: 'function',
        function: {
            name: 'delegate_task',
            description: 'Asigna una tarea o delega una responsabilidad a otro agente especializado del equipo. Usa esta herramienta para distribuir el trabajo tras recibir un nuevo club, proyecto o lead de contacto.',
            parameters: {
                type: 'object',
                properties: {
                    target_agent: { type: 'string', description: 'Nombre exacto del agente al que se le delega la tarea (Ej: Diana, Andrés, Martín, Lucía, Isabel, Rafael, Camila)' },
                    task_description: { type: 'string', description: 'Descripción clara y detallada de lo que el agente debe hacer o el plan de acción' },
                    urgency: { type: 'string', description: 'Nivel de urgencia', enum: ['baja', 'media', 'alta'] }
                },
                required: ['target_agent', 'task_description'],
            },
        },
        requiredCapabilities: ['delegate', 'orchestrate'],
    },

    // ── WhatsApp Communication Tools ─────────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'send_whatsapp_message',
            description: 'Envía un mensaje directo a un contacto por WhatsApp Business API. Usa esta herramienta cuando necesites comunicarte con un socio, lead o contacto del club.',
            parameters: {
                type: 'object',
                properties: {
                    phone:   { type: 'string', description: 'Número de teléfono del destinatario con código de país (ej: 573001234567)' },
                    message: { type: 'string', description: 'Texto del mensaje a enviar' },
                    contactName: { type: 'string', description: 'Nombre del contacto (para registro y creación automática si no existe)' },
                },
                required: ['phone', 'message'],
            },
        },
        requiredCapabilities: ['whatsapp_send', 'whatsapp_campaigns'],
    },
    {
        type: 'function',
        function: {
            name: 'create_whatsapp_campaign',
            description: 'Crea una campaña de WhatsApp para enviar mensajes masivos a una lista de contactos usando un template aprobado por Meta. Usa esta herramienta para difundir eventos, noticias o convocatorias.',
            parameters: {
                type: 'object',
                properties: {
                    name:        { type: 'string', description: 'Nombre descriptivo de la campaña (ej: "Convocatoria Reunión Abril")' },
                    description: { type: 'string', description: 'Descripción interna de la campaña' },
                    listName:    { type: 'string', description: 'Nombre de la lista de contactos a la que se enviará (ej: "Socios Activos", "Leads Web")' },
                    templateName:{ type: 'string', description: 'Nombre del template de WhatsApp aprobado a usar' },
                    templateVars:{ type: 'string', description: 'Variables del template en formato JSON string (ej: {"1":"Reunión Mensual","2":"15 de Abril"})' },
                    scheduledAt: { type: 'string', description: 'Fecha/hora de envío programado en ISO (opcional, si no se indica se crea como borrador)' },
                },
                required: ['name', 'listName'],
            },
        },
        requiredCapabilities: ['whatsapp_campaigns'],
    },
    {
        type: 'function',
        function: {
            name: 'import_leads_to_whatsapp',
            description: 'Importa los leads (formularios de contacto) del sitio web como contactos de WhatsApp para seguimiento directo. Usa esta herramienta cuando quieras convertir visitantes interesados en contactos activos de WhatsApp.',
            parameters: {
                type: 'object',
                properties: {
                    tags:     { type: 'string', description: 'Tags separados por coma para categorizar los contactos importados (ej: "lead-web,interesado,abril-2026")' },
                    listName: { type: 'string', description: 'Nombre de la lista donde agrupar los contactos importados (se crea si no existe)' },
                },
                required: [],
            },
        },
        requiredCapabilities: ['whatsapp_import', 'whatsapp_campaigns'],
    },

    // ── SEO & Performance Optimization Tools ─────────────────────────────
    {
        type: 'function',
        function: {
            name: 'run_seo_audit',
            description: 'Ejecuta una auditoría SEO completa del sitio web del club. Revisa meta-tags, headings, Open Graph, sitemap coverage y problemas de indexación. Usa esta herramienta cuando el usuario pida optimizar SEO o revisar el posicionamiento.',
            parameters: {
                type: 'object',
                properties: {
                    scope: { type: 'string', description: 'Alcance de la auditoría', enum: ['full', 'meta-tags', 'og-data', 'sitemap', 'headings'] },
                    pages: { type: 'string', description: 'Páginas específicas a auditar separadas por coma (opcional, por defecto audita todas). Ej: "home,quienes-somos,proyectos"' },
                },
                required: ['scope'],
            },
        },
        requiredCapabilities: ['seo_technical', 'seo_content', 'seo_sitemap'],
    },
    {
        type: 'function',
        function: {
            name: 'generate_seo_content',
            description: 'Genera contenido optimizado para SEO: meta descriptions, títulos, keywords y textos alternativos. Usa esta herramienta cuando necesites mejorar el posicionamiento de una página o sección del sitio.',
            parameters: {
                type: 'object',
                properties: {
                    page:        { type: 'string', description: 'Página objetivo (ej: "home", "quienes-somos", "proyectos", "rotaract")' },
                    contentType: { type: 'string', description: 'Tipo de contenido SEO a generar', enum: ['meta_description', 'seo_title', 'keywords', 'alt_texts', 'structured_data', 'full_package'] },
                    language:    { type: 'string', description: 'Idioma del contenido', enum: ['es', 'en', 'fr'] },
                    focusKeyword:{ type: 'string', description: 'Keyword principal para optimizar (ej: "club rotario", "servicio comunitario", "voluntariado")' },
                },
                required: ['page', 'contentType'],
            },
        },
        requiredCapabilities: ['seo_content', 'programmatic_seo', 'seo_technical'],
    },
];


// ═══════════════════════════════════════════════════════════════════════════
// TOOL EXECUTORS — Actually perform the actions
// ═══════════════════════════════════════════════════════════════════════════

const toolExecutors = {
    async capture_whatsapp_lead(args, userId, clubId) {
        const { name, phone, email, reason, message } = args;
        const fallbackClubId = clubId || '00000000-0000-0000-0000-000000000000'; // Public requests might have a specific clubId
        const result = await db.query(
            `INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, email, tags, source, status, metadata, "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'chatbot', 'active', $6, NOW())
             ON CONFLICT (phone, "clubId") DO UPDATE SET
             tags = array_append("WhatsAppContact".tags, 'prospecto'),
             "updatedAt" = NOW()
             RETURNING id, name, phone`,
            [
                fallbackClubId, 
                name, 
                phone, 
                email || null, 
                ['prospecto', reason || 'duda_general'], 
                message ? JSON.stringify({ ai_capture_message: message }) : null
            ]
        );
        return {
            success: true,
            action: 'capture_whatsapp_lead',
            emoji: '📱',
            label: 'LEAD CAPTURADO',
            data: result.rows[0],
            message: `✅ Contacto guardado con éxito. Pronto nos comunicaremos al ${phone}.`
        };
    },

    async create_news_post(args, userId, clubId) {
        const { title, content, category, published } = args;
        const result = await db.query(
            `INSERT INTO "Post" (id, title, content, published, "clubId", category, "isAI", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, NOW(), NOW()) RETURNING id, title, published`,
            [title, content, published || false, clubId, category || 'noticias']
        );
        const post = result.rows[0];
        return {
            success: true,
            action: 'create_news_post',
            emoji: '📰',
            label: 'Noticia creada',
            data: post,
            message: published
                ? `✅ Noticia "${title}" publicada exitosamente.`
                : `✅ Noticia "${title}" creada como borrador. Puedes publicarla desde el panel de Noticias.`,
        };
    },

    async create_project(args, userId, clubId) {
        const { title, description, category, status, ubicacion, meta, beneficiarios, impacto } = args;
        const result = await db.query(
            `INSERT INTO "Project" (id, title, description, category, status, ubicacion, meta, beneficiarios, impacto, "clubId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING id, title, status`,
            [title, description, category || 'general', status || 'planned', ubicacion || null, meta || 0, beneficiarios || 0, impacto || null, clubId]
        );
        const project = result.rows[0];
        const statusLabel = { planned: '📋 Planificado', active: '🟢 Activo', completed: '✅ Completado' }[project.status] || project.status;
        return {
            success: true,
            action: 'create_project',
            emoji: '🚀',
            label: 'Proyecto creado',
            data: project,
            message: `✅ Proyecto "${title}" creado exitosamente (${statusLabel}). Puedes verlo en Admin → Proyectos.`,
        };
    },

    async create_calendar_event(args, userId, clubId) {
        const { title, description, startDate, endDate, location, type } = args;
        const result = await db.query(
            `INSERT INTO "CalendarEvent" (id, title, description, "startDate", "endDate", location, type, "clubId", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id, title, "startDate"`,
            [title, description || '', new Date(startDate), endDate ? new Date(endDate) : null, location || '', type || 'otro', clubId]
        );
        const event = result.rows[0];
        const dateStr = new Date(startDate).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return {
            success: true,
            action: 'create_calendar_event',
            emoji: '📅',
            label: 'Evento creado',
            data: event,
            message: `✅ Evento "${title}" agendado para el ${dateStr}. Puedes verlo en el Calendario.`,
        };
    },

    async create_publication(args, userId, clubId) {
        const { title, content, platform, publishDate } = args;
        const result = await db.query(
            `INSERT INTO "Publication" (id, title, content, platform, status, "publishDate", "aiGenerated", "clubId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, 'draft', $4, true, $5, NOW(), NOW()) RETURNING id, title, platform, "publishDate"`,
            [title, content, platform, new Date(publishDate), clubId]
        );
        const pub = result.rows[0];
        const dateStr = new Date(publishDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
        return {
            success: true,
            action: 'create_publication',
            emoji: '📱',
            label: 'Publicación programada',
            data: pub,
            message: `✅ Publicación "${title}" programada para ${dateStr} en ${platform}. Puedes editarla en el Calendario Editorial.`,
        };
    },

    async update_site_setting(args, userId, clubId) {
        const { key, value } = args;
        // Upsert setting
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
             ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
            [key, value, clubId]
        );
        const labels = {
            hero_title: 'Título del Hero',
            hero_subtitle: 'Subtítulo del Hero',
            seo_title: 'Título SEO',
            seo_description: 'Descripción SEO',
            contact_email: 'Email de contacto',
            contact_phone: 'Teléfono de contacto',
            contact_address: 'Dirección',
            color_primary: 'Color primario',
            color_secondary: 'Color secundario',
        };
        return {
            success: true,
            action: 'update_site_setting',
            emoji: '⚙️',
            label: 'Configuración actualizada',
            data: { key, value },
            message: `✅ ${labels[key] || key} actualizado a "${value}".`,
        };
    },

    async trigger_n8n_webhook(args, userId, clubId) {
        const { workflowName, payload } = args;
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        
        if (!webhookUrl) {
            return {
                success: false,
                action: 'trigger_n8n_webhook',
                message: `❌ N8N_WEBHOOK_URL no está configurado en las variables de entorno.`
            };
        }

        try {
            let parsedPayload = payload;
            try { parsedPayload = JSON.parse(payload); } catch(e) {}

            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflowName, clubId, userId, payload: parsedPayload })
            });
            const data = await res.text();
            
            return {
                success: res.ok,
                action: 'trigger_n8n_webhook',
                emoji: '⚡',
                label: 'N8N Webhook',
                data,
                message: res.ok 
                    ? `✅ Workflow "${workflowName}" disparado exitosamente en n8n.` 
                    : `❌ Fallo al disparar el workflow en n8n: ${res.statusText}`,
            };
        } catch (error) {
            return {
                success: false,
                action: 'trigger_n8n_webhook',
                message: `❌ Error de red al disparar n8n: ${error.message}`
            };
        }
    },

    async delegate_task(args, userId, clubId) {
        const { target_agent, task_description, urgency } = args;
        
        try {
            // Find target agent id
            const agentQuery = await db.query('SELECT id FROM "Agent" WHERE LOWER(name) = LOWER($1) AND ("clubId" = $2 OR "clubId" IS NULL) LIMIT 1', [target_agent, clubId]);
            if (agentQuery.rows.length === 0) {
                return { success: false, action: 'delegate_task', message: `❌ No se encontró al agente ${target_agent}.` };
            }
            const targetAgentId = agentQuery.rows[0].id;

            // Generate a conversation ID for the delegated task
            // Ensure tables exist before inserting
            await db.query(`
                CREATE TABLE IF NOT EXISTS "AgentConversation" (
                    id VARCHAR(60) PRIMARY KEY, "agentId" UUID, "clubId" UUID, title VARCHAR(255),
                    "lastMessage" TEXT, "messageCount" INT DEFAULT 0, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW()
                )
            `).catch(() => {});
            await db.query(`
                CREATE TABLE IF NOT EXISTS "AgentMessage" (
                    id SERIAL PRIMARY KEY, "conversationId" VARCHAR(60), role VARCHAR(20), text TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW()
                )
            `).catch(() => {});

            const conversationId = `delegated-${Date.now()}`;
            const promptMsg = `[TAREA DELEGADA POR ORQUESTADOR] Urgencia: ${urgency || 'Media'}\n\nRequerimiento:\n${task_description}`;

            await db.query(`
                INSERT INTO "AgentConversation" (id, "agentId", "clubId", title, "lastMessage", "messageCount", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [conversationId, targetAgentId, clubId, 'Tarea Delegada', promptMsg, 1]);
            
            await db.query(`
                INSERT INTO "AgentMessage" ("conversationId", role, text, "createdAt")
                VALUES ($1, 'user', $2, NOW())
            `, [conversationId, promptMsg]);

            // Track the activity
            await db.query(`
                INSERT INTO "AgentActivity" ("agentId", "agentName", "userId", "clubId", action, tool, details, success)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [targetAgentId, target_agent, userId || null, clubId, 'task_received', 'delegate_task', JSON.stringify({ urgency }), true]).catch(() => {});

            return {
                success: true,
                action: 'delegate_task',
                emoji: '🤝',
                label: `Tarea asignada a ${target_agent}`,
                data: { target_agent, task_description },
                message: `✅ Tarea delegada exitosamente a ${target_agent}.`
            };
        } catch (error) {
            console.error('delegate_task error:', error);
            return {
                success: false,
                action: 'delegate_task',
                message: `❌ Error al delegar la tarea: ${error.message}`
            };
        }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ── WHATSAPP COMMUNICATION EXECUTORS ────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    async send_whatsapp_message(args, userId, clubId) {
        const { phone, message, contactName } = args;

        try {
            // Get club's WhatsApp config
            const configR = await db.query(
                'SELECT "phoneNumberId", "accessToken", enabled FROM "WhatsAppConfig" WHERE "clubId" = $1',
                [clubId]
            );
            if (configR.rows.length === 0 || !configR.rows[0].enabled) {
                return {
                    success: false, action: 'send_whatsapp_message',
                    message: '❌ WhatsApp no está configurado para este club. Ve a Configuración → WhatsApp CRM para activarlo.'
                };
            }
            const { phoneNumberId, accessToken } = configR.rows[0];

            // Ensure contact exists (upsert)
            await db.query(`
                INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, source, status, "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, $3, 'agent', 'active', NOW(), NOW())
                ON CONFLICT (phone, "clubId") DO UPDATE SET name = COALESCE(NULLIF($2, ''), "WhatsAppContact".name), "updatedAt" = NOW()
            `, [clubId, contactName || 'Sin nombre', phone]);

            // Send via Meta Graph API
            const waResponse = await fetch(`https://graph.facebook.com/${process.env.WA_API_VERSION || 'v21.0'}/${phoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: phone,
                    type: 'text',
                    text: { body: message },
                }),
            });
            const waData = await waResponse.json();

            if (!waResponse.ok) {
                return {
                    success: false, action: 'send_whatsapp_message',
                    message: `❌ Error de WhatsApp API: ${waData.error?.message || waResponse.statusText}`
                };
            }

            // Log the message
            const messageId = waData.messages?.[0]?.id || null;
            await db.query(`
                INSERT INTO "WhatsAppMessageLog" (id, "clubId", phone, "messageId", "bodyText", status, direction, "sentAt", "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, $3, $4, 'sent', 'outgoing', NOW(), NOW(), NOW())
            `, [clubId, phone, messageId, message]);

            // Update contact stats
            await db.query(
                'UPDATE "WhatsAppContact" SET "totalSent" = "totalSent" + 1, "updatedAt" = NOW() WHERE phone = $1 AND "clubId" = $2',
                [phone, clubId]
            );

            return {
                success: true,
                action: 'send_whatsapp_message',
                emoji: '💬',
                label: 'Mensaje WhatsApp enviado',
                data: { phone, messageId },
                message: `✅ Mensaje enviado a ${contactName || phone} por WhatsApp.`,
            };
        } catch (error) {
            console.error('send_whatsapp_message error:', error);
            return { success: false, action: 'send_whatsapp_message', message: `❌ Error al enviar WhatsApp: ${error.message}` };
        }
    },

    async create_whatsapp_campaign(args, userId, clubId) {
        const { name, description, listName, templateName, templateVars, scheduledAt } = args;

        try {
            // Find or notify about the list
            const listR = await db.query(
                'SELECT id, name FROM "WhatsAppContactList" WHERE "clubId" = $1 AND LOWER(name) = LOWER($2)',
                [clubId, listName]
            );

            let listId = null;
            let listInfo = '';
            if (listR.rows.length > 0) {
                listId = listR.rows[0].id;
                // Count members
                const countR = await db.query('SELECT COUNT(*) as total FROM "ContactListMember" WHERE "listId" = $1', [listId]);
                listInfo = ` (${countR.rows[0].total} contactos)`;
            } else {
                // Create the list
                const newList = await db.query(
                    'INSERT INTO "WhatsAppContactList" (id, "clubId", name, description, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id',
                    [clubId, listName, `Lista creada por agente para campaña: ${name}`]
                );
                listId = newList.rows[0].id;
                listInfo = ' (nueva, 0 contactos — necesitas agregar contactos)';
            }

            // Find template if specified
            let templateId = null;
            if (templateName) {
                const tmplR = await db.query(
                    'SELECT id FROM "WhatsAppTemplate" WHERE "clubId" = $1 AND LOWER(name) = LOWER($2)',
                    [clubId, templateName]
                );
                if (tmplR.rows.length > 0) templateId = tmplR.rows[0].id;
            }

            // Create the campaign
            const campaignR = await db.query(`
                INSERT INTO "WhatsAppCampaign" (id, "clubId", name, description, "listId", "templateId", "templateVars", status, "scheduledAt", "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                RETURNING id, name, status
            `, [clubId, name, description || '', listId, templateId, templateVars || null, scheduledAt ? 'scheduled' : 'draft', scheduledAt ? new Date(scheduledAt) : null]);

            const campaign = campaignR.rows[0];
            const statusEmoji = campaign.status === 'scheduled' ? '⏰' : '📝';

            return {
                success: true,
                action: 'create_whatsapp_campaign',
                emoji: '📢',
                label: 'Campaña WhatsApp creada',
                data: campaign,
                message: `✅ Campaña "${name}" creada ${statusEmoji} como ${campaign.status === 'scheduled' ? 'programada' : 'borrador'}.\n📋 Lista: "${listName}"${listInfo}\n${templateId ? `📄 Template: ${templateName}` : '⚠️ Sin template asignado — asigna uno desde el CRM WhatsApp.'}\n\nPuedes gestionarla en Admin → WhatsApp CRM → Campañas.`
            };
        } catch (error) {
            console.error('create_whatsapp_campaign error:', error);
            return { success: false, action: 'create_whatsapp_campaign', message: `❌ Error al crear campaña: ${error.message}` };
        }
    },

    async import_leads_to_whatsapp(args, userId, clubId) {
        const { tags, listName } = args;

        try {
            // Fetch leads that have phone numbers
            const leadsR = await db.query(`
                SELECT id, name, email, phone FROM "CommunicationLog"
                WHERE "clubId" = $1 AND type = 'contact_form' AND phone IS NOT NULL AND phone != ''
                ORDER BY "createdAt" DESC LIMIT 200
            `, [clubId]).catch(() => ({ rows: [] }));

            // Also check User table for users with phone who signed up
            const usersR = await db.query(`
                SELECT id, name, email, phone FROM "User"
                WHERE "clubId" = $1 AND phone IS NOT NULL AND phone != ''
                ORDER BY "createdAt" DESC LIMIT 200
            `, [clubId]).catch(() => ({ rows: [] }));

            const allLeads = [...leadsR.rows, ...usersR.rows];

            if (allLeads.length === 0) {
                return {
                    success: false, action: 'import_leads_to_whatsapp',
                    message: '⚠️ No se encontraron leads con número de teléfono para importar. Los visitantes deben completar el formulario de contacto con su número primero.'
                };
            }

            const tagArray = tags ? tags.split(',').map(t => t.trim()) : ['lead-importado'];

            // Create or find the list
            let listId = null;
            const targetListName = listName || 'Leads Web';
            const listR = await db.query(
                'SELECT id FROM "WhatsAppContactList" WHERE "clubId" = $1 AND LOWER(name) = LOWER($2)',
                [clubId, targetListName]
            );
            if (listR.rows.length > 0) {
                listId = listR.rows[0].id;
            } else {
                const newList = await db.query(
                    'INSERT INTO "WhatsAppContactList" (id, "clubId", name, description, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id',
                    [clubId, targetListName, 'Contactos importados automáticamente desde leads del sitio web']
                );
                listId = newList.rows[0].id;
            }

            let imported = 0;
            let skipped = 0;

            for (const lead of allLeads) {
                if (!lead.phone) { skipped++; continue; }
                try {
                    // Upsert contact
                    const contactR = await db.query(`
                        INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, email, tags, source, status, "createdAt", "updatedAt")
                        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'lead-import', 'active', NOW(), NOW())
                        ON CONFLICT (phone, "clubId") DO UPDATE SET 
                            tags = array_cat("WhatsAppContact".tags, $5::text[]),
                            "updatedAt" = NOW()
                        RETURNING id
                    `, [clubId, lead.name || 'Sin nombre', lead.phone, lead.email || null, tagArray]);

                    const contactId = contactR.rows[0].id;

                    // Add to list (ignore duplicates)
                    await db.query(`
                        INSERT INTO "ContactListMember" (id, "listId", "contactId", "addedAt")
                        VALUES (gen_random_uuid(), $1, $2, NOW())
                        ON CONFLICT ("listId", "contactId") DO NOTHING
                    `, [listId, contactId]);

                    imported++;
                } catch (e) {
                    skipped++;
                }
            }

            return {
                success: true,
                action: 'import_leads_to_whatsapp',
                emoji: '📥',
                label: 'Leads importados a WhatsApp',
                data: { imported, skipped, listName: targetListName },
                message: `✅ Importación completada:\n• ${imported} contactos importados\n• ${skipped} omitidos (duplicados o sin teléfono)\n• Lista: "${targetListName}"\n• Tags: ${tagArray.join(', ')}\n\nPuedes ver los contactos en Admin → WhatsApp CRM → Contactos.`
            };
        } catch (error) {
            console.error('import_leads_to_whatsapp error:', error);
            return { success: false, action: 'import_leads_to_whatsapp', message: `❌ Error al importar leads: ${error.message}` };
        }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ── SEO & OPTIMIZATION EXECUTORS ───────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    async run_seo_audit(args, userId, clubId) {
        const { scope, pages } = args;

        try {
            // Get club info for domain resolution
            const clubR = await db.query('SELECT name, subdomain, domain FROM "Club" WHERE id = $1', [clubId]);
            if (clubR.rows.length === 0) {
                return { success: false, action: 'run_seo_audit', message: '❌ Club no encontrado.' };
            }
            const club = clubR.rows[0];
            const clubDomain = club.domain || `${club.subdomain}.clubplatform.org`;

            const audit = { domain: clubDomain, score: 0, maxScore: 0, issues: [], passed: [], recommendations: [] };

            // ── Meta Tags Audit ──
            if (['full', 'meta-tags'].includes(scope)) {
                const settings = await db.query(
                    'SELECT key, value FROM "Setting" WHERE "clubId" = $1 AND key IN ($2, $3, $4, $5)',
                    [clubId, 'seo_title', 'seo_description', 'hero_title', 'hero_subtitle']
                );
                const settingsMap = {};
                settings.rows.forEach(s => { settingsMap[s.key] = s.value; });

                audit.maxScore += 4;
                if (settingsMap.seo_title && settingsMap.seo_title.length >= 30) {
                    audit.score++; audit.passed.push('✅ SEO Title configurado (' + settingsMap.seo_title.length + ' chars)');
                } else {
                    audit.issues.push('❌ SEO Title ausente o demasiado corto (mín. 30 chars)');
                    audit.recommendations.push('Configura un título SEO descriptivo con 50-60 caracteres incluyendo el nombre del club y ciudad.');
                }
                if (settingsMap.seo_description && settingsMap.seo_description.length >= 50) {
                    audit.score++; audit.passed.push('✅ Meta Description configurada (' + settingsMap.seo_description.length + ' chars)');
                } else {
                    audit.issues.push('❌ Meta Description ausente o demasiado corta (mín. 50 chars)');
                    audit.recommendations.push('Escribe una meta description de 150-160 chars que incluya la misión del club y ubicación.');
                }
                if (settingsMap.hero_title) {
                    audit.score++; audit.passed.push('✅ Hero Title (H1) configurado');
                } else {
                    audit.issues.push('⚠️ Hero Title no personalizado — usando valor por defecto');
                }
                if (settingsMap.hero_subtitle) {
                    audit.score++; audit.passed.push('✅ Hero Subtitle configurado');
                } else {
                    audit.issues.push('⚠️ Hero Subtitle no personalizado');
                }
            }

            // ── OG Data Audit ──
            if (['full', 'og-data'].includes(scope)) {
                const ogTypes = ['club', 'project', 'news'];
                audit.maxScore += 3;

                // Check if club has logo for OG image
                const logoR = await db.query('SELECT logo FROM "Club" WHERE id = $1', [clubId]);
                if (logoR.rows[0]?.logo) {
                    audit.score++; audit.passed.push('✅ Logo/OG Image del club configurado');
                } else {
                    audit.issues.push('❌ Sin logo — las previsualizaciones en redes sociales no tendrán imagen');
                    audit.recommendations.push('Sube un logo del club desde Admin → Mi Club para mejorar la presencia en redes.');
                }

                // Check published projects have images
                const projImgR = await db.query(
                    'SELECT COUNT(*) as total, COUNT(CASE WHEN image IS NOT NULL AND image != \'\' THEN 1 END) as with_image FROM "Project" WHERE "clubId" = $1',
                    [clubId]
                );
                const proj = projImgR.rows[0];
                if (parseInt(proj.total) > 0) {
                    const pct = Math.round((parseInt(proj.with_image) / parseInt(proj.total)) * 100);
                    if (pct >= 80) { audit.score++; audit.passed.push(`✅ ${pct}% de proyectos tienen imagen`); }
                    else { audit.issues.push(`⚠️ Solo ${pct}% de proyectos tienen imagen para OG`); audit.recommendations.push('Agrega imágenes a los proyectos para mejorar el engagement en redes.'); }
                } else { audit.score++; audit.passed.push('ℹ️ Sin proyectos aún'); }

                // Check posts have images
                const postImgR = await db.query(
                    'SELECT COUNT(*) as total, COUNT(CASE WHEN image IS NOT NULL AND image != \'\' THEN 1 END) as with_image FROM "Post" WHERE "clubId" = $1 AND published = true',
                    [clubId]
                );
                const posts = postImgR.rows[0];
                if (parseInt(posts.total) > 0) {
                    const pct = Math.round((parseInt(posts.with_image) / parseInt(posts.total)) * 100);
                    if (pct >= 80) { audit.score++; audit.passed.push(`✅ ${pct}% de noticias publicadas tienen imagen`); }
                    else { audit.issues.push(`⚠️ Solo ${pct}% de noticias tienen imagen para OG`); }
                } else { audit.score++; audit.passed.push('ℹ️ Sin noticias publicadas aún'); }
            }

            // ── Content Volume Audit ──
            if (['full', 'headings'].includes(scope)) {
                audit.maxScore += 3;

                const contentR = await db.query(`
                    SELECT
                        (SELECT COUNT(*) FROM "Post" WHERE "clubId" = $1 AND published = true) as posts,
                        (SELECT COUNT(*) FROM "Project" WHERE "clubId" = $1) as projects,
                        (SELECT COUNT(*) FROM "CalendarEvent" WHERE "clubId" = $1) as events
                `, [clubId]);
                const counts = contentR.rows[0];

                if (parseInt(counts.posts) >= 3) { audit.score++; audit.passed.push(`✅ ${counts.posts} noticias publicadas`); }
                else { audit.issues.push(`⚠️ Solo ${counts.posts} noticias — Google necesita contenido fresco`); audit.recommendations.push('Publica al menos 3 noticias o artículos del club para mejorar la indexación.'); }

                if (parseInt(counts.projects) >= 2) { audit.score++; audit.passed.push(`✅ ${counts.projects} proyectos registrados`); }
                else { audit.issues.push(`⚠️ Solo ${counts.projects} proyectos — agrega más contenido relevante`); }

                if (parseInt(counts.events) >= 1) { audit.score++; audit.passed.push(`✅ ${counts.events} eventos en calendario`); }
                else { audit.issues.push('⚠️ Sin eventos — los eventos generan Structured Data valioso'); }
            }

            // Calculate final score
            const percentage = audit.maxScore > 0 ? Math.round((audit.score / audit.maxScore) * 100) : 0;
            const grade = percentage >= 90 ? 'A' : percentage >= 70 ? 'B' : percentage >= 50 ? 'C' : 'D';
            const gradeEmoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' }[grade];

            let report = `${gradeEmoji} **Auditoría SEO: ${percentage}% (${grade})**\n🌐 Dominio: ${clubDomain}\n📊 Alcance: ${scope}\n\n`;
            if (audit.passed.length > 0) report += `**Aprobados (${audit.passed.length}):**\n${audit.passed.join('\n')}\n\n`;
            if (audit.issues.length > 0) report += `**Problemas (${audit.issues.length}):**\n${audit.issues.join('\n')}\n\n`;
            if (audit.recommendations.length > 0) report += `**Recomendaciones:**\n${audit.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

            return {
                success: true,
                action: 'run_seo_audit',
                emoji: '🔍',
                label: `Auditoría SEO: ${grade} (${percentage}%)`,
                data: { score: audit.score, maxScore: audit.maxScore, percentage, grade, issues: audit.issues.length },
                message: report,
            };
        } catch (error) {
            console.error('run_seo_audit error:', error);
            return { success: false, action: 'run_seo_audit', message: `❌ Error en auditoría SEO: ${error.message}` };
        }
    },

    async generate_seo_content(args, userId, clubId) {
        const { page, contentType, language, focusKeyword } = args;

        try {
            // Get club context
            const clubR = await db.query('SELECT name, city, country, description, district FROM "Club" WHERE id = $1', [clubId]);
            if (clubR.rows.length === 0) return { success: false, action: 'generate_seo_content', message: '❌ Club no encontrado.' };
            const club = clubR.rows[0];

            const lang = language || 'es';
            const keyword = focusKeyword || `club rotario ${club.city || ''}`.trim();

            // Generate content based on type
            const seoContent = {};
            const pageTitles = {
                home: 'Inicio', 'quienes-somos': 'Quiénes Somos', proyectos: 'Proyectos', rotaract: 'Rotaract',
                interact: 'Interact', blog: 'Blog', eventos: 'Eventos', contacto: 'Contacto',
                'la-fundacion-rotaria': 'La Fundación Rotaria', 'intercambio-jovenes': 'Intercambio de Jóvenes',
            };
            const pageTitle = pageTitles[page] || page;

            if (['seo_title', 'full_package'].includes(contentType)) {
                seoContent.seoTitle = `${pageTitle} | ${club.name}${club.city ? ` — ${club.city}` : ''} | Rotary International`;
                if (seoContent.seoTitle.length > 60) {
                    seoContent.seoTitle = `${pageTitle} | ${club.name} — Rotary`;
                }
            }

            if (['meta_description', 'full_package'].includes(contentType)) {
                const descriptions = {
                    home: `${club.name}${club.city ? ` en ${club.city}` : ''}: club miembro de Rotary International dedicado al servicio comunitario, ${keyword} y desarrollo social. ¡Descubre nuestros proyectos!`,
                    'quienes-somos': `Conoce la historia, misión y valores de ${club.name}. Somos un ${keyword} comprometido con el servicio por encima del interés propio.`,
                    proyectos: `Proyectos de impacto social de ${club.name}: salud, educación, agua y medio ambiente. ${keyword} transformando comunidades.`,
                    rotaract: `Rotaract de ${club.name}: jóvenes líderes entre 18-30 años creando impacto positivo a través del servicio comunitario y el liderazgo.`,
                    interact: `Interact de ${club.name}: adolescentes de 12-18 años desarrollando liderazgo y servicio. Programa juvenil de Rotary International.`,
                    blog: `Últimas noticias y artículos de ${club.name}. Entérate de eventos, proyectos y logros del ${keyword}.`,
                    contacto: `Contáctanos: ${club.name}${club.city ? ` en ${club.city}` : ''}. Formulario de contacto, ubicación y cómo unirte.`,
                };
                seoContent.metaDescription = descriptions[page] || `${pageTitle} — ${club.name}, ${keyword}. Rotary International: Servicio por encima del interés propio.`;
                // Truncate to 160 chars
                if (seoContent.metaDescription.length > 160) {
                    seoContent.metaDescription = seoContent.metaDescription.substring(0, 157) + '...';
                }
            }

            if (['keywords', 'full_package'].includes(contentType)) {
                const baseKeywords = [keyword, club.name, 'rotary international', 'servicio comunitario'];
                const pageKeywords = {
                    home: ['voluntariado', club.city, 'club rotario', 'impacto social'],
                    proyectos: ['proyectos sociales', 'donaciones', 'impacto comunitario', club.city],
                    rotaract: ['rotaract', 'jóvenes líderes', 'servicio juvenil', 'liderazgo joven'],
                    interact: ['interact', 'adolescentes', 'servicio escolar', 'liderazgo juvenil'],
                    blog: ['noticias rotary', 'blog rotario', 'eventos', club.city],
                };
                seoContent.keywords = [...baseKeywords, ...(pageKeywords[page] || [])].filter(Boolean).join(', ');
            }

            if (['structured_data', 'full_package'].includes(contentType)) {
                seoContent.structuredData = {
                    '@context': 'https://schema.org',
                    '@type': 'Organization',
                    name: club.name,
                    description: club.description || `Club miembro de Rotary International en ${club.city || 'Colombia'}`,
                    address: club.city ? { '@type': 'PostalAddress', addressLocality: club.city, addressCountry: club.country || 'CO' } : undefined,
                    memberOf: { '@type': 'Organization', name: 'Rotary International', url: 'https://www.rotary.org' },
                };
            }

            // Auto-save SEO title and description to Settings
            if (seoContent.seoTitle) {
                await db.query(
                    `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, NOW()) ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
                    [`seo_title_${page}`, seoContent.seoTitle, clubId]
                );
            }
            if (seoContent.metaDescription) {
                await db.query(
                    `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, NOW()) ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
                    [`seo_desc_${page}`, seoContent.metaDescription, clubId]
                );
            }

            let report = `✅ **Contenido SEO generado para "${pageTitle}"**\n🔑 Keyword: ${keyword}\n\n`;
            if (seoContent.seoTitle) report += `📌 **Title Tag** (${seoContent.seoTitle.length} chars):\n\`${seoContent.seoTitle}\`\n\n`;
            if (seoContent.metaDescription) report += `📝 **Meta Description** (${seoContent.metaDescription.length} chars):\n\`${seoContent.metaDescription}\`\n\n`;
            if (seoContent.keywords) report += `🏷️ **Keywords:**\n${seoContent.keywords}\n\n`;
            if (seoContent.structuredData) report += `📊 **Structured Data (JSON-LD):**\nGenerado y listo para insertar en la página.\n\n`;
            report += `💾 Configuración guardada automáticamente en Settings del club.`;

            return {
                success: true,
                action: 'generate_seo_content',
                emoji: '🔎',
                label: `SEO "${pageTitle}" generado`,
                data: seoContent,
                message: report,
            };
        } catch (error) {
            console.error('generate_seo_content error:', error);
            return { success: false, action: 'generate_seo_content', message: `❌ Error al generar SEO content: ${error.message}` };
        }
    },
};


// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the OpenAI-compatible tools array filtered by agent capabilities
 */
export function getToolsForAgent(capabilities = []) {
    if (!capabilities || capabilities.length === 0) return [];
    return AGENT_TOOLS.filter(tool =>
        tool.requiredCapabilities.some(cap => capabilities.includes(cap))
    ).map(({ type, function: fn }) => ({ type, function: fn }));
}

/**
 * Execute a tool call and return the result
 */
export async function executeTool(toolName, args, userId, clubId) {
    const executor = toolExecutors[toolName];
    if (!executor) {
        return { success: false, message: `Herramienta "${toolName}" no encontrada.` };
    }
    try {
        return await executor(args, userId, clubId);
    } catch (error) {
        console.error(`Tool execution error [${toolName}]:`, error);
        return {
            success: false,
            action: toolName,
            message: `❌ Error al ejecutar ${toolName}: ${error.message}`,
        };
    }
}

/**
 * Get a summary of available tools for an agent (used in system prompt)
 */
export function getToolsSummary(capabilities = []) {
    const tools = getToolsForAgent(capabilities);
    if (tools.length === 0) return '';

    const lines = ['\n🔧 HERRAMIENTAS DISPONIBLES (puedes ejecutar acciones reales):'];
    tools.forEach(t => {
        const params = Object.keys(t.function.parameters.properties).join(', ');
        lines.push(`  • ${t.function.name}: ${t.function.description} (params: ${params})`);
    });
    lines.push('');
    lines.push('IMPORTANTE SOBRE HERRAMIENTAS:');
    lines.push('- Cuando el usuario te PIDA crear algo (noticia, proyecto, evento, publicación), USA la herramienta correspondiente.');
    lines.push('- Cuando solo pregunta o quiere sugerencias, responde normalmente SIN usar herramientas.');
    lines.push('- Antes de crear algo, CONFIRMA con el usuario los detalles clave (título, contenido).');
    lines.push('- Si el usuario dice "crea", "publica", "registra", "agenda" → usa la herramienta.');
    return lines.join('\n');
}


// ═══════════════════════════════════════════════════════════════════════════
// MULTI-AGENT WORKFLOW SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * After a tool is executed, suggest next steps for other agents.
 * Returns an array of suggestions with the target agent name and action.
 */
export function getWorkflowSuggestions(toolName, toolArgs = {}) {
    const suggestions = [];

    switch (toolName) {
        case 'create_project':
            suggestions.push(
                { agent: 'Rafael', emoji: '✍️', action: `Redactar la descripción de impacto del proyecto "${toolArgs.title}"` },
                { agent: 'Camila', emoji: '💬', action: `Notificar a los socios por WhatsApp sobre el nuevo proyecto "${toolArgs.title}"` },
                { agent: 'Martín', emoji: '🔎', action: `Generar SEO optimizado para el proyecto "${toolArgs.title}"` },
                { agent: 'Santiago', emoji: '💻', action: `Verificar que el proyecto "${toolArgs.title}" se publique correctamente en el sitio` },
            );
            break;

        case 'create_news_post':
            suggestions.push(
                { agent: 'Andrés', emoji: '📱', action: `Preparar posts de redes sociales para difundir "${toolArgs.title}"` },
                { agent: 'Camila', emoji: '💬', action: `Enviar la noticia a contactos WhatsApp del club` },
                { agent: 'Valentina', emoji: '🎨', action: `Revisar que la noticia cumpla con la identidad visual del club` },
                { agent: 'Martín', emoji: '🔎', action: `Optimizar SEO del artículo "${toolArgs.title}"` },
            );
            break;

        case 'create_calendar_event':
            suggestions.push(
                { agent: 'Camila', emoji: '💬', action: `Crear campaña WhatsApp de invitación al evento "${toolArgs.title}"` },
                { agent: 'Andrés', emoji: '📱', action: `Crear publicación de invitación para redes sociales` },
                { agent: 'Isabel', emoji: '✉️', action: `Preparar secuencia de email para el evento` },
            );
            break;

        case 'create_publication':
            suggestions.push(
                { agent: 'Camila', emoji: '💬', action: `Difundir la publicación "${toolArgs.title}" por WhatsApp` },
                { agent: 'Valentina', emoji: '🎨', action: `Aprobar que el diseño cumpla con la marca Rotary` },
            );
            break;

        case 'update_site_setting':
            suggestions.push(
                { agent: 'Santiago', emoji: '💻', action: `Verificar que el cambio "${toolArgs.key}" se refleje correctamente en el sitio` },
                { agent: 'Valentina', emoji: '🎨', action: `Revisar coherencia visual después del cambio de configuración` },
            );
            break;

        case 'send_whatsapp_message':
            suggestions.push(
                { agent: 'Isabel', emoji: '✉️', action: `Complementar seguimiento por email al contacto ${toolArgs.phone}` },
                { agent: 'Andrés', emoji: '📱', action: `Verificar presencia del contacto en redes sociales del club` },
            );
            break;

        case 'create_whatsapp_campaign':
            suggestions.push(
                { agent: 'Rafael', emoji: '✍️', action: `Redactar el copy de la campaña "${toolArgs.name}"` },
                { agent: 'Lucía', emoji: '📈', action: `Preparar tracking de conversión para la campaña WhatsApp` },
                { agent: 'Andrés', emoji: '📱', action: `Crear versión de la campaña para redes sociales` },
            );
            break;

        case 'import_leads_to_whatsapp':
            suggestions.push(
                { agent: 'Camila', emoji: '💬', action: `Crear campaña de bienvenida para los leads importados` },
                { agent: 'Isabel', emoji: '✉️', action: `Preparar secuencia de email complementaria para nuevos leads` },
                { agent: 'Diana', emoji: '🧠', action: `Analizar el perfil de los leads importados para segmentación` },
            );
            break;

        case 'run_seo_audit':
            suggestions.push(
                { agent: 'Martín', emoji: '🔎', action: `Generar contenido SEO para las páginas con problemas detectados` },
                { agent: 'Santiago', emoji: '💻', action: `Implementar las correcciones técnicas recomendadas` },
                { agent: 'Valentina', emoji: '🎨', action: `Revisar que las correcciones SEO no afecten el diseño` },
            );
            break;

        case 'generate_seo_content':
            suggestions.push(
                { agent: 'Santiago', emoji: '💻', action: `Implementar los meta-tags generados en la página "${toolArgs.page}"` },
                { agent: 'Martín', emoji: '🔎', action: `Verificar indexación después de actualizar el SEO` },
            );
            break;
    }

    return suggestions;
}
