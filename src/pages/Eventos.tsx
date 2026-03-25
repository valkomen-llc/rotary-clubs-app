import { useState, useEffect } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { Calendar, MapPin, Clock, ChevronRight } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';

// Fallback mock events when no real data exists
const mockEvents = [
    {
        id: 'mock-1',
        title: "Reunión Semanal de Socios",
        startDate: "2026-03-12T19:00:00Z",
        endDate: null,
        location: "Sede Social / Zoom",
        type: "Fija",
        description: "Espacio de integración y planificación entre los socios del club.",
        image: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&h=400&fit=crop"
    },
    {
        id: 'mock-2',
        title: "Jornada de Salud Comunitaria",
        startDate: "2026-03-25T08:00:00Z",
        endDate: null,
        location: "Barrio San Alberto",
        type: "Servicio",
        description: "Atención médica gratuita para familias de la comunidad.",
        image: "https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=600&h=400&fit=crop"
    },
    {
        id: 'mock-3',
        title: "Cena de Gala Benéfica",
        startDate: "2026-04-10T20:00:00Z",
        endDate: null,
        location: "Hotel Grand Rotary",
        type: "Fundraising",
        description: "Evento de recaudación con cena, música en vivo y subasta.",
        image: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600&h=400&fit=crop"
    }
];

// Category images by event type
const typeImages: Record<string, string> = {
    'Servicio': 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=600&h=400&fit=crop',
    'Fundraising': 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600&h=400&fit=crop',
    'Fija': 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&h=400&fit=crop',
    'Institucional': 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&h=400&fit=crop',
    'Integración': 'https://images.unsplash.com/photo-1529543544282-ea49407407db?w=600&h=400&fit=crop',
};
const defaultImage = 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&h=400&fit=crop';

const Eventos = () => {
    const { club } = useClub();
    useCMSContent('eventos', club.id);

    useSEO({
        title: 'Eventos',
        description: `Calendario de eventos y actividades de ${(club as any)?.name || 'nuestro club Rotary'}. Reuniones, proyectos de servicio y recaudación.`,
        path: '/eventos',
    });

    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('Todos');

    const categories = ['Todos', 'Servicio', 'Integración', 'Institucional', 'Fundraising'];

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/events`
                );
                if (response.ok) {
                    const data = await response.json();
                    if (data.length > 0) {
                        // Map API data to component format, adding image fallback
                        const mapped = data.map((e: any) => ({
                            ...e,
                            image: e.image || typeImages[e.type] || defaultImage,
                        }));
                        setEvents(mapped);
                    } else {
                        setEvents(mockEvents);
                    }
                } else {
                    setEvents(mockEvents);
                }
            } catch (error) {
                console.error('Error fetching events:', error);
                setEvents(mockEvents);
            } finally {
                setLoading(false);
            }
        };

        if (club?.id) fetchEvents();
    }, [club?.id]);

    const filteredEvents = activeFilter === 'Todos'
        ? events
        : events.filter(e => e.type === activeFilter);

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('es-CO', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
        } catch { return dateStr; }
    };

    const formatTime = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleTimeString('es-CO', {
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return ''; }
    };

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section — Minimal & Impactful */}
            <section className="relative h-[40vh] min-h-[400px] flex items-center bg-gray-900 overflow-hidden">
                <div className="absolute inset-0 opacity-40">
                    <img
                        src="https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1600"
                        alt="Eventos Background"
                        className="w-full h-full object-cover grayscale"
                        loading="lazy"
                    />
                </div>
                <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
                    <h1 className="text-5xl md:text-7xl font-black text-white mb-4 animate-slide-up">
                        Nuestro <span className="text-rotary-gold">Calendario</span>
                    </h1>
                    <p className="text-xl text-white/70 max-w-xl font-light">
                        Descubre de qué manera nos mantenemos activos sirviendo e integrando a la comunidad.
                    </p>
                </div>
            </section>

            {/* Filter / Category Bar */}
            <section className="bg-white border-b border-gray-100 sticky top-16 z-40">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex gap-4 md:gap-8 overflow-x-auto scrollbar-hide">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveFilter(cat)}
                                className={`text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${activeFilter === cat
                                    ? 'text-rotary-blue'
                                    : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                    <div className="hidden md:flex items-center gap-2 text-xs font-bold text-gray-400">
                        <Calendar className="w-4 h-4" /> VISTA DE LISTA
                    </div>
                </div>
            </section>

            {/* Events Grid */}
            <section className="py-24 bg-gray-50">
                <div className="max-w-7xl mx-auto px-6">
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rotary-blue" />
                        </div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-gray-500 text-lg">No hay eventos disponibles en esta categoría.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                            {filteredEvents.map((event) => (
                                <div key={event.id} className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 border border-gray-100">
                                    <div className="h-48 overflow-hidden relative">
                                        <img
                                            src={event.image}
                                            alt={event.title}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                            loading="lazy"
                                        />
                                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-rotary-blue">
                                            {event.type || 'Evento'}
                                        </div>
                                    </div>
                                    <div className="p-8">
                                        <div className="flex items-center gap-2 text-rotary-blue font-black text-xs uppercase tracking-widest mb-4">
                                            <Clock className="w-4 h-4" /> {formatDate(event.startDate)} • {formatTime(event.startDate)}
                                        </div>
                                        <h3 className="text-2xl font-black text-gray-900 mb-4 group-hover:text-rotary-blue transition-colors">
                                            {event.title}
                                        </h3>
                                        {event.description && (
                                            <p className="text-gray-500 text-sm mb-4 line-clamp-2">{event.description}</p>
                                        )}
                                        <div className="flex items-center gap-2 text-gray-500 text-sm mb-8 font-light italic">
                                            <MapPin className="w-4 h-4" /> {event.location || 'Por confirmar'}
                                        </div>
                                        <button className="flex items-center gap-2 text-xs font-bold text-indigo-900 group/btn">
                                            MÁS DETALLES <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Newsletter / Stay Notified */}
            <section className="py-24 bg-white">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <div className="w-16 h-1 bg-rotary-gold mx-auto mb-12" />
                    <h2 className="text-3xl font-black text-gray-900 mb-6">No te pierdas de nada</h2>
                    <p className="text-lg text-gray-500 mb-12 font-light">
                        Suscríbete y recibe las próximas fechas de eventos y proyectos de {club.name} directamente en tu correo.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
                        <input
                            type="email"
                            placeholder="Tu correo electrónico"
                            className="flex-1 px-8 py-4 bg-gray-50 rounded-full border border-gray-100 focus:outline-none focus:ring-2 focus:ring-rotary-blue transition-all"
                        />
                        <button className="px-10 py-4 bg-rotary-blue text-white rounded-full font-bold hover:bg-black transition-colors shadow-lg shadow-blue-900/20">
                            Suscribirme
                        </button>
                    </div>
                </div>
            </section>

            <Footer />

            <style>{`
                @keyframes slide-up {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    );
};

export default Eventos;
