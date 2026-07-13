import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';
import { Save, Heart, Layout, ExternalLink, Image as ImageIcon, HandCoins, ShieldCheck } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

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
