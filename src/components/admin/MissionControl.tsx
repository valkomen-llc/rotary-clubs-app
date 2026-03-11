import React, { useState, useRef, useEffect } from 'react';
import {
    Radio, X, Send, Loader2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const avatarUrl = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

interface ChatMessage { role: 'user' | 'assistant'; text: string; }

interface Agent {
    id: string; name: string; role: string; category: string;
    description: string; avatarSeed: string; avatarColor: string;
    active: boolean; order: number; greeting: string;
    systemPrompt: string; aiModel: string; capabilities: string[];
}

const CATEGORY_ORDER = ['dirección', 'producción', 'tecnología', 'difusión'];
const CATEGORY_LABELS: Record<string, string> = {
    'dirección': 'Dirección y Estrategia',
    'producción': 'Producción de Contenido',
    'tecnología': 'Tecnología y Plataformas',
    'difusión': 'Difusión y Comunidad',
};

/* ─── Agent Card ─── */
const AgentCard: React.FC<{
    agent: Agent;
    tier: 'top' | 'mid' | 'base';
    isChatting: boolean;
    onClick: () => void;
}> = ({ agent, tier, isChatting, onClick }) => (
    <div
        onClick={onClick}
        className={`
            relative group cursor-pointer rounded-xl border transition-all duration-300
            ${isChatting
                ? 'border-[#F7A81B]/60 bg-white/[0.10] shadow-lg shadow-[#F7A81B]/15'
                : 'border-[#00A2E0]/15 bg-white/[0.04] hover:border-[#00A2E0]/40 hover:bg-white/[0.08]'}
            ${tier === 'top' ? 'px-6 py-5' : tier === 'mid' ? 'px-5 py-4' : 'px-4 py-3.5'}
        `}
    >
        {/* Left accent bar */}
        <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: agent.avatarColor }} />

        <div className="flex items-center gap-3">
            <div
                className={`rounded-full overflow-hidden border-2 flex-shrink-0 group-hover:scale-110 transition-transform ${tier === 'top' ? 'w-14 h-14' : tier === 'mid' ? 'w-12 h-12' : 'w-10 h-10'}`}
                style={{ borderColor: agent.avatarColor, background: agent.avatarColor + '20', boxShadow: `0 0 15px ${agent.avatarColor}25` }}
            >
                <img src={avatarUrl(agent.avatarSeed)} alt={agent.name} className="w-full h-full" loading="lazy" />
            </div>
            <div className="min-w-0 flex-1">
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: agent.avatarColor }}>{agent.role}</span>
                <h4 className={`font-black text-white leading-tight ${tier === 'top' ? 'text-lg' : tier === 'mid' ? 'text-base' : 'text-sm'}`}>{agent.name}</h4>
                <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">{agent.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <div className={`w-2.5 h-2.5 rounded-full ${isChatting ? 'bg-blue-400 animate-pulse' : agent.active ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                <span className="text-[8px] font-bold text-white/25 uppercase">{agent.aiModel}</span>
            </div>
        </div>
    </div>
);

/* ─── Connector Line ─── */
const VLine: React.FC<{ h?: string }> = ({ h = '28px' }) => (
    <div className="flex justify-center">
        <div style={{ width: '2px', height: h, background: 'linear-gradient(180deg, #F7A81B, rgba(247,168,27,0.15))' }} />
    </div>
);

