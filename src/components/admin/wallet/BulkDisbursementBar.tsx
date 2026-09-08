/**
 * Marcar VARIOS aportes como desembolsados de una vez.
 *
 * v4.886 — Se pidió con estas palabras: «poder tener esa selección y marcar lo
 * que seleccionamos como completado o trasladado». Un club que gira veinte
 * aportes en una sola transferencia no puede abrir veinte fichas.
 *
 * ═════════════════════════════════════════════════════════════════════
 * ⚠️ SE COMPARTE EL FORMULARIO, NO EL REGISTRO — Y EL AVISO ES DEL LOTE.
 * ═════════════════════════════════════════════════════════════════════
 *
 * El servidor escribe UNA FILA POR APORTE. Un movimiento agregado que cubriera
 * cinco aportes no se podría reversar parcialmente, no se podría atribuir a su
 * campaña y no cuadraría contra un extracto aporte por aporte. Lo único común
 * es lo que se escribe una vez —beneficiario, fecha, medio, referencia—.
 *
 * v4.996 — Y lo que se comparte también es la NOTIFICACIÓN: las N filas cuelgan
 * de un LOTE (`DisbursementBatch`) con su referencia y su total, y es el lote
 * quien manda UN correo consolidado con todos los aportes adentro. Hasta
 * v4.995 cada fila avisaba por su cuenta: ocho aportes, ocho correos. Cuántos
 * lotes va a haber lo DICE el servidor (`/bulk/preview`), no se deduce acá: con
 * dos criterios de agrupación el modal diría «1 notificación» y saldrían dos.
 *
 * ⚠️ IDEMPOTENTE POR OPERACIÓN. El modal genera `operationKey` al abrirse y la
 * manda con la petición: un doble clic, un reintento de red o un refresco a
 * mitad devuelven los mismos lotes sin registrar ni avisar de nuevo.
 *
 * ⚠️ Y EL MONTO NO SE ESCRIBE: cada aporte se registra por lo que le FALTA. Un
 * total repartido entre cinco con un criterio que nadie puede reconstruir
 * después es peor que no tener la función. Si lo que se giró fue otra cosa, se
 * registran de a uno.
 */
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2, Send, X, AlertTriangle, Eye } from 'lucide-react';
// v4.888 — Los destinatarios, COMPARTIDOS con el modal de un aporte.
import NoticeRecipients, { type EstadoWhatsapp } from './NoticeRecipients';
import DisbursementBatchModal from './DisbursementBatchModal';
import ReceiptFilesInput from './ReceiptFilesInput';
import { nombrarComprobantes } from '../../../lib/receiptFiles';

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
    /**
     * v4.1014 — QUÉ CLASE DE APORTE ES.
     *
     * ⚠️ Es lo que decide qué barra de acciones aparece, y de eso cuelga que no
     * se pueda hacer una cosa creyendo que se hace la otra: sobre `disponible`
     * se REGISTRA un giro —mueve dinero— y sobre `trasladado` se REENVÍA un
     * documento —no mueve nada—. Un solo mapa de selección con la clase adentro
     * en vez de dos mapas: dos se separarían en silencio.
     *
     * Ausente significa `disponible`: es lo que eran todos hasta v4.1013, así
     * que un componente que todavía no la mande se comporta como antes.
     */
    clase?: 'disponible' | 'trasladado';
}

interface Metodo { id: string; label: string }

/** Lo que el servidor dice que va a pasar (`/bulk/preview`). */
interface Previo {
    cuantosLotes: number;
    cuantosAportes: number;
    cuantasNotificaciones: number;
    lotes: Array<{ key: string; currency: string; campaignId: string | null; campaignName: string | null; count: number; total: number; totalLabel: string }>;
}

/** Lo que el servidor devolvió al registrar. Conserva la forma de v4.886 y
 *  agrega los lotes con el resultado de SU notificación. */
interface Resultado {
    repetida?: boolean;
    registrados: number;
    saltados: Array<{ id: string; motivo: string }>;
    totalesPorMoneda: Record<string, number>;
    notificacionesEnviadas?: number;
    lotes?: Array<{ id: string; ref: string; count: number; netAmount: number; currency: string; campaignName: string | null; notifyState: string | null }>;
}

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

export default function BulkDisbursementBar({ elegidos, clubId, onLimpiar, onHecho, onRecargar }: {
    elegidos: Elegible[];
    clubId?: string;
    onLimpiar: () => void;
    /** Terminó: limpia la selección y recarga. */
    onHecho: () => void;
    /** v4.996 — Sólo recarga la lista, SIN limpiar la selección: con la
     *  selección vacía esta barra se desmonta y se llevaría el resultado
     *  —y el botón «Ver desembolso»— antes de que nadie lo lea. */
    onRecargar?: () => void;
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
                    onListaCambio={onRecargar}
                />
            )}
        </>
    );
}

