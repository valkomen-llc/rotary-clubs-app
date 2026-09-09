/**
 * LAS FUENTES DE COBRO QUE SE PUEDEN TRASLADAR — v4.1025.
 *
 * El CRITERIO, y nada más. **Puro**: sin base, sin red, sin Stripe. Contesta
 * tres preguntas y ninguna toca dinero por su cuenta:
 *
 *   1. ¿De qué fuente es este cobro?      → `sourceOf`
 *   2. ¿A qué SITIO pertenece?            → `resolveCollectionSite`
 *   3. ¿Cómo se reparte lo que se cobró?  → `splitCollectionAmounts`
 *
 * ⚠️ POR QUÉ EXISTE. Un aporte de «Maneras de Contribuir» nace con su fila de
 * `Payment` atada a un sitio, así que la Bóveda lo ve, se puede trasladar y se
 * le puede mandar su conciliación. Una inscripción a la Feria de Proyectos NO:
 * su `Payment` sólo se creaba `if (submission.clubId)`, y ese valor salía de
 * `cfg.clubId` —un campo OPCIONAL del panel de la Convocatoria que había que
 * pegar a mano—. El propio `projectFairAdminController` lo dice con todas las
 * letras: «algo que nadie hacía». Consecuencia medida: doce inscripciones
 * pagadas, ningún movimiento registrado, y ninguna vía para girarle ese dinero
 * a los organizadores desde la plataforma. No fallaba ruidosamente: el cobro
 * entraba, el club quedaba inscrito, y el dinero no aparecía en ninguna parte.
 *
 * ⚠️ EL CATÁLOGO ES CERRADO Y EL SERVICIO ES GENÉRICO DESDE EL PRIMER DÍA.
 * Hoy sólo `project_fair` tiene resolutor; el registro de asistentes al evento
 * está DECLARADO con `available:false` y su motivo. Es la decisión de v4.1013
 * con `ENTITY_RESOLVERS`: declararlo disponible sería prometer una integración
 * que no existe —ese dinero vive en `EventRegistrationPayment` y no crea
 * ninguna fila de `Payment`—, y no declararlo obligaría a rehacer este módulo
 * el día que entre. Agregarlo es una entrada acá más su resolutor; el motor de
 * desembolsos, el correo del lote y la conciliación no cambian.
 */

import { normalizeCurrency, roundMoney } from './money.js';

/* ─── EL CATÁLOGO ────────────────────────────────────────────────────*/

/**
 * Las fuentes declaradas. `payloadType` es lo que el `rawPayload` del pago
 * escribe: es la llave por la que un cobro se reconoce después, y por eso se
 * declara acá y no se deduce del nombre de la fuente.
 */
export const COLLECTION_SOURCES = {
    project_fair: {
        id: 'project_fair',
        payloadType: 'project_fair_registration',
        label: 'Inscripción a la Feria de Proyectos',
        /** Cómo se nombra UNA fila suya en la tabla del correo de traslado. */
        itemLabel: 'Inscripción',
        available: true,
        reason: null,
    },
    event_registration: {
        id: 'event_registration',
        payloadType: 'event_registration',
        label: 'Inscripción al evento',
        itemLabel: 'Inscripción',
        available: false,
        // El motivo se DECLARA para que no haya que ir a buscarlo al código el
        // día que alguien pregunte por qué no está.
        reason: 'El cobro de una inscripción al evento vive en `EventRegistrationPayment` '
            + 'y todavía no crea una fila de `Payment`, así que ese dinero no existe para la '
            + 'Bóveda. Habilitarlo exige su propio resolutor, no un interruptor.',
    },
};

/** Los ids, en orden declarado. */
export const SOURCE_IDS = Object.keys(COLLECTION_SOURCES);

/** Las fuentes que de verdad se pueden trasladar hoy. */
export const availableSources = () =>
    SOURCE_IDS.filter(id => COLLECTION_SOURCES[id].available);

/**
 * De qué fuente es un cobro, leyendo lo que su propio pago declaró.
 *
 * Se compara contra `payloadType` y NUNCA por parecido del texto: un `includes`
 * haría que una fuente nueva cuyo nombre contenga a otra se clasificara mal, y
 * el fallo sería mudo — el cobro saldría en el correo con el rótulo de otra
 * cosa. Un tipo que nadie declaró devuelve `null`, que es la verdad.
 */
export const sourceOf = (payload = {}) => {
    const tipo = String(payload?.type || '').trim();
    if (!tipo) return null;
    return SOURCE_IDS.find(id => COLLECTION_SOURCES[id].payloadType === tipo) || null;
};

