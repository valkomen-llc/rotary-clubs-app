// Diseñador visual de email por bloques (v4.1166).
// Reutiliza el modelo y el render email-safe de `src/lib/emailBlocks.ts`
// (tablas + inline, el mismo que Email Marketing). Sin librerías nuevas:
// paleta, arrastrar/subir/bajar, duplicar, eliminar, ajustes por bloque,
// ajustes globales y vista previa desktop/móvil. La persistencia y las
// plantillas las maneja el padre (PUT /:id/content, /templates).
import React, { useEffect, useMemo, useState } from 'react';
import {
  makeBlock, BLOCK_LABELS, renderDesignToHtml,
  type EmailDesign, type Block, type BlockType, type Align,
} from '../../../../lib/emailBlocks';
import MediaPicker from '../../content-studio/MediaPicker';

const PALETTE: BlockType[] = ['heading', 'text', 'image', 'button', 'columns', 'divider', 'spacer', 'social', 'video', 'html'];
const input = 'w-full border rounded-lg px-2 py-1.5 text-xs';
const mini = 'px-2 py-1 rounded-lg border text-[11px] font-bold hover:bg-gray-50';

// Fila avanzada compartida: espaciado vertical por bloque (0-120px).
const PadRow: React.FC<{ b: any; set: (k: string, v: unknown) => void }> = ({ b, set }) => (
  <div className="flex gap-2 items-center flex-wrap">
    <label className="text-[11px] flex items-center gap-1">Arriba<input type="number" min={0} max={120} className="border rounded-lg px-1 py-1 w-14 text-xs" value={b.padTop ?? ''} placeholder="0" onChange={(e) => set('padTop', e.target.value === '' ? undefined : Math.max(0, Math.min(120, Number(e.target.value))))} /></label>
    <label className="text-[11px] flex items-center gap-1">Abajo<input type="number" min={0} max={120} className="border rounded-lg px-1 py-1 w-14 text-xs" value={b.padBottom ?? ''} placeholder="0" onChange={(e) => set('padBottom', e.target.value === '' ? undefined : Math.max(0, Math.min(120, Number(e.target.value))))} /></label>
  </div>
);

const WeightSeg: React.FC<{ value?: string; defecto?: string; on: (v: string) => void }> = ({ value, defecto = '800', on }) => {
  const cur = value || defecto;
  return (
    <div className="flex gap-1 items-center">
      <span className="text-[11px] text-gray-400">Peso</span>
      {[{ id: 'normal', label: 'Normal' }, { id: 'bold', label: 'Negrita' }, { id: '800', label: 'Muy negra' }].map((o) => (
        <button key={o.id} type="button" onClick={() => on(o.id)}
          className={`px-2 py-1 rounded-lg border text-[11px] font-bold ${cur === o.id ? 'bg-gray-900 text-white border-gray-900' : 'hover:bg-gray-50'}`}>{o.label}</button>
      ))}
    </div>
  );
};

const FONT_OPTIONS = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: 'Helvetica' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
  { value: "'Trebuchet MS', Tahoma, sans-serif", label: 'Trebuchet' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
];

const Seg: React.FC<{ value: string; options: { id: string; label: string }[]; on: (v: string) => void }> = ({ value, options, on }) => (
  <div className="flex gap-1 flex-wrap">
    {options.map((o) => (
      <button key={o.id} type="button" onClick={() => on(o.id)}
        className={`px-2 py-1 rounded-lg border text-[11px] font-bold ${value === o.id ? 'bg-gray-900 text-white border-gray-900' : 'hover:bg-gray-50'}`}>{o.label}</button>
    ))}
  </div>
);

