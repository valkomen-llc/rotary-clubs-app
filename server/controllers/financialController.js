// v4.409 — Motor de donaciones vía Stripe Checkout (Maneras de Contribuir)
// Centraliza el flujo público de aportes: el visitante elige monto + datos,
// el backend crea una Checkout Session de Stripe (cuenta master Valkomen),
// el webhook (paymentController.handleSuccessfulCheckoutSession) registra
// Payment + Donation. El balance del club queda disponible automáticamente
// vía /api/payouts/balance porque Payment.isPlatformCollection = true.
import Stripe from 'stripe';
import { resolveDonationCurrency, blockAmountsApply } from '../lib/donationCurrency.js';
import {
    normalizeCurrency, currencyMeta, roundMoney,
    sumByCurrency, groupByCurrency, currenciesOf, primaryCurrency,
} from '../lib/money.js';
import { siteCurrency } from '../lib/clubCurrency.js';
import { parsePayload, originOf, methodOf, linkDonationsToPayments } from '../lib/paymentTrace.js';
import prisma from '../lib/prisma.js';
import db from '../lib/db.js'; // v4.414 — pg directo para LECTURAS (cold-start de Prisma es muy lento en Vercel)
import EmailService from '../services/EmailService.js';
import { DEFAULT_PAYMENT_BLOCKS } from '../lib/paymentBlockDefaults.js';
import { isServable, targetsSite } from '../lib/contributionSpec.js';
import { ensureContributionSchema } from '../lib/ensureContributionSchema.js';

console.log('[FINANCIAL v4.841] Controller cargado — donaciones Stripe Checkout + Bóveda con saldos POR MONEDA');

// v4.808 — El DESTINO del aporte cuando nace de un bloque de la página de
// Aportes («Aporte Voluntario», «End Polio Now»…).
//
// El rótulo NO se toma del navegador: se resuelve desde la config guardada
// del club, igual que `createSubscriptionCheckout` hace con el monto. Un
// texto libre del cliente terminaría impreso en la pantalla de Stripe y en
// el recibo, que son documentos de una institución.
const resolveBlockPurpose = async (blockId, clubId) => {
    if (!blockId) return null;
    try {
        const row = await db.query(
            'SELECT value FROM "Setting" WHERE key = $1 AND "clubId" = $2 LIMIT 1',
            ['payment_blocks', clubId]
        );
        let blocks = [];
        try { blocks = row.rows[0]?.value ? JSON.parse(row.rows[0].value) : []; } catch { blocks = []; }
        if (!Array.isArray(blocks) || blocks.length === 0) blocks = DEFAULT_PAYMENT_BLOCKS;
        const block = blocks.find(b => b && b.id === blockId)
            || DEFAULT_PAYMENT_BLOCKS.find(b => b.id === blockId);
        if (!block) return null;
        return {
            id: block.id,
            label: String(block.campaign || block.title || '').slice(0, 120),
        };
    } catch (e) {
        console.warn('[FINANCIAL] Bloque no resuelto (se dona sin rótulo):', e?.message);
        return null;
    }
};

// v4.804 — Si el aporte nace de una campaña, se valida y se ata a la metadata
// de Stripe. DEGRADA a donación normal si la campaña no vale (venció mientras
// el formulario estaba abierto, o no alcanza a este club): una campaña
// vencida no es motivo para rechazar un aporte legítimo — se cobra igual y
// sólo se pierde la atribución.
const resolveCampaignRef = async (campaignId, clubId) => {
    if (!campaignId) return null;
    try {
        await ensureContributionSchema();
        const { rows } = await db.query(
            'SELECT id, slug, name, status, "startAt", "endAt", targeting FROM "ContributionCampaign" WHERE id = $1 LIMIT 1',
            [String(campaignId)]
        );
        const campaign = rows[0];
        if (!campaign || !isServable(campaign, new Date())) return null;
        const site = await db.query('SELECT id, "districtId", district FROM "Club" WHERE id = $1 LIMIT 1', [clubId]);
        if (!site.rows[0] || !targetsSite(campaign.targeting, site.rows[0])) return null;
        return { id: campaign.id, slug: campaign.slug, name: campaign.name };
    } catch (e) {
        console.warn('[FINANCIAL] Campaña no resuelta (se dona sin atribución):', e?.message);
        return null;
    }
};

// v4.422 — Margen Valkomen para retiro (debe coincidir con paymentController)
const PLATFORM_HOLDING_DAYS = 6;
const PLATFORM_FEE_PERCENTAGE = 0.05;

const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.05; // 5% Valkomen fee
const DEFAULT_FRONTEND_URL = 'https://app.clubplatform.org';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');

// ── En qué moneda se le cobra a ESTE visitante (v4.834) ───────────────
//
// El criterio es puro y vive aparte; acá sólo se leen los datos que necesita.
// El interruptor es de la INSTALACIÓN y no del sitio porque la pasarela es una
// sola para toda la plataforma (`STRIPE_SECRET_KEY`): si la cuenta no pudiera
// presentar dólares, el problema sería de todos los sitios a la vez.
const INTL_CURRENCY_ENABLED = String(process.env.DONATION_INTL_CURRENCY || 'USD').toLowerCase() !== 'off';

/** El país del visitante, según el borde. NUNCA del cuerpo de la petición: el
 *  cliente elige su idioma —eso es suyo— pero no dónde está. */
