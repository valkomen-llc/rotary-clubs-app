// La API del ciclo de vida de un aporte: desembolsos, comprobantes, línea de
// tiempo y reconciliación.
//
// v4.885 — El CRITERIO vive en `walletLifecycle.js` (puro) y la I/O en
// `disbursements.js` y `paymentLifecycle.js`. Acá está lo que decide QUIÉN
// puede hacer qué y sobre qué aporte.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ EL AISLAMIENTO VA EN EL `WHERE`, NO EN UNA COMPROBACIÓN POSTERIOR.
// ═════════════════════════════════════════════════════════════════════
//
// Ningún endpoint de acá lee un pago por su id y comprueba después de quién es:
// el `clubId` del token entra en la consulta, así que para quien pregunta por
// un aporte ajeno ese aporte NO EXISTE. Confirmar que existe ya es filtrar que
// existe — la regla del panel del asistente (v4.655), de la Librería y de la
// Bóveda.
//
// ⚠️ Y EL PERMISO SE COMPRUEBA EN EL SERVIDOR, no sólo escondiendo el botón.
// Esconder un control en la pantalla no protege el endpoint de quien lo conoce
// (v4.868). Las rutas llevan `requireSiteAdmin` y además cada método vuelve a
// resolver el club desde el token.

import { randomUUID } from 'crypto';
import db from '../lib/db.js';
import {
    listDisbursements, listDisbursementsFor, balanceFor,
    uploadReceipt, signedReceiptUrl, receiptKeyOf,
    registerDisbursement, reverseDisbursement, retryDisbursementNotice,
    seedWhatsAppTemplate, whatsappTemplateStatus,
    openBatch, closeBatch, batchPublico, findBatchesByOperation, listBatches, batchDetail,
    notifyBatch, retryBatchNotice, previewBatchEmail,
} from '../lib/disbursements.js';
import { groupForBatches, describeBatches } from '../lib/disbursementBatch.js';
import { parsePayload, originOf, linkDonationsToPayments } from '../lib/paymentTrace.js';
import { normalizeCurrency } from '../lib/money.js';
import { timelineFor } from '../lib/paymentLifecycle.js';
import { scheduleOf, canDisburse, disbursementShape, validateDisbursement, DISBURSEMENT_METHODS, RECEIPT_MIMES, RECEIPT_MAX_BYTES } from '../lib/walletLifecycle.js';
import { resolveRecipients, NOTICE_CHANNELS, WA_TEMPLATE_NAME, MAX_POR_CANAL } from '../lib/disbursementNotice.js';
import { validateForMeta } from '../lib/phone.js';
import { sweepWallet } from '../lib/walletSweep.js';
import { reconcileHistory } from '../lib/walletReconcile.js';

/** El sitio sobre el que se opera. Sólo el operador de la plataforma puede
 *  nombrar otro; para todos los demás es el suyo y punto. */
const clubDe = (req) =>
    (req.user?.role === 'administrator' && (req.query?.clubId || req.body?.clubId))
        ? (req.query?.clubId || req.body?.clubId)
        : req.user?.clubId;

const actorDe = (req) => ({
    id: req.user?.id || req.user?.userId || null,
    name: req.user?.name || req.user?.email || null,
    email: req.user?.email || null,
});

/** El pago, acotado por club EN LA CONSULTA. `null` si no es de este sitio. */
const pagoDe = async (paymentId, clubId) => {
    const { rows } = await db.query(
        `SELECT id, "clubId", "providerRef", status, amount, currency, "applicationFee",
                "netAmount", "stripeStatus", "availableOn", "clubAvailableOn",
                "stripeBalanceTxId", "rawPayload", "createdAt"
           FROM "Payment"
          WHERE id = $1 AND "clubId" = $2
          LIMIT 1`,
        [paymentId, clubId]
    );
    return rows[0] || null;
};

/* ─── GET /financial/payments/:id/lifecycle ──────────────────────────
 *
 * Todo lo que la ficha de un aporte necesita: su calendario, su línea de
 * tiempo, sus desembolsos y cuánto queda por desembolsar.
 */
