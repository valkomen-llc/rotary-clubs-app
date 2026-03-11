import React, { useState, useRef, useEffect } from 'react';
import {
    MessageCircle, Palette, Globe, FileText, FolderKanban,
    Users, Rocket, Sparkles, Calendar, Radio,
    X, Send, Loader2,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';
const avatar = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

interface ChatMessage { role: 'user' | 'assistant'; text: string; }

interface Agent {
    id: string; name: string; role: string; description: string;
    icon: React.ElementType; status: 'active' | 'standby' | 'upcoming';
    availability: string; avatarColor: string; avatarSeed: string;
    greeting: string;
}

// Hierarchy: Aria (top) → Sol + Marco (mid) → rest (bottom two rows)
const ARIA: Agent = {
    id: 'aria', name: 'Aria', role: 'Directora de Comunicaciones',
    description: 'Líder del equipo · Coordina todos los agentes · ChatBot público 24/7',
    icon: MessageCircle, status: 'active', availability: '24/7',
    avatarColor: '#3B82F6', avatarSeed: 'Aria',
    greeting: '¡Hola! Soy Aria 💬 Coordino la oficina y atiendo visitantes 24/7.',
};

const MID_TIER: Agent[] = [
    {
        id: 'sol', name: 'Sol', role: 'Coordinadora de Onboarding',
        description: 'Bienvenida · Guía a clubes nuevos · Setup inicial',
        icon: Sparkles, status: 'active', availability: 'Wizard',
        avatarColor: '#F59E0B', avatarSeed: 'Sol',
        greeting: '¡Bienvenido! ✨ Soy Sol, tu primera guía.',
    },
    {
        id: 'marco', name: 'Marco', role: 'Director de Estrategia Digital',
        description: 'Estrategia de contenido · RRSS · Calendario editorial',
        icon: Calendar, status: 'active', availability: 'On-demand',
        avatarColor: '#8B5CF6', avatarSeed: 'Marco',
        greeting: '¡Hey! Soy Marco 📱 Creo estrategia para redes.',
    },
];

const SPECIALISTS_ROW1: Agent[] = [
    {
        id: 'luna', name: 'Luna', role: 'Identidad Visual',
        description: 'Branding · Logo · Paleta de colores',
        icon: Palette, status: 'active', availability: 'Wizard',
        avatarColor: '#EC4899', avatarSeed: 'Luna',
        greeting: '¡Hola! 🎨 Soy Luna, la experta en branding.',
    },
    {
        id: 'leo', name: 'Leo', role: 'Redactor',
        description: 'Textos institucionales · Noticias · Comunicados',
        icon: FileText, status: 'active', availability: 'Wizard',
        avatarColor: '#10B981', avatarSeed: 'Leo',
        greeting: 'Soy Leo 📝 Te ayudo con los textos.',
    },
    {
        id: 'iris', name: 'Iris', role: 'Contenido Web',
        description: 'Páginas del sitio · SEO · Copywriting',
        icon: FileText, status: 'active', availability: 'Wizard',
        avatarColor: '#6366F1', avatarSeed: 'Iris',
        greeting: 'Soy Iris 💜 Diseño las palabras de tu página.',
    },
    {
        id: 'nube', name: 'Nube', role: 'Redes Sociales',
        description: 'Perfiles sociales · Conexiones · Publicación',
        icon: Globe, status: 'active', availability: 'Wizard',
        avatarColor: '#0EA5E9', avatarSeed: 'Nube',
        greeting: '¡Hola! 🌐 Soy Nube, conecto tu club con el mundo.',
    },
];

const SPECIALISTS_ROW2: Agent[] = [
    {
        id: 'kai', name: 'Kai', role: 'Proyectos',
        description: 'Documentación · Seguimiento · Impacto',
        icon: FolderKanban, status: 'active', availability: 'Wizard',
        avatarColor: '#F97316', avatarSeed: 'Kai',
        greeting: '¡Qué tal! 🔥 Soy Kai, el de proyectos.',
    },
    {
        id: 'vera', name: 'Vera', role: 'Directorio',
        description: 'Socios · Contactos · Sincronización',
        icon: Users, status: 'active', availability: 'Wizard',
        avatarColor: '#14B8A6', avatarSeed: 'Vera',
        greeting: 'Soy Vera 👥 Organizo tu directorio.',
    },
    {
        id: 'nova', name: 'Nova', role: 'Publicación',
        description: 'Deploy · Revisión · Lanzamiento del sitio',
        icon: Rocket, status: 'active', availability: 'Wizard',
        avatarColor: '#EF4444', avatarSeed: 'Nova',
        greeting: '¡Soy Nova! 🚀 Te ayudo a publicar tu sitio.',
    },
];

const ALL_AGENTS = [ARIA, ...MID_TIER, ...SPECIALISTS_ROW1, ...SPECIALISTS_ROW2];

/* ─── Agent Card ─── */
const AgentCard: React.FC<{
    agent: Agent;
    isTop?: boolean;
    isMid?: boolean;
    isChatting: boolean;
    onClick: () => void;
}> = ({ agent, isTop, isMid, isChatting, onClick }) => {
    const Icon = agent.icon;
    return (
        <div
            onClick={onClick}
            className={`
                relative group cursor-pointer rounded-xl border transition-all duration-300
                ${isChatting
                    ? 'border-amber-500/60 bg-white/[0.08] shadow-lg shadow-amber-500/10'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]'}
                ${isTop ? 'px-6 py-5' : isMid ? 'px-5 py-4' : 'px-4 py-3.5'}
            `}
        >
            {/* Left accent bar */}
            <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: agent.avatarColor }} />

            <div className="flex items-center gap-3">
                {/* Avatar */}
                <div
                    className={`rounded-full overflow-hidden border-2 flex-shrink-0 group-hover:scale-110 transition-transform ${isTop ? 'w-14 h-14' : isMid ? 'w-12 h-12' : 'w-10 h-10'}`}
                    style={{
                        borderColor: agent.avatarColor,
                        background: agent.avatarColor + '20',
                        boxShadow: `0 0 15px ${agent.avatarColor}25`,
                    }}
                >
                    <img src={avatar(agent.avatarSeed)} alt={agent.name} className="w-full h-full" loading="lazy" />
                </div>

                <div className="min-w-0 flex-1">
                    {/* Role badge */}
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: agent.avatarColor }}>
                        {agent.role}
                    </span>

                    {/* Name */}
                    <h4 className={`font-black text-white leading-tight ${isTop ? 'text-lg' : isMid ? 'text-base' : 'text-sm'}`}>
                        {agent.name}
                    </h4>

                    {/* Description */}
                    <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">{agent.description}</p>
                </div>

                {/* Status + availability badge */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${isChatting ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
                    <span className="text-[8px] font-bold text-white/25 uppercase">{agent.availability}</span>
                </div>
            </div>
        </div>
    );
};