const visitorCountry = (req) => {
    const h = req.headers || {};
    const raw = String(
        h['x-vercel-ip-country'] || h['cf-ipcountry'] || h['x-country-code'] || h['x-geo-country'] || ''
    ).trim().toUpperCase();
    // 'XX' es lo que devuelve Vercel cuando no puede geolocalizar.
    return /^[A-Z]{2}$/.test(raw) && raw !== 'XX' ? raw : '';
};

/** La moneda del aporte, resuelta con los datos del sitio y del visitante. */
const resolveDonationCurrencyFor = async (clubId, req, lang) => {
    const clubCurrency = await resolveClubCurrency(clubId);
    let clubCountry = '';
    try {
        const c = await db.query('SELECT country FROM "Club" WHERE id = $1 LIMIT 1', [clubId]);
        clubCountry = c.rows[0]?.country || '';
    } catch { /* sin país se deduce de la moneda */ }
    return resolveDonationCurrency({
        clubCurrency, clubCountry,
        lang: String(lang || ''), country: visitorCountry(req),
        enabled: INTL_CURRENCY_ENABLED,
    });
};

// Moneda del club: setting club_currency, o por país (Colombia → COP), o USD.
//
// v4.843 — El criterio vive en `clubCurrency.js`. Estaba escrito acá y otra vez
// en `payoutController`, y al necesitarlo la barra superior habrían sido tres.
// El nombre local se conserva: lo usan `resolveDonationCurrencyFor` y el cobro
// de la membresía, y renombrarlo ahí no aporta nada.
const resolveClubCurrency = siteCurrency;

