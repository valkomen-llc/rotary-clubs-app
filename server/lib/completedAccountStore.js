// ════════════════════════════════════════════════════════════════════
// Servicio de aprovisionamiento, conciliación de identidad y activación
// de cuentas de participantes de eventos — Club Platform for Rotary
//
// Conecta el criterio puro de `completedAccountSpec.js` con PostgreSQL,
// `EmailService`, WhatsApp (`WhatsAppConfig` / `NotificationConfig`) y la
// bitácora de auditoría (`EventRegistrationHistory` + `EventRegistrationMessage`).
// ════════════════════════════════════════════════════════════════════

import bcrypt from 'bcryptjs';
import db from './db.js';
import { EmailService } from '../services/EmailService.js';
import { normalizeForMeta } from './phone.js';
import { recordHistory } from './eventRegistrationStore.js';
import { eventBrandingFor } from './completedRegistrationStore.js';
import {
    UNUSABLE_PASSWORD_HASH,
    DEFAULT_ACTIVATION_TTL_HOURS,
    ACCOUNT_STATUS_KEYS,
    ACTIVATION_STATUS_KEYS,
    accountStatusMeta,
    activationStatusMeta,
    normalizeEmail,
    normalizeDocument,
    isValidEmail,
    isAccountActivated,
    reconcileParticipantIdentity,
    deriveAccountAndActivationState,
    generateActivationToken,
    hashActivationToken,
    buildActivationUrl,
    buildPortalUrl,
    redactActivationSecrets,
    generateTemporaryPassword,
    buildActivationVariables,
    verifyRecipientOwnsActivationToken,
    renderActivationEmail,
    renderActivationWhatsApp,
    DEFAULT_ACTIVATION_EMAIL_SUBJECT,
    DEFAULT_ACTIVATION_EMAIL_BODY,
    DEFAULT_ACTIVATION_WHATSAPP_BODY,
} from './completedAccountSpec.js';

const PLATFORM_SENDER =
    process.env.RESEND_FROM_EMAIL
    || 'Rotary Club Platform <notificaciones@rotaryclubplatform.com>';

// Transporte inyectable para pruebas de WhatsApp sin tocar Meta en los tests.
let _customWhatsAppSender = null;
export const setWhatsAppTransport = (fn) => {
    _customWhatsAppSender = typeof fn === 'function' ? fn : null;
};

/**
 * Envía un mensaje de texto por WhatsApp usando la configuración activa del
 * sitio/distrito/club (`WhatsAppConfig` o `NotificationConfig`), o el
 * transporte inyectado en pruebas.
 */
export const sendParticipantWhatsApp = async ({ clubId, to, text }) => {
    const cleanPhone = normalizeForMeta(String(to || ''));
    if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 7) {
        return { sent: false, providerId: null, error: 'Número de teléfono o WhatsApp inválido.' };
    }

    if (_customWhatsAppSender) {
        try {
            const res = await _customWhatsAppSender({ clubId, to: cleanPhone, text });
            if (res && res.success === false) {
                return { sent: false, providerId: null, error: res.error || 'Fallo del proveedor de WhatsApp' };
            }
            return { sent: true, providerId: res?.messageId || res?.providerId || 'wa-test-id', error: null };
        } catch (err) {
            return { sent: false, providerId: null, error: err?.message || 'Error al enviar WhatsApp' };
        }
    }

    try {
        // 1. Buscar conexión en `WhatsAppConnection` o `WhatsAppConfig`
        let token = null;
        let phoneNumberId = null;

        if (clubId) {
            try {
                const connRes = await db.query(
                    `SELECT "accessToken", "phoneNumberId", status
                       FROM "WhatsAppConnection"
                      WHERE "clubId" = $1 AND status = 'active'
                      ORDER BY "isDefault" DESC, "createdAt" ASC LIMIT 1`,
                    [clubId],
                );
                if (connRes.rows[0]?.accessToken && connRes.rows[0]?.phoneNumberId) {
                    token = connRes.rows[0].accessToken;
                    phoneNumberId = connRes.rows[0].phoneNumberId;
                }
            } catch {
                // La tabla puede no existir en entornos mínimos
            }

            if (!token) {
                try {
                    const cfgRes = await db.query(
                        `SELECT "accessToken", "phoneNumberId", enabled
                           FROM "WhatsAppConfig"
                          WHERE "clubId" = $1 LIMIT 1`,
                        [clubId],
                    );
                    if (cfgRes.rows[0]?.enabled !== false && cfgRes.rows[0]?.accessToken && cfgRes.rows[0]?.phoneNumberId) {
                        token = cfgRes.rows[0].accessToken;
                        phoneNumberId = cfgRes.rows[0].phoneNumberId;
                    }
                } catch {
                    // Continuar con respaldo global
                }
            }
        }

        if (!token) {
            token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WA_TOKEN || null;
            phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_ID || null;
        }

        if (!token || !phoneNumberId) {
            return {
                sent: false,
                providerId: null,
                error: 'WhatsApp Business API no está configurado o habilitado para este sitio.',
            };
        }

        const apiVersion = process.env.WA_API_VERSION || 'v21.0';
        const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cleanPhone,
                type: 'text',
                text: { preview_url: true, body: text },
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) {
            return {
                sent: false,
                providerId: null,
                error: data?.error?.message || `Meta WhatsApp respondió HTTP ${response.status}`,
            };
        }
        return {
            sent: true,
            providerId: data?.messages?.[0]?.id || null,
            error: null,
        };
    } catch (error) {
        return {
            sent: false,
            providerId: null,
            error: error?.message || 'Error de red con el proveedor de WhatsApp',
        };
    }
};

/**
 * Resuelve la URL base pública del sitio del evento para construir los enlaces
 * `/mi-inscripcion?activar=...`.
 */
export const resolveEventOrigin = async (event, reqOrigin = null) => {
    if (reqOrigin && /^https?:\/\//i.test(String(reqOrigin).trim())) {
        return String(reqOrigin).trim().replace(/\/+$/, '');
    }
    if (event?.clubId) {
        try {
            const { rows } = await db.query(
                `SELECT domain, subdomain FROM "Club" WHERE id = $1 LIMIT 1`,
                [event.clubId],
            );
            const club = rows[0];
            if (club?.domain) {
                const dom = String(club.domain).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                if (dom) return `https://${dom}`;
            }
            if (club?.subdomain && String(club.subdomain).includes('4281')) {
                return 'https://rotary4281.org';
            }
        } catch {
            // Seguir al valor por defecto
        }
    }
    return process.env.PUBLIC_SITE_URL || 'https://rotary4281.org';
};

/**
 * Carga en lote todas las cuentas `EventAttendeeAccount`, inscripciones pares
 * del evento, inscripciones en otros eventos e identidades externas para un
 * conjunto de filas de `EventCompletedRegistration`.
 */
