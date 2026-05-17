import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Brain, Sparkles, BookOpen, Database, Search, Settings, Loader2,
    CheckCircle2, AlertCircle, RefreshCw, Save, Download, Globe,
    FileText, Lightbulb, MessageCircle, ChevronRight,
    Calendar as CalendarIcon, FolderKanban, Users, StickyNote, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import BrainDocumentsPanel from './BrainDocumentsPanel';
import { buildObsidianVault, triggerDownload, type ExportPayload } from '../../lib/obsidianExporter';

const API = import.meta.env.VITE_API_URL || '/api';

// ─────────────────────────────────────────────────────────────────────────────
// SiteBrainPanel — Panel dedicado para admins de SITIO (no super-admins).
// Vista enfocada en SU brain como protagonista. UX completamente diferente al
// dashboard global del super-admin.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrainMe = any; // shape devuelta por GET /api/brains/me

interface SiteBrainPanelProps {
    headers: Record<string, string>;
    currentUser: { clubId?: string | null; districtId?: string | null } | null;
}

const KIND_LABEL: Record<string, string> = {
    CLUB: 'Club Rotary',
    DISTRICT: 'Distrito',
    ASSOCIATION: 'Asociación',
    PROGRAM: 'Programa de Intercambio',
    EVENT: 'Evento',
    CONFERENCE: 'Conferencia',
    PROJECT_FAIR: 'Feria de Proyectos',
    FOUNDATION: 'Fundación',
    MASTER: 'Cerebro Maestro',
};

const MEMORY_KIND_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    POST:        { label: 'Noticia',    icon: <FileText className="w-3 h-3" />,      color: 'bg-blue-50 text-blue-700' },
    PROJECT:     { label: 'Proyecto',   icon: <FolderKanban className="w-3 h-3" />,  color: 'bg-emerald-50 text-emerald-700' },
    EVENT:       { label: 'Evento',     icon: <CalendarIcon className="w-3 h-3" />,  color: 'bg-amber-50 text-amber-700' },
    MEMBER:      { label: 'Miembro',    icon: <Users className="w-3 h-3" />,         color: 'bg-pink-50 text-pink-700' },
    KNOWLEDGE:   { label: 'Conocimiento', icon: <Lightbulb className="w-3 h-3" />,   color: 'bg-violet-50 text-violet-700' },
    DOCUMENT:    { label: 'Documento',  icon: <FileText className="w-3 h-3" />,      color: 'bg-indigo-50 text-indigo-700' },
    NOTE:        { label: 'Nota',       icon: <StickyNote className="w-3 h-3" />,    color: 'bg-yellow-50 text-yellow-800' },
    PUBLICATION: { label: 'Publicación', icon: <Layers className="w-3 h-3" />,       color: 'bg-cyan-50 text-cyan-700' },
};