const resolveOrigin = (req, returnUrl) => {
    if (returnUrl && /^https?:\/\//.test(returnUrl)) return returnUrl.replace(/\/$/, '');
    const headerOrigin = req.headers.origin;
    if (headerOrigin && /^https?:\/\//.test(headerOrigin)) return headerOrigin.replace(/\/$/, '');
    return DEFAULT_FRONTEND_URL;
};

// POST /api/financial/donate  (público — cualquier visitante puede donar)
// Body: { clubId, amount, currency?, frequency?, donorEmail, donorName?, message?, isAnonymous?, projectId?, returnUrl? }
export const createDonationCheckout = async (req, res) => {
    try {
        const {
            clubId,
            amount,
            currency = 'USD',
            frequency = 'one-time',
            donorEmail,
            donorName = '',
            message = '',
            isAnonymous = false,
            projectId = null, // v4.416 — donación asociada a proyecto (opcional)
            campaignId = null, // v4.804 — aporte nacido de una Campaña de Contribución (opcional)
            blockId = null,    // v4.808 — aporte nacido de un bloque de la página de Aportes
            // v4.834 — el idioma ACTIVO del sitio. Es del visitante (lo eligió
            // en el selector), así que sí viene del cliente; el PAÍS no, ése
            // sale del encabezado del borde.
            lang = '',
            returnUrl
        } = req.body || {};

        if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });
        const numericAmount = parseFloat(amount);
        if (!numericAmount || numericAmount <= 0) {
            return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        }
        if (numericAmount < 1) {
            return res.status(400).json({ error: 'El monto mínimo es 1' });
        }
        if (frequency !== 'one-time') {
            return res.status(400).json({ error: 'Las donaciones recurrentes estarán disponibles próximamente' });
        }
        if (!donorEmail || !/^\S+@\S+\.\S+$/.test(donorEmail)) {
            return res.status(400).json({ error: 'Email del donante es obligatorio y debe ser válido' });
        }

        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: { id: true, name: true }
        });
        if (!club) return res.status(404).json({ error: 'Club no encontrado' });

        // v4.416 — Si la donación va a un proyecto, validar que existe y pertenece al club
        // v4.420 — el frontend puede mandar el slug en vez del UUID si la URL es amigable
        let project = null;
        if (projectId) {
            project = await prisma.project.findFirst({
                where: {
                    OR: [{ id: projectId }, { slug: projectId }]
                },
                select: { id: true, title: true, clubId: true, image: true, slug: true }
            });
            if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
            if (project.clubId !== clubId) {
                return res.status(400).json({ error: 'El proyecto no pertenece al club indicado' });
            }
        }

        const stripe = getStripe();
        const amountInCents = Math.round(numericAmount * 100);
        const origin = resolveOrigin(req, returnUrl);
        // La moneda la decide el SERVIDOR y sigue ignorando la del cuerpo: lo
        // que cambió en v4.834 es que ya no es siempre la del sitio — un
        // visitante internacional paga en dólares. El criterio es el mismo que
        // consultó la pantalla, así que la cifra que vio es la que se le cobra.
        const decision = await resolveDonationCurrencyFor(clubId, req, lang);
        const normalizedCurrency = decision.currency.toLowerCase();

        // v4.804 — atribución de campaña (o null si no vale; nunca bloquea).
        const campaign = await resolveCampaignRef(campaignId, clubId);
        // v4.808 — destino del aporte cuando viene de un bloque de Aportes.
        const block = await resolveBlockPurpose(blockId, clubId);

        // Qué dice la pantalla de Stripe y el recibo. El orden es de lo MÁS
        // específico a lo más general: un proyecto concreto, una campaña, un
        // bloque de aportes, y por último el club.
        const productName = project
            ? `Aporte al proyecto: ${project.title}`
            : campaign ? `Aporte — ${campaign.name}`
                : block?.label ? `Aporte — ${block.label}`
                    : `Donación a ${club.name}`;
        // El rótulo del destino, para el recibo. Null cuando el aporte es al
        // club a secas: ahí el recibo ya dice el nombre del club.
        const purpose = campaign?.name || block?.label || null;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: donorEmail,
            line_items: [{
                price_data: {
                    currency: normalizedCurrency,
                    product_data: {
                        name: productName,
                        description: message
                            ? `Mensaje del donante: ${String(message).slice(0, 180)}`
                            : (project ? `${club.name} — proyecto de impacto social` : 'Aporte voluntario')
                    },
                    unit_amount: amountInCents
                },
                quantity: 1
            }],
            success_url: `${origin}/donacion/exito?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: project ? `${origin}/proyectos/${project.slug || project.id}` : `${origin}/donacion/cancelada`,
            metadata: {
                type: 'donation',
                donationType: 'one-time',
                clubId,
                // v4.420 — guardamos siempre el UUID real, aunque el cliente haya mandado el slug
                projectId: project?.id || '',
                donorEmail,
                donorName: String(donorName || '').slice(0, 150),
                message: String(message || '').slice(0, 500),
                isAnonymous: isAnonymous ? 'true' : 'false',
                // v4.804 — la atribución viaja en la metadata de Stripe y queda
                // en Payment.rawPayload vía webhook: el modelo Donation no se
                // toca. Los contadores del panel llegan en la Fase 5.
                campaignId: campaign?.id || '',
                campaignSlug: campaign?.slug || '',
                // v4.808 — el destino viaja al webhook para que el RECIBO lo
                // nombre. Quien aportó a una emergencia tiene que ver a qué
                // aportó: es lo primero que se mira y lo que sostiene la
                // rendición de cuentas.
                purpose: purpose ? String(purpose).slice(0, 120) : '',
                blockId: block?.id || '',
                // v4.834 — por qué se cobró en esta moneda. Sin este rastro,
                // «¿por qué este aporte entró en dólares?» no se puede
                // contestar dos semanas después.
                currency: decision.currency,
                siteCurrency: decision.siteCurrency,
                currencyReason: decision.reason
            }
        });

        // v4.807 — el inicio de checkout lo registra el SERVIDOR: es el único
        // que sabe que la sesión de Stripe se creó de verdad. Contar no puede
        // romper un aporte, así que el fallo se traga.
        if (campaign) {
            try {
                const { bumpMetric } = await import('./contributionCampaignController.js');
                await bumpMetric({ campaignId: campaign.id, clubId, type: 'checkout_started' });
            } catch (e) {
                console.warn('[FINANCIAL] métrica checkout_started no registrada:', e?.message);
            }
        }

        return res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('[FINANCIAL] Error creating donation checkout:', error);
        return res.status(500).json({ error: error.message || 'Error creando la sesión de pago' });
    }
};

// ── Membresías recurrentes (Fase 2) ──────────────────────────────────────────
// Mapeo de periodicidades a la config de precio recurrente de Stripe.
const STRIPE_INTERVALS = {
    month: { interval: 'month', interval_count: 1 },
    quarter: { interval: 'month', interval_count: 3 },
    semiannual: { interval: 'month', interval_count: 6 },
    year: { interval: 'year', interval_count: 1 },
};
const INTERVAL_LABELS = { month: 'Mensual', quarter: 'Trimestral', semiannual: 'Semestral', year: 'Anual' };

// POST /api/financial/subscribe  (público — suscripción a una membresía recurrente)
// Body: { clubId, blockId, interval, returnUrl }
// El monto NO se toma del cliente: se resuelve desde la config guardada del club
// (setting payment_blocks) para evitar manipulación de precios.
// GET /api/financial/currency?clubId=&lang=   (público)
//
// En qué moneda se le va a cobrar a QUIEN PREGUNTA, con sus montos sugeridos.
// El modal lo consulta antes de pintar nada: sin esto tendría que adivinar la
// moneda y podría ofrecer «50.000» a alguien a quien se le van a cobrar
// dólares — que es el defecto más caro que este cambio puede introducir.
//
// El país lo pone el SERVIDOR desde el encabezado del borde, no el cliente.
// Degrada a la moneda del sitio ante cualquier fallo: esto corre en cada
// apertura del modal y no puede dejar a nadie sin poder aportar.
export const getDonationCurrency = async (req, res) => {
    const clubId = String(req.query.clubId || '').trim();
    if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });
    try {
        const decision = await resolveDonationCurrencyFor(clubId, req, req.query.lang);
        // Sin caché: la respuesta depende del país de quien pregunta, y una
        // caché intermedia le serviría a un visitante la moneda de otro.
        res.set('Cache-Control', 'no-store');
        res.json({
            currency: decision.currency,
            siteCurrency: decision.siteCurrency,
            international: decision.international,
            reason: decision.reason,
        });
    } catch (e) {
        console.warn('[FINANCIAL] moneda no resuelta (degrada a la del sitio):', e?.message);
        res.set('Cache-Control', 'no-store');
        res.json({ currency: 'USD', siteCurrency: 'USD', international: false, reason: 'club_is_international' });
    }
};

export const createSubscriptionCheckout = async (req, res) => {
    try {
        const { clubId, blockId, interval, currency = 'USD', returnUrl } = req.body || {};

        if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });
        if (!blockId) return res.status(400).json({ error: 'blockId es obligatorio' });
        if (!STRIPE_INTERVALS[interval]) return res.status(400).json({ error: 'Periodicidad inválida' });

        const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true, name: true } });
        if (!club) return res.status(404).json({ error: 'Club no encontrado' });

        // Resolver el bloque y el monto del intervalo desde la config guardada.
        const settingRow = await db.query(
            'SELECT value FROM "Setting" WHERE key = $1 AND "clubId" = $2 LIMIT 1',
            ['payment_blocks', clubId]
        );
        let blocks = [];
        try { blocks = settingRow.rows[0]?.value ? JSON.parse(settingRow.rows[0].value) : []; } catch { blocks = []; }
        // Respaldo: si el club aún no guardó sus bloques (o el bloque no está en
        // los guardados), usar los bloques por defecto — la página pública los
        // muestra igual y el socio debe poder suscribirse sin pasos previos.
        if (!Array.isArray(blocks) || blocks.length === 0) blocks = DEFAULT_PAYMENT_BLOCKS;

        let block = blocks.find(b => b && b.id === blockId);
        if (!block) block = DEFAULT_PAYMENT_BLOCKS.find(b => b.id === blockId);
        if (!block) return res.status(404).json({ error: 'Bloque de pago no encontrado' });
        if (!block.recurring) return res.status(400).json({ error: 'Este bloque no admite cobro recurrente' });

        const intervalCfg = Array.isArray(block.recurringIntervals)
            ? block.recurringIntervals.find(r => r && r.key === interval)
            : null;
        const amount = intervalCfg && Number(intervalCfg.amount) > 0 ? Number(intervalCfg.amount) : null;
        if (!amount) return res.status(400).json({ error: 'Periodicidad no disponible para este bloque' });

        const stripe = getStripe();
        const amountInCents = Math.round(amount * 100);
        const origin = resolveOrigin(req, returnUrl);
        // La MEMBRESÍA se queda en la moneda del sitio, a diferencia del
        // aporte (v4.834). No es un olvido: su importe es un PRECIO que el club
        // fijó —«$50.000 al año»— y cobrarlo en otra moneda exige convertirlo.
        // No hay tasa de cambio configurada en la plataforma e inventar una
        // está prohibido; cobrar «50.000 dólares» sería catastrófico. Cuando
        // haga falta, la vía es un importe por moneda en el bloque, no una
        // conversión al vuelo.
        const normalizedCurrency = (await resolveClubCurrency(clubId)).toLowerCase();

        const meta = {
            type: 'membership_subscription',
            clubId,
            blockId,
            interval,
            blockTitle: String(block.title || 'Membresía').slice(0, 150),
        };

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: normalizedCurrency,
                    product_data: {
                        name: `${block.title || 'Membresía'} — ${INTERVAL_LABELS[interval]}`,
                        description: `Membresía recurrente (${INTERVAL_LABELS[interval]}) — ${club.name}`,
                    },
                    unit_amount: amountInCents,
                    recurring: STRIPE_INTERVALS[interval],
                },
                quantity: 1,
            }],
            success_url: `${origin}/donacion/exito?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/aportes`,
            metadata: meta,
            subscription_data: { metadata: meta },
        });

        return res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('[FINANCIAL] Error creating subscription checkout:', error);
        return res.status(500).json({ error: error.message || 'Error creando la suscripción' });
    }
};

// GET /api/financial/donate/session/:id  (público — la página de éxito la consulta)
export const getDonationSessionStatus = async (req, res) => {
    try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(req.params.id);

        let donation = null;
        if (session.metadata?.clubId) {
            donation = await prisma.donation.findFirst({
                where: {
                    clubId: session.metadata.clubId,
                    donorEmail: session.metadata.donorEmail || session.customer_details?.email || undefined,
                    amount: session.amount_total ? session.amount_total / 100 : undefined
                },
                orderBy: { date: 'desc' }
            });
        }

        return res.json({
            status: session.status,
            paymentStatus: session.payment_status,
            amount: session.amount_total ? session.amount_total / 100 : null,
            currency: (session.currency || 'usd').toUpperCase(),
            customerEmail: session.customer_details?.email || session.customer_email,
            customerName: session.customer_details?.name || session.metadata?.donorName,
            clubId: session.metadata?.clubId || null,
            donationRecorded: !!donation
        });
    } catch (error) {
        console.error('[FINANCIAL] Error retrieving session:', error);
        return res.status(500).json({ error: 'Error consultando la sesión de pago' });
    }
};

// GET /api/financial/donations  (autenticado — el admin del club ve su historial)
// v4.414 — pg directo. El query engine de Prisma cold-starts demasiado lento.
export const listClubDonations = async (req, res) => {
    try {
        const clubId = req.user?.role === 'administrator' && req.query.clubId
            ? req.query.clubId
            : req.user?.clubId;

        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const result = await db.query(
            `SELECT id, amount, currency, "donorName", "donorEmail", status,
                    "isAnonymous", message, date, "projectId"
             FROM "Donation"
             WHERE "clubId" = $1 AND status = 'success'
             ORDER BY date DESC
             LIMIT 200`,
            [clubId]
        );

        const donations = result.rows.map(row => ({
            ...row,
            amount: parseFloat(row.amount),
            currency: normalizeCurrency(row.currency),
            isAnonymous: !!row.isAnonymous
        }));

        // v4.841 — Antes esto sumaba `amount` de todas las donaciones sin mirar
        // la moneda y rotulaba el total con la moneda de la PRIMERA fila de la
        // lista. De ahí salía «Aportes Recibidos 2 · $50.010,00», que eran
        // 10 USD más 50.000 COP.
        const preferred = await resolveClubCurrency(clubId);
        const totals = sumByCurrency(donations, d => d.amount, d => d.currency);
        const counts = {};
        for (const d of donations) counts[d.currency] = (counts[d.currency] || 0) + 1;

        const byCurrency = currenciesOf(totals, preferred).filter(Boolean).map(code => ({
            currency: code,
            decimals: currencyMeta(code).decimals,
            totalAmount: totals[code],
            totalCount: counts[code] || 0,
        }));

        const main = primaryCurrency(totals, preferred);
        const mainRow = byCurrency.find(r => r.currency === main);

        // v4.844 — Cada aporte viaja con SU movimiento. Hasta v4.843 la
        // pantalla mostraba los aportes en una pestaña y los movimientos en
        // otra, sin forma de saber cuál era de quién: son dos tablas que se
        // escriben seguidas en el mismo webhook y nada las ataba.
        const conTraza = await attachTraces(clubId, donations);

        return res.json({
            donations: conTraza.donations,
            // Cobros REALES que no nacieron de una donación —una compra de la
            // tienda, una membresía, una inscripción—. Se devuelven aparte
            // para que no desaparezcan de la pantalla al unificar la lista:
            // es dinero del club y tiene que verse en alguna parte.
            orphanMovements: conTraza.orphans,
            byCurrency,
            // Campos sueltos sobre la moneda principal, nunca sobre la mezcla.
            // `totalCount` sí es el total de la lista: contar aportes no cruza
            // monedas, y la pantalla lo usa para decir cuántos hay.
            totalAmount: mainRow?.totalAmount || 0,
            totalCount: donations.length,
            currency: main,
        });
    } catch (error) {
        console.error('[FINANCIAL] Error listing donations:', error);
        return res.status(500).json({ error: 'Error listando donaciones', detail: error.message?.slice(0, 200) });
    }
};

// En qué cubeta del dinero cae un pago. Vive en el módulo y no dentro de
// `getClubWallet` porque lo consultan DOS caminos —la Bóveda y la traza de la
// ficha del aportante—, y dos criterios sobre el mismo pago dirían cosas
// distintas en dos pantallas del mismo módulo.
const bucketOf = (p, now) => {
    if (p.status === 'refunded') return 'refunded';
    if (p.status === 'failed') return 'failed';
    if (p.status === 'pending') return 'processing';
    if (p.stripeStatus === 'pending' || (p.availableOn && new Date(p.availableOn) > now)) return 'in_transit';
    if (p.clubAvailableOn && new Date(p.clubAvailableOn) > now) return 'available_soon';
    return 'available';
};

// v4.844 — El MOVIMIENTO de un aporte, con la forma que la ficha necesita.
// Es lo mismo que `getClubWallet` arma para cada pago, y por eso el estado se
// decide con `bucketOf`: dos criterios distintos sobre el mismo pago dirían
// cosas distintas en dos pantallas del mismo módulo.
const movementOf = (p, now) => {
    const payload = parsePayload(p.rawPayload);
    const currency = normalizeCurrency(p.currency);
    const grossAmount = parseFloat(p.amount || 0);
    const netClub = parseFloat(p.netAmount || 0);
    const platformFee = parseFloat(p.applicationFee || 0);
    return {
        id: p.id,
        providerRef: p.providerRef,
        currency,
        decimals: currencyMeta(currency).decimals,
        grossAmount,
        stripeFee: Math.max(0, grossAmount - netClub - platformFee),
        applicationFee: platformFee,
        amount: netClub,
        status: p.status,
        stripeStatus: p.stripeStatus,
        bucket: bucketOf(p, now),
        availableOn: p.availableOn,
        clubAvailableOn: p.clubAvailableOn,
        createdAt: p.createdAt,
        stripeBalanceTxId: p.stripeBalanceTxId,
        // La traza: de dónde vino, cómo se pagó y dónde está su recibo.
        origin: originOf(payload),
        method: methodOf(payload, p.paymentMethod),
        receiptUrl: payload.receiptUrl || null,
        receiptNumber: payload.receiptNumber || null,
    };
};

/** Le pega a cada aporte su movimiento, y devuelve los pagos que no casaron. */
const attachTraces = async (clubId, donations) => {
    const now = new Date();
    try {
        const { rows } = await db.query(
            `SELECT id, "providerRef", status, amount, currency, "applicationFee",
                    "netAmount", "stripeBalanceTxId", "stripeStatus",
                    "availableOn", "clubAvailableOn", "paymentMethod",
                    "rawPayload", "createdAt"
             FROM "Payment"
             WHERE "clubId" = $1 AND "isPlatformCollection" = true
             ORDER BY "createdAt" DESC
             LIMIT 500`,
            [clubId]
        );

        const { links, orphans } = linkDonationsToPayments(donations, rows);

        return {
            donations: donations.map(d => {
                const enlace = links.get(d.id);
                return {
                    ...d,
                    movement: enlace ? movementOf(enlace.payment, now) : null,
                    // Se DECLARA cómo se ató. Una coincidencia deducida no
                    // puede presentarse como un hecho: los aportes anteriores
                    // a v4.844 no tienen vínculo y se emparejan por club,
                    // moneda, importe y momento.
                    movementMatch: enlace?.match || null,
                };
            }),
            orphans: orphans.map(p => movementOf(p, now)),
        };
    } catch (e) {
        // Sin traza la lista se sigue mostrando: es una mejora de la ficha, no
        // un requisito para ver quién donó.
        console.warn('[FINANCIAL] traza de aportes no resuelta:', e?.message);
        return { donations: donations.map(d => ({ ...d, movement: null, movementMatch: null })), orphans: [] };
    }
};

// v4.421 — Mini-wallet financiera con sync Stripe. Devuelve los Payments del
// club agrupados en buckets por estado real del dinero, con fechas estimadas
// de disponibilidad (Stripe) y de retiro (Stripe + 6 días margen Valkomen).
// GET /api/financial/wallet  (auth, ?clubId opcional para super admin)
export const getClubWallet = async (req, res) => {
    try {
        const clubId = req.user?.role === 'administrator' && req.query.clubId
            ? req.query.clubId
            : req.user?.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const now = new Date();

        // pg directo (cold-start safe — ver v4.414)
        const paymentsResult = await db.query(
            `SELECT id, "providerRef", status, amount, currency, "applicationFee",
                    "netAmount", "stripeBalanceTxId", "stripeStatus",
                    "availableOn", "clubAvailableOn", "paymentMethod",
                    "createdAt"
             FROM "Payment"
             WHERE "clubId" = $1 AND "isPlatformCollection" = true
             ORDER BY "createdAt" DESC
             LIMIT 500`,
            [clubId]
        );

        const payoutsResult = await db.query(
            `SELECT id, amount, currency, status, "createdAt"
             FROM "PayoutRequest"
             WHERE "clubId" = $1
             ORDER BY "createdAt" DESC`,
            [clubId]
        );

        const items = paymentsResult.rows.map(p => {
            const currency = normalizeCurrency(p.currency);
            const grossAmount = parseFloat(p.amount || 0);
            const netClub = parseFloat(p.netAmount || 0);
            const platformFee = parseFloat(p.applicationFee || 0);
            // La comisión de Stripe se DEDUCE restando porque no tiene columna
            // propia: hoy sólo vive dentro del JSON de `rawPayload`. Es lo que
            // la Fase 1 corrige con `FeeComponent` — cada comisión guardada
            // como tal, con su base y su tasa, en vez de reconstruida acá.
            const stripeFee = Math.max(0, grossAmount - netClub - platformFee);
            return {
                id: p.id,
                providerRef: p.providerRef,
                amount: netClub,
                grossAmount,
                stripeFee,
                netStripe: grossAmount - stripeFee,
                applicationFee: platformFee,
                fee: stripeFee + platformFee,
                currency,
                decimals: currencyMeta(currency).decimals,
                status: p.status,
                stripeStatus: p.stripeStatus,
                availableOn: p.availableOn,
                clubAvailableOn: p.clubAvailableOn,
                paymentMethod: p.paymentMethod || 'card',
                stripeBalanceTxId: p.stripeBalanceTxId,
                createdAt: p.createdAt,
                bucket: bucketOf(p, now),
            };
        });

        const BUCKETS = ['processing', 'in_transit', 'available_soon', 'available', 'refunded', 'failed'];
        const byCurrencyItems = groupByCurrency(items, it => it.currency);
        const payoutsByCurrency = groupByCurrency(payoutsResult.rows, p => p.currency);

        const preferred = await resolveClubCurrency(clubId);
        const grossTotals = sumByCurrency(items, it => it.grossAmount, it => it.currency);
        const codes = currenciesOf(grossTotals, preferred);

        // Una wallet por moneda. Ninguna cifra de acá cruza con la de al lado.
        const wallets = codes.filter(Boolean).map(code => {
            const own = byCurrencyItems[code] || [];
            const ownPayouts = payoutsByCurrency[code] || [];
            const inBucket = (name) => own.filter(it => it.bucket === name);

            const buckets = {};
            for (const name of BUCKETS) {
                const list = inBucket(name);
                buckets[name] = {
                    total: roundMoney(list.reduce((a, it) => a + it.amount, 0), code),
                    count: list.length,
                    items: list,
                };
            }

            const transferred = roundMoney(
                ownPayouts.filter(p => p.status === 'completed')
                    .reduce((a, p) => a + parseFloat(p.amount || 0), 0), code);
            const requested = roundMoney(
                ownPayouts.filter(p => ['pending', 'processing'].includes(p.status))
                    .reduce((a, p) => a + parseFloat(p.amount || 0), 0), code);

            return {
                currency: code,
                decimals: currencyMeta(code).decimals,
                buckets,
                summary: {
                    grossTotal: roundMoney(own.reduce((a, it) => a + it.grossAmount, 0), code),
                    netTotal: roundMoney(own.reduce((a, it) => a + it.amount, 0), code),
                    feesTotal: roundMoney(own.reduce((a, it) => a + it.fee, 0), code),
                    inTransit: roundMoney(buckets.in_transit.total + buckets.processing.total, code),
                    availableSoon: buckets.available_soon.total,
                    availableForWithdrawal: Math.max(0, roundMoney(buckets.available.total - transferred - requested, code)),
                    transferred,
                    requested,
                    refunded: buckets.refunded.total,
                },
            };
        });

        // Los campos sueltos se conservan sobre la moneda PRINCIPAL, por el
        // mismo motivo que en `/payouts/balance`: un navegador con el bundle
        // anterior en caché muestra una cifra verdadera de una sola moneda en
        // vez de la mezcla. `currency` dice cuál, en vez del literal 'USD'.
        const main = wallets.find(w => w.currency === primaryCurrency(grossTotals, preferred)) || wallets[0] || null;

        return res.json({
            wallets,
            currencies: wallets.map(w => w.currency),
            currency: main?.currency || preferred,
            buckets: main?.buckets || {},
            summary: main?.summary || {},
            platformHoldingDays: PLATFORM_HOLDING_DAYS,
        });
    } catch (error) {
        console.error('[FINANCIAL] Error en wallet:', error);
        return res.status(500).json({ error: 'Error consultando wallet', detail: error.message?.slice(0, 200) });
    }
};

// v4.418 — Diagnóstico de configuración de email. Sin exponer secretos:
// solo reporta presencia/ausencia de keys, lista de dominios verificados en
// Resend (si la API lo permite), y conteo de SMTP fallbacks disponibles.
// GET /api/financial/email-status  (auth, super admin)
export const getEmailDiagnostics = async (req, res) => {
    if (req.user?.role !== 'administrator') {
        return res.status(403).json({ error: 'Solo super administradores' });
    }

    const hasResendKey = !!process.env.RESEND_API_KEY;
    const result = {
        resend: { configured: hasResendKey, domains: null, error: null },
        smtpFallback: { available: false, count: 0 },
        sender: '"Club Platform for Rotary" <noreply@clubplatform.org>',
        platformConfig: { emailFrom: null, emailProvider: null }
    };

    // Verifica si Resend acepta la API key y lista dominios
    if (hasResendKey) {
        try {
            const resp = await fetch('https://api.resend.com/domains', {
                headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
            });
            const data = await resp.json();
            if (!resp.ok) {
                result.resend.error = data.message || `HTTP ${resp.status}`;
            } else {
                result.resend.domains = (data.data || []).map(d => ({
                    name: d.name,
                    status: d.status,
                    region: d.region
                }));
            }
        } catch (e) {
            result.resend.error = e.message?.slice(0, 200);
        }
    }

    // Cuenta SMTP fallbacks (super admin SMTP)
    try {
        const smtpCount = await prisma.notificationConfig.count({
            where: { type: 'smtp', enabled: true }
        });
        result.smtpFallback.available = smtpCount > 0;
        result.smtpFallback.count = smtpCount;
    } catch { /* ignore */ }

    // PlatformConfig overrides
    try {
        const configs = await prisma.platformConfig.findMany({
            where: { key: { in: ['email_from', 'email_provider'] } }
        });
        configs.forEach(c => {
            if (c.key === 'email_from') result.platformConfig.emailFrom = c.value;
            if (c.key === 'email_provider') result.platformConfig.emailProvider = c.value;
        });
    } catch { /* ignore */ }

    return res.json(result);
};

// v4.418 — Disparar un email de prueba para verificar que la pipeline funciona.
// POST /api/financial/email-test  (auth, super admin)
// Body: { to: '...' }
export const sendTestEmail = async (req, res) => {
    if (req.user?.role !== 'administrator') {
        return res.status(403).json({ error: 'Solo super administradores' });
    }

    const { to } = req.body || {};
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
        return res.status(400).json({ error: 'Email destinatario inválido' });
    }

    const html = `
