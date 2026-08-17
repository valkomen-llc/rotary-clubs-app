// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — el ENVÍO
// v4.857.0 (Fase 2)
//
// Une las tres piezas: resuelve QUÉ perfil aplica, CON QUÉ plantilla y DESDE
// QUÉ dirección, y manda. El criterio de cada una de las tres vive en
// `notificationSpec.js` y `notificationTemplate.js`, que son puros.
//
// ── CORRE DENTRO DEL WEBHOOK DE STRIPE ──────────────────────────────
//
// Después de acreditar el cobro. Nada de acá lanza: una excepción tumbaría el
// `200` que Stripe espera y provocaría el reintento de un evento ya procesado.
// Todo devuelve `{ ok, ... }` con el motivo escrito.
//
// ── SIN PERFIL, SALE EL RECIBO DE SIEMPRE ───────────────────────────
//
// Es el último escalón de la jerarquía (criterio 19) y lo que hace que esta
// fase no rompa nada: un sitio sin ningún perfil configurado sigue recibiendo
// exactamente el correo de v4.855, con su remitente y su asunto. Lo decide
// `pickProfileFor` devolviendo `null`, y el llamador se encarga.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import EmailService from '../services/EmailService.js';
import ensureNotificationSchema from './ensureNotificationSchema.js';
import { verifiedDomains } from './senderDomains.js';
import { claimDelivery, markSent, markFailed, pendingRetries } from './notificationLog.js';
import {
    pickProfileFor, resolveSenderPlan, resolveRecipients, normalizeEmail,
} from './notificationSpec.js';
import { renderTemplate, templateShape, defaultTemplateFor } from './notificationTemplate.js';

const fallo = (reason) => ({ ok: false, reason });

/* ─── Leer lo configurado ────────────────────────────────────────────*/

/**
 * El perfil que le toca a este aporte, con su entidad y su plantilla.
 *
 * Devuelve `{ profile: null }` cuando no hay ninguno: NO es un error, es el
 * caso normal de un sitio que todavía no configuró nada, y el llamador manda
 * el recibo de siempre.
 */
export const resolveNotificationPlan = async ({ clubId, campaignId = null, event = 'payment_confirmed' }) => {
    try {
        await ensureNotificationSchema();

        const { rows: sitio } = await db.query(
            `SELECT id, name, email, domain, district, "districtId" FROM "Club" WHERE id = $1 LIMIT 1`,
            [clubId]
        );
        if (!sitio[0]) return { profile: null, reason: 'el sitio no existe', site: null };

        const { rows: perfiles } = await db.query(
            `SELECT * FROM "NotificationProfile" WHERE active`
        );

        let campaign = null;
        if (campaignId) {
            const { rows } = await db.query(
                `SELECT id, name, slug, "notificationProfileId" FROM "ContributionCampaign" WHERE id = $1 LIMIT 1`,
                [campaignId]
            );
            campaign = rows[0] || null;
        }

        const elegido = pickProfileFor({ profiles: perfiles, site: sitio[0], campaign });
        if (!elegido.profile) return { profile: null, reason: elegido.reason, site: sitio[0], campaign };

        const { rows: bens } = await db.query(
            `SELECT * FROM "NotificationBeneficiary" WHERE id = $1 LIMIT 1`,
            [elegido.profile.beneficiaryId]
        );

        return {
            profile: elegido.profile,
            reason: elegido.reason,
            beneficiary: bens[0] || null,
            site: sitio[0],
            campaign,
        };
    } catch (e) {
        // Un fallo leyendo la configuración NO puede dejar al aportante sin
        // confirmación: se degrada al recibo de siempre.
        console.warn('[NOTIF-SENDER] no se pudo resolver el perfil:', e?.message);
        return { profile: null, reason: `no se pudo resolver el perfil: ${e?.message}`, site: null };
    }
};

/** La plantilla vigente para esta combinación, con el fallback del criterio 19.
 *  El último escalón es la de fábrica: ninguna contribución se queda sin
 *  notificación porque falte una personalización. */
