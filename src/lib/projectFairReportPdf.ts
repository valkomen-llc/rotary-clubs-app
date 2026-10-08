/**
 * Informe Ejecutivo de Postulación de Proyectos — generador PDF (v4.1130).
 *
 * Diseño compacto e institucional, máximo 2–3 páginas A4:
 *   Página 1 ......... cabecera blanca + Resumen Ejecutivo (KPIs + lectura).
 *   Páginas 2 (–3) .... Clubes y Proyectos Postulados (tabla agrupada por club).
 *
 * NO incluye secciones analíticas (embudo, finanzas, alertas, evolución,
 * matrices): esa información vive en el Centro de Inteligencia; el PDF lo
 * complementa, no lo replica.
 *
 * Arquitectura: el sistema base (identidad, cabecera con logo, KPIs,
 * paginación, badges, footer) vive en `executiveReportPdf.ts` y se comparte
 * con Gestión de Eventos. Aquí sólo quedan el dataset, los KPIs, la lectura
 * y la tabla propios de Postulación. Sin valores hardcodeados: fuente única
 * GET /project-fair/admin/inteligencia (los mismos KPIs del Centro).
 */
import {
    IntelligenceData, fmtCop, fmtUsd, fmtNum, fmtPct, fmtDateShort,
    buildExecutiveReading, editionSubtitle,
} from './projectFairAnalytics';
import {
    BLUE, GOLD, INK, MUTED, LINE, BAND_BG,
    PAGE_W, CONTENT_W, FOOT_Y, M,
    RGB, Doc, ExecutiveReport, kpiGrid,
    renderExecutiveHeader, finishExecutiveReport,
    loadJsPdf, resolveExecutiveLogo,
} from './executiveReportPdf';

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

export interface ReportInput {
    intelligence: IntelligenceData;
    alerts?: ReportAlerts | null;
    submissions: ReportSubmission[];
    catalog?: ReportCatalog | null;
    generatedAt?: string;
}

export async function generateProjectFairReportPdf(
    input: ReportInput,
    options?: { returnBytes?: boolean; fileName?: string },
): Promise<{ bytes: ArrayBuffer; pages: number } | void> {
    const JsPDF = await loadJsPdf();

    const intel = input.intelligence;
    const k = intel.kpis;
    const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
    const subtitle = editionSubtitle(intel);
    const footerText = subtitle;
    const r = new ExecutiveReport(doc, footerText);
    const genDate = input.generatedAt
        ? new Date(input.generatedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    const periodo = k.periodStart && k.periodEnd
        ? `${fmtDateShort(k.periodStart)} – ${fmtDateShort(k.periodEnd)}`
        : k.periodStart ? `Desde ${fmtDateShort(k.periodStart)}` : 'Todo el período disponible';

    // ══ PÁGINA 1 — Cabecera institucional (motor compartido) ══════════
    const { logo } = await resolveExecutiveLogo(intel.branding, '[informe-ejecutivo]');
    await renderExecutiveHeader(doc, r, {
        logo,
        eyebrow: 'INFORME EJECUTIVO',
        title: 'Postulación de Proyectos',
        subtitle,
        meta: `Generado: ${genDate}   ·   Período analizado: ${periodo}`,
    });

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

    // ══ Footer discreto + paginación (motor compartido) ═══════════════
    const pages = finishExecutiveReport(doc, r, footerText);

    if (options?.returnBytes) {
        const bytes = doc.output('arraybuffer') as ArrayBuffer;
        return { bytes, pages };
    }
    const today = new Date().toISOString().slice(0, 10);
    const safeName = options?.fileName || `feria-proyectos-postulaciones-${today}.pdf`;
    doc.save(safeName);
}
