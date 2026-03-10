import React, { useState } from 'react';
import {
    MessageCircle, Palette, Globe, FileText, FolderKanban,
    Users, Rocket, Sparkles, Calendar, Activity, Zap, Radio,
    Shield,
} from 'lucide-react';

interface Agent {
    id: string;
    name: string;
    role: string;
    description: string;
    icon: React.ElementType;
    status: 'active' | 'standby' | 'upcoming';
    availability: string;
    color: string;
    avatarColor: string; // for the avatar circle
}

const AGENTS: Agent[] = [
    {
        id: 'chatbot',
        name: 'Aria',
        role: 'ChatBot Público',
        description: 'Responde preguntas de visitantes 24/7 en tu sitio web',
        icon: MessageCircle,
        status: 'active',
        availability: '24/7',
        color: 'from-blue-500 to-cyan-400',
        avatarColor: '#3B82F6',
    },
    {
        id: 'content-suggest',
        name: 'Marco',
        role: 'Consejero RRSS',
        description: 'Genera ideas de publicaciones para redes sociales',
        icon: Calendar,
        status: 'active',
        availability: 'On-demand',
        color: 'from-violet-500 to-purple-400',
        avatarColor: '#8B5CF6',
    },
    {
        id: 'onboarding-welcome',
        name: 'Sol',
        role: 'Bienvenida',
        description: 'Guía al club en su primer paso de configuración',
        icon: Sparkles,
        status: 'active',
        availability: 'Wizard',
        color: 'from-amber-500 to-yellow-400',
        avatarColor: '#F59E0B',
    },
    {
        id: 'onboarding-visual',
        name: 'Luna',
        role: 'Identidad Visual',
        description: 'Asesora en logo y colores institucionales',
        icon: Palette,
        status: 'active',
        availability: 'Wizard',
        color: 'from-pink-500 to-rose-400',
        avatarColor: '#EC4899',
    },
    {
        id: 'onboarding-info',
        name: 'Leo',
        role: 'Información',
        description: 'Ayuda a redactar la descripción y contacto del club',
        icon: FileText,
        status: 'active',
        availability: 'Wizard',
        color: 'from-emerald-500 to-green-400',
        avatarColor: '#10B981',
    },
    {
        id: 'onboarding-social',
        name: 'Nube',
        role: 'Redes Sociales',
        description: 'Configura las URLs de redes sociales del club',
        icon: Globe,
        status: 'active',
        availability: 'Wizard',
        color: 'from-sky-500 to-blue-400',
        avatarColor: '#0EA5E9',
    },
    {
        id: 'onboarding-content',
        name: 'Iris',
        role: 'Contenido Web',
        description: 'Crea textos de hero, banner y sobre nosotros',
        icon: FileText,
        status: 'active',
        availability: 'Wizard',
        color: 'from-indigo-500 to-violet-400',
        avatarColor: '#6366F1',
    },
    {
        id: 'onboarding-projects',
        name: 'Kai',
        role: 'Proyectos',
        description: 'Documenta proyectos de servicio del club',
        icon: FolderKanban,
        status: 'active',
        availability: 'Wizard',
        color: 'from-orange-500 to-amber-400',
        avatarColor: '#F97316',
    },
    {
        id: 'onboarding-members',
        name: 'Vera',
        role: 'Directorio',
        description: 'Carga el directorio de socios del club',
        icon: Users,
        status: 'active',
        availability: 'Wizard',
        color: 'from-teal-500 to-emerald-400',
        avatarColor: '#14B8A6',
    },
    {
        id: 'onboarding-publish',
        name: 'Nova',
        role: 'Publicación',
        description: 'Revisa y lanza el sitio web del club',
        icon: Rocket,
        status: 'active',
        availability: 'Wizard',
        color: 'from-red-500 to-rose-400',
        avatarColor: '#EF4444',
    },
];

