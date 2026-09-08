/**
 * LA BARRA DE ACCIONES SOBRE APORTES YA TRASLADADOS — v4.1015
 *
 * Aparece al marcar uno o varios aportes cuyo dinero ya se giró al
 * beneficiario. Es la hermana de `BulkDisbursementBar`, y la diferencia es la
 * que sostiene todo el módulo:
 *
 *   · Aquélla REGISTRA un giro. Mueve dinero.
 *   · Ésta REENVÍA un documento sobre giros que ya ocurrieron. No mueve nada.
 *
 * ⚠️ POR ESO SON DOS BARRAS Y NO UNA CON UN `if`. Un solo componente con las
 * dos acciones adentro haría que un cambio pensado para el reenvío pudiera
 * colarse en el registro, y ahí el precio es un desembolso que nadie pidió.
 *
 * ⚠️ Y POR ESO UNA SELECCIÓN MEZCLADA NO EJECUTA NADA: se dice y se ofrece
 * quedarse con una de las dos clases.
 *
 * ⚠️ v4.1015 — YA NO SE EXIGE UN TRASLADO AGRUPADO. Hasta v4.1014 el botón se
 * apagaba con «ninguno pertenece a un traslado agrupado»: un aporte girado de
 * a uno no tiene lote, así que ocho aportes trasladados —con su dinero afuera
 * y su insignia DISBURSED— no tenían ninguna forma de conciliarse. El botón se
 * habilita ahora con lo único que de verdad hace falta: que haya aportes con
 * un traslado vigente. Qué documento sale —el de un lote o uno consolidado— lo
 * DECIDE EL SERVIDOR y se dice acá antes de pulsar.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Send, Landmark, AlertTriangle, X, Info } from 'lucide-react';
import ResendNoticeModal from './ResendNoticeModal';
import { AVISO_SIN_MOVIMIENTO, AMBITO_LABEL, type AmbitoConciliacion } from '../../../lib/reconciliationSpec';

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

/** El ámbito ya resuelto por el servidor. La pantalla lo PINTA; no lo deduce. */
interface PlanResuelto {
    scope: AmbitoConciliacion;
    header: {
        ref: string;
        beneficiary: string;
        campaignName: string | null;
        currency: string;
        count: number;
        netAmount: number;
        dateLabel?: string;
        sources?: { ref: string; kind: string }[];
    } | null;
    plan: { paymentIds: string[]; batchIds: string[]; sueltos: string[]; excluidos: string[] } | null;
    avisos: string[];
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
    const [resuelto, setResuelto] = useState<PlanResuelto | null>(null);
    const [resolviendo, setResolviendo] = useState(false);
    const [fallo, setFallo] = useState<string | null>(null);
    const [abierto, setAbierto] = useState(false);

    const ids = elegidos.map(e => e.paymentId).join(',');

    /**
     * ⚠️ QUÉ SE VA A CONCILIAR LO RESUELVE EL SERVIDOR.
     *
     * La pantalla no lo deduce y no puede: el vínculo con el traslado vive en
     * `Disbursement.batchId` y no viaja con el aporte. Con un agrupamiento
     * propio acá, la barra diría «una conciliación» y saldrían dos —o peor,
     * mandaría la de un club a otro—.
     */
    const resolver = useCallback(async () => {
        if (!ids) { setResuelto(null); setFallo(null); return; }
        setResolviendo(true); setFallo(null);
        try {
            const { data } = await axios.post(
                `${API_BASE}/financial/wallet/reconciliations/resolve`,
                { paymentIds: ids.split(','), ...(clubId ? { clubId } : {}) },
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            setResuelto({ scope: data.scope, header: data.header, plan: data.plan, avisos: data.avisos || [] });
        } catch (e: unknown) {
            const err = e as { response?: { status?: number; data?: { error?: string } } };
            const s = err?.response?.status;
            // Se dice QUÉ pasó: una sesión vencida y un aporte ajeno se
            // corrigen en sitios distintos (regla del sitio).
            setFallo(
                s === 401 ? 'Tu sesión venció. Volvé a entrar.'
                    : s === 403 ? 'No tenés permiso para conciliar en este sitio.'
                        : err?.response?.data?.error || 'No se pudo resolver la conciliación de estos aportes.'
            );
            setResuelto(null);
        } finally { setResolviendo(false); }
    }, [ids, clubId]);

    useEffect(() => { void resolver(); }, [resolver]);

    if (!elegidos.length) return null;

    const conciliables = resuelto?.plan?.paymentIds?.length || 0;
    const excluidos = resuelto?.plan?.excluidos?.length || 0;
    const puede = conciliables > 0;
    const rotulo = resuelto ? AMBITO_LABEL[resuelto.scope] : null;

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
                                        ? 'Resolviendo la conciliación…'
                                        : fallo
                                            ? fallo
                                            : puede && resuelto?.header
                                                ? <>
                                                    {rotulo?.titulo}
                                                    {' · '}
                                                    <span data-no-translate>{resuelto.header.count}</span> aporte(s)
                                                    {' · '}
                                                    <span data-no-translate>{money(resuelto.header.netAmount, resuelto.header.currency)}</span>
                                                </>
                                                : 'Ninguno de los aportes elegidos tiene un traslado vigente que conciliar.'}
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
                        conciliación sea la de un traslado completo, o una
                        consolidada de varios movimientos, no se puede descubrir
                        cuando ya salió.

                        ⚠️ Y NINGUNO DE ESTOS AVISOS BLOQUEA. El de v4.1014
                        —«ninguno pertenece a un traslado agrupado»— era el
                        único que sí lo hacía, y era falso: sí tienen
                        conciliación, sólo que no es la de un lote. */}
                    {!resolviendo && (resuelto?.avisos.length || 0) > 0 && (
                        <ul className="mt-2 space-y-1">
                            {resuelto!.avisos.map((a, k) => (
                                <li key={k} className="flex items-start gap-1.5 text-[11px] text-violet-800">
                                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    <span>{a}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Un aporte sin traslado vigente se DICE en vez de dejarlo
                        fuera en silencio: puede no haberse girado nunca, o
                        tener su desembolso reversado. */}
                    {!resolviendo && excluidos > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800">
                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>
                                <span data-no-translate>{excluidos}</span> aporte(s) queda(n) fuera del documento: no
                                tiene(n) un traslado vigente registrado.
                            </span>
                        </p>
                    )}

                    {!resolviendo && puede && resuelto?.header && (
                        <>
                            <p className="mt-2 text-[11px] text-violet-800" data-no-translate>
                                {resuelto.header.ref} · {resuelto.header.beneficiary}
                                {resuelto.header.dateLabel ? ` · ${resuelto.header.dateLabel}` : ''}
                            </p>
                            <p className="mt-2 text-[11px] text-violet-700">{AVISO_SIN_MOVIMIENTO}</p>
                        </>
                    )}
                </div>
            </div>

            {abierto && (
                <ResendNoticeModal
                    paymentIds={elegidos.map(e => e.paymentId)}
                    clubId={clubId}
                    onCerrar={() => setAbierto(false)}
                    onEnviado={() => onRecargar?.()}
                />
            )}
        </>
    );
}
