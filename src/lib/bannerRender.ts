// ════════════════════════════════════════════════════════════════════
// Render + exportación a PDF del pendón (mesa de trabajo 80×180 cm).
//
// Estructura del pendón (estilo "directiva"):
//   1. Cabecera: logo de Rotary + línea de distrito.
//   2. Cuerpo: lista de personas (nombre / cargo / periodo), centrada.
//   3. Pie: logo blanco + distrito + lema.
// El fondo decorativo (azul + curvas doradas + panel blanco) es la imagen
// de fondo que sube el admin; estos elementos se superponen encima.
//
// El preview vivo se hace en DOM (BannerPreview.tsx) y la exportación se
// rasteriza aquí en <canvas> a alta resolución y se embebe en un PDF con el
// tamaño físico real (cm). Ambos comparten las fracciones de LAYOUT y los
// mismos % de tamaño de fuente (relativos al ancho) → WYSIWYG.
// ════════════════════════════════════════════════════════════════════
import { logoDataUrl, logoRatio, type LogoVariant, type LogoColor } from './rotaryLogo';

export interface Person { name: string; role: string; period: string; }

export interface BannerConfig {
    logo: { variant: LogoVariant; color: LogoColor };
    header: { district: string; color: string; sizePct: number };
    people: Person[];
    colors: { name: string; role: string; period: string };
    sizes: { name: number; role: number; period: number }; // % del ancho
    footer: { show: boolean; tagline: string; district: string };
}

export interface BannerTemplate {
    id: string | null;
    name: string;
    backgroundUrl: string | null;
    widthCm: number;
    heightCm: number;
    config: BannerConfig;
    isActive: boolean;
    clubId: string | null;
    updatedAt: string | null;
}

export const DEFAULT_CONFIG: BannerConfig = {
    logo: { variant: 'completo', color: 'color' },
    header: { district: 'Distrito 4281', color: '#1a3a8f', sizePct: 4.8 },
    people: [
        { name: 'Francesco Arezzo', role: 'Presidente, Rotary International', period: '(Periodo Rotario 2025-2026)' },
        { name: 'Jorge Raúl Ossa Botero', role: 'Gobernador, Rotary Distrito 4281', period: '(Periodo Rotario 2025-2026)' },
        { name: 'Pedro Alejandro Castillo', role: 'Presidente, Club Rotario Yopal', period: '(Periodo Rotario 2025-2026)' },
    ],
    colors: { name: '#17458f', role: '#2a5cb8', period: '#6b7da0' },
    sizes: { name: 6.5, role: 3.5, period: 2.5 },
    footer: { show: true, tagline: 'GENERA UN IMPACTO DURADERO', district: 'Distrito 4281' },
};

// Fracciones del lienzo (compartidas con el preview DOM vía cqw/cqh).
export const LAYOUT = {
    logoWidthFracW: 0.50,
    logoTopFracH: 0.065,
    districtGapFracH: 0.010,   // separación logo→distrito
    bodyTopFracH: 0.42,        // región donde se centra la lista de personas
    bodyBottomFracH: 0.80,
    sideFracW: 0.07,
    lineHeight: 1.16,
    nameToRoleEm: 0.18,        // gap nombre→cargo (en em del nombre)
    roleToPeriodEm: 0.12,      // gap cargo→periodo (en em del cargo)
    personGapEm: 0.95,         // gap entre personas (en em del nombre)
    footerCenterFracH: 0.915,
    footerLogoWidthFracW: 0.26,
    footerTaglineSizePct: 3.4,
    footerDistrictSizePct: 2.8,
};

const RENDER_TARGET_DPI = 150;
const MAX_CANVAS_AREA = 16_000_000; // px² — límite seguro para todos los navegadores
const API = (import.meta as any).env?.VITE_API_URL || '/api';
const CM_PER_INCH = 2.54;
const ROTARY_BLUE = '#16357e';

const loadImage = (src: string, crossOrigin?: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        if (crossOrigin) img.crossOrigin = crossOrigin;
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la imagen: ' + src));
        img.src = src;
    });

// Envuelve la imagen de fondo (S3) por el proxy público para evitar el
// "tainted canvas" al exportar. Las data: URLs (logo) se cargan tal cual.
const proxiedBackground = (url: string): string => {
    if (url.startsWith('data:')) return url;
    return `${API}/public/banner-image?url=${encodeURIComponent(url)}`;
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const out: string[] = [];
    for (const paragraph of (text || '').split('\n')) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) { out.push(''); continue; }
        let line = words[0];
        for (let i = 1; i < words.length; i++) {
            const test = line + ' ' + words[i];
            if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = words[i]; }
            else line = test;
        }
        out.push(line);
    }
    return out;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};

