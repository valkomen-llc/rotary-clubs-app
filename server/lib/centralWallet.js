// La BÓVEDA CENTRAL. Puro: sin base, sin red, sin DOM.
//
// v4.853 — Fase 1 de la wallet multi-sitio. Consolida lo que recaudan todos los
// sitios de la plataforma SIN mezclar sus fondos.
//
// ═════════════════════════════════════════════════════════════════════
// CONSOLIDAR NO ES MEZCLAR, Y HAY DOS EJES QUE NO SE CRUZAN
// ═════════════════════════════════════════════════════════════════════
//
// 1. LA MONEDA. Nunca se suman COP y USD. Es la regla del módulo desde v4.841
//    y acá vuelve a aplicar, agravada: en la vista central el error se
//    multiplicaría por la cantidad de sitios.
//
// 2. EL SITIO. Un total consolidado —la suma de lo que recaudaron todos los
//    sitios en UNA moneda— es legítimo y es lo que la plataforma necesita
//    saber. Lo que NO puede pasar es que ese total sustituya al detalle: toda
//    fila conserva su `clubId`, y el consolidado se calcula A PARTIR de las
//    filas, no en lugar de ellas.
//
// La diferencia importa porque los dos totales responden preguntas distintas y
// ninguna reemplaza a la otra: «¿cuánto movió la plataforma este mes?» es del
// consolidado; «¿cuánto le toca al Distrito 4281?» es de su fila, y ese dinero
// es suyo, no de un fondo común.

import { normalizeCurrency, roundMoney } from './money.js';

/** Lo que la plataforma retiene, y lo que retiene el procesador, son DOS cosas
 *  distintas y por eso son dos campos. Mezclarlas haría imposible responder
 *  «¿cuánto monetiza Club Platform?» — que es justamente la pregunta que la
 *  Bóveda Central existe para contestar. */
export const CONCEPTOS = ['bruto', 'procesador', 'plataforma', 'neto', 'retirado', 'disponible'];

/**
 * Una fila del desglose por sitio, POR MONEDA.
 *
 * `clubId` no es opcional y no se pierde nunca: es lo que sostiene la promesa
 * de que consolidar no es mezclar.
 */
export const filaDeSitio = ({
    clubId, clubName, clubType, district, currency,
    aportes = 0, bruto = 0, plataforma = 0, neto = 0,
    enTransito = 0, disponibleProximamente = 0, retirado = 0,
}) => {
    const code = normalizeCurrency(currency);
    // La comisión del procesador se DERIVA: es lo que se llevó el proveedor,
    // que es el bruto menos lo que retuvo la plataforma menos lo que le quedó
    // al club. Derivarla es lo mismo que hace el libro mayor, y por el mismo
    // motivo: aceptarla de fuera permitiría un desglose que cuadra porque
    // alguien mandó el número que hacía falta.
    const procesador = roundMoney(Math.max(0, bruto - plataforma - neto), code);
    return {
        clubId, clubName: clubName || '(sin nombre)', clubType: clubType || null, district: district || null,
        currency: code,
        aportes,
        bruto: roundMoney(bruto, code),
        procesador,
        plataforma: roundMoney(plataforma, code),
        neto: roundMoney(neto, code),
        enTransito: roundMoney(enTransito, code),
        disponibleProximamente: roundMoney(disponibleProximamente, code),
        retirado: roundMoney(retirado, code),
        // Lo que el sitio podría pedir hoy: su neto menos lo que ya pidió. Es
        // la MISMA definición que `computeBalances` usa en la Bóveda local —un
        // segundo criterio daría dos cifras distintas para el mismo club en dos
        // pantallas de la misma plataforma.
        disponible: roundMoney(Math.max(0, neto - retirado), code),
    };
};

/**
 * Consolida las filas por MONEDA, conservando el detalle.
 *
 * Devuelve `{ [moneda]: { ...conceptos, sitios } }`. Nunca un escalar y nunca
 * una clave que cruce monedas — es la misma forma que `sumByCurrency`.
 */
