import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Smartphone, WifiOff, Loader, RefreshCw, Send, Users, MessageSquare, Clock, Search } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { CheckCheck, Sparkles, Paperclip, Smile, Mic, Image as ImageIcon, Copy, Check } from 'lucide-react';

const VITE_API_URL = import.meta.env.VITE_API_URL || '';
const API = VITE_API_URL ? VITE_API_URL : '/api';

interface Chat {
    id: string;
    name: string;
    isGroup: boolean;
    unreadCount: number;
    timestamp: number;
    profilePicUrl?: string;
}

interface Message {
    id: string;
    fromMe: boolean;
    body: string;
    timestamp: number;
    hasMedia: boolean;
    type: string;
    filename?: string;
    mimetype?: string;
    localUrl?: string; // Cache for immediate local preview
}

const prettySize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MediaLoader: React.FC<{ chatId: string; messageId: string; token: string | null; localUrl?: string; localType?: string; filename?: string; mimetype?: string }> = ({ chatId, messageId, token, localUrl: initialLocalUrl, localType: initialLocalType, filename, mimetype }) => {
    const [mediaUrl, setMediaUrl] = useState<string | null>(initialLocalUrl || null);
    const [mediaType, setMediaType] = useState<string>(initialLocalType || mimetype || '');
    const [mediaSize, setMediaSize] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchMedia = async () => {
        if (loading || mediaUrl) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API}/whatsapp-qr/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                setError(errData.error || 'Error de descarga');
                setLoading(false);
                return;
            }
            
            const contentType = res.headers.get('Content-Type') || '';
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            setMediaType(contentType);
            setMediaSize(blob.size);
            setMediaUrl(objectUrl);
        } catch (e) {
            setError('Error de conectividad');
        }
        setLoading(false);
    };

    // Auto-fetch on mount
    useEffect(() => {
        if (token && chatId && messageId) {
            fetchMedia();
        }
    }, [chatId, messageId, token]);

    // Cleanup object URL on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (mediaUrl) URL.revokeObjectURL(mediaUrl);
        };
    }, [mediaUrl]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-2 bg-red-50 rounded-md border border-red-100 mb-2 mt-1 gap-1 cursor-pointer hover:bg-red-100 transition-colors" onClick={fetchMedia}>
                <ImageIcon className="w-4 h-4 text-red-500 opacity-80" />
                <span className="text-[10px] text-red-600 font-medium text-center">{error}. Clic para reintentar.</span>
            </div>
        );
    }

    if (mediaUrl) {
        if (mediaType.startsWith('image/')) {
            return (
                <div className="mb-2 mt-1 rounded-md overflow-hidden bg-black/5 flex justify-center">
                    <img src={mediaUrl} alt="Media" className="max-w-full max-h-64 object-contain rounded-md cursor-pointer hover:opacity-90" onClick={() => window.open(mediaUrl)} />
                </div>
            );
        }
        if (mediaType.startsWith('audio/')) {
            return (
                <div className="mb-2 mt-1 w-full relative">
                    <audio controls className="w-full h-10" src={mediaUrl} />
                </div>
            );
        }
        if (mediaType.startsWith('video/')) {
            return (
                <div className="mb-2 mt-1 rounded-md overflow-hidden bg-black/5 flex justify-center">
                    <video controls className="max-w-full max-h-64 rounded-md" src={mediaUrl} />
                </div>
            );
        }
        const displayName = filename || 'archivo_adjunto';
        const sizeLabel = prettySize(mediaSize);
        return (
            <a
                href={mediaUrl}
                download={displayName}
                className="flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 mb-2 mt-1 transition-colors cursor-pointer text-blue-700 max-w-xs"
            >
                <Paperclip className="w-4 h-4 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate" title={displayName}>{displayName}</div>
                    <div className="text-[10px] opacity-70 truncate">⬇️ Descargar{sizeLabel ? ` · ${sizeLabel}` : ''}</div>
                </div>
            </a>
        );
    }

    return (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border mb-2 mt-1 bg-black/5 border-black/5 animate-pulse">
            <RefreshCw className="w-4 h-4 opacity-40 animate-spin text-emerald-500" />
            <span className="text-[11px] font-medium opacity-50">Cargando multimedia...</span>
        </div>
    );
};

