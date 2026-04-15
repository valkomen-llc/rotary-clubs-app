import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, MapPin, Clock, Tag, Loader2 } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useSEO } from '../hooks/useSEO';

const API = import.meta.env.VITE_API_URL || '/api';

const typeImages: Record<string, string> = {
    'Servicio': 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=1200&h=500&fit=crop',
    'Fundraising': 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1200&h=500&fit=crop',
    'Fija': 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1200&h=500&fit=crop',
    'Institucional': 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&h=500&fit=crop',
    'Integración': 'https://images.unsplash.com/photo-1529543544282-ea49407407db?w=1200&h=500&fit=crop',
    'conference': 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&h=500&fit=crop',
    'meeting': 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1200&h=500&fit=crop',
};
const defaultImage = 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1200&h=500&fit=crop';

const TYPE_LABELS: Record<string, string> = {
    meeting: 'Reunión', Servicio: 'Servicio', Fundraising: 'Fundraising',
    Fija: 'Fija', Institucional: 'Institucional', Integración: 'Integración',
    conference: 'Conferencia', other: 'Otro',
};

function calculateTimeLeft(targetDate: string) {
    const difference = new Date(targetDate).getTime() - new Date().getTime();
    if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
    };
}

const LatirSpecialSidebar = ({ startDate, metadata }: { startDate: string, metadata: any }) => {
    const latirConfig = metadata?.latir || {};
    const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(startDate));

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft(startDate));
        }, 1000);
        return () => clearInterval(timer);
    }, [startDate]);

    const formatNum = (num: number) => num.toString().padStart(2, '0');

    return (
        <div className="bg-white rounded-2xl p-6 mb-4 flex flex-col items-center border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            <div className="w-full text-left">
                <h2 className="text-[2.2rem] leading-[1.1] font-black text-[#1B2B4D]" style={{ whiteSpace: 'pre-line' }}>
                    {latirConfig.title || 'Distrito 4921,\nPatagonia\nArgentina'}
                </h2>
                <p className="text-[#475569] text-[1.15rem] mt-3 leading-snug" style={{ whiteSpace: 'pre-line' }}>
                    {latirConfig.subtitle || 'El destino de nuestras\nnuevas historias.'}
                </p>
            </div>

            {/* Countdown */}
            <div className="flex gap-1 mt-8 mb-6 justify-center w-full">
                {[
                    { label: 'Days', val: timeLeft.days },
                    { label: 'Hours', val: timeLeft.hours },
                    { label: 'Minutes', val: timeLeft.minutes },
                    { label: 'Seconds', val: timeLeft.seconds }
                ].map(item => (
                    <div key={item.label} className="bg-[#D57D2C] text-white flex flex-col items-center justify-center py-2.5 px-0.5 w-[4.5rem] rounded-md shadow-sm">
                        <span className="text-[2.25rem] font-normal leading-none tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>{formatNum(item.val)}</span>
                        <span className="text-[11px] font-bold mt-1.5 capitalize">{item.label}</span>
                    </div>
                ))}
            </div>

            {/* Button */}
            <a
                href={latirConfig.buttonLink || "https://forms.gle/CXWqMj5w335h4qm69"}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full max-w-[220px] block text-center bg-[#D57D2C] hover:bg-[#c46f23] text-white text-[15px] font-bold py-2.5 rounded-full transition-colors mb-5"
            >
                Inscripciones
            </a>

            {/* Pricing details */}
            <div className="text-center text-[14px] text-[#1B2B4D] space-y-1.5 w-full pb-2">
                <p><strong className="font-extrabold">Ticket general:</strong> {latirConfig.ticketGeneral || 'USD 550'}</p>
                <p className="italic font-medium text-[#1B2B4D]">{latirConfig.ticketDesc || 'A partir del 15/03: USD 625'}</p>
                <p><strong className="font-extrabold">Ticket ROTEX:</strong> {latirConfig.ticketRotex || 'USD 200'}</p>
                <p className="mt-3 text-[#1B2B4D]">Cierre de inscripciones: {latirConfig.closeDateText || '31/03/2026'}</p>
            </div>

            {/* Extra image at the bottom of the box */}
            {latirConfig.footerImage && (
                <div className="mt-5 w-[calc(100%+3rem)] -mx-6 -mb-6 border-t border-gray-100 overflow-hidden rounded-b-2xl">
                    <img src={latirConfig.footerImage} alt="Conf Info" className="w-full h-auto object-cover" />
                </div>
            )}
        </div>
    );
};

