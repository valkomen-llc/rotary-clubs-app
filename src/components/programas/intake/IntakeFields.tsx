// ════════════════════════════════════════════════════════════════════════════
// Formulario institucional de programas — los campos (v4.1286.0)
//
// UN renderizador para todos los programas: cada campo se pinta por su TIPO
// (`FieldDef.t`) con las piezas del kit institucional (rótulos, campos de
// borde doble, tarjetas). Las listas repetibles, los archivos, el «No aplica /
// Pendiente», el punto de enfoque y el selector de club viven acá, todos
// declarados fuera de otros componentes (regla del repo).
// ════════════════════════════════════════════════════════════════════════════
import React, { useRef, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronUp, Eye, FileText, Film, Globe2, Image as ImageIcon, Loader2, Lock, Music, Plus, RotateCcw, ShieldCheck, Stethoscope, Trash2, Upload,
} from 'lucide-react';
import PhoneInputWithCountry from '../../common/PhoneInputWithCountry';
import ClubSelector from '../../clubs/ClubSelector';
import { CAMPO, ROTULO, campoCon } from '../../common/InstitutionalFormKit';
import { fmtBytes, newRowId, showIfOk, type FieldDef, type IntakeFile, type RecordRef, type UploadState } from '../../../lib/programIntakeClient';

export interface FieldCtx {
  section: string;
  health: boolean;
  purposes: Record<string, { label: string; exts: string[] }>;
  limitsLabel: string;
  files: Record<string, IntakeFile>;
  uploads: Record<string, UploadState>;
  upload: (file: File, purpose: string) => Promise<string | null>;
  removeFile: (id: string) => void;
  retryFile: (id: string) => void;
  openFile: (id: string) => void;
  previewOf: (id: string) => string | undefined;
  records: RecordRef[];
  districts: { number: number; label: string }[];
  clubDistrict: number;
  storyOptions: { id: string; label: string }[];
  errors: Record<string, string>;
  readOnly: boolean;
}

const err = (ctx: FieldCtx, path: string) => ctx.errors[`${ctx.section}:${path}`];

const Distintivos: React.FC<{ f: FieldDef; health: boolean }> = ({ f, health }) => (
  <>
    {f.pub === 'interno' && <span className="ml-1.5 inline-flex items-center gap-0.5 normal-case tracking-normal text-[10px] font-bold text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5"><Lock className="w-2.5 h-2.5" /> interno</span>}
    {f.pub === 'publico' && <span className="ml-1.5 inline-flex items-center gap-0.5 normal-case tracking-normal text-[10px] font-bold text-sky-700 bg-sky-50 rounded-full px-1.5 py-0.5"><Globe2 className="w-2.5 h-2.5" /> público</span>}
    {f.clinical && <span className="ml-1.5 inline-flex items-center gap-0.5 normal-case tracking-normal text-[10px] font-bold text-violet-700 bg-violet-50 rounded-full px-1.5 py-0.5"><Stethoscope className="w-2.5 h-2.5" /> {health ? 'revisión médica' : 'requiere revisión'}</span>}
    {f.required && <span className="ml-1 text-red-500" aria-hidden>*</span>}
  </>
);

const Etiqueta: React.FC<{ f: FieldDef; health: boolean; htmlFor?: string }> = ({ f, health, htmlFor }) => (
  <label className={ROTULO} htmlFor={htmlFor}>{f.l}<Distintivos f={f} health={health} /></label>
);

const Pie: React.FC<{ hint?: string; error?: string }> = ({ hint, error }) => (
  <>
    {hint && !error && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    {error && <p className="text-xs text-red-600 font-semibold mt-1" role="alert">{error}</p>}
  </>
);

// ── «No aplica» / «Pendiente de suministrar» ─────────────────────────────
const NA_OPCIONES = [['texto', 'Tengo el texto'], ['no_aplica', 'No aplica'], ['pendiente', 'Pendiente de suministrar']] as const;
export const CampoNoAplica: React.FC<{ id: string; f: FieldDef; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean }> = ({ id, f, value, onChange, error, disabled }) => {
  const v = value && typeof value === 'object' ? value : { status: 'texto', text: '' };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2" role="radiogroup" aria-label={f.l}>
        {NA_OPCIONES.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={v.status === k} disabled={disabled}
            onClick={() => onChange(k === 'texto' ? { status: 'texto', text: v.text || '' } : { status: k, text: '' })}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${v.status === k ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-500 border-gray-200 hover:border-rotary-blue'}`}>{l}</button>
        ))}
      </div>
      {v.status === 'texto' ? (
        <textarea id={id} rows={4} maxLength={f.max} value={v.text || ''} disabled={disabled} onChange={(e) => onChange({ status: 'texto', text: e.target.value })} className={`${campoCon(error)} resize-y`} />
      ) : <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">{v.status === 'no_aplica' ? 'Marcado como «No aplica»: no se pedirá ni se publicará.' : 'Marcado como pendiente: el equipo sabrá que falta y no se inventará un texto.'}</p>}
    </div>
  );
};

