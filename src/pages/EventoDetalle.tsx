import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, MapPin, Clock, Tag, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import RegistrationPanel from '../components/RegistrationPanel';
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

// Evento original de la Conferencia LATIR. El panel de inscripción nació
// cableado a este id; desde v4.603 cualquier evento de cualquier sitio puede
// tener el suyo, y este id sólo se conserva para que la ficha ya publicada de
// LATIR siga viéndose exactamente igual (sus textos y precios por defecto).
const LATIR_EVENT_ID = '2038324a-0e04-497c-9328-fbaeb9ce2992';

/**
 * ¿Este evento muestra el panel de inscripción?
 * El evento original de LATIR siempre. Los demás, cuando el administrador
 * activó el panel o llenó algún campo en la pestaña "Panel de inscripción".
 */
const hasRegistrationPanel = (event: any): boolean => {
    if (event?.id === LATIR_EVENT_ID) return true;
    const cfg = event?.metadata?.latir;
    if (!cfg || typeof cfg !== 'object') return false;
    if (cfg.enabled === true) return true;
    if (cfg.enabled === false) return false;
    return Object.values(cfg).some(v => typeof v === 'string' && v.trim() !== '');
};

// Barra lateral con el panel de inscripción del evento. Desde v4.602 el panel
// vive en `RegistrationPanel` para poder reutilizarlo en otros sitios; aquí
// sólo se arman sus valores.
//
// Los textos y precios por defecto son los del evento original de LATIR y se
// aplican SÓLO a ese evento, para que su ficha publicada no cambie en nada. En
// cualquier otro evento el panel muestra únicamente lo que el administrador
// haya llenado, con el título y la sede del propio evento como respaldo — así
// un evento nuevo nunca hereda los datos de la Conferencia.
const EventRegistrationSidebar = ({ event }: { event: any }) => {
    const cfg = event?.metadata?.latir || {};
    const isLatir = event?.id === LATIR_EVENT_ID;

    return (
        <RegistrationPanel
            headerLogo={cfg.headerLogo}
            title={cfg.title || (isLatir ? 'Distrito 4921,\nPatagonia\nArgentina' : event?.title || '')}
            subtitle={cfg.subtitle || (isLatir ? 'El destino de nuestras\nnuevas historias.' : event?.location || '')}
            startDate={event?.startDate}
            buttonLabel={cfg.buttonLabel || 'Inscripciones'}
            buttonLink={cfg.buttonLink || (isLatir ? 'https://forms.gle/CXWqMj5w335h4qm69' : '')}
            ticketGeneralLabel={cfg.ticketGeneralLabel || 'Ticket general:'}
            ticketGeneral={cfg.ticketGeneral || (isLatir ? 'USD 550' : '')}
            ticketNote={cfg.ticketDesc || (isLatir ? 'A partir del 15/03: USD 625' : '')}
            ticketRotexLabel={cfg.ticketRotexLabel || 'Ticket ROTEX:'}
            ticketRotex={cfg.ticketRotex || (isLatir ? 'USD 200' : '')}
            closeDateText={cfg.closeDateText || (isLatir ? '31/03/2026' : '')}
            footerImage={cfg.footerImage}
        />
    );
};

