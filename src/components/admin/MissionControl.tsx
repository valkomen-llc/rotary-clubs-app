import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Radio, X, Send, Loader2, Paperclip, Mic, MicOff, FileText, Volume2, VolumeX,
    History, Plus, Trash2, CheckCircle2, AlertCircle,
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

/* ─── Agent Card ─── */
const AgentCard: React.FC<{
    agent: Agent;
    tier: 'top' | 'mid' | 'base';
    isChatting: boolean;
    onClick: () => void;
}> = ({ agent, tier, isChatting, onClick }) => (
    <div
        onClick={onClick}
        className={`
            relative group cursor-pointer rounded-xl border transition-all duration-300
            ${isChatting
                ? 'border-[#F7A81B]/60 bg-white/[0.10] shadow-lg shadow-[#F7A81B]/15'
                : 'border-[#00A2E0]/15 bg-white/[0.04] hover:border-[#00A2E0]/40 hover:bg-white/[0.08]'}
            ${tier === 'top' ? 'px-6 py-5' : tier === 'mid' ? 'px-5 py-4' : 'px-4 py-3.5'}
        `}
    >
        {/* Left accent bar */}
        <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: agent.avatarColor }} />

        <div className="flex items-center gap-3">
            <div
                className={`rounded-full overflow-hidden border-2 flex-shrink-0 group-hover:scale-110 transition-transform ${tier === 'top' ? 'w-14 h-14' : tier === 'mid' ? 'w-12 h-12' : 'w-10 h-10'}`}
                style={{ borderColor: agent.avatarColor, background: agent.avatarColor + '20', boxShadow: `0 0 15px ${agent.avatarColor}25` }}
            >
                <img src={avatarUrl(agent.avatarSeed)} alt={agent.name} className="w-full h-full" loading="lazy" />
            </div>
            <div className="min-w-0 flex-1">
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: agent.avatarColor }}>{agent.role}</span>
                <h4 className={`font-black text-white leading-tight ${tier === 'top' ? 'text-lg' : tier === 'mid' ? 'text-base' : 'text-sm'}`}>{agent.name}</h4>
                <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">{agent.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <div className={`w-2.5 h-2.5 rounded-full ${isChatting ? 'bg-blue-400 animate-pulse' : agent.active ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                <span className="text-[8px] font-bold text-white/25 uppercase">{agent.aiModel}</span>
            </div>
        </div>
    </div>
);

