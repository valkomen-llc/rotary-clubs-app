import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import EmailService from '../services/EmailService.js';

const prisma = new PrismaClient();
const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.05; // 5% fee when using Valkomen's master account

// Helper to get correct Stripe instance based on Club config
const getStripeConfig = async (clubId) => {
    const config = await prisma.paymentProviderConfig.findUnique({
        where: { provider_clubId: { provider: 'stripe', clubId } }
    });

    if (config && config.enabled && config.secretRef) {
        // Club has its own Stripe account configured
        return {
            stripe: new Stripe(config.secretRef),
            isMaster: false
        };
    }

    // Fallback to Valkomen's master account
    return {
        stripe: new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345'),
        isMaster: true
    };
};

export const createPaymentIntent = async (req, res) => {
    try {
        const { orderId, clubId } = req.body;

        if (!orderId || !clubId) {
            return res.status(400).json({ error: 'orderId and clubId are required' });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true, club: true }
        });

        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status !== 'pending') return res.status(400).json({ error: `Order is already ${order.status} ` });

        const amountInCents = Math.round(order.total * 100);
        const { stripe: dynamicStripe, isMaster } = await getStripeConfig(clubId);

        // Calculate application fee for Valkomen if using Master Account
        const applicationFee = isMaster ? order.total * DEFAULT_PLATFORM_FEE_PERCENTAGE : 0;
        // Approximation of standard Stripe Fee (2.9% + 0.30)
        const estimatedStripeFee = (order.total * 0.029) + 0.30;
        const netAmount = order.total - applicationFee - estimatedStripeFee;

        const paymentIntent = await dynamicStripe.paymentIntents.create({
            amount: amountInCents,
            currency: order.currency.toLowerCase(),
            metadata: {
                orderId: order.id,
                clubId: order.clubId,
                customerEmail: order.customerEmail,
                customerName: order.customerName,
                isMasterAccount: isMaster ? 'true' : 'false'
            },
        });

        await prisma.payment.create({
            data: {
                provider: 'stripe',
                providerRef: paymentIntent.id,
                status: 'pending',
                amount: order.total,
                currency: order.currency,
                applicationFee,
                netAmount: Math.max(0, netAmount),
                isPlatformCollection: isMaster,
                orderId: order.id,
                clubId: order.clubId,
            }
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('Error in createPaymentIntent:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const stripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];

    // We try to verify the webhook event globally using the master webhook secret
    // (Assuming clubs who connect their own keys would either use Stripe Connect,
    // or we may need a robust mechanism to map their custom webhook secrets later.
    // For now, MVP assumes Valkomen webhooks for everything, or we dynamically grab it).
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Instancia global default provisionalmente para parsear, u obtener
        // la cuenta correcta. Stripe webhook library no requiere el API secret para verificar
        // sino el Stripe-Signature + body raw + EndpointSecret
        const stripeGlobal = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
        event = stripeGlobal.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message} `);
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                await handleSuccessfulPayment(paymentIntent);
                break;
            case 'payment_intent.payment_failed':
                const failedIntent = event.data.object;
                await handleFailedPayment(failedIntent);
                break;
            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Error handling webhook event:', error);
        res.status(500).json({ error: 'Webhook handler error' });
    }
};

async function handleSuccessfulPayment(paymentIntent) {
    const { orderId, clubId, customerEmail, customerName } = paymentIntent.metadata;

    if (!orderId) {
        console.error('Payment succeeded but no orderId found in metadata', paymentIntent.id);
        return;
    }

    await prisma.payment.updateMany({
        where: { providerRef: paymentIntent.id, provider: 'stripe' },
        data: {
            status: 'succeeded',
            rawPayload: JSON.stringify(paymentIntent)
        }
    });

    const order = await prisma.order.update({
        where: { id: orderId },
        data: { status: 'paid' },
        include: { items: true }
    });

    for (const item of order.items) {
        if (item.type === 'donation' || item.type === 'project_donation') {
            const metadata = item.metadata ? JSON.parse(item.metadata) : {};
            await prisma.donation.create({
                data: {
                    amount: item.total,
                    currency: order.currency,
                    donorName: customerName,
                    donorEmail: customerEmail,
                    status: 'success',
                    clubId: order.clubId,
                    projectId: item.projectId || null,
                    message: metadata.message || null,
                    isAnonymous: metadata.isAnonymous || false,
                    orderId: order.id,
                }
            });
        }
    }

    // Preparar y Enviar el Recibo Confirmatorio por Correo usando el Módulo CRM Transaccional
    if (customerEmail && clubId) {
        try {
            const club = await prisma.club.findUnique({ where: { id: clubId } });
            if (club) {
                let itemsHtml = order.items.map(i => `
    < tr >
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${i.title}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${i.quantity}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${(i.total).toFixed(2)} ${order.currency.toUpperCase()}</td>
                    </tr >
    `).join('');

                const htmlBody = `
    < div style = "font-family: Arial, sans-serif; color: #333; max-w-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden;" >
                        <div style="background-color: #013388; color: #fff; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">¡Gracias por tu apoyo, ${customerName}!</h2>
                        </div>
                        <div style="padding: 20px;">
                            <p>Hemos procesado tu pago exitosamente y tus aportes marcan una gran diferencia.</p>
                            <h3 style="border-bottom: 2px solid #013388; padding-bottom: 5px;">Detalle del Recibo #${order.id.slice(-6).toUpperCase()}</h3>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                <thead>
                                    <tr style="background-color: #f9f9f9; text-align: left;">
                                        <th style="padding: 8px;">Concepto</th>
                                        <th style="padding: 8px; text-align: center;">Cant.</th>
                                        <th style="padding: 8px; text-align: right;">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="2" style="padding: 8px; font-weight: bold; text-align: right;">Total General:</td>
                                        <td style="padding: 8px; font-weight: bold; text-align: right;">$${order.totalAmount.toFixed(2)} ${order.currency.toUpperCase()}</td>
                                    </tr>
                                </tfoot>
                            </table>
                            <p style="font-size: 13px; color: #777;">Si tienes alguna duda sobre esta transacción, ponte en contacto con <strong>${club.name}</strong> respondiendo este correo.</p>
                        </div>
                        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 11px; color: #888;">
                            Este es un recibo automático emitido por nuestra plataforma.
                        </div>
                    </div >
    `;

                await EmailService.sendEmail({
                    clubId: clubId,
                    to: customerEmail,
                    subject: 'Recibo Confirmatorio - ' + club.name,
                    html: htmlBody,
                    userId: null
                });
            }
        } catch (e) {
            console.error('Error sending confirmation email:', e);
        }
    }
}

async function handleFailedPayment(paymentIntent) {
    const { orderId } = paymentIntent.metadata;

    if (orderId) {
        await prisma.payment.updateMany({
            where: { providerRef: paymentIntent.id },
            data: {
                status: 'failed',
                rawPayload: JSON.stringify(paymentIntent)
            }
        });
    }
}
