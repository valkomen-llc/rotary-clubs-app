/**
 * Programas — piezas de interfaz compartidas por el panel (v4.1280.0).
 * Tailwind + lucide + sonner, como el resto del panel. Todas fuera de los
 * componentes que las usan (regla: un componente nunca se declara dentro de otro).
 */
import { useRef, useState, type ReactNode } from 'react';
import { Upload, Image as ImageIcon, X, Loader2, Paperclip, Download } from 'lucide-react';
import { toast } from 'sonner';
import MediaPicker from '../content-studio/MediaPicker';
import { uploadMediaFiles, IMAGE_ACCEPT } from '../../../lib/mediaUpload';
import { api, uploadPrivateFile } from './api';
import { PRIVATE_FILE_ACCEPT, fmtBytes, type StateSpec, stateChip } from '../../../lib/programSpec';

export const campo = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue disabled:bg-gray-50 disabled:text-gray-500';
export const rotulo = 'block text-xs font-semibold text-gray-600 mb-1';
export const btnPrimario = 'inline-flex items-center gap-2 rounded-xl bg-rotary-blue text-white px-4 py-2 text-sm font-semibold hover:bg-rotary-blue/90 disabled:opacity-50';
export const btnSecundario = 'inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';
export const btnPeligro = 'inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50';

export const Chip = ({ spec, id }: { spec: Record<string, StateSpec>; id: string }) => {
    const c = stateChip(spec, id);
    return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${c.className}`}>{c.label}</span>;
};

export const Tarjeta = ({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) => (
    <section className={`rounded-2xl border border-gray-100 bg-white shadow-sm p-5 ${className}`}>
        {(title || actions) ? <div className="flex items-start justify-between gap-3 mb-4"><h3 className="font-bold text-gray-900">{title}</h3>{actions}</div> : null}
        {children}
    </section>
);

export const Campo = ({ label, hint, error, children, className = '' }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) => (
    <div className={className}>
        <label className={rotulo}>{label}</label>
        {children}
        {hint ? <p className="text-[11px] text-gray-500 mt-1">{hint}</p> : null}
        {error ? <p role="alert" className="text-xs text-rose-600 mt-1">{error}</p> : null}
    </div>
);

export const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) => (
    <label className="flex items-start gap-3 cursor-pointer">
        <span className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-rotary-blue' : 'bg-gray-300'}`}>
            <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </span>
        <span><span className="text-sm text-gray-800">{label}</span>{hint ? <span className="block text-[11px] text-gray-500">{hint}</span> : null}</span>
    </label>
);

export const Drawer = ({ title, subtitle, onClose, children, footer, wide = false }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) => (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} role="dialog" aria-modal="true">
        <div className={`${wide ? 'max-w-4xl' : 'max-w-2xl'} w-full h-full bg-gray-50 shadow-2xl flex flex-col`} onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
                <div><h2 className="font-bold text-gray-900">{title}</h2>{subtitle ? <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p> : null}</div>
                <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
            {footer ? <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex flex-wrap gap-2 justify-end">{footer}</div> : null}
        </div>
    </div>
);

export const Paginacion = ({ page, total, perPage, onPage }: { page: number; total: number; perPage: number; onPage: (p: number) => void }) => {
    const paginas = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
    if (paginas <= 1) return null;
    return (
        <div className="flex items-center justify-between text-sm text-gray-600 mt-4">
            <span>Página {page} de {paginas} · {total} registros</span>
            <div className="flex gap-2">
                <button type="button" className={btnSecundario} disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
                <button type="button" className={btnSecundario} disabled={page >= paginas} onClick={() => onPage(page + 1)}>Siguiente</button>
            </div>
        </div>
    );
};

