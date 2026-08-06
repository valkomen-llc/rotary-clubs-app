// ════════════════════════════════════════════════════════════════════
// Plantillas IA — panel de configuración (izquierda)
// v4.720.0
//
// Los tres pasos del pedido: elegir plantilla, elegir club, escribir el
// mensaje. Es el mismo reparto del Generador de Pendones —configuración a la
// izquierda, mesa de trabajo al centro— y por eso se siente conocido.
//
// El buscador de clubes consulta al SERVIDOR, no una lista descargada: hay
// cientos de sitios alojados y traerlos todos al navegador para filtrar sería
// pagar el catálogo entero en cada visita.
// ════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import {
    Search, Sparkles, Loader2, ImagePlus, Building2, LayoutTemplate,
    Wand2, CalendarClock, Check, AlertTriangle, X, Upload, Images,
} from 'lucide-react';
import { toast } from 'sonner';
import ImageSourceOverlay from '../ImageSourceOverlay';
import type { Catalog, ClubHit, Branding, DesignCopy, TemplateSummary } from './designApi';
import { searchClubs, fetchBranding, saveFoundation, improve } from './designApi';

interface Props {
    catalog: Catalog | null;
    templateId: string;
    onTemplate: (id: string) => void;
    club: ClubHit | null;
    onClub: (club: ClubHit | null, branding: Branding | null) => void;
    branding: Branding | null;
    years: string;
    onYears: (v: string) => void;
    message: string;
    onMessage: (v: string) => void;
    copy: DesignCopy | null;
    photo: string | null;
    onPickPhoto: () => void;
    onUploadPhoto: (file: File | undefined) => void;
    uploading: boolean;
    onClearPhoto: () => void;
    generating: boolean;
    onGenerate: () => void;
    missing: string[];
}

const box = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';
const Section: React.FC<{ n: number; title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ n, title, icon, children }) => (
    <section className="mb-6 border-b border-gray-100 pb-5 last:border-0">
        <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{n}</span>
            <span className="text-gray-500">{icon}</span>
            <h3 className="text-sm font-black text-gray-800">{title}</h3>
        </div>
        {children}
    </section>
);

