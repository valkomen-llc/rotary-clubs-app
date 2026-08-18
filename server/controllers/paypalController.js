// APORTES POR PAYPAL.
//
// v4.866 — Segunda vía de cobro, espejo del camino de Stripe.
//
// ═════════════════════════════════════════════════════════════════════
// EL DINERO ENTRA A LA CUENTA DE LA PLATAFORMA
// ═════════════════════════════════════════════════════════════════════
//
// Decisión del cliente y es la que hace que todo lo demás siga funcionando: la
// retención se aplica igual, la Bóveda sigue siendo la verdad y el club retira
// por donde retira hoy. `isPlatformCollection: true`, como con Stripe.
//
// ⚠️ LOS RESOLUTORES DE DESTINO SE IMPORTAN, NO SE COPIAN. Campaña, bloque y
// moneda salen de `financialController`: dos criterios sobre el mismo aporte
// dirían cosas distintas según por dónde entró, que es el problema que
// `sendCampaign` arrastra en el CRM.

import prisma from '../lib/prisma.js';
import { ensureWalletSchema } from '../lib/ensureWalletSchema.js';
import { normalizeCurrency, roundMoney } from '../lib/money.js';
import { platformFee, estimatedProcessorFee } from '../lib/feeRules.js';
import { getFeeRules } from '../lib/feeRulesStore.js';
import { postDonation } from '../lib/ledger.js';
import { sendContributionNotifications } from '../lib/notificationSender.js';
import {
    resolveCampaignRef, resolveBlockPurpose, resolveDonationCurrencyFor,
} from './financialController.js';
import {
    paypalCurrencyOk, MOTIVOS_MONEDA, parseCapture, paypalAvailability, paypalRef,
} from '../lib/paypalSpec.js';
import {
    paypalConfigured, createPaypalOrder, capturePaypalOrder, getPaypalOrder, verifyPaypalWebhook, paypalEnv,
} from '../lib/paypalService.js';
// v4.868 — El interruptor del operador. Tener las credenciales cargadas NO
// alcanza: el método se activa a propósito desde el panel, que es el paso que
// permite dejar todo listo y probarlo en sandbox antes de ofrecerlo.
import { isMethodOffered } from '../lib/paymentMethods.js';
import { getPaymentMethods } from '../lib/paymentMethodsStore.js';

console.log('[PAYPAL v4.866] Aportes por PayPal a la cuenta de la plataforma');

// El MISMO margen operativo que con Stripe: dos aportes del mismo día no pueden
// tener reglas de disponibilidad distintas según por dónde entraron.
const PLATFORM_HOLDING_DAYS = 6;

const DEFAULT_FRONTEND_URL = 'https://app.clubplatform.org';