/** Imagen PÚBLICA: subir a la Biblioteca o elegir de ella (regla v4.700: las dos opciones). */
export const ImageField = ({ value, onChange, label, alt, onAlt, hint, clubId }: { value: string; onChange: (url: string) => void; label: ReactNode; alt?: string; onAlt?: (v: string) => void; hint?: ReactNode; clubId?: string | null }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [picker, setPicker] = useState(false);
    const [subiendo, setSubiendo] = useState(false);
    const onFile = async (files: FileList | null) => {
        if (!files?.length) return;
        setSubiendo(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles(Array.from(files).slice(0, 1), { clubId: clubId || undefined });
            if (uploaded[0]?.url) { onChange(uploaded[0].url); toast.success('Imagen subida a la Biblioteca.'); }
            if (failed.length) toast.error(failed[0].reason || 'No se pudo subir la imagen.');
        } finally { setSubiendo(false); if (fileRef.current) fileRef.current.value = ''; }
    };
    return (
        <div>
            <label className={rotulo}>{label}</label>
            <div className="flex items-start gap-3">
                <div className="w-24 h-24 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                    {value ? <img src={value} alt={alt || ''} className="w-full h-full object-contain" /> : <ImageIcon className="w-6 h-6 text-gray-300" />}
                </div>
                <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                        <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={e => onFile(e.target.files)} />
                        <button type="button" className={btnSecundario} disabled={subiendo} onClick={() => fileRef.current?.click()}>{subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir</button>
                        <button type="button" className={btnSecundario} onClick={() => setPicker(true)}><ImageIcon className="w-4 h-4" /> Biblioteca</button>
                        {value ? <button type="button" className={btnSecundario} onClick={() => onChange('')}><X className="w-4 h-4" /> Quitar</button> : null}
                    </div>
                    <input className={campo} placeholder="o pega una URL https://…" value={value} onChange={e => onChange(e.target.value)} />
                    {onAlt ? <input className={campo} placeholder="Texto alternativo (accesibilidad)" value={alt || ''} onChange={e => onAlt(e.target.value)} aria-label="Texto alternativo" /> : null}
                    {hint ? <p className="text-[11px] text-gray-500">{hint}</p> : null}
                </div>
            </div>
            <MediaPicker isOpen={picker} onClose={() => setPicker(false)} maxSelection={1} onSelect={(items: any[]) => { if (items[0]?.url) onChange(items[0].url); setPicker(false); }} />
        </div>
    );
};

/** Archivo PRIVADO (comprobante de autorización, respaldo, recurso): nunca tiene URL pública. */
export const PrivateFileField = ({ programId, kind, value, onChange, label, hint, relatedType }: { programId: string; kind: string; value: { id: string; filename: string; bytes?: number } | null; onChange: (f: { id: string; filename: string; bytes?: number } | null) => void; label: ReactNode; hint?: ReactNode; relatedType?: string }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [subiendo, setSubiendo] = useState(false);
    const onFile = async (files: FileList | null) => {
        if (!files?.length) return;
        setSubiendo(true);
        try {
            const f = await uploadPrivateFile(programId, files[0], kind, { relatedType });
            onChange({ id: f.id, filename: f.filename, bytes: f.bytes });
            toast.success('Archivo privado guardado.');
        } catch (e: any) { toast.error(e?.message || 'No se pudo subir el archivo.'); }
        finally { setSubiendo(false); if (fileRef.current) fileRef.current.value = ''; }
    };
    const abrir = async () => {
        if (!value) return;
        try { const r = await api<{ url: string }>(`/admin/${programId}/files/${value.id}/download?inline=1`); window.open(r.url, '_blank', 'noopener'); }
        catch (e: any) { toast.error(e?.message || 'No se pudo abrir.'); }
    };
    return (
        <div>
            <label className={rotulo}>{label}</label>
            <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept={PRIVATE_FILE_ACCEPT} className="hidden" onChange={e => onFile(e.target.files)} />
                {value ? <span className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-1.5 text-xs text-gray-700"><Paperclip className="w-3.5 h-3.5" /> {value.filename}{value.bytes ? ` · ${fmtBytes(value.bytes)}` : ''}</span> : null}
                {value ? <button type="button" className={btnSecundario} onClick={abrir}><Download className="w-4 h-4" /> Ver</button> : null}
                <button type="button" className={btnSecundario} disabled={subiendo} onClick={() => fileRef.current?.click()}>{subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {value ? 'Reemplazar' : 'Adjuntar'}</button>
                {value ? <button type="button" className={btnSecundario} onClick={() => onChange(null)}><X className="w-4 h-4" /></button> : null}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{hint || 'PDF, JPG, PNG o DOCX hasta 25 MB. Privado: sólo lo ve quien revisa.'}</p>
        </div>
    );
};

export const Vacio = ({ texto, children }: { texto: string; children?: ReactNode }) => (
    <div className="text-center py-10 text-gray-500 text-sm"><p>{texto}</p>{children ? <div className="mt-3">{children}</div> : null}</div>
);

export const Cargando = () => <div className="flex items-center gap-2 text-gray-500 py-10 justify-center text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;
