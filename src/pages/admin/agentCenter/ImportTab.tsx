import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, ExternalLink } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { ErrorNote, SectionHeader } from './agentCenterUi';

interface AgencyEntry { path: string; team: string; fits: string; imported: { id: string; status: string } | null }
interface SkillRow { id: string; key: string; name: string; description: string | null; bodyLength: number }

function AgencyRow({ entry, meta, onImport, busy }: { entry: AgencyEntry; meta: Meta; onImport: (path: string) => void; busy: boolean }) {
    const name = entry.path.split('/').pop()?.replace(/\.md$/, '').replace(/-/g, ' ');
    return (
        <li className="py-2.5 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-800 capitalize">{name}</p>
                <p className="text-xs text-gray-500">{meta.teams.find(t => t.key === entry.team)?.label} · encaja con {entry.fits}</p>
            </div>
            {entry.imported
                ? <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">Importado ({entry.imported.status === 'published' ? 'publicado' : 'borrador'})</span>
                : <button type="button" disabled={busy} onClick={() => onImport(entry.path)} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Importar como borrador</button>}
        </li>
    );
}

export default function ImportTab({ meta }: { meta: Meta }) {
    const [entries, setEntries] = useState<AgencyEntry[] | null>(null);
    const [skills, setSkills] = useState<SkillRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        acApi<{ entries: AgencyEntry[] }>('/agency/catalog').then(d => setEntries(d.entries)).catch(e => setError(e.message));
        acApi<{ skills: SkillRow[] }>('/skills').then(d => setSkills(d.skills)).catch(e => setError(e.message));
    }, []);
    useEffect(load, [load]);

    const doImport = async (path: string) => {
        setBusy(true); setError(null); setNotice(null);
        try {
            const r = await acApi<{ created: boolean; template: { draft: { name: string } } }>('/agency/import', { method: 'POST', body: { path } });
            setNotice(r.created ? `«${r.template.draft.name}» quedó como borrador en Agentes. Adáptalo antes de publicarlo.` : 'Ya estaba importado.');
            load();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };
    const syncSkills = async () => {
        setBusy(true); setError(null);
        try { const r = await acApi<{ total: number; created: number }>('/skills/sync', { method: 'POST' }); setNotice(`${r.total} habilidades sincronizadas (${r.created} nuevas).`); load(); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    const a = meta.agency;
    return (
        <div className="space-y-5">
            <SectionHeader title="Importar" subtitle="Perfiles de The Agency (lista curada, fijada a un commit) y las habilidades del repositorio. Todo entra como borrador: nada se instala ni se publica solo." />
            <ErrorNote message={error} />
            {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
                    <p className="font-black text-gray-800">The Agency</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        <a className="text-rotary-blue inline-flex items-center gap-1 hover:underline" href={`https://github.com/${a.owner}/${a.repo}/tree/${a.ref}`} target="_blank" rel="noopener noreferrer">{a.owner}/{a.repo} <ExternalLink className="w-3 h-3" /></a>
                        {' '}· commit <code>{a.ref.slice(0, 8)}</code> · licencia {a.license}. Son definiciones de personalidad: las herramientas, el modelo y los permisos los pone Club Platform.
                    </p>
                    {entries === null ? <p className="text-sm text-gray-400 mt-3">Cargando…</p> : (
                        <ul className="divide-y divide-gray-50 mt-2">{entries.map(e => <AgencyRow key={e.path} entry={e} meta={meta} onImport={doImport} busy={busy} />)}</ul>
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
