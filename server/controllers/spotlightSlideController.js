// ════════════════════════════════════════════════════════════════════
// Slider Global / Llamados a la Acción — la API
//
// El CRITERIO —qué slides le tocan a un sitio, en qué orden y a dónde lleva
// cada botón— vive en `server/lib/spotlightSpec.js` y es puro. Acá está el
// CAMINO A LOS DATOS y nada más: leer, escribir, cachear e invalidar.
//
// Dos audiencias:
//   · el OPERADOR de la plataforma (CRUD). Un slide alcanza a muchos sitios,
//     así que no es una pantalla de club — mismo criterio que /admin/districts
//     y que las Campañas de Contribución.
//   · el PÚBLICO (`/active?clubId=`), de sólo lectura. Corre en la portada de
//     todos los sitios, así que degrada y NUNCA responde 500.
// ════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { ensureSpotlightSchema } from '../lib/ensureSpotlightSchema.js';
import {
    normalizeSlide, validateSlide, slidesForSite, slideState, targetsSite,
    MAX_SLIDES_PER_SITE,
} from '../lib/spotlightSpec.js';
// El sitio y las campañas servibles se LEEN del módulo de contribución, no se
// vuelven a consultar acá: con dos consultas distintas, un slide podría
// juzgar «activa» una campaña que la landing no sirve, y el botón llevaría a
// una página que ese sitio no muestra.
import { siteOf, servableCampaigns } from './contributionCampaignController.js';
import { isServable } from '../lib/contributionSpec.js';

// ─── Caché de la lectura pública ────────────────────────────────────────
//
// Esto corre en CADA visita de una portada. Sin caché, cada visitante paga la
// consulta de todos los slides encendidos más la de las campañas servibles.
// El TTL es el mismo de la campaña activa (60 s) y TODA escritura la vacía:
// quien acaba de publicar recarga y quiere verlo.
const CACHE_TTL_MS = 60 * 1000;
const activeCache = new Map();
const invalidateCache = () => activeCache.clear();

const rowToSlide = row => normalizeSlide({
    ...(row.content || {}),
    id: row.id,
    name: row.name,
    slideType: row.slideType,
    active: row.active === true,
    startAt: row.startAt,
    endAt: row.endAt,
    priority: row.priority,
    autoplayMs: row.autoplayMs,
    targeting: row.targeting,
    clubId: row.clubId,
    publishedAt: row.publishedAt,
});

/** Lo que se guarda en la columna `content`: lo que NO es columna propia.
 *  Un documento se lee y se escribe entero, como el grafo de un recorrido. */
const contentOf = slide => ({
    title: slide.title,
    text: slide.text,
    image: slide.image,
    imageAlt: slide.imageAlt,
    imageMobile: slide.imageMobile,
    imageMobileAlt: slide.imageMobileAlt,
    buttonText: slide.buttonText,
    buttonUrl: slide.buttonUrl,
    buttonIcon: slide.buttonIcon,
    linkKind: slide.linkKind,
    campaignId: slide.campaignId,
    openMode: slide.openMode,
});

const withMeta = (slide, row, now) => ({
    ...slide,
    state: slideState(slide, now),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
});

// ════════════════════════════════════════════════════════════════════
// PÚBLICO
// ════════════════════════════════════════════════════════════════════

/**
 * GET /api/spotlight-slides/active?clubId=…
 *
 * Los slides globales que le tocan a ESTE sitio, ya ordenados y con el enlace
 * de cada botón resuelto. El «Bloque Destacado» local del propio sitio NO
 * viaja acá: ya está cargado en el navegador (`club.spotlightContent` más la
 * imagen de Distribución de Imágenes) y pedirlo otra vez sería una consulta
 * más por visita para algo que ya se tiene.
 *
 * DEGRADA SIEMPRE. Sin slides, sin tabla todavía, o con la base caída, se
 * devuelve una lista vacía y la portada se ve exactamente como antes de este
 * módulo. Una portada no puede quedarse sin pintar porque falle un carrusel.
 */
