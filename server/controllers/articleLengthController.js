// ════════════════════════════════════════════════════════════════════════════
// La API de la extensión de artículos generados por IA — v4.1059
//
// El CRITERIO vive en `articleLength.js` y la I/O de la configuración en
// `articleLengthStore.js`. Acá sólo se resuelve el alcance, se mide el corpus
// REAL y se traduce a la respuesta HTTP.
//
// ⚠️ LOS NÚMEROS DE REFERENCIA SE MIDEN, NO SE ESTIMAN. El promedio y el rango
// que ve el administrador salen de los cuerpos que de verdad están en la base,
// con el MISMO `analyzeArticleBody` que usa el validador: con dos formas de
// extraer el texto, el panel diría un promedio y la validación mediría otra
// cosa sobre el mismo artículo.
// ════════════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { analyzeArticleBody } from '../lib/articleSpec.js';
import { canEditPost, adminScopeFor, visibilitySql } from '../lib/postScope.js';
import { articleOf, regenerateSection } from '../lib/submissionArticleEngine.js';
import { getArticleLength, saveArticleLength } from '../lib/articleLengthStore.js';
import {
    validateArticleLength, summarizeCorpus, describeCurrentConfig, planBulkRegeneration,
    resolveArticleProfile, MIN_TARGET_CHARS, MAX_TARGET_CHARS,
    SEO_RECOMMENDED_CHARS, CHARS_PER_WORD, BULK_MAX,
} from '../lib/articleLength.js';

const fail = (res, e, code = 500) => {
    console.error('[ARTICLE-LENGTH]', e?.message || e);
    res.status(code).json({ error: e?.message || 'No se pudo completar la operación.' });
};

const actorOf = (req) => ({
    actor: req.user?.id || req.user?.userId || null,
    actorName: req.user?.name || req.user?.email || null,
});

// Cuántos artículos se recorren para el promedio. Con un tope, el panel abre
// igual de rápido en un sitio con tres artículos que en uno con mil; y se DICE
// cuántos se midieron, para que el promedio no se lea como «todos».
const SAMPLE_LIMIT = 500;

/** El alcance de lectura: un sitio ve lo suyo; el operador, todo. Sale del
 *  MISMO `adminScopeFor` que acota el listado de Noticias — un segundo criterio
 *  daría un promedio calculado sobre artículos que esa sesión no puede ver. */
const scopeOf = (req) => adminScopeFor(req.user, { requestedSiteId: req.query?.clubId || req.query?.siteId || null });

/**
 * Mide los artículos generados por IA que alcanza esta sesión.
 *
 * ⚠️ SE MIDEN LOS QUE SE SABE QUE SON DE IA, no «todos los artículos». Un
 * artículo escrito a mano en Noticias no dice de dónde salió, así que meterlo en
 * el promedio de «artículos generados por IA» sería una afirmación falsa. Los
 * que tienen fila en `SubmissionArticle` sí lo son sin ambigüedad.
 */
async function measureCorpus(scope) {
    if (scope.mode === 'none') return { samples: [], truncated: false };
    // ⚠️ `Post` va SIN alias a propósito: la cláusula de visibilidad nombra sus
    // columnas sin calificar, y reescribirla con un alias sería una segunda
    // versión de la misma regla — la que se queda atrás el día que cambie.
    const where = ['content IS NOT NULL', "content <> ''",
        'id IN (SELECT "postId" FROM "SubmissionArticle" WHERE "postId" IS NOT NULL)'];
    const params = [];
    if (scope.mode === 'site') {
        params.push(scope.siteId);
        where.push(visibilitySql(params.length));
    }
    params.push(SAMPLE_LIMIT + 1);
    const { rows } = await db.query(
        `SELECT id, content FROM "Post"
          WHERE ${where.join(' AND ')}
          ORDER BY "createdAt" DESC
          LIMIT $${params.length}`,
        params
    );
    const truncated = rows.length > SAMPLE_LIMIT;
    const samples = rows.slice(0, SAMPLE_LIMIT).map(r => {
        const b = analyzeArticleBody(r.content);
        return { chars: b.charCount, words: b.wordCount };
    });
    return { samples, truncated };
}

