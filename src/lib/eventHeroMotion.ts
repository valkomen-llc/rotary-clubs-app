// ════════════════════════════════════════════════════════════════════
// Movimiento de la portada de un evento (Ken Burns) — v4.1276.0
// Continuo, más visible y vivo con «Reducir movimiento» — v4.1277.0
//
// La imagen de portada de la ficha pública se acerca lentamente hacia un
// foco. Se configura por evento en `metadata.heroMotion`:
//
//   heroMotion = { enabled, mode: 'continuous'|'once', intensity, durationSec,
//                  focus, respectReducedMotion }
//
// ⚠️ v4.1277.0 — POR QUÉ CAMBIÓ. La v4.1276.0 hacía UN acercamiento del 5 %
// en 5 s y se detenía, y se apagaba del todo con «Reducir movimiento». En
// producción corría (data-hero-motion="running", scale 1.05), pero el comité
// la veía ESTÁTICA: el único movimiento terminaba mientras la página se
// acomodaba, y en un Mac con «Reducir movimiento» (el mismo caso del carrusel
// de v4.1274.0) no se movía nada. Ahora:
//   · por defecto es CONTINUO: acerca y aleja sin parar (como un Ken Burns de
//     video), con un desplazamiento leve hacia el foco;
//   · las intensidades son perceptibles (8 / 12 / 18 %);
//   · con «Reducir movimiento» se mueve MÁS SUAVE (mitad de escala, más lento,
//     sin desplazamiento) en vez de quedarse quieta — salvo que el evento
//     marque `respectReducedMotion`, que lo deja quieto.
//
// Sin `heroMotion` guardado: encendido, continuo, suave (8 %), 8 s, centro.
// ════════════════════════════════════════════════════════════════════

export type HeroMotionIntensity = 'subtle' | 'soft' | 'noticeable';
export type HeroMotionFocus = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type HeroMotionMode = 'continuous' | 'once';

export interface HeroMotionConfig {
    enabled: boolean;
    mode: HeroMotionMode;
    intensity: HeroMotionIntensity;
    durationSec: number;
    focus: HeroMotionFocus;
    respectReducedMotion: boolean;
}

/** Cuánto crece la imagen en el punto más cercano. */
export const HERO_MOTION_SCALE: Record<HeroMotionIntensity, number> = {
    subtle: 1.08,
    soft: 1.12,
    noticeable: 1.18,
};

export const HERO_MOTION_INTENSITY_LABELS: Record<HeroMotionIntensity, string> = {
    subtle: 'Suave (8 %)',
    soft: 'Media (12 %)',
    noticeable: 'Marcada (18 %)',
};

export const HERO_MOTION_MODE_LABELS: Record<HeroMotionMode, string> = {
    continuous: 'Continuo: acerca y aleja sin parar (recomendado)',
    once: 'Una sola vez al abrir la página',
};

/** Hacia dónde se acerca: el punto de la foto que queda fijo. */
export const HERO_MOTION_ORIGIN: Record<HeroMotionFocus, string> = {
    center: '50% 50%',
    top: '50% 20%',
    bottom: '50% 80%',
    left: '25% 50%',
    right: '75% 50%',
};

/** Desplazamiento leve que acompaña al acercamiento (hacia el foco). */
export const HERO_MOTION_DRIFT: Record<HeroMotionFocus, { dx: string; dy: string }> = {
    center: { dx: '-1%', dy: '-0.5%' },
    top: { dx: '0%', dy: '1%' },
    bottom: { dx: '0%', dy: '-1%' },
    left: { dx: '1.2%', dy: '0%' },
    right: { dx: '-1.2%', dy: '0%' },
};

export const HERO_MOTION_FOCUS_LABELS: Record<HeroMotionFocus, string> = {
    center: 'Centro',
    top: 'Arriba',
    bottom: 'Abajo',
    left: 'Izquierda',
    right: 'Derecha',
};

/** Duración de UN acercamiento (en continuo, luego se aleja en el mismo tiempo). */
export const HERO_MOTION_DURATIONS = [4, 5, 6, 8, 10, 12, 15, 20] as const;

export const DEFAULT_HERO_MOTION: HeroMotionConfig = {
    enabled: true,
    mode: 'continuous',
    intensity: 'subtle',
    durationSec: 8,
    focus: 'center',
    respectReducedMotion: false,
};

/** Lee la configuración (sin guardar → los predeterminados, encendido). */
export const normalizeHeroMotion = (raw: unknown): HeroMotionConfig => {
    const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const intensity = (Object.keys(HERO_MOTION_SCALE) as HeroMotionIntensity[]).includes(o.intensity as HeroMotionIntensity)
        ? o.intensity as HeroMotionIntensity
        : DEFAULT_HERO_MOTION.intensity;
    const focus = (Object.keys(HERO_MOTION_ORIGIN) as HeroMotionFocus[]).includes(o.focus as HeroMotionFocus)
        ? o.focus as HeroMotionFocus
        : DEFAULT_HERO_MOTION.focus;
    const mode: HeroMotionMode = o.mode === 'once' ? 'once' : 'continuous';
    const d = Number(o.durationSec);
    const durationSec = Number.isFinite(d) ? Math.min(20, Math.max(4, Math.round(d))) : DEFAULT_HERO_MOTION.durationSec;
    return {
        enabled: o.enabled !== false,
        mode,
        intensity,
        durationSec,
        focus,
        respectReducedMotion: o.respectReducedMotion === true,
    };
};

export interface HeroMotionPlan {
    /** 'running' | 'gentle' (reducir movimiento) | 'still-reduced' | 'off' */
    state: 'running' | 'gentle' | 'still-reduced' | 'off';
    scale: number;
    durationSec: number;
    dx: string;
    dy: string;
    origin: string;
    iterations: 'infinite' | 1;
}

/**
 * Qué movimiento se aplica, según la configuración y si el dispositivo pidió
 * «Reducir movimiento». Puro: lo prueba `test:event-hero-motion`.
 */
export const planHeroMotion = (cfg: HeroMotionConfig, reducedMotion: boolean): HeroMotionPlan => {
    const base = {
        origin: HERO_MOTION_ORIGIN[cfg.focus],
        iterations: (cfg.mode === 'continuous' ? 'infinite' : 1) as 'infinite' | 1,
    };
    if (!cfg.enabled) return { ...base, state: 'off', scale: 1, durationSec: cfg.durationSec, dx: '0', dy: '0' };
    if (reducedMotion && cfg.respectReducedMotion) return { ...base, state: 'still-reduced', scale: 1, durationSec: cfg.durationSec, dx: '0', dy: '0' };
    const full = HERO_MOTION_SCALE[cfg.intensity];
    if (reducedMotion) {
        // Más suave: mitad del acercamiento, la mitad más lento, sin desplazar.
        return { ...base, state: 'gentle', scale: 1 + (full - 1) / 2, durationSec: Math.round(cfg.durationSec * 1.5), dx: '0', dy: '0' };
    }
    const drift = HERO_MOTION_DRIFT[cfg.focus];
    return { ...base, state: 'running', scale: full, durationSec: cfg.durationSec, dx: drift.dx, dy: drift.dy };
};
