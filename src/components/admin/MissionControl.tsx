import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Activity, ArrowRight, Bot, CheckCircle2, ChevronRight, FileText, History, Mic, MicOff,
    Paperclip, Send, Terminal, Trash2, X, Users, Sparkles, MessageSquare
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const avatarUrl = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

interface ToolExecuted {
    name: string; success: boolean; action: string;
    emoji: string; label: string; message: string;
    data?: any;
}
interface WorkflowSuggestion {
    agent: string; emoji: string; action: string;
}
interface ChatAttachment { name: string; type: string; size: number; url: string; }
interface ChatMessage {
    role: 'user' | 'assistant'; text: string; attachment?: ChatAttachment;
    toolExecuted?: ToolExecuted; workflowSuggestions?: WorkflowSuggestion[];
}

interface Agent {
    id: string; name: string; role: string; category: string;
    description: string; avatarSeed: string; avatarColor: string;
    active: boolean; order: number; greeting: string;
    systemPrompt: string; aiModel: string; capabilities: string[];
}

const CATEGORY_ORDER = ['dirección', 'producción', 'tecnología', 'difusión'];
const CATEGORY_LABELS: Record<string, string> = {
    'dirección': 'Dirección y Estrategia',
    'producción': 'Producción de Contenido',
    'tecnología': 'Tecnología y Plataformas',
    'difusión': 'Difusión y Comunidad',
};