export const loadAccountContextForRows = async (eventId, rows = []) => {
    const accountById = new Map();
    const accountsByEmail = new Map();
    const accountsByDocument = new Map();
    const linkedRegistrationsById = new Map();
    const peerRowsByEmail = new Map();
    const peerRowsByDocument = new Map();
    const otherEventsByEmail = new Map();
    const otherEventsByAccountId = new Map();
    const usersByEmail = new Map();
    const projectFairByEmail = new Map();

    if (!Array.isArray(rows) || rows.length === 0) {
        return {
            accountById,
            accountsByEmail,
            accountsByDocument,
            linkedRegistrationsById,
            peerRowsByEmail,
            peerRowsByDocument,
            otherEventsByEmail,
            otherEventsByAccountId,
            usersByEmail,
            projectFairByEmail,
        };
    }

    const indexAccount = (acc) => {
        if (!acc || !acc.id) return;
        accountById.set(acc.id, acc);
        const em = normalizeEmail(acc.email);
        if (em) accountsByEmail.set(em, acc);
        const doc = normalizeDocument(acc.documentNumber);
        if (doc) {
            const list = accountsByDocument.get(doc) || [];
            if (!list.some(a => a.id === acc.id)) list.push(acc);
            accountsByDocument.set(doc, list);
        }
    };

    const emails = Array.from(new Set(rows.map(r => normalizeEmail(r.email)).filter(Boolean)));
    const docs = Array.from(new Set(rows.map(r => normalizeDocument(r.documentNumber)).filter(Boolean)));
    const accountIds = Array.from(new Set(rows.map(r => r.accountId).filter(Boolean)));
    const linkedRegIds = Array.from(new Set(rows.map(r => r.linkedRegistrationId).filter(Boolean)));

    // 1. Pares dentro del mismo evento (para detectar correos compartidos con distinto documento)
    try {
        const { rows: allEventPeers } = await db.query(
            `SELECT id, "firstName", "lastName", email, "documentNumber", "accountId", status
               FROM "EventCompletedRegistration"
              WHERE "eventId" = $1`,
            [eventId],
        );
        for (const peer of allEventPeers) {
            const em = normalizeEmail(peer.email);
            if (em) {
                const list = peerRowsByEmail.get(em) || [];
                list.push(peer);
                peerRowsByEmail.set(em, list);
            }
            const doc = normalizeDocument(peer.documentNumber);
            if (doc) {
                const list = peerRowsByDocument.get(doc) || [];
                list.push(peer);
                peerRowsByDocument.set(doc, list);
            }
        }
    } catch {
        // En caso de fallo parcial, indexar las filas presentes en memoria
        for (const peer of rows) {
            const em = normalizeEmail(peer.email);
            if (em) {
                const list = peerRowsByEmail.get(em) || [];
                list.push(peer);
                peerRowsByEmail.set(em, list);
            }
            const doc = normalizeDocument(peer.documentNumber);
            if (doc) {
                const list = peerRowsByDocument.get(doc) || [];
                list.push(peer);
                peerRowsByDocument.set(doc, list);
            }
        }
    }

    // 2. Cuentas `EventAttendeeAccount` por id, email o documento
    if (accountIds.length > 0) {
        try {
            const { rows: byId } = await db.query(
                `SELECT * FROM "EventAttendeeAccount" WHERE id = ANY($1)`,
                [accountIds],
            );
            byId.forEach(indexAccount);
        } catch { /* ignorar */ }
    }

    if (emails.length > 0) {
        try {
            const { rows: byEmail } = await db.query(
                `SELECT * FROM "EventAttendeeAccount" WHERE lower(email) = ANY($1)`,
                [emails],
            );
            byEmail.forEach(indexAccount);
        } catch { /* ignorar */ }
    }

    if (docs.length > 0) {
        try {
            const { rows: byDoc } = await db.query(
                `SELECT * FROM "EventAttendeeAccount" WHERE "documentNumber" = ANY($1)`,
                [docs],
            );
            byDoc.forEach(indexAccount);
        } catch { /* ignorar */ }
    }

    // 3. Inscripciones en línea vinculadas (`EventRegistration`)
    if (linkedRegIds.length > 0) {
        try {
            const { rows: linkedRegs } = await db.query(
                `SELECT id, "eventId", email, "documentNumber", "accountId", "registrationCode", status
                   FROM "EventRegistration"
                  WHERE id = ANY($1)`,
                [linkedRegIds],
            );
            for (const lr of linkedRegs) {
                linkedRegistrationsById.set(lr.id, lr);
                if (lr.accountId && !accountById.has(lr.accountId)) {
                    const { rows: accRows } = await db.query(
                        `SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1`,
                        [lr.accountId],
                    );
                    if (accRows[0]) indexAccount(accRows[0]);
                }
            }
        } catch { /* ignorar */ }
    }

    // 4. Relaciones con otros eventos (en `EventRegistration` y `EventCompletedRegistration`)
    if (emails.length > 0) {
        try {
            const { rows: onlineRegs } = await db.query(
                `SELECT id, "eventId", email, "accountId", "registrationCode", status, "documentNumber"
                   FROM "EventRegistration"
                  WHERE lower(email) = ANY($1)`,
                [emails],
            );
            for (const reg of onlineRegs) {
                const em = normalizeEmail(reg.email);
                const item = {
                    eventId: reg.eventId,
                    source: 'online',
                    registrationId: reg.id,
                    registrationCode: reg.registrationCode || null,
                    status: reg.status,
                };
                if (em) {
                    const list = otherEventsByEmail.get(em) || [];
                    list.push(item);
                    otherEventsByEmail.set(em, list);
                }
                if (reg.accountId) {
                    const list = otherEventsByAccountId.get(reg.accountId) || [];
                    list.push(item);
                    otherEventsByAccountId.set(reg.accountId, list);
                }
            }
        } catch { /* ignorar */ }

        try {
            const { rows: otherCompleted } = await db.query(
                `SELECT id, "eventId", email, "accountId", "registrationCode", status
                   FROM "EventCompletedRegistration"
                  WHERE lower(email) = ANY($1) AND "eventId" <> $2`,
                [emails, eventId],
            );
            for (const comp of otherCompleted) {
                const em = normalizeEmail(comp.email);
                const item = {
                    eventId: comp.eventId,
                    source: 'completed',
                    registrationId: comp.id,
                    registrationCode: comp.registrationCode || null,
                    status: comp.status,
                };
                if (em) {
                    const list = otherEventsByEmail.get(em) || [];
                    list.push(item);
                    otherEventsByEmail.set(em, list);
                }
                if (comp.accountId) {
                    const list = otherEventsByAccountId.get(comp.accountId) || [];
                    list.push(item);
                    otherEventsByAccountId.set(comp.accountId, list);
                }
            }
        } catch { /* ignorar */ }

        // 5. Usuarios centrales (`User`) y Feria de Proyectos (`ProjectFairAccount`)
        try {
            const { rows: platformUsers } = await db.query(
                `SELECT id, email, name, role FROM "User" WHERE lower(email) = ANY($1)`,
                [emails],
            );
            for (const u of platformUsers) {
                usersByEmail.set(normalizeEmail(u.email), u);
            }
        } catch { /* ignorar */ }

        try {
            const { rows: pfUsers } = await db.query(
                `SELECT id, email, "firstName", "lastName" FROM "ProjectFairAccount" WHERE lower(email) = ANY($1)`,
                [emails],
            );
            for (const pf of pfUsers) {
                projectFairByEmail.set(normalizeEmail(pf.email), pf);
            }
        } catch { /* ignorar */ }
    }

    return {
        accountById,
        accountsByEmail,
        accountsByDocument,
        linkedRegistrationsById,
        peerRowsByEmail,
        peerRowsByDocument,
        otherEventsByEmail,
        otherEventsByAccountId,
        usersByEmail,
        projectFairByEmail,
    };
};

