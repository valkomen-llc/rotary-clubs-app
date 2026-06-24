/**
 * Container Studio — generación de textos de los contenedores de la portada de
 * eventos a partir del Cerebro institucional (RAG) (v4.491).
 *
 * El usuario edita en ClubSettings las cajas/bloques de la portada
 * (estadísticas, "Únete a Rotary", "Somos gente de acción", "Nuestra
 * Fundación"). Esta herramienta los autorrellena con texto COHERENTE con lo que
 * el Cerebro del sitio ya sabe (documentos indexados + memorias del onboarding).
 *
 * Flujo:
 *   1. Resolver el cerebro del club (resolveBrainsForClub).
 *   2. RAG: searchMemories() con una consulta específica por contenedor.
 *   3. Armar contexto y pedir a Gemini (generateCopy, jsonMode) el JSON con el
 *      shape exacto que espera el frontend.
 *   4. Devolver el JSON + las fuentes usadas (para que el admin sepa de dónde
 *      salió el texto). El admin revisa y guarda con el flujo existente.
 *
 * Diseñado como registry (igual que ENGINES de imagen): agregar un contenedor =
 * agregar una entrada a CONTAINERS, sin reescribir la lógica.
 */
import { resolveBrainsForClub, searchMemories, listRecentMemories } from '../services/brainService.js';
import { generateCopy } from '../services/copywritingService.js';

// Iconos válidos para las cajas de estadísticas — DEBE coincidir con el <select>
// de ClubSettings.tsx y con STAT_ICONS de StatsSection.tsx.
const STAT_ICON_KEYS = [
    'globe', 'users', 'dollar', 'heart', 'handheart', 'award', 'trophy',
    'calendar', 'star', 'flag', 'gift', 'sparkles', 'rocket', 'megaphone'
];

// Iconos válidos para los bloques de texto (action/join/foundation) — DEBE
// coincidir con sus <select> en ClubSettings.tsx.
const TEXT_BLOCK_ICON_KEYS = [
    'star', 'heart', 'handshake', 'send', 'sparkles', 'megaphone',
    'flag', 'gift', 'users', 'calendar', 'award', 'trophy', 'rocket'
];

const HEX = /^#[0-9a-fA-F]{6}$/;

// Constructor de definición para los bloques de texto título+highlight+cuerpo+CTA+icono.
// `extraField` permite añadir campos propios del bloque (ej. iconColor en action).
const textBlockContainer = ({ label, blockName, query, tone, fallbackIcon, withIconColor = false }) => ({
    label,
    query,
    schemaField: 'content',
    instructions:
        `Genera TODO el contenido del bloque "${blockName}". Devuelve un objeto JSON con la clave ` +
        `"content" que contenga:\n` +
        '  - "title": título corto y potente (máx 8 palabras).\n' +
        '  - "titleHighlight": una palabra o frase MUY corta del título para resaltar (o "" si no aplica).\n' +
        '  - "titleHighlightColor": color hex para ese resaltado (ej "#f6a40a").\n' +
        '  - "text": 2-3 frases descriptivas.\n' +
        '  - "buttonText": texto del botón (CTA), 2-4 palabras.\n' +
        `  - "icon": una de estas claves EXACTAS: ${TEXT_BLOCK_ICON_KEYS.join(', ')}.\n` +
        (withIconColor ? '  - "iconColor": color hex para el icono (ej "#F5A623").\n' : '') +
        `En español, tono ${tone}. NO inventes datos, nombres ni cifras fuera del CONTEXTO. ` +
        'NO generes URLs ni enlaces.',
    validate: (parsed) => {
        const c = parsed?.content || {};
        const out = {
            title: String(c.title ?? '').slice(0, 120),
            titleHighlight: String(c.titleHighlight ?? '').slice(0, 60),
            titleHighlightColor: HEX.test(c.titleHighlightColor || '') ? c.titleHighlightColor : '#f6a40a',
            text: String(c.text ?? '').slice(0, 800),
            buttonText: String(c.buttonText ?? '').slice(0, 40),
            icon: TEXT_BLOCK_ICON_KEYS.includes(c.icon) ? c.icon : fallbackIcon
        };
        if (withIconColor) out.iconColor = HEX.test(c.iconColor || '') ? c.iconColor : '#F5A623';
        return out;
    }
});

