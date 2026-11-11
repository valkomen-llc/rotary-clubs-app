// ═══════════════════════════════════════════════════════════
// AI Agent Command Center — observabilidad: EL CRITERIO (v4.1318.0)
// PURO. Qué es una alerta, cuándo se abre y cuándo se resuelve sola, y cómo se
// leen los presupuestos de plataforma, sitio e instalación.
// ═══════════════════════════════════════════════════════════

export const ALERT_KINDS = {
    budget_warning: { label: 'Presupuesto al 80 %', severity: 'medium' },
    budget_exhausted: { label: 'Presupuesto agotado', severity: 'high' },
    error_rate: { label: 'Muchas ejecuciones fallidas', severity: 'high' },
    dead_tasks: { label: 'Tareas fallidas definitivamente', severity: 'medium' },
    expired_approvals: { label: 'Aprobaciones vencidas sin decisión', severity: 'low' },
    provider_failure: { label: 'Un proveedor de IA rechaza las llamadas', severity: 'high' },
    stalled_tasks: { label: 'Tareas trabadas', severity: 'medium' },
};

export const BUDGET_WARNING_RATIO = 0.8;
export const ERROR_RATE_THRESHOLD = 0.2;
export const ERROR_RATE_MIN_RUNS = 5;

/** Sanea los presupuestos guardados (USD por mes). */
export function sanitizeBudgets(input = {}, base = {}) {
    const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : null; };
    const out = { platformMonthlyUsd: base.platformMonthlyUsd ?? null, sites: { ...(base.sites || {}) } };
    if ('platformMonthlyUsd' in input) out.platformMonthlyUsd = num(input.platformMonthlyUsd);
    if (input.sites && typeof input.sites === 'object') {
        for (const [k, v] of Object.entries(input.sites)) {
            const n = num(v);
            if (n == null) delete out.sites[String(k)]; else out.sites[String(k)] = n;
        }
    }
    return out;
}

/** ¿Se puede gastar? El primer tope alcanzado (instalación, sitio, plataforma) manda. */
export function budgetDecision(checks = []) {
    for (const c of checks) {
        if (c.limit && c.spent >= c.limit) return { ok: false, scope: c.scope, reason: `Presupuesto mensual ${c.label} agotado (${c.spent.toFixed(2)} de ${c.limit.toFixed(2)} USD).` };
    }
    return { ok: true };
}

/**
 * De los HECHOS a las alertas. Cada una con `dedupeKey`: una sola abierta por
 * condición; si la condición desaparece, la alerta se resuelve sola.
 */
export function evaluateAlerts(f = {}) {
    const out = [];
    for (const b of f.budgets || []) {
        if (!b.limit) continue;
        const ratio = b.spent / b.limit;
        if (ratio >= 1) out.push({ kind: 'budget_exhausted', dedupeKey: `budget:${b.scope}:${b.key}`, siteId: b.siteId || null, installationId: b.installationId || null, message: `Presupuesto ${b.label} agotado: ${b.spent.toFixed(2)} de ${b.limit.toFixed(2)} USD este mes.` });
        else if (ratio >= BUDGET_WARNING_RATIO) out.push({ kind: 'budget_warning', dedupeKey: `budget:${b.scope}:${b.key}`, siteId: b.siteId || null, installationId: b.installationId || null, message: `Presupuesto ${b.label} al ${Math.round(ratio * 100)} %: ${b.spent.toFixed(2)} de ${b.limit.toFixed(2)} USD.` });
    }
    for (const e of f.errorRates || []) {
        if (e.runs >= ERROR_RATE_MIN_RUNS && e.failed / e.runs > ERROR_RATE_THRESHOLD) {
            out.push({ kind: 'error_rate', dedupeKey: `errors:${e.installationId}`, siteId: e.siteId || null, installationId: e.installationId, message: `${e.agentName || 'Un agente'}: ${e.failed} de ${e.runs} ejecuciones fallaron en la última hora.` });
        }
    }
    if ((f.deadTasks || 0) > 0) out.push({ kind: 'dead_tasks', dedupeKey: 'dead_tasks', message: `${f.deadTasks} tareas fallaron definitivamente en las últimas 24 horas.` });
    if ((f.expiredApprovals || 0) > 0) out.push({ kind: 'expired_approvals', dedupeKey: 'expired_approvals', message: `${f.expiredApprovals} aprobaciones vencieron sin decisión en las últimas 24 horas.` });
    for (const p of f.providerFailures || []) {
        out.push({ kind: 'provider_failure', dedupeKey: `provider:${p.provider}:${p.model}`, message: `${p.model}: ${p.n} llamadas rechazadas en la última hora. ${String(p.sample || '').slice(0, 200)}` });
    }
    if ((f.stalledTasks || 0) > 0) out.push({ kind: 'stalled_tasks', dedupeKey: 'stalled_tasks', message: `${f.stalledTasks} tareas llevan más de 10 minutos con el lease vencido.` });
    return out.map(a => ({ ...a, severity: ALERT_KINDS[a.kind].severity }));
}

/** Un error de proveedor que indica un problema de CUENTA (no del prompt). */
export function isAccountError(msg = '') {
    return /\b(401|403)\b|credencial|API key|facturaci|billing|quota|cuota|dunning|deshabilitada/i.test(String(msg));
}
