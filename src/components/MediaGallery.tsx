// ════════════════════════════════════════════════════════════════════
// Galería de imágenes estándar — v4.607.0
//
// Mosaico de tres columnas con paginación: todas las miniaturas tienen el
// mismo tamaño, así que la galería se ve pareja aunque las imágenes vengan
// con proporciones distintas (afiches verticales, fotos horizontales…).
//
// Al pulsar una miniatura se abre un visor a pantalla completa que muestra
// la imagen COMPLETA, sin recortar, y permite pasar de una a otra.
//
// Pensada para reutilizarse en cualquier galería del sitio; hoy la usa la
// ficha del evento.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';

/** Proporción de las miniaturas. Todas las de una galería comparten la misma. */
export type GalleryRatio = 'horizontal' | 'cuadrada' | 'vertical';

const RATIO_CLASSES: Record<GalleryRatio, string> = {
    horizontal: 'aspect-[4/3]',
    cuadrada: 'aspect-square',
    vertical: 'aspect-[3/4]',
};

export interface MediaGalleryProps {
    images: string[];
    /** Miniaturas por página. Por defecto 3 (una fila de tres columnas). */
    perPage?: number;
    /** Proporción de las miniaturas. Por defecto horizontal (4:3). */
    ratio?: GalleryRatio;
    /** Texto base para el alt de cada imagen. */
    altPrefix?: string;
    className?: string;
}

const MediaGallery = ({
    images,
    perPage = 3,
    ratio = 'horizontal',
    altPrefix = 'Imagen',
    className = '',
}: MediaGalleryProps) => {
    const [page, setPage] = useState(0);
    const [lightbox, setLightbox] = useState<number | null>(null);

    const total = images.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const start = page * perPage;
    const visible = images.slice(start, start + perPage);

    const goto = useCallback((index: number) => {
        if (!total) return;
        setLightbox(((index % total) + total) % total);
    }, [total]);

    // Teclado dentro del visor: flechas para navegar, Escape para cerrar.
    useEffect(() => {
        if (lightbox === null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLightbox(null);
            if (e.key === 'ArrowRight') goto(lightbox + 1);
            if (e.key === 'ArrowLeft') goto(lightbox - 1);
        };
        window.addEventListener('keydown', onKey);
        // Con el visor abierto la página de atrás no debe desplazarse.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [lightbox, goto]);

    if (!total) return null;

    return (
        <div className={className}>
            {/* Mosaico */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {visible.map((src, i) => {
                    const index = start + i;
                    return (
                        <button
                            key={`${src}-${index}`}
                            type="button"
                            onClick={() => setLightbox(index)}
                            className={`group relative overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-gray-100 shadow-sm transition-shadow hover:shadow-xl ${RATIO_CLASSES[ratio]}`}
                            aria-label={`Ver ${altPrefix.toLowerCase()} ${index + 1} de ${total}`}
                        >
                            <img
                                src={src}
                                alt={`${altPrefix} ${index + 1}`}
                                loading="lazy"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/35 group-hover:opacity-100">
                                <ZoomIn className="h-8 w-8 text-white drop-shadow" />
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Paginación del carrusel */}
            {pages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-4">
                    <button
                        type="button"
                        onClick={() => setPage(p => (p - 1 + pages) % pages)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-gray-100 transition-colors hover:bg-gray-50"
                        aria-label="Imágenes anteriores"
                    >
                        <ChevronLeft className="h-5 w-5 text-gray-700" />
                    </button>

                    <div className="flex items-center gap-2">
                        {Array.from({ length: pages }, (_, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setPage(i)}
                                className={`h-2 rounded-full transition-all ${i === page ? 'w-6 bg-rotary-blue' : 'w-2 bg-gray-300 hover:bg-gray-400'}`}
                                aria-label={`Ir al grupo ${i + 1}`}
                            />
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => setPage(p => (p + 1) % pages)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-gray-100 transition-colors hover:bg-gray-50"
                        aria-label="Siguientes imágenes"
                    >
                        <ChevronRight className="h-5 w-5 text-gray-700" />
                    </button>
                </div>
            )}

            {/* Visor: la imagen se ve completa, sin recortar */}
            {lightbox !== null && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 sm:p-8"
                    onClick={() => setLightbox(null)}
                    role="dialog"
                    aria-modal="true"
                >
                    <button
                        type="button"
                        onClick={() => setLightbox(null)}
                        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
                        aria-label="Cerrar"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    {total > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); goto(lightbox - 1); }}
                                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 sm:left-6"
                                aria-label="Imagen anterior"
                            >
                                <ChevronLeft className="h-6 w-6" />
                            </button>
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); goto(lightbox + 1); }}
                                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 sm:right-6"
                                aria-label="Siguiente imagen"
                            >
                                <ChevronRight className="h-6 w-6" />
                            </button>
                        </>
                    )}

                    <img
                        src={images[lightbox]}
                        alt={`${altPrefix} ${lightbox + 1}`}
                        onClick={e => e.stopPropagation()}
                        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
                    />

                    {total > 1 && (
                        <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white">
                            {lightbox + 1} / {total}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default MediaGallery;
