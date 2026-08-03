import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Workflow, Plus, Trash2, Play, Pause, AlertTriangle, CheckCircle2, Clock,
    Send, GitBranch, Tag as TagIcon, BellRing, LogOut, ChevronRight, Users, Shuffle,
    RefreshCw, Eye, X, Save, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

// ── Tipos ───────────────────────────────────────────────────────────────────
type Rule = { field: string; op: string; value?: any };
type Audience = { match?: 'all' | 'any'; rules?: Rule[]; scopeToEventSite?: boolean };

type Node = {
    id: string;
    type: 'send_template' | 'wait' | 'condition' | 'tag' | 'alert' | 'split' | 'exit';
    next?: string | null;
    nextTrue?: string | null;
    nextFalse?: string | null;
    templateId?: string | null;
    templateHint?: string;
    variables?: string[];
    days?: number; hours?: number; minutes?: number;
    condition?: any;
    add?: string[]; remove?: string[];
    severity?: string; title?: string; detail?: string;
    reason?: string; goalReached?: boolean;
    variants?: { key?: string; weight?: number; next?: string | null }[];
    ignoreFrequency?: boolean;
};

type Journey = {
    id: string; key: string; name: string; goal?: string | null;
    status: 'draft' | 'active' | 'paused';
    audience: Audience; trigger: any; nodes: Node[]; settings: any;
    isSeed?: boolean;
    validation?: string[];
    activeRuns?: number; completedRuns?: number; totalRuns?: number; messagesSent?: number;
};

type Catalog = {
    nodeTypes: { type: string; label: string; description: string }[];
    conditionKinds: { kind: string; label: string }[];
    messageOutcomes: { key: string; label: string }[];
    variables: { token: string; label: string }[];
    events: { type: string; label: string; group: string; derived?: boolean }[];
    lifecycleStates: { key: string; label: string; group: string }[];
    orgRoles: { key: string; label: string }[];
    segments: { fields: string[]; operators: string[]; presets: { key: string; label: string; audience: Audience }[] };
    templates: { id: string; name: string; displayName: string; category: string; language: string; status: string }[];
};

// ── Presentación ────────────────────────────────────────────────────────────
const NODE_ICON: Record<string, React.ReactNode> = {
    send_template: <Send className="w-4 h-4" />,
    wait: <Clock className="w-4 h-4" />,
    condition: <GitBranch className="w-4 h-4" />,
    tag: <TagIcon className="w-4 h-4" />,
    alert: <BellRing className="w-4 h-4" />,
    split: <Shuffle className="w-4 h-4" />,
    exit: <LogOut className="w-4 h-4" />,
};

const STATUS_STYLE: Record<string, string> = {
    active: 'bg-green-100 text-green-800 border-green-200',
    paused: 'bg-amber-100 text-amber-800 border-amber-200',
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
};

const STATUS_LABEL: Record<string, string> = {
    active: 'Activo', paused: 'Pausado', draft: 'Borrador',
};

const OP_LABEL: Record<string, string> = {
    in: 'es alguno de', not_in: 'no es ninguno de', eq: 'es igual a', neq: 'es distinto de',
    gt: 'es mayor que', gte: 'es mayor o igual que', lt: 'es menor que', lte: 'es menor o igual que',
    is_null: 'está vacío', not_null: 'tiene valor', has_any: 'contiene alguno de', has_all: 'contiene todos',
};

const FIELD_LABEL: Record<string, string> = {
    lifecycleState: 'Estado del ciclo de vida', siteType: 'Tipo de sitio', siteId: 'Sitio',
    orgRole: 'Cargo en la organización', language: 'Idioma', country: 'País', district: 'Distrito',
    consentState: 'Consentimiento', contactStatus: 'Estado del contacto', tags: 'Etiquetas',
    socialCount: 'Redes conectadas', projectCount: 'Proyectos', donationCount: 'Donaciones',
    eventCount: 'Eventos', productCount: 'Productos', trainingCompleted: 'Capacitaciones completadas',
    trainingScheduled: 'Capacitaciones agendadas', openSupport: 'Soportes abiertos',
    phasesTotal: 'Fases de activación', phasesCompleted: 'Fases completadas',
    daysToExpiry: 'Días para vencer', daysSinceInbound: 'Días desde su última respuesta',
};

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

