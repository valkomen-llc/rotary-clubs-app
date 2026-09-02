// Tablero de campañas — el CRITERIO. v4.990
//
// Al entrar a «Campañas de Contribución» se abre un tablero ENCIMA del
// listado, y las campañas siguen debajo. Es el mismo patrón del tablero de
// inscripciones de un evento y del Centro de Inteligencia de la Feria: no es
// una pantalla nueva, es la cabecera de la que ya existe.
//
// PURO: sin base, sin red, sin DOM. Recibe filas ya leídas y decide qué se
// puede afirmar con ellas. Quién las lee es `contributionCampaignController`.
//
// ── Las tres reglas de las que cuelga todo ────────────────────────────────
//
// 1. LAS MONEDAS NO SE SUMAN, NUNCA. Es la regla del módulo financiero desde
//    v4.841 y acá vuelve a pesar: el recaudo viaja como una LISTA por moneda y
//    no hay ningún campo «total». Un peso no es un dólar y un número que los
//    junte es falso en las dos direcciones.
//
// 2. LO QUE CUENTA ES `Donation`, NO EL CONTADOR DIARIO. Sería más barato leer
//    `ContributionCampaignMetric.donation_completed` —ya está agregado por
//    campaña y por día—, y diría de MÁS: ese contador no baja cuando un aporte
//    se reembolsa (v4.859 marca `Donation.status = 'refunded'` y el contador se
//    queda donde estaba). Un tablero que afirma un dinero que se devolvió es
//    peor que no tener tablero. Es el mismo razonamiento por el que
//    `contributorRoll.js` tampoco lo usa.
//
// 3. LO QUE NO SE PUEDE MEDIR SE DECLARA. Cada indicador viaja con su
//    `medido`: un hueco es la verdad y un cero es una afirmación.

/** Los estados de un aporte que cuentan como dinero recibido. Sólo `success`:
 *  un reembolso dejó de ser un ingreso y un aporte que nunca se completó no
 *  existe como fila. Mismo valor que `COUNTED_STATUS` en `contributorRoll.js`,
 *  y por el mismo motivo — al tocar uno, mirar el otro. */
export const COUNTED_STATUS = 'success';

/** El estado en el que nace una solicitud de contenido. Es el que se destaca
 *  en el tablero: lo que importa de una bandeja es cuánto hay sin mirar. */
export const PENDING_SUBMISSION_STATE = 'recibido';

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const code = (c) => String(c || '').trim().toUpperCase() || 'USD';

/**
 * El recaudo de una lista de aportes, POR MONEDA.
 *
 * Devuelve un array ordenado —por importe, y a igualdad por código— y nunca un
 * total: ver la regla 1 de la cabecera. Una moneda sin un solo aporte no
 * aparece; un cero por moneda llenaría el tablero de filas que no dicen nada.
 *
 * @param aportes `[{ amount, currency, status }]`
 * @returns `[{ currency, amount, aportes }]`
 */
export const recaudoPorMoneda = (aportes) => {
    const mapa = new Map();
    for (const a of aportes || []) {
        if (String(a?.status || '') !== COUNTED_STATUS) continue;
        const cur = code(a.currency);
        if (!mapa.has(cur)) mapa.set(cur, { currency: cur, amount: 0, aportes: 0 });
        const fila = mapa.get(cur);
        fila.amount += num(a.amount);
        fila.aportes++;
    }
    return [...mapa.values()].sort((a, b) => (b.amount - a.amount) || a.currency.localeCompare(b.currency));
};

/**
 * Cuántos aportes y de cuántas personas identificadas.
 *
 * `aportes` es el número que se pinta: es lo que se puede demostrar. Contar
 * PERSONAS exigiría distinguir a quién pertenece cada aporte, y un aporte
 * anónimo —o uno sin correo— no se puede atribuir a nadie sin inventarlo; por
 * eso `personas` cuenta sólo los correos declarados y viaja aparte, para
 * mostrarse ÚNICAMENTE cuando aporta algo (o sea, cuando es menor que el
 * total). Llamar «aportantes» al número de aportes sería afirmar que dos
 * aportes son dos personas, y muchas veces no lo son.
 */
export const conteoDeAportes = (aportes) => {
    let total = 0;
    const correos = new Set();
    for (const a of aportes || []) {
        if (String(a?.status || '') !== COUNTED_STATUS) continue;
        total++;
        const correo = String(a?.donorEmail || '').trim().toLowerCase();
        if (correo) correos.add(correo);
    }
    return { aportes: total, personas: correos.size };
};

/**
 * El resumen de las solicitudes de contenido de una campaña.
 *
 * `pendientes` es el estado inicial: lo que llegó por el formulario y nadie
 * miró todavía. Es el único que se destaca — de una bandeja, lo que urge es
 * lo que está sin abrir.
 */
export const resumenDeSolicitudes = (filas) => {
    const porEstado = {};
    let total = 0;
    for (const f of filas || []) {
        const estado = String(f?.status || '').trim();
        if (!estado) continue;
        const n = num(f.n) || 0;
        porEstado[estado] = (porEstado[estado] || 0) + n;
        total += n;
    }
    return { total, porEstado, pendientes: porEstado[PENDING_SUBMISSION_STATE] || 0 };
};

/**
 * Arma el tablero: una fila por campaña más los totales.
 *
 * @param campaigns   `[{ id, name, ... }]` ya decoradas por el listado
 * @param aportesPorCampana  `Map<campaignId, [{ amount, currency, status, donorEmail }]>`
 * @param solicitudesPorCampana `Map<campaignId, [{ status, n }]>`
 * @param medido      qué se pudo leer de verdad: `{ aportes, solicitudes }`
 */
export const buildCampaignBoard = ({
    campaigns = [],
    aportesPorCampana = new Map(),
    solicitudesPorCampana = new Map(),
    medido = { aportes: true, solicitudes: true },
} = {}) => {
    const filas = campaigns.map(c => {
        const aportes = aportesPorCampana.get(String(c.id)) || [];
        const solicitudes = solicitudesPorCampana.get(String(c.id)) || [];
        return {
            id: c.id,
            ...conteoDeAportes(aportes),
            recaudado: recaudoPorMoneda(aportes),
            solicitudes: resumenDeSolicitudes(solicitudes),
        };
    });

    // Los totales del tablero se suman POR MONEDA sobre las filas ya
    // calculadas: volver a recorrer los aportes daría el mismo número por otro
    // camino, que es una segunda verdad esperando a separarse.
    const porMoneda = new Map();
    let aportes = 0;
    let solicitudes = 0;
    let pendientes = 0;
    for (const f of filas) {
        aportes += f.aportes;
        solicitudes += f.solicitudes.total;
        pendientes += f.solicitudes.pendientes;
        for (const r of f.recaudado) {
            if (!porMoneda.has(r.currency)) porMoneda.set(r.currency, { currency: r.currency, amount: 0, aportes: 0 });
            const fila = porMoneda.get(r.currency);
            fila.amount += r.amount;
            fila.aportes += r.aportes;
        }
    }

    return {
        filas,
        totales: {
            campanas: filas.length,
            aportes,
            recaudado: [...porMoneda.values()].sort((a, b) => (b.amount - a.amount) || a.currency.localeCompare(b.currency)),
            solicitudes,
            pendientes,
        },
        medido: {
            aportes: medido.aportes !== false,
            solicitudes: medido.solicitudes !== false,
        },
    };
};

export default {
    COUNTED_STATUS, PENDING_SUBMISSION_STATE,
    recaudoPorMoneda, conteoDeAportes, resumenDeSolicitudes, buildCampaignBoard,
};
