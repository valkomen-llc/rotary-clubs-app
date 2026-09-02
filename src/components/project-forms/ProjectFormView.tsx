// ════════════════════════════════════════════════════════════════════
// Formulario del proyecto — vista única para todos
// v4.642.0
//
// La misma pantalla sirve a la Formulación del Proyecto y a la Solicitud de
// Aportes del FDD 2026-2027: recibe una `formKey`, pide su plantilla al
// servidor y la dibuja. Mismo autoguardado, mismo aviso de campos faltantes,
// mismo envío, mismas validaciones. Un formulario nuevo no necesita pantalla
// nueva, sólo su entrada en el registro del servidor.
//
// La sección marcada `adminOnly` en la plantilla (las firmas del Gobernador y
// del presidente del Comité de LFRI) se muestra en SOLO LECTURA: el Gestor de
// Proyectos ve qué le aprobaron, pero no lo escribe. El servidor descarta
// cualquier intento de escribirla, así que el bloqueo no depende de esto.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronUp, Clock,
    Lock, Loader2, Save, Send, ShieldCheck,
} from 'lucide-react';
import { FormField, BLUE } from './FormFields';
import {
    FORM_STATE_META, applicantSections, fieldError, fmtDay, fmtDateTime,
    hasValue, isDistrictSection, readOnlySections, sectionProgress,
    type Answers, type FormState, type FormTemplate,
} from '../../lib/projectForms';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

interface Loaded {
    formKey: string;
    template: FormTemplate;
    form: { status: string; completionPct: number; submittedAt: string | null; lastEditedAt: string | null;
            lockedAt: string | null; reviewStatus: string | null; reviewNote: string | null } | null;
    state: FormState;
    answers: Answers;
    approval: Answers;
    focusAreas: { key: string; label: string }[];
    deadline: string | null;
    canEdit: boolean;
    reason: string | null;
}

interface Props {
    token: string;
    formKey: string;
    onBack: () => void;
    /** Avisa al panel para que refresque las tarjetas cuando cambie el avance. */
    onProgress?: () => void;
}

