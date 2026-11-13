// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Dirección IA (v4.1329.0)
//
// Director de Inteligencia y Operaciones Rotarias: el administrador escribe un
// objetivo, el Director arma un plan verificable (pasos sobre workflows y
// lecturas que YA existen), una persona lo aprueba, los pasos se ejecutan uno
// a uno y el entregable queda para revisión humana.
//
// Cada componente vive a nivel de módulo (nunca dentro de otro) y todos los
// hooks van arriba, antes de cualquier return.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrainCircuit, Send, Save, Play, CheckCircle2, XCircle, RotateCcw, Ban, FileText, Users, Wrench, Database, Wallet, Clock, AlertTriangle, ExternalLink, ChevronRight, ShieldCheck, ListChecks } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta, Site } from './agentCenterApi';
import { ErrorNote, EmptyNote, Kpi, SectionHeader, StatePill, fmtDate } from './agentCenterUi';
import SitePicker from './SitePicker';

// ── Tipos ───────────────────────────────────────────────────────────
interface PlanStep {
    id: string; seq: number; capability: string; kind: 'workflow' | 'tool' | 'handoff'; label: string; team: string;
    workflowKey: string | null; tool: string | null; href: string | null; risk: string; ai: boolean;
    agent: { installationId: string; name: string } | null; tools: { key: string; risk: string | null }[]; dependsOn: string[];
    status: string; summary?: { headline: string; findings: number; items: { ref: string | null; title: string | null; detail: string[] }[] } | null;
    workflowRunId?: string | null; aiSummary?: string | null; aiNote?: string | null; error?: string | null; latencyMs?: number; attempt?: number;
}
interface PlanBody {
    objective: string; interpreted: string[]; clarify: string[]; context: { siteName: string | null; siteType: string | null };
    scope: string; deliverables: string[]; steps: PlanStep[]; teams: string[];
    specialists: { team: string; capability: string; installed: { installationId: string; name: string; state: string; enabled: boolean }[]; suggested: { templateId: string; key: string; name: string; role: string }[] }[];
    sources: { id: string; name: string; scope: string; memories: number | null }[];
    tools: { key: string; risk: string | null }[]; risks: string[];
    approvals: { at: string; label: string; who: string }[];
    cost: { estimated: boolean; calls: number; usd: number | null; note: string; tokens: { input: number; output: number } };
    blockers: string[]; warnings: string[];
    directorRead?: { text: string | null; note: string | null; model?: string };
}
interface Deliverable {
    title: string; generatedAt: string; objective: string; organization: string | null; headline: string; totalFindings: number;
    pendingHuman: string[]; costUsd: number | null; disclaimer: string;
    sections: { step: string; label: string; kind: string; status: string; headline: string; findings: number; items: { ref: string | null; title: string | null; detail: string[] }[]; aiSummary: string | null; aiNote: string | null; source: { type: string; id?: string; key?: string; href?: string } | null; error: string | null }[];
}
interface Plan {
    id: string; siteId: string; siteName?: string; objective: string; status: string; stateLabel: string; plan: PlanBody;
    deliverable: Deliverable | null; history: { at: string; action: string; by: string | null; role: string | null; note?: string; step?: string; reason?: string }[];
    costUsd: number; error: string | null; createdAt: string; updatedAt: string; decidedBy: string | null; previousPlanId: string | null;
}
interface PlanRow { id: string; objective: string; status: string; stateLabel: string; siteName: string; costUsd: number; createdAt: string; interpreted: string[] | null; stepCount: number; stepsDone: number }
interface Overview {
    site: { id: string; name: string; type: string; siteType: string } | null;
    template: { id: string; status: string } | null;
    planStates: Record<string, { label: string; help: string }>;
    quickActions: { key: string; label: string; text: string }[];
    policy?: { enabled: boolean; allowedTeams: string[] };
    director?: { installed: boolean; installationId: string | null; enabled: boolean; state: string; stateLabel: string; reason: string; tools: { tool: string; mode: string }[]; model: string | null; responsibleUserId: string | null };
    teams?: { key: string; label: string; allowed: boolean; installed: number; operational: number; catalog: number }[];
    operationalAgents?: { id: string; name: string; team: string; state: string }[];
    installedAgents?: number;
    knowledge?: { id: string; name: string; scope: string; memories: number | null }[];
    workflows?: { key: string; label: string; team: string }[];
    budget?: { siteMonthlyUsd: number | null; platformMonthlyUsd: number | null; spentThisMonthUsd: number };
    killSwitch?: boolean;
    plans?: Record<string, number>;
    lastActivity?: { id: string; objective: string; status: string; updatedAt: string } | null;
}