const resolveOrigin = (req, returnUrl) => {
    if (returnUrl && /^https?:\/\//.test(returnUrl)) return returnUrl.replace(/\/$/, '');
    const o = req.headers?.origin;
    if (o && /^https?:\/\//.test(o)) return o.replace(/\/$/, '');
    return DEFAULT_FRONTEND_URL;
};

/** La moneda que la cuenta de PayPal puede recibir. VACÍA = la que venga, que
 *  es el valor por defecto y hace que se comporte como Stripe. */
const paypalCurrency = () => normalizeCurrency(process.env.PAYPAL_CURRENCY || '');

// ═══════════════════════════════════════════════════════════════════
// 1. ¿Se puede ofrecer PayPal para este aporte?
// ═══════════════════════════════════════════════════════════════════
//
// Lo contesta el SERVIDOR, no la pantalla: la moneda la decide el servidor
// desde v4.834 y las credenciales no viajan al navegador. El modal pregunta
// antes de pintar el botón — uno que lleva a un error del proveedor es peor
// que ninguno (v4.650).
export const paypalAvailabilityCheck = async (req, res) => {
    try {
        const clubId = String(req.query.clubId || '');
        if (!clubId) return res.json({ available: false, reason: 'sin_sitio' });
        if (!paypalConfigured()) return res.json({ available: false, reason: 'sin_credenciales' });
        // Configurado y ACTIVADO son dos cosas distintas.
        if (!isMethodOffered('paypal', await getPaymentMethods(), process.env)) {
            return res.json({ available: false, reason: 'desactivado' });
        }

        const decision = await resolveDonationCurrencyFor(clubId, req, req.query.lang || '');
        const moneda = paypalCurrencyOk(decision.currency, paypalCurrency());
        return res.json({
            available: moneda.ok,
            currency: moneda.currency || decision.currency,
            reason: moneda.reason,
            // El motivo se DICE: un botón que desaparece sin explicación es
            // indistinguible de uno roto.
            message: moneda.ok ? null : (MOTIVOS_MONEDA[moneda.reason] || null),
            env: paypalEnv(),
        });
    } catch (e) {
        // Degrada a «no disponible»: no poder ofrecer PayPal es mucho menos
        // grave que romper el modal de aportes.
        console.warn('[PAYPAL] disponibilidad no resuelta:', e?.message);
        return res.json({ available: false, reason: 'error' });
    }
};

// ═══════════════════════════════════════════════════════════════════
// 2. Crear el pedido
// ═══════════════════════════════════════════════════════════════════
export const createPaypalDonation = async (req, res) => {
    try {
        const {
            clubId, amount, donorEmail, donorName = '', message = '',
            isAnonymous = false, projectId = null, campaignId = null, blockId = null,
            lang = '', returnUrl,
        } = req.body || {};

        if (!paypalConfigured()) {
            return res.status(503).json({ error: 'PayPal no está configurado en esta instalación.' });
        }
        // Se comprueba también acá y no sólo al pintar el botón: esconder un
        // control en la pantalla no protege el endpoint de quien lo conoce.
        if (!isMethodOffered('paypal', await getPaymentMethods(), process.env)) {
            return res.status(503).json({ error: 'PayPal no está activado en esta instalación.' });
        }
        if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });
        const monto = parseFloat(amount);
        if (!monto || monto <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        if (!donorEmail || !/^\S+@\S+\.\S+$/.test(donorEmail)) {
            return res.status(400).json({ error: 'Email del donante es obligatorio y debe ser válido' });
        }

        const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true, name: true } });
        if (!club) return res.status(404).json({ error: 'Club no encontrado' });

        let project = null;
        if (projectId) {
            project = await prisma.project.findFirst({
                where: { OR: [{ id: projectId }, { slug: projectId }] },
                select: { id: true, title: true, clubId: true, slug: true },
            });
            if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
            if (project.clubId !== clubId) return res.status(400).json({ error: 'El proyecto no pertenece al club indicado' });
        }

        // La moneda la decide el SERVIDOR, igual que en Stripe: la cifra que el
        // visitante vio es la que se le cobra.
        const decision = await resolveDonationCurrencyFor(clubId, req, lang);
        const moneda = paypalCurrencyOk(decision.currency, paypalCurrency());
        if (!moneda.ok) {
            // ⚠️ NO SE CONVIERTE. El visitante ya vio una cifra concreta.
            return res.status(409).json({
                error: MOTIVOS_MONEDA[moneda.reason] || 'PayPal no puede cobrar en esta moneda.',
                reason: moneda.reason,
            });
        }

        const campaign = await resolveCampaignRef(campaignId, clubId);
        const block = await resolveBlockPurpose(blockId, clubId);
        const purpose = campaign?.name || block?.label || null;
        const descripcion = project ? `Aporte al proyecto: ${project.title}`
            : campaign ? `Aporte — ${campaign.name}`
                : block?.label ? `Aporte — ${block.label}`
                    : `Donación a ${club.name}`;

        const origin = resolveOrigin(req, returnUrl);
        const orden = await createPaypalOrder({
            amount: monto,
            currency: moneda.currency,
            description: descripcion,
            returnUrl: `${origin}/donacion/paypal`,
            cancelUrl: project ? `${origin}/proyectos/${project.slug || project.id}` : `${origin}/donacion/cancelada`,
            customId: clubId,
        });

        if (!orden?.id || !orden.approveUrl) {
            return res.status(502).json({ error: 'PayPal no devolvió un pedido utilizable.' });
        }

        // ⚠️ LA INTENCIÓN SE GUARDA ANTES DE MANDAR AL DONANTE A PAYPAL.
        //
        // PayPal NO acepta metadata arbitraria como Stripe: `custom_id` es un
        // solo campo de 127 caracteres y ahí no entran la campaña, el bloque,
        // el proyecto, el nombre y el mensaje. Sin esta fila, al volver de
        // PayPal no sabríamos a qué campaña atribuir el aporte ni a nombre de
        // quién emitir el recibo — se perdería toda la trazabilidad.
        //
        // Se guarda como un `Payment` en estado `pending`, que es lo que ya
        // hace `createPaymentIntent` para la tienda. Al capturar se REEMPLAZA
        // por la fila definitiva con el id de la captura.
        await prisma.payment.create({
            data: {
                provider: 'paypal',
                providerRef: `order:${orden.id}`,
                status: 'pending',
                amount: monto,
                currency: moneda.currency,
                applicationFee: 0,
                netAmount: 0,
                isPlatformCollection: true,
                clubId,
                rawPayload: JSON.stringify({
                    intent: true,
                    orderId: orden.id,
                    donorEmail, donorName: String(donorName).slice(0, 150),
                    message: String(message).slice(0, 500),
                    isAnonymous: !!isAnonymous,
                    projectId: project?.id || null,
                    campaignId: campaign?.id || null,
                    campaignSlug: campaign?.slug || null,
                    purpose,
                    blockId: block?.id || null,
                    currencyReason: decision.reason,
                    siteCurrency: decision.siteCurrency,
                }),
            },
        }).catch(e => {
            // Un choque acá significa que el mismo pedido ya se registró: no es
            // un error, es idempotencia.
            console.warn('[PAYPAL] intención no guardada (puede ser un reintento):', e?.message);
        });

        if (campaign) {
            try {
                const { bumpMetric } = await import('./contributionCampaignController.js');
                await bumpMetric({ campaignId: campaign.id, clubId, type: 'checkout_started' });
            } catch (e) {
                console.warn('[PAYPAL] métrica checkout_started no registrada:', e?.message);
            }
        }

        return res.json({ orderId: orden.id, url: orden.approveUrl });
    } catch (error) {
        // El error de PayPal se propaga TEXTUAL: convertirlo en «no se pudo
        // cobrar» deja a quien corrige sin saber qué.
        console.error('[PAYPAL] Error creando el pedido:', error?.message, error?.paypal || '');
        return res.status(500).json({ error: error?.message || 'Error creando el pago en PayPal' });
    }
};

