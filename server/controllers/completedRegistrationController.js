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
    buildCompletedSchema, validateCompletedAnswers,
    completedCodePrefixFor, buildDuplicateFlags, completedStatusMeta,
    paymentMethodLabel,
    RECEIPT_MAX_BYTES, RECEIPT_EXTENSIONS,
    buildCompletedEmail,
} from '../lib/completedRegistrationSpec.js';
import {
    findCompletedFormBySlug, findDuplicates, insertCompleted,
    assignCompletedCode, mapCompleted, findCompleted,
    eventBrandingFor, hasSentMessage,
} from '../lib/completedRegistrationStore.js';
import { presignReceiptUpload, receiptKeyBelongs, headReceipt } from '../lib/completedReceipts.js';

console.log('[completedRegistrationController] v4.945.0 cargado — formulario público de inscripciones completadas; la confirmación sale con la plantilla del evento, comprueba el éxito REAL del proveedor y es idempotente.');

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
        });
    } catch (error) {
        console.error('[completed-registrations] getPublicCompletedConfig:', error);
        // El motivo viaja TEXTUAL en `detail` (v4.944, patrón del 502 del proxy
        // de imágenes, v4.912): «no se pudo cargar» a secas obliga a
        // diagnosticar a ciegas — y este 500 se reportó exactamente así.
        res.status(500).json({ error: 'No se pudo cargar el formulario', detail: error?.message });
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

// POST /api/event-registrations/public/completed/:slug
export const submitCompleted = async (req, res) => {
    try {
        const found = await requireForm(req, res);
        if (!found) return;
        const { event, edition, config } = found;

        const answers = (req.body?.answers && typeof req.body.answers === 'object') ? req.body.answers : {};
        const catalogs = { districts: rotaryCatalogFor(edition.settings) };

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
        });

        const code = await assignCompletedCode(row.id, completedCodePrefixFor(config, edition));
        const saved = await findCompleted(row.id);

        await recordHistory({
            registrationId: row.id, eventId: event.id, type: 'completed_submitted',
            toStatus: 'submitted',
            comment: 'Formulario público de inscripción completada enviado.',
            payload: { registrationSource: saved.registrationSource, paymentMethod: saved.paymentMethod },
        });
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
        res.status(201).json({
            id: saved.id,
            registrationCode: code || saved.registrationCode,
            status: saved.status,
            statusLabel: completedStatusMeta(saved.status).label,
            email: saved.email,
            firstName: saved.firstName,
            successMessage: config.successMessage,
        });
    } catch (error) {
        console.error('[completed-registrations] submitCompleted:', error);
        res.status(500).json({ error: 'No se pudo guardar tu información. Intenta de nuevo.', detail: error?.message });
    }
};

export default {
    getPublicCompletedConfig, createReceiptUploadUrl, submitCompleted,
    sendCompletedConfirmation,
};
