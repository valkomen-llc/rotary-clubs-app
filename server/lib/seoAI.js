// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — CAPA DE IA
//
// El modelo ESCRIBE; el código DECIDE si sirve. Es literalmente la regla del
// redactor de plantillas de WhatsApp (`templateComposer.js`) y está acá por el
// mismo motivo: las reglas de un título SEO son aritméticas —60 caracteres, la
// palabra clave delante, sin repetir el nombre del sitio— y un modelo de
// lenguaje las incumple con naturalidad aunque se le pidan. `composeMeta` valida
// con las mismas funciones que la auditoría y REINTENTA devolviéndole los
// errores concretos. Pedirle «revisá el formato» no corrige nada: hay que
// decirle qué regla rompió y con qué valor.
//
// Qué NO hace este archivo:
//
//  • **No descubre problemas.** Eso es `seoAudit.js`, que es determinista. Acá
//    sólo se redacta la recomendación de un hallazgo que ya existe.
//  • **No inventa datos de mercado.** Un volumen de búsqueda que sale de un
//    modelo es una ESTIMACIÓN y viaja marcada como tal (`provenance:
//    'estimated'`). No es lo que devuelve SEMrush, y presentarlo como si lo
//    fuera sería la clase de afirmación que este módulo no hace. La única
//    fuente real de impresiones, clics y posición es Search Console.
//
// Prompts cortos y en positivo, como en el resto del sitio: se describe lo que
// se quiere, no una lista de prohibiciones. El modelo se obsesiona con lo
// prohibido.
// ════════════════════════════════════════════════════════════════════════════

import { generateCopy } from '../services/copywritingService.js';
import { LIMITS, ISSUES, truncateAtWord, slugify, stripHtml, SEARCH_INTENTS } from './seoSpec.js';

const MODEL_NOTE = 'seo-ai';

// ── Contexto del sitio ───────────────────────────────────────────────────────
// Lo que el modelo necesita saber para no escribir genéricamente. Se arma una
// vez y se reutiliza en todas las llamadas de la pasada.
export function siteBrief({ club, config }) {
    const parts = [
        `Organización: ${club?.name || 'organización de servicio'}.`,
        club?.organizationType ? `Tipo: ${club.organizationType}.` : '',
        [club?.city, club?.country].filter(Boolean).length
            ? `Ubicación: ${[club.city, club.country].filter(Boolean).join(', ')}.`
            : '',
        club?.district ? `Distrito: ${club.district}.` : '',
        club?.description ? `Se describe así: ${stripHtml(club.description).slice(0, 400)}` : '',
        config?.keywords?.length ? `Términos que le importan: ${config.keywords.slice(0, 10).join(', ')}.` : '',
    ];
    return parts.filter(Boolean).join(' ');
}

const SEO_SYSTEM = `Eres especialista en SEO y redactor institucional. Escribes en español neutro, con voz humana y sobria, para organizaciones de servicio comunitario.

Escribes títulos y descripciones que una persona querría pulsar: concretos, con el dato que importa delante, en la lengua de quien busca.

Devuelves SIEMPRE un objeto JSON válido, sin texto alrededor y sin bloques de código.`;

// ── Validación de un juego de metadatos ──────────────────────────────────────
// Devuelve la lista de reglas incumplidas, con el valor que las incumple. Es lo
// que se le devuelve al modelo en el reintento: sin el valor concreto, el modelo
// vuelve a fallar igual.
export function validateMeta(meta, { siteName } = {}) {
    const errors = [];
    const title = String(meta?.title || '').trim();
    const description = String(meta?.description || '').trim();

    if (!title) errors.push('Falta "title".');
    else {
        if (title.length < LIMITS.title.min) errors.push(`El "title" tiene ${title.length} caracteres y necesita al menos ${LIMITS.title.min}.`);
        if (title.length > LIMITS.title.max) errors.push(`El "title" tiene ${title.length} caracteres y el máximo es ${LIMITS.title.max}.`);
        // El nombre del sitio lo añade el compositor (`composeTitle`). Si el
        // modelo lo mete, el resultado sale repetido dos veces.
        if (siteName && title.toLowerCase().includes(siteName.toLowerCase())) {
            errors.push(`El "title" no debe incluir el nombre de la organización ("${siteName}"): se añade después automáticamente.`);
        }
    }

    if (!description) errors.push('Falta "description".');
    else {
        if (description.length < LIMITS.description.min) errors.push(`La "description" tiene ${description.length} caracteres y necesita al menos ${LIMITS.description.min}.`);
        if (description.length > LIMITS.description.max) errors.push(`La "description" tiene ${description.length} caracteres y el máximo es ${LIMITS.description.max}.`);
    }

    if (meta?.keywords && !Array.isArray(meta.keywords)) errors.push('"keywords" debe ser una lista.');
    if (Array.isArray(meta?.keywords) && meta.keywords.length > 10) errors.push('"keywords" no debe pasar de 10 términos.');

    return errors;
}