// ═══════════════════════════════════════════════════════════════════
// 3. Cobrar y registrar
// ═══════════════════════════════════════════════════════════════════

/**
 * Registra un aporte de PayPal ya capturado.
 *
 * La llaman DOS vías —el retorno del navegador y el webhook— y por eso tiene
 * que ser idempotente: la protección real es el índice único
 * `(provider, providerRef)`, igual que con Stripe. La lectura previa sólo evita
 * el trabajo.
 */
const registrarAporte = async ({ captura, intencion, clubId }) => {
    const providerRef = paypalRef(captura.captureId);
    if (!providerRef) return { ok: false, reason: 'sin_referencia' };

    await ensureWalletSchema();

    const yaEsta = await prisma.payment.findFirst({
        where: { providerRef, provider: 'paypal' },
        select: { id: true },
    });
    if (yaEsta) return { ok: true, duplicado: true };

    const currency = captura.currency;
    const bruto = captura.gross;
    const reglas = await getFeeRules();
    const retencion = platformFee(bruto, { rules: reglas, currency, clubId });

    // La comisión de PayPal viene MEDIDA en la captura. Sólo se estima cuando
    // no vino o vino en otra moneda — y entonces se DECLARA como estimada, que
    // es lo que la Bóveda distingue desde v4.850.
    const procesador = captura.processorFee !== null
        ? roundMoney(captura.processorFee, currency)
        : estimatedProcessorFee(bruto, { rules: reglas, currency });

    const neto = roundMoney(Math.max(0, bruto - retencion - procesador), currency);
    const { availableOn, clubAvailableOn } = paypalAvailability(new Date(), PLATFORM_HOLDING_DAYS);

    let pagoId = null;
    try {
        const pago = await prisma.payment.create({
            data: {
                provider: 'paypal',
                providerRef,
                status: 'succeeded',
                amount: bruto,
                currency,
                applicationFee: retencion,
                netAmount: neto,
                isPlatformCollection: true,
                clubId,
                // Las columnas se llaman `stripe*` por historia y se usan igual:
                // renombrarlas toca Prisma y es el riesgo de despliegue de
                // `logo_intl` (v4.699). Acá guardan el estado y la fecha de
                // disponibilidad, que es lo que `bucketOf` lee.
                stripeStatus: 'available',
                availableOn,
                clubAvailableOn,
                paymentMethod: 'paypal',
                rawPayload: JSON.stringify({
                    provider: 'paypal',
                    orderId: intencion?.orderId || null,
                    captureId: captura.captureId,
                    captureStatus: captura.status,
                    feeBasis: captura.basis,
                    payer: captura.payer,
                    donorEmail: intencion?.donorEmail || captura.payer?.email || null,
                    donorName: intencion?.donorName || captura.payer?.name || null,
                    message: intencion?.message || null,
                    isAnonymous: !!intencion?.isAnonymous,
                    projectId: intencion?.projectId || null,
                    campaignId: intencion?.campaignId || null,
                    campaignSlug: intencion?.campaignSlug || null,
                    purpose: intencion?.purpose || null,
                    blockId: intencion?.blockId || null,
                    currencyReason: intencion?.currencyReason || null,
                }),
            },
        });
        pagoId = pago.id;
    } catch (dup) {
        // El índice único disparó: otra vía lo registró primero. No es un error.
        console.log('[PAYPAL] captura ya registrada por otra vía:', providerRef);
        return { ok: true, duplicado: true };
    }

    // La intención en `pending` ya cumplió su función.
    if (intencion?.orderId) {
        await prisma.payment.deleteMany({
            where: { provider: 'paypal', providerRef: `order:${intencion.orderId}`, status: 'pending' },
        }).catch(() => { /* si no se borra, queda una fila pendiente visible; no vale romper el cobro */ });
    }

    const anonimo = !!intencion?.isAnonymous;
    const donacion = await prisma.donation.create({
        data: {
            amount: bruto,
            currency,
            donorName: anonimo ? 'Anónimo' : (intencion?.donorName || captura.payer?.name || null),
            donorEmail: intencion?.donorEmail || captura.payer?.email || null,
            status: 'success',
            clubId,
            projectId: intencion?.projectId || null,
            isAnonymous: anonimo,
            message: intencion?.message || null,
        },
    });

    // Se ata el aporte a su pago DESPUÉS de crear los dos, por el mismo motivo
    // que en Stripe: el pago lleva la restricción de unicidad.
    try {
        const fila = await prisma.payment.findUnique({ where: { id: pagoId }, select: { rawPayload: true } });
        const payload = JSON.parse(fila?.rawPayload || '{}');
        payload.donationId = donacion.id;
        await prisma.payment.update({ where: { id: pagoId }, data: { rawPayload: JSON.stringify(payload) } });
    } catch (e) {
        console.warn('[PAYPAL] vínculo aporte-pago no escrito:', e?.message);
    }

    // El libro mayor, en sombra. Nunca lanza y nadie paga por él.
    const asiento = await postDonation({
        clubId, currency, gross: bruto,
        processorFee: procesador, platformFee: retencion,
        processorFeeBasis: captura.basis === 'medida' ? 'real' : 'estimado',
        sourceRef: providerRef,
        occurredAt: new Date(),
        meta: { provider: 'paypal', captureId: captura.captureId },
    });
    if (!asiento.ok) console.warn(`[LEDGER] el aporte PayPal ${providerRef} quedó sin asentar (${asiento.reason})`);

    // La confirmación al aportante. Tampoco lanza.
    try {
        await sendContributionNotifications({
            contributionId: donacion.id,
            clubId,
            campaignId: intencion?.campaignId || null,
            event: 'payment_confirmed',
            donorEmail: intencion?.donorEmail || captura.payer?.email || '',
            vars: {
                amount: bruto, currency,
                donorName: anonimo ? 'Anónimo' : (intencion?.donorName || ''),
                purpose: intencion?.purpose || '',
            },
        });
    } catch (e) {
        console.warn('[PAYPAL] notificación no enviada:', e?.message);
    }

    if (intencion?.campaignId) {
        try {
            const { bumpMetric } = await import('./contributionCampaignController.js');
            await bumpMetric({
                campaignId: intencion.campaignId, clubId,
                type: 'donation_completed', amount: bruto, currency,
            });
        } catch (e) {
            console.warn('[PAYPAL] métrica donation_completed no registrada:', e?.message);
        }
    }

    return { ok: true, paymentId: pagoId, donationId: donacion.id };
};

