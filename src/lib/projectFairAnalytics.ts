/**
 * Capa central de analítica de Postulación de Proyectos (v4.1125).
 *
 * REGLA: el Centro de Inteligencia (dashboard), el PDF ejecutivo y las
 * exportaciones calculan desde AQUÍ o desde la respuesta de
 * GET /project-fair/admin/inteligencia. Prohibido duplicar la lógica de
 * métricas en cada consumidor: dashboard y PDF mostraban cifras distintas
 * cuando cada uno deducía por su lado.
 *
 * Todo lo que aquí se devuelve sale de datos reales del endpoint. Nada se
 * inventa: si no hay histórico suficiente, la función lo dice y el informe
 * omite la sección en vez de pintar una gráfica vacía.
 */

export interface FairKpis {
    total: number; paid: number; pending: number; failed: number; refunded: number;
    pendingReview: number; approved: number; rejected: number;
    inReview?: number; needsChanges?: number; sentToGrants?: number;
    districts: number; clubs: number; countries: number;
    priceMode: 'COP' | 'USD';
    totalCop: number; totalUsd: number; totalRefunded: number;
    totalBudget: number; avgBudget: number;
    minBudget?: number | null; maxBudget?: number | null;
    avgTrm: number; minTrm?: number | null; maxTrm?: number | null;
    ticketAvgCop?: number; ticketAvgUsd?: number;
    periodStart?: string | null; periodEnd?: string | null;
    firstPayment?: string | null; lastPayment?: string | null;
    conversionRate: number; paymentRate?: number;
}

export interface FunnelStep { key: string; label: string; count: number; rate: number }
export interface GroupRow { key: string; count: number; paid?: number; totalAmount?: number; totalBudget?: number }
export interface TimelineDay { day: string; total: number; paid: number; totalAmount: number }
export interface TopBudgetRow { id: string; publicRef: string; projectName: string; clubName: string; district?: string; budgetUsd: number; status?: string }

export interface IntelligenceData {
    kpis: FairKpis;
    funnel: FunnelStep[];
    byPayment: { key: string; count: number }[];
    byWorkflow: { key: string; count: number }[];
    byDistrict: GroupRow[];
    byFocusArea: GroupRow[];
    byClub: GroupRow[];
    byCountry: GroupRow[];
    byDepartment: GroupRow[];
    byCity: GroupRow[];
    timeline: TimelineDay[];
    topBudget: TopBudgetRow[];
    activity: any[];
    edition?: { number?: number; ordinal?: string; name?: string; city?: string; country?: string; year?: number; dates?: string; key?: string } | null;
    branding?: { headerLogo?: string | null; receiptLogo?: string | null; siteLogo?: string | null; siteLogoIntl?: string | null; footerLogo?: string | null; footerText?: string | null; footerImage?: string | null; logoSource?: string | null; logoDataUrl?: string | null; logoDataFormat?: string | null; logoDataError?: string | null } | null;
    registration?: { priceMode?: string; amountCop?: number | null; amountUsd?: number | null } | null;
    generatedAt?: string;
}

// ── Formato: vive en el motor compartido (`executiveReportPdf.ts`) para que
// todos los informes usen las mismas reglas. Se re-exporta para no romper
// a los consumidores actuales.
import { fmtCop, fmtUsd, fmtNum, fmtPct, fmtDateShort, fmtDateTime, pctOf, pickBrandingLogoUrl, pickEmbeddedLogo } from './executiveReportPdf';
export { fmtCop, fmtUsd, fmtNum, fmtPct, fmtDateShort, fmtDateTime, pctOf };

/** Un eje geográfico sólo informa si tiene más de una fila real. */
export const hasGeo = (rows?: GroupRow[]): boolean =>
    Array.isArray(rows) && rows.length > 0 && !(rows.length === 1 && String(rows[0]?.key || '').startsWith('Sin '));

export const editionTitle = (d?: IntelligenceData | null) =>
    d?.edition?.name || 'XII Feria de Proyectos Rotary Colombia';
export const editionPlace = (d?: IntelligenceData | null) => {
    const parts = [d?.edition?.city, d?.edition?.country].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Valledupar, Colombia';
};

/**
 * Subtítulo institucional sin duplicar: si el nombre de la edición ya trae
 * la ciudad o el año, no se repiten (evita "Valledupar 2027 – Valledupar…").
 */
export const editionSubtitle = (d?: IntelligenceData | null): string => {
    const name = editionTitle(d);
    const low = name.toLowerCase();
    const city = String(d?.edition?.city || '').trim();
    const country = String(d?.edition?.country || '').trim();
    const year = d?.edition?.year ? String(d.edition.year) : '';
    let sub = name;
    const place = [city, country].filter(Boolean).join(', ');
    if (place && !(city && low.includes(city.toLowerCase())) && !low.includes(place.toLowerCase())) {
        sub += ` – ${place}`;
    }
    if (year && !name.includes(year)) sub += ` ${year}`;
    return sub;
};

