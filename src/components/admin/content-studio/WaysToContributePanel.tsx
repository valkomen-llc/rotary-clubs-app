import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, Check, HeartHandshake, Image as ImageIcon, Library,
    Loader2, MapPin, RefreshCw, Sparkles, Upload, CalendarDays, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { WAYS_MAX_CONTEXT } from '../../../lib/publicationContext';

// ════════════════════════════════════════════════════════════════════
// «Maneras de Contribuir» — la configuración del décimo tipo (v4.967)
//
// NO es una pantalla aparte: se monta DENTRO del Generador de Publicaciones,
// encima del selector de imagen de siempre, y lo único que hace es (a) elegir
// la campaña, (b) ofrecer sus fotografías y (c) recoger el contexto adicional.
// La generación, los tres formatos, la vista previa, el autosave a la
// Biblioteca, publicar y programar siguen siendo exactamente los de «Desde una
// foto» — por eso este archivo no tiene ningún botón de generar.
//
// El aspecto es el del módulo: mismas tarjetas blancas, mismos radios, mismas
// mayúsculas de 10 px, mismo azul. No se rediseña nada.
// ════════════════════════════════════════════════════════════════════

export interface WaysAsset {
    url: string;
    mediaId: string | null;
    thumbUrl: string | null;
    origin: string;
    originLabel: string;
    alt: string;
    caption: string;
    credit: string;
    description: string;
}

export interface WaysCampaign {
    id: string;
    slug: string;
    name: string;
    campaignTypeLabel: string;
    emergency: boolean;
    status: string;
    statusLabel: string;
    title: string;
    subtitle: string;
    badge: string;
    text: string;
    location: string;
    eventDate: string;
    url: string;
    stats: { id: string; label: string; value: string; source: string; updatedAt: string }[];
    items: { title: string; description: string }[];
    waysToHelp: { title: string; description: string }[];
    partners: string[];
    assets: WaysAsset[];
    assetCount: number;
    canRecommend: boolean;
}

interface Catalogo {
    campaigns: WaysCampaign[];
    objectives: { id: string; label: string; help: string }[];
    audiences: { id: string; label: string; help: string }[];
    languages: { id: string; label: string }[];
    defaults: { objective: string; audience: string; language: string };
    scope: string;
}

export interface WaysConfig {
    campaignId: string;
    objective: string;
    audience: string;
    language: string;
    additionalContext: string;
}

interface Props {
    config: WaysConfig;
    onConfigChange: (next: WaysConfig) => void;
    /** La foto elegida, que es la MISMA del flujo de siempre. */
    selectedImageUrl: string | null;
    onPickAsset: (asset: WaysAsset) => void;
    onOpenLibrary: () => void;
    onUpload: () => void;
    /** La campaña resuelta viaja hacia arriba para el aviso del botón. */
    onCampaignResolved: (c: WaysCampaign | null) => void;
}

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