const plantillaPara = async ({ profileId, campaignId, event, recipientKind }) => {
    const intentos = [
        campaignId ? { sql: `"campaignId" = $1`, args: [campaignId], origen: 'campaña' } : null,
        profileId ? { sql: `"profileId" = $1 AND "campaignId" IS NULL`, args: [profileId], origen: 'perfil' } : null,
        { sql: `"profileId" IS NULL AND "campaignId" IS NULL`, args: [], origen: 'plataforma' },
    ].filter(Boolean);

    for (const i of intentos) {
        const { rows } = await db.query(
            `SELECT * FROM "NotificationTemplate"
              WHERE ${i.sql} AND event = $${i.args.length + 1} AND "recipientKind" = $${i.args.length + 2} AND "isCurrent"
              LIMIT 1`,
            [...i.args, event, recipientKind]
        );
        if (rows[0]) return { template: templateShape(rows[0]), version: rows[0].version, source: i.origen };
    }
    // La de fábrica depende del PAPEL: el aviso interno informa de un
    // movimiento, no agradece un aporte que ese destinatario no hizo.
    // La de fábrica depende del PAPEL y del EVENTO: con sólo el papel, un
    // reembolso saldría agradeciendo el aporte que se acaba de devolver.
    return { template: defaultTemplateFor(recipientKind, event), version: 0, source: 'fábrica' };
};

/* ─── El envío ───────────────────────────────────────────────────────*/

/**
 * Manda las notificaciones de un aporte confirmado.
 *
 * Una por destinatario, cada una con su propio reclamo: si el correo del
 * aportante falla, el de la entidad no tiene por qué caerse con él.
 *
 * Devuelve el detalle de lo ocurrido —enviadas, saltadas y fallidas— para que
 * el llamador lo pueda registrar en consola. NUNCA lanza.
 */
export const sendContributionNotifications = async (args) => {
    // El try envuelve TODO el cuerpo a propósito: «nunca lanza» tiene que ser
    // una propiedad del código y no un argumento sobre qué puede fallar por
    // dentro. Cualquier cosa que se agregue acá queda protegida sola.
    try {
        return await enviarTodas(args);
    } catch (e) {
        console.error('[NOTIF-SENDER] fallo inesperado:', e?.message);
        return { ok: false, handled: false, reason: e?.message || String(e) };
    }
};

const enviarTodas = async ({
    contributionId, clubId, campaignId = null, event = 'payment_confirmed',
    donorEmail = '', vars = {},
}) => {
    const plan = await resolveNotificationPlan({ clubId, campaignId, event });
    if (!plan.profile) return { ok: false, handled: false, reason: plan.reason };

    const { profile, beneficiary, site, campaign } = plan;

    // Los destinatarios que este perfil pide para este evento. Los papeles que
    // se pidieron y no se pudieron resolver vienen con su motivo: un aviso
    // marcado que no sale y no lo dice es el silencio que este módulo existe
    // para no tener.
    const { recipients, skipped } = resolveRecipients({
        profile, event, donorEmail,
        beneficiary, siteEmail: site?.email || '',
    });
    for (const s of skipped) {
        console.warn(`[NOTIF-SENDER] ${contributionId}: no se avisó a «${s.kind}» — ${s.reason}`);
    }
    if (!recipients.length) {
        return { ok: true, handled: true, sent: 0, skipped, reason: 'el perfil no resolvió ningún destinatario' };
    }

    // El remitente se resuelve UNA vez por aporte: es el mismo para todos los
    // destinatarios, y consultar los dominios por cada uno sería repetir la
    // misma pregunta.
    const dominios = await verifiedDomains();
    const remitente = resolveSenderPlan({
        profile,
        siteDomain: site?.domain || '',
        verifiedDomains: dominios,
    });
    console.log(`[NOTIF-SENDER] ${contributionId}: remitente N${remitente.level} (${remitente.address}) — ${remitente.reason}`);

    const variables = {
        ...vars,
        site_name: vars.site_name || site?.name || '',
        campaign_name: vars.campaign_name || campaign?.name || '',
        beneficiary_name: vars.beneficiary_name || beneficiary?.tradeName || beneficiary?.legalName || '',
        contribution_id: vars.contribution_id || contributionId,
    };

    const resultados = [];
    for (const dest of recipients) {
        const r = await enviarUno({
            contributionId, event, dest, profile, beneficiary, campaign, site,
            campaignId, clubId, remitente, variables,
        });
        resultados.push(r);
    }

    return {
        ok: true, handled: true,
        sent: resultados.filter(r => r.sent).length,
        failed: resultados.filter(r => r.failed).length,
        duplicated: resultados.filter(r => r.duplicated).length,
        sender: { level: remitente.level, address: remitente.address, reason: remitente.reason },
        profile: { id: profile.id, name: profile.name, reason: plan.reason },
        skipped,
    };
};

