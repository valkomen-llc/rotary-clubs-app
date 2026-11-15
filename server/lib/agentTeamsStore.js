// ═══════════════════════════════════════════════════════════════════════
// Centro de Equipos de IA — acceso a la base (v4.1331.0)
//
// Todo lo que DECIDE vive en `agentTeamsSpec.js` (puro). Esto lee y escribe.
//
// ⚠️ EL ALCANCE LO DA LA SESIÓN. Cada función recibe `scope` = { platform,
// siteId } ya resuelto por la ruta (`req.acScope`): para un sitio, TODA
// consulta de instalaciones, tareas y ejecuciones filtra por su `siteId`, y un
// equipo oculto o no habilitado para su tipo de sitio responde 404. Nunca se
// lee un sitio del cuerpo ni de la consulta.
//
// RENDIMIENTO: el Resumen no carga fichas. Plantillas, tareas y ejecuciones
// se cuentan con consultas AGREGADAS; los agentes de un equipo se cargan al
// abrirlo, por páginas, y sin el prompt.
// ═══════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAgentCenterSchema } from './ensureAgentCenterSchema.js';
import { listInstallations, policyForSiteType, audit, RegistryError } from './agentRegistryStore.js';
import { canonicalSiteType, siteTypeAllows, TEAM_KEYS, AGENCY_DIVISIONS, INSTALLATION_STATES } from './agentRegistrySpec.js';
import { WORKFLOWS } from './agentRuntimeSpec.js';
import { CAPABILITIES, capabilityTeams, DIRECTOR_KEY } from './agentDirectorSpec.js';
import {
    TEAM_STATUS, TEAM_ICONS, MEMBERSHIP_KINDS, TEAM_AGENT_VIEWS, sanitizeTeamConfig, mergeTeamConfig, buildTeamCards,
    pageParams, bestState, membershipKind,
} from './agentTeamsSpec.js';
import { membershipCte, membershipParam, savedTeamConfig, invalidateTeamConfig, teamsEffective, TEAMS_SETTING_KEY } from './agentTeamMembership.js';

const PENDING_TASK_STATES = ['queued', 'running', 'waiting_approval'];
const actorId = (u) => u?.id || u?.userId || null;

/** El contexto del alcance: la plataforma, o UN sitio con su política. */
async function scopeContext(scope) {
    if (scope?.platform) return { platform: true, site: null, siteId: null, siteType: null, policy: null, allowsTeam: () => true };
    const siteId = String(scope?.siteId || '');
    if (!siteId) throw new RegistryError('Falta el sitio.', 400);
    const { rows } = await db.query(`SELECT id, name, type FROM "Club" WHERE id::text = $1`, [siteId]);
    if (!rows[0]) throw new RegistryError('Sitio no encontrado.', 404);
    const siteType = canonicalSiteType(rows[0].type);
    const policy = await policyForSiteType(siteType);
    return { platform: false, site: { id: String(rows[0].id), name: rows[0].name, type: rows[0].type }, siteId, siteType, policy, allowsTeam: (t) => siteTypeAllows(policy, t) };
}

/**
 * La condición «este agente está disponible para el sitio»: publicado, no
 * sólo-central, no propio de otro sitio, pensado para su tipo y con su equipo
 * PRINCIPAL permitido por la política (los mismos criterios de
 * `checkInstallable`). `p` = índice del primer parámetro: [siteId, siteType, equiposPermitidos].
 */
const availableForSiteSql = (p) => `(t.status = 'published' AND t.level <> 'platform'
    AND (t."ownerSiteId" IS NULL OR t."ownerSiteId" = $${p})
    AND (cardinality(t."allowedSiteTypes") = 0 OR $${p + 1} = ANY(t."allowedSiteTypes"))
    AND t.team = ANY($${p + 2}::text[]))`;

const allowedPrimaryTeams = (ctx) => (ctx.platform ? TEAM_KEYS : TEAM_KEYS.filter(k => ctx.policy?.enabled && ctx.allowsTeam(k)));

/** Plantillas por equipo: `published` en el catálogo y `available` para el alcance. */
async function templateCounts(ctx) {
    const params = [await membershipParam()];
    let availableExpr = `t.status = 'published'`;
    if (!ctx.platform) {
        params.push(ctx.siteId, ctx.siteType, allowedPrimaryTeams(ctx));
        availableExpr = availableForSiteSql(2);
    }
    const { rows } = await db.query(
        `WITH ${membershipCte(1)}
         SELECT tm.team,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'published')::int AS published,
                COUNT(DISTINCT t.id) FILTER (WHERE ${availableExpr})::int AS available
           FROM team_mem tm JOIN "AgentTemplate" t ON t.id = tm."templateId"
          WHERE t.key <> '${DIRECTOR_KEY}'
          GROUP BY tm.team`, params);
    return Object.fromEntries(rows.map(r => [r.team, { published: r.published, available: r.available }]));
}

