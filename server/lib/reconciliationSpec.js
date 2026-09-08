// ════════════════════════════════════════════════════════════════════
// EL CRITERIO DE LA CONCILIACIÓN DE UN TRASLADO — v4.1014
//
// Puro: sin base, sin red, sin correo, sin PDF. Lo que decide QUÉ se puede
// reenviar, SOBRE QUÉ traslado, QUÉ dice el documento y CÓMO se lee el
// historial. La orquestación vive en `reconciliationNotices.js` y el
// documento en `reconciliationPdf.js`.
//
// ⚠️ ESTO NO MUEVE DINERO Y NO PUEDE MOVERLO. Un reenvío es una operación
// DOCUMENTAL sobre un traslado que YA ocurrió: no crea un desembolso, no toca
// un saldo, no cambia un estado financiero y no llama a la pasarela. Todo lo
// que este archivo produce son textos, filas y veredictos.
//
// El pedido que lo originó: se giraron ocho aportes a un club y se avisó a dos
// correos; después el presidente pide la conciliación. Hasta v4.1013 la única
// vía era `retryBatchNotice`, que vuelve a salir SÓLO a los destinatarios
// guardados en el lote y SÓLO a los que fallaron — así que al presidente no
// había forma de mandarle nada sin volver a registrar el giro.
// ════════════════════════════════════════════════════════════════════

import { MAX_POR_CANAL } from './disbursementNotice.js';

/* ─── QUÉ CUENTA COMO «TRASLADADO» ───────────────────────────────────
 *
 * ⚠️ CATÁLOGO CERRADO. Un estado que no esté acá no se puede seleccionar para
 * conciliar ni entra en el filtro: equivocarse hacia el otro lado sería
 * ofrecer la conciliación de un dinero que todavía no salió.
 *
 * `disbursed` es el giro completo y `disbursing` el parcial. Los dos son
 * traslados REALES —el dinero se movió— y los dos tienen su comprobante; lo
 * que los distingue es cuánto falta, y eso lo dice la ficha, no el filtro.
 */
export const DISBURSED_BUCKETS = ['disbursed', 'disbursing'];

export const isDisbursedBucket = (bucket) =>
    DISBURSED_BUCKETS.includes(String(bucket || ''));

/**
 * La CLASE de un aporte para la selección.
 *
 * ⚠️ SON DOS SELECCIONES QUE NO SE PUEDEN MEZCLAR, y de eso cuelga la barra de
 * acciones. Sobre lo `disponible` se REGISTRA un giro —mueve dinero—; sobre lo
 * `trasladado` se REENVÍA un documento —no mueve nada—. Un botón que actúe
 * sobre una mezcla haría una de las dos cosas mal, y una de ellas es dinero.
 *
 * `ninguna` es el valor seguro: un aporte reembolsado, fallido o todavía en
 * tránsito no participa de ninguna de las dos.
 */
export const selectionClassOf = (mov = {}, { restante = 0 } = {}) => {
    if (!mov || !mov.id) return 'ninguna';
    const estado = String(mov.status || '');
    if (estado === 'refunded' || estado === 'failed') return 'ninguna';
    if (isDisbursedBucket(mov.bucket)) return 'trasladado';
    if (estado === 'pending') return 'ninguna';
    // Lo que el proveedor todavía retiene no se puede girar: se decide con la
    // FECHA, que es un hecho, y no con la columna de estado, que se queda
    // vieja (la lección de v4.885).
    const retenido = !!(mov.availableOn && new Date(mov.availableOn) > new Date());
    if (retenido) return 'ninguna';
    return restante > 0.005 ? 'disponible' : 'ninguna';
};

/**
 * Qué hay dentro de una selección.
 *
 * Devuelve la clase ÚNICA cuando todos son de la misma —que es lo que habilita
 * una acción— y `mezclada` cuando no. Una mezcla no se ejecuta: se dice y se
 * ofrece quedarse con una de las dos.
 */