const HISTORY_LABELS: Record<string, string> = {
    created: 'Plan generado', submitted: 'Enviado a aprobación', approved: 'Plan aprobado', changes_requested: 'Cambios solicitados',
    cancelled: 'Cancelado', step_started: 'Paso iniciado', step_done: 'Paso terminado', step_failed: 'Paso falló', step_handoff: 'Paso para una persona',
    step_retry: 'Reintento', budget_blocked: 'Frenado', review_ready: 'Entregable listo', completed: 'Revisado y cerrado',
};
const PLAN_CHIP: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 border-gray-200', pending_approval: 'bg-amber-50 text-amber-700 border-amber-200',
    changes_requested: 'bg-orange-50 text-orange-700 border-orange-200', approved: 'bg-blue-50 text-blue-700 border-blue-200',
    running: 'bg-violet-50 text-violet-700 border-violet-200', needs_attention: 'bg-red-50 text-red-700 border-red-200',
    review: 'bg-sky-50 text-sky-700 border-sky-200', completed: 'bg-emerald-50 text-emerald-700 border-emerald-200', cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};
const STEP_CHIP: Record<string, string> = {
    pending: 'text-gray-500 bg-gray-50', running: 'text-violet-700 bg-violet-50', done: 'text-emerald-700 bg-emerald-50',
    failed: 'text-red-700 bg-red-50', handoff: 'text-amber-700 bg-amber-50', skipped: 'text-gray-400 bg-gray-50',
};
const STEP_LABEL: Record<string, string> = { pending: 'Pendiente', running: 'Ejecutándose', done: 'Hecho', failed: 'Falló', handoff: 'Para una persona', skipped: 'Omitido' };
const KIND_LABEL: Record<string, string> = { workflow: 'Workflow', tool: 'Lectura', handoff: 'Trabajo humano' };
const btn = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300';
const btnPrimary = `${btn} bg-rotary-blue text-white border-rotary-blue hover:bg-blue-800`;
const btnGhost = `${btn} bg-white text-gray-700 border-gray-200 hover:border-gray-300`;
const card = 'bg-white rounded-2xl border border-gray-100 p-5';
const usd = (v: number | null | undefined) => (v == null ? '—' : `US$ ${Number(v).toFixed(v < 1 ? 4 : 2)}`);

