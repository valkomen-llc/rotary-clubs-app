// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — despliegues por oleadas (v4.1317.0)
//
// Reemplaza `POST /api/agents/deploy-all`. Un despliegue: plantillas (sueltas o
// una plantilla de equipo) × destino (tipos de sitio integrados o sitios) ×
// oleadas. Confirmar exige escribir el número de sitios. Cada oleada instala
// (apagado, salvo «activar con el primer administrador del sitio») y concede
// las herramientas que pide cada versión. Avanzar pasa por la compuerta de
// salud. Revertir APAGA lo que este despliegue instaló (no borra historial).
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAgentCenterSchema } from './ensureAgentCenterSchema.js';
import { RegistryError, audit, createInstallation, updateInstallation, listSiteTypePolicies } from './agentRegistryStore.js';
import { canonicalSiteType } from './agentRegistrySpec.js';
import { applyRequestedGrants } from './agentRuntimeStore.js';
import { planWaves, healthGate, validateRollout, confirmationOk, TEAM_PRESETS } from './agentRolloutSpec.js';

const J = (v) => JSON.stringify(v ?? null);
const actorId = (u) => u?.id || u?.userId || null;
const MANAGER_ORDER = ['district_admin', 'club_admin', 'administrator', 'superadmin', 'editor'];

async function knownTemplates() {
    const { rows } = await db.query(`SELECT id, key, status, level FROM "AgentTemplate" WHERE status = 'published'`);
    return rows;
}

/** Los sitios de destino: los de los tipos elegidos (sólo si están integrados) más los elegidos a mano. */
async function resolveTargets(n) {
    if (n.platform) return [];
    const policies = await listSiteTypePolicies();
    const enabledTypes = new Set(policies.filter(p => p.enabled).map(p => p.type));
    const types = n.siteTypes.filter(t => enabledTypes.has(t));
    const ids = new Set(n.siteIds);
    if (types.length) {
        const { rows } = await db.query(`SELECT id, type FROM "Club" WHERE COALESCE(status, 'active') = 'active'`);
        for (const r of rows) if (types.includes(canonicalSiteType(r.type))) ids.add(String(r.id));
    }
    return [...ids];
}

export async function previewRollout(input) {
    await ensureAgentCenterSchema();
    const tpls = await knownTemplates();
    const v = validateRollout(input, { knownTemplateKeys: tpls.map(t => t.key), knownSiteTypes: (await listSiteTypePolicies()).map(p => p.type) });
    const targets = v.ok ? await resolveTargets(v.normalized) : [];
    const waves = v.ok ? (v.normalized.platform ? [] : planWaves(targets, v.normalized.waves)) : [];
    return { ...v, targets: targets.length, waves: waves.map(w => w.length) };
}

