// ════════════════════════════════════════════════════════════════════
// Aprobación institucional de un formulario del proyecto
// v4.642.0
//
// El "Espacio para ser llenado por el GD y el presidente del Comité de LFRI"
// del formato oficial del FDD. Es el ÚNICO lugar desde donde se escribe: el
// Gestor de Proyectos ve esa sección en solo lectura en su panel y el servidor
// descarta cualquier escritura que llegue por el panel del club.
//
// Sirve para cualquier formulario que declare una sección `adminOnly` en su
// plantilla, no sólo para el del FDD.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save, ShieldCheck, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '../../project-forms/FormFields';
import {
    FORM_STATE_META, computeValue, districtSectionOf, fmtDay, fmtDateTime,
    hasValue, isDistrictSection, matrixRowsToShow,
    type Answers, type FormState, type FormTemplate,
} from '../../../lib/projectForms';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const BLUE = '#17458F';

interface Loaded {
    submission: { id: string; publicRef: string; projectName: string; clubName: string; district: string; email: string };
    formKey: string;
    template: FormTemplate;
    form: { status: string; completionPct: number; submittedAt: string | null; lastEditedAt: string | null;
            reviewStatus: string | null; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null } | null;
    answers: Answers;
    approval: Answers;
    state: FormState;
    focusAreas: { key: string; label: string }[];
    revisions: { id: string; action: string; actorName: string; completionPct: number; createdAt: string }[];
}

