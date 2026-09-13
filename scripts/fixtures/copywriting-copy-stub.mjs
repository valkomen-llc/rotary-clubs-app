// El redactor, sustituido. Devuelve LA MISMA FORMA que el servicio real
// (`{ content, raw, provider, model }`): un doble que devolviera `{ text }`
// dejaría en verde un módulo que en producción lee `undefined` — es la lección
// de v4.901, pagada ahí mismo.
export const llamadas = [];
let cola = [];

export const responder = (respuestas) => { cola = [...respuestas]; };
export const limpiar = () => { llamadas.length = 0; cola = []; };

export const generateCopy = async (opts) => {
    llamadas.push(opts);
    const siguiente = cola.shift();
    if (siguiente instanceof Error) throw siguiente;
    if (typeof siguiente === 'undefined') throw new Error('sin proveedor de texto configurado');
    return {
        content: typeof siguiente === 'string' ? siguiente : siguiente.content,
        raw: null,
        provider: siguiente?.provider || 'openai',
        model: siguiente?.model || 'gpt-test',
    };
};

export default { generateCopy };