export const getLifecycle = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const pago = await pagoDe(req.params.id, clubId);
        if (!pago) return res.status(404).json({ error: 'El aporte no existe en este sitio' });

        const [timeline, desembolsos] = await Promise.all([
            timelineFor(pago.id),
            listDisbursements(pago.id),
        ]);
        const balance = await balanceFor(pago);

        return res.json({
            paymentId: pago.id,
            calendario: scheduleOf(pago, new Date()),
            // v4.886 — Si se puede desembolsar y, cuando se puede pero con
            // reparos, POR QUÉ. La pantalla no lo deduce del estado: con dos
            // criterios, el botón aparecería donde el servidor va a rechazar
            // —o al revés, que es peor—.
            permiso: canDisburse(pago, new Date()),
            timeline,
            disbursements: desembolsos,
            balance,
            // El catálogo va en la respuesta para que la pantalla no lo repita:
            // dos listas de medios de traslado se separan en silencio.
            methods: DISBURSEMENT_METHODS,
            receipt: { mimes: RECEIPT_MIMES, maxBytes: RECEIPT_MAX_BYTES },
            // v4.888 — Los canales de aviso y su tope. Van en la respuesta para
            // que la pantalla no los repita: dos catálogos se separan en
            // silencio, y aquí uno de los dos ofrecería un canal que el
            // servidor no sabe mandar.
            notice: { channels: NOTICE_CHANNELS, maxPerChannel: MAX_POR_CANAL, waTemplate: WA_TEMPLATE_NAME },
        });
    } catch (e) {
        console.error('[DISB] getLifecycle:', e);
        return res.status(500).json({ error: 'No se pudo leer el ciclo de vida', detail: e.message?.slice(0, 200) });
    }
};

/* ─── POST /financial/payments/:id/disbursements ─────────────────────
 *
 * Registra el desembolso. Multipart cuando trae comprobante, JSON cuando no.
 *
 * ⚠️ EXIGE CONFIRMACIÓN EXPLÍCITA (`confirm: true`). Es el requisito 9 del
 * pedido y no es ceremonia: una llamada suelta a este endpoint mueve el estado
 * financiero de un aporte y dispara un correo a un tercero. El campo obliga a
 * que el cliente lo diga a propósito, así que ni un reenvío de formulario ni
 * una petición copiada de la consola lo disparan por accidente.
 */
export const createDisbursement = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const cuerpo = req.body || {};
        // Multipart manda todo como texto: «true» y true son lo mismo acá.
        const confirmado = cuerpo.confirm === true || cuerpo.confirm === 'true';
        if (!confirmado) {
            return res.status(428).json({
                error: 'Falta la confirmación explícita',
                detail: 'Registrar un desembolso mueve el estado financiero del aporte y puede notificar al beneficiario. La confirmación se pide a propósito.',
            });
        }

        const pago = await pagoDe(req.params.id, clubId);
        if (!pago) return res.status(404).json({ error: 'El aporte no existe en este sitio' });

        // ⚠️ v4.886 — LO QUE SE BLOQUEA ES LO QUE EL PROVEEDOR RETIENE, no todo
        // lo que no esté «disponible». La primera versión exigía
        // `estado === 'available'`, y con eso un aporte sin fecha de Stripe
        // —que nunca la va a tener— no se podía desembolsar por ninguna vía:
        // el botón no aparecía jamás. Un control que no se puede satisfacer
        // obliga a llevar la contabilidad fuera de la plataforma.
        //
        // `canDisburse` distingue «Stripe lo retiene» de «no sabemos» y
        // devuelve el AVISO para el segundo caso. Ver su nota en
        // `walletLifecycle.js`.
        const cal = scheduleOf(pago, new Date());
        const permiso = canDisburse(pago, new Date());
        if (!permiso.ok) {
            return res.status(409).json({
                error: 'No se puede registrar un desembolso de este aporte',
                detail: permiso.motivo,
                calendario: cal,
            });
        }

        let comprobante = null;
        if (req.file?.buffer) {
            const subida = await uploadReceipt({
                clubId, paymentId: pago.id,
                buffer: req.file.buffer,
                mime: req.file.mimetype,
                filename: req.file.originalname,
            });
            if (!subida.ok) return res.status(422).json({ error: 'Comprobante no válido', errores: subida.errores });
            comprobante = subida;
        }

        // ⚠️ LOS DESTINATARIOS SE SANEAN EN EL SERVIDOR, con el criterio de
        // `disbursementNotice.js` —el mismo que sabe partir lo pegado y validar
        // un teléfono con las reglas del CRM—. Lo que no se pudo interpretar se
        // DEVUELVE con su motivo: un descarte silencioso deja a quien pegó
        // cinco números sin saber cuál no entró, y lo que se pierde es que
        // alguien no se entere de que le giraron.
        const destinatarios = resolveRecipients({
            emails: cuerpo.notifyEmails ?? cuerpo.notifyEmail,
            phones: cuerpo.notifyPhones,
        }, validateForMeta);

        const normalizado = {
            ...cuerpo,
            amount: Number(cuerpo.amount),
            notify: cuerpo.notify === true || cuerpo.notify === 'true',
            notifyEmails: destinatarios.email,
            notifyPhones: destinatarios.whatsapp,
            // Lo consume `validateDisbursement`: pedir avisar sin ningún
            // destinatario válido es un error, no un aviso.
            recipientCount: destinatarios.total,
        };

        const r = await registerDisbursement({
            payment: pago, body: normalizado, actor: actorDe(req), receipt: comprobante,
        });
        if (!r.ok) return res.status(r.status || 422).json({ error: r.errores?.[0] || 'No se pudo registrar', errores: r.errores });

        return res.json({
            ok: true,
            disbursement: r.disbursement,
            balance: r.balance,
            estado: r.estado,
            avisos: [
                ...(r.avisos || []),
                ...(permiso.aviso ? [permiso.aviso] : []),
                ...destinatarios.descartados.map(d =>
                    `No se pudo usar «${d.valor}» como destinatario de ${d.canal === 'whatsapp' ? 'WhatsApp' : 'correo'}: ${d.motivo}`),
            ],
            notificacion: r.notificacion,
            timeline: await timelineFor(pago.id),
        });
    } catch (e) {
        console.error('[DISB] createDisbursement:', e);
        return res.status(500).json({ error: 'No se pudo registrar el desembolso', detail: e.message?.slice(0, 200) });
    }
};