<div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #f8fafc;">
    <div style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h2 style="color: #0B223F; margin: 0 0 16px;">✅ Email de prueba — Club Platform</h2>
        <p style="color: #4b5563; line-height: 1.6;">Este es un correo de prueba enviado desde Club Platform a través de Resend / SMTP fallback.</p>
        <p style="color: #6b7280; font-size: 14px;">Si recibiste este email, significa que la pipeline de notificaciones transaccionales está funcionando correctamente.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Disparado a las ${new Date().toISOString()}</p>
    </div>
</div>`;

    try {
        const result = await EmailService.sendPlatformEmail({
            to,
            subject: '✅ Email de prueba — Club Platform',
            html,
            from: '"Club Platform for Rotary" <noreply@clubplatform.org>'
        });
        console.log(`[FINANCIAL] Email test enviado a ${to}:`, result);
        return res.json({
            success: result.success === true,
            messageId: result.messageId || null,
            error: result.error || null,
            to
        });
    } catch (e) {
        console.error('[FINANCIAL] Email test error:', e);
        return res.status(500).json({ success: false, error: e.message?.slice(0, 200), to });
    }
};

// v4.422 — Sync retroactivo de Payments existentes con Stripe.
// Los Payments creados antes de v4.421 no tienen availableOn, stripeStatus
// ni fee real. Este endpoint los recorre, consulta Stripe, y los enriquece.
// POST /api/financial/wallet/sync-stripe  Body: { clubId?, force? }
//   - clubId opcional (super admin puede targetear un club específico)
//   - force=true reprocesa Payments que ya tienen availableOn
export const syncPaymentsWithStripe = async (req, res) => {
    try {
        const targetClubId = req.user?.role === 'administrator' && req.body?.clubId
            ? req.body.clubId
            : req.user?.clubId;
        if (!targetClubId) return res.status(400).json({ error: 'clubId requerido' });

        const force = req.body?.force === true;

        // Listamos Payments candidatos: del club, con providerRef, succeeded.
        // Por defecto sólo los que no tienen availableOn (los nuevos ya vienen sincronizados).
        const candidates = await prisma.payment.findMany({
            where: {
                clubId: targetClubId,
                provider: 'stripe',
                status: 'succeeded',
                providerRef: { not: null },
                ...(force ? {} : { availableOn: null })
            },
            select: {
                id: true, providerRef: true, amount: true, currency: true,
                applicationFee: true, availableOn: true, stripeBalanceTxId: true,
                rawPayload: true
            },
            take: 200
        });

        if (candidates.length === 0) {
            return res.json({ synced: 0, failed: 0, skipped: 0, total: 0, details: [] });
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
        const results = { synced: 0, failed: 0, skipped: 0, total: candidates.length, details: [] };

        for (const payment of candidates) {
            try {
                let paymentIntentId = payment.providerRef;

                // El providerRef puede ser cs_... (Checkout Session) o pi_... (PaymentIntent)
                if (paymentIntentId.startsWith('cs_')) {
                    const session = await stripe.checkout.sessions.retrieve(paymentIntentId);
                    paymentIntentId = session.payment_intent;
                    if (!paymentIntentId) {
                        results.failed++;
                        results.details.push({ id: payment.id, error: 'Session sin payment_intent' });
                        continue;
                    }
                }

                const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
                    expand: ['latest_charge.balance_transaction', 'latest_charge.payment_method_details']
                });
                const charge = pi.latest_charge;
                const bt = charge?.balance_transaction;

                if (!bt) {
                    results.skipped++;
                    results.details.push({ id: payment.id, skipped: 'Charge sin balance transaction aún' });
                    continue;
                }

                const realFee = (bt.fee || 0) / 100;
                const totalAmount = payment.amount;
                const applicationFee = totalAmount * PLATFORM_FEE_PERCENTAGE;
                const newNetAmount = Math.max(0, totalAmount - applicationFee - realFee);

                const availableOn = bt.available_on ? new Date(bt.available_on * 1000) : null;
                const clubAvailableOn = availableOn
                    ? new Date(availableOn.getTime() + PLATFORM_HOLDING_DAYS * 24 * 60 * 60 * 1000)
                    : null;

                // v4.844 — Se rellena también la TRAZA: el origen del aporte,
                // el método de pago y el recibo. Los pagos anteriores a v4.844
                // no la tienen, y sin ella la ficha del aportante no puede
                // decir de qué campaña vino ni con qué tarjeta se pagó. Este
                // botón ya consultaba Stripe: aprovecharlo evita inventar un
                // segundo proceso de relleno.
                //
                // Se MEZCLA sobre lo que ya había en vez de reemplazarlo: ahí
                // vive el `donationId` que ata el aporte a su movimiento, y
                // pisarlo rompería justo lo que esto viene a arreglar.
                const payload = parsePayload(payment.rawPayload);
                const card = charge?.payment_method_details?.card;
                const enriquecido = {
                    ...payload,
                    stripeFee: realFee,
                    campaignId: payload.campaignId ?? (pi.metadata?.campaignId || null),
                    campaignSlug: payload.campaignSlug ?? (pi.metadata?.campaignSlug || null),
                    purpose: payload.purpose ?? (pi.metadata?.purpose || null),
                    blockId: payload.blockId ?? (pi.metadata?.blockId || null),
                    projectId: payload.projectId ?? (pi.metadata?.projectId || null),
                    card: card ? { brand: card.brand || '', last4: card.last4 || '', wallet: card.wallet?.type || '' } : payload.card || null,
                    receiptUrl: charge?.receipt_url || payload.receiptUrl || null,
                    receiptNumber: charge?.receipt_number || payload.receiptNumber || null,
                };

                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        stripeBalanceTxId: bt.id,
                        stripeStatus: bt.status || 'pending',
                        availableOn,
                        clubAvailableOn,
                        paymentMethod: charge?.payment_method_details?.type || 'card',
                        applicationFee,
                        netAmount: newNetAmount,
                        rawPayload: JSON.stringify(enriquecido)
                    }
                });

                results.synced++;
                results.details.push({
                    id: payment.id,
                    stripeStatus: bt.status,
                    availableOn: availableOn?.toISOString(),
                    realFee,
                    newNetAmount
                });
            } catch (paymentErr) {
                results.failed++;
                results.details.push({ id: payment.id, error: paymentErr.message?.slice(0, 200) });
                console.error(`[Wallet Sync] Payment ${payment.id} failed:`, paymentErr.message);
            }
        }

        return res.json(results);
    } catch (error) {
        console.error('[FINANCIAL] Error syncing payments with Stripe:', error);
        return res.status(500).json({ error: 'Error sincronizando con Stripe', detail: error.message?.slice(0, 200) });
    }
};
