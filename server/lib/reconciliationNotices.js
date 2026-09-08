// ════════════════════════════════════════════════════════════════════
// EL REENVÍO DE LA CONCILIACIÓN DE UN TRASLADO — v4.1014
//
// La I/O. El criterio vive en `reconciliationSpec.js` y el documento en
// `reconciliationPdf.js`; acá se habla con la base, con S3 y con el correo.
//
// ⚠️ ESTO NO ES UN SEGUNDO MOTOR DE NOTIFICACIONES, y de eso cuelga todo lo
// demás. El correo lo compone `buildBatchEmail` —el MISMO de v4.996, con su
// modo de conciliación—, lo reclama `claimDelivery` —el MISMO registro por
// destinatario de v4.855, con su id del proveedor y su estado de entrega— y lo
// manda `sendPlatformEmail` —el MISMO servicio de siempre, que NO LANZA y
// contesta `{ success }`—. Lo que este archivo agrega es la OPERACIÓN: quién
// la pidió, a quién se la mandó, con qué documento y cuándo.
//
// ⚠️ Y NO MUEVE DINERO. Ni un `INSERT INTO "Disbursement"`, ni un `UPDATE` de
// `status`, `amount`, `disbursedAt` o `netAmount`, ni una llamada a la
// pasarela. Lo comprueba una prueba que lee este archivo: la regla escrita en
// prosa no protege nada (la lección de `check:routes`, v4.859).
// ════════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import db from './db.js';
import EmailService from '../services/EmailService.js';
import { ensureDisbursementSchema } from './ensureDisbursementSchema.js';
import { claimDelivery, markSent, markFailed } from './notificationLog.js';
// ⚠️ Los tres viven en módulos DISTINTOS y es fácil confundirlos: el plan de
// notificación en `notificationSender.js`, el plan de REMITENTE en
// `notificationSpec.js` y los dominios verificados en `senderDomains.js`. Se
// copian de `disbursements.js`, que es quien ya los usa bien.
import { resolveNotificationPlan } from './notificationSender.js';
import { resolveSenderPlan } from './notificationSpec.js';
import { verifiedDomains } from './senderDomains.js';
import { recordFact } from './paymentLifecycle.js';
import {
    batchRow, batchItems, batchPublico, receiptAttachments, uploadPrivateDocument,
    signedReceiptUrl, itemsForPayments,
} from './disbursements.js';
import { batchRef, buildBatchEmail } from './disbursementBatch.js';
import { noticeResult, summarizeResults, resolveRecipients } from './disbursementNotice.js';
import {
    groupByTransfer, validateResend, noticeHistory, alreadyNotified,
    reconciliationTotals, planReconciliation, describeReconciliationPlan,
    reconciliationRef, dateRangeOf,
} from './reconciliationSpec.js';
import { buildReconciliationPdf, buildReconciliationCsv } from './reconciliationPdf.js';

const nuevoId = () => crypto.randomUUID();
const listo = async () => !!(await ensureDisbursementSchema())?.ok;

/** El evento con el que se reclama cada correo. Es DISTINTO de `disbursed`
 *  a propósito: si compartiera evento con el aviso original, la llave única
 *  `(contribución, evento, destinatario)` daría por duplicado el reenvío a
 *  alguien que ya recibió el aviso del giro — que es justamente lo que se
 *  quiere poder hacer. */
export const RESEND_EVENT = 'disbursement_reconciliation';

/** La contribución con la que se reclama: LA OPERACIÓN, no el lote.
 *
 *  ⚠️ Es lo que hace posible mandarle la conciliación DOS VECES a la misma
 *  persona en dos momentos distintos —el presidente la pide hoy y el revisor
 *  fiscal en noviembre— sin perder la protección contra el doble clic DENTRO
 *  de una operación. Con el lote como contribución, el segundo reenvío a la
 *  misma dirección se marcaría «duplicado» y no saldría nunca. */
const deliveryIdOf = (noticeId) => `resend:${String(noticeId || '').trim()}`;

/** Una columna JSONB llega como array desde pg; si llegara como texto se lee
 *  igual en vez de partirla por comas. */
const jsonArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim().startsWith('[')) {
        try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
};

/** La forma de un reenvío hacia la pantalla. La CLAVE de S3 no viaja: el
 *  documento se pide por su endpoint, que firma un enlace que caduca. */
