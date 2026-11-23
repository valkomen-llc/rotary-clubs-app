// ════════════════════════════════════════════════════════════════════
// Sitio web de Club Platform — el almacén (v4.1348.0)
//
// UNA fila (`PlatformSite.id = 'main'`). Mismo patrón que la landing de
// Programas: borrador con bloqueo optimista, publicación en transacción con
// su versión inmutable, restauración al borrador. Añade lo que un SITIO
// necesita y una página no: revisión previa, reversión directa de lo
// publicado, el interruptor del dominio público y la bitácora.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensurePlatformSiteSchema } from './ensurePlatformSiteSchema.js';
import { PLATFORM_SITE_ID as ID, shapeSite, defaultSite, diffSummary, normalizeHost, ASSIGNABLE_ROLES, DEFAULT_PUBLIC_HOST } from './platformSiteSpec.js';

const one = (r) => r.rows[0] || null;
const actorCols = (actor) => ({ id: actor?.id || null, name: String(actor?.name || 'Administración').slice(0, 120) });

const COLS = `id, name, "siteType", "schemaVersion", draft, published, "draftVersion", "publishedVersion", "publishedDraftVersion", "requireReview", "reviewStatus", "reviewedVersion", "reviewNote", "reviewedByName", "reviewedAt", "publicHost", "publicLive", "liveAt", "liveByName", "createdByName", "createdAt", "updatedByName", "updatedAt", "publishedByName", "publishedAt"`;

export async function audit(action, actor, detail = {}) {
    try {
        const a = actorCols(actor);
        await db.query(`INSERT INTO "PlatformSiteEvent" ("siteId", action, "actorId", "actorName", detail) VALUES ($1, $2, $3, $4, $5::jsonb)`, [ID, action, a.id, a.name, JSON.stringify(detail)]);
    } catch (e) { console.error('[platform-site] no se pudo escribir la bitácora:', e.message); }
}

const hydrate = (row) => (row ? { ...row, draft: shapeSite(row.draft), published: row.published ? shapeSite(row.published) : null } : null);

export async function getSite() {
    await ensurePlatformSiteSchema();
    return hydrate(one(await db.query(`SELECT ${COLS} FROM "PlatformSite" WHERE id = $1`, [ID])));
}

/** Crea el sitio institucional en BORRADOR. Idempotente: si ya existe, lo devuelve. */
export async function createSite({ actor }) {
    await ensurePlatformSiteSchema();
    const a = actorCols(actor);
    const site = defaultSite();
    const row = one(await db.query(
        `INSERT INTO "PlatformSite" (id, name, draft, "schemaVersion", "publicHost", "createdBy", "createdByName", "updatedBy", "updatedByName")
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $6, $7) ON CONFLICT (id) DO NOTHING RETURNING ${COLS}`,
        [ID, site.settings.name, JSON.stringify(site), site.schemaVersion, DEFAULT_PUBLIC_HOST, a.id, a.name]
    ));
    if (row) { await audit('site_created', actor, { pages: site.pages.length }); return { created: true, site: hydrate(row) }; }
    return { created: false, site: await getSite() };
}

