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

export interface Person { name: string; role: string; period: string; }

export interface Offset { x: number; y: number } // x en % del ancho, y en % del alto

export interface BannerConfig {
    // Logo de cabecera subido por el club (auto-recortado y centrado). Puede ser
    // una URL de S3 (logo por defecto del admin) o un data URL (subida pública).
    // `scale` es el multiplicador manual de tamaño (1 = auto-normalizado).
    logo: { url: string | null; scale?: number };
    people: Person[];
    colors: { name: string; role: string; period: string };
    sizes: { name: number; role: number; period: number }; // % del ancho
    footer: { show: boolean; logoUrl?: string | null; logoScale?: number };
    // Márgenes de la mesa de trabajo (guías de edición; x en %ancho, y en %alto).
    // Solo se usan como guía/snap en el editor; NO se dibujan en el PDF.
    margins?: { x: number; y: number };
    // Desplazamientos manuales por elemento (edición tipo Canva). Con todo en 0
    // el pendón queda con el layout automático. IDs: 'logo', 'district',
    // `person-${i}`, 'footer'.
    offsets?: Record<string, Offset>;
}

export const personElementId = (i: number): string => `person-${i}`;
export const getOffset = (config: BannerConfig, id: string): Offset => config.offsets?.[id] || { x: 0, y: 0 };

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
    logo: { url: null, scale: 1 },
    people: [
        { name: 'Francesco Arezzo', role: 'Presidente, Rotary International', period: '(Periodo Rotario 2025-2026)' },
        { name: 'Jorge Raúl Ossa Botero', role: 'Gobernador, Rotary Distrito 4281', period: '(Periodo Rotario 2025-2026)' },
        { name: 'Pedro Alejandro Castillo', role: 'Presidente, Club Rotario Yopal', period: '(Periodo Rotario 2025-2026)' },
    ],
    colors: { name: '#17458f', role: '#2a5cb8', period: '#6b7da0' },
    sizes: { name: 6.5, role: 3.5, period: 2.5 },
    footer: { show: true, logoUrl: null, logoScale: 1 },
    margins: { x: 6, y: 4 },
    offsets: {},
};

// Fracciones del lienzo (compartidas con el preview DOM vía cqw/cqh).
export const LAYOUT = {
    logoWidthFracW: 0.50,      // ancho del recuadro del logo (fracción del ancho)
    logoMaxHeightFracH: 0.22,  // alto del recuadro del logo (fracción del alto)
    logoTopFracH: 0.065,
    bodyTopFracH: 0.42,        // región donde se centra la lista de personas
    bodyBottomFracH: 0.80,
    sideFracW: 0.07,
    lineHeight: 1.16,
    nameToRoleEm: 0.18,        // gap nombre→cargo (en em del nombre)
    roleToPeriodEm: 0.12,      // gap cargo→periodo (en em del cargo)
    personGapEm: 0.95,         // gap entre personas (en em del nombre)
    footerCenterFracH: 0.915,
    footerLogoWidthFracW: 0.26,
    footerLogoMaxHeightFracH: 0.06,
    footerTaglineSizePct: 3.4,
};

// Calidad de impresión: 150 DPI al tamaño físico real (estándar de gran formato).
const RENDER_TARGET_DPI = 150;
const JPEG_QUALITY = 0.95;
// Topes de seguridad de canvas (memoria + límites del navegador). Permiten
// 80×180 cm a 150 DPI (~50 MP). Para tamaños mayores se baja el DPI efectivo
// de forma proporcional para no exceder estos límites.
const MAX_CANVAS_AREA = 64_000_000; // px²
const MAX_CANVAS_SIDE = 16000;      // px por lado
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

