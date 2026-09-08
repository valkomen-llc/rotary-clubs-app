import express from 'express';
import {
    paypalAvailabilityCheck, createPaypalDonation, capturePaypalDonation,
} from '../controllers/paypalController.js';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
// v4.998 — cuántos comprobantes admite un desembolso: lo decide el criterio.
import { RECEIPT_MAX_FILES } from '../lib/walletLifecycle.js';
import prisma from '../lib/prisma.js'; // v4.413 — singleton (evita pool exhaustion en Vercel)
import {
    createDonationCheckout,
    getDonationCurrency,
    createSubscriptionCheckout,
    getDonationSessionStatus,
    listClubDonations,
    resendDonationConfirmation,
    getEmailDiagnostics,
    sendTestEmail,
    getClubWallet,
    syncPaymentsWithStripe
} from '../controllers/financialController.js';
// v4.885 — El ciclo de vida de un aporte: desembolsos, comprobantes, línea de
// tiempo y reconciliación. Controlador aparte porque es otro dominio —lo que
// pasa DESPUÉS de que el dinero está disponible— y meterlo en
// `financialController.js`, que ya son 1.900 líneas, lo haría inencontrable.
import {
    getLifecycle, createDisbursement, createBulkDisbursements, previewBulkDisbursements,
    listDisbursementBatches, getDisbursementBatch, getDisbursementBatchEmailPreview, retryDisbursementBatchNotice,
    resolveTransfersForSelection, getBatchNotices, getBatchReconciliation,
    resendBatchReconciliation, getNoticeDocument,
    reverse as reverseDisbursement,
    getWhatsappTemplate, seedWhatsappTemplate,
    getReceipt, retryNotice, reconcile as reconcileWallet, refresh as refreshWallet,
} from '../controllers/disbursementController.js';

const router = express.Router();

/**
 * v4.885 — El comprobante del desembolso, si viene.
 *
 * Multer se importa PEREZOSAMENTE y sólo cuando la petición es multipart: es la
 * lección de rendimiento de v4.659 —una dependencia cargada en el arranque en
 * frío la paga la primera visita de todo el sitio— y acá además no hace falta
 * casi nunca. Con JSON el middleware no toca nada y sigue de largo.
 *
 * ⚠️ NUNCA LANZA hacia fuera: un fallo cargando multer devuelve 503 con su
 * motivo en vez de tumbar la ruta con un error sin explicación.
 */
let _upload = null;
const comprobanteOpcional = async (req, res, next) => {
    const tipo = String(req.headers['content-type'] || '');
    if (!tipo.includes('multipart/form-data')) return next();
    try {
        if (!_upload) {
            const multerMod = await import('multer');
            const multer = multerMod.default || multerMod;
            // El tope aquí es el del transporte; el que decide qué se acepta es
            // `checkReceipt` en `walletLifecycle.js`, que además dice POR QUÉ.
            _upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
        }
        // v4.998 — VARIOS archivos bajo el MISMO campo. La pantalla manda cada
        // comprobante como `receipt`: el PDF del banco y la captura con el
        // costo de la transferencia salen juntos. `array` acepta también UN
        // solo archivo, así que el navegador con el bundle anterior entra igual.
        // El tope de cantidad lo decide `RECEIPT_MAX_FILES` en
        // `walletLifecycle.js`; acá se recibe uno de más para que el rechazo lo
        // diga el criterio con su motivo y no multer con «Unexpected field».
        return _upload.array('receipt', RECEIPT_MAX_FILES + 1)(req, res, (err) => {
            if (!err) return next();
            const demasiados = err?.code === 'LIMIT_UNEXPECTED_FILE';
            const pesado = err?.code === 'LIMIT_FILE_SIZE';
            return res.status(demasiados || pesado ? 422 : 400).json({
                error: demasiados
                    ? `Se pueden adjuntar hasta ${RECEIPT_MAX_FILES} comprobantes.`
                    : pesado ? 'Uno de los comprobantes supera el tamaño admitido.' : 'No se pudo leer el archivo adjunto',
                detail: err?.message,
            });
        });
    } catch (e) {
        console.error('[FINANCIAL] no pude preparar la subida del comprobante:', e?.message);
        return res.status(503).json({ error: 'No se pudo procesar el archivo adjunto', detail: e?.message });
    }
};

/**
 * ==========================================
 * DONACIONES — Stripe Checkout (v4.409)
 * ==========================================
 * Endpoints públicos para Maneras de Contribuir.
 * El webhook (en /api/payments/webhook) registra Payment+Donation
 * cuando Stripe confirma el cobro.
 */

// PÚBLICO — cualquier visitante puede iniciar una donación
router.post('/donate', createDonationCheckout);

