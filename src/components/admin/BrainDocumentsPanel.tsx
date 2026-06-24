import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Upload, FileText, FileType2, Loader2, CheckCircle2, AlertCircle, Trash2,
    RefreshCw, BookOpen, Sparkles, Tag, ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface BrainDocumentRow {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    fileUrl: string | null;
    category: string | null;
    description: string | null;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage: string | null;
    chunkCount: number;
    charCount: number;
    uploadedBy: string | null;
    createdAt: string;
    processedAt: string | null;
    summary?: string | null;
    analysis?: DocAnalysis | null;
    analyzedAt?: string | null;
}

interface DocAnalysis {
    docType?: string;
    topics?: string[];
    entities?: {
        people?: string[];
        orgs?: string[];
        dates?: string[];
        amounts?: string[];
        places?: string[];
    };
    keyFacts?: string[];
    actionItems?: string[];
    relationToSite?: string;
}

interface BrainDocumentsPanelProps {
    brainId: string;
    brainName: string;
    canUpload: boolean;
    headers: Record<string, string>;
    onChange?: () => void;
}

const CATEGORIES = [
    { value: 'reglamento', label: 'Reglamento' },
    { value: 'estatuto', label: 'Estatuto' },
    { value: 'manual', label: 'Manual' },
    { value: 'plan_estrategico', label: 'Plan Estratégico' },
    { value: 'historia', label: 'Documentación Histórica' },
    { value: 'presentacion', label: 'Presentación' },
    { value: 'informe', label: 'Informe' },
    { value: 'politica', label: 'Política institucional' },
    { value: 'otro', label: 'Otro' },
];

const ACCEPT = '.pdf,.docx,.doc,.txt,.md,.markdown,.rtf';

const formatBytes = (b: number) => {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
};

const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusBadge = (status: BrainDocumentRow['status']) => {
    const map = {
        pending:    { label: 'En cola', cls: 'bg-slate-100 text-slate-600' },
        processing: { label: 'Procesando…', cls: 'bg-blue-100 text-blue-700 animate-pulse' },
        completed:  { label: 'Indexado', cls: 'bg-emerald-100 text-emerald-700' },
        failed:     { label: 'Falló', cls: 'bg-red-100 text-red-700' },
    } as const;
    return map[status] || map.pending;
};

