import Stripe from 'stripe';
import EmailService from '../services/EmailService.js';
import DomainProvisioningService from '../services/DomainProvisioningService.js';

import prisma from '../lib/prisma.js';
import { ensureWalletSchema } from '../lib/ensureWalletSchema.js';
import { stripeFeeInChargeCurrency } from '../lib/paymentTrace.js';
import { trmForDate } from '../lib/trm.js';
import { fromStripeAmount } from '../lib/money.js';
import { postDonation } from '../lib/ledger.js';
import { platformFee, estimatedProcessorFee } from '../lib/feeRules.js';
import { getFeeRules } from '../lib/feeRulesStore.js';
// v4.855 — La bitácora de notificaciones. Nada de acá lanza: corre dentro del
// webhook de Stripe, después de acreditar el cobro.
import { claimDelivery, markSent, markFailed } from '../lib/notificationLog.js';

// La comisión de la plataforma por recaudar a través de la cuenta maestra.
//
// v4.841 — NO es una tasa de cambio ni una comisión interbancaria, y conviene
// que quede escrito porque se pidió renombrarla así: se cobra también sobre un
// aporte en dólares que no pasa por ninguna conversión. El costo REAL de
// conversión existe —lo cobra Stripe al liquidar en otra moneda— y hoy no se
// modela en ninguna parte; separarlo de esto sigue pendiente.
//
// v4.854 — El número ya NO está escrito acá. Estaba duplicado en cinco sitios y
// el comentario que lo decía llevaba versiones pidiendo que se unificara: vive
// en `feeRules.js`, se configura por moneda y por sitio desde el panel, y el
// valor por defecto es el 5 % de siempre, así que desplegar no movió ninguna
// cifra. También sale de ahí el ESTIMADO del procesador, que hasta v4.853 era
// `(total * 0.029) + 0.30` para toda moneda — con el 0,30 de DÓLARES aplicado a
// un cobro en pesos.

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
        const reglas = await getFeeRules();
        const applicationFee = isMaster
            ? platformFee(order.total, { rules: reglas, currency: order.currency, clubId })
            : 0;
        const estimatedStripeFee = estimatedProcessorFee(order.total, { rules: reglas, currency: order.currency });
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
                await routeProjectFairEvent(event, 'failed');
                await routeEventRegistration(event, 'failed');
                break;
            case 'checkout.session.completed':
                const session = event.data.object;
                await handleSuccessfulCheckoutSession(session, event);
                break;
            // v4.598 — Desenlaces del pago de la Feria de Proyectos. La fuente
            // de verdad es el webhook, no el retorno del navegador.
            case 'checkout.session.expired':
                await routeProjectFairEvent(event, 'expired');
                await routeEventRegistration(event, 'expired');
                break;
            case 'charge.refunded':
                await routeProjectFairEvent(event, 'refunded');
                await routeEventRegistration(event, 'refunded');
                break;
            case 'invoice.paid':
                const invoice = event.data.object;
                await handleSaaSReactivation(null, invoice.customer);
                // Fase 2: registrar pago de membresía recurrente (inicial + renovaciones).
                await handleSubscriptionInvoicePaid(invoice);
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

// v4.598 — Enruta los eventos de Stripe que pertenecen a una postulación de la
// Feria de Proyectos. Registra primero el evento crudo (idempotencia por
// event.id) y sólo entonces aplica el cambio de estado.
async function routeProjectFairEvent(event, kind) {
    const object = event?.data?.object || {};
    const isProjectFair =
        object?.metadata?.type === 'project_fair_registration' ||
        !!object?.metadata?.submissionId;

    // charge.refunded no siempre trae metadata propia: se resuelve por sus
    // identificadores dentro del controlador de la feria.
    if (!isProjectFair && kind !== 'refunded') return;

    try {
        const mod = await import('./projectFairController.js');
        const fresh = await mod.recordStripeEvent(event, object?.metadata?.submissionId || null);
        if (!fresh) return; // ya procesado

        if (kind === 'failed') await mod.handlePaymentFailed(object);
        else if (kind === 'expired') await mod.handleCheckoutExpired(object);
        else if (kind === 'refunded') await mod.handleRefund(object);
    } catch (error) {
        console.error(`[Stripe Webhook] ERROR procesando evento de Feria de Proyectos (${kind}):`, error?.message);
    }
}

