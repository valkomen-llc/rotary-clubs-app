/**
 * Marcar VARIOS aportes como desembolsados de una vez.
 *
 * v4.886 — Se pidió con estas palabras: «poder tener esa selección y marcar lo
 * que seleccionamos como completado o trasladado». Un club que gira veinte
 * aportes en una sola transferencia no puede abrir veinte fichas.
 *
 * ═════════════════════════════════════════════════════════════════════
 * ⚠️ SE COMPARTE EL FORMULARIO, NO EL REGISTRO.
 * ═════════════════════════════════════════════════════════════════════
 *
 * El servidor escribe UNA FILA POR APORTE. Un movimiento agregado que cubriera
 * cinco aportes no se podría reversar parcialmente, no se podría atribuir a su
 * campaña y no cuadraría contra un extracto aporte por aporte. Lo único común
 * es lo que se escribe una vez —beneficiario, fecha, medio, referencia—.
 *
 * ⚠️ Y EL MONTO NO SE ESCRIBE: cada aporte se registra por lo que le FALTA. Un
 * total repartido entre cinco con un criterio que nadie puede reconstruir
 * después es peor que no tener la función. Si lo que se giró fue otra cosa, se
 * registran de a uno.
 */
import { useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2, Send, X, AlertTriangle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

export interface Elegible {
    /** El id del PAGO, que es de donde cuelga el desembolso — no el del aporte. */
    paymentId: string;
    /** Lo que le falta por desembolsar. */
    restante: number;
    currency: string;
    /** Para nombrarlo en la confirmación. */
    titulo: string;
}

interface Metodo { id: string; label: string }

const METODOS: Metodo[] = [
    { id: 'transferencia', label: 'Transferencia bancaria' },
    { id: 'ach', label: 'ACH / interbancaria' },
    { id: 'cheque', label: 'Cheque' },
    { id: 'efectivo', label: 'Efectivo' },
    { id: 'compensacion', label: 'Compensación interna' },
    { id: 'otro', label: 'Otro' },
];

const money = (n: number, c: string) => {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: c,
            minimumFractionDigits: c === 'COP' ? 0 : 2,
            maximumFractionDigits: c === 'COP' ? 0 : 2,
        }).format(n || 0);
    } catch { return `${n} ${c}`; }
};

