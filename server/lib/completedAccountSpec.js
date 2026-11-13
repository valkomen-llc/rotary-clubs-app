// ════════════════════════════════════════════════════════════════════
// Sistema de creación masiva de cuentas, activación de accesos y
// vinculación de participantes a eventos (Inscripciones COLROTARIOS y
// ecosistema Club Platform) — el CRITERIO PURO
//
// Este módulo es PURO: sin base de datos, sin red, sin efectos laterales.
// Define:
//   1. Catálogo de estados de «Cuenta de acceso» (ACCOUNT_STATUSES).
//   2. Catálogo de estados de «Activación» (ACTIVATION_STATUSES).
//   3. Conciliación e identificación de cuentas existentes y conflictos
//      de identidad (`reconcileParticipantIdentity`).
//   4. Derivación determinista de `accountStatus` y `activationStatus`
//      a partir de datos reales (`deriveAccountAndActivationState`).
//   5. Generación criptográfica de tokens de activación de un solo uso
//      (SHA-256 en reposo) y contraseñas temporales de contingencia.
//   6. Variables dinámicas, plantillas de correo/WhatsApp y guardia de
//      destinatario (`verifyRecipientOwnsActivationToken`).
//   7. Reglas de campos autorizados vs. protegidos para la edición del
//      propio participante en `/mi-inscripcion`.
// ════════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[0-9+\s().-]{7,40}$/;

export const UNUSABLE_PASSWORD_HASH = '!';
export const DEFAULT_ACTIVATION_TTL_HOURS = 72;
export const MAX_ACTIVATION_TTL_HOURS = 336; // 14 días

// ── 1. Estados de «Cuenta de acceso» ─────────────────────────────────

export const ACCOUNT_STATUSES = [
    {
        key: 'active',
        label: 'Cuenta activa',
        shortLabel: 'Activa',
        tone: 'emerald',
        description: 'El participante tiene una cuenta válida y ha completado su activación.',
    },
    {
        key: 'no_account',
        label: 'Sin cuenta',
        shortLabel: 'Sin cuenta',
        tone: 'amber',
        description: 'Existe una inscripción, pero no se encontró una cuenta vinculada y verificada.',
    },
    {
        key: 'pending_activation',
        label: 'Cuenta creada — Activación pendiente',
        shortLabel: 'Activación pendiente',
        tone: 'slate',
        description: 'La cuenta existe, pero el participante todavía no ha establecido sus credenciales personales.',
    },
    {
        key: 'invitation_sent',
        label: 'Invitación enviada',
        shortLabel: 'Invitada',
        tone: 'sky',
        description: 'Se generó y envió una invitación de activación vigente.',
    },
    {
        key: 'invitation_expired',
        label: 'Invitación vencida',
        shortLabel: 'Invitación vencida',
        tone: 'orange',
        description: 'El enlace de activación expiró sin que el participante completara el proceso.',
    },
    {
        key: 'suspended',
        label: 'Cuenta suspendida',
        shortLabel: 'Suspendida',
        tone: 'red',
        description: 'Existe una cuenta vinculada, pero está deshabilitada administrativamente.',
    },
    {
        key: 'needs_review',
        label: 'Requiere revisión',
        shortLabel: 'Requiere revisión',
        tone: 'rose',
        description: 'Existen coincidencias ambiguas, conflictos de identidad o información insuficiente.',
    },
];

export const ACCOUNT_STATUS_KEYS = ACCOUNT_STATUSES.map(s => s.key);

export const accountStatusMeta = (key) =>
    ACCOUNT_STATUSES.find(s => s.key === key)
    || { key: key || 'no_account', label: key || 'Sin cuenta', shortLabel: key || 'Sin cuenta', tone: 'slate', description: '' };

// ── 2. Estados de «Activación» ───────────────────────────────────────

export const ACTIVATION_STATUSES = [
    {
        key: 'not_sent',
        label: 'No enviada',
        tone: 'slate',
        description: 'Todavía no se ha enviado invitación de activación.',
    },
    {
        key: 'sent',
        label: 'Enviada',
        tone: 'sky',
        description: 'La invitación de activación fue despachada al participante.',
    },
    {
        key: 'delivered',
        label: 'Entregada',
        tone: 'blue',
        description: 'El canal confirmó la entrega de la invitación.',
    },
    {
        key: 'pending',
        label: 'Pendiente',
        tone: 'amber',
        description: 'La cuenta espera que el participante abra el enlace y defina su contraseña.',
    },
    {
        key: 'completed',
        label: 'Completada',
        tone: 'emerald',
        description: 'El participante activó su cuenta y definió su contraseña personal.',
    },
    {
        key: 'expired',
        label: 'Vencida',
        tone: 'orange',
        description: 'El enlace de activación superó su fecha de vigencia.',
    },
    {
        key: 'failed',
        label: 'Error de envío',
        tone: 'red',
        description: 'El último intento de envío de invitación registró un error.',
    },
];

export const ACTIVATION_STATUS_KEYS = ACTIVATION_STATUSES.map(s => s.key);

export const activationStatusMeta = (key) =>
    ACTIVATION_STATUSES.find(s => s.key === key)
    || { key: key || 'not_sent', label: key || 'No enviada', tone: 'slate', description: '' };

// ── 3. Normalización e identidad ─────────────────────────────────────

export const normalizeEmail = (email) =>
    typeof email === 'string' ? email.trim().toLowerCase() : '';

export const isValidEmail = (email) => {
    const clean = normalizeEmail(email);
    return Boolean(clean && EMAIL_RE.test(clean));
};

export const normalizeDocument = (doc) => {
    if (typeof doc !== 'string' && typeof doc !== 'number') return '';
    return String(doc)
        .trim()
        .toUpperCase()
        .replace(/[\s.\-_]/g, '');
};

const stripAccents = (str) =>
    String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

const STOP_TOKENS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'san', 'santa']);

export const extractNameTokens = (firstName, lastName) => {
    const full = `${firstName || ''} ${lastName || ''}`;
    return stripAccents(full)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOP_TOKENS.has(t));
};

/**
 * Determina si dos nombres corresponden razonablemente a la misma persona.
 * Si alguno de los dos nombres está vacío, no se considera contradicción.
 * Si ambos tienen tokens significativos, se exige que al menos el primer
 * nombre o el apellido principal coincidan (o al menos 1 token >= 3 letras
 * cuando uno de los nombres es corto, o >= 2 tokens cuando ambos son largos).
 */
