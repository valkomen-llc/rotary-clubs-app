// ════════════════════════════════════════════════════════════════════
// Plantillas IA — capas, propiedades y biblioteca de elementos (derecha)
// v4.720.0
//
// Tres pestañas sobre la MISMA selección. Está a la derecha, y no dentro de la
// mesa de trabajo, por la razón de siempre: un panel flotante sobre el lienzo
// tapa justo lo que se está editando.
// ════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
    Layers, SlidersHorizontal, Shapes, Eye, EyeOff, Lock, Unlock,
    ChevronUp, ChevronDown, Type, Image as ImageIcon, Square, Trash2,
    AlignLeft, AlignCenter, AlignRight, Copy, Upload, Images, Loader2,
    SendToBack, BringToFront,
} from 'lucide-react';
import {
    isText, isImage, isShape, isGradient, FONTS, PALETTE,
    type DesignNode, type TextNode, type ImageNode, type ShapeNode,
} from '../../../lib/designSpec';
import type { ElementGroup, ElementItem, AssignableField } from './designApi';

// La clave pública de un nodo: para un texto es la variable que ocupa TODO su
// contenido (`{{mensaje}}`); para una imagen, su `srcVar`. Se lee del propio
// nodo en vez de guardarse aparte — dos verdades sobre lo mismo se contradicen
// en cuanto alguien edita el texto.
const SOLA_VARIABLE = /^\s*\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}\s*$/;
const publicKeyOf = (n: DesignNode): string | null => {
    if (isImage(n)) return n.srcVar || null;
    if (isText(n)) return SOLA_VARIABLE.exec(n.srcText || '')?.[1] || null;
    return null;
};

interface Props {
    nodes: DesignNode[];
    selectedIds: string[];
    elements: ElementGroup[];
    onSelect: (ids: string[]) => void;
    onPatch: (id: string, patch: Partial<DesignNode>) => void;
    onReorder: (id: string, dir: -1 | 1) => void;
    /** Al fondo o al frente de una vez. Con una plantilla de doce capas, subir
     *  una imagen de fondo un paso a la vez son doce clics. */
    onSendTo: (id: string, where: 'back' | 'front') => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onAddElement: (el: ElementItem) => void;
    onAddText: () => void;
    /** Agregar una imagen como capa nueva, eligiéndola de la Biblioteca. */
    onAddImage: () => void;
    /** Lo mismo, subiendo un archivo del disco. Las DOS vías, siempre (v4.700). */
    onUploadImage: (file: File | undefined) => void;
    /** Cambiar la imagen de un nodo que ya existe, desde la Biblioteca. */
    onReplaceImage: (id: string) => void;
    onUploadReplacement: (id: string, file: File | undefined) => void;
    uploading: boolean;
    /** Las claves que se pueden asignar a mano, del catálogo del servidor. */
    assignable: AssignableField[];
    /** Marca (o desmarca) un nodo como campo del formulario público. */
    onSetPublicKey: (id: string, key: string | null) => void;
}

const lbl = 'block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1';
const inp = 'w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="mb-3"><span className={lbl}>{label}</span>{children}</div>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void }> =
    ({ label, value, min, max, step, suffix = '', onChange }) => (
        <Row label={`${label} (${Math.round(value * 100) / 100}${suffix})`}>
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-indigo-600" />
        </Row>
    );

const nodeIcon = (n: DesignNode) => isText(n) ? <Type className="w-3.5 h-3.5" /> : isImage(n) ? <ImageIcon className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />;
const nodeLabel = (n: DesignNode) => n.name || (isText(n) ? (n.text.slice(0, 22) || 'Texto') : isImage(n) ? 'Imagen' : 'Forma');

