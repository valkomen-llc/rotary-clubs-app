// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — el catálogo ES el repositorio (v4.1323.0)
//
// Pedido del equipo: «elimina los que tenemos y deja sólo los del repositorio
// msitarzewski/agency-agents». El catálogo del Command Center queda con los 283
// agentes de The Agency (server/lib/agencyAgentsBundle.js, fijado a un commit).
//
// · resetToAgencyCatalog: borra TODAS las plantillas, versiones, instalaciones
//   y herramientas concedidas del registro y carga las del repositorio,
//   PUBLICADAS y sin instalar. Antes guarda una copia completa de lo borrado en
//   "AgentSetting" (`catalogBackup:<fecha>`) y lo audita. Una transacción con
//   candado: dos pestañas no lo corren dos veces.
// · agencyCatalogOnce: la primera vez lo hace solo; si después cambia el commit
//   fijado, SINCRONIZA (agrega lo que falta) y no borra nada.
//
// NO toca la tabla heredada "Agent": alimenta el chat de «Control de Misión
// VIP», el asistente lateral y la orquestadora, que no son este catálogo.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAgentCenterSchema } from './ensureAgentCenterSchema.js';
import { AGENCY_SOURCE, templateFromAgencyBundle } from './agentRegistrySpec.js';

const J = (v) => JSON.stringify(v ?? null);
const actorId = (u) => u?.id || u?.userId || null;
const FLAG = 'agencyCatalog';

async function loadBundle() {
    const { AGENCY_BUNDLE } = await import('./agencyAgentsBundle.js');
    return AGENCY_BUNDLE;
}

export async function catalogStatus() {
    await ensureAgentCenterSchema();
    const flag = (await db.query(`SELECT value FROM "AgentSetting" WHERE key = $1`, [FLAG])).rows[0]?.value || null;
    const counts = (await db.query(`SELECT origin, COUNT(*)::int AS n FROM "AgentTemplate" GROUP BY origin`)).rows;
    const bundle = await loadBundle();
    return {
        source: { owner: AGENCY_SOURCE.owner, repo: AGENCY_SOURCE.repo, ref: bundle.ref, license: AGENCY_SOURCE.license },
        bundleAgents: bundle.agents.length,
        divisions: Object.entries(bundle.divisions).map(([key, d]) => ({ key, label: d.label, color: d.color, agents: bundle.agents.filter(a => a.division === key).length })),
        byOrigin: Object.fromEntries(counts.map(r => [r.origin, r.n])),
        flag,
    };
}

/** Inserta (publicadas) las plantillas del paquete que falten. Usa el cliente de la transacción. */
async function insertMissing(client, bundle, user) {
    const existing = new Set((await client.query(`SELECT key FROM "AgentTemplate"`)).rows.map(r => r.key));
    const rows = bundle.agents.map(a => templateFromAgencyBundle(a, bundle.ref)).filter(t => !existing.has(t.key));
    if (!rows.length) return 0;
    const payload = rows.map((t, i) => ({ key: t.key, team: t.team, level: t.level, sourceRef: t.sourceRef, draft: t.draft, avatarSeed: t.draft.name, avatarColor: t.avatarColor, sortOrder: i }));
    const ins = await client.query(
        `INSERT INTO "AgentTemplate" (key, team, level, origin, status, "sourceRef", draft, "avatarSeed", "avatarColor", "sortOrder", "createdBy")
         SELECT r.key, r.team, r.level, 'agency', 'published', r."sourceRef", r.draft, r."avatarSeed", r."avatarColor", r."sortOrder", $2
           FROM jsonb_to_recordset($1::jsonb) AS r(key text, team text, level text, "sourceRef" jsonb, draft jsonb, "avatarSeed" text, "avatarColor" text, "sortOrder" int)
         ON CONFLICT (key) DO NOTHING
         RETURNING id, key, team, level, draft`, [J(payload), actorId(user)]);
    // La versión 1 de cada una: lo que reciben las instalaciones.
    const versions = ins.rows.map(r => ({ templateId: r.id, snapshot: { ...r.draft, team: r.team, level: r.level, allowedSiteTypes: [] } }));
    const v = await client.query(
        `INSERT INTO "AgentTemplateVersion" ("templateId", version, snapshot, changelog, "createdBy")
         SELECT r."templateId", 1, r.snapshot, $2, $3 FROM jsonb_to_recordset($1::jsonb) AS r("templateId" text, snapshot jsonb)
         RETURNING id, "templateId"`, [J(versions), `Importado de ${AGENCY_SOURCE.owner}/${AGENCY_SOURCE.repo}@${bundle.ref.slice(0, 7)}`, actorId(user)]);
    await client.query(
        `UPDATE "AgentTemplate" t SET "currentVersionId" = v.id, "updatedAt" = NOW()
           FROM jsonb_to_recordset($1::jsonb) AS v(id text, "templateId" text) WHERE t.id = v."templateId"`, [J(v.rows)]);
    return ins.rows.length;
}

