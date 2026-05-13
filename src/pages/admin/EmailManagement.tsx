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
    const { user } = useAuth();
    const { club } = useClub();
    
    // Robust domain detection
    const PLATFORM_HOSTS = ['clubplatform.org', 'www.clubplatform.org', 'app.clubplatform.org', 'localhost'];
    const currentHost = window.location.hostname;
    const isOnClubDomain = !PLATFORM_HOSTS.includes(currentHost);
    const clubDomain = isOnClubDomain 
        ? currentHost 
        : ((club as any)?.domain || ((club as any)?.subdomain ? `${(club as any).subdomain}.clubplatform.org` : 'rotary.org'));

    // State
    const [selectedFolder, setSelectedFolder] = useState<string>('inbox');
    const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
    const [activeTab, setActiveTab] = useState<'inbox' | 'accounts'>('inbox');
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showComposeModal, setShowComposeModal] = useState(false);
    
    // Accounts & Active Account
    const [accounts, setAccounts] = useState<EmailAccount[]>([
        { id: '1', email: `info@${clubDomain}`, label: 'General / Info', isPrimary: true, provider: 'platform' },
        { id: '2', email: `presidencia@${clubDomain}`, label: 'Presidencia', isPrimary: false, provider: 'platform' },
    ]);
    const [activeAccount, setActiveAccount] = useState<EmailAccount>(accounts[0]);
    
    // Form states
    const [newAccount, setNewAccount] = useState({ user: '', label: '', password: '' });
    const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' });
    const [sending, setSending] = useState(false);

    // Sync active account when accounts change or selection happens
    const handleSelectAccount = (acc: EmailAccount) => {
        setActiveAccount(acc);
        setSelectedEmail(null);
    };

    const handleCreateAccount = () => {
        if (!newAccount.user || !newAccount.password) return;
        const fullEmail = `${newAccount.user.toLowerCase()}@${clubDomain}`;
        const id = Math.random().toString(36).substr(2, 9);
        const created: EmailAccount = { 
            id, 
            email: fullEmail, 
            label: newAccount.label || newAccount.user, 
            isPrimary: false, 
            provider: 'platform' 
        };
        setAccounts([...accounts, created]);
        setNewAccount({ user: '', label: '', password: '' });
        setShowAccountModal(false);
        toast.success(`Cuenta ${fullEmail} creada y configurada`);
    };

    const handleSendEmail = () => {
        if (!composeData.to) {
            toast.error('Por favor ingresa un destinatario');
            return;
        }
        setSending(true);
        setTimeout(() => {
            setSending(false);
            setShowComposeModal(false);
            setComposeData({ to: '', subject: '', body: '' });
            toast.success(`Mensaje enviado desde ${activeAccount.email}`);
        }, 1500);
    };

    // Mock emails (filtered by folder in real app)
    const [allEmails] = useState<EmailMessage[]>([
        {
            id: 'e1',
            from: { name: 'Juan Pérez', email: 'juan.perez@gmail.com' },
            to: `info@${clubDomain}`,
            subject: 'Interés en unirme al club',
            preview: 'Hola, me gustaría recibir información sobre los requisitos para ser socio...',
            body: 'Hola equipo del club,\n\nHe visto sus proyectos recientes y me ha impresionado mucho su impacto social. Me gustaría recibir información detallada sobre los pasos a seguir para postularme como socio.\n\nSaludos cordiales,\nJuan Pérez.',
            timestamp: '10:45 AM',
            read: false,
            starred: true,
            hasAttachments: false,
            folder: 'inbox'
        },
        {
            id: 'e2',
            from: { name: 'Rotary International', email: 'no-reply@rotary.org' },
            to: `info@${clubDomain}`,
            subject: 'Actualización de cuotas semestrales',
            preview: 'Estimados gobernadores y secretarios, adjuntamos el reporte de...',
            body: 'Estimados líderes rotarios,\n\nSe ha generado la factura correspondiente al segundo semestre. Por favor revisen el panel de My Rotary para realizar el pago.\n\nAtentamente,\nServicios Financieros RI.',
            timestamp: 'Ayer',
            read: true,
            starred: false,
            hasAttachments: true,
            folder: 'inbox'
        }
    ]);

    const filteredEmails = allEmails.filter(e => {
        if (selectedFolder === 'starred') return e.starred;
        return e.folder === selectedFolder;
    });

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
                                Gestionando cuenta: <span className="font-bold text-rotary-blue">{activeAccount.email}</span>
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
                                                className={`w-full text-left px-3 py-2 rounded-xl text-xs truncate flex items-center gap-2 transition-all ${activeAccount.id === acc.id ? 'bg-white shadow-sm border border-gray-100 font-bold text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}
                                            >
                                                <div className={`w-2 h-2 rounded-full ${activeAccount.id === acc.id ? 'bg-emerald-500' : 'bg-gray-300'}`} />
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
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {filteredEmails.map((email) => (
                                    <div key={email.id} onClick={() => setSelectedEmail(email)} className={`p-4 border-b border-gray-50 cursor-pointer transition-all hover:bg-gray-50 relative ${selectedEmail?.id === email.id ? 'bg-sky-50/50' : ''}`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-sm font-bold text-gray-900">{email.from.name}</span>
                                            <span className="text-[10px] text-gray-400">{email.timestamp}</span>
                                        </div>
                                        <h4 className="text-xs text-gray-600 truncate">{email.subject}</h4>
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
                                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><Trash2 className="w-5 h-5" /></button>
                                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><Star className={`w-5 h-5 ${selectedEmail.starred ? 'fill-amber-400 text-amber-400' : ''}`} /></button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-8">
                                        <h2 className="text-2xl font-bold text-gray-900 mb-6">{selectedEmail.subject}</h2>
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
                            <div className="lg:col-span-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white relative overflow-hidden">
                                <Zap className="absolute top-0 right-0 p-8 opacity-10 w-32 h-32" />
                                <h3 className="font-bold text-xl mb-4">Configuración Automática</h3>
                                <p className="text-emerald-50 text-sm mb-6">Dominio <span className="font-black text-white">{clubDomain}</span> gestionado por Club Platform.</p>
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl"><CheckCircle2 className="w-4 h-4" /><span className="text-[10px] font-black uppercase">DNS OK</span></div>
                                </div>
                            </div>
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
                                                {!acc.isPrimary && <button onClick={() => setAccounts(accounts.filter(a => a.id !== acc.id))} className="p-2 text-gray-400 hover:text-red-600 rounded-xl"><Trash2 className="w-4 h-4" /></button>}
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
                                    <p className="text-sm text-gray-500 mt-1">Desde: <span className="font-bold text-rotary-blue">{activeAccount.email}</span></p>
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
                                <button onClick={handleSendEmail} disabled={sending || !composeData.to} className="px-10 py-4 bg-gray-900 text-white text-sm font-black rounded-3xl hover:bg-rotary-blue transition-all flex items-center gap-3">
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