// ── GET /api/admin/article-length ────────────────────────────────────────────
export const getArticleLengthConfig = async (req, res) => {
    try {
        const config = await getArticleLength();
        let stats = summarizeCorpus([]);
        let truncated = false;
        let medido = true;
        try {
            const m = await measureCorpus(scopeOf(req));
            stats = summarizeCorpus(m.samples);
            truncated = m.truncated;
        } catch (e) {
            // ⚠️ NO PODER MEDIR NO ES «EL PROMEDIO ES CERO». Se dice, y el panel
            // pinta un hueco en vez de una cifra inventada.
            medido = false;
            console.warn('[ARTICLE-LENGTH] No se pudo medir el corpus:', e?.message);
        }
        const perfil = resolveArticleProfile({ config });
        res.json({
            config,
            stats: medido ? stats : null,
            measured: medido,
            truncated,
            sampleLimit: SAMPLE_LIMIT,
            reference: describeCurrentConfig(config, medido ? stats : null),
            limits: {
                min: MIN_TARGET_CHARS,
                max: MAX_TARGET_CHARS,
                seoRecommended: SEO_RECOMMENDED_CHARS,
                charsPerWord: CHARS_PER_WORD,
            },
            profile: {
                targetChars: perfil.targetChars || null,
                minChars: perfil.minChars || null,
                maxChars: perfil.maxChars || null,
                targetWords: perfil.targetWords,
                minSections: perfil.minSections,
                maxSections: perfil.maxSections,
            },
        });
    } catch (e) { fail(res, e); }
};

// ── PUT /api/admin/article-length ────────────────────────────────────────────
export const putArticleLengthConfig = async (req, res) => {
    try {
        const crudo = req.body?.targetChars;
        const v = validateArticleLength({ targetChars: crudo === '' || crudo === null ? null : crudo });
        // El administrador escribe y el CÓDIGO decide. Se devuelven TODOS los
        // errores: «configuración inválida» a secas obliga a probar a ciegas.
        if (!v.ok) return res.status(400).json({ error: v.errors[0], errors: v.errors, warnings: v.warnings });
        const config = await saveArticleLength({ targetChars: v.value, ...actorOf(req) });
        res.json({
            ok: true,
            config,
            warnings: v.warnings,
            // Cambiar la longitud NO reescribe ningún artículo ya generado, y se
            // dice: es la pregunta que se hace quien va a mover el número.
            note: v.value
                ? `Los artículos que se generen a partir de ahora apuntarán a ${v.value.toLocaleString('es-CO')} caracteres. Los ya publicados no cambian: para ajustarlos, usá «Regenerar» en Gestión de Noticias.`
                : 'Se quitó la longitud objetivo. Los artículos vuelven a escribirse con los perfiles de redacción del sistema.',
        });
    } catch (e) { fail(res, e); }
};

// ── El lote ──────────────────────────────────────────────────────────────────

/** Los datos que el criterio necesita de cada publicación seleccionada. Se leen
 *  de la BASE, nunca del cuerpo de la petición: si el navegador dijera cuál está
 *  publicado o de qué solicitud viene, acotar no serviría de nada. */
async function loadSelection(ids, req) {
    const scope = scopeOf(req);
    const limpios = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
    const deBase = limpios.filter(id => !id.startsWith('static-'));
    const items = [];

    if (deBase.length) {
        const { rows } = await db.query(
            `SELECT p.id, p.title, p.content, p.published, p."clubId", p."targetClubIds",
                    sa.id AS "articleId", sa."submissionId", sa."campaignId"
               FROM "Post" p
               LEFT JOIN "SubmissionArticle" sa ON sa."postId" = p.id
              WHERE p.id = ANY($1::text[])`,
            [deBase]
        );
        const vistos = new Set();
        for (const p of rows) {
            vistos.add(p.id);
            items.push({
                id: p.id,
                title: p.title,
                submissionId: p.submissionId || null,
                campaignId: p.campaignId || null,
                chars: analyzeArticleBody(p.content).charCount,
                published: Boolean(p.published),
                foreign: !canEditPost(req.user, p, scope.siteId),
                isStatic: false,
            });
        }
        // Un id que ya no existe se NOMBRA con su motivo, no se saltea: «se
        // regeneraron 5 de 6» sin decir cuál faltó obliga a adivinar.
        for (const id of deBase) {
            if (!vistos.has(id)) items.push({ id, title: null, isStatic: false, foreign: true, chars: 0, submissionId: null });
        }
    }
    for (const id of limpios.filter(i => i.startsWith('static-'))) {
        items.push({ id, title: null, isStatic: true, chars: 0, submissionId: null });
    }
    return items;
}

