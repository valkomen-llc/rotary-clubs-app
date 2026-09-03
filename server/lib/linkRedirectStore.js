// ════════════════════════════════════════════════════════════════════
// Las redirecciones de un sitio: de dónde salen y cómo se miden.
//
// La I/O vive acá; el CRITERIO en `linkRedirects.js` (la dirección y el
// destino) y en `linkTracking.js` (qué cuenta como clic y de dónde vino), los
// dos puros y probados. Mismo reparto que `seoRules.js` frente a `seoAudit.js`.
//
// ⚠️ HASTA v4.992 UNA REDIRECCIÓN ERA UNA ENTRADA DE UN ARRAY JSON en
// `Setting.link_redirects`, y de ahí salían los dos defectos que este módulo
// corrige de raíz:
//
//   1. `GET /clubs/by-domain` NO devuelve `link_redirects` —reemplaza `settings`
//      por un objeto de doce llaves elegidas a mano—, así que el panel leía
//      siempre una lista VACÍA por más redirecciones que hubiera guardadas.
//   2. Y como el formulario mandaba esa lista vacía en cada guardado, el
//      siguiente cambio de CUALQUIER campo de Configuración escribía `[]` sobre
//      el documento y BORRABA las redirecciones que sí funcionaban. Ése es el
//      «dejan de funcionar al cabo de un tiempo»: no caducaban, las pisaba el
//      panel.
//
// Con una fila por enlace las dos cosas son imposibles por construcción: nadie
// reescribe la lista entera, y lo que no se toca no se puede perder.
// ════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import db from './db.js';
import { canonicalDomain, domainCandidates, subdomainLabel } from './domains.js';
import { DISTRICT_SITE_SQL, districtSiteParams, pickDistrictSite } from './districtSite.js';
import { normalizeFrom, normalizeTo, sanitizeRules, validateRule } from './linkRedirects.js';
import { dayKey, DEFAULT_STATS_TZ, periodRange, fillDays } from './linkTracking.js';
import { zonedWallToUtc } from './timezone.js';
import { ensureLinkRedirectSchema } from './ensureLinkRedirectSchema.js';

export const SETTING_KEY = 'link_redirects';

/** La zona en la que se cuentan los días. Configurable sin desplegar. */
export const STATS_TZ = process.env.LINK_STATS_TZ || DEFAULT_STATS_TZ;

// Esto se consulta en el catch-all, o sea en CADA página pública. Sin caché
// serían dos consultas por visita para una lista que casi siempre está vacía.
// El TTL es corto a propósito: quien acaba de guardar una redirección espera
// probarla en seguida, no dentro de diez minutos.
const CACHE_TTL_MS = 60_000;
const cache = new Map();

const nuevoId = () => crypto.randomUUID();

/**
 * El sitio al que pertenece un dominio.
 *
 * Repite el camino de `GET /clubs/by-domain` —club por dominio, y si no,
 * distrito y de ahí a su sitio— y NO el de `resolveClubByHost` del módulo de
 * SEO, que sólo mira `Club.domain`. La diferencia importa: el dominio propio de
 * un distrito vive en la fila de `District` (v4.744), así que con el atajo del
 * SEO `rotary4281.org` no encontraría sitio y sus redirecciones no existirían.
 */
async function resolveSiteId(host) {
    const clean = canonicalDomain(host);
    if (!clean) return null;

    const candidates = domainCandidates(clean);
    const label = subdomainLabel(clean);

    const club = await db.query(
        `SELECT id FROM "Club"
          WHERE lower(coalesce(domain, '')) = ANY($1::text[])
             OR ($2 <> '' AND lower(coalesce(subdomain, '')) = $2)
          LIMIT 1`,
        [candidates, label]
    );
    if (club.rows[0]) return club.rows[0].id;

    const district = await db.query(
        `SELECT id, number, subdomain FROM "District"
          WHERE lower(coalesce(domain, '')) = ANY($1::text[])
             OR ($2 <> '' AND lower(coalesce(subdomain, '')) = $2)
          LIMIT 1`,
        [candidates, label]
    );
    if (!district.rows[0]) return null;

    const row = district.rows[0];
    const { rows } = await db.query(DISTRICT_SITE_SQL, districtSiteParams(row));
    return pickDistrictSite(row, rows)?.id || null;
}

