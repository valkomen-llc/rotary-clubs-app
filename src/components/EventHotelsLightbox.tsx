// ════════════════════════════════════════════════════════════════════
// Vista ampliada de las diapositivas de hoteles — v4.1275.0
//
// Pantalla completa para LEER: tarifas, condiciones y teléfonos tienen que
// poder leerse en un teléfono. Por eso:
//
//   · la diapositiva entra COMPLETA (nunca recortada) y se amplía hasta 4×;
//   · ampliar: botones + / −, teclas + − 0, doble clic o doble toque en el
//     punto que se quiere leer, y pellizco en pantallas táctiles;
//   · desplazarse ampliado: arrastrar con el ratón o con el dedo (el
//     contenedor es desplazable de verdad, así que el gesto es el nativo);
//   · teclado: ← → cambian de diapositiva, Esc cierra, el foco no se escapa
//     del diálogo y vuelve a donde estaba al cerrar.
//
// Se monta con un portal sobre `document.body` para que ningún contenedor
// con `overflow` o `transform` lo recorte.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, ImageOff, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { HotelDocument, HotelSlide } from '../../server/lib/eventHotels.js';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.5;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

interface Props {
    slides: HotelSlide[];
    index: number;
    title: string;
    download?: HotelDocument | null;
    /** La dirección medible de la descarga (v4.1279.0); sin ella, el archivo directo. */
    downloadHref?: string;
    onIndexChange: (index: number) => void;
    onClose: () => void;
}

interface Anchor { fx: number; fy: number; px: number; py: number }