const enviarUno = async ({
    contributionId, event, dest, profile, beneficiary, campaign, site,
    campaignId, clubId, remitente, variables,
}) => {
    try {
        const { template, version, source } = await plantillaPara({
            profileId: profile.id, campaignId, event, recipientKind: dest.kind,
        });

        const salida = renderTemplate({
            template, vars: variables,
            identity: profile.identity || {},
            beneficiary,
        });
        if (salida.missing.length) {
            // Una variable sin valor deja el marcador impreso: se ve y se
            // corrige. Se anota igual para poder encontrarlo sin que alguien
            // tenga que reportarlo.
            console.warn(`[NOTIF-SENDER] ${contributionId} → ${dest.kind}: sin resolver ${salida.missing.join(', ')}`);
        }

        // El reclamo va ANTES del envío, como en la Fase 0: el índice único es
        // lo que impide que dos entregas concurrentes del webhook manden dos
        // correos a la misma persona.
        const traza = await claimDelivery({
            contributionId, event, recipient: dest.email, recipientKind: dest.kind,
            clubId, campaignId,
            beneficiaryId: beneficiary?.id || null,
            profileId: profile.id,
            templateVersion: version,
            provider: 'resend',
            fromAddress: remitente.address,
            subject: salida.subject,
        });
        if (traza.ok && !traza.claimed) {
            console.log(`[NOTIF-SENDER] ${contributionId} → ${dest.email}: ya enviado (${traza.reason})`);
            return { duplicated: true };
        }
        if (!traza.ok) {
            console.warn(`[NOTIF-SENDER] ${contributionId} → ${dest.email}: sin registrar (${traza.reason}); se envía igual`);
        }

        const resultado = await EmailService.sendPlatformEmail({
            to: dest.email,
            subject: salida.subject,
            html: salida.html,
            text: salida.text,
            from: remitente.from,
            replyTo: remitente.replyTo || undefined,
        });

        if (resultado?.success) {
            if (traza.delivery?.id) await markSent(traza.delivery.id, { providerMessageId: resultado.messageId || null });
            console.log(`[NOTIF-SENDER] ✉️  ${contributionId} → ${dest.email} (${dest.kind}, plantilla ${source} v${version})`);
            return { sent: true };
        }

        if (traza.delivery?.id) {
            // El motivo del proveedor se guarda TEXTUAL. `sendPlatformEmail`
            // no distingue un rechazo definitivo de uno pasajero —devuelve
            // `{success:false, error}` para los dos—, así que se deja abierta
            // la puerta al reintento y el motivo queda escrito para decidir
            // mirándolo.
            await markFailed(traza.delivery.id, {
                errorMessage: resultado?.error || 'sin motivo devuelto por el proveedor',
                retryable: true,
            });
        }
        console.error(`[NOTIF-SENDER] ❌ ${contributionId} → ${dest.email}: ${resultado?.error || 'sin motivo'}`);
        return { failed: true };
    } catch (e) {
        console.error(`[NOTIF-SENDER] 💥 ${contributionId} → ${dest.email}:`, e?.message);
        return { failed: true };
    }
};

/* ════════════════════════════════════════════════════════════════════
   EL BARRIDO DE REINTENTOS  (v4.859)
   ════════════════════════════════════════════════════════════════════
 *
 * ── SE VUELVE A COMPONER, NO SE GUARDA EL HTML ──────────────────
 *
 * La fila registra QUÉ se intentó mandar —a quién, de qué aporte, con qué
 * plantilla—, no el cuerpo. Guardar el HTML de cada envío serían decenas de KB
 * por fila en una tabla que se lee en cada listado de la Bóveda, y además
 * dejaría el correo congelado con una plantilla que quizá ya se corrigió: si
 * algo falló y se arregló, el reintento tiene que salir con lo arreglado.
 *
 * ── PRESUPUESTO DE TIEMPO ───────────────────────────────────────
 *
 * La función corta a los 300 s (`vercel.json`): se atiende lo que quepa y el
 * resto espera al minuto siguiente. No se pierde nada — la cola se calcula
 * leyendo la base, no manteniéndola en memoria.
 */