// v4.606 — Desenlaces del pago de un registro a un evento (fallido, expirado
// o reembolsado). Sólo actúa sobre los eventos de Stripe que traen la
// inscripción en su metadata; `charge.refunded` se resuelve por PaymentIntent
// dentro del propio controlador.
//
// v4.648 — Se le pasa el `event` completo, no sólo el objeto: el controlador
// guarda `event.id` en `EventRegistrationPayment` con índice único, y de ahí
// sale la idempotencia. Si Stripe reenvía el mismo evento, el segundo INSERT
// no entra y el estado no se vuelve a aplicar.
async function routeEventRegistration(event, kind) {
    const object = event?.data?.object || {};
    const isRegistration = object?.metadata?.type === 'event_registration' || !!object?.metadata?.registrationId;
    if (!isRegistration && kind !== 'refunded') return;

    try {
        const mod = await import('./eventRegistrationController.js');
        await mod.applyStripeStatus(object, kind, event);
    } catch (error) {
        console.error(`[Stripe Webhook] ERROR procesando registro de evento (${kind}):`, error?.message);
    }
}

async function handleSuccessfulCheckoutSession(session, event = null) {
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

    // 2.b v4.592 — Inscripción de proyecto a la Feria de Proyectos Rotary
    //     Colombia. Marca la inscripción como "Pago Confirmado", guarda la
    //     referencia de la transacción y envía el comprobante. Idempotente.
    if (session.metadata && session.metadata.type === 'project_fair_registration') {
        try {
            const mod = await import('./projectFairController.js');
            // Idempotencia por event.id: si Stripe reenvía el mismo evento, no
            // se vuelve a procesar ni se duplican registros.
            if (event) {
                const fresh = await mod.recordStripeEvent(event, session.metadata.submissionId || null);
                if (!fresh) return;
            }
            await mod.confirmPaidSession(session);
        } catch (error) {
            console.error('[Stripe Webhook] ERROR confirmando inscripción de Feria de Proyectos:', error);
        }
    }

    // 2.c v4.606 — Registro de asistentes a un evento. Confirma la inscripción,
    //     le asigna su código y envía el comprobante. Idempotente por partida
    //     doble: el evento de Stripe se guarda con id único y el UPDATE sólo
    //     toca filas que aún no están liquidadas, así que un reenvío de Stripe
    //     no vuelve a notificar ni a ocupar cupo (v4.648).
    if (session.metadata && session.metadata.type === 'event_registration') {
        try {
            const mod = await import('./eventRegistrationController.js');
            await mod.confirmPaidSession(session, event);
        } catch (error) {
            console.error('[Stripe Webhook] ERROR confirmando registro de evento:', error);
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
            // v4.563 — la reactivación por pago también levanta `status` (un sitio
            // suspendido por el cron queda 'inactive'); sin esto, el sitio pagaba
            // pero seguía suspendido y el módulo de capacitaciones lo bloqueaba.
            status: 'active',
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
// Fase 2 — Registra el cobro de una membresía recurrente (invoice.paid de Stripe),
// tanto el pago inicial como cada renovación. Idempotente por providerRef.
// Filtra por metadata.type === 'membership_subscription' para no tocar los
// invoices de facturación SaaS de la plataforma.
async function handleSubscriptionInvoicePaid(invoice) {
    try {
        if (!invoice || !invoice.subscription) return;

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const md = (sub && sub.metadata) || {};
        if (md.type !== 'membership_subscription' || !md.clubId) return;

        const providerRef = invoice.payment_intent || invoice.charge || invoice.id;

        const existing = await prisma.payment.findFirst({
            where: { providerRef, provider: 'stripe' },
            select: { id: true }
        });
        if (existing) {
            console.log(`[Stripe Webhook] Membresía recurrente ya registrada (skip) invoice ${invoice.id}`);
            return;
        }

        const totalAmount = (invoice.amount_paid || 0) / 100;
        if (totalAmount <= 0) return;
        const currency = (invoice.currency || 'usd').toUpperCase();
        const reglas = await getFeeRules();
        const applicationFee = platformFee(totalAmount, { rules: reglas, currency, clubId: md.clubId });
        const estimatedStripeFee = estimatedProcessorFee(totalAmount, { rules: reglas, currency });
        const netAmount = Math.max(0, totalAmount - applicationFee - estimatedStripeFee);

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
                clubId: md.clubId,
                rawPayload: JSON.stringify({
                    invoiceId: invoice.id,
                    subscription: invoice.subscription,
                    blockId: md.blockId,
                    interval: md.interval,
                    billingReason: invoice.billing_reason,
                })
            }
        });

        await prisma.donation.create({
            data: {
                amount: totalAmount,
                currency,
                donorName: invoice.customer_name || null,
                donorEmail: invoice.customer_email || null,
                status: 'success',
                clubId: md.clubId,
                isAnonymous: false,
                message: `Membresía recurrente (${md.interval || ''}) — ${md.blockTitle || ''}`.trim()
            }
        });

        console.log(`[Stripe Webhook] Membresía recurrente registrada: club ${md.clubId} $${totalAmount} (${invoice.billing_reason})`);
    } catch (err) {
        console.error('[Stripe Webhook] Error registrando invoice de suscripción:', err?.message);
    }
}