// ── La migración desde el JSON ──────────────────────────────────────────────

/**
 * Trae al modelo nuevo las redirecciones que quedaran en el `Setting`.
 *
 * OCURRE AL LEER, NO AL DESPLEGAR: un despliegue no escribe en la base (regla
 * durable desde el 2026-07-13), así que esto no podía ser un script. Mismo
 * patrón que la migración de los grupos de distribución (v4.876) y que
 * `migrateFromLegacyConfig` del router de WhatsApp.
 *
 * El `Setting` se VACÍA, no se borra: esa fila vacía es la marca de que la
 * migración ya ocurrió, y deja además un rastro de que existió.
 *
 * Es idempotente por el índice único parcial de `(clubId, slug)`: una segunda
 * vuelta no puede duplicar nada.
 */
export async function migrateLegacySetting(siteId) {
    if (!siteId) return { migrated: 0 };
    let migradas = 0;
    try {
        const { rows } = await db.query(
            `SELECT value FROM "Setting" WHERE "clubId" = $1 AND key = $2 LIMIT 1`,
            [siteId, SETTING_KEY]
        );
        if (!rows[0]?.value) return { migrated: 0 };

        const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        const reglas = sanitizeRules(parsed);
        if (!reglas.length) return { migrated: 0 };

        for (const r of reglas) {
            const res = await db.query(
                `INSERT INTO "LinkRedirect"
                     (id, "clubId", slug, target, permanent, "forwardQuery", status,
                      notes, "createdByName", "updatedByName")
                 SELECT $1, $2, $3, $4, $5, TRUE, 'active',
                        'Migrada desde la configuración anterior.', 'Sistema', 'Sistema'
                  WHERE NOT EXISTS (
                        SELECT 1 FROM "LinkRedirect"
                         WHERE "clubId" = $2 AND slug = $3 AND "deletedAt" IS NULL)
                 RETURNING id`,
                [nuevoId(), siteId, r.from, r.to, r.permanent]
            );
            if (res.rows[0]) {
                migradas++;
                await writeAudit({
                    linkId: res.rows[0].id, clubId: siteId, action: 'migrated',
                    toTarget: r.to, toStatus: 'active',
                    detail: 'Importada del ajuste `link_redirects`.',
                });
            }
        }

        // Vaciar, nunca borrar: la fila vacía es la marca.
        await db.query(
            `UPDATE "Setting" SET value = '[]', "updatedAt" = NOW()
              WHERE "clubId" = $1 AND key = $2`,
            [siteId, SETTING_KEY]
        );
    } catch (e) {
        console.error('[redirects] migración:', e.message);
    }
    return { migrated: migradas };
}

// ── La resolución pública ───────────────────────────────────────────────────

/**
 * Los enlaces VIVOS y ACTIVOS de un dominio, con su id.
 *
 * Devuelve `[]` ante cualquier problema: una consulta que falla no puede tumbar
 * la página pública, que es lo que este módulo interrumpe.
 */
export async function readRedirectsForHost(host) {
    const key = canonicalDomain(host);
    if (!key) return [];

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.links;

    let links = [];
    try {
        await ensureLinkRedirectSchema();
        const siteId = await resolveSiteId(key);
        if (siteId) {
            let { rows } = await db.query(
                `SELECT id, "clubId", slug, target, permanent, "forwardQuery"
                   FROM "LinkRedirect"
                  WHERE "clubId" = $1 AND "deletedAt" IS NULL AND status = 'active'`,
                [siteId]
            );

            // Sin filas todavía puede ser un sitio nuevo o uno que aún tiene sus
            // redirecciones en el ajuste viejo. Se comprueba UNA vez.
            if (!rows.length) {
                const { migrated } = await migrateLegacySetting(siteId);
                if (migrated) {
                    ({ rows } = await db.query(
                        `SELECT id, "clubId", slug, target, permanent, "forwardQuery"
                           FROM "LinkRedirect"
                          WHERE "clubId" = $1 AND "deletedAt" IS NULL AND status = 'active'`,
                        [siteId]
                    ));
                }
            }
            links = rows;
        }
    } catch (e) {
        console.error('[redirects] no se pudieron leer:', e.message);
        return [];
    }

    cache.set(key, { links, at: Date.now() });
    return links;
}

