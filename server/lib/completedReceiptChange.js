// ════════════════════════════════════════════════════════════════════
// Subir o reemplazar el comprobante de una inscripción completada — v4.1291
//
// UN SOLO CAMINO para el Equipo de Registro (ficha del panel) y para el
// participante («Mis eventos»): las dos puertas comprueban QUIÉN puede
// (capacidad del evento / cuenta dueña del registro) y después llaman acá, que
// decide QUÉ se acepta. Dos caminos terminarían aceptando cosas distintas.
//
// El archivo ya subió directo a S3 con una URL prefirmada (el cuerpo de una
// función de Vercel se corta en ~4,5 MB). Acá se COMPRUEBA el objeto real
// —que es del prefijo de ESTE evento, que existe y cuánto pesa— igual que en el
// envío del formulario (`submitCompleted`): lo que el navegador declara no
// obliga a nada.
//
// Reemplazar NO borra el anterior (ver `completedRegistrationSpec.js`): el
// historial guarda su clave para la auditoría del equipo; la vista del
// participante no la ve nunca.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { clean, recordHistory } from './eventRegistrationStore.js';
import { receiptKeyBelongs, headReceipt } from './completedReceipts.js';
import { describeReceiptChange } from './completedRegistrationSpec.js';

/**
 * @returns {{ ok: true, row } | { ok: false, status: number, error: string }}
 */
export const replaceCompletedReceipt = async ({ row, eventId, receipt, actor = null, via = 'team' }) => {
    const key = clean(receipt?.key, 400);
    const name = clean(receipt?.name, 200) || 'comprobante';
    if (!key) return { ok: false, status: 422, error: 'Falta el comprobante de pago.' };
    if (!receiptKeyBelongs(key, eventId)) {
        return { ok: false, status: 422, error: 'El comprobante no corresponde a este evento. Vuelve a adjuntarlo.' };
    }
    if (key === row.receiptKey) return { ok: true, row, unchanged: true };

    // Una clave ya reclamada por OTRA inscripción no se comparte: cada
    // registro tiene su propio soporte.
    const { rows: ajenas } = await db.query(
        `SELECT 1 FROM "EventCompletedRegistration" WHERE "receiptKey" = $1 AND id <> $2 LIMIT 1`,
        [key, row.id]);
    if (ajenas.length) return { ok: false, status: 409, error: 'Ese archivo ya pertenece a otra inscripción. Vuelve a adjuntarlo.' };

    const head = await headReceipt(key);
    if (!head.ok) return { ok: false, status: 422, error: head.error };

    // La condición sobre la clave anterior evita pisar un cambio simultáneo
    // (el equipo y el participante a la vez): el segundo recibe 409 y recarga.
    const { rows } = await db.query(
        `UPDATE "EventCompletedRegistration"
            SET "receiptKey" = $1, "receiptName" = $2, "receiptMime" = $3, "receiptBytes" = $4, "updatedAt" = NOW()
          WHERE id = $5 AND "receiptKey" IS NOT DISTINCT FROM $6
          RETURNING *`,
        [key, name, clean(head.mime || receipt?.contentType, 100) || null, head.bytes, row.id, row.receiptKey || null]);
    if (!rows[0]) {
        return { ok: false, status: 409, error: 'El comprobante cambió mientras tanto. Recarga la inscripción y vuelve a intentarlo.' };
    }

    await recordHistory({
        registrationId: row.id, eventId, type: 'receipt_replaced',
        comment: describeReceiptChange({ previousName: row.receiptKey ? (row.receiptName || 'anterior') : null, nextName: name, via }),
        actor,
        payload: {
            via,
            previous: row.receiptKey
                ? { key: row.receiptKey, name: row.receiptName || null, mime: row.receiptMime || null, bytes: row.receiptBytes == null ? null : Number(row.receiptBytes) }
                : null,
            next: { key, name, mime: head.mime || null, bytes: head.bytes },
        },
    });

    return { ok: true, row: rows[0] };
};

export default { replaceCompletedReceipt };
