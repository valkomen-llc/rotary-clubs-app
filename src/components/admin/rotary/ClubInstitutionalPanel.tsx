import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, BadgeCheck, CalendarDays, CheckCircle2, Globe2, Loader2,
    Mail, MapPin, MessageCircle, RefreshCw, Sparkles, UserPlus, Users,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const PLATFORM_LABEL: Record<string, string> = {
    active: 'Activo en Club Platform',
    pending: 'Activación en curso',
    inactive: 'Sitio inactivo',
    unverified: 'Sin presencia verificada',
};

const PLATFORM_STYLE: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    inactive: 'bg-gray-100 text-gray-600 border-gray-200',
    unverified: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function ClubInstitutionalPanel({ profileId, token }: { profileId: string; token?: string | null }) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!profileId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API}/crm/institutional/clubs/${profileId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo cargar la vista institucional');
            setData(body);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [profileId, token]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="py-10 text-center text-gray-400 text-xs">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-rotary-blue" />
                Cruzando contactos del CRM con el Directorio…
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> No se pudo cargar la vista institucional</p>
                <p className="mt-1">{error || 'Sin datos'}</p>
                <button onClick={load} className="mt-2 px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-bold">Reintentar</button>
            </div>
        );
    }

    const stats = data.stats || {};
    const profile = data.profile || {};
    const contacts = data.contacts || [];
    const candidates = data.candidates || [];
    const actions = data.nextActions || [];
    const roleSummary = data.contactsByRole || [];
    const activity = data.campaignActivity || [];
    const lists = data.linkedLists || [];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" /> Vista 360° CRM institucional
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-1">Los contactos se leen de los vínculos confirmados; los candidatos no cuentan como relación.</p>
                </div>
                <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-rotary-blue hover:bg-gray-50">
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="text-lg font-black text-gray-900">{stats.contacts ?? 0}</div>
                    <div className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1"><Users className="w-3 h-3" /> Contactos</div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <div className="text-lg font-black text-emerald-800">{stats.contactsWithEmail ?? 0}</div>
                    <div className="text-[10px] font-bold uppercase text-emerald-600 flex items-center gap-1"><Mail className="w-3 h-3" /> Con correo</div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                    <div className="text-lg font-black text-sky-800">{stats.contactsWithPhone ?? 0}</div>
                    <div className="text-[10px] font-bold uppercase text-sky-600 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Con teléfono</div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                    <div className="text-lg font-black text-amber-800">{stats.candidates ?? 0}</div>
                    <div className="text-[10px] font-bold uppercase text-amber-600 flex items-center gap-1"><UserPlus className="w-3 h-3" /> Candidatos</div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl border border-gray-100 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase text-gray-400">Club Platform</span>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${PLATFORM_STYLE[profile.platformStatus] || PLATFORM_STYLE.unverified}`}>
                            {PLATFORM_LABEL[profile.platformStatus] || 'Sin verificar'}
                        </span>
                    </div>
                    <p className="text-xs font-bold text-gray-800 mt-1">{profile.tenantClubName || 'Sin tenant asociado'}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1"><Globe2 className="w-3 h-3" /> {profile.tenantDomain || 'Sin dominio propio'}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase text-gray-400">Completitud del Directorio</span>
                        <span className="text-xs font-black text-violet-700">{profile.completionPercentage ?? 0}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden mt-2">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, profile.completionPercentage || 0)}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Publicada por el perfil oficial. El CRM no la recalcula.</p>
                </div>
            </div>

            {actions.length > 0 && (
                <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
                    <h4 className="text-[11px] font-black uppercase tracking-wide text-violet-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Próximas acciones
                    </h4>
                    <div className="mt-2 space-y-1.5">
                        {actions.slice(0, 5).map((action: any) => (
                            <div key={action.key} className="text-[11px]">
                                <span className="font-bold text-violet-900">{action.title}. </span>
                                <span className="text-violet-700">{action.detail}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-black uppercase tracking-wide text-gray-500">Contactos confirmados</h4>
                    {roleSummary.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {roleSummary.map((role: any) => (
                                <span key={role.role} className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-600">
                                    {role.label}: {role.count}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
                    {contacts.map((contact: any) => (
                        <div key={contact.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-gray-900 truncate">
                                        {[contact.name, contact.lastName].filter(Boolean).join(' ')}
                                    </p>
                                    <p className="text-[10px] text-gray-500 truncate">
                                        {contact.institutional?.roleLabel}
                                        {contact.institutional?.period ? ` · ${contact.institutional.period}` : ''}
                                    </p>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                                    <BadgeCheck className="w-3 h-3" /> Confirmado
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] text-gray-500">
                                {contact.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {contact.email}</span>}
                                {contact.phone && <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {contact.phone}</span>}
                                {(contact.tags || []).slice(0, 3).map((tag: string) => (
                                    <span key={tag} className="px-1.5 py-0.5 rounded bg-white border border-gray-200">{tag}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                    {!contacts.length && (
                        <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                            Este club todavía no tiene contactos vinculados de forma confirmada.
                        </div>
                    )}
                </div>
            </div>

            {candidates.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                    <h4 className="text-[11px] font-black uppercase tracking-wide text-amber-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Candidatos por validar ({candidates.length})
                    </h4>
                    <div className="mt-2 space-y-1.5">
                        {candidates.slice(0, 8).map((contact: any) => (
                            <div key={contact.id} className="flex items-center justify-between gap-2 text-[11px] rounded-lg bg-white/70 border border-amber-100 px-2.5 py-1.5">
                                <span className="font-semibold text-gray-800 truncate">
                                    {[contact.name, contact.lastName].filter(Boolean).join(' ')}
                                </span>
                                <span className="text-amber-700 shrink-0">
                                    {contact.institutional?.statusLabel} · {contact.institutional?.confidence ?? 0}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(activity.length > 0 || lists.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activity.length > 0 && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-gray-500 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Actividad de campañas</h4>
                            <div className="mt-2 space-y-1.5">
                                {activity.slice(0, 5).map((item: any, index: number) => (
                                    <div key={index} className="text-[10px] text-gray-600 flex items-center justify-between gap-2">
                                        <span className="truncate">{item.campaignName}</span>
                                        <span className="text-gray-400 shrink-0">{item.status} · {item.openCount || 0} aperturas</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {lists.length > 0 && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-4">
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-gray-500 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Listas del CRM</h4>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {lists.slice(0, 8).map((list: any) => (
                                    <span key={list.id} className="px-2 py-1 rounded-full bg-gray-100 text-[10px] font-bold text-gray-600">{list.name}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