export const areNamesCompatible = (aFirst, aLast, bFirst, bLast) => {
    const tokensA = extractNameTokens(aFirst, aLast);
    const tokensB = extractNameTokens(bFirst, bLast);
    if (tokensA.length === 0 || tokensB.length === 0) return true;

    const setB = new Set(tokensB);
    const shared = tokensA.filter(t => setB.has(t) || tokensB.some(bt => bt.length >= 4 && t.length >= 4 && (bt.startsWith(t) || t.startsWith(bt))));

    if (tokensA.length >= 2 && tokensB.length >= 2) {
        return shared.length >= 1;
    }
    return shared.length >= 1;
};

/**
 * Determina si una cuenta `EventAttendeeAccount` tiene credenciales personales
 * activas (no el hash inutilizable `!` ni cambio forzoso pendiente).
 */
export const isAccountActivated = (account) => {
    if (!account) return false;
    if (account.status === 'suspended') return false;
    const hash = String(account.passwordHash || '').trim();
    if (!hash || hash === UNUSABLE_PASSWORD_HASH) return false;
    if (account.mustChangePassword) return false;
    return true;
};

/**
 * Concilia una fila de inscripción con el contexto de cuentas e inscripciones
 * existentes para decidir si:
 *   - `already_linked`: ya tiene `accountId` válido y sin conflicto.
 *   - `link_existing`: existe una cuenta verificada que debe vincularse.
 *   - `create_new`: no existe cuenta previa ni conflicto; puede crearse.
 *   - `needs_review`: hay ambigüedad o conflicto de identidad.
 *   - `invalid_email`: no tiene un correo electrónico válido.
 */
