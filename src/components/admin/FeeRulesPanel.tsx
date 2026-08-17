// LAS REGLAS DE COMISIÓN, desde el panel.
//
// v4.854 — Fase 2 del rediseño de la Bóveda.
//
// Vive DENTRO de la Bóveda Central y no en una pantalla propia: la tarifa es lo
// que explica el take rate que se está mirando justo encima, y la decisión se
// toma donde ya se está trabajando. Es el mismo criterio que la tarjeta de la
// «Sección pública de Eventos» — las pantallas que se olvidan son siempre las
// del segundo lugar.
//
// Nace PLEGADO: es una configuración que se toca una vez al año y no puede
// ocupar media pantalla del panel que se abre todos los días.

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Percent, AlertTriangle, ChevronDown, Save, Info } from 'lucide-react';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

interface Tarifa { percent: number; fixed: number; texto: string; source: { percent: string; fixed: string } }
interface Reglas {
    platform: { percent: number; fixed: number; byCurrency: Record<string, any>; bySite: Record<string, any> };
    processor: { percent: number; fixed: number; byCurrency: Record<string, any> };
}
interface Respuesta {
    rules: Reglas;
    resuelto: Record<string, { plataforma: Tarifa; procesador: Tarifa }>;
    warnings: string[];
}

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` } });

// El porcentaje se guarda en tanto por uno y se ESCRIBE en por ciento: nadie
// teclea «0.05» pensando en una comisión. La conversión vive acá, en un solo
// sitio, y no en cada casilla.
const aPorCiento = (v: number) => Math.round((Number(v) || 0) * 10000) / 100;
const aTantoPorUno = (v: string) => Number(v) / 100;

// ⚠️ UN FALLO DE SESIÓN SE DICE COMO LO QUE ES.
//
// v4.860 — Este panel se abre y se deja abierto: la tarifa se mira, se piensa y
// se guarda un rato después. El token de plataforma dura un día, así que el GET
// del principio puede funcionar y el PUT del final ya no. Cuando eso pasaba, el
// servidor contestaba «Invalid token» —el traductor del sitio lo pintaba como
// «Token inválido»— y quien lo leía no tenía forma de saber que lo único que
// hacía falta era volver a entrar. Se reportó junto con el defecto de rutas y
// es un fallo distinto: aquél no dejaba guardar NUNCA, éste deja de dejar.
const mensajeDeFallo = (e: any): string => {
    const status = e?.response?.status;
    if (status === 401) return 'Tu sesión venció mientras esta pantalla estaba abierta. Volvé a entrar y guardá de nuevo: lo que escribiste sigue acá.';
    if (status === 403) return 'Esta tarifa sólo la puede cambiar el operador de la plataforma.';
    // Sin respuesta del servidor no es un rechazo, es que la petición no llegó.
    if (!e?.response) return 'No se pudo contactar al servidor. Revisá la conexión y probá de nuevo.';
    return e?.response?.data?.error || 'No se pudo guardar.';
};

export default function FeeRulesPanel() {
    const [datos, setDatos] = useState<Respuesta | null>(null);
    const [abierto, setAbierto] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    // El borrador vive acá, no en `datos`: así «Cancelar» es no guardar y no
    // hace falta recordar el valor anterior campo por campo.
    const [borrador, setBorrador] = useState<Reglas | null>(null);

    const cargar = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/payouts/admin/fee-rules`, auth());
            setDatos(data);
            setBorrador(JSON.parse(JSON.stringify(data.rules)));
        } catch (e: any) {
            setError(mensajeDeFallo(e));
        }
    };

    useEffect(() => { cargar(); }, []);

    const guardar = async () => {
        if (!borrador) return;
        setGuardando(true); setError(null); setAviso(null);
        try {
            const { data } = await axios.put(`${API_URL}/payouts/admin/fee-rules`, { rules: borrador }, auth());
            setAviso(data.aviso);
            await cargar();
        } catch (e: any) {
            // Los errores del servidor llegan TODOS y con su motivo concreto:
            // «configuración inválida» a secas obliga a probar campo por campo.
            const errs = e?.response?.data?.errors;
            setError(Array.isArray(errs) && errs.length ? errs.join(' · ') : mensajeDeFallo(e));
        } finally {
            setGuardando(false);
        }
    };

    if (!datos || !borrador) return null;

    const monedas = Object.keys(datos.resuelto);

    return (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setAbierto(v => !v)}
                className="w-full px-6 py-4 flex items-center gap-3 text-left hover:bg-gray-50/70 transition-colors"
                aria-expanded={abierto}
            >
                <Percent className="w-5 h-5 text-rotary-blue shrink-0" />
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-900">Reglas de comisión</h3>
                    {!abierto && (
                        <p className="text-xs text-gray-400 truncate">
                            Lo que retiene la plataforma sobre cada aporte
                            {monedas.map(c => (
                                <span key={c} data-no-translate> · {c} {datos.resuelto[c].plataforma.texto}</span>
                            ))}
                        </p>
                    )}
                </div>
                {/* Plegar no puede ESCONDER un problema: la regla de v4.826. */}
                {datos.warnings.length > 0 && !abierto && (
                    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
                        {datos.warnings.length} aviso{datos.warnings.length === 1 ? '' : 's'}
                    </span>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
            </button>

            {/* Se DESMONTA al cerrar, no se esconde con CSS: un campo escondido
                con `hidden` lo siguen encontrando el buscador del navegador y el
                lector de pantalla. El borrador vive en el estado, así que no se
                pierde nada. */}
            {abierto && (
                <div className="px-6 pb-6 space-y-5 border-t border-gray-100 pt-5">
                    {/* ⚠️ Lo primero, porque es la pregunta que se hace quien va
                        a tocar una tarifa: «¿esto me cambia la contabilidad del
                        año?». La respuesta es no, y tiene que estar dicha ANTES
                        de que toque nada. */}
                    <div className="flex items-start gap-3 rounded-2xl bg-blue-50/70 border border-blue-100 p-4">
                        <Info className="w-4 h-4 text-rotary-blue mt-0.5 shrink-0" aria-hidden="true" />
                        <p className="text-sm text-gray-700">
                            La tarifa que se guarde rige para los aportes que entren <b>de ahora en adelante</b>.
                            Los cobros ya registrados conservan la retención que se les aplicó: cada uno guarda
                            su importe, no el porcentaje.
                        </p>
                    </div>

                    <Bloque
                        titulo="Retención de la plataforma"
                        ayuda="Lo que Club Platform retiene de cada aporte. Es un ingreso de la plataforma."
                        valores={borrador.platform}
                        onChange={v => setBorrador({ ...borrador, platform: { ...borrador.platform, ...v } })}
                    />

                    <Bloque
                        titulo="Estimado del procesador"
                        ayuda="Lo que se descuenta mientras no llega la comisión real de Stripe. NO es un cobro nuestro: se sustituye por el dato real en cuanto el proveedor lo entrega."
                        valores={borrador.processor}
                        onChange={v => setBorrador({ ...borrador, processor: { ...borrador.processor, ...v } })}
                    />

                    {/* Lo resuelto por moneda: un JSON con herencia no se lee de
                        un vistazo, y lo que se quiere saber es qué se le cobra a
                        un aporte en pesos. */}
                    <div className="rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Lo que rige hoy
                        </div>
                        {monedas.map(code => (
                            <div key={code} className="px-4 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm border-t border-gray-50">
                                <span className="font-black text-gray-400 text-xs tracking-wider w-10" data-no-translate>{code}</span>
                                <span className="text-gray-600">
                                    Plataforma: <b className="text-gray-900" data-no-translate>{datos.resuelto[code].plataforma.texto}</b>
                                </span>
                                <span className="text-gray-600">
                                    Procesador (estimado): <b className="text-gray-900" data-no-translate>{datos.resuelto[code].procesador.texto}</b>
                                </span>
                            </div>
                        ))}
                    </div>

                    {datos.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
                            <p className="text-sm text-amber-900">{w}</p>
                        </div>
                    ))}

                    {error && (
                        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4">{error}</p>
                    )}
                    {aviso && (
                        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">{aviso}</p>
                    )}

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={guardar}
                            disabled={guardando}
                            className="inline-flex items-center gap-2 bg-rotary-blue hover:bg-rotary-navy text-white font-bold rounded-xl px-5 py-2.5 text-sm disabled:opacity-50 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            {guardando ? 'Guardando…' : 'Guardar la tarifa'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setBorrador(JSON.parse(JSON.stringify(datos.rules))); setError(null); setAviso(null); }}
                            className="text-sm text-gray-500 hover:text-gray-800"
                        >
                            Descartar los cambios
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Bloque({ titulo, ayuda, valores, onChange }: {
    titulo: string;
    ayuda: string;
    valores: { percent: number; fixed: number; byCurrency: Record<string, any> };
    onChange: (v: any) => void;
}) {
    return (
        <div className="space-y-3">
            <div>
                <h4 className="font-bold text-gray-900 text-sm">{titulo}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{ayuda}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                    <span className="text-xs font-medium text-gray-600">Porcentaje</span>
                    <div className="mt-1 flex items-center gap-2">
                        <input
                            type="number" step="0.01" min="0" max="100"
                            value={aPorCiento(valores.percent)}
                            onChange={e => onChange({ percent: aTantoPorUno(e.target.value) })}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        />
                        <span className="text-sm text-gray-400">%</span>
                    </div>
                </label>
                <label className="block">
                    <span className="text-xs font-medium text-gray-600">Componente fijo</span>
                    <input
                        type="number" step="0.01" min="0"
                        value={valores.fixed ?? 0}
                        onChange={e => onChange({ fixed: Number(e.target.value) })}
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                    {/* ⚠️ El aviso más útil de esta pantalla: el fijo NO tiene
                        moneda propia y hoy se aplica a todas. */}
                    <span className="text-[11px] text-gray-400 mt-1 block">
                        Se aplica a todas las monedas. En pesos, «0,30» son treinta centavos de peso.
                    </span>
                </label>
            </div>
        </div>
    );
}
