import React, { useState } from 'react';
import {
    Activity,
    Zap,
    Target,
    ListChecks,
    Cpu,
    RefreshCw,
    Database,
    Play,
    Pause,
    ArrowRight,
    Settings,
    MoreVertical,
    BarChart3,
    Terminal,
    Layers,
    PlusCircle,
    ArrowUpRight,
    ShieldCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';

const IMPLEMENTATIONS = [
    { 
        id: 'grand-scope', 
        name: 'Grand Scope Engine', 
        status: 'active', 
        uptime: '4d 12h', 
        load: 45, 
        agents: 3, 
        version: 'v4.2',
        description: 'Gestión de subvenciones en tiempo real vía Perplexity/Apify.'
    },
    { 
        id: 'crm-pulse', 
        name: 'Membership Pulse IQ', 
        status: 'idle', 
        uptime: '0h', 
        load: 0, 
        agents: 1, 
        version: 'v2.0',
        description: 'Análisis predictivo de retención de socios y captación de leads.'
    }
];

const DashboardOverview: React.FC = () => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* TOP METRICS */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {[
                    { label: 'Proyectos', val: '12', color: 'text-indigo-600' },
                    { label: 'Socios', val: '45', color: 'text-blue-600' },
                    { label: 'Eventos', val: '3', color: 'text-emerald-600' },
                    { label: 'Finanzas', val: '$1.2k', color: 'text-amber-600' },
                    { label: 'Ads', val: '5', color: 'text-rose-600' },
                    { label: 'GA4', val: 'Online', color: 'text-emerald-500' },
                    { label: 'Growth', val: '+12%', color: 'text-emerald-500' },
                    { label: 'Revenue', val: '$0', color: 'text-slate-400' },
                ].map((m, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{m.label}</p>
                        <p className={`text-sm font-black ${m.color}`}>{m.val}</p>
                    </div>
                ))}
            </div>

            {/* GATEWAY CONTROL PLANE (HERO) */}
            <div className="bg-[#013388] rounded-[48px] p-10 text-white relative overflow-hidden group shadow-2xl">
                 <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[150%] bg-white/5 rotate-12 blur-3xl pointer-events-none" />
                 <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                     <div className="space-y-4 max-w-xl">
                        <div className="flex items-center gap-3">
                            <Terminal className="text-[#F7A81B] w-6 h-6" />
                            <h2 className="text-2xl font-black italic tracking-tighter">Gateway Control Plane</h2>
                        </div>
                        <p className="text-white/70 font-medium leading-relaxed">
                            Accede al centro de comando inmersivo para orquestar a los agentes de IA,
                            monitorear operaciones en vivo y revisar logs de red neuronal.
                        </p>
                     </div>
                     <a href={`${window.location.origin}${window.location.pathname}#/admin/mission-control-vip`} target="_blank" rel="noopener noreferrer" className="bg-white/10 hover:bg-white/20 border border-white/20 px-10 py-5 rounded-[24px] font-black uppercase text-xs tracking-widest transition-all backdrop-blur-md active:scale-95 flex items-center gap-3">
                         Enter System [⌘+K] <ArrowUpRight className="w-5 h-5 text-[#F7A81B]" />
                     </a>
                 </div>
            </div>

            {/* AI IMPLEMENTATIONS CONSOLE (NEW) */}
            <div className="bg-white rounded-[48px] border border-slate-100 shadow-xl overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#013388] rounded-2xl flex items-center justify-center text-white shadow-lg">
                            <Cpu className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1.5">Arquitectura de Implementaciones (Alpha Core)</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Gestión de Motores e Instancias de IA</p>
                        </div>
                    </div>
                    <button className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                        <PlusCircle className="w-4 h-4" /> Importar de IA Base
                    </button>
                </div>
                
                <div className="p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {IMPLEMENTATIONS.map(impl => (
                            <div key={impl.id} className="group bg-slate-50 border border-slate-100 rounded-[32px] p-6 hover:bg-white hover:shadow-2xl transition-all duration-500 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4">
                                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${impl.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                                        {impl.status}
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-4 mb-6">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 ${impl.status === 'active' ? 'bg-[#013388] text-white border-white/20' : 'bg-slate-200 text-slate-400 border-slate-300'}`}>
                                        <Database className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-black text-slate-900 uppercase tracking-tight mb-1">{impl.name}</h4>
                                        <p className="text-[10px] text-slate-500 font-bold leading-tight line-clamp-2">{impl.description}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-6 bg-white/50 rounded-2xl p-4 border border-slate-100">
                                    <div className="text-center">
                                        <p className="text-[7px] text-slate-400 font-black uppercase tracking-widest mb-1">Uptime</p>
                                        <p className="text-[10px] font-black text-slate-800">{impl.uptime}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[7px] text-slate-400 font-black uppercase tracking-widest mb-1">Carga</p>
                                        <p className="text-[10px] font-black text-slate-800">{impl.load}%</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[7px] text-slate-400 font-black uppercase tracking-widest mb-1">Agentes</p>
                                        <p className="text-[10px] font-black text-[#013388]">{impl.agents}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button className="flex-1 py-3 bg-white border border-slate-100 hover:border-[#013388] text-slate-700 hover:text-[#013388] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                                        <Settings className="w-3.5 h-3.5" /> Config
                                    </button>
                                    <button className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${impl.status === 'active' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-[#013388] text-white shadow-lg shadow-[#013388]/20'}`}>
                                        {impl.status === 'active' ? <><Pause className="w-3.5 h-3.5" /> Pausar</> : <><Play className="w-3.5 h-3.5" /> Desplegar</>}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* QUICK ACTIONS */}
            <div className="flex items-center gap-4 py-8 border-t border-slate-100">
                <ShieldCheck className="w-6 h-6 text-[#013388]" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Todos los protocolos de seguridad de Club Platform están activos.</p>
            </div>
        </div>
    );
};

export default DashboardOverview;
