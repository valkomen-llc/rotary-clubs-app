// ════════════════════════════════════════════════════════════════════
// Acciones en bloque sobre las postulaciones — el CRITERIO
// v4.1024.0
//
// PURO: sin base, sin red, sin DOM. Por eso se puede probar entero
// (`npm run test:fair:bulk`) y por eso vive aparte de la orquestación, igual
// que `seoRules.js` frente a `seoAudit.js`.
//
// ⚠️ LA REGLA DE LA QUE CUELGA TODO: UNA POSTULACIÓN QUE TOCÓ DINERO NO SE
// BORRA, SE ARCHIVA. Archivar la saca del listado —que es lo que se pidió— y
// no pierde nada: la cuenta con la que ese club entra a `/mi-proyecto`, su
// Formulación, su solicitud del FDD, sus adjuntos y la traza del cobro siguen
// donde estaban, y restaurar la devuelve. Eliminar, en cambio, es definitivo:
// se lleva todo eso y no hay respaldo. Es el criterio de las campañas de
// contribución (v4.807) — «una campaña que estuvo al aire no se borra: se
// archiva; sólo se elimina un borrador que nunca se publicó»— aplicado al
// dinero, donde el precio de equivocarse es perder el rastro de un cobro real.
//
// ⚠️ Y QUIEN DECIDE ES EL SERVIDOR, SIEMPRE. El espejo del navegador
// (`src/lib/projectFairBulk.ts`) existe para PINTAR la previsión de lo que va
// a pasar antes de confirmar, sin pagar un viaje de red por cada casilla que
// se marca; el veredicto que vale se recalcula acá sobre la fila FRESCA de la
// base. La prueba compara las SALIDAS de los dos módulos: con dos criterios,
// la pantalla prometería eliminar algo que el servidor archiva —o al revés—, y
// lo que se separaría en silencio es si un registro financiero sobrevive.
// ════════════════════════════════════════════════════════════════════

/** Tope defensivo por petición. Más que esto exige una cola, y decirlo es
 *  mejor que colgar la función. */
export const BULK_MAX = 300;

/** Catálogo CERRADO. Una acción que no esté aquí no se puede pedir. */
export const BULK_ACTIONS = ['archive', 'restore', 'delete', 'status', 'tag'];

/** Qué permiso del módulo exige cada acción. Archivar y eliminar son
 *  destructivas: piden el permiso propio, no el de editar datos. */
export const BULK_CAPABILITY = {
    archive: 'remove',
    restore: 'remove',
    delete: 'remove',
    status: 'changeStatus',
    tag: 'manageTags',
};

/** Los desenlaces posibles de una fila. También es un catálogo cerrado: uno
 *  inventado no se podría rotular ni contar. */
export const OUTCOMES = ['eliminada', 'archivada', 'restaurada', 'actualizada', 'sin_cambio', 'no_existe', 'error'];

export const OUTCOME_LABELS = {
    eliminada: 'Eliminada definitivamente',
    archivada: 'Archivada',
    restaurada: 'Restaurada',
    actualizada: 'Actualizada',
    sin_cambio: 'Sin cambios',
    no_existe: 'No encontrada',
    error: 'Error',
};

/** Por qué una fila no terminó como se pidió. Es lo que se le enseña a quien
 *  seleccionó: un descarte silencioso deja adivinando cuál y por qué. */
export const REASON_LABELS = {
    tiene_cobro: 'registró un cobro — se archiva en vez de eliminarse',
    ya_archivada: 'ya estaba archivada',
    no_archivada: 'no estaba archivada',
    otra_edicion: 'pertenece a otra edición',
    mismo_estado: 'ya estaba en ese estado',
    ya_tenia_etiqueta: 'ya tenía esa etiqueta',
    no_tenia_etiqueta: 'no tenía esa etiqueta',
};

const numeric = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * El estado del PAGO de una fila.
 *
 * Acepta las dos formas en que llega la misma postulación: la cruda de la base
 * (`status`) y la que `mapRow` entrega al navegador (`paymentStatus`). Con un
 * solo nombre, el espejo leería `undefined` y daría por no cobrada toda fila
 * —la trampa del SELECT corto de v4.886, por la puerta del renombrado—.
 */
