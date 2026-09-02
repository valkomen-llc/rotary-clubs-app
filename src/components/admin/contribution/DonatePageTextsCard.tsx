import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { useClub } from '../../../contexts/ClubContext';

const API = import.meta.env.VITE_API_URL || '/api';

const field = 'mt-1.5 w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none transition-all font-medium text-sm';
const lbl = 'text-xs font-bold text-gray-400 uppercase tracking-wider';

// ════════════════════════════════════════════════════════════════════
// Los textos de la página de aportes CUANDO NO HAY CAMPAÑA — v4.987
//
// ⚠️ NO ES UN MÓDULO NI UNA PANTALLA: es un accesorio de «Campañas de
// Contribución», plegado y al final. La vieja «Maneras de Contribuir» se
// borró, y estos textos eran lo único que aquella pantalla editaba y que no
// es una campaña: la página pública los SIGUE mostrando cuando ninguna
// campaña está al aire (`ManerasDeContribuir.tsx` los lee de `ContentSection`
// page='contribucion'). Borrar el editor y dejar el texto publicado sería
// dejarlo sin forma de corregirse — un fallo mudo.
//
// Vive acá y no en una pantalla propia porque son la MISMA página: la campaña
// los tapa mientras dura y vuelven solos cuando termina.
// ════════════════════════════════════════════════════════════════════
const DonatePageTextsCard: React.FC = () => {
    const { club } = useClub();
    const clubId = (club as any)?.id;
    const clubName = (club as any)?.name || 'tu club';

    const [header, setHeader] = useState({ title: '', description: '' });
    const [card, setCard] = useState({ title: '', description: '', buttonText: '' });
    const [style, setStyle] = useState({ blocksBg: '#212C3F' });
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (!clubId) return;
        // Los mismos respaldos que pinta `ManerasDeContribuir.tsx`: con otros,
        // el panel enseñaría un texto y el visitante vería otro.
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
            }
        })();
    }, [clubId, clubName]);

    const save = async () => {
        if (!clubId) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/admin/sections/batch-upsert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
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
            toast.success('Textos de la página de aportes guardados');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar');
        } finally { setSaving(false); }
    };

    return (
        <div className="space-y-5">
            <p className="text-xs text-gray-500 leading-relaxed">
                Sin ninguna campaña al aire, tu página pública de aportes muestra estos textos. No se pierden ni se
                reemplazan: la campaña los tapa mientras dura y vuelven solos cuando termina.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className={lbl}>Título de la página</label>
                    <input className={field} value={header.title}
                        onChange={e => { setHeader({ ...header, title: e.target.value }); setDirty(true); }} />
                </div>
                <div>
                    <label className={lbl}>Texto del botón de la tarjeta</label>
                    <input className={field} value={card.buttonText}
                        onChange={e => { setCard({ ...card, buttonText: e.target.value }); setDirty(true); }} />
                </div>
            </div>
            <div>
                <label className={lbl}>Descripción de la página</label>
                <textarea rows={2} className={`${field} resize-none`} value={header.description}
                    onChange={e => { setHeader({ ...header, description: e.target.value }); setDirty(true); }} />
            </div>
            <div>
                <label className={lbl}>Título de la tarjeta destacada</label>
                <input className={field} value={card.title}
                    onChange={e => { setCard({ ...card, title: e.target.value }); setDirty(true); }} />
            </div>
            <div>
                <label className={lbl}>Descripción de la tarjeta destacada</label>
                <textarea rows={2} className={`${field} resize-none`} value={card.description}
                    onChange={e => { setCard({ ...card, description: e.target.value }); setDirty(true); }} />
            </div>
            <div className="flex items-center gap-3">
                <div>
                    <label className={lbl}>Fondo de los bloques de aporte</label>
                    <input type="color" className="mt-1.5 h-11 w-24 rounded-xl border border-gray-200 bg-white p-1"
                        value={style.blocksBg}
                        onChange={e => { setStyle({ blocksBg: e.target.value }); setDirty(true); }} />
                </div>
                <button onClick={save} disabled={saving || !dirty}
                    className={`mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${dirty ? 'bg-rotary-blue text-white hover:bg-sky-800 shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                    <Save className="w-4 h-4" /> {saving ? 'Guardando…' : 'Guardar textos'}
                </button>
            </div>
        </div>
    );
};

export default DonatePageTextsCard;