export const classifySelection = (elegidos = []) => {
    const lista = Array.isArray(elegidos) ? elegidos : [];
    const disponibles = lista.filter(e => e?.clase === 'disponible');
    const trasladados = lista.filter(e => e?.clase === 'trasladado');
    const mezclada = disponibles.length > 0 && trasladados.length > 0;
    return {
        total: lista.length,
        disponibles,
        trasladados,
        mezclada,
        clase: mezclada ? 'mezclada' : (trasladados.length ? 'trasladado' : (disponibles.length ? 'disponible' : 'ninguna')),
    };
};

/* ─── LA AGRUPACIÓN POR TRASLADO ─────────────────────────────────────
 *
 * ⚠️ LA CONCILIACIÓN ES DEL TRASLADO COMPLETO, NUNCA DE UNA PARTE, y es la
 * decisión más importante de este archivo.
 *
 * Se pidió «seleccionar aportes y reenviar su conciliación». Lo que se
 * SELECCIONA identifica el traslado; lo que se ENVÍA es el traslado entero.
 * El motivo: un documento que dijera «3 de los 8 aportes de esta
 * transferencia» no cuadra contra el extracto bancario —el banco vio UNA
 * transferencia por el total— y una conciliación que no cuadra es peor que
 * ninguna. Se dice en la pantalla en vez de recortar en silencio.
 *
 * Resuelve además el pedido de «ver todos los aportes de este traslado»: es la
 * misma operación mirada desde el otro lado.
 */

/**
 * De los desembolsos de los aportes elegidos a los TRASLADOS que los cubren.
 *
 * @param filas `[{ paymentId, batchId, status }]` — los desembolsos de esos aportes.
 * @returns `{ batchIds, sueltos, porLote }`
 *          `sueltos` son los aportes cuyo desembolso no pertenece a ningún
 *          lote: los de v4.885, anteriores al agrupamiento. NO se inventa un
 *          lote para ellos — se dicen, y su conciliación es la de un aporte.
 */
export const groupByTransfer = (filas = []) => {
    const porLote = new Map();
    const sueltos = [];
    for (const f of Array.isArray(filas) ? filas : []) {
        if (!f?.paymentId) continue;
        // Un desembolso REVERSADO no traslada nada: no puede arrastrar a su
        // aporte a una conciliación. Es el mismo criterio con el que el saldo
        // no lo descuenta.
        if (f.status === 'reversado') continue;
        const lote = f.batchId ? String(f.batchId) : null;
        if (!lote) { if (!sueltos.includes(f.paymentId)) sueltos.push(f.paymentId); continue; }
        if (!porLote.has(lote)) porLote.set(lote, []);
        const ya = porLote.get(lote);
        if (!ya.includes(f.paymentId)) ya.push(f.paymentId);
    }
    return {
        batchIds: [...porLote.keys()],
        porLote: Object.fromEntries(porLote),
        sueltos,
    };
};

/**
 * Lo que hay que DECIR antes de reenviar, cuando la selección no coincide con
 * el traslado.
 *
 * «Elegiste 3 y se van a conciliar los 8 del traslado» es la clase de cosa que
 * no se puede descubrir después de haber mandado el correo.
 */
export const describeTransferScope = ({ elegidos = 0, cubiertos = 0, lotes = 1, sueltos = 0 } = {}) => {
    const partes = [];
    if (lotes > 1) {
        partes.push(`Los ${elegidos} aportes elegidos corresponden a ${lotes} traslados anteriores: se genera UNA conciliación consolidada que conserva la referencia de cada movimiento.`);
    }
    if (lotes === 1 && !sueltos && cubiertos > elegidos) {
        partes.push(`El traslado cubre ${cubiertos} aporte${cubiertos === 1 ? '' : 's'} y elegiste ${elegidos}: la conciliación va COMPLETA, porque una parcial no cuadra contra el extracto bancario.`);
    }
    if (sueltos > 0) {
        partes.push(`${sueltos} aporte${sueltos === 1 ? '' : 's'} se giró suelto, sin lote: entra${sueltos === 1 ? '' : 'n'} en la conciliación consolidada con su propia referencia de movimiento.`);
    }
    return partes;
};