/**
 * Resume de forma segura una fila de `EventAttendeeAccount` para enviar al
 * panel administrativo (NUNCA expone hashes ni tokens).
 */
export const sanitizeAccountForAdmin = (account) => {
    if (!account) return null;
    return {
        id: account.id,
        email: account.email,
        firstName: account.firstName || null,
        lastName: account.lastName || null,
        phone: account.phone || null,
        documentNumber: account.documentNumber || null,
        role: account.role || 'event_attendee',
        status: account.status || 'active',
        linkedRealm: account.linkedRealm || null,
        linkedId: account.linkedId || null,
        isActivated: isAccountActivated(account),
        emailVerifiedAt: account.emailVerifiedAt || null,
        activatedAt: account.activatedAt || null,
        activationSentAt: account.activationSentAt || null,
        activationExpiry: account.activationExpiry || null,
        hasActiveInvitationToken: Boolean(account.activationTokenHash),
        mustChangePassword: Boolean(account.mustChangePassword),
        lastLoginAt: account.lastLoginAt || null,
        createdAt: account.createdAt || null,
    };
};

/**
 * Enriquecer un arreglo de inscripciones completadas con el estado real de
 * su cuenta (`accountStatus`), su estado de activación (`activationStatus`)
 * y el diagnóstico de conciliación de identidad.
 */
export const enrichCompletedRowsWithAccounts = async (eventId, rows = [], now = new Date()) => {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const context = await loadAccountContextForRows(eventId, rows);

    return rows.map(row => {
        const reconciliation = reconcileParticipantIdentity(row, context);
        const linkedAccount = row.accountId ? context.accountById.get(row.accountId) || null : null;
        const state = deriveAccountAndActivationState(row, linkedAccount, reconciliation, now);
        const matchedAccount = linkedAccount || reconciliation.matchedAccount || null;

        return {
            ...row,
            accountId: row.accountId || null,
            accountLinkedAt: row.accountLinkedAt || null,
            accountLinkedBy: row.accountLinkedBy || null,
            accountReviewReason: row.accountReviewReason || state.reviewReason || null,
            activationSentAt: row.activationSentAt || linkedAccount?.activationSentAt || null,
            activationChannel: row.activationChannel || null,
            activationExpiresAt: linkedAccount?.activationExpiry || row.activationExpiresAt || null,
            activationError: row.activationError || null,
            accountStatus: state.accountStatus,
            accountStatusLabel: state.accountStatusMeta.label,
            accountStatusShortLabel: state.accountStatusMeta.shortLabel,
            activationStatus: state.activationStatus,
            activationStatusLabel: state.activationStatusMeta.label,
            accountState: {
                accountStatus: state.accountStatus,
                accountStatusMeta: state.accountStatusMeta,
                activationStatus: state.activationStatus,
                activationStatusMeta: state.activationStatusMeta,
                reviewReason: state.reviewReason,
                hasLinkedAccount: state.hasLinkedAccount,
                isActivated: state.isActivated,
                canCreateAccount: state.canCreateAccount,
                canLinkExisting: state.canLinkExisting,
                canSendInvitation: state.canSendInvitation,
                account: sanitizeAccountForAdmin(matchedAccount),
                reconciliation: {
                    action: reconciliation.action,
                    confidence: reconciliation.confidence,
                    reasons: reconciliation.reasons,
                    reviewReason: reconciliation.reviewReason,
                    matchedAccountEmail: reconciliation.matchedAccount?.email || null,
                    matchedAccountId: reconciliation.matchedAccount?.id || null,
                    matchedExternalIdentity: reconciliation.matchedExternalIdentity || null,
                    duplicateIds: reconciliation.duplicateIds || [],
                    otherEvents: reconciliation.otherEvents || [],
                },
            },
        };
    });
};

/**
 * Filtra filas enriquecidas según los criterios de cuenta/activación
 * (`accountStatus` y `activationStatus`).
 */
export const filterEnrichedRowsByAccount = (enrichedRows = [], query = {}) => {
    const accFilter = typeof query.accountStatus === 'string' ? query.accountStatus.trim() : '';
    const actFilter = typeof query.activationStatus === 'string' ? query.activationStatus.trim() : '';

    return enrichedRows.filter(row => {
        if (accFilter) {
            if (accFilter === 'pending_verification' || accFilter === 'pending_activation') {
                if (row.accountStatus !== 'pending_verification' && row.accountStatus !== 'pending_activation') return false;
            } else if (accFilter === 'invitation_pending_send' || accFilter === 'pending_send') {
                if ((row.accountStatus !== 'pending_verification' && row.accountStatus !== 'pending_activation')
                    || (row.activationStatus !== 'not_sent' && row.activationStatus !== 'failed')) return false;
            } else if (accFilter === 'invitation_sent') {
                if (row.activationStatus !== 'sent' && row.activationStatus !== 'delivered') return false;
            } else if (accFilter === 'invitation_expired') {
                if (row.activationStatus !== 'expired') return false;
            } else if (row.accountStatus !== accFilter) {
                return false;
            }
        }
        if (actFilter) {
            if (actFilter === 'sent' || actFilter === 'delivered') {
                if (row.activationStatus !== 'sent' && row.activationStatus !== 'delivered') return false;
            } else if (row.activationStatus !== actFilter) {
                return false;
            }
        }
        return true;
    });
};

/**
 * Calcula los indicadores ejecutivos de cuentas y activaciones del evento
 * (Sección 18).
 */
