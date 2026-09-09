/**
 * TRASLADAR EL DINERO DE UNAS POSTULACIONES — v4.1026.
 *
 * El CRITERIO, y nada más. **Puro**: sin base, sin red, sin Stripe. Contesta
 * qué postulación de las elegidas se puede trasladar hoy, cuál no y POR QUÉ,
 * con la salida escrita al lado de cada bloqueo.
 *
 * ⚠️ POR QUÉ EXISTE. v4.1025 hizo que el cobro de una inscripción a la Feria
 * llegara a la Bóveda; lo que faltaba es poder ACTUAR sobre él desde donde se
 * está mirando. Se reportó con la pantalla delante: «al seleccionar las
 * postulaciones a las que voy a confirmar el traslado de recursos, no aparece
 * la opción como aparece en Bóveda de Fondos». Quien administra la Feria
 * trabaja en Postulaciones —ahí ve el club, el proyecto y si pagó—, no en una
 * lista de movimientos donde esas mismas inscripciones son doce renglones.
 *
 * ═════════════════════════════════════════════════════════════════════
 * ⚠️ NO HAY UN SEGUNDO MOTOR DE DESEMBOLSOS, Y DE ESO CUELGA TODO.
 * ═════════════════════════════════════════════════════════════════════
 *
 * Este módulo RESUELVE y no registra: traduce «estas postulaciones» a los
 * mismos `Elegible` que la barra de la Bóveda ya consume, y el registro sigue
 * yendo por `POST /financial/wallet/disbursements/bulk` —con su lote, su
 * comprobante compartido, su notificación consolidada y su idempotencia por
 * operación—. Con dos caminos hacia el registro, el día que se corrija el
 * reparto de un lote o la llave de una notificación una mitad se queda atrás y
 * el fallo es **MUDO**: las dos siguen registrando un desembolso, y lo que se
 * separa es cuánto se le giró a alguien y a quién se le avisó.
 *
 * Es la decisión de v4.1013 con el modal de compartir —un solo modal montado
 * por dos entradas, las dos contra el mismo servicio— aplicada al dinero.
 *
 * ⚠️ Y NO SE ESCRIBE UN SEGUNDO CRITERIO DE «SE PUEDE DESEMBOLSAR». Quién
 * puede girarse lo decide `canDisburse` (v4.885), que es el mismo que aplica
 * el registro: acá sólo se le AGREGAN las dos preguntas que la Bóveda no tiene
 * que hacerse porque parte de sus propios movimientos —¿existe el cobro?, ¿es
 * de este sitio?— y se traduce cada negativa a algo accionable.
 */

import { composeCollectionName } from './collectionSources.js';
import { normalizeCurrency, roundMoney } from './money.js';

/* ─── LOS BLOQUEOS ───────────────────────────────────────────────────*/

/**
 * El catálogo CERRADO de por qué una postulación elegida no se puede
 * trasladar.
 *
 * ⚠️ CADA UNO LLEVA SU SALIDA. Es la regla del sitio desde v4.1008: un bloqueo
 * cuya única respuesta es «no se puede» se lee como una avería y se reporta
 * como tal. `salida` dice qué hacer, y `donde` dice desde qué pantalla —para
 * que la lista de bloqueados pueda ofrecer el enlace en vez de nombrar una
 * pantalla que hay que ir a buscar.
 *
 * `sin_movimiento` es el que de verdad va a aparecer al estrenar esto: las
 * inscripciones cobradas antes de v4.1025 no tienen fila de `Payment` hasta
 * que alguien corra la reconstrucción, y sin esta entrada el módulo entero se
 * vería como «no funciona» cuando lo que falta es un paso que existe.
 */
export const TRANSFER_BLOCKS = {
    sin_cobro: {
        id: 'sin_cobro',
        motivo: 'Esta postulación todavía no tiene el pago confirmado.',
        salida: 'Sólo se traslada dinero que de verdad entró.',
        donde: null,
    },
    sin_movimiento: {
        id: 'sin_movimiento',
        motivo: 'El cobro está confirmado y todavía no tiene su movimiento en la Bóveda.',
        salida: 'Abrí la Bóveda de este sitio y usá «Buscar cobros sin registrar»: '
            + 'primero muestra un ensayo, sin escribir nada.',
        donde: 'boveda',
    },
    otro_sitio: {
        id: 'otro_sitio',
        motivo: 'El movimiento de este cobro pertenece a otro sitio.',
        salida: 'El traslado se registra desde el panel de ese sitio, que es donde está su Bóveda.',
        donde: null,
    },
    ya_trasladado: {
        id: 'ya_trasladado',
        motivo: 'Ya se trasladó por completo.',
        salida: 'Para volver a mandar su conciliación, entrá a la Bóveda y elegí el cobro.',
        donde: 'boveda',
    },
    no_disponible: {
        id: 'no_disponible',
        // El motivo lo pone `canDisburse`, que ya lo redacta con su causa y sus
        // días: repetirlo acá daría dos textos para el mismo hecho.
        motivo: null,
        salida: 'Cuando el dinero esté disponible, esta misma acción lo registra.',
        donde: null,
    },
};

