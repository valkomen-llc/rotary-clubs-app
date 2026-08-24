/**
 * El CICLO DE VIDA de un aporte dentro de su ficha: dónde está el dinero, qué
 * le pasó y a dónde se trasladó.
 *
 * v4.885 — Vive en su propio archivo y no dentro de `WalletManagement.tsx`
 * porque aquél ya son 1.700 líneas: una pieza más ahí dentro sería
 * inencontrable. Y porque esto se monta DENTRO de `DonorCard`, que ya tiene sus
 * hooks: un componente aparte es lo que impide que los de aquí queden detrás de
 * un `return` temprano del otro (`npm run check:hooks`, la lección de v4.689).
 *
 * ═════════════════════════════════════════════════════════════════════
 * ⚠️ LA LÍNEA DE TIEMPO NO SE FABRICA ACÁ.
 * ═════════════════════════════════════════════════════════════════════
 *
 * Los eventos llegan del servidor, de la tabla donde se escribieron cuando
 * ocurrieron. Componerla en el navegador a partir de las fechas sueltas del
 * movimiento afirmaría que algo pasó sin que nadie lo haya registrado — y
 * entonces deja de servir para auditar, que es lo único para lo que sirve una
 * línea de tiempo. Es exigencia expresa del pedido.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    CheckCircle2, Circle, Clock, Loader2, Paperclip, Send, Plus,
    AlertTriangle, RotateCcw, X, Mail,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

/* ─── Tipos ──────────────────────────────────────────────────────────*/

export interface Calendario {
    recibidoEl: string | null;
    stripeLiberaEl: string | null;
    disponibleEl: string | null;
    estimado: boolean;
    fuente: string | null;
    diasRestantes: number | null;
    liberadoEl: string | null;
    estado: string;
    estadoLabel: string;
    holdingDays: number;
}

export interface EventoTraza {
    kind: string;
    label: string;
    at: string | null;
    actor: string | null;
    actorKind: string;
    reference: string | null;
    note: string | null;
}

export interface Desembolso {
    id: string;
    amount: number;
    currency: string;
    disbursedAt: string;
    beneficiary: string;
    method: string;
    methodLabel: string;
    reference: string | null;
    notes: string | null;
    status: string;
    reversedReason: string | null;
    hasReceipt: boolean;
    receiptName: string | null;
    notifyEmail: string | null;
    notifyState: string | null;
    notifyError: string | null;
    createdByName: string | null;
}

interface Balance {
    currency: string;
    objetivo: number;
    cubierto: number;
    restante: number;
    completo: boolean;
    parcial: boolean;
    cuantos: number;
    reversados: number;
}

interface Metodo { id: string; label: string }

const money = (n: number, c: string) => {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: c,
            minimumFractionDigits: c === 'COP' ? 0 : 2,
            maximumFractionDigits: c === 'COP' ? 0 : 2,
        }).format(n || 0);
    } catch { return `${n} ${c}`; }
};
const fecha = (s: string | null) =>
    s ? new Date(s).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/* ─── El bloque ──────────────────────────────────────────────────────*/

