import express from 'express';
import { createPaymentIntent } from '../controllers/paymentController.js';
import { paypalWebhook } from '../controllers/paypalController.js';

const router = express.Router();

// Create a PaymentIntent for a specific order
router.post('/create-intent', createPaymentIntent);

// v4.866 — El webhook de PayPal. A diferencia del de Stripe NO necesita el
// cuerpo crudo: PayPal verifica la firma mandándole el evento ya parseado a su
// propio endpoint (`/v1/notifications/verify-webhook-signature`), así que el
// parser normal de `api/index.js` sirve.
//
// Es la CONFIRMACIÓN de verdad del aporte: el retorno del navegador puede no
// ocurrir —el donante cierra la pestaña— y las dos vías convergen en el mismo
// registro idempotente.
router.post('/paypal/webhook', paypalWebhook);

// Note: the Stripe webhook is handled directly in api/index.js to parse raw body

export default router;