// ── POST /api/admin/posts/regenerate-plan ────────────────────────────────────
//
// De sólo lectura: dice QUÉ va a pasar antes de tocar nada. Es lo que permite
// confirmar sobre el hecho —cuántos, con qué objetivo, cuáles quedan fuera y por
// qué— en vez de preguntar «¿estás seguro?».
export const planPostRegeneration = async (req, res) => {
    try {
        const items = await loadSelection(req.body?.ids, req);
        const config = await getArticleLength();
        res.json({ ...planBulkRegeneration(items, { config }), bulkMax: BULK_MAX });
    } catch (e) { fail(res, e); }
};

// ── POST /api/admin/posts/bulk-regenerate ────────────────────────────────────
//
// ⚠️ NO ES ATÓMICO Y SE DICE. Cada artículo se regenera por su cuenta: si el
// tercero falla, los dos primeros ya quedaron reescritos y el informe los nombra
// uno por uno. Envolverlo en una transacción sería peor —un fallo tiraría abajo
// regeneraciones que sí ocurrieron— y un error individual no puede cancelar el
// lote (lo pide el encargo con esas palabras).
//
// ⚠️ SE PROCESA POR TANDAS Y SE DEVUELVE LO QUE FALTA. Cada regeneración es una
// llamada a un modelo de 20-60 s: veinte no entran en una invocación (el tope de
// `vercel.json`). Se atiende lo que cabe y el navegador vuelve a pedir hasta
// terminar. Cortar en silencio se leería como «ya está todo regenerado».
const TIME_BUDGET_MS = Number(process.env.ARTICLE_REGEN_BUDGET_MS || 200_000);

export const bulkRegeneratePosts = async (req, res) => {
    try {
        const items = await loadSelection(req.body?.ids, req);
        const config = await getArticleLength();
        const plan = planBulkRegeneration(items, { config });

        if (req.body?.confirm !== true) {
            return res.status(428).json({ error: 'Falta la confirmación.', plan });
        }
        if (!plan.eligible.length) {
            return res.status(400).json({ error: 'Ninguno de los artículos seleccionados se puede regenerar.', plan });
        }
        if (plan.overLimit) {
            return res.status(400).json({ error: `Son ${plan.eligible.length} artículos y el máximo por operación es ${BULK_MAX}. Seleccioná menos.`, plan });
        }

        const arranque = Date.now();
        const resultados = [];
        const pendientes = [];

        for (const it of plan.eligible) {
            if (Date.now() - arranque > TIME_BUDGET_MS) { pendientes.push(it.id); continue; }
            try {
                const row = await articleOf(it.submissionId);
                if (!row?.postId) {
                    resultados.push({ id: it.id, title: it.title, ok: false, reason: 'Ya no hay un borrador que regenerar.' });
                    continue;
                }
                const r = await regenerateSection({ row, section: 'extension', apply: true, ...actorOf(req) });
                if (!r.ok) {
                    resultados.push({
                        id: it.id, title: it.title, ok: false,
                        reason: r.reason === 'sin_objetivo'
                            ? 'No hay una longitud objetivo configurada.'
                            : r.reason === 'sin_post' ? 'Ya no hay un borrador que regenerar.' : 'No se pudo regenerar.',
                    });
                    continue;
                }
                resultados.push({
                    id: it.id, title: it.title, ok: true,
                    charsBefore: r.proposal?.charsBefore ?? it.chars,
                    charsAfter: r.proposal?.charsAfter ?? null,
                    targetChars: r.proposal?.targetChars ?? plan.targetChars,
                    warnings: r.warnings || [],
                });
            } catch (e) {
                // Un error individual NO cancela el lote: se nombra y se sigue.
                resultados.push({ id: it.id, title: it.title, ok: false, reason: e?.message || 'No se pudo regenerar.' });
            }
        }

        const ok = resultados.filter(r => r.ok).length;
        const fallidos = resultados.length - ok;
        res.json({
            plan,
            results: resultados,
            pending: pendientes,
            summary: `${ok} regenerado(s) correctamente${fallidos ? ` · ${fallidos} con error` : ''}${pendientes.length ? ` · ${pendientes.length} pendiente(s)` : ''}`,
        });
    } catch (e) { fail(res, e, 502); }
};

export default {
    getArticleLengthConfig, putArticleLengthConfig,
    planPostRegeneration, bulkRegeneratePosts,
};