const EditorBloque: React.FC<{ b: Block; on: (patch: Partial<Block>) => void; onPickImage: () => void }> = ({ b, on, onPickImage }) => {
  const set = (k: string, v: unknown) => on({ [k]: v } as Partial<Block>);
  const align = [{ id: 'left', label: 'Izq' }, { id: 'center', label: 'Centro' }, { id: 'right', label: 'Der' }];
  switch (b.type) {
    case 'heading': return (
      <div className="space-y-2">
        <input className={input} value={b.text} onChange={(e) => set('text', e.target.value)} placeholder="Título" />
        <div className="flex gap-2 items-center flex-wrap">
          <Seg value={String(b.level)} options={[{ id: '1', label: 'H1' }, { id: '2', label: 'H2' }, { id: '3', label: 'H3' }]} on={(v) => set('level', Number(v))} />
          <Seg value={b.align} options={align} on={(v) => set('align', v as Align)} />
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#111827'} onChange={(e) => set('color', e.target.value)} title="Color" />
          <WeightSeg value={b.weight} defecto="800" on={(v) => set('weight', v)} />
        </div>
        <PadRow b={b} set={set} />
      </div>
    );
    case 'text': return (
      <div className="space-y-2">
        <textarea className={input} rows={4} value={b.text} onChange={(e) => set('text', e.target.value)} placeholder="Párrafos (línea en blanco separa). Admite {{variables}}." />
        <div className="flex gap-2 items-center flex-wrap">
          <Seg value={b.align} options={align} on={(v) => set('align', v as Align)} />
          <label className="text-[11px] flex items-center gap-1">Tamaño<input type="number" min={11} max={28} className="border rounded-lg px-1 py-1 w-14 text-xs" value={b.size} onChange={(e) => set('size', Number(e.target.value))} /></label>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#333333'} onChange={(e) => set('color', e.target.value)} title="Color" />
          <WeightSeg value={b.weight} defecto="normal" on={(v) => set('weight', v)} />
        </div>
        <PadRow b={b} set={set} />
      </div>
    );
    case 'image': return (
      <div className="space-y-2">
        <input className={input} value={b.url} onChange={(e) => set('url', e.target.value)} placeholder="https://… (banner, logo)" />
        <div className="flex gap-2">
          <button type="button" onClick={onPickImage} className={mini}>Biblioteca…</button>
        </div>
        <input className={input} value={b.alt} onChange={(e) => set('alt', e.target.value)} placeholder="Texto alternativo" />
        <input className={input} value={b.href} onChange={(e) => set('href', e.target.value)} placeholder="Enlace al pulsar (opcional)" />
        <div className="flex gap-2 items-center flex-wrap">
          <Seg value={b.align} options={align} on={(v) => set('align', v as Align)} />
          <label className="text-[11px] flex items-center gap-1">Ancho %<input type="number" min={10} max={100} className="border rounded-lg px-1 py-1 w-14 text-xs" value={b.width} onChange={(e) => set('width', Number(e.target.value))} /></label>
          <label className="text-[11px] flex items-center gap-1">Radio<input type="number" min={0} max={32} className="border rounded-lg px-1 py-1 w-14 text-xs" value={b.radius ?? 8} onChange={(e) => set('radius', Number(e.target.value))} /></label>
        </div>
        <PadRow b={b} set={set} />
        {b.url && <img src={b.url} alt="" className="rounded-lg border max-h-28 object-contain bg-gray-50" />}
      </div>
    );
    case 'button': return (
      <div className="space-y-2">
        <input className={input} value={b.text} onChange={(e) => set('text', e.target.value)} placeholder="Texto del botón" />
        <input className={input} value={b.href} onChange={(e) => set('href', e.target.value)} placeholder="Enlace ({{form_url}} para el formulario)" />
        <div className="flex gap-2 items-center flex-wrap">
          <Seg value={b.align} options={align} on={(v) => set('align', v as Align)} />
          <label className="text-[11px] flex items-center gap-1">Fondo<input type="color" value={/^#[0-9a-f]{6}$/i.test(b.bg) ? b.bg : '#0c3c7c'} onChange={(e) => set('bg', e.target.value)} /></label>
          <label className="text-[11px] flex items-center gap-1">Texto<input type="color" value={/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#ffffff'} onChange={(e) => set('color', e.target.value)} /></label>
          <label className="text-[11px] flex items-center gap-1">Radio<input type="number" min={0} max={32} className="border rounded-lg px-1 py-1 w-14 text-xs" value={b.radius ?? 8} onChange={(e) => set('radius', Number(e.target.value))} /></label>
        </div>
        <PadRow b={b} set={set} />
      </div>
    );
    case 'social': {
      const REDES = ['facebook', 'instagram', 'x', 'linkedin', 'youtube', 'whatsapp', 'web'];
      const links = Array.isArray(b.links) ? b.links : [];
      return (
        <div className="space-y-2">
          {links.map((l: any, i: number) => (
            <div key={i} className="flex gap-1">
              <select className="border rounded-lg px-1 py-1.5 text-xs" value={l.network} onChange={(e) => {
                const nx = links.map((x: any, j: number) => (j === i ? { ...x, network: e.target.value } : x));
                set('links', nx);
              }}>
                {REDES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input className={input} value={l.url || ''} onChange={(e) => {
                const nx = links.map((x: any, j: number) => (j === i ? { ...x, url: e.target.value } : x));
                set('links', nx);
              }} placeholder="https://…" />
              <button type="button" onClick={() => set('links', links.filter((_: any, j: number) => j !== i))} className={`${mini} text-red-600`}>✕</button>
            </div>
          ))}
          <div className="flex gap-2 items-center flex-wrap">
            <button type="button" disabled={links.length >= 7} onClick={() => set('links', [...links, { network: 'web', url: '' }])} className={`${mini} disabled:opacity-50`}>+ Red</button>
            <Seg value={b.align} options={align} on={(v) => set('align', v as Align)} />
            <label className="text-[11px] flex items-center gap-1">Color<input type="color" value={/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#0c3c7c'} onChange={(e) => set('color', e.target.value)} /></label>
          </div>
          <PadRow b={b} set={set} />
        </div>
      );
    }
    case 'video': return (
      <div className="space-y-2">
        <input className={input} value={b.url} onChange={(e) => set('url', e.target.value)} placeholder="URL del video (YouTube, etc.)" />
        <input className={input} value={b.thumbnail || ''} onChange={(e) => set('thumbnail', e.target.value)} placeholder="Miniatura https://… (opcional)" />
        <div className="flex gap-2">
          <button type="button" onClick={onPickImage} className={mini}>Miniatura desde Biblioteca…</button>
        </div>
        <input className={input} value={b.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="Título del video" />
        <div className="flex gap-2 items-center flex-wrap">
          <Seg value={b.align} options={align} on={(v) => set('align', v as Align)} />
        </div>
        <div className="text-[11px] text-gray-400">El correo muestra miniatura + enlace (los clientes de correo no reproducen video inserido).</div>
        <PadRow b={b} set={set} />
      </div>
    );
    case 'html': return (
      <div className="space-y-2">
        <textarea className={`${input} font-mono`} rows={5} value={b.html || ''} onChange={(e) => set('html', e.target.value)} placeholder="<p>HTML propio…</p>" />
        <div className="text-[11px] text-gray-400">Se sanea al guardar/enviar (sin scripts ni estilos externos).</div>
        <PadRow b={b} set={set} />
      </div>
    );
    case 'columns': return (
      <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {(['left', 'right'] as const).map((side) => (
          <div key={side} className="space-y-1 border rounded-lg p-2">
            <div className="text-[10px] font-black text-gray-400 uppercase">{side === 'left' ? 'Izquierda' : 'Derecha'}</div>
            <Seg value={b[side].kind} options={[{ id: 'text', label: 'Texto' }, { id: 'image', label: 'Imagen' }]} on={(v) => set(side, { ...b[side], kind: v })} />
            {b[side].kind === 'text'
              ? <textarea className={input} rows={2} value={b[side].text || ''} onChange={(e) => set(side, { ...b[side], text: e.target.value })} />
              : <input className={input} value={b[side].url || ''} onChange={(e) => set(side, { ...b[side], url: e.target.value })} placeholder="https://…" />}
          </div>
        ))}
      </div>
      <PadRow b={b} set={set} />
      </div>
    );
    case 'divider': return (
      <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <label className="text-[11px] flex items-center gap-1">Grosor<input type="number" min={1} max={8} className="border rounded-lg px-1 py-1 w-14 text-xs" value={b.thickness} onChange={(e) => set('thickness', Number(e.target.value))} /></label>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#e5e7eb'} onChange={(e) => set('color', e.target.value)} />
      </div>
      <PadRow b={b} set={set} />
      </div>
    );
    case 'spacer': return (
      <label className="text-[11px] flex items-center gap-1">Alto (px)<input type="number" min={4} max={120} className="border rounded-lg px-1 py-1 w-16 text-xs" value={b.height} onChange={(e) => set('height', Number(e.target.value))} /></label>
    );
    default: return null;
  }
};

const EmailDesigner: React.FC<{
  design: EmailDesign | null;
  onChange: (d: EmailDesign) => void;
}> = ({ design, onChange }) => {
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [pickFor, setPickFor] = useState<{ id: string; field: string } | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showSettings, setShowSettings] = useState(false);

  // Clic directo sobre el canvas: la vista previa interactiva emite el bloque.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e?.data?.type === 'ca-select-block' && typeof e.data.id === 'string') setSel(e.data.id);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const d: EmailDesign = design || { version: 1, settings: { bg: '#f3f4f6', contentBg: '#ffffff', font: 'Arial, Helvetica, sans-serif', textColor: '#333333', linkColor: '#0c3c7c', width: 600 }, blocks: [] };
  const patch = (fn: (dd: EmailDesign) => EmailDesign) => onChange(fn({ ...d, blocks: d.blocks.map((b) => ({ ...b })) }));
  const setSettings = (k: string, v: unknown) => onChange({ ...d, settings: { ...d.settings, [k]: v } });

  const add = (t: BlockType) => {
    const b = makeBlock(t);
    patch((dd) => ({ ...dd, blocks: [...dd.blocks, b] }));
    setSel(b.id);
  };
  const move = (from: number, to: number) => {
    patch((dd) => {
      const arr = [...dd.blocks];
      const [x] = arr.splice(from, 1);
      arr.splice(to, 0, x);
      return { ...dd, blocks: arr };
    });
  };
  const dup = (i: number) => {
    patch((dd) => {
      const c = { ...dd.blocks[i], id: `${dd.blocks[i].id}_copia` } as Block;
      const arr = [...dd.blocks];
      arr.splice(i + 1, 0, c);
      return { ...dd, blocks: arr };
    });
  };
  const del = (id: string) => {
    patch((dd) => ({ ...dd, blocks: dd.blocks.filter((b) => b.id !== id) }));
    if (sel === id) setSel(null);
  };

  const html = useMemo(() => {
    try { return renderDesignToHtml(d, { interactive: true }); } catch { return ''; }
  }, [d]);

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      {/* Paleta + bloques */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} className="px-2.5 py-1.5 rounded-xl border text-xs font-bold hover:bg-gray-50">+ {BLOCK_LABELS[t]}</button>
          ))}
          <button type="button" onClick={() => setShowSettings((v) => !v)} className="px-2.5 py-1.5 rounded-xl border text-xs font-bold hover:bg-gray-50">🎨 Diseño</button>
        </div>
        {showSettings && (
          <div className="border rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
            <label>Fondo exterior<input type="color" value={d.settings.bg} onChange={(e) => setSettings('bg', e.target.value)} /></label>
            <label>Fondo contenido<input type="color" value={d.settings.contentBg} onChange={(e) => setSettings('contentBg', e.target.value)} /></label>
            <label className="col-span-2">Tipografía<select className="border rounded-lg px-2 py-1 w-full text-xs" value={d.settings.font} onChange={(e) => setSettings('font', e.target.value)}>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select></label>
            <label>Texto base<input type="color" value={d.settings.textColor} onChange={(e) => setSettings('textColor', e.target.value)} /></label>
            <label>Enlaces<input type="color" value={d.settings.linkColor} onChange={(e) => setSettings('linkColor', e.target.value)} /></label>
            <label>Ancho (px)<input type="number" min={480} max={640} step={20} className="border rounded-lg px-2 py-1 w-full text-xs" value={d.settings.width} onChange={(e) => setSettings('width', Number(e.target.value))} /></label>
          </div>
        )}
        {d.blocks.length === 0 && <div className="text-xs text-gray-400 border rounded-xl p-3">Sin bloques. Agregá títulos, textos, imágenes y botones, o importá el contenido actual.</div>}
        <div className="space-y-2">
          {d.blocks.map((b, i) => (
            <div key={b.id}
              draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag !== null && drag !== i) move(drag, i); setDrag(null); }}
              className={`border rounded-xl p-2.5 bg-white ${sel === b.id ? 'border-rotary-blue ring-1 ring-rotary-blue' : ''} ${drag === i ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-1 mb-1.5">
                <button type="button" onClick={() => setSel(sel === b.id ? null : b.id)} className="text-xs font-black text-gray-700 flex-1 text-left">{i + 1} · {BLOCK_LABELS[b.type] || b.type}</button>
                <button type="button" title="Subir" onClick={() => i > 0 && move(i, i - 1)} className={mini}>↑</button>
                <button type="button" title="Bajar" onClick={() => i < d.blocks.length - 1 && move(i, i + 1)} className={mini}>↓</button>
                <button type="button" title="Duplicar" onClick={() => dup(i)} className={mini}>⧉</button>
                <button type="button" title="Eliminar" onClick={() => del(b.id)} className={`${mini} text-red-600`}>✕</button>
              </div>
              {sel === b.id && (
                <EditorBloque b={b}
                  on={(p) => patch((dd) => ({ ...dd, blocks: dd.blocks.map((x) => (x.id === b.id ? { ...x, ...p } : x)) as Block[] }))}
                  onPickImage={() => setPickFor({ id: b.id, field: b.type === 'video' ? 'thumbnail' : 'url' })} />
              )}
            </div>
          ))}
        </div>
      </div>
      {/* Vista previa */}
      <div className="space-y-2">
        <div className="flex gap-1 text-xs">
          <button type="button" onClick={() => setDevice('desktop')} className={`px-3 py-1 rounded-xl border font-bold ${device === 'desktop' ? 'bg-gray-900 text-white' : ''}`}>Escritorio</button>
          <button type="button" onClick={() => setDevice('mobile')} className={`px-3 py-1 rounded-xl border font-bold ${device === 'mobile' ? 'bg-gray-900 text-white' : ''}`}>Móvil</button>
        </div>
        <div className={`mx-auto border rounded-xl overflow-hidden bg-white ${device === 'mobile' ? 'max-w-[375px]' : 'w-full'}`}>
          <iframe title="Vista previa del diseño" srcDoc={html} className="w-full bg-white" style={{ height: 480 }} />
        </div>
        <p className="text-[11px] text-gray-400">Clic en cualquier bloque de la vista previa para editarlo. Las variables ({"{{nombre_club}}"}, …) se ven tal cual acá; en la vista previa de la campaña se resuelven con datos de prueba.</p>
      </div>
      <MediaPicker isOpen={pickFor !== null} onClose={() => setPickFor(null)} mediaType="image" maxSelection={1}
        onSelect={(items) => {
          const url = items?.[0]?.url;
          if (url && pickFor) {
            const field = pickFor.field || 'url';
            patch((dd) => ({ ...dd, blocks: dd.blocks.map((x) => (x.id === pickFor.id ? { ...x, [field]: url } : x)) }));
          }
          setPickFor(null);
        }} />
    </div>
  );
};

export default EmailDesigner;
