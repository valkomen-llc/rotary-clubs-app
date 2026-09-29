/**
 * Informe Ejecutivo de Gestión de Eventos — generador PDF (v4.1130).
 *
 * Reutiliza el sistema base de `executiveReportPdf.ts` (el mismo de
 * Postulación de Proyectos: identidad, cabecera con logo, KPIs, paginación,
 * badges, footer). Aquí sólo van el dataset, los KPIs, la lectura y la tabla
 * propios de inscripciones a eventos. No se duplica ninguna plantilla.
 *
 * Fuente de datos: GET /event-registrations/admin/dashboard (KPIs del
 * tablero, con el MISMO rango from/to del informe) + GET
 * /event-registrations/admin/list (tabla, mismo rango). Sin cifras
 * hardcodeadas; el recaudo nunca mezcla monedas.
 */
import {
    BLUE, INK, MUTED, LINE,
    PAGE_W, CONTENT_W, FOOT_Y, M,
    Doc, ExecutiveReport, ExecutiveLogo, BrandingLike, kpiGrid,
    renderExecutiveHeader, finishExecutiveReport,
    loadJsPdf, resolveExecutiveLogo, fmtNum, fmtDateShort,
} from './executiveReportPdf';
import { money, statusMeta } from './eventRegistrationSpec';

export interface EventReportRegistration {
    firstName?: string; lastName?: string; email?: string;
    clubName?: string; district?: string; country?: string;
    categoryLabel?: string; categoryKey?: string;
    status?: string; checkedInAt?: string | null;
    createdAt?: string;
}

export interface EventReportDashboard {
    totals?: {
        registrations?: number; companions?: number; people?: number;
        settled?: number; pending?: number; failed?: number;
        refunded?: number; waitlist?: number; accredited?: number;
        countries?: number; districts?: number; clubs?: number;
    } | null;
    byCurrency?: { currency?: string; base?: number; charged?: number; chargeCurrency?: string; total?: number }[] | null;
    period?: { from?: string | null; to?: string | null } | null;
}

export interface EventReportEvent {
    title?: string; location?: string | null;
    startDate?: string | null; endDate?: string | null;
}

export interface EventReportInput {
    event: EventReportEvent;
    /** Rango analizado (eco del servidor: `dashboard.period`). */
    period: { from?: string | null; to?: string | null } | null;
    dashboard: EventReportDashboard;
    registrations: EventReportRegistration[];
    branding?: BrandingLike | null;
    generatedAt?: string;
}