/* ─── EL ÁMBITO DE UNA CONCILIACIÓN ──────────────────────────────────
 *
 * ⚠️ v4.1015 — ESTO SUPERSEDE, EN UN PUNTO, LA REGLA DE ARRIBA.
 *
 * v4.1014 exigía un LOTE para poder conciliar: `Disbursement.batchId` era el
 * requisito técnico con el que se construía el comprobante, y un aporte girado
 * de a uno —o girado antes de que los lotes existieran (v4.996)— no tenía
 * `batchId` NUNCA. La barra decía «ninguno pertenece a un traslado agrupado» y
 * el botón quedaba apagado: había ocho aportes trasladados, con su dinero
 * afuera y su insignia DISBURSED, y ninguna forma de mandarle la conciliación
 * al presidente que la pedía.
 *
 * El diagnóstico completo: el lote no era una necesidad del DOCUMENTO, era la
 * única llave con la que el módulo sabía buscar los aportes. Lo que un
 * comprobante necesita son los APORTES y sus movimientos; el lote es una de
 * las dos formas de llegar a ellos.
 *
 * Así que hay DOS ÁMBITOS y el código elige solo:
 *
 *   · `traslado`  — los aportes elegidos pertenecen todos a UN mismo lote. Se
 *                   reutiliza el comprobante del traslado, completo, como
 *                   hasta ahora. La regla de que una conciliación parcial no
 *                   cuadra contra el extracto SIGUE ENTERA acá.
 *   · `seleccion` — cualquier otro caso: varios lotes, giros sueltos, o una
 *                   mezcla. Se compone una conciliación CONSOLIDADA sobre los
 *                   aportes elegidos.
 *
 * ⚠️ Y LA CONSOLIDADA NO FINGE SER UN TRASLADO. No lleva referencia de lote
 * —lleva la suya, `CONC-…`, que identifica el DOCUMENTO—, declara que abarca
 * varios movimientos, y lista la referencia y la fecha de CADA UNO. Inventarle
 * un `LOTE-` afirmaría una transferencia que el banco nunca vio, que es la
 * misma clase de mentira que la regla original quería evitar.
 *
 * ⚠️ NADA DE ESTO CREA UN `DisbursementBatch`. Un lote es un hecho financiero
 * —tiene totales, comprobante bancario y aparece en la lista de traslados—; una
 * consolidación es un documento. Fabricar un lote para poder conciliar sería
 * exactamente el movimiento de dinero que este módulo tiene prohibido.
 */

export const RECONCILIATION_SCOPES = ['traslado', 'seleccion'];

/** La referencia de una conciliación consolidada.
 *
 *  `CONC-` y no `LOTE-` a propósito: nombra el documento, no un traslado. Los
 *  últimos ocho del id, como el resto de las referencias del módulo. */
export const reconciliationRef = (id) => {
    const limpio = String(id || '').replace(/-/g, '');
    return limpio ? `CONC-${limpio.slice(-8).toUpperCase()}` : '';
};

/**
 * DE LOS APORTES ELEGIDOS AL ÁMBITO DE SU CONCILIACIÓN.
 *
 * @param paymentIds  los aportes que marcó el usuario.
 * @param filas       sus desembolsos: `[{ id, paymentId, batchId, status }]`.
 * @param batchSizes  `{ [batchId]: cuántos aportes cubre }`, para poder decir
 *                    cuándo un lote entra sólo en parte.
 *
 * Devuelve el ámbito, los movimientos que lo componen y lo que quedó fuera.
 * Un aporte SIN desembolso vivo no entra y se nombra: puede estar reversado, o
 * no haberse girado nunca, y las dos cosas se corrigen en sitios distintos.
 */