/* ─── GET/POST /financial/wallet/whatsapp-template ───────────────────
 *
 * v4.888 — El estado de la plantilla estándar de WhatsApp, y sembrarla.
 *
 * ⚠️ ES DEL OPERADOR DE LA PLATAFORMA. La plantilla vive en el WABA de la
 * plataforma —no hay uno por sitio (regla del CRM, v4.701)— así que crearla es
 * una decisión de infraestructura compartida, no de un club. Un administrador
 * de sitio SÍ puede consultar su estado: necesita saber por qué su aviso no
 * salió por WhatsApp.
 */
export const getWhatsappTemplate = async (req, res) => {
    try {
        return res.json(await whatsappTemplateStatus());
    } catch (e) {
        console.error('[DISB] getWhatsappTemplate:', e);
        return res.status(500).json({ error: 'No se pudo consultar el estado de WhatsApp' });
    }
};

export const seedWhatsappTemplate = async (req, res) => {
    try {
        if (req.user?.role !== 'administrator') {
            return res.status(403).json({
                error: 'Sólo el operador de la plataforma puede crear la plantilla',
                detail: 'La plantilla vive en el WABA de la plataforma y se aprueba una vez para todos los sitios.',
            });
        }
        const r = await seedWhatsAppTemplate();
        if (!r.ok) return res.status(409).json({ error: r.reason });
        return res.json({
            ...r,
            // El siguiente paso se DICE: crear el borrador no manda nada, y sin
            // esta frase alguien lo daría por listo y el aviso no saldría.
            siguiente: r.created
                ? 'La plantilla quedó como borrador. Enviala a Meta desde Comunicaciones CRM → Plantillas; '
                    + 'la revisión suele tardar entre unos minutos y 24 horas.'
                : 'Ya existía. Revisá su estado en Comunicaciones CRM → Plantillas.',
        });
    } catch (e) {
        console.error('[DISB] seedWhatsappTemplate:', e);
        return res.status(500).json({ error: 'No se pudo crear la plantilla' });
    }
};

/* ─── EL DESEMBOLSO AGRUPADO (v4.996) ────────────────────────────────
 *
 * v4.886 — Marcar VARIOS aportes como desembolsados de una vez.
 * v4.996 — Y tratarlos como UNA operación: un lote, una referencia, un correo.
 *
 * ⚠️ POR QUÉ SALÍA UN CORREO POR APORTE. Hasta v4.995 este manejador recorría
 * los aportes y llamaba a `registerDisbursement` con `notify: true` para cada
 * uno; aquél, a su vez, llamaba a `notifyDisbursement` por fila. Ocho aportes
 * eran ocho `notifyDisbursement`, ocho correos idénticos al mismo beneficiario
 * —cada uno con el monto de UN aporte, que no era el monto de nada que él
 * hubiera recibido— y la llave de idempotencia de la bitácora era por
 * CONTRIBUCIÓN (`aporte::disbursed::correo`), así que nada los frenaba. Se
 * reportó con la bandeja delante: ocho «Tu aporte ha sido desembolsado» a las
 * 23:11.
 *
 * Ahora las N filas se registran con `notify: false` —sigue habiendo UNA FILA POR APORTE, NUNCA UN REGISTRO AGREGADO:
 * es lo que permite reversar uno,
 * atribuirlo a su campaña y cuadrarlo contra el extracto— y quien avisa es el
 * LOTE, una sola vez
 * (`notifyBatch`). Una prueba lee este archivo y falla si `notify: true`
 * vuelve a entrar al bucle.
 *
 * ⚠️ LA AGRUPACIÓN LA DECIDE EL CRITERIO PURO (`groupForBatches`): sitio +
 * moneda + campaña + beneficiario. Una selección que mezcle dos campañas o dos
 * monedas produce DOS lotes y DOS correos, y nunca un correo con aportes de
 * destinos distintos.
 *
 * ⚠️ EL MONTO NO SE RECIBE: se calcula por aporte como lo que le falta. Dejarlo
 * entrar del cuerpo permitiría repartir un total entre cinco aportes con
 * criterios que nadie puede reconstruir después.
 *
 * ⚠️ NO ES ATÓMICO Y SE DICE. Cada aporte se registra por su cuenta: si el
 * tercero falla, los dos primeros quedan registrados —el dinero se movió— y el
 * lote cierra con los que sí entraron. Lo que no entró se NOMBRA con su motivo.
 *
 * ⚠️ IDEMPOTENTE POR OPERACIÓN. El modal manda `operationKey`, una llave que
 * genera al abrirse: dos peticiones con la misma llave —doble clic, reintento
 * de red, un refresco a mitad— encuentran los lotes ya creados y responden lo
 * mismo que la primera vez, sin registrar ni avisar de nuevo. El índice único
 * de `DisbursementBatch` lo garantiza aunque las dos lleguen a la vez.
 */

