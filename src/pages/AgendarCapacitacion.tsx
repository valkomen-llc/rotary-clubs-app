import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Search, Clock, CheckCircle2, ChevronRight, ChevronLeft, Loader2, Video,
    ShieldAlert, CreditCard, Sparkles, ArrowRight, Building2, CalendarClock, Link as LinkIcon,
    User, Mail, Phone, FileText, MapPin, Copy
} from 'lucide-react';
import { useLang } from '../contexts/LanguageContext';
import PublicTopBar from '../components/PublicTopBar';
import AgendaDateTimePicker from '../components/AgendaDateTimePicker';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const PLATFORM_LOGO = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/platform/logo/1776225800089-Club_Platform_for_Rotary.png';

interface Site { id: string; name: string; type: 'club' | 'district'; active: boolean; }
interface ApptType { id: string; name: string; description?: string; categoryId?: string | null; durationMin: number; modality: string; price?: number | null; color?: string; responsible?: { name: string } | null; }
interface Category { id: string; name: string; description?: string; emoji?: string; color?: string; }
interface Slot { startAt: string; endAt: string; }
interface DaySlots { dateKey: string; slots: Slot[]; }

// Orden del flujo: primero el tipo de capacitación, luego el sitio.
const STEPS = ['Tipo', 'Tu sitio', 'Fecha y hora', 'Tus datos', 'Confirmar'];
const fmtDay = (iso: string) => new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: USER_TZ }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: USER_TZ }).format(new Date(iso));

