import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Loader2, Bot, ChevronDown, Star, AlertCircle, CheckCircle2, Upload, FileText, ImageIcon, Film, Building2 } from 'lucide-react';
import { useClub } from '../../contexts/ClubContext';

const API = import.meta.env.VITE_API_URL || '/api';

// ── Versión del asistente ─────────────────────────────────────────────────────
const ASSISTANT_VERSIONS = [
    { id: 'valkomen-v1',  label: 'Valkomen IA v1.0',    badge: '✦', color: '#7C3AED' },
    { id: 'rotary-v1',   label: 'Rotary IA v1.0',      badge: '★', color: '#1E40AF' },
    { id: 'proyectia-v2',label: 'ProyectIA v2.0 Beta',  badge: '⚡', color: '#0F766E' },
];
const DEFAULT_VERSION = ASSISTANT_VERSIONS[0];

interface AIModel {
    slug: string;
    provider: string;
    display_name: string;
    short_code: string;
    is_active: boolean;
    is_default: boolean;
    has_key: boolean;
    db_configured: boolean;
    description?: string;
    speed?: string;
}

interface ClubOption {
    id: string;
    name: string;
    city?: string;
    country?: string;
    status?: string;
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
    google: '#4285F4', openai: '#10A37F', anthropic: '#D97706',
    mistral: '#7C3AED', custom: '#6B7280',
};
const PROVIDER_LABELS: Record<string, string> = {
    google: 'Google', openai: 'OpenAI', anthropic: 'Anthropic',
    mistral: 'Mistral', custom: 'Custom',
};
const SPEED_LABELS: Record<string, string> = {
    fast: '⚡ Rápido', medium: '🔵 Estándar', slow: '🟡 Detallado',
};

const EXAMPLE_PROMPTS = [
    'Proyecto de agua potable para 5 veredas del Cauca, con filtros de purificación y capacitación a 300 familias',
    'Becas educativas para 20 jóvenes líderes de comunidades vulnerables en Bogotá',
    'Reforestación de cuencas hídricas con 10.000 árboles nativos en el Eje Cafetero',
    'Campaña de vacunación y salud preventiva para adultos mayores en zonas rurales',
    'Kits escolares y material didáctico para 50 escuelas públicas en zona rural',
];

// Catálogo estático — siempre visible en el selector
const KNOWN_MODELS: AIModel[] = [
    { slug: 'gemini-2.5-flash',      provider: 'google',    display_name: 'Gemini 2.5 Flash',      short_code: 'G2.5F',   is_active: false, is_default: true,  has_key: false, db_configured: false, description: 'El más avanzado y rápido de Google — modelo por defecto',  speed: 'fast'   },
    { slug: 'gemini-2.5-pro',        provider: 'google',    display_name: 'Gemini 2.5 Pro',        short_code: 'G2.5P',   is_active: false, is_default: false, has_key: false, db_configured: false, description: 'Máxima capacidad de razonamiento de Google',              speed: 'medium' },
    { slug: 'gemini-2.0-flash',      provider: 'google',    display_name: 'Gemini 2.0 Flash',      short_code: 'G2.0F',   is_active: false, is_default: false, has_key: false, db_configured: false, description: 'Modelo 2.0 de Google',                                    speed: 'fast'   },
    { slug: 'gemini-2.0-flash-lite', provider: 'google',    display_name: 'Gemini 2.0 Flash Lite', short_code: 'G2.0FL',  is_active: false, is_default: false, has_key: false, db_configured: false, description: 'Versión ligera y económica de Gemini 2.0',               speed: 'fast'   },
    { slug: 'gpt-4o',                provider: 'openai',    display_name: 'GPT-4o',                short_code: 'GPT4O',   is_active: false, is_default: false, has_key: false, db_configured: true,  description: 'Modelo multimodal líder de OpenAI',                      speed: 'medium' },
    { slug: 'gpt-4o-mini',           provider: 'openai',    display_name: 'GPT-4o Mini',           short_code: 'GPT4M',   is_active: false, is_default: false, has_key: false, db_configured: true,  description: 'Rápido y económico, ideal para drafts',                  speed: 'fast'   },
    { slug: 'claude-3-5-sonnet',     provider: 'anthropic', display_name: 'Claude 3.5 Sonnet',     short_code: 'CL3.5S',  is_active: false, is_default: false, has_key: false, db_configured: true,  description: 'Redacción excepcional y análisis profundo',               speed: 'medium' },
    { slug: 'claude-3-haiku',        provider: 'anthropic', display_name: 'Claude 3 Haiku',        short_code: 'CL3H',    is_active: false, is_default: false, has_key: false, db_configured: true,  description: 'El más veloz de Anthropic',                               speed: 'fast'   },
    { slug: 'mistral-large',         provider: 'mistral',   display_name: 'Mistral Large',         short_code: 'MST-L',   is_active: false, is_default: false, has_key: false, db_configured: true,  description: 'Potente modelo europeo open-weight',                     speed: 'medium' },
];

