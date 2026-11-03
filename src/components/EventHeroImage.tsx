// ════════════════════════════════════════════════════════════════════
// Imagen de portada de un evento, con movimiento suave — v4.1276.0
//
// Acercamiento lento y único (Ken Burns) que arranca cuando la imagen YA
// cargó: si empezara antes, en una conexión lenta el movimiento se gastaría
// con la foto todavía vacía. Termina y se queda quieta (no hay bucle que
// distraiga). Sólo `transform` y `opacity`: lo anima la GPU, no recalcula
// el diseño ni mueve el resto de la página.
//
// · «Reducir movimiento» del sistema → la foto aparece quieta.
// · `replayKey` (vista previa del panel) vuelve a reproducir el efecto.
// Configuración: src/lib/eventHeroMotion.ts.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { HERO_MOTION_ORIGIN, HERO_MOTION_SCALE, normalizeHeroMotion } from '../lib/eventHeroMotion';

interface Props {
    src: string;
    alt: string;
    /** `metadata.heroMotion` del evento. */
    motion?: unknown;
    /** Cambiarlo vuelve a reproducir el movimiento (vista previa). */
    replayKey?: number | string;
    className?: string;
}

const prefersReducedMotion = () => {
    try {
        return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
        return false;
    }
};

const EventHeroImage = ({ src, alt, motion, replayKey, className = '' }: Props) => {
    const cfg = normalizeHeroMotion(motion);
    const imgRef = useRef<HTMLImageElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [moving, setMoving] = useState(false);
    const [reduced] = useState(prefersReducedMotion);

    // Una imagen que vino del caché puede terminar de cargar antes de que React
    // enganche `onLoad`: se mira `complete` al montar.
    useEffect(() => {
        setLoaded(false);
        setMoving(false);
        const img = imgRef.current;
        if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
    }, [src, replayKey]);

    // Dos cuadros después de pintar la imagen en su tamaño inicial, se pide el
    // final: así el navegador SIEMPRE ve el cambio y la transición corre.
    useEffect(() => {
        if (!loaded || !cfg.enabled || reduced) return;
        let a = 0; let b = 0;
        a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setMoving(true)); });
        return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
    }, [loaded, cfg.enabled, reduced, replayKey]);

    const animate = cfg.enabled && !reduced;
    const scale = animate && moving ? HERO_MOTION_SCALE[cfg.intensity] : 1;

    return (
        <img
            ref={imgRef}
            key={`${src}-${replayKey ?? ''}`}
            src={src}
            alt={alt}
            fetchPriority="high"
            decoding="async"
            onLoad={() => setLoaded(true)}
            // Si la imagen falla, no se queda invisible: se ve como antes.
            onError={() => setLoaded(true)}
            data-hero-motion={animate ? (moving ? 'running' : 'waiting') : (cfg.enabled ? 'reduced' : 'off')}
            className={`w-full h-full object-cover ${className}`}
            style={{
                transformOrigin: HERO_MOTION_ORIGIN[cfg.focus],
                transform: `scale(${scale})`,
                // Aparece con un fundido corto al cargar; el acercamiento dura lo
                // configurado con una curva que arranca y frena con suavidad.
                opacity: loaded ? 1 : 0,
                transition: animate
                    ? `transform ${cfg.durationSec}s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 700ms ease-out`
                    : 'opacity 500ms ease-out',
                willChange: animate && !moving ? 'transform' : undefined,
                backfaceVisibility: 'hidden',
            }}
        />
    );
};

export default EventHeroImage;
