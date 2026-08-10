// ════════════════════════════════════════════════════════════════════
// Botones de inscripción de la ficha pública — v4.652.0
//
// Configura, por evento, la botonera que ve el visitante: qué botones existen,
// con qué texto, en qué orden, a qué categoría llevan y qué se muestra cuando
// esa categoría está cerrada.
//
// Reglas de la pantalla:
//
// - **El precio, la moneda y el formulario NO se editan aquí.** Son de la
//   categoría, que es su única fuente de verdad; el botón sólo apunta a ella.
//   Se muestran en modo lectura para poder comprobar de un vistazo a qué lleva
//   cada botón, con un acceso a la pestaña de categorías para cambiarlos.
//   Duplicarlos aquí abriría la puerta a que el botón anuncie un precio y el
//   formulario cobre otro.
// - **Un botón "principal" por audiencia, y lo decide el IDIOMA ACTIVO del
//   sitio** (v4.652): en Español (es-CO) se muestra el nacional; en cualquier
//   otro idioma, el internacional. Nunca los dos. Los "secundarios" (CADRES) se
//   ven siempre, debajo, en ambos casos.
// - **El texto que se pone aquí es el que se ve.** No se traduce solo.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Eye, Globe2, Info, Loader2,
    Plus, RefreshCw, Save, Trash2,
} from 'lucide-react';
import { money } from '../../../lib/eventRegistrationSpec';
import { CTA_SOFT, CTA_SOLID, ctaSkin } from '../../../lib/ctaStyles';
import type { AdminCategory } from './EventCategoriesManager';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600';

export interface CtaButtonConfig {
    key: string;
    categoryKey: string;
    label: string;
    role: 'primary' | 'secondary';
    audience: string | null;
    active: boolean;
    order: number;
    unavailableMessage: string;
}

export interface CtaConfig {
    enabled: boolean;
    buttons: CtaButtonConfig[];
    defaultByLanguage: Record<string, string>;
    /** Idiomas del sitio que abren el registro nacional. Es lo que decide. */
    nationalLocales: string[];
    /** Respaldo, sólo cuando no hay idioma activo que consultar. */
    nationalCountries: string[];
}

interface Props {
    eventId: string;
    cta: CtaConfig;
    categories: AdminCategory[];
    saving: boolean;
    onChange: (next: CtaConfig) => void;
    onSave: () => void;
    /** Lleva a la pestaña de categorías, donde sí se editan precios. */
    onGoToCategories: () => void;
    /** Lleva a la pestaña de edición, donde se abre o cierra el registro. */
    onGoToEdition: () => void;
}

const AUDIENCE_LABELS: Record<string, string> = {
    international: 'Sitio en English / Français / otro idioma',
    national: 'Sitio en Español (es-CO)',
};

const REASONS: Record<string, string> = {
    inactive: 'la categoría está desactivada',
    not_yet: 'la categoría todavía no abre',
    closed: 'la categoría ya cerró',
    sold_out: 'la categoría está agotada',
};

