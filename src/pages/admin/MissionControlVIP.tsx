import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    Zap,
    Target,
    History,
    CheckCircle2,
    X,
    MoreHorizontal,
    MessageSquare,
    Loader2,
    ShieldCheck,
    AlertCircle,
    Activity,
    Terminal,
    Settings,
    Plus,
    Search,
    ChevronRight,
    SearchCode,
    Filter,
    MessageCircle,
    ArrowRightCircle,
    ExternalLink,
    Database,
    LineChart,
    Brain,
    ListChecks,
    Eye,
    RefreshCw
} from 'lucide-react';

const getApiBase = () => {
    const envApi = import.meta.env.VITE_API_URL;
    if (envApi && envApi !== '/api') return envApi.replace(/\/$/, '');
    return `${window.location.origin}/api`;
};

const API_BASE = getApiBase();

// --- DATA TYPES ---
interface Agent {
    id: string;
    name: string;
    icon: string;
    color: string;
    status: 'online' | 'busy' | 'idle';
    load: number;
}

interface Goal {
    id: string;
    title: string;
    status: 'active' | 'completed' | 'paused';
    progress: number;
    total: number;
    current: number;
    assignedAgents: string[];
    roadmap: string[];
}

interface Task {
    id: string;
    title: string;
    description: string;
    category: string;
    agentId: string;
    time: string;
    priority: 'High' | 'Medium' | 'Low';
    status: 'backlog' | 'todo' | 'in_progress' | 'peer_review' | 'done';
    subtasks: { text: string; done: boolean }[];
    details?: {
        gaps: string[];
        quality: string;
        source: string;
        link: string;
        thought: string;
    }
}

// --- MOCK DATA ---
const AGENTS: Agent[] = [
    { id: 'rafael', name: 'Rafael', icon: '🤖', color: 'bg-[#013388]', status: 'online', load: 85 },
    { id: 'mateo', name: 'Mateo', icon: '🍷', color: 'bg-red-700', status: 'busy', load: 40 },
    { id: 'sofia', name: 'Sofía', icon: '⚔️', color: 'bg-slate-700', status: 'online', load: 10 },
    { id: 'valeria', name: 'Valeria', icon: '🐉', color: 'bg-emerald-600', status: 'busy', load: 95 },
];

const INITIAL_GOALS: Goal[] = [
    { id: 'g1', title: 'Grand Scope: Subvenciones 2026', status: 'active', current: 8, total: 10, progress: 80, assignedAgents: ['rafael', 'mateo'], roadmap: ['Configuración de Scrapers', 'Validación de TDRs Salud', 'Drafting Automático', 'Aprobación Distrital'] },
    { id: 'g2', title: 'Market Rotary Districts', status: 'active', current: 8, total: 20, progress: 40, assignedAgents: ['sofia'], roadmap: ['Segmentación Meta', 'Creatividades IA', 'Lead Gen Funnel'] },
];

const INITIAL_TASKS: Task[] = [
    { id: 't1', title: 'Monitor and optimize live SECOP engagement', category: 'Grand Scope', agentId: 'rafael', time: '3h ago', priority: 'High', status: 'backlog', 
      subtasks: [{text: 'Scan Portal', done: true}, {text: 'Filter Health Projects', done: false}] },
    { id: 't4', title: 'Find Rotary threads to engage with', category: 'Market', agentId: 'rafael', time: '10d ago', priority: 'High', status: 'done', 
      subtasks: [{text: 'Search Reddit', done: true}],
      details: {
        gaps: ["Response length: Opp #3/5 are too long.", "Natural flow missing."],
        quality: "Excellent research scope.",
        thought: "Decidí priorizar Reddit sobre Twitter debido a la densidad de técnicos de Rotary activos en r/automation.",
        source: "Google Search + SECOP Portal",
        link: "https://secop.gov.co/query"
      }}
];