export const noticePublico = (r) => ({
    id: r.id,
    batchId: r.batchId || null,
    // v4.1015 — El ÁMBITO y el alcance real del documento. `traslado` por
    // omisión: una fila escrita en v4.1014 no lleva la columna y era eso.
    scope: r.scope || 'traslado',
    paymentIds: jsonArray(r.paymentIds),
    disbursementIds: jsonArray(r.disbursementIds),
    batchIds: jsonArray(r.batchIds),
    clubId: r.clubId,
    campaignId: r.campaignId || null,
    beneficiary: r.beneficiary || null,
    currency: r.currency || null,
    count: Number(r.count) || 0,
    netAmount: Number(r.netAmount) || 0,
    emails: jsonArray(r.emails),
    phones: jsonArray(r.phones),
    results: jsonArray(r.results),
    state: r.state || null,
    error: r.error || null,
    note: r.note || null,
    hasDocument: !!r.documentKey,
    documentName: r.documentName || null,
    documentBytes: Number(r.documentBytes) || 0,
    documentError: r.documentError || null,
    sentBy: r.sentBy || null,
    sentByName: r.sentByName || null,
    sentAt: r.sentAt,
    createdAt: r.createdAt,
});

/* ─── LECTURA ────────────────────────────────────────────────────────*/

/** Los reenvíos de un traslado, el más reciente primero. Degrada a vacío. */
export const listNotices = async (batchId, clubId) => {
    try {
        if (!batchId || !clubId || !(await listo())) return [];
        const { rows } = await db.query(
            `SELECT * FROM "DisbursementNotice"
              WHERE "batchId" = $1 AND "clubId" = $2
              ORDER BY "sentAt" DESC`,
            [batchId, clubId]
        );
        return rows.map(noticePublico);
    } catch (e) {
        console.warn('[CONCILIACIÓN] listNotices falló:', e?.message);
        return [];
    }
};

/** La fila de un reenvío, acotada por club EN LA CONSULTA. */
export const noticeRow = async (id, clubId) => {
    try {
        if (!id || !clubId || !(await listo())) return null;
        const { rows } = await db.query(
            `SELECT * FROM "DisbursementNotice" WHERE id = $1 AND "clubId" = $2 LIMIT 1`,
            [id, clubId]
        );
        return rows[0] || null;
    } catch (e) {
        console.warn('[CONCILIACIÓN] noticeRow falló:', e?.message);
        return null;
    }
};

/** El HISTORIAL COMPLETO de un traslado: el aviso original —derivado de las
 *  columnas del lote— y todos los reenvíos. Ver `noticeHistory`. */
export const historyFor = async (batchId, clubId) => {
    const fila = await batchRow(batchId, clubId);
    if (!fila) return null;
    const lote = batchPublico(fila);
    const reenvios = await listNotices(batchId, clubId);
    const historial = noticeHistory({ batch: lote, notices: reenvios });
    return { batch: lote, historial, yaAvisados: alreadyNotified(historial) };
};

/**
 * De los APORTES elegidos a los TRASLADOS que los cubren.
 *
 * Es lo que hace que la barra de acciones pueda decir «los 3 aportes elegidos
 * pertenecen al traslado LOTE-XXXX, que cubre 8» antes de mandar nada. Y
 * resuelve de paso el «ver todos los aportes de este traslado»: es la misma
 * pregunta desde el otro lado.
 *
 * ⚠️ El aislamiento va en el WHERE. Un aporte de otro sitio no aparece — no se
 * lee y se comprueba después.
 */
export const transfersForPayments = async ({ clubId, paymentIds = [] }) => {
    const vacio = { batches: [], sueltos: [], porLote: {} };
    try {
        const ids = [...new Set((paymentIds || []).map(String).filter(Boolean))];
        if (!clubId || !ids.length || !(await listo())) return vacio;

        const { rows } = await db.query(
            `SELECT "paymentId", "batchId", status
               FROM "Disbursement"
              WHERE "clubId" = $1 AND "paymentId" = ANY($2::text[])`,
            [clubId, ids]
        );
        const grupos = groupByTransfer(rows);
        if (!grupos.batchIds.length) return { ...vacio, sueltos: grupos.sueltos };

        const { rows: lotes } = await db.query(
            `SELECT * FROM "DisbursementBatch"
              WHERE "clubId" = $1 AND id = ANY($2::text[])
              ORDER BY "disbursedAt" DESC`,
            [clubId, grupos.batchIds]
        );
        return {
            batches: lotes.map(batchPublico),
            sueltos: grupos.sueltos,
            porLote: grupos.porLote,
        };
    } catch (e) {
        console.warn('[CONCILIACIÓN] transfersForPayments falló:', e?.message);
        return vacio;
    }
};

/* ─── EL ÁMBITO DE LA CONCILIACIÓN (v4.1015) ─────────────────────────
 *
 * El punto ÚNICO por el que pasan la vista previa, la descarga y el envío.
 * Con tres resoluciones, la pantalla podría prometer un documento y el correo
 * llevar otro.
 */

/** La referencia de una conciliación consolidada, DETERMINISTA sobre la
 *  selección: descargar el borrador y recibir el correo dan el MISMO `CONC-`.
 *  Derivarla del id del envío daría dos referencias para el mismo contenido. */
