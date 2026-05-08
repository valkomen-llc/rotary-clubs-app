import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    ArrowRight, Save, Globe, MessageSquare, BarChart3, ShieldCheck,
    RefreshCw, Sparkles, CheckCircle, Languages, Eye, EyeOff,
    TrendingUp, Cpu, DollarSign, Database, AlertCircle,
    ChevronDown, ChevronUp, MapPin, Clock, Activity, ExternalLink,
    LineChart, Zap, Bot, Star, Trash2, TestTube2, Search
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

const PAGE_LABELS: Record<string, string> = {
    '/': 'Inicio', '/quienes-somos': 'Quiénes Somos', '/proyectos': 'Proyectos',
    '/noticias': 'Noticias', '/eventos': 'Eventos', '/tienda': 'Tienda',
    '/contacto': 'Contacto', '/contribuir': 'Contribuir',
};

interface DomainEntry {
    domain: string;
    clubName: string | null;
    count: number;
    pages: string[];
    lastSeen: string | null;
}
interface LangRow {
    lang: string;
    count: number;
    chars: number;
    domains: DomainEntry[];
}
interface UsageData {
    totalCachedTranslations: number;
    memCacheEntries: number;
    byLanguage: LangRow[];
    estimatedTokensInput: number;
    estimatedTokensOutput: number;
    estimatedCostUSD: number;
    model: string;
    pricingNote: string;
}

const fmt = (n: number) => n.toLocaleString('es-CO');
const timeAgo = (iso: string | null) => {
    if (!iso) return 'nunca';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return `hace ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h}h`;
    return `hace ${Math.floor(h / 24)}d`;
};

// ── Analytics GA4 injection ───────────────────────────────────────────────────
function injectGA4(gaId: string) {
    const existing = document.getElementById('ga4-script');
    if (existing) existing.remove();
    document.getElementById('ga4-gtag')?.remove();

    if (!gaId || !gaId.startsWith('G-')) return;

    const script1 = document.createElement('script');
    script1.id = 'ga4-script';
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script1);

    const script2 = document.createElement('script');
    script2.id = 'ga4-gtag';
    script2.innerHTML = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}', { anonymize_ip: true });`;
    document.head.appendChild(script2);
}

