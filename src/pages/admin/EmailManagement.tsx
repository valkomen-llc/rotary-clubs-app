import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Mail, Inbox, Send, Archive, Trash2, Star, 
    Search, Plus, Filter, MoreHorizontal, 
    RefreshCw, ChevronLeft, ChevronRight,
    AtSign, Settings, ShieldCheck, ExternalLink,
    Paperclip, Reply, Forward, User, Globe, X,
    CheckCircle2, AlertTriangle, Database, ArrowRight,
    Lock, Key, Zap
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
    folder: 'inbox' | 'sent' | 'drafts' | 'trash';
}

const EmailManagement: React.FC = () => {
    const { user } = useAuth();
    const { club } = useClub();
    const [selectedFolder, setSelectedFolder] = useState<string>('inbox');
    const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'inbox' | 'accounts'>('inbox');
    const [newAccount, setNewAccount] = useState({ user: '', label: '', password: '' });

    // Mock accounts for the club domain
    const clubDomain = (club as any)?.domain || (club as any)?.subdomain ? `${(club as any).subdomain}.clubplatform.org` : 'rotary.org';
    const [accounts, setAccounts] = useState<EmailAccount[]>([
        { id: '1', email: `info@${clubDomain}`, label: 'General / Info', isPrimary: true, provider: 'platform' },
        { id: '2', email: `presidencia@${clubDomain}`, label: 'Presidencia', isPrimary: false, provider: 'platform' },
    ]);

    const handleCreateAccount = () => {
        if (!newAccount.user || !newAccount.password) return;
        const fullEmail = `${newAccount.user.toLowerCase()}@${clubDomain}`;
        const id = Math.random().toString(36).substr(2, 9);
        setAccounts([...accounts, { 
            id, 
            email: fullEmail, 
            label: newAccount.label || newAccount.user, 
            isPrimary: false, 
            provider: 'platform' 
        }]);
        setNewAccount({ user: '', label: '', password: '' });
        setShowAccountModal(false);
        toast.success('Cuenta creada y configurada automáticamente');
    };

    // Mock emails
    const emails: EmailMessage[] = [
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
    ];

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
                                Gestión de comunicación oficial y cuentas corporativas de {club?.name || 'tu club'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="bg-gray-100 p-1 rounded-xl flex">
                            <button 
                                onClick={() => setActiveTab('inbox')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'inbox' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Bandeja de Entrada
                            </button>
                            <button 
                                onClick={() => setActiveTab('accounts')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'accounts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Gestionar Cuentas
                            </button>
                        </div>
                        <button 
                            onClick={() => activeTab === 'inbox' ? null : setShowAccountModal(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-sky-800 transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            {activeTab === 'inbox' ? 'Redactar' : 'Nueva Cuenta'}
                        </button>
                    </div>
                </div>

                {activeTab === 'inbox' ? (
                    <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex">
                        {/* Sidebar: Folders & Accounts */}
                        <div className="w-64 border-r border-gray-100 flex flex-col bg-gray-50/50">
                            <div className="p-4">
                                <div className="space-y-1">
                                    {[
                                        { id: 'inbox', icon: Inbox, label: 'Entrada', count: 2 },
                                        { id: 'starred', icon: Star, label: 'Destacados', count: 0 },
                                        { id: 'sent', icon: Send, label: 'Enviados', count: 0 },
                                        { id: 'drafts', icon: Archive, label: 'Borradores', count: 0 },
                                        { id: 'trash', icon: Trash2, label: 'Papelera', count: 0 },
                                    ].map((folder) => (
                                        <button
                                            key={folder.id}
                                            onClick={() => setSelectedFolder(folder.id)}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                                                selectedFolder === folder.id 
                                                ? 'bg-sky-100 text-rotary-blue font-bold shadow-sm' 
                                                : 'text-gray-600 hover:bg-gray-100'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <folder.icon className={`w-4 h-4 ${selectedFolder === folder.id ? 'text-rotary-blue' : 'text-gray-400'}`} />
                                                {folder.label}
                                            </div>
                                            {folder.count > 0 && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                                    selectedFolder === folder.id ? 'bg-rotary-blue text-white' : 'bg-gray-200 text-gray-600'
                                                }`}>
                                                    {folder.count}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                <div className="mt-8">
                                    <h3 className="px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Cuentas</h3>
                                    <div className="space-y-1">
                                        {accounts.map(acc => (
                                            <button key={acc.id} className="w-full text-left px-3 py-2 rounded-xl text-xs text-gray-600 hover:bg-gray-100 truncate flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                {acc.email}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto p-4 border-t border-gray-100">
                                <div className="bg-sky-50 rounded-xl p-3 border border-sky-100">
                                    <p className="text-[10px] text-sky-700 font-bold mb-1">Espacio de Almacenamiento</p>
                                    <div className="w-full bg-sky-200 rounded-full h-1 mb-1">
                                        <div className="bg-sky-600 h-1 rounded-full w-[12%]" />
                                    </div>
                                    <p className="text-[9px] text-sky-600">1.2 GB de 10 GB utilizados</p>
                                </div>
                            </div>
                        </div>

                        {/* Email List Column */}
                        <div className={`flex-1 flex flex-col min-w-0 ${selectedEmail ? 'hidden lg:flex' : 'flex'}`}>
                            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Buscar mensajes..."
                                        className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-sky-500 transition-all outline-none"
                                    />
                                </div>
                                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                                    <Filter className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                {emails.map((email) => (
                                    <div 
                                        key={email.id}
                                        onClick={() => setSelectedEmail(email)}
                                        className={`p-4 border-b border-gray-50 cursor-pointer transition-all hover:bg-gray-50 relative ${
                                            selectedEmail?.id === email.id ? 'bg-sky-50/50' : ''
                                        } ${!email.read ? 'bg-white' : ''}`}
                                    >
                                        {!email.read && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-rotary-blue" />
                                        )}
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-sm ${!email.read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                                                {email.from.name}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-medium">{email.timestamp}</span>
                                        </div>
                                        <h4 className={`text-xs mb-1 truncate ${!email.read ? 'font-bold text-gray-800' : 'text-gray-600'}`}>
                                            {email.subject}
                                        </h4>
                                        <p className="text-xs text-gray-400 line-clamp-1">
                                            {email.preview}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
                                            {email.starred && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                                            {email.hasAttachments && <Paperclip className="w-3 h-3 text-gray-400" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Email View Column */}
                        <div className={`flex-[1.5] flex flex-col min-w-0 bg-white ${selectedEmail ? 'flex' : 'hidden lg:flex'}`}>
                            {selectedEmail ? (
                                <>
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => setSelectedEmail(null)}
                                                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
                                            >
                                                <ChevronLeft className="w-5 h-5 text-gray-500" />
                                            </button>
                                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-amber-400">
                                                <Star className={`w-5 h-5 ${selectedEmail.starred ? 'fill-amber-400 text-amber-400' : ''}`} />
                                            </button>
                                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500">
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                                                <Archive className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                                                <Reply className="w-4 h-4" /> Responder
                                            </button>
                                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                                                <MoreHorizontal className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-8">
                                        <div className="max-w-3xl mx-auto">
                                            <h2 className="text-xl font-bold text-gray-900 mb-6">{selectedEmail.subject}</h2>
                                            
                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-rotary-blue font-bold">
                                                    {selectedEmail.from.name.charAt(0)}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-gray-900">{selectedEmail.from.name}</span>
                                                        <span className="text-xs text-gray-400">&lt;{selectedEmail.from.email}&gt;</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        Para: {selectedEmail.to}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                    {selectedEmail.timestamp}
                                                </div>
                                            </div>

                                            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line">
                                                {selectedEmail.body}
                                            </div>

                                            {selectedEmail.hasAttachments && (
                                                <div className="mt-12 pt-6 border-t border-gray-100">
                                                    <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Archivos Adjuntos</h5>
                                                    <div className="flex flex-wrap gap-3">
                                                        <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-sky-300 transition-all cursor-pointer bg-gray-50/50 group">
                                                            <div className="w-10 h-10 bg-white rounded-lg border border-gray-100 flex items-center justify-center text-rose-500">
                                                                <FileText className="w-6 h-6" />
                                                            </div>
                                                            <div className="pr-4">
                                                                <p className="text-xs font-bold text-gray-700">Factura_Semestre.pdf</p>
                                                                <p className="text-[10px] text-gray-400">1.4 MB</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                        <Mail className="w-10 h-10 text-gray-200" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-400">Selecciona un mensaje</h3>
                                    <p className="text-sm text-gray-300 max-w-xs mt-2">
                                        Elige un correo de la lista para leer su contenido y responder.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Accounts Management Tab */
                    <div className="flex-1 overflow-y-auto space-y-6 pb-12">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Automatic Config Success Card */}
                            <div className="lg:col-span-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 shadow-xl shadow-emerald-900/10 text-white overflow-hidden relative group">
                                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                    <Zap className="w-32 h-32" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                                            <ShieldCheck className="w-6 h-6 text-white" />
                                        </div>
                                        <h3 className="font-bold text-xl">Configuración Automática Activa</h3>
                                    </div>
                                    <p className="text-emerald-50 text-sm max-w-md leading-relaxed mb-6">
                                        Tu dominio <span className="font-black text-white">{clubDomain}</span> está gestionado por Club Platform.
                                        Todos los registros DNS se sincronizan automáticamente al crear nuevas cuentas.
                                    </p>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl border border-white/10">
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-wider">MX Listo</span>
                                        </div>
                                        <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl border border-white/10">
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-wider">SPF/DKIM OK</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Help Card */}
                            <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-900 mb-2">¿Cómo funciona?</h3>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Solo crea el correo y asígnale una contraseña. Nosotros nos encargamos de la infraestructura, los servidores y la seguridad.
                                    </p>
                                </div>
                                <button className="mt-6 w-full py-3 bg-gray-50 text-sky-700 text-xs font-black rounded-2xl border border-gray-100 hover:bg-sky-50 transition-all uppercase tracking-wider">
                                    Guía de Configuración
                                </button>
                            </div>
                        </div>

                        {/* Accounts Table */}
                        <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-bold text-gray-900">Directorio de Cuentas Institucionales</h3>
                                <span className="text-xs text-gray-400 font-medium">{accounts.length} cuentas activas</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50/50 border-b border-gray-100">
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Cuenta Correo</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Propietario / Uso</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Infraestructura</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Almacenamiento</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {accounts.map(acc => (
                                            <tr key={acc.id} className="hover:bg-gray-50/80 transition-all group">
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-rotary-blue group-hover:scale-110 transition-transform">
                                                            <AtSign className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-bold text-gray-900 block">{acc.email}</span>
                                                            <span className="text-[10px] text-gray-400">IMAP/SMTP Habilitado</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className="text-xs font-medium text-gray-600">{acc.label}</span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        <span className="text-[9px] font-black uppercase tracking-wider">Activa</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="w-24">
                                                        <div className="flex justify-between text-[9px] text-gray-400 mb-1">
                                                            <span>12%</span>
                                                            <span>0.6 GB</span>
                                                        </div>
                                                        <div className="w-full bg-gray-100 rounded-full h-1">
                                                            <div className="bg-sky-400 h-1 rounded-full w-[12%]" />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all">
                                                            <Key className="w-4 h-4" />
                                                        </button>
                                                        <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all">
                                                            <Settings className="w-4 h-4" />
                                                        </button>
                                                        {!acc.isPrimary && (
                                                            <button 
                                                                onClick={() => setAccounts(accounts.filter(a => a.id !== acc.id))}
                                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Simplified Account Creation Modal */}
                {showAccountModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden border border-gray-100">
                            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900">Crear Correo</h3>
                                    <p className="text-sm text-gray-500 mt-1">Configuración instantánea ⚡</p>
                                </div>
                                <button onClick={() => setShowAccountModal(false)} className="p-3 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-all">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            
                            <div className="p-8 space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">Dirección de la Cuenta</label>
                                    <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-2xl border-2 border-transparent focus-within:border-sky-500/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-sky-500/5 transition-all duration-300">
                                        <input 
                                            type="text" 
                                            value={newAccount.user}
                                            onChange={e => setNewAccount({ ...newAccount, user: e.target.value })}
                                            placeholder="ej: secretaria"
                                            className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-base font-bold text-gray-900 placeholder:text-gray-300"
                                        />
                                        <span className="px-4 py-3 bg-white rounded-xl text-sm font-black text-sky-700 shadow-sm border border-sky-100">
                                            @{clubDomain}
                                        </span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">Contraseña Segura</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input 
                                            type="password" 
                                            value={newAccount.password}
                                            onChange={e => setNewAccount({ ...newAccount, password: e.target.value })}
                                            placeholder="••••••••••••"
                                            className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-base font-medium focus:ring-4 focus:ring-sky-500/5 focus:bg-white focus:border-sky-500/30 outline-none transition-all duration-300"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">Nombre (Opcional)</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input 
                                            type="text" 
                                            value={newAccount.label}
                                            onChange={e => setNewAccount({ ...newAccount, label: e.target.value })}
                                            placeholder="ej: Secretaría Ejecutiva"
                                            className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-base font-medium focus:ring-4 focus:ring-sky-500/5 focus:bg-white focus:border-sky-500/30 outline-none transition-all duration-300"
                                        />
                                    </div>
                                </div>

                                <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100/50 flex gap-4 items-start">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
                                        <Zap className="w-4 h-4 text-white" />
                                    </div>
                                    <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                                        Al activar, crearemos automáticamente los registros DNS en <span className="font-bold underline decoration-emerald-300 decoration-2 underline-offset-2">Club Platform Gateway</span>. No requiere configuración manual.
                                    </p>
                                </div>
                            </div>

                            <div className="p-8 bg-gray-50 border-t border-gray-100 flex gap-4">
                                <button 
                                    onClick={() => setShowAccountModal(false)}
                                    className="flex-1 py-4 text-sm font-black text-gray-400 hover:text-gray-900 transition-all uppercase tracking-widest"
                                >
                                    Cerrar
                                </button>
                                <button 
                                    onClick={handleCreateAccount}
                                    disabled={!newAccount.user || !newAccount.password}
                                    className="flex-[2] py-4 bg-gray-900 text-white text-sm font-black rounded-3xl hover:bg-rotary-blue transition-all shadow-2xl shadow-gray-900/20 disabled:opacity-30 disabled:grayscale uppercase tracking-widest active:scale-95"
                                >
                                    Crear y Activar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
};

export default EmailManagement;
