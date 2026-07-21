import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
    Loader2, ChevronLeft, ChevronRight, Filter, X, Plus, Trash2, Video, Save,
    CalendarDays, List as ListIcon, Columns, Square
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show', 'follow_up'];
const STATUS_LABEL: Record<string, string> = {
    pending: 'Pendiente', confirmed: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada',
    rescheduled: 'Reprogramada', no_show: 'No asistió', follow_up: 'Seguimiento',
};
const STATUS_CLS: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-emerald-100 text-emerald-700', completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-gray-100 text-gray-500', rescheduled: 'bg-indigo-100 text-indigo-700', no_show: 'bg-red-100 text-red-700', follow_up: 'bg-purple-100 text-purple-700',
};
type View = 'month' | 'week' | 'day' | 'list';
const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtTime = (iso: string) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const AdminBookingsCalendar: React.FC = () => {
    const { token } = useAuth();
    const H = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
    const [view, setView] = useState<View>('month');
    const [anchor, setAnchor] = useState(new Date());
    const [appts, setAppts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<{ status: string; responsibleId: string; typeId: string; modality: string }>({ status: '', responsibleId: '', typeId: '', modality: '' });
    const [types, setTypes] = useState<any[]>([]);
    const [responsibles, setResponsibles] = useState<any[]>([]);
    const [selected, setSelected] = useState<any>(null);

    // Rango [from,to] según la vista.
    const range = useMemo(() => {
        if (view === 'day') return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1) };
        if (view === 'week') { const s = addDays(startOfDay(anchor), -anchor.getDay()); return { from: s, to: addDays(s, 7) }; }
        if (view === 'month') { const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1); return { from: s, to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) }; }
        return { from: addDays(startOfDay(anchor), -30), to: addDays(startOfDay(anchor), 90) };
    }, [view, anchor]);

    const load = useCallback(async () => {
        setLoading(true);
        const qs = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
        Object.entries(filters).forEach(([k, v]) => v && qs.append(k, v));
        try {
            const res = await fetch(`${API}/training/admin/appointments?${qs}`, { headers: H });
            if (res.ok) setAppts((await res.json()).appointments || []);
        } catch { toast.error('Error al cargar'); } finally { setLoading(false); }
    }, [H, range, filters]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        (async () => {
            const [t, r] = await Promise.all([
                fetch(`${API}/training/types`, { headers: H }).then(r => r.json()),
                fetch(`${API}/training/admin/responsibles`, { headers: H }).then(r => r.json()),
            ]);
            setTypes(t.types || []); setResponsibles(r.responsibles || []);
        })();
    }, [H]);

    const nav = (dir: number) => {
        if (view === 'day') setAnchor(a => addDays(a, dir));
        else if (view === 'week') setAnchor(a => addDays(a, dir * 7));
        else setAnchor(a => new Date(a.getFullYear(), a.getMonth() + dir, 1));
    };

    const title = useMemo(() => {
        if (view === 'day') return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(anchor);
        if (view === 'month') return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(anchor);
        if (view === 'week') { const s = addDays(startOfDay(anchor), -anchor.getDay()); return `${s.getDate()}/${s.getMonth() + 1} – ${addDays(s, 6).getDate()}/${addDays(s, 6).getMonth() + 1}`; }
        return 'Todas las reservas';
    }, [view, anchor]);

    const onUpdated = (updated: any) => { setAppts(as => as.map(a => a.id === updated.id ? updated : a)); setSelected(updated); };

    return (
        <div className="flex gap-4">
            <div className="flex-1 min-w-0">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        {([['month', CalendarDays], ['week', Columns], ['day', Square], ['list', ListIcon]] as [View, any][]).map(([v, Icon]) => (
                            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 ${view === v ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
                                <Icon className="w-4 h-4" />{{ month: 'Mes', week: 'Semana', day: 'Día', list: 'Lista' }[v]}
                            </button>
                        ))}
                    </div>
                    {view !== 'list' && (
                        <div className="flex items-center gap-1">
                            <button onClick={() => nav(-1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="font-black text-gray-900 capitalize min-w-[160px] text-center">{title}</span>
                            <button onClick={() => nav(1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
                            <button onClick={() => setAnchor(new Date())} className="text-xs font-bold text-indigo-600 px-2">Hoy</button>
                        </div>
                    )}
                    {/* Filtros */}
                    <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs">
                            <option value="">Estado</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        <select value={filters.typeId} onChange={e => setFilters(f => ({ ...f, typeId: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs">
                            <option value="">Tipo</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <select value={filters.responsibleId} onChange={e => setFilters(f => ({ ...f, responsibleId: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs">
                            <option value="">Responsable</option>{responsibles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                </div>

                {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div> : (
                    <>
                        {view === 'month' && <MonthGrid anchor={anchor} appts={appts} onSelect={setSelected} />}
                        {(view === 'week' || view === 'day' || view === 'list') && <AppointmentList view={view} anchor={anchor} appts={appts} onSelect={setSelected} />}
                    </>
                )}
            </div>

            {selected && <DetailDrawer appt={selected} responsibles={responsibles} H={H} onClose={() => setSelected(null)} onUpdated={onUpdated} onReload={load} />}
        </div>
    );
};

const MonthGrid: React.FC<{ anchor: Date; appts: any[]; onSelect: (a: any) => void }> = ({ anchor, appts, onSelect }) => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100">
                {WD.map(w => <div key={w} className="p-2 text-center text-[11px] font-black text-gray-400 uppercase">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                    const dayAppts = appts.filter(a => sameDay(new Date(a.startAt), d));
                    const inMonth = d.getMonth() === anchor.getMonth();
                    const isToday = sameDay(d, new Date());
                    return (
                        <div key={i} className={`min-h-[92px] border-r border-b border-gray-50 p-1.5 ${inMonth ? '' : 'bg-gray-50/50'}`}>
                            <div className={`text-xs font-bold mb-1 ${isToday ? 'text-indigo-600' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>{d.getDate()}</div>
                            <div className="space-y-1">
                                {dayAppts.slice(0, 3).map(a => (
                                    <button key={a.id} onClick={() => onSelect(a)} className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate font-semibold text-white" style={{ background: a.appointmentType?.color || '#2563eb' }}>
                                        {fmtTime(a.startAt)} {a.club?.name || a.organizationName || a.appointmentType?.name || ''}
                                    </button>
                                ))}
                                {dayAppts.length > 3 && <div className="text-[10px] text-gray-400 font-semibold">+{dayAppts.length - 3} más</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const AppointmentList: React.FC<{ view: View; anchor: Date; appts: any[]; onSelect: (a: any) => void }> = ({ appts, onSelect }) => {
    const sorted = [...appts].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    if (sorted.length === 0) return <p className="text-center text-gray-400 text-sm py-16">Sin reservas en este rango.</p>;
    return (
        <div className="space-y-2">
            {sorted.map(a => (
                <button key={a.id} onClick={() => onSelect(a)} className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:border-indigo-200">
                    <div className="text-center shrink-0 w-14">
                        <div className="text-[11px] font-bold text-gray-400 uppercase">{new Intl.DateTimeFormat('es', { weekday: 'short' }).format(new Date(a.startAt))}</div>
                        <div className="text-lg font-black text-gray-900">{new Date(a.startAt).getDate()}</div>
                        <div className="text-[10px] text-gray-400">{fmtTime(a.startAt)}</div>
                    </div>
                    <span className="w-1 h-10 rounded-full" style={{ background: a.appointmentType?.color || '#2563eb' }} />
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 truncate">{a.appointmentType?.name || 'Sesión'} · {a.club?.name || a.organizationName || 'Sitio'}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                            {a.responsible?.name && <span>{a.responsible.name}</span>}<span className="capitalize">{a.modality}</span>
                            {a.meetingUrl && <Video className="w-3 h-3 text-indigo-500" />}
                        </div>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${STATUS_CLS[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                </button>
            ))}
        </div>
    );
};

const DetailDrawer: React.FC<{ appt: any; responsibles: any[]; H: any; onClose: () => void; onUpdated: (a: any) => void; onReload: () => void }> = ({ appt, responsibles, H, onClose, onUpdated, onReload }) => {
    const [form, setForm] = useState({ status: appt.status, responsibleId: appt.responsibleId || '', meetingUrl: appt.meetingUrl || '', internalNotes: appt.internalNotes || '', agreements: appt.agreements || '' });
    const [saving, setSaving] = useState(false);
    const [material, setMaterial] = useState({ label: '', url: '', kind: 'document' });

    useEffect(() => { setForm({ status: appt.status, responsibleId: appt.responsibleId || '', meetingUrl: appt.meetingUrl || '', internalNotes: appt.internalNotes || '', agreements: appt.agreements || '' }); }, [appt.id]);

    const save = async () => {
        setSaving(true);
        const res = await fetch(`${API}/training/admin/appointments/${appt.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ ...form, responsibleId: form.responsibleId || null }) });
        setSaving(false);
        if (res.ok) { toast.success('Guardado'); onUpdated((await res.json()).appointment); } else toast.error('Error');
    };
    const addMaterial = async () => {
        if (!material.label || !material.url) return;
        const res = await fetch(`${API}/training/admin/appointments/${appt.id}/materials`, { method: 'POST', headers: H, body: JSON.stringify(material) });
        if (res.ok) { setMaterial({ label: '', url: '', kind: 'document' }); onReload(); toast.success('Material agregado'); }
    };
    const delMaterial = async (mid: string) => { await fetch(`${API}/training/admin/appointments/${appt.id}/materials/${mid}`, { method: 'DELETE', headers: H }); onReload(); };

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl border-l border-gray-100 z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between">
                <h3 className="font-black text-gray-900">Detalle de la cita</h3>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
                <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1">
                    <div className="font-black text-gray-900">{appt.appointmentType?.name || 'Sesión'}</div>
                    <div className="text-gray-500">{new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(appt.startAt))}</div>
                    <div className="text-gray-700 font-semibold">{appt.club?.name || appt.organizationName || 'Sitio'}</div>
                    {appt.requesterEmail && <div className="text-gray-400 text-xs">{appt.requesterEmail} · {appt.requesterPhone || 's/tel'}</div>}
                    {appt.reason && <div className="text-gray-500 text-xs pt-1 border-t border-gray-100 mt-1">"{appt.reason}"</div>}
                    {Array.isArray(appt.participants) && appt.participants.length > 0 && (
                        <div className="text-gray-400 text-xs pt-1">{appt.participants.length} participante(s)</div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-semibold text-gray-500">Estado</label>
                        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500">Responsable</label>
                        <select value={form.responsibleId} onChange={e => setForm(f => ({ ...f, responsibleId: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                            <option value="">Sin asignar</option>{responsibles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-500">Enlace de videoconferencia</label>
                    <input value={form.meetingUrl} onChange={e => setForm(f => ({ ...f, meetingUrl: e.target.value }))} placeholder="https://…" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-500">Notas internas</label>
                    <textarea value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-500">Acuerdos / próximos pasos</label>
                    <textarea value={form.agreements} onChange={e => setForm(f => ({ ...f, agreements: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
                </div>
                <button onClick={save} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar cambios
                </button>

                {/* Materiales */}
                <div className="pt-3 border-t border-gray-100">
                    <div className="text-sm font-black text-gray-900 mb-2">Materiales entregados</div>
                    <div className="space-y-1.5 mb-2">
                        {(appt.materials || []).map((m: any) => (
                            <div key={m.id} className="flex items-center gap-2 text-sm">
                                <a href={m.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-indigo-600">{m.label}</a>
                                <button onClick={() => delMaterial(m.id)} className="p-1 text-red-400 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-1.5">
                        <input placeholder="Nombre" value={material.label} onChange={e => setMaterial(m => ({ ...m, label: e.target.value }))} className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs" />
                        <input placeholder="URL" value={material.url} onChange={e => setMaterial(m => ({ ...m, url: e.target.value }))} className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs" />
                        <button onClick={addMaterial} className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600"><Plus className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminBookingsCalendar;
