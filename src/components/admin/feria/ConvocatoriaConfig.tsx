// ════════════════════════════════════════════════════════════════════
// Configuración de la convocatoria — pestaña del módulo unificado
// v4.601.0
//
// Antes vivía en su propia entrada de menú ("Postulación de Proyectos").
// Ahora es una pestaña más de "Postulaciones y Pagos": una sola puerta de
// entrada para operar la feria y para configurarla.
//
// El guardado hace merge profundo en el servidor: nunca resetea lo que el
// cliente ya dejó configurado.
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import {
    Save, Loader2, Plus, Trash2, RefreshCw, Calendar, MapPin,
    CreditCard, Target, Link as LinkIcon, DollarSign, Users, CheckCircle2, Ticket,
    ArrowUp, ArrowDown, Mail, AlertTriangle, IdCard, Award,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PROJECT_FAIR_FORM_PATH, PROJECT_FAIR_REGISTER_PATH } from '../../../lib/ctaLinks';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

interface Option { value: string; label: string }

/**
 * Un distrito con su catálogo de clubes. Los clubes viven DENTRO del distrito y
 * no en un mapa aparte con el nombre como llave: renombrar un distrito no puede
 * dejar su lista huérfana. `clubs` es opcional — una convocatoria guardada
 * antes de v4.706 no lo trae, y sin lista el club se escribe a mano.
 */
interface DistrictOption extends Option { clubs?: string[] }
interface FocusArea { key: string; label: string }

/**
 * Panel público de registro (v4.602): copia del panel de inscripción de la
 * Conferencia LATIR. Todos los campos son opcionales — lo que quede vacío se
 * completa con los datos de la edición.
 */
export interface RegistrationPanelConfig {
    enabled: boolean;
    headerLogo: string;
    title: string;
    subtitle: string;
    startDate: string;
    buttonLabel: string;
    buttonLink: string;
    ticketGeneralLabel: string;
    ticketGeneral: string;
    ticketNote: string;
    ticketRotexLabel: string;
    ticketRotex: string;
    closeLabel: string;
    closeDateText: string;
    footerImage: string;
    intro: string;
}

export interface FairConfig {
    enabled: boolean;
    formPath: string;
    edition: { number: number; ordinal: string; name: string; city: string; country: string; year: number; dates?: string; key: string };
    deadline: string;
    presentation: { minMinutes?: number; maxMinutes: number };
    registration: { priceMode?: 'COP' | 'USD'; amountCop: number; amountUsd?: number; currency: string; concept: string; maxProjectsPerClub: number };
    districts: DistrictOption[];
    idTypes: FocusArea[];
    clubRoles: FocusArea[];
    focusAreas: FocusArea[];
    redirect: { url: string; label: string; delaySeconds: number; name: string };
    trm: { provider: string; fallbackProviders: string[]; manualRate: number | null; refreshHours: number };
    content: { title: string; subtitle: string; intro: string; requirements: string[]; note: string; priorityNote: string };
    notifications: {
        adminEmails: string[]; sendReceipt: boolean;
        branding?: { headerLogoUrl?: string; footerLogoUrl?: string; footerText?: string };
        sender?: { name?: string; email?: string; replyTo?: string };
    };
    access: { admins: string[]; finance: string[]; reviewers: string[] };
    registrationPanel?: Partial<RegistrationPanelConfig>;
    clubId: string | null;
}

type CardProps = { title: string; icon: LucideIcon; children: React.ReactNode };
const Card = ({ title, icon: Icon, children }: CardProps) => (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
            <Icon size={16} className="text-blue-700" /> {title}
        </h2>
        {children}
    </section>
);