export default function BulkDisbursementBar({ elegidos, clubId, onLimpiar, onHecho }: {
    elegidos: Elegible[];
    clubId?: string;
    onLimpiar: () => void;
    onHecho: () => void;
}) {
    const [abierto, setAbierto] = useState(false);

    // ⚠️ El total se agrupa POR MONEDA y nunca se suma entre ellas. Un bloque
    // puede mezclar pesos y dólares, y un total único sería el «$47.507,75» —
    // la regla que gobierna este módulo desde v4.841.
    const porMoneda = useMemo(() => {
        const m: Record<string, { total: number; cuantos: number }> = {};
        for (const e of elegidos) {
            const c = e.currency || 'USD';
            m[c] ||= { total: 0, cuantos: 0 };
            m[c].total += e.restante;
            m[c].cuantos++;
        }
        return m;
    }, [elegidos]);

    if (!elegidos.length) return null;

    return (
        <>
            {/* La barra va PEGADA ABAJO: con una lista larga, un botón al final
                obliga a desplazarse hasta el fondo para actuar sobre algo que se
                eligió arriba. */}
            <div className="sticky bottom-4 z-30 mx-auto max-w-3xl">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-gray-900 text-white shadow-xl px-4 py-3">
                    <span className="text-sm font-bold" data-no-translate>
                        {elegidos.length}
                    </span>
                    <span className="text-sm">
                        aporte{elegidos.length === 1 ? '' : 's'} elegido{elegidos.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-xs text-gray-300 flex flex-wrap gap-x-2">
                        {Object.entries(porMoneda).map(([c, d]) => (
                            <span key={c} data-no-translate>{money(d.total, c)}</span>
                        ))}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button" onClick={onLimpiar}
                            className="text-xs text-gray-300 hover:text-white underline underline-offset-4"
                        >
                            Limpiar
                        </button>
                        <button
                            type="button" onClick={() => setAbierto(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider hover:bg-emerald-600"
                        >
                            <Send className="w-3 h-3" /> Marcar como desembolsados
                        </button>
                    </div>
                </div>
            </div>

            {abierto && (
                <BulkModal
                    elegidos={elegidos}
                    porMoneda={porMoneda}
                    clubId={clubId}
                    onCerrar={() => setAbierto(false)}
                    onHecho={() => { setAbierto(false); onHecho(); }}
                />
            )}
        </>
    );
}

function BulkModal({ elegidos, porMoneda, clubId, onCerrar, onHecho }: {
    elegidos: Elegible[];
    porMoneda: Record<string, { total: number; cuantos: number }>;
    clubId?: string;
    onCerrar: () => void;
    onHecho: () => void;
}) {
    const [fechaDes, setFechaDes] = useState(() => new Date().toISOString().slice(0, 10));
    const [beneficiario, setBeneficiario] = useState('');
    const [metodo, setMetodo] = useState('transferencia');
    const [referencia, setReferencia] = useState('');
    const [notas, setNotas] = useState('');
    const [archivo, setArchivo] = useState<File | null>(null);
    const [notificar, setNotificar] = useState(false);
    const [correo, setCorreo] = useState('');
    const [confirmando, setConfirmando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [resultado, setResultado] = useState<{
        registrados: number;
        saltados: Array<{ id: string; motivo: string }>;
        totalesPorMoneda: Record<string, number>;
    } | null>(null);

    const enviar = async () => {
        setGuardando(true);
        try {
            // Con adjunto va como multipart; sin él, como JSON. El servidor
            // admite las dos formas para la lista de ids a propósito: obligar a
            // multipart siempre metería la serialización del array en el camino
            // del caso más común, que es el que NO lleva archivo.
            const cuerpo = {
                clubId,
                paymentIds: elegidos.map(e => e.paymentId),
                disbursedAt: new Date(`${fechaDes}T12:00:00`).toISOString(),
                beneficiary: beneficiario,
                method: metodo,
                reference: referencia,
                notes: notas,
                notify: notificar,
                notifyEmail: correo,
                confirm: true,
            };

            let payload: FormData | typeof cuerpo = cuerpo;
            if (archivo) {
                const fd = new FormData();
                Object.entries(cuerpo).forEach(([k, v]) => {
                    // El array viaja como JSON en un solo campo: `append` por
                    // elemento lo entrega como texto repetido y el servidor
                    // tendría que adivinar cuál de las dos formas es.
                    fd.append(k, k === 'paymentIds' ? JSON.stringify(v) : String(v));
                });
                fd.append('receipt', archivo);
                payload = fd;
            }

            const r = await axios.post(
                `${API_BASE}/financial/wallet/disbursements/bulk`,
                payload,
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            setResultado(r.data);
            if (r.data?.registrados > 0) {
                toast.success(`${r.data.registrados} aporte(s) marcados como desembolsados.`);
            }
            // ⚠️ Lo que NO entró se queda a la vista en vez de cerrarse: sin eso,
            // «se registraron 3 de 5» deja adivinando cuáles dos y qué hacer.
            if (!r.data?.saltados?.length) onHecho();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudieron registrar los desembolsos', { duration: 10000 });
            setConfirmando(false);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Marcar aportes como desembolsados">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900">Marcar como desembolsados</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {elegidos.length} aporte{elegidos.length === 1 ? '' : 's'}. Se registra un movimiento
                            por cada uno, no uno solo agrupado.
                        </p>
                    </div>
                    <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {resultado ? (
                    <div className="px-5 py-4 space-y-3">
                        <p className="text-sm text-gray-800">
                            Se registraron <strong data-no-translate>{resultado.registrados}</strong> de {elegidos.length}.
                        </p>
                        {Object.entries(resultado.totalesPorMoneda || {}).map(([c, t]) => (
                            <p key={c} className="text-sm text-gray-600" data-no-translate>{money(t, c)}</p>
                        ))}
                        {resultado.saltados?.length > 0 && (
                            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> No entraron
                                </div>
                                <ul className="text-xs text-amber-800 space-y-1">
                                    {resultado.saltados.map(s => (
                                        <li key={s.id}>
                                            <span className="font-mono text-[10px]" data-no-translate>#{s.id.slice(-8).toUpperCase()}</span>
                                            {' — '}{s.motivo}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div className="flex justify-end">
                            <button
                                type="button" onClick={onHecho}
                                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-black"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="px-5 py-4 space-y-3">
                            {/* El total, por moneda. Es lo primero que hay que
                                poder revisar antes de confirmar. */}
                            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                                    Se registrará
                                </div>
                                {Object.entries(porMoneda).map(([c, d]) => (
                                    <div key={c} className="flex justify-between text-sm">
                                        <span className="text-gray-600">{d.cuantos} aporte(s) en <span data-no-translate>{c}</span></span>
                                        <span className="font-bold text-gray-900" data-no-translate>{money(d.total, c)}</span>
                                    </div>
                                ))}
                                <p className="text-[11px] text-gray-500 mt-1.5">
                                    Cada aporte se registra por lo que le falta. Si lo que giraste fue otra
                                    cantidad, registralos de a uno desde su ficha.
                                </p>
                            </div>

                            <label className="block">
                                <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Fecha del desembolso</span>
                                <input
                                    type="date" value={fechaDes}
                                    max={new Date().toISOString().slice(0, 10)}
                                    onChange={e => setFechaDes(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                />
                            </label>

                            <label className="block">
                                <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Beneficiario / prestatario</span>
                                <input
                                    type="text" value={beneficiario} onChange={e => setBeneficiario(e.target.value)}
                                    placeholder="Quién recibió el dinero"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                />
                            </label>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Medio</span>
                                    <select
                                        value={metodo} onChange={e => setMetodo(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                    >
                                        {METODOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Referencia</span>
                                    <input
                                        type="text" value={referencia} onChange={e => setReferencia(e.target.value)}
                                        placeholder="N.º de transferencia"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                    />
                                </label>
                            </div>

                            <label className="block">
                                <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Observaciones</span>
                                <textarea
                                    value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                />
                            </label>

                            {/* ── EL COMPROBANTE DEL GIRO (v4.887) ────────────
                                v4.886 no lo ofrecía, con el argumento de que un
                                mismo archivo en cinco filas afirmaría respaldar
                                a cada una por separado. El argumento era
                                demasiado purista y el caso real lo desmiente: si
                                los cinco aportes salieron en UNA transferencia,
                                hay un solo soporte y ése SÍ los respalda a los
                                cinco.

                                Lo que no se puede es presentarlo como el
                                comprobante de un aporte suelto — y de eso se
                                encarga el lote: la ficha de cada aporte dice
                                «comprobante del giro que cubrió N aportes». */}
                            <label className="block">
                                <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                                    Comprobante del giro (PDF, JPG o PNG)
                                </span>
                                <input
                                    type="file"
                                    accept="application/pdf,image/jpeg,image/png"
                                    onChange={e => setArchivo(e.target.files?.[0] || null)}
                                    className="w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-xs file:font-bold"
                                />
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Es el soporte de la transferencia COMPLETA, no de un aporte suelto: se guarda una
                                    vez y queda enlazado a los {elegidos.length} como comprobante del giro. Si cada
                                    aporte salió por separado, adjuntá el suyo desde su ficha.
                                </p>
                            </label>

                            <label className="flex items-start gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={notificar} onChange={e => setNotificar(e.target.checked)} className="mt-0.5" />
                                <span>Notificar al beneficiario por correo electrónico</span>
                            </label>
                            {notificar && (
                                <>
                                    <input
                                        type="email" value={correo} onChange={e => setCorreo(e.target.value)}
                                        placeholder="beneficiario@ejemplo.com"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                    />
                                    {/* Un aviso por aporte puede ser varios correos
                                        seguidos a la misma persona: hay que decirlo
                                        antes, no después. */}
                                    <p className="text-[11px] text-amber-700">
                                        Se enviará un aviso por cada aporte: {elegidos.length} correo(s) a esa dirección.
                                    </p>
                                </>
                            )}
                        </div>

                        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                            {!confirmando ? (
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={onCerrar} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                                        Cancelar
                                    </button>
                                    <button
                                        type="button" onClick={() => setConfirmando(true)}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                                    >
                                        <Send className="w-4 h-4" /> Confirmar
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-gray-700">
                                        Se registrarán <strong data-no-translate>{elegidos.length}</strong> desembolsos
                                        a <strong data-no-translate>{beneficiario || '—'}</strong>
                                        {archivo ? <>, con <strong data-no-translate>{archivo.name}</strong> como comprobante del giro</> : null}.
                                        Una vez confirmados no se borran: si hay que corregir alguno, se reversa desde su ficha.
                                    </p>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button" onClick={() => setConfirmando(false)} disabled={guardando}
                                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                                        >
                                            Revisar
                                        </button>
                                        <button
                                            type="button" onClick={enviar} disabled={guardando}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                            {guardando ? 'Registrando…' : 'Sí, registrar'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
