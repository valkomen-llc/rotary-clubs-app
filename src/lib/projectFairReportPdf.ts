/**
 * Informe Ejecutivo de Postulación de Proyectos — generador PDF (v4.1125).
 *
 * Arquitectura: jsPDF vectorial 100% determinista (A4 vertical, pt). NO usa
 * window.print() ni html2canvas: el documento sale idéntico sin importar
 * pantalla, navegador, zoom o resolución.
 *
 * Fuente única de datos: la respuesta de GET /project-fair/admin/inteligencia
 * (los mismos KPIs del Centro de Inteligencia) + alertas + listado completo.
 * La interpretación (lectura ejecutiva, conclusiones) sale de
 * `projectFairAnalytics.ts`, compartida con el dashboard.
 */
import {
    IntelligenceData, fmtCop, fmtUsd, fmtNum, fmtPct, fmtDateShort,
    buildExecutiveReading, buildWorkflowMatrix, buildConclusions,
    hasTimeline, editionTitle, editionPlace, pickLogoUrl,
    WORKFLOW_LABELS, PAYMENT_LABELS,
} from './projectFairAnalytics';

export interface ReportAlerts {
    alerts: { key: string; label: string; severity: string; items: any[]; count: number }[];
    total: number;
}
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

// ── Identidad ─────────────────────────────────────────────────────────
const BLUE: [number, number, number] = [23, 69, 143];
const GOLD: [number, number, number] = [247, 168, 27];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const BG_CARD: [number, number, number] = [248, 250, 252];

const PAGE_W = 595;
const PAGE_H = 842;
const M = 40;
const CONTENT_W = PAGE_W - M * 2;

const wfLabel = (key: string | undefined, catalog?: ReportCatalog) =>
    catalog?.workflowStates?.find(s => s.key === key)?.label
    || (key ? WORKFLOW_LABELS[key] || key : '—');
const payLabel = (key: string | undefined, catalog?: ReportCatalog) =>
    catalog?.paymentStates?.find(s => s.key === key)?.label
    || (key ? PAYMENT_LABELS[key] || key : '—');

async function loadImageDataUrl(url: string | null): Promise<{ data: string; format: string } | null> {
    if (!url) return null;
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) return null;
        const data: string = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
        const format = blob.type.includes('png') ? 'PNG' : blob.type.includes('webp') ? 'WEBP' : 'JPEG';
        return { data, format };
    } catch { return null; }
}

type Doc = any;

class Report {
    doc: Doc;
    y = 0;
    firstPage = true;
    sectionN = 0;
    constructor(doc: Doc) { this.doc = doc; }

