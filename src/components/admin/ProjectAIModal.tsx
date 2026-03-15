import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Loader2, Bot, ChevronDown, Star, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useClub } from '../../contexts/ClubContext';

const API = import.meta.env.VITE_API_URL || '/api';

interface AIModel {
    slug: string;
    provider: string;
    display_name: string;
    is_active: boolean;
    is_default: boolean;
    has_key: boolean;
    db_configured: boolean;
    description?: string;
    speed?: string;
    cost_tier?: number;
}

interface GeneratedProject {
    title: string;
    description: string;
    category: string;
    tags: string[];
    status: string;
    ubicacion: string;
    meta: number;
    beneficiarios: number;
    fechaEstimada: string;
    impacto: string;
    actualizaciones: string;
    seoDescription: string;
    callToAction: string;
    fundraisingFormats: any[];
    suggestedImageKeywords: string[];
}

interface Props {
    onClose: () => void;
    onApply: (project: GeneratedProject) => void;
}

const PROVIDER_COLORS: Record<string, string> = {
    google: '#4285F4',
    openai: '#10A37F',
    anthropic: '#D97706',
    mistral: '#7C3AED',
    custom: '#6B7280',
};

const PROVIDER_LABELS: Record<string, string> = {
    google: 'Google',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    mistral: 'Mistral',
    custom: 'Custom',
};

const SPEED_LABELS: Record<string, string> = {
    fast: '⚡ Rápido',
    medium: '🔵 Estándar',
    slow: '🟡 Detallado',
};

const EXAMPLE_PROMPTS = [
    'Proyecto de agua potable para 5 veredas del Cauca, con filtros de purificación y capacitación a 300 familias',
    'Becas educativas para 20 jóvenes líderes de comunidades vulnerables en Bogotá',
    'Reforestación de cuencas hídricas con 10.000 árboles nativos en el Eje Cafetero',
    'Campaña de vacunación y salud preventiva para adultos mayores en zonas rurales',
    'Kits escolares y material didáctico para 50 escuelas públicas en zona rural',
];

