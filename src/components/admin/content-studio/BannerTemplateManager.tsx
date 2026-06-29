import { useEffect, useState, type ReactNode } from 'react';
import { Upload, Save, Loader2, ExternalLink, Image as ImageIcon, Type, Layout } from 'lucide-react';
import { toast } from 'sonner';
import BannerPreview from '../../BannerPreview';
import { type BannerTemplate, type BannerConfig, type TextAlign } from '../../../lib/bannerRender';
import { LOGO_VARIANTS, LOGO_COLORS, type LogoVariant, type LogoColor } from '../../../lib/rotaryLogo';

const API = import.meta.env.VITE_API_URL || '/api';

const DEFAULT_CONFIG: BannerConfig = {
    title: { text: 'Nombre del Club', color: '#17458f', sizePct: 8, align: 'center' },
    subtitle: { text: 'Distrito • Lema', color: '#005daa', sizePct: 4.2, align: 'center' },
    logo: { variant: 'completo', color: 'color', placement: 'top' },
};

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

    useEffect(() => {
        // Timeout defensivo: si la API no responde, no dejamos el spinner colgado.
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
            .catch(() => {/* seguimos con los valores por defecto del formulario */})
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
            if (res.ok && data.url) {
                setBackgroundUrl(data.url);
                toast.success('Imagen de fondo lista', { id: toastId });
            } else {
                toast.error(data.error || 'Error al subir', { id: toastId });
            }
        } catch {
            toast.error('Error al subir la imagen', { id: toastId });
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API}/banner/template`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
                },
                body: JSON.stringify({ name, backgroundUrl, widthCm, heightCm, config }),
            });
            if (res.ok) toast.success('Plantilla guardada — ya es la predeterminada del público');
            else { const d = await res.json().catch(() => ({})); toast.error(d.error || 'No se pudo guardar'); }
        } catch {
            toast.error('Error al guardar la plantilla');
        } finally {
            setSaving(false);
        }
    };

    const align = config.title.align;
    const setAlign = (a: TextAlign) =>
        setConfig(c => ({ ...c, title: { ...c.title, align: a }, subtitle: { ...c.subtitle, align: a } }));

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
                    <p className="text-sm text-gray-500 mt-1">
                        Configura la plantilla por defecto que verá cualquier persona en el generador público.
                    </p>
                </div>
                <a
                    href="/generador-pendones"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                >
                    Abrir generador <ExternalLink className="w-4 h-4" />
                </a>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                {/* Controles */}
                <div>
                    {/* Fondo */}
                    <section className="mb-6">
                        <div className="flex items-center gap-2 mb-3 text-gray-800">
                            <ImageIcon className="w-4 h-4" /><h4 className="text-sm font-bold">Imagen de fondo</h4>
                        </div>
                        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors">
                            {uploading ? <Loader2 className="w-5 h-5 animate-spin text-indigo-600" /> : <Upload className="w-5 h-5 text-gray-400" />}
                            <span className="text-sm text-gray-600 font-medium">
                                {backgroundUrl ? 'Reemplazar imagen de fondo' : 'Subir imagen de fondo'}
                            </span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e.target.files?.[0])} />
                        </label>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <Field label="Ancho (cm)">
                                <input type="number" min={1} className={selectCls} value={widthCm}
                                    onChange={e => setWidthCm(Math.max(1, parseInt(e.target.value) || 80))} />
                            </Field>
                            <Field label="Alto (cm)">
                                <input type="number" min={1} className={selectCls} value={heightCm}
                                    onChange={e => setHeightCm(Math.max(1, parseInt(e.target.value) || 180))} />
                            </Field>
                        </div>
                    </section>

                    {/* Logo */}
                    <section className="mb-6 border-t border-gray-100 pt-5">
                        <div className="flex items-center gap-2 mb-3 text-gray-800">
                            <ImageIcon className="w-4 h-4" /><h4 className="text-sm font-bold">Logotipo por defecto</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Field label="Logotipo">
                                <select className={selectCls} value={config.logo.variant}
                                    onChange={e => setConfig(c => ({ ...c, logo: { ...c.logo, variant: e.target.value as LogoVariant } }))}>
                                    {LOGO_VARIANTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </Field>
                            <Field label="Color">
                                <select className={selectCls} value={config.logo.color}
                                    onChange={e => setConfig(c => ({ ...c, logo: { ...c.logo, color: e.target.value as LogoColor } }))}>
                                    {LOGO_COLORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </Field>
                            <Field label="Posición">
                                <select className={selectCls} value={config.logo.placement}
                                    onChange={e => setConfig(c => ({ ...c, logo: { ...c.logo, placement: e.target.value as 'top' | 'center' } }))}>
                                    <option value="top">Arriba</option>
                                    <option value="center">Centrado</option>
                                </select>
                            </Field>
                        </div>
                    </section>

                    {/* Textos */}
                    <section className="border-t border-gray-100 pt-5">
                        <div className="flex items-center gap-2 mb-3 text-gray-800">
                            <Type className="w-4 h-4" /><h4 className="text-sm font-bold">Textos por defecto</h4>
                        </div>
                        <Field label="Título">
                            <input className={selectCls} value={config.title.text}
                                onChange={e => setConfig(c => ({ ...c, title: { ...c.title, text: e.target.value } }))} />
                        </Field>
                        <Field label="Subtítulo">
                            <input className={selectCls} value={config.subtitle.text}
                                onChange={e => setConfig(c => ({ ...c, subtitle: { ...c.subtitle, text: e.target.value } }))} />
                        </Field>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <Field label="Alineación">
                                <select className={selectCls} value={align} onChange={e => setAlign(e.target.value as TextAlign)}>
                                    <option value="left">Izquierda</option>
                                    <option value="center">Centro</option>
                                    <option value="right">Derecha</option>
                                </select>
                            </Field>
                            <Field label="Tamaño título (%)">
                                <input type="number" min={1} max={30} step={0.5} className={selectCls} value={config.title.sizePct}
                                    onChange={e => setConfig(c => ({ ...c, title: { ...c.title, sizePct: parseFloat(e.target.value) || 8 } }))} />
                            </Field>
                            <Field label="Color título">
                                <input type="color" className="w-full h-9 rounded-md border border-gray-300 cursor-pointer" value={config.title.color}
                                    onChange={e => setConfig(c => ({ ...c, title: { ...c.title, color: e.target.value } }))} />
                            </Field>
                            <Field label="Color subtítulo">
                                <input type="color" className="w-full h-9 rounded-md border border-gray-300 cursor-pointer" value={config.subtitle.color}
                                    onChange={e => setConfig(c => ({ ...c, subtitle: { ...c.subtitle, color: e.target.value } }))} />
                            </Field>
                        </div>
                    </section>

                    <button onClick={handleSave} disabled={saving}
                        className="mt-6 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-lg px-5 py-2.5 transition-colors">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando…' : 'Guardar como predeterminada'}
                    </button>
                </div>

                {/* Preview */}
                <div className="flex flex-col items-center">
                    <span className="text-xs font-semibold text-gray-500 mb-2">Vista previa</span>
                    <BannerPreview
                        template={{ backgroundUrl, widthCm, heightCm }}
                        config={config}
                        heightCss="min(60vh, 640px)"
                    />
                </div>
            </div>
        </div>
    );
};

export default BannerTemplateManager;
