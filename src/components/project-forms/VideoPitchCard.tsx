// ════════════════════════════════════════════════════════════════════
// Tarjeta «Video Pitch Profesional» del panel «Mi proyecto» — v4.1293.0
//
// Va en la MISMA cuadrícula que los formularios y la plantilla, ocupando las
// dos columnas en escritorio. Lo que muestra llega RESUELTO del servidor
// (`/portal/video-pitch`): estado, fecha, y qué botón corresponde:
//
//   · No solicitado → «Solicitar video pitch»
//   · Borrador / Información requerida → «Continuar solicitud»
//   · Enviada y en proceso → «Ver seguimiento»
//   · Entregado → «Ver video»
//
// En el ámbito del MÓDULO: declarada dentro de la página sería un tipo nuevo
// en cada render (v4.971).
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Clapperboard, CreditCard, Loader2, PenLine, RefreshCw, Video } from 'lucide-react';
import { BLUE } from './FormFields';
import { vpFetch, vpFmtDateTime, vpTone, type VpCardCopy, type VpPortalView, type VpStatus } from '../../lib/videoPitch';

const CARD = 'flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:col-span-2';

export const VIDEO_PITCH_DESCRIPTION = 'Presenta tu proyecto ante potenciales aliados y donantes mediante un video profesional que explique el problema, la solución, el impacto esperado y el apoyo que necesita tu comunidad.';

/** Respaldo cuando el servidor (anterior a v4.1296) no manda la tarjeta resuelta. */
const fallbackCard = (status: VpStatus, available: boolean): VpCardCopy => {
    if (!available) return { headline: null, actions: [] };
    if (status === 'not_requested') return { headline: null, actions: [{ key: 'start', label: 'Solicitar Video Pitch' }] };
    if (status === 'draft' || status === 'info_required') return { headline: null, actions: [{ key: 'open', label: 'Continuar solicitud' }] };
    if (status === 'delivered') return { headline: null, actions: [{ key: 'open', label: 'Ver video' }] };
    return { headline: null, actions: [{ key: 'open', label: 'Ver seguimiento' }] };
};
const ICONS = { start: Clapperboard, open: ChevronRight, pay: CreditCard, plan: PenLine } as const;

export type VpCardAction = 'start' | 'open' | 'pay' | 'plan';

export const VideoPitchCard = ({ token, onSessionExpired, onOpen, refreshKey = 0 }: { token: string; onSessionExpired: () => void; onOpen: (action: VpCardAction) => void; refreshKey?: number }) => {
    const [state, setState] = useState<VpPortalView | null>(null);
    const [loadError, setLoadError] = useState(false);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            const { res, data } = await vpFetch<VpPortalView>('/project-fair/portal/video-pitch', token);
            if (res.status === 401) { onSessionExpired(); return; }
            if (!res.ok || !data) throw new Error('load');
            setState(data);
        } catch {
            setLoadError(true);
        }
    }, [token, onSessionExpired]);

    useEffect(() => { load(); }, [load, refreshKey]);

    const status: VpStatus = state?.status || 'not_requested';
    const meta = state?.catalog?.statuses.find(s => s.key === status);
    const tone = vpTone(meta?.tone);
    // v4.1296 — Qué dice la tarjeta y qué botones ofrece lo decide el servidor
    // (casos A–E: borrador, pendiente de pago, pagado, en producción, entregado).
    const card: VpCardCopy | null = state ? (state.card || fallbackCard(status, state.available)) : null;
    const commercial = state?.commercial || null;
    const req = state?.request || null;
    const dateLine = !req ? null
        : req.deliveredAt ? `Entregado el ${vpFmtDateTime(req.deliveredAt)}`
        : req.updatedAt ? `Actualizado el ${vpFmtDateTime(req.updatedAt)}`
        : null;

    return (
        <div className={CARD} data-testid="video-pitch-card">
            <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${BLUE}12`, color: BLUE }}>
                    <Video size={19} />
                </span>
                {state && (
                    <span className="flex flex-wrap justify-end gap-1.5">
                        {commercial && commercial.status !== 'no_plan' && (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${vpTone(commercial.tone).badge}`}>
                                <CreditCard size={11} /> {commercial.label}
                            </span>
                        )}
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} /> {meta?.label || state.statusLabel}
                        </span>
                    </span>
                )}
            </div>

            <h3 className="mt-3 break-words text-[17px] font-bold leading-snug text-slate-900">Video Pitch Profesional</h3>
            {req?.number && <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Solicitud {req.number}</p>}
            <p className="mt-1.5 break-words text-[13px] leading-relaxed text-slate-500">{VIDEO_PITCH_DESCRIPTION}</p>

            {!state && !loadError && (
                <p className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Consultando tu solicitud…</p>
            )}
            {loadError && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-red-700">
                    <AlertCircle size={13} /> No pudimos consultar tu solicitud.
                    <button type="button" onClick={load} className="inline-flex items-center gap-1 font-bold underline"><RefreshCw size={12} /> Reintentar</button>
                </p>
            )}
            {state && !state.available && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{state.reason}</p>
            )}
            {state && state.available && req && req.status === 'draft' && (
                <div className="mt-3 flex items-center gap-2.5">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full transition-all" style={{ width: `${req.completionPct}%`, background: BLUE }} />
                    </div>
                    <span className="text-xs font-bold text-slate-600">{req.completionPct}%</span>
                </div>
            )}
            {card?.headline && (
                <p className={`mt-3 rounded-lg px-3 py-2 text-[12px] ${commercial && ['pending_payment', 'failed', 'processing'].includes(commercial.status) ? 'bg-amber-50 text-amber-900' : commercial?.status === 'paid' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'}`}>
                    {card.headline}{commercial?.order ? <span className="block text-[11px] opacity-80">{commercial.order.planName} · {commercial.order.amountLabel}</span> : null}
                </p>
            )}
            {state?.request?.infoRequest && state.status === 'info_required' && (
                <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-[12px] text-orange-900"><strong>El comité necesita:</strong> {state.request.infoRequest}</p>
            )}
            {dateLine && <p className="mt-2 text-[12px] text-slate-400">{dateLine}</p>}

            <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-4">
                {card && card.actions.length > 0 ? card.actions.map((a, i) => {
                    const Icon = ICONS[a.key] || ChevronRight;
                    return (
                        <button key={a.key} type="button" onClick={() => onOpen(a.key)}
                            className={`inline-flex items-center gap-1.5 text-sm font-bold hover:underline ${i === 0 ? '' : 'text-slate-600'}`}
                            style={i === 0 ? { color: BLUE } : undefined}>
                            <Icon size={15} /> {a.label}
                        </button>
                    );
                }) : (
                    <span className="inline-flex cursor-not-allowed items-center gap-1.5 text-sm font-bold text-slate-400"><Clapperboard size={15} /> Solicitar Video Pitch</span>
                )}
            </div>
        </div>
    );
};

export default VideoPitchCard;
