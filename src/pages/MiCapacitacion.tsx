import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
    Loader2, CheckCircle2, XCircle, Video, Clock, CalendarClock, Download,
    CalendarPlus, RefreshCw, AlertTriangle
} from 'lucide-react';
import { useLang } from '../contexts/LanguageContext';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const PLATFORM_LOGO = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/platform/logo/1776225800089-Club_Platform_for_Rotary.png';

const STATUS_META: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
    confirmed: { label: 'Confirmada', cls: 'bg-emerald-100 text-emerald-700' },
    completed: { label: 'Completada', cls: 'bg-blue-100 text-blue-700' },
    cancelled: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500' },
    rescheduled: { label: 'Reprogramada', cls: 'bg-indigo-100 text-indigo-700' },
    no_show: { label: 'No asistió', cls: 'bg-red-100 text-red-700' },
    follow_up: { label: 'Seguimiento', cls: 'bg-purple-100 text-purple-700' },
};
const fmtDay = (iso: string) => new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: USER_TZ }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: USER_TZ }).format(new Date(iso));

interface DaySlots { dateKey: string; slots: { startAt: string; endAt: string }[]; }

const MiCapacitacion: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const { lang, setLang } = useLang();
    const [loading, setLoading] = useState(true);
    const [appt, setAppt] = useState<any>(null);
    const [cancelWindow, setCancelWindow] = useState(12);
    const [notFound, setNotFound] = useState(false);
    const [busy, setBusy] = useState(false);
    const [links, setLinks] = useState<{ google?: string; outlook?: string }>({});
    const [rescheduling, setRescheduling] = useState(false);
    const [days, setDays] = useState<DaySlots[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [msg, setMsg] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/public/training/appointments/${token}`);
            if (r.status === 404) { setNotFound(true); return; }
            const d = await r.json();
            setAppt(d.appointment); setCancelWindow(d.cancelWindowHours ?? 12);
            fetch(`${API}/public/training/appointments/${token}/calendar-links`).then(x => x.json()).then(setLinks).catch(() => {});
        } catch { setNotFound(true); } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [token]);

    const canModify = appt && !['cancelled', 'completed'].includes(appt.status)
        && (new Date(appt.startAt).getTime() - Date.now()) / 3600000 >= cancelWindow;

    const cancel = async () => {
        if (!confirm('¿Cancelar esta capacitación? Se liberará el horario.')) return;
        setBusy(true); setMsg('');
        const r = await fetch(`${API}/public/training/appointments/${token}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const d = await r.json();
        setBusy(false);
        if (r.ok) { setAppt(d.appointment); } else setMsg(d.message || 'No se pudo cancelar');
    };

    const openReschedule = async () => {
        setRescheduling(true); setLoadingSlots(true);
        try {
            const q = appt.appointmentType?.durationMin ? `?durationMin=${appt.appointmentType.durationMin}` : '';
            const r = await fetch(`${API}/public/training/slots${q}`);
            const d = await r.json();
            setDays(d.days || []);
        } catch { /* noop */ } finally { setLoadingSlots(false); }
    };

    const doReschedule = async (startAt: string) => {
        setBusy(true); setMsg('');
        const r = await fetch(`${API}/public/training/appointments/${token}/reschedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startAt }) });
        const d = await r.json();
        setBusy(false);
        if (r.ok) { setAppt(d.appointment); setRescheduling(false); } else setMsg(d.message || 'No se pudo reprogramar');
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-indigo-50/40">
            <header className="bg-white border-b border-gray-100">
                <div className="w-full px-4 md:px-10 py-4 flex items-center gap-3">
                    <img src={PLATFORM_LOGO} alt="Club Platform" className="h-9 w-auto" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                    <div className="border-l border-gray-200 pl-3 font-black text-gray-900 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-indigo-600" />Mi capacitación</div>
                    <div className="ml-auto flex items-center gap-1" data-no-translate>
                        {['es', 'en'].map((code) => (
                            <button key={code} onClick={() => setLang(code)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase transition ${lang === code ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                {code === 'es' ? 'ES' : 'EN'}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="max-w-xl mx-auto px-4 py-10">
                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
                ) : notFound ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
                        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                        <p className="text-gray-600 font-semibold">No encontramos esta cita.</p>
                        <p className="text-gray-400 text-sm">El enlace puede ser inválido o haber expirado.</p>
                    </div>
                ) : appt && (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-6" style={{ background: `linear-gradient(135deg, ${appt.appointmentType?.color || '#2563eb'}, #1e3a8a)` }}>
                            <div className="flex items-center justify-between">
                                <span className="text-white/80 text-xs font-bold uppercase tracking-wide">{appt.appointmentType?.name || 'Sesión de soporte'}</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${STATUS_META[appt.status]?.cls}`}>{STATUS_META[appt.status]?.label}</span>
                            </div>
                            <div className="text-white text-xl font-black mt-2 capitalize">{fmtDay(appt.startAt)}</div>
                            <div className="text-white/90 font-semibold flex items-center gap-1"><Clock className="w-4 h-4" />{fmtTime(appt.startAt)} – {fmtTime(appt.endAt)} <span className="text-white/60 text-xs">({USER_TZ})</span></div>
                        </div>

                        <div className="p-6 space-y-3 text-sm">
                            <Row label="Organización" value={appt.organizationName} />
                            <Row label="A nombre de" value={appt.requesterName} />
                            {appt.responsible?.name && <Row label="Responsable" value={appt.responsible.name} />}
                            <Row label="Modalidad" value={appt.modality} />
                            {appt.meetingUrl && (
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-gray-400 font-medium">Enlace</span>
                                    <a href={appt.meetingUrl} target="_blank" rel="noreferrer" className="text-indigo-600 font-semibold flex items-center gap-1"><Video className="w-4 h-4" />Unirse</a>
                                </div>
                            )}

                            {appt.materials?.length > 0 && (
                                <div className="pt-2 border-t border-gray-50">
                                    <div className="text-xs font-black text-gray-500 uppercase mb-1">Materiales</div>
                                    {appt.materials.map((m: any, i: number) => (
                                        <a key={i} href={m.url} target="_blank" rel="noreferrer" className="block text-sm text-indigo-600 py-0.5">{m.label}</a>
                                    ))}
                                </div>
                            )}

                            {/* Acciones de calendario */}
                            <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-50">
                                {links.google && <a href={links.google} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold"><CalendarPlus className="w-3.5 h-3.5" />Google</a>}
                                {links.outlook && <a href={links.outlook} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold"><CalendarPlus className="w-3.5 h-3.5" />Outlook</a>}
                                <a href={`${API}/public/training/appointments/${token}/ics`} className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 font-semibold"><Download className="w-3.5 h-3.5" />.ics</a>
                            </div>

                            {msg && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{msg}</div>}

                            {/* Gestión */}
                            {canModify ? (
                                rescheduling ? (
                                    <div className="pt-3 border-t border-gray-50">
                                        <div className="text-sm font-black text-gray-700 mb-2">Elige un nuevo horario</div>
                                        {loadingSlots ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
                                            : days.length === 0 ? <p className="text-gray-400 text-sm py-4">No hay horarios disponibles.</p> : (
                                                <div className="space-y-3 max-h-56 overflow-y-auto">
                                                    {days.map(d => (
                                                        <div key={d.dateKey}>
                                                            <div className="text-[11px] font-black text-gray-500 uppercase mb-1 capitalize">{fmtDay(d.slots[0].startAt)}</div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {d.slots.map(s => (
                                                                    <button key={s.startAt} disabled={busy} onClick={() => doReschedule(s.startAt)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 hover:border-indigo-400 hover:text-indigo-600">{fmtTime(s.startAt)}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        <button onClick={() => setRescheduling(false)} className="mt-2 text-xs font-semibold text-gray-500">Cancelar</button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2 pt-3 border-t border-gray-50">
                                        <button onClick={openReschedule} disabled={busy} className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-sm"><RefreshCw className="w-4 h-4" />Reprogramar</button>
                                        <button onClick={cancel} disabled={busy} className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 font-bold text-sm"><XCircle className="w-4 h-4" />Cancelar</button>
                                    </div>
                                )
                            ) : appt.status === 'cancelled' ? (
                                <div className="pt-3 text-center text-gray-400 text-sm">Esta cita fue cancelada.</div>
                            ) : ['completed'].includes(appt.status) ? (
                                <div className="pt-3 text-center text-emerald-600 text-sm font-semibold flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" />Sesión completada</div>
                            ) : (
                                <div className="pt-3 text-center text-gray-400 text-xs">Para cambios con menos de {cancelWindow}h de anticipación, contacta a soporte.</div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
    <div className="flex justify-between items-center py-1.5"><span className="text-gray-400 font-medium">{label}</span><span className="text-gray-900 font-bold text-right capitalize">{value || '—'}</span></div>
);

export default MiCapacitacion;
