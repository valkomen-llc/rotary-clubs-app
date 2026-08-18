import React, { useEffect, useState } from 'react';
import { Heart, X, Check, Loader2, ShieldCheck, Globe } from 'lucide-react';
import { donationPresets } from '../lib/contributionSpec';
import { blockAmountsApply, type CurrencyDecision } from '../lib/donationCurrency';
import { useLang } from '../contexts/LanguageContext';
// El espejo del criterio de conversión: se convierte acá para poder DECIRLE
// al visitante qué se le va a cobrar antes de mandarlo a PayPal.
import { convertWithRate, formatConverted } from '../lib/fxRates';

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

/** Las dos vías de cobro. */
type Via = 'card' | 'paypal';

/** Lo que el servidor contesta sobre PayPal para ESTE aporte. Incluye la
 *  conversión cuando la cuenta no cobra en la moneda que se publicó. */
interface PaypalInfo {
    available: boolean;
    message?: string | null;
    currency?: string;
    originalCurrency?: string;
    converted?: boolean;
    perUnit?: number | null;
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
    // ⚠️ QUÉ VÍA se está usando, no un booleano: con dos botones, `true` no
    // dice cuál girar y los dos quedarían en «Conectando…» a la vez.
    const [submitting, setSubmitting] = useState<Via | null>(null);
    // Si PayPal se puede ofrecer para ESTE aporte. Lo decide el servidor: la
    // moneda la resuelve él (v4.834) y las credenciales no viajan al navegador.
    const [paypal, setPaypal] = useState<PaypalInfo | null>(null);
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
                // Se pregunta si PayPal se puede ofrecer para este aporte. El
                // botón NO se pinta hasta saberlo: uno que lleva a un error del
                // proveedor es peor que ninguno (v4.650).
                fetch(`${API_BASE}/financial/paypal/available?clubId=${encodeURIComponent(clubId)}&lang=${encodeURIComponent(lang || '')}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(d => d && setPaypal(d))
                    .catch(() => setPaypal({ available: false }));
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

    // ⚠️ QUÉ SE LE VA A COBRAR POR PAYPAL, dicho ANTES de salir hacia allá.
    //
    // PayPal no procesa todas las monedas —los pesos colombianos, por ejemplo,
    // no— así que cuando la cuenta cobra en otra, el importe se convierte con
    // la tasa que el operador configuró. Eso sólo es legítimo si se LEE: quien
    // eligió «$ 100.000» tiene que ver «se te cobrarán US$ 24,80» antes de
    // pulsar. Convertir en silencio sería cambiarle el trato a mitad de camino.
    //
    // Se calcula acá y no se pide al servidor porque sería un viaje de red por
    // pulsación; el criterio es el MISMO módulo, espejado y comparado por
    // salidas en la prueba.
    const conversionPaypal = (() => {
        if (!paypal?.available || !paypal.converted || !paypal.perUnit) return null;
        const n = parseFloat(amount);
        if (!Number.isFinite(n) || n <= 0) return null;
        const c = convertWithRate(n, paypal.originalCurrency || cur, paypal.currency || 'USD', paypal.perUnit);
        return c.ok ? c : null;
    })();

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

    const handleDonate = async (via: Via = 'card') => {
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

        setSubmitting(via);
        try {
            const res = await fetch(`${API_BASE}${via === 'paypal' ? '/financial/paypal/create' : '/financial/donate'}`, {
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
            setSubmitting(null);
        }
    };

    const isPreset = presets.amounts.includes(Number(amount));
    const mostrarNombre = showAnonymous && !isAnonymous;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            {/* ⚠️ `max-h` + desplazamiento PROPIO. Con el panel más alto que la
                ventana, un flex centrado RECORTA POR ARRIBA —el navegador no
                deja desplazarse hacia el margen negativo— y se pierden la cruz
                de cerrar y la cabecera. Es lo que se reportó al aparecer el
                segundo botón. Acotado a la ventana, el panel nunca se recorta;
                en una pantalla normal entra entero y no aparece ninguna barra,
                que es lo que se pidió. */}
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative max-h-[calc(100vh-2rem)] overflow-y-auto">
                <button
                    onClick={() => !submitting && onClose()}
                    disabled={!!submitting}
                    aria-label="Cerrar"
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10 disabled:opacity-50"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Compactado en v4.872: con las dos vías de pago el formulario
                    no entraba en una pantalla de portátil. Se aprieta el
                    respiro, no el contenido — no se quitó ningún campo ni
                    ningún dato de la conversión. */}
                <div className="px-6 py-5 sm:px-8">
                    <div className="text-center mb-4">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2" style={{ backgroundColor: `${accent}1A` }}>
                            <Heart className="w-5 h-5" style={{ color: accent }} />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">{title || 'Haz tu Donación'}</h2>
                        <p className="text-[13px] leading-snug text-gray-500 mt-1.5">{subtitle || `Apoya nuestras causas en el club ${clubName}`}</p>
                    </div>

                    <div className="space-y-3.5">
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
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Selecciona el monto ({cur})</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                                {presets.amounts.map((amt) => (
                                    <button
                                        key={amt}
                                        onClick={() => setAmount(String(amt))}
                                        className="py-2.5 px-1 rounded-lg font-bold transition-all border-2 text-sm"
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
                                    className="w-full pl-8 pr-4 py-2.5 border-2 border-gray-200 rounded-lg outline-none transition-all font-semibold focus:border-gray-400"
                                />
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            {/* Dos campos cortos apilados cuestan una fila
                                entera —~62 px medidos—, y era la que dejaba el
                                pie fuera de la pantalla. Van a la par cuando
                                los dos se muestran; con el nombre oculto, el
                                correo ocupa el ancho completo en vez de dejar
                                media fila vacía. */}
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                <div className={mostrarNombre ? '' : 'sm:col-span-2'}>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Tu email (para el recibo)</label>
                                    <input
                                        type="email"
                                        placeholder="tu@correo.com"
                                        value={donorEmail}
                                        onChange={(e) => setDonorEmail(e.target.value)}
                                        required
                                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg outline-none transition-all text-sm focus:border-gray-400"
                                    />
                                </div>

                                {mostrarNombre && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Nombre (opcional)</label>
                                        <input
                                            type="text"
                                            placeholder="Tu nombre"
                                            value={donorName}
                                            onChange={(e) => setDonorName(e.target.value)}
                                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg outline-none transition-all text-sm focus:border-gray-400"
                                        />
                                    </div>
                                )}
                            </div>

                            {showMessage && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Mensaje (opcional)</label>
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

                        {/* La vía de la TARJETA. El rótulo dice con qué se paga:
                            con dos botones, «Donar ahora» a secas no distingue. */}
                        <button
                            onClick={() => handleDonate('card')}
                            disabled={!!submitting}
                            className="w-full disabled:bg-gray-400 disabled:cursor-wait text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 hover:brightness-90"
                            style={{ backgroundColor: submitting ? undefined : accent }}
                        >
                            {submitting === 'card' ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Conectando con Stripe…
                                </>
                            ) : (
                                <>
                                    Donar ahora con tarjeta de débito o crédito
                                    <Check className="w-5 h-5" />
                                </>
                            )}
                        </button>

                        {/* La vía de PAYPAL. Sólo si el servidor dijo que se puede:
                            sin credenciales, o sin una tasa configurada cuando
                            la cuenta cobra en otra moneda, no se pinta. */}
                        {/* Los MISMOS cuatro datos que antes —moneda de cobro,
                            importe convertido, importe original y tasa— en dos
                            líneas en vez de cuatro. Se acorta la redacción, no
                            lo que se dice: quitar la tasa o el importe original
                            dejaría la conversión sin poder comprobarse. */}
                        {paypal?.available && conversionPaypal && (
                            <p className="text-[11px] leading-snug text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                                PayPal cobra en <b data-no-translate>{conversionPaypal.currency}</b>:{' '}
                                <b data-no-translate>
                                    {formatConverted(conversionPaypal.amount!, conversionPaypal.currency!)}
                                </b>{' '}
                                por tus{' '}
                                <span data-no-translate>
                                    {formatConverted(conversionPaypal.originalAmount!, conversionPaypal.originalCurrency!)}
                                </span>{' '}
                                (<span data-no-translate>
                                    {conversionPaypal.perUnit!.toLocaleString('es-CO')} por {conversionPaypal.currency}
                                </span>). Con tarjeta se cobra en{' '}
                                <span data-no-translate>{cur}</span>.
                            </p>
                        )}
                        {paypal?.available && (
                            <button
                                onClick={() => handleDonate('paypal')}
                                disabled={!!submitting}
                                className="w-full disabled:opacity-60 disabled:cursor-wait bg-[#FFC439] hover:bg-[#F0B72C] text-[#003087] font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                            >
                                {submitting === 'paypal' ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Conectando con PayPal…
                                    </>
                                ) : (
                                    <span data-no-translate>Donar a través de PayPal</span>
                                )}
                            </button>
                        )}

                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {paypal?.available
                                ? 'Pago seguro procesado por Stripe o PayPal'
                                : 'Pago seguro procesado por Stripe'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DonationModal;
