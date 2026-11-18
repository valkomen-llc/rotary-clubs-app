// ════════════════════════════════════════════════════════════════════
// EXCHANGE — traslados y conciliación de la Feria — tipos y llamadas (v4.1335.0)
//
// ⚠️ EL NAVEGADOR NO CALCULA ESTADOS NI TOTALES. Todo sale del servidor
// (`server/lib/exchangeSpec.js`): aquí sólo hay tipos, formato y llamadas.
// ⚠️ El traslado se REGISTRA con la barra de la Bóveda (`BulkDisbursementBar`),
// no desde aquí: Exchange concilia, documenta y consulta.
// ════════════════════════════════════════════════════════════════════
import { leerJson, describirNoJson } from './leerJson';

export type ExchangeState =
    | 'no_aplica' | 'pago_directo' | 'sin_traslado' | 'sin_comprobante' | 'en_conciliacion' | 'parcial' | 'con_diferencia' | 'conciliado';

export interface ExchangeCompact {
    state: ExchangeState; label: string; tone: string; help: string;
    expected: number; allocated: number; confirmedAmount: number; currency: string | null;
    hasReceipt: boolean; operations: number; lastTransferDate: string | null;
    needsMovement: boolean; anchor: boolean; via: { id: string; publicRef: string | null } | null;
    references: string[]; lastReconciledAt: string | null; registeredBy: string[];
}

export interface ExchangeCapabilities {
    role: string; view: boolean; download: boolean; manage: boolean; reconcile: boolean; config: boolean; register: boolean;
}

export interface ExchangeAccount {
    label: string | null; institution: string | null; holder: string | null; accountNumber: string | null;
    accountType: string | null; currency: string | null;
}

export interface ExchangeFile { index: number; name: string; mime: string; bytes: number | null }
export interface ExchangeDoc {
    id: string; kind: string; kindLabel: string; fileName: string; mime: string; bytes: number; note: string | null;
    uploadedByName: string | null; uploadedAt: string; retiredAt: string | null; retiredReason: string | null;
}
export interface ExchangeOperationData {
    sentAmount: number | null; sentCurrency: string | null; receivedAmount: number | null; receivedCurrency: string | null;
    exchangeRate: number | null; rateSource: string | null; feeAmount: number | null; feeCurrency: string | null;
    bankReference: string | null; transferDate: string | null; notes: string | null; version: number;
    updatedByName: string | null; updatedAt: string | null;
}
export interface ExchangeOperation {
    key: string; kind: 'agrupada' | 'individual'; status: string; statusLabel: string; reversed: boolean;
    currency: string; allocated: number; allocationsCount: number; projectsCount: number; hasReceipt: boolean;
    reference: string; transferDate: string | null; received: number | null; receivedCurrency: string | null;
    difference: number | null; reconciledAt: string | null; reconciledByName: string | null; statusNote: string | null;
    beneficiary: string | null; method: string | null; registeredAt: string | null; registeredByName: string | null;
    bovedaNotes: string | null; data: ExchangeOperationData | null;
    accounts: { origin: ExchangeAccount | null; destination: ExchangeAccount | null };
    allocations: { id: string; amount: number; currency: string; status: 'activa' | 'reversado'; reversedReason: string | null; project: { id: string; publicRef: string; projectName: string; clubName: string } | null; isThis: boolean }[];
    bovedaFiles: ExchangeFile[];
    documents: ExchangeDoc[];
}
export interface ExchangeHistoryEntry {
    at: string; action: string; label: string; actorName: string | null; actorRole?: string | null; operationKey?: string | null;
    fromState?: string | null; toState?: string | null; reference?: string | null; note?: string | null; payload?: any;
}
export interface ExchangeDetail {
    project: {
        id: string; publicRef: string; projectName: string; clubName: string; district: string; paymentStatus: string;
        paymentView: string; paidAt: string | null; paymentOrigin: string | null; coveredBy: { id: string; publicRef: string | null } | null; anchorRef: string;
    };
    exchange: ExchangeCompact | null;
    operations: ExchangeOperation[];
    history: ExchangeHistoryEntry[];
    docKinds: { key: string; label: string }[];
    accounts: { origin: ExchangeAccount | null; destination: ExchangeAccount | null; maxReceiptMb: number };
    capabilities: ExchangeCapabilities;
}
export interface ExchangeTotalsCurrency {
    currency: string; recibido: number; proyectosPagados: number; trasladado: number; conciliado: number;
    pendienteTraslado: number; proyectosSinTraslado: number; pendienteConciliacion: number; operaciones: number;
    operacionesPendientes: number; operacionesConciliadas: number; diferencias: number; valorDiferencias: number; parciales: number;
}
export interface ExchangeSummaryData {
    totals: { porMoneda: ExchangeTotalsCurrency[]; pagosDirectos: number; sinMovimiento: number; sinComprobante: number };
    porEstado: Record<string, number>;
    proyectos: number;
    capabilities: ExchangeCapabilities;
}
export interface ExchangeGrant {
    id: string; email: string; linkedUser: boolean; canDownload: boolean; note: string | null; source: string;
    grantedByName: string | null; grantedAt: string; revokedAt: string | null; revokedByName: string | null;
    revokedReason: string | null; lastUsedAt: string | null;
}
export interface ExchangeConfigData {
    eventId: string | null;
    accounts: { origin: ExchangeAccount | null; destination: ExchangeAccount | null; maxReceiptMb: number };
    history: any[];
    grants: ExchangeGrant[];
    docKinds: { key: string; label: string }[];
    filters: { key: string; label: string }[];
    capabilities: ExchangeCapabilities;
}