const BrainDocumentsPanel: React.FC<BrainDocumentsPanelProps> = ({ brainId, brainName, canUpload, headers, onChange }) => {
    const [docs, setDocs] = useState<BrainDocumentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [category, setCategory] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollTimerRef = useRef<number | null>(null);

    const fetchDocs = useCallback(async () => {
        try {
            const r = await fetch(`${API}/brains/${brainId}/documents`, { headers });
            if (r.ok) {
                const list = await r.json();
                setDocs(list);
            }
        } catch (err) {
            console.error('fetchDocs:', err);
        } finally {
            setLoading(false);
        }
    }, [brainId, headers]);

    useEffect(() => {
        fetchDocs();
    }, [fetchDocs]);

    // Poll cada 4s si hay docs en pending/processing
    useEffect(() => {
        const anyProcessing = docs.some(d => d.status === 'pending' || d.status === 'processing');
        if (!anyProcessing) {
            if (pollTimerRef.current) {
                window.clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
            return;
        }
        if (pollTimerRef.current) return;
        pollTimerRef.current = window.setInterval(fetchDocs, 4000);
        return () => {
            if (pollTimerRef.current) {
                window.clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
    }, [docs, fetchDocs]);

    const uploadFiles = async (files: FileList | File[]) => {
        if (!canUpload || uploading) return;
        const list = Array.from(files);
        if (list.length === 0) return;

        setUploading(true);
        let okCount = 0;
        let failCount = 0;
        for (const file of list) {
            try {
                const fd = new FormData();
                fd.append('file', file);
                if (category) fd.append('category', category);
                if (description) fd.append('description', description);

                const r = await fetch(`${API}/brains/${brainId}/documents`, {
                    method: 'POST',
                    headers, // sin Content-Type — el browser lo arma con boundary
                    body: fd,
                });
                if (r.ok) {
                    okCount++;
                } else {
                    const err = await r.json().catch(() => ({}));
                    failCount++;
                    toast.error(`${file.name}: ${err.error || err.detail || 'fallo'}`);
                }
            } catch (err) {
                failCount++;
                toast.error(`${file.name}: ${(err as Error).message}`);
            }
        }
        setUploading(false);
        setDescription('');
        if (okCount > 0) {
            toast.success(`${okCount} documento${okCount === 1 ? '' : 's'} en proceso — los chunks aparecerán en unos segundos.`);
        }
        await fetchDocs();
        if (onChange) onChange();
        // Limpiar input para permitir re-subir el mismo archivo
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) uploadFiles(e.target.files);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
    };

    const deleteDoc = async (docId: string, filename: string) => {
        if (!confirm(`¿Eliminar "${filename}" y todas sus memorias derivadas?`)) return;
        try {
            const r = await fetch(`${API}/brains/documents/${docId}`, { method: 'DELETE', headers });
            if (r.ok) {
                toast.success('Documento eliminado');
                await fetchDocs();
                if (onChange) onChange();
            } else {
                toast.error('No se pudo eliminar');
            }
        } catch {
            toast.error('Error al eliminar');
        }
    };

    const reprocessDoc = async (docId: string, filename: string) => {
        try {
            const r = await fetch(`${API}/brains/documents/${docId}/reprocess`, { method: 'POST', headers });
            if (r.ok) {
                toast.success(`"${filename}" en re-procesamiento`);
                await fetchDocs();
            } else {
                const err = await r.json().catch(() => ({}));
                toast.error(err.detail || err.error || 'No se pudo re-procesar');
            }
        } catch {
            toast.error('Error al re-procesar');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-600" />
                <h4 className="font-bold text-gray-900 text-sm">Documentos del cerebro</h4>
                <span className="text-xs text-gray-400">({docs.length})</span>
            </div>

            {canUpload && (
                <div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:border-violet-400 focus:ring-1 focus:ring-violet-200 outline-none"
                        >
                            <option value="">Categoría (opcional)</option>
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <input
                            type="text"
                            placeholder="Descripción corta (opcional)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="text-xs px-3 py-2 border border-gray-200 rounded-lg focus:border-violet-400 focus:ring-1 focus:ring-violet-200 outline-none"
                        />
                    </div>

                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                            dragOver
                                ? 'border-violet-400 bg-violet-50'
                                : 'border-gray-300 hover:border-violet-300 bg-gradient-to-br from-slate-50 to-violet-50/30'
                        }`}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ACCEPT}
                            onChange={onFileSelect}
                            className="hidden"
                        />
                        {uploading ? (
                            <div className="flex flex-col items-center gap-2 text-violet-600">
                                <Loader2 className="w-7 h-7 animate-spin" />
                                <span className="text-sm font-medium">Subiendo…</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <Upload className="w-7 h-7 text-gray-400" />
                                <div className="text-sm font-medium text-gray-700">Arrastrá un documento o hacé click</div>
                                <div className="text-[11px] text-gray-500">
                                    PDF, DOCX, TXT, Markdown · máx 25 MB · multi-archivo
                                </div>
                                <div className="text-[10px] text-gray-400 mt-1">
                                    Reglamentos, estatutos, manuales, planes estratégicos, etc.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!canUpload && (
                <div className="text-xs text-gray-500 italic px-1">
                    No tenés permisos para subir documentos a este cerebro.
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
                </div>
            ) : docs.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-500 bg-gray-50 rounded-xl">
                    Sin documentos cargados todavía. Subí PDFs, reglamentos o manuales para alimentar el contexto de <strong>{brainName}</strong>.
                </div>
            ) : (
                <div className="space-y-2">
                    {docs.map(doc => {
                        const sb = statusBadge(doc.status);
                        return (
                            <div key={doc.id} className="border border-gray-200 rounded-xl p-3 bg-white hover:border-violet-200 transition-colors">
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                                        {doc.mimeType.includes('pdf') ? (
                                            <FileType2 className="w-4 h-4 text-red-500" />
                                        ) : (
                                            <FileText className="w-4 h-4 text-violet-500" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <div className="text-sm font-medium text-gray-900 truncate">{doc.filename}</div>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sb.cls}`}>{sb.label}</span>
                                        </div>
                                        {doc.description && <div className="text-xs text-gray-600 mb-1">{doc.description}</div>}
                                        <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
                                            {doc.category && <span className="px-1.5 py-0.5 bg-gray-100 rounded font-medium">{doc.category}</span>}
                                            <span>{formatBytes(doc.size)}</span>
                                            {doc.status === 'completed' && (
                                                <>
                                                    <span className="flex items-center gap-1 text-emerald-700">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        {doc.chunkCount} chunks · {doc.charCount.toLocaleString()} chars
                                                    </span>
                                                </>
                                            )}
                                            <span title={formatDate(doc.createdAt)}>{formatDate(doc.createdAt)}</span>
                                        </div>
                                        {doc.status === 'failed' && doc.errorMessage && (
                                            <div className="mt-2 text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded flex items-start gap-1">
                                                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                                <span>{doc.errorMessage}</span>
                                            </div>
                                        )}
                                        {doc.status === 'processing' && (
                                            <div className="mt-2 text-[11px] text-violet-500 flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" /> Indexando y analizando comprensión del documento…
                                            </div>
                                        )}
                                        {doc.status === 'completed' && doc.summary && (
                                            <DocFicha summary={doc.summary} analysis={doc.analysis || null} />
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {canUpload && doc.status === 'failed' && (
                                            <button
                                                onClick={() => reprocessDoc(doc.id, doc.filename)}
                                                className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600 transition-colors"
                                                title="Re-procesar"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {canUpload && (
                                            <button
                                                onClick={() => deleteDoc(doc.id, doc.filename)}
                                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                                                title="Eliminar"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// Ficha de comprensión de un documento — colapsable, prueba de que el cerebro
// "leyó" y entendió el archivo (Capa A de la síntesis).
const DocFicha: React.FC<{ summary: string; analysis: DocAnalysis | null }> = ({ summary, analysis }) => {
    const a = analysis || {};
    const ent = a.entities || {};
    const chips = (label: string, items?: string[]) =>
        items && items.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
                {items.slice(0, 8).map((it, i) => (
                    <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{it}</span>
                ))}
            </div>
        ) : null;

    const hasDetail = Boolean(
        a.docType || (a.topics && a.topics.length) || (a.keyFacts && a.keyFacts.length) ||
        (a.actionItems && a.actionItems.length) || a.relationToSite ||
        Object.values(ent).some(v => Array.isArray(v) && v.length)
    );

    return (
        <div className="mt-2 bg-violet-50/50 border border-violet-100 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3 h-3 text-violet-500" />
                <span className="text-[10px] uppercase tracking-widest text-violet-700 font-bold">Ficha de comprensión del cerebro</span>
                {a.docType && (
                    <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium ml-auto">{a.docType}</span>
                )}
            </div>
            <p className="text-xs text-gray-700 leading-relaxed">{summary}</p>

            {hasDetail && (
                <details className="mt-2 group">
                    <summary className="cursor-pointer text-[11px] text-violet-600 font-medium select-none">
                        Ver análisis detallado
                    </summary>
                    <div className="mt-2 space-y-2">
                        {chips('Temas', a.topics)}
                        {chips('Personas', ent.people)}
                        {chips('Organizaciones', ent.orgs)}
                        {chips('Fechas', ent.dates)}
                        {chips('Cifras', ent.amounts)}
                        {chips('Lugares', ent.places)}

                        {a.keyFacts && a.keyFacts.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                                    <Tag className="w-3 h-3" /> Datos clave
                                </div>
                                <ul className="list-disc list-inside text-[11px] text-gray-600 space-y-0.5">
                                    {a.keyFacts.map((f, i) => <li key={i}>{f}</li>)}
                                </ul>
                            </div>
                        )}
                        {a.actionItems && a.actionItems.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                                    <ListChecks className="w-3 h-3" /> Acciones / compromisos
                                </div>
                                <ul className="list-disc list-inside text-[11px] text-gray-600 space-y-0.5">
                                    {a.actionItems.map((f, i) => <li key={i}>{f}</li>)}
                                </ul>
                            </div>
                        )}
                        {a.relationToSite && (
                            <div className="text-[11px] text-gray-600 italic border-l-2 border-violet-200 pl-2">
                                {a.relationToSite}
                            </div>
                        )}
                    </div>
                </details>
            )}
        </div>
    );
};

export default BrainDocumentsPanel;
