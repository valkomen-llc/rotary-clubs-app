/**
 * Fidelidad humana de una escena — v4.705
 * =======================================
 *
 * Los seis indicadores del control de personas, uno por uno y con su valor
 * real: cuántas personas hay en la fotografía, cuántas en el clip, si las
 * identidades se conservan, si las oclusiones se respetan, si los rostros son
 * los mismos y si apareció algún sujeto nuevo.
 *
 * Por qué existe aparte de la nota de fidelidad: son preguntas distintas. Una
 * persona inventada puede estar perfectamente dibujada y ser perfectamente ella
 * misma, así que no es deformación ni deriva de identidad — el control general
 * podía dar 8/10 con honestidad mientras el clip tenía un rostro de más. Eso es
 * exactamente lo que se reportó.
 *
 * Cada indicador tiene TRES estados y el tercero importa: `null` significa que
 * esa comprobación no se pudo hacer —sin modelo de visión, o un grupo demasiado
 * numeroso para contarlo con fiabilidad— y se pinta distinto de «bien». Misma
 * regla que el panel de diagnóstico del CRM: presentar «no se pudo comprobar»
 * como verde manda a buscar el problema donde no está.
 *
 * Vive en su propio archivo porque lo usan las dos pantallas del módulo —el
 * Creador y la Biblioteca— y duplicarlo dejaría que se separaran en silencio,
 * que es justo lo que la regla de componentes compartidos del sitio evita.
 */

import React from 'react';
import type { PeopleFidelity } from '../../../lib/reelSpec';

const Flag: React.FC<{ label: string; value: boolean | null; detail?: string | null }> = ({ label, value, detail }) => (
    <div className="flex items-start gap-1.5">
        <span className={`mt-[4px] w-1.5 h-1.5 rounded-full shrink-0 ${
            value === true ? 'bg-emerald-500' : value === false ? 'bg-red-500' : 'bg-gray-300'
        }`} />
        <span className="text-[10px] leading-tight text-gray-600">
            {label}
            {detail ? <span className="text-gray-400"> · {detail}</span> : null}
            {value === null ? <span className="text-gray-400"> · sin comprobar</span> : null}
        </span>
    </div>
);

// Sin personas en la fotografía no hay fidelidad humana que medir, y el
// servidor devuelve `null`: no se pinta nada en vez de pintar seis huecos.
const ScenePeopleCheck: React.FC<{ people?: PeopleFidelity | null; className?: string }> = ({ people, className = '' }) => {
    if (!people) return null;
    const ok = people.verdict === 'ok';

    return (
        <div className={`mt-2 rounded-lg border p-2 space-y-1 ${
            ok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'
        } ${className}`}>
            <div className={`text-[10px] font-black uppercase tracking-wide ${ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {people.label}
            </div>

            <Flag
                label="Personas en la fotografía"
                value={people.originalSeen != null ? true : null}
                detail={people.originalSeen != null
                    ? String(people.originalSeen)
                    : (people.sourceCount != null ? `${people.sourceCount}, según el análisis` : null)}
            />
            <Flag
                label="Personas en el clip"
                value={people.countStable}
                detail={people.clipSeen != null ? String(people.clipSeen) : null}
            />
            <Flag label="Identidades preservadas" value={people.identitiesPreserved} />
            <Flag label="Oclusiones preservadas" value={people.occlusionsPreserved} />
            <Flag
                label="Rostros consistentes"
                value={people.facesConsistent}
                detail={people.faceConsistency != null ? `${people.faceConsistency}/10` : null}
            />
            <Flag label="Sin sujetos nuevos" value={people.noNewSubjects} />

            {/* Contar catorce cabezas en una foto de grupo no lo hace bien ningún
                modelo de visión. Cuando el grupo es numeroso el recuento se
                muestra igual, pero se dice que no es él quien decide. */}
            {people.countReliable === false && (
                <p className="text-[9px] text-gray-500 leading-tight pt-0.5">
                    El grupo es numeroso: el recuento no decide por sí solo; sólo lo hace la
                    detección de sujetos nuevos.
                </p>
            )}
            {!ok && people.reason && (
                <p className="text-[10px] text-red-700 leading-tight pt-0.5">{people.reason}</p>
            )}
        </div>
    );
};

export default ScenePeopleCheck;
