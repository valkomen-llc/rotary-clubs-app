// EL DESEMBOLSO: registrar el traslado efectivo del dinero al beneficiario,
// guardar su comprobante y avisarle.
//
// v4.885 — La mitad del ciclo que la Bóveda no tenía. «Disponible para retiro»
// contesta «¿se puede usar este dinero?»; nadie contestaba «¿se trasladó?». El
// traslado ocurría fuera de la plataforma —una transferencia desde el banco— y
// no dejaba rastro en ninguna parte, así que la única forma de saber si un
// aporte ya se había girado era preguntárselo a alguien.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ UNA OPERACIÓN FINANCIERA CONFIRMADA NO SE BORRA.
// ═════════════════════════════════════════════════════════════════════
//
// No hay `DELETE` en este archivo y no debe haberlo. Corregir un desembolso es
// REVERSARLO: la fila se queda, se marca `reversado`, se anota quién y por qué,
// y deja de contar para el saldo. Un movimiento que desaparece sin rastro es
// exactamente lo que un libro existe para impedir — la misma regla que el libro
// mayor (v4.847) y que `ReelCopy` con sus versiones.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ EL COMPROBANTE NO SE SIRVE DESDE UNA DIRECCIÓN PÚBLICA.
// ═════════════════════════════════════════════════════════════════════
//
// Se guarda la CLAVE de S3, no una URL. El enlace se firma al pedirlo, caduca,
// y sólo lo obtiene quien tiene rol administrativo del sitio dueño del aporte.
// Un extracto bancario alojado en una dirección adivinable es una filtración
// esperando a que alguien la encuentre — y a diferencia de una foto de la
// Biblioteca, acá el contenido es un documento financiero con nombres y
// números de cuenta.

import crypto from 'crypto';
import db from './db.js';
import EmailService from '../services/EmailService.js';
import { ensureDisbursementSchema } from './ensureDisbursementSchema.js';
import { normalizeCurrency, formatMoney } from './money.js';
import { recordEvent, recordFact } from './paymentLifecycle.js';
import {
    disbursementBalance, stateFromDisbursements, validateDisbursement,
    disbursementShape, receiptExtension, checkReceipt, DISBURSEMENT_METHODS,
} from './walletLifecycle.js';
import { renderTemplate, defaultTemplateFor } from './notificationTemplate.js';
import { resolveNotificationPlan } from './notificationSender.js';
import { resolveSenderPlan } from './notificationSpec.js';
import { verifiedDomains } from './senderDomains.js';
import { claimDelivery, markSent, markFailed } from './notificationLog.js';

const nuevoId = () => crypto.randomUUID();
const listo = async () => !!(await ensureDisbursementSchema())?.ok;

const metodoLabel = (id) => DISBURSEMENT_METHODS.find(m => m.id === id)?.label || id;

/* ─── LEER ───────────────────────────────────────────────────────────
 *
 * Degradan a vacío. Que falte la tabla no puede impedir ver el dinero.
 */

export const listDisbursements = async (paymentId) => {
    try {
        if (!paymentId || !(await listo())) return [];
        const { rows } = await db.query(
            `SELECT * FROM "Disbursement" WHERE "paymentId" = $1 ORDER BY "disbursedAt" ASC`,
            [paymentId]
        );
        return rows.map(publico);
    } catch (e) {
        console.warn('[DISB] listDisbursements falló:', e?.message);
        return [];
    }
};

/** Los desembolsos de VARIOS aportes en un solo viaje: con una consulta por
 *  aporte serían decenas por pantalla (la lección de `listDeliveriesFor`). */
export const listDisbursementsFor = async (paymentIds = []) => {
    try {
        const ids = (paymentIds || []).filter(Boolean);
        if (!ids.length || !(await listo())) return {};
        const { rows } = await db.query(
            `SELECT * FROM "Disbursement" WHERE "paymentId" = ANY($1::text[]) ORDER BY "disbursedAt" ASC`,
            [ids]
        );
        const salida = {};
        for (const r of rows) (salida[r.paymentId] ||= []).push(publico(r));
        return salida;
    } catch (e) {
        console.warn('[DISB] listDisbursementsFor falló:', e?.message);
        return {};
    }
};