// ── Punto de enfoque ─────────────────────────────────────────────────────
export const SelectorEnfoque: React.FC<{ src?: string; value: any; onChange: (v: any) => void; disabled?: boolean }> = ({ src, value, onChange, disabled }) => {
  const v = value && typeof value === 'object' ? value : { x: 50, y: 50 };
  if (!src) return <p className="text-[11px] text-gray-400">Adjunta una fotografía para elegir su punto de enfoque.</p>;
  const pos = `${v.x}% ${v.y}%`;
  return (
    <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start">
      <button type="button" disabled={disabled} className="relative inline-block justify-self-start max-w-full rounded-xl overflow-hidden border-2 border-gray-100 cursor-crosshair bg-gray-100"
        onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onChange({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) }); }}
        aria-label="Elegir el punto de enfoque tocando la foto">
        <img src={src} alt="" className="block max-h-72 w-auto max-w-full" />
        <span className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow ring-2 ring-rotary-blue pointer-events-none" style={{ left: `${v.x}%`, top: `${v.y}%` }} />
      </button>
      <div className="flex sm:flex-col gap-2" aria-label="Así se recorta">
        {[['aspect-video w-28', '16:9'], ['aspect-square w-20', '1:1'], ['aspect-[3/4] w-16', '3:4']].map(([c, l]) => (
          <div key={l} className="text-center">
            <div className={`${c} rounded-lg overflow-hidden bg-gray-100 border border-gray-100`}><img src={src} alt="" className="w-full h-full object-cover" style={{ objectPosition: pos }} /></div>
            <span className="text-[10px] text-gray-400 font-bold">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Archivos ─────────────────────────────────────────────────────────────
const iconoDe = (kind?: string) => (kind === 'video' ? Film : kind === 'audio' ? Music : kind === 'image' ? ImageIcon : FileText);
const META_LABEL: Record<string, string> = { description: 'Descripción', usage: 'Indicaciones de uso', alt: 'Texto alternativo', caption: 'Pie de foto' };

const FilaArchivo: React.FC<{ entry: any; f: FieldDef; ctx: FieldCtx; onMeta: (k: string, v: string) => void }> = ({ entry, f, ctx, onMeta }) => {
  const meta = ctx.files[entry.id];
  const up = ctx.uploads[entry.id];
  const Icon = iconoDe(meta?.kind || (up?.file?.type.startsWith('video') ? 'video' : up?.file?.type.startsWith('image') ? 'image' : ''));
  const prev = ctx.previewOf(entry.id);
  const status = (up?.status || (meta?.status === 'uploading' ? 'incompleta' : 'ready')) as 'uploading' | 'ready' | 'error' | 'incompleta';
  return (
    <div className={`rounded-2xl border-2 p-2.5 flex gap-3 ${status === 'error' || status === 'incompleta' ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-white'}`}>
      <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
        {prev && (meta?.kind === 'image' || up?.file?.type.startsWith('image')) ? <img src={prev} alt="" className="w-full h-full object-cover" /> : <Icon className="w-6 h-6 text-gray-400" />}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-gray-700 truncate" title={meta?.filename || up?.file?.name}>{meta?.filename || up?.file?.name || 'Archivo'}{meta?.bytes ? <span className="font-normal text-gray-400"> · {fmtBytes(meta.bytes)}</span> : null}</p>
          <div className="flex items-center gap-1 shrink-0">
            {status === 'ready' && <button type="button" onClick={() => ctx.openFile(entry.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-rotary-blue hover:bg-blue-50" aria-label="Ver archivo"><Eye className="w-4 h-4" /></button>}
            {!ctx.readOnly && <button type="button" onClick={() => ctx.removeFile(entry.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label="Quitar archivo"><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>
        {status === 'uploading' ? (
          <div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-label={`Cargando ${up?.progress || 0}%`}><div className="h-full bg-rotary-blue transition-all" style={{ width: `${up?.progress || 0}%` }} /></div><span className="text-[10px] font-bold text-gray-400 tabular-nums">{up?.progress || 0}%</span></div>
        ) : status === 'error' || status === 'incompleta' ? (
          <div className="flex items-center gap-2 text-[11px] text-red-600 font-semibold">
            <span className="flex-1">{status === 'incompleta' ? 'Carga incompleta. Vuelve a elegir el mismo archivo para continuar desde donde iba.' : up?.error}</span>
            {!ctx.readOnly && <button type="button" onClick={() => ctx.retryFile(entry.id)} className="flex items-center gap-1 text-rotary-blue font-bold shrink-0"><RotateCcw className="w-3.5 h-3.5" /> {status === 'incompleta' ? 'Elegir y continuar' : 'Reintentar'}</button>}
          </div>
        ) : <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Cargado y verificado</p>}
        {(f.fileMeta || []).map(m => (
          <input key={m} value={entry[m] || ''} onChange={(e) => onMeta(m, e.target.value.slice(0, 300))} disabled={ctx.readOnly}
            placeholder={META_LABEL[m] || m} aria-label={META_LABEL[m] || m}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-rotary-blue" />
        ))}
      </div>
    </div>
  );
};

export const CampoArchivos: React.FC<{ f: FieldDef; value: any[] | undefined; onChange: (v: any[]) => void; ctx: FieldCtx; error?: string }> = ({ f, value, onChange, ctx, error }) => {
  const ref = useRef<HTMLInputElement>(null);
  const lista = Array.isArray(value) ? value : [];
  const max = f.max || 1;
  const p = ctx.purposes[f.purpose || ''] || { label: '', exts: [] };
  const accept = p.exts.map(e => `.${e}`).join(',');
  const agregar = async (files: FileList | null) => {
    if (!files?.length) return;
    let actual = [...lista];
    for (const file of Array.from(files).slice(0, Math.max(0, max - actual.length))) {
      const id = await ctx.upload(file, f.purpose || 'media');
      if (id) { actual = [...actual, { id }]; onChange(actual); }
    }
  };
  return (
    <div>
      {lista.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {lista.map((entry, i) => <FilaArchivo key={entry.id} entry={entry} f={f} ctx={ctx} onMeta={(k, v) => onChange(lista.map((x, j) => (j === i ? { ...x, [k]: v } : x)))} />)}
        </div>
      )}
      {!ctx.readOnly && lista.length < max && (
        <>
          <input ref={ref} type="file" multiple={max > 1} accept={accept} className="hidden" onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
          <button type="button" onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); agregar(e.dataTransfer.files); }}
            className="w-full border-2 border-dashed border-gray-200 hover:border-rotary-blue rounded-2xl p-5 text-center transition-colors bg-gray-50/50">
            <Upload className="w-6 h-6 text-rotary-blue mx-auto" />
            <p className="font-bold text-gray-700 text-sm mt-1.5">{max > 1 ? 'Agregar archivos' : 'Agregar archivo'}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{p.exts.map(e => e.toUpperCase()).join(', ')}{max > 1 ? ` · hasta ${max}` : ''}</p>
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-600 font-semibold mt-1" role="alert">{error}</p>}
    </div>
  );
};

// ── Un campo ─────────────────────────────────────────────────────────────
export const CampoIntake: React.FC<{ f: FieldDef; value: any; onChange: (v: any) => void; row: Record<string, any>; path: string; ctx: FieldCtx }> = ({ f, value, onChange, row, path, ctx }) => {
  if (!showIfOk(f, row)) return null;
  const id = `fi-${ctx.section}-${path.replace(/[^\w-]/g, '-')}`;
  const e = err(ctx, path);
  const ro = ctx.readOnly;
  const wrap = (input: React.ReactNode) => (
    <div className={f.full || f.t === 'textarea' || f.t === 'na' || f.t === 'files' || f.t === 'multi' || f.t === 'focus' || f.t === 'club' ? 'sm:col-span-2' : ''}>
      {f.t !== 'checkbox' && <Etiqueta f={f} health={ctx.health} htmlFor={id} />}
      {input}
      {f.t !== 'checkbox' && <Pie hint={f.h} error={e} />}
    </div>
  );
  switch (f.t) {
    case 'heading':
      return <div className="sm:col-span-2 pt-4 mt-2 border-t border-gray-100"><p className="text-sm font-black text-gray-800">{f.l}</p></div>;
    case 'textarea':
      return wrap(<textarea id={id} rows={f.rows || 4} maxLength={f.max} value={value || ''} disabled={ro} onChange={(ev) => onChange(ev.target.value)} className={`${campoCon(e)} resize-y leading-relaxed`} />);
    case 'na':
      return wrap(<CampoNoAplica id={id} f={f} value={value} onChange={onChange} error={e} disabled={ro} />);
    case 'select':
      return wrap(
        <select id={id} value={value || ''} disabled={ro} onChange={(ev) => onChange(ev.target.value || undefined)} className={campoCon(e)}>
          <option value="">Selecciona…</option>
          {(f.opt || []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>,
      );
    case 'multi':
      return wrap(
        <div className="flex flex-wrap gap-2">
          {(f.opt || []).map(o => {
            const on = Array.isArray(value) && value.includes(o.id);
            return (
              <button key={o.id} type="button" disabled={ro} aria-pressed={on} onClick={() => onChange(on ? value.filter((x: string) => x !== o.id) : [...(value || []), o.id])}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-600 border-gray-200 hover:border-rotary-blue'}`}>{o.label}</button>
            );
          })}
        </div>,
      );
    case 'checkbox':
      return (
        <div className={f.full ? 'sm:col-span-2' : ''}>
          <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={value === true} disabled={ro} onChange={(ev) => onChange(ev.target.checked)} className="mt-1 w-4 h-4 accent-rotary-blue" />
            <span>{f.l}<Distintivos f={f} health={ctx.health} /></span>
          </label>
          <Pie hint={f.h} error={e} />
        </div>
      );
    case 'phone':
      return wrap(ro ? <input className={CAMPO} value={value || ''} disabled /> : <PhoneInputWithCountry value={value || ''} onChange={(phone) => onChange(phone)} />);
    case 'year':
      return wrap(<input id={id} type="number" inputMode="numeric" min={1900} max={2100} value={value ?? ''} disabled={ro} onChange={(ev) => onChange(ev.target.value ? Number(ev.target.value) : undefined)} className={campoCon(e)} />);
    case 'date':
      return wrap(<input id={id} type="date" value={value || ''} disabled={ro} onChange={(ev) => onChange(ev.target.value || undefined)} className={campoCon(e)} />);
    case 'email':
      return wrap(<input id={id} type="email" autoComplete="email" value={value || ''} disabled={ro} onChange={(ev) => onChange(ev.target.value)} className={campoCon(e)} />);
    case 'url':
      return wrap(<input id={id} type="url" inputMode="url" placeholder="https://…" value={value || ''} disabled={ro} onChange={(ev) => onChange(ev.target.value)} className={campoCon(e)} />);
    case 'district':
      return wrap(
        <select id={id} value={value || ''} disabled={ro} onChange={(ev) => onChange(ev.target.value ? Number(ev.target.value) : undefined)} className={campoCon(e)}>
          <option value="">Selecciona…</option>
          {(ctx.districts.length ? ctx.districts : [{ number: 4281, label: 'Distrito 4281' }]).map(d => <option key={d.number} value={d.number}>{d.label}</option>)}
          <option value="0">No aplica (no soy rotario)</option>
        </select>,
      );
    case 'club':
      return wrap(ro ? <input className={CAMPO} value={value ? 'Club seleccionado' : ''} disabled /> : <ClubSelector label="" value={value || ''} onChange={(c) => onChange(c?.id || undefined)} districts={[ctx.clubDistrict || 4281]} allowedDistricts={ctx.districts.map(d => d.number)} error={e} />);
    case 'files':
      return wrap(<CampoArchivos f={f} value={value} onChange={(v) => onChange(v.length ? v : undefined)} ctx={ctx} error={undefined} />);
    case 'focus': {
      const fileId = Array.isArray(row.file) ? row.file[0]?.id : undefined;
      const kind = fileId ? ctx.files[fileId]?.kind || (ctx.uploads[fileId]?.file?.type.startsWith('image') ? 'image' : '') : '';
      if (kind && kind !== 'image') return null;
      return wrap(<SelectorEnfoque src={fileId ? ctx.previewOf(fileId) : undefined} value={value} onChange={onChange} disabled={ro} />);
    }
    case 'storylink':
      return wrap(
        <select id={id} value={value || ''} disabled={ro} onChange={(ev) => onChange(ev.target.value || undefined)} className={campoCon(e)}>
          <option value="">Sin vincular</option>
          {ctx.storyOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>,
      );
    default:
      return wrap(<input id={id} maxLength={f.max} value={value || ''} disabled={ro} onChange={(ev) => onChange(ev.target.value)} className={campoCon(e)} />);
  }
};

// ── Listas repetibles ────────────────────────────────────────────────────
const ACCION_LABEL: Record<string, string> = { crear: 'Nuevo registro', actualizar: 'Actualizar uno existente', retirar: 'Solicitar su retiro' };

const TarjetaRegistro: React.FC<{ f: FieldDef; row: any; index: number; onChange: (r: any) => void; onRemove: () => void; ctx: FieldCtx; abierta: boolean; onToggle: () => void }> = ({ f, row, index, onChange, onRemove, ctx, abierta, onToggle }) => {
  const set = (k: string, v: any) => { const n = { ...row }; if (v === undefined) delete n[k]; else n[k] = v; onChange(n); };
  const refs = ctx.records.filter(r => r.kind === f.refKind && (f.target === 'testimony' ? r.format === 'testimonio' : f.target === 'story' ? r.format !== 'testimonio' : true));
  const titulo = row.name || row.title || row.receiver || row.question || (row.text ? String(row.text).slice(0, 50) : '') || `${f.item} ${index + 1}`;
  const refErr = err(ctx, `${f.k}.${row._id}._ref`);
  const hayError = Object.keys(ctx.errors).some(k => k.startsWith(`${ctx.section}:${f.k}.${row._id}.`));
  return (
    <div className={`rounded-2xl border-2 ${hayError ? 'border-red-200' : 'border-gray-100'} bg-gray-50/40`}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={onToggle} className="flex-1 flex items-center gap-2 text-left min-w-0" aria-expanded={abierta}>
          <span className="w-6 h-6 rounded-full bg-rotary-blue/10 text-rotary-blue text-[11px] font-black flex items-center justify-center shrink-0">{index + 1}</span>
          <span className="text-sm font-bold text-gray-800 truncate">{titulo}</span>
          {row._action && row._action !== 'crear' && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 shrink-0">{row._action === 'retirar' ? 'Retiro' : 'Actualización'}</span>}
          {hayError && <span className="text-[10px] font-bold text-red-600 shrink-0">Revisar</span>}
          {abierta ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 ml-auto" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-auto" />}
        </button>
        {!ctx.readOnly && <button type="button" onClick={onRemove} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Quitar ${f.item} ${index + 1}`}><Trash2 className="w-4 h-4" /></button>}
      </div>
      {abierta && (
        <div className="px-4 pb-5 pt-1 border-t border-gray-100 space-y-5">
          {(f.actions || []).length > 1 && (
            <div className="grid sm:grid-cols-2 gap-5 pt-4">
              <div>
                <label className={ROTULO}>Qué quieres hacer</label>
                <select value={row._action || 'crear'} disabled={ctx.readOnly} onChange={(e) => onChange({ ...row, _action: e.target.value, ...(e.target.value === 'crear' ? { _ref: undefined } : {}) })} className={CAMPO}>
                  {(f.actions || []).map(a => <option key={a} value={a}>{ACCION_LABEL[a]}</option>)}
                </select>
              </div>
              {row._action && row._action !== 'crear' && (
                <div>
                  <label className={ROTULO}>Registro existente</label>
                  <select value={row._ref || ''} disabled={ctx.readOnly} onChange={(e) => onChange({ ...row, _ref: e.target.value || undefined })} className={campoCon(refErr)}>
                    <option value="">Selecciona…</option>
                    {refs.map(r => <option key={r.id} value={r.id}>{r.title}{r.detail ? ` · ${r.detail}` : ''}</option>)}
                  </select>
                  {refs.length === 0 && <p className="text-[11px] text-gray-400 mt-1">Todavía no hay registros publicados de este tipo: agrégalo como nuevo.</p>}
                  <Pie hint="Así no se duplica: los cambios se aplican sobre este registro." error={refErr} />
                </div>
              )}
            </div>
          )}
          <div className={`grid sm:grid-cols-2 gap-5 ${(f.actions || []).length > 1 ? '' : 'pt-4'}`}>
            {(f.fields || []).filter(x => row._action === 'retirar' ? x.k === 'withdrawalReason' : true).map(x => (
              <CampoIntake key={x.k} f={x} value={row[x.k]} row={row} path={`${f.k}.${row._id}.${x.k}`} onChange={(v) => set(x.k, v)} ctx={ctx} />
            ))}
            {row._action === 'retirar' && !(f.fields || []).some(x => x.k === 'withdrawalReason') && <p className="sm:col-span-2 text-sm text-gray-500">Se pedirá al equipo retirar este registro de las páginas que controla la plataforma.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export const ListaRepetible: React.FC<{ f: FieldDef; value: any[] | undefined; onChange: (v: any[] | undefined) => void; ctx: FieldCtx }> = ({ f, value, onChange, ctx }) => {
  const items = Array.isArray(value) ? value : [];
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const bulkRef = useRef<HTMLInputElement>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const agregar = () => { const r = { _id: newRowId(), _action: 'crear' }; setAbiertas(a => ({ ...a, [r._id]: true })); onChange([...items, r]); };
  // Carga múltiple del banco multimedia: una pieza por archivo, con el nombre como título provisional.
  const agregarVarios = async (files: FileList | null) => {
    if (!files?.length) return;
    setBulkBusy(true);
    let actual = [...items];
    for (const file of Array.from(files)) {
      const fid = await ctx.upload(file, 'media');
      if (!fid) continue;
      actual = [...actual, { _id: newRowId(), _action: 'crear', file: [{ id: fid }], title: file.name.replace(/\.[^.]+$/, '').slice(0, 200), permission: 'pendiente' }];
      onChange(actual);
    }
    setBulkBusy(false);
  };
  const listErr = err(ctx, f.k);
  return (
    <div className="sm:col-span-2 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className={ROTULO + ' mb-0'}>{f.l}{f.required && <span className="ml-1 text-red-500">*</span>}</p>
        <span className="text-[11px] font-bold text-gray-400">{items.length} registro(s)</span>
      </div>
      {items.map((row, i) => (
        <TarjetaRegistro key={row._id} f={f} row={row} index={i} ctx={ctx} abierta={abiertas[row._id] ?? items.length <= 2}
          onToggle={() => setAbiertas(a => ({ ...a, [row._id]: !(a[row._id] ?? items.length <= 2) }))}
          onChange={(r) => onChange(items.map((x, j) => (j === i ? r : x)))}
          onRemove={() => { const n = items.filter((_, j) => j !== i); onChange(n.length ? n : undefined); }} />
      ))}
      {!ctx.readOnly && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={agregar} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-rotary-blue/40 text-rotary-blue text-sm font-bold hover:bg-blue-50">
            <Plus className="w-4 h-4" /> {f.add || 'Agregar'}
          </button>
          {f.bulk === 'file' && (
            <>
              <input ref={bulkRef} type="file" multiple accept={(ctx.purposes.media?.exts || []).map(e => `.${e}`).join(',')} className="hidden" onChange={(e) => { agregarVarios(e.target.files); e.target.value = ''; }} />
              <button type="button" disabled={bulkBusy} onClick={() => bulkRef.current?.click()} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rotary-blue text-white text-sm font-bold disabled:opacity-60">
                {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Cargar varios archivos
              </button>
            </>
          )}
        </div>
      )}
      {listErr && <p className="text-xs text-red-600 font-semibold" role="alert">{listErr}</p>}
    </div>
  );
};

/** Una sección completa: campos sueltos en rejilla y listas a todo el ancho. */
export const CamposDeSeccion: React.FC<{ fields: FieldDef[]; data: Record<string, any>; onChange: (k: string, v: any) => void; ctx: FieldCtx }> = ({ fields, data, onChange, ctx }) => (
  <div className="grid sm:grid-cols-2 gap-5">
    {fields.map(f => (f.t === 'list'
      ? <ListaRepetible key={f.k} f={f} value={data[f.k]} onChange={(v) => onChange(f.k, v)} ctx={ctx} />
      : <CampoIntake key={f.k} f={f} value={data[f.k]} row={data} path={f.k} onChange={(v) => onChange(f.k, v)} ctx={ctx} />))}
  </div>
);

export const AvisoPrivacidad: React.FC<{ texto: string }> = ({ texto }) => (
  <p className="text-[11px] text-gray-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 shrink-0" /> {texto}</p>
);
