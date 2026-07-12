import React, { useState } from 'react';
import { DollarSign, ArrowRight, ShieldCheck, Check, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '../contexts/CartContext';
import { useClub } from '../contexts/ClubContext';
import {
    PaymentBlock, getBlockIcon, getBlockTheme, cartTypeForKind,
    RECURRING_INTERVAL_LABELS, RECURRING_INTERVAL_ORDER, RecurringIntervalKey,
} from '../lib/paymentBlocks';

const API = import.meta.env.VITE_API_URL || '/api';

// Tarjeta pública de un bloque de pago (donación / aporte / membresía).
const PaymentBlockCard: React.FC<{ block: PaymentBlock }> = ({ block }) => {
    const { addToCart } = useCart();
    const { club } = useClub();
    const theme = getBlockTheme(block.theme);
    const Icon = getBlockIcon(block.icon);

    const isRecurring = block.kind === 'membership' && block.recurring && block.recurringIntervals.length > 0;

    // ── Estado pago único ──
    const initial = block.defaultAmount ?? block.presetAmounts[0] ?? '';
    const [amount, setAmount] = useState<number | ''>(initial);
    const [message, setMessage] = useState('');
    const [anon, setAnon] = useState(false);
    const isPreset = typeof amount === 'number' && block.presetAmounts.includes(amount);

    // ── Estado suscripción ──
    const orderedIntervals = RECURRING_INTERVAL_ORDER
        .map(k => block.recurringIntervals.find(r => r.key === k))
        .filter(Boolean) as { key: RecurringIntervalKey; amount: number }[];
    const [interval, setInterval] = useState<RecurringIntervalKey | ''>(orderedIntervals[0]?.key || '');
    const [subscribing, setSubscribing] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalAmount = Number(amount);
        if (!finalAmount || finalAmount < 1) return;
        addToCart({
            type: cartTypeForKind(block.kind),
            title: block.title,
            qty: 1,
            unitPrice: finalAmount,
            metadata: {
                blockId: block.id,
                kind: block.kind,
                campaign: block.campaign,
                ...(block.showMessage ? { message } : {}),
                ...(block.showAnonymous ? { isAnonymous: anon } : {}),
            },
        });
        setAmount(initial);
        setMessage('');
        setAnon(false);
    };

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
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all flex flex-col">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${theme.bubble}`}>
                <Icon className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">{block.title}</h2>
                {isRecurring && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <RefreshCw className="w-3 h-3" /> Recurrente
                    </span>
                )}
            </div>
            {block.description && (
                <p className="text-gray-500 text-sm mb-6 leading-relaxed">{block.description}</p>
            )}

            {block.benefits.length > 0 && (
                <ul className="space-y-2 mb-6">
                    {block.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <Check className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                            <span>{b}</span>
                        </li>
                    ))}
                </ul>
            )}

            {isRecurring ? (
                /* ── Suscripción recurrente ── */
                <div className="flex-1 flex flex-col">
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">Elige la periodicidad</label>
                    <div className="space-y-2 mb-6">
                        {orderedIntervals.map(iv => (
                            <button
                                key={iv.key}
                                type="button"
                                onClick={() => setInterval(iv.key)}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${interval === iv.key ? theme.ring : 'border-gray-100 hover:border-gray-200'}`}
                            >
                                <span className="font-bold text-sm">{RECURRING_INTERVAL_LABELS[iv.key]}</span>
                                <span className="font-black">${iv.amount.toLocaleString()}</span>
                            </button>
                        ))}
                    </div>
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
                /* ── Pago único ── */
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                    {block.presetAmounts.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {block.presetAmounts.map(amt => (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => setAmount(amt)}
                                    className={`py-3 rounded-xl border-2 font-black transition-all ${amount === amt ? theme.ring : 'border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'}`}
                                >
                                    ${amt}
                                </button>
                            ))}
                        </div>
                    )}

                    {block.allowCustom && (
                        <div className="relative mb-4">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <DollarSign className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                                type="number"
                                min="1"
                                placeholder={block.presetAmounts.length > 0 ? 'Otro monto' : 'Monto'}
                                value={isPreset ? '' : (amount === '' ? '' : amount)}
                                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                                required={block.presetAmounts.length === 0}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-bold text-gray-900"
                            />
                        </div>
                    )}

                    {block.showMessage && (
                        <input
                            type="text"
                            placeholder="Mensaje o dedicatoria (opcional)"
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none text-sm mb-4"
                        />
                    )}

                    {block.showAnonymous && (
                        <label className="flex items-center gap-3 mb-6 cursor-pointer group">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${anon ? 'bg-rotary-blue border-rotary-blue' : 'border-gray-300 group-hover:border-rotary-blue'}`}>
                                {anon && <ShieldCheck className="w-3 h-3 text-white" />}
                            </div>
                            <span className="text-sm font-bold text-gray-500 group-hover:text-gray-900 transition-colors">Aportar como anónimo</span>
                            <input type="checkbox" className="hidden" checked={anon} onChange={e => setAnon(e.target.checked)} />
                        </label>
                    )}

                    <button
                        type="submit"
                        disabled={!amount || Number(amount) < 1}
                        className={`mt-auto w-full py-4 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${theme.button}`}
                    >
                        {block.buttonText || 'Aportar'}
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                </form>
            )}
        </div>
    );
};

export default PaymentBlockCard;
