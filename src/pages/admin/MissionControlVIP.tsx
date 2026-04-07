import React, { useState, useEffect } from 'react';
import {
    BrainCircuit,
    Zap,
    Database,
    Target,
    History,
    CheckCircle2,
    Clock,
    X,
    LayoutDashboard,
    Search,
    Filter,
    MoreHorizontal,
    ArrowUpRight
} from 'lucide-react';

interface Agent {
    id: string;
    name: string;
    role: string;
    color: string;
    status: 'online' | 'processing' | 'idle';
    lastTask: string;
}

interface Goal {
    id: string;
    title: string;
    progress: number;
    status: 'active' | 'paused' | 'completed';
    category: string;
    assignedAgents: string[];
}

interface Task {
    id: string;
    agentName: string;
    agentColor: string;
    content: string;
    time: string;
    type: 'peer_review' | 'heartbeat' | 'execution' | 'research';
    status: 'backlog' | 'in_progress' | 'done';
}

const VIP_AGENTS: Agent[] = [
    { id: 'mateo', name: 'Mateo', role: 'Account Manager VIP', color: 'bg-[#013388]', status: 'online', lastTask: 'Analizando ROI Distrito' },
    { id: 'sofia', name: 'Sofía', role: 'Campaign Concierge', color: 'bg-[#D91B5C]', status: 'processing', lastTask: 'Estructurando Brief' },
    { id: 'diego', name: 'Diego', role: 'Customer Success Specialist', color: 'bg-[#005DAA]', status: 'idle', lastTask: 'Waiting...' },
    { id: 'valeria', name: 'Valeria', role: 'Institutional Comms', color: 'bg-[#F7A81B]', status: 'processing', lastTask: 'Drafting Newsletter' },
    { id: 'rafael', name: 'Rafael', role: 'Grant & Content Analyst', color: 'bg-emerald-600', status: 'online', lastTask: 'Scanning SECOP' },
];

const INITIAL_GOALS: Goal[] = [
    { id: 'g1', title: 'Fortalecimiento de Marca en Meta', category: 'DIFUSIÓN', progress: 85, status: 'active', assignedAgents: ['sofia', 'valeria'] },
    { id: 'g2', title: 'Identificación de Subvenciones Salud', category: 'FUNDACIÓN', progress: 40, status: 'active', assignedAgents: ['rafael', 'mateo'] },
    { id: 'g3', title: 'Optimización de Retención de Socios', category: 'MEMBRESÍA', progress: 10, status: 'paused', assignedAgents: ['diego'] },
];

const INITIAL_TASKS: Task[] = [
    { id: 't1', agentName: 'Rafael', agentColor: 'bg-emerald-600', content: 'Escaneando SECOP II: Detectada subvención USAID para salud rural.', time: '2m ago', type: 'research', status: 'in_progress' },
    { id: 't2', agentName: 'Sofía', agentColor: 'bg-[#D91B5C]', content: 'Brief generado para Campaña Polio Plus 2026.', time: '8m ago', type: 'execution', status: 'done' },
    { id: 't3', agentName: 'Valeria', agentColor: 'bg-[#F7A81B]', content: 'Revisión técnica de post para Instagram: Aprobado por Rafael.', time: '12m ago', type: 'peer_review', status: 'done' },
    { id: 't4', agentName: 'Mateo', agentColor: 'bg-[#013388]', content: 'Calculando impacto proyectado de subvención educativa global.', time: '15m ago', type: 'research', status: 'backlog' },
];