const HQDashboard: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [filterAgent, setFilterAgent] = useState<string | null>(null);
    const [expandedGoal, setExpandedGoal] = useState<string | null>(null);

    const boardCols = {
        backlog: tasks.filter(t => t.status === 'backlog'),
        todo: tasks.filter(t => t.status === 'todo'),
        in_progress: tasks.filter(t => t.status === 'in_progress'),
        done: tasks.filter(t => t.status === 'done')
    };

    return (
        <div className="fixed inset-0 bg-[#F8FAFC] text-slate-800 font-sans z-[9999] overflow-hidden flex flex-col">
            
            {/* AGENT BAR (HUD STYLE) */}
            <div className="h-16 bg-[#013388] px-6 flex items-center justify-between shadow-xl relative z-10">
                <div className="flex items-center gap-4 flex-1 overflow-x-auto scrollbar-hide py-2">
                    <div className="flex items-center gap-2 border-r border-white/20 pr-6 mr-2">
                         <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                             <Fingerprint className="text-white w-5 h-5" />
                         </div>
                         <div className="hidden sm:block leading-none">
                             <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">HQ Sector</p>
                             <p className="text-xs font-black text-white">COLOMBIA-4281</p>
                         </div>
                    </div>
                    {AGENTS.map(agent => (
                        <div key={agent.id} 
                             onClick={() => setFilterAgent(filterAgent === agent.id ? null : agent.id)}
                             className={`flex items-center gap-3 px-4 py-2 rounded-[14px] transition-all cursor-pointer border ${filterAgent === agent.id ? 'bg-white/20 border-white/40 scale-105' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                            <div className="relative">
                                <span className="text-base">{agent.icon}</span>
                                <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#013388] ${agent.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            </div>
                            <div className="hidden lg:block min-w-[60px]">
                                <p className="text-[10px] font-black text-white leading-none mb-1">{agent.name}</p>
                                <div className="h-0.5 w-full bg-white/10 rounded-full">
                                    <div className="h-full bg-[#f7a81b] transition-all" style={{ width: `${agent.load}%` }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setShowSettings(!showSettings)} className="text-white hover:bg-white/10 p-2.5 rounded-xl transition-all border border-white/10 active:scale-95">
                        <Settings className="w-5 h-5" />
                    </button>
                    <button onClick={() => window.close()} className="bg-red-500/80 hover:bg-red-600 text-white p-2.5 rounded-xl transition-all border border-red-400/50">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* MAIN WORKSPACE */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* COLUMN 1: ESTRATEGIA (GOALS) */}
                <div className="w-[320px] border-r border-slate-200 bg-slate-50/50 flex flex-col p-4">
                    <div className="flex items-center justify-between mb-6 px-2">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#013388] flex items-center gap-2">
                           <LineChart className="w-4 h-4" /> Objetivos de Red
                        </h2>
                        <Plus className="w-4 h-4 text-slate-400 cursor-pointer hover:text-[#013388]" />
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-hide">
                        {INITIAL_GOALS.map(goal => (
                            <div key={goal.id} className={`bg-white border rounded-[28px] p-5 shadow-sm transition-all duration-300 ${expandedGoal === goal.id ? 'border-[#013388] ring-4 ring-[#013388]/5 shadow-xl' : 'border-slate-100'}`} onClick={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}>
                                <div className="flex items-start justify-between mb-4">
                                    <h4 className="text-xs font-black text-slate-800 leading-tight uppercase tracking-tight">{goal.title}</h4>
                                    <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${expandedGoal === goal.id ? 'rotate-90' : ''}`} />
                                </div>
                                <div className="space-y-4">
                                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-[#013388] to-[#f7a81b] transition-all" style={{ width: `${goal.progress}%` }} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex -space-x-1.5">
                                            {goal.assignedAgents.map(aid => (
                                                <div key={aid} className="w-6 h-6 rounded-lg bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] shadow-sm">{AGENTS.find(a => a.id === aid)?.icon}</div>
                                            ))}
                                        </div>
                                        <span className="text-[10px] font-black text-slate-400">{goal.progress}%</span>
                                    </div>

                                    {expandedGoal === goal.id && (
                                        <div className="pt-4 border-t border-slate-50 space-y-2 animate-in slide-in-from-top-2">
                                            {goal.roadmap.map((step, i) => (
                                                <div key={step} className="flex items-center gap-3 group">
                                                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${i < goal.roadmap.length - 1 ? 'bg-[#013388] border-[#013388]' : 'border-slate-200'}`}>
                                                        {i < goal.roadmap.length - 1 && <CheckCircle2 className="w-2 h-2 text-white" />}
                                                    </div>
                                                    <span className={`text-[10px] font-bold ${i < goal.roadmap.length - 1 ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{step}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* COLUMN 2: NEURAL ACTIVITY FEED */}
                <div className="w-[360px] border-r border-slate-200 bg-white flex flex-col p-4">
                    <div className="flex items-center justify-between mb-6 px-2">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#013388] flex items-center gap-2">
                           <RefreshCw className="w-4 h-4" /> Neural Feed
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {INITIAL_TASKS.filter(t => !filterAgent || t.agentId === filterAgent).map(task => (
                            <div key={task.id} onClick={() => setSelectedTask(task)} className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-all cursor-pointer group rounded-2xl">
                                <div className="flex gap-4">
                                    <div className={`w-10 h-10 rounded-2xl ${AGENTS.find(a => a.id === task.agentId)?.color} flex items-center justify-center text-lg shrink-0 shadow-lg border border-white/20`}>
                                        {AGENTS.find(a => a.id === task.agentId)?.icon}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-bold text-slate-700 leading-snug mb-1">
                                            <span className="text-[#013388] font-black uppercase tracking-tight">{AGENTS.find(a => a.id === task.agentId)?.name}</span> 
                                            {task.status === 'done' ? ' finalizó revisión de: ' : ' procesando: '} 
                                            <span className="text-slate-800 italic">"{task.title}"</span>
                                        </p>
                                        <div className="flex items-center justify-between mt-2">
                                            <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{task.time}</span>
                                            {task.status === 'done' && <div className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase border border-emerald-100">Verified</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* KANBAN OPERATIVO (CENTRO) */}
                <div className="flex-1 bg-slate-50 flex overflow-x-auto p-6 gap-6 custom-scrollbar">
                    {Object.entries(boardCols).map(([key, colTasks]) => (
                        <div key={key} className="w-[320px] shrink-0 flex flex-col gap-6">
                            <div className="flex items-center justify-between px-3">
                                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${key === 'done' ? 'bg-[#f7a81b]' : 'bg-[#013388]/30'}`} /> {key}
                                </span>
                                <span className="bg-slate-200/50 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-full">{colTasks.length}</span>
                            </div>
                            <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar pr-2">
                                {colTasks.map(t => (
                                    <div key={t.id} onClick={() => setSelectedTask(t)} className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden">
                                        {t.priority === 'High' && <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500" />}
                                        <h5 className="text-[13px] font-black text-slate-800 leading-snug mb-4 group-hover:text-[#013388] transition-colors">{t.title}</h5>
                                        
                                        {/* SUBTASKS TOOL */}
                                        <div className="space-y-2 mb-6">
                                            {t.subtasks.map((st, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <CheckCircle2 className={`w-3.5 h-3.5 ${st.done ? 'text-emerald-500' : 'text-slate-200'}`} />
                                                    <span className={`text-[10px] font-bold ${st.done ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{st.text}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-sm border border-slate-100 group-hover:scale-110 transition-transform">
                                                    {AGENTS.find(a => a.id === t.agentId)?.icon}
                                                </div>
                                                <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-[#013388] border border-slate-100 group-hover:bg-slate-100 transition-all">
                                                    <MessageCircle className="w-4 h-4" />
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{t.time}</p>
                                                <p className="text-[9px] font-black text-[#013388] uppercase">{t.category}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* TASK INSPECTOR MODAL */}
            {selectedTask && (
                <div className="fixed inset-0 bg-[#001438]/80 backdrop-blur-xl z-[10000] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-[48px] border border-white/10 shadow-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="bg-[#013388] text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Protocol ID: 8821</div>
                                <div className="bg-[#F7A81B] text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{selectedTask.category}</div>
                            </div>
                            <button onClick={() => setSelectedTask(null)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all">
                                <X className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
                            <h2 className="text-2xl font-black text-slate-900 mb-8 border-b border-slate-100 pb-6 leading-tight italic tracking-tighter">
                                {selectedTask.title}
                            </h2>
                            
                            <div className="space-y-10">
                                {/* FUENTE Y THOUGHT */}
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-[#013388] uppercase tracking-[0.3em] flex items-center gap-2">
                                        <Brain className="w-4 h-4" /> AI Logical Thought
                                    </label>
                                    <div className="bg-[#F8FAFC] p-6 rounded-[32px] border border-slate-100 italic text-slate-700 text-sm leading-relaxed shadow-inner">
                                        "{selectedTask.details?.thought || 'Iniciando proceso de razonamiento distribuido...'}"
                                    </div>
                                </div>

                                {/* ANALYSIS GAPS */}
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                                         <SearchCode className="w-4 h-4" /> Gaps & Findigs
                                    </label>
                                    <div className="grid grid-cols-1 gap-3">
                                        {(selectedTask.details?.gaps || ["Buscando inconsistencias...", "Verificando TDRs..."]).map((gap, i) => (
                                            <div key={i} className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-[#013388]">{i+1}</div>
                                                <p className="text-xs font-bold text-slate-700">{gap}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* PEER REVIEW BUBBLE */}
                                <div className="bg-[#013388] rounded-[40px] p-8 text-white relative">
                                    <div className="absolute top-[-10px] left-8 w-4 h-4 bg-[#013388] rotate-45" />
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center shadow-xl">🍷</div>
                                        <div className="flex-1">
                                            <p className="text-xs font-black uppercase tracking-[0.2em]">Mateo • Peer Reviewer</p>
                                            <p className="text-[10px] text-white/60 font-black uppercase">Verified • 4m ago</p>
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold leading-relaxed space-y-4">
                                        <p>PEER REVIEW: El proceso de extracción en SECOP II ha sido exhaustivo. Se identificó la subvención "Salud Rural Distrital" como un match del 95% con los objetivos del club Buenaventura Pacífico.</p>
                                        <div className="bg-white/10 p-5 rounded-2xl border border-white/10">
                                            <p className="text-[10px] font-black text-[#F7A81B] uppercase mb-2">Quality Verdict:</p>
                                            <p className="text-xs opacity-90 italic">Excellent research scope. Response matches local Rotary dialect. Ready for Governor review.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AGENT INTERACTION */}
                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center gap-4">
                            <div className="flex-1 relative group">
                                <input type="text" placeholder="Dar instrucción táctica al agente..." className="w-full bg-white border border-slate-200 p-5 pl-8 pr-16 rounded-[28px] text-xs font-black text-slate-800 outline-none focus:ring-4 focus:ring-[#013388]/5 transition-all shadow-sm" />
                                <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#013388] text-white p-2.5 rounded-2xl hover:scale-105 transition-all"><ArrowRightCircle className="w-6 h-6" /></button>
                            </div>
                            <button className="p-4 bg-emerald-500 text-white rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"><CheckCircle2 className="w-6 h-6" /></button>
                        </div>
                    </div>
                </div>
            )}

            {/* API SETTINGS */}
            {showSettings && (
                <div className="fixed inset-0 bg-[#001438]/90 backdrop-blur-3xl z-[10001] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[56px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-12 duration-500">
                        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-3">
                                <Database className="w-6 h-6 text-[#013388]" />
                                <h3 className="font-black text-[#013388] uppercase tracking-widest text-xs">API Configuration</h3>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all"><X className="w-6 h-6 text-slate-400" /></button>
                        </div>
                        <div className="p-10 space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Apify API Key (Proxy Storage)</label>
                                    <input type="password" placeholder="apify_proxy_..." className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl text-sm font-black outline-none focus:border-[#013388]/30 transition-all font-mono" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Perplexity API Key (Deep Intelligence)</label>
                                    <input type="password" placeholder="pplx-..." className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl text-sm font-black outline-none focus:border-[#013388]/30 transition-all font-mono" />
                                </div>
                            </div>
                            <div className="p-6 bg-[#013388]/5 rounded-[32px] border border-[#013388]/10 flex items-center gap-4">
                                <ShieldCheck className="w-6 h-6 text-[#013388]" />
                                <p className="text-[10px] font-black text-[#013388] uppercase leading-relaxed font-sans">Las llaves se encriptarán y se guardarán en el núcleo seguro de Club Platform.</p>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="w-full py-6 bg-[#013388] text-white rounded-[32px] font-black uppercase text-xs tracking-[0.3em] hover:shadow-2xl shadow-[#013388]/20 transition-all active:scale-95">Memorizar Conexiones</button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(1,51,136,0.1); border-radius: 10px; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .shadow-full { shadow: 0 0 50px rgba(0,0,0,0.15); }
            `}} />
        </div>
    );
};

export default HQDashboard;
