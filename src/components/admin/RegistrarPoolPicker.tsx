// ════════════════════════════════════════════════════════════════════
// El pool registrador del dominio de un sitio — v4.877
//
// El selector que dice a qué POOL pertenece el registro del dominio de este
// sitio. Existía SÓLO en la Gestión Global de Clubes, escrito a mano dentro de
// esa pantalla, así que un RYE, una Feria, una Zona, un Evento o una
// Asociación no tenían por dónde recibir su pool — se reportó justamente así:
// «debe aparecer la opción desde la herramienta de editar».
//
// ── POR QUÉ ES UN COMPONENTE COMPARTIDO ─────────────────────────────
//
// Porque la alternativa era escribirlo por sexta vez. Es exactamente lo que ya
// pasó con la casilla de distritos: estaba copiada en las cinco pantallas de
// sitios, las copias se separaron en silencio y hubo que unificarlas en
// `DistrictPicker` (v4.748). Aquí el precio de que se separen es más alto: lo
// que se toca es una activación de facturación.
//
// ── EL CRITERIO NO VIVE ACÁ ─────────────────────────────────────────
//
// Está en `src/lib/registrarPools.ts`, puro y probado. Acá sólo se pinta.
// ════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Wallet } from 'lucide-react';
import {
    SIN_ASIGNAR,
    buildPoolOptions,
    normalizePools,
    poolNotice,
    type PoolRow,
} from '../../lib/registrarPools';

interface Props {
    /**
     * El pool asignado hoy.
     *
     * ⚠️ `undefined` significa «todavía no se sabe», y NO «sin asignar»: con
     * el valor sin definir la clave no viaja en el guardado y el servidor no
     * toca la activación. Ver la cabecera de `registrarPools.ts`.
     */
    value: string | undefined;
    onChange: (next: string) => void;
    /** El detalle del sitio todavía se está leyendo. */
    loading?: boolean;
    /** El dominio propio del sitio, para poder avisar si aún no lo tiene. */
    domain?: string | null;
}

const RegistrarPoolPicker: React.FC<Props> = ({ value, onChange, loading = false, domain }) => {
    const [pools, setPools] = useState<PoolRow[]>([]);
    const [cargando, setCargando] = useState(true);
    const [falló, setFalló] = useState(false);

    const API = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const res = await fetch(`${API}/admin/crowdfund/pools`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                });
                if (!res.ok) throw new Error('no disponible');
                const data = await res.json();
                if (!vivo) return;
                setPools(normalizePools(data));
            } catch {
                if (vivo) setFalló(true);
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [API]);

    const opciones = useMemo(() => buildPoolOptions(pools, value), [pools, value]);
    const aviso = useMemo(() => poolNotice(opciones, value, domain), [opciones, value, domain]);

    // ⚠️ Mientras no se sepa cuál es el pool asignado, el control NO se puede
    // manipular. Pintarlo en «Sin asignar» invitaría a guardar un borrado que
    // nadie pidió, y es el escenario real: la lista de sitios no trae este
    // dato —se deriva de la activación—, así que sólo lo sabe el detalle.
    const desconocido = value === undefined;

    return (
        <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
                Pool Registrador del Dominio (Opcional)
            </label>

            {desconocido ? (
                <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500 flex items-center gap-2">
                    {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Leyendo la asignación actual…</>
                    ) : (
                        <><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> No se pudo leer la asignación actual. Al guardar no se tocará.</>
                    )}
                </div>
            ) : (
                <select
                    className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all bg-white font-mono text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    value={value}
                    disabled={cargando}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value={SIN_ASIGNAR}>— Sin asignar —</option>
                    {opciones.map(o => (
                        <option key={o.id} value={o.id}>
                            {o.label}{o.full && !o.missing ? ' · sin cupo' : ''}
                        </option>
                    ))}
                </select>
            )}

            {/* El catálogo no se pudo leer: lo guardado se conserva y se dice. */}
            {falló && !desconocido && (
                <p className="text-xs text-amber-600 mt-1 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    No pudimos cargar la lista de pools. Se conserva la asignación que ya tenía;
                    para cambiarla, vuelve a intentarlo más tarde.
                </p>
            )}

            {!falló && !cargando && !desconocido && opciones.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                    Todavía no hay pools registradores creados en la plataforma.
                </p>
            )}

            {aviso && (
                <p className={`text-xs mt-1 flex items-start gap-1.5 ${aviso.kind === 'sin_dominio' ? 'text-gray-500' : 'text-amber-600'}`}>
                    {aviso.kind === 'sin_dominio'
                        ? <Wallet className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    {aviso.text}
                </p>
            )}

            <p className="text-[10px] text-gray-400 mt-1">
                Asigna a qué pool pertenece el registro de este dominio. Queda como una activación
                en la billetera del pool (cuenta como dominio activo y genera su comisión
                recurrente). Dejar en «Sin asignar» elimina la activación.
            </p>
        </div>
    );
};

export default RegistrarPoolPicker;