/** Lee la intención guardada al crear el pedido. */
const leerIntencion = async (orderId) => {
    try {
        const fila = await prisma.payment.findFirst({
            where: { provider: 'paypal', providerRef: `order:${orderId}` },
            select: { clubId: true, rawPayload: true },
        });
        if (!fila) return null;
        return { clubId: fila.clubId, ...JSON.parse(fila.rawPayload || '{}') };
    } catch (e) {
        console.warn('[PAYPAL] intención no leída:', e?.message);
        return null;
    }
};

/** El donante vuelve de PayPal. Se cobra y se registra. */
export const capturePaypalDonation = async (req, res) => {
    try {
        const orderId = String(req.body?.orderId || req.query?.token || '').trim();
        if (!orderId) return res.status(400).json({ error: 'Falta el identificador del pedido.' });

        const intencion = await leerIntencion(orderId);
        const orden = await capturePaypalOrder(orderId);
        const captura = parseCapture(orden);
        if (!captura.ok) return res.status(502).json({ error: `PayPal no devolvió una captura utilizable (${captura.reason}).` });

        const clubId = intencion?.clubId || orden?.purchase_units?.[0]?.custom_id || null;
        if (!clubId) return res.status(422).json({ error: 'No se pudo determinar el sitio del aporte.' });

        const r = await registrarAporte({ captura, intencion, clubId });
        return res.json({ ok: r.ok, duplicado: !!r.duplicado, amount: captura.gross, currency: captura.currency });
    } catch (error) {
        console.error('[PAYPAL] Error capturando:', error?.message, error?.paypal || '');
        return res.status(500).json({ error: error?.message || 'Error confirmando el pago de PayPal' });
    }
};

