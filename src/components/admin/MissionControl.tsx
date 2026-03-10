import React, { useState } from 'react';
import {
    MessageCircle, Palette, Globe, FileText, FolderKanban,
    Users, Rocket, Sparkles, Calendar, Activity, Zap, Radio,
    Shield,
} from 'lucide-react';



interface Agent {
    id: string;
    name: string;
    description: string;
    icon: React.ElementType;
    type: 'public' | 'admin' | 'onboarding' | 'system';
    status: 'active' | 'standby' | 'upcoming';
    availability: string; // e.g. '24/7', 'On-demand', 'Wizard'
    color: string; // gradient accent
}

const AGENTS: Agent[] = [
    {
        id: 'chatbot',
        name: 'ChatBot Público',
        description: 'Responde preguntas de visitantes en tu sitio web',
        icon: MessageCircle,
        type: 'public',
        status: 'active',
        availability: '24/7',
        color: 'from-blue-500 to-cyan-400',
    },
    {
        id: 'content-suggest',
        name: 'Consejero RRSS',
        description: 'Genera ideas de publicaciones para redes sociales',
        icon: Calendar,
        type: 'admin',
        status: 'active',
        availability: 'On-demand',
        color: 'from-violet-500 to-purple-400',
    },
    {
        id: 'onboarding-welcome',
        name: 'Bienvenida',
        description: 'Guía al club en su primer paso de configuración',
        icon: Sparkles,
        type: 'onboarding',
        status: 'active',
        availability: 'Wizard',
        color: 'from-amber-500 to-yellow-400',
    },
    {
        id: 'onboarding-visual',
        name: 'Identidad Visual',
        description: 'Asesora en logo y colores institucionales',
        icon: Palette,
        type: 'onboarding',
        status: 'active',
        availability: 'Wizard',
        color: 'from-pink-500 to-rose-400',
    },
    {
        id: 'onboarding-info',
        name: 'Información',
        description: 'Ayuda a redactar la descripción y contacto del club',
        icon: FileText,
        type: 'onboarding',
        status: 'active',
        availability: 'Wizard',
        color: 'from-emerald-500 to-green-400',
    },
    {
        id: 'onboarding-social',
        name: 'Redes Sociales',
        description: 'Configura las URLs de redes sociales del club',
        icon: Globe,
        type: 'onboarding',
        status: 'active',
        availability: 'Wizard',
        color: 'from-sky-500 to-blue-400',
    },
    {
        id: 'onboarding-content',
        name: 'Contenido Web',
        description: 'Crea textos de hero, banner y sobre nosotros',
        icon: FileText,
        type: 'onboarding',
        status: 'active',
        availability: 'Wizard',
        color: 'from-indigo-500 to-violet-400',
    },
    {
        id: 'onboarding-projects',
        name: 'Proyectos',
        description: 'Documenta proyectos de servicio del club',
        icon: FolderKanban,
        type: 'onboarding',
        status: 'active',
        availability: 'Wizard',
        color: 'from-orange-500 to-amber-400',
    },
    {
        id: 'onboarding-members',
        name: 'Directorio',
        description: 'Carga el directorio de socios del club',
        icon: Users,
        type: 'onboarding',
        status: 'active',
        availability: 'Wizard',
        color: 'from-teal-500 to-emerald-400',
    },
    {
        id: 'onboarding-publish',
        name: 'Publicación',
        description: 'Revisa y lanza el sitio web del club',
        icon: Rocket,
        type: 'onboarding',
        status: 'active',
        availability: 'Wizard',
        color: 'from-red-500 to-rose-400',
    },
];

const statusConfig = {
    active: { label: 'Activo', dot: 'bg-emerald-400', bg: 'bg-emerald-50 text-emerald-700' },
    standby: { label: 'En pausa', dot: 'bg-amber-400', bg: 'bg-amber-50 text-amber-700' },
    upcoming: { label: 'Próximamente', dot: 'bg-gray-300', bg: 'bg-gray-100 text-gray-500' },
};


const MissionControl: React.FC = () => {
    const [hovered, setHovered] = useState<string | null>(null);


    const activeCount = AGENTS.filter(a => a.status === 'active').length;
    const standbyCount = AGENTS.filter(a => a.status === 'standby').length;
    const upcomingCount = AGENTS.filter(a => a.status === 'upcoming').length;

    return (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-all mt-8">
            {/* Header */}
            <div className="px-10 pt-8 pb-6">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center shadow-lg">
                            <Radio className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Mission Control</h3>
                            <p className="text-[11px] text-gray-400 font-medium">Centro de control de agentes virtuales IA</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">{activeCount} Activos</span>
                        </div>
                        {standbyCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-full">
                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                                <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">{standbyCount} Pausa</span>
                            </div>
                        )}
                        {upcomingCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full">
                                <div className="w-2 h-2 rounded-full bg-gray-300" />
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{upcomingCount} Próximos</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Agent Grid */}
            <div className="px-10 pb-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {AGENTS.map(agent => {
                        const status = statusConfig[agent.status];
                        const isHovered = hovered === agent.id;
                        const Icon = agent.icon;

                        return (
                            <div
                                key={agent.id}
                                className="relative group cursor-default"
                                onMouseEnter={() => setHovered(agent.id)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <div className={`
                                    rounded-2xl border p-4 transition-all duration-300
                                    ${isHovered
                                        ? 'border-gray-200 shadow-lg scale-[1.03] bg-white'
                                        : 'border-gray-100 bg-gray-50/50 hover:bg-white'
                                    }
                                `}>
                                    {/* Agent Icon */}
                                    <div className={`
                                        w-10 h-10 rounded-xl flex items-center justify-center mb-3
                                        bg-gradient-to-br ${agent.color} shadow-md
                                        transition-transform duration-300
                                        ${isHovered ? 'scale-110' : ''}
                                    `}>
                                        <Icon className="w-5 h-5 text-white" />
                                    </div>

                                    {/* Agent Name */}
                                    <h4 className="text-xs font-black text-gray-900 mb-0.5 truncate">{agent.name}</h4>

                                    {/* Description — slides in on hover */}
                                    <p className={`text-[10px] text-gray-400 font-medium leading-tight transition-all duration-300 ${isHovered ? 'max-h-10 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                                        {agent.description}
                                    </p>

                                    {/* Status + Type */}
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${status.dot} ${agent.status === 'active' ? 'animate-pulse' : ''}`} />
                                            <span className="text-[9px] font-bold text-gray-500">{status.label}</span>
                                        </div>
                                        <span className="text-[8px] font-bold text-gray-300 uppercase tracking-wider">{agent.availability}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer Summary Bar */}
            <div className="bg-gray-50/80 border-t border-gray-100 px-10 py-5 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-500">
                            Powered by OpenAI GPT-4 · GPT-3.5
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span className="text-[10px] font-bold text-gray-500">
                            Todos los sistemas operativos
                        </span>
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