export const computeEventAccountTotals = async (eventId, now = new Date()) => {
    const { rows } = await db.query(
        `SELECT id, "eventId", "registrationCode", status, "registrationSource",
                "firstName", "lastName", "documentNumber", email, phone,
                "linkedRegistrationId", "accountId", "accountLinkedAt",
                "accountReviewReason", "activationSentAt", "activationChannel",
                "activationExpiresAt", "activationError"
           FROM "EventCompletedRegistration"
          WHERE "eventId" = $1`,
        [eventId],
    );

    const enriched = await enrichCompletedRowsWithAccounts(eventId, rows, now);
    const counts = {
        total: enriched.length,
        active: 0,
        noAccount: 0,
        pendingVerification: 0,
        pendingActivation: 0,
        invitationPendingSend: 0,
        invitationSent: 0,
        invitationExpired: 0,
        suspended: 0,
        needsReview: 0,
        existingDetected: 0,
        activationNotSent: 0,
        activationSent: 0,
        activationCompleted: 0,
        activationExpired: 0,
        activationFailed: 0,
    };

    for (const r of enriched) {
        const isPendingVerif = r.accountStatus === 'pending_verification' || r.accountStatus === 'pending_activation';
        if (r.accountStatus === 'active') {
            counts.active += 1;
        } else if (r.accountStatus === 'no_account') {
            counts.noAccount += 1;
        } else if (isPendingVerif) {
            counts.pendingVerification += 1;
            counts.pendingActivation += 1;
            if (r.activationStatus === 'not_sent' || r.activationStatus === 'failed') {
                counts.invitationPendingSend += 1;
            }
        } else if (r.accountStatus === 'suspended') {
            counts.suspended += 1;
        } else if (r.accountStatus === 'needs_review') {
            counts.needsReview += 1;
        }

        if (r.accountState?.reconciliation?.action === 'link_existing') {
            counts.existingDetected += 1;
        }

        if (r.activationStatus === 'completed') {
            counts.activationCompleted += 1;
        } else if (r.activationStatus === 'sent' || r.activationStatus === 'delivered') {
            counts.activationSent += 1;
            counts.invitationSent += 1;
        } else if (r.activationStatus === 'expired') {
            counts.activationExpired += 1;
            counts.invitationExpired += 1;
        } else if (r.activationStatus === 'failed') {
            counts.activationFailed += 1;
        } else {
            counts.activationNotSent += 1;
        }
    }

    return {
        ...counts,
        no_account: counts.noAccount,
        pending_verification: counts.pendingVerification,
        pending_activation: counts.pendingActivation,
        invitation_pending_send: counts.invitationPendingSend,
        invitation_sent: counts.invitationSent,
        invitation_expired: counts.invitationExpired,
        needs_review: counts.needsReview,
    };
};

/**
 * Resumen previo a la creación masiva de cuentas (Sección 7).
 */
export const preflightAccountProvisioning = async ({ eventId, ids = [] }) => {
    const cleanIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
    if (cleanIds.length === 0) {
        return {
            totalSelected: 0,
            alreadyLinked: 0,
            existingToLink: 0,
            newToCreate: 0,
            needsReview: 0,
            invalidEmail: 0,
            items: [],
        };
    }

    const { rows } = await db.query(
        `SELECT * FROM "EventCompletedRegistration"
          WHERE "eventId" = $1 AND id = ANY($2)`,
        [eventId, cleanIds],
    );
    const enriched = await enrichCompletedRowsWithAccounts(eventId, rows);
    const byId = new Map(enriched.map(r => [r.id, r]));

    let alreadyLinked = 0;
    let existingToLink = 0;
    let newToCreate = 0;
    let needsReview = 0;
    let invalidEmail = 0;
    const items = [];

    for (const id of cleanIds) {
        const r = byId.get(id);
        if (!r) continue;
        const action = r.accountState?.reconciliation?.action || 'needs_review';
        if (action === 'already_linked') alreadyLinked += 1;
        else if (action === 'link_existing') existingToLink += 1;
        else if (action === 'create_new') newToCreate += 1;
        else if (action === 'invalid_email') invalidEmail += 1;
        else needsReview += 1;

        items.push({
            id: r.id,
            registrationCode: r.registrationCode || null,
            name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || r.email || 'Sin nombre',
            email: r.email || '',
            documentNumber: r.documentNumber || '',
            district: r.district || '',
            clubName: r.clubName || '',
            action,
            accountStatus: r.accountStatus,
            accountStatusLabel: r.accountStatusLabel,
            activationStatus: r.activationStatus,
            reason: r.accountState?.reconciliation?.reviewReason
                || r.accountState?.reconciliation?.reasons?.[0]
                || '',
            matchedAccountEmail: r.accountState?.reconciliation?.matchedAccountEmail || null,
            otherEventsCount: r.accountState?.reconciliation?.otherEvents?.length || 0,
        });
    }

    return {
        totalSelected: items.length,
        alreadyLinked,
        existingToLink,
        newToCreate,
        needsReview,
        invalidEmail,
        actionableCount: existingToLink + newToCreate,
        items,
    };
};

/**
 * Motor idempotente y auditable de creación y vinculación de cuentas
 * (Sección 8).
 */
