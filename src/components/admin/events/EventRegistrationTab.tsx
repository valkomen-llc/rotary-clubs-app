// ════════════════════════════════════════════════════════════════════
// Pestaña "Registro" de un evento — v4.648.0
//
// Contenedor de las cuatro pantallas del módulo de inscripciones:
//
//   Edición            — número, sede, ventana de registro y tasa de cambio
//   Categorías         — Rotario Internacional / Rotario Nacional / CADRES
//   Inscripciones      — tablero, tabla, filtros y fichas
//   Acreditación       — búsqueda, check-in y escarapelas del día del evento
//
// A diferencia de v4.606, esta pestaña YA NO se guarda con el botón "Guardar
// cambios" del evento: la configuración vive en sus propias tablas
// (`EventEdition`, `EventRegistrationCategory`) y cada pantalla guarda lo suyo.
// Así la configuración de una edición no depende de que alguien recuerde
// guardar el evento entero.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle, BadgeCheck, Calendar, Coins, ExternalLink, LayoutGrid, Loader2,
    MousePointerClick, Save, Settings2, Users,
} from 'lucide-react';
import EventCategoriesManager, { type AdminCategory } from './EventCategoriesManager';
import EventCtaManager, { type CtaConfig } from './EventCtaManager';
import EventRegistrationsManager from './EventRegistrationsManager';
import EventAccreditation from './EventAccreditation';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

type Pane = 'edicion' | 'categorias' | 'botones' | 'inscripciones' | 'acreditacion';

const PANES: { key: Pane; label: string; icon: any }[] = [
    { key: 'edicion', label: 'Edición', icon: Settings2 },
    { key: 'categorias', label: 'Categorías de Registro', icon: LayoutGrid },
    { key: 'botones', label: 'Botones', icon: MousePointerClick },
    { key: 'inscripciones', label: 'Inscripciones', icon: Users },
    { key: 'acreditacion', label: 'Acreditación', icon: BadgeCheck },
];