/** Los ids del cuerpo, vengan como array (JSON) o como texto (multipart). */
const idsDe = (crudos) => (Array.isArray(crudos)
    ? crudos
    : typeof crudos === 'string'
        ? (() => { try { const v = JSON.parse(crudos); return Array.isArray(v) ? v : [crudos]; } catch { return [crudos]; } })()
        : []
).filter(Boolean).map(String);

/**
 * Resuelve lo que hace falta de cada aporte elegido para agruparlo y para
 * escribir el correo: su pago, su saldo, su campaña y su aportante.
 *
 * La campaña sale de `Payment.rawPayload` —donde vive la atribución desde
 * v4.807— con `originOf`, el MISMO criterio con que la Bóveda rotula cada fila.
 * El aportante sale de `Donation` por el vínculo que `linkDonationsToPayments`
 * ya resuelve para la Bóveda: no se escribe un segundo emparejamiento.
 */
const resolverAportes = async ({ ids, clubId, ahora }) => {
    const elegibles = [];
    const saltados = [];
    const pagos = [];
    for (const id of ids) {
        const pago = await pagoDe(id, clubId);
        if (!pago) { saltados.push({ id, motivo: 'No existe en este sitio.' }); continue; }
        const permiso = canDisburse(pago, ahora);
        if (!permiso.ok) { saltados.push({ id, motivo: permiso.motivo }); continue; }
        const saldo = await balanceFor(pago);
        if (saldo.completo || saldo.restante <= 0) {
            saltados.push({ id, motivo: 'Ya estaba completamente desembolsado.' });
            continue;
        }
        pagos.push({ pago, saldo, aviso: permiso.aviso || null });
    }

    // El aportante de cada pago, por el vínculo de la Bóveda. Una consulta
    // para todos, no una por aporte.
    let enlaces = new Map();
    if (pagos.length) {
        try {
            const { rows: donaciones } = await db.query(
                `SELECT id, amount, currency, "donorName", "donorEmail", "isAnonymous", message, date
                   FROM "Donation" WHERE "clubId" = $1 AND status = 'success'
                  ORDER BY date DESC LIMIT 500`,
                [clubId]
            );
            const { links } = linkDonationsToPayments(donaciones, pagos.map(p => p.pago));
            for (const [donationId, enlace] of links) {
                const don = donaciones.find(d => d.id === donationId);
                if (don) enlaces.set(enlace.payment.id, don);
            }
        } catch (e) {
            // Sin aportante el lote se registra igual: el correo dirá
            // «Aportante sin nombre», que es la verdad, no un fallo.
            console.warn('[DISB] no pude resolver los aportantes del lote:', e?.message);
        }
    }

    for (const { pago, saldo, aviso } of pagos) {
        const payload = parsePayload(pago.rawPayload);
        const origen = originOf(payload);
        const don = enlaces.get(pago.id) || null;
        elegibles.push({
            paymentId: pago.id,
            pago, saldo, aviso,
            amount: saldo.restante,
            currency: normalizeCurrency(pago.currency),
            gross: Number(pago.amount) || 0,
            netContribution: Number(pago.netAmount) || 0,
            platformFee: Number(pago.applicationFee) || 0,
            campaignId: origen?.kind === 'campana' ? (origen.id || null) : null,
            campaignName: origen?.kind === 'campana' ? (origen.label || null) : null,
            donationId: don?.id || payload?.donationId || null,
            donorName: don?.donorName || payload?.customerDetails?.name || null,
            donorEmail: don?.donorEmail || payload?.customerDetails?.email || null,
            isAnonymous: !!don?.isAnonymous,
            date: don?.date || pago.createdAt,
        });
    }
    return { elegibles, saltados };
};