export const planReconciliation = ({ paymentIds = [], filas = [], batchSizes = {} } = {}) => {
    const elegidos = [...new Set((paymentIds || []).map(String).filter(Boolean))];
    const vivas = (Array.isArray(filas) ? filas : []).filter(f => f?.paymentId && f.status !== 'reversado');

    const porPago = new Map();
    for (const f of vivas) {
        if (!elegidos.includes(String(f.paymentId))) continue;
        if (!porPago.has(String(f.paymentId))) porPago.set(String(f.paymentId), []);
        porPago.get(String(f.paymentId)).push(f);
    }

    const excluidos = elegidos.filter(id => !porPago.has(id));
    const incluidos = elegidos.filter(id => porPago.has(id));
    const movimientos = incluidos.flatMap(id => porPago.get(id));
    const disbursementIds = [...new Set(movimientos.map(f => f.id).filter(Boolean))];

    const lotes = [...new Set(movimientos.map(f => (f.batchId ? String(f.batchId) : null)).filter(Boolean))];
    const sueltos = incluidos.filter(id => porPago.get(id).every(f => !f.batchId));

    // ⚠️ UN SOLO LOTE Y NINGÚN SUELTO ES EL CAMINO DE SIEMPRE. Se conserva
    // entero —comprobante del traslado completo incluido— porque ahí el
    // documento SÍ cuadra contra una línea del extracto.
    const scope = (lotes.length === 1 && sueltos.length === 0) ? 'traslado' : 'seleccion';

    // Cuántos aportes de cada lote entran en la selección: es lo que permite
    // decir «del traslado LOTE-X se incluyen 3 de sus 8».
    const porLote = {};
    for (const lote of lotes) {
        porLote[lote] = [...new Set(movimientos.filter(f => String(f.batchId) === lote).map(f => String(f.paymentId)))];
    }
    const parciales = lotes
        .map(lote => ({ batchId: lote, incluidos: porLote[lote].length, total: Number(batchSizes?.[lote]) || 0 }))
        .filter(x => x.total > 0 && x.incluidos < x.total);

    return {
        scope,
        batchId: scope === 'traslado' ? lotes[0] : null,
        batchIds: lotes,
        porLote,
        parciales,
        paymentIds: incluidos,
        disbursementIds,
        sueltos,
        excluidos,
        cubiertos: scope === 'traslado' ? (Number(batchSizes?.[lotes[0]]) || incluidos.length) : incluidos.length,
    };
};

/**
 * Lo que hay que DECIR antes de mandar una conciliación consolidada.
 *
 * ⚠️ NINGUNA DE ESTAS FRASES BLOQUEA. La de v4.1014 —«no tiene una conciliación
 * de traslado que reenviar»— era la única que sí lo hacía, y era falsa: sí la
 * tiene, sólo que no es la de un lote. Un aviso que impide continuar sin
 * ofrecer salida se lee como una avería (v4.1008).
 */