/**
 * CÓMO SE NOMBRA UN COBRO EN LA TABLA DEL CORREO.
 *
 * Un aporte se nombra por su aportante; una inscripción no tiene uno —tiene un
 * club que se inscribió y una referencia pública—. Sin esto, el correo de
 * traslado de la Feria diría «Aportante sin nombre» una vez por cada
 * inscripción: doce renglones idénticos que no le dicen nada a quien tiene que
 * cuadrar la transferencia contra su extracto.
 *
 * Devuelve `null` cuando no hay nada que decir. No se inventa un nombre: el
 * respaldo de `donorLine` («Aportante sin nombre») es honesto y sigue siendo el
 * que actúa.
 *
 * ⚠️ v4.1026 — EL COMPOSITOR DEL NOMBRE ES UNO SOLO (`composeCollectionName`).
 * Lo consumen esta función —que lee el `rawPayload` de un pago ya registrado—
 * y `projectFairTransfers.js`, que nombra una postulación cuyo cobro TODAVÍA no
 * tiene fila. Escrito dos veces, la lista de bloqueados de Postulaciones diría
 * un rótulo y el correo del traslado otro para la MISMA inscripción, y nadie
 * podría saber cuál de los dos es el bueno.
 */
export const composeCollectionName = (sourceId, { ref = '', party = '' } = {}) => {
    const fuente = COLLECTION_SOURCES[sourceId];
    if (!fuente) return null;
    const r = String(ref || '').trim();
    const quien = String(party || '').trim();
    return [r ? `${fuente.itemLabel} ${r}` : fuente.itemLabel, quien || null]
        .filter(Boolean).join(' · ');
};

export const collectionLabel = (payload = {}) => {
    const id = sourceOf(payload);
    if (!id) return null;
    const ref = String(payload?.publicRef || '').trim();
    const quien = String(payload?.clubName || '').trim();
    return {
        source: id,
        name: composeCollectionName(id, { ref, party: quien }),
        ref: ref || null,
        party: quien || null,
    };
};

/* ─── A QUÉ SITIO PERTENECE EL COBRO ─────────────────────────────────*/

/**
 * Las señales que resuelven el sitio, EN ORDEN. El orden no es negociable y es
 * el mismo criterio de `resolveArticleSite` (v4.1006): **lo que alguien
 * DECLARÓ va antes que lo que se puede deducir**, para que el mismo cobro
 * resuelva siempre al mismo sitio, lo mire quien lo mire.
 *
 *   `convocatoria` — el `clubId` que el administrador escribió en la
 *                    Convocatoria. Es una decisión explícita y manda.
 *   `edicion`      — el sitio del evento de la edición. `CalendarEvent.clubId`
 *                    es NOT NULL, así que toda edición tiene uno: es una señal
 *                    DECLARADA por quien creó la edición, no una deducción.
 *
 * Lo que NO se hace es deducir el sitio del dominio de la petición ni del club
 * que se inscribió: lo primero cambia con la pestaña desde la que se pagó y lo
 * segundo es el club que PAGA, no el que recibe. Confundirlos pondría el dinero
 * de la Feria en la Bóveda de un club participante.
 */
export const SITE_SIGNALS = ['convocatoria', 'edicion'];

/** La ayuda que se le da a quien tiene que resolverlo a mano. */
export const SITE_HELP =
    'Ninguna señal declara el sitio de este cobro. Se resuelve creando la edición como '
    + 'evento del sitio que va a recibir el dinero, o escribiendo su id en la Convocatoria '
    + '(Convocatoria → Club/organización asociada).';

/**
 * El sitio de un cobro, con la señal de la que salió.
 *
 * ⚠️ DE QUÉ SEÑAL SALIÓ QUEDA ESCRITO. Sin eso, «¿por qué este cobro entró a la
 * Bóveda de este sitio?» no se puede contestar dentro de seis meses — y acá la
 * respuesta decide a quién se le gira un dinero.
 */
export const resolveCollectionSite = (signals = {}) => {
    const candidatos = {
        convocatoria: signals.configuredClubId,
        edicion: signals.editionClubId,
    };
    for (const señal of SITE_SIGNALS) {
        const valor = String(candidatos[señal] || '').trim();
        if (valor) return { clubId: valor, signal: señal, help: null };
    }
    return { clubId: null, signal: null, help: SITE_HELP };
};

/* ─── CÓMO SE REPARTE LO QUE SE COBRÓ ────────────────────────────────*/

/**
 * De qué se dedujo cada cifra. `medido` es el desglose que el cobro guardó;
 * `derivado` es el precio publicado, que este flujo congela al enviar el
 * formulario. Presentarlos igual es lo que hace que un libro deje de servir
 * para cuadrar (regla del libro mayor, v4.847).
 */
export const AMOUNT_BASIS = ['medido', 'derivado'];

