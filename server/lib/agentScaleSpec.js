// ═══════════════════════════════════════════════════════════
// AI Agent Command Center — piloto y escalamiento: EL CRITERIO (v4.1319.0)
//
// PURO. Tres cosas:
//   1. El CONSTRUCTOR VISUAL de workflows: qué es una definición válida
//      (pasos lineales, sin bucles, topes), cómo se resuelven sus plantillas
//      {{input.x}} / {{steps.N.campo}} y qué riesgo puede tener cada paso.
//   2. Las MÉTRICAS DEL PILOTO a partir de ejecuciones, opiniones de quien
//      revisa, consumo y aprobaciones.
//   3. El workflow 5, MEMBRESÍA, con cifras AGREGADAS: nunca un perfil de una
//      persona ni una decisión sobre ella.
// ═══════════════════════════════════════════════════════════

import { toolByKey } from './agentRuntimeSpec.js';

// ── 1. Constructor visual ──────────────────────────────────────────────
export const STEP_TYPES = {
    tool: { label: 'Herramienta', help: 'Ejecuta una herramienta de lectura o borrador (N0/N1).' },
    agent: { label: 'Agente', help: 'Un agente instalado en el sitio redacta o analiza con lo anterior.' },
    stop_if_empty: { label: 'Condición', help: 'Termina el workflow si el valor indicado está vacío o es cero.' },
    approval: { label: 'Aprobación humana', help: 'Propone una acción N2/N3; una persona decide.' },
};
export const MAX_STEPS = 12;
export const CUSTOM_PREFIX = 'custom:';

/** Lee `a.b.0.c` dentro de un objeto. Puro. */
export function readPath(obj, path) {
    return String(path || '').split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Reemplaza {{input.x}} y {{steps.N.campo}} en textos (y en objetos, recursivo). */
export function resolveTemplate(value, ctx) {
    if (typeof value === 'string') {
        return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, p) => {
            const v = readPath(ctx, p);
            if (v == null) return '';
            return typeof v === 'string' ? v : JSON.stringify(v);
        });
    }
    if (Array.isArray(value)) return value.map(v => resolveTemplate(v, ctx));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTemplate(v, ctx)]));
    return value;
}

/** ¿Está vacío para «stop_if_empty»? 0, '', [], {} , null. */
export function isEmptyValue(v) {
    if (v == null) return true;
    if (typeof v === 'number') return v === 0;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
}

/**
 * Valida una definición del constructor. Devuelve { ok, errors, steps }.
 * Reglas: entre 1 y 12 pasos; herramienta directa SÓLO N0/N1; una acción N2/N3
 * SÓLO dentro de un paso de aprobación; una referencia {{steps.N}} sólo a un
 * paso ANTERIOR (no hay bucles ni saltos hacia atrás); el disparo es manual,
 * una programación válida o un evento conocido.
 */