export const reconcileParticipantIdentity = (row, context = {}) => {
    const normEmail = normalizeEmail(row?.email);
    const normDoc = normalizeDocument(row?.documentNumber);
    const rowFirst = String(row?.firstName || '').trim();
    const rowLast = String(row?.lastName || '').trim();

    const accountById = context.accountById || new Map();
    const accountsByEmail = context.accountsByEmail || new Map();
    const accountsByDocument = context.accountsByDocument || new Map();
    const linkedRegistrationsById = context.linkedRegistrationsById || new Map();
    const peerRowsByEmail = context.peerRowsByEmail || new Map();
    const peerRowsByDocument = context.peerRowsByDocument || new Map();
    const otherEventsByEmail = context.otherEventsByEmail || new Map();
    const otherEventsByAccountId = context.otherEventsByAccountId || new Map();
    const usersByEmail = context.usersByEmail || new Map();
    const projectFairByEmail = context.projectFairByEmail || new Map();

    const lookup = (mapOrObj, key) => {
        if (!key || !mapOrObj) return null;
        if (typeof mapOrObj.get === 'function') return mapOrObj.get(key) || null;
        return mapOrObj[key] || null;
    };

    const reasons = [];
    const otherEventsMap = new Map();
    const addOtherEvents = (list) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            if (!item) continue;
            if (item.source === 'completed' && item.registrationId === row?.id) continue;
            const k = `${item.eventId || ''}:${item.source || ''}:${item.registrationId || ''}`;
            if (!otherEventsMap.has(k)) otherEventsMap.set(k, item);
        }
    };

    if (row?.accountId) addOtherEvents(lookup(otherEventsByAccountId, row.accountId));
    if (normEmail) addOtherEvents(lookup(otherEventsByEmail, normEmail));

    // Duplicados en la misma tabla de inscripciones completadas del evento
    const peersSameEmail = (lookup(peerRowsByEmail, normEmail) || []).filter(p => p.id !== row?.id);
    const peersSameDoc = (lookup(peerRowsByDocument, normDoc) || []).filter(p => p.id !== row?.id);
    const duplicateIds = Array.from(new Set([
        ...peersSameEmail.map(p => p.id),
        ...peersSameDoc.map(p => p.id),
    ]));

    // 1. Si ya tiene una cuenta vinculada directamente (`row.accountId`)
    const directAccount = row?.accountId ? lookup(accountById, row.accountId) : null;
    if (directAccount) {
        addOtherEvents(lookup(otherEventsByAccountId, directAccount.id));
        const accDoc = normalizeDocument(directAccount.documentNumber);
        if (normDoc && accDoc && normDoc !== accDoc) {
            const reason = 'El documento de la inscripción no coincide con el documento de la cuenta vinculada.';
            return {
                action: 'needs_review',
                matchedAccount: directAccount,
                matchedExternalIdentity: null,
                confidence: 'ambiguous',
                reasons: [reason],
                reviewReason: reason,
                duplicateIds,
                otherEvents: Array.from(otherEventsMap.values()),
            };
        }
        if (row?.accountReviewReason) {
            return {
                action: 'needs_review',
                matchedAccount: directAccount,
                matchedExternalIdentity: null,
                confidence: 'ambiguous',
                reasons: [row.accountReviewReason],
                reviewReason: row.accountReviewReason,
                duplicateIds,
                otherEvents: Array.from(otherEventsMap.values()),
            };
        }
        return {
            action: 'already_linked',
            matchedAccount: directAccount,
            matchedExternalIdentity: directAccount.linkedRealm
                ? { realm: directAccount.linkedRealm, id: directAccount.linkedId }
                : null,
            confidence: 'verified',
            reasons: ['Cuenta vinculada directamente a la inscripción.'],
            reviewReason: null,
            duplicateIds,
            otherEvents: Array.from(otherEventsMap.values()),
        };
    }

    // 2. Si el administrador marcó manualmente un motivo de revisión pendiente
    if (row?.accountReviewReason) {
        return {
            action: 'needs_review',
            matchedAccount: null,
            matchedExternalIdentity: null,
            confidence: 'ambiguous',
            reasons: [row.accountReviewReason],
            reviewReason: row.accountReviewReason,
            duplicateIds,
            otherEvents: Array.from(otherEventsMap.values()),
        };
    }

    // 3. Validar correo electrónico mínimo
    if (!isValidEmail(normEmail)) {
        const reason = 'Correo electrónico ausente o con formato inválido.';
        return {
            action: 'invalid_email',
            matchedAccount: null,
            matchedExternalIdentity: null,
            confidence: 'none',
            reasons: [reason],
            reviewReason: reason,
            duplicateIds,
            otherEvents: Array.from(otherEventsMap.values()),
        };
    }

    // 4. Verificar si dos personas distintas en el evento comparten el mismo correo
    //    (mismo correo pero distinto número de documento de identidad no vacío)
    const conflictingEmailPeer = peersSameEmail.find(p => {
        const peerDoc = normalizeDocument(p.documentNumber);
        return normDoc && peerDoc && normDoc !== peerDoc;
    });
    if (conflictingEmailPeer) {
        const reason = `El correo ${normEmail} está registrado en otra inscripción con distinto documento de identidad.`;
        return {
            action: 'needs_review',
            matchedAccount: null,
            matchedExternalIdentity: null,
            confidence: 'ambiguous',
            reasons: [reason],
            reviewReason: reason,
            duplicateIds,
            otherEvents: Array.from(otherEventsMap.values()),
        };
    }

    // 5. Verificar si el mismo documento de identidad aparece con otro correo distinto
    const conflictingDocPeer = peersSameDoc.find(p => {
        const peerEmail = normalizeEmail(p.email);
        return peerEmail && peerEmail !== normEmail;
    });
    if (conflictingDocPeer) {
        const reason = `El documento ${row.documentNumber} figura en otra inscripción con un correo electrónico diferente (${conflictingDocPeer.email}).`;
        return {
            action: 'needs_review',
            matchedAccount: null,
            matchedExternalIdentity: null,
            confidence: 'ambiguous',
            reasons: [reason],
            reviewReason: reason,
            duplicateIds,
            otherEvents: Array.from(otherEventsMap.values()),
        };
    }

    // 6. Revisar relación con inscripción en línea vinculada (`linkedRegistrationId`)
    const linkedReg = row?.linkedRegistrationId ? lookup(linkedRegistrationsById, row.linkedRegistrationId) : null;
    if (linkedReg?.accountId) {
        const linkedAcc = lookup(accountById, linkedReg.accountId);
        if (linkedAcc) {
            const accDoc = normalizeDocument(linkedAcc.documentNumber);
            if (!normDoc || !accDoc || normDoc === accDoc) {
                addOtherEvents(lookup(otherEventsByAccountId, linkedAcc.id));
                return {
                    action: 'link_existing',
                    matchedAccount: linkedAcc,
                    matchedExternalIdentity: linkedAcc.linkedRealm
                        ? { realm: linkedAcc.linkedRealm, id: linkedAcc.linkedId }
                        : null,
                    confidence: 'verified',
                    reasons: ['Cuenta verificada a través de inscripción vinculada.'],
                    reviewReason: null,
                    duplicateIds,
                    otherEvents: Array.from(otherEventsMap.values()),
                };
            }
        }
    }

    // 7. Buscar coincidencias por correo normalizado y por documento en `EventAttendeeAccount`
    const emailAccRaw = lookup(accountsByEmail, normEmail);
    const emailAcc = Array.isArray(emailAccRaw) ? emailAccRaw[0] : emailAccRaw;
    const docAccRaw = normDoc ? lookup(accountsByDocument, normDoc) : null;
    const docAccounts = Array.isArray(docAccRaw) ? docAccRaw : (docAccRaw ? [docAccRaw] : []);

    // Conflicto: el correo apunta a una cuenta y el documento apunta a OTRA cuenta distinta
    if (emailAcc && docAccounts.length > 0 && docAccounts.some(da => da.id !== emailAcc.id)) {
        const reason = 'Conflicto de identidad: el correo electrónico y el documento de identidad coinciden con cuentas diferentes.';
        return {
            action: 'needs_review',
            matchedAccount: emailAcc,
            matchedExternalIdentity: null,
            confidence: 'ambiguous',
            reasons: [reason],
            reviewReason: reason,
            duplicateIds,
            otherEvents: Array.from(otherEventsMap.values()),
        };
    }

    // Si el documento coincide con una cuenta que tiene OTRO correo electrónico
    if (!emailAcc && docAccounts.length > 0) {
        const otherAcc = docAccounts[0];
        const reason = `Existe una cuenta para el documento ${row.documentNumber} registrada con otro correo (${otherAcc.email}).`;
        return {
            action: 'needs_review',
            matchedAccount: otherAcc,
            matchedExternalIdentity: null,
            confidence: 'ambiguous',
            reasons: [reason],
            reviewReason: reason,
            duplicateIds,
            otherEvents: Array.from(otherEventsMap.values()),
        };
    }

    // Si existe una cuenta con el mismo correo electrónico: verificar evidencia de identidad
    if (emailAcc) {
        addOtherEvents(lookup(otherEventsByAccountId, emailAcc.id));
        const accDoc = normalizeDocument(emailAcc.documentNumber);

        // Si ambos tienen documento y NO coinciden → ambiguo / conflicto
        if (normDoc && accDoc && normDoc !== accDoc) {
            const reason = `Existe una cuenta con el correo ${normEmail}, pero su documento (${emailAcc.documentNumber}) no coincide con el de la inscripción (${row.documentNumber}).`;
            return {
                action: 'needs_review',
                matchedAccount: emailAcc,
                matchedExternalIdentity: null,
                confidence: 'ambiguous',
                reasons: [reason],
                reviewReason: reason,
                duplicateIds,
                otherEvents: Array.from(otherEventsMap.values()),
            };
        }

        // Si ambos tienen documento y SÍ coinciden → identidad verificada
        if (normDoc && accDoc && normDoc === accDoc) {
            return {
                action: 'link_existing',
                matchedAccount: emailAcc,
                matchedExternalIdentity: emailAcc.linkedRealm
                    ? { realm: emailAcc.linkedRealm, id: emailAcc.linkedId }
                    : null,
                confidence: 'verified',
                reasons: ['Coincidencia exacta de correo electrónico y documento de identidad.'],
                reviewReason: null,
                duplicateIds,
                otherEvents: Array.from(otherEventsMap.values()),
            };
        }

        // Si la cuenta no tenía documento guardado, verificar compatibilidad de nombres
        const namesMatch = areNamesCompatible(rowFirst, rowLast, emailAcc.firstName, emailAcc.lastName);
        if (!namesMatch) {
            const reason = `Existe una cuenta con el correo ${normEmail} a nombre de «${[emailAcc.firstName, emailAcc.lastName].filter(Boolean).join(' ')}», que no coincide con «${[rowFirst, rowLast].filter(Boolean).join(' ')}».`;
            return {
                action: 'needs_review',
                matchedAccount: emailAcc,
                matchedExternalIdentity: null,
                confidence: 'ambiguous',
                reasons: [reason],
                reviewReason: reason,
                duplicateIds,
                otherEvents: Array.from(otherEventsMap.values()),
            };
        }

        return {
            action: 'link_existing',
            matchedAccount: emailAcc,
            matchedExternalIdentity: emailAcc.linkedRealm
                ? { realm: emailAcc.linkedRealm, id: emailAcc.linkedId }
                : null,
            confidence: 'high',
            reasons: ['Coincidencia de correo electrónico y nombre compatible en Club Platform.'],
            reviewReason: null,
            duplicateIds,
            otherEvents: Array.from(otherEventsMap.values()),
        };
    }

    // 8. No existe `EventAttendeeAccount` todavía; revisar si existe cuenta central `User` o `ProjectFairAccount`
    const centralUser = lookup(usersByEmail, normEmail);
    const pfUser = lookup(projectFairByEmail, normEmail);
    let matchedExternalIdentity = null;

    if (centralUser) {
        const userParts = String(centralUser.name || '').trim().split(/\s+/);
        const uFirst = userParts[0] || '';
        const uLast = userParts.slice(1).join(' ');
        if (!areNamesCompatible(rowFirst, rowLast, uFirst, uLast)) {
            const reason = `El correo ${normEmail} pertenece a un usuario de plataforma («${centralUser.name}») cuyo nombre no coincide con el participante.`;
            return {
                action: 'needs_review',
                matchedAccount: null,
                matchedExternalIdentity: { realm: 'user', id: centralUser.id, email: centralUser.email, name: centralUser.name },
                confidence: 'ambiguous',
                reasons: [reason],
                reviewReason: reason,
                duplicateIds,
                otherEvents: Array.from(otherEventsMap.values()),
            };
        }
        matchedExternalIdentity = { realm: 'user', id: centralUser.id, email: centralUser.email, name: centralUser.name };
        reasons.push('Usuario registrado en Club Platform detectado por correo y nombre.');
    } else if (pfUser) {
        if (!areNamesCompatible(rowFirst, rowLast, pfUser.firstName, pfUser.lastName)) {
            const pfName = [pfUser.firstName, pfUser.lastName].filter(Boolean).join(' ');
            const reason = `El correo ${normEmail} pertenece a una cuenta de Feria de Proyectos («${pfName}») cuyo nombre no coincide con el participante.`;
            return {
                action: 'needs_review',
                matchedAccount: null,
                matchedExternalIdentity: { realm: 'project_fair', id: pfUser.id, email: pfUser.email, name: pfName },
                confidence: 'ambiguous',
                reasons: [reason],
                reviewReason: reason,
                duplicateIds,
                otherEvents: Array.from(otherEventsMap.values()),
            };
        }
        matchedExternalIdentity = {
            realm: 'project_fair',
            id: pfUser.id,
            email: pfUser.email,
            name: [pfUser.firstName, pfUser.lastName].filter(Boolean).join(' '),
        };
        reasons.push('Cuenta de Feria de Proyectos detectada por correo y nombre.');
    } else {
        reasons.push('Listo para crear nueva cuenta de participante.');
    }

    return {
        action: 'create_new',
        matchedAccount: null,
        matchedExternalIdentity,
        confidence: 'verified',
        reasons,
        reviewReason: null,
        duplicateIds,
        otherEvents: Array.from(otherEventsMap.values()),
    };
};