export const provisionParticipantAccounts = async ({
    event,
    ids = [],
    actor = {},
    options = {},
}) => {
    const cleanIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
    const ttlHours = Number(options.ttlHours) || DEFAULT_ACTIVATION_TTL_HOURS;
    const allowReviewOverride = options.allowReviewOverride === true;
    const explicitAccountId = options.forceLinkAccountId || null;

    const { rows } = await db.query(
        `SELECT * FROM "EventCompletedRegistration"
          WHERE "eventId" = $1 AND id = ANY($2)`,
        [event.id, cleanIds],
    );
    const rowById = new Map(rows.map(r => [r.id, r]));

    const results = [];
    let created = 0;
    let linked = 0;
    let alreadyLinked = 0;
    let skippedReview = 0;
    let invalidEmail = 0;
    let failed = 0;

    for (const id of cleanIds) {
        const row = rowById.get(id);
        if (!row) {
            failed += 1;
            results.push({ id, outcome: 'not_found', message: 'Inscripción no encontrada en este evento.' });
            continue;
        }

        try {
            // Re-evaluar el contexto vivo por cada fila para que si dos filas de
            // la MISMA persona están en el lote, la segunda reutilice la cuenta
            // recién creada en la primera (idempotencia intra-lote).
            const context = await loadAccountContextForRows(event.id, [row]);
            const recon = reconcileParticipantIdentity(row, context);

            // Caso 1: Ya tiene cuenta vinculada sin conflicto
            if (recon.action === 'already_linked' && !explicitAccountId) {
                alreadyLinked += 1;
                results.push({
                    id: row.id,
                    registrationCode: row.registrationCode,
                    email: row.email,
                    outcome: 'already_linked',
                    accountId: row.accountId,
                    message: 'La inscripción ya tenía una cuenta vinculada.',
                });
                continue;
            }

            // Caso 2: Correo inválido
            if (recon.action === 'invalid_email') {
                invalidEmail += 1;
                await db.query(
                    `UPDATE "EventCompletedRegistration"
                        SET "accountReviewReason" = $1, "updatedAt" = NOW()
                      WHERE id = $2`,
                    [recon.reviewReason, row.id],
                );
                results.push({
                    id: row.id,
                    registrationCode: row.registrationCode,
                    email: row.email,
                    outcome: 'invalid_email',
                    message: recon.reviewReason,
                });
                continue;
            }

            // Caso 3: Ambigüedad o conflicto de identidad (no crear cuenta automáticamente)
            if (recon.action === 'needs_review' && !allowReviewOverride && !explicitAccountId) {
                skippedReview += 1;
                await db.query(
                    `UPDATE "EventCompletedRegistration"
                        SET "accountReviewReason" = $1, "updatedAt" = NOW()
                      WHERE id = $2`,
                    [recon.reviewReason, row.id],
                );
                await recordHistory({
                    registrationId: row.id,
                    eventId: event.id,
                    type: 'account_review_flagged',
                    comment: `Marcado para revisión administrativa de identidad: ${recon.reviewReason}`,
                    actor,
                    payload: { reviewReason: recon.reviewReason, reasons: recon.reasons },
                });
                results.push({
                    id: row.id,
                    registrationCode: row.registrationCode,
                    email: row.email,
                    outcome: 'needs_review',
                    message: recon.reviewReason,
                });
                continue;
            }

            // Caso 4: Vincular cuenta existente (`link_existing` o `explicitAccountId`)
            let targetAccount = explicitAccountId
                ? (await db.query(`SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1`, [explicitAccountId])).rows[0]
                : recon.matchedAccount;

            if (targetAccount) {
                const normDoc = normalizeDocument(row.documentNumber);
                if (normDoc && !targetAccount.documentNumber) {
                    await db.query(
                        `UPDATE "EventAttendeeAccount"
                            SET "documentNumber" = $1,
                                phone = COALESCE(phone, $2),
                                "updatedAt" = NOW()
                          WHERE id = $3`,
                        [row.documentNumber.trim(), row.phone || null, targetAccount.id],
                    );
                }

                // Si la cuenta aún no está activada y no tiene token vigente, preparar token
                if (!isAccountActivated(targetAccount) && !targetAccount.activationTokenHash) {
                    const { tokenHash, expiresAt } = generateActivationToken(ttlHours);
                    await db.query(
                        `UPDATE "EventAttendeeAccount"
                            SET "activationTokenHash" = $1, "activationExpiry" = $2, "updatedAt" = NOW()
                          WHERE id = $3`,
                        [tokenHash, expiresAt.toISOString(), targetAccount.id],
                    );
                }

                await db.query(
                    `UPDATE "EventCompletedRegistration"
                        SET "accountId" = $1,
                            "accountLinkedAt" = NOW(),
                            "accountLinkedBy" = $2,
                            "accountReviewReason" = NULL,
                            "updatedAt" = NOW()
                      WHERE id = $3`,
                    [targetAccount.id, actor?.id || actor?.name || 'admin', row.id],
                );

                await recordHistory({
                    registrationId: row.id,
                    eventId: event.id,
                    type: 'account_linked',
                    comment: `Vinculó la inscripción a la cuenta existente ${targetAccount.email}.`,
                    actor,
                    payload: {
                        accountId: targetAccount.id,
                        email: targetAccount.email,
                        confidence: recon.confidence,
                    },
                });

                linked += 1;
                results.push({
                    id: row.id,
                    registrationCode: row.registrationCode,
                    email: row.email,
                    outcome: 'linked',
                    accountId: targetAccount.id,
                    message: `Vinculado a cuenta existente (${targetAccount.email}).`,
                });
                continue;
            }

            // Caso 5: Crear nueva cuenta en `EventAttendeeAccount` y vincular
            const cleanEmail = normalizeEmail(row.email);
            const { tokenHash, expiresAt } = generateActivationToken(ttlHours);
            const extRealm = recon.matchedExternalIdentity?.realm || null;
            const extId = recon.matchedExternalIdentity?.id || null;

            const { rows: upserted } = await db.query(
                `INSERT INTO "EventAttendeeAccount" (
                    email, "passwordHash", "firstName", "lastName", phone,
                    "documentNumber", role, status, "linkedRealm", "linkedId",
                    "activationTokenHash", "activationExpiry"
                 ) VALUES ($1, $2, $3, $4, $5, $6, 'event_attendee', 'active', $7, $8, $9, $10)
                 ON CONFLICT (lower(email)) DO UPDATE
                    SET "firstName" = COALESCE("EventAttendeeAccount"."firstName", EXCLUDED."firstName"),
                        "lastName" = COALESCE("EventAttendeeAccount"."lastName", EXCLUDED."lastName"),
                        phone = COALESCE("EventAttendeeAccount".phone, EXCLUDED.phone),
                        "documentNumber" = COALESCE("EventAttendeeAccount"."documentNumber", EXCLUDED."documentNumber"),
                        "activationTokenHash" = COALESCE("EventAttendeeAccount"."activationTokenHash", EXCLUDED."activationTokenHash"),
                        "activationExpiry" = COALESCE("EventAttendeeAccount"."activationExpiry", EXCLUDED."activationExpiry"),
                        "updatedAt" = NOW()
                 RETURNING *`,
                [
                    cleanEmail,
                    UNUSABLE_PASSWORD_HASH,
                    row.firstName || null,
                    row.lastName || null,
                    row.phone || null,
                    row.documentNumber ? String(row.documentNumber).trim() : null,
                    extRealm,
                    extId,
                    tokenHash,
                    expiresAt.toISOString(),
                ],
            );

            const createdAccount = upserted[0];

            await db.query(
                `UPDATE "EventCompletedRegistration"
                    SET "accountId" = $1,
                        "accountLinkedAt" = NOW(),
                        "accountLinkedBy" = $2,
                        "accountReviewReason" = NULL,
                        "activationExpiresAt" = $3,
                        "updatedAt" = NOW()
                  WHERE id = $4`,
                [
                    createdAccount.id,
                    actor?.id || actor?.name || 'admin',
                    expiresAt.toISOString(),
                    row.id,
                ],
            );

            await recordHistory({
                registrationId: row.id,
                eventId: event.id,
                type: 'account_created',
                comment: `Creó cuenta de acceso para ${cleanEmail} y la vinculó al evento.`,
                actor,
                payload: {
                    accountId: createdAccount.id,
                    email: cleanEmail,
                    linkedRealm: extRealm,
                },
            });

            created += 1;
            results.push({
                id: row.id,
                registrationCode: row.registrationCode,
                email: cleanEmail,
                outcome: 'created',
                accountId: createdAccount.id,
                message: `Cuenta creada y vinculada (${cleanEmail}).`,
            });
        } catch (error) {
            failed += 1;
            results.push({
                id: row.id,
                registrationCode: row.registrationCode,
                email: row.email,
                outcome: 'error',
                message: error?.message || 'Error al aprovisionar cuenta',
            });
        }
    }

    return {
        total: cleanIds.length,
        created,
        linked,
        alreadyLinked,
        skippedReview,
        invalidEmail,
        failed,
        results,
    };
};