/** Se llama al guardar desde el panel: probar la redirección no debe esperar al TTL. */
export function invalidateRedirectCache(host) {
    if (host) cache.delete(canonicalDomain(host));
    else cache.clear();
}

// ── El registro del clic ────────────────────────────────────────────────────

/**
 * La sal del identificador seudónimo.
 *
 * Se prefiere una propia; sin ella se usa el secreto que el servidor ya tiene,
 * para que el hash nunca viaje sin sal —sin sal, `sha256(ip+ua)` es reversible
 * por fuerza bruta sobre el espacio de direcciones IP—.
 */
function salt() {
    return process.env.LINK_TRACKING_SALT || process.env.JWT_SECRET || '';
}

/** El identificador del visitante. La IP entra acá y no sale a ninguna parte. */
export function visitorKeyFor(seed) {
    if (!seed) return '';
    return crypto.createHash('sha256').update(salt() + '|' + seed).digest('hex').slice(0, 32);
}

/**
 * Registra un clic y deja los contadores al día EN UNA SOLA IDA A LA BASE.
 *
 * ⚠️ ES UNA SOLA SENTENCIA A PROPÓSITO. En Vercel la función se CONGELA al
 * cerrar la respuesta, así que «medir después de responder» no existe: un
 * `fire-and-forget` quedaría a medias. Y cuatro escrituras sueltas son cuatro
 * viajes de red antes del salto. Con CTEs encadenadas el visitante, el evento,
 * el agregado diario y los contadores del enlace se resuelven en un viaje.
 *
 * Nunca lanza: un fallo midiendo no puede costar la redirección, que es lo que
 * el visitante vino a buscar.
 */
export async function recordClick({ link, click, now = new Date() }) {
    if (!link?.id) return { ok: false, reason: 'sin_enlace' };
    try {
        const dia = dayKey(now, STATS_TZ);

        // Un bot no deja evento ni visitante: sólo su contador. Ver la tabla.
        if (click?.isBot) {
            await db.query(
                `WITH d AS (
                     INSERT INTO "LinkRedirectDaily" ("linkId", "clubId", day, clicks, uniques, bots)
                     VALUES ($1, $2, $3::date, 0, 0, 1)
                     ON CONFLICT ("linkId", day)
                     DO UPDATE SET bots = "LinkRedirectDaily".bots + 1
                 )
                 UPDATE "LinkRedirect" SET "botHits" = "botHits" + 1 WHERE id = $1`,
                [link.id, link.clubId, dia]
            );
            return { ok: true, counted: false, bot: true };
        }

        const vk = click?.identifiable ? visitorKeyFor(click.seed) : '';

        await db.query(
            `WITH v AS (
                 INSERT INTO "LinkRedirectVisitor" ("linkId", "visitorKey", "firstSeenAt", "lastSeenAt", clicks)
                 SELECT $1, $2, $3::timestamp, $3::timestamp, 1 WHERE $2 <> ''
                 ON CONFLICT ("linkId", "visitorKey")
                 DO UPDATE SET "lastSeenAt" = EXCLUDED."lastSeenAt",
                               clicks = "LinkRedirectVisitor".clicks + 1
                 RETURNING ("firstSeenAt" = $3::timestamp) AS nuevo
             ),
             n AS (SELECT COALESCE((SELECT nuevo FROM v), FALSE) AS nuevo),
             e AS (
                 INSERT INTO "LinkRedirectEvent"
                     (id, "linkId", "clubId", "createdAt", "visitorKey", "isNewVisitor",
                      referrer, "referrerHost", "sourceKind", "sourceLabel", "sourceEvidence",
                      "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
                      device, browser, os, country, region, city, "userAgent")
                 SELECT $4, $1, $5, $3::timestamp, $2, n.nuevo,
                        $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15,
                        $16, $17, $18, $19, $20, $21, $22
                   FROM n
             ),
             d AS (
                 INSERT INTO "LinkRedirectDaily" ("linkId", "clubId", day, clicks, uniques, bots)
                 SELECT $1, $5, $23::date, 1, CASE WHEN n.nuevo THEN 1 ELSE 0 END, 0 FROM n
                 ON CONFLICT ("linkId", day)
                 DO UPDATE SET clicks = "LinkRedirectDaily".clicks + 1,
                               uniques = "LinkRedirectDaily".uniques + EXCLUDED.uniques
             )
             UPDATE "LinkRedirect"
                SET "totalClicks" = "totalClicks" + 1,
                    "uniqueVisitors" = "uniqueVisitors" + (SELECT CASE WHEN nuevo THEN 1 ELSE 0 END FROM n),
                    "lastClickAt" = $3::timestamp
              WHERE id = $1`,
            [
                link.id, vk, now, nuevoId(), link.clubId,
                click?.referrer || '', click?.referrerHost || '',
                click?.sourceKind || 'directo', click?.sourceLabel || '', click?.sourceEvidence || 'ninguna',
                click?.utmSource || '', click?.utmMedium || '', click?.utmCampaign || '',
                click?.utmContent || '', click?.utmTerm || '',
                click?.device || 'desconocido', click?.browser || '', click?.os || '',
                click?.country || '', click?.region || '', click?.city || '',
                click?.userAgent || '',
                dia,
            ]
        );
        return { ok: true, counted: true, bot: false };
    } catch (e) {
        // Medir es secundario: el visitante ya está en camino al destino.
        console.error('[redirects] no se pudo registrar el clic:', e.message);
        return { ok: false, reason: e.message };
    }
}

