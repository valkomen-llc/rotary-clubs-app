export declare const MANUAL_CONFIRMABLE_STATUSES: string[];
export declare const MANUAL_PAYMENT_METHODS: string[];
export declare const MANUAL_CURRENCIES: string[];
export declare const manualConfirmVerdict: (registration?: { status?: string | null }) => { ok: true } | { ok: false; reason: string };
export declare const validateManualPayment: (body?: Record<string, unknown>, opts?: { receiptAttached?: boolean; now?: number }) =>
    | { ok: true; value: { reference: string; paidAt: Date; amount: number; currency: string; method: string; evidence: string | null; reason: string; notify: boolean } }
    | { ok: false; error: string };
export declare const EVENT_MANUAL_RECEIPT_PREFIX: string;
export declare const eventManualReceiptPrefix: (eventId: string, registrationId: string) => string | null;
export declare const eventManualReceiptBelongs: (key: string, eventId: string, registrationId: string) => boolean;
export interface ManualPaymentView {
    reference: string | null; paidAt: string | null; method: string | null; evidence: string | null;
    reason: string | null; by: string | null; confirmedAt: string | null;
    receipt: { name: string; mime: string | null; bytes: number | null } | null;
}
export declare const manualPaymentView: (payload: unknown) => ManualPaymentView | null;
declare const _default: Record<string, unknown>;
export default _default;