const refDeSeleccion = (paymentIds = []) => {
    const semilla = [...paymentIds].map(String).sort().join('|');
    return reconciliationRef(crypto.createHash('sha1').update(semilla).digest('hex'));
};

/** El beneficiario, comparable, para saber si los movimientos coinciden. */
const claveBenef = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * LA CABECERA DE UNA CONCILIACIÓN CONSOLIDADA.
 *
 * Tiene la FORMA de un lote a propósito: así el PDF, el CSV y el correo la
 * consumen sin un segundo camino de composición. Lo que NO tiene es la
 * identidad de un lote — su `ref` es `CONC-…`, su `scope` es `seleccion` y
 * lleva la lista de movimientos de origen. Nada de esto se escribe en
 * `DisbursementBatch`: es un objeto en memoria.
 */
const consolidatedHeader = ({ items = [], batches = [], plan = {} } = {}) => {
    const vivos = items.filter(i => i.status !== 'reversado');
    const t = reconciliationTotals(vivos);
    const rango = dateRangeOf(vivos.map(i => i.disbursedAt).filter(Boolean));

    const benefs = [...new Set(vivos.map(i => claveBenef(i.beneficiary)).filter(Boolean))];
    const beneficiario = benefs.length === 1
        ? (vivos.find(i => claveBenef(i.beneficiary) === benefs[0])?.beneficiary || '')
        : (benefs.length ? 'Varios beneficiarios' : '');

    const campanas = [...new Set(batches.map(b => b.campaignName).filter(Boolean))];
    const porLote = new Map(batches.map(b => [b.id, b]));

    // ⚠️ CADA MOVIMIENTO DE ORIGEN, CON SU REFERENCIA. Es lo que hace auditable
    // un documento que abarca varios traslados: sin esta lista, ocho filas de
    // tres transferencias no se pueden cruzar contra ningún extracto.
    const sources = [];
    for (const id of plan.batchIds || []) {
        const b = porLote.get(id);
        sources.push({
            kind: 'lote',
            id,
            ref: batchRef(id),
            date: b?.disbursedAt || null,
            method: b?.methodLabel || b?.method || '',
            bankRef: b?.reference || null,
            beneficiary: b?.beneficiary || '',
            count: (plan.porLote?.[id] || []).length,
            total: b?.count || 0,
        });
    }
    for (const pid of plan.sueltos || []) {
        const it = vivos.find(i => String(i.paymentId) === String(pid) && !i.batchId);
        if (!it) continue;
        sources.push({
            kind: 'suelto',
            id: it.disbursementId,
            ref: `MOV-${String(it.disbursementId || '').replace(/-/g, '').slice(-8).toUpperCase()}`,
            date: it.disbursedAt || null,
            method: it.method || '',
            bankRef: it.reference || null,
            beneficiary: it.beneficiary || '',
            count: 1,
            total: 1,
        });
    }

    return {
        id: null,                       // no es un lote: no tiene id de lote
        ref: refDeSeleccion(plan.paymentIds || vivos.map(i => i.paymentId)),
        scope: 'seleccion',
        clubId: null,
        campaignId: batches.find(b => b.campaignId)?.campaignId || null,
        campaignName: campanas.length === 1 ? campanas[0] : (campanas.length ? 'Varias campañas' : null),
        beneficiary: beneficiario,
        currency: vivos[0]?.currency || 'USD',
        count: t.count,
        grossAmount: t.bruto,
        fees: t.comision,
        platformRetention: t.retencion,
        netAmount: t.neto,
        method: '',
        methodLabel: sources.length === 1 ? (sources[0].method || '') : 'Varios movimientos',
        reference: sources.length === 1 ? sources[0].bankRef : null,
        notes: null,
        // El correo exige una fecha; una consolidación tiene un RANGO. Se
        // declara el rótulo y `disbursedAt` queda en la más reciente para lo
        // que ordene por fecha.
        disbursedAt: rango.to ? rango.to.toISOString() : null,
        dateFrom: rango.from ? rango.from.toISOString() : null,
        dateTo: rango.to ? rango.to.toISOString() : null,
        dateLabel: rango.from
            ? (rango.single ? shortLabel(rango.from) : `${shortLabel(rango.from)} a ${shortLabel(rango.to)}`)
            : '',
        sources,
        parciales: plan.parciales || [],
        status: 'confirmado',
        hasReceipt: false,
        receiptFiles: [],
        notifyEmails: [], notifyPhones: [], notifyResults: [], notifyState: null, notifyAt: null,
    };
};

const shortLabel = (d) => {
    try {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
        }).format(d);
    } catch { return d.toISOString().slice(0, 10); }
};

