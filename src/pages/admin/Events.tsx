import { useState, useEffect, useRef } from 'react';
import {
    Plus, Trash2, Save, Calendar, ChevronDown, ChevronUp,
    MapPin, Clock, Image, X, Upload, Code, Eye, EyeOff,
    ImagePlus, Link as LinkIcon, ExternalLink
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';

interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    htmlContent?: string;
    startDate: string;
    endDate?: string;
    location?: string;
    type: string;
    image?: string;
    images?: string[];
    clubId: string;
}

const EVENT_TYPES = [
    { value: 'meeting', label: 'Reunión' },
    { value: 'Servicio', label: 'Servicio' },
    { value: 'Fundraising', label: 'Fundraising' },
    { value: 'Fija', label: 'Fija' },
    { value: 'Institucional', label: 'Institucional' },
    { value: 'Integración', label: 'Integración' },
    { value: 'conference', label: 'Conferencia' },
    { value: 'other', label: 'Otro' },
];

const TYPE_COLORS: Record<string, string> = {
    meeting: 'bg-blue-100 text-blue-700',
    Servicio: 'bg-green-100 text-green-700',
    Fundraising: 'bg-yellow-100 text-yellow-700',
    Fija: 'bg-purple-100 text-purple-700',
    Institucional: 'bg-indigo-100 text-indigo-700',
    Integración: 'bg-pink-100 text-pink-700',
    conference: 'bg-orange-100 text-orange-700',
    other: 'bg-gray-100 text-gray-700',
};

const emptyForm = {
    title: '',
    description: '',
    htmlContent: '',
    startDate: '',
    endDate: '',
    location: '',
    type: 'meeting',
    image: '',
    images: [] as string[],
};

// ── Simple HTML Editor with preview ──────────────────────────────────────────
const HtmlEditor = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) => {
    const [preview, setPreview] = useState(false);
    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 px-4 py-2">
                <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Editor HTML</span>
                </div>
                <button
                    type="button"
                    onClick={() => setPreview(!preview)}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                    {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {preview ? 'Editar' : 'Vista previa'}
                </button>
            </div>

            {preview ? (
                <div
                    className="min-h-[200px] p-6 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: value || '<p class="text-gray-400">Sin contenido aún...</p>' }}
                />
            ) : (
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-3 font-mono text-sm text-gray-800 bg-white resize-y outline-none"
                    placeholder={`<h2>Bienvenidos a la V Conferencia LATIR</h2>\n<p>Descripción enriquecida del evento...</p>\n<ul>\n  <li>Punto 1</li>\n  <li>Punto 2</li>\n</ul>`}
                />
            )}
        </div>
    );
};

