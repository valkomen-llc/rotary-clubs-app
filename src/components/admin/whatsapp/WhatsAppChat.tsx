import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Search, Send, Phone, MoreVertical, User, X, Tag, MessageCircle, ChevronLeft, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface Contact {
    id: string; name: string; phone: string; email?: string;
    tags?: string[]; status: string; lists?: any[];
    metadata?: any; createdAt: string;
}
interface Message {
    id: string; bodyText?: string; templateName?: string;
    status: string; sentAt?: string; deliveredAt?: string;
    readAt?: string; createdAt: string; direction?: string;
}

const WhatsAppChat: React.FC = () => {
    const { token } = useAuth();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [chatNote, setChatNote] = useState('');
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [sending, setSending] = useState(false);
    const [mediaUrl, setMediaUrl] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => { fetchContacts(); fetchTemplates(); }, []);
    useEffect(() => {
        if (!searchQuery.trim()) { setFilteredContacts(contacts); return; }
        const q = searchQuery.toLowerCase();
        setFilteredContacts(contacts.filter(c =>
            c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email || '').toLowerCase().includes(q)
        ));
    }, [searchQuery, contacts]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/whatsapp/contacts?limit=500`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setContacts(data.contacts || []);
        } catch { } finally { setLoading(false); }
    };

    const fetchMessages = async (contactId: string) => {
        setLoadingMsgs(true);
        try {
            const res = await fetch(`${API}/whatsapp/contacts/${contactId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setMessages(data.messages || []);
            } else {
                setMessages([]);
            }
        } catch { setMessages([]); }
        finally { setLoadingMsgs(false); }
    };

    const selectContact = (contact: Contact) => {
        setSelectedContact(contact);
        fetchMessages(contact.id);
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    };

    const getStatusColor = (contact: Contact) => {
        if (contact.status === 'opted_out') return 'bg-red-500';
        return 'bg-green-500';
    };

    const formatTime = (date: string) => {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        if (diffDays === 1) return 'Ayer';
        if (diffDays < 7) return d.toLocaleDateString('es-CO', { weekday: 'short' });
        return d.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
    };

    const formatFullDate = (date: string) => {
        if (!date) return '';
        return new Date(date).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const fetchTemplates = async () => {
        try {
            const res = await fetch(`${API}/whatsapp/templates`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                const tpls = Array.isArray(data) ? data : (data.templates || []);
                setTemplates(tpls.filter((t: any) => t.status === 'approved'));
            }
        } catch { }
    };

    const handleSendTemplate = async (template: any) => {
        if (!selectedContact || sending) return;
        const needsMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType);
        if (needsMedia && !mediaUrl.trim()) {
            toast.error(`Esta plantilla requiere una URL de ${template.headerType === 'IMAGE' ? 'imagen' : template.headerType === 'VIDEO' ? 'video' : 'documento'}`);
            return;
        }
        setSending(true);
        try {
            const vars: any = {};
            if (mediaUrl.trim()) vars.mediaUrl = mediaUrl.trim();
            const res = await fetch(`${API}/whatsapp/contacts/${selectedContact.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ templateId: template.id, vars }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setMessages(prev => [...prev, data.message]);
                setSelectedTemplate(null);
                setMediaUrl('');
                toast.success(`Plantilla "${template.displayName || template.name}" enviada a ${selectedContact.name}`);
            } else {
                toast.error(data.error || 'Error al enviar');
            }
        } catch (err: any) {
            toast.error('Error de conexión al enviar mensaje');
        } finally { setSending(false); }
    };

    const tagColors: { [key: string]: string } = {
        'vip': 'bg-yellow-100 text-yellow-700 border-yellow-200',
        'socio': 'bg-blue-100 text-blue-700 border-blue-200',
        'rotary': 'bg-purple-100 text-purple-700 border-purple-200',
        'default': 'bg-gray-100 text-gray-600 border-gray-200',
    };
    const getTagStyle = (tag: string) => tagColors[tag.toLowerCase()] || tagColors.default;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
            <div className="flex h-full">
                {/* ═══ LEFT: Conversations List ═══ */}
                <div className={`w-full md:w-80 lg:w-96 border-r border-gray-200 flex flex-col bg-white ${selectedContact ? 'hidden md:flex' : 'flex'}`}>
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
                        <h3 className="font-black text-green-900 text-lg">Chats</h3>
                        <div className="relative mt-2">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Buscar contacto..."
                                className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:border-green-500" />
                        </div>
                    </div>

                    {/* Contact List */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                        ) : filteredContacts.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-bold">Sin conversaciones</p>
                            </div>
                        ) : filteredContacts.map(contact => (
                            <button key={contact.id} onClick={() => selectContact(contact)}
                                className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 ${selectedContact?.id === contact.id ? 'bg-green-50/60 border-l-2 border-l-green-500' : ''}`}>
                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                        {getInitials(contact.name)}
                                    </div>
                                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(contact)}`} />
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className="font-bold text-gray-900 text-sm truncate">{contact.name}</p>
                                        <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{formatTime(contact.createdAt)}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">{contact.phone}</p>
                                    {contact.tags && contact.tags.length > 0 && (
                                        <div className="flex gap-1 mt-1.5 flex-wrap">
                                            {contact.tags.slice(0, 2).map(tag => (
                                                <span key={tag} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${getTagStyle(tag)}`}>
                                                    {tag}
                                                </span>
                                            ))}
                                            {contact.tags.length > 2 && <span className="text-[9px] text-gray-400">+{contact.tags.length - 2}</span>}
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Footer Stats */}
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex justify-between">
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{filteredContacts.length} contactos</span>
                    </div>
                </div>

                {/* ═══ CENTER: Chat Area ═══ */}
                <div className={`flex-1 flex flex-col ${!selectedContact ? 'hidden md:flex' : 'flex'}`}>
                    {selectedContact ? (
                        <>
                            {/* Chat Header */}
                            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-white">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setSelectedContact(null)} className="md:hidden text-gray-400 mr-1">
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                                        {getInitials(selectedContact.name)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 text-sm">{selectedContact.name}</p>
                                        <p className="text-xs text-gray-500">{selectedContact.phone}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><Phone className="w-4 h-4" /></button>
                                    <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><Search className="w-4 h-4" /></button>
                                    <button onClick={() => setShowContactInfo(!showContactInfo)}
                                        className={`p-2 rounded-lg transition-colors ${showContactInfo ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-400'}`}>
                                        <User className="w-4 h-4" />
                                    </button>
                                    <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><MoreVertical className="w-4 h-4" /></button>
                                </div>
                            </div>

                            {/* Messages Area */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%2310b981\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
                                {loadingMsgs ? (
                                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                                ) : messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-center">
                                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                            <MessageCircle className="w-10 h-10 text-green-400" />
                                        </div>
                                        <p className="font-bold text-gray-600">Sin mensajes</p>
                                        <p className="text-sm text-gray-400 mt-1 max-w-xs">
                                            Envía tu primera campaña a {selectedContact.name} desde la sección de Campañas
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {messages.map((msg, idx) => {
                                            const isOutgoing = msg.direction !== 'incoming';
                                            const showDate = idx === 0 || formatFullDate(msg.createdAt) !== formatFullDate(messages[idx - 1].createdAt);
                                            return (
                                                <React.Fragment key={msg.id}>
                                                    {showDate && (
                                                        <div className="flex justify-center my-4">
                                                            <span className="bg-white/80 backdrop-blur px-4 py-1 rounded-full text-xs font-bold text-gray-500 shadow-sm border border-gray-100">
                                                                {formatFullDate(msg.createdAt)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${isOutgoing
                                                            ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-br-md'
                                                            : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'}`}>
                                                            {msg.templateName && (
                                                                <p className={`text-[10px] font-bold mb-1 ${isOutgoing ? 'text-green-200' : 'text-green-600'}`}>
                                                                    📋 {msg.templateName}
                                                                </p>
                                                            )}
                                                            <p className="text-sm leading-relaxed">{msg.bodyText || `[Template: ${msg.templateName}]`}</p>
                                                            <div className={`flex items-center gap-1.5 mt-1 ${isOutgoing ? 'justify-end' : ''}`}>
                                                                <span className={`text-[10px] ${isOutgoing ? 'text-green-200' : 'text-gray-400'}`}>
                                                                    {formatTime(msg.sentAt || msg.createdAt)}
                                                                </span>
                                                                {isOutgoing && (
                                                                    <span className="text-[10px]">
                                                                        {msg.readAt ? '✓✓' : msg.deliveredAt ? '✓✓' : msg.status === 'failed' ? '✗' : '✓'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })}
                                        <div ref={messagesEndRef} />
                                    </>
                                )}
                            </div>

                            {/* Template Select + Send */}
                            <div className="border-t border-gray-100 bg-white px-4 py-3">
                                {templates.length > 0 ? (
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                                            <FileText className="w-3.5 h-3.5" /> Enviar plantilla a {selectedContact.name}
                                        </p>
                                        <div className="flex gap-2">
                                            <select
                                                value={selectedTemplate?.id || ''}
                                                onChange={(e) => {
                                                    const t = templates.find((tpl: any) => tpl.id === e.target.value);
                                                    setSelectedTemplate(t || null);
                                                    setMediaUrl('');
                                                }}
                                                className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                                            >
                                                <option value="">— Seleccionar plantilla —</option>
                                                {templates.map((t: any) => (
                                                    <option key={t.id} value={t.id}>
                                                        {t.displayName || t.name}
                                                        {t.headerType && ['IMAGE','VIDEO','DOCUMENT'].includes(t.headerType) ? ` 📎 ${t.headerType}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    if (!selectedTemplate) {
                                                        toast.error('Selecciona una plantilla primero');
                                                        return;
                                                    }
                                                    handleSendTemplate(selectedTemplate);
                                                }}
                                                disabled={sending || !selectedTemplate}
                                                className="px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-colors"
                                            >
                                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                Enviar
                                            </button>
                                        </div>
                                        {selectedTemplate && ['IMAGE','VIDEO','DOCUMENT'].includes(selectedTemplate.headerType) && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-1">
                                                <p className="text-[11px] font-bold text-amber-700 mb-1.5">
                                                    📎 URL del {selectedTemplate.headerType === 'IMAGE' ? 'imagen' : selectedTemplate.headerType === 'VIDEO' ? 'video' : 'documento'} (opcional)
                                                </p>
                                                <input
                                                    value={mediaUrl}
                                                    onChange={e => setMediaUrl(e.target.value)}
                                                    placeholder={selectedTemplate.headerType === 'IMAGE' ? 'https://ejemplo.com/imagen.jpg' : selectedTemplate.headerType === 'VIDEO' ? 'https://ejemplo.com/video.mp4' : 'https://ejemplo.com/doc.pdf'}
                                                    className="w-full px-3 py-2 rounded-lg border border-amber-300 text-sm outline-none focus:border-amber-500 bg-white"
                                                />
                                                <p className="text-[10px] text-amber-500 mt-1">Opcional: si dejas vacío se usa el archivo original del template. Si lo proporcionas, usa una URL pública accesible.</p>
                                            </div>
                                        )}
                                        {selectedTemplate && (
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-1">
                                                <p className="text-xs font-bold text-green-700 mb-1">📋 {selectedTemplate.displayName || selectedTemplate.name}</p>
                                                <p className="text-xs text-green-600">{selectedTemplate.bodyText || 'Sin vista previa del contenido'}</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 text-gray-400">
                                        <FileText className="w-5 h-5" />
                                        <p className="text-sm">No hay plantillas aprobadas. Crea una en la sección Templates.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        /* Empty State */
                        <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-green-50/30 to-white">
                            <div className="w-24 h-24 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mb-6">
                                <MessageCircle className="w-12 h-12 text-green-400" />
                            </div>
                            <h3 className="text-xl font-black text-gray-800 mb-2">WhatsApp Business</h3>
                            <p className="text-gray-500 text-sm text-center max-w-sm">
                                Selecciona un contacto para ver su historial de mensajes y gestionar la conversación
                            </p>
                        </div>
                    )}
                </div>

                {/* ═══ RIGHT: Contact Info Panel ═══ */}
                {showContactInfo && selectedContact && (
                    <div className="w-80 border-l border-gray-200 bg-white flex flex-col overflow-y-auto hidden lg:flex">
                        {/* Header */}
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h4 className="font-bold text-gray-900 text-sm">Información del Contacto</h4>
                            <button onClick={() => setShowContactInfo(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Contact Card */}
                        <div className="p-6 flex flex-col items-center border-b border-gray-100">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-black text-2xl shadow-lg mb-3">
                                {getInitials(selectedContact.name)}
                            </div>
                            <p className="font-black text-gray-900 text-lg">{selectedContact.name}</p>
                            <p className="text-sm text-gray-500 mt-0.5">{selectedContact.phone}</p>
                            {selectedContact.email && <p className="text-xs text-gray-400 mt-0.5">{selectedContact.email}</p>}
                        </div>

                        {/* Tags */}
                        <div className="p-4 border-b border-gray-100">
                            <div className="flex items-center gap-2 mb-3">
                                <Tag className="w-4 h-4 text-gray-400" />
                                <p className="text-xs font-bold text-gray-500 uppercase">Etiquetas</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {selectedContact.tags && selectedContact.tags.length > 0 ? (
                                    selectedContact.tags.map(tag => (
                                        <span key={tag} className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getTagStyle(tag)}`}>
                                            {tag}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-xs text-gray-400">Sin etiquetas</span>
                                )}
                            </div>
                        </div>

                        {/* Lists */}
                        {selectedContact.lists && selectedContact.lists.length > 0 && (
                            <div className="p-4 border-b border-gray-100">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Listas</p>
                                <div className="space-y-1.5">
                                    {selectedContact.lists.map((l: any) => (
                                        <div key={l.id} className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                                            <span className="text-sm text-gray-700">{l.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        <div className="p-4 border-b border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-gray-500 uppercase">Notas del chat</p>
                                <button className="text-[10px] font-bold text-green-600 hover:text-green-700">💾 Guardar</button>
                            </div>
                            <textarea value={chatNote} onChange={e => setChatNote(e.target.value)}
                                placeholder="Agrega tus notas aquí..."
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500 resize-none"
                                rows={3} />
                        </div>

                        {/* Contact Details */}
                        <div className="p-4">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Detalles</p>
                            <div className="space-y-2.5">
                                <div className="flex justify-between">
                                    <span className="text-xs text-gray-400">Estado</span>
                                    <span className={`text-xs font-bold ${selectedContact.status === 'active' ? 'text-green-600' : 'text-red-500'}`}>
                                        {selectedContact.status === 'active' ? 'Activo' : 'Opt-out'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs text-gray-400">Registrado</span>
                                    <span className="text-xs text-gray-600">{formatFullDate(selectedContact.createdAt)}</span>
                                </div>
                                {selectedContact.metadata && Object.entries(selectedContact.metadata).map(([k, v]) => (
                                    <div key={k} className="flex justify-between">
                                        <span className="text-xs text-gray-400 capitalize">{k.replace(/_/g, ' ')}</span>
                                        <span className="text-xs text-gray-600">{String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WhatsAppChat;