function BulkModal({ elegidos, porMoneda, clubId, onCerrar, onHecho, onListaCambio }: {
    elegidos: Elegible[];
    porMoneda: Record<string, { total: number; cuantos: number }>;
    clubId?: string;
    onCerrar: () => void;
    onHecho: () => void;
    /** La lista de fondo se refresca en cuanto hay registro, sin cerrar el modal. */
    onListaCambio?: () => void;
}) {
    const [fechaDes, setFechaDes] = useState(() => new Date().toISOString().slice(0, 10));
    const [beneficiario, setBeneficiario] = useState('');
    const [metodo, setMetodo] = useState('transferencia');
    const [referencia, setReferencia] = useState('');
    const [notas, setNotas] = useState('');
    // v4.998 — VARIOS comprobantes: el PDF del banco y la captura del costo.
    const [archivos, setArchivos] = useState<File[]>([]);
    const [notificar, setNotificar] = useState(false);
    const [correos, setCorreos] = useState('');
    const [telefonos, setTelefonos] = useState('');
    const [estadoWa, setEstadoWa] = useState<EstadoWhatsapp | null>(null);
    const [confirmando, setConfirmando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [resultado, setResultado] = useState<Resultado | null>(null);
    // v4.996 — La llave de la OPERACIÓN: una por apertura del modal. Es lo que
    // hace que confirmar dos veces —o reintentar tras un fallo de red— no
    // registre ni avise dos veces.
    const [operationKey] = useState(() =>
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    // Lo que VA A PASAR, dicho por el servidor: cuántos lotes y cuánto cada uno.
    const [previo, setPrevio] = useState<Previo | null>(null);
    const [verLote, setVerLote] = useState<string | null>(null);

    // ⚠️ El hook va ARRIBA, antes de cualquier return: React identifica cada
    // hook por su ORDEN de llamada (v4.689).
    useEffect(() => {
        let vivo = true;
        axios.get(`${API_BASE}/financial/wallet/whatsapp-template`, {
            params: clubId ? { clubId } : undefined,
            headers: { Authorization: `Bearer ${token()}` },
        })
            .then(r => { if (vivo) setEstadoWa(r.data); })
            .catch(() => {
                if (vivo) setEstadoWa({
                    configurado: false, listo: false, plantilla: null,
                    motivo: 'No se pudo comprobar si WhatsApp está disponible.',
                });
            });
        return () => { vivo = false; };
    }, [clubId]);

    // El previo del lote lo calcula el SERVIDOR con el mismo criterio que va a
    // usar al registrar. Se pide al abrir y cada vez que cambia el
    // beneficiario —que es parte de la llave de agrupación—, con una pausa
    // corta para no pedirlo por tecla.
    useEffect(() => {
        let vivo = true;
        const t = setTimeout(() => {
            axios.post(`${API_BASE}/financial/wallet/disbursements/bulk/preview`, {
                clubId, paymentIds: elegidos.map(e => e.paymentId), beneficiary: beneficiario,
            }, { headers: { Authorization: `Bearer ${token()}` } })
                .then(r => { if (vivo) setPrevio(r.data); })
                .catch(() => { if (vivo) setPrevio(null); });
        }, 350);
        return () => { vivo = false; clearTimeout(t); };
    }, [clubId, elegidos, beneficiario]);

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
                // ⚠️ v4.889 — Acá estaba el defecto que dejaba el botón sin hacer
                // nada. v4.888 renombró el estado de `correo` a `correos` y
                // agregó `telefonos`, y ESTA línea se quedó con el nombre viejo:
                // un `ReferenceError` dentro del `try`, que caía en el `catch`,
                // mostraba un toast genérico y devolvía al formulario. Se
                // reportó como «confirmo y no aparece nada».
                //
                // No lo atrapó el typecheck porque en el entorno de desarrollo
                // no había dependencias instaladas y `tsc` abortaba antes de
                // mirar los archivos, devolviendo exit 0 con dos errores de
                // configuración. Un typecheck que no comprueba nada y sale en
                // verde es peor que no correrlo: da por verificado lo que no se
                // miró. Ver la regla en CLAUDE.md.
                notifyEmails: correos,
                notifyPhones: telefonos,
                operationKey,
                confirm: true,
            };

            let payload: FormData | typeof cuerpo = cuerpo;
            if (archivos.length) {
                const fd = new FormData();
                Object.entries(cuerpo).forEach(([k, v]) => {
                    // El array viaja como JSON en un solo campo: `append` por
                    // elemento lo entrega como texto repetido y el servidor
                    // tendría que adivinar cuál de las dos formas es.
                    fd.append(k, k === 'paymentIds' ? JSON.stringify(v) : String(v));
                });
                // v4.998 — cada comprobante bajo el MISMO campo: es la forma
                // que multer entrega como lista, y la que un solo archivo
                // también cumple.
                archivos.forEach(a => fd.append('receipt', a));
                payload = fd;
            }

            const r = await axios.post(
                `${API_BASE}/financial/wallet/disbursements/bulk`,
                payload,
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            setResultado(r.data);
            if (r.data?.repetida) {
                toast('Esta operación ya se había registrado: no se repitió nada ni se volvió a avisar.', { icon: 'ℹ️', duration: 8000 });
            } else if (r.data?.registrados > 0) {
                toast.success(`${r.data.registrados} aporte(s) marcados como desembolsados en ${r.data.lotes?.length || 1} lote(s).`);
            }
            (r.data?.avisos || []).forEach((a: string) => toast(a, { icon: '⚠️', duration: 8000 }));
            // El resultado se queda A LA VISTA —con «Ver desembolso»— en vez de
            // cerrarse: quien confirmó tiene que poder ver qué lote salió, qué
            // no entró y si el correo consolidado se envió. La lista de fondo se
            // refresca igual.
            onListaCambio?.();
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
                            {elegidos.length} aporte{elegidos.length === 1 ? '' : 's'}. Se registran como un
                            desembolso agrupado: una referencia, un comprobante y una notificación consolidada.
                            Cada aporte conserva su propio registro.
                        </p>
                    </div>
                    <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {resultado ? (
                    <div className="px-5 py-4 space-y-3">
                        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> {resultado.repetida ? 'Ya estaba registrado' : 'Desembolso completado'}
                            </div>
                            <p className="text-sm text-gray-800">
                                <strong data-no-translate>{resultado.registrados}</strong> aporte(s) actualizado(s)
                                {' · '}
                                {Object.entries(resultado.totalesPorMoneda || {}).map(([c, t]) => (
                                    <strong key={c} data-no-translate>{money(t, c)} </strong>
                                ))}
                                desembolsados
                                {' · '}
                                <strong data-no-translate>{resultado.notificacionesEnviadas ?? 0}</strong> notificación(es) consolidada(s) enviada(s)
                            </p>
                        </div>

                        {/* Un renglón por lote, con su referencia y su aviso, y el
                            botón que abre su ficha. Es lo que permite consultar
                            después qué aportes hicieron parte de ese giro. */}
                        {(resultado.lotes || []).map(l => (
                            <div key={l.id} className="rounded-lg border border-gray-200 px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono font-bold text-gray-800" data-no-translate>{l.ref}</span>
                                <span className="text-gray-600"><span data-no-translate>{l.count}</span> aporte(s)</span>
                                <span className="font-semibold text-gray-900" data-no-translate>{money(l.netAmount, l.currency)} {l.currency}</span>
                                {l.campaignName && <span className="text-gray-500" data-no-translate>· {l.campaignName}</span>}
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                                    l.notifyState === 'enviado' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                        : l.notifyState === 'fallido' ? 'bg-red-50 text-red-700 border-red-100'
                                            : l.notifyState === 'parcial' ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                    {l.notifyState === 'enviado' ? 'Aviso enviado'
                                        : l.notifyState === 'fallido' ? 'Aviso falló'
                                            : l.notifyState === 'parcial' ? 'Aviso parcial'
                                                : l.notifyState ? `Aviso: ${l.notifyState}` : 'Sin aviso'}
                                </span>
                                <button
                                    type="button" onClick={() => setVerLote(l.id)}
                                    className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-900 text-white text-[11px] font-bold hover:bg-black"
                                >
                                    <Eye className="w-3 h-3" /> Ver desembolso
                                </button>
                            </div>
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
                                {/* Lo que el SERVIDOR va a agrupar. Con una sola campaña y
                                    una sola moneda es un lote; si se parte, se dice acá
                                    y no se descubre en la bandeja. */}
                                {previo && previo.cuantosLotes > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                            {previo.cuantosLotes === 1 ? '1 desembolso agrupado' : `${previo.cuantosLotes} desembolsos agrupados`}
                                        </div>
                                        {previo.lotes.map(l => (
                                            <div key={l.key} className="flex justify-between text-xs text-gray-700">
                                                <span>
                                                    <span data-no-translate>{l.count}</span> aporte(s)
                                                    {l.campaignName ? <> · <span data-no-translate>{l.campaignName}</span></> : ' · sin campaña'}
                                                </span>
                                                <span className="font-semibold" data-no-translate>{l.totalLabel}</span>
                                            </div>
                                        ))}
                                        {previo.cuantosLotes > 1 && (
                                            <p className="text-[11px] text-amber-700">
                                                Se parte porque hay más de una moneda o campaña: nunca se mezclan en una misma notificación.
                                            </p>
                                        )}
                                    </div>
                                )}
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
                                <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                                    Beneficiario / prestatario <span className="text-red-500">*</span>
                                </span>
                                <input
                                    type="text" value={beneficiario} onChange={e => setBeneficiario(e.target.value)}
                                    placeholder="Quién recibió el dinero"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                />
                                {/* El motivo va A LA VISTA, no sólo el botón apagado: un
                                    control deshabilitado sin explicación se lee como
                                    que el módulo está roto. */}
                                {!beneficiario.trim() && (
                                    <p className="text-[11px] text-amber-700 mt-1">
                                        Hace falta para poder confirmar: es quién recibió el dinero.
                                    </p>
                                )}
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
                            <ReceiptFilesInput
                                label="Comprobantes del giro (PDF, JPG o PNG)"
                                files={archivos}
                                onChange={setArchivos}
                                disabled={guardando}
                                hint={<>Son el soporte de la transferencia COMPLETA, no de un aporte suelto: se guardan una
                                    vez y quedan enlazados a los {elegidos.length} como comprobantes del giro. Si cada
                                    aporte salió por separado, adjuntá el suyo desde su ficha.</>}
                            />

                            <NoticeRecipients
                                notificar={notificar} onNotificar={setNotificar}
                                correos={correos} onCorreos={setCorreos}
                                telefonos={telefonos} onTelefonos={setTelefonos}
                                estadoWa={estadoWa}
                                cuantosAvisos={previo?.cuantosLotes ?? 1}
                            />
                        </div>

                        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                            {!confirmando ? (
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={onCerrar} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                                        Cancelar
                                    </button>
                                    {/* ⚠️ v4.889 — NO se deja pasar a la confirmación sin
                                        beneficiario. El servidor ya lo rechazaba —y lo
                                        sigue rechazando, que es donde manda— pero
                                        dejaba llegar a una pantalla que decía «se
                                        registrarán 5 desembolsos a —» y gastaba la
                                        petición para volver con cinco errores iguales.
                                        Un control que se puede satisfacer antes de
                                        gastar el gesto se comprueba antes. */}
                                    <button
                                        type="button"
                                        onClick={() => setConfirmando(true)}
                                        disabled={!beneficiario.trim()}
                                        title={!beneficiario.trim() ? 'Falta decir quién recibió el dinero' : undefined}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Send className="w-4 h-4" /> Confirmar desembolso
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {/* La confirmación DICE lo que va a pasar, con los números
                                        del servidor: cuántos lotes, cuántos aportes, cuánto,
                                        a quién, y cuántas notificaciones consolidadas. */}
                                    <div className="text-xs text-gray-700 space-y-1">
                                        <p className="font-bold text-gray-900">Confirmar desembolso</p>
                                        <p>
                                            <strong data-no-translate>{elegidos.length}</strong> aporte(s) seleccionado(s) ·{' '}
                                            {Object.entries(porMoneda).map(([c, d]) => (
                                                <strong key={c} data-no-translate>{money(d.total, c)} </strong>
                                            ))}
                                            · Beneficiario: <strong data-no-translate>{beneficiario || '—'}</strong>
                                            {previo?.lotes?.length === 1 && previo.lotes[0].campaignName
                                                ? <> · Campaña: <strong data-no-translate>{previo.lotes[0].campaignName}</strong></>
                                                : null}
                                            {archivos.length ? <>, con <strong data-no-translate>{nombrarComprobantes(archivos)}</strong> como comprobante{archivos.length > 1 ? 's' : ''} del giro{notificar && correos ? (archivos.length > 1 ? ' (van adjuntos en la notificación)' : ' (va adjunto en la notificación)') : ''}</> : null}.
                                        </p>
                                        <p>
                                            Se registrará{(previo?.cuantosLotes ?? 1) === 1 ? '' : 'n'}{' '}
                                            <strong data-no-translate>{previo?.cuantosLotes ?? 1}</strong> desembolso{(previo?.cuantosLotes ?? 1) === 1 ? '' : 's'} agrupado{(previo?.cuantosLotes ?? 1) === 1 ? '' : 's'}
                                            {notificar && (correos || telefonos)
                                                ? <> y se enviará{(previo?.cuantosLotes ?? 1) === 1 ? '' : 'n'} <strong data-no-translate>{previo?.cuantosLotes ?? 1}</strong> notificación{(previo?.cuantosLotes ?? 1) === 1 ? '' : 'es'} consolidada{(previo?.cuantosLotes ?? 1) === 1 ? '' : 's'} a <strong data-no-translate>{[correos, telefonos].filter(Boolean).join(', ')}</strong></>
                                                : <> sin notificación</>}.
                                            Una vez confirmado no se borra: si hay que corregir un aporte, se reversa desde su ficha.
                                        </p>
                                    </div>
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
            {verLote && (
                <DisbursementBatchModal batchId={verLote} clubId={clubId} onCerrar={() => setVerLote(null)} />
            )}
        </div>
    );
}