/**
 * RESUELVE QUÉ SE VA A CONCILIAR, desde un lote o desde unos aportes.
 *
 * Devuelve siempre la misma forma: `{ scope, header, items, plan, batches }`.
 * `header` tiene forma de lote en los dos ámbitos, así que lo que viene
 * después —documento, correo, fila— no necesita saber por dónde entró.
 */
export const resolveReconciliation = async ({ clubId, batchId = null, paymentIds = [] } = {}) => {
    if (!clubId) return { ok: false, status: 400, error: 'clubId requerido' };
    if (!(await listo())) {
        return { ok: false, status: 503, error: 'El registro de desembolsos todavía no está disponible en esta base.' };
    }

    // ── Camino del LOTE: el de siempre, intacto ──────────────────────
    if (batchId) {
        const fila = await batchRow(batchId, clubId);
        if (!fila) return { ok: false, status: 404, error: 'Este traslado no existe en este sitio.' };
        const lote = batchPublico(fila);
        const items = await batchItems(batchId, clubId);
        return {
            ok: true, scope: 'traslado', header: { ...lote, scope: 'traslado' },
            items, batches: [lote], batchId, row: fila,
            plan: {
                scope: 'traslado', batchId, batchIds: [batchId],
                paymentIds: items.map(i => i.paymentId), disbursementIds: items.map(i => i.disbursementId),
                sueltos: [], excluidos: [], parciales: [], cubiertos: lote.count,
            },
            avisos: [],
        };
    }

    // ── Camino de la SELECCIÓN ───────────────────────────────────────
    const ids = [...new Set((paymentIds || []).map(String).filter(Boolean))];
    if (!ids.length) return { ok: false, status: 422, error: 'No se recibió ningún aporte para conciliar.' };

    const todos = await itemsForPayments(ids, clubId);
    const plan = planReconciliation({
        paymentIds: ids,
        filas: todos.map(i => ({ id: i.disbursementId, paymentId: i.paymentId, batchId: i.batchId, status: i.status })),
        batchSizes: {},
    });

    // Los lotes involucrados, para poder nombrarlos y medir la cobertura.
    let batches = [];
    if (plan.batchIds.length) {
        const { rows } = await db.query(
            `SELECT * FROM "DisbursementBatch"
              WHERE "clubId" = $1 AND id = ANY($2::text[])
              ORDER BY "disbursedAt" DESC`,
            [clubId, plan.batchIds]
        );
        batches = rows.map(batchPublico);
    }
    // Con los tamaños reales ya se puede decir «3 de sus 8».
    const tamanos = Object.fromEntries(batches.map(b => [b.id, b.count]));
    const planFinal = planReconciliation({
        paymentIds: ids,
        filas: todos.map(i => ({ id: i.disbursementId, paymentId: i.paymentId, batchId: i.batchId, status: i.status })),
        batchSizes: tamanos,
    });

    // ⚠️ UN SOLO LOTE Y NINGÚN SUELTO ES EL CAMINO DEL LOTE. Se resuelve otra
    // vez por ahí para reutilizar su comprobante y su historial, que es lo que
    // el pedido pide expresamente cuando el traslado agrupado existe.
    if (planFinal.scope === 'traslado' && planFinal.batchId) {
        const r = await resolveReconciliation({ clubId, batchId: planFinal.batchId });
        if (r.ok) {
            r.plan = { ...planFinal, cubiertos: r.plan.cubiertos };
            r.avisos = describeReconciliationPlan(r.plan, { batchRefOf: batchRef });
        }
        return r;
    }

    const items = todos.filter(i => planFinal.paymentIds.includes(String(i.paymentId)) && i.status !== 'reversado');
    return {
        ok: true,
        scope: 'seleccion',
        header: consolidatedHeader({ items, batches, plan: planFinal }),
        items,
        batches,
        batchId: null,
        row: null,
        plan: planFinal,
        avisos: describeReconciliationPlan(planFinal, { batchRefOf: batchRef }),
    };
};

/**
 * El historial que le corresponde a una selección: el aviso original de CADA
 * lote involucrado y todo reenvío que haya cubierto alguno de estos aportes.
 *
 * ⚠️ NO SE MIGRA NI UNA FILA. El original sigue derivándose de las columnas del
 * lote y las consolidadas se cruzan por sus `paymentIds` guardados.
 */
