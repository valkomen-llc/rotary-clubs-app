// ════════════════════════════════════════════════════════════════════
// Movimiento de la portada de un evento — v4.1276.0
//
// Un acercamiento MUY suave sobre la imagen de portada de la ficha pública
// (efecto «Ken Burns»): al cargar, la foto pasa de su tamaño a uno apenas
// mayor en unos segundos y se queda ahí. Da vida a la cabecera sin distraer
// de la lectura. Se configura por evento en `metadata.heroMotion`.
//
//   heroMotion = { enabled, intensity: 'subtle'|'soft'|'noticeable', durationSec, focus }
//
// Sin `heroMotion` guardado, el efecto está ENCENDIDO con los valores
// predeterminados (sutil, 5 s, centro): es la mejora pedida para todas las
// fichas, y cada evento puede apagarla. Con «Reducir movimiento» del sistema
// operativo no se mueve nada (lo decide el componente).
// ════════════════════════════════════════════════════════════════════

export type HeroMotionIntensity = 'subtle' | 'soft' | 'noticeable';
export type HeroMotionFocus = 'center' | 'top' | 'bottom' | 'left' | 'right';

export interface HeroMotionConfig {
    enabled: boolean;
    intensity: HeroMotionIntensity;
    durationSec: number;
    focus: HeroMotionFocus;
}

/** Cuánto crece la imagen al final del movimiento. */
export const HERO_MOTION_SCALE: Record<HeroMotionIntensity, number> = {
    subtle: 1.05,
    soft: 1.08,
    noticeable: 1.12,
};

export const HERO_MOTION_INTENSITY_LABELS: Record<HeroMotionIntensity, string> = {
    subtle: 'Muy sutil (5 %)',
    soft: 'Suave (8 %)',
    noticeable: 'Notoria (12 %)',
};

/** Hacia dónde se acerca: el punto de la foto que queda fijo. */
export const HERO_MOTION_ORIGIN: Record<HeroMotionFocus, string> = {
    center: '50% 50%',
    top: '50% 20%',
    bottom: '50% 80%',
    left: '25% 50%',
    right: '75% 50%',
};

export const HERO_MOTION_FOCUS_LABELS: Record<HeroMotionFocus, string> = {
    center: 'Centro',
    top: 'Arriba',
    bottom: 'Abajo',
    left: 'Izquierda',
    right: 'Derecha',
};

export const HERO_MOTION_DURATIONS = [3, 4, 5, 6, 8, 10, 12] as const;

export const DEFAULT_HERO_MOTION: HeroMotionConfig = {
    enabled: true,
    intensity: 'subtle',
    durationSec: 5,
    focus: 'center',
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
    const d = Number(o.durationSec);
    const durationSec = Number.isFinite(d) ? Math.min(12, Math.max(3, Math.round(d))) : DEFAULT_HERO_MOTION.durationSec;
    return { enabled: o.enabled !== false, intensity, durationSec, focus };
};