interface Edition {
    editionNumber: number | null;
    editionLabel: string;
    venue: string; city: string; region: string; country: string;
    timezone: string; codePrefix: string;
    registrationOpen: boolean;
    opensAt: string | null; closesAt: string | null;
    fx: { usdToCop?: number; source?: string; updatedAt?: string };
    settings: { successMessage?: string; sendReceipt?: boolean; adminEmails?: string[]; termsUrl?: string };
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600';

interface Props {
    eventId: string;
    eventSlug?: string | null;
    eventTitle?: string;
}

const EventRegistrationTab = ({ eventId, eventSlug, eventTitle }: Props) => {
    const [pane, setPane] = useState<Pane>('edicion');
    const [edition, setEdition] = useState<Edition | null>(null);
    const [categories, setCategories] = useState<AdminCategory[]>([]);
    const [cta, setCta] = useState<CtaConfig | null>(null);
    const [catalog, setCatalog] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    const publicUrl = `${window.location.origin}/eventos/${eventSlug || eventId}/registro`;

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${API}/event-registrations/admin/edition?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => {
                if (data?.error) throw new Error(data.error);
                setEdition(data.edition);
                setCategories(data.categories || []);
                setCta(data.cta || null);
                setCatalog(data.catalog || null);
            })
            .catch(err => setError(err?.message || 'No se pudo cargar la configuración del registro.'))
            .finally(() => setLoading(false));
    }, [eventId]);

    useEffect(() => { load(); }, [load]);

    const patch = (partial: Partial<Edition>) =>
        setEdition(prev => (prev ? { ...prev, ...partial } : prev));

    const saveEdition = async () => {
        if (!edition) return;
        setSaving(true);
        setError('');
        setSaved(false);
        try {
            const res = await fetch(`${API}/event-registrations/admin/edition`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({
                    eventRef: eventId,
                    ...edition,
                    // Los botones viajan dentro de `settings`, junto al resto de
                    // la configuración de la edición.
                    settings: { ...edition.settings, cta: cta || undefined },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo guardar.');
            setEdition(data.edition);
            if (data.edition?.settings?.cta) setCta(data.edition.settings.cta);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err: any) {
            setError(err?.message || 'No se pudo guardar la edición.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
    }

    const activeCategories = categories.filter(c => c.active).length;
    const hasFxRate = Number(edition?.fx?.usdToCop) > 0;
    const converting = categories.some(c => c.active && c.settlementCurrency !== c.currency);

    return (
        <div className="space-y-5">
            {/* ── Encabezado ──────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-blue-900">
                        {edition?.editionNumber ? `Edición ${edition.editionNumber}` : 'Edición'}
                        {edition?.city ? ` · ${edition.city}` : ''}
                    </p>
                    <p className="truncate text-xs text-blue-700/70">
                        {activeCategories} categoría(s) activa(s) ·{' '}
                        {edition?.registrationOpen ? 'registro abierto' : 'registro cerrado'}
                    </p>
                </div>
                <a href={publicUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50">
                    <ExternalLink className="h-3.5 w-3.5" /> Ver formulario público
                </a>
            </div>

            {/* ── Sub-pestañas ────────────────────────────────────── */}
            <div className="flex flex-wrap gap-1 border-b border-gray-200">
                {PANES.map(p => {
                    const Icon = p.icon;
                    const active = pane === p.key;
                    return (
                        <button key={p.key} type="button" onClick={() => setPane(p.key)}
                            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${active
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                            <Icon className="h-4 w-4" /> {p.label}
                        </button>
                    );
                })}
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* ── Edición ─────────────────────────────────────────── */}
            {pane === 'edicion' && edition && (
                <div className="space-y-5">
                    <p className="text-sm text-gray-500">
                        Estos datos identifican esta versión de la feria y no se mezclan con las siguientes.
                        Toda inscripción, categoría, pago y reporte queda atado a esta edición.
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label className={labelCls}>Número de la edición</label>
                            <input type="number" min={1} className={inputCls} value={edition.editionNumber ?? ''}
                                onChange={e => patch({ editionNumber: e.target.value ? Number(e.target.value) : null })} />
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelCls}>Nombre de la edición</label>
                            <input type="text" className={inputCls} value={edition.editionLabel}
                                onChange={e => patch({ editionLabel: e.target.value })} />
                        </div>
                        <div>
                            <label className={labelCls}>Sede</label>
                            <input type="text" className={inputCls} value={edition.venue}
                                onChange={e => patch({ venue: e.target.value })} placeholder="Sonesta Hotel Valledupar" />
                        </div>
                        <div>
                            <label className={labelCls}>Ciudad</label>
                            <input type="text" className={inputCls} value={edition.city}
                                onChange={e => patch({ city: e.target.value })} placeholder="Valledupar" />
                        </div>
                        <div>
                            <label className={labelCls}>Departamento / región</label>
                            <input type="text" className={inputCls} value={edition.region}
                                onChange={e => patch({ region: e.target.value })} placeholder="Cesar" />
                        </div>
                        <div>
                            <label className={labelCls}>País</label>
                            <input type="text" className={inputCls} value={edition.country}
                                onChange={e => patch({ country: e.target.value })} placeholder="Colombia" />
                        </div>
                        <div>
                            <label className={labelCls}>Prefijo del código de inscripción</label>
                            <input type="text" className={`${inputCls} font-mono`} value={edition.codePrefix}
                                onChange={e => patch({ codePrefix: e.target.value.toUpperCase() })} maxLength={10} />
                            <p className="mt-1 text-xs text-gray-400">
                                Los códigos quedan como <span className="font-mono">{edition.codePrefix || 'RPF12'}-4K9Z</span>.
                            </p>
                        </div>
                        <div>
                            <label className={labelCls}>Zona horaria</label>
                            <input type="text" className={inputCls} value={edition.timezone}
                                onChange={e => patch({ timezone: e.target.value })} />
                        </div>
                    </div>

                    {/* Ventana de registro */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                            <input type="checkbox" className="h-4 w-4" checked={edition.registrationOpen}
                                onChange={e => patch({ registrationOpen: e.target.checked })} />
                            <Calendar className="h-4 w-4 text-blue-600" /> Registro abierto para esta edición
                        </label>
                        <p className="mt-1 pl-6 text-xs text-gray-400">
                            Interruptor general. Cada categoría puede además tener su propia ventana de fechas.
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className={labelCls}>Abre el</label>
                                <input type="date" className={inputCls} value={edition.opensAt || ''}
                                    onChange={e => patch({ opensAt: e.target.value || null })} />
                            </div>
                            <div>
                                <label className={labelCls}>Cierra el</label>
                                <input type="date" className={inputCls} value={edition.closesAt || ''}
                                    onChange={e => patch({ closesAt: e.target.value || null })} />
                            </div>
                        </div>
                    </div>

                    {/* Tasa de cambio */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                            <Coins className="h-4 w-4 text-amber-500" /> Tasa de cambio de la edición
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                            Se usa cuando una categoría publica su precio en una moneda y la pasarela cobra en otra.
                            Cada inscripción guarda la tasa con la que se le cobró, así que cambiarla aquí
                            <strong> no altera las inscripciones ya creadas</strong>.
                        </p>
                        <div className="mt-3 max-w-xs">
                            <label className={labelCls}>Pesos colombianos por dólar (COP/USD)</label>
                            <input type="number" min={0} step="1" className={inputCls}
                                value={edition.fx?.usdToCop ?? ''}
                                onChange={e => patch({ fx: { ...edition.fx, usdToCop: e.target.value ? Number(e.target.value) : undefined } })}
                                placeholder="4100" />
                            {edition.fx?.updatedAt && (
                                <p className="mt-1 text-xs text-gray-400">
                                    Actualizada el {new Date(edition.fx.updatedAt).toLocaleString('es-CO')}
                                </p>
                            )}
                        </div>
                        {converting && !hasFxRate && (
                            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                Hay categorías configuradas para cobrar en otra moneda, pero no hay tasa. Mientras
                                falte, esas inscripciones se cobrarán en su moneda publicada, sin convertir.
                            </p>
                        )}
                    </div>

                    {/* Avisos */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className={labelCls}>Correos que reciben aviso de cada inscripción</label>
                            <input type="text" className={inputCls}
                                value={(edition.settings?.adminEmails || []).join(', ')}
                                onChange={e => patch({
                                    settings: {
                                        ...edition.settings,
                                        adminEmails: e.target.value.split(',').map(x => x.trim()).filter(Boolean),
                                    },
                                })}
                                placeholder="Separados por coma" />
                        </div>
                        <div>
                            <label className={labelCls}>Mensaje de confirmación</label>
                            <input type="text" className={inputCls} value={edition.settings?.successMessage || ''}
                                onChange={e => patch({ settings: { ...edition.settings, successMessage: e.target.value } })}
                                placeholder="Se muestra y se envía al confirmar la inscripción" />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" className="h-4 w-4" checked={edition.settings?.sendReceipt !== false}
                            onChange={e => patch({ settings: { ...edition.settings, sendReceipt: e.target.checked } })} />
                        Enviar comprobante por correo al participante
                    </label>

                    <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
                        <button type="button" onClick={saveEdition} disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar edición
                        </button>
                        {saved && <span className="text-sm font-semibold text-emerald-600">Guardado.</span>}
                    </div>
                </div>
            )}

            {/* ── Categorías ──────────────────────────────────────── */}
            {pane === 'categorias' && (
                <EventCategoriesManager eventId={eventId} categories={categories} catalog={catalog}
                    hasFxRate={hasFxRate} onReload={load} />
            )}

            {/* ── Botones de la ficha pública ─────────────────────── */}
            {pane === 'botones' && cta && (
                <EventCtaManager eventId={eventId} cta={cta} categories={categories} saving={saving}
                    onChange={setCta} onSave={saveEdition}
                    onGoToCategories={() => setPane('categorias')}
                    onGoToEdition={() => setPane('edicion')} />
            )}

            {/* ── Inscripciones ───────────────────────────────────── */}
            {pane === 'inscripciones' && (
                <EventRegistrationsManager eventId={eventId} eventTitle={eventTitle}
                    categories={categories.map(c => ({ key: c.key, name: c.name }))}
                    statuses={catalog?.statuses || []} />
            )}

            {/* ── Acreditación ────────────────────────────────────── */}
            {pane === 'acreditacion' && (
                <EventAccreditation eventId={eventId} eventTitle={eventTitle} venue={edition?.venue} />
            )}
        </div>
    );
};

export default EventRegistrationTab;