const DesignSidebar: React.FC<Props> = ({
    catalog, templateId, onTemplate, club, onClub, branding,
    years, onYears, message, onMessage, copy, photo, onPickPhoto, onUploadPhoto, uploading, onClearPhoto,
    generating, onGenerate, missing,
}) => {
    const [term, setTerm] = useState('');
    const [hits, setHits] = useState<ClubHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    const [improving, setImproving] = useState<string | null>(null);
    const [foundation, setFoundation] = useState('');
    const debounce = useRef<number | null>(null);

    // Buscador con freno: una consulta por pulsación castigaría a la base con
    // una búsqueda por letra.
    useEffect(() => {
        if (debounce.current) window.clearTimeout(debounce.current);
        const q = term.trim();
        if (q.length < 2) { setHits([]); return; }
        debounce.current = window.setTimeout(async () => {
            setSearching(true);
            try { setHits(await searchClubs(q)); }
            catch (e) { console.error(e); }
            finally { setSearching(false); }
        }, 280);
        return () => { if (debounce.current) window.clearTimeout(debounce.current); };
    }, [term]);

    useEffect(() => { setFoundation(branding?.foundationDate || (branding?.foundedYear ? String(branding.foundedYear) : '')); }, [branding]);

    const pickClub = async (hit: ClubHit) => {
        setOpen(false); setTerm(hit.name);
        try {
            const b = await fetchBranding(hit.id);
            onClub(hit, b);
            if (b.years == null) toast.info('Este club no tiene fecha de fundación registrada. Escribila abajo para calcular los años.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cargar el club');
            onClub(hit, null);
        }
    };

    const persistFoundation = async () => {
        if (!club || !foundation.trim()) return;
        try {
            const r = await saveFoundation(club.id, foundation.trim());
            if (r.years != null) onYears(String(r.years));
            toast.success(`Fundación guardada: ${r.stored}. El club cumple ${r.years} años.`);
        } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar la fecha'); }
    };

    const applyTone = async (tone: string) => {
        if (!message.trim()) { toast.warning('Primero generá o escribí un mensaje.'); return; }
        setImproving(tone);
        try {
            const r = await improve({
                text: message, tone,
                context: branding ? { clubName: branding.clubName, city: branding.city, district: branding.district } : {},
            });
            onMessage(r.mensaje);
            if (r.degraded) toast.warning(r.note || 'No se pudo mejorar el texto.');
            else toast.success('Mensaje actualizado.');
        } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo mejorar el mensaje'); }
        finally { setImproving(null); }
    };

    // `?.` en cada eslabón y respaldo a lista vacía: una respuesta inesperada
    // del catálogo tiene que dejar la pantalla vacía, no en blanco.
    const byCategory = catalog?.catalog || [];
    const current = catalog?.templates?.find(t => t.id === templateId) || null;
    const needsPhoto = (current?.requires || []).includes('imagen');

    return (
        <aside className="w-full lg:w-[340px] shrink-0 bg-white border-r border-gray-200 overflow-y-auto p-5">
            {/* ── 1. Plantilla ─────────────────────────────────────── */}
            <Section n={1} title="Plantilla" icon={<LayoutTemplate className="w-4 h-4" />}>
                {byCategory.map(cat => {
                    const usable = (cat.templates || []).filter(t => t.available);
                    return (
                        <div key={cat.id} className="mb-3">
                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">
                                {cat.label}{!usable.length && <span className="ml-1.5 font-bold text-gray-300 normal-case tracking-normal">· Próximamente</span>}
                            </p>
                            {usable.length > 0 && (
                                <div className="space-y-1.5">
                                    {usable.map((t: TemplateSummary) => (
                                        <button key={t.id} onClick={() => onTemplate(t.id)}
                                            className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${templateId === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}>
                                            <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                                                {templateId === t.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                                {t.name}
                                            </span>
                                            {t.summary && <span className="block text-[11px] text-gray-500 mt-0.5">{t.summary}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </Section>

            {/* ── 2. Club ──────────────────────────────────────────── */}
            <Section n={2} title="Club" icon={<Building2 className="w-4 h-4" />}>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input className={`${box} pl-9`} placeholder="Buscá por nombre, ciudad o distrito"
                        value={term} onChange={e => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
                    {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-indigo-500" />}
                    {open && hits.length > 0 && (
                        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl">
                            {hits.map(h => (
                                <button key={h.id} onClick={() => pickClub(h)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2">
                                    {h.logo
                                        ? <img src={h.logo} alt="" className="w-7 h-7 object-contain rounded shrink-0" />
                                        : <div className="w-7 h-7 rounded bg-gray-100 shrink-0" />}
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-gray-800 truncate">{h.name}</span>
                                        <span className="block text-[11px] text-gray-500 truncate">
                                            {[h.city, h.district && `Distrito ${h.district}`].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {branding && (
                    <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-[11px] text-gray-600 space-y-1">
                        <p className="font-bold text-gray-800 text-xs">{branding.clubName}</p>
                        {branding.city && <p>{branding.city}{branding.country ? `, ${branding.country}` : ''}</p>}
                        {branding.district && <p>Distrito {branding.district}</p>}
                        {branding.governor && <p>Gobernador: {branding.governor}</p>}
                        <div className="flex items-center gap-1.5 pt-1">
                            <span className="w-3.5 h-3.5 rounded-full border border-white ring-1 ring-gray-200" style={{ background: branding.primary }} />
                            <span className="w-3.5 h-3.5 rounded-full border border-white ring-1 ring-gray-200" style={{ background: branding.accent }} />
                            <span className="text-gray-400">colores del sitio</span>
                        </div>
                    </div>
                )}

                {/* La fecha de fundación no está en el modelo `Club` y NO se
                    deduce de `createdAt`, que es cuándo se creó el sitio. Ver
                    la nota de `designBranding.js`. */}
                <div className="mt-3">
                    <label className="block text-[11px] font-bold text-gray-600 mb-1 flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5" /> Fundación del club
                    </label>
                    <div className="flex gap-2">
                        <input className={box} placeholder="1974 o 1974-08-04" value={foundation}
                            onChange={e => setFoundation(e.target.value)} onBlur={persistFoundation} disabled={!club} />
                        <input className={`${box} w-24 text-center font-bold`} placeholder="años" value={years}
                            onChange={e => onYears(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">
                        Se guarda en el sitio del club, así que el año que viene ya está.
                    </p>
                </div>
            </Section>

            {/* ── 3. Mensaje ───────────────────────────────────────── */}
            <Section n={3} title="Mensaje" icon={<Sparkles className="w-4 h-4" />}>
                <button onClick={onGenerate} disabled={generating || !club}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg px-4 py-2.5 transition-colors">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {generating ? 'Escribiendo…' : 'Generar con IA'}
                </button>

                {missing.length > 0 && (
                    <p className="mt-2 flex gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Falta {missing.map(m => ({ club: 'el club', anios: 'los años que cumple', imagen: 'la fotografía' } as Record<string, string>)[m] || m).join(', ')}. La pieza se dibuja igual, pero incompleta.</span>
                    </p>
                )}

                <textarea className={`${box} mt-3 min-h-[120px] resize-y leading-relaxed`} value={message}
                    onChange={e => onMessage(e.target.value)} placeholder="El mensaje que va impreso en la pieza. Podés escribirlo a mano." />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>{message.length} caracteres</span>
                    {copy?.degraded && <span className="text-amber-600">{copy.note}</span>}
                </div>

                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mt-3 mb-1.5">✨ Mejorar con IA</p>
                <div className="flex flex-wrap gap-1.5">
                    {(catalog?.tones || []).map(t => (
                        <button key={t.id} onClick={() => applyTone(t.id)} disabled={!!improving}
                            className="text-[11px] font-semibold rounded-full border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-40 px-2.5 py-1 text-gray-600 transition-colors">
                            {improving === t.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t.label}
                        </button>
                    ))}
                </div>
            </Section>

            {/* ── Fotografía ───────────────────────────────────────── */}
            <Section n={4} title={needsPhoto ? 'Fotografía del club' : 'Fotografía (opcional)'} icon={<ImagePlus className="w-4 h-4" />}>
                {photo ? (
                    // Con vista previa, las dos vías van en el velo al pasar el
                    // ratón — el componente compartido de v4.700.
                    <div className="relative group rounded-lg overflow-hidden border border-gray-200">
                        <img src={photo} alt="" className="w-full h-28 object-cover" />
                        <ImageSourceOverlay
                            rounded="rounded-lg"
                            onUpload={e => onUploadPhoto(e.target.files?.[0])}
                            onPickFromLibrary={onPickPhoto}
                        />
                        <button onClick={onClearPhoto} className="absolute top-1.5 right-1.5 z-10 bg-white/90 hover:bg-white rounded-full p-1 shadow" title="Quitar">
                            <X className="w-3.5 h-3.5 text-gray-700" />
                        </button>
                    </div>
                ) : (
                    <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center text-[11px] text-gray-400">
                        {needsPhoto ? 'Esta plantilla lleva una fotografía.' : 'Esta plantilla no la necesita.'}
                    </div>
                )}
                {/* Sin vista previa NO sirve el velo: no hay nada sobre lo que
                    pasar el ratón. Las dos vías van como dos botones, porque la
                    regla de v4.700 es que las DOS estén siempre — y con una sola
                    («Biblioteca») poner una imagen obliga a irse hasta allá,
                    cargarla y volver, que es exactamente el retroceso que la
                    regla existe para evitar. */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg px-2 py-2 text-gray-700 cursor-pointer transition-colors">
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {uploading ? 'Subiendo…' : 'Subir'}
                        <input type="file" accept="image/*" className="hidden" disabled={uploading}
                            onChange={e => { onUploadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    <button onClick={onPickPhoto} className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg px-2 py-2 text-gray-700 transition-colors">
                        <Images className="w-3.5 h-3.5" /> Biblioteca
                    </button>
                </div>
                <p className="mt-1.5 text-[10px] text-gray-400">
                    Lo que subas queda guardado en la Biblioteca Multimedia, así que se puede reutilizar.
                </p>
            </Section>
        </aside>
    );
};

export default DesignSidebar;