// Tipos de archivo permitidos
const ACCEPTED_TYPES = {
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    video: ['video/mp4', 'video/webm', 'video/ogg'],
    doc:   ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'text/csv'],
};
const ALL_ACCEPTED = [...ACCEPTED_TYPES.image, ...ACCEPTED_TYPES.video, ...ACCEPTED_TYPES.doc].join(',');

function fileIcon(type: string) {
    if (ACCEPTED_TYPES.image.includes(type)) return <ImageIcon className="w-3.5 h-3.5 text-blue-500" />;
    if (ACCEPTED_TYPES.video.includes(type)) return <Film className="w-3.5 h-3.5 text-purple-500" />;
    return <FileText className="w-3.5 h-3.5 text-orange-500" />;
}
function fileLabel(type: string) {
    if (ACCEPTED_TYPES.image.includes(type)) return 'Imagen';
    if (ACCEPTED_TYPES.video.includes(type)) return 'Video';
    return 'Documento';
}

const ProjectAIModal: React.FC<Props> = ({ onClose, onApply }) => {
    const { club }      = useClub();

    // Detectar rol directamente del JWT — no depende del ciclo async de useAuth
    const isSuperAdmin = (() => {
        try {
            const t = localStorage.getItem('rotary_token');
            if (!t) return false;
            const payload = JSON.parse(atob(t.split('.')[1]));
            return payload?.role === 'administrator';
        } catch { return false; }
    })();

    const [prompt, setPrompt]         = useState('');
    const [models, setModels]         = useState<AIModel[]>([]);
    const [selectedSlug, setSelectedSlug] = useState('');
    const [modelDropdown, setModelDropdown] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError]           = useState('');
    const [dots, setDots]             = useState('');

    // Subida de archivos de contexto
    const [attachments, setAttachments] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Selector de club (solo superadmin)
    const [clubs, setClubs]           = useState<ClubOption[]>([]);
    const [selectedClubId, setSelectedClubId] = useState<string>('global');
    const [clubSearchTerm, setClubSearchTerm] = useState('');

    // Versión del asistente
    const [selectedVersion, setSelectedVersion] = useState(DEFAULT_VERSION);
    const [versionDropdown, setVersionDropdown] = useState(false);

    const textareaRef  = useRef<HTMLTextAreaElement>(null);
    const dropdownRef  = useRef<HTMLDivElement>(null);
    const versionRef   = useRef<HTMLDivElement>(null);

    // Animación de puntos durante la generación
    useEffect(() => {
        if (!generating) return;
        const interval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
        return () => clearInterval(interval);
    }, [generating]);

    // Cerrar dropdowns al clic afuera
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setModelDropdown(false);
            if (versionRef.current && !versionRef.current.contains(e.target as Node)) setVersionDropdown(false);
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
                const live = (data.models || []) as AIModel[];
                const merged = KNOWN_MODELS.map(km => {
                    const liveModel = live.find(l => l.slug === km.slug);
                    return liveModel ? { ...km, ...liveModel } : km;
                });
                setModels(merged);
                const def = merged.find(m => m.is_default && (m.has_key || !m.db_configured))
                    || merged.find(m => m.has_key || !m.db_configured)
                    || merged[0];
                if (def) setSelectedSlug(def.slug);
            })
            .catch(() => { setModels(KNOWN_MODELS); setSelectedSlug('gemini-2.0-flash'); });
    }, []);

    // Cargar clubs (solo superadmin)
    useEffect(() => {
        if (!isSuperAdmin) return;
        const token = localStorage.getItem('rotary_token');
        fetch(`${API}/admin/clubs`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => setClubs(Array.isArray(data) ? data : data.clubs || []))
            .catch(() => {});
    }, [isSuperAdmin]);

    const selectedModel = models.find(m => m.slug === selectedSlug);

    // Filtro de clubs
    const filteredClubs = clubs.filter(c =>
        c.name.toLowerCase().includes(clubSearchTerm.toLowerCase()) ||
        (c.city || '').toLowerCase().includes(clubSearchTerm.toLowerCase())
    );
    const selectedClubLabel = selectedClubId === 'global'
        ? 'General (Todos los clubes)'
        : clubs.find(c => c.id === selectedClubId)?.name || 'Club seleccionado';

    const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const valid = files.filter(f => f.size < 10 * 1024 * 1024); // max 10 MB
        setAttachments(prev => [...prev, ...valid].slice(0, 15)); // max 15 archivos
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeAttachment = (idx: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    };

    const handleGenerate = async () => {
        if (!prompt.trim() || prompt.trim().length < 10) {
            setError('Escribe al menos 10 caracteres describiendo tu proyecto.');
            return;
        }
        setError(''); setGenerating(true);
        const token = localStorage.getItem('rotary_token');
        try {
            // Si hay adjuntos, usar FormData; si no, JSON
            let body: BodyInit;
            let headers: Record<string, string> = { Authorization: `Bearer ${token}` };

            if (attachments.length > 0) {
                const fd = new FormData();
                fd.append('prompt', prompt.trim());
                fd.append('modelSlug', selectedSlug);
                if (isSuperAdmin && selectedClubId !== 'global') fd.append('clubId', selectedClubId);
                attachments.forEach(f => fd.append('files', f));
                body = fd;
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify({
                    prompt: prompt.trim(),
                    modelSlug: selectedSlug,
                    ...(isSuperAdmin && selectedClubId !== 'global' ? { clubId: selectedClubId } : {}),
                });
            }

            const res = await fetch(`${API}/ai/projects/generate`, { method: 'POST', headers, body });

            // Leer como texto primero — Vercel puede devolver HTML en errores 502/504
            const text = await res.text();
            let data: any;
            try {
                data = JSON.parse(text);
            } catch {
                // El servidor devolvió algo que no es JSON (timeout, crash, gateway error)
                if (res.status === 504 || res.status === 502 || text.toLowerCase().includes('timeout')) {
                    throw new Error('La generación tardó demasiado. Vercel tiene límite de 10s. Intenta con un prompt más corto o sin archivos adjuntos.');
                }
                throw new Error(`Error del servidor (${res.status}). Intenta de nuevo en unos segundos.`);
            }

            if (!res.ok) throw new Error(data.error || 'Error al generar el proyecto');
            onApply(data.project);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Error inesperado. Intenta de nuevo.');
        } finally {
            setGenerating(false);
        }
    };

    const useExample = (ex: string) => { setPrompt(ex); textareaRef.current?.focus(); };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">

                {/* Header — estilo "Somos gente de acción" */}
                <div className="relative overflow-hidden flex-shrink-0">
                    <div className="absolute inset-0"
                        style={{
                            backgroundColor: '#0c3c7c',
                            backgroundImage: "url('/geo-darkblue.png')",
                            backgroundPosition: '50% 0',
                            backgroundRepeat: 'repeat',
                            backgroundSize: '71px 85px',
                        }} />
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
                        {/* Selector de versión */}
                        <div className="flex items-center gap-3">
                            <div className="relative" ref={versionRef}>
                                <button
                                    onClick={() => setVersionDropdown(v => !v)}
                                    className="flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl px-3 py-1.5 transition-colors"
                                >
                                    <span className="text-white/90 text-[10px] font-black">{selectedVersion.label}</span>
                                    <ChevronDown className={`w-3 h-3 text-white/70 transition-transform ${versionDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {versionDropdown && (
                                    <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-30 min-w-[180px]">
                                        {ASSISTANT_VERSIONS.map(v => (
                                            <button key={v.id} onClick={() => { setSelectedVersion(v); setVersionDropdown(false); }}
                                                className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-violet-50 transition-colors text-left ${selectedVersion.id === v.id ? 'bg-violet-50' : ''}`}>
                                                <span className="text-sm font-black" style={{ color: v.color }}>{v.badge}</span>
                                                <span className="text-xs font-bold text-gray-700">{v.label}</span>
                                                {selectedVersion.id === v.id && <CheckCircle2 className="w-3 h-3 text-violet-500 ml-auto" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={onClose}
                                className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 p-8 space-y-5">

                    {/* Selector de club (solo superadmin) */}
                    {isSuperAdmin && (
                        <div>
                            <label className="block text-sm font-black text-gray-800 mb-2 flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-violet-500" /> Crear proyecto para
                            </label>
                            <div className="relative">
                                <details className="group">
                                    <summary className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-2xl cursor-pointer hover:border-violet-300 transition-colors list-none bg-white">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-violet-500" />
                                            <span className="font-bold text-gray-800 text-sm">{selectedClubLabel}</span>
                                        </div>
                                        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
                                    </summary>
                                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                                        <div className="p-2 border-b border-gray-100">
                                            <input
                                                type="text"
                                                placeholder="Buscar club..."
                                                value={clubSearchTerm}
                                                onChange={e => setClubSearchTerm(e.target.value)}
                                                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
                                            />
                                        </div>
                                        <button
                                            onClick={() => { setSelectedClubId('global'); setClubSearchTerm(''); }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 transition-colors text-left border-b border-gray-50 ${selectedClubId === 'global' ? 'bg-violet-50' : ''}`}>
                                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                                            <div>
                                                <p className="font-bold text-gray-800 text-sm">General (Todos los clubes)</p>
                                                <p className="text-[10px] text-gray-400">Visible desde el panel central</p>
                                            </div>
                                            {selectedClubId === 'global' && <CheckCircle2 className="w-4 h-4 text-violet-500 ml-auto" />}
                                        </button>
                                        {filteredClubs.map(c => (
                                            <button key={c.id}
                                                onClick={() => { setSelectedClubId(c.id); setClubSearchTerm(''); }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 transition-colors text-left border-b border-gray-50 last:border-0 ${selectedClubId === c.id ? 'bg-violet-50' : ''}`}>
                                                <div className={`w-2 h-2 rounded-full ${c.status === 'active' ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-gray-800 text-sm truncate">{c.name}</p>
                                                    {c.city && <p className="text-[10px] text-gray-400">{c.city}{c.country ? `, ${c.country}` : ''}</p>}
                                                </div>
                                                {selectedClubId === c.id && <CheckCircle2 className="w-4 h-4 text-violet-500" />}
                                            </button>
                                        ))}
                                        {filteredClubs.length === 0 && clubSearchTerm && (
                                            <p className="px-4 py-3 text-xs text-gray-400 text-center">Sin resultados para "{clubSearchTerm}"</p>
                                        )}
                                    </div>
                                </details>
                            </div>
                        </div>
                    )}

                    {/* Prompt */}
                    <div>
                        <label className="block text-sm font-black text-gray-800 mb-2">Describe tu idea de proyecto</label>
                        <textarea
                            ref={textareaRef}
                            value={prompt}
                            onChange={e => { setPrompt(e.target.value); setError(''); }}
                            placeholder="Ej: Quiero instalar sistemas de agua potable en 3 veredas del municipio de Popayán, beneficiando a 800 familias campesinas con filtros de purificación y capacitación en mantenimiento..."
                            rows={4}
                            maxLength={5000}
                            className="w-full px-4 py-3 border border-gray-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all text-sm text-gray-700 leading-relaxed"
                        />
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] text-gray-400 font-medium">Mínimo 10 caracteres · Más detalle = mejor resultado</p>
                            <span className={`text-[10px] font-bold ${prompt.length > 4500 ? 'text-red-500' : 'text-gray-300'}`}>{prompt.length}/5000</span>
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

                    {/* Adjuntos de contexto */}
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">📎 Contexto adicional (opcional)</p>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-all group"
                        >
                            <div className="w-8 h-8 bg-gray-100 group-hover:bg-violet-100 rounded-xl flex items-center justify-center transition-colors">
                                <Upload className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-gray-600">Sube imágenes, videos o documentos</p>
                                <p className="text-[10px] text-gray-400 font-medium">PNG, JPG, MP4, PDF, DOC, TXT · Máx. 15 archivos · 10 MB c/u</p>
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ALL_ACCEPTED}
                            className="hidden"
                            onChange={handleFileAdd}
                        />
                        {/* Lista de adjuntos */}
                        {attachments.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                                {attachments.map((f, i) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs">
                                        {fileIcon(f.type)}
                                        <span className="flex-1 font-medium text-gray-700 truncate">{f.name}</span>
                                        <span className="text-[10px] text-gray-400 font-bold">{fileLabel(f.type)}</span>
                                        <span className="text-[10px] text-gray-300">{(f.size / 1024).toFixed(0)} KB</span>
                                        <button onClick={() => removeAttachment(i)} className="text-gray-300 hover:text-red-400 transition-colors ml-1">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selector de motor IA */}
                    <div>
                        <label className="block text-sm font-black text-gray-800 mb-2">Motor de IA</label>
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setModelDropdown(v => !v)}
                                className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-2xl hover:border-violet-300 transition-colors bg-white"
                            >
                                {selectedModel ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ background: PROVIDER_COLORS[selectedModel.provider] || '#6B7280' }} />
                                        <span className="font-bold text-gray-800 text-sm">
                                            {selectedVersion.label}
                                            <span className="text-gray-400 font-medium"> · {selectedModel.short_code}</span>
                                        </span>
                                        {selectedModel.is_default && (
                                            <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                                <Star className="w-2.5 h-2.5" /> DEFAULT
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-gray-400 text-sm font-medium">Selecciona un motor...</span>
                                )}
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${modelDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {modelDropdown && (
                                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                                    {['google', 'openai', 'anthropic', 'mistral', 'custom'].map(provider => {
                                        const providerModels = models.filter(m => m.provider === provider);
                                        if (providerModels.length === 0) return null;
                                        return (
                                            <div key={provider}>
                                                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{PROVIDER_LABELS[provider]}</span>
                                                </div>
                                                {providerModels.map(model => {
                                                    const isAvailable = model.has_key || !model.db_configured;
                                                    const isComingSoon = !isAvailable;
                                                    return (
                                                        <button key={model.slug}
                                                            onClick={() => { if (isAvailable) { setSelectedSlug(model.slug); setModelDropdown(false); } }}
                                                            disabled={isComingSoon}
                                                            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-gray-50 last:border-0
                                                                ${selectedSlug === model.slug ? 'bg-violet-50' : ''}
                                                                ${isComingSoon ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : 'hover:bg-violet-50 cursor-pointer'}`}
                                                        >
                                                            <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                                                                style={{ background: isAvailable ? PROVIDER_COLORS[model.provider] : '#D1D5DB' }} />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className={`font-bold text-sm ${isComingSoon ? 'text-gray-400' : 'text-gray-800'}`}>{model.display_name}</span>
                                                                    {model.is_default && isAvailable && (
                                                                        <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100">★ DEFAULT</span>
                                                                    )}
                                                                    {!model.db_configured && (
                                                                        <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">activo</span>
                                                                    )}
                                                                    {isComingSoon && (
                                                                        <span className="text-[8px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full border border-gray-200">🔒 Próximamente</span>
                                                                    )}
                                                                </div>
                                                                {model.description && (
                                                                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{model.description}</p>
                                                                )}
                                                            </div>
                                                            {model.speed && isAvailable && (
                                                                <span className="text-[9px] text-gray-400 font-medium flex-shrink-0">{SPEED_LABELS[model.speed]}</span>
                                                            )}
                                                            {selectedSlug === model.slug && (
                                                                <CheckCircle2 className="w-4 h-4 text-violet-500 flex-shrink-0" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                    <div className="px-4 py-2.5 bg-gradient-to-r from-violet-50 to-indigo-50 border-t border-gray-100">
                                        <p className="text-[10px] text-violet-600 font-bold">
                                            🔑 Activa más modelos en <strong>Integraciones → Modelos IA</strong>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Club context badge */}
                    {!isSuperAdmin && club && (
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
                                <p className="font-black text-gray-800 text-sm">{selectedVersion.label} está trabajando{dots}</p>
                                <p className="text-xs text-gray-400 font-medium mt-1">Generando título, descripción, metas de recaudo e impacto</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer fijo */}
                {!generating && (
                    <div className="flex items-center justify-between px-8 py-5 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
                        <button onClick={onClose} className="px-6 py-3 text-gray-500 font-bold hover:text-gray-700 transition-colors text-sm">
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
    );
};

export default ProjectAIModal;