/**
 * La forma que sale hacia la pantalla.
 *
 * ⚠️ LA CLAVE DE S3 NO VIAJA AL NAVEGADOR. Se manda `hasReceipt` y el nombre
 * del archivo; el enlace firmado se pide aparte y con permiso. Si la clave
 * viajara, bastaría abrir la consola para componer la URL del bucket.
 */
const publico = (r) => ({
    id: r.id,
    paymentId: r.paymentId,
    amount: Number(r.amount),
    currency: normalizeCurrency(r.currency),
    disbursedAt: r.disbursedAt,
    beneficiary: r.beneficiary,
    method: r.method,
    methodLabel: metodoLabel(r.method),
    reference: r.reference,
    notes: r.notes,
    status: r.status,
    reversedAt: r.reversedAt,
    reversedReason: r.reversedReason,
    hasReceipt: !!r.receiptKey,
    receiptName: r.receiptName,
    receiptMime: r.receiptMime,
    notifyEmail: r.notifyEmail,
    notifyState: r.notifyState,
    notifyAt: r.notifyAt,
    notifyError: r.notifyError,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
});

/**
 * v4.886 — LO DESEMBOLSADO DE UN SITIO, POR MONEDA.
 *
 * ⚠️ SE AGRUPA POR MONEDA Y NUNCA SE SUMA ENTRE ELLAS. Es la regla que gobierna
 * todo este módulo desde v4.841 —de ahí salió el «$47.507,75» que eran dólares
 * más pesos— y acá pesa igual: el indicador de la Bóveda se pinta al lado del
 * de los aportes, que ya está separado por moneda.
 *
 * Los REVERSADOS no cuentan: un desembolso corregido no trasladó nada.
 *
 * Se agrega EN LA BASE (`GROUP BY currency`) y no trayendo las filas para
 * sumarlas fuera: con un club grande serían cientos de filas por visita para
 * calcular dos números. Es el criterio de `getCentralOverview` (v4.853).
 */
export const disbursedTotals = async (clubId) => {
    try {
        if (!clubId || !(await listo())) return {};
        const { rows } = await db.query(
            `SELECT currency,
                    COALESCE(SUM(amount), 0)::float8 AS total,
                    COUNT(*)::int AS cuantos,
                    MAX("disbursedAt") AS ultimo
               FROM "Disbursement"
              WHERE "clubId" = $1 AND status = 'confirmado'
              GROUP BY currency`,
            [clubId]
        );
        const salida = {};
        for (const r of rows) {
            salida[normalizeCurrency(r.currency)] = {
                total: Number(r.total) || 0,
                cuantos: r.cuantos,
                ultimo: r.ultimo,
            };
        }
        return salida;
    } catch (e) {
        // Degrada a vacío: que falte el indicador no puede impedir ver el
        // dinero. La tarjeta simplemente se pinta en cero y lo dice.
        console.warn('[DISB] disbursedTotals falló:', e?.message);
        return {};
    }
};

/** El saldo de un aporte: cuánto se desembolsó, cuánto falta, si está completo. */
export const balanceFor = async (payment) => {
    const desembolsos = await listDisbursements(payment.id);
    return disbursementBalance({
        net: Number(payment.netAmount) || 0,
        disbursements: desembolsos,
        currency: payment.currency,
    });
};

/* ─── EL COMPROBANTE ─────────────────────────────────────────────────*/

let _s3 = null;
const getS3 = async () => {
    if (!_s3) {
        const [awsMod, presignerMod] = await Promise.all([
            import('@aws-sdk/client-s3'),
            import('@aws-sdk/s3-request-presigner'),
        ]);
        const aws = awsMod.default || awsMod;
        _s3 = {
            client: new aws.S3Client({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
                },
                maxAttempts: 2,
            }),
            PutObjectCommand: aws.PutObjectCommand,
            GetObjectCommand: aws.GetObjectCommand,
            getSignedUrl: presignerMod.getSignedUrl,
        };
    }
    return _s3;
};

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