interface Props {
    submissionId: string;
    formKey: string;
    canEdit: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

const DECISIONS: { key: string; label: string; tone: string }[] = [
    { key: 'in_review', label: 'En revisión', tone: 'border-indigo-300 bg-indigo-50 text-indigo-800' },
    { key: 'approved', label: 'Aprobado', tone: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
    { key: 'rejected', label: 'Rechazado', tone: 'border-red-300 bg-red-50 text-red-800' },
];

const ProjectFormApproval = ({ submissionId, formKey, canEdit, onClose, onSaved }: Props) => {
    const [data, setData] = useState<Loaded | null>(null);
    const [loading, setLoading] = useState(true);
    const [approval, setApproval] = useState<Answers>({});
    const [decision, setDecision] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${API}/project-fair/admin/postulaciones/${submissionId}/forms/${formKey}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
        })
            .then(async r => {
                const body = await r.json();
                if (!r.ok) throw new Error(body?.error || 'No se pudo cargar el formulario');
                return body as Loaded;
            })
            .then(body => {
                setData(body);
                // El espacio institucional vive en `approval` cuando la
                // plantilla lo declara `adminOnly`, y con el resto de las
                // respuestas cuando también lo diligencia el club
                // (`districtSpace`, el caso del FDD desde v4.643).
                const section = districtSectionOf(body.template);
                const current = section
                    ? (section.adminOnly ? body.approval?.[section.key] : body.answers?.[section.key])
                    : null;
                setApproval(section && current ? { [section.key]: current } : {});
                setDecision(body.form?.reviewStatus || null);
                setNote(body.form?.reviewNote || '');
            })
            .catch(e => setError(e?.message || 'No se pudo cargar el formulario'))
            .finally(() => setLoading(false));
    }, [formKey, submissionId]);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API}/project-fair/admin/postulaciones/${submissionId}/forms/${formKey}/approval`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ approval, reviewStatus: decision, reviewNote: note }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'No se pudo guardar');
            toast.success('Aprobación institucional guardada');
            onSaved?.();
            load();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const setValue = (sectionKey: string, fieldKey: string, value: any) =>
        setApproval(prev => ({ ...prev, [sectionKey]: { ...(prev[sectionKey] || {}), [fieldKey]: value } }));

    const meta = data ? (FORM_STATE_META[data.state] || FORM_STATE_META.not_started) : null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onClick={onClose}>
            <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Aprobación institucional</p>
                        <h2 className="text-lg font-bold text-slate-900">{data?.template?.title || 'Formulario del proyecto'}</h2>
                        {data && (
                            <p className="text-[13px] text-slate-500">
                                {data.submission.projectName} · {data.submission.clubName} · Ref. {data.submission.publicRef}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {meta && (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.badge}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                            </span>
                        )}
                        <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-48 items-center justify-center text-slate-500">
                        <Loader2 className="mr-2 animate-spin" size={20} /> Cargando el formulario…
                    </div>
                ) : error || !data ? (
                    <div className="m-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error || 'No se pudo cargar el formulario'}
                    </div>
                ) : (
                    <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                        {/* Lo que respondió el club: solo lectura */}
                        <div className="mb-6 space-y-4">
                            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
                                <span><strong>{data.form?.completionPct ?? 0}%</strong> diligenciado</span>
                                <span>·</span>
                                <span>{data.form?.submittedAt ? `Enviado el ${fmtDateTime(data.form.submittedAt)}` : 'Sin enviar'}</span>
                                {data.form?.reviewedBy && (
                                    <>
                                        <span>·</span>
                                        <span>Revisado por {data.form.reviewedBy} el {fmtDateTime(data.form.reviewedAt)}</span>
                                    </>
                                )}
                            </div>

                            {(data.template?.sections || []).filter(s => !isDistrictSection(s)).map(section => (
                                <div key={section.key} className="rounded-xl border border-slate-200">
                                    <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-slate-600">
                                        {section.title}
                                    </p>
                                    <dl className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2">
                                        {(section.fields || []).map(field => {
                                            const raw = field.type === 'computed'
                                                ? computeValue(field, data.answers)
                                                : data.answers?.[section.key]?.[field.key];
                                            return (
                                                <div key={field.key} className={field.width === 'half' ? '' : 'sm:col-span-2'}>
                                                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</dt>
                                                    <dd className={`text-sm ${hasValue(raw, field.type) ? 'text-slate-800' : 'text-slate-400'}`}>
                                                        {renderAnswer(field, raw)}
                                                    </dd>
                                                </div>
                                            );
                                        })}
                                    </dl>
                                </div>
                            ))}
                        </div>

                        {/* Espacio institucional: lo único editable aquí. El club
                            pudo haberlo diligenciado ya; esto es la confirmación
                            del Distrito, y sobrescribe lo que el club escribió. */}
                        {[districtSectionOf(data.template)].filter(Boolean).map(section => section && (
                            <div key={section.key} className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-5">
                                <div className="mb-4 flex items-start gap-2.5">
                                    <ShieldCheck size={18} className="mt-0.5 shrink-0" style={{ color: BLUE }} />
                                    <div>
                                        <p className="font-bold text-slate-800">{section.title}</p>
                                        {section.description && <p className="text-[13px] text-slate-500">{section.description}</p>}
                                        {!section.adminOnly && (
                                            <p className="mt-1 text-[13px] text-amber-700">
                                                El club también puede diligenciar este espacio. Lo que guardes aquí reemplaza lo que él haya escrito.
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="grid gap-5 sm:grid-cols-2">
                                    {section.fields.map(field => (
                                        <FormField
                                            key={field.key}
                                            field={field}
                                            value={approval?.[section.key]?.[field.key]}
                                            answers={approval}
                                            disabled={!canEdit}
                                            focusAreas={data.focusAreas}
                                            onChange={v => setValue(section.key, field.key, v)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Decisión */}
                        <div className="mt-5 rounded-2xl border border-slate-200 p-5">
                            <p className="mb-3 text-sm font-bold text-slate-800">Decisión sobre la solicitud</p>
                            <div className="flex flex-wrap gap-2">
                                {DECISIONS.map(d => (
                                    <button key={d.key} type="button" disabled={!canEdit}
                                        onClick={() => setDecision(decision === d.key ? null : d.key)}
                                        className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                                            decision === d.key ? d.tone : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
                                        {d.key === 'approved' ? <CheckCircle2 size={15} /> : d.key === 'rejected' ? <XCircle size={15} /> : <AlertCircle size={15} />}
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                            <label className="mt-4 block">
                                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Observaciones para el club</span>
                                <textarea value={note} disabled={!canEdit} rows={3} maxLength={1000}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="El club verá este texto en su panel."
                                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] focus:border-[#17458F] focus:outline-none focus:ring-2 focus:ring-[#17458F]/20 disabled:bg-slate-50" />
                            </label>
                        </div>

                        {!canEdit && (
                            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                                Tu perfil puede consultar esta sección, pero no diligenciarla.
                            </p>
                        )}
                    </div>
                )}

                {/* Pie */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
                    <button onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Cerrar
                    </button>
                    {canEdit && !loading && !error && (
                        <button onClick={save} disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: BLUE }}>
                            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar aprobación
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/** Respuesta legible de un campo, según su tipo. */
const renderAnswer = (field: any, value: any) => {
    if (!hasValue(value, field.type)) return '—';
    if (field.type === 'checkbox') return 'Sí';
    if (field.type === 'date') return fmtDay(String(value));
    if (field.type === 'multiselect') return (value as string[]).join(', ');
    if (field.type === 'repeater') {
        return (
            <ul className="ml-4 list-disc">
                {(value as any[]).filter(r => r && Object.values(r).some(v => String(v ?? '').trim() !== '')).map((r, i) => (
                    <li key={i}>{(field.columns || []).map((c: any) => `${c.label}: ${r[c.key] ?? '—'}`).join(' · ')}</li>
                ))}
            </ul>
        );
    }
    if (field.type === 'matrix') {
        const rows = matrixRowsToShow(field, value);
        return (
            <ul className="ml-4 list-disc">
                {rows.map((row: any) => (
                    <li key={row.key}>
                        {row.label}: {(field.columns || []).map((c: any) => `${c.label} ${value?.[row.key]?.[c.key] ?? '—'}`).join(' · ')}
                    </li>
                ))}
            </ul>
        );
    }
    if (field.type === 'currency' || field.type === 'computed') {
        return `US$ ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return String(value);
};

export default ProjectFormApproval;
