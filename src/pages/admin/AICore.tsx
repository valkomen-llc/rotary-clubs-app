import React, { useEffect, useMemo, useState, Suspense } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Brain,
    Sparkles,
    Search,
    Network,
    Database,
    Layers,
    RefreshCw,
    Globe,
    Building2,
    Cpu,
    Plus,
    BookOpen,
    Loader2,
    ChevronRight,
    Zap,
    FileText,
    Calendar as CalendarIcon,
    FolderKanban,
    Users,
    StickyNote,
    Download,
    Atom,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import { buildObsidianVault, triggerDownload, type ExportPayload } from '../../lib/obsidianExporter';
import BrainDocumentsPanel from '../../components/admin/BrainDocumentsPanel';

// Lazy load del componente de grafo 3D — usa Three.js (~600KB)
const BrainGraph3D = React.lazy(() => import('../../components/admin/BrainGraph3D'));

const API = import.meta.env.VITE_API_URL || '/api';

interface BrainRow {
    id: string;
    kind: string;
    name: string;
    isMaster: boolean;
    memoryCount: number;
    clubId: string | null;
    districtId: string | null;
    metadata?: Record<string, unknown> | null;
    club?: { id: string; name: string; subdomain: string | null; city: string | null; country: string | null; category: string; type: string; logo: string | null };
    district?: { id: string; name: string; number: number | null; subdomain: string | null };
    _count?: { memories: number; outgoingRelations: number; incomingRelations: number };
}

interface MemoryRow {
    id: string;
    brainId: string;
    kind: string;
    sourceId: string | null;
    sourceType: string | null;
    title: string;
    content: string;
    clubId?: string | null;
    createdAt: string;
    updatedAt: string;
}

interface SearchHit {
    memory: MemoryRow;
    score: number;
}

interface MasterStats {
    brains: number;
    memories: number;
    relations: number;
    memoriesByKind: Record<string, number>;
}

const KIND_LABEL: Record<string, string> = {
    MASTER: 'Cerebro Maestro',
    CLUB: 'Club',
    DISTRICT: 'Distrito',
    ASSOCIATION: 'Asociación',
    PROGRAM: 'Programa',
    CONFERENCE: 'Conferencia',
    EVENT: 'Evento',
    PROJECT_FAIR: 'Feria de Proyectos',
    FOUNDATION: 'Fundación',
};

const KIND_COLOR: Record<string, string> = {
    MASTER: 'bg-violet-50 text-violet-700 border-violet-200',
    CLUB: 'bg-blue-50 text-blue-700 border-blue-100',
    DISTRICT: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    ASSOCIATION: 'bg-amber-50 text-amber-700 border-amber-100',
    PROGRAM: 'bg-pink-50 text-pink-700 border-pink-100',
    CONFERENCE: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    EVENT: 'bg-slate-50 text-slate-700 border-slate-200',
    PROJECT_FAIR: 'bg-orange-50 text-orange-700 border-orange-100',
    FOUNDATION: 'bg-rose-50 text-rose-700 border-rose-100',
};

const MEMORY_KIND_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    POST:        { label: 'Noticia',     icon: <FileText className="w-3 h-3" />,    color: 'bg-blue-50 text-blue-700' },
    PROJECT:     { label: 'Proyecto',    icon: <FolderKanban className="w-3 h-3" />, color: 'bg-emerald-50 text-emerald-700' },
    EVENT:       { label: 'Evento',      icon: <CalendarIcon className="w-3 h-3" />, color: 'bg-orange-50 text-orange-700' },
    KNOWLEDGE:   { label: 'Conocimiento', icon: <BookOpen className="w-3 h-3" />,    color: 'bg-violet-50 text-violet-700' },
    MEMBER:      { label: 'Socio',       icon: <Users className="w-3 h-3" />,        color: 'bg-pink-50 text-pink-700' },
    DOCUMENT:    { label: 'Documento',   icon: <FileText className="w-3 h-3" />,    color: 'bg-amber-50 text-amber-700' },
    PUBLICATION: { label: 'Publicación', icon: <Sparkles className="w-3 h-3" />,    color: 'bg-indigo-50 text-indigo-700' },
    NOTE:        { label: 'Nota',        icon: <StickyNote className="w-3 h-3" />,  color: 'bg-slate-50 text-slate-700' },
};

