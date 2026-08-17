// Los FILTROS de la Bóveda. Puro: sin base, sin red, sin DOM.
//
// v4.849 — Bloque A del informe por período. Decide dos cosas y las decide en
// un solo sitio porque las consultan el servidor y la pantalla: qué rango de
// fechas se está mirando y a qué destino se acota.
//
// ═════════════════════════════════════════════════════════════════════
// UN SALDO NO SE FILTRA POR FECHA. Es la regla de la que cuelga el módulo.
// ═════════════════════════════════════════════════════════════════════
//
// Hay dos clases de número en esta pantalla y confundirlas es el error caro:
//
//   Un FLUJO —los aportes de un período, sus comisiones, su neto— existe
//   DENTRO de un rango. «Recibí tres aportes entre el 1 y el 15» significa
//   algo exacto y filtrarlo por fecha es lo natural.
//
//   Un SALDO —el disponible para retiro— existe A UNA FECHA, no dentro de un
//   rango. «Disponible para retiro entre el 1 y el 15» no significa nada.
//
// Si el filtro tocara el saldo, alguien elegiría «últimos 7 días», vería
// «US$ 0,00» y concluiría que no tiene dinero. Ese número es justamente el que
// decide si pide un retiro. Es la misma clase de defecto que el «$47.507,75»:
// una cifra aritméticamente correcta que no significa lo que parece.
//
// Por eso `FILTRABLE` es un catálogo explícito y el saldo NO está en él. Y por
// eso la pantalla lo DICE en vez de dejarlo deducir.

import { normalizeCurrency, roundMoney } from './money.js';

/** Lo que el filtro de período SÍ mueve. El saldo disponible no está acá, y su
 *  ausencia es la regla de arriba escrita como dato. */
export const FILTRABLE = ['aportes', 'comisiones', 'neto_periodo', 'movimientos'];

/** Lo que NUNCA se filtra, con el motivo a la vista de quien lo lea. */
export const NO_FILTRABLE = {
    saldo_disponible: 'Es un saldo, no un flujo: existe a una fecha, no dentro de un rango.',
    en_transito: 'Idem: es el estado actual del dinero, no lo que pasó en un período.',
};

// ── Rangos ───────────────────────────────────────────────────────────

/**
 * Los atajos del selector. `dias: null` es «todo el histórico».
 *
 * ⚠️ EL VALOR POR DEFECTO ES `todo`, NO «hoy». Con «hoy» la Bóveda abriría casi
 * siempre en cero —los aportes de un club no son diarios— y se leería como un
 * módulo roto. `todo` es además lo que la pantalla muestra desde siempre, así
 * que el filtro es ADITIVO: quien entre y no toque nada ve exactamente lo de
 * antes.
 */
export const RANGOS = [
    { id: 'todo', label: 'Todo el histórico', dias: null },
    { id: '7d', label: 'Últimos 7 días', dias: 7 },
    { id: '15d', label: 'Últimos 15 días', dias: 15 },
    { id: '30d', label: 'Últimos 30 días', dias: 30 },
    { id: '90d', label: 'Últimos 90 días', dias: 90 },
    { id: 'personalizado', label: 'Rango personalizado', dias: null },
];

export const RANGO_DEFAULT = 'todo';
export const RANGO_IDS = RANGOS.map(r => r.id);
export const isRango = (id) => RANGO_IDS.includes(String(id || ''));

const AL_DIA = 24 * 60 * 60 * 1000;

/** Una fecha `YYYY-MM-DD` o un instante → Date, o null si no se entiende.
 *  NUNCA lanza: esto llega del navegador y de la barra de direcciones. */
export const parseFecha = (valor) => {
    if (!valor) return null;
    const d = valor instanceof Date ? valor : new Date(String(valor));
    return Number.isFinite(d.getTime()) ? d : null;
};

/** El comienzo del día de una fecha, y el final. Un rango «del 1 al 15» tiene
 *  que incluir todo el día 15: acotarlo a las 00:00 del 15 se come el último
 *  día entero y nadie entiende por qué falta un aporte. */
export const inicioDelDia = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
export const finDelDia = (d) => { const x = new Date(d); x.setUTCHours(23, 59, 59, 999); return x; };

/**
 * Resuelve el rango que se está mirando.
 *
 * @returns { id, desde: Date|null, hasta: Date|null, label, personalizado }
 *          `desde: null` significa «sin límite por abajo», que es lo que hace
 *          `todo`. No se inventa una fecha de inicio: el club puede llevar
 *          años y poner un tope arbitrario escondería aportes reales.
 */
