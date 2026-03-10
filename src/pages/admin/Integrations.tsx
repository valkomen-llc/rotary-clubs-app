import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    ArrowRight,
    Save,
    Globe,
    MessageSquare,
    BarChart3,
    ShieldCheck,
    RefreshCw,
    Sparkles,
    CheckCircle,
    Languages,
    Eye,
    EyeOff,
    TrendingUp,
    Cpu,
    DollarSign,
    Database,
    AlertCircle,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

const LANG_FLAGS: Record<string, string> = {
    en: '🇺🇸', fr: '🇫🇷', pt: '🇧🇷', de: '🇩🇪', it: '🇮🇹', ja: '🇯🇵', ko: '🇰🇷',
};
const LANG_NAMES: Record<string, string> = {
    en: 'English', fr: 'Français', pt: 'Português', de: 'Deutsch',
    it: 'Italiano', ja: '日本語', ko: '한국어',
};

interface UsageData {
    totalCachedTranslations: number;
    memCacheEntries: number;
    byLanguage: { lang: string; count: number; chars: number }[];
    estimatedTokensInput: number;
    estimatedTokensOutput: number;
    estimatedCostUSD: number;
    model: string;
    pricingNote: string;
}

const Integrations: React.FC = () => {
    const { user } = useAuth();
    const isSuperAdmin = (user as any)?.role === 'administrator';

    const [gaId, setGaId] = useState('G-XXXXXXXXXX');
    const [chatbotEnabled, setChatbotEnabled] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [geminiKey, setGeminiKey] = useState('');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [geminiStatus, setGeminiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
    const [geminiTesting, setGeminiTesting] = useState(false);

    // Usage panel state
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState('');
    const [showByLang, setShowByLang] = useState(false);

    useEffect(() => {
        fetch(`${API}/translate/settings`)
            .then(r => r.json())
            .then(d => setGeminiStatus(d.configured ? 'ok' : 'unknown'))
            .catch(() => setGeminiStatus('unknown'));

        if (isSuperAdmin) loadUsage();
    }, [isSuperAdmin]);

    const loadUsage = async () => {
        setUsageLoading(true);
        setUsageError('');
        try {
            const r = await fetch(`${API}/translate/usage`);
            if (!r.ok) throw new Error('Error al cargar estadísticas');
            setUsage(await r.json());
        } catch (e: any) {
            setUsageError(e.message);
        } finally {
            setUsageLoading(false);
        }
    };

    const testGeminiKey = async () => {
        if (!geminiKey.trim()) return;
        setGeminiTesting(true);
        try {
            const resp = await fetch(`${API}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Hola mundo', targetLang: 'en', _testKey: geminiKey })
            });
            const data = await resp.json();
            setGeminiStatus(data.translated && data.translated !== 'Hola mundo' ? 'ok' : 'error');
        } catch {
            setGeminiStatus('error');
        } finally {
            setGeminiTesting(false);
        }
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        }, 1500);
    };

    const integrations = [
        {
            id: 'ga4',
            name: 'Google Analytics 4',
            description: 'Track website traffic, user behavior, and conversion events across your club site.',
            icon: BarChart3,
            iconColor: 'text-orange-500',
            iconBg: 'bg-orange-50',
            status: 'Connected',
            connected: true
        },
        {
            id: 'chatbot',
            name: 'AI Chatbot Assistant',
            description: 'Provide 24/7 automated support to visitors using our custom AI trained on your club data.',
            icon: MessageSquare,
            iconColor: 'text-rotary-blue',
            iconBg: 'bg-sky-50',
            status: 'Active',
            connected: true
        },
        {
            id: 'gemini',
            name: 'Gemini 2.0 Flash — Traducciones',
            description: 'Traduce automáticamente todo el contenido del sitio al idioma seleccionado por el visitante.',
            icon: Languages,
            iconColor: 'text-violet-600',
            iconBg: 'bg-violet-50',
            status: geminiStatus === 'ok' ? 'Conectado' : 'Sin configurar',
            connected: geminiStatus === 'ok'
        },
        {
            id: 'facebook',
            name: 'Facebook Pixel',
            description: 'Measure the effectiveness of your advertising by understanding the actions people take on your site.',
            icon: Globe,
            iconColor: 'text-blue-600',
            iconBg: 'bg-blue-50',
            status: 'Not Connected',
            connected: false
        }
    ];

    // Format large numbers nicely
    const fmt = (n: number) => n.toLocaleString('es-CO');

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Integrations & APIs</h1>
                    <p className="text-gray-400 font-medium mt-1">Connect your favorite tools and manage API settings.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-gray-900 text-white px-8 py-3 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-rotary-blue shadow-lg shadow-gray-200 transition-all disabled:opacity-50 active:scale-95"
                >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saveSuccess ? 'Settings Saved!' : 'Save Changes'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                {integrations.map((int) => (
                    <div key={int.id} className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl transition-all group">
                        <div className="flex justify-between items-start mb-6">
                            <div className={`w-14 h-14 rounded-2xl ${int.iconBg} flex items-center justify-center ${int.iconColor} shadow-sm group-hover:scale-110 transition-transform`}>
                                <int.icon className="w-7 h-7" />
                            </div>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${int.connected ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
                                {int.status}
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">{int.name}</h3>
                        <p className="text-sm text-gray-400 leading-relaxed font-medium mb-8">
                            {int.description}
                        </p>
                        <button className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rotary-blue hover:text-rotary-gold transition-colors">
                            Configure integration <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            <div className="space-y-8">
                {/* Google Analytics Section */}
                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm">
                    <div className="flex items-center gap-4 mb-10">
                        <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500 shadow-sm">
                            <BarChart3 className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Google Analytics Configuration</h2>
                            <p className="text-sm text-gray-400 font-medium">Track traffic and behavior specifically for your club subdomain.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Measurement ID (GA4)</label>
                            <input
                                type="text"
                                value={gaId}
                                onChange={(e) => setGaId(e.target.value)}
                                placeholder="G-XXXXXXXXXX"
                                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-6 text-sm font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rotary-blue/5 focus:border-rotary-blue transition-all"
                            />
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                Find this in your Google Analytics Admin {'>'} Data Streams {'>'} Choose your stream {'>'} Measurement ID.
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-[2rem] p-8 border border-gray-100 flex flex-col justify-center">
                            <div className="flex items-center gap-4 mb-4">
                                <ShieldCheck className="w-6 h-6 text-emerald-500" />
                                <h4 className="text-sm font-black text-gray-900">Pixel Protection Active</h4>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed font-medium">
                                We automatically anonymize IP addresses and filter internal traffic from your club dashboard sessions to ensure data accuracy.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Gemini Translation Section */}
                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center shadow-sm">
                            <Languages className="w-6 h-6 text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Traducciones Automáticas — Gemini 2.0 Flash</h2>
                            <p className="text-sm text-gray-400 font-medium">Todo el contenido del sitio se traduce automáticamente al idioma del visitante.</p>
                        </div>
                        {geminiStatus === 'ok' && (
                            <div className="ml-auto flex items-center gap-2 bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 py-2 rounded-full text-xs font-black">
                                <CheckCircle className="w-3.5 h-3.5" /> Activo
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Google Gemini API Key</label>
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <input
                                        type={showGeminiKey ? 'text' : 'password'}
                                        value={geminiKey}
                                        onChange={e => setGeminiKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-6 pr-12 text-sm font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-400 transition-all"
                                    />
                                    <button type="button" onClick={() => setShowGeminiKey(v => !v)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button
                                    onClick={testGeminiKey}
                                    disabled={geminiTesting || !geminiKey}
                                    className="px-6 py-4 bg-violet-600 text-white rounded-2xl text-xs font-black hover:bg-violet-700 transition-all disabled:opacity-40 whitespace-nowrap"
                                >
                                    {geminiTesting ? 'Probando...' : 'Probar'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                Obtén tu API Key en <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">aistudio.google.com</a> → API Key → Create.
                            </p>
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                Agrégala en el archivo <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env</code> del servidor como <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">GEMINI_API_KEY=tu_clave</code>
                            </p>
                        </div>

                        <div className="bg-violet-50 rounded-[2rem] p-8 border border-violet-100">
                            <div className="flex items-center gap-3 mb-4">
                                <Sparkles className="w-5 h-5 text-violet-600" />
                                <h4 className="text-sm font-black text-gray-900">Idiomas soportados</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {[['🇪🇸', 'Español (base)'], ['🇺🇸', 'English'], ['🇫🇷', 'Français'], ['🇧🇷', 'Português'], ['🇩🇪', 'Deutsch'], ['🇮🇹', 'Italiano'], ['🇯🇵', '日本語'], ['🇰🇷', '한국어']].map(([flag, name]) => (
                                    <div key={name} className="flex items-center gap-2 text-xs font-medium text-gray-700">
                                        <span>{flag}</span> {name}
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
                                Las traducciones se cachean automáticamente — cada texto solo se traduce una vez y se guarda en la base de datos.
                            </p>
                        </div>
                    </div>

                    {/* ── Super Admin Usage Panel ── */}
                    {isSuperAdmin && (
                        <div className="mt-8 pt-8 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                                        <TrendingUp className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-gray-900">Uso de Créditos — Solo Súper Admin</h3>
                                        <p className="text-[10px] text-gray-400 font-medium">Consumo acumulado de traducciones en todos los sitios</p>
                                    </div>
                                    <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full uppercase tracking-wider ml-2">
                                        Súper Admin
                                    </span>
                                </div>
                                <button
                                    onClick={loadUsage}
                                    disabled={usageLoading}
                                    className="flex items-center gap-2 text-xs font-black text-gray-500 hover:text-violet-600 transition-colors"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${usageLoading ? 'animate-spin' : ''}`} />
                                    {usageLoading ? 'Cargando...' : 'Actualizar'}
                                </button>
                            </div>

                            {usageError && (
                                <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4 mb-6">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                    <p className="text-xs text-red-700 font-medium">{usageError}</p>
                                </div>
                            )}

                            {usage && (
                                <>
                                    {/* KPI Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                        {/* Total translations */}
                                        <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Database className="w-4 h-4 text-violet-500" />
                                                <span className="text-[10px] font-black text-violet-600 uppercase tracking-widest">Total en Caché</span>
                                            </div>
                                            <p className="text-2xl font-black text-gray-900">{fmt(usage.totalCachedTranslations)}</p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">textos traducidos guardados en BD</p>
                                        </div>

                                        {/* Tokens input */}
                                        <div className="bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-100 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Cpu className="w-4 h-4 text-sky-500" />
                                                <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Tokens Entrada</span>
                                            </div>
                                            <p className="text-2xl font-black text-gray-900">{fmt(usage.estimatedTokensInput)}</p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">~30 tokens por solicitud</p>
                                        </div>

                                        {/* Tokens output */}
                                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Cpu className="w-4 h-4 text-emerald-500" />
                                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Tokens Salida</span>
                                            </div>
                                            <p className="text-2xl font-black text-gray-900">{fmt(usage.estimatedTokensOutput)}</p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">~35 tokens por respuesta</p>
                                        </div>

                                        {/* Cost */}
                                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <DollarSign className="w-4 h-4 text-amber-600" />
                                                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Costo Estimado</span>
                                            </div>
                                            <p className="text-2xl font-black text-gray-900">
                                                ${usage.estimatedCostUSD < 0.01
                                                    ? usage.estimatedCostUSD.toFixed(6)
                                                    : usage.estimatedCostUSD.toFixed(4)}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">USD acumulado total</p>
                                        </div>
                                    </div>

                                    {/* Per-language breakdown */}
                                    {usage.byLanguage.length > 0 && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                                            <button
                                                onClick={() => setShowByLang(v => !v)}
                                                className="w-full flex items-center justify-between px-6 py-4 text-sm font-black text-gray-700 hover:bg-gray-100 transition-colors"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <Globe className="w-4 h-4 text-gray-400" />
                                                    Desglose por idioma ({usage.byLanguage.length} idioma{usage.byLanguage.length !== 1 ? 's' : ''})
                                                </span>
                                                {showByLang ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                            </button>

                                            {showByLang && (
                                                <div className="px-6 pb-5">
                                                    <div className="space-y-3">
                                                        {usage.byLanguage.map(row => {
                                                            const pct = Math.round((row.count / usage.totalCachedTranslations) * 100) || 0;
                                                            return (
                                                                <div key={row.lang}>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="text-xs font-bold text-gray-700 flex items-center gap-2">
                                                                            <span>{LANG_FLAGS[row.lang] || '🌐'}</span>
                                                                            {LANG_NAMES[row.lang] || row.lang.toUpperCase()}
                                                                        </span>
                                                                        <span className="text-xs text-gray-500 font-mono">
                                                                            {fmt(row.count)} textos · {pct}%
                                                                        </span>
                                                                    </div>
                                                                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full transition-all duration-500"
                                                                            style={{ width: `${pct}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
                                                        {usage.pricingNote}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Zero state */}
                                    {usage.totalCachedTranslations === 0 && (
                                        <div className="text-center py-8">
                                            <Languages className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-sm text-gray-400 font-medium">Aún no hay traducciones en caché. El contador se actualizará conforme los visitantes usen los idiomas.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ChatBot Section */}
                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm">
                    <div className="flex items-center gap-4 mb-10">
                        <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-rotary-blue shadow-sm">
                            <MessageSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">AI Chatbot Management</h2>
                            <p className="text-sm text-gray-400 font-medium">Configure how the assistant interacts with your members.</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-8 items-start justify-between">
                        <div className="max-w-xl">
                            <p className="text-sm text-gray-500 leading-relaxed font-medium mb-6">
                                The chatbot is currently using the **Central Knowledge Base**. You can toggle its visibility on your site or customize its welcome message.
                            </p>
                            <div className="flex items-center gap-6">
                                <button
                                    onClick={() => setChatbotEnabled(!chatbotEnabled)}
                                    className={`relative w-14 h-8 rounded-full transition-all duration-300 ${chatbotEnabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${chatbotEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                                <span className="text-sm font-black text-gray-900">
                                    {chatbotEnabled ? 'Chatbot is ENABLED' : 'Chatbot is DISABLED'}
                                </span>
                            </div>
                        </div>
                        <button className="bg-gray-50 border border-gray-100 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-600 hover:bg-white hover:shadow-lg transition-all active:scale-95">
                            Customize Knowledge Base
                        </button>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default Integrations;
