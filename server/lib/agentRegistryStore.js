// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Registro: acceso a la base (v4.1315.0)
//
// Todo lo que DECIDE vive en `agentRegistrySpec.js` (puro). Esto sólo lee y
// escribe. Nada aquí escribe en "Agent" salvo `mirrorToLegacy`, que es el
// espejo de lo PUBLICADO para que el chat heredado responda con eso.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAgentCenterSchema } from './ensureAgentCenterSchema.js';
import {
    TEAMS, siteTypeCatalog, effectiveSiteTypePolicy, canonicalSiteType, sanitizeDraft, templateReadiness,
    canTransitionTemplate, planLegacyMigration, installationState, SETTINGS_DEFAULTS, sanitizeSettings,
    agencyRawUrl, agencyCuratedEntry, draftFromAgencyMarkdown, parseAgentMarkdown, slugify, siteTypeAllows,
} from './agentRegistrySpec.js';
import { AGENT_SKILLS_BUNDLE } from './agentSkillsBundle.js';

const asJson = (v) => JSON.stringify(v ?? null);
const actorOf = (user) => ({ id: user?.id || user?.userId || null, role: user?.role || null });

export class RegistryError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

// ── Auditoría ──────────────────────────────────────────────────────────
export async function audit(user, { entityType, entityId = null, action, siteId = null, before = null, after = null }) {
    const a = actorOf(user);
    try {
        await db.query(
            `INSERT INTO "AgentAuditLog" ("actorId", "actorRole", "entityType", "entityId", action, "siteId", before, after)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
            [a.id, a.role, entityType, entityId, action, siteId, asJson(before), asJson(after)]
        );
    } catch (err) {
        // La auditoría nunca tumba la operación, pero tampoco calla.
        console.error('[agentRegistry] audit:', err.message);
    }
}

export async function listAudit({ limit = 100, entityId = null } = {}) {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(
        `SELECT * FROM "AgentAuditLog" ${entityId ? 'WHERE "entityId" = $2' : ''} ORDER BY "createdAt" DESC LIMIT $1`,
        entityId ? [Math.min(500, limit), entityId] : [Math.min(500, limit)]
    );
    return rows;
}

// ── Ajustes ────────────────────────────────────────────────────────────
export async function getSettings() {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT value FROM "AgentSetting" WHERE key = 'platform'`);
    return sanitizeSettings(rows[0]?.value || {}, SETTINGS_DEFAULTS);
}

export async function saveSettings(input, user) {
    const before = await getSettings();
    const after = sanitizeSettings(input, before);
    await db.query(
        `INSERT INTO "AgentSetting" (key, value, "updatedBy", "updatedAt") VALUES ('platform', $1::jsonb, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`,
        [asJson(after), actorOf(user).id]
    );
    await audit(user, { entityType: 'setting', entityId: 'platform', action: 'setting_changed', before, after });
    return after;
}

// ── Tipos de sitio ─────────────────────────────────────────────────────
export async function listSiteTypePolicies() {
    await ensureAgentCenterSchema();
    const [saved, sites, inst] = await Promise.all([
        db.query(`SELECT * FROM "AgentSiteTypePolicy"`),
        db.query(`SELECT type, COUNT(*)::int AS n FROM "Club" GROUP BY type`).catch(() => ({ rows: [] })),
        db.query(`SELECT c.type, COUNT(i.id)::int AS n FROM "AgentInstallation" i JOIN "Club" c ON c.id::text = i."siteId" WHERE i."scopeType" = 'site' GROUP BY c.type`).catch(() => ({ rows: [] })),
    ]);
    const savedBy = new Map(saved.rows.map(r => [r.siteType, r]));
    const count = (rows, type) => rows.filter(r => canonicalSiteType(r.type) === type).reduce((a, r) => a + r.n, 0);
    return siteTypeCatalog().map(t => ({
        ...t,
        ...effectiveSiteTypePolicy(savedBy.get(t.type), t.type),
        sites: count(sites.rows, t.type),
        installations: count(inst.rows, t.type),
        updatedAt: savedBy.get(t.type)?.updatedAt || null,
    }));
}

export async function policyForSiteType(siteType) {
    await ensureAgentCenterSchema();
    const type = canonicalSiteType(siteType);
    const { rows } = await db.query(`SELECT * FROM "AgentSiteTypePolicy" WHERE "siteType" = $1`, [type]);
    return effectiveSiteTypePolicy(rows[0], type);
}

export async function saveSiteTypePolicy(siteType, input, user) {
    await ensureAgentCenterSchema();
    const type = canonicalSiteType(siteType);
    if (!siteTypeCatalog().some(t => t.type === type)) throw new RegistryError('Tipo de sitio desconocido.', 404);
    const before = await policyForSiteType(type);
    const after = effectiveSiteTypePolicy({
        enabled: 'enabled' in input ? Boolean(input.enabled) : before.enabled,
        allowedTeams: 'allowedTeams' in input ? input.allowedTeams : before.allowedTeams,
        notes: 'notes' in input ? String(input.notes || '').slice(0, 500) : before.notes,
    }, type);
    await db.query(
        `INSERT INTO "AgentSiteTypePolicy" ("siteType", enabled, "allowedTeams", notes, "updatedBy", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT ("siteType") DO UPDATE SET enabled = EXCLUDED.enabled, "allowedTeams" = EXCLUDED."allowedTeams",
             notes = EXCLUDED.notes, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`,
        [type, after.enabled, after.allowedTeams, after.notes, actorOf(user).id]
    );
    await audit(user, { entityType: 'site_type', entityId: type, action: 'site_type_policy', before, after });
    return after;
}

// ── Migración de los agentes heredados ─────────────────────────────────
async function legacyRows() {
    try {
        const { rows } = await db.query(`SELECT * FROM "Agent" ORDER BY "order" ASC NULLS LAST, "createdAt" ASC`);
        return rows;
    } catch {
        return []; // la tabla heredada puede no existir en un entorno nuevo
    }
}

/**
 * Crea plantillas e instalaciones a partir de "Agent". Idempotente: lo ya
 * migrado (por `legacyAgentId` o por `key`) se salta. Publica la versión 1 de
 * cada plantilla heredada CON LO QUE ESTÁ EN LA BASE, no con lo del código.
 */
export async function migrateLegacy(user) {
    await ensureAgentCenterSchema();
    const plan = planLegacyMigration(await legacyRows());
    let templatesCreated = 0;
    let installationsCreated = 0;
    const keyToId = new Map();

    for (const t of plan.templates) {
        const ins = await db.query(
            `INSERT INTO "AgentTemplate" (key, team, level, origin, status, "sourceRef", draft, "ownerSiteId", "legacyAgentId", "avatarSeed", "avatarColor", "sortOrder", "createdBy")
             VALUES ($1, $2, $3, $4, 'draft', $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12)
             ON CONFLICT DO NOTHING RETURNING id`,
            [t.key, t.team, t.level, t.origin, asJson(t.sourceRef), asJson(t.draft), t.ownerSiteId, t.legacyAgentId,
             t.avatarSeed, t.avatarColor, Number(t.sourceRef?.order) || 0, actorOf(user).id]
        );
        if (ins.rows[0]) {
            templatesCreated++;
            await publishVersion(ins.rows[0].id, 'Versión 1: migrada del agente heredado tal como estaba en la base.', user, { skipMirror: true, skipReadiness: true });
        }
        const { rows } = await db.query(`SELECT id FROM "AgentTemplate" WHERE key = $1 OR "legacyAgentId" = $2 LIMIT 1`, [t.key, t.legacyAgentId]);
        if (rows[0]) keyToId.set(t.key, rows[0].id);
    }

    for (const i of plan.installations) {
        const templateId = keyToId.get(i.templateKey);
        if (!templateId) continue;
        const tpl = (await db.query(`SELECT "currentVersionId" FROM "AgentTemplate" WHERE id = $1`, [templateId])).rows[0];
        const ins = await db.query(
            `INSERT INTO "AgentInstallation" ("templateId", "versionId", "scopeType", "siteId", enabled, overrides, "legacyAgentId", "createdBy")
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
             ON CONFLICT DO NOTHING RETURNING id`,
            [templateId, tpl?.currentVersionId || null, i.scopeType, i.siteId, i.enabled, asJson(i.overrides), i.legacyAgentId, actorOf(user).id]
        );
        if (ins.rows[0]) installationsCreated++;
    }

    if (templatesCreated || installationsCreated) {
        await audit(user, { entityType: 'registry', action: 'legacy_migrated', after: { templatesCreated, installationsCreated, legacyRows: plan.templates.length + plan.installations.length } });
    }
    return { templatesCreated, installationsCreated, templatesPlanned: plan.templates.length, installationsPlanned: plan.installations.length };
}

/** La primera vez que se abre el registro, migra solo. Después, nunca. */
export async function migrateLegacyOnce(user) {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM "AgentTemplate"`);
    if (rows[0].n > 0) return null;
    return migrateLegacy(user);
}

// ── Plantillas ─────────────────────────────────────────────────────────
function rowToTemplate(r) {
    return {
        id: r.id, key: r.key, team: r.team, level: r.level, origin: r.origin, status: r.status,
        sourceRef: r.sourceRef || {}, draft: r.draft || {}, currentVersionId: r.currentVersionId,
        allowedSiteTypes: r.allowedSiteTypes || [], ownerSiteId: r.ownerSiteId, legacyAgentId: r.legacyAgentId,
        avatarSeed: r.avatarSeed, avatarColor: r.avatarColor, sortOrder: r.sortOrder,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
        currentVersion: r.currentVersion ?? null,
        installationCount: r.installationCount ?? undefined,
        enabledCount: r.enabledCount ?? undefined,
    };
}

export async function listTemplates({ team, status, origin, q } = {}) {
    await ensureAgentCenterSchema();
    const where = [];
    const params = [];
    if (team) { params.push(team); where.push(`t.team = $${params.length}`); }
    if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
    if (origin) { params.push(origin); where.push(`t.origin = $${params.length}`); }
    if (q) { params.push(`%${String(q).toLowerCase()}%`); where.push(`(LOWER(t.draft->>'name') LIKE $${params.length} OR LOWER(t.draft->>'role') LIKE $${params.length} OR LOWER(t.key) LIKE $${params.length})`); }
    const { rows } = await db.query(
        `SELECT t.*, v.version AS "currentVersion",
                (SELECT COUNT(*)::int FROM "AgentInstallation" i WHERE i."templateId" = t.id) AS "installationCount",
                (SELECT COUNT(*)::int FROM "AgentInstallation" i WHERE i."templateId" = t.id AND i.enabled) AS "enabledCount"
           FROM "AgentTemplate" t
           LEFT JOIN "AgentTemplateVersion" v ON v.id = t."currentVersionId"
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY t.team, t."sortOrder", t.draft->>'name'`,
        params
    );
    return rows.map(rowToTemplate);
}

async function templateRow(id) {
    const { rows } = await db.query(`SELECT * FROM "AgentTemplate" WHERE id = $1`, [String(id)]);
    if (!rows[0]) throw new RegistryError('Plantilla no encontrada.', 404);
    return rows[0];
}

export async function getTemplate(id) {
    await ensureAgentCenterSchema();
    const t = rowToTemplate(await templateRow(id));
    const [versions, installations] = await Promise.all([
        db.query(`SELECT id, version, changelog, "createdBy", "createdAt", snapshot FROM "AgentTemplateVersion" WHERE "templateId" = $1 ORDER BY version DESC`, [t.id]),
        listInstallations({ templateId: t.id }),
    ]);
    return { ...t, versions: versions.rows, installations, readiness: templateReadiness(t) };
}

export async function createTemplate(input, user) {
    await ensureAgentCenterSchema();
    const { draft, errors } = sanitizeDraft(input.draft || input);
    if (errors.length) throw new RegistryError(errors.join(' '));
    const team = TEAMS.some(x => x.key === input.team) ? input.team : 'comunicaciones';
    const level = ['platform', 'site', 'any'].includes(input.level) ? input.level : 'any';
    let key = String(input.key || slugify(draft.name));
    const exists = await db.query(`SELECT 1 FROM "AgentTemplate" WHERE key = $1`, [key]);
    if (exists.rows[0]) key = `${key}-${Date.now().toString(36)}`;
    const origin = ['custom', 'institutional'].includes(input.origin) ? input.origin : 'custom';
    const { rows } = await db.query(
        `INSERT INTO "AgentTemplate" (key, team, level, origin, status, draft, "allowedSiteTypes", "avatarSeed", "avatarColor", "createdBy")
         VALUES ($1, $2, $3, $4, 'draft', $5::jsonb, $6, $7, $8, $9) RETURNING *`,
        [key, team, level, origin, asJson(draft), sanitizeSiteTypes(input.allowedSiteTypes), draft.name, input.avatarColor || null, actorOf(user).id]
    );
    await audit(user, { entityType: 'template', entityId: rows[0].id, action: 'template_created', after: { key, team, level, origin } });
    return rowToTemplate(rows[0]);
}

function sanitizeSiteTypes(list) {
    const known = new Set(siteTypeCatalog().map(t => t.type));
    return (Array.isArray(list) ? list : []).map(canonicalSiteType).filter(t => known.has(t));
}

export async function saveDraft(id, input, user) {
    await ensureAgentCenterSchema();
    const row = await templateRow(id);
    const { draft, errors } = sanitizeDraft(input.draft || {}, row.draft || {});
    if (errors.length) throw new RegistryError(errors.join(' '));
    const team = TEAMS.some(x => x.key === input.team) ? input.team : row.team;
    const level = ['platform', 'site', 'any'].includes(input.level) ? input.level : row.level;
    const allowed = 'allowedSiteTypes' in input ? sanitizeSiteTypes(input.allowedSiteTypes) : row.allowedSiteTypes;
    const { rows } = await db.query(
        `UPDATE "AgentTemplate" SET draft = $2::jsonb, team = $3, level = $4, "allowedSiteTypes" = $5,
                "avatarColor" = COALESCE($6, "avatarColor"), "updatedAt" = NOW()
          WHERE id = $1 RETURNING *`,
        [row.id, asJson(draft), team, level, allowed, input.avatarColor || null]
    );
    await audit(user, { entityType: 'template', entityId: row.id, action: 'template_draft_saved', before: { team: row.team, level: row.level }, after: { team, level } });
    return rowToTemplate(rows[0]);
}

export async function changeTemplateStatus(id, to, user, changelog = '') {
    await ensureAgentCenterSchema();
    const row = await templateRow(id);
    if (to === 'published') return publishVersion(row.id, changelog, user);
    if (!canTransitionTemplate(row.status, to)) throw new RegistryError(`No se puede pasar de «${row.status}» a «${to}».`);
    await db.query(`UPDATE "AgentTemplate" SET status = $2, "updatedAt" = NOW() WHERE id = $1`, [row.id, to]);
    await audit(user, { entityType: 'template', entityId: row.id, action: 'template_status', before: { status: row.status }, after: { status: to } });
    return getTemplate(row.id);
}

/**
 * Publica el borrador como versión nueva (inmutable). Las instalaciones que no
 * están fijadas (`overrides.pinned`) pasan a la nueva versión, y la fila
 * heredada de "Agent" recibe lo publicado (espejo) para el chat de siempre.
 */
export async function publishVersion(id, changelog, user, { skipMirror = false, skipReadiness = false } = {}) {
    const row = await templateRow(id);
    const t = rowToTemplate(row);
    if (!skipReadiness) {
        const r = templateReadiness(t);
        if (!r.ready) throw new RegistryError(`Falta para publicar: ${r.missing.join(', ')}.`);
    }
    if (!['draft', 'review', 'published', 'retired'].includes(row.status)) throw new RegistryError('Estado desconocido.');
    const client = await db.pool.connect();
    let versionId;
    let version;
    try {
        await client.query('BEGIN');
        const max = await client.query(`SELECT COALESCE(MAX(version), 0)::int AS v FROM "AgentTemplateVersion" WHERE "templateId" = $1`, [row.id]);
        version = max.rows[0].v + 1;
        const snapshot = { ...row.draft, team: row.team, level: row.level, allowedSiteTypes: row.allowedSiteTypes || [] };
        const ins = await client.query(
            `INSERT INTO "AgentTemplateVersion" ("templateId", version, snapshot, changelog, "createdBy") VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING id`,
            [row.id, version, asJson(snapshot), String(changelog || '').slice(0, 2000) || null, actorOf(user).id]
        );
        versionId = ins.rows[0].id;
        await client.query(`UPDATE "AgentTemplate" SET "currentVersionId" = $2, status = 'published', "updatedAt" = NOW() WHERE id = $1`, [row.id, versionId]);
        await client.query(
            `UPDATE "AgentInstallation" SET "versionId" = $2, "updatedAt" = NOW()
              WHERE "templateId" = $1 AND COALESCE((overrides->>'pinned')::boolean, false) = false`,
            [row.id, versionId]
        );
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
    if (!skipMirror) await mirrorToLegacy(row.id).catch(err => console.error('[agentRegistry] mirror:', err.message));
    await audit(user, { entityType: 'template', entityId: row.id, action: 'template_published', after: { version, changelog: changelog || null } });
    return getTemplate(row.id);
}

/**
 * Espejo hacia "Agent": la fila global de la plantilla recibe lo publicado, y
 * cada copia de club recibe los campos que ESE club no personalizó.
 */
export async function mirrorToLegacy(templateId) {
    const row = await templateRow(templateId);
    const d = row.draft || {};
    const fields = {
        role: d.role, description: d.description, systemPrompt: d.systemPrompt, greeting: d.greeting,
        capabilities: Array.isArray(d.capabilities) ? d.capabilities : [],
    };
    const set = async (agentId, skip = {}) => {
        const cols = Object.keys(fields).filter(f => !(f in skip));
        if (!cols.length) return;
        const assigns = cols.map((c, i) => `"${c}" = $${i + 2}`).join(', ');
        await db.query(`UPDATE "Agent" SET ${assigns}, name = COALESCE($${cols.length + 2}, name), "updatedAt" = NOW() WHERE id::text = $1`,
            [agentId, ...cols.map(c => fields[c]), d.name || null]);
    };
    if (row.legacyAgentId && row.origin === 'legacy') await set(row.legacyAgentId);
    const { rows } = await db.query(`SELECT "legacyAgentId", overrides FROM "AgentInstallation" WHERE "templateId" = $1 AND "scopeType" = 'site' AND "legacyAgentId" IS NOT NULL`, [row.id]);
    for (const i of rows) await set(i.legacyAgentId, i.overrides || {});
}

// ── Instalaciones ──────────────────────────────────────────────────────
export async function listInstallations({ templateId = null, siteId = null, siteType = null } = {}) {
    await ensureAgentCenterSchema();
    const where = [];
    const params = [];
    if (templateId) { params.push(String(templateId)); where.push(`i."templateId" = $${params.length}`); }
    if (siteId) { params.push(String(siteId)); where.push(`i."siteId" = $${params.length}`); }
    const { rows } = await db.query(
        `SELECT i.*, t.key AS "templateKey", t.team, t.status AS "templateStatus", t.draft->>'name' AS "templateName",
                t."avatarSeed", t."avatarColor", c.name AS "siteName", c.type AS "siteType", c.subdomain AS "siteSubdomain",
                v.version AS "versionNumber"
           FROM "AgentInstallation" i
           JOIN "AgentTemplate" t ON t.id = i."templateId"
           LEFT JOIN "Club" c ON c.id::text = i."siteId"
           LEFT JOIN "AgentTemplateVersion" v ON v.id = i."versionId"
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY i."scopeType" ASC, c.name ASC NULLS FIRST, t."sortOrder"`,
        params
    );
    const policies = new Map((await listSiteTypePolicies()).map(p => [p.type, p]));
    return rows
        .map(r => ({ ...r, siteType: r.siteType ? canonicalSiteType(r.siteType) : null }))
        .filter(r => !siteType || r.siteType === canonicalSiteType(siteType))
        .map(r => {
            const policy = r.scopeType === 'site' ? policies.get(r.siteType) : null;
            const st = installationState({ installation: r, template: { status: r.templateStatus, team: r.team }, policy, toolCount: 0 });
            return { ...r, state: st.state, stateReason: st.reason };
        });
}

async function siteRow(siteId) {
    const { rows } = await db.query(`SELECT id, name, type, subdomain, status FROM "Club" WHERE id::text = $1`, [String(siteId)]);
    if (!rows[0]) throw new RegistryError('Sitio no encontrado.', 404);
    return rows[0];
}

/** Las reglas para instalar una plantilla en un ámbito. Devuelve el porqué. */
export async function checkInstallable(templateRowOrId, scopeType, siteId) {
    const t = typeof templateRowOrId === 'object' ? templateRowOrId : await templateRow(templateRowOrId);
    if (t.status !== 'published') return { ok: false, reason: 'La plantilla no está publicada.' };
    if (scopeType === 'platform') {
        if (t.level === 'site') return { ok: false, reason: 'Esta plantilla sólo se instala en sitios.' };
        return { ok: true };
    }
    if (t.level === 'platform') return { ok: false, reason: 'Esta plantilla es sólo de la administración central.' };
    const site = await siteRow(siteId);
    const type = canonicalSiteType(site.type);
    if (t.ownerSiteId && String(t.ownerSiteId) !== String(site.id)) return { ok: false, reason: 'Esta plantilla es propia de otro sitio.' };
    if ((t.allowedSiteTypes || []).length && !t.allowedSiteTypes.includes(type)) return { ok: false, reason: 'Esta plantilla no está pensada para este tipo de sitio.' };
    const policy = await policyForSiteType(type);
    if (!policy.enabled) return { ok: false, reason: 'Los agentes no están integrados con este tipo de sitio (Tipos de sitio).' };
    if (!siteTypeAllows(policy, t.team)) return { ok: false, reason: 'Este equipo no está permitido para este tipo de sitio.' };
    return { ok: true, site };
}

export async function createInstallation({ templateId, scopeType = 'site', siteId = null, enabled = false, responsibleUserId = null, rolloutId = null }, user) {
    await ensureAgentCenterSchema();
    const t = await templateRow(templateId);
    const scope = scopeType === 'platform' ? 'platform' : 'site';
    const check = await checkInstallable(t, scope, siteId);
    if (!check.ok) throw new RegistryError(check.reason, 409);
    const { rows } = await db.query(
        `INSERT INTO "AgentInstallation" ("templateId", "versionId", "scopeType", "siteId", enabled, "responsibleUserId", "rolloutId", "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING RETURNING *`,
        [t.id, t.currentVersionId, scope, scope === 'site' ? String(siteId) : null, Boolean(enabled) && (scope === 'platform' || Boolean(responsibleUserId)), responsibleUserId, rolloutId, actorOf(user).id]
    );
    if (!rows[0]) throw new RegistryError('Este agente ya está instalado en ese ámbito.', 409);
    await audit(user, { entityType: 'installation', entityId: rows[0].id, siteId: rows[0].siteId, action: 'installation_created', after: { templateKey: t.key, scopeType: scope, siteId } });
    return rows[0];
}

export async function getInstallation(id) {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT * FROM "AgentInstallation" WHERE id = $1`, [String(id)]);
    if (!rows[0]) throw new RegistryError('Instalación no encontrada.', 404);
    return rows[0];
}

export async function updateInstallation(id, input, user) {
    const before = await getInstallation(id);
    const next = { ...before };
    if ('responsibleUserId' in input) next.responsibleUserId = input.responsibleUserId ? String(input.responsibleUserId) : null;
    if ('enabled' in input) {
        next.enabled = Boolean(input.enabled);
        // Encender un agente de SITIO exige un responsable: es a quien llegan
        // sus aprobaciones y cuyos permisos se usan en lo programado.
        if (next.enabled && before.scopeType === 'site' && !next.responsibleUserId) throw new RegistryError('Para encenderlo, elige primero un responsable del sitio.');
        if (next.enabled && before.scopeType === 'site') {
            const check = await checkInstallable(before.templateId, 'site', before.siteId);
            if (!check.ok) throw new RegistryError(check.reason, 409);
        }
    }
    if ('disabledReason' in input) next.disabledReason = input.disabledReason ? String(input.disabledReason).slice(0, 300) : null;
    if ('overrides' in input && input.overrides && typeof input.overrides === 'object') {
        const o = input.overrides;
        next.overrides = {
            ...(before.overrides || {}),
            ...('displayName' in o ? { displayName: String(o.displayName || '').slice(0, 100) || undefined } : {}),
            ...('extraInstructions' in o ? { extraInstructions: String(o.extraInstructions || '').slice(0, 4000) || undefined } : {}),
            ...('pinned' in o ? { pinned: Boolean(o.pinned) } : {}),
        };
    }
    if ('modelPolicy' in input && input.modelPolicy && typeof input.modelPolicy === 'object') {
        next.modelPolicy = { preferred: input.modelPolicy.preferred ? String(input.modelPolicy.preferred).slice(0, 80) : null };
    }
    if ('budget' in input && input.budget && typeof input.budget === 'object') {
        const usd = Number(input.budget.monthlyUsd);
        next.budget = { monthlyUsd: Number.isFinite(usd) && usd >= 0 ? Math.min(usd, 100000) : null };
    }
    const { rows } = await db.query(
        `UPDATE "AgentInstallation" SET enabled = $2, "responsibleUserId" = $3, "disabledReason" = $4, overrides = $5::jsonb,
                "modelPolicy" = $6::jsonb, budget = $7::jsonb, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
        [before.id, next.enabled, next.responsibleUserId, next.disabledReason || null, asJson(next.overrides || {}), asJson(next.modelPolicy || {}), asJson(next.budget || {})]
    );
    await audit(user, {
        entityType: 'installation', entityId: before.id, siteId: before.siteId, action: 'installation_updated',
        before: { enabled: before.enabled, responsibleUserId: before.responsibleUserId, overrides: before.overrides },
        after: { enabled: next.enabled, responsibleUserId: next.responsibleUserId, overrides: next.overrides },
    });
    // Mantener la tabla heredada coherente con el encendido/apagado.
    if ('enabled' in input && before.legacyAgentId) {
        await db.query(`UPDATE "Agent" SET active = $2, "updatedAt" = NOW() WHERE id::text = $1`, [before.legacyAgentId, next.enabled]).catch(() => {});
    }
    return rows[0];
}