    newPage(inner: boolean, editionShort: string) {
        this.doc.addPage();
        this.y = inner ? 62 : M;
        if (inner) this.innerHeader(editionShort);
        this.firstPage = false;
    }
    ensure(h: number, editionShort: string) {
        if (this.y + h > PAGE_H - 52) this.newPage(true, editionShort);
    }
    innerHeader(editionShort: string) {
        const d = this.doc;
        d.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
        d.text(editionShort, M, 34);
        d.setDrawColor(...LINE).line(M, 42, PAGE_W - M, 42);
    }
    sectionTitle(title: string, subtitle?: string, editionShort = '') {
        this.ensure(subtitle ? 52 : 38, editionShort);
        // Evitar título huérfano: si no caben al menos 60pt de contenido, saltar página.
        if (this.y + 100 > PAGE_H - 52) this.newPage(true, editionShort);
        const d = this.doc;
        this.sectionN += 1;
        d.setFillColor(...BLUE);
        d.rect(M, this.y, 3, 16, 'F');
        d.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BLUE);
        d.text(`${this.sectionN}.  ${title.toUpperCase()}`, M + 10, this.y + 12);
        this.y += 20;
        if (subtitle) {
            d.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
            d.text(subtitle, M + 10, this.y);
            this.y += 12;
        } else this.y += 2;
    }
    paragraph(text: string, size = 8.5, maxW = CONTENT_W) {
        const d = this.doc;
        d.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...INK);
        const lines: string[] = d.splitTextToSize(text, maxW);
        lines.forEach((ln: string) => {
            this.ensure(size + 5, '');
            d.text(ln, M, this.y);
            this.y += size + 4.5;
        });
        this.y += 4;
    }
    bullet(label: string, detail: string) {
        const d = this.doc;
        d.setFillColor(...BLUE);
        const lines: string[] = d.splitTextToSize(`${label}: ${detail}`, CONTENT_W - 14);
        this.ensure(lines.length * 12 + 8, '');
        lines.forEach((ln: string, i: number) => {
            if (i === 0) { d.circle(M + 3, this.y - 3, 2, 'F'); }
            d.setFont('helvetica', i === 0 ? 'bold' : 'normal').setFontSize(8.5).setTextColor(...INK);
            d.text(ln, M + 12, this.y);
            this.y += 12;
        });
        this.y += 2;
    }
    note(text: string) {
        const d = this.doc;
        const lines: string[] = d.splitTextToSize(text, CONTENT_W - 20);
        this.ensure(lines.length * 11 + 18, '');
        const h = lines.length * 11 + 14;
        d.setFillColor(255, 251, 235);
        d.setDrawColor(253, 224, 71);
        (d as any).roundedRect(M, this.y, CONTENT_W, h, 4, 4, 'FD');
        d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(120, 90, 20);
        lines.forEach((ln: string, i: number) => d.text(ln, M + 10, this.y + 14 + i * 11));
        this.y += h + 10;
    }
    hbar(label: string, count: number, rate: number, maxCount: number, editionShort: string, valueRight?: string) {
        const d = this.doc;
        this.ensure(30, editionShort);
        const labelW = 150;
        d.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK);
        const lab: string[] = d.splitTextToSize(label, labelW - 4);
        d.text(lab[0] || label, M, this.y + 10);
        if (lab.length > 1) { d.setFontSize(7).setTextColor(...MUTED); d.text(lab.slice(1).join(' ').slice(0, 40), M, this.y + 20); }
        const bx = M + labelW;
        const bw = CONTENT_W - labelW - 76;
        const w = maxCount > 0 ? Math.max(count > 0 ? 14 : 0, (count / maxCount) * bw) : 0;
        d.setFillColor(241, 245, 249);
        (d as any).roundedRect(bx, this.y, bw, 15, 4, 4, 'F');
        if (w > 0) {
            d.setFillColor(...BLUE);
            (d as any).roundedRect(bx, this.y, Math.min(w, bw), 15, 4, 4, 'F');
            d.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(255, 255, 255);
            d.text(fmtNum(count), bx + Math.min(w, bw) - 6, this.y + 10.5, { align: 'right' } as any);
        }
        d.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTED);
        d.text(valueRight ?? `${fmtPct(rate)}`, bx + bw + 8, this.y + 10.5);
        this.y += 24;
    }
}

function kpiCards(r: Report, cards: { label: string; value: string; sub?: string }[], editionShort: string) {
    const d = r.doc;
    const cols = 4;
    const gap = 8;
    const cw = (CONTENT_W - gap * (cols - 1)) / cols;
    let x = M;
    let rowY = r.y;
    cards.forEach((c, i) => {
        const col = i % cols;
        if (col === 0 && i > 0) { rowY += 62; x = M; }
        else if (i > 0) x += cw + gap;
        if (rowY + 56 > PAGE_H - 52) {
            r.newPage(true, editionShort);
            rowY = r.y; x = M;
        }
        x = M + col * (cw + gap);
        d.setFillColor(...BG_CARD);
        d.setDrawColor(...LINE);
        (d as any).roundedRect(x, rowY, cw, 54, 5, 5, 'FD');
        d.setFillColor(...GOLD);
        d.rect(x, rowY, cw, 3, 'F');
        d.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...MUTED);
        const lab: string[] = d.splitTextToSize(c.label.toUpperCase(), cw - 12);
        d.text(lab.slice(0, 2), x + 6, rowY + 14);
        d.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
        d.text(String(c.value).slice(0, 22), x + 6, rowY + 32);
        if (c.sub) {
            d.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...MUTED);
            d.text(String(c.sub).slice(0, 40), x + 6, rowY + 44);
        }
    });
    r.y = rowY + 62;
}

