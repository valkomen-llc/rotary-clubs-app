// ════════════════════════════════════════════════════════════════════
// Los distritos a los que pertenece un sitio — v4.748
//
// Reemplaza la casilla de texto libre («Ej: 4271, 4281, 4290…») por la lista
// REAL de distritos registrados en la plataforma. Es lo que hacía falta para
// poder conectar una Feria de Proyectos, una Zona o un Programa con su
// distrito y que sus eventos aparezcan en «Traer del ecosistema».
//
// ── POR QUÉ ES UN COMPONENTE COMPARTIDO ─────────────────────────────
//
// Esta casilla estaba escrita CINCO veces, idéntica, en Ferias, Zonas,
// Programas, Eventos y Asociaciones. Arreglar una y dejar cuatro es la clase de
// copia que se queda atrás y hace que el panel se comporte distinto según por
// dónde se entre — el mismo problema que este proyecto ya documentó con el
// catálogo de iconos (v4.746.1) y con `ScenePeopleCheck`.
//
// ── LA LISTA AYUDA A ESCRIBIR; NO CIERRA LOS VALORES ────────────────
//
// Un distrito puede existir en Rotary y no estar todavía registrado en la
// plataforma, y este formulario se usa justo cuando se están dando de alta las
// cosas. Por eso queda la vía de escribir un número a mano, igual que «Mi club
// no está en la lista» en la postulación (v4.706) y en el registro al evento
// (v4.708). Y si la lista no se puede cargar, la casilla se degrada a texto
// libre en vez de dejar el formulario inservible.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { parseDistrictTags, formatDistrictTags } from '../../lib/districtEcosystem';

interface DistrictRow {
    id: string;
    number: number | null;
    name: string;
    countries?: string[];
}

interface Props {
    /** El valor tal como vive en `Club.district`: «4271, 4281». */
    value: string;
    onChange: (next: string) => void;
    /** Texto de ayuda bajo la casilla. */
    help?: string;
}

const DistrictPicker: React.FC<Props> = ({ value, onChange, help }) => {
    const [districts, setDistricts] = useState<DistrictRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [manual, setManual] = useState('');

    const API = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`${API}/admin/districts`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                });
                if (!res.ok) throw new Error('no disponible');
                const data = await res.json();
                if (!alive) return;
                // `?.` en cada eslabón: una respuesta que no sea la lista
                // esperada no puede tumbar el formulario entero.
                setDistricts(Array.isArray(data) ? data : []);
            } catch {
                if (alive) setFailed(true);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [API]);

    /** Los números elegidos, leídos del valor guardado. */
    const selected = useMemo(() => parseDistrictTags(value), [value]);

    /** Qué distrito registrado corresponde a cada número elegido. */
    const byNumber = useMemo(() => {
        const map = new Map<string, DistrictRow>();
        for (const d of districts) {
            if (d.number == null) continue;
            map.set(String(d.number), d);
        }
        return map;
    }, [districts]);

    const commit = useCallback((tags: string[]) => {
        onChange(formatDistrictTags(tags));
    }, [onChange]);

    const toggle = useCallback((num: string) => {
        commit(selected.includes(num)
            ? selected.filter(n => n !== num)
            : [...selected, num]);
    }, [commit, selected]);

    const addManual = useCallback(() => {
        const nums = parseDistrictTags(manual);
        if (!nums.length) return;
        const next = [...selected];
        for (const n of nums) if (!next.includes(n)) next.push(n);
        commit(next);
        setManual('');
    }, [manual, selected, commit]);

    // Sin catálogo no se puede elegir de una lista: se conserva la casilla de
    // siempre para no dejar el formulario sin este campo.
    if (failed) {
        return (
            <div>
                <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Ej: 4271, 4281, 4290..."
                />
                <p className="text-xs text-amber-600 mt-1">
                    No pudimos cargar la lista de distritos registrados. Escribe los números separados por coma.
                </p>
            </div>
        );
    }

    /** Los que ya están elegidos y NO figuran en el catálogo de la plataforma. */
    const huerfanos = selected.filter(n => !byNumber.has(n));

    return (
        <div>
            {/* Lo elegido, siempre a la vista */}
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {selected.map(num => {
                        const d = byNumber.get(num);
                        return (
                            <span
                                key={num}
                                className="inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-800 rounded-full pl-3 pr-1.5 py-1 text-sm"
                            >
                                <strong className="tabular-nums">{num}</strong>
                                {d?.name && <span className="text-sky-700/80 text-xs truncate max-w-[12rem]">{d.name}</span>}
                                <button
                                    type="button"
                                    onClick={() => toggle(num)}
                                    aria-label={`Quitar el distrito ${num}`}
                                    className="p-0.5 rounded-full hover:bg-sky-200 text-sky-700"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}

            {/* El catálogo registrado */}
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando distritos…
                    </div>
                ) : districts.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-500">
                        Todavía no hay distritos registrados en la plataforma. Puedes escribir el número
                        a mano y quedará vinculado cuando el distrito se dé de alta.
                    </div>
                ) : (
                    districts.map(d => {
                        const num = d.number == null ? '' : String(d.number);
                        const on = !!num && selected.includes(num);
                        return (
                            <button
                                type="button"
                                key={d.id}
                                disabled={!num}
                                onClick={() => num && toggle(num)}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition ${on ? 'bg-sky-50' : 'hover:bg-gray-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-rotary-blue border-rotary-blue text-white' : 'border-gray-300'}`}>
                                    {on && <Check className="w-3 h-3" />}
                                </span>
                                <span className="font-bold tabular-nums text-gray-800">{num || '—'}</span>
                                <span className="text-gray-600 truncate">{d.name}</span>
                                {Array.isArray(d.countries) && d.countries.length > 0 && (
                                    <span className="ml-auto text-xs text-gray-400 truncate shrink-0">
                                        {d.countries.join(', ')}
                                    </span>
                                )}
                            </button>
                        );
                    })
                )}
            </div>

            {/* La vía de escape: un distrito que aún no está registrado */}
            <div className="flex items-center gap-2 mt-2">
                <input
                    type="text"
                    inputMode="numeric"
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } }}
                    placeholder="¿No está en la lista? Escribe su número"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue outline-none"
                />
                <button
                    type="button"
                    onClick={addManual}
                    disabled={!parseDistrictTags(manual).length}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-rotary-blue hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Plus className="w-4 h-4" /> Agregar
                </button>
            </div>

            {huerfanos.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                    {huerfanos.length === 1
                        ? `El distrito ${huerfanos[0]} todavía no está registrado en la plataforma.`
                        : `Los distritos ${huerfanos.join(', ')} todavía no están registrados en la plataforma.`}
                    {' '}El vínculo funcionará en cuanto se den de alta.
                </p>
            )}

            <p className="text-xs text-gray-400 mt-1">
                {help || 'Marca los distritos a los que pertenece este sitio. Es lo que permite que sus eventos aparezcan en la agenda del distrito.'}
            </p>
        </div>
    );
};

export default DistrictPicker;
