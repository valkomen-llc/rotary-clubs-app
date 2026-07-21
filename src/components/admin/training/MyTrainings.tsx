import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
    Calendar, Clock, Video, Loader2, XCircle, FileText, Star, Download, MessageSquarePlus
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const STATUS_META: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
    confirmed: { label: 'Confirmada', cls: 'bg-emerald-100 text-emerald-700' },
    completed: { label: 'Completada', cls: 'bg-blue-100 text-blue-700' },
    cancelled: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500' },
    rescheduled: { label: 'Reprogramada', cls: 'bg-indigo-100 text-indigo-700' },
    no_show: { label: 'No asistió', cls: 'bg-red-100 text-red-700' },
    follow_up: { label: 'Requiere seguimiento', cls: 'bg-purple-100 text-purple-700' },
};

const fmt = (iso: string) =>
    new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: USER_TZ }).format(new Date(iso));

const MyTrainings: React.FC<{ reloadKey?: number }> = ({ reloadKey }) => {
    const { token } = useAuth();
    const [appts, setAppts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [surveyFor, setSurveyFor] = useState<any>(null);
    const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/training/appointments/mine`, { headers: authHeaders });
            if (res.ok) setAppts((await res.json()).appointments || []);
        } catch { /* noop */ } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [authHeaders, reloadKey]);

    const cancel = async (id: string) => {
        if (!confirm('¿Cancelar esta capacitación? Se liberará el horario.')) return;
        const res = await fetch(`${API}/training/appointments/${id}/cancel`, { method: 'POST', headers: authHeaders, body: '{}' });
        const data = await res.json();
        if (res.ok) { toast.success('Reserva cancelada'); load(); }
        else toast.error(data.message || 'No se pudo cancelar');
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
    if (appts.length === 0) return <p className="text-center text-gray-400 text-sm py-16">Aún no tienes capacitaciones agendadas.</p>;

    const upcoming = appts.filter(a => new Date(a.startAt) >= new Date() && !['cancelled'].includes(a.status));
    const past = appts.filter(a => !upcoming.includes(a));

    const Card = (a: any) => {
        const st = STATUS_META[a.status] || STATUS_META.pending;
        const isUpcoming = new Date(a.startAt) >= new Date() && a.status !== 'cancelled';
        return (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: (a.appointmentType?.color || '#2563eb') + '22' }}>
                    <Calendar className="w-5 h-5" style={{ color: a.appointmentType?.color || '#2563eb' }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{a.appointmentType?.name || 'Sesión de soporte'}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                        <span className="flex items-center gap-1 capitalize"><Clock className="w-3 h-3" />{fmt(a.startAt)}</span>
                        {a.responsible?.name && <span>· {a.responsible.name}</span>}
                        {a.meetingUrl && <a href={a.meetingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 font-semibold"><Video className="w-3 h-3" />Enlace</a>}
                    </div>
                    {a.materials?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {a.materials.map((m: any) => (
                                <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                                    <FileText className="w-3 h-3" />{m.label}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <a href={`${API}/training/appointments/${a.id}/ics?token=${token}`} title="Descargar .ics" className="p-2 rounded-lg text-gray-400 hover:bg-gray-50"><Download className="w-4 h-4" /></a>
                    {isUpcoming && (
                        <button onClick={() => cancel(a.id)} title="Cancelar" className="p-2 rounded-lg text-red-400 hover:bg-red-50"><XCircle className="w-4 h-4" /></button>
                    )}
                    {(a.status === 'completed' || a.status === 'follow_up') && !a.survey && (
                        <button onClick={() => setSurveyFor(a)} title="Calificar" className="p-2 rounded-lg text-amber-500 hover:bg-amber-50"><MessageSquarePlus className="w-4 h-4" /></button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {upcoming.length > 0 && (
                <div>
                    <h4 className="text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Próximas</h4>
                    <div className="space-y-2">{upcoming.map(Card)}</div>
                </div>
            )}
            {past.length > 0 && (
                <div>
                    <h4 className="text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Historial</h4>
                    <div className="space-y-2">{past.map(Card)}</div>
                </div>
            )}
            {surveyFor && <SurveyModal appt={surveyFor} token={token!} onClose={() => setSurveyFor(null)} onDone={() => { setSurveyFor(null); load(); }} />}
        </div>
    );
};

const SurveyModal: React.FC<{ appt: any; token: string; onClose: () => void; onDone: () => void }> = ({ appt, token, onClose, onDone }) => {
    const [scores, setScores] = useState<Record<string, number>>({ satisfaction: 0, usefulness: 0, clarity: 0, attention: 0 });
    const [comments, setComments] = useState('');
    const [needsFollowUp, setNeedsFollowUp] = useState(false);
    const [saving, setSaving] = useState(false);
    const fields = [
        { k: 'satisfaction', label: 'Satisfacción general' },
        { k: 'usefulness', label: 'Utilidad' },
        { k: 'clarity', label: 'Claridad' },
        { k: 'attention', label: 'Atención recibida' },
    ];
    const save = async () => {
        setSaving(true);
        const res = await fetch(`${API}/training/appointments/${appt.id}/survey`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...scores, comments, needsFollowUp }),
        });
        setSaving(false);
        if (res.ok) { toast.success('¡Gracias por tu opinión!'); onDone(); } else toast.error('No se pudo guardar');
    };
    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-3xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-black text-gray-900 mb-4">¿Cómo estuvo tu capacitación?</h3>
                <div className="space-y-4">
                    {fields.map(f => (
                        <div key={f.k}>
                            <div className="text-sm font-semibold text-gray-700 mb-1">{f.label}</div>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => setScores(s => ({ ...s, [f.k]: n }))}>
                                        <Star className={`w-6 h-6 ${n <= scores[f.k] ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    <textarea placeholder="Comentarios (opcional)" value={comments} onChange={e => setComments(e.target.value)} rows={2}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                        <input type="checkbox" checked={needsFollowUp} onChange={e => setNeedsFollowUp(e.target.checked)} />
                        Necesito seguimiento adicional
                    </label>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-500 font-semibold">Cancelar</button>
                    <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60">{saving ? 'Guardando…' : 'Enviar'}</button>
                </div>
            </div>
        </div>
    );
};

export default MyTrainings;
