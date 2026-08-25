// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — Motor de imagen y benchmark de modelos
// v4.897.0
//
// Dos tarjetas del panel del operador:
//
//   · «Motor de imagen» — la configuración técnica: proveedor, modo, modelo
//     activo, fallback y candidatos agregados a mano.
//   · «Modelos IA — benchmark» — la evidencia: mismas fotos × mismos prompts
//     × N modelos, lado a lado, con votos humanos y activación explícita.
//
// NADA de esto llega al formulario público: el visitante sigue viendo club,
// años, fotografía y un botón. Y NADA de acá cambia producción solo — el
// benchmark recomienda, la persona activa.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Cpu, FlaskConical, Loader2, AlertTriangle, CheckCircle2, Info, Star,
    ThumbsUp, ThumbsDown, Rocket, Plus, RefreshCw,
} from 'lucide-react';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_PHOTO_LABEL, MAX_PHOTO_BYTES } from '../../../lib/anniversarySpec';

const API = import.meta.env.VITE_API_URL || '/api';
const auth = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

// ─── Formas ────────────────────────────────────────────────────────────
interface Capabilities { imageToImage: boolean; referenceImages: number; negativePrompt: boolean; aspectRatioParam: boolean; outpainting: boolean; minSide: number; promptMaxChars?: number }
interface CatalogModel {
    id: string; key: string; label: string; provider?: string; capabilities: Capabilities;
    creditsEstimated: number; notes: string; custom?: boolean;
    eligibility: { eligible: boolean; errors: string[]; warnings: string[] };
}
interface EngineConfig {
    mode: 'auto' | 'manual'; active: string | null; fallback: string | null;
    weights: Record<string, number>; customModels: any[];
    activatedFrom: { benchmarkId: string | null; at: string | null; by: string | null } | null;
}
interface EngineState {
    provider: string;
    providers?: { id: string; label: string; envKey: string; configured: boolean }[];
    engine: EngineConfig;
    production: { primary: string; fallback: string | null; source: string; notes: string[] };
    catalog: CatalogModel[];
    criteria: Record<string, { label: string; source: string }>;
    defaultWeights: Record<string, number>;
    photoHints: string[];
    limits: { maxPhotos: number; maxModels: number };
    benchmarks: { id: string; status: string; createdAt: string; models: string[] }[];
    envOverride: string | null;
}
interface BenchResult {
    id: string; model: string; photoIndex: number; status: string;
    imageUrl: string | null; latencyMs: number | null; error: string | null;
    vote: string | null; scores: Record<string, number | null> | null;
    total: { total: number | null; unmeasured: string[] } | null;
}
interface BenchRun {
    id: string; status: string; models: string[]; photos: { url: string; label: string }[];
    weights: Record<string, number>; results: BenchResult[]; pending: number;
    recommendation: {
        recommended: string | null;
        table: { model: string; score: number | null; readyCount: number; failedCount: number; errorRate: number | null; avgLatencyMs: number | null; unmeasured: string[]; disqualified: boolean }[];
    };
}

const fallo = async (r: Response | null, e?: unknown): Promise<string> => {
    if (!r) return `No hubo respuesta del servidor. ${e instanceof Error ? e.message : ''}`.trim();
    if (r.status === 401) return 'Tu sesión venció. Volvé a entrar.';
    if (r.status === 403) return 'Esta configuración es del operador de la plataforma.';
    let d = ''; try { d = (await r.json())?.error || ''; } catch { /* no json */ }
    return d || `El servidor respondió ${r.status}.`;
};

