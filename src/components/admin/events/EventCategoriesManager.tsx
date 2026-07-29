// ════════════════════════════════════════════════════════════════════
// Categorías de Registro — v4.648.0
//
// Cada edición define sus propias categorías. De la categoría dependen el
// formulario que ve el público, la moneda, el precio, el cupo, la ventana de
// inscripción, los beneficios y las reglas de acompañantes.
//
// Reglas de la pantalla:
//
// - **La clave (`key`) no se edita después de crearla.** Es lo que ata las
//   inscripciones ya recibidas a su categoría; cambiarla las dejaría huérfanas.
// - **Una categoría con inscripciones no se borra, se desactiva.** El servidor
//   lo impide también, no sólo esta pantalla.
// - **Cambiar el precio o la moneda no afecta a quien ya se inscribió**: cada
//   inscripción guarda su propia foto del cobro.
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import {
    AlertCircle, ChevronDown, Coins, Loader2, Plus, Save, Sparkles, Trash2, Users,
} from 'lucide-react';
import { money, normalizeTag } from '../../../lib/eventRegistrationSpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

export interface AdminCategory {
    id?: string | null;
    key: string;
    name: string;
    audience: string;
    description: string;
    currency: string;
    settlementCurrency: string;
    price: number;
    capacity: number | null;
    opensAt: string | null;
    closesAt: string | null;
    requireClub: boolean;
    companions: { allowed: boolean; max: number; price: number; currency: string; requireDocument: boolean };
    benefits: string[];
    extraFields: any[];
    extraFieldsLabel: string | null;
    sortOrder: number;
    active: boolean;
    usage?: { seats: number; registrations: number };
}