const DesignInspector: React.FC<Props> = ({
    nodes, selectedIds, elements, onSelect, onPatch, onReorder, onDelete, onDuplicate, onAddElement, onAddText,
    onAddImage, onUploadImage, onReplaceImage, onUploadReplacement, uploading,
    assignable, onSetPublicKey, onSendTo,
}) => {
    const assignableFor = (kind: 'text' | 'image') => assignable.filter(f => f.forNode === kind);
    const [tab, setTab] = useState<'props' | 'layers' | 'elements'>('props');
    const node = selectedIds.length === 1 ? nodes.find(n => n.id === selectedIds[0]) || null : null;

    const patch = (p: Partial<DesignNode>) => { if (node) onPatch(node.id, p); };

    return (
        <aside className="w-full lg:w-[300px] shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
            <div className="flex border-b border-gray-200 shrink-0">
                {([
                    ['props', 'Propiedades', <SlidersHorizontal key="a" className="w-3.5 h-3.5" />],
                    ['layers', 'Capas', <Layers key="b" className="w-3.5 h-3.5" />],
                    ['elements', 'Elementos', <Shapes key="c" className="w-3.5 h-3.5" />],
                ] as const).map(([id, label, icon]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-colors ${tab === id ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-800'}`}>
                        {icon}{label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {/* ── Propiedades ──────────────────────────────────── */}
                {tab === 'props' && (!node ? (
                    <p className="text-xs text-gray-400 text-center py-8">
                        {selectedIds.length > 1 ? `${selectedIds.length} elementos seleccionados. Elegí uno para ver sus propiedades.` : 'Seleccioná un elemento en la mesa de trabajo.'}
                    </p>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <span className="flex items-center gap-1.5 text-xs font-black text-gray-800">{nodeIcon(node)}{nodeLabel(node)}</span>
                            <div className="flex gap-1">
                                <button onClick={() => onDuplicate(node.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Duplicar"><Copy className="w-3.5 h-3.5" /></button>
                                <button onClick={() => patch({ locked: !node.locked })} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={node.locked ? 'Desbloquear' : 'Bloquear'}>
                                    {node.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => onSendTo(node.id, 'back')} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Enviar al fondo"><SendToBack className="w-3.5 h-3.5" /></button>
                                <button onClick={() => onSendTo(node.id, 'front')} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Traer al frente"><BringToFront className="w-3.5 h-3.5" /></button>
                                <button onClick={() => onDelete(node.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>

                        {isText(node) && (() => {
                            const t = node as TextNode;
                            return (
                                <>
                                    <Row label="Texto">
                                        <textarea className={`${inp} min-h-[70px] resize-y`} value={t.text} onChange={e => patch({ text: e.target.value } as Partial<DesignNode>)} />
                                    </Row>
                                    <Row label="Tipografía">
                                        <select className={inp} value={t.fontFamily} onChange={e => patch({ fontFamily: e.target.value } as Partial<DesignNode>)}>
                                            {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                                        </select>
                                    </Row>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Row label="Grosor">
                                            <select className={inp} value={t.fontWeight} onChange={e => patch({ fontWeight: +e.target.value } as Partial<DesignNode>)}>
                                                {[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
                                            </select>
                                        </Row>
                                        <Row label="Color">
                                            <input type="color" className="w-full h-[34px] rounded-md border border-gray-300 cursor-pointer"
                                                value={t.color} onChange={e => patch({ color: e.target.value } as Partial<DesignNode>)} />
                                        </Row>
                                    </div>
                                    {/* El tamaño es fracción del ANCHO del lienzo — el mismo
                                        criterio que los `sizes` del pendón. Se muestra en
                                        porcentaje porque «0.046» no le dice nada a nadie. */}
                                    <Slider label="Tamaño" suffix="%" value={t.fontSize * 100} min={0.5} max={18} step={0.1}
                                        onChange={v => patch({ fontSize: v / 100 } as Partial<DesignNode>)} />
                                    <Slider label="Interlineado" value={t.lineHeight} min={0.8} max={2.4} step={0.02}
                                        onChange={v => patch({ lineHeight: v } as Partial<DesignNode>)} />
                                    <Slider label="Espaciado" suffix="%" value={t.letterSpacing * 100} min={-1} max={5} step={0.05}
                                        onChange={v => patch({ letterSpacing: v / 100 } as Partial<DesignNode>)} />
                                    <Row label="Alineación">
                                        <div className="flex gap-1">
                                            {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                                                <button key={a} onClick={() => patch({ align: a } as Partial<DesignNode>)}
                                                    className={`flex-1 py-1.5 rounded-md border flex items-center justify-center ${t.align === a ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                                    <Icon className="w-3.5 h-3.5" />
                                                </button>
                                            ))}
                                        </div>
                                    </Row>
                                    <Row label="Vertical">
                                        <select className={inp} value={t.valign} onChange={e => patch({ valign: e.target.value as TextNode['valign'] } as Partial<DesignNode>)}>
                                            <option value="top">Arriba</option><option value="middle">Centro</option><option value="bottom">Abajo</option>
                                        </select>
                                    </Row>
                                    <div className="flex gap-3 mb-3">
                                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                            <input type="checkbox" checked={t.uppercase} onChange={e => patch({ uppercase: e.target.checked } as Partial<DesignNode>)} /> Mayúsculas
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                            <input type="checkbox" checked={t.italic} onChange={e => patch({ italic: e.target.checked } as Partial<DesignNode>)} /> Cursiva
                                        </label>
                                    </div>
                                    <label className="flex items-start gap-1.5 text-xs text-gray-600 mb-3">
                                        <input type="checkbox" className="mt-0.5" checked={t.autoFit} onChange={e => patch({ autoFit: e.target.checked } as Partial<DesignNode>)} />
                                        <span>Ajustar al recuadro
                                            <span className="block text-[10px] text-gray-400">Baja el tamaño si el texto no entra. Sin esto, un nombre largo se sale de la pieza.</span>
                                        </span>
                                    </label>
                                </>
                            );
                        })()}

                        {isImage(node) && (() => {
                            const im = node as ImageNode;
                            return (
                                <>
                                    {/* Cambiar la imagen de ESTA capa, por las dos vías. */}
                                    <Row label="Imagen">
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-gray-300 hover:border-indigo-400 rounded-md px-2 py-1.5 text-gray-700 cursor-pointer transition-colors">
                                                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Subir
                                                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                                                    onChange={e => { onUploadReplacement(node.id, e.target.files?.[0]); e.target.value = ''; }} />
                                            </label>
                                            <button onClick={() => onReplaceImage(node.id)}
                                                className="flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-gray-300 hover:border-indigo-400 rounded-md px-2 py-1.5 text-gray-700 transition-colors">
                                                <Images className="w-3 h-3" /> Biblioteca
                                            </button>
                                        </div>
                                    </Row>
                                    <Row label="Encuadre">
                                        <select className={inp} value={im.fit} onChange={e => patch({ fit: e.target.value as ImageNode['fit'] } as Partial<DesignNode>)}>
                                            <option value="cover">Llenar (recorta)</option>
                                            <option value="contain">Entrar completa</option>
                                        </select>
                                    </Row>
                                    <Slider label="Esquinas" value={im.radius} min={0} max={0.5} step={0.01}
                                        onChange={v => patch({ radius: v } as Partial<DesignNode>)} />
                                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-3">
                                        <input type="checkbox" checked={!!im.circle} onChange={e => patch({ circle: e.target.checked } as Partial<DesignNode>)} /> Recortar en círculo
                                    </label>
                                    <p className="text-[10px] text-gray-400 mb-3">
                                        La fotografía viaja intacta: se encuadra y se recorta al recuadro, sin filtros ni corrección de color.
                                    </p>
                                </>
                            );
                        })()}

                        {isShape(node) && (() => {
                            const s = node as ShapeNode;
                            return (
                                <>
                                    <Row label="Relleno">
                                        {isGradient(s.fill) ? (
                                            <div className="text-[11px] text-gray-500 border border-gray-200 rounded-md p-2">
                                                Degradado de {s.fill.stops.length} tonos
                                                <button onClick={() => patch({ fill: PALETTE.gold } as Partial<DesignNode>)}
                                                    className="ml-2 font-bold text-indigo-600 hover:underline">Usar color plano</button>
                                            </div>
                                        ) : (
                                            <input type="color" className="w-full h-[34px] rounded-md border border-gray-300 cursor-pointer"
                                                value={s.fill} onChange={e => patch({ fill: e.target.value } as Partial<DesignNode>)} />
                                        )}
                                    </Row>
                                    {!s.path && (
                                        <Slider label="Esquinas" value={s.radius} min={0} max={0.5} step={0.01}
                                            onChange={v => patch({ radius: v } as Partial<DesignNode>)} />
                                    )}
                                </>
                            );
                        })()}

                        <Slider label="Opacidad" suffix="%" value={node.opacity * 100} min={0} max={100} step={1}
                            onChange={v => patch({ opacity: v / 100 })} />
                        <Slider label="Rotación" suffix="°" value={node.rotation} min={0} max={359} step={1}
                            onChange={v => patch({ rotation: v })} />

                        {/* ── Editable en el portal público ────────────────
                            Marcar un elemento acá es lo que lo convierte en un
                            campo del formulario público. Hasta v4.722 no
                            existía: los campos sólo aparecían si el diseño venía
                            de una plantilla del catálogo, así que un texto
                            agregado a mano nunca era editable y corregir a mano
                            el de una plantilla lo sacaba del formulario en
                            silencio. */}
                        {(isText(node) || isImage(node)) && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <span className={lbl}>Editable en el portal público</span>
                                <select
                                    className={inp}
                                    value={publicKeyOf(node) || ''}
                                    onChange={e => onSetPublicKey(node.id, e.target.value || null)}
                                >
                                    <option value="">No — queda fijo en la pieza</option>
                                    {assignableFor(isImage(node) ? 'image' : 'text').map(f => (
                                        <option key={f.key} value={f.key}>{f.label}</option>
                                    ))}
                                </select>
                                <p className="mt-1 text-[10px] text-gray-400 leading-relaxed">
                                    {publicKeyOf(node)
                                        ? 'Quien abra el enlace público va a poder cambiarlo. El resto del diseño no.'
                                        : isText(node)
                                            ? 'Al marcarlo, el texto de este elemento lo escribe quien use el enlace.'
                                            : 'Al marcarlo, la imagen la sube quien use el enlace.'}
                                </p>
                            </div>
                        )}
                    </>
                ))}

                {/* ── Capas ────────────────────────────────────────── */}
                {tab === 'layers' && (
                    <>
                        <button onClick={onAddText} className="w-full mb-2 text-xs font-bold border border-dashed border-gray-300 hover:border-indigo-400 rounded-lg py-2 text-gray-600 transition-colors">
                            + Agregar texto
                        </button>
                        {/* Una imagen como CAPA propia: se coloca donde se
                            quiera y se bloquea, que es lo que hace falta para
                            fijar un sello o una firma dentro de la plantilla.
                            Las dos vías, como en todas las casillas del panel. */}
                        <div className="grid grid-cols-2 gap-2 mb-1">
                            <label className="flex items-center justify-center gap-1.5 text-xs font-bold border border-dashed border-gray-300 hover:border-indigo-400 rounded-lg py-2 text-gray-600 cursor-pointer transition-colors">
                                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                {uploading ? 'Subiendo…' : 'Subir imagen'}
                                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                                    onChange={e => { onUploadImage(e.target.files?.[0]); e.target.value = ''; }} />
                            </label>
                            <button onClick={onAddImage} className="flex items-center justify-center gap-1.5 text-xs font-bold border border-dashed border-gray-300 hover:border-indigo-400 rounded-lg py-2 text-gray-600 transition-colors">
                                <Images className="w-3.5 h-3.5" /> Biblioteca
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mb-3">
                            La imagen entra como capa: colocala y bloqueala con el candado para que no se mueva.
                        </p>
                        <p className="text-[10px] text-gray-400 mb-2">Arriba en la lista = adelante en la pieza.</p>
                        <div className="space-y-1">
                            {[...nodes].reverse().map(n => (
                                <div key={n.id}
                                    className={`flex items-center gap-1 rounded-md border px-2 py-1.5 cursor-pointer ${selectedIds.includes(n.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                                    onClick={() => onSelect([n.id])}>
                                    <span className="text-gray-400 shrink-0">{nodeIcon(n)}</span>
                                    <span className={`flex-1 text-xs truncate ${n.hidden ? 'text-gray-300 line-through' : 'text-gray-700'}`}>{nodeLabel(n)}</span>
                                    <button onClick={e => { e.stopPropagation(); onReorder(n.id, 1); }} className="p-0.5 text-gray-400 hover:text-gray-700" title="Traer al frente"><ChevronUp className="w-3.5 h-3.5" /></button>
                                    <button onClick={e => { e.stopPropagation(); onReorder(n.id, -1); }} className="p-0.5 text-gray-400 hover:text-gray-700" title="Enviar atrás"><ChevronDown className="w-3.5 h-3.5" /></button>
                                    <button onClick={e => { e.stopPropagation(); onPatch(n.id, { hidden: !n.hidden }); }} className="p-0.5 text-gray-400 hover:text-gray-700" title={n.hidden ? 'Mostrar' : 'Ocultar'}>
                                        {n.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); onPatch(n.id, { locked: !n.locked }); }} className="p-0.5 text-gray-400 hover:text-gray-700" title={n.locked ? 'Desbloquear' : 'Bloquear'}>
                                        {n.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* ── Elementos ────────────────────────────────────── */}
                {tab === 'elements' && (
                    <>
                        {elements.map(group => (
                            <div key={group.id} className="mb-5">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">{group.label}</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {group.items.map(el => (
                                        <button key={el.id} onClick={() => onAddElement(el)} title={el.label}
                                            className="aspect-square rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 flex items-center justify-center p-2 transition-colors">
                                            <svg viewBox="0 0 100 100" className="w-full h-full">
                                                <path d={el.path || 'M0 0 H100 V100 H0 Z'} fill={el.defaultFill} fillRule="evenodd" />
                                            </svg>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                            El emblema de Rotary no está acá: es una marca registrada y su reproducción sale
                            del Brand Center. Se agrega como imagen, igual que el logotipo del club.
                        </p>
                    </>
                )}
            </div>
        </aside>
    );
};

export default DesignInspector;
