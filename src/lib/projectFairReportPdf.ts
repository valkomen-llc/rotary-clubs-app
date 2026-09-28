/**
 * Informe Ejecutivo de Postulación de Proyectos — generador PDF (v4.1126).
 *
 * Diseño compacto e institucional, máximo 2–3 páginas A4:
 *   Página 1 ......... cabecera blanca + Resumen Ejecutivo (KPIs + lectura).
 *   Páginas 2 (–3) .... Clubes y Proyectos Postulados (tabla agrupada por club).
 *
 * NO incluye secciones analíticas (embudo, finanzas, alertas, evolución,
 * matrices): esa información vive en el Centro de Inteligencia; el PDF lo
 * complementa, no lo replica.
 *
 * Técnica: jsPDF vectorial 100% determinista. Sin window.print() ni
 * html2canvas: idéntico sin importar pantalla, navegador, zoom o resolución.
 *
 * Reglas de composición (anti-superposición):
 * - Ningún contenedor de texto usa altura fija: toda altura se calcula de
 *   `splitTextToSize` + line-height + padding (height auto por construcción).
 * - Ritmo vertical consistente: sección (16 arriba / 10 abajo), bloques (8–12).
 * - Las filas de la tabla nunca se parten: si no caben, saltan de página
 *   completas y el encabezado se repite.
 * - Los títulos de sección nunca quedan huérfanos al final de una página.
 *
 * Fuente única de datos: GET /project-fair/admin/inteligencia (los mismos
 * KPIs del Centro de Inteligencia). Sin valores hardcodeados.
 */
import {
    IntelligenceData, fmtCop, fmtUsd, fmtNum, fmtPct, fmtDateShort,
    buildExecutiveReading, editionSubtitle, pickLogoUrl,
} from './projectFairAnalytics';

export interface ReportSubmission {
    publicRef?: string; projectName?: string; clubName?: string; district?: string;
    country?: string | null; budgetUsd?: number | null;
    workflowStatus?: string; paymentStatus?: string;
    amountCop?: number | null; amountUsd?: number | null;
    createdAt?: string; paidAt?: string | null;
}
export interface ReportCatalog {
    workflowStates?: { key: string; label: string }[];
    paymentStates?: { key: string; label: string }[];
}
export interface ReportAlerts {
    alerts: { key: string; label: string; severity: string; items: any[]; count: number }[];
    total: number;
}

// ── Identidad ─────────────────────────────────────────────────────────
const BLUE: [number, number, number] = [23, 69, 143];
const GOLD: [number, number, number] = [247, 168, 27];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const BAND_BG: [number, number, number] = [239, 244, 250];

const PAGE_W = 595;
const PAGE_H = 842;
const M = 44;
const CONTENT_W = PAGE_W - M * 2;
const FOOT_Y = PAGE_H - 40;

type RGB = [number, number, number];
type Doc = any;

// Paleta de badges discretos por estado.
const BADGE: Record<string, { bg: RGB; tx: RGB }> = {
    green: { bg: [209, 250, 229], tx: [6, 95, 70] },
    amber: { bg: [254, 243, 199], tx: [146, 64, 14] },
    blue: { bg: [219, 234, 254], tx: [30, 64, 175] },
    red: { bg: [254, 226, 226], tx: [153, 27, 27] },
    slate: { bg: [241, 245, 249], tx: [71, 85, 105] },
    violet: { bg: [237, 233, 254], tx: [76, 29, 149] },
};

const WORKFLOW_BADGE: Record<string, { label: string; tone: string }> = {
    draft: { label: 'Borrador', tone: 'slate' },
    received: { label: 'Recibida', tone: 'slate' },
    pending_payment: { label: 'Pendiente de pago', tone: 'amber' },
    payment_confirmed: { label: 'Pago confirmado', tone: 'blue' },
    payment_failed: { label: 'Pago fallido', tone: 'red' },
    refunded: { label: 'Reembolsada', tone: 'slate' },
    in_review: { label: 'En revisión', tone: 'blue' },
    needs_changes: { label: 'Requiere ajustes', tone: 'red' },
    approved: { label: 'Aprobada', tone: 'green' },
    rejected: { label: 'No aprobada', tone: 'red' },
    sent_to_grants: { label: 'Enviada a Rotary Grants', tone: 'violet' },
    closed: { label: 'Cerrada', tone: 'slate' },
};
const PAYMENT_BADGE: Record<string, { label: string; tone: string }> = {
    pending_payment: { label: 'Pendiente', tone: 'amber' },
    paid: { label: 'Pagado', tone: 'green' },
    failed: { label: 'Fallido', tone: 'red' },
    refunded: { label: 'Reembolsado', tone: 'slate' },
};

