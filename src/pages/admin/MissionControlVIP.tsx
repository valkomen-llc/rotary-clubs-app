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
    Mail
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
}

interface Goal {
    id: string;
    title: string;
    description: string;
    status: 'active' | 'completed' | 'paused';
    progress: number;
    total: number;
    current: number;
    assignedAgents: string[];
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
    details?: {
        gaps: string[];
        quality: string;
        source: string;
        link: string;
    }
}

interface ActivityLog {
    id: string;
    agentName: string;
    content: string;
    time: string;
    type: 'peer_review' | 'heartbeat' | 'execution';
}

// --- MOCK DATA BASED ON SCREENSHOTS ---
const AGENTS: Agent[] = [
    { id: 'rafael', name: 'Rafael', icon: '🤖', color: 'bg-blue-600', status: 'online' },
    { id: 'mateo', name: 'Mateo', icon: '🍷', color: 'bg-red-600', status: 'busy' },
    { id: 'sofia', name: 'Sofía', icon: '⚔️', color: 'bg-slate-700', status: 'online' },
    { id: 'valeria', name: 'Valeria', icon: '🐉', color: 'bg-emerald-600', status: 'busy' },
    { id: 'diego', name: 'Diego', icon: '🐺', color: 'bg-amber-600', status: 'idle' },
];
import { IMPLEMENTATIONS } from './DashboardOverview';

const INITIAL_GOALS: Goal[] = IMPLEMENTATIONS.filter(i => i.status === 'active').map(impl => ({
    id: impl.id,
    title: impl.name,
    description: impl.description,
    status: 'active',
    current: impl.load > 0 ? impl.load : 50,
    total: 100,
    progress: impl.load > 0 ? impl.load : 50,
    assignedAgents: ['rafael', 'mateo', 'valeria', 'sofia', 'diego'].slice(0, impl.agents || 2),
}));

const INITIAL_TASKS: Task[] = [
    { 
        id: 'gx-1', 
        title: 'Actualizar prompt base de Elena', 
        description: 'Enseñar a la orquestadora a reconocer eventos new_grant_found.', 
        category: 'Grand Scope', 
        agentId: 'valeria', 
        time: '1h ago', 
        priority: 'Medium', 
        status: 'todo' 
    },
    { 
        id: 'gx-2', 
        title: 'Configurar Workflow en n8n', 
        description: 'Construir el scraper de SECOP II y USAID, e integrarlo con Gemini 1.5.', 
        category: 'Grand Scope', 
        agentId: 'rafael', 
        time: '4h ago', 
        priority: 'High', 
        status: 'in_progress' 
    },
    { 
        id: 'gx-3', 
        title: 'Crear tabla FundingOpportunity en DB', 
        description: 'Diseñar esquema migratorio de PostgreSQL para almacenar historiales de subvenciones.', 
        category: 'Grand Scope', 
        agentId: 'diego', 
        time: '2d ago', 
        priority: 'High', 
        status: 'done',
        details: {
            gaps: ["Relación Many-to-Many con la tabla 'Club' pendiente de documentar."],
            quality: "Optimizada para búsquedas indexadas y filtros de Áreas de Enfoque.",
            source: "Terminal - Prisma Schema",
            link: "https://github.com/valkomen-llc/rotary-clubs-app"
        }
    },
    { 
        id: 'gx-4', 
        title: 'Diseñar plantilla en WhatsApp Meta', 
        description: 'Plantilla de HSM para que Camila dispare la alerta de financiación a Presidentes.', 
        category: 'Conversion', 
        agentId: 'mateo', 
        time: '5m ago', 
        priority: 'Low', 
        status: 'backlog' 
    }
];