// ─── Registry de contenedores ────────────────────────────────────────────────
// query       → consulta RAG hacia el Cerebro (qué memorias recuperar).
// schemaField → nombre del campo en el JSON de salida del modelo.
// instructions→ qué debe producir el modelo (forma + reglas específicas).
// validate    → normaliza/valida la salida del modelo antes de devolverla.
const CONTAINERS = {
    stats: {
        label: 'Sección de Estadísticas (3 Cajas)',
        query: 'cifras, números, impacto, alcance, beneficiarios, fondos recaudados, ' +
               'logros, metas y datos cuantitativos del evento y del club',
        schemaField: 'boxes',
        instructions:
            'Genera EXACTAMENTE 3 cajas de estadísticas para la portada. Devuelve un objeto ' +
            'JSON con la clave "boxes": un array de 3 objetos, cada uno con:\n' +
            `  - "icon": una de estas claves EXACTAS: ${STAT_ICON_KEYS.join(', ')} (elige la más representativa del dato).\n` +
            '  - "color": un color hex que combine con la identidad (ej "#004080" azul Rotary, "#9333EA", "#F2B10D").\n' +
            '  - "value": la cifra/valor destacado, corto (ej "+1.2M", "+47M", "$291M", "120", "30 años").\n' +
            '  - "text": 1-2 frases describiendo la cifra, en español, tono institucional Rotary.\n' +
            'REGLA CRÍTICA sobre las cifras (value): usa ÚNICAMENTE números que aparezcan ' +
            'explícitamente en el CONTEXTO. NO inventes cifras. Si no hay datos numéricos ' +
            'suficientes en el contexto, usa valores cualitativos honestos (ej "Global", "+Voluntarios") ' +
            'en vez de números inventados.',
        validate: (parsed) => {
            const boxes = Array.isArray(parsed?.boxes) ? parsed.boxes : [];
            const norm = boxes.slice(0, 3).map((b, i) => ({
                icon: STAT_ICON_KEYS.includes(b?.icon) ? b.icon : ['globe', 'users', 'dollar'][i] || 'sparkles',
                color: /^#[0-9a-fA-F]{6}$/.test(b?.color || '') ? b.color : ['#004080', '#9333EA', '#F2B10D'][i] || '#004080',
                value: String(b?.value ?? '').slice(0, 24),
                text: String(b?.text ?? '').slice(0, 600)
            }));
            // Garantizar 3 cajas aunque el modelo devuelva menos.
            while (norm.length < 3) {
                const i = norm.length;
                norm.push({ icon: ['globe', 'users', 'dollar'][i] || 'sparkles', color: ['#004080', '#9333EA', '#F2B10D'][i] || '#004080', value: '', text: '' });
            }
            return norm;
        }
    },

    // Bloques de texto título + highlight + cuerpo + CTA + icono. Mismo patrón,
    // distinto query/tono. La IA genera TODOS los campos del contenedor (menos la
    // URL del botón, que es un enlace y no se inventa).
    action: textBlockContainer({
        label: 'Somos gente de acción',
        blockName: 'Somos gente de acción',
        query: 'misión, valores, propósito de servicio, gente de acción, qué hace el club y el evento, llamado a la acción',
        tone: 'institucional Rotary, inspirador y movilizador',
        fallbackIcon: 'star',
        withIconColor: true
    }),

    join: textBlockContainer({
        label: 'Únete a Rotary',
        blockName: 'Únete a Rotary',
        query: 'cómo unirse, membresía, beneficios de pertenecer, invitación a sumarse al club o al evento, comunidad',
        tone: 'aspiracional y comunitario',
        fallbackIcon: 'star'
    }),

    foundation: textBlockContainer({
        label: 'Nuestra Fundación',
        blockName: 'Nuestra Fundación',
        query: 'La Fundación Rotaria, donaciones, subvenciones, proyectos sostenibles, impacto de los fondos, causas apoyadas',
        tone: 'institucional y de impacto',
        fallbackIcon: 'gift'
    })
};

// Lista pública de contenedores soportados (para un futuro selector en UI).
export const listContainers = (_req, res) => {
    res.json({
        containers: Object.entries(CONTAINERS).map(([id, c]) => ({ id, label: c.label }))
    });
};

/**
 * POST /api/content-studio/generate-container
 * Body: { clubId?, container }
 */
