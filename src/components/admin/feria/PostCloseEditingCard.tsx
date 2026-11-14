// ════════════════════════════════════════════════════════════════════
// «Edición de proyectos después del cierre» — Convocatoria (v4.1330.0)
//
// La fecha límite de postulación cierra las postulaciones NUEVAS. Esta
// sección decide, aparte, si los proyectos YA inscritos se pueden seguir
// completando y corrigiendo: vigencia, formularios, estados y alcance. El
// criterio que la aplica es `server/lib/postCloseEditPolicy.js` (el mismo
// que rechaza o acepta cada guardado en el servidor).
//
// Declarado FUERA de la pantalla de la Convocatoria: un componente declarado
// dentro de otro es un tipo nuevo en cada render y los campos pierden el foco.
// ════════════════════════════════════════════════════════════════════
import React from 'react';
import { PenLine } from 'lucide-react';

export interface PostCloseEditingConfig {
    enabled?: boolean;
    validity?: 'open' | 'until' | 'individual';
    until?: string | null;
    forms?: string[];
    states?: Record<string, 'edit' | 'restricted' | 'authorization' | 'locked'>;
    unknownState?: 'edit' | 'restricted' | 'authorization' | 'locked';
    scope?: 'all' | 'pending' | 'selected';
    selectedFields?: Record<string, string[]>;
    sensitiveFields?: Record<string, string[]>;
    lockSensitive?: 'restricted' | 'always' | 'never';
}

// Los formularios del proyecto (`server/lib/projectFormsRegistry.js`). Los
// recursos de «Mi Proyecto» que NO son formularios —la plantilla, Rotary 31A,
// los videos— tienen sus propias reglas y no se listan aquí a propósito.
const FORMS = [
    { key: 'master', label: 'Formulación del proyecto' },
    { key: 'fdd_2026_2027', label: 'Solicitud de Aportes del FDD 2026-2027' },
];

// Los estados del proyecto (`PROJECT_STATES` en projectFairLifecycle.js).
const STATES = [
    { key: 'received', label: 'Postulado' },
    { key: 'needs_changes', label: 'Requiere ajustes' },
    { key: 'in_review', label: 'En revisión' },
    { key: 'approved', label: 'Aprobado' },
    { key: 'rejected', label: 'Rechazado' },
    { key: 'withdrawn', label: 'Retirado' },
    { key: 'sent_to_grants', label: 'Enviado a Rotary Grants' },
    { key: 'closed', label: 'Cerrado' },
];

const RULES = [
    { key: 'edit', label: 'Editable' },
    { key: 'restricted', label: 'Editable con restricciones' },
    { key: 'authorization', label: 'Requiere autorización' },
    { key: 'locked', label: 'No editable' },
];

const DEFAULT_STATES: Record<string, string> = {
    received: 'edit', needs_changes: 'edit', in_review: 'restricted',
    approved: 'authorization', rejected: 'authorization', withdrawn: 'authorization',
    sent_to_grants: 'authorization', closed: 'locked',
};

const selectCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

