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
    Bot,
    ExternalLink,
    Database,
    BarChart3,
    Fingerprint
} from 'lucide-react';

const getApiBase = () => {
    const envApi = import.meta.env.VITE_API_URL;
    if (envApi && envApi !== '/api') return envApi.replace(/\/$/, '');
    return `${window.location.origin}/api`;
};

const API_BASE = getApiBase();

// COLORS: Rotary Official Palette
const COLORS = {
  ROTARY_BLUE: '#013388',
  ROTARY_GOLD: '#F7A81B',
  ROTARY_SKY: '#005DAA',
  BG_DARK: '#001A47', // Deep Rotary Variation
  WHITE: '#FFFFFF'
};

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
    details?: {
        source: string;
        url: string;
        method: string;
        kpis: { label: string; value: string }[];
        summary: string;
    }
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
    detailedInfo?: any;
}

const VIP_AGENTS: Agent[] = [
    { id: 'rafael', name: 'Rafael', role: 'Grant Intelligence Expert', color: 'bg-[#005DAA]', status: 'online', lastTask: 'Scanning SECOP II' },
    { id: 'mateo', name: 'Mateo', role: 'Strategic ROI Analyst', color: 'bg-[#013388]', status: 'online', lastTask: 'Calculating Grant Impacts' },
    { id: 'sofia', name: 'Sofía', role: 'Campaign Concierge', color: 'bg-[#00246B]', status: 'idle', lastTask: 'Waiting for leads' },
    { id: 'valeria', name: 'Valeria', role: 'Institutional Comms', color: 'bg-[#F7A81B]', status: 'processing', lastTask: 'Drafting announcement' },
];

const INITIAL_PLANS: ActionPlan[] = [
    {
        id: 'grand-scope',
        title: 'Grand Scope Engine',
        description: 'Gestión Automatizada de Subvenciones (SECOP II, USAID, Rotary Foundation)',
        isActive: true,
        progress: 68,
        subtasks: ['Escaneo de Bases de Datos', 'Filtrage por TDRs', 'Análisis de Viabilidad IA', 'Generación de Borradores'],
        agents: ['rafael', 'mateo'],
        details: {
            source: "SECOP II / Ministerio de Salud Nacional",
            url: "https://secop.gov.co/contracts/MS-2024-001",
            method: "Apify Scraper + Perplexity Deep Search",
            kpis: [
                { label: "Confianza de Match", value: "94%" },
                { label: "Monto Proyectado", value: "$50,000 USD" },
                { label: "Prioridad Distrital", value: "A+" }
            ],
            summary: "Extrayendo requerimientos técnicos para proyecto de agua potable en el Distrito 4281."
        }
    },
    {
        id: 'membership-pulse',
        title: 'Membership Pulse IQ',
        description: 'Análisis de retención y captación de nuevos socios vía IA predictiva.',
        isActive: false,
        progress: 0,
        subtasks: ['Análisis de Churn', 'Lead Scoring Socios', 'Plan de Onboarding'],
        agents: ['sofia'],
        details: {
            source: "Base de Datos Interna Club Platform",
            url: "https://app.clubplatform.org/admin/data",
            method: "Neural Predictive Modeling",
            kpis: [
                { label: "Tasa de Retención", value: "85%" },
                { label: "Nuevos Prospectos", value: "12" }
            ],
            summary: "Calculando probabilidad de salida de socios con menos de 2 años en el club."
        }
    },
    {
        id: 'brand-amplifier',
        title: 'Brand Amplifier VIP',
        description: 'Orquestación de imagen pública e impacto institucional en redes.',
        isActive: true,
        progress: 45,
        subtasks: ['Monitor de Menciones', 'Drafting Automático', 'Schedule de Ráfagas'],
        agents: ['valeria', 'sofia'],
        details: {
            source: "Meta Graph API / Brand Monitoring",
            url: "https://facebook.com/rotaryinternational",
            method: "Sentimental Analysis IA",
            kpis: [
                { label: "Alcance Orgánico", value: "24.5k" },
                { label: "Sentimiento", value: "Positivo" }
            ],
            summary: "Monitoreando impacto del video de Polio Plus compartido hace 4 horas."
        }
    }
];

