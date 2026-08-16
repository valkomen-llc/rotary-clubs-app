import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { GalleryItem } from '../../lib/contributionSpec';

// ════════════════════════════════════════════════════════════════════
// La galería «Rotarios en acción» — v4.822
//
// Una TIRA a lo ancho de la pantalla con varias piezas a la vez, que se
// desplaza sola, y que al pasar el cursor por una tarjeta la agranda.
//
// Tres decisiones que conviene no deshacer:
//
// 1. LA TIRA SE DETIENE AL PASAR EL CURSOR. No es un adorno: es lo que hace
//    utilizable el agrandado y el clic. Una tarjeta que crece mientras se
//    escapa hacia el costado no se puede mirar ni pulsar.
//
// 2. UN VIDEO NO SE REPRODUCE DENTRO DE LA TIRA. En una tira en movimiento no
//    se puede ver un video —y si el cursor sale, se lo lleva sonando fuera de
//    la pantalla—. En la tira el video es una TARJETA con su carátula y su
//    botón de reproducir; al pulsarla se abre en grande y ahí sí se ve. Sin
//    esa ventana, mezclar videos en una tira móvil sería prometer algo que no
//    funciona.
//
// 3. LA LISTA SE DUPLICA para que el desplazamiento no tenga costura, y la
//    copia va con `aria-hidden`: para un lector de pantalla las piezas siguen
//    siendo las que hay, no el doble.
//
// El movimiento respeta `prefers-reduced-motion`: quien pidió menos animación
// recibe la tira quieta y con desplazamiento manual, no una tira que no se
// puede recorrer.
// ════════════════════════════════════════════════════════════════════

/** Cuántos segundos tarda una pieza en cruzar. Más alto = más lento. */
const SEGUNDOS_POR_PIEZA = 6;

const Tarjeta: React.FC<{
    item: GalleryItem;
    onOpen: () => void;
    aria?: boolean;
}> = ({ item, onOpen, aria = true }) => (
    <button
        type="button"
        onClick={onOpen}
        aria-hidden={!aria}
        tabIndex={aria ? 0 : -1}
        // `group` y el `scale` en el hijo: crece la IMAGEN dentro del marco,
        // así el recorte redondeado se conserva y la tarjeta no empuja a sus
        // vecinas. `hover:z-10` la deja por encima al agrandarse.
        className="group relative flex-shrink-0 w-[280px] sm:w-[340px] rounded-2xl overflow-hidden bg-gray-900 shadow-md hover:shadow-2xl hover:z-10 transition-shadow duration-300 focus:outline-none focus:ring-4 focus:ring-white/40"
        style={{ aspectRatio: '4 / 3' }}
    >
        {item.thumb ? (
            <img
                src={item.thumb}
                alt={item.alt || item.caption || ''}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
        ) : (
            // Vimeo no publica una miniatura fija sin consultar su API, así que
            // esa tarjeta se pinta con su carátula genérica en vez de con un
            // hueco: nunca un recuadro roto (v4.650).
            <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
        )}

        {item.kind === 'video' && (
            <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                </span>
            </span>
        )}

        {(item.caption || item.credit) && (
            <span className="absolute inset-x-0 bottom-0 p-4 text-left bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                {item.caption && <span className="block text-white text-sm font-bold leading-snug">{item.caption}</span>}
                {/* Quién mandó la pieza es un DATO, no lenguaje (v4.662). */}
                {item.credit && <span className="block text-white/70 text-xs mt-0.5" data-no-translate>{item.credit}</span>}
            </span>
        )}
    </button>
);

