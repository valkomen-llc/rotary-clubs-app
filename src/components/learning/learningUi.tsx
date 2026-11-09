// Piezas visuales compartidas de Cursos y capacitaciones (v4.1302).
// Rótulos y clases: el criterio vive en el servidor.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CloudOff, Loader2, AlertTriangle, UploadCloud, X, FileText, Film, Image as ImageIcon, Music } from 'lucide-react';
import { fmtBytes, uploadCourseFile, misApi, type Catalogs, type LFile, type SaveState, saveStateText, TONE_CLASS } from '../../lib/learningClient';

export const campo = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue disabled:bg-gray-50 disabled:text-gray-500';
export const rotulo = 'block text-xs font-semibold text-gray-600 mb-1';
export const btnPrimario = 'inline-flex items-center gap-2 rounded-xl bg-rotary-blue text-white px-4 py-2 text-sm font-semibold hover:bg-rotary-navy disabled:opacity-50 disabled:cursor-not-allowed';
export const btnSecundario = 'inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnPeligro = 'inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50';
export const TARJETA = 'bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100';

export const Campo = ({ label, hint, error, children, className = '' }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) => (
    <label className={`block ${className}`}>
        <span className={rotulo}>{label}</span>
        {children}
        {hint ? <span className="block text-[11px] text-gray-400 mt-1">{hint}</span> : null}
        {error ? <span className="block text-[11px] text-rose-600 mt-1" role="alert">{error}</span> : null}
    </label>
);