const ProjectAIModal: React.FC<Props> = ({ onClose, onApply }) => {
    const { club } = useClub();
    const [prompt, setPrompt] = useState('');
    const [models, setModels] = useState<AIModel[]>([]);
    const [selectedSlug, setSelectedSlug] = useState('');
    const [modelDropdown, setModelDropdown] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [dots, setDots] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Animación de puntos durante la generación
    useEffect(() => {
        if (!generating) return;
        const interval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
        return () => clearInterval(interval);
    }, [generating]);

    // Cerrar dropdown al clic afuera
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Cargar modelos disponibles
    useEffect(() => {
        const token = localStorage.getItem('rotary_token');
        fetch(`${API}/ai/models`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                const available = (data.models || []) as AIModel[];
                setModels(available);
                // Seleccionar el modelo default o el primero disponible
                const def = available.find(m => m.is_default) || available.find(m => m.has_key || !m.db_configured) || available[0];
                if (def) setSelectedSlug(def.slug);
            })
            .catch(() => { });
    }, []);

    const selectedModel = models.find(m => m.slug === selectedSlug);

    const handleGenerate = async () => {
        if (!prompt.trim() || prompt.trim().length < 10) {
            setError('Escribe al menos 10 caracteres describiendo tu proyecto.');
            return;
        }
        setError('');
        setGenerating(true);
        const token = localStorage.getItem('rotary_token');
        try {
            const res = await fetch(`${API}/ai/projects/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ prompt: prompt.trim(), modelSlug: selectedSlug }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al generar el proyecto');
            onApply(data.project);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Error inesperado. Intenta de nuevo.');
        } finally {
            setGenerating(false);
        }
    };

    const useExample = (ex: string) => {
        setPrompt(ex);
        textareaRef.current?.focus();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700" />
                    <div className="absolute inset-0 opacity-20"
                        style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                    <div className="relative px-8 py-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center border border-white/30">
                                <Bot className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white">ProyectIA</h2>
                                <p className="text-xs text-white/70 font-medium">Asistente de Proyectos de Crowdfunding</p>
                            </div>
                        </div>
                        <button onClick={onClose}
                            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    {/* Prompt */}
                    <div>
                        <label className="block text-sm font-black text-gray-800 mb-2">
                            Describe tu idea de proyecto
                        </label>
                        <textarea
                            ref={textareaRef}
                            value={prompt}
                            onChange={e => { setPrompt(e.target.value); setError(''); }}
                            placeholder="Ej: Quiero instalar sistemas de agua potable en 3 veredas del municipio de Popayán, beneficiando a 800 familias campesinas con filtros de purificación y capacitación en mantenimiento..."
                            rows={4}
                            className="w-full px-4 py-3 border border-gray-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all text-sm text-gray-700 leading-relaxed"
                        />
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] text-gray-400 font-medium">Mínimo 10 caracteres · Más detalle = mejor resultado</p>
                            <span className={`text-[10px] font-bold ${prompt.length > 800 ? 'text-red-500' : 'text-gray-300'}`}>
                                {prompt.length}/1000
                            </span>
                        </div>
                    </div>

                    {/* Ejemplos rápidos */}
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">💡 Ejemplos rápidos</p>
                        <div className="flex flex-wrap gap-2">
                            {EXAMPLE_PROMPTS.slice(0, 3).map((ex, i) => (
                                <button key={i} onClick={() => useExample(ex)}
                                    className="text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100 px-3 py-1.5 rounded-full transition-colors text-left">
                                    {ex.slice(0, 45)}...
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Selector de modelo */}
                    <div>
                        <label className="block text-sm font-black text-gray-800 mb-2">Modelo de IA</label>
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setModelDropdown(v => !v)}
                                className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-2xl hover:border-violet-300 transition-colors bg-white"
                            >
                                {selectedModel ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ background: PROVIDER_COLORS[selectedModel.provider] || '#6B7280' }} />
                                        <span className="font-bold text-gray-800 text-sm">{selectedModel.display_name}</span>
                                        {selectedModel.is_default && (
                                            <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                                <Star className="w-2.5 h-2.5" /> PREDETERMINADO
                                            </span>
                                        )}
                                        {selectedModel.speed && (
                                            <span className="text-[10px] text-gray-400 font-medium">{SPEED_LABELS[selectedModel.speed]}</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-gray-400 text-sm font-medium">Selecciona un modelo...</span>
                                )}
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${modelDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {modelDropdown && (
                                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                                    {/* Grupo por proveedor */}
                                    {['google', 'openai', 'anthropic', 'mistral', 'custom'].map(provider => {
                                        const providerModels = models.filter(m => m.provider === provider);
                                        if (providerModels.length === 0) return null;
                                        return (
                                            <div key={provider}>
                                                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                        {PROVIDER_LABELS[provider]}
                                                    </span>
                                                </div>
                                                {providerModels.map(model => (
                                                    <button
                                                        key={model.slug}
                                                        onClick={() => { setSelectedSlug(model.slug); setModelDropdown(false); }}
                                                        disabled={model.db_configured && !model.has_key && !model.is_active}
                                                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 transition-colors text-left border-b border-gray-50 last:border-0
                                                            ${selectedSlug === model.slug ? 'bg-violet-50' : ''}
                                                            ${(model.db_configured && !model.has_key && !model.is_active) ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                    >
                                                        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                                                            style={{ background: model.is_active || (!model.db_configured) ? PROVIDER_COLORS[model.provider] : '#D1D5DB' }} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-gray-800 text-sm">{model.display_name}</span>
                                                                {model.is_default && (
                                                                    <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100">★ DEFAULT</span>
                                                                )}
                                                                {!model.db_configured && (
                                                                    <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">
                                                                        usa .env
                                                                    </span>
                                                                )}
                                                                {model.db_configured && !model.has_key && (
                                                                    <span className="text-[8px] font-black text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full border border-gray-100">sin key</span>
                                                                )}
                                                            </div>
                                                            {model.description && (
                                                                <p className="text-[10px] text-gray-400 mt-0.5 truncate">{model.description}</p>
                                                            )}
                                                        </div>
                                                        {model.speed && (
                                                            <span className="text-[9px] text-gray-400 font-medium flex-shrink-0">
                                                                {SPEED_LABELS[model.speed]}
                                                            </span>
                                                        )}
                                                        {selectedSlug === model.slug && (
                                                            <CheckCircle2 className="w-4 h-4 text-violet-500 flex-shrink-0" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-medium">
                                            ⚙️ Configura más modelos en <strong>Integraciones → Modelos IA</strong>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Club context badge */}
                    {club && (
                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Contexto activo: <span className="text-gray-600 font-black">{club.name}</span> · {club.city}, {club.country}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl p-4 animate-in slide-in-from-top-2 duration-200">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700 font-medium">{error}</p>
                        </div>
                    )}

                    {/* Generating state */}
                    {generating && (
                        <div className="flex flex-col items-center justify-center py-6 gap-4 animate-in fade-in duration-300">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-200">
                                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                                </div>
                                <div className="absolute -inset-2 rounded-full border-2 border-violet-200 animate-ping opacity-30" />
                            </div>
                            <div className="text-center">
                                <p className="font-black text-gray-800 text-sm">
                                    ProyectIA está trabajando{dots}
                                </p>
                                <p className="text-xs text-gray-400 font-medium mt-1">
                                    Generando título, descripción, metas de recaudo e impacto
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    {!generating && (
                        <div className="flex items-center justify-between pt-2">
                            <button onClick={onClose}
                                className="px-6 py-3 text-gray-500 font-bold hover:text-gray-700 transition-colors text-sm">
                                Cancelar
                            </button>
                            <button
                                onClick={handleGenerate}
                                disabled={!prompt.trim() || prompt.trim().length < 10}
                                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl font-black text-sm hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-violet-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                            >
                                <Sparkles className="w-4 h-4" />
                                Generar Proyecto
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectAIModal;
