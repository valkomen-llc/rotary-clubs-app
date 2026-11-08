// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — la solicitud del participante (v4.1293.0)
//
// Una sola vista para todo el ciclo, en «Mi proyecto»:
//
//   · FORMULARIO (borrador o información requerida): cuatro bloques —
//     Identificación (precargada y, lo del proyecto, de sólo lectura), Información
//     para el video (descripción + preguntas guiadas con sugerencias IMPORTABLES
//     desde la Formulación), Material multimedia (subida directa a S3 con
//     avance, miniaturas, advertencias de calidad y reintento) y Preferencias.
//     Se guarda solo tres segundos después de dejar de escribir.
//   · SEGUIMIENTO (enviada): la línea de tiempo de estados, lo que el comité
//     pidió, el guion para aprobar o pedir ajustes, el video entregado, los
//     materiales y el historial, con un cuadro para escribirle al comité.
//
// Todo componente de este archivo vive en el ámbito del MÓDULO (v4.971).
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, AlertTriangle, ArrowLeft, Check, CheckCircle2, Clapperboard, CreditCard, Download, ExternalLink, FileText, Image as ImageIcon,
    Loader2, Lock, MessageSquare, PlayCircle, RefreshCw, Send, ShieldCheck, Sparkles, Trash2, Upload, Video, X,
} from 'lucide-react';
import { BLUE, inputCls } from './FormFields';
import {
    vpFetch, vpFmtDateTime, vpFmtSeconds, vpPutWithProgress, vpReadMediaMeta, vpTone,
    type VpAnswers, type VpCommercial, type VpFile, type VpPlan, type VpPortalView, type VpScript, type VpStatus,
} from '../../lib/videoPitch';

interface Props {
    token: string; onBack: () => void; onChanged?: () => void; onSessionExpired: () => void;
    /** v4.1296 — Lo que la tarjeta pidió al abrir: pagar la orden abierta o elegir/cambiar el plan. */
    initialAction?: 'pay' | 'plan' | null;
}
type SaveState = 'idle' | 'saving' | 'saved' | 'retrying' | 'error' | 'conflict';

interface UploadItem { localId: string; name: string; pct: number; status: 'uploading' | 'done' | 'error'; error?: string; file: File }

const emptyAnswers = (prefill: VpPortalView['prefill'] | null): VpAnswers => ({
    identification: { responsibleName: prefill?.identification.responsibleName || '', email: prefill?.identification.email || '', whatsapp: prefill?.identification.whatsapp || '' },
    // v4.1295 — El campo es para lo ADICIONAL: no se siembra con la descripción de la postulación, que ya está en el contexto.
    story: { description: '' },
    preferences: { language: 'es', objective: '', objectiveOther: '', notes: '' },
    consent: { mediaAuthorization: false },
});

const BLOCK = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';
const LABEL = 'mb-1.5 block text-sm font-semibold text-slate-800';
const HINT = 'mt-1 text-[12px] text-slate-500';

// ── Piezas ───────────────────────────────────────────────────────────
const Block = ({ letter, title, intro, children }: { letter: string; title: string; intro?: string; children: React.ReactNode }) => (
    <section className={BLOCK}>
        <div className="mb-4 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: BLUE }}>{letter}</span>
            <div>
                <h3 className="text-[16px] font-bold text-slate-900">{title}</h3>
                {intro && <p className="mt-0.5 text-[13px] text-slate-500">{intro}</p>}
            </div>
        </div>
        {children}
    </section>
);

const ReadOnly = ({ label, value }: { label: string; value: string }) => (
    <div>
        <span className={LABEL}>{label}</span>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-700">
            <Lock size={13} className="shrink-0 text-slate-400" /> <span className="break-words">{value || '—'}</span>
        </div>
    </div>
);

const Badge = ({ label, tone }: { label: string; tone?: string }) => {
    const t = vpTone(tone);
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${t.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> {label}
        </span>
    );
};

