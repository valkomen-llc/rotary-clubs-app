// Tipos de `eventFundsSpec.js` para el panel, que importa el MISMO archivo que
// usa el servidor (una sola fuente de verdad).

export type TransferStatus = 'pendiente' | 'registrado' | 'pendiente_verificacion' | 'confirmado' | 'rechazado' | 'revertido';
export type RegistrationTransferState = 'no_aplica' | 'sin_traslado' | 'pendiente' | 'registrado' | 'pendiente_verificacion' | 'parcial' | 'confirmado';
export type PaymentStatus = 'confirmado' | 'pendiente' | 'fallido' | 'reembolsado';

export interface StripeCheckInfo {
    checkedAt: string | null; status: string | null; fee: number; net: number; gross: number;
    currency: string; availableOn: string | null; balanceTxId: string | null; error: string | null;
}
export interface PaymentInfo {
    status: PaymentStatus; currency: string; charged: number; surcharge: number; eventAmount: number;
    refunded: number; paidAt: string | null; paymentIntentId: string | null; checkoutSessionId: string | null;
    chargeId: string | null; receiptUrl: string | null; viaStripe: boolean; stripe: StripeCheckInfo | null;
}
export interface AllocationLike { transferId?: string; transferStatus?: string; amount?: number | string }

export const PAID_REGISTRATION_STATUSES: string[];
export const TRANSFER_STATUSES: TransferStatus[];
export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string>;
export const CLOSED_TRANSFER_STATUSES: TransferStatus[];
export const REGISTRATION_TRANSFER_LABELS: Record<RegistrationTransferState, string>;
export const TRANSFER_METHODS: { id: string; label: string }[];
export const PDF_MAX_BYTES: number;

export function isActiveTransfer(t: { status?: string } | null | undefined): boolean;
export function canTransition(from: string, to: string, ctx?: { hasDocument?: boolean; reference?: string; reason?: string }): { ok: boolean; error?: string };
export function paymentOf(reg?: Record<string, any>, payments?: Record<string, any>[], stripeCheck?: Record<string, any> | null): PaymentInfo;
export function registrationTransferState(payment: PaymentInfo | null | undefined, allocations?: AllocationLike[]): RegistrationTransferState;
export function allocatedOf(allocations?: AllocationLike[], options?: { exceptTransferId?: string | null }): number;
export function validateTransfer(
    input?: { currency?: string; amount?: number; allocations?: { registrationId: string; amount: number }[]; kind?: string },
    ctx?: { registrations?: Record<string, any>; paymentsByRegistration?: Record<string, PaymentInfo>; allocationsByRegistration?: Record<string, AllocationLike[]>; exceptTransferId?: string | null }
): { ok: boolean; errores: string[]; asignado: number; diferencia: number };
export function checkPdf(input?: { mime?: string; bytes?: number; head?: string }): { ok: boolean; errores: string[] };
export function maskAccount(value: unknown): string;
export function isEmail(value: unknown): boolean;
export function transferEmail(input?: {
    eventTitle?: string; beneficiary?: string; transfer?: Record<string, any>; allocationsCount?: number; recipientName?: string;
}): { subject: string; text: string; html: string; confirmado: boolean };
export function eventFundTotals(rows?: Record<string, any>[], transfers?: Record<string, any>[]): Record<string, any>[];
