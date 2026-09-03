// El modelo de lenguaje, en memoria — para probar el CAMINO del router.
//
// ⚠️ LA FIRMA Y LA FORMA DE LA RESPUESTA SON LAS DEL SERVICIO REAL.
//
// `routeToModel` recibe argumentos POSICIONALES —`(slug, systemPrompt,
// userPrompt, history, options)`— y devuelve una CADENA, no un objeto. La
// primera versión de este doble usó un objeto con `{ systemPrompt }` y devolvió
// `{ content }`: el prompt llegaba vacío, la respuesta salía vacía y el agente
// caía a su fallback, así que la prueba reportaba «no respondió» sobre un
// módulo que estaba bien. Es la lección de v4.901 —el doble tiene que devolver
// LA MISMA FORMA que el servicio real— y de v4.945.
//
// Guarda el prompt de sistema que vio: es lo único que demuestra CUÁL agente
// atendió un mensaje sin mirar el estado interno del módulo. Si la línea de la
// Feria fuera atendida por el agente del Distrito, el prompt visto sería el
// otro y la prueba lo diría.
export const promptsVistos = [];
export const reset = () => { promptsVistos.length = 0; };

export async function routeToModel(slug, systemPrompt = '', userPrompt = '', history = [], options = {}) {
  promptsVistos.push(String(systemPrompt || ''));
  return 'Con gusto te ayudo.';
}

export function buildFallbackChain() { return []; }
export default { routeToModel, buildFallbackChain };
