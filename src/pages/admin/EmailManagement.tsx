import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Mail, Inbox, Send, Archive, Trash2, Star, 
    Search, Plus, Filter, MoreHorizontal, 
    RefreshCw, ChevronLeft, ChevronRight,
    AtSign, Settings, ShieldCheck, ExternalLink,
    Paperclip, Reply, Forward, User, Globe, X,
    CheckCircle2, AlertTriangle, Database, ArrowRight,
    Lock, Key, Zap, SendHorizontal, Image as ImageIcon,
    Smile
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';

interface EmailAccount {
    id: string;
    email: string;
    label: string;
    isPrimary: boolean;
    provider: 'platform' | 'custom';
}

interface EmailMessage {
    id: string;
    from: { name: string; email: string };
    to: string;
    subject: string;
    preview: string;
    body: string;
    timestamp: string;
    read: boolean;
    starred: boolean;
    hasAttachments: boolean;
    folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'starred';
}

const EmailManagement: React.FC = () => {
    const { user, token } = useAuth();
    const { club } = useClub();
    
    // Robust domain detection
    const PLATFORM_HOSTS = ['clubplatform.org', 'www.clubplatform.org', 'app.clubplatform.org', 'localhost'];
    const currentHost = window.location.hostname;
    const isOnClubDomain = !PLATFORM_HOSTS.includes(currentHost);
    const rawClubDomain = isOnClubDomain
        ? currentHost
        : ((club as any)?.domain || ((club as any)?.subdomain ? `${(club as any).subdomain}.clubplatform.org` : 'rotary.org'));
    // El dominio verificado en Resend es el apex (sin "www."). Normalizamos para que las cuentas
    // y el remitente usen jaquematealapolio.org y no www.jaquematealapolio.org.
    const clubDomain = (rawClubDomain || '').replace(/^www\./i, '');

    // State
    const [selectedFolder, setSelectedFolder] = useState<string>('inbox');
    const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
    const [activeTab, setActiveTab] = useState<'inbox' | 'accounts'>('inbox');
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showComposeModal, setShowComposeModal] = useState(false);
    const isSuperAdmin = user?.role === 'superadmin';
    
    // Accounts & Active Account
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(true);
    const [activeAccount, setActiveAccount] = useState<EmailAccount | null>(null);
    
    // Form states
    const [newAccount, setNewAccount] = useState({ user: '', label: '', password: '' });
    const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' });
    const [sending, setSending] = useState(false);

    // Fetch accounts on mount
    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await fetch('/api/email-accounts', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    setAccounts(data);
                    if (data.length > 0) {
                        setActiveAccount(data[0]);
                    }
                }
            } catch (error) {
                console.error('Error fetching email accounts:', error);
                toast.error('Error al cargar las cuentas de correo');
            } finally {
                setLoadingAccounts(false);
            }
        };

        if (club?.id) {
            fetchAccounts();
        }
    }, [club?.id]);

    // Sync active account when accounts change or selection happens
    const handleSelectAccount = (acc: EmailAccount) => {
        setActiveAccount(acc);
        setSelectedEmail(null);
    };

    const handleCreateAccount = async () => {
        if (!newAccount.user || !newAccount.password) return;
        const fullEmail = `${newAccount.user.toLowerCase()}@${clubDomain}`;
        
        try {
            const response = await fetch('/api/email-accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    email: fullEmail,
                    label: newAccount.label || newAccount.user,
                    password: newAccount.password,
                    isPrimary: accounts.length === 0,
                    clubId: club?.id
                })
            });

            if (response.ok) {
                const created = await response.json();
                setAccounts([...accounts, created]);
                if (!activeAccount) setActiveAccount(created);
                setNewAccount({ user: '', label: '', password: '' });
                setShowAccountModal(false);
                toast.success(`Cuenta ${fullEmail} creada y configurada`);
            } else {
                const error = await response.json();
                toast.error(`Error: ${error.error || 'No se pudo crear la cuenta'}`);
            }
        } catch (error: any) {
            console.error('Error creating account:', error);
            const msg = error.response?.data?.error || error.message;
            toast.error(`Error: ${msg || 'Error de conexión al crear la cuenta'}`);
        }
    };

    const handleDeleteAccount = async (id: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar esta cuenta?')) return;
        
        try {
            const response = await fetch(`/api/email-accounts/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const updatedAccounts = accounts.filter(a => a.id !== id);
                setAccounts(updatedAccounts);
                if (activeAccount?.id === id) {
                    setActiveAccount(updatedAccounts.length > 0 ? updatedAccounts[0] : null);
                }
                toast.success('Cuenta eliminada con éxito');
            } else {
                toast.error('No se pudo eliminar la cuenta');
            }
        } catch (error) {
            console.error('Error deleting account:', error);
            toast.error('Error de conexión al eliminar la cuenta');
        }
    };

    // Bandeja real (correos recibidos vía Resend Inbound) + enviados de la sesión.
    const [messages, setMessages] = useState<EmailMessage[]>([]);
    const [sentMessages, setSentMessages] = useState<EmailMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const stripHtml = (html?: string) => (html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const formatTime = (iso?: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        return sameDay
            ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
    };
    const mapMessage = (r: any): EmailMessage & { _raw?: any } => {
        const bodyText = r.text || stripHtml(r.html) || '';
        return {
            id: r.id,
            from: { name: r.fromName || r.fromEmail || 'Desconocido', email: r.fromEmail || '' },
            to: r.toEmail || activeAccount?.email || '',
            subject: r.subject || '(Sin asunto)',
            preview: bodyText.slice(0, 90),
            body: r.html ? bodyText : bodyText,
            timestamp: formatTime(r.receivedAt),
            read: !!r.read,
            starred: !!r.starred,
            hasAttachments: !!r.hasAttachments,
            folder: r.folder === 'trash' ? 'trash' : 'inbox',
        };
    };

    const fetchMessages = async () => {
        if (!activeAccount) { setMessages([]); return; }
        if (selectedFolder === 'sent' || selectedFolder === 'drafts') return; // server no tiene estos folders
        setLoadingMessages(true);
        try {
            const params = new URLSearchParams({ account: activeAccount.email, folder: selectedFolder });
            if ((club as any)?.id && user?.role === 'administrator') params.set('clubId', (club as any).id);
            const res = await fetch(`/api/email-accounts/messages?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMessages(Array.isArray(data) ? data.map(mapMessage) : []);
            } else {
                setMessages([]);
            }
        } catch (e) {
            console.error('Error fetching messages:', e);
            setMessages([]);
        } finally {
            setLoadingMessages(false);
        }
    };

    useEffect(() => {
        fetchMessages();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAccount?.id, selectedFolder]);

    const markRead = async (id: string) => {
        try {
            await fetch(`/api/email-accounts/messages/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ read: true })
            });
        } catch { /* noop */ }
    };

    const handleOpenEmail = (email: EmailMessage) => {
        setSelectedEmail(email);
        if (!email.read && selectedFolder !== 'sent') {
            setMessages(prev => prev.map(m => m.id === email.id ? { ...m, read: true } : m));
            markRead(email.id);
        }
    };

    const handleToggleStar = async (email: EmailMessage) => {
        const next = !email.starred;
        setMessages(prev => prev.map(m => m.id === email.id ? { ...m, starred: next } : m));
        setSelectedEmail(prev => prev && prev.id === email.id ? { ...prev, starred: next } : prev);
        try {
            await fetch(`/api/email-accounts/messages/${email.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ starred: next })
            });
        } catch { /* noop */ }
    };

    const handleTrashEmail = async (email: EmailMessage) => {
        try {
            await fetch(`/api/email-accounts/messages/${email.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ folder: 'trash' })
            });
            setMessages(prev => prev.filter(m => m.id !== email.id));
            setSelectedEmail(null);
            toast.success('Movido a la papelera');
        } catch {
            toast.error('No se pudo mover a la papelera');
        }
    };

    const handleSendEmail = async () => {
        if (!composeData.to) {
            toast.error('Por favor ingresa un destinatario');
            return;
        }

        setSending(true);
        try {
            // Real API call to our backend communications service
            const response = await fetch('/api/communications/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Ensure we pass auth
                },
                body: JSON.stringify({
                    type: 'email',
                    recipient: composeData.to,
                    subject: composeData.subject || '(Sin Asunto)',
                    content: composeData.body,
                    clubId: club?.id,
                    fromEmail: activeAccount.email // The backend will use this if SMTP is shared or for logging
                })
            });

            const result = await response.json();

            if (response.ok) {
                const newEmail: EmailMessage = {
                    id: result.messageId || Math.random().toString(36).substr(2, 9),
                    from: { name: user?.name || 'Admin', email: activeAccount.email },
                    to: composeData.to,
                    subject: composeData.subject || '(Sin Asunto)',
                    preview: composeData.body.substring(0, 60) + '...',
                    body: composeData.body,
                    timestamp: 'Ahora',
                    read: true,
                    starred: false,
                    hasAttachments: false,
                    folder: 'sent'
                };
                
                setSentMessages([newEmail, ...sentMessages]);
                setShowComposeModal(false);
                setComposeData({ to: '', subject: '', body: '' });
                toast.success(`Mensaje enviado con éxito desde ${activeAccount.email}`);
            } else {
                toast.error(`Error al enviar: ${result.error || 'Servicio no disponible'}`);
            }
        } catch (error) {
            console.error('Error in handleSendEmail:', error);
            toast.error('Error de conexión con el servidor de correo');
        } finally {
            setSending(false);
        }
    };

    const filteredEmails = selectedFolder === 'sent'
        ? sentMessages
        : selectedFolder === 'drafts'
            ? []
            : messages;

    return (
        <AdminLayout>
            <div className="flex flex-col h-[calc(100vh-180px)]">
                {/* Premium Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                            <Mail className="w-6 h-6 text-rotary-blue" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Ecosistema de Correo</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Gestionando cuenta: <span className="font-bold text-rotary-blue">{activeAccount?.email || 'Ninguna seleccionada'}</span>
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="bg-gray-100 p-1 rounded-xl flex">
                            <button onClick={() => setActiveTab('inbox')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'inbox' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Bandeja</button>
                            <button onClick={() => setActiveTab('accounts')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'accounts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Cuentas</button>
                        </div>
                        <button 
                            onClick={() => activeTab === 'inbox' ? setShowComposeModal(true) : setShowAccountModal(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-sky-800 transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            {activeTab === 'inbox' ? 'Redactar' : 'Nueva Cuenta'}
                        </button>
                    </div>
                </div>

                {activeTab === 'inbox' ? (
                    <div className="flex-1 bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden flex">
                        {/* Sidebar */}
                        <div className="w-64 border-r border-gray-100 flex flex-col bg-gray-50/50">
                            <div className="p-4">
                                <div className="space-y-1">
                                    {[
                                        { id: 'inbox', icon: Inbox, label: 'Entrada', count: filteredEmails.length },
                                        { id: 'starred', icon: Star, label: 'Destacados', count: 0 },
                                        { id: 'sent', icon: Send, label: 'Enviados', count: 0 },
                                        { id: 'drafts', icon: Archive, label: 'Borradores', count: 0 },
                                        { id: 'trash', icon: Trash2, label: 'Papelera', count: 0 },
                                    ].map((folder) => (
                                        <button
                                            key={folder.id}
                                            onClick={() => { setSelectedFolder(folder.id); setSelectedEmail(null); }}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${selectedFolder === folder.id ? 'bg-sky-100 text-rotary-blue font-bold shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <folder.icon className={`w-4 h-4 ${selectedFolder === folder.id ? 'text-rotary-blue' : 'text-gray-400'}`} />
                                                {folder.label}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                <div className="mt-8">
                                    <h3 className="px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Cuentas</h3>
                                    <div className="space-y-1">
                                        {accounts.map(acc => (
                                            <button 
                                                key={acc.id} 
                                                onClick={() => handleSelectAccount(acc)}
                                                className={`w-full text-left px-3 py-2 rounded-xl text-xs truncate flex items-center gap-2 transition-all ${activeAccount?.id === acc.id ? 'bg-white shadow-sm border border-gray-100 font-bold text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}
                                            >
                                                <div className={`w-2 h-2 rounded-full ${activeAccount?.id === acc.id ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                                {acc.email}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* List */}
                        <div className={`flex-1 flex flex-col min-w-0 ${selectedEmail ? 'hidden lg:flex' : 'flex'}`}>
                            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm outline-none" />
                                </div>
                                <button onClick={fetchMessages} title="Actualizar" className="p-2 text-gray-400 hover:text-rotary-blue rounded-lg hover:bg-gray-100">
                                    <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {loadingMessages && (
                                    <div className="flex items-center justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin text-gray-300" /></div>
                                )}
                                {!loadingMessages && filteredEmails.length === 0 && (
                                    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                                        <Inbox className="w-10 h-10 text-gray-200 mb-3" />
                                        <p className="text-sm text-gray-400">{selectedFolder === 'sent' ? 'No has enviado correos en esta sesión.' : selectedFolder === 'drafts' ? 'Sin borradores.' : 'Sin mensajes en esta carpeta.'}</p>
                                    </div>
                                )}
                                {filteredEmails.map((email) => (
                                    <div key={email.id} onClick={() => handleOpenEmail(email)} className={`p-4 border-b border-gray-50 cursor-pointer transition-all hover:bg-gray-50 relative ${selectedEmail?.id === email.id ? 'bg-sky-50/50' : ''} ${!email.read ? 'bg-sky-50/30' : ''}`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-sm text-gray-900 ${!email.read ? 'font-black' : 'font-bold'}`}>{email.from.name}</span>
                                            <span className="text-[10px] text-gray-400">{email.timestamp}</span>
                                        </div>
                                        <h4 className="text-xs text-gray-600 truncate">{email.subject}</h4>
                                        {email.preview && <p className="text-[11px] text-gray-400 truncate mt-0.5">{email.preview}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Detail */}
                        <div className={`flex-[1.5] flex flex-col min-w-0 bg-white ${selectedEmail ? 'flex' : 'hidden lg:flex'}`}>
                            {selectedEmail ? (
                                <>
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                        <button onClick={() => setSelectedEmail(null)} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleTrashEmail(selectedEmail)} title="Mover a papelera" className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500"><Trash2 className="w-5 h-5" /></button>
                                            <button onClick={() => handleToggleStar(selectedEmail)} title="Destacar" className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><Star className={`w-5 h-5 ${selectedEmail.starred ? 'fill-amber-400 text-amber-400' : ''}`} /></button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-8">
                                        <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedEmail.subject}</h2>
                                        <div className="flex items-center gap-2 mb-6 text-sm">
                                            <span className="font-bold text-gray-800">{selectedEmail.from.name}</span>
                                            {selectedEmail.from.email && <span className="text-gray-400">&lt;{selectedEmail.from.email}&gt;</span>}
                                        </div>
                                        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line">{selectedEmail.body}</div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8"><Mail className="w-12 h-12 text-gray-200 mb-4" /><p className="text-sm text-gray-400">Selecciona un mensaje</p></div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Accounts Tab */
                    <div className="flex-1 overflow-y-auto space-y-6">
                         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {isSuperAdmin && (
                                <div className="lg:col-span-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white relative overflow-hidden">
                                    <Zap className="absolute top-0 right-0 p-8 opacity-10 w-32 h-32" />
                                    <h3 className="font-bold text-xl mb-4">Configuración Automática</h3>
                                    <p className="text-emerald-50 text-sm mb-6">Dominio <span className="font-black text-white">{clubDomain}</span> gestionado por Club Platform.</p>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl"><CheckCircle2 className="w-4 h-4" /><span className="text-[10px] font-black uppercase">DNS OK</span></div>
                                    </div>
                                </div>
                            )}
                            {!isSuperAdmin && (
                                <div className="lg:col-span-2 bg-gradient-to-br from-rotary-blue to-sky-700 rounded-3xl p-6 text-white relative overflow-hidden">
                                    <ShieldCheck className="absolute top-0 right-0 p-8 opacity-10 w-32 h-32" />
                                    <h3 className="font-bold text-xl mb-4">Tu Correo Institucional</h3>
                                    <p className="text-sky-50 text-sm mb-6">Tu dominio <span className="font-black text-white">{clubDomain}</span> está configurado y protegido por nuestros sistemas.</p>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl"><CheckCircle2 className="w-4 h-4" /><span className="text-[10px] font-black uppercase">Activo y Seguro</span></div>
                                    </div>
                                </div>
                            )}
                            <div className="bg-white border border-gray-200 rounded-3xl p-6 flex flex-col justify-center text-center">
                                <h3 className="font-bold text-gray-900 mb-2">Cuentas</h3>
                                <p className="text-3xl font-black text-rotary-blue">{accounts.length} / 10</p>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Cuenta</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {accounts.map(acc => (
                                        <tr key={acc.id} className="hover:bg-gray-50 transition-all">
                                            <td className="px-6 py-5 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center text-rotary-blue"><AtSign className="w-4 h-4" /></div>
                                                <span className="text-sm font-bold text-gray-900">{acc.email}</span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                {!acc.isPrimary && <button onClick={() => handleDeleteAccount(acc.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-xl"><Trash2 className="w-4 h-4" /></button>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* MODALS */}
                {showComposeModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
                        <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900">Nuevo Mensaje</h3>
                                    <p className="text-sm text-gray-500 mt-1">Desde: <span className="font-bold text-rotary-blue">{activeAccount?.email}</span></p>
                                </div>
                                <button onClick={() => setShowComposeModal(false)} className="p-3 text-gray-400 hover:text-gray-900 rounded-2xl transition-all"><X className="w-6 h-6" /></button>
                            </div>
                            <div className="p-8 space-y-6 flex-1 overflow-y-auto">
                                <input type="email" value={composeData.to} onChange={e => setComposeData({ ...composeData, to: e.target.value })} placeholder="Para" className="w-full px-6 py-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 transition-all" />
                                <input type="text" value={composeData.subject} onChange={e => setComposeData({ ...composeData, subject: e.target.value })} placeholder="Asunto" className="w-full px-6 py-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 transition-all" />
                                <textarea value={composeData.body} onChange={e => setComposeData({ ...composeData, body: e.target.value })} placeholder="Mensaje..." className="w-full flex-1 px-6 py-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 transition-all resize-none min-h-[200px]" />
                            </div>
                            <div className="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                                <button onClick={() => setShowComposeModal(false)} className="text-sm font-black text-gray-400 uppercase tracking-widest">Descartar</button>
                                <button onClick={handleSendEmail} disabled={sending || !composeData.to || !activeAccount} className="px-10 py-4 bg-gray-900 text-white text-sm font-black rounded-3xl hover:bg-rotary-blue transition-all flex items-center gap-3">
                                    {sending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <SendHorizontal className="w-5 h-5" />}
                                    {sending ? 'Enviando...' : 'Enviar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showAccountModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
                        <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden">
                            <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                                <h3 className="text-2xl font-bold text-gray-900">Crear Correo</h3>
                                <button onClick={() => setShowAccountModal(false)} className="p-3 text-gray-400 hover:text-gray-900 rounded-2xl"><X className="w-6 h-6" /></button>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-2xl">
                                    <input type="text" value={newAccount.user} onChange={e => setNewAccount({ ...newAccount, user: e.target.value })} placeholder="ej: secretaria" className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-base font-bold text-gray-900" />
                                    <span className="px-4 py-3 bg-white rounded-xl text-sm font-black text-sky-700 shadow-sm border border-sky-100">@{clubDomain}</span>
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                    <input type="password" value={newAccount.password} onChange={e => setNewAccount({ ...newAccount, password: e.target.value })} placeholder="Contraseña" className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl outline-none" />
                                </div>
                            </div>
                            <div className="p-8 bg-gray-50 border-t border-gray-100 flex gap-4">
                                <button onClick={() => setShowAccountModal(false)} className="flex-1 py-4 text-sm font-black text-gray-400 uppercase tracking-widest">Cerrar</button>
                                <button onClick={handleCreateAccount} disabled={!newAccount.user || !newAccount.password} className="flex-[2] py-4 bg-gray-900 text-white text-sm font-black rounded-3xl hover:bg-rotary-blue transition-all uppercase tracking-widest">Crear y Activar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
};

export default EmailManagement;
