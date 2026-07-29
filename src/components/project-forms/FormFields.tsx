// ════════════════════════════════════════════════════════════════════
// Campos reutilizables de los formularios del proyecto
// v4.642.0
//
// Los controles que dibujan CUALQUIER formulario del proyecto: la Formulación
// y la Solicitud de Aportes del FDD usan exactamente estos, de modo que la
// experiencia de diligenciar es la misma en los dos y una mejora aquí llega a
// ambos a la vez.
//
// Vivían dentro de `MiProyecto.tsx` cuando sólo existía un formulario.
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
import { computeValue, fieldError, fmtUsd, type Answers, type FieldDef } from '../../lib/projectForms';

export const BLUE = '#17458F';

export const inputCls = (disabled: boolean, invalid = false) =>
    `w-full rounded-xl border px-4 py-3 text-[15px] text-slate-900 transition placeholder:text-slate-400
     focus:outline-none focus:ring-2 ${
        invalid
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
            : 'border-slate-300 focus:border-[#17458F] focus:ring-[#17458F]/20'
     } ${disabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`;

interface FieldProps {
    field: FieldDef;
    value: any;
    answers: Answers;
    disabled: boolean;
    focusAreas?: { key: string; label: string }[];
    onChange: (v: any) => void;
}

/**
 * Un campo del formulario, según lo que diga la plantilla. La validación de
 * formato aparece cuando el usuario sale del campo, no mientras escribe: un
 * correo a medio teclear no es un error todavía.
 */
export const FormField = ({ field, value, answers, onChange, disabled, focusAreas = [] }: FieldProps) => {
    const [touched, setTouched] = useState(false);
    const full = field.width !== 'half';
    const options = field.optionsFrom === 'focusAreas' ? focusAreas.map(a => a.label) : (field.options || []);
    const error = touched ? fieldError(field, value) : null;

    const label = (
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            {field.label} {field.required && <span className="text-red-500" title="Campo obligatorio">*</span>}
        </label>
    );

    // Campo derivado: lo calcula la plataforma, no se escribe.
    if (field.type === 'computed') {
        const computed = computeValue(field, answers);
        return (
            <div className={full ? 'sm:col-span-2' : ''}>
                {label}
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                    <span className="text-[15px] font-bold text-slate-700">{computed === null ? '—' : fmtUsd(computed)}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        <Info size={12} /> Calculado
                    </span>
                </div>
                {field.help && <p className="mt-1.5 text-[13px] text-slate-500">{field.help}</p>}
            </div>
        );
    }

    const counter = field.maxLength && (field.type === 'textarea' || field.type === 'text')
        ? `${String(value ?? '').length}/${field.maxLength}`
        : null;

    return (
        <div className={full ? 'sm:col-span-2' : ''}>
            {label}
            {field.type === 'textarea' ? (
                <textarea value={value || ''} disabled={disabled} rows={typeof field.rows === 'number' ? field.rows : 4}
                    maxLength={field.maxLength} onBlur={() => setTouched(true)}
                    onChange={e => onChange(e.target.value)} className={`${inputCls(disabled, !!error)} resize-y leading-relaxed`} />
            ) : field.type === 'select' ? (
                <select value={value || ''} disabled={disabled} onBlur={() => setTouched(true)}
                    onChange={e => onChange(e.target.value)} className={inputCls(disabled, !!error)}>
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
                <label className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm transition ${
                    value === true ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700'} ${
                    disabled ? 'opacity-70' : 'cursor-pointer hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={!!value} disabled={disabled}
                        onChange={e => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{field.help || 'Sí'}</span>
                </label>
            ) : field.type === 'matrix' ? (
                <Matrix field={field} value={value && typeof value === 'object' ? value : {}} disabled={disabled} onChange={onChange} />
            ) : field.type === 'repeater' ? (
                <Repeater field={field} rows={Array.isArray(value) ? value : []} disabled={disabled} onChange={onChange} />
            ) : field.type === 'file' ? (
                <input type="url" value={value || ''} disabled={disabled} placeholder="Pega el enlace del documento (Drive, Dropbox…)"
                    onBlur={() => setTouched(true)} onChange={e => onChange(e.target.value)} className={inputCls(disabled, !!error)} />
            ) : (
                <div className="relative">
                    {(field.type === 'currency') && (
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-slate-400">US$</span>
                    )}
                    <input
                        type={field.type === 'number' || field.type === 'currency' || field.type === 'percent' ? 'number'
                            : field.type === 'date' ? 'date'
                            : field.type === 'email' ? 'email'
                            : field.type === 'phone' ? 'tel'
                            : field.type === 'url' ? 'url' : 'text'}
                        inputMode={field.type === 'phone' ? 'tel' : undefined}
                        step={field.type === 'currency' ? '0.01' : undefined}
                        min={field.type === 'currency' || field.type === 'number' || field.type === 'percent' ? '0' : undefined}
                        max={field.type === 'percent' ? '100' : undefined}
                        value={value ?? ''} disabled={disabled} maxLength={field.maxLength}
                        onBlur={() => setTouched(true)}
                        onChange={e => onChange(e.target.value)}
                        className={`${inputCls(disabled, !!error)} ${field.type === 'currency' ? 'pl-14' : ''}`} />
                    {field.type === 'percent' && (
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-slate-400">%</span>
                    )}
                </div>
            )}

            {error
                ? <p className="mt-1.5 text-[13px] font-medium text-red-600">{error}</p>
                : field.help && field.type !== 'checkbox' && <p className="mt-1.5 text-[13px] text-slate-500">{field.help}</p>}
            {counter && <p className="mt-1 text-right text-[11px] text-slate-400">{counter}</p>}
        </div>
    );
};

// Tabla de filas fijas definidas en la plantilla (presupuesto): el club no
// agrega ni quita filas, sólo llena las celdas.
export const Matrix = ({ field, value, onChange, disabled }: {
    field: FieldDef; value: Record<string, any>; onChange: (v: any) => void; disabled: boolean;
}) => {
    const columns = field.columns || [];
    const rows = Array.isArray(field.rows) ? field.rows : [];
    const update = (rowKey: string, colKey: string, v: any) =>
        onChange({ ...value, [rowKey]: { ...(value?.[rowKey] || {}), [colKey]: v } });

    if (!rows.length || !columns.length) return null;

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                    <tr>
                        <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {field.rowsLabel || 'Concepto'}
                        </th>
                        {columns.map(c => (
                            <th key={c.key} className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.key}>
                            <th scope="row" className="border border-slate-200 bg-slate-50/60 px-3 py-2 text-left font-semibold text-slate-700">
                                {row.label}
                            </th>
                            {columns.map(c => (
                                <td key={c.key} className="border border-slate-200 p-0">
                                    <input
                                        type={c.type === 'number' || c.type === 'currency' ? 'number' : 'text'}
                                        step={c.type === 'currency' ? '0.01' : undefined}
                                        value={value?.[row.key]?.[c.key] ?? ''}
                                        disabled={disabled}
                                        onChange={e => update(row.key, c.key, e.target.value)}
                                        className={`w-full border-0 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#17458F]/30 ${
                                            disabled ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// Tabla de filas que agrega el club: objetivos, actividades, rubros…
export const Repeater = ({ field, rows, onChange, disabled }: {
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
                                    step={col.type === 'currency' ? '0.01' : undefined}
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
