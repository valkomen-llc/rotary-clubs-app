// ════════════════════════════════════════════════════════════════════
// Mi Proyecto — panel del club
// v4.608.0
//
// Espacio privado del club que ya se inscribió y pagó. Aquí formula su
// proyecto con el formulario maestro, guarda cuantas veces quiera y lo envía
// al comité. Ruta pública: /mi-proyecto.
//
// El formulario NO está codificado aquí: se renderiza desde la plantilla que
// entrega /api/project-fair/portal/me, de modo que cuando el administrador
// cambia las secciones o los campos, esta pantalla los refleja sin tocar
// código.
//
// La sesión es propia del módulo (token con audiencia project-fair-portal):
// nunca da acceso al panel administrativo de la plataforma.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronUp, Clock,
    ExternalLink, FileText, KeyRound, LayoutDashboard, Loader2, LogOut, Lock,
    Mail, Plus, Save, Send, Trash2, Wallet,
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const TOKEN_KEY = 'feria_portal_token';

const BLUE = '#17458F';

// ── Tipos ────────────────────────────────────────────────────────────
interface FieldDef {
    key: string; label: string; type: string; required?: boolean; help?: string;
    options?: string[]; optionsFrom?: string; width?: 'full' | 'half';
    rows?: number; maxLength?: number; columns?: { key: string; label: string; type: string }[];
}
interface SectionDef { key: string; title: string; description?: string; fields: FieldDef[] }
interface Template { title: string; intro: string; sections: SectionDef[] }
type Answers = Record<string, Record<string, any>>;

interface PortalData {
    submission: {
        id: string; publicRef: string; projectName: string; clubName: string;
        district: string; email: string; paymentStatus: string; paidAt: string | null;
        amountCop: number | null; amountUsd: number | null; receiptUrl?: string;
    };
    form: { status: string; answers: Answers; completionPct: number; submittedAt: string | null; lastEditedAt: string | null } | null;
    template: Template;
    focusAreas: { key: string; label: string }[];
    edition: { name: string; city: string; country: string };
    deadline: string | null;
    nextStep: { url: string; name: string; label: string };
    canEdit: boolean;
    reason: string | null;
}

