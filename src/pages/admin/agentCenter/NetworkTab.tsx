// Agent Network — el mapa de agentes, armado SÓLO con datos reales (v4.1317).
// Columnas: Command Center → equipos → agentes → herramientas → módulos. Una
// arista agente→herramienta existe sólo si hay una concesión; su estilo dice si
// alguna instalación que la tiene está activa, inactiva o con error.
import { useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { EmptyNote, ErrorNote, SectionHeader } from './agentCenterUi';

interface Node { id: string; type: 'core' | 'team' | 'agent' | 'tool' | 'module'; label: string; risk?: string; installations?: number; active?: number; error?: boolean }
interface Edge { from: string; to: string; style: 'structure' | 'active' | 'idle' | 'broken'; modes?: string[] }

const COLS: Node['type'][] = ['core', 'team', 'agent', 'tool', 'module'];
const COL_LABEL: Record<string, string> = { core: '', team: 'Equipos', agent: 'Agentes', tool: 'Herramientas', module: 'Módulos' };
const FILL: Record<string, string> = { core: '#28354b', team: '#e7effa', agent: '#ffffff', tool: '#fdf3dc', module: '#e3f4ec' };
const STROKE: Record<string, string> = { core: '#28354b', team: '#004080', agent: '#004080', tool: '#e8a20c', module: '#11805a' };
const EDGE: Record<string, { stroke: string; dash?: string; width: number }> = {
    structure: { stroke: '#cbd5e1', width: 1.2 }, active: { stroke: '#11805a', width: 1.8 }, idle: { stroke: '#7c6fd6', dash: '5 4', width: 1.5 }, broken: { stroke: '#b4312a', dash: '2 3', width: 1.8 },
};

export default function NetworkTab({ meta }: { meta: Meta }) {
    const [g, setG] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [focus, setFocus] = useState<string | null>(null);
    useEffect(() => { acApi<{ nodes: Node[]; edges: Edge[] }>('/network').then(setG).catch(e => setError(e.message)); }, []);
    if (error) return <ErrorNote message={error} />;
    if (!g) return <div className="text-sm text-gray-400">Armando el mapa…</div>;
    if (g.nodes.length <= 1) return <EmptyNote>No hay agentes instalados todavía: el mapa sólo muestra conexiones reales.</EmptyNote>;

    const colW = 210; const rowH = 34; const top = 40;
    const byCol = COLS.map(c => g.nodes.filter(n => n.type === c));
    const H = Math.max(...byCol.map(c => c.length)) * rowH + top + 30;
    const pos = new Map<string, { x: number; y: number }>();
    byCol.forEach((nodes, ci) => {
        const offset = (H - top - nodes.length * rowH) / 2;
        nodes.forEach((n, i) => pos.set(n.id, { x: 20 + ci * colW, y: top + offset + i * rowH }));
    });
    const linked = (id: string) => !focus || id === focus || g.edges.some(e => (e.from === focus && e.to === id) || (e.to === focus && e.from === id));
    const W = 20 + COLS.length * colW;
    return (
        <div className="space-y-4">
            <SectionHeader title="Mapa de agentes" subtitle={`Qué agente está conectado con qué herramienta y qué módulo, ${meta.scope === 'site' ? 'en tu sitio' : 'en todo el ecosistema'}. Toca un nodo para resaltar sus conexiones. Sólo se dibuja lo que existe.`} />
            <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                <span className="inline-flex items-center gap-2"><svg width="30" height="6"><line x1="0" y1="3" x2="30" y2="3" stroke={EDGE.active.stroke} strokeWidth="2" /></svg>Concesión con instalación activa</span>
                <span className="inline-flex items-center gap-2"><svg width="30" height="6"><line x1="0" y1="3" x2="30" y2="3" stroke={EDGE.idle.stroke} strokeWidth="2" strokeDasharray="5 4" /></svg>Concedida, instalación apagada o sin uso</span>
                <span className="inline-flex items-center gap-2"><svg width="30" height="6"><line x1="0" y1="3" x2="30" y2="3" stroke={EDGE.broken.stroke} strokeWidth="2" strokeDasharray="2 3" /></svg>Instalación con error</span>
                {focus && <button type="button" onClick={() => setFocus(null)} className="font-bold text-rotary-blue">Quitar resaltado</button>}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} className="block" role="img" aria-label="Mapa de agentes, herramientas y módulos">
                    {COLS.map((c, i) => <text key={c} x={20 + i * colW} y={22} fontSize="11" fontWeight="700" fill="#94a3b8" style={{ letterSpacing: '0.08em' }}>{COL_LABEL[c].toUpperCase()}</text>)}
                    {g.edges.map((e, i) => {
                        const a = pos.get(e.from); const b = pos.get(e.to);
                        if (!a || !b) return null;
                        const st = EDGE[e.style];
                        const on = linked(e.from) && linked(e.to) && (!focus || e.from === focus || e.to === focus);
                        return <path key={i} d={`M${a.x + 170} ${a.y + 12} C ${a.x + 190} ${a.y + 12}, ${b.x - 20} ${b.y + 12}, ${b.x} ${b.y + 12}`} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} opacity={on ? 0.95 : 0.12} />;
                    })}
                    {g.nodes.map(n => {
                        const p = pos.get(n.id)!;
                        const on = linked(n.id);
                        return (
                            <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={on ? 1 : 0.25} style={{ cursor: 'pointer' }} onClick={() => setFocus(focus === n.id ? null : n.id)}>
                                <rect width="170" height="24" rx={n.type === 'agent' ? 12 : 6} fill={n.error ? '#fbe7e5' : FILL[n.type]} stroke={n.error ? '#b4312a' : STROKE[n.type]} />
                                <text x="10" y="16" fontSize="11" fill={n.type === 'core' ? '#ffffff' : '#18212f'}>{n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}{n.type === 'tool' && n.risk ? ` · ${n.risk}` : ''}{n.type === 'agent' && n.installations ? ` · ${n.active}/${n.installations}` : ''}</text>
                                <title>{n.label}{n.type === 'agent' ? ` — ${n.installations} instalaciones, ${n.active} activas` : ''}</title>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}