// ── Editor de reglas de audiencia ───────────────────────────────────────────
const AudienceEditor: React.FC<{
    audience: Audience;
    catalog: Catalog;
    onChange: (a: Audience) => void;
}> = ({ audience, catalog, onChange }) => {
    const rules = audience.rules || [];

    const update = (i: number, patch: Partial<Rule>) => {
        const next = rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
        onChange({ ...audience, rules: next });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Cumple</span>
                <select
                    value={audience.match || 'all'}
                    onChange={e => onChange({ ...audience, match: e.target.value as 'all' | 'any' })}
                    className="border rounded-lg px-2 py-1 text-sm"
                >
                    <option value="all">todas las condiciones</option>
                    <option value="any">alguna condición</option>
                </select>
            </div>

            {rules.map((rule, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 bg-gray-50 border rounded-lg p-2">
                    <select
                        value={rule.field}
                        onChange={e => update(i, { field: e.target.value })}
                        className="border rounded px-2 py-1 text-sm min-w-[190px]"
                    >
                        {catalog.segments.fields.map(f => (
                            <option key={f} value={f}>{FIELD_LABEL[f] || f}</option>
                        ))}
                    </select>
                    <select
                        value={rule.op}
                        onChange={e => update(i, { op: e.target.value })}
                        className="border rounded px-2 py-1 text-sm"
                    >
                        {catalog.segments.operators.map(o => (
                            <option key={o} value={o}>{OP_LABEL[o] || o}</option>
                        ))}
                    </select>

                    {!['is_null', 'not_null'].includes(rule.op) && (
                        rule.field === 'lifecycleState' ? (
                            <select
                                multiple={['in', 'not_in'].includes(rule.op)}
                                value={Array.isArray(rule.value) ? rule.value : [rule.value].filter(Boolean)}
                                onChange={e => {
                                    const picked = Array.from(e.target.selectedOptions).map(o => o.value);
                                    update(i, { value: ['in', 'not_in'].includes(rule.op) ? picked : picked[0] });
                                }}
                                className="border rounded px-2 py-1 text-sm min-w-[200px]"
                            >
                                {catalog.lifecycleStates.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                        ) : rule.field === 'orgRole' ? (
                            <select
                                multiple={['in', 'not_in'].includes(rule.op)}
                                value={Array.isArray(rule.value) ? rule.value : [rule.value].filter(Boolean)}
                                onChange={e => {
                                    const picked = Array.from(e.target.selectedOptions).map(o => o.value);
                                    update(i, { value: ['in', 'not_in'].includes(rule.op) ? picked : picked[0] });
                                }}
                                className="border rounded px-2 py-1 text-sm min-w-[200px]"
                            >
                                {catalog.orgRoles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                            </select>
                        ) : (
                            <input
                                value={Array.isArray(rule.value) ? rule.value.join(', ') : (rule.value ?? '')}
                                onChange={e => update(i, {
                                    value: ['in', 'not_in', 'has_any', 'has_all'].includes(rule.op)
                                        ? e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                        : e.target.value,
                                })}
                                placeholder={['in', 'not_in'].includes(rule.op) ? 'valor1, valor2' : 'valor'}
                                className="border rounded px-2 py-1 text-sm flex-1 min-w-[140px]"
                            />
                        )
                    )}

                    <button
                        onClick={() => onChange({ ...audience, rules: rules.filter((_, idx) => idx !== i) })}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Quitar condición"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ))}

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => onChange({ ...audience, rules: [...rules, { field: 'lifecycleState', op: 'in', value: [] }] })}
                    className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                >
                    <Plus className="w-3.5 h-3.5" /> Condición
                </button>
                <select
                    value=""
                    onChange={e => {
                        const preset = catalog.segments.presets.find(p => p.key === e.target.value);
                        if (preset) onChange({ ...audience, ...preset.audience });
                    }}
                    className="text-sm border rounded-lg px-2 py-1.5 text-gray-600"
                >
                    <option value="">Usar un segmento predefinido…</option>
                    {catalog.segments.presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
            </div>
        </div>
    );
};

// ── Editor de un nodo ───────────────────────────────────────────────────────
const NodeEditor: React.FC<{
    node: Node;
    nodes: Node[];
    catalog: Catalog;
    onChange: (n: Node) => void;
    onDelete: () => void;
}> = ({ node, nodes, catalog, onChange, onDelete }) => {
    const others = nodes.filter(n => n.id !== node.id);
    const nodeSelect = (value: string | null | undefined, onPick: (v: string | null) => void, label: string) => (
        <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 whitespace-nowrap">{label}</span>
            <select
                value={value || ''}
                onChange={e => onPick(e.target.value || null)}
                className="border rounded px-2 py-1 text-sm flex-1"
            >
                <option value="">— terminar aquí —</option>
                {others.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
            </select>
        </label>
    );

    return (
        <div className="border rounded-xl bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-gray-100 rounded-lg text-gray-700">{NODE_ICON[node.type]}</span>
                    <div>
                        <p className="font-semibold text-sm text-gray-900">
                            {catalog.nodeTypes.find(t => t.type === node.type)?.label || node.type}
                        </p>
                        <code className="text-[11px] text-gray-400">{node.id}</code>
                    </div>
                </div>
                <button onClick={onDelete} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Quitar paso">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {node.type === 'send_template' && (
                <div className="space-y-2">
                    {node.templateHint && !node.templateId && (
                        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2">
                            <strong>Qué debe decir esta plantilla:</strong> {node.templateHint}
                            <br />
                            Creála en Meta, sincronizala desde la pestaña Templates y asignala aquí.
                        </p>
                    )}
                    <label className="block text-sm">
                        <span className="text-gray-500">Plantilla aprobada</span>
                        <select
                            value={node.templateId || ''}
                            onChange={e => onChange({ ...node, templateId: e.target.value || null })}
                            className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                        >
                            <option value="">— sin asignar —</option>
                            {catalog.templates.map(t => (
                                <option key={t.id} value={t.id} disabled={t.status !== 'approved'}>
                                    {t.displayName || t.name} ({t.language}) {t.status !== 'approved' ? `— ${t.status}` : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">
                            Variables, en el orden en que Meta las numera ({'{{1}}'}, {'{{2}}'}…)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {(node.variables || []).map((v, i) => (
                                <span key={i} className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-800 text-xs px-2 py-1 rounded-lg">
                                    <span className="font-mono">{`{{${i + 1}}}`}</span> {v}
                                    <button
                                        onClick={() => onChange({ ...node, variables: (node.variables || []).filter((_, idx) => idx !== i) })}
                                        className="hover:text-red-600"
                                    ><X className="w-3 h-3" /></button>
                                </span>
                            ))}
                        </div>
                        <select
                            value=""
                            onChange={e => {
                                if (!e.target.value) return;
                                onChange({ ...node, variables: [...(node.variables || []), e.target.value] });
                            }}
                            className="mt-2 border rounded-lg px-2 py-1 text-sm"
                        >
                            <option value="">Agregar variable…</option>
                            {catalog.variables.map(v => <option key={v.token} value={v.token}>{v.label}</option>)}
                        </select>
                    </div>
                    {nodeSelect(node.next, v => onChange({ ...node, next: v }), 'Después:')}
                </div>
            )}

            {node.type === 'wait' && (
                <div className="space-y-2">
                    <div className="flex gap-2">
                        {(['days', 'hours', 'minutes'] as const).map(unit => (
                            <label key={unit} className="text-sm flex-1">
                                <span className="text-gray-500 capitalize">
                                    {unit === 'days' ? 'Días' : unit === 'hours' ? 'Horas' : 'Minutos'}
                                </span>
                                <input
                                    type="number" min={0}
                                    value={node[unit] ?? 0}
                                    onChange={e => onChange({ ...node, [unit]: Number(e.target.value) })}
                                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                />
                            </label>
                        ))}
                    </div>
                    {nodeSelect(node.next, v => onChange({ ...node, next: v }), 'Después:')}
                </div>
            )}

            {node.type === 'condition' && (
                <div className="space-y-2">
                    <select
                        value={node.condition?.kind || 'audience'}
                        onChange={e => onChange({ ...node, condition: { kind: e.target.value } })}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    >
                        {catalog.conditionKinds.map(c => <option key={c.kind} value={c.kind}>{c.label}</option>)}
                    </select>

                    {(node.condition?.kind || 'audience') === 'audience' && (
                        <AudienceEditor
                            audience={node.condition?.audience || { match: 'all', rules: [] }}
                            catalog={catalog}
                            onChange={a => onChange({ ...node, condition: { kind: 'audience', audience: a } })}
                        />
                    )}

                    {node.condition?.kind === 'message' && (
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={node.condition?.on || 'last_send'}
                                onChange={e => onChange({ ...node, condition: { ...node.condition, on: e.target.value } })}
                                className="border rounded px-2 py-1 text-sm"
                            >
                                <option value="last_send">el último enviado</option>
                                {nodes.filter(n => n.type === 'send_template').map(n => (
                                    <option key={n.id} value={n.id}>el del paso {n.id}</option>
                                ))}
                            </select>
                            <select
                                value={node.condition?.is || 'read'}
                                onChange={e => onChange({ ...node, condition: { ...node.condition, is: e.target.value } })}
                                className="border rounded px-2 py-1 text-sm"
                            >
                                {catalog.messageOutcomes.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                        </div>
                    )}

                    {node.condition?.kind === 'event' && (
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={node.condition?.eventType || ''}
                                onChange={e => onChange({ ...node, condition: { ...node.condition, eventType: e.target.value } })}
                                className="border rounded px-2 py-1 text-sm flex-1"
                            >
                                <option value="">Elegí un evento…</option>
                                {catalog.events.map(ev => <option key={ev.type} value={ev.type}>{ev.label}</option>)}
                            </select>
                            <input
                                type="number" min={1} placeholder="días"
                                value={node.condition?.withinDays ?? ''}
                                onChange={e => onChange({ ...node, condition: { ...node.condition, withinDays: Number(e.target.value) || undefined } })}
                                className="border rounded px-2 py-1 text-sm w-24"
                            />
                        </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-2 pt-1">
                        {nodeSelect(node.nextTrue, v => onChange({ ...node, nextTrue: v }), 'Si sí:')}
                        {nodeSelect(node.nextFalse, v => onChange({ ...node, nextFalse: v }), 'Si no:')}
                    </div>
                </div>
            )}

            {node.type === 'tag' && (
                <div className="space-y-2">
                    <label className="block text-sm">
                        <span className="text-gray-500">Agregar etiquetas (separadas por coma)</span>
                        <input
                            value={(node.add || []).join(', ')}
                            onChange={e => onChange({ ...node, add: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                            className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                        />
                    </label>
                    <label className="block text-sm">
                        <span className="text-gray-500">Quitar etiquetas</span>
                        <input
                            value={(node.remove || []).join(', ')}
                            onChange={e => onChange({ ...node, remove: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                            className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                        />
                    </label>
                    {nodeSelect(node.next, v => onChange({ ...node, next: v }), 'Después:')}
                </div>
            )}

            {node.type === 'alert' && (
                <div className="space-y-2">
                    <p className="text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-2">
                        La alerta es para el equipo. Al club no le llega nada.
                    </p>
                    <input
                        value={node.title || ''}
                        onChange={e => onChange({ ...node, title: e.target.value })}
                        placeholder="Título de la alerta"
                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                    <textarea
                        value={node.detail || ''}
                        onChange={e => onChange({ ...node, detail: e.target.value })}
                        placeholder="Qué tiene que hacer quien la reciba"
                        rows={2}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                    <select
                        value={node.severity || 'warning'}
                        onChange={e => onChange({ ...node, severity: e.target.value })}
                        className="border rounded px-2 py-1 text-sm"
                    >
                        <option value="info">Informativa</option>
                        <option value="warning">Atención</option>
                        <option value="error">Urgente</option>
                    </select>
                    {nodeSelect(node.next, v => onChange({ ...node, next: v }), 'Después:')}
                </div>
            )}

            {node.type === 'split' && (
                <div className="space-y-2">
                    <p className="text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-2">
                        A cada contacto le toca siempre la misma variante, calculada a partir de su identificador.
                        No es azar: así un reintento no lo cambia de rama y el resultado mide las variantes, no la suerte.
                    </p>
                    {(node.variants || []).map((v, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 bg-gray-50 border rounded-lg p-2">
                            <input
                                value={v.key || ''}
                                onChange={e => onChange({
                                    ...node,
                                    variants: (node.variants || []).map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)),
                                })}
                                placeholder={`Variante ${String.fromCharCode(65 + i)}`}
                                className="border rounded px-2 py-1 text-sm w-28"
                            />
                            <label className="flex items-center gap-1 text-xs text-gray-500">
                                peso
                                <input
                                    type="number" min={0} value={v.weight ?? 1}
                                    onChange={e => onChange({
                                        ...node,
                                        variants: (node.variants || []).map((x, idx) => (idx === i ? { ...x, weight: Number(e.target.value) } : x)),
                                    })}
                                    className="border rounded px-2 py-1 text-sm w-16"
                                />
                            </label>
                            <select
                                value={v.next || ''}
                                onChange={e => onChange({
                                    ...node,
                                    variants: (node.variants || []).map((x, idx) => (idx === i ? { ...x, next: e.target.value || null } : x)),
                                })}
                                className="border rounded px-2 py-1 text-sm flex-1 min-w-[120px]"
                            >
                                <option value="">— elegí el paso —</option>
                                {others.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                            </select>
                            <button
                                onClick={() => onChange({ ...node, variants: (node.variants || []).filter((_, idx) => idx !== i) })}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                            ><Trash2 className="w-4 h-4" /></button>
                        </div>
                    ))}
                    <button
                        onClick={() => onChange({
                            ...node,
                            variants: [...(node.variants || []), { key: `v${(node.variants || []).length + 1}`, weight: 1, next: null }],
                        })}
                        className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                    ><Plus className="w-3.5 h-3.5" /> Variante</button>
                    <p className="text-xs text-gray-400">
                        Una variante con peso 0 deja de recibir contactos nuevos sin romper las inscripciones que ya estaban en ella.
                    </p>
                </div>
            )}

            {node.type === 'exit' && (
                <div className="space-y-2">
                    <input
                        value={node.reason || ''}
                        onChange={e => onChange({ ...node, reason: e.target.value })}
                        placeholder="Motivo de la salida"
                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                        <input
                            type="checkbox"
                            checked={!!node.goalReached}
                            onChange={e => onChange({ ...node, goalReached: e.target.checked })}
                        />
                        Cumplió el objetivo del recorrido
                    </label>
                </div>
            )}
        </div>
    );
};

// ── Vista de flujo ──────────────────────────────────────────────────────────
// Recorre el grafo desde el nodo inicial y lo dibuja indentado. Es lo que hace
// legible el recorrido sin un lienzo de arrastrar y soltar: se ve el orden, las
// ramas y dónde termina cada una.
const FlowPreview: React.FC<{ journey: Journey }> = ({ journey }) => {
    const lines = useMemo(() => {
        const byId = Object.fromEntries((journey.nodes || []).map(n => [n.id, n]));
        const out: { depth: number; label: string; node: Node | null; branch?: string }[] = [];
        const seen = new Set<string>();

        const walk = (id: string | null | undefined, depth: number, branch?: string) => {
            if (!id) { out.push({ depth, label: 'fin', node: null, branch }); return; }
            const node = byId[id];
            if (!node) { out.push({ depth, label: `paso inexistente: ${id}`, node: null, branch }); return; }
            if (seen.has(id)) { out.push({ depth, label: `vuelve a ${id}`, node: null, branch }); return; }
            seen.add(id);

            out.push({ depth, label: id, node, branch });
            if (node.type === 'condition') {
                walk(node.nextTrue, depth + 1, 'sí');
                walk(node.nextFalse, depth + 1, 'no');
            } else if (node.type === 'split') {
                (node.variants || []).forEach((v, i) => walk(v.next, depth + 1, v.key || `v${i + 1}`));
            } else if (node.type !== 'exit') {
                walk(node.next, depth, undefined);
            }
        };

        walk(journey.settings?.entryNodeId || journey.nodes?.[0]?.id, 0);
        return out;
    }, [journey]);

    const describe = (n: Node) => {
        if (n.type === 'wait') {
            const parts = [
                n.days ? `${n.days} d` : '', n.hours ? `${n.hours} h` : '', n.minutes ? `${n.minutes} min` : '',
            ].filter(Boolean);
            return `esperar ${parts.join(' ') || '—'}`;
        }
        if (n.type === 'send_template') return n.templateId ? 'enviar plantilla' : 'enviar plantilla (sin asignar)';
        if (n.type === 'condition') return n.condition?.kind === 'message' ? 'según el mensaje anterior'
            : n.condition?.kind === 'event' ? 'según un evento' : 'según el contacto o su sitio';
        if (n.type === 'alert') return n.title || 'alerta interna';
        if (n.type === 'exit') return n.reason || 'terminar';
        if (n.type === 'tag') return 'etiquetar';
        if (n.type === 'split') return `prueba A/B (${(n.variants || []).length} variantes)`;
        return n.type;
    };

    return (
        <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
            <div className="min-w-max space-y-1">
                {lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm" style={{ paddingLeft: l.depth * 20 }}>
                        {l.branch && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                l.branch === 'sí' ? 'bg-green-500/20 text-green-300'
                                    : l.branch === 'no' ? 'bg-red-500/20 text-red-300'
                                    : 'bg-blue-500/20 text-blue-300'
                            }`}>{l.branch}</span>
                        )}
                        <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />
                        {l.node ? (
                            <>
                                <span className="text-gray-400">{NODE_ICON[l.node.type]}</span>
                                <code className="text-gray-300 text-xs">{l.label}</code>
                                <span className="text-gray-500 text-xs">— {describe(l.node)}</span>
                                {l.node.type === 'send_template' && !l.node.templateId && (
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                )}
                            </>
                        ) : (
                            <span className="text-gray-600 text-xs italic">{l.label}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Componente principal ────────────────────────────────────────────────────
export default function JourneyBuilder() {
    const { token } = useAuth();

    // Todos los hooks arriba, antes de cualquier `return` — regla del sitio: un
    // render que llama menos hooks que el anterior tumba el árbol entero.
    const [loading, setLoading] = useState(true);
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [journeys, setJourneys] = useState<Journey[]>([]);
    const [editing, setEditing] = useState<Journey | null>(null);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<{ total: number; sites: number; sample: any[]; skipped: any[] } | null>(null);
    const [ticking, setTicking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    }), [token]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [rc, rj] = await Promise.all([
                fetch(`${API}/crm/automation/catalog`, { headers }),
                fetch(`${API}/crm/journeys`, { headers }),
            ]);
            if (!rj.ok) {
                const body = await rj.json().catch(() => ({}));
                throw new Error(body.error || 'No se pudieron cargar los recorridos');
            }
            setCatalog(await rc.json());
            setJourneys(await rj.json());
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => { load(); }, [load]);

    const saveJourney = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/crm/journeys/${editing.id}`, {
                method: 'PUT', headers, body: JSON.stringify(editing),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo guardar');
            toast.success('Recorrido guardado');
            setEditing(body);
            load();
        } catch (e: any) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const changeStatus = async (journey: Journey, status: string) => {
        try {
            const res = await fetch(`${API}/crm/journeys/${journey.id}/status`, {
                method: 'PATCH', headers, body: JSON.stringify({ status }),
            });
            const body = await res.json();
            if (!res.ok) {
                toast.error(body.error || 'No se pudo cambiar el estado');
                if (body.validation?.length) body.validation.forEach((v: string) => toast.error(v));
                return;
            }
            toast.success(status === 'active' ? 'Recorrido activado' : 'Recorrido pausado');
            load();
            if (editing?.id === journey.id) setEditing({ ...editing, status: status as Journey['status'] });
        } catch (e: any) { toast.error(e.message); }
    };

    const createJourney = async () => {
        const name = window.prompt('Nombre del recorrido');
        if (!name) return;
        try {
            const res = await fetch(`${API}/crm/journeys`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    name,
                    trigger: { type: 'lifecycle.entered' },
                    audience: { match: 'all', rules: [] },
                    nodes: [],
                    settings: { reentry: 'per_event' },
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo crear');
            toast.success('Recorrido creado en borrador');
            load();
            setEditing(body);
        } catch (e: any) { toast.error(e.message); }
    };

    const removeJourney = async (journey: Journey) => {
        if (!window.confirm(`¿Borrar "${journey.name}"? Esto no se puede deshacer.`)) return;
        try {
            const res = await fetch(`${API}/crm/journeys/${journey.id}`, { method: 'DELETE', headers });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'No se pudo borrar');
            toast.success('Recorrido borrado');
            if (editing?.id === journey.id) setEditing(null);
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const previewAudience = async () => {
        if (!editing) return;
        try {
            const res = await fetch(`${API}/crm/segments/preview`, {
                method: 'POST', headers, body: JSON.stringify({ audience: editing.audience }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo calcular');
            setPreview(body);
        } catch (e: any) { toast.error(e.message); }
    };

    const runTick = async () => {
        setTicking(true);
        try {
            const res = await fetch(`${API}/crm/automation/tick`, { method: 'POST', headers });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo ejecutar');
            toast.success(
                `Observados ${body.lifecycle?.sites ?? 0} sitios · ${body.lifecycle?.transitions ?? 0} transiciones · ` +
                `${body.enrollment?.enrolled ?? 0} inscripciones · ${body.delivery?.sent ?? 0} enviados`
            );
            load();
        } catch (e: any) { toast.error(e.message); }
        finally { setTicking(false); }
    };

    const addNode = (type: Node['type']) => {
        if (!editing) return;
        const node: Node = { id: newId(type.slice(0, 4)), type };
        if (type === 'wait') node.days = 1;
        if (type === 'condition') node.condition = { kind: 'audience', audience: { match: 'all', rules: [] } };
        if (type === 'send_template') node.variables = [];
        if (type === 'split') node.variants = [{ key: 'A', weight: 1, next: null }, { key: 'B', weight: 1, next: null }];
        setEditing({ ...editing, nodes: [...(editing.nodes || []), node] });
    };

    // ── Render ──────────────────────────────────────────────────────────────
    if (loading) {
        return <div className="p-12 text-center text-gray-500">Cargando el motor de automatización…</div>;
    }

    if (error) {
        return (
            <div className="p-8 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-semibold">No se pudo abrir el motor de automatización</p>
                        <p className="text-sm mt-1">{error}</p>
                        <button onClick={load} className="mt-3 text-sm px-3 py-1.5 bg-white border rounded-lg hover:bg-amber-50">
                            Reintentar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!catalog) return null;

    if (editing) {
        const invalid = editing.validation || [];
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <button onClick={() => { setEditing(null); setPreview(null); }} className="text-sm text-gray-500 hover:text-gray-900">
                        ← Volver a los recorridos
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={saveJourney} disabled={saving}
                            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" /> {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                        {editing.status !== 'active' ? (
                            <button
                                onClick={() => changeStatus(editing, 'active')}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                            ><Play className="w-4 h-4" /> Activar</button>
                        ) : (
                            <button
                                onClick={() => changeStatus(editing, 'paused')}
                                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                            ><Pause className="w-4 h-4" /> Pausar</button>
                        )}
                    </div>
                </div>

                {invalid.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
                        <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No se puede activar todavía</p>
                        <ul className="list-disc ml-5 mt-1 space-y-0.5">
                            {invalid.map((v, i) => <li key={i}>{v}</li>)}
                        </ul>
                    </div>
                )}

                <div className="grid lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-white border rounded-xl p-4 space-y-3">
                            <input
                                value={editing.name}
                                onChange={e => setEditing({ ...editing, name: e.target.value })}
                                className="w-full text-xl font-bold border-0 border-b focus:ring-0 px-0 py-1"
                            />
                            <textarea
                                value={editing.goal || ''}
                                onChange={e => setEditing({ ...editing, goal: e.target.value })}
                                placeholder="Objetivo del recorrido"
                                rows={2}
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                            <div className="grid sm:grid-cols-2 gap-3">
                                <label className="text-sm">
                                    <span className="text-gray-500">Evento inicial</span>
                                    <select
                                        value={editing.trigger?.type || ''}
                                        onChange={e => setEditing({ ...editing, trigger: { ...editing.trigger, type: e.target.value } })}
                                        className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                    >
                                        <option value="">Elegí un evento…</option>
                                        {catalog.events.map(ev => <option key={ev.type} value={ev.type}>{ev.label}</option>)}
                                    </select>
                                </label>
                                {editing.trigger?.type === 'lifecycle.entered' && (
                                    <label className="text-sm">
                                        <span className="text-gray-500">Al entrar en el estado</span>
                                        <select
                                            value={editing.trigger?.state || ''}
                                            onChange={e => setEditing({ ...editing, trigger: { ...editing.trigger, state: e.target.value } })}
                                            className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                        >
                                            <option value="">cualquiera</option>
                                            {catalog.lifecycleStates.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                        </select>
                                    </label>
                                )}
                            </div>
                        </div>

                        <div className="bg-white border rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> A quién le escribe
                                </h3>
                                <button onClick={previewAudience} className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 flex items-center gap-1">
                                    <Eye className="w-3.5 h-3.5" /> Vista previa
                                </button>
                            </div>
                            <AudienceEditor
                                audience={editing.audience || {}}
                                catalog={catalog}
                                onChange={a => setEditing({ ...editing, audience: a })}
                            />
                            <label className="flex items-start gap-2 text-sm text-gray-600 pt-1">
                                <input
                                    type="checkbox"
                                    checked={editing.audience?.scopeToEventSite !== false}
                                    onChange={e => setEditing({ ...editing, audience: { ...editing.audience, scopeToEventSite: e.target.checked } })}
                                    className="mt-0.5"
                                />
                                <span>
                                    Escribirle sólo al sitio del evento.
                                    <span className="block text-xs text-gray-400">
                                        Desmarcado, un evento de un club dispara el envío a toda la audiencia. Casi nunca es lo que se quiere.
                                    </span>
                                </span>
                            </label>

                            {preview && (
                                <div className="border-t pt-3 text-sm">
                                    <p className="text-gray-700">
                                        <strong>{preview.total}</strong> contacto(s) en <strong>{preview.sites}</strong> sitio(s).
                                    </p>
                                    {preview.skipped?.length > 0 && (
                                        <p className="text-amber-700 text-xs mt-1">
                                            {preview.skipped.length} regla(s) descartada(s) por campo u operador desconocido — la audiencia es más amplia de lo que parece.
                                        </p>
                                    )}
                                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                        {preview.sample.map(c => (
                                            <div key={c.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                                                <span>{c.name} · {c.phone}</span>
                                                <span className="text-gray-400">{c.lifecycleState || 'sin estado'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white border rounded-xl p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <Workflow className="w-4 h-4" /> Pasos
                                </h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {catalog.nodeTypes.map(t => (
                                        <button
                                            key={t.type}
                                            onClick={() => addNode(t.type as Node['type'])}
                                            title={t.description}
                                            className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                                        >
                                            {NODE_ICON[t.type]} {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label className="text-sm block">
                                <span className="text-gray-500">Paso inicial</span>
                                <select
                                    value={editing.settings?.entryNodeId || editing.nodes?.[0]?.id || ''}
                                    onChange={e => setEditing({ ...editing, settings: { ...editing.settings, entryNodeId: e.target.value } })}
                                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                >
                                    {(editing.nodes || []).map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                                </select>
                            </label>

                            <div className="space-y-3">
                                {(editing.nodes || []).map((node, i) => (
                                    <NodeEditor
                                        key={node.id}
                                        node={node}
                                        nodes={editing.nodes}
                                        catalog={catalog}
                                        onChange={n => setEditing({
                                            ...editing,
                                            nodes: editing.nodes.map((x, idx) => (idx === i ? n : x)),
                                        })}
                                        onDelete={() => setEditing({
                                            ...editing,
                                            nodes: editing.nodes.filter((_, idx) => idx !== i),
                                        })}
                                    />
                                ))}
                                {!editing.nodes?.length && (
                                    <p className="text-sm text-gray-400 text-center py-6">
                                        Todavía no hay pasos. Agregá el primero con los botones de arriba.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-white border rounded-xl p-4">
                            <h3 className="font-semibold text-gray-900 mb-3">Cómo se ve el recorrido</h3>
                            <FlowPreview journey={editing} />
                        </div>

                        <div className="bg-white border rounded-xl p-4 space-y-3">
                            <h3 className="font-semibold text-gray-900">Reglas del recorrido</h3>
                            <label className="text-sm block">
                                <span className="text-gray-500">Reinscripción</span>
                                <select
                                    value={editing.settings?.reentry || 'per_event'}
                                    onChange={e => setEditing({ ...editing, settings: { ...editing.settings, reentry: e.target.value } })}
                                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                >
                                    <option value="once">Una sola vez por contacto</option>
                                    <option value="per_event">Una vez por cada evento</option>
                                    <option value="always">Siempre que ocurra el evento</option>
                                </select>
                            </label>
                            <div>
                                <span className="text-sm text-gray-500">Salir si ocurre alguno de estos eventos</span>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                    {(editing.settings?.exitOnEvents || []).map((ev: string, i: number) => (
                                        <span key={i} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs px-2 py-1 rounded-lg">
                                            {catalog.events.find(e => e.type === ev)?.label || ev}
                                            <button onClick={() => setEditing({
                                                ...editing,
                                                settings: {
                                                    ...editing.settings,
                                                    exitOnEvents: (editing.settings.exitOnEvents || []).filter((_: string, idx: number) => idx !== i),
                                                },
                                            })}><X className="w-3 h-3" /></button>
                                        </span>
                                    ))}
                                </div>
                                <select
                                    value=""
                                    onChange={e => {
                                        if (!e.target.value) return;
                                        setEditing({
                                            ...editing,
                                            settings: {
                                                ...editing.settings,
                                                exitOnEvents: [...(editing.settings?.exitOnEvents || []), e.target.value],
                                            },
                                        });
                                    }}
                                    className="mt-2 w-full border rounded-lg px-2 py-1 text-sm"
                                >
                                    <option value="">Agregar evento de salida…</option>
                                    {catalog.events.map(ev => <option key={ev.type} value={ev.type}>{ev.label}</option>)}
                                </select>
                                <p className="text-xs text-gray-400 mt-1">
                                    Se comprueba antes de cada paso, no sólo al inscribir. Es lo que evita seguir pidiéndole
                                    la renovación a quien ya renovó.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Workflow className="w-5 h-5 text-green-600" /> Recorridos automatizados
                    </h2>
                    <p className="text-sm text-gray-500">
                        Cada recorrido escucha un evento del sistema y acompaña al club paso a paso.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={runTick} disabled={ticking}
                        className="px-3 py-2 border rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50"
                        title="Observa el estado de los sitios, inscribe y envía lo que corresponda, sin esperar al cron."
                    >
                        <Zap className={`w-4 h-4 ${ticking ? 'animate-pulse' : ''}`} /> {ticking ? 'Ejecutando…' : 'Ejecutar ahora'}
                    </button>
                    <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50" title="Recargar">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={createJourney}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                    ><Plus className="w-4 h-4" /> Nuevo recorrido</button>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {journeys.map(j => (
                    <div key={j.id} className="bg-white border rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h3 className="font-bold text-gray-900 truncate">{j.name}</h3>
                                {j.goal && <p className="text-xs text-gray-500 mt-0.5">{j.goal}</p>}
                            </div>
                            <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border shrink-0 ${STATUS_STYLE[j.status]}`}>
                                {STATUS_LABEL[j.status]}
                            </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center">
                            {[
                                { label: 'Activas', value: j.activeRuns ?? 0 },
                                { label: 'Terminadas', value: j.completedRuns ?? 0 },
                                { label: 'Mensajes', value: j.messagesSent ?? 0 },
                                { label: 'Pasos', value: j.nodes?.length ?? 0 },
                            ].map(s => (
                                <div key={s.label} className="bg-gray-50 rounded-lg py-1.5">
                                    <p className="text-sm font-bold text-gray-900">{s.value}</p>
                                    <p className="text-[10px] text-gray-500">{s.label}</p>
                                </div>
                            ))}
                        </div>

                        {j.validation && j.validation.length > 0 ? (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex items-start gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                {j.validation[0]}{j.validation.length > 1 ? ` (+${j.validation.length - 1} más)` : ''}
                            </p>
                        ) : (
                            <p className="text-xs text-green-700 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Listo para activar
                            </p>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                            <button
                                onClick={() => { setEditing(j); setPreview(null); }}
                                className="flex-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
                            >Abrir</button>
                            {j.status !== 'active' ? (
                                <button onClick={() => changeStatus(j, 'active')} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Activar">
                                    <Play className="w-4 h-4" />
                                </button>
                            ) : (
                                <button onClick={() => changeStatus(j, 'paused')} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Pausar">
                                    <Pause className="w-4 h-4" />
                                </button>
                            )}
                            <button onClick={() => removeJourney(j)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Borrar">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {!journeys.length && (
                <div className="text-center py-12 text-gray-400">
                    <Workflow className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>Todavía no hay recorridos.</p>
                </div>
            )}
        </div>
    );
}
