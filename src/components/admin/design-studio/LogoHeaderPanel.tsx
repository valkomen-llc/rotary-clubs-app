// ════════════════════════════════════════════════════════════════════
// Plantillas IA — Cabecera: el logotipo del club
// v4.724.0
//
// Es el bloque «Cabecera (logo del club + distrito)» del Generador de Pendones,
// traído acá. La razón de que haga falta aunque el logotipo ya sea un campo
// vinculado (v4.723) es de USO, no de motor: hasta ahora, para colocarlo había
// que saber que hay que seleccionarlo en la mesa de trabajo y abrir Propiedades.
// En el pendón está a la vista, en el panel de configuración, junto a todo lo
// demás que se decide una vez y queda fijo. Acá también.
//
// ── LA PROMESA CONCRETA ─────────────────────────────────────────────
//
// «La posición y el tamaño se aplican igual al logo que suba el público.» Eso ya
// es cierto por construcción y conviene entender por qué: lo que el público
// manda es una IMAGEN, no un nodo. El recuadro —dónde está, cuánto mide, cómo se
// encuadra— vive en el documento publicado y no se puede tocar desde el portal.
// Este panel edita ESE recuadro.
//
// ── UNA SOLA VERDAD SOBRE EL TAMAÑO ─────────────────────────────────
//
// El pendón guarda un `logo.scale` aparte porque su recuadro está escrito en el
// código. Acá el recuadro ES el nodo, así que guardar además una escala daría
// dos verdades que se contradicen en cuanto alguien arrastra el logotipo en la
// mesa de trabajo —y arrastrarlo es justamente lo que el módulo permite—.
//
// Por eso la escala se DERIVA (`frameScaleOf`) del ancho actual contra el
// recuadro que declaró la plantilla (`field.image.frame`), que es una constante:
// el 100 % siempre significa lo mismo y «Restablecer» tiene a dónde volver.
// ════════════════════════════════════════════════════════════════════

import React from 'react';
import { Image as ImageIcon, Upload, Images, X, RotateCcw, Plus, Info } from 'lucide-react';
import ImageSourceOverlay from '../ImageSourceOverlay';
import { frameScaleOf, scaledBox, resetBox } from '../../../lib/designFields';
import type { DesignNode, ImageNode } from '../../../lib/designSpec';

interface Props {
    /** El nodo del logotipo dentro del documento, o `null` si el diseño no
     *  tiene ninguno todavía. */
    node: ImageNode | null;
    onPatch: (id: string, patch: Partial<DesignNode>) => void;
    onUpload: (file: File | undefined) => void;
    onPickFromLibrary: () => void;
    onClear: (id: string) => void;
    /** Crear el hueco del logotipo en un diseño que no lo tiene. Sin esto, una
     *  plantilla armada a mano no puede ofrecer el logotipo en el portal y no
     *  hay forma de darse cuenta. */
    onAdd: () => void;
    uploading: boolean;
    /** El logotipo del club elegido, para poder ofrecerlo de un clic. */
    clubLogo?: string | null;
}

const Slider: React.FC<{
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
    <div className="mb-2.5">
        <span className="block text-[11px] font-bold text-gray-600 mb-1">{label}</span>
        <input type="range" min={min} max={max} step={step} value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-full accent-indigo-600" />
    </div>
);