// v4.866 — PAYPAL, segunda vía de cobro. Públicas como `/donate`: el visitante
// no tiene sesión. La moneda y el destino los resuelve el SERVIDOR, así que del
// cuerpo sólo entran el monto y los datos del donante.
//
// ⚠️ Van ANTES de cualquier ruta con parámetro de este grupo — Express casa en
// orden y `check:routes` rompe el despliegue si una literal queda tapada.
router.get('/paypal/available', paypalAvailabilityCheck);
router.post('/paypal/create', createPaypalDonation);
router.post('/paypal/capture', capturePaypalDonation);
// v4.834 — en qué moneda se le cobra a quien pregunta. Público y sin caché:
// la respuesta depende del país del visitante.
router.get('/currency', getDonationCurrency);
router.get('/donate/session/:id', getDonationSessionStatus);

// PÚBLICO — suscripción a membresía recurrente (Fase 2)
router.post('/subscribe', createSubscriptionCheckout);

// v4.841 — Las tres piden ADMINISTRADOR DEL SITIO, no sólo sesión. Llevan los
// datos de todos los donantes del club y una de ellas gasta llamadas a Stripe;
// hasta v4.840 bastaba con `authMiddleware`, que no mira el rol.
router.get('/donations', authMiddleware, requireSiteAdmin, listClubDonations);

// La Bóveda: saldos y movimientos POR MONEDA (v4.841).
// v4.858 — Reenviar la confirmación de un aporte. Es un correo a un TERCERO:
// exige rol administrativo del sitio y el aporte se busca acotado por el
// `clubId` del token.
router.post('/donations/:id/resend', authMiddleware, requireSiteAdmin, resendDonationConfirmation);
router.get('/wallet', authMiddleware, requireSiteAdmin, getClubWallet);

// v4.422 — Sync retroactivo: enriquece Payments existentes con datos de
// Stripe (fee real, availableOn, status, payment method). Idempotente.
router.post('/wallet/sync-stripe', authMiddleware, requireSiteAdmin, syncPaymentsWithStripe);

// ═══════════════════════════════════════════════════════════════════
// v4.885 — EL CICLO DE VIDA DE UN APORTE
// ═══════════════════════════════════════════════════════════════════
//
// ⚠️ LAS LITERALES VAN ANTES QUE LA PARAMÉTRICA. Express casa en ORDEN de
// declaración, así que `/payments/:id/...` declarado antes que
// `/wallet/reconcile` no sería el problema —tienen prefijos distintos— pero
// `/disbursements/:id/receipt` SÍ se tragaría a cualquier literal de tres
// segmentos que se agregue después bajo `/disbursements/`. Al agregar una,
// ponerla arriba. Lo comprueba `npm run check:routes`.
//
// Todas exigen rol administrativo del sitio: mueven dinero o mandan correo a
// terceros. El aislamiento por club va en el WHERE de cada consulta, no en una
// comprobación posterior.

// El barrido a mano y la reconciliación histórica. Literales, van primero.
router.post('/wallet/refresh', authMiddleware, requireSiteAdmin, refreshWallet);
router.post('/wallet/reconcile', authMiddleware, requireSiteAdmin, reconcileWallet);
// v4.886 — Marcar VARIOS aportes como desembolsados de una vez. Literal y con
// prefijo `/wallet/`, así que va con sus hermanas y por encima de cualquier
// paramétrica de `/payments/`.
// v4.887 — Lleva `comprobanteOpcional`: un giro que cubre varios aportes tiene
// UN soporte, y se sube una sola vez para las N filas.
router.post('/wallet/disbursements/bulk', authMiddleware, requireSiteAdmin, comprobanteOpcional, createBulkDisbursements);
// v4.996 — Lo que VA A PASAR con la selección, sin escribir nada: cuántos
// lotes, cuánto cada uno y por tanto cuántas notificaciones. La pantalla lo
// pinta junto al botón en vez de deducirlo por su cuenta.
router.post('/wallet/disbursements/bulk/preview', authMiddleware, requireSiteAdmin, previewBulkDisbursements);
// v4.996 — EL DESEMBOLSO AGRUPADO: la lista de lotes del sitio, la ficha de
// uno con sus aportes, el correo consolidado tal como saldría y el reintento
// de su ÚNICO aviso. Las literales van antes que la paramétrica.
router.get('/wallet/disbursement-batches', authMiddleware, requireSiteAdmin, listDisbursementBatches);
// ═══════════════════════════════════════════════════════════════════
// v4.1014 — LA CONCILIACIÓN DE UN TRASLADO YA EFECTUADO
//
// ⚠️ `/resolve` VA ANTES QUE `/:id`. Las dos tienen TRES segmentos, así que
// Express casaría «resolve» como el id de un lote y la petición caería en el
// manejador equivocado — sin 404 y sin ningún error: con la respuesta de otra
// cosa. Es el fallo mudo que `npm run check:routes` rompe el despliegue para
// impedir (v4.859).
//
// Ninguna de estas rutas mueve dinero: componen un documento y mandan un
// correo sobre un giro que ya ocurrió. Piden rol administrativo del sitio
// igual que sus hermanas —le mandan a un tercero los datos de los aportantes
// de una campaña— y el aislamiento por club va en el WHERE de cada consulta.
router.post('/wallet/disbursement-batches/resolve', authMiddleware, requireSiteAdmin, resolveTransfersForSelection);
router.get('/wallet/disbursement-batches/:id/notices', authMiddleware, requireSiteAdmin, getBatchNotices);
router.get('/wallet/disbursement-batches/:id/reconciliation', authMiddleware, requireSiteAdmin, getBatchReconciliation);
router.post('/wallet/disbursement-batches/:id/resend', authMiddleware, requireSiteAdmin, resendBatchReconciliation);
// El documento EXACTO que salió en un reenvío, con enlace firmado.
router.get('/wallet/notices/:id/document', authMiddleware, requireSiteAdmin, getNoticeDocument);
router.get('/wallet/disbursement-batches/:id/email-preview', authMiddleware, requireSiteAdmin, getDisbursementBatchEmailPreview);
router.post('/wallet/disbursement-batches/:id/notify', authMiddleware, requireSiteAdmin, retryDisbursementBatchNotice);
router.get('/wallet/disbursement-batches/:id', authMiddleware, requireSiteAdmin, getDisbursementBatch);