export const getActiveSlides = async (req, res) => {
    try {
        const clubId = String(req.query.clubId || '').trim();
        if (!clubId) return res.json({ slides: [] });

        const cached = activeCache.get(clubId);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return res.json(cached.payload);

        await ensureSpotlightSchema();
        const site = await siteOf(clubId);
        if (!site) {
            const payload = { slides: [] };
            activeCache.set(clubId, { at: Date.now(), payload });
            return res.json(payload);
        }

        const now = new Date();
        // Sólo lo ENCENDIDO: un slide apagado no puede volverse vigente por
        // ninguna fecha, así que traerlo sería recorrer filas para nada.
        const { rows } = await db.query(
            `SELECT * FROM "SpotlightSlide" WHERE active = true AND "clubId" IS NULL`
        );
        const slides = rows.map(rowToSlide);

        // El índice de campañas se arma UNA vez y sólo si algún slide lo
        // necesita: un vínculo con campaña es la excepción, no la norma, y
        // consultarlas siempre pagaría una lectura por visita para nada.
        let campaigns = {};
        if (slides.some(s => s.linkKind === 'campaign')) {
            for (const c of await servableCampaigns()) {
                campaigns[c.id] = { id: c.id, servable: isServable(c, now), targeting: c.targeting };
            }
        }

        const { slides: shown, dropped } = slidesForSite(slides, site, now, campaigns);
        // Lo descartado se registra, no se calla: es lo único que contesta
        // «¿por qué mi campaña no sale en este sitio?» dos semanas después.
        if (dropped.length) {
            console.log(`[SPOTLIGHT] ${clubId}: ${shown.length} servidos, ${dropped.length} descartados —`,
                dropped.map(d => d.reason).join(' | '));
        }

        const payload = { slides: shown };
        activeCache.set(clubId, { at: Date.now(), payload });
        res.json(payload);
    } catch (e) {
        console.error('[SPOTLIGHT] getActiveSlides (degrada a lista vacía):', e?.message);
        res.json({ slides: [] });
    }
};

// ════════════════════════════════════════════════════════════════════
// OPERADOR
// ════════════════════════════════════════════════════════════════════

/** GET /api/spotlight-slides */
export const listSlides = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const { rows } = await db.query(
            `SELECT * FROM "SpotlightSlide"
              ORDER BY priority DESC, "publishedAt" DESC NULLS LAST, "createdAt" DESC`
        );
        const now = new Date();
        res.json({
            slides: rows.map(r => withMeta(rowToSlide(r), r, now)),
            maxPerSite: MAX_SLIDES_PER_SITE,
        });
    } catch (e) {
        console.error('[SPOTLIGHT] listSlides:', e);
        res.status(500).json({ error: e.message });
    }
};

