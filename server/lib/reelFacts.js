// ════════════════════════════════════════════════════════════════════════════
// De dónde salen los HECHOS de un Reel — v4.1006
//
// Tres cosas viajan juntas cada vez que una pieza afirma algo sobre el mundo:
//
//   clause    la regla que se le pone al modelo ENCIMA de la voz institucional
//   brief     el texto con lo que sí se sabe, y lo que NO se sabe DICHO
//   universe  el universo de lo suministrado, contra el que `validateEmergencyCopy`
//             decide si una cifra es un dato o una invención
//
// POR QUÉ ESTE ARCHIVO. Hasta v4.1005 esas tres cosas se deducían de UN campo
// —`emergencyContext`— en tres sitios distintos (`generateScript`,
// `generateReelCopy` y su regeneración por plataforma), cada uno con su propio
// `emergencyContext ? … : …`. Eso funciona mientras la única pieza que afirma
// hechos sea la Campaña de Emergencia. El Reel que nace de una Solicitud de
// Contenido afirma hechos igual —un club, una fecha, un lugar, unas cantidades—
// y NO es una emergencia: aplicarle `EMERGENCY_FACT_CLAUSE` le describiría al
// modelo un desastre que quizá no ocurrió, que es exactamente lo que la regla
// de v4.967 prohíbe («la cláusula la decide el TIPO, no el nombre»).
//
// Lo que NO cambia es el VALIDADOR: sigue siendo `validateEmergencyCopy`, el
// mismo de la Campaña de Emergencia y del Generador de Publicaciones. Un
// segundo validador de cifras se separaría del primero en silencio.
//
// ADITIVO POR CONSTRUCCIÓN: sin `facts`, `resolveFactGuard` devuelve
// exactamente lo que esas tres funciones hacían antes, y sin `emergencyContext`
// tampoco devuelve nada. Un Reel estándar sigue sin cláusula de datos.
// ════════════════════════════════════════════════════════════════════════════

import { EMERGENCY_FACT_CLAUSE, buildEmergencyBrief } from './emergencySpec.js';

/**
 * La guardia de datos efectiva de una pieza.
 *
 * @param {object}  emergencyContext  el contexto normalizado de una campaña de
 *                                    emergencia, o `null`.
 * @param {object}  facts             `{ clause, brief, universe }` ya resuelto
 *                                    por quien conoce la fuente. Manda sobre
 *                                    `emergencyContext` cuando trae universo:
 *                                    quien lo arma sabe de qué habla la pieza.
 *
 * Devuelve siempre la misma forma. `universe` en `null` significa «esta pieza
 * no afirma hechos comprobables»: entonces no hay cláusula, no hay brief y no
 * se valida — que es el Reel estándar de siempre.
 */
export const resolveFactGuard = ({ emergencyContext = null, facts = null } = {}) => {
    if (facts && facts.universe) {
        return {
            clause: typeof facts.clause === 'string' && facts.clause.trim() ? facts.clause : EMERGENCY_FACT_CLAUSE,
            brief: typeof facts.brief === 'string' && facts.brief.trim() ? facts.brief : null,
            universe: facts.universe,
        };
    }
    if (emergencyContext) {
        // El brief se compone a partir de un contexto YA normalizado. Si llega
        // uno a medias, se degrada al contexto sin su texto en vez de tumbar la
        // generación: la validación —que es lo que de verdad protege— sigue
        // funcionando con el universo tal cual.
        let brief = null;
        try { brief = buildEmergencyBrief(emergencyContext); }
        catch (e) { console.warn('[reel-facts] brief de emergencia degradado:', e.message); }
        return { clause: EMERGENCY_FACT_CLAUSE, brief, universe: emergencyContext };
    }
    return { clause: null, brief: null, universe: null };
};

/** El prompt de sistema con su cláusula encima, si la hay. */
export const systemWithFacts = (base, guard) =>
    guard?.clause ? `${base}\n\n${guard.clause}` : base;
