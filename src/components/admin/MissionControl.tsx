import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Radio, X, Send, Loader2, Paperclip, Mic, MicOff, FileText, Volume2, VolumeX,
    History, Plus, Trash2, CheckCircle2, AlertCircle, Activity, Zap, BarChart3, Database, Terminal
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

/* ─── Cyber Node Agent Card ─── */
const AgentCard: React.FC<{
    agent: Agent;
    tier: 'top' | 'mid' | 'base';
    isChatting: boolean;
    onClick: () => void;
}> = ({ agent, tier, isChatting, onClick }) => (
    <div
        onClick={onClick}
        className={`
            relative group flex flex-col items-center justify-center p-2 rounded-full cursor-pointer transition-all duration-300
            ${isChatting ? 'scale-110 z-10' : 'hover:scale-105 opacity-80 hover:opacity-100'}
        `}
    >
        {isChatting && (
            <div className="absolute inset-0 rounded-full animate-pulse opacity-20" style={{ background: agent.avatarColor }} />
        )}
        <div 
            className={`
                relative flex items-center justify-center rounded-full border transition-all duration-300
                ${tier === 'top' ? 'w-20 h-20' : tier === 'mid' ? 'w-16 h-16' : 'w-14 h-14'}
            `}
            style={{ 
                background: `linear-gradient(135deg, ${agent.avatarColor}15, ${agent.avatarColor}05)`,
                borderColor: isChatting ? agent.avatarColor : 'rgba(255,255,255,0.1)',
                boxShadow: isChatting ? `0 0 30px ${agent.avatarColor}30, inset 0 0 20px ${agent.avatarColor}20` : 'none'
            }}
        >
            <img src={avatarUrl(agent.avatarSeed)} alt={agent.name} className="w-[60%] h-[60%] object-contain drop-shadow-2xl" loading="lazy" />
            <div className={`absolute bottom-[-2px] right-[-2px] w-4 h-4 rounded-full border-2 border-[#0A0F1C] ${isChatting ? 'bg-[#00A2E0] animate-pulse' : agent.active ? 'bg-emerald-500' : 'bg-gray-600'}`} />
        </div>
        <div className="mt-3 text-center">
            <h4 className="font-bold text-white tracking-widest text-[11px] uppercase">{agent.name}</h4>
            <p className="text-[9px] font-mono text-white/30 mt-0.5 truncate max-w-[100px]">{agent.role.split('/')[0]}</p>
        </div>
    </div>
);

