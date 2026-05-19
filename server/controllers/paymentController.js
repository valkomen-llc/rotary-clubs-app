import Stripe from 'stripe';
import EmailService from '../services/EmailService.js';
import DomainProvisioningService from '../services/DomainProvisioningService.js';

import prisma from '../lib/prisma.js';
const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.05; // 5% fee when using Valkomen's master account

// v4.411 — Remitente por defecto del recibo transaccional. Centralizado en
// Club Platform para entregabilidad. Reply-to apunta al club si tiene email
// configurado. Cada club podrá overridear este sender más adelante via
// PlatformConfig o un campo en NotificationConfig (out of scope hoy).
const PLATFORM_DONATION_SENDER = '"Club Platform for Rotary" <noreply@clubplatform.org>';

// v4.421 — Margen operativo de Club Platform: después de que Stripe libere
// el dinero (available_on), agregamos N días para conciliación + traslado
// financiero. El club no puede pedir retiro hasta este timestamp.
const PLATFORM_HOLDING_DAYS = 6;

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

    // 0. Donación pública (v4.409) — Maneras de Contribuir.
    //    Registra Payment + Donation directo, sin Order intermedio. El balance
    //    del club se recalcula automático vía /api/payouts/balance.
    if (session.metadata && session.metadata.type === 'donation') {
        await handleSuccessfulDonationCheckout(session);
        // No hacemos return — un mismo session.id no debería matchear otro flujo,
        // pero por seguridad seguimos al SaaS reactivation que es idempotente.
    }

    // 1. Pago de "Ecosistema Digital" (Provisión Automática)
    if (session.metadata && session.metadata.type === 'ecosystem_purchase') {
        const { clubId, domainName } = session.metadata;
        console.log(`[Stripe Webhook] Detonando provisión de Ecosistema para Club: ${clubId}, Dominio: ${domainName}`);
        try {
            // 1. Provision the domain
            await DomainProvisioningService.provisionEcosystem(clubId, domainName);
            console.log(`[Stripe Webhook] Provisión de dominio completada con éxito.`);

            // 2. Record Crowdfund Activation for Origen (if applicable)
            // Origen has the pool ID 'origen-pool-1' (from seed)
            const origenPool = await prisma.crowdfundPool.findUnique({
                where: { id: 'origen-pool-1' }
            });

            if (origenPool) {
                await prisma.crowdfundActivation.create({
                    data: {
                        poolId: origenPool.id,
                        targetClubId: clubId,
                        domainName: domainName,
                        status: 'active',
                        activationDate: new Date()
                    }
                });
                console.log(`[Stripe Webhook] Activación de Crowdfund registrada para Origen.`);
            }
        } catch (error) {
            console.error(`[Stripe Webhook] ERROR en la provisión o activación de Crowdfund:`, error);
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

// v4.409 — Donación pública vía Checkout Session (metadata.type='donation').
// Crea Payment (con isPlatformCollection=true para que el balance del club
// lo cuente) + Donation (para el historial visible en el panel del club).
// Idempotente: si la session ya fue procesada, no duplica registros.
async function handleSuccessfulDonationCheckout(session) {
    const { clubId, donorEmail, donorName, message, isAnonymous, projectId } = session.metadata || {};

    if (!clubId) {
        console.error('[Stripe Webhook] Donación sin clubId en metadata:', session.id);
        return;
    }

    const providerRef = session.payment_intent || session.id;

    // Idempotencia: si ya existe un Payment con este providerRef, salimos.
    const existing = await prisma.payment.findFirst({
        where: { providerRef, provider: 'stripe' },
        select: { id: true }
    });
    if (existing) {
        console.log(`[Stripe Webhook] Donación ya registrada para session ${session.id} (skip)`);
        return;
    }

    const totalAmount = (session.amount_total || 0) / 100;
    const currency = (session.currency || 'usd').toUpperCase();

    // Comisión Valkomen (5%). Fee de Stripe lo dejamos como ESTIMACIÓN por
    // si la llamada a balanceTransactions falla; si llega bien lo sobrescribimos
    // con el valor real.
    const applicationFee = totalAmount * DEFAULT_PLATFORM_FEE_PERCENTAGE;
    let estimatedStripeFee = (totalAmount * 0.029) + 0.30;
    let netAmount = Math.max(0, totalAmount - applicationFee - estimatedStripeFee);

    // v4.421 — Consultar Stripe balance transaction para datos reales.
    // available_on = cuándo Stripe libera el dinero (típicamente T+2 a T+7).
    // clubAvailableOn = available_on + PLATFORM_HOLDING_DAYS (margen Valkomen).
    let stripeBalanceTxId = null;
    let stripeStatus = 'pending';
    let availableOn = null;
    let clubAvailableOn = null;
    let paymentMethod = null;

    if (session.payment_intent) {
        try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
            const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
                expand: ['latest_charge.balance_transaction', 'latest_charge.payment_method_details']
            });
            const charge = pi.latest_charge;
            const bt = charge?.balance_transaction;

            if (charge?.payment_method_details?.type) {
                paymentMethod = charge.payment_method_details.type;
            }
            if (bt) {
                stripeBalanceTxId = bt.id;
                stripeStatus = bt.status || 'pending'; // 'available', 'pending'
                availableOn = bt.available_on ? new Date(bt.available_on * 1000) : null;
                if (availableOn) {
                    clubAvailableOn = new Date(availableOn.getTime() + PLATFORM_HOLDING_DAYS * 24 * 60 * 60 * 1000);
                }
                // Usamos el fee real de Stripe (no la estimación)
                if (typeof bt.fee === 'number') {
                    estimatedStripeFee = bt.fee / 100;
                    netAmount = Math.max(0, totalAmount - applicationFee - estimatedStripeFee);
                }
            }
        } catch (stripeErr) {
            console.error('[Stripe Webhook] No pude leer balance transaction (se usa estimación):', stripeErr?.message);
        }
    }

    try {
        await prisma.payment.create({
            data: {
                provider: 'stripe',
                providerRef,
                status: 'succeeded',
                amount: totalAmount,
                currency,
                applicationFee,
                netAmount,
                isPlatformCollection: true,
                clubId,
                stripeBalanceTxId,
                stripeStatus,
                availableOn,
                clubAvailableOn,
                paymentMethod,
                rawPayload: JSON.stringify({
                    sessionId: session.id,
                    mode: session.mode,
                    customerDetails: session.customer_details,
                    stripeBalanceTxId,
                    stripeFee: estimatedStripeFee
                })
            }
        });

        const isAnon = isAnonymous === 'true' || isAnonymous === true;
        const cleanProjectId = projectId && projectId !== '' ? projectId : null;
        const donation = await prisma.donation.create({
            data: {
                amount: totalAmount,
                currency,
                donorName: isAnon
                    ? 'Anónimo'
                    : (donorName || session.customer_details?.name || null),
                donorEmail: donorEmail || session.customer_details?.email || null,
                status: 'success',
                clubId,
                projectId: cleanProjectId, // v4.416 — donaciones asociadas a proyecto suman al recaudado del proyecto
                isAnonymous: isAnon,
                message: message || null
            }
        });

        // v4.416 — Si la donación va a un proyecto, actualizar contadores agregados
        // (project.recaudado + project.donantes) para que la UI pública del proyecto
        // refleje el progreso sin tener que recalcular cada vez.
        if (cleanProjectId) {
            try {
                await prisma.project.update({
                    where: { id: cleanProjectId },
                    data: {
                        recaudado: { increment: totalAmount },
                        donantes: { increment: 1 }
                    }
                });
            } catch (projErr) {
                console.error('[Stripe Webhook] No pude actualizar agregados del proyecto:', projErr);
            }
        }

        console.log(`[Stripe Webhook] ✅ Donación registrada: ${totalAmount} ${currency} → club ${clubId} (net ${netAmount.toFixed(2)})`);

        // v4.411 — Recibo transaccional por correo. Centralizado vía
        // EmailService.sendPlatformEmail (Resend → noreply@clubplatform.org).
        // Si falla, log y seguimos: el pago ya está acreditado.
        const recipientEmail = donorEmail || session.customer_details?.email;
        if (recipientEmail) {
            try {
                const [club, project] = await Promise.all([
                    prisma.club.findUnique({
                        where: { id: clubId },
                        select: { name: true, logo: true, colors: true, email: true, domain: true }
                    }),
                    cleanProjectId
                        ? prisma.project.findUnique({
                            where: { id: cleanProjectId },
                            select: { id: true, title: true, image: true, category: true }
                        })
                        : Promise.resolve(null)
                ]);
                const recipientName = isAnon
                    ? 'Donante anónimo'
                    : (donorName || session.customer_details?.name || 'amigo');
                const html = buildDonationReceiptHtml({
                    club,
                    project,
                    donation,
                    donorName: recipientName,
                    amount: totalAmount,
                    currency,
                    sessionId: session.id,
                    paymentIntentId: session.payment_intent,
                    message: message || null
                });

                const subjectTopic = project ? `proyecto "${project.title}"` : (club?.name || 'Rotary');
                // v4.418 — Logging detallado para diagnosticar por qué el recibo no llega.
                // El método devuelve { success, messageId?, error? } incluso cuando "falla"
                // graceful (sin throw). Necesitamos ver explícitamente el resultado.
                console.log(`[DONATION-EMAIL] Intentando enviar recibo a ${recipientEmail} (Resend key: ${process.env.RESEND_API_KEY ? 'SET' : 'NOT SET'})`);
                const emailResult = await EmailService.sendPlatformEmail({
                    to: recipientEmail,
                    subject: `Recibo de tu donación al ${subjectTopic}`,
                    html,
                    from: PLATFORM_DONATION_SENDER,
                    replyTo: club?.email || undefined
                });
                if (emailResult?.success) {
                    console.log(`[DONATION-EMAIL] ✉️  ✅ Recibo enviado a ${recipientEmail} (messageId: ${emailResult.messageId})${project ? ` proyecto ${project.id}` : ''}`);
                } else {
                    console.error(`[DONATION-EMAIL] ❌ Recibo NO enviado a ${recipientEmail}. Error:`, emailResult?.error || 'unknown');
                    console.error(`[DONATION-EMAIL] Sender: ${PLATFORM_DONATION_SENDER}, replyTo: ${club?.email || 'none'}, subject: ${subjectTopic}`);
                }
            } catch (emailErr) {
                console.error('[DONATION-EMAIL] 💥 Excepción enviando recibo de donación:', emailErr?.message || emailErr);
                console.error('[DONATION-EMAIL] Stack:', emailErr?.stack?.split('\n').slice(0, 5).join('\n'));
            }
        }
    } catch (err) {
        console.error('[Stripe Webhook] Error registrando donación:', err);
    }
}