// ═══════════════════════════════════════════════════════════════════
// 4. El webhook — la red de seguridad
// ═══════════════════════════════════════════════════════════════════
//
// El retorno del navegador puede no ocurrir: el donante cierra la pestaña, se
// le corta la conexión. La confirmación de verdad es ésta, igual que con
// Stripe. Las dos vías convergen en `registrarAporte`, que es idempotente.
export const paypalWebhook = async (req, res) => {
    // Se contesta 200 rápido y se procesa: PayPal reintenta y da de baja la
    // suscripción cuando el endpoint tarda, igual que Meta.
    const evento = req.body || {};
    try {
        const firma = await verifyPaypalWebhook(req.headers, evento);
        // `null` es «no se pudo comprobar», que NO es «firma inválida». Sólo se
        // rechaza cuando PayPal dijo explícitamente que no.
        if (firma === false) {
            console.warn('[PAYPAL] webhook con firma inválida, descartado');
            return res.status(400).json({ error: 'firma inválida' });
        }
        if (firma === null) {
            console.warn('[PAYPAL] webhook sin verificar (falta PAYPAL_WEBHOOK_ID o encabezados)');
        }

        if (evento?.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
            return res.json({ received: true, ignored: evento?.event_type || null });
        }

        const recurso = evento.resource || {};
        // El webhook trae la captura suelta, no el pedido: se arma la misma
        // forma que `parseCapture` para no tener dos criterios de lectura.
        const captura = parseCapture({ purchase_units: [{ payments: { captures: [recurso] } }] });
        if (!captura.ok) return res.json({ received: true, ignored: captura.reason });

        const orderId = recurso?.supplementary_data?.related_ids?.order_id || null;
        const intencion = orderId ? await leerIntencion(orderId) : null;
        const clubId = intencion?.clubId || recurso?.custom_id || null;
        if (!clubId) {
            console.warn('[PAYPAL] webhook sin sitio identificable, captura', captura.captureId);
            return res.json({ received: true, ignored: 'sin_sitio' });
        }

        await registrarAporte({ captura, intencion, clubId });
        return res.json({ received: true });
    } catch (error) {
        console.error('[PAYPAL] Error en el webhook:', error?.message);
        // 200 igual: un 500 hace que PayPal reintente en bucle un evento que
        // quizá ya se procesó.
        return res.json({ received: true, error: error?.message });
    }
};

export default {
    paypalAvailabilityCheck, createPaypalDonation, capturePaypalDonation, paypalWebhook,
};
