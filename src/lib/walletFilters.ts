// Espejo MÍNIMO de `server/lib/walletFilters.js`.
//
// v4.849 — Sólo lo que hace falta para PINTAR el selector: el catálogo de
// rangos, sus valores por omisión y si hay algún filtro puesto. La aritmética
// de fechas NO se duplica: el rango lo resuelve el servidor y lo devuelve ya
// resuelto (`periodo`), así que no hay dos cálculos que puedan discrepar sobre
// qué días entran.
//
// Duplicado a propósito, como `ADMIN_ROLES` y `NATIONAL_LANGS`: el servidor no
// puede importar del bundle ni al revés. Si cambia uno, cambiar el otro — lo
// comprueba `npm run test:wallet:filters` comparando las SALIDAS, no sólo las
// constantes.

export type RangoId = 'todo' | '7d' | '15d' | '30d' | '90d' | 'personalizado';

export interface Rango {
    id: RangoId;
    label: string;
    dias: number | null;
}

/** ⚠️ El valor por defecto es `todo`, no «hoy». Con «hoy» la Bóveda abriría
 *  casi siempre en cero y se leería como un módulo roto; `todo` es además lo
 *  que la pantalla muestra desde siempre, así que el filtro es aditivo. */
export const RANGOS: Rango[] = [
    { id: 'todo', label: 'Todo el histórico', dias: null },
    { id: '7d', label: 'Últimos 7 días', dias: 7 },
    { id: '15d', label: 'Últimos 15 días', dias: 15 },
    { id: '30d', label: 'Últimos 30 días', dias: 30 },
    { id: '90d', label: 'Últimos 90 días', dias: 90 },
    { id: 'personalizado', label: 'Rango personalizado', dias: null },
];

export const RANGO_DEFAULT: RangoId = 'todo';
export const DESTINO_TODOS = 'todos';
export const DESTINO_SIN_DECLARAR = 'sin_destino';

export const isRango = (id: string): id is RangoId =>
    RANGOS.some(r => r.id === id);

/** ¿Hay algún filtro puesto? Con todo en su valor por omisión no hay nada que
 *  limpiar y el aviso del período sería ruido. */
export const hayFiltro = (
    { rango, destino }: { rango?: string; destino?: string } = {}
): boolean =>
    (!!rango && rango !== RANGO_DEFAULT) || (!!destino && destino !== DESTINO_TODOS);

/** Lo que el filtro NO toca, para poder decirlo en la pantalla en vez de
 *  dejarlo deducir. El texto vive acá y no suelto en el JSX porque es una
 *  afirmación sobre cómo se comporta el módulo, no una etiqueta. */
export const AVISO_SALDO =
    'El saldo disponible es el actual, a hoy. El filtro afecta a los movimientos del período.';

export default {
    RANGOS, RANGO_DEFAULT, DESTINO_TODOS, DESTINO_SIN_DECLARAR,
    isRango, hayFiltro, AVISO_SALDO,
};
