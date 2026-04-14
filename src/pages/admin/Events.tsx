import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Calendar, ChevronDown, ChevronUp, MapPin, Clock } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';

interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    startDate: string;
    endDate?: string;
    location?: string;
    type: string;
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
    startDate: '',
    endDate: '',
    location: '',
    type: 'meeting',
};

const EventsManagement = () => {
    const { user } = useAuth();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [newEvent, setNewEvent] = useState(emptyForm);

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

    const updateEventField = (id: string, field: string, value: string) => {
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
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                    placeholder="Nombre del evento"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio *</label>
                                <input
                                    type="datetime-local"
                                    value={newEvent.startDate}
                                    onChange={e => setNewEvent({ ...newEvent, startDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                                <input
                                    type="datetime-local"
                                    value={newEvent.endDate}
                                    onChange={e => setNewEvent({ ...newEvent, endDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                                <input
                                    type="text"
                                    value={newEvent.location}
                                    onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                    placeholder="Lugar del evento"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select
                                    value={newEvent.type}
                                    onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                                >
                                    {EVENT_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                                <textarea
                                    value={newEvent.description}
                                    onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                                    placeholder="Describe el evento..."
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleCreate}
                                disabled={saving === 'new' || !newEvent.title.trim() || !newEvent.startDate}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {saving === 'new' ? 'Guardando...' : 'Guardar evento'}
                            </button>
                            <button
                                onClick={() => { setShowAdd(false); setNewEvent(emptyForm); }}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                            >
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
                        <p className="text-gray-400 mb-6">Crea el primer evento para que aparezca en la página de Eventos del sitio.</p>
                        <button
                            onClick={() => setShowAdd(true)}
                            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                            Crear primer evento
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {events
                            .slice()
                            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                            .map(event => (
                                <div key={event.id} className="bg-white rounded-xl border border-gray-200 hover:border-blue-200 transition-all">
                                    {/* Row */}
                                    <div
                                        className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                                        onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-gray-900 text-sm truncate">{event.title}</h3>
                                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[event.type] || TYPE_COLORS.other}`}>
                                                    {EVENT_TYPES.find(t => t.value === event.type)?.label || event.type}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 mt-1">
                                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDate(event.startDate)}
                                                </span>
                                                {event.location && (
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {event.location}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {expandedId === event.id
                                            ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                            : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                        }
                                    </div>

                                    {/* Edit form */}
                                    {expandedId === event.id && (
                                        <div className="px-5 pb-5 border-t border-gray-100 space-y-4 pt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                                    <input
                                                        type="text"
                                                        value={event.title}
                                                        onChange={e => updateEventField(event.id, 'title', e.target.value)}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={toInputDate(event.startDate)}
                                                        onChange={e => updateEventField(event.id, 'startDate', e.target.value)}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={toInputDate(event.endDate || '')}
                                                        onChange={e => updateEventField(event.id, 'endDate', e.target.value)}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                                                    <input
                                                        type="text"
                                                        value={event.location || ''}
                                                        onChange={e => updateEventField(event.id, 'location', e.target.value)}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                                    <select
                                                        value={event.type}
                                                        onChange={e => updateEventField(event.id, 'type', e.target.value)}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                                                    >
                                                        {EVENT_TYPES.map(t => (
                                                            <option key={t.value} value={t.value}>{t.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                                                    <textarea
                                                        value={event.description || ''}
                                                        onChange={e => updateEventField(event.id, 'description', e.target.value)}
                                                        rows={3}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between pt-1">
                                                <button
                                                    onClick={() => handleDelete(event.id)}
                                                    className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Eliminar evento
                                                </button>
                                                <button
                                                    onClick={() => handleUpdate(event)}
                                                    disabled={saving === event.id}
                                                    className="flex items-center gap-1 bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                                >
                                                    <Save className="w-4 h-4" />
                                                    {saving === event.id ? 'Guardando...' : 'Guardar cambios'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p>
                        <strong>💡 Tip:</strong> Los eventos creados aquí aparecen en la página de Eventos del sitio web, ordenados por fecha de inicio.
                    </p>
                </div>
            </div>
        </AdminLayout>
    );
};

export default EventsManagement;
