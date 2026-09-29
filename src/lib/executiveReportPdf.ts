/**
 * Motor compartido de Informes Ejecutivos PDF (v4.1130).
 *
 * Sistema base ÚNICO para los PDFs ejecutivos de la plataforma. Hoy lo usan:
 *   · Postulación de Proyectos (`projectFairReportPdf.ts`)
 *   · Gestión de Eventos (`eventReportPdf.ts`)
 *
 * Cada módulo aporta sólo su dataset, sus KPIs, su título y su tabla; todo lo
 * demás —identidad, cabecera con logo, cuadrícula KPI, paginación, badges,
 * footer— sale de aquí. Un cambio de diseño se hace una vez y aplica global.
 *
 * Técnica: jsPDF vectorial 100% determinista (sin window.print() ni
 * html2canvas). Reglas anti-superposición heredadas del generador original:
 * alturas desde `splitTextToSize` + line-height + padding, filas que nunca se
 * parten, títulos de sección nunca huérfanos, encabezados de tabla repetidos.
 */

// ── Formato (misma regla que PostulacionesPagos.tsx) ──────────────────
export const fmtCop = (n?: number | null) =>
    `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
export const fmtUsd = (n?: number | null) =>
    (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const fmtNum = (n?: number | null) => Number(n || 0).toLocaleString('es-CO');
export const fmtPct = (n?: number | null) => `${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`;
export const fmtDateShort = (iso?: string | null) =>
    (iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (iso?: string | null) =>
    (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const pctOf = (n: number, d: number) => (d > 0 ? Math.round(((n || 0) / d) * 1000) / 10 : 0);

// ── Identidad ─────────────────────────────────────────────────────────
export const BLUE: [number, number, number] = [23, 69, 143];
export const GOLD: [number, number, number] = [247, 168, 27];
export const INK: [number, number, number] = [30, 41, 59];
export const MUTED: [number, number, number] = [100, 116, 139];
export const LINE: [number, number, number] = [226, 232, 240];
export const BAND_BG: [number, number, number] = [239, 244, 250];

export const PAGE_W = 595;
export const PAGE_H = 842;
export const M = 44;
export const CONTENT_W = PAGE_W - M * 2;
export const FOOT_Y = PAGE_H - 40;

/** Recuadro máximo del logo de cabecera (≈120–180 px equivalentes). */
export const LOGO_BOX = { W: 135, H: 54 };
export const LOGO_GAP = 14;

export type RGB = [number, number, number];
export type Doc = any;

export interface ExecutiveLogo { data: string; format: string; w?: number; h?: number }

/** Subconjunto de `branding` que el motor necesita (ambos endpoints). */
export interface BrandingLike {
    headerLogo?: string | null; receiptLogo?: string | null;
    siteLogo?: string | null; siteLogoIntl?: string | null;
    footerLogo?: string | null; logoSource?: string | null;
    logoDataUrl?: string | null; logoDataFormat?: string | null;
    logoDataError?: string | null;
}

// Paleta de badges discretos por estado.
export const BADGE: Record<string, { bg: RGB; tx: RGB }> = {
    green: { bg: [209, 250, 229], tx: [6, 95, 70] },
    amber: { bg: [254, 243, 199], tx: [146, 64, 14] },
    blue: { bg: [219, 234, 254], tx: [30, 64, 175] },
    red: { bg: [254, 226, 226], tx: [153, 27, 27] },
    slate: { bg: [241, 245, 249], tx: [71, 85, 105] },
    violet: { bg: [237, 233, 254], tx: [76, 29, 149] },
};

// ── Logo oficial (sin deformar, proporciones intactas) ────────────────
// El logo es el asset real del sitio (misma URL de la navbar / og:image,
// entregada por el endpoint con `?logoData=1` → `branding`). Nunca se
// reconstruye ni se hardcodea: si no hay logo, cabecera tipográfica.
export function normalizeLogoUrl(url: string): string {
    const u = String(url || '').trim();
    if (!u) return '';
    if (u.startsWith('data:')) return u;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return `https:${u}`;
    try {
        if (typeof window !== 'undefined' && window.location?.href) {
            return new URL(u, window.location.href).href;
        }
    } catch { /* relativa tal cual */ }
    return u;
}

export function bytesToBase64(buf: Uint8Array): string {
    try {
        const g: any = globalThis as any;
        if (typeof g.Buffer !== 'undefined') return g.Buffer.from(buf).toString('base64');
    } catch { /* navegador: btoa */ }
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

/** MIME real: cabecera, extensión y firma mágica (en ese orden). */
export function sniffImageMime(buf: Uint8Array, contentType: string, url: string): string | null {
    const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (ct.startsWith('image/')) return ct;
    const ext = String(url || '').split('?')[0].toLowerCase().match(/\.(png|jpe?g|webp|gif|svg)$/)?.[1];
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'svg') return 'image/svg+xml';
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
        && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
    try {
        const head = new TextDecoder().decode(buf.slice(0, 512)).toLowerCase();
        if (head.includes('<svg')) return 'image/svg+xml';
    } catch { /* binario puro */ }
    return null;
}

export function imageDims(dataUrl: string): Promise<{ w: number; h: number } | null> {
    try {
        if (typeof Image === 'undefined') return Promise.resolve(null);
        return new Promise((resolve) => {
            const im = new Image();
            // Sin crossOrigin a propósito: es un data:URL, no hay CORS.
            im.onload = () => {
                const w = (im as any).naturalWidth || im.width || 0;
                const h = (im as any).naturalHeight || im.height || 0;
                resolve(w > 0 && h > 0 ? { w, h } : null);
            };
            im.onerror = () => resolve(null);
            im.src = dataUrl;
        });
    } catch { return Promise.resolve(null); }
}

/**
 * Rasteriza a PNG vía <canvas> (SVG, WEBP, GIF y todo lo que jsPDF no come
 * directo). Mantiene la relación de aspecto: el canvas mide exactamente lo
 * que mide la imagen (limitado a 1000px por lado para no inflar el PDF),
 * así el escalado es uniforme y nunca se estira ni se deforma.
 */
export async function rasterizeToPng(dataUrl: string): Promise<{ data: string; w: number; h: number } | null> {
    try {
        if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
        const dims = await imageDims(dataUrl);
        if (!dims) return null;
        const k = Math.min(1, 1000 / Math.max(dims.w, dims.h));
        const cw = Math.max(1, Math.round(dims.w * k));
        const ch = Math.max(1, Math.round(dims.h * k));
        const loaded: HTMLImageElement | null = await new Promise((resolve) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => resolve(null);
            im.src = dataUrl;
        });
        if (!loaded) return null;
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(loaded, 0, 0, cw, ch);
        const png = canvas.toDataURL('image/png');
        if (!png || !png.startsWith('data:image/png')) return null;
        return { data: png, w: dims.w, h: dims.h };
    } catch { return null; }
}

export async function loadImageDataUrl(url: string | null): Promise<{ data: string; format: string } | null> {
    if (!url) return null;
    const href = normalizeLogoUrl(url);
    if (!href) return null;
    // Un data:URL ya trae todo: sólo hay que dejarlo en formato jsPDF.
    if (href.startsWith('data:')) {
        const mime = href.slice(5, href.indexOf(';')).toLowerCase();
        if (mime === 'image/png') return { data: href, format: 'PNG' };
        if (mime === 'image/jpeg' || mime === 'image/jpg') return { data: href, format: 'JPEG' };
        const raster = await rasterizeToPng(href);
        if (raster) return { data: raster.data, format: 'PNG' };
        return null;
    }
    try {
        const res = await fetch(href, { mode: 'cors' });
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || '';
        // Sin FileReader a propósito: arrayBuffer + base64 funciona igual en
        // navegador y en Node, y evita una dependencia solo del navegador.
        // (Un solo consumo del cuerpo: blob() + arrayBuffer() juntos fallan.)
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!buf.length) return null;
        const mime = sniffImageMime(buf, contentType, href);
        if (!mime) return null;
        const data = `data:${mime};base64,${bytesToBase64(buf)}`;
        // PNG y JPEG van directos (máxima resolución, sin recompresión).
        if (mime === 'image/png') return { data, format: 'PNG' };
        if (mime === 'image/jpeg') return { data, format: 'JPEG' };
        // SVG / WEBP / GIF → PNG rasterizado para que jsPDF lo acepte sin
        // perder la proporción. Si no se puede rasterizar (Node, canvas
        // bloqueado), no se inventa nada: sin logo.
        const raster = await rasterizeToPng(data);
        if (raster) return { data: raster.data, format: 'PNG' };
        return null;
    } catch { return null; }
}

export async function loadLogo(url: string | null): Promise<{ data: string; format: string; w: number; h: number } | null> {
    const img = await loadImageDataUrl(url);
    if (!img) return null;
    try {
        const dims = await imageDims(img.data);
        if (dims && dims.w > 0 && dims.h > 0) return { ...img, ...dims };
    } catch { /* proporción de respaldo */ }
    return { ...img, w: 300, h: 100 };
}

const cleanBrand = (v?: string | null) => (typeof v === 'string' ? v.trim() : '') || null;

/**
 * Logo ya embebido por el servidor (`?logoData=1` → `branding.logoDataUrl`).
 * Vía preferida: bytes normalizados a PNG/JPEG, sin CORS ni carreras.
 */
export function pickEmbeddedLogo(b?: BrandingLike | null): ExecutiveLogo | null {
    const url = cleanBrand(b?.logoDataUrl);
    if (!url || !url.startsWith('data:image/')) return null;
    return { data: url, format: b?.logoDataFormat === 'JPEG' ? 'JPEG' : 'PNG' };
}

/**
 * URL del logo oficial (respaldo cuando no viene embebido). Cascada: lo que
 * el admin pegó para el flujo primero, luego el sitio (nacional antes que
 * internacional), sin inventar ninguno.
 */
export function pickBrandingLogoUrl(b?: BrandingLike | null): string | null {
    return cleanBrand(b?.headerLogo) || cleanBrand(b?.receiptLogo)
        || cleanBrand(b?.siteLogo) || cleanBrand(b?.siteLogoIntl)
        || cleanBrand(b?.footerLogo) || null;
}

/**
 * Resuelve el logo para la cabecera: embebido primero, URL después.
 * Devuelve `{ logo, via }`; si no hay, deja diagnóstico en consola.
 */
export async function resolveExecutiveLogo(
    branding?: BrandingLike | null, warnTag = '[informe-ejecutivo]',
): Promise<{ logo: ExecutiveLogo | null; via: string | null }> {
    const embedded = pickEmbeddedLogo(branding);
    if (embedded) return { logo: embedded, via: `embedded:${branding?.logoSource || '?'}` };
    const url = pickBrandingLogoUrl(branding);
    if (url) {
        const loaded = await loadLogo(url);
        if (loaded) return { logo: loaded, via: `url:${branding?.logoSource || '?'}` };
        try {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
                console.warn(`${warnTag} no se pudo cargar el logo desde la URL`, {
                    via: 'url-fetch-failed', logoSource: branding?.logoSource || null,
                });
            }
        } catch { /* diagnóstico best-effort */ }
        return { logo: null, via: 'url-fetch-failed' };
    }
    try {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn(`${warnTag} cabecera sin logo`, {
                via: null, logoSource: branding?.logoSource || null,
                logoDataError: branding?.logoDataError || null,
            });
        }
    } catch { /* diagnóstico best-effort */ }
    return { logo: null, via: null };
}

// ── Motor de paginación ───────────────────────────────────────────────
export class ExecutiveReport {
    doc: Doc;
    y = 0;
    footerText: string;
    constructor(doc: Doc, footerText: string) { this.doc = doc; this.footerText = footerText; }

    /** Espacio útil restante antes del footer. */
    get room(): number { return FOOT_Y - 14 - this.y; }
    /** Salta de página si el bloque no cabe íntegro. */
    ensure(h: number) {
        if (this.y + h > FOOT_Y - 14) this.newPage();
    }
    newPage() {
        this.doc.addPage();
        this.y = M;
    }
    gap(n: number) { this.y += n; }

    sectionTitle(num: string, title: string) {
        // Título + al menos 40pt de contenido deben caber, o página nueva.
        this.ensure(72);
        const d = this.doc;
        d.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...BLUE);
        d.text(`${num} · ${title.toUpperCase()}`, M, this.y);
        this.y += 6;
        d.setFillColor(...GOLD);
        d.rect(M, this.y, 34, 2.2, 'F');
        this.y += 12;
    }

    paragraph(text: string, size = 9, lh = 13.5) {
        const d = this.doc;
        d.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...INK);
        const lines: string[] = d.splitTextToSize(text, CONTENT_W);
        lines.forEach((ln: string) => {
            this.ensure(lh);
            d.text(ln, M, this.y);
            this.y += lh;
        });
        this.y += 6;
    }

    note(text: string) {
        const d = this.doc;
        const lines: string[] = d.splitTextToSize(text, CONTENT_W - 24);
        const h = lines.length * 11 + 18;
        this.ensure(h + 6);
        d.setFillColor(248, 250, 252);
        d.setDrawColor(...LINE);
        (d as any).roundedRect(M, this.y, CONTENT_W, h, 5, 5, 'FD');
        d.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
        lines.forEach((ln: string, i: number) => d.text(ln, M + 12, this.y + 16 + i * 11));
        this.y += h + 10;
    }

    badge(cx: number, cy: number, colW: number, label: string, tone: string) {
        const d = this.doc;
        const c = BADGE[tone] || BADGE.slate;
        // Auto-ajuste: el texto nunca supera su columna (ni el fondo del badge).
        let size = 7.5;
        d.setFont('helvetica', 'bold').setFontSize(size);
        let tw = d.getTextWidth(label);
        if (tw + 16 > colW - 8 && label.length > 0) {
            size = 7;
            d.setFontSize(size);
            tw = d.getTextWidth(label);
        }
        const bw = Math.min(tw + 16, colW - 6);
        const bh = 15;
        const bx = cx + (colW - bw) / 2;
        d.setFillColor(...c.bg);
        (d as any).roundedRect(bx, cy - bh + 4, bw, bh, bh / 2, bh / 2, 'F');
        d.setTextColor(...c.tx);
        d.text(label, bx + bw / 2, cy + 0.5, { align: 'center' } as any);
    }
}

export function kpiGrid(r: ExecutiveReport, cards: { label: string; value: string; sub?: string }[]) {
    const d = r.doc;
    const cols = 4;
    const gap = 8;
    const cw = (CONTENT_W - gap * (cols - 1)) / cols;
    const ch = 64;
    const rows = Math.ceil(cards.length / cols);
    r.ensure(rows * ch + (rows - 1) * gap + 4);
    cards.forEach((c, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = M + col * (cw + gap);
        const y = r.y + row * (ch + gap);
        d.setFillColor(255, 255, 255);
        d.setDrawColor(...LINE);
        (d as any).roundedRect(x, y, cw, ch, 5, 5, 'FD');
        d.setFont('helvetica', 'bold').setFontSize(6.6).setTextColor(...MUTED);
        const lab: string[] = d.splitTextToSize(c.label.toUpperCase(), cw - 14);
        lab.slice(0, 2).forEach((ln: string, li: number) => d.text(ln, x + 7, y + 15 + li * 9));
        d.setFont('helvetica', 'bold').setFontSize(14.5).setTextColor(...INK);
        d.text(String(c.value).slice(0, 20), x + 7, y + (lab.length > 1 ? 42 : 38));
        if (c.sub) {
            d.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
            d.text(String(c.sub).slice(0, 34), x + 7, y + 52);
        }
    });
    r.y += rows * ch + (rows - 1) * gap + 12;
}

export interface ExecutiveHeader {
    logo: ExecutiveLogo | null;
    /** Línea superior en azul (ej. `INFORME EJECUTIVO`). */
    eyebrow: string;
    /** Título principal (ej. `Postulación de Proyectos`). */
    title: string;
    /** Subtítulo institucional (evento + sede). */
    subtitle: string;
    /** Línea de metadatos (período + generado). */
    meta: string;
}

/**
 * Cabecera institucional sobre fondo blanco: [LOGO] / eyebrow / título /
 * subtítulo / meta + regla dorada. Logo centrado con `contain` en LOGO_BOX,
 * proporción intacta, aire LOGO_GAP antes del título.
 */
export async function renderExecutiveHeader(doc: Doc, r: ExecutiveReport, h: ExecutiveHeader) {
    r.y = 50;
    if (h.logo) {
        let lw = h.logo.w, lh = h.logo.h;
        if (!(lw && lw > 0 && lh && lh > 0)) {
            const dims = await imageDims(h.logo.data);
            lw = dims?.w || 300; lh = dims?.h || 100;
        }
        try {
            const s = Math.min(LOGO_BOX.W / (lw as number), LOGO_BOX.H / (lh as number));
            const dw = Math.max(1, (lw as number) * s);
            const dh = Math.max(1, (lh as number) * s);
            doc.addImage(h.logo.data, h.logo.format as any, (PAGE_W - dw) / 2, r.y, dw, dh, undefined, 'FAST');
            r.y += dh + LOGO_GAP;
        } catch { /* cabecera tipográfica */ }
    } else {
        r.y += 6;
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BLUE);
    doc.text(h.eyebrow, PAGE_W / 2, r.y, { align: 'center' } as any);
    r.y += 20;
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...INK);
    doc.text(h.title, PAGE_W / 2, r.y, { align: 'center' } as any);
    r.y += 17;
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...MUTED);
    doc.text(h.subtitle, PAGE_W / 2, r.y, { align: 'center' } as any);
    r.y += 14;
    doc.setFontSize(8);
    doc.text(h.meta, PAGE_W / 2, r.y, { align: 'center' } as any);
    r.y += 14;
    doc.setFillColor(...GOLD);
    doc.rect(M, r.y, CONTENT_W, 2.4, 'F');
    r.y += 18;
}

/** Footer discreto + paginación. Devuelve el número de páginas. */
export function finishExecutiveReport(doc: Doc, r: ExecutiveReport, footerText: string): number {
    void r;
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor(...LINE).line(M, FOOT_Y, M + CONTENT_W, FOOT_Y);
        doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
        doc.text(String(footerText || '').slice(0, 100), M, FOOT_Y + 13);
        doc.text(`Página ${p} de ${pages}`, M + CONTENT_W, FOOT_Y + 13, { align: 'right' } as any);
    }
    return pages;
}

/** Interop robusta del constructor jsPDF (nombrado o default según bundle). */
export async function loadJsPdf(): Promise<any> {
    const mod: any = await import('jspdf');
    const JsPDF = [mod?.jsPDF, mod?.default].find((v: any) => typeof v === 'function') || (mod?.default as any)?.jsPDF;
    if (typeof JsPDF !== 'function') throw new Error('No se pudo cargar el generador PDF.');
    return JsPDF;
}