/** GET /api/spotlight-slides/:id */
export const getSlide = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const { rows } = await db.query(`SELECT * FROM "SpotlightSlide" WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Ese slide no existe.' });
        res.json({ slide: withMeta(rowToSlide(rows[0]), rows[0], new Date()) });
    } catch (e) {
        console.error('[SPOTLIGHT] getSlide:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * POST /api/spotlight-slides
 *
 * Nace INACTIVO, pase lo que pase en el cuerpo. Es lo que hace seguro que el
 * alcance por defecto sea «todos los sitios»: crear un slide no publica nada
 * en ninguna portada, y encenderlo es un gesto aparte y visible.
 */
export const createSlide = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const check = validateSlide({ ...req.body, active: false });
        if (!check.ok) return res.status(422).json({ error: 'La configuración no es válida.', errors: check.errors });

        const s = check.slide;
        const { rows } = await db.query(
            `INSERT INTO "SpotlightSlide"
                (name, "slideType", content, active, "startAt", "endAt", priority, "autoplayMs", targeting, "clubId", "createdBy", "updatedBy")
             VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10,$10)
             RETURNING *`,
            [s.name, s.slideType, JSON.stringify(contentOf(s)), s.startAt, s.endAt,
             s.priority, s.autoplayMs, JSON.stringify(s.targeting), s.clubId, req.user?.id || null]
        );
        invalidateCache();
        res.status(201).json({ slide: withMeta(rowToSlide(rows[0]), rows[0], new Date()), warnings: check.warnings });
    } catch (e) {
        console.error('[SPOTLIGHT] createSlide:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * PUT /api/spotlight-slides/:id
 *
 * Encender un slide EXIGE que sea válido; apagarlo no. Es la asimetría
 * correcta: publicar algo roto en decenas de portadas es caro, y retirarlo
 * nunca puede quedar bloqueado por una validación.
 */
export const updateSlide = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const { rows: prev } = await db.query(`SELECT * FROM "SpotlightSlide" WHERE id = $1`, [req.params.id]);
        if (!prev[0]) return res.status(404).json({ error: 'Ese slide no existe.' });

        const check = validateSlide(req.body);
        const s = check.slide;
        if (s.active && !check.ok) {
            return res.status(422).json({ error: 'No se puede publicar así.', errors: check.errors });
        }

        // `publishedAt` se sella la PRIMERA vez que se enciende y no se
        // vuelve a mover: es la mitad del desempate del orden, así que
        // reescribirlo en cada guardado adelantaría un slide viejo por
        // haberle corregido una coma.
        const publishedAt = prev[0].publishedAt || (s.active ? new Date() : null);

        const { rows } = await db.query(
            `UPDATE "SpotlightSlide"
                SET name = $2, "slideType" = $3, content = $4, active = $5,
                    "startAt" = $6, "endAt" = $7, priority = $8, "autoplayMs" = $9,
                    targeting = $10, "publishedAt" = $11, "updatedBy" = $12, "updatedAt" = NOW()
              WHERE id = $1
              RETURNING *`,
            [req.params.id, s.name, s.slideType, JSON.stringify(contentOf(s)), s.active,
             s.startAt, s.endAt, s.priority, s.autoplayMs, JSON.stringify(s.targeting),
             publishedAt, req.user?.id || null]
        );
        invalidateCache();
        res.json({ slide: withMeta(rowToSlide(rows[0]), rows[0], new Date()), warnings: check.warnings });
    } catch (e) {
        console.error('[SPOTLIGHT] updateSlide:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * POST /api/spotlight-slides/:id/duplicate
 *
 * El duplicado nace APAGADO y con «(copia)» en el nombre: duplicar para
 * ajustar una campaña no puede publicar dos piezas casi iguales en todas las
 * portadas mientras se edita la segunda.
 */
export const duplicateSlide = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const { rows: prev } = await db.query(`SELECT * FROM "SpotlightSlide" WHERE id = $1`, [req.params.id]);
        if (!prev[0]) return res.status(404).json({ error: 'Ese slide no existe.' });

        const p = prev[0];
        const { rows } = await db.query(
            `INSERT INTO "SpotlightSlide"
                (name, "slideType", content, active, "startAt", "endAt", priority, "autoplayMs", targeting, "clubId", "createdBy", "updatedBy")
             VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10,$10)
             RETURNING *`,
            [`${p.name} (copia)`, p.slideType, JSON.stringify(p.content || {}), p.startAt, p.endAt,
             p.priority, p.autoplayMs, JSON.stringify(p.targeting || {}), p.clubId, req.user?.id || null]
        );
        invalidateCache();
        res.status(201).json({ slide: withMeta(rowToSlide(rows[0]), rows[0], new Date()) });
    } catch (e) {
        console.error('[SPOTLIGHT] duplicateSlide:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * PUT /api/spotlight-slides/order
 *
 * El drag & drop del panel manda la lista de ids en el orden que quedó y acá
 * se traduce a prioridades descendentes. Se escribe en UNA sentencia con
 * `unnest`, no con un UPDATE por fila: con veinte slides serían veinte viajes
 * a la base para reordenar una lista.
 *
 * ⚠️ Va declarada ANTES de `/:id` en el router — Express casa por orden y una
 * literal debajo de su paramétrica es inalcanzable (v4.859). Lo comprueba
 * `npm run check:routes`.
 */
export const reorderSlides = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
        if (!ids.length) return res.status(400).json({ error: 'No llegó ningún orden.' });

        // El primero de la lista se lleva la prioridad más alta. Se cuenta
        // hacia abajo desde la cantidad para que no haya negativos y para
        // que insertar uno nuevo con prioridad 0 lo deje al final.
        const priorities = ids.map((_, i) => ids.length - i);
        await db.query(
            `UPDATE "SpotlightSlide" AS s
                SET priority = v.priority, "updatedAt" = NOW()
               FROM (SELECT unnest($1::text[]) AS id, unnest($2::int[]) AS priority) AS v
              WHERE s.id = v.id`,
            [ids, priorities]
        );
        invalidateCache();
        res.json({ ok: true, count: ids.length });
    } catch (e) {
        console.error('[SPOTLIGHT] reorderSlides:', e);
        res.status(500).json({ error: e.message });
    }
};

/** DELETE /api/spotlight-slides/:id */
export const deleteSlide = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const { rowCount } = await db.query(`DELETE FROM "SpotlightSlide" WHERE id = $1`, [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Ese slide no existe.' });
        invalidateCache();
        res.json({ ok: true });
    } catch (e) {
        console.error('[SPOTLIGHT] deleteSlide:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * GET /api/spotlight-slides/:id/reach
 *
 * A cuántos sitios alcanza este slide, y a cuáles. Es lo que convierte
 * «Todos los sitios» de una promesa en un número: sin esto, publicar una
 * campaña global es un acto a ciegas, y el alcance es justamente lo que hay
 * que poder comprobar antes de encenderla.
 *
 * Se resuelve con el MISMO `targetsSite` que sirve la página. Con un segundo
 * criterio, el panel afirmaría un alcance distinto del real.
 */
export const slideReach = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const { rows } = await db.query(`SELECT * FROM "SpotlightSlide" WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Ese slide no existe.' });

        const slide = rowToSlide(rows[0]);
        const { rows: sites } = await db.query(
            `SELECT id, name, district, "districtId" FROM "Club" ORDER BY name ASC`
        );
        const matched = sites.filter(s => targetsSite(slide.targeting, s));
        res.json({
            total: sites.length,
            reached: matched.length,
            // Una lista de trescientos nombres no la lee nadie: se manda una
            // muestra y el número, que es lo que contesta la pregunta.
            sample: matched.slice(0, 25).map(s => ({ id: s.id, name: s.name, district: s.district })),
        });
    } catch (e) {
        console.error('[SPOTLIGHT] slideReach:', e);
        res.status(500).json({ error: e.message });
    }
};

export default {
    getActiveSlides, listSlides, getSlide, createSlide, updateSlide,
    duplicateSlide, reorderSlides, deleteSlide, slideReach,
};
