// ════════════════════════════════════════════════════════════════════════════
// Generar un artículo desde un contexto — la ORQUESTACIÓN — v4.1000
//
// Es el bucle que vivía dentro de `POST /api/ai/generate-article` (v4.891),
// sacado a una función para que lo compartan la ruta del Asistente de
// Redacción y el workflow de las Solicitudes de contenido. Un segundo bucle
// escrito a mano se separaría del primero en silencio: el día que se afine
// una regla —el presupuesto de tokens, el reintento con la regla concreta—
// una de las dos vías se quedaría atrás.
//
// El CRITERIO sigue en `articleSpec.js`; acá sólo se llama al proveedor, se
// reintenta y se repara.
// ════════════════════════════════════════════════════════════════════════════
import { routeToModel, getDefaultModel } from './ai-router.js';
import {
    buildArticleSystemPrompt, buildArticleUserPrompt, parseArticle, normalizeArticle,
    validateArticle, repairArticle,
} from './articleSpec.js';

export const MAX_ARTICLE_ATTEMPTS = 2;
// Un artículo de ~900 palabras en HTML más los campos de SEO no cabe en el
// presupuesto por defecto: la respuesta se corta a mitad del JSON.
export const ARTICLE_MAX_TOKENS = 8192;

/**
 * Devuelve `{ ok, article, raw, meta }` o `{ ok:false, error, meta }`.
 *
 * - `extra`: reglas que se SUMAN al prompt del sistema (el workflow de
 *   solicitudes agrega ahí sus campos y su regla de veracidad).
 * - `check(article, data)`: una comprobación adicional del CÓDIGO que devuelve
 *   una lista de reglas rotas (vacía = pasa). Se reintenta con ellas igual que
 *   con las de `validateArticle`.
 * - `raw` viaja de vuelta para que quien llama lea los campos que
 *   `normalizeArticle` no conoce.
 */
export async function generateArticleFromContext({ context, siteName = '', modelSlug = null, extra = '', check = null, attempts = MAX_ARTICLE_ATTEMPTS } = {}) {
    if (!context || String(context).trim().length < 5) return { ok: false, error: 'El contexto es demasiado corto.', meta: {} };

    const slug = modelSlug || (await getDefaultModel()) || 'gemini-2.5-flash';
    const notasDelRouter = [];
    let brokenRules = [];
    let best = null, bestErrors = null, bestRaw = null;
    let lastFailure = '';
    let truncatedOnce = false;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        let raw;
        try {
            raw = await routeToModel(
                slug,
                buildArticleSystemPrompt({ siteName, extra }),
                buildArticleUserPrompt({ context, brokenRules }),
                [],
                { maxTokens: ARTICLE_MAX_TOKENS, explicit: Boolean(modelSlug), notes: notasDelRouter }
            );
        } catch (e) {
            // El motivo del proveedor viaja TEXTUAL y con el modelo que se
            // intentó (v4.891): quien llama lo traduce a su estado HTTP.
            return { ok: false, error: e?.message || 'No se pudo contactar con el proveedor de IA.', meta: { model: slug, attempts: attempt, warnings: notasDelRouter } };
        }
        const { data, truncated } = parseArticle(raw);
        if (truncated) truncatedOnce = true;
        if (!data) {
            lastFailure = 'El modelo no devolvió un JSON que se pueda leer.';
            brokenRules = ['Responde ÚNICAMENTE con el objeto JSON, sin texto alrededor y sin markdown.'];
            continue;
        }
        const article = normalizeArticle(data);
        const { errors, warnings, body } = validateArticle(article, { siteName });
        const extraErrors = typeof check === 'function' ? (await check(article, data)) || [] : [];
        const todos = [...errors, ...extraErrors];

        if (!todos.length) {
            return {
                ok: true, article, raw: data,
                meta: { model: slug, attempts: attempt, warnings: [...notasDelRouter, ...warnings], wordCount: body.wordCount, readingMinutes: body.readingMinutes },
            };
        }
        if (!best || todos.length < bestErrors.length) { best = article; bestErrors = todos; bestRaw = data; }
        brokenRules = todos;
        lastFailure = todos.join(' ');
    }

    // Agotados los intentos, el trabajo NO se tira: se ajusta lo ajustable por
    // código y se entrega CON SUS AVISOS.
    if (best) {
        const { article, repaired } = repairArticle(best);
        const { errors, warnings, body } = validateArticle(article, { siteName });
        const extraErrors = typeof check === 'function' ? (await check(article, bestRaw)) || [] : [];
        const avisoReparado = repaired.length ? [`Se ajustó automáticamente: ${repaired.join(', ')}. Revísalo antes de publicar.`] : [];
        return {
            ok: true, article, raw: bestRaw, repaired: true,
            meta: {
                model: slug, attempts, repaired,
                warnings: [...notasDelRouter, ...avisoReparado, ...errors, ...extraErrors, ...warnings],
                wordCount: body.wordCount, readingMinutes: body.readingMinutes,
            },
        };
    }

    return {
        ok: false,
        error: truncatedOnce
            ? 'El modelo se quedó sin espacio antes de terminar el artículo. Prueba con un contexto más breve o cambia de modelo en Integraciones → Modelos IA.'
            : `No se pudo generar el artículo. ${lastFailure}`.trim(),
        meta: { model: slug, attempts, warnings: notasDelRouter },
    };
}

export default { generateArticleFromContext, MAX_ARTICLE_ATTEMPTS, ARTICLE_MAX_TOKENS };
