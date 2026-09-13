/**
 * El catálogo de outros GUARDADOS, en un solo sitio (v4.1040)
 * ===========================================================
 *
 * Lo consumen DOS pantallas y hasta v4.1039 sólo una lo sabía pintar:
 *
 *   · la Biblioteca Multimedia, para componer una versión de un video con el
 *     outro al final (v4.1039), y
 *   · la Biblioteca de Reels del Estudio de Contenido, que es donde el equipo
 *     administra el contenido producido con IA y donde se pidió elegir el
 *     outro de un Reel (v4.1040).
 *
 * Escrito dos veces, el día que cambie de dónde sale la miniatura, qué se
 * considera «listo» o cómo se marca el predeterminado del sitio, una de las
 * dos se queda atrás — y el fallo es MUDO: las dos siguen mostrando una lista.
 *
 * Reglas que sostiene:
 *
 * - SÓLO SE OFRECE LO QUE TIENE ARCHIVO. Un outro sin `videoUrl` no se puede
 *   montar, y ofrecerlo sería un control que no lleva a ninguna parte.
 *
 * - EL PREDETERMINADO DEL SITIO SE PRESELECCIONA Y SE DICE, pero aplicarlo
 *   sigue siendo un gesto expreso: preseleccionar no es decidir.
 *
 * - LA PALABRA «OUTRO» NO SE TRADUCE. Es el nombre del módulo, no lenguaje:
 *   el traductor de DOM del sitio la tomaba por una palabra inglesa y la
 *   reescribía como «Cierre», así que quien buscaba «outro» en el panel no lo
 *   encontraba. Va con `data-no-translate`, igual que «Club Platform for
 *   Rotary» (v4.745).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Video, Star, Check } from 'lucide-react';

/** Un outro del Generador, tal como lo lista `GET /content-studio/outros`. */
export interface OutroChoice {
    id: string;
    title: string;
    videoUrl: string | null;
    durationSec: number | null;
    hasAudio: boolean | null;
    isDefault: boolean;
    mediaId: string | null;
    sourceImageUrl?: string | null;
    config?: { library?: { thumbUrl?: string | null } | null } | null;
    status: string;
    width?: number | null;
    height?: number | null;
}

/** La miniatura del outro: la que dejó al entrar a la Biblioteca, y si no, el
 *  fotograma de su imagen de origen. No se compone ninguna: un outro sin
 *  miniatura se pinta sin ella, que es un hueco y no un error. */
export const outroThumb = (o: OutroChoice): string | null =>
    o.config?.library?.thumbUrl || o.sourceImageUrl || null;

export interface SavedOutros {
    outros: OutroChoice[];
    loading: boolean;
    error: string | null;
    defaultOutroId: string | null;
    reload: () => void;
}

/**
 * Trae los outros listos del sitio. `enabled` en falso no consulta nada: las
 * dos pantallas lo montan dentro de un modal que casi siempre está cerrado, y
 * pedir el catálogo en cada render sería una consulta por pantalla abierta.
 */
export const useSavedOutros = (
    api: string,
    authToken: () => string | null,
    enabled = true
): SavedOutros => {
    const [outros, setOutros] = useState<OutroChoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [defaultOutroId, setDefaultOutroId] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);
    const reload = useCallback(() => setNonce(n => n + 1), []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const r = await fetch(`${api}/content-studio/outros?readyOnly=true`, {
                    headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
                });
                // Ninguna respuesta se lee con `.json()` a ciegas: una página de
                // error HTML rompe el parseo y el error resultante no nombra
                // ninguna capa (la lección de v4.946).
                const text = await r.text();
                let data: { outros?: OutroChoice[]; defaultOutroId?: string | null; error?: string } = {};
                try { data = JSON.parse(text); } catch { throw new Error(`Respuesta inesperada del servidor (HTTP ${r.status}).`); }
                if (!r.ok) throw new Error(data.error || 'No se pudieron cargar los outros');
                if (cancelled) return;
                setOutros((data.outros || []).filter(o => o.videoUrl));
                setDefaultOutroId(data.defaultOutroId || null);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar los outros');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [api, authToken, enabled, nonce]);

    return { outros, loading, error, defaultOutroId, reload };
};

/**
 * Cuál queda preseleccionado: lo que ya estaba elegido si sigue en la lista,
 * y si no, el predeterminado del sitio. Es PURO y se exporta para poder
 * probarlo sin montar la pantalla.
 */
export const preselectOutro = (
    outros: OutroChoice[],
    previous: string | null,
    defaultOutroId: string | null
): string | null => {
    if (previous && outros.some(o => o.id === previous)) return previous;
    return outros.find(o => o.id === defaultOutroId)?.id
        || outros.find(o => o.isDefault)?.id
        || null;
};

export const SavedOutroList: React.FC<{
    outros: OutroChoice[];
    loading: boolean;
    error: string | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
    /** El que está aplicado ahora mismo, para marcarlo en la lista. */
    currentId?: string | null;
}> = ({ outros, loading, error, selectedId, onSelect, currentId = null }) => (
    <div className="space-y-2">
        {loading && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando los outros guardados…
            </p>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {!loading && !error && outros.length === 0 && (
            <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No hay <span data-no-translate>outros</span> guardados todavía. Se crean en Estudio de Contenido → <span data-no-translate>Outro IA</span> (o importando un MP4 terminado).
            </p>
        )}
        {outros.map(o => {
            const activo = o.id === selectedId;
            const thumb = outroThumb(o);
            return (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => onSelect(o.id)}
                    aria-label={`Elegir: ${o.title}`}
                    className={`w-full text-left flex items-center gap-3 p-2.5 rounded-xl border transition-all ${activo ? 'border-rotary-blue bg-sky-50 ring-2 ring-rotary-blue/30' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                >
                    <div className="w-14 h-20 rounded-lg bg-gray-900 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <Video className="w-5 h-5 text-white/40" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-800 truncate" data-no-translate>{o.title}</p>
                        <p className="text-[11px] text-gray-500" data-no-translate>
                            {o.durationSec != null ? `${o.durationSec.toFixed(1)} s` : 'duración sin medir'}
                            {o.width && o.height ? ` · ${o.width}×${o.height}` : ''}
                            {o.hasAudio === true ? ' · con audio' : o.hasAudio === false ? ' · mudo' : ''}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {o.isDefault && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                    <Star className="w-3 h-3" /> Predeterminado
                                </span>
                            )}
                            {o.mediaId && <span className="text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">En Biblioteca</span>}
                            {currentId === o.id && <span className="text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">Aplicado ahora</span>}
                        </div>
                    </div>
                    {activo && <Check className="w-5 h-5 text-rotary-blue flex-shrink-0" />}
                </button>
            );
        })}
    </div>
);

export default SavedOutroList;