type InputProps = { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>;
const Input = ({ label, hint, ...props }: InputProps) => (
    <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
        <input {...props} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
);

type TextareaProps = { label: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>;
const Textarea = ({ label, hint, ...props }: TextareaProps) => (
    <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
        <textarea {...props} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
);

// Las ediciones del evento se nombran en número romano (XII, XIII, …), que es
// la convención habitual para versiones de eventos. Se usa como sugerencia en
// el campo "Ordinal" al cambiar el número de la edición.
const ROMAN_PAIRS: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
const toRoman = (value: number): string => {
    let n = Math.floor(Number(value) || 0);
    if (n <= 0 || n > 3999) return '';
    return ROMAN_PAIRS.reduce((out, [amount, symbol]) => {
        while (n >= amount) { out += symbol; n -= amount; }
        return out;
    }, '');
};

/** Mueve un elemento de una lista a otra posición, sin mutar el original. */
const move = <T,>(list: T[], from: number, to: number): T[] => {
    if (to < 0 || to >= list.length) return list;
    const out = [...list];
    const [item] = out.splice(from, 1);
    out.splice(to, 0, item);
    return out;
};

// Equivalente en dólares de un precio en pesos, con la TRM que se esté viendo.
const usdPreview = (cop: number, rate: number) =>
    `$${(Number(cop || 0) / Number(rate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

// Vista previa del texto que verá el postulante en el formulario público.
const presentationPreview = (p: { minMinutes?: number; maxMinutes: number }) => {
    const max = Number(p?.maxMinutes) || 6;
    const min = Number(p?.minMinutes) || 0;
    return min > 0 && min < max ? `De ${min} a ${max} minutos` : `Máximo ${max} minutos`;
};

/** @param canEdit  Sólo los perfiles con permiso de configuración guardan cambios. */
const ConvocatoriaConfig: React.FC<{ canEdit?: boolean; onSaved?: () => void }> = ({ canEdit = true, onSaved }) => {
    const [config, setConfig] = useState<FairConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [providers, setProviders] = useState<{ key: string; label: string }[]>([]);
    const [trm, setTrm] = useState<any>(null);
    const [trmLoading, setTrmLoading] = useState(false);

    type ChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

    const patch = (path: string, value: unknown) => {
        setConfig(prev => {
            if (!prev) return prev;
            const next: any = { ...prev };
            const keys = path.split('.');
            let cursor = next;
            for (let i = 0; i < keys.length - 1; i++) {
                cursor[keys[i]] = { ...cursor[keys[i]] };
                cursor = cursor[keys[i]];
            }
            cursor[keys[keys.length - 1]] = value;
            return next;
        });
    };

    const loadTrm = (force = false) => {
        setTrmLoading(true);
        fetch(`${API}/project-fair/trm${force ? '?force=true' : ''}`)
            .then(r => r.json()).then(setTrm).catch(() => setTrm(null)).finally(() => setTrmLoading(false));
    };

    useEffect(() => {
        Promise.all([
            fetch(`${API}/project-fair/admin/config`, { headers: authHeaders() }).then(r => r.json()),
            fetch(`${API}/project-fair/admin/trm-providers`, { headers: authHeaders() }).then(r => r.json()).catch(() => []),
        ])
            .then(([cfg, provs]) => {
                if (cfg?.error) throw new Error(cfg.error);
                setConfig(cfg);
                setProviders(Array.isArray(provs) ? provs : []);
            })
            .catch(e => toast.error(e?.message || 'No se pudo cargar la configuración'))
            .finally(() => setLoading(false));
        loadTrm();
    }, []);

    const save = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/project-fair/admin/config`, {
                method: 'PUT',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Error guardando');
            setConfig(data);
            toast.success('Configuración guardada');
            onSaved?.();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    if (loading || !config) {
        return <div className="flex h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> Cargando configuración…</div>;
    }

    const publicUrl = `${window.location.origin}${config.formPath || PROJECT_FAIR_FORM_PATH}`;
    const registerUrl = `${window.location.origin}${PROJECT_FAIR_REGISTER_PATH}`;
    const panel = config.registrationPanel || {};
    const priceMode = config.registration.priceMode === 'USD' ? 'USD' : 'COP';

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
                <div className="space-y-1 text-sm text-slate-500">
                    <p>
                        Formulario público ·{' '}
                        <a href={publicUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{publicUrl}</a>
                    </p>
                    <p>
                        Página de registro ·{' '}
                        <a href={registerUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{registerUrl}</a>
                    </p>
                </div>
                {canEdit ? (
                    <button onClick={save} disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
                    </button>
                ) : (
                    <span className="text-xs font-semibold text-slate-400">Tu perfil puede consultar la configuración, no modificarla.</span>
                )}
            </div>

            <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-70">
            <Card title="Edición del evento" icon={MapPin}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Nombre completo del evento" value={config.edition.name} onChange={(e: ChangeEvent) => patch('edition.name', e.target.value)} />
                    <Input label="Ciudad sede" value={config.edition.city} onChange={(e: ChangeEvent) => patch('edition.city', e.target.value)} />
                    <Input label="Número de versión" type="number" value={config.edition.number} onChange={(e: ChangeEvent) => patch('edition.number', Number(e.target.value))} />
                    <Input
                        label="Ordinal de la edición"
                        value={config.edition.ordinal}
                        onChange={(e: ChangeEvent) => patch('edition.ordinal', e.target.value)}
                        hint={`Se usa número romano para las versiones del evento${toRoman(config.edition.number) ? ` — para la edición ${config.edition.number} sería ${toRoman(config.edition.number)}` : ''}.`}
                    />
                    <Input label="País" value={config.edition.country} onChange={(e: ChangeEvent) => patch('edition.country', e.target.value)} />
                    <Input label="Año" type="number" value={config.edition.year} onChange={(e: ChangeEvent) => patch('edition.year', Number(e.target.value))} />
                    <Input label="Fechas (opcional)" value={config.edition.dates || ''} onChange={(e: ChangeEvent) => patch('edition.dates', e.target.value)} hint="Ej: 15 y 16 de octubre de 2026" />
                    <Input label="Clave interna de la edición" value={config.edition.key} onChange={(e: ChangeEvent) => patch('edition.key', e.target.value)} hint="Se guarda en cada inscripción para diferenciar ediciones." />
                    <Input label="Fecha límite de postulación" type="date" value={config.deadline || ''} onChange={(e: ChangeEvent) => patch('deadline', e.target.value)} />
                    <Input label="Minutos de presentación (mínimo)" type="number" value={config.presentation.minMinutes ?? ''} onChange={(e: ChangeEvent) => patch('presentation.minMinutes', Number(e.target.value))} hint="Déjalo en 0 si sólo quieres anunciar un tope máximo." />
                    <Input label="Minutos de presentación (máximo)" type="number" value={config.presentation.maxMinutes} onChange={(e: ChangeEvent) => patch('presentation.maxMinutes', Number(e.target.value))} hint={`Con ambos valores el formulario público muestra "${presentationPreview(config.presentation)} por proyecto".`} />
                    <Input label="Dirección pública del formulario" value={config.formPath || ''} onChange={(e: ChangeEvent) => patch('formPath', e.target.value)} hint="Ruta donde vive el formulario. Por defecto /postular-proyecto; las direcciones anteriores siguen redirigiendo aquí." />
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={config.enabled !== false} onChange={e => patch('enabled', e.target.checked)} className="h-4 w-4" />
                    Convocatoria abierta (si se desactiva, la página pública muestra "Convocatoria cerrada")
                </label>
            </Card>

            <Card title="Valor de inscripción y pago" icon={CreditCard}>
                {/* El cobro en Stripe siempre se hace en dólares. Lo que se elige
                    aquí es en qué moneda se FIJA y se anuncia el precio. */}
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                    {([
                        { key: 'COP', title: 'Fijar el precio en pesos', desc: 'Se anuncia en COP y se cobra su equivalente en dólares con la TRM oficial del día del pago.' },
                        { key: 'USD', title: 'Fijar el precio en dólares', desc: 'Se anuncia y se cobra el mismo valor en USD, sin conversión ni TRM.' },
                    ] as const).map(opt => {
                        const active = priceMode === opt.key;
                        return (
                            <button
                                key={opt.key}
                                type="button"
                                disabled={!canEdit}
                                onClick={() => patch('registration.priceMode', opt.key)}
                                className={`rounded-xl border-2 p-4 text-left transition disabled:cursor-not-allowed ${
                                    active ? 'border-blue-600 bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${active ? 'border-blue-600' : 'border-slate-300'}`}>
                                        {active && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                                    </span>
                                    {opt.title}
                                </span>
                                <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{opt.desc}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    {priceMode === 'COP' ? (
                        <Input
                            label="Valor de inscripción (COP)" type="number"
                            value={config.registration.amountCop}
                            onChange={(e: ChangeEvent) => patch('registration.amountCop', Number(e.target.value))}
                            hint={trm?.rate
                                ? `Con la TRM de hoy se cobrarían ${usdPreview(config.registration.amountCop, trm.rate)}.`
                                : 'Se cobra su equivalente en dólares con la TRM del día del pago.'}
                        />
                    ) : (
                        <Input
                            label="Valor de inscripción (USD)" type="number" step="0.01"
                            value={config.registration.amountUsd ?? 0}
                            onChange={(e: ChangeEvent) => patch('registration.amountUsd', Number(e.target.value))}
                            hint="Es el valor exacto que Stripe le cobra al club."
                        />
                    )}
                    <Input label="Concepto del cobro" value={config.registration.concept} onChange={(e: ChangeEvent) => patch('registration.concept', e.target.value)} />
                    <Input label="Club/organización asociada (clubId)" value={config.clubId || ''} onChange={(e: ChangeEvent) => patch('clubId', e.target.value || null)} hint="Opcional: asocia los cobros a la billetera de ese club." />
                </div>
            </Card>

            <Card title="TRM (conversión a dólares)" icon={DollarSign}>
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                    <span className="text-slate-500">TRM vigente:</span>
                    <strong className="text-slate-900">
                        {trmLoading ? '…' : trm?.rate ? `${Number(trm.rate).toLocaleString('es-CO', { minimumFractionDigits: 2 })} COP/USD` : 'No disponible'}
                    </strong>
                    {trm?.source && <span className="text-xs text-slate-400">Fuente: {trm.source}</span>}
                    {trm?.fetchedAt && <span className="text-xs text-slate-400">Actualizada: {new Date(trm.fetchedAt).toLocaleString('es-CO')}</span>}
                    <button onClick={() => loadTrm(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
                        <RefreshCw size={12} className={trmLoading ? 'animate-spin' : ''} /> Actualizar
                    </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">Proveedor principal</span>
                        <select
                            value={config.trm.provider}
                            onChange={e => patch('trm.provider', e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        >
                            {providers.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                    </label>
                    <Input
                        label="Proveedores de respaldo (separados por coma)"
                        value={(config.trm.fallbackProviders || []).join(', ')}
                        onChange={(e: ChangeEvent) => patch('trm.fallbackProviders', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))}
                        hint={`Disponibles: ${providers.map(p => p.key).join(', ')}`}
                    />
                    <Input label="Horas de vigencia de la caché" type="number" value={config.trm.refreshHours} onChange={(e: ChangeEvent) => patch('trm.refreshHours', Number(e.target.value))} hint="La TRM se renueva además al iniciar un nuevo día calendario." />
                    <Input label="Tasa manual de emergencia (opcional)" type="number" value={config.trm.manualRate ?? ''} onChange={(e: ChangeEvent) => patch('trm.manualRate', e.target.value ? Number(e.target.value) : null)} hint="Sólo se usa si todos los proveedores fallan." />
                </div>
            </Card>

            <Card title="Distritos y sus clubes" icon={Users}>
                <p className="mb-3 text-xs text-slate-500">
                    Aparecen en la lista del formulario en este mismo orden. Usa las flechas para acomodarlos.
                    Debajo de cada uno va su lista de clubes, uno por línea: con la lista cargada,
                    el formulario ofrece un desplegable de clubes al elegir ese distrito;
                    sin ella, el club se escribe a mano.
                </p>
                <div className="space-y-4">
                    {config.districts.map((d, i) => {
                        // Al reemplazar un distrito se conserva `clubs`: renombrarlo no
                        // puede vaciar su lista. Por eso los clubes viven DENTRO del
                        // distrito y no en un mapa aparte con el nombre como llave.
                        const replace = (patchDistrict: Partial<DistrictOption>) =>
                            patch('districts', config.districts.map((x, ix) => ix === i ? { ...x, ...patchDistrict } : x));
                        const clubs = d.clubs || [];
                        return (
                            <div key={i} className="rounded-xl border border-slate-200 p-3">
                                <div className="flex items-center gap-2">
                                    <input
                                        value={d.label}
                                        onChange={e => replace({ value: e.target.value, label: e.target.value })}
                                        placeholder="Rotary Distrito 4271"
                                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-blue-500 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        title="Subir"
                                        disabled={i === 0}
                                        onClick={() => patch('districts', move(config.districts, i, i - 1))}
                                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                                    ><ArrowUp size={15} /></button>
                                    <button
                                        type="button"
                                        title="Bajar"
                                        disabled={i === config.districts.length - 1}
                                        onClick={() => patch('districts', move(config.districts, i, i + 1))}
                                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                                    ><ArrowDown size={15} /></button>
                                    <button
                                        onClick={() => patch('districts', config.districts.filter((_, ix) => ix !== i))}
                                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                                    ><Trash2 size={15} /></button>
                                </div>
                                <textarea
                                    value={clubs.join('\n')}
                                    onChange={e => replace({
                                        // Se guarda lo que hay, sin filtrar líneas vacías: filtrarlas
                                        // mientras se escribe impediría pulsar Intro para el club
                                        // siguiente. El servidor las descarta al leer la convocatoria.
                                        clubs: e.target.value.split('\n').map(c => c.replace(/^\s+/, '')),
                                    })}
                                    onBlur={e => replace({ clubs: e.target.value.split('\n').map(c => c.trim()).filter(Boolean) })}
                                    rows={6}
                                    placeholder={'Un club por línea:\nRotary Club Valledupar\nRotary Club Valledupar Hurtado\n…'}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-blue-500 focus:outline-none"
                                />
                                <p className="mt-1 text-[11px] text-slate-500">
                                    {clubs.filter(Boolean).length
                                        ? `${clubs.filter(Boolean).length} clubes · en el formulario aparecerán como desplegable`
                                        : 'Sin lista: el club se escribe a mano en el formulario'}
                                </p>
                            </div>
                        );
                    })}
                </div>
                <button
                    onClick={() => patch('districts', [...config.districts, { value: '', label: '', clubs: [] }])}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
                ><Plus size={15} /> Agregar distrito</button>
            </Card>

            <Card title="Tipos de documento" icon={IdCard}>
                <p className="mb-3 text-xs text-slate-500">
                    Los que puede elegir quien postula el proyecto. La clave se almacena en cada
                    inscripción; el texto es lo que ve el usuario. Se piden para facturar la
                    inscripción y para acreditar a quien llega a la feria.
                </p>
                <div className="space-y-2">
                    {(config.idTypes || []).map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                value={t.key}
                                onChange={e => patch('idTypes', (config.idTypes || []).map((x, ix) => ix === i ? { ...x, key: e.target.value } : x))}
                                className="w-48 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
                            />
                            <input
                                value={t.label}
                                onChange={e => patch('idTypes', (config.idTypes || []).map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))}
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                onClick={() => patch('idTypes', (config.idTypes || []).filter((_, ix) => ix !== i))}
                                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                            ><Trash2 size={15} /></button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => patch('idTypes', [...(config.idTypes || []), { key: '', label: '' }])}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
                ><Plus size={15} /> Agregar tipo de documento</button>
            </Card>

            <Card title="Roles dentro del club" icon={Award}>
                <p className="mb-3 text-xs text-slate-500">
                    Los cargos que puede elegir quien postula. Se nombran por el CARGO
                    («Presidencia», «Secretaría») y no por la persona, de modo que la lista sirve
                    igual para una socia y para un socio sin llenarse de «(a)». La clave
                    <code className="mx-1 rounded bg-slate-100 px-1">otro</code>
                    es especial: al elegirla, el formulario pide escribir el cargo. No la renombres.
                </p>
                <div className="space-y-2">
                    {(config.clubRoles || []).map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                value={r.key}
                                onChange={e => patch('clubRoles', (config.clubRoles || []).map((x, ix) => ix === i ? { ...x, key: e.target.value } : x))}
                                className="w-48 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
                            />
                            <input
                                value={r.label}
                                onChange={e => patch('clubRoles', (config.clubRoles || []).map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))}
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                title="Subir"
                                disabled={i === 0}
                                onClick={() => patch('clubRoles', move(config.clubRoles || [], i, i - 1))}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                            ><ArrowUp size={15} /></button>
                            <button
                                type="button"
                                title="Bajar"
                                disabled={i === (config.clubRoles || []).length - 1}
                                onClick={() => patch('clubRoles', move(config.clubRoles || [], i, i + 1))}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                            ><ArrowDown size={15} /></button>
                            <button
                                onClick={() => patch('clubRoles', (config.clubRoles || []).filter((_, ix) => ix !== i))}
                                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                            ><Trash2 size={15} /></button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => patch('clubRoles', [...(config.clubRoles || []), { key: '', label: '' }])}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
                ><Plus size={15} /> Agregar rol</button>
            </Card>

            <Card title="Áreas de enfoque" icon={Target}>
                <p className="mb-3 text-xs text-slate-500">
                    La clave se almacena en cada inscripción (para búsquedas y clasificación); el texto es lo que ve el usuario.
                </p>
                <div className="space-y-2">
                    {config.focusAreas.map((a, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                value={a.key}
                                onChange={e => patch('focusAreas', config.focusAreas.map((x, ix) => ix === i ? { ...x, key: e.target.value } : x))}
                                className="w-48 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
                            />
                            <input
                                value={a.label}
                                onChange={e => patch('focusAreas', config.focusAreas.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))}
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                onClick={() => patch('focusAreas', config.focusAreas.filter((_, ix) => ix !== i))}
                                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                            ><Trash2 size={15} /></button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => patch('focusAreas', [...config.focusAreas, { key: '', label: '' }])}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
                ><Plus size={15} /> Agregar área</button>
            </Card>

            <Card title="Redirección posterior al pago" icon={LinkIcon}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="URL de destino" value={config.redirect.url} onChange={(e: ChangeEvent) => patch('redirect.url', e.target.value)} />
                    <Input label="Nombre del portal" value={config.redirect.name} onChange={(e: ChangeEvent) => patch('redirect.name', e.target.value)} />
                    <Input label="Texto del botón" value={config.redirect.label} onChange={(e: ChangeEvent) => patch('redirect.label', e.target.value)} />
                    <Input label="Segundos antes de redirigir" type="number" value={config.redirect.delaySeconds} onChange={(e: ChangeEvent) => patch('redirect.delaySeconds', Number(e.target.value))} />
                </div>
            </Card>

            <Card title="Textos de la página pública" icon={Calendar}>
                <div className="space-y-4">
                    <Input label="Título" value={config.content.title} onChange={(e: ChangeEvent) => patch('content.title', e.target.value)} />
                    <Input label="Subtítulo" value={config.content.subtitle} onChange={(e: ChangeEvent) => patch('content.subtitle', e.target.value)} />
                    <Textarea label="Introducción" rows={4} value={config.content.intro} onChange={(e: ChangeEvent) => patch('content.intro', e.target.value)} />
                    <Textarea label="Nota sobre requisitos" rows={2} value={config.content.note} onChange={(e: ChangeEvent) => patch('content.note', e.target.value)} />
                    <Textarea
                        label="Tipos de proyectos que pueden inscribirse (uno por línea)" rows={4}
                        value={(config.content.requirements || []).join('\n')}
                        onChange={(e: ChangeEvent) => patch('content.requirements', e.target.value.split('\n').map((x: string) => x.trim()).filter(Boolean))}
                    />
                    <Textarea label="Nota de prioridad" rows={3} value={config.content.priorityNote} onChange={(e: ChangeEvent) => patch('content.priorityNote', e.target.value)} />
                </div>
            </Card>

            <Card title="Panel de registro (botón de la cabecera)" icon={Ticket}>
                <p className="mb-4 text-xs text-slate-500">
                    Es la página que abre el botón de <b>Registro</b> del menú principal, en{' '}
                    <a href={registerUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{registerUrl}</a>.
                    Muestra el mismo panel de inscripción de la Conferencia LATIR: logo, cuenta regresiva,
                    botón, precios y fecha de cierre. <b>Todos los campos son opcionales</b>: lo que dejes
                    vacío se completa solo con los datos de la edición (nombre, ciudad, valor y fecha límite).
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Título del panel" value={panel.title || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.title', e.target.value)} hint="Vacío usa el nombre de la edición." />
                    <Input label="Subtítulo" value={panel.subtitle || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.subtitle', e.target.value)} hint="Vacío usa la ciudad y el país." />
                    <Input label="Fecha de la cuenta regresiva" type="date" value={(panel.startDate || '').slice(0, 10)} onChange={(e: ChangeEvent) => patch('registrationPanel.startDate', e.target.value)} hint="Vacío cuenta hasta la fecha límite de postulación." />
                    <Input label="Texto del botón" value={panel.buttonLabel || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.buttonLabel', e.target.value)} hint='Por defecto "Inscripciones".' />
                    <Input label="Enlace del botón" value={panel.buttonLink || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.buttonLink', e.target.value)} hint="Vacío lleva al formulario de postulación." />
                    <Input label="Imagen del logo (URL)" value={panel.headerLogo || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.headerLogo', e.target.value)} hint="Se muestra sobre el título." />
                    <Input label="Etiqueta del valor principal" value={panel.ticketGeneralLabel || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.ticketGeneralLabel', e.target.value)} />
                    <Input label="Valor principal" value={panel.ticketGeneral || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.ticketGeneral', e.target.value)} hint="Vacío usa el valor de inscripción configurado arriba." />
                    <Input label="Nota bajo el valor (cursiva)" value={panel.ticketNote || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.ticketNote', e.target.value)} hint="Ej: A partir del 15/07 el valor sube." />
                    <Input label="Etiqueta del segundo valor" value={panel.ticketRotexLabel || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.ticketRotexLabel', e.target.value)} hint="Ej: Ticket acompañante." />
                    <Input label="Segundo valor" value={panel.ticketRotex || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.ticketRotex', e.target.value)} hint="Vacío oculta esta línea." />
                    <Input label="Etiqueta del cierre" value={panel.closeLabel || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.closeLabel', e.target.value)} />
                    <Input label="Fecha de cierre (texto)" value={panel.closeDateText || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.closeDateText', e.target.value)} hint="Vacío usa la fecha límite de postulación." />
                    <Input label="Imagen al pie del panel (URL)" value={panel.footerImage || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.footerImage', e.target.value)} />
                </div>
                <div className="mt-4">
                    <Textarea label="Texto de la página (opcional)" rows={3} value={panel.intro || ''} onChange={(e: ChangeEvent) => patch('registrationPanel.intro', e.target.value)} hint="Vacío reutiliza la introducción de la página pública." />
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={panel.enabled !== false} onChange={e => patch('registrationPanel.enabled', e.target.checked)} className="h-4 w-4" />
                    Registro abierto (si se desactiva, la página muestra "Registro cerrado")
                </label>
            </Card>

            <Card title="Perfiles del módulo de gestión" icon={Users}>
                <p className="mb-3 text-xs text-slate-500">
                    Quién puede hacer qué en <b>Postulaciones y Pagos</b>. El rol "administrator" de la
                    plataforma y quien administre el sitio de la feria ya tienen gestión completa; estas
                    listas otorgan permisos adicionales por correo, separadas por coma.
                </p>
                <div className="grid gap-4">
                    <Input
                        label="Administradores del módulo"
                        value={(config.access?.admins || []).join(', ')}
                        onChange={(e: ChangeEvent) => patch('access.admins', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))}
                        hint="Gestión completa: editar, cambiar estados, pagos, etiquetas y exportar."
                    />
                    <Input
                        label="Equipo financiero"
                        value={(config.access?.finance || []).join(', ')}
                        onChange={(e: ChangeEvent) => patch('access.finance', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))}
                        hint="Ven pagos y comprobantes, sincronizan con Stripe y reenvían recibos."
                    />
                    <Input
                        label="Revisores"
                        value={(config.access?.reviewers || []).join(', ')}
                        onChange={(e: ChangeEvent) => patch('access.reviewers', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))}
                        hint="Consultan proyectos, registran observaciones y mueven estados de revisión. No ven datos financieros."
                    />
                </div>
            </Card>

            <Card title="Notificaciones" icon={CheckCircle2}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                        label="Correos que reciben aviso de cada inscripción pagada"
                        value={(config.notifications?.adminEmails || []).join(', ')}
                        onChange={(e: ChangeEvent) => patch('notifications.adminEmails', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))}
                        hint="Separados por coma. Déjalo vacío para no enviar avisos."
                    />
                    <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox" className="h-4 w-4"
                            checked={config.notifications?.sendReceipt !== false}
                            onChange={e => patch('notifications.sendReceipt', e.target.checked)}
                        />
                        Enviar comprobante por correo al postulante
                    </label>
                </div>
            </Card>

            <Card title="Plantilla del correo" icon={Mail}>
                <p className="mb-4 text-xs text-slate-500">
                    Así se ve el comprobante que recibe el club al confirmarse su pago. Los logos se cargan por
                    enlace: pega la dirección de una imagen ya publicada (por ejemplo, la del logo en este mismo sitio).
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                        label="Logo de la cabecera"
                        value={config.notifications?.branding?.headerLogoUrl || ''}
                        onChange={(e: ChangeEvent) => patch('notifications.branding.headerLogoUrl', e.target.value)}
                        hint="Va sobre el texto “Comprobante de inscripción”. Se muestra hasta 230 × 70 px."
                    />
                    <Input
                        label="Logo del pie"
                        value={config.notifications?.branding?.footerLogoUrl || ''}
                        onChange={(e: ChangeEvent) => patch('notifications.branding.footerLogoUrl', e.target.value)}
                        hint="Va al final del cuerpo del correo. Se muestra hasta 200 × 64 px."
                    />
                    <Input
                        label="Texto bajo el logo del pie (opcional)"
                        value={config.notifications?.branding?.footerText || ''}
                        onChange={(e: ChangeEvent) => patch('notifications.branding.footerText', e.target.value)}
                        hint="Ej: una línea de contacto o el lema de la feria."
                    />
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Input
                        label="Nombre del remitente"
                        value={config.notifications?.sender?.name || ''}
                        onChange={(e: ChangeEvent) => patch('notifications.sender.name', e.target.value)}
                        hint="Es lo que el club ve como “De:”. Si lo dejas vacío se usa el nombre de la edición."
                    />
                    <Input
                        label="Correo del remitente"
                        type="email"
                        value={config.notifications?.sender?.email || ''}
                        onChange={(e: ChangeEvent) => patch('notifications.sender.email', e.target.value.trim())}
                        hint="Ej: inscripciones@tudominio.org"
                    />
                    <Input
                        label="Correo para respuestas (opcional)"
                        type="email"
                        value={config.notifications?.sender?.replyTo || ''}
                        onChange={(e: ChangeEvent) => patch('notifications.sender.replyTo', e.target.value.trim())}
                        hint="A dónde llegan las respuestas del club si escribe de vuelta."
                    />
                </div>
                {!!config.notifications?.sender?.email && (
                    <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <span>
                            El dominio de ese correo debe estar verificado con el proveedor de envíos. Si no lo está,
                            el envío se reintenta automáticamente con el remitente de la plataforma para que el
                            comprobante llegue igual, y queda anotado en el registro del servidor.
                        </span>
                    </p>
                )}
            </Card>
            </fieldset>

            {canEdit && (
                <div className="flex justify-end">
                    <button onClick={save} disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar cambios
                    </button>
                </div>
            )}
        </div>
    );
};

export default ConvocatoriaConfig;