/** Guarda el BORRADOR. Una edición invalida cualquier aprobación previa: vuelve a «borrador». */
export async function saveDraft(site, { actor, baseVersion, reason = 'draft_saved', detail = {} }) {
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "PlatformSite" SET draft = $2::jsonb, name = $3, "schemaVersion" = $4, "draftVersion" = "draftVersion" + 1,
                "reviewStatus" = 'draft', "updatedBy" = $5, "updatedByName" = $6, "updatedAt" = NOW()
          WHERE id = $1 AND "draftVersion" = $7 RETURNING ${COLS}`,
        [ID, JSON.stringify(site), site.settings.name, site.schemaVersion, a.id, a.name, Number(baseVersion ?? -1)]
    ));
    if (!row) return { ok: false, conflict: true, current: await getSite() };
    await audit(reason, actor, { draftVersion: row.draftVersion, pages: site.pages.length, ...detail });
    return { ok: true, site: hydrate(row) };
}

/** Borrador → En revisión / Aprobado / Con cambios solicitados. Siempre sobre la versión que el actor leyó. */
export async function setReview(status, { actor, baseVersion, note = '' }) {
    const a = actorCols(actor);
    const decided = status === 'approved' || status === 'changes_requested';
    const row = one(await db.query(
        `UPDATE "PlatformSite" SET "reviewStatus" = $2, "reviewNote" = $3,
                "reviewedVersion" = CASE WHEN $4 THEN "draftVersion" ELSE "reviewedVersion" END,
                "reviewedBy" = CASE WHEN $4 THEN $5 ELSE "reviewedBy" END,
                "reviewedByName" = CASE WHEN $4 THEN $6 ELSE "reviewedByName" END,
                "reviewedAt" = CASE WHEN $4 THEN NOW() ELSE "reviewedAt" END
          WHERE id = $1 AND "draftVersion" = $7 RETURNING ${COLS}`,
        [ID, status, String(note || '').slice(0, 1000) || null, decided, a.id, a.name, Number(baseVersion ?? -1)]
    ));
    if (!row) return { ok: false, conflict: true };
    await audit(`review_${status}`, actor, { draftVersion: row.draftVersion, note: String(note || '').slice(0, 300) });
    return { ok: true, site: hydrate(row) };
}

const writeVersion = async (client, { version, config, summary, note, restoredFrom, a }) => client.query(
    `INSERT INTO "PlatformSiteVersion" ("siteId", version, config, summary, note, "restoredFrom", "publishedBy", "publishedByName") VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)`,
    [ID, version, JSON.stringify(config), JSON.stringify(summary), note || null, restoredFrom || null, a.id, a.name]
);

/** Publica el borrador: lo copia a `published`, escribe la versión con su resumen de cambios y audita. */
export async function publish({ actor, baseVersion, note = '' }) {
    const a = actorCols(actor);
    const cur = await getSite();
    if (!cur) return { ok: false, error: 'El sitio institucional todavía no existe.' };
    if (Number(baseVersion) !== Number(cur.draftVersion)) return { ok: false, conflict: true };
    const summary = diffSummary(cur.published, cur.draft);
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(
            `UPDATE "PlatformSite" SET published = draft, "publishedVersion" = COALESCE("publishedVersion", 0) + 1, "publishedDraftVersion" = "draftVersion",
                    "publishedBy" = $2, "publishedByName" = $3, "publishedAt" = NOW()
              WHERE id = $1 AND "draftVersion" = $4 RETURNING ${COLS}`,
            [ID, a.id, a.name, cur.draftVersion]
        );
        if (!r.rows[0]) throw new Error('El borrador cambió mientras publicabas. Recarga y vuelve a intentar.');
        await writeVersion(client, { version: r.rows[0].publishedVersion, config: r.rows[0].published, summary, note, a });
        await client.query('COMMIT');
        await audit('published', actor, { version: r.rows[0].publishedVersion, draftVersion: cur.draftVersion, note, changes: summary.length });
        return { ok: true, site: hydrate(r.rows[0]) };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return { ok: false, error: e.message };
    } finally { client.release(); }
}

export async function versions() {
    await ensurePlatformSiteSchema();
    const { rows } = await db.query(`SELECT id, version, summary, note, "restoredFrom", "publishedByName", "publishedAt" FROM "PlatformSiteVersion" WHERE "siteId" = $1 ORDER BY version DESC LIMIT 100`, [ID]);
    return rows;
}
const versionConfig = async (version) => one(await db.query(`SELECT config FROM "PlatformSiteVersion" WHERE "siteId" = $1 AND version = $2`, [ID, Number(version)]));

/** Trae una versión publicada al BORRADOR (no publica). */
export async function restoreToDraft(version, { actor }) {
    const v = await versionConfig(version);
    if (!v) return { ok: false, error: 'No existe esa versión.' };
    const cur = await getSite();
    return saveDraft(shapeSite(v.config), { actor, baseVersion: cur.draftVersion, reason: 'version_restored_to_draft', detail: { version: Number(version) } });
}

/**
 * REVERSIÓN: vuelve a poner en público una versión anterior, de inmediato.
 * Es la salida ante una publicación con errores. No borra nada: escribe una
 * versión NUEVA que anota de cuál se restauró, y deja el borrador igual que
 * lo publicado para que la siguiente edición parta de ahí.
 */
export async function rollback(version, { actor, note = '' }) {
    const a = actorCols(actor);
    const v = await versionConfig(version);
    if (!v) return { ok: false, error: 'No existe esa versión.' };
    const config = shapeSite(v.config);
    const cur = await getSite();
    const summary = [`Reversión a la versión ${Number(version)}.`, ...diffSummary(cur.published, config)];
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(
            `UPDATE "PlatformSite" SET published = $2::jsonb, draft = $2::jsonb, "draftVersion" = "draftVersion" + 1, "publishedDraftVersion" = "draftVersion" + 1,
                    "publishedVersion" = COALESCE("publishedVersion", 0) + 1, "reviewStatus" = 'draft',
                    "publishedBy" = $3, "publishedByName" = $4, "publishedAt" = NOW(), "updatedBy" = $3, "updatedByName" = $4, "updatedAt" = NOW()
              WHERE id = $1 RETURNING ${COLS}`,
            [ID, JSON.stringify(config), a.id, a.name]
        );
        await writeVersion(client, { version: r.rows[0].publishedVersion, config, summary, note, restoredFrom: Number(version), a });
        await client.query('COMMIT');
        await audit('rolled_back', actor, { toVersion: Number(version), newVersion: r.rows[0].publishedVersion, note });
        return { ok: true, site: hydrate(r.rows[0]) };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return { ok: false, error: e.message };
    } finally { client.release(); }
}

/** Dominio público, revisión obligatoria y el interruptor «en vivo». */
export async function updateConfig(patch, { actor }) {
    const cur = await getSite();
    if (!cur) return { ok: false, error: 'El sitio institucional todavía no existe.' };
    const a = actorCols(actor);
    const next = {
        publicHost: patch.publicHost !== undefined ? normalizeHost(patch.publicHost) : cur.publicHost,
        requireReview: typeof patch.requireReview === 'boolean' ? patch.requireReview : cur.requireReview,
        publicLive: typeof patch.publicLive === 'boolean' ? patch.publicLive : cur.publicLive,
    };
    if (!next.publicHost) return { ok: false, error: 'El dominio no es válido. Escribe sólo el nombre, por ejemplo clubplatform.org.' };
    if (next.publicLive && !cur.published) return { ok: false, error: 'No hay ninguna versión publicada: publica el sitio antes de activarlo en el dominio público.' };
    const turnedOn = next.publicLive && !cur.publicLive;
    const row = one(await db.query(
        `UPDATE "PlatformSite" SET "publicHost" = $2, "requireReview" = $3, "publicLive" = $4,
                "liveAt" = CASE WHEN $5 THEN NOW() ELSE "liveAt" END, "liveByName" = CASE WHEN $5 THEN $6 ELSE "liveByName" END
          WHERE id = $1 RETURNING ${COLS}`,
        [ID, next.publicHost, next.requireReview, next.publicLive, turnedOn, a.name]
    ));
    await audit('config_updated', actor, { before: { publicHost: cur.publicHost, requireReview: cur.requireReview, publicLive: cur.publicLive }, after: next });
    return { ok: true, site: hydrate(row) };
}

export async function events(limit = 60) {
    await ensurePlatformSiteSchema();
    const { rows } = await db.query(`SELECT id, action, "actorName", detail, "createdAt" FROM "PlatformSiteEvent" WHERE "siteId" = $1 ORDER BY "createdAt" DESC LIMIT $2`, [ID, Math.min(200, Number(limit) || 60)]);
    return rows;
}

// ─── Accesos ───────────────────────────────────────────────────────────

export async function members() {
    await ensurePlatformSiteSchema();
    const { rows } = await db.query(`SELECT id, "userId", email, name, role, "grantedByName", "createdAt" FROM "PlatformSiteMember" WHERE "siteId" = $1 ORDER BY "createdAt"`, [ID]);
    return rows;
}
/** El rol de una persona en el sitio institucional, por id de usuario o por correo. `null` = sin acceso. */
export async function memberRole({ userId, email }) {
    await ensurePlatformSiteSchema();
    const row = one(await db.query(`SELECT role FROM "PlatformSiteMember" WHERE "siteId" = $1 AND (("userId" IS NOT NULL AND "userId" = $2) OR lower(email) = lower($3)) LIMIT 1`, [ID, userId || '', email || '']));
    return row && ASSIGNABLE_ROLES.includes(row.role) ? row.role : null;
}
export async function upsertMember({ email, role }, { actor }) {
    const mail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return { ok: false, error: 'Escribe un correo válido.' };
    if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'Rol no válido.' };
    // Sólo cuentas que YA existen: este módulo no crea usuarios ni contraseñas.
    const user = one(await db.query(`SELECT id, email FROM "User" WHERE lower(email) = $1 LIMIT 1`, [mail]));
    if (!user) return { ok: false, error: 'No hay ninguna cuenta con ese correo. Crea primero el usuario en «Usuarios y roles».' };
    const a = actorCols(actor);
    const row = one(await db.query(
        `INSERT INTO "PlatformSiteMember" ("siteId", "userId", email, role, "grantedBy", "grantedByName") VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("siteId", email) DO UPDATE SET role = EXCLUDED.role, "userId" = EXCLUDED."userId", "grantedBy" = EXCLUDED."grantedBy", "grantedByName" = EXCLUDED."grantedByName"
         RETURNING id, "userId", email, role, "grantedByName", "createdAt"`,
        [ID, user.id, mail, role, a.id, a.name]
    ));
    await audit('member_granted', actor, { email: mail, role });
    return { ok: true, member: row };
}
export async function removeMember(id, { actor }) {
    const row = one(await db.query(`DELETE FROM "PlatformSiteMember" WHERE "siteId" = $1 AND id = $2 RETURNING email, role`, [ID, String(id)]));
    if (row) await audit('member_removed', actor, row);
    return { ok: Boolean(row) };
}

// ─── Fuentes reales ────────────────────────────────────────────────────

const KIND = { club: 'Club', district: 'Distrito', association: 'Asociación', 'Evento o Convención': 'Evento', 'Feria de Proyectos': 'Feria de proyectos', 'Programa de Intercambio': 'Programa de intercambio', Zona: 'Zona' };

/**
 * Sitios del ecosistema que se pueden mostrar: publicados y con dominio
 * PROPIO. Sólo columnas públicas (lo mismo que cualquiera ve al visitarlos).
 * `ids` acota a los elegidos; sin `ids`, es el catálogo para el editor.
 */
export async function ecosystemSites(ids = null) {
    if (ids && !ids.length) return [];
    const { rows } = await db.query(
        `SELECT id, name, logo, domain, type FROM "Club"
          WHERE status = 'active' AND domain IS NOT NULL AND domain <> '' AND domain NOT ILIKE '%clubplatform.org%' AND domain NOT ILIKE '%vercel.app%'
            ${ids ? 'AND id = ANY($1)' : ''}
          ORDER BY name LIMIT 300`,
        ids ? [ids] : []
    );
    return rows.map(r => ({ id: r.id, name: r.name, logo: r.logo || '', url: `https://${String(r.domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`, kind: KIND[r.type] || '' }));
}

