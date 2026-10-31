import { useState, useEffect, useMemo } from 'react';
import { useLang } from '../contexts/LanguageContext';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { Calendar, MapPin, Clock, ChevronRight, History, CalendarClock } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import {
    partitionPublicEvents, temporalOf, formatInZone, PLATFORM_TIMEZONE,
} from '../../server/lib/eventLifecycle.js';
import type { EventLifecycle, TemporalStatus } from '../../server/lib/eventLifecycle.js';

// Category images by event type
const typeImages: Record<string, string> = {
    'Servicio': 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=600&h=400&fit=crop',
    'Fundraising': 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600&h=400&fit=crop',
    'Fija': 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&h=400&fit=crop',
    'Institucional': 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&h=400&fit=crop',
    'Integración': 'https://images.unsplash.com/photo-1529543544282-ea49407407db?w=600&h=400&fit=crop',
};
const defaultImage = 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&h=400&fit=crop';

// ── El ciclo de vida en la página (v4.1247) ─────────────────────────────────
//
// `/eventos` promociona lo que está por venir: en curso y próximos, y aparte
// los publicados sin fecha. Lo que ya terminó vive en «Eventos anteriores»
// (`/eventos/anteriores`), con las mismas tarjetas y su ficha intacta. QUÉ es
// cada evento lo decide `server/lib/eventLifecycle.js` —el mismo archivo que
// usa el servidor— y el servidor lo manda resuelto en `event.lifecycle`.
//
// El reloj: el navegador re-evalúa cada minuto (así un evento que termina con
// la página abierta cambia de sección sin recargar), pero corrigiendo su hora
// con la cabecera `Date` del servidor. Un equipo con la fecha mal puesta no
// vuelve a mostrar como próximo un evento terminado.

type PublicEvent = Record<string, any> & { lifecycle?: EventLifecycle };
type View = 'proximos' | 'anteriores';

const STATUS_BADGE: Partial<Record<TemporalStatus, { label: string; className: string }>> = {
    ongoing: { label: 'En curso', className: 'bg-emerald-600 text-white' },
    finished: { label: 'Finalizado', className: 'bg-gray-800/80 text-white' },
    tbd: { label: 'Fecha por confirmar', className: 'bg-rotary-gold text-white' },
};

/** «17 de sept de 2026 • 07:30 a. m.», en la zona del evento. */
const formatEventWhen = (event: PublicEvent, status: TemporalStatus, locale: string): string => {
    if (status === 'tbd') return 'Fecha por confirmar';
    const tz = event.lifecycle?.timezone || PLATFORM_TIMEZONE;
    const fecha = formatInZone(event.startDate, tz, locale, { day: 'numeric', month: 'short', year: 'numeric' });
    if (event.lifecycle?.allDay) return fecha;
    const hora = formatInZone(event.startDate, tz, locale, { hour: '2-digit', minute: '2-digit' });
    return hora ? `${fecha} • ${hora}` : fecha;
};

