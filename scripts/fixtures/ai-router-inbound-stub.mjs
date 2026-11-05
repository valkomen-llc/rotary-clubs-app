// El modelo de lenguaje, en memoria y CONFIGURABLE — para `test:whatsapp:inbound`.
//
// Misma firma que el servicio real (posicional, devuelve una CADENA: la lección
// de v4.901). Además permite simular las fallas que el pedido exige probar:
// `modo = 'ok' | 'falla' | 'vacio'`.
export const vistos = [];
let modo = 'ok';
export const setModo = (m) => { modo = m; };
export const reset = () => { vistos.length = 0; modo = 'ok'; };

export async function routeToModel(slug, systemPrompt = '', userPrompt = '', history = []) {
  vistos.push({ slug, systemPrompt: String(systemPrompt || ''), userPrompt: String(userPrompt || ''), history });
  if (modo === 'falla') throw new Error('Gemini 503: servicio no disponible (simulado)');
  if (modo === 'vacio') return '';
  return 'Con gusto te ayudo.';
}

export function buildFallbackChain() { return []; }
export default { routeToModel, buildFallbackChain };
