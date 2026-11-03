// Las estadísticas de UN código QR (v4.1278): escaneos que saltaron, los que
// no (vencido o pausado), visitantes, dispositivo, país y actividad reciente.
//
// Lo que se mide son ACCESOS a la dirección codificada en el QR. No se
// presenta como «escaneos físicos» ni como inscripciones: si alguien comparte
// esa misma dirección por chat, su tráfico sigue atribuido al QR.
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { SOURCE_LABELS, DEVICE_LABELS, PERIOD_LABELS } from '../../../lib/linkTracking';
import { QR_STATE_LABELS, QR_MEDIA_SHORT, daysLeft } from '../../../lib/linkQr';
import { api, type QrDto, type Redirect } from './api';
import { Kpi, Seccion, Barras, SerieBarras, EstadoPill, numero, haceCuanto, fechaHora } from './StatsBits';

const RESULTADO: Record<string, string> = {
    redirected: 'Saltó al destino', expired: 'Vencido', paused: 'Pausado', disabled: 'Deshabilitado', deleted: 'Eliminado',
};

export default function QrStatsModal({ qr, link, onCerrar }: { qr: QrDto; link: Redirect; onCerrar: () => void }) {
    const [period, setPeriod] = useState('d30');
    const [data, setData] = useState<any>(null);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState('');

    useEffect(() => {
        let vivo = true;
        setCargando(true); setFallo('');
        api(`/${link.id}/qrs/${qr.id}/stats?period=${period}`)
            .then(d => { if (vivo) setData(d); })
            .catch(e => { if (vivo) setFallo(e.message); })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [link.id, qr.id, period]);

    const dias = daysLeft(qr.expiresAt);

    return (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onCerrar}>
            <div className="bg-white rounded-3xl w-full max-w-4xl my-8 p-8 shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Código QR</p>
                        <h4 className="text-lg font-bold text-gray-800 truncate">{qr.name}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-400">
                            <EstadoPill state={qr.state} texto={QR_STATE_LABELS[qr.state]} />
                            <span>{QR_MEDIA_SHORT[qr.medium] || qr.medium}</span>
                            {qr.campaign && <span>· {qr.campaign}</span>}
                            {qr.expiresAt
                                ? <span>· {qr.state === 'expired' ? 'venció' : 'vence'} el {String(qr.expiresAt).slice(0, 10)}{dias !== null && qr.state !== 'expired' ? ` (${dias} d)` : ''}</span>
                                : <span>· sin vencimiento</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Período"
                            className="px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue">
                            {Object.entries(PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <button onClick={onCerrar} aria-label="Cerrar" className="p-2 text-gray-300 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                {fallo && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-4">{fallo}</p>}
                {cargando && <p className="text-sm text-gray-400 py-10 text-center">Cargando estadísticas…</p>}

                {data && !cargando && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                            <Kpi label="Accesos por este QR" value={numero(data.totals.scans)} destacado />
                            <Kpi label="Visitantes únicos" value={numero(data.totals.uniqueVisitors)} nota="estimados" />
                            <Kpi label="Hoy" value={numero(data.totals.today)} />
                            <Kpi label="Últimos 7 días" value={numero(data.totals.last7)} />
                            <Kpi label="Últimos 30 días" value={numero(data.totals.last30)} />
                            <Kpi label="Último acceso" value={haceCuanto(data.totals.lastScanAt, 'sin accesos')} pequeno />
                        </div>

                        {(data.totals.blocked > 0 || data.totals.bots > 0) && (
                            <p className="text-[11px] text-gray-400 -mt-3 mb-6">
                                {data.totals.blocked > 0 && <>Además, <strong>{numero(data.totals.blocked)}</strong> escaneos llegaron con el código vencido, pausado o deshabilitado y vieron la página de «no disponible»: no llegaron al destino y no se cuentan arriba. </>}
                                {data.totals.bots > 0 && <>Y <strong>{numero(data.totals.bots)}</strong> accesos automáticos (vistas previas y rastreadores), que tampoco se cuentan.</>}
                            </p>
                        )}

                        <Seccion titulo={`Accesos por día · ${data.period.label}`}>
                            <SerieBarras series={data.series} modo="qr" />
                        </Seccion>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <Seccion titulo="Dispositivo">
                                <Barras filas={(data.devices || []).map((d: any) => ({ label: DEVICE_LABELS[d.device] || d.device, value: d.clicks }))} />
                            </Seccion>
                            <Seccion titulo="Ubicación aproximada (país)">
                                {data.countries?.length
                                    ? <Barras filas={data.countries.map((c: any) => ({ label: c.country, value: c.clicks }))} />
                                    : <p className="text-xs text-gray-400 italic">Sin datos de ubicación. El país lo entrega la red, no siempre llega.</p>}
                            </Seccion>
                            <Seccion titulo="Fuente declarada">
                                <Barras filas={(data.sources || []).map((s: any) => ({ label: SOURCE_LABELS[s.kind] || s.label || s.kind, value: s.clicks }))} />
                                <p className="text-[11px] text-gray-400 mt-2">
                                    Un escaneo desde la cámara llega sin referencia, así que casi todo cae en «Directo o desconocido». Es lo esperable.
                                </p>
                            </Seccion>
                            <Seccion titulo="Navegador">
                                <Barras filas={(data.browsers || []).map((b: any) => ({ label: b.browser, value: b.clicks }))} />
                            </Seccion>
                        </div>

                        <Seccion titulo="Actividad reciente">
                            {data.recent?.length ? (
                                <div className="scroll-x-visible overflow-x-auto">
                                    <table className="min-w-max w-full text-xs">
                                        <thead>
                                            <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
                                                <th className="py-2 pr-4">Cuándo</th><th className="py-2 pr-4">Resultado</th>
                                                <th className="py-2 pr-4">Dispositivo</th><th className="py-2 pr-4">País</th><th className="py-2">Visitante</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {data.recent.map((e: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{fechaHora(e.createdAt)}</td>
                                                    <td className={`py-2 pr-4 font-semibold ${e.outcome === 'redirected' ? 'text-emerald-700' : 'text-amber-700'}`}>{RESULTADO[e.outcome] || e.outcome}</td>
                                                    <td className="py-2 pr-4 text-gray-600">{DEVICE_LABELS[e.device] || e.device}{e.browser ? ` · ${e.browser}` : ''}</td>
                                                    <td className="py-2 pr-4 text-gray-600">{e.country || '—'}</td>
                                                    <td className="py-2 text-gray-400">{e.isNewVisitor ? 'nuevo' : 'recurrente'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : <p className="text-xs text-gray-400 italic">Sin accesos en este período.</p>}
                        </Seccion>
                    </>
                )}
            </div>
        </div>
    );
}