// ── 4. Derivación de `accountStatus` y `activationStatus` ─────────────

/**
 * Deriva los estados reales de «Cuenta de acceso» y «Activación» para una
 * inscripción completada. NUNCA asume que existe cuenta sólo por tener email.
 */
export const deriveAccountAndActivationState = (row, account = null, reconciliation = null, now = new Date()) => {
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const recon = reconciliation || reconcileParticipantIdentity(row, {
        accountById: account && row?.accountId === account.id ? new Map([[account.id, account]]) : new Map(),
    });

    const linkedAccount = (row?.accountId && account && account.id === row.accountId)
        ? account
        : (recon.action === 'already_linked' ? recon.matchedAccount : null);

    const reviewReason = row?.accountReviewReason || (recon.action === 'needs_review' || recon.action === 'invalid_email' ? recon.reviewReason : null);

    // Si hay un conflicto de identidad o requiere revisión explícita
    if (recon.action === 'needs_review' || recon.action === 'invalid_email' || row?.accountReviewReason) {
        return {
            accountStatus: 'needs_review',
            accountStatusMeta: accountStatusMeta('needs_review'),
            activationStatus: 'not_sent',
            activationStatusMeta: activationStatusMeta('not_sent'),
            reviewReason: reviewReason || 'Requiere revisión manual de identidad.',
            hasLinkedAccount: Boolean(linkedAccount),
            isActivated: false,
            canCreateAccount: false,
            canLinkExisting: Boolean(recon.matchedAccount),
            canSendInvitation: false,
            reconciliation: recon,
        };
    }

    // Si todavía NO hay una cuenta vinculada a la inscripción (`row.accountId == null`)
    if (!linkedAccount) {
        return {
            accountStatus: 'no_account',
            accountStatusMeta: accountStatusMeta('no_account'),
            activationStatus: 'not_sent',
            activationStatusMeta: activationStatusMeta('not_sent'),
            reviewReason: null,
            hasLinkedAccount: false,
            isActivated: false,
            canCreateAccount: recon.action === 'create_new' || recon.action === 'link_existing',
            canLinkExisting: recon.action === 'link_existing',
            canSendInvitation: false,
            reconciliation: recon,
        };
    }

    // Hay cuenta vinculada: inspeccionar estado real de la cuenta
    if (linkedAccount.status === 'suspended') {
        return {
            accountStatus: 'suspended',
            accountStatusMeta: accountStatusMeta('suspended'),
            activationStatus: isAccountActivated(linkedAccount) ? 'completed' : 'pending',
            activationStatusMeta: activationStatusMeta(isAccountActivated(linkedAccount) ? 'completed' : 'pending'),
            reviewReason: null,
            hasLinkedAccount: true,
            isActivated: false,
            canCreateAccount: false,
            canLinkExisting: false,
            canSendInvitation: false,
            reconciliation: recon,
        };
    }

    if (isAccountActivated(linkedAccount)) {
        return {
            accountStatus: 'active',
            accountStatusMeta: accountStatusMeta('active'),
            activationStatus: 'completed',
            activationStatusMeta: activationStatusMeta('completed'),
            reviewReason: null,
            hasLinkedAccount: true,
            isActivated: true,
            canCreateAccount: false,
            canLinkExisting: false,
            canSendInvitation: false,
            reconciliation: recon,
        };
    }

    // La cuenta existe pero NO ha completado su activación (`passwordHash === '!'` o `mustChangePassword`)
    const sentAt = row?.activationSentAt || linkedAccount.activationSentAt || null;
    const expiresAt = linkedAccount.activationExpiry || row?.activationExpiresAt || null;
    const hasError = Boolean(row?.activationError);
    const hasActiveToken = Boolean(linkedAccount.activationTokenHash || linkedAccount.resetToken);

    if (hasError && !sentAt) {
        return {
            accountStatus: 'pending_activation',
            accountStatusMeta: accountStatusMeta('pending_activation'),
            activationStatus: 'failed',
            activationStatusMeta: activationStatusMeta('failed'),
            reviewReason: null,
            hasLinkedAccount: true,
            isActivated: false,
            canCreateAccount: false,
            canLinkExisting: false,
            canSendInvitation: true,
            reconciliation: recon,
        };
    }

    if (sentAt || hasActiveToken) {
        const expMs = expiresAt ? new Date(expiresAt).getTime() : null;
        if (expMs && Number.isFinite(expMs) && expMs < nowMs) {
            return {
                accountStatus: 'invitation_expired',
                accountStatusMeta: accountStatusMeta('invitation_expired'),
                activationStatus: 'expired',
                activationStatusMeta: activationStatusMeta('expired'),
                reviewReason: null,
                hasLinkedAccount: true,
                isActivated: false,
                canCreateAccount: false,
                canLinkExisting: false,
                canSendInvitation: true,
                reconciliation: recon,
            };
        }

        if (hasError) {
            return {
                accountStatus: 'pending_activation',
                accountStatusMeta: accountStatusMeta('pending_activation'),
                activationStatus: 'failed',
                activationStatusMeta: activationStatusMeta('failed'),
                reviewReason: null,
                hasLinkedAccount: true,
                isActivated: false,
                canCreateAccount: false,
                canLinkExisting: false,
                canSendInvitation: true,
                reconciliation: recon,
            };
        }

        return {
            accountStatus: 'invitation_sent',
            accountStatusMeta: accountStatusMeta('invitation_sent'),
            activationStatus: sentAt ? 'sent' : 'pending',
            activationStatusMeta: activationStatusMeta(sentAt ? 'sent' : 'pending'),
            reviewReason: null,
            hasLinkedAccount: true,
            isActivated: false,
            canCreateAccount: false,
            canLinkExisting: false,
            canSendInvitation: true,
            reconciliation: recon,
        };
    }

    return {
        accountStatus: 'pending_activation',
        accountStatusMeta: accountStatusMeta('pending_activation'),
        activationStatus: 'not_sent',
        activationStatusMeta: activationStatusMeta('not_sent'),
        reviewReason: null,
        hasLinkedAccount: true,
        isActivated: false,
        canCreateAccount: false,
        canLinkExisting: false,
        canSendInvitation: true,
        reconciliation: recon,
    };
};

