import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Mail, Inbox, Send, Archive, Trash2, Star, 
    Search, Plus, Filter, MoreHorizontal, 
    RefreshCw, ChevronLeft, ChevronRight,
    AtSign, Settings, ShieldCheck, ExternalLink,
    Paperclip, Reply, ReplyAll, Forward, User, Globe, X,
    CheckCircle2, AlertTriangle, Database, ArrowRight,
    Lock, Key, Zap, SendHorizontal, Image as ImageIcon,
    Smile, Bold, Italic, Underline, List, Link2
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
    html?: string;
    timestamp: string;
    rawDate?: string;
    read: boolean;
    starred: boolean;
    hasAttachments: boolean;
    attachments?: { filename: string; contentType?: string; size?: number | null; url?: string | null }[];
    folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'starred';
}

interface ComposeAttachment {
    filename: string;
    content: string; // base64 (sin prefijo data:)
    contentType: string;
    size: number;
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
    const [composeData, setComposeData] = useState({ to: '', cc: '', subject: '' });
    const [showCc, setShowCc] = useState(false);
    const [composeInitialHtml, setComposeInitialHtml] = useState('');
    const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [sending, setSending] = useState(false);
    const editorRef = React.useRef<HTMLDivElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Semilla el editor enriquecido al abrir/redactar (editor no controlado para no perder el cursor).
    useEffect(() => {
        if (showComposeModal && editorRef.current) {
            editorRef.current.innerHTML = composeInitialHtml || '';
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showComposeModal, composeInitialHtml]);

    const exec = (command: string, value?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
    };

    const MAX_ATTACH_TOTAL = 8 * 1024 * 1024; // 8 MB en total (límite seguro para base64 + Resend)

    const handleAttachFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploadingAttachment(true);
        try {
            const current = [...attachments];
            for (const file of Array.from(files)) {
                const totalSoFar = current.reduce((s, a) => s + a.size, 0);
                if (totalSoFar + file.size > MAX_ATTACH_TOTAL) {
                    toast.error(`"${file.name}" excede el límite total de 8 MB en adjuntos`);
                    continue;
                }
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = String(reader.result || '');
                        resolve(result.includes(',') ? result.split(',')[1] : result);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                current.push({ filename: file.name, content: base64, contentType: file.type || 'application/octet-stream', size: file.size });
            }
            setAttachments(current);
        } catch {
            toast.error('No se pudo adjuntar el archivo');
        } finally {
            setUploadingAttachment(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const formatBytes = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

    const resetCompose = () => {
        setComposeData({ to: '', cc: '', subject: '' });
        setComposeInitialHtml('');
        setAttachments([]);
        setShowCc(false);
    };

    // Construye el bloque citado para Responder/Reenviar (estilo Gmail).
    const buildQuote = (email: EmailMessage) => {
        const when = email.rawDate ? new Date(email.rawDate).toLocaleString('es') : email.timestamp;
        const inner = email.html || (email.body || '').replace(/\n/g, '<br>');
        return `<br><br><div style="border-left:2px solid #d1d5db;padding-left:12px;color:#6b7280">`
            + `El ${when}, ${email.from.name} &lt;${email.from.email}&gt; escribió:<br>${inner}</div>`;
    };

    const openCompose = () => { resetCompose(); setShowComposeModal(true); };

    const openReply = (email: EmailMessage, all = false) => {
        const subj = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
        let cc = '';
        if (all && email.to) {
            cc = email.to.split(/[,;]/).map(s => s.trim())
                .filter(addr => addr && addr.toLowerCase() !== (activeAccount?.email || '').toLowerCase())
                .join(', ');
        }
        setComposeData({ to: email.from.email, cc, subject: subj });
        setShowCc(!!cc);
        setComposeInitialHtml(buildQuote(email));
        setAttachments([]);
        setShowComposeModal(true);
    };

    const openForward = (email: EmailMessage) => {
        const subj = /^fwd:/i.test(email.subject) ? email.subject : `Fwd: ${email.subject}`;
        setComposeData({ to: '', cc: '', subject: subj });
        setShowCc(false);
        setComposeInitialHtml(buildQuote(email));
        setAttachments([]);
        setShowComposeModal(true);
    };

    // Diagnóstico de configuración de correo
    const [showDiagModal, setShowDiagModal] = useState(false);
    const [diag, setDiag] = useState<any>(null);
    const [loadingDiag, setLoadingDiag] = useState(false);
    const [testTo, setTestTo] = useState('');
    const [testResult, setTestResult] = useState<any>(null);
    const [testingSend, setTestingSend] = useState(false);

    // Provisión de recepción (webhook + buzones + MX) para los dominios Resend.
    const [showProvisionModal, setShowProvisionModal] = useState(false);
    const [provisioning, setProvisioning] = useState(false);
    const [provisionResult, setProvisionResult] = useState<any>(null);

    const runProvisionInbound = async () => {
        setShowProvisionModal(true);
        setProvisioning(true);
        setProvisionResult(null);
        try {
            const res = await fetch('/api/email-accounts/provision-inbound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({})
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setProvisionResult({ error: data.error || `El servidor respondió ${res.status}` });
            } else {
                setProvisionResult(data);
                // Refresca cuentas por si se crearon buzones por defecto.
                if (Array.isArray(data.mailboxesCreated) && data.mailboxesCreated.length > 0) {
                    try {
                        const r = await fetch('/api/email-accounts', { headers: { 'Authorization': `Bearer ${token}` } });
                        if (r.ok) {
                            const accs = await r.json();
                            setAccounts(accs);
                            if (!activeAccount && accs.length > 0) setActiveAccount(accs[0]);
                        }
                    } catch { /* noop */ }
                }
            }
        } catch (e: any) {
            setProvisionResult({ error: e?.message || 'Error de conexión al configurar la recepción' });
        } finally {
            setProvisioning(false);
        }
    };

    const runTestSend = async () => {
        if (!testTo) { toast.error('Escribe un destinatario para la prueba'); return; }
        setTestingSend(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/email-accounts/test-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ to: testTo, clubId: club?.id, fromEmail: activeAccount?.email })
            });
            const data = await res.json().catch(() => ({}));
            setTestResult(data);
        } catch (e: any) {
            setTestResult({ success: false, error: e?.message || 'Error de conexión' });
        } finally {
            setTestingSend(false);
        }
    };

    const runDiagnostics = async () => {
        setShowDiagModal(true);
        setLoadingDiag(true);
        setDiag(null);
        try {
            const params = new URLSearchParams();
            if (club?.id) params.set('clubId', club.id);
            const res = await fetch(`/api/email-accounts/diagnostics?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setDiag({ error: data.error || `El servidor respondió ${res.status}` });
            } else {
                setDiag(data);
            }
        } catch (e: any) {
            setDiag({ error: e?.message || 'Error de conexión al ejecutar el diagnóstico' });
        } finally {
            setLoadingDiag(false);
        }
    };

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
            body: bodyText,
            html: r.html || undefined,
            timestamp: formatTime(r.receivedAt),
            rawDate: r.receivedAt,
            read: !!r.read,
            starred: !!r.starred,
            hasAttachments: !!r.hasAttachments,
            attachments: Array.isArray(r.attachments) ? r.attachments : [],
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

    // Enviados persistentes (desde el log de comunicaciones del club).
    const fetchSent = async () => {
        setLoadingMessages(true);
        try {
            const params = new URLSearchParams();
            if ((club as any)?.id && user?.role === 'administrator') params.set('clubId', (club as any).id);
            const res = await fetch(`/api/communications/logs?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const logs = await res.json();
                const sent = (Array.isArray(logs) ? logs : [])
                    .filter((l: any) => l.type === 'email' && l.status === 'sent')
                    .map((l: any): EmailMessage => {
                        const bodyText = stripHtml(l.content) || l.content || '';
                        return {
                            id: l.id,
                            from: { name: (club as any)?.name || 'Tú', email: activeAccount?.email || '' },
                            to: l.recipient || '',
                            subject: l.subject || '(Sin asunto)',
                            preview: bodyText.slice(0, 90),
                            body: bodyText,
                            timestamp: formatTime(l.createdAt),
                            read: true, starred: false, hasAttachments: false, folder: 'sent',
                        };
                    });
                setSentMessages(sent);
            }
        } catch (e) {
            console.error('Error fetching sent logs:', e);
        } finally {
            setLoadingMessages(false);
        }
    };

    useEffect(() => {
        if (selectedFolder === 'sent') fetchSent();
        else if (selectedFolder !== 'drafts') fetchMessages();
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
        if (!activeAccount) {
            toast.error('No hay una cuenta de correo activa. Crea o selecciona una cuenta en "Cuentas".');
            return;
        }

        const htmlBody = editorRef.current?.innerHTML || '';
        const plainPreview = htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        setSending(true);
        // Evita que la petición se quede colgada para siempre (feedback garantizado).
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        try {
            // Real API call to our backend communications service
            const response = await fetch('/api/communications/send', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Ensure we pass auth
                },
                body: JSON.stringify({
                    type: 'email',
                    recipient: composeData.to,
                    cc: composeData.cc || undefined,
                    subject: composeData.subject || '(Sin Asunto)',
                    content: htmlBody,
                    clubId: club?.id,
                    fromEmail: activeAccount.email, // The backend will use this if SMTP is shared or for logging
                    attachments: attachments.length
                        ? attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
                        : undefined
                })
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok) {
                const newEmail: EmailMessage = {
                    id: result.messageId || Math.random().toString(36).substr(2, 9),
                    from: { name: user?.name || 'Admin', email: activeAccount.email },
                    to: composeData.to,
                    subject: composeData.subject || '(Sin Asunto)',
                    preview: plainPreview.substring(0, 60),
                    body: plainPreview,
                    html: htmlBody,
                    timestamp: 'Ahora',
                    read: true,
                    starred: false,
                    hasAttachments: attachments.length > 0,
                    folder: 'sent'
                };

                setSentMessages([newEmail, ...sentMessages]);
                setShowComposeModal(false);
                resetCompose();
                toast.success(`Mensaje enviado con éxito desde ${activeAccount.email}`);
            } else {
                toast.error(`Error al enviar: ${result.error || `El servidor respondió ${response.status}`}`);
            }
        } catch (error: any) {
            console.error('Error in handleSendEmail:', error);
            if (error?.name === 'AbortError') {
                toast.error('El envío tardó demasiado y se canceló. Reintenta en un momento.');
            } else {
                toast.error('Error de conexión con el servidor de correo');
            }
        } finally {
            clearTimeout(timeout);
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
                            onClick={runDiagnostics}
                            title="Verificar configuración de envío y recepción"
                            className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-sm font-bold hover:bg-amber-100 transition-all active:scale-95"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Diagnóstico
                        </button>
                        {isSuperAdmin && (
                            <button
                                onClick={runProvisionInbound}
                                title="Crear el webhook de recepción y los buzones por defecto para todos los dominios conectados a Resend"
                                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all active:scale-95"
                            >
                                <Inbox className="w-4 h-4" />
                                Configurar recepción
                            </button>
                        )}
                        <button
                            onClick={() => activeTab === 'inbox' ? openCompose() : setShowAccountModal(true)}
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
                                <button onClick={() => selectedFolder === 'sent' ? fetchSent() : fetchMessages()} title="Actualizar" className="p-2 text-gray-400 hover:text-rotary-blue rounded-lg hover:bg-gray-100">
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
                                            <div className="flex items-center gap-1.5">
                                                {email.hasAttachments && <Paperclip className="w-3 h-3 text-gray-400" />}
                                                <span className="text-[10px] text-gray-400">{email.timestamp}</span>
                                            </div>
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
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => setSelectedEmail(null)} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
                                            {selectedFolder !== 'sent' && (
                                                <>
                                                    <button onClick={() => openReply(selectedEmail)} title="Responder" className="flex items-center gap-1.5 px-3 py-2 hover:bg-sky-50 rounded-lg text-gray-600 hover:text-rotary-blue text-xs font-bold"><Reply className="w-4 h-4" />Responder</button>
                                                    <button onClick={() => openReply(selectedEmail, true)} title="Responder a todos" className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-rotary-blue"><ReplyAll className="w-5 h-5" /></button>
                                                    <button onClick={() => openForward(selectedEmail)} title="Reenviar" className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-rotary-blue"><Forward className="w-5 h-5" /></button>
                                                </>
                                            )}
                                        </div>
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
                                        {selectedEmail.html ? (
                                            // HTML del correo recibido aislado en un iframe sin scripts (anti-XSS).
                                            <iframe
                                                title="Contenido del correo"
                                                sandbox="allow-same-origin"
                                                srcDoc={`<base target="_blank"><div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#374151;line-height:1.5">${selectedEmail.html}</div>`}
                                                className="w-full border-0 min-h-[300px]"
                                                onLoad={(e) => {
                                                    try {
                                                        const f = e.currentTarget;
                                                        const h = f.contentWindow?.document?.body?.scrollHeight;
                                                        if (h) f.style.height = `${h + 24}px`;
                                                    } catch { /* cross-origin: dejamos min-height */ }
                                                }}
                                            />
                                        ) : (
                                            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line">{selectedEmail.body}</div>
                                        )}

                                        {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                                            <div className="mt-6 pt-5 border-t border-gray-100">
                                                <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Paperclip className="w-3.5 h-3.5" />{selectedEmail.attachments.length} adjunto(s)</p>
                                                <div className="flex flex-wrap gap-3">
                                                    {selectedEmail.attachments.map((att, i) => (
                                                        att.url ? (
                                                            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" download={att.filename}
                                                                className="flex items-center gap-3 border border-gray-200 rounded-2xl px-4 py-3 hover:bg-sky-50 hover:border-sky-200 transition-all max-w-[260px]">
                                                                <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center text-rotary-blue shrink-0"><Paperclip className="w-4 h-4" /></div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-bold text-gray-900 truncate">{att.filename}</p>
                                                                    <p className="text-[11px] text-gray-400">{att.size ? formatBytes(att.size) : att.contentType || 'archivo'}</p>
                                                                </div>
                                                            </a>
                                                        ) : (
                                                            <div key={i} title="Adjunto no disponible para descarga" className="flex items-center gap-3 border border-gray-200 rounded-2xl px-4 py-3 opacity-60 max-w-[260px]">
                                                                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0"><Paperclip className="w-4 h-4" /></div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-bold text-gray-700 truncate">{att.filename}</p>
                                                                    <p className="text-[11px] text-gray-400">No disponible</p>
                                                                </div>
                                                            </div>
                                                        )
                                                    ))}
                                                </div>
                                            </div>
                                        )}
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
                        <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Nuevo Mensaje</h3>
                                    <p className="text-xs text-gray-500 mt-1">Desde: <span className="font-bold text-rotary-blue">{activeAccount?.email}</span></p>
                                </div>
                                <button onClick={() => { setShowComposeModal(false); resetCompose(); }} className="p-3 text-gray-400 hover:text-gray-900 rounded-2xl transition-all"><X className="w-6 h-6" /></button>
                            </div>
                            <div className="px-6 pt-5 space-y-3 flex-1 overflow-y-auto">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <span className="text-xs font-bold text-gray-400 w-12">Para</span>
                                    <input type="text" value={composeData.to} onChange={e => setComposeData({ ...composeData, to: e.target.value })} placeholder="destinatario@correo.com" className="flex-1 bg-transparent outline-none text-sm" />
                                    {!showCc && <button onClick={() => setShowCc(true)} className="text-xs font-bold text-gray-400 hover:text-rotary-blue">Cc</button>}
                                </div>
                                {showCc && (
                                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                        <span className="text-xs font-bold text-gray-400 w-12">Cc</span>
                                        <input type="text" value={composeData.cc} onChange={e => setComposeData({ ...composeData, cc: e.target.value })} placeholder="copia@correo.com, otro@correo.com" className="flex-1 bg-transparent outline-none text-sm" />
                                    </div>
                                )}
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <span className="text-xs font-bold text-gray-400 w-12">Asunto</span>
                                    <input type="text" value={composeData.subject} onChange={e => setComposeData({ ...composeData, subject: e.target.value })} placeholder="Asunto" className="flex-1 bg-transparent outline-none text-sm" />
                                </div>

                                {/* Barra de formato */}
                                <div className="flex items-center gap-1 py-1">
                                    <button onMouseDown={e => { e.preventDefault(); exec('bold'); }} title="Negrita" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><Bold className="w-4 h-4" /></button>
                                    <button onMouseDown={e => { e.preventDefault(); exec('italic'); }} title="Cursiva" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><Italic className="w-4 h-4" /></button>
                                    <button onMouseDown={e => { e.preventDefault(); exec('underline'); }} title="Subrayado" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><Underline className="w-4 h-4" /></button>
                                    <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }} title="Lista" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><List className="w-4 h-4" /></button>
                                    <button onMouseDown={e => { e.preventDefault(); const url = prompt('URL del enlace:'); if (url) exec('createLink', url); }} title="Insertar enlace" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><Link2 className="w-4 h-4" /></button>
                                    <div className="w-px h-5 bg-gray-200 mx-1" />
                                    <button onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click(); }} title="Adjuntar archivo" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex items-center gap-1">
                                        <Paperclip className="w-4 h-4" />{uploadingAttachment && <RefreshCw className="w-3 h-3 animate-spin" />}
                                    </button>
                                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleAttachFiles(e.target.files)} />
                                </div>

                                {/* Editor enriquecido */}
                                <div
                                    ref={editorRef}
                                    contentEditable
                                    suppressContentEditableWarning
                                    className="w-full min-h-[180px] px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 text-sm text-gray-800 prose prose-sm max-w-none overflow-y-auto"
                                    style={{ maxHeight: '40vh' }}
                                />

                                {/* Adjuntos */}
                                {attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pb-2">
                                        {attachments.map((a, i) => (
                                            <div key={i} className="flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-xl px-3 py-1.5 text-xs">
                                                <Paperclip className="w-3 h-3 text-sky-600" />
                                                <span className="font-medium text-gray-700 max-w-[160px] truncate">{a.filename}</span>
                                                <span className="text-gray-400">{formatBytes(a.size)}</span>
                                                <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="p-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                                <button onClick={() => { setShowComposeModal(false); resetCompose(); }} className="text-sm font-black text-gray-400 uppercase tracking-widest">Descartar</button>
                                <button onClick={handleSendEmail} disabled={sending || !composeData.to} className="px-10 py-4 bg-gray-900 text-white text-sm font-black rounded-3xl hover:bg-rotary-blue transition-all flex items-center gap-3 disabled:opacity-50">
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

                {showProvisionModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
                        <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-xl font-bold text-gray-900">Configurar recepción</h3>
                                <button onClick={() => setShowProvisionModal(false)} className="p-2 text-gray-400 hover:text-gray-900 rounded-xl"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="p-6 overflow-y-auto">
                                {provisioning && (
                                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                                        <p className="text-sm text-gray-400">Conectando con Resend y configurando los buzones…</p>
                                    </div>
                                )}
                                {!provisioning && provisionResult?.error && (
                                    <p className="text-sm text-red-600 bg-red-50 rounded-xl p-4">{provisionResult.error}</p>
                                )}
                                {!provisioning && provisionResult && !provisionResult.error && (
                                    <div className="space-y-4">
                                        {/* Webhook */}
                                        <div className={`p-4 rounded-xl text-sm ${provisionResult.webhook?.hasReceivedEvent ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                                            <div className="flex items-start gap-2">
                                                <span className="mt-0.5">{provisionResult.webhook?.hasReceivedEvent ? '✅' : '❌'}</span>
                                                <div>
                                                    <p className="font-bold">
                                                        {provisionResult.webhook?.action === 'created' && 'Webhook email.received creado'}
                                                        {provisionResult.webhook?.action === 'already_configured' && 'Webhook email.received ya estaba configurado'}
                                                        {provisionResult.webhook?.action === 'updated' && 'Webhook email.received reapuntado a la URL correcta'}
                                                        {provisionResult.webhook?.action === 'needs_manual_fix' && 'El webhook apunta a una URL que redirige — corrígela en Resend'}
                                                        {provisionResult.webhook?.action === 'none' && 'No se pudo configurar el webhook'}
                                                    </p>
                                                    {provisionResult.webhook?.previousEndpoint && (
                                                        <p className="text-xs mt-1 break-all opacity-70">Antes: {provisionResult.webhook.previousEndpoint}</p>
                                                    )}
                                                    {provisionResult.webhook?.endpoint && <p className="text-xs mt-1 break-all">{provisionResult.webhook.endpoint}</p>}
                                                </div>
                                            </div>
                                            {provisionResult.webhook?.signingSecret && (
                                                <div className="mt-3 bg-white/70 border border-emerald-200 rounded-lg p-3">
                                                    <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700 mb-1">Guarda esto como RESEND_WEBHOOK_SECRET</p>
                                                    <code className="text-xs break-all text-gray-800">{provisionResult.webhook.signingSecret}</code>
                                                    <p className="text-[11px] text-emerald-700 mt-1">Resend solo lo muestra una vez. Configúralo en las variables de entorno para validar las firmas.</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Buzones creados */}
                                        {Array.isArray(provisionResult.mailboxesCreated) && provisionResult.mailboxesCreated.length > 0 && (
                                            <div className="p-4 rounded-xl text-sm bg-sky-50 text-sky-800">
                                                <p className="font-bold mb-1">Buzones por defecto creados</p>
                                                <ul className="list-disc list-inside text-xs space-y-0.5">
                                                    {provisionResult.mailboxesCreated.map((m: string) => <li key={m}>{m}</li>)}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Dominios + MX */}
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Dominios conectados a Resend ({(provisionResult.domains || []).length})</p>
                                            <div className="space-y-2">
                                                {(provisionResult.domains || []).map((d: any) => (
                                                    <div key={d.domain} className="border border-gray-100 rounded-xl p-3">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm font-bold text-gray-900">{d.domain}</span>
                                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${d.inboundMx ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{d.inboundMx ? 'MX OK' : 'Falta MX'}</span>
                                                        </div>
                                                        {!d.inboundMx && (
                                                            <p className="text-[11px] text-amber-700 mt-1">El apex no apunta a Resend Inbound. En Resend → Domains → {d.domain} activa el toggle "Receiving" y agrega el MX a tu DNS (prioridad más baja). Verificar el <b>envío</b> NO habilita la recepción.</p>
                                                        )}
                                                        <p className="text-[11px] text-gray-500 mt-1 break-all">MX real del apex: <code>{(d.liveMx && d.liveMx.length) ? d.liveMx.join(', ') : 'ninguno'}</code></p>
                                                        {d.mailbox?.email && d.mailbox?.created && <p className="text-[11px] text-emerald-600 mt-1">Buzón: {d.mailbox.email}</p>}
                                                        {d.mailbox?.note && <p className="text-[11px] text-gray-400 mt-1">Buzón: {d.mailbox.note}</p>}
                                                    </div>
                                                ))}
                                                {(provisionResult.domains || []).length === 0 && <p className="text-sm text-gray-400">No se encontraron dominios en Resend.</p>}
                                            </div>
                                        </div>

                                        {/* Errores */}
                                        {Array.isArray(provisionResult.errors) && provisionResult.errors.length > 0 && (
                                            <div className="p-4 rounded-xl text-sm bg-red-50 text-red-700">
                                                <p className="font-bold mb-1">Avisos</p>
                                                <ul className="list-disc list-inside text-xs space-y-0.5">
                                                    {provisionResult.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="p-5 bg-gray-50 border-t border-gray-100 flex gap-3">
                                <button onClick={() => setShowProvisionModal(false)} className="flex-1 py-3 text-sm font-black text-gray-400 uppercase tracking-widest">Cerrar</button>
                                <button onClick={runProvisionInbound} disabled={provisioning} className="flex-1 py-3 bg-emerald-600 text-white text-sm font-black rounded-2xl hover:bg-emerald-700 transition-all uppercase tracking-widest disabled:opacity-50">Reintentar</button>
                            </div>
                        </div>
                    </div>
                )}

                {showDiagModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
                        <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-xl font-bold text-gray-900">Diagnóstico de correo</h3>
                                <button onClick={() => setShowDiagModal(false)} className="p-2 text-gray-400 hover:text-gray-900 rounded-xl"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="p-6 overflow-y-auto">
                                {loadingDiag && (
                                    <div className="flex items-center justify-center py-10"><RefreshCw className="w-6 h-6 animate-spin text-gray-300" /></div>
                                )}
                                {!loadingDiag && diag?.error && (
                                    <p className="text-sm text-red-600 bg-red-50 rounded-xl p-4">{diag.error}</p>
                                )}
                                {!loadingDiag && diag && !diag.error && (
                                    <div className="space-y-2">
                                        {(diag.checks || []).map((c: any, i: number) => (
                                            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl text-sm ${c.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                                                <span className="mt-0.5">{c.ok ? '✅' : '❌'}</span>
                                                <span>{c.label}</span>
                                            </div>
                                        ))}
                                        <div className="pt-3 mt-2 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                                            <p>Cuentas: {(diag.accounts || []).map((a: any) => a.email).join(', ') || '—'}</p>
                                            <p>Recibidos: {diag.counts?.received ?? 0} · Enviados: {diag.counts?.sent ?? 0}</p>
                                            <p>URL de recepción (configurar en Resend Inbound): <code className="text-gray-700">{diag.inboundUrl}</code></p>
                                        </div>

                                        <div className="pt-4 mt-3 border-t border-gray-100">
                                            <p className="text-xs font-bold text-gray-700 mb-2">Probar envío real (muestra el error exacto de Resend)</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="email"
                                                    value={testTo}
                                                    onChange={e => setTestTo(e.target.value)}
                                                    placeholder="tu-correo@gmail.com"
                                                    className="flex-1 px-3 py-2 bg-gray-50 rounded-xl outline-none text-sm focus:ring-2 focus:ring-sky-500"
                                                />
                                                <button
                                                    onClick={runTestSend}
                                                    disabled={testingSend || !testTo}
                                                    className="px-4 py-2 bg-rotary-blue text-white text-sm font-bold rounded-xl hover:bg-sky-800 transition-all disabled:opacity-50"
                                                >
                                                    {testingSend ? 'Enviando…' : 'Enviar prueba'}
                                                </button>
                                            </div>
                                            {testResult && (
                                                <div className={`mt-3 p-3 rounded-xl text-sm ${testResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                                                    {testResult.success ? (
                                                        <span>✅ Resend aceptó el envío desde {testResult.from} (id: {testResult.messageId}). Revisa la bandeja (y spam) de {testResult.to}.</span>
                                                    ) : (
                                                        <span>❌ Error de Resend: {testResult.error || 'desconocido'}{testResult.from ? ` (intentado desde ${testResult.from})` : ''}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-5 bg-gray-50 border-t border-gray-100 flex gap-3">
                                <button onClick={() => setShowDiagModal(false)} className="flex-1 py-3 text-sm font-black text-gray-400 uppercase tracking-widest">Cerrar</button>
                                <button onClick={runDiagnostics} disabled={loadingDiag} className="flex-1 py-3 bg-gray-900 text-white text-sm font-black rounded-2xl hover:bg-rotary-blue transition-all uppercase tracking-widest disabled:opacity-50">Reintentar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
};

export default EmailManagement;
