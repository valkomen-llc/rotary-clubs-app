/**
 * LA BARRA DE ACCIONES SOBRE APORTES YA TRASLADADOS — v4.1014
 *
 * Aparece al marcar uno o varios aportes cuyo dinero ya se giró al
 * beneficiario. Es la hermana de `BulkDisbursementBar`, y la diferencia es la
 * que sostiene todo el módulo:
 *
 *   · Aquélla REGISTRA un giro. Mueve dinero.
 *   · Ésta REENVÍA un documento sobre un giro que ya ocurrió. No mueve nada.
 *
 * ⚠️ POR ESO SON DOS BARRAS Y NO UNA CON UN `if`. Un solo componente con las
 * dos acciones adentro haría que un cambio pensado para el reenvío pudiera
 * colarse en el registro, y ahí el precio es un desembolso que nadie pidió.
 *
 * ⚠️ Y POR ESO UNA SELECCIÓN MEZCLADA NO EJECUTA NADA: se dice y se ofrece
 * quedarse con una de las dos clases.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, Send, Landmark, AlertTriangle, X, Info } from 'lucide-react';
import ResendNoticeModal from './ResendNoticeModal';
import { AVISO_SIN_MOVIMIENTO } from '../../../lib/reconciliationSpec';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

/** Un aporte elegido. Es el MISMO `Elegible` de la barra de desembolso más su
 *  `clase`: un solo mapa de selección en la pantalla, y la clase decide qué
 *  barra aparece. Dos mapas se separarían en silencio. */
export interface ElegidoTrasladado {
    paymentId: string;
    currency: string;
    titulo: string;
    clase?: string;
}

interface LoteResuelto {
    id: string;
    ref: string;
    beneficiary: string;
    campaignName: string | null;
    currency: string;
    count: number;
    netAmount: number;
    disbursedAt: string;
}

const money = (n: number, c: string) => {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: c,
            minimumFractionDigits: c === 'COP' ? 0 : 2,
            maximumFractionDigits: c === 'COP' ? 0 : 2,
        }).format(n || 0);
    } catch { return `${(n || 0).toFixed(2)} ${c}`; }
};

export default function BulkReconciliationBar({ elegidos, clubId, onLimpiar, onRecargar }: {
    elegidos: ElegidoTrasladado[];
    clubId?: string;
    onLimpiar: () => void;
    onRecargar?: () => void;
}) {
    const [lotes, setLotes] = useState<LoteResuelto[]>([]);
    const [sueltos, setSueltos] = useState<string[]>([]);
    const [avisos, setAvisos] = useState<string[]>([]);
    const [resolviendo, setResolviendo] = useState(false);
    const [abierto, setAbierto] = useState(false);

    const ids = elegidos.map(e => e.paymentId).join(',');

    /**
     * ⚠️ A QUÉ TRASLADO PERTENECE CADA APORTE LO RESUELVE EL SERVIDOR.
     *
     * La pantalla no lo deduce y no puede: el vínculo vive en
     * `Disbursement.batchId` y no viaja con el aporte. Con un agrupamiento
     * propio acá, la barra diría «una conciliación» y saldrían dos —o peor,
     * mandaría la de un club a otro—.
     */
    const resolver = useCallback(async () => {
        if (!ids) { setLotes([]); setSueltos([]); setAvisos([]); return; }
        setResolviendo(true);
        try {
            const { data } = await axios.post(
                `${API_BASE}/financial/wallet/disbursement-batches/resolve`,
                { paymentIds: ids.split(','), ...(clubId ? { clubId } : {}) },
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            setLotes(data.batches || []);
            setSueltos(data.sueltos || []);
            setAvisos(data.avisos || []);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { error?: string } } };
            toast.error(err?.response?.data?.error || 'No se pudieron resolver los traslados.');
            setLotes([]); setSueltos([]); setAvisos([]);
        } finally { setResolviendo(false); }
    }, [ids, clubId]);

    useEffect(() => { void resolver(); }, [resolver]);

    if (!elegidos.length) return null;

    const total = lotes.reduce((a, l) => a + (l.count || 0), 0);
    const puede = lotes.length > 0;

    return (
        <>
            {/* Pegada abajo: con una lista larga, un botón al final obliga a
                desplazarse hasta el fondo para actuar sobre algo que se marcó
                arriba (regla de v4.886). */}
            <div className="sticky bottom-4 z-20 mt-3">
                <div className="rounded-2xl border border-violet-200 bg-violet-50/95 backdrop-blur px-4 py-3 shadow-lg">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <Landmark className="w-4 h-4 text-violet-600 flex-shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-violet-900">
                                    <span data-no-translate>{elegidos.length}</span>{' '}
                                    aporte{elegidos.length === 1 ? '' : 's'} trasladado{elegidos.length === 1 ? '' : 's'} seleccionado{elegidos.length === 1 ? '' : 's'}
                                </p>
                                <p className="text-[11px] text-violet-700">
                                    {resolviendo
                                        ? 'Buscando a qué traslado pertenecen…'
                                        : puede
                                            ? <>
                                                {lotes.length === 1 ? '1 traslado' : `${lotes.length} traslados`}
                                                {' · '}
                                                <span data-no-translate>{total}</span> aporte(s) en total
                                            </>
                                            : 'Ninguno pertenece a un traslado agrupado.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button" onClick={onLimpiar}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-violet-700 hover:bg-violet-100"
                            >
                                <X className="w-3.5 h-3.5" /> Quitar selección
                            </button>
                            <button
                                type="button"
                                onClick={() => setAbierto(true)}
                                disabled={resolviendo || !puede}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {resolviendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Reenviar notificación
                            </button>
                        </div>
                    </div>

                    {/* ⚠️ EL ALCANCE SE DICE ANTES, no después del correo. Que la
                        conciliación va del traslado COMPLETO —y no de los
                        aportes marcados— no se puede descubrir cuando ya salió. */}
                    {!resolviendo && avisos.length > 0 && (
                        <ul className="mt-2 space-y-1">
                            {avisos.map((a, k) => (
                                <li key={k} className="flex items-start gap-1.5 text-[11px] text-violet-800">
                                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    <span>{a}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Un aporte cuyo giro se registró suelto —antes del
                        agrupamiento de v4.996— no tiene una conciliación de
                        traslado. Se DICE en vez de dejarlo fuera en silencio. */}
                    {!resolviendo && sueltos.length > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800">
                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>
                                <span data-no-translate>{sueltos.length}</span> aporte(s) se giró por fuera de un
                                traslado agrupado: su conciliación se consulta desde la ficha del aporte.
                            </span>
                        </p>
                    )}

                    {!resolviendo && puede && (
                        <>
                            <ul className="mt-2 space-y-0.5">
                                {lotes.map(l => (
                                    <li key={l.id} className="text-[11px] text-violet-800" data-no-translate>
                                        {l.ref} · {l.beneficiary} · {l.count} aporte(s) · {money(l.netAmount, l.currency)}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-[11px] text-violet-700">{AVISO_SIN_MOVIMIENTO}</p>
                        </>
                    )}
                </div>
            </div>

            {abierto && (
                <ResendNoticeModal
                    batchIds={lotes.map(l => l.id)}
                    clubId={clubId}
                    onCerrar={() => setAbierto(false)}
                    onEnviado={() => onRecargar?.()}
                />
            )}
        </>
    );
}