/**
 * Deja el registro con SÓLO los agentes del repositorio. Devuelve lo que borró
 * y lo que cargó. La copia de lo borrado queda en AgentSetting.
 */
export async function resetToAgencyCatalog(user, { reason = 'manual' } = {}) {
    await ensureAgentCenterSchema();
    const bundle = await loadBundle();
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('agent-center:agency-catalog'))`);
        if (reason === 'auto') {
            const flag = (await client.query(`SELECT value FROM "AgentSetting" WHERE key = $1`, [FLAG])).rows[0]?.value;
            if (flag?.resetAt) { await client.query('ROLLBACK'); return { skipped: true }; }
        }
        const templates = await client.query(`SELECT * FROM "AgentTemplate"`);
        const versions = await client.query(`SELECT * FROM "AgentTemplateVersion"`);
        const installations = await client.query(`SELECT * FROM "AgentInstallation"`);
        const grants = await client.query(`SELECT * FROM "AgentToolGrant"`);
        const at = new Date().toISOString();
        const backupKey = `catalogBackup:${at}`;
        await client.query(`INSERT INTO "AgentSetting" (key, value, "updatedBy", "updatedAt") VALUES ($1, $2::jsonb, $3, NOW())`,
            [backupKey, J({ at, reason, templates: templates.rows, versions: versions.rows, installations: installations.rows, grants: grants.rows }), actorId(user)]);
        const instIds = installations.rows.map(r => r.id);
        let approvalsExpired = 0; let tasksCancelled = 0;
        if (instIds.length) {
            approvalsExpired = (await client.query(`UPDATE "AgentApproval" SET status = 'expired' WHERE status = 'pending' AND "installationId" = ANY($1) RETURNING id`, [instIds])).rows.length;
            tasksCancelled = (await client.query(`UPDATE "AgentTask" SET status = 'cancelled', "updatedAt" = NOW() WHERE status IN ('queued', 'running', 'waiting_approval', 'failed') AND "installationId" = ANY($1) RETURNING id`, [instIds])).rows.length;
        }
        await client.query(`DELETE FROM "AgentToolGrant"`);
        await client.query(`DELETE FROM "AgentInstallation"`);
        await client.query(`DELETE FROM "AgentTemplateVersion"`);
        await client.query(`DELETE FROM "AgentTemplate"`);
        const loaded = await insertMissing(client, bundle, user);
        const flag = { ref: bundle.ref, resetAt: at, loaded, backupKey, reason };
        await client.query(`INSERT INTO "AgentSetting" (key, value, "updatedBy", "updatedAt") VALUES ($1, $2::jsonb, $3, NOW())
                            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`, [FLAG, J(flag), actorId(user)]);
        const summary = {
            removed: { templates: templates.rows.length, versions: versions.rows.length, installations: installations.rows.length, grants: grants.rows.length, approvalsExpired, tasksCancelled },
            loaded, ref: bundle.ref, backupKey,
        };
        await client.query(
            `INSERT INTO "AgentAuditLog" ("actorId", "actorRole", "entityType", "entityId", action, before, after) VALUES ($1, $2, 'registry', $3, 'catalog_reset', $4::jsonb, $5::jsonb)`,
            [actorId(user), user?.role || null, backupKey, J({ templates: templates.rows.map(t => ({ key: t.key, origin: t.origin, name: t.draft?.name || null })) }), J(summary)]);
        await client.query('COMMIT');
        return summary;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/** Agrega lo que falte del repositorio. No borra ni pisa nada. */
export async function syncAgencyCatalog(user) {
    await ensureAgentCenterSchema();
    const bundle = await loadBundle();
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('agent-center:agency-catalog'))`);
        const added = await insertMissing(client, bundle, user);
        const prev = (await client.query(`SELECT value FROM "AgentSetting" WHERE key = $1`, [FLAG])).rows[0]?.value || {};
        await client.query(`INSERT INTO "AgentSetting" (key, value, "updatedBy", "updatedAt") VALUES ($1, $2::jsonb, $3, NOW())
                            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`,
            [FLAG, J({ ...prev, ref: bundle.ref, syncedAt: new Date().toISOString() }), actorId(user)]);
        if (added) await client.query(`INSERT INTO "AgentAuditLog" ("actorId", "actorRole", "entityType", action, after) VALUES ($1, $2, 'registry', 'catalog_synced', $3::jsonb)`, [actorId(user), user?.role || null, J({ added, ref: bundle.ref })]);
        await client.query('COMMIT');
        return { added, ref: bundle.ref };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/**
 * La primera vez que la plataforma abre el registro tras v4.1323: restablece.
 * Después, si cambió el commit fijado, sólo sincroniza.
 */
export async function agencyCatalogOnce(user) {
    await ensureAgentCenterSchema();
    const flag = (await db.query(`SELECT value FROM "AgentSetting" WHERE key = $1`, [FLAG])).rows[0]?.value || null;
    if (!flag?.resetAt) return resetToAgencyCatalog(user, { reason: 'auto' });
    if (flag.ref !== AGENCY_SOURCE.ref) return syncAgencyCatalog(user);
    return null;
}
