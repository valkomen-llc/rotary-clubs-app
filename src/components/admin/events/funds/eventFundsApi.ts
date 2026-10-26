// Cliente de /api/event-funds (v4.1250): la conciliación de inscripciones y los
// traslados de un evento. Dominio propio de Eventos: nada pasa por la Bóveda.
import { leerJson, describirNoJson } from '../../../../lib/leerJson';
import type { PaymentInfo, RegistrationTransferState, TransferStatus } from '../../../../../server/lib/eventFundsSpec.js';

const API = import.meta.env.VITE_API_URL || '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

export interface FundsRegistration {
    id: string; code: string | null; name: string | null; email: string | null; status: string;
    category: string | null; clubName: string | null; district: string | null; createdAt: string;
    payment: PaymentInfo;
    allocations: { transferId: string; amount: number; transferStatus: TransferStatus; transferReference: string | null; transferDate: string | null; transferKind: string | null }[];
    allocated: number; confirmedAmount: number; transferState: RegistrationTransferState;
}
export interface FundsDocument {
    id: string; transferId: string; fileName: string | null; bytes: number | null; version: number;
    isCurrent: boolean; notes: string | null; uploadedByName: string | null; uploadedAt: string;
}
export interface FundsNotice {
    id: string; transferId: string; recipients: string[]; cc: string[]; subject: string | null; documentId: string | null;
    state: string; providerMessageId: string | null; error: string | null; sentByName: string | null; sentAt: string;
}
export interface FundsTransfer {
    id: string; eventId: string; kind: 'individual' | 'consolidado'; beneficiaryName: string | null; currency: string;
    amount: number; transferDate: string | null; reference: string | null; method: string | null; notes: string | null;
    status: TransferStatus; statusReason: string | null; createdByName: string | null; confirmedByName: string | null;
    confirmedAt: string | null; createdAt: string;
    allocations: { registrationId: string; amount: number; currency: string; code: string | null; name: string | null }[];
    allocated: number; difference: number; documents: FundsDocument[]; hasDocument: boolean;
    notices: FundsNotice[]; noticesSent: number; active: boolean;
}
export interface FundsConfig {
    eventId: string; beneficiaryName: string | null; bankName: string | null; accountNumber: string | null;
    accountMasked: string; accountVisible: boolean; accountType: string | null; accountCurrency: string | null;
    beneficiaryTaxId: string | null; notes: string | null; recipients: { name: string; email: string; role: string }[];
    updatedByName: string | null; updatedAt: string | null;
}
export interface FundsOverview {
    event: { id: string; title: string; clubId: string };
    config: FundsConfig | null;
    registrations: FundsRegistration[];
    transfers: FundsTransfer[];
    totals: Record<string, any>[];
    methods: { id: string; label: string }[];
    statusLabels: Record<string, string>;
    canApprove: boolean;
}
export interface HistoryEntry {
    at: string; kind: string; label: string; actor: string; fromState?: string | null; toState?: string | null;
    reference?: string | null; documentId?: string | null; transferId?: string | null; detail?: string | null;
}
export interface RegistrationFundsDetail {
    event: { id: string; title: string }; config: FundsConfig | null; registration: FundsRegistration;
    transfers: FundsTransfer[]; history: HistoryEntry[]; methods: { id: string; label: string }[];
    statusLabels: Record<string, string>; canApprove: boolean;
}

export class FundsError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
}

const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const isForm = init.body instanceof FormData;
    const res = await fetch(`${API}/event-funds${path}`, {
        ...init,
        headers: { ...auth(), ...(isForm || !init.body ? {} : { 'Content-Type': 'application/json' }), ...(init.headers || {}) },
    });
    const { data, crudo, esJson } = await leerJson<any>(res);
    if (!esJson) throw new FundsError(describirNoJson(res, crudo), res.status);
    if (!res.ok) throw new FundsError(data?.error || `Error ${res.status}`, res.status);
    return data as T;
};

const ev = (eventId: string) => `/events/${encodeURIComponent(eventId)}`;

export const fundsApi = {
    overview: (eventId: string) => call<FundsOverview>(ev(eventId)),
    registration: (eventId: string, registrationId: string) =>
        call<RegistrationFundsDetail>(`${ev(eventId)}/registrations/${encodeURIComponent(registrationId)}`),
    saveConfig: (eventId: string, body: Record<string, unknown>) =>
        call<{ ok: true }>(`${ev(eventId)}/config`, { method: 'PUT', body: JSON.stringify(body) }),
    verifyStripe: (eventId: string, registrationIds?: string[]) =>
        call<{ verificadas: number; errores: number; revisadas: number; total: number; pendientes: number }>(
            `${ev(eventId)}/verify-stripe`, { method: 'POST', body: JSON.stringify(registrationIds ? { registrationIds } : {}) }),
    createTransfer: (eventId: string, form: FormData) =>
        call<{ ok: true; id: string; diferencia: number }>(`${ev(eventId)}/transfers`, { method: 'POST', body: form }),
    updateTransfer: (eventId: string, transferId: string, body: Record<string, unknown>) =>
        call<{ ok: true }>(`${ev(eventId)}/transfers/${transferId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    uploadDocument: (eventId: string, transferId: string, form: FormData) =>
        call<{ ok: true; id: string; version: number }>(`${ev(eventId)}/transfers/${transferId}/documents`, { method: 'POST', body: form }),
    documentUrl: (eventId: string, transferId: string, documentId: string) =>
        call<{ url: string; name: string }>(`${ev(eventId)}/transfers/${transferId}/documents/${documentId}`),
    previewNotice: (eventId: string, transferId: string) =>
        call<{ subject: string; text: string; html: string; confirmado: boolean; recipients: { name: string; email: string; role: string }[]; documents: { id: string; fileName: string; version: number; isCurrent: boolean }[] }>(
            `${ev(eventId)}/transfers/${transferId}/notices/preview`, { method: 'POST', body: '{}' }),
    sendNotice: (eventId: string, transferId: string, body: Record<string, unknown>) =>
        call<{ ok: boolean; state: string; error: string | null; repetida?: boolean }>(
            `${ev(eventId)}/transfers/${transferId}/notices`, { method: 'POST', body: JSON.stringify(body) }),
};

export const money = (n: number, c: string) => {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: c || 'USD',
            minimumFractionDigits: c === 'COP' ? 0 : 2, maximumFractionDigits: c === 'COP' ? 0 : 2,
        }).format(n || 0);
    } catch { return `${(n || 0).toFixed(2)} ${c}`; }
};
export const fecha = (v?: string | null) => {
    if (!v) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const fechaHora = (v?: string | null) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const STATUS_CLS: Record<string, string> = {
    pendiente: 'bg-gray-50 text-gray-700 border-gray-200',
    sin_traslado: 'bg-amber-50 text-amber-800 border-amber-200',
    registrado: 'bg-sky-50 text-sky-700 border-sky-200',
    pendiente_verificacion: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    parcial: 'bg-amber-50 text-amber-800 border-amber-200',
    confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rechazado: 'bg-red-50 text-red-700 border-red-200',
    revertido: 'bg-red-50 text-red-700 border-red-200',
    reembolsado: 'bg-rose-50 text-rose-700 border-rose-200',
    fallido: 'bg-red-50 text-red-700 border-red-200',
    enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    no_aplica: 'bg-white text-gray-400 border-gray-100',
};