function wfBadge(key: string | undefined, catalog?: ReportCatalog | null): { label: string; tone: string } {
    const known = key ? WORKFLOW_BADGE[key] : undefined;
    const label = (key && catalog?.workflowStates?.find(s => s.key === key)?.label)
        || known?.label
        || (key ? key.replace(/_/g, ' ') : '—');
    return { label, tone: known?.tone || 'slate' };
}
function payBadge(key: string | undefined, catalog?: ReportCatalog | null): { label: string; tone: string } {
    const known = key ? PAYMENT_BADGE[key] : undefined;
    const label = (key && catalog?.paymentStates?.find(s => s.key === key)?.label)
        || known?.label
        || (key ? key.replace(/_/g, ' ') : '—');
    // "Pendiente de pago" del catálogo se compacta a "Pendiente" en el badge.
    const short = label.replace(/^Pendiente de pago$/i, 'Pendiente');
    return { label: short, tone: known?.tone || 'slate' };
}

// ── Logo oficial (sin deformar, proporciones intactas) ────────────────
async function loadImageDataUrl(url: string | null): Promise<{ data: string; format: string } | null> {
    if (!url) return null;
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return null;
        const type = res.headers.get('content-type') || '';
        if (!type.startsWith('image/')) return null;
        // Sin FileReader a propósito: arrayBuffer + base64 funciona igual en
        // navegador y en Node, y evita una dependencia solo del navegador.
        // (Un solo consumo del cuerpo: blob() + arrayBuffer() juntos fallan.)
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!buf.length) return null;
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
            bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        }
        const data = `data:${type};base64,${btoa(bin)}`;
        const format = type.includes('png') ? 'PNG' : 'JPEG';
        return { data, format };
    } catch { return null; }
}

async function loadLogo(url: string | null): Promise<{ data: string; format: string; w: number; h: number } | null> {
    const img = await loadImageDataUrl(url);
    if (!img) return null;
    try {
        if (typeof Image !== 'undefined') {
            const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
                const im = new Image();
                im.onload = () => resolve({ w: im.naturalWidth || 300, h: im.naturalHeight || 100 });
                im.onerror = reject;
                im.src = img.data;
            });
            if (dims.w > 0 && dims.h > 0) return { ...img, ...dims };
        }
    } catch { /* proporción de respaldo */ }
    return { ...img, w: 300, h: 100 };
}

