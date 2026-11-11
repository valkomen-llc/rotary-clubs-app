// Conocimiento y memoria — reemplaza el botón muerto «Vector Memory» (v4.1318).
import { useCallback, useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { ErrorNote, Kpi, SectionHeader } from './agentCenterUi';

interface MemoryData {
    byKind: { brainKind: string; isMaster: boolean; memories: number; withoutEmbedding: number }[];
    totals: { memories: number; brains: number };
    masterPrivateCopies: number;
    vector: { available: boolean; enabled: boolean; rows: number | null };
}

export default function KnowledgeTab({ meta }: { meta: Meta }) {
    const [d, setD] = useState<MemoryData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [purgePreview, setPurgePreview] = useState<{ removable: number; keptWithoutOriginal: number } | null>(null);
    const [confirm, setConfirm] = useState('');
    const [retention, setRetention] = useState<number | null>(null);
    const load = useCallback(() => { acApi<MemoryData>('/memory').then(setD).catch(e => setError(e.message)); }, []);
    useEffect(() => {
        load();
        if (meta.scope === 'platform') acApi<{ retentionDays: number }>('/settings').then(s => setRetention(s.retentionDays)).catch(() => {});
    }, [load, meta.scope]);
    const run = async (fn: () => Promise<string>) => { setBusy(true); setError(null); setNotice(null); try { setNotice(await fn()); load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
    const withoutEmb = (d?.byKind || []).reduce((a, r) => a + r.withoutEmbedding, 0);
    return (
        <div className="space-y-5">
            <SectionHeader title="Conocimiento y memoria" subtitle="Los agentes consultan SÓLO el conocimiento autorizado de su sitio: su cerebro, el de su distrito y lo global de la plataforma, con la fuente de cada resultado. Lo que un agente genera no se guarda como hecho." />
            <ErrorNote message={error} />
            {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
            {d && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Kpi label="Memorias" value={d.totals.memories.toLocaleString('es-CO')} hint={`${d.totals.brains} cerebros`} />
                        <Kpi label="Sin embedding" value={withoutEmb} hint="no aparecen en la búsqueda semántica" />
                        <Kpi label="Búsqueda" value={d.vector.enabled ? 'pgvector' : 'clásica'} hint={d.vector.enabled ? `${d.vector.rows ?? 0} vectores indexados` : 'coseno en el servidor'} />
                        {meta.scope === 'platform' && <Kpi label="Copias privadas en el maestro" value={d.masterPrivateCopies} hint="heredadas" />}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="font-black text-gray-800 mb-2">Por tipo de cerebro</p>
                        <ul className="divide-y divide-gray-50">{d.byKind.map((r, i) => <li key={i} className="py-1.5 flex justify-between text-sm"><span>{r.isMaster ? 'Maestro (global)' : r.brainKind === 'DISTRICT' ? 'Distritos' : 'Sitios'}</span><span className="tabular-nums text-gray-600">{r.memories} memorias · {r.withoutEmbedding} sin embedding</span></li>)}</ul>
                    </div>
                </>
            )}
            {meta.scope === 'platform' && d && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                        <p className="font-black text-gray-800">Búsqueda con pgvector</p>
                        <p className="text-xs text-gray-500">Ordena por similitud en la base con un índice HNSW, con el recorte de alcance en el mismo SQL. Los vectores viven en una tabla aparte; si algo falla, se usa la búsqueda de siempre.</p>
                        {d.vector.enabled
                            ? <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => run(async () => { const r = await acApi<{ copied: number; pending: number }>('/memory/vector/backfill', { method: 'POST' }); return `${r.copied} vectores copiados; faltan ${r.pending}.`; })} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold">Indexar lo nuevo</button><button type="button" disabled={busy} onClick={() => run(async () => { await acApi('/memory/vector/disable', { method: 'POST' }); return 'pgvector desactivado: vuelve la búsqueda clásica.'; })} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-red-600">Desactivar</button></div>
                            : <button type="button" disabled={busy} onClick={() => run(async () => { const r = await acApi<{ backfill: { copied: number; pending: number } }>('/memory/vector/enable', { method: 'POST' }); return `pgvector activo: ${r.backfill.copied} vectores indexados (faltan ${r.backfill.pending}; se completan cada día).`; })} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">Activar pgvector</button>}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                        <p className="font-black text-gray-800">Limpiar el cerebro maestro</p>
                        <p className="text-xs text-gray-500">Hasta v4.1317 cada memoria de un sitio se copiaba también al maestro. Esto quita SÓLO las copias cuyo original sigue en el cerebro del sitio o del distrito: no se pierde información.</p>
                        <button type="button" disabled={busy} onClick={() => run(async () => { const r = await acApi<{ removable: number; keptWithoutOriginal: number }>('/memory/purge-master', { method: 'POST', body: {} }); setPurgePreview(r); return `Se pueden quitar ${r.removable} copias (${r.keptWithoutOriginal} se conservan porque no tienen original).`; })} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold">Calcular</button>
                        {purgePreview && purgePreview.removable > 0 && (
                            <div className="flex gap-2 items-center">
                                <input aria-label="Confirmación" className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs" placeholder="Escribe LIMPIAR" value={confirm} onChange={e => setConfirm(e.target.value)} />
                                <button type="button" disabled={busy || confirm !== 'LIMPIAR'} onClick={() => run(async () => { const r = await acApi<{ removed: number }>('/memory/purge-master', { method: 'POST', body: { confirm } }); setPurgePreview(null); setConfirm(''); return `${r.removed} copias quitadas del maestro.`; })} className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-40">Quitar</button>
                            </div>
                        )}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                        <p className="font-black text-gray-800">Retención de la memoria operativa</p>
                        <p className="text-xs text-gray-500">Las ejecuciones y sus pasos se borran pasado este plazo (mínimo 30 días). El detalle de consumo vive 400 días; el agregado diario, siempre.</p>
                        {retention != null && <label className="flex items-center gap-2 text-sm">Días <input aria-label="Días de retención" type="number" min="30" max="3650" className="w-24 px-3 py-1.5 rounded-xl border border-gray-200 text-sm" defaultValue={retention} onBlur={e => run(async () => { const r = await acApi<{ retentionDays: number }>('/settings', { method: 'PUT', body: { retentionDays: Number(e.target.value) } }); setRetention(r.retentionDays); return `Retención: ${r.retentionDays} días.`; })} /></label>}
                    </div>
                </div>
            )}
        </div>
    );
}
