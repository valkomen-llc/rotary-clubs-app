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
import { validateForMeta } from './phone.js';
import {
    resolveRecipients, buildNoticeData, buildWaParameters, canSendWhatsApp,
    noticeResult, summarizeResults, WA_TEMPLATE_NAME, WA_TEMPLATE, WA_VARIABLES,
} from './disbursementNotice.js';
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
        // Se trae de paso CUÁNTOS aportes cubre el lote de cada desembolso. Es
        // lo que permite decir «comprobante del giro que cubrió 5 aportes» en
        // vez de dejar que se lea como el soporte de éste solo. Sale de la
        // misma consulta: preguntarlo aparte sería un viaje por ficha.
        const { rows } = await db.query(
            `SELECT d.*,
                    CASE WHEN d."batchId" IS NULL THEN NULL ELSE (
                        SELECT COUNT(*)::int FROM "Disbursement" b
                         WHERE b."batchId" = d."batchId" AND b.status = 'confirmado'
                    ) END AS "batchSize"
               FROM "Disbursement" d
              WHERE d."paymentId" = $1
              ORDER BY d."disbursedAt" ASC`,
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
    // v4.887 — El LOTE. Con `batchId` el comprobante es el del GIRO que cubrió
    // varios aportes, no el de éste suelto: la ficha lo dice con esas palabras
    // en vez de afirmar que un mismo archivo respalda a cada uno por separado.
    batchId: r.batchId || null,
    batchSize: r.batchSize ?? null,
    notifyEmail: r.notifyEmail,
    // v4.888 — Los destinatarios y el resultado POR CANAL. `notifyState` se
    // conserva como el resumen de una línea que la ficha ya pinta; `parcial` es
    // un estado real —llegó a dos de tres— y presentarlo como «enviado» o como
    // «fallido» sería mentir en las dos direcciones.
    notifyEmails: Array.isArray(r.notifyEmails) ? r.notifyEmails : [],
    notifyPhones: Array.isArray(r.notifyPhones) ? r.notifyPhones : [],
    notifyResults: Array.isArray(r.notifyResults) ? r.notifyResults : [],
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

/**
 * Lo desembolsado POR APORTE, agregado en la base (v4.890).
 *
 * Es lo que permite que el estado que se muestra conozca el giro sin traer una
 * fila por desembolso: `GROUP BY "paymentId"` devuelve un renglón por aporte y
 * la pantalla los pinta todos con esa única consulta. Traer las filas y sumar
 * fuera sería una consulta por aporte —decenas por visita— para calcular un
 * número que la base ya sabe sumar. Mismo criterio que `disbursedTotals`.
 *
 * Los REVERSADOS no cuentan: un desembolso corregido no trasladó nada, así que
 * el aporte vuelve a estar donde estaba.
 *
 * `paymentIds` acota cuando ya se sabe cuáles interesan (la lista de aportes);
 * sin él se devuelve todo el sitio, que es lo que necesita la Bóveda.
 */
export const disbursedByPayment = async (clubId, paymentIds = null) => {
    try {
        if (!clubId || !(await listo())) return {};
        const acotar = Array.isArray(paymentIds);
        if (acotar && paymentIds.length === 0) return {};
        const { rows } = await db.query(
            `SELECT "paymentId",
                    COALESCE(SUM(amount), 0)::float8 AS cubierto,
                    COUNT(*)::int AS cuantos
               FROM "Disbursement"
              WHERE "clubId" = $1 AND status = 'confirmado'
                    ${acotar ? 'AND "paymentId" = ANY($2::text[])' : ''}
              GROUP BY "paymentId"`,
            acotar ? [clubId, paymentIds] : [clubId]
        );
        const salida = {};
        for (const r of rows) {
            salida[r.paymentId] = { cubierto: Number(r.cubierto) || 0, cuantos: r.cuantos };
        }
        return salida;
    } catch (e) {
        // Degrada a vacío, como todo lo de este archivo: sin el dato el estado
        // se pinta como antes de v4.890, no se cae la pantalla del dinero.
        console.warn('[DISB] disbursedByPayment falló:', e?.message);
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
    payment, body, actor, receipt = null, batchId = null,
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
                  "notifyEmail", "notifyEmails", "notifyPhones", "createdBy", "createdByName", "batchId")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmado',$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
             ON CONFLICT ("paymentId", reference)
                 WHERE reference IS NOT NULL AND status = 'confirmado'
                 DO NOTHING
             RETURNING *`,
            [
                id, payment.id, payment.clubId, body?.donationId || null,
                datos.amount, moneda, datos.disbursedAt,
                datos.beneficiary, datos.method, datos.reference, datos.notes,
                receipt?.key || null, receipt?.name || null, receipt?.mime || null, receipt?.bytes || null,
                datos.notifyEmail,
                // v4.888 — Los destinatarios saneados por canal. La columna
                // es JSONB y el driver manda un JSON: Postgres convierte.
                JSON.stringify(datos.notifyEmails || []),
                JSON.stringify(datos.notifyPhones || []),
                actor?.id || null, actor?.name || null,
                batchId || null,
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
    // Los destinatarios: los nuevos por canal, o la dirección suelta de v4.885.
    const destinatarios = resolveRecipients({
        emails: disbursement.notifyEmails,
        phones: disbursement.notifyPhones,
        legacyEmail: disbursement.notifyEmail,
    }, validateForMeta);

    if (!destinatarios.total) {
        return { estado: 'sin_destinatario', error: null, resultados: [] };
    }

    const resultados = [];
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

        // ⚠️ LOS DATOS DEL AVISO SE ARMAN UNA VEZ PARA LOS DOS CANALES. Con dos
        // construcciones, el correo diría una cifra y el WhatsApp otra — y la
        // que estuviera mal nadie la notaría hasta que el beneficiario
        // preguntara.
        const datos = buildNoticeData({
            disbursement,
            siteName: sitio?.name || '',
            methodLabel: metodoLabel(disbursement.method),
        });

        // ── CORREO ───────────────────────────────────────────────────
        if (destinatarios.email.length) {
            const plantilla = (await plantillaConfigurada(perfil?.id))
                || defaultTemplateFor('beneficiary', 'disbursed');

            const vars = {
                beneficiary_display: datos.beneficiary,
                beneficiary_name: beneficiario?.tradeName || beneficiario?.legalName || sitio?.name || '',
                site_name: datos.site,
                // El monto va SIN símbolo: la plantilla dibuja importe y moneda
                // por separado. Con el símbolo pegado saldría «$50.000 COP», y
                // «$» de pesos junto a «$» de dólares es la confusión de v4.843.
                disbursement_amount: new Intl.NumberFormat('es-CO', {
                    minimumFractionDigits: datos.currency === 'COP' ? 0 : 2,
                    maximumFractionDigits: datos.currency === 'COP' ? 0 : 2,
                }).format(Number(disbursement.amount) || 0),
                currency: datos.currency,
                amount: datos.amountRaw,
                disbursement_date: datos.date,
                disbursement_method: datos.method,
                disbursement_reference: datos.reference,
                contribution_id: payment.id,
                payment_reference: payment.providerRef || '',
            };

            const salida = renderTemplate({
                template: plantilla, vars,
                identity: perfil?.identity || {},
                beneficiary: beneficiario,
            });

            const dominios = await verifiedDomains().catch(() => []);
            const remitente = resolveSenderPlan({
                profile: perfil || {},
                siteDomain: sitio?.domain || '',
                verifiedDomains: dominios,
            });

            for (const destino of destinatarios.email) {
                resultados.push(await enviarCorreo({
                    payment, disbursement, destino, salida, remitente,
                    profileId: perfil?.id || null,
                }));
            }
        }

        // ── WHATSAPP ─────────────────────────────────────────────────
        //
        // ⚠️ SÓLO CON UNA PLANTILLA APROBADA POR META. Fuera de la ventana de
        // 24 horas —que es el caso normal de un beneficiario que nunca nos
        // escribió— Meta no entrega texto libre. Si no se puede, se DICE con el
        // motivo concreto y se registra como `omitido`, que no es lo mismo que
        // `fallido`: no se intentó porque falta un paso, y ese paso se nombra.
        if (destinatarios.whatsapp.length) {
            const permiso = await puedeMandarWhatsApp(destinatarios.whatsapp);
            if (!permiso.ok) {
                for (const tel of destinatarios.whatsapp) {
                    resultados.push(noticeResult({
                        channel: 'whatsapp', target: tel, state: 'omitido', error: permiso.motivo,
                    }));
                }
                console.warn(`[DISB] WhatsApp omitido para ${disbursement.id}: ${permiso.motivo}`);
            } else {
                for (const tel of destinatarios.whatsapp) {
                    resultados.push(await enviarWhatsApp({
                        payment, disbursement, telefono: tel, datos,
                        config: permiso.config, template: permiso.template,
                    }));
                }
            }
        }
    } catch (e) {
        const motivo = e?.message || 'error inesperado al notificar';
        console.error('[DISB] la notificación falló:', motivo);
        resultados.push(noticeResult({ channel: 'email', target: '', state: 'fallido', error: motivo }));
    }

    // Los descartados también quedan escritos: quien pegó cinco números tiene
    // que poder ver cuál no se pudo interpretar y por qué.
    for (const d of destinatarios.descartados) {
        resultados.push(noticeResult({
            channel: d.canal, target: d.valor, state: 'omitido', error: d.motivo,
        }));
    }

    const resumen = summarizeResults(resultados);
    // El estado de una línea que la ficha ya pinta. `parcial` es un estado
    // real: un aviso que llegó a dos de tres direcciones no es «enviado» ni es
    // «fallido», y presentarlo como cualquiera de los dos sería mentir.
    const estado = resumen?.enviados && resumen?.fallidos ? 'parcial'
        : resumen?.enviados ? 'enviado'
            : resumen?.fallidos ? 'fallido' : 'omitido';

    await marcarNotificacion(disbursement.id, {
        estado,
        error: resultados.find(r => r.state === 'fallido')?.error
            || resultados.find(r => r.state === 'omitido')?.error
            || null,
        resultados,
    });

    if (resumen?.enviados) {
        await recordFact({
            paymentId: payment.id, clubId: payment.clubId,
            kind: 'notified',
            actorKind: 'system', actorLabel: 'Notificación de desembolso',
            reference: disbursement.id,
            note: `Aviso enviado a ${resumen.enviados} destinatario(s)`
                + (resumen.fallidos ? `; ${resumen.fallidos} fallaron` : ''),
            meta: { disbursementId: disbursement.id, resumen },
        });
    }
    if (resumen?.fallidos) {
        await recordFact({
            paymentId: payment.id, clubId: payment.clubId,
            kind: 'notify_failed',
            actorKind: 'system', actorLabel: 'Notificación de desembolso',
            reference: disbursement.id,
            note: (resultados.find(r => r.state === 'fallido')?.error || '').slice(0, 500),
        });
    }

    // ⚠️ Se DEVUELVE el resultado, nunca se lanza: el desembolso ya está
    // escrito y no se revierte porque un aviso no saliera.
    return {
        estado,
        error: resultados.find(r => r.state === 'fallido')?.error || null,
        resultados,
        resumen,
        fila: { notifyState: estado, notifyResults: resultados },
    };
};

/** Un correo a un destinatario, con su reclamo de idempotencia y su traza. */
const enviarCorreo = async ({ payment, disbursement, destino, salida, remitente, profileId }) => {
    try {
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
            profileId,
            provider: 'resend',
            fromAddress: remitente.address,
            subject: salida.subject,
        }).catch(() => ({ ok: false, reason: 'sin bitácora' }));

        if (traza.ok && !traza.claimed) {
            return noticeResult({ channel: 'email', target: destino, state: 'duplicado' });
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
            return noticeResult({
                channel: 'email', target: destino, state: 'enviado',
                messageId: resultado.messageId || null,
            });
        }

        const motivo = resultado?.error || 'sin motivo devuelto por el proveedor';
        if (traza.delivery?.id) await markFailed(traza.delivery.id, { errorMessage: motivo, retryable: true });
        return noticeResult({ channel: 'email', target: destino, state: 'fallido', error: motivo });
    } catch (e) {
        return noticeResult({
            channel: 'email', target: destino, state: 'fallido',
            error: e?.message || 'error inesperado',
        });
    }
};

/**
 * ¿Se puede mandar por WhatsApp? Resuelve la configuración y la plantilla.
 *
 * ⚠️ SALE DEL WABA DE LA PLATAFORMA, no del sitio. Es la regla del CRM desde
 * v4.701 —«la plataforma es el único remitente; no hay un WABA por club»— y es
 * lo que hace posible una plantilla estandarizada: se aprueba UNA vez para toda
 * la plataforma y el nombre del sitio viaja como variable.
 */
const puedeMandarWhatsApp = async (phones) => {
    try {
        const { resolvePlatformClubId } = await import('./crmTenant.js');
        const { getWhatsAppConfig } = await import('./whatsappSender.js');
        const clubId = await resolvePlatformClubId();
        if (!clubId) {
            return { ok: false, motivo: 'No hay un sitio «Origen» configurado para emitir por WhatsApp.' };
        }
        const config = await getWhatsAppConfig(clubId);

        const { rows } = await db.query(
            `SELECT id, name, language, status, "bodyText", "rejectionReason"
               FROM "WhatsAppTemplate"
              WHERE "clubId" = $1 AND name = $2
              LIMIT 1`,
            [clubId, WA_TEMPLATE_NAME]
        ).catch(() => ({ rows: [] }));

        const juicio = canSendWhatsApp({ config, template: rows[0] || null, phones });
        return { ...juicio, config, template: rows[0] || null, clubId };
    } catch (e) {
        return { ok: false, motivo: `No se pudo comprobar WhatsApp: ${e?.message || 'error'}` };
    }
};

/**
 * Un WhatsApp a un número.
 *
 * ⚠️ NO SE ESCRIBE UN SEGUNDO ENVÍO A META. Se usa `sendTemplate` del CRM, que
 * ya registra en `WhatsAppMessageLog` y en la bitácora de salidas
 * (`logOutbound`) — que es donde alguien va a mirar cuando digan que no llegó.
 * Un envío propio dejaría este canal fuera del panel de diagnóstico.
 */
const enviarWhatsApp = async ({ payment, disbursement, telefono, datos, config }) => {
    try {
        const { sendTemplate } = await import('./whatsappSender.js');
        const { resolvePlatformClubId } = await import('./crmTenant.js');
        const clubId = await resolvePlatformClubId();

        // `sendTemplate` escribe en `WhatsAppMessageLog`, que exige un contacto.
        // Se busca o se crea por (phone, clubId), que es su índice único.
        const contacto = await contactoPara(clubId, telefono, datos.beneficiary);
        if (!contacto) {
            return noticeResult({
                channel: 'whatsapp', target: telefono, state: 'fallido',
                error: 'No se pudo registrar el contacto de WhatsApp.',
            });
        }

        const r = await sendTemplate({
            clubId,
            contact: contacto,
            template: { name: WA_TEMPLATE_NAME, language: 'es', bodyText: WA_TEMPLATE.bodyText },
            variables: buildWaParameters(datos),
            config,
        });

        return noticeResult({
            channel: 'whatsapp', target: telefono, state: 'enviado',
            messageId: r?.messageId || null,
        });
    } catch (e) {
        // El error de Meta se propaga TEXTUAL, con su código: convertirlo en
        // «no se pudo enviar» deja a quien corrige sin saber si el problema es
        // el número, la plantilla o el token.
        const detalle = [e?.code, e?.message].filter(Boolean).join(': ');
        return noticeResult({
            channel: 'whatsapp', target: telefono, state: 'fallido',
            error: detalle || 'error desconocido de Meta',
        });
    }
};

/**
 * Deja la plantilla estándar de WhatsApp en la biblioteca del operador, lista
 * para enviarla a Meta desde la pantalla que ya existe.
 *
 * ⚠️ NO LA ENVÍA A META. Someterla es un acto explícito con consecuencia —un
 * rechazo baja la calificación de calidad de la cuenta y puede limitar el
 * volumen diario (regla de v4.701)— y se hace desde Comunicaciones CRM →
 * Plantillas, donde además se ve el estado de la revisión. Acá sólo se crea el
 * borrador con el texto correcto para que nadie tenga que transcribirlo.
 *
 * ⚠️ ES ADITIVO E IDEMPOTENTE: si la plantilla ya existe NO se pisa. Una vez
 * creada es del operador —puede haberla ajustado y sometido— y un despliegue no
 * vuelve a tocarla. Es la regla de la siembra de recorridos (v4.701) y la del
 * Generador de Pendones.
 */
export const seedWhatsAppTemplate = async () => {
    try {
        const { resolvePlatformClubId } = await import('./crmTenant.js');
        const clubId = await resolvePlatformClubId();
        if (!clubId) {
            return { ok: false, reason: 'No hay un sitio «Origen» configurado.' };
        }

        const { rows: existe } = await db.query(
            `SELECT id, status, "metaTemplateId" FROM "WhatsAppTemplate"
              WHERE "clubId" = $1 AND name = $2 LIMIT 1`,
            [clubId, WA_TEMPLATE_NAME]
        );
        if (existe.length) {
            return {
                ok: true, created: false, template: existe[0],
                reason: 'La plantilla ya existe; no se toca.',
            };
        }

        const { rows } = await db.query(
            `INSERT INTO "WhatsAppTemplate"
                 (id, "clubId", name, "displayName", category, language, status,
                  "headerType", "bodyText", "footerText", buttons, folder,
                  "variableTokens", "variableSamples", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'draft',
                     'NONE', $6, $7, '[]'::jsonb, $8, $9, $10, NOW(), NOW())
             RETURNING id, name, status`,
            [
                clubId, WA_TEMPLATE.name, WA_TEMPLATE.displayName,
                WA_TEMPLATE.category, WA_TEMPLATE.language,
                WA_TEMPLATE.bodyText, WA_TEMPLATE.footerText, WA_TEMPLATE.folder,
                // Qué dato alimenta cada `{{n}}`. Sin esto, una plantilla se
                // aprueba pero nadie puede saber qué va en cada hueco — es la
                // regla de `variableTokens` en v4.701.
                JSON.stringify(WA_VARIABLES.map(v => v.id)),
                JSON.stringify(WA_VARIABLES.map(v => v.sample)),
            ]
        );
        return { ok: true, created: true, template: rows[0] };
    } catch (e) {
        console.error('[DISB] no pude sembrar la plantilla de WhatsApp:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/** El estado de la plantilla estándar, para que la pantalla lo diga. */
export const whatsappTemplateStatus = async () => {
    try {
        const { resolvePlatformClubId } = await import('./crmTenant.js');
        const { getWhatsAppConfig } = await import('./whatsappSender.js');
        const clubId = await resolvePlatformClubId();
        if (!clubId) return { configurado: false, plantilla: null, motivo: 'Sin sitio «Origen».' };

        const config = await getWhatsAppConfig(clubId);
        const { rows } = await db.query(
            `SELECT id, name, status, "rejectionReason", "metaTemplateId"
               FROM "WhatsAppTemplate" WHERE "clubId" = $1 AND name = $2 LIMIT 1`,
            [clubId, WA_TEMPLATE_NAME]
        );
        const juicio = canSendWhatsApp({ config, template: rows[0] || null, phones: ['+000'] });
        return {
            configurado: !!config && config.enabled !== false,
            plantilla: rows[0] || null,
            listo: juicio.ok,
            motivo: juicio.motivo,
        };
    } catch (e) {
        // Degrada: que no se pueda comprobar el estado de WhatsApp no puede
        // impedir registrar un desembolso.
        return { configurado: false, plantilla: null, listo: false, motivo: e?.message };
    }
};

/** El contacto de WhatsApp de un número, creándolo si hace falta. */
const contactoPara = async (clubId, telefono, nombre) => {
    try {
        const { rows } = await db.query(
            `INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, source, status, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, 'desembolso', 'active', NOW(), NOW())
             ON CONFLICT (phone, "clubId") DO UPDATE
                 SET "updatedAt" = NOW()
             RETURNING id, phone, name`,
            [clubId, String(nombre || 'Beneficiario').slice(0, 120), telefono]
        );
        return rows[0] || null;
    } catch (e) {
        console.warn('[DISB] no pude resolver el contacto de WhatsApp:', e?.message);
        return null;
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

const marcarNotificacion = async (id, { estado, error, deliveryId = null, resultados = null }) => {
    try {
        await db.query(
            `UPDATE "Disbursement"
                SET "notifyState" = $2, "notifyAt" = NOW(), "notifyError" = $3,
                    "notifyDeliveryId" = COALESCE($4, "notifyDeliveryId"),
                    "notifyResults" = COALESCE($5::jsonb, "notifyResults"),
                    "updatedAt" = NOW()
              WHERE id = $1`,
            [id, estado, error ? String(error).slice(0, 500) : null, deliveryId,
             resultados ? JSON.stringify(resultados) : null]
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
    seedWhatsAppTemplate, whatsappTemplateStatus,
    uploadReceipt, signedReceiptUrl, receiptKeyOf,
    registerDisbursement, reverseDisbursement,
    notifyDisbursement, retryDisbursementNotice,
};