const EventoDetalle = () => {
    const { id } = useParams<{ id: string }>();
    const { club } = useClub();
    const [event, setEvent] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [currentImage, setCurrentImage] = useState(0);
    // Proporción real de cada imagen de la galería, para que el contenedor se
    // adapte a ella y ninguna quede recortada. Se acota para que un afiche muy
    // alargado no ocupe una pantalla entera.
    const [imageRatios, setImageRatios] = useState<Record<number, number>>({});
    const registerImageRatio = (index: number, img: HTMLImageElement) => {
        const { naturalWidth: w, naturalHeight: h } = img;
        if (!w || !h) return;
        const ratio = Math.min(Math.max(w / h, 0.6), 2.6);
        setImageRatios(prev => (prev[index] === ratio ? prev : { ...prev, [index]: ratio }));
    };

    useEffect(() => { window.scrollTo(0, 0); }, [id]);

    useEffect(() => {
        if (!event?.images || event.images.length <= 1) return;
        const timer = setInterval(() => {
            setCurrentImage(prev => (prev + 1) % event.images.length);
        }, 4000);
        return () => clearInterval(timer);
    }, [event?.images]);

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

                        {/* Image gallery Carousel */}
                        {/* v4.605 — El contenedor toma la proporción de la imagen que se
                            está mostrando y las imágenes van en `object-contain`, así que
                            se ven completas sea cual sea su tamaño. Antes el alto era fijo
                            (21/9) con `object-cover` y recortaba los afiches verticales. */}
                        {hasImages && (
                            <div className="my-10">
                                <div
                                    className="relative rounded-2xl overflow-hidden shadow-xl ring-1 ring-gray-100 bg-gray-50 transition-[aspect-ratio] duration-500"
                                    style={{ aspectRatio: imageRatios[currentImage] || 16 / 9 }}
                                >
                                    {event.images.map((imgSrc: string, index: number) => (
                                        <img
                                            key={`${imgSrc}-${index}`}
                                            src={imgSrc}
                                            alt={`Gallery image ${index + 1}`}
                                            onLoad={e => registerImageRatio(index, e.currentTarget)}
                                            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ease-in-out ${index === currentImage ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                                        />
                                    ))}

                                    {event.images.length > 1 && (
                                        <>
                                            <button
                                                onClick={() => setCurrentImage(prev => (prev - 1 + event.images.length) % event.images.length)}
                                                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
                                                aria-label="Imagen anterior"
                                            >
                                                <ChevronLeft className="w-5 h-5 text-gray-700" />
                                            </button>
                                            <button
                                                onClick={() => setCurrentImage(prev => (prev + 1) % event.images.length)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
                                                aria-label="Siguiente imagen"
                                            >
                                                <ChevronRight className="w-5 h-5 text-gray-700" />
                                            </button>
                                        </>
                                    )}
                                </div>

                                {event.images.length > 1 && (
                                    <div className="flex justify-center gap-2 mt-4">
                                        {event.images.map((_: any, index: number) => (
                                            <button
                                                key={index}
                                                onClick={() => setCurrentImage(index)}
                                                className={`
                                                    w-2 h-2 rounded-full transition-all
                                                    ${index === currentImage ? 'bg-rotary-blue w-6' : 'bg-gray-300'}
                                                `}
                                                aria-label={`Ir a imagen ${index + 1}`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Rich HTML content */}
                        {/* Las imágenes pegadas dentro del contenido se muestran completas y
                            centradas, aunque vengan con un ancho o un alto fijo en el HTML. */}
                        {event.htmlContent && (
                            <div
                                className="prose prose-blue max-w-none text-gray-700
                                    [&_img]:mx-auto [&_img]:h-auto [&_img]:max-w-full [&_img]:w-auto
                                    [&_img]:object-contain [&_img]:rounded-xl"
                                dangerouslySetInnerHTML={{ __html: event.htmlContent }}
                            />
                        )}
                    </div>

                    {/* Sidebar info */}
                    <div className="space-y-4">
                        {hasRegistrationPanel(event) && (
                            <EventRegistrationSidebar event={event} />
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

                        {/* Mapa de la sede de la Conferencia LATIR: la dirección está
                            escrita en el código, así que sigue siendo sólo de ese evento. */}
                        {event.id === LATIR_EVENT_ID && (
                            <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                                <h3 className="font-normal text-[1.1rem] mt-2 mb-3 text-center text-[#1B2B4D]">Ubicación de la Conferencia</h3>
                                <div className="rounded-xl overflow-hidden h-96 relative bg-gray-100 pointer-events-auto">
                                    <iframe 
                                        width="100%" 
                                        height="100%" 
                                        frameBorder="0" 
                                        scrolling="no" 
                                        src="https://maps.google.com/maps?q=Rayentray+Grand+Hotel,+Puerto+Madryn&hl=es&z=15&output=embed"
                                        title="Ubicación Conferencia LATIR"
                                        className="absolute inset-0 w-full h-full"
                                    ></iframe>
                                </div>
                                <a 
                                    href="https://www.google.com/maps/place/Rayentray+Grand+Hotel/@-42.784889,-65.0097973,843m/data=!3m2!1e3!4b1!4m9!3m8!1s0xbe024aad7797ae1f:0xb4c7f0e9503ba46f!5m2!4m1!1i2!8m2!3d-42.784889!4d-65.0097973!16s%2Fg%2F11b6ts1_39?hl=en-US" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="block text-center mt-3 mb-1 text-sm font-semibold text-rotary-blue hover:underline"
                                >
                                    Ver ubicación en Google Maps
                                </a>
                            </div>
                        )}

                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default EventoDetalle;