const fmtN = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

const AICore: React.FC = () => {
    const { user, token } = useAuth();
    const isSuperAdmin = user?.role === 'administrator';

    const [brains, setBrains] = useState<BrainRow[]>([]);
    const [masterStats, setMasterStats] = useState<MasterStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [dormant, setDormant] = useState(false);

    // Search state
    const [queryText, setQueryText] = useState('');
    const [queryScope, setQueryScope] = useState<'master' | 'site'>('master');
    const [querySite, setQuerySite] = useState<string>('');
    const [queryResults, setQueryResults] = useState<SearchHit[] | null>(null);
    const [querying, setQuerying] = useState(false);

    // Reindex state
    const [reindexing, setReindexing] = useState(false);

    // Export state
    const [exporting, setExporting] = useState(false);

    // Graph state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [graphData, setGraphData] = useState<any>(null);
    const [graphLoading, setGraphLoading] = useState(false);
    const [showGraph, setShowGraph] = useState(false);

    // Drawer state
    const [openBrainId, setOpenBrainId] = useState<string | null>(null);
    const [openBrainDetail, setOpenBrainDetail] = useState<BrainRow & { recentMemories?: MemoryRow[]; outgoingRelations?: Array<{ id: string; kind: string; toBrain: { id: string; name: string; kind: string } }>; incomingRelations?: Array<{ id: string; kind: string; fromBrain: { id: string; name: string; kind: string } }> } | null>(null);
    const [openBrainLoading, setOpenBrainLoading] = useState(false);

    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const fetchEverything = async () => {
        setLoading(true);
        try {
            const [brainsRes, masterRes] = await Promise.all([
                fetch(`${API}/brains`, { headers }),
                fetch(`${API}/brains/master`, { headers }),
            ]);
            if (brainsRes.status === 503 || masterRes.status === 503) {
                setDormant(true);
                return;
            }
            if (brainsRes.ok) {
                const data = await brainsRes.json();
                setBrains(data);
            }
            if (masterRes.ok) {
                const m = await masterRes.json();
                setMasterStats(m.stats || null);
            }
        } catch (err) {
            toast.error('Error al cargar los cerebros');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchEverything();
    }, [token]);

    const openBrain = async (id: string) => {
        setOpenBrainId(id);
        setOpenBrainLoading(true);
        try {
            const r = await fetch(`${API}/brains/${id}`, { headers });
            if (r.ok) setOpenBrainDetail(await r.json());
            else toast.error('No se pudo cargar el cerebro');
        } finally {
            setOpenBrainLoading(false);
        }
    };

    const runQuery = async () => {
        if (!queryText.trim()) return;
        setQuerying(true);
        setQueryResults(null);
        try {
            const url = queryScope === 'master'
                ? `${API}/brains/master/query`
                : `${API}/brains/${querySite}/query`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryText, k: 12 }),
            });
            if (r.ok) {
                const data = await r.json();
                setQueryResults(data.results || []);
            } else {
                toast.error('Error en la búsqueda');
            }
        } catch {
            toast.error('Error en la búsqueda');
        } finally {
            setQuerying(false);
        }
    };

    const runReindex = async () => {
        if (!confirm('Re-indexar todo el contenido existente?\n\nProcesa en lotes de hasta 90s (límite de Vercel). Si queda truncado, volvé a clickear para continuar — los items ya procesados se saltean.')) return;
        setReindexing(true);
        try {
            const r = await fetch(`${API}/brains/reindex`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ skipExisting: true }),
            });
            const data = await r.json().catch(() => ({}));
            if (r.ok) {
                const s = data.stats || {};
                const total = (s.posts || 0) + (s.projects || 0) + (s.events || 0) + (s.knowledge || 0);
                let msg = `Reindex: +${total} memorias (${s.posts || 0} noticias, ${s.projects || 0} proyectos, ${s.events || 0} eventos, ${s.knowledge || 0} fuentes)`;
                if (s.skipped) msg += ` · ${s.skipped} ya indexadas`;
                if (data.truncated) msg += ` · TRUNCADO por tiempo — re-clickeá para continuar`;
                if (s.errors) msg += ` · ${s.errors} errores: ${s.firstError || ''}`;

                if (s.errors > 0 && total === 0) {
                    toast.error(msg);
                } else if (data.truncated || s.errors > 0) {
                    toast.warning(msg);
                } else {
                    toast.success(msg);
                }
                await fetchEverything();
            } else {
                toast.error(`Error al re-indexar: ${data.detail || data.error || 'desconocido'}`);
            }
        } catch (err) {
            toast.error(`Error al re-indexar: ${(err as Error).message}`);
        } finally {
            setReindexing(false);
        }
    };

    const bootstrap = async () => {
        try {
            const r = await fetch(`${API}/brains/bootstrap`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
            if (r.ok) {
                const data = await r.json();
                toast.success(`Relaciones reconstruidas: ${data.edges} aristas en ${data.brains} cerebros.`);
                await fetchEverything();
            }
        } catch {
            toast.error('Error al reconstruir relaciones');
        }
    };

    const loadGraph = async () => {
        setGraphLoading(true);
        setShowGraph(true);
        try {
            const r = await fetch(`${API}/brains/graph/full?memoryLimit=400`, { headers });
            if (r.ok) {
                const data = await r.json();
                setGraphData(data);
            } else if (r.status === 503) {
                toast.error('El sistema de cerebros aún no está activo en este entorno.');
                setShowGraph(false);
            } else {
                toast.error('Error al cargar el grafo');
                setShowGraph(false);
            }
        } catch {
            toast.error('Error al cargar el grafo');
            setShowGraph(false);
        } finally {
            setGraphLoading(false);
        }
    };

    const exportObsidian = async () => {
        setExporting(true);
        try {
            const r = await fetch(`${API}/brains/export/payload`, { headers });
            if (!r.ok) {
                if (r.status === 503) {
                    toast.error('El sistema de cerebros aún no está activo.');
                } else {
                    toast.error('Error al generar el export');
                }
                return;
            }
            const payload: ExportPayload = await r.json();
            const blob = await buildObsidianVault(payload);
            const date = new Date().toISOString().slice(0, 10);
            triggerDownload(blob, `club-platform-vault-${date}.zip`);
            toast.success(`Vault listo: ${payload.brains.length} cerebros, ${payload.memories.length} memorias.`);
        } catch (err) {
            console.error(err);
            toast.error('Error al construir el vault');
        } finally {
            setExporting(false);
        }
    };

    const filteredBrains = brains
        .filter(b => !b.isMaster) // master se muestra arriba aparte
        .filter(b => filter === 'all' || b.kind === filter)
        .filter(b => !search.trim() || b.name.toLowerCase().includes(search.toLowerCase()));

    const master = brains.find(b => b.isMaster);

    const kindCounts = useMemo(() => {
        const acc: Record<string, number> = {};
        brains.filter(b => !b.isMaster).forEach(b => { acc[b.kind] = (acc[b.kind] || 0) + 1; });
        return acc;
    }, [brains]);

    const siteBrainsForSelect = brains.filter(b => !b.isMaster);

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto px-4 py-8">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                            <Brain className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Centro de Inteligencia</h1>
                            <p className="text-sm text-gray-500">
                                Cerebro Maestro de Club Platform + cerebros independientes por sitio
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                            onClick={exportObsidian}
                            disabled={exporting || dormant}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-violet-200 hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-violet-700 transition-colors"
                            title="Descargar un vault Obsidian con todos los cerebros, memorias y relaciones"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {exporting ? 'Generando…' : 'Exportar a Obsidian'}
                        </button>
                        {isSuperAdmin && (
                            <>
                                <button
                                    onClick={bootstrap}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-violet-300 rounded-xl text-sm font-medium text-gray-700 transition-colors"
                                >
                                    <Network className="w-4 h-4" />
                                    Reconstruir Relaciones
                                </button>
                                <button
                                    onClick={runReindex}
                                    disabled={reindexing}
                                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-xl text-sm font-medium transition-colors shadow-sm shadow-violet-500/20"
                                >
                                    {reindexing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    {reindexing ? 'Re-indexando…' : 'Re-indexar todo'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Dormant state — tables not migrated */}
                {dormant && (
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-8 mb-8 text-center">
                        <Brain className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                        <h2 className="text-xl font-bold text-amber-900 mb-2">Las tablas del Cerebro aún no están activas</h2>
                        <p className="text-sm text-amber-800 max-w-xl mx-auto mb-4">
                            La infraestructura de v4.351 fue desplegada, pero las nuevas tablas de Postgres (<code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">Brain</code>,{' '}
                            <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">BrainMemory</code>,{' '}
                            <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">BrainRelation</code>) aún no fueron creadas en este entorno.
                        </p>
                        <p className="text-xs text-amber-700 max-w-md mx-auto">
                            Activación: correr <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">npm run db:push</code> en producción. Después, los cerebros se inicializan automáticamente con la primera publicación o con el botón Re-indexar.
                        </p>
                    </div>
                )}

                {/* Master Brain Card */}
                {!dormant && master && (
                    <div className="bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-700 rounded-3xl p-8 text-white shadow-2xl shadow-violet-500/10 mb-8 relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />
                        <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-indigo-400/10 blur-3xl pointer-events-none" />
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-1">
                                <span className="px-2.5 py-0.5 bg-white/15 backdrop-blur-sm rounded-full text-[10px] font-bold tracking-widest uppercase">Master AI Core</span>
                                <span className="text-xs text-violet-100/80">v4.351</span>
                            </div>
                            <h2 className="text-3xl font-bold mb-1">{master.name}</h2>
                            <p className="text-violet-100/90 text-sm mb-6 max-w-2xl">
                                Coordinador global de la red rotaria. Conoce cada club, distrito, asociación y programa.
                                Construye memoria histórica y relaciones cruzadas entre cerebros independientes.
                            </p>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Stat icon={<Database className="w-4 h-4" />} label="Memorias" value={fmtN(masterStats?.memories || 0)} />
                                <Stat icon={<Cpu className="w-4 h-4" />} label="Cerebros" value={fmtN((masterStats?.brains || 1) - 1)} sub="independientes" />
                                <Stat icon={<Network className="w-4 h-4" />} label="Relaciones" value={fmtN(masterStats?.relations || 0)} />
                                <Stat icon={<Zap className="w-4 h-4" />} label="Embeddings" value="Gemini" sub="text-embedding-004 · 768d" />
                            </div>

                            {masterStats?.memoriesByKind && Object.keys(masterStats.memoriesByKind).length > 0 && (
                                <div className="mt-5 flex flex-wrap gap-2">
                                    {Object.entries(masterStats.memoriesByKind).map(([kind, count]) => {
                                        const meta = MEMORY_KIND_META[kind] || { label: kind, icon: null, color: '' };
                                        return (
                                            <span key={kind} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs">
                                                {meta.icon} {meta.label}: <span className="font-bold">{count}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Búsqueda semántica */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Search className="w-5 h-5 text-violet-600" />
                        <h3 className="font-bold text-gray-900">Búsqueda semántica</h3>
                        <span className="ml-auto text-xs text-gray-400">Embedding + cosine similarity</span>
                    </div>
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <select
                                value={queryScope}
                                onChange={e => setQueryScope(e.target.value as 'master' | 'site')}
                                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:bg-white focus:border-violet-300 focus:outline-none"
                            >
                                <option value="master">🧠 Cerebro Maestro (todo)</option>
                                <option value="site">📍 Un sitio específico</option>
                            </select>
                            {queryScope === 'site' && (
                                <select
                                    value={querySite}
                                    onChange={e => setQuerySite(e.target.value)}
                                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:bg-white focus:border-violet-300 focus:outline-none flex-1 max-w-xs"
                                >
                                    <option value="">— Elegir cerebro —</option>
                                    {siteBrainsForSelect.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} ({KIND_LABEL[b.kind] || b.kind})</option>
                                    ))}
                                </select>
                            )}
                            <input
                                value={queryText}
                                onChange={e => setQueryText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') runQuery(); }}
                                placeholder={queryScope === 'master' ? 'Ej: proyectos de educación, conferencias de paz, intercambios juveniles…' : 'Buscar dentro del cerebro seleccionado'}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:bg-white focus:border-violet-300 focus:outline-none"
                            />
                            <button
                                onClick={runQuery}
                                disabled={querying || !queryText.trim() || (queryScope === 'site' && !querySite)}
                                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium transition-colors"
                            >
                                {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                            </button>
                        </div>

                        {queryResults !== null && (
                            <div className="mt-2">
                                {queryResults.length === 0 ? (
                                    <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4 text-center">
                                        Sin resultados. ¿Probaste reindexar el contenido existente?
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="text-xs text-gray-500 font-medium">{queryResults.length} resultados</div>
                                        {queryResults.map((hit, idx) => {
                                            const meta = MEMORY_KIND_META[hit.memory.kind] || { label: hit.memory.kind, icon: null, color: 'bg-gray-50 text-gray-700' };
                                            return (
                                                <div key={hit.memory.id} className="bg-gray-50 hover:bg-violet-50 rounded-xl p-4 transition-colors border border-transparent hover:border-violet-100">
                                                    <div className="flex items-start gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-violet-600 text-[10px] font-bold border border-gray-200">
                                                            #{idx + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.color}`}>
                                                                    {meta.icon} {meta.label}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400 font-mono">
                                                                    score {(hit.score * 100).toFixed(1)}%
                                                                </span>
                                                            </div>
                                                            <div className="font-semibold text-gray-900 text-sm truncate">{hit.memory.title}</div>
                                                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">{hit.memory.content}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Knowledge Graph 3D — Obsidian-style */}
                {!dormant && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8 shadow-sm">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                            <div className="flex items-center gap-2">
                                <Atom className="w-5 h-5 text-violet-600" />
                                <h3 className="font-bold text-gray-900 text-lg">Grafo de Conocimiento 3D</h3>
                                <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-[10px] font-bold uppercase tracking-wider">v4.353</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {showGraph && graphData && (
                                    <span className="text-xs text-gray-500">
                                        Click un nodo para zoom · arrastrá para rotar · scroll para zoom
                                    </span>
                                )}
                                <button
                                    onClick={showGraph ? () => setShowGraph(false) : loadGraph}
                                    disabled={graphLoading}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium shadow-md shadow-violet-500/20 transition-all"
                                >
                                    {graphLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Atom className="w-4 h-4" />}
                                    {showGraph ? 'Ocultar grafo' : graphLoading ? 'Cargando Three.js…' : 'Visualizar grafo 3D'}
                                </button>
                            </div>
                        </div>

                        {!showGraph ? (
                            <div className="bg-gradient-to-br from-slate-50 to-violet-50/30 border border-dashed border-violet-200 rounded-xl p-8 text-center">
                                <Atom className="w-12 h-12 text-violet-400 mx-auto mb-3" />
                                <p className="text-sm text-gray-600 font-medium mb-1">Vista de grafo tridimensional estilo Obsidian</p>
                                <p className="text-xs text-gray-500 max-w-md mx-auto">
                                    Visualizá todos los cerebros y memorias como un grafo orbital interactivo.
                                    Tipo de relaciones, conexiones cruzadas y densidad de conocimiento por sitio.
                                </p>
                            </div>
                        ) : (
                            <Suspense fallback={<div className="h-[600px] flex items-center justify-center bg-slate-950 rounded-2xl"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>}>
                                {graphData ? (
                                    <BrainGraph3D
                                        data={graphData}
                                        height={620}
                                        onNodeClick={(node) => {
                                            if (node.nodeType === 'brain') {
                                                const brainId = node.id.replace('brain:', '');
                                                openBrain(brainId);
                                            }
                                        }}
                                    />
                                ) : (
                                    <div className="h-[620px] flex items-center justify-center bg-slate-950 rounded-2xl">
                                        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                                    </div>
                                )}
                            </Suspense>
                        )}
                    </div>
                )}

                {/* Brains grid */}
                <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-violet-600" />
                        Cerebros Independientes
                        <span className="text-sm font-normal text-gray-400">({filteredBrains.length})</span>
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar cerebro…"
                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs bg-gray-50 focus:bg-white focus:border-violet-300 focus:outline-none"
                        />
                        <select
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs bg-gray-50 focus:bg-white focus:outline-none"
                        >
                            <option value="all">Todos ({Object.values(kindCounts).reduce((a, b) => a + b, 0)})</option>
                            {Object.entries(kindCounts).map(([k, n]) => (
                                <option key={k} value={k}>{KIND_LABEL[k] || k} ({n})</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[0, 1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
                                <div className="h-4 w-24 bg-gray-100 rounded mb-3" />
                                <div className="h-5 w-40 bg-gray-100 rounded mb-2" />
                                <div className="h-3 w-32 bg-gray-100 rounded" />
                            </div>
                        ))}
                    </div>
                ) : filteredBrains.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
                        <Brain className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium">No hay cerebros independientes todavía.</p>
                        {isSuperAdmin && (
                            <p className="text-sm text-gray-400 mt-1">Re-indexá el contenido existente para crear los primeros cerebros automáticamente.</p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredBrains.map(b => (
                            <BrainCard key={b.id} brain={b} onClick={() => openBrain(b.id)} />
                        ))}
                    </div>
                )}

                {/* Footer / version stripe */}
                <div className="mt-12 pt-6 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        Centro de Inteligencia v4.353 · Fase 3: Carga documental (PDF / DOCX / TXT / MD) + Reindex resiliente
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        <span>Embedding: Gemini text-embedding-004 (768d)</span>
                        <span>Extract: pdf-parse · mammoth</span>
                    </div>
                </div>
            </div>

            {/* Drawer */}
            {openBrainId && (
                <BrainDrawer
                    brainId={openBrainId}
                    detail={openBrainDetail}
                    loading={openBrainLoading}
                    onClose={() => { setOpenBrainId(null); setOpenBrainDetail(null); }}
                    onReloaded={() => openBrain(openBrainId)}
                    headers={headers}
                    isSuperAdmin={isSuperAdmin}
                    currentUser={user ? { clubId: user.clubId, districtId: null } : null}
                />
            )}
        </AdminLayout>
    );
};

// ─── Sub-components ──────────────────────────────────────────────────────

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({ icon, label, value, sub }) => (
    <div className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10">
        <div className="flex items-center gap-1.5 text-violet-100/80 text-[10px] font-medium uppercase tracking-widest mb-1">
            {icon}{label}
        </div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        {sub && <div className="text-[10px] text-violet-100/60 mt-1">{sub}</div>}
    </div>
);

const BrainCard: React.FC<{ brain: BrainRow; onClick: () => void }> = ({ brain, onClick }) => {
    const color = KIND_COLOR[brain.kind] || 'bg-gray-50 text-gray-700 border-gray-100';
    const icon = brain.kind === 'DISTRICT' ? <Globe className="w-5 h-5" /> :
                 brain.kind === 'ASSOCIATION' ? <Layers className="w-5 h-5" /> :
                 <Building2 className="w-5 h-5" />;

    return (
        <button
            onClick={onClick}
            className="text-left bg-white hover:bg-violet-50/40 rounded-2xl border border-gray-200 hover:border-violet-200 p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group"
        >
            <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${color}`}>
                    {icon} {KIND_LABEL[brain.kind] || brain.kind}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="font-bold text-gray-900 text-base mb-1 truncate">{brain.name}</div>
            <div className="text-xs text-gray-500 mb-3">
                {brain.club?.city && brain.club?.country
                    ? `${brain.club.city}, ${brain.club.country}`
                    : brain.district?.number
                        ? `Distrito ${brain.district.number}`
                        : (brain.club?.subdomain || brain.district?.subdomain || '—')}
            </div>
            <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-gray-600 font-medium">
                    <Database className="w-3.5 h-3.5 text-violet-500" />
                    {brain.memoryCount} memorias
                </span>
                {brain._count && brain._count.outgoingRelations + brain._count.incomingRelations > 0 && (
                    <span className="inline-flex items-center gap-1 text-gray-600">
                        <Network className="w-3.5 h-3.5 text-emerald-500" />
                        {brain._count.outgoingRelations + brain._count.incomingRelations} conexiones
                    </span>
                )}
            </div>
        </button>
    );
};

// Drawer detail
interface BrainDrawerProps {
    brainId: string;
    detail: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    loading: boolean;
    onClose: () => void;
    onReloaded: () => void;
    headers: Record<string, string>;
    isSuperAdmin: boolean;
    currentUser: { clubId?: string | null; districtId?: string | null } | null;
}

const BrainDrawer: React.FC<BrainDrawerProps> = ({ detail, loading, onClose, onReloaded, headers, isSuperAdmin, currentUser }) => {
    const canUploadDocs = !!detail && (
        isSuperAdmin ||
        (detail.clubId && currentUser?.clubId === detail.clubId) ||
        (detail.districtId && currentUser?.districtId === detail.districtId)
    );

    const [noteOpen, setNoteOpen] = useState(false);
    const [noteTitle, setNoteTitle] = useState('');
    const [noteContent, setNoteContent] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    const saveNote = async () => {
        if (!detail?.id || !noteTitle.trim() || !noteContent.trim()) return;
        setSavingNote(true);
        try {
            const r = await fetch(`${API}/brains/${detail.id}/notes`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: noteTitle, content: noteContent }),
            });
            if (r.ok) {
                toast.success('Nota agregada al cerebro');
                setNoteTitle(''); setNoteContent(''); setNoteOpen(false);
                onReloaded();
            } else {
                toast.error('No se pudo guardar la nota');
            }
        } finally {
            setSavingNote(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300"
                onClick={e => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <div className="text-xs text-violet-600 font-bold uppercase tracking-widest">
                                {detail ? (KIND_LABEL[detail.kind] || detail.kind) : 'Cargando…'}
                            </div>
                            <div className="font-bold text-gray-900">{detail?.name || ''}</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
                </div>

                {loading || !detail ? (
                    <div className="p-12 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                    </div>
                ) : (
                    <div className="p-6 space-y-6">
                        {/* Identity */}
                        {detail.identityPrompt && (
                            <div className="bg-violet-50/50 border border-violet-100 rounded-xl p-4">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-violet-700 mb-1">Identidad</div>
                                <p className="text-sm text-gray-700 leading-relaxed">{detail.identityPrompt}</p>
                            </div>
                        )}

                        {/* Counts */}
                        <div className="grid grid-cols-3 gap-3">
                            <MiniStat label="Memorias" value={detail.memoryCount || 0} />
                            <MiniStat label="Salida" value={detail.outgoingRelations?.length || 0} />
                            <MiniStat label="Entrada" value={detail.incomingRelations?.length || 0} />
                        </div>

                        {/* Relations */}
                        {(detail.outgoingRelations?.length > 0 || detail.incomingRelations?.length > 0) && (
                            <div>
                                <div className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                                    <Network className="w-4 h-4 text-emerald-600" /> Relaciones
                                </div>
                                <div className="space-y-1">
                                    {detail.outgoingRelations?.map((r: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                                        <div key={r.id} className="text-xs bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
                                            <span className="font-bold text-emerald-700">→ {r.kind}</span>
                                            <span className="text-gray-600">{r.toBrain.name}</span>
                                            <span className="text-gray-400">({KIND_LABEL[r.toBrain.kind] || r.toBrain.kind})</span>
                                        </div>
                                    ))}
                                    {detail.incomingRelations?.map((r: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                                        <div key={r.id} className="text-xs bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
                                            <span className="font-bold text-blue-700">← {r.kind}</span>
                                            <span className="text-gray-600">{r.fromBrain.name}</span>
                                            <span className="text-gray-400">({KIND_LABEL[r.fromBrain.kind] || r.fromBrain.kind})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Documentos institucionales */}
                        <div className="border-t border-gray-100 pt-5">
                            <BrainDocumentsPanel
                                brainId={detail.id}
                                brainName={detail.name}
                                canUpload={!!canUploadDocs}
                                headers={headers}
                                onChange={onReloaded}
                            />
                        </div>

                        {/* Memories */}
                        <div className="border-t border-gray-100 pt-5">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <Database className="w-4 h-4 text-violet-600" /> Memorias recientes
                                </div>
                                {(isSuperAdmin || true) && (
                                    <button
                                        onClick={() => setNoteOpen(o => !o)}
                                        className="text-xs flex items-center gap-1 text-violet-600 hover:text-violet-700 font-medium"
                                    >
                                        <Plus className="w-3 h-3" />Agregar nota
                                    </button>
                                )}
                            </div>

                            {noteOpen && (
                                <div className="bg-violet-50/40 border border-violet-100 rounded-xl p-3 mb-3 space-y-2">
                                    <input
                                        value={noteTitle}
                                        onChange={e => setNoteTitle(e.target.value)}
                                        placeholder="Título…"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                    />
                                    <textarea
                                        value={noteContent}
                                        onChange={e => setNoteContent(e.target.value)}
                                        placeholder="Contenido de la nota…"
                                        rows={4}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => { setNoteOpen(false); setNoteTitle(''); setNoteContent(''); }}
                                            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                                        >Cancelar</button>
                                        <button
                                            onClick={saveNote}
                                            disabled={savingNote || !noteTitle.trim() || !noteContent.trim()}
                                            className="px-4 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-lg font-medium"
                                        >
                                            {savingNote ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {(!detail.recentMemories || detail.recentMemories.length === 0) ? (
                                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-4 text-center">
                                    Sin memorias todavía.
                                </div>
                            ) : (
                                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                                    {detail.recentMemories.map((m: MemoryRow) => {
                                        const meta = MEMORY_KIND_META[m.kind] || { label: m.kind, icon: null, color: 'bg-gray-50 text-gray-700' };
                                        return (
                                            <div key={m.id} className="bg-gray-50 rounded-lg p-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.color}`}>
                                                        {meta.icon} {meta.label}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 ml-auto">{new Date(m.updatedAt).toLocaleDateString()}</span>
                                                </div>
                                                <div className="text-sm font-semibold text-gray-900 line-clamp-1">{m.title}</div>
                                                <div className="text-xs text-gray-500 line-clamp-2 mt-0.5">{m.content}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const MiniStat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
        <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
);

export default AICore;
