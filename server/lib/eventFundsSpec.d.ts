// Tipos de `eventFundsSpec.js` para el panel, que importa el MISMO archivo que
// usa el servidor (una sola fuente de verdad).

export type PagoState = 'confirmado' | 'pendiente' | 'fallido' | 'reembolsado' | 'disputa';
export type StripeState = 'verificado' | 'pendiente';
export type LiquidacionState = 'pendiente' | 'por_liberar' | 'disponible' | 'reembolsado';
export type TrasladoState = 'no_registrado' | 'parcial' | 'confirmado' | 'no_aplica';
export type ComprobanteState = 'no_aplica' | 'pendiente' | 'enviado' | 'error';

export interface FundStates {
    pago: PagoState;
    stripe: StripeState;
    liquidacion: LiquidacionState;
    traslado: TrasladoState;
    comprobante: ComprobanteState;
}

export interface FundItemLike {
    id?: string;
    status?: string;
    bucket?: string;
    financialBucket?: string;
    amount?: number;
    grossAmount?: number;
    fee?: number;
    currency?: string;
    disbursedAmount?: number;
    stripeBalanceTxId?: string | null;
    states?: FundStates;
}

export interface FundTotals {
    currency: string;
    pagos: number;
    bruto: number;
    comisiones: number;
    neto: number;
    reembolsado: number;
    enLiquidacion: number;
    disponible: number;
    trasladado: number;
    pendienteTraslado: number;
    verificados: number;
    comprobantesEnviados: number;
}

export const PAID_REGISTRATION_STATUSES: string[];
export const FUND_STATE_LABELS: {
    pago: Record<PagoState, string>;
    stripe: Record<StripeState, string>;
    liquidacion: Record<LiquidacionState, string>;
    traslado: Record<TrasladoState, string>;
    comprobante: Record<ComprobanteState, string>;
};
export function stripeRefsOf(reg?: Record<string, any>): string[];
export function matchRegistrationsToPayments<R extends Record<string, any>>(
    registrations?: R[], payments?: { id: string; providerRef?: string | null }[]
): { byPayment: Record<string, R>; paymentIds: string[]; sinMovimiento: R[]; sinReferencia: R[] };
export function fundStatesOf(item?: FundItemLike, options?: { notices?: { paymentIds?: string[]; state?: string }[] }): FundStates;
export function registrationFundBadge(states: FundStates | null | undefined): { key: string; label: string };
export function eventFundTotals(items?: FundItemLike[]): FundTotals[];