// ─── Solicitudes del formulario público ────────────────────────────────

export const LEAD_STATES = ['nueva', 'en_gestion', 'respondida', 'descartada'];

export async function createLead(lead) {
    await ensurePlatformSiteSchema();
    return one(await db.query(
        `INSERT INTO "PlatformSiteLead" ("siteId", name, email, organization, "roleTitle", country, phone, message, "pagePath", "consentText", "consentAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) RETURNING id, "createdAt"`,
        [ID, lead.name, lead.email, lead.organization || null, lead.roleTitle || null, lead.country || null, lead.phone || null, lead.message || null, lead.pagePath || null, lead.consentText || null]
    ));
}
/** Cuántas solicitudes llegaron desde un correo en la última hora (freno de abuso, sin IP). */
export async function recentLeadCount(email) {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM "PlatformSiteLead" WHERE "siteId" = $1 AND lower(email) = lower($2) AND "createdAt" > NOW() - INTERVAL '1 hour'`, [ID, email]);
    return rows[0].n;
}
export async function markLeadNotified(id) { await db.query(`UPDATE "PlatformSiteLead" SET "notifiedAt" = NOW() WHERE id = $1`, [id]); }
export async function listLeads({ status = '', page = 1, perPage = 25 } = {}) {
    await ensurePlatformSiteSchema();
    const where = LEAD_STATES.includes(status) ? `AND status = '${status}'` : '';
    const off = (Math.max(1, Number(page) || 1) - 1) * perPage;
    const { rows } = await db.query(`SELECT id, name, email, organization, "roleTitle", country, phone, message, "pagePath", status, note, "handledByName", "handledAt", "notifiedAt", "createdAt" FROM "PlatformSiteLead" WHERE "siteId" = $1 ${where} ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3`, [ID, perPage, off]);
    const counts = (await db.query(`SELECT status, COUNT(*)::int AS n FROM "PlatformSiteLead" WHERE "siteId" = $1 GROUP BY status`, [ID])).rows;
    return { leads: rows, counts: Object.fromEntries(counts.map(c => [c.status, c.n])) };
}
export async function updateLead(id, { status, note }, { actor }) {
    if (status && !LEAD_STATES.includes(status)) return { ok: false, error: 'Estado no válido.' };
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "PlatformSiteLead" SET status = COALESCE($3, status), note = COALESCE($4, note), "handledByName" = $5, "handledAt" = NOW() WHERE "siteId" = $1 AND id = $2 RETURNING id, status`,
        [ID, String(id), status || null, note === undefined ? null : String(note).slice(0, 1000), a.name]
    ));
    if (row) await audit('lead_updated', actor, { leadId: row.id, status: row.status });
    return { ok: Boolean(row) };
}