interface PersonMetrics { nameLines: string[]; roleLines: string[]; periodLines: string[]; height: number; }

const measurePerson = (ctx: CanvasRenderingContext2D, p: Person, W: number, sizes: BannerConfig['sizes']): PersonMetrics => {
    const maxW = W * (1 - 2 * LAYOUT.sideFracW);
    const nameFont = (sizes.name / 100) * W;
    const roleFont = (sizes.role / 100) * W;
    const periodFont = (sizes.period / 100) * W;

    ctx.font = `800 ${nameFont}px Arial, Helvetica, sans-serif`;
    const nameLines = wrapLines(ctx, p.name, maxW);
    ctx.font = `600 ${roleFont}px Arial, Helvetica, sans-serif`;
    const roleLines = p.role?.trim() ? wrapLines(ctx, p.role, maxW) : [];
    ctx.font = `400 ${periodFont}px Arial, Helvetica, sans-serif`;
    const periodLines = p.period?.trim() ? wrapLines(ctx, p.period, maxW) : [];

    const height =
        nameLines.length * nameFont * LAYOUT.lineHeight +
        (roleLines.length ? nameFont * LAYOUT.nameToRoleEm + roleLines.length * roleFont * LAYOUT.lineHeight : 0) +
        (periodLines.length ? roleFont * LAYOUT.roleToPeriodEm + periodLines.length * periodFont * LAYOUT.lineHeight : 0);

    return { nameLines, roleLines, periodLines, height };
};

const drawCenteredLines = (ctx: CanvasRenderingContext2D, lines: string[], W: number, y: number, font: string, color: string): number => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const fontPx = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '0');
    let cy = y;
    for (const line of lines) { ctx.fillText(line, W / 2, cy); cy += fontPx * LAYOUT.lineHeight; }
    return cy;
};

