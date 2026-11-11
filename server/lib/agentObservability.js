// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — observabilidad (v4.1318.0)
//
// Presupuestos de PLATAFORMA y de SITIO (además del de cada instalación), una
// bandeja de ALERTAS que se abren y se resuelven solas según los hechos, y la
// ANALÍTICA de rendimiento por agente, por workflow y por sitio. El criterio
// vive en `agentObservabilitySpec.js`.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAgentCenterSchema } from './ensureAgentCenterSchema.js';
import { RegistryError, audit } from './agentRegistryStore.js';
import { monthSpendUsd } from './aiUsage.js';
import { sanitizeBudgets, budgetDecision, evaluateAlerts, isAccountError, ALERT_KINDS } from './agentObservabilitySpec.js';

const J = (v) => JSON.stringify(v ?? null);

// ── Presupuestos ───────────────────────────────────────────────────────
export async function getBudgets() {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT value FROM "AgentSetting" WHERE key = 'budgets'`);
    return sanitizeBudgets({}, rows[0]?.value || {});
}

export async function saveBudgets(input, user) {
    const before = await getBudgets();
    const after = sanitizeBudgets(input, before);
    await db.query(`INSERT INTO "AgentSetting" (key, value, "updatedBy", "updatedAt") VALUES ('budgets', $1::jsonb, $2, NOW())
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`, [J(after), user?.id || null]);
    await audit(user, { entityType: 'setting', entityId: 'budgets', action: 'setting_changed', before, after });
    return after;
}

async function platformMonthSpend() {
    const { rows } = await db.query(`SELECT COALESCE(SUM("costUsd"), 0)::float AS usd FROM "AiUsageEvent" WHERE "createdAt" >= date_trunc('month', NOW() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota'`).catch(() => ({ rows: [{ usd: 0 }] }));
    return Number(rows[0]?.usd || 0);
}

/** ¿Puede gastar esta instalación (y su sitio, y la plataforma)? */
export async function checkBudgets({ installation = null, siteId = null } = {}) {
    const budgets = await getBudgets();
    const checks = [];
    const instLimit = Number(installation?.budget?.monthlyUsd) || null;
    if (instLimit) checks.push({ scope: 'installation', label: 'del agente', limit: instLimit, spent: await monthSpendUsd({ installationId: installation.id }) });
    const sid = siteId || installation?.siteId || null;
    if (sid && budgets.sites[sid]) checks.push({ scope: 'site', label: 'del sitio', limit: budgets.sites[sid], spent: await monthSpendUsd({ siteId: sid }) });
    if (budgets.platformMonthlyUsd) checks.push({ scope: 'platform', label: 'de la plataforma', limit: budgets.platformMonthlyUsd, spent: await platformMonthSpend() });
    return budgetDecision(checks);
}

// ── Alertas ────────────────────────────────────────────────────────────
async function gatherFacts() {
    const budgets = await getBudgets();
    const facts = { budgets: [], errorRates: [], providerFailures: [] };
    if (budgets.platformMonthlyUsd) facts.budgets.push({ scope: 'platform', key: 'all', label: 'de la plataforma', limit: budgets.platformMonthlyUsd, spent: await platformMonthSpend() });
    for (const [siteId, limit] of Object.entries(budgets.sites)) facts.budgets.push({ scope: 'site', key: siteId, siteId, label: 'del sitio', limit, spent: await monthSpendUsd({ siteId }) });
    const inst = (await db.query(`SELECT i.id, i."siteId", i.budget FROM "AgentInstallation" i WHERE (i.budget->>'monthlyUsd') IS NOT NULL AND i.enabled`)).rows;
    for (const i of inst) facts.budgets.push({ scope: 'installation', key: i.id, installationId: i.id, siteId: i.siteId, label: 'del agente', limit: Number(i.budget.monthlyUsd), spent: await monthSpendUsd({ installationId: i.id }) });
    facts.errorRates = (await db.query(
        `SELECT r."installationId", i."siteId", t.draft->>'name' AS "agentName", COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE r.status = 'failed')::int AS failed
           FROM "AgentRun" r JOIN "AgentInstallation" i ON i.id = r."installationId" JOIN "AgentTemplate" t ON t.id = i."templateId"
          WHERE r."startedAt" > NOW() - INTERVAL '1 hour' GROUP BY r."installationId", i."siteId", t.draft->>'name'`)).rows;
    facts.deadTasks = (await db.query(`SELECT COUNT(*)::int AS n FROM "AgentTask" WHERE status = 'dead' AND "updatedAt" > NOW() - INTERVAL '24 hours'`)).rows[0].n;
    facts.expiredApprovals = (await db.query(`SELECT COUNT(*)::int AS n FROM "AgentApproval" WHERE status = 'expired' AND "expiresAt" > NOW() - INTERVAL '24 hours'`)).rows[0].n;
    facts.stalledTasks = (await db.query(`SELECT COUNT(*)::int AS n FROM "AgentTask" WHERE status = 'running' AND "leaseUntil" < NOW() - INTERVAL '10 minutes'`)).rows[0].n;
    const fails = (await db.query(`SELECT provider, model, error FROM "AiUsageEvent" WHERE NOT ok AND "createdAt" > NOW() - INTERVAL '1 hour' ORDER BY "createdAt" DESC LIMIT 500`).catch(() => ({ rows: [] }))).rows;
    const byModel = new Map();
    for (const f of fails.filter(x => isAccountError(x.error))) {
        const k = `${f.provider}|${f.model}`;
        const cur = byModel.get(k) || { provider: f.provider, model: f.model, n: 0, sample: f.error };
        cur.n++; byModel.set(k, cur);
    }
    facts.providerFailures = [...byModel.values()].filter(p => p.n >= 3);
    return facts;
}

/** Abre las alertas nuevas y resuelve solas las que ya no se cumplen. */
export async function computeAlerts() {
    await ensureAgentCenterSchema();
    const alerts = evaluateAlerts(await gatherFacts());
    const keys = alerts.map(a => a.dedupeKey);
    let opened = 0;
    for (const a of alerts) {
        const r = await db.query(
            `INSERT INTO "AgentAlert" (kind, severity, "dedupeKey", "siteId", "installationId", message)
             SELECT $1, $2, $3, $4, $5, $6 WHERE NOT EXISTS (SELECT 1 FROM "AgentAlert" WHERE "dedupeKey" = $3 AND status IN ('open', 'acknowledged'))
             RETURNING id`, [a.kind, a.severity, a.dedupeKey, a.siteId, a.installationId, a.message]);
        if (r.rows[0]) opened++;
        else await db.query(`UPDATE "AgentAlert" SET message = $2, kind = $3, severity = $4, "lastSeenAt" = NOW() WHERE "dedupeKey" = $1 AND status IN ('open', 'acknowledged')`, [a.dedupeKey, a.message, a.kind, a.severity]);
    }
    const resolved = await db.query(
        `UPDATE "AgentAlert" SET status = 'resolved', "resolvedAt" = NOW(), "resolvedBy" = 'sistema'
          WHERE status IN ('open', 'acknowledged') AND NOT ("dedupeKey" = ANY($1)) RETURNING id`, [keys]);
    return { open: alerts.length, opened, autoResolved: resolved.rowCount };
}

export async function listAlerts({ status = 'open', siteId = null, limit = 100 } = {}) {
    await ensureAgentCenterSchema();
    const where = []; const params = [];
    if (status === 'open') where.push(`a.status IN ('open', 'acknowledged')`); else if (status) { params.push(status); where.push(`a.status = $${params.length}`); }
    if (siteId) { params.push(String(siteId)); where.push(`a."siteId" = $${params.length}`); }
    params.push(Math.min(300, limit));
    const { rows } = await db.query(
        `SELECT a.*, c.name AS "siteName" FROM "AgentAlert" a LEFT JOIN "Club" c ON c.id::text = a."siteId"
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE a.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a."createdAt" DESC LIMIT $${params.length}`, params);
    return rows.map(r => ({ ...r, label: ALERT_KINDS[r.kind]?.label || r.kind }));
}

export async function setAlertStatus(id, status, user) {
    if (!['acknowledged', 'resolved'].includes(status)) throw new RegistryError('Estado inválido.', 400);
    const { rows } = await db.query(
        `UPDATE "AgentAlert" SET status = $2, ${status === 'acknowledged' ? '"ackBy" = $3, "ackAt" = NOW()' : '"resolvedBy" = $3, "resolvedAt" = NOW()'}
          WHERE id = $1 AND status IN ('open', 'acknowledged') RETURNING *`, [String(id), status, user?.id || null]);
    if (!rows[0]) throw new RegistryError('Alerta no encontrada o ya resuelta.', 404);
    return rows[0];
}

// ── Analítica de rendimiento ───────────────────────────────────────────
export async function agentAnalytics({ days = 30, siteId = null } = {}) {
    await ensureAgentCenterSchema();
    const d = Math.min(366, Math.max(1, Number(days) || 30));
    const p = siteId ? [d, String(siteId)] : [d];
    const sw = siteId ? ` AND r."siteId" = $2` : '';
    const [byAgent, byWorkflow, bySite] = await Promise.all([
        db.query(`SELECT t.id AS "templateId", t.draft->>'name' AS agent, t.team, COUNT(r.id)::int AS runs,
                         COUNT(*) FILTER (WHERE r.status = 'succeeded')::int AS succeeded, COUNT(*) FILTER (WHERE r.status = 'failed')::int AS failed,
                         ROUND(AVG(EXTRACT(EPOCH FROM (r."finishedAt" - r."startedAt"))) FILTER (WHERE r."finishedAt" IS NOT NULL)::numeric, 1)::float AS "avgSeconds",
                         COALESCE(SUM(r."costUsd"), 0)::float AS "costUsd", COALESCE(SUM(r."inputTokens" + r."outputTokens"), 0)::bigint AS tokens,
                         COUNT(DISTINCT r."siteId")::int AS sites
                    FROM "AgentRun" r JOIN "AgentInstallation" i ON i.id = r."installationId" JOIN "AgentTemplate" t ON t.id = i."templateId"
                   WHERE r."startedAt" > NOW() - ($1::int * INTERVAL '1 day')${sw} GROUP BY t.id, t.draft->>'name', t.team ORDER BY runs DESC`, p),
        db.query(`SELECT w."workflowKey", COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE w.status = 'succeeded')::int AS succeeded, COUNT(*) FILTER (WHERE w.status = 'failed')::int AS failed,
                         COUNT(*) FILTER (WHERE w."aiSummary" IS NOT NULL)::int AS "withAi", COUNT(DISTINCT w."siteId")::int AS sites
                    FROM "AgentWorkflowRun" w WHERE w."startedAt" > NOW() - ($1::int * INTERVAL '1 day')${siteId ? ` AND w."siteId" = $2` : ''} GROUP BY w."workflowKey" ORDER BY runs DESC`, p),
        siteId ? Promise.resolve({ rows: [] }) : db.query(
            `SELECT r."siteId", c.name AS "siteName", COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE r.status = 'failed')::int AS failed, COALESCE(SUM(r."costUsd"), 0)::float AS "costUsd"
               FROM "AgentRun" r LEFT JOIN "Club" c ON c.id::text = r."siteId" WHERE r."startedAt" > NOW() - ($1::int * INTERVAL '1 day') GROUP BY r."siteId", c.name ORDER BY runs DESC LIMIT 50`, p),
    ]);
    const tot = byAgent.rows.reduce((a, r) => ({ runs: a.runs + r.runs, succeeded: a.succeeded + r.succeeded, failed: a.failed + r.failed, costUsd: a.costUsd + r.costUsd }), { runs: 0, succeeded: 0, failed: 0, costUsd: 0 });
    return { days: d, totals: { ...tot, successRate: tot.runs ? tot.succeeded / tot.runs : null }, byAgent: byAgent.rows.map(r => ({ ...r, tokens: Number(r.tokens) })), byWorkflow: byWorkflow.rows, bySite: bySite.rows };
}
