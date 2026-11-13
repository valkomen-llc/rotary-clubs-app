// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — /admin/agentes (v4.1329.0: + Dirección IA)
//
// Reemplaza la pantalla de «Agentes expertos» y su menú de botones
// deshabilitados (Task Queue, Schedule, Activity Logs, Vector Memory). Cada
// sección muestra datos reales o no aparece: las que dependen de fases
// posteriores se suman cuando su fuente existe.
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, LayoutDashboard, Users, Globe2, PlugZap, Download, ShieldCheck, Settings2, ListChecks, CheckSquare, Workflow, Gauge, Rocket, Network, Activity, Database, FlaskConical, Blocks, BrainCircuit } from 'lucide-react';
import AdminLayout from '../../../components/admin/AdminLayout';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { ErrorNote } from './agentCenterUi';
import CommandOverview from './CommandOverview';
import RegistryTab from './RegistryTab';
import SiteTypesTab from './SiteTypesTab';
import InstallationsTab from './InstallationsTab';
import ImportTab from './ImportTab';
import GovernanceTab from './GovernanceTab';
import SettingsTab from './SettingsTab';
import TasksTab from './TasksTab';
import ApprovalsTab from './ApprovalsTab';
import WorkflowsTab from './WorkflowsTab';
import UsageTab from './UsageTab';
import DeploymentsTab from './DeploymentsTab';
import NetworkTab from './NetworkTab';
import SiteOverview from './SiteOverview';
import ObservabilityTab from './ObservabilityTab';
import KnowledgeTab from './KnowledgeTab';
import PilotTab from './PilotTab';
import BuilderTab from './BuilderTab';
import DirectorTab from './DirectorTab';

export interface SectionDef { key: string; label: string; icon: React.ElementType; group: string; site?: boolean; platform?: boolean }

export const SECTIONS: SectionDef[] = [
    { key: 'resumen', label: 'Resumen', icon: LayoutDashboard, group: 'Command Center', site: true },
    { key: 'direccion', label: 'Dirección IA', icon: BrainCircuit, group: 'Command Center', site: true },
    { key: 'agentes', label: 'Agentes', icon: Users, group: 'Command Center' },
    { key: 'instalaciones', label: 'Instalaciones', icon: PlugZap, group: 'Command Center', site: true },
    { key: 'despliegues', label: 'Despliegues', icon: Rocket, group: 'Command Center' },
    { key: 'mapa', label: 'Mapa', icon: Network, group: 'Command Center', site: true },
    { key: 'workflows', label: 'Workflows', icon: Workflow, group: 'Operación', site: true },
    { key: 'constructor', label: 'Constructor', icon: Blocks, group: 'Operación', site: true },
    { key: 'piloto', label: 'Piloto', icon: FlaskConical, group: 'Operación' },
    { key: 'tareas', label: 'Tareas', icon: ListChecks, group: 'Operación', site: true },
    { key: 'aprobaciones', label: 'Aprobaciones', icon: CheckSquare, group: 'Operación', site: true },
    { key: 'consumo', label: 'Consumo de IA', icon: Gauge, group: 'Operación', site: true },
    { key: 'observabilidad', label: 'Observabilidad', icon: Activity, group: 'Operación', site: true },
    { key: 'conocimiento', label: 'Conocimiento', icon: Database, group: 'Gobierno', site: true },
    { key: 'tipos', label: 'Tipos de sitio', icon: Globe2, group: 'Gobierno' },
    { key: 'importar', label: 'Repositorio', icon: Download, group: 'Gobierno' },
    { key: 'gobierno', label: 'Auditoría', icon: ShieldCheck, group: 'Gobierno' },
    { key: 'ajustes', label: 'Ajustes', icon: Settings2, group: 'Gobierno' },
];

function SectionBody({ section, meta, onNavigate }: { section: string; meta: Meta; onNavigate: (s: string) => void }) {
    switch (section) {
        case 'direccion': return <DirectorTab meta={meta} onNavigate={onNavigate} />;
        case 'agentes': return <RegistryTab meta={meta} />;
        case 'despliegues': return <DeploymentsTab meta={meta} />;
        case 'mapa': return <NetworkTab meta={meta} />;
        case 'instalaciones': return <InstallationsTab meta={meta} />;
        case 'workflows': return <WorkflowsTab meta={meta} />;
        case 'constructor': return <BuilderTab meta={meta} />;
        case 'piloto': return <PilotTab meta={meta} />;
        case 'tareas': return <TasksTab meta={meta} />;
        case 'aprobaciones': return <ApprovalsTab meta={meta} />;
        case 'consumo': return <UsageTab scope={meta.scope} />;
        case 'observabilidad': return <ObservabilityTab meta={meta} />;
        case 'conocimiento': return <KnowledgeTab meta={meta} />;
        case 'tipos': return <SiteTypesTab meta={meta} />;
        case 'importar': return <ImportTab meta={meta} />;
        case 'gobierno': return <GovernanceTab meta={meta} />;
        case 'ajustes': return <SettingsTab />;
        default: return meta.scope === 'site' ? <SiteOverview meta={meta} onNavigate={onNavigate} /> : <CommandOverview meta={meta} onNavigate={onNavigate} />;
    }
}

export default function AgentCommandCenter() {
    const [params, setParams] = useSearchParams();
    const [meta, setMeta] = useState<Meta | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Un sitio ve sólo sus secciones: lo que gobierna el ecosistema es de la plataforma.
    const visible = SECTIONS.filter(s => !meta || meta.scope === 'platform' || s.site);
    const section = visible.some(s => s.key === params.get('s')) ? (params.get('s') as string) : 'resumen';

    useEffect(() => {
        acApi<Meta>('/meta').then(setMeta).catch(e => setError(e.message));
    }, []);

    const go = (s: string) => setParams(prev => { const p = new URLSearchParams(prev); p.set('s', s); return p; }, { replace: true });

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <Bot className="w-7 h-7 text-rotary-blue" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Sistema · Agentes IA</p>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-800">AI Agent Command Center</h1>
                        <p className="text-sm text-gray-500">{meta?.scope === 'site' ? 'Los agentes de tu sitio: qué hacen, qué proponen y cuánto consumen.' : 'Centro de inteligencia, automatización y coordinación de agentes de Club Platform.'}</p>
                    </div>
                </div>

                <nav aria-label="Secciones del Command Center" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                    {visible.map(s => {
                        const Icon = s.icon;
                        const on = s.key === section;
                        return (
                            <button key={s.key} type="button" onClick={() => go(s.key)}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${on ? 'bg-blue-50 text-rotary-blue border-blue-100' : 'bg-white text-gray-500 border-gray-100 hover:text-gray-800 hover:border-gray-200'}`}>
                                <Icon className="w-4 h-4" />{s.label}
                            </button>
                        );
                    })}
                </nav>

                <ErrorNote message={error} />
                {meta ? <SectionBody section={section} meta={meta} onNavigate={go} /> : !error && <div className="text-sm text-gray-400">Cargando el Command Center…</div>}
            </div>
        </AdminLayout>
    );
}
