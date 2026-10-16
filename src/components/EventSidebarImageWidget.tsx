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
// ════════════════════════════════════════════════════════════════════
import React from 'react';
import { ExternalLink } from 'lucide-react';
import {
    hasVisibleSidebarImageWidget,
    normalizeSidebarImageWidget,
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
    const widget = normalizeSidebarImageWidget(rawWidget);

    if (!hasVisibleSidebarImageWidget(widget)) {
        return null;
    }

    const {
        imageUrl,
        title,
        showTitle,
        altText,
        linkUrl,
        openInNewTab,
    } = widget!;

    const fallbackAlt = title
        ? `${title}${eventTitle ? ` · ${eventTitle}` : ''}`
        : (eventTitle ? `Imagen informativa · ${eventTitle}` : 'Imagen informativa del evento');

    const effectiveAlt = altText || fallbackAlt;

    const isLinkExternal = Boolean(
        linkUrl && (/^https?:\/\//i.test(linkUrl) || openInNewTab)
    );
    const target = openInNewTab
        ? '_blank'
        : (linkUrl?.startsWith('/') ? '_self' : (isLinkExternal ? '_blank' : '_self'));
    const rel = target === '_blank' ? 'noopener noreferrer' : undefined;

    const imageElement = (
        <img
            src={imageUrl}
            alt={effectiveAlt}
            loading="lazy"
            decoding="async"
            className="w-full h-auto object-contain block transition-transform duration-300 group-hover:scale-[1.01]"
        />
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
                    {linkUrl && isLinkExternal && (
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-rotary-blue transition-colors" />
                    )}
                </div>
            )}

            {/* Contenedor de la imagen con ajuste responsive perfecto */}
            <div className="w-full overflow-hidden bg-gray-50/40">
                {linkUrl ? (
                    <a
                        href={linkUrl}
                        target={target}
                        rel={rel}
                        className="group block w-full focus:outline-none focus:ring-2 focus:ring-rotary-blue/50 focus:ring-inset"
                        title={effectiveAlt}
                    >
                        {imageElement}
                    </a>
                ) : (
                    <div className="w-full">
                        {imageElement}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EventSidebarImageWidget;