export default function DisbursementSection({ paymentId, clubId, netAmount, currency }: {
    paymentId: string;
    clubId?: string;
    netAmount: number;
    currency: string;
}) {
    // ⚠️ TODOS los hooks arriba, antes de cualquier `return`. React identifica
    // cada hook por su ORDEN de llamada: uno escrito debajo de un return
    // temprano no se ejecuta en el primer render y sí en el segundo, y el árbol
    // entero se cae sin pintar nada (v4.689).
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [calendario, setCalendario] = useState<Calendario | null>(null);
    const [timeline, setTimeline] = useState<EventoTraza[]>([]);
    const [desembolsos, setDesembolsos] = useState<Desembolso[]>([]);
    const [balance, setBalance] = useState<Balance | null>(null);
    const [metodos, setMetodos] = useState<Metodo[]>([]);
    const [modalAbierto, setModalAbierto] = useState(false);
    const [abriendoComprobante, setAbriendoComprobante] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const r = await axios.get(`${API_BASE}/financial/payments/${paymentId}/lifecycle`, {
                params: clubId ? { clubId } : undefined,
                headers: { Authorization: `Bearer ${token()}` },
            });
            setCalendario(r.data?.calendario || null);
            setTimeline(r.data?.timeline || []);
            setDesembolsos(r.data?.disbursements || []);
            setBalance(r.data?.balance || null);
            setMetodos(r.data?.methods || []);
        } catch (e: any) {
            // Se DICE el motivo. «No se pudo cargar» a secas manda a
            // diagnosticar a ciegas — la lección de `FeeRulesPanel` (v4.859).
            const s = e?.response?.status;
            setError(
                s === 401 ? 'La sesión venció. Volvé a entrar y se recarga solo.'
                    : s === 403 ? 'Tu rol no puede ver el ciclo de vida de un aporte.'
                        : s === 404 ? 'Este aporte no existe en este sitio.'
                            : e?.response?.data?.error || 'No se pudo leer el ciclo de vida del aporte.'
            );
        } finally {
            setCargando(false);
        }
    }, [paymentId, clubId]);

    useEffect(() => { cargar(); }, [cargar]);

    const puedeDesembolsar = useMemo(
        () => calendario?.estado === 'available' || calendario?.estado === 'disbursing',
        [calendario?.estado]
    );

    const verComprobante = useCallback(async (id: string) => {
        setAbriendoComprobante(id);
        try {
            const r = await axios.get(`${API_BASE}/financial/disbursements/${id}/receipt`, {
                params: clubId ? { clubId } : undefined,
                headers: { Authorization: `Bearer ${token()}` },
            });
            // El enlace es firmado y caduca: se abre y no se guarda.
            if (r.data?.url) window.open(r.data.url, '_blank', 'noopener,noreferrer');
            else toast.error('No se pudo abrir el comprobante.');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo abrir el comprobante.');
        } finally {
            setAbriendoComprobante(null);
        }
    }, [clubId]);

    const reintentarAviso = useCallback(async (id: string) => {
        try {
            const r = await axios.post(
                `${API_BASE}/financial/disbursements/${id}/notify`,
                { clubId },
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            if (r.data?.ok) toast.success('Aviso reenviado al beneficiario.');
            else toast.error(r.data?.error || 'El aviso volvió a fallar.', { duration: 10000 });
            cargar();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo reintentar el aviso.');
        }
    }, [clubId, cargar]);

    if (cargando) {
        return (
            <div className="pt-3 flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Leyendo el ciclo de vida…
            </div>
        );
    }

    if (error) {
        return (
            <div className="pt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="pt-4 space-y-4">
            {/* ── EL CALENDARIO ───────────────────────────────────────
                Contesta la pregunta que obligaba a contar los seis días a
                mano: cuándo se libera y cuánto falta. */}
            {calendario && (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                        Liberación de los fondos
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                        <Par t="Recibido" v={fecha(calendario.recibidoEl)} />
                        <Par t="Stripe libera" v={fecha(calendario.stripeLiberaEl)} />
                        <Par
                            t={`Disponible (+${calendario.holdingDays} días)`}
                            v={fecha(calendario.disponibleEl)}
                        />
                        <Par
                            t="Estado"
                            v={calendario.estadoLabel}
                            destacado={calendario.estado === 'available'}
                        />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        {calendario.diasRestantes !== null && calendario.diasRestantes > 0 ? (
                            <span className="inline-flex items-center gap-1 text-sky-700 font-semibold">
                                <Clock className="w-3 h-3" />
                                Faltan {calendario.diasRestantes} día{calendario.diasRestantes === 1 ? '' : 's'}
                            </span>
                        ) : calendario.liberadoEl ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                Liberado el {fecha(calendario.liberadoEl)}
                            </span>
                        ) : null}
                        {/* ⚠️ Una fecha ESTIMADA se dice. Presentar un cálculo
                            propio como si fuera el calendario de Stripe es lo
                            que hace que alguien planifique un pago contra una
                            fecha que no existe. */}
                        {calendario.estimado && (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                                <AlertTriangle className="w-3 h-3" />
                                Fecha estimada: Stripe todavía no dio la suya. Se corrige sola en el próximo barrido.
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* ── LA LÍNEA DE TIEMPO ──────────────────────────────────*/}
            {timeline.length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Historial</div>
                    <ol className="space-y-1.5">
                        {timeline.map((e, i) => (
                            <li key={`${e.kind}-${i}`} className="flex items-start gap-2 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <span className="font-semibold text-gray-800">{e.label}</span>
                                    <span className="text-gray-400"> — <span data-no-translate>{fecha(e.at)}</span></span>
                                    {/* Quién lo hizo. Sin esto, «por qué cambió
                                        esto» no tiene dónde mirarse. */}
                                    {e.actor && <span className="text-gray-400" data-no-translate> · {e.actor}</span>}
                                    {e.note && <div className="text-gray-500 mt-0.5">{e.note}</div>}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
            {timeline.length === 0 && (
                <p className="text-[11px] text-gray-400">
                    Este aporte no tiene historial registrado: es anterior al seguimiento del ciclo de vida.
                    El barrido automático lo irá completando.
                </p>
            )}

            {/* ── LOS DESEMBOLSOS ─────────────────────────────────────*/}
            <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Desembolsos
                    </div>
                    {puedeDesembolsar && !balance?.completo && (
                        <button
                            type="button"
                            onClick={() => setModalAbierto(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-emerald-700"
                        >
                            <Plus className="w-3 h-3" /> Registrar desembolso
                        </button>
                    )}
                </div>

                {/* ⚠️ DISPONIBLE NO ES DESEMBOLSADO, y se dice donde se decide.
                    Sin esta línea, «Disponible para retiro» se lee como si el
                    dinero ya hubiera salido. */}
                {!puedeDesembolsar && (
                    <p className="text-[11px] text-gray-500">
                        Este aporte todavía no está disponible: no se puede registrar un traslado
                        de un dinero que el proveedor aún retiene.
                    </p>
                )}

                {desembolsos.length === 0 && puedeDesembolsar && (
                    <p className="text-[11px] text-gray-500">
                        El dinero está disponible y todavía no se registró ningún traslado al beneficiario.
                    </p>
                )}

                {desembolsos.length > 0 && (
                    <ul className="space-y-2">
                        {desembolsos.map(d => (
                            <li
                                key={d.id}
                                className={`rounded-lg border px-3 py-2 text-xs ${
                                    d.status === 'reversado'
                                        ? 'border-gray-200 bg-gray-50 opacity-70'
                                        : 'border-emerald-100 bg-emerald-50/50'
                                }`}
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="font-bold text-gray-900" data-no-translate>
                                        {money(d.amount, d.currency)}
                                    </span>
                                    <span className="text-gray-500" data-no-translate>{fecha(d.disbursedAt)}</span>
                                </div>
                                <div className="text-gray-600 mt-0.5">
                                    A <span className="font-semibold" data-no-translate>{d.beneficiary}</span>
                                    {' · '}{d.methodLabel}
                                    {d.reference && <span data-no-translate> · ref. {d.reference}</span>}
                                </div>
                                {d.notes && <div className="text-gray-500 mt-1 italic">{d.notes}</div>}
                                {d.status === 'reversado' && (
                                    <div className="mt-1 text-amber-700 font-semibold">
                                        Reversado{d.reversedReason ? `: ${d.reversedReason}` : ''}
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                                    {d.hasReceipt && (
                                        <button
                                            type="button"
                                            onClick={() => verComprobante(d.id)}
                                            disabled={abriendoComprobante === d.id}
                                            className="inline-flex items-center gap-1 font-bold text-rotary-blue hover:underline disabled:opacity-50"
                                        >
                                            <Paperclip className="w-3 h-3" />
                                            {abriendoComprobante === d.id ? 'Abriendo…' : 'Ver comprobante'}
                                        </button>
                                    )}
                                    {/* El resultado del aviso, con su motivo TEXTUAL.
                                        Un desembolso válido con el correo fallido es
                                        un caso normal y hay que poder verlo. */}
                                    {d.notifyEmail && (
                                        <span className={`inline-flex items-center gap-1 ${
                                            d.notifyState === 'enviado' ? 'text-emerald-700'
                                                : d.notifyState === 'fallido' ? 'text-red-600' : 'text-gray-500'
                                        }`}>
                                            <Mail className="w-3 h-3" />
                                            <span data-no-translate>{d.notifyEmail}</span>
                                            {d.notifyState === 'enviado' ? ' · avisado'
                                                : d.notifyState === 'fallido' ? ' · el aviso falló'
                                                    : ' · sin avisar'}
                                        </span>
                                    )}
                                    {d.notifyState === 'fallido' && (
                                        <button
                                            type="button"
                                            onClick={() => reintentarAviso(d.id)}
                                            className="inline-flex items-center gap-1 font-bold text-amber-700 hover:underline"
                                        >
                                            <RotateCcw className="w-3 h-3" /> Reintentar aviso
                                        </button>
                                    )}
                                    {d.createdByName && (
                                        <span className="text-gray-400" data-no-translate>Registró: {d.createdByName}</span>
                                    )}
                                </div>
                                {d.notifyError && (
                                    <div className="text-red-600 mt-1">{d.notifyError}</div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {/* Cuánto queda. Un aporte con desembolsos parciales NO se
                    presenta como completo: afirmaría que el beneficiario
                    recibió todo cuando recibió la mitad. */}
                {balance && balance.cuantos > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                        <span className="text-gray-600">
                            Desembolsado <span className="font-bold" data-no-translate>{money(balance.cubierto, balance.currency)}</span>
                            {' de '}<span data-no-translate>{money(balance.objetivo, balance.currency)}</span>
                        </span>
                        {balance.completo ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                <CheckCircle2 className="w-3 h-3" /> Completo
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-sky-700 font-semibold">
                                <Circle className="w-3 h-3" /> Faltan <span data-no-translate>{money(balance.restante, balance.currency)}</span>
                            </span>
                        )}
                    </div>
                )}
            </div>

            {modalAbierto && (
                <DisbursementModal
                    paymentId={paymentId}
                    clubId={clubId}
                    currency={currency}
                    maximo={balance?.restante ?? netAmount}
                    metodos={metodos}
                    onCerrar={() => setModalAbierto(false)}
                    onHecho={() => { setModalAbierto(false); cargar(); }}
                />
            )}
        </div>
    );
}

function Par({ t, v, destacado }: { t: string; v: string; destacado?: boolean }) {
    return (
        <div>
            <div className="text-gray-400">{t}</div>
            <div className={`font-semibold ${destacado ? 'text-emerald-700' : 'text-gray-800'}`} data-no-translate>{v}</div>
        </div>
    );
}

/* ─── EL MODAL ───────────────────────────────────────────────────────
 *
 * ⚠️ PIDE CONFIRMACIÓN EXPLÍCITA. No es ceremonia: confirmar un desembolso
 * mueve el estado financiero del aporte y puede mandarle un correo a un
 * tercero, y ninguna de las dos cosas se deshace pulsando «atrás». El servidor
 * la exige además por su cuenta (428): esconder el paso en la pantalla no
 * protegería al endpoint de quien lo conoce.
 */
function DisbursementModal({ paymentId, clubId, currency, maximo, metodos, onCerrar, onHecho }: {
    paymentId: string;
    clubId?: string;
    currency: string;
    maximo: number;
    metodos: Metodo[];
    onCerrar: () => void;
    onHecho: () => void;
}) {
    const [monto, setMonto] = useState(String(maximo || ''));
    const [fechaDes, setFechaDes] = useState(() => new Date().toISOString().slice(0, 10));
    const [beneficiario, setBeneficiario] = useState('');
    const [metodo, setMetodo] = useState(metodos[0]?.id || 'transferencia');
    const [referencia, setReferencia] = useState('');
    const [notas, setNotas] = useState('');
    const [archivo, setArchivo] = useState<File | null>(null);
    const [notificar, setNotificar] = useState(false);
    const [correo, setCorreo] = useState('');
    const [confirmando, setConfirmando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState<string[]>([]);

    const parcial = Number(monto) > 0 && Number(monto) < maximo - 0.005;

    const enviar = async () => {
        setGuardando(true);
        setErrores([]);
        try {
            const fd = new FormData();
            fd.append('amount', String(Number(monto)));
            fd.append('disbursedAt', new Date(`${fechaDes}T12:00:00`).toISOString());
            fd.append('beneficiary', beneficiario);
            fd.append('method', metodo);
            fd.append('reference', referencia);
            fd.append('notes', notas);
            fd.append('notify', String(notificar));
            fd.append('notifyEmail', correo);
            fd.append('confirm', 'true');
            if (clubId) fd.append('clubId', clubId);
            if (archivo) fd.append('receipt', archivo);

            const r = await axios.post(
                `${API_BASE}/financial/payments/${paymentId}/disbursements`,
                fd,
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            // El aviso del correo se DICE aparte del desembolso: si el correo
            // falló, el traslado sigue siendo válido y eso no puede leerse como
            // que todo falló.
            const n = r.data?.notificacion;
            if (n?.estado === 'fallido') {
                toast.success('Desembolso registrado.');
                toast.error(`El aviso al beneficiario falló: ${n.error || 'sin motivo'}. Podés reintentarlo desde la ficha.`, { duration: 12000 });
            } else {
                toast.success(r.data?.balance?.completo
                    ? 'Desembolso registrado. El aporte queda completamente desembolsado.'
                    : 'Desembolso parcial registrado.');
            }
            (r.data?.avisos || []).forEach((a: string) => toast(a, { icon: '⚠️', duration: 8000 }));
            onHecho();
        } catch (e: any) {
            const data = e?.response?.data;
            setErrores(data?.errores?.length ? data.errores : [data?.error || 'No se pudo registrar el desembolso.']);
            setConfirmando(false);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Registrar desembolso">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900">Registrar desembolso</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Se registra un traslado que YA ocurrió. Disponible no es desembolsado.
                        </p>
                    </div>
                    <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    {errores.length > 0 && (
                        <ul className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700 space-y-1">
                            {errores.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <Campo label={`Monto (${currency})`}>
                            <input
                                type="number" step="0.01" min="0" value={monto}
                                onChange={e => setMonto(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                        </Campo>
                        <Campo label="Fecha del desembolso">
                            <input
                                type="date" value={fechaDes}
                                max={new Date().toISOString().slice(0, 10)}
                                onChange={e => setFechaDes(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                        </Campo>
                    </div>

                    {/* Un parcial se AVISA antes de confirmarlo: quien registra
                        400 de 1000 tiene que saber que el aporte NO va a quedar
                        marcado como desembolsado. */}
                    {parcial && (
                        <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                            Es un desembolso PARCIAL: el aporte no se marcará como completamente
                            desembolsado hasta que la suma llegue a {money(maximo, currency)}.
                        </p>
                    )}

                    <Campo label="Beneficiario / prestatario">
                        <input
                            type="text" value={beneficiario} onChange={e => setBeneficiario(e.target.value)}
                            placeholder="Nombre de la persona u organización que recibió el dinero"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        />
                    </Campo>

                    <div className="grid grid-cols-2 gap-3">
                        <Campo label="Medio de transferencia">
                            <select
                                value={metodo} onChange={e => setMetodo(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                            >
                                {metodos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                        </Campo>
                        <Campo label="Referencia / comprobante">
                            <input
                                type="text" value={referencia} onChange={e => setReferencia(e.target.value)}
                                placeholder="N.º de transferencia"
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                        </Campo>
                    </div>

                    <Campo label="Observaciones">
                        <textarea
                            value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        />
                    </Campo>

                    <Campo label="Adjuntar comprobante (PDF, JPG o PNG)">
                        <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            onChange={e => setArchivo(e.target.files?.[0] || null)}
                            className="w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-xs file:font-bold"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                            Se guarda en privado. El enlace para verlo se firma cada vez y caduca.
                        </p>
                    </Campo>

                    <label className="flex items-start gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox" checked={notificar}
                            onChange={e => setNotificar(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>Notificar al beneficiario por correo electrónico</span>
                    </label>
                    {notificar && (
                        <Campo label="Correo del beneficiario">
                            <input
                                type="email" value={correo} onChange={e => setCorreo(e.target.value)}
                                placeholder="beneficiario@ejemplo.com"
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                        </Campo>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                    {!confirmando ? (
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onCerrar} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmando(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                            >
                                <Send className="w-4 h-4" /> Confirmar desembolso
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {/* La confirmación DICE lo que va a pasar, no pregunta
                                «¿estás seguro?»: lo que hay que poder revisar es
                                el hecho concreto, no la certeza. */}
                            <p className="text-xs text-gray-700">
                                Se registrará un desembolso de <strong data-no-translate>{money(Number(monto) || 0, currency)}</strong>
                                {' a '}<strong data-no-translate>{beneficiario || '—'}</strong>
                                {notificar && correo ? <> y se le avisará a <strong data-no-translate>{correo}</strong></> : null}.
                                {' '}Una vez confirmado no se borra: si hay que corregirlo, se reversa y el reverso queda a la vista.
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
            </div>
        </div>
    );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</span>
            {children}
        </label>
    );
}
