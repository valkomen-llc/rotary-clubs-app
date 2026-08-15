import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Check, RefreshCw, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useClub } from '../contexts/ClubContext';
import DonationModal from './DonationModal';
import {
    getBlockIcon, getBlockTheme,
    RECURRING_INTERVAL_LABELS, RECURRING_INTERVAL_ORDER,
    type PaymentBlock, type RecurringIntervalKey,
} from '../lib/paymentBlocks';

const API = import.meta.env.VITE_API_URL || '/api';

// Tarjeta pública de un bloque de pago (donación / aporte / membresía).
//
// v4.808 — UN SOLO CAMINO DE COBRO. Hasta v4.807 el pago único agregaba al
// carrito, y ese camino NO COBRABA: `Checkout.tsx` creaba la orden y navegaba
// a «éxito» sin pasar jamás por Stripe, así que quien aportaba desde acá creía
// haber aportado y no había aportado. Ahora el botón abre el MISMO modal de
// donación de la página de Aportes y de las campañas —el único flujo que
// cobra de verdad (POST /financial/donate → Stripe Checkout → webhook)—.
//
// La tarjeta queda como PRESENTACIÓN (título, descripción, beneficios) y el
// formulario vive en el modal: es el formato que el equipo pidió conservar, y
// evita tener dos formularios de aporte que se separan en silencio.
//
// La MEMBRESÍA no cambia: tiene su propio flujo de suscripción
// (/financial/subscribe) y ése siempre funcionó.
//
// Consecuencia aceptada: ya no se pueden sumar varios aportes y pagarlos
// juntos. En la práctica nadie lo hacía —porque no cobraba—, y cada aporte
// como transacción propia es lo que permite atribuirlo a su causa y emitir su
// recibo. El carrito sigue existiendo para la TIENDA, que es donde tiene
// sentido.
const PaymentBlockCard: React.FC<{ block: PaymentBlock }> = ({ block }) => {
    const { club } = useClub();
    const [donateOpen, setDonateOpen] = useState(false);
    const theme = getBlockTheme(block.theme);
    const Icon = getBlockIcon(block.icon);

    // {club} → nombre del club.
    const tpl = (s: string) => (s || '').replace(/\{club\}/g, (club as any)?.name || 'nuestro club');
    // Formato de moneda según la moneda del club (COP sin decimales, etc.).
    const currency = ((club as any)?.currency || 'USD').toUpperCase();
    const fmt = (n: number) => {
        try {
            return new Intl.NumberFormat(currency === 'COP' ? 'es-CO' : 'en-US', {
                style: 'currency', currency, currencyDisplay: 'narrowSymbol',
                maximumFractionDigits: currency === 'COP' ? 0 : 2,
            }).format(n);
        } catch {
            return `$${n.toLocaleString()}`;
        }
    };

    const isRecurring = block.kind === 'membership' && block.recurring && block.recurringIntervals.length > 0;

    // ── Estado suscripción ──
    const orderedIntervals = RECURRING_INTERVAL_ORDER
        .map(k => block.recurringIntervals.find(r => r.key === k))
        .filter(Boolean) as { key: RecurringIntervalKey; amount: number }[];
    const [interval, setInterval] = useState<RecurringIntervalKey | ''>(orderedIntervals[0]?.key || '');
    const [subscribing, setSubscribing] = useState(false);
    const selectedInterval = orderedIntervals.find(iv => iv.key === interval);

    const handleSubscribe = async () => {
        if (!(club as any)?.id || !interval) return;
        setSubscribing(true);
        try {
            const res = await fetch(`${API}/financial/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId: (club as any).id,
                    blockId: block.id,
                    interval,
                    returnUrl: window.location.origin,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.url) throw new Error(data?.error || 'No se pudo iniciar la suscripción');
            window.location.href = data.url;
        } catch (e: any) {
            toast.error(e.message || 'Error al iniciar la suscripción');
            setSubscribing(false);
        }
    };

    return (
        <div className="bg-white rounded-3xl p-8 border border-gray-100 flex flex-col h-full">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${theme.bubble}`}>
                <Icon className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className="text-[26px] font-normal text-gray-900 tracking-tight leading-tight">{tpl(block.title)}</h2>
                {isRecurring && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <RefreshCw className="w-3 h-3" /> Recurrente
                    </span>
                )}
            </div>
            {block.description && (
                <p className="text-gray-500 text-sm mb-6 leading-relaxed whitespace-pre-line">{tpl(block.description)}</p>
            )}

            {block.benefits.length > 0 && (
                <ul className="space-y-2 mb-6">
                    {block.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <Check className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                            <span>{tpl(b)}</span>
                        </li>
                    ))}
                </ul>
            )}

            {isRecurring ? (
                /* ── Suscripción recurrente ── */
                <div className="flex-1 flex flex-col">
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">Elige la periodicidad</label>
                    <div className="relative mb-4">
                        <select
                            value={interval}
                            onChange={e => setInterval(e.target.value as RecurringIntervalKey)}
                            className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border-2 border-gray-200 bg-white font-bold text-gray-800 focus:border-emerald-400 outline-none cursor-pointer"
                        >
                            {orderedIntervals.map(iv => (
                                <option key={iv.key} value={iv.key}>
                                    {RECURRING_INTERVAL_LABELS[iv.key]} — {fmt(iv.amount)}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {selectedInterval && (
                        <div className="mb-6 flex items-baseline gap-2">
                            <span className="text-3xl font-normal text-gray-900">{fmt(selectedInterval.amount)}</span>
                            <span className="text-gray-500 text-sm">/ {RECURRING_INTERVAL_LABELS[selectedInterval.key].toLowerCase()}</span>
                        </div>
                    )}

                    <button
                        onClick={handleSubscribe}
                        disabled={!interval || subscribing}
                        className={`mt-auto w-full py-4 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${theme.button}`}
                    >
                        {subscribing ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirigiendo…</> : <>{block.buttonText || 'Suscribirme'} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                    <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                        <ShieldCheck className="w-3.5 h-3.5" /> Cobro automático seguro vía Stripe. Cancela cuando quieras.
                    </div>
                </div>
            ) : (
                /* ── Pago único: el modal de donación, que es el que cobra ── */
                <div className="flex-1 flex flex-col">
                    {block.presetAmounts.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                            {block.presetAmounts.map(amt => (
                                <span key={amt} className={`px-3 py-1.5 rounded-lg border-2 border-gray-100 text-sm font-bold text-gray-500`}>
                                    {fmt(amt)}
                                </span>
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => setDonateOpen(true)}
                        className={`mt-auto w-full py-4 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 group shadow-lg ${theme.button}`}
                    >
                        {block.buttonText || 'Aportar'}
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                        <ShieldCheck className="w-3.5 h-3.5" /> Pago seguro procesado por Stripe
                    </div>

                    <DonationModal
                        open={donateOpen}
                        onClose={() => setDonateOpen(false)}
                        clubId={(club as any)?.id || ''}
                        clubName={(club as any)?.name || ''}
                        currency={currency}
                        blockId={block.id}
                        title={tpl(block.title)}
                        subtitle={block.campaign ? tpl(block.campaign) : undefined}
                        presetAmounts={block.presetAmounts}
                        showMessage={block.showMessage}
                        showAnonymous={block.showAnonymous}
                    />
                </div>
            )}
        </div>
    );
};

export default PaymentBlockCard;
