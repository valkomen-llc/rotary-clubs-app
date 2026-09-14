// ════════════════════════════════════════════════════════════════════════════
// Analítica de Redes Sociales — el panel (v4.1053)
//
// ⚠️ LA PANTALLA PINTA; EL SERVIDOR DECIDE. El alcance, los KPIs con su
// comparación, el estado de cada sincronización y el motivo de lo que falta
// viajan RESUELTOS. Acá no se calcula un porcentaje, no se decide si una
// cuenta se puede mirar y no se convierte un hueco en un cero: con dos
// criterios, el panel afirmaría un número que la API no respalda.
//
// ⚠️ Y NO SE CONSULTA A META DESDE ACÁ. Lo que se lee es el histórico propio,
// ya sincronizado: por eso el dashboard abre aunque Meta esté caído o el token
// haya vencido —y lo dice—.
// ════════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
    RefreshCw, AlertTriangle, Facebook, Instagram, Film, FileText,
    Users, TrendingUp, TrendingDown, Minus, Info, ExternalLink, ShieldAlert, Clock,
} from 'lucide-react';
import { leerJson, describirNoJson } from '../../../lib/leerJson';

const API = import.meta.env.VITE_API_URL || '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

// ─── Lo que el servidor manda, ya resuelto ──────────────────────────────────
type Tono = 'ok' | 'warn' | 'error' | 'info' | 'neutral';
interface Cuenta {
    id: string; clubId: string | null; clubName: string | null;
    platform: 'facebook' | 'instagram'; accountName: string; avatar: string | null;
    status: string;
    sync: { status: string; label: string; tone: Tono; lastSyncAt: string | null; syncedThrough: string | null; error: string | null; notes: { metric?: string; reason?: string }[] };
    insights: {
        ok: boolean; state: string; reason: string | null; fix?: string | null;
        // ⚠️ `verified` DISTINGUE «se comprobó y falta» de «no se comprobó».
        // Sin él, el panel no puede decir si el motivo que muestra es un hecho
        // medido contra Meta o una suposición sobre lo que guardamos.
        verified?: boolean; blocker?: string | null; note?: string | null; scope?: string | null;
    };
}
interface Kpi {
    metric: string; label: string; unit?: string | null; cumulative?: boolean;
    current: number | null; previous: number | null; delta: number | null;
    percent: number | null; basis: string;
}
interface PuntoSerie { metricDate: string; metric: string; value: number }
interface Overview {
    range: { preset: string; from: string; to: string };
    accounts: Cuenta[]; kpis: Kpi[]; series: PuntoSerie[];
    coverage?: { from: string | null; to: string | null; days: number } | null;
    empty?: string;
}
interface Pieza {
    id: string; externalId: string; externalUrl: string | null;
    platform: string; mediaType: string | null; caption: string | null;
    thumbnailUrl: string | null; publishedAt: string | null; accountName: string;
    metrics: Record<string, number>; engagementRate: number | null;
    origin: { distributionId: string; entityType: string; entityId: string } | null;
}
interface Veredicto {
    ok: boolean; state: string; blocker: string | null;
    blockerLabel: string | null; fix: string | null; reason: string | null;
    scope: string | null; scopeGranted: boolean | null;
    grantedScopes: string[] | null; grantChecked: boolean; grantError: string | null;
    checkedAt: string;
}
interface Alcance {
    operator: boolean;
    sites: { id: string; name: string }[];
    accounts: Cuenta[];
    trackingStart: string;
    graphVersion: string;
    unavailable: { id: string; label: string; reason: string; planned?: boolean }[];
}

const RANGOS = [
    { id: 'last_7', label: '7 días' },
    { id: 'last_28', label: '28 días' },
    { id: 'last_90', label: '90 días' },
    { id: 'since_start', label: 'Todo el histórico' },
];

const PESTANAS = [
    { id: 'resumen', label: 'Resumen', icon: TrendingUp },
    { id: 'facebook', label: 'Facebook', icon: Facebook },
    { id: 'instagram', label: 'Instagram', icon: Instagram },
    { id: 'contenido', label: 'Contenido', icon: FileText },
    { id: 'reels', label: 'Reels', icon: Film },
    { id: 'audiencia', label: 'Audiencia', icon: Users },
] as const;
type PestanaId = typeof PESTANAS[number]['id'];