export const consolidar = (filas) => {
    const total = {};
    for (const f of filas || []) {
        const code = normalizeCurrency(f.currency);
        if (!total[code]) {
            total[code] = {
                currency: code, aportes: 0, bruto: 0, procesador: 0, plataforma: 0,
                neto: 0, enTransito: 0, disponibleProximamente: 0, retirado: 0, disponible: 0,
                sitios: 0,
            };
        }
        const t = total[code];
        t.aportes += Number(f.aportes) || 0;
        for (const k of ['bruto', 'procesador', 'plataforma', 'neto', 'enTransito', 'disponibleProximamente', 'retirado', 'disponible']) {
            t[k] += Number(f[k]) || 0;
        }
        t.sitios++;
    }
    // Se redondea UNA vez al final, no por fila: acumular redondeos corre el
    // total en los céntimos, y acá se acumulan tantos como sitios haya.
    for (const code of Object.keys(total)) {
        for (const k of ['bruto', 'procesador', 'plataforma', 'neto', 'enTransito', 'disponibleProximamente', 'retirado', 'disponible']) {
            total[code][k] = roundMoney(total[code][k], code);
        }
    }
    return total;
};

/**
 * Agrupa las filas POR SITIO, con una sub-fila por moneda.
 *
 * Un sitio que recaudó en dos monedas es UNA entrada con DOS monedas dentro,
 * no dos entradas: en la tabla se lee como un solo sitio, que es lo que es.
 */
export const porSitio = (filas) => {
    const mapa = new Map();
    for (const f of filas || []) {
        if (!mapa.has(f.clubId)) {
            mapa.set(f.clubId, {
                clubId: f.clubId, clubName: f.clubName, clubType: f.clubType,
                district: f.district, monedas: [], aportes: 0,
            });
        }
        const sitio = mapa.get(f.clubId);
        sitio.monedas.push(f);
        sitio.aportes += Number(f.aportes) || 0;
    }
    // Orden estable: por cantidad de aportes y, a igualdad, por nombre. Sin el
    // desempate, dos sitios con los mismos aportes se alternarían entre visitas
    // y la tabla parecería moverse sola.
    return [...mapa.values()].sort((a, b) =>
        (b.aportes - a.aportes) || String(a.clubName).localeCompare(String(b.clubName))
    );
};

/**
 * El TAKE RATE de la plataforma, por moneda.
 *
 * `platform_fee / gross_amount`. Se calcula por moneda porque el bruto lo es;
 * uno global exigiría sumar COP con USD, que es lo que este módulo no hace.
 *
 * ⚠️ Devuelve `null` cuando no hay bruto, NO cero. Un take rate de «0 %» sobre
 * cero aportes es una afirmación falsa: no es que la plataforma no cobre, es
 * que no hubo nada que cobrar. Misma regla que el costo sin tarifa configurada
 * en el panel de auditoría del Creador de Reels.
 */
export const takeRate = (totalPorMoneda) => {
    const out = {};
    for (const [code, t] of Object.entries(totalPorMoneda || {})) {
        const bruto = Number(t?.bruto) || 0;
        out[code] = bruto > 0 ? Math.round((Number(t.plataforma) || 0) / bruto * 10000) / 100 : null;
    }
    return out;
};

/**
 * El ticket promedio por moneda. `null` sin aportes, por el mismo motivo que
 * el take rate: una media sobre cero no es cero, es nada.
 */
export const ticketPromedio = (totalPorMoneda) => {
    const out = {};
    for (const [code, t] of Object.entries(totalPorMoneda || {})) {
        const n = Number(t?.aportes) || 0;
        out[code] = n > 0 ? roundMoney((Number(t.bruto) || 0) / n, code) : null;
    }
    return out;
};

/** Los sitios que de verdad recaudaron algo. Sin esto, la tabla lista cientos
 *  de sitios en cero y el que importa se pierde entre ellos. */
export const soloConMovimiento = (sitios) =>
    (sitios || []).filter(s => (Number(s.aportes) || 0) > 0
        || (s.monedas || []).some(m => (Number(m.bruto) || 0) !== 0));

export default {
    CONCEPTOS, filaDeSitio, consolidar, porSitio, takeRate, ticketPromedio, soloConMovimiento,
};
