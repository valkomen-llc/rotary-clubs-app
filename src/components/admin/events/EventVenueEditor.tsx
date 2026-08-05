// ════════════════════════════════════════════════════════════════════
// La sede del evento, desde el panel — v4.717.0
//
// Escribe `metadata.venue` del evento: foto del lugar, sitio web, contactos y
// mapa. Todo por evento y sin desplegar — hasta ahora el único mapa del sitio
// estaba escrito en el código y detrás de un `if` por id de evento.
//
// La casilla de la foto ofrece SIEMPRE las dos vías —subir un archivo o elegir
// de la Biblioteca Multimedia—, que es la regla del sitio desde v4.700: sin la
// segunda, reutilizar una imagen ya cargada obliga a descargarla y resubirla, y
// queda duplicada con otro nombre y otra dirección.
// ════════════════════════════════════════════════════════════════════
import React, { useRef, useState } from 'react';
import { Building2, Globe, Loader2, MapPin, Plus, Trash2, Users } from 'lucide-react';
import ImageSourceOverlay from '../ImageSourceOverlay';
import MediaPicker from '../content-studio/MediaPicker';
import {
    draftVenue, emptyContact, normalizeMapUrl, normalizeWebsite,
    type EventVenue, type VenueContact,
} from '../../../lib/eventVenue';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white';
const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1';

interface Props {
    venue: any;
    onChange: (venue: EventVenue) => void;
}