// ── Image Uploader ────────────────────────────────────────────────────────────
const ImageUploader = ({
    label,
    currentUrl,
    onUploaded,
    onUrlChange,
}: {
    label: string;
    currentUrl: string;
    onUploaded: (url: string) => void;
    onUrlChange: (url: string) => void;
}) => {
    const [uploading, setUploading] = useState(false);
    const [tab, setTab] = useState<'upload' | 'url'>('upload');
    const inputRef = useRef<HTMLInputElement>(null);
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('rotary_token');

    const handleFile = async (file: File) => {
        setUploading(true);
        try {
            const form = new FormData();
            form.append('image', file);
            const res = await fetch(`${API}/calendar/events/upload-image`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });
            const data = await res.json();
            if (data.url) onUploaded(data.url);
        } catch {
            alert('Error al subir la imagen');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700">{label}</label>

            {/* Tab switcher */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    type="button"
                    onClick={() => setTab('upload')}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${tab === 'upload' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Upload className="w-3 h-3 inline mr-1" />Subir archivo
                </button>
                <button
                    type="button"
                    onClick={() => setTab('url')}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${tab === 'url' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <LinkIcon className="w-3 h-3 inline mr-1" />URL externa
                </button>
            </div>

            {tab === 'upload' ? (
                <div
                    onClick={() => inputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-6 text-center cursor-pointer transition-colors group"
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />
                    {uploading ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-gray-500">Subiendo imagen...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <ImagePlus className="w-8 h-8 text-gray-300 group-hover:text-blue-400 transition-colors" />
                            <p className="text-sm text-gray-500">Haz clic o arrastra una imagen</p>
                            <p className="text-xs text-gray-400">JPG, PNG, WEBP · Máx. 10MB</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex gap-2">
                    <input
                        type="url"
                        value={currentUrl}
                        onChange={e => onUrlChange(e.target.value)}
                        placeholder="https://ejemplo.com/imagen.jpg"
                        className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {currentUrl && (
                        <a href={currentUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                            <ExternalLink className="w-4 h-4 text-gray-600" />
                        </a>
                    )}
                </div>
            )}

            {/* Preview */}
            {currentUrl && (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 group">
                    <img src={currentUrl} alt="preview" className="w-full h-full object-cover" />
                    <button
                        type="button"
                        onClick={() => onUploaded('')}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
};

// ── Gallery Manager ───────────────────────────────────────────────────────────
const GalleryManager = ({
    images,
    onChange,
}: {
    images: string[];
    onChange: (imgs: string[]) => void;
}) => {
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('rotary_token');

    const handleFiles = async (files: FileList) => {
        setUploading(true);
        const newUrls: string[] = [];
        try {
            for (const file of Array.from(files)) {
                const form = new FormData();
                form.append('image', file);
                const res = await fetch(`${API}/calendar/events/upload-image`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: form,
                });
                const data = await res.json();
                if (data.url) newUrls.push(data.url);
            }
            onChange([...images, ...newUrls]);
        } catch {
            alert('Error al subir imágenes');
        } finally {
            setUploading(false);
        }
    };

    const remove = (idx: number) => {
        onChange(images.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700">
                <Image className="w-4 h-4 inline mr-1.5" />
                Galería Multimedia ({images.length} imagen{images.length !== 1 ? 'es' : ''})
            </label>

            {/* Grid */}
            {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {images.map((url, idx) => (
                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                            <img src={url} alt={`gallery-${idx}`} className="w-full h-full object-cover" />
                            <button
                                type="button"
                                onClick={() => remove(idx)}
                                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                                <X className="w-5 h-5 text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload zone */}
            <div
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-5 text-center cursor-pointer transition-colors group"
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => e.target.files && handleFiles(e.target.files)}
                />
                {uploading ? (
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-gray-500">Subiendo imágenes...</span>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-2">
                        <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                        <p className="text-sm text-gray-500">Agrega más imágenes (selección múltiple)</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
const EventsManagement = () => {
    const { user } = useAuth();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [newEvent, setNewEvent] = useState(emptyForm);
    const [activeTab, setActiveTab] = useState<Record<string, 'info' | 'media' | 'html'>>({});

    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('rotary_token');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const fetchEvents = async () => {
        try {
            const res = await fetch(`${API}/calendar`, { headers });
            const data = await res.json();
            setEvents(data.events || []);
        } catch {
            console.error('Error fetching events');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEvents(); }, []);

    const getTab = (id: string) => activeTab[id] || 'info';
    const setTab = (id: string, tab: 'info' | 'media' | 'html') =>
        setActiveTab(prev => ({ ...prev, [id]: tab }));

    const handleCreate = async () => {
        if (!newEvent.title.trim() || !newEvent.startDate) return;
        setSaving('new');
        try {
            const res = await fetch(`${API}/calendar/events`, {
                method: 'POST',
                headers,
                body: JSON.stringify(newEvent),
            });
            if (res.ok) {
                setNewEvent(emptyForm);
                setShowAdd(false);
                await fetchEvents();
            }
        } finally {
            setSaving(null);
        }
    };

    const handleUpdate = async (event: CalendarEvent) => {
        setSaving(event.id);
        try {
            await fetch(`${API}/calendar/events/${event.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(event),
            });
            await fetchEvents();
        } finally {
            setSaving(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este evento?')) return;
        try {
            await fetch(`${API}/calendar/events/${id}`, { method: 'DELETE', headers });
            await fetchEvents();
        } catch {
            console.error('Error deleting event');
        }
    };

    const updateEventField = (id: string, field: string, value: any) => {
        setEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('es-ES', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        });
    };

    const toInputDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toISOString().slice(0, 16);
    };

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <Calendar className="w-7 h-7 text-blue-600" />
                            Gestión de Eventos
                        </h1>
                        <p className="text-gray-500 mt-1">
                            {events.length} evento{events.length !== 1 ? 's' : ''} registrado{events.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAdd(!showAdd)}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Evento
                    </button>
                </div>

                {/* Create form */}
                {showAdd && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-4">
                        <h3 className="font-bold text-gray-900">Nuevo Evento</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                                <input
                                    type="text"
                                    value={newEvent.title}
                                    onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Nombre del evento"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio *</label>
                                <input type="datetime-local" value={newEvent.startDate}
                                    onChange={e => setNewEvent({ ...newEvent, startDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                                <input type="datetime-local" value={newEvent.endDate}
                                    onChange={e => setNewEvent({ ...newEvent, endDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                                <input type="text" value={newEvent.location}
                                    onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Lugar del evento" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select value={newEvent.type}
                                    onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción breve</label>
                                <textarea value={newEvent.description}
                                    onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    placeholder="Describe el evento en pocas palabras..." />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleCreate}
                                disabled={saving === 'new' || !newEvent.title.trim() || !newEvent.startDate}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                <Save className="w-4 h-4" />
                                {saving === 'new' ? 'Guardando...' : 'Guardar evento'}
                            </button>
                            <button onClick={() => { setShowAdd(false); setNewEvent(emptyForm); }}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800">
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Events list */}
                {events.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-600 mb-2">Sin eventos registrados</h3>
                        <p className="text-gray-400 mb-6">Crea el primer evento para que aparezca en el sitio.</p>
                        <button onClick={() => setShowAdd(true)}
                            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <Plus className="w-5 h-5" /> Crear primer evento
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {events
                            .slice()
                            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                            .map(event => (
                                <div key={event.id} className="bg-white rounded-xl border border-gray-200 hover:border-blue-200 transition-all shadow-sm">
                                    {/* Row header */}
                                    <div
                                        className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                                        onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                                    >
                                        {/* Cover thumbnail */}
                                        {event.image ? (
                                            <img src={event.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                                <Calendar className="w-5 h-5 text-gray-400" />
                                            </div>
                                        )}

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-gray-900 text-sm">{event.title}</h3>
                                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[event.type] || TYPE_COLORS.other}`}>
                                                    {EVENT_TYPES.find(t => t.value === event.type)?.label || event.type}
                                                </span>
                                                {event.images && event.images.length > 0 && (
                                                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                                        <Image className="w-3 h-3" /> {event.images.length}
                                                    </span>
                                                )}
                                                {event.htmlContent && (
                                                    <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                                        <Code className="w-3 h-3" /> HTML
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1">
                                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDate(event.startDate)}
                                                </span>
                                                {event.location && (
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" /> {event.location}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {expandedId === event.id
                                            ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                            : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                        }
                                    </div>

                                    {/* ── Edit panel ── */}
                                    {expandedId === event.id && (
                                        <div className="border-t border-gray-100">
                                            {/* Tab nav */}
                                            <div className="flex border-b border-gray-100 bg-gray-50/70">
                                                {(['info', 'media', 'html'] as const).map(tab => (
                                                    <button
                                                        key={tab}
                                                        type="button"
                                                        onClick={() => setTab(event.id, tab)}
                                                        className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${getTab(event.id) === tab
                                                            ? 'border-blue-600 text-blue-600 bg-white'
                                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                                            }`}
                                                    >
                                                        {{
                                                            info: '📋 Información',
                                                            media: '🖼️ Portada & Galería',
                                                            html: '</> Contenido HTML',
                                                        }[tab]}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="p-6 space-y-5">
                                                {/* ── Tab: Info ── */}
                                                {getTab(event.id) === 'info' && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="md:col-span-2">
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                                            <input
                                                                type="text"
                                                                value={event.title}
                                                                onChange={e => updateEventField(event.id, 'title', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                                                            <input type="datetime-local"
                                                                value={toInputDate(event.startDate)}
                                                                onChange={e => updateEventField(event.id, 'startDate', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                                                            <input type="datetime-local"
                                                                value={toInputDate(event.endDate || '')}
                                                                onChange={e => updateEventField(event.id, 'endDate', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                                                            <input type="text"
                                                                value={event.location || ''}
                                                                onChange={e => updateEventField(event.id, 'location', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                                placeholder="Ciudad, País" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                                            <select
                                                                value={event.type}
                                                                onChange={e => updateEventField(event.id, 'type', e.target.value)}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                                                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción breve (texto plano)</label>
                                                            <textarea
                                                                value={event.description || ''}
                                                                onChange={e => updateEventField(event.id, 'description', e.target.value)}
                                                                rows={3}
                                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                                                placeholder="Resumen breve del evento..." />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Tab: Media ── */}
                                                {getTab(event.id) === 'media' && (
                                                    <div className="space-y-8">
                                                        <ImageUploader
                                                            label="📸 Imagen de portada"
                                                            currentUrl={event.image || ''}
                                                            onUploaded={url => updateEventField(event.id, 'image', url)}
                                                            onUrlChange={url => updateEventField(event.id, 'image', url)}
                                                        />
                                                        <hr className="border-gray-100" />
                                                        <GalleryManager
                                                            images={event.images || []}
                                                            onChange={imgs => updateEventField(event.id, 'images', imgs)}
                                                        />
                                                    </div>
                                                )}

                                                {/* ── Tab: HTML ── */}
                                                {getTab(event.id) === 'html' && (
                                                    <div className="space-y-3">
                                                        <p className="text-sm text-gray-500">
                                                            Este contenido HTML se mostrará en la página del evento, debajo de la descripción breve. Puedes usar etiquetas como <code className="bg-gray-100 px-1 rounded text-xs">&lt;h2&gt;</code>, <code className="bg-gray-100 px-1 rounded text-xs">&lt;p&gt;</code>, <code className="bg-gray-100 px-1 rounded text-xs">&lt;ul&gt;</code>, <code className="bg-gray-100 px-1 rounded text-xs">&lt;a&gt;</code>, <code className="bg-gray-100 px-1 rounded text-xs">&lt;img&gt;</code>, etc.
                                                        </p>
                                                        <HtmlEditor
                                                            value={event.htmlContent || ''}
                                                            onChange={v => updateEventField(event.id, 'htmlContent', v)}
                                                        />
                                                    </div>
                                                )}

                                                {/* Save / Delete row */}
                                                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                                    <button
                                                        onClick={() => handleDelete(event.id)}
                                                        className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                                        <Trash2 className="w-4 h-4" /> Eliminar evento
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdate(event)}
                                                        disabled={saving === event.id}
                                                        className="flex items-center gap-2 bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium">
                                                        <Save className="w-4 h-4" />
                                                        {saving === event.id ? 'Guardando...' : 'Guardar todos los cambios'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p>
                        <strong>💡 Tip:</strong> Los eventos aparecen en la página pública ordenados por fecha.
                        Usa la pestaña <strong>Portada & Galería</strong> para subir imágenes directamente a S3,
                        y <strong>Contenido HTML</strong> para añadir detalles ricos como listas, enlaces e imágenes embebidas.
                    </p>
                </div>
            </div>
        </AdminLayout>
    );
};

export default EventsManagement;
