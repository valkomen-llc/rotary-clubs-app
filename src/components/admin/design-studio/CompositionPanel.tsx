// ════════════════════════════════════════════════════════════════════
// Plantillas IA — Composición con IA
// v4.722.0
//
// El administrador configura una vez: la imagen base institucional, el prompt
// maestro y cuántas variantes se generan. Después pulsa «Componer» y elige
// entre las que devuelve el modelo.
//
// ── QUÉ HACE LA IA Y QUÉ NO, DICHO EN LA PANTALLA ───────────────────
//
// El modelo construye la IMAGEN —fondo institucional con la fotografía
// integrada—; el nombre del club, el mensaje, el logotipo y la firma los sigue
// pintando nuestro motor, nítidos. No es un detalle interno: si alguien espera
// que el modelo escriba el texto y no lo dice la pantalla, la primera vez que
// vea el resultado va a pensar que falta algo.
// ════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import {
    Sparkles, Loader2, Upload, Images, Check, AlertTriangle, X, Wand2, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import ImageSourceOverlay from '../ImageSourceOverlay';
import { startBackdrop, syncBackdrop, type Composition, type BackdropVariant } from './designApi';

export interface VariantResult extends Omit<BackdropVariant, 'error'> {
    status: 'pending' | 'ready' | 'failed';
    url?: string;
    notes?: string[];
    /** Se ensancha respecto de `BackdropVariant`: acá también entra el error de
     *  un sondeo, no sólo el del arranque. */
    error?: string | null;
}

interface Props {
    composition: Composition;
    onChange: (c: Composition) => void;
    /** La fotografía del club que se va a integrar. Sin ella no hay qué componer. */
    photoUrl: string | null;
    format: string;
    palette: { primary?: string; accent?: string };
    maxVariants: number;
    hasBackdrop: boolean;
    onApply: (url: string) => void;
    onRemove: () => void;
    onPickBase: () => void;
    onUploadBase: (file: File | undefined) => void;
    uploading: boolean;
    /** El número de paso, que lo decide el panel que lo ordena. Estaba escrito a
     *  mano acá y quedó DUPLICADO al agregar la Cabecera en v4.724: dos secciones
     *  numeradas «5» en la misma columna. Un orden se decide en un solo sitio. */
    step?: number;
    /** Si el diseño tiene un hueco para la fotografía del club. Sin él, el
     *  formulario público no la pide y no hay nada que integrar en el lienzo —y
     *  desde el panel eso no se ve: el administrador mira su pieza completa. */
    hasPhotoSlot?: boolean;
    onAddPhoto?: () => void;
}

const box = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';
const lbl = 'block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1';