/**
 * Sube el comprobante y devuelve su clave.
 *
 * El prefijo `private/disbursements/` está aparte del resto de la Biblioteca a
 * propósito: permite ponerle una política de bucket o una regla de ciclo de
 * vida propia sin tocar las imágenes de los sitios. Es la misma separación que
 * `public-tmp/` estrenó para las fotos anónimas del portal de plantillas.
 *
 * ⚠️ SIN `ACL` PÚBLICA y con `CacheControl: no-store`. Lo que se sube acá es un
 * documento financiero; que un intermediario lo cachee es media filtración.
 */
export const uploadReceipt = async ({ clubId, paymentId, buffer, mime, filename }) => {
    const juicio = checkReceipt({ mime, bytes: buffer?.length });
    if (!juicio.ok) return { ok: false, errores: juicio.errores };

    try {
        const { client, PutObjectCommand } = await getS3();
        const ext = receiptExtension(mime);
        const key = `private/disbursements/${clubId}/${paymentId}/${nuevoId()}.${ext}`;
        await client.send(new PutObjectCommand({
            Bucket: bucketName(),
            Key: key,
            Body: buffer,
            ContentType: mime,
            CacheControl: 'no-store',
        }));
        return {
            ok: true,
            key,
            name: String(filename || `comprobante.${ext}`).slice(0, 200),
            mime,
            bytes: buffer.length,
        };
    } catch (e) {
        console.error('[DISB] no pude subir el comprobante:', e?.message);
        return { ok: false, errores: [`No se pudo guardar el comprobante: ${e?.message || 'error de almacenamiento'}`] };
    }
};

/**
 * Un enlace de lectura FIRMADO y con caducidad.
 *
 * Cinco minutos: lo suficiente para abrirlo o descargarlo, poco para que el
 * enlace sobreviva a un reenvío por chat. Quien lo necesite otra vez lo vuelve
 * a pedir, y esa petición vuelve a pasar por el control de permisos.
 */
export const signedReceiptUrl = async (key, { seconds = 300 } = {}) => {
    try {
        if (!key) return null;
        const { client, GetObjectCommand, getSignedUrl } = await getS3();
        return await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: bucketName(), Key: key }),
            { expiresIn: seconds }
        );
    } catch (e) {
        console.error('[DISB] no pude firmar el comprobante:', e?.message);
        return null;
    }
};

/** La clave de S3 de un desembolso, para el endpoint que firma. Consulta
 *  acotada por club: para quien pregunta por uno ajeno, no existe. */
export const receiptKeyOf = async (disbursementId, clubId) => {
    try {
        if (!(await listo())) return null;
        const { rows } = await db.query(
            `SELECT "receiptKey", "receiptMime", "receiptName"
               FROM "Disbursement" WHERE id = $1 AND "clubId" = $2 LIMIT 1`,
            [disbursementId, clubId]
        );
        return rows[0] || null;
    } catch (e) {
        console.warn('[DISB] receiptKeyOf falló:', e?.message);
        return null;
    }
};

/* ─── REGISTRAR ──────────────────────────────────────────────────────*/

/**
 * Registra un desembolso.
 *
 * El modelo ESCRIBE y el CÓDIGO DECIDE: el cuerpo pasa por `disbursementShape`
 * —que sólo deja salir los campos declarados, patrón `stripProtected`— y por
 * `validateDisbursement`, que devuelve TODOS los errores. Un cuerpo que traiga
 * `status: 'reversado'` o un `id` no cambia nada.
 *
 * ⚠️ SI EL CORREO FALLA, EL DESEMBOLSO NO SE REVIERTE. Es exigencia expresa del
 * pedido y es lo correcto: el dinero se movió de verdad, y deshacer el registro
 * de un hecho financiero porque no salió un aviso sería cambiar un problema de
 * comunicación por uno de contabilidad. Queda desembolsado y la notificación
 * queda fallida y reintentable.
 */