const CampaignGallery: React.FC<{ items: GalleryItem[]; accent: string }> = ({ items, accent }) => {
    // Cuál está abierta en grande. `null` = ninguna.
    const [abierta, setAbierta] = useState<number | null>(null);

    // Cerrar con Escape: en una ventana que tapa la página, es lo primero que
    // se intenta. El oyente vive mientras hay algo abierto y no más.
    useEffect(() => {
        if (abierta === null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setAbierta(null);
            if (e.key === 'ArrowRight') setAbierta(i => (i === null ? null : (i + 1) % items.length));
            if (e.key === 'ArrowLeft') setAbierta(i => (i === null ? null : (i - 1 + items.length) % items.length));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [abierta, items.length]);

    if (!items.length) return null;

    const pieza = abierta === null ? null : items[abierta];
    // La velocidad es proporcional a la cantidad: con más piezas la tira es
    // más larga, y una duración fija las haría desfilar cada vez más rápido.
    const duracion = `${items.length * SEGUNDOS_POR_PIEZA}s`;

    return (
        <>
            {/* La tira ocupa el ancho de la pantalla: el título va dentro del
                contenedor centrado, esto no. `mask` desvanece los extremos para
                que las piezas no aparezcan cortadas de golpe. */}
            <div
                className="relative w-full overflow-hidden motion-reduce:overflow-x-auto"
                style={{
                    maskImage: 'linear-gradient(to right, transparent, black 4%, black 96%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent, black 4%, black 96%, transparent)',
                }}
            >
                <div
                    className="flex gap-5 w-max animate-gallery-marquee hover:[animation-play-state:paused] motion-reduce:animate-none"
                    style={{ animationDuration: duracion }}
                >
                    {items.map((it, i) => (
                        <Tarjeta key={`a-${i}`} item={it} onOpen={() => setAbierta(i)} />
                    ))}
                    {/* La copia que hace continuo el desplazamiento. Va oculta
                        al lector de pantalla: las piezas son las que hay. */}
                    {items.map((it, i) => (
                        <Tarjeta key={`b-${i}`} item={it} onOpen={() => setAbierta(i)} aria={false} />
                    ))}
                </div>
            </div>

            {/* La pieza en grande. Acá SÍ se reproduce el video. */}
            {pieza && (
                <div
                    className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={pieza.caption || 'Pieza de la galería'}
                    onClick={() => setAbierta(null)}
                >
                    {/* El clic dentro NO cierra: sólo el del fondo. */}
                    <div className="relative w-full max-w-5xl" onClick={e => e.stopPropagation()}>
                        <div className="w-full rounded-2xl overflow-hidden bg-black shadow-2xl relative" style={{ aspectRatio: '16 / 9' }}>
                            {pieza.kind === 'image' ? (
                                <img src={pieza.src} alt={pieza.alt || pieza.caption || ''} className="absolute inset-0 w-full h-full object-contain" />
                            ) : pieza.player === 'file' ? (
                                // `key` fuerza el remontaje al cambiar de pieza:
                                // sin él, el anterior seguiría sonando (v4.816).
                                <video key={pieza.url} src={pieza.src} controls autoPlay playsInline className="absolute inset-0 w-full h-full" />
                            ) : (
                                <iframe
                                    key={pieza.url}
                                    src={`${pieza.src}?autoplay=1`}
                                    title={pieza.caption || 'Video de la campaña'}
                                    className="absolute inset-0 w-full h-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    allowFullScreen
                                />
                            )}
                        </div>

                        {(pieza.caption || pieza.credit) && (
                            <p className="text-center text-white/90 text-sm mt-4">
                                {pieza.caption}
                                {pieza.credit && <span className="block text-white/60 text-xs mt-1" data-no-translate>{pieza.credit}</span>}
                            </p>
                        )}

                        <button type="button" onClick={() => setAbierta(null)} aria-label="Cerrar"
                            className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                            <X className="w-5 h-5" />
                        </button>

                        {items.length > 1 && (
                            <>
                                <button type="button" onClick={() => setAbierta(i => (i! - 1 + items.length) % items.length)}
                                    aria-label="Pieza anterior"
                                    className="absolute left-0 sm:-left-16 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                                    <ChevronLeft className="w-6 h-6" />
                                </button>
                                <button type="button" onClick={() => setAbierta(i => (i! + 1) % items.length)}
                                    aria-label="Pieza siguiente"
                                    className="absolute right-0 sm:-right-16 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                                    <ChevronRight className="w-6 h-6" />
                                </button>
                                <span className="absolute -top-12 left-0 text-white/70 text-sm font-bold" data-no-translate
                                    style={{ color: accent }}>
                                    {abierta! + 1}/{items.length}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default CampaignGallery;