const LogoHeaderPanel: React.FC<Props> = ({
    node, onPatch, onUpload, onPickFromLibrary, onClear, onAdd, uploading, clubLogo,
}) => {
    // Sin nodo no hay recuadro que editar. Se OFRECE crearlo en vez de esconder
    // la sección: que la plantilla no lleve logotipo es un dato, no un motivo
    // para dejar al administrador sin saber que puede ponerlo.
    if (!node) {
        return (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center">
                <p className="text-[11px] text-gray-500 mb-2.5">
                    Este diseño todavía no tiene un espacio para el logotipo del club.
                </p>
                <button onClick={onAdd}
                    className="inline-flex items-center gap-1.5 text-xs font-bold border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg px-3 py-2 text-gray-700 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Agregar el logotipo del club
                </button>
                <p className="mt-2 text-[10px] text-gray-400 leading-relaxed">
                    Se agrega arriba a la izquierda y ya queda marcado como campo del portal público: quien
                    use el enlace sube el suyo y cae exactamente en ese recuadro.
                </p>
            </div>
        );
    }

    const scale = frameScaleOf(node);
    // Que el recuadro exista no significa que el público lo pueda llenar: lo que
    // lo convierte en campo es su CLAVE (`srcVar`). Un logotipo colocado como
    // capa suelta se ve igual acá y en el portal no se puede tocar — y esa
    // diferencia hay que decirla, porque desde el panel no se ve.
    const esCampoPublico = node.srcVar === 'logo';
    const patchBox = (box: { x: number; y: number; w: number; h: number }) =>
        onPatch(node.id, box as Partial<DesignNode>);

    return (
        <>
            <span className="block text-[11px] font-bold text-gray-600 mb-1">Logo por defecto del club</span>
            <div className="flex gap-2">
                <div className="w-[72px] h-[72px] shrink-0 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden relative group">
                    {node.src
                        ? <>
                            <img src={node.src} alt="" className="max-w-full max-h-full object-contain p-1.5" />
                            {/* Con vista previa, las dos vías van en el velo al
                                pasar el ratón — el componente compartido de la
                                regla de v4.700. */}
                            <ImageSourceOverlay
                                rounded="rounded-lg"
                                onUpload={e => onUpload(e.target.files?.[0])}
                                onPickFromLibrary={onPickFromLibrary}
                            />
                        </>
                        : <ImageIcon className="w-6 h-6 text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Sin vista previa el velo no sirve —no hay nada sobre lo
                        que pasar el ratón—, así que las dos vías van como dos
                        botones. Siempre las DOS: con sólo «Biblioteca», poner un
                        logotipo que no esté cargado obliga a salir del módulo,
                        subirlo allá y volver. */}
                    <div className="grid grid-cols-2 gap-1.5">
                        <label className="flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg px-2 py-1.5 text-gray-700 cursor-pointer transition-colors">
                            <Upload className="w-3 h-3" /> {uploading ? 'Subiendo…' : 'Subir'}
                            <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden"
                                disabled={uploading}
                                onChange={e => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                        <button onClick={onPickFromLibrary}
                            className="flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg px-2 py-1.5 text-gray-700 transition-colors">
                            <Images className="w-3 h-3" /> Biblioteca
                        </button>
                    </div>
                    {/* El logotipo del club elegido en el paso 2. Es el caso
                        habitual y estaba a dos pantallas de distancia. */}
                    {clubLogo && clubLogo !== node.src && (
                        <button onClick={() => onPatch(node.id, { src: clubLogo } as Partial<DesignNode>)}
                            className="w-full text-[11px] font-semibold text-indigo-600 hover:underline text-left">
                            Usar el del club elegido
                        </button>
                    )}
                    {node.src && (
                        <button onClick={() => onClear(node.id)}
                            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-600 transition-colors">
                            <X className="w-3 h-3" /> Quitar logo
                        </button>
                    )}
                </div>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400 leading-relaxed">
                Se recortan los espacios vacíos y se ajusta el tamaño automáticamente según la forma del logo.
                Un PNG del Rotary Brand Center, con fondo transparente, es lo que mejor queda.
            </p>

            <div className="mt-3 pt-3 border-t border-gray-100">
                <Slider label={`Tamaño del logo (${Math.round(scale * 100)}%)`}
                    value={scale} min={0.3} max={2.5} step={0.05}
                    onChange={v => patchBox(scaledBox(node, v))} />
                <div className="grid grid-cols-2 gap-3">
                    <Slider label={`Posición horizontal (${Math.round(node.x * 100)}%)`}
                        value={node.x} min={-0.1} max={0.95} step={0.005}
                        onChange={v => onPatch(node.id, { x: v } as Partial<DesignNode>)} />
                    <Slider label={`Posición vertical (${Math.round(node.y * 100)}%)`}
                        value={node.y} min={-0.1} max={0.95} step={0.005}
                        onChange={v => onPatch(node.id, { y: v } as Partial<DesignNode>)} />
                </div>
                <button onClick={() => { const b = resetBox(node); if (b) patchBox(b); }}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-indigo-600 transition-colors">
                    <RotateCcw className="w-3 h-3" /> Restablecer posición y tamaño
                </button>
            </div>

            <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
                <strong className="text-gray-500">La posición y el tamaño se aplican igual al logo que suba el
                público</strong> desde el enlace: lo que manda es una imagen, no un diseño, así que cae exactamente
                en este recuadro. También podés arrastrarlo en la mesa de trabajo.
            </p>

            {/* El circuito no se cierra solo, y callarlo es el defecto: publicar
                CONGELA el diseño, así que un enlace ya compartido sigue mostrando
                lo que se publicó aquella vez. Sin esta línea, el administrador
                ajusta el logotipo, mira el enlace, no ve ningún cambio y no tiene
                cómo saber por qué. */}
            {esCampoPublico ? (
                <p className="mt-1.5 flex gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                        Para que el cambio llegue al enlace público hay que volver a <strong>Publicar</strong>:
                        una plantilla publicada queda congelada tal como estaba, así que los enlaces ya
                        compartidos no cambian solos.
                    </span>
                </p>
            ) : (
                <p className="mt-1.5 flex gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                        Este logotipo está <strong>fijo</strong>: quien use el enlace público no lo va a poder
                        cambiar. Para que sí pueda, seleccionalo en la mesa de trabajo y en{' '}
                        <strong>Propiedades → Campo vinculado</strong> elegí «Logotipo del club».
                    </span>
                </p>
            )}
            <p className="mt-1.5 text-[10px] text-gray-400 leading-relaxed">
                La firma del Distrito —el Gobernador y el periodo, sobre la curva azul del pie— es otra cosa y
                no se toca desde el portal.
            </p>
        </>
    );
};

export default LogoHeaderPanel;
