import { useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { AuditEntry, Meta } from './agentCenterApi';
import { EmptyNote, ErrorNote, SectionHeader, fmtDate } from './agentCenterUi';

const summarize = (v: any) => {
    if (!v || typeof v !== 'object') return '';
    return Object.entries(v).slice(0, 4).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x).slice(0, 60) : String(x).slice(0, 60)}`).join(' · ');
};

export default function GovernanceTab({ meta }: { meta: Meta }) {
    const [rows, setRows] = useState<AuditEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [action, setAction] = useState('');

    useEffect(() => { acApi<{ entries: AuditEntry[] }>('/audit?limit=300').then(d => setRows(d.entries)).catch(e => setError(e.message)); }, []);
    const shown = (rows || []).filter(r => !action || r.action === action);

    return (
        <div className="space-y-4">
            <SectionHeader title="Auditoría" subtitle="Cada cambio de configuración de los agentes: quién, cuándo, qué había antes y qué quedó."
                actions={<select id="gov-action" value={action} onChange={e => setAction(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                    <option value="">Todas las acciones</option>
                    {Object.entries(meta.auditActions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>} />
            <ErrorNote message={error} />
            {rows === null ? <div className="text-sm text-gray-400">Cargando…</div> : shown.length === 0 ? <EmptyNote>Sin registros.</EmptyNote> : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                            <th className="px-4 py-2.5">Cuándo</th><th className="px-4 py-2.5">Acción</th><th className="px-4 py-2.5">Quién</th><th className="px-4 py-2.5">Antes</th><th className="px-4 py-2.5">Después</th>
                        </tr></thead>
                        <tbody>
                            {shown.map(r => (
                                <tr key={r.id} className="border-b border-gray-50 align-top">
                                    <td className="px-4 py-2 whitespace-nowrap text-gray-500 tabular-nums">{fmtDate(r.createdAt)}</td>
                                    <td className="px-4 py-2 font-semibold text-gray-700">{meta.auditActions[r.action] || r.action}<span className="block text-[11px] font-normal text-gray-400">{r.entityType}{r.entityId ? ` · ${String(r.entityId).slice(0, 12)}` : ''}</span></td>
                                    <td className="px-4 py-2 text-gray-500">{r.actorRole || 'sistema'}</td>
                                    <td className="px-4 py-2 text-[12px] text-gray-500 max-w-xs break-words">{summarize(r.before)}</td>
                                    <td className="px-4 py-2 text-[12px] text-gray-700 max-w-xs break-words">{summarize(r.after)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
