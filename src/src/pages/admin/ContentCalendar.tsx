import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Calendar as CalendarIcon,
    Sparkles,
    Plus,
    ChevronLeft,
    ChevronRight,
    Instagram,
    Facebook,
    Loader2,
    BookOpen,
    AlertCircle,
    FileText,
    X,
    Twitter,

} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';

interface Publication {
    id: string;
    title: string;
    content: string;
    platform: string;
    status: 'draft' | 'scheduled' | 'published';
    publishDate: string;
    aiGenerated: boolean;
}

interface CalendarEvent {
    id: string;
    title: string;
    startDate: string;
    type: string;
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
    Instagram: <Instagram className="w-2.5 h-2.5" />,
    Facebook: <Facebook className="w-2.5 h-2.5" />,
    'X (Twitter)': <Twitter className="w-2.5 h-2.5" />,
};

const ContentCalendar: React.FC = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [publications, setPublications] = useState<Publication[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [showNewPublicationModal, setShowNewPublicationModal] = useState(false);
    const [selectedDateForNew, setSelectedDateForNew] = useState<Date | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state for new publication
    const [newPub, setNewPub] = useState({
        title: '',
        platform: 'Instagram',
        content: '',
    });

    useEffect(() => {
        fetchCalendarData();
    }, [currentDate]);

    const fetchCalendarData = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(
                `${import.meta.env.VITE_API_URL || '/api'}/calendar?month=${format(currentDate, 'MM')}&year=${format(currentDate, 'yyyy')}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (response.ok) {
                const data = await response.json();
                setPublications(data.publications || []);
                setEvents(data.events || []);
            }
        } catch {
            toast.error('Error al cargar el calendario');
        }
    };

    const handleSavePublication = async () => {
        if (!newPub.title.trim()) {
            toast.error('El título es requerido');
            return;
        }
        if (!selectedDateForNew) {
            toast.error('Selecciona una fecha');
            return;
        }

        setIsSaving(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/calendar/publications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: newPub.title,
                    content: newPub.content,
                    platform: newPub.platform,
                    publishDate: selectedDateForNew.toISOString(),
                    aiGenerated: false,
                })
            });

            if (response.ok) {
                toast.success('¡Publicación guardada en el calendario!');
                setShowNewPublicationModal(false);
                setNewPub({ title: '', platform: 'Instagram', content: '' });
                fetchCalendarData();
            } else {
                const err = await response.json();
                toast.error(err.error || 'Error al guardar');
            }
        } catch {
            toast.error('Error de conexión');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePublication = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/calendar/publications/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success('Publicación eliminada');
                fetchCalendarData();
            }
        } catch {
            toast.error('Error al eliminar');
        }
    };

    const handleGenerateAISuggestions = async () => {
        setIsAIGenerating(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/ai/suggest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    month: format(currentDate, 'MMMM', { locale: es }),
                    year: format(currentDate, 'yyyy')
                })
            });

            if (response.ok) {
                toast.success('¡IA ha sugerido nuevos contenidos!');
                fetchCalendarData();
            } else {
                if (response.status === 503) {
                    toast.error('La IA no está configurada. Contacte al Súper Admin para añadir la OPENAI_API_KEY.');
                } else {
                    const data = await response.json();
                    toast.error(data.error || 'Falla al conectar con la IA');
                }
            }
        } catch {
            toast.error('Error de conexión con el asistente');
        } finally {
            setIsAIGenerating(false);
        }
    };

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const getItemsForDay = (day: Date) => ({
        pubs: publications.filter(p => isSameDay(new Date(p.publishDate), day)),
        events: events.filter(e => isSameDay(new Date(e.startDate), day)),
    });

    const openNewModal = (day: Date) => {
        setSelectedDateForNew(day);
        setNewPub({ title: '', platform: 'Instagram', content: '' });
        setShowNewPublicationModal(true);
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <CalendarIcon className="text-rotary-blue w-7 h-7" />
                        Calendario de Contenidos &amp; Imagen Pública
                    </h1>
                    <p className="text-gray-500 text-sm">Gestiona tus redes sociales y eventos con ayuda de Inteligencia Artificial.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleGenerateAISuggestions}
                        disabled={isAIGenerating}
                        className="flex items-center gap-2 bg-gradient-to-r from-rotary-blue to-sky-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:shadow-sky-200 transition-all disabled:opacity-50"
                    >
                        {isAIGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        Sugerir con IA
                    </button>
                    <button
                        onClick={() => openNewModal(new Date())}
                        className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm"
                    >
                        <Plus className="w-5 h-5" /> Nueva Publicación
                    </button>
                </div>
            </div>

            {/* Calendar */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm mb-8">
                <div className="flex items-center justify-between mb-8 px-4">
                    <h2 className="text-xl font-extrabold text-gray-800 capitalize">
                        {format(currentDate, 'MMMM yyyy', { locale: es })}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <ChevronLeft className="w-5 h-5 text-gray-400" />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())} className="px-4 py-1.5 text-xs font-bold text-rotary-blue hover:bg-sky-50 rounded-lg transition-colors border border-sky-100">
                            Hoy
                        </button>
                        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-px mb-2">
                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                        <div key={day} className="text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-widest py-2">{day}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {Array(monthStart.getDay()).fill(0).map((_, i) => (
                        <div key={`pad-${i}`} className="aspect-square bg-gray-50/30 rounded-2xl" />
                    ))}

                    {days.map((day) => {
                        const { pubs, events: dayEvents } = getItemsForDay(day);
                        return (
                            <div
                                key={day.toString()}
                                className={`aspect-square p-2 rounded-2xl border transition-all cursor-pointer group relative flex flex-col gap-1 ${isToday(day)
                                    ? 'bg-sky-50/50 border-rotary-blue/30 ring-2 ring-rotary-blue/10'
                                    : 'bg-white border-gray-100 hover:border-rotary-blue/20 hover:shadow-md'
                                    }`}
                                onClick={() => openNewModal(day)}
                            >
                                <span className={`text-xs font-bold ${isToday(day) ? 'text-rotary-blue' : 'text-gray-400'}`}>
                                    {format(day, 'd')}
                                </span>

                                <div className="flex-1 overflow-hidden space-y-0.5">
                                    {pubs.slice(0, 2).map(p => (
                                        <div
                                            key={p.id}
                                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1 truncate group/chip ${p.aiGenerated
                                                ? 'bg-purple-50 text-purple-600 border border-purple-100'
                                                : 'bg-blue-50 text-blue-600 border border-blue-100'
                                                }`}
                                        >
                                            {PLATFORM_ICONS[p.platform] || <Instagram className="w-2 h-2" />}
                                            <span className="truncate flex-1">{p.title}</span>
                                            <button
                                                onClick={(e) => handleDeletePublication(p.id, e)}
                                                className="opacity-0 group-hover/chip:opacity-100 shrink-0"
                                            >
                                                <X className="w-2 h-2" />
                                            </button>
                                        </div>
                                    ))}
                                    {pubs.length > 2 && (
                                        <div className="text-[8px] text-gray-400 font-bold pl-1">+{pubs.length - 2} más</div>
                                    )}
                                    {dayEvents.map(e => (
                                        <div key={e.id} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 text-[8px] font-bold truncate">
                                            📅 {e.title}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend + lower panels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* AI Panel */}
                <div className="lg:col-span-2 bg-gradient-to-br from-white to-sky-50/30 rounded-3xl p-8 border border-sky-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-10 opacity-5">
                        <Sparkles className="w-40 h-40 text-rotary-blue" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-rotary-blue flex items-center justify-center text-white shadow-lg">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Agente de Imagen Pública AI</h3>
                                <p className="text-gray-500 text-sm">Sugerencias basadas en el manual de Marca Rotary.</p>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex flex-wrap gap-3 mb-6">
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-[10px] font-bold text-blue-600">
                                <div className="w-2 h-2 bg-blue-400 rounded-full" /> Publicación manual
                            </span>
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-100 rounded-full text-[10px] font-bold text-purple-600">
                                <Sparkles className="w-2.5 h-2.5" /> Sugerida por IA
                            </span>
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-full text-[10px] font-bold text-amber-600">
                                📅 Evento del club
                            </span>
                        </div>

                        <div className="p-5 bg-white rounded-2xl border border-sky-100 shadow-sm">
                            <p className="text-sm text-gray-500 leading-relaxed">
                                Haz clic en <strong>"Sugerir con IA"</strong> para que el asistente genere publicaciones
                                alineadas con los valores y el calendario de causas de Rotary International para este mes.
                                También puedes hacer clic en cualquier día del calendario para agregar una publicación manualmente.
                            </p>
                            <button
                                onClick={handleGenerateAISuggestions}
                                disabled={isAIGenerating}
                                className="mt-4 flex items-center gap-2 bg-gradient-to-r from-rotary-blue to-sky-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg hover:shadow-sky-200 transition-all disabled:opacity-50"
                            >
                                {isAIGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                Generar sugerencias para {format(currentDate, 'MMMM', { locale: es })}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Knowledge Base */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-rotary-blue" /> Base de Conocimiento
                    </h3>
                    <div className="space-y-4 mb-8">
                        <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer group">
                            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-700">Manual de Marca v2.pdf</p>
                                <p className="text-[10px] text-gray-400 font-bold">Súper Admin • Global</p>
                            </div>
                        </div>
                    </div>

                    <Link
                        to="/admin/conocimiento"
                        className="w-full py-3 border-2 border-dashed border-gray-100 rounded-2xl text-gray-400 font-bold text-sm hover:border-rotary-blue hover:text-rotary-blue transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Añadir Conocimiento
                    </Link>

                    <div className="mt-8 p-4 bg-sky-50 rounded-2xl border border-sky-100 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-rotary-blue shrink-0" />
                        <p className="text-[10px] text-sky-800 font-medium leading-relaxed">
                            Añade PDFs con la historia de tu club o proyectos pasados para que la IA los use en tus publicaciones.
                        </p>
                    </div>
                </div>
            </div>

            {/* ===== NEW PUBLICATION MODAL ===== */}
            {showNewPublicationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Nueva Publicación</h3>
                            <button
                                onClick={() => setShowNewPublicationModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-all"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-5">
                            {/* Date display */}
                            <div className="bg-sky-50 rounded-xl px-4 py-3 border border-sky-100">
                                <p className="text-xs text-sky-700 font-semibold">
                                    📅 Programando para: <strong>{selectedDateForNew ? format(selectedDateForNew, "d 'de' MMMM yyyy", { locale: es }) : ''}</strong>
                                </p>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-2">
                                    Título *
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: Día del Medio Ambiente - Post Instagram"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 focus:bg-white transition-all font-medium text-gray-800"
                                    value={newPub.title}
                                    onChange={e => setNewPub(p => ({ ...p, title: e.target.value }))}
                                />
                            </div>

                            {/* Platform */}
                            <div>
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-2">
                                    Plataforma
                                </label>
                                <div className="flex gap-2">
                                    {['Instagram', 'Facebook', 'X (Twitter)'].map(plat => (
                                        <button
                                            key={plat}
                                            type="button"
                                            onClick={() => setNewPub(p => ({ ...p, platform: plat }))}
                                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-all ${newPub.platform === plat
                                                ? 'bg-rotary-blue text-white border-rotary-blue shadow-md'
                                                : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-200'
                                                }`}
                                        >
                                            {PLATFORM_ICONS[plat]}
                                            {plat === 'X (Twitter)' ? 'X' : plat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Content */}
                            <div>
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-2">
                                    Contenido (Copy)
                                </label>
                                <textarea
                                    rows={4}
                                    placeholder="Escribe aquí el texto de tu publicación..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 focus:bg-white transition-all font-medium text-sm text-gray-800 resize-none"
                                    value={newPub.content}
                                    onChange={e => setNewPub(p => ({ ...p, content: e.target.value }))}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowNewPublicationModal(false)}
                                    className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-2xl font-bold hover:bg-gray-50 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSavePublication}
                                    disabled={isSaving}
                                    className="flex-1 py-3 bg-rotary-blue text-white rounded-2xl font-bold shadow-lg shadow-rotary-blue/20 hover:bg-sky-800 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {isSaving ? 'Guardando...' : 'Guardar en Calendario'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default ContentCalendar;
