// ════════════════════════════════════════════════════════════════════
// Render + exportación a PDF del pendón (mesa de trabajo 80×180 cm).
//
// El preview vivo se hace en DOM (ver GeneradorPendones.tsx) y la
// exportación se rasteriza aquí en un <canvas> a alta resolución y se
// embebe en un PDF con el tamaño físico real (cm) apto para impresión a
// gran escala. Ambos comparten las mismas fracciones de LAYOUT para que
// "lo que ves es lo que imprimís".
// ════════════════════════════════════════════════════════════════════
import { logoDataUrl, logoRatio, type LogoVariant, type LogoColor } from './rotaryLogo';

export type TextAlign = 'left' | 'center' | 'right';

export interface BannerTextConfig { text: string; color: string; sizePct: number; align: TextAlign; }
export interface BannerLogoConfig { variant: LogoVariant; color: LogoColor; placement: 'top' | 'center'; }
export interface BannerConfig {
    title: BannerTextConfig;
    subtitle: BannerTextConfig;
    logo: BannerLogoConfig;
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

// Fracciones del lienzo (compartidas con el preview DOM vía unidades cqw/cqh).
export const LAYOUT = {
    logoWidthFracW: 0.62,
    logoTopFracH: 0.08,      // placement 'top' → borde superior del logo
    logoCenterFracH: 0.40,   // placement 'center' → centro vertical del logo
    textTopFracH_top: 0.56,  // inicio del bloque de texto cuando el logo va arriba
    textTopFracH_center: 0.70,
    textSideFracW: 0.07,
    subGapFracOfSub: 0.7,    // separación título→subtítulo (en múltiplos de la altura del subtítulo)
    lineHeight: 1.12,
};

const RENDER_TARGET_DPI = 150;
const MAX_CANVAS_AREA = 16_000_000; // px² — límite seguro para todos los navegadores

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const CM_PER_INCH = 2.54;

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

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const out: string[] = [];
    for (const paragraph of text.split('\n')) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) { out.push(''); continue; }
        let line = words[0];
        for (let i = 1; i < words.length; i++) {
            const test = line + ' ' + words[i];
            if (ctx.measureText(test).width > maxWidth && line) {
                out.push(line);
                line = words[i];
            } else {
                line = test;
            }
        }
        out.push(line);
    }
    return out;
};

const drawBlock = (
    ctx: CanvasRenderingContext2D,
    cfg: BannerTextConfig,
    weight: string,
    W: number,
    startY: number,
    fontPx: number,
): number => {
    if (!cfg.text?.trim()) return startY;
    ctx.font = `${weight} ${fontPx}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = cfg.color;
    ctx.textBaseline = 'top';
    const maxWidth = W * (1 - 2 * LAYOUT.textSideFracW);
    let x: number;
    if (cfg.align === 'left') { ctx.textAlign = 'left'; x = W * LAYOUT.textSideFracW; }
    else if (cfg.align === 'right') { ctx.textAlign = 'right'; x = W * (1 - LAYOUT.textSideFracW); }
    else { ctx.textAlign = 'center'; x = W / 2; }

    const lines = wrapText(ctx, cfg.text, maxWidth);
    let y = startY;
    for (const line of lines) {
        ctx.fillText(line, x, y);
        y += fontPx * LAYOUT.lineHeight;
    }
    return y;
};

const drawBackground = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, W: number, H: number) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    if (!img) return;
    // cover-fit
    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
};

export interface RenderInput {
    template: BannerTemplate;
    config: BannerConfig;
}

// Dibuja el pendón completo en un canvas a alta resolución y lo devuelve.
export const renderBannerToCanvas = async ({ template, config }: RenderInput): Promise<HTMLCanvasElement> => {
    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;

    let W = Math.round((widthCm / CM_PER_INCH) * RENDER_TARGET_DPI);
    let H = Math.round((heightCm / CM_PER_INCH) * RENDER_TARGET_DPI);
    if (W * H > MAX_CANVAS_AREA) {
        const f = Math.sqrt(MAX_CANVAS_AREA / (W * H));
        W = Math.round(W * f);
        H = Math.round(H * f);
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto de canvas');

    // Fondo
    let bgImg: HTMLImageElement | null = null;
    if (template.backgroundUrl) {
        try { bgImg = await loadImage(proxiedBackground(template.backgroundUrl), 'anonymous'); }
        catch (e) { console.warn('[banner] fondo no cargado:', e); }
    }
    drawBackground(ctx, bgImg, W, H);

    // Logo
    try {
        const ratio = logoRatio(config.logo.variant);
        const logoImg = await loadImage(logoDataUrl(config.logo.variant, config.logo.color));
        const lw = W * LAYOUT.logoWidthFracW;
        const lh = lw / ratio;
        const lx = (W - lw) / 2;
        const ly = config.logo.placement === 'center'
            ? H * LAYOUT.logoCenterFracH - lh / 2
            : H * LAYOUT.logoTopFracH;
        ctx.drawImage(logoImg, lx, ly, lw, lh);
    } catch (e) {
        console.warn('[banner] logo no dibujado:', e);
    }

    // Textos
    const titleFont = (config.title.sizePct / 100) * W;
    const subFont = (config.subtitle.sizePct / 100) * W;
    const textTop = (config.logo.placement === 'center' ? LAYOUT.textTopFracH_center : LAYOUT.textTopFracH_top) * H;
    const afterTitle = drawBlock(ctx, config.title, '800', W, textTop, titleFont);
    drawBlock(ctx, config.subtitle, '600', W, afterTitle + subFont * LAYOUT.subGapFracOfSub, subFont);

    return canvas;
};

const sanitizeFilename = (name: string): string =>
    (name || 'pendon').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pendon';

// Exporta el pendón a PDF con el tamaño físico real (cm).
export const exportBannerToPdf = async (input: RenderInput): Promise<void> => {
    const { template, config } = input;
    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;

    const canvas = await renderBannerToCanvas(input);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // jsPDF se carga bajo demanda (solo al exportar) para no inflar el preview.
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({
        orientation: heightCm >= widthCm ? 'portrait' : 'landscape',
        unit: 'cm',
        format: [widthCm, heightCm],
        compress: true,
    });
    pdf.addImage(dataUrl, 'JPEG', 0, 0, widthCm, heightCm, undefined, 'FAST');
    const title = config.title?.text || template.name || 'pendon';
    pdf.save(`pendon-${sanitizeFilename(title)}-${widthCm}x${heightCm}cm.pdf`);
};

// Exporta una vista previa PNG (útil para redes / revisión rápida).
export const exportBannerToPng = async (input: RenderInput): Promise<void> => {
    const canvas = await renderBannerToCanvas(input);
    const link = document.createElement('a');
    link.download = `pendon-${sanitizeFilename(input.config.title?.text || 'pendon')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
};