export async function removeInstallation(id, user) {
    const before = await getInstallation(id);
    await db.query(`DELETE FROM "AgentInstallation" WHERE id = $1`, [before.id]);
    if (before.legacyAgentId) await db.query(`UPDATE "Agent" SET active = false, "updatedAt" = NOW() WHERE id::text = $1`, [before.legacyAgentId]).catch(() => {});
    await audit(user, { entityType: 'installation', entityId: before.id, siteId: before.siteId, action: 'installation_removed', before });
    return { ok: true };
}

// ── Sitios y responsables ──────────────────────────────────────────────
export async function searchSites({ q = '', type = null, limit = 40 } = {}) {
    const params = [];
    const where = [];
    if (q) { params.push(`%${String(q).toLowerCase()}%`); where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(COALESCE(subdomain, '')) LIKE $${params.length})`); }
    const { rows } = await db.query(
        `SELECT id, name, type, subdomain, domain, status FROM "Club" ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name ASC LIMIT 400`,
        params
    );
    return rows
        .map(r => ({ ...r, type: canonicalSiteType(r.type) }))
        .filter(r => !type || r.type === canonicalSiteType(type))
        .slice(0, Math.min(200, limit));
}

export async function siteManagers(siteId) {
    const { rows } = await db.query(
        `SELECT id, name, email, role FROM "User" WHERE "clubId" = $1 AND role IN ('administrator', 'superadmin', 'district_admin', 'club_admin', 'editor') ORDER BY name NULLS LAST LIMIT 100`,
        [String(siteId)]
    );
    return rows;
}

// ── Habilidades ────────────────────────────────────────────────────────
export async function syncSkillsFromBundle(user) {
    await ensureAgentCenterSchema();
    let created = 0;
    for (const s of AGENT_SKILLS_BUNDLE) {
        const { meta, body } = parseAgentMarkdown(s.markdown);
        const r = await db.query(
            `INSERT INTO "AgentSkill" (key, name, description, body, origin, "sourceRef")
             VALUES ($1, $2, $3, $4, 'skill', $5::jsonb)
             ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, body = EXCLUDED.body, "updatedAt" = NOW()
             RETURNING (xmax = 0) AS inserted`,
            ['repo-' + s.key, String(meta.name || s.key).slice(0, 120), String(meta.description || '').slice(0, 1000), body.slice(0, 40000), asJson({ kind: 'repo', folder: s.key })]
        );
        if (r.rows[0]?.inserted) created++;
    }
    if (created) await audit(user, { entityType: 'skill', action: 'template_imported', after: { skillsCreated: created } });
    return { total: AGENT_SKILLS_BUNDLE.length, created };
}

export async function listSkills() {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT id, key, name, description, origin, "sourceRef", LENGTH(body) AS "bodyLength", "updatedAt" FROM "AgentSkill" ORDER BY name`);
    if (!rows.length && AGENT_SKILLS_BUNDLE.length) { await syncSkillsFromBundle(null); return listSkills(); }
    return rows;
}

