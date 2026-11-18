// ════════════════════════════════════════════════════════════════════
// Directorio de Clubes — los NÚMEROS que el club escribe como texto (v4.1336)
//
// Reporte: «Revisar y Validar → Aprobar y Publicar» respondía «sintaxis de
// entrada inválida para el tipo entero: "NaN"» y ninguna solicitud con ese
// dato se podía aprobar.
//
// Causa: el formulario pide «Año o Fecha de Fundación» en un campo de TEXTO
// LIBRE («15 de marzo de 1927», «Fundado en 1954», «15/03/1927») y el número
// de socios llega como texto («35 socios»). La aprobación, la edición directa
// y el portal hacían `Number(valor)`: cualquier cosa que no fuera sólo dígitos
// daba `NaN`, el controlador de Postgres lo enviaba como «NaN» y las columnas
// INT (`foundationYear`, `memberCount`) rechazaban la sentencia ENTERA.
//
// Regla: de un texto se toma el número SÓLO si es inequívoco; si no, `null`
// (la columna queda vacía y, en una actualización, el COALESCE conserva lo que
// había). Nunca `NaN`, nunca un valor inventado. Lo que escribió el club se
// conserva intacto en el `payload` de la solicitud.
//
// PURO: sin base ni red.
// ════════════════════════════════════════════════════════════════════

export const MIN_FOUNDATION_YEAR = 1900; // Rotary nació en 1905; nada antes es un año de fundación.
const INT_MAX = 2147483647;

/**
 * El AÑO de fundación de un texto libre: el primer número de cuatro cifras
 * entre 1900 y el año en curso. «15 de marzo de 1927» → 1927;
 * «1927-03-15» → 1927; «3027» → null; «hace muchos años» → null.
 */
export const foundationYearFrom = (value, { now = new Date() } = {}) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        return Number.isInteger(value) && value >= MIN_FOUNDATION_YEAR && value <= now.getFullYear() ? value : null;
    }
    const max = now.getFullYear();
    for (const m of String(value).matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
        const y = Number(m[1]);
        if (y >= MIN_FOUNDATION_YEAR && y <= max) return y;
    }
    return null;
};

/**
 * Un entero no negativo de un texto: «35 socios» → 35; «1.200» → 1200;
 * «aprox. veinte» → null; «-5» → null; «12 a 15» → null (ambiguo).
 */
export const countFrom = (value, { max = 100000 } = {}) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= max ? value : null;
    const s = String(value).trim();
    if (/-\s*\d/.test(s)) return null;
    const nums = s.match(/\d[\d.,]*/g) || [];
    if (nums.length !== 1) return null;
    const n = Number(nums[0].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(/[.,].*$/, ''));
    return Number.isInteger(n) && n >= 0 && n <= Math.min(max, INT_MAX) ? n : null;
};

export default { foundationYearFrom, countFrom, MIN_FOUNDATION_YEAR };