function drawLineChart(r: Report, days: string[], s1: number[], l1: string, s2: number[] | null, l2: string | null, fmt: (v: number) => string, editionShort: string) {
    const d = r.doc;
    const H = 150;
    r.ensure(H + 40, editionShort);
    const gx = M + 44;
    const gw = CONTENT_W - 54;
    const gy = r.y + 12;
    const gh = H - 30;
    const max = Math.max(1, ...s1, ...(s2 || []));
    d.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    for (let g = 0; g <= 4; g++) {
        const v = (max * g) / 4;
        const yy = gy + gh - (gh * g) / 4;
        d.setDrawColor(...LINE).line(gx, yy, gx + gw, yy);
        d.text(fmt(v), M, yy + 2.5);
    }
    const X = (i: number) => gx + (gw * (i + 0.5)) / Math.max(1, days.length);
    const Y = (v: number) => gy + gh - (gh * v) / max;
    const line = (s: number[], color: [number, number, number]) => {
        d.setDrawColor(...color).setLineWidth(1.4);
        s.forEach((v, i) => {
            if (i > 0) d.line(X(i - 1), Y(s[i - 1]), X(i), Y(v));
        });
        d.setFillColor(...color);
        s.forEach((v, i) => d.circle(X(i), Y(v), 1.6, 'F'));
        d.setLineWidth(0.5);
    };
    line(s1, BLUE);
    if (s2) line(s2, GOLD);
    d.setFontSize(6.5);
    const step = Math.max(1, Math.ceil(days.length / 8));
    days.forEach((day, i) => {
        if (i % step === 0) d.text(String(day).slice(5), X(i) - 12, gy + gh + 12);
    });
    // Leyenda
    d.setFillColor(...BLUE); d.circle(M + 44, r.y + H + 8, 2.5, 'F');
    d.setTextColor(...INK).setFontSize(7.5); d.text(l1, M + 52, r.y + H + 10.5);
    if (s2 && l2) {
        d.setFillColor(...GOLD); d.circle(M + 150, r.y + H + 8, 2.5, 'F');
        d.text(l2, M + 158, r.y + H + 10.5);
    }
    r.y += H + 22;
}

export interface ReportInput {
    intelligence: IntelligenceData;
    alerts?: ReportAlerts | null;
    submissions: ReportSubmission[];
    catalog?: ReportCatalog | null;
    generatedAt?: string;
}

