import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Stethoscope, RefreshCw, AlertTriangle, CheckCircle2, HelpCircle, XCircle,
    Inbox, Send, FileText, Beaker, ChevronRight, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

type View = 'estado' | 'webhooks' | 'salidas' | 'plantillas' | 'prueba';

// Los cuatro estados de una comprobación. `unknown` NO es un tipo de «bien»:
// se pinta distinto a propósito, porque presentar «no se pudo comprobar» como
// verde manda a buscar el problema a otra parte.
const STATE_STYLE: Record<string, { cls: string; Icon: typeof CheckCircle2; label: string }> = {
    ok: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-900', Icon: CheckCircle2, label: 'Bien' },
    warn: { cls: 'bg-amber-50 border-amber-200 text-amber-900', Icon: AlertTriangle, label: 'Atención' },
    error: { cls: 'bg-red-50 border-red-200 text-red-900', Icon: XCircle, label: 'Falla' },
    unknown: { cls: 'bg-gray-50 border-gray-200 text-gray-700', Icon: HelpCircle, label: 'Sin comprobar' },
};

const VERDICT_TEXT: Record<string, string> = {
    ok: 'La conexión con Meta responde y el módulo está recibiendo lo que envía.',
    warn: 'Funciona, pero hay algo que conviene revisar.',
    error: 'Hay al menos una falla que impide que el módulo funcione como debe.',
    parcial: 'No se pudo comprobar todo. Lo que falta está marcado abajo.',
};

const fechaHora = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const Json = ({ value }: { value: unknown }) => (
    <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto max-h-80">
        {JSON.stringify(value, null, 2)}
    </pre>
);