export const paymentStatusOf = (row) => String(row?.status ?? row?.paymentStatus ?? '').trim();

/**
 * ¿Esta postulación tocó dinero alguna vez?
 *
 * No alcanza con `status === 'paid'` —eso es `hasConfirmedPayment`, que
 * contesta otra pregunta: si HOY está pagada—. Una REEMBOLSADA cobró y se
 * devolvió, así que tiene rastro financiero y contable igual; y una fila cuyo
 * `status` se quedó atrás por un webhook perdido puede tener el cargo, el
 * importe recibido o la fecha de pago escritos. Se mira todo, y basta una
 * señal: equivocarse hacia «no cobró» borra un registro financiero, y
 * equivocarse hacia «cobró» sólo archiva de más, que es reversible.
 *
 * Los identificadores de Stripe sólo viajan al navegador con permiso
 * financiero (`mapRow`), así que en la previsión pueden faltar. No importa:
 * `status`, `paidAt`, `amountReceived` y `refundedAmount` viajan siempre, y
 * quien DECIDE es el servidor, que lee la fila entera.
 */
export const hasFinancialTrace = (row) => {
    if (!row) return false;
    const status = paymentStatusOf(row);
    if (status === 'paid' || status === 'refunded') return true;
    if (row.paidAt || row.refundedAt) return true;
    if (numeric(row.amountReceived) > 0 || numeric(row.refundedAmount) > 0) return true;
    return !!(row.stripeChargeId || row.stripePaymentIntentId);
};

export const isArchived = (row) => !!row?.archivedAt;

/**
 * Qué le pasa a UNA fila con la acción pedida.
 *
 * Devuelve `{ outcome, reason }`. Es la única función que decide, y la
 * comparten la previsión del navegador, la confirmación y la ejecución: con
 * tres criterios, la pantalla diría una cosa, la confirmación otra y la base
 * una tercera.
 */
export const dispositionFor = (row, action) => {
    if (!row) return { outcome: 'no_existe', reason: null };

    if (action === 'delete') {
        // La regla del módulo: lo que cobró se archiva, no se borra.
        if (hasFinancialTrace(row)) {
            return isArchived(row)
                ? { outcome: 'sin_cambio', reason: 'ya_archivada' }
                : { outcome: 'archivada', reason: 'tiene_cobro' };
        }
        return { outcome: 'eliminada', reason: null };
    }

    if (action === 'archive') {
        return isArchived(row)
            ? { outcome: 'sin_cambio', reason: 'ya_archivada' }
            : { outcome: 'archivada', reason: null };
    }

    if (action === 'restore') {
        return isArchived(row)
            ? { outcome: 'restaurada', reason: null }
            : { outcome: 'sin_cambio', reason: 'no_archivada' };
    }

    return { outcome: 'actualizada', reason: null };
};

/** Identidad legible de una fila, para nombrarla en la confirmación y en el
 *  desglose. Nunca un id crudo: quien revisa reconoce el proyecto, no el UUID. */
export const labelOf = (row) => {
    const ref = String(row?.publicRef || '').trim();
    const name = String(row?.projectName || '').trim();
    const club = String(row?.clubName || '').trim();
    return [ref, name || club || null].filter(Boolean).join(' · ') || String(row?.id || '');
};

/**
 * El PLAN de una acción en bloque: qué le pasa a cada fila, y los totales.
 *
 * Se calcula ANTES de tocar nada. Es lo que hace posible que la confirmación
 * DIGA lo que va a ocurrir —cuántas se eliminan, cuántas se archivan y por
 * qué— en vez de preguntar «¿estás seguro?»: lo que hay que poder revisar es
 * el hecho (criterio de los desembolsos, v4.885).
 */