// v4.888 — El estado de la plantilla estándar de WhatsApp, y sembrarla.
// Consultarla la puede cualquier administrador de sitio —necesita saber por qué
// su aviso no salió—; crearla, sólo el operador: vive en el WABA de la
// plataforma, que es infraestructura compartida y el controlador lo comprueba.
router.get('/wallet/whatsapp-template', authMiddleware, requireSiteAdmin, getWhatsappTemplate);
router.post('/wallet/whatsapp-template', authMiddleware, requireSiteAdmin, seedWhatsappTemplate);

// Lo que la ficha de un aporte necesita: calendario, línea de tiempo,
// desembolsos y cuánto queda por desembolsar.
router.get('/payments/:id/lifecycle', authMiddleware, requireSiteAdmin, getLifecycle);

// Registrar el desembolso. Multipart cuando trae comprobante; el `upload` se
// carga PEREZOSAMENTE porque multer arrastra dependencias que no hacen falta en
// las otras cien rutas de la plataforma.
router.post('/payments/:id/disbursements', authMiddleware, requireSiteAdmin, comprobanteOpcional, createDisbursement);

// El comprobante, con enlace firmado y caducidad. Nunca la clave de S3.
router.get('/disbursements/:id/receipt', authMiddleware, requireSiteAdmin, getReceipt);
// Reintentar el aviso. El desembolso ya vale: lo que se reintenta es el correo.
router.post('/disbursements/:id/notify', authMiddleware, requireSiteAdmin, retryNotice);
// ⚠️ NO HAY `DELETE`. Corregir un desembolso es REVERSARLO, y el reverso se ve.
router.post('/disbursements/:id/reverse', authMiddleware, requireSiteAdmin, reverseDisbursement);

// v4.418 — DIAGNÓSTICO de email (super admin) para debuggear que el recibo no llega
router.get('/email-status', authMiddleware, getEmailDiagnostics);
router.post('/email-test', authMiddleware, sendTestEmail);

/**
 * ==========================================
 * FINANCIAL & DIAN REPORTS (TRANSPARENCIA)
 * ==========================================
 */

/**
 * GET /api/financial/reports
 */
router.get('/reports', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const reports = await prisma.financialReport.findMany({
            where: { clubId },
            orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
        });
        res.json(reports);
    } catch (error) {
        console.error('Error fetching financial reports:', error);
        res.status(500).json({ error: 'Error fetching financial reports' });
    }
});

/**
 * POST /api/financial/reports
 */
router.post('/reports', authMiddleware, async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { id, year, title, documentUrl, category, status } = req.body;

        const reportData = {
            year,
            title,
            documentUrl,
            category,
            status
        };

        let report;
        if (id) {
            report = await prisma.financialReport.update({
                where: { id },
                data: reportData
            });
        } else {
            report = await prisma.financialReport.create({
                data: {
                    ...reportData,
                    clubId
                }
            });
        }

        res.json(report);
    } catch (error) {
        console.error('Error saving financial report:', error);
        res.status(500).json({ error: 'Error saving financial report' });
    }
});

/**
 * DELETE /api/financial/reports/:id
 */
router.delete('/reports/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.financialReport.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting financial report:', error);
        res.status(500).json({ error: 'Error deleting financial report' });
    }
});

export default router;
