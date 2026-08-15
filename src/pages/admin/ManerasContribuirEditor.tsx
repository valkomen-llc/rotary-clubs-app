import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import MediaPicker from '../../components/admin/content-studio/MediaPicker';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';
import { Save, Heart, Layout, ExternalLink, Image as ImageIcon, HandCoins, ShieldCheck, Megaphone, Plus, Upload, X } from 'lucide-react';
import { uploadMediaFiles, IMAGE_ACCEPT } from '../../lib/mediaUpload';
import { STATUS_LABELS, type CampaignStatus, type ContributionCenter } from '../../lib/contributionSpec';

const API = import.meta.env.VITE_API_URL || '/api';

// Lo que la campaña central le deja tocar a un sitio (OVERRIDE_WHITELIST del
// servidor): contacto, nota local y QR. La pantalla sólo refleja esa
// frontera — quien la impone es el endpoint con sanitizeOverride.
interface SiteOverride {
    contact?: { name?: string; phone?: string; email?: string };
    localNote?: string;
    qrImage?: string;
}

interface SiteCampaignInfo {
    id: string; name: string; status: string; effectiveStatus: string;
    startAt: string | null; endAt: string | null;
}

// Editor de textos de la página pública "Maneras de Contribuir".
// Escribe en ContentSection (page='contribucion') las secciones 'header' y 'card',
// que la página lee vía useCMSContent('contribucion').
const ManerasContribuirEditor: React.FC = () => {
    const { club } = useClub();
    const clubId = (club as any)?.id;
    const clubName = (club as any)?.name || 'tu club';

    const [header, setHeader] = useState({ title: '', description: '' });
    const [card, setCard] = useState({ title: '', description: '', buttonText: '' });
    const [style, setStyle] = useState({ blocksBg: '#212C3F' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    // ── Campaña de Contribución activa para ESTE sitio (F4) ──
    const [siteCampaign, setSiteCampaign] = useState<SiteCampaignInfo | null>(null);
    const [override, setOverride] = useState<SiteOverride>({});
    const [overrideDirty, setOverrideDirty] = useState(false);
    const [savingOverride, setSavingOverride] = useState(false);
    const [ownCenters, setOwnCenters] = useState<Partial<ContributionCenter>[]>([]);
    const [ownCentersDirty, setOwnCentersDirty] = useState(false);
    const [savingOwnCenters, setSavingOwnCenters] = useState(false);
    const [qrPickerOpen, setQrPickerOpen] = useState(false);
    const [uploadingQr, setUploadingQr] = useState(false);
    const qrFileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Sin campaña que alcance a este sitio, la tarjeta no existe: la
        // consulta degrada a null y el editor queda como siempre.
        (async () => {
            try {
                const token = localStorage.getItem('rotary_token');
                const r = await fetch(`${API}/contribution-campaigns/site/current`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const d = r.ok ? await r.json() : null;
                if (d?.campaign) {
                    setSiteCampaign(d.campaign);
                    setOverride(d.override || {});
                    setOwnCenters(Array.isArray(d.centers) ? d.centers : []);
                }
            } catch { /* sin tarjeta; el resto del editor no depende de esto */ }
        })();
    }, []);

    const saveOverride = async () => {
        setSavingOverride(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/contribution-campaigns/site/override`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ content: override }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setOverride(d.override || {});
            setOverrideDirty(false);
            toast.success('Información local guardada');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar');
        } finally {
            setSavingOverride(false);
        }
    };

    const saveOwnCenters = async () => {
        setSavingOwnCenters(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/contribution-campaigns/site/centers`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ centers: ownCenters }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setOwnCenters(Array.isArray(d.centers) ? d.centers : []);
            setOwnCentersDirty(false);
            if (Array.isArray(d.skipped) && d.skipped.length > 0) {
                toast.warning(`Centros guardados; ${d.skipped.length} descartado(s) sin ciudad o dirección`);
            } else {
                toast.success('Centros del club guardados');
            }
        } catch (e: any) {
            toast.error(e?.message || 'No se pudieron guardar los centros');
        } finally {
            setSavingOwnCenters(false);
        }
    };

    const onQrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploadingQr(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles([file]);
            if (failed.length > 0) throw new Error(`${failed[0].name}: ${failed[0].reason}`);
            if (uploaded[0]?.url) { setOverride({ ...override, qrImage: uploaded[0].url }); setOverrideDirty(true); }
        } catch (err: any) {
            toast.error(err?.message || 'No se pudo subir el QR');
        } finally {
            setUploadingQr(false);
        }
    };

    // Valores por defecto (coinciden con los fallbacks de ManerasDeContribuir.tsx).
    const defaults = {
        header: {
            title: 'Maneras de contribuir',
            description: 'Una contribución a Rotary significa agua potable y saneamiento, salud y esperanza en zonas asoladas por enfermedades.',
        },
        card: {
            title: 'Aporte voluntario al Club',
            description: `Tu contribución fortalece el impacto del club ${clubName} y sostiene iniciativas de servicio que transforman vidas.`,
            buttonText: 'APORTAR',
        },
    };

    useEffect(() => {
        if (!clubId) return;
        (async () => {
            try {
                const res = await fetch(`${API}/clubs/${clubId}/sections?page=contribucion&clubId=${clubId}`);
                const rows = res.ok ? await res.json() : [];
                const map: Record<string, any> = {};
                (Array.isArray(rows) ? rows : []).forEach((r: any) => {
                    try { map[r.section] = typeof r.content === 'string' ? JSON.parse(r.content) : r.content; } catch { /* noop */ }
                });
                setHeader({
                    title: map.header?.title ?? defaults.header.title,
                    description: map.header?.description ?? defaults.header.description,
                });
                setCard({
                    title: map.card?.title ?? defaults.card.title,
                    description: map.card?.description ?? defaults.card.description,
                    buttonText: map.card?.buttonText ?? defaults.card.buttonText,
                });
                setStyle({ blocksBg: map.style?.blocksBg || '#212C3F' });
            } catch {
                setHeader(defaults.header);
                setCard(defaults.card);
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clubId]);

    const save = async () => {
        if (!clubId) return;
        setSaving(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/admin/sections/batch-upsert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    clubId,
                    sections: [
                        { page: 'contribucion', section: 'header', content: header },
                        { page: 'contribucion', section: 'card', content: card },
                        { page: 'contribucion', section: 'style', content: style },
                    ],
                }),
            });
            if (!res.ok) throw new Error('Error al guardar');
            setDirty(false);
            toast.success('Textos de Maneras de Contribuir guardados');
        } catch (e: any) {
            toast.error(e.message || 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const field = 'mt-1.5 w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none transition-all font-medium';
    const lbl = 'text-xs font-bold text-gray-400 uppercase tracking-wider';

    if (loading) {
        return <AdminLayout><div className="p-12 text-center text-gray-400 italic">Cargando…</div></AdminLayout>;
    }

    return (
        <AdminLayout>
            <input ref={qrFileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={onQrFile} />
            <MediaPicker isOpen={qrPickerOpen} onClose={() => setQrPickerOpen(false)} maxSelection={1}
                onSelect={(items) => {
                    if (items[0]?.url) { setOverride(prev => ({ ...prev, qrImage: items[0].url })); setOverrideDirty(true); }
                    setQrPickerOpen(false);
                }} />
            <div className="max-w-3xl space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center">
                            <Heart className="w-6 h-6 text-rose-500 fill-current" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Maneras de Contribuir</h1>
                            <p className="text-sm text-gray-500 mt-1">Edita los textos de la página pública de aportes.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href="/maneras-de-contribuir" target="_blank" rel="noreferrer"
                            className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-rotary-blue hover:bg-gray-50 transition">
                            <ExternalLink className="w-4 h-4" /> Ver página
                        </a>
                        <button onClick={save} disabled={saving || !dirty}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 ${dirty ? 'bg-rotary-blue text-white hover:bg-sky-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}>
                            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>

                {dirty && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2 font-medium">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Tienes cambios sin guardar.
                    </div>
                )}

                {/* ── Campaña de Contribución activa para este sitio (F4) ── */}
                {siteCampaign && (
                    <div className="bg-white rounded-3xl p-8 border-2 border-rose-100 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-3">
                                <Megaphone className="w-5 h-5 text-rose-500" /> Campaña: {siteCampaign.name}
                            </h3>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-50 text-rose-600">
                                {STATUS_LABELS[siteCampaign.effectiveStatus as CampaignStatus] || siteCampaign.effectiveStatus}
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 mb-6">
                            Mientras esta campaña esté activa, tu página «Maneras de Contribuir» muestra su contenido (lo define el Administrador Central).
                            Lo que TU sitio puede agregar es esto: un contacto local, una nota, un QR propio y tus centros de acopio — se suman a la campaña, no la reemplazan.
                        </p>

                        {/* Contacto + nota + QR */}
                        <div className="space-y-4">
                            <div className="grid sm:grid-cols-3 gap-3">
                                <div>
                                    <label className={lbl}>Contacto (nombre)</label>
                                    <input className={field} value={override.contact?.name || ''}
                                        onChange={e => { setOverride({ ...override, contact: { ...override.contact, name: e.target.value } }); setOverrideDirty(true); }} />
                                </div>
                                <div>
                                    <label className={lbl}>Teléfono</label>
                                    <input className={field} value={override.contact?.phone || ''}
                                        onChange={e => { setOverride({ ...override, contact: { ...override.contact, phone: e.target.value } }); setOverrideDirty(true); }} />
                                </div>
                                <div>
                                    <label className={lbl}>Correo</label>
                                    <input className={field} type="email" value={override.contact?.email || ''}
                                        onChange={e => { setOverride({ ...override, contact: { ...override.contact, email: e.target.value } }); setOverrideDirty(true); }} />
                                </div>
                            </div>
                            <div>
                                <label className={lbl}>Nota local (opcional)</label>
                                <textarea rows={2} className={`${field} resize-none`} placeholder="Ej: El club recibe donaciones en su sede los sábados."
                                    value={override.localNote || ''}
                                    onChange={e => { setOverride({ ...override, localNote: e.target.value }); setOverrideDirty(true); }} />
                            </div>
                            <div>
                                <label className={lbl}>Código QR local (opcional)</label>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <input className={`${field} mt-0 flex-1`} placeholder="URL de la imagen del QR" value={override.qrImage || ''}
                                        onChange={e => { setOverride({ ...override, qrImage: e.target.value }); setOverrideDirty(true); }} />
                                    <button type="button" onClick={() => qrFileRef.current?.click()} disabled={uploadingQr}
                                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                        <Upload className="w-4 h-4" /> Subir
                                    </button>
                                    <button type="button" onClick={() => setQrPickerOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                        <ImageIcon className="w-4 h-4" /> Biblioteca
                                    </button>
                                </div>
                                {override.qrImage && <img src={override.qrImage} alt="QR local" className="mt-3 w-24 h-24 object-contain border border-gray-100 rounded-xl p-1" />}
                            </div>
                            <button onClick={saveOverride} disabled={savingOverride || !overrideDirty}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${overrideDirty ? 'bg-rotary-blue text-white hover:bg-sky-800 shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                                <Save className="w-4 h-4" /> {savingOverride ? 'Guardando…' : 'Guardar información local'}
                            </button>
                        </div>

                        {/* Centros propios del club */}
                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <p className="text-sm font-bold text-gray-700">Centros de acopio de tu club</p>
                                <button onClick={saveOwnCenters} disabled={savingOwnCenters || !ownCentersDirty}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${ownCentersDirty ? 'bg-rotary-blue text-white hover:bg-sky-800 shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                                    <Save className="w-4 h-4" /> {savingOwnCenters ? 'Guardando…' : 'Guardar centros'}
                                </button>
                            </div>
                            <div className="space-y-3">
                                {ownCenters.map((ct, i) => (
                                    <div key={ct.id || i} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                                <input type="checkbox" checked={ct.active !== false} className="w-4 h-4 accent-rotary-blue"
                                                    onChange={e => { setOwnCenters(ownCenters.map((x, j) => j === i ? { ...x, active: e.target.checked } : x)); setOwnCentersDirty(true); }} />
                                                Activo
                                            </label>
                                            <button type="button" aria-label="Quitar centro"
                                                onClick={() => { setOwnCenters(ownCenters.filter((_, j) => j !== i)); setOwnCentersDirty(true); }}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"><X className="w-4 h-4" /></button>
                                        </div>
                                        <div className="grid sm:grid-cols-2 gap-3">
                                            <input className={field} placeholder="Ciudad *" value={ct.city || ''}
                                                onChange={e => { setOwnCenters(ownCenters.map((x, j) => j === i ? { ...x, city: e.target.value } : x)); setOwnCentersDirty(true); }} />
                                            <input className={field} placeholder="Dirección *" value={ct.address || ''}
                                                onChange={e => { setOwnCenters(ownCenters.map((x, j) => j === i ? { ...x, address: e.target.value } : x)); setOwnCentersDirty(true); }} />
                                            <input className={field} placeholder="Horario (opcional)" value={ct.schedule || ''}
                                                onChange={e => { setOwnCenters(ownCenters.map((x, j) => j === i ? { ...x, schedule: e.target.value } : x)); setOwnCentersDirty(true); }} />
                                            <input className={field} placeholder="Teléfono (opcional)" value={ct.phone || ''}
                                                onChange={e => { setOwnCenters(ownCenters.map((x, j) => j === i ? { ...x, phone: e.target.value } : x)); setOwnCentersDirty(true); }} />
                                        </div>
                                    </div>
                                ))}
                                <button type="button"
                                    onClick={() => { setOwnCenters([...ownCenters, { id: `center-${Date.now()}`, city: '', address: '', schedule: '', phone: '', active: true }]); setOwnCentersDirty(true); }}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                                    <Plus className="w-4 h-4" /> Agregar centro del club
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Encabezado */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-3">
                        <Layout className="w-5 h-5 text-rotary-blue" /> Encabezado
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className={lbl}>Título</label>
                            <input className={field} value={header.title}
                                onChange={e => { setHeader({ ...header, title: e.target.value }); setDirty(true); }} />
                        </div>
                        <div>
                            <label className={lbl}>Descripción</label>
                            <textarea rows={3} className={`${field} resize-none`} value={header.description}
                                onChange={e => { setHeader({ ...header, description: e.target.value }); setDirty(true); }} />
                        </div>
                    </div>
                </div>

                {/* Tarjeta destacada (Hero) */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-3">
                        <Heart className="w-5 h-5 text-rose-500" /> Tarjeta destacada (sobre la imagen)
                    </h3>
                    <p className="text-xs text-gray-400 mb-6">La tarjeta blanca con el botón que aparece sobre la imagen del encabezado.</p>
                    <div className="space-y-4">
                        <div>
                            <label className={lbl}>Título</label>
                            <input className={field} value={card.title}
                                onChange={e => { setCard({ ...card, title: e.target.value }); setDirty(true); }} />
                        </div>
                        <div>
                            <label className={lbl}>Descripción</label>
                            <textarea rows={3} className={`${field} resize-none`} value={card.description}
                                onChange={e => { setCard({ ...card, description: e.target.value }); setDirty(true); }} />
                        </div>
                        <div>
                            <label className={lbl}>Texto del botón</label>
                            <input className={field} value={card.buttonText}
                                onChange={e => { setCard({ ...card, buttonText: e.target.value }); setDirty(true); }} />
                        </div>
                    </div>
                </div>

                {/* Color de fondo de la sección de aportes */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-3">
                        <Layout className="w-5 h-5 text-rotary-blue" /> Fondo de la sección de aportes
                    </h3>
                    <p className="text-xs text-gray-400 mb-6">Color detrás del carrusel de aportes. Con un color oscuro, las tarjetas blancas resaltan.</p>
                    <div className="flex flex-wrap items-center gap-4">
                        <input type="color" value={/^#([0-9a-fA-F]{6})$/.test(style.blocksBg) ? style.blocksBg : '#212C3F'}
                            onChange={e => { setStyle({ blocksBg: e.target.value }); setDirty(true); }}
                            className="w-14 h-14 rounded-xl border border-gray-200 cursor-pointer bg-white p-1" />
                        <input value={style.blocksBg}
                            onChange={e => { setStyle({ blocksBg: e.target.value }); setDirty(true); }}
                            placeholder="#212C3F"
                            className="w-40 px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none font-bold text-gray-800" />
                        <div className="flex items-center gap-2">
                            {[
                                { label: 'Claro', c: '#F9FAFB' },
                                { label: 'Azul oscuro', c: '#212C3F' },
                                { label: 'Blanco', c: '#FFFFFF' },
                            ].map(p => (
                                <button key={p.c} type="button" onClick={() => { setStyle({ blocksBg: p.c }); setDirty(true); }}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition">
                                    <span className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: p.c }} /> {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Dónde se editan las otras partes */}
                <div className="bg-sky-50/60 rounded-3xl p-6 border border-sky-100">
                    <p className="text-sm font-bold text-gray-700 mb-3">Otras partes de esta página se editan en:</p>
                    <div className="grid sm:grid-cols-3 gap-3">
                        <Link to="/admin/imagenes-sitio" className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-gray-100 text-sm font-bold text-gray-600 hover:text-rotary-blue transition">
                            <ImageIcon className="w-4 h-4" /> Imagen del hero
                        </Link>
                        <Link to="/admin/bloques-pago" className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-gray-100 text-sm font-bold text-gray-600 hover:text-rotary-blue transition">
                            <HandCoins className="w-4 h-4" /> Bloques de aporte
                        </Link>
                        <Link to="/admin/configuracion" className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-gray-100 text-sm font-bold text-gray-600 hover:text-rotary-blue transition">
                            <ShieldCheck className="w-4 h-4" /> Sellos de La Fundación
                        </Link>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default ManerasContribuirEditor;
