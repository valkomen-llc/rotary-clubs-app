import React, { useState, useRef, useEffect } from 'react';
import {
    MessageCircle, Palette, Globe, FileText, FolderKanban,
    Users, Rocket, Sparkles, Calendar, Activity, Radio,
    Shield, Zap, X, Send, Loader2, Monitor, Clock, BarChart3,
    TrendingUp, CheckCircle2, AlertCircle, Cpu,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';
const avatar = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

interface ChatMessage { role: 'user' | 'assistant'; text: string; }

interface Agent {
    id: string; name: string; role: string; description: string;
    icon: React.ElementType; status: 'active' | 'standby' | 'upcoming';
    availability: string; avatarColor: string; avatarSeed: string;
    greeting: string; lastAction: string; actionTime: string; tasksDone: number;
}

const AGENTS: Agent[] = [
    {
        id: 'aria', name: 'Aria', role: 'ChatBot Público',
        description: 'Responde preguntas de visitantes 24/7',
        icon: MessageCircle, status: 'active', availability: '24/7',
        avatarColor: '#3B82F6', avatarSeed: 'Aria',
        greeting: '¡Hola! Soy Aria 💬 Atiendo visitantes 24/7.',
        lastAction: 'Respondió consulta sobre membresía', actionTime: 'Hace 2 min', tasksDone: 347,
    },
    {
        id: 'marco', name: 'Marco', role: 'Consejero RRSS',
        description: 'Genera estrategia de contenido social',
        icon: Calendar, status: 'active', availability: 'On-demand',
        avatarColor: '#8B5CF6', avatarSeed: 'Marco',
        greeting: '¡Hey! Soy Marco 📱 Creo estrategia para redes.',
        lastAction: 'Generó calendario semanal de posts', actionTime: 'Hace 15 min', tasksDone: 89,
    },
    {
        id: 'sol', name: 'Sol', role: 'Bienvenida',
        description: 'Guía a clubes nuevos en la plataforma',
        icon: Sparkles, status: 'active', availability: 'Wizard',
        avatarColor: '#F59E0B', avatarSeed: 'Sol',
        greeting: '¡Bienvenido! ✨ Soy Sol, tu primera guía.',
        lastAction: 'Onboarding completado para 2 clubes', actionTime: 'Hace 1h', tasksDone: 24,
    },
    {
        id: 'luna', name: 'Luna', role: 'Identidad Visual',
        description: 'Asesora en logo y colores',
        icon: Palette, status: 'active', availability: 'Wizard',
        avatarColor: '#EC4899', avatarSeed: 'Luna',
        greeting: '¡Hola! 🎨 Soy Luna, la experta en branding.',
        lastAction: 'Sugirió paleta de colores para club', actionTime: 'Hace 30 min', tasksDone: 56,
    },
    {
        id: 'leo', name: 'Leo', role: 'Redactor',
        description: 'Redacta textos profesionales del club',
        icon: FileText, status: 'active', availability: 'Wizard',
        avatarColor: '#10B981', avatarSeed: 'Leo',
        greeting: 'Soy Leo 📝 Te ayudo con los textos.',
        lastAction: 'Redactó descripción de proyecto', actionTime: 'Hace 45 min', tasksDone: 128,
    },
    {
        id: 'nube', name: 'Nube', role: 'Redes Sociales',
        description: 'Configura perfiles en redes sociales',
        icon: Globe, status: 'active', availability: 'Wizard',
        avatarColor: '#0EA5E9', avatarSeed: 'Nube',
        greeting: '¡Hola! 🌐 Soy Nube, conecto tu club con el mundo.',
        lastAction: 'Configuró perfil de Instagram', actionTime: 'Hace 20 min', tasksDone: 42,
    },
    {
        id: 'iris', name: 'Iris', role: 'Contenido Web',
        description: 'Crea textos impactantes para tu sitio',
        icon: FileText, status: 'active', availability: 'Wizard',
        avatarColor: '#6366F1', avatarSeed: 'Iris',
        greeting: 'Soy Iris 💜 Diseño las palabras de tu página.',
        lastAction: 'Actualizó sección Quiénes Somos', actionTime: 'Hace 10 min', tasksDone: 93,
    },
    {
        id: 'kai', name: 'Kai', role: 'Proyectos',
        description: 'Documenta proyectos de servicio',
        icon: FolderKanban, status: 'active', availability: 'Wizard',
        avatarColor: '#F97316', avatarSeed: 'Kai',
        greeting: '¡Qué tal! 🔥 Soy Kai, el de proyectos.',
        lastAction: 'Documentó proyecto de agua potable', actionTime: 'Hace 3h', tasksDone: 67,
    },
    {
        id: 'vera', name: 'Vera', role: 'Directorio',
        description: 'Gestiona el directorio de socios',
        icon: Users, status: 'active', availability: 'Wizard',
        avatarColor: '#14B8A6', avatarSeed: 'Vera',
        greeting: 'Soy Vera 👥 Organizo tu directorio.',
        lastAction: 'Sincronizó 12 nuevos contactos', actionTime: 'Hace 5 min', tasksDone: 215,
    },
    {
        id: 'nova', name: 'Nova', role: 'Publicación',
        description: 'Lanza y revisa tu sitio web',
        icon: Rocket, status: 'active', availability: 'Wizard',
        avatarColor: '#EF4444', avatarSeed: 'Nova',
        greeting: '¡Soy Nova! 🚀 Te ayudo a publicar tu sitio.',
        lastAction: 'Verificó deploy de sitio web', actionTime: 'Hace 8 min', tasksDone: 31,
    },
];

// Simulated live activity feed
const ACTIVITY_FEED = [
    { agent: 'Aria', action: 'Respondió consulta sobre donaciones', time: '23:45', type: 'chat' },
    { agent: 'Vera', action: 'Sincronizó directorio de socios', time: '23:42', type: 'sync' },
    { agent: 'Iris', action: 'Actualizó contenido de página Inicio', time: '23:38', type: 'edit' },
    { agent: 'Marco', action: 'Publicó post en redes sociales', time: '23:30', type: 'publish' },
    { agent: 'Aria', action: 'Atendió visitante — FAQ membresía', time: '23:25', type: 'chat' },
    { agent: 'Leo', action: 'Redactó noticia del club', time: '23:18', type: 'edit' },
    { agent: 'Nova', action: 'Deploy exitoso — v2.4.1', time: '23:10', type: 'deploy' },
    { agent: 'Kai', action: 'Documentó proyecto de educación', time: '22:55', type: 'edit' },
    { agent: 'Luna', action: 'Generó variantes de logo', time: '22:40', type: 'design' },
    { agent: 'Nube', action: 'Conectó cuenta de Facebook', time: '22:30', type: 'sync' },
];

const MissionControl: React.FC = () => {
    const [chatAgent, setChatAgent] = useState<Agent | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'agents' | 'activity'>('agents');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const activeCount = AGENTS.filter(a => a.status === 'active').length;
    const totalTasks = AGENTS.reduce((sum, a) => sum + a.tasksDone, 0);

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
                body: JSON.stringify({
                    message: userMsg, agentId: chatAgent.id,
                    history: messages.map(m => ({ role: m.role, text: m.text })),
                }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', text: data.reply || 'No pude responder.' }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Error al conectar. Intenta de nuevo.' }]);
        } finally { setLoading(false); }
    };

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'chat': return <MessageCircle className="w-3.5 h-3.5" />;
            case 'sync': return <Activity className="w-3.5 h-3.5" />;
            case 'edit': return <FileText className="w-3.5 h-3.5" />;
            case 'publish': return <Globe className="w-3.5 h-3.5" />;
            case 'deploy': return <Rocket className="w-3.5 h-3.5" />;
            case 'design': return <Palette className="w-3.5 h-3.5" />;
            default: return <Zap className="w-3.5 h-3.5" />;
        }
    };

    return (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
            {/* Top Header Bar */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <Radio className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                            Mission Control
                            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">LIVE</span>
                        </h2>
                        <p className="text-[11px] text-white/40 font-medium">Centro de operaciones de agentes IA</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {/* Stats pills */}
                    <div className="hidden md:flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-emerald-500/15 px-3 py-1.5 rounded-full">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">{activeCount} Online</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-blue-500/15 px-3 py-1.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-blue-400" />
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider">{totalTasks} Tareas</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-amber-500/15 px-3 py-1.5 rounded-full">
                            <Cpu className="w-3 h-3 text-amber-400" />
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">GPT-4</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content — 3 column layout */}
            <div className="flex" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
                {/* Left: Agent Grid or Activity Feed */}
                <div className={`flex flex-col transition-all duration-500 ${chatAgent ? 'w-[55%]' : 'w-full'}`}>
                    {/* Tab Bar */}
                    <div className="flex items-center gap-0 px-4 pt-3">
                        <button
                            onClick={() => setActiveTab('agents')}
                            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-all ${activeTab === 'agents'
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/40 hover:text-white/60'
                                }`}
                        >
                            <Monitor className="w-3.5 h-3.5" />
                            Agentes
                        </button>
                        <button
                            onClick={() => setActiveTab('activity')}
                            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-all ${activeTab === 'activity'
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/40 hover:text-white/60'
                                }`}
                        >
                            <Activity className="w-3.5 h-3.5" />
                            Actividad en Vivo
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                        {activeTab === 'agents' ? (
                            /* Agent Cards Grid */
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pt-3">
                                {AGENTS.map(agent => {
                                    const Icon = agent.icon;
                                    const isChatting = chatAgent?.id === agent.id;
                                    return (
                                        <div
                                            key={agent.id}
                                            onClick={() => openChat(agent)}
                                            className={`group relative rounded-xl p-4 cursor-pointer transition-all duration-300 border ${isChatting
                                                    ? 'bg-white/15 border-white/30 shadow-lg'
                                                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                                }`}
                                        >
                                            {/* Status indicator */}
                                            <div className="absolute top-3 right-3">
                                                <div className={`w-2.5 h-2.5 rounded-full ${isChatting ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'
                                                    }`} />
                                            </div>

                                            {/* Avatar */}
                                            <div className="flex items-center gap-3 mb-3">
                                                <div
                                                    className="w-11 h-11 rounded-full overflow-hidden border-2 flex-shrink-0 group-hover:scale-110 transition-transform"
                                                    style={{
                                                        borderColor: agent.avatarColor,
                                                        background: agent.avatarColor + '20',
                                                        boxShadow: `0 0 20px ${agent.avatarColor}30`,
                                                    }}
                                                >
                                                    <img src={avatar(agent.avatarSeed)} alt={agent.name} className="w-full h-full" loading="lazy" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-sm font-black text-white truncate">{agent.name}</h4>
                                                    <p className="text-[10px] font-bold truncate" style={{ color: agent.avatarColor }}>{agent.role}</p>
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <p className="text-[11px] text-white/50 leading-relaxed mb-3 line-clamp-2">{agent.description}</p>

                                            {/* Last action */}
                                            <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                                                <Clock className="w-3 h-3" />
                                                <span className="truncate">{agent.lastAction}</span>
                                            </div>

                                            {/* Footer stats */}
                                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                                                <div className="flex items-center gap-1 text-[10px] text-white/40">
                                                    <BarChart3 className="w-3 h-3" />
                                                    <span>{agent.tasksDone} tareas</span>
                                                </div>
                                                <span className="text-[9px] font-bold text-white/30 uppercase">{agent.availability}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            /* Activity Feed */
                            <div className="space-y-1 pt-3">
                                {/* Live header */}
                                <div className="flex items-center gap-2 mb-3 px-2">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">En vivo — Registro de actividad</span>
                                </div>

                                {ACTIVITY_FEED.map((item, i) => {
                                    const agentData = AGENTS.find(a => a.name === item.agent);
                                    return (
                                        <div
                                            key={i}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
                                            style={{ animation: `fadeIn 0.3s ease-out ${i * 0.05}s both` }}
                                        >
                                            {/* Agent avatar */}
                                            <div
                                                className="w-8 h-8 rounded-full overflow-hidden border flex-shrink-0"
                                                style={{
                                                    borderColor: agentData?.avatarColor || '#666',
                                                    background: (agentData?.avatarColor || '#666') + '20',
                                                }}
                                            >
                                                <img src={avatar(agentData?.avatarSeed || item.agent)} alt="" className="w-full h-full" />
                                            </div>

                                            {/* Action icon */}
                                            <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-white/40 flex-shrink-0">
                                                {getActivityIcon(item.type)}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] text-white/70 truncate">
                                                    <span className="font-bold text-white/90">{item.agent}</span>{' '}
                                                    {item.action}
                                                </p>
                                            </div>

                                            {/* Time */}
                                            <span className="text-[10px] text-white/30 font-medium flex-shrink-0">{item.time}</span>
                                        </div>
                                    );
                                })}

                                {/* System stats */}
                                <div className="mt-4 grid grid-cols-3 gap-3 px-2">
                                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                                            <span className="text-[10px] font-bold text-white/40 uppercase">Uptime</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">99.9%</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                        <div className="flex items-center gap-2 mb-2">
                                            <MessageCircle className="w-4 h-4 text-blue-400" />
                                            <span className="text-[10px] font-bold text-white/40 uppercase">Hoy</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">{totalTasks}</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertCircle className="w-4 h-4 text-amber-400" />
                                            <span className="text-[10px] font-bold text-white/40 uppercase">Errores</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">0</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Chat Panel */}
                {chatAgent && (
                    <div
                        className="w-[45%] border-l border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent flex flex-col"
                        style={{ animation: 'slideInRight 0.3s ease-out' }}
                    >
                        {/* Chat Header */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 flex-shrink-0">
                            <div
                                className="w-10 h-10 rounded-full overflow-hidden border-2 flex-shrink-0"
                                style={{ borderColor: chatAgent.avatarColor, background: chatAgent.avatarColor + '20' }}
                            >
                                <img src={avatar(chatAgent.avatarSeed)} alt={chatAgent.name} className="w-full h-full" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-black text-white truncate">{chatAgent.name}</h4>
                                <p className="text-[10px] font-bold text-white/40 truncate">{chatAgent.role} · {chatAgent.availability}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mr-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[9px] font-bold text-emerald-400">Online</span>
                            </div>
                            <button onClick={closeChat} className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ scrollBehavior: 'smooth' }}>
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
                                            ? 'bg-blue-600 text-white rounded-br-md'
                                            : 'bg-white/10 text-white/80 rounded-bl-md border border-white/5'}
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
                                    <div className="bg-white/10 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1 border border-white/5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div className="flex items-center gap-2 px-5 py-4 border-t border-white/10 flex-shrink-0">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder={`Pregúntale a ${chatAgent.name}...`}
                                className="flex-1 px-4 py-2.5 bg-white/5 rounded-xl text-sm text-white outline-none border border-white/10 focus:border-white/30 transition-all font-medium placeholder:text-white/30"
                                disabled={loading}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={loading || !input.trim()}
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-30"
                                style={{ background: chatAgent.avatarColor }}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Status Bar */}
            <div className="border-t border-white/10 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-white/30" />
                        <span className="text-[10px] font-bold text-white/30">Powered by OpenAI GPT-4 · Gemini</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-emerald-500/60" />
                        <span className="text-[10px] font-bold text-white/30">Todos los sistemas operativos</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-amber-500/60" />
                    <span className="text-[10px] font-bold text-white/30">Valkomen AI Platform v2.0</span>
                </div>
            </div>

            {/* CSS */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
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