export const historyForSelection = async ({ clubId, plan, batches = [] }) => {
    const entradas = [];
    const vistos = new Set();
    try {
        const { rows } = await db.query(
            `SELECT * FROM "DisbursementNotice"
              WHERE "clubId" = $1
              ORDER BY "sentAt" DESC LIMIT 200`,
            [clubId]
        );
        const elegidos = new Set((plan.paymentIds || []).map(String));
        for (const r of rows) {
            const n = noticePublico(r);
            const porLote = n.batchId && (plan.batchIds || []).includes(String(n.batchId));
            const porAporte = n.paymentIds.some(id => elegidos.has(String(id)));
            if (!porLote && !porAporte) continue;
            if (vistos.has(n.id)) continue;
            vistos.add(n.id);
            entradas.push(n);
        }
    } catch (e) {
        console.warn('[CONCILIACIÓN] historyForSelection falló:', e?.message);
    }

    // El aviso ORIGINAL de cada lote involucrado, derivado de sus columnas.
    let historial = [];
    for (const b of batches) {
        historial = historial.concat(noticeHistory({ batch: b, notices: [] }));
    }
    historial = historial.concat(noticeHistory({ batch: null, notices: entradas }));
    historial.sort((a, b) => {
        const ta = a.at ? new Date(a.at).getTime() : 0;
        const tb = b.at ? new Date(b.at).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
    });
    return { historial, yaAvisados: alreadyNotified(historial) };
};

/* ─── EL DOCUMENTO ───────────────────────────────────────────────────*/

/** La marca del sitio para el documento. Sale de la misma consulta que usa el
 *  correo del lote; no se escribe una segunda. */
const marcaDelSitio = async (clubId) => {
    try {
        const { rows } = await db.query(`SELECT name, domain FROM "Club" WHERE id = $1 LIMIT 1`, [clubId]);
        return { name: rows[0]?.name || '', domain: rows[0]?.domain || '' };
    } catch { return { name: '', domain: '' }; }
};

/**
 * El comprobante consolidado de un traslado, listo para descargar o adjuntar.
 * `formato` es `pdf` (por defecto) o `csv`.
 */
export const reconciliationDocument = async ({ batchId = null, paymentIds = [], clubId, formato = 'pdf' } = {}) => {
    const r = await resolveReconciliation({ clubId, batchId, paymentIds });
    if (!r.ok) return { ok: false, status: r.status || 500, error: r.error };

    const site = await marcaDelSitio(clubId);
    const campaign = r.header.campaignName ? { name: r.header.campaignName } : null;
    const nombre = String(r.header.ref || 'conciliacion').replace(/[^A-Za-z0-9._-]/g, '');

    if (String(formato).toLowerCase() === 'csv') {
        const csv = buildReconciliationCsv({ batch: r.header, items: r.items, campaign, scope: r.scope });
        return {
            ok: true,
            buffer: Buffer.from(csv, 'utf8'),
            filename: `conciliacion-${nombre}.csv`,
            mime: 'text/csv; charset=utf-8',
        };
    }

    const pdf = await buildReconciliationPdf({ batch: r.header, items: r.items, site, campaign, scope: r.scope });
    if (!pdf.ok) return { ok: false, status: 500, error: pdf.error };
    return { ok: true, buffer: pdf.buffer, filename: pdf.filename, mime: pdf.mime };
};

/* ─── EL REENVÍO ─────────────────────────────────────────────────────*/

/** Un correo de conciliación a un destinatario, con su reclamo y su traza.
 *  Copia el patrón de `enviarCorreoLote`: mismo reclamo, mismo servicio,
 *  mismo `noticeResult`. */
const enviarCorreo = async ({ noticeId, lote, destino, salida, remitente, profileId, attachments, attachmentInfo }) => {
    try {
        const traza = await claimDelivery({
            contributionId: deliveryIdOf(noticeId),
            event: RESEND_EVENT,
            recipient: destino,
            recipientKind: 'beneficiary',
            clubId: lote.clubId,
            campaignId: lote.campaignId || null,
            profileId,
            provider: 'resend',
            fromAddress: remitente.address,
            subject: salida.subject,
        }).catch(() => ({ ok: false, reason: 'sin bitácora' }));

        // Dentro de UNA operación, dos peticiones no le escriben dos veces a
        // nadie. Entre operaciones distintas no hay duplicado que evitar: el
        // reenvío se pide a propósito.
        if (traza.ok && !traza.claimed) {
            return noticeResult({ channel: 'email', target: destino, state: 'duplicado' });
        }

        const resultado = await EmailService.sendPlatformEmail({
            to: destino,
            subject: salida.subject,
            html: salida.html,
            text: salida.text,
            from: remitente.from,
            replyTo: remitente.replyTo || undefined,
            ...(attachments?.length ? { attachments } : {}),
        });

        // ⚠️ `sendPlatformEmail` NO LANZA: contesta `{ success }` (v4.901). Dar
        // por enviado lo que el proveedor rechazó es el defecto que v4.945
        // corrigió, y acá se pagaría con un club creyendo que su presidente
        // recibió la conciliación.
        if (resultado?.success) {
            if (traza.delivery?.id) await markSent(traza.delivery.id, { providerMessageId: resultado.messageId || null });
            return noticeResult({
                channel: 'email', target: destino, state: 'enviado',
                messageId: resultado.messageId || null, attachment: attachmentInfo,
            });
        }
        const motivo = resultado?.error || 'sin motivo devuelto por el proveedor';
        if (traza.delivery?.id) await markFailed(traza.delivery.id, { errorMessage: motivo, retryable: true });
        return noticeResult({ channel: 'email', target: destino, state: 'fallido', error: motivo });
    } catch (e) {
        return noticeResult({ channel: 'email', target: destino, state: 'fallido', error: e?.message || 'error inesperado' });
    }
};

