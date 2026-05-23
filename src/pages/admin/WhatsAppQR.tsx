import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Smartphone, WifiOff, Loader, RefreshCw, Send, Users, MessageSquare, Clock, Search, Upload, UserPlus } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { CheckCheck, Sparkles, Paperclip, Smile, Mic, Image as ImageIcon, Copy, Check, MessageSquarePlus, X } from 'lucide-react';
import { toast } from 'sonner';


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

    // Compose-new-message (send to any number, no contact needed)
    const [showCompose, setShowCompose] = useState(false);
    const [composeNumber, setComposeNumber] = useState('');
    const [composeMessage, setComposeMessage] = useState('');
    const [composeFile, setComposeFile] = useState<File | null>(null);
    const [composeSending, setComposeSending] = useState(false);
    const [composeError, setComposeError] = useState('');
    const composeFileInputRef = useRef<HTMLInputElement>(null);

    // Modals
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showImportContacts, setShowImportContacts] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);

    // Link JID to CRM Contact States
    const [linkSearch, setLinkSearch] = useState('');
    const [linkingContact, setLinkingContact] = useState(false);
    const [linkError, setLinkError] = useState('');

    // Create Group States
    const [groupName, setGroupName] = useState('');
    const [groupDescription, setGroupDescription] = useState('');
    const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
    const [crmContacts, setCrmContacts] = useState<any[]>([]);
    const [loadingCrmContacts, setLoadingCrmContacts] = useState(false);
    const [crmSearch, setCrmSearch] = useState('');
    const [creatingGroup, setCreatingGroup] = useState(false);
    const [groupError, setGroupError] = useState('');
    
    // Create Group - Advanced Contact States
    const [manualContactName, setManualContactName] = useState('');
    const [manualContactPhone, setManualContactPhone] = useState('');
    const [manualContactEmail, setManualContactEmail] = useState('');
    const [manualContactTags, setManualContactTags] = useState('');
    const [savingManualContact, setSavingManualContact] = useState(false);
    
    // Create Group - Excel Import States
    const [showGroupExcelImport, setShowGroupExcelImport] = useState(false);
    const [groupExcelData, setGroupExcelData] = useState('');
    const [groupParsedContacts, setGroupParsedContacts] = useState<any[]>([]);
    const [importingGroupExcel, setImportingGroupExcel] = useState(false);

    // Import Contacts States
    const [importMethod, setImportMethod] = useState<'csv' | 'manual'>('csv');
    const [manualText, setManualText] = useState('');
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [parsedContacts, setParsedContacts] = useState<any[]>([]);
    const [selectedListId, setSelectedListId] = useState('');
    const [contactLists, setContactLists] = useState<any[]>([]);
    const [importTags, setImportTags] = useState('');
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState('');
    const [importResult, setImportResult] = useState<any | null>(null);
    const [defaultCountryCode, setDefaultCountryCode] = useState('57');

    // Fetch CRM contacts for group creation
    const fetchCrmContacts = async () => {
        setLoadingCrmContacts(true);
        try {
            const res = await fetch(`${API}/whatsapp-crm/contacts?limit=500`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.contacts) {
                setCrmContacts(data.contacts);
            }
        } catch (e) {
            console.error('Error fetching CRM contacts:', e);
        }
        setLoadingCrmContacts(false);
    };

    useEffect(() => {
        if ((showCreateGroup || showLinkModal) && token) {
            fetchCrmContacts();
        }
    }, [showCreateGroup, showLinkModal, token]);

    const handleLinkContact = async (contact: any) => {
        if (!selectedChat) return;
        setLinkError('');
        setLinkingContact(true);
        try {
            const res = await fetch(`${API}/whatsapp-qr/contacts/link`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jid: selectedChat.id,
                    crmContactId: contact.id
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(data.message || `Vinculado exitosamente a ${contact.name}`);
                
                // Update local state immediately
                setSelectedChat(prev => prev ? { ...prev, name: contact.name } : null);
                setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, name: contact.name } : c));
                
                // Refresh chats in background to ensure syncing
                fetchChats();
                
                // Close modal
                setShowLinkModal(false);
                setLinkSearch('');
            } else {
                setLinkError(data.error || 'Error al vincular el contacto.');
            }
        } catch (e: any) {
            console.error('Error linking contact:', e);
            setLinkError('Error de red al intentar vincular.');
        }
        setLinkingContact(false);
    };

    // Fetch CRM Lists for bulk import
    const fetchContactLists = async () => {
        try {
            const res = await fetch(`${API}/whatsapp-crm/lists`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.lists) {
                setContactLists(data.lists);
            }
        } catch (e) {
            console.error('Error fetching CRM lists:', e);
        }
    };

    useEffect(() => {
        if (showImportContacts && token) {
            fetchContactLists();
        }
    }, [showImportContacts, token]);

    // Simple and robust CSV parser
    const parseCsvContent = (text: string) => {
        const lines = text.split(/\r?\n/);
        const results = [];
        let startIdx = 0;
        let headers = ['nombre', 'telefono', 'email'];

        if (lines.length > 0) {
            const firstLine = lines[0].toLowerCase();
            if (firstLine.includes('nombre') || firstLine.includes('name') || firstLine.includes('tel') || firstLine.includes('phone') || firstLine.includes('correo') || firstLine.includes('email')) {
                headers = lines[0].split(/[,;\t]/).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
                startIdx = 1;
            }
        }

        const nameColIdx = headers.findIndex(h => h.includes('nombre') || h.includes('name') || h === 'n');
        const phoneColIdx = headers.findIndex(h => h.includes('tel') || h.includes('phone') || h.includes('cel') || h === 't');
        const emailColIdx = headers.findIndex(h => h.includes('correo') || h.includes('email') || h.includes('mail') || h === 'e');

        for (let i = startIdx; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            let cells: string[] = [];
            let currentCell = '';
            let inQuotes = false;

            for (let charIdx = 0; charIdx < line.length; charIdx++) {
                const char = line[charIdx];
                if (char === '"' || char === "'") {
                    inQuotes = !inQuotes;
                } else if ((char === ',' || char === ';' || char === '\t') && !inQuotes) {
                    cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));
                    currentCell = '';
                } else {
                    currentCell += char;
                }
            }
            cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));

            if (cells.length < 2) continue;

            const rawName = nameColIdx !== -1 && cells[nameColIdx] ? cells[nameColIdx] : cells[0];
            const rawPhone = phoneColIdx !== -1 && cells[phoneColIdx] ? cells[phoneColIdx] : cells[1];
            const rawEmail = emailColIdx !== -1 && cells[emailColIdx] ? cells[emailColIdx] : (cells[2] || '');

            if (!rawName || !rawPhone) continue;

            const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
            let isValid = false;
            let normalized = cleanPhone;

            if (cleanPhone.length >= 7) {
                if (cleanPhone.length === 10 && cleanPhone.startsWith('3') && defaultCountryCode === '57') {
                    normalized = '57' + cleanPhone;
                    isValid = true;
                } else if (cleanPhone.length >= 10) {
                    isValid = true;
                }
            }

            results.push({
                name: rawName,
                phone: rawPhone,
                email: rawEmail,
                normalizedPhone: normalized,
                isValid
            });
        }
        return results;
    };

    // Parse pasted manual text
    const parseManualContent = (text: string) => {
        const lines = text.split(/\r?\n/);
        const results = [];
        for (const line of lines) {
            if (!line.trim()) continue;
            const parts = line.split(/[,;]/).map(p => p.trim());
            if (parts.length < 2) continue;

            const rawName = parts[0];
            const rawPhone = parts[1];
            const rawEmail = parts[2] || '';

            const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
            let isValid = false;
            let normalized = cleanPhone;

            if (cleanPhone.length >= 7) {
                if (cleanPhone.length === 10 && cleanPhone.startsWith('3') && defaultCountryCode === '57') {
                    normalized = '57' + cleanPhone;
                    isValid = true;
                } else if (cleanPhone.length >= 10) {
                    isValid = true;
                }
            }

            results.push({
                name: rawName,
                phone: rawPhone,
                email: rawEmail,
                normalizedPhone: normalized,
                isValid
            });
        }
        return results;
    };

    const handleSaveManualContact = async () => {
        if (!manualContactName.trim() || !manualContactPhone.trim()) {
            toast.error('Nombre y teléfono son obligatorios');
            return;
        }
        setSavingManualContact(true);
        try {
            const tags = manualContactTags.split(',').map(t => t.trim()).filter(Boolean);
            const res = await fetch(`${API}/whatsapp-crm/contacts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: manualContactName,
                    phone: manualContactPhone,
                    email: manualContactEmail,
                    tags,
                    source: 'manual'
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('Contacto guardado en el CRM');
                setCrmContacts(prev => [data, ...prev]);
                if (!groupParticipants.includes(data.phone)) {
                    setGroupParticipants(prev => [...prev, data.phone]);
                }
                setManualContactName('');
                setManualContactPhone('');
                setManualContactEmail('');
                setManualContactTags('');
            } else {
                toast.error(data.error || 'Error al guardar contacto');
                if (data.error && data.error.includes('ya existe')) {
                    const cleanPhone = manualContactPhone.replace(/[^0-9]/g, '');
                    if (cleanPhone && !groupParticipants.includes(cleanPhone)) {
                        setGroupParticipants(prev => [...prev, cleanPhone]);
                        toast.success('Número añadido a los participantes');
                    }
                }
            }
        } catch (e) {
            toast.error('Error de conexión');
        } finally {
            setSavingManualContact(false);
        }
    };

    const handleParseGroupExcel = (text: string) => {
        setGroupExcelData(text);
        const parsed = parseTSV(text);
        setGroupParsedContacts(parsed);
    };

    const handleImportGroupExcel = async () => {
        const validContacts = groupParsedContacts.filter(c => c.isValid);
        if (validContacts.length === 0) {
            toast.error('No hay contactos válidos para importar');
            return;
        }
        setImportingGroupExcel(true);
        try {
            const payload = validContacts.map(c => ({
                name: c.name,
                phone: c.normalizedPhone,
                email: c.email,
                tags: ['Grupo']
            }));
            const res = await fetch(`${API}/whatsapp-crm/import`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ contacts: payload, source: 'csv_import' })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Importados: ${data.imported}, Omitidos/Existentes: ${data.skipped}`);
                const phones = validContacts.map(c => c.normalizedPhone);
                setGroupParticipants(prev => {
                    const set = new Set([...prev, ...phones]);
                    return Array.from(set);
                });
                setGroupExcelData('');
                setGroupParsedContacts([]);
                setShowGroupExcelImport(false);
                fetchCrmContacts();
            } else {
                toast.error(data.error || 'Error en la importación');
            }
        } catch (e) {
            toast.error('Error de conexión al importar');
        } finally {
            setImportingGroupExcel(false);
        }
    };

    const handleCreateGroupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setGroupError('');
        if (!groupName.trim()) {
            setGroupError('El nombre del grupo es obligatorio.');
            return;
        }
        if (groupParticipants.length === 0) {
            setGroupError('Debes seleccionar al menos un participante.');
            return;
        }
        setCreatingGroup(true);
        try {
            const res = await fetch(`${API}/whatsapp-qr/groups/create`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    groupName,
                    participants: groupParticipants,
                    description: groupDescription
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchChats();
                setShowCreateGroup(false);
                setGroupName('');
                setGroupDescription('');
                setGroupParticipants([]);
                alert(`Grupo "${groupName}" creado con éxito en WhatsApp.`);
            } else {
                setGroupError(data.error || 'Error al crear el grupo.');
            }
        } catch (err: any) {
            console.error('Error creating group:', err);
            setGroupError('Error de red al intentar crear el grupo.');
        }
        setCreatingGroup(false);
    };

    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setImportError('');
        setImportResult(null);

        const validContacts = parsedContacts.filter(c => c.isValid);
        if (validContacts.length === 0) {
            setImportError('No hay contactos válidos para importar.');
            return;
        }

        setImporting(true);
        try {
            const tagsArray = importTags
                .split(',')
                .map(t => t.trim().toLowerCase())
                .filter(Boolean);

            const res = await fetch(`${API}/whatsapp-qr/contacts/import`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contacts: validContacts.map(c => ({
                        name: c.name,
                        phone: c.normalizedPhone,
                        email: c.email || null
                    })),
                    defaultCountryCode,
                    listId: selectedListId || null,
                    tags: tagsArray
                })
            });

            const data = await res.json();
            if (data.success) {
                setImportResult({
                    importedCount: data.importedCount,
                    errorCount: data.errorCount,
                    errors: data.errors
                });
                setManualText('');
                setCsvFile(null);
                setParsedContacts([]);
                setImportTags('');
                setSelectedListId('');
                fetchChats();
            } else {
                setImportError(data.error || 'Error al importar los contactos.');
            }
        } catch (err: any) {
            console.error('Error importing contacts:', err);
            setImportError('Error de red al importar contactos.');
        }
        setImporting(false);
    };

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

    const readFileAsBase64 = (f: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(f);
    });

    const handleCompose = async (e: React.FormEvent) => {
        e.preventDefault();
        setComposeError('');

        const digits = composeNumber.replace(/[^0-9]/g, '');
        if (digits.length < 7) {
            setComposeError('Número inválido. Incluye el código de país (ej: 573114818199).');
            return;
        }
        if (!composeMessage.trim() && !composeFile) {
            setComposeError('Escribe un mensaje o adjunta un archivo.');
            return;
        }

        setComposeSending(true);
        try {
            let res: Response;
            if (composeFile) {
                const base64Data = await readFileAsBase64(composeFile);
                res = await fetch(`${API}/whatsapp-qr/send-media`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chatId: digits,
                        mediaData: base64Data,
                        filename: composeFile.name,
                        mimetype: composeFile.type || 'application/octet-stream',
                        caption: composeMessage
                    })
                });
            } else {
                res = await fetch(`${API}/whatsapp-qr/send-message`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chatId: digits, message: composeMessage })
                });
            }
            let data: any = null;
            try {
                data = await res.json();
            } catch {
                if (res.status === 413) {
                    setComposeError('El archivo adjunto es demasiado grande para el servidor. Probá uno más liviano (≤ 20 MB).');
                } else {
                    setComposeError(`Respuesta inesperada del servidor (HTTP ${res.status}).`);
                }
                setComposeSending(false);
                return;
            }
            if (!res.ok || !data.success) {
                setComposeError(data?.error || `No se pudo enviar el mensaje (HTTP ${res.status}).`);
                setComposeSending(false);
                return;
            }
            // Success — clear and close, then refresh chats so the new conversation appears.
            setComposeNumber('');
            setComposeMessage('');
            setComposeFile(null);
            setShowCompose(false);
            fetchChats();
        } catch (err) {
            console.error(err);
            setComposeError('Error de conectividad. Intenta nuevamente.');
        }
        setComposeSending(false);
    };

    // Fetch chats every 15 seconds (suppressed log in the UI, optimized to avoid execution timeouts)
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
        }, 15000);
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
                                        <p className="text-sm font-bold text-gray-600">Conectando con Evolution API...</p>
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
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => { setComposeError(''); setShowCompose(true); }}
                                        className="p-2 hover:bg-emerald-50 rounded-xl text-emerald-600 transition-colors"
                                        title="Nuevo mensaje (a cualquier número)"
                                    >
                                        <MessageSquarePlus className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => { setGroupError(''); setGroupName(''); setGroupDescription(''); setGroupParticipants([]); setShowCreateGroup(true); }}
                                        className="p-2 hover:bg-emerald-50 rounded-xl text-emerald-600 transition-colors"
                                        title="Crear grupo de WhatsApp"
                                    >
                                        <UserPlus className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => { setImportError(''); setImportResult(null); setParsedContacts([]); setManualText(''); setCsvFile(null); setShowImportContacts(true); }}
                                        className="p-2 hover:bg-emerald-50 rounded-xl text-emerald-600 transition-colors"
                                        title="Importación masiva de contactos"
                                    >
                                        <Upload className="w-4 h-4" />
                                    </button>
                                    <button onClick={fetchChats} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors" title="Refrescar inbox">
                                        <RefreshCw className={`w-4 h-4 ${loadingChats ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
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
                                            <button 
                                                onClick={() => {
                                                    fetchCrmContacts();
                                                    setShowLinkModal(true);
                                                }}
                                                className="w-full py-2.5 mt-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-blue-50/50 hover:border-blue-300 hover:text-blue-700 transition-colors shadow-sm"
                                            >
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

            {showCompose && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative">
                        <button
                            type="button"
                            onClick={() => { setShowCompose(false); setComposeError(''); }}
                            className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <MessageSquarePlus className="w-5 h-5 text-emerald-600" />
                                Nuevo Mensaje
                            </h3>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                Enviá a cualquier número de WhatsApp, esté o no agregado a tu libreta. Adjunta archivos opcionales (imagen, video, documento).
                            </p>
                        </div>

                        <form onSubmit={handleCompose} className="p-6 space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Número de destino</label>
                                <input
                                    type="tel"
                                    value={composeNumber}
                                    onChange={e => setComposeNumber(e.target.value)}
                                    placeholder="Ej: 573114818199"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    autoFocus
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Incluye el código de país. Acepta espacios, guiones y signo "+".</p>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">
                                    Mensaje {composeFile ? <span className="text-gray-400 font-normal normal-case">(opcional, se usará como caption)</span> : ''}
                                </label>
                                <textarea
                                    value={composeMessage}
                                    onChange={e => setComposeMessage(e.target.value)}
                                    rows={4}
                                    placeholder="Escribe tu mensaje aquí..."
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Archivo adjunto (opcional)</label>
                                <input
                                    type="file"
                                    ref={composeFileInputRef}
                                    className="hidden"
                                    onChange={e => setComposeFile(e.target.files?.[0] || null)}
                                    accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                                />
                                {composeFile ? (
                                    <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
                                        <Paperclip className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-xs font-bold text-emerald-800 truncate" title={composeFile.name}>{composeFile.name}</div>
                                            <div className="text-[10px] text-emerald-700 opacity-80">{(composeFile.size / 1024).toFixed(1)} KB</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setComposeFile(null); if (composeFileInputRef.current) composeFileInputRef.current.value = ''; }}
                                            className="text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-md font-bold"
                                        >
                                            Quitar
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => composeFileInputRef.current?.click()}
                                        className="w-full border-2 border-dashed border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:border-emerald-200 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Paperclip className="w-4 h-4" />
                                        Adjuntar imagen, video o documento
                                    </button>
                                )}
                            </div>

                            {composeError && (
                                <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                    {composeError}
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setShowCompose(false); setComposeError(''); }}
                                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={composeSending}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3 py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {composeSending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    {composeSending ? 'Enviando...' : 'Enviar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateGroup && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowCreateGroup(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => { setShowCreateGroup(false); setGroupError(''); }}
                            className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        
                        <div className="p-6 border-b border-gray-100 bg-emerald-50/50 flex-shrink-0">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-emerald-600" />
                                Crear Nuevo Grupo
                            </h3>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                Crea un grupo de WhatsApp directamente desde la plataforma. Asigna participantes, nombre y descripción.
                            </p>
                        </div>

                        <form onSubmit={handleCreateGroupSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Nombre del Grupo *</label>
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={e => setGroupName(e.target.value)}
                                    placeholder="Ej: Junta Directiva 2026"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Descripción del Grupo (Opcional)</label>
                                <textarea
                                    value={groupDescription}
                                    onChange={e => setGroupDescription(e.target.value)}
                                    rows={2}
                                    placeholder="Ej: Grupo oficial para coordinar actividades..."
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1">
                                    Participantes Seleccionados ({groupParticipants.length})
                                </label>
                                {groupParticipants.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic mb-2">Ningún participante seleccionado. Usa la lista de abajo o agrega uno manual.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto p-1.5 bg-gray-50 rounded-xl border border-gray-100">
                                        {groupParticipants.map(phone => {
                                            const contact = crmContacts.find(c => c.phone === phone);
                                            const displayName = contact ? contact.name : phone;
                                            return (
                                                <span key={phone} className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-medium">
                                                    {displayName}
                                                    <button
                                                        type="button"
                                                        onClick={() => setGroupParticipants(prev => prev.filter(p => p !== phone))}
                                                        className="text-emerald-600 hover:text-emerald-800 font-bold ml-0.5"
                                                    >
                                                        &times;
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-gray-100 pt-3">
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Buscar Contactos del CRM</label>
                                <div className="relative mb-2">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o teléfono..."
                                        value={crmSearch}
                                        onChange={e => setCrmSearch(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    />
                                </div>

                                {loadingCrmContacts ? (
                                    <div className="flex justify-center items-center py-4">
                                        <Loader className="w-5 h-5 animate-spin text-emerald-600" />
                                    </div>
                                ) : (
                                    <div className="max-h-36 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100 bg-white">
                                        {crmContacts.filter(c => {
                                            if (!crmSearch.trim()) return true;
                                            const search = crmSearch.toLowerCase();
                                            return (c.name || '').toLowerCase().includes(search) || (c.phone || '').includes(search);
                                        }).length === 0 ? (
                                            <div className="text-center py-3 text-xs text-gray-400">No se encontraron contactos en el CRM.</div>
                                        ) : (
                                            crmContacts.filter(c => {
                                                if (!crmSearch.trim()) return true;
                                                const search = crmSearch.toLowerCase();
                                                return (c.name || '').toLowerCase().includes(search) || (c.phone || '').includes(search);
                                            }).map(contact => {
                                                const isSelected = groupParticipants.includes(contact.phone);
                                                return (
                                                    <div 
                                                        key={contact.phone} 
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setGroupParticipants(prev => prev.filter(p => p !== contact.phone));
                                                            } else {
                                                                setGroupParticipants(prev => [...prev, contact.phone]);
                                                            }
                                                        }}
                                                        className={`flex justify-between items-center px-3 py-2 cursor-pointer transition-colors text-xs ${isSelected ? 'bg-emerald-50/55 hover:bg-emerald-50' : 'hover:bg-gray-50'}`}
                                                    >
                                                        <div>
                                                            <p className="font-bold text-gray-900">{contact.name}</p>
                                                            <p className="text-[10px] text-gray-500">{contact.phone}</p>
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${isSelected ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                                            {isSelected ? 'Seleccionado' : 'Agregar'}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Manual Number Form Option */}
                            <div className="border-t border-gray-100 pt-3">
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-2">Agregar Contacto Manual (Guardar en CRM)</label>
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <input
                                        type="text"
                                        placeholder="Nombre *"
                                        value={manualContactName}
                                        onChange={e => setManualContactName(e.target.value)}
                                        className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                    <input
                                        type="tel"
                                        placeholder="Teléfono (ej: 57311...) *"
                                        value={manualContactPhone}
                                        onChange={e => setManualContactPhone(e.target.value)}
                                        className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <input
                                        type="email"
                                        placeholder="Email (opcional)"
                                        value={manualContactEmail}
                                        onChange={e => setManualContactEmail(e.target.value)}
                                        className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Etiquetas separadas por coma"
                                        value={manualContactTags}
                                        onChange={e => setManualContactTags(e.target.value)}
                                        className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSaveManualContact}
                                    disabled={savingManualContact || !manualContactName.trim() || !manualContactPhone.trim()}
                                    className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs px-3 py-2 rounded-xl font-bold transition-colors disabled:opacity-50"
                                >
                                    {savingManualContact ? 'Guardando...' : 'Guardar y Agregar al Grupo'}
                                </button>
                            </div>

                            {/* Import from Excel Option */}
                            <div className="border-t border-gray-100 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowGroupExcelImport(!showGroupExcelImport)}
                                    className="w-full flex items-center justify-between text-[11px] font-bold text-gray-600 uppercase tracking-wide hover:text-emerald-600 transition-colors"
                                >
                                    <span>Importar desde Excel (Guardar en CRM)</span>
                                    <span>{showGroupExcelImport ? 'Ocultar' : 'Mostrar'}</span>
                                </button>
                                
                                {showGroupExcelImport && (
                                    <div className="mt-3 space-y-3">
                                        <textarea
                                            placeholder="Pega aquí las columnas de Excel (ej: Nombre, Teléfono, Email)"
                                            value={groupExcelData}
                                            onChange={e => handleParseGroupExcel(e.target.value)}
                                            className="w-full h-24 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500 font-mono resize-none whitespace-pre"
                                        />
                                        
                                        {groupParsedContacts.length > 0 && (
                                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h4 className="text-xs font-bold text-gray-700">Vista Previa</h4>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                                                        {groupParsedContacts.filter(c => c.isValid).length} válidos / {groupParsedContacts.length} total
                                                    </span>
                                                </div>
                                                <div className="max-h-32 overflow-y-auto space-y-1">
                                                    {groupParsedContacts.map((c, i) => (
                                                        <div key={i} className={`text-[10px] px-2 py-1 flex items-center justify-between border-b border-gray-200/50 last:border-0 ${c.isValid ? 'text-gray-600' : 'text-red-500 line-through'}`}>
                                                            <span className="truncate w-1/3 font-bold">{c.name || '(Sin Nombre)'}</span>
                                                            <span className="truncate w-1/3 text-center font-mono">{c.phone || '(Sin Tel)'}</span>
                                                            <span className="truncate w-1/3 text-right">{c.email || ''}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleImportGroupExcel}
                                                    disabled={importingGroupExcel || groupParsedContacts.filter(c => c.isValid).length === 0}
                                                    className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded-xl font-bold transition-colors disabled:opacity-50"
                                                >
                                                    {importingGroupExcel ? 'Importando...' : 'Guardar e Incluir'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {groupError && (
                                <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                    {groupError}
                                </div>
                            )}

                            <div className="flex gap-2 pt-2 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => { setShowCreateGroup(false); setGroupError(''); }}
                                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creatingGroup}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {creatingGroup ? <Loader className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                    {creatingGroup ? 'Creando Grupo...' : 'Crear Grupo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showLinkModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowLinkModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => { setShowLinkModal(false); setLinkSearch(''); setLinkError(''); }}
                            className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        
                        <div className="p-6 border-b border-gray-100 bg-blue-50/50 flex-shrink-0">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-blue-600" />
                                Vincular a CRM Central
                            </h3>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                Vincula el chat actual <strong>{selectedChat?.name || selectedChat?.id.split('@')[0]}</strong> a un contacto del CRM Central para resolver permanentemente su nombre y arquetipo.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Buscar Contactos en CRM Central</label>
                                <div className="relative mb-2">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o teléfono del socio..."
                                        value={linkSearch}
                                        onChange={e => setLinkSearch(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-9 pr-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    />
                                </div>

                                {linkError && (
                                    <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                                        {linkError}
                                    </div>
                                )}

                                {loadingCrmContacts ? (
                                    <div className="flex justify-center items-center py-8">
                                        <Loader className="w-6 h-6 animate-spin text-blue-600" />
                                    </div>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100 bg-white">
                                        {crmContacts.filter(c => {
                                            if (!linkSearch.trim()) return true;
                                            const search = linkSearch.toLowerCase();
                                            return (c.name || '').toLowerCase().includes(search) || (c.phone || '').includes(search);
                                        }).length === 0 ? (
                                            <div className="text-center py-6 text-xs text-gray-400">No se encontraron contactos en el CRM.</div>
                                        ) : (
                                            crmContacts.filter(c => {
                                                if (!linkSearch.trim()) return true;
                                                const search = linkSearch.toLowerCase();
                                                return (c.name || '').toLowerCase().includes(search) || (c.phone || '').includes(search);
                                            }).map(contact => (
                                                <div
                                                    key={contact.id}
                                                    onClick={() => handleLinkContact(contact)}
                                                    className="p-3 hover:bg-blue-50/50 cursor-pointer flex items-center justify-between transition-colors group"
                                                >
                                                    <div className="min-w-0 flex-1 pr-4">
                                                        <p className="text-sm font-bold text-gray-800 group-hover:text-blue-700 transition-colors truncate">
                                                            {contact.name}
                                                        </p>
                                                        <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">
                                                            📞 {contact.phone} {contact.email ? `| ✉️ ${contact.email}` : ''}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={linkingContact}
                                                        className="text-xs font-bold text-blue-600 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white px-3 py-1.5 rounded-lg transition-all"
                                                    >
                                                        {linkingContact ? 'Vinculando...' : 'Vincular'}
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => { setShowLinkModal(false); setLinkSearch(''); setLinkError(''); }}
                                className="border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showImportContacts && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowImportContacts(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl relative overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => { setShowImportContacts(false); setImportError(''); setImportResult(null); }}
                            className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        
                        <div className="p-6 border-b border-gray-100 bg-emerald-50/50 flex-shrink-0">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <Upload className="w-5 h-5 text-emerald-600" />
                                Importar Contactos a CRM / WhatsApp
                            </h3>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                Importa de manera masiva contactos al CRM de tu Club y sincronízalos con tu Gateway de WhatsApp.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {/* Import Method Tabs */}
                            <div className="flex bg-gray-100 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => { setImportMethod('csv'); setParsedContacts([]); setImportError(''); }}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${importMethod === 'csv' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Subir Archivo CSV
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setImportMethod('manual'); setParsedContacts([]); setImportError(''); }}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${importMethod === 'manual' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Ingresar Manual (Copiar/Pegar)
                                </button>
                            </div>

                            {/* Method Content */}
                            {importMethod === 'csv' ? (
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block">Seleccionar Archivo CSV</label>
                                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-emerald-500 transition-colors bg-gray-50/50 cursor-pointer relative"
                                         onClick={() => document.getElementById('csv-file-selector')?.click()}>
                                        <input
                                            type="file"
                                            id="csv-file-selector"
                                            className="hidden"
                                            accept=".csv,text/csv"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0] || null;
                                                setCsvFile(file);
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (evt) => {
                                                        const text = evt.target?.result as string;
                                                        if (text) {
                                                            const res = parseCsvContent(text);
                                                            setParsedContacts(res);
                                                        }
                                                    };
                                                    reader.readAsText(file);
                                                }
                                            }}
                                        />
                                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                        {csvFile ? (
                                            <div>
                                                <p className="text-xs font-bold text-emerald-700">{csvFile.name}</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">{(csvFile.size / 1024).toFixed(1)} KB - Clic para cambiar</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-xs font-bold text-gray-700">Arrastra tu archivo CSV aquí, o búscalo localmente</p>
                                                <p className="text-[10px] text-gray-400 mt-1">Debe incluir columnas para: Nombre, Teléfono, y Correo (opcional)</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block">Pegar Lista de Contactos</label>
                                    <textarea
                                        value={manualText}
                                        onChange={(e) => {
                                            setManualText(e.target.value);
                                            const res = parseManualContent(e.target.value);
                                            setParsedContacts(res);
                                        }}
                                        rows={4}
                                        placeholder={`Escribe o pega tus contactos, uno por línea:\nNombre Completo, Teléfono, Correo@dominio.com\nPedro Pérez, 3114818199, pedro@gmail.com\nMaría Gómez, 573124567890`}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none font-mono transition-all animate-fade-in"
                                    />
                                    <p className="text-[10px] text-gray-400">Separa cada campo con una coma ( , ) o punto y coma ( ; ). Un contacto por línea.</p>
                                </div>
                            )}

                            {/* Preview Grid */}
                            {parsedContacts.length > 0 && (
                                <div className="space-y-2 border-t border-gray-100 pt-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block">
                                            Previsualización del Lote ({parsedContacts.length} contactos detectados)
                                        </label>
                                        <div className="flex gap-2">
                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                                {parsedContacts.filter(c => c.isValid).length} Válidos
                                            </span>
                                            <span className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-bold">
                                                {parsedContacts.filter(c => !c.isValid).length} Inválidos
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl bg-gray-50/50">
                                        <table className="min-w-full divide-y divide-gray-200 text-left">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Nombre</th>
                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Teléfono</th>
                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Email</th>
                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Sincronización QR</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white text-[11px]">
                                                {parsedContacts.map((contact, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                        <td className="px-3 py-1.5 font-semibold text-gray-900 truncate max-w-[120px]" title={contact.name}>{contact.name}</td>
                                                        <td className="px-3 py-1.5 text-gray-600 font-mono">{contact.phone}</td>
                                                        <td className="px-3 py-1.5 text-gray-500 truncate max-w-[100px]" title={contact.email}>{contact.email || '-'}</td>
                                                        <td className="px-3 py-1.5 font-bold">
                                                            {contact.isValid ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                                                                    Listo: {contact.normalizedPhone}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded" title="Número inválido (muy corto o formato desconocido)">
                                                                    Número Inválido
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Additional CRM Options */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-gray-100 pt-3">
                                <div>
                                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Código de País por Defecto</label>
                                    <input
                                        type="text"
                                        value={defaultCountryCode}
                                        onChange={e => setDefaultCountryCode(e.target.value)}
                                        placeholder="Ej: 57"
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                                    />
                                    <p className="text-[9px] text-gray-400 mt-1">Se antepone a números de 10 dígitos (ej. Colombia starts with 3).</p>
                                </div>

                                <div>
                                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Asignar a Lista del CRM</label>
                                    <select
                                        value={selectedListId}
                                        onChange={e => setSelectedListId(e.target.value)}
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
                                    >
                                        <option value="">-- Ninguna (Solo Contactos Sueltos) --</option>
                                        {contactLists.map(list => (
                                            <option key={list.id} value={list.id}>{list.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-[9px] text-gray-400 mt-1">Los contactos importados se añadirán a esta lista.</p>
                                </div>

                                <div>
                                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Etiquetas (Separadas por coma)</label>
                                    <input
                                        type="text"
                                        value={importTags}
                                        onChange={e => setImportTags(e.target.value)}
                                        placeholder="Ej: socios, asamblea, 2026"
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                                    />
                                    <p className="text-[9px] text-gray-400 mt-1">Ej: "rotarios, distrito, campaña1"</p>
                                </div>
                            </div>

                            {/* Error Details */}
                            {importError && (
                                <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                    {importError}
                                </div>
                            )}

                            {/* Successful Import Report */}
                            {importResult && (
                                <div className="border border-emerald-200 bg-emerald-50/60 rounded-xl p-4 space-y-2 animate-fade-in">
                                    <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                        <Check className="w-4 h-4" /> ¡Importación Finalizada Exitosamente!
                                    </p>
                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                        <div className="bg-white rounded-lg p-2.5 border border-emerald-100 shadow-sm text-center">
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Importados con Éxito</p>
                                            <p className="text-xl font-black text-emerald-700 mt-0.5">{importResult.importedCount}</p>
                                        </div>
                                        <div className="bg-white rounded-lg p-2.5 border border-emerald-100 shadow-sm text-center">
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Errores / Duplicados Omitidos</p>
                                            <p className="text-xl font-black text-gray-700 mt-0.5">{importResult.errorCount}</p>
                                        </div>
                                    </div>
                                    {importResult.errors && importResult.errors.length > 0 && (
                                        <div className="border-t border-emerald-200/50 pt-2">
                                            <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Detalles de Advertencias</p>
                                            <ul className="max-h-20 overflow-y-auto text-[10px] text-red-600 font-mono space-y-1 list-disc pl-4">
                                                {importResult.errors.map((err: string, i: number) => (
                                                    <li key={i}>{err}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-2 border-t border-gray-100 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => { setShowImportContacts(false); setImportError(''); setImportResult(null); }}
                                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    {importResult ? 'Cerrar' : 'Cancelar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleImportSubmit}
                                    disabled={importing || parsedContacts.filter(c => c.isValid).length === 0}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {importing ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {importing ? 'Importando Lote...' : 'Comenzar Importación'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
