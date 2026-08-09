// ════════════════════════════════════════════════════════════════════
// Traer eventos del ecosistema del distrito — v4.747
//
// La ORQUESTACIÓN. El criterio —qué se copia, cómo se rotula cada
// organización, qué se considera divergencia— vive en
// `server/lib/districtEcosystem.js`, que es puro y está probado. Acá sólo se
// consulta la base y se escribe.
//
// POR QUÉ HACE FALTA UNA RUTA NUEVA
// ---------------------------------
// Hoy un administrador de distrito NO PUEDE ver los eventos de sus sitios por
// ninguna vía: `GET /api/calendar` filtra por `req.user.clubId` (sólo el propio
// sitio) y `/api/admin/districts` es `superAdminOnly` (sólo el operador de la
// plataforma). Este controlador abre esa lectura ACOTADA a la jurisdicción de
// quien pregunta; no reabre la ruta del operador.
// ════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { isDistrictSiteType } from '../lib/districtSite.js';
import {
    orgBadgeOf, publicUrlOf, buildClonePayload, sourceTraceOf,
    divergenceOf, freeSlug,
} from '../lib/districtEcosystem.js';
import { ingestMemorySafe } from '../services/brainService.js';

/** Cuántos eventos próximos se traen de una vez. Acotado: la función corta a los 120 s. */
const MAX_EVENTS = 300;
/** Cuántos se pueden clonar en una sola petición. */
const MAX_CLONE_BATCH = 50;

/**
 * Quién pregunta y qué le corresponde ver.
 *
 * EL AISLAMIENTO VIVE ACÁ, en un solo punto, y todas las consultas del módulo
 * pasan por él — mismo patrón que `buildFilters` en Postulaciones y
 * `ownedMedia` en la Librería. Un endpoint que consulte la tabla por fuera
 * pierde el aislamiento EN SILENCIO, que es la peor forma de perderlo.
 *
 * Devuelve `{ error }` en vez de lanzar, para que cada ruta decida su código.
 */
async function resolveScope(req) {
    const isOperator = req.user?.role === 'administrator';
    const clubId = isOperator ? (req.query.clubId || req.user?.clubId) : req.user?.clubId;
    if (!clubId) return { error: 'Tu usuario no está asignado a ningún sitio.', code: 400 };

    const siteRes = await db.query(
        `SELECT id, name, type, "organizationType", category, city, logo, domain, subdomain, "districtId", district
           FROM "Club" WHERE id = $1`,
        [clubId],
    );
    const site = siteRes.rows[0];
    if (!site) return { error: 'No encontramos tu sitio.', code: 404 };

    // Sólo el sitio de un distrito arma una agenda del ecosistema. El operador
    // de la plataforma entra igual, para poder diagnosticar desde cualquier sitio.
    if (!isOperator && !isDistrictSiteType(site.type)) {
        return {
            error: 'Esta función es del sitio de un Distrito. Tu sitio está registrado como '
                + `«${site.organizationType || site.type}».`,
            code: 403,
        };
    }

    // El distrito: por la clave foránea, y si no, por el número que lleva el sitio.
    let district = null;
    if (site.districtId) {
        const r = await db.query('SELECT id, number, name FROM "District" WHERE id = $1', [site.districtId]);
        district = r.rows[0] || null;
    }
    if (!district && String(site.district || '').trim()) {
        const r = await db.query(
            'SELECT id, number, name FROM "District" WHERE number::text = btrim($1) LIMIT 1',
            [String(site.district)],
        );
        district = r.rows[0] || null;
    }

    // Los sitios vinculados. Se aceptan las DOS formas de vínculo —la clave
    // foránea y el número escrito en `Club.district`— porque conviven en
    // producción: el alta desde /admin/distritos escribe una y el registro
    // público escribe la otra.
    const number = district?.number == null ? '' : String(district.number);
    const siblingsRes = await db.query(
        `SELECT id, name, type, "organizationType", category, city, logo, domain, subdomain
           FROM "Club"
          WHERE id <> $1
            AND status = 'active'
            AND (($2 <> '' AND "districtId" = $2)
              OR ($3 <> '' AND btrim(coalesce(district, '')) = $3))
          ORDER BY name ASC`,
        // Los parámetros van como TEXTO VACÍO y no como NULL a propósito: con
        // NULL, Postgres tiene que inferir el tipo del mismo parámetro usado en
        // dos comparaciones distintas y la sentencia puede fallar en ejecución,
        // que es justo lo que no se ve sin una base delante.
        [site.id, district?.id || '', number],
    );

    return { site, district, siblings: siblingsRes.rows, isOperator };
}