/* ─── POST /financial/wallet/disbursements/bulk/preview ──────────────
 *
 * Lo que VA A PASAR, sin escribir nada: cuántos lotes, cuánto cada uno, a qué
 * campaña, y por tanto cuántas notificaciones. La pantalla lo pinta junto al
 * botón de confirmar en vez de deducirlo por su cuenta — con dos criterios de
 * agrupación, el modal diría «1 notificación» y saldrían dos.
 */
export const previewBulkDisbursements = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });
        const ids = idsDe(req.body?.paymentIds);
        if (!ids.length) return res.status(422).json({ error: 'No se eligió ningún aporte' });
        const { elegibles, saltados } = await resolverAportes({ ids, clubId, ahora: new Date() });
        const grupos = groupForBatches(elegibles, { clubId, beneficiary: req.body?.beneficiary || '' });
        return res.json({ ok: true, ...describeBatches(grupos), saltados });
    } catch (e) {
        console.error('[DISB] previewBulkDisbursements:', e);
        return res.status(500).json({ error: 'No se pudo calcular el desembolso', detail: e.message?.slice(0, 200) });
    }
};

/* ─── POST /financial/wallet/disbursements/bulk ──────────────────────*/
export const createBulkDisbursements = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const confirmado = req.body?.confirm === true || req.body?.confirm === 'true';
        if (!confirmado) {
            return res.status(428).json({
                error: 'Falta la confirmación explícita',
                detail: 'Registrar varios desembolsos a la vez mueve el estado financiero de cada aporte.',
            });
        }

        const ids = idsDe(req.body?.paymentIds);
        if (!ids.length) return res.status(422).json({ error: 'No se eligió ningún aporte' });
        // Un tope por vuelta: el registro es una escritura por aporte y la
        // función corta a los 300 s. Lo que no entra se pide en otra tanda.
        if (ids.length > 50) {
            return res.status(422).json({ error: 'Máximo 50 aportes por vez. Elegí menos y repetí.' });
        }

        const actor = actorDe(req);
        const ahora = new Date();
        const operationKey = String(req.body?.operationKey || '').trim().slice(0, 120);

        // ⚠️ LA OPERACIÓN REPETIDA SE CONTESTA ANTES DE TOCAR NADA. Un doble
        // clic, un refresco a mitad o un reintento del navegador llegan con la
        // misma llave: se devuelven los lotes que ya existen, sin registrar ni
        // avisar otra vez.
        if (operationKey) {
            const previos = await findBatchesByOperation(clubId, operationKey);
            if (previos.length) {
                return res.json(respuestaDeLotes({ lotes: previos, saltados: [], avisos: [], repetida: true, elegidos: ids.length }));
            }
        }

        // Lo COMPARTIDO se valida UNA vez y antes de abrir nada: sin
        // beneficiario o con una fecha futura, ningún lote puede abrirse y no
        // tiene sentido descubrirlo aporte por aporte.
        const notify = req.body?.notify === true || req.body?.notify === 'true';
        const destinatarios = resolveRecipients({
            emails: req.body?.notifyEmails ?? req.body?.notifyEmail,
            phones: req.body?.notifyPhones,
        }, validateForMeta);
        const compartido = disbursementShape({
            amount: 1, // el monto real es por aporte; acá sólo se valida lo común
            disbursedAt: req.body?.disbursedAt,
            beneficiary: req.body?.beneficiary,
            method: req.body?.method,
            reference: req.body?.reference,
            notes: req.body?.notes,
            notify,
            notifyEmails: destinatarios.email,
            notifyPhones: destinatarios.whatsapp,
        });
        const juicio = validateDisbursement(compartido, { now: ahora });
        if (!juicio.ok) return res.status(422).json({ error: juicio.errores[0], errores: juicio.errores, avisos: juicio.avisos });

        const { elegibles, saltados } = await resolverAportes({ ids, clubId, ahora });
        if (!elegibles.length) {
            return res.json(respuestaDeLotes({ lotes: [], saltados, avisos: [], repetida: false, elegidos: ids.length }));
        }

        // ⚠️ v4.887 — EL COMPROBANTE DEL LOTE SE SUBE UNA SOLA VEZ y las N
        // filas —y los lotes— comparten la clave: si los aportes salieron en
        // UNA transferencia hay UN soporte, y ése sí los respalda a todos.
        let comprobante = null;
        if (req.file?.buffer) {
            const subida = await uploadReceipt({
                clubId, paymentId: `lote-${operationKey || randomUUID()}`,
                buffer: req.file.buffer, mime: req.file.mimetype, filename: req.file.originalname,
            });
            if (!subida.ok) return res.status(422).json({ error: 'Comprobante no válido', errores: subida.errores });
            comprobante = subida;
        }

        const grupos = groupForBatches(elegibles, { clubId, beneficiary: compartido.beneficiary });
        const lotes = [];
        const avisos = [
            ...(juicio.avisos || []),
            ...destinatarios.descartados.map(d =>
                `No se pudo usar «${d.valor}» como destinatario de ${d.canal === 'whatsapp' ? 'WhatsApp' : 'correo'}: ${d.motivo}`),
        ];

        for (const grupo of grupos) {
            // El lote. Existe siempre —también sin comprobante—: agrupa los N
            // movimientos de un mismo giro, que es útil para un informe aunque
            // no haya archivo. Se abre ANTES de registrar ningún aporte.
            const apertura = await openBatch({
                clubId, group: grupo, actor, receipt: comprobante, operationKey,
                body: {
                    disbursedAt: compartido.disbursedAt, beneficiary: compartido.beneficiary,
                    method: compartido.method, reference: compartido.reference, notes: compartido.notes,
                    notifyEmails: destinatarios.email, notifyPhones: destinatarios.whatsapp,
                },
            });
            if (!apertura.ok) {
                for (const it of grupo.items) saltados.push({ id: it.paymentId, motivo: apertura.errores?.[0] || 'No se pudo abrir el lote.' });
                continue;
            }
            if (apertura.repeated) {
                // Otra petición con la misma llave ya creó este grupo: se
                // deja en paz. Sus aportes no se registran acá.
                for (const it of grupo.items) saltados.push({ id: it.paymentId, motivo: 'Ya se estaba registrando en otra petición con la misma operación.' });
                continue;
            }
            const lote = apertura.batch;

            const hechos = [];
            for (const it of grupo.items) {
                // ⚠️ `notify: false` A PROPÓSITO: la fila no avisa por su cuenta.
                // Quien avisa es el lote, una vez, más abajo.
                const r = await registerDisbursement({
                    payment: it.pago,
                    body: {
                        amount: it.amount,
                        disbursedAt: compartido.disbursedAt,
                        beneficiary: compartido.beneficiary,
                        method: compartido.method,
                        reference: compartido.reference,
                        notes: compartido.notes,
                        notify: false,
                        notifyEmails: destinatarios.email,
                        notifyPhones: destinatarios.whatsapp,
                        donationId: it.donationId,
                    },
                    actor,
                    receipt: comprobante,
                    batchId: lote.id,
                });
                if (!r.ok) { saltados.push({ id: it.paymentId, motivo: r.errores?.[0] || 'No se pudo registrar.' }); continue; }
                if (it.aviso) avisos.push(it.aviso);
                hechos.push({ ...it, disbursementId: r.disbursement.id, amount: r.disbursement.amount, status: 'confirmado' });
            }

            const cierre = await closeBatch({ batchId: lote.id, items: hechos });
            const loteCerrado = cierre.batch || lote;

            // ── EL ÚNICO AVISO DEL LOTE ──────────────────────────────
            let notificacion = null;
            if (notify && destinatarios.total > 0 && hechos.length) {
                notificacion = await notifyBatch({ batch: loteCerrado, items: hechos, actor });
            }

            lotes.push({
                ...batchPublico(loteCerrado),
                ...(notificacion?.fila || {}),
                hechos: hechos.map(h => ({
                    id: h.paymentId, disbursementId: h.disbursementId,
                    amount: h.amount, currency: h.currency,
                })),
                notificacion: notificacion ? { estado: notificacion.estado, error: notificacion.error } : null,
            });
        }

        return res.json(respuestaDeLotes({ lotes, saltados, avisos, repetida: false, elegidos: ids.length, comprobante }));
    } catch (e) {
        console.error('[DISB] createBulkDisbursements:', e);
        return res.status(500).json({ error: 'No se pudieron registrar los desembolsos', detail: e.message?.slice(0, 200) });
    }
};

