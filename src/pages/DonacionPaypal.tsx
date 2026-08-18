// El donante vuelve de PayPal. Acá se COBRA.
//
// v4.866 — PayPal separa aprobar de cobrar: el pedido queda aprobado y el cargo
// sólo ocurre cuando se captura. Ésta es la pantalla que lo dispara.
//
// ⚠️ NO ES LA CONFIRMACIÓN DE VERDAD. Si el donante cierra la pestaña antes de
// que esto termine, el aporte igual queda registrado: el webhook de PayPal es
// la red de seguridad y las dos vías convergen en el mismo registro
// idempotente. Es la misma regla que rige el módulo desde el principio — la
// confirmación la da el webhook, no el retorno del navegador.

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export default function DonacionPaypal() {
    const [params] = useSearchParams();
    const [estado, setEstado] = useState<'cobrando' | 'listo' | 'error'>('cobrando');
    const [detalle, setDetalle] = useState<string | null>(null);
    // ⚠️ Cobrar es una operación con dinero: en desarrollo React monta dos
    // veces y sin este candado se dispararían DOS capturas. PayPal es
    // idempotente por `PayPal-Request-Id` y nosotros por el índice único, así
    // que no cobraría dos veces — pero pedirlo dos veces igual está mal.
    const disparado = useRef(false);

    useEffect(() => {
        // PayPal devuelve el pedido en `token`; se acepta `orderId` por si
        // alguna vez cambia el nombre del parámetro.
        const orderId = params.get('token') || params.get('orderId') || '';
        if (!orderId) { setEstado('error'); setDetalle('No vino el identificador del pago.'); return; }
        if (disparado.current) return;
        disparado.current = true;

        (async () => {
            try {
                const r = await fetch(`${API_BASE}/financial/paypal/capture`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d?.error || 'No se pudo confirmar el pago.');
                setEstado('listo');
            } catch (e: any) {
                setEstado('error');
                setDetalle(e?.message || 'No se pudo confirmar el pago.');
            }
        })();
    }, [params]);

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
            <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-xl p-10">
                {estado === 'cobrando' && (
                    <>
                        <Loader2 className="w-12 h-12 mx-auto text-rotary-blue animate-spin mb-4" />
                        <h1 className="text-xl font-bold text-gray-900">Confirmando tu aporte…</h1>
                        <p className="text-sm text-gray-500 mt-2">No cierres esta ventana.</p>
                    </>
                )}
                {estado === 'listo' && (
                    <>
                        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500 mb-4" />
                        <h1 className="text-2xl font-black text-gray-900">¡Gracias por tu aporte!</h1>
                        <p className="text-gray-600 mt-3">
                            Tu contribución quedó registrada. Te enviamos el recibo al correo que indicaste.
                        </p>
                        <Link to="/" className="inline-block mt-6 bg-rotary-blue hover:bg-rotary-navy text-white font-bold rounded-xl px-6 py-3 transition-colors">
                            Volver al inicio
                        </Link>
                    </>
                )}
                {estado === 'error' && (
                    <>
                        <AlertCircle className="w-14 h-14 mx-auto text-amber-500 mb-4" />
                        <h1 className="text-xl font-bold text-gray-900">No pudimos confirmar el aporte</h1>
                        {/* El motivo se DICE: «algo salió mal» obliga a adivinar
                            si hay que volver a pagar o no. Y se aclara que el
                            cobro puede haber quedado registrado igual, porque
                            el webhook llega por su cuenta. */}
                        <p className="text-sm text-gray-600 mt-3">{detalle}</p>
                        <p className="text-xs text-gray-400 mt-3">
                            Si PayPal ya te cobró, el aporte queda registrado igual en cuanto nos llegue su
                            confirmación. No vuelvas a pagar: escribinos y lo verificamos.
                        </p>
                        <Link to="/" className="inline-block mt-6 text-rotary-blue font-bold">Volver al inicio</Link>
                    </>
                )}
            </div>
        </div>
    );
}