// ── 5. Criptografía de enlaces de activación y contraseñas ───────────

/**
 * Genera un token criptográficamente seguro de un solo uso y su hash SHA-256.
 * En la base de datos NUNCA se guarda el token en claro, únicamente `tokenHash`.
 */
export const generateActivationToken = (ttlHours = DEFAULT_ACTIVATION_TTL_HOURS, now = new Date()) => {
    const hours = Math.min(Math.max(Number(ttlHours) || DEFAULT_ACTIVATION_TTL_HOURS, 1), MAX_ACTIVATION_TTL_HOURS);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashActivationToken(token);
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const expiresAt = new Date(nowMs + hours * 3600 * 1000);
    return { token, tokenHash, expiresAt, ttlHours: hours };
};

export const hashActivationToken = (token) => {
    if (typeof token !== 'string' || !token.trim()) return '';
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
};

export const buildActivationUrl = (origin, token) => {
    const cleanOrigin = String(origin || 'https://rotary4281.org').trim().replace(/\/+$/, '');
    return `${cleanOrigin}/mi-inscripcion?activar=${encodeURIComponent(String(token || '').trim())}`;
};

export const buildPortalUrl = (origin) => {
    const cleanOrigin = String(origin || 'https://rotary4281.org').trim().replace(/\/+$/, '');
    return `${cleanOrigin}/mi-inscripcion`;
};

/**
 * Redacta cualquier token de activación o recuperación presente en un texto
 * antes de guardarlo en `EventRegistrationMessage` o en bitácoras de auditoría.
 */
export const redactActivationSecrets = (text) => {
    if (typeof text !== 'string' || !text) return '';
    return text
        .replace(/([?&](?:activar|reset)=)[A-Za-z0-9_\-~.]+/gi, '$1[TOKEN-PROTEGIDO]')
        .replace(/(Contraseña temporal:\s*)[^\s<]+/gi, '$1[CREDENCIAL-PROTEGIDA]');
};

/**
 * Generador de contraseña temporal única y aleatoria (mecanismo de contingencia
 * de la Sección 10). Cumple mayúscula, minúscula, dígito y símbolo, sin
 * caracteres ambiguos (`0`, `O`, `1`, `l`, `I`), y NUNCA se persiste en claro.
 */
