import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import {
    Brain, Sparkles, BookOpen, Database, Search, Settings, Loader2,
    CheckCircle2, AlertCircle, RefreshCw, Save, Download, Globe,
    FileText, Lightbulb, MessageCircle, ChevronRight, Atom, Activity,
    Calendar as CalendarIcon, FolderKanban, Users, StickyNote, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import BrainChatTab, { BrainActivityWidget } from './BrainChatTab';

// Lazy load del componente de grafo 3D — Three.js es ~1.3MB
const BrainGraph3D = React.lazy(() => import('./BrainGraph3D'));
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
    isSuperAdmin?: boolean;
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
    CHAT:        { label: 'Conversación', icon: <MessageCircle className="w-3 h-3" />, color: 'bg-violet-50 text-violet-700' },
};

const SiteBrainPanel: React.FC<SiteBrainPanelProps> = ({ headers, currentUser, isSuperAdmin: _isSuperAdmin }) => {
    const [data, setData] = useState<BrainMe | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [extras, setExtras] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [loadingExtras, setLoadingExtras] = useState(false);
    const [initializing, setInitializing] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [errorState, setErrorState] = useState<{ status: number | null; message: string; isPingFail?: boolean; code?: string } | null>(null);
    const [tab, setTab] = useState<'overview' | 'graph' | 'chat' | 'activity' | 'docs' | 'memories' | 'search' | 'config'>('chat');

    const fetchMe = useCallback(async () => {
        setLoading(true);
        setErrorState(null);

        // v4.369: auto-retry transparente para read-after-write lag.
        // Cuando /me devuelve brain:null pero scope:site (el user tiene clubId
        // pero Prisma todavía no encuentra el brain), reintentamos hasta 3 veces
        // con backoff. Resuelve el caso edge del primer load tras crear el brain.
        const RETRY_DELAYS_MS = [800, 1500, 3000];

        async function singleFetch() {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20_000);
            try {
                const r = await fetch(`${API}/brains/me`, { headers, signal: controller.signal });
                if (r.ok) {
                    const json = await r.json();
                    return { ok: true as const, json };
                }
                const err = await r.json().catch(() => ({}));
                return { ok: false as const, status: r.status, err };
            } finally {
                clearTimeout(timeoutId);
            }
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let lastJson: any = null;
            for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
                const result = await singleFetch();
                if (!result.ok) {
                    setErrorState({
                        status: result.status,
                        code: result.err?.error,
                        message: result.err?.message || result.err?.detail || result.err?.error || `HTTP ${result.status}`,
                    });
                    if (result.status !== 503) {
                        toast.error(result.err?.detail || result.err?.error || `No se pudo cargar el cerebro (${result.status})`);
                    }
                    return;
                }
                lastJson = result.json;
                // Caso éxito
                if (result.json.scope === 'site' && result.json.brain) {
                    setData(result.json);
                    return;
                }
                // Caso retry-able: scope=site pero brain:null
                if (result.json.scope === 'site' && !result.json.brain && attempt < RETRY_DELAYS_MS.length) {
                    await new Promise(res => setTimeout(res, RETRY_DELAYS_MS[attempt]));
                    continue;
                }
                // Otros casos terminales (not-initialized, master-only, degraded)
                setData(result.json);
                return;
            }
            // Agotamos retries
            if (lastJson) setData(lastJson);
        } catch (err) {
            const e = err as Error;
            const isAbort = e.name === 'AbortError';
            let isInfraFail = false;
            if (isAbort) {
                try {
                    const pingCtrl = new AbortController();
                    setTimeout(() => pingCtrl.abort(), 4000);
                    const pr = await fetch(`${API}/brain-quick`, { signal: pingCtrl.signal });
                    if (!pr.ok) isInfraFail = true;
                } catch {
                    isInfraFail = true;
                }
            }
            setErrorState({
                status: null,
                isPingFail: isInfraFail,
                message: isAbort
                    ? (isInfraFail
                        ? 'El servidor (Vercel) no responde — quizás está caído o el deploy todavía no terminó.'
                        : 'Timeout: /api/brains/me se cuelga, pero /brain-quick (sin DB) responde. Problema en la base de datos.')
                    : e.message,
            });
            toast.error(isAbort ? 'Timeout cargando el cerebro' : `Error: ${e.message}`);
        } finally {
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
    const migrateTables = useCallback(async () => {
        setMigrating(true);
        try {
            const r = await fetch(`${API}/brains/migrate`, { method: 'POST', headers });
            if (r.ok) {
                const j = await r.json();
                const okCount = j.results?.filter((x: { ok: boolean }) => x.ok).length || 0;
                const failCount = (j.results?.length || 0) - okCount;
                if (j.ok) {
                    toast.success(`Migración OK · ${okCount} pasos ejecutados en ${j.elapsedMs}ms`);
                } else {
                    toast.warning(`Migración parcial · ${okCount} ok / ${failCount} fallidos`);
                }
                await fetchMe();
            } else {
                const err = await r.json().catch(() => ({}));
                toast.error(`Migración falló: ${err.detail || err.error || r.status}`);
            }
        } catch (err) {
            toast.error(`Error: ${(err as Error).message}`);
        } finally {
            setMigrating(false);
        }
    }, [headers, fetchMe]);

    const initializeBrain = useCallback(async () => {
        setInitializing(true);
        try {
            const r = await fetch(`${API}/brains/me/initialize`, { method: 'POST', headers });
            const j = await r.json().catch(() => ({}));
            if (r.ok && j.brain?.id) {
                toast.success(`Cerebro creado en ${j.elapsedMs}ms`);
                // v4.367: usamos la respuesta del initialize DIRECTAMENTE sin
                // fetchMe — evita read-after-write inconsistency en Prisma.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setData(j as any);
                // Cargar los extras (memorias, docs, relaciones) en background
                fetchExtras();
            } else if (r.ok && j.ok === false && j.diagnostic) {
                console.warn('[initializeBrain] no brain created:', j.diagnostic);
                toast.warning('No se pudo crear el cerebro — revisá el diagnóstico abajo');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setData(j as any);
            } else {
                toast.error(j.detail || j.error || `HTTP ${r.status}: no se pudo inicializar`);
            }
        } catch (err) {
            toast.error(`Error: ${(err as Error).message}`);
        } finally {
            setInitializing(false);
        }
    }, [headers, fetchExtras]);


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
        const isNotMigrated = errorState.code === 'BRAINS_NOT_MIGRATED' || errorState.status === 503;

        if (isNotMigrated) {
            return (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8">
                    <div className="max-w-2xl mx-auto text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                            <Brain className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">El sistema de cerebros aún no está activo</h3>
                        <p className="text-sm text-gray-700 mb-4">
                            Las tablas de la base de datos para el Cerebro Inteligente no fueron creadas en este entorno todavía.
                        </p>
                        <div className="text-xs text-gray-600 mb-5 bg-white/80 rounded-xl p-4 max-w-md mx-auto text-left">
                            <p className="font-bold text-gray-800 mb-2 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />Activación rápida y segura
                            </p>
                            <p className="mb-2">Se van a crear estas tablas con <code>CREATE TABLE IF NOT EXISTS</code>:</p>
                            <ul className="space-y-0.5 list-disc list-inside font-mono text-[11px]">
                                <li>Brain</li>
                                <li>BrainMemory</li>
                                <li>BrainRelation</li>
                                <li>BrainDocument</li>
                            </ul>
                            <p className="mt-2 text-amber-700 font-medium">Operación segura e idempotente: no toca datos existentes.</p>
                        </div>
                        <button
                            onClick={migrateTables}
                            disabled={migrating}
                            className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium shadow-md shadow-amber-500/20 flex items-center gap-2 mx-auto"
                        >
                            {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {migrating ? 'Migrando tablas…' : 'Activar el sistema ahora'}
                        </button>
                    </div>
                </div>
            );
        }

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

    if (data?.scope === 'not-initialized') {
        return (
            <div className="bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 border border-violet-200 rounded-2xl p-8">
                <div className="max-w-2xl mx-auto text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                        <Brain className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Inicializá tu cerebro inteligente</h3>
                    <p className="text-sm text-gray-600 mb-4">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(data as any).detail || 'Tu cerebro institucional aún no fue creado. Es un proceso rápido y automático.'}
                    </p>
                    <div className="text-xs text-gray-500 mb-5 bg-white/60 rounded-xl p-3 max-w-md mx-auto text-left">
                        <p className="font-bold text-gray-700 mb-1">¿Qué pasa al inicializar?</p>
                        <ul className="space-y-1 list-disc list-inside">
                            <li>Se crea el cerebro de tu sitio con identidad derivada del onboarding</li>
                            <li>Se sincroniza la descripción, contacto y redes sociales como memorias</li>
                            <li>Quedás conectado al Cerebro Maestro de Club Platform</li>
                        </ul>
                    </div>
                    <button
                        onClick={initializeBrain}
                        disabled={initializing}
                        className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium shadow-md shadow-violet-500/20 flex items-center gap-2 mx-auto"
                    >
                        {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {initializing ? 'Creando cerebro…' : 'Inicializar mi cerebro'}
                    </button>
                </div>
            </div>
        );
    }

    if (!data?.brain) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        const scopeText = d?.scope || 'unknown';
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
                <div className="max-w-2xl mx-auto text-center">
                    <Brain className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                    <p className="text-sm font-medium text-amber-900 mb-2">Tu cerebro aún no se creó</p>
                    <p className="text-xs text-amber-700 mb-4">
                        Scope detectado: <code className="bg-amber-100 px-1 rounded">{scopeText}</code>
                        {d?.detail && <> — {d.detail}</>}
                    </p>

                    {/* Dump completo del response del backend para debug */}
                    <details className="text-left bg-white/80 rounded-lg p-3 mb-4 text-[10px] font-mono" open>
                        <summary className="cursor-pointer text-amber-900 font-bold mb-2">Información del backend (click para expandir/colapsar)</summary>
                        <pre className="mt-2 text-amber-800 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">{JSON.stringify(d, null, 2)}</pre>
                    </details>

                    <div className="flex flex-col gap-2 items-center">
                        <button
                            onClick={initializeBrain}
                            disabled={initializing}
                            className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                        >
                            {initializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {initializing ? 'Creando…' : 'Forzar creación del cerebro'}
                        </button>
                        <button
                            onClick={() => fetchMe()}
                            className="px-4 py-1.5 text-xs text-amber-800 hover:bg-amber-100 rounded-lg font-medium flex items-center gap-1.5"
                        >
                            <RefreshCw className="w-3 h-3" />Reintentar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const brain = data.brain;
    // v4.372: el backend ya decide canEdit usando resolveUserScope (mira el
    // JWT primero, después la User table, después el subdomain). Confiar en
    // su decisión en vez de re-checar acá donde el JWT puede no tener clubId.
    // Fallback al check del frontend si por algún motivo no viene en el response.
    const canEdit = data.canEdit !== undefined
        ? !!data.canEdit
        : !!currentUser && (
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
                    <TabBtn id="chat"     current={tab} onClick={setTab} icon={<MessageCircle className="w-4 h-4" />}>Chat</TabBtn>
                    <TabBtn id="graph"    current={tab} onClick={setTab} icon={<Atom className="w-4 h-4" />}>Grafo</TabBtn>
                    <TabBtn id="activity" current={tab} onClick={setTab} icon={<Activity className="w-4 h-4" />}>Actividad</TabBtn>
                    <TabBtn id="overview" current={tab} onClick={setTab} icon={<Sparkles className="w-4 h-4" />}>Resumen</TabBtn>
                    <TabBtn id="docs"     current={tab} onClick={setTab} icon={<BookOpen className="w-4 h-4" />}>Documentos</TabBtn>
                    <TabBtn id="memories" current={tab} onClick={setTab} icon={<Database className="w-4 h-4" />}>Memorias <span className="ml-1 text-[10px] bg-violet-100 text-violet-700 rounded-full px-1.5">{brain.memoryCount}</span></TabBtn>
                    <TabBtn id="search"   current={tab} onClick={setTab} icon={<Search className="w-4 h-4" />}>Búsqueda</TabBtn>
                    <TabBtn id="config"   current={tab} onClick={setTab} icon={<Settings className="w-4 h-4" />}>Configuración</TabBtn>
                </div>

                <div className="p-6">
                    {tab === 'chat'     && <BrainChatTab brain={brain} headers={headers} />}
                    {tab === 'activity' && <ActivityTab headers={headers} />}
                    {tab === 'overview' && <OverviewTab brain={brain} memories={extras?.memories || []} master={data.master} loadingExtras={loadingExtras} headers={headers} canEdit={canEdit} onRefresh={fetchMe} />}
                    {tab === 'graph'    && <GraphTab brain={brain} headers={headers} />}
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

// ─── Activity tab ────────────────────────────────────────────────────────────
const ActivityTab: React.FC<{ headers: Record<string, string> }> = ({ headers }) => (
    <div className="space-y-3">
        <div>
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-600" />Actividad del cerebro
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
                Todo lo que tu cerebro hizo recientemente: memorias indexadas, documentos procesados, conversaciones, tools ejecutados, sincronizaciones.
            </p>
        </div>
        <BrainActivityWidget headers={headers} limit={50} />
    </div>
);

// ─── Graph tab ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GraphTab: React.FC<{ brain: any; headers: Record<string, string> }> = ({ brain, headers }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [graphData, setGraphData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [includeMaster, setIncludeMaster] = useState(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedNode, setSelectedNode] = useState<any>(null);

    const loadGraph = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/brains/me/graph?master=${includeMaster}&memoryLimit=300`, { headers });
            if (r.ok) {
                const data = await r.json();
                setGraphData(data);
            } else {
                toast.error('No se pudo cargar el grafo');
            }
        } catch (err) {
            toast.error(`Error: ${(err as Error).message}`);
        } finally {
            setLoading(false);
        }
    }, [headers, includeMaster]);

    useEffect(() => { loadGraph(); }, [loadGraph]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                    <div className="text-xs text-gray-500">
                        Visualización tipo Obsidian de tu cerebro. Cada esfera es una memoria o brain conectado.
                    </div>
                    {graphData?.stats && (
                        <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-3 flex-wrap">
                            <span>{graphData.stats.brains} brains</span>
                            <span>{graphData.stats.memories} memorias</span>
                            <span>{graphData.stats.relations} relaciones</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={includeMaster} onChange={e => setIncludeMaster(e.target.checked)} className="accent-violet-600" />
                        Incluir Cerebro Maestro
                    </label>
                    <button
                        onClick={loadGraph}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 hover:bg-violet-200 disabled:opacity-50 text-violet-700 rounded-lg text-xs font-medium"
                    >
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Refrescar
                    </button>
                </div>
            </div>

            {loading && !graphData ? (
                <div className="flex items-center justify-center py-20 bg-slate-900 rounded-2xl">
                    <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                </div>
            ) : !graphData || graphData.nodes.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <Atom className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">Sin contenido en el grafo</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                        Empezá creando noticias, proyectos o subiendo documentos. Cada uno aparece como un nodo conectado a <strong>{brain.name}</strong>.
                    </p>
                </div>
            ) : (
                <Suspense fallback={<div className="h-[620px] flex items-center justify-center bg-slate-950 rounded-2xl"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>}>
                    <BrainGraph3D
                        data={graphData}
                        height={620}
                        onNodeClick={(node) => setSelectedNode(node)}
                    />
                </Suspense>
            )}

            {selectedNode && (
                <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-widest text-violet-700 font-bold mb-1">
                                {selectedNode.nodeType === 'brain' ? `Cerebro · ${selectedNode.kind}` : `Memoria · ${selectedNode.kind}`}
                                {selectedNode.isMine && <span className="ml-2 px-1.5 py-0.5 bg-violet-200 rounded text-[9px]">Mi cerebro</span>}
                                {selectedNode.isMaster && <span className="ml-2 px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded text-[9px]">Maestro</span>}
                            </div>
                            <div className="text-sm font-bold text-gray-900">{selectedNode.name}</div>
                            {selectedNode.location && <div className="text-xs text-gray-600 mt-0.5">{selectedNode.location}</div>}
                            {selectedNode.memoryCount !== undefined && (
                                <div className="text-xs text-gray-500 mt-1">{selectedNode.memoryCount} memorias</div>
                            )}
                            {selectedNode.sourceType && (
                                <div className="text-[10px] text-gray-500 mt-1 font-mono">
                                    {selectedNode.sourceType} · {selectedNode.sourceId || 'sin id'}
                                </div>
                            )}
                        </div>
                        <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Overview tab ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Renderer Markdown-lite (sin dependencias): headings ##/###, bullets - / ·,
// y **negrita** inline. Suficiente para el dossier que genera el LLM.
const renderInline = (text: string): React.ReactNode =>
    text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : <React.Fragment key={i}>{part}</React.Fragment>
    );

const DossierBody: React.FC<{ text: string }> = ({ text }) => {
    const lines = text.split('\n');
    const blocks: React.ReactNode[] = [];
    let bullets: string[] = [];
    const flushBullets = (key: string) => {
        if (bullets.length) {
            blocks.push(
                <ul key={key} className="list-disc list-inside space-y-0.5 text-sm text-gray-700 my-1">
                    {bullets.map((b, i) => <li key={i}>{renderInline(b)}</li>)}
                </ul>
            );
            bullets = [];
        }
    };
    lines.forEach((raw, idx) => {
        const line = raw.trimEnd();
        if (/^###\s+/.test(line)) {
            flushBullets(`b${idx}`);
            blocks.push(<h5 key={idx} className="text-xs font-bold text-gray-800 mt-3 mb-0.5 uppercase tracking-wide">{renderInline(line.replace(/^###\s+/, ''))}</h5>);
        } else if (/^##\s+/.test(line)) {
            flushBullets(`b${idx}`);
            blocks.push(<h4 key={idx} className="text-sm font-bold text-violet-800 mt-3 mb-1 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" />{renderInline(line.replace(/^##\s+/, ''))}</h4>);
        } else if (/^[-·•*]\s+/.test(line)) {
            bullets.push(line.replace(/^[-·•*]\s+/, ''));
        } else if (line.trim() === '') {
            flushBullets(`b${idx}`);
        } else {
            flushBullets(`b${idx}`);
            blocks.push(<p key={idx} className="text-sm text-gray-700 leading-relaxed my-1">{renderInline(line)}</p>);
        }
    });
    flushBullets('b-final');
    return <div>{blocks}</div>;
};

const OverviewTab: React.FC<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brain: any; memories: any[]; master: any; loadingExtras?: boolean;
    headers: Record<string, string>; canEdit: boolean; onRefresh: () => void;
}> = ({ brain, memories, master, loadingExtras, headers, canEdit }) => {
    const memoryKindsCount = useMemo(() => {
        const map: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        memories?.forEach((m: any) => { map[m.kind] = (map[m.kind] || 0) + 1; });
        return map;
    }, [memories]);

    const [regenerating, setRegenerating] = useState(false);
    const [dossier, setDossier] = useState<string | null>(brain.dossier || null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [meta, setMeta] = useState<any>(brain.dossierMeta || null);
    const [updatedAt, setUpdatedAt] = useState<string | null>(brain.dossierUpdatedAt || null);

    const regenerate = useCallback(async () => {
        setRegenerating(true);
        try {
            const r = await fetch(`${API}/brains/${brain.id}/dossier/regenerate`, { method: 'POST', headers });
            const json = await r.json();
            if (r.ok && json.ok) {
                setDossier(json.dossier);
                setMeta(json.dossierMeta);
                setUpdatedAt(json.dossierUpdatedAt);
                toast.success('Dossier del sitio actualizado 🧬');
            } else {
                toast.error(json.message || 'No se pudo generar el dossier');
            }
        } catch {
            toast.error('Error de red al generar el dossier');
        } finally {
            setRegenerating(false);
        }
    }, [brain.id, headers]);

    const completeness = typeof meta?.completeness === 'number' ? meta.completeness : null;
    const highlights: string[] = Array.isArray(meta?.highlights) ? meta.highlights : [];
    const gaps: string[] = Array.isArray(meta?.gaps) ? meta.gaps : [];
    const docCount = meta?.docCount ?? 0;

    return (
        <div className="space-y-5">
            {/* Dossier vivo del sitio */}
            <div className="border border-violet-100 rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-white">
                        <Sparkles className="w-4 h-4" />
                        <span className="font-bold text-sm">Dossier del sitio</span>
                        <span className="text-[11px] text-violet-100">síntesis viva de lo que el cerebro sabe</span>
                    </div>
                    {canEdit && (
                        <button
                            onClick={regenerate}
                            disabled={regenerating}
                            className="flex items-center gap-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 text-white px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                        >
                            {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {regenerating ? 'Sintetizando…' : 'Regenerar'}
                        </button>
                    )}
                </div>

                <div className="p-4 bg-white">
                    {dossier ? (
                        <>
                            <div className="flex items-center gap-3 flex-wrap mb-3 text-[11px] text-gray-500">
                                <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{docCount} documento{docCount === 1 ? '' : 's'} analizado{docCount === 1 ? '' : 's'}</span>
                                {updatedAt && <span>· Actualizado {new Date(updatedAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                            </div>

                            {completeness !== null && (
                                <div className="mb-3">
                                    <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
                                        <span className="font-medium">Completitud institucional</span>
                                        <span className="font-bold text-violet-700">{completeness}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all" style={{ width: `${completeness}%` }} />
                                    </div>
                                </div>
                            )}

                            {highlights.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {highlights.map((h, i) => (
                                        <span key={i} className="text-[11px] bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full">{h}</span>
                                    ))}
                                </div>
                            )}

                            <DossierBody text={dossier} />

                            {gaps.length > 0 && (
                                <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-1.5">
                                        <AlertCircle className="w-3.5 h-3.5" /> Información que falta cargar
                                    </div>
                                    <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5">
                                        {gaps.map((g, i) => <li key={i}>{g}</li>)}
                                    </ul>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-6">
                            <Sparkles className="w-9 h-9 text-violet-300 mx-auto mb-2" />
                            <p className="text-sm font-medium text-gray-600">Todavía no hay dossier</p>
                            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                                Subí un documento institucional o publicá contenido y el cerebro sintetizará automáticamente un resumen detallado de tu sitio.
                                {canEdit && ' También podés generarlo ahora con el botón "Regenerar".'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

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
    const [contextNote, setContextNote] = useState<string>(md.contextNote || '');
    const [kind, setKind] = useState<string>(brain.kind || 'CLUB');
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
                  contextNote !== (md.contextNote || '') ||
                  kind !== (brain.kind || 'CLUB') ||
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
                body: JSON.stringify({ identityPrompt, contextNote, kind, config }),
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

            {/* Tipo de sitio (recategorización) */}
            {brain.kind !== 'DISTRICT' && brain.kind !== 'MASTER' && (
                <div>
                    <div className="mb-2">
                        <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-violet-600" />Tipo de sitio
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                            Qué representa esta cuenta. Define la etiqueta del cerebro y la identidad automática. Cambialo si tu sitio no es un club (por ejemplo, un <strong>evento</strong> o una <strong>convención/conferencia</strong>).
                        </div>
                    </div>
                    <select
                        value={kind}
                        onChange={e => setKind(e.target.value)}
                        disabled={!canEdit}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none disabled:bg-gray-50 bg-white"
                    >
                        <option value="CLUB">Club Rotary</option>
                        <option value="EVENT">Evento</option>
                        <option value="CONFERENCE">Conferencia / Convención</option>
                        <option value="ASSOCIATION">Asociación</option>
                        <option value="PROGRAM">Programa de Intercambio</option>
                        <option value="PROJECT_FAIR">Feria de Proyectos</option>
                        <option value="FOUNDATION">Fundación</option>
                    </select>
                    {kind !== (brain.kind || 'CLUB') && (
                        <div className="mt-1.5 text-[11px] text-amber-700 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />Al guardar se recategoriza la cuenta y se regenera el dossier.
                        </div>
                    )}
                </div>
            )}

            {/* Contexto institucional (fuente primaria) */}
            <div>
                <div className="mb-2">
                    <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-600" />Contexto institucional
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        Escribí en tus palabras qué es este sitio y a qué se dedica (por ejemplo: una <strong>convención</strong>, un <strong>evento</strong>, una fundación o un club). El cerebro lo toma como <strong>fuente primaria</strong> —junto con el análisis de tus documentos— para construir el Dossier y responder en el chat. Manda sobre cualquier etiqueta automática.
                    </div>
                </div>
                <textarea
                    value={contextNote}
                    onChange={e => setContextNote(e.target.value)}
                    disabled={!canEdit}
                    rows={5}
                    maxLength={4000}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm leading-relaxed focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none disabled:bg-gray-50"
                    placeholder="Ej.: 'Jaque Mate A La Polio' es una convención/evento solidario para recaudar fondos contra la polio. No es un club rotario: es una actividad organizada por... Sus objetivos son..."
                />
                <div className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />Al guardar, el Dossier se regenera con este contexto. {contextNote.length}/4000
                </div>
            </div>

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