const WaysToContributePanel: React.FC<Props> = ({
    config, onConfigChange, selectedImageUrl, onPickAsset, onOpenLibrary, onUpload, onCampaignResolved,
}) => {
    const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);
    const [recomendando, setRecomendando] = useState(false);
    const [recomendadas, setRecomendadas] = useState<Record<string, string> | null>(null);

    // ── Cargar el catálogo ────────────────────────────────────────────
    //
    // Un fallo al cargar las campañas NO pierde el resto del formulario
    // (punto 14 del pedido): se dice con su motivo y se ofrece reintentar.
    const cargar = useCallback(async () => {
        setCargando(true);
        setErrorCarga(null);
        try {
            const r = await fetch(`${API}/content-studio/ways/campaigns`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            const texto = await r.text();
            let data: any = null;
            try { data = JSON.parse(texto); } catch {
                // Una respuesta HTML —el error de la plataforma, el documento de
                // la SPA— rompe el parseo y el error resultante no nombra
                // ninguna capa. Se dice qué llegó (lección de v4.946).
                throw new Error(`El servidor respondió ${r.status} con ${r.headers.get('content-type') || 'contenido desconocido'} en vez de JSON.`);
            }
            if (!r.ok) throw new Error(data?.error || `El servidor respondió ${r.status}.`);
            setCatalogo(data);
        } catch (e: any) {
            setErrorCarga(e?.message || 'No se pudieron cargar las campañas.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const campana = useMemo(
        () => catalogo?.campaigns.find(c => c.id === config.campaignId) || null,
        [catalogo, config.campaignId]
    );

    // Con UNA sola campaña alcanzable se elige sola: obligar a abrir un
    // desplegable de un elemento es un clic que no decide nada.
    useEffect(() => {
        if (!catalogo || config.campaignId) return;
        if (catalogo.campaigns.length === 1) {
            onConfigChange({ ...config, campaignId: catalogo.campaigns[0].id });
        }
    }, [catalogo, config, onConfigChange]);

    useEffect(() => { onCampaignResolved(campana); }, [campana, onCampaignResolved]);

    // Cambiar de campaña descarta la recomendación: la anterior ya no describe
    // nada (misma regla que el club al cambiar de distrito, v4.708).
    useEffect(() => { setRecomendadas(null); }, [config.campaignId]);

    const recomendar = async () => {
        if (!campana) return;
        setRecomendando(true);
        try {
            const r = await fetch(`${API}/content-studio/ways/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({
                    campaignId: campana.id,
                    additionalContext: config.additionalContext,
                    objective: config.objective,
                }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error || 'No se pudo recomendar.');
            if (!data.picks?.length) {
                setRecomendadas(null);
                toast.info(data.reason || 'No hubo ninguna fotografía suficientemente relacionada.');
                return;
            }
            const mapa: Record<string, string> = {};
            for (const p of data.picks) mapa[p.url] = p.reason || '';
            setRecomendadas(mapa);
            toast.success(`${data.picks.length} fotografía(s) recomendada(s) — por su descripción registrada, no por lo que se ve en ellas.`);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo recomendar.');
        } finally {
            setRecomendando(false);
        }
    };

    // ── Estados de carga y de error ───────────────────────────────────

    if (cargando) {
        return (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-xs font-black tracking-widest">CARGANDO CAMPAÑAS…</span>
            </div>
        );
    }

    if (errorCarga) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-amber-100">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-gray-800">No se pudieron cargar las campañas</p>
                        <p className="text-xs text-gray-500 mt-1">{errorCarga}</p>
                        <button
                            onClick={cargar}
                            className="mt-3 text-[10px] font-black text-blue-600 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all flex items-center gap-2"
                        >
                            <RefreshCw className="w-3.5 h-3.5" /> REINTENTAR
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!catalogo?.campaigns.length) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-sm font-bold text-gray-800">Todavía no hay campañas disponibles</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Este tipo de publicación se arma con una campaña de «Campañas de Contribución».
                    {catalogo?.scope === 'site'
                        ? ' Ninguna campaña activa alcanza a este sitio en este momento.'
                        : ' No hay ninguna campaña activa ni programada.'}
                    {' '}Se crean desde el Administrador Central, en Campañas de Contribución.
                </p>
            </div>
        );
    }

    const objetivo = catalogo.objectives.find(o => o.id === config.objective);

    return (
        <div className="space-y-4">
            {/* ── Campaña ─────────────────────────────────────────── */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 block">Campaña</label>
                <select
                    value={config.campaignId}
                    onChange={(e) => onConfigChange({ ...config, campaignId: e.target.value })}
                    className="w-full p-4 rounded-xl border-2 border-gray-50 text-sm bg-gray-50 font-bold outline-none focus:border-blue-600 transition-colors"
                >
                    <option value="">Seleccionar campaña…</option>
                    {catalogo.campaigns.map(c => (
                        <option key={c.id} value={c.id}>
                            {c.name}{c.statusLabel ? ` — ${c.statusLabel}` : ''}
                        </option>
                    ))}
                </select>

                {/* El contexto que la IA va a usar, A LA VISTA. Un contexto que
                    se aplica sin verse es una caja negra: cuando el copy no
                    sirve, no hay dónde mirar. */}
                {campana && (
                    <div className="mt-5 rounded-2xl bg-gray-50/70 border border-gray-100 p-5 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-black tracking-[0.15em] px-2.5 py-1 rounded-lg bg-blue-600 text-white">
                                CONTEXTO QUE USARÁ LA IA
                            </span>
                            <span className="text-[9px] font-black tracking-[0.15em] px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-500">
                                {campana.campaignTypeLabel?.toUpperCase()}
                            </span>
                        </div>
                        {campana.title && <p className="text-sm font-bold text-gray-800">{campana.title}</p>}
                        {campana.subtitle && <p className="text-xs text-gray-600 leading-relaxed">{campana.subtitle}</p>}

                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-gray-500 font-semibold">
                            {campana.location && (
                                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{campana.location}</span>
                            )}
                            {campana.eventDate && (
                                <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />{campana.eventDate}</span>
                            )}
                            {campana.url && (
                                <span className="flex items-center gap-1.5 truncate max-w-full"><Link2 className="w-3.5 h-3.5" />{campana.url}</span>
                            )}
                        </div>

                        {campana.stats.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                                {campana.stats.map(s => (
                                    <span key={s.id} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600">
                                        {s.label}: <span className="text-gray-900">{s.value}</span>
                                        <span className="text-gray-400 font-semibold"> · {s.source}</span>
                                    </span>
                                ))}
                            </div>
                        )}

                        {campana.waysToHelp.length > 0 && (
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                <span className="font-black text-gray-400 uppercase tracking-wider text-[9px]">Maneras de contribuir · </span>
                                {campana.waysToHelp.map(w => w.title).join(' · ')}
                            </p>
                        )}
                        {campana.items.length > 0 && (
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                <span className="font-black text-gray-400 uppercase tracking-wider text-[9px]">Se necesita · </span>
                                {campana.items.map(i => i.title).join(' · ')}
                            </p>
                        )}

                        <p className="text-[10px] text-gray-400 leading-relaxed pt-1 border-t border-gray-100">
                            La IA usa únicamente lo que ves acá, la fotografía elegida y tu contexto adicional.
                            No inventa cifras, lugares, fechas ni resultados: lo que la campaña no tiene registrado, no se escribe.
                        </p>
                    </div>
                )}
            </div>

            {/* ── Contenido de la campaña ─────────────────────────── */}
            {campana && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <HeartHandshake className="w-5 h-5 text-blue-600" />
                            Contenido de esta campaña
                            <span className="text-[10px] font-black text-gray-400">({campana.assetCount})</span>
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {campana.canRecommend && (
                                <button
                                    onClick={recomendar}
                                    disabled={recomendando}
                                    className="text-[10px] font-black text-blue-600 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {recomendando
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Sparkles className="w-3.5 h-3.5" />}
                                    RECOMENDAR CONTENIDO
                                </button>
                            )}
                            <button onClick={onOpenLibrary} className="text-[10px] font-black text-gray-500 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all flex items-center gap-2">
                                <Library className="w-3.5 h-3.5" /> VER TODA LA BIBLIOTECA
                            </button>
                            <button onClick={onUpload} className="text-[10px] font-black text-gray-500 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all flex items-center gap-2">
                                <Upload className="w-3.5 h-3.5" /> SUBIR
                            </button>
                        </div>
                    </div>

                    <div className="p-6">
                        {campana.assets.length === 0 ? (
                            // Una campaña sin multimedia NO bloquea: se genera con
                            // su contexto y la foto se elige de la Biblioteca
                            // completa o se sube (punto 14 del pedido).
                            <div className="text-center py-6">
                                <ImageIcon className="w-10 h-10 text-gray-200 mx-auto" />
                                <p className="text-xs font-bold text-gray-500 mt-3">Esta campaña todavía no tiene fotografías cargadas</p>
                                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-md mx-auto">
                                    Podés elegir una de la Biblioteca del sitio o subirla. El copy se genera igual, con el contexto de la campaña.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {campana.assets.map((a) => {
                                    const elegida = selectedImageUrl === a.url;
                                    const sugerida = !!recomendadas?.[a.url];
                                    return (
                                        <button
                                            key={a.url}
                                            type="button"
                                            onClick={() => onPickAsset(a)}
                                            title={a.description || a.originLabel}
                                            className={`group relative aspect-square rounded-2xl overflow-hidden border-2 transition-all text-left ${
                                                elegida ? 'border-blue-600 shadow-lg shadow-blue-100'
                                                    : sugerida ? 'border-amber-300'
                                                        : 'border-gray-100 hover:border-blue-200'
                                            }`}
                                        >
                                            <img
                                                src={a.thumbUrl || a.url}
                                                alt={a.alt || a.caption || ''}
                                                loading="lazy"
                                                className="w-full h-full object-cover"
                                            />
                                            <span className="absolute top-1.5 left-1.5 text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded bg-black/55 text-white">
                                                {a.originLabel.toUpperCase()}
                                            </span>
                                            {sugerida && !elegida && (
                                                <span className="absolute top-1.5 right-1.5 text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 flex items-center gap-1">
                                                    <Sparkles className="w-2.5 h-2.5" /> SUGERIDA
                                                </span>
                                            )}
                                            {elegida && (
                                                <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-white" />
                                                </span>
                                            )}
                                            {(a.caption || a.credit) && (
                                                <span className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/75 to-transparent text-[9px] font-semibold text-white line-clamp-2 leading-tight">
                                                    {a.caption || a.credit}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {recomendadas && (
                            <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
                                Las sugeridas se eligieron leyendo el pie y la descripción que la campaña guarda de cada fotografía,
                                no mirando las imágenes. Revisalas antes de generar.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* ── Contexto adicional ──────────────────────────────── */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        Contexto adicional <span className="text-gray-300">— opcional</span>
                    </label>
                    <span className={`text-[10px] font-black ${config.additionalContext.length > WAYS_MAX_CONTEXT ? 'text-red-500' : 'text-gray-300'}`}>
                        {config.additionalContext.length}/{WAYS_MAX_CONTEXT}
                    </span>
                </div>
                <textarea
                    value={config.additionalContext}
                    maxLength={WAYS_MAX_CONTEXT}
                    onChange={(e) => onConfigChange({ ...config, additionalContext: e.target.value })}
                    rows={4}
                    placeholder="Describe qué ocurrió, qué apoyo se realizó, qué aspecto deseas destacar o qué mensaje quieres comunicar en esta publicación."
                    className="w-full p-4 rounded-xl border-2 border-gray-50 text-sm bg-gray-50 outline-none focus:border-blue-600 transition-colors resize-y leading-relaxed"
                />
                {/* NO es obligatorio y hay que decirlo: un campo que parece
                    requerido frena la generación por nada. */}
                <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                    Si lo dejás vacío se genera igual, con el contexto de la campaña y la fotografía elegida.
                    Lo que escribas acá cuenta como información suministrada: podés nombrar cifras, lugares y
                    fechas que conozcas y la IA podrá usarlas.
                </p>
            </div>

            {/* ── Objetivo, audiencia e idioma ────────────────────── */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-5">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 block">
                        Objetivo de la publicación
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {catalogo.objectives.map(o => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => onConfigChange({ ...config, objective: o.id })}
                                className={`px-3 py-3 rounded-xl text-[10px] font-black transition-all border-2 ${
                                    config.objective === o.id
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                        : 'bg-white border-gray-50 text-gray-400 hover:border-blue-100'
                                }`}
                            >
                                {o.label.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    {objetivo?.help && <p className="text-[11px] text-gray-400 mt-3">{objetivo.help}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 block">Audiencia</label>
                        <select
                            value={config.audience}
                            onChange={(e) => onConfigChange({ ...config, audience: e.target.value })}
                            className="w-full p-4 rounded-xl border-2 border-gray-50 text-sm bg-gray-50 font-bold outline-none focus:border-blue-600 transition-colors"
                        >
                            {catalogo.audiences.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 block">Idioma</label>
                        <select
                            value={config.language}
                            onChange={(e) => onConfigChange({ ...config, language: e.target.value })}
                            className="w-full p-4 rounded-xl border-2 border-gray-50 text-sm bg-gray-50 font-bold outline-none focus:border-blue-600 transition-colors"
                        >
                            {catalogo.languages.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WaysToContributePanel;
