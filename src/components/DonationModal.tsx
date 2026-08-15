import React, { useState } from 'react';
import { Heart, X, Check, Loader2, ShieldCheck } from 'lucide-react';
import { donationPresets } from '../lib/contributionSpec';

// ════════════════════════════════════════════════════════════════════
// El modal de donación — v4.804
//
// Extraído del inline de ManerasDeContribuir.tsx para que lo compartan la
// página genérica y la landing de campaña: dos modales se separan en
// silencio, y éste es el ÚNICO camino de cobro sano (POST /financial/donate
// → Stripe Checkout → webhook). El camino del carrito no cobra — ver
// CLAUDE.md, Campañas de Contribución.
//
// LA MONEDA ES LA DEL CLUB, y el modal la dice. Hasta v4.803 el rótulo decía
// «(USD)» con montos $10–$100 mientras el servidor cobraba en la moneda del
// club (Colombia → COP): «$50» eran 50 pesos. Los montos sugeridos y el
// mínimo salen de donationPresets(currency) — el MISMO criterio en el
// servidor y en este espejo.
//
// `campaignId` viaja al checkout cuando el aporte nace de una campaña: es lo
// que permite atribuir la donación (metadata de Stripe) sin tocar el modelo
// Donation. Sin campaña, el flujo es idéntico al de siempre.
// ════════════════════════════════════════════════════════════════════

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface DonationModalProps {
    open: boolean;
    onClose: () => void;
    clubId: string;
    clubName: string;
    currency?: string;          // la del club (by-domain); USD si no llega
    campaignId?: string | null; // atribución de campaña, opcional
    title?: string;             // «Haz tu Donación» por defecto
    subtitle?: string;
    accentColor?: string;       // hex del tema de la campaña; el carmesí de siempre por defecto
}

const DonationModal: React.FC<DonationModalProps> = ({
    open, onClose, clubId, clubName, currency = 'USD',
    campaignId = null, title, subtitle, accentColor,
}) => {
    const cur = String(currency || 'USD').toUpperCase();
    const presets = donationPresets(cur);
    const accent = /^#[0-9a-fA-F]{6}$/.test(accentColor || '') ? (accentColor as string) : '#9D2235';

    const [amount, setAmount] = useState<string>(String(presets.amounts[2] ?? presets.amounts[0] ?? ''));
    const [donorEmail, setDonorEmail] = useState('');
    const [donorName, setDonorName] = useState('');
    const [donorMessage, setDonorMessage] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!open) return null;

    const fmt = (n: number) => {
        try {
            return new Intl.NumberFormat(cur === 'COP' ? 'es-CO' : 'en-US', {
                style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol',
                maximumFractionDigits: cur === 'COP' ? 0 : 2,
            }).format(n);
        } catch {
            return `$${n.toLocaleString()}`;
        }
    };

    const handleDonate = async () => {
        setErrorMsg(null);
        const numericAmount = parseFloat(amount);
        if (!numericAmount || numericAmount < presets.min) {
            setErrorMsg(`Ingresa un monto válido (mínimo ${fmt(presets.min)}).`);
            return;
        }
        if (!donorEmail || !/^\S+@\S+\.\S+$/.test(donorEmail)) {
            setErrorMsg('Tu email es obligatorio para enviarte el recibo.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE}/financial/donate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId,
                    amount: numericAmount,
                    currency: cur,
                    frequency: 'one-time',
                    donorEmail,
                    donorName: isAnonymous ? '' : donorName,
                    message: donorMessage,
                    isAnonymous,
                    campaignId: campaignId || undefined,
                    returnUrl: window.location.origin,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.url) {
                throw new Error(data?.error || 'No pudimos iniciar el pago. Intenta de nuevo.');
            }
            window.location.href = data.url;
        } catch (err) {
            console.error('[Donate] Error:', err);
            const message = err instanceof Error ? err.message : 'Error inesperado iniciando el pago.';
            setErrorMsg(message);
            setSubmitting(false);
        }
    };

    const isPreset = presets.amounts.includes(Number(amount));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative my-8">
                <button
                    onClick={() => !submitting && onClose()}
                    disabled={submitting}
                    aria-label="Cerrar"
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10 disabled:opacity-50"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="p-8">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${accent}1A` }}>
                            <Heart className="w-8 h-8" style={{ color: accent }} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">{title || 'Haz tu Donación'}</h2>
                        <p className="text-gray-500 mt-2">{subtitle || `Apoya nuestras causas en el club ${clubName}`}</p>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-3">Selecciona el monto ({cur})</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                {presets.amounts.map((amt) => (
                                    <button
                                        key={amt}
                                        onClick={() => setAmount(String(amt))}
                                        className="py-3 px-1 rounded-lg font-bold transition-all border-2 text-sm"
                                        style={Number(amount) === amt
                                            ? { borderColor: accent, backgroundColor: `${accent}0D`, color: accent }
                                            : { borderColor: '#E5E7EB', color: '#4B5563' }}
                                    >
                                        {fmt(amt)}
                                    </button>
                                ))}
                            </div>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                <input
                                    type="number"
                                    min={presets.min}
                                    step="1"
                                    placeholder="Otro monto"
                                    value={isPreset ? '' : amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-lg outline-none transition-all font-semibold focus:border-gray-400"
                                />
                            </div>
                        </div>

                        <div className="space-y-3 pt-1">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Tu email (para el recibo)</label>
                                <input
                                    type="email"
                                    placeholder="tu@correo.com"
                                    value={donorEmail}
                                    onChange={(e) => setDonorEmail(e.target.value)}
                                    required
                                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg outline-none transition-all text-sm focus:border-gray-400"
                                />
                            </div>

                            {!isAnonymous && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Nombre (opcional)</label>
                                    <input
                                        type="text"
                                        placeholder="Tu nombre"
                                        value={donorName}
                                        onChange={(e) => setDonorName(e.target.value)}
                                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg outline-none transition-all text-sm focus:border-gray-400"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Mensaje (opcional)</label>
                                <textarea
                                    placeholder="¿Quieres dejar un mensaje?"
                                    value={donorMessage}
                                    onChange={(e) => setDonorMessage(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg outline-none transition-all text-sm resize-none focus:border-gray-400"
                                />
                            </div>

                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={isAnonymous}
                                    onChange={(e) => setIsAnonymous(e.target.checked)}
                                    className="w-4 h-4"
                                    style={{ accentColor: accent }}
                                />
                                Quiero donar como anónimo
                            </label>
                        </div>

                        {errorMsg && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                                {errorMsg}
                            </div>
                        )}

                        <button
                            onClick={handleDonate}
                            disabled={submitting}
                            className="w-full disabled:bg-gray-400 disabled:cursor-wait text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 mt-2 hover:brightness-90"
                            style={{ backgroundColor: submitting ? undefined : accent }}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Conectando con Stripe…
                                </>
                            ) : (
                                <>
                                    Donar Ahora
                                    <Check className="w-5 h-5" />
                                </>
                            )}
                        </button>

                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Pago seguro procesado por Stripe
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DonationModal;
