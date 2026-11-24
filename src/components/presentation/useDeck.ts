/**
 * Presentación comercial — el estado del mazo (v4.1356.0)
 *
 * Un solo sitio decide: qué slide está activo, en qué modo se compone
 * (escenario 16:9 escalado o flujo apilado), la escala del lienzo, la pantalla
 * completa, el teclado y los gestos. Los componentes sólo leen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const STAGE_W = 1600;
export const STAGE_H = 900;
/** Ancho y proporción desde los que el lienzo 16:9 se lee bien. Por debajo, flujo. */
const STAGE_QUERY = '(min-width: 1024px) and (min-aspect-ratio: 5/4)';
const IDLE_MS = 2600;

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

/** Lee `?slide=3` (base 1). Puro: lo usa la prueba. */
export function slideFromSearch(search: string, count: number): number {
    const raw = new URLSearchParams(search).get('slide');
    const n = raw ? Number.parseInt(raw, 10) : 1;
    return Number.isFinite(n) ? clamp(n - 1, count - 1) : 0;
}

const isTyping = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
};
const isControl = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    return Boolean(el?.closest?.('button, a'));
};

export function useDeck(count: number) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const touch = useRef<{ x: number; y: number } | null>(null);
    const idleTimer = useRef<number | undefined>(undefined);

    const [index, setIndex] = useState(() => (typeof window === 'undefined' ? 0 : slideFromSearch(window.location.search, count)));
    const [stage, setStage] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(STAGE_QUERY).matches));
    const [scale, setScale] = useState(1);
    const [present, setPresent] = useState(() => (typeof window === 'undefined' ? false : new URLSearchParams(window.location.search).get('modo') === 'presentacion'));
    const [idle, setIdle] = useState(false);

    const scrollToSlide = useCallback((i: number) => {
        const el = rootRef.current?.querySelectorAll<HTMLElement>('.cpd-slide')[i];
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, []);

    const go = useCallback((i: number) => {
        const next = clamp(i, count - 1);
        setIndex(next);
        if (!window.matchMedia(STAGE_QUERY).matches) scrollToSlide(next);
    }, [count, scrollToSlide]);

    const next = useCallback(() => go(index + 1), [go, index]);
    const prev = useCallback(() => go(index - 1), [go, index]);

    const togglePresent = useCallback(() => {
        const root = rootRef.current;
        if (document.fullscreenElement) { void document.exitFullscreen?.(); return; }
        if (present) { setPresent(false); return; }
        // Sin API de pantalla completa (iPhone) el modo presentación igual
        // oculta lo administrativo: no depende de que el navegador la conceda.
        setPresent(true);
        root?.requestFullscreen?.().catch(() => { /* sigue en modo presentación */ });
    }, [present]);

    // Composición: escenario o flujo.
    useEffect(() => {
        const mq = window.matchMedia(STAGE_QUERY);
        const on = () => setStage(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);

    // Escala del lienzo a la ventana disponible.
    useEffect(() => {
        const el = viewportRef.current;
        if (!el || !stage) return;
        const fit = () => {
            const margin = present ? 1 : 0.965;
            setScale(Math.min(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H) * margin);
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        return () => ro.disconnect();
    }, [stage, present]);

    // La pantalla completa la puede cerrar el navegador (Esc): seguirlo.
    useEffect(() => {
        const on = () => { if (!document.fullscreenElement) setPresent(false); };
        document.addEventListener('fullscreenchange', on);
        return () => document.removeEventListener('fullscreenchange', on);
    }, []);

    // Teclado.
    useEffect(() => {
        const on = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
            const k = e.key;
            if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); next(); }
            else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); prev(); }
            else if (k === ' ' && !isControl(e.target)) { e.preventDefault(); if (e.shiftKey) prev(); else next(); }
            else if (k === 'Home') { e.preventDefault(); go(0); }
            else if (k === 'End') { e.preventDefault(); go(count - 1); }
            else if (/^[1-9]$/.test(k) && Number(k) <= count) go(Number(k) - 1);
            else if (k === 'f' || k === 'F') togglePresent();
            else if (k === 'Escape' && present && !document.fullscreenElement) setPresent(false);
        };
        window.addEventListener('keydown', on);
        return () => window.removeEventListener('keydown', on);
    }, [next, prev, go, count, present, togglePresent]);

    // La dirección recuerda el slide, sin pasar por el router (no es una página nueva).
    useEffect(() => {
        const url = new URL(window.location.href);
        if (index === 0) url.searchParams.delete('slide'); else url.searchParams.set('slide', String(index + 1));
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }, [index]);

    // En flujo, el slide activo es el que se está leyendo.
    useEffect(() => {
        if (stage) return;
        const slides = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('.cpd-slide') ?? []);
        if (!slides.length) return;
        const io = new IntersectionObserver(entries => {
            const seen = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
            if (seen) setIndex(slides.indexOf(seen.target as HTMLElement));
        }, { rootMargin: '-45% 0px -45% 0px' });
        slides.forEach(s => io.observe(s));
        return () => io.disconnect();
    }, [stage]);

    // Marca en <body>: bloquea el desplazamiento bajo el escenario y sirve a la hoja de impresión.
    useEffect(() => {
        document.body.classList.add('cpd-body');
        return () => { document.body.classList.remove('cpd-body'); };
    }, []);
    useEffect(() => {
        if (!stage) return;
        const before = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = before; };
    }, [stage]);

    // En modo presentación los controles se esconden si nadie mueve el cursor.
    useEffect(() => {
        if (!present) return;
        const wake = () => {
            setIdle(false);
            window.clearTimeout(idleTimer.current);
            idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
        };
        wake();
        window.addEventListener('mousemove', wake);
        window.addEventListener('touchstart', wake, { passive: true });
        window.addEventListener('keydown', wake);
        return () => {
            window.clearTimeout(idleTimer.current);
            window.removeEventListener('mousemove', wake);
            window.removeEventListener('touchstart', wake);
            window.removeEventListener('keydown', wake);
        };
    }, [present]);

    // Gestos: en el escenario se pasa de slide deslizando; en flujo se desplaza como cualquier página.
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
    }, []);
    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        const from = touch.current;
        touch.current = null;
        if (!from || !stage) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - from.x;
        const dy = t.clientY - from.y;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        if (dx < 0) next(); else prev();
    }, [stage, next, prev]);

    return { rootRef, viewportRef, index, stage, scale, present, idle: present && idle, go, next, prev, togglePresent, onTouchStart, onTouchEnd };
}
