// ════════════════════════════════════════════════════════════════════
// Inscripciones completadas — flujo público — v4.945.0
//
// El formulario de cuatro pasos que centraliza a quienes YA se inscribieron y
// pagaron por fuera de la página (transferencia bancaria u otro canal) y sólo
// les falta entregar su información. Vive en una URL propia por evento
// (`/​{slug}`, p. ej. /inscripcion-conferencia-distrital-villavicencio-2027) y
// TODO lo que entra queda atado al `eventId` de su evento: nada cae en una
// tabla genérica desconectada del módulo de Eventos.
//
// Reglas:
//
// - **Enviar NO confirma nada.** El registro nace «Pendiente de validación»
//   (`submitted`): es el Equipo de Registro quien valida el comprobante y
//   decide. Acá no hay cobro, no hay Stripe y no se toca ningún cupo.
// - **El comprobante sube directo a S3** con URL prefirmada (el cuerpo de una
//   función se corta en ~4,5 MB y el archivo admite 10). Al enviar, el
//   servidor comprueba el objeto REAL: existencia, prefijo del evento y peso.
// - **Los duplicados se MARCAN, nunca se borran.** Si el mismo documento o
//   correo ya tiene una inscripción —normal o completada— en este evento, el
//   registro se crea igual, relacionado y con la alerta para el panel.
// ════════════════════════════════════════════════════════════════════
import EmailService from '../services/EmailService.js';
import { ensureEventRegistrationSchema } from '../lib/ensureEventRegistrationSchema.js';
import { rotaryCatalogFor } from '../lib/eventRegistrationSpec.js';
import { clean, recordHistory, recordMessage } from '../lib/eventRegistrationStore.js';
import {
    validateAccessPassword, publicPaymentGuide,
    buildCompletedSchema, validateCompletedAnswers,
    completedCodePrefixFor, buildDuplicateFlags, completedStatusMeta,
    paymentMethodLabel,
    RECEIPT_MAX_BYTES, RECEIPT_EXTENSIONS,
    buildCompletedEmail,
} from '../lib/completedRegistrationSpec.js';
import {
    findCompletedFormBySlug, findDuplicates, insertCompleted,
    assignCompletedCode, mapCompleted, findCompleted, findBySubmissionKey,
    eventBrandingFor, hasSentMessage,
} from '../lib/completedRegistrationStore.js';
import { presignReceiptUpload, receiptKeyBelongs, headReceipt } from '../lib/completedReceipts.js';
import { checkLogin, recordFailure, recordSuccess } from '../lib/loginThrottle.js';
import {
    identityFromRequest, prefillForIdentity, resolveParticipantAccess,
    issueAttendeeSession, sendVerificationEmail, auditLogin, REALM_LABELS,
} from './eventAttendeeController.js';

console.log('[completedRegistrationController] v4.1268.0 cargado — formulario público de inscripciones completadas con la cuenta del participante, la guía de pago por COLROTARIOS/AvalPay configurable por evento, envío idempotente y la confirmación con la plantilla del evento.');

// El remitente institucional de la plataforma — el MISMO transporte de todo el
// correo transaccional del sitio (EmailService → Resend/SMTP). Exportado para
// que el panel lo MUESTRE en vez de que el administrador lo adivine.
export const PLATFORM_SENDER = '"Registro de eventos" <noreply@clubplatform.org>';

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Resuelve el formulario del slug o contesta 404. `null` si ya respondió. */
const requireForm = async (req, res, { mustBeEnabled = true } = {}) => {
    // El ensure no es fatal acá (v4.944): la resolución del slug sólo lee
    // tablas que existen desde v4.648, y un tropiezo del arranque en frío no
    // puede dejar el formulario público diciendo «no disponible». El envío
    // sí necesita la tabla nueva — si faltara, su propio INSERT lo dice con
    // el motivo concreto en `detail`.
    try { await ensureEventRegistrationSchema(); }
    catch (error) { console.warn('[completed-registrations] ensure en requireForm:', error?.message); }
    const found = await findCompletedFormBySlug(req.params.slug);
    if (!found) {
        res.status(404).json({ error: 'Este formulario no existe o ya no está disponible.' });
        return null;
    }
    if (mustBeEnabled && !found.config.enabled) {
        res.status(409).json({ error: 'Este formulario no está recibiendo información en este momento.' });
        return null;
    }
    return found;
};