/** Un reenvío ya hecho por esta MISMA operación del navegador. Es lo que hace
 *  que un doble clic o un refresco devuelvan lo de la primera vez. */
export const findNoticeByOperation = async (clubId, operationKey) => {
    try {
        const key = String(operationKey || '').trim();
        if (!clubId || !key || !(await listo())) return null;
        const { rows } = await db.query(
            `SELECT * FROM "DisbursementNotice"
              WHERE "clubId" = $1 AND "operationKey" = $2
              ORDER BY "createdAt" ASC LIMIT 1`,
            [clubId, key]
        );
        return rows[0] ? noticePublico(rows[0]) : null;
    } catch { return null; }
};

/**
 * REENVIAR LA CONCILIACIÓN DE UN TRASLADO.
 *
 * Compone el documento, lo archiva, manda el correo a los destinatarios que se
 * pidan —los de siempre, otros nuevos, o los dos— y deja la operación escrita.
 *
 * ⚠️ NO TOCA `DisbursementBatch.notifyState` NI SUS DESTINATARIOS. Ésas son las
 * columnas del aviso ORIGINAL y son lo que contesta «a quién se le avisó
 * cuando se hizo el giro». Pisarlas para anotar un reenvío borraría el dato
 * que este módulo existe para conservar.
 */
