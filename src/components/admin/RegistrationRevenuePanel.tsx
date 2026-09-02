// Lo que la plataforma ha comisionado en las INSCRIPCIONES — v4.984
//
// ═════════════════════════════════════════════════════════════════════
// ES LA PREGUNTA CONTRARIA A LA DE LA BÓVEDA
// ═════════════════════════════════════════════════════════════════════
//
// En «Maneras de Contribuir» la comisión se DESCUENTA del receptor: el
// aportante da 100, la organización recibe 95, y eso es lo que suman las
// tarjetas de arriba. En las inscripciones se le SUMA a quien paga (v4.980):
// el precio publicado es lo que la organización tiene que recibir, así que el
// recargo lo paga de más quien se inscribe. Son dos cifras distintas y por eso
// esta sección va aparte y NUNCA se suma con aquéllas.
//
// ⚠️ Y NO TODO EL RECARGO ES INGRESO. La línea del traslado interbancario es
// lo que la plataforma monetiza; la de la pasarela se cobra para cubrir al
// procesador. Presentarlas juntas diría que ganamos casi el 5 %.

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Percent, Info, AlertCircle } from 'lucide-react';
import { formatMoney } from '../../lib/locale';
import { useLang } from '../../contexts/LanguageContext';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

interface FilaMoneda {
    currency: string;
    cobros: number;
    conDesglose: number;
    sinDesglose: number;
    total: number;
    ours: number;
    passthrough: number;
    unknown: number;
    byLine: Record<string, number>;
}
interface FilaFlujo extends FilaMoneda { flow: string }
interface Linea { key: string; label: string; ours: boolean; note: string }

interface Respuesta {
    generadoEn: string;
    monedas: FilaMoneda[];
    flujos: FilaFlujo[];
    flujosDeclarados: { key: string; label: string }[];
    lineas: Record<string, Linea>;
    lineasDesconocidas: string[];
    cobros: number;
}

export default function RegistrationRevenuePanel() {
    const { lang } = useLang();
    const [datos, setDatos] = useState<Respuesta | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let vivo = true;
        const token = localStorage.getItem('rotary_token');
        axios.get(`${API_URL}/payouts/admin/registration-revenue`,
            { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
            .then(r => { if (vivo) setDatos(r.data); })
            .catch(e => {
                if (!vivo) return;
                // El motivo distingue tres averías que se corrigen en sitios
                // distintos: la sesión vencida, el permiso y el servidor.
                const s = e?.response?.status;
                setError(s === 401 ? 'Tu sesión venció. Vuelve a entrar.'
                    : s === 403 ? 'Esta vista es del operador de la plataforma.'
                    : !e?.response ? 'No hubo respuesta del servidor.'
                    : 'No se pudo consultar lo comisionado.');
            })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, []);

    const money = (v: number, c: string) => formatMoney(v, c, lang);

    if (cargando) {
        return (
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="h-5 w-64 animate-pulse rounded bg-gray-100" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900">{error}</p>
            </div>
        );
    }

    const monedas = datos?.monedas || [];
    const lineas = datos?.lineas || {};
    const flujoLabel = (k: string) =>
        datos?.flujosDeclarados?.find(f => f.key === k)?.label || k;

    return (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Percent className="w-4 h-4 text-violet-600" aria-hidden="true" />
                    Comisionado por inscripciones
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                    El recargo que se le suma a quien se inscribe en la Feria de Proyectos y en el
                    registro de asistentes. No se suma con las tarjetas de arriba: allí la comisión se
                    descuenta de lo recaudado y aquí se cobra por encima del precio publicado.
                </p>
            </div>

            {monedas.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500">
                    Todavía no hay inscripciones pagadas con recargo.
                </p>
            ) : (
                <div className="divide-y divide-gray-100">
                    {monedas.map(m => {
                        const flujos = (datos?.flujos || []).filter(f => f.currency === m.currency);
                        return (
                            <div key={m.currency} className="px-5 py-4">
                                <div className="flex flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400"
                                            data-no-translate>{m.currency}</span>
                                        <p className="text-2xl font-bold text-violet-700" data-no-translate>
                                            {money(m.ours, m.currency)}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {lineas.transfer?.label || 'Traslado interbancario'} · lo que
                                            comisiona la plataforma
                                        </p>
                                    </div>
                                    <div className="text-right text-xs text-gray-500">
                                        <p>
                                            <span data-no-translate>{money(m.passthrough, m.currency)}</span>{' '}
                                            cubren la pasarela — no es ingreso
                                        </p>
                                        <p className="mt-0.5">
                                            {m.cobros} cobro(s) · recargo total{' '}
                                            <span data-no-translate>{money(m.total, m.currency)}</span>
                                        </p>
                                    </div>
                                </div>

                                {flujos.length > 0 && (
                                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {flujos.map(f => (
                                            <div key={f.flow}
                                                className="rounded-xl bg-gray-50 px-3 py-2 flex items-center justify-between gap-3">
                                                <dt className="text-[13px] text-gray-600">{flujoLabel(f.flow)}</dt>
                                                <dd className="text-sm font-bold text-gray-900" data-no-translate>
                                                    {money(f.ours, f.currency)}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}

                                {/* ⚠️ Un cobro sin desglose NO se cuenta como cero:
                                    su parte sólo está en la metadata de Stripe y
                                    atribuirla con la tarifa de hoy sería inventar
                                    el dato que se vino a medir. */}
                                {m.sinDesglose > 0 && (
                                    <p className="mt-3 flex items-start gap-2 text-xs text-amber-700">
                                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                                        {m.sinDesglose} cobro(s) sin desglose guardado —anteriores a esta
                                        versión— no se reparten por línea: su recargo consta en la pasarela,
                                        no en la plataforma. Atribuirlos con la tarifa de hoy sería inventar
                                        el dato.
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {(datos?.lineasDesconocidas || []).length > 0 && (
                <p className="px-5 py-3 border-t border-gray-100 text-xs text-amber-700">
                    Se cobraron líneas que este panel no sabe clasificar
                    (<span data-no-translate>{datos!.lineasDesconocidas.join(', ')}</span>) y no se cuentan
                    como ingreso.
                </p>
            )}
        </div>
    );
}
