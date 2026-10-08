/**
 * Informe Ejecutivo de Gestión de Eventos — generador PDF (v4.1130).
 *
 * Reutiliza el sistema base de `executiveReportPdf.ts` (el mismo de
 * Postulación de Proyectos: identidad, cabecera con logo, KPIs, paginación,
 * badges, footer).
 *
 * Fuente de datos: GET /event-registrations/admin/dashboard (KPIs del
 * tablero con los mismos filtros aplicados) + GET
 * /event-registrations/admin/list (tabla detallada con los mismos filtros).
 *
 * Diseñado para la Feria de Proyectos:
 *   · Resumen ejecutivo completo (inscripciones, nacionales, internacionales,
 *     acompañantes, personas totales, pagos confirmados, pendientes, acreditados,
 *     países, clubes y distritos).
 *   · Recaudo separado por moneda (COP y USD nunca se mezclan).
 *   · Desglose de categorías con inscripciones, personas, pagados y recaudo.
 *   · Distribución por país y por club.
 *   · Evolución cronológica de registros y pagos.
 *   · Listado detallado de asistentes con código, titular, correo, categoría,
 *     club/país, acompañantes, valor en COP/USD, estado y fecha.
 */
import {
    BLUE, GOLD, INK, MUTED, LINE, BAND_BG,
    PAGE_W, CONTENT_W, FOOT_Y, M,
    Doc, ExecutiveReport, ExecutiveLogo, BrandingLike, kpiGrid,
    renderExecutiveHeader, finishExecutiveReport,
    loadJsPdf, resolveExecutiveLogo, fmtNum, fmtDateShort,
} from './executiveReportPdf';
import { money, statusMeta } from './eventRegistrationSpec';

export interface EventReportRegistration {
    id?: string;
    publicRef?: string;
    registrationCode?: string | null;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    clubName?: string;
    district?: string;
    country?: string;
    city?: string;
    categoryLabel?: string;
    categoryKey?: string;
    status?: string;
    checkedInAt?: string | null;
    createdAt?: string;
    baseCurrency?: string;
    baseAmount?: number;
    chargeCurrency?: string;
    chargeAmount?: number;
    companionsCount?: number;
}

export interface EventReportDashboard {
    totals?: {
        registrations?: number; companions?: number; people?: number;
        settled?: number; pending?: number; failed?: number;
        refunded?: number; waitlist?: number; accredited?: number;
        countries?: number; districts?: number; clubs?: number;
        national?: number; international?: number;
        companionsAccredited?: number; companionRecords?: number;
    } | null;
    byCategory?: {
        categoryKey?: string;
        categoryLabel?: string;
        total?: number;
        people?: number;
        settled?: number;
        revenue?: number;
        currency?: string;
    }[] | null;
    byCurrency?: { currency?: string; base?: number; charged?: number; chargeCurrency?: string; total?: number }[] | null;
    byCountry?: { country: string; total: number }[] | null;
    byDistrict?: { district: string; total: number }[] | null;
    byClub?: { clubName: string; total: number }[] | null;
    timeline?: { day: string; total: number; settled: number }[] | null;
    capacity?: { key: string; name: string; capacity?: number; seats?: number; registrations?: number }[] | null;
    period?: { from?: string | null; to?: string | null } | null;
}

export interface EventReportEvent {
    title?: string;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
}

export interface EventReportInput {
    event: EventReportEvent;
    period?: { from?: string | null; to?: string | null } | null;
    dashboard: EventReportDashboard;
    registrations: EventReportRegistration[];
    branding?: BrandingLike | null;
    generatedAt?: string;
}

export interface EventReportOptions {
    returnBytes?: boolean;
    fileName?: string;
}

function cleanPdfText(val: any): string {
    if (val === null || val === undefined) return '';
    return String(val)
        .normalize('NFC')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim();
}

function fullName(r: EventReportRegistration): string {
    const fn = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    return cleanPdfText(fn || '—');
}

