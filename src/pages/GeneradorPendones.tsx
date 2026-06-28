import { useEffect, useState, type ReactNode } from 'react';
import { Download, Image as ImageIcon, Loader2, Type, Layout, Info } from 'lucide-react';
import {
    exportBannerToPdf,
    exportBannerToPng,
    type BannerTemplate,
    type BannerConfig,
    type TextAlign,
} from '../lib/bannerRender';
import {
    LOGO_VARIANTS,
    LOGO_COLORS,
    type LogoVariant,
    type LogoColor,
} from '../lib/rotaryLogo';
import BannerPreview from '../components/BannerPreview';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const DEFAULT_CONFIG: BannerConfig = {
    title: { text: 'Nombre del Club', color: '#17458f', sizePct: 8, align: 'center' },
    subtitle: { text: 'Distrito • Lema', color: '#005daa', sizePct: 4.2, align: 'center' },
    logo: { variant: 'completo', color: 'color', placement: 'top' },
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <label className="block mb-3">
        <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
        {children}
    </label>
);

const selectCls = 'w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const inputCls = selectCls;

const GeneradorPendones = () => {
    const [template, setTemplate] = useState<BannerTemplate | null>(null);
    const [config, setConfig] = useState<BannerConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const clubId = new URLSearchParams(window.location.search).get('clubId');
        const q = clubId ? `?clubId=${encodeURIComponent(clubId)}` : '';
        fetch(`${API}/public/banner-template${q}`)
            .then(r => r.json())
            .then((tpl: BannerTemplate) => {
                setTemplate(tpl);
                setConfig({ ...DEFAULT_CONFIG, ...(tpl.config || {}) });
            })
            .catch(err => {
                console.error('[GeneradorPendones] error cargando plantilla:', err);
                setError('No se pudo cargar la plantilla.');
            })
            .finally(() => setLoading(false));
    }, []);

    const widthCm = template?.widthCm || 80;
    const heightCm = template?.heightCm || 180;

    const align = config.title.align;
    const setAlign = (a: TextAlign) =>
        setConfig(c => ({ ...c, title: { ...c.title, align: a }, subtitle: { ...c.subtitle, align: a } }));

    const handleDownload = async () => {
        if (!template) return;
        setExporting(true);
        setError(null);
        try {
            await exportBannerToPdf({ template, config });
        } catch (e: any) {
            console.error(e);
            setError('No se pudo generar el PDF. Intenta de nuevo.');
        } finally {
            setExporting(false);
        }
    };

    const handleDownloadPng = async () => {
        if (!template) return;
        setExporting(true);
        try { await exportBannerToPng({ template, config }); }
        catch (e) { console.error(e); }
        finally { setExporting(false); }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-100">
            {/* Cabecera */}
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
                <Layout className="w-5 h-5 text-blue-800" />
                <h1 className="text-lg font-bold text-gray-900">{template?.name || 'Generador de Pendones'}</h1>
                <span className="ml-auto text-xs text-gray-500">{widthCm} × {heightCm} cm · listo para imprimir</span>
            </header>

            <div className="flex-1 flex flex-col lg:flex-row">
                {/* Panel de controles (izquierda) */}
                <aside className="w-full lg:w-[340px] bg-white border-r border-gray-200 p-5 overflow-y-auto">
                    {/* Logotipo */}
                    <section className="mb-6">
                        <div className="flex items-center gap-2 mb-3 text-gray-800">
                            <ImageIcon className="w-4 h-4" />
                            <h2 className="text-sm font-bold">Logotipo de Rotary</h2>
                        </div>
                        <Field label="Logotipo">
                            <select
                                className={selectCls}
                                value={config.logo.variant}
                                onChange={e => setConfig(c => ({ ...c, logo: { ...c.logo, variant: e.target.value as LogoVariant } }))}
                            >
                                {LOGO_VARIANTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Color">
                            <select
                                className={selectCls}
                                value={config.logo.color}
                                onChange={e => setConfig(c => ({ ...c, logo: { ...c.logo, color: e.target.value as LogoColor } }))}
                            >
                                {LOGO_COLORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Posición del logotipo">
                            <select
                                className={selectCls}
                                value={config.logo.placement}
                                onChange={e => setConfig(c => ({ ...c, logo: { ...c.logo, placement: e.target.value as 'top' | 'center' } }))}
                            >
                                <option value="top">Arriba</option>
                                <option value="center">Centrado</option>
                            </select>
                        </Field>
                    </section>

                    {/* Textos */}
                    <section className="mb-6 border-t border-gray-100 pt-5">
                        <div className="flex items-center gap-2 mb-3 text-gray-800">
                            <Type className="w-4 h-4" />
                            <h2 className="text-sm font-bold">Textos</h2>
                        </div>
                        <Field label="Título">
                            <input
                                className={inputCls}
                                value={config.title.text}
                                placeholder="Nombre del club, distrito o zona"
                                onChange={e => setConfig(c => ({ ...c, title: { ...c.title, text: e.target.value } }))}
                            />
                        </Field>
                        <Field label="Subtítulo">
                            <input
                                className={inputCls}
                                value={config.subtitle.text}
                                placeholder="Distrito • Lema"
                                onChange={e => setConfig(c => ({ ...c, subtitle: { ...c.subtitle, text: e.target.value } }))}
                            />
                        </Field>
                        <Field label="Alineación">
                            <select className={selectCls} value={align} onChange={e => setAlign(e.target.value as TextAlign)}>
                                <option value="left">Izquierda</option>
                                <option value="center">Centro</option>
                                <option value="right">Derecha</option>
                            </select>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Color título">
                                <input type="color" className="w-full h-9 rounded-md border border-gray-300 cursor-pointer"
                                    value={config.title.color}
                                    onChange={e => setConfig(c => ({ ...c, title: { ...c.title, color: e.target.value } }))} />
                            </Field>
                            <Field label="Color subtítulo">
                                <input type="color" className="w-full h-9 rounded-md border border-gray-300 cursor-pointer"
                                    value={config.subtitle.color}
                                    onChange={e => setConfig(c => ({ ...c, subtitle: { ...c.subtitle, color: e.target.value } }))} />
                            </Field>
                        </div>
                    </section>

                    {/* Descargar */}
                    <section className="border-t border-gray-100 pt-5">
                        <button
                            onClick={handleDownload}
                            disabled={exporting || !template}
                            className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white font-bold rounded-lg px-4 py-3 transition-colors"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {exporting ? 'Generando…' : 'Descargar PDF'}
                        </button>
                        <button
                            onClick={handleDownloadPng}
                            disabled={exporting || !template}
                            className="w-full mt-2 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
                        >
                            <ImageIcon className="w-4 h-4" /> Descargar PNG
                        </button>
                        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
                        <p className="mt-3 text-[11px] text-gray-500 flex gap-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            El PDF se genera al tamaño físico real ({widthCm}×{heightCm} cm) para impresión a gran escala.
                        </p>
                    </section>
                </aside>

                {/* Mesa de trabajo (derecha) */}
                <main className="flex-1 flex items-center justify-center p-6 bg-gray-300/60 min-h-[60vh]">
                    {template && <BannerPreview template={template} config={config} />}
                </main>
            </div>
        </div>
    );
};

export default GeneradorPendones;