const TONO: Record<Tono, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warn: 'bg-amber-50 text-amber-700 border-amber-100',
    error: 'bg-red-50 text-red-700 border-red-100',
    info: 'bg-sky-50 text-sky-700 border-sky-100',
    neutral: 'bg-gray-50 text-gray-500 border-gray-100',
};

const fmt = (n: number | null, unit?: string | null) => {
    // ⚠️ `null` NO SE PINTA COMO CERO. Es el punto 14 del pedido: un fallo de
    // la API no puede verse igual que un día sin actividad.
    if (n === null || n === undefined) return '—';
    if (unit === '%') return `${n.toFixed(1)} %`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(Math.round(n * 10) / 10);
};

const fecha = (iso: string | null) => {
    if (!iso) return null;
    // Se arma por partes: `new Date('2026-08-14')` es medianoche UTC y leída
    // en otra zona devuelve el día anterior (v4.991).
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        .toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** La variación de un KPI, con su MOTIVO cuando no se puede expresar.
 *
 *  ⚠️ DE 0 A 40 NO ES «+100 %». El criterio ya lo resolvió en el servidor
 *  (`basis`); acá sólo se pinta lo que vino. */
const Variacion: React.FC<{ k: Kpi }> = ({ k }) => {
    if (k.basis === 'sin_base') {
        return <span className="text-[11px] font-bold text-sky-600">+{fmt(k.delta)} · sin base de comparación</span>;
    }
    if (k.basis === 'sin_periodo_anterior' || k.basis === 'sin_dato') {
        return <span className="text-[11px] font-bold text-gray-400">sin período anterior</span>;
    }
    if (k.basis === 'sin_movimiento' || k.percent === null) {
        return <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1"><Minus className="w-3 h-3" /> sin cambio</span>;
    }
    const sube = k.percent >= 0;
    const Icono = sube ? TrendingUp : TrendingDown;
    return (
        <span className={`text-[11px] font-bold flex items-center gap-1 ${sube ? 'text-emerald-600' : 'text-red-500'}`}>
            <Icono className="w-3 h-3" />{sube ? '+' : ''}{k.percent.toFixed(1)} %
        </span>
    );
};

const Aviso: React.FC<{ tono?: 'warn' | 'info' | 'error'; children: React.ReactNode }> = ({ tono = 'info', children }) => {
    const clases = tono === 'warn' ? 'bg-amber-50 border-amber-100 text-amber-800'
        : tono === 'error' ? 'bg-red-50 border-red-100 text-red-800'
            : 'bg-sky-50 border-sky-100 text-sky-800';
    const Icono = tono === 'info' ? Info : AlertTriangle;
    return (
        <div className={`border rounded-2xl px-5 py-4 flex items-start gap-3 text-sm font-medium ${clases}`}>
            <Icono className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">{children}</div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════════════
const SocialAnalytics: React.FC = () => {
    const [alcance, setAlcance] = useState<Alcance | null>(null);
    const [datos, setDatos] = useState<Overview | null>(null);
    const [piezas, setPiezas] = useState<Pieza[] | null>(null);
    const [pestana, setPestana] = useState<PestanaId>('resumen');
    const [rango, setRango] = useState('last_28');
    const [sitio, setSitio] = useState('');
    const [cargando, setCargando] = useState(true);
    const [sincronizando, setSincronizando] = useState(false);
    const [fallo, setFallo] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const plataforma = pestana === 'facebook' ? 'facebook' : pestana === 'instagram' ? 'instagram' : '';

    /** Ninguna respuesta se lee con `.json()` a ciegas: una página de error
     *  HTML rompería el parseo con un mensaje que no nombra ninguna capa
     *  (v4.946). */
    const pedir = useCallback(async <T,>(ruta: string, init?: RequestInit): Promise<T> => {
        const res = await fetch(`${API}/social/analytics${ruta}`, { ...init, headers: { 'Content-Type': 'application/json', ...auth(), ...(init?.headers || {}) } });
        const { data, esJson, crudo } = await leerJson<T & { error?: string; detail?: string }>(res);
        if (!esJson) throw new Error(describirNoJson(res, crudo));
        if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`);
        return data as T;
    }, []);

    useEffect(() => {
        let vivo = true;
        pedir<Alcance>('/scope')
            .then((a) => { if (vivo) setAlcance(a); })
            .catch((e) => { if (vivo) setFallo(e.message); });
        return () => { vivo = false; };
    }, [pedir]);

    const cargar = useCallback(async () => {
        setCargando(true); setFallo(null);
        const q = new URLSearchParams({ preset: rango });
        if (sitio) q.set('clubId', sitio);
        if (plataforma) q.set('platform', plataforma);
        try {
            setDatos(await pedir<Overview>(`/overview?${q}`));
        } catch (e) {
            setFallo(e instanceof Error ? e.message : 'No se pudieron leer las estadísticas');
        } finally { setCargando(false); }
    }, [pedir, rango, sitio, plataforma]);

    useEffect(() => { cargar(); }, [cargar]);

    // El contenido se pide sólo cuando su pestaña está a la vista: traerlo
    // siempre sería una consulta por visita para algo que casi nunca se mira.
    useEffect(() => {
        if (pestana !== 'contenido' && pestana !== 'reels') return;
        let vivo = true;
        const q = new URLSearchParams({ preset: rango, limit: '20' });
        if (sitio) q.set('clubId', sitio);
        if (pestana === 'reels') q.set('mediaType', 'reel');
        setPiezas(null);
        pedir<{ items: Pieza[] }>(`/content?${q}`)
            .then((r) => { if (vivo) setPiezas(r.items); })
            .catch((e) => { if (vivo) { setPiezas([]); setFallo(e.message); } });
        return () => { vivo = false; };
    }, [pedir, pestana, rango, sitio]);

    // ── ⚠️ COMPROBAR CONTRA META, NO CONTRA LO QUE GUARDAMOS ───────────────
    //
    // Todo lo demás de esta pantalla pinta lo sincronizado. Esto le pregunta a
    // Meta: inspecciona el token y hace una consulta real a la arista de
    // estadísticas. Es lo único que distingue «no tenemos el permiso guardado»
    // de «Meta lo rechaza», que se corrigen en sitios distintos.
    const [verificando, setVerificando] = useState<string | null>(null);
    const [veredictos, setVeredictos] = useState<Record<string, Veredicto>>({});

    const verificar = async (accountId: string) => {
        setVerificando(accountId); setFallo(null);
        try {
            const r = await pedir<{ verification: Veredicto }>(`/verify/${accountId}`, { method: 'POST' });
            setVeredictos((p) => ({ ...p, [accountId]: r.verification }));
            // La comprobación acaba de guardar los permisos reales: se recarga
            // para que el resto de la pantalla deje de decidir con lo viejo.
            await cargar();
        } catch (e) {
            setFallo(e instanceof Error ? e.message : 'No se pudo comprobar los permisos');
        } finally { setVerificando(null); }
    };

    // ── Reautorizar ────────────────────────────────────────────────────────
    //
    // ⚠️ ES EL MISMO FLUJO DE «Conectar Meta», no un segundo OAuth. Con dos,
    // el día que cambie qué permisos se piden una mitad se queda atrás y lo
    // que se separa es qué token queda guardado. `auth_type=rerequest` ya
    // fuerza la pantalla de selección completa, así que reautorizar es volver
    // a entrar por la misma puerta — y no crea cuentas duplicadas: el
    // sincronizador hace `upsert` por (sitio, plataforma, id).
    const [reautorizando, setReautorizando] = useState(false);
    const reautorizar = async () => {
        setReautorizando(true); setFallo(null);
        try {
            const qs = new URLSearchParams({ returnOrigin: window.location.origin });
            if (sitio) qs.set('clubId', sitio);
            const resp = await fetch(`${API}/social/connect/meta?${qs.toString()}`, { headers: auth() });
            // ⚠️ NUNCA `.json()` A CIEGAS: una página de error HTML rompe el
            // parseo y el error resultante no nombra ninguna capa (v4.946).
            const { data, esJson, crudo } = await leerJson<{ url?: string; error?: string }>(resp);
            if (!esJson) throw new Error(describirNoJson(resp, crudo));
            if (!resp.ok || !data?.url) throw new Error(data?.error || `HTTP ${resp.status}`);
            window.location.href = data.url;
        } catch (e) {
            setFallo(e instanceof Error ? e.message : 'No se pudo abrir la autorización de Meta');
            setReautorizando(false);
        }
    };

    const sincronizar = async (modo: 'auto' | 'backfill') => {
        setSincronizando(true); setAviso(null); setFallo(null);
        try {
            const r = await pedir<{ synced: number; failed: number; results: { accountName?: string; state: string; reason?: string; rows?: number }[] }>(
                '/sync', { method: 'POST', body: JSON.stringify({ mode: modo, ...(sitio ? { clubId: sitio } : {}) }) }
            );
            // ⚠️ NO ES ATÓMICO Y SE DICE. «Se sincronizaron 3» habiendo tocado
            // una es el defecto que el desglose existe para no tener (v4.886).
            const malas = r.results.filter((x) => x.state !== 'ok' && x.state !== 'partial');
            setAviso(
                `${r.synced} de ${r.results.length} cuenta(s) al día`
                + (malas.length ? ` · ${malas.map((m) => `${m.accountName || 'cuenta'}: ${m.reason || m.state}`).join(' · ')}` : '')
            );
            await cargar();
        } catch (e) {
            setFallo(e instanceof Error ? e.message : 'No se pudo sincronizar');
        } finally { setSincronizando(false); }
    };

    const cuentas = useMemo(
        () => (datos?.accounts || alcance?.accounts || []).filter((a) => !plataforma || a.platform === plataforma),
        [datos, alcance, plataforma]
    );
    const sinPermiso = cuentas.filter((a) => !a.insights.ok);
    const sinSincronizar = cuentas.filter((a) => a.sync.status === 'never');

    // La serie del gráfico: una fila por día con una columna por métrica.
    const serie = useMemo(() => {
        const porDia = new Map<string, Record<string, number | string>>();
        for (const p of datos?.series || []) {
            const fila = porDia.get(p.metricDate) || { metricDate: p.metricDate };
            fila[p.metric] = Number(fila[p.metric] || 0) + Number(p.value);
            porDia.set(p.metricDate, fila);
        }
        return [...porDia.values()].sort((a, b) => (String(a.metricDate) < String(b.metricDate) ? -1 : 1));
    }, [datos]);

    const metricaGrafico = serie.some((f) => 'views' in f) ? 'views'
        : serie.some((f) => 'reach' in f) ? 'reach'
            : serie.some((f) => 'engagement' in f) ? 'engagement' : null;

    // ─── Cabecera ───────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Redes Sociales</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Histórico propio desde el {fecha(alcance?.trackingStart || null) || '—'}.{' '}
                        {/* ⚠️ SE DICE DE DÓNDE SALEN LAS CIFRAS. Sin esta línea,
                            un dashboard que no cambia se lee como uno roto. */}
                        Las cifras se leen de lo ya sincronizado, no de Meta en vivo.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {alcance?.operator && alcance.sites.length > 0 && (
                        <select value={sitio} onChange={(e) => setSitio(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700">
                            <option value="">Todos los sitios</option>
                            {alcance.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    )}
                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                        {RANGOS.map((r) => (
                            <button key={r.id} onClick={() => setRango(r.id)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${rango === r.id ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-700'}`}>
                                {r.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => sincronizar('auto')} disabled={sincronizando || !cuentas.length}
                        className="px-4 py-2 bg-rotary-blue text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
                        Sincronizar
                    </button>
                </div>
            </div>

            {fallo && <Aviso tono="error"><p>{fallo}</p></Aviso>}
            {aviso && <Aviso tono="info"><p>{aviso}</p></Aviso>}

            {/* ⚠️ «FALTAN PERMISOS» NO SE PINTA COMO UN CERO. Es el punto 14
                del pedido: el motivo llega resuelto del servidor, con su
                salida, en vez de dejar un tablero en blanco. */}
            {sinPermiso.length > 0 && (
                <Aviso tono="warn">
                    <p className="font-bold flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> {sinPermiso.length} cuenta(s) sin estadísticas</p>
                    {sinPermiso.map((a) => (
                        <p key={a.id} className="text-xs">
                            <strong>{a.accountName}</strong>: {a.insights.reason}
                            {a.insights.fix ? <> — {a.insights.fix}</> : null}
                        </p>
                    ))}
                    {/* ⚠️ UN AVISO SIN SALIDA ES UN CALLEJÓN (v4.1008). Las dos
                        salidas son distintas y se ofrecen las dos: reautorizar
                        sirve cuando el permiso no se concedió en la pantalla de
                        Facebook; comprobar sirve para saber si el bloqueo es
                        ése o está del lado de la aplicación en Meta, donde
                        reautorizar mil veces no cambia nada. */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button onClick={reautorizar} disabled={reautorizando}
                            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-black disabled:opacity-40">
                            {reautorizando ? 'Abriendo Meta…' : 'Reautorizar Meta'}
                        </button>
                        <span className="text-[11px] text-amber-700">
                            Se vuelve a pedir el permiso de estadísticas sin perder lo que ya publica: las cuentas se
                            actualizan sobre la misma fila, no se duplican.
                        </span>
                    </div>
                </Aviso>
            )}

            {sinSincronizar.length > 0 && sinPermiso.length === 0 && (
                <Aviso tono="info">
                    <p className="font-bold">{sinSincronizar.length} cuenta(s) sin sincronizar todavía.</p>
                    <button onClick={() => sincronizar('backfill')} disabled={sincronizando}
                        className="text-xs font-bold underline disabled:opacity-40">
                        Traer todo el histórico disponible
                    </button>
                </Aviso>
            )}

            {/* ─── Pestañas ─────────────────────────────────────────────── */}
            <div className="flex gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-100 overflow-x-auto">
                {PESTANAS.map((p) => (
                    <button key={p.id} onClick={() => setPestana(p.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-all ${pestana === p.id ? 'bg-white text-rotary-blue shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-700'}`}>
                        <p.icon className="w-4 h-4" /> {p.label}
                    </button>
                ))}
            </div>

            {/* ─── Audiencia: declarada y todavía no disponible ─────────────
                ⚠️ NO SE APROXIMA. Meta devuelve la demografía como una FOTO
                sin fecha, así que no hay serie que construir; inventar un
                desglose sería exactamente lo que el punto 16 prohíbe. */}
            {pestana === 'audiencia' ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-8 space-y-4">
                    <h3 className="text-base font-bold text-gray-900">Lo que Meta muestra en su pantalla y no entrega por API</h3>
                    <p className="text-sm text-gray-500">
                        Estas cifras existen en el panel de Facebook o de Instagram y no hay arista pública que las devuelva.
                        Se declaran acá en vez de aproximarlas: un número inventado es peor que un hueco explicado.
                    </p>
                    <div className="space-y-3">
                        {(alcance?.unavailable || []).map((u) => (
                            <div key={u.id} className="border border-gray-100 rounded-xl px-4 py-3">
                                <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    {u.label}
                                    {u.planned && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-100">previsto</span>}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">{u.reason}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : pestana === 'contenido' || pestana === 'reels' ? (
                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                    {piezas === null ? (
                        <div className="p-8 text-sm text-gray-400">Cargando contenido…</div>
                    ) : !piezas.length ? (
                        <div className="p-8 text-sm text-gray-400">
                            {pestana === 'reels'
                                ? 'Todavía no hay Reels medidos en este período.'
                                : 'Todavía no hay contenido medido en este período.'}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                                <tr>
                                    <th className="text-left px-5 py-3 font-black">Publicación</th>
                                    <th className="text-right px-4 py-3 font-black">Visualizaciones</th>
                                    <th className="text-right px-4 py-3 font-black">Interacciones</th>
                                    <th className="text-right px-4 py-3 font-black">Tasa</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {piezas.map((p) => (
                                    <tr key={p.id} className="hover:bg-gray-50/60">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                {p.thumbnailUrl
                                                    ? <img src={p.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                                                    : <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />}
                                                <div className="min-w-0">
                                                    <p className="font-bold text-gray-800 truncate max-w-md">{p.caption || 'Sin texto'}</p>
                                                    <p className="text-[11px] text-gray-400">
                                                        {p.accountName} · {fecha(p.publishedAt)}
                                                        {/* De dónde salió: el punto 10 del pedido. */}
                                                        {p.origin && <span className="ml-2 px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 font-bold">Club Platform</span>}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-black text-gray-900">
                                            {fmt(p.metrics.content_views ?? p.metrics.content_reach ?? null)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-700">
                                            {fmt(p.metrics.content_engagement
                                                ?? ((p.metrics.content_likes || 0) + (p.metrics.content_comments || 0) + (p.metrics.content_shares || 0) + (p.metrics.content_reactions || 0) || null))}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-500">{fmt(p.engagementRate, '%')}</td>
                                        <td className="px-4 py-3 text-right">
                                            {p.externalUrl && (
                                                <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-rotary-blue">
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            ) : (
                <>
                    {/* ─── KPIs ───────────────────────────────────────────── */}
                    {cargando ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-50 rounded-2xl animate-pulse" />)}
                        </div>
                    ) : datos?.empty === 'sin_cuentas' ? (
                        <Aviso tono="info">
                            <p className="font-bold">No hay cuentas conectadas en este alcance.</p>
                            <p className="text-xs">Conectá Facebook o Instagram desde el Hub Social y volvé acá.</p>
                        </Aviso>
                    ) : !datos?.kpis.length ? (
                        <Aviso tono="info">
                            <p className="font-bold">Todavía no hay métricas guardadas para este período.</p>
                            {/* ⚠️ «Sin datos» y «error» no se ven iguales: el
                                estado de cada cuenta se pinta abajo con su
                                motivo, y sincronizar es la salida. */}
                            <p className="text-xs">Sincronizá para traer lo que Meta tenga disponible.</p>
                        </Aviso>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {datos.kpis.map((k) => (
                                <div key={k.metric} className="bg-white border border-gray-100 rounded-2xl p-5">
                                    <p className="text-[11px] uppercase tracking-wide font-black text-gray-400">{k.label}</p>
                                    <p className="text-2xl font-black text-gray-900 mt-1">{fmt(k.current, k.unit)}</p>
                                    <div className="mt-1"><Variacion k={k} /></div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ─── La serie ───────────────────────────────────────── */}
                    {metricaGrafico && serie.length > 1 && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-6">
                            <p className="text-sm font-bold text-gray-700 mb-4">
                                {metricaGrafico === 'views' ? 'Visualizaciones' : metricaGrafico === 'reach' ? 'Alcance' : 'Interacciones'} por día
                            </p>
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={serie}>
                                    <defs>
                                        <linearGradient id="gradSocial" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#0c3c7c" stopOpacity={0.25} />
                                            <stop offset="100%" stopColor="#0c3c7c" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                    <XAxis dataKey="metricDate" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey={metricaGrafico} stroke="#0c3c7c" strokeWidth={2} fill="url(#gradSocial)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* ─── Estado de cada cuenta ──────────────────────────── */}
                    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 text-[11px] uppercase tracking-wide font-black text-gray-400">
                            Cuentas y sincronización
                        </div>
                        <div className="divide-y divide-gray-50">
                            {cuentas.map((a) => (
                                <div key={a.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        {a.platform === 'facebook'
                                            ? <Facebook className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                            : <Instagram className="w-4 h-4 text-pink-500 flex-shrink-0" />}
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-800 truncate">{a.accountName}</p>
                                            <p className="text-[11px] text-gray-400">
                                                {a.clubName ? `${a.clubName} · ` : ''}
                                                {a.sync.syncedThrough
                                                    ? <>histórico hasta el {fecha(a.sync.syncedThrough)}</>
                                                    : <>sin histórico todavía</>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {a.sync.lastSyncAt && (
                                            <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {new Date(a.sync.lastSyncAt).toLocaleString('es-CO')}
                                            </span>
                                        )}
                                        <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${TONO[a.sync.tone] || TONO.neutral}`}>
                                            {a.sync.label}
                                        </span>
                                    </div>
                                    {a.sync.error && (
                                        <p className="w-full text-[11px] text-red-500 font-medium">{a.sync.error}</p>
                                    )}

                                    {/* ─── Permisos de ESTA cuenta ──────────────
                                        ⚠️ SE DICEN POR SEPARADO PARA FACEBOOK Y
                                        PARA INSTAGRAM. Son dos permisos, dos
                                        endpoints y dos motivos posibles: un
                                        estado común escondería que una de las
                                        dos sí puede leer. */}
                                    <div className="w-full flex flex-wrap items-center gap-2">
                                        {!a.insights.ok && (
                                            <span className="text-[11px] text-amber-600 font-medium">
                                                {a.insights.reason}
                                                {a.insights.fix ? <> — {a.insights.fix}</> : null}
                                            </span>
                                        )}
                                        {a.insights.ok && a.insights.verified === false && a.insights.note && (
                                            // «No se comprobó» NO es «está bien»: se pinta distinto.
                                            <span className="text-[11px] text-gray-400">{a.insights.note}</span>
                                        )}
                                        <button onClick={() => verificar(a.id)} disabled={verificando === a.id}
                                            className="ml-auto text-[11px] font-black text-rotary-blue underline disabled:opacity-40">
                                            {verificando === a.id ? 'Comprobando…' : 'Comprobar permisos con Meta'}
                                        </button>
                                    </div>

                                    {/* El veredicto de la comprobación en vivo,
                                        con el código de Meta: el diagnóstico
                                        técnico se conserva a la vista de quien
                                        tiene que resolverlo. */}
                                    {veredictos[a.id] && (
                                        <div className={`w-full text-[11px] rounded-lg px-3 py-2 border ${veredictos[a.id].ok ? TONO.ok : TONO.warn}`}>
                                            <p className="font-black">
                                                {veredictos[a.id].ok
                                                    ? 'Meta entregó estadísticas para esta cuenta.'
                                                    : veredictos[a.id].blockerLabel || 'Meta rechazó la consulta'}
                                            </p>
                                            {!veredictos[a.id].ok && veredictos[a.id].fix && (
                                                <p className="mt-0.5">{veredictos[a.id].fix}</p>
                                            )}
                                            <p className="mt-0.5 opacity-70">
                                                {veredictos[a.id].scope
                                                    ? <>Permiso «{veredictos[a.id].scope}»: {
                                                        veredictos[a.id].scopeGranted === true ? 'concedido'
                                                            : veredictos[a.id].scopeGranted === false ? 'NO concedido'
                                                                : 'no se pudo comprobar'
                                                    }. </>
                                                    : null}
                                                {veredictos[a.id].reason}
                                            </p>
                                        </div>
                                    )}
                                    {/* Lo que Meta no pudo dar, con su motivo: un hueco
                                        explicado es mejor que un cero afirmado. */}
                                    {a.sync.notes.filter((n) => n.reason).map((n, i) => (
                                        <p key={i} className="w-full text-[11px] text-amber-600 font-medium">
                                            {n.metric ? <strong>{n.metric}: </strong> : null}{n.reason}
                                        </p>
                                    ))}
                                </div>
                            ))}
                            {!cuentas.length && (
                                <div className="px-5 py-6 text-sm text-gray-400">Ninguna cuenta en este alcance.</div>
                            )}
                        </div>
                    </div>

                    {datos?.coverage && (
                        <p className="text-[11px] text-gray-400">
                            Histórico guardado: {datos.coverage.from ? `${fecha(datos.coverage.from)} → ${fecha(datos.coverage.to)}` : 'todavía vacío'}
                            {datos.coverage.days ? ` · ${datos.coverage.days} día(s) con datos` : ''}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default SocialAnalytics;