function PlanChip({ status, label }: { status: string; label: string }) {
    return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${PLAN_CHIP[status] || PLAN_CHIP.draft}`}>{label}</span>;
}

function Block({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-1.5"><Icon className="w-3.5 h-3.5" />{title}</p>
            <div className="text-sm text-gray-700">{children}</div>
        </div>
    );
}

// ── Panel del Director ──────────────────────────────────────────────
function DirectorPanel({ ov, platform, busy, onTemplate, onInstall, onNavigate }: { ov: Overview; platform: boolean; busy: boolean; onTemplate: () => void; onInstall: () => void; onNavigate: (s: string) => void }) {
    const d = ov.director;
    if (!ov.site || !d) return null;
    const operational = ov.operationalAgents || [];
    const budgetLimit = ov.budget?.siteMonthlyUsd ?? null;
    return (
        <div className={card}>
            <div className="flex flex-wrap items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <BrainCircuit className="w-6 h-6 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Director IA — {ov.site.name}</p>
                    <h3 className="text-lg font-black text-gray-800">Director de Inteligencia y Operaciones Rotarias</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        <StatePill state={d.state} title={d.reason} />
                        {d.reason && <span className="text-xs text-gray-500">{d.reason}</span>}
                        {ov.killSwitch && <span className="text-xs font-bold text-red-600">Interruptor general activado</span>}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {platform && !ov.template && <button type="button" className={btnPrimary} disabled={busy} onClick={onTemplate}>Crear la plantilla del Director</button>}
                    {platform && ov.template && !d.installed && <button type="button" className={btnPrimary} disabled={busy} onClick={onInstall}>Instalar en esta organización</button>}
                    {d.installed && !['active', 'running'].includes(d.state) && (
                        <button type="button" className={btnGhost} onClick={() => onNavigate('instalaciones')}>Elegir responsable y encender <ChevronRight className="w-4 h-4" /></button>
                    )}
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
                <Block icon={ShieldCheck} title="Organización">{ov.site.name}<span className="block text-xs text-gray-400">{ov.site.siteType}{ov.policy && !ov.policy.enabled ? ' · tipo de sitio sin integrar' : ''}</span></Block>
                <Block icon={BrainCircuit} title="Modelo de IA">{d.model || '—'}<span className="block text-xs text-gray-400">Sólo redacta la lectura del objetivo</span></Block>
                <Block icon={Wrench} title="Herramientas habilitadas">{d.tools.length ? d.tools.map(t => t.tool).join(', ') : 'Ninguna'}<span className="block text-xs text-gray-400">Todas de lectura (N0)</span></Block>
                <Block icon={Database} title="Conocimiento conectado">{(ov.knowledge || []).length ? (ov.knowledge || []).map(k => `${k.name} (${k.scope}${k.memories != null ? `, ${k.memories}` : ''})`).join(' · ') : 'Sin cerebros: ver Conocimiento'}</Block>
                <Block icon={Users} title="Agentes operativos">{operational.length ? operational.map(a => a.name).join(', ') : 'Ninguno encendido'}<span className="block text-xs text-gray-400">{ov.installedAgents || 0} instalados en la organización</span></Block>
                <Block icon={ListChecks} title="Workflows disponibles">{(ov.workflows || []).length}<span className="block text-xs text-gray-400">{(ov.workflows || []).map(w => w.label).slice(0, 3).join(' · ')}{(ov.workflows || []).length > 3 ? '…' : ''}</span></Block>
                <Block icon={Wallet} title="Presupuesto del mes">{usd(ov.budget?.spentThisMonthUsd)} gastado<span className="block text-xs text-gray-400">{budgetLimit ? `Tope del sitio ${usd(budgetLimit)}` : 'Sin tope propio del sitio'}{ov.budget?.platformMonthlyUsd ? ` · plataforma ${usd(ov.budget.platformMonthlyUsd)}` : ''}</span></Block>
                <Block icon={Clock} title="Última actividad">{ov.lastActivity ? <>{fmtDate(ov.lastActivity.updatedAt)}<span className="block text-xs text-gray-400 truncate">{ov.lastActivity.objective}</span></> : 'Sin planes todavía'}</Block>
            </div>
            {ov.teams && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                    {ov.teams.map(t => (
                        <span key={t.key} title={t.allowed ? `${t.catalog} en el catálogo · ${t.installed} instalados` : 'No permitido para este tipo de sitio'}
                            className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${t.allowed ? (t.operational ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-gray-50 text-gray-600 border-gray-100') : 'bg-white text-gray-300 border-dashed border-gray-200 line-through'}`}>
                            {t.label}{t.allowed ? ` · ${t.operational}` : ''}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Consola de objetivos ────────────────────────────────────────────