const HQDashboard: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
    const [goals] = useState<Goal[]>(INITIAL_GOALS);

    useEffect(() => {
        const interval = setInterval(() => {
            const agent = VIP_AGENTS[Math.floor(Math.random() * VIP_AGENTS.length)];
            const newLog: Task = {
                id: Math.random().toString(),
                agentName: agent.name,
                agentColor: agent.color,
                content: `Sistema estable monitoreando flujos de ${agent.role}...`,
                time: 'Ahora',
                type: 'heartbeat',
                status: 'done'
            };
            setTasks(prev => [newLog, ...prev.slice(0, 15)]);
        }, 8000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 bg-[#F4F7FA] text-gray-700 font-sans z-[9999] overflow-hidden flex flex-col">
            
            {/* TOP BAR: Rotary Professional Identity */}
            <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0 shadow-sm relative z-10">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#013388] rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                            <BrainCircuit className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-[#013388] font-black text-lg uppercase tracking-tight leading-none italic">Mission Control VIP</h1>
                            <span className="text-[10px] text-gray-400 font-bold tracking-[0.2em] uppercase">Club Platform Gateway</span>
                        </div>
                    </div>
                    <div className="h-8 w-[1px] bg-gray-200 hidden md:block" />
                    <div className="hidden md:flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                            <Target className="w-3.5 h-3.5 text-[#013388]" />
                            <span className="text-[11px] font-black text-[#013388] uppercase tracking-wider">{goals.filter(g => g.status === 'active').length} METAS ACTIVAS</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                    {VIP_AGENTS.map(agent => (
                        <div key={agent.id} className="group relative">
                            <div className={`w-10 h-10 rounded-xl ${agent.color} flex items-center justify-center text-white text-xs font-black shadow-sm group-hover:scale-105 transition-all cursor-pointer border-2 border-white`}>
                                {agent.name.charAt(0)}
                                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${agent.status === 'processing' ? 'bg-[#F7A81B] animate-pulse' : 'bg-emerald-500'}`} />
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 p-2 bg-white border border-gray-100 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                                <p className="text-[10px] font-black text-[#013388] uppercase">{agent.name}</p>
                                <p className="text-[9px] text-gray-500">{agent.role}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-6 mr-4 hidden lg:flex">
                        <div className="text-right">
                            <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest">Database</p>
                            <p className="text-xs font-bold text-gray-700 flex items-center justify-end gap-1.5">
                                <Database className="w-3 h-3 text-emerald-500" /> 14ms
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest">Uptime</p>
                            <p className="text-xs font-bold text-gray-700">99.98%</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => window.close()}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-500 p-2.5 rounded-xl transition-all border border-gray-200"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* MAIN WORKSPACE: Professional Grid Layout */}
            <main className="flex-1 flex overflow-hidden p-8 gap-8">
                
                {/* COLUMN 1: STRATEGIC GOALS */}
                <section className="w-[320px] flex flex-col gap-6 shrink-0">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-[11px] uppercase font-black tracking-[0.2em] text-[#013388] flex items-center gap-2">
                            <LayoutDashboard className="w-4 h-4" /> Objetivos de Red
                        </h2>
                        <button className="text-[10px] font-black text-gray-400 hover:text-[#013388] underline transition-colors">VER TODO</button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                        {goals.map(goal => (
                            <div key={goal.id} className="bg-white border border-gray-100 rounded-3xl p-5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-900/5 transition-all cursor-pointer group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/20 blur-2xl -mr-8 -mt-8 pointer-events-none" />
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <span className="text-[9px] font-black text-[#F7A81B] border border-orange-100 bg-orange-50 px-2 py-0.5 rounded-full mb-2 inline-block tracking-widest uppercase">
                                            {goal.category}
                                        </span>
                                        <h3 className="text-sm font-bold text-gray-900 leading-snug pr-4">{goal.title}</h3>
                                    </div>
                                    <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-[#013388] transition-colors" />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-[10px] font-black">
                                        <span className="text-gray-400">PROGRESO</span>
                                        <span className="text-[#013388]">{goal.progress}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                                        <div 
                                            className="h-full bg-gradient-to-r from-[#013388] to-[#005DAA] rounded-full transition-all duration-1000" 
                                            style={{ width: `${goal.progress}%` }} 
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-50">
                                    <div className="flex -space-x-2">
                                        {goal.assignedAgents.map(aid => {
                                            const ag = VIP_AGENTS.find(a => a.id === aid);
                                            return (
                                                <div key={aid} className={`w-7 h-7 rounded-lg ${ag?.color} flex items-center justify-center text-white text-[10px] font-black border-2 border-white shadow-sm`} title={ag?.name}>
                                                    {ag?.name.charAt(0)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${goal.status === 'active' ? 'bg-emerald-500' : 'bg-[#F7A81B]'}`} />
                                        <span className="text-[9px] font-black text-gray-400 tracking-wider uppercase">{goal.status}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* COLUMN 2: ACTIVITY STREAM (Professional Feed) */}
                <section className="w-[420px] flex flex-col bg-white rounded-[32px] border border-gray-200 overflow-hidden shadow-xl shadow-blue-900/5 shrink-0">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white text-[#013388]">
                        <h2 className="text-xs uppercase font-black tracking-[0.2em] flex items-center gap-2">
                            <History className="w-5 h-5" /> Centro de Actividad
                        </h2>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black text-gray-400">EN VIVO</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                        {tasks.map(task => (
                            <div key={task.id} className="group border-b border-gray-50 pb-5 last:border-0 hover:bg-gray-50/50 p-3 -mx-3 rounded-2xl transition-all">
                                <div className="flex items-start gap-4">
                                    <div className={`w-9 h-9 rounded-xl ${task.agentColor} flex items-center justify-center text-white text-xs font-black shrink-0 shadow-md border-2 border-white`}>
                                        {task.agentName.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-gray-900 uppercase tracking-tight">{task.agentName}</span>
                                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 text-[8px] font-black rounded uppercase tracking-widest">{task.type}</span>
                                            </div>
                                            <span className="text-[9px] font-black text-gray-300">{task.time}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-600 leading-relaxed font-medium">
                                            {task.content}
                                        </p>
                                        {task.type === 'peer_review' && (
                                            <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                <span className="text-[10px] font-bold text-emerald-800">Validación técnica completada</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* COLUMN 3: OPERATIONAL TASK BOARD (Kanban) */}
                <section className="flex-1 flex gap-8 overflow-x-auto pb-4 custom-scrollbar pr-4">
                    
                    {/* BACKLOG COLUMN */}
                    <div className="w-[380px] shrink-0 flex flex-col gap-6">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[11px] uppercase font-black tracking-[0.2em] text-[#013388]/60 flex items-center gap-2">
                                <Filter className="w-4 h-4" /> Pendiente
                            </span>
                        </div>
                        
                        <div className="flex-1 space-y-4 overflow-y-auto pr-2 scrollbar-hide">
                            <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-6 hover:shadow-lg transition-all cursor-grab active:cursor-grabbing border-l-4 border-l-gray-300">
                                <h4 className="text-sm font-black text-gray-900 mb-2 leading-tight">Auditoría Mensual Retención de Socios</h4>
                                <p className="text-[11px] text-gray-500 mb-5 leading-relaxed">Analizar curva de salida en clubes del Distrito 4271 durante el Q1.</p>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-[#F7A81B]" />
                                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Prioridad Alta</span>
                                    </div>
                                    <MoreHorizontal className="w-4 h-4 text-gray-300" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* IN PROGRESS COLUMN */}
                    <div className="w-[380px] shrink-0 flex flex-col gap-6">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[11px] uppercase font-black tracking-[0.2em] text-[#013388] flex items-center gap-2">
                                <Zap className="w-4 h-4" /> En Proceso
                            </span>
                        </div>

                        <div className="space-y-4">
                            {tasks.filter(t => t.status === 'in_progress').map(t => (
                                <div key={t.id} className="bg-white border border-blue-50 shadow-md rounded-[24px] p-6 relative overflow-hidden group border-l-4 border-l-[#013388]">
                                    <div className="flex items-center gap-2.5 mb-4">
                                        <div className={`w-6 h-6 rounded-lg ${t.agentColor} flex items-center justify-center text-white text-[9px] font-black`}>
                                            {t.agentName.charAt(0)}
                                        </div>
                                        <span className="text-[10px] font-black text-[#013388] uppercase tracking-wider">{t.agentName}</span>
                                    </div>
                                    <h4 className="text-sm font-black text-gray-900 mb-2 leading-tight">Analizando Datos de Subvenciones SECOP</h4>
                                    <p className="text-[11px] text-[#013388]/80 font-medium leading-relaxed mb-5 italic">"Cruzando términos de referencia con bases de datos de clubes calificados..."</p>
                                    <div className="flex items-center justify-between bg-blue-50/50 -mx-6 -mb-6 p-4 border-t border-blue-50">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5 text-[#013388] animate-pulse" />
                                            <span className="text-[10px] font-black text-[#013388] uppercase tracking-widest">Razonando</span>
                                        </div>
                                        <ArrowUpRight className="w-4 h-4 text-[#013388]" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* COMPLETED COLUMN */}
                    <div className="w-[380px] shrink-0 flex flex-col gap-6">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[11px] uppercase font-black tracking-[0.2em] text-emerald-600 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" /> Finalizado
                            </span>
                        </div>

                        <div className="space-y-4 opacity-70">
                            {tasks.filter(t => t.status === 'done' && t.type !== 'heartbeat').map(t => (
                                <div key={t.id} className="bg-white/60 border border-gray-100 rounded-[20px] p-4 group hover:opacity-100 transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-5 h-5 rounded ${t.agentColor} flex items-center justify-center text-white text-[8px] font-black`}>
                                                {t.agentName.charAt(0)}
                                            </div>
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-tight">{t.agentName}</h4>
                                        </div>
                                        <span className="text-[9px] font-black text-gray-300">Finalizado</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 italic line-clamp-1">{t.content}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            {/* STATUS BAR FOOTER: Professional Technical Monitoring */}
            <footer className="h-12 bg-[#013388] border-t border-blue-900 flex items-center justify-between px-10 shrink-0 font-bold text-[10px] tracking-widest uppercase text-white/50">
                <div className="flex gap-10">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                        <span className="text-white">SISTEMAS OPERATIVOS</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <ShieldCheckIcon className="w-4 h-4 text-blue-300" />
                        <span>AUTH WA: SECURED</span>
                    </div>
                </div>
                <div className="flex gap-8 items-center">
                    <span className="text-white/80">Valkomen Node 4271_V4.2</span>
                    <div className="h-4 w-[1px] bg-white/20" />
                    <span className="text-blue-300">© 2026 Club Platform</span>
                </div>
            </footer>
        </div>
    );
};

// Internal minimal svg for shield
const ShieldCheckIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);

export default HQDashboard;