/** La línea de tiempo del proceso: los hitos, con el actual resaltado. */
const TIMELINE: { key: VpStatus; label: string }[] = [
    { key: 'submitted', label: 'Solicitud enviada' },
    { key: 'in_review', label: 'Revisión' },
    { key: 'script_in_progress', label: 'Guion' },
    { key: 'script_approved', label: 'Guion aprobado' },
    { key: 'in_production', label: 'Producción' },
    { key: 'finished', label: 'Revisión final' },
    { key: 'delivered', label: 'Entregado' },
];
const StatusTimeline = ({ stage, status }: { stage: number; status: VpStatus }) => {
    const stages = [2, 3, 4, 6, 7, 9, 10];
    return (
        <ol className="grid grid-cols-7 gap-1">
            {TIMELINE.map((t, i) => {
                const s = stages[i];
                const done = stage > s || status === 'delivered';
                const current = !done && (stage === s || (s === 3 && status === 'info_required') || (s === 4 && status === 'script_pending_approval') || (s === 9 && status === 'video_in_review'));
                return (
                    <li key={t.key} className="flex flex-col items-center text-center">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${done ? 'bg-emerald-500 text-white' : current ? 'text-white' : 'bg-slate-200 text-slate-500'}`}
                            style={current ? { background: BLUE } : undefined}>
                            {done ? <Check size={12} /> : i + 1}
                        </span>
                        <span className={`mt-1 hidden text-[10px] leading-tight sm:block ${current ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{t.label}</span>
                    </li>
                );
            })}
        </ol>
    );
};

const FileIcon = ({ kind }: { kind: VpFile['kind'] }) => (kind === 'video' ? <Video size={16} /> : kind === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />);

const FileTile = ({ file, token, canEdit, onDelete, onCaption }: { file: VpFile; token: string; canEdit: boolean; onDelete: (f: VpFile) => void; onCaption: (f: VpFile, caption: string) => void }) => {
    const [caption, setCaption] = useState(file.caption || '');
    const [opening, setOpening] = useState(false);
    const open = async () => {
        setOpening(true);
        try {
            const { data } = await vpFetch<{ url?: string; error?: string }>(`/project-fair/portal/video-pitch/files/${file.id}/url`, token);
            if (data?.url) window.open(data.url, '_blank', 'noopener');
        } finally { setOpening(false); }
    };
    return (
        <li className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <button type="button" onClick={open} title="Abrir" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg" style={{ background: `${BLUE}12`, color: BLUE }}>
                {opening ? <Loader2 size={16} className="animate-spin" /> : <FileIcon kind={file.kind} />}
            </button>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800" title={file.fileName}>{file.fileName}</p>
                <p className="text-[12px] text-slate-500">
                    {file.kindLabel} · {file.sizeLabel}{file.width && file.height ? ` · ${file.width}×${file.height}` : ''}{file.durationSec ? ` · ${vpFmtSeconds(file.durationSec)}` : ''}
                </p>
                {file.warnings.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                        {file.warnings.map((w, i) => <li key={i} className="flex items-start gap-1 text-[12px] text-amber-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}</li>)}
                    </ul>
                )}
                {canEdit ? (
                    <input value={caption} onChange={e => setCaption(e.target.value)} onBlur={() => { if (caption !== (file.caption || '')) onCaption(file, caption); }}
                        placeholder="¿Qué muestra? (opcional)" className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] focus:border-[#17458F] focus:outline-none" />
                ) : file.caption ? <p className="mt-1 text-[12px] italic text-slate-600">{file.caption}</p> : null}
            </div>
            {canEdit && (
                <button type="button" onClick={() => onDelete(file)} title="Quitar" className="self-start rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
            )}
        </li>
    );
};

const ScriptReader = ({ script, files }: { script: VpScript; files: VpFile[] }) => {
    const c = script.content;
    const nameOf = (id: string) => files.find(f => f.id === id)?.fileName || 'material';
    return (
        <div className="space-y-3">
            {c.title && <h4 className="text-[16px] font-bold text-slate-900">{c.title}</h4>}
            {c.summary && <p className="text-[13px] text-slate-600">{c.summary}</p>}
            <p className="text-[12px] text-slate-500">Duración estimada: <strong>{vpFmtSeconds(c.totalSeconds)}</strong> · Versión {script.versionNumber}</p>
            <ol className="space-y-3">
                {c.scenes.map(s => (
                    <li key={s.number} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-bold text-slate-800">Escena {s.number} · {s.title}</p>
                            <span className="text-[12px] font-semibold text-slate-500">{vpFmtSeconds(s.durationSec)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">{s.narration}</p>
                        {s.visual && <p className="mt-2 text-[12px] text-slate-600"><strong>En pantalla:</strong> {s.visual}</p>}
                        {s.onScreenText && <p className="mt-1 text-[12px] text-slate-600"><strong>Texto sugerido:</strong> {s.onScreenText}</p>}
                        {s.materials.length > 0 && <p className="mt-1 text-[12px] text-slate-500"><strong>Tus materiales:</strong> {s.materials.map(nameOf).join(', ')}</p>}
                    </li>
                ))}
            </ol>
            {c.missingInfo?.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
                    <p className="font-bold">Información que ayudaría a mejorar el guion:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{c.missingInfo.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
            )}
        </div>
    );
};

const EventList = ({ events }: { events: VpPortalView['events'] }) => (
    <ol className="space-y-2">
        {events.map(e => (
            <li key={e.id} className="flex gap-3 text-[13px]">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{e.title || e.type}</p>
                    {e.detail && <p className="whitespace-pre-wrap text-slate-600">{e.detail}</p>}
                    <p className="text-[11px] text-slate-400">{vpFmtDateTime(e.createdAt)}{e.actorName ? ` · ${e.actorRole === 'club' ? 'Tú' : 'Comité'}` : ''}</p>
                </div>
            </li>
        ))}
        {!events.length && <li className="text-[13px] text-slate-400">Todavía no hay movimientos.</li>}
    </ol>
);

// ── Planes (v4.1296) ─────────────────────────────────────────────────
/**
 * El modal de planes. Los precios y las características llegan del servidor
 * (la configuración del comité): acá no hay un número escrito. «Pagar ahora»
 * y «Guardar y pagar después» guardan primero la solicitud y el plan: la
 * compra nunca es lo que guarda la información.
 */
/** Colores de las etapas de producción, en el orden del reparto. */
const CREDIT_COLORS = ['#17458F', '#0EA5A4', '#F7A81B', '#7C3AED', '#64748B'];
const fmtCredits = (n: number) => Number(n || 0).toLocaleString('es-CO');

/**
 * El cupo de créditos de producción IA de un plan y su reparto por etapa
 * (v4.1297): es lo que hace legible el precio —se paga la producción asistida
 * por IA—, no una tarifa arbitraria.
 */
const CreditsMeter = ({ plan, stages }: { plan: VpPlan; stages: { key: string; label: string; hint: string }[] }) => {
    if (!plan.creditsIncluded || !plan.creditsBreakdown?.length) return null;
    const hintOf = (key: string) => stages.find(s => s.key === key)?.hint || '';
    return (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[12px] font-bold text-slate-800">{fmtCredits(plan.creditsIncluded)} créditos de producción IA incluidos</p>
            <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                {plan.creditsBreakdown.map((b, i) => <span key={b.key} title={`${b.label}: ${b.share}%`} style={{ width: `${b.share}%`, background: CREDIT_COLORS[i % CREDIT_COLORS.length] }} />)}
            </div>
            <ul className="mt-2 space-y-1">
                {plan.creditsBreakdown.map((b, i) => (
                    <li key={b.key} className="flex items-start gap-2 text-[11.5px] text-slate-600" title={hintOf(b.key)}>
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: CREDIT_COLORS[i % CREDIT_COLORS.length] }} />
                        <span className="flex-1">{b.label}</span>
                        <span className="shrink-0 font-semibold text-slate-700">{fmtCredits(Math.round((plan.creditsIncluded * b.share) / 100))} <span className="font-normal text-slate-400">· {b.share}%</span></span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const PlanPickerModal = ({ plans, selected, onSelect, onPayNow, onPayLater, onClose, busy, currentPlanId, creditStages }: {
    plans: VpPlan[]; selected: string | null; onSelect: (code: string) => void; onPayNow: () => void; onPayLater: () => void; onClose: () => void;
    busy: null | 'pay' | 'later'; currentPlanId: string | null; creditStages: { key: string; label: string; hint: string }[];
}) => (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
        <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Feria de Proyectos Rotary Colombia</p>
                    <h3 className="mt-1 text-2xl font-bold text-slate-900">Elige tu Video Pitch Profesional</h3>
                    <p className="mt-1 text-[14px] text-slate-600">Transforma tu proyecto en una presentación audiovisual diseñada para comunicar su impacto y facilitar la búsqueda de aliados y apoyo.</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X size={18} /></button>
            </div>

            {/* v4.1297 — Qué se paga: la producción asistida por IA, medida en créditos. */}
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <p className="flex items-center gap-2 text-[14px] font-bold text-slate-900"><Sparkles size={15} style={{ color: BLUE }} /> ¿Qué cubre el precio?</p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
                    La producción de tu video con la inteligencia artificial integrada en la plataforma: convertir la información de tu proyecto y los materiales que subes en un guion con storytelling, darle voz y subtítulos, animar y componer las escenas con tus fotos y videos, y renderizar el resultado con sus rondas de ajustes. Cada plan incluye un cupo de <strong>créditos de producción IA</strong>, la capacidad de procesamiento que esa producción consume: a más entregables (por ejemplo, la versión vertical para redes), más créditos.
                </p>
                {creditStages.length > 0 && (
                    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {creditStages.map(s => <li key={s.key} className="text-[12px] text-slate-600"><strong className="text-slate-800">{s.label}:</strong> {s.hint}</li>)}
                    </ul>
                )}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
                {plans.map(plan => {
                    const active = selected === plan.code;
                    return (
                        <button key={plan.id} type="button" onClick={() => onSelect(plan.code)}
                            className={`relative flex h-full flex-col rounded-2xl border-2 p-5 text-left transition ${active ? 'border-[#17458F] bg-blue-50/40 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                            {plan.badge && <span className="absolute -top-3 left-5 rounded-full px-3 py-1 text-[11px] font-bold text-white" style={{ background: '#F7A81B' }}>{plan.badge}</span>}
                            {currentPlanId === plan.id && <span className="absolute -top-3 right-5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white">Tu plan actual</span>}
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="text-[17px] font-bold text-slate-900">{plan.name}</h4>
                                    <p className="mt-0.5 text-[13px] text-slate-500">{plan.description}</p>
                                </div>
                                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-[#17458F] bg-[#17458F] text-white' : 'border-slate-300'}`}>{active && <Check size={14} />}</span>
                            </div>
                            <p className="mt-4 text-3xl font-bold text-slate-900">{plan.priceLabel}</p>
                            <CreditsMeter plan={plan} stages={creditStages} />
                            <ul className="mt-4 space-y-1.5">
                                {plan.features.map((f, i) => <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> {f}</li>)}
                            </ul>
                            <span className={`mt-5 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold ${active ? 'text-white' : 'border border-slate-300 text-slate-700'}`} style={active ? { background: BLUE } : undefined}>
                                {active ? 'Plan seleccionado' : 'Seleccionar plan'}
                            </span>
                        </button>
                    );
                })}
                {!plans.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 md:col-span-2">Todavía no hay planes publicados. Escríbele al comité organizador.</p>}
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[12px] text-slate-600">
                    <p className="flex items-center gap-1.5 font-semibold text-slate-800"><ShieldCheck size={14} className="text-emerald-600" /> Tu solicitud está protegida</p>
                    <p>Tus datos y archivos permanecen guardados aunque decidas pagar después. La producción comienza tras la confirmación del pago y con los materiales necesarios.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={onPayLater} disabled={!selected || busy !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {busy === 'later' ? <Loader2 size={15} className="animate-spin" /> : null} Guardar y pagar después
                    </button>
                    <button type="button" onClick={onPayNow} disabled={!selected || busy !== null} className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>
                        {busy === 'pay' ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} Pagar ahora
                    </button>
                </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">Los impuestos o cargos aplicables, si los hubiera, se muestran en la pasarela antes de confirmar el pago. La publicación en redes institucionales depende de la aprobación de sus administradores.</p>
        </div>
    </div>
);

/** El estado comercial, con lo que el club puede hacer: pagar, cambiar de plan, ver el comprobante. */
const CommercialBanner = ({ commercial, onPay, onChangePlan, paying }: { commercial: VpCommercial; onPay: () => void; onChangePlan: () => void; paying: boolean }) => {
    const t = vpTone(commercial.tone);
    const o = commercial.order;
    if (commercial.status === 'no_plan' && !commercial.paymentWaived) return null;
    return (
        <section className={`rounded-2xl border p-5 shadow-sm ${commercial.status === 'paid' ? 'border-emerald-200 bg-emerald-50/50' : commercial.status === 'failed' ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="flex items-center gap-2 text-[16px] font-bold text-slate-900">
                        <CreditCard size={17} style={{ color: BLUE }} />
                        {commercial.status === 'paid' ? 'Pago confirmado' : commercial.status === 'processing' ? 'Pago en proceso' : commercial.status === 'failed' ? 'El pago no se completó' : commercial.status === 'refunded' ? 'Pago reembolsado' : commercial.paymentWaived ? 'Producción autorizada por el comité' : 'Video Pitch pendiente de pago'}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${t.badge}`}>{commercial.label}</span>
                    </p>
                    {o && <p className="mt-1 text-[13px] text-slate-700"><strong>{o.planName}</strong> · {o.amountLabel}{o.paidAt ? ` · pagado el ${vpFmtDateTime(o.paidAt)}` : ''}</p>}
                    {commercial.status === 'pending_payment' && <p className="mt-1 text-[13px] text-slate-600">Tu solicitud y materiales están guardados. Solo falta completar el pago para iniciar la producción.</p>}
                    {commercial.status === 'processing' && <p className="mt-1 text-[13px] text-slate-600">Tienes una sesión de pago abierta. Si ya pagaste, la confirmación llega en unos segundos; si no, puedes continuar el pago.</p>}
                    {commercial.status === 'failed' && <p className="mt-1 text-[13px] text-slate-700">{o?.failureMessage || 'La pasarela rechazó el pago.'} Tus datos siguen guardados: puedes intentarlo de nuevo.</p>}
                    {commercial.paymentWaived && commercial.status !== 'paid' && <p className="mt-1 text-[13px] text-slate-600">El comité autorizó continuar sin pago confirmado.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                    {commercial.canPay && (
                        <button type="button" onClick={onPay} disabled={paying} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                            {paying ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} {commercial.status === 'processing' ? 'Continuar el pago' : commercial.status === 'failed' ? 'Reintentar el pago' : 'Pagar ahora'}
                        </button>
                    )}
                    {commercial.canChoosePlan && (
                        <button type="button" onClick={onChangePlan} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Cambiar plan</button>
                    )}
                    {o?.receiptUrl && commercial.status === 'paid' && (
                        <a href={o.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><ExternalLink size={14} /> Ver comprobante</a>
                    )}
                </div>
            </div>
        </section>
    );
};

// ── La vista ─────────────────────────────────────────────────────────
const VideoPitchRequestView = ({ token, onBack, onChanged, onSessionExpired, initialAction = null }: Props) => {
    const [view, setView] = useState<VpPortalView | null>(null);
    const [loading, setLoading] = useState(true);
    const [answers, setAnswers] = useState<VpAnswers>(emptyAnswers(null));
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const [decisionComment, setDecisionComment] = useState('');
    const [deciding, setDeciding] = useState<null | 'approve' | 'changes'>(null);
    const [message, setMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoBusy, setVideoBusy] = useState(false);
    const dirty = useRef(false);
    const fileInput = useRef<HTMLInputElement | null>(null);
    // v4.1296 — Capa comercial: revisión del borrador (ediciones simultáneas),
    // estado del autoguardado, modal de planes y pago.
    const revision = useRef<string | null>(null);
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [planModal, setPlanModal] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [planBusy, setPlanBusy] = useState<null | 'pay' | 'later'>(null);
    const [paying, setPaying] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const initialActionDone = useRef(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const { res, data } = await vpFetch<VpPortalView>('/project-fair/portal/video-pitch', token);
            if (res.status === 401) { onSessionExpired(); return; }
            if (!res.ok || !data) throw new Error((data as any)?.error || 'No pudimos cargar tu solicitud.');
            setView(data);
            revision.current = data.revision || null;
            if (!dirty.current) setAnswers(data.request ? data.request.answers : emptyAnswers(data.prefill));
            if (data.commercial?.planId && !selectedPlan) setSelectedPlan(data.plans?.find(p => p.id === data.commercial?.planId)?.code || null);
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos cargar tu solicitud.' });
        } finally {
            setLoading(false);
        }
    }, [token, onSessionExpired]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

    const canEdit = Boolean(view?.canEdit);
    const files = view?.files || [];
    const catalog = view?.catalog;

    // ── Guardado ─────────────────────────────────────────────────────
    const save = useCallback(async (silent = false): Promise<boolean> => {
        if (!canEdit) return true;
        setSaving(true); setSaveState('saving');
        if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
        try {
            const { res, data } = await vpFetch<{ savedAt?: string; revision?: string; completionPct?: number; error?: string; conflict?: boolean; answers?: VpAnswers }>('/project-fair/portal/video-pitch', token, {
                method: 'PUT', body: JSON.stringify({ answers, clientRevision: revision.current }),
            });
            if (res.status === 401) { onSessionExpired(); return false; }
            if (res.status === 409 && data?.conflict) {
                // Otra pestaña o dispositivo guardó después: no se pisa. Se muestra lo guardado y la persona decide.
                dirty.current = false;
                revision.current = data.revision || null;
                if (data.answers) setAnswers(data.answers);
                setSaveState('conflict');
                setNotice({ kind: 'info', text: data.error || 'La solicitud se guardó desde otra pestaña o dispositivo. Mostramos la versión más reciente.' });
                return false;
            }
            if (!res.ok) throw new Error(data?.error || 'No pudimos guardar.');
            setSavedAt(data?.savedAt || new Date().toISOString());
            revision.current = data?.revision || data?.savedAt || revision.current;
            dirty.current = false;
            setSaveState('saved');
            if (!view?.exists) await load(true);
            onChanged?.();
            if (!silent) setNotice({ kind: 'ok', text: 'Cambios guardados.' });
            return true;
        } catch (e: any) {
            // Un fallo de red no borra nada: se reintenta UNA vez en 5 s y, si vuelve a fallar, se dice.
            setSaveState('retrying');
            retryTimer.current = setTimeout(async () => {
                retryTimer.current = null;
                try {
                    const { res } = await vpFetch('/project-fair/portal/video-pitch', token, { method: 'PUT', body: JSON.stringify({ answers, clientRevision: revision.current }) });
                    if (res.ok) { dirty.current = false; setSaveState('saved'); setSavedAt(new Date().toISOString()); return; }
                } catch { /* sigue */ }
                setSaveState('error');
                setNotice({ kind: 'error', text: 'No pudimos guardar tus cambios. Revisa tu conexión: lo que escribiste sigue en esta pantalla.' });
            }, 5000);
            if (!silent) setNotice({ kind: 'error', text: e?.message || 'No pudimos guardar.' });
            return false;
        } finally {
            setSaving(false);
        }
    }, [answers, canEdit, token, onSessionExpired, onChanged, load, view?.exists]);

    useEffect(() => {
        if (!dirty.current || !canEdit) return;
        const t = setTimeout(() => { save(true); }, 3000);
        return () => clearTimeout(t);
    }, [answers, canEdit, save]);

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', handler);
        return () => { window.removeEventListener('beforeunload', handler); if (retryTimer.current) clearTimeout(retryTimer.current); };
    }, []);

    // ── Volver de Stripe ─────────────────────────────────────────────
    // El servidor consulta la sesión y aplica el desenlace: la URL no decide nada.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('vp_session');
        const cancelled = params.get('vp_pago') === 'cancelado';
        if (!sessionId && !cancelled) return;
        const url = new URL(window.location.href);
        url.searchParams.delete('vp_session'); url.searchParams.delete('vp_pago');
        window.history.replaceState(null, '', url.toString());
        if (cancelled) { setNotice({ kind: 'info', text: 'No se realizó el pago. Tu solicitud y tus materiales siguen guardados: puedes pagar cuando quieras.' }); return; }
        (async () => {
            setNotice({ kind: 'info', text: 'Verificando tu pago con la pasarela…' });
            try {
                const { data } = await vpFetch<{ outcome?: string; error?: string }>('/project-fair/portal/video-pitch/checkout/sync', token, { method: 'POST', body: JSON.stringify({ sessionId }) });
                if (data?.outcome === 'paid') setNotice({ kind: 'ok', text: 'Pago confirmado. Tu solicitud quedó enviada al comité, que revisará la información de tu proyecto.' });
                else if (data?.outcome === 'open') setNotice({ kind: 'info', text: 'El pago todavía no se confirmó. Si lo completaste, la confirmación llega en unos segundos; si no, puedes continuar el pago.' });
                else setNotice({ kind: 'info', text: 'Todavía no vemos el pago confirmado. Si Stripe lo aceptó, la confirmación llega en unos segundos.' });
            } catch {
                setNotice({ kind: 'error', text: 'No pudimos verificar el pago en este momento. Vuelve a cargar la página en unos segundos.' });
            }
            await load(true);
            onChanged?.();
        })();
    }, [token, load, onChanged]);

    const set = <K extends keyof VpAnswers>(block: K, key: string, value: any) => {
        dirty.current = true;
        setErrors(prev => prev.filter(e => e.field !== `${block}.${key}`));
        setAnswers(prev => ({ ...prev, [block]: { ...(prev[block] as any), [key]: value } }));
    };
    const errorOf = (field: string) => errors.find(e => e.field === field)?.message || null;

    // ── Archivos ─────────────────────────────────────────────────────
    const ensureDraftSaved = useCallback(async () => {
        if (view?.exists) return true;
        const { res } = await vpFetch('/project-fair/portal/video-pitch', token, { method: 'PUT', body: JSON.stringify({ answers }) });
        if (!res.ok) return false;
        await load(true);
        return true;
    }, [view?.exists, token, answers, load]);

    const uploadOne = useCallback(async (item: UploadItem) => {
        const update = (patch: Partial<UploadItem>) => setUploads(prev => prev.map(u => (u.localId === item.localId ? { ...u, ...patch } : u)));
        try {
            update({ status: 'uploading', pct: 0, error: undefined });
            const pre = await vpFetch<{ uploadUrl?: string; storageKey?: string; contentType?: string; error?: string }>('/project-fair/portal/video-pitch/files/presign', token, {
                method: 'POST', body: JSON.stringify({ filename: item.file.name, size: item.file.size }),
            });
            if (pre.res.status === 401) { onSessionExpired(); return; }
            if (!pre.res.ok || !pre.data?.uploadUrl) throw new Error(pre.data?.error || 'No pudimos preparar la subida.');
            await vpPutWithProgress(pre.data.uploadUrl, item.file, pre.data.contentType || item.file.type, pct => update({ pct }));
            const meta = await vpReadMediaMeta(item.file);
            const reg = await vpFetch<{ file?: VpFile; error?: string }>('/project-fair/portal/video-pitch/files', token, {
                method: 'POST', body: JSON.stringify({ storageKey: pre.data.storageKey, filename: item.file.name, ...meta }),
            });
            if (!reg.res.ok || !reg.data?.file) throw new Error(reg.data?.error || 'El servidor no aceptó el archivo.');
            update({ status: 'done', pct: 100 });
            setView(prev => (prev ? { ...prev, files: [...prev.files, reg.data!.file!] } : prev));
            onChanged?.();
            setTimeout(() => setUploads(prev => prev.filter(u => u.localId !== item.localId)), 1500);
        } catch (e: any) {
            update({ status: 'error', error: e?.message || 'No se pudo subir.' });
        }
    }, [token, onSessionExpired, onChanged]);

    const onPickFiles = async (list: FileList | null) => {
        if (!list || !list.length || !catalog) return;
        const ok = await ensureDraftSaved();
        if (!ok) { setNotice({ kind: 'error', text: 'No pudimos crear el borrador para adjuntar archivos.' }); return; }
        const accepted = catalog.accept.split(',');
        const room = catalog.maxFiles - files.length - uploads.filter(u => u.status !== 'error').length;
        const items: UploadItem[] = [];
        Array.from(list).slice(0, Math.max(0, room)).forEach(file => {
            const ext = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
            const kind = ['.jpg', '.jpeg', '.png'].includes(ext) ? 'image' : ['.mp4', '.mov'].includes(ext) ? 'video' : ext === '.pdf' ? 'document' : null;
            const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            if (!accepted.includes(ext) || !kind) { items.push({ localId, name: file.name, pct: 0, status: 'error', error: `Formato no admitido. Acepta ${catalog.accept}.`, file }); return; }
            if (file.size > (catalog.limits[kind] || 25) * 1024 * 1024) { items.push({ localId, name: file.name, pct: 0, status: 'error', error: `Supera el tope de ${catalog.limits[kind]} MB.`, file }); return; }
            items.push({ localId, name: file.name, pct: 0, status: 'uploading', file });
        });
        if (list.length > room) setNotice({ kind: 'info', text: `Se admiten hasta ${catalog.maxFiles} archivos por solicitud.` });
        setUploads(prev => [...prev, ...items]);
        for (const item of items.filter(i => i.status === 'uploading')) await uploadOne(item);
        if (fileInput.current) fileInput.current.value = '';
    };

    const deleteFile = async (file: VpFile) => {
        if (!window.confirm(`¿Quitar «${file.fileName}» de la solicitud?`)) return;
        const { res, data } = await vpFetch<{ error?: string }>(`/project-fair/portal/video-pitch/files/${file.id}`, token, { method: 'DELETE' });
        if (!res.ok) { setNotice({ kind: 'error', text: data?.error || 'No pudimos quitar el archivo.' }); return; }
        setView(prev => (prev ? { ...prev, files: prev.files.filter(f => f.id !== file.id) } : prev));
        onChanged?.();
    };
    const setCaption = async (file: VpFile, caption: string) => {
        const { res, data } = await vpFetch<{ file?: VpFile }>(`/project-fair/portal/video-pitch/files/${file.id}`, token, { method: 'PATCH', body: JSON.stringify({ caption }) });
        if (res.ok && data?.file) setView(prev => (prev ? { ...prev, files: prev.files.map(f => (f.id === file.id ? data.file! : f)) } : prev));
    };

    // ── Envío ────────────────────────────────────────────────────────
    const submit = async () => {
        if (submitting) return;
        setSubmitting(true);
        setErrors([]);
        try {
            const { res, data } = await vpFetch<{ number?: string; error?: string; errors?: { field: string; message: string }[]; warnings?: string[] }>('/project-fair/portal/video-pitch/submit', token, {
                method: 'POST', body: JSON.stringify({ answers }),
            });
            if (res.status === 401) { onSessionExpired(); return; }
            if (!res.ok) {
                if (data?.errors?.length) { setErrors(data.errors); setNotice({ kind: 'error', text: 'Revisa los campos marcados antes de enviar.' }); }
                else setNotice({ kind: 'error', text: data?.error || 'No pudimos enviar la solicitud.' });
                return;
            }
            dirty.current = false;
            setNotice({ kind: 'ok', text: `Solicitud ${data?.number || ''} enviada. Te avisaremos por correo con cada avance.`.replace('  ', ' ') });
            await load(true);
            onChanged?.();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
            setNotice({ kind: 'error', text: 'No pudimos enviar la solicitud. Inténtalo de nuevo.' });
        } finally {
            setSubmitting(false);
        }
    };

    // ── Solicitar Video Pitch: validar → guardar → planes ───────────
    const requestVideoPitch = async () => {
        if (requesting) return;
        setRequesting(true); setErrors([]);
        try {
            const saved = await save(true);
            if (!saved && saveState === 'conflict') return;
            const { res, data } = await vpFetch<VpPortalView>('/project-fair/portal/video-pitch', token);
            if (res.status === 401) { onSessionExpired(); return; }
            if (!res.ok || !data) throw new Error('No pudimos comprobar la solicitud.');
            setView(data);
            if (data.validation && !data.validation.ok) {
                setErrors(data.validation.errors);
                setNotice({ kind: 'error', text: 'Revisa los campos marcados antes de solicitar el video.' });
                const first = data.validation.errors[0]?.field;
                const el = first ? document.getElementById(`vp-${first.split('.')[1] === 'responsibleName' ? 'responsible' : first.split('.')[1] === 'whatsapp' ? 'wa' : first.split('.')[1] === 'language' ? 'lang' : first.split('.')[1] === 'objective' ? 'obj' : first.split('.')[1] === 'objectiveOther' ? 'obj-other' : first.split('.')[1]}`) : null;
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            setPlanModal(true);
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos continuar.' });
        } finally {
            setRequesting(false);
        }
    };

    const payNow = useCallback(async () => {
        setPaying(true);
        try {
            const { res, data } = await vpFetch<{ url?: string; alreadyPaid?: boolean; error?: string; code?: string }>('/project-fair/portal/video-pitch/checkout', token, {
                method: 'POST', body: JSON.stringify({ returnUrl: window.location.href }),
            });
            if (res.status === 401) { onSessionExpired(); return; }
            if (data?.alreadyPaid) { setNotice({ kind: 'ok', text: 'Este pago ya estaba confirmado.' }); await load(true); return; }
            if (data?.code === 'no_plan') { setPlanModal(true); return; }
            if (!res.ok || !data?.url) throw new Error(data?.error || 'No pudimos iniciar el pago.');
            window.location.assign(data.url);
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos iniciar el pago.' });
        } finally {
            setPaying(false);
        }
    }, [token, onSessionExpired, load]);

    const choosePlan = async (mode: 'pay' | 'later') => {
        if (!selectedPlan) return;
        setPlanBusy(mode);
        try {
            const { res, data } = await vpFetch<{ error?: string; errors?: { field: string; message: string }[] }>('/project-fair/portal/video-pitch/plan', token, {
                method: 'POST', body: JSON.stringify({ planCode: selectedPlan, answers: canEdit ? answers : undefined }),
            });
            if (res.status === 401) { onSessionExpired(); return; }
            if (!res.ok) {
                if (data?.errors?.length) { setErrors(data.errors); setPlanModal(false); setNotice({ kind: 'error', text: 'Revisa los campos marcados antes de solicitar el video.' }); return; }
                throw new Error(data?.error || 'No pudimos guardar el plan.');
            }
            dirty.current = false;
            if (mode === 'pay') { await payNow(); return; }
            setPlanModal(false);
            setNotice({ kind: 'ok', text: 'Tu solicitud y tu plan quedaron guardados. Puedes pagar cuando quieras desde esta pantalla o desde la tarjeta de «Mi proyecto».' });
            await load(true);
            onChanged?.();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos guardar el plan.' });
        } finally {
            setPlanBusy(null);
        }
    };

    // Lo que la tarjeta pidió al abrir: pagar o elegir plan.
    useEffect(() => {
        if (!view || initialActionDone.current || !initialAction) return;
        initialActionDone.current = true;
        if (initialAction === 'plan') setPlanModal(true);
        if (initialAction === 'pay') { if (view.commercial?.canPay) payNow(); else setPlanModal(true); }
    }, [view, initialAction, payNow]);

    // ── Decisión sobre el guion ──────────────────────────────────────
    const decide = async (decision: 'approve' | 'changes') => {
        if (decision === 'changes' && !decisionComment.trim()) { setNotice({ kind: 'error', text: 'Cuéntanos qué ajustes necesita el guion.' }); return; }
        if (decision === 'approve' && !window.confirm('¿Apruebas este guion? Con tu aprobación el comité pasa a producir el video.')) return;
        setDeciding(decision);
        try {
            const { res, data } = await vpFetch<{ error?: string }>('/project-fair/portal/video-pitch/script/decision', token, { method: 'POST', body: JSON.stringify({ decision, comment: decisionComment }) });
            if (!res.ok) throw new Error(data?.error || 'No pudimos registrar tu decisión.');
            setDecisionComment('');
            setNotice({ kind: 'ok', text: decision === 'approve' ? 'Guion aprobado. El comité continuará con la producción.' : 'Pedimos los ajustes al comité.' });
            await load(true);
            onChanged?.();
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message });
        } finally {
            setDeciding(null);
        }
    };

    const sendMessage = async () => {
        if (!message.trim()) return;
        setSendingMessage(true);
        try {
            const { res, data } = await vpFetch<{ error?: string }>('/project-fair/portal/video-pitch/messages', token, { method: 'POST', body: JSON.stringify({ text: message }) });
            if (!res.ok) throw new Error(data?.error || 'No pudimos enviar el mensaje.');
            setMessage('');
            await load(true);
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message });
        } finally {
            setSendingMessage(false);
        }
    };

    const openVideo = async (download = false) => {
        if (!view?.deliverable) return;
        setVideoBusy(true);
        try {
            const { res, data } = await vpFetch<{ url?: string; error?: string }>(`/project-fair/portal/video-pitch/files/${view.deliverable.id}/url${download ? '?download=1' : ''}`, token);
            if (!res.ok || !data?.url) throw new Error(data?.error || 'No pudimos abrir el video.');
            if (download) window.location.assign(data.url); else setVideoUrl(data.url);
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message });
        } finally {
            setVideoBusy(false);
        }
    };

    // ── Render ───────────────────────────────────────────────────────
    const req = view?.request || null;
    const status: VpStatus = view?.status || 'not_requested';
    const meta = catalog?.statuses.find(s => s.key === status);
    const currentScript = useMemo(() => (view?.scripts || []).find(s => s.id === req?.currentScriptId) || (view?.scripts || [])[0] || null, [view?.scripts, req?.currentScriptId]);
    const approvedScript = useMemo(() => (view?.scripts || []).find(s => s.id === req?.approvedScriptId) || null, [view?.scripts, req?.approvedScriptId]);
    const showForm = Boolean(view && view.available && (canEdit || !view.exists));
    const context = view?.context || { items: [], hasFormulation: false, hasProjectContext: false };

    if (loading && !view) {
        return <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> Cargando tu solicitud…</div>;
    }

    return (
        <div className="space-y-5">
            {/* Cabecera */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft size={15} /> Volver a mi proyecto</button>
                    <h2 className="mt-2 flex items-center gap-2 text-xl font-bold text-slate-900"><Clapperboard size={20} style={{ color: BLUE }} /> Video Pitch Profesional</h2>
                    <p className="text-[13px] text-slate-500">{view?.identity.projectName} · {view?.identity.clubName} · {view?.identity.district}{req?.number ? ` · Solicitud ${req.number}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    {meta && <Badge label={meta.label} tone={meta.tone} />}
                    {canEdit && (
                        <span className={`inline-flex items-center gap-1 text-[11px] ${saveState === 'error' ? 'text-red-600' : saveState === 'retrying' ? 'text-amber-700' : 'text-slate-400'}`}>
                            {saveState === 'saving' && <><Loader2 size={11} className="animate-spin" /> Guardando…</>}
                            {saveState === 'saved' && <><CheckCircle2 size={11} className="text-emerald-600" /> Todos los cambios guardados</>}
                            {saveState === 'retrying' && <><RefreshCw size={11} className="animate-spin" /> Sin conexión: reintentando…</>}
                            {saveState === 'error' && <><AlertCircle size={11} /> Error al guardar</>}
                            {saveState === 'conflict' && <><AlertCircle size={11} /> Actualizado desde otra pestaña</>}
                            {saveState === 'idle' && (savedAt ? `Guardado ${vpFmtDateTime(savedAt)}` : 'Se guarda solo')}
                        </span>
                    )}
                </div>
            </div>

            {notice && (
                <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : notice.kind === 'info' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-red-200 bg-red-50 text-red-800'}`} role="status">
                    {notice.kind === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                    <span>{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">Cerrar</button>
                </div>
            )}

            {view && !view.available && (
                <div className={BLOCK}><p className="flex items-start gap-2 text-sm text-slate-700"><Lock size={16} className="mt-0.5 shrink-0 text-slate-400" /> {view.reason}</p></div>
            )}

            {/* ── Plan y pago (v4.1296) ─────────────────────────────── */}
            {view?.commercial && view.exists && <CommercialBanner commercial={view.commercial} onPay={payNow} onChangePlan={() => setPlanModal(true)} paying={paying} />}

            {/* ── Seguimiento (solicitud enviada) ───────────────────── */}
            {view && view.exists && status !== 'draft' && (
                <section className={BLOCK}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-[16px] font-bold text-slate-900">Seguimiento de tu solicitud</h3>
                        <span className="text-[12px] text-slate-500">Radicada el {vpFmtDateTime(req?.submittedAt)}</span>
                    </div>
                    {status !== 'cancelled' && <StatusTimeline stage={req?.stage || 0} status={status} />}
                    {status === 'cancelled' && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">La solicitud fue cancelada. Si crees que es un error, escríbele al comité más abajo.</p>}
                    {status === 'info_required' && req?.infoRequest && (
                        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-[14px] text-orange-950">
                            <p className="font-bold">El comité necesita información adicional</p>
                            <p className="mt-1 whitespace-pre-wrap">{req.infoRequest}</p>
                            <p className="mt-2 text-[12px] text-orange-800">Completa lo que falta abajo y vuelve a enviar la solicitud.</p>
                        </div>
                    )}
                    {req?.assigneeName && <p className="mt-3 text-[12px] text-slate-500">Responsable de producción: <strong className="text-slate-700">{req.assigneeName}</strong></p>}
                </section>
            )}

            {/* ── Video entregado ───────────────────────────────────── */}
            {view?.deliverable && status === 'delivered' && (
                <section className={BLOCK}>
                    <h3 className="flex items-center gap-2 text-[16px] font-bold text-slate-900"><PlayCircle size={18} style={{ color: BLUE }} /> Tu Video Pitch está listo</h3>
                    <p className="mt-1 text-[13px] text-slate-500">{view.deliverable.fileName} · {view.deliverable.sizeLabel}{view.deliverable.durationSec ? ` · ${vpFmtSeconds(view.deliverable.durationSec)}` : ''} · Entregado el {vpFmtDateTime(req?.deliveredAt)}</p>
                    {videoUrl ? (
                        <video controls src={videoUrl} className="mt-4 w-full rounded-xl bg-black" style={{ maxHeight: 480 }} />
                    ) : (
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => openVideo(false)} disabled={videoBusy} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                                {videoBusy ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />} Ver video
                            </button>
                            <button type="button" onClick={() => openVideo(true)} disabled={videoBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                                <Download size={15} /> Descargar
                            </button>
                        </div>
                    )}
                    {videoUrl && <button type="button" onClick={() => openVideo(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold hover:underline" style={{ color: BLUE }}><Download size={14} /> Descargar el video</button>}
                </section>
            )}

            {/* ── Guion para aprobar ────────────────────────────────── */}
            {view?.canDecideScript && currentScript && (
                <section className={BLOCK}>
                    <h3 className="flex items-center gap-2 text-[16px] font-bold text-slate-900"><Sparkles size={18} style={{ color: BLUE }} /> El guion de tu video está listo para tu revisión</h3>
                    <p className="mt-1 text-[13px] text-slate-500">Léelo con calma. Si estás de acuerdo, apruébalo; si no, cuéntanos qué cambiar y el comité lo ajusta.</p>
                    <div className="mt-4"><ScriptReader script={currentScript} files={files} /></div>
                    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <textarea value={decisionComment} onChange={e => setDecisionComment(e.target.value)} rows={3} placeholder="Comentarios o ajustes que necesitas (obligatorio si pides cambios)" className={inputCls(false)} />
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => decide('approve')} disabled={deciding !== null} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                                {deciding === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Aprobar guion
                            </button>
                            <button type="button" onClick={() => decide('changes')} disabled={deciding !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                                {deciding === 'changes' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Pedir ajustes
                            </button>
                        </div>
                    </div>
                </section>
            )}
            {!view?.canDecideScript && approvedScript && status !== 'delivered' && (
                <section className={BLOCK}>
                    <h3 className="flex items-center gap-2 text-[16px] font-bold text-slate-900"><CheckCircle2 size={18} className="text-emerald-600" /> Guion aprobado</h3>
                    <div className="mt-3"><ScriptReader script={approvedScript} files={files} /></div>
                </section>
            )}

            {/* ── Formulario ────────────────────────────────────────── */}
            {showForm && catalog && (
                <>
                    <Block letter="A" title="Identificación" intro="Tomamos estos datos de tu postulación. Confirma el contacto; el proyecto, el club y el distrito no se cambian desde aquí.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <ReadOnly label="Nombre del proyecto" value={view!.identity.projectName} />
                            <ReadOnly label="Club rotario" value={view!.identity.clubName} />
                            <ReadOnly label="Distrito" value={view!.identity.district} />
                            <div>
                                <label className={LABEL} htmlFor="vp-responsible">Responsable de la solicitud <span className="text-red-500">*</span></label>
                                <input id="vp-responsible" value={answers.identification.responsibleName} onChange={e => set('identification', 'responsibleName', e.target.value)} className={inputCls(false, Boolean(errorOf('identification.responsibleName')))} />
                                {errorOf('identification.responsibleName') && <p className="mt-1 text-[12px] text-red-600">{errorOf('identification.responsibleName')}</p>}
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="vp-email">Correo electrónico <span className="text-red-500">*</span></label>
                                <input id="vp-email" type="email" value={answers.identification.email} onChange={e => set('identification', 'email', e.target.value)} className={inputCls(false, Boolean(errorOf('identification.email')))} />
                                {errorOf('identification.email') && <p className="mt-1 text-[12px] text-red-600">{errorOf('identification.email')}</p>}
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="vp-wa">WhatsApp <span className="text-red-500">*</span></label>
                                <input id="vp-wa" type="tel" value={answers.identification.whatsapp} onChange={e => set('identification', 'whatsapp', e.target.value)} placeholder="+57 300 000 0000" className={inputCls(false, Boolean(errorOf('identification.whatsapp')))} />
                                {errorOf('identification.whatsapp') && <p className="mt-1 text-[12px] text-red-600">{errorOf('identification.whatsapp')}</p>}
                            </div>
                        </div>
                        <p className={`${HINT} mt-3`}>¿Necesitas el video para otro proyecto o club? Escríbele al comité organizador desde tu correo registrado para vincularlo a tu cuenta.</p>
                    </Block>

                    <Block letter="B" title="Información para el video" intro="El guion se construye con tu postulación y con la Formulación del proyecto: no hace falta repetirlas. Revisa lo que ya tenemos y agrega sólo lo que falte.">
                        {/* v4.1295 — Lo que el sistema YA sabe del proyecto, en sólo
                            lectura. Es lo mismo que lee la IA para escribir el guion;
                            mostrarlo evita que el club vuelva a contar lo que ya contó. */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Sparkles size={14} style={{ color: BLUE }} /> Lo que ya sabemos de tu proyecto</p>
                            {context.items.length > 0 ? (
                                <dl className="mt-3 grid gap-2.5 text-[13px]">
                                    {context.items.map(item => (
                                        <div key={item.key}>
                                            <dt className="font-semibold text-slate-500">{item.label}</dt>
                                            <dd className="line-clamp-3 whitespace-pre-wrap text-slate-800" title={item.value}>{item.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : (
                                <p className="mt-2 text-[13px] text-slate-600">Todavía no tenemos la descripción de tu proyecto.</p>
                            )}
                            <p className="mt-3 text-[12px] text-slate-500">
                                {context.hasFormulation
                                    ? 'Sale de tu postulación y de la Formulación del proyecto. Si algo cambió, corrígelo allí: el guion lo tomará actualizado.'
                                    : 'Sale de tu postulación. Cuando diligencies la Formulación del proyecto en «Mi proyecto» (objetivos, necesidades, beneficiarios, presupuesto), el guion la usará también.'}
                            </p>
                        </div>
                        <div className="mt-4">
                            <label className={LABEL} htmlFor="vp-description">Información adicional para el video <span className="font-normal text-slate-400">(opcional)</span></label>
                            <textarea id="vp-description" rows={6} value={answers.story.description} onChange={e => set('story', 'description', e.target.value)} className={inputCls(false)}
                                placeholder="Lo que no esté arriba y quieras que el video cuente: una historia concreta de la comunidad, un dato reciente, el apoyo exacto que buscan de aliados internacionales, personas o aliados que deban aparecer…" />
                            <p className={HINT}>Si lo esencial ya está en tu postulación y en la Formulación, puedes dejarlo vacío.</p>
                        </div>
                    </Block>

                    <Block letter="C" title="Material multimedia" intro="Fotografías JPG/PNG, videos MP4/MOV y, si quieres, documentos PDF de apoyo. Puedes subir varios y quitarlos antes de enviar.">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600">
                                <p className="mb-1 flex items-center gap-1.5 font-bold text-slate-800"><ImageIcon size={13} /> Fotografías</p>
                                <ul className="list-disc space-y-0.5 pl-4">{catalog.tips.photos.map((t, i) => <li key={i}>{t}</li>)}</ul>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600">
                                <p className="mb-1 flex items-center gap-1.5 font-bold text-slate-800"><Video size={13} /> Videos</p>
                                <ul className="list-disc space-y-0.5 pl-4">{catalog.tips.videos.map((t, i) => <li key={i}>{t}</li>)}</ul>
                            </div>
                        </div>
                        <p className={`${HINT} mt-2`}>Los materiales verticales o de menor resolución se aceptan igual: te avisamos de la limitación para que decidas.</p>

                        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-center transition hover:border-[#17458F] hover:bg-blue-50/30"
                            onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); onPickFiles(e.dataTransfer.files); }}>
                            <Upload size={22} style={{ color: BLUE }} />
                            <span className="text-sm font-bold text-slate-800">Arrastra tus archivos aquí o haz clic para elegirlos</span>
                            <span className="text-[12px] text-slate-500">Hasta {catalog.limits.image} MB por foto, {catalog.limits.video} MB por video y {catalog.limits.document} MB por PDF · máximo {catalog.maxFiles} archivos</span>
                            <input ref={fileInput} type="file" multiple accept={catalog.accept} className="hidden" onChange={e => onPickFiles(e.target.files)} />
                        </label>

                        {uploads.length > 0 && (
                            <ul className="mt-3 space-y-2">
                                {uploads.map(u => (
                                    <li key={u.localId} className="rounded-xl border border-slate-200 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="truncate text-sm font-semibold text-slate-800">{u.name}</p>
                                            {u.status === 'uploading' && <span className="text-[12px] font-bold text-slate-500">{u.pct}%</span>}
                                            {u.status === 'done' && <CheckCircle2 size={16} className="text-emerald-600" />}
                                            {u.status === 'error' && (
                                                <div className="flex items-center gap-2">
                                                    <button type="button" onClick={() => uploadOne(u)} className="inline-flex items-center gap-1 text-[12px] font-bold hover:underline" style={{ color: BLUE }}><RefreshCw size={12} /> Reintentar</button>
                                                    <button type="button" onClick={() => setUploads(prev => prev.filter(x => x.localId !== u.localId))} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
                                                </div>
                                            )}
                                        </div>
                                        {u.status === 'uploading' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full transition-all" style={{ width: `${u.pct}%`, background: BLUE }} /></div>}
                                        {u.error && <p className="mt-1 text-[12px] text-red-600">{u.error}</p>}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {files.length > 0 && (
                            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                                {files.map(f => <FileTile key={f.id} file={f} token={token} canEdit={canEdit} onDelete={deleteFile} onCaption={setCaption} />)}
                            </ul>
                        )}

                        <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${errorOf('consent.mediaAuthorization') ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-slate-50'}`}>
                            <input type="checkbox" checked={answers.consent.mediaAuthorization} onChange={e => set('consent', 'mediaAuthorization', e.target.checked)} className="mt-1 h-4 w-4" />
                            <span className="text-[13px] text-slate-700">
                                <strong>Confirmo que el club cuenta con autorización</strong> para utilizar los materiales enviados en el video, en especial cuando aparecen menores de edad o personas identificables. <span className="text-red-500">*</span>
                                {errorOf('consent.mediaAuthorization') && <span className="block text-[12px] text-red-600">{errorOf('consent.mediaAuthorization')}</span>}
                            </span>
                        </label>
                    </Block>

                    <Block letter="D" title="Preferencias del video" intro="Lo necesario para producirlo. Lo técnico lo resuelve el equipo de producción.">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className={LABEL} htmlFor="vp-lang">Idioma de narración <span className="text-red-500">*</span></label>
                                <select id="vp-lang" value={answers.preferences.language} onChange={e => set('preferences', 'language', e.target.value)} className={inputCls(false, Boolean(errorOf('preferences.language')))}>
                                    <option value="">– Seleccionar –</option>
                                    {catalog.languages.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="vp-obj">Objetivo principal <span className="text-red-500">*</span></label>
                                <select id="vp-obj" value={answers.preferences.objective} onChange={e => set('preferences', 'objective', e.target.value)} className={inputCls(false, Boolean(errorOf('preferences.objective')))}>
                                    <option value="">– Seleccionar –</option>
                                    {catalog.objectives.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                                </select>
                                {errorOf('preferences.objective') && <p className="mt-1 text-[12px] text-red-600">{errorOf('preferences.objective')}</p>}
                            </div>
                            {answers.preferences.objective === 'other' && (
                                <div className="sm:col-span-2">
                                    <label className={LABEL} htmlFor="vp-obj-other">¿Cuál? <span className="text-red-500">*</span></label>
                                    <input id="vp-obj-other" value={answers.preferences.objectiveOther} onChange={e => set('preferences', 'objectiveOther', e.target.value)} className={inputCls(false, Boolean(errorOf('preferences.objectiveOther')))} />
                                </div>
                            )}
                            <div className="sm:col-span-2">
                                <label className={LABEL} htmlFor="vp-notes">Información adicional para producción (opcional)</label>
                                <textarea id="vp-notes" rows={3} value={answers.preferences.notes} onChange={e => set('preferences', 'notes', e.target.value)} className={inputCls(false)} placeholder="Personas que podrían aparecer, fechas, aliados que quieran mencionar, lo que NO debería mostrarse…" />
                            </div>
                        </div>
                    </Block>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-[13px] text-slate-600">
                            {view?.validation && !view.validation.ok && status === 'draft' && <p>Faltan {view.validation.errors.length} dato(s) obligatorio(s) para solicitar el video.</p>}
                            {files.length === 0 && <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle size={13} /> Sin fotografías ni videos el comité te los pedirá después.</p>}
                            {!context.hasProjectContext && !answers.story.description && <p className="flex items-center gap-1.5 text-amber-700"><AlertTriangle size={13} /> Sin Formulación ni información adicional, el guion no tendrá con qué contar el proyecto.</p>}
                            {saving ? <p className="text-slate-400">Guardando…</p> : savedAt ? <p className="text-slate-400">Borrador guardado {vpFmtDateTime(savedAt)}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => save(false)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Guardar borrador</button>
                            {status === 'info_required' ? (
                                <button type="button" onClick={submit} disabled={submitting || saving} className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Reenviar solicitud
                                </button>
                            ) : view?.commercial?.canPay ? (
                                <button type="button" onClick={payNow} disabled={paying || saving} className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                                    {paying ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} Pagar Video Pitch
                                </button>
                            ) : (
                                <button type="button" onClick={requestVideoPitch} disabled={requesting || saving} className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                                    {requesting ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />} Solicitar Video Pitch
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ── Lo enviado (sólo lectura) ─────────────────────────── */}
            {view && view.exists && !canEdit && status !== 'draft' && (
                <section className={BLOCK}>
                    <h3 className="text-[16px] font-bold text-slate-900">Lo que enviaste</h3>
                    <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
                        <div><dt className="font-semibold text-slate-500">Responsable</dt><dd className="text-slate-800">{answers.identification.responsibleName} · {answers.identification.email} · {answers.identification.whatsapp}</dd></div>
                        <div><dt className="font-semibold text-slate-500">Idioma y objetivo</dt><dd className="text-slate-800">{catalog?.languages.find(l => l.key === answers.preferences.language)?.label || '—'} · {catalog?.objectives.find(o => o.key === answers.preferences.objective)?.label || '—'}{answers.preferences.objectiveOther ? ` (${answers.preferences.objectiveOther})` : ''}</dd></div>
                        <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Información adicional para el video</dt><dd className="whitespace-pre-wrap text-slate-800">{answers.story.description || <span className="text-slate-400">Sin información adicional: el guion se basa en tu postulación y tu Formulación.</span>}</dd></div>
                        {catalog?.guidedQuestions.filter(q => answers.story[q.key]).map(q => (
                            <div key={q.key} className="sm:col-span-2"><dt className="font-semibold text-slate-500">{q.label}</dt><dd className="whitespace-pre-wrap text-slate-800">{answers.story[q.key]}</dd></div>
                        ))}
                        {answers.preferences.notes && <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Observaciones</dt><dd className="whitespace-pre-wrap text-slate-800">{answers.preferences.notes}</dd></div>}
                    </dl>
                    {files.length > 0 && (
                        <>
                            <p className="mt-4 text-sm font-bold text-slate-800">Materiales ({files.length})</p>
                            <ul className="mt-2 grid gap-2 sm:grid-cols-2">{files.map(f => <FileTile key={f.id} file={f} token={token} canEdit={false} onDelete={() => {}} onCaption={() => {}} />)}</ul>
                        </>
                    )}
                </section>
            )}

            {/* ── Historial y mensajes ──────────────────────────────── */}
            {view && view.exists && status !== 'draft' && (
                <section className={BLOCK}>
                    <h3 className="flex items-center gap-2 text-[16px] font-bold text-slate-900"><MessageSquare size={17} style={{ color: BLUE }} /> Historial y mensajes</h3>
                    <div className="mt-3"><EventList events={view.events} /></div>
                    {!req?.terminal && (
                        <div className="mt-4 flex gap-2">
                            <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }} placeholder="Escríbele al comité…" className={inputCls(false)} />
                            <button type="button" onClick={sendMessage} disabled={sendingMessage || !message.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                                {sendingMessage ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            </button>
                        </div>
                    )}
                </section>
            )}

            {planModal && view && (
                <PlanPickerModal
                    plans={view.plans || []} selected={selectedPlan} onSelect={setSelectedPlan}
                    currentPlanId={view.commercial?.planId || null}
                    onPayNow={() => choosePlan('pay')} onPayLater={() => choosePlan('later')}
                    creditStages={view.catalog?.creditStages || []}
                    onClose={() => { if (!planBusy) setPlanModal(false); }} busy={planBusy} />
            )}
        </div>
    );
};

export default VideoPitchRequestView;
