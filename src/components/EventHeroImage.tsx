// ════════════════════════════════════════════════════════════════════
// Imagen de portada de un evento con efecto Ken Burns — v4.1276.0
// Continuo con animación CSS y vivo con «Reducir movimiento» — v4.1277.0
//
// · La animación (keyframes `heroKenBurns` en src/index.css) arranca cuando
//   la imagen YA cargó: si empezara antes, en una conexión lenta se gastaría
//   con la foto todavía vacía.
// · Continuo: acerca y aleja sin parar (`alternate infinite`). Una vez: se
//   acerca y se queda (`forwards`).
// · Sólo `transform` y `opacity` dentro del contenedor `overflow-hidden`: lo
//   anima la GPU y no mueve el resto de la página.
// · Con la pestaña oculta el navegador pausa la animación solo.
// · Diagnóstico: `data-hero-motion` = running | gentle | still-reduced | off
//   | waiting. Ante «no se mueve», mirar ese atributo en el navegador.
// Criterio: src/lib/eventHeroMotion.ts (`planHeroMotion`).
// ════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { normalizeHeroMotion, planHeroMotion } from '../lib/eventHeroMotion';

interface Props {
    src: string;
    alt: string;
    /** `metadata.heroMotion` del evento. */
    motion?: unknown;
    /** Cambiarlo vuelve a reproducir el movimiento (vista previa). */
    replayKey?: number | string;
    className?: string;
}

const readReducedMotion = () => {
    try {
        return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
        return false;
    }
};

const EventHeroImage = ({ src, alt, motion, replayKey, className = '' }: Props) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [reduced, setReduced] = useState(readReducedMotion);

    // Si la persona cambia «Reducir movimiento» con la página abierta.
    useEffect(() => {
        let mq: MediaQueryList | null = null;
        try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return; }
        const on = () => setReduced(mq!.matches);
        mq.addEventListener?.('change', on);
        return () => mq?.removeEventListener?.('change', on);
    }, []);

    // Una imagen que vino del caché puede terminar de cargar antes de que React
    // enganche `onLoad`: se mira `complete` al montar.
    useEffect(() => {
        setLoaded(false);
        const img = imgRef.current;
        if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
    }, [src, replayKey]);

    const plan = planHeroMotion(normalizeHeroMotion(motion), reduced);
    const moves = plan.state === 'running' || plan.state === 'gentle';

    const style: CSSProperties & Record<string, string | number | undefined> = {
        transformOrigin: plan.origin,
        opacity: loaded ? 1 : 0,
        transition: 'opacity 700ms ease-out',
        backfaceVisibility: 'hidden',
        '--hero-scale': String(plan.scale),
        '--hero-dx': plan.dx,
        '--hero-dy': plan.dy,
    };
    if (moves && loaded) {
        style.animation = plan.iterations === 'infinite'
            ? `heroKenBurns ${plan.durationSec}s ease-in-out 0s infinite alternate both`
            : `heroKenBurns ${plan.durationSec}s cubic-bezier(0.25, 0.1, 0.25, 1) 0s 1 normal forwards`;
        style.willChange = 'transform';
    }

    return (
        <img
            ref={imgRef}
            key={`${src}-${replayKey ?? ''}`}
            src={src}
            alt={alt}
            fetchPriority="high"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            data-hero-motion={moves && !loaded ? 'waiting' : plan.state}
            className={`w-full h-full object-cover ${className}`}
            style={style}
        />
    );
};

export default EventHeroImage;
