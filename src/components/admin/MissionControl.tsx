import React, { useState } from 'react';
import {
    MessageCircle, Palette, Globe, FileText, FolderKanban,
    Users, Rocket, Sparkles, Calendar, Activity, Radio,
    Shield, Zap, X,
} from 'lucide-react';

interface Agent {
    id: string;
    name: string;
    role: string;
    description: string;
    icon: React.ElementType;
    status: 'active' | 'standby' | 'upcoming';
    availability: string;
    avatarColor: string;
    deskPos: { x: number; y: number }; // position in the office grid (%)
    greeting: string;
}

const AGENTS: Agent[] = [
    {
        id: 'chatbot', name: 'Aria', role: 'ChatBot Público',
        description: 'Responde preguntas de visitantes 24/7 en tu sitio web',
        icon: MessageCircle, status: 'active', availability: '24/7',
        avatarColor: '#3B82F6', deskPos: { x: 8, y: 20 },
        greeting: '¡Hola! Soy Aria 💬 Atiendo a los visitantes de tu sitio web las 24 horas. ¿Necesitas algo?',
    },
    {
        id: 'content-suggest', name: 'Marco', role: 'Consejero RRSS',
        description: 'Genera ideas de publicaciones para redes sociales',
        icon: Calendar, status: 'active', availability: 'On-demand',
        avatarColor: '#8B5CF6', deskPos: { x: 28, y: 15 },
        greeting: '¡Hey! Soy Marco 📱 Creo estrategias de contenido para tus redes sociales.',
    },
    {
        id: 'onboarding-welcome', name: 'Sol', role: 'Bienvenida',
        description: 'Guía al club en su primer paso de configuración',
        icon: Sparkles, status: 'active', availability: 'Wizard',
        avatarColor: '#F59E0B', deskPos: { x: 48, y: 10 },
        greeting: '¡Bienvenido! ✨ Soy Sol, y mi trabajo es darte la mejor primera impresión del sistema.',
    },
    {
        id: 'onboarding-visual', name: 'Luna', role: 'Identidad Visual',
        description: 'Asesora en logo y colores institucionales',
        icon: Palette, status: 'active', availability: 'Wizard',
        avatarColor: '#EC4899', deskPos: { x: 68, y: 15 },
        greeting: '¡Hola! 🎨 Soy Luna. Me especializo en que tu club luzca increíble con el logo y colores correctos.',
    },
    {
        id: 'onboarding-info', name: 'Leo', role: 'Información',
        description: 'Ayuda a redactar la descripción y contacto del club',
        icon: FileText, status: 'active', availability: 'Wizard',
        avatarColor: '#10B981', deskPos: { x: 85, y: 20 },
        greeting: 'Soy Leo 📝 Te ayudo a redactar textos profesionales para tu club. ¡La comunicación es clave!',
    },
    {
        id: 'onboarding-social', name: 'Nube', role: 'Redes Sociales',
        description: 'Configura las URLs de redes sociales del club',
        icon: Globe, status: 'active', availability: 'Wizard',
        avatarColor: '#0EA5E9', deskPos: { x: 8, y: 55 },
        greeting: '¡Hola! 🌐 Soy Nube. Conecto tu club con el mundo a través de redes sociales.',
    },
    {
        id: 'onboarding-content', name: 'Iris', role: 'Contenido Web',
        description: 'Crea textos de hero, banner y sobre nosotros',
        icon: FileText, status: 'active', availability: 'Wizard',
        avatarColor: '#6366F1', deskPos: { x: 28, y: 50 },
        greeting: 'Soy Iris 💜 Diseño las palabras perfectas para tu página de inicio y secciones del sitio.',
    },
    {
        id: 'onboarding-projects', name: 'Kai', role: 'Proyectos',
        description: 'Documenta proyectos de servicio del club',
        icon: FolderKanban, status: 'active', availability: 'Wizard',
        avatarColor: '#F97316', deskPos: { x: 48, y: 55 },
        greeting: '¡Qué tal! 🔥 Soy Kai. Documento los proyectos de servicio para que el mundo los conozca.',
    },
    {
        id: 'onboarding-members', name: 'Vera', role: 'Directorio',
        description: 'Carga el directorio de socios del club',
        icon: Users, status: 'active', availability: 'Wizard',
        avatarColor: '#14B8A6', deskPos: { x: 68, y: 50 },
        greeting: 'Soy Vera 👥 Organizo el directorio de socios. ¡Cada miembro cuenta!',
    },
    {
        id: 'onboarding-publish', name: 'Nova', role: 'Publicación',
        description: 'Revisa y lanza el sitio web del club',
        icon: Rocket, status: 'active', availability: 'Wizard',
        avatarColor: '#EF4444', deskPos: { x: 85, y: 55 },
        greeting: '¡Soy Nova! 🚀 Mi misión es asegurar que tu sitio esté perfecto antes de publicarlo.',
    },
];

