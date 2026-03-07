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
    Trash2,
    Loader2,
    BookOpen,
    AlertCircle,
    FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { es } from 'date-fns/locale';

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

const ContentCalendar: React.FC = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [publications, setPublications] = useState<Publication[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isAIGenerating, setIsAIGenerating] = useState(false);

    useEffect(() => {
        fetchCalendarData();
    }, [currentDate]);

    const fetchCalendarData = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/calendar?month=${format(currentDate, 'MM')}&year=${format(currentDate, 'yyyy')}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setPublications(data.publications);
                setEvents(data.events);
            }
        } catch (error) {
            toast.error('Error al cargar el calendario');
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
                const data = await response.json();
                toast.error(data.error || 'Falla al conectar con la IA');
            }
        } catch (error) {
            toast.error('Error de conexión con el asistente');
        } finally {
            setIsAIGenerating(false);
        }
    };

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const getItemsForDay = (day: Date) => {
        const dayPubs = publications.filter(p => isSameDay(new Date(p.publishDate), day));
        const dayEvents = events.filter(e => isSameDay(new Date(e.startDate), day));
        return { pubs: dayPubs, events: dayEvents };
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <CalendarIcon className="text-rotary-blue w-7 h-7" />
                        Calendario de Contenidos & Imagen Pública
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
                    <button className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm">
                        <Plus className="w-5 h-5" /> Nueva Publicación
                    </button>
                </div>
            </div>

            {/* Calendar Controls */}
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

                {/* Week Headers */}
                <div className="grid grid-cols-7 gap-px mb-2">
                    {['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map(day => (
                        <div key={day} className="text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-widest py-2">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-3">
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
                            >
                                <span className={`text-xs font-bold ${isToday(day) ? 'text-rotary-blue' : 'text-gray-400'}`}>
                                    {format(day, 'd')}
                                </span>

                                <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                                    {pubs.map(p => (
                                        <div
                                            key={p.id}
                                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1 truncate ${p.aiGenerated ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                                                }`}
                                        >
                                            {p.platform === 'Instagram' ? <Instagram className="w-2 h-2" /> : <Facebook className="w-2 h-2" />}
                                            {p.title}
                                        </div>
                                    ))}
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

            {/* AI Insights & Assistant Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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

                        <div className="space-y-4">
                            <div className="p-5 bg-white rounded-2xl border border-sky-100 shadow-sm hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-bold rounded uppercase">Recomendado</span>
                                        <h4 className="font-bold text-gray-800">Día de la Paz Mundial</h4>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-bold">Sept 21</span>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed mb-4">
                                    "Rotary construye la paz a través de la comprensión. Propongo un post enfocado en cómo nuestro club fomenta el diálogo en la comunidad."
                                </p>
                                <div className="flex justify-end gap-2">
                                    <button className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700">Descartar</button>
                                    <button className="px-4 py-2 bg-rotary-blue text-white rounded-lg text-xs font-bold hover:bg-sky-800 transition-all">Programar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-rotary-blue" />
                        Base de Conocimiento
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

                    <button className="w-full py-3 border-2 border-dashed border-gray-100 rounded-2xl text-gray-400 font-bold text-sm hover:border-rotary-blue hover:text-rotary-blue transition-all flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4" /> Añadir Conocimiento
                    </button>

                    <div className="mt-8 p-4 bg-sky-50 rounded-2xl border border-sky-100 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-rotary-blue shrink-0" />
                        <p className="text-[10px] text-sky-800 font-medium leading-relaxed">
                            Añade PDFs con la historia de tu club o proyectos pasados para que la IA los use en tus publicaciones.
                        </p>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default ContentCalendar;
