/**
 * ¿La escena VIVE? — v4.787
 * =========================
 *
 * Responde una pregunta OPUESTA a la de la fidelidad y por eso se pinta aparte:
 * la fidelidad penaliza que el clip se aleje de la fotografía, esto exige que
 * dentro del cuadro pase algo. Mezclarlas anula las dos (regla de v4.675).
 *
 * Existe como componente propio, y no escrito dos veces, porque lo usan las dos
 * pantallas del módulo —el Creador y la Biblioteca de Reels— y ahí está el
 * defecto que vino a corregir: hasta v4.786 la ficha de la Biblioteca sólo
 * mostraba «Fidelidad: 10/10», así que una escena SUSTITUIDA por la fotografía
 * en movimiento se leía como una escena lograda. El usuario veía tres clips que
 * sólo se desplazan bajo una cabecera en verde.
 *
 * Tres casos y cada uno dice algo distinto:
 *
 *   · SUSTITUIDA — el motor no conservó la escena tras los reintentos y se
 *     resolvió moviendo el encuadre. No es un aviso de calidad: es que esa
 *     escena no se animó. Lleva su motivo y la salida (regenerarla).
 *   · FOTOGRÁFICA por elección — la misma técnica, pedida a propósito. No es un
 *     defecto y no se pinta en ámbar.
 *   · ANIMADA — se muestra el nivel de vida medido, y cuando el cambio se
 *     explica desplazando el encuadre se dice, porque es la diferencia entre
 *     «se movió la gente» y «se movió la cámara».
 */

import React from 'react';
import { AlertTriangle, Camera, Sparkles } from 'lucide-react';
import type { FidelityReport } from '../../../lib/reelSpec';

interface Props {
    fidelity?: FidelityReport | null;
    /** El motor de la escena. `still_motion` es la fotografía en movimiento. */
    engine?: string | null;
    onRegenerate?: () => void;
    className?: string;
}

const SceneLifeCheck: React.FC<Props> = ({ fidelity, engine, onRegenerate, className = '' }) => {
    if (!fidelity) return null;

    const substituted = fidelity.substituted === true;
    const stillMotion = engine === 'still_motion' || fidelity.lifeSource === 'still-motion';

    // Una sustitución no es una nota baja: es una escena que no se animó.
    if (substituted) {
        return (
            <div className={`mt-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2 ${className}`}>
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Escena sin animar — sustituida
                </div>
                <p className="text-[10px] leading-tight text-amber-800 mt-1">
                    {fidelity.reason
                        || 'El motor no conservó la fotografía tras los reintentos, así que la escena se resolvió moviendo el encuadre sobre la foto.'}
                </p>
                {onRegenerate && (
                    <button
                        type="button"
                        onClick={onRegenerate}
                        className="mt-1.5 text-[10px] font-black text-amber-900 underline hover:no-underline"
                    >
                        Regenerar esta escena
                    </button>
                )}
            </div>
        );
    }

    // Elegida a propósito: se describe, no se avisa.
    if (stillMotion) {
        return (
            <p className={`text-[10px] font-bold text-gray-500 flex items-start gap-1 ${className}`}>
                <Camera className="w-3 h-3 mt-[1px] shrink-0" />
                <span>
                    Fotografía en movimiento, sin motor generativo: los píxeles son los del
                    original y dentro del cuadro no cambia nada.
                </span>
            </p>
        );
    }

    if (fidelity.lifeScore == null) {
        return (
            <p className={`text-[9px] font-bold text-gray-400 ${className}`}>
                Nivel de vida sin medir: hace falta el modelo de visión para distinguir el
                movimiento de las personas del movimiento de encuadre.
            </p>
        );
    }

    const tone = fidelity.lifeScore >= 60 ? 'text-emerald-600'
        : fidelity.lifeScore >= 25 ? 'text-amber-600' : 'text-red-600';

    return (
        <div className={className}>
            <p className={`text-[10px] font-bold flex items-center gap-1 ${tone}`}>
                <Sparkles className="w-3 h-3 shrink-0" />
                Nivel de vida: {fidelity.lifeScore} %
                {fidelity.lifeScore < 25 && !fidelity.cameraOnly && ' — la escena quedó prácticamente estática'}
            </p>
            {/* La medida que separa cámara de escena es determinista y no
                depende de ningún proveedor: si al desplazar el último fotograma
                sobre el primero la diferencia desaparece, lo que se movió fue
                el encuadre. Se dice con esas palabras porque es exactamente lo
                que el usuario reportó ver. */}
            {fidelity.cameraOnly && (
                <p className="text-[9px] font-bold text-red-600 leading-tight mt-0.5">
                    El clip se mueve, pero la escena no: el cambio se explica desplazando el
                    encuadre
                    {fidelity.cameraExplained != null
                        ? ` (${Math.round(fidelity.cameraExplained * 100)} % del cambio)`
                        : ''}
                    . Es cámara, no vida.
                </p>
            )}
        </div>
    );
};

export default SceneLifeCheck;
