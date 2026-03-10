import React, { useState, useRef, useEffect } from 'react';
import {
    MessageCircle, Palette, Globe, FileText, FolderKanban,
    Users, Rocket, Sparkles, Calendar, Activity, Radio,
    Shield, Zap, X, Send, Loader2,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

// DiceBear avatar URLs — each agent gets a unique character
const avatar = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
}

interface Agent {
    id: string;
    name: string;
    role: string;
    description: string;
    icon: React.ElementType;
    status: 'active' | 'standby' | 'upcoming';
    availability: string;
    avatarColor: string;
    avatarSeed: string;
    deskPos: { x: number; y: number };
    greeting: string;
}

const AGENTS: Agent[] = [
    {
        id: 'aria', name: 'Aria', role: 'ChatBot Público',
        description: 'Responde preguntas de visitantes 24/7',
        icon: MessageCircle, status: 'active', availability: '24/7',
        avatarColor: '#3B82F6', avatarSeed: 'Aria',
        deskPos: { x: 5, y: 18 },
        greeting: '¡Hola! Soy Aria 💬 Atiendo visitantes de tu sitio las 24 horas.',
    },
    {
        id: 'marco', name: 'Marco', role: 'Consejero RRSS',
        description: 'Genera estrategia de contenido social',
        icon: Calendar, status: 'active', availability: 'On-demand',
        avatarColor: '#8B5CF6', avatarSeed: 'Marco',
        deskPos: { x: 23, y: 13 },
        greeting: '¡Hey! Soy Marco 📱 Creo estrategia para tus redes.',
    },
    {
        id: 'sol', name: 'Sol', role: 'Bienvenida',
        description: 'Guía a clubes nuevos en la plataforma',
        icon: Sparkles, status: 'active', availability: 'Wizard',
        avatarColor: '#F59E0B', avatarSeed: 'Sol',
        deskPos: { x: 41, y: 8 },
        greeting: '¡Bienvenido! ✨ Soy Sol, tu primera guía.',
    },
    {
        id: 'luna', name: 'Luna', role: 'Identidad Visual',
        description: 'Asesora en logo y colores',
        icon: Palette, status: 'active', availability: 'Wizard',
        avatarColor: '#EC4899', avatarSeed: 'Luna',
        deskPos: { x: 59, y: 13 },
        greeting: '¡Hola! 🎨 Soy Luna, la experta en branding.',
    },
    {
        id: 'leo', name: 'Leo', role: 'Información',
        description: 'Redacta textos profesionales del club',
        icon: FileText, status: 'active', availability: 'Wizard',
        avatarColor: '#10B981', avatarSeed: 'Leo',
        deskPos: { x: 77, y: 18 },
        greeting: 'Soy Leo 📝 Te ayudo con los textos del club.',
    },
    {
        id: 'nube', name: 'Nube', role: 'Redes Sociales',
        description: 'Configura perfiles en redes sociales',
        icon: Globe, status: 'active', availability: 'Wizard',
        avatarColor: '#0EA5E9', avatarSeed: 'Nube',
        deskPos: { x: 5, y: 55 },
        greeting: '¡Hola! 🌐 Soy Nube, conecto tu club con el mundo.',
    },
    {
        id: 'iris', name: 'Iris', role: 'Contenido Web',
        description: 'Crea textos impactantes para tu sitio',
        icon: FileText, status: 'active', availability: 'Wizard',
        avatarColor: '#6366F1', avatarSeed: 'Iris',
        deskPos: { x: 23, y: 50 },
        greeting: 'Soy Iris 💜 Diseño las palabras de tu página.',
    },
    {
        id: 'kai', name: 'Kai', role: 'Proyectos',
        description: 'Documenta proyectos de servicio',
        icon: FolderKanban, status: 'active', availability: 'Wizard',
        avatarColor: '#F97316', avatarSeed: 'Kai',
        deskPos: { x: 41, y: 55 },
        greeting: '¡Qué tal! 🔥 Soy Kai, el de proyectos.',
    },
    {
        id: 'vera', name: 'Vera', role: 'Directorio',
        description: 'Gestiona el directorio de socios',
        icon: Users, status: 'active', availability: 'Wizard',
        avatarColor: '#14B8A6', avatarSeed: 'Vera',
        deskPos: { x: 59, y: 50 },
        greeting: 'Soy Vera 👥 Organizo tu directorio de socios.',
    },
    {
        id: 'nova', name: 'Nova', role: 'Publicación',
        description: 'Lanza y revisa tu sitio web',
        icon: Rocket, status: 'active', availability: 'Wizard',
        avatarColor: '#EF4444', avatarSeed: 'Nova',
        deskPos: { x: 77, y: 55 },
        greeting: '¡Soy Nova! 🚀 Te ayudo a publicar tu sitio.',
    },
];