/**
 * Resumen previo al envío masivo o individual de invitaciones de activación
 * (Sección 12, 13 y 14).
 */
export const preflightActivationInvitations = async ({
    event,
    ids = [],
    channel = 'email',
    includeActive = false,
}) => {
    const cleanIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
    const { rows } = await db.query(
        `SELECT * FROM "EventCompletedRegistration"
          WHERE "eventId" = $1 AND id = ANY($2)`,
        [event.id, cleanIds],
    );
    const enriched = await enrichCompletedRowsWithAccounts(event.id, rows);
    const byId = new Map(enriched.map(r => [r.id, r]));

    const wantEmail = channel === 'email' || channel === 'both';
    const wantWhatsApp = channel === 'whatsapp' || channel === 'both';

    let readyToSend = 0;
    let skippedActive = 0;
    let needsProvisioningFirst = 0;
    let missingEmail = 0;
    let missingPhone = 0;
    let blockedByReviewOrSuspended = 0;
    const items = [];

    for (const id of cleanIds) {
        const r = byId.get(id);
        if (!r) continue;

        const hasValidMail = isValidEmail(r.email);
        const hasValidPhone = Boolean(r.phone && String(r.phone).replace(/\D/g, '').length >= 7);

        if (r.accountStatus === 'needs_review' || r.accountStatus === 'suspended') {
            blockedByReviewOrSuspended += 1;
            items.push({
                id: r.id,
                name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
                email: r.email,
                phone: r.phone,
                accountStatus: r.accountStatus,
                eligible: false,
                reason: r.accountStatus === 'suspended'
                    ? 'La cuenta está suspendida.'
                    : (r.accountReviewReason || 'Requiere revisión de identidad.'),
            });
            continue;
        }

        if (r.accountStatus === 'active' && !includeActive) {
            skippedActive += 1;
            items.push({
                id: r.id,
                name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
                email: r.email,
                phone: r.phone,
                accountStatus: r.accountStatus,
                eligible: false,
                reason: 'La cuenta ya está activa (no requiere invitación de activación).',
            });
            continue;
        }

        if (wantEmail && !hasValidMail) {
            missingEmail += 1;
            items.push({
                id: r.id,
                name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
                email: r.email,
                phone: r.phone,
                accountStatus: r.accountStatus,
                eligible: false,
                reason: 'Sin correo electrónico válido.',
            });
            continue;
        }

        if (wantWhatsApp && !hasValidPhone) {
            missingPhone += 1;
            if (!wantEmail) {
                items.push({
                    id: r.id,
                    name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
                    email: r.email,
                    phone: r.phone,
                    accountStatus: r.accountStatus,
                    eligible: false,
                    reason: 'Sin número de WhatsApp válido.',
                });
                continue;
            }
        }

        if (r.accountStatus === 'no_account') {
            needsProvisioningFirst += 1;
        }

        readyToSend += 1;
        items.push({
            id: r.id,
            name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
            email: r.email,
            phone: r.phone,
            accountStatus: r.accountStatus,
            eligible: true,
            reason: r.accountStatus === 'no_account'
                ? 'Se aprovisionará la cuenta y se enviará el enlace.'
                : 'Listo para enviar enlace único de activación.',
        });
    }

    return {
        totalSelected: items.length,
        channel,
        readyToSend,
        skippedActive,
        needsProvisioningFirst,
        missingEmail,
        missingPhone,
        blockedByReviewOrSuspended,
        items,
    };
};

/**
 * Regenera el enlace criptográfico de activación de un solo uso para una
 * inscripción vinculada (invalidando cualquier enlace previo).
 */
export const regenerateParticipantActivationToken = async ({
    event,
    row,
    actor = {},
    ttlHours = DEFAULT_ACTIVATION_TTL_HOURS,
    origin = null,
}) => {
    let targetRow = row;
    if (!targetRow.accountId) {
        const prov = await provisionParticipantAccounts({
            event,
            ids: [targetRow.id],
            actor,
            options: { ttlHours },
        });
        const first = prov.results[0];
        if (!first || (first.outcome !== 'created' && first.outcome !== 'linked' && first.outcome !== 'already_linked')) {
            throw new Error(first?.message || 'No se pudo aprovisionar la cuenta antes de generar el enlace.');
        }
        const refreshed = await db.query(`SELECT * FROM "EventCompletedRegistration" WHERE id = $1 LIMIT 1`, [targetRow.id]);
        targetRow = refreshed.rows[0];
    }

    const { rows: accRows } = await db.query(
        `SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1`,
        [targetRow.accountId],
    );
    const account = accRows[0];
    if (!account) {
        throw new Error('No se encontró la cuenta vinculada.');
    }
    if (account.status === 'suspended') {
        throw new Error('La cuenta se encuentra suspendida.');
    }

    const { token, tokenHash, expiresAt, ttlHours: resolvedTtl } = generateActivationToken(ttlHours);
    await db.query(
        `UPDATE "EventAttendeeAccount"
            SET "activationTokenHash" = $1,
                "activationExpiry" = $2,
                "updatedAt" = NOW()
          WHERE id = $3`,
        [tokenHash, expiresAt.toISOString(), account.id],
    );
    await db.query(
        `UPDATE "EventCompletedRegistration"
            SET "activationExpiresAt" = $1,
                "activationError" = NULL,
                "updatedAt" = NOW()
          WHERE id = $2`,
        [expiresAt.toISOString(), targetRow.id],
    );

    const resolvedOrigin = await resolveEventOrigin(event, origin);
    const activationUrl = buildActivationUrl(resolvedOrigin, token);

    await recordHistory({
        registrationId: targetRow.id,
        eventId: event.id,
        type: 'activation_token_regenerated',
        comment: `Regeneró el enlace único de activación (vigencia ${resolvedTtl} h).`,
        actor,
        payload: { accountId: account.id, expiresAt: expiresAt.toISOString(), ttlHours: resolvedTtl },
    });

    return {
        account: { ...account, activationTokenHash: tokenHash, activationExpiry: expiresAt },
        token,
        tokenHash,
        expiresAt,
        ttlHours: resolvedTtl,
        activationUrl,
    };
};

/**
 * Envía invitaciones de activación (individuales o masivas) por correo,
 * WhatsApp o ambos canales, con presupuesto de tiempo, validación de
 * destinatario y redacción de secretos en la bitácora.
 */
