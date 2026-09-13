/**
 * Leer la respuesta de una API sin `.json()` a ciegas.
 *
 * ⚠️ UNA RESPUESTA QUE NO ES JSON REVIENTA EL PARSEO Y EL ERROR NO NOMBRA
 * NINGUNA CAPA. Es la regla de v4.946, y el reporte que trajo este módulo la
 * muestra entera: al morir la invocación que estaba montando un Reel, la
 * plataforma contesta «A server error has occurred» en TEXTO PLANO, y
 * `await r.json()` lo convierte en
 *
 *     Unexpected token 'A', "A server e"... is not valid JSON
 *
 * que es lo que vio el usuario. Ese mensaje no dice quién falló, ni en qué
 * capa, ni qué hacer: manda a diagnosticar a ciegas justo cuando el sistema ya
 * sabía lo que había pasado.
 *
 * Se lee como TEXTO y lo que no sea JSON se DICE con su estado HTTP, su tipo de
 * contenido y un fragmento del cuerpo: la próxima captura es un diagnóstico.
 *
 * Vive acá y no copiado en cada pantalla porque el criterio es uno: el patrón
 * estaba escrito a mano en seis formularios y éste iba a ser el séptimo.
 */
export type RespuestaLeida<T = unknown> = { data: T | null; crudo: string; esJson: boolean };

export const leerJson = async <T = unknown>(res: Response): Promise<RespuestaLeida<T>> => {
    const crudo = await res.text();
    try {
        return { data: JSON.parse(crudo) as T, crudo, esJson: true };
    } catch {
        return { data: null, crudo, esJson: false };
    }
};

/**
 * Qué decirle a quien mira cuando la respuesta no era JSON.
 *
 * El estado y el tipo son lo que distingue las capas que se corrigen en sitios
 * distintos: un 502 del borde no es un 500 de la función ni un 200 con la
 * página de la aplicación. El fragmento va sin etiquetas para que una página de
 * error HTML no llene el aviso de marcado.
 */
export const describirNoJson = (res: Response, crudo: string): string => {
    const tipo = res.headers.get('content-type') || 'sin tipo';
    const muestra = crudo.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    return `El servidor contestó HTTP ${res.status} (${tipo}) en vez de JSON${muestra ? ` — «${muestra}»` : ''}.`;
};