const MissionControl: React.FC = () => {
    const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);
    const activeCount = AGENTS.filter(a => a.status === 'active').length;

    return (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-all mt-8">
            {/* Header */}
            <div className="px-10 pt-8 pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center shadow-lg">
                            <Radio className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Mission Control</h3>
                            <p className="text-[11px] text-gray-400 font-medium">Tu equipo de agentes IA trabajando en la oficina virtual</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">{activeCount} Activos</span>
                    </div>
                </div>
            </div>

            {/* Virtual Office Scene */}
            <div className="mx-6 mb-6 relative">
                <div
                    className="relative rounded-2xl overflow-hidden"
                    style={{
                        background: 'linear-gradient(180deg, #1a1b3a 0%, #2d2b55 40%, #3b3875 70%, #4a4690 100%)',
                        height: '420px',
                    }}
                >
                    {/* Stars */}
                    <div className="absolute inset-0 overflow-hidden">
                        {[...Array(40)].map((_, i) => (
                            <div
                                key={`star-${i}`}
                                className="absolute rounded-full bg-white"
                                style={{
                                    width: Math.random() * 2 + 1,
                                    height: Math.random() * 2 + 1,
                                    left: `${Math.random() * 100}%`,
                                    top: `${Math.random() * 50}%`,
                                    opacity: Math.random() * 0.6 + 0.2,
                                    animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
                                    animationDelay: `${Math.random() * 3}s`,
                                }}
                            />
                        ))}
                    </div>

                    {/* Floor grid */}
                    <div
                        className="absolute bottom-0 left-0 right-0"
                        style={{
                            height: '55%',
                            background: 'linear-gradient(180deg, transparent, rgba(99,102,241,0.08) 20%, rgba(99,102,241,0.15))',
                            borderTop: '1px solid rgba(99,102,241,0.2)',
                        }}
                    >
                        {/* Grid lines */}
                        {[...Array(8)].map((_, i) => (
                            <div
                                key={`grid-h-${i}`}
                                className="absolute left-0 right-0"
                                style={{
                                    top: `${(i + 1) * 12}%`,
                                    height: '1px',
                                    background: 'rgba(99,102,241,0.08)',
                                }}
                            />
                        ))}
                        {[...Array(12)].map((_, i) => (
                            <div
                                key={`grid-v-${i}`}
                                className="absolute top-0 bottom-0"
                                style={{
                                    left: `${(i + 1) * 8}%`,
                                    width: '1px',
                                    background: 'rgba(99,102,241,0.08)',
                                }}
                            />
                        ))}
                    </div>

                    {/* Agents at desks */}
                    {AGENTS.map(agent => {
                        const isHovered = hoveredAgent?.id === agent.id;
                        const Icon = agent.icon;

                        return (
                            <div
                                key={agent.id}
                                className="absolute cursor-pointer"
                                style={{
                                    left: `${agent.deskPos.x}%`,
                                    top: `${agent.deskPos.y}%`,
                                    zIndex: isHovered ? 50 : 10,
                                }}
                                onMouseEnter={() => setHoveredAgent(agent)}
                                onMouseLeave={() => setHoveredAgent(null)}
                            >
                                {/* Speech bubble on hover */}
                                {isHovered && (
                                    <div
                                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-56 animate-fadeIn"
                                        style={{ animation: 'fadeSlideUp 0.25s ease-out' }}
                                    >
                                        <div className="bg-white rounded-2xl p-3.5 shadow-2xl border border-gray-100 relative">
                                            <p className="text-[11px] font-bold text-gray-800 leading-relaxed">
                                                {agent.greeting}
                                            </p>
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{agent.role}</span>
                                                <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    {agent.availability}
                                                </span>
                                            </div>
                                            {/* Bubble arrow */}
                                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-b border-r border-gray-100 rotate-45" />
                                        </div>
                                    </div>
                                )}

                                {/* Desk */}
                                <div className="relative">
                                    {/* Desk surface */}
                                    <div
                                        className="absolute top-10 left-1/2 -translate-x-1/2 transition-all duration-300"
                                        style={{
                                            width: '56px',
                                            height: '20px',
                                            borderRadius: '4px',
                                            background: isHovered
                                                ? `linear-gradient(135deg, ${agent.avatarColor}40, ${agent.avatarColor}20)`
                                                : 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05))',
                                            border: `1px solid ${isHovered ? agent.avatarColor + '60' : 'rgba(255,255,255,0.1)'}`,
                                            boxShadow: isHovered ? `0 4px 20px ${agent.avatarColor}30` : 'none',
                                        }}
                                    >
                                        {/* Screen glow on desk */}
                                        <div
                                            className="absolute -top-4 left-1/2 -translate-x-1/2 w-6 h-4 rounded-sm"
                                            style={{
                                                background: isHovered
                                                    ? `linear-gradient(180deg, ${agent.avatarColor}90, ${agent.avatarColor}30)`
                                                    : 'linear-gradient(180deg, rgba(99,102,241,0.4), rgba(99,102,241,0.1))',
                                                boxShadow: isHovered
                                                    ? `0 0 15px ${agent.avatarColor}50`
                                                    : '0 0 8px rgba(99,102,241,0.2)',
                                            }}
                                        />
                                    </div>

                                    {/* Agent avatar */}
                                    <div
                                        className={`
                                            relative w-10 h-10 rounded-full flex items-center justify-center
                                            transition-all duration-300 ease-out mx-auto
                                            ${isHovered ? 'scale-[1.35] -translate-y-3' : 'scale-100'}
                                        `}
                                        style={{
                                            background: `linear-gradient(135deg, ${agent.avatarColor}, ${agent.avatarColor}cc)`,
                                            boxShadow: isHovered
                                                ? `0 8px 30px ${agent.avatarColor}60, 0 0 40px ${agent.avatarColor}25`
                                                : `0 2px 8px ${agent.avatarColor}30`,
                                            border: `2px solid ${isHovered ? 'white' : 'rgba(255,255,255,0.3)'}`,
                                        }}
                                    >
                                        <Icon className="w-4 h-4 text-white drop-shadow-sm" />

                                        {/* Typing indicator when hovered */}
                                        {isHovered && (
                                            <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow-lg flex items-center gap-0.5">
                                                <div className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        )}

                                        {/* Online indicator */}
                                        {!isHovered && (
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#2d2b55]" />
                                        )}
                                    </div>

                                    {/* Name tag */}
                                    <p className={`
                                        text-center mt-6 text-[10px] font-bold transition-all duration-300
                                        ${isHovered ? 'text-white' : 'text-white/50'}
                                    `}>
                                        {agent.name}
                                    </p>
                                </div>
                            </div>
                        );
                    })}

                    {/* Decorative elements */}
                    {/* Plant 1 */}
                    <div className="absolute left-[2%] bottom-[8%] text-2xl opacity-60">🌿</div>
                    {/* Plant 2 */}
                    <div className="absolute right-[3%] bottom-[35%] text-xl opacity-50">🪴</div>
                    {/* Coffee */}
                    <div className="absolute left-[40%] bottom-[6%] text-sm opacity-40">☕</div>
                    {/* Clock */}
                    <div className="absolute right-[10%] top-[8%] text-lg opacity-40">🕐</div>

                    {/* Window with Earth */}
                    <div className="absolute top-[5%] left-1/2 -translate-x-1/2">
                        <div className="w-20 h-14 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden">
                            <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 8px rgba(96,165,250,0.3))' }}>🌍</span>
                        </div>
                    </div>
                </div>
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
                    <span className="text-[10px] font-bold text-gray-400">Fase 1 — Panel de monitoreo</span>
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes twinkle {
                    0%, 100% { opacity: 0.2; }
                    50% { opacity: 0.8; }
                }
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default MissionControl;