const PathsBox = ({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (next: string[]) => void }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
        <textarea
            rows={3}
            value={(value || []).join('\n')}
            onChange={e => onChange(e.target.value.split(/\n|,/).map(x => x.trim()).filter(Boolean))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
    </label>
);

interface Props {
    value: PostCloseEditingConfig | undefined;
    deadline: string | null | undefined;
    onChange: (path: string, value: unknown) => void;
}

const PostCloseEditingCard: React.FC<Props> = ({ value, deadline, onChange }) => {
    const v = value || {};
    const enabled = v.enabled !== false;
    const validity = v.validity || 'open';
    const forms = Array.isArray(v.forms) ? v.forms : [];
    const scope = v.scope || 'all';
    const set = (k: string, val: unknown) => onChange(`postCloseEditing.${k}`, val);
    const toggleForm = (key: string, on: boolean) => {
        // Vacío = todos. Al desmarcar uno partiendo de «todos», se guarda la
        // lista explícita del resto.
        const base = forms.length ? forms : FORMS.map(f => f.key);
        const next = on ? Array.from(new Set([...base, key])) : base.filter(k => k !== key);
        set('forms', next.length === FORMS.length ? [] : next);
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
                <PenLine size={16} className="text-blue-700" /> Edición de proyectos después del cierre
            </h2>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
                La fecha límite de postulación{deadline ? ` (${deadline})` : ''} cierra las postulaciones <strong>nuevas</strong>.
                Estas reglas deciden, aparte, si los clubes que ya tienen un proyecto registrado pueden seguir completándolo y corrigiéndolo.
                El servidor las aplica en cada guardado; la edición nunca cambia el estado del proyecto ni el pago, y cada cambio queda en el historial.
            </p>

            <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={enabled} onChange={e => set('enabled', e.target.checked)} />
                <span>
                    <span className="font-semibold">Permitir que los proyectos existentes se sigan editando después del cierre de postulaciones</span>
                    <span className="block text-xs text-slate-500">Desactivado: los proyectos siguen siendo consultables, pero sólo se editan con autorización expresa («Reabrir edición»).</span>
                </span>
            </label>

            <fieldset disabled={!enabled} className="mt-4 min-w-0 space-y-5 disabled:opacity-50">
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">Vigencia de la edición</span>
                        <select className={selectCls} value={validity} onChange={e => set('validity', e.target.value)}>
                            <option value="open">Sin fecha límite adicional</option>
                            <option value="until">Hasta una fecha específica</option>
                            <option value="individual">Solo mediante autorización individual</option>
                        </select>
                    </label>
                    {validity === 'until' && (
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-slate-600">Fecha límite de edición</span>
                            <input type="date" className={selectCls} value={v.until || ''} onChange={e => set('until', e.target.value || null)} />
                            <span className="mt-1 block text-[11px] text-slate-400">Independiente de la fecha de postulación. Vale todo ese día (hora de Colombia).</span>
                        </label>
                    )}
                </div>

                <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-600">Formularios editables</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {FORMS.map(f => (
                            <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" className="h-4 w-4" checked={!forms.length || forms.includes(f.key)} onChange={e => toggleForm(f.key, e.target.checked)} />
                                {f.label}
                            </label>
                        ))}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">La plantilla de presentación, Subvenciones 31A y los videos conservan sus propias reglas.</p>
                </div>

                <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-600">Estados del proyecto</p>
                    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                        {STATES.map(st => (
                            <label key={st.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-1.5 text-sm text-slate-700">
                                <span>{st.label}</span>
                                <select className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                                    value={v.states?.[st.key] || DEFAULT_STATES[st.key]}
                                    onChange={e => onChange(`postCloseEditing.states.${st.key}`, e.target.value)}>
                                    {RULES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                                </select>
                            </label>
                        ))}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                        «Con restricciones»: los campos sensibles quedan bloqueados. «Requiere autorización»: el club puede pedirla desde «Mi Proyecto» y el comité la concede con «Reabrir edición».
                        Un proyecto archivado no se edita salvo esa autorización.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">Alcance de la edición</span>
                        <select className={selectCls} value={scope} onChange={e => set('scope', e.target.value)}>
                            <option value="all">Todos los campos autorizados</option>
                            <option value="pending">Solo campos pendientes</option>
                            <option value="selected">Campos seleccionados por el administrador</option>
                        </select>
                        <span className="mt-1 block text-[11px] text-slate-400">«Pendientes» son los que estaban vacíos la primera vez que el club abrió el formulario después del cierre. La edición mediante solicitud de corrección llegará en una fase posterior.</span>
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">Campos sensibles</span>
                        <select className={selectCls} value={v.lockSensitive || 'restricted'} onChange={e => set('lockSensitive', e.target.value)}>
                            <option value="restricted">Bloqueados sólo en estados «con restricciones»</option>
                            <option value="always">Siempre bloqueados después del cierre</option>
                            <option value="never">Editables, pero marcados para revisión</option>
                        </select>
                        <span className="mt-1 block text-[11px] text-slate-400">Club, distrito, presupuesto, montos, contactos y firmas. Todo cambio sensible se marca en el listado.</span>
                    </label>
                </div>

                {scope === 'selected' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {FORMS.map(f => (
                            <PathsBox key={f.key} label={`Campos editables — ${f.label}`}
                                hint="Uno por línea, como seccion.campo (o seccion.* para toda la sección)."
                                value={v.selectedFields?.[f.key] || []}
                                onChange={next => onChange(`postCloseEditing.selectedFields.${f.key}`, next)} />
                        ))}
                    </div>
                )}

                <details className="rounded-lg border border-slate-200 px-4 py-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600">Qué campos son sensibles (avanzado)</summary>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        {FORMS.map(f => (
                            <PathsBox key={f.key} label={f.label}
                                hint="Uno por línea, como seccion.campo o seccion.*."
                                value={v.sensitiveFields?.[f.key] || []}
                                onChange={next => onChange(`postCloseEditing.sensitiveFields.${f.key}`, next)} />
                        ))}
                    </div>
                </details>
            </fieldset>
        </section>
    );
};

export default PostCloseEditingCard;
