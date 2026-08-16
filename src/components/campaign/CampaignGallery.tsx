import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { GalleryItem } from '../../lib/contributionSpec';

// ════════════════════════════════════════════════════════════════════
// La galería «Rotarios en acción» — v4.823
//
// Una TIRA a lo ancho con varias piezas a la vez que AVANZA SOLA de a una
// tarjeta, y que además se puede recorrer a mano —con el ratón, el trackpad o
// la barra de abajo—.
//
// Decisiones que conviene no deshacer:
//
// 1. EL DESPLAZAMIENTO ES NATIVO (`overflow-x-auto`), no una animación de CSS.
//    Hasta v4.822 la tira se movía con `@keyframes`, y eso tiene dos
//    problemas: no se puede arrastrar —una animación no cede el control— y
//    quien tenga «reducir movimiento» en su sistema se quedaba con una tira
//    quieta. Con desplazamiento nativo, el avance automático es un empujón
//    más, y el usuario siempre puede tomar el mando.
//
// 2. EL CICLO ES CONTINUO SIN QUE SE VEA EL SALTO. La lista se repite; al
//    pasar de una vuelta, se resta una vuelta SIN animación. Como las copias
//    son idénticas, el salto es invisible. Es lo que permite avanzar para
//    siempre sin rebobinar a la vista de todos.
//
//    CUÁNTAS copias hacen falta NO es dos: es lo que se mide. El recorrido
//    posible de un contenedor es `scrollWidth - clientWidth`, así que con dos
//    copias el punto de salto —una vuelta— sólo se alcanza si UNA copia es más
//    ancha que la tira. Con pocas fotos en una pantalla ancha no lo es, y
//    entonces la tira llegaba al tope y se quedaba ahí para siempre: medido
//    con tres piezas en 1280 px, avance de 640 y tope en 652. No se ve como un
//    fallo, se ve como una galería que dejó de moverse.
//
// 3. UN VIDEO NO SE REPRODUCE DENTRO DE LA TIRA. En una tira que se mueve no
//    se puede ver —y si el cursor sale, se lo lleva sonando fuera de la
//    pantalla—. Acá es una TARJETA con carátula y botón; al pulsarla se abre
//    en grande y ahí sí se ve.
//
// 4. LA VENTANA EN GRANDE SE ADAPTA A LA PIEZA. Una foto vertical dentro de un
//    marco 16:9 queda con dos franjas negras enormes a los lados. Acá la foto
//    (y el video propio) definen la caja: se acotan al alto y al ancho de la
//    pantalla y nada más. La excepción es un video EMBEBIDO, que no tiene
//    tamaño propio —un `<iframe>` no lo declara— y ahí 16:9 es lo correcto.
// ════════════════════════════════════════════════════════════════════

/** Cada cuánto avanza una tarjeta. Lo bastante para mirar la que pasa. */
const MS_POR_PIEZA = 3500;