/** Los eventos que este sitio ya trajo, indexados por el id de su original. */
async function clonesByOrigin(siteId) {
    const res = await db.query(
        `SELECT id, slug, title, "startDate", "endDate", location, metadata
           FROM "CalendarEvent"
          WHERE "clubId" = $1 AND metadata -> 'source' ->> 'eventId' IS NOT NULL`,
        [siteId],
    );
    const map = new Map();
    for (const row of res.rows) {
        const trace = sourceTraceOf(row);
        if (trace) map.set(trace.eventId, row);
    }
    return map;
}

/** Los slugs ya usados en este sitio, para no chocar con el índice único. */
async function takenSlugs(siteId) {
    const res = await db.query(
        'SELECT slug FROM "CalendarEvent" WHERE "clubId" = $1 AND slug IS NOT NULL',
        [siteId],
    );
    return res.rows.map((r) => r.slug);
}

// ── GET /sites ───────────────────────────────────────────────────────
// Las organizaciones del distrito, con cuántos eventos próximos tienen.
export async function listSites(req, res) {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(scope.code).json({ error: scope.error });

        const ids = scope.siblings.map((c) => c.id);
        const counts = new Map();
        if (ids.length) {
            const r = await db.query(
                `SELECT "clubId", COUNT(*)::int AS n
                   FROM "CalendarEvent"
                  WHERE "clubId" = ANY($1) AND "startDate" >= NOW() - INTERVAL '1 day'
                  GROUP BY "clubId"`,
                [ids],
            );
            for (const row of r.rows) counts.set(row.clubId, row.n);
        }

        res.json({
            district: scope.district
                ? { id: scope.district.id, number: scope.district.number, name: scope.district.name }
                : null,
            sites: scope.siblings.map((c) => ({
                id: c.id,
                name: c.name,
                city: c.city || '',
                logo: c.logo || '',
                badge: orgBadgeOf(c),
                upcoming: counts.get(c.id) || 0,
            })),
        });
    } catch (error) {
        console.error('[ecosystem] listSites:', error);
        res.status(500).json({ error: 'No pudimos cargar los sitios de tu distrito.' });
    }
}

// ── GET /events ──────────────────────────────────────────────────────
// Los eventos próximos del ecosistema, diciendo cuáles ya están traídos.
export async function listEvents(req, res) {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(scope.code).json({ error: scope.error });

        const siteId = req.query.siteId ? String(req.query.siteId) : '';
        const pool = siteId
            ? scope.siblings.filter((c) => c.id === siteId)
            : scope.siblings;

        // Un `siteId` que no está en el ecosistema no es un 404: para quien
        // pregunta ese sitio simplemente no existe, y decirlo revelaría que sí.
        if (!pool.length) return res.json({ events: [], sites: [] });

        const byId = new Map(pool.map((c) => [c.id, c]));
        const q = String(req.query.q || '').trim().toLowerCase();

        const eventsRes = await db.query(
            `SELECT id, slug, title, description, "htmlContent", "startDate", "endDate",
                    location, type, image, images, metadata, "clubId"
               FROM "CalendarEvent"
              WHERE "clubId" = ANY($1)
                AND "startDate" >= NOW() - INTERVAL '1 day'
              ORDER BY "startDate" ASC
              LIMIT ${MAX_EVENTS}`,
            [pool.map((c) => c.id)],
        );

        const clones = await clonesByOrigin(scope.site.id);

        const events = eventsRes.rows
            .filter((e) => {
                if (!q) return true;
                const club = byId.get(e.clubId);
                return `${e.title} ${e.location || ''} ${club?.name || ''} ${club?.city || ''}`
                    .toLowerCase().includes(q);
            })
            .map((e) => {
                const club = byId.get(e.clubId);
                const clone = clones.get(e.id) || null;
                return {
                    id: e.id,
                    title: e.title,
                    startDate: e.startDate,
                    endDate: e.endDate,
                    location: e.location || '',
                    type: e.type,
                    image: e.image || '',
                    url: publicUrlOf(club, e),
                    org: {
                        id: club?.id || e.clubId,
                        name: club?.name || '',
                        city: club?.city || '',
                        logo: club?.logo || '',
                        badge: orgBadgeOf(club),
                    },
                    // Ya traído: no se ofrece dos veces, y si el original cambió se dice.
                    cloneId: clone?.id || null,
                    divergence: clone ? divergenceOf(clone, e) : null,
                };
            });

        res.json({
            events,
            sites: pool.map((c) => ({ id: c.id, name: c.name, badge: orgBadgeOf(c) })),
        });
    } catch (error) {
        console.error('[ecosystem] listEvents:', error);
        res.status(500).json({ error: 'No pudimos cargar los eventos del ecosistema.' });
    }
}

