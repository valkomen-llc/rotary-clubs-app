// ════════════════════════════════════════════════════════════════════
// Estadísticas de descarga de un documento del evento — v4.1279.0
//
// Se abre desde «Ver estadísticas» en la tarjeta de la guía descargable, sin
// salir de la administración del evento. Lo que se muestra son SOLICITUDES
// VÁLIDAS DE DESCARGA registradas por el servidor (y así se dice en
// pantalla): nunca «archivos guardados», nunca visitas a la ficha.
//
//   · indicadores: total histórico, hoy, 7 y 30 días, última descarga,
//     descargas de la versión vigente;
//   · evolución por día con filtros: hoy, 7, 30, todo el histórico y rango
//     personalizado (el servidor valida y recorta el rango);
//   · desde dónde se pidió (sección o vista ampliada), dispositivo, país y
//     fuente de la visita; versiones del archivo con sus descargas; últimas
//     solicitudes.
//
// Las piezas visuales (Kpi, Barras, Seccion…) son las mismas de los enlaces
// y los QR; el gráfico diario es propio porque habla de «descargas».
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { BarChart3, X } from 'lucide-react';
import { Kpi, Seccion, Barras, numero, haceCuanto, fechaHora } from '../link-qr/StatsBits';
import { SOURCE_LABELS, DEVICE_LABELS } from '../../../lib/linkTracking';
import { PERIOD_OPTIONS, DOWNLOAD_SOURCES, REPEAT_WINDOW_SEC, type DownloadDay } from '../../../../server/lib/eventDocumentStats.js';
import { formatBytes } from '../../../../server/lib/eventHotels.js';
import { fetchDocumentStats, type DocumentStatsDto } from '../../../lib/eventDocumentStats';

const isoHoy = () => new Date().toISOString().slice(0, 10);

/** La evolución por día. Un día sin descargas se dibuja vacío (el rango ya viene relleno). */
function BarrasDescargas({ series }: { series: DownloadDay[] }) {
    if (!series.length) return <p className="text-xs text-gray-400 italic">Sin descargas en este período.</p>;
    const max = Math.max(1, ...series.map(d => d.downloads));
    const etiqueta = (d: DownloadDay) => `${d.day}: ${numero(d.downloads)} descarga${d.downloads === 1 ? '' : 's'}${d.uniques ? ` · ${numero(d.uniques)} visitante${d.uniques === 1 ? '' : 's'} nuevo${d.uniques === 1 ? '' : 's'}` : ''}${d.repeats ? ` · ${numero(d.repeats)} repetida${d.repeats === 1 ? '' : 's'}` : ''}`;
    return (
        <div>
            <div className="flex items-end gap-[3px] h-32" role="img" aria-label="Descargas por día">
                {series.map(d => (
                    <div key={d.day} className="flex-1 min-w-[3px] group relative flex flex-col justify-end h-full">
                        {d.downloads > 0
                            ? <div className="w-full rounded-t bg-rotary-blue/80 group-hover:bg-rotary-blue" style={{ height: `${(d.downloads / max) * 100}%` }} />
                            : <div className="w-full border-t border-dashed border-gray-200" style={{ height: 0 }} />}
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-[10px] text-white z-10">
                            {etiqueta(d)}
                        </span>
                    </div>
                ))}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-gray-400 tabular-nums">
                <span>{series[0].day}</span>
                {series.length > 1 && <span>{series[series.length - 1].day}</span>}
            </div>
        </div>
    );
}

interface Props {
    eventId: string;
    fileName?: string;
    onClose: () => void;
}