const Tarjeta: React.FC<{ item: GalleryItem; onOpen: () => void; aria?: boolean }> = ({ item, onOpen, aria = true }) => (
    <button
        type="button"
        onClick={onOpen}
        aria-hidden={!aria}
        tabIndex={aria ? 0 : -1}
        // CUADRADA a propósito: las fotos que mandan los clubes vienen en
        // proporciones dispares —verticales de móvil, apaisadas de cámara— y
        // un marco cuadrado las trata a todas igual.
        //
        // Crece la TARJETA entera, no sólo la imagen dentro del marco: es lo
        // que se pidió, y es lo que se nota. Por eso la tira lleva relleno
        // vertical — sin él, el crecimiento se recortaría contra el borde.
        className="group relative flex-shrink-0 w-[260px] sm:w-[300px] aspect-square rounded-2xl overflow-hidden bg-gray-900 shadow-md hover:shadow-2xl hover:z-10 hover:scale-[1.07] transition-all duration-300 ease-out focus:outline-none focus:ring-4 focus:ring-rotary-blue/30"
    >
        {item.thumb ? (
            <img
                src={item.thumb}
                alt={item.alt || item.caption || ''}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
        ) : (
            // Vimeo no publica una miniatura fija sin consultar su API: esa
            // tarjeta lleva carátula genérica y no un hueco (v4.650).
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
    const tira = useRef<HTMLDivElement>(null);
    const barra = useRef<HTMLDivElement>(null);
    const [abierta, setAbierta] = useState<number | null>(null);
    const [quieta, setQuieta] = useState(false);          // cursor encima o arrastrando
    const [avance, setAvance] = useState(0);              // 0..1, para la barra
    const [visible, setVisible] = useState(0);            // proporción a la vista
    const [copias, setCopias] = useState(2);              // cuántas vueltas se pintan

    // Cuánto mide una tarjeta con su separación: es el paso del avance y no se
    // puede fijar en el código porque el ancho cambia con el tamaño de la
    // pantalla. Se toma de la DISTANCIA entre dos tarjetas, no del ancho de
    // una más el hueco leído del estilo: así sale exacta y sin depender de que
    // el hueco esté declarado donde se lo busca.
    const paso = useCallback(() => {
        const el = tira.current;
        if (!el) return 320;
        const c = el.querySelectorAll<HTMLElement>('[data-card]');
        if (c.length < 2) return c[0]?.getBoundingClientRect().width || 320;
        return c[1].offsetLeft - c[0].offsetLeft;
    }, []);

    /** Lo que mide UNA vuelta: el punto en el que la tira vuelve a empezar. */
    const vuelta = useCallback(() => paso() * items.length, [paso, items.length]);

    // La posición, para la barra de abajo. La lista se repite, así que lo que
    // importa es la posición DENTRO de una vuelta.
    const medir = useCallback(() => {
        const el = tira.current;
        if (!el) return;
        const v = vuelta();
        setAvance(v > 0 ? (el.scrollLeft % v) / v : 0);
        setVisible(v > 0 ? Math.min(1, el.clientWidth / v) : 1);
    }, [vuelta]);

    // Cuántas copias hacen falta para que el salto de una vuelta quepa dentro
    // del recorrido posible: `scrollWidth - clientWidth >= vuelta`. Se mide,
    // porque depende del ancho de la pantalla y de cuántas piezas haya.
    useEffect(() => {
        const el = tira.current;
        if (!el) return;
        const calc = () => {
            const v = vuelta();
            if (v <= 0) return;
            setCopias(Math.max(2, Math.ceil(el.clientWidth / v) + 1));
        };
        calc();
        window.addEventListener('resize', calc);
        return () => window.removeEventListener('resize', calc);
    }, [vuelta, items.length]);

    // El avance automático. Es un empujón sobre el desplazamiento nativo, no
    // una animación: por eso se puede arrastrar la tira en cualquier momento.
    useEffect(() => {
        if (items.length < 2 || quieta || abierta !== null) return;
        const t = setInterval(() => {
            const el = tira.current;
            if (!el) return;
            const v = vuelta();
            // Pasada una vuelta se resta una vuelta SIN animación: las copias
            // son idénticas, así que el salto no se ve y el ciclo es continuo.
            // Restar es siempre posible porque `copias` garantiza que una
            // vuelta entera cabe dentro del recorrido del contenedor.
            if (v > 0 && el.scrollLeft >= v) {
                el.scrollTo({ left: el.scrollLeft - v, behavior: 'instant' as ScrollBehavior });
            }
            el.scrollBy({ left: paso(), behavior: 'smooth' });
        }, MS_POR_PIEZA);
        return () => clearInterval(t);
    }, [items.length, quieta, abierta, paso, vuelta]);

    useEffect(() => { medir(); }, [medir, items.length]);

    // Arrastrar la barra de abajo mueve la tira. Se escucha en la ventana para
    // que el arrastre siga funcionando aunque el cursor se salga de la barra.
    const arrastrar = (e: React.PointerEvent) => {
        const caja = barra.current;
        const el = tira.current;
        if (!caja || !el) return;
        setQuieta(true);
        const mover = (x: number) => {
            const r = caja.getBoundingClientRect();
            const p = Math.min(1, Math.max(0, (x - r.left) / r.width));
            el.scrollTo({ left: p * vuelta(), behavior: 'instant' as ScrollBehavior });
        };
        mover(e.clientX);
        const onMove = (ev: PointerEvent) => mover(ev.clientX);
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            setQuieta(false);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    // Escape cierra y las flechas recorren. En una ventana que tapa la página,
    // Escape es lo primero que se intenta.
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

    return (
        <>
            <div
                ref={tira}
                onScroll={medir}
                onMouseEnter={() => setQuieta(true)}
                onMouseLeave={() => setQuieta(false)}
                // `py-6`: la tarjeta crece al pasar el cursor y sin relleno se
                // recortaría contra el borde — un contenedor con desplazamiento
                // horizontal no puede dejar asomar nada por arriba.
                // `no-scrollbar`: la barra propia de abajo es la que se usa.
                className="w-full overflow-x-auto overflow-y-hidden py-6 no-scrollbar"
                style={{
                    maskImage: 'linear-gradient(to right, transparent, black 3%, black 97%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent, black 3%, black 97%, transparent)',
                }}
            >
                <div className="flex gap-5 w-max px-4">
                    {/* Las copias que hacen continuo el ciclo. Sólo la primera
                        existe para el lector de pantalla: las piezas son las
                        que hay, no las que se repiten. */}
                    {Array.from({ length: copias }).map((_, c) =>
                        items.map((it, i) => (
                            <div key={`${c}-${i}`} data-card aria-hidden={c > 0 || undefined}>
                                <Tarjeta item={it} onOpen={() => setAbierta(i)} aria={c === 0} />
                            </div>
                        )),
                    )}
                </div>
            </div>

            {/* La barra de desplazamiento, propia: la del navegador es distinta
                en cada sistema y en varios ni se ve hasta que uno la usa. */}
            {items.length > 1 && (
                <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 mt-2">
                    <div
                        ref={barra}
                        onPointerDown={arrastrar}
                        role="scrollbar"
                        aria-controls="galeria-tira"
                        aria-orientation="horizontal"
                        aria-valuenow={Math.round(avance * 100)}
                        aria-label="Recorrer la galería"
                        className="relative h-1.5 rounded-full bg-gray-200 cursor-pointer touch-none"
                    >
                        <div
                            className="absolute top-0 h-full rounded-full transition-[left] duration-200 ease-out"
                            style={{
                                width: `${Math.max(8, Math.min(100, visible * 100))}%`,
                                left: `${Math.min(100 - Math.max(8, visible * 100), avance * 100)}%`,
                                backgroundColor: accent,
                            }}
                        />
                    </div>
                </div>
            )}

            {pieza && (
                <div
                    className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={pieza.caption || 'Pieza de la galería'}
                    onClick={() => setAbierta(null)}
                >
                    {/* El clic dentro NO cierra: sólo el del fondo. */}
                    <div className="relative flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        {pieza.kind === 'image' ? (
                            // La FOTO define la caja: acotada a la pantalla y
                            // nada más. Con un marco 16:9 fijo, una foto
                            // vertical quedaba entre dos franjas negras.
                            <img src={pieza.src} alt={pieza.alt || pieza.caption || ''}
                                className="max-w-[92vw] max-h-[82vh] w-auto h-auto object-contain rounded-2xl shadow-2xl" />
                        ) : pieza.player === 'file' ? (
                            // Un video propio también trae su proporción.
                            // `key` fuerza el remontaje: sin él, el anterior
                            // seguiría sonando al cambiar de pieza (v4.816).
                            <video key={pieza.url} src={pieza.src} controls autoPlay playsInline
                                className="max-w-[92vw] max-h-[82vh] w-auto h-auto rounded-2xl shadow-2xl bg-black" />
                        ) : (
                            // Un `<iframe>` NO declara tamaño propio: acá 16:9
                            // no es una suposición, es lo único que se puede
                            // saber de un video embebido.
                            <div className="w-[92vw] max-w-5xl rounded-2xl overflow-hidden shadow-2xl bg-black relative" style={{ aspectRatio: '16 / 9' }}>
                                <iframe
                                    key={pieza.url}
                                    src={`${pieza.src}?autoplay=1`}
                                    title={pieza.caption || 'Video de la campaña'}
                                    className="absolute inset-0 w-full h-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    allowFullScreen
                                />
                            </div>
                        )}

                        {(pieza.caption || pieza.credit) && (
                            <p className="text-center text-white/90 text-sm mt-4 max-w-2xl">
                                {pieza.caption}
                                {pieza.credit && <span className="block text-white/60 text-xs mt-1" data-no-translate>{pieza.credit}</span>}
                            </p>
                        )}
                    </div>

                    {/* Los controles cuelgan de la VENTANA, no de la pieza: la
                        pieza cambia de tamaño con cada foto y los botones
                        saltarían de sitio. */}
                    <button type="button" onClick={e => { e.stopPropagation(); setAbierta(null); }} aria-label="Cerrar"
                        className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                    {items.length > 1 && (
                        <>
                            <button type="button" onClick={e => { e.stopPropagation(); setAbierta(i => (i! - 1 + items.length) % items.length); }}
                                aria-label="Pieza anterior"
                                className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                            <button type="button" onClick={e => { e.stopPropagation(); setAbierta(i => (i! + 1) % items.length); }}
                                aria-label="Pieza siguiente"
                                className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                                <ChevronRight className="w-6 h-6" />
                            </button>
                            <span className="absolute top-6 left-6 text-white/70 text-sm font-bold" data-no-translate>
                                {abierta! + 1}/{items.length}
                            </span>
                        </>
                    )}
                </div>
            )}
        </>
    );
};

export default CampaignGallery;