const EventCtaManager = ({ eventId, cta, categories, saving, onChange, onSave, onGoToCategories, onGoToEdition }: Props) => {
    const [newLang, setNewLang] = useState('');
    const [preview, setPreview] = useState<any>(null);
    const [previewing, setPreviewing] = useState(false);

    // Vista previa: la calcula el servidor con la MISMA función que usa la
    // ficha pública, así que no puede decir una cosa distinta de la que se ve.
    const loadPreview = useCallback(() => {
        setPreviewing(true);
        fetch(`${API}/event-registrations/admin/cta/preview?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { if (!d?.error) setPreview(d); })
            .catch(() => { /* la configuración sigue siendo editable */ })
            .finally(() => setPreviewing(false));
    }, [eventId]);

    useEffect(() => { loadPreview(); }, [loadPreview]);

    const patch = (partial: Partial<CtaConfig>) => onChange({ ...cta, ...partial });
    const patchButton = (index: number, partial: Partial<CtaButtonConfig>) =>
        patch({ buttons: cta.buttons.map((b, i) => (i === index ? { ...b, ...partial } : b)) });

    const move = (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= cta.buttons.length) return;
        const next = [...cta.buttons];
        [next[index], next[target]] = [next[target], next[index]];
        patch({ buttons: next.map((b, i) => ({ ...b, order: i + 1 })) });
    };

    const categoryOf = (key: string) => categories.find(c => c.key === key) || null;
    const primaries = cta.buttons.filter(b => b.role === 'primary');

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold text-gray-900">Botones de inscripción</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                    Lo que ve el visitante en la ficha del evento. El botón principal depende del idioma en
                    que esté viendo el sitio; los secundarios se muestran siempre debajo.
                </p>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" className="h-4 w-4" checked={cta.enabled !== false}
                    onChange={e => patch({ enabled: e.target.checked })} />
                Mostrar los botones de inscripción en la ficha pública
            </label>

            {/* ── Vista previa ────────────────────────────────────── */}
            <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                        <Eye className="h-4 w-4 text-blue-600" /> Qué ve el público ahora mismo
                    </p>
                    <button type="button" onClick={loadPreview}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
                        <RefreshCw className={`h-3.5 w-3.5 ${previewing ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                </div>

                {!preview ? (
                    <p className="py-3 text-center text-xs text-gray-400">Calculando…</p>
                ) : preview.blockers?.length ? (
                    // Sin esto, un botón que no aparece no deja rastro en ningún
                    // sitio y sólo queda adivinar. Aquí se dice el motivo exacto.
                    <div className="space-y-2 rounded-lg bg-red-50 p-4">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-red-800">
                            <AlertCircle className="h-4 w-4" /> La ficha pública no muestra ningún botón
                        </p>
                        <ul className="ml-5 list-disc space-y-1 text-xs text-red-700">
                            {preview.blockers.map((b: string) => <li key={b}>{b}</li>)}
                        </ul>
                        <button type="button" onClick={onGoToEdition}
                            className="text-xs font-bold text-red-800 underline">Ir a Edición</button>
                    </div>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {(preview.audiences || []).map((a: any) => {
                            const visibles = [a.primary, ...(a.secondary || [])].filter((b: any) => b && !b.hidden);
                            return (
                                <div key={a.audience} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                        {AUDIENCE_LABELS[a.audience] || a.audience}
                                    </p>
                                    {visibles.length === 0 ? (
                                        <p className="text-xs font-semibold text-red-600">No vería ningún botón.</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {/* Los colores salen de la MISMA fuente que la ficha pública
                                                (v4.719): pintados a mano aquí, la vista previa acabaría
                                                enseñando un botón que no es el que ve el visitante. */}
                                            {visibles.map((b: any) => (
                                                <div key={b.key}
                                                    className={`rounded-lg px-3 py-2 text-center text-xs font-bold ${
                                                        ctaSkin(b.role === 'primary' ? CTA_SOLID : CTA_SOFT, false)
                                                    } ${b.available ? '' : 'opacity-45'}`}>
                                                    {b.label}
                                                    {b.price > 0 && (
                                                        <span className="ml-1 font-normal">· {money(b.price, b.currency)}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Botones configurados que NO se ven, y por qué. */}
                                    {[a.primary, ...(a.secondary || [])].filter((b: any) => b?.hidden).map((b: any) => (
                                        <p key={b.key} className="mt-1.5 text-[11px] text-amber-700">
                                            «{b.label}» oculto: {REASONS[b.unavailableReason] || b.unavailableReason}.
                                            Escribe un mensaje de cierre si prefieres mostrarlo apagado.
                                        </p>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}

                {preview && !preview.blockers?.length && (
                    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Si en la ficha pública no los ves igual, es caché del navegador: ábrela en una ventana de incógnito.
                    </p>
                )}
            </div>

            {/* ── Cómo se decide el botón principal ───────────────── */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                    <Globe2 className="h-4 w-4 text-blue-600" /> Cómo se elige el botón principal
                </p>
                <ol className="mt-2 space-y-1 pl-5 text-xs leading-relaxed text-gray-500" style={{ listStyle: 'decimal' }}>
                    <li>
                        <b>Manda el idioma en que el visitante está viendo el sitio.</b> En Español (es-CO)
                        ve el registro nacional; en English, Français, Deutsch, Italiano, Português o
                        cualquier otro, el internacional. Sólo uno de los dos, nunca ambos.
                    </li>
                    <li>Si cambia de idioma, los botones se actualizan al instante, sin recargar.</li>
                    <li>Si abajo fijas un botón para un idioma concreto, ese gana.</li>
                    <li>El país sólo se usa de respaldo, cuando no hay idioma activo que consultar.</li>
                </ol>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <label className={labelCls}>Idiomas que abren el registro nacional</label>
                        <input type="text" className={`${inputCls} font-mono`}
                            value={(cta.nationalLocales || []).join(', ')}
                            onChange={e => patch({
                                nationalLocales: e.target.value.split(',')
                                    .map(l => l.trim().slice(0, 10)).filter(Boolean),
                            })}
                            placeholder="es, es-CO" />
                        <p className="mt-1 text-xs text-gray-400">
                            Es lo que decide el botón. Cualquier idioma que no esté aquí abre el registro
                            internacional.
                        </p>
                    </div>
                    <div>
                        <label className={labelCls}>Países nacionales (sólo respaldo)</label>
                        <input type="text" className={`${inputCls} font-mono uppercase`}
                            value={(cta.nationalCountries || []).join(', ')}
                            onChange={e => patch({
                                nationalCountries: e.target.value.split(',')
                                    .map(c => c.trim().toUpperCase().slice(0, 2)).filter(Boolean),
                            })}
                            placeholder="CO" />
                        <p className="mt-1 text-xs text-gray-400">
                            Códigos de dos letras. Sólo intervienen si algo consulta la ficha sin decir en qué
                            idioma está el sitio.
                        </p>
                    </div>
                </div>

                <div className="mt-4">
                    <label className={labelCls}>Botón principal fijado por idioma</label>
                    {Object.keys(cta.defaultByLanguage || {}).length === 0 && (
                        <p className="mb-2 text-xs text-gray-400">
                            Sin nada fijado: se usa la detección automática de arriba.
                        </p>
                    )}
                    <div className="space-y-2">
                        {Object.entries(cta.defaultByLanguage || {}).map(([lang, key]) => (
                            <div key={lang} className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg bg-gray-100 px-2.5 py-1.5 font-mono text-xs font-bold text-gray-700">
                                    {lang}
                                </span>
                                <span className="text-xs text-gray-400">→</span>
                                <select className={`${inputCls} max-w-xs`} value={key}
                                    onChange={e => patch({
                                        defaultByLanguage: { ...cta.defaultByLanguage, [lang]: e.target.value },
                                    })}>
                                    {primaries.map(b => (
                                        <option key={b.categoryKey} value={b.categoryKey}>{b.label}</option>
                                    ))}
                                </select>
                                <button type="button"
                                    onClick={() => {
                                        const next = { ...cta.defaultByLanguage };
                                        delete next[lang];
                                        patch({ defaultByLanguage: next });
                                    }}
                                    className="rounded-lg p-2 text-red-500 hover:bg-red-50">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="text" className={`${inputCls} max-w-[140px] font-mono`}
                            value={newLang} onChange={e => setNewLang(e.target.value)}
                            placeholder="es-CO, en…" />
                        <button type="button" disabled={!newLang.trim() || !primaries.length}
                            onClick={() => {
                                patch({
                                    defaultByLanguage: {
                                        ...cta.defaultByLanguage,
                                        [newLang.trim().toLowerCase()]: primaries[0].categoryKey,
                                    },
                                });
                                setNewLang('');
                            }}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline disabled:opacity-40">
                            <Plus className="h-3.5 w-3.5" /> Fijar idioma
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Botones ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-gray-800">Botones ({cta.buttons.length})</h4>
                <button type="button" disabled={!categories.length}
                    onClick={() => patch({
                        buttons: [...cta.buttons, {
                            key: `boton_${cta.buttons.length + 1}`,
                            categoryKey: categories[0].key,
                            label: categories[0].name,
                            role: 'secondary', audience: null,
                            active: true, order: cta.buttons.length + 1,
                            unavailableMessage: '',
                        }],
                    })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                    <Plus className="h-4 w-4" /> Agregar botón
                </button>
            </div>

            {cta.buttons.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-sm text-gray-500">
                    Sin botones configurados. La ficha pública no mostrará acceso a la inscripción.
                </div>
            )}

            <div className="space-y-3">
                {cta.buttons.map((b, i) => {
                    const category = categoryOf(b.categoryKey);
                    return (
                        <div key={`${b.key}-${i}`} className="rounded-xl border border-gray-200 bg-white p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${b.role === 'primary'
                                    ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                                    {b.role === 'primary' ? 'Principal' : 'Secundario (siempre visible)'}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30">
                                        <ArrowUp className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => move(i, 1)} disabled={i === cta.buttons.length - 1}
                                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30">
                                        <ArrowDown className="h-4 w-4" />
                                    </button>
                                    <button type="button"
                                        onClick={() => patch({ buttons: cta.buttons.filter((_, ix) => ix !== i) })}
                                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <div>
                                    <label className={labelCls}>Texto del botón</label>
                                    <input type="text" className={inputCls} value={b.label}
                                        onChange={e => patchButton(i, { label: e.target.value })}
                                        placeholder="Registro Internacional" />
                                </div>
                                <div>
                                    <label className={labelCls}>Categoría de destino</label>
                                    <select className={inputCls} value={b.categoryKey}
                                        onChange={e => patchButton(i, { categoryKey: e.target.value })}>
                                        {categories.map(c => (
                                            <option key={c.key} value={c.key}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Tipo</label>
                                    <select className={inputCls} value={b.role}
                                        onChange={e => patchButton(i, {
                                            role: e.target.value as 'primary' | 'secondary',
                                            audience: e.target.value === 'secondary' ? null : b.audience,
                                        })}>
                                        <option value="primary">Principal (según el visitante)</option>
                                        <option value="secondary">Secundario (siempre visible)</option>
                                    </select>
                                </div>
                                {b.role === 'primary' && (
                                    <div>
                                        <label className={labelCls}>Se muestra a visitantes</label>
                                        <select className={inputCls} value={b.audience || ''}
                                            onChange={e => patchButton(i, { audience: e.target.value || null })}>
                                            <option value="">Cualquiera (respaldo)</option>
                                            <option value="international">Internacionales</option>
                                            <option value="national">Nacionales</option>
                                        </select>
                                    </div>
                                )}
                                <div className="md:col-span-2">
                                    <label className={labelCls}>Mensaje si la categoría está cerrada</label>
                                    <input type="text" className={inputCls} value={b.unavailableMessage}
                                        onChange={e => patchButton(i, { unavailableMessage: e.target.value })}
                                        placeholder="Vacío = el botón se oculta" />
                                    <p className="mt-1 text-xs text-gray-400">
                                        Con mensaje, el botón se ve apagado y con la explicación. Sin mensaje, no se
                                        muestra.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" className="h-4 w-4" checked={b.active}
                                        onChange={e => patchButton(i, { active: e.target.checked })} />
                                    Botón activo
                                </label>
                                {category ? (
                                    <p className="text-xs text-gray-500">
                                        Lleva a <b>{category.name}</b> · {money(category.price, category.currency)}
                                        {!category.active && <span className="ml-1 font-bold text-red-600">· categoría inactiva</span>}
                                    </p>
                                ) : (
                                    <p className="flex items-center gap-1 text-xs font-semibold text-red-600">
                                        <AlertCircle className="h-3.5 w-3.5" /> La categoría ya no existe
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                    El precio, la moneda y el formulario los define la <b>categoría</b>, no el botón: así lo que
                    anuncia el botón y lo que cobra el formulario nunca pueden discrepar.{' '}
                    <button type="button" onClick={onGoToCategories} className="font-bold underline">
                        Ir a Categorías de Registro
                    </button>
                </span>
            </div>

            <div className="border-t border-gray-100 pt-4">
                <button type="button" onClick={onSave} disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar botones
                </button>
            </div>
        </div>
    );
};

export default EventCtaManager;