export async function getSkill(key) {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT * FROM "AgentSkill" WHERE key = $1 OR id = $1`, [String(key)]);
    if (!rows[0]) throw new RegistryError('Habilidad no encontrada.', 404);
    return rows[0];
}

// ── The Agency ─────────────────────────────────────────────────────────
const MAX_IMPORT_BYTES = 200_000;

/** Descarga con tope de tiempo y de tamaño. Sólo de raw.githubusercontent.com. */
export async function fetchAgencyMarkdown(path, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
    const url = agencyRawUrl(path);
    if (!url || !agencyCuratedEntry(path)) throw new RegistryError('Ese perfil no está en la lista curada de The Agency.', 400);
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'text/plain' } });
    if (!res.ok) throw new RegistryError(`GitHub respondió ${res.status} al descargar el perfil.`, 502);
    const text = await res.text();
    if (text.length > MAX_IMPORT_BYTES) throw new RegistryError('El perfil supera el tamaño permitido.', 413);
    return text;
}

export async function importAgencyAgent(path, user, opts = {}) {
    await ensureAgentCenterSchema();
    const settings = await getSettings();
    if (!settings.allowAgencyImport) throw new RegistryError('La importación desde The Agency está desactivada en Ajustes.', 403);
    const text = await fetchAgencyMarkdown(path, opts);
    const t = draftFromAgencyMarkdown(path, text);
    const existing = await db.query(`SELECT id FROM "AgentTemplate" WHERE key = $1`, [t.key]);
    if (existing.rows[0]) return { created: false, template: await getTemplate(existing.rows[0].id) };
    const { rows } = await db.query(
        `INSERT INTO "AgentTemplate" (key, team, level, origin, status, "sourceRef", draft, "avatarSeed", "avatarColor", "createdBy")
         VALUES ($1, $2, $3, 'agency', 'draft', $4::jsonb, $5::jsonb, $6, $7, $8) RETURNING id`,
        [t.key, t.team, t.level, asJson(t.sourceRef), asJson(t.draft), t.draft.name, t.avatarColor, actorOf(user).id]
    );
    await audit(user, { entityType: 'template', entityId: rows[0].id, action: 'template_imported', after: { source: t.sourceRef } });
    return { created: true, template: await getTemplate(rows[0].id) };
}

export async function agencyCatalogStatus() {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT key, id, status, "sourceRef"->>'path' AS path FROM "AgentTemplate" WHERE origin = 'agency'`);
    const byPath = new Map(rows.map(r => [r.path, r]));
    return byPath;
}