export const describeReconciliationPlan = (plan = {}, { batchRefOf = (id) => id } = {}) => {
    const partes = [];
    const nLotes = (plan.batchIds || []).length;
    const nSueltos = (plan.sueltos || []).length;
    const nAportes = (plan.paymentIds || []).length;

    if (plan.scope === 'traslado') {
        if ((plan.cubiertos || 0) > nAportes) {
            partes.push(`El traslado cubre ${plan.cubiertos} aportes y elegiste ${nAportes}: la conciliación va COMPLETA, porque una parcial no cuadra contra el extracto bancario.`);
        }
    } else if (nAportes) {
        const origen = [];
        if (nLotes) origen.push(`${nLotes} traslado${nLotes === 1 ? '' : 's'} agrupado${nLotes === 1 ? '' : 's'}`);
        if (nSueltos) origen.push(`${nSueltos} giro${nSueltos === 1 ? '' : 's'} suelto${nSueltos === 1 ? '' : 's'}`);
        partes.push(
            `Los ${nAportes} aportes elegidos vienen de ${origen.join(' y ')}. `
            + 'Se genera UNA conciliación consolidada que conserva la referencia de cada movimiento original; '
            + 'no se modifica ninguno de ellos.'
        );
        for (const p of plan.parciales || []) {
            partes.push(`Del traslado ${batchRefOf(p.batchId)} se incluyen ${p.incluidos} de sus ${p.total} aportes: el documento lo dice.`);
        }
    }

    if ((plan.excluidos || []).length) {
        const n = plan.excluidos.length;
        partes.push(`${n} aporte${n === 1 ? '' : 's'} quedó fuera: no tiene un traslado vigente registrado (nunca se giró, o su desembolso está reversado).`);
    }
    return partes;
};

/**
 * El rango de fechas de los movimientos conciliados.
 *
 * Una consolidación no tiene «la fecha del traslado»: tiene la primera y la
 * última. Decir una sola sería elegir cuál de los movimientos representa a
 * todos, y ninguno lo hace.
 */
export const dateRangeOf = (fechas = []) => {
    const t = (Array.isArray(fechas) ? fechas : [])
        .map(f => (f instanceof Date ? f : new Date(f)))
        .filter(d => !Number.isNaN(d.getTime()))
        .sort((a, b) => a - b);
    if (!t.length) return { from: null, to: null, single: true };
    const from = t[0];
    const to = t[t.length - 1];
    return { from, to, single: from.toISOString().slice(0, 10) === to.toISOString().slice(0, 10) };
};

/* ─── LA VALIDACIÓN DEL REENVÍO ──────────────────────────────────────
 *
 * El modelo escribe y el CÓDIGO decide, como en el resto del sitio: lo que
 * llega del navegador se comprueba acá y lo que no cumple se dice con su
 * motivo. Los avisos NO bloquean — tratarlos igual convierte cualquier
 * observación en un bloqueo y se dejan de leer (v4.854).
 */
export const validateResend = ({ batch = null, items = [], recipients = null, scope = null, plan = null } = {}) => {
    const errores = [];
    const avisos = [];
    // El ámbito se DEDUCE del lote cuando no se declara, así que quien
    // llamaba en v4.1014 —con `batch` y sin `scope`— sigue obteniendo el
    // mismo veredicto. Regla aditiva.
    const ambito = scope || plan?.scope || (batch?.id ? 'traslado' : 'seleccion');

    // ⚠️ EL LOTE SÓLO SE EXIGE EN SU PROPIO ÁMBITO. Exigirlo siempre era el
    // bloqueo de v4.1014: un aporte girado suelto no tiene lote y NO por eso
    // deja de tener conciliación.
    if (ambito === 'traslado') {
        if (!batch?.id) errores.push('No se encontró el traslado que se quiere conciliar.');
        if (batch && batch.status === 'reversado') {
            errores.push('Este traslado está reversado: no hay una conciliación que reenviar.');
        }
    }

    const vivos = (Array.isArray(items) ? items : []).filter(i => i?.status !== 'reversado');
    if (!vivos.length) {
        errores.push(ambito === 'traslado'
            ? 'Todos los aportes de este traslado están reversados: la conciliación quedaría vacía.'
            : 'Ninguno de los aportes elegidos tiene un traslado vigente que conciliar.');
    }
    const reversados = (Array.isArray(items) ? items : []).length - vivos.length;
    if (reversados > 0) {
        avisos.push(`${reversados} aporte${reversados === 1 ? '' : 's'} está reversado y no entra en la conciliación.`);
    }

    // ⚠️ UNA CONCILIACIÓN ES DE UNA SOLA MONEDA. Sumar pesos con dólares es el
    // defecto que abrió el rediseño financiero (v4.841) y acá terminaría
    // impreso en un documento que alguien archiva. Se rechaza con su salida.
    const monedas = [...new Set(vivos.map(i => String(i.currency || '').toUpperCase()).filter(Boolean))];
    if (monedas.length > 1) {
        errores.push(`La selección mezcla ${monedas.join(' y ')}: una conciliación es de UNA moneda. Filtrá por moneda y mandá una por cada una.`);
    }

    const correos = recipients?.email?.length || 0;
    const telefonos = recipients?.whatsapp?.length || 0;
    if (!correos && !telefonos) {
        errores.push('Escribí al menos un destinatario. La conciliación se manda a alguien, y ese alguien no se deduce.');
    }
    if (correos > MAX_POR_CANAL) {
        errores.push(`Son ${correos} correos y el máximo por envío es ${MAX_POR_CANAL}.`);
    }
    for (const d of recipients?.descartados || []) {
        avisos.push(`«${d.valor}» no se pudo usar: ${d.motivo}`);
    }

    return { ok: !errores.length, errores, avisos };
};