/**
 * La respuesta del bloque. Conserva la forma de v4.886 —`registrados`,
 * `saltados`, `totalesPorMoneda`, `hechos`, `batchId`— para un navegador con
 * el bundle anterior, y agrega `lotes`: uno por lote, con su referencia, su
 * total y el resultado de SU notificación.
 *
 * ⚠️ El total se devuelve POR MONEDA. Un bloque puede mezclar aportes en pesos
 * y en dólares, y un total único sería el «$47.507,75» otra vez.
 */
const respuestaDeLotes = ({ lotes, saltados, avisos, repetida, elegidos, comprobante = null }) => {
    const hechos = lotes.flatMap(l => l.hechos || []);
    const porMoneda = {};
    for (const l of lotes) porMoneda[l.currency] = (porMoneda[l.currency] || 0) + (Number(l.netAmount) || 0);
    return {
        ok: lotes.length > 0,
        repetida,
        registrados: lotes.reduce((a, l) => a + (Number(l.count) || 0), 0),
        elegidos,
        avisos,
        // Compatibilidad: el primer lote es «el» batchId de v4.887.
        batchId: lotes[0]?.id || null,
        comprobante: comprobante ? { name: comprobante.name, bytes: comprobante.bytes } : null,
        saltados,
        totalesPorMoneda: porMoneda,
        hechos,
        lotes,
        // Cuántos correos consolidados salieron de verdad. Es lo que la pantalla
        // dice después de confirmar, y tiene que salir de lo ocurrido.
        notificacionesEnviadas: lotes.filter(l => l.notifyState === 'enviado' || l.notifyState === 'parcial').length,
    };
};

