// ════════════════════════════════════════════════════════════════════
// Carrusel de la imagen lateral del evento — v4.1273.0
//
// Lo usan EL SITIO PÚBLICO (EventSidebarImageWidget) y LA VISTA PREVIA del
// panel (EventWidgetsEditor): un solo componente, así la vista previa se
// comporta exactamente como la página publicada.
//
// - Una sola imagen: se pinta como siempre, sin flechas ni puntos.
// - Varias: transición fade o slide, flechas discretas, puntos inferiores,
//   deslizamiento táctil, teclado (← →), reproducción automática que se
//   pausa al interactuar (hover, foco, toque) y con la pestaña oculta.
// - Sin saltos de diseño: todas las imágenes se apilan en la MISMA celda
//   de una grilla, así que el alto del carrusel es el de la imagen más alta
//   y no cambia al pasar de una a otra. Cada imagen conserva su proporción
//   (object-contain, sin recortes ni deformaciones).
// - Movimiento reducido: transiciones instantáneas y sin avance automático;
//   las flechas quedan siempre disponibles para navegar a mano.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    DEFAULT_CAROUSEL_SETTINGS,
    resolveSlideLinkTarget,
    type EventSidebarCarouselSettings,
    type EventSidebarImageSlide,
} from '../lib/eventWidgets';

interface Props {
    /** Imágenes a mostrar, ya filtradas (sólo las activas) y en orden. */
    slides: EventSidebarImageSlide[];
    /** Configuración del carrusel. */
    settings?: EventSidebarCarouselSettings;
    /** Texto alternativo de reserva si una imagen no tiene el suyo. */
    fallbackAlt?: string;
    /** Avisa qué imagen está visible (la vista previa resalta su miniatura). */
    onIndexChange?: (index: number) => void;
    /** Pide mostrar una imagen concreta; `nonce` permite repetir la misma. */
    requestedIndex?: { index: number; nonce: number } | null;
    /** Muestra el contador «n / total» (vista previa del panel). */
    showCounter?: boolean;
    /** Desactiva los enlaces (vista previa: se prueba la navegación sin salir). */
    disableLinks?: boolean;
}

// Animaciones del modo «slide». Se declaran una vez por carrusel; son
// keyframes con nombre propio, no afectan al resto de la página.
const SLIDE_KEYFRAMES = `
@keyframes esic-in-next { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes esic-in-prev { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes esic-out-next { from { transform: translateX(0); } to { transform: translateX(-100%); } }
@keyframes esic-out-prev { from { transform: translateX(0); } to { transform: translateX(100%); } }
`;

const SWIPE_THRESHOLD_PX = 40;

const usePrefersReducedMotion = (): boolean => {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(mq.matches);
        update();
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', update);
            return () => mq.removeEventListener('change', update);
        }
        mq.addListener(update);
        return () => mq.removeListener(update);
    }, []);
    return reduced;
};

const SlideImage: React.FC<{
    slide: EventSidebarImageSlide;
    alt: string;
    eager: boolean;
    interactive: boolean;
    disableLinks?: boolean;
}> = ({ slide, alt, eager, interactive, disableLinks }) => {
    const image = (
        <img
            src={slide.imageUrl}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className="w-full h-auto object-contain block select-none transition-transform duration-300 group-hover:scale-[1.01]"
        />
    );
    if (!slide.linkUrl || disableLinks) {
        return <div className="w-full">{image}</div>;
    }
    const { target, rel } = resolveSlideLinkTarget(slide.linkUrl, slide.openInNewTab);
    return (
        <a
            href={slide.linkUrl}
            target={target}
            rel={rel}
            tabIndex={interactive ? undefined : -1}
            className="group block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue/50 focus-visible:ring-inset"
            title={alt}
        >
            {image}
        </a>
    );
};