export const generateTemporaryPassword = (length = 14) => {
    const len = Math.max(Number(length) || 14, 12);
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%&*+-=?';
    const all = upper + lower + digits + symbols;

    const chars = [
        upper[crypto.randomInt(0, upper.length)],
        lower[crypto.randomInt(0, lower.length)],
        digits[crypto.randomInt(0, digits.length)],
        symbols[crypto.randomInt(0, symbols.length)],
    ];
    for (let i = chars.length; i < len; i += 1) {
        chars.push(all[crypto.randomInt(0, all.length)]);
    }
    // Fisher-Yates con `crypto.randomInt`
    for (let i = chars.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(0, i + 1);
        const tmp = chars[i];
        chars[i] = chars[j];
        chars[j] = tmp;
    }
    return chars.join('');
};

/**
 * Política de seguridad de contraseñas personales al activar la cuenta.
 */
export const validatePasswordComplexity = (password, context = {}) => {
    if (typeof password !== 'string') {
        return { valid: false, error: 'Ingresa una contraseña válida.' };
    }
    if (password.length < 8) {
        return { valid: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
    }
    if (password.length > 128) {
        return { valid: false, error: 'La contraseña no puede superar 128 caracteres.' };
    }
    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(password) || !/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
        return { valid: false, error: 'La contraseña debe combinar letras con al menos un número o símbolo.' };
    }
    const cleanLower = password.trim().toLowerCase();
    const email = normalizeEmail(context.email);
    const doc = normalizeDocument(context.documentNumber).toLowerCase();
    if (email && cleanLower === email) {
        return { valid: false, error: 'La contraseña no puede ser igual a tu correo electrónico.' };
    }
    if (doc && doc.length >= 5 && cleanLower === doc) {
        return { valid: false, error: 'Por seguridad, la contraseña no puede ser igual a tu documento de identidad.' };
    }
    return { valid: true, error: null };
};

// ── 6. Variables dinámicas, plantillas y guardia de destinatario ─────

export const ACTIVATION_TEMPLATE_VARIABLES = [
    { token: '{{participant_name}}', label: 'Nombre completo del participante', example: 'Carlos Andrés Rodríguez' },
    { token: '{{participant_email}}', label: 'Correo electrónico del participante', example: 'carlos@ejemplo.org' },
    { token: '{{event_name}}', label: 'Nombre del evento', example: 'XIII Conferencia Distrital — Edición Meta' },
    { token: '{{event_date}}', label: 'Fecha del evento', example: '15 de mayo de 2027' },
    { token: '{{event_location}}', label: 'Lugar o sede del evento', example: 'Villavicencio, Meta' },
    { token: '{{registration_code}}', label: 'Código de inscripción', example: 'RPF13-C-ASC4M' },
    { token: '{{organization_name}}', label: 'Nombre del club, distrito u organización', example: 'Distrito Rotario 4281' },
    { token: '{{organization_signature}}', label: 'Firma institucional del organizador', example: 'Equipo del Evento · Distrito Rotario 4281' },
    { token: '{{event_portal_url}}', label: 'URL del portal del evento (/mi-inscripcion)', example: 'https://rotary4281.org/mi-inscripcion' },
    { token: '{{activation_url}}', label: 'Enlace individual y seguro de activación', example: 'https://rotary4281.org/mi-inscripcion?activar=...' },
    { token: '{{activation_expiration}}', label: 'Vigencia del enlace de activación', example: '72 horas (hasta el 15 nov 2026, 18:00)' },
    { token: '{{account_status}}', label: 'Estado actual de la cuenta', example: 'Invitación enviada' },
    { token: '{{activation_status}}', label: 'Estado de activación', example: 'Pendiente' },
    { token: '{{support_url}}', label: 'Canal o enlace de soporte del organizador', example: 'https://rotary4281.org/contacto' },
];

export const DEFAULT_ACTIVATION_EMAIL_SUBJECT =
    'Activación de cuenta — {{event_name}}';

export const DEFAULT_ACTIVATION_EMAIL_BODY = [
    'Hola {{participant_name}},',
    '',
    'Tu inscripción al evento {{event_name}} se encuentra registrada en nuestra plataforma (código {{registration_code}}).',
    '',
    'Para consultar los detalles de tu participación, actualizar tu información autorizada y acceder a los servicios del evento, activa tu cuenta personal desde el siguiente enlace seguro de un solo uso:',
    '',
    '{{activation_url}}',
    '',
    'Por seguridad, este enlace es personal y tiene vigencia de {{activation_expiration}}.',
    '',
    'Si ya habías activado tu cuenta anteriormente, puedes ingresar directamente en:',
    '{{event_portal_url}}',
    '',
    'Cordialmente,',
    '{{organization_signature}}',
].join('\n');

export const DEFAULT_ACTIVATION_WHATSAPP_BODY = [
    'Hola *{{participant_name}}* 👋',
    '',
    'Tu inscripción a *{{event_name}}* (código `{{registration_code}}`) ya cuenta con acceso al portal del participante de *{{organization_name}}*.',
    '',
    '🔐 *Activa tu cuenta y define tu contraseña personal aquí:*',
    '{{activation_url}}',
    '',
    '⏳ _Este enlace es personal, de un solo uso y vence en {{activation_expiration}}._',
    '',
    '{{organization_signature}}',
].join('\n');

