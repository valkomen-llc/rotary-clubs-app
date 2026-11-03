// ════════════════════════════════════════════════════════════════════
// Render de un código QR dinámico: SVG, PNG y PDF (v4.1278)
//
// La MATRIZ la calcula la librería estándar `qrcode` (ISO/IEC 18004, los
// cuatro niveles de corrección). El dibujo lo hacemos acá, sobre la matriz,
// para que el SVG, el PNG y el PDF tengan EXACTAMENTE la misma geometría —el
// mismo margen, el mismo logotipo en el mismo sitio, la misma etiqueta— y
// para que la vista previa de la pantalla sea la imagen que se descarga.
//
// Lo que protege la lectura:
//   - el margen (zona de silencio) se dibuja SIEMPRE del color de fondo;
//   - el logotipo nunca tapa más del 22 % del lado del código y va sobre un
//     respaldo del color de fondo; con logo el nivel es H (30 % de
//     recuperación), que lo fija el criterio (`linkQr.ts`);
//   - la etiqueta va FUERA del código, en una banda inferior, nunca encima.
// ════════════════════════════════════════════════════════════════════
import QRCode from 'qrcode';
import type { QrDesign } from './linkQr';

export interface QrMatrix {
    size: number;
    at: (row: number, col: number) => boolean;
}

/** La matriz de módulos del texto, con el nivel pedido. Lanza si no cabe. */
export function qrMatrix(text: string, ecLevel: QrDesign['ecLevel']): QrMatrix {
    const qr = QRCode.create(text, { errorCorrectionLevel: ecLevel });
    const { size, data } = qr.modules;
    return { size, at: (r, c) => Boolean(data[r * size + c]) };
}

/** Proporción del lado del código que ocupa el logotipo. */
const LOGO_RATIO = 0.22;
/** Respaldo alrededor del logo, en proporción del lado del código. */
const LOGO_PAD_RATIO = 0.03;
/** Alto de la banda de la etiqueta, en proporción del lado del código. */
const CAPTION_RATIO = 0.13;

export interface Geometry {
    modules: number;        // módulos por lado, con margen
    px: number;             // píxeles por módulo (PNG) o unidades (SVG)
    side: number;           // lado del código con margen, en px
    captionH: number;       // alto de la banda inferior, en px (0 sin etiqueta)
    width: number;
    height: number;
    logo: { x: number; y: number; w: number; pad: number } | null;
}

/** La geometría común a todos los formatos. Entero por módulo: nada de bordes borrosos. */
export function geometry(matrix: QrMatrix, design: QrDesign): Geometry {
    const modules = matrix.size + design.margin * 2;
    const px = Math.max(1, Math.floor(design.size / modules));
    const side = px * modules;
    const captionH = design.caption ? Math.round(side * CAPTION_RATIO) : 0;
    const logoW = Math.round(side * LOGO_RATIO);
    const pad = Math.round(side * LOGO_PAD_RATIO);
    return {
        modules, px, side, captionH,
        width: side,
        height: side + captionH,
        logo: design.logoUrl ? { x: Math.round((side - logoW) / 2), y: Math.round((side - logoW) / 2), w: logoW, pad } : null,
    };
}

const esc = (s: string) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * El SVG. Los módulos se agrupan en UN `<path>`: un QR de versión 6 son
 * 1.681 módulos y un `<rect>` por cada uno hace un archivo pesado que
 * algunos programas de imprenta abren lento.
 */
export function renderSvg(text: string, design: QrDesign, opts: { logoHref?: string } = {}): string {
    const m = qrMatrix(text, design.ecLevel);
    const g = geometry(m, design);
    const { px } = g;

    let d = '';
    for (let r = 0; r < m.size; r++) {
        for (let c = 0; c < m.size; c++) {
            if (!m.at(r, c)) continue;
            const x = (c + design.margin) * px;
            const y = (r + design.margin) * px;
            d += `M${x} ${y}h${px}v${px}h-${px}z`;
        }
    }

    const logo = g.logo && opts.logoHref
        ? `<rect x="${g.logo.x - g.logo.pad}" y="${g.logo.y - g.logo.pad}" width="${g.logo.w + g.logo.pad * 2}" height="${g.logo.w + g.logo.pad * 2}" rx="${Math.round(g.logo.pad * 1.5)}" fill="${design.bg}"/>` +
          `<image x="${g.logo.x}" y="${g.logo.y}" width="${g.logo.w}" height="${g.logo.w}" href="${esc(opts.logoHref)}" preserveAspectRatio="xMidYMid meet"/>`
        : '';

    const caption = g.captionH
        ? `<text x="${g.side / 2}" y="${g.side + g.captionH * 0.62}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${Math.round(g.captionH * 0.42)}" fill="${design.fg}">${esc(design.caption)}</text>`
        : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}" shape-rendering="crispEdges">` +
        `<rect width="${g.width}" height="${g.height}" fill="${design.bg}"/>` +
        `<path d="${d}" fill="${design.fg}"/>` +
        logo + caption +
        `</svg>`;
}

