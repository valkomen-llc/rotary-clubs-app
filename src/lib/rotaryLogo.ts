// ════════════════════════════════════════════════════════════════════
// Logo de Rotary como SVG generado (aproximación de la marca: rueda dentada
// + wordmark "Rotary"). Una sola fuente de verdad usada tanto en el preview
// (DOM, vía <img src=dataURL>) como en la exportación a PDF (canvas, vía
// Image cargada desde el data URL → no "taintea" el canvas).
//
// Nota para el equipo: es una reconstrucción vectorial, no el asset oficial.
// Si más adelante se cargan los PNG/SVG oficiales por variante/color, el
// generador puede usar esas URLs en vez de este SVG.
// ════════════════════════════════════════════════════════════════════

export type LogoVariant = 'completo' | 'marca' | 'texto';
export type LogoColor = 'color' | 'azul' | 'blanco';

const ROTARY_GOLD = '#F7A81B';
const ROTARY_BLUE = '#17458f';

interface Palette { wheel: string; word: string; }

const palette = (color: LogoColor): Palette => {
    switch (color) {
        case 'azul': return { wheel: ROTARY_BLUE, word: ROTARY_BLUE };
        case 'blanco': return { wheel: '#FFFFFF', word: '#FFFFFF' };
        case 'color':
        default: return { wheel: ROTARY_GOLD, word: ROTARY_BLUE };
    }
};

// Rueda dentada de Rotary: 24 dientes, anillo, 6 radios (3 diámetros) y cubo.
const wheelSvg = (cx: number, cy: number, R: number, fill: string): string => {
    const teeth = 24;
    const rimR = R * 0.80;       // línea media del anillo
    const rimW = R * 0.15;       // grosor del anillo
    const toothW = R * 0.15;
    const toothH = R * 0.22 + rimW; // largo del diente (sale del anillo)
    const spokeW = R * 0.10;
    const hubR = R * 0.20;

    let s = '';
    for (let i = 0; i < teeth; i++) {
        const a = (360 / teeth) * i;
        s += `<rect x="${(cx - toothW / 2).toFixed(2)}" y="${(cy - R).toFixed(2)}" width="${toothW.toFixed(2)}" height="${toothH.toFixed(2)}" rx="${(toothW * 0.2).toFixed(2)}" transform="rotate(${a} ${cx} ${cy})" fill="${fill}"/>`;
    }
    // Anillo
    s += `<circle cx="${cx}" cy="${cy}" r="${rimR.toFixed(2)}" fill="none" stroke="${fill}" stroke-width="${rimW.toFixed(2)}"/>`;
    // 6 radios (i = 0..5 → 3 diámetros)
    for (let i = 0; i < 6; i++) {
        const a = 60 * i;
        s += `<rect x="${(cx - spokeW / 2).toFixed(2)}" y="${(cy - rimR).toFixed(2)}" width="${spokeW.toFixed(2)}" height="${rimR.toFixed(2)}" transform="rotate(${a} ${cx} ${cy})" fill="${fill}"/>`;
    }
    // Cubo central
    s += `<circle cx="${cx}" cy="${cy}" r="${hubR.toFixed(2)}" fill="${fill}"/>`;
    return s;
};

const wordmarkSvg = (x: number, baseline: number, size: number, fill: string): string =>
    `<text x="${x}" y="${baseline}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" letter-spacing="-1" fill="${fill}">Rotary</text>`;

interface BuiltLogo { svg: string; ratio: number; }

export const buildRotaryLogo = (variant: LogoVariant, color: LogoColor): BuiltLogo => {
    const { wheel, word } = palette(color);
    let inner = '';
    let vbW = 100;
    let vbH = 100;

    if (variant === 'marca') {
        vbW = 100; vbH = 100;
        inner = wheelSvg(50, 50, 48, wheel);
    } else if (variant === 'texto') {
        vbW = 240; vbH = 92;
        inner = wordmarkSvg(4, 70, 80, word);
    } else {
        // completo: wordmark + rueda a la derecha (firma masterbrand)
        vbW = 360; vbH = 110;
        inner = wordmarkSvg(0, 78, 86, word) + wheelSvg(305, 55, 50, wheel);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">${inner}</svg>`;
    return { svg, ratio: vbW / vbH };
};

// Data URL apto para <img> y para cargar en canvas sin contaminar (taint).
export const logoDataUrl = (variant: LogoVariant, color: LogoColor): string => {
    const { svg } = buildRotaryLogo(variant, color);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const logoRatio = (variant: LogoVariant): number => buildRotaryLogo(variant, 'color').ratio;

export const LOGO_VARIANTS: { value: LogoVariant; label: string }[] = [
    { value: 'completo', label: 'Completo (firma)' },
    { value: 'marca', label: 'Solo la rueda' },
    { value: 'texto', label: 'Solo el texto' },
];

export const LOGO_COLORS: { value: LogoColor; label: string }[] = [
    { value: 'color', label: 'A todo color' },
    { value: 'azul', label: 'Azul Rotary' },
    { value: 'blanco', label: 'Blanco' },
];