const MissionControl: React.FC = () => {
    const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);
    const [chatAgent, setChatAgent] = useState<Agent | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const activeCount = AGENTS.filter(a => a.status === 'active').length;

    // Scroll to bottom of chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when chat opens
    useEffect(() => {
        if (chatAgent) {
            setTimeout(() => inputRef.current?.focus(), 200);
        }
    }, [chatAgent]);

    const openChat = (agent: Agent) => {
        setChatAgent(agent);
        setMessages([{ role: 'assistant', text: agent.greeting }]);
        setInput('');
    };

    const closeChat = () => {
        setChatAgent(null);
        setMessages([]);
    };

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
                body: JSON.stringify({
                    message: userMsg,
                    agentId: chatAgent.id,
                    history: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text })),
                }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', text: data.reply || 'No pude responder.' }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Error al conectar con el agente. Intenta de nuevo.' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-all">
            {/* Header */}
            <div className="px-10 pt-8 pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center shadow-lg">
                            <Radio className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Mission Control</h3>
                            <p className="text-[11px] text-gray-400 font-medium">
                                Haz clic en un agente para conversar con él
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">{activeCount} Activos</span>
                    </div>
                </div>
            </div>

            {/* Office + Chat side by side */}
            <div className="flex mx-6 mb-6 gap-0 relative">
                {/* Virtual Office */}
                <div
                    className={`relative rounded-2xl overflow-hidden transition-all duration-500 ${chatAgent ? 'w-[55%]' : 'w-full'}`}
                    style={{
                        background: 'linear-gradient(180deg, #1a1b3a 0%, #2d2b55 40%, #3b3875 70%, #4a4690 100%)',
                        height: 'calc(100vh - 320px)', minHeight: '400px',
                    }}
                >
                    {/* Stars */}
                    <div className="absolute inset-0 overflow-hidden">
                        {[...Array(30)].map((_, i) => (
                            <div
                                key={`s-${i}`}
                                className="absolute rounded-full bg-white"
                                style={{
                                    width: Math.random() * 2 + 1,
                                    height: Math.random() * 2 + 1,
                                    left: `${Math.random() * 100}%`,
                                    top: `${Math.random() * 45}%`,
                                    opacity: Math.random() * 0.5 + 0.2,
                                    animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
                                    animationDelay: `${Math.random() * 3}s`,
                                }}
                            />
                        ))}
                    </div>

                    {/* Floor */}
                    <div
                        className="absolute bottom-0 left-0 right-0"
                        style={{
                            height: '55%',
                            background: 'linear-gradient(180deg, transparent, rgba(99,102,241,0.08) 20%, rgba(99,102,241,0.15))',
                            borderTop: '1px solid rgba(99,102,241,0.15)',
                        }}
                    />

                    {/* Window */}
                    <div className="absolute top-[4%] left-1/2 -translate-x-1/2">
                        <div className="w-16 h-10 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center">
                            <span className="text-lg" style={{ filter: 'drop-shadow(0 0 6px rgba(96,165,250,0.3))' }}>🌍</span>
                        </div>
                    </div>

                    {/* Decorations */}
                    <div className="absolute left-[1%] bottom-[6%] text-xl opacity-50">🌿</div>
                    <div className="absolute right-[2%] bottom-[30%] text-sm opacity-40">🪴</div>

                    {/* Agents */}
                    {AGENTS.map(agent => {
                        const isHovered = hoveredAgent?.id === agent.id;
                        const isChatting = chatAgent?.id === agent.id;
                        const isActive = isHovered || isChatting;

                        return (
                            <div
                                key={agent.id}
                                className="absolute cursor-pointer"
                                style={{
                                    left: `${agent.deskPos.x}%`,
                                    top: `${agent.deskPos.y}%`,
                                    zIndex: isActive ? 50 : 10,
                                }}
                                onMouseEnter={() => setHoveredAgent(agent)}
                                onMouseLeave={() => setHoveredAgent(null)}
                                onClick={() => openChat(agent)}
                            >
                                {/* Tooltip on hover (only if no chat open for this agent) */}
                                {isHovered && !isChatting && (
                                    <div
                                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44"
                                        style={{ animation: 'fadeSlideUp 0.2s ease-out' }}
                                    >
                                        <div className="bg-white rounded-xl p-2.5 shadow-xl border border-gray-100 relative">
                                            <p className="text-[10px] font-bold text-gray-700">{agent.greeting}</p>
                                            <div className="text-[8px] font-black text-gray-400 uppercase mt-1">{agent.role}</div>
                                            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-100 rotate-45" />
                                        </div>
                                    </div>
                                )}

                                {/* Desk + screen */}
                                <div className="relative">
                                    <div
                                        className="absolute top-14 left-1/2 -translate-x-1/2 transition-all duration-300"
                                        style={{
                                            width: '50px', height: '16px', borderRadius: '3px',
                                            background: isActive
                                                ? `linear-gradient(135deg, ${agent.avatarColor}40, ${agent.avatarColor}20)`
                                                : 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))',
                                            border: `1px solid ${isActive ? agent.avatarColor + '50' : 'rgba(255,255,255,0.08)'}`,
                                        }}
                                    >
                                        <div
                                            className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-3 rounded-sm"
                                            style={{
                                                background: isActive
                                                    ? `linear-gradient(180deg, ${agent.avatarColor}80, ${agent.avatarColor}20)`
                                                    : 'linear-gradient(180deg, rgba(99,102,241,0.3), rgba(99,102,241,0.08))',
                                                boxShadow: isActive ? `0 0 12px ${agent.avatarColor}40` : 'none',
                                            }}
                                        />
                                    </div>

                                    {/* Character Avatar */}
                                    <div
                                        className={`
                                            relative w-12 h-12 rounded-full mx-auto overflow-hidden
                                            transition-all duration-300 ease-out
                                            ${isActive ? 'scale-[1.4] -translate-y-2' : 'scale-100'}
                                        `}
                                        style={{
                                            border: `2.5px solid ${isActive ? 'white' : 'rgba(255,255,255,0.3)'}`,
                                            boxShadow: isActive
                                                ? `0 8px 25px ${agent.avatarColor}50, 0 0 30px ${agent.avatarColor}20`
                                                : `0 2px 6px rgba(0,0,0,0.2)`,
                                            background: agent.avatarColor + '30',
                                        }}
                                    >
                                        <img
                                            src={avatar(agent.avatarSeed)}
                                            alt={agent.name}
                                            className="w-full h-full"
                                            loading="lazy"
                                        />
                                    </div>

                                    {/* Online dot */}
                                    <div className={`
                                        absolute top-0.5 right-[calc(50%-24px)] w-3 h-3 rounded-full border-2 border-[#2d2b55]
                                        ${isChatting ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}
                                    `} />

                                    {/* Name */}
                                    <p className={`
                                        text-center mt-5 text-[9px] font-bold transition-all duration-300 whitespace-nowrap
                                        ${isActive ? 'text-white' : 'text-white/40'}
                                    `}>
                                        {agent.name}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Chat Panel — slides in when agent is selected */}
                {chatAgent && (
                    <div
                        className="w-[45%] rounded-r-2xl border border-l-0 border-gray-200 bg-white flex flex-col overflow-hidden"
                        style={{ height: 'calc(100vh - 320px)', minHeight: '400px', animation: 'slideInRight 0.3s ease-out' }}
                    >
                        {/* Chat Header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                            <div
                                className="w-9 h-9 rounded-full overflow-hidden border-2 flex-shrink-0"
                                style={{ borderColor: chatAgent.avatarColor, background: chatAgent.avatarColor + '20' }}
                            >
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
                                        <div
                                            className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0 mt-0.5"
                                            style={{ borderColor: chatAgent.avatarColor + '40', background: chatAgent.avatarColor + '15' }}
                                        >
                                            <img src={avatar(chatAgent.avatarSeed)} alt="" className="w-full h-full" />
                                        </div>
                                    )}
                                    <div className={`
                                        max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed font-medium
                                        ${msg.role === 'user'
                                            ? 'bg-gray-900 text-white rounded-br-md'
                                            : 'bg-gray-100 text-gray-700 rounded-bl-md'}
                                    `}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0"
                                        style={{ borderColor: chatAgent.avatarColor + '40', background: chatAgent.avatarColor + '15' }}
                                    >
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
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder={`Pregúntale a ${chatAgent.name}...`}
                                className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 focus:border-gray-300 focus:bg-white transition-all font-medium"
                                disabled={loading}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={loading || !input.trim()}
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40"
                                style={{ background: chatAgent.avatarColor }}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50/80 border-t border-gray-100 px-10 py-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-500">Powered by OpenAI GPT-4 · GPT-3.5</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span className="text-[10px] font-bold text-gray-500">Todos los sistemas operativos</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-gray-400">Fase 1 — Panel interactivo</span>
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes twinkle {
                    0%, 100% { opacity: 0.2; }
                    50% { opacity: 0.7; }
                }
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
};

export default MissionControl;
