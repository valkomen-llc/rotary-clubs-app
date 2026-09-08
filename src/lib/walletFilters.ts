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

/**
 * v4.1014 — El TERCER eje: el estado del dinero, que es lo que hace clickeable
 * la tarjeta «Desembolsado».
 *
 * ⚠️ ACÁ SÓLO ESTÁN LOS RÓTULOS. Quién cae en cada estado lo decide el
 * SERVIDOR (`esDelEstado` en `walletFilters.js`) y la lista viaja ya filtrada:
 * con dos criterios, la pantalla diría «12 trasladados» y la lista mostraría
 * otra cosa. Es la misma regla que el período (v4.849) y el calendario de la
 * distribución (v4.864).
 */
export const ESTADO_TODOS = 'todos';

export const ESTADO_LABEL: Record<string, string> = {
    trasladado: 'Trasladado al beneficiario',
    available: 'Disponible para retiro',
    available_soon: 'Disponible próximamente',
    in_transit: 'En tránsito',
    refunded: 'Reembolsado',
    failed: 'Fallido',
};

/**
 * ⚠️ EL FILTRO DE ESTADO NO MUEVE LAS TARJETAS DE ARRIBA, y hay que DECIRLO.
 *
 * Son SALDOS por estado y se calculan sobre todo, no sobre lo filtrado. Sin
 * este aviso, que la tarjeta siga en el mismo número después de filtrar se lee
 * como que el filtro no funcionó — y moverlas sería peor: elegir
 * «Desembolsado» dejaría «Disponible para retiro» en cero y alguien
 * concluiría que no tiene dinero.
 */
export const AVISO_ESTADO =
    'El filtro cambia la lista de abajo. Las tarjetas de «Estado del dinero» son saldos y se siguen calculando sobre todo.';
export const DESTINO_SIN_DECLARAR = 'sin_destino';

export const isRango = (id: string): id is RangoId =>
    RANGOS.some(r => r.id === id);

/**
 * La clave con la que la Bóveda agrupa un aporte por destino.
 *
 * ESPEJO de `destinoKeyOf` en `server/lib/walletFilters.js`, comparado por
 * SALIDAS en las pruebas. Existe acá para que el tablero de campañas pueda
 * ARMAR el enlace a la Bóveda sin escribir la clave a mano: con la forma
 * `campana:<id>` repetida en dos sitios, el día que el criterio del servidor
 * cambie el enlace llevaría a un filtro que no existe y la Bóveda saldría
 * vacía — sin ningún error que lo dijera.
 */
export const destinoKeyOf = (
    origen: { kind?: string; id?: string | null; label?: string } | null | undefined
): string => {
    if (!origen || !origen.label) return DESTINO_SIN_DECLARAR;
    return `${origen.kind}:${origen.id || origen.label}`;
};

/** ¿Hay algún filtro puesto? Con todo en su valor por omisión no hay nada que
 *  limpiar y el aviso del período sería ruido. */
export const hayFiltro = (
    { rango, destino, estado }: { rango?: string; destino?: string; estado?: string } = {}
): boolean =>
    (!!rango && rango !== RANGO_DEFAULT)
    || (!!destino && destino !== DESTINO_TODOS)
    || (!!estado && estado !== ESTADO_TODOS);

/** Lo que el filtro NO toca, para poder decirlo en la pantalla en vez de
 *  dejarlo deducir. El texto vive acá y no suelto en el JSX porque es una
 *  afirmación sobre cómo se comporta el módulo, no una etiqueta. */
export const AVISO_SALDO =
    'El saldo disponible es el actual, a hoy. El filtro afecta a los movimientos del período.';

export default {
    RANGOS, RANGO_DEFAULT, DESTINO_TODOS, DESTINO_SIN_DECLARAR, destinoKeyOf,
    ESTADO_TODOS, ESTADO_LABEL, AVISO_ESTADO,
    isRango, hayFiltro, AVISO_SALDO,
};
