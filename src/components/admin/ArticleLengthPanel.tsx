// ════════════════════════════════════════════════════════════════════════════
// Extensión de artículos generados por IA — v4.1059
//
// El panel PINTA y el servidor DECIDE: la referencia, los límites y el perfil
// resuelto vienen ya calculados de `/admin/article-length`. Acá no se estima
// ningún número — el promedio y el rango salen de los artículos que de verdad
// tiene el sitio (requisito 1 del encargo: «los números deben provenir de datos
// reales del sistema, no estimaciones»).
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { Ruler, RefreshCw, Save, AlertTriangle, Info } from 'lucide-react';
import { leerJson, describirNoJson } from '../../lib/leerJson';

const API = import.meta.env.VITE_API_URL || '/api';

interface Stats { count: number; average: number | null; min: number | null; max: number | null; median: number | null; charsPerWord: number | null; }
interface Respuesta {
    config: { targetChars: number | null; updatedAt: string | null; updatedByName: string | null };
    stats: Stats | null;
    measured: boolean;
    truncated: boolean;
    sampleLimit: number;
    reference: string[];
    limits: { min: number; max: number; seoRecommended: number; charsPerWord: number };
    profile: { targetChars: number | null; minChars: number | null; maxChars: number | null; targetWords: number; minSections: number; maxSections: number };
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CO'));

const ArticleLengthPanel: React.FC = () => {
    const [datos, setDatos] = useState<Respuesta | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [valor, setValor] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string; extra?: string[] } | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true); setError(null);
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/admin/article-length`, { headers: { Authorization: `Bearer ${token}` } });
            // Ninguna respuesta se lee con `.json()` a ciegas: una página de
            // error HTML rompe el parseo y el error no nombra ninguna capa.
            const { data, crudo, esJson } = await leerJson<Respuesta & { error?: string }>(r);
            if (!esJson) throw new Error(describirNoJson(r, crudo));
            if (!r.ok) throw new Error(data?.error || `El servidor respondió ${r.status}.`);
            setDatos(data as Respuesta);
            setValor(data?.config?.targetChars ? String(data.config.targetChars) : '');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo leer la configuración.');
        } finally { setCargando(false); }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const guardar = async () => {
        setGuardando(true); setAviso(null);
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/admin/article-length`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ targetChars: valor.trim() === '' ? null : Number(valor) }),
            });
            const { data: d, crudo, esJson } = await leerJson<{ ok?: boolean; error?: string; errors?: string[]; warnings?: string[]; note?: string }>(r);
            if (!esJson) { setAviso({ tono: 'error', texto: describirNoJson(r, crudo) }); return; }
            if (!r.ok) {
                // Se devuelven TODOS los errores: «configuración inválida» a
                // secas obliga a probar campo por campo.
                setAviso({ tono: 'error', texto: d?.error || `El servidor respondió ${r.status}.`, extra: d?.errors?.slice(1) });
                return;
            }
            setAviso({ tono: 'ok', texto: d?.note || 'Configuración guardada.', extra: d?.warnings });
            await cargar();
        } catch (e) {
            setAviso({ tono: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
        } finally { setGuardando(false); }
    };

    const perfil = datos?.profile;
    const limites = datos?.limits;

    return (
        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm mt-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600 shadow-sm">
                        <Ruler className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900">Extensión de artículos generados por IA</h2>
                        <p className="text-sm text-gray-400 font-medium">Gobierna cuánto escribe la IA. No recorta nada de lo que ya está publicado.</p>
                    </div>
                </div>
                <button onClick={cargar} disabled={cargando}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-black text-gray-500 hover:bg-white hover:shadow transition-all">
                    <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-100 text-xs font-bold text-red-700">{error}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ── El campo ── */}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="article-target-chars" className="block text-xs font-black text-gray-700 mb-2">
                            Longitud objetivo del cuerpo de artículos
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                id="article-target-chars"
                                type="number"
                                inputMode="numeric"
                                min={limites?.min}
                                max={limites?.max}
                                step={100}
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                placeholder="Sin objetivo"
                                className="w-44 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            />
                            <span className="text-xs font-bold text-gray-400">caracteres</span>
                            <button onClick={guardar} disabled={guardando || cargando}
                                className="ml-auto flex items-center gap-2 px-5 py-3 bg-sky-600 text-white rounded-xl text-xs font-black hover:bg-sky-700 disabled:opacity-50 transition-all">
                                <Save className="w-3.5 h-3.5" /> {guardando ? 'Guardando…' : 'Guardar'}
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-400 font-medium mt-3 leading-relaxed">
                            Es un <strong>objetivo con tolerancia</strong>, no un corte exacto: la IA escribe alrededor de ese número sin
                            partir frases ni párrafos. Dejá el campo vacío para volver a los perfiles de redacción del sistema.
                            {limites && <> Admitido entre <strong>{n(limites.min)}</strong> y <strong>{n(limites.max)}</strong> caracteres.</>}
                        </p>
                    </div>

                    {aviso && (
                        <div className={`p-4 rounded-2xl border text-xs font-bold ${aviso.tono === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>
                            <p>{aviso.texto}</p>
                            {aviso.extra?.length ? (
                                <ul className="mt-2 space-y-1 font-medium">
                                    {aviso.extra.map((t, i) => <li key={i}>· {t}</li>)}
                                </ul>
                            ) : null}
                        </div>
                    )}

                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                            Cambiar este número <strong>no reescribe ningún artículo existente</strong>. Para ajustar los que ya están,
                            usá «Regenerar artículo» en Gestión de Noticias —de a uno o en lote—. Y no limita lo que un administrador
                            escriba a mano: el contador del editor avisa, nunca bloquea.
                        </p>
                    </div>
                </div>

                {/* ── La referencia REAL ── */}
                <div className="space-y-4">
                    <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100">
                        <h4 className="text-xs font-black text-gray-900 mb-3 flex items-center gap-2">
                            <Info className="w-3.5 h-3.5 text-slate-400" /> Referencia medida
                        </h4>
                        {cargando ? (
                            <p className="text-[11px] text-gray-400 font-medium">Midiendo los artículos del sitio…</p>
                        ) : (
                            <>
                                <ul className="space-y-2">
                                    {(datos?.reference || []).map((l, i) => (
                                        <li key={i} className="text-[11px] text-gray-600 font-medium leading-relaxed">{l}</li>
                                    ))}
                                </ul>
                                {datos && !datos.measured && (
                                    <p className="text-[11px] text-amber-700 font-bold mt-3">
                                        No se pudieron leer los artículos para calcular el promedio. Se muestra un hueco en vez de una cifra estimada.
                                    </p>
                                )}
                                {datos?.truncated && (
                                    <p className="text-[10px] text-gray-400 font-medium mt-3">
                                        Medido sobre los {n(datos.sampleLimit)} artículos más recientes.
                                    </p>
                                )}
                                {datos?.stats?.charsPerWord ? (
                                    <p className="text-[10px] text-gray-400 font-medium mt-3">
                                        Observado en este sitio: {datos.stats.charsPerWord} caracteres por palabra.
                                    </p>
                                ) : null}
                            </>
                        )}
                    </div>

                    {perfil?.targetChars ? (
                        <div className="p-6 rounded-[2rem] bg-sky-50 border border-sky-100">
                            <h4 className="text-xs font-black text-gray-900 mb-3">Con esta configuración, cada artículo se pide así</h4>
                            <ul className="space-y-1.5 text-[11px] text-gray-600 font-medium">
                                <li>· Cuerpo entre <strong>{n(perfil.minChars)}</strong> y <strong>{n(perfil.maxChars)}</strong> caracteres (objetivo {n(perfil.targetChars)}).</li>
                                <li>· Aproximadamente <strong>{n(perfil.targetWords)}</strong> palabras.</li>
                                <li>· Entre <strong>{perfil.minSections}</strong> y <strong>{perfil.maxSections}</strong> secciones con subtítulo.</li>
                            </ul>
                            <p className="text-[10px] text-gray-400 font-medium mt-3 leading-relaxed">
                                La estructura se ajusta junto con el total: pedir un artículo corto conservando las secciones largas
                                lo haría imposible de cumplir.
                            </p>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default ArticleLengthPanel;