/* ─── EL DOCUMENTO CONSOLIDADO ───────────────────────────────────────
 *
 * Las mismas cifras que el correo, en una tabla que se puede archivar. Las
 * columnas están DECLARADAS acá y las consumen el PDF, el CSV y el Excel: con
 * tres listas, los tres documentos del mismo traslado se separarían en
 * silencio.
 */
export const RECONCILIATION_COLUMNS = [
    { key: 'donante', label: 'Aportante' },
    { key: 'fecha', label: 'Fecha del aporte' },
    { key: 'referencia', label: 'Referencia' },
    { key: 'bruto', label: 'Bruto' },
    { key: 'comision', label: 'Comisión' },
    { key: 'retencion', label: 'Retención' },
    { key: 'neto', label: 'Neto trasladado' },
    { key: 'estado', label: 'Estado' },
];

/**
 * La comisión del PROCESADOR se DERIVA, no se recibe.
 *
 * Es la misma resta que hace el libro mayor (`bruto − retención − neto`) y por
 * el mismo motivo: aceptarla de fuera permitiría un desglose que cuadra porque
 * alguien mandó el número que hacía falta.
 */
/**
 * Las columnas de una conciliación CONSOLIDADA.
 *
 * ⚠️ LLEVA UNA MÁS: EL MOVIMIENTO DE ORIGEN. Es la exigencia del pedido —«el
 * documento debe conservar la referencia de cada movimiento»— y es lo único
 * que hace auditable un documento que abarca varios traslados: sin ella, ocho
 * filas de tres transferencias distintas no se pueden cruzar contra ningún
 * extracto.
 *
 * Se DERIVA de las de siempre en vez de escribirse aparte: con dos listas, una
 * columna corregida en la conciliación de un lote no llegaría a la
 * consolidada.
 */
export const CONSOLIDATED_COLUMNS = [
    ...RECONCILIATION_COLUMNS.slice(0, 3),
    { key: 'traslado', label: 'Traslado de origen' },
    ...RECONCILIATION_COLUMNS.slice(3),
];

/** Qué columnas van, según el ámbito. Un solo punto de decisión: el PDF y el
 *  CSV leen de acá y no pueden discrepar. */
export const columnsForScope = (scope) =>
    (scope === 'seleccion' ? CONSOLIDATED_COLUMNS : RECONCILIATION_COLUMNS);

export const processorFeeOf = ({ gross = 0, netContribution = 0, platformFee = 0 } = {}) =>
    Math.max(0, (Number(gross) || 0) - (Number(netContribution) || 0) - (Number(platformFee) || 0));

/**
 * Los totales del documento. Se suman las MISMAS columnas que se listan: un
 * total que no sea la suma de lo que está arriba no se puede auditar.
 */