function ObjectiveConsole({ quickActions, text, onText, forced, onForced, busy, onCreate }: { quickActions: Overview['quickActions']; text: string; onText: (t: string) => void; forced: string[]; onForced: (k: string[]) => void; busy: boolean; onCreate: (asDraft: boolean) => void }) {
    return (
        <div className={card}>
            <label htmlFor="director-objective" className="block text-base font-black text-gray-800">¿Qué necesitas planificar, analizar o ejecutar en tu organización rotaria?</label>
            <p className="text-xs text-gray-500 mt-0.5">El Director arma un plan con los equipos y workflows disponibles. Nada se ejecuta hasta que una persona lo aprueba.</p>
            <textarea id="director-objective" value={text} onChange={e => { onText(e.target.value); if (forced.length) onForced([]); }} rows={4} maxLength={4000}
                className="mt-3 w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Ej.: Necesito analizar todos los proyectos postulados a la feria, identificar datos faltantes y preparar un resumen para el comité organizador." />
            <div className="flex flex-wrap gap-1.5 mt-2">
                {quickActions.map(q => (
                    <button key={q.key} type="button" onClick={() => { onText(q.text); onForced([q.key]); }}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${forced.includes(q.key) ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                        {q.label}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-4">
                <button type="button" className={btnGhost} disabled={busy || text.trim().length < 15} onClick={() => onCreate(true)}><Save className="w-4 h-4" />Guardar borrador</button>
                <button type="button" className={btnPrimary} disabled={busy || text.trim().length < 15} onClick={() => onCreate(false)}><Send className="w-4 h-4" />{busy ? 'Preparando el plan…' : 'Generar plan'}</button>
            </div>
        </div>
    );
}

// ── Plan ────────────────────────────────────────────────────────────
function StepRow({ step, meta }: { step: PlanStep; meta: Meta }) {
    const team = meta.teams.find(t => t.key === step.team)?.label || step.team;
    return (
        <li className="border border-gray-100 rounded-xl p-3.5">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-gray-400 tabular-nums">{step.seq}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">{KIND_LABEL[step.kind]}</span>
                <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">{step.risk}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STEP_CHIP[step.status] || STEP_CHIP.pending}`}>{STEP_LABEL[step.status] || step.status}</span>
                {step.attempt && step.attempt > 1 && <span className="text-[11px] text-gray-400">intento {step.attempt}</span>}
            </div>
            <p className="text-sm font-semibold text-gray-800 mt-1.5">{step.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">
                Equipo {team}
                {step.agent ? ` · redacta ${step.agent.name}` : step.kind === 'workflow' ? ' · sin especialista encendido: sin resumen con IA' : ''}
                {step.tools.length ? ` · ${step.tools.map(t => t.key).join(', ')}` : ''}
                {step.dependsOn.length ? ` · después de ${step.dependsOn.join(', ')}` : ''}
            </p>
            {step.summary && <p className="text-sm text-gray-700 mt-2">{step.summary.headline}</p>}
            {step.error && <p className="text-sm text-red-600 mt-2">{step.error}</p>}
            {step.kind === 'handoff' && step.href && (
                <a href={step.href} className="inline-flex items-center gap-1 text-xs font-semibold text-rotary-blue mt-2 hover:underline">Abrir el módulo <ExternalLink className="w-3.5 h-3.5" /></a>
            )}
        </li>
    );
}

function PlanView({ plan, meta, busy, running, onDecide, onRun, onRedo }: { plan: Plan; meta: Meta; busy: boolean; running: boolean; onDecide: (decision: string, note?: string) => void; onRun: () => void; onRedo: (p: Plan) => void }) {
    const [note, setNote] = useState('');
    const p = plan.plan;
    const can = (s: string[]) => s.includes(plan.status);
    return (
        <div className="space-y-4">
            <div className={card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Plan de trabajo · {plan.siteName || p.context.siteName}</p>
                        <h3 className="text-lg font-black text-gray-800">{p.interpreted.length ? p.interpreted.join(' + ') : 'Objetivo sin interpretar'}</h3>
                        <p className="text-sm text-gray-500 mt-1">«{plan.objective}»</p>
                    </div>
                    <PlanChip status={plan.status} label={plan.stateLabel} />
                </div>

                {p.blockers.length > 0 && (
                    <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 space-y-1">
                        {p.blockers.map(b => <p key={b} className="flex gap-2"><Ban className="w-4 h-4 shrink-0 mt-0.5" />{b}</p>)}
                    </div>
                )}
                {p.warnings.length > 0 && (
                    <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 space-y-1">
                        {p.warnings.map(w => <p key={w} className="flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{w}</p>)}
                    </div>
                )}
                {p.clarify.length > 0 && (
                    <ul className="mt-3 list-disc pl-5 text-sm text-gray-700 space-y-1">{p.clarify.map(q => <li key={q}>{q}</li>)}</ul>
                )}
                {plan.error && <p className="mt-3 text-sm text-red-600">{plan.error}</p>}

                {p.directorRead && (
                    <div className="mt-4 bg-orange-50/60 border border-orange-100 rounded-xl p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-600 mb-1">Lectura del Director</p>
                        {p.directorRead.text ? <p className="text-sm text-gray-700 whitespace-pre-line">{p.directorRead.text}</p> : null}
                        {p.directorRead.note && <p className="text-xs text-gray-500 mt-1">{p.directorRead.note}</p>}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mt-5">
                    <Block icon={ShieldCheck} title="Alcance">{p.scope}</Block>
                    <Block icon={FileText} title="Entregables"><ul className="list-disc pl-4 space-y-0.5">{p.deliverables.map(d => <li key={d}>{d}</li>)}</ul></Block>
                    <Block icon={Wallet} title="Costo de IA">{p.cost.usd != null ? `≈ ${usd(p.cost.usd)}` : '—'} · {p.cost.calls} llamadas<span className="block text-xs text-gray-400">{p.cost.note}{plan.costUsd > 0 ? ` Real hasta ahora: ${usd(plan.costUsd)}.` : ''}</span></Block>
                    <Block icon={Database} title="Fuentes">{p.sources.length ? p.sources.map(s => `${s.name} (${s.scope})`).join(' · ') : 'Datos de los módulos de la organización; sin cerebros conectados.'}</Block>
                    <Block icon={Wrench} title="Herramientas">{p.tools.map(t => `${t.key} (${t.risk || '—'})`).join(', ') || '—'}</Block>
                    <Block icon={CheckCircle2} title="Aprobaciones"><ul className="list-disc pl-4 space-y-0.5">{p.approvals.map(a => <li key={`${a.at}-${a.label}`}>{a.label} <span className="text-gray-400">— {a.who}</span></li>)}</ul></Block>
                </div>

                <div className="mt-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-2">Pasos y dependencias</p>
                    <ol className="space-y-2">{p.steps.map(s => <StepRow key={s.id} step={s} meta={meta} />)}</ol>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                    <Block icon={Users} title="Equipos y agentes">
                        <ul className="space-y-1.5">
                            {p.specialists.map(s => (
                                <li key={`${s.capability}-${s.team}`}>
                                    <span className="font-semibold">{meta.teams.find(t => t.key === s.team)?.label || s.team}:</span>{' '}
                                    {s.installed.length ? s.installed.map(i => `${i.name}${i.enabled ? '' : ' (apagado)'}`).join(', ') : 'ninguno instalado'}
                                    {s.suggested.length > 0 && <span className="block text-xs text-gray-400">Del catálogo: {s.suggested.map(t => t.name).join(', ')}</span>}
                                </li>
                            ))}
                        </ul>
                    </Block>
                    <Block icon={AlertTriangle} title="Riesgos y límites"><ul className="list-disc pl-4 space-y-0.5">{p.risks.map(r => <li key={r}>{r}</li>)}</ul></Block>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
                    {can(['pending_approval', 'draft', 'review', 'needs_attention', 'approved']) && (
                        <input aria-label="Nota de la decisión" value={note} onChange={e => setNote(e.target.value)} maxLength={1000}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Nota (obligatoria para solicitar cambios)" />
                    )}
                    <div className="flex flex-wrap gap-2">
                        {can(['draft']) && <button type="button" className={btnPrimary} disabled={busy} onClick={() => onDecide('submit', note)}><Send className="w-4 h-4" />Enviar a aprobación</button>}
                        {can(['pending_approval']) && <button type="button" className={btnPrimary} disabled={busy} onClick={() => onDecide('approve', note)}><CheckCircle2 className="w-4 h-4" />Aprobar plan</button>}
                        {can(['pending_approval']) && <button type="button" className={btnGhost} disabled={busy || note.trim().length < 5} onClick={() => onDecide('request_changes', note)}><RotateCcw className="w-4 h-4" />Solicitar cambios</button>}
                        {can(['approved', 'running']) && <button type="button" className={btnPrimary} disabled={busy || running} onClick={onRun}><Play className="w-4 h-4" />{running ? 'Ejecutando…' : 'Ejecutar ahora'}</button>}
                        {can(['needs_attention']) && <button type="button" className={btnPrimary} disabled={busy} onClick={() => onDecide('retry', note)}><RotateCcw className="w-4 h-4" />Reintentar</button>}
                        {can(['review']) && <button type="button" className={btnPrimary} disabled={busy} onClick={() => onDecide('close', note)}><CheckCircle2 className="w-4 h-4" />Marcar revisado y cerrar</button>}
                        {can(['changes_requested', 'cancelled', 'completed']) && <button type="button" className={btnGhost} onClick={() => onRedo(plan)}><RotateCcw className="w-4 h-4" />Rehacer con este objetivo</button>}
                        {can(['draft', 'pending_approval', 'approved', 'running', 'needs_attention', 'review']) && <button type="button" className={btnGhost} disabled={busy} onClick={() => onDecide('cancel', note)}><XCircle className="w-4 h-4" />Cancelar</button>}
                    </div>
                    {can(['approved', 'running']) && <p className="text-xs text-gray-400">Si cierras esta pantalla, el ciclo automático sigue ejecutando un paso por minuto.</p>}
                </div>
            </div>

            {plan.deliverable && <DeliverableView d={plan.deliverable} />}
            <HistoryView history={plan.history} />
        </div>
    );
}

function DeliverableView({ d }: { d: Deliverable }) {
    return (
        <div className={card}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Centro de entregables</p>
            <h3 className="text-lg font-black text-gray-800">{d.title}</h3>
            <p className="text-sm text-gray-600 mt-0.5">{d.headline} {d.costUsd != null ? `Costo de IA: ${usd(d.costUsd)}.` : ''}</p>
            <p className="text-xs text-gray-400 mt-1">{d.disclaimer}</p>
            <div className="space-y-4 mt-4">
                {d.sections.map(s => (
                    <section key={s.step} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-black text-gray-800">{s.label}</h4>
                            {s.source?.type === 'workflow_run' && <a href="?s=workflows" className="text-xs font-semibold text-rotary-blue hover:underline">Ver el informe completo en Workflows</a>}
                            {s.source?.type === 'module' && s.source.href && <a href={s.source.href} className="text-xs font-semibold text-rotary-blue hover:underline inline-flex items-center gap-1">Abrir el módulo <ExternalLink className="w-3.5 h-3.5" /></a>}
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{s.headline}</p>
                        {s.error && <p className="text-sm text-red-600 mt-1">{s.error}</p>}
                        {s.aiSummary && (
                            <div className="mt-3 bg-gray-50 rounded-xl p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-1">Resumen del especialista (borrador)</p>
                                <p className="text-sm text-gray-700 whitespace-pre-line">{s.aiSummary}</p>
                            </div>
                        )}
                        {!s.aiSummary && s.aiNote && <p className="text-xs text-gray-400 mt-1">{s.aiNote}</p>}
                        {s.items.length > 0 && (
                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-400"><th className="py-1.5 pr-3 font-bold">Referencia</th><th className="py-1.5 pr-3 font-bold">Detalle</th></tr></thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {s.items.map((it, i) => (
                                            <tr key={`${it.ref}-${i}`} className="align-top">
                                                <td className="py-2 pr-3 whitespace-nowrap"><span className="font-mono text-xs text-gray-600">{it.ref || '—'}</span>{it.title && <span className="block text-xs text-gray-500 max-w-[14rem] truncate">{it.title}</span>}</td>
                                                <td className="py-2 pr-3"><ul className="space-y-0.5">{it.detail.map((x, j) => <li key={j} className="text-gray-700">{x}</li>)}</ul></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                ))}
            </div>
            {d.pendingHuman.length > 0 && (
                <div className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="font-semibold">Queda para una persona:</p>
                    <ul className="list-disc pl-5">{d.pendingHuman.map(h => <li key={h}>{h}</li>)}</ul>
                </div>
            )}
        </div>
    );
}

function HistoryView({ history }: { history: Plan['history'] }) {
    return (
        <div className={card}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-2">Historial de decisiones</p>
            <ol className="space-y-1.5">
                {history.map((h, i) => (
                    <li key={i} className="text-sm text-gray-700 flex flex-wrap gap-x-2">
                        <span className="text-xs text-gray-400 tabular-nums">{fmtDate(h.at)}</span>
                        <span className="font-semibold">{HISTORY_LABELS[h.action] || h.action}</span>
                        {h.step && <span className="text-gray-500">({h.step})</span>}
                        {h.role && <span className="text-gray-400">· {h.role}</span>}
                        {h.note && <span className="text-gray-600">— {h.note}</span>}
                        {h.reason && <span className="text-red-600">— {h.reason}</span>}
                    </li>
                ))}
            </ol>
        </div>
    );
}

function PlansList({ plans, selected, onSelect }: { plans: PlanRow[]; selected: string | null; onSelect: (id: string) => void }) {
    if (!plans.length) return <EmptyNote>Todavía no hay planes. Escribe un objetivo arriba para empezar.</EmptyNote>;
    return (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {plans.map(p => (
                <button key={p.id} type="button" onClick={() => onSelect(p.id)}
                    className={`w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 transition-colors ${selected === p.id ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                    <div className="w-full sm:w-auto sm:flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{(p.interpreted || []).join(' + ') || 'Sin interpretar'}</p>
                        <p className="text-xs text-gray-500 truncate">{p.objective}</p>
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums">{p.stepsDone}/{p.stepCount} pasos</span>
                    <span className="text-xs text-gray-400">{fmtDate(p.createdAt)}</span>
                    <PlanChip status={p.status} label={p.stateLabel} />
                </button>
            ))}
        </div>
    );
}

// ── La pestaña ──────────────────────────────────────────────────────
export default function DirectorTab({ meta, onNavigate }: { meta: Meta; onNavigate: (s: string) => void }) {
    const platform = meta.scope === 'platform';
    const [siteId, setSiteId] = useState<string>(platform ? '' : (meta.siteId || ''));
    const [ov, setOv] = useState<Overview | null>(null);
    const [plans, setPlans] = useState<PlanRow[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [plan, setPlan] = useState<Plan | null>(null);
    const [text, setText] = useState('');
    const [forced, setForced] = useState<string[]>([]);
    const [previousPlanId, setPreviousPlanId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const stopRef = useRef(false);

    const q = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
    const load = useCallback(async () => {
        try {
            const [o, l] = await Promise.all([acApi<Overview>(`/director${q}`), siteId ? acApi<{ plans: PlanRow[] }>(`/director/plans${q}`) : Promise.resolve({ plans: [] as PlanRow[] })]);
            setOv(o); setPlans(l.plans);
        } catch (e) { setError((e as Error).message); }
    }, [q, siteId]);
    const loadPlan = useCallback(async (id: string) => {
        try { setPlan(await acApi<Plan>(`/director/plans/${id}`)); } catch (e) { setError((e as Error).message); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (selected) loadPlan(selected); else setPlan(null); }, [selected, loadPlan]);
    useEffect(() => () => { stopRef.current = true; }, []);

    const act = async (fn: () => Promise<void>) => {
        setBusy(true); setError(null);
        try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    };
    const create = (asDraft: boolean) => act(async () => {
        const p = await acApi<Plan>('/director/plans', { method: 'POST', body: { siteId, objective: text, capabilities: forced, asDraft, previousPlanId } });
        setText(''); setForced([]); setPreviousPlanId(null);
        await load(); setSelected(p.id); setPlan(p);
    });
    const decide = (decision: string, note?: string) => act(async () => {
        if (!plan) return;
        if (decision === 'cancel' && !window.confirm('¿Cancelar este plan? Queda en el historial y no se puede reanudar.')) return;
        const p = await acApi<Plan>(`/director/plans/${plan.id}/decide`, { method: 'POST', body: { decision, note } });
        setPlan(p); await load();
    });
    const run = async () => {
        if (!plan) return;
        setRunning(true); setError(null); stopRef.current = false;
        try {
            for (let i = 0; i < 20 && !stopRef.current; i++) {
                const r = await acApi<{ plan: Plan; busy?: boolean; note?: string }>(`/director/plans/${plan.id}/step`, { method: 'POST' });
                setPlan(r.plan);
                if (r.busy || !['approved', 'running'].includes(r.plan.status)) { if (r.note && r.busy) setError(r.note); break; }
            }
        } catch (e) { setError((e as Error).message); } finally { setRunning(false); await load(); }
    };
    const redo = (p: Plan) => { setText(p.objective); setForced([]); setPreviousPlanId(p.id); window.scrollTo({ top: 0, behavior: 'smooth' }); };

    return (
        <div className="space-y-5">
            <SectionHeader title="Dirección IA"
                subtitle="El Director de Inteligencia y Operaciones Rotarias interpreta objetivos, arma planes con los equipos y workflows de la organización, y entrega resultados para revisión humana. Propone y coordina; no aprueba proyectos, no confirma pagos ni envía comunicaciones." />
            <ErrorNote message={error} />
            {platform && (
                <div className={card}>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Organización</p>
                    <SitePicker meta={meta} value={siteId} idPrefix="director-site" onChange={(id: string, _s: Site | null) => { setSiteId(id); setSelected(null); setPlan(null); }} />
                    {!siteId && <p className="text-xs text-gray-400 mt-2">Cada organización tiene su propio Director, con su contexto y sus permisos. Elige una para empezar.</p>}
                </div>
            )}
            {ov && siteId && (
                <>
                    <DirectorPanel ov={ov} platform={platform} busy={busy} onNavigate={onNavigate}
                        onTemplate={() => act(async () => { await acApi('/director/template', { method: 'POST' }); await load(); })}
                        onInstall={() => act(async () => { await acApi('/director/install', { method: 'POST', body: { siteId } }); await load(); })} />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Kpi label="Pendientes de aprobación" value={ov.plans?.pending_approval || 0} />
                        <Kpi label="En ejecución" value={(ov.plans?.approved || 0) + (ov.plans?.running || 0)} />
                        <Kpi label="En revisión" value={ov.plans?.review || 0} hint="Entregables por revisar" />
                        <Kpi label="Requieren intervención" value={ov.plans?.needs_attention || 0} />
                    </div>
                    <ObjectiveConsole quickActions={ov.quickActions || []} text={text} onText={setText} forced={forced} onForced={setForced} busy={busy} onCreate={create} />
                    {previousPlanId && <p className="text-xs text-gray-500 -mt-3">El nuevo plan quedará enlazado al anterior.</p>}
                    <div className="space-y-2">
                        <p className="text-sm font-black text-gray-800">Planes y entregables</p>
                        <PlansList plans={plans} selected={selected} onSelect={setSelected} />
                    </div>
                    {plan && <PlanView key={plan.id} plan={plan} meta={meta} busy={busy} running={running} onDecide={decide} onRun={run} onRedo={redo} />}
                </>
            )}
        </div>
    );
}
