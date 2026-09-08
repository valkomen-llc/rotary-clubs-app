// Base en memoria para `npm run test:public-media`.
//
// ⚠️ LEE EL SQL, NO REIMPLEMENTA EL CRITERIO. Un doble que decidiera por su
// cuenta qué fila devolver dejaría la prueba VACUA y encima afirmando lo
// contrario (la lección de v4.896): quitar el `WHERE id = $1` del módulo real
// no haría fallar nada. Acá el filtro se saca del texto de la consulta.
export let MEDIA = [];
export let CONSULTAS = [];

export function reset(filas = []) { MEDIA = filas; CONSULTAS = []; }

async function query(text, params = []) {
    CONSULTAS.push({ text, params });

    if (/FROM "Media"/i.test(text) && /WHERE id = \$1/i.test(text)) {
        const fila = MEDIA.find(m => m.id === params[0]);
        return { rows: fila ? [fila] : [] };
    }
    if (/FROM "Media"/i.test(text) && /"s3Key" = ANY/i.test(text)) {
        const claves = params[0] || [];
        return { rows: MEDIA.filter(m => claves.includes(m.s3Key)) };
    }
    return { rows: [] };
}

export default { query };