// ── Lectura ejecutiva (sólo datos reales) ─────────────────────────────
export interface ExecutiveReading { paragraph: string; bullets: { label: string; detail: string }[] }

export function buildExecutiveReading(d: IntelligenceData): ExecutiveReading {
    const k = d.kpis;
    const conv = k.conversionRate || 0;
    const paidStr = k.priceMode === 'USD'
        ? `${fmtUsd(k.totalUsd)} USD`
        : `${fmtCop(k.totalCop)} COP`;
    const budgetStr = `${fmtUsd(k.totalBudget)} USD`;
    const paragraph =
        `La ${editionTitle(d)} registra actualmente ${fmtNum(k.total)} postulaciones provenientes de ` +
        `${fmtNum(k.clubs)} clubes, ${fmtNum(k.districts)} distritos y ${fmtNum(k.countries)} ${k.countries === 1 ? 'país' : 'países'}. ` +
        `Del total, ${fmtNum(k.paid)} cuentan con pago confirmado, equivalente a una conversión del ${fmtPct(conv)}. ` +
        `El recaudo acumulado asciende a ${paidStr}` +
        (k.priceMode !== 'USD' ? ` (${fmtUsd(k.totalUsd)} USD convertidos con la TRM de cada pago)` : '') +
        `, y los proyectos representan un presupuesto agregado de ${budgetStr}.`;

    const bullets: ExecutiveReading['bullets'] = [];
    // Principal avance: la etapa del embudo con mayor avance real.
    const funnel = d.funnel || [];
    const paidStep = funnel.find(f => f.key === 'paid');
    if (k.total > 0 && (k.paid || 0) > 0) {
        bullets.push({
            label: 'Principal avance',
            detail: `${fmtNum(k.paid)} pagos confirmados de ${fmtNum(k.total)} formularios (${fmtPct(conv)} de conversión).`,
        });
    } else if (k.total > 0) {
        bullets.push({ label: 'Principal avance', detail: `${fmtNum(k.total)} formularios recibidos; aún sin pagos confirmados.` });
    }
    // Principal pendiente: lo que más pesa sin resolver.
    if ((k.pending || 0) > 0) {
        bullets.push({ label: 'Principal pendiente', detail: `${fmtNum(k.pending)} postulación(es) con pago pendiente de confirmación.` });
    } else if ((k.pendingReview || 0) > 0) {
        bullets.push({ label: 'Principal pendiente', detail: `${fmtNum(k.pendingReview)} postulación(es) pendientes de revisión del equipo.` });
    } else if (k.total === 0) {
        bullets.push({ label: 'Principal pendiente', detail: 'Aún no hay postulaciones registradas en esta edición.' });
    }
    // Cuello de botella: mayor caída entre etapas consecutivas del embudo.
    if (funnel.length >= 2 && k.total > 0) {
        let worst: { from: string; to: string; drop: number } | null = null;
        for (let i = 1; i < funnel.length; i++) {
            const drop = (funnel[i - 1].count || 0) - (funnel[i].count || 0);
            if (!worst || drop > worst.drop) worst = { from: funnel[i - 1].label, to: funnel[i].label, drop };
        }
        if (worst && worst.drop > 0) {
            bullets.push({
                label: 'Cuello de botella',
                detail: `Caída de ${fmtNum(worst.drop)} entre “${worst.from}” y “${worst.to}”.`,
            });
        }
    }
    // Participación.
    if ((k.clubs || 0) > 0) {
        bullets.push({
            label: 'Participación',
            detail: `${fmtNum(k.clubs)} clubes de ${fmtNum(k.districts)} distritos; promedio de ${(k.clubs > 0 ? ((k.total || 0) / k.clubs) : 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })} proyectos por club.`,
        });
    }
    // Estado general.
    const needsAction = (k.pending || 0) + (k.failed || 0) + (k.pendingReview || 0);
    if (k.total > 0) {
        bullets.push({
            label: 'Estado general',
            detail: needsAction > 0
                ? `${fmtNum(needsAction)} postulación(es) requieren seguimiento (pago o revisión).`
                : 'Sin pendientes de pago ni de revisión: el proceso está al día.',
        });
    }
    void paidStep;
    return { paragraph, bullets: bullets.slice(0, 5) };
}

// ── Matriz de estados (sólo estados reales del modelo) ────────────────
export const WORKFLOW_LABELS: Record<string, string> = {
    draft: 'Borrador', received: 'Recibida', pending_payment: 'Pendiente de pago',
    payment_confirmed: 'Pago confirmado', payment_failed: 'Pago fallido', refunded: 'Reembolsada',
    in_review: 'En revisión', needs_changes: 'Requiere ajustes', approved: 'Aprobada',
    rejected: 'No aprobada', sent_to_grants: 'Enviada a Rotary Grants', closed: 'Cerrada',
};
export const PAYMENT_LABELS: Record<string, string> = {
    pending_payment: 'Pendiente de pago', paid: 'Pagado', failed: 'Fallido', refunded: 'Reembolsado',
};