// v4.411 — Template del recibo. Usa el branding del club (color primario, logo)
// con fallback a paleta Rotary. La referencia visible es donation.id (uuid
// corto) para el donante; los IDs internos de Stripe quedan en el pie por
// trazabilidad operacional.
function buildDonationReceiptHtml({ club, project, donation, donorName, amount, currency, sessionId, paymentIntentId, message }) {
    const primary = club?.colors?.primary || '#0B223F';
    const accent = club?.colors?.secondary || '#9D2235';
    const clubName = club?.name || 'Rotary';
    const fmtDate = new Date(donation.date).toLocaleString('es-CO', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Bogota'
    });
    const fmtAmount = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ref = donation.id.slice(-8).toUpperCase();
    const safeMessage = message ? String(message).replace(/</g, '&lt;').replace(/>/g, '&gt;') : null;
    const safeProjectTitle = project?.title ? String(project.title).replace(/</g, '&lt;').replace(/>/g, '&gt;') : null;

    return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 24px 0;">
    <div style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">
        <div style="background: ${primary}; color: #ffffff; padding: 36px 32px; text-align: center;">
            ${club?.logo ? `<img src="${club.logo}" alt="${clubName}" style="height: 56px; margin-bottom: 18px;" />` : ''}
            <div style="font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.75; margin-bottom: 8px;">Recibo de Donación</div>
            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff;">¡Gracias, ${donorName}!</h1>
        </div>

        <div style="padding: 32px;">
            <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                ${project
                    ? `Confirmamos tu aporte al proyecto <strong>"${safeProjectTitle}"</strong> de <strong>${clubName}</strong>. Tu contribución acerca esta iniciativa de impacto a su meta.`
                    : `Confirmamos que tu aporte a <strong>${clubName}</strong> fue procesado exitosamente. Tu apoyo sostiene las iniciativas de servicio que transforman vidas.`}
            </p>

            ${project ? `
            <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 14px;">
                ${project.image ? `<img src="${project.image}" alt="${safeProjectTitle}" style="width: 64px; height: 64px; border-radius: 10px; object-fit: cover; flex-shrink: 0;" />` : ''}
                <div>
                    ${project.category ? `<div style="font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: ${accent}; font-weight: 700; margin-bottom: 4px;">${project.category}</div>` : ''}
                    <div style="font-size: 15px; font-weight: 700; color: #1f2937; line-height: 1.3;">${safeProjectTitle}</div>
                </div>
            </div>` : ''}

            <div style="background: linear-gradient(135deg, ${accent}10, ${accent}20); border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
                <div style="font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Monto donado</div>
                <div style="font-size: 40px; font-weight: 800; color: ${accent}; line-height: 1;">
                    $${fmtAmount} <span style="font-size: 18px; font-weight: 700;">${currency}</span>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
                <tbody>
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Organización</td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${clubName}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Fecha y hora</td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${fmtDate}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Referencia</td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: 'SF Mono', Menlo, monospace; font-weight: 600; color: ${primary};">#${ref}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px 0; color: #6b7280;">Método de pago</td>
                        <td style="padding: 12px 0; text-align: right; font-weight: 600;">Stripe Checkout</td>
                    </tr>
                </tbody>
            </table>

            ${safeMessage ? `
            <div style="background: #f3f4f6; border-left: 3px solid ${accent}; padding: 14px 18px; border-radius: 6px; margin-bottom: 24px;">
                <div style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #6b7280; margin-bottom: 6px;">Tu mensaje al club</div>
                <p style="margin: 0; font-style: italic; color: #1f2937; line-height: 1.5;">"${safeMessage}"</p>
            </div>` : ''}

            <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 24px 0 0;">
                Este recibo sirve como comprobante de tu donación. Si necesitas un certificado tributario formal o tienes alguna pregunta sobre tu aporte, ponte en contacto directamente con <strong>${clubName}</strong>${club?.email ? ` respondiendo a este correo` : ''}.
            </p>
        </div>

        <div style="background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e5e7eb;">
            Recibo automático emitido por <strong>Club Platform</strong> en nombre de ${clubName}.<br>
            <span style="font-family: 'SF Mono', Menlo, monospace; font-size: 11px; color: #cbd5e1;">tx: ${(paymentIntentId || sessionId || '').slice(-16)}</span>
        </div>
    </div>
</div>`;
}
