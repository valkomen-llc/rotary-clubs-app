import { useEffect, useState, type ReactNode } from 'react';
import { Upload, Save, Loader2, ExternalLink, Image as ImageIcon, Users, Flag, Plus, Trash2, Layout } from 'lucide-react';
import { toast } from 'sonner';
import BannerPreview from '../../BannerPreview';
import { DEFAULT_CONFIG, type BannerTemplate, type BannerConfig, type Person } from '../../../lib/bannerRender';

const API = import.meta.env.VITE_API_URL || '/api';

const selectCls = 'w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <label className="block mb-3">
        <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
        {children}
    </label>
);

const BannerTemplateManager = () => {
    const [name, setName] = useState('Plantilla de Pendón');
    const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
    const [widthCm, setWidthCm] = useState(80);
    const [heightCm, setHeightCm] = useState(180);
    const [config, setConfig] = useState<BannerConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingFooterLogo, setUploadingFooterLogo] = useState(false);

    useEffect(() => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        fetch(`${API}/banner/template`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
            signal: ctrl.signal,
        })
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((tpl: BannerTemplate) => {
                if (!tpl) return;
                setName(tpl.name || 'Plantilla de Pendón');
                setBackgroundUrl(tpl.backgroundUrl || null);
                setWidthCm(tpl.widthCm || 80);
                setHeightCm(tpl.heightCm || 180);
                setConfig({ ...DEFAULT_CONFIG, ...(tpl.config || {}) });
            })
            .catch(() => {/* seguimos con valores por defecto */})
            .finally(() => { clearTimeout(timer); setLoading(false); });
        return () => { clearTimeout(timer); ctrl.abort(); };
    }, []);

    const handleUpload = async (file: File | undefined) => {
        if (!file) return;
        setUploading(true);
        const toastId = toast.loading('Subiendo imagen de fondo…');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'banner-templates');
            const res = await fetch(`${API}/media/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                body: formData,
            });
            const data = await res.json();
            if (res.ok && data.url) { setBackgroundUrl(data.url); toast.success('Imagen de fondo lista', { id: toastId }); }
            else toast.error(data.error || 'Error al subir', { id: toastId });
        } catch { toast.error('Error al subir la imagen', { id: toastId }); }
        finally { setUploading(false); }
    };

    // Logo del club: sube por /api/media/upload-logo, que auto-recorta los
    // espacios vacíos (sharp .trim) y lo deja listo para centrar.
    const handleUploadLogo = async (file: File | undefined) => {
        if (!file) return;
        setUploadingLogo(true);
        const toastId = toast.loading('Subiendo y recortando logo…');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'banner-logos');
            const res = await fetch(`${API}/media/upload-logo`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                body: formData,
            });
            const data = await res.json();
            if (res.ok && data.url) { setConfig(c => ({ ...c, logo: { url: data.url, scale: c.logo?.scale ?? 1 } })); toast.success('Logo recortado y listo', { id: toastId }); }
            else toast.error(data.error || 'Error al subir el logo', { id: toastId });
        } catch { toast.error('Error al subir el logo', { id: toastId }); }
        finally { setUploadingLogo(false); }
    };

    // Logo del pie (mismo auto-recorte que el de la cabecera).
    const handleUploadFooterLogo = async (file: File | undefined) => {
        if (!file) return;
        setUploadingFooterLogo(true);
        const toastId = toast.loading('Subiendo y recortando logo del pie…');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'banner-logos');
            const res = await fetch(`${API}/media/upload-logo`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                body: formData,
            });
            const data = await res.json();
            if (res.ok && data.url) { setConfig(c => ({ ...c, footer: { ...c.footer, logoUrl: data.url, logoScale: c.footer?.logoScale ?? 1 } })); toast.success('Logo del pie listo', { id: toastId }); }
            else toast.error(data.error || 'Error al subir el logo', { id: toastId });
        } catch { toast.error('Error al subir el logo', { id: toastId }); }
        finally { setUploadingFooterLogo(false); }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API}/banner/template`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                body: JSON.stringify({ name, backgroundUrl, widthCm, heightCm, config }),
            });
            if (res.ok) toast.success('Plantilla guardada — ya es la predeterminada del público');
            else { const d = await res.json().catch(() => ({})); toast.error(d.error || 'No se pudo guardar'); }
        } catch { toast.error('Error al guardar la plantilla'); }
        finally { setSaving(false); }
    };

    // Helpers de personas
    const updatePerson = (i: number, patch: Partial<Person>) =>
        setConfig(c => ({ ...c, people: c.people.map((p, idx) => idx === i ? { ...p, ...patch } : p) }));
    const addPerson = () =>
        setConfig(c => ({ ...c, people: [...c.people, { name: 'Nombre y Apellido', role: 'Cargo', period: '(Periodo Rotario 2025-2026)' }] }));
    const removePerson = (i: number) =>
        setConfig(c => ({ ...c, people: c.people.filter((_, idx) => idx !== i) }));

    if (loading) {
        return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                        <Layout className="w-5 h-5 text-indigo-600" /> Plantilla de Pendón (público)
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Configura la plantilla por defecto que verá cualquier persona en el generador público.</p>
                </div>
                <a href="/generador-pendones" target="_blank" rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                    Abrir generador <ExternalLink className="w-4 h-4" />
                </a>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                {/* Controles */}
                <div>
                    {/* Fondo */}
                    <section className="mb-6">
                        <div className="flex items-center gap-2 mb-3 text-gray-800"><ImageIcon className="w-4 h-4" /><h4 className="text-sm font-bold">Imagen de fondo</h4></div>
                        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors">
                            {uploading ? <Loader2 className="w-5 h-5 animate-spin text-indigo-600" /> : <Upload className="w-5 h-5 text-gray-400" />}
                            <span className="text-sm text-gray-600 font-medium">{backgroundUrl ? 'Reemplazar imagen de fondo' : 'Subir imagen de fondo (azul + curvas doradas)'}</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e.target.files?.[0])} />
                        </label>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <Field label="Ancho (cm)"><input type="number" min={1} className={selectCls} value={widthCm} onChange={e => setWidthCm(Math.max(1, parseInt(e.target.value) || 80))} /></Field>
                            <Field label="Alto (cm)"><input type="number" min={1} className={selectCls} value={heightCm} onChange={e => setHeightCm(Math.max(1, parseInt(e.target.value) || 180))} /></Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Margen horizontal (%)">
                                <input type="number" min={0} max={40} step={0.5} className={selectCls}
                                    value={config.margins?.x ?? 6}
                                    onChange={e => setConfig(c => ({ ...c, margins: { x: Math.max(0, parseFloat(e.target.value) || 0), y: c.margins?.y ?? 4 } }))} />
                            </Field>
                            <Field label="Margen vertical (%)">
                                <input type="number" min={0} max={40} step={0.5} className={selectCls}
                                    value={config.margins?.y ?? 4}
                                    onChange={e => setConfig(c => ({ ...c, margins: { x: c.margins?.x ?? 6, y: Math.max(0, parseFloat(e.target.value) || 0) } }))} />
                            </Field>
                        </div>
                        <p className="text-[10px] text-gray-400 -mt-1">Los márgenes y las guías de centrado son solo ayudas de edición; no se imprimen en el PDF.</p>
                    </section>

                    {/* Cabecera: logo del club + distrito */}
                    <section className="mb-6 border-t border-gray-100 pt-5">
                        <div className="flex items-center gap-2 mb-3 text-gray-800"><ImageIcon className="w-4 h-4" /><h4 className="text-sm font-bold">Cabecera (logo del club + distrito)</h4></div>
                        <Field label="Logo por defecto del club">
                            <div className="flex items-center gap-3">
                                <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                                    {config.logo?.url ? <img src={config.logo.url} alt="Logo" className="max-w-full max-h-full object-contain" /> : <ImageIcon className="w-6 h-6 text-gray-300" />}
                                </div>
                                <div className="flex-1">
                                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors">
                                        {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <Upload className="w-4 h-4 text-gray-400" />}
                                        <span className="text-xs text-gray-600 font-medium">{config.logo?.url ? 'Reemplazar logo' : 'Subir logo del club'}</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={e => handleUploadLogo(e.target.files?.[0])} />
                                    </label>
                                    {config.logo?.url && <button onClick={() => setConfig(c => ({ ...c, logo: { url: null, scale: 1 } }))} className="mt-1 text-[11px] text-gray-400 hover:text-red-500">Quitar logo</button>}
                                    <p className="mt-1 text-[10px] text-gray-400">Se recortan los espacios vacíos y se ajusta el tamaño automáticamente según la forma del logo.</p>
                                </div>
                            </div>
                        </Field>
                        {config.logo?.url && (
                            <Field label={`Tamaño del logo (${Math.round((config.logo.scale ?? 1) * 100)}%)`}>
                                <input type="range" min={0.5} max={2} step={0.05} value={config.logo.scale ?? 1}
                                    onChange={e => setConfig(c => ({ ...c, logo: { ...c.logo, scale: parseFloat(e.target.value) } }))}
                                    className="w-full accent-indigo-600" />
                            </Field>
                        )}
                    </section>

                    {/* Personas */}
                    <section className="mb-6 border-t border-gray-100 pt-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-gray-800"><Users className="w-4 h-4" /><h4 className="text-sm font-bold">Personas / Directiva</h4></div>
                            <button onClick={addPerson} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"><Plus className="w-3.5 h-3.5" /> Agregar</button>
                        </div>
                        <div className="space-y-3">
                            {config.people.map((p, i) => (
                                <div key={i} className="rounded-xl border border-gray-200 p-3 relative">
                                    <button onClick={() => removePerson(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500" title="Quitar"><Trash2 className="w-4 h-4" /></button>
                                    <input className={`${selectCls} mb-2 font-semibold`} placeholder="Nombre y Apellido" value={p.name} onChange={e => updatePerson(i, { name: e.target.value })} />
                                    <input className={`${selectCls} mb-2`} placeholder="Cargo (ej. Presidente, Club Rotario...)" value={p.role} onChange={e => updatePerson(i, { role: e.target.value })} />
                                    <input className={`${selectCls} text-sm`} placeholder="(Periodo Rotario 2025-2026)" value={p.period} onChange={e => updatePerson(i, { period: e.target.value })} />
                                </div>
                            ))}
                            {config.people.length === 0 && <p className="text-xs text-gray-400">Sin personas. Usá "Agregar" para añadir.</p>}
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                            <Field label="Color nombre"><input type="color" className="w-full h-9 rounded-md border border-gray-300 cursor-pointer" value={config.colors.name} onChange={e => setConfig(c => ({ ...c, colors: { ...c.colors, name: e.target.value } }))} /></Field>
                            <Field label="Color cargo"><input type="color" className="w-full h-9 rounded-md border border-gray-300 cursor-pointer" value={config.colors.role} onChange={e => setConfig(c => ({ ...c, colors: { ...c.colors, role: e.target.value } }))} /></Field>
                            <Field label="Color periodo"><input type="color" className="w-full h-9 rounded-md border border-gray-300 cursor-pointer" value={config.colors.period} onChange={e => setConfig(c => ({ ...c, colors: { ...c.colors, period: e.target.value } }))} /></Field>
                        </div>
                        <p className="text-xs font-semibold text-gray-600 mt-2 mb-1">Tamaño de los textos</p>
                        <div className="grid grid-cols-3 gap-3">
                            <Field label={`Nombre (${config.sizes.name}%)`}>
                                <input type="range" min={3} max={12} step={0.25} value={config.sizes.name} className="w-full accent-indigo-600"
                                    onChange={e => setConfig(c => ({ ...c, sizes: { ...c.sizes, name: parseFloat(e.target.value) } }))} />
                            </Field>
                            <Field label={`Cargo (${config.sizes.role}%)`}>
                                <input type="range" min={2} max={8} step={0.25} value={config.sizes.role} className="w-full accent-indigo-600"
                                    onChange={e => setConfig(c => ({ ...c, sizes: { ...c.sizes, role: parseFloat(e.target.value) } }))} />
                            </Field>
                            <Field label={`Periodo (${config.sizes.period}%)`}>
                                <input type="range" min={1.5} max={6} step={0.25} value={config.sizes.period} className="w-full accent-indigo-600"
                                    onChange={e => setConfig(c => ({ ...c, sizes: { ...c.sizes, period: parseFloat(e.target.value) } }))} />
                            </Field>
                        </div>
                    </section>

                    {/* Pie */}
                    <section className="border-t border-gray-100 pt-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-gray-800"><Flag className="w-4 h-4" /><h4 className="text-sm font-bold">Pie de página</h4></div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                                <input type="checkbox" checked={config.footer.show} onChange={e => setConfig(c => ({ ...c, footer: { ...c.footer, show: e.target.checked } }))} /> Mostrar
                            </label>
                        </div>
                        <Field label="Logo del pie">
                            <div className="flex items-center gap-3">
                                <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                                    {config.footer.logoUrl ? <img src={config.footer.logoUrl} alt="Logo pie" className="max-w-full max-h-full object-contain" /> : <ImageIcon className="w-5 h-5 text-gray-300" />}
                                </div>
                                <div className="flex-1">
                                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors">
                                        {uploadingFooterLogo ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <Upload className="w-4 h-4 text-gray-400" />}
                                        <span className="text-xs text-gray-600 font-medium">{config.footer.logoUrl ? 'Reemplazar logo del pie' : 'Subir logo del pie'}</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={e => handleUploadFooterLogo(e.target.files?.[0])} />
                                    </label>
                                    {config.footer.logoUrl && <button onClick={() => setConfig(c => ({ ...c, footer: { ...c.footer, logoUrl: null } }))} className="mt-1 text-[11px] text-gray-400 hover:text-red-500">Quitar logo del pie</button>}
                                </div>
                            </div>
                        </Field>
                        {config.footer.logoUrl && (
                            <Field label={`Tamaño del logo del pie (${Math.round((config.footer.logoScale ?? 1) * 100)}%)`}>
                                <input type="range" min={0.5} max={2} step={0.05} value={config.footer.logoScale ?? 1}
                                    onChange={e => setConfig(c => ({ ...c, footer: { ...c.footer, logoScale: parseFloat(e.target.value) } }))}
                                    className="w-full accent-indigo-600" />
                            </Field>
                        )}
                        <Field label="Lema"><input className={selectCls} value={config.footer.tagline} onChange={e => setConfig(c => ({ ...c, footer: { ...c.footer, tagline: e.target.value } }))} /></Field>
                    </section>

                    <button onClick={handleSave} disabled={saving}
                        className="mt-6 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-lg px-5 py-2.5 transition-colors">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando…' : 'Guardar como predeterminada'}
                    </button>
                </div>

                {/* Preview interactivo */}
                <div className="flex flex-col items-center">
                    <div className="flex items-center justify-between w-full mb-2">
                        <span className="text-xs font-semibold text-gray-500">Vista previa · arrastrá para reubicar · Shift+clic para seleccionar varios</span>
                        <button onClick={() => setConfig(c => ({ ...c, offsets: {} }))}
                            className="text-[11px] font-semibold text-gray-500 hover:text-indigo-600">Restablecer posiciones</button>
                    </div>
                    <BannerPreview
                        template={{ backgroundUrl, widthCm, heightCm }}
                        config={config}
                        heightCss="min(70vh, 760px)"
                        interactive
                        onOffsetsChange={offsets => setConfig(c => ({ ...c, offsets }))}
                    />
                </div>
            </div>
        </div>
    );
};

export default BannerTemplateManager;