/* ─── GET /financial/wallet/disbursement-batches ─────────────────────
 *
 * Los lotes de un sitio, para la trazabilidad: referencia, fecha, responsable,
 * campaña, beneficiario, total, cantidad de aportes, a quién se avisó y con
 * qué resultado.
 */
export const listDisbursementBatches = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });
        return res.json({ batches: await listBatches(clubId, { limit: Number(req.query?.limit) || 100 }) });
    } catch (e) {
        console.error('[DISB] listDisbursementBatches:', e);
        return res.status(500).json({ error: 'No se pudieron listar los desembolsos', detail: e.message?.slice(0, 200) });
    }
};

/* ─── GET /financial/wallet/disbursement-batches/:id ─────────────────
 *
 * La ficha de un lote con sus aportes. Acotada por club en la consulta: para
 * quien pregunta por un lote ajeno, no existe.
 */
export const getDisbursementBatch = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });
        const lote = await batchDetail(req.params.id, clubId);
        if (!lote) return res.status(404).json({ error: 'El desembolso agrupado no existe en este sitio' });
        return res.json({ batch: lote });
    } catch (e) {
        console.error('[DISB] getDisbursementBatch:', e);
        return res.status(500).json({ error: 'No se pudo leer el desembolso', detail: e.message?.slice(0, 200) });
    }
};

/* ─── GET /financial/wallet/disbursement-batches/:id/email-preview ───
 *
 * El correo consolidado tal como saldría, SIN enviarlo. Es lo que permite
 * mirar la plantilla con datos reales; y si no se puede componer, dice por
 * qué — que es lo que hace falta para corregirlo antes de reintentar.
 */
export const getDisbursementBatchEmailPreview = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });
        const previo = await previewBatchEmail({ batchId: req.params.id, clubId });
        if (!previo) return res.status(404).json({ error: 'El desembolso agrupado no existe en este sitio' });
        return res.json({
            ok: previo.ok, subject: previo.subject, html: previo.html, text: previo.text,
            missingRequired: previo.missingRequired, missingOptional: previo.missingOptional,
            problemas: previo.problemas,
        });
    } catch (e) {
        console.error('[DISB] getDisbursementBatchEmailPreview:', e);
        return res.status(500).json({ error: 'No se pudo componer el correo', detail: e.message?.slice(0, 200) });
    }
};

/* ─── POST /financial/wallet/disbursement-batches/:id/notify ─────────
 *
 * Reintenta el aviso del lote. Sólo vuelve a salir a quien NO lo recibió: las
 * entregas ya enviadas responden «duplicado» por la bitácora.
 */
export const retryDisbursementBatchNotice = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });
        const r = await retryBatchNotice({ batchId: req.params.id, clubId, actor: actorDe(req) });
        if (!r.ok && r.status) return res.status(r.status).json({ error: r.errores?.[0] });
        return res.json({ ok: r.ok, estado: r.estado, error: r.error, resultados: r.resultados });
    } catch (e) {
        console.error('[DISB] retryDisbursementBatchNotice:', e);
        return res.status(500).json({ error: 'No se pudo reintentar el aviso del desembolso' });
    }
};

/* ─── POST /financial/disbursements/:id/reverse ──────────────────────
 *
 * La ÚNICA forma de corregir. No hay `DELETE` en esta API, y su ausencia es
 * deliberada: una operación financiera confirmada que desaparece sin rastro es
 * lo que un libro existe para impedir.
 */
export const reverse = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });
        const confirmado = req.body?.confirm === true || req.body?.confirm === 'true';
        if (!confirmado) {
            return res.status(428).json({ error: 'Falta la confirmación explícita para reversar' });
        }
        const r = await reverseDisbursement({
            disbursementId: req.params.id, clubId,
            reason: req.body?.reason, actor: actorDe(req),
        });
        if (!r.ok) return res.status(r.status || 422).json({ error: r.errores?.[0], errores: r.errores });
        return res.json({ ok: true, disbursement: r.disbursement });
    } catch (e) {
        console.error('[DISB] reverse:', e);
        return res.status(500).json({ error: 'No se pudo reversar', detail: e.message?.slice(0, 200) });
    }
};

