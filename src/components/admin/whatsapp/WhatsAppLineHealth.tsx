import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Activity, CheckCircle2, AlertTriangle, Info, RefreshCw, Smartphone, Copy, ExternalLink,
    Clock, XCircle, Inbox, PlayCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { leerJson } from '../../../lib/leerJson';

// ════════════════════════════════════════════════════════════════════
// El FUNCIONAMIENTO REAL de una línea de WhatsApp (v4.1285).
//
// El diagnóstico de credenciales podía estar entero en verde mientras nadie
// recibía respuesta (la Feria de Proyectos, 2026-11-05). Esta vista no mira la
// configuración: mira lo que PASÓ con cada mensaje real —si llegó, qué agente
// lo atendió, qué contestó Meta— y deja hacer una prueba de punta a punta
// desde un WhatsApp de verdad.
// ════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';

type Props = { connectionId: string; lineLabel: string; onResume?: () => void };

const STATE_STYLE: Record<string, string> = {
    operativo: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    conectado: 'bg-sky-50 border-sky-200 text-sky-900',
    configurado: 'bg-gray-50 border-gray-200 text-gray-700',
    sin_datos: 'bg-gray-50 border-gray-200 text-gray-600',
    degradado: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-900',
};
const BADGE_STYLE: Record<string, string> = {
    operativo: 'bg-emerald-600 text-white',
    conectado: 'bg-sky-600 text-white',
    configurado: 'bg-gray-500 text-white',
    sin_datos: 'bg-gray-400 text-white',
    degradado: 'bg-amber-500 text-white',
    error: 'bg-red-600 text-white',
};
const TONE: Record<string, string> = { ok: 'text-emerald-700', bad: 'text-red-700', neutral: 'text-gray-700' };