export const registerDisbursement = async ({
    payment, body, actor, receipt = null,
}) => {
    if (!(await listo())) {
        return { ok: false, status: 503, errores: ['El registro de desembolsos todavía no está disponible en esta base.'] };
    }

    const saldo = await balanceFor(payment);
    if (saldo.completo) {
        return { ok: false, status: 409, errores: ['Este aporte ya está completamente desembolsado.'] };
    }

    const datos = disbursementShape(body);
    const juicio = validateDisbursement(datos, { balance: saldo });
    if (!juicio.ok) return { ok: false, status: 422, errores: juicio.errores, avisos: juicio.avisos };

    const id = nuevoId();
    const moneda = normalizeCurrency(payment.currency);

    try {
        // ⚠️ EL `ON CONFLICT` REPITE EL PREDICADO DEL ÍNDICE PARCIAL. Sin eso
        // la sentencia falla entera — el error que costó una corrección en
        // v4.648 y otra en v4.856.
        const { rows } = await db.query(
            `INSERT INTO "Disbursement"
                 (id, "paymentId", "clubId", "donationId", amount, currency, "disbursedAt",
                  beneficiary, method, reference, notes, status,
                  "receiptKey", "receiptName", "receiptMime", "receiptBytes",
                  "notifyEmail", "createdBy", "createdByName")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmado',$12,$13,$14,$15,$16,$17,$18)
             ON CONFLICT ("paymentId", reference)
                 WHERE reference IS NOT NULL AND status = 'confirmado'
                 DO NOTHING
             RETURNING *`,
            [
                id, payment.id, payment.clubId, body?.donationId || null,
                datos.amount, moneda, datos.disbursedAt,
                datos.beneficiary, datos.method, datos.reference, datos.notes,
                receipt?.key || null, receipt?.name || null, receipt?.mime || null, receipt?.bytes || null,
                datos.notifyEmail, actor?.id || null, actor?.name || null,
            ]
        );

        if (!rows.length) {
            // El índice lo rechazó: ya existe un desembolso confirmado de este
            // aporte con esa misma referencia. Es un doble clic o un reintento
            // de red, no un error del usuario, y se dice con esas palabras.
            return {
                ok: false, status: 409,
                errores: [`Ya hay un desembolso registrado para este aporte con la referencia «${datos.reference}».`],
            };
        }

        const fila = rows[0];
        const saldoNuevo = disbursementBalance({
            net: Number(payment.netAmount) || 0,
            disbursements: [...(await listDisbursements(payment.id))],
            currency: moneda,
        });
        const estado = stateFromDisbursements(saldoNuevo);

        // La traza. `recordFact` y no `recordEvent` porque dos desembolsos
        // parciales son DOS hechos y el índice único no los debe fundir.
        await recordFact({
            paymentId: payment.id,
            clubId: payment.clubId,
            kind: saldoNuevo.completo ? 'disbursed' : 'disbursing',
            actorKind: 'user',
            actorId: actor?.id || null,
            actorLabel: actor?.name || actor?.email || null,
            reference: fila.id,
            note: `${formatMoney(datos.amount, moneda)} a ${datos.beneficiary} por ${metodoLabel(datos.method)}`
                + (datos.reference ? ` (ref. ${datos.reference})` : ''),
            meta: { disbursementId: fila.id, amount: datos.amount, currency: moneda, completo: saldoNuevo.completo },
            occurredAt: datos.disbursedAt,
        });

        // Y el cambio de estado del aporte, que sí es único por estado.
        if (estado) {
            await recordEvent({
                paymentId: payment.id, clubId: payment.clubId,
                kind: estado, toState: estado,
                actorKind: 'user', actorId: actor?.id || null, actorLabel: actor?.name || null,
                reference: fila.id,
                occurredAt: datos.disbursedAt,
            });
        }

        // La notificación va DESPUÉS de que el desembolso esté escrito, en su
        // propio camino y sin poder tumbarlo.
        let notificacion = null;
        if (datos.notify && datos.notifyEmail) {
            notificacion = await notifyDisbursement({ payment, disbursement: fila, actor });
        }

        return {
            ok: true,
            disbursement: publico({ ...fila, ...(notificacion?.fila || {}) }),
            balance: saldoNuevo,
            estado,
            avisos: juicio.avisos,
            notificacion: notificacion ? { estado: notificacion.estado, error: notificacion.error } : null,
        };
    } catch (e) {
        console.error('[DISB] no pude registrar el desembolso:', e?.message);
        return { ok: false, status: 500, errores: [`No se pudo registrar: ${e?.message || 'error de base de datos'}`] };
    }
};

