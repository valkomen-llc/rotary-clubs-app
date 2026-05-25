import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Search, Send, Phone, MoreVertical, User, X, Tag, MessageCircle, ChevronLeft, Loader2, FileText, Archive, ArchiveRestore, Inbox, CheckCheck, Mail, MailOpen, Paperclip, Smile } from 'lucide-react';
import { toast } from 'sonner';
interface EmojiItem {
    char: string;
    name: string;
    keywords: string[];
    category: string;
}

const EMOJI_DATABASE: EmojiItem[] = [
    // Caritas (Smileys)
    { char: '😀', name: 'sonrisa', keywords: ['feliz', 'alegre', 'bien', 'smile', 'happy'], category: 'smileys' },
    { char: '😃', name: 'sonrisa abierta', keywords: ['feliz', 'alegre', 'bien', 'happy'], category: 'smileys' },
    { char: '😄', name: 'sonrisa ojos felices', keywords: ['feliz', 'alegre', 'bien', 'happy'], category: 'smileys' },
    { char: '😁', name: 'risa mueca', keywords: ['feliz', 'alegre', 'risa', 'gracioso'], category: 'smileys' },
    { char: '😆', name: 'risa cerrada', keywords: ['feliz', 'alegre', 'risa', 'lol'], category: 'smileys' },
    { char: '😅', name: 'risa sudor', keywords: ['alivio', 'nervios', 'sudor', 'uf'], category: 'smileys' },
    { char: '😂', name: 'risa llanto', keywords: ['risa', 'gracioso', 'lol', 'llorar'], category: 'smileys' },
    { char: '🤣', name: 'risa rodar', keywords: ['risa', 'gracioso', 'lol', 'rodar'], category: 'smileys' },
    { char: '😊', name: 'ojos felices', keywords: ['feliz', 'tímido', 'sonrojo'], category: 'smileys' },
    { char: '😇', name: 'ángel', keywords: ['santo', 'bueno', 'inocente'], category: 'smileys' },
    { char: '🙂', name: 'ligera sonrisa', keywords: ['ok', 'bien', 'neutral'], category: 'smileys' },
    { char: '🙃', name: 'boca abajo', keywords: ['sarcasmo', 'ironía', 'broma'], category: 'smileys' },
    { char: '😉', name: 'guiño', keywords: ['guiño', 'broma', 'secreto'], category: 'smileys' },
    { char: '😌', name: 'aliviado', keywords: ['paz', 'calma', 'bien', 'uf'], category: 'smileys' },
    { char: '😍', name: 'ojos de corazón', keywords: ['amor', 'encanta', 'bello', 'gustar'], category: 'smileys' },
    { char: '🥰', name: 'carita corazones', keywords: ['amor', 'encanta', 'afecto', 'tierno'], category: 'smileys' },
    { char: '😘', name: 'beso corazón', keywords: ['beso', 'amor', 'afecto', 'gracias'], category: 'smileys' },
    { char: '😋', name: 'delicioso', keywords: ['comida', 'antojo', 'rico'], category: 'smileys' },
    { char: '😛', name: 'lengua', keywords: ['broma', 'lengua', 'juguetón'], category: 'smileys' },
    { char: '😜', name: 'lengua guiño', keywords: ['broma', 'lengua', 'guiño', 'loco'], category: 'smileys' },
    { char: '🤪', name: 'loco', keywords: ['loco', 'divertido', 'gracioso'], category: 'smileys' },
    { char: '😎', name: 'lentes de sol', keywords: ['cool', 'sol', 'estilo', 'pro'], category: 'smileys' },
    { char: '🥳', name: 'fiesta', keywords: ['celebración', 'cumpleaños', 'felicitaciones', 'evento'], category: 'smileys' },
    { char: '😏', name: 'sarcástica', keywords: ['sarcasmo', 'coqueteo', 'smirk'], category: 'smileys' },
    { char: '😒', name: 'insatisfecho', keywords: ['molesto', 'aburrido', 'mal'], category: 'smileys' },
    { char: '😔', name: 'pensativo', keywords: ['triste', 'arrepentido', 'deprimido'], category: 'smileys' },
    { char: '🥺', name: 'súplica', keywords: ['por favor', 'tierno', 'triste', 'rogar'], category: 'smileys' },
    { char: '😢', name: 'lloro ligero', keywords: ['triste', 'llorar', 'pena'], category: 'smileys' },
    { char: '😭', name: 'lloro fuerte', keywords: ['triste', 'llorar', 'pena', 'dolor'], category: 'smileys' },
    { char: '😤', name: 'triunfo enojo', keywords: ['enojo', 'orgullo', 'resoplido'], category: 'smileys' },
    { char: '😠', name: 'enojado', keywords: ['enojo', 'molesto', 'enfado'], category: 'smileys' },
    { char: '😡', name: 'furioso', keywords: ['enojo', 'molesto', 'rojo'], category: 'smileys' },
    { char: '🤯', name: 'cabeza explotando', keywords: ['sorpresa', 'wow', 'impactante'], category: 'smileys' },
    { char: '😳', name: 'sonrojado', keywords: ['pena', 'sorpresa', 'vergüenza'], category: 'smileys' },
    { char: '🤔', name: 'pensando', keywords: ['duda', 'pregunta', 'idea'], category: 'smileys' },
    { char: '😐', name: 'neutral', keywords: ['neutral', 'serio', 'sin comentarios'], category: 'smileys' },
    { char: '😬', name: 'mueca', keywords: ['nervios', 'tensión', 'incómodo'], category: 'smileys' },
    { char: '😱', name: 'grito miedo', keywords: ['miedo', 'sorpresa', 'asustado', 'wow'], category: 'smileys' },

    // Gestos (Gestures)
    { char: '👍', name: 'pulgar arriba', keywords: ['ok', 'bien', 'aprobado', 'me gusta', 'yes', 'super'], category: 'gestures' },
    { char: '👎', name: 'pulgar abajo', keywords: ['no', 'mal', 'desaprobado'], category: 'gestures' },
    { char: '👌', name: 'mano ok', keywords: ['perfecto', 'bien', 'ok'], category: 'gestures' },
    { char: '🤌', name: 'dedos pellizco', keywords: ['italiano', 'que es', 'espera'], category: 'gestures' },
    { char: '✌️', name: 'mano victoria', keywords: ['paz', 'victoria', 'dos'], category: 'gestures' },
    { char: '🤞', name: 'dedos cruzados', keywords: ['suerte', 'deseo', 'esperanza'], category: 'gestures' },
    { char: '🫰', name: 'corazón dedos', keywords: ['amor', 'coreano', 'dinero'], category: 'gestures' },
    { char: '🤟', name: 'te amo', keywords: ['amor', 'rock', 'seña'], category: 'gestures' },
    { char: '🤘', name: 'rock', keywords: ['rock', 'metal', 'música', 'fiesta'], category: 'gestures' },
    { char: '🤙', name: 'llamame', keywords: ['teléfono', 'saludo', 'shaka'], category: 'gestures' },
    { char: '👈', name: 'apunta izquierda', keywords: ['dirección', 'mirar', 'izquierda'], category: 'gestures' },
    { char: '👉', name: 'apunta derecha', keywords: ['dirección', 'mirar', 'derecha'], category: 'gestures' },
    { char: '👆', name: 'apunta arriba', keywords: ['dirección', 'arriba', 'importante'], category: 'gestures' },
    { char: '👇', name: 'apunta abajo', keywords: ['dirección', 'abajo', 'aquí'], category: 'gestures' },
    { char: '👋', name: 'mano saludo', keywords: ['hola', 'adiós', 'saludo', 'bienvenida'], category: 'gestures' },
    { char: '✍️', name: 'escribiendo', keywords: ['escribir', 'nota', 'firma', 'carta'], category: 'gestures' },
    { char: '👏', name: 'aplauso', keywords: ['felicitaciones', 'bravo', 'muy bien', 'celebrar'], category: 'gestures' },
    { char: '🙌', name: 'manos arriba', keywords: ['celebrar', 'aleluya', 'gracias'], category: 'gestures' },
    { char: '👐', name: 'manos abiertas', keywords: ['abrazo', 'bienvenida'], category: 'gestures' },
    { char: '🤲', name: 'manos juntas', keywords: ['rezo', 'pedir', 'libro', 'ofrenda'], category: 'gestures' },
    { char: '🙏', name: 'por favor', keywords: ['gracias', 'rezo', 'por favor', 'saludo', 'amen'], category: 'gestures' },
    { char: '💪', name: 'fuerza', keywords: ['fuerza', 'poder', 'ejercicio', 'salud', 'vamos'], category: 'gestures' },
    { char: '🤝', name: 'apretón de manos', keywords: ['acuerdo', 'socio', 'alianza', 'bienvenido', 'hola', 'trato'], category: 'gestures' },

    // Corazones (Hearts)
    { char: '❤️', name: 'corazón rojo', keywords: ['amor', 'encanta', 'afecto'], category: 'hearts' },
    { char: '🧡', name: 'corazón naranja', keywords: ['amor', 'amistad'], category: 'hearts' },
    { char: '💛', name: 'corazón amarillo', keywords: ['amor', 'oro', 'rotario', 'amistad'], category: 'hearts' },
    { char: '💚', name: 'corazón verde', keywords: ['amor', 'esperanza', 'naturaleza'], category: 'hearts' },
    { char: '💙', name: 'corazón azul', keywords: ['amor', 'azul', 'rotario', 'apoyo'], category: 'hearts' },
    { char: '💜', name: 'corazón morado', keywords: ['amor', 'púrpura'], category: 'hearts' },
    { char: '🖤', name: 'corazón negro', keywords: ['amor', 'luto', 'estilo'], category: 'hearts' },
    { char: '🤍', name: 'corazón blanco', keywords: ['amor', 'paz', 'pureza'], category: 'hearts' },
    { char: '💔', name: 'corazón roto', keywords: ['triste', 'desamor', 'dolor'], category: 'hearts' },
    { char: '❣️', name: 'exclamación corazón', keywords: ['atención', 'amor', 'importante'], category: 'hearts' },
    { char: '💕', name: 'dos corazones', keywords: ['amor', 'enamorado'], category: 'hearts' },
    { char: '💖', name: 'corazón brillante', keywords: ['amor', 'especial', 'brillo'], category: 'hearts' },
    { char: '💘', name: 'corazón flechado', keywords: ['amor', 'cupido', 'enamorado'], category: 'hearts' },
    { char: '💝', name: 'corazón regalo', keywords: ['amor', 'regalo', 'sorpresa'], category: 'hearts' },

    // Símbolos (Objects)
    { char: '🚀', name: 'cohete', keywords: ['lanzamiento', 'futuro', 'crecimiento', 'rápido', 'adelante'], category: 'objects' },
    { char: '💡', name: 'idea', keywords: ['luz', 'idea', 'inteligencia', 'pensar', 'solución'], category: 'objects' },
    { char: '⭐', name: 'estrella', keywords: ['favorito', 'especial', 'brillar', 'calificación'], category: 'objects' },
    { char: '✨', name: 'chispas', keywords: ['brillo', 'magia', 'nuevo', 'limpio', 'especial'], category: 'objects' },
    { char: '🌟', name: 'estrella brillante', keywords: ['brillar', 'especial', 'ganador'], category: 'objects' },
    { char: '📢', name: 'megáfono', keywords: ['anuncio', 'aviso', 'atención', 'difusión', 'comunicado'], category: 'objects' },
    { char: '🔔', name: 'campana', keywords: ['notificación', 'alerta', 'atención'], category: 'objects' },
    { char: '📅', name: 'calendario', keywords: ['fecha', 'evento', 'reunión', 'día'], category: 'objects' },
    { char: '📆', name: 'calendario fecha', keywords: ['fecha', 'evento', 'reunión', 'día'], category: 'objects' },
    { char: '📝', name: 'nota', keywords: ['escribir', 'nota', 'documento', 'tarea'], category: 'objects' },
    { char: '📋', name: 'portapapeles', keywords: ['lista', 'tareas', 'verificar', 'documento'], category: 'objects' },
    { char: '📁', name: 'carpeta', keywords: ['archivo', 'documento', 'organizar'], category: 'objects' },
    { char: '📂', name: 'carpeta abierta', keywords: ['archivo', 'documento', 'abrir'], category: 'objects' },
    { char: '📌', name: 'chincheta', keywords: ['fijar', 'importante', 'ubicar', 'lugar'], category: 'objects' },
    { char: '📍', name: 'chincheta redonda', keywords: ['ubicación', 'mapa', 'lugar', 'aquí'], category: 'objects' },
    { char: '📎', name: 'clip', keywords: ['adjunto', 'archivo', 'unir'], category: 'objects' },
    { char: '💻', name: 'laptop', keywords: ['computadora', 'tecnología', 'trabajo', 'internet'], category: 'objects' },
    { char: '📱', name: 'celular', keywords: ['teléfono', 'móvil', 'whatsapp', 'llamada'], category: 'objects' },
    { char: '📞', name: 'teléfono', keywords: ['llamada', 'teléfono', 'contacto'], category: 'objects' },
    { char: '✉️', name: 'sobre', keywords: ['correo', 'mensaje', 'email'], category: 'objects' },
    { char: '🎁', name: 'regalo', keywords: ['sorpresa', 'cumpleaños', 'fiesta', 'obsequio'], category: 'objects' },
    { char: '🎉', name: 'con confetti', keywords: ['fiesta', 'celebración', 'felicitaciones', 'evento'], category: 'objects' },
    { char: '🏆', name: 'trofeo', keywords: ['premio', 'ganador', 'éxito', 'primero'], category: 'objects' },
    { char: '🏛️', name: 'templo', keywords: ['club', 'institución', 'gobierno', 'sede'], category: 'objects' },
    { char: '🌍', name: 'mundo', keywords: ['tierra', 'planeta', 'global', 'internacional', 'comunidad'], category: 'objects' },
];