const HQDashboard: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    
    // --- WHATSAPP BROADCAST MODAL (PREVIOUS FEATURE) ---
    const [showPublish, setShowPublish] = useState<any>(null);
    const [chats, setChats] = useState<any[]>([]);
    const [selectedChats, setSelectedChats] = useState<string[]>([]);
    const [isLoadingChats, setIsLoadingChats] = useState(false);

    // Filter tasks by columns
    const boardCols = {
        backlog: tasks.filter(t => t.status === 'backlog'),
        todo: tasks.filter(t => t.status === 'todo'),
        in_progress: tasks.filter(t => t.status === 'in_progress'),
        done: tasks.filter(t => t.status === 'done')
    };

    // Trigger n8n Webhook
    const handleShareGrant = async (network: 'whatsapp' | 'email', task: Task) => {
        const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://n8n.clubplatform.org/webhook/grant-distribution';
        try {
            const payload = {
                network,
                grantData: {
                    title: task.title,
                    description: task.description,
                    matchCategory: task.category
                },
                adminContact: 'admin@rotary4271.org',
                timestamp: new Date().toISOString()
            };
            
            // Execute silent fetch to n8n (no wait on UI blocking)
            fetch(`${webhookUrl}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => null); // Fail silently if no n8n server exists locally yet.

            alert(`¡Distribución vía ${network.toUpperCase()} iniciada! Se ha despachado el payload a n8n.`);
        } catch (error) {
            console.error("Error triggerring webhook:", error);
            alert(`Error simulando envío a n8n por ${network}.`);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#F1F5F9] text-gray-800 font-sans z-[9999] overflow-hidden flex flex-col">
            
            {/* AGENT BAR (TOP) */}
            <div className="h-14 bg-[#013388] px-4 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-2">
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mr-3">Agents</span>
                    {AGENTS.map(agent => (
                        <div key={agent.id} className="flex items-center gap-2 bg-black/20 hover:bg-black/30 px-3 py-1.5 rounded-lg border border-white/10 transition-all cursor-pointer">
                            <div className="relative">
                                <span className="text-sm">{agent.icon}</span>
                                <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#013388] ${agent.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            </div>
                            <span className="text-[11px] font-bold text-white pr-1">{agent.name}</span>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setShowSettings(!showSettings)} className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors">
                        <Settings className="w-5 h-5" />
                    </button>
                    <button onClick={() => window.close()} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* COLUMN 1: GOALS (LEFT) */}
                <div className="w-[300px] border-r border-gray-200 bg-white/50 flex flex-col">
                    <div className="p-4 flex items-center justify-between border-b border-gray-100 uppercase">
                        <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-[#013388]" />
                            <span className="text-[11px] font-black text-gray-400 tracking-widest">Goals</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400">{INITIAL_GOALS.length}</span>
                            <Plus className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {INITIAL_GOALS.map(goal => (
                            <div key={goal.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                                <div className="flex items-center justify-between mb-1.5">
                                    <h4 className="text-xs font-bold text-gray-800 leading-tight">{goal.title}</h4>
                                    <div className="bg-blue-50 text-[#013388] text-[9px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ml-2">Active</div>
                                </div>
                                <p className="text-[10px] text-gray-500 mb-3 leading-tight line-clamp-2">{goal.description}</p>
                                <div className="space-y-2">
                                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${goal.progress}%` }} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex -space-x-1">
                                            {goal.assignedAgents.map(aid => (
                                                <div key={aid} className="w-5 h-5 rounded-md bg-gray-100 border border-white flex items-center justify-center text-[9px] shadow-sm">
                                                    {AGENTS.find(a => a.id === aid)?.icon}
                                                </div>
                                            ))}
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-400 tracking-tighter">{goal.current}/{goal.total} ({goal.progress}%)</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* COLUMN 2: ACTIVITY FEED */}
                <div className="w-[340px] border-r border-gray-200 bg-white flex flex-col">
                    <div className="p-4 flex items-center justify-between border-b border-gray-100 uppercase">
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-[#013388]" />
                            <span className="text-[11px] font-black text-gray-400 tracking-widest">Activity</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400">60</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {INITIAL_TASKS.filter(t => t.status === 'done').map(task => (
                            <div key={task.id} onClick={() => setSelectedTask(task)} className="p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer group">
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm shrink-0 border border-gray-200">
                                        {AGENTS.find(a => a.id === task.agentId)?.icon}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-gray-800 leading-tight mb-1">
                                            <span className="text-[#013388]">{AGENTS.find(a => a.id === task.agentId)?.name}</span> Peer reviewed: {task.title}
                                        </p>
                                        <span className="text-[9px] text-gray-400 font-bold uppercase">{task.time}</span>
                                    </div>
                                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MessageCircle className="w-3.5 h-3.5 text-gray-300" />
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* Heartbeat logs */}
                        <div className="p-4 flex gap-3 opacity-60">
                             <div className="w-8 h-8 flex items-center justify-center text-sm">🛡️</div>
                             <div>
                                 <p className="text-[11px] font-bold text-gray-400 underline decoration-dotted">Samwell Tarly Heartbeat check: no tasks or reviews pending</p>
                                 <span className="text-[9px] text-gray-400 font-bold uppercase">10m ago</span>
                             </div>
                             <div className="ml-auto">🗃️</div>
                        </div>
                    </div>
                </div>

                {/* KANBAN BOARD (RIGHT) */}
                <div className="flex-1 bg-gray-50/30 flex overflow-x-auto pb-4 custom-scrollbar">
                    {Object.entries(boardCols).map(([key, colTasks]) => (
                        <div key={key} className="w-[300px] shrink-0 flex flex-col p-4 gap-4 border-r border-gray-200 last:border-0">
                            <div className="flex items-center justify-between px-2 uppercase">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${key === 'done' ? 'bg-[#F7A81B]' : 'bg-gray-400'}`} />
                                    <span className="text-[11px] font-black text-gray-400 tracking-widest">{key.replace('_', ' ')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-gray-400">{colTasks.length}</span>
                                    <Plus className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                            </div>
                            <div className="flex-1 space-y-4">
                                {colTasks.map(t => (
                                    <div key={t.id} onClick={() => setSelectedTask(t)} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                                        <h5 className="text-[12px] font-bold text-gray-800 leading-snug mb-4 group-hover:text-[#013388]">{t.title}</h5>
                                        <div className="inline-block bg-gray-50 text-gray-400 text-[10px] font-bold px-2 py-1 rounded-lg mb-4 border border-gray-100">{t.category}</div>
                                        
                                        {key === 'done' && (
                                            <div className="flex items-center gap-2 mb-4 border-t border-gray-50 pt-3">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleShareGrant('whatsapp', t); }}
                                                    className="flex flex-1 items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors border border-emerald-100" 
                                                    title="Enviar vía WhatsApp"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    <span className="text-[9px] font-black uppercase tracking-wider">WhatsApp</span>
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleShareGrant('email', t); }}
                                                    className="flex flex-1 items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors border border-blue-100" 
                                                    title="Enviar Plantilla Correo"
                                                >
                                                    <Mail className="w-3.5 h-3.5" />
                                                    <span className="text-[9px] font-black uppercase tracking-wider">Email</span>
                                                </button>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between border-t border-gray-50 pt-3">
                                            <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-xs border border-gray-100">
                                                {AGENTS.find(a => a.id === t.agentId)?.icon}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full flex items-center justify-center text-[7px] text-white font-black ${t.priority === 'High' ? 'bg-red-500' : 'bg-gray-300'}`}>
                                                    {t.priority.charAt(0)}
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1 group-hover:text-gray-600 transition-colors">
                                                    <Loader2 className="w-3 h-3 opacity-50" /> {t.time}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* TASK DETAIL MODAL (PEER REVIEW STYLE) */}
            {selectedTask && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
                    <div className="bg-[#0F172A] w-full max-w-2xl rounded-[32px] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]">
                        <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-black/20">
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full text-white uppercase ${selectedTask.priority === 'High' ? 'bg-red-600' : 'bg-slate-700'}`}>High</span>
                                <span className="bg-slate-800 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">{selectedTask.category}</span>
                                <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">Peer Review</span>
                            </div>
                            <button onClick={() => setSelectedTask(null)} className="ml-auto p-2 hover:bg-white/10 rounded-xl transition-all">
                                <X className="w-5 h-5 text-white/50" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 text-slate-300">
                            <h2 className="text-xl font-black text-white mb-8 border-b border-white/5 pb-4 tracking-tight">{selectedTask.title}</h2>
                            
                            <div className="space-y-8">
                                {/* Search Logic Simulation */}
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-[#F7A81B] uppercase tracking-[0.2em] flex items-center gap-2">
                                        <SearchCode className="w-4 h-4" /> Búsqueda en {selectedTask.details?.source || 'Fuentes Globales'}
                                    </label>
                                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5 italic text-sm leading-relaxed">
                                        "{selectedTask.description}"
                                    </div>
                                </div>

                                {/* Gaps / Findings */}
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                         <Filter className="w-4 h-4" /> Brechas en la comunidad (AI Analysis)
                                    </label>
                                    <ul className="space-y-3">
                                        {(selectedTask.details?.gaps || ["Analizando respuesta en tiempo real...", "Extrayendo TDRs prioritarios..."]).map((gap, i) => (
                                            <li key={i} className="flex gap-3 text-sm font-medium">
                                                <span className="text-white/30">{i + 1}.</span>
                                                <span>{gap}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Peer Review Conclusion */}
                                <div className="p-6 bg-slate-900 border border-white/5 rounded-3xl">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 rounded-lg bg-red-800/30 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-500/10">🍷</div>
                                        <div>
                                            <p className="text-[11px] font-black text-white uppercase leading-none">Mateo <span className="text-white/40 not-italic font-medium lowercase">4m ago • Resolve</span></p>
                                        </div>
                                    </div>
                                    <div className="text-sm font-medium leading-relaxed pl-11">
                                        <p className="mb-4">PEER REVIEW Real Research: Excellent—5 real posts, Opp #1 PERFECT (explicitly wants AI video tools). Authentic protocol (no Rotary in first reply), variety (Help/Learning/Question), public only.</p>
                                        <div className="space-y-2 text-white/70">
                                            <p className="text-[10px] font-black text-[#F7A81B] uppercase tracking-widest mt-4">Response quality gaps:</p>
                                            <p>1. Opp #1 response TOO LONG (massive paragraph)—Reddit prefers 3-4 line bursts.</p>
                                            <p>2. Some pitchy despite "Help-Only" label: "We generate variants, test, scale winner" = marketing speak.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Chat Input */}
                        <div className="p-6 bg-black/40 border-t border-white/10 flex items-center gap-4">
                            <div className="flex-1 relative group">
                                <input 
                                    type="text" 
                                    placeholder="Instrucción adicional para el agente..." 
                                    className="w-full bg-slate-800/80 border border-white/10 p-4 pl-6 pr-14 rounded-2xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-[#013388]/50 transition-all placeholder:text-slate-600"
                                />
                                <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#013388] text-white p-2 rounded-xl">
                                    <ArrowRightCircle className="w-5 h-5" />
                                </button>
                            </div>
                            <button className="p-3 bg-red-600/10 text-red-500 border border-red-500/30 rounded-2xl hover:bg-red-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SETTINGS MODAL (API KEYS) */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[10001] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
                        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div className="flex items-center gap-3">
                                <Database className="w-5 h-5 text-[#013388]" />
                                <h3 className="font-black text-[#013388] uppercase tracking-widest text-xs">API Configuration</h3>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-200 rounded-xl transition-all">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-2">Apify API Key</label>
                                    <input type="password" placeholder="apify_proxy_..." className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold outline-none border-focus:border-[#013388]/30" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-2">Perplexity API Key</label>
                                    <input type="password" placeholder="pplx-..." className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold outline-none border-focus:border-[#013388]/30" />
                                </div>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
                                <ShieldCheck className="w-5 h-5 text-[#013388]" />
                                <p className="text-[9px] font-bold text-[#013388] uppercase leading-relaxed">Las llaves se guardarán en tu entorno seguro de Club Platform.</p>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="w-full py-5 bg-[#013388] text-white rounded-[32px] font-black uppercase text-xs tracking-widest hover:brightness-110 shadow-xl transition-all">Guardar Configuración</button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                @keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 0.5; } 50% { opacity: 0.3; } 100% { transform: scale(1.3); opacity: 0; } }
            `}} />
        </div>
    );
};

export default HQDashboard;
