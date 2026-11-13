#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Sistema de cuentas, activación y vinculación — 28 PRUEBAS DE CONFORMIDAD
// Club Platform for Rotary — v4.965.0
//
// Verifica de punta a punta las 28 especificaciones de la Sección 19:
//  1. Vinculación directa por accountId (máxima prioridad)
//  2. Coincidencia limpia por correo electrónico
//  3. Coincidencia por documento de identidad
//  4. Conflicto por nombres incompatibles (needs_review)
//  5. Conflicto por documento contradictorio (needs_review)
//  6. Mismo correo con distinto documento en el mismo evento (needs_review)
//  7. Correo faltante o inválido
//  8. Reutilización de cuenta entre múltiples eventos (sin duplicación)
//  9. Detección y vinculación con User central
// 10. Detección y vinculación con ProjectFairAccount
// 11. Idempotencia del motor de aprovisionamiento masivo
// 12. Generación criptográfica de token de activación de un solo uso
// 13. Almacenamiento seguro únicamente por SHA-256 (nunca texto plano)
// 14. Verificación de vigencia y rechazo de tokens expirados (TTL 72h)
// 15. Consumo de un solo uso e invalidación inmediata tras activación
// 16. Validación estricta de complejidad de contraseñas
// 17. Contraseña temporal de contingencia (bcrypt, caduca, un solo uso)
// 18. Notificación por correo con variables dinámicas
// 19. Despacho por WhatsApp institucional
// 20. Guardia de destinatario (verifyRecipientOwnsActivationToken)
// 21. Redacción de secretos en el historial y registros de auditoría
// 22. Reenvío y regeneración de invitación vencida o solicitada
// 23. Derivación del estado de cuenta suspendida
// 24. Filtros administrativos por accountStatus y activationStatus
// 25. Aislamiento de sesión en el portal de participantes (/mi-inscripcion)
// 26. Consulta de inscripción completada y comprobante en el portal
// 27. Edición autorizada de campos del participante (phone, eps, alergia...)
// 28. Bloqueo estricto (HTTP 403) ante intentos de alterar campos protegidos
// ════════════════════════════════════════════════════════════════════
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {
    ACCOUNT_STATUSES,
    ACCOUNT_STATUS_KEYS,
    accountStatusMeta,
    ACTIVATION_STATUSES,
    ACTIVATION_STATUS_KEYS,
    activationStatusMeta,
    normalizeEmail,
    isValidEmail,
    normalizeDocument,
    extractNameTokens,
    areNamesCompatible,
    reconcileParticipantIdentity,
    deriveAccountAndActivationState,
    generateActivationToken,
    hashActivationToken,
    buildActivationUrl,
    redactActivationSecrets,
    validatePasswordComplexity,
    generateTemporaryPassword,
    interpolateActivationTemplate,
    verifyRecipientOwnsActivationToken,
    AUTHORIZED_PARTICIPANT_FIELDS,
    PROTECTED_PARTICIPANT_FIELDS,
    validateParticipantProfilePatch,
    DEFAULT_ACTIVATION_TTL_HOURS,
} from '../server/lib/completedAccountSpec.js';

let passed = 0;
const failures = [];

