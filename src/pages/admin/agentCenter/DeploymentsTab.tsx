// Despliegues por oleadas — reemplaza «Desplegar a todos los clubes» (v4.1317).
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta, Template } from './agentCenterApi';
import { EmptyNote, ErrorNote, SectionHeader, fmtDate } from './agentCenterUi';

interface Rollout { id: string; name: string; preset: string | null; templateKeys: string[]; siteTypes: string[]; platform: boolean; status: string; currentWave: number; totalWaves: number; targetCount: number; installed?: number; notes: string | null; createdAt: string; autoActivate: boolean }
interface Target { id: string; siteId: string; siteName: string | null; siteType: string | null; wave: number; status: string; reason: string | null; installationIds: string[] }
interface RolloutFull extends Rollout { targets: Target[]; health: { runs: number; failed: number; gate: { ok: boolean; reason: string } }; lastWave?: { created: number; skipped: number; errors: string[] } }
interface Preview { ok: boolean; errors: string[]; targets: number; waves: number[]; normalized: { templateKeys: string[]; missingTemplates: string[] } }

const WAVE_PLANS: Record<string, { label: string; waves: { count?: number; percent?: number }[] }> = {
    gradual: { label: '1 sitio piloto → 25 % → 100 %', waves: [{ count: 1 }, { percent: 25 }, { percent: 100 }] },
    dos: { label: '50 % → 100 %', waves: [{ percent: 50 }, { percent: 100 }] },
    una: { label: 'Todo en una oleada', waves: [{ percent: 100 }] },
};

