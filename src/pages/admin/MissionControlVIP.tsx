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
    Settings,
    Search,
    Globe,
    Layers,
    Bot,
    ExternalLink,
    Database,
    BarChart3,
    Fingerprint,
    ArrowRightCircle
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
    subtasks: { text: string; done: boolean }[];
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
}

const VIP_AGENTS: Agent[] = [
    { id: 'rafael', name: 'Rafael', role: 'Grant Intelligence Expert', color: 'bg-[#013388]', status: 'online', lastTask: 'Scanning SECOP II' },
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
        subtasks: [
            { text: 'Escaneo de Bases de Datos', done: true },
            { text: 'Filtrage por TDRs', done: true },
            { text: 'Análisis de Viabilidad IA', done: false },
            { text: 'Generación de Borradores', done: false }
        ],
        agents: ['rafael', 'mateo'],
        details: {
            source: "SECOP II / Ministerio de Salud Nacional",
            url: "https://secop.gov.co/contracts/MS-2024-001",
            method: "Apify Scraper + Perplexity Deep Search",
            kpis: [
                { label: "Confianza", value: "94%" },
                { label: "Monto", value: "$50k USD" },
                { label: "Prioridad", value: "A+" }
            ],
            summary: "Extrayendo requerimientos técnicos para proyecto de agua potable en el Distrito 4281."
        }
    },
    {
        id: 'brand-amplifier',
        title: 'Brand Amplifier VIP',
        description: 'Orquestación de imagen pública e impacto institucional en redes.',
        isActive: true,
        progress: 45,
        subtasks: [
            { text: 'Monitor de Menciones', done: true },
            { text: 'Drafting Automático', done: false },
            { text: 'Schedule de Ráfagas', done: false }
        ],
        agents: ['valeria', 'sofia'],
        details: {
            source: "Meta Graph API / Brand Monitoring",
            url: "https://facebook.com/rotaryinternational",
            method: "Sentimental Analysis IA",
            kpis: [
                { label: "Alcance", value: "24.5k" },
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
    const [showSettings, setShowSettings] = useState(false);
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
            { id: '2', agentName: 'Mateo', agentColor: 'bg-[#013388]', mainActivity: 'Grand Scope Engine', subtask: 'Analizando ROI de Subvención RF-2025: Impacto proyectado 45%.', time: '5m', type: 'execution', status: 'done' },
            { id: '3', agentName: 'Valeria', agentColor: 'bg-[#F7A81B]', mainActivity: 'Brand Amplifier', subtask: 'Generando post institucional: Campaña Polio Plus.', time: '10m', type: 'execution', status: 'done' },
        ];
        setLogs(initialLogs);
    }, []);

    const togglePlan = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPlans(prev => prev.map(p => {
            if (p.id === id) return { ...p, isActive: !p.isActive };
            return p;
        }));
    };

    const toggleChat = (id: string) => {
        setSelectedChats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    useEffect(() => {
        if (showPublish) {
            const token = localStorage.getItem('rotary_token');
            setIsLoadingChats(true);
            setFetchError(null);
            fetch(`${API_BASE}/whatsapp-qr/chats?cb=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}` } })
                .then(r => r.json())
                .then(data => {
                    if (data.success) setChats(data.chats || []);
                    else setFetchError(data.error || 'Gateway offline');
                })
                .catch(e => setFetchError(`Error: ${e.message}`))
                .finally(() => setIsLoadingChats(false));
        }
    }, [showPublish]);

    const handlePublish = (log: LogEntry) => {
        setSendSuccess(false);
        setSelectedChats([]);
        setShowPublish({
            hook: `🚀 Actualización: ${log.mainActivity}`,
            context: log.subtask,
            url: "https://clubplatform.org/hq",
            imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2672&auto=format&fit=crop"
        });
    };

    const sendToWhatsApp = async () => {
        if (selectedChats.length === 0 || isSending) return;
        setIsSending(true);
        setSendingProgress({ current: 0, total: selectedChats.length });
        const token = localStorage.getItem('rotary_token');
        for (let i = 0; i < selectedChats.length; i++) {
            setSendingProgress(p => ({ ...p, current: i + 1 }));
            if (i > 0) await new Promise(r => setTimeout(r, 4000));
            try {
                await fetch(`${API_BASE}/whatsapp-qr/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ chatId: selectedChats[i], message: `${showPublish.hook}\n\n${showPublish.context}\n\n${showPublish.url}` })
                });
            } catch (e) { console.error(e); }
        }
        setSendSuccess(true);
        setIsSending(false);
        setTimeout(() => setShowPublish(null), 2000);
    };

    const filteredChats = chats.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="fixed inset-0 bg-[#001438] text-slate-300 font-sans z-[9999] overflow-hidden flex flex-col">
            <header className="h-20 bg-[#013388]/90 backdrop-blur-2xl border-b border-white/10 flex items-center justify-between px-8 shrink-0 relative z-[100]">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shadow-lg"><Activity className="w-6 h-6 text-[#013388]" /></div>
                    <h1 className="text-white font-black text-xl uppercase tracking-tighter italic">Mission Control <span className="text-[#F7A81B]">VIP HQ</span></h1>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setShowSettings(true)} className="p-3 bg-white/10 rounded-2xl"><Settings className="w-5 h-5" /></button>
                    <button onClick={() => window.close()} className="p-3 bg-white/10 rounded-2xl"><X className="w-5 h-5" /></button>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden p-8 gap-8 relative z-10">
                {/* GOALS */}
                <section className="w-[380px] flex flex-col gap-6 shrink-0 h-full">
                    <h2 className="text-[11px] uppercase font-black tracking-widest text-[#F7A81B]">ESTRATEGIA NODAL</h2>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {plans.map(plan => (
                            <div key={plan.id} onClick={() => setInspectorPlan(plan)} className={`group relative bg-[#013388]/30 border rounded-[36px] p-6 cursor-pointer transition-all ${inspectorPlan?.id === plan.id ? 'border-[#F7A81B] ring-2 ring-[#F7A81B]/20' : 'border-white/5'}`}>
                                <div className="flex items-start justify-between mb-4">
                                    <h3 className="text-sm font-black text-white uppercase">{plan.title}</h3>
                                    <button onClick={(e) => togglePlan(plan.id, e)} className={`w-10 h-6 rounded-full relative ${plan.isActive ? 'bg-[#F7A81B]' : 'bg-slate-700'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${plan.isActive ? 'left-5' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {plan.subtasks.map((s, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={`w-2.5 h-2.5 rounded-full ${s.done ? 'bg-[#F7A81B]' : 'bg-white/10'}`} />
                                            <span className={`text-[10px] font-bold ${s.done ? 'text-white' : 'text-white/40'}`}>{s.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* FEED */}
                <section className="flex-1 flex flex-col bg-[#013388]/10 rounded-[48px] border border-white/5 overflow-hidden backdrop-blur-xl">
                    <div className="p-8 border-b border-white/5 flex items-center justify-between"><h2 className="text-xs uppercase font-black text-white">Telemetría de Actividad</h2></div>
                    <div className="flex-1 overflow-y-auto p-8 space-y-6">
                        {logs.map(log => (
                            <div key={log.id} className="flex gap-5">
                                <div className={`w-10 h-10 rounded-2xl ${log.agentColor} flex items-center justify-center text-white text-xs font-black shadow-lg`}>{log.agentName.charAt(0)}</div>
                                <div className="flex-1 bg-white/5 border border-white/5 p-4 rounded-[24px] group">
                                    <p className="text-[11px] text-white/80 font-medium mb-3"><span className="text-white font-bold">{log.agentName}</span>: {log.subtask}</p>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-[#F7A81B]">{log.mainActivity}</span>
                                        {log.status === 'done' && <button onClick={() => handlePublish(log)} className="text-[9px] font-black text-[#F7A81B] uppercase flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Difundir</button>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* INSPECTOR */}
                <section className="w-[340px] shrink-0 h-full">
                    {inspectorPlan ? (
                        <div className="h-full bg-white/5 border border-white/10 rounded-[48px] overflow-hidden animate-in slide-in-from-right-8">
                            <div className="p-8 border-b border-white/10 bg-[#F7A81B]/10">
                                <h2 className="text-xs font-black text-white uppercase tracking-widest mb-2">Protocol Inspector</h2>
                                <h3 className="text-sm font-black text-[#F7A81B] uppercase">{inspectorPlan.title}</h3>
                            </div>
                            <div className="p-8 space-y-8">
                                <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                                    <p className="text-[10px] text-white font-bold mb-2">Fuente: {inspectorPlan.details?.source}</p>
                                    <p className="text-[9px] text-[#F7A81B]/70 truncate">{inspectorPlan.details?.url}</p>
                                </div>
                                <p className="text-xs text-white/70 italic leading-relaxed">{inspectorPlan.details?.summary}</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {inspectorPlan.details?.kpis.map(kpi => (
                                        <div key={kpi.label} className="bg-white/5 p-3 rounded-2xl text-center">
                                            <p className="text-[8px] text-white/40 font-bold uppercase mb-1">{kpi.label}</p>
                                            <p className="text-xs font-black text-white">{kpi.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full border border-dashed border-white/10 rounded-[48px] flex flex-col items-center justify-center opacity-40">
                            <Fingerprint className="w-12 h-12 mb-4" /><p className="text-[10px] font-black uppercase">Click a Node</p>
                        </div>
                    )}
                </section>
            </main>

            {/* SYNC MODAL */}
            {showPublish && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-3xl z-[300] flex items-center justify-center p-4">
                    <div className="bg-[#001438] w-full max-w-xl rounded-[48px] border border-white/10 overflow-hidden text-slate-100 flex flex-col p-10">
                        <div className="flex justify-between items-center mb-10">
                            <h3 className="font-black text-white uppercase text-xs">WhatsApp Sync Terminal</h3>
                            <button onClick={() => setShowPublish(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="bg-[#111B21] rounded-[36px] p-8 space-y-5 mb-10">
                            <img src={showPublish.imageUrl} className="w-full h-44 object-cover rounded-3xl" alt="Preview" />
                            <p className="font-black text-[#25D366] text-base leading-tight">{showPublish.hook}</p>
                            <p className="opacity-80 text-xs font-medium">{showPublish.context}</p>
                        </div>
                        <div className="space-y-6">
                            <input type="text" placeholder="BUSCAR NODOS..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] outline-none" />
                            <div className="max-h-[150px] overflow-y-auto space-y-2">
                                {isLoadingChats && <Loader2 className="w-6 h-6 animate-spin mx-auto" />}
                                {filteredChats.map(c => (
                                    <div key={c.id} onClick={() => toggleChat(c.id)} className={`flex items-center justify-between p-4 rounded-3xl border cursor-pointer ${selectedChats.includes(c.id) ? 'bg-[#F7A81B]/10 border-[#F7A81B]' : 'bg-white/5 border-white/5'}`}>
                                        <p className="text-xs font-black uppercase">{c.name}</p>
                                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center ${selectedChats.includes(c.id) ? 'bg-[#F7A81B]' : 'border-white/10'}`}>{selectedChats.includes(c.id) && <CheckCircle2 className="w-3 h-3 text-white" />}</div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={sendToWhatsApp} disabled={selectedChats.length === 0 || isSending} className="w-full py-6 bg-[#25D366] rounded-[32px] font-black uppercase text-xs">
                                {isSending ? `Transmitiendo... ${sendingProgress.current}/${sendingProgress.total}` : sendSuccess ? 'Broadcast Completed' : `Sincronizar en ${selectedChats.length} Nodos`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SETTINGS MODAL */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-3xl z-[10001] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[56px] p-10 space-y-8">
                        <div className="flex justify-between items-center"><h3 className="font-black text-[#013388] uppercase text-xs">API Configuration</h3><button onClick={() => setShowSettings(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
                        <div className="space-y-4">
                            <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Apify API Key</label><input type="password" placeholder="apify_proxy_..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-[#013388]" /></div>
                            <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Perplexity API Key</label><input type="password" placeholder="pplx-..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-[#013388]" /></div>
                        </div>
                        <button onClick={() => setShowSettings(false)} className="w-full py-6 bg-[#013388] text-white rounded-[32px] font-black uppercase text-xs shadow-xl">Memorizar Conexiones</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HQDashboard;
