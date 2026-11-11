// Tareas y ejecuciones — reemplaza los botones muertos «Cola de tareas» y
// «Registros de actividad» con la cola real y el detalle paso a paso.
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { EmptyNote, ErrorNote, SectionHeader, fmtDate } from './agentCenterUi';

interface TaskRow { id: string; title: string; status: string; agentName: string | null; siteName: string | null; attempts: number; lastError: string | null; createdAt: string; finishedAt: string | null }
interface Step { id: string; seq: number; kind: string; tool: string | null; args: any; result: any; ok: boolean; latencyMs: number | null }
interface Run { id: string; status: string; model: string | null; inputTokens: number; outputTokens: number; costUsd: number; error: string | null; startedAt: string; steps: Step[] }
interface TaskFull extends TaskRow { input: any; output: any; runs: Run[]; approvals: { id: string; tool: string; status: string; summary: string }[] }

const STATUS_STYLE: Record<string, string> = {
    queued: 'bg-gray-100 text-gray-600', running: 'bg-violet-50 text-violet-700', waiting_approval: 'bg-amber-50 text-amber-700',
    succeeded: 'bg-emerald-50 text-emerald-700', failed: 'bg-amber-50 text-amber-700', dead: 'bg-red-50 text-red-700', cancelled: 'bg-gray-100 text-gray-500',
};
const show = (v: any) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function TaskDetail({ id, meta, onClose, onChanged }: { id: string; meta: Meta; onClose: () => void; onChanged: () => void }) {
    const [t, setT] = useState<TaskFull | null>(null);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(() => { acApi<TaskFull>(`/tasks/${id}`).then(setT).catch(e => setError(e.message)); }, [id]);
    useEffect(load, [load]);
    const act = async (what: 'cancel' | 'retry') => { try { setT(await acApi<TaskFull>(`/tasks/${id}/${what}`, { method: 'POST' })); onChanged(); } catch (e: any) { setError(e.message); } };
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Detalle de la tarea">
            <div className="w-full max-w-3xl h-full bg-gray-50 overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
                    <div className="min-w-0 flex-1"><p className="font-black text-gray-800 truncate">{t?.title || 'Tarea'}</p><p className="text-xs text-gray-500">{t?.agentName} · {t?.siteName || 'Administración central'}</p></div>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <ErrorNote message={error} />
                    {t && (
                        <>
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${STATUS_STYLE[t.status] || ''}`}>{meta.taskStates[t.status] || t.status}</span>
                                <span className="text-xs text-gray-500">Intentos: {t.attempts}</span>
                                {['queued', 'failed', 'waiting_approval'].includes(t.status) && <button type="button" onClick={() => act('cancel')} className="text-xs font-bold text-red-600">Cancelar</button>}
                                {['dead', 'failed'].includes(t.status) && <button type="button" onClick={() => act('retry')} className="text-xs font-bold text-rotary-blue">Reintentar</button>}
                            </div>
                            {t.lastError && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2">{t.lastError}</div>}
                            <div className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-xs font-bold text-gray-500 mb-1">Pedido</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{t.input?.goal}</p></div>
                            {t.output?.text && <div className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-xs font-bold text-gray-500 mb-1">Respuesta</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{t.output.text}</p></div>}
                            {t.approvals.length > 0 && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">{t.approvals.map(a => <p key={a.id}>Propuso: {a.summary} — <b>{a.status}</b></p>)}</div>}
                            {t.runs.map(r => (
                                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                                    <p className="text-sm font-bold text-gray-800">Ejecución · {fmtDate(r.startedAt)} · {r.status}</p>
                                    <p className="text-xs text-gray-500 tabular-nums">{r.model || 'modelo —'} · {r.inputTokens}/{r.outputTokens} tokens · US$ {Number(r.costUsd || 0).toFixed(4)}{r.error ? ` · ${r.error}` : ''}</p>
                                    <ol className="space-y-1.5">
                                        {r.steps.map(s => (
                                            <li key={s.id} className={`border rounded-xl px-3 py-2 text-xs ${s.ok ? 'border-gray-100' : 'border-red-200 bg-red-50/40'}`}>
                                                <p className="font-bold text-gray-700">{s.seq}. {s.kind === 'model' ? 'Modelo' : `Herramienta · ${s.tool}`}{s.latencyMs ? <span className="font-normal text-gray-400"> · {(s.latencyMs / 1000).toFixed(1)} s</span> : null}</p>
                                                {s.args && <pre className="mt-1 whitespace-pre-wrap break-words text-gray-500 max-h-32 overflow-y-auto">{show(s.args)}</pre>}
                                                <pre className="mt-1 whitespace-pre-wrap break-words text-gray-700 max-h-48 overflow-y-auto">{show(s.result)}</pre>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function TasksTab({ meta }: { meta: Meta }) {
    const [rows, setRows] = useState<TaskRow[] | null>(null);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [ticking, setTicking] = useState(false);
    const load = useCallback(() => { acApi<{ tasks: TaskRow[] }>(`/tasks${status ? `?status=${status}` : ''}`).then(d => setRows(d.tasks)).catch(e => setError(e.message)); }, [status]);
    useEffect(load, [load]);
    const tick = async () => { setTicking(true); try { await acApi('/tick', { method: 'POST' }); load(); } catch (e: any) { setError(e.message); } finally { setTicking(false); } };
    return (
        <div className="space-y-4">
            <SectionHeader title="Tareas" subtitle="La cola real de los agentes. El proceso automático la avanza cada minuto, por pasos, con reintentos (1, 4 y 16 minutos) y un tope de pasos por ejecución."
                actions={<>
                    <select id="tasks-status" value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"><option value="">Todos los estados</option>{Object.entries(meta.taskStates).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <button type="button" disabled={ticking} onClick={tick} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold disabled:opacity-40">{ticking ? 'Procesando…' : 'Procesar ahora'}</button>
                </>} />
            <ErrorNote message={error} />
            {rows === null ? <div className="text-sm text-gray-400">Cargando…</div> : rows.length === 0 ? <EmptyNote>No hay tareas. Prueba un agente desde «Instalaciones» o ejecuta un workflow.</EmptyNote> : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-4 py-2.5">Tarea</th><th className="px-4 py-2.5">Agente</th><th className="px-4 py-2.5">Ámbito</th><th className="px-4 py-2.5">Estado</th><th className="px-4 py-2.5">Creada</th></tr></thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(r.id)}>
                                    <td className="px-4 py-2 text-gray-800 max-w-xs truncate">{r.title}</td>
                                    <td className="px-4 py-2 text-gray-600">{r.agentName}</td>
                                    <td className="px-4 py-2 text-gray-500">{r.siteName || 'Central'}</td>
                                    <td className="px-4 py-2"><span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${STATUS_STYLE[r.status] || ''}`}>{meta.taskStates[r.status] || r.status}</span></td>
                                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap tabular-nums">{fmtDate(r.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {open && <TaskDetail id={open} meta={meta} onClose={() => setOpen(null)} onChanged={load} />}
        </div>
    );
}