// ── La auditoría administrativa ─────────────────────────────────────────────

/** SÓLO AGREGA. Corregir es escribir otro evento, nunca editar el anterior. */
export async function writeAudit({ linkId, clubId, action, actorId = null, actorName = '',
    fromTarget = '', toTarget = '', fromStatus = '', toStatus = '', detail = '' }) {
    try {
        await db.query(
            `INSERT INTO "LinkRedirectAudit"
                 (id, "linkId", "clubId", action, "actorId", "actorName",
                  "fromTarget", "toTarget", "fromStatus", "toStatus", detail)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [nuevoId(), linkId, clubId, action, actorId, actorName || '',
                fromTarget || '', toTarget || '', fromStatus || '', toStatus || '', detail || '']
        );
        return { ok: true };
    } catch (e) {
        console.error('[redirects] auditoría:', e.message);
        return { ok: false };
    }
}

export async function listAudit(linkId, clubId, limit = 30) {
    const { rows } = await db.query(
        `SELECT action, "actorName", "fromTarget", "toTarget", "fromStatus", "toStatus",
                detail, "createdAt"
           FROM "LinkRedirectAudit"
          WHERE "linkId" = $1 AND "clubId" = $2
          ORDER BY "createdAt" DESC
          LIMIT $3`,
        [linkId, clubId, Math.min(100, Math.max(1, Number(limit) || 30))]
    );
    return rows;
}

// ── El panel: listar, crear, editar, pausar, borrar ─────────────────────────

const CAMPOS = `id, "clubId", slug, target, permanent, "forwardQuery", status, notes,
                "totalClicks", "uniqueVisitors", "botHits", "lastClickAt",
                "createdByName", "createdAt", "updatedByName", "updatedAt"`;

/**
 * El listado, PAGINADO y sin tocar un solo evento.
 *
 * Los contadores viven en la propia fila —se mantienen al escribir el clic— así
 * que pintar cien enlaces cuesta una consulta, tenga la plataforma mil clics o
 * diez millones. Es el requisito de rendimiento del módulo.
 *
 * El aislamiento va en el `WHERE`, no en la pantalla: para quien pregunta por
 * un sitio ajeno, esos enlaces no existen.
 */
export async function listRedirects(clubId, { page = 1, perPage = 25, q = '', status = '' } = {}) {
    await ensureLinkRedirectSchema();
    await migrateLegacySetting(clubId).catch(() => {});

    const limit = Math.min(100, Math.max(1, Number(perPage) || 25));
    const offset = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit);

    const filtros = [`"clubId" = $1`, `"deletedAt" IS NULL`];
    const params = [clubId];
    if (q) {
        params.push(`%${String(q).toLowerCase()}%`);
        filtros.push(`(lower(slug) LIKE $${params.length} OR lower(target) LIKE $${params.length})`);
    }
    if (status === 'active' || status === 'paused') {
        params.push(status);
        filtros.push(`status = $${params.length}`);
    }
    const where = filtros.join(' AND ');

    const [filas, total] = await Promise.all([
        db.query(
            `SELECT ${CAMPOS} FROM "LinkRedirect"
              WHERE ${where}
              ORDER BY "createdAt" DESC
              LIMIT ${limit} OFFSET ${offset}`,
            params
        ),
        db.query(`SELECT COUNT(*)::int AS n FROM "LinkRedirect" WHERE ${where}`, params),
    ]);

    return {
        items: filas.rows,
        page: Math.max(1, Number(page) || 1),
        perPage: limit,
        total: total.rows[0]?.n || 0,
    };
}

export async function getRedirect(id, clubId) {
    await ensureLinkRedirectSchema();
    const { rows } = await db.query(
        `SELECT ${CAMPOS}, "deletedAt" FROM "LinkRedirect"
          WHERE id = $1 AND "clubId" = $2 AND "deletedAt" IS NULL
          LIMIT 1`,
        [id, clubId]
    );
    return rows[0] || null;
}

/** Los slugs vivos del sitio, para que la validación detecte el duplicado. */
async function slugsDelSitio(clubId, exceptId = null) {
    const { rows } = await db.query(
        `SELECT slug FROM "LinkRedirect"
          WHERE "clubId" = $1 AND "deletedAt" IS NULL AND ($2::text IS NULL OR id <> $2)`,
        [clubId, exceptId]
    );
    return rows.map(r => ({ from: r.slug, to: 'https://x.invalid' }));
}

export async function createRedirect({ clubId, slug, target, permanent = false,
    forwardQuery = true, notes = '', actor = {} }) {
    await ensureLinkRedirectSchema();
    await migrateLegacySetting(clubId).catch(() => {});

    const from = normalizeFrom(slug);
    const to = normalizeTo(target);
    const otros = await slugsDelSitio(clubId);
    const v = validateRule({ from, to, permanent }, otros);
    if (!v.ok) return { ok: false, status: 400, error: v.error };

    const id = nuevoId();
    try {
        const { rows } = await db.query(
            `INSERT INTO "LinkRedirect"
                 (id, "clubId", slug, target, permanent, "forwardQuery", status, notes,
                  "createdBy", "createdByName", "updatedBy", "updatedByName")
             VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$8,$9)
             RETURNING ${CAMPOS}`,
            [id, clubId, from, to, permanent === true, forwardQuery !== false,
                String(notes || '').slice(0, 500), actor.id || null, actor.name || '']
        );
        await writeAudit({
            linkId: id, clubId, action: 'created',
            actorId: actor.id || null, actorName: actor.name || '',
            toTarget: to, toStatus: 'active',
        });
        invalidateRedirectCache();
        return { ok: true, link: rows[0] };
    } catch (e) {
        // El índice único parcial es PARCIAL, así que no se usa `ON CONFLICT`
        // contra él (tendría que repetir el predicado o la sentencia falla
        // entera — v4.648). Acá se traduce su rechazo a un motivo legible.
        if (String(e.message || '').includes('LinkRedirect_slug_key')) {
            return { ok: false, status: 409, error: `Ya hay una redirección para «${from}».` };
        }
        throw e;
    }
}

export async function updateRedirect(id, clubId, patch = {}, actor = {}) {
    const actual = await getRedirect(id, clubId);
    if (!actual) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

    const from = patch.slug !== undefined ? normalizeFrom(patch.slug) : actual.slug;
    const to = patch.target !== undefined ? normalizeTo(patch.target) : actual.target;
    const permanent = patch.permanent !== undefined ? patch.permanent === true : actual.permanent;
    const forwardQuery = patch.forwardQuery !== undefined ? patch.forwardQuery !== false : actual.forwardQuery;
    const notes = patch.notes !== undefined ? String(patch.notes).slice(0, 500) : actual.notes;

    const otros = await slugsDelSitio(clubId, id);
    const v = validateRule({ from, to, permanent }, otros);
    if (!v.ok) return { ok: false, status: 400, error: v.error };

    try {
        const { rows } = await db.query(
            `UPDATE "LinkRedirect"
                SET slug = $3, target = $4, permanent = $5, "forwardQuery" = $6, notes = $7,
                    "updatedBy" = $8, "updatedByName" = $9, "updatedAt" = NOW()
              WHERE id = $1 AND "clubId" = $2 AND "deletedAt" IS NULL
              RETURNING ${CAMPOS}`,
            [id, clubId, from, to, permanent, forwardQuery, notes, actor.id || null, actor.name || '']
        );
        if (!rows[0]) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

        // El historial NO se toca: cuelga del id del enlace, no de su texto.
        // Cambiar el destino —o el slug— conserva cada clic que ya recibió.
        if (actual.target !== to || actual.slug !== from) {
            await writeAudit({
                linkId: id, clubId, action: 'edited',
                actorId: actor.id || null, actorName: actor.name || '',
                fromTarget: actual.target, toTarget: to,
                detail: actual.slug !== from ? `Dirección: ${actual.slug} → ${from}` : '',
            });
        }
        invalidateRedirectCache();
        return { ok: true, link: rows[0] };
    } catch (e) {
        if (String(e.message || '').includes('LinkRedirect_slug_key')) {
            return { ok: false, status: 409, error: `Ya hay una redirección para «${from}».` };
        }
        throw e;
    }
}

/** Pausar NO borra y NO toca las estadísticas: el enlace deja de saltar y nada más. */
export async function setRedirectStatus(id, clubId, status, actor = {}) {
    if (status !== 'active' && status !== 'paused') {
        return { ok: false, status: 400, error: 'Estado inválido.' };
    }
    const actual = await getRedirect(id, clubId);
    if (!actual) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

    const { rows } = await db.query(
        `UPDATE "LinkRedirect"
            SET status = $3, "updatedBy" = $4, "updatedByName" = $5, "updatedAt" = NOW()
          WHERE id = $1 AND "clubId" = $2 AND "deletedAt" IS NULL
          RETURNING ${CAMPOS}`,
        [id, clubId, status, actor.id || null, actor.name || '']
    );
    if (!rows[0]) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

    await writeAudit({
        linkId: id, clubId, action: status === 'active' ? 'activated' : 'paused',
        actorId: actor.id || null, actorName: actor.name || '',
        fromStatus: actual.status, toStatus: status,
    });
    invalidateRedirectCache();
    return { ok: true, link: rows[0] };
}

/**
 * Borrado SUAVE. La fila se queda con su historial y su slug queda libre —el
 * índice único es parcial sobre `deletedAt IS NULL`—, así que se puede volver a
 * crear la misma dirección hacia otro destino sin mezclar las dos historias.
 */
export async function deleteRedirect(id, clubId, actor = {}) {
    const actual = await getRedirect(id, clubId);
    if (!actual) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

    const { rows } = await db.query(
        `UPDATE "LinkRedirect"
            SET "deletedAt" = NOW(), "deletedBy" = $3, "updatedAt" = NOW()
          WHERE id = $1 AND "clubId" = $2 AND "deletedAt" IS NULL
          RETURNING id`,
        [id, clubId, actor.id || null]
    );
    if (!rows[0]) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

    await writeAudit({
        linkId: id, clubId, action: 'deleted',
        actorId: actor.id || null, actorName: actor.name || '',
        fromTarget: actual.target, fromStatus: actual.status,
        detail: 'Borrado suave: la fila y su historial se conservan.',
    });
    invalidateRedirectCache();
    return { ok: true };
}

// ── Las estadísticas ────────────────────────────────────────────────────────

/** El instante UTC en el que empieza un día de la zona de estadísticas. */
function inicioDeDia(clave) {
    const [y, m, d] = String(clave).split('-').map(Number);
    if (!y || !m || !d) return null;
    return zonedWallToUtc(y, m, d, 0, STATS_TZ);
}

/**
 * Las cifras de un enlace.
 *
 * La CABECERA sale de contadores y del agregado diario: nunca recorre eventos.
 * Los DESGLOSES sí leen eventos, pero acotados al rango y por un índice
 * `(linkId, createdAt)`.
 */
export async function statsFor(id, clubId, { period = 'd30', now = new Date() } = {}) {
    const link = await getRedirect(id, clubId);
    if (!link) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

    const rango = periodRange(period, now, STATS_TZ);
    const hoy = dayKey(now, STATS_TZ);
    const desde7 = dayKey(new Date(now.getTime() - 6 * 86400000), STATS_TZ);
    const desde30 = dayKey(new Date(now.getTime() - 29 * 86400000), STATS_TZ);

    const [cabecera, serie] = await Promise.all([
        db.query(
            `SELECT
                 COALESCE(SUM(clicks) FILTER (WHERE day = $2::date), 0)::int  AS hoy,
                 COALESCE(SUM(clicks) FILTER (WHERE day >= $3::date), 0)::int AS d7,
                 COALESCE(SUM(clicks) FILTER (WHERE day >= $4::date), 0)::int AS d30,
                 COALESCE(SUM(bots), 0)::int                                  AS bots
               FROM "LinkRedirectDaily" WHERE "linkId" = $1`,
            [id, hoy, desde7, desde30]
        ),
        rango.fromDay
            ? db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, clicks, uniques, bots
                   FROM "LinkRedirectDaily"
                  WHERE "linkId" = $1 AND day >= $2::date AND day <= $3::date
                  ORDER BY day ASC`,
                [id, rango.fromDay, rango.toDay]
            )
            : db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, clicks, uniques, bots
                   FROM "LinkRedirectDaily" WHERE "linkId" = $1 ORDER BY day ASC`,
                [id]
            ),
    ]);

    // Los desgloses del rango. Un enlace sin clics no paga ninguna consulta.
    const desde = rango.fromDay ? inicioDeDia(rango.fromDay) : null;
    const cond = desde ? `"linkId" = $1 AND "createdAt" >= $2` : `"linkId" = $1`;
    const params = desde ? [id, desde] : [id];

    /**
     * Un desglose. La columna de agrupación se pasa por SEPARADO de las que se
     * seleccionan además: derivarla del `SELECT` con un `split` es la clase de
     * atajo que se rompe en silencio en cuanto una consulta lleva dos columnas.
     */
    const agrupar = (grupo, alias, extras = '') => db.query(
        `SELECT ${grupo} AS ${alias}${extras}, COUNT(*)::int AS clicks,
                COUNT(DISTINCT NULLIF("visitorKey", ''))::int AS uniques
           FROM "LinkRedirectEvent"
          WHERE ${cond}
          GROUP BY ${grupo}
          ORDER BY clicks DESC
          LIMIT 20`,
        params
    );

    const [fuentes, dispositivos, paises, campanas, navegadores, unicos] = await Promise.all([
        agrupar(`"sourceKind"`, 'kind', `, MAX("sourceLabel") AS label`),
        agrupar('device', 'device'),
        agrupar('country', 'country'),
        db.query(
            `SELECT "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
                    COUNT(*)::int AS clicks
               FROM "LinkRedirectEvent"
              WHERE ${cond} AND "utmSource" <> ''
              GROUP BY "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"
              ORDER BY clicks DESC LIMIT 20`,
            params
        ),
        agrupar('browser', 'browser'),
        db.query(
            `SELECT COUNT(DISTINCT NULLIF("visitorKey", ''))::int AS n
               FROM "LinkRedirectEvent" WHERE ${cond}`,
            params
        ),
    ]);

    return {
        ok: true,
        link,
        period: { ...rango },
        totals: {
            clicks: link.totalClicks,
            uniqueVisitors: link.uniqueVisitors,
            bots: link.botHits,
            today: cabecera.rows[0]?.hoy || 0,
            last7: cabecera.rows[0]?.d7 || 0,
            last30: cabecera.rows[0]?.d30 || 0,
            lastClickAt: link.lastClickAt,
            periodUniques: unicos.rows[0]?.n || 0,
        },
        series: fillDays(serie.rows, rango),
        sources: fuentes.rows,
        devices: dispositivos.rows,
        countries: paises.rows.filter(r => r.country),
        browsers: navegadores.rows.filter(r => r.browser),
        campaigns: campanas.rows,
    };
}

export default {
    SETTING_KEY, STATS_TZ,
    readRedirectsForHost, invalidateRedirectCache, migrateLegacySetting,
    recordClick, visitorKeyFor,
    listRedirects, getRedirect, createRedirect, updateRedirect,
    setRedirectStatus, deleteRedirect, statsFor,
    writeAudit, listAudit,
};
