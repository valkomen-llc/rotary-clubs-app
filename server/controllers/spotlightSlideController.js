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
    MAX_SLIDES_PER_SITE, slideFromLocalBlock, hasLocalBlock,
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
/**
 * La inserción, en UN solo sitio. La usan el alta normal y la importación
 * desde el Bloque Destacado de un sitio: con un INSERT por camino, el día que
 * se agregue una columna una de las dos vías se queda sin ella y el fallo es
 * mudo.
 *
 * `active` se pasa aparte y por omisión es `false`: un slide nace apagado, y
 * la única vía que lo enciende de entrada es la importación que REEMPLAZA el
 * bloque de un sitio — ahí encenderlo es lo que evita dejar esa portada sin
 * nada (ver `importLocalBlock`).
 */
const insertSlide = async (s, userId, active = false) => {
    const { rows } = await db.query(
        `INSERT INTO "SpotlightSlide"
            (name, "slideType", content, active, "startAt", "endAt", priority, "autoplayMs", targeting, "clubId", "createdBy", "updatedBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         RETURNING *`,
        [s.name, s.slideType, JSON.stringify(contentOf(s)), !!active, s.startAt, s.endAt,
         s.priority, s.autoplayMs, JSON.stringify(s.targeting), s.clubId, userId || null]
    );
    invalidateCache();
    return rows[0];
};

