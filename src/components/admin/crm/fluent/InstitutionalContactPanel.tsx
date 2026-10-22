import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, BadgeCheck, Check, CircleDashed, ExternalLink,
    Globe2, History, Loader2, MapPin, ShieldQuestion, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const STATUS_STYLE: Record<string, string> = {
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ambiguous: 'bg-amber-50 text-amber-700 border-amber-200',
    pending: 'bg-orange-50 text-orange-700 border-orange-200',
    unreconciled: 'bg-sky-50 text-sky-700 border-sky-200',
    unlinked: 'bg-gray-50 text-gray-600 border-gray-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PLATFORM_STYLE: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    inactive: 'bg-gray-100 text-gray-600 border-gray-200',
    unverified: 'bg-slate-50 text-slate-600 border-slate-200',
};

const ALERT_STYLE: Record<string, string> = {
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-sky-50 border-sky-200 text-sky-900',
};

export default function InstitutionalContactPanel({
    contactId,
    token,
    onChanged,
}: {
    contactId: string;
    token?: string | null;
    onChanged?: () => void;
}) {
    const [detail, setDetail] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!contactId) return;
        setLoading(true);
        try {
            const res = await fetch(`${API}/crm/institutional/contacts/${contactId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setDetail(await res.json());
            else setDetail(null);
        } catch {
            setDetail(null);
        } finally {
            setLoading(false);
        }
    }, [contactId, token]);

    useEffect(() => { load(); }, [load]);

    const afterChange = async () => {
        await load();
        onChanged?.();
    };

    const createLink = async (payload: Record<string, any>, key: string) => {
        setBusy(key);
        try {
            const res = await fetch(`${API}/crm/institutional/contacts/${contactId}/links`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar el vínculo');
            toast.success('Vínculo institucional guardado');
            await afterChange();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setBusy(null);
        }
    };

    const patchLink = async (linkId: string, payload: Record<string, any>, key: string) => {
        setBusy(key);
        try {
            const res = await fetch(`${API}/crm/institutional/links/${linkId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el vínculo');
            toast.success('Vínculo actualizado');
            await afterChange();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setBusy(null);
        }
    };

    if (loading) {
        return (
            <section className="border-t border-gray-100 pt-6">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando relación institucional…
                </div>
            </section>
        );
    }

    if (!detail) return null;

    const contact = detail.contact || {};
    const inst = contact.institutional || {};
    const links: any[] = inst.links || [];
    const confirmedLinks = (inst.confirmedLinks || []).filter(Boolean);
    const candidateLink = links.find((link) => link.linkStatus === 'ambiguous');
    const pendingLink = links.find((link) => link.linkStatus === 'pending');
    const rejectedLink = links.find((link) => link.linkStatus === 'rejected');
    const suggestion = inst.suggestion || {};
    const profile = detail.profile || inst.profile;
    const candidates = detail.candidates || [];
    const alerts = detail.alerts || [];

    const platformStatus = profile?.platformStatus || inst.platformStatus || 'unverified';
    const platformLabel = profile?.platformStatusLabel || inst.platformStatusLabel || 'Sin presencia verificada';
    const completion = profile?.completionPercentage ?? inst.completionPercentage;

    return (
        <section className="border-t border-gray-100 pt-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-600" />
                        Relación institucional
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-1">
                        Club de pertenencia según el Directorio Oficial. No confundir con la organización del CRM.
                    </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${STATUS_STYLE[inst.status] || STATUS_STYLE.unlinked}`}>
                    {inst.status === 'confirmed' ? <BadgeCheck className="w-3.5 h-3.5" /> : <CircleDashed className="w-3.5 h-3.5" />}
                    {inst.statusLabel || 'Sin conciliar'}
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                    <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Club declarado / vinculado</span>
                    <p className="text-sm font-bold text-gray-900 mt-1">
                        {inst.profileName || inst.rawClubName || 'Sin club declarado'}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500">
                        {inst.districtNumber != null && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> Distrito {inst.districtNumber}</span>}
                        <span className="inline-flex items-center gap-1"><History className="w-3 h-3" /> {inst.roleLabel || 'Contacto institucional'}{inst.period ? ` · ${inst.period}` : ''}</span>
                    </div>
                    {contact.origin?.name && (
                        <p className="text-[10px] text-gray-400 mt-2 border-t border-gray-200/70 pt-2">
                            Origen CRM: <span className="font-semibold text-gray-500">{contact.origin.name}</span> · organización que administra la lista, no club de pertenencia.
                        </p>
                    )}
                </div>

                <div className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Club Platform</span>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${PLATFORM_STYLE[platformStatus] || PLATFORM_STYLE.unverified}`}>
                            {platformLabel}
                        </span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 mt-1">
                        {profile?.officialName || inst.profileName || 'Sin perfil del Directorio'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-gray-500">
                        {completion != null ? (
                            <span>Completitud del Directorio: <strong className="text-gray-700">{completion}%</strong></span>
                        ) : (
                            <span>Completitud: sin dato</span>
                        )}
                        {profile?.tenantClubName && (
                            <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /> {profile.tenantClubName}</span>
                        )}
                    </div>
                    {profile?.platformStatus === 'active' && (
                        <p className="text-[10px] text-emerald-700 mt-2">Sitio o dominio propio verificado en la plataforma.</p>
                    )}
                    {profile?.platformStatus === 'pending' && (
                        <p className="text-[10px] text-amber-700 mt-2">Activación en curso; todavía no hay sitio activo.</p>
                    )}
                </div>
            </div>

            {confirmedLinks.length > 0 && (
                <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Cargos confirmados</span>
                    {confirmedLinks.map((link: any) => (
                        <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                            <div className="flex items-center gap-2 text-xs">
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="font-bold text-gray-800">{link.roleLabel}</span>
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-600">{link.profileName || inst.profileName || 'Club del Directorio'}</span>
                                {link.period && <span className="text-gray-400">({link.period})</span>}
                            </div>
                            <button
                                onClick={() => patchLink(link.id, { action: 'reject', reason: 'Vínculo descartado desde la ficha del contacto.' }, `reject-${link.id}`)}
                                disabled={busy === `reject-${link.id}`}
                                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                            >
                                Descartar
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {candidateLink && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                        <ShieldQuestion className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div className="text-xs text-amber-900">
                            <p className="font-bold">Coincidencia aproximada por validar</p>
                            <p className="mt-0.5">{candidateLink.reason || 'El nombre declarado se parece al club, pero no es una coincidencia exacta.'}</p>
                            <p className="mt-1 text-[11px] text-amber-700">Candidato: {candidateLink.candidateProfileName || 'sin nombre'} · {candidateLink.confidence}%</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => patchLink(candidateLink.id, {
                                action: 'confirm',
                                profileId: candidateLink.candidateProfileId || candidateLink.profileId,
                                reason: 'Coincidencia aproximada confirmada desde la ficha del contacto.',
                            }, `confirm-${candidateLink.id}`)}
                            disabled={busy === `confirm-${candidateLink.id}`}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50"
                        >
                            Confirmar candidato
                        </button>
                        <button
                            onClick={() => patchLink(candidateLink.id, { action: 'reject', reason: 'Candidato descartado desde la ficha del contacto.' }, `reject-${candidateLink.id}`)}
                            disabled={busy === `reject-${candidateLink.id}`}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-[11px] font-bold hover:bg-rose-50 disabled:opacity-50"
                        >
                            Descartar
                        </button>
                    </div>
                </div>
            )}

            {pendingLink && candidates.length > 0 && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 space-y-2">
                    <p className="text-xs font-bold text-orange-900 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Club fuera del Directorio. Elige un candidato para confirmar:</p>
                    <div className="flex flex-wrap gap-2">
                        {candidates.map((candidate: any) => (
                            <button
                                key={candidate.profile?.id}
                                onClick={() => patchLink(pendingLink.id, {
                                    action: 'confirm',
                                    profileId: candidate.profile?.id,
                                    reason: 'Club asignado manualmente desde la ficha del contacto.',
                                }, `confirm-${candidate.profile?.id}`)}
                                disabled={busy === `confirm-${candidate.profile?.id}`}
                                className="px-3 py-1.5 rounded-lg bg-white border border-orange-200 text-[11px] font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
                            >
                                {candidate.profile?.officialName} · {candidate.score}%
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {!confirmedLinks.length && !candidateLink && !pendingLink && inst.status === 'unreconciled' && suggestion.profileId && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-sky-900">
                        <p className="font-bold">Coincidencia exacta sin aplicar</p>
                        <p className="mt-0.5">{suggestion.profileName} · {suggestion.confidence}%</p>
                    </div>
                    <button
                        onClick={() => createLink({
                            profileId: suggestion.profileId,
                            role: inst.role,
                            period: inst.period,
                            rawClubName: inst.rawClubName,
                            districtNumber: inst.districtNumber,
                            linkStatus: 'confirmed',
                            confidence: 100,
                            matchMethod: inst.matchMethod || 'manual',
                            reason: 'Coincidencia exacta aplicada desde la ficha del contacto.',
                        }, 'apply-exact')}
                        disabled={busy === 'apply-exact'}
                        className="px-3 py-1.5 rounded-lg bg-rotary-blue text-white text-[11px] font-bold hover:bg-sky-800 disabled:opacity-50"
                    >
                        Vincular al club
                    </button>
                </div>
            )}

            {!confirmedLinks.length && !candidateLink && !pendingLink && suggestion.candidateProfileId && inst.status === 'unreconciled' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-amber-900">
                        <p className="font-bold">Sugerencia aproximada sin guardar</p>
                        <p className="mt-0.5">{suggestion.candidateProfileName} · {suggestion.confidence}%</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => createLink({
                                candidateProfileId: suggestion.candidateProfileId,
                                role: inst.role,
                                period: inst.period,
                                rawClubName: inst.rawClubName,
                                districtNumber: inst.districtNumber,
                                linkStatus: 'ambiguous',
                                confidence: suggestion.confidence || 0,
                                matchMethod: inst.matchMethod || 'manual',
                                reason: suggestion.reason || 'Sugerencia guardada para validación.',
                            }, 'save-suggestion')}
                            disabled={busy === 'save-suggestion'}
                            className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-[11px] font-bold hover:bg-amber-100 disabled:opacity-50"
                        >
                            Guardar para validar
                        </button>
                        <button
                            onClick={() => createLink({
                                profileId: suggestion.candidateProfileId,
                                role: inst.role,
                                period: inst.period,
                                rawClubName: inst.rawClubName,
                                districtNumber: inst.districtNumber,
                                linkStatus: 'confirmed',
                                confidence: 100,
                                matchMethod: inst.matchMethod || 'manual',
                                reason: 'Sugerencia confirmada manualmente desde la ficha del contacto.',
                            }, 'confirm-suggestion')}
                            disabled={busy === 'confirm-suggestion'}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50"
                        >
                            Confirmar candidato
                        </button>
                    </div>
                </div>
            )}

            {rejectedLink && !confirmedLinks.length && !candidateLink && !pendingLink && (
                <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 text-xs text-rose-800">
                    <p className="font-bold">Vínculo descartado por un administrador.</p>
                    <p className="mt-0.5">{rejectedLink.reason || 'No volverá a proponerse automáticamente.'}</p>
                </div>
            )}

            {inst.status === 'unlinked' && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                    Sin club declarado. Completa el campo institucional <strong>«Nombre del Club»</strong> para poder conciliarlo.
                </div>
            )}

            {alerts.length > 0 && (
                <div className="space-y-1.5">
                    {alerts.slice(0, 4).map((alert: any, index: number) => (
                        <div key={index} className={`rounded-lg border px-3 py-2 text-[11px] ${ALERT_STYLE[alert.severity] || ALERT_STYLE.info}`}>
                            <span className="font-bold">{alert.title}. </span>{alert.detail}
                        </div>
                    ))}
                </div>
            )}

            {(detail.audit || []).length > 0 && (
                <details className="rounded-xl border border-gray-100 bg-white">
                    <summary className="px-3 py-2 text-[11px] font-bold text-gray-500 cursor-pointer flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" /> Historial de conciliación ({detail.audit.length})
                    </summary>
                    <div className="px-3 pb-3 space-y-1.5">
                        {detail.audit.slice(0, 8).map((item: any) => (
                            <div key={item.id} className="text-[10px] text-gray-500 border-t border-gray-50 pt-1.5 flex items-start justify-between gap-2">
                                <span>{item.action} · {item.actor || 'sistema'}{item.reason ? ` · ${item.reason}` : ''}</span>
                                <span className="whitespace-nowrap text-gray-400">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {profile?.id && (
                <a
                    href={`/admin/directorio-clubes?clubId=${profile.id}`}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rotary-blue hover:underline"
                >
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir ficha 360° del club en el Directorio
                </a>
            )}
        </section>
    );
}