function CreateForm({ meta, onCreated }: { meta: Meta; onCreated: (id: string) => void }) {
    const [name, setName] = useState('');
    const [preset, setPreset] = useState('');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [picked, setPicked] = useState<string[]>([]);
    const [siteTypes, setSiteTypes] = useState<string[]>([]);
    const [plan, setPlan] = useState('gradual');
    const [autoActivate, setAutoActivate] = useState(false);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => { acApi<{ templates: Template[] }>('/templates?status=published').then(d => setTemplates(d.templates)).catch(() => setTemplates([])); }, []);
    const p = preset ? meta.teamPresets[preset] : null;
    const body = { name, preset: preset || null, templateKeys: picked, siteTypes, platform: Boolean(p?.platform), waves: WAVE_PLANS[plan].waves, autoActivate };
    useEffect(() => {
        if (!name && !preset && !picked.length) { setPreview(null); return; }
        const t = setTimeout(() => { acApi<Preview>('/rollouts/preview', { method: 'POST', body }).then(setPreview).catch(() => setPreview(null)); }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, preset, picked.join(','), siteTypes.join(','), plan, autoActivate]);
    const choosePreset = (k: string) => { setPreset(k); if (k && meta.teamPresets[k]) setSiteTypes(meta.teamPresets[k].siteTypes); };
    const toggle = (list: string[], v: string, set: (x: string[]) => void) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
    const create = async () => {
        setBusy(true); setError(null);
        try { const r = await acApi<RolloutFull>('/rollouts', { method: 'POST', body }); onCreated(r.id); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="font-black text-gray-800">Nuevo despliegue</p>
            <ErrorNote message={error} />
            <input aria-label="Nombre del despliegue" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Ej.: Equipo de eventos para conferencias 2027" value={name} onChange={e => setName(e.target.value)} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                    <label htmlFor="ro-preset" className="block text-xs font-bold text-gray-600 mb-1">Plantilla de equipo</label>
                    <select id="ro-preset" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" value={preset} onChange={e => choosePreset(e.target.value)}>
                        <option value="">Sin plantilla (elegir agentes)</option>
                        {Object.entries(meta.teamPresets).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    {p && <p className="text-xs text-gray-500 mt-1">{p.help}</p>}
                </div>
                <div>
                    <p className="text-xs font-bold text-gray-600 mb-1">Agentes adicionales (publicados)</p>
                    <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-xl p-1">
                        {templates.map(t => <label key={t.id} className="flex items-center gap-2 text-xs px-2 py-1"><input type="checkbox" checked={picked.includes(t.key)} onChange={() => toggle(picked, t.key, setPicked)} />{t.draft.name}</label>)}
                    </div>
                </div>
            </div>
            {!p?.platform && (
                <div>
                    <p className="text-xs font-bold text-gray-600 mb-1">Destino: tipos de sitio (sólo cuentan los integrados)</p>
                    <div className="flex flex-wrap gap-1.5">{meta.siteTypes.map(s => <button key={s.type} type="button" onClick={() => toggle(siteTypes, s.type, setSiteTypes)} className={`text-xs px-2.5 py-1 rounded-full border ${siteTypes.includes(s.type) ? 'bg-blue-50 border-blue-200 text-rotary-blue font-bold' : 'bg-white border-gray-200 text-gray-500'}`}>{s.label}</button>)}</div>
                </div>
            )}
            <div className="flex flex-wrap gap-3 items-center">
                <select aria-label="Oleadas" className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" value={plan} onChange={e => setPlan(e.target.value)}>{Object.entries(WAVE_PLANS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                <label className="inline-flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={autoActivate} onChange={e => setAutoActivate(e.target.checked)} /> Encender con el primer administrador de cada sitio como responsable (si no, cada sitio elige y enciende)</label>
            </div>
            {preview && (
                <div className={`rounded-xl px-4 py-2 text-sm ${preview.ok ? 'bg-blue-50 text-blue-900' : 'bg-amber-50 text-amber-800'}`}>
                    {preview.ok ? <>Destino: <b>{preview.targets}</b> sitios en {preview.waves.length} oleadas ({preview.waves.join(' · ')}). Agentes: {preview.normalized.templateKeys.length}.{preview.normalized.missingTemplates.length ? ` Sin publicar (no se desplegarán): ${preview.normalized.missingTemplates.join(', ')}.` : ''}</> : preview.errors.join(' ')}
                </div>
            )}
            <button type="button" disabled={busy || !preview?.ok} onClick={create} className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">Crear despliegue (borrador)</button>
        </div>
    );
}

function RolloutDetail({ id, meta, onClose, onChanged }: { id: string; meta: Meta; onClose: () => void; onChanged: () => void }) {
    const [ro, setRo] = useState<RolloutFull | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => { acApi<RolloutFull>(`/rollouts/${id}`).then(setRo).catch(e => setError(e.message)); }, [id]);
    useEffect(load, [load]);
    const act = async (path: string, body?: unknown) => {
        setBusy(true); setError(null);
        try { setRo(await acApi<RolloutFull>(`/rollouts/${id}/${path}`, { method: 'POST', body })); onChanged(); } catch (e: any) { setError(e.message); load(); } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Despliegue">
            <div className="w-full max-w-3xl h-full bg-gray-50 overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
                    <p className="font-black text-gray-800 flex-1 truncate">{ro?.name}</p>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>
                {ro && (
                    <div className="p-5 space-y-4">
                        <ErrorNote message={error} />
                        <p className="text-sm text-gray-600">{meta.rolloutStates[ro.status]} · oleada {ro.currentWave} de {ro.totalWaves} · {ro.platform ? 'administración central' : `${ro.targetCount} sitios`} · {ro.templateKeys.join(', ')}</p>
                        {ro.notes && <p className="text-xs text-amber-700">{ro.notes}</p>}
                        <div className={`rounded-xl px-4 py-2 text-sm ${ro.health.gate.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>Salud de lo desplegado: {ro.health.runs} ejecuciones, {ro.health.failed} fallidas. {ro.health.gate.reason}</div>
                        {ro.lastWave && <p className="text-sm text-gray-700">Última oleada: {ro.lastWave.created} instalaciones nuevas, {ro.lastWave.skipped} ya existían{ro.lastWave.errors.length ? `, ${ro.lastWave.errors.length} errores` : ''}.</p>}
                        <div className="flex flex-wrap gap-2 items-center">
                            {ro.status === 'draft' && ro.targetCount > 1 && <input aria-label="Confirmación" className="w-56 px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder={`Escribe ${ro.targetCount} para confirmar`} value={confirm} onChange={e => setConfirm(e.target.value)} />}
                            {['draft', 'running', 'paused'].includes(ro.status) && <button type="button" disabled={busy} onClick={() => act('advance', { confirmCount: Number(confirm) || null, force: ro.status === 'paused' })} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">{ro.status === 'draft' ? 'Confirmar y desplegar la oleada 1' : ro.status === 'paused' ? `Reanudar: desplegar la oleada ${ro.currentWave + 1}` : `Desplegar la oleada ${ro.currentWave + 1}`}</button>}
                            {ro.status === 'running' && <button type="button" disabled={busy} onClick={() => act('pause')} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold">Pausar</button>}
                            {['running', 'paused', 'completed'].includes(ro.status) && <button type="button" disabled={busy} onClick={() => act('rollback')} className="px-3 py-2 rounded-xl border border-red-200 text-sm font-bold text-red-600">Revertir (apagar lo desplegado)</button>}
                        </div>
                        {ro.targets.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                                <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-4 py-2">Oleada</th><th className="px-4 py-2">Sitio</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2">Detalle</th></tr></thead>
                                    <tbody>{ro.targets.map(t => <tr key={t.id} className="border-b border-gray-50"><td className="px-4 py-1.5 tabular-nums">{t.wave}</td><td className="px-4 py-1.5">{t.siteName || t.siteId}</td><td className="px-4 py-1.5 text-xs font-bold">{t.status}</td><td className="px-4 py-1.5 text-xs text-gray-500">{t.reason || (t.installationIds.length ? `${t.installationIds.length} instalaciones` : '')}</td></tr>)}</tbody></table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function DeploymentsTab({ meta }: { meta: Meta }) {
    const [rows, setRows] = useState<Rollout[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const load = useCallback(() => { acApi<{ rollouts: Rollout[] }>('/rollouts').then(d => setRows(d.rollouts)).catch(e => setError(e.message)); }, []);
    useEffect(load, [load]);
    return (
        <div className="space-y-4">
            <SectionHeader title="Despliegues" subtitle="Instala agentes en muchos sitios a la vez, por tipo de sitio y en oleadas, con confirmación, compuerta de salud y reversión. Reemplaza «Desplegar a todos los clubes»." />
            <ErrorNote message={error} />
            <CreateForm meta={meta} onCreated={(id) => { load(); setOpen(id); }} />
            {rows === null ? <div className="text-sm text-gray-400">Cargando…</div> : rows.length === 0 ? <EmptyNote>Todavía no hay despliegues.</EmptyNote> : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-4 py-2.5">Despliegue</th><th className="px-4 py-2.5">Estado</th><th className="px-4 py-2.5">Oleada</th><th className="px-4 py-2.5">Sitios</th><th className="px-4 py-2.5">Creado</th></tr></thead>
                        <tbody>{rows.map(r => (
                            <tr key={r.id} onClick={() => setOpen(r.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                                <td className="px-4 py-2 text-gray-800">{r.name}<span className="block text-xs text-gray-400">{r.preset ? meta.teamPresets[r.preset]?.label : r.templateKeys.join(', ')}</span></td>
                                <td className="px-4 py-2 text-xs font-bold">{meta.rolloutStates[r.status]}</td>
                                <td className="px-4 py-2 tabular-nums">{r.currentWave}/{r.totalWaves}</td>
                                <td className="px-4 py-2 tabular-nums">{r.platform ? 'Central' : `${r.installed || 0}/${r.targetCount}`}</td>
                                <td className="px-4 py-2 text-gray-500 whitespace-nowrap tabular-nums">{fmtDate(r.createdAt)}</td>
                            </tr>
                        ))}</tbody></table>
                </div>
            )}
            {open && <RolloutDetail id={open} meta={meta} onClose={() => setOpen(null)} onChanged={load} />}
        </div>
    );
}