/** Tareas pendientes, ejecuciones de 30 días y última ejecución, por equipo. */
async function activityCounts(ctx) {
    const params = [await membershipParam(), ctx.platform ? null : ctx.siteId];
    const [tasks, runs] = await Promise.all([
        db.query(
            `WITH ${membershipCte(1)}
             SELECT tm.team, COUNT(DISTINCT k.id)::int AS n
               FROM "AgentTask" k
               JOIN "AgentInstallation" i ON i.id = k."installationId"
               JOIN team_mem tm ON tm."templateId" = i."templateId"
              WHERE k.status = ANY($3) AND ($2::text IS NULL OR i."siteId" = $2)
              GROUP BY tm.team`, [...params, PENDING_TASK_STATES]),
        db.query(
            `WITH ${membershipCte(1)}
             SELECT tm.team,
                    COUNT(DISTINCT r.id) FILTER (WHERE r."startedAt" > NOW() - INTERVAL '30 days')::int AS runs,
                    COUNT(DISTINCT r.id) FILTER (WHERE r."startedAt" > NOW() - INTERVAL '30 days' AND r.status = 'failed')::int AS failed,
                    MAX(r."startedAt") AS last
               FROM "AgentRun" r
               JOIN "AgentInstallation" i ON i.id = r."installationId"
               JOIN team_mem tm ON tm."templateId" = i."templateId"
              WHERE ($2::text IS NULL OR i."siteId" = $2)
              GROUP BY tm.team`, params),
    ]);
    const out = {};
    for (const r of tasks.rows) (out[r.team] ||= {}).pendingTasks = r.n;
    for (const r of runs.rows) Object.assign((out[r.team] ||= {}), { runs30d: r.runs, failedRuns30d: r.failed, lastRunAt: r.last });
    return out;
}

/** Las instalaciones del alcance, sin la del Director (tiene su propia pestaña). */
async function scopedInstallations(ctx, extra = {}) {
    const list = await listInstallations({ ...extra, siteId: ctx.platform ? null : ctx.siteId });
    return list.filter(i => i.templateKey !== DIRECTOR_KEY);
}

/** Las tarjetas del Resumen para el alcance de la sesión. */
export async function teamsSummary(scope) {
    await ensureAgentCenterSchema();
    const ctx = await scopeContext(scope);
    const [teams, templates, installations, activity] = await Promise.all([
        teamsEffective(), templateCounts(ctx), scopedInstallations(ctx), activityCounts(ctx),
    ]);
    const cards = buildTeamCards({ teams, templates, installations, activity, allowsTeam: ctx.allowsTeam, platform: ctx.platform });
    return {
        scope: ctx.platform ? 'platform' : 'site',
        site: ctx.site,
        policy: ctx.policy ? { enabled: ctx.policy.enabled, allowedTeams: ctx.policy.allowedTeams || [] } : null,
        teams: cards,
        statuses: TEAM_STATUS,
    };
}

/** Las capacidades del Director y los workflows en los que trabaja un equipo. */
export function teamOperations(teamKey) {
    return {
        capabilities: CAPABILITIES.filter(c => capabilityTeams(c).includes(teamKey)).map(c => ({ key: c.key, label: c.label })),
        workflows: Object.values(WORKFLOWS).filter(w => w.team === teamKey).map(w => ({ key: w.key, label: w.label })),
    };
}

/**
 * La vista de un equipo: encabezado, indicadores, capacidades y el registro
 * PAGINADO de sus agentes con su estado en el alcance de la sesión.
 */
