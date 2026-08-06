// ════════════════════════════════════════════════════════════════════
// Plantillas IA — composición y exportación
// v4.720.0
//
// Rasteriza el grafo de escena y lo entrega en PNG, JPG o PDF.
//
// ── POR QUÉ ESTO NO PUEDE DIVERGIR DE LA VISTA PREVIA ───────────────
//
// Dibuja los MISMOS nodos que pinta `DesignCanvas.tsx`, con el MISMO reparto de
// líneas (`layoutFor`, de `designSpec.ts`) y los MISMOS trazos (`shapePath`).
// No hay una "maquetación de exportación" aparte: el editor y este archivo son
// dos lectores del mismo documento. Es la corrección de fondo respecto del
// Generador de Pendones, donde la maquetación está escrita dos veces —una en
// DOM con cqw/cqh y otra en canvas— y cualquier discrepancia aparece como «la
// vista previa no es lo que descargué».
//
// ── LA REGLA #1 DEL SITIO NO APLICA ACÁ, Y CONVIENE DECIR POR QUÉ ───
//
// «No postprocesar el output del modelo» prohíbe retocar lo que devuelve un
// motor generativo —composite, máscara, blur— porque se ve pegado. Acá no hay
// output de ningún modelo que retocar: la pieza ES la composición, declarada
// nodo por nodo por el usuario. Es edición declarada, igual que el montaje del
// Creador de Reels. La fotografía del club, en cambio, sí viaja INTACTA: se
// encuadra (`cover`) y se recorta al recuadro, nada más — ni filtros, ni
// corrección de color, ni escalas forzadas.
// ════════════════════════════════════════════════════════════════════

import {
    formatOf, fontStack, isText, isImage, isShape, isGradient,
    layoutFor, verticalOffset, shapePath,
    type DesignDocument, type TextNode, type ImageNode, type ShapeNode, type Fill,
} from './designSpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

// Escala máxima sobre el tamaño nominal. A 2× un post 1:1 sale en 2160×2160,
// que es de sobra para redes y para una impresión pequeña; más allá sólo se
// gana peso de archivo, porque la fotografía de origen no tiene esa resolución.
export const MAX_SCALE = 2;
const JPEG_QUALITY = 0.94;