interface Catalog {
    currencies: { code: string; label: string }[];
    audiences: { key: string; label: string }[];
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600';

const blank = (order: number): AdminCategory => ({
    key: '', name: '', audience: 'general', description: '',
    currency: 'USD', settlementCurrency: 'USD', price: 0, capacity: null,
    opensAt: null, closesAt: null, requireClub: true,
    companions: { allowed: false, max: 0, price: 0, currency: 'USD', requireDocument: true },
    benefits: [], extraFields: [], extraFieldsLabel: null,
    sortOrder: order, active: true,
});

interface Props {
    eventId: string;
    categories: AdminCategory[];
    catalog: Catalog | null;
    /** La tasa de cambio de la edición, para avisar si falta al convertir. */
    hasFxRate: boolean;
    onReload: () => void;
}

const EventCategoriesManager = ({ eventId, categories, catalog, hasFxRate, onReload }: Props) => {
    const [drafts, setDrafts] = useState<Record<string, AdminCategory>>({});
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [adding, setAdding] = useState<AdminCategory | null>(null);

    const currencies = catalog?.currencies || [{ code: 'USD', label: 'Dólar' }, { code: 'COP', label: 'Peso colombiano' }];
    const audiences = catalog?.audiences || [];

    /** Estado editable de una categoría: el borrador si se tocó, si no la guardada. */
    const stateOf = (c: AdminCategory) => drafts[c.key] ?? c;
    const patch = (c: AdminCategory, partial: Partial<AdminCategory>) =>
        setDrafts(prev => ({ ...prev, [c.key]: { ...stateOf(c), ...partial } }));

    const save = async (category: AdminCategory) => {
        setSaving(category.key || 'new');
        setError('');
        try {
            const res = await fetch(`${API}/event-registrations/admin/categories?eventRef=${encodeURIComponent(eventId)}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ eventRef: eventId, category }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo guardar.');
            setDrafts(prev => {
                const next = { ...prev };
                delete next[category.key];
                return next;
            });
            setAdding(null);
            onReload();
        } catch (err: any) {
            setError(err?.message || 'No se pudo guardar la categoría.');
        } finally {
            setSaving(null);
        }
    };

    const remove = async (category: AdminCategory) => {
        if (!confirm(`¿Borrar la categoría "${category.name}"? Si ya tiene inscripciones, desactívala en vez de borrarla.`)) return;
        setSaving(category.key);
        setError('');
        try {
            const res = await fetch(
                `${API}/event-registrations/admin/categories/${encodeURIComponent(category.key)}?eventRef=${encodeURIComponent(eventId)}`,
                { method: 'DELETE', headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo borrar.');
            onReload();
        } catch (err: any) {
            setError(err?.message || 'No se pudo borrar la categoría.');
        } finally {
            setSaving(null);
        }
    };

    const seed = async () => {
        setSaving('seed');
        setError('');
        try {
            const res = await fetch(`${API}/event-registrations/admin/edition/seed`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ eventRef: eventId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudieron crear.');
            onReload();
        } catch (err: any) {
            setError(err?.message || 'No se pudieron crear las categorías.');
        } finally {
            setSaving(null);
        }
    };

    // ── Formulario de una categoría ──────────────────────────────────
    const editor = (original: AdminCategory, isNew: boolean) => {
        const c = isNew ? original : stateOf(original);
        const dirty = isNew || Boolean(drafts[original.key]);
        const set = (partial: Partial<AdminCategory>) =>
            isNew ? setAdding({ ...c, ...partial }) : patch(original, partial);
        const converts = c.settlementCurrency !== c.currency;

        return (
            <div className="space-y-5 border-t border-gray-100 bg-gray-50/50 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className={labelCls}>Nombre de la categoría</label>
                        <input type="text" className={inputCls} value={c.name}
                            onChange={e => set({
                                name: e.target.value,
                                // La clave se deduce del nombre sólo mientras la categoría es nueva.
                                ...(isNew ? { key: normalizeTag(e.target.value) } : {}),
                            })}
                            placeholder="Ej: Rotario Internacional" />
                    </div>
                    <div>
                        <label className={labelCls}>Clave interna</label>
                        <input type="text" className={`${inputCls} font-mono ${isNew ? '' : 'bg-gray-100 text-gray-500'}`}
                            value={c.key} disabled={!isNew}
                            onChange={e => set({ key: normalizeTag(e.target.value) })} />
                        <p className="mt-1 text-xs text-gray-400">
                            {isNew ? 'Se genera del nombre. Sólo letras, números y guion bajo.'
                                : 'No se puede cambiar: es lo que ata las inscripciones a esta categoría.'}
                        </p>
                    </div>
                </div>

                <div>
                    <label className={labelCls}>Descripción (la lee el público al elegir)</label>
                    <textarea rows={3} className={inputCls} value={c.description}
                        onChange={e => set({ description: e.target.value })} />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                        <label className={labelCls}>Audiencia</label>
                        <select className={inputCls} value={c.audience}
                            onChange={e => set({ audience: e.target.value })}>
                            {audiences.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                        </select>
                        <p className="mt-1 text-xs text-gray-400">
                            Define los campos extra del formulario (viaje, departamento, especialidad técnica).
                        </p>
                    </div>
                    <div>
                        <label className={labelCls}>Moneda que se publica</label>
                        <select className={inputCls} value={c.currency}
                            onChange={e => set({ currency: e.target.value })}>
                            {currencies.map(x => <option key={x.code} value={x.code}>{x.code} — {x.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Precio ({c.currency})</label>
                        <input type="number" min={0} step="0.01" className={inputCls} value={c.price}
                            onChange={e => set({ price: Math.max(0, Number(e.target.value) || 0) })} />
                        <p className="mt-1 text-xs text-gray-400">0 = sin costo, se confirma sin pasar por el pago.</p>
                    </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <label className={labelCls}>
                        <Coins className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
                        Moneda con la que cobra la pasarela
                    </label>
                    <select className={`${inputCls} max-w-xs`} value={c.settlementCurrency}
                        onChange={e => set({ settlementCurrency: e.target.value })}>
                        {currencies.map(x => <option key={x.code} value={x.code}>{x.code} — {x.label}</option>)}
                    </select>
                    <p className="mt-2 text-xs leading-relaxed text-gray-500">
                        Si es distinta de la moneda publicada, el sistema convierte con la tasa de la edición y
                        guarda en cada inscripción el valor original, el convertido y la tasa aplicada.
                    </p>
                    {converts && !hasFxRate && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Falta la tasa de cambio en la edición. Sin ella se cobrará en {c.currency} sin convertir.
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                        <label className={labelCls}>Cupo disponible</label>
                        <input type="number" min={0} className={inputCls} value={c.capacity ?? ''}
                            onChange={e => set({ capacity: e.target.value ? Math.max(0, Number(e.target.value)) : null })}
                            placeholder="Sin límite" />
                        {original.usage && c.capacity ? (
                            <p className="mt-1 text-xs text-gray-400">
                                Ocupados {original.usage.seats} de {c.capacity} (titulares + acompañantes).
                            </p>
                        ) : null}
                    </div>
                    <div>
                        <label className={labelCls}>Abre el</label>
                        <input type="date" className={inputCls} value={c.opensAt || ''}
                            onChange={e => set({ opensAt: e.target.value || null })} />
                    </div>
                    <div>
                        <label className={labelCls}>Cierra el</label>
                        <input type="date" className={inputCls} value={c.closesAt || ''}
                            onChange={e => set({ closesAt: e.target.value || null })} />
                    </div>
                </div>

                {/* ── Acompañantes ────────────────────────────────── */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <input type="checkbox" className="h-4 w-4" checked={c.companions.allowed}
                            onChange={e => set({ companions: { ...c.companions, allowed: e.target.checked } })} />
                        <Users className="h-4 w-4 text-indigo-500" /> Permite acompañantes
                    </label>
                    {c.companions.allowed && (
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div>
                                <label className={labelCls}>Máximo por inscripción</label>
                                <input type="number" min={1} max={10} className={inputCls} value={c.companions.max}
                                    onChange={e => set({ companions: { ...c.companions, max: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } })} />
                            </div>
                            <div>
                                <label className={labelCls}>Valor por acompañante</label>
                                <input type="number" min={0} step="0.01" className={inputCls} value={c.companions.price}
                                    onChange={e => set({ companions: { ...c.companions, price: Math.max(0, Number(e.target.value) || 0) } })} />
                            </div>
                            <div>
                                <label className={labelCls}>Moneda del acompañante</label>
                                <select className={inputCls} value={c.companions.currency}
                                    onChange={e => set({ companions: { ...c.companions, currency: e.target.value } })}>
                                    {currencies.map(x => <option key={x.code} value={x.code}>{x.code}</option>)}
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-3">
                                <input type="checkbox" className="h-4 w-4" checked={c.companions.requireDocument}
                                    onChange={e => set({ companions: { ...c.companions, requireDocument: e.target.checked } })} />
                                Exigir documento de cada acompañante
                            </label>
                        </div>
                    )}
                </div>

                {/* ── Beneficios ──────────────────────────────────── */}
                <div>
                    <label className={labelCls}>Beneficios incluidos (uno por línea)</label>
                    <textarea rows={4} className={inputCls} value={c.benefits.join('\n')}
                        onChange={e => set({ benefits: e.target.value.split('\n').map(b => b.trim()).filter(Boolean) })}
                        placeholder={'Acceso a las tres jornadas\nAlmuerzos y estaciones de café'} />
                </div>

                {/* ── Campos adicionales ──────────────────────────── */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-gray-700">Campos adicionales</p>
                            <p className="text-xs text-gray-400">
                                Se agregan al formulario base de esta categoría, en un paso propio.
                            </p>
                        </div>
                        <button type="button"
                            onClick={() => set({
                                extraFields: [...c.extraFields, { key: '', label: '', type: 'text', required: false }],
                            })}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                            <Plus className="h-3.5 w-3.5" /> Agregar campo
                        </button>
                    </div>
                    {c.extraFields.length > 0 && (
                        <div className="space-y-2">
                            {c.extraFields.map((f: any, i: number) => (
                                <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3">
                                    <div className="min-w-[180px] flex-1">
                                        <label className={labelCls}>Pregunta</label>
                                        <input type="text" className={inputCls} value={f.label || ''}
                                            onChange={e => set({
                                                extraFields: c.extraFields.map((x: any, ix: number) => ix === i
                                                    ? { ...x, label: e.target.value, key: x.key || normalizeTag(e.target.value) } : x),
                                            })} />
                                    </div>
                                    <div className="w-36">
                                        <label className={labelCls}>Tipo</label>
                                        <select className={inputCls} value={f.type || 'text'}
                                            onChange={e => set({
                                                extraFields: c.extraFields.map((x: any, ix: number) => ix === i ? { ...x, type: e.target.value } : x),
                                            })}>
                                            {['text', 'textarea', 'select', 'date', 'tel', 'email', 'number', 'checkbox'].map(t =>
                                                <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    {f.type === 'select' && (
                                        <div className="min-w-[180px] flex-1">
                                            <label className={labelCls}>Opciones (separadas por coma)</label>
                                            <input type="text" className={inputCls}
                                                value={(f.options || []).map((o: any) => o.label).join(', ')}
                                                onChange={e => set({
                                                    extraFields: c.extraFields.map((x: any, ix: number) => ix === i
                                                        ? { ...x, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean).map(label => ({ value: normalizeTag(label), label })) }
                                                        : x),
                                                })} />
                                        </div>
                                    )}
                                    <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-gray-600">
                                        <input type="checkbox" className="h-3.5 w-3.5" checked={f.required === true}
                                            onChange={e => set({
                                                extraFields: c.extraFields.map((x: any, ix: number) => ix === i ? { ...x, required: e.target.checked } : x),
                                            })} />
                                        Obligatorio
                                    </label>
                                    <button type="button"
                                        onClick={() => set({ extraFields: c.extraFields.filter((_: any, ix: number) => ix !== i) })}
                                        className="mb-1 rounded-lg p-2 text-red-500 hover:bg-red-50">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-5">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" className="h-4 w-4" checked={c.active}
                                onChange={e => set({ active: e.target.checked })} />
                            Categoría activa
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" className="h-4 w-4" checked={c.requireClub}
                                onChange={e => set({ requireClub: e.target.checked })} />
                            Exigir club y distrito
                        </label>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="text-xs font-semibold text-gray-600">Orden</span>
                            <input type="number" className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                                value={c.sortOrder}
                                onChange={e => set({ sortOrder: Number(e.target.value) || 0 })} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isNew && (
                            <button type="button" onClick={() => remove(original)}
                                className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                                Borrar
                            </button>
                        )}
                        <button type="button" onClick={() => save(c)}
                            disabled={saving === (c.key || 'new') || !c.name.trim() || !c.key.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                            {saving === (c.key || 'new')
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Save className="h-4 w-4" />}
                            {isNew ? 'Crear categoría' : dirty ? 'Guardar cambios' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-bold text-gray-900">Categorías de Registro</h3>
                    <p className="mt-0.5 text-sm text-gray-500">
                        La categoría define el formulario, la moneda, el precio y las reglas de cada participante.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {categories.length === 0 && (
                        <button type="button" onClick={seed} disabled={saving === 'seed'}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-50">
                            {saving === 'seed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Crear las tres categorías de la feria
                        </button>
                    )}
                    <button type="button" onClick={() => setAdding(blank(categories.length + 1))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                        <Plus className="h-4 w-4" /> Nueva categoría
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {categories.length === 0 && !adding && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-10 text-center">
                    <p className="text-sm text-gray-500">
                        Esta edición todavía no tiene categorías. Crea las tres de la feria
                        (Rotario Internacional, Rotario Nacional y CADRES) o agrega la tuya.
                    </p>
                </div>
            )}

            {adding && (
                <div className="overflow-hidden rounded-xl border-2 border-blue-200 bg-white">
                    <div className="flex items-center justify-between bg-blue-50 px-5 py-3">
                        <p className="text-sm font-bold text-blue-900">Nueva categoría</p>
                        <button type="button" onClick={() => setAdding(null)}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-800">Cancelar</button>
                    </div>
                    {editor(adding, true)}
                </div>
            )}

            <div className="space-y-3">
                {categories.map(c => {
                    const state = stateOf(c);
                    const open = openKey === c.key;
                    const dirty = Boolean(drafts[c.key]);
                    return (
                        <div key={c.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                            <button type="button" onClick={() => setOpenKey(open ? null : c.key)}
                                className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-gray-50">
                                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-2 font-bold text-gray-900">
                                        {state.name || c.key}
                                        {!state.active && (
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                                                Inactiva
                                            </span>
                                        )}
                                        {dirty && (
                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                                                Sin guardar
                                            </span>
                                        )}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-gray-500">
                                        {money(state.price, state.currency)}
                                        {state.settlementCurrency !== state.currency && ` · se cobra en ${state.settlementCurrency}`}
                                        {state.capacity ? ` · cupo ${c.usage?.seats ?? 0}/${state.capacity}` : ' · sin límite de cupo'}
                                        {c.usage ? ` · ${c.usage.registrations} inscripción(es)` : ''}
                                    </p>
                                </div>
                            </button>
                            {open && editor(c, false)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default EventCategoriesManager;