export async function teamDetail(teamKey, scope, { page, pageSize, q = '', view = 'all' } = {}) {
    await ensureAgentCenterSchema();
    const ctx = await scopeContext(scope);
    const teams = await teamsEffective();
    const team = teams.find(t => t.key === teamKey);
    if (!team) throw new RegistryError('Equipo no encontrado.', 404);
    // Un sitio no ve equipos ocultos ni los que su tipo de sitio no trabaja.
    if (!ctx.platform && (!team.visible || !ctx.allowsTeam(team.key))) throw new RegistryError('Equipo no encontrado.', 404);

    const summary = await teamsSummary(scope);
    const card = summary.teams.find(t => t.key === team.key);
    const { page: pg, pageSize: size, offset } = pageParams({ page, pageSize });
    const v = TEAM_AGENT_VIEWS[view] ? view : 'all';

    const params = [await membershipParam(), team.key];
    const where = [`t.key <> '${DIRECTOR_KEY}'`];
    let instScope = '';
    if (!ctx.platform) {
        params.push(ctx.siteId);
        instScope = ` AND i."siteId" = $${params.length}`;
        params.push(ctx.siteType, allowedPrimaryTeams(ctx));
        // Un sitio ve lo que tiene instalado y lo que está disponible para él.
        where.push(`(EXISTS (SELECT 1 FROM "AgentInstallation" i WHERE i."templateId" = t.id${instScope}) OR ${availableForSiteSql(params.length - 2)})`);
    }
    if (v === 'installed') where.push(`EXISTS (SELECT 1 FROM "AgentInstallation" i WHERE i."templateId" = t.id${instScope})`);
    if (v === 'not_installed') where.push(`NOT EXISTS (SELECT 1 FROM "AgentInstallation" i WHERE i."templateId" = t.id${instScope})`);
    const term = String(q || '').trim().toLowerCase().slice(0, 80);
    if (term) {
        params.push(`%${term}%`);
        where.push(`(LOWER(t.draft->>'name') LIKE $${params.length} OR LOWER(t.draft->>'role') LIKE $${params.length} OR LOWER(t.key) LIKE $${params.length})`);
    }
    params.push(size, offset);
    const { rows } = await db.query(
        `WITH ${membershipCte(1)},
         pick AS (SELECT DISTINCT "templateId" FROM team_mem WHERE team = $2)
         SELECT t.id, t.key, t.team, t.status, t.level, t.origin, t."avatarSeed", t."avatarColor",
                t."sourceRef"->>'division' AS division, t."sourceRef"->>'emoji' AS emoji,
                t.draft->>'name' AS name, t.draft->>'role' AS role, LEFT(t.draft->>'description', 600) AS description,
                v.version AS "currentVersion",
                ARRAY(SELECT DISTINCT tm.team FROM team_mem tm WHERE tm."templateId" = t.id) AS teams,
                ARRAY(SELECT DISTINCT tm.kind FROM team_mem tm WHERE tm."templateId" = t.id AND tm.team = $2) AS kinds,
                (SELECT COUNT(*)::int FROM "AgentInstallation" i WHERE i."templateId" = t.id${instScope}) AS "installCount",
                COUNT(*) OVER()::int AS total
           FROM "AgentTemplate" t
           JOIN pick ON pick."templateId" = t.id
           LEFT JOIN "AgentTemplateVersion" v ON v.id = t."currentVersionId"
          WHERE ${where.join(' AND ')}
          ORDER BY "installCount" DESC, (t.team = $2) DESC, t.draft->>'name'
          LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

    const total = rows[0]?.total || 0;
    const ids = rows.map(r => r.id);
    const installations = ids.length ? await scopedInstallations(ctx, { templateIds: ids }) : [];
    const instIds = installations.map(i => i.id);
    const [grants, lastRuns] = instIds.length ? await Promise.all([
        db.query(`SELECT "installationId", tool, mode FROM "AgentToolGrant" WHERE "installationId" = ANY($1) ORDER BY tool`, [instIds]).then(r => r.rows),
        db.query(`SELECT DISTINCT ON ("installationId") "installationId", status, "startedAt" FROM "AgentRun" WHERE "installationId" = ANY($1) ORDER BY "installationId", "startedAt" DESC`, [instIds]).then(r => r.rows),
    ]) : [[], []];
    const runOf = new Map(lastRuns.map(r => [r.installationId, r]));

    const agents = rows.map(r => {
        const mine = installations.filter(i => i.templateId === r.id);
        const tools = [...new Set(grants.filter(g => mine.some(i => i.id === g.installationId)).map(g => g.tool))];
        const runs = mine.map(i => runOf.get(i.id)).filter(Boolean).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
        const manualTeams = (r.kinds || []).includes('manual') ? [team.key] : [];
        const divisionTeams = (r.kinds || []).includes('division') ? { [team.key]: [r.division] } : {};
        return {
            id: r.id, key: r.key, name: r.name || r.key, role: r.role || '', description: r.description || '', emoji: r.emoji || null,
            avatarSeed: r.avatarSeed, avatarColor: r.avatarColor, status: r.status, level: r.level, origin: r.origin,
            currentVersion: r.currentVersion,
            division: r.division || null, divisionLabel: r.division ? (AGENCY_DIVISIONS[r.division] || r.division) : null,
            primaryTeam: r.team,
            teams: [r.team, ...(r.teams || []).filter(k => k !== r.team)],
            membership: membershipKind({ team: r.team, division: r.division, manualTeams, divisionTeams }, team.key),
            installCount: r.installCount,
            state: mine.length ? bestState(mine.map(i => i.state)) : 'available',
            tools,
            lastRun: runs[0] ? { at: runs[0].startedAt, status: runs[0].status } : null,
            // Sólo lo que la sesión puede ver: para un sitio, su propia instalación.
            installations: mine.slice(0, 25).map(i => ({
                id: i.id, scopeType: i.scopeType, siteId: i.siteId, siteName: i.siteName, siteType: i.siteType,
                enabled: i.enabled, state: i.state, stateReason: i.stateReason, toolCount: i.toolCount || 0,
                responsibleUserId: i.responsibleUserId, lastRunAt: runOf.get(i.id)?.startedAt || null, lastRunStatus: runOf.get(i.id)?.status || null,
            })),
            moreInstallations: Math.max(0, mine.length - 25),
        };
    });

    return {
        scope: ctx.platform ? 'platform' : 'site',
        site: ctx.site,
        team: { ...team, status: card?.status || null, allowed: ctx.allowsTeam(team.key) },
        counts: card || null,
        ...teamOperations(team.key),
        agents, page: pg, pageSize: size, total, view: v, q: term,
        views: TEAM_AGENT_VIEWS, membershipKinds: MEMBERSHIP_KINDS, installationStates: INSTALLATION_STATES,
        icons: TEAM_ICONS, divisions: AGENCY_DIVISIONS,
    };
}

/** Configura un equipo (sólo la plataforma: la ruta lo exige). */
export async function saveTeamConfig(teamKey, input, user) {
    await ensureAgentCenterSchema();
    if (!TEAM_KEYS.includes(teamKey)) throw new RegistryError('Equipo no encontrado.', 404);
    const { value, errors } = sanitizeTeamConfig(input || {});
    if (errors.length) throw new RegistryError(errors.join(' '), 400);
    const saved = await savedTeamConfig({ fresh: true });
    const before = saved[teamKey] || {};
    const after = mergeTeamConfig(before, value);
    await db.query(
        `INSERT INTO "AgentSetting" (key, value, "updatedBy", "updatedAt") VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = "AgentSetting".value || EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`,
        [TEAMS_SETTING_KEY, JSON.stringify({ [teamKey]: after }), actorId(user)]);
    invalidateTeamConfig();
    await audit(user, { entityType: 'team', entityId: teamKey, action: 'team_config_changed', before, after });
    return (await teamsEffective({ fresh: true })).find(t => t.key === teamKey);
}

/**
 * Asocia o quita agentes de un equipo, SIN copiarlos. El equipo principal de
 * un agente no se quita desde aquí (se cambia en su ficha). Asociar no da
 * permisos: lo dice la política del equipo principal y la concesión de
 * herramientas de cada instalación.
 */
export const MEMBERS_PER_CALL = 200;
export async function setTeamMembers(teamKey, { add = [], remove = [] } = {}, user) {
    await ensureAgentCenterSchema();
    if (!TEAM_KEYS.includes(teamKey)) throw new RegistryError('Equipo no encontrado.', 404);
    const addIds = [...new Set((Array.isArray(add) ? add : []).map(String))];
    const removeIds = [...new Set((Array.isArray(remove) ? remove : []).map(String))];
    if (addIds.length + removeIds.length > MEMBERS_PER_CALL) throw new RegistryError(`Máximo ${MEMBERS_PER_CALL} agentes por cambio.`, 400);
    const found = addIds.length ? (await db.query(`SELECT id, team FROM "AgentTemplate" WHERE id = ANY($1)`, [addIds])).rows : [];
    const primary = found.filter(t => t.team === teamKey).map(t => t.id);
    const toAdd = found.filter(t => t.team !== teamKey).map(t => t.id);
    const unknown = addIds.filter(id => !found.some(t => t.id === id));
    let added = 0;
    if (toAdd.length) {
        const r = await db.query(
            `INSERT INTO "AgentTeamMember" ("templateId", team, "createdBy")
             SELECT x, $2, $3 FROM unnest($1::text[]) AS x ON CONFLICT DO NOTHING`, [toAdd, teamKey, actorId(user)]);
        added = r.rowCount || 0;
    }
    const removed = removeIds.length ? ((await db.query(`DELETE FROM "AgentTeamMember" WHERE team = $1 AND "templateId" = ANY($2)`, [teamKey, removeIds])).rowCount || 0) : 0;
    if (added || removed) await audit(user, { entityType: 'team', entityId: teamKey, action: 'team_members_changed', after: { added: toAdd, removed: removeIds } });
    return { added, removed, alreadyPrimary: primary.length, unknown: unknown.length };
}

export default { teamsSummary, teamDetail, teamOperations, saveTeamConfig, setTeamMembers };