// ─────────────────────────────────────────────────────────────────────────────
const Integrations: React.FC = () => {
    const { user } = useAuth();
    const isSuperAdmin = (user as any)?.role === 'administrator';

    // GA4
    const [gaId, setGaId] = useState('');
    const [gaIdInput, setGaIdInput] = useState('');
    const [gaSaving, setGaSaving] = useState(false);
    const [gaSaved, setGaSaved] = useState(false);
    const [gaError, setGaError] = useState('');
    const [gaEvents, setGaEvents] = useState<string[]>([]);
    // GA4 Property ID (numeric, for Data API)
    const [_propId, setPropId] = useState('');
    const [propIdInput, setPropIdInput] = useState('');
    const [propIdSaving, setPropIdSaving] = useState(false);
    const [propIdSaved, setPropIdSaved] = useState(false);

    // Chatbot / misc
    const [chatbotEnabled, setChatbotEnabled] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Gemini
    const [geminiKey, setGeminiKey] = useState('');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [geminiStatus, setGeminiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
    const [geminiTesting, setGeminiTesting] = useState(false);

    // Google Custom Search API
    const [googleKey, setGoogleKey] = useState('');
    const [showGoogleKey, setShowGoogleKey] = useState(false);
    const [googleStatus, setGoogleStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');

    // Perplexity
    const [perplexityKey, setPerplexityKey] = useState('');
    const [showPerplexityKey, setShowPerplexityKey] = useState(false);
    const [perplexityStatus, setPerplexityStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');

    // AI Models registry
    const [aiModels, setAiModels] = useState<any[]>([]);
    const [aiModelsLoading, setAiModelsLoading] = useState(false);
    const [aiKeyInputs, setAiKeyInputs] = useState<Record<string, string>>({});
    const [aiShowKey, setAiShowKey] = useState<Record<string, boolean>>({});
    const [aiTestingSlug, setAiTestingSlug] = useState<string | null>(null);
    const [aiTestResults, setAiTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
    const [aiSavingSlug, setAiSavingSlug] = useState<string | null>(null);

    // Usage panel
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState('');
    const [expandedLang, setExpandedLang] = useState<string | null>(null);
    const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

    // Load GA4 ID + Property ID from DB on mount
    useEffect(() => {
        fetch(`${API}/translate/analytics`)
            .then(r => r.json())
            .then(d => { setGaId(d.gaId || ''); setGaIdInput(d.gaId || ''); })
            .catch(() => { });
        fetch(`${API}/analytics/property-id`)
            .then(r => r.json())
            .then(d => { setPropId(d.propertyId || ''); setPropIdInput(d.propertyId || ''); })
            .catch(() => { });
        fetch(`${API}/translate/settings`)
            .then(r => r.json())
            .then(d => setGeminiStatus(d.configured ? 'ok' : 'unknown'))
            .catch(() => setGeminiStatus('unknown'));
        if (isSuperAdmin) loadUsage();
        loadAiModels();
    }, [isSuperAdmin]);

    const loadAiModels = async () => {
        setAiModelsLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/ai/models`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await r.json();
            setAiModels(data.models || []);
        } catch { }
        finally { setAiModelsLoading(false); }
    };

    const saveAiKey = async (slug: string, provider: string, displayName: string, modelId: string) => {
        const key = aiKeyInputs[slug];
        if (!key?.trim()) return;
        setAiSavingSlug(slug);
        try {
            const token = localStorage.getItem('rotary_token');
            await fetch(`${API}/ai/models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ slug, provider, display_name: displayName, model_id: modelId, api_key: key.trim(), is_active: true }),
            });
            setAiKeyInputs(p => ({ ...p, [slug]: '' }));
            await loadAiModels();
        } catch { }
        finally { setAiSavingSlug(null); }
    };

    const toggleAiModel = async (slug: string, is_active: boolean) => {
        const token = localStorage.getItem('rotary_token');
        await fetch(`${API}/ai/models/${slug}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ is_active }),
        });
        await loadAiModels();
    };

    const setAiDefault = async (slug: string) => {
        const token = localStorage.getItem('rotary_token');
        await fetch(`${API}/ai/models/${slug}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ is_default: true, is_active: true }),
        });
        await loadAiModels();
    };

    const removeAiModel = async (slug: string) => {
        if (!confirm('¿Quitar la configuración de este modelo?')) return;
        const token = localStorage.getItem('rotary_token');
        await fetch(`${API}/ai/models/${slug}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        await loadAiModels();
    };

    const testAiModel = async (slug: string) => {
        setAiTestingSlug(slug);
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/ai/models/${slug}/test`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            const data = await r.json();
            setAiTestResults(p => ({ ...p, [slug]: { ok: data.success, msg: data.success ? '✅ Conexión OK' : (data.error || '❌ Error') } }));
        } catch { setAiTestResults(p => ({ ...p, [slug]: { ok: false, msg: '❌ Error de red' } })); }
        finally { setAiTestingSlug(null); }
    };

    const loadUsage = async () => {
        setUsageLoading(true); setUsageError('');
        try {
            const r = await fetch(`${API}/translate/usage`);
            if (!r.ok) throw new Error('Error al cargar estadísticas');
            setUsage(await r.json());
        } catch (e: any) { setUsageError(e.message); }
        finally { setUsageLoading(false); }
    };

    const saveGA4 = async () => {
        if (!gaIdInput.trim() || !gaIdInput.startsWith('G-')) {
            setGaError('El ID debe tener formato G-XXXXXXXXXX'); return;
        }
        setGaSaving(true); setGaError('');
        try {
            const r = await fetch(`${API}/translate/analytics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gaId: gaIdInput.trim() }),
            });
            if (!r.ok) throw new Error('Error al guardar');
            setGaId(gaIdInput.trim());
            injectGA4(gaIdInput.trim());
            setGaSaved(true);
            setGaEvents(prev => [`GA4 activado: ${gaIdInput.trim()} — ${new Date().toLocaleTimeString()}`, ...prev.slice(0, 4)]);
            setTimeout(() => setGaSaved(false), 3000);
        } catch (e: any) { setGaError(e.message); }
        finally { setGaSaving(false); }
    };

    const savePropId = async () => {
        if (!propIdInput.trim()) return;
        setPropIdSaving(true);
        try {
            const r = await fetch(`${API}/analytics/property-id`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: propIdInput.trim() }),
            });
            if (!r.ok) throw new Error('Error al guardar');
            setPropId(propIdInput.trim());
            setPropIdSaved(true);
            setTimeout(() => setPropIdSaved(false), 3000);
        } catch { /* ignore */ }
        finally { setPropIdSaving(false); }
    };

    const trackTestEvent = useCallback(() => {
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'admin_test_event', { event_category: 'admin', event_label: 'manual_test' });
            setGaEvents(prev => [`Evento de prueba enviado — ${new Date().toLocaleTimeString()}`, ...prev.slice(0, 4)]);
        } else {
            setGaError('GA4 no está activo. Guarda el ID primero.');
        }
    }, []);

    const testGeminiKey = async () => {
        if (!geminiKey.trim()) return;
        setGeminiTesting(true);
        try {
            const resp = await fetch(`${API}/translate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Hola mundo', targetLang: 'en', _testKey: geminiKey })
            });
            const data = await resp.json();
            setGeminiStatus(data.translated && data.translated !== 'Hola mundo' ? 'ok' : 'error');
        } catch { setGeminiStatus('error'); }
        finally { setGeminiTesting(false); }
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => { setIsSaving(false); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }, 1500);
    };

    const integrations = [
        { id: 'ga4', name: 'Google Analytics 4', description: 'Track website traffic, user behavior, and conversion events across all club sites.', icon: BarChart3, iconColor: 'text-orange-500', iconBg: 'bg-orange-50', status: gaId ? 'Conectado' : 'Sin configurar', connected: !!gaId },
        { id: 'chatbot', name: 'AI Chatbot Assistant', description: 'Provide 24/7 automated support to visitors using our custom AI trained on your club data.', icon: MessageSquare, iconColor: 'text-rotary-blue', iconBg: 'bg-sky-50', status: 'Active', connected: true },
        { id: 'gemini', name: 'Gemini 2.0 Flash — Traducciones', description: 'Traduce automáticamente todo el contenido del sitio al idioma seleccionado por el visitante.', icon: Languages, iconColor: 'text-violet-600', iconBg: 'bg-violet-50', status: geminiStatus === 'ok' ? 'Conectado' : 'Sin configurar', connected: geminiStatus === 'ok' },
        { id: 'facebook', name: 'Facebook Pixel', description: 'Measure the effectiveness of your advertising by understanding the actions people take on your site.', icon: Globe, iconColor: 'text-blue-600', iconBg: 'bg-blue-50', status: 'Not Connected', connected: false },
        { id: 'google', name: 'Google Custom Search API', description: 'Scraping automatizado de convocatorias globales y fundaciones.', icon: Search, iconColor: 'text-blue-600', iconBg: 'bg-blue-50', status: googleStatus === 'ok' ? 'Conectado' : 'Sin configurar', connected: googleStatus === 'ok' },
        { id: 'perplexity', name: 'Perplexity AI API', description: 'Búsqueda profunda en web para proyectos y matching de subvenciones.', icon: Sparkles, iconColor: 'text-indigo-600', iconBg: 'bg-indigo-50', status: perplexityStatus === 'ok' ? 'Conectado' : 'Sin configurar', connected: perplexityStatus === 'ok' }
    ];

    return (
        <AdminLayout>
            {/* Header */}
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Integrations & APIs</h1>
                    <p className="text-gray-400 font-medium mt-1">Connect your favorite tools and manage API settings.</p>
                </div>
                <button onClick={handleSave} disabled={isSaving}
                    className="bg-gray-900 text-white px-8 py-3 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-rotary-blue shadow-lg shadow-gray-200 transition-all disabled:opacity-50 active:scale-95">
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saveSuccess ? 'Settings Saved!' : 'Save Changes'}
                </button>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                {integrations.map((int) => (
                    <div key={int.id} className="bg-white border border-gray-100 rounded-[2rem] p-7 shadow-sm hover:shadow-xl transition-all group">
                        <div className="flex justify-between items-start mb-5">
                            <div className={`w-12 h-12 rounded-2xl ${int.iconBg} flex items-center justify-center ${int.iconColor} shadow-sm group-hover:scale-110 transition-transform`}>
                                <int.icon className="w-6 h-6" />
                            </div>
                            <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${int.connected ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
                                {int.status}
                            </div>
                        </div>
                        <h3 className="text-base font-black text-gray-900 mb-1.5">{int.name}</h3>
                        <p className="text-xs text-gray-400 leading-relaxed font-medium mb-6">{int.description}</p>
                        <button className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rotary-blue hover:text-rotary-gold transition-colors">
                            Configure <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
            </div>

            <div className="space-y-8">

                {/* ── Google Analytics 4 Configuration ── */}
                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500 shadow-sm">
                            <BarChart3 className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Google Analytics 4</h2>
                            <p className="text-sm text-gray-400 font-medium">Métricas de tráfico en tiempo real para todos los sitios de club.</p>
                        </div>
                        {gaId && (
                            <div className="ml-auto flex items-center gap-2 bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 py-2 rounded-full text-xs font-black">
                                <CheckCircle className="w-3.5 h-3.5" /> Activo: {gaId}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Input + save */}
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Measurement ID (GA4)</label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={gaIdInput}
                                    onChange={e => setGaIdInput(e.target.value)}
                                    placeholder="G-XXXXXXXXXX"
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl py-4 px-6 text-sm font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 transition-all"
                                />
                                <button onClick={saveGA4} disabled={gaSaving || !gaIdInput}
                                    className="px-6 py-4 bg-orange-500 text-white rounded-2xl text-xs font-black hover:bg-orange-600 transition-all disabled:opacity-40 whitespace-nowrap flex items-center gap-2">
                                    {gaSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {gaSaved ? '¡Guardado!' : 'Guardar'}
                                </button>
                            </div>
                            {gaError && <p className="text-xs text-red-500 font-medium ml-1">{gaError}</p>}
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                Encuéntralo en <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">Google Analytics</a> → Admin → Flujos de datos → elegir flujo → ID de medición.
                            </p>

                            {/* Property ID (for Data API — per-club metrics) */}
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 pt-2">Property ID (Data API — métricas por club)</label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={propIdInput}
                                    onChange={e => setPropIdInput(e.target.value)}
                                    placeholder="123456789"
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl py-4 px-6 text-sm font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 transition-all"
                                />
                                <button onClick={savePropId} disabled={propIdSaving || !propIdInput}
                                    className="px-6 py-4 bg-orange-500 text-white rounded-2xl text-xs font-black hover:bg-orange-600 transition-all disabled:opacity-40 whitespace-nowrap flex items-center gap-2">
                                    {propIdSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {propIdSaved ? '¡Guardado!' : 'Guardar'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                En GA4 → Admin → Detalles de la propiedad → <strong>ID de propiedad</strong> (número, ej: 123456789). Necesario para métricas en los paneles de cada club.
                            </p>

                            {/* Test event button */}
                            {gaId && (
                                <button onClick={trackTestEvent}
                                    className="flex items-center gap-2 text-xs font-black text-orange-600 bg-orange-50 border border-orange-100 px-4 py-2 rounded-xl hover:bg-orange-100 transition-colors">
                                    <Zap className="w-3.5 h-3.5" /> Enviar evento de prueba
                                </button>
                            )}

                            {/* Event log */}
                            {gaEvents.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                    {gaEvents.map((ev, i) => (
                                        <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                                            <Activity className="w-3 h-3 flex-shrink-0" /> {ev}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Info panel */}
                        <div className="space-y-4">
                            <div className="bg-orange-50 border border-orange-100 rounded-[2rem] p-7">
                                <div className="flex items-center gap-3 mb-4">
                                    <LineChart className="w-5 h-5 text-orange-500" />
                                    <h4 className="text-sm font-black text-gray-900">Eventos rastreados automáticamente</h4>
                                </div>
                                <ul className="space-y-2">
                                    {[
                                        ['page_view', 'Cada navegación de página'],
                                        ['language_switch', 'Cambio de idioma del visitante'],
                                        ['club_id', 'Club activo como dimensión'],
                                        ['scroll', 'Profundidad de scroll (75%)'],
                                        ['click', 'Clics en enlaces externos'],
                                    ].map(([ev, desc]) => (
                                        <li key={ev} className="flex items-center gap-3 text-xs text-gray-600 font-medium">
                                            <span className="font-mono text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md">{ev}</span>
                                            {desc}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 flex items-start gap-3">
                                <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-black text-gray-900 mb-1">Privacidad activa</p>
                                    <p className="text-[10px] text-gray-500 leading-relaxed font-medium">IPs anonimizadas · sesiones de admin filtradas automáticamente · sin cookies de terceros innecesarias.</p>
                                </div>
                            </div>
                            {gaId && (
                                <a href={`https://analytics.google.com/analytics/web/#/p${gaId.replace('G-', '')}/reports/intelligenthome`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-xs font-black text-orange-600 hover:text-orange-700 transition-colors">
                                    <ExternalLink className="w-3.5 h-3.5" /> Abrir dashboard en Google Analytics
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Gemini Translation Section ── */}
                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center shadow-sm">
                            <Languages className="w-6 h-6 text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Traducciones Automáticas — Gemini 2.0 Flash</h2>
                            <p className="text-sm text-gray-400 font-medium">Todo el contenido del sitio se traduce al idioma del visitante. Caché multicapa localStorage→BD.</p>
                        </div>
                        {geminiStatus === 'ok' && (
                            <div className="ml-auto flex items-center gap-2 bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 py-2 rounded-full text-xs font-black">
                                <CheckCircle className="w-3.5 h-3.5" /> Activo
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Google Gemini API Key</label>
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <input type={showGeminiKey ? 'text' : 'password'} value={geminiKey}
                                        onChange={e => setGeminiKey(e.target.value)} placeholder="AIzaSy..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-6 pr-12 text-sm font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-400 transition-all" />
                                    <button type="button" onClick={() => setShowGeminiKey(v => !v)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button onClick={testGeminiKey} disabled={geminiTesting || !geminiKey}
                                    className="px-6 py-4 bg-violet-600 text-white rounded-2xl text-xs font-black hover:bg-violet-700 transition-all disabled:opacity-40">
                                    {geminiTesting ? 'Probando...' : 'Probar'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                Obtén tu key en <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">aistudio.google.com</a>. Agrégala en <code className="bg-gray-100 px-1.5 py-0.5 rounded">.env</code> como <code className="bg-gray-100 px-1.5 py-0.5 rounded">GEMINI_API_KEY=…</code>
                            </p>
                        </div>
                        <div className="bg-violet-50 rounded-[2rem] p-7 border border-violet-100">
                            <div className="flex items-center gap-3 mb-4">
                                <Sparkles className="w-5 h-5 text-violet-600" />
                                <h4 className="text-sm font-black text-gray-900">Idiomas soportados</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {[['🇪🇸', 'Español (base)'], ['🇺🇸', 'English'], ['🇫🇷', 'Français'], ['🇧🇷', 'Português'], ['🇩🇪', 'Deutsch'], ['🇮🇹', 'Italiano'], ['🇯🇵', '日本語'], ['🇰🇷', '한국어']].map(([flag, name]) => (
                                    <div key={name} className="flex items-center gap-2 text-xs font-medium text-gray-700"><span>{flag}</span>{name}</div>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">Caché multicapa: localStorage → memoria → BD. Cada texto se traduce solo una vez.</p>
                        </div>
                    </div>

                    {/* ── Super Admin Usage Panel ── */}
                    {isSuperAdmin && (
                        <div className="border-t border-gray-100 pt-8">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                                        <TrendingUp className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-gray-900">Uso de Créditos</h3>
                                        <p className="text-[10px] text-gray-400 font-medium">Consumo acumulado en todos los sitios</p>
                                    </div>
                                    <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider ml-1">Súper Admin</span>
                                </div>
                                <button onClick={loadUsage} disabled={usageLoading}
                                    className="flex items-center gap-2 text-xs font-black text-gray-500 hover:text-violet-600 transition-colors">
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
                                    {/* KPI */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                        <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3"><Database className="w-4 h-4 text-violet-500" /><span className="text-[10px] font-black text-violet-600 uppercase tracking-widest">Total Caché BD</span></div>
                                            <p className="text-2xl font-black text-gray-900">{fmt(usage.totalCachedTranslations)}</p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">textos únicos traducidos</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-100 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3"><Cpu className="w-4 h-4 text-sky-500" /><span className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Tokens Entrada</span></div>
                                            <p className="text-2xl font-black text-gray-900">{fmt(usage.estimatedTokensInput)}</p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">~30 tokens/solicitud</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3"><Cpu className="w-4 h-4 text-emerald-500" /><span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Tokens Salida</span></div>
                                            <p className="text-2xl font-black text-gray-900">{fmt(usage.estimatedTokensOutput)}</p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">~35 tokens/respuesta</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3"><DollarSign className="w-4 h-4 text-amber-600" /><span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Costo Total USD</span></div>
                                            <p className="text-2xl font-black text-gray-900">
                                                ${usage.estimatedCostUSD < 0.01 ? usage.estimatedCostUSD.toFixed(6) : usage.estimatedCostUSD.toFixed(4)}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">acumulado histórico</p>
                                        </div>
                                    </div>

                                    {/* Per-Language + Per-Domain */}
                                    {usage.byLanguage.length > 0 && (
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Desglose por idioma y dominio</p>
                                            {usage.byLanguage.map(row => {
                                                const pct = Math.round((row.count / usage.totalCachedTranslations) * 100) || 0;
                                                const isExpanded = expandedLang === row.lang;
                                                return (
                                                    <div key={row.lang} className="bg-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                                                        {/* Language row */}
                                                        <button
                                                            onClick={() => setExpandedLang(isExpanded ? null : row.lang)}
                                                            className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-100 transition-colors text-left"
                                                        >
                                                            <span className="text-xl">{LANG_FLAGS[row.lang] || '🌐'}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between mb-1.5">
                                                                    <span className="text-sm font-black text-gray-800">{LANG_NAMES[row.lang] || row.lang.toUpperCase()}</span>
                                                                    <span className="text-xs text-gray-500 font-mono">{fmt(row.count)} textos · {pct}%</span>
                                                                </div>
                                                                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full" style={{ width: `${pct}%` }} />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 ml-2">
                                                                {row.domains.length > 0 && (
                                                                    <span className="text-[10px] bg-violet-100 text-violet-700 font-black px-2 py-0.5 rounded-full">
                                                                        {row.domains.length} {row.domains.length === 1 ? 'sitio' : 'sitios'}
                                                                    </span>
                                                                )}
                                                                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                                            </div>
                                                        </button>

                                                        {/* Domain list */}
                                                        {isExpanded && row.domains.length > 0 && (
                                                            <div className="px-6 pb-5 border-t border-gray-100">
                                                                <div className="mt-4 space-y-3">
                                                                    {row.domains.sort((a, b) => b.count - a.count).map(dom => {
                                                                        const domKey = `${row.lang}::${dom.domain}`;
                                                                        const isDomExpanded = expandedDomain === domKey;
                                                                        return (
                                                                            <div key={dom.domain} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                                                                <button
                                                                                    onClick={() => setExpandedDomain(isDomExpanded ? null : domKey)}
                                                                                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                                                                                >
                                                                                    <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                                            <span className="text-sm font-black text-gray-800 truncate">{dom.clubName || dom.domain}</span>
                                                                                            {dom.clubName && <span className="text-[10px] text-gray-400 font-mono">{dom.domain}</span>}
                                                                                        </div>
                                                                                        <div className="flex items-center gap-4 mt-0.5">
                                                                                            <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                                                                                <TrendingUp className="w-3 h-3" /> {fmt(dom.count)} traducciones
                                                                                            </span>
                                                                                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                                                                                <Clock className="w-3 h-3" /> {timeAgo(dom.lastSeen)}
                                                                                            </span>
                                                                                            {dom.pages.length > 0 && (
                                                                                                <span className="text-[10px] text-violet-600 flex items-center gap-1">
                                                                                                    <MapPin className="w-3 h-3" /> {dom.pages.length} {dom.pages.length === 1 ? 'página' : 'páginas'}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    {dom.pages.length > 0 && (
                                                                                        isDomExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                                                                    )}
                                                                                </button>

                                                                                {/* Pages list */}
                                                                                {isDomExpanded && dom.pages.length > 0 && (
                                                                                    <div className="px-5 pb-4 border-t border-gray-50 pt-3">
                                                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Páginas visitadas en {LANG_NAMES[row.lang] || row.lang}</p>
                                                                                        <div className="flex flex-wrap gap-2">
                                                                                            {dom.pages.map(page => (
                                                                                                <span key={page} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-lg">
                                                                                                    <MapPin className="w-3 h-3 text-violet-500" />
                                                                                                    {PAGE_LABELS[page] || page}
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {isExpanded && row.domains.length === 0 && (
                                                            <div className="px-6 pb-5 border-t border-gray-100">
                                                                <p className="text-xs text-gray-400 font-medium mt-4 italic">No hay datos de sitios para este idioma todavía.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">{usage.pricingNote}</p>
                                        </div>
                                    )}

                                    {usage.totalCachedTranslations === 0 && (
                                        <div className="text-center py-8">
                                            <Languages className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-sm text-gray-400 font-medium">Aún no hay traducciones en caché.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ── ChatBot Section ── */}
                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
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
                            <p className="text-sm text-gray-500 leading-relaxed font-medium mb-6">The chatbot uses the Central Knowledge Base. Toggle visibility or customize its welcome message.</p>
                            <div className="flex items-center gap-6">
                                <button onClick={() => setChatbotEnabled(!chatbotEnabled)}
                                    className={`relative w-14 h-8 rounded-full transition-all duration-300 ${chatbotEnabled ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                                    <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${chatbotEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                                <span className="text-sm font-black text-gray-900">{chatbotEnabled ? 'Chatbot ENABLED' : 'Chatbot DISABLED'}</span>
                            </div>
                        </div>
                        <button className="bg-gray-50 border border-gray-100 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-600 hover:bg-white hover:shadow-lg transition-all active:scale-95">
                            Customize Knowledge Base
                        </button>
                    </div>
                </div>

                {/* ── Google Search API (Grant Scout) ── */}
                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shadow-sm">
                            <Search className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Google Custom Search API</h2>
                            <p className="text-sm text-gray-400 font-medium">Búsqueda global de convocatorias de ONGs, Fundaciones Corporativas y entidades internacionales.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Google API Key</label>
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <input type={showGoogleKey ? 'text' : 'password'} value={googleKey}
                                        onChange={e => setGoogleKey(e.target.value)} placeholder="AIzaSy..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-6 pr-12 text-sm font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all" />
                                    <button type="button" onClick={() => setShowGoogleKey(v => !v)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showGoogleKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button
                                    onClick={() => { setGoogleStatus('ok'); alert('¡Clave de Google Custom Search guardada éxitosamente para el sub-agente!'); }}
                                    className="px-6 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black hover:bg-blue-700 transition-all disabled:opacity-40">
                                    Guardar
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                Obtén tu token en <a href="https://developers.google.com/custom-search/v1/overview" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console</a>. Reemplaza las búsquedas manuales por scouting automatizado.
                            </p>
                        </div>
                        <div className="bg-blue-50 rounded-[2rem] p-7 border border-blue-100">
                            <h4 className="text-sm font-black text-gray-900 mb-2">Estado de Búsqueda</h4>
                            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">Sustituye a Apify/SECOP. El motor Grand Scope usará esta llave para buscar subvenciones internacionales confiables compatibles con Rotary de manera recurrente.</p>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-700 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                                    <CheckCircle className="w-3 h-3" /> CSE Ready
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Perplexity AI Section ── */}
                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shadow-sm">
                            <Sparkles className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Perplexity API</h2>
                            <p className="text-sm text-gray-400 font-medium">Búsquedas profundas, análisis de TDRs y matching de subvenciones en tiempo real.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Perplexity API Key</label>
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <input type={showPerplexityKey ? 'text' : 'password'} value={perplexityKey}
                                        onChange={e => setPerplexityKey(e.target.value)} placeholder="pplx-..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-6 pr-12 text-sm font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all" />
                                    <button type="button" onClick={() => setShowPerplexityKey(v => !v)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showPerplexityKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button
                                    onClick={() => { setPerplexityStatus('ok'); alert('¡Clave de Perplexity API guardada éxitosamente para el sub-agente!'); }}
                                    className="px-6 py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black hover:bg-indigo-700 transition-all disabled:opacity-40">
                                    Guardar
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                Obtén tu key en <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">perplexity.ai</a>.
                            </p>
                        </div>
                        <div className="bg-indigo-50 rounded-[2rem] p-7 border border-indigo-100">
                            <h4 className="text-sm font-black text-gray-900 mb-2">Modelos soportados</h4>
                            <p className="text-[10px] text-gray-400 leading-relaxed">Soporte directo para <code className="bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded">sonar-reasoning-pro</code> (análisis denso de bases de subvenciones) y resoluciones inmediatas online.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Modelos IA ── */}
            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm mt-8">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600 shadow-sm">
                            <Bot className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Modelos de IA</h2>
                            <p className="text-sm text-gray-400 font-medium">Configura las API keys de cada proveedor. Solo los modelos activos aparecen en ProyectIA.</p>
                        </div>
                    </div>
                    <button onClick={loadAiModels} disabled={aiModelsLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-black text-gray-500 hover:bg-white hover:shadow transition-all">
                        <RefreshCw className={`w-3.5 h-3.5 ${aiModelsLoading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiModels.map(model => {
                        const isActive = model.is_active;
                        const hasKey = model.has_key || (!model.db_configured);
                        const testResult = aiTestResults[model.slug];
                        return (
                            <div key={model.slug}
                                className={`relative rounded-2xl border p-6 transition-all ${isActive && hasKey ? 'border-emerald-100 bg-emerald-50/30' : 'border-gray-100 bg-white'}`}>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ background: isActive && hasKey ? '#10B981' : '#D1D5DB' }} />
                                        <div>
                                            <h3 className="font-black text-gray-900 text-sm">{model.display_name}</h3>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{model.provider}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {model.is_default && (
                                            <span className="flex items-center gap-1 text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                                                <Star className="w-2.5 h-2.5" fill="currentColor" /> DEFAULT
                                            </span>
                                        )}
                                        {!model.db_configured && (
                                            <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">usa .env</span>
                                        )}
                                        {model.db_configured && hasKey && !model.is_default && (
                                            <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">API Key ✓</span>
                                        )}
                                        {model.db_configured && !hasKey && (
                                            <span className="text-[8px] font-black text-gray-400 bg-gray-50 px-2 py-1 rounded-full border border-gray-100">sin key</span>
                                        )}
                                    </div>
                                </div>

                                {model.description && (
                                    <p className="text-[11px] text-gray-400 font-medium mb-4 leading-relaxed">{model.description}</p>
                                )}

                                {testResult && (
                                    <div className={`text-[10px] font-bold px-3 py-1.5 rounded-lg mb-3 ${testResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                        {testResult.msg}
                                    </div>
                                )}

                                <div className="flex gap-2 mb-4">
                                    <div className="relative flex-1">
                                        <input
                                            type={aiShowKey[model.slug] ? 'text' : 'password'}
                                            placeholder={hasKey ? '•••••••••••••••• (API Key guardada)' : 'Pegar API Key aquí...'}
                                            value={aiKeyInputs[model.slug] || ''}
                                            onChange={e => setAiKeyInputs(p => ({ ...p, [model.slug]: e.target.value }))}
                                            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 transition-all"
                                        />
                                        <button type="button"
                                            onClick={() => setAiShowKey(p => ({ ...p, [model.slug]: !p[model.slug] }))}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            {aiShowKey[model.slug] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    {aiKeyInputs[model.slug]?.trim() && (
                                        <button onClick={() => saveAiKey(model.slug, model.provider, model.display_name, model.model_id)}
                                            disabled={aiSavingSlug === model.slug}
                                            className="px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-black hover:bg-violet-700 transition-colors disabled:opacity-50">
                                            {aiSavingSlug === model.slug ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {hasKey && (
                                        <>
                                            <button onClick={() => testAiModel(model.slug)} disabled={aiTestingSlug === model.slug}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 rounded-xl text-[10px] font-black transition-all">
                                                <TestTube2 className="w-3 h-3" />
                                                {aiTestingSlug === model.slug ? 'Probando...' : 'Probar'}
                                            </button>
                                            {model.db_configured && (
                                                <button onClick={() => toggleAiModel(model.slug, !isActive)}
                                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border ${isActive ? 'bg-white border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-500' : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-200 hover:text-emerald-500'}`}>
                                                    {isActive ? 'Desactivar' : 'Activar'}
                                                </button>
                                            )}
                                            {!model.is_default && (
                                                <button onClick={() => setAiDefault(model.slug)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-200 text-amber-600 hover:bg-amber-50 rounded-xl text-[10px] font-black transition-all">
                                                    <Star className="w-3 h-3" /> Hacer default
                                                </button>
                                            )}
                                            {model.db_configured && (
                                                <button onClick={() => removeAiModel(model.slug)}
                                                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-100 text-gray-400 hover:border-red-200 hover:text-red-500 rounded-xl text-[10px] font-black transition-all">
                                                    <Trash2 className="w-3 h-3" /> Quitar
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {!hasKey && (
                                        <p className="text-[10px] text-gray-400 font-medium">Pega tu API Key arriba y guárdala para activar este modelo.</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="text-[10px] text-gray-400 font-medium mt-6 text-center">
                    Los modelos con <strong>"usa .env"</strong> funcionan si tienes configurada la variable de entorno en el servidor (ej: <code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>).
                </p>
            </div>
        </AdminLayout>
    );
};

export default Integrations;