const formatSpanishDate = (d) => {
    if (!d) return 'Por confirmar';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatSpanishDateTime = (d) => {
    if (!d) return '72 horas';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

/**
 * Construye el diccionario de variables dinámicas para un participante,
 * su inscripción, el evento y la organización anfitriona.
 */
export const buildActivationVariables = ({
    row,
    event,
    organization,
    origin,
    activationUrl,
    expiresAt,
    ttlHours = DEFAULT_ACTIVATION_TTL_HOURS,
    accountState,
    supportUrl,
}) => {
    const cleanOrigin = String(origin || 'https://rotary4281.org').trim().replace(/\/+$/, '');
    const fullName = [row?.firstName, row?.lastName].filter(Boolean).join(' ').trim() || row?.email || 'Participante';
    const orgName = organization?.name || event?.club?.name || 'Club Platform for Rotary';
    const orgSignature = organization?.signature || `Equipo del Evento · ${orgName}`;
    const eventTitle = event?.title || 'Evento Institucional';
    const eventDate = formatSpanishDate(event?.startDate);
    const eventLocation = event?.location || 'Sede oficial del evento';
    const portalUrl = buildPortalUrl(cleanOrigin);
    const expirationLabel = expiresAt
        ? `${ttlHours} horas (hasta ${formatSpanishDateTime(expiresAt)})`
        : `${ttlHours} horas`;
    const resolvedSupportUrl = supportUrl || `${cleanOrigin}/contacto`;
    const accLabel = accountState?.accountStatusMeta?.label || accountStatusMeta(accountState?.accountStatus || 'invitation_sent').label;
    const actLabel = accountState?.activationStatusMeta?.label || activationStatusMeta(accountState?.activationStatus || 'sent').label;

    return {
        participant_name: fullName,
        participant_email: normalizeEmail(row?.email),
        event_name: eventTitle,
        event_date: eventDate,
        event_location: eventLocation,
        registration_code: row?.registrationCode || '',
        organization_name: orgName,
        organization_signature: orgSignature,
        event_portal_url: portalUrl,
        activation_url: activationUrl || portalUrl,
        activation_expiration: expirationLabel,
        account_status: accLabel,
        activation_status: actLabel,
        support_url: resolvedSupportUrl,
        // Alias en español para compatibilidad con plantillas personalizadas del administrador
        nombre: fullName,
        correo: normalizeEmail(row?.email),
        evento: eventTitle,
        fecha_evento: eventDate,
        lugar_evento: eventLocation,
        codigo: row?.registrationCode || '',
        organizacion: orgName,
        firma: orgSignature,
        portal_url: portalUrl,
        link_activacion: activationUrl || portalUrl,
        vencimiento: expirationLabel,
        distrito: row?.district || '',
        club: row?.clubName || '',
    };
};

export const interpolateActivationTemplate = (template, variables = {}) => {
    if (typeof template !== 'string' || !template) return '';
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
        const k = String(key || '').trim();
        return Object.prototype.hasOwnProperty.call(variables, k)
            ? String(variables[k] ?? '')
            : match;
    });
};

/**
 * Guardia de integridad de destinatario (Secciones 12, 13 y 14):
 * Verifica que el token de activación incluido en un mensaje corresponda
 * exactamente a la cuenta vinculada a la inscripción del destinatario,
 * impidiendo que por error un participante reciba el enlace de otro.
 */
export const verifyRecipientOwnsActivationToken = ({
    row,
    account,
    token,
    recipientEmail,
    recipientPhone,
}) => {
    if (!row || !account) {
        throw new Error('Falta la inscripción o la cuenta vinculada para validar el destinatario.');
    }
    if (row.accountId && row.accountId !== account.id) {
        throw new Error('La cuenta de activación no corresponde a la inscripción seleccionada.');
    }
    const rowEmail = normalizeEmail(row.email);
    const accEmail = normalizeEmail(account.email);
    if (!rowEmail || !accEmail || rowEmail !== accEmail) {
        throw new Error('El correo de la inscripción no coincide con el correo de la cuenta de acceso.');
    }
    if (recipientEmail && normalizeEmail(recipientEmail) !== rowEmail) {
        throw new Error('El destinatario de correo no coincide con el titular de la inscripción.');
    }
    if (recipientPhone) {
        const cleanTarget = String(recipientPhone).replace(/[^\d+]/g, '');
        const cleanRowPhone = String(row.phone || account.phone || '').replace(/[^\d+]/g, '');
        if (!cleanTarget || !cleanRowPhone || cleanTarget !== cleanRowPhone) {
            throw new Error('El número de teléfono destinatario no coincide con el titular de la inscripción.');
        }
    }
    if (token) {
        const computedHash = hashActivationToken(token);
        if (!account.activationTokenHash || computedHash !== account.activationTokenHash) {
            throw new Error('El token de activación no coincide con el hash vigente de la cuenta del participante.');
        }
    }
    return true;
};

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Construye el correo HTML y de texto plano para la plantilla
 * «Activación de cuenta — Inscripción a evento».
 */