/* ─── REVERSAR ───────────────────────────────────────────────────────
 *
 * La ÚNICA forma de corregir un desembolso. La fila se conserva entera; lo que
 * cambia es que deja de contar. El UPDATE es condicional sobre el estado, así
 * que dos reversas simultáneas no se pisan y la segunda no vuelve a anotar.
 */
export const reverseDisbursement = async ({ disbursementId, clubId, reason, actor }) => {
    if (!(await listo())) return { ok: false, status: 503, errores: ['No disponible.'] };
    const motivo = String(reason || '').trim();
    if (!motivo) {
        // Un reverso sin motivo es un borrado con otro nombre: dentro de seis
        // meses nadie puede explicar por qué ese movimiento no cuenta.
        return { ok: false, status: 422, errores: ['Un reverso necesita su motivo escrito.'] };
    }

    try {
        const { rows } = await db.query(
            `UPDATE "Disbursement"
                SET status = 'reversado', "reversedAt" = NOW(), "reversedBy" = $3,
                    "reversedReason" = $4, "updatedAt" = NOW()
              WHERE id = $1 AND "clubId" = $2 AND status = 'confirmado'
              RETURNING *`,
            [disbursementId, clubId, actor?.id || null, motivo.slice(0, 500)]
        );
        if (!rows.length) {
            return { ok: false, status: 409, errores: ['El desembolso no existe, no es de este sitio o ya estaba reversado.'] };
        }
        const fila = rows[0];

        await recordFact({
            paymentId: fila.paymentId, clubId,
            kind: 'reversed',
            actorKind: 'user', actorId: actor?.id || null, actorLabel: actor?.name || null,
            reference: fila.id,
            note: motivo.slice(0, 500),
            meta: { disbursementId: fila.id, amount: Number(fila.amount) },
        });

        return { ok: true, disbursement: publico(fila) };
    } catch (e) {
        console.error('[DISB] no pude reversar:', e?.message);
        return { ok: false, status: 500, errores: [e?.message || 'error de base de datos'] };
    }
};

/* ─── NOTIFICAR ──────────────────────────────────────────────────────
 *
 * ⚠️ NO SE ESCRIBE UN SEGUNDO SISTEMA DE CORREO. Se usa el que ya existe: la
 * identidad del perfil de notificaciones, `renderTemplate` con sus bloques,
 * `resolveSenderPlan` para no enviar jamás desde un dominio sin verificar, y
 * `NotificationDelivery` para la traza. Un envío propio acá bifurcaría en
 * silencio cómo escribe la plataforma y dejaría este correo fuera del panel de
 * entregas — que es justo donde alguien lo va a buscar cuando digan que no
 * llegó.
 *
 * Lo único propio es el DESTINATARIO: no sale del perfil sino del formulario,
 * porque quien recibe el dinero lo sabe el administrador que registró el
 * traslado, no una configuración.
 */
