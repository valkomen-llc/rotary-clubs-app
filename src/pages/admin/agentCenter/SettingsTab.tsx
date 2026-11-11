import { useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import { ErrorNote, SectionHeader } from './agentCenterUi';

interface Settings { killSwitch: boolean; defaultModel: string | null; allowAgencyImport: boolean }

export default function SettingsTab() {
    const [s, setS] = useState<Settings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => { acApi<Settings>('/settings').then(setS).catch(e => setError(e.message)); }, []);

    const save = async (patch: Partial<Settings>) => {
        setBusy(true); setError(null); setNotice(null);
        try { const r = await acApi<Settings>('/settings', { method: 'PUT', body: patch }); setS(r); setNotice('Ajuste guardado y auditado.'); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Ajustes" subtitle="Ajustes de la plataforma para todos los agentes. Cada cambio queda en la auditoría." />
            <ErrorNote message={error} />
            {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
            {!s ? <div className="text-sm text-gray-400">Cargando…</div> : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className={`bg-white rounded-2xl border p-4 ${s.killSwitch ? 'border-red-300' : 'border-gray-100'}`}>
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input id="set-kill" type="checkbox" className="mt-1 w-4 h-4" checked={s.killSwitch} disabled={busy} onChange={e => save({ killSwitch: e.target.checked })} />
                            <span><b className="text-gray-800">Interruptor general</b><span className="block text-sm text-gray-500">Detiene toda ejecución de agentes en la plataforma (tareas, workflows y programaciones). Las conversaciones y la configuración no se pierden.</span></span>
                        </label>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input id="set-agency" type="checkbox" className="mt-1 w-4 h-4" checked={s.allowAgencyImport} disabled={busy} onChange={e => save({ allowAgencyImport: e.target.checked })} />
                            <span><b className="text-gray-800">Permitir importar de The Agency</b><span className="block text-sm text-gray-500">Sólo de la lista curada y siempre como borrador.</span></span>
                        </label>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:col-span-2">
                        <label htmlFor="set-model" className="block font-bold text-gray-800">Modelo por defecto de los agentes</label>
                        <p className="text-sm text-gray-500 mb-2">El identificador de Integraciones → Modelos IA. Vacío = el modelo por defecto de la plataforma.</p>
                        <div className="flex gap-2">
                            <input id="set-model" className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" defaultValue={s.defaultModel || ''} placeholder="gemini-2.5-flash" onBlur={e => { const v = e.target.value.trim() || null; if (v !== s.defaultModel) save({ defaultModel: v }); }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
