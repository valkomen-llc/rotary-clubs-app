// Aprobaciones — lo que un agente propone y sólo una persona decide (N2/N3).
import { useCallback, useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { EmptyNote, ErrorNote, SectionHeader, fmtDate } from './agentCenterUi';

interface Approval { id: string; tool: string; args: Record<string, unknown>; risk: string; summary: string | null; status: string; siteName: string | null; createdAt: string; expiresAt: string; decisionNote: string | null; result: any }

function ApprovalCard({ a, meta, onDecide }: { a: Approval; meta: Meta; onDecide: (id: string, decision: 'approve' | 'reject', note: string) => Promise<void> }) {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const decide = async (d: 'approve' | 'reject') => { setBusy(true); try { await onDecide(a.id, d, note); } finally { setBusy(false); } };
    const tool = meta.tools.find(t => t.key === a.tool);
    return (
        <div className="bg-white rounded-2xl border border-amber-200 p-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
                <p className="font-bold text-gray-800">{a.summary || tool?.description}</p>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{a.risk} · {meta.risk[a.risk]?.label}</span>
            </div>
            <p className="text-xs text-gray-500">{a.siteName || 'Administración central'} · propuesta {fmtDate(a.createdAt)} · vence {fmtDate(a.expiresAt)}</p>
            <pre className="text-xs bg-gray-50 rounded-xl p-2 whitespace-pre-wrap break-words">{a.tool}({JSON.stringify(a.args)})</pre>
            {a.status === 'pending' ? (
                <div className="flex flex-wrap gap-2 items-center">
                    <input aria-label="Nota de la decisión" className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Nota (opcional)" value={note} onChange={e => setNote(e.target.value)} />
                    <button type="button" disabled={busy} onClick={() => decide('reject')} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600">Rechazar</button>
                    <button type="button" disabled={busy} onClick={() => decide('approve')} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Aprobar y ejecutar</button>
                </div>
            ) : <p className="text-sm text-gray-600">Estado: <b>{a.status}</b>{a.decisionNote ? ` — ${a.decisionNote}` : ''}{a.result?.error ? ` — ${a.result.error}` : ''}</p>}
        </div>
    );
}

export default function ApprovalsTab({ meta }: { meta: Meta }) {
    const [rows, setRows] = useState<Approval[] | null>(null);
    const [status, setStatus] = useState('pending');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const load = useCallback(() => { acApi<{ approvals: Approval[] }>(`/approvals?status=${status}`).then(d => setRows(d.approvals)).catch(e => setError(e.message)); }, [status]);
    useEffect(load, [load]);
    const decide = async (id: string, decision: 'approve' | 'reject', note: string) => {
        setError(null); setNotice(null);
        try {
            const r = await acApi<{ status: string; result?: any }>(`/approvals/${id}/decide`, { method: 'POST', body: { decision, note } });
            setNotice(r.status === 'executed' ? 'Aprobada y ejecutada.' : r.status === 'rejected' ? 'Rechazada.' : `Resultado: ${r.status}${r.result?.error ? ` — ${r.result.error}` : ''}`);
            load();
        } catch (e: any) { setError(e.message); }
    };
    return (
        <div className="space-y-4">
            <SectionHeader title="Aprobaciones" subtitle="Acciones que un agente propuso y sólo una persona autorizada decide. Lo que se ejecuta es exactamente lo propuesto: si la carga cambia, no se ejecuta."
                actions={<select id="appr-status" value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                    {[['pending', 'Pendientes'], ['executed', 'Ejecutadas'], ['rejected', 'Rechazadas'], ['failed', 'Fallidas'], ['expired', 'Vencidas'], ['', 'Todas']].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>} />
            <ErrorNote message={error} />
            {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-xs text-gray-500"><b className="text-gray-700">Nunca lo hace un agente:</b> {meta.prohibited.join(' · ')}.</div>
            {rows === null ? <div className="text-sm text-gray-400">Cargando…</div> : rows.length === 0 ? <EmptyNote>No hay aprobaciones {status === 'pending' ? 'pendientes' : 'en este estado'}.</EmptyNote> : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{rows.map(a => <ApprovalCard key={a.id} a={a} meta={meta} onDecide={decide} />)}</div>
            )}
        </div>
    );
}