// ── POST /clone ──────────────────────────────────────────────────────
// Copia uno o varios eventos del ecosistema al sitio del distrito.
export async function cloneEvents(req, res) {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(scope.code).json({ error: scope.error });

        const ids = Array.isArray(req.body?.eventIds) ? req.body.eventIds.map(String) : [];
        if (!ids.length) return res.status(400).json({ error: 'No se indicó ningún evento.' });
        if (ids.length > MAX_CLONE_BATCH) {
            return res.status(400).json({ error: `Se pueden traer hasta ${MAX_CLONE_BATCH} eventos a la vez.` });
        }

        const allowed = new Set(scope.siblings.map((c) => c.id));
        const byId = new Map(scope.siblings.map((c) => [c.id, c]));

        const originsRes = await db.query(
            `SELECT id, slug, title, description, "htmlContent", "startDate", "endDate",
                    location, type, image, images, metadata, "clubId"
               FROM "CalendarEvent" WHERE id = ANY($1)`,
            [ids],
        );

        const clones = await clonesByOrigin(scope.site.id);
        const slugs = await takenSlugs(scope.site.id);
        const clonedAt = new Date().toISOString();

        const created = [];
        const skipped = [];

        for (const origin of originsRes.rows) {
            // Un evento de un sitio que no es del distrito no se trae, y se
            // dice como «no disponible»: confirmar que existe sería filtrar
            // que existe.
            if (!allowed.has(origin.clubId)) {
                skipped.push({ id: origin.id, title: origin.title, reason: 'no disponible en tu distrito' });
                continue;
            }
            if (clones.has(origin.id)) {
                skipped.push({ id: origin.id, title: origin.title, reason: 'ya estaba en tu agenda' });
                continue;
            }

            const club = byId.get(origin.clubId);
            const slug = freeSlug(origin.slug || origin.title, slugs);
            const payload = buildClonePayload({ event: origin, club, clonedAt, slug });

            const inserted = await db.query(
                `INSERT INTO "CalendarEvent"
                    (id, title, description, "htmlContent", "startDate", "endDate", location,
                     type, image, images, "clubId", "createdAt", metadata, slug)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12)
                 RETURNING id, title, slug, "startDate"`,
                [
                    payload.title, payload.description, payload.htmlContent || null,
                    payload.startDate ? new Date(payload.startDate) : null,
                    payload.endDate ? new Date(payload.endDate) : null,
                    payload.location, payload.type, payload.image || null, payload.images,
                    scope.site.id, payload.metadata, payload.slug,
                ],
            );

            const row = inserted.rows[0];
            if (payload.slug) slugs.push(payload.slug);
            created.push({ ...row, from: club?.name || '' });

            // El clon se indexa como cualquier evento del sitio: para el resto
            // de la plataforma es un evento propio, que es el objetivo.
            ingestMemorySafe({
                clubId: scope.site.id,
                kind: 'EVENT',
                sourceType: 'CalendarEvent',
                sourceId: row.id,
                title: row.title,
                content: [payload.description, (payload.htmlContent || '').replace(/<[^>]+>/g, ' ')]
                    .filter(Boolean).join('\n\n'),
                metadata: { type: payload.type, startDate: payload.startDate, location: payload.location },
            });
        }

        // Los ids que no volvieron de la consulta ya no existen en ninguna parte.
        const found = new Set(originsRes.rows.map((r) => r.id));
        for (const id of ids) {
            if (!found.has(id)) skipped.push({ id, title: '', reason: 'el evento ya no existe' });
        }

        res.json({ created, skipped });
    } catch (error) {
        console.error('[ecosystem] cloneEvents:', error);
        res.status(500).json({ error: 'No pudimos traer los eventos.' });
    }
}