/* ─── Connector Line ─── */
const VLine: React.FC<{ h?: string }> = ({ h = '28px' }) => (
    <div className="flex justify-center">
        <div style={{ width: '2px', height: h, background: 'linear-gradient(180deg, #F7A81B, rgba(247,168,27,0.15))' }} />
    </div>
);

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
    const [voiceMode, setVoiceMode] = useState(false);
    const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

    // ── Conversation History ──
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || localStorage.getItem('rotary_token')}`,
    });

    // ── Fetch saved conversations for an agent ──
    const fetchConversations = useCallback(async (agentId: string) => {
        try {
            const res = await fetch(`${API_URL}/agents/conversations?agentId=${agentId}&limit=15`, { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                setSavedConversations(data.conversations || []);
            }
        } catch (e) { console.error('Failed to load conversations:', e); }
    }, [token]);

    // ── Save conversation to server ──
    const saveConversation = useCallback(async (agentId: string, msgs: ChatMessage[], convId: string | null) => {
        if (msgs.length < 2) return convId; // Don't save if only greeting
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
                fetchConversations(agentId); // Refresh sidebar
                return newId;
            }
        } catch (e) { console.error('Save conversation error:', e); }
        return convId;
    }, [token]);

    // ── Resume a saved conversation ──
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

    // ── Delete a saved conversation ──
    const deleteConversation = useCallback(async (convId: string, agentId: string) => {
        try {
            await fetch(`${API_URL}/agents/conversations/${convId}`, {
                method: 'DELETE', headers: getHeaders(),
            });
            if (conversationId === convId) setConversationId(null);
            fetchConversations(agentId);
        } catch (e) { console.error('Delete conversation error:', e); }
    }, [token, conversationId]);

    // Fetch agents from API
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

    // Listen for openAgentChat events from AgentProgressBar
    useEffect(() => {
        const handler = (e: Event) => {
            const name = (e as CustomEvent).detail?.agentName;
            if (name) {
                const agent = agents.find(a => a.name === name);
                if (agent) openChat(agent);
            }
        };
        window.addEventListener('openAgentChat', handler);
        return () => window.removeEventListener('openAgentChat', handler);
    }, [agents]);


    // ── File handling ──────────────────────────────────────────────────────
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

    // ── Voice recording (Web Speech API) ───────────────────────────────────
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

    // ── Text-to-Speech ────────────────────────────────────────────────────
    const speakText = useCallback((text: string, msgIdx?: number) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        // Try to pick a Spanish voice
        const voices = window.speechSynthesis.getVoices();
        const esVoice = voices.find(v => v.lang.startsWith('es'));
        if (esVoice) utterance.voice = esVoice;
        if (msgIdx !== undefined) {
            setSpeakingIdx(msgIdx);
            utterance.onend = () => setSpeakingIdx(null);
            utterance.onerror = () => setSpeakingIdx(null);
        }
        window.speechSynthesis.speak(utterance);
    }, []);

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
        window.speechSynthesis?.cancel();
        setSpeakingIdx(null);
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
                // Auto-save conversation after AI response
                saveConversation(chatAgent.id, updated, conversationId).then(newId => {
                    if (newId && newId !== conversationId) setConversationId(newId);
                });
                return updated;
            });
            if (voiceMode) speakText(reply);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Error al conectar. Intenta de nuevo.' }]);
        } finally { setLoading(false); }
    };

    // Group agents by category
    const grouped = agents.reduce((acc, agent) => {
        const cat = agent.category || 'otros';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(agent);
        return acc;
    }, {} as Record<string, Agent[]>);

    // Hierarchy: directors at top, then each category as a row
    const directors = grouped['dirección'] || [];
    const midCategories = CATEGORY_ORDER.filter(c => c !== 'dirección');

    const activeCount = agents.length;

    return (
        <div data-mission-control className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-all">
            {/* Header */}
            <div className="px-8 pt-6 pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#17458F] to-[#0067C8] flex items-center justify-center shadow-lg shadow-[#0067C8]/30">
                            <Radio className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Mission Control</h3>
                            <p className="text-[11px] text-gray-400 font-medium">Oficina de Comunicaciones — Haz clic en un agente para conversar</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">{activeCount} Activos</span>
                    </div>
                </div>
            </div>

            {/* Main Layout */}
            <div className="flex mx-6 mb-6 gap-0 relative">
                {/* Org Chart */}
                <div
                    className={`relative rounded-2xl overflow-hidden overflow-y-auto transition-all duration-500 ${chatAgent ? 'w-[55%]' : 'w-full'}`}
                    style={{
                        background: 'linear-gradient(160deg, #17458F 0%, #0067C8 30%, #17458F 60%, #0d2d5e 100%)',
                        height: 'calc(100vh - 320px)', minHeight: '450px',
                    }}
                >
                    {/* Cybernetic grid overlay */}
                    <div className="absolute inset-0 pointer-events-none" style={{
                        backgroundImage: `
                            linear-gradient(rgba(0,162,224,0.06) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,162,224,0.06) 1px, transparent 1px)
                        `,
                        backgroundSize: '40px 40px',
                    }} />
                    {/* Top glow accent */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[2px]" style={{
                        background: 'linear-gradient(90deg, transparent, #00A2E0, #F7A81B, #00A2E0, transparent)',
                    }} />
                    {/* Corner glow */}
                    <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none" style={{
                        background: 'radial-gradient(circle at top right, rgba(0,162,224,0.12), transparent 70%)',
                    }} />
                    <div className="absolute bottom-0 left-0 w-48 h-48 pointer-events-none" style={{
                        background: 'radial-gradient(circle at bottom left, rgba(247,168,27,0.08), transparent 70%)',
                    }} />
                    {loadingAgents ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="w-8 h-8 border-4 border-[#00A2E0] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="relative p-6 md:p-8">
                            {/* Level 1 — Directors */}
                            {directors.length > 0 && (
                                <>
                                    <div className={`grid gap-4 ${directors.length === 1 ? 'max-w-md mx-auto' : `grid-cols-${Math.min(directors.length, 3)}`}`}>
                                        {directors.map(agent => (
                                            <AgentCard key={agent.id} agent={agent} tier="top" isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                                        ))}
                                    </div>
                                    <VLine />
                                    <div className="flex justify-center">
                                        <div className="w-full max-w-lg relative">
                                            <div className="absolute top-0 left-1/4 right-1/4 h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(247,168,27,0.15), #F7A81B, rgba(247,168,27,0.15))' }} />
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Other categories as rows */}
                            {midCategories.map(catKey => {
                                const catAgents = grouped[catKey];
                                if (!catAgents || catAgents.length === 0) return null;
                                return (
                                    <div key={catKey} className="mt-4">
                                        <p className="text-center text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">
                                            {CATEGORY_LABELS[catKey]}
                                        </p>
                                        <div className={`grid gap-3`}
                                            style={{ gridTemplateColumns: `repeat(${Math.min(catAgents.length, 4)}, 1fr)` }}>
                                            {catAgents.map(agent => (
                                                <div key={agent.id}>
                                                    <VLine h="16px" />
                                                    <AgentCard agent={agent} tier="base" isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Chat Panel */}
                {chatAgent && (
                    <div
                        className="w-[45%] rounded-r-2xl border border-l-0 border-gray-200 bg-white flex flex-col overflow-hidden"
                        style={{ height: 'calc(100vh - 320px)', minHeight: '450px', animation: 'slideInRight 0.3s ease-out' }}
                    >
                        {/* Chat Header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                            <div className="w-9 h-9 rounded-full overflow-hidden border-2 flex-shrink-0"
                                style={{ borderColor: chatAgent.avatarColor, background: chatAgent.avatarColor + '20' }}>
                                <img src={avatarUrl(chatAgent.avatarSeed)} alt={chatAgent.name} className="w-full h-full" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-black text-gray-900 truncate">{chatAgent.name}</h4>
                                <p className="text-[10px] font-bold text-gray-400 truncate">{chatAgent.role}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mr-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[9px] font-bold text-emerald-600">Online</span>
                            </div>
                            {/* New chat button */}
                            <button onClick={startNewChat} className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title="Nueva conversación">
                                <Plus className="w-4 h-4" />
                            </button>
                            {/* History button */}
                            <div className="relative">
                                <button
                                    onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(chatAgent.id); }}
                                    className={`p-1.5 rounded-lg transition-colors relative ${showHistory ? 'text-[#0067C8] bg-blue-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                                    title="Historial de conversaciones"
                                >
                                    <History className="w-4 h-4" />
                                    {savedConversations.length > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 text-white text-[7px] font-black rounded-full flex items-center justify-center">
                                            {savedConversations.length}
                                        </span>
                                    )}
                                </button>
                                {/* History dropdown */}
                                {showHistory && (
                                    <div className="absolute top-full right-0 mt-1 w-72 bg-white rounded-2xl border border-gray-200 shadow-xl z-50 overflow-hidden" style={{ animation: 'slideInRight 0.2s ease-out' }}>
                                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                            <span className="text-[10px] font-black text-gray-500 uppercase">Conversaciones guardadas</span>
                                            <button onClick={() => setShowHistory(false)} className="p-0.5 hover:bg-gray-200 rounded">
                                                <X className="w-3 h-3 text-gray-400" />
                                            </button>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto">
                                            {savedConversations.length === 0 ? (
                                                <p className="text-xs text-gray-400 text-center py-6">No hay conversaciones guardadas</p>
                                            ) : (
                                                savedConversations.map(conv => (
                                                    <div
                                                        key={conv.id}
                                                        className={`flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 group ${conversationId === conv.id ? 'bg-blue-50/50' : ''}`}
                                                    >
                                                        <div className="flex-1 min-w-0" onClick={() => resumeConversation(conv)}>
                                                            <p className="text-[11px] font-bold text-gray-700 truncate">{conv.title}</p>
                                                            <p className="text-[9px] text-gray-400 truncate">{conv.lastMessage}</p>
                                                            <p className="text-[8px] text-gray-300 mt-0.5">
                                                                {new Date(conv.updatedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                {' · '}{conv.messageCount} msgs
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id, conv.agentId); }}
                                                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 className="w-3 h-3 text-gray-300 hover:text-red-400" />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => { setVoiceMode(!voiceMode); if (voiceMode) window.speechSynthesis?.cancel(); }}
                                className={`p-1.5 rounded-lg transition-colors ${voiceMode ? 'text-[#0067C8] bg-blue-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                                    }`}
                                title={voiceMode ? 'Desactivar respuestas por voz' : 'Activar respuestas por voz'}
                            >
                                {voiceMode ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                            </button>
                            <button onClick={closeChat} className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollBehavior: 'smooth' }}>
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0 mt-0.5"
                                            style={{ borderColor: chatAgent.avatarColor + '40', background: chatAgent.avatarColor + '15' }}>
                                            <img src={avatarUrl(chatAgent.avatarSeed)} alt="" className="w-full h-full" />
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] rounded-2xl text-[12px] leading-relaxed font-medium overflow-hidden ${msg.role === 'user' ? 'bg-gray-900 text-white rounded-br-md' : 'bg-gray-100 text-gray-700 rounded-bl-md'
                                        }`}>
                                        {msg.attachment && (
                                            <div className="px-3.5 pt-2.5">
                                                {msg.attachment.type.startsWith('image/') ? (
                                                    <img src={msg.attachment.url} alt={msg.attachment.name} className="rounded-lg max-h-40 object-cover" />
                                                ) : (
                                                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${msg.role === 'user' ? 'bg-white/10' : 'bg-white'}`}>
                                                        <FileText className="w-4 h-4 flex-shrink-0 opacity-60" />
                                                        <div className="min-w-0">
                                                            <p className="text-[11px] font-bold truncate">{msg.attachment.name}</p>
                                                            <p className="text-[9px] opacity-50">{formatFileSize(msg.attachment.size)}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {msg.text && <div className="px-3.5 py-2.5">{msg.text}</div>}
                                        {/* Action card when tool was executed */}
                                        {msg.toolExecuted && (
                                            <div className={`mx-2.5 mb-2 rounded-xl border px-3 py-2.5 ${msg.toolExecuted.success
                                                ? 'bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200'
                                                : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'
                                                }`}
                                                style={{ animation: 'slideInRight 0.3s ease-out' }}
                                            >
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
                                        {/* Workflow suggestions — next steps for other agents */}
                                        {msg.workflowSuggestions && msg.workflowSuggestions.length > 0 && (
                                            <div className="mx-2.5 mb-2">
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1.5 px-1">
                                                    ⚡ Siguientes pasos sugeridos
                                                </p>
                                                <div className="space-y-1">
                                                    {msg.workflowSuggestions.map((sug, si) => {
                                                        const sugAgent = agents.find(a => a.name === sug.agent);
                                                        return (
                                                            <button
                                                                key={si}
                                                                onClick={() => {
                                                                    if (sugAgent) {
                                                                        openChat(sugAgent);
                                                                        setTimeout(() => setInput(sug.action), 100);
                                                                    }
                                                                }}
                                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-left group"
                                                            >
                                                                {sugAgent && (
                                                                    <div className="w-5 h-5 rounded-full overflow-hidden border flex-shrink-0"
                                                                        style={{ borderColor: sugAgent.avatarColor + '60', background: sugAgent.avatarColor + '15' }}>
                                                                        <img src={avatarUrl(sugAgent.avatarSeed)} alt="" className="w-full h-full" />
                                                                    </div>
                                                                )}
                                                                <span className="text-[10px]">{sug.emoji}</span>
                                                                <span className="text-[10px] font-bold text-gray-500 group-hover:text-blue-600 flex-1 truncate">
                                                                    <span className="font-black text-gray-700">{sug.agent}</span> — {sug.action}
                                                                </span>
                                                                <span className="text-[9px] text-gray-300 group-hover:text-blue-400">→</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        {msg.role === 'assistant' && msg.text && (
                                            <div className="px-3.5 pb-1.5 flex justify-end">
                                                <button
                                                    onClick={() => speakText(msg.text, i)}
                                                    className={`p-1 rounded-md transition-all ${speakingIdx === i
                                                        ? 'text-[#0067C8] bg-blue-50'
                                                        : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                                                        }`}
                                                    title="Escuchar respuesta"
                                                >
                                                    <Volume2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0"
                                        style={{ borderColor: chatAgent.avatarColor + '40', background: chatAgent.avatarColor + '15' }}>
                                        <img src={avatarUrl(chatAgent.avatarSeed)} alt="" className="w-full h-full" />
                                    </div>
                                    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Attachment preview */}
                        {attachment && (
                            <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-50 bg-blue-50/50">
                                {attachment.type.startsWith('image/') ? (
                                    <img src={attachment.url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                ) : (
                                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center border border-gray-100">
                                        <FileText className="w-5 h-5 text-gray-400" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-gray-700 truncate">{attachment.name}</p>
                                    <p className="text-[9px] text-gray-400">{formatFileSize(attachment.size)}</p>
                                </div>
                                <button onClick={removeAttachment} className="p-1 hover:bg-gray-100 rounded-full">
                                    <X className="w-3.5 h-3.5 text-gray-400" />
                                </button>
                            </div>
                        )}

                        {/* Input area */}
                        <div className="flex items-center gap-1.5 px-3 py-2.5 border-t border-gray-100 bg-white flex-shrink-0">
                            {/* File upload */}
                            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect}
                                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" />
                            <button onClick={() => fileInputRef.current?.click()} disabled={loading}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-40"
                                title="Adjuntar archivo">
                                <Paperclip className="w-4 h-4" />
                            </button>

                            {/* Voice */}
                            <button onClick={toggleRecording} disabled={loading}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 ${isRecording ? 'bg-red-50 text-red-500 animate-pulse' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                    }`}
                                title={isRecording ? 'Detener grabación' : 'Grabar voz'}>
                                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                            </button>

                            {/* Text input */}
                            <input
                                ref={inputRef} value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder={isRecording ? '🎙️ Escuchando...' : `Pregúntale a ${chatAgent.name}...`}
                                className={`flex-1 px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none border transition-all font-medium ${isRecording ? 'border-red-200 bg-red-50/30' : 'border-gray-100 focus:border-gray-300 focus:bg-white'
                                    }`}
                                disabled={loading}
                            />

                            {/* Send */}
                            <button onClick={sendMessage} disabled={loading || (!input.trim() && !attachment)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-40"
                                style={{ background: chatAgent.avatarColor }}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes cyberPulse {
                    0%, 100% { opacity: 0.06; }
                    50% { opacity: 0.12; }
                }
            `}</style>
        </div>
    );
};

export default MissionControl;