// ─── Imágenes ──────────────────────────────────────────────────────────
//
// Una imagen de S3 pintada directo en el canvas lo deja "tainted" y
// `toDataURL` lanza. Se envuelve por el proxy público que ya existe para el
// Generador de Pendones — sirve el mismo propósito y ya está en la lista de
// orígenes permitidos, así que no se abre un proxy nuevo.
const proxied = (url: string): string =>
    url.startsWith('data:') || url.startsWith('blob:')
        ? url
        : `${API}/public/banner-image?url=${encodeURIComponent(url)}`;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export const loadImage = (src: string): Promise<HTMLImageElement> => {
    const key = proxied(src);
    const hit = imageCache.get(key);
    if (hit) return hit;
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (!key.startsWith('data:') && !key.startsWith('blob:')) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src}`));
        img.src = key;
    });
    imageCache.set(key, p);
    // Un fallo no se cachea: la siguiente vez puede ser un problema de red que
    // ya pasó, y dejar el rechazo guardado convertiría un tropiezo en permanente.
    p.catch(() => imageCache.delete(key));
    return p;
};

/** La misma URL que usa el editor para pintar en el DOM. Se exporta para que la
 *  vista previa y la exportación pidan EL MISMO recurso y el navegador lo
 *  resuelva de su caché una sola vez. */
export const displayUrl = proxied;

// ─── Relleno ───────────────────────────────────────────────────────────
const resolveFill = (ctx: CanvasRenderingContext2D, fill: Fill, x: number, y: number, w: number, h: number): string | CanvasGradient => {
    if (!isGradient(fill)) return fill;
    if (fill.type === 'radial') {
        const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2);
        fill.stops.forEach(s => g.addColorStop(Math.min(1, Math.max(0, s.at)), s.color));
        return g;
    }
    const rad = ((fill.angle || 0) * Math.PI) / 180;
    const dx = Math.cos(rad) * w / 2, dy = Math.sin(rad) * h / 2;
    const g = ctx.createLinearGradient(x + w / 2 - dx, y + h / 2 - dy, x + w / 2 + dx, y + h / 2 + dy);
    fill.stops.forEach(s => g.addColorStop(Math.min(1, Math.max(0, s.at)), s.color));
    return g;
};

// ─── Nodos ─────────────────────────────────────────────────────────────

const drawShape = (ctx: CanvasRenderingContext2D, node: ShapeNode, W: number, H: number) => {
    const w = node.w * W, h = node.h * H;
    ctx.fillStyle = resolveFill(ctx, node.fill, 0, 0, w, h);
    // Un trazo de la biblioteca viene en viewBox 100×100; una forma
    // paramétrica ya viene en píxeles del recuadro. Es la única diferencia.
    if (node.path) {
        ctx.save();
        ctx.scale(w / 100, h / 100);
        const p = new Path2D(node.path);
        ctx.fill(p, 'evenodd');
        if (node.stroke && node.strokeWidth > 0) {
            ctx.strokeStyle = node.stroke;
            ctx.lineWidth = (node.strokeWidth * W) / (w / 100);
            ctx.stroke(p);
        }
        ctx.restore();
        return;
    }
    const p = new Path2D(shapePath(node.shape, w, h, { radius: node.radius * Math.min(w, h) }));
    ctx.fill(p);
    if (node.stroke && node.strokeWidth > 0) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth * W;
        ctx.stroke(p);
    }
};

const drawImageNode = (ctx: CanvasRenderingContext2D, node: ImageNode, img: HTMLImageElement | null, W: number, H: number) => {
    const w = node.w * W, h = node.h * H;
    if (!img) return;

    ctx.save();
    if (node.circle) {
        const r = Math.min(w, h) / 2;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, r, r, 0, 0, Math.PI * 2);
        ctx.clip();
    } else if (node.radius > 0) {
        ctx.clip(new Path2D(shapePath('rect', w, h, { radius: node.radius * Math.min(w, h) })));
    } else {
        ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    }

    // `cover` llena el recuadro y recorta lo que sobra; `contain` entra entera.
    // La fotografía no se deforma en ningún caso: la escala es uniforme.
    const scale = node.fit === 'contain'
        ? Math.min(w / img.width, h / img.height)
        : Math.max(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
};

const drawTextNode = (ctx: CanvasRenderingContext2D, node: TextNode, W: number, H: number) => {
    const w = node.w * W, h = node.h * H;
    // MISMO cálculo que la vista previa. Ver la nota de cabecera.
    const layout = layoutFor(node, W, H, ctx);
    const px = layout.fontSize;

    ctx.font = `${node.italic ? 'italic ' : ''}${node.fontWeight} ${px}px ${fontStack(node.fontFamily)}`;
    ctx.fillStyle = node.color;
    ctx.textAlign = node.align === 'center' ? 'center' : node.align === 'right' ? 'right' : 'left';
    const anchorX = node.align === 'center' ? w / 2 : node.align === 'right' ? w : 0;

    // ── El texto se coloca con el modelo de CAJA DE LÍNEA de CSS ──────
    //
    // La vista previa es DOM: cada línea vive en un `div` de alto
    // `fontSize × lineHeight` y el navegador centra los glifos dentro con
    // «medio interlineado» a cada lado. `textBaseline: 'top'` en el canvas NO
    // hace eso: apoya el glifo contra el borde de arriba.
    //
    // Medido comparando la vista previa con la exportación del MISMO
    // documento: la diferencia se concentraba en las bandas de texto y en
    // ninguna otra parte —4,44 % de los píxeles—, porque el canvas subía cada
    // línea unos 5 px respecto del editor. Replicando el medio interlineado
    // con las métricas reales de la fuente, baja a ruido de antialias.
    //
    // `fontBoundingBox*` es lo que usa CSS para el alto de contenido; no es
    // `fontSize`. Si el navegador no las expone, se cae a la aproximación
    // clásica de 0,8/0,2 em, que es mejor que ignorar el medio interlineado.
    ctx.textBaseline = 'alphabetic';
    const probe = ctx.measureText('Hg');
    const ascent = probe.fontBoundingBoxAscent || px * 0.8;
    const descent = probe.fontBoundingBoxDescent || px * 0.2;
    const lineBox = px * node.lineHeight;
    const halfLeading = (lineBox - (ascent + descent)) / 2;
    const baseline = halfLeading + ascent;

    let y = verticalOffset(node, layout, h);
    const spacing = (node.letterSpacing || 0) * W;
    for (const line of layout.lines) {
        if (spacing === 0) {
            ctx.fillText(line, anchorX, y + baseline);
        } else {
            // Con espaciado entre letras hay que colocar carácter por carácter:
            // `letterSpacing` del contexto 2D no está en todos los navegadores
            // y, donde no está, se ignora en silencio — el texto saldría más
            // angosto en el archivo que en pantalla.
            const total = ctx.measureText(line).width + spacing * Math.max(0, line.length - 1);
            let cx = node.align === 'center' ? anchorX - total / 2 : node.align === 'right' ? anchorX - total : anchorX;
            const prev: CanvasTextAlign = ctx.textAlign;
            ctx.textAlign = 'left';
            for (const ch of line) { ctx.fillText(ch, cx, y + baseline); cx += ctx.measureText(ch).width + spacing; }
            ctx.textAlign = prev;
        }
        y += px * node.lineHeight;
    }
};

// ─── Escena ────────────────────────────────────────────────────────────

export interface RenderOptions {
    /** Multiplicador sobre el tamaño nominal del formato (1 = 1080×1080). */
    scale?: number;
    /** Fondo opaco. Para PNG con transparencia, `false`. */
    opaque?: boolean;
}

export const renderDocumentToCanvas = async (doc: DesignDocument, opts: RenderOptions = {}): Promise<HTMLCanvasElement> => {
    const fmt = formatOf(doc.format);
    const scale = Math.min(MAX_SCALE, Math.max(0.1, opts.scale ?? 1));
    const W = Math.round(fmt.width * scale);
    const H = Math.round(fmt.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto de canvas');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (opts.opaque !== false) {
        ctx.fillStyle = doc.background || '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
    }

    // Las imágenes se piden TODAS de una vez, antes de dibujar nada: en serie,
    // una pieza con foto y dos logotipos encadenaría tres viajes de red.
    const visible = doc.nodes.filter(n => !n.hidden && n.opacity > 0);
    const sources = [...new Set(visible.filter(isImage).map(n => n.src).filter(Boolean) as string[])];
    const loaded = new Map<string, HTMLImageElement>();
    await Promise.all(sources.map(async src => {
        // Una imagen que no carga no puede tumbar la exportación entera: se
        // omite ese nodo y el resto de la pieza sale. Lo mismo hace el pendón.
        try { loaded.set(src, await loadImage(src)); }
        catch (e) { console.warn('[designRender] imagen omitida:', e); }
    }));

    for (const node of visible) {
        ctx.save();
        ctx.globalAlpha = node.opacity;
        // El origen se traslada a la esquina del nodo y la rotación gira sobre
        // su CENTRO, que es lo que espera cualquiera que arrastre un tirador.
        const x = node.x * W, y = node.y * H, w = node.w * W, h = node.h * H;
        ctx.translate(x, y);
        if (node.rotation) {
            ctx.translate(w / 2, h / 2);
            ctx.rotate((node.rotation * Math.PI) / 180);
            ctx.translate(-w / 2, -h / 2);
        }
        try {
            if (isText(node)) drawTextNode(ctx, node, W, H);
            else if (isImage(node)) drawImageNode(ctx, node, node.src ? loaded.get(node.src) || null : null, W, H);
            else if (isShape(node)) drawShape(ctx, node, W, H);
        } catch (e) {
            console.warn('[designRender] nodo omitido:', node.id, e);
        }
        ctx.restore();
    }

    return canvas;
};

// ─── Exportación ───────────────────────────────────────────────────────

const sanitize = (name: string): string =>
    (name || 'diseno').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'diseno';

const download = (href: string, filename: string) => {
    const a = document.createElement('a');
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
};

export type ExportFormat = 'png' | 'jpg' | 'pdf';

export const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo generar el archivo'))), type, quality);
    });

export const exportDocument = async (
    doc: DesignDocument,
    { format = 'png', title = 'diseno', scale = MAX_SCALE }: { format?: ExportFormat; title?: string; scale?: number } = {}
): Promise<void> => {
    const canvas = await renderDocumentToCanvas(doc, { scale, opaque: true });
    const base = sanitize(title);
    const fmt = formatOf(doc.format);

    if (format === 'png') return download(canvas.toDataURL('image/png'), `${base}-${canvas.width}x${canvas.height}.png`);
    if (format === 'jpg') return download(canvas.toDataURL('image/jpeg', JPEG_QUALITY), `${base}-${canvas.width}x${canvas.height}.jpg`);

    // PDF al tamaño físico que corresponde a 150 DPI, que es el estándar de la
    // plataforma para impresión (el mismo del Generador de Pendones).
    const { jsPDF } = await import('jspdf');
    const DPI = 150, CM = 2.54;
    const wCm = (fmt.width / DPI) * CM, hCm = (fmt.height / DPI) * CM;
    const pdf = new jsPDF({ orientation: hCm >= wCm ? 'portrait' : 'landscape', unit: 'cm', format: [wCm, hCm], compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, wCm, hCm, undefined, 'FAST');
    pdf.save(`${base}.pdf`);
};

/** El archivo listo para subir a la Biblioteca Multimedia por `/api/media/upload`.
 *  La fila de `Media` es el ARCHIVO; la ficha del diseño vive en
 *  `DesignProject` — misma separación que en la Biblioteca de Reels. */
export const exportToFile = async (doc: DesignDocument, title = 'diseno', scale = MAX_SCALE): Promise<File> => {
    const canvas = await renderDocumentToCanvas(doc, { scale, opaque: true });
    const blob = await canvasToBlob(canvas, 'image/png');
    return new File([blob], `${sanitize(title)}.png`, { type: 'image/png' });
};

/** Miniatura para el listado. Pequeña a propósito: una tarjeta no necesita
 *  2160 px y guardarlos multiplicaría el peso del listado por veinte. */
export const thumbnail = async (doc: DesignDocument, width = 360): Promise<string> => {
    const fmt = formatOf(doc.format);
    const canvas = await renderDocumentToCanvas(doc, { scale: width / fmt.width, opaque: true });
    return canvas.toDataURL('image/jpeg', 0.72);
};