export async function createRollout(input, user) {
    await ensureAgentCenterSchema();
    const tpls = await knownTemplates();
    const v = validateRollout(input, { knownTemplateKeys: tpls.map(t => t.key), knownSiteTypes: (await listSiteTypePolicies()).map(p => p.type) });
    if (!v.ok) throw new RegistryError(v.errors.join(' '), 400);
    const n = v.normalized;
    if (!n.templateKeys.length) throw new RegistryError(`Ninguna de las plantillas está publicada todavía: ${v.normalized.missingTemplates.join(', ')}.`, 409);
    const targets = await resolveTargets(n);
    if (!n.platform && !targets.length) throw new RegistryError('No hay sitios activos en el destino (¿los tipos elegidos están integrados en «Tipos de sitio»?).', 409);
    const waves = n.platform ? [] : planWaves(targets, n.waves);
    const { rows } = await db.query(
        `INSERT INTO "AgentRollout" (name, preset, "templateKeys", "siteTypes", "siteIds", platform, waves, "autoActivate", "totalWaves", "targetCount", notes, "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12) RETURNING *`,
        [n.name, n.preset, n.templateKeys, n.siteTypes, n.siteIds, n.platform, J(n.waves), n.autoActivate, n.platform ? 1 : waves.length, targets.length,
         v.normalized.missingTemplates.length ? `Sin publicar (no se despliegan): ${v.normalized.missingTemplates.join(', ')}` : null, actorId(user)]);
    const ro = rows[0];
    for (let w = 0; w < waves.length; w++) {
        for (const siteId of waves[w]) {
            await db.query(`INSERT INTO "AgentRolloutTarget" ("rolloutId", "siteId", wave) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [ro.id, siteId, w + 1]);
        }
    }
    await audit(user, { entityType: 'rollout', entityId: ro.id, action: 'rollout_created', after: { name: n.name, templates: n.templateKeys, targets: targets.length, waves: waves.map(x => x.length) } });
    return getRollout(ro.id);
}

export async function getRollout(id) {
    await ensureAgentCenterSchema();
    const ro = (await db.query(`SELECT * FROM "AgentRollout" WHERE id = $1`, [String(id)])).rows[0];
    if (!ro) throw new RegistryError('Despliegue no encontrado.', 404);
    const targets = (await db.query(
        `SELECT t.*, c.name AS "siteName", c.type AS "siteType" FROM "AgentRolloutTarget" t LEFT JOIN "Club" c ON c.id::text = t."siteId"
          WHERE t."rolloutId" = $1 ORDER BY t.wave, c.name`, [ro.id])).rows;
    const health = await rolloutHealth(ro.id);
    return { ...ro, targets, health };
}

export async function listRollouts() {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(
        `SELECT r.*, (SELECT COUNT(*)::int FROM "AgentRolloutTarget" t WHERE t."rolloutId" = r.id AND t.status = 'installed') AS installed
           FROM "AgentRollout" r ORDER BY r."createdAt" DESC LIMIT 100`);
    return rows;
}

async function rolloutHealth(rolloutId) {
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE r.status = 'failed')::int AS failed
           FROM "AgentRun" r JOIN "AgentInstallation" i ON i.id = r."installationId" WHERE i."rolloutId" = $1`, [rolloutId]).catch(() => ({ rows: [{ runs: 0, failed: 0 }] }));
    const h = rows[0] || { runs: 0, failed: 0 };
    return { ...h, gate: healthGate(h) };
}

async function firstManager(siteId) {
    const { rows } = await db.query(`SELECT id, role FROM "User" WHERE "clubId" = $1 AND role = ANY($2)`, [String(siteId), MANAGER_ORDER]);
    rows.sort((a, b) => MANAGER_ORDER.indexOf(a.role) - MANAGER_ORDER.indexOf(b.role));
    return rows[0]?.id || null;
}

/** Instala las plantillas del despliegue en UN sitio (o en la plataforma). */
async function installInScope(ro, siteId, user) {
    const created = []; const skipped = []; const errors = [];
    const { rows: tpls } = await db.query(`SELECT id, key FROM "AgentTemplate" WHERE key = ANY($1) AND status = 'published'`, [ro.templateKeys]);
    const responsible = ro.autoActivate && siteId ? await firstManager(siteId) : null;
    for (const t of tpls) {
        try {
            const inst = await createInstallation({ templateId: t.id, scopeType: siteId ? 'site' : 'platform', siteId, enabled: false, rolloutId: ro.id }, user);
            await applyRequestedGrants(inst.id, user).catch(() => {});
            if (!siteId || responsible) await updateInstallation(inst.id, { ...(responsible ? { responsibleUserId: responsible } : {}), enabled: Boolean(ro.autoActivate) || !siteId }, user).catch(() => {});
            created.push(inst.id);
        } catch (e) {
            if (/ya está instalado/.test(e.message)) skipped.push(t.key); else errors.push(`${t.key}: ${e.message}`);
        }
    }
    return { created, skipped, errors };
}

/** Despliega la oleada siguiente. La primera exige la confirmación. */
export async function advanceRollout(id, { confirmCount = null, force = false } = {}, user) {
    const ro = await getRollout(id);
    if (['completed', 'rolled_back'].includes(ro.status)) throw new RegistryError(`El despliegue está «${ro.status}».`, 409);
    if (ro.status === 'draft' && !confirmationOk({ targets: ro.targetCount, confirmCount })) {
        throw new RegistryError(`Para confirmar, escribe el número de sitios del despliegue (${ro.targetCount}).`, 400);
    }
    if (ro.status !== 'draft' && !force && !ro.health.gate.ok) {
        await db.query(`UPDATE "AgentRollout" SET status = 'paused', "updatedAt" = NOW() WHERE id = $1`, [ro.id]);
        await audit(user, { entityType: 'rollout', entityId: ro.id, action: 'rollout_paused', after: { reason: ro.health.gate.reason } });
        throw new RegistryError(`Despliegue pausado: ${ro.health.gate.reason}`, 409);
    }
    const wave = ro.currentWave + 1;
    const summary = { wave, created: 0, skipped: 0, errors: [] };
    if (ro.platform) {
        const r = await installInScope(ro, null, user);
        summary.created += r.created.length; summary.skipped += r.skipped.length; summary.errors.push(...r.errors);
    } else {
        const { rows: targets } = await db.query(`SELECT * FROM "AgentRolloutTarget" WHERE "rolloutId" = $1 AND wave = $2 AND status = 'pending'`, [ro.id, wave]);
        for (const t of targets) {
            const r = await installInScope(ro, t.siteId, user);
            summary.created += r.created.length; summary.skipped += r.skipped.length; summary.errors.push(...r.errors.map(e => `${t.siteId}: ${e}`));
            await db.query(`UPDATE "AgentRolloutTarget" SET status = $2, "installationIds" = $3, reason = $4, "updatedAt" = NOW() WHERE id = $1`,
                [t.id, r.errors.length && !r.created.length ? 'failed' : 'installed', r.created, r.errors.join(' | ') || (r.skipped.length ? `Ya tenía: ${r.skipped.join(', ')}` : null)]);
        }
    }
    const done = wave >= ro.totalWaves;
    await db.query(`UPDATE "AgentRollout" SET "currentWave" = $2, status = $3, "updatedAt" = NOW() WHERE id = $1`, [ro.id, wave, done ? 'completed' : 'running']);
    await audit(user, { entityType: 'rollout', entityId: ro.id, action: 'rollout_wave', after: summary });
    return { ...(await getRollout(ro.id)), lastWave: summary };
}

export async function pauseRollout(id, user) {
    const ro = await getRollout(id);
    if (ro.status !== 'running') throw new RegistryError('Sólo se pausa un despliegue en oleadas.', 409);
    await db.query(`UPDATE "AgentRollout" SET status = 'paused', "updatedAt" = NOW() WHERE id = $1`, [ro.id]);
    await audit(user, { entityType: 'rollout', entityId: ro.id, action: 'rollout_paused', after: { manual: true } });
    return getRollout(ro.id);
}

/** Revierte: APAGA lo que este despliegue instaló. El historial no se borra. */
export async function rollbackRollout(id, user) {
    const ro = await getRollout(id);
    if (ro.status === 'rolled_back') throw new RegistryError('Ya fue revertido.', 409);
    const { rows } = await db.query(`SELECT id FROM "AgentInstallation" WHERE "rolloutId" = $1`, [ro.id]);
    for (const r of rows) {
        await db.query(`UPDATE "AgentInstallation" SET enabled = false, "disabledReason" = $2, "updatedAt" = NOW() WHERE id = $1`, [r.id, `Despliegue «${ro.name}» revertido`]);
    }
    await db.query(`UPDATE "AgentRolloutTarget" SET status = 'rolled_back', "updatedAt" = NOW() WHERE "rolloutId" = $1 AND status = 'installed'`, [ro.id]);
    await db.query(`UPDATE "AgentRollout" SET status = 'rolled_back', "updatedAt" = NOW() WHERE id = $1`, [ro.id]);
    await audit(user, { entityType: 'rollout', entityId: ro.id, action: 'rollout_rolled_back', after: { installationsDisabled: rows.length } });
    return getRollout(ro.id);
}

export { TEAM_PRESETS };
