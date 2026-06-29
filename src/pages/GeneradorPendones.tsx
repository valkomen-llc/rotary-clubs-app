import { useEffect, useState, type ReactNode } from 'react';
import { Download, Image as ImageIcon, Loader2, Users, Flag, Plus, Trash2, Layout, Info, Upload } from 'lucide-react';
import {
    DEFAULT_CONFIG,
    exportBannerToPdf,
    exportBannerToPng,
    type BannerTemplate,
    type BannerConfig,
    type Person,
} from '../lib/bannerRender';
import BannerPreview from '../components/BannerPreview';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const FALLBACK_TEMPLATE: BannerTemplate = {
    id: null, name: 'Generador de Pendones', backgroundUrl: null,
    widthCm: 80, heightCm: 180, config: DEFAULT_CONFIG, isActive: true, clubId: null, updatedAt: null,
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <label className="block mb-3">
        <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
        {children}
    </label>
);

const selectCls = 'w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

const GeneradorPendones = () => {
    const [template, setTemplate] = useState<BannerTemplate>(FALLBACK_TEMPLATE);
    const [config, setConfig] = useState<BannerConfig>(DEFAULT_CONFIG);
    const [exporting, setExporting] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const clubId = new URLSearchParams(window.location.search).get('clubId');
        const q = clubId ? `?clubId=${encodeURIComponent(clubId)}` : '';
        fetch(`${API}/public/banner-template${q}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((tpl: BannerTemplate) => {
                if (!tpl) return;
                setTemplate({ ...FALLBACK_TEMPLATE, ...tpl });
                setConfig({ ...DEFAULT_CONFIG, ...(tpl.config || {}) });
            })
            .catch(err => console.error('[GeneradorPendones] error cargando plantilla:', err));
    }, []);

    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;

    const updatePerson = (i: number, patch: Partial<Person>) =>
        setConfig(c => ({ ...c, people: c.people.map((p, idx) => idx === i ? { ...p, ...patch } : p) }));
    const addPerson = () =>
        setConfig(c => ({ ...c, people: [...c.people, { name: 'Nombre y Apellido', role: 'Cargo', period: '(Periodo Rotario 2025-2026)' }] }));
    const removePerson = (i: number) =>
        setConfig(c => ({ ...c, people: c.people.filter((_, idx) => idx !== i) }));

    const handleUploadLogo = async (file: File | undefined) => {
        if (!file) return;
        setUploadingLogo(true); setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`${API}/public/banner-logo`, { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok && data.dataUrl) setConfig(c => ({ ...c, logo: { url: data.dataUrl } }));
            else setError(data.error || 'No se pudo subir el logo.');
        } catch { setError('No se pudo subir el logo.'); }
        finally { setUploadingLogo(false); }
    };

    const handleDownload = async () => {
        setExporting(true); setError(null);
        try { await exportBannerToPdf({ template, config }); }
        catch (e) { console.error(e); setError('No se pudo generar el PDF. Intenta de nuevo.'); }
        finally { setExporting(false); }
    };
    const handleDownloadPng = async () => {
        setExporting(true);
        try { await exportBannerToPng({ template, config }); }
        catch (e) { console.error(e); }
        finally { setExporting(false); }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-100">
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
                <Layout className="w-5 h-5 text-blue-800" />
                <h1 className="text-lg font-bold text-gray-900">{template.name || 'Generador de Pendones'}</h1>
                <span className="ml-auto text-xs text-gray-500">{widthCm} × {heightCm} cm · listo para imprimir</span>
            </header>

            <div className="flex-1 flex flex-col lg:flex-row">
                {/* Panel de controles */}
                <aside className="w-full lg:w-[360px] bg-white border-r border-gray-200 p-5 overflow-y-auto">
                    {/* Cabecera */}
                    <section className="mb-6">
                        <div className="flex items-center gap-2 mb-3 text-gray-800"><ImageIcon className="w-4 h-4" /><h2 className="text-sm font-bold">Logo del club</h2></div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                                {config.logo?.url ? <img src={config.logo.url} alt="Logo" className="max-w-full max-h-full object-contain" /> : <ImageIcon className="w-6 h-6 text-gray-300" />}
                            </div>
                            <div className="flex-1">
                                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                                    {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin text-blue-700" /> : <Upload className="w-4 h-4 text-gray-400" />}
                                    <span className="text-xs text-gray-600 font-medium">{config.logo?.url ? 'Reemplazar logo' : 'Subí el logo de tu club'}</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleUploadLogo(e.target.files?.[0])} />
                                </label>
                                <p className="mt-1 text-[10px] text-gray-400">Generalo en la herramienta de marca de Rotary y subilo. Se recortan los bordes vacíos y se centra.</p>
                            </div>
                        </div>
                    </section>

                    {/* Personas */}
                    <section className="mb-6 border-t border-gray-100 pt-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-gray-800"><Users className="w-4 h-4" /><h2 className="text-sm font-bold">Personas</h2></div>
                            <button onClick={addPerson} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"><Plus className="w-3.5 h-3.5" /> Agregar</button>
                        </div>
                        <div className="space-y-3">
                            {config.people.map((p, i) => (
                                <div key={i} className="rounded-xl border border-gray-200 p-3 relative">
                                    <button onClick={() => removePerson(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500" title="Quitar"><Trash2 className="w-4 h-4" /></button>
                                    <input className={`${selectCls} mb-2 font-semibold`} placeholder="Nombre y Apellido" value={p.name} onChange={e => updatePerson(i, { name: e.target.value })} />
                                    <input className={`${selectCls} mb-2`} placeholder="Cargo" value={p.role} onChange={e => updatePerson(i, { role: e.target.value })} />
                                    <input className={selectCls} placeholder="(Periodo Rotario 2025-2026)" value={p.period} onChange={e => updatePerson(i, { period: e.target.value })} />
                                </div>
                            ))}
                            {config.people.length === 0 && <p className="text-xs text-gray-400">Sin personas. Usá "Agregar" para añadir.</p>}
                        </div>
                    </section>

                    {/* Pie */}
                    <section className="mb-6 border-t border-gray-100 pt-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-gray-800"><Flag className="w-4 h-4" /><h2 className="text-sm font-bold">Pie</h2></div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                                <input type="checkbox" checked={config.footer.show} onChange={e => setConfig(c => ({ ...c, footer: { ...c.footer, show: e.target.checked } }))} /> Mostrar
                            </label>
                        </div>
                        <Field label="Distrito (pie)"><input className={selectCls} value={config.footer.district} onChange={e => setConfig(c => ({ ...c, footer: { ...c.footer, district: e.target.value } }))} /></Field>
                        <Field label="Lema"><input className={selectCls} value={config.footer.tagline} onChange={e => setConfig(c => ({ ...c, footer: { ...c.footer, tagline: e.target.value } }))} /></Field>
                    </section>

                    {/* Descargar */}
                    <section className="border-t border-gray-100 pt-5">
                        <button onClick={handleDownload} disabled={exporting}
                            className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white font-bold rounded-lg px-4 py-3 transition-colors">
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {exporting ? 'Generando…' : 'Descargar PDF'}
                        </button>
                        <button onClick={handleDownloadPng} disabled={exporting}
                            className="w-full mt-2 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg px-4 py-2 transition-colors">
                            <ImageIcon className="w-4 h-4" /> Descargar PNG
                        </button>
                        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
                        <p className="mt-3 text-[11px] text-gray-500 flex gap-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            El PDF se genera al tamaño físico real ({widthCm}×{heightCm} cm) para impresión a gran escala.
                        </p>
                    </section>
                </aside>

                {/* Mesa de trabajo */}
                <main className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-300/60 min-h-[60vh]">
                    <div className="flex items-center gap-3 mb-2 text-xs text-gray-600">
                        <span>Arrastrá para reubicar · Shift+clic para seleccionar varios</span>
                        <button onClick={() => setConfig(c => ({ ...c, offsets: {} }))}
                            className="font-semibold text-gray-500 hover:text-blue-700">Restablecer posiciones</button>
                    </div>
                    <BannerPreview
                        template={template}
                        config={config}
                        interactive
                        onOffsetsChange={offsets => setConfig(c => ({ ...c, offsets }))}
                    />
                </main>
            </div>
        </div>
    );
};

export default GeneradorPendones;
