// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — EL COMPOSITOR
// v4.898.0
//
// ⚠️ HAY UN SOLO CAMINO DE COMPOSICIÓN, Y ES ÉSTE.
//
// El requisito 14 del pedido es obligatorio: «la imagen que aparece en la vista
// previa debe ser exactamente la misma que se descarga». La forma más barata de
// cumplirlo a medias sería pintar la vista previa en el DOM y exportar por
// canvas — y entonces habría dos maquetadores que se separan en silencio, que
// es exactamente el problema que Plantillas IA tiene que resolver con una
// prueba de paridad píxel a píxel.
//
// Acá no hace falta ninguna prueba de paridad, porque no hay dos cosas que
// comparar: `renderAnniversary` devuelve UN canvas, la pantalla MUESTRA ese
// canvas y la descarga EXPORTA ese mismo canvas. La vista previa no se parece
// al archivo: **es** el archivo. No reintroducir una vista previa en DOM.
//
// ── LAS TRES CAPAS ──────────────────────────────────────────────────
//
//   1. DISEÑO — el fondo que devolvió el modelo (modo `ai`) o la fotografía
//      sobre blanco (modo `plain`). Es lo único que puede venir de la IA.
//   2. CONTENIDO — nombre del club, años, titular y mensaje. Lo escribimos
//      nosotros, así que la ortografía y las cifras están garantizadas POR
//      CONSTRUCCIÓN. Es el motivo por el que existe la arquitectura híbrida:
//      los modelos generativos no escriben texto de forma fiable.
//   3. BRANDING — logotipos y pie, desde archivos REALES. Nada se dibuja: el
//      emblema de Rotary es marca registrada y se reproduce, no se imita.
//
// ── QUÉ SE REUTILIZA DE LA PLATAFORMA ───────────────────────────────
//
// `ensureDesignFonts` — el cargador de las tipografías empaquetadas (Open Sans,
// que es la tipografía de marca de Rotary, y Oswald). Es un servicio GLOBAL,
// no el editor: hay UN registro de caras en `document.fonts` y un segundo
// cargador registraría las mismas dos veces. Lo que NO se importa es el
// compilador de plantillas, el grafo de escena ni `designRender`.
//
// El proxy de imágenes es el mismo que ya usan el Generador de Pendones y
// Plantillas IA: una imagen de S3 pintada directo deja el canvas «tainted» y
// `toBlob` lanza. No se abre un proxy nuevo.
// ════════════════════════════════════════════════════════════════════
import { ensureDesignFonts } from './designFonts';
import { zoneById, FOOTER_BAND, canvasSize, type TextZone } from './anniversarySpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

// ─── Paleta ────────────────────────────────────────────────────────────
//
// Está acá y no es configurable, a propósito: el requisito 6 dice que todas
// las piezas tienen que pertenecer claramente a la misma familia visual, y el
// contraste del texto sobre el fondo no es una decisión editorial. Quien
// configura elige las instrucciones y las referencias; la legibilidad la
// garantiza el sistema. Misma regla que el Slider Global (v4.879).
export const INK = '#1F2937';
export const ROTARY_BLUE = '#17458F';
export const ROTARY_GOLD = '#B5A16B';
export const PAPER = '#FFFFFF';

const DISPLAY = "'Oswald', 'Arial Narrow', Impact, sans-serif";
const BODY = "'Open Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ─── Imágenes ──────────────────────────────────────────────────────────

const proxied = (url: string): string =>
    url.startsWith('data:') || url.startsWith('blob:')
        ? url
        : `${API}/public/banner-image?url=${encodeURIComponent(url)}`;

const cache = new Map<string, Promise<HTMLImageElement>>();