const fmtCop = (n?: number | null) => `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : '—');
const fmtDate = (v?: string | null) => {
    if (!v) return '';
    const d = new Date(`${v}T12:00:00`);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

// ════════════════════════════════════════════════════════════════════
const MiProyecto = () => {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
    const [data, setData] = useState<PortalData | null>(null);
    const [loading, setLoading] = useState(true);
    const [answers, setAnswers] = useState<Answers>({});
    const [openSection, setOpenSection] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [missing, setMissing] = useState<{ section: string; label: string }[]>([]);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    const dirty = useRef(false);

    // ── Sesión ───────────────────────────────────────────────────────
    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null); setData(null); setAnswers({});
    }, []);

    const loadPortal = useCallback((t: string) => {
        setLoading(true);
        fetch(`${API}/project-fair/portal/me`, { headers: { Authorization: `Bearer ${t}` } })
            .then(async r => {
                const body = await r.json();
                if (r.status === 401) { logout(); return null; }
                if (!r.ok) throw new Error(body?.error || 'No pudimos cargar tu panel.');
                return body as PortalData;
            })
            .then(body => {
                if (!body) return;
                setData(body);
                setAnswers(body.form?.answers || {});
                setOpenSection(prev => prev || body.template?.sections?.[0]?.key || null);
            })
            .catch(e => setNotice({ kind: 'error', text: e?.message || 'No pudimos cargar tu panel.' }))
            .finally(() => setLoading(false));
    }, [logout]);

    // Entrada automática al volver de Stripe: se canjea la sesión de pago por
    // una sesión del panel, sin pedir la contraseña otra vez.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const submissionId = params.get('submission');
        const sessionId = params.get('session_id');
        if (token) { loadPortal(token); return; }
        if (!submissionId || !sessionId) { setLoading(false); return; }

        fetch(`${API}/project-fair/portal/claim`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissionId, sessionId }),
        })
            .then(r => r.json())
            .then(body => {
                if (body?.token) {
                    localStorage.setItem(TOKEN_KEY, body.token);
                    setToken(body.token);
                    window.history.replaceState(null, '', window.location.pathname);
                } else {
                    setLoading(false);
                }
            })
            .catch(() => setLoading(false));
        // Sólo al montar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { if (token) loadPortal(token); }, [token, loadPortal]);

    // ── Guardado ─────────────────────────────────────────────────────
    const save = useCallback(async (silent = false) => {
        if (!token || !data?.canEdit) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/project-fair/portal/form`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'No pudimos guardar.');
            setSavedAt(body.savedAt);
            dirty.current = false;
            setData(prev => (prev ? { ...prev, form: { ...(prev.form as any), completionPct: body.completionPct } } : prev));
            if (!silent) setNotice({ kind: 'ok', text: 'Cambios guardados.' });
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos guardar.' });
        } finally {
            setSaving(false);
        }
    }, [token, data?.canEdit, answers]);

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
        if (!token) return;
        setSubmitting(true); setMissing([]);
        try {
            const res = await fetch(`${API}/project-fair/portal/form/submit`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
            });
            const body = await res.json();
            if (!res.ok) {
                if (body?.missing) setMissing(body.missing);
                throw new Error(body?.error || 'No pudimos enviar el formulario.');
            }
            setNotice({ kind: 'ok', text: '¡Formulario enviado! El comité lo revisará y podrás seguir editándolo hasta la fecha límite.' });
            if (token) loadPortal(token);
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos enviar el formulario.' });
        } finally {
            setSubmitting(false);
        }
    };

    // Avance por sección, para guiar al club sobre qué le falta.
    const sectionProgress = useMemo(() => {
        const out: Record<string, { done: number; total: number }> = {};
        (data?.template?.sections || []).forEach(section => {
            const required = section.fields.filter(f => f.required);
            const target = required.length ? required : section.fields;
            const done = target.filter(f => hasValue(answers?.[section.key]?.[f.key], f.type)).length;
            out[section.key] = { done, total: target.length };
        });
        return out;
    }, [data?.template, answers]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
                    <Loader2 className="mr-2 animate-spin" size={22} style={{ color: BLUE }} /> Cargando tu panel…
                </div>
                <Footer />
            </div>
        );
    }

    if (!token || !data) return <PortalAccess onToken={t => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} notice={notice} />;

    const pct = data.form?.completionPct ?? 0;
    const submitted = data.form?.status === 'submitted';

    return (
        <div className="min-h-screen bg-slate-100">
            <Navbar />

            <header style={{ background: BLUE }} className="px-4 py-7 text-white sm:px-6">
                <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Mi proyecto</p>
                        <h1 className="mt-1 text-2xl font-bold leading-tight">{data.submission.projectName}</h1>
                        <p className="mt-1 text-sm text-white/85">
                            {data.submission.clubName} · {data.submission.district} · Ref. {data.submission.publicRef}
                        </p>
                    </div>
                    <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">
                        <LogOut size={14} /> Salir
                    </button>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
                {notice && (
                    <div className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                        notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                        {notice.kind === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                        <span>{notice.text}</span>
                        <button onClick={() => setNotice(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">Cerrar</button>
                    </div>
                )}

                {/* Estado de la inscripción */}
                <section className="mb-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <Wallet size={13} /> Inscripción
                        </p>
                        <p className="mt-1 text-lg font-bold text-emerald-600">
                            {data.submission.paymentStatus === 'paid' ? 'Pago confirmado' : 'Pendiente de pago'}
                        </p>
                        <p className="text-xs text-slate-500">{fmtCop(data.submission.amountCop)} COP · {fmtDateTime(data.submission.paidAt)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <FileText size={13} /> Formulación
                        </p>
                        <p className="mt-1 text-lg font-bold" style={{ color: BLUE }}>{pct}% completo</p>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: submitted ? '#10B981' : BLUE }} />
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <Clock size={13} /> Estado
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-800">{submitted ? 'Enviado al comité' : 'Borrador'}</p>
                        {data.deadline && <p className="text-xs text-slate-500">Plazo: {fmtDate(data.deadline)}</p>}
                    </div>
                </section>

                {!data.canEdit && data.reason && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <Lock size={17} className="mt-0.5 shrink-0" /> <span>{data.reason}</span>
                    </div>
                )}

                {missing.length > 0 && (
                    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <p className="mb-1.5 flex items-center gap-2 font-bold"><AlertCircle size={16} /> Falta completar {missing.length} campo{missing.length === 1 ? '' : 's'}:</p>
                        <ul className="ml-6 list-disc space-y-0.5">
                            {missing.slice(0, 12).map((m, i) => <li key={i}>{m.label} <span className="text-amber-700/70">({m.section})</span></li>)}
                            {missing.length > 12 && <li>… y {missing.length - 12} más</li>}
                        </ul>
                    </div>
                )}

                {/* Formulario maestro */}
                <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
                    <h2 className="text-xl font-bold text-slate-900">{data.template?.title || 'Formulación del proyecto'}</h2>
                    {data.template?.intro && <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{data.template.intro}</p>}

                    <div className="mt-6 space-y-3">
                        {(data.template?.sections || []).map(section => {
                            const open = openSection === section.key;
                            const prog = sectionProgress[section.key] || { done: 0, total: 0 };
                            const complete = prog.total > 0 && prog.done === prog.total;
                            return (
                                <div key={section.key} className="overflow-hidden rounded-xl border border-slate-200">
                                    <button
                                        onClick={() => setOpenSection(open ? null : section.key)}
                                        className="flex w-full items-center justify-between gap-3 bg-slate-50 px-5 py-4 text-left hover:bg-slate-100"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                                complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                                {complete ? <Check size={14} /> : prog.done}
                                            </span>
                                            <div>
                                                <p className="font-bold text-slate-800">{section.title}</p>
                                                {section.description && <p className="text-[13px] text-slate-500">{section.description}</p>}
                                            </div>
                                        </div>
                                        <span className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                                            {prog.done}/{prog.total}
                                            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </span>
                                    </button>

                                    {open && (
                                        <div className="grid gap-5 border-t border-slate-100 p-5 sm:grid-cols-2">
                                            {section.fields.map(field => (
                                                <FormField
                                                    key={field.key}
                                                    field={field}
                                                    value={answers?.[section.key]?.[field.key]}
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
                                {submitted ? 'Reenviar al comité' : 'Enviar al comité'}
                            </button>
                            <span className="text-[13px] text-slate-500">
                                {saving ? 'Guardando…' : savedAt ? `Guardado a las ${new Date(savedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : 'El avance se guarda solo.'}
                            </span>
                        </div>
                    )}
                </section>

                {/* Paso siguiente */}
                {data.nextStep?.url && (
                    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 text-center">
                        <p className="text-[15px] text-slate-700">
                            Cuando tengas tu proyecto formulado, continúa el proceso internacional en{' '}
                            <strong>{data.nextStep.name || 'Rotary Grants 25A'}</strong>.
                        </p>
                        <a href={data.nextStep.url} target="_blank" rel="noreferrer"
                            className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 px-6 py-3 text-[15px] font-bold transition hover:bg-slate-50"
                            style={{ borderColor: BLUE, color: BLUE }}>
                            {data.nextStep.label || 'Continuar hacia Rotary Grants 25A'} <ExternalLink size={16} />
                        </a>
                    </section>
                )}
            </main>

            <Footer />
        </div>
    );
};

// ── Campo del formulario, renderizado según la plantilla ─────────────
const hasValue = (value: any, type?: string) => {
    if (value === null || value === undefined) return false;
    if (type === 'repeater') return Array.isArray(value) && value.some(r => r && Object.values(r).some(v => String(v ?? '').trim() !== ''));
    if (type === 'multiselect') return Array.isArray(value) && value.length > 0;
    if (type === 'checkbox') return value === true;
    return String(value).trim() !== '';
};

const inputCls = (disabled: boolean) =>
    `w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] text-slate-900 transition placeholder:text-slate-400
     focus:border-[#17458F] focus:outline-none focus:ring-2 focus:ring-[#17458F]/20 ${disabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`;

const FormField = ({ field, value, onChange, disabled, focusAreas }: {
    field: FieldDef; value: any; onChange: (v: any) => void; disabled: boolean;
    focusAreas: { key: string; label: string }[];
}) => {
    const full = field.width !== 'half';
    const options = field.optionsFrom === 'focusAreas' ? focusAreas.map(a => a.label) : (field.options || []);

    const label = (
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            {field.label} {field.required && <span className="text-red-500">*</span>}
        </label>
    );

    return (
        <div className={full ? 'sm:col-span-2' : ''}>
            {label}
            {field.type === 'textarea' ? (
                <textarea value={value || ''} disabled={disabled} rows={field.rows || 4} maxLength={field.maxLength}
                    onChange={e => onChange(e.target.value)} className={`${inputCls(disabled)} resize-y leading-relaxed`} />
            ) : field.type === 'select' ? (
                <select value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)} className={inputCls(disabled)}>
                    <option value="">- Seleccione -</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : field.type === 'multiselect' ? (
                <div className="flex flex-wrap gap-2">
                    {options.map(o => {
                        const selected = Array.isArray(value) && value.includes(o);
                        return (
                            <button key={o} type="button" disabled={disabled}
                                onClick={() => onChange(selected ? (value || []).filter((x: string) => x !== o) : [...(value || []), o])}
                                className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${
                                    selected ? 'border-transparent text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                                style={selected ? { background: BLUE } : undefined}>
                                {o}
                            </button>
                        );
                    })}
                </div>
            ) : field.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={!!value} disabled={disabled} onChange={e => onChange(e.target.checked)} className="h-4 w-4" />
                    {field.help || 'Sí'}
                </label>
            ) : field.type === 'repeater' ? (
                <Repeater field={field} rows={Array.isArray(value) ? value : []} disabled={disabled} onChange={onChange} />
            ) : field.type === 'file' ? (
                <input type="url" value={value || ''} disabled={disabled} placeholder="Pega el enlace del documento (Drive, Dropbox…)"
                    onChange={e => onChange(e.target.value)} className={inputCls(disabled)} />
            ) : (
                <input
                    type={field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                    value={value ?? ''} disabled={disabled} maxLength={field.maxLength}
                    onChange={e => onChange(e.target.value)} className={inputCls(disabled)} />
            )}
            {field.help && <p className="mt-1.5 text-[13px] text-slate-500">{field.help}</p>}
        </div>
    );
};

// Tabla de filas: objetivos, actividades, indicadores, presupuesto…
const Repeater = ({ field, rows, onChange, disabled }: {
    field: FieldDef; rows: any[]; onChange: (v: any[]) => void; disabled: boolean;
}) => {
    const columns = field.columns || [];
    const update = (i: number, key: string, v: any) =>
        onChange(rows.map((r, ix) => (ix === i ? { ...r, [key]: v } : r)));

    return (
        <div className="space-y-2">
            {rows.map((row, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(columns.length, 3)}, minmax(0, 1fr))` }}>
                        {columns.map(col => (
                            <label key={col.key} className="block">
                                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{col.label}</span>
                                <input
                                    type={col.type === 'number' || col.type === 'currency' ? 'number' : 'text'}
                                    value={row?.[col.key] ?? ''} disabled={disabled}
                                    onChange={e => update(i, col.key, e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#17458F] focus:outline-none" />
                            </label>
                        ))}
                    </div>
                    {!disabled && (
                        <button type="button" onClick={() => onChange(rows.filter((_, ix) => ix !== i))}
                            className="mt-5 rounded-lg p-2 text-red-500 hover:bg-red-50" title="Quitar fila">
                            <Trash2 size={15} />
                        </button>
                    )}
                </div>
            ))}
            {!disabled && (
                <button type="button" onClick={() => onChange([...rows, {}])}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline" style={{ color: BLUE }}>
                    <Plus size={15} /> Agregar fila
                </button>
            )}
            {!rows.length && disabled && <p className="text-sm text-slate-400">Sin registros.</p>}
        </div>
    );
};

// ── Ingreso al panel ─────────────────────────────────────────────────
const PortalAccess = ({ onToken, notice }: { onToken: (t: string) => void; notice: any }) => {
    const resetToken = new URLSearchParams(window.location.search).get('reset');
    const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(
        notice ? { kind: notice.kind, text: notice.text } : null
    );

    const call = async (path: string, body: any) => {
        setBusy(true); setMsg(null);
        try {
            const res = await fetch(`${API}/project-fair/portal/${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No pudimos completar la acción.');
            if (data.token) { onToken(data.token); return; }
            setMsg({ kind: 'ok', text: data.message || 'Listo.' });
            if (path === 'forgot') setMode('login');
        } catch (e: any) {
            setMsg({ kind: 'error', text: e?.message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100">
            <Navbar />
            <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
                <div className="w-full rounded-2xl bg-white p-8 shadow-sm">
                    <div className="mb-6 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${BLUE}14` }}>
                            <LayoutDashboard size={22} style={{ color: BLUE }} />
                        </div>
                        <h1 className="text-xl font-bold text-slate-900">
                            {mode === 'login' ? 'Ingresa a tu panel' : mode === 'forgot' ? 'Recupera tu acceso' : 'Crea una contraseña nueva'}
                        </h1>
                        <p className="mt-1.5 text-sm text-slate-500">
                            {mode === 'login'
                                ? 'Con el correo y la contraseña que registraste al inscribir tu proyecto.'
                                : mode === 'forgot'
                                    ? 'Te enviaremos un enlace para restablecerla.'
                                    : 'Escribe la contraseña con la que entrarás de ahora en adelante.'}
                        </p>
                    </div>

                    {msg && (
                        <div className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[13px] ${
                            msg.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                            {msg.kind === 'ok' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
                            <span>{msg.text}</span>
                        </div>
                    )}

                    <div className="space-y-4">
                        {mode !== 'reset' && (
                            <label className="block">
                                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Mail size={14} className="text-slate-400" /> Correo electrónico</span>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls(false)} placeholder="tucorreo@club.org" />
                            </label>
                        )}
                        {mode !== 'forgot' && (
                            <label className="block">
                                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><KeyRound size={14} className="text-slate-400" /> Contraseña</span>
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls(false)}
                                    onKeyDown={e => e.key === 'Enter' && mode === 'login' && call('login', { email, password })} />
                            </label>
                        )}

                        <button
                            disabled={busy}
                            onClick={() => {
                                if (mode === 'login') call('login', { email, password });
                                else if (mode === 'forgot') call('forgot', { email });
                                else call('reset', { token: resetToken, password });
                            }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: BLUE }}>
                            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                            {mode === 'login' ? 'Entrar' : mode === 'forgot' ? 'Enviar enlace' : 'Guardar contraseña'}
                            {!busy && mode === 'login' && <ArrowRight size={16} />}
                        </button>

                        <div className="text-center text-[13px]">
                            {mode === 'login' ? (
                                <button onClick={() => setMode('forgot')} className="font-semibold text-slate-500 hover:text-slate-800">Olvidé mi contraseña</button>
                            ) : (
                                <button onClick={() => setMode('login')} className="font-semibold text-slate-500 hover:text-slate-800">Volver a ingresar</button>
                            )}
                        </div>

                        <p className="border-t border-slate-100 pt-4 text-center text-[13px] text-slate-500">
                            ¿Todavía no inscribes tu proyecto?{' '}
                            <a href="/postular-proyecto" className="font-semibold" style={{ color: BLUE }}>Postúlalo aquí</a>
                        </p>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
};

export default MiProyecto;
