import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Send, Loader2, MessageSquare, Info, Shield, Zap, Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

interface Message {
    role: 'user' | 'assistant';
    text: string;
}

const SuperAssistantDrawer: React.FC = () => {
    const { user, token } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Only for Super Admins
    if (user?.role !== 'administrator') return null;

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: Message = { role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch(`${API}/ai/agent-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: input,
                    agentId: 'Antigravity AI',
                    history: messages
                })
            });

            if (res.ok) {
                const data = await res.json();
                setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: 'Lo siento, hubo un error de conexión con el núcleo de Antigravity. Reintenta en un momento.' }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Error técnico al contactar con la IA.' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Floating Trigger */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-[60] group flex items-center gap-2 px-4 py-3 bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 border border-white/20"
            >
                <div className="relative">
                    <Bot className="w-6 h-6" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 border-2 border-indigo-600 rounded-full animate-pulse" />
                </div>
                <span className="font-black text-sm tracking-tight pr-1">Antigravity AI</span>
                <Sparkles className="w-4 h-4 text-purple-200 group-hover:rotate-12 transition-transform" />
            </button>

            {/* Sidebar Drawer */}
            <div className={`fixed inset-y-0 right-0 w-full md:w-[450px] bg-white z-[100] shadow-[-20px_0_50px_rgba(0,0,0,0.1)] transform transition-transform duration-500 ease-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                
                {/* Header */}
                <div className="p-6 bg-gradient-to-br from-gray-900 via-indigo-950 to-purple-950 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full -ml-16 -mb-16 blur-2xl pointer-events-none" />
                    
                    <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
                                <Sparkles className="w-8 h-8 text-indigo-300" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black tracking-tight leading-none mb-1">Antigravity AI</h2>
                                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                                    <Shield className="w-3 h-3" /> Soporte Arquitectura v4.0
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsOpen(false)}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="mt-6 flex gap-2">
                        <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 backdrop-blur-sm">
                            <p className="text-[11px] text-indigo-100 font-medium leading-relaxed">
                                Soy tu experto en la arquitectura del sistema. Pregúntame sobre multitenancy, módulos, S3, Prisma o configuración técnica.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Messages Area */}
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50"
                >
                    {messages.length === 0 && (
                        <div className="space-y-6 pt-4">
                            <div className="text-center space-y-2">
                                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-4">
                                    <Bot className="w-8 h-8 text-indigo-600" />
                                </div>
                                <h3 className="text-lg font-black text-gray-900">¿Cómo puedo ayudarte?</h3>
                                <p className="text-sm text-gray-500">Prueba con alguna de estas consultas técnicas:</p>
                            </div>

                            <div className="grid gap-2">
                                {[
                                    '¿Cómo funciona el aislamiento de datos (Multitenancy)?',
                                    '¿Qué módulos de agentes IA existen?',
                                    '¿Cómo se resuelven los hostnames de los clubes?',
                                    'Explícame la arquitectura del backend'
                                ].map((q, i) => (
                                    <button 
                                        key={i}
                                        onClick={() => { setInput(q); }}
                                        className="text-left p-3.5 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-center justify-between group shadow-sm"
                                    >
                                        {q}
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                                m.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none font-medium'
                            }`}>
                                {m.text}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                <span className="text-xs font-bold text-gray-400">Analizando arquitectura...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-6 bg-white border-t border-gray-100">
                    <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-100 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-50 transition-all">
                        <input 
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder="Escribe tu consulta técnica..."
                            className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-900 px-3 placeholder:text-gray-400"
                        />
                        <button 
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                            className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-4 text-[9px] font-black text-gray-300 uppercase tracking-widest">
                        <span className="flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> Fast Response</span>
                        <div className="w-1 h-1 bg-gray-200 rounded-full" />
                        <span className="flex items-center gap-1"><Info className="w-2.5 h-2.5" /> High Fidelity</span>
                        <div className="w-1 h-1 bg-gray-200 rounded-full" />
                        <span className="flex items-center gap-1"><Shield className="w-2.5 h-2.5" /> Enterprise Grade</span>
                    </div>
                </div>
            </div>

            {/* Backdrop */}
            {isOpen && (
                <div 
                    onClick={() => setIsOpen(false)}
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[90] animate-in fade-in"
                />
            )}
        </>
    );
};

export default SuperAssistantDrawer;