export interface StateRow { estado: string; cantidad: number; pct: number; observacion: string }

export function buildWorkflowMatrix(d: IntelligenceData): StateRow[] {
    const total = d.kpis.total || 0;
    const byW = new Map((d.byWorkflow || []).map(r => [r.key, r.count]));
    const needsActionKeys = new Set(['pending_payment', 'needs_changes', 'payment_failed']);
    return Object.entries(WORKFLOW_LABELS)
        .map(([key, estado]) => ({ key, estado, cantidad: byW.get(key) || 0 }))
        .filter(r => r.cantidad > 0)
        .map(r => ({
            estado: r.estado,
            cantidad: r.cantidad,
            pct: pctOf(r.cantidad, total),
            observacion: needsActionKeys.has(r.key)
                ? 'Requiere intervención o seguimiento.'
                : r.key === 'in_review' || r.key === 'received'
                    ? 'En cola de revisión del equipo.'
                    : r.key === 'approved' || r.key === 'sent_to_grants'
                        ? 'Etapa superada.'
                        : '—',
        }));
}

export function countNeedsAction(d: IntelligenceData, alertsTotal?: number): number {
    void alertsTotal;
    const k = d.kpis;
    return (k.pending || 0) + (k.failed || 0) + (k.pendingReview || 0) + (k.needsChanges || 0);
}

// ── Conclusiones (4–6, sólo con soporte en datos) ─────────────────────
export function buildConclusions(d: IntelligenceData, alertsTotal = 0): string[] {
    const k = d.kpis;
    const out: string[] = [];
    if (k.total > 0) {
        out.push(`Participación: ${fmtNum(k.clubs)} clubes de ${fmtNum(k.districts)} distritos han presentado ${fmtNum(k.total)} proyectos en ${fmtNum(k.countries)} ${k.countries === 1 ? 'país' : 'países'}.`);
        out.push(`Conversión: el ${fmtPct(k.conversionRate)} de las postulaciones cuenta con pago confirmado (${fmtNum(k.paid)} de ${fmtNum(k.total)}).`);
    } else {
        out.push('Participación: aún no hay postulaciones registradas en esta edición.');
    }
    if ((k.pendingReview || 0) > 0 || (k.inReview || 0) > 0) {
        out.push(`Gestión: ${fmtNum(Math.max(k.pendingReview || 0, k.inReview || 0))} postulación(es) permanecen pendientes de revisión del equipo.`);
    }
    if (k.priceMode === 'USD') {
        out.push(`Finanzas: el proceso registra un recaudo acumulado de ${fmtUsd(k.totalUsd)} USD${(k.refunded || 0) > 0 ? `, con ${fmtNum(k.refunded)} reembolso(s)` : ''}.`);
    } else {
        out.push(`Finanzas: el proceso registra un recaudo acumulado de ${fmtCop(k.totalCop)} COP (${fmtUsd(k.totalUsd)} USD a la TRM de cada pago)${(k.refunded || 0) > 0 ? `, con ${fmtNum(k.refunded)} reembolso(s)` : ''}.`);
    }
    if ((k.totalBudget || 0) > 0) {
        out.push(`Portafolio: los proyectos representan un presupuesto agregado de ${fmtUsd(k.totalBudget)} USD (promedio ${fmtUsd(k.avgBudget)} por proyecto).`);
    }
    const action = countNeedsAction(d);
    if (action > 0 || alertsTotal > 0) {
        out.push(`Seguimiento: ${fmtNum(Math.max(action, alertsTotal))} postulación(es) requieren una acción administrativa (pago, revisión o alerta).`);
    } else if (k.total > 0) {
        out.push('Seguimiento: no hay postulaciones pendientes de acción administrativa.');
    }
    return out.slice(0, 6);
}

// ── Evolución: sólo si hay histórico suficiente ───────────────────────
export function hasTimeline(d: IntelligenceData): boolean {
    return Array.isArray(d.timeline) && d.timeline.length >= 2;
}

/** Logo oficial disponible (sin inventar ninguno). Delega en el motor. */
export function pickLogoUrl(d: IntelligenceData): string | null {
    return pickBrandingLogoUrl(d?.branding || {});
}

export interface LogoData { data: string; format: string }

/**
 * Logo ya embebido por el servidor (`?logoData=1` → `branding.logoDataUrl`).
 * Es la vía preferida: viene normalizado a PNG/JPEG y no depende de CORS,
 * del formato original ni de carreras de carga en el navegador.
 */
export function pickLogoData(d: IntelligenceData): LogoData | null {
    return pickEmbeddedLogo(d?.branding || {});
}