export const sweepRetries = async ({ limit = 20, timeBudgetMs = 60_000 } = {}) => {
    const arranque = Date.now();
    const filas = await pendingRetries({ limit });
    let reintentadas = 0, logradas = 0, agotadas = 0;

    for (const fila of filas) {
        if (Date.now() - arranque > timeBudgetMs) break;
        try {
            // Se vuelve a tomar la fila con `allowRetry`: el propio
            // `claimDelivery` incrementa `retryCount` con un UPDATE
            // condicional, así que dos barridos simultáneos no reintentan el
            // mismo envío dos veces.
            const traza = await claimDelivery({
                contributionId: fila.contributionId, event: fila.event,
                recipient: fila.recipient, recipientKind: fila.recipientKind,
                clubId: fila.clubId, campaignId: fila.campaignId,
                beneficiaryId: fila.beneficiaryId, profileId: fila.profileId,
                provider: fila.provider, fromAddress: fila.fromAddress, subject: fila.subject,
            }, { allowRetry: true });
            if (!traza.ok || !traza.claimed) { agotadas++; continue; }

            const salida = await reintentarUno(fila, traza.delivery.id);
            reintentadas++;
            if (salida) logradas++;
        } catch (e) {
            console.warn(`[NOTIF-RETRY] ${fila.id}:`, e?.message);
        }
    }

    return { pendientes: filas.length, reintentadas, logradas, agotadas, elapsedMs: Date.now() - arranque };
};

const reintentarUno = async (fila, deliveryId) => {
    const plan = await resolveNotificationPlan({
        clubId: fila.clubId, campaignId: fila.campaignId, event: fila.event,
    });
    if (!plan.profile) {
        // El perfil desapareció o dejó de alcanzar al sitio. No se inventa un
        // correo con otra identidad: se cierra el intento diciendo por qué.
        await markFailed(deliveryId, {
            errorMessage: `ya no hay perfil aplicable: ${plan.reason}`,
            retryable: false,
        });
        return false;
    }

    const { template, version } = await plantillaPara({
        profileId: plan.profile.id, campaignId: fila.campaignId,
        event: fila.event, recipientKind: fila.recipientKind,
    });
    // Los datos del aporte se vuelven a leer: el correo se compone de nuevo,
    // así que tiene que llevar las cifras de verdad y no un resumen guardado.
    const vars = await variablesDelAporte(fila, plan);
    const salida = renderTemplate({
        template, vars, identity: plan.profile.identity || {}, beneficiary: plan.beneficiary,
    });

    const dominios = await verifiedDomains();
    const remitente = resolveSenderPlan({
        profile: plan.profile, siteDomain: plan.site?.domain || '', verifiedDomains: dominios,
    });

    const resultado = await EmailService.sendPlatformEmail({
        to: fila.recipient, subject: salida.subject, html: salida.html, text: salida.text,
        from: remitente.from, replyTo: remitente.replyTo || undefined,
    });

    if (resultado?.success) {
        await markSent(deliveryId, { providerMessageId: resultado.messageId || null, fromAddress: remitente.address, subject: salida.subject });
        console.log(`[NOTIF-RETRY] ✉️  ${fila.contributionId} → ${fila.recipient} (intento ${fila.retryCount + 1})`);
        return true;
    }
    await markFailed(deliveryId, {
        errorMessage: resultado?.error || 'sin motivo devuelto por el proveedor',
        retryable: true,
    });
    return false;
};

/** Las variables del aporte, leídas de la base. El correo se compone de nuevo,
 *  así que las cifras tienen que ser las de verdad. Si el aporte ya no está
 *  —no debería pasar—, se manda lo que se sabe en vez de nada. */
const variablesDelAporte = async (fila, plan) => {
    try {
        const { rows } = await db.query(
            `SELECT amount, currency, "donorName", "donorEmail", "isAnonymous", message, date
               FROM "Donation" WHERE id = $1 LIMIT 1`,
            [fila.contributionId]
        );
        const d = rows[0];
        if (!d) return { contribution_id: fila.contributionId, site_name: plan.site?.name || '' };
        return {
            donor_name: d.isAnonymous ? 'Donante anónimo' : (d.donorName || 'amigo'),
            donor_email: d.donorEmail || fila.recipient,
            amount: new Intl.NumberFormat('es-CO', {
                minimumFractionDigits: d.currency === 'COP' ? 0 : 2,
                maximumFractionDigits: d.currency === 'COP' ? 0 : 2,
            }).format(Number(d.amount) || 0),
            currency: d.currency,
            contribution_id: fila.contributionId,
            contribution_date: new Date(d.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }),
            donor_message: d.message || '',
            site_name: plan.site?.name || '',
            campaign_name: plan.campaign?.name || '',
            beneficiary_name: plan.beneficiary?.tradeName || plan.beneficiary?.legalName || '',
        };
    } catch {
        return { contribution_id: fila.contributionId };
    }
};

export default { resolveNotificationPlan, sendContributionNotifications, sweepRetries };