const WhatsAppQR: React.FC = () => {
    const { token } = useAuth();
    const [status, setStatus] = useState<string>('LOADING'); // LOADING, DISCONNECTED, INITIALIZING, QR_READY, CONNECTED
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [loadingAction, setLoadingAction] = useState(false);

    // CRM States
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageText, setMessageText] = useState('');
    const [loadingChats, setLoadingChats] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);

    // State for CRM enhancements
    const [searchTerm, setSearchTerm] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filteredChats = chats.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedChat) return;

        setSending(true);
        const localUrl = URL.createObjectURL(file);
        const localType = file.type;

        const readAsBase64 = (f: File): Promise<string> => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(f);
            });
        };

        try {
            const base64Data = await readAsBase64(file);
            const res = await fetch(`${API}/whatsapp-qr/send-media`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chatId: selectedChat.id, 
                    mediaData: base64Data,
                    filename: file.name,
                    mimetype: file.type,
                    caption: '' 
                })
            });
            const data = await res.json();
            if (data.success) {
                // Pre-append with localUrl for instant feedback
                setMessages(prev => [...prev, { ...data.message, localUrl, type: localType }]);
            } else {
                alert(data.error);
                URL.revokeObjectURL(localUrl);
            }
        } catch (err) { 
            console.error(err);
            URL.revokeObjectURL(localUrl);
        }
        
        setSending(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const copyToClipboard = (text: string, msgId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(msgId);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const checkStatus = async () => {
        try {
            const res = await fetch(`${API}/whatsapp-qr/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setStatus(data.status);
            setQrCode(data.qr);
        } catch (e) {
            console.error(e);
            setStatus('DISCONNECTED');
        }
    };

    const startSession = async () => {
        setLoadingAction(true);
        setStatus('INITIALIZING');
        try {
            await fetch(`${API}/whatsapp-qr/start`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            console.error(e);
            setStatus('DISCONNECTED');
        }
        setLoadingAction(false);
    };

    const disconnectSession = async () => {
        if (!confirm('¿Estás seguro de desconectar el dispositivo local?')) return;
        setLoadingAction(true);
        try {
            await fetch(`${API}/whatsapp-qr/disconnect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setStatus('DISCONNECTED');
            setQrCode(null);
            setChats([]);
            setSelectedChat(null);
        } catch (e) {
            console.error(e);
        }
        setLoadingAction(false);
    };

    // CRM Fetchers
    const fetchChats = async () => {
        if (status !== 'CONNECTED') return;
        setLoadingChats(true);
        try {
            const res = await fetch(`${API}/whatsapp-qr/chats?_t=${Date.now()}`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
            const data = await res.json();
            if (data.success) {
                setChats(data.chats);
            }
        } catch (e) { console.error(e); }
        setLoadingChats(false);
    };

    const markChatRead = async (chatId: string, fetchedMessages: Message[]) => {
        const messageIds = fetchedMessages
            .filter(m => !m.fromMe)
            .slice(-20)
            .map(m => m.id)
            .filter(Boolean);
        if (messageIds.length === 0) return;
        try {
            await fetch(`${API}/whatsapp-qr/chats/${encodeURIComponent(chatId)}/mark-read`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageIds })
            });
            // Optimistic: reset unread badge for this chat in the sidebar.
            setChats(prev => prev.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c));
        } catch (e) {
            // Best-effort; the next chats poll will sync the real state.
            console.warn('markChatRead failed', e);
        }
    };

    const fetchMessages = async (chatId: string, silent = false) => {
        if (!silent) setLoadingMessages(true);
        try {
            const res = await fetch(`${API}/whatsapp-qr/chats/${chatId}/messages?_t=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
            const data = await res.json();
            if (data.success) {
                // Reverse to show oldest first in UI flow
                const fetchedMessages = data.messages.reverse();
                setMessages(prev => {
                    // Safe merge to ensure locally appended messages stay visible
                    // even if the WhatsApp core hasn't synced them to the fetch db yet
                    const fetchedIds = new Set(fetchedMessages.map((m: any) => m.id));
                    const missingLocals = prev.filter(m => m.fromMe && !fetchedIds.has(m.id) && (Date.now() / 1000 - m.timestamp < 60));
                    return [...fetchedMessages, ...missingLocals].sort((a, b) => a.timestamp - b.timestamp);
                });
                if (!silent) {
                    // First open of the chat — best-effort mark as read on WhatsApp's side.
                    markChatRead(chatId, fetchedMessages);
                }
            }
        } catch (e) { console.error(e); }
        if (!silent) setLoadingMessages(false);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageText.trim() || !selectedChat) return;
        
        setSending(true);
        try {
            const res = await fetch(`${API}/whatsapp-qr/send-message`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: selectedChat.id, message: messageText })
            });
            const data = await res.json();
            if (data.success) {
                setMessages(prev => [...prev, data.message]);
                setMessageText('');
            } else {
                alert(data.error);
            }
        } catch (e) { console.error(e); }
        setSending(false);
    };

    // Fetch chats every 5 seconds (suppressed log in the UI)
    useEffect(() => {
        checkStatus();
        const interval = setInterval(() => {
            checkStatus();
            if (status === 'CONNECTED') {
                fetchChats();
                if (selectedChat) {
                    fetchMessages(selectedChat.id, true);
                }
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [status, selectedChat]);

    // Initial chat load
    useEffect(() => {
        if (status === 'CONNECTED' && chats.length === 0) {
            fetchChats();
        }
    }, [status]);

    // Track unread counts and play audio notification
    const prevUnreadRef = useRef<number>(0);
    useEffect(() => {
        const currentUnread = chats.reduce((sum, c) => sum + c.unreadCount, 0);
        if (currentUnread > prevUnreadRef.current) {
            // New message arrived! Play notification.
            try {
                const audio = new Audio('/whatsapp-notify.ogg');
                audio.play().catch(e => console.log('Audio autoplay blocked by browser', e));
            } catch (e) {
                console.error("Audio error", e);
            }
        }
        prevUnreadRef.current = currentUnread;
    }, [chats]);

    // Scroll to bottom when messages load
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Compute CRM Stats
    const totalUnreadChats = chats.filter(c => c.unreadCount > 0).length;
    const resolvedChats = chats.filter(c => c.unreadCount === 0).length;

    return (
        <AdminLayout>
            <div className={`mx-auto space-y-6 ${status === 'CONNECTED' ? 'max-w-7xl' : 'max-w-4xl'}`}>
                
                {/* Header — collapsed when connected to give the inbox more vertical room */}
                {status === 'CONNECTED' ? (
                    <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 shadow-sm flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                                <QrCode className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-sm font-black text-gray-900 tracking-tight truncate">WhatsApp Web Gateway</h1>
                                <p className="text-xs text-gray-500 truncate">Línea oficial vinculada del Super Administrador</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={disconnectSession} className="text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg border border-red-100 transition-colors">
                                Cerrar Sesión
                            </button>
                            <div className="bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 border border-emerald-200 font-bold text-[11px]">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Vínculo Activo
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                                    <QrCode className="w-7 h-7" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                        WhatsApp Web Gateway
                                    </h1>
                                    <p className="text-sm text-gray-500 mt-1 max-w-xl leading-relaxed">
                                        Sistema nativo reservado para el Super Administrador. Empareja el número de WhatsApp oficial del Distrito para comunicarse masivamente con Grupos y Comunidades de Rotary por fuera de la API Meta.
                                    </p>
                                </div>
                            </div>

                            {/* Status Badge */}
                            <div className="flex-shrink-0 flex items-center gap-3">
                                {status === 'DISCONNECTED' && (
                                    <div className="bg-red-50 text-red-700 px-4 py-2 rounded-xl flex items-center gap-2 border border-red-200 font-bold text-sm shadow-sm">
                                        <WifiOff className="w-4 h-4" />
                                        Sin Conexión
                                    </div>
                                )}
                                {status === 'INITIALIZING' && (
                                    <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl flex items-center gap-2 border border-amber-200 font-bold text-sm shadow-sm">
                                        <Loader className="w-4 h-4 animate-spin" />
                                        Iniciando Servidor...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Conditional UI based on connection */}
                {status !== 'CONNECTED' ? (
                    // SETUP MODULE
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col items-center text-center">
                            <h2 className="text-lg font-bold text-gray-900 mb-6 w-full text-left">Emparejamiento de Dispositivo</h2>

                            <div className="flex-1 flex flex-col items-center justify-center w-full min-h-[300px]">
                                {status === 'LOADING' && (
                                    <Loader className="w-10 h-10 text-emerald-500 animate-spin opacity-50" />
                                )}

                                {status === 'DISCONNECTED' && (
                                    <div className="w-full flex flex-col items-center animate-fade-in">
                                        <div className="w-24 h-24 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center mb-6">
                                            <Smartphone className="w-8 h-8 text-gray-300" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-500 mb-6">El módulo nativo está inactivo. Enciende el servidor para generar un QR y conectar el número institucional asociado a los grupos distritales.</p>
                                        <button 
                                            onClick={startSession}
                                            disabled={loadingAction}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50 w-full justify-center">
                                            {loadingAction ? <Loader className="w-5 h-5 animate-spin"/> : <RefreshCw className="w-5 h-5" />}
                                            Encender Servidor WA Web
                                        </button>
                                    </div>
                                )}

                                {status === 'INITIALIZING' && (
                                    <div className="flex flex-col items-center space-y-4 animate-fade-in">
                                        <div className="w-48 h-48 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent animate-pulse" />
                                            <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin opacity-80" />
                                        </div>
                                        <p className="text-sm font-bold text-gray-600">Simulando entorno de navegador Chrome...</p>
                                        <p className="text-xs text-gray-400">Este proceso puede tardar hasta 40 segundos.</p>
                                    </div>
                                )}

                                {status === 'QR_READY' && qrCode && (
                                    <div className="flex flex-col items-center animate-fade-in">
                                        <div className="bg-white p-3 rounded-2xl border-4 border-gray-100 shadow-xl mb-6 relative">
                                            <div className="absolute top-0 left-0 w-full h-[2px] bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.5)] animate-scan" style={{ animation: 'scan 2.5s infinite linear' }} />
                                            <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 object-contain" />
                                        </div>
                                        <h3 className="font-black text-gray-900 mb-2">Escanea el código</h3>
                                        <p className="text-sm text-gray-500 max-w-[280px]">
                                            1. Abre WhatsApp en tu celular<br/>
                                            2. Toca Menú o Configuración<br/>
                                            3. Toca Dispositivos vinculados<br/>
                                            4. Apunta la cámara a esta pantalla
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6 flex flex-col">
                            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 flex-1 shadow-lg text-white">
                                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-emerald-400" />
                                    Gestión de Comunidades
                                </h3>
                                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                                    La principal ventaja de conectar este Gateway alterno (QR), es que a diferencia de Cloud API, tienes acceso a <strong>funcionalidades nativas de usuario</strong>. 
                                    Puedes delegarle a la Agente <em>Camila</em> que anuncie los comunicados dentro de Grupos Rotarios en los cuales el teléfono esté agregado.
                                </p>
                                <div className="bg-black/50 border border-gray-800 rounded-xl p-5 mb-6">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Capacidades Desbloqueadas</p>
                                    <ul className="space-y-3">
                                        <li className="flex items-start gap-3">
                                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <Send className="w-3 h-3 text-emerald-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-200">Broadcast a Grupos Locales</p>
                                                <p className="text-xs text-gray-500">Sin plantillas. Comunícate en tiempo real con distritos.</p>
                                            </div>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    // CRM INBOX MODULE
                    <div className="flex h-[700px] border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white animate-fade-in">
                        
                        {/* Sidebar */}
                        <div className="w-full max-w-[340px] border-r border-gray-200 flex flex-col bg-gray-50/50">
                            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
                                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-emerald-600" /> Inbox
                                </h2>
                                <button onClick={fetchChats} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
                                    <RefreshCw className={`w-4 h-4 ${loadingChats ? 'animate-spin' : ''}`} />
                                </button>
                            </div>

                            {/* CRM Metrics Grid */}
                            <div className="px-3 py-3 bg-white grid grid-cols-2 gap-2.5 border-b border-gray-100">
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 flex flex-col items-center justify-center text-center">
                                    <div className="flex items-center gap-1.5 text-emerald-600 mb-0.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-tight">Pendientes</span>
                                    </div>
                                    <span className="text-xl font-black text-emerald-700 leading-none">{totalUnreadChats}</span>
                                </div>
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 flex flex-col items-center justify-center text-center">
                                    <div className="flex items-center gap-1.5 text-blue-600 mb-0.5">
                                        <CheckCheck className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-tight">Gestionados</span>
                                    </div>
                                    <span className="text-xl font-black text-blue-700 leading-none">{resolvedChats}</span>
                                </div>
                            </div>

                            <div className="p-3 border-b border-gray-100 bg-white">
                                <div className="relative">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input 
                                        type="text" 
                                        placeholder="Buscar chat o grupo..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-gray-100 border-none rounded-xl py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
                                    />
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto">
                                {loadingChats && chats.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                        <Loader className="w-6 h-6 animate-spin mb-2" />
                                        <span className="text-xs">Sincronizando chats...</span>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {filteredChats.map(chat => (
                                            <button 
                                                key={chat.id} 
                                                onClick={() => { setMessages([]); setSelectedChat(chat); fetchMessages(chat.id); }}
                                                className={`w-full text-left p-4 hover:bg-gray-50 flex items-center gap-3 transition-colors ${selectedChat?.id === chat.id ? 'bg-emerald-50 hover:bg-emerald-50' : ''}`}
                                            >
                                                <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-white shadow-sm ${chat.isGroup ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                                                    <img 
                                                        src={`${API}/whatsapp-qr/chats/${encodeURIComponent(chat.id)}/image?token=${token}`} 
                                                        alt={chat.name} 
                                                        className="w-full h-full object-cover" 
                                                        onError={(e) => {
                                                            const target = e.target as HTMLImageElement;
                                                            target.style.display = 'none';
                                                            if (target.parentElement) {
                                                                target.parentElement.innerHTML = chat.isGroup ? `<div class="w-full h-full flex items-center justify-center">G</div>` : `<div class="w-full h-full flex items-center justify-center">${chat.name.substring(0, 2).toUpperCase()}</div>`;
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-bold text-gray-900 truncate pr-2 text-sm">{chat.name}</span>
                                                        <span className="text-[10px] text-gray-400 font-medium">{new Date(chat.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-gray-500 truncate min-h-[16px]">{chat.isGroup ? 'Grupo Distrital' : 'Contacto Directo'}</span>
                                                        {chat.unreadCount > 0 && (
                                                            <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                                                                {chat.unreadCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Main Chat Area */}
                        {selectedChat ? (
                            <div className="flex-1 flex flex-row relative min-w-0 h-full">
                                {/* --- Chat Interaction Column --- */}
                                <div className="flex-1 flex flex-col bg-white relative min-w-0 h-full">
                                    <div className="h-[68px] bg-white border-b border-gray-200 p-4 flex items-center gap-3 shadow-sm z-10 flex-shrink-0">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${selectedChat.isGroup ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                                           {selectedChat.isGroup ? <Users className="w-5 h-5" /> : selectedChat.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 leading-tight">{selectedChat.name}</h3>
                                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                {selectedChat.isGroup ? 'Grupo de WhatsApp' : 'Cuenta Personal'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 space-y-4 relative w-full bg-[#E5DDD5] bg-[url('https://upload.wikimedia.org/wikipedia/commons/8/82/WhatsApp_background.png')] bg-opacity-5">
                                        {loadingMessages ? (
                                            <div className="absolute inset-0 flex items-center justify-center bg-[#E5DDD5]/80 z-10">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader className="w-8 h-8 animate-spin text-emerald-600" />
                                                    <span className="text-emerald-700 font-medium text-sm">Sincronizando historial...</span>
                                                </div>
                                            </div>
                                        ) : messages.length === 0 ? (
                                            <div className="flex-1 h-full flex flex-col items-center justify-center text-center opacity-70">
                                                <div className="bg-[#E1F3FB] p-4 rounded-full mb-4">
                                                    <Clock className="w-8 h-8 text-blue-500" />
                                                </div>
                                                <h4 className="text-gray-700 font-bold mb-1">Sin historial local</h4>
                                                <p className="text-xs text-gray-500 max-w-xs">Los mensajes antiguos pueden tardar en sincronizarse o no estar disponibles en esta instancia del servidor. Los mensajes nuevos aparecerán aquí.</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-center mb-6">
                                                    <span className="bg-[#E1F3FB] text-gray-600 text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm border border-[#D5EBF5]">
                                                        Protegido con encriptación nativa
                                                    </span>
                                                </div>
                                                {messages.map((msg, i) => (
                                                    <div key={msg.id || i} className={`w-full flex ${msg.fromMe ? 'justify-end' : 'justify-start'} group`}>
                                                        <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm relative text-sm ${
                                                            msg.fromMe ? 'bg-[#D9FDD3] text-gray-900 rounded-tr-none' : 'bg-white text-gray-900 rounded-tl-none'
                                                        }`}>
                                                            {msg.hasMedia && selectedChat && (
                                                                <MediaLoader chatId={selectedChat.id} messageId={msg.id} token={token} localUrl={msg.localUrl} localType={msg.type} filename={msg.filename} mimetype={msg.mimetype} />
                                                            )}
                                                            <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                                                            <div className={`text-[10px] text-right mt-1 opacity-60 flex items-center justify-end gap-1 ${msg.fromMe ? 'text-gray-600' : 'text-gray-400'}`}>
                                                                <button 
                                                                    onClick={() => copyToClipboard(msg.body, msg.id || i.toString())}
                                                                    className="mr-auto opacity-0 group-hover:opacity-100 transition-opacity hover:text-emerald-600"
                                                                    title="Copiar mensaje"
                                                                >
                                                                    {copiedId === (msg.id || i.toString()) ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                                </button>
                                                                {new Date(msg.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                                {msg.fromMe && <CheckCheck className="w-3 h-3 text-blue-500" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                <div ref={messagesEndRef} />
                                            </>
                                        )}
                                    </div>

                                    {/* Tools & AI Bar */}
                                    <div className="px-4 py-2 bg-[#F0F2F5] border-t border-gray-200 flex justify-between items-center text-gray-500 relative">
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="file" 
                                                ref={fileInputRef} 
                                                className="hidden" 
                                                onChange={handleFileUpload}
                                                accept="image/*,video/*,application/pdf"
                                            />
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="p-2 hover:bg-gray-200 rounded-full transition-colors" title="Adjuntar Archivo"
                                            >
                                                <Paperclip className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="p-2 hover:bg-gray-200 rounded-full transition-colors" title="Adjuntar Imagen"
                                            >
                                                <ImageIcon className="w-5 h-5" />
                                            </button>
                                            <div className="relative">
                                                <button 
                                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                    className={`p-2 hover:bg-gray-200 rounded-full transition-colors ${showEmojiPicker ? 'bg-gray-200 text-emerald-600' : ''}`} 
                                                    title="Añadir Emoji"
                                                >
                                                    <Smile className="w-5 h-5" />
                                                </button>
                                                {showEmojiPicker && (
                                                    <div className="absolute bottom-full left-0 mb-2 bg-white shadow-xl border border-gray-200 rounded-2xl p-3 z-50 w-[280px] animate-in fade-in slide-in-from-bottom-2">
                                                        <div className="grid grid-cols-8 gap-1">
                                                            {['🤝', '😊', '💡', '✅', '🚀', '🌟', '📍', '🙌', '🙏', '❤️', '🤔', '🔥', '⚙️', '📈', '✨', '🌍'].map(emoji => (
                                                                <button 
                                                                    key={emoji}
                                                                    onClick={() => {
                                                                        setMessageText(prev => prev + emoji);
                                                                        setShowEmojiPicker(false);
                                                                    }}
                                                                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg text-xl"
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button 
                                            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-full flex flex-row items-center gap-2 shadow-sm transition-all"
                                            onClick={() => {
                                                setMessageText('Generando respuesta sugerida por IA basándose en el historial de chat con el Agente Camila...');
                                            }}
                                        >
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Sugerir con Subagente
                                        </button>
                                    </div>

                                    {/* Message Input */}
                                    <div className="p-4 bg-[#F0F2F5] flex gap-2 items-end">
                                        <textarea 
                                            value={messageText}
                                            onChange={e => setMessageText(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage(e);
                                                }
                                            }}
                                            placeholder="Escribe un mensaje aquí..." 
                                            className="flex-1 max-h-32 min-h-[44px] bg-white border-transparent rounded-xl focus:ring-0 resize-none py-3 px-4 text-sm shadow-sm"
                                            rows={1}
                                        />
                                        <button className="p-3 bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0">
                                            <Mic className="w-5 h-5" />
                                        </button>
                                        <button 
                                            onClick={handleSendMessage}
                                            disabled={!messageText.trim() || sending}
                                            className="bg-emerald-600 text-white p-3 rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-50 flex-shrink-0 shadow-sm disabled:cursor-not-allowed"
                                        >
                                            {sending ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>
                                
                                {/* --- Archetype Profile Sidebar for AI Context --- */}
                                <div className="w-[320px] bg-white border-l border-gray-200 hidden lg:flex flex-col flex-shrink-0 h-full animate-fade-in">
                                    <div className="h-[68px] border-b border-gray-100 flex items-center px-4 flex-shrink-0">
                                        <h3 className="font-bold text-gray-900">Arquetipo Rotario</h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-5">
                                        <div className="flex flex-col items-center text-center">
                                            <div className={`w-20 h-20 rounded-full overflow-hidden flex items-center justify-center font-bold text-white shadow-sm mb-4 ${selectedChat.isGroup ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                                                <img 
                                                    src={`${API}/whatsapp-qr/chats/${encodeURIComponent(selectedChat.id)}/image?token=${token}`} 
                                                    alt={selectedChat.name} 
                                                    className="w-full h-full object-cover" 
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.style.display = 'none';
                                                        if (target.parentElement) {
                                                            target.parentElement.innerHTML = selectedChat.isGroup ? `<div class="w-full h-full flex items-center justify-center">G</div>` : `<div class="w-full h-full flex items-center justify-center text-3xl">${selectedChat.name.substring(0, 2).toUpperCase()}</div>`;
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <h4 className="font-bold text-gray-900 text-lg mb-1 leading-tight">{selectedChat.name}</h4>
                                            <p className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md mb-2">
                                                {selectedChat.isGroup ? 'Comunidad Distrital' : 'Socio Activo'}
                                            </p>
                                            <p className="text-xs text-gray-400 font-mono mb-4">{selectedChat.id.split('@')[0]}</p>
                                        </div>

                                        <div className="pt-4 border-t border-gray-100 space-y-4">
                                            <div>
                                                <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Contexto para el Agente</p>
                                                <p className="text-[13px] text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200 shadow-sm leading-relaxed">
                                                    Identificador base. Usado por la IA para cruzar datos con el CRM y formular respuestas personalizadas con el protocolo institucional.
                                                </p>
                                            </div>
                                            
                                            <div className="mt-4 px-3 py-2 bg-blue-50/50 rounded-lg border border-blue-100/50">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-semibold text-gray-600">Distrito Asignado</span>
                                                    <span className="text-xs font-bold text-blue-700">4281</span>
                                                </div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-semibold text-gray-600">Club Rotario</span>
                                                    <span className="text-xs font-bold text-gray-800">Pendiente Mapeo</span>
                                                </div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-semibold text-gray-600">Cargo Presencial</span>
                                                    <span className="text-xs font-medium text-gray-500">-</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-semibold text-gray-600">Score de Impacto</span>
                                                    <span className="text-xs font-bold text-emerald-600">Calculando...</span>
                                                </div>
                                            </div>
                                            <button className="w-full py-2.5 mt-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                                                Vincular a CRM Central
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center bg-[#F8F9FA] text-gray-400">
                                <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                                    <MessageSquare className="w-12 h-12 text-gray-300" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-600 mb-2">WhatsApp Web CRM</h3>
                                <p className="max-w-xs text-center text-sm">Selecciona un grupo o chat de la barra lateral para ver los mensajes y responder.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan {
                    animation: scan 2.5s cubic-bezier(0.53, 0.21, 0.29, 0.67) infinite;
                }
            `}} />
        </AdminLayout>
    );
};

export default WhatsAppQR;