const ProjectFormView = ({ token, formKey, onBack, onProgress }: Props) => {
    const [data, setData] = useState<Loaded | null>(null);
    const [answers, setAnswers] = useState<Answers>({});
    const [loading, setLoading] = useState(true);
    const [openSection, setOpenSection] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [missing, setMissing] = useState<{ section: string; label: string }[]>([]);
    const [invalid, setInvalid] = useState<{ section: string; label: string; message: string }[]>([]);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    // v4.979 — El servidor responde 402 cuando el formulario todavía no está
    // pagado. NO es un error: es un candado, y pintarlo en rojo mandaría a
    // diagnosticar una avería que no existe.
    const [bloqueadoPorPago, setBloqueadoPorPago] = useState(false);
    const dirty = useRef(false);

    // ── Carga ────────────────────────────────────────────────────────
    const load = useCallback(() => {
        setLoading(true);
        fetch(`${API}/project-fair/portal/forms/${formKey}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async r => {
                const body = await r.json();
                if (!r.ok) {
                    setBloqueadoPorPago(r.status === 402 || !!body?.needsPayment);
                    throw new Error(body?.error || 'No pudimos cargar el formulario.');
                }
                setBloqueadoPorPago(false);
                return body as Loaded;
            })
            .then(body => {
                setData(body);
                setAnswers(body.answers || {});
                setOpenSection(prev => prev || applicantSections(body.template)[0]?.key || null);
            })
            .catch(e => setNotice({ kind: 'error', text: e?.message || 'No pudimos cargar el formulario.' }))
            .finally(() => setLoading(false));
    }, [formKey, token]);

    useEffect(() => { load(); }, [load]);
    // Al cambiar de formulario se vuelve arriba: si no, se abre a media página.
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [formKey]);

    // ── Guardado ─────────────────────────────────────────────────────
    const save = useCallback(async (silent = false) => {
        if (!data?.canEdit) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/project-fair/portal/forms/${formKey}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'No pudimos guardar.');
            setSavedAt(body.savedAt);
            dirty.current = false;
            setData(prev => (prev ? {
                ...prev,
                state: body.state as FormState,
                form: { ...(prev.form as any), completionPct: body.completionPct },
            } : prev));
            onProgress?.();
            if (!silent) setNotice({ kind: 'ok', text: 'Cambios guardados.' });
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos guardar.' });
        } finally {
            setSaving(false);
        }
    }, [answers, data?.canEdit, formKey, onProgress, token]);

    // Autoguardado: 3 segundos después de dejar de escribir.
    useEffect(() => {
        if (!dirty.current || !data?.canEdit) return;
        const t = setTimeout(() => { save(true); }, 3000);
        return () => clearTimeout(t);
    }, [answers, data?.canEdit, save]);

    // Aviso del navegador si se sale con cambios sin guardar.
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    const setValue = (sectionKey: string, fieldKey: string, value: any) => {
        dirty.current = true;
        setAnswers(prev => ({ ...prev, [sectionKey]: { ...(prev[sectionKey] || {}), [fieldKey]: value } }));
    };

    const submit = async () => {
        setSubmitting(true); setMissing([]); setInvalid([]);
        try {
            const res = await fetch(`${API}/project-fair/portal/forms/${formKey}/submit`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
            });
            const body = await res.json();
            if (!res.ok) {
                if (body?.missing) setMissing(body.missing);
                if (body?.invalid) setInvalid(body.invalid);
                throw new Error(body?.error || 'No pudimos enviar el formulario.');
            }
            dirty.current = false;
            setNotice({ kind: 'ok', text: `¡Formulario enviado! Quedó registrado el ${fmtDateTime(body.submittedAt)}. Podrás seguir editándolo hasta la fecha límite.` });
            onProgress?.();
            load();
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos enviar el formulario.' });
        } finally {
            setSubmitting(false);
        }
    };

    const progress = useMemo(() => sectionProgress(data?.template, answers), [data?.template, answers]);
    // Errores de formato en vivo, para no dejar que se pulse "Enviar" a ciegas.
    const liveErrors = useMemo(() => {
        if (!data?.template) return 0;
        return applicantSections(data.template).reduce((acc, section) => acc + (section.fields || []).filter(
            f => fieldError(f, answers?.[section.key]?.[f.key])).length, 0);
    }, [data?.template, answers]);

    if (loading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
                <Loader2 className="mr-2 animate-spin" size={22} style={{ color: BLUE }} /> Cargando el formulario…
            </div>
        );
    }
    if (!data) {
        // Un candado se pinta como candado. Se llega aquí escribiendo la
        // dirección a mano o volviendo a una pestaña abierta desde antes del
        // pago: el servidor es el que decide, y lo dice con su motivo.
        if (bloqueadoPorPago) {
            return (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
                    <Lock size={20} className="mx-auto mb-3 text-amber-600" />
                    {notice?.text || 'Tu formulario se habilita cuando se confirme el pago de la inscripción.'}
                    <button onClick={onBack} className="mt-4 block w-full text-sm font-bold text-amber-900 underline">Volver a mis formularios</button>
                </div>
            );
        }
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
                {notice?.text || 'No pudimos cargar el formulario.'}
                <button onClick={onBack} className="mt-4 block w-full text-sm font-bold text-red-900 underline">Volver a mis formularios</button>
            </div>
        );
    }

    const pct = data.form?.completionPct ?? 0;
    const meta = FORM_STATE_META[data.state] || FORM_STATE_META.not_started;
    const sections = applicantSections(data.template);
    const readOnly = readOnlySections(data.template);
    const submitted = data.form?.status === 'submitted';

    return (
        <div>
            <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
                <ArrowLeft size={15} /> Mis formularios
            </button>

            {notice && (
                <div className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                    notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                    {notice.kind === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                    <span>{notice.text}</span>
                    <button onClick={() => setNotice(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">Cerrar</button>
                </div>
            )}

            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
                {/* Cabecera del formulario */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">{data.template?.title}</h2>
                        {data.template?.subtitle && <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">{data.template.subtitle}</p>}
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${meta.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                    </span>
                </div>
                {data.template?.intro && <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{data.template.intro}</p>}

                <div className="mt-4 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: submitted ? '#10B981' : BLUE }} />
                    </div>
                    <span className="text-sm font-bold text-slate-600">{pct}%</span>
                </div>
                {data.deadline && (
                    <p className="mt-2 flex items-center gap-1.5 text-[13px] text-slate-500">
                        <Clock size={13} /> Plazo para diligenciarlo: {fmtDay(data.deadline)}
                    </p>
                )}

                {/* Requisitos del formato oficial */}
                {!!data.template?.requirements?.length && (
                    <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
                        <p className="mb-1.5 font-bold">Requisitos para presentar esta solicitud</p>
                        <ul className="ml-5 list-disc space-y-0.5">
                            {data.template.requirements.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                    </div>
                )}

                {!data.canEdit && data.reason && (
                    <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <Lock size={17} className="mt-0.5 shrink-0" /> <span>{data.reason}</span>
                    </div>
                )}

                {data.form?.reviewNote && (
                    <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                        <p className="font-bold">Observaciones del Distrito</p>
                        <p className="mt-0.5">{data.form.reviewNote}</p>
                    </div>
                )}

                {missing.length > 0 && (
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <p className="mb-1.5 flex items-center gap-2 font-bold"><AlertCircle size={16} /> Falta completar {missing.length} campo{missing.length === 1 ? '' : 's'}:</p>
                        <ul className="ml-6 list-disc space-y-0.5">
                            {missing.slice(0, 12).map((m, i) => <li key={i}>{m.label} <span className="text-amber-700/70">({m.section})</span></li>)}
                            {missing.length > 12 && <li>… y {missing.length - 12} más</li>}
                        </ul>
                    </div>
                )}

                {invalid.length > 0 && (
                    <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <p className="mb-1.5 flex items-center gap-2 font-bold"><AlertCircle size={16} /> Revisa el formato de estos campos:</p>
                        <ul className="ml-6 list-disc space-y-0.5">
                            {invalid.slice(0, 12).map((m, i) => <li key={i}>{m.label}: {m.message} <span className="text-red-700/70">({m.section})</span></li>)}
                        </ul>
                    </div>
                )}

                {/* Secciones */}
                <div className="mt-6 space-y-3">
                    {sections.map((section, index) => {
                        const open = openSection === section.key;
                        const prog = progress[section.key] || { done: 0, total: 0 };
                        const complete = prog.total > 0 && prog.done === prog.total;
                        // El espacio institucional se diligencia igual que el
                        // resto (v4.643), pero se distingue: no es una sección
                        // más del club, es el recuadro del Distrito.
                        const district = isDistrictSection(section);
                        return (
                            <div key={section.key} className={`overflow-hidden rounded-xl border ${
                                district ? 'border-dashed border-slate-300' : 'border-slate-200'}`}>
                                <button
                                    onClick={() => setOpenSection(open ? null : section.key)}
                                    className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-left ${
                                        district ? 'bg-slate-100/70 hover:bg-slate-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
                                    <div className="flex items-center gap-3">
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                            complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                            {complete ? <Check size={14} /> : district ? <ShieldCheck size={14} /> : index + 1}
                                        </span>
                                        <div>
                                            <p className="font-bold text-slate-800">
                                                {section.title}
                                                {district && (
                                                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                                        Espacio institucional
                                                    </span>
                                                )}
                                            </p>
                                            {section.description && <p className="text-[13px] text-slate-500">{section.description}</p>}
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                                        {district ? 'Opcional' : `${prog.done}/${prog.total}`}
                                        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </span>
                                </button>

                                {open && (
                                    <div className="grid gap-5 border-t border-slate-100 p-5 sm:grid-cols-2">
                                        {district && (
                                            <p className="rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-900 sm:col-span-2">
                                                Diligencia lo que corresponda al proyecto y al club. El Distrito confirma
                                                estos datos al resolver la solicitud, y no hace falta completarlos para enviarla.
                                            </p>
                                        )}
                                        {section.fields.map(field => (
                                            <FormField
                                                key={field.key}
                                                field={field}
                                                value={answers?.[section.key]?.[field.key]}
                                                answers={answers}
                                                disabled={!data.canEdit}
                                                focusAreas={data.focusAreas}
                                                onChange={v => setValue(section.key, field.key, v)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Secciones que el club sólo puede leer (`adminOnly`). El
                        espacio institucional del FDD ya no es una de ellas:
                        desde v4.643 lo diligencia también el Gestor, arriba. */}
                    {readOnly.map(section => (
                        <div key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
                            <div className="flex items-start gap-3 px-5 py-4">
                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                                    <ShieldCheck size={14} />
                                </span>
                                <div className="flex-1">
                                    <p className="font-bold text-slate-700">{section.title}</p>
                                    {section.description && <p className="text-[13px] text-slate-500">{section.description}</p>}
                                    <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                                        {section.fields.map(field => {
                                            const value = data.approval?.[section.key]?.[field.key];
                                            return (
                                                <div key={field.key} className="text-sm">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</p>
                                                    <p className={hasValue(value, field.type) ? 'font-semibold text-slate-800' : 'text-slate-400'}>
                                                        {hasValue(value, field.type)
                                                            ? (field.type === 'date' ? fmtDay(String(value)) : String(value))
                                                            : 'Pendiente'}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <span className="hidden shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 sm:inline">
                                    Solo lectura
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {data.canEdit && (
                    <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
                        <button onClick={() => save(false)} disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar borrador
                        </button>
                        <button onClick={submit} disabled={submitting}
                            className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: BLUE }}>
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            {submitted ? 'Reenviar' : 'Enviar'}
                        </button>
                        <span className="text-[13px] text-slate-500">
                            {saving ? 'Guardando…'
                                : savedAt ? `Guardado a las ${new Date(savedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
                                : 'El avance se guarda solo.'}
                        </span>
                        {liveErrors > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-600">
                                <AlertCircle size={14} /> {liveErrors} campo{liveErrors === 1 ? '' : 's'} con formato incorrecto
                            </span>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

export default ProjectFormView;
