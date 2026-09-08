// ════════════════════════════════════════════════════════════════════════════
// EL ENCUADRE DE UNA FOTOGRAFÍA — espejo del navegador (v4.1007)
//
// Espejo MÍNIMO de `server/lib/mediaFocal.js`: lo que hacen falta para PINTAR
// —el `object-position` del hero, la región visible de la vista previa y las
// dos cajas contra las que se enseña—. Quien DECIDE qué se guarda sigue siendo
// el servidor (`focalRecord` no está acá a propósito: con dos criterios sobre
// lo que se escribe, la pantalla y la base podrían discrepar sobre el mismo
// encuadre).
//
// Se compara por SALIDAS en `npm run test:media:focal`. Al tocar uno, tocar el
// otro.
// ════════════════════════════════════════════════════════════════════════════

export interface Focal { x: number; y: number }

export interface VisibleRegion {
    left: number; top: number; width: number; height: number; right: number; bottom: number;
}

export const DEFAULT_FOCAL: Focal = { x: 0.5, y: 0.5 };
export const FOCAL_EPSILON = 0.005;

export const HERO_PREVIEWS = [
    { id: 'desktop', label: 'Escritorio', width: 1440, height: 500 },
    { id: 'mobile', label: 'Móvil', width: 390, height: 400 },
] as const;

const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
    return Number.isFinite(n) ? n : null;
};
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function normalizeFocal(raw: any): Focal | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const x = num(raw.x);
    const y = num(raw.y);
    if (x === null || y === null) return null;
    return { x: round4(clamp01(x)), y: round4(clamp01(y)) };
}

export function isCenteredFocal(focal: any): boolean {
    const f = normalizeFocal(focal);
    if (!f) return true;
    return Math.abs(f.x - DEFAULT_FOCAL.x) <= FOCAL_EPSILON
        && Math.abs(f.y - DEFAULT_FOCAL.y) <= FOCAL_EPSILON;
}

export function objectPositionOf(focal: any): string {
    const f = normalizeFocal(focal) || DEFAULT_FOCAL;
    const pct = (n: number) => `${round4(n * 100)}%`;
    return `${pct(f.x)} ${pct(f.y)}`;
}

export function visibleRegion(opts: {
    imageWidth?: any; imageHeight?: any; boxWidth?: any; boxHeight?: any; focal?: any;
} = {}): VisibleRegion | null {
    const iw = num(opts.imageWidth), ih = num(opts.imageHeight);
    const bw = num(opts.boxWidth), bh = num(opts.boxHeight);
    if (!iw || !ih || !bw || !bh || iw <= 0 || ih <= 0 || bw <= 0 || bh <= 0) return null;

    const f = normalizeFocal(opts.focal) || DEFAULT_FOCAL;
    const scale = Math.max(bw / iw, bh / ih);
    const renderedW = iw * scale;
    const renderedH = ih * scale;

    const overflowX = Math.max(0, renderedW - bw);
    const overflowY = Math.max(0, renderedH - bh);

    const left = (overflowX * f.x) / renderedW;
    const top = (overflowY * f.y) / renderedH;
    const width = bw / renderedW;
    const height = bh / renderedH;

    return {
        left: round4(left),
        top: round4(top),
        width: round4(Math.min(1, width)),
        height: round4(Math.min(1, height)),
        right: round4(Math.min(1, left + width)),
        bottom: round4(Math.min(1, top + height)),
    };
}

export function pointSurvives(opts: { point?: any } & Parameters<typeof visibleRegion>[0]): boolean {
    const { point, ...box } = opts;
    const region = visibleRegion(box);
    const p = normalizeFocal(point);
    if (!region || !p) return false;
    return p.x >= region.left && p.x <= region.right
        && p.y >= region.top && p.y <= region.bottom;
}