export const createSlide = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const check = validateSlide({ ...req.body, active: false });
        if (!check.ok) return res.status(422).json({ error: 'La configuración no es válida.', errors: check.errors });

        const row = await insertSlide(check.slide, req.user?.id);
        res.status(201).json({ slide: withMeta(rowToSlide(row), row, new Date()), warnings: check.warnings });
    } catch (e) {
        console.error('[SPOTLIGHT] createSlide:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Traer el Bloque Destacado de un sitio ──────────────────────────────
//
// El bloque propio de un sitio vive repartido en DOS sitios, por historia: el
// texto en `Setting` (`spotlight_section_content`, que escribe Configuración /
// Identidad) y la imagen dentro del documento de imágenes del sitio
// (`ContentSection` page=home section=images, clave `spotlight`). Las dos las
// lee la portada; acá se leen juntas para poder convertirlas en un slide.

/** El bloque local de uno o de todos los sitios, indexado por clubId. */
const localBlocksOf = async (clubId = null) => {
    const cond = clubId ? `AND c.id = $1` : '';
    const args = clubId ? [clubId] : [];
    const { rows } = await db.query(
        `SELECT c.id, c.name, c.domain, c.subdomain, c.type,
                s.value  AS texto,
                cs.content AS imagenes
           FROM "Club" c
           LEFT JOIN "Setting" s
                  ON s."clubId" = c.id AND s.key = 'spotlight_section_content'
           LEFT JOIN "ContentSection" cs
                  ON cs."clubId" = c.id AND cs.page = 'home' AND cs.section = 'images'
          WHERE c.id IS NOT NULL ${cond}`,
        args
    );

    // El JSON se interpreta ACÁ y no en el SQL: `Setting.value` es TEXTO libre
    // y una sola fila mal formada haría estallar un casteo a jsonb para todas
    // — el mismo patrón que usa el reenvío de la Bóveda.
    const leer = v => {
        if (!v) return {};
        if (typeof v === 'object') return v;
        try { return JSON.parse(v) || {}; } catch { return {}; }
    };

    const salida = new Map();
    for (const r of rows) {
        const local = leer(r.texto);
        const image = leer(r.imagenes).spotlight || {};
        salida.set(r.id, {
            clubId: r.id,
            clubName: r.name,
            domain: r.domain || (r.subdomain ? `${r.subdomain}.clubplatform.org` : ''),
            type: r.type || '',
            local,
            image: { url: String(image.url ?? '').trim(), alt: String(image.alt ?? '') },
        });
    }
    return salida;
};

/**
 * GET /api/spotlight-slides/importable
 *
 * Los sitios que HOY muestran un Bloque Destacado propio. Se filtra con el
 * mismo criterio con el que la portada decide si lo dibuja: ofrecer un sitio
 * cuyo bloque no se ve sería ofrecer un slide vacío.
 */
export const listImportable = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const bloques = [...(await localBlocksOf()).values()].filter(hasLocalBlock);
        // Los que ya se importaron se marcan, no se esconden: importarlo dos
        // veces es legítimo (otro alcance, otra vigencia) y esconderlo dejaría
        // sin explicación por qué ese sitio no aparece.
        const { rows: yaImportados } = await db.query(
            `SELECT DISTINCT targeting->>'clubIds' AS clubs FROM "SpotlightSlide"`
        );
        const vistos = new Set();
        yaImportados.forEach(r => {
            try { (JSON.parse(r.clubs || '[]') || []).forEach(id => vistos.add(String(id))); } catch { /* nada */ }
        });

        res.json({
            sites: bloques
                .map(b => ({
                    clubId: b.clubId, clubName: b.clubName, domain: b.domain, type: b.type,
                    title: String(b.local.title ?? '').trim(),
                    text: String(b.local.text ?? '').trim(),
                    buttonText: String(b.local.buttonText ?? '').trim(),
                    buttonUrl: String(b.local.buttonUrl ?? '').trim(),
                    image: b.image.url,
                    imageAlt: b.image.alt,
                    yaTieneSlide: vistos.has(String(b.clubId)),
                }))
                .sort((a, b) => a.clubName.localeCompare(b.clubName)),
        });
    } catch (e) {
        console.error('[SPOTLIGHT] listImportable:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * POST /api/spotlight-slides/import   { clubId, replace }
 *
 * Convierte el Bloque Destacado de un sitio en un slide administrable.
 *
 * ⚠️ `replace` HACE LAS DOS COSAS O NINGUNA, y ése es todo su sentido. Sin él,
 * la secuencia natural —crear el slide, encenderlo, vaciar el bloque propio—
 * deja al sitio mostrando el llamado DOS veces entre el segundo y el tercer
 * paso, o sin nada entre el primero y el segundo. Con él, el sitio pasa de
 * mostrar su bloque a mostrar el mismo contenido ya administrable, sin ningún
 * momento intermedio raro.
 *
 * Y si el slide no se puede publicar, NO se vacía nada: dejar la portada sin
 * bloque porque la validación falló sería cambiar un problema de
 * administración por uno de contenido.
 */
export const importLocalBlock = async (req, res) => {
    try {
        await ensureSpotlightSchema();
        const clubId = String(req.body?.clubId || '').trim();
        if (!clubId) return res.status(400).json({ error: 'Falta el sitio del que se importa.' });

        const bloque = (await localBlocksOf(clubId)).get(clubId);
        if (!bloque) return res.status(404).json({ error: 'Ese sitio no existe.' });
        if (!hasLocalBlock(bloque)) {
            return res.status(422).json({ error: 'Ese sitio no tiene ningún Bloque Destacado configurado: no hay nada que importar.' });
        }

        const check = validateSlide(slideFromLocalBlock(bloque));
        const reemplazar = req.body?.replace === true;

        // Publicar exige que sea válido (misma asimetría que `updateSlide`).
        if (reemplazar && !check.ok) {
            return res.status(422).json({
                error: 'El bloque de ese sitio no se puede publicar tal cual, así que no se tocó nada.',
                errors: check.errors,
            });
        }

        const row = await insertSlide(check.slide, req.user?.id, reemplazar);

        let vaciado = false;
        if (reemplazar) {
            // Se vacía el TEXTO y se quita la clave `spotlight` del documento
            // de imágenes. La imagen NO se borra de la Biblioteca Multimedia:
            // sigue siendo un archivo del sitio y puede estar en uso en otra
            // parte. Y es reversible — el sitio puede volver a llenarlo.
            await db.query(
                `UPDATE "Setting" SET value = '{}' WHERE "clubId" = $1 AND key = 'spotlight_section_content'`,
                [clubId]
            );
            await db.query(
                `UPDATE "ContentSection" SET content = (content::jsonb - 'spotlight')::text
                  WHERE "clubId" = $1 AND page = 'home' AND section = 'images'
                    AND content IS NOT NULL AND content <> ''`,
                [clubId]
            );
            vaciado = true;
        }

        res.status(201).json({
            slide: withMeta(rowToSlide(row), row, new Date()),
            warnings: check.warnings,
            publicado: reemplazar,
            bloqueLocalVaciado: vaciado,
        });
    } catch (e) {
        console.error('[SPOTLIGHT] importLocalBlock:', e);
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

        // Pasa por `insertSlide` como las otras dos vías: con un INSERT
        // propio, el día que se agregue una columna la copia se queda sin
        // ella y el fallo es mudo. La copia nace apagada — duplicar tampoco
        // publica.
        const copia = { ...rowToSlide(prev[0]), name: `${prev[0].name} (copia)` };
        const row = await insertSlide(copia, req.user?.id);
        res.status(201).json({ slide: withMeta(rowToSlide(row), row, new Date()) });
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