/* ─── GET /financial/disbursements/:id/receipt ───────────────────────
 *
 * Devuelve un enlace FIRMADO y con caducidad, no el archivo ni su clave. La
 * consulta va acotada por club: para quien pide el comprobante de un aporte
 * ajeno, no existe.
 */
export const getReceipt = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const fila = await receiptKeyOf(req.params.id, clubId);
        if (!fila?.receiptKey) return res.status(404).json({ error: 'Este desembolso no tiene comprobante' });

        const url = await signedReceiptUrl(fila.receiptKey);
        if (!url) return res.status(503).json({ error: 'No se pudo firmar el enlace del comprobante' });

        return res.json({
            url,
            name: fila.receiptName,
            mime: fila.receiptMime,
            // Se DICE que caduca: un enlace que deja de funcionar sin aviso se
            // lee como que el comprobante se perdió.
            expiresInSeconds: 300,
        });
    } catch (e) {
        console.error('[DISB] getReceipt:', e);
        return res.status(500).json({ error: 'No se pudo abrir el comprobante' });
    }
};

/* ─── POST /financial/disbursements/:id/notify ───────────────────────
 *
 * Reintenta el aviso. El desembolso ya es válido: lo que se reintenta es el
 * correo, y por eso es una acción aparte del registro.
 */
export const retryNotice = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const { rows } = await db.query(
            `SELECT "paymentId" FROM "Disbursement" WHERE id = $1 AND "clubId" = $2 LIMIT 1`,
            [req.params.id, clubId]
        );
        if (!rows.length) return res.status(404).json({ error: 'El desembolso no existe en este sitio' });

        const pago = await pagoDe(rows[0].paymentId, clubId);
        if (!pago) return res.status(404).json({ error: 'El aporte no existe en este sitio' });

        const r = await retryDisbursementNotice({
            disbursementId: req.params.id, clubId, payment: pago, actor: actorDe(req),
        });
        if (!r.ok && r.status) return res.status(r.status).json({ error: r.errores?.[0] });
        // v4.996 — Si el desembolso cuelga de un lote, el aviso que se reintentó
        // es el del LOTE, y se dice cuál.
        return res.json({ ok: r.ok, estado: r.estado, error: r.error, batchId: r.batchId || null });
    } catch (e) {
        console.error('[DISB] retryNotice:', e);
        return res.status(500).json({ error: 'No se pudo reintentar el aviso' });
    }
};

/* ─── POST /financial/wallet/reconcile ───────────────────────────────
 *
 * ⚠️ DE ENSAYO POR DEFECTO. Sin `{"apply": true}` no escribe nada y devuelve lo
 * que HARÍA. Es el mismo patrón que la carga hacia atrás del libro mayor
 * (v4.848) y por el mismo motivo: lo valioso es mirar primero, y lo que NO se
 * puede corregir —y por qué— es la mitad del resultado.
 */
export const reconcile = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });
        const aplicar = req.body?.apply === true;

        const informe = await reconcileHistory({
            clubId, apply: aplicar,
            limit: Math.min(Number(req.body?.limit) || 200, 500),
            timeBudgetMs: 120_000,
            actor: actorDe(req),
        });
        return res.json(informe);
    } catch (e) {
        console.error('[DISB] reconcile:', e);
        return res.status(500).json({ error: 'No se pudo reconciliar', detail: e.message?.slice(0, 200) });
    }
};

/* ─── POST /financial/wallet/refresh ─────────────────────────────────
 *
 * El barrido a mano. El cron ya lo corre solo cada quince minutos; esto existe
 * para quien acaba de recibir un aporte y no quiere esperar. Es el MISMO
 * `sweepWallet`: dos caminos con criterios distintos se separan en silencio.
 */
export const refresh = async (req, res) => {
    try {
        const clubId = clubDe(req);
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });
        const resumen = await sweepWallet({ clubId, limit: 40, timeBudgetMs: 90_000 });
        return res.json({ ok: true, ...resumen });
    } catch (e) {
        console.error('[DISB] refresh:', e);
        return res.status(500).json({ error: 'No se pudo actualizar', detail: e.message?.slice(0, 200) });
    }
};

export default {
    getLifecycle, createDisbursement, createBulkDisbursements, previewBulkDisbursements,
    listDisbursementBatches, getDisbursementBatch, getDisbursementBatchEmailPreview, retryDisbursementBatchNotice,
    getWhatsappTemplate, seedWhatsappTemplate,
    reverse, getReceipt, retryNotice, reconcile, refresh,
};