/** Tono del badge de pago según el estado real de la inscripción. */
function payTone(status?: string): string {
    switch (String(status || '')) {
        case 'paid': case 'confirmed': case 'accredited': case 'attended':
            return 'green';
        case 'pending_payment': case 'pending':
            return 'amber';
        case 'payment_failed': case 'failed': case 'expired':
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

    if ((t.national !== undefined && t.national > 0) || (t.international !== undefined && t.international > 0)) {
        parts.push(`Distribución geográfica: ${n(t.national)} ${t.national === 1 ? 'asistente nacional' : 'asistentes nacionales'} ` +
            `y ${n(t.international)} ${t.international === 1 ? 'internacional' : 'internacionales'}.`);
    }

    const totalPersonas = t.people || (Number(t.registrations || 0) + Number(t.companions || 0));
    if ((t.companions || 0) > 0 || (t.accredited || 0) > 0) {
        parts.push(`Se registran ${n(t.companions)} ${t.companions === 1 ? 'acompañante' : 'acompañantes'} ` +
            `(total de ${n(totalPersonas)} personas en sala) y ${n(t.accredited)} personas acreditadas.`);
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
    options?: EventReportOptions,
): Promise<{ bytes: ArrayBuffer; pages: number } | void> {
    const JsPDF = await loadJsPdf();

    const doc: Doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
    const t = input.dashboard?.totals || {};
    const eventTitle = cleanPdfText(input.event?.title || 'Evento').slice(0, 90);
    const place = cleanPdfText(input.event?.location || '');
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
    const totalPersonas = t.people || (Number(t.registrations || 0) + Number(t.companions || 0));
    const cards: { label: string; value: string; sub?: string }[] = [
        { label: 'Inscripciones', value: fmtNum(t.registrations) },
        { label: 'Nacionales', value: fmtNum(t.national) },
        { label: 'Internacionales', value: fmtNum(t.international) },
        { label: 'Pagos confirmados', value: fmtNum(t.settled) },
        { label: 'Pendientes de pago', value: fmtNum(t.pending) },
        { label: 'Acompañantes', value: fmtNum(t.companions) },
        { label: 'Total asistentes', value: fmtNum(totalPersonas) },
        { label: 'Acreditados', value: fmtNum(t.accredited) },
        { label: 'Países representados', value: fmtNum(t.countries) },
        { label: 'Clubes participantes', value: fmtNum(t.clubs) },
        { label: 'Distritos participantes', value: fmtNum(t.districts) },
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

    // ══ 2. Desglose por categoría y distribución (página nueva) ═══════
    const categories = input.dashboard?.byCategory || [];
    const countries = input.dashboard?.byCountry || [];
    const clubs = input.dashboard?.byClub || [];
    const hasDistData = categories.length > 0 || countries.length > 0 || clubs.length > 0;

    if (hasDistData) {
        r.newPage();
        r.sectionTitle('2', 'Categorías y distribución geográfica');

        // Tabla de Categorías
        if (categories.length > 0) {
            doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
            doc.text('INSCRIPCIONES POR CATEGORÍA', M, r.y);
            r.y += 10;

            const W_CAT_NAME = 175;
            const W_CAT_REGS = 65;
            const W_CAT_PEOPLE = 65;
            const W_CAT_SETTLED = 72;
            const W_CAT_REV = CONTENT_W - W_CAT_NAME - W_CAT_REGS - W_CAT_PEOPLE - W_CAT_SETTLED;

            // Cabecera tabla categorías
            doc.setFillColor(...BLUE);
            (doc as any).roundedRect(M, r.y, CONTENT_W, 16, 2, 2, 'F');
            doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(255, 255, 255);
            let cx = M + 6;
            doc.text('CATEGORÍA', cx, r.y + 11); cx += W_CAT_NAME;
            doc.text('INSCRIPCIONES', cx + (W_CAT_REGS - doc.getTextWidth('INSCRIPCIONES')) / 2, r.y + 11); cx += W_CAT_REGS;
            doc.text('PERSONAS', cx + (W_CAT_PEOPLE - doc.getTextWidth('PERSONAS')) / 2, r.y + 11); cx += W_CAT_PEOPLE;
            doc.text('PAGADAS', cx + (W_CAT_SETTLED - doc.getTextWidth('PAGADAS')) / 2, r.y + 11); cx += W_CAT_SETTLED;
            doc.text('RECAUDO CONFIRMADO', cx + W_CAT_REV - doc.getTextWidth('RECAUDO CONFIRMADO') - 6, r.y + 11);
            r.y += 16 + 2;

            categories.forEach(cat => {
                const label = cleanPdfText(cat.categoryLabel || cat.categoryKey || 'Categoría');
                const catLines: string[] = doc.splitTextToSize(label, W_CAT_NAME - 10);
                const ch = Math.max(catLines.length * 10, 14) + 6;
                r.ensure(ch);

                let rx = M + 6;
                doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...INK);
                catLines.forEach((ln, li) => doc.text(ln, rx, r.y + 10 + li * 10));
                rx += W_CAT_NAME;

                doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK);
                const regsStr = fmtNum(cat.total);
                doc.text(regsStr, rx + (W_CAT_REGS - doc.getTextWidth(regsStr)) / 2, r.y + 10);
                rx += W_CAT_REGS;

                const peoStr = fmtNum(cat.people);
                doc.setFont('helvetica', 'normal').setTextColor(...MUTED);
                doc.text(peoStr, rx + (W_CAT_PEOPLE - doc.getTextWidth(peoStr)) / 2, r.y + 10);
                rx += W_CAT_PEOPLE;

                const setStr = fmtNum(cat.settled);
                doc.setFont('helvetica', 'bold').setTextColor(6, 95, 70);
                doc.text(setStr, rx + (W_CAT_SETTLED - doc.getTextWidth(setStr)) / 2, r.y + 10);
                rx += W_CAT_SETTLED;

                const revStr = cat.revenue ? money(cat.revenue, cat.currency || 'USD') : '—';
                doc.setFont('helvetica', 'bold').setTextColor(...INK);
                doc.text(revStr, rx + W_CAT_REV - doc.getTextWidth(revStr) - 6, r.y + 10);

                doc.setDrawColor(...LINE);
                doc.line(M, r.y + ch - 1, M + CONTENT_W, r.y + ch - 1);
                r.y += ch;
            });
            r.y += 14;
        }

        // Distribución País y Club en 2 columnas paralelas
        if (countries.length > 0 || clubs.length > 0) {
            r.ensure(110);
            const COL_W = (CONTENT_W - 14) / 2;
            const topY = r.y;

            // Columna 1: Países
            doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
            doc.text('DISTRIBUCIÓN POR PAÍS', M, topY);
            let y1 = topY + 8;
            doc.setFillColor(...BAND_BG);
            (doc as any).roundedRect(M, y1, COL_W, 14, 2, 2, 'F');
            doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...MUTED);
            doc.text('PAÍS', M + 6, y1 + 10);
            doc.text('TOTAL', M + COL_W - doc.getTextWidth('TOTAL') - 6, y1 + 10);
            y1 += 16;

            const topCountries = countries.slice(0, 8);
            topCountries.forEach(c => {
                doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...INK);
                doc.text(cleanPdfText(c.country).slice(0, 24), M + 6, y1 + 8);
                doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...INK);
                const str = fmtNum(c.total);
                doc.text(str, M + COL_W - doc.getTextWidth(str) - 6, y1 + 8);
                doc.setDrawColor(...LINE);
                doc.line(M, y1 + 12, M + COL_W, y1 + 12);
                y1 += 13;
            });

            // Columna 2: Clubes
            const col2X = M + COL_W + 14;
            doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
            doc.text('DISTRIBUCIÓN POR CLUB', col2X, topY);
            let y2 = topY + 8;
            doc.setFillColor(...BAND_BG);
            (doc as any).roundedRect(col2X, y2, COL_W, 14, 2, 2, 'F');
            doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...MUTED);
            doc.text('CLUB', col2X + 6, y2 + 10);
            doc.text('TOTAL', col2X + COL_W - doc.getTextWidth('TOTAL') - 6, y2 + 10);
            y2 += 16;

            const topClubs = clubs.slice(0, 8);
            topClubs.forEach(cl => {
                doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...INK);
                doc.text(cleanPdfText(cl.clubName).slice(0, 28), col2X + 6, y2 + 8);
                doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...INK);
                const str = fmtNum(cl.total);
                doc.text(str, col2X + COL_W - doc.getTextWidth(str) - 6, y2 + 8);
                doc.setDrawColor(...LINE);
                doc.line(col2X, y2 + 12, col2X + COL_W, y2 + 12);
                y2 += 13;
            });

            r.y = Math.max(y1, y2) + 12;
        }

        // Evolución cronológica de registros
        const timeline = input.dashboard?.timeline || [];
        if (timeline.length > 0) {
            r.ensure(75);
            doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
            doc.text('EVOLUCIÓN DE REGISTROS (ÚLTIMA ACTIVIDAD)', M, r.y);
            r.y += 8;

            const recentTimeline = timeline.slice(-10);
            const tcols = recentTimeline.length;
            const tCellW = Math.min(CONTENT_W / Math.max(tcols, 1), 60);

            doc.setFillColor(...BAND_BG);
            (doc as any).roundedRect(M, r.y, tCellW * tcols, 36, 3, 3, 'F');
            recentTimeline.forEach((tItem, idx) => {
                const tx = M + idx * tCellW;
                doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...MUTED);
                const dayLabel = tItem.day.slice(5); // MM-DD
                doc.text(dayLabel, tx + (tCellW - doc.getTextWidth(dayLabel)) / 2, r.y + 11);

                doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK);
                const regLabel = `${tItem.total}`;
                doc.text(regLabel, tx + (tCellW - doc.getTextWidth(regLabel)) / 2, r.y + 22);

                doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(6, 95, 70);
                const setLabel = `${tItem.settled} pag.`;
                doc.text(setLabel, tx + (tCellW - doc.getTextWidth(setLabel)) / 2, r.y + 31);
            });
            r.y += 36 + 14;
        }
    }

    // ══ 3. Listado detallado de asistentes (página nueva) ══════════════
    r.newPage();
    const rows = [...(input.registrations || [])].sort((a, b) =>
        String(a.lastName || '').localeCompare(String(b.lastName || ''), 'es') ||
        String(a.firstName || '').localeCompare(String(b.firstName || ''), 'es'));

    const sectionNum = hasDistData ? '3' : '2';
    r.sectionTitle(sectionNum, 'Listado detallado de asistentes');
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
    r.ensure(16);
    const clubCount = new Set(rows.map(x => String(x.clubName || '').toLowerCase()).filter(Boolean)).size;
    doc.text(
        `${fmtNum(rows.length)} ${rows.length === 1 ? 'asistente' : 'asistentes'} · ` +
        `${fmtNum(clubCount)} ${clubCount === 1 ? 'club' : 'clubes'} · ordenado alfabéticamente`,
        M, r.y);
    r.y += 14;

    if (!rows.length) {
        r.note('No se encontraron registros de asistentes para los filtros seleccionados.');
    } else {
        // Geometría calibrada (ancho exacto = CONTENT_W = 507 pt):
        const W_COD = 52;
        const W_TIT = 115;
        const W_CAT = 68;
        const W_CLUB = 96;
        const W_ACOMP = 24;
        const W_VALOR = 54;
        const W_EST = 54;
        const W_FECHA = 44;
        const LH = 10;
        const ROW_PAD = 10;

        const drawHead = () => {
            const d = doc;
            d.setFillColor(...BLUE);
            (d as any).roundedRect(M, r.y, CONTENT_W, 18, 3, 3, 'F');
            d.setFont('helvetica', 'bold').setFontSize(7).setTextColor(255, 255, 255);
            let x = M + 5;
            d.text('CÓDIGO', x, r.y + 12); x += W_COD;
            d.text('TITULAR / CORREO', x, r.y + 12); x += W_TIT;
            d.text('CATEGORÍA', x, r.y + 12); x += W_CAT;
            d.text('PAÍS / CLUB', x, r.y + 12); x += W_CLUB;
            d.text('ACOMP.', x + (W_ACOMP - d.getTextWidth('ACOMP.')) / 2, r.y + 12); x += W_ACOMP;
            d.text('VALOR', x + W_VALOR - d.getTextWidth('VALOR') - 4, r.y + 12); x += W_VALOR;
            d.text('ESTADO', x + (W_EST - d.getTextWidth('ESTADO')) / 2, r.y + 12); x += W_EST;
            d.text('FECHA', x + (W_FECHA - d.getTextWidth('FECHA')) / 2, r.y + 12);
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
            const code = cleanPdfText(s.registrationCode || s.publicRef || '—');
            const titName = fullName(s);
            const titEmail = cleanPdfText(s.email || '');
            const acompCount = Number(s.companionsCount || 0);

            const nameLines: string[] = d.splitTextToSize(titName, W_TIT - 8);
            const emailLines: string[] = titEmail ? d.splitTextToSize(titEmail, W_TIT - 8) : [];
            const titTotalLines = Math.min(nameLines.length + emailLines.length, 3);

            const clubCountry = [cleanPdfText(s.country), cleanPdfText(s.clubName)].filter(Boolean).join(' · ') || '—';
            const clubLines: string[] = d.splitTextToSize(clubCountry, W_CLUB - 8);

            const catLabel = cleanPdfText(s.categoryLabel || s.categoryKey || '—');
            const catLines: string[] = d.splitTextToSize(catLabel, W_CAT - 8);

            const maxLines = Math.max(titTotalLines, clubLines.length, catLines.length, 1);
            const h = Math.max(maxLines * LH, 16) + ROW_PAD;

            // Salto limpio de página con cabecera repetida si no cabe la fila completa
            if (r.y + h > FOOT_Y - 14) {
                r.newPage();
                needHead = true;
                ensureHead();
            }

            let x = M + 5;
            // 1. Código
            d.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...MUTED);
            d.text(code.slice(0, 14), x, r.y + 8);
            x += W_COD;

            // 2. Titular y correo
            d.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK);
            nameLines.slice(0, 2).forEach((ln: string, li: number) => d.text(ln, x, r.y + 8 + li * LH));
            if (emailLines.length > 0 && nameLines.length < 3) {
                d.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
                d.text(emailLines[0].slice(0, 30), x, r.y + 8 + nameLines.length * LH);
            }
            x += W_TIT;

            // 3. Categoría
            d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...INK);
            catLines.slice(0, 3).forEach((ln: string, li: number) => d.text(ln, x, r.y + 8 + li * LH));
            x += W_CAT;

            // 4. País / Club
            d.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...INK);
            clubLines.slice(0, 3).forEach((ln: string, li: number) => d.text(ln, x, r.y + 8 + li * LH));
            x += W_CLUB;

            // 5. Acompañantes
            d.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTED);
            const acompStr = acompCount > 0 ? String(acompCount) : '—';
            d.text(acompStr, x + (W_ACOMP - d.getTextWidth(acompStr)) / 2, r.y + 8);
            x += W_ACOMP;

            // 6. Valor
            d.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...INK);
            const valStr = s.baseAmount ? money(s.baseAmount, s.baseCurrency || 'USD') : '—';
            d.text(valStr, x + W_VALOR - d.getTextWidth(valStr) - 4, r.y + 8);
            x += W_VALOR;

            // 7. Estado
            const cy = r.y + h / 2 + 1;
            const meta = statusMeta(String(s.status || ''));
            r.badge(x, cy, W_EST, cleanPdfText(meta.label).slice(0, 16), payTone(s.status));
            x += W_EST;

            // 8. Fecha
            d.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
            const fechaStr = fmtDateShort(s.createdAt);
            d.text(fechaStr, x + (W_FECHA - d.getTextWidth(fechaStr)) / 2, r.y + 8);

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

    const today = new Date().toISOString().slice(0, 10);
    const safeName = options?.fileName || `feria-proyectos-eventos-${today}.pdf`;
    doc.save(safeName);
}

export type { ExecutiveLogo, BrandingLike };
