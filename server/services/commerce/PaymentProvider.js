// ════════════════════════════════════════════════════════════════════════════
// Commerce SaaS Multi-Tenant — ABSTRACCIÓN DE PASARELAS DE PAGO
// v4.1096.0
//
// Permite que cada Club/Distrito elija pasarela sin acoplar Commerce a Stripe.
// Implementaciones soportadas:
//  1. StripeProvider (predeterminado / global)
//  2. ManualProvider (transferencia bancaria, consignación o efectivo)
//  3. ExternalProvider (pasarelas externas específicas por club)
// ════════════════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
import prisma from '../../lib/prisma.js';
import db from '../../lib/db.js';

export class BasePaymentProvider {
    constructor(clubId) {
        this.clubId = clubId;
    }

    async initiatePayment({ order, customer, returnUrl, cancelUrl }) {
        throw new Error('initiatePayment must be implemented by subclass');
    }

    async verifyPayment({ paymentId, payload }) {
        throw new Error('verifyPayment must be implemented by subclass');
    }
}

export class StripeCommerceProvider extends BasePaymentProvider {
    async getStripeInstance() {
        const config = await prisma.paymentProviderConfig.findUnique({
            where: { provider_clubId: { provider: 'stripe', clubId: this.clubId } }
        });

        if (config && config.enabled && config.secretRef) {
            return {
                stripe: new Stripe(config.secretRef),
                isMaster: false
            };
        }

        return {
            stripe: new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345'),
            isMaster: true
        };
    }

    async initiatePayment({ order, customer }) {
        const { stripe: dynamicStripe, isMaster } = await this.getStripeInstance();
        const amountInCents = Math.round(order.total * 100);

        const paymentIntent = await dynamicStripe.paymentIntents.create({
            amount: amountInCents,
            currency: (order.currency || 'cop').toLowerCase(),
            metadata: {
                orderId: order.id,
                clubId: order.clubId,
                customerEmail: order.customerEmail || customer?.email || '',
                customerName: order.customerName || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim(),
                isMasterAccount: isMaster ? 'true' : 'false',
                type: 'commerce_order'
            }
        });

        await prisma.payment.create({
            data: {
                provider: 'stripe',
                providerRef: paymentIntent.id,
                status: 'pending',
                amount: order.total,
                currency: order.currency,
                applicationFee: 0,
                netAmount: order.total,
                isPlatformCollection: isMaster,
                orderId: order.id,
                clubId: order.clubId
            }
        });

        return {
            success: true,
            provider: 'stripe',
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        };
    }
}

export class ManualCommerceProvider extends BasePaymentProvider {
    async initiatePayment({ order }) {
        // Consultar instrucciones bancarias configuradas para el club
        let bankInstructions = 'Por favor realiza la transferencia a la cuenta oficial del Club y envía el comprobante.';
        try {
            const res = await db.query(
                `SELECT value FROM "Setting" WHERE key = 'commerce_bank_instructions' AND "clubId" = $1 LIMIT 1`,
                [this.clubId]
            );
            if (res.rows[0]?.value) {
                bankInstructions = res.rows[0].value;
            }
        } catch {
            // fallback
        }

        // Crear registro de pago manual pendiente de aprobación
        await prisma.payment.create({
            data: {
                provider: 'manual_transfer',
                providerRef: `MAN-${Date.now()}-${order.id.slice(-6).toUpperCase()}`,
                status: 'pending',
                amount: order.total,
                currency: order.currency,
                applicationFee: 0,
                netAmount: order.total,
                isPlatformCollection: false,
                orderId: order.id,
                clubId: order.clubId
            }
        });

        return {
            success: true,
            provider: 'manual_transfer',
            instructions: bankInstructions,
            orderId: order.id
        };
    }
}

export class ExternalCommerceProvider extends BasePaymentProvider {
    async initiatePayment({ order }) {
        return {
            success: true,
            provider: 'external',
            orderId: order.id,
            message: 'Pago registrado externamente pendiente de conciliación.'
        };
    }
}

export function getCommercePaymentProvider(providerName = 'stripe', clubId) {
    const norm = String(providerName).toLowerCase();
    if (norm === 'manual' || norm === 'manual_transfer' || norm === 'bank_transfer') {
        return new ManualCommerceProvider(clubId);
    }
    if (norm === 'external') {
        return new ExternalCommerceProvider(clubId);
    }
    return new StripeCommerceProvider(clubId);
}
