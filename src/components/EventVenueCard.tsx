// ════════════════════════════════════════════════════════════════════
// La sede del evento, en la ficha pública — v4.717.0
//
// Va justo debajo de la Ubicación porque continúa esa misma frase: primero
// dónde es, y a continuación qué lugar es, a quién escribirle y cómo llegar.
//
// Todo el contenido sale de `metadata.venue`, que el administrador edita desde
// la pestaña «Sede» del evento. Cada pieza se dibuja SÓLO si está: una sede
// con foto y sin contactos no deja un hueco donde iban los contactos.
// ════════════════════════════════════════════════════════════════════
import { Building2, Globe, Mail, MapPin, Phone, Smartphone } from 'lucide-react';
import {
    telHref, websiteLabel, venueHasContent, type EventVenue,
} from '../lib/eventVenue';

const EventVenueCard = ({ venue, fallbackName }: { venue: EventVenue; fallbackName?: string }) => {
    if (!venueHasContent(venue)) return null;

    const name = venue.name || fallbackName || '';

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
            {venue.image && (
                <img
                    src={venue.image}
                    alt={name || 'Sede del evento'}
                    loading="lazy"
                    className="h-40 w-full object-cover"
                />
            )}

            <div className="p-5">
                {name && (
                    <div className="flex items-start gap-3">
                        <Building2 className="w-5 h-5 text-rotary-blue mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Sede</p>
                            <p className="text-sm font-semibold text-gray-800">{name}</p>
                            {venue.address && <p className="text-sm text-gray-500">{venue.address}</p>}
                        </div>
                    </div>
                )}

                {venue.website && (
                    <a
                        href={venue.website} target="_blank" rel="noopener noreferrer"
                        className="mt-4 flex items-center gap-2 text-sm font-semibold text-rotary-blue hover:underline break-all"
                    >
                        <Globe className="w-4 h-4 flex-shrink-0" /> {websiteLabel(venue.website)}
                    </a>
                )}

                {/* Contactos de la sede. Correo y teléfonos van con su enlace:
                    desde el móvil se escribe o se llama sin copiar nada. */}
                {venue.contacts.length > 0 && (
                    <div className="mt-5 space-y-4 border-t border-gray-100 pt-4">
                        {venue.contacts.map((c, i) => (
                            <div key={i} className="text-sm">
                                {c.name && <p className="font-semibold text-gray-800">{c.name}</p>}
                                {c.role && <p className="text-xs uppercase tracking-wide text-gray-400">{c.role}</p>}
                                <div className="mt-1.5 space-y-1">
                                    {c.email && (
                                        <a href={`mailto:${c.email}`}
                                            className="flex items-center gap-2 text-gray-600 hover:text-rotary-blue break-all">
                                            <Mail className="w-3.5 h-3.5 flex-shrink-0" /> {c.email}
                                        </a>
                                    )}
                                    {c.mobile && (
                                        <a href={telHref(c.mobile)}
                                            className="flex items-center gap-2 text-gray-600 hover:text-rotary-blue">
                                            <Smartphone className="w-3.5 h-3.5 flex-shrink-0" /> {c.mobile}
                                        </a>
                                    )}
                                    {c.phone && (
                                        <a href={telHref(c.phone)}
                                            className="flex items-center gap-2 text-gray-600 hover:text-rotary-blue">
                                            <Phone className="w-3.5 h-3.5 flex-shrink-0" /> {c.phone}
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {venue.mapUrl && (
                <div className="border-t border-gray-100">
                    <div className="relative h-64 bg-gray-100">
                        <iframe
                            src={venue.mapUrl}
                            title={`Ubicación de ${name || 'la sede'}`}
                            loading="lazy"
                            referrerPolicy="strict-origin-when-cross-origin"
                            className="absolute inset-0 h-full w-full border-0"
                            allowFullScreen
                        />
                    </div>
                    <a
                        href={venue.mapUrl.replace('/maps/embed', '/maps')}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-rotary-blue hover:underline"
                    >
                        <MapPin className="w-4 h-4" /> Ver en Google Maps
                    </a>
                </div>
            )}
        </div>
    );
};

export default EventVenueCard;