function fullName(r: EventReportRegistration): string {
    return `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—';
}

/** Tono del badge de pago según el estado real de la inscripción. */
function payTone(status?: string): string {
    switch (String(status || '')) {
        case 'paid': case 'confirmed': case 'accredited': case 'attended':
            return 'green';
        case 'pending_payment':
            return 'amber';
        case 'payment_failed':
            return 'red';
        case 'waitlist':
            return 'blue';
        default:
            return 'slate';
    }
}

/** Lectura ejecutiva dinámica: sólo datos reales del tablero. */
export function buildEventReading(d: EventReportDashboard, eventTitle: string): string {
    const t = d.totals || {};
    const n = (v?: number) => fmtNum(v || 0);
    const parts = [
        `El evento ${eventTitle} registra ${n(t.registrations)} ${t.registrations === 1 ? 'inscripción' : 'inscripciones'} ` +
        `correspondientes a ${n(t.clubs)} ${t.clubs === 1 ? 'club' : 'clubes'}, ` +
        `${n(t.districts)} ${t.districts === 1 ? 'distrito' : 'distritos'} y ${n(t.countries)} ${t.countries === 1 ? 'país' : 'países'}.`,
        `Del total, ${n(t.settled)} ${t.settled === 1 ? 'cuenta' : 'cuentan'} con pago confirmado y ${n(t.pending)} ` +
        `${t.pending === 1 ? 'permanece' : 'permanecen'} pendiente.`,
    ];
    if ((t.companions || 0) > 0 || (t.accredited || 0) > 0) {
        parts.push(`Se registran ${n(t.companions)} ${t.companions === 1 ? 'acompañante' : 'acompañantes'} y ` +
            `${n(t.accredited)} ${t.accredited === 1 ? 'persona acreditada' : 'personas acreditadas'}.`);
    }
    const coins = (d.byCurrency || []).filter(c => Number(c.base) > 0 || (c.total || 0) > 0);
    if (coins.length) {
        parts.push('El recaudo por moneda asciende a ' +
            coins.map(c => `${money(Number(c.base) || 0, String(c.currency || 'USD'))} (${n(c.total)} ${c.total === 1 ? 'inscripción' : 'inscripciones'})`).join(' y ') +
            ', sin mezclar monedas.');
    } else if ((t.refunded || 0) > 0) {
        parts.push(`Se registran ${n(t.refunded)} ${t.refunded === 1 ? 'reembolso' : 'reembolsos'}.`);
    }
    return parts.join(' ');
}

export async function generateEventReportPdf(
    input: EventReportInput,
    options?: { returnBytes?: boolean },
): Promise<{ bytes: ArrayBuffer; pages: number } | void> {
    const JsPDF = await loadJsPdf();

    const doc: Doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
    const t = input.dashboard?.totals || {};
    const eventTitle = String(input.event?.title || 'Evento').slice(0, 90);
    const place = String(input.event?.location || '').trim();
    const subtitle = place ? `${eventTitle} – ${place}`.slice(0, 110) : eventTitle;
    const footerText = `${eventTitle} · Informe ejecutivo`;
    const r = new ExecutiveReport(doc, footerText);

    const genDate = input.generatedAt
        ? new Date(input.generatedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    const genTime = (input.generatedAt ? new Date(input.generatedAt) : new Date())
        .toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const periodo = input.period?.from && input.period?.to
        ? `${fmtDateShort(input.period.from)} – ${fmtDateShort(input.period.to)}`
        : input.period?.from ? `Desde ${fmtDateShort(input.period.from)}`
        : input.period?.to ? `Hasta ${fmtDateShort(input.period.to)}`
        : 'Período completo del evento';

    // ══ PÁGINA 1 — Cabecera institucional (motor compartido) ══════════
    const { logo } = await resolveExecutiveLogo(input.branding, '[informe-evento]');
    await renderExecutiveHeader(doc, r, {
        logo,
        eyebrow: 'INFORME EJECUTIVO',
        title: 'Gestión de Eventos',
        subtitle,
        meta: `Período analizado: ${periodo}   ·   Generado: ${genDate} ${genTime}`,
    });

    // ══ 1. Resumen ejecutivo ══════════════════════════════════════════
    r.sectionTitle('1', 'Resumen ejecutivo');
    const cards: { label: string; value: string; sub?: string }[] = [
        { label: 'Inscripciones', value: fmtNum(t.registrations) },
        { label: 'Pagos confirmados', value: fmtNum(t.settled) },
        { label: 'Pendientes de pago', value: fmtNum(t.pending) },
        { label: 'Acompañantes', value: fmtNum(t.companions) },
        { label: 'Acreditados', value: fmtNum(t.accredited) },
        { label: 'Países representados', value: fmtNum(t.countries) },
        { label: 'Distritos participantes', value: fmtNum(t.districts) },
        { label: 'Clubes participantes', value: fmtNum(t.clubs) },
        { label: 'Reembolsos', value: fmtNum(t.refunded) },
    ];
    // Recaudo separado por moneda: nunca se suman COP con USD.
    (input.dashboard?.byCurrency || []).forEach(c => {
        const cur = String(c.currency || 'USD').toUpperCase();
        cards.push({
            label: `Recaudo (${cur})`,
            value: money(Number(c.base) || 0, cur).slice(0, 20),
            sub: `${fmtNum(c.total)} inscripción(es)`,
        });
    });
    kpiGrid(r, cards);

    // ══ Lectura ejecutiva — datos reales ══════════════════════════════
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BLUE);
    r.ensure(60);
    doc.text('LECTURA EJECUTIVA', M, r.y);
    r.y += 13;
    r.paragraph(buildEventReading(input.dashboard, eventTitle), 9, 13.5);

    // ══ 2. Inscripciones del período (página nueva) ═══════════════════
    r.newPage();
    const rows = [...(input.registrations || [])].sort((a, b) =>
        String(a.lastName || '').localeCompare(String(b.lastName || ''), 'es') ||
        String(a.firstName || '').localeCompare(String(b.firstName || ''), 'es'));

    r.sectionTitle('2', 'Inscripciones del período');
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
    r.ensure(16);
    const clubCount = new Set(rows.map(x => String(x.clubName || '').toLowerCase()).filter(Boolean)).size;
    doc.text(
        `${fmtNum(rows.length)} ${rows.length === 1 ? 'inscripción' : 'inscripciones'} · ` +
        `${fmtNum(clubCount)} ${clubCount === 1 ? 'club' : 'clubes'} · ordenado por apellido`,
        M, r.y);
    r.y += 14;

    if (!rows.length) {
        r.note('Aún no hay inscripciones registradas en este período.');
    } else {
        // Geometría de la tabla (ancho total = CONTENT_W, sin invasiones).
        const W_PART = 140, W_CLUB = 88, W_DIST = 46, W_PAIS = 58, W_CAT = 52, W_PAGO = 62;
        const W_ACRED = CONTENT_W - W_PART - W_CLUB - W_DIST - W_PAIS - W_CAT - W_PAGO;
        const LH = 11;
        const ROW_PAD = 11;

        const drawHead = () => {
            const d = doc;
            d.setFillColor(...BLUE);
            (d as any).roundedRect(M, r.y, CONTENT_W, 18, 3, 3, 'F');
            d.setFont('helvetica', 'bold').setFontSize(7).setTextColor(255, 255, 255);
            let x = M + 7;
            d.text('PARTICIPANTE', x, r.y + 12); x += W_PART;
            d.text('CLUB', x, r.y + 12); x += W_CLUB;
            d.text('DISTRITO', x, r.y + 12); x += W_DIST;
            d.text('PAÍS', x, r.y + 12); x += W_PAIS;
            d.text('CATEGORÍA', x, r.y + 12); x += W_CAT;
            d.text('PAGO', x + (W_PAGO - d.getTextWidth('PAGO')) / 2, r.y + 12); x += W_PAGO;
            d.text('ACRED.', x + (W_ACRED - d.getTextWidth('ACRED.')) / 2, r.y + 12);
            r.y += 18 + 3;
        };
        let needHead = true;
        let headPage = 0;
        const syncHead = () => { if (doc.getNumberOfPages() !== headPage) needHead = true; };
        const ensureHead = () => {
            syncHead();
            if (needHead) { r.ensure(21); syncHead(); drawHead(); needHead = false; headPage = doc.getNumberOfPages(); }
        };
        ensureHead();

        rows.forEach((s) => {
            const d = doc;
            const nameLines: string[] = d.splitTextToSize(fullName(s), W_PART - 12);
            const clubLines: string[] = d.splitTextToSize(String(s.clubName || '—'), W_CLUB - 12);
            const catLines: string[] = d.splitTextToSize(String(s.categoryLabel || s.categoryKey || '—'), W_CAT - 12);
            const maxLines = Math.max(nameLines.length, clubLines.length, catLines.length, 1);
            const h = Math.max(Math.min(maxLines, 3) * LH, 16) + ROW_PAD;
            // La fila viaja completa o no viaja: si no cabe, página nueva con
            // encabezado repetido.
            if (r.y + h > FOOT_Y - 14) {
                r.newPage();
                needHead = true;
                ensureHead();
            }
            let x = M + 7;
            d.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
            nameLines.slice(0, 3).forEach((ln: string, li: number) => d.text(ln, x, r.y + 7 + li * LH));
            x += W_PART;
            d.setFontSize(8);
            clubLines.slice(0, 3).forEach((ln: string, li: number) => d.text(ln, x, r.y + 7 + li * LH));
            x += W_CLUB;
            d.text(String(s.district || '—').slice(0, 10), x, r.y + 7);
            x += W_DIST;
            d.text(String(s.country || '—').slice(0, 14), x, r.y + 7);
            x += W_PAIS;
            catLines.slice(0, 3).forEach((ln: string, li: number) => d.text(ln, x, r.y + 7 + li * LH));
            x += W_CAT;
            const cy = r.y + h / 2 + 1;
            const meta = statusMeta(String(s.status || ''));
            r.badge(x, cy, W_PAGO, String(meta.label).slice(0, 18), payTone(s.status));
            r.badge(x + W_PAGO, cy, W_ACRED, s.checkedInAt ? 'Sí' : 'No', s.checkedInAt ? 'green' : 'slate');
            d.setDrawColor(...LINE);
            d.line(M, r.y + h - 1, M + CONTENT_W, r.y + h - 1);
            r.y += h;
        });
    }

    // ══ Footer discreto + paginación (motor compartido) ═══════════════
    const pages = finishExecutiveReport(doc, r, footerText);

    if (options?.returnBytes) {
        const bytes = doc.output('arraybuffer') as ArrayBuffer;
        return { bytes, pages };
    }
    doc.save('informe-ejecutivo-gestion-evento.pdf');
}

export type { ExecutiveLogo, BrandingLike };