// ── Motor de paginación ───────────────────────────────────────────────
class Report {
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

function kpiGrid(r: Report, cards: { label: string; value: string; sub?: string }[]) {
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

export interface ReportInput {
    intelligence: IntelligenceData;
    alerts?: ReportAlerts | null;
    submissions: ReportSubmission[];
    catalog?: ReportCatalog | null;
    generatedAt?: string;
}

export async function generateProjectFairReportPdf(
    input: ReportInput,
    options?: { returnBytes?: boolean },
): Promise<{ bytes: ArrayBuffer; pages: number } | void> {
    const mod: any = await import('jspdf');
    // Interop robusta: el constructor puede venir como nombrado (`jsPDF`) o
    // como `default` según el empaquetado. Se elige el que sea función.
    const JsPDF = [mod?.jsPDF, mod?.default].find((v: any) => typeof v === 'function') || (mod?.default as any)?.jsPDF;
    if (typeof JsPDF !== 'function') throw new Error('No se pudo cargar el generador PDF.');

    const intel = input.intelligence;
    const k = intel.kpis;
    const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
    const subtitle = editionSubtitle(intel);
    const footerText = subtitle;
    const r = new Report(doc, footerText);
    const genDate = input.generatedAt
        ? new Date(input.generatedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    const periodo = k.periodStart && k.periodEnd
        ? `${fmtDateShort(k.periodStart)} – ${fmtDateShort(k.periodEnd)}`
        : k.periodStart ? `Desde ${fmtDateShort(k.periodStart)}` : 'Todo el período disponible';

    // ══ PÁGINA 1 — Cabecera institucional sobre fondo blanco ══════════
    r.y = 50;
    const logo = await loadLogo(pickLogoUrl(intel));
    if (logo) {
        try {
            // Proporciones intactas: se encaja en 230×84 sin deformar.
            const s = Math.min(230 / logo.w, 84 / logo.h);
            const dw = logo.w * s;
            const dh = logo.h * s;
            doc.addImage(logo.data, logo.format as any, (PAGE_W - dw) / 2, r.y, dw, dh, undefined, 'FAST');
            r.y += dh + 16;
        } catch { /* cabecera tipográfica */ }
    } else {
        r.y += 6;
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BLUE);
    doc.text('INFORME EJECUTIVO', PAGE_W / 2, r.y, { align: 'center' } as any);
    r.y += 20;
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...INK);
    doc.text('Postulación de Proyectos', PAGE_W / 2, r.y, { align: 'center' } as any);
    r.y += 17;
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...MUTED);
    doc.text(subtitle, PAGE_W / 2, r.y, { align: 'center' } as any);
    r.y += 14;
    doc.setFontSize(8);
    doc.text(`Generado: ${genDate}   ·   Período analizado: ${periodo}`, PAGE_W / 2, r.y, { align: 'center' } as any);
    r.y += 14;
    doc.setFillColor(...GOLD);
    doc.rect(M, r.y, CONTENT_W, 2.4, 'F');
    r.y += 18;

    // ══ 1. Resumen ejecutivo — cuadrícula 4×2 ═════════════════════════
    r.sectionTitle('1', 'Resumen ejecutivo');
    const moneyValue = k.priceMode === 'USD' ? fmtUsd(k.totalUsd) : fmtCop(k.totalCop);
    const moneySub = k.priceMode === 'USD' ? 'Dólares' : 'Pesos colombianos';
    kpiGrid(r, [
        { label: 'Postulaciones', value: fmtNum(k.total) },
        { label: 'Pagadas', value: fmtNum(k.paid), sub: `Conversión ${fmtPct(k.conversionRate)}` },
        { label: 'Pendientes de pago', value: fmtNum(k.pending) },
        { label: 'Pendientes de revisión', value: fmtNum(k.pendingReview) },
        { label: 'Clubes participantes', value: fmtNum(k.clubs) },
        { label: 'Distritos participantes', value: fmtNum(k.districts) },
        { label: 'Países representados', value: fmtNum(k.countries) },
        { label: 'Recaudo total', value: moneyValue, sub: moneySub },
    ]);

    // ══ Lectura ejecutiva — uno o dos párrafos, datos reales ══════════
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BLUE);
    r.ensure(60);
    doc.text('LECTURA EJECUTIVA', M, r.y);
    r.y += 13;
    r.paragraph(buildExecutiveReading(intel).paragraph, 9, 13.5);

