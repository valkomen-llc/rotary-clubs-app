import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Smartphone, Wifi, WifiOff, LogOut, Loader, RefreshCw, Send, Users, MessageSquare, Clock, Search } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';

const VITE_API_URL = import.meta.env.VITE_API_URL || '';
// In production (Vercel), we must use /vps for the QR gateway to trigger vercel.json rewrites 
// bypassing Vercel's strict /api/ serverless function filesystem lock.
const API = VITE_API_URL ? VITE_API_URL : (import.meta.env.PROD ? '/vps' : '/api');

interface Chat {
    id: string;
    name: string;
    isGroup: boolean;
    unreadCount: number;
    timestamp: number;
}

interface Message {
    id: string;
    fromMe: boolean;
    body: string;
    timestamp: number;
    hasMedia: boolean;
    type: string;
}

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

    const messagesEndRef = useRef<HTMLDivElement>(null);

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
            const res = await fetch(`${API}/whatsapp-qr/chats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setChats(data.chats);
            }
        } catch (e) { console.error(e); }
        setLoadingChats(false);
    };

    const fetchMessages = async (chatId: string) => {
        setLoadingMessages(true);
        try {
            const res = await fetch(`${API}/whatsapp-qr/chats/${chatId}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                // Reverse to show oldest first in UI flow
                setMessages(data.messages.reverse());
            }
        } catch (e) { console.error(e); }
        setLoadingMessages(false);
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

    // Core Polling logic
    useEffect(() => {
        checkStatus();
        const interval = setInterval(() => {
            checkStatus();
            // If connected, sync chats and current messages silently
            if (status === 'CONNECTED') {
                fetchChats();
                if (selectedChat) {
                    fetchMessages(selectedChat.id);
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

    // Scroll to bottom when messages load
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);


    return (
        <AdminLayout>
            <div className={`mx-auto space-y-6 ${status === 'CONNECTED' ? 'max-w-7xl' : 'max-w-4xl'}`}>
                
                {/* Header */}
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
                            {status === 'CONNECTED' && (
                                <button onClick={disconnectSession} className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100 transition-colors">
                                    Cerrar Sesión
                                </button>
                            )}
                            {status === 'CONNECTED' && (
                                <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-200 font-bold text-sm shadow-sm">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Vínculo Activo
                                </div>
                            )}
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
                            <div className="p-3 border-b border-gray-100 bg-white">
                                <div className="relative">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input type="text" placeholder="Buscar chat o grupo..." className="w-full bg-gray-100 border-none rounded-xl py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
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
                                        {chats.map(chat => (
                                            <button 
                                                key={chat.id} 
                                                onClick={() => { setSelectedChat(chat); fetchMessages(chat.id); }}
                                                className={`w-full text-left p-4 hover:bg-gray-50 flex items-center gap-3 transition-colors ${selectedChat?.id === chat.id ? 'bg-emerald-50 hover:bg-emerald-50' : ''}`}
                                            >
                                                <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white shadow-sm ${chat.isGroup ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                                                    {chat.isGroup ? <Users className="w-5 h-5" /> : chat.name.substring(0, 2).toUpperCase()}
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
                            <div className="flex-1 flex flex-col bg-[url('https://upload.wikimedia.org/wikipedia/commons/8/82/WhatsApp_background.png')] bg-opacity-5">
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

                                <div className="flex-1 overflow-y-auto p-4 space-y-4 relative w-full bg-[#E5DDD5]">
                                    {loadingMessages && messages.length === 0 ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#E5DDD5]/80 z-10">
                                            <Loader className="w-8 h-8 animate-spin text-emerald-600" />
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-center mb-6">
                                                <span className="bg-[#E1F3FB] text-gray-600 text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm border border-[#D5EBF5]">
                                                    Protegido con encriptación nativa
                                                </span>
                                            </div>
                                            {messages.map((msg, i) => (
                                                <div key={msg.id || i} className={`w-full flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm relative text-sm ${
                                                        msg.fromMe ? 'bg-[#D9FDD3] text-gray-900 rounded-tr-none' : 'bg-white text-gray-900 rounded-tl-none'
                                                    }`}>
                                                        {msg.hasMedia && <div className="text-xs text-gray-500 italic mb-1">📷 Archivo multimedia adjunto</div>}
                                                        <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                                                        <div className={`text-[10px] text-right mt-1 opacity-60 flex items-center justify-end gap-1 ${msg.fromMe ? 'text-gray-600' : 'text-gray-400'}`}>
                                                            {new Date(msg.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            {msg.fromMe && <CheckChecks className="w-3 h-3 text-blue-500" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div ref={messagesEndRef} />
                                        </>
                                    )}
                                </div>

                                {/* Message Input */}
                                <div className="p-4 bg-[#F0F2F5] border-t border-gray-200 flex gap-2 items-end">
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
                                    <button 
                                        onClick={handleSendMessage}
                                        disabled={!messageText.trim() || sending}
                                        className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex-shrink-0 shadow-sm"
                                    >
                                        {sending ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                    </button>
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

// Extracted from lucide internally
const CheckChecks = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m18 7-9.5 9.5-3-3" />
        <path d="m22 7-6.5 6.5" />
        <path d="M12 11.5 13.5 10" />
    </svg>
);

export default WhatsAppQR;