/* ─── Minimalist Agent Card ─── */
const AgentCard: React.FC<{
    agent: Agent;
    isChatting: boolean;
    onClick: () => void;
}> = ({ agent, isChatting, onClick }) => {
    // Extract pseudo-features from the description to show exactly what they do
    const features = agent.description.split(/(?:,|\by\b|\.)/).map(s => s.trim()).filter(s => s.length > 3);

    return (
        <div
            onClick={onClick}
            className={`
                bg-white border rounded-2xl p-5 cursor-pointer transition-all duration-200 group flex flex-col h-full
                ${isChatting ? 'border-[#0082c3] shadow-md ring-2 ring-[#0082c3]/10' : 'border-gray-200 hover:border-[#0082c3]/50 hover:shadow-sm'}
            `}
        >
            <div className="flex items-start gap-4 mb-4">
                {/* Avatar */}
                <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center p-1.5 group-hover:bg-blue-50 transition-colors">
                    <img src={avatarUrl(agent.avatarSeed)} alt={agent.name} className="w-full h-full object-contain" />
                </div>
                {/* Headers */}
                <div className="flex-1 min-w-0 pt-0.5">
                    <h4 className="font-black text-gray-900 text-[15px] truncate">{agent.name}</h4>
                    <p className="text-[11px] font-bold text-[#0082c3] mt-0.5 truncate">{agent.role}</p>
                </div>
                {/* Status Dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${agent.active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            </div>

            {/* Capabilities List */}
            <div className="mt-auto pt-4 border-t border-gray-50">
                <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-2">Capabilities</p>
                <div className="space-y-2">
                    {features.slice(0, 3).map((feat, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px] text-gray-600 leading-snug">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span className="font-medium">{feat.charAt(0).toUpperCase() + feat.slice(1)}</span>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Enter Button (Visible on Hover) */}
            <div className={`mt-4 w-full py-2 rounded-lg text-center text-xs font-bold transition-all ${isChatting ? 'bg-[#0082c3] text-white' : 'bg-gray-50 text-gray-500 group-hover:bg-[#0082c3]/10 group-hover:text-[#0082c3]'}`}>
                {isChatting ? 'Active Session' : 'Delegate Task'}
            </div>
        </div>
    );
};

interface SavedConversation {
    id: string; agentId: string; title: string; messageCount: number;
    lastMessage: string; createdAt: string; updatedAt: string;
    agentName: string; avatarSeed: string; avatarColor: string; agentRole: string;
}

const MissionControl: React.FC = () => {
    const { token } = useAuth();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loadingAgents, setLoadingAgents] = useState(true);
    const [chatAgent, setChatAgent] = useState<Agent | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef<any>(null);

    // ── Conversation History ──
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || localStorage.getItem('rotary_token')}`,
    });

    const fetchConversations = useCallback(async (agentId: string) => {
        try {
            const res = await fetch(`${API_URL}/agents/conversations?agentId=${agentId}&limit=15`, { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                setSavedConversations(data.conversations || []);
            }
        } catch (e) { console.error('Failed to load conversations:', e); }
    }, [token]);

    const saveConversation = useCallback(async (agentId: string, msgs: ChatMessage[], convId: string | null) => {
        if (msgs.length < 2) return convId;
        try {
            const res = await fetch(`${API_URL}/agents/conversations`, {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify({
                    conversationId: convId,
                    agentId,
                    messages: msgs.map(m => ({ role: m.role, text: m.text })),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const newId = data.conversation?.id || convId;
                fetchConversations(agentId);
                return newId;
            }
        } catch (e) { console.error('Save conversation error:', e); }
        return convId;
    }, [token, fetchConversations]);

    const resumeConversation = useCallback(async (conv: SavedConversation) => {
        const agent = agents.find(a => a.id === conv.agentId);
        if (!agent) return;
        try {
            const res = await fetch(`${API_URL}/agents/conversations/${conv.id}`, { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                const savedMsgs = (data.messages || []) as ChatMessage[];
                setChatAgent(agent);
                setMessages(savedMsgs);
                setConversationId(conv.id);
                setShowHistory(false);
                setInput('');
                setAttachment(null);
            }
        } catch (e) { console.error('Resume conversation error:', e); }
    }, [agents, token]);

    const deleteConversation = useCallback(async (convId: string, agentId: string) => {
        try {
            await fetch(`${API_URL}/agents/conversations/${convId}`, { method: 'DELETE', headers: getHeaders() });
            if (conversationId === convId) setConversationId(null);
            fetchConversations(agentId);
        } catch (e) { console.error('Delete conversation error:', e); }
    }, [token, conversationId, fetchConversations]);

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await fetch(`${API_URL}/agents`, { headers: getHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    setAgents((data.agents || []).filter((a: Agent) => a.active));
                }
            } catch (e) { console.error('Failed to load agents:', e); }
            finally { setLoadingAgents(false); }
        };
        fetchAgents();
    }, [token]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    useEffect(() => { if (chatAgent) setTimeout(() => inputRef.current?.focus(), 200); }, [chatAgent]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setAttachment({ name: file.name, type: file.type, size: file.size, url });
        e.target.value = '';
    };

    const removeAttachment = () => {
        if (attachment) URL.revokeObjectURL(attachment.url);
        setAttachment(null);
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    const startRecording = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            setInput(transcript);
        };
        recognition.onerror = () => setIsRecording(false);
        recognition.onend = () => setIsRecording(false);
        recognition.start();
        recognitionRef.current = recognition;
        setIsRecording(true);
    }, []);

    const stopRecording = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsRecording(false);
    }, []);

    const toggleRecording = () => {
        if (isRecording) stopRecording();
        else startRecording();
    };

    const openChat = (agent: Agent) => {
        setChatAgent(agent);
        setMessages([{ role: 'assistant', text: agent.greeting || `¡Hola! Soy ${agent.name} 👋` }]);
        setInput('');
        setAttachment(null);
        setConversationId(null);
        setShowHistory(false);
        fetchConversations(agent.id);
    };

    const startNewChat = () => {
        if (!chatAgent) return;
        setMessages([{ role: 'assistant', text: chatAgent.greeting || `¡Hola! Soy ${chatAgent.name} 👋` }]);
        setConversationId(null);
        setInput('');
        setShowHistory(false);
    };

    const closeChat = () => {
        setChatAgent(null); setMessages([]); setAttachment(null);
        setConversationId(null); setShowHistory(false);
        stopRecording();
    };

    const sendMessage = async () => {
        if ((!input.trim() && !attachment) || !chatAgent || loading) return;
        const userMsg = input.trim();
        const currentAttachment = attachment;
        setInput('');
        setAttachment(null);
        if (isRecording) stopRecording();
        const newUserMsg: ChatMessage = { role: 'user', text: userMsg || (currentAttachment ? `📎 ${currentAttachment.name}` : ''), attachment: currentAttachment || undefined };
        setMessages(prev => [...prev, newUserMsg]);
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/ai/agent-chat`, {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify({
                    message: userMsg + (currentAttachment ? ` [Archivo adjunto: ${currentAttachment.name}]` : ''),
                    agentId: chatAgent.id,
                    history: messages.map(m => ({ role: m.role, text: m.text })),
                    hostname: window.location.hostname,
                }),
            });
            const data = await res.json();
            const reply = data.reply || 'No pude responder.';
            const botMsg: ChatMessage = {
                role: 'assistant',
                text: reply,
                toolExecuted: data.toolExecuted || undefined,
                workflowSuggestions: data.workflowSuggestions || undefined,
            };
            setMessages(prev => {
                const updated = [...prev, botMsg];
                saveConversation(chatAgent.id, updated, conversationId).then(newId => {
                    if (newId && newId !== conversationId) setConversationId(newId);
                });
                return updated;
            });
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Error al conectar. Intenta de nuevo.' }]);
        } finally { setLoading(false); }
    };

    const grouped = agents.reduce((acc, agent) => {
        const cat = agent.category || 'otros';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(agent);
        return acc;
    }, {} as Record<string, Agent[]>);
    
    const directors = grouped['dirección'] || [];
    const midCategories = CATEGORY_ORDER.filter(c => c !== 'dirección');
    const activeCount = agents.length;

    return (
        <div data-mission-control className="flex flex-col h-full bg-gray-50 text-gray-800 font-sans p-6 md:p-10 relative">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                   <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                       Expert Agents
                       <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold flex items-center gap-2 tracking-wide">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                           {activeCount} ONLINE
                       </div>
                   </h2>
                   <p className="text-sm text-gray-500 font-medium mt-1">Select an agent to delegate tasks or discover their capabilities.</p>
                </div>
            </div>

            {/* Main Layout */}
            <div className={`flex flex-1 gap-8 relative z-10 transition-all duration-300`}>
                
                {/* ── GRID OF CARDS ── */}
                <div className={`flex flex-col gap-10 overflow-y-auto pr-4 pb-12 transition-all duration-500 custom-scrollbar ${chatAgent ? 'w-[45%]' : 'w-full'}`}>
                    
                    {loadingAgents ? (
                        <div className="flex flex-col items-center justify-center p-20 text-gray-400">
                            <Activity className="w-8 h-8 animate-spin mb-4 text-[#0082c3]" />
                            <p className="font-medium text-sm">Cargando módulos expertos...</p>
                        </div>
                    ) : (
                        <>
                            {/* Directors Section */}
                            {directors.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-black uppercase tracking-widest text-[#0082c3] mb-4 flex items-center gap-2">
                                        <Users className="w-4 h-4" /> Dirección y Orquestación
                                    </h3>
                                    <div className={`grid gap-4 ${chatAgent ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                                        {directors.map(agent => (
                                            <AgentCard key={agent.id} agent={agent} isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Other Categories */}
                            {midCategories.map(catKey => {
                                const catAgents = grouped[catKey];
                                if (!catAgents || catAgents.length === 0) return null;
                                return (
                                    <div key={catKey}>
                                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4" /> {CATEGORY_LABELS[catKey]}
                                        </h3>
                                        <div className={`grid gap-4 ${chatAgent ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'}`}>
                                            {catAgents.map(agent => (
                                                <AgentCard key={agent.id} agent={agent} isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {/* ── CHAT PANEL (Clean Linear/Notion Style) ── */}
                {chatAgent && (
                    <div className="w-[55%] rounded-2xl border border-gray-200 bg-white shadow-xl flex flex-col overflow-hidden relative" style={{ animation: 'slideInRight 0.3s ease-out' }}>
                        
                        {/* Header Details */}
                        <div className="h-20 border-b border-gray-100 flex items-center justify-between px-6 bg-white flex-shrink-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-xl border border-gray-100 bg-gray-50 flex flex-col justify-end overflow-hidden pb-1">
                                        <img src={avatarUrl(chatAgent.avatarSeed)} alt="" className="w-10 h-10 mx-auto" />
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                                </div>
                                <div>
                                    <h4 className="text-[16px] font-black text-gray-900 tracking-tight leading-none">{chatAgent.name}</h4>
                                    <p className="text-[12px] font-semibold text-[#0082c3] mt-1">{chatAgent.role}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={startNewChat} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors font-bold text-xs flex items-center gap-2 border border-transparent hover:border-blue-100" title="Nueva sesión">
                                    <Plus className="w-4 h-4" /> Nuevo
                                </button>
                                <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(chatAgent.id); }} className={`p-2.5 rounded-xl transition-colors font-bold text-xs flex items-center gap-2 border ${showHistory ? 'text-blue-600 bg-blue-50 border-blue-100' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50 border-transparent hover:border-gray-200'}`} title="Sesiones Anteriores">
                                    <History className="w-4 h-4" /> Historial
                                </button>
                                <div className="w-px h-6 bg-gray-200 mx-2" />
                                <button onClick={closeChat} className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Cerrar Panel">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* History Overlay */}
                        {showHistory && (
                            <div className="absolute top-20 left-0 right-0 bottom-24 bg-white/95 backdrop-blur-md z-20 border-b border-gray-100 flex flex-col overflow-hidden animate-fadeIn">
                                <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                                    <h4 className="text-xs font-black text-gray-900 tracking-wider uppercase">Sesiones Guardadas</h4>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                                    {savedConversations.length === 0 ? (
                                        <p className="text-sm font-medium text-gray-400 text-center py-10">No hay sesiones guardadas</p>
                                    ) : (
                                        savedConversations.map(conv => (
                                            <div key={conv.id} className="group relative flex flex-col p-4 rounded-2xl border border-gray-100 bg-white hover:border-blue-200 hover:shadow-md cursor-pointer transition-all" onClick={() => resumeConversation(conv)}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <h5 className="text-sm font-bold text-gray-900 truncate mr-6">{conv.title || 'Sesión Activa'}</h5>
                                                    <span className="text-xs font-medium text-gray-400">{new Date(conv.updatedAt).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-xs text-gray-500 truncate mb-3">{conv.lastMessage}</p>
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 tracking-wide uppercase">
                                                    <span className="bg-gray-100 px-2 flex-shrink-0 py-1 rounded-lg border border-gray-200">{conv.messageCount} ops</span>
                                                </div>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id, chatAgent.id); }}
                                                    className="absolute top-3 right-3 p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-xl hover:bg-red-50 hover:border-red-100 border border-transparent"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                                    <div className="flex items-center gap-2 mb-1.5 px-1">
                                        <span className="text-[10px] font-black tracking-widest uppercase text-gray-400">
                                            {msg.role === 'user' ? 'Tú' : chatAgent.name}
                                        </span>
                                    </div>
                                    <div 
                                        className={`rounded-2xl px-5 py-4 text-[13px] leading-relaxed break-words whitespace-pre-wrap shadow-sm ${
                                            msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm border border-blue-700' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                                        }`}
                                    >
                                        {msg.text}

                                        {/* Tools Executed Rendering */}
                                        {msg.toolExecuted && (
                                            <div className={`mt-4 p-3 rounded-xl border flex items-start gap-3 ${msg.toolExecuted.success ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                                                <span className="text-lg leading-none mt-0.5">{msg.toolExecuted.emoji || '⚡'}</span>
                                                <div>
                                                    <p className="text-[12px] font-black">{msg.toolExecuted.label || msg.toolExecuted.action}</p>
                                                    {msg.toolExecuted.message && <p className="text-[11px] font-medium opacity-80 mt-1">{msg.toolExecuted.message}</p>}
                                                </div>
                                            </div>
                                        )}
                                        {msg.workflowSuggestions && msg.workflowSuggestions.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-gray-100">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Automatizaciones creadas</p>
                                                <div className="space-y-2">
                                                    {msg.workflowSuggestions.map((s, idx) => (
                                                        <div key={idx} className="flex gap-2 items-center text-[11px] bg-gray-50 p-2 rounded-xl border border-gray-200 w-fit">
                                                            <span className="text-sm">{s.emoji}</span>
                                                            <span className="text-blue-600 font-black">@{s.agent}</span>
                                                            <span className="text-gray-600 font-medium">{s.action}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex gap-2 bg-white border border-gray-200 shadow-sm rounded-2xl rounded-tl-sm px-5 py-4 w-16 mr-auto items-center justify-center">
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
                            {attachment && (
                                <div className="mb-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-4 h-4 text-blue-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-gray-900 truncate">{attachment.name}</p>
                                            <p className="text-[10px] text-gray-500 font-medium">{formatFileSize(attachment.size)}</p>
                                        </div>
                                    </div>
                                    <button onClick={removeAttachment} className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-gray-400 hover:text-red-500 border border-transparent hover:border-gray-200 transition-all"><X className="w-4 h-4" /></button>
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                <button onClick={toggleRecording} className={`p-3 rounded-xl flex-shrink-0 transition-all font-bold group border ${isRecording ? 'bg-red-50 border-red-200 text-red-600 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm'}`}>
                                    {isRecording ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="p-3 rounded-xl flex-shrink-0 transition-all font-bold group border bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm">
                                    <Paperclip className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,.pdf,.doc,.docx" />
                                
                                <input 
                                    ref={inputRef} 
                                    type="text" 
                                    value={input} 
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder={`Pregúntale a ${chatAgent.name}...`}
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#0082c3] focus:ring-4 focus:ring-[#0082c3]/10 transition-all"
                                />
                                
                                <button onClick={sendMessage} disabled={loading || (!input.trim() && !attachment)} className="p-3 bg-[#0082c3] border border-[#006292] text-white rounded-xl shadow-md shadow-[#0082c3]/20 hover:bg-[#0072aa] hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group">
                                    <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MissionControl;