const drawBackground = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, W: number, H: number) => {
    if (img) {
        const scale = Math.max(W / img.width, H / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        return;
    }
    // Respaldo "decoración-lite": fondo azul + panel blanco central, para que
    // el texto azul y el pie blanco se lean aunque no haya fondo subido.
    ctx.fillStyle = ROTARY_BLUE;
    ctx.fillRect(0, 0, W, H);
    const m = W * 0.05;
    ctx.fillStyle = '#eef1f6';
    roundRect(ctx, m, H * 0.04, W - 2 * m, H * 0.80, W * 0.06);
    ctx.fill();
};

export interface RenderInput { template: BannerTemplate; config: BannerConfig; }

export const renderBannerToCanvas = async ({ template, config }: RenderInput): Promise<HTMLCanvasElement> => {
    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;

    let W = Math.round((widthCm / CM_PER_INCH) * RENDER_TARGET_DPI);
    let H = Math.round((heightCm / CM_PER_INCH) * RENDER_TARGET_DPI);
    if (W * H > MAX_CANVAS_AREA) {
        const f = Math.sqrt(MAX_CANVAS_AREA / (W * H));
        W = Math.round(W * f); H = Math.round(H * f);
    }

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto de canvas');

    // 1. Fondo
    let bgImg: HTMLImageElement | null = null;
    if (template.backgroundUrl) {
        try { bgImg = await loadImage(proxiedBackground(template.backgroundUrl), 'anonymous'); }
        catch (e) { console.warn('[banner] fondo no cargado:', e); }
    }
    drawBackground(ctx, bgImg, W, H);

    // 2. Cabecera: logo + distrito
    let headerBottom = H * LAYOUT.logoTopFracH;
    try {
        const ratio = logoRatio(config.logo.variant);
        const logoImg = await loadImage(logoDataUrl(config.logo.variant, config.logo.color));
        const lw = W * LAYOUT.logoWidthFracW;
        const lh = lw / ratio;
        const lx = (W - lw) / 2;
        const ly = H * LAYOUT.logoTopFracH;
        ctx.drawImage(logoImg, lx, ly, lw, lh);
        headerBottom = ly + lh;
    } catch (e) { console.warn('[banner] logo no dibujado:', e); }

    if (config.header.district?.trim()) {
        const font = `600 ${(config.header.sizePct / 100) * W}px Arial, Helvetica, sans-serif`;
        drawCenteredLines(ctx, [config.header.district], W, headerBottom + H * LAYOUT.districtGapFracH, font, config.header.color);
    }

    // 3. Cuerpo: lista de personas, centrada verticalmente en la región body
    const bodyTop = H * LAYOUT.bodyTopFracH;
    const bodyBottom = H * LAYOUT.bodyBottomFracH;
    const nameFontPx = (config.sizes.name / 100) * W;
    const roleFontPx = (config.sizes.role / 100) * W;
    const periodFontPx = (config.sizes.period / 100) * W;
    const people = (config.people || []).filter(p => p.name?.trim() || p.role?.trim());

    const metrics = people.map(p => measurePerson(ctx, p, W, config.sizes));
    const gap = nameFontPx * LAYOUT.personGapEm;
    const totalH = metrics.reduce((s, m) => s + m.height, 0) + Math.max(0, people.length - 1) * gap;
    let y = Math.max(bodyTop, bodyTop + ((bodyBottom - bodyTop) - totalH) / 2);

    for (let i = 0; i < people.length; i++) {
        const m = metrics[i];
        y = drawCenteredLines(ctx, m.nameLines, W, y, `800 ${nameFontPx}px Arial, Helvetica, sans-serif`, config.colors.name);
        if (m.roleLines.length) {
            y += nameFontPx * LAYOUT.nameToRoleEm;
            y = drawCenteredLines(ctx, m.roleLines, W, y, `600 ${roleFontPx}px Arial, Helvetica, sans-serif`, config.colors.role);
        }
        if (m.periodLines.length) {
            y += roleFontPx * LAYOUT.roleToPeriodEm;
            y = drawCenteredLines(ctx, m.periodLines, W, y, `400 ${periodFontPx}px Arial, Helvetica, sans-serif`, config.colors.period);
        }
        y += gap;
    }

    // 4. Pie: logo blanco + distrito + lema (dos columnas con divisor)
    if (config.footer.show) {
        try {
            const cy = H * LAYOUT.footerCenterFracH;
            const ratio = logoRatio('completo');
            const flw = W * LAYOUT.footerLogoWidthFracW;
            const flh = flw / ratio;
            const distFont = (LAYOUT.footerDistrictSizePct / 100) * W;
            const leftBlockH = flh + distFont * 1.3;
            const lx = W * 0.10;
            const ly = cy - leftBlockH / 2;

            const wlogo = await loadImage(logoDataUrl('completo', 'blanco'));
            ctx.drawImage(wlogo, lx, ly, flw, flh);
            if (config.footer.district?.trim()) {
                ctx.font = `500 ${distFont}px Arial, Helvetica, sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(config.footer.district, lx + flw * 0.18, ly + flh + distFont * 0.15);
            }

            // Divisor
            const divX = W * 0.52;
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = Math.max(1, W * 0.004);
            ctx.beginPath();
            ctx.moveTo(divX, cy - leftBlockH * 0.42);
            ctx.lineTo(divX, cy + leftBlockH * 0.42);
            ctx.stroke();

            // Lema (italic bold), a la derecha
            if (config.footer.tagline?.trim()) {
                const tFont = (LAYOUT.footerTaglineSizePct / 100) * W;
                ctx.font = `italic 800 ${tFont}px Arial, Helvetica, sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const lines = wrapLines(ctx, config.footer.tagline, W * 0.36);
                const tx = W * 0.56;
                let ty = cy - (lines.length - 1) * tFont * 0.58;
                for (const line of lines) { ctx.fillText(line, tx, ty); ty += tFont * 1.15; }
            }
        } catch (e) { console.warn('[banner] pie no dibujado:', e); }
    }

    return canvas;
};

const sanitizeFilename = (name: string): string =>
    (name || 'pendon').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pendon';

export const exportBannerToPdf = async (input: RenderInput): Promise<void> => {
    const { template } = input;
    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;
    const canvas = await renderBannerToCanvas(input);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({
        orientation: heightCm >= widthCm ? 'portrait' : 'landscape',
        unit: 'cm',
        format: [widthCm, heightCm],
        compress: true,
    });
    pdf.addImage(dataUrl, 'JPEG', 0, 0, widthCm, heightCm, undefined, 'FAST');
    pdf.save(`pendon-${sanitizeFilename(template.name)}-${widthCm}x${heightCm}cm.pdf`);
};

export const exportBannerToPng = async (input: RenderInput): Promise<void> => {
    const canvas = await renderBannerToCanvas(input);
    const link = document.createElement('a');
    link.download = `pendon-${sanitizeFilename(input.template.name)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
};
