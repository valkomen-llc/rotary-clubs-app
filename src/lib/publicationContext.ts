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
export const CAMPAIGN_TYPE_LABEL = 'Maneras de Contribuir';

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
};
