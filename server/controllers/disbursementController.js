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

import db from '../lib/db.js';
import {
    listDisbursements, listDisbursementsFor, balanceFor,
    uploadReceipt, signedReceiptUrl, receiptKeyOf,
    registerDisbursement, reverseDisbursement, retryDisbursementNotice,
} from '../lib/disbursements.js';
import { timelineFor } from '../lib/paymentLifecycle.js';
import { scheduleOf, DISBURSEMENT_METHODS, RECEIPT_MIMES, RECEIPT_MAX_BYTES } from '../lib/walletLifecycle.js';
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
            timeline,
            disbursements: desembolsos,
            balance,
            // El catálogo va en la respuesta para que la pantalla no lo repita:
            // dos listas de medios de traslado se separan en silencio.
            methods: DISBURSEMENT_METHODS,
            receipt: { mimes: RECEIPT_MIMES, maxBytes: RECEIPT_MAX_BYTES },
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

        // ⚠️ No se desembolsa lo que todavía no está disponible. Registrar el
        // traslado de un dinero que el proveedor aún retiene sería anotar un
        // hecho que no pudo ocurrir.
        const cal = scheduleOf(pago, new Date());
        if (cal.estado !== 'available' && cal.estado !== 'disbursing') {
            return res.status(409).json({
                error: 'El aporte todavía no está disponible para desembolsar',
                detail: `Estado actual: ${cal.estadoLabel}.`
                    + (cal.diasRestantes ? ` Faltan ${cal.diasRestantes} día(s).` : ''),
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

        const normalizado = {
            ...cuerpo,
            amount: Number(cuerpo.amount),
            notify: cuerpo.notify === true || cuerpo.notify === 'true',
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
            avisos: r.avisos,
            notificacion: r.notificacion,
            timeline: await timelineFor(pago.id),
        });
    } catch (e) {
        console.error('[DISB] createDisbursement:', e);
        return res.status(500).json({ error: 'No se pudo registrar el desembolso', detail: e.message?.slice(0, 200) });
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
    getLifecycle, createDisbursement, reverse, getReceipt, retryNotice, reconcile, refresh,
};