export const sendActivationInvitations = async ({
    event,
    ids = [],
    channel = 'email', // 'email' | 'whatsapp' | 'both'
    subjectTemplate = DEFAULT_ACTIVATION_EMAIL_SUBJECT,
    bodyTemplate = DEFAULT_ACTIVATION_EMAIL_BODY,
    whatsappTemplate = DEFAULT_ACTIVATION_WHATSAPP_BODY,
    ttlHours = DEFAULT_ACTIVATION_TTL_HOURS,
    includeActive = false,
    autoProvision = true,
    useContingencyTempPassword = false,
    actor = {},
    origin = null,
    budgetMs = 60_000,
}) => {
    const cleanIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
    const startedAt = Date.now();
    const resolvedOrigin = await resolveEventOrigin(event, origin);
    const branding = await eventBrandingFor(event.clubId);

    const organization = {
        name: branding?.clubName || event?.title || 'Club Platform for Rotary',
        signature: branding?.clubName
            ? `Equipo de Eventos · ${branding.clubName}`
            : 'Equipo de Eventos · Club Platform for Rotary',
    };

    const { rows } = await db.query(
        `SELECT * FROM "EventCompletedRegistration"
          WHERE "eventId" = $1 AND id = ANY($2)`,
        [event.id, cleanIds],
    );
    const enriched = await enrichCompletedRowsWithAccounts(event.id, rows);
    const byId = new Map(enriched.map(r => [r.id, r]));

    const wantEmail = channel === 'email' || channel === 'both';
    const wantWhatsApp = channel === 'whatsapp' || channel === 'both';

    const results = [];
    const pendingIds = [];
    let sentCount = 0;
    let skippedActiveCount = 0;
    let skippedReviewCount = 0;
    let failedCount = 0;

    for (const id of cleanIds) {
        if (Date.now() - startedAt > budgetMs) {
            pendingIds.push(id);
            continue;
        }

        let r = byId.get(id);
        if (!r) {
            failedCount += 1;
            results.push({ id, outcome: 'not_found', message: 'Inscripción no encontrada.' });
            continue;
        }

        if (r.accountStatus === 'needs_review' || r.accountStatus === 'suspended') {
            skippedReviewCount += 1;
            results.push({
                id: r.id,
                registrationCode: r.registrationCode,
                email: r.email,
                outcome: 'skipped_review',
                message: r.accountStatus === 'suspended'
                    ? 'Cuenta suspendida.'
                    : (r.accountReviewReason || 'Requiere revisión de identidad antes de enviar acceso.'),
            });
            continue;
        }

        if (r.accountStatus === 'active' && !includeActive) {
            skippedActiveCount += 1;
            results.push({
                id: r.id,
                registrationCode: r.registrationCode,
                email: r.email,
                outcome: 'skipped_active',
                message: 'El participante ya tiene una cuenta activa.',
            });
            continue;
        }

        try {
            // Si aún no tiene cuenta vinculada y `autoProvision` está activo, aprovisionarla primero
            if (!r.accountId && autoProvision) {
                const prov = await provisionParticipantAccounts({
                    event,
                    ids: [r.id],
                    actor,
                    options: { ttlHours },
                });
                const first = prov.results[0];
                if (!first || (first.outcome !== 'created' && first.outcome !== 'linked' && first.outcome !== 'already_linked')) {
                    skippedReviewCount += 1;
                    results.push({
                        id: r.id,
                        registrationCode: r.registrationCode,
                        email: r.email,
                        outcome: 'skipped_review',
                        message: first?.message || 'No se pudo aprovisionar la cuenta.',
                    });
                    continue;
                }
                const refreshed = await db.query(`SELECT * FROM "EventCompletedRegistration" WHERE id = $1 LIMIT 1`, [r.id]);
                const [reEnriched] = await enrichCompletedRowsWithAccounts(event.id, refreshed.rows);
                r = reEnriched;

                if (r.accountStatus === 'active' && !includeActive) {
                    skippedActiveCount += 1;
                    results.push({
                        id: r.id,
                        registrationCode: r.registrationCode,
                        email: r.email,
                        outcome: 'skipped_active',
                        message: 'Se vinculó a su cuenta existente que ya se encontraba activa.',
                    });
                    continue;
                }
            }

            if (!r.accountId) {
                failedCount += 1;
                results.push({
                    id: r.id,
                    registrationCode: r.registrationCode,
                    email: r.email,
                    outcome: 'error',
                    message: 'El participante no tiene una cuenta creada para enviar invitación.',
                });
                continue;
            }

            // Generar token criptográfico de un solo uso
            const { account, token, expiresAt, ttlHours: resolvedTtl, activationUrl } =
                await regenerateParticipantActivationToken({
                    event,
                    row: r,
                    actor,
                    ttlHours,
                    origin: resolvedOrigin,
                });

            // Si se solicitó contingencia de contraseña temporal (Sección 10):
            // se genera aleatoria, se guarda SOLO su hash bcrypt con `mustChangePassword = true`
            // y jamás se persiste en claro.
            let transientTempPassword = null;
            if (useContingencyTempPassword) {
                transientTempPassword = generateTemporaryPassword(14);
                const tempHash = await bcrypt.hash(transientTempPassword, 10);
                await db.query(
                    `UPDATE "EventAttendeeAccount"
                        SET "passwordHash" = $1,
                            "mustChangePassword" = true,
                            "tempPasswordExpiresAt" = $2,
                            "updatedAt" = NOW()
                      WHERE id = $3`,
                    [tempHash, expiresAt.toISOString(), account.id],
                );
            }

            const variables = buildActivationVariables({
                row: r,
                event,
                organization,
                origin: resolvedOrigin,
                activationUrl,
                expiresAt,
                ttlHours: resolvedTtl,
                accountState: r.accountState,
            });

            const channelOutcomes = {};
            const channelErrors = [];

            // Envío por correo electrónico
            if (wantEmail) {
                verifyRecipientOwnsActivationToken({
                    row: r,
                    account,
                    token,
                    recipientEmail: r.email,
                });

                const renderedEmail = renderActivationEmail({
                    subjectTemplate: subjectTemplate || DEFAULT_ACTIVATION_EMAIL_SUBJECT,
                    bodyTemplate: bodyTemplate || DEFAULT_ACTIVATION_EMAIL_BODY,
                    variables,
                    temporaryPassword: transientTempPassword,
                });

                let emailSent = false;
                let emailError = null;
                let providerId = null;

                try {
                    const out = await EmailService.sendPlatformEmail({
                        to: normalizeEmail(r.email),
                        from: PLATFORM_SENDER,
                        subject: renderedEmail.subject,
                        html: renderedEmail.html,
                        text: renderedEmail.text,
                    });
                    if (out && out.success === false) {
                        emailError = out.error || 'Rechazado por el servidor de correo';
                    } else {
                        emailSent = true;
                        providerId = out?.messageId || null;
                    }
                } catch (err) {
                    emailError = err?.message || 'Error al despachar correo';
                }

                await db.query(
                    `INSERT INTO "EventRegistrationMessage" (
                        "registrationId", "eventId", channel, template, recipient,
                        subject, body, status, error, "providerId", "actorId"
                     ) VALUES ($1, $2, 'email', 'account_activation', $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        r.id,
                        event.id,
                        normalizeEmail(r.email),
                        renderedEmail.subject,
                        renderedEmail.redactedText,
                        emailSent ? 'sent' : 'failed',
                        emailError,
                        providerId,
                        actor?.id || null,
                    ],
                );

                channelOutcomes.email = { sent: emailSent, error: emailError, providerId };
                if (!emailSent && emailError) channelErrors.push(`Correo: ${emailError}`);
            }

            // Envío por WhatsApp
            if (wantWhatsApp) {
                if (!r.phone || String(r.phone).replace(/\D/g, '').length < 7) {
                    const errText = 'El participante no tiene un teléfono válido para WhatsApp.';
                    channelOutcomes.whatsapp = { sent: false, error: errText };
                    channelErrors.push(`WhatsApp: ${errText}`);
                } else {
                    verifyRecipientOwnsActivationToken({
                        row: r,
                        account,
                        token,
                        recipientPhone: r.phone,
                    });

                    const renderedWa = renderActivationWhatsApp({
                        bodyTemplate: whatsappTemplate || DEFAULT_ACTIVATION_WHATSAPP_BODY,
                        variables,
                    });

                    const waOut = await sendParticipantWhatsApp({
                        clubId: event.clubId,
                        to: r.phone,
                        text: renderedWa.text,
                    });

                    await db.query(
                        `INSERT INTO "EventRegistrationMessage" (
                            "registrationId", "eventId", channel, template, recipient,
                            subject, body, status, error, "providerId", "actorId"
                         ) VALUES ($1, $2, 'whatsapp', 'account_activation', $3, $4, $5, $6, $7, $8, $9)`,
                        [
                            r.id,
                            event.id,
                            String(r.phone).trim(),
                            'Invitación de activación por WhatsApp',
                            renderedWa.redactedText,
                            waOut.sent ? 'sent' : 'failed',
                            waOut.error,
                            waOut.providerId,
                            actor?.id || null,
                        ],
                    );

                    channelOutcomes.whatsapp = waOut;
                    if (!waOut.sent && waOut.error) channelErrors.push(`WhatsApp: ${waOut.error}`);
                }
            }

            const anySent = Boolean(channelOutcomes.email?.sent || channelOutcomes.whatsapp?.sent);
            const combinedError = channelErrors.length > 0 ? channelErrors.join(' · ') : null;

            if (anySent) {
                await db.query(
                    `UPDATE "EventAttendeeAccount"
                        SET "activationSentAt" = NOW(), "updatedAt" = NOW()
                      WHERE id = $1`,
                    [account.id],
                );
                await db.query(
                    `UPDATE "EventCompletedRegistration"
                        SET "activationSentAt" = NOW(),
                            "activationChannel" = $1,
                            "activationExpiresAt" = $2,
                            "activationError" = $3,
                            "updatedAt" = NOW()
                      WHERE id = $4`,
                    [channel, expiresAt.toISOString(), combinedError, r.id],
                );
                await recordHistory({
                    registrationId: r.id,
                    eventId: event.id,
                    type: 'invitation_sent',
                    comment: `Envió invitación de activación por ${channel === 'both' ? 'correo y WhatsApp' : (channel === 'whatsapp' ? 'WhatsApp' : 'correo')}.`,
                    actor,
                    payload: { channel, expiresAt: expiresAt.toISOString(), outcomes: channelOutcomes },
                });
                sentCount += 1;
                results.push({
                    id: r.id,
                    registrationCode: r.registrationCode,
                    email: r.email,
                    phone: r.phone,
                    outcome: 'sent',
                    channels: channelOutcomes,
                    warning: combinedError,
                });
            } else {
                await db.query(
                    `UPDATE "EventCompletedRegistration"
                        SET "activationError" = $1, "updatedAt" = NOW()
                      WHERE id = $2`,
                    [combinedError || 'Fallo al enviar invitación', r.id],
                );
                await recordHistory({
                    registrationId: r.id,
                    eventId: event.id,
                    type: 'invitation_failed',
                    comment: `Falló el envío de invitación de activación: ${combinedError || 'sin detalle'}.`,
                    actor,
                    payload: { channel, error: combinedError },
                });
                failedCount += 1;
                results.push({
                    id: r.id,
                    registrationCode: r.registrationCode,
                    email: r.email,
                    phone: r.phone,
                    outcome: 'failed',
                    channels: channelOutcomes,
                    message: combinedError || 'No se pudo enviar la invitación.',
                });
            }
        } catch (error) {
            failedCount += 1;
            results.push({
                id: r.id,
                registrationCode: r.registrationCode,
                email: r.email,
                outcome: 'failed',
                message: error?.message || 'Error inesperado al enviar invitación.',
            });
        }
    }

    return {
        total: cleanIds.length,
        sent: sentCount,
        skippedActive: skippedActiveCount,
        skippedReview: skippedReviewCount,
        failed: failedCount,
        pending: pendingIds,
        results,
    };
};

/**
 * Suspende o reactiva la cuenta vinculada a una inscripción completada.
 */
export const updateParticipantAccountStatus = async ({
    event,
    row,
    nextStatus, // 'active' | 'suspended'
    reason = '',
    actor = {},
}) => {
    if (!['active', 'suspended'].includes(nextStatus)) {
        throw new Error('Estado de cuenta no válido.');
    }
    if (!row.accountId) {
        throw new Error('Esta inscripción aún no tiene una cuenta vinculada.');
    }

    const { rows } = await db.query(
        `UPDATE "EventAttendeeAccount"
            SET status = $1, "updatedAt" = NOW()
          WHERE id = $2
          RETURNING *`,
        [nextStatus, row.accountId],
    );
    if (!rows[0]) {
        throw new Error('La cuenta vinculada no existe.');
    }

    await recordHistory({
        registrationId: row.id,
        eventId: event.id,
        type: nextStatus === 'suspended' ? 'account_suspended' : 'account_reactivated',
        comment: nextStatus === 'suspended'
            ? `Suspendió la cuenta de acceso${reason ? `: ${reason}` : '.'}`
            : `Reactivó la cuenta de acceso${reason ? `: ${reason}` : '.'}`,
        actor,
        payload: { accountId: row.accountId, status: nextStatus, reason },
    });

    return sanitizeAccountForAdmin(rows[0]);
};