const MissionControl: React.FC = () => {
    const [hovered, setHovered] = useState<string | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

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
                            <p className="text-[11px] text-gray-400 font-medium">Tu equipo de agentes virtuales IA trabajando para ti</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">{activeCount} Activos</span>
                    </div>
                </div>
            </div>

            {/* Office Illustration */}
            <div className="relative mx-6 mb-6">
                <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-inner relative group">
                    <img
                        src="/images/mission-control-office.png"
                        alt="Oficina de agentes IA"
                        className="w-full h-auto max-h-[320px] object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent" />

                    {/* Floating status badge */}
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md rounded-xl px-4 py-2 border border-white/50 shadow-lg">
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-500" />
                            <span className="text-[11px] font-bold text-gray-700">Todos los agentes operativos</span>
                        </div>
                    </div>

                    {/* Bottom overlay text */}
                    <div className="absolute bottom-4 left-6 right-6">
                        <p className="text-sm font-black text-gray-800">
                            {selectedAgent
                                ? `${selectedAgent.name} — ${selectedAgent.role}`
                                : '10 agentes IA trabajando en tu oficina virtual'}
                        </p>
                        <p className="text-[11px] text-gray-500 font-medium">
                            {selectedAgent
                                ? selectedAgent.description
                                : 'Pasa el cursor sobre un agente para conocer más'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Agent Avatars Row */}
            <div className="px-10 pb-6">
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    {AGENTS.map(agent => {
                        const isHovered = hovered === agent.id;
                        const isSelected = selectedAgent?.id === agent.id;
                        const Icon = agent.icon;

                        return (
                            <div
                                key={agent.id}
                                className="flex flex-col items-center gap-1.5 cursor-pointer group"
                                onMouseEnter={() => { setHovered(agent.id); setSelectedAgent(agent); }}
                                onMouseLeave={() => { setHovered(null); setSelectedAgent(null); }}
                            >
                                {/* Avatar circle */}
                                <div className={`
                                    relative transition-all duration-300 ease-out
                                    ${isHovered ? 'scale-125 -translate-y-2' : 'scale-100'}
                                `}>
                                    {/* Pulse ring */}
                                    {agent.status === 'active' && (
                                        <div
                                            className={`absolute inset-0 rounded-full animate-ping opacity-20 transition-opacity duration-300 ${isHovered ? 'opacity-30' : 'opacity-0'}`}
                                            style={{ backgroundColor: agent.avatarColor }}
                                        />
                                    )}
                                    <div
                                        className={`
                                            w-12 h-12 rounded-full flex items-center justify-center
                                            shadow-md border-2 transition-all duration-300
                                            ${isHovered || isSelected
                                                ? 'border-white shadow-xl ring-2'
                                                : 'border-white/60 shadow-sm'
                                            }
                                        `}
                                        style={{
                                            background: `linear-gradient(135deg, ${agent.avatarColor}, ${agent.avatarColor}dd)`,
                                            ...(isHovered ? { ringColor: agent.avatarColor, boxShadow: `0 8px 25px ${agent.avatarColor}40` } : {}),
                                        }}
                                    >
                                        <Icon className="w-5 h-5 text-white drop-shadow-sm" />
                                    </div>

                                    {/* Online dot */}
                                    <div className={`
                                        absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white
                                        ${agent.status === 'active' ? 'bg-emerald-400' : agent.status === 'standby' ? 'bg-amber-400' : 'bg-gray-300'}
                                    `} />
                                </div>

                                {/* Agent name */}
                                <span className={`
                                    text-[10px] font-bold transition-all duration-300 text-center leading-tight
                                    ${isHovered ? 'text-gray-900' : 'text-gray-400'}
                                `}>
                                    {agent.name}
                                </span>

                                {/* Role — visible on hover */}
                                <span className={`
                                    text-[8px] font-bold uppercase tracking-wider text-center leading-tight transition-all duration-300
                                    ${isHovered ? 'text-gray-500 max-h-4 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}
                                `}>
                                    {agent.role}
                                </span>
                            </div>
                        );
                    })}
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
        </div>
    );
};

export default MissionControl;