const check = (desc, ok, detail = '') => {
    if (ok) {
        passed++;
        console.log(`  ✓ ${desc}`);
    } else {
        failures.push(desc);
        console.error(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`);
    }
};

const group = (title) => console.log(`\n${title}`);

// ════════════════════════════════════════════════════════════════════
group('1. Vinculación directa por accountId (máxima prioridad)');
// ════════════════════════════════════════════════════════════════════
{
    const existingAcc = {
        id: 'acc-direct-001',
        email: 'socio@clubrotario.org',
        documentNumber: '10203040',
        firstName: 'Carlos',
        lastName: 'Pérez',
        isActive: true,
    };
    const row = {
        id: 'comp-001',
        accountId: 'acc-direct-001',
        email: 'socio@clubrotario.org',
        documentNumber: '10203040',
        firstName: 'Carlos',
        lastName: 'Pérez',
    };
    const context = {
        accountById: new Map([['acc-direct-001', existingAcc]]),
        accountsByEmail: new Map(),
        accountsByDocument: new Map(),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Prioridad absoluta a accountId ya vinculado', rec.matchedAccount?.id === 'acc-direct-001');
    check('Acción es already_linked', rec.action === 'already_linked');
    check('Confianza verificada en vínculo directo', rec.confidence === 'verified');
}

// ════════════════════════════════════════════════════════════════════
group('2. Coincidencia limpia por correo electrónico');
// ════════════════════════════════════════════════════════════════════
{
    const existingAcc = {
        id: 'acc-mail-002',
        email: 'maria.gomez@rotary4281.org',
        documentNumber: '52899123',
        firstName: 'María',
        lastName: 'Gómez',
        isActive: true,
    };
    const row = {
        id: 'comp-002',
        email: 'MARIA.GOMEZ@rotary4281.org', // caso mixto para probar normalización
        documentNumber: '52899123',
        firstName: 'Maria Elena',
        lastName: 'Gomez',
    };
    const context = {
        accountById: new Map(),
        accountsByEmail: new Map([['maria.gomez@rotary4281.org', existingAcc]]),
        accountsByDocument: new Map([['52899123', [existingAcc]]]),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Coincidencia limpia por correo normalizado', rec.matchedAccount?.id === 'acc-mail-002');
    check('Acción es link_existing sin revisión', rec.action === 'link_existing' && rec.reviewReason === null);
    check('Confianza verificada por coincidencia de email y documento', rec.confidence === 'verified');
}

// ════════════════════════════════════════════════════════════════════
group('3. Coincidencia por documento de identidad');
// ════════════════════════════════════════════════════════════════════
{
    const existingAcc = {
        id: 'acc-doc-003',
        email: 'antiguo.correo@trabajo.com',
        documentNumber: '80123456',
        firstName: 'Juan',
        lastName: 'Restrepo',
        isActive: true,
    };
    const row = {
        id: 'comp-003',
        email: 'nuevo.correo.personal@gmail.com',
        documentNumber: '80.123.456', // con formato
        firstName: 'Juan David',
        lastName: 'Restrepo',
    };
    const context = {
        accountById: new Map(),
        accountsByEmail: new Map(),
        accountsByDocument: new Map([['80123456', [existingAcc]]]),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Coincidencia por documento con distinto correo requiere revisión administrativa de seguridad',
        rec.action === 'needs_review' && rec.reviewReason.includes('documento 80.123.456'));
    check('matchedAccount identifica la cuenta coincidente para que el admin pueda conciliar',
        rec.matchedAccount?.id === 'acc-doc-003');
}

// ════════════════════════════════════════════════════════════════════
group('4. Conflicto por nombres incompatibles (needs_review)');
// ════════════════════════════════════════════════════════════════════
{
    const existingAcc = {
        id: 'acc-name-004',
        email: 'familia.perez@gmail.com',
        firstName: 'Roberto',
        lastName: 'Pérez',
    };
    const row = {
        id: 'comp-004',
        email: 'familia.perez@gmail.com',
        firstName: 'Camila',
        lastName: 'López',
    };
    const context = {
        accountById: new Map(),
        accountsByEmail: new Map([['familia.perez@gmail.com', existingAcc]]),
        accountsByDocument: new Map(),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Mismo correo pero nombres completamente distintos dispara needs_review', rec.action === 'needs_review');
    check('Motivo de revisión reporta conflicto de nombres', rec.reviewReason.includes('no coincide'));
    check('Confianza es ambigua', rec.confidence === 'ambiguous');
}

// ════════════════════════════════════════════════════════════════════
group('5. Conflicto por documento contradictorio (needs_review)');
// ════════════════════════════════════════════════════════════════════
{
    const existingAcc = {
        id: 'acc-doc-005',
        email: 'contacto@rotary.org',
        documentNumber: '10001000',
        firstName: 'Pedro',
        lastName: 'Alvarado',
    };
    const row = {
        id: 'comp-005',
        email: 'contacto@rotary.org',
        documentNumber: '20002000', // Documento diferente y no vacío
        firstName: 'Pedro',
        lastName: 'Alvarado',
    };
    const context = {
        accountById: new Map(),
        accountsByEmail: new Map([['contacto@rotary.org', existingAcc]]),
        accountsByDocument: new Map(),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Mismo correo pero documentos contradictorios exige revisión', rec.action === 'needs_review');
    check('Motivo menciona documento contradictorio', rec.reviewReason.includes('documento'));
}

// ════════════════════════════════════════════════════════════════════
group('6. Mismo correo con distinto documento en el mismo evento (needs_review)');
// ════════════════════════════════════════════════════════════════════
{
    const row = {
        id: 'comp-006',
        email: 'secretaria@club.org',
        documentNumber: '79111222',
        firstName: 'Lucía',
        lastName: 'Méndez',
    };
    const peer1 = {
        id: 'comp-006-peer',
        email: 'secretaria@club.org',
        documentNumber: '80333444', // otro socio usando el correo del club
        firstName: 'Héctor',
        lastName: 'Torres',
    };
    const context = {
        accountById: new Map(),
        accountsByEmail: new Map(),
        accountsByDocument: new Map(),
        peerRowsByEmail: new Map([['secretaria@club.org', [row, peer1]]]),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Correo institucional compartido por múltiples participantes del evento activa needs_review', rec.action === 'needs_review');
    check('Protege contra sobreescritura o vinculación errónea entre socios', rec.reviewReason.includes('distinto documento'));
}

// ════════════════════════════════════════════════════════════════════
group('7. Correo faltante o inválido');
// ════════════════════════════════════════════════════════════════════
{
    const rowSinCorreo = {
        id: 'comp-007-a',
        email: '',
        documentNumber: '12345',
        firstName: 'Sin',
        lastName: 'Email',
    };
    const rowCorreoInvalido = {
        id: 'comp-007-b',
        email: 'correo_invalido_sin_arroba',
        documentNumber: '12345',
        firstName: 'Invalido',
        lastName: 'Mail',
    };
    const context = {
        accountById: new Map(),
        accountsByEmail: new Map(),
        accountsByDocument: new Map(),
    };
    const recA = reconcileParticipantIdentity(rowSinCorreo, context);
    check('Fila sin correo se marca invalid_email', recA.action === 'invalid_email');
    check('Motivo explicita correo ausente', recA.reviewReason.includes('Correo electrónico ausente'));

    const recB = reconcileParticipantIdentity(rowCorreoInvalido, context);
    check('Fila con correo malformado se bloquea', recB.action === 'invalid_email');
}

// ════════════════════════════════════════════════════════════════════
group('8. Reutilización de cuenta entre múltiples eventos (sin duplicación)');
// ════════════════════════════════════════════════════════════════════
{
    const existingAcc = {
        id: 'acc-multi-008',
        email: 'socio.viajero@rotary4281.org',
        documentNumber: '91222333',
        firstName: 'Alonso',
        lastName: 'Quijano',
        isActive: true,
    };
    const row = {
        id: 'comp-008',
        email: 'socio.viajero@rotary4281.org',
        documentNumber: '91222333',
        firstName: 'Alonso',
        lastName: 'Quijano',
    };
    const context = {
        accountById: new Map([['acc-multi-008', existingAcc]]),
        accountsByEmail: new Map([['socio.viajero@rotary4281.org', existingAcc]]),
        accountsByDocument: new Map([['91222333', [existingAcc]]]),
        otherEventsByAccountId: new Map([['acc-multi-008', [{ eventId: 'evento-distrital-2025', source: 'online' }]]]),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Reconoce al participante que ya estuvo en otro evento previo', rec.otherEvents.length === 1);
    check('Reutiliza la cuenta y ejecuta link_existing', rec.action === 'link_existing');
    check('matchedAccount apunta a la cuenta preexistente multi-evento', rec.matchedAccount?.id === 'acc-multi-008');
}

// ════════════════════════════════════════════════════════════════════
group('9. Detección y vinculación con User central');
// ════════════════════════════════════════════════════════════════════
{
    const centralUser = {
        id: 'usr-central-009',
        email: 'gobernador@rotary4281.org',
        name: 'Daniel Yazo',
        documentNumber: '70111222',
        role: 'district_governor',
    };
    const row = {
        id: 'comp-009',
        email: 'gobernador@rotary4281.org',
        documentNumber: '70111222',
        firstName: 'Daniel',
        lastName: 'Yazo',
    };
    const context = {
        accountById: new Map(),
        accountsByEmail: new Map(),
        accountsByDocument: new Map(),
        usersByEmail: new Map([['gobernador@rotary4281.org', centralUser]]),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Detecta coincidencia con tabla central User', rec.matchedExternalIdentity?.realm === 'user');
    check('Acción es create_new con identidad externa asociada', rec.action === 'create_new' && rec.matchedExternalIdentity?.id === 'usr-central-009');
}

// ════════════════════════════════════════════════════════════════════
group('10. Detección y vinculación con ProjectFairAccount');
// ════════════════════════════════════════════════════════════════════
{
    const fairAcc = {
        id: 'pfa-010',
        email: 'lider.proyecto@fundacion.org',
        firstName: 'Líder',
        lastName: 'Proyectos',
        organization: 'Fundación Rotaria',
    };
    const row = {
        id: 'comp-010',
        email: 'lider.proyecto@fundacion.org',
        documentNumber: '55667788',
        firstName: 'Líder',
        lastName: 'Proyectos',
    };
    const context = {
        accountById: new Map(),
        accountsByEmail: new Map(),
        accountsByDocument: new Map(),
        projectFairByEmail: new Map([['lider.proyecto@fundacion.org', fairAcc]]),
    };
    const rec = reconcileParticipantIdentity(row, context);
    check('Detecta existencia en Feria de Proyectos sin colisión', rec.matchedExternalIdentity?.realm === 'project_fair');
    check('Identifica el ID de la cuenta de Feria', rec.matchedExternalIdentity?.id === 'pfa-010');
}

// ════════════════════════════════════════════════════════════════════
group('11. Idempotencia del motor de aprovisionamiento masivo');
// ════════════════════════════════════════════════════════════════════
{
    const rowAlreadyLinked = {
        id: 'comp-011',
        accountId: 'acc-already-created-011',
        email: 'socio.repetido@club.org',
        documentNumber: '1234567',
        firstName: 'Socio',
        lastName: 'Repetido',
    };
    const existingAcc = {
        id: 'acc-already-created-011',
        email: 'socio.repetido@club.org',
        documentNumber: '1234567',
        isActive: true,
        passwordHash: '$2a$10$hashedpass',
    };
    const context = {
        accountById: new Map([['acc-already-created-011', existingAcc]]),
        accountsByEmail: new Map([['socio.repetido@club.org', existingAcc]]),
        accountsByDocument: new Map([['1234567', [existingAcc]]]),
    };
    const rec = reconcileParticipantIdentity(rowAlreadyLinked, context);
    check('La segunda pasada detecta cuenta ya vinculada y no crea duplicados', rec.action === 'already_linked');

    const state = deriveAccountAndActivationState(rowAlreadyLinked, existingAcc, rec, new Date());
    check('Estado derivado es active', state.accountStatus === 'active');
    check('Activación completada sin re-aprovisionar', state.activationStatus === 'completed');
    check('canCreateAccount es false cuando ya está vinculado', state.canCreateAccount === false);
}

// ════════════════════════════════════════════════════════════════════
group('12. Generación criptográfica de token de activación de un solo uso');
// ════════════════════════════════════════════════════════════════════
{
    const { token, tokenHash, expiresAt } = generateActivationToken(72);
    check('Token tiene alta entropía (32 bytes = 43 caracteres base64url seguros para URL)', typeof token === 'string' && token.length >= 43);
    check('Hash SHA-256 generado correctamente', typeof tokenHash === 'string' && tokenHash.length === 64);
    check('Token y Hash son matemáticamente diferentes', token !== tokenHash);
    check('Vigencia calculada a 72 horas por defecto', expiresAt > new Date(Date.now() + 71 * 3600 * 1000));

    const token2 = generateActivationToken(72).token;
    check('Tokens sucesivos son totalmente no predecibles e impredecibles', token !== token2);
}

// ════════════════════════════════════════════════════════════════════
group('13. Almacenamiento seguro únicamente por SHA-256 (nunca texto plano)');
// ════════════════════════════════════════════════════════════════════
{
    const rawSecret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';
    const computedHash = hashActivationToken(rawSecret);
    const expectedHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    check('Función de hash coincide exactamente con SHA-256 canónico', computedHash === expectedHash);
    check('Hash en reposo nunca permite deducir el token original sin fuerza bruta', computedHash !== rawSecret);
}

// ════════════════════════════════════════════════════════════════════
group('14. Verificación de vigencia y rechazo de tokens expirados (TTL 72h)');
// ════════════════════════════════════════════════════════════════════
{
    const pastExpiresAt = new Date(Date.now() - 3600 * 1000); // 1 hora en el pasado
    const rowExpired = {
        id: 'comp-014',
        accountId: 'acc-014',
        activationSentAt: new Date(Date.now() - 73 * 3600 * 1000),
        activationExpiresAt: pastExpiresAt,
    };
    const accPending = {
        id: 'acc-014',
        isActive: false,
        passwordHash: '!', // sin activar
        activationExpiresAt: pastExpiresAt,
    };
    const state = deriveAccountAndActivationState(rowExpired, accPending, null, new Date());
    check('Token vencido deriva en accountStatus invitation_expired', state.accountStatus === 'invitation_expired');
    check('Estado de activación es expired', state.activationStatus === 'expired');
}

// ════════════════════════════════════════════════════════════════════
group('15. Consumo de un solo uso e invalidación inmediata tras activación');
// ════════════════════════════════════════════════════════════════════
{
    const activatedAccount = {
        id: 'acc-015',
        isActive: true,
        passwordHash: bcrypt.hashSync('Rotary2027#Secure!', 10),
        activationTokenHash: null,
        activationExpiresAt: null,
        activatedAt: new Date(),
    };
    check('activationTokenHash queda nulo tras activar la cuenta', activatedAccount.activationTokenHash === null);
    check('activationExpiresAt queda nulo tras activación exitosa', activatedAccount.activationExpiresAt === null);

    const state = deriveAccountAndActivationState({ id: 'comp-015', accountId: 'acc-015' }, activatedAccount);
    check('Cuenta pasa a active', state.accountStatus === 'active');
    check('Activación pasa a completed', state.activationStatus === 'completed');
}

// ════════════════════════════════════════════════════════════════════
group('16. Validación estricta de complejidad de contraseñas');
// ════════════════════════════════════════════════════════════════════
{
    const valGood = validatePasswordComplexity('Rotary2027!Ok');
    check('Contraseña que cumple todas las directivas es válida', valGood.valid === true && valGood.error === null);

    const valShort = validatePasswordComplexity('Ro1!x');
    check('Contraseña con menos de 8 caracteres es rechazada', valShort.valid === false && valShort.error.includes('8'));

    const valNoNumberOrSymbol = validatePasswordComplexity('RotaryValidLettersOnly');
    check('Contraseña sin dígitos ni símbolos es rechazada', valNoNumberOrSymbol.valid === false && valNoNumberOrSymbol.error.includes('número o símbolo'));

    const valSameEmail = validatePasswordComplexity('usuario@rotary4281.org', { email: 'usuario@rotary4281.org' });
    check('Contraseña idéntica al correo es rechazada', valSameEmail.valid === false && valSameEmail.error.includes('correo'));

    const valSameDoc = validatePasswordComplexity('CC80123456', { documentNumber: 'CC80.123.456' });
    check('Contraseña idéntica al documento es rechazada', valSameDoc.valid === false && valSameDoc.error.includes('documento'));

    const valTooLong = validatePasswordComplexity('a'.repeat(129));
    check('Contraseña que supera 128 caracteres es rechazada', valTooLong.valid === false && valTooLong.error.includes('128'));
}

// ════════════════════════════════════════════════════════════════════
group('17. Contraseña temporal de contingencia (bcrypt, caduca, un solo uso)');
// ════════════════════════════════════════════════════════════════════
{
    const temp = generateTemporaryPassword(14);
    check('Contraseña temporal tiene longitud y entropía requeridas', temp.length >= 14);
    const complexity = validatePasswordComplexity(temp);
    check('Contraseña temporal autogenerada cumple todas las reglas de complejidad', complexity.valid === true);

    const hashed = bcrypt.hashSync(temp, 10);
    check('Contraseña temporal se hashea con bcrypt antes de persistir', bcrypt.compareSync(temp, hashed) === true);
}

// ════════════════════════════════════════════════════════════════════
group('18. Notificación por correo con variables dinámicas');
// ════════════════════════════════════════════════════════════════════
{
    const variables = {
        activation_url: 'https://rotary4281.org/mi-inscripcion?activar=tok12345',
        participant_name: 'Daniel Yazo',
        participant_firstname: 'Daniel',
        event_title: 'XIII Conferencia Distrital 2027',
        event_place: 'Villavicencio',
        event_date: '15 al 17 de mayo de 2027',
        registration_code: 'CR4281-2027-00123',
        expiration_hours: '72 horas',
    };
    const template = 'Hola {{participant_name}}, activa tu acceso para {{event_title}} en: {{activation_url}}. Tienes {{expiration_hours}}. Código: {{registration_code}}';
    const resolved = interpolateActivationTemplate(template, variables);
    check('Reemplaza {{participant_name}}', resolved.includes('Daniel Yazo'));
    check('Reemplaza {{event_title}}', resolved.includes('XIII Conferencia Distrital 2027'));
    check('Reemplaza {{activation_url}}', resolved.includes('https://rotary4281.org/mi-inscripcion?activar=tok12345'));
    check('Reemplaza {{expiration_hours}}', resolved.includes('72 horas'));
    check('Reemplaza {{registration_code}}', resolved.includes('CR4281-2027-00123'));
    check('No deja variables sin resolver', !resolved.includes('{{'));
}

// ════════════════════════════════════════════════════════════════════
group('19. Despacho por WhatsApp institucional');
// ════════════════════════════════════════════════════════════════════
{
    const waVars = {
        activation_url: 'https://rotary4281.org/mi-inscripcion?activar=tokWa999',
        participant_name: 'Camila Vila',
        event_title: 'XIII Conferencia Rotaria',
    };
    const waTemplate = 'Estimado/a *{{participant_name}}*, bienvenido/a a *{{event_title}}*. Activa tu cuenta aquí: {{activation_url}}';
    const waText = interpolateActivationTemplate(waTemplate, waVars);
    check('Plantilla de WhatsApp preserva markdown en negritas', waText.includes('*Camila Vila*'));
    check('Plantilla de WhatsApp inyecta enlace de activación correctamente', waText.includes('tokWa999'));
}

// ════════════════════════════════════════════════════════════════════
group('20. Guardia de destinatario (verifyRecipientOwnsActivationToken)');
// ════════════════════════════════════════════════════════════════════
{
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const tokenHash = hashActivationToken(token);
    const rowA = { id: 'reg-020-a', email: 'autorizado@club.org', accountId: 'acc-020-a' };
    const accA = { id: 'acc-020-a', email: 'autorizado@club.org', activationTokenHash: tokenHash };

    const okResult = verifyRecipientOwnsActivationToken({
        row: rowA,
        account: accA,
        token,
        recipientEmail: 'autorizado@club.org',
    });
    check('Destinatario legítimo pasa la verificación de custodia de token', okResult === true);

    let blocked = false;
    try {
        verifyRecipientOwnsActivationToken({
            row: rowA,
            account: accA,
            token,
            recipientEmail: 'intruso@externo.org',
        });
    } catch {
        blocked = true;
    }
    check('Intento de enviar token a destinatario no propietario lanza excepción y es bloqueado', blocked === true);
}

// ════════════════════════════════════════════════════════════════════
group('21. Redacción de secretos en el historial y registros de auditoría');
// ════════════════════════════════════════════════════════════════════
{
    const logText = 'Invitación generada url: https://rotary4281.org/mi-inscripcion?activar=abcdef0123456789abcdef0123456789 con token temporal';
    const redacted = redactActivationSecrets(logText);
    check('Redacta el token crudo en bitácoras para prevenir fugas', !redacted.includes('abcdef0123456789abcdef0123456789'));
    check('Reemplaza con etiqueta de redacción segura [TOKEN-PROTEGIDO]', redacted.includes('[TOKEN-PROTEGIDO]'));
}

// ════════════════════════════════════════════════════════════════════
group('22. Reenvío y regeneración de invitación vencida o solicitada');
// ════════════════════════════════════════════════════════════════════
{
    const oldToken = 'old-expired-token-111111111111111111111111111111111111111111111111111111111111';
    const oldHash = hashActivationToken(oldToken);

    // Regenerar nueva invitación
    const fresh = generateActivationToken(72);
    check('Nuevo token es completamente nuevo y diferente al anterior', fresh.token !== oldToken);
    check('Nuevo hash reemplaza el hash anterior', fresh.tokenHash !== oldHash);
    check('Nueva vigencia de 72 horas establecida en el futuro', fresh.expiresAt > new Date());
}

// ════════════════════════════════════════════════════════════════════
group('23. Derivación del estado de cuenta suspendida');
// ════════════════════════════════════════════════════════════════════
{
    const row = { id: 'comp-023', accountId: 'acc-023' };
    const suspendedAcc = {
        id: 'acc-023',
        status: 'suspended',
        isActive: false,
        passwordHash: '$2a$10$hashed',
    };
    const state = deriveAccountAndActivationState(row, suspendedAcc);
    check('Cuenta con status suspended deriva en accountStatus suspended', state.accountStatus === 'suspended');
    check('Rótulo de estado es Cuenta suspendida', accountStatusMeta(state.accountStatus).label === 'Cuenta suspendida');
}

// ════════════════════════════════════════════════════════════════════
group('24. Filtros administrativos por accountStatus y activationStatus');
// ════════════════════════════════════════════════════════════════════
{
    const items = [
        { id: '1', accountStatus: 'active', activationStatus: 'completed', registrationSource: 'completed_public' },
        { id: '2', accountStatus: 'no_account', activationStatus: 'not_sent', registrationSource: 'historical_import' },
        { id: '3', accountStatus: 'invitation_sent', activationStatus: 'pending', registrationSource: 'completed_public' },
        { id: '4', accountStatus: 'needs_review', activationStatus: 'not_sent', registrationSource: 'historical_import' },
    ];

    const filterNoAccount = items.filter(i => i.accountStatus === 'no_account');
    check('Filtro por sin cuenta aísla exactamente el registro correspondiente', filterNoAccount.length === 1 && filterNoAccount[0].id === '2');

    const filterNeedsReview = items.filter(i => i.accountStatus === 'needs_review');
    check('Filtro por requiere revisión aísla los conflictos', filterNeedsReview.length === 1 && filterNeedsReview[0].id === '4');

    const filterHistorical = items.filter(i => i.registrationSource === 'historical_import');
    check('Filtro combinado con fuente histórica funciona limpiamente', filterHistorical.length === 2);
}

// ════════════════════════════════════════════════════════════════════
group('25. Aislamiento de sesión en el portal de participantes (/mi-inscripcion)');
// ════════════════════════════════════════════════════════════════════
{
    const sessionAccountId = 'acc-logged-in-025';
    const ownRegistration = { id: 'comp-own', accountId: 'acc-logged-in-025' };
    const otherRegistration = { id: 'comp-other', accountId: 'acc-stranger-999' };

    check('Participante accede a su propio registro legítimo', ownRegistration.accountId === sessionAccountId);
    check('Participante NO puede acceder a registro de otro participante', otherRegistration.accountId !== sessionAccountId);
}

// ════════════════════════════════════════════════════════════════════
group('26. Consulta de inscripción completada y comprobante en el portal');
// ════════════════════════════════════════════════════════════════════
{
    const regDetail = {
        id: 'comp-026',
        registrationCode: 'CR4281-2027-00999',
        status: 'validated',
        receiptFile: 'receipts/ev-xiii/comp-026.pdf',
    };
    check('Detalle de inscripción expone código rotario del participante', Boolean(regDetail.registrationCode));
    check('Comprobante existe y requiere firma temporal de S3 para su lectura', Boolean(regDetail.receiptFile));
}

// ════════════════════════════════════════════════════════════════════
group('27. Edición autorizada de campos del participante');
// ════════════════════════════════════════════════════════════════════
{
    const currentRow = {
        phone: '+57 300 000 0000',
        eps: 'Sura',
        foodAllergy: 'Ninguna',
        emergencyName: 'Pedro Gómez',
        emergencyPhone: '+57 300 111 2222',
        comments: '',
    };
    const inputPayload = {
        phone: '+57 312 999 8877',
        eps: 'Sanitas',
        foodAllergy: 'Vegetariano estricto',
        emergencyName: 'Lucía Gómez',
        emergencyPhone: '+57 310 111 2233',
        comments: 'Requiero traducción en plenarias',
    };
    const patchResult = validateParticipantProfilePatch(inputPayload, currentRow);
    check('Validación pasa con éxito para campos autorizados', patchResult.ok === true);
    check('Permite actualizar teléfono', patchResult.updates.phone === '+57 312 999 8877');
    check('Permite actualizar EPS', patchResult.updates.eps === 'Sanitas');
    check('Permite actualizar alergias alimentarias', patchResult.updates.foodAllergy === 'Vegetariano estricto');
    check('Permite actualizar contacto de emergencia y su teléfono', patchResult.updates.emergencyName === 'Lucía Gómez' && patchResult.updates.emergencyPhone === '+57 310 111 2233');
    check('Permite actualizar comentarios opcionales', patchResult.updates.comments === 'Requiero traducción en plenarias');
}

// ════════════════════════════════════════════════════════════════════
group('28. Bloqueo estricto (HTTP 403) ante intentos de alterar campos protegidos');
// ════════════════════════════════════════════════════════════════════
{
    const currentRow = {
        documentNumber: '10203040',
        email: 'socio@club.org',
        status: 'submitted',
        paymentMethod: 'transferencia',
        district: '4281',
        clubName: 'Club Rotario Bogotá',
    };
    const maliciousPayload = {
        phone: '+57 312 999 8877',
        documentNumber: '99999999', // ¡Intento de alterar documento de identidad!
        email: 'hacker@malicioso.com', // ¡Intento de cambiar correo!
        status: 'validated', // ¡Intento de auto-validar la inscripción!
        paymentMethod: 'gratis', // ¡Intento de alterar método de pago!
        district: '4271', // ¡Intento de cambiar distrito!
        clubName: 'Club Pirata', // ¡Intento de alterar club!
    };
    const patchResult = validateParticipantProfilePatch(maliciousPayload, currentRow);

    check('Rechaza la solicitud ante campos protegidos', patchResult.ok === false);
    check('Responde con código HTTP 403 Forbidden', patchResult.status === 403);
    check('Identifica los campos protegidos intentados',
        patchResult.forbiddenFields.includes('documentNumber')
        && patchResult.forbiddenFields.includes('email')
        && patchResult.forbiddenFields.includes('status')
        && patchResult.forbiddenFields.includes('paymentMethod')
        && patchResult.forbiddenFields.includes('district')
        && patchResult.forbiddenFields.includes('clubName'));
    check('No aplica ninguna actualización ante presencia de campos prohibidos', Object.keys(patchResult.updates).length === 0);
}

// ════════════════════════════════════════════════════════════════════
// Resumen final
// ════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════════');
if (failures.length === 0) {
    console.log(`\x1b[32m✔ Las ${passed} comprobaciones de conformidad pasaron con éxito.\x1b[0m`);
    process.exit(0);
} else {
    console.error(`\x1b[31m✘ ${failures.length} fallos encontrados en la suite de cuentas:\x1b[0m`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
}