const SiteBrainPanel: React.FC<SiteBrainPanelProps> = ({ headers, currentUser }) => {
    const [data, setData] = useState<BrainMe | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [extras, setExtras] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [loadingExtras, setLoadingExtras] = useState(false);
    const [errorState, setErrorState] = useState<{ status: number | null; message: string } | null>(null);
    const [tab, setTab] = useState<'overview' | 'docs' | 'memories' | 'search' | 'config'>('overview');

    const fetchMe = useCallback(async () => {
        setLoading(true);
        setErrorState(null);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45_000);
        try {
            const r = await fetch(`${API}/brains/me`, { headers, signal: controller.signal });
            if (r.ok) {
                const json = await r.json();
                setData(json);
            } else {
                const err = await r.json().catch(() => ({}));
                setErrorState({
                    status: r.status,
                    message: err.detail || err.error || `HTTP ${r.status} ${r.statusText || 'sin detalle'}`,
                });
                if (r.status !== 503) {
                    toast.error(err.detail || err.error || `No se pudo cargar el cerebro (${r.status})`);
                }
            }
        } catch (err) {
            const e = err as Error;
            const isAbort = e.name === 'AbortError';
            setErrorState({
                status: null,
                message: isAbort
                    ? 'Timeout: el endpoint /api/brains/me no respondió en 45s — probable error del servidor o cold start severo de Vercel.'
                    : e.message,
            });
            toast.error(isAbort ? 'Timeout cargando el cerebro' : `Error: ${e.message}`);
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
        }
    }, [headers]);

    const fetchExtras = useCallback(async () => {
        setLoadingExtras(true);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45_000);
            const r = await fetch(`${API}/brains/me/extras`, { headers, signal: controller.signal });
            clearTimeout(timeoutId);
            if (r.ok) {
                setExtras(await r.json());
            } else {
                // No bloquea — solo loguea
                console.warn('[SiteBrainPanel] extras failed:', r.status);
            }
        } catch (err) {
            console.warn('[SiteBrainPanel] extras error:', (err as Error).message);
        } finally {
            setLoadingExtras(false);
        }
    }, [headers]);

    useEffect(() => { fetchMe(); }, [fetchMe]);

    // Una vez que tenemos el brain básico, cargamos las cosas pesadas en background
    useEffect(() => {
        if (data?.brain?.id && !extras) {
            fetchExtras();
        }
    }, [data?.brain?.id, extras, fetchExtras]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-16 gap-3">
                <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                <p className="text-xs text-gray-500">Cargando tu cerebro…</p>
                <p className="text-[10px] text-gray-400">Primera carga puede tardar unos segundos por cold start</p>
            </div>
        );
    }

    if (errorState) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-red-900 mb-1">No se pudo cargar el Cerebro Inteligente</p>
                        <p className="text-xs text-red-700 font-mono bg-red-100/60 rounded px-2 py-1 mt-2 break-all">
                            {errorState.status ? `HTTP ${errorState.status} · ` : ''}{errorState.message}
                        </p>
                        <p className="text-xs text-red-700 mt-3">
                            Posibles causas: el endpoint <code>/api/brains/me</code> está tardando demasiado, las tablas Brain no están migradas en este entorno, o el servicio está temporalmente caído.
                        </p>
                        <button
                            onClick={() => fetchMe()}
                            className="mt-3 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />Reintentar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!data?.brain) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                <Brain className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-amber-900 mb-1">Tu cerebro aún no se creó</p>
                <p className="text-xs text-amber-700">
                    {data?.scope === 'master-only'
                        ? 'Tu usuario no está vinculado a un club o distrito específico. Como super admin podés usar el panel global.'
                        : 'Esto puede pasar si tu usuario no está vinculado a un sitio. Contactá a soporte.'}
                </p>
            </div>
        );
    }

    const brain = data.brain;
    const canEdit = !!currentUser && (
        (brain.clubId && currentUser.clubId === brain.clubId) ||
        (brain.districtId && currentUser.districtId === brain.districtId)
    );
    const onboardingCompleted = !!data.onboarding?.completed;

    return (
        <div className="space-y-6">
            {/* Hero card del brain */}
            <BrainHero brain={brain} master={data.master} onboardingCompleted={onboardingCompleted} headers={headers} onSync={fetchMe} canEdit={canEdit} />

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-100 overflow-x-auto">
                    <TabBtn id="overview" current={tab} onClick={setTab} icon={<Sparkles className="w-4 h-4" />}>Resumen</TabBtn>
                    <TabBtn id="docs"     current={tab} onClick={setTab} icon={<BookOpen className="w-4 h-4" />}>Documentos</TabBtn>
                    <TabBtn id="memories" current={tab} onClick={setTab} icon={<Database className="w-4 h-4" />}>Memorias <span className="ml-1 text-[10px] bg-violet-100 text-violet-700 rounded-full px-1.5">{brain.memoryCount}</span></TabBtn>
                    <TabBtn id="search"   current={tab} onClick={setTab} icon={<Search className="w-4 h-4" />}>Búsqueda</TabBtn>
                    <TabBtn id="config"   current={tab} onClick={setTab} icon={<Settings className="w-4 h-4" />}>Configuración</TabBtn>
                </div>

                <div className="p-6">
                    {tab === 'overview' && <OverviewTab brain={brain} memories={extras?.memories || []} master={data.master} loadingExtras={loadingExtras} />}
                    {tab === 'docs'     && <BrainDocumentsPanel brainId={brain.id} brainName={brain.name} canUpload={canEdit} headers={headers} onChange={fetchExtras} />}
                    {tab === 'memories' && <MemoriesTab brainId={brain.id} memories={extras?.memories || []} headers={headers} loadingExtras={loadingExtras} />}
                    {tab === 'search'   && <SearchTab brain={brain} master={data.master} headers={headers} />}
                    {tab === 'config'   && <ConfigTab brain={brain} canEdit={canEdit} headers={headers} onUpdate={fetchMe} />}
                </div>
            </div>
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TabBtn: React.FC<{ id: string; current: string; onClick: (id: any) => void; icon: React.ReactNode; children: React.ReactNode }> = ({ id, current, onClick, icon, children }) => (
    <button
        onClick={() => onClick(id)}
        className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            current === id ? 'border-violet-600 text-violet-700 bg-violet-50/40' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
    >
        {icon}{children}
    </button>
);

// ─── Hero ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BrainHero: React.FC<{ brain: any; master: any; onboardingCompleted: boolean; headers: Record<string, string>; onSync: () => void; canEdit: boolean }> = ({ brain, master, onboardingCompleted, headers, onSync, canEdit }) => {
    const [syncing, setSyncing] = useState(false);
    const [exporting, setExporting] = useState(false);

    const syncOnboarding = async () => {
        if (!canEdit) return;
        setSyncing(true);
        try {
            const r = await fetch(`${API}/brains/${brain.id}/sync-onboarding`, { method: 'POST', headers });
            if (r.ok) {
                const j = await r.json();
                toast.success(`Cerebro sincronizado: ${j.ingested}/${j.total} memorias institucionales importadas`);
                onSync();
            } else {
                const err = await r.json().catch(() => ({}));
                toast.error(err.detail || err.error || 'Error al sincronizar');
            }
        } catch (err) {
            toast.error(`Error: ${(err as Error).message}`);
        } finally {
            setSyncing(false);
        }
    };

    const exportVault = async () => {
        setExporting(true);
        try {
            const r = await fetch(`${API}/brains/export/payload`, { headers });
            if (!r.ok) {
                toast.error('No se pudo generar el vault');
                return;
            }
            const payload: ExportPayload = await r.json();
            const blob = await buildObsidianVault(payload);
            const date = new Date().toISOString().slice(0, 10);
            triggerDownload(blob, `${brain.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-vault-${date}.zip`);
            toast.success('Vault descargado');
        } catch (err) {
            toast.error(`Error: ${(err as Error).message}`);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="relative bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 rounded-2xl p-6 text-white overflow-hidden shadow-xl shadow-violet-500/20">
            {/* Decorative orbs */}
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-purple-400/20 blur-3xl" />

            <div className="relative flex items-start gap-4 flex-wrap">
                <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                    <Brain className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h2 className="text-2xl font-bold truncate">Cerebro de {brain.name}</h2>
                        <span className="px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-[10px] font-bold uppercase tracking-wider">{KIND_LABEL[brain.kind] || brain.kind}</span>
                    </div>
                    <p className="text-sm text-violet-100 max-w-2xl">
                        Tu inteligencia institucional local. Aprende de cada noticia, proyecto, evento y documento que cargás en el sitio. Conectada al Cerebro Maestro de Club Platform.
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={exportVault}
                        disabled={exporting}
                        className="flex items-center gap-2 px-4 py-2 bg-white/15 backdrop-blur-md hover:bg-white/25 disabled:opacity-50 rounded-xl text-sm font-medium border border-white/20 transition-colors whitespace-nowrap"
                    >
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Exportar a Obsidian
                    </button>
                    {canEdit && (
                        <button
                            onClick={syncOnboarding}
                            disabled={syncing}
                            className="flex items-center gap-2 px-4 py-2 bg-white/15 backdrop-blur-md hover:bg-white/25 disabled:opacity-50 rounded-xl text-sm font-medium border border-white/20 transition-colors whitespace-nowrap"
                            title="Re-importa la información del onboarding (descripción, contacto, redes) como memorias"
                        >
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Sincronizar con setup
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                <HeroStat label="Memorias" value={brain.memoryCount || 0} icon={<Database className="w-3.5 h-3.5" />} />
                <HeroStat label="Documentos" value={brain._count?.documents || 0} icon={<BookOpen className="w-3.5 h-3.5" />} />
                <HeroStat label="Relaciones" value={(brain._count?.outgoingRelations || 0) + (brain._count?.incomingRelations || 0)} icon={<Globe className="w-3.5 h-3.5" />} />
                <HeroStat label="Maestro" value={master?._count?.memories || master?.memoryCount || 0} icon={<Sparkles className="w-3.5 h-3.5" />} sub="conocimiento global" />
            </div>

            {!onboardingCompleted && (
                <div className="relative mt-4 bg-amber-400/20 border border-amber-300/30 rounded-xl px-4 py-3 flex items-start gap-3 text-amber-50 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                        <div className="font-bold mb-0.5">Setup del sitio incompleto</div>
                        <div className="text-amber-100/90">
                            Igual el cerebro funciona y absorbe contenido. Completá el wizard cuando puedas para que tu cerebro tenga más contexto institucional (misión, valores, contacto, redes). También podés configurar todo manualmente en la tab <strong>Configuración</strong>.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const HeroStat: React.FC<{ label: string; value: number; icon: React.ReactNode; sub?: string }> = ({ label, value, icon, sub }) => (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/10">
        <div className="flex items-center gap-1.5 text-[10px] text-white/80 uppercase tracking-wider font-bold mb-0.5">
            {icon}{label}
        </div>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        {sub && <div className="text-[10px] text-white/60">{sub}</div>}
    </div>
);

// ─── Overview tab ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OverviewTab: React.FC<{ brain: any; memories: any[]; master: any; loadingExtras?: boolean }> = ({ brain, memories, master, loadingExtras }) => {
    const memoryKindsCount = useMemo(() => {
        const map: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        memories?.forEach((m: any) => { map[m.kind] = (map[m.kind] || 0) + 1; });
        return map;
    }, [memories]);

    return (
        <div className="space-y-5">
            {/* Identidad */}
            <div className="bg-violet-50/40 border border-violet-100 rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-widest text-violet-700 font-bold mb-2 flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5" />Identidad del cerebro
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{brain.identityPrompt || '_(sin identidad definida)_'}</p>
                <div className="mt-2 text-[10px] text-violet-600">Editá en la tab <strong>Configuración</strong>.</div>
            </div>

            {/* Conexión al maestro */}
            {master && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                        <div className="text-sm font-bold text-gray-900">Conectado al Cerebro Maestro</div>
                        <div className="text-xs text-gray-600 mt-0.5">
                            Tu cerebro forma parte de una red más amplia. El maestro sabe de toda la red Club Platform — proyectos, conferencias, programas, oportunidades cross-club —
                            y puede compartir contexto cuando sea relevante para tu sitio.
                        </div>
                        <div className="text-xs text-indigo-700 mt-1.5 font-medium">
                            🌐 {(master._count?.memories || master.memoryCount || 0).toLocaleString()} memorias en el ecosistema global
                        </div>
                    </div>
                </div>
            )}

            {/* Distribución por tipo */}
            {Object.keys(memoryKindsCount).length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-600 font-bold mb-2">¿De qué aprende tu cerebro?</div>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(memoryKindsCount).map(([kind, count]) => {
                            const meta = MEMORY_KIND_META[kind] || { label: kind, icon: null, color: 'bg-gray-50 text-gray-700' };
                            return (
                                <div key={kind} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${meta.color}`}>
                                    {meta.icon}
                                    <span>{meta.label}</span>
                                    <span className="font-bold ml-0.5">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {loadingExtras && memories?.length === 0 && (
                <div className="flex items-center justify-center py-8 gap-2 bg-gray-50 rounded-xl">
                    <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
                    <p className="text-xs text-gray-500">Cargando memorias…</p>
                </div>
            )}
            {!loadingExtras && memories?.length === 0 && (
                <div className="text-center py-8 bg-gray-50 rounded-xl">
                    <Lightbulb className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">Tu cerebro todavía está vacío</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                        Empezá creando una noticia, un proyecto o subiendo un documento institucional desde la tab <strong>Documentos</strong>. El cerebro absorbe automáticamente todo lo que publicás.
                    </p>
                </div>
            )}
        </div>
    );
};

// ─── Memories tab ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MemoriesTab: React.FC<{ brainId: string; memories: any[]; headers: Record<string, string>; loadingExtras?: boolean }> = ({ brainId, memories: initialMemories, headers, loadingExtras: _loadingExtras }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [memories, setMemories] = useState<any[]>(initialMemories || []);
    const [loading, setLoading] = useState(false);
    const [noteTitle, setNoteTitle] = useState('');
    const [noteContent, setNoteContent] = useState('');
    const [noteOpen, setNoteOpen] = useState(false);
    const [savingNote, setSavingNote] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/brains/${brainId}/memories?limit=100`, { headers });
            if (r.ok) setMemories(await r.json());
        } finally {
            setLoading(false);
        }
    }, [brainId, headers]);

    useEffect(() => { if (memories.length < 30) refresh(); }, [refresh, memories.length]);

    const saveNote = async () => {
        if (!noteTitle.trim() || !noteContent.trim()) return;
        setSavingNote(true);
        try {
            const r = await fetch(`${API}/brains/${brainId}/notes`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: noteTitle, content: noteContent }),
            });
            if (r.ok) {
                toast.success('Nota agregada al cerebro');
                setNoteTitle(''); setNoteContent(''); setNoteOpen(false);
                await refresh();
            }
        } finally {
            setSavingNote(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-gray-500">{memories.length} memorias visibles · ordenadas por última actualización</div>
                <button
                    onClick={() => setNoteOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-xs font-medium"
                >
                    <StickyNote className="w-3.5 h-3.5" />Agregar nota manual
                </button>
            </div>

            {noteOpen && (
                <div className="bg-violet-50/40 border border-violet-100 rounded-xl p-3 space-y-2">
                    <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Título de la nota…" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white" />
                    <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="Contenido (texto libre — el cerebro lo embedee y lo recordará)…" rows={4} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white" />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setNoteOpen(false); setNoteTitle(''); setNoteContent(''); }} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">Cancelar</button>
                        <button onClick={saveNote} disabled={savingNote || !noteTitle.trim() || !noteContent.trim()} className="px-4 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-lg font-medium">
                            {savingNote ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Guardar nota'}
                        </button>
                    </div>
                </div>
            )}

            {loading && memories.length === 0 ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-violet-500 animate-spin" /></div>
            ) : memories.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-xl">Sin memorias todavía.</div>
            ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                    {memories.map(m => {
                        const meta = MEMORY_KIND_META[m.kind] || { label: m.kind, icon: null, color: 'bg-gray-50 text-gray-700' };
                        return (
                            <div key={m.id} className="bg-gray-50 hover:bg-gray-100 rounded-lg p-3 transition-colors">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.color}`}>
                                        {meta.icon}{meta.label}
                                    </span>
                                    {m.sourceType === 'Onboarding' && <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-bold">Onboarding</span>}
                                    {m.sourceType === 'BrainDocument' && <span className="text-[10px] bg-indigo-100 text-indigo-700 rounded-full px-1.5 py-0.5 font-bold">Documento</span>}
                                    <span className="text-[10px] text-gray-400 ml-auto">{new Date(m.updatedAt).toLocaleDateString()}</span>
                                </div>
                                <div className="text-sm font-semibold text-gray-900 mb-0.5">{m.title}</div>
                                <div className="text-xs text-gray-600 line-clamp-2">{m.content}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Search tab ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SearchTab: React.FC<{ brain: any; master: any; headers: Record<string, string> }> = ({ brain, master, headers }) => {
    const [query, setQuery] = useState('');
    const [includeMaster, setIncludeMaster] = useState(false);
    const [searching, setSearching] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [results, setResults] = useState<any[]>([]);

    const run = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const url = includeMaster && master?.id ? `${API}/brains/master/query` : `${API}/brains/${brain.id}/query`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, k: 10 }),
            });
            if (r.ok) {
                const j = await r.json();
                setResults(j.results || []);
            } else {
                toast.error('Error al buscar');
            }
        } finally {
            setSearching(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="text-xs text-gray-500">
                Búsqueda semántica con embeddings — preguntá en lenguaje natural, el cerebro encuentra lo más relevante por significado (no por keywords).
            </div>
            <div className="flex gap-2 flex-wrap">
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run()}
                    placeholder="Ej: proyectos de educación, voluntariado juvenil, alianzas con universidades..."
                    className="flex-1 min-w-[240px] px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
                />
                <button
                    onClick={run}
                    disabled={searching || !query.trim()}
                    className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium flex items-center gap-2"
                >
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}Buscar
                </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={includeMaster} onChange={e => setIncludeMaster(e.target.checked)} />
                Incluir el conocimiento del Cerebro Maestro (red global)
            </label>

            {results.length === 0 && !searching && query && (
                <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-xl">
                    Sin resultados para "{query}". Probá con otras palabras o agregá más contenido al cerebro.
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {results.map((r, i) => {
                        const m = r.memory;
                        const meta = MEMORY_KIND_META[m.kind] || { label: m.kind, icon: null, color: 'bg-gray-50 text-gray-700' };
                        return (
                            <div key={m.id} className="border border-gray-200 rounded-xl p-3 hover:border-violet-200 transition-colors">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="text-[10px] font-bold text-violet-700 bg-violet-100 rounded px-1.5 py-0.5">#{i + 1}</span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.color}`}>
                                        {meta.icon}{meta.label}
                                    </span>
                                    <span className="text-[10px] text-emerald-700 font-mono ml-auto">{(r.score * 100).toFixed(1)}% match</span>
                                </div>
                                <div className="text-sm font-semibold text-gray-900 mb-0.5">{m.title}</div>
                                <div className="text-xs text-gray-600 line-clamp-3">{m.content}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Config tab ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ConfigTab: React.FC<{ brain: any; canEdit: boolean; headers: Record<string, string>; onUpdate: () => void }> = ({ brain, canEdit, headers, onUpdate }) => {
    const md = brain.metadata || {};
    const cfg = md.config || {};

    const [identityPrompt, setIdentityPrompt] = useState<string>(brain.identityPrompt || '');
    const [config, setConfig] = useState({
        learnFromPosts:     cfg.learnFromPosts !== false,
        learnFromProjects:  cfg.learnFromProjects !== false,
        learnFromEvents:    cfg.learnFromEvents !== false,
        learnFromDocuments: cfg.learnFromDocuments !== false,
        learnFromMembers:   cfg.learnFromMembers !== false,
        shareWithMaster:    cfg.shareWithMaster !== false,
    });
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const overridden = md.identityPromptOverridden === true;

    const dirty = identityPrompt !== (brain.identityPrompt || '') ||
                  JSON.stringify(config) !== JSON.stringify({
                      learnFromPosts:     cfg.learnFromPosts !== false,
                      learnFromProjects:  cfg.learnFromProjects !== false,
                      learnFromEvents:    cfg.learnFromEvents !== false,
                      learnFromDocuments: cfg.learnFromDocuments !== false,
                      learnFromMembers:   cfg.learnFromMembers !== false,
                      shareWithMaster:    cfg.shareWithMaster !== false,
                  });

    const save = async () => {
        if (!canEdit) return;
        setSaving(true);
        try {
            const r = await fetch(`${API}/brains/${brain.id}/settings`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ identityPrompt, config }),
            });
            if (r.ok) {
                toast.success('Configuración guardada');
                onUpdate();
            } else {
                const err = await r.json().catch(() => ({}));
                toast.error(err.detail || err.error || 'Error al guardar');
            }
        } finally {
            setSaving(false);
        }
    };

    const resetToAuto = async () => {
        if (!canEdit) return;
        if (!confirm('Restaurar la identidad automática derivada del onboarding del sitio? Tu texto actual se reemplazará.')) return;
        setResetting(true);
        try {
            const r = await fetch(`${API}/brains/${brain.id}/settings`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ resetIdentityToAuto: true }),
            });
            if (r.ok) {
                const j = await r.json();
                setIdentityPrompt(j.brain.identityPrompt || '');
                toast.success('Identidad restaurada al valor del onboarding');
                onUpdate();
            }
        } finally {
            setResetting(false);
        }
    };

    return (
        <div className="space-y-6">
            {!canEdit && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    Solo lectura — no tenés permisos para editar este cerebro.
                </div>
            )}

            {/* Identity prompt */}
            <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div>
                        <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <MessageCircle className="w-4 h-4 text-violet-600" />Identidad del cerebro
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                            Cómo razona, qué voz tiene, qué sabe. Este texto se le pasa al LLM como system prompt cada vez que el cerebro genera contenido o responde.
                        </div>
                    </div>
                    {overridden && (
                        <button
                            onClick={resetToAuto}
                            disabled={resetting || !canEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-50 rounded-lg font-medium"
                        >
                            {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Restaurar desde onboarding
                        </button>
                    )}
                </div>
                <textarea
                    value={identityPrompt}
                    onChange={e => setIdentityPrompt(e.target.value)}
                    disabled={!canEdit}
                    rows={10}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono leading-relaxed focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none disabled:bg-gray-50"
                    placeholder="Describí cómo querés que tu cerebro razone y qué identidad tenga..."
                />
                {overridden && <div className="mt-1.5 text-[11px] text-violet-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Personalizada — no se sobrescribe al sincronizar con el onboarding.</div>}
                {!overridden && <div className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-1"><Sparkles className="w-3 h-3" />Generada automáticamente del onboarding.</div>}
            </div>

            {/* Aprendizaje automático */}
            <div>
                <div className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-violet-600" />¿De qué aprende tu cerebro?
                </div>
                <div className="text-xs text-gray-500 mb-3">
                    Cada vez que se crea o edita uno de estos elementos en tu sitio, se indexa automáticamente en el cerebro como memoria embebida.
                </div>
                <div className="space-y-2">
                    <ToggleRow checked={config.learnFromPosts}     onChange={v => setConfig(c => ({ ...c, learnFromPosts: v }))}     disabled={!canEdit} label="Noticias / blog"           sub="Posts publicados en el sitio" />
                    <ToggleRow checked={config.learnFromProjects}  onChange={v => setConfig(c => ({ ...c, learnFromProjects: v }))}  disabled={!canEdit} label="Proyectos"                sub="Iniciativas, programas, planes" />
                    <ToggleRow checked={config.learnFromEvents}    onChange={v => setConfig(c => ({ ...c, learnFromEvents: v }))}    disabled={!canEdit} label="Eventos del calendario"   sub="Reuniones, capacitaciones, conferencias" />
                    <ToggleRow checked={config.learnFromDocuments} onChange={v => setConfig(c => ({ ...c, learnFromDocuments: v }))} disabled={!canEdit} label="Documentos institucionales" sub="PDFs, manuales, reglamentos subidos" />
                    <ToggleRow checked={config.learnFromMembers}   onChange={v => setConfig(c => ({ ...c, learnFromMembers: v }))}   disabled={!canEdit} label="Miembros / directivos"     sub="Perfiles públicos del staff" />
                </div>
            </div>

            {/* Visibilidad cross-brain */}
            <div>
                <div className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-violet-600" />Conexión con el ecosistema
                </div>
                <ToggleRow
                    checked={config.shareWithMaster}
                    onChange={v => setConfig(c => ({ ...c, shareWithMaster: v }))}
                    disabled={!canEdit}
                    label="Compartir mis memorias con el Cerebro Maestro"
                    sub="Permite que el conocimiento de tu sitio enriquezca la red Club Platform. La privacidad de cada memoria sigue siendo individual."
                />
            </div>

            {canEdit && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                    <button
                        onClick={save}
                        disabled={saving || !dirty}
                        className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar cambios
                    </button>
                </div>
            )}
        </div>
    );
};

const ToggleRow: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; sub?: string }> = ({ checked, onChange, disabled, label, sub }) => (
    <label className={`flex items-start gap-3 p-3 border border-gray-200 rounded-xl ${disabled ? '' : 'cursor-pointer hover:bg-gray-50'}`}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} className="mt-0.5 w-4 h-4 accent-violet-600" />
        <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">{label}</div>
            {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
    </label>
);

export default SiteBrainPanel;