// La tarjeta de siempre (v4.753), ahora fuera del componente de la página —un
// componente declarado dentro de otro es un tipo nuevo en cada render— y con
// la etiqueta de su estado: «En curso», «Finalizado» o «Fecha por confirmar».
const EventCard = ({ event, status, locale }: { event: PublicEvent; status: TemporalStatus; locale: string }) => {
    const badge = STATUS_BADGE[status];
    return (
        <div className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 border border-gray-100">
            <div className="h-48 overflow-hidden relative">
                <img
                    src={event.image}
                    alt={event.title}
                    className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ${status === 'finished' ? 'saturate-[.85]' : ''}`}
                    loading="lazy"
                />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-rotary-blue">
                    {event.type || 'Evento'}
                </div>
                {badge && (
                    <div className={`absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${badge.className}`}>
                        {status === 'ongoing' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />}
                        {badge.label}
                    </div>
                )}
            </div>
            <div className="p-8">
                <div className="flex items-center gap-2 text-rotary-blue font-black text-xs uppercase tracking-widest mb-4">
                    {status === 'tbd' ? <CalendarClock className="w-4 h-4" /> : <Clock className="w-4 h-4" />} {formatEventWhen(event, status, locale)}
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
                {/* v4.605 — Se prefiere la dirección amigable del evento; sin slug se usa el id. */}
                <Link to={`/eventos/${event.slug || event.id}`} className="flex items-center gap-2 text-xs font-bold text-indigo-900 group/btn">
                    MÁS DETALLES <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </Link>
            </div>
        </div>
    );
};

// v4.1272 — Las tarjetas van CENTRADAS. Con la grilla de tres columnas, un
// sitio con uno o dos eventos los dejaba pegados a la izquierda y la tercera
// columna vacía. Ahora es una fila que se reparte desde el centro: mismo ancho
// de tarjeta (un tercio menos los espacios), y la última fila incompleta
// también queda en la mitad.
const EventGrid = ({ events, now, locale }: { events: PublicEvent[]; now: number; locale: string }) => (
    <div className="flex flex-wrap justify-center gap-12">
        {events.map((event) => (
            <div key={event.id} className="w-full md:w-[calc((100%-6rem)/3)]">
                <EventCard event={event} status={temporalOf(event.lifecycle, now)} locale={locale} />
            </div>
        ))}
    </div>
);

const Eventos = () => {
    const { club } = useClub();
    const { sections, isLoading: cmsLoading } = useCMSContent('eventos', club.id);

    // v4.653 — Sitios con un solo evento (la Feria) no quieren un calendario:
    // quieren que /eventos lleve directo a la ficha. El destino lo elige el
    // administrador en Eventos → "Sección pública"; vacío = se muestra el
    // calendario de siempre.
    //
    // Se espera a que cargue el CMS antes de decidir: redirigir con la
    // configuración a medio leer mandaría al calendario por un instante.
    const redirectTo = String(sections?.redirect?.target || '').trim();

    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    };

    const location = useLocation();
    const navigate = useNavigate();
    // v4.1247 — La vista vive en la dirección: `/eventos/anteriores` se puede
    // compartir y el botón «atrás» vuelve a los próximos.
    const view: View = /\/eventos\/anteriores\/?$/.test(location.pathname) ? 'anteriores' : 'proximos';
    const setView = (next: View) => {
        if (next === view) return;
        navigate(next === 'anteriores' ? '/eventos/anteriores' : '/eventos');
    };

    useSEO(view === 'anteriores' ? {
        title: 'Eventos anteriores',
        description: `Historial de eventos y actividades de ${(club as any)?.name || 'nuestro club Rotary'}: conferencias, reuniones, proyectos de servicio y recaudación.`,
        path: '/eventos/anteriores',
    } : {
        title: 'Eventos',
        description: `Calendario de eventos y actividades de ${(club as any)?.name || 'nuestro club Rotary'}. Reuniones, proyectos de servicio y recaudación.`,
        path: '/eventos',
    });

    const { locale } = useLang();
    const [events, setEvents] = useState<PublicEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('Todos');
    // Diferencia entre el reloj del servidor y el del navegador, y la hora
    // corregida con que se reparte la lista (se refresca cada minuto).
    const [clockSkew, setClockSkew] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    const categories = ['Todos', 'Servicio', 'Integración', 'Institucional', 'Fundraising'];

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/events`,
                    { cache: 'no-store' }
                );
                if (response.ok) {
                    const serverDate = Date.parse(response.headers.get('date') || '');
                    const skew = Number.isFinite(serverDate) ? serverDate - Date.now() : 0;
                    setClockSkew(skew);
                    setNow(Date.now() + skew);
                    const data = await response.json();
                    const mapped = (Array.isArray(data) ? data : []).map((e: any) => ({
                        ...e,
                        image: e.image || typeImages[e.type] || defaultImage,
                    }));
                    setEvents(mapped);
                } else {
                    setEvents([]);
                }
            } catch (error) {
                console.error('Error fetching events:', error);
                setEvents([]);
            } finally {
                setLoading(false);
            }
        };

        if (club?.id) fetchEvents();
    }, [club?.id]);

    useEffect(() => {
        const tick = () => setNow(Date.now() + clockSkew);
        const timer = setInterval(tick, 60_000);
        document.addEventListener('visibilitychange', tick);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [clockSkew]);

    const lists = useMemo(() => partitionPublicEvents(events, now), [events, now]);

    // v4.658 — El destino guardado puede ser el id interno del evento (así se
    // guardó antes de que el evento tuviera slug) o su slug. Se resuelve contra
    // la lista real y se manda SIEMPRE a la dirección pública del evento —su
    // slug cuando lo tiene—, para que el visitante no acabe mirando un
    // identificador en la barra de direcciones. Si la lista todavía no cargó,
    // se usa el valor guardado tal cual: la ficha se encarga de canonizar.
    const redirectTarget = (() => {
        if (!redirectTo) return '';
        const match = events.find((e: any) => e.slug === redirectTo || e.id === redirectTo);
        return match ? (match.slug || match.id) : redirectTo;
    })();

    // `replace` para que el botón "atrás" del navegador no rebote entre el
    // calendario y la ficha.
    // El historial (`/eventos/anteriores`) se pidió a propósito: no se redirige.
    if (!cmsLoading && redirectTarget && view === 'proximos') {
        return <Navigate to={`/eventos/${redirectTarget}`} replace />;
    }

    // La categoría se aplica a la vista elegida: próximos o anteriores.
    const byCategory = (list: PublicEvent[]) => activeFilter === 'Todos'
        ? list
        : list.filter(e => e.type === activeFilter);
    const upcomingEvents = byCategory(lists.upcoming);
    const tbdEvents = byCategory(lists.tbd);
    const pastEvents = byCategory(lists.past);

    // «del Distrito 4281» en un distrito; «de <nombre>» en un club.
    const siteName = (club as any)?.type === 'district' && (club as any)?.district
        ? `del Distrito ${(club as any).district}`
        : `de ${club?.name || 'nuestro club'}`;

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section */}
            <section
                className="relative overflow-hidden"
                style={{
                    backgroundColor: '#0c3c7c',
                    backgroundImage: "url('/geo-darkblue.png')",
                    backgroundPosition: '50% 0',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '71px 85px'
                }}
            >
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                    <div className="text-center max-w-3xl mx-auto">
                        <h1 className="text-3xl md:text-5xl text-white mb-6">
                            {getC('header', 'title', "Calendario de Eventos")}
                        </h1>
                        <p className="text-white/80 text-lg md:text-xl">
                            {getC('header', 'description', "Descubre de qué manera nos mantenemos activos sirviendo e integrando a la comunidad.")}
                        </p>
                    </div>
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

            {/* Events Grid.
                v4.753 — El fondo es la MISMA textura de hormigón que lleva la
                banda de cifras de la portada (`StatsSection`), en vez de un gris
                plano: las dos son rejillas de tarjetas blancas sobre un fondo, y
                con dos fondos distintos se leían como piezas de sitios
                distintos. La clase vive en `index.css`; no se repite el
                `background-image` a mano. */}
            <section className="py-24 bg-rotary-concrete">
                <div className="max-w-7xl mx-auto px-6">
                    {/* v4.1247 — Próximos eventos | Eventos anteriores. */}
                    <div className="flex justify-center mb-16">
                        <div role="tablist" aria-label="Vista de eventos" className="inline-flex w-full sm:w-auto rounded-full bg-white p-1.5 shadow-sm border border-gray-100">
                            {([
                                { key: 'proximos', label: 'Próximos eventos', short: 'Próximos', count: lists.upcoming.length + lists.tbd.length, Icon: Calendar },
                                { key: 'anteriores', label: 'Eventos anteriores', short: 'Anteriores', count: lists.past.length, Icon: History },
                            ] as const).map(({ key, label, short, count, Icon }) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    id={`tab-eventos-${key}`}
                                    aria-selected={view === key}
                                    aria-controls="panel-eventos"
                                    onClick={() => setView(key)}
                                    className={`flex-1 sm:flex-none min-w-0 flex items-center justify-center gap-2 px-3 sm:px-7 py-3 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue ${view === key
                                        ? 'bg-rotary-blue text-white shadow'
                                        : 'text-gray-500 hover:text-rotary-blue'
                                    }`}
                                >
                                    <Icon className="w-4 h-4 hidden sm:block" />
                                    {/* En móvil, el rótulo corto: los dos caben sin desbordar la pantalla. */}
                                    <span className="sm:hidden">{short}</span>
                                    <span className="hidden sm:inline">{label}</span>
                                    {!loading && <span className={`text-[10px] px-2 py-0.5 rounded-full ${view === key ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div role="tabpanel" id="panel-eventos" aria-labelledby={`tab-eventos-${view}`}>
                        {loading ? (
                            <div className="flex justify-center py-20">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rotary-blue" />
                            </div>
                        ) : view === 'anteriores' ? (
                            pastEvents.length === 0 ? (
                                <div className="text-center py-20">
                                    <p className="text-gray-500 text-lg">
                                        {activeFilter === 'Todos'
                                            ? 'Todavía no hay eventos anteriores para mostrar.'
                                            : 'No hay eventos anteriores en esta categoría.'}
                                    </p>
                                </div>
                            ) : (
                                <EventGrid events={pastEvents} now={now} locale={locale} />
                            )
                        ) : (
                            <>
                                {upcomingEvents.length === 0 ? (
                                    <div className="text-center py-20 max-w-2xl mx-auto">
                                        {activeFilter === 'Todos' ? (
                                            <p className="text-gray-500 text-lg">
                                                Actualmente no hay eventos programados. Próximamente publicaremos nuevas actividades {siteName}.
                                            </p>
                                        ) : (
                                            <p className="text-gray-500 text-lg">No hay eventos próximos en esta categoría.</p>
                                        )}
                                        {lists.past.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setView('anteriores')}
                                                className="mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-rotary-blue hover:underline"
                                            >
                                                <History className="w-4 h-4" /> Ver eventos anteriores
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <EventGrid events={upcomingEvents} now={now} locale={locale} />
                                )}

                                {/* Publicados sin fecha: aparte, sin inventarles una. */}
                                {tbdEvents.length > 0 && (
                                    <div className="mt-24">
                                        <div className="text-center mb-12">
                                            <h2 className="text-2xl md:text-3xl font-black text-gray-900">Próximamente</h2>
                                            <p className="text-gray-500 mt-2">Fecha por confirmar: anunciaremos la fecha de estas actividades muy pronto.</p>
                                        </div>
                                        <EventGrid events={tbdEvents} now={now} locale={locale} />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
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
