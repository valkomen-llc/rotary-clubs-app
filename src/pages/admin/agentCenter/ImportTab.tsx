import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, ExternalLink } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { ErrorNote, SectionHeader } from './agentCenterUi';

interface CatalogStatus {
    source: { owner: string; repo: string; ref: string; license: string };
    bundleAgents: number;
    divisions: { key: string; label: string; color: string | null; agents: number }[];
    byOrigin: Record<string, number>;
    flag: { ref?: string; resetAt?: string; syncedAt?: string; loaded?: number; backupKey?: string } | null;
}
interface SkillRow { id: string; key: string; name: string; description: string | null; bodyLength: number }

export default function ImportTab({ meta }: { meta: Meta }) {
    const [status, setStatus] = useState<CatalogStatus | null>(null);
    const [confirm, setConfirm] = useState('');
    const [skills, setSkills] = useState<SkillRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        acApi<CatalogStatus>('/agency/catalog').then(setStatus).catch(e => setError(e.message));
        acApi<{ skills: SkillRow[] }>('/skills').then(d => setSkills(d.skills)).catch(e => setError(e.message));
    }, []);
    useEffect(load, [load]);

    const run = async (fn: () => Promise<string>) => {
        setBusy(true); setError(null); setNotice(null);
        try { setNotice(await fn()); load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };
    const sync = () => run(async () => { const r = await acApi<{ added: number }>('/agency/sync', { method: 'POST' }); return r.added ? `Se agregaron ${r.added} agentes del repositorio.` : 'El catálogo ya tiene todos los agentes del repositorio.'; });
    const reset = () => run(async () => {
        const r = await acApi<{ removed: { templates: number; installations: number }; loaded: number }>('/agency/reset', { method: 'POST', body: { confirm } });
        setConfirm('');
        return `Restablecido: se retiraron ${r.removed.templates} plantillas y ${r.removed.installations} instalaciones; quedaron los ${r.loaded} agentes del repositorio.`;
    });
    const syncSkills = async () => {
        setBusy(true); setError(null);
        try { const r = await acApi<{ total: number; created: number }>('/skills/sync', { method: 'POST' }); setNotice(`${r.total} habilidades sincronizadas (${r.created} nuevas).`); load(); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    const a = meta.agency;
    return (
        <div className="space-y-5">
            <SectionHeader title="Repositorio" subtitle="El catálogo de agentes ES el repositorio de The Agency, fijado a un commit: lo que se carga hoy es lo mismo que se carga mañana. Los agentes llegan publicados y sin instalar; nada se instala ni se enciende solo." />
            <ErrorNote message={error} />
            {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-4 min-w-0 space-y-3">
                    <div>
                        <p className="font-black text-gray-800">The Agency</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            <a className="text-rotary-blue inline-flex items-center gap-1 hover:underline" href={`https://github.com/${a.owner}/${a.repo}/tree/${status?.source.ref || a.ref}`} target="_blank" rel="noopener noreferrer">{a.owner}/{a.repo} <ExternalLink className="w-3 h-3" /></a>
                            {' '}· commit <code>{(status?.source.ref || a.ref).slice(0, 8)}</code> · licencia {a.license}. Son definiciones de personalidad (en inglés): las herramientas, el modelo y los permisos los pone Club Platform.
                        </p>
                    </div>
                    {status === null ? <p className="text-sm text-gray-400">Cargando…</p> : (
                        <>
                            <p className="text-sm text-gray-700"><b>{status.byOrigin.agency || 0}</b> de {status.bundleAgents} agentes del repositorio en el catálogo{Object.entries(status.byOrigin).filter(([k]) => k !== 'agency').map(([k, n]) => ` · ${n} plantillas propias (${k})`).join('')}.</p>
                            {status.flag?.resetAt && <p className="text-xs text-gray-500">Restablecido el {new Date(status.flag.resetAt).toLocaleString('es-CO')}. La copia de lo anterior quedó guardada (<code>{status.flag.backupKey}</code>).</p>}
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-sm">{status.divisions.map(d => (
                                <li key={d.key} className="flex justify-between gap-2 py-1 border-b border-gray-50"><span>{(a.divisions || {})[d.key] || d.label}</span><span className="tabular-nums text-gray-500">{d.agents}</span></li>
                            ))}</ul>
                            <div className="flex flex-wrap gap-2 items-center pt-1">
                                <button type="button" disabled={busy} onClick={sync} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-gray-200 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Agregar los que falten</button>
                            </div>
                            <div className="border-t border-gray-100 pt-3 space-y-2">
                                <p className="text-sm font-bold text-gray-800">Restablecer el catálogo</p>
                                <p className="text-xs text-gray-500">Borra TODAS las plantillas, versiones, instalaciones y herramientas concedidas del Command Center y vuelve a cargar sólo los agentes del repositorio. Antes guarda una copia completa. No toca el chat de «Control de Misión VIP».</p>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <input aria-label="Confirmación" className="px-3 py-2 rounded-xl border border-gray-200 text-xs" placeholder="Escribe RESTABLECER" value={confirm} onChange={e => setConfirm(e.target.value)} />
                                    <button type="button" disabled={busy || confirm !== 'RESTABLECER'} onClick={reset} className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-40">Restablecer</button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
                    <div className="flex flex-wrap justify-between gap-2 items-start">
                        <div><p className="font-black text-gray-800">Habilidades del repositorio</p><p className="text-xs text-gray-500">Las de <code>.agent/skills</code>: bloques de instrucciones que se asignan a las plantillas.</p></div>
                        <button type="button" disabled={busy} onClick={syncSkills} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"><RefreshCw className="w-3.5 h-3.5" /> Sincronizar</button>
                    </div>
                    {skills === null ? <p className="text-sm text-gray-400 mt-3">Cargando…</p> : (
                        <ul className="divide-y divide-gray-50 mt-2 max-h-[520px] overflow-y-auto">
                            {skills.map(s => (
                                <li key={s.id} className="py-2">
                                    <p className="text-sm font-bold text-gray-800">{s.name}</p>
                                    <p className="text-xs text-gray-500 line-clamp-2">{s.description}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