export const renderActivationEmail = ({
    subjectTemplate = DEFAULT_ACTIVATION_EMAIL_SUBJECT,
    bodyTemplate = DEFAULT_ACTIVATION_EMAIL_BODY,
    variables = {},
    temporaryPassword = null,
}) => {
    const subject = interpolateActivationTemplate(subjectTemplate, variables).trim()
        || `Activación de cuenta — ${variables.event_name || 'Evento'}`;
    const plainBody = interpolateActivationTemplate(bodyTemplate, variables).trim();

    const paragraphsHtml = plainBody
        .split(/\n{2,}/)
        .map(block => {
            const trimmed = block.trim();
            if (trimmed === variables.activation_url) {
                return `<div style="margin:24px 0;text-align:center;">
                    <a href="${escapeHtml(variables.activation_url)}" style="display:inline-block;padding:13px 28px;background:#013388;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:10px;">Activar mi cuenta y crear contraseña</a>
                </div>`;
            }
            const lines = trimmed.split('\n').map(escapeHtml).join('<br>');
            return `<p style="margin:0 0 14px;color:#1e293b;font-size:14px;line-height:1.6;">${lines}</p>`;
        })
        .join('');

    const contingencyBlock = temporaryPassword
        ? `<div style="margin:18px 0;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;">
            <strong>Credencial temporal de contingencia (un solo uso):</strong>
            <div style="margin-top:6px;font-family:ui-monospace,monospace;font-size:15px;font-weight:700;color:#78350f;">Contraseña temporal: ${escapeHtml(temporaryPassword)}</div>
            <div style="margin-top:4px;font-size:12px;">Se te solicitará cambiarla obligatoriamente en tu primer ingreso.</div>
           </div>`
        : '';

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;background:#f8fafc;">
        <div style="background:#013388;color:#ffffff;padding:20px 24px;border-radius:14px 14px 0 0;">
            <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">${escapeHtml(variables.organization_name || 'Club Platform for Rotary')}</div>
            <div style="font-size:20px;font-weight:800;margin-top:4px;">${escapeHtml(variables.event_name || 'Activación de cuenta')}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:24px;background:#ffffff;">
            ${paragraphsHtml}
            ${contingencyBlock}
            <div style="margin-top:20px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;color:#475569;">
                <div><strong>Participante:</strong> ${escapeHtml(variables.participant_name)} (${escapeHtml(variables.participant_email)})</div>
                ${variables.registration_code ? `<div style="margin-top:4px;"><strong>Código de inscripción:</strong> <span style="font-family:ui-monospace,monospace;font-weight:700;color:#0f172a;">${escapeHtml(variables.registration_code)}</span></div>` : ''}
                <div style="margin-top:4px;"><strong>Vigencia del enlace:</strong> ${escapeHtml(variables.activation_expiration)}</div>
                <div style="margin-top:6px;word-break:break-all;color:#64748b;">Si el botón no abre automáticamente, copia y pega este enlace en tu navegador:<br><a href="${escapeHtml(variables.activation_url)}" style="color:#013388;">${escapeHtml(variables.activation_url)}</a></div>
            </div>
            <div style="margin-top:20px;padding-top:14px;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b;">
                ¿Necesitas ayuda? Comunícate con el soporte del organizador en <a href="${escapeHtml(variables.support_url)}" style="color:#013388;">${escapeHtml(variables.support_url)}</a>.
            </div>
        </div>
    </div>`;

    return {
        subject,
        text: plainBody,
        html,
        redactedText: redactActivationSecrets(plainBody),
    };
};

/**
 * Construye el mensaje de WhatsApp para activación de cuenta.
 */
export const renderActivationWhatsApp = ({
    bodyTemplate = DEFAULT_ACTIVATION_WHATSAPP_BODY,
    variables = {},
}) => {
    const text = interpolateActivationTemplate(bodyTemplate, variables).trim();
    return {
        text,
        redactedText: redactActivationSecrets(text),
    };
};

// ── 7. Edición autorizada en el portal del participante ──────────────

/**
 * Campos que el participante SÍ puede actualizar desde `/mi-inscripcion`
 * sin alterar su identidad verificada, distrito/club ni estado financiero.
 */
export const AUTHORIZED_PARTICIPANT_FIELDS = [
    'phone',
    'eps',
    'foodAllergy',
    'emergencyName',
    'emergencyPhone',
    'comments',
];

/**
 * Campos protegidos que un participante NO puede modificar por su cuenta.
 */
export const PROTECTED_PARTICIPANT_FIELDS = [
    'id',
    'eventId',
    'clubId',
    'accountId',
    'registrationCode',
    'registrationSource',
    'status',
    'reviewNotes',
    'reviewedBy',
    'reviewedAt',
    'firstName',
    'lastName',
    'documentNumber',
    'email',
    'district',
    'clubName',
    'clubRole',
    'membershipType',
    'guestType',
    'paymentMethod',
    'paymentMethodOther',
    'receiptUrl',
    'receiptKey',
    'receiptName',
    'receiptMime',
    'receiptSize',
    'paymentStatus',
    'totalAmount',
    'unitPrice',
    'checkedInAt',
    'checkedInBy',
];

/**
 * Valida una solicitud `PATCH /portal/registrations/:id` enviada por el
 * propio participante autenticado.
 *   - Si incluye algún campo protegido con intención de cambio, devuelve
 *     `forbiddenFields` no vacío (para responder 403).
 *   - Limpia y valida los campos autorizados (`phone`, `eps`, `foodAllergy`,
 *     `emergencyName`, `emergencyPhone`, `comments`).
 */
export const validateParticipantProfilePatch = (payload = {}, currentRow = {}) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            ok: false,
            status: 400,
            error: 'El cuerpo de la solicitud no es válido.',
            forbiddenFields: [],
            errors: {},
            updates: {},
        };
    }

    const forbiddenFields = [];
    for (const key of Object.keys(payload)) {
        if (PROTECTED_PARTICIPANT_FIELDS.includes(key)) {
            const incoming = payload[key];
            const current = currentRow[key];
            if (incoming !== undefined && String(incoming ?? '').trim() !== String(current ?? '').trim()) {
                forbiddenFields.push(key);
            }
        } else if (!AUTHORIZED_PARTICIPANT_FIELDS.includes(key)) {
            forbiddenFields.push(key);
        }
    }

    if (forbiddenFields.length > 0) {
        return {
            ok: false,
            status: 403,
            error: `No tienes permiso para modificar campos protegidos o validados (${forbiddenFields.join(', ')}).`,
            forbiddenFields,
            errors: {},
            updates: {},
        };
    }

    const errors = {};
    const updates = {};

    for (const key of AUTHORIZED_PARTICIPANT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
        const raw = typeof payload[key] === 'string' ? payload[key].trim() : String(payload[key] ?? '').trim();

        if (key === 'phone') {
            if (!raw || !PHONE_RE.test(raw)) {
                errors.phone = 'Ingresa un teléfono o WhatsApp válido (mínimo 7 dígitos).';
                continue;
            }
            if (raw.length > 40) {
                errors.phone = 'El teléfono no puede superar 40 caracteres.';
                continue;
            }
        } else if (key === 'emergencyPhone') {
            if (!raw || !PHONE_RE.test(raw)) {
                errors.emergencyPhone = 'Ingresa un teléfono de emergencia válido (mínimo 7 dígitos).';
                continue;
            }
            if (raw.length > 40) {
                errors.emergencyPhone = 'El teléfono de emergencia no puede superar 40 caracteres.';
                continue;
            }
        } else if (key === 'emergencyName') {
            if (!raw || raw.length < 2) {
                errors.emergencyName = 'Ingresa el nombre del contacto de emergencia.';
                continue;
            }
            if (raw.length > 160) {
                errors.emergencyName = 'El nombre del contacto de emergencia no puede superar 160 caracteres.';
                continue;
            }
        } else if (key === 'eps') {
            if (!raw || raw.length < 2) {
                errors.eps = 'Indica tu EPS o entidad de salud.';
                continue;
            }
            if (raw.length > 160) {
                errors.eps = 'La EPS no puede superar 160 caracteres.';
                continue;
            }
        } else if (key === 'foodAllergy') {
            if (raw.length > 500) {
                errors.foodAllergy = 'El campo de alergias o restricciones no puede superar 500 caracteres.';
                continue;
            }
        } else if (key === 'comments') {
            if (raw.length > 1000) {
                errors.comments = 'Los comentarios no pueden superar 1000 caracteres.';
                continue;
            }
        }

        updates[key] = raw;
    }

    if (Object.keys(errors).length > 0) {
        return {
            ok: false,
            status: 400,
            error: Object.values(errors)[0],
            forbiddenFields: [],
            errors,
            updates: {},
        };
    }

    return {
        ok: true,
        status: 200,
        error: null,
        forbiddenFields: [],
        errors: {},
        updates,
    };
};