// ── Configuración pública ────────────────────────────────────────────

// GET /api/event-registrations/public/completed/:slug
export const getPublicCompletedConfig = async (req, res) => {
    try {
        const found = await requireForm(req, res, { mustBeEnabled: false });
        if (!found) return;
        const { event, edition, config } = found;

        res.json({
            enabled: config.enabled,
            event: {
                id: event.id,
                slug: event.slug,
                title: event.title,
                startDate: event.startDate,
                endDate: event.endDate,
                location: event.location,
            },
            form: {
                title: config.title || `Completa tu inscripción — ${event.title}`,
                intro: config.intro,
                headerImageUrl: config.headerImageUrl,
                rolePeriod: config.rolePeriod,
                steps: buildCompletedSchema(config).steps,
            },
            receipt: { maxBytes: RECEIPT_MAX_BYTES, extensions: RECEIPT_EXTENSIONS },
            // El mismo catálogo curado distrito → clubes de la inscripción
            // normal y de la Feria (v4.707): una sola fuente de verdad.
            catalogs: { districts: rotaryCatalogFor(edition.settings) },
            successMessage: config.successMessage,
            // v4.1267 — La cuenta del participante. `identity` es la sesión que
            // trae el navegador, verificada aquí (firma + audiencia); el
            // formulario sólo la pinta. `prefill` son SUS datos, para no
            // pedírselos dos veces, y sólo rellena campos vacíos.
            access: { mode: config.accountMode },
            // v4.1268 — La guía del paso 4 para pagar en el proveedor externo.
            // `null` si está apagada o sin enlace https: no se pinta.
            paymentGuide: publicPaymentGuide(config.paymentGuide, event.title),
            ...(await identityForForm(req, config)),
        });
    } catch (error) {
        console.error('[completed-registrations] getPublicCompletedConfig:', error);
        // El motivo viaja TEXTUAL en `detail` (v4.944, patrón del 502 del proxy
        // de imágenes, v4.912): «no se pudo cargar» a secas obliga a
        // diagnosticar a ciegas — y este 500 se reportó exactamente así.
        res.status(500).json({ error: 'No se pudo cargar el formulario', detail: error?.message });
    }
};

// ── La cuenta del participante (v4.1267) ─────────────────────────────

/** Campos del formulario que se pueden precargar desde la cuenta. */
const PREFILL_KEYS = ['firstName', 'lastName', 'documentNumber', 'email', 'phone', 'district', 'clubName'];

/** La sesión del navegador, resuelta en el servidor, y sus datos de precarga. */
const identityForForm = async (req, config) => {
    if (config.accountMode === 'off') return { identity: null, prefill: {} };
    const identity = await identityFromRequest(req).catch(() => null);
    if (!identity?.email) return { identity: null, prefill: {} };
    const all = await prefillForIdentity(identity).catch(() => ({}));
    const prefill = Object.fromEntries(PREFILL_KEYS.filter(k => all[k]).map(k => [k, all[k]]));
    return {
        identity: {
            realm: identity.realm,
            email: String(identity.email).toLowerCase(),
            name: identity.name || null,
            roleLabel: REALM_LABELS[identity.realm] || null,
        },
        prefill,
    };
};

