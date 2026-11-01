// ════════════════════════════════════════════════════════════════════
// Widget de imagen promocional lateral para eventos — v4.1207.0
//
// Se muestra en la columna lateral derecha de la página de detalles
// de cualquier evento de Club Platform, inmediatamente debajo de la
// tarjeta de la sede y el mapa de ubicación.
//
// Mantiene fidelidad total al diseño nativo de Rotary Distrito 4281:
// bordes redondeados (rounded-2xl), sombra suave institucional,
// ancho 100% responsive, altura proporcional (object-contain) para
// formatos verticales como 1080×1350 (4:5) o cualquier proporción,
// sin recortar textos ni desbordar la columna.
//
// v4.1273.0 — Con varias imágenes activas se convierte en un carrusel
// (EventSidebarImageCarousel). Con una sola, se ve exactamente como antes.
// ════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import EventSidebarImageCarousel from './EventSidebarImageCarousel';
import {
    hasVisibleSidebarImageWidget,
    normalizeSidebarImageWidget,
    resolveSlideLinkTarget,
    visibleSidebarSlides,
    type EventSidebarImageWidget as WidgetData,
} from '../lib/eventWidgets';

interface Props {
    /** Configuración del widget (extraído de metadata del evento). */
    widget?: WidgetData | null;
    /** Título del evento para accesibilidad (alt) si no se especifica texto propio. */
    eventTitle?: string;
    /** Clases CSS adicionales para el contenedor exterior. */
    className?: string;
}

const EventSidebarImageWidget: React.FC<Props> = ({
    widget: rawWidget,
    eventTitle,
    className = '',
}) => {
    // v4.1273.0 — Hook arriba, antes de cualquier return.
    const [activeIndex, setActiveIndex] = useState(0);
    const widget = normalizeSidebarImageWidget(rawWidget);

    if (!hasVisibleSidebarImageWidget(widget)) {
        return null;
    }

    const { title, showTitle, carousel } = widget!;
    // Sólo las imágenes activas, en el orden configurado. Un evento anterior
    // al carrusel llega aquí como una lista de UNA imagen (migración al leer).
    const slides = visibleSidebarSlides(widget);
    const activeSlide = slides[Math.min(activeIndex, slides.length - 1)];

    const fallbackAlt = title
        ? `${title}${eventTitle ? ` · ${eventTitle}` : ''}`
        : (eventTitle ? `Imagen informativa · ${eventTitle}` : 'Imagen informativa del evento');

    const activeIsExternal = Boolean(
        activeSlide?.linkUrl && resolveSlideLinkTarget(activeSlide.linkUrl, activeSlide.openInNewTab).external
    );

    return (
        <div
            className={`bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden transition-all duration-200 ${className}`}
        >
            {/* Título opcional configurable sobre el widget */}
            {showTitle && title && (
                <div className="px-5 py-3.5 border-b border-gray-100/80 bg-gray-50/60 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        {title}
                    </h3>
                    {activeIsExternal && (
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                    )}
                </div>
            )}

            {/* Imagen única o carrusel, con ajuste responsive sin recortes */}
            <EventSidebarImageCarousel
                slides={slides}
                settings={carousel}
                fallbackAlt={fallbackAlt}
                onIndexChange={setActiveIndex}
            />
        </div>
    );
};

export default EventSidebarImageWidget;