const AgendarCapacitacion: React.FC = () => {
    const [params] = useSearchParams();
    const { setLang, languageChosen } = useLang();
    const [step, setStep] = useState(0);

    // Idioma por defecto del calendario: Español (a menos que el visitante ya
    // haya elegido otro idioma a mano).
    useEffect(() => {
        if (!languageChosen) setLang('es');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sitio
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Site[]>([]);
    const [defaultSites, setDefaultSites] = useState<Site[]>([]);
    const [searching, setSearching] = useState(false);
    const [site, setSite] = useState<Site | null>(null);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [siteActive, setSiteActive] = useState<boolean | null>(null);
    const [statusReason, setStatusReason] = useState('');
    const [activating, setActivating] = useState(false);
    const debounce = useRef<any>(null);

    // Tipos / slots
    const [types, setTypes] = useState<ApptType[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<ApptType | null>(null);
    const [days, setDays] = useState<DaySlots[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

    // Datos del solicitante
    const [requester, setRequester] = useState({ firstName: '', lastName: '', email: '', phone: '' });
    const [clubContact, setClubContact] = useState<{ email?: string | null; phone?: string | null }>({});
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState<any>(null);
    const [error, setError] = useState('');

    // Cargar tipos al inicio.
    useEffect(() => {
        fetch(`${API}/public/training/config`).then(r => r.json()).then(d => { setTypes(d.types || []); setCategories(d.categories || []); }).catch(() => {});
    }, []);

    // Volver del checkout de Stripe: revalidar el sitio y saltar al paso de tipo.
    useEffect(() => {
        const activated = params.get('activated');
        const siteId = params.get('site');
        if (activated && siteId) {
            (async () => {
                setCheckingStatus(true);
                try {
                    const r = await fetch(`${API}/public/training/site-status?siteId=${siteId}`);
                    const d = await r.json();
                    if (d.site) {
                        setSite({ id: d.site.id, name: d.site.name, type: d.site.type, active: d.active });
                        setSiteActive(d.active);
                        setStatusReason(d.reason);
                        // El tipo se pierde al redirigir a Stripe; volvemos al paso 0 (Tipo)
                        // con el sitio ya validado y activo para continuar el flujo.
                        if (d.active) setStep(0);
                    }
                } finally { setCheckingStatus(false); }
            })();
        }
    }, [params]);

    // Lista por defecto: primeros 10 sitios activos (alfabético) sin escribir nada.
    useEffect(() => {
        fetch(`${API}/public/training/sites`).then(r => r.json()).then(d => setDefaultSites(d.sites || [])).catch(() => {});
    }, []);

    // Búsqueda de sitio (debounced).
    useEffect(() => {
        if (debounce.current) clearTimeout(debounce.current);
        if (query.trim().length < 2) { setResults([]); return; }
        debounce.current = setTimeout(async () => {
            setSearching(true);
            try {
                const r = await fetch(`${API}/public/training/sites?q=${encodeURIComponent(query.trim())}`);
                const d = await r.json();
                setResults(d.sites || []);
            } catch { /* noop */ } finally { setSearching(false); }
        }, 300);
    }, [query]);

    const selectSite = async (s: Site) => {
        setSite(s); setResults([]); setQuery(s.name); setCheckingStatus(true); setSiteActive(null);
        try {
            const r = await fetch(`${API}/public/training/site-status?siteId=${s.id}&siteType=${s.type}`);
            const d = await r.json();
            setSiteActive(d.active); setStatusReason(d.reason);
            setClubContact({ email: d.site?.contactEmail, phone: d.site?.contactPhone });
        } catch { setSiteActive(null); } finally { setCheckingStatus(false); }
    };

    const loadSlots = async (t: ApptType) => {
        setLoadingSlots(true); setDays([]);
        try {
            const r = await fetch(`${API}/public/training/slots?typeId=${t.id}`);
            const d = await r.json();
            setDays(d.days || []);
        } catch { /* noop */ } finally { setLoadingSlots(false); }
    };

    const startActivation = async () => {
        if (!site) return;
        setActivating(true);
        try {
            const r = await fetch(`${API}/public/training/activation-checkout`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: site.id, siteType: site.type }),
            });
            const d = await r.json();
            if (r.ok && d.url) { window.location.href = d.url; return; }
            setError(d.error || 'No se pudo iniciar la activación');
        } catch { setError('Error al iniciar el pago'); } finally { setActivating(false); }
    };

    const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

    const submit = async () => {
        if (!site || !selectedSlot) return;
        setSubmitting(true); setError('');
        try {
            const r = await fetch(`${API}/public/training/appointments`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    siteId: site.id, siteType: site.type, typeId: selectedType?.id,
                    startAt: selectedSlot.startAt, reason,
                    requesterName: `${requester.firstName} ${requester.lastName}`.trim(), requesterEmail: requester.email, requesterPhone: requester.phone,
                    participants: [{ name: `${requester.firstName} ${requester.lastName}`.trim(), email: requester.email }],
                }),
            });
            const d = await r.json();
            if (r.status === 402) { setSiteActive(false); setStatusReason(d.reason || 'inactive'); setStep(0); return; }
            if (!r.ok) { setError(d.message || d.error || 'No se pudo reservar'); return; }
            setDone(d);
        } catch { setError('Error al reservar'); } finally { setSubmitting(false); }
    };

    const canNext = () => {
        if (step === 0) return !!selectedType;
        if (step === 1) return !!site && siteActive === true;
        if (step === 2) return !!selectedSlot;
        if (step === 3) return requester.firstName.trim() && isEmail(requester.email);
        return true;
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-indigo-50/40">
            {/* Barra superior estilo Rotary (Endpolio · My Rotary · idioma) */}
            <PublicTopBar />

            {/* Header */}
            <header className="bg-white border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
                    <img src={PLATFORM_LOGO} alt="Club Platform" className="h-9 w-auto" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                    <div className="border-l border-gray-200 pl-3">
                        <div className="font-black text-gray-900 leading-tight flex items-center gap-2"><CalendarClock className="w-4 h-4 text-indigo-600" />Agenda de Capacitaciones y Soporte</div>
                        <div className="text-xs text-gray-400">Reserva tu sesión sin iniciar sesión</div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {done ? (
                    <SuccessCard done={done} />
                ) : (
                    <>
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

                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-7 min-h-[340px]">
                            {/* Paso "Tu sitio" (segundo) */}
                            {step === 1 && (
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 mb-1">Encuentra tu sitio</h3>
                                    <p className="text-gray-500 text-sm mb-4">Elige tu club de la lista o busca por nombre.</p>
                                    <div className="relative">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                                        <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setSite(null); setSiteActive(null); }}
                                            placeholder="Buscar club, distrito u organización…" className="w-full pl-9 pr-3 py-3 rounded-2xl border border-gray-200 text-sm" />
                                        {searching && <Loader2 className="w-4 h-4 animate-spin text-gray-300 absolute right-3 top-3.5" />}
                                    </div>
                                    {(() => {
                                        const searching2 = query.trim().length >= 2;
                                        const list = searching2 ? results : defaultSites;
                                        if (site) return null;
                                        return (
                                            <div className="mt-3">
                                                {!searching2 && defaultSites.length > 0 && <div className="text-[11px] font-black text-gray-400 uppercase tracking-wide mb-2">Sitios activos</div>}
                                                {list.length > 0 ? (
                                                    <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
                                                        {list.map(s => (
                                                            <button key={`${s.type}-${s.id}`} onClick={() => selectSite(s)} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
                                                                <Building2 className="w-4 h-4 text-gray-400" />
                                                                <span className="flex-1 text-sm font-semibold text-gray-800">{s.name}</span>
                                                                {!s.active && <span className="text-[10px] font-bold text-amber-600">Inactivo</span>}
                                                                <span className="text-[10px] uppercase font-bold text-gray-400">{s.type === 'district' ? 'Distrito' : 'Sitio'}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : searching2 && !searching ? (
                                                    <p className="text-sm text-gray-400 py-3">Sin resultados para "{query}".</p>
                                                ) : null}
                                            </div>
                                        );
                                    })()}

                                    {checkingStatus && <div className="mt-4 flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Validando suscripción…</div>}

                                    {site && siteActive === true && (
                                        <div className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                                            <CheckCircle2 className="w-7 h-7 text-emerald-500 shrink-0" />
                                            <div><div className="font-bold text-gray-900">{site.name}</div><div className="text-xs text-emerald-700 font-semibold">Sitio activo · puedes reservar</div></div>
                                        </div>
                                    )}

                                    {site && siteActive === false && (
                                        <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-100 p-5 text-center">
                                            <ShieldAlert className="w-9 h-9 text-amber-500 mx-auto mb-2" />
                                            <div className="font-black text-gray-900 mb-1">Capacitación solo para sitios activos</div>
                                            <p className="text-sm text-gray-500 mb-4">
                                                {statusReason === 'expired' ? 'La suscripción de este sitio está vencida.' : statusReason === 'suspended' ? 'Este sitio está suspendido.' : 'Este sitio no tiene un plan válido.'} Actívalo o renuévalo para agendar.
                                            </p>
                                            <button onClick={startActivation} disabled={activating} className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-bold shadow-lg shadow-indigo-500/25 disabled:opacity-60">
                                                {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}Activar o renovar servicio
                                            </button>
                                            <p className="text-[11px] text-gray-400 mt-3">Pago seguro con Stripe. La activación se confirma automáticamente.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Paso "Tipo" (primero): categoría → servicios */}
                            {step === 0 && (() => {
                                // Categorías con al menos un servicio + "Otros" para los sin categoría.
                                const withCat = categories
                                    .map(c => ({ ...c, count: types.filter(t => t.categoryId === c.id).length }))
                                    .filter(c => c.count > 0);
                                const noneCount = types.filter(t => !t.categoryId).length;
                                const cats: any[] = [...withCat];
                                if (noneCount > 0) cats.push({ id: '__none__', name: 'Otros', emoji: '📋', color: '#64748b', description: 'Otros servicios', count: noneCount });
                                const servicesOfSelected = selectedCategory
                                    ? types.filter(t => (selectedCategory === '__none__' ? !t.categoryId : t.categoryId === selectedCategory))
                                    : [];
                                const currentCat = cats.find(c => c.id === selectedCategory);

                                if (types.length === 0) return <p className="text-gray-400 text-sm py-8 text-center">No hay servicios disponibles por ahora.</p>;

                                // Sin categorías configuradas: lista plana de servicios (compat).
                                if (cats.length === 0 || (cats.length === 1 && cats[0].id === '__none__' && categories.length === 0)) {
                                    return (
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 mb-1">¿Qué necesitas?</h3>
                                            <p className="text-gray-500 text-sm mb-5">Elige el servicio.</p>
                                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                                {types.map(t => (
                                                    <button key={t.id} onClick={() => { setSelectedType(t); setSelectedSlot(null); loadSlots(t); }}
                                                        className={`text-left p-4 rounded-2xl border-2 transition ${selectedType?.id === t.id ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-100 hover:border-gray-200'}`}>
                                                        <div className="flex items-center gap-2 mb-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || '#2563eb' }} /><span className="font-bold text-gray-900">{t.name}</span></div>
                                                        {t.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{t.description}</p>}
                                                        <div className="flex items-center gap-3 text-[11px] text-gray-400 font-semibold">
                                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.durationMin} min</span>
                                                            {t.price ? <span className="text-amber-600">${t.price}</span> : <span className="text-emerald-600">Incluido</span>}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }

                                // 1) Selección de categoría.
                                if (!selectedCategory) {
                                    return (
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 mb-1">¿Sobre qué tema necesitas apoyo?</h3>
                                            <p className="text-gray-500 text-sm mb-5">Elige una categoría para ver los servicios.</p>
                                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                                {cats.map(c => (
                                                    <button key={c.id} onClick={() => setSelectedCategory(c.id)}
                                                        className="text-left p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 transition flex items-start gap-3" style={{ borderLeftColor: c.color, borderLeftWidth: 4 }}>
                                                        <span className="text-2xl">{c.emoji || '📁'}</span>
                                                        <div className="min-w-0">
                                                            <div className="font-black text-gray-900">{c.name}</div>
                                                            {c.description && <p className="text-xs text-gray-500 line-clamp-2">{c.description}</p>}
                                                            <div className="text-[11px] text-gray-400 font-semibold mt-1">{c.count} servicio{c.count === 1 ? '' : 's'}</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }

                                // 2) Servicios de la categoría elegida.
                                return (
                                    <div>
                                        <button onClick={() => { setSelectedCategory(null); setSelectedType(null); }} className="text-xs font-bold text-indigo-600 flex items-center gap-1 mb-3"><ChevronLeft className="w-4 h-4" />Categorías</button>
                                        <h3 className="text-lg font-black text-gray-900 mb-1 flex items-center gap-2"><span className="text-xl">{currentCat?.emoji}</span>{currentCat?.name}</h3>
                                        <p className="text-gray-500 text-sm mb-5">Elige el servicio que necesitas.</p>
                                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {servicesOfSelected.map(t => (
                                                <button key={t.id} onClick={() => { setSelectedType(t); setSelectedSlot(null); loadSlots(t); }}
                                                    className={`text-left p-4 rounded-2xl border-2 transition ${selectedType?.id === t.id ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-100 hover:border-gray-200'}`}>
                                                    <div className="flex items-center gap-2 mb-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || '#2563eb' }} /><span className="font-bold text-gray-900">{t.name}</span></div>
                                                    {t.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{t.description}</p>}
                                                    <div className="flex items-center gap-3 text-[11px] text-gray-400 font-semibold">
                                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.durationMin} min</span>
                                                        <span className="flex items-center gap-1"><Video className="w-3 h-3" />{t.modality}</span>
                                                        {t.price ? <span className="text-amber-600">${t.price}</span> : <span className="text-emerald-600">Incluido</span>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Step 2: Fecha y hora — calendario estilo Calendly */}
                            {step === 2 && (
                                <AgendaDateTimePicker
                                    days={days}
                                    loading={loadingSlots}
                                    typeName={selectedType?.name}
                                    durationMin={selectedType?.durationMin}
                                    instructor={selectedType?.responsible?.name || null}
                                    timezone={USER_TZ}
                                    selectedStart={selectedSlot?.startAt || null}
                                    onSelect={(s) => setSelectedSlot(s)}
                                />
                            )}

                            {/* Step 3: Tus datos (estilo formulario Feria de Proyectos) */}
                            {step === 3 && (
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 mb-1">Tus datos</h3>
                                    <p className="text-gray-500 text-sm mb-6">Para enviarte la confirmación y el enlace de la sesión.</p>

                                    <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
                                        <Field icon={User} label="Nombre" required>
                                            <input value={requester.firstName} onChange={e => setRequester(r => ({ ...r, firstName: e.target.value }))} placeholder="Tu nombre" className={inputCls} />
                                        </Field>
                                        <Field icon={User} label="Apellido">
                                            <input value={requester.lastName} onChange={e => setRequester(r => ({ ...r, lastName: e.target.value }))} placeholder="Tu apellido" className={inputCls} />
                                        </Field>
                                        <Field icon={Mail} label="Correo electrónico" required>
                                            <input type="email" value={requester.email} onChange={e => setRequester(r => ({ ...r, email: e.target.value }))} placeholder="nombre@correo.com" className={inputCls} />
                                        </Field>
                                        <Field icon={Phone} label="Teléfono / WhatsApp">
                                            <input value={requester.phone} onChange={e => setRequester(r => ({ ...r, phone: e.target.value }))} placeholder="300 000 0000" className={inputCls} />
                                        </Field>
                                        <div className="sm:col-span-2">
                                            <Field icon={FileText} label="Motivo de la sesión">
                                                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Cuéntanos brevemente qué te gustaría cubrir (opcional)" className={`${inputCls} resize-none`} />
                                            </Field>
                                        </div>
                                    </div>

                                    {/* Datos del club (reciben también la confirmación) */}
                                    <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Building2 className="w-4 h-4 text-indigo-600" />
                                            <span className="text-sm font-black text-gray-800">Datos del club</span>
                                            <span className="text-[11px] text-indigo-600 font-semibold">· también recibe la confirmación</span>
                                        </div>
                                        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
                                            <ReadField icon={Building2} label="Club / Sitio" value={site?.name} />
                                            <ReadField icon={MapPin} label="Tipo" value={site?.type === 'district' ? 'Distrito' : 'Sitio'} />
                                            <ReadField icon={Mail} label="Correo del club" value={clubContact.email || 'No registrado'} />
                                            <ReadField icon={Phone} label="Teléfono del club" value={clubContact.phone || 'No registrado'} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 4: Confirmar */}
                            {step === 4 && (
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 mb-5 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600" />Confirma tu reserva</h3>
                                    <div className="space-y-1 text-sm">
                                        <Row label="Organización" value={site?.name} />
                                        <Row label="Tipo" value={selectedType?.name} />
                                        <Row label="Fecha" value={selectedSlot ? fmtDay(selectedSlot.startAt) : ''} />
                                        <Row label="Hora" value={selectedSlot ? `${fmtTime(selectedSlot.startAt)} (${USER_TZ})` : ''} />
                                        <Row label="A nombre de" value={`${requester.firstName} ${requester.lastName}`.trim()} />
                                        <Row label="Correo" value={requester.email} />
                                        {clubContact.email && <Row label="Notifica al club" value={clubContact.email} />}
                                    </div>
                                </div>
                            )}

                            {error && <div className="mt-4 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
                        </div>

                        {/* Nav */}
                        <div className="flex justify-between mt-6">
                            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="flex items-center gap-1 px-4 py-2 rounded-xl text-gray-500 font-semibold disabled:opacity-0"><ChevronLeft className="w-4 h-4" />Atrás</button>
                            {step < 4 ? (
                                <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="flex items-center gap-1 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-40">Continuar <ChevronRight className="w-4 h-4" /></button>
                            ) : (
                                <button onClick={submit} disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white font-bold hover:scale-[1.02] transition disabled:opacity-60">
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}Confirmar reserva
                                </button>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-50"><span className="text-gray-400 font-medium">{label}</span><span className="text-gray-900 font-bold text-right">{value || '—'}</span></div>
);

// Estilo de inputs y campos etiquetados (referencia: formulario Feria de Proyectos).
const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-colors';

const Field: React.FC<{ icon: any; label: string; required?: boolean; children: React.ReactNode }> = ({ icon: Icon, label, required, children }) => (
    <label className="block">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
            <Icon className="w-4 h-4 text-indigo-500" />{label}{required && <span className="text-red-500">*</span>}
        </span>
        {children}
    </label>
);

const ReadField: React.FC<{ icon: any; label: string; value?: string | null }> = ({ icon: Icon, label, value }) => (
    <div>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1"><Icon className="w-3.5 h-3.5 text-gray-400" />{label}</span>
        <div className="px-3.5 py-2 rounded-xl bg-white border border-gray-100 text-sm font-semibold text-gray-800 truncate">{value || '—'}</div>
    </div>
);

const SuccessCard: React.FC<{ done: any }> = ({ done }) => {
    const a = done.appointment;
    const [copied, setCopied] = useState(false);
    const copyLink = async () => {
        try { await navigator.clipboard.writeText(a.meetingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* noop */ }
    };
    return (
        <div className="max-w-xl mx-auto bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-8 text-white text-center">
                <CheckCircle2 className="w-14 h-14 mx-auto mb-3" />
                <h2 className="text-2xl font-black">¡Reserva confirmada!</h2>
                <p className="opacity-90 mt-1 capitalize">{fmtDay(a.startAt)} · {fmtTime(a.startAt)}</p>
                {a.code && <p className="opacity-80 text-xs mt-2">Código de confirmación: <b>{a.code}</b></p>}
            </div>
            <div className="p-8 space-y-4 text-center">
                {/* El enlace de la reunión sólo se muestra tras confirmar. */}
                {a.meetingUrl ? (
                    <div className="space-y-2">
                        <a href={a.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-bold shadow-lg shadow-indigo-500/25 hover:scale-[1.02] transition">
                            <Video className="w-5 h-5" />Ingresar a la reunión
                        </a>
                        <div>
                            <button onClick={copyLink} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-indigo-600">
                                <Copy className="w-4 h-4" />{copied ? '¡Copiado!' : 'Copiar enlace'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm">El enlace de la reunión se enviará por correo antes de la sesión.</p>
                )}
                <p className="text-gray-600 text-sm">Te enviamos la confirmación por correo, con instrucciones de acceso y un enlace privado para gestionar tu cita.</p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {done.manageUrl && (
                        <a href={done.manageUrl} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-bold hover:bg-indigo-100">
                            <LinkIcon className="w-4 h-4" />Gestionar mi cita
                        </a>
                    )}
                    <a href={`${API}/public/training/appointments/${a.token}/ics`} className="inline-flex items-center px-5 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold hover:bg-gray-200">Descargar .ics</a>
                </div>
            </div>
        </div>
    );
};

export default AgendarCapacitacion;