export const resolveRango = ({ rango, desde, hasta } = {}, ahora = new Date()) => {
    const id = isRango(rango) ? rango : RANGO_DEFAULT;
    const spec = RANGOS.find(r => r.id === id);

    if (id === 'personalizado') {
        const d = parseFecha(desde);
        const h = parseFecha(hasta);
        // Un rango personalizado sin ninguna de las dos puntas no es un rango:
        // se degrada a `todo` en vez de devolver algo vacío. Ante la duda, se
        // muestra de más — esconder dinero es el lado caro.
        if (!d && !h) return { id: RANGO_DEFAULT, desde: null, hasta: null, label: 'Todo el histórico', personalizado: false };
        // Invertido, se endereza. Es un error de dedo, no una petición vacía.
        const [ini, fin] = d && h && d > h ? [h, d] : [d, h];
        return {
            id: 'personalizado',
            desde: ini ? inicioDelDia(ini) : null,
            hasta: fin ? finDelDia(fin) : null,
            label: 'Rango personalizado',
            personalizado: true,
        };
    }

    if (spec?.dias == null) {
        return { id, desde: null, hasta: null, label: spec?.label || 'Todo el histórico', personalizado: false };
    }

    // «Últimos 7 días» incluye HOY. Contar 7 días hacia atrás desde ayer daría
    // ocho días de ventana o dejaría hoy fuera, según cómo se mire; incluirlo
    // es lo que espera quien lo elige.
    return {
        id,
        desde: inicioDelDia(new Date(ahora.getTime() - (spec.dias - 1) * AL_DIA)),
        hasta: finDelDia(ahora),
        label: spec.label,
        personalizado: false,
    };
};

/** ¿Cae esta fecha dentro del rango? Una fila SIN fecha legible se INCLUYE:
 *  descartarla haría desaparecer dinero de la pantalla por un dato ausente,
 *  que en este módulo es el error que no se puede cometer. */
export const dentroDelRango = (fecha, rango) => {
    if (!rango || (!rango.desde && !rango.hasta)) return true;
    const d = parseFecha(fecha);
    if (!d) return true;
    if (rango.desde && d < rango.desde) return false;
    if (rango.hasta && d > rango.hasta) return false;
    return true;
};

// ── Destinos ─────────────────────────────────────────────────────────
//
// ⚠️ NO se llama «campaña», y no es un detalle de nombre. Un aporte puede venir
// de una campaña, de un PROYECTO, de un BLOQUE de la página de aportes o del
// club a secas. Un filtro que sólo listara campañas haría desaparecer del
// listado a todos los demás sin que nadie supiera por qué — y en un módulo de
// dinero una fila que desaparece en silencio es lo peor que puede pasar.

export const DESTINO_TODOS = 'todos';
/** Los aportes que no declaran de dónde vinieron. Son los anteriores a v4.844,
 *  que no tienen la traza: EXISTEN y tienen que poder filtrarse como grupo en
 *  vez de quedar fuera de todas las opciones. */
export const DESTINO_SIN_DECLARAR = 'sin_destino';

export const CLASES_DESTINO = {
    campana: { label: 'Campaña', orden: 1 },
    proyecto: { label: 'Proyecto', orden: 2 },
    destino: { label: 'Destino', orden: 3 },
    sin_destino: { label: 'Sin destino declarado', orden: 4 },
};

/**
 * La clave con la que se agrupa un aporte por destino.
 *
 * Se construye del origen que ya resuelve `originOf` —el mismo criterio con
 * que se rotula la ficha del aportante y el recibo de Stripe—, para que el
 * filtro diga lo mismo que la tarjeta que hay debajo. Un segundo criterio de
 * origen daría dos verdades sobre el mismo aporte.
 */
export const destinoKeyOf = (origen) => {
    if (!origen || !origen.label) return DESTINO_SIN_DECLARAR;
    // El id cuando lo hay —dos campañas pueden llamarse parecido— y el rótulo
    // cuando no: es lo único que distingue a un destino sin identificador.
    return `${origen.kind}:${origen.id || origen.label}`;
};

/**
 * El catálogo de destinos de ESTE sitio, construido de sus propios aportes.
 *
 * No sale de una lista de campañas: sale de lo que de verdad se cobró. Una
 * campaña sin un solo aporte no aparece —un filtro que no filtra nada es un
 * control que no controla— y un aporte cuyo destino ya no existe sigue
 * apareciendo, porque su dinero sí existe.
 *
 * @param filas `[{ origen, currency, amount }]`
 * @returns `[{ key, label, kind, cuantos, porMoneda }]`, ordenado por clase y
 *          después por cuántos aportes tiene. Estable a propósito.
 */
export const catalogoDestinos = (filas) => {
    const mapa = new Map();
    for (const fila of filas || []) {
        const origen = fila?.origen || null;
        const key = destinoKeyOf(origen);
        const kind = origen?.label ? (origen.kind || 'destino') : 'sin_destino';
        if (!mapa.has(key)) {
            mapa.set(key, {
                key, kind,
                label: origen?.label || CLASES_DESTINO.sin_destino.label,
                cuantos: 0, porMoneda: {},
            });
        }
        const item = mapa.get(key);
        item.cuantos++;
        const code = normalizeCurrency(fila?.currency);
        item.porMoneda[code] = (item.porMoneda[code] || 0) + (Number(fila?.amount) || 0);
    }
    return [...mapa.values()].sort((a, b) => {
        const oa = CLASES_DESTINO[a.kind]?.orden ?? 9;
        const ob = CLASES_DESTINO[b.kind]?.orden ?? 9;
        if (oa !== ob) return oa - ob;
        if (b.cuantos !== a.cuantos) return b.cuantos - a.cuantos;
        return a.label.localeCompare(b.label);
    });
};

