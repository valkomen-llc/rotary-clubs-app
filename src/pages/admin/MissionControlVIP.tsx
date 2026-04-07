import React, { useState, useEffect, useRef } from 'react';
import {
    BrainCircuit,
    Zap,
    Target,
    History,
    CheckCircle2,
    X,
    LayoutDashboard,
    MoreHorizontal,
    ArrowUpRight,
    MessageSquare,
    Loader2,
    ShieldCheck,
    AlertCircle,
    Activity,
    Cpu,
    Network,
    Terminal,
    ChevronRight,
    Power,
    Settings2,
    Search,
    Globe,
    Layers,
    Bot
} from 'lucide-react';

const getApiBase = () => {
    const envApi = import.meta.env.VITE_API_URL;
    if (envApi && envApi !== '/api') return envApi.replace(/\/$/, '');
    return `${window.location.origin}/api`;
};

const API_BASE = getApiBase();

interface Agent {
    id: string;
    name: string;
    role: string;
    color: string;
    status: 'online' | 'processing' | 'idle';
    lastTask: string;
}

interface ActionPlan {
    id: string;
    title: string;
    description: string;
    isActive: boolean;
    progress: number;
    subtasks: string[];
    agents: string[];
}

interface LogEntry {
    id: string;
    agentName: string;
    agentColor: string;
    mainActivity: string;
    subtask: string;
    time: string;
    type: 'peer_review' | 'heartbeat' | 'execution' | 'research' | 'alert';
    status: 'done' | 'processing' | 'pending';
}

const VIP_AGENTS: Agent[] = [
    { id: 'rafael', name: 'Rafael', role: 'Grant Intelligence Expert', color: 'bg-indigo-500', status: 'online', lastTask: 'Scanning SECOP II' },
    { id: 'mateo', name: 'Mateo', role: 'Strategic ROI Analyst', color: 'bg-blue-600', status: 'online', lastTask: 'Calculating Grant Impacts' },
    { id: 'sofia', name: 'Sofía', role: 'Campaign Concierge', color: 'bg-rose-500', status: 'idle', lastTask: 'Waiting for leads' },
    { id: 'valeria', name: 'Valeria', role: 'Institutional Comms', color: 'bg-amber-500', status: 'processing', lastTask: 'Drafting announcement' },
];

const INITIAL_PLANS: ActionPlan[] = [
    {
        id: 'grand-scope',
        title: 'Grand Scope Engine',
        description: 'Gestión Automatizada de Subvenciones (SECOP II, USAID, Rotary Foundation)',
        isActive: true,
        progress: 68,
        subtasks: ['Escaneo de Bases de Datos', 'Filtrage por TDRs', 'Análisis de Viabilidad IA', 'Generación de Borradores'],
        agents: ['rafael', 'mateo']
    },
    {
        id: 'membership-pulse',
        title: 'Membership Pulse IQ',
        description: 'Análisis de retención y captación de nuevos socios vía IA predictiva.',
        isActive: false,
        progress: 0,
        subtasks: ['Análisis de Churn', 'Lead Scoring Socios', 'Plan de Onboarding'],
        agents: ['sofia']
    },
    {
        id: 'brand-amplifier',
        title: 'Brand Amplifier VIP',
        description: 'Orquestación de imagen pública e impacto institucional en redes.',
        isActive: true,
        progress: 45,
        subtasks: ['Monitor de Menciones', 'Drafting Automático', 'Schedule de Ráfagas'],
        agents: ['valeria', 'sofia']
    }
];