export function validateDefinition(def = {}, { templateKeys = [], cadenceOk = () => true, eventTypes = [] } = {}) {
    const errors = [];
    const steps = Array.isArray(def.steps) ? def.steps.slice(0, MAX_STEPS + 1) : [];
    if (!steps.length) errors.push('Agrega al menos un paso.');
    if (steps.length > MAX_STEPS) errors.push(`Máximo ${MAX_STEPS} pasos.`);
    const trig = def.trigger || { kind: 'manual' };
    if (!['manual', 'schedule', 'event'].includes(trig.kind)) errors.push('Disparo desconocido.');
    if (trig.kind === 'schedule' && !cadenceOk(trig.cadence)) errors.push('La programación no es válida.');
    if (trig.kind === 'event' && !eventTypes.includes(trig.event)) errors.push('El evento no existe.');
    const clean = steps.slice(0, MAX_STEPS).map((s, i) => {
        const n = i + 1;
        const type = s?.type;
        if (!STEP_TYPES[type]) { errors.push(`Paso ${n}: tipo desconocido.`); return null; }
        const refs = JSON.stringify(s).match(/\{\{\s*steps\.(\d+)/g) || [];
        for (const r of refs) { const k = Number(r.replace(/\D+/g, '')); if (!(k >= 1 && k < n)) errors.push(`Paso ${n}: sólo puede usar resultados de pasos anteriores (usa {{steps.${k}}}).`); }
        if (type === 'tool') {
            const t = toolByKey(s.tool);
            if (!t) errors.push(`Paso ${n}: herramienta desconocida.`);
            else if (!['N0', 'N1'].includes(t.risk)) errors.push(`Paso ${n}: «${t.key}» es ${t.risk}; va dentro de un paso de aprobación.`);
            else if (t.key === 'delegate_task') errors.push(`Paso ${n}: la delegación no está disponible en el constructor.`);
            return { type, tool: s.tool, args: s.args && typeof s.args === 'object' ? s.args : {}, label: String(s.label || '').slice(0, 120) };
        }
        if (type === 'agent') {
            if (!templateKeys.includes(s.templateKey)) errors.push(`Paso ${n}: el agente no existe o no está publicado.`);
            if (String(s.prompt || '').trim().length < 10) errors.push(`Paso ${n}: escribe qué debe hacer el agente.`);
            return { type, templateKey: s.templateKey, prompt: String(s.prompt || '').slice(0, 4000), label: String(s.label || '').slice(0, 120) };
        }
        if (type === 'stop_if_empty') {
            if (!/^steps\.\d+(\.[a-zA-Z0-9_]+)*$/.test(String(s.path || ''))) errors.push(`Paso ${n}: indica qué valor mirar (p. ej. steps.1.findings).`);
            else { const k = Number(String(s.path).split('.')[1]); if (!(k >= 1 && k < n)) errors.push(`Paso ${n}: la condición mira un paso anterior.`); }
            return { type, path: String(s.path || ''), label: String(s.label || '').slice(0, 120) };
        }
        const t = toolByKey(s.tool);
        if (!t) errors.push(`Paso ${n}: herramienta desconocida.`);
        else if (!['N2', 'N3'].includes(t.risk)) errors.push(`Paso ${n}: una aprobación es para acciones N2/N3; «${t.key}» es ${t.risk}.`);
        return { type, tool: s.tool, args: s.args && typeof s.args === 'object' ? s.args : {}, summary: String(s.summary || '').slice(0, 300), label: String(s.label || '').slice(0, 120) };
    }).filter(Boolean);
    return { ok: errors.length === 0, errors, steps: clean, trigger: trig };
}

// ── 2. Métricas del piloto ─────────────────────────────────────────────
export const FEEDBACK_VERDICTS = { useful: 'Útil', not_useful: 'No útil', false_positive: 'Falso positivo' };

export const PILOT_STATES = { planned: 'Planeado', active: 'En curso', finished: 'Terminado' };
export const RUN_REF = 'run';

/**
 * Los hallazgos CALIFICABLES de un informe, con una referencia estable para
 * guardar la opinión de quien revisa. Todo informe admite además la
 * calificación del informe completo (`run`). Puro.
 */
export function findingsOf(report) {
    if (!report || typeof report !== 'object') return [];
    const out = [];
    const push = (ref, label, severity = null) => out.push({ ref: String(ref).slice(0, 200), label: String(label || '').slice(0, 300), severity });
    switch (report.kind) {
        case 'event_registration_review':
            for (const e of report.events || []) (e.findings || []).forEach((f, i) => push(`reg:${e.eventId}:${f.source || ''}:${f.registrationId || i}:${f.kind}`, `${f.kind} · ${f.evidence || ''}`, f.severity));
            break;
        case 'fair_submission_review':
            for (const s of report.submissions || []) if ((s.missing || []).length || (s.issues || []).length) push(`sub:${s.ref || s.id}`, `${s.ref || s.id}: ${[...(s.missing || []).map(m => m.label), ...(s.issues || []).map(x => x.evidence)].join('; ')}`, (s.issues || []).length ? 'medium' : 'low');
            break;
        case 'finance_review':
            for (const f of report.findings || []) push(`fin:${f.kind}:${f.ref}`, `${f.kind} · ${f.evidence || ''}`, f.severity || null);
            break;
        case 'site_audit':
        case 'membership_review':
            for (const f of report.findings || []) push(`${report.kind === 'site_audit' ? 'site' : 'mem'}:${f.area}:${String(f.finding || '').slice(0, 60)}`, f.finding, f.severity);
            break;
        case 'district_report':
            for (const name of report.quietClubs || []) push(`quiet:${name}`, `Sin noticias ni eventos: ${name}`, 'low');
            break;
        default:
    }
    return out;
}

/** Cuántos hallazgos tiene un informe (para listados y métricas). */
export const findingsCount = (report) => findingsOf(report).length;

/**
 * `runs` = ejecuciones de workflow del piloto, `feedback` = opiniones de quien
 * revisó, `costUsd` = consumo de los sitios del piloto, `approvals` =
 * decisiones. `minutesPerFinding` = cuánto tarda una persona en encontrar a
 * mano cada hallazgo (lo declara el comité del piloto).
 */
export function pilotMetrics({ runs = [], feedback = [], costUsd = 0, approvals = [], sites = 0, minutesPerFinding = 5 } = {}) {
    const ok = runs.filter(r => r.status === 'succeeded');
    const findings = ok.reduce((a, r) => a + (Number(r.findings) || 0), 0);
    const fb = { useful: 0, not_useful: 0, false_positive: 0 };
    for (const f of feedback) if (fb[f.verdict] != null) fb[f.verdict]++;
    const rated = fb.useful + fb.not_useful + fb.false_positive;
    const decided = approvals.filter(a => ['executed', 'rejected', 'failed'].includes(a.status));
    return {
        runs: runs.length,
        successRate: runs.length ? ok.length / runs.length : null,
        findings,
        rated,
        usefulRate: rated ? fb.useful / rated : null,
        falsePositiveRate: rated ? fb.false_positive / rated : null,
        estimatedMinutesSaved: Math.round(fb.useful * minutesPerFinding),
        costUsd: Math.round(costUsd * 100) / 100,
        costPerSite: sites ? Math.round((costUsd / sites) * 100) / 100 : null,
        approvalsDecided: decided.length,
        approvalsRejectedRate: decided.length ? decided.filter(a => a.status === 'rejected').length / decided.length : null,
    };
}

/** ¿Pasa el piloto? Umbrales que el plan propone; el comité decide. */
export function pilotVerdict(m, { minUseful = 0.6, maxFalsePositive = 0.2, minRated = 20 } = {}) {
    if (m.rated < minRated) return { status: 'insufficient', reason: `Faltan opiniones: ${m.rated} de ${minRated} hallazgos calificados.` };
    if (m.usefulRate >= minUseful && m.falsePositiveRate <= maxFalsePositive) return { status: 'pass', reason: `${Math.round(m.usefulRate * 100)} % útiles y ${Math.round(m.falsePositiveRate * 100)} % falsos positivos.` };
    return { status: 'review', reason: `${Math.round((m.usefulRate || 0) * 100)} % útiles (meta ${minUseful * 100} %) y ${Math.round((m.falsePositiveRate || 0) * 100)} % falsos positivos (tope ${maxFalsePositive * 100} %).` };
}

// ── 3. Workflow 5: membresía (AGREGADA) ────────────────────────────────
/**
 * Cifras agregadas de los socios de UN sitio. Nunca nombres en el resultado:
 * la membresía es de las personas, y las decisiones sobre ellas, de la junta.
 */
export function reviewMembership(rows = [], now = new Date()) {
    const d90 = now.getTime() - 90 * 86400_000;
    const active = rows.filter(r => r.isActive !== false);
    const board = active.filter(r => r.isBoard);
    const roles = [...new Set(board.map(r => String(r.boardRole || '').trim()).filter(Boolean))];
    const metrics = {
        total: rows.length,
        active: active.length,
        inactive: rows.length - active.length,
        honorary: rows.filter(r => r.isHonorary).length,
        board: board.length,
        boardRoles: roles.length,
        newLast90: rows.filter(r => r.createdAt && new Date(r.createdAt).getTime() >= d90).length,
        deactivatedLast90: rows.filter(r => r.isActive === false && r.updatedAt && new Date(r.updatedAt).getTime() >= d90).length,
        withoutPhoto: active.filter(r => !r.image).length,
        withoutDescription: active.filter(r => !String(r.description || '').trim()).length,
    };
    const findings = [];
    if (metrics.total === 0) findings.push({ severity: 'medium', area: 'datos', finding: 'El sitio no tiene socios cargados.', action: 'Cargar la lista de socios en «Socios y Junta Directiva».' });
    if (metrics.active > 0 && metrics.board === 0) findings.push({ severity: 'medium', area: 'junta', finding: 'No hay junta directiva cargada.', action: 'Registrar la junta del período.' });
    if (metrics.deactivatedLast90 > metrics.newLast90 && metrics.deactivatedLast90 > 0) findings.push({ severity: 'medium', area: 'tendencia', finding: `En 90 días salieron ${metrics.deactivatedLast90} y entraron ${metrics.newLast90}.`, action: 'Revisar en junta acciones de retención y de invitación.' });
    if (metrics.active > 0 && metrics.withoutPhoto / metrics.active > 0.5) findings.push({ severity: 'low', area: 'perfil', finding: `${metrics.withoutPhoto} de ${metrics.active} socios activos sin foto.`, action: 'Completar los perfiles públicos (con autorización de cada socio).' });
    return { metrics, findings, aggregatedOnly: true };
}
