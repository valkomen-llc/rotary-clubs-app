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
];


// ═══════════════════════════════════════════════════════════════════════════
// TOOL EXECUTORS — Actually perform the actions
// ═══════════════════════════════════════════════════════════════════════════

const toolExecutors = {
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
                { agent: 'Camila', emoji: '📸', action: `Definir el concepto visual y fotos para el proyecto "${toolArgs.title}"` },
                { agent: 'Santiago', emoji: '💻', action: `Verificar que el proyecto "${toolArgs.title}" se publique correctamente en el sitio` },
            );
            break;

        case 'create_news_post':
            suggestions.push(
                { agent: 'Camila', emoji: '📸', action: `Crear imagen de portada para la noticia "${toolArgs.title}"` },
                { agent: 'Andrés', emoji: '📱', action: `Preparar posts de redes sociales para difundir "${toolArgs.title}"` },
                { agent: 'Valentina', emoji: '🎨', action: `Revisar que la noticia cumpla con la identidad visual del club` },
            );
            break;

        case 'create_calendar_event':
            suggestions.push(
                { agent: 'Andrés', emoji: '📱', action: `Crear publicación de invitación para el evento "${toolArgs.title}"` },
                { agent: 'Isabel', emoji: '📰', action: `Preparar comunicado de prensa para el evento` },
                { agent: 'Camila', emoji: '📸', action: `Planificar cobertura visual del evento` },
            );
            break;

        case 'create_publication':
            suggestions.push(
                { agent: 'Camila', emoji: '📸', action: `Crear visual/diseño para la publicación "${toolArgs.title}"` },
                { agent: 'Valentina', emoji: '🎨', action: `Aprobar que el diseño cumpla con la marca Rotary` },
            );
            break;

        case 'update_site_setting':
            suggestions.push(
                { agent: 'Santiago', emoji: '💻', action: `Verificar que el cambio "${toolArgs.key}" se refleje correctamente en el sitio` },
                { agent: 'Valentina', emoji: '🎨', action: `Revisar coherencia visual después del cambio de configuración` },
            );
            break;
    }

    return suggestions;
}
