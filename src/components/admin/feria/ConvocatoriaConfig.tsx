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
    CreditCard, Target, Link as LinkIcon, DollarSign, Users, CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

interface Option { value: string; label: string }
interface FocusArea { key: string; label: string }

export interface FairConfig {
    enabled: boolean;
    formPath: string;
    edition: { number: number; ordinal: string; name: string; city: string; country: string; year: number; dates?: string; key: string };
    deadline: string;
    presentation: { maxMinutes: number };
    registration: { amountCop: number; currency: string; concept: string; maxProjectsPerClub: number };
    districts: Option[];
    focusAreas: FocusArea[];
    redirect: { url: string; label: string; delaySeconds: number; name: string };
    trm: { provider: string; fallbackProviders: string[]; manualRate: number | null; refreshHours: number };
    content: { title: string; subtitle: string; intro: string; requirements: string[]; note: string; priorityNote: string };
    notifications: { adminEmails: string[]; sendReceipt: boolean };
    access: { admins: string[]; finance: string[]; reviewers: string[] };
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

    const publicUrl = `${window.location.origin}${config.formPath || '/postular-proyecto'}`;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-sm text-slate-500">
                    Formulario público ·{' '}
                    <a href={publicUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{publicUrl}</a>
                </p>
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
                    <Input label="Minutos de presentación" type="number" value={config.presentation.maxMinutes} onChange={(e: ChangeEvent) => patch('presentation.maxMinutes', Number(e.target.value))} hint="Tiempo máximo de exposición de cada proyecto durante la feria." />
                    <Input label="Dirección pública del formulario" value={config.formPath || ''} onChange={(e: ChangeEvent) => patch('formPath', e.target.value)} hint="Ruta donde vive el formulario. Por defecto /postular-proyecto; las direcciones anteriores siguen redirigiendo aquí." />
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={config.enabled !== false} onChange={e => patch('enabled', e.target.checked)} className="h-4 w-4" />
                    Convocatoria abierta (si se desactiva, la página pública muestra "Convocatoria cerrada")
                </label>
            </Card>

            <Card title="Valor de inscripción y pago" icon={CreditCard}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Valor de inscripción (COP)" type="number" value={config.registration.amountCop} onChange={(e: ChangeEvent) => patch('registration.amountCop', Number(e.target.value))} hint="Se cobra en pesos colombianos vía Stripe." />
                    <Input label="Moneda de cobro" value={config.registration.currency} onChange={(e: ChangeEvent) => patch('registration.currency', e.target.value.toUpperCase())} />
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

            <Card title="Distritos habilitados" icon={Users}>
                <div className="space-y-2">
                    {config.districts.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                value={d.label}
                                onChange={e => patch('districts', config.districts.map((x, ix) => ix === i ? { value: e.target.value, label: e.target.value } : x))}
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                onClick={() => patch('districts', config.districts.filter((_, ix) => ix !== i))}
                                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                            ><Trash2 size={15} /></button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => patch('districts', [...config.districts, { value: '', label: '' }])}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
                ><Plus size={15} /> Agregar distrito</button>
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