/* ─── Connector Line ─── */
const VLine: React.FC<{ h?: string }> = ({ h = '24px' }) => (
    <div className="flex justify-center">
        <div style={{ width: '1px', height: h, background: 'linear-gradient(180deg, rgba(0,162,224,0.3), rgba(0,162,224,0))' }} />
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

    // ── Live Operations Stats ──
    const [stats, setStats] = useState<any>(null);

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || localStorage.getItem('rotary_token')}`,
    });

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/agents/activity/stats`, { headers: getHeaders() });
            if (res.ok) setStats(await res.json());
        } catch { }
    }, [token]);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 15000);
        return () => clearInterval(interval);
    }, [fetchStats]);

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

    const speakText = useCallback((text: string, msgIdx?: number) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
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
        <div data-mission-control className="flex flex-col h-full bg-[#030712] text-white font-sans relative">
            
            {/* Main Layout */}
            <div className="flex flex-1 gap-6 p-6 relative z-10">
                {/* ── ORG CHART (Neural Network View) ── */}
                <div className={`relative rounded-2xl flex flex-col transition-all duration-500 border border-white/5 bg-[#0A0F1C] overflow-hidden shadow-2xl ${chatAgent ? 'w-1/2' : 'w-[45%]'}`}>
                    {/* Header */}
                    <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <Database className="w-4 h-4 text-[#00A2E0]" />
                            <h3 className="text-xs font-mono tracking-widest text-white/70 uppercase">Agent Topology</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[9px] font-mono text-emerald-400">{activeCount} / {activeCount} ONLINE</span>
                        </div>
                    </div>

                    {/* Node Canvas */}
                    <div className="flex-1 relative overflow-y-auto p-8 flex flex-col items-center">
                        <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                            backgroundImage: `linear-gradient(rgba(0,162,224,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,162,224,0.1) 1px, transparent 1px)`,
                            backgroundSize: '30px 30px',
                        }} />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00A2E0]/5 rounded-full blur-[100px] pointer-events-none" />
                        
                        {loadingAgents ? (
                            <div className="flex items-center justify-center h-full">
                                <Activity className="w-6 h-6 text-[#00A2E0] animate-pulse" />
                            </div>
                        ) : (
                            <div className="relative z-10 w-full max-w-lg">
                                {/* Level 1 — Directors */}
                                {directors.length > 0 && (
                                    <>
                                        <div className={`grid gap-8 justify-center ${directors.length === 1 ? 'grid-cols-1' : `grid-cols-2`}`}>
                                            {directors.map(agent => (
                                                <AgentCard key={agent.id} agent={agent} tier="top" isChatting={chatAgent?.id === agent.id} onClick={() => openChat(agent)} />
                                            ))}
                                        </div>
                                        <VLine />
                                        <div className="flex justify-center">
                                            <div className="w-[80%] h-[1px] bg-gradient-to-r from-transparent via-[#00A2E0]/30 to-transparent" />
                                        </div>
                                    </>
                                )}

                                {/* Other categories as rows */}
                                {midCategories.map(catKey => {
                                    const catAgents = grouped[catKey];
                                    if (!catAgents || catAgents.length === 0) return null;
                                    return (
                                        <div key={catKey} className="mt-6">
                                            <p className="text-center text-[9px] font-mono uppercase tracking-[0.2em] text-[#00A2E0]/60 mb-4">
                                                {CATEGORY_LABELS[catKey]}
                                            </p>
                                            <div className={`grid gap-4 justify-center`}
                                                style={{ gridTemplateColumns: `repeat(${Math.min(catAgents.length, 4)}, minmax(0, 1fr))` }}>
                                                {catAgents.map(agent => (
                                                    <div key={agent.id} className="flex flex-col items-center">
                                                        <VLine h="20px" />
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
                </div>

                {/* ── LIVE OPERATIONS DASHBOARD (When no agent selected) ── */}
                {!chatAgent && (
                    <div className="w-[55%] rounded-2xl border border-white/5 flex flex-col overflow-hidden relative bg-[#0A0F1C] shadow-2xl"
                        style={{ animation: 'fadeIn 0.4s ease-out' }}
                    >
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-white/5 bg-white/[0.02] flex-shrink-0 relative overflow-hidden">
                            <div className="absolute top-0 right-10 w-32 h-32 bg-[#F7A81B]/10 blur-[40px] rounded-full pointer-events-none" />
                            <div className="flex items-center justify-between relative z-10">
                                <div>
                                    <h4 className="font-mono text-white tracking-widest text-sm flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-[#F7A81B]" /> SESSION ROUTER
                                    </h4>
                                    <p className="text-[10px] font-mono text-white/40 mt-1">Live metrics from Gateway Control Plane</p>
                                </div>
                            </div>
                            
                            {/* KPI Metrics */}
                            <div className="grid grid-cols-3 gap-4 mt-6">
                                <div className="bg-[#030712] rounded-xl border border-white/5 px-5 py-4 relative group">
                                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        Tasks Running
                                    </p>
                                    <p className="text-3xl font-mono text-emerald-400">{stats?.totals?.toolsExecuted || 0}</p>
                                </div>
                                <div className="bg-[#030712] rounded-xl border border-white/5 px-5 py-4">
                                    <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        Success Rate
                                    </p>
                                    <p className="text-3xl font-mono text-white">
                                        {stats?.totals?.toolsExecuted 
                                            ? Math.round((stats.totals.toolsSuccessful / stats.totals.toolsExecuted) * 100) 
                                            : 100}%
                                    </p>
                                </div>
                                <div className="bg-[#030712] rounded-xl border border-white/5 px-5 py-4">
                                    <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        Total Sessions
                                    </p>
                                    <p className="text-3xl font-mono text-[#00A2E0]">{stats?.totals?.totalConversations || 0}</p>
                                </div>
                            </div>
                        </div>

                        {/* Activity Stream */}
                        <div className="flex-1 overflow-y-auto px-6 py-6">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">INCIDENT STREAM</p>
                                <span className="text-[9px] font-mono text-white/20">{(stats?.recentActivity || []).length} events</span>
                            </div>
                            
                            {(!stats?.recentActivity || stats.recentActivity.length === 0) ? (
                                <div className="flex flex-col items-center justify-center h-40 text-center opacity-50">
                                    <p className="text-[11px] font-mono text-white/40">No logs yet</p>
                                    <p className="text-[9px] font-mono text-white/30 mt-1">Gateway Incidents and warnings stream here.</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {stats.recentActivity.map((act: any, i: number) => {
                                        return (
                                            <div key={i} className="flex items-start gap-4 p-3 rounded hover:bg-white/[0.02] transition-colors border-l-2 border-transparent hover:border-white/20">
                                                <div className={`mt-1.5 w-1.5 h-1.5 rounded-full ${act.success ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] font-mono text-white font-bold">
                                                            agent:{act.agentName ? act.agentName.toLowerCase() : 'system'}:run
                                                        </span>
                                                        <span className="text-[10px] font-mono text-white/30">
                                                            {new Date(act.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute:'2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-mono text-white/50 mt-1">{act.action}</p>
                                                    {act.tool && (
                                                        <span className="inline-block mt-2 text-[9px] font-mono text-[#00A2E0] bg-[#00A2E0]/10 px-1.5 py-0.5 rounded">
                                                            {act.tool}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── CHAT PANEL (Terminal view) ── */}
                {chatAgent && (
                    <div className="w-1/2 rounded-2xl border border-white/5 flex flex-col overflow-hidden bg-[#0A0F1C] relative shadow-2xl" style={{ animation: 'slideInRight 0.3s ease-out' }}>
                        {/* Header */}
                        <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-white/[0.02] flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10" style={{ background: chatAgent.avatarColor + '20' }}>
                                        <img src={avatarUrl(chatAgent.avatarSeed)} alt="" className="w-full h-full" />
                                    </div>
                                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#0A0F1C]" />
                                </div>
                                <div>
                                    <h4 className="text-[11px] font-mono font-bold text-white tracking-wider">{chatAgent.name}</h4>
                                    <p className="text-[9px] font-mono text-white/40">{chatAgent.role}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={startNewChat} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-colors" title="Clear View">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(chatAgent.id); }} className={`p-2 rounded transition-colors ${showHistory ? 'text-[#00A2E0] bg-[#00A2E0]/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`} title="Sessions">
                                    <History className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={closeChat} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded transition-colors ml-1" title="Close">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* History Overlay */}
                        {showHistory && (
                            <div className="absolute top-14 left-0 right-0 bottom-16 bg-[#030712]/95 backdrop-blur-md z-20 border-b border-white/5 flex flex-col overflow-hidden animate-fadeIn">
                                <div className="p-4 border-b border-white/5">
                                    <h4 className="text-[11px] font-mono text-white/50 tracking-widest uppercase">Past Sessions</h4>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                    {savedConversations.length === 0 ? (
                                        <p className="text-[10px] font-mono text-white/30 text-center py-6">No sessions found</p>
                                    ) : (
                                        savedConversations.map(conv => (
                                            <div key={conv.id} className="group relative flex flex-col p-3 rounded border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer" onClick={() => resumeConversation(conv)}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <h5 className="text-[11px] font-bold text-white/90 truncate mr-6">{conv.title || 'Session'}</h5>
                                                    <span className="text-[9px] font-mono text-white/30">{new Date(conv.updatedAt).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-[10px] text-white/50 truncate mb-2">{conv.lastMessage}</p>
                                                <div className="flex items-center gap-2 text-[9px] font-mono text-white/30">
                                                    <span className="bg-white/5 px-1.5 py-0.5 rounded">{conv.messageCount} ops</span>
                                                </div>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id, chatAgent.id); }}
                                                    className="absolute top-2 right-2 p-1.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-white/5"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                                    <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-1.5 ml-1">
                                        {msg.role === 'user' ? 'YOU' : chatAgent.name.toUpperCase()}
                                    </p>
                                    <div 
                                        className={`rounded-lg px-4 py-3 text-[12px] leading-relaxed break-words whitespace-pre-wrap ${
                                            msg.role === 'user' ? 'bg-[#00A2E0]/10 border border-[#00A2E0]/20 text-white/90' : 'bg-white/[0.03] border border-white/5 text-white/80'
                                        }`}
                                    >
                                        {msg.text}

                                        {/* Tools / Artifacts rendered by assistant */}
                                        {msg.toolExecuted && (
                                            <div className="mt-3 p-2.5 rounded border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-2 text-emerald-400">
                                                <span className="text-sm mt-0.5">{msg.toolExecuted.emoji || '⚡'}</span>
                                                <div>
                                                    <p className="text-[11px] font-bold">{msg.toolExecuted.label || msg.toolExecuted.action}</p>
                                                    {msg.toolExecuted.message && <p className="text-[10px] opacity-70 mt-0.5">{msg.toolExecuted.message}</p>}
                                                </div>
                                            </div>
                                        )}
                                        {msg.workflowSuggestions && msg.workflowSuggestions.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-white/5">
                                                <p className="text-[9px] font-mono text-white/40 uppercase mb-2">Automated Tasks Initiated</p>
                                                <div className="space-y-1">
                                                    {msg.workflowSuggestions.map((s, idx) => (
                                                        <div key={idx} className="flex gap-2 text-[10px] bg-black/20 p-2 rounded border border-white/5">
                                                            <span>{s.emoji}</span><span className="text-[#F7A81B] font-mono">@{s.agent}</span><span className="text-white/60">{s.action}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex gap-2 text-white/40 mr-auto mt-4 px-2">
                                    <div className="w-1.5 h-1.5 bg-[#00A2E0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-[#00A2E0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-[#00A2E0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white/[0.02] border-t border-white/5 flex-shrink-0">
                            {attachment && (
                                <div className="mb-3 px-3 py-2 bg-[#00A2E0]/10 border border-[#00A2E0]/20 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <FileText className="w-4 h-4 text-[#00A2E0] flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[11px] text-[#00A2E0] font-mono truncate">{attachment.name}</p>
                                            <p className="text-[9px] text-[#00A2E0]/60">{formatFileSize(attachment.size)}</p>
                                        </div>
                                    </div>
                                    <button onClick={removeAttachment} className="p-1 hover:bg-[#00A2E0]/20 rounded-full text-[#00A2E0]"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <button onClick={toggleRecording} className={`p-2.5 rounded flex-shrink-0 transition-colors ${isRecording ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}>
                                    {isRecording ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded bg-white/5 flex-shrink-0 text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                    <Paperclip className="w-4 h-4" />
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,.pdf,.doc,.docx" />
                                
                                <input 
                                    ref={inputRef} 
                                    type="text" 
                                    value={input} 
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder={`Command ${chatAgent.name}...`}
                                    className="flex-1 bg-white/5 border border-white/10 rounded px-4 py-2 text-[12px] font-mono text-white placeholder-white/30 focus:outline-none focus:border-[#00A2E0]/50 transition-colors"
                                />
                                
                                <button onClick={sendMessage} disabled={loading || (!input.trim() && !attachment)} className="p-2.5 bg-[#00A2E0]/20 border border-[#00A2E0]/30 text-[#00A2E0] rounded hover:bg-[#00A2E0]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Terminal className="w-4 h-4" />
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