const clientIp = (req) => String((req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    || req?.socket?.remoteAddress || '').slice(0, 60);

// Freno POR IP de la comprobación del paso 1, además del de correo + IP del
// ingreso (`loginThrottle`). Este cuenta TODAS las consultas, no sólo las
// fallidas: es lo que hace caro recorrer una lista de correos para saber
// cuáles tienen cuenta. Es un freno en memoria, como el del ingreso: por
// instancia, no una garantía.
const ACCESS_CHECKS_PER_IP = 30;
const accessChecks = new Map();
const accessCheckAllowed = (ip, now = Date.now()) => {
    for (const [k, v] of accessChecks) if (now - v.first > 15 * 60 * 1000) accessChecks.delete(k);
    if (accessChecks.size > 5000) accessChecks.clear();
    const entry = accessChecks.get(ip);
    if (!entry) { accessChecks.set(ip, { first: now, count: 1 }); return true; }
    entry.count += 1;
    return entry.count <= ACCESS_CHECKS_PER_IP;
};

/** El mensaje del escenario B, tal cual lo pidió el Distrito. */
const ACCOUNT_EXISTS_MESSAGE = 'Este correo ya está asociado a una cuenta de Rotary Distrito 4281. Inicia sesión para continuar con tu inscripción.';

/**
 * POST /public/completed/:slug/access — el paso 1 comprueba la cuenta ANTES
 * de pedir los otros tres pasos.
 *
 * ⚠️ NO es un «¿existe este correo?»: sin contraseña no contesta nada. Con
 * contraseña se comporta como un ingreso —si la cuenta existe y la clave
 * coincide, abre la sesión— y cuenta contra el MISMO freno del ingreso; además,
 * cada IP tiene un tope de consultas. Distinguir «nuevo» de «existe» después
 * de escribir una contraseña es lo mismo que hace cualquier registro al
 * enviarse; lo que no se ofrece es una consulta masiva y barata.
 */
export const checkAccess = async (req, res) => {
    try {
        const found = await requireForm(req, res);
        if (!found) return;
        if (found.config.accountMode === 'off') return res.json({ status: 'off' });

        const email = clean(req.body?.email, 200).toLowerCase();
        const password = String(req.body?.password || '');
        const ip = clientIp(req);
        if (!email || !password) return res.status(400).json({ error: 'Escribe tu correo y la contraseña.' });

        const freno = checkLogin(email, ip);
        if (!freno.allowed || !accessCheckAllowed(ip)) {
            return res.status(429).json({
                error: `Demasiados intentos. Inténtalo de nuevo en ${freno.retryInMinutes || 15} minutos.`,
            });
        }

        const result = await resolveParticipantAccess({ email, password, create: false });
        if (result.outcome === 'password') {
            recordSuccess(email, ip);
            await auditLogin(req, { accountId: result.account.id, email, outcome: 'success', detail: 'completar inscripción' });
            // Escribió la clave correcta de su cuenta: es un ingreso.
            return res.json({ status: 'signed_in', session: await issueAttendeeSession(result.account) });
        }
        if (result.outcome === 'exists') {
            recordFailure(email, ip);
            await auditLogin(req, { email, outcome: 'access_exists', detail: 'completar inscripción' });
            return res.json({ status: 'exists', recover: result.recover === true, message: ACCOUNT_EXISTS_MESSAGE });
        }
        if (result.outcome === 'weak') return res.json({ status: 'weak' });
        if (result.outcome === 'invalid_email') return res.status(400).json({ error: 'Revisa el correo electrónico.' });
        return res.json({ status: 'new' });
    } catch (error) {
        console.error('[completed-registrations] checkAccess:', error);
        res.status(500).json({ error: 'No pudimos comprobar tu cuenta. Intenta de nuevo.', detail: error?.message });
    }
};

// ── Subida del comprobante ───────────────────────────────────────────

// POST /api/event-registrations/public/completed/:slug/receipt-url
export const createReceiptUploadUrl = async (req, res) => {
    try {
        const found = await requireForm(req, res);
        if (!found) return;

        const { filename, contentType, size } = req.body || {};
        const result = await presignReceiptUpload({
            eventId: found.event.id,
            contentType: clean(contentType, 100),
            filename: clean(filename, 200),
            size: Number(size),
        });
        if (!result.ok) return res.status(422).json({ error: result.errores[0], errores: result.errores });
        res.json({ key: result.key, uploadUrl: result.uploadUrl, contentType: result.contentType });
    } catch (error) {
        console.error('[completed-registrations] createReceiptUploadUrl:', error);
        res.status(500).json({ error: 'No se pudo preparar la subida del comprobante', detail: error?.message });
    }
};

// ── Correos ──────────────────────────────────────────────────────────

/**
 * Correo de confirmación al participante (evento `FORM_COMPLETED`): confirma
 * que el FORMULARIO quedó registrado — a propósito NO afirma que el pago esté
 * validado; esa sería otra notificación con otro disparador. Reglas:
 *
 * - **Mejor esfuerzo, DESACOPLADO del registro**: un correo que no sale no
 *   tumba una inscripción que ya está guardada. Queda `failed` con su motivo
 *   textual en `EventRegistrationMessage` y el panel ofrece «Reenviar».
 * - **⚠️ `sendPlatformEmail` NUNCA lanza**: contesta `{ success: false }`. La
 *   v4.943 esperaba una excepción y registraba como «enviado» un correo que el
 *   proveedor rechazó — el fallo quedaba invisible. Se comprueba `success`.
 * - **Idempotencia del envío AUTOMÁTICO** (`auto: true`): si ya hay una
 *   confirmación `sent` para este registro, no se manda otra. El reenvío
 *   manual la saltea — quien pulsa «Reenviar» pide exactamente eso.
 * - La plantilla es la del EVENTO (`buildCompletedEmail`): cabecera con la
 *   imagen CONFIGURADA del formulario, cuerpo editable con variables, el
 *   código siempre en su bloque y el pie con la marca real del organizador.
 */
export const sendCompletedConfirmation = async (row, event, config, { actorId = null, auto = false } = {}) => {
    const registration = mapCompleted(row);
    if (auto) {
        if (config?.notifyEnabled === false) return { sent: false, skipped: 'disabled' };
        if (await hasSentMessage(registration.id, 'completed_confirmation')) {
            return { sent: false, skipped: 'already_sent' };
        }
    }
    const branding = await eventBrandingFor(event.clubId);
    const { subject, html, text } = buildCompletedEmail({ config, event, registration, branding });
    try {
        const salida = await EmailService.sendPlatformEmail({
            to: registration.email, from: PLATFORM_SENDER, subject, html, text,
        });
        if (salida && salida.success === false) {
            throw new Error(salida.error || 'el proveedor de correo rechazó el envío');
        }
        await recordMessage({
            registrationId: registration.id, eventId: event.id, channel: 'email',
            template: 'completed_confirmation', recipient: registration.email,
            subject, body: html, actorId, providerId: salida?.messageId || null,
        });
        return { sent: true, messageId: salida?.messageId || null };
    } catch (error) {
        await recordMessage({
            registrationId: registration.id, eventId: event.id, channel: 'email',
            template: 'completed_confirmation', recipient: registration.email,
            subject, status: 'failed', error: error?.message, actorId,
        });
        return { sent: false, error: error?.message };
    }
};

const notifyAdmins = async (row, event, edition) => {
    const emails = (edition.settings?.adminEmails || []).filter(Boolean).slice(0, 20);
    if (!emails.length) return;
    const registration = mapCompleted(row);
    const subject = `Nueva inscripción completada — ${event.title}`;
    const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#0f172a">
    <p><strong>${escapeHtml(`${registration.firstName || ''} ${registration.lastName || ''}`.trim())}</strong>
       envió el formulario de inscripción completada (${escapeHtml(registration.registrationCode || '')}).</p>
    <p>Método de pago: ${escapeHtml(paymentMethodLabel(registration.paymentMethod))}.
       El registro queda <strong>pendiente de validación</strong> en la pestaña
       «Inscripciones completadas» del evento.</p>
</div>`;
    try {
        const salida = await EmailService.sendPlatformEmail({ to: emails.join(', '), from: PLATFORM_SENDER, subject, html });
        if (salida && salida.success === false) {
            console.warn('[completed-registrations] aviso al equipo no salió:', salida.error);
        }
    } catch (error) {
        console.warn('[completed-registrations] aviso al equipo no salió:', error?.message);
    }
};

// ── Envío del formulario ─────────────────────────────────────────────

/**
 * Lo que vuelve al navegador. Con cuenta, la sesión del asistente ya abierta
 * (v4.710): «Ir a Mis eventos» entra sin pedir la contraseña otra vez. Un
 * envío repetido NO abre sesión: la clave del formulario no prueba identidad.
 */
const submitResponse = async (row, config, { account = null, repeated = false } = {}) => ({
    id: row.id,
    registrationCode: row.registrationCode,
    status: row.status,
    statusLabel: completedStatusMeta(row.status).label,
    email: row.email,
    firstName: row.firstName,
    successMessage: config.successMessage,
    repeated,
    hasAccount: Boolean(row.accountId),
    ...(account ? { session: await issueAttendeeSession(account) } : {}),
});

// POST /api/event-registrations/public/completed/:slug
export const submitCompleted = async (req, res) => {
    try {
        const found = await requireForm(req, res);
        if (!found) return;
        const { event, edition, config } = found;

        const answers = (req.body?.answers && typeof req.body.answers === 'object') ? req.body.answers : {};
        const catalogs = { districts: rotaryCatalogFor(edition.settings) };

        // v4.1267 — Idempotencia: el MISMO formulario enviado dos veces (doble
        // clic, recarga, red que reintenta) devuelve el registro que ya existe.
        const submissionKey = clean(req.body?.submissionKey, 80);
        const previous = await findBySubmissionKey(event.id, submissionKey);
        if (previous) return res.status(200).json(await submitResponse(previous, config, { repeated: true }));

        // El servidor valida SIEMPRE, aunque el navegador ya lo haya hecho.
        const verdict = validateCompletedAnswers(config, answers, catalogs);
        if (!verdict.ok) {
            return res.status(422).json({ error: 'Revisa los campos marcados.', fieldErrors: verdict.errors });
        }

        // ── El comprobante, contra el objeto REAL ────────────────────
        const receipt = req.body?.receipt || {};
        const receiptKey = clean(receipt.key, 400);
        if (!receiptKey) {
            return res.status(422).json({
                error: 'Falta el comprobante de pago.',
                fieldErrors: { receipt: 'Sube el comprobante de pago del aporte.' },
            });
        }
        if (!receiptKeyBelongs(receiptKey, event.id)) {
            return res.status(422).json({ error: 'El comprobante no corresponde a este evento. Vuelve a adjuntarlo.' });
        }
        const head = await headReceipt(receiptKey);
        if (!head.ok) {
            return res.status(422).json({ error: head.error, fieldErrors: { receipt: head.error } });
        }

        // ── La cuenta, ANTES de escribir nada (v4.1267) ──────────────
        //
        // Mismo orden que el registro en línea (v4.655): si el correo ya tiene
        // cuenta y no se entró con ella, el registro no llega a crearse a
        // medias. Crear la cuenta NO confirma la inscripción.
        let account = null;
        let accountOutcome = 'none';
        if (config.accountMode !== 'off') {
            const password = String(req.body?.password || '');
            const passwordConfirm = String(req.body?.passwordConfirm || '');
            const identity = await identityFromRequest(req).catch(() => null);
            const sessionMatches = identity?.email
                && String(identity.email).toLowerCase() === String(answers.email || '').trim().toLowerCase();

            if (!sessionMatches) {
                const passErrors = validateAccessPassword(password, passwordConfirm,
                    { allowEmpty: config.accountMode === 'optional' });
                if (Object.keys(passErrors).length) {
                    return res.status(422).json({
                        error: config.accountMode === 'required' && !password
                            ? 'Crea tu acceso al evento para completar la inscripción.'
                            : 'Revisa la contraseña de tu acceso.',
                        fieldErrors: passErrors,
                    });
                }
            }

            const resolved = await resolveParticipantAccess({
                email: answers.email,
                password: sessionMatches ? '' : password,
                identity: sessionMatches ? identity : null,
                profile: { firstName: answers.firstName, lastName: answers.lastName, phone: answers.phone },
            });
            if (resolved.outcome === 'exists') {
                return res.status(409).json({
                    error: ACCOUNT_EXISTS_MESSAGE,
                    accountExists: true,
                    recover: resolved.recover === true,
                    fieldErrors: { password: 'Este correo ya tiene una cuenta: inicia sesión o recupera tu contraseña.' },
                });
            }
            if (resolved.outcome === 'weak') {
                return res.status(422).json({ error: 'Revisa la contraseña de tu acceso.', fieldErrors: validateAccessPassword(password, passwordConfirm) });
            }
            if (resolved.account) {
                account = resolved.account;
                accountOutcome = resolved.outcome;
            } else if (config.accountMode === 'required') {
                return res.status(422).json({
                    error: 'Crea tu acceso al evento para completar la inscripción.',
                    fieldErrors: validateAccessPassword('', ''),
                });
            }
        }

        // ── Duplicados: se marcan y se relacionan, no se bloquea ─────
        const subject = { email: answers.email, documentNumber: answers.documentNumber };
        const duplicates = await findDuplicates(event.id, subject);
        const flags = buildDuplicateFlags(duplicates, subject);
        const linkedOnline = flags.duplicates.find(d => d.source === 'online_registration');

        // La foto completa de lo respondido viaja en `answers`, además de las
        // columnas promovidas por las que el panel filtra.
        const row = await insertCompleted({
            eventId: event.id,
            clubId: event.clubId || null,
            firstName: answers.firstName,
            lastName: answers.lastName,
            documentNumber: answers.documentNumber,
            email: answers.email,
            phone: answers.phone,
            district: answers.district,
            clubName: answers.clubName,
            membershipType: answers.membershipType,
            clubRole: answers.clubRole,
            clubRoleOther: answers.clubRole === 'otro_cargo' ? answers.clubRoleOther : '',
            guestType: answers.membershipType === 'invitado' ? answers.guestType : '',
            eps: answers.eps,
            foodAllergy: answers.foodAllergy,
            emergencyName: answers.emergencyName,
            emergencyPhone: answers.emergencyPhone,
            paymentMethod: answers.paymentMethod,
            receiptKey,
            receiptName: receipt.name || '',
            receiptMime: head.mime || receipt.contentType || '',
            receiptBytes: head.bytes,
            comments: answers.comments,
            answers,
            flags,
            linkedRegistrationId: linkedOnline?.id || null,
            accountId: account?.id || null,
            submissionKey,
        }).catch(async (error) => {
            // Dos envíos simultáneos con la misma clave: el índice único deja
            // pasar uno; el otro devuelve ese mismo registro.
            if (error?.code === '23505' && String(error?.message || '').includes('submission_uniq')) {
                const winner = await findBySubmissionKey(event.id, submissionKey);
                if (winner) return { ...winner, __repeated: true };
            }
            throw error;
        });
        if (row.__repeated) {
            return res.status(200).json(await submitResponse(row, config, { repeated: true }));
        }

        const code = await assignCompletedCode(row.id, completedCodePrefixFor(config, edition));
        const saved = await findCompleted(row.id);

        await recordHistory({
            registrationId: row.id, eventId: event.id, type: 'completed_submitted',
            toStatus: 'submitted',
            comment: 'Formulario público de inscripción completada enviado.',
            payload: { registrationSource: saved.registrationSource, paymentMethod: saved.paymentMethod },
        });
        if (account) {
            await recordHistory({
                registrationId: row.id, eventId: event.id, type: 'account_linked',
                comment: {
                    created: 'El participante creó su acceso al evento al enviar el formulario.',
                    password: 'El participante vinculó el registro a su cuenta existente.',
                    session: 'El participante envió el formulario con su sesión iniciada.',
                }[accountOutcome] || 'Inscripción vinculada a la cuenta del participante.',
                payload: { via: accountOutcome },
            });
            if (accountOutcome === 'created') {
                await sendVerificationEmail(account, req.headers.origin).catch(() => { });
            }
        }
        if (flags.hasDuplicates) {
            await recordHistory({
                registrationId: row.id, eventId: event.id, type: 'duplicate_flagged',
                comment: `Posible duplicado: coincide por ${flags.duplicates.map(d => d.match).join(', ')} con ${flags.duplicates.length} registro(s) del evento.`,
                payload: flags,
            });
        }

        await sendCompletedConfirmation(saved, event, config, { auto: true });
        await notifyAdmins(saved, event, edition);

        // La respuesta pública no lleva las alertas de duplicado: son trabajo
        // del panel, no información del visitante.
        res.status(201).json(await submitResponse({ ...saved, registrationCode: code || saved.registrationCode }, config, { account }));
    } catch (error) {
        console.error('[completed-registrations] submitCompleted:', error);
        res.status(500).json({ error: 'No se pudo guardar tu información. Intenta de nuevo.', detail: error?.message });
    }
};

export default {
    getPublicCompletedConfig, createReceiptUploadUrl, submitCompleted, checkAccess,
    sendCompletedConfirmation,
};
