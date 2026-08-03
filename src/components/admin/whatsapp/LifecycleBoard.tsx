import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Activity, RefreshCw, AlertTriangle, CheckCircle2, ShieldBan, Settings2,
    Clock, Users, Ban, Plus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

type StateDef = { key: string; label: string; group: string; description?: string; manualOnly?: boolean };
type SiteRow = {
    siteId: string; siteType: string; siteName: string | null; state: string;
    manualState: string | null; reason: string | null; since: string;
    previousState: string | null; contactCount: number; signals: any;
};
type Alert = {
    id: string; type: string; severity: string; title: string; detail: string | null;
    siteId: string | null; createdAt: string;
};
type Settings = {
    timezone: string; sendWindowStartMin: number; sendWindowEndMin: number; sendWeekdays: number[];
    maxPerContactPerWindow: number; frequencyWindowDays: number; sameTemplateCooldownDays: number;
    maxSendAttempts: number; requireExplicitConsentFor: string[]; links?: Record<string, string>;
};

const GROUP_STYLE: Record<string, string> = {
    previo: 'bg-slate-100 text-slate-700 border-slate-200',
    implantacion: 'bg-blue-50 text-blue-700 border-blue-200',
    activo: 'bg-green-50 text-green-700 border-green-200',
    renovacion: 'bg-amber-50 text-amber-800 border-amber-200',
    final: 'bg-red-50 text-red-700 border-red-200',
};