const Aviso: React.FC<{ tone: 'error' | 'warn' | 'ok' | 'info'; children: React.ReactNode }> = ({ tone, children }) => {
    const piel = {
        error: 'bg-red-50 border-red-200 text-red-800',
        warn: 'bg-amber-50 border-amber-200 text-amber-900',
        ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        info: 'bg-sky-50 border-sky-200 text-sky-900',
    }[tone];
    const Icono = { error: AlertTriangle, warn: AlertTriangle, ok: CheckCircle2, info: Info }[tone];
    return (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${piel}`}>
            <Icono className="w-4 h-4 mt-0.5 flex-shrink-0" /><div className="min-w-0">{children}</div>
        </div>
    );
};

const Tarjeta: React.FC<{ title: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, icon, children }) => (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <header className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
            {icon && <span className="mt-0.5 text-rotary-blue">{icon}</span>}
            <div>
                <h2 className="font-semibold text-gray-900">{title}</h2>
                {hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}
            </div>
        </header>
        <div className="p-5">{children}</div>
    </section>
);

const ms = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n / 100) / 10} s`);

// ════════════════════════════════════════════════════════════════════

const EnginePanel: React.FC = () => {
    // ⚠️ Todos los hooks arriba de cualquier return (check:hooks, v4.689).
    const [estado, setEstado] = useState<EngineState | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nota, setNota] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);

    // Candidato a mano
    const [nuevoId, setNuevoId] = useState('');
    const [nuevoLabel, setNuevoLabel] = useState('');
    const [nuevoCredits, setNuevoCredits] = useState('5');

    // Benchmark
    const [candidatos, setCandidatos] = useState<string[]>([]);
    const [fotos, setFotos] = useState<string[]>([]);
    const [pesos, setPesos] = useState<Record<string, number> | null>(null);
    const [corriendo, setCorriendo] = useState(false);
    const [run, setRun] = useState<BenchRun | null>(null);
    const [benchError, setBenchError] = useState<string | null>(null);
    const fotosRef = useRef<HTMLInputElement | null>(null);
    const runIdRef = useRef<string | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true); setError(null);
        let r: Response | null = null;
        try {
            r = await fetch(`${API}/anniversaries/engine`, { headers: auth() });
            if (!r.ok) throw new Error(await fallo(r));
            const j: EngineState = await r.json();
            setEstado(j);
            setPesos(p => p ?? j.engine.weights);
            setCandidatos(c => (c.length ? c : j.catalog.filter(m => m.eligibility.eligible).slice(0, 2).map(m => m.id)));
        } catch (e) {
            setError(await fallo(r, e));
        } finally { setCargando(false); }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    const guardarMotor = useCallback(async (patch: Partial<EngineConfig>) => {
        if (!estado) return;
        setGuardando(true); setError(null); setNota(null);
        let r: Response | null = null;
        try {
            r = await fetch(`${API}/anniversaries/engine`, {
                method: 'PUT', headers: auth(),
                body: JSON.stringify({ engine: { ...estado.engine, ...patch } }),
            });
            if (!r.ok) {
                const j = await r.json().catch(() => ({} as any));
                throw new Error([j.error, ...(j.errors || [])].filter(Boolean).join(' '));
            }
            const j = await r.json();
            setEstado(s => (s ? { ...s, engine: j.engine, production: j.production } : s));
            setNota('Configuración del motor guardada. Aplica a las próximas generaciones; las piezas ya generadas conservan su sello.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo guardar.');
        } finally { setGuardando(false); }
    }, [estado]);

    const agregarCandidato = useCallback(() => {
        if (!estado || !nuevoId.trim()) return;
        guardarMotor({
            customModels: [...estado.engine.customModels, {
                id: nuevoId.trim(), label: nuevoLabel.trim() || nuevoId.trim(),
                creditsEstimated: Number(nuevoCredits) || 5,
                capabilities: { imageToImage: true, referenceImages: 2, negativePrompt: false, aspectRatioParam: true, outpainting: false, minSide: 1024 },
            }],
        });
        setNuevoId(''); setNuevoLabel('');
    }, [estado, nuevoId, nuevoLabel, nuevoCredits, guardarMotor]);

    // ── Fotos del benchmark ─────────────────────────────────────────
    const leerFotos = useCallback((files: FileList | null) => {
        if (!files || !estado) return;
        const lote = Array.from(files).slice(0, estado.limits.maxPhotos - fotos.length);
        for (const f of lote) {
            if (!ACCEPTED_PHOTO_TYPES.includes(f.type) || f.size > MAX_PHOTO_BYTES) continue;
            const fr = new FileReader();
            fr.onload = () => setFotos(prev => prev.length < (estado?.limits.maxPhotos ?? 8) ? [...prev, String(fr.result || '')] : prev);
            fr.readAsDataURL(f);
        }
        if (fotosRef.current) fotosRef.current.value = '';
    }, [estado, fotos.length]);

    // ── Correr y sondear ────────────────────────────────────────────
    const sondear = useCallback(async (id: string) => {
        let r: Response | null = null;
        r = await fetch(`${API}/anniversaries/benchmark/${id}`, { headers: auth() });
        if (!r.ok) throw new Error(await fallo(r));
        const j: BenchRun = await r.json();
        setRun(j);
        return j;
    }, []);

    const ejecutar = useCallback(async () => {
        setBenchError(null); setRun(null);
        if (candidatos.length < 2) { setBenchError('Elegí al menos dos modelos: un benchmark de uno solo no compara nada.'); return; }
        if (!fotos.length) { setBenchError('Subí al menos una fotografía de prueba.'); return; }
        setCorriendo(true);
        let r: Response | null = null;
        try {
            r = await fetch(`${API}/anniversaries/benchmark`, {
                method: 'POST', headers: auth(),
                body: JSON.stringify({ models: candidatos, photos: fotos, weights: pesos }),
            });
            if (!r.ok) throw new Error(await fallo(r));
            const { benchmarkId } = await r.json();
            runIdRef.current = benchmarkId;
            // Sondeo con tope: una corrida de varias celdas tarda minutos.
            const limite = Date.now() + 12 * 60_000;
            for (;;) {
                const j = await sondear(benchmarkId);
                if (j.pending === 0 || j.status !== 'running') break;
                if (Date.now() > limite) { setBenchError('El benchmark sigue corriendo; volvé a abrir esta pantalla en unos minutos para ver el resto.'); break; }
                await new Promise(res => setTimeout(res, 4000));
            }
        } catch (e) {
            setBenchError(e instanceof Error ? e.message : 'No se pudo correr el benchmark.');
        } finally { setCorriendo(false); }
    }, [candidatos, fotos, pesos, sondear]);

    const votar = useCallback(async (resultId: string, vote: string) => {
        try {
            const r = await fetch(`${API}/anniversaries/benchmark/vote`, {
                method: 'POST', headers: auth(), body: JSON.stringify({ resultId, vote }),
            });
            if (r.ok && runIdRef.current) await sondear(runIdRef.current);
        } catch { /* un voto que no entra se reintenta pulsando de nuevo */ }
    }, [sondear]);

    const activar = useCallback(async (model: string) => {
        if (!window.confirm(`Las próximas generaciones —también las del formulario público— van a salir con ${model}. ¿Activarlo como modelo de producción?`)) return;
        setError(null); setNota(null);
        let r: Response | null = null;
        try {
            r = await fetch(`${API}/anniversaries/engine/activate`, {
                method: 'POST', headers: auth(),
                body: JSON.stringify({ model, benchmarkId: runIdRef.current }),
            });
            if (!r.ok) throw new Error(await fallo(r));
            const j = await r.json();
            setEstado(s => (s ? { ...s, engine: j.engine, production: j.production } : s));
            setNota(`${model} activado como modelo de producción, con su procedencia registrada.`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo activar.');
        }
    }, []);

    const modeloVivo = useMemo(
        () => estado?.catalog.find(m => m.id === estado.production.primary) || null,
        [estado]
    );

    if (cargando) return <div className="p-4 text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando el motor…</div>;
    if (!estado) return <Aviso tone="error">{error || 'No se pudo abrir el motor de imagen.'}</Aviso>;

    const elegibles = estado.catalog.filter(m => m.eligibility.eligible);

    return (
        <div className="space-y-6">
            {error && <Aviso tone="error">{error}</Aviso>}
            {nota && <Aviso tone="ok">{nota}</Aviso>}

            {/* ── 1. Motor de imagen ── */}
            <Tarjeta title="Configuración técnica — Motor de imagen" icon={<Cpu className="w-5 h-5" />}
                hint="Dos proveedores: KIE (multimodelo) y OpenAI (GPT Image, el motor de ChatGPT). El modelo se cambia acá, sin tocar el código del generador.">
                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Proveedores</label>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                                {(estado.providers || [{ id: 'kie', label: 'KIE (multimodelo)', configured: true }])
                                    .map(pv => `${pv.label}${pv.configured ? '' : ' — sin credencial'}`).join(' · ')}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Modo</label>
                            <select value={estado.engine.mode}
                                onChange={e => guardarMotor({ mode: e.target.value as 'auto' | 'manual' })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                                <option value="auto">Automático recomendado</option>
                                <option value="manual">Manual (administrador técnico)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Fallback</label>
                            <p className="text-[11px] text-gray-500 mb-1">El respaldo NO genera: sólo entra si el principal falla por infraestructura.</p>
                            <select value={estado.engine.fallback || ''}
                                onChange={e => guardarMotor({ fallback: e.target.value || null })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                                <option value="">Sin fallback</option>
                                {elegibles.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {estado.engine.mode === 'manual' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Modelo activo</label>
                            <select value={estado.engine.active || ''}
                                onChange={e => guardarMotor({ active: e.target.value || null })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                                <option value="">Default del catálogo</option>
                                {elegibles.map(m => <option key={m.id} value={m.id}>{m.label} · ~{m.creditsEstimated} créditos{m.provider === 'openai' ? ' · OpenAI' : ''}</option>)}
                            </select>
                        </div>
                    )}

                    <Aviso tone="info">
                        <strong>En producción:</strong> <code data-no-translate>{estado.production.primary}</code>
                        {estado.production.fallback && <> · respaldo <code data-no-translate>{estado.production.fallback}</code></>}
                        {' '}({estado.production.source === 'env' ? 'forzado por el entorno' : estado.production.source === 'activated' ? 'activado tras benchmark' : 'default del catálogo'}).
                        {modeloVivo && modeloVivo.eligibility.warnings.length > 0 && <> {modeloVivo.eligibility.warnings.join(' ')}</>}
                        {' '}El fallback entra sólo ante un fallo de infraestructura (timeout, 5xx, límite, modelo retirado) — nunca por un resultado estéticamente imperfecto: de eso se ocupa la validación de calidad.
                    </Aviso>
                    {estado.envOverride && (
                        <Aviso tone="warn">La variable de entorno <code>ANNIVERSARY_MODEL</code> está forzando <code data-no-translate>{estado.envOverride}</code>: el panel no manda hasta que se retire.</Aviso>
                    )}
                    {estado.production.notes.map((n, i) => <Aviso key={i} tone="warn">{n}</Aviso>)}
                    {/* Activación en UN clic: es el mismo `postEngineActivate` del
                        benchmark — humano, registrado con quién y cuándo. Existe
                        porque poner un modelo como «Fallback» se leyó como usarlo,
                        y el respaldo no genera (reporte de v4.901). */}
                    <div className="flex flex-wrap gap-2">
                        {elegibles.filter(m => m.id !== estado.production.primary).map(m => (
                            <button key={m.id} onClick={() => activar(m.id)} disabled={guardando}
                                className="px-3 py-1.5 rounded-lg border border-rotary-blue/40 text-rotary-blue text-xs font-medium hover:bg-sky-50 disabled:opacity-50">
                                Generar con {m.label.split(' (')[0]} — activarlo como modelo de producción
                            </button>
                        ))}
                    </div>
                    {estado.engine.activatedFrom?.at && (
                        <p className="text-xs text-gray-500">
                            Activación vigente: {new Date(estado.engine.activatedFrom.at).toLocaleString('es-CO')}
                            {estado.engine.activatedFrom.by ? ` por ${estado.engine.activatedFrom.by}` : ''}
                            {estado.engine.activatedFrom.benchmarkId ? ` · benchmark ${estado.engine.activatedFrom.benchmarkId.slice(0, 8)}` : ''}.
                        </p>
                    )}

                    {/* Candidato a mano: la mitad honesta de la «detección» —
                        KIE no expone catálogo, así que un modelo nuevo se
                        declara, se compara y recién entonces se puede activar. */}
                    <details className="rounded-lg border border-gray-200 p-3">
                        <summary className="text-sm font-medium text-gray-800 cursor-pointer">Agregar un modelo candidato de KIE</summary>
                        <p className="text-xs text-gray-500 mt-2">
                            KIE no expone un catálogo consultable: un modelo nuevo se declara acá con su id
                            (<code>familia/modelo</code>), corre el benchmark contra los demás y sólo con esa
                            evidencia se activa. Nunca entra a producción solo.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                            <input value={nuevoId} onChange={e => setNuevoId(e.target.value)} placeholder="familia/modelo"
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono w-56" />
                            <input value={nuevoLabel} onChange={e => setNuevoLabel(e.target.value)} placeholder="Nombre visible"
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-48" />
                            <input value={nuevoCredits} onChange={e => setNuevoCredits(e.target.value)} type="number" min={1}
                                title="Créditos estimados (medidor propio)"
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-20" />
                            <button onClick={agregarCandidato} disabled={guardando || !nuevoId.trim()}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1">
                                <Plus className="w-4 h-4" /> Agregar candidato
                            </button>
                        </div>
                    </details>
                </div>
            </Tarjeta>

            {/* ── 2. Modelos IA — benchmark ── */}
            <Tarjeta title="Modelos IA — benchmark" icon={<FlaskConical className="w-5 h-5" />}
                hint="Mismas fotografías, mismo prompt, la misma cadena de producción. La selección no es una opinión: es evidencia.">
                <div className="space-y-4">
                    <div>
                        <p className="text-sm font-medium text-gray-800 mb-2">Modelos a comparar (máx. {estado.limits.maxModels})</p>
                        <div className="flex flex-wrap gap-2">
                            {elegibles.map(m => (
                                <label key={m.id} className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer ${candidatos.includes(m.id) ? 'border-rotary-blue bg-sky-50 text-rotary-blue' : 'border-gray-300 text-gray-600'}`}>
                                    <input type="checkbox" className="hidden" checked={candidatos.includes(m.id)}
                                        onChange={() => setCandidatos(c => c.includes(m.id) ? c.filter(x => x !== m.id) : (c.length < estado.limits.maxModels ? [...c, m.id] : c))} />
                                    {m.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-sm font-medium text-gray-800 mb-1">Fotografías de prueba (máx. {estado.limits.maxPhotos})</p>
                        <p className="text-xs text-gray-500 mb-2">
                            Lo representativo cubre: {estado.photoHints.join(', ')}. Con menos fotos el benchmark corre igual — y dice menos.
                        </p>
                        <div className="flex flex-wrap gap-2 items-center">
                            {fotos.map((f, i) => (
                                <div key={i} className="relative">
                                    <img src={f} alt={`Prueba ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                                    <button onClick={() => setFotos(fs => fs.filter((_, j) => j !== i))}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-300 text-xs leading-none">×</button>
                                </div>
                            ))}
                            {fotos.length < estado.limits.maxPhotos && (
                                <button onClick={() => fotosRef.current?.click()}
                                    className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400">
                                    + {ACCEPTED_PHOTO_LABEL}
                                </button>
                            )}
                            <input ref={fotosRef} type="file" multiple className="hidden"
                                accept={ACCEPTED_PHOTO_TYPES.join(',')} onChange={e => leerFotos(e.target.files)} />
                        </div>
                    </div>

                    <details className="rounded-lg border border-gray-200 p-3">
                        <summary className="text-sm font-medium text-gray-800 cursor-pointer">Pesos del score (configurables)</summary>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                            {Object.entries(estado.criteria).map(([k, c]) => (
                                <label key={k} className="text-xs text-gray-600 flex items-center justify-between gap-2 border border-gray-100 rounded px-2 py-1">
                                    <span>{c.label}</span>
                                    <input type="number" min={0} max={100} value={pesos?.[k] ?? estado.defaultWeights[k]}
                                        onChange={e => setPesos(p => ({ ...(p || estado.defaultWeights), [k]: Number(e.target.value) }))}
                                        className="w-14 rounded border border-gray-300 px-1 py-0.5 text-right" />
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Integración y composición sólo puntúan con tus votos: ninguna máquina las mide, y hasta que votes
                            quedan declaradas como «sin medir» en vez de inventarse un número.
                        </p>
                    </details>

                    {benchError && <Aviso tone="error">{benchError}</Aviso>}
                    <button onClick={ejecutar} disabled={corriendo}
                        className="px-4 py-2 rounded-lg bg-rotary-blue text-white text-sm font-medium hover:bg-rotary-navy disabled:opacity-50 flex items-center gap-2">
                        {corriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                        Ejecutar benchmark ({candidatos.length} modelos × {fotos.length} fotos)
                    </button>
                    <p className="text-xs text-gray-500">
                        Cada celda gasta créditos reales del proveedor. Los créditos son el medidor propio de la
                        plataforma, no el saldo de KIE.
                    </p>

                    {/* ── Resultados lado a lado ── */}
                    {run && (
                        <div className="space-y-4 pt-2">
                            {run.pending > 0 && (
                                <Aviso tone="info"><Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" /> {run.pending} generaciones en curso…
                                    {!corriendo && <button onClick={() => sondear(run.id)} className="ml-2 underline"><RefreshCw className="inline w-3 h-3" /> actualizar</button>}
                                </Aviso>
                            )}
                            <div className="overflow-x-auto">
                                <table className="text-sm min-w-full">
                                    <thead>
                                        <tr>
                                            <th className="text-left text-xs text-gray-500 font-normal p-2">Fotografía</th>
                                            {run.models.map(m => <th key={m} className="text-left text-xs text-gray-700 font-medium p-2" data-no-translate>{m}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {run.photos.map((p, pi) => (
                                            <tr key={pi} className="align-top border-t border-gray-100">
                                                <td className="p-2"><img src={p.url} alt={p.label || `Foto ${pi + 1}`} className="w-24 rounded border border-gray-200" /></td>
                                                {run.models.map(m => {
                                                    const r = run.results.find(x => x.model === m && x.photoIndex === pi);
                                                    return (
                                                        <td key={m} className="p-2 min-w-[150px]">
                                                            {!r || r.status === 'pending' ? (
                                                                <div className="w-32 h-32 rounded border border-dashed border-gray-200 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
                                                            ) : r.status === 'failed' ? (
                                                                <div className="w-32 text-xs text-red-600">{r.error}</div>
                                                            ) : (
                                                                <div className="w-32">
                                                                    <img src={r.imageUrl || ''} alt={`${m} — foto ${pi + 1}`} className="w-32 h-32 object-cover rounded border border-gray-200" />
                                                                    <p className="text-xs text-gray-600 mt-1">
                                                                        {r.total?.total !== null && r.total !== null ? <><strong>{r.total.total}</strong>/10</> : 'sin nota'} · {ms(r.latencyMs)}
                                                                    </p>
                                                                    <div className="flex gap-1 mt-1">
                                                                        <button title="Mejor" onClick={() => votar(r.id, r.vote === 'up' ? '' : 'up')} className={`p-1 rounded border ${r.vote === 'up' ? 'bg-emerald-50 border-emerald-300' : 'border-gray-200'}`}><ThumbsUp className="w-3.5 h-3.5" /></button>
                                                                        <button title="Peor" onClick={() => votar(r.id, r.vote === 'down' ? '' : 'down')} className={`p-1 rounded border ${r.vote === 'down' ? 'bg-red-50 border-red-300' : 'border-gray-200'}`}><ThumbsDown className="w-3.5 h-3.5" /></button>
                                                                        <button title="Favorito" onClick={() => votar(r.id, r.vote === 'star' ? '' : 'star')} className={`p-1 rounded border ${r.vote === 'star' ? 'bg-amber-50 border-amber-300' : 'border-gray-200'}`}><Star className="w-3.5 h-3.5" /></button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Resumen y activación */}
                            <div className="overflow-x-auto">
                                <table className="text-sm min-w-full border-t border-gray-200">
                                    <thead><tr className="text-xs text-gray-500">
                                        <th className="text-left p-2 font-normal">Modelo</th><th className="text-left p-2 font-normal">Score</th>
                                        <th className="text-left p-2 font-normal">Latencia media</th><th className="text-left p-2 font-normal">Tasa de error</th>
                                        <th className="text-left p-2 font-normal">Sin medir</th><th className="p-2" />
                                    </tr></thead>
                                    <tbody>
                                        {run.recommendation.table.map(t => (
                                            <tr key={t.model} className={`border-t border-gray-100 ${t.model === run.recommendation.recommended ? 'bg-emerald-50/60' : ''}`}>
                                                <td className="p-2" data-no-translate>
                                                    {t.model}
                                                    {t.model === run.recommendation.recommended && <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs">Recomendado</span>}
                                                    {t.disqualified && <span className="ml-2 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Descalificado por inestable</span>}
                                                </td>
                                                <td className="p-2">{t.score ?? '—'}{t.score !== null && '/10'}</td>
                                                <td className="p-2">{ms(t.avgLatencyMs)}</td>
                                                <td className="p-2">{t.errorRate === null ? '—' : `${Math.round(t.errorRate * 100)} %`}</td>
                                                <td className="p-2 text-xs text-gray-500">{t.unmeasured.length ? t.unmeasured.map(u => estado.criteria[u]?.label || u).join(', ') : '—'}</td>
                                                <td className="p-2">
                                                    {!t.disqualified && t.score !== null && (
                                                        <button onClick={() => activar(t.model)}
                                                            className="px-2 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap">
                                                            <Rocket className="w-3 h-3" /> Usar como modelo de producción
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-gray-500">
                                El score se calcula sobre lo MEDIDO, con los pesos renormalizados; lo que quedó sin medir se
                                nombra en vez de contarse como cero. Tus votos completan lo que la máquina no puede mirar.
                                Activar es siempre un gesto tuyo: ningún benchmark cambia producción solo.
                            </p>
                        </div>
                    )}
                </div>
            </Tarjeta>
        </div>
    );
};

export default EnginePanel;
