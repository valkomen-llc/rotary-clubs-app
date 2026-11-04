// ════════════════════════════════════════════════════════════════════
// «Hoteles de la conferencia» — sección de la ficha pública — v4.1275.0
//
// Va en la columna principal de la ficha del evento, ENTRE el carrusel de
// fotografías (MediaGallery) y el contenido HTML («¿Qué incluye tu
// inscripción?»). Se configura por evento en el panel: Eventos → el evento →
// «🏨 Hoteles y alojamiento» (metadata.hotels, ver server/lib/eventHotels.js).
//
// Reglas de lectura (pedido del comité):
//   · La diapositiva se ve COMPLETA (object-contain), nunca recortada: precios,
//     condiciones y teléfonos no se pueden perder.
//   · Sin reproducción automática: cada asistente avanza a su ritmo.
//   · El visor reserva el alto de la diapositiva más alta, así que al pasar de
//     una a otra la página no salta.
//   · Apagada o sin diapositivas publicadas, la sección NO existe (null).
//
// El panel la previsualiza con ESTE mismo componente (`preview`).
// ════════════════════════════════════════════════════════════════════
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Download, Hotel, ImageOff, Loader2, Maximize2 } from 'lucide-react';
import EventHotelsLightbox from './EventHotelsLightbox';
import { formatBytes, formatRatesDate, publicHotelsView } from '../../server/lib/eventHotels.js';
import { hotelsGuideDownloadPath } from '../../server/lib/eventDocumentStats.js';

// v4.1279.0 — El botón de descarga apunta a la PLATAFORMA, que registra la
// solicitud y redirige a S3. Sin `eventId` (o en la vista previa del panel) se
// enlaza el archivo directo: una prueba del administrador no cuenta.
const API = (import.meta as any).env?.VITE_API_URL || '/api';

interface Props {
    /** `metadata.hotels` del evento, tal cual llega del servidor. */
    hotels: unknown;
    /** Nombre del evento (texto alternativo de respaldo). */
    eventTitle?: string;
    /** Id del evento: con él, la descarga de la guía pasa por la plataforma y se cuenta. */
    eventId?: string;
    /**
     * Vista previa del panel: se pinta aunque la sección esté apagada (para
     * ver cómo quedará antes de publicarla). Sin diapositivas, igual no pinta.
     */
    preview?: boolean;
    className?: string;
}

/** Proporción (alto / ancho) que reserva el visor: la de la diapositiva más alta, con topes. */
const viewerRatio = (slides: { width?: number; height?: number }[]) => {
    let r = 0;
    for (const s of slides) {
        if (s.width && s.height) r = Math.max(r, s.height / s.width);
    }
    if (!r) r = 9 / 16;
    return Math.min(1.3, Math.max(0.42, r));
};