/**
 * EL REPARTIDOR, Y ES UNO SOLO.
 *
 * Lo usan el cobro en vivo y la reconstrucción hacia atrás. Con la aritmética
 * escrita en los dos sitios, el día que cambie una línea del recargo una de las
 * dos copias se queda atrás y el fallo es MUDO: las dos siguen devolviendo un
 * neto, y lo que se separa es cuánto se le gira a alguien.
 *
 * ⚠️ ACÁ EL RECARGO SE LE SUMÓ A QUIEN SE INSCRIBIÓ (v4.980), al revés que en
 * un aporte. El precio publicado es lo que la organización tiene que RECIBIR y
 * el recargo cubre lo que cuesta cobrarlo: por eso el neto se acerca al precio
 * publicado y no al bruto menos una tarifa nuestra.
 *
 * Tres caminos y ninguno inventa una tarifa:
 *
 *   1. CON DESGLOSE guardado → se reparte proporcionalmente sobre lo cobrado,
 *      línea por línea. `basis: 'medido'`.
 *   2. SIN DESGLOSE pero con el precio publicado en la MISMA moneda del cobro →
 *      el neto ES ese precio. No es una tarifa recalculada: es la cifra que el
 *      propio sistema publicó y congeló, y que el recargo existe para dejar
 *      intacta. `basis: 'derivado'`, y se dice.
 *   3. NI UNO NI OTRO → no se reparte y se dice por qué. Antes que un neto
 *      inventado, que es sobre lo que después alguien ordena una transferencia.
 */
export const splitCollectionAmounts = ({
    total = 0,
    currency = '',
    surcharge = null,
    publishedAmount = null,
    publishedCurrency = null,
} = {}) => {
    const moneda = normalizeCurrency(currency);
    const bruto = Number(total) || 0;
    if (!(bruto > 0)) {
        return { ok: false, motivo: 'sin_importe', applicationFee: null, processorFee: null, netAmount: null, basis: null, avisos: [] };
    }

    const lineas = surcharge?.lines || {};
    // El total PUBLICADO sobre el que se calculó el recargo. Viaja dentro del
    // propio desglose desde v4.980 — no se reconstruye de otro sitio.
    const publicadoDelDesglose = Number(surcharge?.chargeCop) || Number(surcharge?.chargeUsd) || 0;
    const recargo = Number(surcharge?.amount) || 0;

    if (recargo > 0 && publicadoDelDesglose > 0) {
        // Cada línea se lleva la misma proporción de lo cobrado que tenía sobre
        // lo publicado. Convertir con una tasa que acá no tenemos sería
        // inventarla; la proporción es exacta y no depende de ninguna.
        const enLaMonedaDelCobro = (valor) =>
            roundMoney((Number(valor) || 0) / publicadoDelDesglose * bruto, moneda);
        const retencion = enLaMonedaDelCobro(lineas.transfer);
        const procesador = enLaMonedaDelCobro(lineas.gateway);
        const neto = roundMoney(Math.max(0, bruto - retencion - procesador), moneda);
        return {
            ok: true,
            applicationFee: retencion > 0 ? retencion : null,
            processorFee: procesador > 0 ? procesador : null,
            netAmount: neto,
            basis: 'medido',
            avisos: [],
        };
    }

    const publicado = Number(publishedAmount) || 0;
    const monedaPublicada = normalizeCurrency(publishedCurrency);
    if (publicado > 0 && monedaPublicada && monedaPublicada === moneda) {
        // El neto no puede pasarse del bruto: un precio publicado mayor que lo
        // cobrado significa que algo no casa, y se acota antes que afirmar que
        // el sitio recibe más de lo que entró.
        const neto = roundMoney(Math.min(publicado, bruto), moneda);
        const avisos = ['El neto sale del precio publicado y congelado de la inscripción: este cobro no guardó el desglose de su recargo.'];
        if (publicado > bruto) {
            avisos.push('El precio publicado era mayor que lo cobrado: el neto se acotó a lo que de verdad entró.');
        }
        return {
            ok: true,
            // ⚠️ La retención de la PLATAFORMA no se deriva. Es una cifra
            // nuestra y, sin el desglose, no se sabe: `null` dice eso. Un cero
            // afirmaría que no retuvimos nada, que es otra cosa.
            applicationFee: null,
            processorFee: null,
            netAmount: neto,
            basis: 'derivado',
            avisos,
        };
    }

    return {
        ok: false,
        motivo: 'sin_neto_determinable',
        applicationFee: null, processorFee: null, netAmount: null, basis: null,
        avisos: [],
    };
};

/** Los motivos por los que un cobro no se puede reconstruir, en español. */
export const REBUILD_REASONS = {
    sin_importe: 'El cobro no registró ningún importe.',
    sin_neto_determinable: 'No se pudo determinar cuánto le corresponde al sitio: el cobro no guardó el desglose de su recargo y su precio publicado está en otra moneda.',
    sin_referencia: 'El cobro no tiene referencia del proveedor: no hay con qué identificarlo ni evitar contarlo dos veces.',
    sin_sitio: 'No se pudo resolver a qué sitio pertenece este cobro.',
    sin_moneda: 'El cobro no registró en qué moneda entró.',
    ya_registrado: 'Este cobro ya tiene su movimiento registrado.',
};

export default {
    COLLECTION_SOURCES, SOURCE_IDS, availableSources, sourceOf, collectionLabel,
    SITE_SIGNALS, SITE_HELP, resolveCollectionSite,
    AMOUNT_BASIS, splitCollectionAmounts, REBUILD_REASONS,
};
