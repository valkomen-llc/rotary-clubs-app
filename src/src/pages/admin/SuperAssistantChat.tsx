import React, { useState, useEffect, useRef } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Bot, Send, Loader2, Sparkles, Shield, Info, Zap, 
    ChevronRight, MessageSquare, History, Trash2, Maximize2,
    BookOpen, Layers, Globe, Users, Briefcase, Award
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

interface Message {
    role: 'user' | 'assistant';
    text: string;
}

const SuperAssistantChat: React.FC = () => {
    const { user, token } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async (customText?: string) => {
        const textToSend = customText || input;
        if (!textToSend.trim() || loading) return;

        const userMsg: Message = { role: 'user', text: textToSend };
        setMessages(prev => [...prev, userMsg]);
        if (!customText) setInput('');
        setLoading(true);

        try {
            const res = await fetch(`${API}/ai/agent-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: textToSend,
                    agentId: 'Antigravity AI',
                    history: messages
                })
            });

            if (res.ok) {
                const data = await res.json();
                setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: 'Lo siento, hubo un error de conexión con el núcleo de Antigravity AI. Reintenta en un momento.' }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Error técnico al contactar con el núcleo de IA.' }]);
        } finally {
            setLoading(false);
        }
    };

    const suggestedQueries = [
        { icon: Layers, text: '¿Cómo funciona el aislamiento de datos (Multitenancy)?', color: 'text-blue-500' },
        { icon: BookOpen, text: '¿Qué módulos de gestión existen en la plataforma?', color: 'text-emerald-500' },
        { icon: Globe, text: 'Explícame el proceso de despliegue de dominios personalizados', color: 'text-purple-500' },
        { icon: Users, text: '¿Cómo se orquestan los agentes Diana, Martín y Kai?', color: 'text-amber-500' },
        { icon: Briefcase, text: '¿Qué representa esta plataforma para los Distritos Rotarios?', color: 'text-rose-500' },
        { icon: Award, text: '¿Cómo funciona el centro de descargas institucional?', color: 'text-indigo-500' }
    ];

    return (
        <AdminLayout>
            <div className="flex flex-col h-[calc(100vh-160px)] max-w-6xl mx-auto bg-white rounded-3xl border border-gray-100 shadow-2xl overflow-hidden relative backdrop-blur-sm">
                
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50/50 rounded-full -mr-48 -mt-48 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-50/50 rounded-full -ml-32 -mb-32 blur-3xl pointer-events-none" />

                {/* Header Page */}
                <div className="p-8 border-b border-gray-100 bg-white/10 backdrop-blur-md relative z-10">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 p-[2px] shadow-lg shadow-indigo-200">
                                <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
                                    <Bot className="w-9 h-9 text-indigo-600" />
                                </div>
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                    Asistencia Técnica Superior
                                    <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                                </h1>
                                <div className="flex items-center gap-3 mt-1.5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 flex items-center gap-1">
                                        <Zap className="w-2.5 h-2.5" /> Antigravity AI Alpha
                                    </span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                                        <Shield className="w-2.5 h-2.5" /> Nucleo v4.0 Active
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setMessages([])}
                                className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                title="Limpiar conversación"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                            <div className="h-6 w-[1px] bg-gray-100 mx-2" />
                            <div className="p-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                Protocolo B2B VIP
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chat Area */}
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-10 space-y-8 bg-gray-50/30 relative z-10 scroll-smooth"
                >
                    {messages.length === 0 ? (
                        <div className="max-w-4xl mx-auto">
                            <div className="text-center space-y-4 mb-16">
                                <h2 className="text-4xl font-black text-gray-900 tracking-tight leading-tight">
                                    Impulsa la arquitectura de tu plataforma
                                </h2>
                                <p className="text-gray-500 max-w-xl mx-auto font-medium">
                                    Soy Antigravity AI, el experto oficial en el ecosistema Rotary ClubPlatform. 
                                    Pregúntame sobre cualquier aspecto técnico, estratégico o funcional del sistema.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {suggestedQueries.map((q, i) => (
                                    <button 
                                        key={i}
                                        onClick={() => handleSend(q.text)}
                                        className="text-left p-5 bg-white border border-gray-100 rounded-2xl hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5 transition-all flex items-start gap-4 group relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Sparkles className="w-3 h-3 text-indigo-300" />
                                        </div>
                                        <div className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-50 transition-colors ${q.color}`}>
                                            <q.icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-700 leading-snug group-hover:text-gray-900 transition-colors">
                                                {q.text}
                                            </p>
                                            <span className="text-[10px] font-black text-gray-300 uppercase mt-2 block tracking-widest">
                                                Consultar arquitectura
                                            </span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-200 group-hover:text-indigo-400 mt-1 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-5xl mx-auto space-y-8">
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                                    <div className={`flex gap-4 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                                            m.role === 'user' 
                                                ? 'bg-white border-gray-100 text-gray-400' 
                                                : 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-white/20 shadow-md'
                                        }`}>
                                            {m.role === 'user' ? <Users className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                        </div>
                                        <div className={`relative p-6 rounded-2xl shadow-sm text-sm leading-relaxed ${
                                            m.role === 'user' 
                                                ? 'bg-indigo-600 text-white font-medium rounded-tr-none' 
                                                : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none font-medium'
                                        }`}>
                                            {m.text.split('\n').map((line, k) => (
                                                <p key={k} className={k > 0 ? 'mt-3' : ''}>{line}</p>
                                            ))}
                                            {m.role === 'assistant' && (
                                                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button className="text-[10px] font-black uppercase text-gray-400 hover:text-indigo-500">Copiar</button>
                                                    <span className="text-gray-200">|</span>
                                                    <button className="text-[10px] font-black uppercase text-gray-400 hover:text-indigo-500">Útil</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start animate-pulse">
                                    <div className="flex gap-4 max-w-[85%]">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-400 border border-indigo-100">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        </div>
                                        <div className="bg-white border border-gray-100 p-6 rounded-2xl rounded-tl-none shadow-sm space-y-2 w-64">
                                            <div className="h-2 bg-gray-100 rounded-full w-full animate-pulse" />
                                            <div className="h-2 bg-gray-100 rounded-full w-3/4 animate-pulse" />
                                            <div className="h-1.5 bg-gray-50 rounded-full w-1/2 animate-pulse pt-1" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-8 bg-white border-t border-gray-100 relative z-10">
                    <div className="max-w-4xl mx-auto">
                        <div className="relative group">
                            <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                            <div className="flex items-center gap-4 bg-gray-50 p-2.5 pr-3.5 rounded-2xl border border-gray-100 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-50 transition-all shadow-inner">
                                <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <input 
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                                    placeholder="Escribe tu consulta técnica sobre la arquitectura de la plataforma..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 text-sm font-bold placeholder:text-gray-400 placeholder:font-bold"
                                />
                                <button 
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() || loading}
                                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                                        input.trim() && !loading 
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:scale-105 active:scale-95' 
                                            : 'bg-gray-100 text-gray-300'
                                    }`}
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between px-2">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <History className="w-3.5 h-3.5" /> Sesión Cifrada
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <Maximize2 className="w-3.5 h-3.5" /> Vista Expandida
                                </div>
                            </div>
                            <p className="text-[10px] font-bold text-gray-300">
                                Antigravity AI puede cometer errores. Verifica la información técnica crítica.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default SuperAssistantChat;