const EventSidebarImageCarousel: React.FC<Props> = ({
    slides,
    settings: rawSettings,
    fallbackAlt = 'Imagen informativa del evento',
    onIndexChange,
    requestedIndex,
    showCounter = false,
    disableLinks = false,
}) => {
    const settings = rawSettings || DEFAULT_CAROUSEL_SETTINGS;
    const count = slides.length;
    const reducedMotion = usePrefersReducedMotion();

    const [active, setActive] = useState(0);
    const [previous, setPrevious] = useState<number | null>(null);
    const [direction, setDirection] = useState<'next' | 'prev'>('next');
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [touchPaused, setTouchPaused] = useState(false);
    const [pageHidden, setPageHidden] = useState(false);

    const touchStart = useRef<{ x: number; y: number } | null>(null);
    const swipedRef = useRef(false);
    const touchResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Si cambian las imágenes (vista previa), el índice nunca queda fuera de rango.
    const safeActive = count > 0 ? Math.min(active, count - 1) : 0;

    const goTo = useCallback((target: number, dir?: 'next' | 'prev') => {
        if (count < 2) return;
        const next = settings.loop
            ? ((target % count) + count) % count
            : Math.max(0, Math.min(count - 1, target));
        if (next === safeActive) return;
        setPrevious(safeActive);
        setDirection(dir || (next > safeActive ? 'next' : 'prev'));
        setActive(next);
    }, [count, settings.loop, safeActive]);

    const goNext = useCallback(() => goTo(safeActive + 1, 'next'), [goTo, safeActive]);
    const goPrev = useCallback(() => goTo(safeActive - 1, 'prev'), [goTo, safeActive]);

    // Avisar del índice visible.
    useEffect(() => {
        onIndexChange?.(safeActive);
    }, [safeActive, onIndexChange]);

    // Ir a una imagen pedida desde fuera (clic en una miniatura del panel).
    useEffect(() => {
        if (!requestedIndex) return;
        goTo(requestedIndex.index);
    }, [requestedIndex?.index, requestedIndex?.nonce]);

    // Pausar con la pestaña oculta: no gasta ciclos ni avanza sin que nadie mire.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const update = () => setPageHidden(document.visibilityState === 'hidden');
        update();
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, []);

    useEffect(() => () => {
        if (touchResumeTimer.current) clearTimeout(touchResumeTimer.current);
    }, []);

    const interactionPause = settings.pauseOnInteraction && (hovered || focused || touchPaused);
    const atEnd = !settings.loop && safeActive >= count - 1;
    const autoplayRunning = settings.autoplay && count > 1 && !reducedMotion && !pageHidden && !interactionPause && !atEnd;

    // Reproducción automática. Depende del índice: cualquier cambio (manual o
    // automático) reinicia la cuenta, así una navegación manual nunca salta
    // enseguida a la siguiente imagen.
    useEffect(() => {
        if (!autoplayRunning) return;
        const timer = setTimeout(() => goTo(safeActive + 1, 'next'), settings.intervalMs);
        return () => clearTimeout(timer);
    }, [autoplayRunning, safeActive, settings.intervalMs, goTo]);

    // ── Una sola imagen: igual que antes, sin controles ──
    if (count === 0) return null;
    if (count === 1) {
        const only = slides[0];
        return (
            <div className="w-full overflow-hidden bg-gray-50/40">
                <SlideImage
                    slide={only}
                    alt={only.altText || fallbackAlt}
                    eager={false}
                    interactive
                    disableLinks={disableLinks}
                />
            </div>
        );
    }

    const duration = reducedMotion ? 0 : settings.transitionMs;
    const isSlide = settings.transition === 'slide';
    const showArrows = settings.showArrows || reducedMotion;
    const canPrev = settings.loop || safeActive > 0;
    const canNext = settings.loop || safeActive < count - 1;

    const markTouchInteraction = () => {
        if (!settings.pauseOnInteraction) return;
        setTouchPaused(true);
        if (touchResumeTimer.current) clearTimeout(touchResumeTimer.current);
        // Tras tocar, se retoma después de un intervalo completo sin interacción.
        touchResumeTimer.current = setTimeout(() => setTouchPaused(false), settings.intervalMs);
    };

    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
        swipedRef.current = false;
        markTouchInteraction();
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        const start = touchStart.current;
        touchStart.current = null;
        const t = e.changedTouches[0];
        if (!start || !t) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
            swipedRef.current = true;
            if (dx < 0) goNext(); else goPrev();
        }
        markTouchInteraction();
    };

    // Un deslizamiento sobre una imagen con enlace no debe abrir el enlace.
    const onClickCapture = (e: React.MouseEvent) => {
        if (swipedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            swipedRef.current = false;
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    };

    const slideStyle = (i: number): React.CSSProperties => {
        const base: React.CSSProperties = { gridArea: '1 / 1' };
        const isActive = i === safeActive;
        const isLeaving = i === previous && previous !== safeActive;
        if (!isSlide) {
            return {
                ...base,
                opacity: isActive ? 1 : 0,
                zIndex: isActive ? 2 : (isLeaving ? 1 : 0),
                transition: `opacity ${duration}ms ease-in-out`,
                pointerEvents: isActive ? 'auto' : 'none',
            };
        }
        if (isActive) {
            return {
                ...base,
                zIndex: 2,
                animation: previous !== null && duration > 0
                    ? `esic-in-${direction} ${duration}ms ease-in-out both`
                    : undefined,
            };
        }
        if (isLeaving && duration > 0) {
            return {
                ...base,
                zIndex: 1,
                pointerEvents: 'none',
                animation: `esic-out-${direction} ${duration}ms ease-in-out both`,
            };
        }
        return { ...base, zIndex: 0, visibility: 'hidden', pointerEvents: 'none' };
    };

    return (
        <div
            role="region"
            aria-roledescription="carrusel"
            aria-label="Imágenes del evento"
            className="relative w-full overflow-hidden bg-gray-50/40 group/carousel"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
            }}
            onKeyDown={onKeyDown}
        >
            {isSlide && <style>{SLIDE_KEYFRAMES}</style>}

            {/* Pila de imágenes: misma celda de grilla → sin saltos de alto */}
            <div
                className="grid w-full overflow-hidden"
                style={{ touchAction: 'pan-y' }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onClickCapture={onClickCapture}
                aria-live={autoplayRunning ? 'off' : 'polite'}
            >
                {slides.map((slide, i) => {
                    const isActive = i === safeActive;
                    return (
                        <div
                            key={slide.id || `${slide.imageUrl}-${i}`}
                            role="group"
                            aria-roledescription="imagen"
                            aria-label={`${i + 1} de ${count}`}
                            aria-hidden={!isActive}
                            className="self-center w-full"
                            style={slideStyle(i)}
                        >
                            <SlideImage
                                slide={slide}
                                alt={slide.altText || fallbackAlt}
                                eager={i === 0}
                                interactive={isActive}
                                disableLinks={disableLinks}
                            />
                        </div>
                    );
                })}
            </div>

            {showCounter && (
                <span className="absolute top-2 right-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                    {safeActive + 1} / {count}
                </span>
            )}

            {showArrows && (
                <>
                    <button
                        type="button"
                        onClick={goPrev}
                        disabled={!canPrev}
                        aria-label="Imagen anterior"
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/75 text-gray-700 shadow-sm backdrop-blur-sm transition-opacity duration-200 opacity-70 sm:opacity-0 sm:group-hover/carousel:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue disabled:!opacity-0 disabled:pointer-events-none hover:bg-white"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={goNext}
                        disabled={!canNext}
                        aria-label="Imagen siguiente"
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/75 text-gray-700 shadow-sm backdrop-blur-sm transition-opacity duration-200 opacity-70 sm:opacity-0 sm:group-hover/carousel:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue disabled:!opacity-0 disabled:pointer-events-none hover:bg-white"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </>
            )}

            {settings.showDots && (
                <div className="flex items-center justify-center gap-1.5 py-2.5 bg-white border-t border-gray-100">
                    {slides.map((slide, i) => (
                        <button
                            key={`dot-${slide.id || i}`}
                            type="button"
                            onClick={() => goTo(i)}
                            aria-label={`Ir a la imagen ${i + 1} de ${count}`}
                            aria-current={i === safeActive ? 'true' : undefined}
                            className="group/dot flex h-5 items-center justify-center px-0.5 focus:outline-none"
                        >
                            <span
                                className={`block h-1.5 rounded-full transition-all duration-300 group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-rotary-blue/50 ${
                                    i === safeActive ? 'w-5 bg-rotary-blue' : 'w-1.5 bg-gray-300 group-hover/dot:bg-gray-400'
                                }`}
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default EventSidebarImageCarousel;