/** ¿Este aporte pertenece al destino elegido? `todos` no filtra. */
export const esDelDestino = (origen, destino) => {
    if (!destino || destino === DESTINO_TODOS) return true;
    return destinoKeyOf(origen) === destino;
};

// ── El filtro completo ───────────────────────────────────────────────

/**
 * Aplica período y destino a una lista de aportes.
 *
 * Devuelve además lo que se DEJÓ FUERA. No es información de más: sin ese
 * número, quien filtra no distingue «este período no tuvo aportes» de «el
 * filtro se comió algo», y en dinero esas dos cosas no se pueden confundir.
 */
export const aplicarFiltros = (donations, { rango, destino } = {}) => {
    const dentro = [];
    let fuera = 0;
    for (const d of donations || []) {
        if (!dentroDelRango(d?.date, rango)) { fuera++; continue; }
        if (!esDelDestino(d?.movement?.origin || d?.origen || null, destino)) { fuera++; continue; }
        dentro.push(d);
    }
    return { donations: dentro, excluidos: fuera };
};

/** ¿Hay algún filtro puesto? Sirve para decidir si la pantalla enseña el aviso
 *  y el botón de limpiar: con todo en su valor por omisión no hay nada que
 *  limpiar y el aviso sería ruido. */
export const hayFiltro = ({ rango, destino } = {}) =>
    (!!rango && rango.id !== RANGO_DEFAULT) || (!!destino && destino !== DESTINO_TODOS);

/**
 * Lo que el club recibió en el período, POR MONEDA.
 *
 * v4.850 — Vive acá y no en el controlador porque es CRITERIO, y en el
 * controlador no se podía probar: aquél importa la base, así que ejercitarlo
 * exigiría Postgres y en la práctica no se ejercitaba. Se vio enseguida — la
 * primera versión leía el movimiento con los nombres de la COLUMNA de la base
 * (`platformFee`, `netAmount`) en vez de los de `movementOf` (`applicationFee`,
 * `amount`), y eso no da error: da `undefined`, que suma cero. El bloque habría
 * mostrado «0» de retención y «0» de neto diciendo ser el del período.
 *
 * v4.849 — Son FLUJOS: bruto, lo que retuvo el procesador, lo que retuvo la
 * plataforma y el neto. Existen dentro de un rango y por eso se pueden filtrar
 * por fecha. El SALDO disponible no está acá y no puede estarlo — es un stock,
 * existe a una fecha, y filtrarlo por período daría un número que no significa
 * nada justo donde alguien decide si pide un retiro.
 *
 * Las retenciones se leen del movimiento atado a cada aporte. Un aporte sin
 * movimiento aporta su bruto y NO aporta retenciones: se cuenta lo que se sabe
 * y se DICE cuántos quedaron sin medir, en vez de inventarles una comisión.
 */
export const resumenDelPeriodo = (donations) => {
    const bruto = {}, procesador = {}, plataforma = {}, neto = {};
    let sinMovimiento = 0;

    const suma = (mapa, code, valor) => { mapa[code] = (mapa[code] || 0) + (Number(valor) || 0); };

    for (const d of donations || []) {
        const code = normalizeCurrency(d.currency);
        suma(bruto, code, d.amount);
        const m = d.movement;
        if (!m) { sinMovimiento++; continue; }
        // ⚠️ Los nombres son los de `movementOf`, no los de la columna de la
        // base: la retención de la plataforma viaja como `applicationFee` y el
        // neto como `amount`. Leerlos con el nombre de la columna no da error
        // —da `undefined`, que suma cero— y el resumen habría mostrado «0» de
        // retención y «0» de neto en un bloque que dice ser el del período.
        suma(procesador, code, m.stripeFee);
        suma(plataforma, code, m.applicationFee);
        suma(neto, code, m.amount);
    }

    const redondear = (mapa) => {
        const out = {};
        for (const [code, valor] of Object.entries(mapa)) out[code] = roundMoney(valor, code);
        return out;
    };

    return {
        bruto: redondear(bruto),
        procesador: redondear(procesador),
        plataforma: redondear(plataforma),
        neto: redondear(neto),
        aportes: (donations || []).length,
        // Los aportes de los que no se pudo leer la retención. Callarlos haría
        // que el neto del período pareciera completo cuando le falta gente.
        sinMovimiento,
    };
};

export default {
    FILTRABLE, NO_FILTRABLE,
    RANGOS, RANGO_DEFAULT, RANGO_IDS, isRango, resolveRango, dentroDelRango,
    parseFecha, inicioDelDia, finDelDia,
    DESTINO_TODOS, DESTINO_SIN_DECLARAR, CLASES_DESTINO,
    destinoKeyOf, catalogoDestinos, esDelDestino,
    aplicarFiltros, hayFiltro, resumenDelPeriodo,
};
