// ═══════════════════════════════════════════════════════════════════════
// Centro de Equipos de IA — configuración y pertenencia (v4.1331.0)
//
// Pieza CHICA a propósito: la importan el registro (listInstallations), el
// runtime (quién redacta el resumen de un workflow) y el Director, y no
// importa ninguno de ellos (sin ciclos).
//
// Pertenencia de un agente a un equipo = su equipo PRINCIPAL
// (`AgentTemplate.team`) ∪ los que se le asocian a mano ("AgentTeamMember") ∪
// los que le llegan por su categoría de origen (la división de The Agency
// asociada al equipo en su configuración). Una consulta, sin copias.
// ═══════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAgentCenterSchema } from './ensureAgentCenterSchema.js';
import { effectiveTeams, divisionsByTeam } from './agentTeamsSpec.js';

export const TEAMS_SETTING_KEY = 'teams';
const TTL_MS = 30_000;
let cache = { at: 0, saved: null };

/** La configuración GUARDADA de los equipos (`{ [team]: config }`). */
export async function savedTeamConfig({ fresh = false } = {}) {
    if (!fresh && cache.saved && Date.now() - cache.at < TTL_MS) return cache.saved;
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT value FROM "AgentSetting" WHERE key = $1`, [TEAMS_SETTING_KEY]);
    const saved = rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {};
    cache = { at: Date.now(), saved };
    return saved;
}

export function invalidateTeamConfig() { cache = { at: 0, saved: null }; }

/** Los ocho equipos efectivos (perfil + configuración), en su orden. */
export async function teamsEffective(opts) {
    return effectiveTeams(await savedTeamConfig(opts));
}

/** El parámetro JSON que necesita `membershipCte`. */
export async function membershipParam() {
    return JSON.stringify(divisionsByTeam(await teamsEffective()));
}

/**
 * Las CTE `team_div` y `team_mem` ("templateId", team, kind). `$n` es el
 * parámetro de `membershipParam()`. Va después de un `WITH`.
 *   kind: 'primary' | 'manual' | 'division'
 * Un agente puede aparecer dos veces en el mismo equipo (a mano y por su
 * categoría): quien cuente usa DISTINCT.
 */
export function membershipCte(n) {
    return `team_div AS (
            SELECT c.key AS team, d.division
              FROM jsonb_each($${n}::jsonb) c
              CROSS JOIN LATERAL jsonb_array_elements_text(c.value) AS d(division)
        ),
        team_mem AS (
            SELECT t.id AS "templateId", t.team, 'primary'::text AS kind FROM "AgentTemplate" t
            UNION ALL
            SELECT m."templateId", m.team, 'manual'::text FROM "AgentTeamMember" m
              JOIN "AgentTemplate" t ON t.id = m."templateId" AND t.team <> m.team
            UNION ALL
            SELECT t.id, td.team, 'division'::text FROM "AgentTemplate" t
              JOIN team_div td ON td.division = t."sourceRef"->>'division' AND t.team <> td.team
        )`;
}

export default { savedTeamConfig, invalidateTeamConfig, teamsEffective, membershipParam, membershipCte, TEAMS_SETTING_KEY };
