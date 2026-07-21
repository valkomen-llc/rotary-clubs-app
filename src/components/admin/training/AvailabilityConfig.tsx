import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Loader2, Plus, Trash2, Save, Clock, CalendarOff, UserCog, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

const AvailabilityConfig: React.FC = () => {
    const { token } = useAuth();
    const H = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
    const [loading, setLoading] = useState(true);
    const [cfg, setCfg] = useState<any>(null);
    const [providers, setProviders] = useState<any[]>([]);
    const [blocks, setBlocks] = useState<any[]>([]);
    const [blackouts, setBlackouts] = useState<any[]>([]);
    const [responsibles, setResponsibles] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [c, b, bl, r] = await Promise.all([
                fetch(`${API}/training/admin/config`, { headers: H }).then(r => r.json()),
                fetch(`${API}/training/admin/blocks`, { headers: H }).then(r => r.json()),
                fetch(`${API}/training/admin/blackouts`, { headers: H }).then(r => r.json()),
                fetch(`${API}/training/admin/responsibles`, { headers: H }).then(r => r.json()),
            ]);
            setCfg(c.config); setProviders(c.providers || []);
            setBlocks(b.blocks || []); setBlackouts(bl.blackouts || []); setResponsibles(r.responsibles || []);
        } catch { toast.error('Error al cargar configuración'); } finally { setLoading(false); }
    };
    useEffect(() => { loadAll(); }, [H]);

    const saveConfig = async () => {
        setSaving(true);
        const res = await fetch(`${API}/training/admin/config`, { method: 'PUT', headers: H, body: JSON.stringify(cfg) });
        setSaving(false);
        if (res.ok) toast.success('Configuración guardada'); else toast.error('No se pudo guardar');
    };

    const addBlock = async () => {
        const res = await fetch(`${API}/training/admin/blocks`, { method: 'POST', headers: H, body: JSON.stringify({ kind: 'recurring', weekday: 2, startMinute: 540, endMinute: 720 }) });
        if (res.ok) { const { block } = await res.json(); setBlocks(b => [...b, block]); } else toast.error('Error');
    };
    const updBlock = async (id: string, patch: any) => {
        setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b));
        await fetch(`${API}/training/admin/blocks/${id}`, { method: 'PUT', headers: H, body: JSON.stringify(patch) });
    };
    const delBlock = async (id: string) => { await fetch(`${API}/training/admin/blocks/${id}`, { method: 'DELETE', headers: H }); setBlocks(b => b.filter(x => x.id !== id)); };

    const addBlackout = async () => {
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch(`${API}/training/admin/blackouts`, { method: 'POST', headers: H, body: JSON.stringify({ startDate: today, endDate: today, reason: '' }) });
        if (res.ok) { const { blackout } = await res.json(); setBlackouts(b => [...b, blackout]); }
    };
    const delBlackout = async (id: string) => { await fetch(`${API}/training/admin/blackouts/${id}`, { method: 'DELETE', headers: H }); setBlackouts(b => b.filter(x => x.id !== id)); };

    const addResponsible = async () => {
        const name = prompt('Nombre del responsable:'); if (!name) return;
        const email = prompt('Correo (opcional):') || '';
        const res = await fetch(`${API}/training/admin/responsibles`, { method: 'POST', headers: H, body: JSON.stringify({ name, email }) });
        if (res.ok) { const { responsible } = await res.json(); setResponsibles(r => [...r, responsible]); }
    };
    const delResponsible = async (id: string) => { await fetch(`${API}/training/admin/responsibles/${id}`, { method: 'DELETE', headers: H }); setResponsibles(r => r.filter(x => x.id !== id)); };

    if (loading || !cfg) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

    const numField = (key: string, label: string, suffix?: string) => (
        <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">{label}</label>
            <div className="flex items-center gap-1">
                <input type="number" value={cfg[key]} onChange={e => setCfg((c: any) => ({ ...c, [key]: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Config general */}
            <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-black text-gray-900 flex items-center gap-2 mb-4"><Settings2 className="w-5 h-5 text-indigo-600" />Reglas generales</h3>
                <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Zona horaria (IANA)</label>
                        <input value={cfg.timezone} onChange={e => setCfg((c: any) => ({ ...c, timezone: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                    </div>
                    {numField('slotDurationMin', 'Duración sesión', 'min')}
                    {numField('bufferMin', 'Descanso entre citas', 'min')}
                    {numField('maxPerDay', 'Cupos máx./día')}
                    {numField('minNoticeHours', 'Antelación mínima', 'h')}
                    {numField('cancelWindowHours', 'Ventana cancelación', 'h')}
                    {numField('leadDays', 'Horizonte reserva', 'días')}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Videoconferencia</label>
                        <select value={cfg.meetingProvider} onChange={e => setCfg((c: any) => ({ ...c, meetingProvider: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                            {providers.map(p => <option key={p.key} value={p.key} disabled={!p.available}>{p.label}{!p.available ? ' (sin credenciales)' : ''}</option>)}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <input type="checkbox" checked={cfg.active} onChange={e => setCfg((c: any) => ({ ...c, active: e.target.checked }))} />
                            Módulo activo
                        </label>
                    </div>
                </div>
                <button onClick={saveConfig} disabled={saving} className="mt-4 inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-60">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar reglas
                </button>
            </section>

            {/* Bloques */}
            <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-gray-900 flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-600" />Bloques de disponibilidad</h3>
                    <button onClick={addBlock} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-sm font-bold"><Plus className="w-4 h-4" />Agregar</button>
                </div>
                {blocks.length === 0 ? <p className="text-sm text-gray-400 py-4">Sin bloques. Agrega, p. ej., Martes y Jueves 9:00–12:00.</p> : (
                    <div className="space-y-2">
                        {blocks.map(b => (
                            <div key={b.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-gray-50">
                                <select value={b.kind} onChange={e => updBlock(b.id, { kind: e.target.value })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm">
                                    <option value="recurring">Semanal</option>
                                    <option value="specific">Fecha específica</option>
                                </select>
                                {b.kind === 'recurring' ? (
                                    <select value={b.weekday ?? 2} onChange={e => updBlock(b.id, { weekday: Number(e.target.value) })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm">
                                        {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
                                    </select>
                                ) : (
                                    <input type="date" defaultValue={b.date?.slice(0, 10)} onChange={e => updBlock(b.id, { date: e.target.value })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" />
                                )}
                                <input type="time" defaultValue={minToTime(b.startMinute)} onChange={e => updBlock(b.id, { startMinute: timeToMin(e.target.value) })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" />
                                <span className="text-gray-400">–</span>
                                <input type="time" defaultValue={minToTime(b.endMinute)} onChange={e => updBlock(b.id, { endMinute: timeToMin(e.target.value) })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" />
                                <select value={b.responsibleId || ''} onChange={e => updBlock(b.id, { responsibleId: e.target.value || null })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm">
                                    <option value="">Cualquier responsable</option>
                                    {responsibles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                                <button onClick={() => delBlock(b.id)} className="ml-auto p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Blackouts */}
                <section className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-gray-900 flex items-center gap-2"><CalendarOff className="w-5 h-5 text-red-500" />Fechas bloqueadas / vacaciones</h3>
                        <button onClick={addBlackout} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm font-bold"><Plus className="w-4 h-4" />Agregar</button>
                    </div>
                    {blackouts.length === 0 ? <p className="text-sm text-gray-400 py-2">Sin fechas bloqueadas.</p> : (
                        <div className="space-y-2">
                            {blackouts.map(b => (
                                <div key={b.id} className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-700">{b.startDate?.slice(0, 10)} → {b.endDate?.slice(0, 10)}</span>
                                    <span className="text-gray-400 flex-1 truncate">{b.reason}</span>
                                    <button onClick={() => delBlackout(b.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Responsables */}
                <section className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-gray-900 flex items-center gap-2"><UserCog className="w-5 h-5 text-indigo-600" />Responsables</h3>
                        <button onClick={addResponsible} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-sm font-bold"><Plus className="w-4 h-4" />Agregar</button>
                    </div>
                    {responsibles.length === 0 ? <p className="text-sm text-gray-400 py-2">Sin responsables asignados.</p> : (
                        <div className="space-y-2">
                            {responsibles.map(r => (
                                <div key={r.id} className="flex items-center gap-2 text-sm">
                                    <span className="font-semibold text-gray-800">{r.name}</span>
                                    <span className="text-gray-400 flex-1 truncate">{r.email}</span>
                                    <button onClick={() => delResponsible(r.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default AvailabilityConfig;