// Envuelve imágenes remotas (S3) por el proxy público para evitar el "tainted
// canvas" al exportar. Las data: URLs (logo subido en público) se cargan tal cual.
const proxiedImage = (url: string): string => {
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

const drawCenteredLines = (ctx: CanvasRenderingContext2D, lines: string[], centerX: number, y: number, font: string, color: string): number => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const fontPx = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '0');
    let cy = y;
    for (const line of lines) { ctx.fillText(line, centerX, cy); cy += fontPx * LAYOUT.lineHeight; }
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
    // Bajar DPI efectivo solo si excede los topes (área o lado), de forma
    // proporcional, para no superar los límites del navegador/memoria.
    const fArea = W * H > MAX_CANVAS_AREA ? Math.sqrt(MAX_CANVAS_AREA / (W * H)) : 1;
    const fSide = Math.min(1, MAX_CANVAS_SIDE / W, MAX_CANVAS_SIDE / H);
    const f = Math.min(fArea, fSide);
    if (f < 1) { W = Math.round(W * f); H = Math.round(H * f); }

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto de canvas');
    // Mejor calidad al escalar imágenes (fondo y logos).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Fondo
    let bgImg: HTMLImageElement | null = null;
    if (template.backgroundUrl) {
        try { bgImg = await loadImage(proxiedImage(template.backgroundUrl), 'anonymous'); }
        catch (e) { console.warn('[banner] fondo no cargado:', e); }
    }
    drawBackground(ctx, bgImg, W, H);

    // Offsets manuales (% → px). El offset solo desplaza visualmente cada
    // elemento; las posiciones base se calculan sin offset (igual que el
    // transform del preview DOM, que no afecta a los hermanos).
    const offPx = (id: string) => { const o = getOffset(config, id); return { x: (o.x / 100) * W, y: (o.y / 100) * H }; };

    // 2. Cabecera: logo del club ajustado (contain) a un RECUADRO fijo definido
    // por la plantilla (ancho/alto × escala) y posición (offset). Cualquier logo
    // que se suba ocupa el mismo recuadro y posición → admin y público iguales.
    const baseLogoY = H * LAYOUT.logoTopFracH;
    if (config.logo?.url) {
        try {
            const logoImg = await loadImage(proxiedImage(config.logo.url), 'anonymous');
            const s = config.logo.scale ?? 1;
            const boxW = W * LAYOUT.logoWidthFracW * s;
            const boxH = H * LAYOUT.logoMaxHeightFracH * s;
            const sc = Math.min(boxW / logoImg.width, boxH / logoImg.height);
            const lw = logoImg.width * sc, lh = logoImg.height * sc;
            const lx = (W - lw) / 2;
            const o = offPx('logo');
            ctx.drawImage(logoImg, lx + o.x, baseLogoY + o.y, lw, lh);
        } catch (e) { console.warn('[banner] logo no dibujado:', e); }
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
        const o = offPx(personElementId(i));
        const cx = W / 2 + o.x;
        let py = y + o.y; // el offset desplaza solo este bloque, no a los siguientes
        py = drawCenteredLines(ctx, m.nameLines, cx, py, `800 ${nameFontPx}px Arial, Helvetica, sans-serif`, config.colors.name);
        if (m.roleLines.length) {
            py += nameFontPx * LAYOUT.nameToRoleEm;
            py = drawCenteredLines(ctx, m.roleLines, cx, py, `600 ${roleFontPx}px Arial, Helvetica, sans-serif`, config.colors.role);
        }
        if (m.periodLines.length) {
            py += roleFontPx * LAYOUT.roleToPeriodEm;
            py = drawCenteredLines(ctx, m.periodLines, cx, py, `400 ${periodFontPx}px Arial, Helvetica, sans-serif`, config.colors.period);
        }
        // Avanzar la base SIN el offset (para no arrastrar a los demás).
        y += m.height + gap;
    }

    // 4. Pie: solo el logo subido, centrado
    if (config.footer.show && config.footer.logoUrl) {
        try {
            const fo = offPx('footer');
            const cy = H * LAYOUT.footerCenterFracH + fo.y;
            const footerLogo = await loadImage(proxiedImage(config.footer.logoUrl), 'anonymous');
            const fScale = config.footer.logoScale ?? 1;
            const maxW = W * LAYOUT.footerLogoWidthFracW * fScale;
            const maxH = H * LAYOUT.footerLogoMaxHeightFracH * fScale;
            const sc = Math.min(maxW / footerLogo.width, maxH / footerLogo.height);
            const flw = footerLogo.width * sc, flh = footerLogo.height * sc;
            ctx.drawImage(footerLogo, (W - flw) / 2 + fo.x, cy - flh / 2, flw, flh);
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
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

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
