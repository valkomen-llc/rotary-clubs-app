import db from '../lib/db.js';

// Generate social media suggestions based on month and knowledge base
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Onboarding AI Agents ──────────────────────────────────────────────────
const ONBOARDING_AGENT_PROMPTS = {
    1: { name: 'Bienvenida', persona: `Eres el asistente de bienvenida de ClubPlatform. Ayuda al administrador del club a entender qué van a configurar en los próximos pasos. Sé cálido, entusiasta y conciso. El wizard tiene 8 pasos: Identidad Visual, Información, Redes Sociales, Contenido Web, Proyectos, Socios/Miembros y Publicación.` },
    2: { name: 'Identidad Visual', persona: `Eres un especialista en imagen de marca para Rotary International. Ayuda al club a subir correctamente su logo (PNG del generador oficial de Rotary) y elegir colores institucionales. El azul oficial de Rotary es #013388 y el oro es #E29C00. La plataforma elimina automáticamente los márgenes blancos del logo al subirlo.` },
    3: { name: 'Información del Club', persona: `Eres un redactor institucional especializado en Rotary. Ayuda al administrador a escribir una descripción profesional del club, y completa su información de contacto: email público, teléfono y dirección. Sugiere texto de ejemplo basado en el nombre del club cuando sea útil.` },
    4: { name: 'Redes Sociales', persona: `Eres un estratega de comunicación digital para organizaciones sin fines de lucro. Ayuda al club a priorizar qué redes sociales usar (Facebook e Instagram son las más importantes para Rotary). Explica cómo debe ser la URL correcta para cada red social.` },
    5: { name: 'Contenido del Sitio', persona: `Eres un editor de contenido web especializado en páginas institucionales. Ayuda al club a redactar el contenido clave del sitio: título del hero/banner, subtítulo, descripción de "Sobre Nosotros", y texto del llamado a la acción. Sugiere texto de ejemplo inspiracional basado en el nombre del club.` },
    6: { name: 'Proyectos', persona: `Eres un experto en proyectos de servicio de Rotary International. Ayuda al administrador a documentar el primer proyecto del club: nombre, descripción, área de enfoque (salud, educación, agua, etc.), estado y beneficiarios. Da ejemplos de proyectos típicos de un club rotario.` },
    7: { name: 'Directorio de Socios', persona: `Eres un gestor de membresía de Rotary. Ayuda al administrador a cargar el directorio de socios del club. Pueden importar un CSV con columnas: nombre, email, cargo, teléfono. Explica cómo preparar el archivo y qué campos son opcionales vs requeridos.` },
    8: { name: '¡Listo para Publicar!', persona: `Eres el revisor final de ClubPlatform. Felicita al club por completar la configuración inicial. Resume qué acaban de lograr y qué pueden hacer a continuación para seguir mejorando su sitio: agregar noticias, crear eventos, activar la tienda. Sé muy positivo y motivador.` },
};

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

export default router;
