// LOS MÉTODOS DE PAGO DE LA PLATAFORMA, desde el panel.
//
// v4.868 — Contesta las dos preguntas que hoy exigen entrar a Vercel: ¿está
// configurado este proveedor?, ¿está activado?
//
// ═════════════════════════════════════════════════════════════════════
// CONFIGURADO Y ACTIVADO SON DOS COSAS DISTINTAS
// ═════════════════════════════════════════════════════════════════════
//
// CONFIGURADO lo dice el entorno y NO se edita acá: el secreto vive en las
// variables de Vercel y no en la base, así que un volcado de la base no se
// lleva la llave de cobro y preview puede tener una cuenta distinta de
// producción. Lo que la pantalla aporta es VERLO sin entrar a Vercel.
//
// ACTIVADO sí se decide acá. Es lo que permite dejar las credenciales cargadas
// y el método todavía apagado mientras se prueba en sandbox.
//
// ⚠️ NUNCA se muestra el secreto, ni recortado. Los últimos cuatro caracteres
// de una llave de cobro no ayudan a diagnosticar nada y sí filtran.

import { useEffect, useState } from 'react';
import axios from 'axios';
import { CreditCard, CheckCircle2, AlertTriangle, Save, Info, XCircle } from 'lucide-react';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

interface Metodo {
    id: string;
    label: string;
    provider: string;
    help: string;
    configured: boolean;
    missing: string[];
    missingOptional: string[];
    enabled: boolean;
    offered: boolean;
    reason: string | null;
}

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` } });

// Un fallo se dice como lo que es. Es la misma distinción de `FeeRulesPanel`:
// una sesión vencida, un permiso que falta y una petición que no llegó se
// corrigen en sitios distintos.
const mensajeDeFallo = (e: any): string => {
    const status = e?.response?.status;
    if (status === 401) return 'Tu sesión venció. Volvé a entrar y probá de nuevo.';
    if (status === 403) return 'Sólo el operador de la plataforma puede cambiar esto.';
    if (!e?.response) return 'No se pudo contactar al servidor. Revisá la conexión.';
    const errs = e?.response?.data?.errors;
    return Array.isArray(errs) && errs.length ? errs.join(' · ') : (e?.response?.data?.error || 'No se pudo guardar.');
};

export default function PaymentMethodsPanel() {
    const [metodos, setMetodos] = useState<Metodo[] | null>(null);
    const [donde, setDonde] = useState('');
    const [avisos, setAvisos] = useState<string[]>([]);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    const cargar = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/payouts/admin/payment-methods`, auth());
            setMetodos(data.methods);
            setDonde(data.donde || '');
        } catch (e: any) {
            setError(mensajeDeFallo(e));
        }
    };
    useEffect(() => { cargar(); }, []);

    const guardar = async () => {
        if (!metodos) return;
        setGuardando(true); setError(null); setOk(null); setAvisos([]);
        try {
            const cuerpo = Object.fromEntries(metodos.map(m => [m.id, { enabled: m.enabled }]));
            const { data } = await axios.put(`${API_URL}/payouts/admin/payment-methods`, { methods: cuerpo }, auth());
            setMetodos(data.methods);
            setAvisos(data.warnings || []);
            setOk(data.aviso);
        } catch (e: any) {
            setError(mensajeDeFallo(e));
        } finally {
            setGuardando(false);
        }
    };

    if (!metodos) return null;

    return (
        <div className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm mb-8">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CreditCard className="w-5 h-5" />
                </div>
                <div>
                    <h2 className="text-lg font-black text-gray-900">Métodos de pago</h2>
                    <p className="text-xs text-gray-400 font-medium">
                        Con qué puede aportar una persona. El dinero entra siempre a la cuenta de la plataforma.
                    </p>
                </div>
            </div>

            {/* Dónde se cargan las credenciales. Sin esto, «faltan variables» no
                dice dónde ponerlas — que es exactamente la pregunta que trajo
                a alguien a esta pantalla. */}
            <div className="flex items-start gap-3 rounded-2xl bg-blue-50/70 border border-blue-100 p-4 my-5">
                <Info className="w-4 h-4 text-rotary-blue mt-0.5 shrink-0" aria-hidden="true" />
                <div className="text-sm text-gray-700">
                    <p><b>Las credenciales se cargan en el entorno, no acá.</b> {donde}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        Se mantienen fuera de la base a propósito: así un respaldo de la base no se lleva la llave
                        de cobro, y el entorno de pruebas puede usar una cuenta distinta de la de producción.
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                {metodos.map(m => (
                    <div key={m.id} className="border border-gray-100 rounded-2xl p-4">
                        <div className="flex items-start gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-bold text-gray-900">{m.label}</h3>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400" data-no-translate>
                                        {m.provider}
                                    </span>
                                    {/* El estado es de SÓLO LECTURA: sale del entorno. */}
                                    {m.configured ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                                            <CheckCircle2 className="w-3 h-3" /> Configurado
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                                            <XCircle className="w-3 h-3" /> Sin credenciales
                                        </span>
                                    )}
                                    {m.offered && (
                                        <span className="text-[10px] font-black uppercase tracking-widest text-sky-600 bg-sky-50 border border-sky-100 rounded-full px-2 py-0.5">
                                            Se está ofreciendo
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{m.help}</p>

                                {/* Qué falta, con el nombre exacto de la variable: un
                                    «no configurado» a secas manda a adivinar. */}
                                {m.missing.length > 0 && (
                                    <p className="text-xs text-amber-700 mt-2">
                                        Falta en el entorno: <span className="font-mono" data-no-translate>{m.missing.join(', ')}</span>
                                    </p>
                                )}
                                {m.configured && m.missingOptional.length > 0 && (
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Opcionales sin cargar: <span className="font-mono" data-no-translate>{m.missingOptional.join(', ')}</span>
                                    </p>
                                )}
                            </div>

                            <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={m.enabled}
                                    onChange={e => setMetodos(metodos.map(x => x.id === m.id ? { ...x, enabled: e.target.checked } : x))}
                                    className="rounded border-gray-300"
                                />
                                <span className="text-sm font-bold text-gray-700">Activado</span>
                            </label>
                        </div>

                        {/* Activado pero sin credenciales: se puede dejar listo, y
                            hay que DECIRLO o alguien espera un botón que no va a
                            aparecer. */}
                        {m.enabled && !m.configured && (
                            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">
                                Está activado pero <b>no se ofrece todavía</b>: faltan sus credenciales en el entorno.
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {avisos.map((a, i) => (
                <p key={i} className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-4 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />{a}
                </p>
            ))}
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4 mt-4">{error}</p>}
            {ok && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mt-4">{ok}</p>}

            <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="mt-5 inline-flex items-center gap-2 bg-rotary-blue hover:bg-rotary-navy text-white font-bold rounded-xl px-5 py-2.5 text-sm disabled:opacity-50 transition-colors"
            >
                <Save className="w-4 h-4" />
                {guardando ? 'Guardando…' : 'Guardar los métodos'}
            </button>
        </div>
    );
}
