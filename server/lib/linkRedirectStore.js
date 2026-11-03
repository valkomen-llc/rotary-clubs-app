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
import { pointsToOwnBucket, keyFromBucketUrl, publicMediaPath } from './publicMedia.js';
import { ensureLinkRedirectSchema } from './ensureLinkRedirectSchema.js';
import {
    codeFromBytes, QR_CODE_LENGTH, expiryFor, qrAccessState, normalizeDesign,
    normalizeQrFields, QR_STATUSES,
} from './linkQr.js';

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
export async function resolveSiteId(host) {
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
/**
 * Una redirección que apunta DIRECTAMENTE a un objeto de nuestro bucket se
 * sirve por la vía pública de la Biblioteca.
 *
 * ⚠️ ES UNA REPARACIÓN AL LEER, NO UNA MIGRACIÓN. Un despliegue no escribe en
 * la base (regla durable desde el 2026-07-13), y además la fila guardada sigue
 * siendo la verdad de lo que el administrador escribió: lo que cambia es a
 * dónde se salta. Mismo patrón que la migración perezosa de los grupos de
 * distribución (v4.876) y de estas mismas redirecciones (v4.993).
 *
 * El motivo es concreto y está medido: una URL de S3 con el nombre del archivo
 * dentro lleva caracteres que cada cliente normaliza a su manera —«Edición» va
 * descompuesta desde macOS y iOS la recompone—, así que el salto llegaba a una
 * clave inexistente y S3 lo contestaba con `403 AccessDenied`. La dirección de
 * la Biblioteca sólo lleva el id del archivo: no hay nada que normalizar.
 *
 * Va DENTRO de la lectura cacheada (60 s), no en el salto: con la consulta por
 * clic, cada visita a un enlace de este tipo pagaría una consulta de más.
 * Y NUNCA lanza — si no se puede resolver, se salta al destino de siempre, que
 * es exactamente el comportamiento anterior.
 */
async function resolveBucketTargets(rows) {
    const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
    const candidatas = rows.filter(r => pointsToOwnBucket(r.target, { bucket }));
    if (!candidatas.length) return rows;

    try {
        const claves = candidatas
            .map(r => keyFromBucketUrl(r.target, { bucket }))
            .filter(Boolean);
        if (!claves.length) return rows;

        // Se busca por la clave EXACTA, con los bytes que guardó la subida. No
        // se normaliza a NFC ni a NFD: normalizar acá reintroduciría el mismo
        // defecto por la otra puerta.
        const { rows: medios } = await db.query(
            `SELECT id, filename, "s3Key" FROM "Media" WHERE "s3Key" = ANY($1::text[])`,
            [claves]
        );
        if (!medios.length) return rows;

        const porClave = new Map(medios.map(m => [m.s3Key, m]));
        return rows.map(r => {
            const clave = pointsToOwnBucket(r.target, { bucket })
                ? keyFromBucketUrl(r.target, { bucket }) : null;
            const medio = clave ? porClave.get(clave) : null;
            if (!medio) return r;
            const ruta = publicMediaPath(medio.id, medio.filename);
            return ruta ? { ...r, target: ruta, servedVia: 'public-media' } : r;
        });
    } catch (e) {
        console.warn('[redirects] destino de bucket sin resolver:', e.message);
        return rows;
    }
}

/**
 * Los códigos QR del sitio, colgados de su enlace, para que el salto los
 * resuelva sin otra consulta por visita.
 *
 * Se traen TODOS, también los pausados, deshabilitados, vencidos y eliminados:
 * un código impreso que ya no sirve tiene que contestar con la página
 * institucional, no con la portada del sitio ni con un «no encontrado». Lo que
 * cada uno hace lo decide `qrAccessState` en el momento del escaneo, contra el
 * reloj — así un código vence sin que nadie toque la base.
 *
 * Va DENTRO de la lectura cacheada (60 s). Nunca lanza: sin QR, los enlaces
 * siguen saltando como siempre.
 */
async function attachQrs(links, siteId) {
    if (!links.length) return links;
    try {
        const { rows } = await db.query(
            `SELECT id, "linkId", code, status, "expiresAt", "deletedAt"
               FROM "LinkRedirectQr"
              WHERE "clubId" = $1`,
            [siteId]
        );
        if (!rows.length) return links.map(l => ({ ...l, qrs: [] }));
        const porEnlace = new Map();
        for (const q of rows) {
            if (!porEnlace.has(q.linkId)) porEnlace.set(q.linkId, []);
            porEnlace.get(q.linkId).push(q);
        }
        return links.map(l => ({ ...l, qrs: porEnlace.get(l.id) || [] }));
    } catch (e) {
        console.warn('[redirects] QR sin resolver:', e.message);
        return links.map(l => ({ ...l, qrs: [] }));
    }
}

/**
 * Un código QR por su identificador público, CON su enlace aunque éste ya no
 * esté activo. Es el camino raro: sólo se consulta cuando la visita trae
 * `?qr=` y ningún enlace activo casó con la dirección — o sea, cuando alguien
 * escaneó un afiche cuyo enlace fue pausado o eliminado, y merece la página
 * institucional en vez de la portada.
 *
 * Nunca lanza: ante cualquier duda devuelve `null` y el catch-all sigue.
 */
export async function lookupQrByCode(code) {
    if (!code) return null;
    try {
        await ensureLinkRedirectSchema();
        const { rows } = await db.query(
            `SELECT id, "linkId", "clubId", code, status, "expiresAt", "deletedAt"
               FROM "LinkRedirectQr" WHERE code = $1 LIMIT 1`,
            [code]
        );
        const qr = rows[0];
        if (!qr) return null;
        const { rows: enlaces } = await db.query(
            `SELECT id, "clubId", slug, target, status, "deletedAt"
               FROM "LinkRedirect" WHERE id = $1 LIMIT 1`,
            [qr.linkId]
        );
        return { qr, link: enlaces[0] || null };
    } catch (e) {
        console.warn('[redirects] código QR sin resolver:', e.message);
        return null;
    }
}

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
            links = await resolveBucketTargets(rows);
            links = await attachQrs(links, siteId);
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
export async function recordClick({ link, click, qr = null, now = new Date() }) {
    if (!link?.id) return { ok: false, reason: 'sin_enlace' };
    try {
        const dia = dayKey(now, STATS_TZ);
        // Vacío = clic del enlace compartido por otros medios. Con id = vino
        // por ese QR, y las mismas CTEs mantienen además los contadores del
        // código (v4.1278). Sigue siendo UNA sentencia.
        const qrId = qr?.id || '';

        // Un bot no deja evento ni visitante: sólo su contador. Ver la tabla.
        if (click?.isBot) {
            await db.query(
                `WITH d AS (
                     INSERT INTO "LinkRedirectDaily" ("linkId", "clubId", day, clicks, uniques, bots)
                     VALUES ($1, $2, $3::date, 0, 0, 1)
                     ON CONFLICT ("linkId", day)
                     DO UPDATE SET bots = "LinkRedirectDaily".bots + 1
                 ),
                 qd AS (
                     INSERT INTO "LinkRedirectQrDaily" ("qrId", "linkId", "clubId", day, scans, uniques, bots, blocked)
                     SELECT $4, $1, $2, $3::date, 0, 0, 1, 0 WHERE $4 <> ''
                     ON CONFLICT ("qrId", day)
                     DO UPDATE SET bots = "LinkRedirectQrDaily".bots + 1
                 ),
                 q AS (
                     UPDATE "LinkRedirectQr" SET "botHits" = "botHits" + 1 WHERE id = $4 AND $4 <> ''
                 )
                 UPDATE "LinkRedirect" SET "botHits" = "botHits" + 1 WHERE id = $1`,
                [link.id, link.clubId, dia, qrId]
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
             qv AS (
                 INSERT INTO "LinkRedirectQrVisitor" ("qrId", "visitorKey", "firstSeenAt", "lastSeenAt", scans)
                 SELECT $24, $2, $3::timestamp, $3::timestamp, 1 WHERE $2 <> '' AND $24 <> ''
                 ON CONFLICT ("qrId", "visitorKey")
                 DO UPDATE SET "lastSeenAt" = EXCLUDED."lastSeenAt",
                               scans = "LinkRedirectQrVisitor".scans + 1
                 RETURNING ("firstSeenAt" = $3::timestamp) AS nuevo
             ),
             qn AS (SELECT COALESCE((SELECT nuevo FROM qv), FALSE) AS nuevo),
             e AS (
                 INSERT INTO "LinkRedirectEvent"
                     (id, "linkId", "clubId", "createdAt", "visitorKey", "isNewVisitor",
                      referrer, "referrerHost", "sourceKind", "sourceLabel", "sourceEvidence",
                      "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
                      device, browser, os, country, region, city, "userAgent",
                      "qrId", "accessKind", outcome)
                 SELECT $4, $1, $5, $3::timestamp, $2, n.nuevo,
                        $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15,
                        $16, $17, $18, $19, $20, $21, $22,
                        $24, CASE WHEN $24 <> '' THEN 'qr' ELSE 'link' END, 'redirected'
                   FROM n
             ),
             d AS (
                 INSERT INTO "LinkRedirectDaily" ("linkId", "clubId", day, clicks, uniques, bots, "qrScans")
                 SELECT $1, $5, $23::date, 1, CASE WHEN n.nuevo THEN 1 ELSE 0 END, 0,
                        CASE WHEN $24 <> '' THEN 1 ELSE 0 END
                   FROM n
                 ON CONFLICT ("linkId", day)
                 DO UPDATE SET clicks = "LinkRedirectDaily".clicks + 1,
                               uniques = "LinkRedirectDaily".uniques + EXCLUDED.uniques,
                               "qrScans" = "LinkRedirectDaily"."qrScans" + EXCLUDED."qrScans"
             ),
             qd AS (
                 INSERT INTO "LinkRedirectQrDaily" ("qrId", "linkId", "clubId", day, scans, uniques, bots, blocked)
                 SELECT $24, $1, $5, $23::date, 1, CASE WHEN qn.nuevo THEN 1 ELSE 0 END, 0, 0
                   FROM qn WHERE $24 <> ''
                 ON CONFLICT ("qrId", day)
                 DO UPDATE SET scans = "LinkRedirectQrDaily".scans + 1,
                               uniques = "LinkRedirectQrDaily".uniques + EXCLUDED.uniques
             ),
             q AS (
                 UPDATE "LinkRedirectQr"
                    SET "totalScans" = "totalScans" + 1,
                        "uniqueVisitors" = "uniqueVisitors" + (SELECT CASE WHEN nuevo THEN 1 ELSE 0 END FROM qn),
                        "lastScanAt" = $3::timestamp
                  WHERE id = $24 AND $24 <> ''
             )
             UPDATE "LinkRedirect"
                SET "totalClicks" = "totalClicks" + 1,
                    "uniqueVisitors" = "uniqueVisitors" + (SELECT CASE WHEN nuevo THEN 1 ELSE 0 END FROM n),
                    "qrScans" = "qrScans" + CASE WHEN $24 <> '' THEN 1 ELSE 0 END,
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
                dia, qrId,
            ]
        );
        return { ok: true, counted: true, bot: false, viaQr: Boolean(qrId) };
    } catch (e) {
        // Medir es secundario: el visitante ya está en camino al destino.
        console.error('[redirects] no se pudo registrar el clic:', e.message);
        return { ok: false, reason: e.message };
    }
}

/**
 * Un escaneo de un QR que NO saltó: vencido, pausado, deshabilitado o
 * eliminado. Queda como evento con su `outcome` y suma al contador de
 * bloqueados del código — nunca a los clics del enlace ni a los escaneos
 * buenos, porque nadie llegó al destino.
 *
 * «Siguen escaneando el afiche viejo» es información para quien decide si
 * extender la vigencia. Los bots no se registran acá: de un código que no
 * salta, una vista previa no dice nada.
 *
 * UNA sentencia, y nunca lanza — misma disciplina que `recordClick`.
 */
export async function recordBlockedScan({ link, qr, state, click, now = new Date() }) {
    if (!link?.id || !qr?.id) return { ok: false, reason: 'sin_qr' };
    if (click?.isBot) return { ok: true, counted: false, bot: true };
    try {
        const dia = dayKey(now, STATS_TZ);
        const vk = click?.identifiable ? visitorKeyFor(click.seed) : '';
        const outcome = ['expired', 'paused', 'disabled', 'deleted'].includes(state) ? state : 'disabled';
        await db.query(
            `WITH e AS (
                 INSERT INTO "LinkRedirectEvent"
                     (id, "linkId", "clubId", "createdAt", "visitorKey", "isNewVisitor",
                      referrer, "referrerHost", "sourceKind", "sourceLabel", "sourceEvidence",
                      "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
                      device, browser, os, country, region, city, "userAgent",
                      "qrId", "accessKind", outcome)
                 VALUES ($1, $2, $3, $4::timestamp, $5, FALSE,
                         $6, $7, $8, $9, $10,
                         $11, $12, $13, $14, $15,
                         $16, $17, $18, $19, $20, $21, $22,
                         $23, 'qr', $24)
             ),
             qd AS (
                 INSERT INTO "LinkRedirectQrDaily" ("qrId", "linkId", "clubId", day, scans, uniques, bots, blocked)
                 VALUES ($23, $2, $3, $25::date, 0, 0, 0, 1)
                 ON CONFLICT ("qrId", day)
                 DO UPDATE SET blocked = "LinkRedirectQrDaily".blocked + 1
             )
             UPDATE "LinkRedirectQr" SET "blockedScans" = "blockedScans" + 1 WHERE id = $23`,
            [
                nuevoId(), link.id, link.clubId, now, vk,
                click?.referrer || '', click?.referrerHost || '',
                click?.sourceKind || 'directo', click?.sourceLabel || '', click?.sourceEvidence || 'ninguna',
                click?.utmSource || '', click?.utmMedium || '', click?.utmCampaign || '',
                click?.utmContent || '', click?.utmTerm || '',
                click?.device || 'desconocido', click?.browser || '', click?.os || '',
                click?.country || '', click?.region || '', click?.city || '',
                click?.userAgent || '',
                qr.id, outcome, dia,
            ]
        );
        return { ok: true, counted: true, blocked: true, outcome };
    } catch (e) {
        console.error('[redirects] no se pudo registrar el escaneo bloqueado:', e.message);
        return { ok: false, reason: e.message };
    }
}

// ── La auditoría administrativa ─────────────────────────────────────────────

/** SÓLO AGREGA. Corregir es escribir otro evento, nunca editar el anterior. */
export async function writeAudit({ linkId, clubId, action, actorId = null, actorName = '',
    fromTarget = '', toTarget = '', fromStatus = '', toStatus = '', detail = '', qrId = '' }) {
    try {
        await db.query(
            `INSERT INTO "LinkRedirectAudit"
                 (id, "linkId", "clubId", action, "actorId", "actorName",
                  "fromTarget", "toTarget", "fromStatus", "toStatus", detail, "qrId")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [nuevoId(), linkId, clubId, action, actorId, actorName || '',
                fromTarget || '', toTarget || '', fromStatus || '', toStatus || '', detail || '', qrId || '']
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
                detail, "createdAt", "qrId"
           FROM "LinkRedirectAudit"
          WHERE "linkId" = $1 AND "clubId" = $2
          ORDER BY "createdAt" DESC
          LIMIT $3`,
        [linkId, clubId, Math.min(100, Math.max(1, Number(limit) || 30))]
    );
    return rows;
}

// ── El panel: listar, crear, editar, pausar, borrar ─────────────────────────

const CAMPOS = `id, "clubId", slug, target, permanent, "forwardQuery", status, notes, name,
                "totalClicks", "uniqueVisitors", "botHits", "lastClickAt", "qrScans",
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
        filtros.push(`(lower(slug) LIKE $${params.length} OR lower(target) LIKE $${params.length} OR lower(name) LIKE $${params.length})`);
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

    // Cuántos QR vivos tiene cada enlace. Es una consulta sobre la tabla de
    // códigos —chica— y no sobre eventos: el listado sigue sin recorrer uno.
    const qrCount = new Map();
    if (filas.rows.length) {
        const { rows } = await db.query(
            `SELECT "linkId", COUNT(*)::int AS n FROM "LinkRedirectQr"
              WHERE "clubId" = $1 AND "deletedAt" IS NULL
              GROUP BY "linkId"`,
            [clubId]
        );
        for (const r of rows) qrCount.set(r.linkId, r.n);
    }

    return {
        items: filas.rows.map(r => ({ ...r, qrCount: qrCount.get(r.id) || 0 })),
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
    forwardQuery = true, notes = '', name = '', actor = {} }) {
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
                  "createdBy", "createdByName", "updatedBy", "updatedByName", name)
             VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$8,$9,$10)
             RETURNING ${CAMPOS}`,
            [id, clubId, from, to, permanent === true, forwardQuery !== false,
                String(notes || '').slice(0, 500), actor.id || null, actor.name || '',
                String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80)]
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
    const name = patch.name !== undefined
        ? String(patch.name || '').replace(/\s+/g, ' ').trim().slice(0, 80)
        : (actual.name || '');

    const otros = await slugsDelSitio(clubId, id);
    const v = validateRule({ from, to, permanent }, otros);
    if (!v.ok) return { ok: false, status: 400, error: v.error };

    try {
        const { rows } = await db.query(
            `UPDATE "LinkRedirect"
                SET slug = $3, target = $4, permanent = $5, "forwardQuery" = $6, notes = $7,
                    "updatedBy" = $8, "updatedByName" = $9, "updatedAt" = NOW(), name = $10
              WHERE id = $1 AND "clubId" = $2 AND "deletedAt" IS NULL
              RETURNING ${CAMPOS}`,
            [id, clubId, from, to, permanent, forwardQuery, notes, actor.id || null, actor.name || '', name]
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
 * Los DESGLOSES de un conjunto de eventos: fuente, dispositivo, país,
 * navegador, campañas UTM y visitantes únicos del rango.
 *
 * `cond` y `params` acotan el conjunto —un enlace, o un QR— y el rango. Sólo
 * acá se leen eventos, y siempre por un índice `(linkId|qrId, createdAt)`.
 *
 * La columna de agrupación se pasa por SEPARADO de las que se seleccionan
 * además: derivarla del `SELECT` con un `split` es la clase de atajo que se
 * rompe en silencio en cuanto una consulta lleva dos columnas.
 */
async function desglosesDe(cond, params) {
    const agrupar = (grupo, alias, extras = '') => db.query(
        `SELECT ${grupo} AS ${alias}${extras}, COUNT(*)::int AS clicks,
                COUNT(DISTINCT NULLIF("visitorKey", ''))::int AS uniques
           FROM "LinkRedirectEvent"
          WHERE ${cond} AND outcome = 'redirected'
          GROUP BY ${grupo}
          ORDER BY clicks DESC
          LIMIT 20`,
        params
    );

    const [fuentes, dispositivos, paises, campanas, navegadores, unicos, recientes] = await Promise.all([
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
               FROM "LinkRedirectEvent" WHERE ${cond} AND outcome = 'redirected'`,
            params
        ),
        // La actividad reciente. Sin IP, sin user-agent crudo: lo que se
        // muestra es lo que la pantalla necesita para leer «qué pasó».
        db.query(
            `SELECT "createdAt", "accessKind", "qrId", outcome, "sourceKind", "sourceLabel",
                    device, browser, country, "isNewVisitor"
               FROM "LinkRedirectEvent"
              WHERE ${cond}
              ORDER BY "createdAt" DESC
              LIMIT 25`,
            params
        ),
    ]);

    return {
        sources: fuentes.rows,
        devices: dispositivos.rows,
        countries: paises.rows.filter(r => r.country),
        browsers: navegadores.rows.filter(r => r.browser),
        campaigns: campanas.rows,
        periodUniques: unicos.rows[0]?.n || 0,
        recent: recientes.rows,
    };
}

/** Las claves de día que la cabecera necesita: hoy, hace 7, hace 30. */
function clavesDeCabecera(now) {
    return {
        hoy: dayKey(now, STATS_TZ),
        desde7: dayKey(new Date(now.getTime() - 6 * 86400000), STATS_TZ),
        desde30: dayKey(new Date(now.getTime() - 29 * 86400000), STATS_TZ),
    };
}

/**
 * Las cifras de un enlace.
 *
 * La CABECERA sale de contadores y del agregado diario: nunca recorre eventos.
 * Los DESGLOSES sí leen eventos, pero acotados al rango y por un índice
 * `(linkId, createdAt)`.
 *
 * Desde v4.1278 distingue los clics que entraron por un QR de los del enlace
 * compartido por otros medios, y trae la comparación entre los QR del enlace.
 */
export async function statsFor(id, clubId, { period = 'd30', now = new Date() } = {}) {
    const link = await getRedirect(id, clubId);
    if (!link) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

    const rango = periodRange(period, now, STATS_TZ);
    const { hoy, desde7, desde30 } = clavesDeCabecera(now);

    const [cabecera, serie, qrs] = await Promise.all([
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
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, clicks, uniques, bots, "qrScans"
                   FROM "LinkRedirectDaily"
                  WHERE "linkId" = $1 AND day >= $2::date AND day <= $3::date
                  ORDER BY day ASC`,
                [id, rango.fromDay, rango.toDay]
            )
            : db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, clicks, uniques, bots, "qrScans"
                   FROM "LinkRedirectDaily" WHERE "linkId" = $1 ORDER BY day ASC`,
                [id]
            ),
        listQrs(id, clubId, { now }),
    ]);

    // Los desgloses del rango. Un enlace sin clics no paga ninguna consulta.
    const desde = rango.fromDay ? inicioDeDia(rango.fromDay) : null;
    const cond = desde ? `"linkId" = $1 AND "createdAt" >= $2` : `"linkId" = $1`;
    const params = desde ? [id, desde] : [id];
    const desgloses = await desglosesDe(cond, params);

    // Los escaneos de cada QR DENTRO del período, del agregado diario del QR.
    const escaneosPeriodo = new Map();
    if (qrs.length) {
        const { rows } = await db.query(
            rango.fromDay
                ? `SELECT "qrId", COALESCE(SUM(scans), 0)::int AS scans,
                          COALESCE(SUM(uniques), 0)::int AS uniques,
                          COALESCE(SUM(blocked), 0)::int AS blocked
                     FROM "LinkRedirectQrDaily"
                    WHERE "linkId" = $1 AND day >= $2::date AND day <= $3::date
                    GROUP BY "qrId"`
                : `SELECT "qrId", COALESCE(SUM(scans), 0)::int AS scans,
                          COALESCE(SUM(uniques), 0)::int AS uniques,
                          COALESCE(SUM(blocked), 0)::int AS blocked
                     FROM "LinkRedirectQrDaily"
                    WHERE "linkId" = $1
                    GROUP BY "qrId"`,
            rango.fromDay ? [id, rango.fromDay, rango.toDay] : [id]
        );
        for (const r of rows) escaneosPeriodo.set(r.qrId, r);
    }

    const series = fillDays(serie.rows, rango);
    const enPeriodo = series.reduce((a, d) => ({
        clicks: a.clicks + d.clicks, qrScans: a.qrScans + (d.qrScans || 0),
    }), { clicks: 0, qrScans: 0 });

    return {
        ok: true,
        link,
        period: { ...rango },
        totals: {
            clicks: link.totalClicks,
            qrScans: link.qrScans || 0,
            linkClicks: Math.max(0, (link.totalClicks || 0) - (link.qrScans || 0)),
            uniqueVisitors: link.uniqueVisitors,
            bots: link.botHits,
            today: cabecera.rows[0]?.hoy || 0,
            last7: cabecera.rows[0]?.d7 || 0,
            last30: cabecera.rows[0]?.d30 || 0,
            lastClickAt: link.lastClickAt,
            periodUniques: desgloses.periodUniques,
            periodClicks: enPeriodo.clicks,
            periodQrScans: enPeriodo.qrScans,
            periodLinkClicks: Math.max(0, enPeriodo.clicks - enPeriodo.qrScans),
        },
        series,
        sources: desgloses.sources,
        devices: desgloses.devices,
        countries: desgloses.countries,
        browsers: desgloses.browsers,
        campaigns: desgloses.campaigns,
        recent: desgloses.recent,
        qrs: qrs.map(q => ({
            ...q,
            periodScans: escaneosPeriodo.get(q.id)?.scans || 0,
            periodUniques: escaneosPeriodo.get(q.id)?.uniques || 0,
            periodBlocked: escaneosPeriodo.get(q.id)?.blocked || 0,
        })),
    };
}

// ── Los códigos QR: listar, crear, editar, estado, vigencia, borrar ─────────

const CAMPOS_QR = `id, "linkId", "clubId", code, name, campaign, medium, label, design,
                   status, "validityPreset", "expiresAt",
                   "totalScans", "uniqueVisitors", "botHits", "blockedScans", "lastScanAt",
                   "createdByName", "createdAt", "updatedByName", "updatedAt"`;

/** Un QR con su estado EFECTIVO calculado contra el reloj. */
function conEstado(row, now = new Date()) {
    if (!row) return row;
    const design = typeof row.design === 'string'
        ? (() => { try { return JSON.parse(row.design); } catch { return {}; } })()
        : (row.design || {});
    return { ...row, design, state: qrAccessState(row, now) };
}

/** Un código nuevo. La entropía la pone `crypto`; la forma, el criterio. */
function nuevoCodigo() {
    return codeFromBytes(crypto.randomBytes(QR_CODE_LENGTH), QR_CODE_LENGTH);
}

export async function listQrs(linkId, clubId, { now = new Date() } = {}) {
    await ensureLinkRedirectSchema();
    const { rows } = await db.query(
        `SELECT ${CAMPOS_QR} FROM "LinkRedirectQr"
          WHERE "linkId" = $1 AND "clubId" = $2 AND "deletedAt" IS NULL
          ORDER BY "createdAt" DESC`,
        [linkId, clubId]
    );
    return rows.map(r => conEstado(r, now));
}

export async function getQr(qrId, linkId, clubId, { now = new Date() } = {}) {
    await ensureLinkRedirectSchema();
    const { rows } = await db.query(
        `SELECT ${CAMPOS_QR} FROM "LinkRedirectQr"
          WHERE id = $1 AND "linkId" = $2 AND "clubId" = $3 AND "deletedAt" IS NULL
          LIMIT 1`,
        [qrId, linkId, clubId]
    );
    return rows[0] ? conEstado(rows[0], now) : null;
}

/**
 * Crea un QR para un enlace. El código es permanente desde este momento: lo
 * que se descargue hoy sigue siendo válido con cualquier cambio posterior.
 *
 * La fecha de vencimiento se calcula ACÁ (`expiryFor`), nunca se acepta la que
 * mande el navegador. El diseño se sanea y, si tiene errores de legibilidad,
 * se rechaza con el motivo.
 */
export async function createQr({ linkId, clubId, fields = {}, design = {}, validity = {}, actor = {}, now = new Date() }) {
    const link = await getRedirect(linkId, clubId);
    if (!link) return { ok: false, status: 404, error: 'Esa redirección no existe.' };

    const f = normalizeQrFields(fields);
    if (!f.name) return { ok: false, status: 400, error: 'Ponele un nombre al QR: es como lo vas a reconocer en el listado («Afiche A3», «Instagram»).' };

    const d = normalizeDesign(design);
    if (!d.ok) return { ok: false, status: 400, error: d.errors[0] };

    const v = expiryFor(validity.preset, { now, customDate: validity.customDate });
    if (!v.ok) return { ok: false, status: 400, error: v.error };

    const id = nuevoId();
    // El índice único del código es GLOBAL y no parcial, así que un choque es
    // un choque de verdad. Con 31^10 combinaciones no debería ocurrir; si
    // ocurre, se prueba otro código, no se devuelve un error al administrador.
    for (let intento = 0; intento < 4; intento++) {
        const code = nuevoCodigo();
        try {
            const { rows } = await db.query(
                `INSERT INTO "LinkRedirectQr"
                     (id, "linkId", "clubId", code, name, campaign, medium, label, design,
                      status, "validityPreset", "expiresAt",
                      "createdBy", "createdByName", "updatedBy", "updatedByName")
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'active',$10,$11,$12,$13,$12,$13)
                 RETURNING ${CAMPOS_QR}`,
                [id, linkId, clubId, code, f.name, f.campaign, f.medium, f.label,
                    JSON.stringify(d.design), v.preset, v.expiresAt,
                    actor.id || null, actor.name || '']
            );
            await writeAudit({
                linkId, clubId, qrId: id, action: 'qr_created',
                actorId: actor.id || null, actorName: actor.name || '',
                toStatus: 'active',
                detail: `QR «${f.name}» · ${v.expiresAt ? 'vence ' + v.expiresAt.toISOString().slice(0, 10) : 'sin vencimiento'}`,
            });
            invalidateRedirectCache();
            return { ok: true, qr: conEstado(rows[0], now), warnings: d.warnings };
        } catch (e) {
            if (String(e.message || '').includes('LinkRedirectQr_code_key')) continue;
            throw e;
        }
    }
    return { ok: false, status: 500, error: 'No se pudo generar un código único. Probá otra vez.' };
}

/**
 * Edita la identificación, el diseño y la vigencia de un QR. El CÓDIGO no se
 * toca nunca: la imagen ya descargada sigue valiendo.
 *
 * Cambiar la vigencia es lo que REACTIVA un código vencido: «vencido» se deriva
 * de la fecha, así que una fecha nueva (o «sin vencimiento») basta.
 */
export async function updateQr(qrId, linkId, clubId, patch = {}, actor = {}, now = new Date()) {
    const actual = await getQr(qrId, linkId, clubId, { now });
    if (!actual) return { ok: false, status: 404, error: 'Ese código QR no existe.' };

    const f = normalizeQrFields({
        name: patch.name !== undefined ? patch.name : actual.name,
        campaign: patch.campaign !== undefined ? patch.campaign : actual.campaign,
        medium: patch.medium !== undefined ? patch.medium : actual.medium,
        label: patch.label !== undefined ? patch.label : actual.label,
    });
    if (!f.name) return { ok: false, status: 400, error: 'El QR necesita un nombre.' };

    const d = normalizeDesign(patch.design !== undefined ? patch.design : actual.design);
    if (!d.ok) return { ok: false, status: 400, error: d.errors[0] };

    let preset = actual.validityPreset || 'none';
    let expiresAt = actual.expiresAt || null;
    let cambioVigencia = false;
    if (patch.validity && patch.validity.preset) {
        const v = expiryFor(patch.validity.preset, { now, customDate: patch.validity.customDate });
        if (!v.ok) return { ok: false, status: 400, error: v.error };
        preset = v.preset;
        expiresAt = v.expiresAt;
        cambioVigencia = String(actual.expiresAt || '') !== String(expiresAt || '');
    }

    const { rows } = await db.query(
        `UPDATE "LinkRedirectQr"
            SET name = $4, campaign = $5, medium = $6, label = $7, design = $8::jsonb,
                "validityPreset" = $9, "expiresAt" = $10,
                "updatedBy" = $11, "updatedByName" = $12, "updatedAt" = NOW()
          WHERE id = $1 AND "linkId" = $2 AND "clubId" = $3 AND "deletedAt" IS NULL
          RETURNING ${CAMPOS_QR}`,
        [qrId, linkId, clubId, f.name, f.campaign, f.medium, f.label, JSON.stringify(d.design),
            preset, expiresAt, actor.id || null, actor.name || '']
    );
    if (!rows[0]) return { ok: false, status: 404, error: 'Ese código QR no existe.' };

    const nuevo = conEstado(rows[0], now);
    if (cambioVigencia) {
        await writeAudit({
            linkId, clubId, qrId, action: 'qr_validity',
            actorId: actor.id || null, actorName: actor.name || '',
            fromStatus: actual.state, toStatus: nuevo.state,
            detail: `Vigencia: ${actual.expiresAt ? String(actual.expiresAt).slice(0, 10) : 'sin vencimiento'} → ${expiresAt ? expiresAt.toISOString().slice(0, 10) : 'sin vencimiento'}`,
        });
    } else {
        await writeAudit({
            linkId, clubId, qrId, action: 'qr_edited',
            actorId: actor.id || null, actorName: actor.name || '',
            detail: `QR «${f.name}»`,
        });
    }
    invalidateRedirectCache();
    return { ok: true, qr: nuevo, warnings: d.warnings };
}

/** Pausar, deshabilitar o reactivar. Nada de esto borra una sola estadística. */
export async function setQrStatus(qrId, linkId, clubId, status, actor = {}, now = new Date()) {
    if (!QR_STATUSES.includes(status)) {
        return { ok: false, status: 400, error: `Estado inválido. Los admitidos son: ${QR_STATUSES.join(', ')}.` };
    }
    const actual = await getQr(qrId, linkId, clubId, { now });
    if (!actual) return { ok: false, status: 404, error: 'Ese código QR no existe.' };

    const { rows } = await db.query(
        `UPDATE "LinkRedirectQr"
            SET status = $4, "updatedBy" = $5, "updatedByName" = $6, "updatedAt" = NOW()
          WHERE id = $1 AND "linkId" = $2 AND "clubId" = $3 AND "deletedAt" IS NULL
          RETURNING ${CAMPOS_QR}`,
        [qrId, linkId, clubId, status, actor.id || null, actor.name || '']
    );
    if (!rows[0]) return { ok: false, status: 404, error: 'Ese código QR no existe.' };

    const nuevo = conEstado(rows[0], now);
    await writeAudit({
        linkId, clubId, qrId,
        action: status === 'active' ? 'qr_activated' : status === 'paused' ? 'qr_paused' : 'qr_disabled',
        actorId: actor.id || null, actorName: actor.name || '',
        fromStatus: actual.status, toStatus: status,
        detail: `QR «${actual.name}»`,
    });
    invalidateRedirectCache();
    return { ok: true, qr: nuevo };
}

/**
 * Borrado SUAVE. El código NO se libera —está impreso en alguna parte— y
 * quien lo escanee verá «este enlace ya no existe». El historial se queda.
 */
export async function deleteQr(qrId, linkId, clubId, actor = {}) {
    const actual = await getQr(qrId, linkId, clubId);
    if (!actual) return { ok: false, status: 404, error: 'Ese código QR no existe.' };

    const { rows } = await db.query(
        `UPDATE "LinkRedirectQr"
            SET "deletedAt" = NOW(), "deletedBy" = $4, "updatedAt" = NOW()
          WHERE id = $1 AND "linkId" = $2 AND "clubId" = $3 AND "deletedAt" IS NULL
          RETURNING id`,
        [qrId, linkId, clubId, actor.id || null]
    );
    if (!rows[0]) return { ok: false, status: 404, error: 'Ese código QR no existe.' };

    await writeAudit({
        linkId, clubId, qrId, action: 'qr_deleted',
        actorId: actor.id || null, actorName: actor.name || '',
        fromStatus: actual.status,
        detail: `QR «${actual.name}» · borrado suave: el historial se conserva y el código impreso muestra la página de «ya no existe».`,
    });
    invalidateRedirectCache();
    return { ok: true };
}

/**
 * Las cifras de UN código QR. Misma arquitectura que las del enlace: la
 * cabecera del agregado diario del QR, los desgloses de eventos acotados por
 * `(qrId, createdAt)`.
 */
export async function qrStatsFor(qrId, linkId, clubId, { period = 'd30', now = new Date() } = {}) {
    const qr = await getQr(qrId, linkId, clubId, { now });
    if (!qr) return { ok: false, status: 404, error: 'Ese código QR no existe.' };
    const link = await getRedirect(linkId, clubId);

    const rango = periodRange(period, now, STATS_TZ);
    const { hoy, desde7, desde30 } = clavesDeCabecera(now);

    const [cabecera, serie] = await Promise.all([
        db.query(
            `SELECT
                 COALESCE(SUM(scans) FILTER (WHERE day = $2::date), 0)::int  AS hoy,
                 COALESCE(SUM(scans) FILTER (WHERE day >= $3::date), 0)::int AS d7,
                 COALESCE(SUM(scans) FILTER (WHERE day >= $4::date), 0)::int AS d30,
                 COALESCE(SUM(bots), 0)::int                                 AS bots,
                 COALESCE(SUM(blocked), 0)::int                              AS blocked
               FROM "LinkRedirectQrDaily" WHERE "qrId" = $1`,
            [qrId, hoy, desde7, desde30]
        ),
        rango.fromDay
            ? db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, scans AS clicks, uniques, bots, blocked
                   FROM "LinkRedirectQrDaily"
                  WHERE "qrId" = $1 AND day >= $2::date AND day <= $3::date
                  ORDER BY day ASC`,
                [qrId, rango.fromDay, rango.toDay]
            )
            : db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, scans AS clicks, uniques, bots, blocked
                   FROM "LinkRedirectQrDaily" WHERE "qrId" = $1 ORDER BY day ASC`,
                [qrId]
            ),
    ]);

    const desde = rango.fromDay ? inicioDeDia(rango.fromDay) : null;
    const cond = desde ? `"qrId" = $1 AND "createdAt" >= $2` : `"qrId" = $1`;
    const params = desde ? [qrId, desde] : [qrId];
    const desgloses = await desglosesDe(cond, params);

    return {
        ok: true,
        qr,
        link,
        period: { ...rango },
        totals: {
            scans: qr.totalScans,
            uniqueVisitors: qr.uniqueVisitors,
            bots: qr.botHits,
            blocked: qr.blockedScans,
            today: cabecera.rows[0]?.hoy || 0,
            last7: cabecera.rows[0]?.d7 || 0,
            last30: cabecera.rows[0]?.d30 || 0,
            lastScanAt: qr.lastScanAt,
            periodUniques: desgloses.periodUniques,
        },
        series: fillDays(serie.rows, rango),
        sources: desgloses.sources,
        devices: desgloses.devices,
        countries: desgloses.countries,
        browsers: desgloses.browsers,
        campaigns: desgloses.campaigns,
        recent: desgloses.recent,
    };
}

// ── El resumen del sitio ────────────────────────────────────────────────────

/**
 * Lo que un administrador quiere ver ANTES de abrir un enlace: cuánto tráfico
 * hay en total, cuánto vino por QR, qué códigos y qué campañas rinden más.
 *
 * Todo sale de contadores y agregados diarios acotados por sitio. No toca
 * eventos.
 */
export async function overviewFor(clubId, { period = 'd30', now = new Date() } = {}) {
    await ensureLinkRedirectSchema();
    const rango = periodRange(period, now, STATS_TZ);

    const [enlaces, qrs, diario, diarioQr] = await Promise.all([
        db.query(
            `SELECT id, slug, name, status, "totalClicks", "qrScans", "uniqueVisitors", "lastClickAt"
               FROM "LinkRedirect"
              WHERE "clubId" = $1 AND "deletedAt" IS NULL`,
            [clubId]
        ),
        db.query(
            `SELECT id, "linkId", name, campaign, medium, status, "expiresAt",
                    "totalScans", "uniqueVisitors", "blockedScans", "lastScanAt"
               FROM "LinkRedirectQr"
              WHERE "clubId" = $1 AND "deletedAt" IS NULL`,
            [clubId]
        ),
        rango.fromDay
            ? db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day,
                        SUM(clicks)::int AS clicks, SUM(uniques)::int AS uniques,
                        SUM(bots)::int AS bots, SUM("qrScans")::int AS "qrScans"
                   FROM "LinkRedirectDaily"
                  WHERE "clubId" = $1 AND day >= $2::date AND day <= $3::date
                  GROUP BY day ORDER BY day ASC`,
                [clubId, rango.fromDay, rango.toDay]
            )
            : db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day,
                        SUM(clicks)::int AS clicks, SUM(uniques)::int AS uniques,
                        SUM(bots)::int AS bots, SUM("qrScans")::int AS "qrScans"
                   FROM "LinkRedirectDaily"
                  WHERE "clubId" = $1
                  GROUP BY day ORDER BY day ASC`,
                [clubId]
            ),
        rango.fromDay
            ? db.query(
                `SELECT "qrId", SUM(scans)::int AS scans, SUM(blocked)::int AS blocked
                   FROM "LinkRedirectQrDaily"
                  WHERE "clubId" = $1 AND day >= $2::date AND day <= $3::date
                  GROUP BY "qrId"`,
                [clubId, rango.fromDay, rango.toDay]
            )
            : db.query(
                `SELECT "qrId", SUM(scans)::int AS scans, SUM(blocked)::int AS blocked
                   FROM "LinkRedirectQrDaily"
                  WHERE "clubId" = $1
                  GROUP BY "qrId"`,
                [clubId]
            ),
    ]);

    const porQr = new Map(diarioQr.rows.map(r => [r.qrId, r]));
    const nombreEnlace = new Map(enlaces.rows.map(l => [l.id, l.name || l.slug]));

    const codigos = qrs.rows.map(q => ({
        ...q,
        state: qrAccessState(q, now),
        linkName: nombreEnlace.get(q.linkId) || '',
        periodScans: porQr.get(q.id)?.scans || 0,
        periodBlocked: porQr.get(q.id)?.blocked || 0,
    }));

    const estados = { active: 0, expired: 0, paused: 0, disabled: 0 };
    for (const q of codigos) estados[q.state] = (estados[q.state] || 0) + 1;

    // Campañas: la suma de los QR que llevan el mismo nombre de campaña.
    const campanas = new Map();
    for (const q of codigos) {
        const k = q.campaign || '';
        if (!k) continue;
        const acc = campanas.get(k) || { campaign: k, qrs: 0, scans: 0, periodScans: 0 };
        acc.qrs += 1; acc.scans += q.totalScans || 0; acc.periodScans += q.periodScans;
        campanas.set(k, acc);
    }

    const series = fillDays(diario.rows, rango);
    const enPeriodo = series.reduce((a, d) => ({
        clicks: a.clicks + d.clicks, qrScans: a.qrScans + (d.qrScans || 0),
    }), { clicks: 0, qrScans: 0 });

    const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);

    return {
        ok: true,
        period: { ...rango },
        totals: {
            links: enlaces.rows.length,
            activeLinks: enlaces.rows.filter(l => l.status === 'active').length,
            qrs: codigos.length,
            qrStates: estados,
            clicks: sum(enlaces.rows, 'totalClicks'),
            qrScans: sum(enlaces.rows, 'qrScans'),
            uniqueVisitors: sum(enlaces.rows, 'uniqueVisitors'),
            periodClicks: enPeriodo.clicks,
            periodQrScans: enPeriodo.qrScans,
            periodLinkClicks: Math.max(0, enPeriodo.clicks - enPeriodo.qrScans),
        },
        series,
        topQrs: [...codigos].sort((a, b) => b.periodScans - a.periodScans || b.totalScans - a.totalScans).slice(0, 10),
        topCampaigns: [...campanas.values()].sort((a, b) => b.periodScans - a.periodScans || b.scans - a.scans).slice(0, 10),
        topLinks: [...enlaces.rows].sort((a, b) => (b.totalClicks || 0) - (a.totalClicks || 0)).slice(0, 10),
    };
}

export default {
    SETTING_KEY, STATS_TZ,
    readRedirectsForHost, invalidateRedirectCache, migrateLegacySetting, lookupQrByCode,
    recordClick, recordBlockedScan, visitorKeyFor,
    listRedirects, getRedirect, createRedirect, updateRedirect,
    setRedirectStatus, deleteRedirect, statsFor,
    listQrs, getQr, createQr, updateQr, setQrStatus, deleteQr, qrStatsFor, overviewFor,
    writeAudit, listAudit,
};
