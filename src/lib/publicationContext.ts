// ════════════════════════════════════════════════════════════════════
// Espejo en el navegador de `server/lib/publicationContext.js` — v4.833
//
// EL DEFECTO QUE ESTO CORRIGE. La regla de v4.667 dice que el catálogo de tipos
// de publicación vive en UN solo sitio porque, duplicado, «las dos listas se
// desincronizan sin que nadie lo note». Y seguía duplicado: `PostGenerator.tsx`
// llevaba los nueve tipos escritos a mano en el JSX, con sus etiquetas propias
// —«Storytelling» acá, «Narración de historias» allá—. Agregar el preset de
// Campañas de Contribución sin resolver esto significaba escribirlo dos veces.
//
// Se resuelve con un ESPEJO, no con una petición: es el patrón que ya usan
// `contributionSpec.ts`, `emergencyFeed.ts`, `campaignPostSpec.ts`,
// `designSpec.ts`, `reelSpec.ts` y `outroSpec.ts`, y no cuesta un viaje de red
// en una pantalla que ya hace varios. Lo que hace imposible la desincronización
// es la prueba: `test:campaign-post` carga los dos archivos y compara las
// SALIDAS, no sólo las claves. Al tocar uno, tocar el otro.
//
// `tone` y `focus` NO se espejan: son lo que se le dice al modelo, viven en el
// prompt y el navegador no los usa. Copiarlos acá sería duplicar texto que
// nadie lee de este lado.
// ════════════════════════════════════════════════════════════════════

export const TYPE_LABELS: Record<string, string> = {
    standard: 'Estándar',
    storytelling: 'Narración de historias',
    fundraising: 'Recaudación de fondos',
    event: 'Evento',
    project: 'Proyecto',
    membership: 'Membresía',
    networking: 'Establecimiento de contactos',
    endpolio: 'End Polio Now',
    crowdfunding: 'Financiación colectiva',
    // v4.967 — el décimo. Es el ÚNICO de la rejilla que se alimenta de una
    // entidad de la plataforma: al elegirlo hay que elegir además una campaña
    // de «Maneras de Contribuir», y de ella salen el contexto del copy y las
    // fotografías que se ofrecen. Sigue siendo el flujo «desde una foto»: misma
    // imagen, mismos tres formatos, mismo autosave, mismo publicar.
    ways_to_contribute: 'Maneras de Contribuir',
};

export const AREA_LABELS: Record<string, string> = {
    general: 'Impacto General',
    peace: 'Paz y Prevención de Conflictos',
    disease: 'Lucha contra Enfermedades',
    water: 'Agua y Saneamiento',
    environment: 'Medio Ambiente',
};

export const DEFAULT_TYPE = 'standard';
export const DEFAULT_AREA = 'general';

/**
 * Los tipos que se alimentan de una ENTIDAD de la plataforma y no sólo de una
 * fotografía. Es el espejo de `CAMPAIGN_BACKED_TYPES` del servidor: quien
 * DECIDE sigue siendo el servidor (`resolveContext`), y esto sólo gobierna qué
 * se pinta. Con la comprobación escrita por su nombre en el JSX, el día que
 * entre un segundo tipo así se olvida en una de las dos puntas.
 */
export const CAMPAIGN_BACKED_TYPES = ['ways_to_contribute'];
export const needsCampaign = (type: string) => CAMPAIGN_BACKED_TYPES.includes(type);

export const WAYS_TYPE_ID = 'ways_to_contribute';

/** Tope del contexto adicional. Espejo de `MAX_ADDITIONAL_CONTEXT`. */
export const WAYS_MAX_CONTEXT = 1200;

/**
 * El preset de Campañas de Contribución.
 *
 * NO está en `TYPE_LABELS` a propósito, y la distinción es la que sostiene todo
 * el módulo: los nueve tipos de arriba sólo cambian el TONO del copy y la
 * imagen la sigue regenerando un modelo. Éste **compone** la pieza con el motor
 * de Plantillas IA a partir de los datos de una campaña — es otro motor, otra
 * pantalla y otros controles. Mezclarlo en la misma lista haría que el resto
 * del formulario (motor de imagen, área de enfoque) siguiera a la vista sin
 * significar nada.
 */
export const CAMPAIGN_TYPE_ID = 'contribution';
/**
 * ⚠️ EL RÓTULO CAMBIÓ EN v4.967 Y EL ID NO.
 *
 * Se llamaba «Maneras de Contribuir», igual que el tipo nuevo de la rejilla, y
 * con los dos en la misma pantalla no había forma de saber cuál era cuál: son
 * dos cosas distintas que salen de la MISMA campaña —una compone una infografía
 * y la otra escribe el copy de una fotografía—. El id sigue siendo
 * `contribution` porque está guardado en las publicaciones ya generadas y en la
 * preferencia del usuario; renombrarlo las dejaría apuntando a un tipo que no
 * existe.
 */
export const CAMPAIGN_TYPE_LABEL = 'Infografía de Campaña';

export const publicationTypes = () => Object.keys(TYPE_LABELS).map(id => ({
    id,
    label: TYPE_LABELS[id],
    isDefault: id === DEFAULT_TYPE,
}));

export const interestAreas = () => Object.keys(AREA_LABELS).map(id => ({
    id,
    label: AREA_LABELS[id],
    isDefault: id === DEFAULT_AREA,
}));

export default {
    TYPE_LABELS, AREA_LABELS, DEFAULT_TYPE, DEFAULT_AREA,
    CAMPAIGN_TYPE_ID, CAMPAIGN_TYPE_LABEL, publicationTypes, interestAreas,
    CAMPAIGN_BACKED_TYPES, needsCampaign, WAYS_TYPE_ID, WAYS_MAX_CONTEXT,
};