    // ══ 2. Clubes y proyectos postulados (página nueva) ═══════════════
    r.newPage();
    const subs = [...(input.submissions || [])].sort((a, b) =>
        String(a.clubName || '').localeCompare(String(b.clubName || ''), 'es') ||
        String(a.projectName || '').localeCompare(String(b.projectName || ''), 'es'));
    // Agrupación por club: cada club queda representado una vez, con todos
    // sus proyectos debajo. Sin confusión cuando hay más de uno.
    const groups = new Map<string, ReportSubmission[]>();
    subs.forEach(s => {
        const key = `${s.clubName || 'Sin club'}|${s.district || ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(s);
    });

    r.sectionTitle('2', 'Clubes y proyectos postulados');
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
    r.ensure(16);
    const clubCount = groups.size;
    doc.text(
        `${fmtNum(subs.length)} ${subs.length === 1 ? 'postulación' : 'postulaciones'} · ` +
        `${fmtNum(clubCount)} ${clubCount === 1 ? 'club' : 'clubes'} · ordenado por club`,
        M, r.y);
    r.y += 14;

    if (!subs.length) {
        r.note('Aún no hay postulaciones registradas en esta edición.');
    } else {
        // Geometría de la tabla (ancho total = CONTENT_W, sin invasiones).
        const W_REF = 54, W_EST = 104, W_PAGO = 82;
        const W_PROJ = CONTENT_W - W_REF - W_EST - W_PAGO;
        const PROJ_LH = 11;
        const ROW_PAD = 11;

        const drawHead = () => {
            const d = doc;
            d.setFillColor(...BLUE);
            (d as any).roundedRect(M, r.y, CONTENT_W, 18, 3, 3, 'F');
            d.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(255, 255, 255);
            let x = M + 7;
            d.text('REF', x, r.y + 12); x += W_REF;
            d.text('PROYECTO', x, r.y + 12); x += W_PROJ;
            d.text('ESTADO', x + (W_EST - d.getTextWidth('ESTADO')) / 2, r.y + 12); x += W_EST;
            d.text('PAGO', x + (W_PAGO - d.getTextWidth('PAGO')) / 2, r.y + 12);
            r.y += 18 + 3;
        };
        const drawBand = (club: string, district: string, n: number, continued: boolean) => {
            const d = doc;
            const h = 20;
            d.setFillColor(...BAND_BG);
            (d as any).roundedRect(M, r.y, CONTENT_W, h, 3, 3, 'F');
            d.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
            const left = `${club}${continued ? ' (cont.)' : ''}`;
            d.text(d.splitTextToSize(left, CONTENT_W - 190)[0] || left, M + 8, r.y + 13);
            d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
            const right = `${district}${district ? ' · ' : ''}${n} ${n === 1 ? 'proyecto' : 'proyectos'}`;
            d.text(right.slice(0, 60), M + CONTENT_W - 8, r.y + 13, { align: 'right' } as any);
            r.y += h + 2;
        };
        // El encabezado se dibuja una vez por página (no por club): se repite
        // solo al continuar la tabla en página nueva. Se detecta por número
        // de página para no depender de quién provocó el salto.
        let needHead = true;
        let headPage = 0;
        const syncHead = () => { if (doc.getNumberOfPages() !== headPage) needHead = true; };
        const ensureHead = () => {
            syncHead();
            if (needHead) { r.ensure(21); syncHead(); drawHead(); needHead = false; headPage = doc.getNumberOfPages(); }
        };

        let firstBand = true;
        for (const [key, rows] of groups) {
            const [club, district] = key.split('|');
            // Banda + primera fila deben caber juntos: la banda nunca queda
            // sola al final de una página.
            const first = rows[0];
            const firstLines: string[] = doc.splitTextToSize(String(first.projectName || '—'), W_PROJ - 12);
            const firstH = Math.max(firstLines.length * PROJ_LH, 16) + ROW_PAD;
            r.ensure(20 + 2 + 21 + firstH);
            syncHead();
            if (!firstBand) r.gap(4);
            drawBand(club, district, rows.length, false);
            firstBand = false;
            ensureHead();

            rows.forEach((s) => {
                const d = doc;
                d.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
                const projLines: string[] = d.splitTextToSize(String(s.projectName || '—'), W_PROJ - 12);
                const h = Math.max(projLines.length * PROJ_LH, 16) + ROW_PAD;
                // La fila viaja completa o no viaja: si no cabe, página nueva
                // con banda del club y encabezado repetidos.
                if (r.y + h > FOOT_Y - 14) {
                    r.newPage();
                    drawBand(club, district, rows.length, true);
                    needHead = true;
                    ensureHead();
                }
                let x = M + 7;
                d.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...MUTED);
                d.text(String(s.publicRef || '—').slice(0, 12), x, r.y + 7);
                x += W_REF;
                d.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
                projLines.forEach((ln: string, li: number) => d.text(ln, x, r.y + 7 + li * PROJ_LH));
                const cy = r.y + h / 2 + 1;
                const wb = wfBadge(s.workflowStatus, input.catalog);
                r.badge(x + W_PROJ, cy, W_EST, wb.label.slice(0, 26), wb.tone);
                const pb = payBadge(s.paymentStatus, input.catalog);
                r.badge(x + W_PROJ + W_EST, cy, W_PAGO, pb.label.slice(0, 18), pb.tone);
                d.setDrawColor(...LINE);
                d.line(M, r.y + h - 1, M + CONTENT_W, r.y + h - 1);
                r.y += h;
            });
        }
    }

    // ══ Footer discreto + paginación ══════════════════════════════════
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor(...LINE).line(M, FOOT_Y, M + CONTENT_W, FOOT_Y);
        doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
        doc.text(footerText.slice(0, 100), M, FOOT_Y + 13);
        doc.text(`Página ${p} de ${pages}`, M + CONTENT_W, FOOT_Y + 13, { align: 'right' } as any);
    }

    if (options?.returnBytes) {
        const bytes = doc.output('arraybuffer') as ArrayBuffer;
        return { bytes, pages };
    }
    const safeName = 'informe-ejecutivo-postulacion-proyectos.pdf';
    doc.save(safeName);
}