// ── Resumen ────────────────────────────────────────────────────────────
export async function overview() {
    await ensureAgentCenterSchema();
    const [tpl, inst, siteTypes, settings, audits] = await Promise.all([
        db.query(`SELECT status, team, COUNT(*)::int AS n FROM "AgentTemplate" GROUP BY status, team`),
        listInstallations({}),
        listSiteTypePolicies(),
        getSettings(),
        listAudit({ limit: 8 }),
    ]);
    const byStatus = {};
    const byTeam = {};
    for (const r of tpl.rows) {
        byStatus[r.status] = (byStatus[r.status] || 0) + r.n;
        byTeam[r.team] = byTeam[r.team] || { templates: 0, installations: 0 };
        byTeam[r.team].templates += r.n;
    }
    const byState = {};
    const sites = new Set();
    for (const i of inst) {
        byState[i.state] = (byState[i.state] || 0) + 1;
        if (i.scopeType === 'site' && i.siteId) sites.add(i.siteId);
        byTeam[i.team] = byTeam[i.team] || { templates: 0, installations: 0 };
        byTeam[i.team].installations += 1;
    }
    return {
        templates: { total: tpl.rows.reduce((a, r) => a + r.n, 0), byStatus },
        installations: { total: inst.length, byState, enabled: inst.filter(i => i.enabled).length, sites: sites.size },
        byTeam,
        siteTypes: { enabled: siteTypes.filter(s => s.enabled).map(s => s.type), total: siteTypes.length },
        settings,
        recentAudit: audits,
    };
}