const EventVenueEditor: React.FC<Props> = ({ venue: raw, onChange }) => {
    // El BORRADOR, no la versión normalizada: normalizar aquí descartaba el
    // contacto recién agregado —nace vacío— en el mismo render, y destrozaba
    // el sitio web mientras se escribía.
    const venue = draftVenue(raw);
    // Lo que el administrador tiene ESCRITO en la casilla del mapa, que puede
    // ser el `<iframe>` entero recién pegado de Google. Se conserva tal cual
    // mientras escribe y sólo se normaliza al guardar: normalizar en cada
    // pulsación borraría el texto a mitad de pegarlo.
    const [mapDraft, setMapDraft] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const set = (patch: Partial<EventVenue>) => onChange({ ...venue, ...patch });

    const setContact = (index: number, patch: Partial<VenueContact>) => {
        const contacts = venue.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c));
        onChange({ ...venue, contacts });
    };

    const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const form = new FormData();
            form.append('image', file);
            const res = await fetch(`${API}/calendar/events/upload-image`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                body: form,
            });
            const data = await res.json();
            if (data.url) set({ image: data.url });
            else alert('No pudimos subir la imagen.');
        } catch {
            alert('No pudimos subir la imagen.');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const mapValue = mapDraft ?? venue.mapUrl;
    const mapInvalid = Boolean(mapDraft?.trim()) && !normalizeMapUrl(mapDraft);

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Se muestra en la ficha pública del evento, justo debajo de la ubicación.
                Cada dato aparece sólo si lo llenas.
            </p>

            {/* ── Foto del lugar ───────────────────────────────── */}
            <div>
                <span className={label}>Imagen de la sede</span>
                <div className="group relative h-40 w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                    {venue.image ? (
                        <img src={venue.image} alt="Sede" className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400">
                            <Building2 className="mr-2 h-5 w-5" /> Sin imagen
                        </div>
                    )}
                    {uploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                            <Loader2 className="h-6 w-6 animate-spin text-rotary-blue" />
                        </div>
                    )}
                    <ImageSourceOverlay
                        onUpload={upload}
                        onPickFromLibrary={() => setPickerOpen(true)}
                    />
                </div>
                {venue.image && (
                    <button type="button" onClick={() => set({ image: '' })}
                        className="mt-2 text-xs font-semibold text-red-500 hover:underline">
                        Quitar imagen
                    </button>
                )}
            </div>

            {/* ── Identidad del lugar ──────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className={label} htmlFor="venue-name">Nombre del lugar</label>
                    <input id="venue-name" className={input} value={venue.name}
                        onChange={e => set({ name: e.target.value })}
                        placeholder="Sonesta Hotel Valledupar" />
                </div>
                <div>
                    <label className={label} htmlFor="venue-address">Dirección o ciudad</label>
                    <input id="venue-address" className={input} value={venue.address}
                        onChange={e => set({ address: e.target.value })}
                        placeholder="Valledupar, Colombia" />
                </div>
                <div className="sm:col-span-2">
                    <label className={label} htmlFor="venue-web">
                        <Globe className="mr-1 inline h-3 w-3" /> Sitio web
                    </label>
                    {/* Se completa el esquema al SALIR de la casilla: hacerlo
                        en cada pulsación convertía la primera letra en
                        `https://w/`. */}
                    <input id="venue-web" className={input} value={venue.website}
                        onChange={e => set({ website: e.target.value })}
                        onBlur={e => set({ website: normalizeWebsite(e.target.value) })}
                        placeholder="https://www.sonestavalledupar.com/" />
                </div>
            </div>

            {/* ── Mapa ─────────────────────────────────────────── */}
            <div>
                <label className={label} htmlFor="venue-map">
                    <MapPin className="mr-1 inline h-3 w-3" /> Mapa
                </label>
                <textarea
                    id="venue-map" rows={3}
                    className={`${input} font-mono text-xs ${mapInvalid ? 'border-red-400 focus:ring-red-400' : ''}`}
                    value={mapValue}
                    onChange={e => setMapDraft(e.target.value)}
                    onBlur={() => {
                        if (mapDraft === null) return;
                        set({ mapUrl: normalizeMapUrl(mapDraft) });
                        setMapDraft(null);
                    }}
                    placeholder='Pega aquí el "Insertar un mapa" que te da Google Maps'
                />
                <p className={`mt-1 text-xs ${mapInvalid ? 'text-red-600' : 'text-gray-400'}`}>
                    {mapInvalid
                        ? 'No reconocimos un mapa de Google. Pega el código que da «Compartir → Insertar un mapa».'
                        : 'Puedes pegar el código <iframe> completo: se queda sólo con la dirección del mapa.'}
                </p>
                {venue.mapUrl && (
                    <div className="mt-3 h-48 overflow-hidden rounded-xl border border-gray-200">
                        <iframe src={venue.mapUrl} title="Vista previa del mapa"
                            loading="lazy" className="h-full w-full border-0" />
                    </div>
                )}
            </div>

            {/* ── Contactos ────────────────────────────────────── */}
            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span className={`${label} mb-0`}>
                        <Users className="mr-1 inline h-3 w-3" /> Contactos de la sede
                    </span>
                    <button
                        type="button"
                        onClick={() => onChange({ ...venue, contacts: [...venue.contacts, emptyContact()] })}
                        disabled={venue.contacts.length >= 6}
                        className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                    >
                        <Plus className="h-3.5 w-3.5" /> Agregar contacto
                    </button>
                </div>

                {venue.contacts.length === 0 && (
                    <p className="text-sm text-gray-400">Sin contactos. Agrega uno si quieres que aparezca a quién escribirle.</p>
                )}

                <div className="space-y-3">
                    {venue.contacts.map((c, i) => (
                        <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <input className={input} value={c.name} placeholder="Nombre completo"
                                    onChange={e => setContact(i, { name: e.target.value })} />
                                <input className={input} value={c.role} placeholder="Cargo"
                                    onChange={e => setContact(i, { role: e.target.value })} />
                                <input className={input} value={c.email} placeholder="correo@hotel.com" type="email"
                                    onChange={e => setContact(i, { email: e.target.value })} />
                                <input className={input} value={c.mobile} placeholder="Celular"
                                    onChange={e => setContact(i, { mobile: e.target.value })} />
                                <input className={input} value={c.phone} placeholder="Teléfono fijo"
                                    onChange={e => setContact(i, { phone: e.target.value })} />
                            </div>
                            <button
                                type="button"
                                onClick={() => onChange({ ...venue, contacts: venue.contacts.filter((_, j) => j !== i) })}
                                className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-500 hover:underline"
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Quitar contacto
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Un solo selector para toda la pantalla, con selección única: al
                elegir se SUSTITUYE la imagen, no se rechaza (regla de v4.700). */}
            <MediaPicker
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                maxSelection={1}
                onSelect={items => {
                    if (items[0]?.url) set({ image: items[0].url });
                    setPickerOpen(false);
                }}
            />
        </div>
    );
};

export default EventVenueEditor;