export const BLOCK_IDS = Object.keys(TRANSFER_BLOCKS);

/** El bloqueo, ya redactado. `motivo` sobreescribe al del catálogo cuando el
 *  criterio de origen —`canDisburse`— trae uno más específico. */
export const describeBlock = (id, motivo = null) => {
    const b = TRANSFER_BLOCKS[id];
    if (!b) return null;
    return {
        id: b.id,
        motivo: (motivo && String(motivo).trim()) || b.motivo,
        salida: b.salida,
        donde: b.donde,
    };
};

/* ─── CÓMO SE NOMBRA UNA POSTULACIÓN ─────────────────────────────────*/

/**
 * El rótulo de una inscripción, con el MISMO compositor que usa el correo del
 * traslado (`composeCollectionName`).
 *
 * ⚠️ No se escribe un segundo formato. Si acá dijera «FP-WZ2W3J — Barranquilla»
 * y el correo «Inscripción FP-WZ2W3J · Barranquilla», quien confirma el
 * traslado y quien recibe el comprobante estarían leyendo dos nombres para la
 * misma fila y no habría forma de cruzarlos.
 */
export const submissionLabel = (submission = {}) =>
    composeCollectionName('project_fair', {
        ref: submission?.publicRef,
        party: submission?.clubName,
    });

/* ─── UNA POSTULACIÓN ────────────────────────────────────────────────*/

/**
 * ¿Esta postulación se puede trasladar?
 *
 * Recibe lo ya resuelto por el llamador —el pago, su saldo y el veredicto de
 * `canDisburse`— y no consulta nada: es lo que permite probar las siete ramas
 * sin una base delante.
 *
 * @param submission  La fila de `ProjectFairSubmission`.
 * @param payment     Su `Payment`, o `null` si todavía no tiene.
 * @param balance     `{ restante, completo }` de `disbursementBalance`.
 * @param permission  `{ ok, motivo, aviso }` de `canDisburse`.
 * @param siteClubId  El sitio contra el que se va a registrar el traslado.
 * @returns `{ id, titulo, elegible }` o `{ id, titulo, bloqueo }`.
 */
export const transferItem = ({
    submission = {}, payment = null, balance = null, permission = null, siteClubId = null,
} = {}) => {
    const id = String(submission?.id || '');
    const titulo = submissionLabel(submission) || id;
    const base = { id, titulo, publicRef: submission?.publicRef || null };

    const bloqueo = (motivoId, motivo) => ({ ...base, bloqueo: describeBlock(motivoId, motivo) });

    if (String(submission?.status || '').toLowerCase() !== 'paid') return bloqueo('sin_cobro');
    if (!payment || !payment.id) return bloqueo('sin_movimiento');

    // ⚠️ EL SITIO SE COMPRUEBA ACÁ Y OTRA VEZ EN EL `WHERE` DEL REGISTRO. Éste
    // existe para DECIRLO antes —el registro contestaría «no existe en este
    // sitio», que manda a buscar el problema donde no está—; el del registro es
    // el que no se puede saltar.
    const del = String(payment.clubId || '').trim();
    if (!del || (siteClubId && del !== String(siteClubId).trim())) return bloqueo('otro_sitio');

    if (permission && permission.ok === false) return bloqueo('no_disponible', permission.motivo);

    const restante = roundMoney(Number(balance?.restante) || 0, payment.currency);
    if (balance?.completo || restante <= 0) return bloqueo('ya_trasladado');

    return {
        ...base,
        elegible: {
            // La forma EXACTA que consume `BulkDisbursementBar`. No es una
            // coincidencia feliz: es lo que hace que la barra sea la misma.
            paymentId: String(payment.id),
            restante,
            currency: normalizeCurrency(payment.currency),
            titulo,
            clase: 'disponible',
        },
        // El aviso de `canDisburse` NO bloquea y se DICE: un cobro reconstruido
        // nace sin fecha de liberación del proveedor, así que su estado es una
        // suposición prudente y quien registra el giro tiene que saberlo.
        aviso: permission?.aviso || null,
    };
};

