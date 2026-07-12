import React, { useState } from 'react';
import { DollarSign, ArrowRight, ShieldCheck, Check } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import {
    PaymentBlock, getBlockIcon, getBlockTheme, cartTypeForKind,
} from '../lib/paymentBlocks';

// Tarjeta pública de un bloque de pago (donación / aporte / membresía).
const PaymentBlockCard: React.FC<{ block: PaymentBlock }> = ({ block }) => {
    const { addToCart } = useCart();
    const theme = getBlockTheme(block.theme);
    const Icon = getBlockIcon(block.icon);

    const initial = block.defaultAmount ?? block.presetAmounts[0] ?? '';
    const [amount, setAmount] = useState<number | ''>(initial);
    const [message, setMessage] = useState('');
    const [anon, setAnon] = useState(false);

    const isPreset = typeof amount === 'number' && block.presetAmounts.includes(amount);

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

    return (
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all flex flex-col">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${theme.bubble}`}>
                <Icon className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">{block.title}</h2>
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

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                {block.presetAmounts.length > 0 && (
                    <div className={`grid gap-3 mb-4 ${block.presetAmounts.length >= 3 ? 'grid-cols-2' : 'grid-cols-2'}`}>
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
        </div>
    );
};

export default PaymentBlockCard;
