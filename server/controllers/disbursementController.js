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
} from '../lib/disbursements.js';
import { timelineFor } from '../lib/paymentLifecycle.js';
import { scheduleOf, canDisburse, DISBURSEMENT_METHODS, RECEIPT_MIMES, RECEIPT_MAX_BYTES } from '../lib/walletLifecycle.js';
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
                "stripeBalanceTxId", "createdAt"
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

/* ─── POST /financial/wallet/disbursements/bulk ──────────────────────
 *
 * v4.886 — Marcar VARIOS aportes como desembolsados de una vez.
 *
 * ⚠️ UNA FILA POR APORTE, NUNCA UN REGISTRO AGREGADO. Es la misma regla que
 * separó `DistributionJob` de la campaña (v4.864) y `ReelScene` de
 * `ReelProject`: un movimiento que cubre cinco aportes no se puede reversar
 * parcialmente, no se puede atribuir a su campaña y no cuadra contra un
 * extracto por aporte. Lo que se comparte es el FORMULARIO —beneficiario,
 * fecha, medio, referencia—, no el registro.
 *
 * ⚠️ EL MONTO NO SE RECIBE: se calcula por aporte como lo que le falta a cada
 * uno. Dejarlo entrar del cuerpo permitiría repartir un total entre cinco
 * aportes con criterios que nadie puede reconstruir después. Un desembolso en
 * bloque es «giré lo que quedaba de estos cinco», y si lo que se giró fue otra
 * cosa, se registran de a uno.
 *
 * ⚠️ NO ES ATÓMICO Y SE DICE. Cada aporte se registra por su cuenta: si el
 * tercero falla, los dos primeros quedan registrados —el dinero se movió— y el
 * informe nombra cuáles no entraron. Envolverlo en una transacción sería peor:
 * un fallo tiraría abajo registros de traslados que sí ocurrieron.
 */
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

        // Multipart manda los arrays como texto repetido o como JSON: se admiten
        // las dos formas o el adjunto obligaría a cambiar cómo viaja la lista.
        const crudos = req.body?.paymentIds;
        const ids = (Array.isArray(crudos)
            ? crudos
            : typeof crudos === 'string'
                ? (() => { try { const v = JSON.parse(crudos); return Array.isArray(v) ? v : [crudos]; } catch { return [crudos]; } })()
                : []
        ).filter(Boolean);
        if (!ids.length) return res.status(422).json({ error: 'No se eligió ningún aporte' });
        // Un tope por vuelta: el registro es una escritura por aporte y la
        // función corta a los 300 s. Lo que no entra se pide en otra tanda.
        if (ids.length > 50) {
            return res.status(422).json({ error: 'Máximo 50 aportes por vez. Elegí menos y repetí.' });
        }

        // ⚠️ LOS DESTINATARIOS SE RESUELVEN ACÁ, UNA VEZ PARA TODO EL LOTE.
        //
        // v4.888 los agregó al desembolso de a uno y copió las líneas que los
        // MANDAN dentro de este bucle sin traer la línea que los CALCULA: el
        // bloque entero reventaba con un ReferenceError dentro del `try`, así
        // que la petición contestaba 500 y NINGÚN aporte se registraba. Se
        // reportó como «le doy completar y no aparece nada, siguen apareciendo
        // ahí». Es el mismo renombrado a medias de v4.889, por la otra puerta —
        // y tampoco lo ve nada: el servidor es `.js` fuera de `src`, así que el
        // typecheck no lo mira, y `check:syntax` da el archivo por bueno porque
        // parsea perfectamente.
        const destinatarios = resolveRecipients({
            emails: req.body?.notifyEmails ?? req.body?.notifyEmail,
            phones: req.body?.notifyPhones,
        }, validateForMeta);

        const actor = actorDe(req);
        const ahora = new Date();
        // El identificador del LOTE. Existe siempre —también sin comprobante—
        // porque agrupa los N movimientos de un mismo giro, que es útil para
        // un informe aunque no haya archivo.
        const loteId = randomUUID();
        const hechos = [];
        const saltados = [];

        // ⚠️ v4.887 — EL COMPROBANTE DEL LOTE SE SUBE UNA SOLA VEZ.
        //
        // v4.886 no lo ofrecía, con el argumento de que un mismo archivo
        // repetido en cinco filas afirmaría respaldar a cada una por separado.
        // El argumento era demasiado purista y el caso real lo desmiente: si
        // los cinco aportes se giraron en UNA transferencia, hay un solo
        // soporte y ése SÍ los respalda a los cinco. Lo que no se puede es
        // presentarlo como si fuera de un aporte suelto — y para eso está el
        // `batchId`, que hace que la ficha lo diga con esas palabras.
        //
        // Se sube una vez y las N filas comparten la clave: subirlo N veces
        // serían N objetos idénticos en S3 y N veces el mismo gasto de red.
        let comprobante = null;
        if (req.file?.buffer) {
            const subida = await uploadReceipt({
                clubId,
                // La clave lleva el id del LOTE, no el de un aporte: el archivo
                // no es de ninguno en particular.
                paymentId: `lote-${loteId}`,
                buffer: req.file.buffer,
                mime: req.file.mimetype,
                filename: req.file.originalname,
            });
            if (!subida.ok) return res.status(422).json({ error: 'Comprobante no válido', errores: subida.errores });
            comprobante = subida;
        }

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

            // ⚠️ La referencia lleva el id del aporte: el índice único es
            // `(paymentId, reference)`, así que una referencia compartida por
            // cinco aportes NO choca entre ellos —son pagos distintos— pero sí
            // protege contra el doble clic sobre el mismo. Se conserva la que
            // escribió el usuario tal cual: es la que va a buscar en su banco.
            const r = await registerDisbursement({
                payment: pago,
                body: {
                    amount: saldo.restante,
                    disbursedAt: req.body?.disbursedAt,
                    beneficiary: req.body?.beneficiary,
                    method: req.body?.method,
                    reference: req.body?.reference,
                    notes: req.body?.notes,
                    notify: req.body?.notify === true || req.body?.notify === 'true',
                    notifyEmail: req.body?.notifyEmail,
                    notifyEmails: destinatarios.email,
                    notifyPhones: destinatarios.whatsapp,
                    recipientCount: destinatarios.total,
                },
                actor,
                receipt: comprobante,
                batchId: loteId,
            });

            if (!r.ok) { saltados.push({ id, motivo: r.errores?.[0] || 'No se pudo registrar.' }); continue; }
            hechos.push({
                id,
                disbursementId: r.disbursement.id,
                amount: r.disbursement.amount,
                currency: r.disbursement.currency,
                notificacion: r.notificacion?.estado || null,
            });
        }

        // ⚠️ El total se devuelve POR MONEDA. Un bloque puede mezclar aportes en
        // pesos y en dólares, y un total único sería el «$47.507,75» otra vez.
        const porMoneda = {};
        for (const h of hechos) {
            porMoneda[h.currency] = (porMoneda[h.currency] || 0) + h.amount;
        }

        return res.json({
            ok: hechos.length > 0,
            registrados: hechos.length,
            // Lo que no se pudo interpretar como destinatario, con su motivo.
            avisos: destinatarios.descartados.map(d =>
                `No se pudo usar «${d.valor}» como destinatario de ${d.canal === 'whatsapp' ? 'WhatsApp' : 'correo'}: ${d.motivo}`),
            batchId: loteId,
            comprobante: comprobante ? { name: comprobante.name, bytes: comprobante.bytes } : null,
            // Lo que NO entró y POR QUÉ. Sin esto, «se registraron 3 de 5» deja
            // adivinando cuáles dos y qué hacer con ellos.
            saltados,
            totalesPorMoneda: porMoneda,
            hechos,
        });
    } catch (e) {
        console.error('[DISB] createBulkDisbursements:', e);
        return res.status(500).json({ error: 'No se pudieron registrar los desembolsos', detail: e.message?.slice(0, 200) });
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
        return res.json({ ok: r.ok, estado: r.estado, error: r.error });
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
    getLifecycle, createDisbursement, createBulkDisbursements,
    getWhatsappTemplate, seedWhatsappTemplate,
    reverse, getReceipt, retryNotice, reconcile, refresh,
};