/** Colores por tono, siempre con texto (nunca sólo color). */
export const EXCHANGE_TONE_CLS: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    sky: 'bg-sky-50 text-sky-800 ring-sky-200',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    orange: 'bg-orange-50 text-orange-800 ring-orange-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
};
export const RECON_TONE: Record<string, string> = {
    en_conciliacion: 'orange', conciliado: 'emerald', con_diferencia: 'red', revertido: 'slate',
};

export const fmtMoney = (n: number | null | undefined, c?: string | null) => {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    const cur = String(c || '').toUpperCase();
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: cur || 'COP', minimumFractionDigits: cur === 'COP' ? 0 : 2, maximumFractionDigits: cur === 'COP' ? 0 : 2,
        }).format(Number(n));
    } catch {
        return `${Number(n).toLocaleString('es-CO')} ${cur}`;
    }
};
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }) : '—');
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }) : '—');
export const fmtBytes = (b?: number | null) => (!b ? '' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ── Llamadas ─────────────────────────────────────────────────────────
const API = (import.meta as any).env?.VITE_API_URL || '/api';
export const EXCHANGE_BASE = `${API}/project-fair/admin/exchange`;

export const exchangeUrl = (path: string, eventId?: string | null) => {
    const sep = path.includes('?') ? '&' : '?';
    return `${EXCHANGE_BASE}${path}${eventId ? `${sep}evento=${encodeURIComponent(eventId)}` : ''}`;
};

export const exchangeRequest = async <T = any>(path: string, eventId: string | null | undefined, init: RequestInit = {}): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
        const res = await fetch(exchangeUrl(path, eventId), {
            ...init,
            signal: ctrl.signal,
            headers: {
                Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
                ...(init.headers || {}),
            },
        });
        const { data, crudo, esJson } = await leerJson<any>(res);
        if (!esJson) throw new Error(describirNoJson(res, crudo));
        if (!res.ok) {
            const err: any = new Error(data?.error || `El servidor respondió ${res.status}.`);
            err.status = res.status; err.code = data?.code;
            throw err;
        }
        return data as T;
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder. Vuelve a intentarlo.');
        throw e;
    } finally {
        clearTimeout(timer);
    }
};

/** Descarga un CSV de Exchange (operaciones o asignaciones) con la sesión. */
export const downloadExchangeCsv = async (vista: 'operaciones' | 'asignaciones', query: string, eventId: string | null | undefined) => {
    const res = await fetch(exchangeUrl(`/export.csv?vista=${vista}${query ? `&${query}` : ''}`, eventId), {
        headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
    });
    if (!res.ok) {
        const { data } = await leerJson<any>(res);
        throw new Error(data?.error || `El servidor respondió ${res.status}.`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exchange-${vista}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

/** Las columnas de Exchange para el Excel del listado (las mismas cifras de la columna). */
export const exchangeExcelColumns = (x: ExchangeCompact | null | undefined): Record<string, any> => {
    if (!x) return {};
    const aplica = x.state !== 'no_aplica' && x.state !== 'pago_directo';
    return {
        'Exchange (estado)': x.state === 'no_aplica' ? 'No aplica' : x.label,
        'Valor recibido a trasladar': aplica ? x.expected : null,
        'Valor asignado en Exchange': aplica ? x.allocated : null,
        'Valor conciliado': aplica ? x.confirmedAmount : null,
        'Moneda Exchange': x.currency || '',
        'Fecha del traslado': x.lastTransferDate ? fmtDate(x.lastTransferDate) : '',
        'Referencia bancaria': (x.references || []).join(' | '),
        'Fecha de conciliación': x.lastReconciledAt ? fmtDate(x.lastReconciledAt) : '',
        'Responsable del registro': (x.registeredBy || []).join(' | '),
        'Comprobante Exchange': x.hasReceipt ? 'Sí' : 'No',
        'Exchange vía': x.via?.publicRef || '',
    };
};