export const planBulk = (rows, action) => {
    const items = (rows || []).map((row) => {
        const { outcome, reason } = dispositionFor(row, action);
        return { id: row?.id || null, label: labelOf(row), outcome, reason };
    });
    const totals = OUTCOMES.reduce((acc, k) => ({ ...acc, [k]: 0 }), {});
    for (const it of items) totals[it.outcome] = (totals[it.outcome] || 0) + 1;
    return { action, items, totals, count: items.length };
};

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * La frase de la confirmación. Dice el HECHO, no una advertencia genérica.
 *
 * Se arma acá —y no en la pantalla— porque la lee quien está a punto de
 * borrar registros de clubes reales, y tiene que decir exactamente lo mismo
 * que el servidor va a hacer.
 */
export const describeBulkPlan = (plan) => {
    const t = plan?.totals || {};
    const partes = [];
    if (t.eliminada) partes.push(`se ${plan.action === 'delete' && t.eliminada === 1 ? 'eliminará' : 'eliminarán'} ${plural(t.eliminada, 'postulación', 'postulaciones')} definitivamente`);
    if (t.archivada) partes.push(`se ${t.archivada === 1 ? 'archivará' : 'archivarán'} ${plural(t.archivada, 'postulación', 'postulaciones')}`);
    if (t.restaurada) partes.push(`se ${t.restaurada === 1 ? 'restaurará' : 'restaurarán'} ${plural(t.restaurada, 'postulación', 'postulaciones')}`);
    if (t.actualizada) partes.push(`se ${t.actualizada === 1 ? 'actualizará' : 'actualizarán'} ${plural(t.actualizada, 'postulación', 'postulaciones')}`);
    if (t.sin_cambio) partes.push(`${plural(t.sin_cambio, 'queda', 'quedan')} sin cambios`);
    if (!partes.length) return 'No hay nada que hacer con la selección.';
    return `${partes.join(' y ')}.`;
};

/**
 * El aviso que acompaña a la frase, cuando lo hay.
 *
 * Es lo que convierte una eliminación en una decisión informada: qué se lleva
 * por delante y qué NO se puede deshacer. Sin esto, «eliminar» se lee como
 * quitar una fila de una tabla.
 */
export const bulkWarnings = (plan) => {
    const t = plan?.totals || {};
    const avisos = [];
    if (t.eliminada) {
        avisos.push('Lo eliminado NO se puede recuperar: se va con la postulación la cuenta con la que ese club entra a su panel, su Formulación, su solicitud del FDD y sus adjuntos.');
    }
    if (plan?.action === 'delete' && t.archivada) {
        avisos.push('Las que registraron un cobro no se eliminan: se archivan, salen del listado y se pueden restaurar.');
    }
    if (t.archivada && plan?.action === 'archive') {
        avisos.push('Archivar sale del listado y no borra nada: el club conserva su acceso y sus formularios.');
    }
    return avisos;
};

/**
 * ¿Se puede ejecutar el plan?
 *
 * Un plan que no cambia nada se rechaza con su motivo en vez de gastar la
 * petición y volver con una lista de «sin cambios» que no explica nada.
 */
export const validateBulkPlan = (plan) => {
    if (!plan || !plan.count) return { ok: false, error: 'No hay postulaciones seleccionadas.' };
    if (plan.count > BULK_MAX) return { ok: false, error: `Máximo ${BULK_MAX} postulaciones por acción en bloque.` };
    const cambia = (plan.totals?.eliminada || 0) + (plan.totals?.archivada || 0)
        + (plan.totals?.restaurada || 0) + (plan.totals?.actualizada || 0);
    if (!cambia) return { ok: false, error: 'La selección no cambia nada.' };
    return { ok: true, error: null };
};

/**
 * Los tres modos de ver lo archivado. Catálogo CERRADO: un valor que el
 * servidor no reconozca cae en `activas`, que es el comportamiento de siempre
 * — un filtro que no se aplica ENSANCHA lo que se ve, y acá lo caro es lo
 * contrario: enseñar como vivo lo que alguien archivó.
 */
export const ARCHIVE_VIEWS = ['activas', 'archivadas', 'todas'];
export const ARCHIVE_VIEW_LABELS = {
    activas: 'Sin archivar',
    archivadas: 'Sólo archivadas',
    todas: 'Todas',
};
export const normalizeArchiveView = (value) => {
    const v = String(value ?? '').trim().toLowerCase();
    return ARCHIVE_VIEWS.includes(v) ? v : 'activas';
};