const SEVERITY_STYLE: Record<string, string> = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-800',
};

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export default function LifecycleBoard() {
    const { token } = useAuth();

    // Hooks arriba de todo, sin excepción — un `return` temprano por encima de un
    // hook tumba el árbol al segundo render.
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [states, setStates] = useState<StateDef[]>([]);
    const [counts, setCounts] = useState<{ state: string; label: string; n: number }[]>([]);
    const [sites, setSites] = useState<SiteRow[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [suppressions, setSuppressions] = useState<any[]>([]);
    const [filter, setFilter] = useState<string>('');
    const [syncing, setSyncing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [newSuppression, setNewSuppression] = useState('');

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    }), [token]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = filter ? `?state=${encodeURIComponent(filter)}` : '';
            const [rb, ra, rs, rsup] = await Promise.all([
                fetch(`${API}/crm/lifecycle${qs}`, { headers }),
                fetch(`${API}/crm/alerts`, { headers }),
                fetch(`${API}/crm/automation/settings`, { headers }),
                fetch(`${API}/crm/suppressions`, { headers }),
            ]);
            if (!rb.ok) {
                const body = await rb.json().catch(() => ({}));
                throw new Error(body.error || 'No se pudo cargar el tablero');
            }
            const board = await rb.json();
            setStates(board.states || []);
            setCounts(board.counts || []);
            setSites(board.sites || []);
            if (ra.ok) setAlerts(await ra.json());
            // Los ajustes y la lista de exclusión son sólo del operador de la
            // plataforma: un 403 acá es la respuesta correcta, no un fallo.
            if (rs.ok) setSettings(await rs.json());
            if (rsup.ok) setSuppressions(await rsup.json());
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [headers, filter]);

    useEffect(() => { load(); }, [load]);

    const sync = async () => {
        setSyncing(true);
        try {
            const res = await fetch(`${API}/crm/lifecycle/sync`, { method: 'POST', headers });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo recalcular');
            toast.success(
                `${body.sites} sitios observados · ${body.transitions} transiciones · ${body.eventsCreated} eventos nuevos` +
                (body.bootstrapped ? ` · ${body.bootstrapped} vistos por primera vez` : '')
            );
            load();
        } catch (e: any) { toast.error(e.message); }
        finally { setSyncing(false); }
    };

    const setManual = async (site: SiteRow, state: string) => {
        try {
            const res = await fetch(`${API}/crm/lifecycle/${site.siteId}`, {
                method: 'PUT', headers,
                body: JSON.stringify({ state: state || null, siteType: site.siteType }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo fijar el estado');
            toast.success(state ? 'Estado fijado a mano' : 'Vuelve a decidirlo el sistema');
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const resolveAlert = async (id: string) => {
        try {
            const res = await fetch(`${API}/crm/alerts/${id}/resolve`, { method: 'PATCH', headers });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo resolver');
            setAlerts(prev => prev.filter(a => a.id !== id));
        } catch (e: any) { toast.error(e.message); }
    };

    const saveSettings = async () => {
        if (!settings) return;
        try {
            const res = await fetch(`${API}/crm/automation/settings`, {
                method: 'PUT', headers, body: JSON.stringify(settings),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo guardar');
            setSettings(body);
            toast.success('Guardias de envío actualizados');
        } catch (e: any) { toast.error(e.message); }
    };

    const addSuppression = async () => {
        if (!newSuppression.trim()) return;
        try {
            const res = await fetch(`${API}/crm/suppressions`, {
                method: 'POST', headers,
                body: JSON.stringify({ phone: newSuppression.trim(), reason: 'opt_out', note: 'Agregado a mano' }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo agregar');
            setNewSuppression('');
            toast.success('Número excluido');
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const removeSuppression = async (phone: string) => {
        try {
            const res = await fetch(`${API}/crm/suppressions/${encodeURIComponent(phone)}`, { method: 'DELETE', headers });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo quitar');
            toast.success('Número reactivado');
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const stateByKey = useMemo(
        () => Object.fromEntries(states.map(s => [s.key, s])),
        [states]
    );

    if (loading) return <div className="p-12 text-center text-gray-500">Cargando el ciclo de vida…</div>;

    if (error) {
        return (
            <div className="p-8 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> {error}</p>
                <button onClick={load} className="mt-3 text-sm px-3 py-1.5 bg-white border rounded-lg">Reintentar</button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-green-600" /> Ciclo de vida de los sitios
                    </h2>
                    <p className="text-sm text-gray-500">
                        El estado se deduce de lo que la plataforma observa. Es lo que dispara los recorridos.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {settings && (
                        <button
                            onClick={() => setShowSettings(s => !s)}
                            className="px-3 py-2 border rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50"
                        ><Settings2 className="w-4 h-4" /> Guardias de envío</button>
                    )}
                    <button
                        onClick={sync} disabled={syncing}
                        className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Observando…' : 'Recalcular'}
                    </button>
                </div>
            </div>

            {showSettings && settings && (
                <div className="bg-white border rounded-xl p-4 space-y-4">
                    <h3 className="font-semibold text-gray-900">Guardias de envío</h3>
                    <p className="text-sm text-gray-500">
                        Fuera de horario o pasado el tope de frecuencia, el mensaje se <strong>aplaza</strong>, no se descarta.
                        Una baja o una exclusión sí lo descartan para siempre.
                    </p>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <label className="text-sm">
                            <span className="text-gray-500">Zona horaria</span>
                            <input
                                value={settings.timezone}
                                onChange={e => setSettings({ ...settings, timezone: e.target.value })}
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="text-gray-500">Desde</span>
                            <input
                                type="time" value={minutesToTime(settings.sendWindowStartMin)}
                                onChange={e => setSettings({ ...settings, sendWindowStartMin: timeToMinutes(e.target.value) })}
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="text-gray-500">Hasta</span>
                            <input
                                type="time" value={minutesToTime(settings.sendWindowEndMin)}
                                onChange={e => setSettings({ ...settings, sendWindowEndMin: timeToMinutes(e.target.value) })}
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="text-gray-500">Máx. por contacto</span>
                            <div className="flex items-center gap-1 mt-1">
                                <input
                                    type="number" min={0} value={settings.maxPerContactPerWindow}
                                    onChange={e => setSettings({ ...settings, maxPerContactPerWindow: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                />
                                <span className="text-xs text-gray-400 whitespace-nowrap">cada</span>
                                <input
                                    type="number" min={1} value={settings.frequencyWindowDays}
                                    onChange={e => setSettings({ ...settings, frequencyWindowDays: Number(e.target.value) })}
                                    className="w-16 border rounded-lg px-2 py-1.5 text-sm"
                                />
                                <span className="text-xs text-gray-400">d</span>
                            </div>
                        </label>
                    </div>

                    <div>
                        <span className="text-sm text-gray-500">Días permitidos</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {WEEKDAYS.map((d, i) => {
                                const on = (settings.sendWeekdays || []).includes(i);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setSettings({
                                            ...settings,
                                            sendWeekdays: on
                                                ? settings.sendWeekdays.filter(x => x !== i)
                                                : [...settings.sendWeekdays, i].sort(),
                                        })}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                                            on ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500'
                                        }`}
                                    >{d}</button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <label className="text-sm">
                            <span className="text-gray-500">No repetir la misma plantilla en (días)</span>
                            <input
                                type="number" min={0} value={settings.sameTemplateCooldownDays}
                                onChange={e => setSettings({ ...settings, sameTemplateCooldownDays: Number(e.target.value) })}
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="text-gray-500">Reintentos ante un fallo de Meta</span>
                            <input
                                type="number" min={1} value={settings.maxSendAttempts}
                                onChange={e => setSettings({ ...settings, maxSendAttempts: Number(e.target.value) })}
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="text-gray-500">Exigen consentimiento explícito</span>
                            <input
                                value={(settings.requireExplicitConsentFor || []).join(', ')}
                                onChange={e => setSettings({
                                    ...settings,
                                    requireExplicitConsentFor: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
                                })}
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                placeholder="MARKETING"
                            />
                        </label>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                        {(['admin', 'training', 'renewal'] as const).map(k => (
                            <label key={k} className="text-sm">
                                <span className="text-gray-500">
                                    Enlace {k === 'admin' ? 'al panel' : k === 'training' ? 'para agendar' : 'de renovación'}
                                </span>
                                <input
                                    value={settings.links?.[k] || ''}
                                    onChange={e => setSettings({ ...settings, links: { ...(settings.links || {}), [k]: e.target.value } })}
                                    placeholder="https://…"
                                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                />
                            </label>
                        ))}
                    </div>
                    <p className="text-xs text-gray-400">
                        Un recorrido no envía si alguna de sus variables queda sin resolver: es preferible una alerta interna
                        a un mensaje con huecos.
                    </p>

                    <button onClick={saveSettings} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold">
                        Guardar guardias
                    </button>

                    <div className="border-t pt-4">
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                            <ShieldBan className="w-4 h-4" /> Lista de exclusión global ({suppressions.length})
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                            Vive aparte del contacto a propósito: la baja sobrevive a que el contacto se borre y se vuelva a crear.
                        </p>
                        <div className="flex gap-2 mt-2">
                            <input
                                value={newSuppression}
                                onChange={e => setNewSuppression(e.target.value)}
                                placeholder="+57 300 000 0000"
                                className="border rounded-lg px-3 py-1.5 text-sm flex-1"
                            />
                            <button onClick={addSuppression} className="px-3 py-1.5 border rounded-lg text-sm flex items-center gap-1 hover:bg-gray-50">
                                <Plus className="w-3.5 h-3.5" /> Excluir
                            </button>
                        </div>
                        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                            {suppressions.map(s => (
                                <div key={s.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1.5">
                                    <span className="flex items-center gap-2">
                                        <Ban className="w-3 h-3 text-red-500" />
                                        <code>{s.phone}</code>
                                        <span className="text-gray-400">{s.reason}</span>
                                    </span>
                                    <button onClick={() => removeSuppression(s.phone)} className="text-gray-400 hover:text-red-600">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            {!suppressions.length && <p className="text-xs text-gray-400 py-2">Nadie excluido todavía.</p>}
                        </div>
                    </div>
                </div>
            )}

            {alerts.length > 0 && (
                <div className="space-y-2">
                    <h3 className="font-semibold text-gray-900 text-sm">Alertas internas ({alerts.length})</h3>
                    {alerts.slice(0, 8).map(a => (
                        <div key={a.id} className={`border rounded-xl px-3 py-2 flex items-start justify-between gap-3 ${SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info}`}>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">{a.title}</p>
                                {a.detail && <p className="text-xs mt-0.5 opacity-80">{a.detail}</p>}
                            </div>
                            <button onClick={() => resolveAlert(a.id)} className="text-xs px-2 py-1 bg-white/70 rounded-lg shrink-0 hover:bg-white">
                                Resolver
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setFilter('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${!filter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}
                >Todos</button>
                {counts.filter(c => c.n > 0).map(c => (
                    <button
                        key={c.state}
                        onClick={() => setFilter(c.state === filter ? '' : c.state)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            filter === c.state
                                ? 'bg-gray-900 text-white border-gray-900'
                                : GROUP_STYLE[stateByKey[c.state]?.group] || 'bg-white text-gray-600'
                        }`}
                    >{c.label} · {c.n}</button>
                ))}
            </div>

            <div className="bg-white border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs">
                            <tr>
                                <th className="text-left px-4 py-2 font-semibold">Sitio</th>
                                <th className="text-left px-4 py-2 font-semibold">Estado</th>
                                <th className="text-left px-4 py-2 font-semibold">Desde</th>
                                <th className="text-left px-4 py-2 font-semibold">Contactos</th>
                                <th className="text-left px-4 py-2 font-semibold">Fijar a mano</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {sites.map(s => (
                                <tr key={s.siteId} className="hover:bg-gray-50">
                                    <td className="px-4 py-2">
                                        <p className="font-medium text-gray-900">{s.siteName || s.siteId.slice(0, 8)}</p>
                                        <p className="text-[11px] text-gray-400">{s.siteType === 'district' ? 'Distrito' : 'Club'}</p>
                                    </td>
                                    <td className="px-4 py-2">
                                        <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${GROUP_STYLE[stateByKey[s.state]?.group] || 'bg-gray-100'}`}>
                                            {stateByKey[s.state]?.label || s.state}
                                        </span>
                                        {s.manualState && (
                                            <span className="ml-1 text-[10px] text-purple-600 font-semibold">fijado</span>
                                        )}
                                        {s.reason && <p className="text-[11px] text-gray-400 mt-0.5">{s.reason}</p>}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(s.since).toLocaleDateString('es-CO')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-xs text-gray-600">
                                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {s.contactCount}</span>
                                    </td>
                                    <td className="px-4 py-2">
                                        <select
                                            value={s.manualState || ''}
                                            onChange={e => setManual(s, e.target.value)}
                                            className="border rounded-lg px-2 py-1 text-xs"
                                        >
                                            <option value="">Lo decide el sistema</option>
                                            {states.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!sites.length && (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Todavía no se observó ningún sitio. Pulsá «Recalcular».
                    </div>
                )}
            </div>
        </div>
    );
}