export const reconciliationTotals = (items = []) => {
    const vivos = (Array.isArray(items) ? items : []).filter(i => i?.status !== 'reversado');
    const t = { count: vivos.length, bruto: 0, comision: 0, retencion: 0, neto: 0 };
    for (const it of vivos) {
        t.bruto += Number(it.gross) || 0;
        t.comision += processorFeeOf(it);
        t.retencion += Number(it.platformFee) || 0;
        t.neto += Number(it.amount) || 0;
    }
    // El redondeo se hace UNA vez al final y no por fila: acumular redondeos
    // corre el total en los céntimos (regla del módulo financiero).
    for (const k of ['bruto', 'comision', 'retencion', 'neto']) t[k] = Math.round(t[k] * 100) / 100;
    return t;
};

/* ─── SANEADO PARA EL PDF ────────────────────────────────────────────
 *
 * ⚠️ LAS FUENTES BASE-14 DE UN PDF SON WinAnsi Y NO LLEVAN GUION LARGO.
 * Medido: `jsPDF` con Helvetica escribe «Ñandú áéíóú» perfecto y **descarta en
 * silencio** el «—», las comillas tipográficas y los puntos suspensivos. En un
 * documento financiero un carácter que desaparece sin avisar es exactamente lo
 * que no se puede tener, así que se sustituyen ANTES de escribir en vez de
 * confiar en que nadie los use.
 *
 * No se resuelve incrustando una fuente: eso son cientos de kB en una función
 * que ya empaqueta FFmpeg dentro del tope de 250 MB, y las base-14 cubren el
 * español entero.
 */
const REEMPLAZOS = [
    [/[—–]/g, '-'],       // — –
    [/[‘’‛]/g, "'"], // ' '
    [/[“”]/g, '"'],       // " "
    [/…/g, '...'],             // …
    [/ /g, ' '],               // espacio duro
    [/[•·]/g, '-'],       // • ·
    [/₱|₦|€/g, (m) => m], // las monedas de WinAnsi se conservan
];

export const toWinAnsi = (texto) => {
    let s = String(texto ?? '');
    for (const [re, rep] of REEMPLAZOS) s = s.replace(re, rep);
    // Lo que quede fuera de Latin-1 se marca en vez de desaparecer: un nombre
    // con un carácter que el PDF no puede escribir tiene que verse raro, no
    // verse incompleto.
    return s.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
};

/* ─── EL CORREO DE CONCILIACIÓN ──────────────────────────────────────
 *
 * ⚠️ NO ES UN AVISO DE TRASLADO Y NO PUEDE PARECERLO. Quien lo recibe ya tuvo
 * —o no— el aviso original; si este correo dijera lo mismo, el club creería que
 * le giraron dos veces. La frase que lo distingue es la parte que no se
 * negocia, y por eso es una constante y no algo que se redacte cada vez.
 */
export const RECONCILIATION_NOTE =
    'Este mensaje corresponde únicamente a una notificación y conciliación del '
    + 'movimiento previamente efectuado. No representa un nuevo traslado.';

export const buildReconciliationSubject = ({ campaignName = '', beneficiary = '', batchRef = '' } = {}) => {
    const quien = String(campaignName || beneficiary || '').trim();
    return `Conciliación de aportes trasladados${quien ? ` – ${quien}` : ''}`
        + (batchRef ? ` · ${batchRef}` : '');
};

/* ─── EL HISTORIAL ───────────────────────────────────────────────────
 *
 * ⚠️ SE COMPONE; NO SE MIGRA NI UNA FILA.
 *
 * El aviso ORIGINAL de un traslado vive en las columnas del propio lote
 * (`notifyEmails`, `notifyAt`, `notifyResults`) desde v4.996, y los reenvíos
 * en `DisbursementNotice`. Copiar el original a la tabla nueva en el
 * despliegue está prohibido —un despliegue no escribe en la base, regla
 * durable desde el 2026-07-13— y además daría dos verdades sobre el mismo
 * envío. Se DERIVA al leer, que es gratis y se autorrepara.
 *
 * Así se contesta lo que se pidió: «enviado originalmente a X el 28 de agosto;
 * reenviado a Y el 8 de septiembre por Daniel Yazo».
 */