const OUTCOME_LABEL: Record<string, { label: string; cls: string }> = {
    replied: { label: 'Respondido', cls: 'bg-emerald-100 text-emerald-800' },
    skipped: { label: 'Sin respuesta (regla)', cls: 'bg-gray-100 text-gray-700' },
    failed: { label: 'Falló', cls: 'bg-red-100 text-red-800' },
    pending: { label: 'En proceso', cls: 'bg-sky-100 text-sky-800' },
    sin_traza: { label: 'Sin respuesta (sin traza)', cls: 'bg-amber-100 text-amber-800' },
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');

/** Una etapa de la prueba real: alcanzada, en curso o pendiente. */
function StageRow({ label, reached, at, failedHere }: { label: string; reached: boolean; at?: string; failedHere?: boolean }) {
    return (
        <li className="flex items-center gap-2 text-sm">
            {failedHere ? <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                : reached ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    : <Clock className="w-4 h-4 text-gray-300 shrink-0" />}
            <span className={reached ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
            {at && <span className="ml-auto text-[11px] text-gray-400">{new Date(at).toLocaleTimeString()}</span>}
        </li>
    );
}

export default function WhatsAppLineHealth({ connectionId, lineLabel, onResume }: Props) {
    const { token } = useAuth();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const [health, setHealth] = useState<any>(null);
    const [loadingHealth, setLoadingHealth] = useState(false);
    const [traces, setTraces] = useState<any>(null);
    const [report, setReport] = useState<any>(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [probe, setProbe] = useState<any>(null);
    const [probeResult, setProbeResult] = useState<any>(null);
    const [startingProbe, setStartingProbe] = useState(false);
    const [probeExpired, setProbeExpired] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollUntil = useRef<number>(0);

    const get = useCallback(async (path: string) => {
        const res = await fetch(`${API}/crm/connections/${connectionId}${path}`, { headers });
        const { data } = await leerJson<any>(res);
        if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
        return data;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionId, token]);

    const loadHealth = useCallback(async (live = false) => {
        setLoadingHealth(true);
        try {
            setHealth(await get(`/health${live ? '?live=1' : ''}`));
        } catch (e: any) { toast.error(e.message); }
        finally { setLoadingHealth(false); }
    }, [get]);

    const loadTraces = useCallback(async () => {
        try { setTraces(await get('/traces?limit=25')); } catch { /* el panel sigue */ }
    }, [get]);

    const loadReport = useCallback(async () => {
        setLoadingReport(true);
        try { setReport(await get('/unanswered?dias=30')); } catch (e: any) { toast.error(e.message); }
        finally { setLoadingReport(false); }
    }, [get]);

    const stopPolling = () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
    };

    useEffect(() => {
        setHealth(null); setTraces(null); setReport(null); setProbe(null); setProbeResult(null); setProbeExpired(false);
        stopPolling();
        loadHealth(false);
        loadTraces();
        return stopPolling;
    }, [connectionId, loadHealth, loadTraces]);

    const startProbe = async () => {
        setStartingProbe(true);
        stopPolling();
        setProbeResult(null);
        setProbeExpired(false);
        try {
            const res = await fetch(`${API}/crm/connections/${connectionId}/probe`, { method: 'POST', headers, body: '{}' });
            const { data } = await leerJson<any>(res);
            if (!res.ok) throw new Error(data?.error || 'Error');
            setProbe(data);
            // Se sigue la prueba 5 minutos, cada 3 segundos.
            pollUntil.current = Date.now() + 5 * 60 * 1000;
            pollRef.current = setInterval(async () => {
                if (Date.now() > pollUntil.current) { stopPolling(); setProbeExpired(true); return; }
                try {
                    const r = await get(`/probe/${data.code}`);
                    setProbeResult(r);
                    const t = r?.trace;
                    const done = t && (t.outcome !== 'pending') && (t.stage === 'delivered' || t.stage === 'read' || t.outcome !== 'replied');
                    if (done || r?.otherLine) { stopPolling(); loadHealth(false); loadTraces(); }
                } catch { /* reintenta en la siguiente vuelta */ }
            }, 3000);
        } catch (e: any) { toast.error(e.message); }
        finally { setStartingProbe(false); }
    };

    const review = async (traceId: string) => {
        const note = prompt('Nota de seguimiento (opcional): por ejemplo «Se le escribió desde el Chat».') ?? null;
        try {
            const res = await fetch(`${API}/crm/connections/${connectionId}/unanswered/${traceId}/review`, {
                method: 'POST', headers, body: JSON.stringify({ note }),
            });
            const { data } = await leerJson<any>(res);
            if (!res.ok) throw new Error(data?.error || 'Error');
            toast.success('Marcado como revisado.');
            loadReport();
        } catch (e: any) { toast.error(e.message); }
    };

    const copy = (txt: string) => {
        navigator.clipboard?.writeText(txt).then(() => toast.success('Copiado')).catch(() => {});
    };

    const t = probeResult?.trace;
    const stages: any[] = probeResult?.stages || traces?.stages || [];
    const reachedOrd = t ? (stages.find((s) => s.key === t.stage)?.ord || 0) : 0;
    const failedOrd = t && t.outcome !== 'replied' && t.outcome !== 'pending' ? reachedOrd + 1 : 0;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                            Funcionamiento real de la línea
                            {health && <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE_STYLE[health.overall] || BADGE_STYLE.configurado}`}>{health.label}</span>}
                        </h2>
                        <p className="text-sm text-gray-500">
                            Lo que pasó con los mensajes reales de {lineLabel}. «Operativo» sólo aparece si hay mensajes recibidos y respuestas enviadas que lo demuestren.
                        </p>
                    </div>
                </div>
                <button onClick={() => loadHealth(true)} disabled={loadingHealth}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${loadingHealth ? 'animate-spin' : ''}`} /> Comprobar con Meta
                </button>
            </div>

            {/* ── Los cinco bloques ─────────────────────────────────── */}
            {health?.blocks && (
                <div className="px-5 pb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {health.blocks.map((b: any) => (
                        <div key={b.key} className={`rounded-xl border p-3 ${STATE_STYLE[b.state] || STATE_STYLE.configurado}`}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-xs font-bold uppercase tracking-wide">{b.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${BADGE_STYLE[b.state] || BADGE_STYLE.configurado}`}>{b.label}</span>
                            </div>
                            <dl className="space-y-1">
                                {b.items.map((it: any, i: number) => (
                                    <div key={i} className="text-xs">
                                        <dt className="text-gray-500">{it.label}</dt>
                                        <dd className={`font-medium break-words ${TONE[it.tone] || TONE.neutral}`}>{it.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    ))}
                </div>
            )}
            {health && !health.live && (
                <p className="px-5 -mt-3 pb-4 text-[11px] text-gray-400">
                    La conexión con Meta no se consultó en vivo. Pulsa «Comprobar con Meta» para verificar credenciales, número y webhook.
                </p>
            )}

            {/* ── Prueba real ───────────────────────────────────────── */}
            <div className="border-t border-gray-100 p-5 grid gap-5 lg:grid-cols-2">
                <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Smartphone className="w-4 h-4 text-indigo-500" /> Prueba real por WhatsApp</h3>
                    <p className="text-xs text-gray-500 mt-1">
                        A diferencia del simulador, recorre el camino completo: Meta → webhook → línea → agente → Meta. El agente responde como a cualquier persona.
                    </p>
                    {!probe ? (
                        <button onClick={startProbe} disabled={startingProbe}
                            className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                            <PlayCircle className="w-4 h-4" /> {startingProbe ? 'Preparando…' : 'Iniciar prueba real'}
                        </button>
                    ) : (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-2">
                            <p>{probe.instructions}</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <code className="bg-white border border-emerald-200 rounded px-2 py-1 font-bold">Hola {probe.code}</code>
                                <button onClick={() => copy(`Hola ${probe.code}`)} className="text-xs flex items-center gap-1 text-emerald-800 hover:underline"><Copy className="w-3.5 h-3.5" /> Copiar</button>
                                {probe.waLink && (
                                    <a href={probe.waLink} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1 text-emerald-800 hover:underline">
                                        <ExternalLink className="w-3.5 h-3.5" /> Abrir en WhatsApp
                                    </a>
                                )}
                            </div>
                            <button onClick={startProbe} className="text-xs text-emerald-800 hover:underline">Generar otro código</button>
                        </div>
                    )}
                </div>
                <div>
                    {probe && (
                        <>
                            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Recorrido de la prueba</p>
                            {!t && !probeResult?.otherLine && !probeExpired && (
                                <p className="text-sm text-gray-500 flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 animate-spin" /> Esperando que Meta entregue el mensaje…
                                </p>
                            )}
                            {probeResult?.otherLine && <p className="text-sm text-red-700">{probeResult.otherLine}</p>}
                            {t && (
                                <>
                                    <ul className="space-y-1">
                                        {stages.map((s: any) => (
                                            <StageRow key={s.key} label={s.label} reached={s.ord <= reachedOrd}
                                                at={t.stamps?.[s.key]} failedHere={failedOrd === s.ord} />
                                        ))}
                                    </ul>
                                    <div className={`mt-3 rounded-lg border p-2 text-xs ${t.outcome === 'replied' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : t.outcome === 'pending' ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                                        <b>{OUTCOME_LABEL[t.outcome]?.label || t.outcome}</b>
                                        {t.agentName && <> · agente «{t.agentName}» ({t.agentSource === 'connection' ? 'propio' : 'heredado'})</>}
                                        {t.totalMs ? <> · {(t.totalMs / 1000).toFixed(1)} s</> : null}
                                        {t.reason && <p className="mt-1"><b>{t.reason.title}.</b> {t.reasonDetail}</p>}
                                        {t.reason?.fix && <p className="mt-1"><b>Qué hacer:</b> {t.reason.fix}</p>}
                                        {t.metaErrorCode && <p className="mt-1">Meta: {t.metaErrorMessage} (código {t.metaErrorCode})</p>}
                                        {t.outcome === 'replied' && !['delivered', 'read'].includes(t.stage) && (
                                            <p className="mt-1">Meta aceptó la respuesta; falta su confirmación de entrega. Revisa tu WhatsApp.</p>
                                        )}
                                    </div>
                                    {t.reason?.code === 'pausa_humana' && onResume && (
                                        <button onClick={onResume} className="mt-2 text-xs text-indigo-700 hover:underline">Reanudar el bot y volver a probar</button>
                                    )}
                                </>
                            )}
                            {!t && probe && probeExpired && (
                                <p className="mt-2 text-sm text-red-700">
                                    Pasaron 5 minutos y el mensaje no llegó a la plataforma. Si lo enviaste al número correcto, Meta no está entregando los mensajes de esta línea a Club Platform: revisa «Webhook dirigido a esta plataforma» en el diagnóstico.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Recorrido de los últimos mensajes ───────────────────── */}
            <div className="border-t border-gray-100 p-5">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-900">Últimos mensajes recibidos y qué pasó con cada uno</h3>
                    <button onClick={loadTraces} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Actualizar</button>
                </div>
                {!traces?.items?.length ? (
                    <p className="text-xs text-gray-400">Todavía no hay mensajes con traza en esta línea. La traza existe desde la versión 4.1285: lo anterior aparece en «Conversaciones sin respuesta» desde el registro de mensajes.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-100">
                                    <th className="py-1.5 pr-3">Recibido</th>
                                    <th className="py-1.5 pr-3">Contacto</th>
                                    <th className="py-1.5 pr-3">Mensaje</th>
                                    <th className="py-1.5 pr-3">Llegó hasta</th>
                                    <th className="py-1.5 pr-3">Resultado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {traces.items.map((it: any) => (
                                    <tr key={it.id} className="border-b border-gray-50 align-top">
                                        <td className="py-1.5 pr-3 whitespace-nowrap text-gray-600">{fmt(it.receivedAt)}</td>
                                        <td className="py-1.5 pr-3 whitespace-nowrap">{it.contactName || it.phone}{it.probeCode && <span className="ml-1 text-indigo-600">(prueba)</span>}</td>
                                        <td className="py-1.5 pr-3 max-w-[220px] truncate" title={it.preview}>{it.preview}</td>
                                        <td className="py-1.5 pr-3 whitespace-nowrap">{(traces.stages || []).find((s: any) => s.key === it.stage)?.label || it.stage}</td>
                                        <td className="py-1.5 pr-3">
                                            <span className={`px-1.5 py-0.5 rounded ${OUTCOME_LABEL[it.outcome]?.cls || ''}`}>{OUTCOME_LABEL[it.outcome]?.label || it.outcome}</span>
                                            {it.reason && <span className="block text-gray-500 mt-0.5">{it.reason.title}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Conversaciones sin respuesta ────────────────────────── */}
            <div className="border-t border-gray-100 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Inbox className="w-4 h-4 text-amber-500" /> Conversaciones sin respuesta (30 días)</h3>
                    <button onClick={loadReport} disabled={loadingReport}
                        className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-50">
                        {loadingReport ? 'Buscando…' : report ? 'Actualizar' : 'Buscar'}
                    </button>
                </div>
                {report && (
                    <>
                        <p className="text-[11px] text-gray-500 mb-2 flex items-start gap-1"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {report.note} No se envía nada desde aquí: responder se hace desde el Chat, a mano y dentro de las reglas de Meta (fuera de 24 h, sólo con plantilla).</p>
                        <div className="flex flex-wrap gap-2 text-xs mb-3">
                            <span className="px-2 py-1 rounded bg-red-50 text-red-800">Por avería: <b>{report.byCause.averia}</b></span>
                            <span className="px-2 py-1 rounded bg-amber-50 text-amber-800">Sin traza (anteriores): <b>{report.byCause.sinTraza}</b></span>
                            <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">Por regla (pausa, baja, multimedia): <b>{report.byCause.regla}</b></span>
                            <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-800">Pendientes de revisión: <b>{report.byCause.pendientesDeRevision}</b></span>
                        </div>
                        {!report.items.length ? (
                            <p className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> No hay mensajes registrados sin respuesta en esta línea.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {report.items.map((it: any) => (
                                    <li key={it.id} className="py-2 text-xs flex flex-wrap items-start gap-x-3 gap-y-1">
                                        <span className="text-gray-500 whitespace-nowrap">{fmt(it.at)}</span>
                                        <span className="font-medium">{it.contactName || it.phone}</span>
                                        <span className={`px-1.5 py-0.5 rounded ${OUTCOME_LABEL[it.outcome]?.cls || ''}`}>{OUTCOME_LABEL[it.outcome]?.label || it.outcome}</span>
                                        <span className="basis-full text-gray-700">«{it.preview}»</span>
                                        <span className="basis-full text-gray-500">
                                            {it.reason ? <><b>{it.reason.title}.</b> {it.reasonDetail}</> : it.reasonDetail}
                                            {it.metaError && <> · Meta: {it.metaError}</>}
                                        </span>
                                        {it.source === 'traza' && !it.reason?.human && (
                                            it.reviewedAt
                                                ? <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Revisado {fmt(it.reviewedAt)}{it.reviewNote ? ` — ${it.reviewNote}` : ''}</span>
                                                : <button onClick={() => review(it.id)} className="text-indigo-700 hover:underline flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Marcar como revisado</button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
