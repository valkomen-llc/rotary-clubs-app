import React, { useState } from 'react';
import {
    Type, Heading1, Image as ImageIcon, MousePointer2, Columns2, Minus,
    MoveVertical, Share2, Play, Code2, Trash2, Copy, ChevronUp, ChevronDown,
    GripVertical, Palette, Eye, Pencil, Monitor, Tablet, Smartphone, Plus, X, Library,
} from 'lucide-react';
import MediaPicker from '../content-studio/MediaPicker';
import {
    EmailDesign, Block, BlockType, ColumnCell, SocialNetwork,
    makeBlock, renderDesignToHtml, BLOCK_LABELS, FONT_OPTIONS,
} from '../../../lib/emailBlocks';

interface Props {
    design: EmailDesign;
    onChange: (design: EmailDesign) => void;
}

const PALETTE: { type: BlockType; icon: React.ElementType }[] = [
    { type: 'heading', icon: Heading1 },
    { type: 'text', icon: Type },
    { type: 'image', icon: ImageIcon },
    { type: 'button', icon: MousePointer2 },
    { type: 'columns', icon: Columns2 },
    { type: 'divider', icon: Minus },
    { type: 'spacer', icon: MoveVertical },
    { type: 'social', icon: Share2 },
    { type: 'video', icon: Play },
    { type: 'html', icon: Code2 },
];

const SOCIAL_NETWORKS: SocialNetwork[] = ['facebook', 'instagram', 'x', 'linkedin', 'youtube', 'whatsapp', 'web'];
const DEVICE_W = { desktop: 600, tablet: 480, mobile: 360 } as const;
type Device = keyof typeof DEVICE_W;

const inputCls = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue outline-none';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
        {children}
    </div>
);

const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
    <Field label={label}>
        <div className="flex items-center gap-2">
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer bg-white p-0.5" />
            <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
        </div>
    </Field>
);

const AlignField: React.FC<{ value: string; onChange: (v: 'left' | 'center' | 'right') => void }> = ({ value, onChange }) => (
    <Field label="Alineación">
        <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
            {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} type="button" onClick={() => onChange(a)}
                    className={`px-3 py-1 text-xs font-bold rounded-md capitalize ${value === a ? 'bg-white text-rotary-blue shadow-sm' : 'text-gray-500'}`}>
                    {a === 'left' ? 'Izq.' : a === 'center' ? 'Centro' : 'Der.'}
                </button>
            ))}
        </div>
    </Field>
);