const EventHotelsLightbox = ({ slides, index, title, download, downloadHref, onIndexChange, onClose }: Props) => {
    const [zoom, setZoom] = useState(1);
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const dialogRef = useRef<HTMLDivElement>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const anchorRef = useRef<Anchor | null>(null);
    const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
    const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
    const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
    const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    const total = slides.length;
    const slide = slides[Math.min(Math.max(index, 0), total - 1)];
    const hasPrev = index > 0;
    const hasNext = index < total - 1;

    // Tamaño de la diapositiva a 1× (entra completa) y a la ampliación actual.
    const naturalW = natural?.w || slide?.width || 1600;
    const naturalH = natural?.h || slide?.height || 900;
    const fit = box.w > 0 && box.h > 0 ? Math.min(box.w / naturalW, box.h / naturalH) : 0;
    const imgW = Math.max(1, Math.round(naturalW * fit * zoom));
    const imgH = Math.max(1, Math.round(naturalH * fit * zoom));
    const wrapW = Math.max(box.w, imgW);
    const wrapH = Math.max(box.h, imgH);

    const go = useCallback((next: number) => {
        if (next < 0 || next >= total) return;
        onIndexChange(next);
    }, [onIndexChange, total]);

    /** Cambia la ampliación manteniendo quieto el punto (px, py) de la pantalla. */
    const zoomAt = useCallback((nextZoom: number, px?: number, py?: number) => {
        const el = scrollerRef.current;
        const z = clampZoom(nextZoom);
        if (!el) { setZoom(z); return; }
        const cx = px ?? el.clientWidth / 2;
        const cy = py ?? el.clientHeight / 2;
        const curW = Math.max(1, Math.round(naturalW * fit * zoomRef.current));
        const curH = Math.max(1, Math.round(naturalH * fit * zoomRef.current));
        const offX = (Math.max(el.clientWidth, curW) - curW) / 2;
        const offY = (Math.max(el.clientHeight, curH) - curH) / 2;
        anchorRef.current = {
            fx: Math.min(1, Math.max(0, (el.scrollLeft + cx - offX) / curW)),
            fy: Math.min(1, Math.max(0, (el.scrollTop + cy - offY) / curH)),
            px: cx,
            py: cy,
        };
        setZoom(z);
    }, [naturalW, naturalH, fit]);

    // Al cambiar de diapositiva: vuelve a 1× y se olvida el tamaño anterior.
    useEffect(() => {
        setZoom(1);
        setNatural(null);
        setFailed(false);
        setAttempt(0);
    }, [slide?.id]);

    // Tras ampliar, deja el punto elegido bajo el cursor / los dedos.
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        const a = anchorRef.current;
        if (!el || !a) return;
        anchorRef.current = null;
        const offX = (wrapW - imgW) / 2;
        const offY = (wrapH - imgH) / 2;
        el.scrollLeft = offX + a.fx * imgW - a.px;
        el.scrollTop = offY + a.fy * imgH - a.py;
    }, [zoom, imgW, imgH, wrapW, wrapH]);

    // Medir el área disponible (y volver a medir al girar o redimensionar).
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const RO = (window as any).ResizeObserver;
        if (RO) {
            const ro = new RO(measure);
            ro.observe(el);
            return () => ro.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // Bloquear el desplazamiento de la página y devolver el foco al cerrar.
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            previous?.focus?.();
        };
    }, []);

    // Teclado: navegación, ampliación, cierre y foco atrapado en el diálogo.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); return; }
            if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(zoomRef.current * ZOOM_STEP); return; }
            if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(zoomRef.current / ZOOM_STEP); return; }
            if (e.key === '0') { e.preventDefault(); setZoom(1); return; }
            if (e.key === 'Tab' && dialogRef.current) {
                const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
                ));
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go, index, onClose, zoomAt]);

    // Gestos táctiles: pellizco para ampliar, deslizar (a 1×) para cambiar de
    // diapositiva y doble toque para ampliar en el punto. Necesitan oyentes NO
    // pasivos (para impedir el zoom de la página entera), por eso van aquí.
    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        const onStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                pinchRef.current = { dist: distance(e.touches), zoom: zoomRef.current };
                swipeRef.current = null;
            } else if (e.touches.length === 1) {
                swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
            }
        };
        const onMove = (e: TouchEvent) => {
            const p = pinchRef.current;
            if (p && e.touches.length === 2) {
                e.preventDefault();
                const rect = el.getBoundingClientRect();
                const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                zoomAt(p.zoom * (distance(e.touches) / p.dist), mx, my);
            }
        };
        const onEnd = (e: TouchEvent) => {
            if (pinchRef.current && e.touches.length < 2) { pinchRef.current = null; swipeRef.current = null; return; }
            const s = swipeRef.current;
            swipeRef.current = null;
            if (!s || e.changedTouches.length === 0) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            if (zoomRef.current <= 1.01 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                go(index + (dx < 0 ? 1 : -1));
                return;
            }
            // Doble toque: dos toques cortos en el mismo lugar.
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - s.t < 300) {
                const prev = lastTapRef.current;
                const now = Date.now();
                if (prev && now - prev.t < 320 && Math.hypot(prev.x - t.clientX, prev.y - t.clientY) < 30) {
                    e.preventDefault();
                    lastTapRef.current = null;
                    const rect = el.getBoundingClientRect();
                    zoomAt(zoomRef.current > 1.01 ? 1 : 2.5, t.clientX - rect.left, t.clientY - rect.top);
                } else {
                    lastTapRef.current = { t: now, x: t.clientX, y: t.clientY };
                }
            }
        };
        el.addEventListener('touchstart', onStart, { passive: true });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd, { passive: false });
        return () => {
            el.removeEventListener('touchstart', onStart);
            el.removeEventListener('touchmove', onMove);
            el.removeEventListener('touchend', onEnd);
        };
    }, [go, index, zoomAt]);

    // Rueda + Ctrl (o pellizco del trackpad, que el navegador entrega así) amplía.
    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            zoomAt(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [zoomAt]);

    // Arrastrar con el ratón para desplazarse cuando está ampliada.
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== 'mouse' || zoom <= 1.01 || e.button !== 0) return;
        const el = scrollerRef.current;
        if (!el) return;
        dragRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        el.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current;
        const el = scrollerRef.current;
        if (!d || !el) return;
        el.scrollLeft = d.left - (e.clientX - d.x);
        el.scrollTop = d.top - (e.clientY - d.y);
    };
    const endDrag = () => { dragRef.current = null; };

    const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = scrollerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        zoomAt(zoom > 1.01 ? 1 : 2.5, e.clientX - rect.left, e.clientY - rect.top);
    };

    if (!slide) return null;

    const alt = slide.altText || `${title} — diapositiva ${index + 1} de ${total}`;
    const src = attempt > 0 ? `${slide.imageUrl}${slide.imageUrl.includes('?') ? '&' : '?'}r=${attempt}` : slide.imageUrl;
    const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30 disabled:hover:bg-transparent';

    return createPortal(
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${title}: vista ampliada`}
            className="fixed inset-0 z-[100] flex flex-col bg-neutral-950 text-white"
        >
            {/* Barra superior */}
            <div className="flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-3 border-b border-white/10">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{title}</p>
                    <p className="text-xs text-white/60" aria-live="polite">Diapositiva {index + 1} de {total}</p>
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1">
                    <button type="button" className={iconBtn} onClick={() => zoomAt(zoom / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN + 0.01} aria-label="Reducir">
                        <ZoomOut className="h-5 w-5" />
                    </button>
                    <span className="hidden sm:inline w-12 text-center text-xs tabular-nums text-white/70">{Math.round(zoom * 100)}%</span>
                    <button type="button" className={iconBtn} onClick={() => zoomAt(zoom * ZOOM_STEP)} disabled={zoom >= ZOOM_MAX - 0.01} aria-label="Ampliar">
                        <ZoomIn className="h-5 w-5" />
                    </button>
                    <button type="button" className={`${iconBtn} hidden sm:flex`} onClick={() => setZoom(1)} disabled={zoom <= 1.01} aria-label="Ajustar a la pantalla">
                        <RotateCcw className="h-4 w-4" />
                    </button>
                    {download && (
                        <a
                            href={downloadHref || download.url}
                            download={download.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={iconBtn}
                            aria-label="Descargar guía de hoteles"
                            title="Descargar guía de hoteles"
                        >
                            <Download className="h-5 w-5" />
                        </a>
                    )}
                    <button ref={closeRef} type="button" className={iconBtn} onClick={onClose} aria-label="Cerrar la vista ampliada">
                        <X className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {/* Área de lectura: desplazable de verdad cuando está ampliada */}
            <div className="relative flex-1 min-h-0">
                <div
                    ref={scrollerRef}
                    className={`absolute inset-0 overflow-auto overscroll-contain ${zoom > 1.01 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
                    style={{ touchAction: zoom > 1.01 ? 'pan-x pan-y' : 'pan-y' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onDoubleClick={onDoubleClick}
                >
                    <div className="flex items-center justify-center" style={{ width: wrapW || '100%', height: wrapH || '100%' }}>
                        {failed ? (
                            <div className="flex flex-col items-center gap-3 px-6 text-center text-white/80">
                                <ImageOff className="h-10 w-10 text-white/50" />
                                <p className="text-sm">No pudimos cargar esta diapositiva.</p>
                                <button
                                    type="button"
                                    onClick={() => { setFailed(false); setAttempt(a => a + 1); }}
                                    className="rounded-full border border-white/30 px-4 py-1.5 text-sm font-semibold hover:bg-white/10"
                                >
                                    Reintentar
                                </button>
                            </div>
                        ) : (
                            <img
                                key={`${slide.id}-${attempt}`}
                                src={src}
                                alt={alt}
                                draggable={false}
                                decoding="async"
                                onLoad={e => {
                                    const im = e.currentTarget;
                                    if (im.naturalWidth && im.naturalHeight) setNatural({ w: im.naturalWidth, h: im.naturalHeight });
                                }}
                                onError={() => setFailed(true)}
                                className="max-w-none select-none bg-white shadow-2xl"
                                style={{ width: imgW, height: imgH }}
                            />
                        )}
                    </div>
                </div>

                {/* Anterior / siguiente */}
                {total > 1 && (
                    <>
                        <button
                            type="button"
                            onClick={() => go(index - 1)}
                            disabled={!hasPrev}
                            aria-label="Diapositiva anterior"
                            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-0 disabled:pointer-events-none"
                        >
                            <ChevronLeft className="h-6 w-6" />
                        </button>
                        <button
                            type="button"
                            onClick={() => go(index + 1)}
                            disabled={!hasNext}
                            aria-label="Diapositiva siguiente"
                            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-0 disabled:pointer-events-none"
                        >
                            <ChevronRight className="h-6 w-6" />
                        </button>
                    </>
                )}
            </div>

            <p className="px-4 py-2 text-center text-[11px] text-white/50">
                <span className="sm:hidden">Pellizca o toca dos veces para ampliar · desliza para cambiar</span>
                <span className="hidden sm:inline">Doble clic, + / − o Ctrl + rueda para ampliar · arrastra para desplazarte · ← → para cambiar · Esc para cerrar</span>
            </p>
        </div>,
        document.body,
    );
};

export default EventHotelsLightbox;