function parseJson(raw) {
    const clean = String(raw || '').trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return JSON.parse(clean); } catch { /* se intenta rescatar el objeto */ }
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
        try { return JSON.parse(clean.slice(first, last + 1)); } catch { /* no hay nada que rescatar */ }
    }
    return null;
}

// ── Metadatos de UNA página ──────────────────────────────────────────────────
/**
 * Redacta title, description, keywords y slug para una página.
 *
 * Reintenta hasta `maxAttempts` devolviéndole al modelo las reglas que rompió.
 * Si tras los reintentos sigue sin cumplir, **no se descarta el trabajo**: se
 * ajusta lo ajustable por código (recortar sin partir palabras) y se devuelve
 * con `repaired: true`. Un título dos caracteres largo es mejor que ninguno, y
 * la auditoría lo volverá a señalar si de verdad importa.
 */
export async function composeMeta({ page, club, config, keywords = [], provider, maxAttempts = 2 }) {
    const siteName = club?.name || '';
    const brief = siteBrief({ club, config });
    const bodySample = stripHtml(page.bodyText || page.description || '').slice(0, 1500);

    const base = [
        brief,
        '',
        `Página: ${page.path}`,
        `Tipo: ${describeKind(page.kind)}`,
        `Título actual: ${page.title || '(sin título)'}`,
        bodySample ? `Contenido:\n${bodySample}` : '',
        keywords.length ? `Términos que conviene usar si encajan de forma natural: ${keywords.slice(0, 6).join(', ')}.` : '',
        '',
        'Devuelve este JSON:',
        '{',
        `  "title": "título de ${LIMITS.title.min} a ${LIMITS.title.max} caracteres, con lo más específico al principio, SIN el nombre de la organización",`,
        `  "description": "descripción de ${LIMITS.description.min} a ${LIMITS.description.max} caracteres que diga qué encuentra quien entra y por qué le sirve",`,
        '  "keywords": ["hasta 6 términos por los que esta página debería encontrarse"],',
        '  "slug": "direccion-corta-en-minusculas-con-guiones",',
        '  "intent": "informational | navigational | transactional | commercial",',
        '  "summary": "una frase que resuma la página para uso interno"',
        '}',
    ].filter(Boolean).join('\n');

    let lastErrors = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const userText = attempt === 1
            ? base
            : `${base}\n\nEl intento anterior no cumplió estas reglas. Corrige EXACTAMENTE esto y devuelve el JSON completo de nuevo:\n- ${lastErrors.join('\n- ')}`;

        let result;
        try {
            result = await generateCopy({
                provider, system: SEO_SYSTEM, userText,
                temperature: 0.5, maxTokens: 700, jsonMode: true,
            });
        } catch (e) {
            // Sin proveedor de modelo el módulo NO se cae: la auditoría ya
            // encontró el hallazgo y el panel lo muestra igual, sólo que sin
            // texto redactado. Degradar, no bloquear.
            return { ok: false, reason: `Sin modelo disponible: ${e.message}`, meta: null };
        }

        const parsed = parseJson(result.content);
        if (!parsed) { lastErrors = ['La respuesta no era un JSON válido.']; continue; }

        const meta = {
            title: String(parsed.title || '').trim(),
            description: String(parsed.description || '').trim(),
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(k => String(k).trim()).filter(Boolean).slice(0, 10) : [],
            slug: slugify(parsed.slug || parsed.title || ''),
            intent: SEARCH_INTENTS[parsed.intent] ? parsed.intent : null,
            summary: String(parsed.summary || '').trim() || null,
        };

        const errors = validateMeta(meta, { siteName });
        if (!errors.length) {
            return { ok: true, meta, provider: result.provider, model: result.model, attempts: attempt };
        }
        lastErrors = errors;

        if (attempt === maxAttempts) {
            // Último recurso: arreglar por código lo que se puede arreglar sin
            // reescribir. Recortar SIN partir palabras y quitar el nombre del
            // sitio si el modelo insistió en meterlo.
            const repaired = { ...meta };
            if (siteName) {
                repaired.title = repaired.title
                    .replace(new RegExp(`\\s*[|\\-–—]\\s*${escapeRe(siteName)}\\s*$`, 'i'), '')
                    .replace(new RegExp(`^\\s*${escapeRe(siteName)}\\s*[|\\-–—:]\\s*`, 'i'), '')
                    .trim();
            }
            if (repaired.title.length > LIMITS.title.max) repaired.title = truncateAtWord(repaired.title, LIMITS.title.max);
            if (repaired.description.length > LIMITS.description.max) repaired.description = truncateAtWord(repaired.description, LIMITS.description.max);

            const stillBroken = validateMeta(repaired, { siteName });
            return {
                ok: stillBroken.length === 0,
                repaired: true,
                meta: repaired,
                provider: result.provider,
                model: result.model,
                attempts: attempt,
                remainingErrors: stillBroken,
            };
        }
    }
    return { ok: false, reason: lastErrors.join(' '), meta: null };
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function describeKind(kind) {
    return {
        home: 'portada del sitio',
        about: 'página institucional (quiénes somos / historia)',
        contact: 'página de contacto',
        blog_index: 'listado de noticias',
        post: 'noticia o entrada de blog',
        projects_index: 'listado de proyectos',
        project: 'ficha de un proyecto social',
        events_index: 'listado de eventos',
        event: 'ficha de un evento',
        shop_index: 'listado de la tienda',
        product: 'ficha de producto',
        generic: 'página informativa',
    }[kind] || 'página informativa';
}

