import React, { useState } from 'react';
import {
    Cpu,
    Database,
    Play,
    Pause,
    Settings,
    Terminal,
    PlusCircle,
    ArrowUpRight,
    ShieldCheck,
    X,
    Globe,
    Calendar,
    Layers,
    Save,
    FileText,
    UploadCloud,
    Paperclip
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const IMPLEMENTATIONS = [
    { 
        id: 'grand-scope', 
        name: 'Grand Scope Engine', 
        status: 'active', 
        uptime: '4d 12h', 
        load: 45, 
        agents: 3, 
        version: 'v4.2',
        description: 'Gestión de subvenciones en tiempo real vía Perplexity/Google Custom Search.'
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
    const navigate = useNavigate();
    
    const [impls, setImpls] = useState(() => {
        try {
            const saved = localStorage.getItem('__impl_states');
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return IMPLEMENTATIONS;
    });

    const togglePause = (id: string) => {
        const updated = impls.map((i: any) => i.id === id ? {...i, status: i.status === 'active' ? 'idle' : 'active'} : i);
        setImpls(updated);
        localStorage.setItem('__impl_states', JSON.stringify(updated));
    };

    const [configModalOpen, setConfigModalOpen] = useState<string | null>(null);
    const [grantFreq, setGrantFreq] = useState('Semanal');
    const [grantLimit, setGrantLimit] = useState(10);
    const [grantSources, setGrantSources] = useState('Rotary International, USAID, Fundación Bill Gates');
    const [grantContext, setGrantContext] = useState('Busca oportunidades que encajen estrictamente con las Áreas de Interés de Rotary (Agua, Paz, Educación, Madre e Hijo, Economía, Medio Ambiente, Prevención de Enfermedades). Omite licitaciones de infraestructura pesada estatal. Traduce los TDRs a un lenguaje diplomático pero urgente.');
    const [attachedFiles, setAttachedFiles] = useState<string[]>(['Estatutos_Club_Rotary_2026.pdf']);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative">
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
                     <button
                         onClick={() => navigate('/admin/mission-control-vip')}
                         className="bg-white/10 hover:bg-white/20 border border-white/20 px-10 py-5 rounded-[24px] font-black uppercase text-xs tracking-widest transition-all backdrop-blur-md active:scale-95 flex items-center gap-3 cursor-pointer"
                     >
                         Enter System [⌘+K] <ArrowUpRight className="w-5 h-5 text-[#F7A81B]" />
                     </button>
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
                        {impls.map((impl: any) => (
                            <div key={impl.id} className="group bg-slate-50 border border-slate-100 rounded-[32px] p-6 hover:bg-white hover:shadow-2xl transition-all duration-500 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4">
                                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${impl.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                                        {impl.status === 'active' ? 'Active' : 'Paused'}
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
                                    <button onClick={() => setConfigModalOpen(impl.id)} className="flex-1 py-3 bg-white border border-slate-100 hover:border-[#013388] text-slate-700 hover:text-[#013388] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                                        <Settings className="w-3.5 h-3.5" /> Config
                                    </button>
                                    <button onClick={() => togglePause(impl.id)} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${impl.status === 'active' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600' : 'bg-[#013388] text-white shadow-lg shadow-[#013388]/20 hover:bg-blue-900'}`}>
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

            {/* CONFIG MODAL */}
            {configModalOpen === 'grand-scope' && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white max-w-2xl w-full rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 relative">
                            <button onClick={() => setConfigModalOpen(null)} className="absolute right-6 top-6 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-full transition-all">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-4 mb-2">
                                <div className="w-12 h-12 bg-[#013388] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-[#013388]/20">
                                    <Globe className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Grand Scope Config</h2>
                                    <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Parámetros de extracción y publicación</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-4">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Calendar className="w-4 h-4 text-[#F7A81B]" /> Frecuencia de Búsqueda y Distribución
                                </label>
                                <select 
                                    value={grantFreq} 
                                    onChange={(e) => setGrantFreq(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 rounded-xl p-4 focus:ring-4 focus:ring-[#013388]/10 focus:border-[#013388] outline-none"
                                >
                                    <option value="Diario">Todos los días (Resumen Diario)</option>
                                    <option value="Semanal">Semanal (Boletín todos los Lunes)</option>
                                    <option value="Quincenal">Quincenal (Cada 15 días)</option>
                                    <option value="Mensual">Mensual</option>
                                </select>
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Database className="w-4 h-4 text-[#F7A81B]" /> Cantidad Máxima por Extracción
                                </label>
                                <div className="flex gap-4">
                                    {[3, 5, 10, 20].map(val => (
                                        <button 
                                            key={val}
                                            onClick={() => setGrantLimit(val)}
                                            className={`flex-1 py-4 rounded-xl border font-black text-xs transition-all ${grantLimit === val ? 'bg-[#013388] text-white border-[#013388] shadow-md shadow-[#013388]/20' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {val} Subs
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-500">Limita la sobrecarga de información que se le enviará a los clubes en un solo reporte de WhatsApp/Email.</p>
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Layers className="w-4 h-4 text-[#F7A81B]" /> Dominios o Palabras Clave (Dorks)
                                </label>
                                <textarea 
                                    value={grantSources}
                                    onChange={(e) => setGrantSources(e.target.value)}
                                    rows={2}
                                    className="w-full bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 rounded-xl p-4 focus:ring-4 focus:ring-[#013388]/10 focus:border-[#013388] outline-none resize-none"
                                    placeholder="Rotary International, USAID, Fundación Bill Gates..."
                                />
                                <p className="text-[10px] text-slate-500">Usado por la API de Perplexity/Google para acotar los resultados del motor.</p>
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <FileText className="w-4 h-4 text-[#F7A81B]" /> System Prompt (Contexto Base para Sub-Agentes)
                                </label>
                                <textarea 
                                    value={grantContext}
                                    onChange={(e) => setGrantContext(e.target.value)}
                                    rows={4}
                                    className="w-full bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 rounded-xl p-4 focus:ring-4 focus:ring-[#013388]/10 focus:border-[#013388] outline-none resize-none"
                                    placeholder="Instrucciones para los agentes..."
                                />
                                <p className="text-[10px] text-slate-500">Rafael y Camila leerán esta directriz rectora antes de extraer y redactar las subvenciones.</p>
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Paperclip className="w-4 h-4 text-[#F7A81B]" /> Adjuntos de Referencia (Base de Conocimiento)
                                </label>
                                
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 bg-slate-50/50 flex flex-col items-center justify-center text-center hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer">
                                    <UploadCloud className="w-8 h-8 text-slate-400 mb-3" />
                                    <h4 className="text-sm font-black text-slate-800 mb-1">Arrastra tus estatutos o reglamentos aquí</h4>
                                    <p className="text-xs font-medium text-slate-500 max-w-sm mb-4">
                                        Sube PDFs de proyectos pasados, actas corporativas o lineamientos del distrito para que los sub-agentes tengan un contexto mucho más amplio al evaluar si aplicamos o no.
                                    </p>
                                    <button className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:border-[#013388] hover:text-[#013388] transition-all">
                                        Seleccionar Archivos
                                    </button>
                                </div>
                                
                                {attachedFiles.length > 0 && (
                                    <div className="mt-4 space-y-2">
                                        {attachedFiles.map((file, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl p-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                                                        <FileText className="w-4 h-4" />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-700">{file}</span>
                                                </div>
                                                <button onClick={() => setAttachedFiles(fs => fs.filter(f => f !== file))} className="text-slate-400 hover:text-red-500 p-2">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-8 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-4">
                            <button onClick={() => setConfigModalOpen(null)} className="px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-widest hover:text-slate-800">Cancelar</button>
                            <button onClick={() => { alert('Configuración guardada en la base de datos (Motor n8n actualizado).'); setConfigModalOpen(null); }} className="flex items-center gap-2 px-8 py-3 bg-[#013388] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-900 shadow-xl shadow-[#013388]/20 transition-all">
                                <Save className="w-4 h-4" /> Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardOverview;