export const loadImage = (src: string): Promise<HTMLImageElement> => {
    const key = proxied(src);
    const hit = cache.get(key);
    if (hit) return hit;
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (!key.startsWith('data:') && !key.startsWith('blob:')) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src}`));
        img.src = key;
    });
    cache.set(key, p);
    // Un fallo NO se cachea: la próxima vez puede ser un tropiezo de red que ya
    // pasó, y dejar el rechazo guardado lo convertiría en permanente.
    p.catch(() => cache.delete(key));
    return p;
};

// ─── El documento ──────────────────────────────────────────────────────

export interface AnniversaryBranding {
    clubLogo?: string | null;
    districtLine?: string | null;
    period?: string | null;
    footerImage?: string | null;
    watermark?: string | null;
    missing?: string[];
}

export interface AnniversaryDocument {
    format: string;
    width: number;
    height: number;
    /** `ai` usa el fondo que compuso el modelo; `plain` compone con la
     *  fotografía intacta sobre blanco. NO es un segundo sistema de diseño:
     *  es este mismo compositor con la capa 1 vacía. */
    renderMode: 'ai' | 'plain';
    backdropUrl: string | null;
    photoUrl: string;
    zoneId: string;
    clubName: string;
    years: number | null;
    title: string;
    message: string;
    branding: AnniversaryBranding;
}

// ─── Qué se imprime, y qué no se repite ────────────────────────────────

const flat = (s: string) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export type BlockKind = 'headline' | 'kicker' | 'years' | 'club' | 'rule' | 'message';
export interface TextBlock { kind: BlockKind; text: string }

/** El pase pequeño que la referencia pone entre el titular y el nombre del
 *  club. Es lenguaje de la PIEZA, no del modelo: por eso es una constante y
 *  no algo que se le pida escribir a nadie. */
export const KICKER_TEXT = 'Felicidades';

/**
 * Decide qué bloques entran en la pieza.
 *
 * ⚠️ EL PROBLEMA QUE ESTO RESUELVE es la redundancia. El titular que escribe el
 * modelo suele nombrar al club, a los años o a los dos —el pedido lo pide así,
 * con ejemplos como «¡Feliz aniversario, Club Rotario Cali!» y «¡40 años
 * generando impacto!»—, y la pieza además imprime el club y los años como
 * datos EXACTOS. Repetirlos se lee como un error de maquetación.
 *
 * Así que el titular manda y los dos bloques de identidad sólo aparecen si el
 * titular no los dijo ya. Nunca al revés: el club y los años son datos que
 * escribimos nosotros y no pueden faltar los DOS —si el titular no dice
 * ninguno, salen los dos—.
 *
 * Es puro y está probado: `npm run test:anniversary`.
 */
export const planTextBlocks = (doc: Pick<AnniversaryDocument, 'title' | 'message' | 'clubName' | 'years'>): TextBlock[] => {
    const title = String(doc.title || '').trim();
    const message = String(doc.message || '').trim();
    const club = String(doc.clubName || '').trim();
    const years = doc.years ?? null;

    const t = flat(title);
    const diceAnios = years !== null && new RegExp(`\\b${years}\\b`).test(t);
    // El club se da por nombrado si el titular contiene su parte distintiva —
    // «Cali» en «Club Rotario Cali»—: comparar el nombre completo daría falso
    // negativo con «¡Feliz aniversario, Cali!», que sí lo nombra.
    const distintiva = flat(club).replace(/^(club rotario|rotary e-?club|rotary)\s+/, '');
    const diceClub = !!distintiva && distintiva.length >= 3 && t.includes(distintiva);

    const bloques: TextBlock[] = [];
    if (title) bloques.push({ kind: 'headline', text: title });
    // El orden es el de la referencia: titular → pase → club → banda de años.
    // El pase introduce el nombre del club, así que sólo sale con él.
    if (club && !diceClub) {
        bloques.push({ kind: 'kicker', text: KICKER_TEXT });
        bloques.push({ kind: 'club', text: club });
    }
    if (years !== null && !diceAnios) bloques.push({ kind: 'years', text: String(years) });
    // Sin titular, el club y los años SIEMPRE salen: son lo único que
    // identifica la pieza.
    if (!title) {
        if (club && !bloques.some(b => b.kind === 'club')) {
            bloques.unshift({ kind: 'club', text: club });
            bloques.unshift({ kind: 'kicker', text: KICKER_TEXT });
        }
        if (years !== null && !bloques.some(b => b.kind === 'years')) bloques.push({ kind: 'years', text: String(years) });
    }
    if (message) {
        bloques.push({ kind: 'rule', text: '' });
        bloques.push({ kind: 'message', text: message });
    }
    return bloques;
};

// ─── Medición y reparto de líneas ──────────────────────────────────────
//
// Se escribe acá y no se importa de `designSpec` a propósito: este módulo no
// depende del editor de Plantillas IA. Es reparto de líneas, no un criterio
// que pueda divergir — dos implementaciones de «cortar por palabras» no se
// contradicen entre sí, y el compositor tiene que poder leerse solo.

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const out: string[] = [];
    for (const parrafo of String(text || '').split('\n')) {
        const palabras = parrafo.split(/\s+/).filter(Boolean);
        if (!palabras.length) { out.push(''); continue; }
        let linea = palabras[0];
        for (let i = 1; i < palabras.length; i++) {
            const prueba = `${linea} ${palabras[i]}`;
            if (ctx.measureText(prueba).width > maxWidth && linea) { out.push(linea); linea = palabras[i]; }
            else linea = prueba;
        }
        out.push(linea);
    }
    return out;
};

interface BlockStyle { font: string; size: number; lineHeight: number; color: string; gapBefore: number; upper?: boolean; letterSpacing?: number }

/** Tamaños en FRACCIÓN del ancho del lienzo: así la pieza se compone igual a
 *  1080 que a 2160 y la descarga en alta no es otra maquetación. */
const STYLES: Record<BlockKind, BlockStyle> = {
    headline: { font: DISPLAY, size: 0.062, lineHeight: 1.08, color: ROTARY_BLUE, gapBefore: 0, upper: true },
    // El pase chico de la referencia («FELICIDADES»): letra espaciada, tinta.
    kicker: { font: BODY, size: 0.019, lineHeight: 1.2, color: INK, gapBefore: 0.030, upper: true, letterSpacing: 0.32 },
    // Los años van dentro de una BANDA dorada («40 AÑOS»), como en la
    // referencia. `size` es el cuerpo del texto; la banda mide 1,9× eso.
    years: { font: DISPLAY, size: 0.044, lineHeight: 1, color: PAPER, gapBefore: 0.030, upper: true },
    club: { font: DISPLAY, size: 0.043, lineHeight: 1.18, color: ROTARY_BLUE, gapBefore: 0.012, upper: true },
    rule: { font: BODY, size: 0.006, lineHeight: 1, color: ROTARY_GOLD, gapBefore: 0.030 },
    message: { font: BODY, size: 0.026, lineHeight: 1.42, color: INK, gapBefore: 0.026 },
};

const BAND_RATIO = 1.9; // alto de la banda dorada respecto del cuerpo de su texto

const weightFor = (kind: BlockKind) => (kind === 'headline' || kind === 'years' ? 600 : (kind === 'club' ? 700 : 400));

/** El nombre del club en DOS tonos, como la referencia: el prefijo
 *  institucional en azul y la parte distintiva en dorado. Si el nombre no
 *  tiene prefijo reconocible, va entero en azul. */
export const splitClubName = (line: string): { prefix: string; rest: string } => {
    const m = String(line || '').match(/^((?:club\s+rotario|rotary\s+e-?club|rotary)\s+)(.+)$/i);
    return m ? { prefix: m[1], rest: m[2] } : { prefix: '', rest: String(line || '') };
};

/** El rótulo de la banda dorada. El número es un dato NUESTRO: la cifra que
 *  la persona escribió, jamás una que escriba un modelo. */
export const yearsBandLabel = (years: string | number) =>
    `${years} ${Number(years) === 1 ? 'AÑO' : 'AÑOS'}`;

interface Measured { block: TextBlock; style: BlockStyle; lines: string[]; height: number; fontSize: number }

/** El espaciado de letra se fija ANTES de medir y de dibujar, con el mismo
 *  valor: medir sin él y dibujar con él es lo que saca un texto del recuadro. */
const applyLetterSpacing = (ctx: CanvasRenderingContext2D, st: BlockStyle, fontSize: number) => {
    try { (ctx as any).letterSpacing = st.letterSpacing ? `${(st.letterSpacing * fontSize).toFixed(2)}px` : '0px'; } catch { /* navegador sin soporte: se compone sin espaciado */ }
};

const measure = (ctx: CanvasRenderingContext2D, bloques: TextBlock[], W: number, boxW: number, escala: number): { items: Measured[]; total: number } => {
    const items: Measured[] = [];
    let total = 0;
    for (const b of bloques) {
        const st = STYLES[b.kind];
        const fontSize = st.size * W * escala;
        if (b.kind === 'rule') {
            const h = Math.max(2, fontSize);
            total += st.gapBefore * W * escala + h;
            items.push({ block: b, style: st, lines: [], height: h, fontSize: h });
            continue;
        }
        ctx.font = `${weightFor(b.kind)} ${fontSize}px ${st.font}`;
        applyLetterSpacing(ctx, st, fontSize);
        const texto = st.upper ? b.text.toUpperCase() : b.text;
        // Los años van en su banda y no se reparten en líneas: son un rótulo.
        const lines = b.kind === 'years' ? [yearsBandLabel(b.text)] : wrap(ctx, texto, boxW);
        const h = b.kind === 'years' ? fontSize * BAND_RATIO : lines.length * fontSize * st.lineHeight;
        total += st.gapBefore * W * escala + h;
        items.push({ block: b, style: st, lines, height: h, fontSize });
        applyLetterSpacing(ctx, {} as BlockStyle, fontSize);
    }
    return { items, total };
};

/**
 * Ajusta el bloque entero a la zona con UNA escala global.
 *
 * Una escala por bloque rompería la jerarquía —el titular podría quedar más
 * chico que el mensaje— y es justo lo que hace que una pieza se vea armada por
 * un programa. Con una sola escala, las proporciones se conservan.
 */
const AUTOFIT_FLOOR = 0.62;

const fit = (ctx: CanvasRenderingContext2D, bloques: TextBlock[], W: number, boxW: number, boxH: number) => {
    let escala = 1;
    let m = measure(ctx, bloques, W, boxW, escala);
    let guardia = 40;
    while (m.total > boxH && escala > AUTOFIT_FLOOR && guardia-- > 0) {
        escala = Math.max(AUTOFIT_FLOOR, escala * 0.96);
        m = measure(ctx, bloques, W, boxW, escala);
    }
    // Si ni con el piso entra, se DICE. Recortar el mensaje acá sería perder
    // contenido en silencio; quien mira la pieza tiene que poder verlo.
    return { ...m, escala, overflow: m.total > boxH + 1 };
};

// ─── Dibujo ────────────────────────────────────────────────────────────

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
};

/** Dibuja una imagen cubriendo el recuadro, centrada, sin deformarla. La
 *  fotografía NO se filtra, no se corrige de color y no se estira: sólo se
 *  encuadra. */
const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const escala = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * escala;
    const dh = img.naturalHeight * escala;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
};

/** Dibuja una imagen ENTERA dentro del recuadro, sin recortarla. Es lo que
 *  corresponde a un logotipo: recortarlo lo destruye. */
const drawContain = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, align: 'left' | 'right' | 'center' = 'left') => {
    const escala = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * escala;
    const dh = img.naturalHeight * escala;
    const dx = align === 'left' ? x : (align === 'right' ? x + w - dw : x + (w - dw) / 2);
    ctx.drawImage(img, dx, y + (h - dh) / 2, dw, dh);
    return { width: dw, height: dh, x: dx };
};

/** Dónde va la fotografía en modo `plain`: siempre del lado contrario al
 *  texto. Con el texto abajo, la foto ocupa la mitad de arriba. */
const photoBoxFor = (zone: TextZone, W: number, H: number) => {
    const pie = FOOTER_BAND.y * H;
    if (zone.id === 'left') return { x: W * 0.48, y: 0, w: W * 0.52, h: pie };
    if (zone.id === 'right') return { x: 0, y: 0, w: W * 0.52, h: pie };
    return { x: 0, y: 0, w: W, h: H * 0.50 };
};

export interface RenderResult {
    canvas: HTMLCanvasElement;
    /** Lo que no se pudo dibujar. Se DICE en la pantalla en vez de dejar un
     *  hueco sin explicación: una imagen que falla en silencio se lee como que
     *  el módulo está roto. */
    warnings: string[];
    /** El texto no entró en su zona ni con la reducción máxima. */
    overflow: boolean;
}

/**
 * Compone la pieza. **Ésta es la única función que dibuja un aniversario.**
 *
 * `scale` multiplica la resolución nominal: 1 devuelve el tamaño del documento
 * y 2 el doble, para imprimir. La maquetación NO cambia —todo está en
 * fracciones del ancho—, así que la descarga en alta es la misma pieza con más
 * píxeles, no otra composición.
 */
export const renderAnniversary = async (doc: AnniversaryDocument, { scale = 1 }: { scale?: number } = {}): Promise<RenderResult> => {
    // ⚠️ HAY QUE ESPERAR LAS TIPOGRAFÍAS ANTES DE MEDIR. Medir con la letra de
    // respaldo y dibujar con la definitiva es lo que produce un texto que se
    // sale del recuadro. Nunca rechaza: si la descarga falla, se compone con
    // las del sistema y la pieza sale igual.
    await ensureDesignFonts();

    const base = canvasSize(doc.format, Math.max(doc.width || 0, doc.height || 0) || undefined);
    const W = Math.round((doc.width || base.width) * scale);
    const H = Math.round((doc.height || base.height) * scale);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no pudo abrir el lienzo para componer la pieza.');

    const warnings: string[] = [];
    const zone = zoneById(doc.zoneId);

    // ── Capa 0 — el papel ───────────────────────────────────────────
    // Siempre blanco, incluso en modo `ai`: si la imagen del modelo no cubre
    // el lienzo entero, lo que asoma es papel y no negro.
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    // ── Capa 1 — el diseño ──────────────────────────────────────────
    if (doc.renderMode === 'ai' && doc.backdropUrl) {
        try {
            const fondo = await loadImage(doc.backdropUrl);
            // Encuadrado, no estirado: si el modelo devolvió otra proporción,
            // deformarla sería peor que recortarla, y el aviso de que volvió en
            // otra proporción ya lo dio la validación del servidor.
            drawCover(ctx, fondo, 0, 0, W, H);
        } catch {
            warnings.push('No se pudo cargar el diseño generado; la pieza se compuso con la fotografía sobre fondo blanco.');
            await drawPlainPhoto(ctx, doc, zone, W, H, warnings);
        }
    } else {
        await drawPlainPhoto(ctx, doc, zone, W, H, warnings);
    }

    // ── Capa 2 — el contenido ───────────────────────────────────────
    const bloques = planTextBlocks(doc);
    const boxX = zone.x * W;
    const boxY = zone.y * H;
    const boxW = zone.w * W;
    const boxH = zone.h * H;

    const ajuste = fit(ctx, bloques, W, boxW, boxH);

    // Centrado vertical dentro de la zona: con el bloque pegado arriba, un
    // mensaje corto deja un hueco que se lee como si faltara algo.
    let y = boxY + Math.max(0, (boxH - ajuste.total) / 2);
    ctx.textBaseline = 'top';

    for (const item of ajuste.items) {
        y += item.style.gapBefore * W * ajuste.escala;
        const alineado = zone.align;
        const cx = alineado === 'center' ? boxX + boxW / 2 : boxX;

        if (item.block.kind === 'rule') {
            ctx.fillStyle = item.style.color;
            const ancho = Math.min(boxW * 0.34, boxW);
            const rx = alineado === 'center' ? cx - ancho / 2 : boxX;
            ctx.fillRect(rx, y, ancho, item.height);
            y += item.height;
            continue;
        }

        ctx.font = `${weightFor(item.block.kind)} ${item.fontSize}px ${item.style.font}`;
        applyLetterSpacing(ctx, item.style, item.fontSize);

        // La BANDA dorada de los años, como en la referencia: pastilla dorada
        // con «40 AÑOS» en blanco. La cifra la escribimos nosotros — es la
        // garantía POR CONSTRUCCIÓN de la arquitectura híbrida.
        if (item.block.kind === 'years') {
            const rotulo = item.lines[0] || yearsBandLabel(item.block.text);
            const anchoTexto = ctx.measureText(rotulo).width;
            const pad = item.fontSize * 0.85;
            const bandaW = Math.min(boxW, anchoTexto + pad * 2);
            const bandaH = item.height;
            const bx = alineado === 'center' ? cx - bandaW / 2 : boxX;
            ctx.fillStyle = ROTARY_GOLD;
            roundRect(ctx, bx, y, bandaW, bandaH, bandaH * 0.18);
            ctx.fill();
            ctx.fillStyle = PAPER;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(rotulo, bx + bandaW / 2, y + bandaH / 2 + item.fontSize * 0.04);
            ctx.textBaseline = 'top';
            y += bandaH;
            applyLetterSpacing(ctx, {} as BlockStyle, item.fontSize);
            continue;
        }

        ctx.fillStyle = item.style.color;
        ctx.textAlign = alineado === 'center' ? 'center' : 'left';

        for (const linea of item.lines) {
            // El nombre del club va en DOS tonos cuando cabe en una línea:
            // prefijo institucional azul + parte distintiva dorada. En dos
            // líneas se queda entero en azul — partir el color por el salto
            // de línea se lee como un error.
            const dosTonos = item.block.kind === 'club' && item.lines.length === 1 ? splitClubName(linea) : null;
            if (dosTonos && dosTonos.prefix) {
                const wPrefix = ctx.measureText(dosTonos.prefix).width;
                const wTotal = wPrefix + ctx.measureText(dosTonos.rest).width;
                const x0 = alineado === 'center' ? cx - wTotal / 2 : boxX;
                ctx.textAlign = 'left';
                ctx.fillStyle = ROTARY_BLUE;
                ctx.fillText(dosTonos.prefix, x0, y);
                ctx.fillStyle = ROTARY_GOLD;
                ctx.fillText(dosTonos.rest, x0 + wPrefix, y);
                ctx.textAlign = alineado === 'center' ? 'center' : 'left';
                ctx.fillStyle = item.style.color;
            } else {
                ctx.fillText(linea, cx, y);
            }
            y += item.fontSize * item.style.lineHeight;
        }
        applyLetterSpacing(ctx, {} as BlockStyle, item.fontSize);
    }

    // ── Capa 3 — el branding ────────────────────────────────────────
    await drawBranding(ctx, doc, W, H, warnings);

    if (ajuste.overflow) {
        warnings.push('El mensaje es más largo de lo que entra en la pieza y quedó ajustado al mínimo. Conviene regenerarlo.');
    }
    return { canvas, warnings, overflow: ajuste.overflow };
};

/** La capa 1 en modo `plain`: la fotografía intacta sobre papel blanco. */
const drawPlainPhoto = async (ctx: CanvasRenderingContext2D, doc: AnniversaryDocument, zone: TextZone, W: number, H: number, warnings: string[]) => {
    if (!doc.photoUrl) return;
    try {
        const foto = await loadImage(doc.photoUrl);
        const caja = photoBoxFor(zone, W, H);
        ctx.save();
        // Esquinas suaves para que no se lea como un rectángulo pegado. No es
        // un filtro sobre la imagen: es por dónde se la recorta. Los píxeles
        // viajan intactos.
        roundRect(ctx, caja.x, caja.y, caja.w, caja.h, Math.min(caja.w, caja.h) * 0.06);
        ctx.clip();
        drawCover(ctx, foto, caja.x, caja.y, caja.w, caja.h);
        ctx.restore();
    } catch {
        warnings.push('No se pudo cargar la fotografía.');
    }
};

/**
 * La capa 3. Todo lo que se dibuja acá viene de un ARCHIVO REAL o de un dato
 * de la base. Nada se inventa: un club sin logotipo cargado no muestra
 * logotipo, y eso es la verdad — dibujar un emblema «parecido» es justo lo que
 * una institución no puede publicar.
 */
const drawBranding = async (ctx: CanvasRenderingContext2D, doc: AnniversaryDocument, W: number, H: number, warnings: string[]) => {
    const b = doc.branding || {};
    const bandaY = FOOTER_BAND.y * H;
    const bandaH = FOOTER_BAND.h * H;
    const hayAlgo = !!(b.clubLogo || b.districtLine || b.footerImage);

    if (hayAlgo) {
        // Un velo blanco para que el pie se lea sobre cualquier fondo, y un
        // filete dorado que garantiza la separación pase lo que pase con la
        // imagen de arriba. No es un retoque de la salida del modelo: es la
        // capa institucional, declarada.
        ctx.fillStyle = 'rgba(255,255,255,0.93)';
        ctx.fillRect(0, bandaY, W, bandaH);
        ctx.fillStyle = ROTARY_GOLD;
        ctx.fillRect(0, bandaY, W, Math.max(2, H * 0.0022));
    }

    const margen = W * 0.055;
    const alto = bandaH * 0.46;
    const centro = bandaY + bandaH / 2 - alto / 2;
    let izquierda = margen;
    let derecha = W - margen;

    if (b.clubLogo) {
        try {
            const img = await loadImage(b.clubLogo);
            const r = drawContain(ctx, img, izquierda, centro, W * 0.22, alto, 'left');
            izquierda += r.width + W * 0.03;
        } catch { warnings.push('No se pudo cargar el logotipo del club.'); }
    }
    if (b.footerImage) {
        try {
            const img = await loadImage(b.footerImage);
            const r = drawContain(ctx, img, derecha - W * 0.24, centro, W * 0.24, alto, 'right');
            derecha = r.x - W * 0.03;
        } catch { warnings.push('No se pudo cargar el pie institucional.'); }
    }
    if (b.districtLine) {
        const size = W * 0.0175;
        ctx.font = `600 ${size}px ${BODY}`;
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const disponible = Math.max(0, derecha - izquierda);
        const lineas = wrap(ctx, b.districtLine, disponible);
        // Una sola línea: el pie no es sitio para un párrafo, y dos líneas
        // desalinean el logotipo.
        ctx.fillText(lineas[0] || '', izquierda, bandaY + bandaH / 2);
        ctx.textBaseline = 'top';
    }

    if (b.watermark) {
        try {
            const img = await loadImage(b.watermark);
            ctx.save();
            ctx.globalAlpha = 0.22;
            drawContain(ctx, img, W - margen - W * 0.14, H * 0.035, W * 0.14, H * 0.075, 'right');
            ctx.restore();
        } catch { warnings.push('No se pudo cargar la marca de agua.'); }
    }
};

// ─── Descarga ──────────────────────────────────────────────────────────
//
// Se exporta EL MISMO canvas que se está mirando. No se vuelve a componer: si
// se recompusiera, volverían a ser dos cosas y podrían diferir.

export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo exportar la pieza.'))),
            type, quality
        );
    });

export const safeFileName = (clubName: string, years: number | null) => {
    const base = String(clubName || 'aniversario')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return `${base || 'aniversario'}${years ? `-${years}-anios` : ''}.png`;
};

export const downloadCanvas = async (canvas: HTMLCanvasElement, filename: string) => {
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Se libera en el siguiente tick: revocarlo en el acto cancela la descarga
    // en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export default { renderAnniversary, planTextBlocks, canvasToBlob, downloadCanvas, safeFileName, loadImage };