// ─── Visitas (sin IP ni datos personales) ──────────────────────────────

export async function recordVisit(path, { firstToday = false } = {}) {
    await ensurePlatformSiteSchema();
    await db.query(
        `INSERT INTO "PlatformSiteDaily" ("siteId", day, path, views, visitors) VALUES ($1, CURRENT_DATE, $2, 1, $3)
         ON CONFLICT ("siteId", day, path) DO UPDATE SET views = "PlatformSiteDaily".views + 1, visitors = "PlatformSiteDaily".visitors + EXCLUDED.visitors`,
        [ID, String(path || '/').slice(0, 200), firstToday ? 1 : 0]
    );
}
export async function visitStats(days = 30) {
    await ensurePlatformSiteSchema();
    const d = Math.min(366, Math.max(1, Number(days) || 30));
    const daily = (await db.query(`SELECT day::text AS day, SUM(views)::int AS views, SUM(visitors)::int AS visitors FROM "PlatformSiteDaily" WHERE "siteId" = $1 AND day > CURRENT_DATE - $2::int GROUP BY day ORDER BY day`, [ID, d])).rows;
    const pages = (await db.query(`SELECT path, SUM(views)::int AS views FROM "PlatformSiteDaily" WHERE "siteId" = $1 AND day > CURRENT_DATE - $2::int GROUP BY path ORDER BY views DESC LIMIT 20`, [ID, d])).rows;
    return { days: d, daily, pages, totals: { views: daily.reduce((s, r) => s + r.views, 0), visitors: daily.reduce((s, r) => s + r.visitors, 0) } };
}

export default {
    getSite, createSite, saveDraft, setReview, publish, versions, restoreToDraft, rollback, updateConfig, events, audit,
    members, memberRole, upsertMember, removeMember, ecosystemSites,
    createLead, recentLeadCount, markLeadNotified, listLeads, updateLead, LEAD_STATES, recordVisit, visitStats,
};