export const notifyDisbursement = async ({ payment, disbursement, actor = null }) => {
    const destino = disbursement.notifyEmail;
    if (!destino) return { estado: 'sin_destinatario', error: null };

    try {
        // El perfil da la identidad visual y el remitente. Si no hay ninguno se
        // usa la plantilla de fábrica y el remitente de respaldo: un
        // beneficiario no se queda sin aviso porque falte una personalización
        // (criterio 19 de v4.857).
        const plan = await resolveNotificationPlan({
            clubId: payment.clubId, campaignId: null, event: 'disbursed',
        }).catch(() => ({ profile: null, site: null }));

        const perfil = plan?.profile || null;
        const sitio = plan?.site || null;
        const beneficiario = plan?.beneficiary || null;

        // La plantilla CONFIGURADA si el perfil tiene una para este evento; la
        // de fábrica si no. Se lee la vigente (`isCurrent`), que es como este
        // módulo versiona desde v4.856: nunca se actualiza una fila, se inserta
        // una versión nueva y se baja la bandera de la anterior.
        const plantilla = (await plantillaConfigurada(perfil?.id)) || defaultTemplateFor('beneficiary', 'disbursed');

        const moneda = normalizeCurrency(disbursement.currency);
        const vars = {
            beneficiary_display: disbursement.beneficiary,
            beneficiary_name: beneficiario?.tradeName || beneficiario?.legalName || sitio?.name || '',
            site_name: sitio?.name || '',
            // El monto va SIN símbolo: la plantilla dibuja importe y moneda por
            // separado. Con el símbolo pegado saldría «$50.000 COP», y «$» de
            // pesos junto a «$» de dólares es la confusión de v4.843.
            disbursement_amount: new Intl.NumberFormat('es-CO', {
                minimumFractionDigits: moneda === 'COP' ? 0 : 2,
                maximumFractionDigits: moneda === 'COP' ? 0 : 2,
            }).format(Number(disbursement.amount) || 0),
            currency: moneda,
            amount: String(disbursement.amount),
            disbursement_date: new Date(disbursement.disbursedAt).toLocaleDateString('es-CO', {
                day: 'numeric', month: 'long', year: 'numeric',
            }),
            disbursement_method: metodoLabel(disbursement.method),
            // Sin referencia se dice «sin referencia», no se deja el hueco: un
            // renglón en blanco en un correo se lee como un error del sistema.
            disbursement_reference: disbursement.reference || 'sin referencia',
            contribution_id: payment.id,
            payment_reference: payment.providerRef || '',
        };

        const salida = renderTemplate({
            template: plantilla,
            vars,
            identity: perfil?.identity || {},
            beneficiary: beneficiario,
        });

        const dominios = await verifiedDomains().catch(() => []);
        const remitente = resolveSenderPlan({
            profile: perfil || {},
            siteDomain: sitio?.domain || '',
            verifiedDomains: dominios,
        });

        // El reclamo ANTES del envío: el índice único es lo que impide que dos
        // pulsaciones manden dos correos al mismo beneficiario por el mismo
        // desembolso.
        const traza = await claimDelivery({
            contributionId: payment.id,
            event: 'disbursed',
            recipient: destino,
            recipientKind: 'beneficiary',
            clubId: payment.clubId,
            campaignId: null,
            profileId: perfil?.id || null,
            provider: 'resend',
            fromAddress: remitente.address,
            subject: salida.subject,
        }).catch(() => ({ ok: false, reason: 'sin bitácora' }));

        if (traza.ok && !traza.claimed) {
            await marcarNotificacion(disbursement.id, { estado: 'duplicado', error: null });
            return { estado: 'duplicado', error: null };
        }

        const resultado = await EmailService.sendPlatformEmail({
            to: destino,
            subject: salida.subject,
            html: salida.html,
            text: salida.text,
            from: remitente.from,
            replyTo: remitente.replyTo || undefined,
        });

        if (resultado?.success) {
            if (traza.delivery?.id) await markSent(traza.delivery.id, { providerMessageId: resultado.messageId || null });
            await marcarNotificacion(disbursement.id, {
                estado: 'enviado', error: null, deliveryId: traza.delivery?.id || null,
            });
            await recordFact({
                paymentId: payment.id, clubId: payment.clubId,
                kind: 'notified',
                actorKind: 'system', actorLabel: 'Notificación de desembolso',
                reference: disbursement.id,
                note: `Aviso enviado a ${destino}`,
                meta: { email: destino, disbursementId: disbursement.id },
            });
            return { estado: 'enviado', error: null, fila: { notifyState: 'enviado', notifyAt: new Date() } };
        }

        const motivo = resultado?.error || 'sin motivo devuelto por el proveedor';
        if (traza.delivery?.id) await markFailed(traza.delivery.id, { errorMessage: motivo, retryable: true });
        await marcarNotificacion(disbursement.id, { estado: 'fallido', error: motivo });
        await recordFact({
            paymentId: payment.id, clubId: payment.clubId,
            kind: 'notify_failed',
            actorKind: 'system', actorLabel: 'Notificación de desembolso',
            reference: disbursement.id,
            note: motivo.slice(0, 500),
        });
        // ⚠️ Se devuelve el fallo, NO se lanza: el desembolso ya está escrito y
        // no se revierte por esto.
        return { estado: 'fallido', error: motivo, fila: { notifyState: 'fallido' } };
    } catch (e) {
        const motivo = e?.message || 'error inesperado al notificar';
        console.error('[DISB] la notificación falló:', motivo);
        await marcarNotificacion(disbursement.id, { estado: 'fallido', error: motivo }).catch(() => {});
        return { estado: 'fallido', error: motivo, fila: { notifyState: 'fallido' } };
    }
};