/* ─── Connector Line ─── */
const VerticalLine: React.FC<{ height?: string }> = ({ height = '28px' }) => (
    <div className="flex justify-center">
        <div style={{ width: '2px', height, background: 'linear-gradient(180deg, #f59e0b, rgba(245,158,11,0.2))' }} />
    </div>
);

const MissionControl: React.FC = () => {
    const [chatAgent, setChatAgent] = useState<Agent | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const activeCount = ALL_AGENTS.filter(a => a.status === 'active').length;

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    useEffect(() => { if (chatAgent) setTimeout(() => inputRef.current?.focus(), 200); }, [chatAgent]);

    const openChat = (agent: Agent) => {
        setChatAgent(agent);
        setMessages([{ role: 'assistant', text: agent.greeting }]);
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
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/ai/agent-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message: userMsg, agentId: chatAgent.id, history: messages.map(m => ({ role: m.role, text: m.text })) }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', text: data.reply || 'No pude responder.' }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Error al conectar. Intenta de nuevo.' }]);
        } finally { setLoading(false); }
    };

    return (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-all">
            {/* Header */}
            <div className="px-8 pt-6 pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center shadow-lg">
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
                        background: 'linear-gradient(180deg, #0c1445 0%, #162058 40%, #1a2460 70%, #131b4d 100%)',
                        height: 'calc(100vh - 320px)', minHeight: '450px',
                    }}
                >
                    <div className="p-6 md:p-8">
                        {/* Level 1 — Aria (top) */}
                        <div className="flex justify-center">
                            <div className="w-full max-w-md">
                                <AgentCard agent={ARIA} isTop isChatting={chatAgent?.id === ARIA.id} onClick={() => openChat(ARIA)} />
                            </div>
                        </div>

                        <VerticalLine />

                        {/* Branch lines to mid tier */}
                        <div className="flex justify-center">
                            <div className="w-full max-w-lg relative">
                                <div className="absolute top-0 left-1/4 right-1/4 h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.2), #f59e0b, rgba(245,158,11,0.2))' }} />
                            </div>
                        </div>

                        {/* Level 2 — Sol + Marco */}
                        <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto mt-0">
                            <div>
                                <VerticalLine height="16px" />
                                <AgentCard agent={MID_TIER[0]} isMid isChatting={chatAgent?.id === MID_TIER[0].id} onClick={() => openChat(MID_TIER[0])} />
                            </div>
                            <div>
                                <VerticalLine height="16px" />
                                <AgentCard agent={MID_TIER[1]} isMid isChatting={chatAgent?.id === MID_TIER[1].id} onClick={() => openChat(MID_TIER[1])} />
                            </div>
                        </div>

                        <VerticalLine />

                        {/* Branch lines to specialists */}
                        <div className="flex justify-center">
                            <div className="w-full max-w-3xl relative">
                                <div className="absolute top-0 left-[12%] right-[12%] h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.15), #f59e0b40, rgba(245,158,11,0.15))' }} />
                            </div>
                        </div>

                        {/* Level 3 — Specialists Row 1 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto mt-0">
                            {SPECIALISTS_ROW1.map(agent => (
                                <div key={agent.id}>
                                    <VerticalLine height="16px" />
                                    <AgentCard agent={agent} isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                                </div>
                            ))}
                        </div>

                        <div className="my-4" />

                        {/* Level 4 — Specialists Row 2 */}
                        <div className="grid grid-cols-3 gap-3 max-w-3xl mx-auto">
                            {SPECIALISTS_ROW2.map(agent => (
                                <AgentCard key={agent.id} agent={agent} isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Chat Panel */}
                {chatAgent && (
                    <div
                        className="w-[45%] rounded-r-2xl border border-l-0 border-gray-200 bg-white flex flex-col overflow-hidden"
                        style={{ height: 'calc(100vh - 320px)', minHeight: '450px', animation: 'slideInRight 0.3s ease-out' }}
                    >
                        {/* Chat Header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                            <div className="w-9 h-9 rounded-full overflow-hidden border-2 flex-shrink-0"
                                style={{ borderColor: chatAgent.avatarColor, background: chatAgent.avatarColor + '20' }}>
                                <img src={avatar(chatAgent.avatarSeed)} alt={chatAgent.name} className="w-full h-full" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-black text-gray-900 truncate">{chatAgent.name}</h4>
                                <p className="text-[10px] font-bold text-gray-400 truncate">{chatAgent.role} · {chatAgent.availability}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mr-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[9px] font-bold text-emerald-600">Online</span>
                            </div>
                            <button onClick={closeChat} className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollBehavior: 'smooth' }}>
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0 mt-0.5"
                                            style={{ borderColor: chatAgent.avatarColor + '40', background: chatAgent.avatarColor + '15' }}>
                                            <img src={avatar(chatAgent.avatarSeed)} alt="" className="w-full h-full" />
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
                                        <img src={avatar(chatAgent.avatarSeed)} alt="" className="w-full h-full" />
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

                        {/* Input */}
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

            {/* CSS Animations */}
            <style>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
};

export default MissionControl;
