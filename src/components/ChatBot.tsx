import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, Loader2, ChevronDown } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

interface Message {
    id: string;
    role: 'user' | 'bot';
    text: string;
    timestamp: Date;
}

const QUICK_QUESTIONS = [
    '¿Qué es Rotary?',
    '¿Cómo me uno al club?',
    'Ver proyectos',
    '¿Cómo donar?',
];

const ChatBot: React.FC = () => {
    const { club } = useClub();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '0',
            role: 'bot',
            text: `¡Hola! 👋 Soy el asistente virtual de **${club.name}**. Estoy aquí para ayudarte con información sobre Rotary, nuestros proyectos y programas. ¿En qué puedo ayudarte hoy?`,
            timestamp: new Date(),
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [unread, setUnread] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setUnread(0);
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // Show unread badge after 5s if chat not opened
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isOpen) setUnread(1);
        }, 5000);
        return () => clearTimeout(timer);
    }, []);

    const sendMessage = async (text: string) => {
        if (!text.trim() || isTyping) return;
        setInput('');

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, clubId: club.id }),
            });

            const data = await response.json();
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                text: data.reply || 'Lo siento, no pude procesar tu mensaje.',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, botMsg]);
            if (!isOpen) setUnread(prev => prev + 1);
        } catch {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                text: 'Tuve un problema de conexión. Por favor intenta de nuevo. 🙏',
                timestamp: new Date(),
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    const formatTime = (d: Date) =>
        d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

    // Render bold in bot messages (**text**)
    const renderText = (text: string) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) =>
            part.startsWith('**') && part.endsWith('**')
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : <span key={i}>{part}</span>
        );
    };

    return (
        <>
            {/* Chat Window */}
            {isOpen && (
                <div
                    className={`fixed bottom-28 right-8 z-50 w-[360px] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col transition-all duration-300 ${isMinimized ? 'h-[68px]' : 'h-[520px]'
                        }`}
                    style={{ boxShadow: '0 25px 60px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)' }}
                >
                    {/* Header */}
                    <div
                        className="bg-gradient-to-r from-rotary-blue to-sky-700 px-5 py-4 flex items-center gap-3 cursor-pointer flex-shrink-0"
                        onClick={() => setIsMinimized(!isMinimized)}
                    >
                        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm leading-tight">Asistente Rotary</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                <p className="text-sky-200 text-[10px] font-medium">En línea · Responde al instante</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-all"
                            >
                                <ChevronDown className={`w-4 h-4 text-white transition-transform ${isMinimized ? 'rotate-180' : ''}`} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-all"
                            >
                                <X className="w-4 h-4 text-white" />
                            </button>
                        </div>
                    </div>

                    {!isMinimized && (
                        <>
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50/50">
                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                                    >
                                        {msg.role === 'bot' && (
                                            <div className="w-7 h-7 bg-rotary-blue rounded-xl flex items-center justify-center flex-shrink-0 mt-1">
                                                <Bot className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                        <div className={`max-w-[80%] group`}>
                                            <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                                ? 'bg-rotary-blue text-white rounded-tr-sm'
                                                : 'bg-white text-gray-700 rounded-tl-sm shadow-sm border border-gray-100'
                                                }`}>
                                                {renderText(msg.text)}
                                            </div>
                                            <p className={`text-[9px] text-gray-400 mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'} px-1`}>
                                                {formatTime(msg.timestamp)}
                                            </p>
                                        </div>
                                    </div>
                                ))}

                                {/* Typing indicator */}
                                {isTyping && (
                                    <div className="flex gap-2.5">
                                        <div className="w-7 h-7 bg-rotary-blue rounded-xl flex items-center justify-center flex-shrink-0">
                                            <Bot className="w-4 h-4 text-white" />
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

                            {/* Quick questions */}
                            {messages.length === 1 && (
                                <div className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5 bg-gray-50/50 border-t border-gray-100">
                                    {QUICK_QUESTIONS.map(q => (
                                        <button
                                            key={q}
                                            onClick={() => sendMessage(q)}
                                            className="px-3 py-1.5 bg-white border border-rotary-blue/20 text-rotary-blue text-[10px] font-bold rounded-full hover:bg-sky-50 transition-all"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Input */}
                            <form onSubmit={handleSubmit} className="px-4 py-3 bg-white border-t border-gray-100 flex items-center gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    placeholder="Escribe tu mensaje..."
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rotary-blue/20 focus:bg-white transition-all placeholder:text-gray-400"
                                    disabled={isTyping}
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isTyping}
                                    className="w-10 h-10 bg-rotary-blue rounded-xl flex items-center justify-center text-white hover:bg-sky-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                                >
                                    {isTyping
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Send className="w-4 h-4" />
                                    }
                                </button>
                            </form>

                            {/* Powered by */}
                            <div className="text-center py-2 bg-white border-t border-gray-50">
                                <p className="text-[9px] text-gray-300 font-medium">Asistente IA · Rotary Platform</p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Floating Button */}
            <button
                onClick={() => { setIsOpen(!isOpen); setUnread(0); }}
                className={`fixed bottom-8 right-8 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isOpen
                    ? 'bg-gray-900'
                    : 'bg-rotary-blue hover:bg-sky-800'
                    }`}
                style={{
                    boxShadow: isOpen
                        ? '0 15px 30px rgba(0,0,0,0.2)'
                        : '0 15px 30px rgba(12, 60, 124, 0.3)'
                }}
                aria-label="Abrir chat de asistente"
            >
                <div className="relative">
                    {isOpen
                        ? <X className="w-5 h-5 text-white" />
                        : <MessageCircle className="w-6 h-6 text-white" />
                    }
                    {!isOpen && unread > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-bounce shadow-lg">
                            {unread}
                        </span>
                    )}
                </div>
            </button>
        </>
    );
};

export default ChatBot;