// ── Texto alternativo de una imagen ──────────────────────────────────────────
/**
 * Escribe el ALT de una imagen MIRÁNDOLA. `generateCopy` acepta una imagen, así
 * que se le manda: describir una foto por su nombre de archivo produce textos
 * que suenan bien y no corresponden a lo que se ve, que es peor que no tener
 * ALT — un lector de pantalla leería una descripción falsa.
 *
 * El ALT es accesibilidad antes que SEO. Por eso se pide lo que se VE, no las
 * palabras clave que convendrían.
 */
export async function composeAltText({ imageUrl, context = '', club, provider }) {
    if (!imageUrl) return { ok: false, reason: 'Sin imagen.' };
    try {
        const result = await generateCopy({
            provider,
            system: 'Describes imágenes para personas que usan lector de pantalla. Devuelves SIEMPRE JSON válido.',
            userText: [
                'Describe esta imagen en una frase, diciendo lo que se ve.',
                context ? `Aparece en: ${context}` : '',
                club?.name ? `Es de ${club.name}.` : '',
                `La descripción va entre ${LIMITS.altText.min} y ${LIMITS.altText.max} caracteres.`,
                '',
                'Devuelve: {"alt": "…", "caption": "pie de foto de una línea", "description": "descripción algo más larga para la biblioteca"}',
            ].filter(Boolean).join('\n'),
            imageUrl,
            temperature: 0.4, maxTokens: 300, jsonMode: true,
        });
        const parsed = parseJson(result.content);
        if (!parsed?.alt) return { ok: false, reason: 'El modelo no devolvió texto alternativo.' };
        return {
            ok: true,
            alt: truncateAtWord(String(parsed.alt).trim(), LIMITS.altText.max),
            caption: parsed.caption ? String(parsed.caption).trim() : null,
            description: parsed.description ? String(parsed.description).trim() : null,
            provider: result.provider,
        };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

// ── Palabras clave ───────────────────────────────────────────────────────────
/**
 * Propone términos por los que el sitio debería encontrarse.
 *
 * ⚠️ `volume`, `difficulty` y `competition` salen del modelo y por tanto son
 * ESTIMACIONES: viajan con `provenance: 'estimated'` y el panel las pinta como
 * tales. No son datos de SEMrush ni de Ahrefs, que consultan bases de clics
 * reales; son el criterio de un modelo sobre un mercado que no ha medido.
 *
 * Se piden igual porque ordenan el trabajo —qué atacar primero— mejor que nada,
 * y porque el módulo declara de dónde viene cada número. Presentarlas sin esa
 * etiqueta sería el error.
 */
export async function suggestKeywords({ club, config, pages = [], provider, max = 25 }) {
    const brief = siteBrief({ club, config });
    const sample = pages.slice(0, 25).map(p => `- ${p.path} — ${p.label || ''}`).join('\n');

    try {
        const result = await generateCopy({
            provider, system: SEO_SYSTEM,
            userText: [
                brief,
                '',
                'Páginas publicadas:',
                sample,
                '',
                `Propón hasta ${max} términos de búsqueda por los que esta organización debería aparecer, pensando en cómo escribe una persona de su ciudad que busca ayuda, quiere colaborar o quiere conocer su trabajo.`,
                'Incluye términos cortos, términos largos de tres o más palabras, y variantes con la ciudad.',
                '',
                'Devuelve:',
                '{"keywords": [{"keyword": "…", "kind": "primary|secondary|longtail|lsi", "intent": "informational|navigational|transactional|commercial", "volume": 0, "difficulty": 0, "competition": "baja|media|alta", "targetPath": "/ruta que debería posicionar", "why": "una frase"}]}',
                '',
                '"volume" es tu estimación mensual aproximada para el país de la organización y "difficulty" va de 0 a 100. Si no tienes una base razonable para estimarlos, devuélvelos como null en vez de inventar un número.',
            ].join('\n'),
            temperature: 0.6, maxTokens: 2200, jsonMode: true,
        });

        const parsed = parseJson(result.content);
        const rows = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
        return {
            ok: true,
            provider: result.provider,
            keywords: rows.slice(0, max).map(k => ({
                keyword: String(k.keyword || '').trim().toLowerCase(),
                kind: ['primary', 'secondary', 'longtail', 'lsi'].includes(k.kind) ? k.kind : 'secondary',
                intent: SEARCH_INTENTS[k.intent] ? k.intent : null,
                // `null` se conserva como `null`. Convertirlo a 0 diría "nadie
                // lo busca", que es una afirmación distinta de "no lo sabemos".
                volume: Number.isFinite(k.volume) ? Math.max(0, Math.round(k.volume)) : null,
                difficulty: Number.isFinite(k.difficulty) ? Math.min(100, Math.max(0, Math.round(k.difficulty))) : null,
                competition: ['baja', 'media', 'alta'].includes(k.competition) ? k.competition : null,
                targetPath: k.targetPath ? String(k.targetPath) : null,
                notes: k.why ? String(k.why).slice(0, 300) : null,
                provenance: 'estimated',
            })).filter(k => k.keyword),
        };
    } catch (e) {
        return { ok: false, reason: e.message, keywords: [] };
    }
}

// ── Redacción de recomendaciones ─────────────────────────────────────────────
/**
 * Escribe el texto de las recomendaciones a partir de hallazgos YA
 * encontrados por la auditoría determinista.
 *
 * Se manda un lote por llamada, no uno por hallazgo: con cincuenta hallazgos,
 * cincuenta llamadas serían minutos de espera y coste por algo que es
 * redacción. Y si el modelo no responde, cada hallazgo conserva el texto de su
 * regla (`ISSUES[code].why`), que ya es una explicación correcta — sólo menos
 * concreta.
 */
export async function writeRecommendations({ issues, club, config, provider, max = 40 }) {
    const batch = issues.slice(0, max);
    if (!batch.length) return { ok: true, texts: {} };

    const brief = siteBrief({ club, config });
    const list = batch.map((i, n) => {
        const spec = ISSUES[i.code] || {};
        return `${n + 1}. [${i.code}] ${i.path} — ${spec.label || i.code}. Datos: ${JSON.stringify(i.evidence || {}).slice(0, 300)}`;
    }).join('\n');

    try {
        const result = await generateCopy({
            provider, system: SEO_SYSTEM,
            userText: [
                brief,
                '',
                'Estos son hallazgos ya verificados de una auditoría SEO. Para cada uno escribe una recomendación de una o dos frases dirigida a quien administra el sitio: qué hacer y qué se gana. Habla de lo que ya está medido; no estimes porcentajes de mejora de tráfico.',
                '',
                list,
                '',
                'Devuelve: {"recommendations": [{"n": 1, "text": "…"}]}',
            ].join('\n'),
            temperature: 0.5, maxTokens: 2000, jsonMode: true,
        });

        const parsed = parseJson(result.content);
        const texts = {};
        for (const r of parsed?.recommendations || []) {
            const idx = Number(r.n) - 1;
            if (batch[idx] && r.text) texts[batch[idx].id || `${batch[idx].path}::${batch[idx].code}`] = String(r.text).trim();
        }
        return { ok: true, texts, provider: result.provider };
    } catch (e) {
        return { ok: false, reason: e.message, texts: {} };
    }
}

export default {
    siteBrief, validateMeta, composeMeta, composeAltText, suggestKeywords,
    writeRecommendations, MODEL_NOTE,
};