const EmailBuilder: React.FC<Props> = ({ design, onChange }) => {
    const [selectedId, setSelectedId] = useState<string | null>(design.blocks[0]?.id ?? null);
    const [showGlobal, setShowGlobal] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const [device, setDevice] = useState<Device>('desktop');
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [picker, setPicker] = useState<{ open: boolean; apply: (url: string) => void }>({ open: false, apply: () => {} });

    const blocks = design.blocks;
    const selected = blocks.find((b) => b.id === selectedId) || null;

    const commit = (next: Partial<EmailDesign>) => onChange({ ...design, ...next });
    const setBlocks = (next: Block[]) => commit({ blocks: next });
    const updateBlock = (id: string, patch: Partial<Block>) =>
        setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));

    const addBlock = (type: BlockType) => {
        const b = makeBlock(type);
        const idx = selected ? blocks.findIndex((x) => x.id === selected.id) + 1 : blocks.length;
        const next = [...blocks];
        next.splice(idx, 0, b);
        setBlocks(next);
        setSelectedId(b.id);
        setShowGlobal(false);
    };
    const removeBlock = (id: string) => {
        setBlocks(blocks.filter((b) => b.id !== id));
        if (selectedId === id) setSelectedId(null);
    };
    const duplicateBlock = (id: string) => {
        const idx = blocks.findIndex((b) => b.id === id);
        if (idx < 0) return;
        const copy = { ...blocks[idx], id: makeBlock('text').id } as Block;
        const next = [...blocks];
        next.splice(idx + 1, 0, copy);
        setBlocks(next);
        setSelectedId(copy.id);
    };
    const move = (from: number, to: number) => {
        if (to < 0 || to >= blocks.length) return;
        const next = [...blocks];
        const [it] = next.splice(from, 1);
        next.splice(to, 0, it);
        setBlocks(next);
    };

    const openPicker = (apply: (url: string) => void) => setPicker({ open: true, apply });

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
            {/* Barra superior: paleta + preview/dispositivo */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-gray-100">
                {!previewMode && PALETTE.map((p) => (
                    <button key={p.type} type="button" onClick={() => addBlock(p.type)}
                        title={`Agregar ${BLOCK_LABELS[p.type]}`}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-gray-600 hover:text-rotary-blue hover:bg-sky-50 border border-transparent hover:border-blue-100 transition-all">
                        <p.icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{BLOCK_LABELS[p.type]}</span>
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                    {previewMode && (
                        <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
                            {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Ic]) => (
                                <button key={d} type="button" onClick={() => setDevice(d)}
                                    className={`p-1.5 rounded-md ${device === d ? 'bg-white text-rotary-blue shadow-sm' : 'text-gray-400'}`}><Ic className="w-4 h-4" /></button>
                            ))}
                        </div>
                    )}
                    <button type="button" onClick={() => { setShowGlobal(true); setPreviewMode(false); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100" title="Estilos globales">
                        <Palette className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Estilos</span>
                    </button>
                    <button type="button" onClick={() => setPreviewMode(!previewMode)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-rotary-blue hover:bg-sky-800">
                        {previewMode ? <><Pencil className="w-3.5 h-3.5" /> Editar</> : <><Eye className="w-3.5 h-3.5" /> Vista previa</>}
                    </button>
                </div>
            </div>

            {previewMode ? (
                <div className="p-4 overflow-auto max-h-[52vh] flex justify-center">
                    <div style={{ width: DEVICE_W[device], maxWidth: '100%' }} className="shadow-lg rounded-lg overflow-hidden bg-white transition-all"
                        dangerouslySetInnerHTML={{ __html: renderDesignToHtml(design) }} />
                </div>
            ) : (
                <div className="grid lg:grid-cols-5 gap-0">
                    {/* Canvas */}
                    <div className="lg:col-span-3 p-3 space-y-2 overflow-auto max-h-[52vh] border-r border-gray-100">
                        {blocks.length === 0 && (
                            <div className="text-center text-gray-400 text-sm py-10">Agrega bloques desde la barra superior.</div>
                        )}
                        {blocks.map((b, i) => (
                            <div key={b.id}
                                draggable
                                onDragStart={() => setDragIndex(i)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => { if (dragIndex !== null && dragIndex !== i) move(dragIndex, i); setDragIndex(null); }}
                                onClick={() => { setSelectedId(b.id); setShowGlobal(false); }}
                                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border cursor-pointer transition-all ${selectedId === b.id && !showGlobal ? 'border-rotary-blue ring-1 ring-rotary-blue' : 'border-gray-200 hover:border-gray-300'} ${dragIndex === i ? 'opacity-40' : ''}`}>
                                <GripVertical className="w-4 h-4 text-gray-300 cursor-grab shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-gray-700">{BLOCK_LABELS[b.type]}</p>
                                    <p className="text-[11px] text-gray-400 truncate">{blockSummary(b)}</p>
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); move(i, i - 1); }} className="p-1 text-gray-400 hover:text-gray-700" title="Subir"><ChevronUp className="w-3.5 h-3.5" /></button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); move(i, i + 1); }} className="p-1 text-gray-400 hover:text-gray-700" title="Bajar"><ChevronDown className="w-3.5 h-3.5" /></button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); duplicateBlock(b.id); }} className="p-1 text-gray-400 hover:text-rotary-blue" title="Duplicar"><Copy className="w-3.5 h-3.5" /></button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }} className="p-1 text-gray-400 hover:text-rose-500" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Panel de ajustes */}
                    <div className="lg:col-span-2 p-4 space-y-3 overflow-auto max-h-[52vh] bg-white">
                        {showGlobal ? (
                            <GlobalSettings design={design} commit={commit} onPickImage={openPicker} />
                        ) : selected ? (
                            <BlockSettings block={selected} update={(patch) => updateBlock(selected.id, patch)} onPickImage={openPicker} />
                        ) : (
                            <div className="text-center text-gray-400 text-sm py-10">Selecciona un bloque para editarlo, o abre <strong>Estilos</strong> globales.</div>
                        )}
                    </div>
                </div>
            )}

            {picker.open && (
                <MediaPicker
                    isOpen={picker.open}
                    onClose={() => setPicker({ open: false, apply: () => {} })}
                    maxSelection={1}
                    onSelect={(items) => {
                        const url = items?.[0]?.url;
                        if (url) picker.apply(url);
                        setPicker({ open: false, apply: () => {} });
                    }}
                />
            )}
        </div>
    );
};

const blockSummary = (b: Block): string => {
    switch (b.type) {
        case 'heading': return b.text;
        case 'text': return b.text;
        case 'image': return b.url ? b.url.split('/').pop() || 'Imagen' : 'Sin imagen';
        case 'button': return `${b.text} → ${b.href}`;
        case 'divider': return 'Línea separadora';
        case 'spacer': return `${b.height}px de espacio`;
        case 'social': return `${(b.links || []).length} red(es)`;
        case 'video': return b.title;
        case 'html': return 'Bloque HTML';
        case 'columns': return `${b.left.kind} · ${b.right.kind}`;
        default: return '';
    }
};

const GlobalSettings: React.FC<{ design: EmailDesign; commit: (n: Partial<EmailDesign>) => void; onPickImage: (a: (url: string) => void) => void }> = ({ design, commit }) => {
    const s = design.settings;
    const set = (patch: Partial<typeof s>) => commit({ settings: { ...s, ...patch } });
    return (
        <div className="space-y-3">
            <p className="text-sm font-black text-gray-800 flex items-center gap-1.5"><Palette className="w-4 h-4 text-rotary-blue" /> Estilos globales</p>
            <Field label="Tipografía">
                <select value={s.font} onChange={(e) => set({ font: e.target.value })} className={inputCls}>
                    {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
            </Field>
            <ColorField label="Fondo exterior" value={s.bg} onChange={(v) => set({ bg: v })} />
            <ColorField label="Fondo del contenido" value={s.contentBg} onChange={(v) => set({ contentBg: v })} />
            <ColorField label="Color de texto" value={s.textColor} onChange={(v) => set({ textColor: v })} />
            <ColorField label="Color de enlaces" value={s.linkColor} onChange={(v) => set({ linkColor: v })} />
            <Field label={`Ancho del contenido (${s.width}px)`}>
                <input type="range" min={480} max={640} step={20} value={s.width} onChange={(e) => set({ width: Number(e.target.value) })} className="w-full accent-rotary-blue" />
            </Field>
        </div>
    );
};

const BlockSettings: React.FC<{ block: Block; update: (patch: Partial<Block>) => void; onPickImage: (a: (url: string) => void) => void }> = ({ block: b, update, onPickImage }) => {
    const title = <p className="text-sm font-black text-gray-800">{BLOCK_LABELS[b.type]}</p>;
    switch (b.type) {
        case 'heading':
            return <div className="space-y-3">{title}
                <Field label="Texto"><input className={inputCls} value={b.text} onChange={(e) => update({ text: e.target.value })} /></Field>
                <Field label="Nivel">
                    <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
                        {([1, 2, 3] as const).map((l) => <button key={l} type="button" onClick={() => update({ level: l })} className={`px-3 py-1 text-xs font-bold rounded-md ${b.level === l ? 'bg-white text-rotary-blue shadow-sm' : 'text-gray-500'}`}>H{l}</button>)}
                    </div>
                </Field>
                <AlignField value={b.align} onChange={(align) => update({ align })} />
                <ColorField label="Color" value={b.color} onChange={(color) => update({ color })} />
            </div>;
        case 'text':
            return <div className="space-y-3">{title}
                <Field label="Contenido"><textarea rows={6} className={inputCls} value={b.text} onChange={(e) => update({ text: e.target.value })} /></Field>
                <Field label={`Tamaño (${b.size}px)`}><input type="range" min={12} max={22} value={b.size} onChange={(e) => update({ size: Number(e.target.value) })} className="w-full accent-rotary-blue" /></Field>
                <AlignField value={b.align} onChange={(align) => update({ align })} />
                <ColorField label="Color" value={b.color} onChange={(color) => update({ color })} />
            </div>;
        case 'image':
            return <div className="space-y-3">{title}
                <div className="flex gap-2">
                    <input className={inputCls} placeholder="URL de la imagen" value={b.url} onChange={(e) => update({ url: e.target.value })} />
                    <button type="button" onClick={() => onPickImage((url) => update({ url }))} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rotary-blue bg-sky-50 border border-blue-100 hover:bg-sky-100"><Library className="w-3.5 h-3.5" /> Biblioteca</button>
                </div>
                <Field label="Texto alternativo"><input className={inputCls} value={b.alt} onChange={(e) => update({ alt: e.target.value })} /></Field>
                <Field label="Enlace al hacer clic (opcional)"><input className={inputCls} placeholder="https://" value={b.href} onChange={(e) => update({ href: e.target.value })} /></Field>
                <Field label={`Ancho (${b.width}%)`}><input type="range" min={20} max={100} value={b.width} onChange={(e) => update({ width: Number(e.target.value) })} className="w-full accent-rotary-blue" /></Field>
                <Field label={`Redondeo (${b.radius}px)`}><input type="range" min={0} max={32} value={b.radius} onChange={(e) => update({ radius: Number(e.target.value) })} className="w-full accent-rotary-blue" /></Field>
                <AlignField value={b.align} onChange={(align) => update({ align })} />
            </div>;
        case 'button':
            return <div className="space-y-3">{title}
                <Field label="Texto"><input className={inputCls} value={b.text} onChange={(e) => update({ text: e.target.value })} /></Field>
                <Field label="Enlace"><input className={inputCls} placeholder="https://" value={b.href} onChange={(e) => update({ href: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-2">
                    <ColorField label="Fondo" value={b.bg} onChange={(bg) => update({ bg })} />
                    <ColorField label="Texto" value={b.color} onChange={(color) => update({ color })} />
                </div>
                <Field label={`Redondeo (${b.radius}px)`}><input type="range" min={0} max={40} value={b.radius} onChange={(e) => update({ radius: Number(e.target.value) })} className="w-full accent-rotary-blue" /></Field>
                <AlignField value={b.align} onChange={(align) => update({ align })} />
            </div>;
        case 'divider':
            return <div className="space-y-3">{title}
                <ColorField label="Color" value={b.color} onChange={(color) => update({ color })} />
                <Field label={`Grosor (${b.thickness}px)`}><input type="range" min={1} max={8} value={b.thickness} onChange={(e) => update({ thickness: Number(e.target.value) })} className="w-full accent-rotary-blue" /></Field>
            </div>;
        case 'spacer':
            return <div className="space-y-3">{title}
                <Field label={`Altura (${b.height}px)`}><input type="range" min={8} max={96} step={4} value={b.height} onChange={(e) => update({ height: Number(e.target.value) })} className="w-full accent-rotary-blue" /></Field>
            </div>;
        case 'social':
            return <div className="space-y-3">{title}
                <AlignField value={b.align} onChange={(align) => update({ align })} />
                <ColorField label="Color de íconos" value={b.color} onChange={(color) => update({ color })} />
                <Field label="Redes">
                    <div className="space-y-2">
                        {b.links.map((l, i) => (
                            <div key={i} className="flex gap-1.5 items-center">
                                <select value={l.network} onChange={(e) => update({ links: b.links.map((x, j) => j === i ? { ...x, network: e.target.value as SocialNetwork } : x) })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs capitalize">
                                    {SOCIAL_NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <input className={inputCls} placeholder="https://" value={l.url} onChange={(e) => update({ links: b.links.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} />
                                <button type="button" onClick={() => update({ links: b.links.filter((_, j) => j !== i) })} className="p-1 text-gray-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
                            </div>
                        ))}
                        <button type="button" onClick={() => update({ links: [...b.links, { network: 'web', url: 'https://' }] })} className="flex items-center gap-1 text-xs font-bold text-rotary-blue"><Plus className="w-3.5 h-3.5" /> Agregar red</button>
                    </div>
                </Field>
            </div>;
        case 'video':
            return <div className="space-y-3">{title}
                <Field label="Enlace del video"><input className={inputCls} placeholder="https://youtu.be/..." value={b.url} onChange={(e) => update({ url: e.target.value })} /></Field>
                <div className="flex gap-2">
                    <input className={inputCls} placeholder="URL de la miniatura" value={b.thumbnail} onChange={(e) => update({ thumbnail: e.target.value })} />
                    <button type="button" onClick={() => onPickImage((url) => update({ thumbnail: url }))} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rotary-blue bg-sky-50 border border-blue-100 hover:bg-sky-100"><Library className="w-3.5 h-3.5" /></button>
                </div>
                <Field label="Título / llamado"><input className={inputCls} value={b.title} onChange={(e) => update({ title: e.target.value })} /></Field>
                <AlignField value={b.align} onChange={(align) => update({ align })} />
            </div>;
        case 'html':
            return <div className="space-y-3">{title}
                <Field label="HTML"><textarea rows={8} className={`${inputCls} font-mono`} value={b.html} onChange={(e) => update({ html: e.target.value })} /></Field>
            </div>;
        case 'columns':
            return <div className="space-y-3">{title}
                <ColumnEditor label="Columna izquierda" cell={b.left} onChange={(left) => update({ left })} onPickImage={onPickImage} />
                <ColumnEditor label="Columna derecha" cell={b.right} onChange={(right) => update({ right })} onPickImage={onPickImage} />
            </div>;
        default:
            return <div>{title}</div>;
    }
};

const ColumnEditor: React.FC<{ label: string; cell: ColumnCell; onChange: (c: ColumnCell) => void; onPickImage: (a: (url: string) => void) => void }> = ({ label, cell, onChange, onPickImage }) => (
    <div className="border border-gray-100 rounded-lg p-2.5 space-y-2 bg-gray-50">
        <div className="flex items-center justify-between">
            <p className="text-[11px] font-black text-gray-600 uppercase">{label}</p>
            <div className="inline-flex bg-white rounded-lg p-0.5 gap-0.5 border border-gray-200">
                {(['text', 'image'] as const).map((k) => (
                    <button key={k} type="button" onClick={() => onChange({ ...cell, kind: k })} className={`px-2 py-0.5 text-[11px] font-bold rounded ${cell.kind === k ? 'bg-rotary-blue text-white' : 'text-gray-500'}`}>{k === 'text' ? 'Texto' : 'Imagen'}</button>
                ))}
            </div>
        </div>
        {cell.kind === 'text' ? (
            <textarea rows={3} className={inputCls} value={cell.text || ''} onChange={(e) => onChange({ ...cell, text: e.target.value })} />
        ) : (
            <div className="space-y-1.5">
                <div className="flex gap-1.5">
                    <input className={inputCls} placeholder="URL" value={cell.url || ''} onChange={(e) => onChange({ ...cell, url: e.target.value })} />
                    <button type="button" onClick={() => onPickImage((url) => onChange({ ...cell, url }))} className="shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold text-rotary-blue bg-white border border-blue-100"><Library className="w-3.5 h-3.5" /></button>
                </div>
                <input className={inputCls} placeholder="Enlace (opcional)" value={cell.href || ''} onChange={(e) => onChange({ ...cell, href: e.target.value })} />
            </div>
        )}
    </div>
);

export default EmailBuilder;