export const generateContainer = async (req, res) => {
    try {
        const containerId = String(req.body?.container || '').trim();
        const def = CONTAINERS[containerId];
        if (!def) {
            return res.status(400).json({
                error: `Contenedor no soportado: "${containerId}". Disponibles: ${Object.keys(CONTAINERS).join(', ')}`
            });
        }

        // Resolver clubId igual que generatePost: admin puede pasar body.clubId.
        const clubId = req.user.role === 'administrator'
            ? (req.body.clubId || req.user.clubId || null)
            : (req.user.clubId || null);

        if (!clubId) {
            return res.status(400).json({ error: 'No se pudo resolver el club. Falta clubId.' });
        }

        // 1. Resolver el cerebro del sitio.
        const { site } = await resolveBrainsForClub(clubId);
        if (!site) {
            return res.status(404).json({
                error: 'Este club aún no tiene un Cerebro inicializado. Crea/sincroniza el Cerebro antes de generar textos.'
            });
        }

        // 2. RAG: recuperar memorias relevantes del cerebro del sitio.
        let results = await searchMemories({ brainId: site.id, query: def.query, k: 8 });
        let retrieval = 'semantic';

        // Fallback: la búsqueda semántica puede devolver vacío aunque el cerebro
        // SÍ tenga contenido — p. ej. si el embedding del query falla (rate-limit)
        // o si las memorias se indexaron sin embedding (coseno 0 → se filtran).
        // En ese caso usamos las memorias más recientes del cerebro directamente,
        // para no bloquear la generación cuando hay información disponible.
        if (!results.length) {
            const recent = await listRecentMemories({ brainId: site.id, limit: 12 });
            results = recent.map(m => ({ memory: m, score: 0 }));
            retrieval = 'recent';
        }

        // Solo bloqueamos si el cerebro está REALMENTE vacío.
        if (!results.length) {
            return res.status(422).json({
                error: 'El Cerebro no tiene información indexada todavía. Sube documentos o sincroniza el onboarding antes de generar textos.',
                brain: { id: site.id, name: site.name }
            });
        }

        // 3. Armar contexto. Truncamos cada fragmento para no inflar el prompt.
        const context = results
            .map((r, i) => `[Fuente ${i + 1}: ${r.memory.title}]\n${(r.memory.content || '').slice(0, 1200)}`)
            .join('\n\n---\n\n');

        const sources = results.map(r => ({ title: r.memory.title, kind: r.memory.kind, score: Number(r.score?.toFixed?.(3) ?? r.score) }));

        const system =
            `Eres el redactor institucional del Cerebro "${site.name}". Escribes en ESPAÑOL, ` +
            `con tono Rotary: cálido, profesional, orientado al servicio. Usas EXCLUSIVAMENTE la ` +
            `información del CONTEXTO proporcionado — no inventas datos, cifras, nombres ni fechas ` +
            `que no aparezcan ahí. Si el contexto no alcanza para un campo, prefieres lo cualitativo ` +
            `y honesto antes que inventar. Respondes SIEMPRE con JSON válido y nada más.`;

        const userText =
            `CONTEXTO (memorias y documentos del Cerebro del sitio):\n\n${context}\n\n` +
            `========================================\n\n` +
            `TAREA: ${def.instructions}`;

        // 4. Gemini (default), jsonMode. maxTokens holgado por las reglas largas.
        const result = await generateCopy({
            provider: 'gemini',
            system,
            userText,
            jsonMode: true,
            temperature: 0.5,
            maxTokens: 4000
        });

        let parsed;
        try {
            parsed = JSON.parse(result.content);
        } catch (e) {
            console.error('[CONTAINER] JSON parse falló:', e.message, '\nRaw:', result.content?.slice(0, 500));
            return res.status(502).json({ error: 'El modelo devolvió una respuesta no parseable. Reintenta.' });
        }

        const data = def.validate(parsed);
        console.log(`[CONTAINER v4.493] "${containerId}" generado para club ${clubId} via ${result.provider} (${result.model}), ${sources.length} fuentes (retrieval=${retrieval}).`);

        return res.json({
            container: containerId,
            data,
            sources,
            brain: { id: site.id, name: site.name },
            provider: result.provider,
            model: result.model
        });
    } catch (e) {
        console.error('[CONTAINER] Error generando contenedor:', e);
        return res.status(500).json({ error: e.message || 'Error generando el contenedor.' });
    }
};
