import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useClub } from '../../../contexts/ClubContext';
import {
    Clock, CheckCircle2, ChevronRight, ChevronLeft, Loader2,
    Users, Video, ShieldAlert, CreditCard, Sparkles, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

// Zona horaria del navegador del usuario (requisito: respetar su tz).
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface ApptType {
    id: string; name: string; description?: string; durationMin: number;
    modality: string; prerequisites?: string; price?: number | null; currency?: string;
    color?: string; responsible?: { name: string } | null;
}
interface Slot { startAt: string; endAt: string; responsibleId?: string | null; }
interface DaySlots { dateKey: string; slots: Slot[]; }

const STEPS = ['Sitio', 'Tipo', 'Fecha y hora', 'Participantes', 'Confirmar'];

const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: USER_TZ }).format(new Date(iso));
const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: USER_TZ }).format(new Date(iso));

const BookingWizard: React.FC<{ onBooked?: () => void }> = ({ onBooked }) => {
    const { token, user } = useAuth();
    const { club } = useClub();

    const [step, setStep] = useState(0);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [siteActive, setSiteActive] = useState<boolean | null>(null);
    const [siteInfo, setSiteInfo] = useState<any>(null);
    const [statusReason, setStatusReason] = useState<string>('');
    const [activating, setActivating] = useState(false);

    const [types, setTypes] = useState<ApptType[]>([]);
    const [selectedType, setSelectedType] = useState<ApptType | null>(null);
    const [days, setDays] = useState<DaySlots[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [participants, setParticipants] = useState<{ name: string; email: string }[]>([{ name: '', email: '' }]);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState<any>(null);

    const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    // 1. Validar estado del sitio + cargar tipos.
    useEffect(() => {
        (async () => {
            setLoadingStatus(true);
            try {
                const [sRes, tRes] = await Promise.all([
                    fetch(`${API}/training/site-status`, { headers: authHeaders }),
                    fetch(`${API}/training/types`, { headers: authHeaders }),
                ]);
                if (sRes.ok) {
                    const s = await sRes.json();
                    setSiteActive(s.active);
                    setSiteInfo(s.site);
                    setStatusReason(s.reason);
                }
                if (tRes.ok) setTypes((await tRes.json()).types || []);
            } catch {
                toast.error('No se pudo cargar la agenda');
            } finally {
                setLoadingStatus(false);
            }
        })();
    }, [authHeaders]);

    // Prefill participante 1 con el usuario.
    useEffect(() => {
        if (user) setParticipants([{ name: (user as any).name || '', email: user.email || '' }]);
    }, [user]);

    const loadSlots = async (type: ApptType) => {
        setLoadingSlots(true);
        setDays([]);
        try {
            const res = await fetch(`${API}/training/slots?typeId=${type.id}`, { headers: authHeaders });
            if (res.ok) setDays((await res.json()).days || []);
        } catch {
            toast.error('No se pudieron cargar los horarios');
        } finally {
            setLoadingSlots(false);
        }
    };

    const startActivation = async () => {
        setActivating(true);
        try {
            const res = await fetch(`${API}/training/activation-checkout`, { method: 'POST', headers: authHeaders, body: JSON.stringify({}) });
            const data = await res.json();
            if (res.ok && data.url) { window.location.href = data.url; return; }
            toast.error(data.error || 'No se pudo iniciar la activación');
        } catch {
            toast.error('Error al iniciar el pago');
        } finally {
            setActivating(false);
        }
    };

    const submit = async () => {
        if (!selectedSlot) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${API}/training/appointments`, {
                method: 'POST', headers: authHeaders,
                body: JSON.stringify({
                    typeId: selectedType?.id,
                    startAt: selectedSlot.startAt,
                    participants: participants.filter(p => p.name || p.email),
                    reason,
                }),
            });
            const data = await res.json();
            if (res.status === 402) { setSiteActive(false); setStatusReason(data.reason || 'inactive'); toast.error(data.message || 'Sitio inactivo'); return; }
            if (!res.ok) { toast.error(data.message || data.error || 'No se pudo reservar'); return; }
            setDone(data.appointment);
            toast.success('¡Capacitación agendada!');
            onBooked?.();
        } catch {
            toast.error('Error al reservar');
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingStatus) {
        return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
    }

    // Sitio inactivo → pantalla de activación (Stripe).
    if (siteActive === false) {
        return (
            <div className="max-w-xl mx-auto bg-white rounded-3xl border border-amber-100 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 text-white text-center">
                    <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-90" />
                    <h2 className="text-2xl font-black">Capacitación solo para sitios activos</h2>
                </div>
                <div className="p-8 text-center">
                    <p className="text-gray-600 mb-2">
                        {statusReason === 'expired' ? 'Tu suscripción está vencida.' : statusReason === 'suspended' ? 'Tu sitio está suspendido.' : 'Tu sitio no tiene un plan válido.'}
                    </p>
                    <p className="text-gray-500 text-sm mb-6">
                        Activa o renueva tu ecosistema Club Platform para acceder a capacitaciones, soporte y acompañamiento personalizado.
                    </p>
                    <button onClick={startActivation} disabled={activating}
                        className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-bold shadow-lg shadow-indigo-500/25 hover:scale-[1.02] transition disabled:opacity-60">
                        {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                        Activar o renovar servicio
                    </button>
                    <p className="text-[11px] text-gray-400 mt-4">Pago seguro con Stripe. La activación se confirma automáticamente.</p>
                </div>
            </div>
        );
    }

    // Confirmación final.
    if (done) {
        return (
            <div className="max-w-xl mx-auto bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-8 text-white text-center">
                    <CheckCircle2 className="w-14 h-14 mx-auto mb-3" />
                    <h2 className="text-2xl font-black">¡Reserva confirmada!</h2>
                    <p className="opacity-90 mt-1">{fmtDay(done.startAt)} · {fmtTime(done.startAt)}</p>
                </div>
                <div className="p-8 space-y-3">
                    <p className="text-gray-600 text-sm text-center">Te enviamos la confirmación por correo con el enlace y los botones para agregarla a tu calendario.</p>
                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                        <a href={`${API}/training/appointments/${done.id}/ics?token=${token}`}
                            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200">Descargar .ics</a>
                        <button onClick={() => { setDone(null); setStep(0); setSelectedSlot(null); setSelectedType(null); }}
                            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Agendar otra</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            {/* Stepper */}
            <div className="flex items-center justify-between mb-8">
                {STEPS.map((s, i) => (
                    <React.Fragment key={s}>
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                {i < step ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                            </div>
                            <span className={`text-[11px] font-semibold text-center ${i === step ? 'text-indigo-600' : 'text-gray-400'}`}>{s}</span>
                        </div>
                        {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 -mt-5 ${i < step ? 'bg-emerald-400' : 'bg-gray-100'}`} />}
                    </React.Fragment>
                ))}
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-7 min-h-[320px]">
                {/* Step 0: Sitio */}
                {step === 0 && (
                    <div>
                        <h3 className="text-lg font-black text-gray-900 mb-1">Tu organización</h3>
                        <p className="text-gray-500 text-sm mb-5">Validamos automáticamente que tu sitio esté activo.</p>
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
                            <div>
                                <div className="font-bold text-gray-900">{siteInfo?.name || club?.name || 'Tu sitio'}</div>
                                <div className="text-xs text-emerald-700 font-semibold">Sitio activo · suscripción vigente</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 1: Tipo */}
                {step === 1 && (
                    <div>
                        <h3 className="text-lg font-black text-gray-900 mb-1">¿Qué necesitas?</h3>
                        <p className="text-gray-500 text-sm mb-5">Elige el tipo de capacitación o soporte.</p>
                        {types.length === 0 ? (
                            <p className="text-gray-400 text-sm py-8 text-center">No hay tipos de capacitación disponibles por ahora.</p>
                        ) : (
                            <div className="grid sm:grid-cols-2 gap-3">
                                {types.map(t => (
                                    <button key={t.id} onClick={() => { setSelectedType(t); setSelectedSlot(null); loadSlots(t); }}
                                        className={`text-left p-4 rounded-2xl border-2 transition ${selectedType?.id === t.id ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-100 hover:border-gray-200'}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || '#2563eb' }} />
                                            <span className="font-bold text-gray-900">{t.name}</span>
                                        </div>
                                        {t.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{t.description}</p>}
                                        <div className="flex items-center gap-3 text-[11px] text-gray-400 font-semibold">
                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.durationMin} min</span>
                                            <span className="flex items-center gap-1"><Video className="w-3 h-3" />{t.modality}</span>
                                            {t.price ? <span className="text-amber-600">${t.price}</span> : <span className="text-emerald-600">Incluido</span>}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Fecha y hora */}
                {step === 2 && (
                    <div>
                        <h3 className="text-lg font-black text-gray-900 mb-1">Elige fecha y hora</h3>
                        <p className="text-gray-500 text-sm mb-1">Horarios mostrados en tu zona: <span className="font-semibold">{USER_TZ}</span></p>
                        {loadingSlots ? (
                            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
                        ) : days.length === 0 ? (
                            <p className="text-gray-400 text-sm py-12 text-center">No hay horarios disponibles en el rango. Intenta más tarde.</p>
                        ) : (
                            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1 mt-3">
                                {days.map(d => (
                                    <div key={d.dateKey}>
                                        <div className="text-xs font-black text-gray-700 uppercase tracking-wide mb-2 capitalize">{fmtDay(d.slots[0].startAt)}</div>
                                        <div className="flex flex-wrap gap-2">
                                            {d.slots.map(s => (
                                                <button key={s.startAt} onClick={() => setSelectedSlot(s)}
                                                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition ${selectedSlot?.startAt === s.startAt ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-100 text-gray-700 hover:border-indigo-200'}`}>
                                                    {fmtTime(s.startAt)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: Participantes + motivo */}
                {step === 3 && (
                    <div>
                        <h3 className="text-lg font-black text-gray-900 mb-1">Participantes y motivo</h3>
                        <p className="text-gray-500 text-sm mb-5">¿Quiénes asisten y qué te gustaría cubrir?</p>
                        <div className="space-y-2 mb-4">
                            {participants.map((p, i) => (
                                <div key={i} className="flex gap-2">
                                    <input placeholder="Nombre" value={p.name}
                                        onChange={e => setParticipants(ps => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                                    <input placeholder="Correo" value={p.email}
                                        onChange={e => setParticipants(ps => ps.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                                </div>
                            ))}
                            <button onClick={() => setParticipants(ps => [...ps, { name: '', email: '' }])}
                                className="text-xs font-semibold text-indigo-600 flex items-center gap-1"><Users className="w-3.5 h-3.5" />Agregar participante</button>
                        </div>
                        <textarea placeholder="Motivo de la sesión (opcional)" value={reason} onChange={e => setReason(e.target.value)} rows={3}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
                    </div>
                )}

                {/* Step 4: Confirmar */}
                {step === 4 && (
                    <div>
                        <h3 className="text-lg font-black text-gray-900 mb-5 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600" />Confirma tu reserva</h3>
                        <div className="space-y-3 text-sm">
                            <Row label="Organización" value={siteInfo?.name || club?.name} />
                            <Row label="Tipo" value={selectedType?.name} />
                            <Row label="Fecha" value={selectedSlot ? fmtDay(selectedSlot.startAt) : ''} />
                            <Row label="Hora" value={selectedSlot ? `${fmtTime(selectedSlot.startAt)} (${USER_TZ})` : ''} />
                            <Row label="Modalidad" value={selectedType?.modality} />
                            <Row label="Participantes" value={String(participants.filter(p => p.name || p.email).length || 1)} />
                        </div>
                    </div>
                )}
            </div>

            {/* Nav */}
            <div className="flex justify-between mt-6">
                <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                    className="flex items-center gap-1 px-4 py-2 rounded-xl text-gray-500 font-semibold disabled:opacity-0"><ChevronLeft className="w-4 h-4" />Atrás</button>
                {step < 4 ? (
                    <button onClick={() => setStep(s => s + 1)}
                        disabled={(step === 1 && !selectedType) || (step === 2 && !selectedSlot)}
                        className="flex items-center gap-1 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-40">
                        Continuar <ChevronRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button onClick={submit} disabled={submitting}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white font-bold hover:scale-[1.02] transition disabled:opacity-60">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}Confirmar reserva
                    </button>
                )}
            </div>
        </div>
    );
};

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-50">
        <span className="text-gray-400 font-medium">{label}</span>
        <span className="text-gray-900 font-bold text-right capitalize">{value || '—'}</span>
    </div>
);

export default BookingWizard;