const CompositionPanel: React.FC<Props> = ({
    composition, onChange, photoUrl, format, palette, maxVariants,
    hasBackdrop, onApply, onRemove, onPickBase, onUploadBase, uploading, step = 6,
    hasPhotoSlot = true, onAddPhoto,
}) => {
    const [running, setRunning] = useState(false);
    const [variants, setVariants] = useState<VariantResult[]>([]);
    const timer = useRef<number | null>(null);

    // El sondeo SÓLO existe mientras hay algo pendiente. Con todo resuelto el
    // efecto se desmonta y no se consulta más — misma regla que el progreso del
    // Creador de Reels.
    useEffect(() => {
        const pendientes = variants.filter(v => v.status === 'pending' && v.taskId);
        if (!pendientes.length) { setRunning(false); return; }
        setRunning(true);

        timer.current = window.setTimeout(async () => {
            const actualizadas = await Promise.all(variants.map(async v => {
                if (v.status !== 'pending' || !v.taskId) return v;
                try {
                    const r = await syncBackdrop(v.taskId, format);
                    if (r.status === 'ready') return { ...v, status: 'ready' as const, url: r.url, notes: r.notes || [] };
                    if (r.status === 'failed') return { ...v, status: 'failed' as const, error: r.error || 'El modelo no pudo componer.' };
                    return v;
                } catch (e) {
                    return { ...v, status: 'failed' as const, error: e instanceof Error ? e.message : 'Error al consultar' };
                }
            }));
            setVariants(actualizadas);
        }, 4000);

        return () => { if (timer.current) window.clearTimeout(timer.current); };
    }, [variants, format]);

    const componer = async () => {
        if (!photoUrl && !composition.baseImageUrl) {
            toast.warning('Hace falta la fotografía del club o una imagen base.');
            return;
        }
        setRunning(true);
        setVariants([]);
        try {
            const r = await startBackdrop({ composition, format, photoUrl, palette, variants: composition.variants });
            setVariants(r.variants.map(v => ({
                ...v,
                status: v.taskId ? ('pending' as const) : ('failed' as const),
                error: v.error,
            })));
        } catch (e) {
            setRunning(false);
            toast.error(e instanceof Error ? e.message : 'No se pudo iniciar la composición');
        }
    };

    const set = (patch: Partial<Composition>) => onChange({ ...composition, ...patch });

    return (
        <section className="mb-6 border-t border-gray-100 pt-5">
            <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{step}</span>
                <Sparkles className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-black text-gray-800 flex-1">Composición con IA</h3>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={composition.enabled} onChange={e => set({ enabled: e.target.checked })} />
                    Activar
                </label>
            </div>
            <p className="text-[10px] text-gray-400 mb-3 leading-relaxed">
                El modelo arma la <strong>imagen</strong> —fondo institucional con la fotografía integrada—.
                El nombre del club, el mensaje, el logotipo y la firma los sigue dibujando la plataforma,
                nítidos: un modelo generativo escribe el texto con errores.
            </p>

            {composition.enabled && (
                <>
                    {/* El hueco de la fotografía. Va ARRIBA de la imagen base
                        porque sin él lo de abajo no sirve para nada: no hay
                        fotografía que integrar. */}
                    {!hasPhotoSlot && onAddPhoto && (
                        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                            <p className="flex gap-1.5 text-[11px] text-amber-800 leading-relaxed">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>
                                    Este diseño no tiene un espacio para la fotografía del club, así que el
                                    formulario público <strong>no la va a pedir</strong> y no hay nada que integrar
                                    en el lienzo.
                                </span>
                            </p>
                            <button onClick={onAddPhoto}
                                className="mt-2 w-full text-xs font-bold border border-amber-300 bg-white hover:border-amber-500 rounded-lg px-2 py-1.5 text-amber-900 transition-colors">
                                Agregar el espacio de la fotografía
                            </button>
                        </div>
                    )}

                    {/* Imagen base */}
                    <div className="mb-3">
                        <span className={lbl}>Imagen base institucional</span>
                        {composition.baseImageUrl ? (
                            <div className="relative group rounded-lg overflow-hidden border border-gray-200">
                                <img src={composition.baseImageUrl} alt="" className="w-full h-24 object-cover" />
                                <ImageSourceOverlay
                                    rounded="rounded-lg"
                                    onUpload={e => onUploadBase(e.target.files?.[0])}
                                    onPickFromLibrary={onPickBase}
                                />
                                <button onClick={() => set({ baseImageUrl: null })}
                                    className="absolute top-1.5 right-1.5 z-10 bg-white/90 hover:bg-white rounded-full p-1 shadow" title="Quitar">
                                    <X className="w-3.5 h-3.5 text-gray-700" />
                                </button>
                            </div>
                        ) : (
                            // Las dos vías, como en toda casilla de imagen del panel (v4.700).
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-dashed border-gray-300 hover:border-indigo-400 rounded-lg px-2 py-2 text-gray-600 cursor-pointer transition-colors">
                                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Subir
                                    <input type="file" accept="image/*" className="hidden" disabled={uploading}
                                        onChange={e => { onUploadBase(e.target.files?.[0]); e.target.value = ''; }} />
                                </label>
                                <button onClick={onPickBase}
                                    className="flex items-center justify-center gap-1.5 text-xs font-semibold border border-dashed border-gray-300 hover:border-indigo-400 rounded-lg px-2 py-2 text-gray-600 transition-colors">
                                    <Images className="w-3.5 h-3.5" /> Biblioteca
                                </button>
                            </div>
                        )}
                        <p className="mt-1 text-[10px] text-gray-400">
                            El lienzo institucional —textura, curvas, colores— sobre el que el modelo construye. Opcional:
                            sin él, lo arma desde el prompt.
                        </p>
                    </div>

                    <div className="mb-3">
                        <span className={lbl}>Prompt maestro</span>
                        <textarea className={`${box} min-h-[70px] resize-y text-xs leading-relaxed`}
                            value={composition.masterPrompt} maxLength={1200}
                            placeholder="Cómo tiene que sentirse la pieza. En positivo y corto."
                            onChange={e => set({ masterPrompt: e.target.value })} />
                        <p className="mt-1 text-[10px] text-gray-400">
                            Se agrega al final del prompt. Si el total se pasa del presupuesto del modelo, esto es lo primero
                            que se recorta — y queda anotado en la consola.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div>
                            <span className={lbl}>Variantes (panel)</span>
                            <select className={box} value={composition.variants}
                                onChange={e => set({ variants: +e.target.value })}>
                                {Array.from({ length: maxVariants }, (_, i) => i + 1).map(n =>
                                    <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div>
                            <span className={lbl}>Variantes (público)</span>
                            <select className={box} value={composition.publicVariants}
                                onChange={e => set({ publicVariants: +e.target.value })}>
                                {Array.from({ length: maxVariants }, (_, i) => i + 1).map(n =>
                                    <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-3 leading-relaxed">
                        Cada variante es una llamada al modelo y se paga. En el portal público, donde nadie está
                        identificado, conviene dejarlo en 1.
                    </p>

                    {/* La consecuencia de encenderlo en el portal público, dicha. */}
                    <p className="flex gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                            En el portal público, componer con IA obliga a <strong>guardar la fotografía</strong> que sube
                            cada visitante en nuestro almacenamiento —el modelo necesita una dirección que pueda
                            descargar— y a enviarla a un proveedor externo. Sin composición, esa foto es efímera.
                        </span>
                    </p>

                    <div>
                        <span className={lbl}>Estilo</span>
                        <select className={`${box} mb-3`} value={composition.style} onChange={e => set({ style: e.target.value })}>
                            <option value="institucional">Institucional</option>
                            <option value="calido">Cálido</option>
                            <option value="festivo">Festivo</option>
                            <option value="sobrio">Sobrio</option>
                        </select>
                    </div>

                    <button onClick={componer} disabled={running || (!photoUrl && !composition.baseImageUrl)}
                        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg px-4 py-2.5 transition-colors">
                        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        {running ? 'Componiendo…' : 'Componer con IA'}
                    </button>
                    <p className="mt-1 text-[10px] text-gray-400 text-center">Tarda entre 20 y 60 segundos por variante.</p>

                    {/* Variantes */}
                    {variants.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {variants.map(v => (
                                <div key={v.planId} className="rounded-lg border border-gray-200 overflow-hidden">
                                    <div className="aspect-square bg-gray-50 flex items-center justify-center">
                                        {v.status === 'pending' && <Loader2 className="w-5 h-5 animate-spin text-purple-500" />}
                                        {v.status === 'failed' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                                        {v.status === 'ready' && v.url && (
                                            <button onClick={() => onApply(v.url!)} className="w-full h-full group relative">
                                                <img src={v.url} alt="" className="w-full h-full object-cover" />
                                                <span className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                                    <span className="flex items-center gap-1 text-white text-[11px] font-black"><Check className="w-3.5 h-3.5" /> Usar</span>
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                    <p className="px-2 py-1 text-[10px] font-bold text-gray-600 truncate" title={v.summary}>{v.label}</p>
                                    {v.error && <p className="px-2 pb-1 text-[9px] text-amber-700 leading-tight">{v.error}</p>}
                                    {v.notes?.map((n, i) => <p key={i} className="px-2 pb-1 text-[9px] text-amber-700 leading-tight">{n}</p>)}
                                </div>
                            ))}
                        </div>
                    )}

                    {hasBackdrop && (
                        <button onClick={onRemove}
                            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold border border-gray-300 hover:border-red-400 hover:text-red-600 rounded-lg px-3 py-2 text-gray-600 transition-colors">
                            <Undo2 className="w-3.5 h-3.5" /> Quitar el fondo generado
                        </button>
                    )}
                </>
            )}
        </section>
    );
};

export default CompositionPanel;
