import React, { useEffect, useState } from 'react';
import { Heart, X, Check, Loader2, ShieldCheck, Globe } from 'lucide-react';
import { donationPresets } from '../lib/contributionSpec';
import { blockAmountsApply, type CurrencyDecision } from '../lib/donationCurrency';
import { useLang } from '../contexts/LanguageContext';

// ════════════════════════════════════════════════════════════════════
// El modal de donación — v4.804
//
// Extraído del inline de ManerasDeContribuir.tsx para que lo compartan la
// página genérica y la landing de campaña: dos modales se separan en
// silencio, y éste es el ÚNICO camino de cobro sano (POST /financial/donate
// → Stripe Checkout → webhook). El camino del carrito no cobra — ver
// CLAUDE.md, Campañas de Contribución.
//
// LA MONEDA LA DECIDE EL SERVIDOR, y el modal la dice. Hasta v4.803 el rótulo
// decía «(USD)» con montos $10–$100 mientras se cobraba en la moneda del club
// (Colombia → COP): «$50» eran 50 pesos. Los montos sugeridos y el mínimo
// salen de donationPresets(currency) — el MISMO criterio en las dos puntas.
//
// Desde v4.834 la moneda ya no es siempre la del sitio: un visitante que lee
// la página en un idioma internacional, o que llega desde otro país, paga en
// dólares. Eso NO se decide acá —el país sale del encabezado del borde y sólo
// el servidor lo ve—, así que el modal lo PREGUNTA al abrirse
// (`/financial/currency`). Mientras la respuesta no llega no se puede pintar
// un monto: ofrecer «50.000» a alguien a quien se le van a cobrar dólares es
// el defecto más caro que este cambio puede introducir.
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
    blockId?: string | null;    // bloque de Aportes del que nació (v4.808)
    title?: string;             // «Haz tu Donación» por defecto
    subtitle?: string;
    accentColor?: string;       // hex del tema de la campaña; el carmesí de siempre por defecto
    // Un bloque de Aportes puede traer sus propios montos sugeridos y decidir
    // qué campos ofrece. Sin nada de esto, el modal se comporta como siempre.
    presetAmounts?: number[];
    showMessage?: boolean;
    showAnonymous?: boolean;
}

const DonationModal: React.FC<DonationModalProps> = ({
    open, onClose, clubId, clubName, currency = 'USD',
    campaignId = null, blockId = null, title, subtitle, accentColor,
    presetAmounts, showMessage = true, showAnonymous = true,
}) => {
    // TODOS los hooks van ARRIBA, antes del `return null` de más abajo: es la
    // regla de `check:hooks` — un hook escrito debajo de un return temprano no
    // corre en el primer render y sí en el segundo, y React aborta el árbol.
    const { lang } = useLang();
    const [decision, setDecision] = useState<CurrencyDecision | null>(null);
    const [amount, setAmount] = useState<string>('');
    const [donorEmail, setDonorEmail] = useState('');
    const [donorName, setDonorName] = useState('');
    const [donorMessage, setDonorMessage] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // La moneda se PREGUNTA: depende del país del visitante, que sólo el
    // servidor ve. Se consulta al abrir y al cambiar de idioma —cambiar el
    // selector a inglés cambia la moneda, y el modal tiene que enterarse sin
    // recargar—. Ante cualquier fallo se cae a la del sitio, que es lo que
    // hacía antes de v4.834: no poder aportar sería peor que aportar en la
    // moneda de siempre.
    useEffect(() => {
        if (!open || !clubId) return;
        let vivo = true;
        const siteCur = String(currency || 'USD').toUpperCase();
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/financial/currency?clubId=${encodeURIComponent(clubId)}&lang=${encodeURIComponent(lang || '')}`);
                const d = await r.json();
                if (!vivo) return;
                if (!r.ok || !d?.currency) throw new Error('sin moneda');
                setDecision(d);
            } catch {
                if (vivo) setDecision({ currency: siteCur, siteCurrency: siteCur, international: false, reason: 'disabled' });
            }
        })();
        return () => { vivo = false; };
    }, [open, clubId, lang, currency]);

    const cur = (decision?.currency || String(currency || 'USD')).toUpperCase();
    const base = donationPresets(cur);
    // Los montos del bloque mandan sobre los de la moneda... PERO SÓLO EN SU
    // MONEDA. El club los eligió en la del sitio: ofrecer «50.000» a alguien a
    // quien se le van a cobrar dólares invitaría a un aporte de US$ 50.000. No
    // se convierten —no hay tasa configurada y inventarla está prohibido—: se
    // reemplazan por los propios de la moneda.
    const usarDelBloque = Array.isArray(presetAmounts) && presetAmounts.length > 0
        && blockAmountsApply(decision?.siteCurrency || currency, cur);
    const presets = {
        amounts: usarDelBloque ? presetAmounts!.filter(n => Number(n) > 0) : base.amounts,
        min: base.min,
    };
    const accent = /^#[0-9a-fA-F]{6}$/.test(accentColor || '') ? (accentColor as string) : '#9D2235';

    // El monto sugerido sigue a la moneda: si llega la decisión y el visitante
    // no escribió nada, se repone con el de la moneda que de verdad se cobra.
    const sugerido = String(presets.amounts[2] ?? presets.amounts[0] ?? '');
    useEffect(() => {
        if (!open) return;
        setAmount(prev => (prev === '' || presets.amounts.every(a => String(a) !== prev) ? sugerido : prev));
        // `sugerido` cambia con la moneda; el resto de los montos vienen de ahí.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sugerido]);

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
                    blockId: blockId || undefined,
                    // El idioma ACTIVO: es lo que el servidor necesita para
                    // resolver la MISMA moneda que se acaba de mostrar. El país
                    // no se manda — lo lee del encabezado del borde.
                    lang: lang || '',
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
                        {/* Por qué se cobra en dólares. Sin esta línea, un
                            rotario colombiano de viaje —o cualquiera con el
                            sitio en inglés— ve «USD» donde esperaba pesos y no
                            tiene forma de saber si es un error. El motivo va en
                            la moneda del visitante, no en jerga interna. */}
                        {decision?.international && (
                            <p className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                                <Globe className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>
                                    {decision.reason === 'foreign_country'
                                        ? 'Tu aporte se procesa en dólares porque estás fuera del país del sitio.'
                                        : 'Tu aporte se procesa en dólares porque estás viendo el sitio en un idioma internacional.'}
                                </span>
                            </p>
                        )}
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

                            {showAnonymous && !isAnonymous && (
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

                            {showMessage && (
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
                            )}

                            {showAnonymous && (
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
                            )}
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