export default function EventDocumentStatsModal({ eventId, fileName, onClose }: Props) {
    const [period, setPeriod] = useState('d30');
    const [from, setFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10);
    });
    const [to, setTo] = useState(isoHoy);
    const [data, setData] = useState<DocumentStatsDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        if (period === 'custom' && (!from || !to)) return undefined;
        setLoading(true); setError('');
        fetchDocumentStats(eventId, { period, from, to })
            .then(d => { if (alive) setData(d); })
            .catch(e => { if (alive) setError(e?.message || 'No pudimos leer las estadísticas.'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [eventId, period, from, to]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const totals = data?.totals;
    const sinDatos = data && (data.state === 'none' || !totals);

    return (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-white rounded-3xl w-full max-w-4xl my-8 p-6 sm:p-8 shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="doc-stats-title">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Estadísticas de descarga</p>
                        <h4 id="doc-stats-title" className="text-lg font-bold text-gray-800 truncate">{fileName || data?.document?.title || 'Guía descargable'}</h4>
                        <p className="text-xs text-gray-400 mt-1">
                            Solicitudes válidas de descarga registradas por el servidor desde la página pública del evento. No cuentan las visitas a la ficha ni las vistas previas de mensajería.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Período"
                            className="px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue">
                            {Object.entries(PERIOD_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-gray-300 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                {period === 'custom' && (
                    <div className="flex flex-wrap items-end gap-3 mb-6 rounded-2xl bg-gray-50 p-4">
                        <label className="text-xs text-gray-600">
                            <span className="block mb-1 font-semibold">Desde</span>
                            <input type="date" value={from} max={to || isoHoy()} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white" />
                        </label>
                        <label className="text-xs text-gray-600">
                            <span className="block mb-1 font-semibold">Hasta</span>
                            <input type="date" value={to} min={from} max={isoHoy()} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white" />
                        </label>
                        {data?.period?.custom && <span className="text-[11px] text-gray-400 pb-2">{data.period.label} · {numero(data.period.days)} día{data.period.days === 1 ? '' : 's'}</span>}
                    </div>
                )}

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-4">{error}</p>}
                {loading && !data && <p className="text-sm text-gray-400 py-10 text-center">Cargando estadísticas…</p>}

                {sinDatos && !loading && (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                        <p className="text-sm font-semibold text-gray-700">Sin datos registrados todavía</p>
                        <p className="text-xs text-gray-400 mt-1">Las descargas se registran desde que el botón público pasa por la plataforma. No se inventa historial anterior.</p>
                    </div>
                )}

                {data && totals && !sinDatos && (
                    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                            <Kpi label="Descargas registradas" value={numero(totals.all)} destacado nota="histórico, todas las versiones" />
                            <Kpi label="Hoy" value={numero(totals.today)} />
                            <Kpi label="Últimos 7 días" value={numero(totals.last7)} />
                            <Kpi label="Últimos 30 días" value={numero(totals.last30)} />
                            <Kpi label="Última descarga" value={haceCuanto(totals.lastDownloadAt, 'sin descargas')} pequeno nota={totals.lastDownloadAt ? fechaHora(totals.lastDownloadAt) : undefined} />
                            <Kpi label="Versión actual" value={data.state === 'current' ? numero(totals.currentVersion) : '—'} nota={data.state === 'current' ? 'descargas del PDF vigente' : 'no hay archivo vigente'} />
                        </div>
                        <p className="text-[11px] text-gray-400 mb-6">
                            Visitantes únicos estimados: <strong>{numero(totals.uniqueVisitors)}</strong> (hash sin IP; una misma persona desde dos dispositivos cuenta dos veces).
                            {totals.repeats > 0 && <> Se dejaron fuera <strong>{numero(totals.repeats)}</strong> solicitudes repetidas en menos de {REPEAT_WINDOW_SEC} s por el mismo visitante.</>}
                            {totals.bots > 0 && <> Y <strong>{numero(totals.bots)}</strong> accesos automáticos (vistas previas y rastreadores), que tampoco se cuentan.</>}
                            {!data.publicDownload && <> <span className="text-amber-700 font-semibold">La descarga pública está desactivada ahora mismo:</span> el histórico se conserva y seguirá sumando al reactivarla.</>}
                        </p>

                        <Seccion titulo={`Evolución por día · ${data.period.label}`} accion={<span className="text-[11px] text-gray-400">{numero(totals.periodDownloads)} en el período · {numero(totals.periodUniques)} visitantes</span>}>
                            <BarrasDescargas series={data.series} />
                        </Seccion>

                        <div className="grid md:grid-cols-2 gap-x-8">
                            <Seccion titulo="Desde dónde se pidió">
                                <Barras filas={(data.breakdown?.sources || []).map(s => ({ label: DOWNLOAD_SOURCES[s.key] || s.key, value: s.value }))} />
                                <p className="text-[10px] text-gray-400 mt-2">No hay visor en línea del PDF: toda solicitud es de descarga. «Vista ampliada» es el ícono de descarga dentro de las diapositivas ampliadas.</p>
                            </Seccion>
                            <Seccion titulo="Dispositivo">
                                <Barras filas={(data.breakdown?.devices || []).map(d => ({ label: DEVICE_LABELS[d.key] || d.key || 'Desconocido', value: d.value }))} />
                            </Seccion>
                            <Seccion titulo="De dónde vino la visita">
                                <Barras filas={(data.breakdown?.origins || []).map(o => ({ label: o.label || SOURCE_LABELS[o.key] || o.key, value: o.value }))} color="bg-amber-400/80" />
                            </Seccion>
                            <Seccion titulo="País">
                                <Barras filas={(data.breakdown?.countries || []).map(c => ({ label: c.key, value: c.value }))} color="bg-emerald-500/70" />
                            </Seccion>
                        </div>

                        <Seccion titulo="Versiones del archivo">
                            {data.versions.length === 0
                                ? <p className="text-xs text-gray-400 italic">Todavía no se registró ninguna versión.</p>
                                : (
                                    <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
                                        {data.versions.map(v => (
                                            <li key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 text-xs">
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-gray-800 truncate">
                                                        v{v.versionNumber} · {v.fileName || 'sin nombre'}
                                                        {v.current && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Vigente</span>}
                                                    </p>
                                                    <p className="text-gray-400">
                                                        {v.sizeBytes ? `${formatBytes(v.sizeBytes)} · ` : ''}
                                                        {v.uploadedAt ? `subida ${fechaHora(v.uploadedAt)}` : v.firstSeenAt ? `registrada ${fechaHora(v.firstSeenAt)}` : ''}
                                                    </p>
                                                </div>
                                                <p className="text-gray-700 tabular-nums whitespace-nowrap">
                                                    <strong>{numero(v.downloads)}</strong> descarga{v.downloads === 1 ? '' : 's'}
                                                    <span className="text-gray-400"> · última {haceCuanto(v.lastDownloadAt, 'ninguna')}</span>
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            <p className="text-[10px] text-gray-400 mt-2">Reemplazar el PDF crea una versión nueva; las anteriores y sus descargas se conservan. Quitar el archivo tampoco borra el histórico.</p>
                        </Seccion>

                        <Seccion titulo="Últimas solicitudes del período">
                            {data.recent.length === 0
                                ? <p className="text-xs text-gray-400 italic">Sin solicitudes en este período.</p>
                                : (
                                    <ul className="divide-y divide-gray-100 text-xs">
                                        {data.recent.map((r, i) => (
                                            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                                <span className="text-gray-700 tabular-nums">{fechaHora(r.createdAt)}</span>
                                                <span className="text-gray-500">
                                                    {DOWNLOAD_SOURCES[r.source] || r.source} · {DEVICE_LABELS[r.device] || r.device || 'Desconocido'}{r.browser ? ` · ${r.browser}` : ''}{r.country ? ` · ${r.country}${r.city ? ` (${r.city})` : ''}` : ''}
                                                    {r.isNewVisitor && <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-rotary-blue">nuevo</span>}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                        </Seccion>
                    </div>
                )}
            </div>
        </div>
    );
}