interface CustomEmojiPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

const CustomEmojiPicker: React.FC<CustomEmojiPickerProps> = ({ onSelect, onClose }) => {
    const [search, setSearch] = useState('');
    const [activeCat, setActiveCat] = useState<'all' | 'smileys' | 'gestures' | 'hearts' | 'objects'>('all');

    const categories = [
        { key: 'all', label: 'Todos' },
        { key: 'smileys', label: 'Caritas' },
        { key: 'gestures', label: 'Gestos' },
        { key: 'hearts', label: 'Corazones' },
        { key: 'objects', label: 'Objetos' },
    ] as const;

    const filteredEmojis = EMOJI_DATABASE.filter(emoji => {
        const matchesCategory = activeCat === 'all' || emoji.category === activeCat;
        const matchesSearch = !search.trim() || 
            emoji.name.toLowerCase().includes(search.toLowerCase()) || 
            emoji.keywords.some(k => k.toLowerCase().includes(search.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden w-[300px] flex flex-col h-[320px]">
            {/* Header */}
            <div className="p-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Selector de Emojis</span>
                <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            
            {/* Search Input */}
            <div className="p-2 border-b border-gray-100">
                <input 
                    type="text" 
                    value={search} 
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar emoji..." 
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-green-500 bg-white"
                />
            </div>
            
            {/* Category Selector */}
            <div className="flex gap-1 p-1 bg-gray-50 border-b border-gray-100 overflow-x-auto whitespace-nowrap scrollbar-thin">
                {categories.map(cat => (
                    <button
                        key={cat.key}
                        onClick={() => setActiveCat(cat.key)}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                            activeCat === cat.key 
                                ? 'bg-green-600 text-white shadow-sm' 
                                : 'text-gray-500 hover:bg-gray-200'
                        }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>
            
            {/* Emoji Grid */}
            <div className="flex-1 p-2 overflow-y-auto grid grid-cols-6 gap-1 bg-white">
                {filteredEmojis.length === 0 ? (
                    <p className="col-span-6 text-center py-8 text-xs text-gray-400 font-medium">No se encontraron emojis</p>
                ) : (
                    filteredEmojis.map(emoji => (
                        <button
                            key={emoji.char}
                            onClick={() => onSelect(emoji.char)}
                            title={emoji.name}
                            className="w-9 h-9 text-xl flex items-center justify-center rounded-lg hover:bg-green-50 transition-colors active:scale-90"
                        >
                            {emoji.char}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};

const API = import.meta.env.VITE_API_URL || '/api';

interface Contact {
    id: string; name: string; phone: string; email?: string;
    profilePictureUrl?: string;
    tags?: string[]; status: string; lists?: any[];
    metadata?: any; createdAt: string; archivedAt?: string | null;
    lastMessage?: { bodyText?: string; templateName?: string; direction: string; status: string; createdAt: string } | null;
    unreadCount?: number;
}
interface Message {
    id: string; bodyText?: string; templateName?: string; campaignId?: string;
    status: string; sentAt?: string; deliveredAt?: string;
    readAt?: string; createdAt: string; direction?: string;
}

type ChatFilter = 'all' | 'unread' | 'archived';

interface Props {
    clubId?: string;
}

const WhatsAppChat: React.FC<Props> = ({ clubId }) => {
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
    const [activeFilter, setActiveFilter] = useState<ChatFilter>('all');
    const [chatMessage, setChatMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchContacts(); fetchTemplates(); }, [clubId]);
    useEffect(() => { fetchContacts(); }, [activeFilter, clubId]);
    useEffect(() => {
        if (!searchQuery.trim()) { setFilteredContacts(contacts); return; }
        const q = searchQuery.toLowerCase();
        setFilteredContacts(contacts.filter(c => {
            const name = c.name || '';
            const phone = c.phone || '';
            const email = c.email || '';
            return name.toLowerCase().includes(q) || phone.includes(q) || email.toLowerCase().includes(q);
        }));
    }, [searchQuery, contacts]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // --- POLLING ENGINE (Phase 2) ---
    const fetchContactsSilent = async () => {
        try {
            const h: any = { Authorization: `Bearer ${token}` };
            if (clubId) h['x-club-id'] = clubId;
            const filterParam = activeFilter === 'all' ? '' : `&filter=${activeFilter}`;
            const res = await fetch(`${API}/whatsapp/contacts?limit=500${filterParam}`, { headers: h });
            const data = await res.json();
            setContacts(data.contacts || []);
        } catch { }
    };

    const fetchMessagesSilent = async (contactId: string) => {
        try {
            const h: any = { Authorization: `Bearer ${token}` };
            if (clubId) h['x-club-id'] = clubId;
            const res = await fetch(`${API}/whatsapp/contacts/${contactId}/messages`, { headers: h });
            if (res.ok) {
                const data = await res.json();
                const newMsgs = data.messages || [];
                setMessages(prev => {
                    if (newMsgs.length !== prev.length) return newMsgs;
                    // Check if last message status changed (e.g., delivered -> read)
                    if (prev.length > 0 && newMsgs.length > 0) {
                        if (prev[prev.length - 1].status !== newMsgs[newMsgs.length - 1].status) return newMsgs;
                    }
                    return prev;
                });
            }
        } catch { }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            fetchContactsSilent();
            if (selectedContact) {
                fetchMessagesSilent(selectedContact.id);
            }
        }, 8000);
        return () => clearInterval(interval);
    }, [activeFilter, selectedContact, token, clubId]);
    // -------------------------------

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const h: any = { Authorization: `Bearer ${token}` };
            if (clubId) h['x-club-id'] = clubId;
            const filterParam = activeFilter === 'all' ? '' : `&filter=${activeFilter}`;
            const res = await fetch(`${API}/whatsapp/contacts?limit=500${filterParam}`, { headers: h });
            const data = await res.json();
            setContacts(data.contacts || []);
        } catch { } finally { setLoading(false); }
    };

    const fetchMessages = async (contactId: string) => {
        setLoadingMsgs(true);
        try {
            const h: any = { Authorization: `Bearer ${token}` };
            if (clubId) h['x-club-id'] = clubId;
            const res = await fetch(`${API}/whatsapp/contacts/${contactId}/messages`, { headers: h });
            if (res.ok) {
                const data = await res.json();
                setMessages(data.messages || []);
            } else {
                setMessages([]);
            }
        } catch { setMessages([]); }
        finally { setLoadingMsgs(false); }
    };

    const selectContact = async (contact: Contact) => {
        setSelectedContact(contact);
        fetchMessages(contact.id);
        // Mark as read if there are unread messages
        if (contact.unreadCount && contact.unreadCount > 0) {
            try {
                const h: any = { Authorization: `Bearer ${token}` };
                if (clubId) h['x-club-id'] = clubId;
                await fetch(`${API}/whatsapp/contacts/${contact.id}/read`, {
                    method: 'POST',
                    headers: h
                });
                fetchContactsSilent();
            } catch { }
        }
    };

    const handleArchive = async (contactId: string, archive: boolean) => {
        try {
            await fetch(`${API}/whatsapp/contacts/${contactId}/archive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ archived: archive }),
            });
            toast.success(archive ? 'Conversación archivada' : 'Conversación desarchivada');
            if (selectedContact?.id === contactId) setSelectedContact(null);
            fetchContacts();
        } catch {
            toast.error('Error al archivar');
        }
    };

    const getInitials = (name: string | null | undefined) => {
        if (!name) return 'WA';
        return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
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
            const h: any = { Authorization: `Bearer ${token}` };
            if (clubId) h['x-club-id'] = clubId;
            const res = await fetch(`${API}/whatsapp/templates`, { headers: h });
            if (res.ok) {
                const data = await res.json();
                const tpls = Array.isArray(data) ? data : (data.templates || []);
                setTemplates(tpls.filter((t: any) => t.status === 'approved'));
            }
        } catch { }
    };

    const executeSend = async (payload: any, successMsg: string) => {
        if (!selectedContact || sending) return;
        setSending(true);
        try {
            const h: any = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
            if (clubId) h['x-club-id'] = clubId;
            const res = await fetch(`${API}/whatsapp/contacts/${selectedContact.id}/send`, {
                method: 'POST',
                headers: h,
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setMessages(prev => [...prev, data.message]);
                setChatMessage('');
                setSelectedTemplate(null);
                setMediaUrl('');
                toast.success(successMsg);
            } else {
                toast.error(data.error || 'Error al enviar');
            }
        } catch (err: any) {
            toast.error('Error de conexión al enviar mensaje');
        } finally { setSending(false); }
    };

    const handleSendTemplate = async (template: any) => {
        const vars: any = {};
        if (mediaUrl.trim()) vars.mediaUrl = mediaUrl.trim();
        await executeSend({ templateId: template.id, vars }, `Plantilla "${template.displayName || template.name}" enviada a ${selectedContact?.name}`);
    };

    const handleSendText = async () => {
        if (!chatMessage.trim()) return;
        await executeSend({ text: chatMessage.trim() }, `Mensaje enviado a ${selectedContact?.name}`);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingMedia(true);
        try {
            const h: any = { Authorization: `Bearer ${token}` };
            if (clubId) h['x-club-id'] = clubId;
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch(`${API}/whatsapp/upload-media`, {
                method: 'POST',
                headers: h,
                body: formData,
            });
            const uploadData = await uploadRes.json();
            
            if (uploadRes.ok && uploadData.url) {
                let mediaType = 'document';
                if (file.type.startsWith('image/')) mediaType = 'image';
                else if (file.type.startsWith('video/')) mediaType = 'video';
                else if (file.type.startsWith('audio/')) mediaType = 'audio';

                await executeSend({
                    mediaUrl: uploadData.url,
                    mediaType,
                    fileName: file.name,
                    text: chatMessage.trim()
                }, `Archivo adjunto enviado a ${selectedContact?.name}`);
                setChatMessage('');
            } else {
                toast.error(uploadData.error || 'Error al subir archivo');
            }
        } catch (err) {
            toast.error('Error de conexión al subir archivo');
        } finally {
            setUploadingMedia(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const toggleTag = async (tag: string) => {
        if (!selectedContact) return;
        const currentTags = selectedContact.tags || [];
        const isSelected = currentTags.some((t: any) => {
            const tStr = typeof t === 'string' ? t : (t.name || t.label || String(t));
            return tStr.toLowerCase() === tag.toLowerCase();
        });
        const newTags = isSelected 
            ? currentTags.filter((t: any) => {
                const tStr = typeof t === 'string' ? t : (t.name || t.label || String(t));
                return tStr.toLowerCase() !== tag.toLowerCase();
              })
            : [...currentTags, tag];
        
        try {
            const res = await fetch(`${API}/whatsapp/contacts/${selectedContact.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ tags: newTags })
            });
            if (res.ok) {
                const updated = await res.json();
                setSelectedContact(updated);
                setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
                toast.success(isSelected ? 'Etiqueta removida' : 'Etiqueta añadida');
            }
        } catch { toast.error('Error al actualizar etiquetas'); }
    };

    const renderMessageBody = (text: string | null | undefined, msg: any, isOutgoing: boolean) => {
        // If this is a template message, render the template content beautifully
        if (msg.templateName && text && !text.startsWith('[MEDIA|') && !text.startsWith('[Template:')) {
            return (
                <div className="flex flex-col gap-1">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
                </div>
            );
        }

        if (!text) return <p className="text-sm leading-relaxed whitespace-pre-wrap">{`[Plantilla: ${msg.templateName || 'desconocida'}]`}</p>;
    
        // Check for media encoding: [MEDIA|type|url] caption  (Make it robust with /s just in case)
        const mediaMatch = text.match(/^\[MEDIA\|(image|video|document|audio)\|(https?:\/\/[^\]]+)\]([\s\S]*)$/i);
        if (mediaMatch) {
            const [, type, url, caption] = mediaMatch;
            return (
                <div className="flex flex-col gap-2">
                    {type === 'image' && (
                        <div className="bg-black/5 rounded-lg overflow-hidden flex justify-center">
                            <img src={url} alt="Attachment" className="max-w-full object-contain max-h-[250px]" />
                        </div>
                    )}
                    {type === 'video' && (
                        <video src={url} controls className="max-w-full rounded-lg max-h-[250px] bg-black/5" />
                    )}
                    {type === 'audio' && (
                        <audio src={url} controls className="w-full max-w-[250px]" />
                    )}
                    {type === 'document' && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 p-3 rounded-lg bg-black/10 hover:bg-black/20 transition-colors ${isOutgoing ? 'text-white' : 'text-green-700'}`}>
                            <FileText className="w-6 h-6 flex-shrink-0" />
                            <span className="text-xs truncate font-bold">Abrir Documento Adjunto</span>
                        </a>
                    )}
                    {caption.trim() && <p className="text-sm leading-relaxed whitespace-pre-wrap">{caption.trim()}</p>}
                </div>
            );
        }
        
        return <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>;
    };

    const tagColors: { [key: string]: string } = {
        'vip': 'bg-yellow-100 text-yellow-700 border-yellow-200',
        'socio': 'bg-blue-100 text-blue-700 border-blue-200',
        'rotary': 'bg-purple-100 text-purple-700 border-purple-200',
        'default': 'bg-gray-100 text-gray-600 border-gray-200',
    };
    const getTagStyle = (tag: any) => {
        if (!tag) return tagColors.default;
        const tagStr = typeof tag === 'string' ? tag : (tag.name || tag.label || String(tag));
        return tagColors[tagStr.toLowerCase()] || tagColors.default;
    };

    const getLastMessagePreview = (contact: Contact): string => {
        if (!contact.lastMessage) return contact.phone;
        const lm = contact.lastMessage;
        if (lm.bodyText) {
            const txt = lm.bodyText.length > 45 ? lm.bodyText.substring(0, 45) + '…' : lm.bodyText;
            return lm.direction === 'outgoing' ? `Tú: ${txt}` : txt;
        }
        if (lm.templateName) return `📋 ${lm.templateName}`;
        return contact.phone;
    };

    const filterTabs: { key: ChatFilter; label: string; icon: React.ReactNode }[] = [
        { key: 'all', label: 'Todos', icon: <Inbox className="w-3.5 h-3.5" /> },
        { key: 'unread', label: 'No leídos', icon: <Mail className="w-3.5 h-3.5" /> },
        { key: 'archived', label: 'Archivados', icon: <Archive className="w-3.5 h-3.5" /> },
    ];

    const unreadTotal = contacts.filter(c => (c.unreadCount || 0) > 0).length;

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

                    {/* Filter Tabs */}
                    <div className="flex border-b border-gray-100 bg-gray-50/50">
                        {filterTabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveFilter(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-all relative ${
                                    activeFilter === tab.key
                                        ? 'text-green-700 bg-white border-b-2 border-green-500'
                                        : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                                {tab.key === 'unread' && unreadTotal > 0 && activeFilter !== 'unread' && (
                                    <span className="absolute -top-0.5 right-2 bg-green-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                        {unreadTotal > 9 ? '9+' : unreadTotal}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Contact List */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                        ) : filteredContacts.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-bold">
                                    {activeFilter === 'unread' ? 'Sin mensajes no leídos' :
                                     activeFilter === 'archived' ? 'Sin conversaciones archivadas' :
                                     'Sin conversaciones'}
                                </p>
                            </div>
                        ) : filteredContacts.map(contact => (
                            <div key={contact.id}
                                className={`group relative flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 ${
                                    selectedContact?.id === contact.id ? 'bg-green-50/60 border-l-2 border-l-green-500' : ''
                                } ${(contact.unreadCount || 0) > 0 ? 'bg-green-50/30' : ''}`}
                                onClick={() => selectContact(contact)}
                            >
                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    {contact.profilePictureUrl ? (
                                        <img 
                                            src={contact.profilePictureUrl} 
                                            alt={contact.name} 
                                            className="w-11 h-11 rounded-full object-cover shadow-sm border border-gray-100"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).parentElement?.querySelector('.avatar-fallback')?.classList.remove('hidden');
                                            }}
                                        />
                                    ) : null}
                                    <div className={`avatar-fallback w-11 h-11 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-sm ${contact.profilePictureUrl ? 'hidden' : ''}`}>
                                        {getInitials(contact.name)}
                                    </div>
                                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(contact)}`} />
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className={`text-sm truncate ${(contact.unreadCount || 0) > 0 ? 'font-black text-gray-900' : 'font-bold text-gray-900'}`}>
                                            {contact.name}
                                        </p>
                                        <span className={`text-[10px] flex-shrink-0 ml-2 ${(contact.unreadCount || 0) > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                                            {contact.lastMessage ? formatTime(contact.lastMessage.createdAt) : formatTime(contact.createdAt)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-0.5">
                                        <p className={`text-xs truncate ${(contact.unreadCount || 0) > 0 ? 'text-gray-700 font-semibold' : 'text-gray-500'}`}>
                                            {contact.lastMessage?.direction === 'outgoing' && (
                                                <span className="text-blue-400 mr-0.5">
                                                    {contact.lastMessage.status === 'read' ? '✓✓ ' : 
                                                     contact.lastMessage.status === 'delivered' ? '✓✓ ' : 
                                                     contact.lastMessage.status === 'failed' ? '✗ ' : '✓ '}
                                                </span>
                                            )}
                                            {getLastMessagePreview(contact)}
                                        </p>
                                        {(contact.unreadCount || 0) > 0 && (
                                            <span className="bg-green-500 text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-sm ml-1.5 flex-shrink-0">
                                                {contact.unreadCount}
                                            </span>
                                        )}
                                    </div>
                                    {contact.tags && contact.tags.length > 0 && (
                                        <div className="flex gap-1 mt-1.5 flex-wrap">
                                            {contact.tags.slice(0, 2).map((tag: any) => {
                                                const tagKey = typeof tag === 'string' ? tag : (tag.id || tag.name || String(tag));
                                                const tagLabel = typeof tag === 'string' ? tag : (tag.name || tag.label || String(tag));
                                                return (
                                                    <span key={tagKey} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${getTagStyle(tag)}`}>
                                                        {tagLabel}
                                                    </span>
                                                );
                                            })}
                                            {contact.tags.length > 2 && <span className="text-[9px] text-gray-400">+{contact.tags.length - 2}</span>}
                                        </div>
                                    )}
                                </div>
                                {/* Archive button on hover */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleArchive(contact.id, !contact.archivedAt); }}
                                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                                    title={contact.archivedAt ? 'Desarchivar' : 'Archivar'}
                                >
                                    {contact.archivedAt ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Footer Stats */}
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex justify-between">
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{filteredContacts.length} contactos</span>
                        {unreadTotal > 0 && activeFilter !== 'unread' && (
                            <span className="text-[10px] text-green-600 font-bold">{unreadTotal} no leídos</span>
                        )}
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
                                    {selectedContact.profilePictureUrl ? (
                                        <img 
                                            src={selectedContact.profilePictureUrl} 
                                            alt={selectedContact.name} 
                                            className="w-10 h-10 rounded-full object-cover shadow-sm border border-gray-100"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).parentElement?.querySelector('.header-avatar-fallback')?.classList.remove('hidden');
                                            }}
                                        />
                                    ) : null}
                                    <div className={`header-avatar-fallback w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm ${selectedContact.profilePictureUrl ? 'hidden' : ''}`}>
                                        {getInitials(selectedContact.name)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 text-sm">{selectedContact.name}</p>
                                        <p className="text-xs text-gray-500">{selectedContact.phone}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleArchive(selectedContact.id, !selectedContact.archivedAt)}
                                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                                        title={selectedContact.archivedAt ? 'Desarchivar' : 'Archivar'}
                                    >
                                        {selectedContact.archivedAt ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                                    </button>
                                    <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><Phone className="w-4 h-4" /></button>
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
                                                            {msg.templateName && !msg.bodyText?.startsWith('[MEDIA|') && (
                                                                <div className={`flex items-center gap-1.5 mb-1.5 pb-1.5 border-b ${isOutgoing ? 'border-green-400/30' : 'border-gray-200'}`}>
                                                                    <span className={`text-[10px] ${isOutgoing ? 'text-green-200' : 'text-green-600'}`}>📋</span>
                                                                    <span className={`text-[10px] font-bold ${isOutgoing ? 'text-green-200' : 'text-green-600'}`}>
                                                                        {msg.templateName}
                                                                    </span>
                                                                    {msg.campaignId && (
                                                                        <span className={`text-[9px] ml-auto px-1.5 py-0.5 rounded-full font-medium ${isOutgoing ? 'bg-green-400/20 text-green-100' : 'bg-green-100 text-green-600'}`}>
                                                                            Campaña
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {renderMessageBody(msg.bodyText, msg, isOutgoing)}
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
                                        <p className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1.5">
                                            <FileText className="w-3 h-3" /> Enviar plantilla oficial a {selectedContact.name}
                                        </p>
                                        <div className="flex gap-2">
                                            <select
                                                value={selectedTemplate?.id || ''}
                                                onChange={(e) => {
                                                    const t = templates.find((tpl: any) => tpl.id === e.target.value);
                                                    setSelectedTemplate(t || null);
                                                    setMediaUrl('');
                                                }}
                                                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs bg-white outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
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
                                                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                                            >
                                                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                Enviar Plantilla
                                            </button>
                                        </div>
                                        {selectedTemplate && ['IMAGE','VIDEO','DOCUMENT'].includes(selectedTemplate.headerType) && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
                                                <p className="text-[10px] font-bold text-amber-700 mb-1">
                                                    📎 URL {selectedTemplate.headerType === 'IMAGE' ? 'imagen' : selectedTemplate.headerType === 'VIDEO' ? 'video' : 'documento'} (opcional)
                                                </p>
                                                <input
                                                    value={mediaUrl}
                                                    onChange={e => setMediaUrl(e.target.value)}
                                                    placeholder={selectedTemplate.headerType === 'IMAGE' ? 'https://ejemplo.com/imagen.jpg' : selectedTemplate.headerType === 'VIDEO' ? 'https://ejemplo.com/video.mp4' : 'https://ejemplo.com/doc.pdf'}
                                                    className="w-full px-2 py-1.5 rounded-md border border-amber-300 text-xs outline-none focus:border-amber-500 bg-white"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 text-gray-400">
                                        <FileText className="w-4 h-4" />
                                        <p className="text-xs">No hay plantillas aprobadas.</p>
                                    </div>
                                )}
                            </div>

                            {/* Free Text Chat Input */}
                            <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 pb-4 relative">
                                {showEmojiPicker && (
                                    <div className="absolute bottom-[80px] left-4 z-50 shadow-2xl rounded-xl overflow-hidden border border-gray-100">
                                        <CustomEmojiPicker 
                                            onSelect={(emoji) => setChatMessage(prev => prev + emoji)}
                                            onClose={() => setShowEmojiPicker(false)}
                                        />
                                    </div>
                                )}
                                <div className="flex gap-2 items-end relative">
                                    <button 
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className={`p-2 mb-1.5 rounded-full text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors ${showEmojiPicker ? 'text-green-600 bg-green-50' : ''}`}
                                        title="Emojis"
                                    >
                                        <Smile className="w-6 h-6" />
                                    </button>
                                    
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        ref={fileInputRef} 
                                        onChange={handleFileUpload} 
                                    />
                                    
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingMedia || sending}
                                        className="p-2 mb-1.5 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                                        title="Adjuntar archivo, foto o video"
                                    >
                                        {uploadingMedia ? <Loader2 className="w-6 h-6 animate-spin text-blue-500" /> : <Paperclip className="w-6 h-6" />}
                                    </button>
                                    
                                    <div className="flex-1 relative">
                                        {uploadingMedia && (
                                            <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center rounded-xl p-2 border border-blue-100">
                                                <p className="text-xs font-bold text-blue-600 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin"/> Subiendo archivo...</p>
                                            </div>
                                        )}
                                        <textarea 
                                            value={chatMessage} 
                                            onChange={e => setChatMessage(e.target.value)}
                                            onFocus={() => setShowEmojiPicker(false)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendText();
                                                    setShowEmojiPicker(false);
                                                }
                                            }}
                                            placeholder="Escribe un mensaje libre... (El contacto debe haberte escrito en las últimas 24h)"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 resize-none max-h-32"
                                            rows={1}
                                            style={{ minHeight: '44px' }}
                                        />
                                    </div>
                                    <button 
                                        onClick={() => { handleSendText(); setShowEmojiPicker(false); }}
                                        disabled={sending || (!chatMessage.trim() && !uploadingMedia)}
                                        className="p-3 mb-0.5 rounded-full bg-green-600 text-white shadow-sm hover:bg-green-700 disabled:opacity-40 transition-colors flex items-center justify-center flex-shrink-0"
                                        title="Enviar mensaje"
                                    >
                                        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                    </button>
                                </div>
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
                            {selectedContact.profilePictureUrl ? (
                                <img 
                                    src={selectedContact.profilePictureUrl} 
                                    alt={selectedContact.name} 
                                    className="w-20 h-20 rounded-full object-cover shadow-lg mb-3 border-2 border-white"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).parentElement?.querySelector('.panel-avatar-fallback')?.classList.remove('hidden');
                                    }}
                                />
                            ) : null}
                            <div className={`panel-avatar-fallback w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-black text-2xl shadow-lg mb-3 ${selectedContact.profilePictureUrl ? 'hidden' : ''}`}>
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
                                <p className="text-xs font-bold text-gray-500 uppercase">Kamban / Etiquetas</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {['vip', 'socio', 'rotary', 'prospecto'].map(tag => {
                                    const isActive = selectedContact.tags?.some((t: any) => {
                                        const tStr = typeof t === 'string' ? t : (t.name || t.label || String(t));
                                        return tStr.toLowerCase() === tag.toLowerCase();
                                    });
                                    return (
                                        <button 
                                            key={tag}
                                            onClick={() => toggleTag(tag)}
                                            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${isActive ? getTagStyle(tag) : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700'}`}
                                            title={isActive ? 'Quitar etiqueta' : 'Añadir etiqueta'}
                                        >
                                            {isActive ? '✓ ' : '+ '}{tag.toUpperCase()}
                                        </button>
                                    );
                                })}
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
                                {selectedContact.archivedAt && (
                                    <div className="flex justify-between">
                                        <span className="text-xs text-gray-400">Archivado</span>
                                        <span className="text-xs text-amber-600 font-bold">Sí</span>
                                    </div>
                                )}
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