const HQDashboard: React.FC = () => {
    const [plans, setPlans] = useState<ActionPlan[]>(INITIAL_PLANS);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [showPublish, setShowPublish] = useState<any>(null);
    const [chats, setChats] = useState<any[]>([]);
    const [selectedChats, setSelectedChats] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingChats, setIsLoadingChats] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0 });
    const [sendSuccess, setSendSuccess] = useState(false);

    const logsEndRef = useRef<HTMLDivElement>(null);

    // Initial Logs
    useEffect(() => {
        const initialLogs: LogEntry[] = [
            { id: '1', agentName: 'Rafael', agentColor: 'bg-indigo-500', mainActivity: 'Grand Scope Engine', subtask: 'Conectado a SECOP II API: Filtrando subvenciones de salud.', time: '2m', type: 'research', status: 'done' },
            { id: '2', agentName: 'Mateo', agentColor: 'bg-blue-600', mainActivity: 'Grand Scope Engine', subtask: 'Analizando ROI de Subvención RF-2025: Impacto proyectado 45%.', time: '5m', type: 'execution', status: 'done' },
            { id: '3', agentName: 'Valeria', agentColor: 'bg-amber-500', mainActivity: 'Brand Amplifier', subtask: 'Generando post institucional: Campaña Polio Plus.', time: '10m', type: 'execution', status: 'done' },
        ];
        setLogs(initialLogs);
    }, []);

    // Neural Feed Logic
    useEffect(() => {
        const interval = setInterval(() => {
            const activePlans = plans.filter(p => p.isActive);
            if (activePlans.length === 0) return;

            const randomPlan = activePlans[Math.floor(Math.random() * activePlans.length)];
            const randomAgentId = randomPlan.agents[Math.floor(Math.random() * randomPlan.agents.length)];
            const agent = VIP_AGENTS.find(a => a.id === randomAgentId) || VIP_AGENTS[0];
            const randomSubtask = randomPlan.subtasks[Math.floor(Math.random() * randomPlan.subtasks.length)];

            const newLog: LogEntry = {
                id: Math.random().toString(),
                agentName: agent.name,
                agentColor: agent.color,
                mainActivity: randomPlan.title,
                subtask: `${randomSubtask}: Procesamiento neuronal activo...`,
                time: 'Ahora',
                type: 'heartbeat',
                status: 'processing'
            };

            setLogs(prev => [newLog, ...prev.slice(0, 20)]);
        }, 8000);
        return () => clearInterval(interval);
    }, [plans]);

    const togglePlan = (id: string) => {
        setPlans(prev => prev.map(p => {
            if (p.id === id) {
                const newState = !p.isActive;
                // Add activation log
                const log: LogEntry = {
                    id: Math.random().toString(),
                    agentName: 'System',
                    agentColor: 'bg-slate-900',
                    mainActivity: p.title,
                    subtask: newState ? 'MOTOR INICIADO: Cargando protocolos distribuidos.' : 'MOTOR DETENIDO: Hibernando agentes.',
                    time: 'Ahora',
                    type: newState ? 'execution' : 'alert',
                    status: 'done'
                };
                setLogs(prevLogs => [log, ...prevLogs]);
                return { ...p, isActive: newState };
            }
            return p;
        }));
    };

    // WhatsApp Fetch (only when modal opens)
    useEffect(() => {
        if (showPublish) {
            const token = localStorage.getItem('rotary_token');
            setIsLoadingChats(true);
            setFetchError(null);
            const url = `${API_BASE}/whatsapp-qr/chats?cb=${Date.now()}`;
            
            fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
                .then(async r => {
                    if (!r.ok) throw new Error(`Status ${r.status}`);
                    return r.json();
                })
                .then(data => {
                    if (data.success) setChats(data.chats || []);
                    else setFetchError(data.error || 'Gateway offline');
                })
                .catch(e => setFetchError(`Error de Sincronización: ${e.message}`))
                .finally(() => setIsLoadingChats(false));
        }
    }, [showPublish]);

    const handlePublish = (log: LogEntry) => {
        setSendSuccess(false);
        setSelectedChats([]);
        setShowPublish({
            hook: `🚀 Actualización de ${log.mainActivity}`,
            context: log.subtask,
            ctaLabel: "Ver Detalles en HQ",
            url: "https://clubplatform.org/hq/grand-scope",
            imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2672&auto=format&fit=crop"
        });
    };

    const sendToWhatsApp = async () => {
        if (selectedChats.length === 0 || isSending) return;
        setIsSending(true);
        setSendingProgress({ current: 0, total: selectedChats.length });
        const token = localStorage.getItem('rotary_token');

        for (let i = 0; i < selectedChats.length; i++) {
            const chatId = selectedChats[i];
            setSendingProgress(p => ({ ...p, current: i + 1 }));
            if (i > 0) await new Promise(r => setTimeout(r, 4000 + Math.random() * 1000));

            try {
                const message = `*${showPublish.hook}*\n\n${showPublish.context}\n\n🔗 *${showPublish.ctaLabel}:*\n${showPublish.url}`;
                await fetch(`${API_BASE}/whatsapp-qr/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ chatId, message })
                });
            } catch (e) { console.error(e); }
        }
        setSendSuccess(true);
        setIsSending(false);
        setTimeout(() => { setShowPublish(null); setSendSuccess(false); }, 3000);
    };

    return (
        <div className="fixed inset-0 bg-[#000814] text-slate-300 font-sans z-[9999] overflow-hidden flex flex-col selection:bg-[#F7A81B]/30">
            
            {/* AMBIENT BACKGROUND */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#013388] rounded-full blur-[150px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#F7A81B] rounded-full blur-[150px]" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            </div>

            {/* TOP BAR - FUTURISTIC HUD */}
            <header className="h-20 bg-black/40 backdrop-blur-2xl border-b border-white/10 flex items-center justify-between px-8 shrink-0 relative z-[100]">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-11 h-11 bg-gradient-to-br from-[#013388] to-blue-400 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(1,51,136,0.5)]">
                                <Activity className="w-6 h-6 text-white animate-pulse" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-black" />
                        </div>
                        <div>
                            <h1 className="text-white font-black text-xl uppercase tracking-tighter italic flex items-center gap-2">
                                Mission Control <span className="text-[#F7A81B] text-sm not-italic font-bold bg-[#F7A81B]/10 px-2 py-0.5 rounded border border-[#F7A81B]/20">VIP IQ</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                <span className="text-[10px] text-slate-500 font-black tracking-[0.25em] uppercase">Club Platform Neural Gateway • v4.0</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-5">
                    <div className="hidden md:flex items-center gap-6 px-6 py-2 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
                        <div className="text-center">
                            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Core Efficiency</p>
                            <p className="text-xs font-black text-emerald-400">98.4%</p>
                        </div>
                        <div className="w-px h-6 bg-white/10" />
                        <div className="text-center">
                            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Active Agents</p>
                            <p className="text-xs font-black text-blue-400">{VIP_AGENTS.filter(a => a.status !== 'idle').length}/{VIP_AGENTS.length}</p>
                        </div>
                    </div>
                    <button onClick={() => window.close()} className="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white p-3 rounded-2xl transition-all border border-white/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* MAIN WORKSPACE */}
            <main className="flex-1 flex overflow-hidden p-8 gap-8 relative z-10">
                
                {/* COLUMN 1: STRATEGIC NODES (PLANS) */}
                <section className="w-[360px] flex flex-col gap-6 shrink-0 h-full">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-[11px] uppercase font-black tracking-[0.3em] text-[#F7A81B] flex items-center gap-2">
                            <Cpu className="w-4 h-4" /> Orchestrator
                        </h2>
                        <span className="text-[9px] font-bold text-slate-500 uppercase">3 Nodes Active</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {plans.map(plan => (
                            <div key={plan.id} className={`group relative bg-white/5 border rounded-[32px] p-6 transition-all duration-500 ${plan.isActive ? 'border-[#F7A81B]/40 bg-[#F7A81B]/5 shadow-[0_0_30px_rgba(247,168,27,0.05)]' : 'border-white/5 grayscale opacity-60'}`}>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-black text-white uppercase tracking-tight">{plan.title}</h3>
                                        <p className="text-[10px] text-slate-400 leading-tight font-medium pr-8">{plan.description}</p>
                                    </div>
                                    <button onClick={() => togglePlan(plan.id)} className={`w-10 h-6 rounded-full relative transition-all duration-300 ${plan.isActive ? 'bg-[#F7A81B]' : 'bg-slate-700'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${plan.isActive ? 'left-5' : 'left-1'}`} />
                                    </button>
                                </div>
                                
                                {plan.isActive && (
                                    <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-1 text-slate-500">
                                                <span>Goal Integrity</span>
                                                <span className="text-[#F7A81B]">{plan.progress}%</span>
                                            </div>
                                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#F7A81B] shadow-[0_0_10px_#F7A81B] transition-all duration-1000" style={{ width: `${plan.progress}%` }} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Sub-nodes:</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {plan.subtasks.map(s => (
                                                    <span key={s} className="text-[8px] font-bold bg-white/5 px-2 py-1 rounded-lg border border-white/5 hover:border-[#F7A81B]/30 transition-colors">{s}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* COLUMN 2: NEURAL FEED (CENTER) */}
                <section className="flex-1 flex flex-col bg-black/40 rounded-[40px] border border-white/5 overflow-hidden shadow-2xl backdrop-blur-xl relative group">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#013388]/5 to-transparent pointer-events-none" />
                    
                    <div className="p-8 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                                <Terminal className="w-5 h-5 text-[#F7A81B]" />
                            </div>
                            <div>
                                <h2 className="text-xs uppercase font-black tracking-[0.4em] text-white">Neural activity feed</h2>
                                <p className="text-[9px] text-slate-500 font-bold mt-0.5">Real-time Agent Synchronization</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-[#F7A81B] rounded-full animate-pulse shadow-[0_0_8px_#F7A81B]" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LIVE DATASTREAM</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar relative">
                        {logs.map(log => (
                            <div key={log.id} className="animate-in fade-in zoom-in-95 duration-500 relative">
                                <div className="flex gap-5">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-10 h-10 rounded-2xl ${log.agentColor} flex items-center justify-center text-white text-xs font-black shadow-lg shadow-black/40 border border-white/10 shrink-0`}>
                                            {log.agentName.charAt(0)}
                                        </div>
                                        <div className="w-px flex-1 bg-gradient-to-b from-white/10 to-transparent mt-3" />
                                    </div>
                                    <div className="flex-1 min-w-0 pt-0.5">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] font-black text-[#F7A81B] uppercase tracking-[0.2em]">{log.mainActivity}</span>
                                            <span className="text-[8px] font-bold text-slate-600 uppercase tabular-nums">{log.time}</span>
                                        </div>
                                        <div className="bg-white/5 border border-white/5 p-4 rounded-3xl group/log hover:border-white/10 transition-all">
                                            <p className="text-[11px] text-slate-300 leading-relaxed font-medium mb-3">
                                                <span className="text-white font-bold opacity-70 underline decoration-[#F7A81B]/40 underline-offset-4">{log.agentName}</span>: {log.subtask}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {log.status === 'processing' ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> : <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                                                    <span className={`text-[8px] font-black uppercase tracking-widest ${log.status === 'processing' ? 'text-blue-400' : 'text-emerald-500'}`}>{log.status}</span>
                                                </div>
                                                {log.status === 'done' && (
                                                    <button onClick={() => handlePublish(log)} className="flex items-center gap-2 text-[9px] font-black text-[#F7A81B] brightness-90 hover:brightness-110 uppercase tracking-widest transition-all">
                                                        <MessageSquare className="w-3.5 h-3.5" /> Publish to District
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* COLUMN 3: AGENT NETWORK (RIGHT) */}
                <section className="w-[300px] flex flex-col gap-6 shrink-0">
                    <div className="px-2">
                        <h2 className="text-[11px] uppercase font-black tracking-[0.3em] text-[#013388] flex items-center gap-2">
                            <Bot className="w-4 h-4" /> Cyber Agents
                        </h2>
                    </div>

                    <div className="space-y-4 overflow-y-auto pr-2 flex-1 scrollbar-hide">
                        {VIP_AGENTS.map(agent => (
                            <div key={agent.id} className="bg-white/5 border border-white/5 rounded-3xl p-5 hover:bg-white/[0.07] transition-all">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-8 h-8 rounded-xl ${agent.color} flex items-center justify-center text-white text-[10px] font-black`}>
                                        {agent.name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-[11px] font-black text-white leading-none mb-1">{agent.name}</h4>
                                        <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest">{agent.role}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[9px] text-slate-400 italic">"{agent.lastTask}"</p>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'online' ? 'bg-emerald-500' : agent.status === 'processing' ? 'bg-blue-400' : 'bg-slate-600'}`} />
                                            <span className="text-[8px] font-black uppercase text-slate-500">{agent.status}</span>
                                        </div>
                                        <Layers className="w-3 h-3 text-white/10" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* GLOBAL STATUS HUD */}
                    <div className="bg-gradient-to-br from-[#013388]/20 to-blue-900/20 border border-[#013388]/30 rounded-3xl p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <ShieldCheck className="w-5 h-5 text-blue-400" />
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Network Shield</span>
                        </div>
                        <div className="h-1.5 w-full bg-black/40 rounded-full mb-3 overflow-hidden">
                            <div className="h-full bg-blue-500 animate-pulse transition-all duration-300" style={{ width: '92%' }} />
                        </div>
                        <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest leading-relaxed">District Nodes Secure • Anti-Ban Logic Active</p>
                    </div>
                </section>
            </main>

            {/* NEURAL PUBLISH MODAL (Glassmorphism) */}
            {showPublish && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-3xl z-[300] flex items-center justify-center p-4">
                    <div className="bg-slate-900/40 w-full max-w-xl rounded-[48px] border border-white/10 shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[95vh] relative">
                        {/* Modal Ambient Lights */}
                        <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-[#F7A81B]/5 rounded-full blur-[100px] pointer-events-none" />
                        
                        <div className="p-10 border-b border-white/5 flex justify-between items-center relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-[#25D366]/20 rounded-2xl flex items-center justify-center border border-[#25D366]/30 shadow-[0_0_15px_rgba(37,211,102,0.2)]">
                                    <MessageSquare className="w-6 h-6 text-[#25D366]" />
                                </div>
                                <div>
                                    <h3 className="font-black text-white uppercase tracking-[0.3em] text-xs">WhatsApp Sync</h3>
                                    <p className="text-[9px] text-slate-500 font-bold mt-0.5">Publishing Neural Activity to Nodes</p>
                                </div>
                            </div>
                            <button onClick={() => setShowPublish(null)} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-10 overflow-y-auto custom-scrollbar relative z-10">
                            <div className="bg-[#111B21] rounded-[32px] p-8 border border-white/5 shadow-2xl font-sans text-sm text-[#E9EDEF] space-y-5 max-w-md mx-auto relative mb-10 overflow-hidden group/wp">
                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                                <span className="inline-block bg-[#128C7E] text-white px-2 py-0.5 rounded text-[8px] font-black tracking-widest uppercase">ENCRYPTED PREVIEW</span>
                                <img src={showPublish.imageUrl} className="w-full h-44 object-cover rounded-[24px] grayscale-[0.3] group-hover/wp:grayscale-0 transition-all duration-700" alt="Preview" />
                                <div className="space-y-4">
                                    <p className="font-black text-[#25D366] text-base leading-tight tracking-tight">{showPublish.hook}</p>
                                    <p className="leading-relaxed opacity-80 text-xs font-medium">{showPublish.context}</p>
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                                        <Globe className="w-5 h-5 text-blue-400" />
                                        <p className="text-blue-400 font-bold underline truncate text-xs">{showPublish.url}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-8">
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between px-2">
                                        <label className="text-[10px] font-black text-[#F7A81B] uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Target className="w-4 h-4" /> Targeting Nodes ({selectedChats.length})
                                        </label>
                                        <button onClick={() => setSelectedChats(chats.map(c => c.id))} className="text-[9px] font-black text-white/50 hover:text-white uppercase transition-colors tracking-widest">Select All</button>
                                    </div>
                                    
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                            <Search className="w-4 h-4 text-slate-500 group-focus-within:text-[#F7A81B] transition-colors" />
                                        </div>
                                        <input 
                                            type="text" 
                                            placeholder="SEARCH DISTRICT NODES OR INDIVIDUALS..." 
                                            value={searchTerm} 
                                            onChange={(e) => setSearchTerm(e.target.value)} 
                                            className="w-full pl-12 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black tracking-widest uppercase placeholder:text-slate-700 outline-none focus:border-[#F7A81B]/50 focus:bg-white/[0.08] transition-all" 
                                        />
                                    </div>

                                    <div className="max-h-[250px] min-h-[150px] overflow-y-auto space-y-2.5 pr-2 custom-scrollbar relative">
                                        {isLoadingChats && (
                                            <div className="absolute inset-0 bg-slate-900/80 z-20 flex flex-col items-center justify-center gap-4 backdrop-blur-md rounded-2xl">
                                                <Loader2 className="w-8 h-8 text-[#F7A81B] animate-spin" />
                                                <p className="text-[10px] font-black font-sans text-[#F7A81B] uppercase tracking-[0.3em] animate-pulse">Syncing District Grid...</p>
                                            </div>
                                        )}

                                        {fetchError && (
                                            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl flex flex-col items-center text-center gap-3">
                                                <AlertCircle className="w-6 h-6 text-red-400" />
                                                <p className="text-[10px] font-bold text-red-400 uppercase leading-relaxed tracking-widest">{fetchError}</p>
                                            </div>
                                        )}

                                        {!isLoadingChats && !fetchError && filteredChats.length === 0 && (
                                            <p className="text-[10px] text-center text-slate-600 font-bold uppercase py-10 tracking-widest">No matching nodes found</p>
                                        )}

                                        {!isLoadingChats && !fetchError && filteredChats.map(c => (
                                            <div key={c.id} onClick={() => toggleChat(c.id)} className={`group/chat flex items-center justify-between p-4 rounded-3xl cursor-pointer transition-all border ${selectedChats.includes(c.id) ? 'bg-[#F7A81B]/10 border-[#F7A81B]/30' : 'bg-white/5 border-white/5 hover:border-white/20'}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-[11px] font-black transition-all ${selectedChats.includes(c.id) ? 'bg-[#F7A81B] text-white' : 'bg-white/10 text-slate-400 group-hover/chat:bg-white/20'}`}>{c.name.charAt(0)}</div>
                                                    <div>
                                                        <p className="text-xs font-black text-white leading-none mb-1.5 uppercase tracking-tighter">{c.name}</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${c.isGroup ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                                                            <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest">{c.isGroup ? 'District Node' : 'Individual Agent'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`w-6 h-6 rounded-xl border-2 transition-all flex items-center justify-center ${selectedChats.includes(c.id) ? 'bg-[#F7A81B] border-[#F7A81B] scale-110' : 'border-white/10'}`}>
                                                    {selectedChats.includes(c.id) && <CheckCircle2 className="w-4 h-4 text-white" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <button onClick={sendToWhatsApp} disabled={selectedChats.length === 0 || isSending || sendSuccess} className={`w-full py-6 rounded-[32px] font-black uppercase tracking-[0.3em] transition-all shadow-2xl flex flex-col items-center justify-center gap-2 relative overflow-hidden group/send ${sendSuccess ? 'bg-emerald-500 text-white' : isSending ? 'bg-white/5 text-slate-500' : 'bg-[#25D366] text-white hover:brightness-110 shadow-[#25D366]/20'}`}>
                                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/send:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />
                                        <div className="flex items-center gap-3 relative z-10">
                                            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : sendSuccess ? <CheckCircle2 className="w-6 h-6" /> : <Zap className="w-5 h-5 fill-current" />}
                                            <span className="text-xs">{sendSuccess ? 'Sync Completed' : isSending ? `UPDATING NODES ${sendingProgress.current}/${sendingProgress.total}` : `INITIATE BROADCAST TO ${selectedChats.length}`}</span>
                                        </div>
                                        {isSending && <div className="w-64 h-1 bg-white/10 rounded-full mt-2 overflow-hidden relative z-10"><div className="h-full bg-white shadow-[0_0_8px_white] transition-all duration-300" style={{ width: `${(sendingProgress.current / sendingProgress.total) * 100}%` }} /></div>}
                                    </button>
                                    
                                    <div className="bg-indigo-500/10 rounded-3xl p-5 border border-indigo-500/20 flex items-center gap-4">
                                        <ShieldCheck className="w-6 h-6 text-indigo-400" />
                                        <div>
                                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Valkomen Anti-Ban Shield</p>
                                            <p className="text-[9px] text-slate-500 font-bold leading-tight">Neural variance and staggered dispatching (4-8s) active. Your district nodes remain secure.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                @keyframes fade-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
            `}} />
        </div>
    );
};

export default HQDashboard;
