import React, { useState, useEffect } from 'react';
import {
    BrainCircuit,
    Zap,
    Target,
    History,
    CheckCircle2,
    Clock,
    X,
    LayoutDashboard,
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
    const [isScouting, setIsScouting] = useState(false);
    const [scoutProgress, setScoutProgress] = useState(0);
    const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
    const [showPublish, setShowPublish] = useState<any>(null);
    const [showAllGoals, setShowAllGoals] = useState(false);

    const startScoutEngine = () => {
        if (isScouting) return;
        setIsScouting(true);
        setScoutProgress(0);
        
        const scoutLogs = [
            { agent: 'Rafael', msg: 'Iniciando Grand Scope Engine v4.2...', delay: 500, type: 'heartbeat' },
            { agent: 'Rafael', msg: 'Conectando con Google Search API & Perplexity...', delay: 2000, type: 'research' },
            { agent: 'Rafael', msg: 'Escaneando SECOP II & Portal USAID...', delay: 4000, type: 'research' },
            { agent: 'Rafael', msg: 'Identificada Subvención Global: Rotary Foundation #2501', delay: 7000, type: 'execution' },
            { agent: 'Rafael', msg: 'Analizando TDRs con IA comercial...', delay: 10000, type: 'peer_review' }
        ];

        scoutLogs.forEach((log, index) => {
            setTimeout(() => {
                const agent = VIP_AGENTS.find(a => a.name === log.agent) || VIP_AGENTS[0];
                const newTask: Task = {
                    id: Math.random().toString(),
                    agentName: agent.name,
                    agentColor: agent.color,
                    content: log.msg,
                    time: 'Ahora',
                    type: log.type as any,
                    status: index === scoutLogs.length - 1 ? 'in_progress' : 'done'
                };
                setTasks(prev => [newTask, ...prev.slice(0, 15)]);
                setScoutProgress((index + 1) * (100 / scoutLogs.length));
                
                if (index === scoutLogs.length - 1) {
                    setIsScouting(false);
                    const grandTask: Task = {
                        id: 'grant-' + Date.now(),
                        agentName: 'Rafael',
                        agentColor: 'bg-emerald-600',
                        content: 'Subvención Rotary Foundation: Detectado Nuevo Fondo de Salud',
                        time: 'Ahora',
                        type: 'execution',
                        status: 'done'
                    };
                    setTasks(prev => [grandTask, ...prev]);
                }
            }, log.delay);
        });
    };

    useEffect(() => {
        const interval = setInterval(() => {
            if (isScouting) return;
            const agent = VIP_AGENTS[Math.floor(Math.random() * VIP_AGENTS.length)];
            const newLog: Task = {
                id: Math.random().toString(),
                agentName: agent.name,
                agentColor: agent.color,
                content: `Monitoreo estable en ${agent.role}...`,
                time: 'Ahora',
                type: 'heartbeat',
                status: 'done'
            };
            setTasks(prev => [newLog, ...prev.slice(0, 15)]);
        }, 12000);
        return () => clearInterval(interval);
    }, [isScouting]);

    const handlePublish = (task: Task) => {
        setShowPublish({
            hook: "🚀 ¡Nueva oportunidad detectada para Rotary!",
            context: task.content,
            ctaLabel: "Ver detalles y postularse",
            url: "https://clubplatform.org/grants/rf-2501",
            imageUrl: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?q=80&w=2670&auto=format&fit=crop"
        });
    };

    return (
        <div className="fixed inset-0 bg-[#F4F7FA] text-gray-700 font-sans z-[9999] overflow-hidden flex flex-col">
            
            {/* TOP BAR */}
            <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0 shadow-sm relative z-[100]">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#013388] rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 text-white">
                            <BrainCircuit className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-[#013388] font-black text-lg uppercase tracking-tight leading-none italic">Mission Control VIP</h1>
                            <span className="text-[10px] text-gray-400 font-bold tracking-[0.2em] uppercase">Club Platform Gateway</span>
                        </div>
                    </div>
                </div>

                {isScouting && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100">
                        <div className="h-full bg-gradient-to-r from-[#013388] via-[#F7A81B] to-[#013388] transition-all duration-300" style={{ width: `${scoutProgress}%` }} />
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <button onClick={startScoutEngine} disabled={isScouting} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isScouting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#013388] text-white hover:bg-[#00246B] active:scale-95'}`}>
                        <Zap className={`w-4 h-4 ${isScouting ? 'animate-spin' : ''}`} />
                        {isScouting ? 'Scouting...' : 'Scout Engine'}
                    </button>
                    <button onClick={() => window.close()} className="bg-gray-100 hover:bg-gray-200 text-gray-500 p-2.5 rounded-xl transition-all border border-gray-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* MAIN WORKSPACE */}
            <main className="flex-1 flex overflow-hidden p-8 gap-8">
                
                {/* COLUMN 1: GOALS */}
                <section className="w-[320px] flex flex-col gap-6 shrink-0 z-10">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-[11px] uppercase font-black tracking-[0.2em] text-[#013388] flex items-center gap-2">
                            <LayoutDashboard className="w-4 h-4" /> Objetivos de Red
                        </h2>
                        <button onClick={() => setShowAllGoals(true)} className="text-[10px] font-black text-gray-400 hover:text-[#013388] underline transition-colors">VER TODO</button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                        {goals.map(goal => (
                            <div key={goal.id} onClick={() => setSelectedGoal(goal)} className="bg-white border border-gray-100 rounded-3xl p-5 hover:border-blue-300 hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <span className="text-[9px] font-black text-[#F7A81B] border border-orange-100 bg-orange-50 px-2 py-0.5 rounded-full mb-2 inline-block uppercase">{goal.category}</span>
                                        <h3 className="text-sm font-bold text-gray-900 leading-snug">{goal.title}</h3>
                                    </div>
                                    <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-[#013388]" />
                                </div>
                                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#013388] transition-all duration-1000" style={{ width: `${goal.progress}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* COLUMN 2: ACTIVITY FEED */}
                <section className="w-[420px] flex flex-col bg-white rounded-[32px] border border-gray-200 overflow-hidden shadow-xl shadow-blue-900/5 shrink-0 z-10">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white text-[#013388]">
                        <h2 className="text-xs uppercase font-black tracking-[0.2em] flex items-center gap-2">
                            <History className="w-5 h-5" /> Centro de Actividad
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                        {tasks.map(task => (
                            <div key={task.id} className="group border-b border-gray-50 pb-5 last:border-0 hover:bg-gray-50/50 p-3 -mx-3 rounded-2xl transition-all">
                                <div className="flex items-start gap-4">
                                    <div className={`w-9 h-9 rounded-xl ${task.agentColor} flex items-center justify-center text-white text-xs font-black shrink-0`}>
                                        {task.agentName.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] text-gray-600 leading-relaxed font-bold">{task.content}</p>
                                        {task.status === 'done' && task.type !== 'heartbeat' && (
                                            <button onClick={() => handlePublish(task)} className="mt-2 text-[10px] font-black text-[#013388] flex items-center gap-1 hover:underline">
                                                <MoreHorizontal className="w-3.5 h-3.5" /> PREPARAR PUBLICACIÓN
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* COLUMN 3: KANBAN & PLANS */}
                <section className="flex-1 flex flex-col gap-6 overflow-hidden z-10">
                    <div className="flex items-center gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
                        <Zap className="w-5 h-5 text-[#F7A81B]" />
                        <div>
                            <h3 className="text-xs font-black text-[#013388] uppercase tracking-wider">Plan en Marcha: Grand Scope</h3>
                            <p className="text-[10px] text-gray-400 font-medium">Automatización Activa · Subagentes Operativos</p>
                        </div>
                    </div>
                    
                    <div className="flex-1 flex gap-6 overflow-x-auto pb-4 custom-scrollbar">
                        {['Pendiente', 'En Proceso', 'Finalizado'].map(col => (
                            <div key={col} className="w-[300px] shrink-0 flex flex-col gap-4">
                                <h4 className="text-[11px] uppercase font-black tracking-widest text-gray-400 px-2">{col}</h4>
                                <div className="flex-1 bg-gray-50/50 rounded-[32px] p-4 flex flex-col gap-4 border border-dashed border-gray-200">
                                    {tasks.filter(t => t.status === (col === 'Pendiente' ? 'backlog' : col === 'En Proceso' ? 'in_progress' : 'done')).slice(0, 5).map(t => (
                                        <div key={t.id} className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm hover:shadow-md transition-all">
                                            <p className="text-[11px] font-bold text-gray-800">{t.content}</p>
                                            {col === 'Finalizado' && t.type !== 'heartbeat' && (
                                                <button onClick={() => handlePublish(t)} className="mt-3 w-full py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-100 transition-colors">
                                                    Compartir en WhatsApp
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            {/* MODALS */}
            {(selectedGoal || showAllGoals) && (
                <div className="fixed inset-0 bg-[#013388]/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-fade-in relative">
                        <div className="p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div className="bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                                    <span className="text-[10px] font-black text-[#F7A81B] uppercase tracking-[0.2em]">OPERACIONES IA</span>
                                </div>
                                <button onClick={() => { setSelectedGoal(null); setShowAllGoals(false); }} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            <h2 className="text-3xl font-black text-[#013388] mb-4">{selectedGoal?.title || "Todos los Objetivos"}</h2>
                            <div className="grid grid-cols-2 gap-6 mb-8">
                                <div className="bg-gray-50 p-6 rounded-[32px] border border-gray-100 text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Pasos Ejecutados</p>
                                    <p className="text-4xl font-black text-[#013388]">12/15</p>
                                </div>
                                <div className="bg-gray-50 p-6 rounded-[32px] border border-gray-100 text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">IA Hallazgos</p>
                                    <p className="text-4xl font-black text-emerald-500">04</p>
                                </div>
                            </div>
                            <button className="w-full py-4 bg-[#013388] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-[#00246B] transition-all shadow-xl shadow-blue-900/20">
                                Activar Plan de Operación
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPublish && (
                <div className="fixed inset-0 bg-[#013388]/60 backdrop-blur-md z-[300] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-fade-in flex flex-col">
                        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-black text-[#013388] uppercase tracking-widest text-xs">Previsualización WhatsApp</h3>
                            <button onClick={() => setShowPublish(null)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto">
                            <div className="bg-[#E4FDDB] rounded-3xl p-6 border border-[#BDE0A8] shadow-inner font-sans text-sm text-[#111B21] space-y-4 max-w-sm mx-auto relative">
                                <span className="absolute -top-3 left-6 bg-[#128C7E] text-white px-2 py-0.5 rounded text-[8px] font-black tracking-widest">WHATSAPP PREVIEW</span>
                                <img src={showPublish.imageUrl} className="w-full h-40 object-cover rounded-2xl" alt="Preview" />
                                <div className="space-y-3">
                                    <p className="font-bold text-[#128C7E] leading-tight">{showPublish.hook}</p>
                                    <p className="leading-relaxed opacity-90">{showPublish.context}</p>
                                    <p className="text-[#34B7F1] font-bold underline truncate">{showPublish.url}</p>
                                    <div className="bg-white/50 p-2 rounded-lg border border-black/5 flex items-center justify-between text-[10px] font-bold">
                                        <span>{showPublish.ctaLabel}</span>
                                        <ArrowUpRight className="w-3 h-3" />
                                    </div>
                                </div>
                            </div>
                            <button className="mt-8 w-full py-4 bg-[#25D366] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-[#128C7E] transition-all flex items-center justify-center gap-3">
                                Enviar a WhatsApp Beta
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HQDashboard;