// ── POST /refresh/:cloneId ───────────────────────────────────────────
// Vuelve a leer el original y actualiza la copia. Es la respuesta a la
// divergencia: sin esto, «el original cambió» sería un aviso sin salida.
export async function refreshClone(req, res) {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(scope.code).json({ error: scope.error });

        // El aislamiento otra vez en el WHERE: sólo un clon de MI sitio.
        const cloneRes = await db.query(
            'SELECT * FROM "CalendarEvent" WHERE id = $1 AND "clubId" = $2',
            [req.params.cloneId, scope.site.id],
        );
        const clone = cloneRes.rows[0];
        if (!clone) return res.status(404).json({ error: 'No encontramos ese evento en tu agenda.' });

        const trace = sourceTraceOf(clone);
        if (!trace) return res.status(400).json({ error: 'Este evento no vino de otro sitio: no hay origen que releer.' });

        const originRes = await db.query(
            `SELECT id, slug, title, description, "htmlContent", "startDate", "endDate",
                    location, type, image, images, metadata, "clubId"
               FROM "CalendarEvent" WHERE id = $1`,
            [trace.eventId],
        );
        const origin = originRes.rows[0];
        if (!origin) {
            return res.status(409).json({
                error: 'El evento original ya no existe en su sitio. Tu copia se conserva; '
                    + 'podés editarla o eliminarla.',
            });
        }

        const club = scope.siblings.find((c) => c.id === origin.clubId)
            || (await db.query(
                'SELECT id, name, type, "organizationType", category, city, logo, domain, subdomain FROM "Club" WHERE id = $1',
                [origin.clubId],
            )).rows[0];

        // Se conserva el SLUG del clon: es su dirección publicada y puede estar
        // circulando. Renombrarla al refrescar rompería enlaces ya compartidos.
        const payload = buildClonePayload({
            event: origin, club, clonedAt: trace.clonedAt, slug: clone.slug,
        });

        const updated = await db.query(
            `UPDATE "CalendarEvent"
                SET title=$1, description=$2, "htmlContent"=$3, "startDate"=$4, "endDate"=$5,
                    location=$6, type=$7, image=$8, images=$9, metadata=$10
              WHERE id=$11 AND "clubId"=$12
              RETURNING id, title, slug, "startDate", "endDate", location, metadata`,
            [
                payload.title, payload.description, payload.htmlContent || null,
                payload.startDate ? new Date(payload.startDate) : null,
                payload.endDate ? new Date(payload.endDate) : null,
                payload.location, payload.type, payload.image || null, payload.images,
                // Si por lo que fuera no se pudo reconstruir la huella, se
                // conserva la que ya tenía: un refresco no puede dejar el clon
                // sin procedencia — sin ella deja de ser un clon para el resto
                // del módulo y se pierden la atribución y este mismo botón.
                {
                    ...payload.metadata,
                    source: { ...(payload.metadata.source || trace), refreshedAt: new Date().toISOString() },
                },
                clone.id, scope.site.id,
            ],
        );

        res.json({ event: updated.rows[0] });
    } catch (error) {
        console.error('[ecosystem] refreshClone:', error);
        res.status(500).json({ error: 'No pudimos actualizar el evento.' });
    }
}

export default { listSites, listEvents, cloneEvents, refreshClone };
