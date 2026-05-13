import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Mail, Inbox, Send, Archive, Trash2, Star, 
    Search, Plus, Filter, MoreHorizontal, 
    RefreshCw, ChevronLeft, ChevronRight,
    AtSign, Settings, ShieldCheck, ExternalLink,
    Paperclip, Reply, Forward, User, Globe
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';

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

    // Mock accounts for the club domain
    const clubDomain = (club as any)?.domain || (club as any)?.subdomain ? `${(club as any).subdomain}.clubplatform.org` : 'rotary.org';
    const accounts: EmailAccount[] = [
        { id: '1', email: `info@${clubDomain}`, label: 'General / Info', isPrimary: true, provider: 'platform' },
        { id: '2', email: `presidencia@${clubDomain}`, label: 'Presidencia', isPrimary: false, provider: 'platform' },
    ];

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
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Bandeja de Entrada</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Gestiona la comunicación oficial de {club?.name || 'tu club'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all shadow-sm">
                            <AtSign className="w-4 h-4 text-sky-500" />
                            Cuentas Corporativas
                        </button>
                        <button className="flex items-center gap-2 px-5 py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-sky-800 transition-all shadow-xl shadow-blue-900/20 active:scale-95">
                            <Plus className="w-5 h-5" />
                            Redactar Correo
                        </button>
                    </div>
                </div>

                {/* Email Interface Container */}
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

                {/* Integration Info Banner */}
                <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-emerald-900">Infraestructura de Correo Activa</p>
                            <p className="text-xs text-emerald-700">Tu dominio está protegido y configurado correctamente para envíos seguros.</p>
                        </div>
                    </div>
                    <button className="flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-900 transition-colors uppercase tracking-wider">
                        Verificar DNS <ExternalLink className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </AdminLayout>
    );
};

export default EmailManagement;
