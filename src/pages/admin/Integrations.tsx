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
    EyeOff
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const Integrations: React.FC = () => {
    const { token } = useAuth();
    const [gaId, setGaId] = useState('G-XXXXXXXXXX');
    const [chatbotEnabled, setChatbotEnabled] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [geminiKey, setGeminiKey] = useState('');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [geminiStatus, setGeminiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
    const [geminiTesting, setGeminiTesting] = useState(false);

    useEffect(() => {
        // Check if Gemini is already configured
        fetch(`${import.meta.env.VITE_API_URL || '/api'}/translate/settings`)
            .then(r => r.json())
            .then(d => setGeminiStatus(d.configured ? 'ok' : 'unknown'))
            .catch(() => setGeminiStatus('unknown'));
    }, []);

    const testGeminiKey = async () => {
        if (!geminiKey.trim()) return;
        setGeminiTesting(true);
        try {
            const resp = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/translate`, {
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
            description: 'Traduce automáticamente todo el contenido del sitio (noticias, proyectos, secciones) al idioma seleccionado por el visitante.',
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
                            <p className="text-sm text-gray-400 font-medium">Todo el contenido del sitio se traduce automáticamente al idioma del visitante. Costo: ~$0.00014 USD por artículo.</p>
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
                                Obtén tu API Key en <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">aistudio.google.com</a> → API Key → Create. Es gratis con hasta 15 solicitudes/minuto.
                            </p>
                            <p className="text-[10px] text-gray-400 font-medium ml-1">
                                Una vez obtenida, agrégala en el archivo <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env</code> del servidor como <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">GEMINI_API_KEY=tu_clave</code>
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