const HQDashboard: React.FC = () => {
    const [plans, setPlans] = useState<ActionPlan[]>(INITIAL_PLANS);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [inspectorPlan, setInspectorPlan] = useState<ActionPlan | null>(null);
    const [showPublish, setShowPublish] = useState<any>(null);
    const [chats, setChats] = useState<any[]>([]);
    const [selectedChats, setSelectedChats] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingChats, setIsLoadingChats] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0 });
    const [sendSuccess, setSendSuccess] = useState(false);

    // Initial Logs
    useEffect(() => {
        const initialLogs: LogEntry[] = [
            { id: '1', agentName: 'Rafael', agentColor: 'bg-[#013388]', mainActivity: 'Grand Scope Engine', subtask: 'Conectado a SECOP II API: Filtrando subvenciones de salud.', time: '2m', type: 'research', status: 'done' },
            { id: '2', agentName: 'Mateo', agentColor: 'bg-[#005DAA]', mainActivity: 'Grand Scope Engine', subtask: 'Analizando ROI de Subvención RF-2025: Impacto proyectado 45%.', time: '5m', type: 'execution', status: 'done' },
            { id: '3', agentName: 'Valeria', agentColor: 'bg-[#F7A81B]', mainActivity: 'Brand Amplifier', subtask: 'Generando post institucional: Campaña Polio Plus.', time: '10m', type: 'execution', status: 'done' },
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

    const togglePlan = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPlans(prev => prev.map(p => {
            if (p.id === id) return { ...p, isActive: !p.isActive };
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

    const filteredChats = chats.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-[#001438] text-slate-300 font-sans z-[9999] overflow-hidden flex flex-col">
            
            {/* AMBIENT BACKGROUND */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#013388] rounded-full blur-[150px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#F7A81B] rounded-full blur-[150px]" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5" />
            </div>

            {/* TOP BAR - ROTARY BRANDED */}
            <header className="h-20 bg-[#013388]/90 backdrop-blur-2xl border-b border-white/10 flex items-center justify-between px-8 shrink-0 relative z-[100]">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shadow-lg">
                                <Activity className="w-6 h-6 text-[#013388] animate-pulse" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-white font-black text-xl uppercase tracking-tighter italic flex items-center gap-2">
                                Mission Control <span className="text-[#F7A81B] text-sm not-italic font-bold bg-[#F7A81B]/10 px-2 py-0.5 rounded border border-[#F7A81B]/40">VIP HQ</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-white/60 font-black tracking-[0.25em] uppercase">Rotary Intelligence Gateway • v4.2</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-5">
                    <div className="hidden md:flex items-center gap-6 px-6 py-2 bg-black/20 rounded-2xl border border-white/5 backdrop-blur-md">
                        <div className="text-center">
                            <p className="text-[8px] text-white/50 font-bold uppercase tracking-widest mb-0.5">Integridad</p>
                            <p className="text-xs font-black text-[#F7A81B]">99.8%</p>
                        </div>
                    </div>
                    <button onClick={() => window.close()} className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-2xl transition-all border border-white/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* MAIN WORKSPACE */}
            <main className="flex-1 flex overflow-hidden p-8 gap-8 relative z-10">
                
                {/* COLUMN 1: ESTRATEGIA (PLANS) */}
                <section className="w-[380px] flex flex-col gap-6 shrink-0 h-full">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-[11px] uppercase font-black tracking-[0.3em] text-[#F7A81B] flex items-center gap-2">
                            <Cpu className="w-4 h-4" /> ESTRATEGIA NODAL
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {plans.map(plan => (
                            <div 
                                key={plan.id} 
                                onClick={() => setInspectorPlan(plan)}
                                className={`group relative bg-[#013388]/30 border rounded-[36px] p-6 transition-all duration-500 cursor-pointer ${inspectorPlan?.id === plan.id ? 'border-[#F7A81B] ring-2 ring-[#F7A81B]/20 bg-[#013388]/50' : 'border-white/5 hover:border-white/20'}`}
                            >
                                {plan.isActive && <div className="absolute top-6 right-6 w-2 h-2 bg-emerald-400 rounded-full animate-ping shadow-[0_0_10px_#10b981]" />}
                                
                                <div className="flex items-start justify-between mb-4">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-black text-white uppercase tracking-tight">{plan.title}</h3>
                                        <p className="text-[10px] text-white/60 leading-tight font-medium pr-8">{plan.description}</p>
                                    </div>
                                    <button 
                                        onClick={(e) => togglePlan(plan.id, e)} 
                                        className={`w-10 h-6 rounded-full relative transition-all duration-300 ${plan.isActive ? 'bg-[#F7A81B]' : 'bg-slate-700'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${plan.isActive ? 'left-5' : 'left-1'}`} />
                                    </button>
                                </div>
                                
                                <div className="mt-6 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <BarChart3 className="w-3.5 h-3.5 text-[#F7A81B]" />
                                        <span className="text-[10px] font-black text-white/70 uppercase">{plan.progress}%</span>
                                    </div>
                                    <div className="flex -space-x-2">
                                        {plan.agents.map(aid => {
                                            const ag = VIP_AGENTS.find(a => a.id === aid);
                                            return <div key={aid} className={`w-6 h-6 rounded-lg ${ag?.color} border-2 border-[#001438] flex items-center justify-center text-[8px] font-black text-white`} title={ag?.name}>{ag?.name.charAt(0)}</div>
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* COLUMN 2: NEURAL FEED (CENTER) */}
                <section className="flex-1 flex flex-col bg-[#013388]/10 rounded-[48px] border border-white/5 overflow-hidden shadow-2xl backdrop-blur-xl relative">
                    <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <Terminal className="w-5 h-5 text-[#F7A81B]" />
                            <h2 className="text-xs uppercase font-black tracking-[0.4em] text-white">Telemetría de Actividad</h2>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar relative">
                        {logs.map(log => (
                            <div key={log.id} className="animate-in fade-in slide-in-from-left-4 duration-500">
                                <div className="flex gap-5">
                                    <div className={`w-10 h-10 rounded-2xl ${log.agentColor} flex items-center justify-center text-white text-xs font-black shadow-lg border border-white/10 shrink-0`}>
                                        {log.agentName.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] font-black text-[#F7A81B] uppercase tracking-[0.2em]">{log.mainActivity}</span>
                                            <span className="text-[8px] font-bold text-white/30 uppercase tabular-nums">{log.time}</span>
                                        </div>
                                        <div className="bg-white/5 border border-white/5 p-4 rounded-[24px] hover:border-[#F7A81B]/30 transition-all group">
                                            <p className="text-[11px] text-white/80 leading-relaxed font-medium mb-3 whitespace-pre-wrap">
                                                <span className="text-white font-bold">{log.agentName}</span>: {log.subtask}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {log.status === 'processing' ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> : <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                                                    <span className={`text-[8px] font-black uppercase tracking-widest ${log.status === 'processing' ? 'text-blue-400' : 'text-emerald-500'}`}>{log.status}</span>
                                                </div>
                                                {log.status === 'done' && (
                                                    <button onClick={() => handlePublish(log)} className="text-[9px] font-black text-[#F7A81B] flex items-center gap-2 uppercase tracking-widest hover:scale-105 transition-all">
                                                        <MessageSquare className="w-3.5 h-3.5" /> Difundir Hallazgo
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

                {/* COLUMN 3: INSPECTOR (RIGHT) */}
                <section className="w-[340px] flex flex-col gap-6 shrink-0 h-full">
                    {inspectorPlan ? (
                        <div className="flex-1 flex flex-col bg-white/5 border border-white/10 rounded-[48px] overflow-hidden animate-in slide-in-from-right-8 duration-500 shadow-2xl">
                            <div className="p-8 border-b border-white/10 bg-[#F7A81B]/10">
                                <div className="flex items-center gap-3 mb-4">
                                    <Fingerprint className="w-6 h-6 text-[#F7A81B]" />
                                    <h2 className="text-xs font-black text-white uppercase tracking-widest">Plan Inspector</h2>
                                </div>
                                <h3 className="text-sm font-black text-[#F7A81B] uppercase italic mb-2 leading-none shrink-0">{inspectorPlan.title}</h3>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-white transition-all duration-1000" style={{ width: `${inspectorPlan.progress}%` }} />
                                    </div>
                                    <span className="text-[9px] font-black text-white shrink-0">{inspectorPlan.progress}%</span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                                {/* FUENTE DE VERDAD */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-[#F7A81B] uppercase tracking-widest flex items-center gap-2">
                                        <Database className="w-3.5 h-3.5" /> Fuente de Verdad
                                    </label>
                                    <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                                        <p className="text-[10px] text-white font-bold leading-tight mb-2 underline">{inspectorPlan.details?.source}</p>
                                        <a href={inspectorPlan.details?.url} target="_blank" rel="noreferrer" className="text-[9px] text-[#F7A81B]/70 truncate flex items-center gap-1 hover:text-[#F7A81B] transition-colors">
                                            {inspectorPlan.details?.url} <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                    </div>
                                </div>

                                {/* PROTOCOLO IA */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-[#F7A81B] uppercase tracking-widest flex items-center gap-2">
                                        <ShieldCheck className="w-3.5 h-3.5" /> Protocolo de Análisis
                                    </label>
                                    <div className="bg-[#013388]/40 rounded-2xl p-4 border border-[#F7A81B]/20">
                                        <p className="text-[10px] text-white leading-relaxed italic">"{inspectorPlan.details?.method}"</p>
                                    </div>
                                </div>

                                {/* KPIs */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-[#F7A81B] uppercase tracking-widest flex items-center gap-2">
                                        <BarChart3 className="w-3.5 h-3.5" /> Métricas de Impacto
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {inspectorPlan.details?.kpis.map(kpi => (
                                            <div key={kpi.label} className="bg-white/5 border border-white/5 p-3 rounded-2xl text-center">
                                                <p className="text-[8px] text-white/40 font-bold uppercase mb-1">{kpi.label}</p>
                                                <p className="text-xs font-black text-white">{kpi.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* RESUMEN AGENTE */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-[#F7A81B] uppercase tracking-widest flex items-center gap-2">
                                        <Bot className="w-3.5 h-3.5" /> Contexto Extraído
                                    </label>
                                    <p className="text-xs text-white/70 leading-relaxed font-medium bg-white/[0.02] p-4 rounded-3xl border border-white/5 italic">
                                        {inspectorPlan.details?.summary}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-[48px] opacity-40">
                             <Fingerprint className="w-12 h-12 mb-4 text-white/30" />
                             <p className="text-[10px] font-black uppercase text-white/30 tracking-widest">Selecciona un Nodo</p>
                        </div>
                    )}
                </section>
            </main>

            {/* PUBLISH MODAL (Glassmorphism) */}
            {showPublish && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-3xl z-[300] flex items-center justify-center p-4">
                    <div className="bg-[#001438] w-full max-w-xl rounded-[48px] border border-white/10 shadow-2xl overflow-hidden animate-fade-in flex flex-col text-slate-100">
                        <div className="p-10 border-b border-white/5 flex justify-between items-center bg-[#013388]/20">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-[#25D366]/20 rounded-2xl flex items-center justify-center border border-[#25D366]/30 shadow-[0_0_15px_rgba(37,211,102,0.2)]">
                                    <MessageSquare className="w-6 h-6 text-[#25D366]" />
                                </div>
                                <h3 className="font-black text-white uppercase tracking-[0.3em] text-xs">WhatsApp Sync Terminal</h3>
                            </div>
                            <button onClick={() => setShowPublish(null)} className="p-3 bg-white/5 rounded-2xl transition-all"><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-10 overflow-y-auto custom-scrollbar">
                            {/* PREVIEW TÁCTICA */}
                            <div className="bg-[#111B21] rounded-[36px] p-8 border border-white/10 shadow-full font-sans text-sm text-[#E9EDEF] space-y-5 mb-10">
                                <span className="inline-block bg-[#128C7E] text-white px-2 py-0.5 rounded text-[8px] font-black tracking-[0.3em] uppercase">ENCRYPTED PREVIEW</span>
                                <img src={showPublish.imageUrl} className="w-full h-44 object-cover rounded-3xl" alt="Preview" />
                                <div className="space-y-4">
                                    <p className="font-black text-[#25D366] text-base leading-tight tracking-tight">{showPublish.hook}</p>
                                    <p className="leading-relaxed opacity-80 text-xs font-medium">{showPublish.context}</p>
                                </div>
                            </div>
                            
                            <div className="space-y-8">
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between px-2">
                                        <label className="text-[10px] font-black text-[#F7A81B] uppercase tracking-[0.2em] flex items-center gap-2"><Target className="w-4 h-4" /> Targeting ({selectedChats.length})</label>
                                        <button onClick={() => setSelectedChats(chats.map(c => c.id))} className="text-[9px] font-black text-white/50 hover:text-white uppercase transition-colors tracking-widest uppercase">Todo el Distrito</button>
                                    </div>
                                    <div className="relative group">
                                         <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                         <input type="text" placeholder="BUSCAR NODOS..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black tracking-widest placeholder:text-white/20 outline-none focus:border-[#F7A81B]/50 transition-all" />
                                    </div>
                                    <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                        {isLoadingChats && <Loader2 className="w-8 h-8 text-[#F7A81B] animate-spin mx-auto my-8" />}
                                        {fetchError && <p className="text-[10px] text-red-400 font-bold text-center py-4 uppercase">{fetchError}</p>}
                                        {!isLoadingChats && !fetchError && filteredChats.map(c => (
                                            <div key={c.id} onClick={() => toggleChat(c.id)} className={`flex items-center justify-between p-4 rounded-3xl cursor-pointer border ${selectedChats.includes(c.id) ? 'bg-[#F7A81B]/10 border-[#F7A81B]/30' : 'bg-white/5 border-white/5'}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black ${selectedChats.includes(c.id) ? 'bg-[#F7A81B] text-white' : 'bg-white/10 text-white/40'}`}>{c.name.charAt(0)}</div>
                                                    <p className="text-xs font-black text-white leading-none uppercase tracking-tighter">{c.name}</p>
                                                </div>
                                                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center ${selectedChats.includes(c.id) ? 'bg-[#F7A81B] border-[#F7A81B]' : 'border-white/10'}`}>
                                                    {selectedChats.includes(c.id) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={sendToWhatsApp} disabled={selectedChats.length === 0 || isSending || sendSuccess} className={`w-full py-6 rounded-[32px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl transition-all ${sendSuccess ? 'bg-emerald-500' : isSending ? 'bg-white/5' : 'bg-[#25D366] hover:brightness-110'}`}>
                                    {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : sendSuccess ? <CheckCircle2 className="w-6 h-6" /> : <Zap className="w-5 h-5 fill-current" />}
                                    <span className="text-xs">{sendSuccess ? 'Broadcasting Complete' : isSending ? `TRANSMITIENDO...` : `DESPLEGAR EN ${selectedChats.length} NODOS`}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                @keyframes fade-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fade-in 0.4s ease-out; }
            `}} />
        </div>
    );
};

export default HQDashboard;