const EventHotelsSection = ({ hotels, eventTitle, eventId, preview = false, className = '' }: Props) => {
    // Hooks arriba, antes de cualquier return.
    const view = useMemo(
        () => publicHotelsView(preview && hotels && typeof hotels === 'object' ? { ...(hotels as object), enabled: true } : hotels),
        [hotels, preview],
    );
    const [index, setIndex] = useState(0);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    // Por diapositiva: cuántas veces se reintentó y qué intento cargó o falló.
    const [attempts, setAttempts] = useState<Record<string, number>>({});
    const [loaded, setLoaded] = useState<Record<string, boolean>>({});
    const [failed, setFailed] = useState<Record<string, boolean>>({});
    const headingId = useId();
    // Sólo en el sitio público: con id y fuera de la vista previa.
    const tracked = Boolean(eventId) && !preview;
    const thumbsRef = useRef<HTMLDivElement>(null);
    const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);
    const swipedRef = useRef(false);

    const slides = view?.slides || [];
    const total = slides.length;
    const safeIndex = Math.min(index, Math.max(0, total - 1));
    const current = slides[safeIndex];

    // Si cambian las diapositivas (vista previa del panel), no quedar fuera de rango.
    useEffect(() => {
        if (index > total - 1) setIndex(Math.max(0, total - 1));
    }, [index, total]);

    // Precargar la anterior y la siguiente: el cambio se siente instantáneo
    // sin descargar toda la presentación de entrada.
    useEffect(() => {
        if (!total || typeof window === 'undefined') return;
        for (const i of [safeIndex + 1, safeIndex - 1]) {
            const s = slides[i];
            if (!s) continue;
            const img = new window.Image();
            img.decoding = 'async';
            img.src = s.mediumUrl || s.imageUrl;
        }
    }, [safeIndex, slides, total]);

    // La miniatura activa, siempre a la vista dentro de su fila (sin mover la página).
    useEffect(() => {
        const row = thumbsRef.current;
        const el = row?.querySelector<HTMLElement>(`[data-thumb="${safeIndex}"]`);
        if (!row || !el) return;
        const left = el.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2;
        row.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }, [safeIndex]);

    if (!view || !current) return null;

    const go = (next: number) => {
        if (next < 0 || next >= total) return;
        setIndex(next);
    };

    const ratio = viewerRatio(slides);
    const altOf = (i: number) => slides[i]?.altText
        || `${view.title}${eventTitle ? ` · ${eventTitle}` : ''} — diapositiva ${i + 1} de ${total}`;
    const attempt = attempts[current.id] || 0;
    const loadKey = `${current.id}:${attempt}`;
    const isLoaded = loaded[loadKey] === true;
    const currentFailed = failed[loadKey] === true;
    const withRetry = (url: string) => (attempt > 0 ? `${url}${url.includes('?') ? '&' : '?'}r=${attempt}` : url);
    const ratesDate = formatRatesDate(view.ratesUpdatedOn);

    const onPointerDown = (e: React.PointerEvent) => {
        swipedRef.current = false;
        swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onPointerUp = (e: React.PointerEvent) => {
        const s = swipeRef.current;
        swipeRef.current = null;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            swipedRef.current = true;
            go(safeIndex + (dx < 0 ? 1 : -1));
        }
    };
    const openLightbox = () => {
        if (swipedRef.current) { swipedRef.current = false; return; }
        setLightboxOpen(true);
    };

    const arrowBtn = 'absolute top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white/95 text-rotary-blue shadow-md ring-1 ring-black/5 transition hover:bg-white hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue disabled:opacity-0 disabled:pointer-events-none';

    return (
        <section
            aria-labelledby={headingId}
            className={`bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] p-5 sm:p-7 ${className}`}
            data-section="hoteles-de-la-conferencia"
        >
            {/* Encabezado */}
            <header className="flex items-start gap-3.5 sm:gap-4">
                <span className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-rotary-blue ring-1 ring-blue-100" aria-hidden="true">
                    <Hotel className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                    <h2 id={headingId} className="text-xl sm:text-2xl font-bold leading-tight text-rotary-blue">
                        {view.title}
                    </h2>
                    {view.description && (
                        <p className="mt-1.5 text-sm sm:text-[15px] leading-relaxed text-gray-600 whitespace-pre-line">
                            {view.description}
                        </p>
                    )}
                    {ratesDate && (
                        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                            <CalendarClock className="h-3.5 w-3.5" />
                            Tarifas actualizadas al {ratesDate}
                        </p>
                    )}
                </div>
            </header>

            {/* Visor */}
            <div
                className="relative mt-5 sm:mt-6 rounded-xl bg-gray-50 ring-1 ring-gray-200 overflow-hidden select-none"
                role="region"
                aria-roledescription="carrusel"
                aria-label={`${view.title}: diapositivas`}
                tabIndex={0}
                onKeyDown={e => {
                    if (e.key === 'ArrowRight') { e.preventDefault(); go(safeIndex + 1); }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); go(safeIndex - 1); }
                    if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); setLightboxOpen(true); }
                }}
            >
                <div
                    className="relative w-full cursor-zoom-in"
                    style={{ paddingTop: `${ratio * 100}%`, touchAction: 'pan-y' }}
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => { swipeRef.current = null; }}
                    onClick={openLightbox}
                >
                    {currentFailed ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                            <ImageOff className="h-9 w-9 text-gray-300" />
                            <p className="text-sm text-gray-500">No pudimos cargar esta diapositiva.</p>
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setAttempts(a => ({ ...a, [current.id]: attempt + 1 })); }}
                                className="rounded-full border border-gray-300 bg-white px-4 py-1.5 text-xs font-semibold text-gray-700 hover:border-rotary-blue hover:text-rotary-blue"
                            >
                                Reintentar
                            </button>
                        </div>
                    ) : (
                        <>
                            {!isLoaded && (
                                <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                                    <Loader2 className="h-7 w-7 animate-spin text-rotary-blue/60" />
                                </div>
                            )}
                            <img
                                key={`${current.id}-${attempt}`}
                                src={withRetry(current.mediumUrl || current.imageUrl)}
                                srcSet={current.mediumUrl
                                    ? `${withRetry(current.mediumUrl)} 1400w, ${withRetry(current.imageUrl)} 2400w`
                                    : undefined}
                                sizes={current.mediumUrl ? '(min-width: 1280px) 800px, (min-width: 1024px) 62vw, 100vw' : undefined}
                                alt={altOf(safeIndex)}
                                loading={safeIndex === 0 ? 'lazy' : 'eager'}
                                decoding="async"
                                draggable={false}
                                onLoad={() => setLoaded(l => ({ ...l, [loadKey]: true }))}
                                onError={() => setFailed(f => ({ ...f, [loadKey]: true }))}
                                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                            />
                        </>
                    )}
                </div>

                {total > 1 && (
                    <>
                        <button type="button" onClick={() => go(safeIndex - 1)} disabled={safeIndex === 0} aria-label="Diapositiva anterior" className={`${arrowBtn} left-2 sm:left-3`}>
                            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                        </button>
                        <button type="button" onClick={() => go(safeIndex + 1)} disabled={safeIndex === total - 1} aria-label="Diapositiva siguiente" className={`${arrowBtn} right-2 sm:right-3`}>
                            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                        </button>
                    </>
                )}

                <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    aria-label="Ampliar la diapositiva"
                    title="Ampliar"
                    className="absolute right-2 top-2 sm:right-3 sm:top-3 z-10 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow ring-1 ring-black/5 hover:text-rotary-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue"
                >
                    <Maximize2 className="h-4 w-4" />
                </button>
            </div>

            {/* Indicador + ampliar */}
            <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-600 tabular-nums" aria-live="polite">
                    Diapositiva <span className="font-bold text-gray-900">{safeIndex + 1}</span> de {total}
                </p>
                <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-rotary-blue hover:border-rotary-blue hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue"
                >
                    <Maximize2 className="h-4 w-4" />
                    Ampliar<span className="hidden sm:inline -ml-1">para leer</span>
                </button>
            </div>

            {/* Miniaturas */}
            {view.showThumbnails && (
                <div
                    ref={thumbsRef}
                    className="mt-3 -mx-1 flex gap-2.5 overflow-x-auto px-1 pt-1 pb-2 [scrollbar-width:thin]"
                    aria-label="Miniaturas de las diapositivas"
                >
                    {slides.map((s, i) => (
                        <button
                            key={s.id}
                            type="button"
                            data-thumb={i}
                            onClick={() => go(i)}
                            aria-label={`Ver la diapositiva ${i + 1}`}
                            aria-current={i === safeIndex ? 'true' : undefined}
                            className={`relative shrink-0 w-24 sm:w-28 aspect-[16/10] overflow-hidden rounded-lg bg-gray-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue ${
                                i === safeIndex ? 'ring-2 ring-rotary-blue ring-offset-1' : 'ring-1 ring-gray-200 opacity-70 hover:opacity-100'
                            }`}
                        >
                            <img
                                src={s.thumbUrl || s.mediumUrl || s.imageUrl}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                                className="h-full w-full object-contain"
                            />
                            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">{i + 1}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Descarga de la guía completa (sólo si está autorizada y hay archivo) */}
            {view.download && (
                <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border-t border-gray-100 pt-5">
                    <a
                        href={tracked ? `${API}${hotelsGuideDownloadPath(eventId as string, 'section')}` : view.download.url}
                        download={view.download.fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-rotary-blue px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-rotary-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rotary-blue"
                    >
                        <Download className="h-4 w-4" />
                        <span aria-hidden="true">📥</span> Descargar guía de hoteles
                    </a>
                    <span className="text-xs text-gray-400 text-center sm:text-left">
                        PDF{view.download.sizeBytes ? ` · ${formatBytes(view.download.sizeBytes)}` : ''}
                    </span>
                </div>
            )}

            {lightboxOpen && (
                <EventHotelsLightbox
                    slides={slides}
                    index={safeIndex}
                    title={view.title}
                    download={view.download}
                    downloadHref={tracked && view.download ? `${API}${hotelsGuideDownloadPath(eventId as string, 'lightbox')}` : undefined}
                    onIndexChange={go}
                    onClose={() => setLightboxOpen(false)}
                />
            )}
        </section>
    );
};

export default EventHotelsSection;