export async function generateProjectFairReportPdf(input: ReportInput): Promise<void> {
    const mod: any = await import('jspdf');
    // Interop robusta: según el empaquetado, el constructor puede venir como
    // nombrado (`jsPDF`) o como `default` (en Node `default` es un objeto y el
    // constructor va en `jsPDF`; en navegador suele ser al revés). Se elige el
    // primero que sea realmente una función.
    const JsPDF = [mod?.jsPDF, mod?.default].find((v: any) => typeof v === 'function') || (mod?.default as any)?.jsPDF;
    if (typeof JsPDF !== 'function') throw new Error('No se pudo cargar el generador PDF.');
    const intel = input.intelligence;
    const k = intel.kpis;
    const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
    const r = new Report(doc);
    const edition = editionTitle(intel);
    const place = editionPlace(intel);
    const editionShort = `${edition} · ${place} ${intel.edition?.year || ''}`.trim();
    const genDate = input.generatedAt
        ? new Date(input.generatedAt).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
        : new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
    const periodo = k.periodStart && k.periodEnd
        ? `${fmtDateShort(k.periodStart)} — ${fmtDateShort(k.periodEnd)}`
        : k.periodStart ? `Desde ${fmtDateShort(k.periodStart)}` : 'Todo el período disponible';

    // ── Portada / cabecera institucional ─────────────────────────────
    doc.setFillColor(...BLUE);
    doc.rect(0, 0, PAGE_W, 150, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 150, PAGE_W, 4, 'F');
    const logo = await loadImageDataUrl(pickLogoUrl(intel));
    let tx = M;
    if (logo) {
        try {
            doc.addImage(logo.data, logo.format as any, M, 22, 110, 60, undefined, 'FAST');
            tx = M + 126;
        } catch { /* cabecera tipográfica */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold').setFontSize(9);
    doc.text('INFORME EJECUTIVO', tx, 40);
    doc.setFontSize(16);
    const titleLines: string[] = doc.splitTextToSize('Postulación de Proyectos', PAGE_W - tx - M);
    doc.text(titleLines, tx, 60);
    doc.setFont('helvetica', 'normal').setFontSize(9.5);
    doc.text(edition, tx, 60 + titleLines.length * 18);
    doc.setFontSize(8.5).setTextColor(200, 215, 235);
    const cityYear = [place, intel.edition?.year ? String(intel.edition.year) : ''].filter(Boolean).join(' · ');
    if (cityYear) doc.text(cityYear, tx, 60 + titleLines.length * 18 + 15);
    doc.setFontSize(7.5);
    doc.text(`Generado: ${genDate}`, tx, 60 + titleLines.length * 18 + 30);
    doc.text(`Período analizado: ${periodo}`, tx, 60 + titleLines.length * 18 + 42);
    r.y = 178;

    // ── 1. Resumen ejecutivo ─────────────────────────────────────────
    r.sectionTitle('Resumen ejecutivo', 'Cifras actuales de la edición — misma fuente que el Centro de Inteligencia.', editionShort);
    const cards: { label: string; value: string; sub?: string }[] = [
        { label: 'Postulaciones', value: fmtNum(k.total), sub: `${fmtNum(k.pendingReview)} pendientes de revisión` },
        { label: 'Pagadas', value: fmtNum(k.paid), sub: `Conversión ${fmtPct(k.conversionRate)}` },
        { label: 'Pendientes de pago', value: fmtNum(k.pending) },
        { label: 'Pagos fallidos', value: fmtNum(k.failed), sub: `${fmtNum(k.refunded)} reembolsados` },
    ];
    if (k.priceMode === 'USD') {
        cards.push({ label: 'Recaudo total', value: fmtUsd(k.totalUsd), sub: 'Dólares' });
    } else {
        cards.push({ label: 'Recaudo total', value: fmtCop(k.totalCop), sub: 'Pesos colombianos' });
        cards.push({ label: 'Cobrado en dólares', value: fmtUsd(k.totalUsd), sub: `TRM prom. ${fmtNum(Math.round(k.avgTrm))} COP/USD` });
    }
    cards.push({ label: 'Presupuesto de los proyectos', value: fmtUsd(k.totalBudget), sub: `Promedio ${fmtUsd(k.avgBudget)}` });
    cards.push({ label: 'Reembolsado', value: k.priceMode === 'USD' ? fmtUsd(k.totalRefunded) : fmtCop(k.totalRefunded) });
    cards.push({ label: 'Distritos participantes', value: fmtNum(k.districts) });
    cards.push({ label: 'Clubes participantes', value: fmtNum(k.clubs) });
    cards.push({ label: 'Países representados', value: fmtNum(k.countries) });
    if (k.priceMode !== 'USD') {
        cards.push({ label: 'TRM promedio aplicada', value: fmtNum(Math.round(k.avgTrm)), sub: 'COP por dólar' });
    }
    kpiCards(r, cards, editionShort);

    // Lectura ejecutiva del período
    const reading = buildExecutiveReading(intel);
    r.ensure(30, editionShort);
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BLUE);
    doc.text('LECTURA EJECUTIVA DEL PERÍODO', M, r.y);
    r.y += 14;
    r.paragraph(reading.paragraph);
    reading.bullets.forEach(b => r.bullet(b.label, b.detail));

    // ── 2. Embudo ────────────────────────────────────────────────────
    r.sectionTitle('Embudo de postulación', 'Cada etapa se mide sobre el total de formularios enviados. Sólo etapas registradas por el módulo.', editionShort);
    const funnel = intel.funnel || [];
    const maxF = Math.max(1, ...funnel.map(f => f.count || 0));
    funnel.forEach((f, i) => {
        const prev = i > 0 ? funnel[i - 1].count || 0 : null;
        const convTxt = prev != null && prev > 0 && i > 0
            ? `${fmtPct(f.rate)} · ${fmtPct((f.count / prev) * 100)} desde anterior`
            : fmtPct(f.rate);
        r.hbar(f.label, f.count, f.rate, maxF, editionShort, convTxt);
    });
    if (!funnel.length) r.note('Sin datos de embudo en esta edición.');

    // ── 3. Análisis financiero ───────────────────────────────────────
    r.sectionTitle('Análisis financiero', 'Dinero recaudado por inscripciones vs. presupuesto declarado de los proyectos (no se mezclan).', editionShort);
    const finCards = [
        { label: 'Recaudo COP', value: fmtCop(k.totalCop) },
        { label: 'Cobrado USD', value: fmtUsd(k.totalUsd) },
        { label: 'Pagos confirmados', value: fmtNum(k.paid) },
        { label: 'Ticket promedio', value: k.priceMode === 'USD' ? fmtUsd(k.ticketAvgUsd) : fmtCop(k.ticketAvgCop) },
    ];
    kpiCards(r, finCards, editionShort);
    // Estado de pagos
    const payRows = [
        { label: 'Pagados', count: k.paid, rate: pct(k.paid, k.total) },
        { label: 'Pendientes', count: k.pending, rate: pct(k.pending, k.total) },
        { label: 'Fallidos', count: k.failed, rate: pct(k.failed, k.total) },
        { label: 'Reembolsados', count: k.refunded, rate: pct(k.refunded, k.total) },
    ];
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
    r.ensure(20, editionShort);
    doc.text('Estado de pagos', M, r.y); r.y += 12;
    const maxP = Math.max(1, ...payRows.map(p => p.count));
    payRows.forEach(p => r.hbar(p.label, p.count, p.rate, maxP, editionShort));
    // Presupuesto agregado
    r.ensure(20, editionShort);
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
    doc.text('Presupuesto declarado de los proyectos (USD)', M, r.y); r.y += 6;
    r.paragraph(
        `Agregado ${fmtUsd(k.totalBudget)} · promedio ${fmtUsd(k.avgBudget)} por proyecto` +
        (k.minBudget != null && k.maxBudget != null ? ` · rango ${fmtUsd(k.minBudget)} — ${fmtUsd(k.maxBudget)}` : '') +
        `. El recaudo por inscripciones (${k.priceMode === 'USD' ? fmtUsd(k.totalUsd) + ' USD' : fmtCop(k.totalCop) + ' COP'}) es un concepto distinto y no se suma al presupuesto.`,
        8);
    if ((intel.topBudget || []).length > 0) {
        doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK);
        r.ensure(18, editionShort);
        doc.text('Proyectos con mayor presupuesto', M, r.y); r.y += 10;
        const top = [...intel.topBudget].slice(0, 6);
        const maxB = Math.max(1, ...top.map(t => t.budgetUsd || 0));
        top.forEach(t => r.hbar(
            `${t.projectName} · ${t.clubName}`,
            Math.round(t.budgetUsd || 0),
            pct(t.budgetUsd, maxB),
            maxB,
            editionShort,
            fmtUsd(t.budgetUsd),
        ));
    }
    // Recaudo acumulado en el tiempo
    if (hasTimeline(intel)) {
        const tl = intel.timeline;
        let acc = 0;
        const cum = tl.map(d => { acc += Number(d.totalAmount) || 0; return Math.round(acc * 100) / 100; });
        r.ensure(30, editionShort);
        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
        doc.text('Recaudo acumulado en el tiempo', M, r.y); r.y += 8;
        const moneyFmt = (v: number) => k.priceMode === 'USD'
            ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : `$${Number(v).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
        drawLineChart(r, tl.map(d => d.day), cum, 'Acumulado', tl.map(d => Number(d.totalAmount) || 0), 'Del día', moneyFmt, editionShort);
    } else {
        r.note('Sin histórico suficiente para el recaudo acumulado: se requieren al menos dos días con movimiento.');
    }

    // ── 4. Participación rotaria ─────────────────────────────────────
    r.sectionTitle('Participación rotaria', 'Clubes, distritos y países con proyectos postulados.', editionShort);
    const topClubs = [...(intel.byClub || [])].slice(0, 8);
    if (topClubs.length) {
        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
        r.ensure(18, editionShort);
        doc.text('Top clubes por postulaciones', M, r.y); r.y += 10;
        const mx = Math.max(1, ...topClubs.map(c => c.count));
        topClubs.forEach(c => r.hbar(c.key, c.count, pct(c.count, k.total), mx, editionShort, `${fmtNum(c.count)} · ${k.priceMode === 'USD' ? fmtUsd(c.totalAmount) : fmtCop(c.totalAmount)}`));
    }
    const byDist = intel.byDistrict || [];
    if (byDist.length) {
        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
        r.ensure(18, editionShort);
        doc.text('Distritos por participación', M, r.y); r.y += 10;
        const mx = Math.max(1, ...byDist.map(c => c.count));
        byDist.slice(0, 8).forEach(c => r.hbar(c.key, c.count, pct(c.count, k.total), mx, editionShort));
    }
    const geoParts: string[] = [];
    (intel.byCountry || []).slice(0, 6).forEach(c => geoParts.push(`${c.key}: ${fmtNum(c.count)}`));
    if (geoParts.length > 1 || (intel.byCountry || []).length > 1) {
        r.paragraph(`Distribución geográfica — ${geoParts.join(' · ')}.`);
    } else if ((intel.byDepartment || []).length > 1) {
        r.paragraph(`Por departamento — ${(intel.byDepartment || []).slice(0, 6).map(c => `${c.key}: ${fmtNum(c.count)}`).join(' · ')}.`);
    } else {
        r.note('Distribución geográfica concentrada en un solo origen: no se grafica un eje con una sola barra.');
    }

    // ── 5. Perfil de los proyectos ───────────────────────────────────
    const focus = (intel.byFocusArea || []).filter(f => f.count > 0);
    if (focus.length) {
        r.sectionTitle('Perfil de los proyectos', 'Áreas de interés realmente registradas en los formularios.', editionShort);
        const mx = Math.max(1, ...focus.map(f => f.count));
        focus.slice(0, 10).forEach(f => r.hbar(f.key, f.count, pct(f.count, k.total), mx, editionShort, `${fmtNum(f.count)} · ${fmtUsd(f.totalBudget)}`));
    }

    // ── 6. Estado de las postulaciones ───────────────────────────────
    r.sectionTitle('Estado de las postulaciones', 'Matriz ejecutiva con estados reales del modelo de datos.', editionShort);
    const matrix = buildWorkflowMatrix(intel);
    if (matrix.length) {
        const d = doc;
        const cols = [200, 70, 60, 145];
        r.ensure(30, editionShort);
        d.setFillColor(...BLUE);
        (d as any).roundedRect(M, r.y, CONTENT_W, 18, 3, 3, 'F');
        d.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(255, 255, 255);
        let cx = M + 8;
        ['ESTADO', 'CANTIDAD', '%', 'OBSERVACIÓN'].forEach((h, i) => { d.text(h, cx, r.y + 12); cx += cols[i]; });
        r.y += 22;
        matrix.forEach((row, idx) => {
            r.ensure(18, editionShort);
            if (idx % 2 === 0) { d.setFillColor(...BG_CARD); d.rect(M, r.y - 10, CONTENT_W, 17, 'F'); }
            d.setFont('helvetica', idx === 0 ? 'bold' : 'normal').setFontSize(8).setTextColor(...INK);
            let x2 = M + 8;
            d.text(row.estado.slice(0, 32), x2, r.y); x2 += cols[0];
            d.text(fmtNum(row.cantidad), x2, r.y); x2 += cols[1];
            d.text(fmtPct(row.pct), x2, r.y); x2 += cols[2];
            d.setFontSize(7).setTextColor(...MUTED);
            d.text(row.observacion.slice(0, 40), x2, r.y);
            r.y += 17;
        });
        r.y += 6;
        const need = (k.pendingReview || 0) + (k.needsChanges || 0) + (k.pending || 0);
        if (need > 0) r.paragraph(`${fmtNum(need)} postulación(es) requieren actualmente intervención o seguimiento.`);
    } else {
        r.note('Sin postulaciones para la matriz de estados.');
    }

    // ── 7. Alertas ───────────────────────────────────────────────────
    const al = input.alerts;
    if (al && al.total > 0) {
        r.sectionTitle('Alertas y pendientes', `Alertas reales del módulo (${fmtNum(al.total)} en total).`, editionShort);
        al.alerts.filter(a => a.count > 0).forEach(a => {
            const d = doc;
            r.ensure(24, editionShort);
            const sev: Record<string, [number, number, number]> = {
                danger: [220, 38, 38], warning: [217, 119, 6], info: [23, 69, 143],
            };
            const c = sev[a.severity] || MUTED;
            d.setFillColor(...c);
            d.circle(M + 4, r.y - 2.5, 3, 'F');
            d.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
            d.text(`${a.label} — ${fmtNum(a.count)}`, M + 12, r.y);
            r.y += 12;
            a.items.slice(0, 8).forEach((it: any) => {
                const ref = it.publicRef || it.refs?.join(', ') || it.email || '';
                const name = it.projectName || it.projects?.join(', ') || a.key;
                const club = it.clubName ? ` · ${it.clubName}` : '';
                const line = `• ${ref} — ${String(name).slice(0, 60)}${String(club).slice(0, 40)}`;
                d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...INK);
                const parts: string[] = d.splitTextToSize(line, CONTENT_W - 16);
                parts.slice(0, 2).forEach((ln: string) => { r.ensure(11, editionShort); d.text(ln, M + 12, r.y); r.y += 11; });
            });
            if (a.count > 8) {
                d.setFontSize(7).setTextColor(...MUTED);
                r.ensure(11, editionShort);
                d.text(`… y ${fmtNum(a.count - 8)} más (ver pestaña Alertas).`, M + 12, r.y); r.y += 12;
            }
            r.y += 4;
        });
    }

    // ── 8. Evolución temporal ────────────────────────────────────────
    if (hasTimeline(intel)) {
        r.sectionTitle('Evolución temporal', 'Postulaciones y pagos por día, con acumulado.', editionShort);
        const tl = intel.timeline;
        drawLineChart(r, tl.map(d => d.day), tl.map(d => d.total), 'Postulaciones', tl.map(d => d.paid), 'Pagadas', (v) => fmtNum(v), editionShort);
        const last = tl[tl.length - 1];
        r.paragraph(`Último movimiento registrado: ${fmtDateShort(last.day)} con ${fmtNum(last.total)} postulación(es) y ${fmtNum(last.paid)} pago(s). Total acumulado del período: ${fmtNum(tl.reduce((n, d) => n + d.total, 0))} postulaciones.`);
    }

    // ── 9. Tabla detallada ───────────────────────────────────────────
    r.sectionTitle('Detalle de postulaciones', `${fmtNum(input.submissions.length)} registro(s) incluidos en este informe.`, editionShort);
    {
        const d = doc;
        const widths = [52, 130, 100, 70, 55, 48, 60];
        const heads = ['REF', 'PROYECTO', 'CLUB', 'DISTRITO', 'PRESUP.', 'ESTADO', 'PAGO'];
        const drawHead = () => {
            d.setFillColor(...BLUE);
            (d as any).roundedRect(M, r.y, CONTENT_W, 18, 3, 3, 'F');
            d.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(255, 255, 255);
            let x = M + 5;
            heads.forEach((h, i) => { d.text(h, x, r.y + 12); x += widths[i]; });
            r.y += 22;
        };
        drawHead();
        const moneyShort = (s: ReportSubmission) =>
            s.budgetUsd != null ? `$${Number(s.budgetUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';
        input.submissions.forEach((s, idx) => {
            const proj = String(s.projectName || '—');
            const club = String(s.clubName || '—');
            const projLines: string[] = d.splitTextToSize(proj, widths[1] - 6);
            const clubLines: string[] = d.splitTextToSize(club, widths[2] - 6);
            const h = Math.max(1, projLines.length, clubLines.length) * 9.5 + 6;
            if (r.y + h > PAGE_H - 52) { r.newPage(true, editionShort); drawHead(); }
            if (idx % 2 === 0) { d.setFillColor(...BG_CARD); d.rect(M, r.y - 10, CONTENT_W, h, 'F'); }
            let x = M + 5;
            d.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(...INK);
            d.text(String(s.publicRef || '').slice(0, 10), x, r.y); x += widths[0];
            d.setFont('helvetica', 'normal');
            projLines.slice(0, 3).forEach((ln: string, li: number) => d.text(ln.slice(0, 42), x, r.y + li * 9.5));
            x += widths[1];
            clubLines.slice(0, 3).forEach((ln: string, li: number) => { d.setFontSize(6.8); d.text(ln.slice(0, 36), x, r.y + li * 9.5); });
            x += widths[2];
            d.setFontSize(6.5).setTextColor(...MUTED);
            d.text(String(s.district || '—').replace('Rotary ', '').slice(0, 16), x, r.y); x += widths[3];
            d.setFontSize(6.8).setTextColor(...INK);
            d.text(moneyShort(s), x, r.y); x += widths[4];
            d.setFontSize(6.5);
            d.text(wfLabel(s.workflowStatus, input.catalog || undefined).slice(0, 14), x, r.y); x += widths[5];
            d.text(payLabel(s.paymentStatus, input.catalog || undefined).slice(0, 12), x, r.y);
            r.y += h;
        });
        r.y += 6;
        doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
        r.ensure(12, editionShort);
        doc.text('Importes de presupuesto en USD según lo declarado en el formulario. El estado de pago refleja el cobro de la inscripción.', M, r.y);
        r.y += 12;
    }

    // ── Conclusiones ─────────────────────────────────────────────────
    r.sectionTitle('Conclusiones del proceso', 'Hallazgos basados exclusivamente en los datos del informe.', editionShort);
    buildConclusions(intel, al?.total || 0).forEach((c, i) => {
        const d = doc;
        r.ensure(30, editionShort);
        d.setFillColor(...BLUE);
        d.circle(M + 5, r.y - 3, 7, 'F');
        d.setFont('helvetica', 'bold').setFontSize(8).setTextColor(255, 255, 255);
        d.text(String(i + 1), M + 5, r.y, { align: 'center' } as any);
        d.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
        const lines: string[] = d.splitTextToSize(c, CONTENT_W - 24);
        lines.forEach((ln: string, li: number) => {
            if (li > 0) r.ensure(12, editionShort);
            d.text(ln, M + 18, r.y);
            r.y += 12;
        });
        r.y += 4;
    });

    // ── Paginación y pie ─────────────────────────────────────────────
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        if (p > 1) {
            doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
            doc.text(editionShort.slice(0, 90), M, 34);
            doc.setDrawColor(...LINE).line(M, 42, PAGE_W - M, 42);
        }
        doc.setDrawColor(...LINE).line(M, PAGE_H - 36, PAGE_W - M, PAGE_H - 36);
        doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
        doc.text('Informe Ejecutivo de Postulación de Proyectos', M, PAGE_H - 24);
        doc.text(`${genDate}`, M, PAGE_H - 14);
        doc.text(`Página ${p} de ${pages}`, PAGE_W - M, PAGE_H - 24, { align: 'right' } as any);
    }

    const safeName = `${String(edition).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().slice(0, 50) || 'informe'}-postulacion-proyectos.pdf`;
    doc.save(safeName);
}

const pct = (n?: number | null, d?: number | null) =>
    (d && d > 0 ? Math.round(((n || 0) / d) * 1000) / 10 : 0);