export const noticeHistory = ({ batch = null, notices = [] } = {}) => {
    const historial = [];

    if (batch?.notifyState || (batch?.notifyEmails?.length || batch?.notifyPhones?.length)) {
        historial.push({
            id: `original:${batch.id}`,
            kind: 'original',
            kindLabel: 'Notificación del traslado',
            emails: Array.isArray(batch.notifyEmails) ? batch.notifyEmails : [],
            phones: Array.isArray(batch.notifyPhones) ? batch.notifyPhones : [],
            results: Array.isArray(batch.notifyResults) ? batch.notifyResults : [],
            state: batch.notifyState || null,
            error: batch.notifyError || null,
            at: batch.notifyAt || batch.createdAt || null,
            byName: batch.createdByName || null,
            note: null,
            documentName: null,
            // El original no es una fila: es la lectura de las columnas del
            // lote. Se marca para que la pantalla no ofrezca acciones que no
            // existen sobre él.
            derived: true,
        });
    }

    for (const n of Array.isArray(notices) ? notices : []) {
        historial.push({
            id: n.id,
            kind: 'reenvio',
            kindLabel: 'Reenvío de conciliación',
            emails: Array.isArray(n.emails) ? n.emails : [],
            phones: Array.isArray(n.phones) ? n.phones : [],
            results: Array.isArray(n.results) ? n.results : [],
            state: n.state || null,
            error: n.error || null,
            at: n.sentAt || n.createdAt || null,
            byName: n.sentByName || null,
            note: n.note || null,
            documentName: n.documentName || null,
            derived: false,
        });
    }

    // Lo más reciente primero: es el orden en que se lee un historial.
    // El desempate por id lo hace ESTABLE — si dependiera del orden en que la
    // base devolvió las filas, dos cargas de la misma ficha podrían mostrar
    // dos órdenes (la lección de `pickDistrictSite`).
    return historial.sort((a, b) => {
        const ta = a.at ? new Date(a.at).getTime() : 0;
        const tb = b.at ? new Date(b.at).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
    });
};

/** A quién ya se le avisó, en cualquier envío. Es lo que la pantalla necesita
 *  para decir «esta persona ya lo recibió» antes de volver a mandarlo. */
export const alreadyNotified = (historial = []) => {
    const vistos = new Map();
    for (const h of Array.isArray(historial) ? historial : []) {
        for (const r of h.results || []) {
            if (r?.state !== 'enviado' || !r?.target) continue;
            const clave = String(r.target).toLowerCase();
            if (!vistos.has(clave)) vistos.set(clave, { target: r.target, channel: r.channel || 'email', at: r.at || h.at });
        }
        // Un envío anterior al registro por destinatario (v4.888) no tiene
        // `results`: sus direcciones son lo único que se sabe.
        if (!h.results?.length) {
            for (const e of h.emails || []) {
                const clave = String(e).toLowerCase();
                if (!vistos.has(clave)) vistos.set(clave, { target: e, channel: 'email', at: h.at });
            }
        }
    }
    return [...vistos.values()];
};

export default {
    DISBURSED_BUCKETS, isDisbursedBucket, selectionClassOf, classifySelection,
    groupByTransfer, describeTransferScope,
    RECONCILIATION_SCOPES, reconciliationRef, planReconciliation,
    describeReconciliationPlan, dateRangeOf,
    validateResend,
    RECONCILIATION_COLUMNS, CONSOLIDATED_COLUMNS, columnsForScope, processorFeeOf, reconciliationTotals, toWinAnsi,
    RECONCILIATION_NOTE, buildReconciliationSubject,
    noticeHistory, alreadyNotified,
};