export const resendReconciliation = async ({
    batchId = null, paymentIds = [], clubId, emails = [], phones = [], note = '',
    actor = null, operationKey = '',
} = {}) => {
    if (!(await listo())) {
        return { ok: false, status: 503, errores: ['El registro de desembolsos todavía no está disponible en esta base.'] };
    }

    // ── Idempotencia de la operación, antes de nada ──────────────────
    const opKey = String(operationKey || '').trim().slice(0, 120);
    if (opKey) {
        const ya = await findNoticeByOperation(clubId, opKey);
        if (ya) return { ok: true, repetida: true, notice: ya, resultados: ya.results, estado: ya.state };
    }

    // ⚠️ EL ÁMBITO LO RESUELVE EL SERVIDOR, por el MISMO punto que la vista
    // previa y la descarga. Si el navegador lo mandara, la pantalla podría
    // prometer una consolidada y salir la de un lote — o al revés.
    const destino = await resolveReconciliation({ clubId, batchId, paymentIds });
    if (!destino.ok) return { ok: false, status: destino.status || 500, errores: [destino.error] };

    const { scope, header, items, plan } = destino;
    const lote = header;
    const vivos = items.filter(i => i.status !== 'reversado');

    // Los correos los sanea el criterio compartido: las mismas reglas que el
    // aviso original.
    //
    // ⚠️ LOS TELÉFONOS NO PASAN POR `resolveRecipients`, y no es un descuido:
    // sin un validador esa función los descarta en SILENCIO —ni siquiera los
    // devuelve como descartados—, y un destinatario que se pierde sin motivo es
    // exactamente lo que este módulo no puede hacer. Se rechazan acá, con su
    // razón, y se ven en el resultado.
    const destinatarios = resolveRecipients({ emails });
    const telefonos = (Array.isArray(phones) ? phones : [String(phones || '')])
        .join(',').split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
    const juicio = validateResend({
        batch: scope === 'traslado' ? lote : null,
        items, recipients: destinatarios, scope, plan,
    });
    if (!juicio.ok) return { ok: false, status: 422, errores: juicio.errores, avisos: juicio.avisos };

    const noticeId = nuevoId();
    const resultados = [];
    let documento = { key: null, name: null, bytes: 0, error: null };

    try {
        const plan2 = await resolveNotificationPlan({
            clubId, campaignId: lote.campaignId || null, event: 'disbursed',
        }).catch(() => ({ profile: null, site: null, campaign: null }));
        const perfil = plan2?.profile || null;
        const marca = await marcaDelSitio(clubId);
        const site = { name: plan2?.site?.name || marca.name, domain: plan2?.site?.domain || marca.domain };
        const campaign = plan2?.campaign?.name ? plan2.campaign : (lote.campaignName ? { name: lote.campaignName } : null);

        // ── EL DOCUMENTO ─────────────────────────────────────────────
        // Se compone SIEMPRE, aunque el envío falle: quien lo pidió tiene que
        // poder descargarlo igual. Es la regla del pedido —«el documento fue
        // generado correctamente y puede descargarse»—.
        const pdf = await buildReconciliationPdf({ batch: lote, items: vivos, site, campaign, scope });
        let adjuntoConciliacion = null;
        if (pdf.ok) {
            adjuntoConciliacion = {
                filename: pdf.filename,
                content: pdf.buffer.toString('base64'),
                contentType: pdf.mime,
            };
            const guardado = await uploadPrivateDocument({
                clubId, scope: `conciliacion-${batchId || String(lote.ref || 'seleccion')}`,
                buffer: pdf.buffer, mime: pdf.mime, filename: pdf.filename,
            });
            documento = guardado.ok
                ? { key: guardado.key, name: guardado.name, bytes: guardado.bytes, error: null }
                : { key: null, name: pdf.filename, bytes: pdf.bytes, error: guardado.error || 'no se pudo archivar' };
        } else {
            documento = { key: null, name: null, bytes: 0, error: pdf.error };
        }

        // ── EL CORREO ────────────────────────────────────────────────
        if (destinatarios.email.length) {
            // Los comprobantes del giro viajan también: quien concilia quiere
            // ver el soporte del banco al lado de la relación de aportes.
            //
            // ⚠️ Sólo los hay cuando el traslado es UN lote. Una consolidación
            // abarca varios movimientos y adjuntar los soportes de todos daría
            // un correo de decenas de MB; el documento nombra cada referencia,
            // que es lo que hace falta para pedirlos.
            const soporte = scope === 'traslado' ? await receiptAttachments(destino.row || {}) : { ok: false, attachments: [] };
            const adjuntos = [
                ...(adjuntoConciliacion ? [adjuntoConciliacion] : []),
                ...(soporte.ok ? soporte.attachments : []),
            ];
            const nombresAdjuntos = adjuntos.map(a => a.filename).filter(Boolean);

            const correo = buildBatchEmail({
                mode: 'reconciliation',
                scope,
                batch: { ...lote, methodLabel: lote.methodLabel },
                items: vivos,
                site,
                campaign,
                platform: { name: 'Club Platform for Rotary' },
                recipientName: lote.beneficiary,
                receipt: nombresAdjuntos.length
                    ? { name: nombresAdjuntos.join(', '), names: nombresAdjuntos }
                    : null,
            });

            if (!correo.ok) {
                // Se DETIENE y se dice qué faltó. No sale nada con un hueco
                // sin resolver — la regla de v4.996.
                const motivo = `No se envió: ${correo.problemas.join(' ')}`;
                for (const d of destinatarios.email) {
                    resultados.push(noticeResult({ channel: 'email', target: d, state: 'fallido', error: motivo }));
                }
            } else {
                const dominios = await verifiedDomains().catch(() => []);
                const remitente = resolveSenderPlan({
                    profile: perfil || {}, siteDomain: site.domain || '', verifiedDomains: dominios,
                });
                const info = nombresAdjuntos.length
                    ? { name: nombresAdjuntos[0], count: nombresAdjuntos.length, files: nombresAdjuntos }
                    : (documento.error ? { error: documento.error } : null);
                for (const d of destinatarios.email) {
                    resultados.push(await enviarCorreo({
                        noticeId, lote, destino: d, salida: correo, remitente,
                        profileId: perfil?.id || null,
                        attachments: adjuntos, attachmentInfo: info,
                    }));
                }
            }
        }

        // ⚠️ WhatsApp NO SE OFRECE PARA LA CONCILIACIÓN, y su ausencia es
        // deliberada: una conciliación es una TABLA con un documento adjunto, y
        // la plantilla aprobada de WhatsApp es la del aviso de giro —mandarla
        // acá le diría al club que le giraron otra vez, que es exactamente lo
        // que este correo existe para no decir—. Los teléfonos que lleguen se
        // reportan como omitidos con su motivo, no se descartan en silencio.
        for (const tel of telefonos) {
            resultados.push(noticeResult({
                channel: 'whatsapp', target: tel, state: 'omitido',
                error: 'La conciliación se manda por correo: lleva un documento adjunto y WhatsApp sólo admite la plantilla del aviso de giro.',
            }));
        }
    } catch (e) {
        const motivo = e?.message || 'error inesperado al reenviar la conciliación';
        console.error('[CONCILIACIÓN] el reenvío falló:', motivo);
        resultados.push(noticeResult({ channel: 'email', target: '', state: 'fallido', error: motivo }));
    }

    for (const d of destinatarios.descartados) {
        resultados.push(noticeResult({ channel: d.canal, target: d.valor, state: 'omitido', error: d.motivo }));
    }

    const resumen = summarizeResults(resultados);
    const estado = resumen?.enviados && resumen?.fallidos ? 'parcial'
        : resumen?.enviados ? 'enviado'
            : resumen?.fallidos ? 'fallido' : 'omitido';
    const error = resultados.find(r => r.state === 'fallido')?.error
        || resultados.find(r => r.state === 'omitido')?.error || null;

    // ── LA FILA ──────────────────────────────────────────────────────
    // Se escribe SIEMPRE, salga o no el correo: un envío que falló y no queda
    // registrado no se puede reintentar ni explicar.
    //
    // ⚠️ GUARDA SU ALCANCE. `paymentIds` y `disbursementIds` son lo que
    // contesta, dentro de seis meses, QUÉ afirmó este documento — un reverso
    // posterior cambia los aportes y el historial no puede cambiar con él.
    const totales = reconciliationTotals(vivos);
    let guardada = null;
    try {
        const { rows } = await db.query(
            `INSERT INTO "DisbursementNotice"
                 (id, "clubId", "batchId", scope, "paymentIds", "disbursementIds", "batchIds",
                  "campaignId", beneficiary, currency,
                  "count", "netAmount", emails, phones, results, state, error, note,
                  "documentKey", "documentName", "documentBytes", "documentError",
                  "sentBy", "sentByName", "operationKey")
             VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
             ON CONFLICT ("clubId", "operationKey") WHERE "operationKey" <> '' DO NOTHING
             RETURNING *`,
            [
                noticeId, clubId, destino.batchId || null, scope,
                JSON.stringify(plan.paymentIds || []),
                JSON.stringify(plan.disbursementIds || []),
                JSON.stringify(plan.batchIds || []),
                lote.campaignId || null, lote.beneficiary, lote.currency,
                totales.count, totales.neto,
                JSON.stringify(destinatarios.email), JSON.stringify(telefonos),
                JSON.stringify(resultados), estado, error ? String(error).slice(0, 500) : null,
                String(note || '').trim().slice(0, 1000) || null,
                documento.key, documento.name, documento.bytes || 0, documento.error,
                actor?.id || null, actor?.name || null, opKey,
            ]
        );
        guardada = rows[0] ? noticePublico(rows[0]) : null;
    } catch (e) {
        console.error('[CONCILIACIÓN] no pude registrar el reenvío:', e?.message);
    }

    // ── LA TRAZA, en cada aporte conciliado ──────────────────────────
    // Quien mira la ficha de un aporte tiene que ver que se reenvió su
    // conciliación y a quién. `recordFact` no lleva `toState`, así que dos
    // reenvíos son dos hechos y no se funden (v4.885) — y sobre todo: NO es un
    // cambio de estado financiero, que es lo que este módulo no puede hacer.
    if (resumen?.enviados) {
        const comoSeLlama = scope === 'traslado' ? `del traslado ${batchRef(destino.batchId)}` : `consolidada ${lote.ref}`;
        for (const paymentId of [...new Set(vivos.map(i => i.paymentId).filter(Boolean))]) {
            await recordFact({
                paymentId, clubId, kind: 'reconciliation_resent',
                actorKind: actor?.id ? 'user' : 'system',
                actorId: actor?.id || null,
                actorLabel: actor?.name || 'Reenvío de conciliación',
                reference: noticeId,
                note: `Conciliación ${comoSeLlama} reenviada a ${resumen.enviados} destinatario(s)`
                    + (resumen.fallidos ? `; ${resumen.fallidos} fallaron` : ''),
                meta: { batchId: destino.batchId || null, scope, noticeId, resumen },
            });
        }
    }

    return {
        ok: estado === 'enviado' || estado === 'parcial',
        repetida: false,
        scope,
        estado,
        error,
        avisos: [...(destino.avisos || []), ...juicio.avisos],
        resultados,
        resumen,
        documento: { name: documento.name, bytes: documento.bytes, guardado: !!documento.key, error: documento.error },
        notice: guardada,
    };
};

/** El enlace firmado al documento archivado de un reenvío. Nunca la clave. */
export const noticeDocumentUrl = async (noticeId, clubId) => {
    const fila = await noticeRow(noticeId, clubId);
    if (!fila) return { ok: false, status: 404, error: 'Este reenvío no existe en este sitio.' };
    if (!fila.documentKey) {
        return { ok: false, status: 404, error: 'Este reenvío no archivó su documento; se puede volver a generar desde el traslado.' };
    }
    const url = await signedReceiptUrl(fila.documentKey);
    if (!url) return { ok: false, status: 502, error: 'No se pudo firmar el enlace al documento.' };
    return { ok: true, url, name: fila.documentName || 'conciliacion.pdf' };
};

export default {
    RESEND_EVENT, listNotices, noticeRow, historyFor, transfersForPayments,
    resolveReconciliation, historyForSelection,
    reconciliationDocument, resendReconciliation, findNoticeByOperation,
    noticeDocumentUrl, noticePublico,
};
