import { useCallback, useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { Meta, SiteTypePolicy } from './agentCenterApi';
import { ErrorNote, SectionHeader, fmtDate } from './agentCenterUi';

function SiteTypeRow({ policy, meta, onSave }: { policy: SiteTypePolicy; meta: Meta; onSave: (type: string, patch: Partial<SiteTypePolicy>) => Promise<void> }) {
    const [notes, setNotes] = useState(policy.notes || '');
    const [busy, setBusy] = useState(false);
    useEffect(() => { setNotes(policy.notes || ''); }, [policy.notes]);

    const save = async (patch: Partial<SiteTypePolicy>) => { setBusy(true); try { await onSave(policy.type, patch); } finally { setBusy(false); } };
    const toggleTeam = (key: string) => {
        const cur = policy.allowedTeams || [];
        save({ allowedTeams: cur.includes(key) ? cur.filter(t => t !== key) : [...cur, key] });
    };

    return (
        <div className={`bg-white rounded-2xl border p-4 space-y-3 ${policy.enabled ? 'border-emerald-200' : 'border-gray-100'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-black text-gray-800">{policy.label}</p>
                    <p className="text-xs text-gray-500">{policy.hint}</p>
                    <p className="text-[11px] text-gray-400 mt-1 tabular-nums">{policy.sites} sitios de este tipo · {policy.installations} instalaciones{policy.updatedAt ? ` · cambiado ${fmtDate(policy.updatedAt)}` : ''}</p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input id={`st-${policy.type}`} type="checkbox" className="w-4 h-4" checked={policy.enabled} disabled={busy} onChange={e => save({ enabled: e.target.checked })} />
                    <span className={`text-sm font-bold ${policy.enabled ? 'text-emerald-700' : 'text-gray-500'}`}>{policy.enabled ? 'Integrado' : 'Sin integrar'}</span>
                </label>
            </div>
            {policy.enabled && (
                <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-600">Equipos permitidos <span className="font-normal text-gray-400">(ninguno marcado = todos)</span></p>
                    <div className="flex flex-wrap gap-1.5">
                        {meta.teams.map(t => (
                            <button key={t.key} type="button" disabled={busy} onClick={() => toggleTeam(t.key)}
                                className={`text-xs px-2.5 py-1 rounded-full border ${policy.allowedTeams.includes(t.key) ? 'bg-blue-50 border-blue-200 text-rotary-blue font-bold' : 'bg-white border-gray-200 text-gray-500'}`}>{t.short}</button>
                        ))}
                    </div>
                    <label htmlFor={`st-notes-${policy.type}`} className="block text-xs font-bold text-gray-600">Nota para el equipo</label>
                    <div className="flex gap-2">
                        <input id={`st-notes-${policy.type}`} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej.: piloto con la Feria 2026" />
                        <button type="button" disabled={busy || notes === (policy.notes || '')} onClick={() => save({ notes })} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold disabled:opacity-40">Guardar</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SiteTypesTab({ meta }: { meta: Meta }) {
    const [rows, setRows] = useState<SiteTypePolicy[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        acApi<{ siteTypes: SiteTypePolicy[] }>('/site-types').then(d => setRows(d.siteTypes)).catch(e => setError(e.message));
    }, []);
    useEffect(load, [load]);

    const onSave = async (type: string, patch: Partial<SiteTypePolicy>) => {
        setError(null);
        try { await acApi(`/site-types/${encodeURIComponent(type)}`, { method: 'PUT', body: patch }); load(); } catch (e: any) { setError(e.message); }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Tipos de sitio" subtitle="Con qué tipos de sitio se integran los agentes. Un tipo sin integrar no recibe instalaciones nuevas y las que ya tiene quedan deshabilitadas (no se borran). Los equipos permitidos acotan qué agentes trabajan en cada tipo." />
            <ErrorNote message={error} />
            {rows === null ? <div className="text-sm text-gray-400">Cargando…</div> : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {rows.map(p => <SiteTypeRow key={p.type} policy={p} meta={meta} onSave={onSave} />)}
                </div>
            )}
        </div>
    );
}
