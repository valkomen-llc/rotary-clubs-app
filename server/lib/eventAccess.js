// ════════════════════════════════════════════════════════════════════
// El guardia de RECURSO de los eventos — v4.1090.0
//
// Es el tercer nivel de la autorización (rol → módulo → recurso) aplicado a
// UN evento concreto. Lo consumen los dos controladores administrativos de
// inscripciones y las rutas del calendario: con la comprobación escrita en
// cada uno, la cuarta se olvidaría y el fallo sería MUDO — la ruta respondería
// de más y nadie lo vería hasta que alguien lo aprovechara.
//
// ⚠️ NO HAY UN SEGUNDO CRITERIO. Quién puede qué sobre qué evento lo decide
// `canAccessResource` de `rbacSpec.js` (puro y probado); acá sólo se resuelve
// el evento, se lee el grant de la sesión y se contesta. La pantalla ESCONDE
// pestañas y botones con el mismo criterio, pero esconder un control no
// protege un endpoint de quien lo conoce (v4.868): la puerta es ésta.
//
// ⚠️ UN EVENTO NO AUTORIZADO «NO EXISTE» (null → 404). Confirmar que existe es
// la mitad de lo que hace falta para ir a buscarlo, y es la exigencia literal
// del pedido: «no debe siquiera poder obtener mediante API los datos
// administrativos de eventos para los cuales no tenga autorización».
//
// ⚠️ DEGRADA A LO QUE HABÍA. Si el grant no se pudo resolver —fallo de
// consulta—, se cae a la comprobación de siempre (el evento pertenece al sitio
// de quien pregunta, o quien pregunta es el operador). Un tropiezo de la base
// no puede dejar sin panel a quien sí tiene permiso; y un rol que el RBAC no
// clasifica (`source: 'none'`, v4.939) tampoco pierde lo que hoy abre.
// ════════════════════════════════════════════════════════════════════
import { attachGrant } from '../middleware/institutionalGuard.js';
import { loadEvent } from './eventRegistrationStore.js';
import {
    canAccessResource, allowedResourceIds, canCreateResource, resourceCapabilitiesFor,
    isResourceRestricted, isPlatformOperator,
} from './rbacSpec.js';

export const EVENT_MODULE = 'events';

/** Con un grant sin criterio aplicable, manda la comprobación anterior. */
const grantDecides = (grant) => Boolean(grant) && grant.source !== 'none';

/**
 * ¿El grant sostiene esta capacidad sobre este evento?
 *   · `'registrations'`            → esa capacidad;
 *   · `['registrations','export']` → TODAS;
 *   · `{ any: ['a', 'b'] }`        → alguna.
 */
export const holdsCapability = (grant, eventId, capability = 'view') => {
    if (capability && typeof capability === 'object' && !Array.isArray(capability)) {
        const alguna = Array.isArray(capability.any) ? capability.any : [];
        return alguna.some(c => canAccessResource(grant, EVENT_MODULE, eventId, c));
    }
    const todas = Array.isArray(capability) ? capability : [capability];
    return todas.every(c => canAccessResource(grant, EVENT_MODULE, eventId, c));
};

/** El evento pertenece al sitio de quien pregunta, o quien pregunta es el operador. */
const belongsToSession = (req, event) =>
    isPlatformOperator(req.user) || (event.clubId && event.clubId === req.user?.clubId);

/**
 * Resuelve el evento y comprueba usuario → módulo → acción → recurso.
 * Devuelve la fila de `loadEvent` o `null` (no existe, es ajeno o no alcanza).
 */
export const assertEventCapability = async (req, eventRef, capability = 'view') => {
    if (!eventRef) return null;
    const event = await loadEvent(eventRef, isPlatformOperator(req.user) ? null : req.user?.clubId);
    if (!event) return null;
    if (!belongsToSession(req, event)) return null;
    const grant = await attachGrant(req);
    if (!grantDecides(grant)) return event;
    return holdsCapability(grant, event.id, capability) ? event : null;
};

/**
 * Los ids de evento que la sesión alcanza dentro de su sitio:
 *   · `null` → todos los del sitio (sin alcance acotado, o grant sin criterio);
 *   · `[]`   → ninguno.
 */
export const allowedEventIdsFor = async (req) => {
    const grant = await attachGrant(req);
    if (!grantDecides(grant)) return null;
    return allowedResourceIds(grant, EVENT_MODULE);
};

/** Filtra un listado de eventos por lo que la sesión alcanza. */
export const filterEventsFor = async (req, events) => {
    const ids = await allowedEventIdsFor(req);
    if (ids === null) return events;
    const set = new Set(ids);
    return events.filter(e => set.has(String(e.id)));
};

/** ¿Puede crear eventos? Un alcance acotado a eventos concretos no crea (v4.1090). */
export const canCreateEventsFor = async (req) => {
    const grant = await attachGrant(req);
    if (!grantDecides(grant)) return true;
    return canCreateResource(grant, EVENT_MODULE);
};

/** Las capacidades sobre un evento, RESUELTAS, para que la pantalla pinte y no decida. */
export const eventCapabilitiesFor = async (req, eventId) => {
    const grant = await attachGrant(req);
    if (!grantDecides(grant)) return null;
    return {
        restricted: isResourceRestricted(grant, EVENT_MODULE),
        capabilities: resourceCapabilitiesFor(grant, EVENT_MODULE, eventId),
    };
};

export default {
    EVENT_MODULE, holdsCapability, assertEventCapability, allowedEventIdsFor,
    filterEventsFor, canCreateEventsFor, eventCapabilitiesFor,
};