/** Carga una imagen para dibujarla en un canvas. Falla si el servidor no permite CORS. */
export function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar el logotipo.'));
        img.src = url;
    });
}

/** La imagen como data URL, para incrustarla en el SVG. */
export async function imageToDataUrl(url: string): Promise<string> {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('No se pudo descargar el logotipo.');
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('No se pudo leer el logotipo.'));
        fr.readAsDataURL(blob);
    });
}

/** Dibuja el código en un canvas, al tamaño exacto de la geometría. */
export function drawCanvas(text: string, design: QrDesign, logo?: HTMLImageElement | null): HTMLCanvasElement {
    const m = qrMatrix(text, design.ecLevel);
    const g = geometry(m, design);
    const canvas = document.createElement('canvas');
    canvas.width = g.width;
    canvas.height = g.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite dibujar la imagen.');

    ctx.fillStyle = design.bg;
    ctx.fillRect(0, 0, g.width, g.height);
    ctx.fillStyle = design.fg;
    for (let r = 0; r < m.size; r++) {
        for (let c = 0; c < m.size; c++) {
            if (m.at(r, c)) ctx.fillRect((c + design.margin) * g.px, (r + design.margin) * g.px, g.px, g.px);
        }
    }

    if (g.logo && logo) {
        const { x, y, w, pad } = g.logo;
        ctx.fillStyle = design.bg;
        roundRect(ctx, x - pad, y - pad, w + pad * 2, w + pad * 2, pad * 1.5);
        ctx.fill();
        // El logo se ajusta DENTRO del cuadro, conservando su proporción.
        const ratio = Math.min(w / logo.naturalWidth, w / logo.naturalHeight);
        const lw = logo.naturalWidth * ratio, lh = logo.naturalHeight * ratio;
        ctx.drawImage(logo, x + (w - lw) / 2, y + (w - lh) / 2, lw, lh);
    }

    if (g.captionH) {
        ctx.fillStyle = design.fg;
        ctx.font = `700 ${Math.round(g.captionH * 0.42)}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(design.caption, g.side / 2, g.side + g.captionH * 0.55, g.side * 0.9);
    }
    return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen.'))), type);
    });
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Un nombre de archivo seguro a partir del nombre del QR. */
export function fileSlug(name: string): string {
    const s = String(name || 'qr').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return (s || 'qr').slice(0, 60);
}

/**
 * El PDF listo para imprenta: una página A4 con el código a 80 mm, el nombre
 * de la pieza y la dirección en texto, por si el lector falla. `jspdf` ya es
 * dependencia del proyecto; se importa a demanda para no cargarla en cada
 * pantalla del panel.
 */
export async function renderPdf(
    text: string, design: QrDesign,
    { title = '', subtitle = '', logo = null }: { title?: string; subtitle?: string; logo?: HTMLImageElement | null }
): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const canvas = drawCanvas(text, { ...design, size: Math.max(design.size, 1024) }, logo);
    const png = canvas.toDataURL('image/png');

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const qrMm = 80;
    const ratio = canvas.height / canvas.width;
    const x = (pageW - qrMm) / 2;
    let y = 50;

    if (title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(title, pageW / 2, 32, { align: 'center' });
    }
    if (subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(subtitle, pageW / 2, 40, { align: 'center' });
        doc.setTextColor(0);
    }
    doc.addImage(png, 'PNG', x, y, qrMm, qrMm * ratio);
    y += qrMm * ratio + 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(text, pageW / 2, y, { align: 'center' });
    doc.text('Escaneá el código o escribí la dirección en el navegador.', pageW / 2, y + 5, { align: 'center' });

    return doc.output('blob');
}

export default {
    qrMatrix, geometry, renderSvg, drawCanvas, canvasToBlob, downloadBlob, fileSlug,
    loadImage, imageToDataUrl, renderPdf,
};
