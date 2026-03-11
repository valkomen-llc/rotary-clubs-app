import React, { useState, useRef, useEffect } from 'react';
import {
    MessageCircle, Palette, Globe, FileText, FolderKanban,
    Users, Rocket, Sparkles, Calendar, Activity, Radio,
    Shield, Zap, X, Send, Loader2,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';
const avatar = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

interface ChatMessage { role: 'user' | 'assistant'; text: string; }

interface Agent {
    id: string; name: string; role: string; description: string;
    icon: React.ElementType; status: 'active' | 'standby' | 'upcoming';
    availability: string; avatarColor: string; avatarSeed: string;
    greeting: string; row: number; col: number;
}

const AGENTS: Agent[] = [
    // Row 0 — back row (farthest, smallest)
    { id: 'sol', name: 'Sol', role: 'Bienvenida', description: 'Guía a clubes nuevos', icon: Sparkles, status: 'active', availability: 'Wizard', avatarColor: '#F59E0B', avatarSeed: 'Sol', greeting: '¡Bienvenido! ✨ Soy Sol, tu primera guía.', row: 0, col: 0 },
    { id: 'luna', name: 'Luna', role: 'Identidad Visual', description: 'Asesora en branding', icon: Palette, status: 'active', availability: 'Wizard', avatarColor: '#EC4899', avatarSeed: 'Luna', greeting: '¡Hola! 🎨 Soy Luna, la experta en branding.', row: 0, col: 1 },
    { id: 'leo', name: 'Leo', role: 'Redactor', description: 'Redacta textos profesionales', icon: FileText, status: 'active', availability: 'Wizard', avatarColor: '#10B981', avatarSeed: 'Leo', greeting: 'Soy Leo 📝 Te ayudo con los textos.', row: 0, col: 2 },
    // Row 1 — middle row
    { id: 'aria', name: 'Aria', role: 'ChatBot Público', description: 'Responde 24/7', icon: MessageCircle, status: 'active', availability: '24/7', avatarColor: '#3B82F6', avatarSeed: 'Aria', greeting: '¡Hola! Soy Aria 💬 Atiendo visitantes 24/7.', row: 1, col: 0 },
    { id: 'marco', name: 'Marco', role: 'Consejero RRSS', description: 'Estrategia social', icon: Calendar, status: 'active', availability: 'On-demand', avatarColor: '#8B5CF6', avatarSeed: 'Marco', greeting: '¡Hey! Soy Marco 📱 Creo estrategia para redes.', row: 1, col: 1 },
    { id: 'iris', name: 'Iris', role: 'Contenido Web', description: 'Crea textos web', icon: FileText, status: 'active', availability: 'Wizard', avatarColor: '#6366F1', avatarSeed: 'Iris', greeting: 'Soy Iris 💜 Diseño las palabras de tu página.', row: 1, col: 2 },
    { id: 'kai', name: 'Kai', role: 'Proyectos', description: 'Documenta proyectos', icon: FolderKanban, status: 'active', availability: 'Wizard', avatarColor: '#F97316', avatarSeed: 'Kai', greeting: '¡Qué tal! 🔥 Soy Kai, el de proyectos.', row: 1, col: 3 },
    // Row 2 — front row (closest, largest)
    { id: 'nube', name: 'Nube', role: 'Redes Sociales', description: 'Configura redes', icon: Globe, status: 'active', availability: 'Wizard', avatarColor: '#0EA5E9', avatarSeed: 'Nube', greeting: '¡Hola! 🌐 Soy Nube, conecto tu club con el mundo.', row: 2, col: 0 },
    { id: 'vera', name: 'Vera', role: 'Directorio', description: 'Gestiona socios', icon: Users, status: 'active', availability: 'Wizard', avatarColor: '#14B8A6', avatarSeed: 'Vera', greeting: 'Soy Vera 👥 Organizo tu directorio.', row: 2, col: 1 },
    { id: 'nova', name: 'Nova', role: 'Publicación', description: 'Lanza tu sitio', icon: Rocket, status: 'active', availability: 'Wizard', avatarColor: '#EF4444', avatarSeed: 'Nova', greeting: '¡Soy Nova! 🚀 Te ayudo a publicar tu sitio.', row: 2, col: 2 },
];

// Row configs: scale, yBase, xPositions
const ROW_CONFIGS = [
    { scale: 0.65, yPercent: 38, xPositions: [25, 50, 75] },          // Back row — 3 agents
    { scale: 0.8, yPercent: 55, xPositions: [15, 38, 62, 85] },       // Middle row — 4 agents
    { scale: 1.0, yPercent: 75, xPositions: [20, 50, 80] },           // Front row — 3 agents
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

            {/* Office Layout + Chat */}
            <div className="flex mx-6 mb-6 gap-0 relative">
                {/* The Virtual Office */}
                <div
                    className={`relative rounded-2xl overflow-hidden transition-all duration-500 ${chatAgent ? 'w-[55%]' : 'w-full'}`}
                    style={{ height: 'calc(100vh - 320px)', minHeight: '450px' }}
                >
                    {/* === BACK WALL === */}
                    <div className="absolute inset-0" style={{
                        background: 'linear-gradient(180deg, #0c1445 0%, #162058 30%, #1e2a6e 50%, #1a2460 70%, #131b4d 100%)',
                    }} />

                    {/* Curved wall top edge */}
                    <div className="absolute top-0 left-0 right-0 h-8" style={{
                        background: 'linear-gradient(180deg, #080e30, transparent)',
                        borderRadius: '0 0 50% 50%/0 0 100% 100%',
                    }} />

                    {/* === CEILING LIGHTS === */}
                    <div className="absolute top-0 left-[20%] w-[15%] h-3 rounded-b-full" style={{ background: 'linear-gradient(180deg, #fbbf24, transparent)', opacity: 0.4 }} />
                    <div className="absolute top-0 left-[45%] w-[10%] h-3 rounded-b-full" style={{ background: 'linear-gradient(180deg, #fbbf24, transparent)', opacity: 0.3 }} />
                    <div className="absolute top-0 right-[20%] w-[15%] h-3 rounded-b-full" style={{ background: 'linear-gradient(180deg, #fbbf24, transparent)', opacity: 0.4 }} />

                    {/* Light cone effects on wall */}
                    <div className="absolute top-0 left-[15%] w-[20%] h-[35%]" style={{
                        background: 'radial-gradient(ellipse at top, rgba(251,191,36,0.08) 0%, transparent 70%)',
                    }} />
                    <div className="absolute top-0 right-[15%] w-[20%] h-[35%]" style={{
                        background: 'radial-gradient(ellipse at top, rgba(251,191,36,0.08) 0%, transparent 70%)',
                    }} />

                    {/* === WALL SCREENS === */}
                    {/* Left screen — World Map */}
                    <div className="absolute top-[4%] left-[3%] w-[28%] h-[28%] rounded-lg overflow-hidden border border-white/10 shadow-lg" style={{
                        boxShadow: '0 0 30px rgba(59,130,246,0.15), inset 0 0 20px rgba(0,0,0,0.3)',
                    }}>
                        <img src="/mission-control-map.png" alt="World Map" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    </div>

                    {/* Center — Rotary Logo */}
                    <div className="absolute top-[2%] left-1/2 -translate-x-1/2 z-10">
                        <div className="relative">
                            {/* Glow behind logo */}
                            <div className="absolute inset-0 -m-4 rounded-full" style={{
                                background: 'radial-gradient(circle, rgba(251,191,36,0.25) 0%, transparent 70%)',
                                filter: 'blur(10px)',
                            }} />
                            {/* Rotary Gear SVG */}
                            <svg viewBox="0 0 100 100" className="w-20 h-20 md:w-24 md:h-24 relative z-10" style={{ filter: 'drop-shadow(0 0 15px rgba(251,191,36,0.4))' }}>
                                {/* Outer gear teeth */}
                                <circle cx="50" cy="50" r="45" fill="none" stroke="#d4a017" strokeWidth="2" opacity="0.6" />
                                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => {
                                    const rad = (angle * Math.PI) / 180;
                                    const x1 = 50 + 38 * Math.cos(rad); const y1 = 50 + 38 * Math.sin(rad);
                                    const x2 = 50 + 47 * Math.cos(rad); const y2 = 50 + 47 * Math.sin(rad);
                                    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d4a017" strokeWidth="6" strokeLinecap="round" opacity="0.8" />;
                                })}
                                {/* Inner circle */}
                                <circle cx="50" cy="50" r="32" fill="none" stroke="#d4a017" strokeWidth="2.5" opacity="0.9" />
                                {/* Gear body */}
                                <circle cx="50" cy="50" r="28" fill="#1a2460" stroke="#c99a0c" strokeWidth="1.5" />
                                {/* Rotary wheel spokes */}
                                {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                                    const rad = (angle * Math.PI) / 180;
                                    return <line key={`s-${i}`} x1="50" y1="50" x2={50 + 22 * Math.cos(rad)} y2={50 + 22 * Math.sin(rad)} stroke="#c99a0c" strokeWidth="2.5" opacity="0.8" />;
                                })}
                                <circle cx="50" cy="50" r="8" fill="#c99a0c" opacity="0.9" />
                                <circle cx="50" cy="50" r="4" fill="#1a2460" />
                                {/* Text */}
                                <text x="50" y="88" textAnchor="middle" fill="#c99a0c" fontSize="5.5" fontWeight="bold" fontFamily="Arial" opacity="0.9">ROTARY</text>
                            </svg>
                        </div>
                    </div>

                    {/* Right screen — Analytics */}
                    <div className="absolute top-[4%] right-[3%] w-[28%] h-[28%] rounded-lg overflow-hidden border border-white/10 shadow-lg" style={{
                        boxShadow: '0 0 30px rgba(139,92,246,0.15), inset 0 0 20px rgba(0,0,0,0.3)',
                    }}>
                        <img src="/mission-control-charts.png" alt="Analytics" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    </div>

                    {/* Small center screen — Social Feed (below logo) */}
                    <div className="absolute top-[28%] left-1/2 -translate-x-1/2 w-[22%] h-[14%] rounded-md overflow-hidden border border-white/10" style={{
                        boxShadow: '0 0 20px rgba(96,165,250,0.1)',
                    }}>
                        <img src="/mission-control-social.png" alt="Social" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>

                    {/* === FLOOR === */}
                    <div className="absolute bottom-0 left-0 right-0" style={{
                        height: '55%',
                        background: 'linear-gradient(180deg, transparent 0%, rgba(30,42,110,0.3) 10%, rgba(20,30,80,0.6) 30%, rgba(15,22,60,0.9) 100%)',
                    }}>
                        {/* Floor grid lines for perspective */}
                        <div className="absolute inset-0 overflow-hidden opacity-[0.06]" style={{
                            backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
                            backgroundSize: '60px 40px',
                            transform: 'perspective(400px) rotateX(30deg)',
                            transformOrigin: 'center top',
                        }} />
                    </div>

                    {/* === DECORATIONS === */}
                    <div className="absolute left-[1%] bottom-[8%] text-xl opacity-40 select-none">🌿</div>
                    <div className="absolute right-[2%] bottom-[25%] text-sm opacity-35 select-none">🪴</div>
                    <div className="absolute left-[2%] bottom-[35%] text-xs opacity-30 select-none">☕</div>

                    {/* Robot left */}
                    <div className="absolute left-[1%] bottom-[15%] select-none" style={{ fontSize: '28px', opacity: 0.7, filter: 'drop-shadow(0 0 6px rgba(96,165,250,0.3))' }}>
                        🤖
                    </div>
                    {/* Robot right */}
                    <div className="absolute right-[1%] bottom-[45%] select-none" style={{ fontSize: '22px', opacity: 0.5, filter: 'drop-shadow(0 0 6px rgba(96,165,250,0.3))' }}>
                        🤖
                    </div>

                    {/* === AGENTS AT WORKSTATIONS === */}
                    {AGENTS.map(agent => {
                        const rowCfg = ROW_CONFIGS[agent.row];
                        const xPos = rowCfg.xPositions[agent.col];
                        const scale = rowCfg.scale;
                        const yPos = rowCfg.yPercent;
                        const isHovered = hoveredAgent?.id === agent.id;
                        const isChatting = chatAgent?.id === agent.id;
                        const isActive = isHovered || isChatting;

                        return (
                            <div
                                key={agent.id}
                                className="absolute cursor-pointer"
                                style={{
                                    left: `${xPos}%`,
                                    top: `${yPos}%`,
                                    transform: `translate(-50%, -50%) scale(${scale})`,
                                    zIndex: agent.row * 10 + (isActive ? 50 : 5),
                                    transition: 'all 0.3s ease',
                                }}
                                onMouseEnter={() => setHoveredAgent(agent)}
                                onMouseLeave={() => setHoveredAgent(null)}
                                onClick={() => openChat(agent)}
                            >
                                {/* Tooltip */}
                                {isHovered && !isChatting && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48" style={{ animation: 'fadeSlideUp 0.2s ease-out' }}>
                                        <div className="bg-white rounded-xl p-3 shadow-2xl border border-gray-100 relative">
                                            <p className="text-[10px] font-bold text-gray-700">{agent.greeting}</p>
                                            <div className="text-[8px] font-black text-gray-400 uppercase mt-1.5 flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                {agent.role} · {agent.availability}
                                            </div>
                                            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-100 rotate-45" />
                                        </div>
                                    </div>
                                )}

                                {/* === WORKSTATION === */}
                                <div className="relative" style={{ width: '90px' }}>
                                    {/* Monitor on desk */}
                                    <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '28px', zIndex: 1 }}>
                                        {/* Monitor frame */}
                                        <div className="relative mx-auto" style={{
                                            width: '48px', height: '30px', borderRadius: '3px',
                                            background: isActive
                                                ? `linear-gradient(135deg, ${agent.avatarColor}90, ${agent.avatarColor}40)`
                                                : 'linear-gradient(135deg, rgba(96,165,250,0.3), rgba(96,165,250,0.08))',
                                            border: `1px solid ${isActive ? agent.avatarColor + '80' : 'rgba(255,255,255,0.1)'}`,
                                            boxShadow: isActive
                                                ? `0 0 20px ${agent.avatarColor}40, 0 2px 8px rgba(0,0,0,0.3)`
                                                : '0 2px 6px rgba(0,0,0,0.3)',
                                            transition: 'all 0.3s ease',
                                        }}>
                                            {/* Screen icon */}
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <agent.icon className="w-3.5 h-3.5" style={{ color: isActive ? 'white' : 'rgba(255,255,255,0.4)' }} />
                                            </div>
                                        </div>
                                        {/* Monitor stand */}
                                        <div className="mx-auto" style={{ width: '4px', height: '6px', background: 'rgba(255,255,255,0.15)' }} />
                                        {/* Monitor base */}
                                        <div className="mx-auto" style={{ width: '16px', height: '3px', borderRadius: '1px', background: 'rgba(255,255,255,0.1)' }} />
                                    </div>

                                    {/* Desk surface */}
                                    <div className="absolute left-1/2 -translate-x-1/2" style={{
                                        top: '64px', width: '70px', height: '12px', borderRadius: '2px',
                                        background: isActive
                                            ? `linear-gradient(135deg, ${agent.avatarColor}25, ${agent.avatarColor}10)`
                                            : 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                                        border: `1px solid ${isActive ? agent.avatarColor + '30' : 'rgba(255,255,255,0.06)'}`,
                                        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                                        transition: 'all 0.3s ease',
                                    }} />

                                    {/* Character Avatar */}
                                    <div
                                        className="relative mx-auto overflow-hidden transition-all duration-300 ease-out"
                                        style={{
                                            width: '52px', height: '52px', borderRadius: '50%',
                                            border: `2.5px solid ${isActive ? 'white' : 'rgba(255,255,255,0.3)'}`,
                                            boxShadow: isActive
                                                ? `0 8px 30px ${agent.avatarColor}50, 0 0 40px ${agent.avatarColor}20`
                                                : '0 2px 8px rgba(0,0,0,0.3)',
                                            background: agent.avatarColor + '25',
                                            transform: isActive ? 'scale(1.3) translateY(-6px)' : 'scale(1)',
                                            zIndex: 5,
                                        }}
                                    >
                                        <img src={avatar(agent.avatarSeed)} alt={agent.name} className="w-full h-full" loading="lazy" />
                                    </div>

                                    {/* Online indicator */}
                                    <div className="absolute z-10" style={{ top: '2px', right: 'calc(50% - 26px)' }}>
                                        <div className={`w-3 h-3 rounded-full border-2 ${isChatting ? 'bg-blue-400 animate-pulse border-[#1a2460]' : 'bg-emerald-400 border-[#1a2460]'}`} />
                                    </div>

                                    {/* Name label */}
                                    <p className="text-center mt-2 font-bold whitespace-nowrap transition-all duration-300" style={{
                                        fontSize: '9px',
                                        color: isActive ? 'white' : 'rgba(255,255,255,0.35)',
                                        textShadow: isActive ? `0 0 10px ${agent.avatarColor}80` : 'none',
                                    }}>
                                        {agent.name}
                                    </p>
                                    <p className="text-center font-medium whitespace-nowrap" style={{
                                        fontSize: '7px',
                                        color: isActive ? agent.avatarColor : 'rgba(255,255,255,0.2)',
                                    }}>
                                        {agent.role}
                                    </p>
                                </div>
                            </div>
                        );
                    })}

                    {/* === AMBIENT PARTICLES === */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {[...Array(15)].map((_, i) => (
                            <div
                                key={`p-${i}`}
                                className="absolute rounded-full bg-blue-400"
                                style={{
                                    width: Math.random() * 2 + 1,
                                    height: Math.random() * 2 + 1,
                                    left: `${Math.random() * 100}%`,
                                    top: `${Math.random() * 100}%`,
                                    opacity: Math.random() * 0.15 + 0.05,
                                    animation: `float ${4 + Math.random() * 6}s ease-in-out infinite`,
                                    animationDelay: `${Math.random() * 5}s`,
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* === CHAT PANEL === */}
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

            {/* Footer */}
            <div className="bg-gray-50/80 border-t border-gray-100 px-8 py-3 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-500">Powered by OpenAI GPT-4 · Gemini</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span className="text-[10px] font-bold text-gray-500">Todos los sistemas operativos</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-gray-400">Valkomen AI Platform v2.0</span>
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.05; }
                    25% { transform: translateY(-15px) translateX(5px); opacity: 0.15; }
                    50% { transform: translateY(-5px) translateX(-5px); opacity: 0.08; }
                    75% { transform: translateY(-20px) translateX(8px); opacity: 0.12; }
                }
            `}</style>
        </div>
    );
};

export default MissionControl;