export default function CrmDiagnostics() {
    const { token } = useAuth();

    // Todos los hooks arriba, antes de cualquier return: un hook debajo de un
    // return temprano cambia el número de hooks entre renders y tumba el panel.
    const [view, setView] = useState<View>('estado');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);
    const [webhooks, setWebhooks] = useState<any[]>([]);
    const [onlyProblems, setOnlyProblems] = useState(false);
    const [detail, setDetail] = useState<any>(null);
    const [outbound, setOutbound] = useState<any[]>([]);
    const [onlyFailures, setOnlyFailures] = useState(false);
    const [templates, setTemplates] = useState<any>(null);
    const [testPhone, setTestPhone] = useState('');
    const [testText, setTestText] = useState('Prueba de diagnóstico de la plataforma.');
    const [testResult, setTestResult] = useState<any>(null);
    const [testing, setTesting] = useState(false);

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    }), [token]);

    const get = useCallback(async (path: string) => {
        const res = await fetch(`${API}/crm${path}`, { headers });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'No se pudo consultar');
        return body;
    }, [headers]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await get('/diagnostics'));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [get]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (view !== 'webhooks') return;
        get(`/diagnostics/webhooks?limit=50${onlyProblems ? '&problems=true' : ''}`)
            .then(b => setWebhooks(b.rows || []))
            .catch(e => toast.error(e.message));
    }, [view, onlyProblems, get]);

    useEffect(() => {
        if (view !== 'salidas') return;
        get(`/diagnostics/outbound?limit=50${onlyFailures ? '&failures=true' : ''}`)
            .then(b => setOutbound(b.rows || []))
            .catch(e => toast.error(e.message));
    }, [view, onlyFailures, get]);

    useEffect(() => {
        if (view !== 'plantillas') return;
        get('/diagnostics/templates').then(setTemplates).catch(e => toast.error(e.message));
    }, [view, get]);

    const openDetail = async (id: string) => {
        try { setDetail((await get(`/diagnostics/webhooks/${id}`)).row); }
        catch (e: any) { toast.error(e.message); }
    };

    const runTest = async () => {
        if (!testPhone.trim()) return toast.error('Escribí el número de destino.');
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${API}/crm/diagnostics/test-send`, {
                method: 'POST', headers,
                body: JSON.stringify({ phone: testPhone.trim(), text: testText }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'La prueba falló');
            setTestResult(body);
            toast[body.ok ? 'success' : 'error'](body.ok ? 'Meta aceptó la llamada.' : 'Meta rechazó la llamada.');
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setTesting(false);
        }
    };

    const TABS: { id: View; label: string; Icon: typeof Inbox }[] = [
        { id: 'estado', label: 'Estado', Icon: Stethoscope },
        { id: 'webhooks', label: 'Webhooks recibidos', Icon: Inbox },
        { id: 'salidas', label: 'Llamadas a Meta', Icon: Send },
        { id: 'plantillas', label: 'Plantillas', Icon: FileText },
        { id: 'prueba', label: 'Prueba controlada', Icon: Beaker },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Stethoscope className="w-5 h-5 text-rotary-blue" />
                        Diagnóstico técnico
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Qué dice Meta de la conexión y qué está pasando de verdad con lo que entra y sale.
                    </p>
                </div>
                <button onClick={load} disabled={loading}
                    className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Volver a comprobar
                </button>
            </div>

            <div className="flex gap-1 border-b overflow-x-auto">
                {TABS.map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setView(id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                            view === id ? 'border-rotary-blue text-rotary-blue font-semibold' : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}>
                        <Icon className="w-4 h-4" />{label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-4 text-sm">{error}</div>
            )}

            {view === 'estado' && (
                loading ? <p className="text-sm text-gray-500 py-8 text-center">Comprobando contra Meta…</p> :
                !data ? null : (
                    <div className="space-y-4">
                        <div className={`rounded-xl border p-4 ${STATE_STYLE[data.verdict === 'parcial' ? 'unknown' : data.verdict]?.cls || ''}`}>
                            <p className="font-semibold text-sm">{VERDICT_TEXT[data.verdict] || ''}</p>
                            <p className="text-xs mt-1 opacity-80">
                                {data.counts.error} fallas · {data.counts.warn} avisos · {data.counts.unknown} sin comprobar ·
                                {' '}{data.counts.ok} bien. Comprobado el {fechaHora(data.checkedAt)}.
                            </p>
                        </div>

                        <div className="bg-white border rounded-xl p-4 text-xs space-y-1">
                            <p className="font-semibold text-gray-800 text-sm mb-2">Configuración en uso</p>
                            <p><span className="text-gray-500">Número (phoneNumberId):</span> <code>{data.config?.phoneNumberId || '—'}</code></p>
                            <p><span className="text-gray-500">Cuenta (WABA):</span> <code>{data.config?.wabaId || '—'}</code></p>
                            <p><span className="text-gray-500">Última verificación:</span> {fechaHora(data.config?.lastVerifiedAt)}</p>
                            <p className="flex items-center gap-2 flex-wrap">
                                <span className="text-gray-500">URL del webhook (la que Meta tiene que tener configurada):</span>
                                <code className="bg-gray-100 px-1.5 py-0.5 rounded">{data.webhookUrl}</code>
                                <button onClick={() => { navigator.clipboard?.writeText(data.webhookUrl); toast.success('Copiada'); }}
                                    className="text-rotary-blue hover:underline inline-flex items-center gap-1">
                                    <Copy className="w-3 h-3" />copiar
                                </button>
                            </p>
                        </div>

                        <div className="space-y-2">
                            {data.checks.map((c: any) => {
                                const st = STATE_STYLE[c.state] || STATE_STYLE.unknown;
                                return (
                                    <div key={c.id} className={`rounded-xl border p-3 ${st.cls}`}>
                                        <div className="flex items-start gap-2">
                                            <st.Icon className="w-4 h-4 mt-0.5 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-sm">{c.label}</p>
                                                <p className="text-xs mt-0.5 opacity-90">{c.detail}</p>
                                                {c.evidence && (
                                                    <details className="mt-2">
                                                        <summary className="text-[11px] cursor-pointer opacity-70 hover:opacity-100">
                                                            Ver lo que respondió
                                                        </summary>
                                                        <div className="mt-2"><Json value={c.evidence} /></div>
                                                    </details>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
            )}

            {view === 'webhooks' && (
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
                        Sólo los que tuvieron problemas
                    </label>
                    {!webhooks.length ? (
                        <p className="text-sm text-gray-500 py-8 text-center">
                            Todavía no hay webhooks registrados. El registro empieza con el primero que llegue.
                        </p>
                    ) : (
                        <div className="bg-white border rounded-xl overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="text-left px-3 py-2">Cuándo</th>
                                        <th className="text-left px-3 py-2">Qué trajo</th>
                                        <th className="text-left px-3 py-2">Resultado</th>
                                        <th className="text-left px-3 py-2">Cómo se encaminó</th>
                                        <th className="text-left px-3 py-2">Firma</th>
                                        <th className="text-right px-3 py-2">ms</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {webhooks.map(w => (
                                        <tr key={w.id} className="border-t hover:bg-gray-50">
                                            <td className="px-3 py-2 whitespace-nowrap">{fechaHora(w.receivedAt)}</td>
                                            <td className="px-3 py-2">{w.kind} ({w.eventCount})</td>
                                            <td className="px-3 py-2">
                                                <span className={`px-1.5 py-0.5 rounded ${
                                                    w.outcome === 'ok' ? 'bg-emerald-100 text-emerald-800'
                                                    : w.outcome === 'error' ? 'bg-red-100 text-red-800'
                                                    : 'bg-amber-100 text-amber-800'}`}>{w.outcome}</span>
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">{w.resolution || '—'}</td>
                                            <td className="px-3 py-2">
                                                {w.signatureValid === true ? 'válida'
                                                    : w.signatureValid === false ? <span className="text-red-700 font-semibold">inválida</span>
                                                    : <span className="text-gray-400">sin comprobar</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right">{w.durationMs ?? '—'}</td>
                                            <td className="px-3 py-2 text-right">
                                                <button onClick={() => openDetail(w.id)} className="text-rotary-blue hover:underline inline-flex items-center">
                                                    ver <ChevronRight className="w-3 h-3" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {detail && (
                        <div className="bg-white border rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="font-semibold text-sm">Payload completo — {fechaHora(detail.receivedAt)}</p>
                                <button onClick={() => setDetail(null)} className="text-xs text-gray-500 hover:text-gray-800">cerrar</button>
                            </div>
                            {detail.errorMessage && (
                                <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-2 text-xs">
                                    <p className="font-semibold">{detail.errorMessage}</p>
                                    {detail.errorStack && <pre className="mt-1 overflow-x-auto opacity-80">{detail.errorStack}</pre>}
                                </div>
                            )}
                            <Json value={detail.payload} />
                            <details>
                                <summary className="text-xs cursor-pointer text-gray-500">Cabeceras</summary>
                                <div className="mt-2"><Json value={detail.headers} /></div>
                            </details>
                        </div>
                    )}
                </div>
            )}

            {view === 'salidas' && (
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={onlyFailures} onChange={e => setOnlyFailures(e.target.checked)} />
                        Sólo las que fallaron
                    </label>
                    {!outbound.length ? (
                        <p className="text-sm text-gray-500 py-8 text-center">No hay llamadas registradas todavía.</p>
                    ) : (
                        <div className="space-y-2">
                            {outbound.map(o => (
                                <details key={o.id} className={`border rounded-xl p-3 ${o.ok ? 'bg-white' : 'bg-red-50 border-red-200'}`}>
                                    <summary className="cursor-pointer text-xs flex items-center justify-between gap-2 flex-wrap">
                                        <span className="font-semibold">{o.operation}</span>
                                        <span className="text-gray-500">{o.phone || o.templateName || ''}</span>
                                        <span className={o.ok ? 'text-emerald-700' : 'text-red-700 font-semibold'}>
                                            HTTP {o.httpStatus ?? '—'}{o.errorCode ? ` · código ${o.errorCode}` : ''}
                                        </span>
                                        <span className="text-gray-400">{fechaHora(o.createdAt)} · {o.durationMs ?? '—'} ms</span>
                                    </summary>
                                    {o.errorMessage && <p className="text-xs text-red-800 mt-2 font-medium">{o.errorMessage}</p>}
                                    <div className="grid md:grid-cols-2 gap-2 mt-2">
                                        <div>
                                            <p className="text-[11px] text-gray-500 mb-1">Lo que mandamos</p>
                                            <Json value={o.requestBody} />
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-gray-500 mb-1">Lo que contestó Meta</p>
                                            <Json value={o.responseBody} />
                                        </div>
                                    </div>
                                </details>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {view === 'plantillas' && (
                !templates ? <p className="text-sm text-gray-500 py-8 text-center">Consultando a Meta…</p> :
                !templates.ok ? <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">{templates.reason}</div> : (
                    <div className="space-y-3">
                        {templates.missingInMeta.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm">
                                <p className="font-semibold text-red-900">
                                    {templates.missingInMeta.length} plantilla(s) existen acá pero NO en Meta
                                </p>
                                <p className="text-xs text-red-800 mt-1">
                                    Un envío que las use va a fallar con «template name does not exist», contacto por contacto.
                                </p>
                                <ul className="text-xs mt-2 list-disc pl-5 text-red-900">
                                    {templates.missingInMeta.map((t: any) => <li key={t.name}>{t.name} ({t.language})</li>)}
                                </ul>
                            </div>
                        )}
                        {templates.outOfSync.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                                <p className="font-semibold text-amber-900">{templates.outOfSync.length} con el estado desactualizado</p>
                                <ul className="text-xs mt-2 list-disc pl-5 text-amber-900">
                                    {templates.outOfSync.map((t: any) => (
                                        <li key={t.name}>{t.name}: acá dice «{t.localStatus}», en Meta «{t.metaStatus}»</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {!templates.missingInMeta.length && !templates.outOfSync.length && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-900">
                                Las {templates.total} plantillas locales coinciden con las de Meta.
                            </div>
                        )}
                        {templates.onlyInMeta.length > 0 && (
                            <div className="bg-white border rounded-xl p-3 text-sm">
                                <p className="font-semibold text-gray-800">{templates.onlyInMeta.length} están en Meta y no acá</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    No es un problema: se pueden importar con «Sincronizar desde Meta».
                                </p>
                            </div>
                        )}
                    </div>
                )
            )}

            {view === 'prueba' && (
                <div className="space-y-3 max-w-2xl">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                        Esto <strong>manda un mensaje real</strong>. Un mensaje libre sólo se entrega si esa persona
                        te escribió en las últimas 24 horas; fuera de esa ventana Meta acepta la llamada y no entrega nada.
                    </div>
                    <div className="bg-white border rounded-xl p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Número de destino</label>
                            <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                                placeholder="+57 300 000 0000"
                                className="w-full border rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Texto</label>
                            <textarea value={testText} onChange={e => setTestText(e.target.value)} rows={2}
                                className="w-full border rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <button onClick={runTest} disabled={testing}
                            className="inline-flex items-center gap-2 bg-rotary-blue text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
                            <Beaker className="w-4 h-4" />
                            {testing ? 'Enviando…' : 'Enviar la prueba'}
                        </button>
                    </div>
                    {testResult && (
                        <div className={`border rounded-xl p-4 space-y-2 ${testResult.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <p className="text-sm font-semibold">
                                HTTP {testResult.httpStatus} · {testResult.durationMs} ms
                                {testResult.messageId && <> · id <code className="text-xs">{testResult.messageId}</code></>}
                            </p>
                            <p className="text-xs opacity-90">{testResult.nota}</p>
                            <Json value={testResult.response} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