/**
 * La plantilla vigente del perfil para el desembolso, o `null`.
 *
 * Degrada a `null` ante cualquier fallo: sin plantilla configurada sale la de
 * fábrica, que es un correo correcto. Quedarse sin avisar porque una consulta
 * opcional falló sería el intercambio equivocado.
 */
const plantillaConfigurada = async (profileId) => {
    if (!profileId) return null;
    try {
        const { rows } = await db.query(
            `SELECT subject, preheader, blocks
               FROM "NotificationTemplate"
              WHERE "profileId" = $1 AND event = 'disbursed'
                AND "recipientKind" = 'beneficiary' AND "isCurrent"
              LIMIT 1`,
            [profileId]
        );
        if (!rows.length) return null;
        return { subject: rows[0].subject, preheader: rows[0].preheader, blocks: rows[0].blocks };
    } catch {
        return null;
    }
};

const marcarNotificacion = async (id, { estado, error, deliveryId = null }) => {
    try {
        await db.query(
            `UPDATE "Disbursement"
                SET "notifyState" = $2, "notifyAt" = NOW(), "notifyError" = $3,
                    "notifyDeliveryId" = COALESCE($4, "notifyDeliveryId"), "updatedAt" = NOW()
              WHERE id = $1`,
            [id, estado, error ? String(error).slice(0, 500) : null, deliveryId]
        );
    } catch (e) {
        console.warn('[DISB] no pude anotar el resultado de la notificación:', e?.message);
    }
};

/** Reintenta el aviso de un desembolso cuyo correo falló. El desembolso ya es
 *  válido: lo que se reintenta es el aviso, y por eso vive aparte del registro. */
export const retryDisbursementNotice = async ({ disbursementId, clubId, payment, actor }) => {
    if (!(await listo())) return { ok: false, status: 503, errores: ['No disponible.'] };
    try {
        const { rows } = await db.query(
            `SELECT * FROM "Disbursement" WHERE id = $1 AND "clubId" = $2 LIMIT 1`,
            [disbursementId, clubId]
        );
        if (!rows.length) return { ok: false, status: 404, errores: ['El desembolso no existe en este sitio.'] };
        const fila = rows[0];
        if (!fila.notifyEmail) {
            return { ok: false, status: 422, errores: ['Este desembolso no tiene una dirección a la que escribirle.'] };
        }
        const r = await notifyDisbursement({ payment, disbursement: fila, actor });
        return { ok: r.estado === 'enviado', estado: r.estado, error: r.error };
    } catch (e) {
        return { ok: false, status: 500, errores: [e?.message] };
    }
};

export default {
    listDisbursements, listDisbursementsFor, balanceFor, disbursedTotals,
    uploadReceipt, signedReceiptUrl, receiptKeyOf,
    registerDisbursement, reverseDisbursement,
    notifyDisbursement, retryDisbursementNotice,
};
