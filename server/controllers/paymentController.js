import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import EmailService from '../services/EmailService.js';
import DomainProvisioningService from '../services/DomainProvisioningService.js';

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
            case 'checkout.session.completed':
                const session = event.data.object;
                await handleSuccessfulCheckoutSession(session);
                break;
            case 'invoice.paid':
                const invoice = event.data.object;
                await handleSaaSReactivation(null, invoice.customer);
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

async function handleSuccessfulCheckoutSession(session) {
    console.log(`[Stripe Webhook] Checkout session completed: ${session.id}`);
    
    // 1. Pago de "Ecosistema Digital" (Provisión Automática)
    if (session.metadata && session.metadata.type === 'ecosystem_purchase') {
        const { clubId, domainName } = session.metadata;
        console.log(`[Stripe Webhook] Detonando provisión de Ecosistema para Club: ${clubId}, Dominio: ${domainName}`);
        try {
            await DomainProvisioningService.provisionEcosystem(clubId, domainName);
            console.log(`[Stripe Webhook] Provisión de dominio completada con éxito.`);
        } catch (error) {
            console.error(`[Stripe Webhook] ERROR en la provisión del dominio:`, error);
        }
    }

    // 2. FASE 10: Pago de Solicitud Técnica (Transferencia de Dominio, etc.)
    if (session.metadata && session.metadata.type === 'technical_service') {
        const { requestId, clubId } = session.metadata;
        console.log(`[Stripe Webhook] Pago recibido para Solicitud Técnica: ${requestId}`);
        
        try {
            const request = await prisma.technicalRequest.update({
                where: { id: requestId },
                data: {
                    paymentStatus: 'paid',
                    status: 'in_progress', // El equipo técnico ya puede empezar a trabajar
                    details: {
                        ...(await prisma.technicalRequest.findUnique({ where: { id: requestId } })).details,
                        paymentConfirmedAt: new Date().toISOString(),
                        stripeSessionId: session.id
                    }
                }
            });

            console.log(`✅ Solicitud Técnica ${requestId} marcada como PAGADA.`);
            
            // Aquí se dispararía n8n en el futuro
            // fetch('https://n8n.valkomen.com/webhook/technical-request-paid', { ... })
        } catch (error) {
            console.error(`[Stripe Webhook] ERROR al actualizar Solicitud Técnica:`, error);
        }
    }

    // 3. FASE 5: Reactivación Mágica (Renovación de Suscripción Anual)
    if (session.client_reference_id || session.customer) {
        await handleSaaSReactivation(session.client_reference_id, session.customer);
    }
}

async function handleSaaSReactivation(id, customerId) {
    let target = null;
    let type = null;

    // 1. Intentar buscar por ID (Club o Distrito)
    if (id) {
        target = await prisma.club.findUnique({ where: { id } });
        if (target) type = 'club';
        
        if (!target) {
            target = await prisma.district.findUnique({ where: { id } });
            if (target) type = 'district';
        }
    } 
    
    // 2. Intentar buscar por Stripe Customer ID si no se encontró por ID
    if (!target && customerId) {
        target = await prisma.club.findFirst({ where: { stripeCustomerId: customerId } });
        if (target) type = 'club';

        if (!target) {
            target = await prisma.district.findUnique({ where: { stripeCustomerId: customerId } });
            if (target) type = 'district';
        }
    }

    if (target && type) {
        console.log(`[Stripe Webhook] Renovación SaaS detectada para ${type === 'club' ? 'Club' : 'Distrito'}: ${target.name || target.number}`);
        
        const baseDate = (target.expirationDate && new Date(target.expirationDate) > new Date()) 
            ? new Date(target.expirationDate) 
            : new Date();
            
        const newExp = new Date(baseDate);
        newExp.setFullYear(newExp.getFullYear() + 1);
        
        const updateData = {
            subscriptionStatus: 'active',
            expirationDate: newExp,
            expirationBannerActive: false,
            stripeCustomerId: customerId || target.stripeCustomerId
        };

        if (type === 'club') {
            await prisma.club.update({ where: { id: target.id }, data: updateData });
        } else {
            await prisma.district.update({ where: { id: target.id }, data: updateData });
        }
        
        console.log(`✅ Plataforma de ${target.name || target.number} reactivada mágicamente (${type}) hasta ${newExp.toISOString()}`);
    } else {
        if (customerId || id) {
             console.log(`⚠️ [Stripe Webhook] Intento de reactivación (ID: ${id}, Customer: ${customerId}), pero no se pudo asociar a ninguna entidad.`);
        }
    }
}

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
                const primaryColor = club.colors?.primary || '#0B223F';
                
                let itemsHtml = order.items.map(i => `
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${i.title}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${i.qty}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${Number(i.total).toFixed(2)} ${order.currency.toUpperCase()}</td>
                    </tr>
                `).join('');

                const htmlBody = `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
                    <div style="background-color: ${primaryColor}; color: #ffffff; padding: 30px; text-align: center;">
                        ${club.logo ? `<img src="${club.logo}" alt="${club.name}" style="height: 60px; margin-bottom: 15px;" />` : ''}
                        <h2 style="margin: 0; color: #ffffff;">¡Gracias por tu apoyo, ${customerName}!</h2>
                    </div>
                    
                    <div style="padding: 30px;">
                        <p style="font-size: 16px; line-height: 1.5;">Hemos procesado tu pago exitosamente y tus aportes marcan una gran diferencia.</p>
                        
                        <h3 style="border-bottom: 2px solid ${primaryColor}; padding-bottom: 8px; margin-top: 30px; color: ${primaryColor};">Detalle del Recibo #${order.id.slice(-6).toUpperCase()}</h3>
                        
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 15px;">
                            <thead>
                                <tr style="background-color: #f9fafb; text-align: left;">
                                    <th style="padding: 10px; border-bottom: 2px solid #eaeaea;">Concepto</th>
                                    <th style="padding: 10px; border-bottom: 2px solid #eaeaea; text-align: center;">Cant.</th>
                                    <th style="padding: 10px; border-bottom: 2px solid #eaeaea; text-align: right;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="2" style="padding: 15px 10px; font-weight: bold; text-align: right; border-top: 2px solid #eaeaea;">Total General:</td>
                                    <td style="padding: 15px 10px; font-weight: bold; text-align: right; border-top: 2px solid #eaeaea; color: ${primaryColor}; font-size: 18px;">$${Number(order.total).toFixed(2)} ${order.currency.toUpperCase()}</td>
                                </tr>
                            </tfoot>
                        </table>
                        
                        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 40px;">Si tienes alguna duda sobre esta transacción, ponte en contacto con <strong>${club.name}</strong> respondiendo directamente a este correo.</p>
                    </div>
                    
                    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eaeaea;">
                        Este es un recibo automático emitido por Rotary ClubPlatform.
                    </div>
                </div>
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