/* ─── EL SITIO DEL TRASLADO ──────────────────────────────────────────*/

/**
 * CONTRA QUÉ SITIO SE REGISTRA.
 *
 * ⚠️ PARA UN ADMINISTRADOR DE SITIO ES SIEMPRE EL SUYO, y no es una comodidad:
 * `clubDe` en el registro ignora el `clubId` del cuerpo para todo el que no sea
 * el operador de la plataforma, así que elegir otro acá daría una barra que
 * promete un traslado y recibe «no existe en este sitio». Se elige el mismo que
 * el servidor va a usar, o se estaría prometiendo lo que no se puede cumplir.
 *
 * Para el OPERADOR, que sí puede registrar contra cualquier sitio, se toma el
 * que reúne más cobros de la selección. El desempate es ESTABLE —cantidad, y
 * después el id ascendente—: si dependiera del orden en que la base devolvió
 * las filas, la misma selección se registraría contra sitios distintos en dos
 * intentos seguidos.
 */
export const pickTransferSite = (pagos = [], { sessionClubId = null, isOperator = false } = {}) => {
    const propio = String(sessionClubId || '').trim() || null;
    if (!isOperator) return propio;

    const cuenta = new Map();
    for (const p of pagos || []) {
        const club = String(p?.clubId || '').trim();
        if (!club) continue;
        cuenta.set(club, (cuenta.get(club) || 0) + 1);
    }
    if (!cuenta.size) return propio;
    return [...cuenta.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0][0];
};

/* ─── EL PLAN DE LA SELECCIÓN ────────────────────────────────────────*/

/**
 * El resumen de lo que se va a poder trasladar.
 *
 * ⚠️ LOS TOTALES SON POR MONEDA Y NUNCA SE SUMAN ENTRE ELLAS. Es la regla del
 * módulo financiero desde v4.841, y acá la selección puede mezclar de verdad:
 * una edición cobra en pesos y otra en dólares.
 */
export const planTransfers = (items = []) => {
    const elegibles = [];
    const bloqueados = [];
    const porMoneda = {};
    const avisos = [];

    for (const item of items || []) {
        if (item?.elegible) {
            elegibles.push(item.elegible);
            const c = item.elegible.currency;
            porMoneda[c] = roundMoney((porMoneda[c] || 0) + item.elegible.restante, c);
            if (item.aviso && !avisos.includes(item.aviso)) avisos.push(item.aviso);
        } else if (item?.bloqueo) {
            bloqueados.push(item);
        }
    }

    // Agrupado por motivo: una lista de doscientas filas no la lee nadie, y sin
    // el recuento «no pasó nada» es indistinguible de «no se pudo».
    const porMotivo = {};
    for (const b of bloqueados) {
        const id = b.bloqueo.id;
        porMotivo[id] ||= { ...b.bloqueo, cuantos: 0, ejemplos: [] };
        porMotivo[id].cuantos++;
        if (porMotivo[id].ejemplos.length < 3) porMotivo[id].ejemplos.push(b.titulo);
    }

    return {
        elegidos: (items || []).length,
        elegibles,
        bloqueados,
        motivos: Object.values(porMotivo).sort((a, b) => b.cuantos - a.cuantos),
        porMoneda,
        avisos,
    };
};

/**
 * La frase de la barra. Dice el HECHO —cuántas entran, cuánto suma cada moneda
 * y cuántas quedan fuera—, no si estás seguro.
 */
export const describeTransferPlan = (plan) => {
    if (!plan) return '';
    const n = plan.elegibles.length;
    if (!n) {
        return plan.elegidos === 1
            ? 'La postulación elegida no se puede trasladar todavía.'
            : `Ninguna de las ${plan.elegidos} postulaciones elegidas se puede trasladar todavía.`;
    }
    const montos = Object.entries(plan.porMoneda)
        .map(([c, v]) => `${v.toLocaleString('es-CO', { maximumFractionDigits: c === 'COP' ? 0 : 2 })} ${c}`)
        .join(' · ');
    const fuera = plan.bloqueados.length
        ? ` ${plan.bloqueados.length} queda${plan.bloqueados.length === 1 ? '' : 'n'} fuera, con su motivo.`
        : '';
    return `${n} ${n === 1 ? 'inscripción' : 'inscripciones'} por ${montos}.${fuera}`;
};

export default {
    TRANSFER_BLOCKS, BLOCK_IDS, describeBlock,
    submissionLabel, transferItem, pickTransferSite,
    planTransfers, describeTransferPlan,
};