const EventoDetalle = () => {
    const { id } = useParams<{ id: string }>();
    const { club } = useClub();
    const [event, setEvent] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => { window.scrollTo(0, 0); }, [id]);

    useEffect(() => {
        if (!club?.id || !id) return;
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API}/clubs/${club.id}/events/${id}`);
                if (!res.ok) { setError('Evento no encontrado'); return; }
                const data = await res.json();
                setEvent(data);
            } catch {
                setError('Error al cargar el evento');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [club?.id, id]);

    useSEO({
        title: event?.title || 'Evento',
        description: event?.description?.slice(0, 150) || '',
        path: `/eventos/${id}`,
    });

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('es-ES', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    const coverImage = event ? (event.image || typeImages[event.type] || defaultImage) : defaultImage;

    if (loading) {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="w-10 h-10 text-rotary-blue animate-spin" />
                </div>
                <Footer />
            </div>
        );
    }

    if (error || !event) {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <p className="text-gray-500 text-lg">{error || 'Evento no encontrado'}</p>
                    <Link to="/eventos" className="text-rotary-blue font-semibold hover:underline flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> Volver a Eventos
                    </Link>
                </div>
                <Footer />
            </div>
        );
    }

    const descriptionParagraphs = event.description
        ? event.description.split(/\n\n+/).map((p: string) => p.trim()).filter(Boolean)
        : [];

    const hasImages = event.images && event.images.length > 0;
    const hasCover = !!(event.image || (event.images && event.images[0]));
    const coverImg = event.image || (event.images && event.images[0]) || null;

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero */}
            <div className="relative h-[420px] md:h-[520px] overflow-hidden">
                <img
                    src={coverImg || (typeImages[event.type] || defaultImage)}
                    alt={event.title}
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 px-6 pb-10 max-w-7xl mx-auto">
                    <span className="inline-block bg-white/20 backdrop-blur-md text-white text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                        {TYPE_LABELS[event.type] || event.type || 'Evento'}
                    </span>
                    <h1 className="text-3xl md:text-5xl font-black text-white leading-tight max-w-4xl">
                        {event.title}
                    </h1>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-12">

                {/* Back */}
                <Link
                    to="/eventos"
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-rotary-blue transition-colors mb-10"
                >
                    <ArrowLeft className="w-4 h-4" /> Volver a Eventos
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

                    {/* Main content */}
                    <div className="lg:col-span-2 space-y-6">
                        {descriptionParagraphs.length > 0 ? (
                            <div className="space-y-5 text-gray-700 text-base leading-relaxed">
                                {descriptionParagraphs.map((p: string, i: number) => (
                                    <p key={i}>{p}</p>
                                ))}
                            </div>
                        ) : (
                            !event.htmlContent && <p className="text-gray-400 italic">Sin descripción disponible.</p>
                        )}

                        {/* Rich HTML content */}
                        {event.htmlContent && (
                            <div
                                className="prose prose-blue max-w-none text-gray-700"
                                dangerouslySetInnerHTML={{ __html: event.htmlContent }}
                            />
                        )}

                        {/* Image gallery */}
                        {hasImages && (
                            <div className="mt-8">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Galería</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {event.images.map((url: string, i: number) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                            className="block aspect-square rounded-xl overflow-hidden border border-gray-100 hover:opacity-90 transition-opacity">
                                            <img src={url} alt={`gallery-${i}`} className="w-full h-full object-cover" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar info */}
                    <div className="space-y-4">
                        {event.id === '2038324a-0e04-497c-9328-fbaeb9ce2992' && (
                            <LatirSpecialSidebar startDate={event.startDate} metadata={event.metadata} />
                        )}

                        <div className="bg-gray-50 rounded-2xl p-6 space-y-5 border border-gray-100">

                            <div className="flex items-start gap-3">
                                <Calendar className="w-5 h-5 text-rotary-blue mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Inicio</p>
                                    <p className="text-sm font-semibold text-gray-800 capitalize">{formatDate(event.startDate)}</p>
                                    <p className="text-sm text-gray-500">{formatTime(event.startDate)}</p>
                                </div>
                            </div>

                            {event.endDate && (
                                <div className="flex items-start gap-3">
                                    <Clock className="w-5 h-5 text-rotary-blue mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Fin</p>
                                        <p className="text-sm font-semibold text-gray-800 capitalize">{formatDate(event.endDate)}</p>
                                        <p className="text-sm text-gray-500">{formatTime(event.endDate)}</p>
                                    </div>
                                </div>
                            )}

                            {event.location && (
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-5 h-5 text-rotary-blue mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ubicación</p>
                                        <p className="text-sm font-semibold text-gray-800">{event.location}</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-start gap-3">
                                <Tag className="w-5 h-5 text-rotary-blue mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Tipo</p>
                                    <p className="text-sm font-semibold text-gray-800">{TYPE_LABELS[event.type] || event.type}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default EventoDetalle;