export const StatusChip = ({ id, catalogs, className = '' }: { id: string; catalogs?: Catalogs | null; className?: string }) => {
    const spec = catalogs?.displayStates?.[id] || catalogs?.states?.[id] || { label: id, tone: 'gray' };
    return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLASS[spec.tone] || TONE_CLASS.gray} ${className}`}>{spec.label}</span>;
};

export const SaveIndicator = ({ state, lastSavedAt, error }: { state: SaveState; lastSavedAt?: Date | null; error?: string }) => {
    if (state === 'idle') return null;
    const icon = state === 'saving' || state === 'dirty' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : state === 'saved' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : state === 'offline' ? <CloudOff className="w-3.5 h-3.5 text-amber-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />;
    const tone = state === 'saved' ? 'text-emerald-700' : state === 'offline' ? 'text-amber-700' : state === 'error' ? 'text-rose-700' : 'text-gray-500';
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone}`} role="status" aria-live="polite" data-testid="save-indicator" data-state={state}>
            {icon}
            <span>{saveStateText[state]}{state === 'saved' && lastSavedAt ? ` · ${lastSavedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            {state === 'error' && error ? <span className="text-gray-400">({error})</span> : null}
        </span>
    );
};

export const Vacio = ({ texto, children }: { texto: string; children?: ReactNode }) => (
    <div className="text-center py-12 text-gray-500 text-sm">{texto}{children ? <div className="mt-4">{children}</div> : null}</div>
);
export const Cargando = () => <div className="flex items-center gap-2 text-gray-500 py-16 justify-center text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;

export const KindIcon = ({ kind, className = 'w-4 h-4' }: { kind?: string | null; className?: string }) =>
    kind === 'video' ? <Film className={className} /> : kind === 'image' ? <ImageIcon className={className} /> : kind === 'audio' ? <Music className={className} /> : <FileText className={className} />;

/** Un diálogo sencillo, accesible, sin dependencias. */
export const Dialogo = ({ title, onClose, children, footer, wide = false }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) => {
    useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true">
            <div className={`bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92vh] flex flex-col`}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h2 className="text-base font-black text-gray-800">{title}</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
                {footer ? <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">{footer}</div> : null}
            </div>
        </div>
    );
};

export type UploadRow = { id: string; name: string; pct: number; phase: 'uploading' | 'confirming' | 'ready' | 'error'; error?: string; file?: File; purpose: string; result?: LFile; fileId?: string };

/**
 * Zona de carga de un uso concreto (portada, video de lección, documento…).
 * Muestra el avance REAL por archivo; «Recibido» sólo cuando el servidor
 * confirmó el objeto. Un fallo deja «Reintentar» sin tocar lo demás.
 */
export const Uploader = ({ courseId, purpose, catalogs, multiple = false, label, hint, onReady, disabled = false, compact = false }: {
    courseId: string; purpose: string; catalogs: Catalogs | null | undefined; multiple?: boolean; label: ReactNode; hint?: ReactNode; onReady: (f: LFile) => void; disabled?: boolean; compact?: boolean;
}) => {
    const [rows, setRows] = useState<UploadRow[]>([]);
    const input = useRef<HTMLInputElement>(null);
    const spec = catalogs?.filePurposes?.[purpose];
    const accept = spec ? spec.exts.map(e => `.${e}`).join(',') : undefined;
    const update = (id: string, patch: Partial<UploadRow>) => setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x));

    const subir = async (file: File, rowId: string) => {
        try {
            const ready = await uploadCourseFile(courseId, file, purpose, { onCreated: (fileId) => update(rowId, { fileId }), onProgress: (pct, phase) => update(rowId, { pct, phase }) });
            update(rowId, { pct: 100, phase: 'ready', result: ready });
            onReady(ready);
            setTimeout(() => setRows(r => r.filter(x => x.id !== rowId)), 2500);
        } catch (e: any) {
            update(rowId, { phase: 'error', error: e?.message || 'No se pudo subir.' });
        }
    };
    const elegir = (files: FileList | null) => {
        if (!files) return;
        const list = Array.from(files).slice(0, multiple ? 20 : 1);
        for (const f of list) {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            setRows(r => [...r, { id, name: f.name, pct: 0, phase: 'uploading', file: f, purpose }]);
            subir(f, id);
        }
        if (input.current) input.current.value = '';
    };
    const limite = spec && catalogs ? (spec.visibility === 'public' ? catalogs.limits.image : purpose.includes('video') ? catalogs.limits.video : purpose.includes('audio') ? catalogs.limits.audio : purpose === 'document' ? catalogs.limits.document : catalogs.limits.resource) : 0;

    return (
        <div>
            <button
                type="button" disabled={disabled} onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (!disabled) elegir(e.dataTransfer.files); }}
                className={`w-full rounded-2xl border-2 border-dashed ${disabled ? 'border-gray-100 bg-gray-50 text-gray-400' : 'border-gray-200 hover:border-rotary-blue/60 hover:bg-blue-50/30 text-gray-600'} ${compact ? 'px-3 py-3' : 'px-4 py-6'} text-left transition flex items-center gap-3`}
            >
                <UploadCloud className={`${compact ? 'w-5 h-5' : 'w-7 h-7'} text-rotary-blue shrink-0`} />
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-800">{label}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{hint || (spec ? `${spec.exts.map(e => e.toUpperCase()).join(', ')}${limite ? ` · hasta ${fmtBytes(limite)}` : ''}` : '')}</span>
                </span>
            </button>
            <input ref={input} type="file" className="sr-only" accept={accept} multiple={multiple} onChange={(e) => elegir(e.target.files)} />
            {rows.length ? (
                <ul className="mt-2 space-y-1.5">
                    {rows.map(r => (
                        <li key={r.id} className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs" data-testid="upload-row" data-phase={r.phase}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium text-gray-700">{r.name}</span>
                                <span className={`shrink-0 ${r.phase === 'error' ? 'text-rose-600' : r.phase === 'ready' ? 'text-emerald-700' : 'text-gray-500'}`}>
                                    {r.phase === 'uploading' ? `Subiendo… ${r.pct}%` : r.phase === 'confirming' ? 'Confirmando con el servidor…' : r.phase === 'ready' ? 'Recibido ✓' : 'Error'}
                                </span>
                            </div>
                            {r.phase !== 'error' ? <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${r.phase === 'ready' ? 'bg-emerald-500' : 'bg-rotary-blue'} transition-all`} style={{ width: `${r.pct}%` }} /></div> : (
                                <div className="mt-1 flex items-center justify-between gap-2">
                                    <span className="text-rose-600 truncate">{r.error}</span>
                                    <span className="flex gap-2 shrink-0">
                                        {r.file ? <button type="button" className="font-semibold text-rotary-blue" onClick={() => { update(r.id, { phase: 'uploading', pct: 0, error: undefined }); subir(r.file!, r.id); }}>Reintentar</button> : null}
                                        <button type="button" className="text-gray-400" onClick={() => { if (r.fileId) misApi(`/cursos/${courseId}/archivos/${r.fileId}`, { method: 'DELETE' }).catch(() => { /* ya no existe */ }); setRows(x => x.filter(y => y.id !== r.id)); }}>Quitar</button>
                                    </span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
};

export const Progreso = ({ done, total }: { done: number; total: number }) => (
    <div className="flex items-center gap-2" aria-label={`${done} de ${total} requisitos`}>
        <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-rotary-blue transition-all" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div>
        <span className="text-[11px] text-gray-500 whitespace-nowrap">{done} de {total} requisitos</span>
    </div>
);