async function handleSuccessfulDonationCheckout(session) {
    const { clubId, donorEmail, donorName, message, isAnonymous, projectId } = session.metadata || {};

    if (!clubId) {
        console.error('[Stripe Webhook] Donación sin clubId en metadata:', session.id);
        return;
    }

    const providerRef = session.payment_intent || session.id;

    // El índice único que sostiene la idempotencia. Cacheado: una consulta al
    // catálogo por arranque en frío, no por webhook.
    await ensureWalletSchema();

    // Lectura previa: evita el trabajo —consultar Stripe, escribir la
    // donación— cuando el evento ya se procesó. NO es la protección: ésa la da
    // el índice único al insertar. Ver el `catch (dup)` de más abajo.
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

    // La retención de la plataforma, según la regla vigente para esta moneda y
    // este sitio. El del procesador se deja como ESTIMACIÓN por si la llamada a
    // balanceTransactions falla; si llega bien se sobrescribe con el real.
    const reglas = await getFeeRules();
    const applicationFee = platformFee(totalAmount, { rules: reglas, currency, clubId });
    let estimatedStripeFee = estimatedProcessorFee(totalAmount, { rules: reglas, currency });
    let netAmount = Math.max(0, totalAmount - applicationFee - estimatedStripeFee);

    // v4.421 — Consultar Stripe balance transaction para datos reales.
    // available_on = cuándo Stripe libera el dinero (típicamente T+2 a T+7).
    // clubAvailableOn = available_on + PLATFORM_HOLDING_DAYS (margen Valkomen).
    let stripeBalanceTxId = null;
    let stripeStatus = 'pending';
    let availableOn = null;
    let clubAvailableOn = null;
    let paymentMethod = null;
    let datosTarjeta = null;   // v4.844 — marca, últimos 4 y billetera
    let receiptUrl = null;     // v4.844 — el recibo de Stripe, tal cual
    let receiptNumber = null;
    let detalleComision = null;  // v4.845 — importe original, moneda y tasa

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
            // v4.844 — Lo que hace falta para escribir la traza como la escribe
            // el recibo de Stripe: la marca de la tarjeta, sus últimos cuatro
            // dígitos, la billetera si la hubo y el enlace al recibo. NUNCA
            // nada más de la tarjeta: los cuatro últimos son lo que se puede
            // mostrar y lo que basta para reconocer un cobro.
            const card = charge?.payment_method_details?.card;
            if (card) {
                datosTarjeta = {
                    brand: card.brand || '',
                    last4: card.last4 || '',
                    wallet: card.wallet?.type || '',
                };
            }
            if (charge?.receipt_url) receiptUrl = charge.receipt_url;
            if (charge?.receipt_number) receiptNumber = charge.receipt_number;

            if (bt) {
                stripeBalanceTxId = bt.id;
                stripeStatus = bt.status || 'pending'; // 'available', 'pending'
                availableOn = bt.available_on ? new Date(bt.available_on * 1000) : null;
                if (availableOn) {
                    clubAvailableOn = new Date(availableOn.getTime() + PLATFORM_HOLDING_DAYS * 24 * 60 * 60 * 1000);
                }
                // v4.845 — La comisión REAL de Stripe, convertida a la moneda
                // del cobro.
                //
                // Hasta v4.844 esto era `bt.fee / 100` y el resultado se
                // restaba del bruto sin mirar en qué moneda venía. El
                // `balance transaction` se denomina en la moneda de
                // LIQUIDACIÓN de la cuenta: sobre el aporte de 50.000 COP del
                // Distrito, Stripe cobró 1,16 USD y el código le descontó 1,16
                // PESOS. El neto que la pantalla le prometía al club estaba
                // calculado restando dólares a pesos.
                //
                // `bt.fee` está en la unidad mínima de la moneda del BALANCE
                // TRANSACTION, no del cobro: por eso `fromStripeAmount` recibe
                // `bt.currency` y no `currency`.
                // La TRM del día del cobro. Es una consulta de red dentro del
                // webhook, así que `trmForDate` nunca lanza: sin tasa se cae a
                // la de Stripe y el aporte se registra igual.
                const trm = await trmForDate(charge?.created ? charge.created * 1000 : Date.now());
                const comision = stripeFeeInChargeCurrency({
                    fee: fromStripeAmount(bt.fee, bt.currency),
                    feeCurrency: bt.currency,
                    chargeCurrency: currency,
                    exchangeRate: bt.exchange_rate,
                    trm,
                });

                if (comision.amount !== null) {
                    estimatedStripeFee = comision.amount;
                    netAmount = Math.max(0, totalAmount - applicationFee - estimatedStripeFee);
                    detalleComision = comision;
                } else {
                    // Sin tasa no se convierte NI se resta el número crudo: se
                    // conserva la estimación y se anota el motivo. Un neto
                    // calculado restando otra moneda es peor que uno estimado.
                    detalleComision = comision;
                    console.warn(
                        `[Stripe Webhook] Comisión en ${bt.currency} sobre un cobro en ${currency} ` +
                        `y sin tasa de cambio (${comision.reason}): se conserva la estimación.`
                    );
                }
            }
        } catch (stripeErr) {
            console.error('[Stripe Webhook] No pude leer balance transaction (se usa estimación):', stripeErr?.message);
        }
    }

    try {
        // v4.841 — La inserción es la que decide si este aporte ya estaba
        // registrado, no la lectura de arriba. Entre aquella consulta y esta
        // línea caben dos entregas concurrentes del mismo evento —Stripe
        // reintenta— y el resultado sería el aporte contado dos veces. El
        // índice único `Payment_provider_providerRef_key` lo hace imposible;
        // acá sólo se atrapa el choque y se sale en silencio, que es lo que
        // significa: alguien más ya lo registró.
        //
        // Si el índice todavía no existe —hay `providerRef` repetidos de antes
        // y `ensureWalletSchema` no lo pudo crear— esto no lanza y seguimos
        // con la protección que había. Degradar no empeora nada.
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
                    // v4.844 — La traza que la ficha del aportante necesita
                    // para responder de dónde vino el aporte y cómo se pagó.
                    // Va acá y no en columnas nuevas de Prisma a propósito:
                    // `Payment` y `Donation` se consultan con `findMany` sin
                    // `select` en media plataforma, así que una columna
                    // declarada y todavía inexistente en la base dejaría esas
                    // consultas en 500 hasta que alguien corriera `db:push`.
                    // Es la regla de `logo_intl` (v4.699), y acá caería sobre
                    // el cobro. `rawPayload` es texto con JSON libre.
                    rawPayload: JSON.stringify({
                        sessionId: session.id,
                        mode: session.mode,
                        customerDetails: session.customer_details,
                        stripeBalanceTxId,
                        stripeFee: estimatedStripeFee,
                        // De dónde vino
                        campaignId: session.metadata?.campaignId || null,
                        campaignSlug: session.metadata?.campaignSlug || null,
                        purpose: session.metadata?.purpose || null,
                        blockId: session.metadata?.blockId || null,
                        projectId: session.metadata?.projectId || null,
                        // Cómo se pagó y dónde está su recibo
                        card: datosTarjeta,
                        receiptUrl,
                        receiptNumber,
                        // De dónde salió la comisión de Stripe: su importe
                        // original, en qué moneda vino y con qué tasa se
                        // convirtió. Sin esto, «¿por qué la comisión de este
                        // aporte son 4.750 pesos?» no se puede contestar.
                        stripeFeeOriginal: detalleComision?.original || null,
                        stripeFeeRate: detalleComision?.rate ?? null,
                        stripeFeeRateSource: detalleComision?.rateSource || null,
                        stripeFeeRateDate: detalleComision?.rateDate || null,
                        stripeFeeRateOfficial: !!detalleComision?.rateOfficial,
                        stripeFeeConverted: detalleComision?.converted ?? false,
                        stripeFeeIssue: detalleComision?.amount === null ? (detalleComision?.reason || null) : null,
                    })
                }
            });
        } catch (dup) {
            if (dup?.code === 'P2002') {
                console.log(`[Stripe Webhook] Donación ya registrada (choque de índice) para ${providerRef} — se sale sin duplicar`);
                return;
            }
            throw dup;
        }

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

        // v4.844 — Se ata el aporte a su pago. Va DESPUÉS de crear los dos y no
        // al revés: el pago es el que lleva la restricción de unicidad que
        // impide registrar el mismo cobro dos veces, así que tiene que
        // insertarse primero. Creando la donación antes, un choque del índice
        // dejaría un aporte huérfano —visible en la ficha, sin dinero detrás—.
        //
        // El vínculo existe sólo de acá en adelante. Los aportes anteriores se
        // emparejan por heurística al leerlos, y la ficha DICE cuál de los dos
        // fue: una coincidencia deducida no puede presentarse como un hecho.
        try {
            const fila = await prisma.payment.findFirst({
                where: { providerRef, provider: 'stripe' },
                select: { id: true, rawPayload: true },
            });
            if (fila) {
                const payload = JSON.parse(fila.rawPayload || '{}');
                payload.donationId = donation.id;
                await prisma.payment.update({ where: { id: fila.id }, data: { rawPayload: JSON.stringify(payload) } });
            }
        } catch (linkErr) {
            // Sin el vínculo la ficha cae en la heurística, que es lo que hace
            // con todo lo anterior. No se toca un pago ya acreditado por esto.
            console.warn('[Stripe Webhook] No pude atar el aporte a su pago:', linkErr?.message);
        }

        // v4.847 — EL LIBRO MAYOR, EN SOMBRA. Se asienta el aporte con sus dos
        // retenciones; nadie lo lee todavía. Va DESPUÉS de acreditar el cobro y
        // sin `await` que pueda romperlo: `postDonation` nunca lanza y devuelve
        // el motivo. Un aporte que se perdiera porque falló su asiento sería
        // cambiar un problema de auditoría por uno de dinero.
        //
        // `sourceRef` es el `providerRef`, que es el mismo con el que Stripe
        // identifica el cobro: si reentrega el evento, el índice único del
        // libro rechaza el segundo asiento igual que lo hace el de `Payment`.
        const asiento = await postDonation({
            clubId,
            currency,
            gross: totalAmount,
            processorFee: estimatedStripeFee,
            platformFee: applicationFee,
            // La distinción que pide el rediseño: lo que dijo Stripe es un
            // hecho; lo que calculamos con su tarifa publicada porque la
            // consulta falló es una cuenta nuestra, y se marca como tal.
            processorFeeBasis: detalleComision?.amount != null ? 'real' : 'estimado',
            processorFeeMeta: detalleComision ? {
                original: detalleComision.original || null,
                rate: detalleComision.rate ?? null,
                rateSource: detalleComision.rateSource || null,
                rateDate: detalleComision.rateDate || null,
                rateOfficial: !!detalleComision.rateOfficial,
                rateKind: detalleComision.rateKind || null,
            } : { estimacion: 'tarifa publicada de Stripe (2,9% + 0,30)' },
            sourceRef: providerRef,
            occurredAt: new Date(),
            meta: { sessionId: session.id, donationId: donation.id, stripeBalanceTxId },
        });
        if (!asiento.ok) {
            console.warn(`[LEDGER] el aporte ${providerRef} quedó sin asentar (${asiento.reason})`);
        }

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

        // v4.807 — Atribución de Campañas de Contribución. La metadata la puso
        // createDonationCheckout tras validar la campaña; acá sólo se cuenta.
        // El modelo Donation NO se toca: la métrica vive en su propia tabla.
        // Un fallo contando no puede afectar un pago ya acreditado.
        if (session.metadata?.campaignId) {
            try {
                const { bumpMetric } = await import('./contributionCampaignController.js');
                await bumpMetric({
                    campaignId: session.metadata.campaignId,
                    clubId,
                    type: 'donation_completed',
                    amount: totalAmount,
                    currency,
                });
            } catch (metricErr) {
                console.warn('[Stripe Webhook] métrica de campaña no registrada:', metricErr?.message);
            }
        }

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
                    message: message || null,
                    // v4.808 — a QUÉ aportó: la campaña o el bloque de
                    // aportes. Lo resolvió el servidor al crear la sesión.
                    purpose: session.metadata?.purpose || null
                });

                const purposeTopic = session.metadata?.purpose || null;
                const subjectTopic = project
                    ? `proyecto "${project.title}"`
                    : (purposeTopic || club?.name || 'Rotary');
                // v4.418 — Logging detallado para diagnosticar por qué el recibo no llega.
                // El método devuelve { success, messageId?, error? } incluso cuando "falla"
                // graceful (sin throw). Necesitamos ver explícitamente el resultado.
                console.log(`[DONATION-EMAIL] Intentando enviar recibo a ${recipientEmail} (Resend key: ${process.env.RESEND_API_KEY ? 'SET' : 'NOT SET'})`);

                // v4.855 — LA TRAZA. Se RECLAMA el envío antes de mandarlo, no
                // se anota después: el índice único sobre (contribución +
                // evento + destinatario) es lo que impide que dos entregas
                // concurrentes del mismo webhook manden dos recibos a la misma
                // persona. Anotarlo después dejaría esa puerta abierta —es el
                // mismo razonamiento del índice de `Payment` unas líneas
                // arriba, en este mismo webhook.
                //
                // Si el reclamo no se puede hacer —la tabla todavía no existe,
                // la base no responde—, el recibo SE MANDA IGUAL. Lo que se
                // pierde es su rastro, y quedarse sin recibo por no poder
                // anotarlo sería cambiar un problema de auditoría por uno de
                // servicio.
                const asunto = `Recibo de tu donación al ${subjectTopic}`;
                const traza = await claimDelivery({
                    contributionId: donation.id,
                    event: 'payment_confirmed',
                    recipient: recipientEmail,
                    recipientKind: 'donor',
                    clubId,
                    campaignId: session.metadata?.campaignId || null,
                    provider: 'resend',
                    fromAddress: 'noreply@clubplatform.org',
                    subject: asunto,
                });
                // Alguien más ya reclamó este envío: es exactamente el
                // duplicado que el registro existe para impedir. Se marca con
                // una bandera y NO con un `return`, que saldría de la función
                // entera y dejaría fuera cualquier paso que se agregue
                // después de este bloque.
                const yaEnviado = traza.ok && !traza.claimed;
                if (!traza.ok) {
                    console.warn(`[DONATION-EMAIL] el recibo no se pudo registrar (${traza.reason}); se envía igual`);
                } else if (yaEnviado) {
                    console.log(`[DONATION-EMAIL] recibo ya enviado para ${donation.id} (${traza.reason}) — no se repite`);
                }

                const emailResult = yaEnviado ? null : await EmailService.sendPlatformEmail({
                    to: recipientEmail,
                    subject: asunto,
                    html,
                    from: PLATFORM_DONATION_SENDER,
                    replyTo: club?.email || undefined
                });
                if (yaEnviado) {
                    // Nada que registrar: la fila ya cuenta lo que pasó.
                } else if (emailResult?.success) {
                    console.log(`[DONATION-EMAIL] ✉️  ✅ Recibo enviado a ${recipientEmail} (messageId: ${emailResult.messageId})${project ? ` proyecto ${project.id}` : ''}`);
                    if (traza.delivery?.id) {
                        await markSent(traza.delivery.id, { providerMessageId: emailResult.messageId || null });
                    }
                } else {
                    console.error(`[DONATION-EMAIL] ❌ Recibo NO enviado a ${recipientEmail}. Error:`, emailResult?.error || 'unknown');
                    console.error(`[DONATION-EMAIL] Sender: ${PLATFORM_DONATION_SENDER}, replyTo: ${club?.email || 'none'}, subject: ${subjectTopic}`);
                    if (traza.delivery?.id) {
                        // `retryable: true` porque `sendPlatformEmail` no
                        // distingue un rechazo definitivo de uno pasajero:
                        // devuelve `{success:false, error}` para los dos. Se
                        // deja abierta la puerta al reintento y el motivo
                        // TEXTUAL queda escrito para poder decidir mirándolo.
                        await markFailed(traza.delivery.id, {
                            errorMessage: emailResult?.error || 'sin motivo devuelto por el proveedor',
                            retryable: true,
                        });
                    }
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
function buildDonationReceiptHtml({ club, project, donation, donorName, amount, currency, sessionId, paymentIntentId, message, purpose }) {
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
    // v4.808 — el destino del aporte (campaña o bloque). Se escapa igual que
    // el título del proyecto: termina dentro del HTML del correo.
    const safePurpose = purpose ? String(purpose).replace(/</g, '&lt;').replace(/>/g, '&gt;') : null;

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
                    : safePurpose
                        ? `Confirmamos tu aporte a <strong>${safePurpose}</strong>, de <strong>${clubName}</strong>. Tu contribución se destina a esa causa.`
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