const MissionControl: React.FC = () => {
    const { token } = useAuth();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loadingAgents, setLoadingAgents] = useState(true);
    const [chatAgent, setChatAgent] = useState<Agent | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || localStorage.getItem('rotary_token')}`,
    });

    // Fetch agents from API
    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await fetch(`${API_URL}/agents`, { headers: getHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    setAgents((data.agents || []).filter((a: Agent) => a.active));
                }
            } catch (e) { console.error('Failed to load agents:', e); }
            finally { setLoadingAgents(false); }
        };
        fetchAgents();
    }, [token]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    useEffect(() => { if (chatAgent) setTimeout(() => inputRef.current?.focus(), 200); }, [chatAgent]);

    // Listen for openAgentChat events from AgentProgressBar
    useEffect(() => {
        const handler = (e: Event) => {
            const name = (e as CustomEvent).detail?.agentName;
            if (name) {
                const agent = agents.find(a => a.name === name);
                if (agent) openChat(agent);
            }
        };
        window.addEventListener('openAgentChat', handler);
        return () => window.removeEventListener('openAgentChat', handler);
    }, [agents]);

    const openChat = (agent: Agent) => {
        setChatAgent(agent);
        setMessages([{ role: 'assistant', text: agent.greeting || `¡Hola! Soy ${agent.name} 👋` }]);
        setInput('');
    };
    const closeChat = () => { setChatAgent(null); setMessages([]); };

    const sendMessage = async () => {
        if (!input.trim() || !chatAgent || loading) return;
        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/ai/agent-chat`, {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify({ message: userMsg, agentId: chatAgent.id, history: messages.map(m => ({ role: m.role, text: m.text })) }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', text: data.reply || 'No pude responder.' }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Error al conectar. Intenta de nuevo.' }]);
        } finally { setLoading(false); }
    };

    // Group agents by category
    const grouped = agents.reduce((acc, agent) => {
        const cat = agent.category || 'otros';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(agent);
        return acc;
    }, {} as Record<string, Agent[]>);

    // Hierarchy: directors at top, then each category as a row
    const directors = grouped['dirección'] || [];
    const midCategories = CATEGORY_ORDER.filter(c => c !== 'dirección');

    const activeCount = agents.length;

    return (
        <div data-mission-control className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-all">
            {/* Header */}
            <div className="px-8 pt-6 pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#17458F] to-[#0067C8] flex items-center justify-center shadow-lg shadow-[#0067C8]/30">
                            <Radio className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Mission Control</h3>
                            <p className="text-[11px] text-gray-400 font-medium">Oficina de Comunicaciones — Haz clic en un agente para conversar</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">{activeCount} Activos</span>
                    </div>
                </div>
            </div>

            {/* Main Layout */}
            <div className="flex mx-6 mb-6 gap-0 relative">
                {/* Org Chart */}
                <div
                    className={`relative rounded-2xl overflow-hidden overflow-y-auto transition-all duration-500 ${chatAgent ? 'w-[55%]' : 'w-full'}`}
                    style={{
                        background: 'linear-gradient(160deg, #17458F 0%, #0067C8 30%, #17458F 60%, #0d2d5e 100%)',
                        height: 'calc(100vh - 320px)', minHeight: '450px',
                    }}
                >
                    {/* Cybernetic grid overlay */}
                    <div className="absolute inset-0 pointer-events-none" style={{
                        backgroundImage: `
                            linear-gradient(rgba(0,162,224,0.06) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,162,224,0.06) 1px, transparent 1px)
                        `,
                        backgroundSize: '40px 40px',
                    }} />
                    {/* Top glow accent */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[2px]" style={{
                        background: 'linear-gradient(90deg, transparent, #00A2E0, #F7A81B, #00A2E0, transparent)',
                    }} />
                    {/* Corner glow */}
                    <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none" style={{
                        background: 'radial-gradient(circle at top right, rgba(0,162,224,0.12), transparent 70%)',
                    }} />
                    <div className="absolute bottom-0 left-0 w-48 h-48 pointer-events-none" style={{
                        background: 'radial-gradient(circle at bottom left, rgba(247,168,27,0.08), transparent 70%)',
                    }} />
                    {loadingAgents ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="w-8 h-8 border-4 border-[#00A2E0] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="relative p-6 md:p-8">
                            {/* Level 1 — Directors */}
                            {directors.length > 0 && (
                                <>
                                    <div className={`grid gap-4 ${directors.length === 1 ? 'max-w-md mx-auto' : `grid-cols-${Math.min(directors.length, 3)}`}`}>
                                        {directors.map(agent => (
                                            <AgentCard key={agent.id} agent={agent} tier="top" isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                                        ))}
                                    </div>
                                    <VLine />
                                    <div className="flex justify-center">
                                        <div className="w-full max-w-lg relative">
                                            <div className="absolute top-0 left-1/4 right-1/4 h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(247,168,27,0.15), #F7A81B, rgba(247,168,27,0.15))' }} />
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Other categories as rows */}
                            {midCategories.map(catKey => {
                                const catAgents = grouped[catKey];
                                if (!catAgents || catAgents.length === 0) return null;
                                return (
                                    <div key={catKey} className="mt-4">
                                        <p className="text-center text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">
                                            {CATEGORY_LABELS[catKey]}
                                        </p>
                                        <div className={`grid gap-3`}
                                            style={{ gridTemplateColumns: `repeat(${Math.min(catAgents.length, 4)}, 1fr)` }}>
                                            {catAgents.map(agent => (
                                                <div key={agent.id}>
                                                    <VLine h="16px" />
                                                    <AgentCard agent={agent} tier="base" isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Chat Panel */}
                {chatAgent && (
                    <div
                        className="w-[45%] rounded-r-2xl border border-l-0 border-gray-200 bg-white flex flex-col overflow-hidden"
                        style={{ height: 'calc(100vh - 320px)', minHeight: '450px', animation: 'slideInRight 0.3s ease-out' }}
                    >
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                            <div className="w-9 h-9 rounded-full overflow-hidden border-2 flex-shrink-0"
                                style={{ borderColor: chatAgent.avatarColor, background: chatAgent.avatarColor + '20' }}>
                                <img src={avatarUrl(chatAgent.avatarSeed)} alt={chatAgent.name} className="w-full h-full" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-black text-gray-900 truncate">{chatAgent.name}</h4>
                                <p className="text-[10px] font-bold text-gray-400 truncate">{chatAgent.role}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mr-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[9px] font-bold text-emerald-600">Online</span>
                            </div>
                            <button onClick={closeChat} className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollBehavior: 'smooth' }}>
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0 mt-0.5"
                                            style={{ borderColor: chatAgent.avatarColor + '40', background: chatAgent.avatarColor + '15' }}>
                                            <img src={avatarUrl(chatAgent.avatarSeed)} alt="" className="w-full h-full" />
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed font-medium ${msg.role === 'user' ? 'bg-gray-900 text-white rounded-br-md' : 'bg-gray-100 text-gray-700 rounded-bl-md'
                                        }`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0"
                                        style={{ borderColor: chatAgent.avatarColor + '40', background: chatAgent.avatarColor + '15' }}>
                                        <img src={avatarUrl(chatAgent.avatarSeed)} alt="" className="w-full h-full" />
                                    </div>
                                    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white flex-shrink-0">
                            <input
                                ref={inputRef} value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder={`Pregúntale a ${chatAgent.name}...`}
                                className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 focus:border-gray-300 focus:bg-white transition-all font-medium"
                                disabled={loading}
                            />
                            <button onClick={sendMessage} disabled={loading || !input.trim()}
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40"
                                style={{ background: chatAgent.avatarColor }}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes cyberPulse {
                    0%, 100% { opacity: 0.06; }
                    50% { opacity: 0.12; }
                }
            `}</style>
        </div>
    );
};

export default MissionControl;
