import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, ChevronDown, Mic, MicOff, Volume2, VolumeX, CheckCircle2, AlertCircle } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';
import { useAuth } from '../hooks/useAuth';
import { useSiteImages } from '../hooks/useSiteImages';

// ── Interfaces ───────────────────────────────────────────────────────────
interface ToolExecuted {
    name: string; success: boolean; action: string;
    emoji: string; label: string; message: string;
    data?: any;
}
interface WorkflowSuggestion {
    agent: string; emoji: string; action: string;
}
interface Message {
    id: string;
    role: 'user' | 'bot';
    text: string;
    timestamp: Date;
    toolExecuted?: ToolExecuted;
    suggestions?: WorkflowSuggestion[];
}

// Public mode quick questions
const PUBLIC_QUESTIONS = [
    '¿Qué es Rotary?',
    '¿Cómo me uno al club?',
    'Ver proyectos',
    '¿Cómo donar?',
];

// Admin mode quick actions
const ADMIN_ACTIONS = [
    '📰 Crear una noticia',
    '🚀 Nuevo proyecto',
    '📅 Agendar evento',
    '📱 Programar publicación',
];

const ChatBot: React.FC = () => {
    const { club } = useClub();
    const { user, token, isAuthenticated } = useAuth();
    const isClubAdmin = isAuthenticated && (user?.role === 'club_admin' || user?.role === 'administrator');
    const isSuperAdmin = isAuthenticated && user?.role === 'administrator';
    const [activeAgent, setActiveAgent] = useState<'ClubAssist' | 'Antigravity AI'>('ClubAssist');
    const siteImages = useSiteImages();

    // Avatars
    const ANTIGRAVITY_AVATAR = "https://images.unsplash.com/photo-1675244502909-0f40d7e7925e?w=150&h=150&fit=crop";
    const defaultPublic = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face";
    const defaultAdmin = "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face";
    
    const PUBLIC_AVATAR = (siteImages.chatbotPublicAvatar && !Array.isArray(siteImages.chatbotPublicAvatar)) 
        ? siteImages.chatbotPublicAvatar.url 
        : defaultPublic;
        
    const ADMIN_AVATAR = (siteImages.chatbotAdminAvatar && !Array.isArray(siteImages.chatbotAdminAvatar))
        ? siteImages.chatbotAdminAvatar.url
        : defaultAdmin;

    const CURRENT_AVATAR = activeAgent === 'Antigravity AI' ? ANTIGRAVITY_AVATAR : (isClubAdmin ? ADMIN_AVATAR : PUBLIC_AVATAR);

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [unread, setUnread] = useState(0);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const API_URL = import.meta.env.VITE_API_URL || '/api';
    const getHeaders = () => ({
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    // Initialize greeting
    useEffect(() => {
        const greeting = activeAgent === 'Antigravity AI'
            ? `¡Hola! ⚡ Soy **Antigravity AI**, el núcleo de soporte técnico y arquitectura. Puedo ayudarte con dudas profundas sobre multitenancy, despliegue, seguridad y el diseño del sistema. ¿En qué puedo apoyarte hoy?`
            : isClubAdmin
                ? `¡Hola! 🔧 Soy **ClubAssist**, tu asistente de gestión. Puedo ayudarte a crear noticias, proyectos, eventos, programar publicaciones y configurar tu sitio web. ¿Qué necesitas hoy?`
                : `¡Hola! 👋 Soy el asistente virtual de **${club.name}**. Estoy aquí para ayudarte con información sobre Rotary, nuestros proyectos y programas. ¿En qué puedo ayudarte?`;

        setMessages([{
            id: '0', role: 'bot', text: greeting, timestamp: new Date(),
        }]);
    }, [isClubAdmin, club.name, activeAgent]);

    useEffect(() => {
        if (isOpen) { setUnread(0); setTimeout(() => inputRef.current?.focus(), 300); }
    }, [isOpen]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

    useEffect(() => {
        const timer = setTimeout(() => { if (!isOpen) setUnread(1); }, 5000);
        return () => clearTimeout(timer);
    }, []);

    // ── Send message ─────────────────────────────────────────────────────
    const sendMessage = async (text: string) => {
        if (!text.trim() || isTyping) return;
        setInput('');

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        try {
            const isAntigravity = activeAgent === 'Antigravity AI';
            const endpoint = isAntigravity ? '/ai/agent-chat' : (isClubAdmin ? '/ai/assistant-chat' : '/ai/chat');
            
            const body = isAntigravity
                ? {
                    message: text,
                    agentId: 'Antigravity AI',
                    history: messages.filter(m => m.id !== '0').map(m => ({
                        role: m.role === 'bot' ? 'assistant' : 'user',
                        text: m.text,
                    })),
                    hostname: window.location.hostname,
                }
                : isClubAdmin
                    ? {
                        message: text,
                        history: messages.filter(m => m.id !== '0').map(m => ({
                            role: m.role === 'bot' ? 'assistant' : 'user',
                            text: m.text,
                        })),
                        hostname: window.location.hostname,
                    }
                    : { message: text, clubId: club.id };

            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(body),
            });

            const data = await response.json();
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                text: data.reply || 'Lo siento, no pude procesar tu mensaje.',
                timestamp: new Date(),
                toolExecuted: data.toolExecuted || undefined,
                suggestions: data.workflowSuggestions || undefined,
            };
            setMessages(prev => [...prev, botMsg]);
            if (!isOpen) setUnread(prev => prev + 1);

            // Auto-speak response if voice mode is on
            if (voiceEnabled && data.reply) speakText(data.reply);
        } catch {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(), role: 'bot',
                text: 'Tuve un problema de conexión. Por favor intenta de nuevo. 🙏',
                timestamp: new Date(),
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    // ── Voice: Text-to-Speech ────────────────────────────────────────────
    const speakText = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, '').replace(/\n/g, '. '));
            u.lang = 'es-CO';
            u.rate = 1.05;
            u.onstart = () => setIsSpeaking(true);
            u.onend = () => setIsSpeaking(false);
            window.speechSynthesis.speak(u);
        }
    };

    const stopSpeaking = () => {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
    };

    // ── Voice: Speech-to-Text ────────────────────────────────────────────


    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    // Use direct SpeechRecognition for real-time STT
    const toggleVoiceInput = () => {
        if (isRecording) {
            stopRecording();
            return;
        }
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            const recognition = new SR();
            recognition.lang = 'es-CO';
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                if (transcript) sendMessage(transcript);
            };
            recognition.onerror = () => setIsRecording(false);
            recognition.onend = () => setIsRecording(false);
            recognition.start();
            setIsRecording(true);
        }
    };

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

    const formatTime = (d: Date) => d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

    const renderText = (text: string) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) =>
            part.startsWith('**') && part.endsWith('**')
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : <span key={i}>{part}</span>
        );
    };

    const isAntigravity = activeAgent === 'Antigravity AI';
    
    const headerGradient = isAntigravity
        ? 'from-indigo-900 via-purple-950 to-indigo-950'
        : isClubAdmin
            ? 'from-slate-800 via-slate-900 to-gray-900'
            : 'from-[#0C3C7C] to-sky-700';

    const headerTitle = isAntigravity ? 'Antigravity AI' : (isClubAdmin ? 'ClubAssist' : 'Asistente Rotary');
    const headerSubtitle = isAntigravity
        ? 'Soporte Técnico & Arquitectura'
        : isClubAdmin
            ? 'Tu asistente de gestión inteligente'
            : 'En línea · Responde al instante';

    if (siteImages._loading) return null;

    return (
        <>
            {/* Chat Window */}
            {isOpen && (
                <div
                    className={`fixed bottom-24 right-4 sm:right-8 z-50 w-[calc(100vw-2rem)] sm:w-[380px] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col transition-all duration-300 ${isMinimized ? 'h-[68px]' : 'h-[560px]'
                        }`}
                    style={{ boxShadow: '0 25px 60px -10px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04)' }}
                >
                    {/* Header */}
                    <div
                        className={`bg-gradient-to-r ${headerGradient} px-5 py-4 flex items-center gap-3 cursor-pointer flex-shrink-0 relative overflow-hidden`}
                        onClick={() => setIsMinimized(!isMinimized)}
                    >
                        {/* Background Decoration for Antigravity */}
                        {isAntigravity && (
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full -mr-16 -mt-16 blur-2xl" />
                        )}

                        <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 border-2 ${isAntigravity ? 'border-purple-400/50' : 'border-white/20'} shadow-sm`}>
                            <img src={CURRENT_AVATAR} alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm leading-tight flex items-center gap-1.5">
                                {headerTitle}
                                {isAntigravity && <Sparkles className="w-3 h-3 text-purple-400 animate-pulse" />}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`w-1.5 h-1.5 ${isClubAdmin ? 'bg-emerald-400' : 'bg-emerald-400'} rounded-full animate-pulse`} />
                                <p className={`${isClubAdmin ? 'text-gray-400' : 'text-sky-200'} text-[10px] font-medium`}>{headerSubtitle}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {/* Mode Toggle — Super Admin only */}
                            {isSuperAdmin && !isMinimized && (
                                <button
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setActiveAgent(activeAgent === 'ClubAssist' ? 'Antigravity AI' : 'ClubAssist');
                                        setMessages([]); // Refresh greeting
                                    }}
                                    className={`p-1.5 rounded-lg transition-all border ${
                                        isAntigravity 
                                            ? 'bg-purple-600/30 border-purple-500/50 text-purple-300' 
                                            : 'hover:bg-white/10 border-white/10 text-gray-400'
                                    }`}
                                    title={isAntigravity ? 'Volver a ClubAssist' : 'Cambiar a Modo Antigravity'}
                                >
                                    <Layers className="w-4 h-4" />
                                </button>
                            )}

                            {/* Voice toggle — admin only */}
                            {isClubAdmin && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setVoiceEnabled(!voiceEnabled); if (isSpeaking) stopSpeaking(); }}
                                    className={`p-1.5 rounded-lg transition-all ${voiceEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/10 text-gray-400'}`}
                                    title={voiceEnabled ? 'Desactivar voz' : 'Activar respuestas por voz'}
                                >
                                    {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                                <ChevronDown className={`w-4 h-4 text-white transition-transform ${isMinimized ? 'rotate-180' : ''}`} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); if (isSpeaking) stopSpeaking(); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                                <X className="w-4 h-4 text-white" />
                            </button>
                        </div>
                    </div>

                    {!isMinimized && (
                        <>
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50/50">
                                {messages.map((msg) => (
                                    <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {msg.role === 'bot' && (
                                            <div className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 mt-1 shadow-sm border ${isAntigravity ? 'border-purple-100 bg-purple-50' : 'border-gray-200 bg-white'}`}>
                                                <img src={CURRENT_AVATAR} alt="Avatar" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <div className="max-w-[80%] group">
                                            <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                                ? `${isAntigravity ? 'bg-indigo-700' : (isClubAdmin ? 'bg-slate-800' : 'bg-rotary-blue')} text-white rounded-tr-sm`
                                                : 'bg-white text-gray-700 rounded-tl-sm shadow-sm border border-gray-100'
                                                }`}>
                                                {renderText(msg.text)}
                                            </div>

                                            {/* Action Card for tool executions */}
                                            {msg.toolExecuted && (
                                                <div className={`mt-2 px-3 py-2.5 rounded-xl border ${msg.toolExecuted.success
                                                    ? 'bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200'
                                                    : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'
                                                    }`}>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">{msg.toolExecuted.emoji}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[10px] font-black uppercase text-gray-500 tracking-wide">{msg.toolExecuted.label}</p>
                                                            <p className="text-[11px] font-bold text-gray-700 mt-0.5">{msg.toolExecuted.message}</p>
                                                        </div>
                                                        {msg.toolExecuted.success
                                                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                                            : <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                                                        }
                                                    </div>
                                                </div>
                                            )}

                                            {/* Workflow suggestions */}
                                            {msg.suggestions && msg.suggestions.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider px-1">⚡ Siguiente paso</p>
                                                    {msg.suggestions.slice(0, 2).map((sug, si) => (
                                                        <button
                                                            key={si}
                                                            onClick={() => sendMessage(sug.action)}
                                                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-left"
                                                        >
                                                            <span className="text-[10px]">{sug.emoji}</span>
                                                            <span className="text-[10px] font-bold text-gray-500 flex-1 truncate">{sug.action}</span>
                                                            <span className="text-[9px] text-gray-300">→</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <p className={`text-[9px] text-gray-400 mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'} px-1`}>
                                                {formatTime(msg.timestamp)}
                                            </p>
                                        </div>
                                    </div>
                                ))}

                                {/* Typing indicator */}
                                {isTyping && (
                                    <div className="flex gap-2.5">
                                        <div className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 shadow-sm border border-gray-200`}>
                                            <img src={isClubAdmin ? ADMIN_AVATAR : PUBLIC_AVATAR} alt="Avatar" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100">
                                            <div className="flex gap-1 items-center h-4">
                                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Quick questions / actions */}
                            {messages.length <= 1 && (
                                <div className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5 bg-gray-50/50 border-t border-gray-100">
                                    {quickItems.map(q => (
                                        <button
                                            key={q}
                                            onClick={() => sendMessage(q)}
                                            className={`px-3 py-1.5 border text-[10px] font-bold rounded-full transition-all ${isClubAdmin
                                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                                                : 'bg-white border-rotary-blue/20 text-rotary-blue hover:bg-sky-50'
                                                }`}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Input Area */}
                            <form onSubmit={handleSubmit} className="px-4 py-3 bg-white border-t border-gray-100 flex items-center gap-2">
                                {/* Mic button — admin only */}
                                {isClubAdmin && (
                                    <button
                                        type="button"
                                        onClick={toggleVoiceInput}
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isRecording
                                            ? 'bg-red-500 text-white animate-pulse'
                                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                            }`}
                                        title={isRecording ? 'Detener grabación' : 'Hablar'}
                                    >
                                        {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                    </button>
                                )}
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    placeholder={isAntigravity ? 'Consulta técnica...' : (isClubAdmin ? 'Escribe o habla...' : 'Escribe tu mensaje...')}
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rotary-blue/20 focus:bg-white transition-all placeholder:text-gray-400"
                                    disabled={isTyping}
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isTyping}
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0 ${isAntigravity
                                        ? 'bg-indigo-700 hover:bg-indigo-800 shadow-lg shadow-indigo-200'
                                        : isClubAdmin
                                            ? 'bg-slate-800 hover:bg-slate-700'
                                            : 'bg-rotary-blue hover:bg-sky-800'
                                        }`}
                                >
                                    {isTyping
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Send className="w-4 h-4" />
                                    }
                                </button>
                            </form>

                            {/* Powered by */}
                            <div className="text-center py-2 bg-white border-t border-gray-50">
                                <p className="text-[9px] text-gray-300 font-medium">
                                    {isClubAdmin ? 'ClubAssist · Asistente IA de gestión' : 'Asistente IA · Rotary Platform'}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Floating Button Container */}
            <div className="fixed bottom-6 right-4 sm:right-8 z-50 flex items-center justify-center">
                
                {/* Ping animation aura (only when closed) to feel alive/online */}
                {!isOpen && (
                    <div className={`absolute -inset-1 md:-inset-2 rounded-full animate-[ping_3s_ease-in-out_infinite] opacity-60 ${
                        isClubAdmin ? 'bg-emerald-400' : 'bg-rotary-blue'
                    }`}></div>
                )}

                <button
                    onClick={() => { setIsOpen(!isOpen); setUnread(0); }}
                    className={`relative w-[60px] h-[60px] rounded-full shadow-2xl transition-all duration-300 hover:scale-[1.05] active:scale-95 flex-shrink-0 ${
                        isOpen
                            ? 'bg-gray-900 flex items-center justify-center'
                            : isClubAdmin
                                ? 'border-2 border-emerald-400 p-[2px] bg-slate-900'
                                : 'border-2 border-rotary-blue p-[2px] bg-white'
                    }`}
                    style={{
                        boxShadow: isOpen
                            ? '0 15px 30px rgba(0,0,0,0.3)'
                            : isClubAdmin
                                ? '0 15px 35px rgba(30,41,59,0.5)'
                                : '0 15px 35px rgba(12, 60, 124, 0.4)'
                    }}
                    aria-label="Abrir asistente"
                >
                    <div className="relative w-full h-full flex items-center justify-center">
                        {isOpen
                            ? <X className="w-6 h-6 text-white relative z-10" />
                            : <img src={isClubAdmin ? (isAntigravity ? ANTIGRAVITY_AVATAR : ADMIN_AVATAR) : PUBLIC_AVATAR} alt="Chat Avatar" className="w-full h-full object-cover rounded-full relative z-10 bg-white" />
                        }

                        {/* Unread badge placed outside */}
                        {!isOpen && unread > 0 && (
                            <span className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white text-xs font-black rounded-full flex items-center justify-center shadow-lg ring-2 ring-white z-20">
                                {unread}
                            </span>
                        )}

                        {/* Online status indicator */}
                        {!isOpen && (
                            <span 
                                className={`absolute -bottom-1 -right-1 w-4 h-4 ${isAntigravity ? 'bg-purple-500' : 'bg-green-500'} rounded-full border-2 border-white z-20`}
                                title="Online"
                            ></span>
                        )}
                    </div>
                </button>
            </div>
        </>
    );
};

export default ChatBot;
