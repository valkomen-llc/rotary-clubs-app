// ════════════════════════════════════════════════════════════════════
// Importación de inscripciones históricas — acceso a datos — v4.959.0
//
// La I/O del motor: el universo de duplicados del evento, el INSERT del
// registro importado, los lotes y la reversión. El criterio vive en
// `completedImportSpec.js`.
//
// Reglas heredadas del módulo: TODO se consulta por `eventId`; el registro
// importado es una fila NORMAL de `EventCompletedRegistration` (con
// `registrationSource: 'historical_import'`), nunca una tabla paralela.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { clean } from './eventRegistrationStore.js';
import { IMPORT_SOURCE } from './completedImportSpec.js';
import { ONLINE_SOURCE, COMPLETED_SOURCE } from './completedRegistrationSpec.js';

// ── El universo de duplicados ────────────────────────────────────────
//
// UNA consulta por tabla para todo el archivo, no una por fila (criterio de
// `getCentralOverview`, v4.853): con 250 filas serían 500 viajes. El evento
// tiene cientos de inscritos, no cientos de miles; se clasifica en memoria
// con el criterio puro.

export const existingPeopleFor = async (eventId) => {
    const { rows: online } = await db.query(
        `SELECT id, "registrationCode", "firstName", "lastName", email, "documentNumber", status
         FROM "EventRegistration"
         WHERE "eventId" = $1 AND status <> 'draft'
         ORDER BY "createdAt" DESC LIMIT 5000`, [eventId]);
    const { rows: completed } = await db.query(
        `SELECT id, "registrationCode", "firstName", "lastName", email, "documentNumber", phone,
                status, "registrationSource", "importBatchId"
         FROM "EventCompletedRegistration"
         WHERE "eventId" = $1
         ORDER BY "createdAt" DESC LIMIT 5000`, [eventId]);
    return [
        ...online.map(r => ({ ...r, source: ONLINE_SOURCE })),
        ...completed.map(r => ({
            ...r,
            source: r.registrationSource === IMPORT_SOURCE ? IMPORT_SOURCE : COMPLETED_SOURCE,
        })),
    ];
};

// ── Lotes ────────────────────────────────────────────────────────────
//
// La fila del lote se INSERTA antes de crear ningún registro (v4.669): si la
// invocación muere a mitad, queda el rastro con sus totales parciales en vez
// de doscientas filas sin explicación.

export const insertImportBatch = async ({ eventId, clubId, fileName, initialStatus, createdBy, createdByName }) => {
    const { rows } = await db.query(
        `INSERT INTO "EventImportBatch"
            ("eventId", "clubId", "fileName", "initialStatus", status, totals, "createdBy", "createdByName")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [eventId, clubId || null, clean(fileName, 300) || null, initialStatus,
            'processing', JSON.stringify({}), createdBy || null, clean(createdByName, 200) || null]);
    return rows[0];
};

export const finishImportBatch = async (id, totals, status = 'done') => {
    const { rows } = await db.query(
        `UPDATE "EventImportBatch"
         SET totals = $1, status = $2, "updatedAt" = NOW()
         WHERE id = $3
         RETURNING *`,
        [JSON.stringify(totals || {}), status, id]);
    return rows[0] || null;
};

export const markBatchReverted = async (id, totals) => {
    const { rows } = await db.query(
        `UPDATE "EventImportBatch"
         SET totals = $1, status = $2, "revertedAt" = NOW(), "updatedAt" = NOW()
         WHERE id = $3
         RETURNING *`,
        [JSON.stringify(totals || {}), 'reverted', id]);
    return rows[0] || null;
};

export const listImportBatches = async (eventId) => {
    const { rows } = await db.query(
        `SELECT * FROM "EventImportBatch"
         WHERE "eventId" = $1
         ORDER BY "createdAt" DESC LIMIT 100`, [eventId]);
    return rows;
};

export const findImportBatch = async (id, eventId) => {
    const { rows } = await db.query(
        `SELECT * FROM "EventImportBatch"
         WHERE id = $1 AND "eventId" = $2 LIMIT 1`, [id, eventId]);
    return rows[0] || null;
};

/** Las filas que un lote creó, con lo justo para el detalle y la reversión. */
export const listBatchRows = async (batchId, eventId) => {
    const { rows } = await db.query(
        `SELECT id, "registrationCode", "firstName", "lastName", email, status,
                "checkedInAt", "importMeta", "updatedAt"
         FROM "EventCompletedRegistration"
         WHERE "importBatchId" = $1 AND "eventId" = $2
         ORDER BY "createdAt" ASC LIMIT 5000`, [batchId, eventId]);
    return rows;
};

// ── El registro importado ────────────────────────────────────────────
//
// NO reutiliza `insertCompleted` a propósito: aquél fija `status: 'submitted'`
// y el origen manual —es el contrato del formulario público y una prueba lo
// fija—. El importado declara su estado inicial (elegido por el administrador,
// del catálogo acotado) y su origen `historical_import`, con el lote y los
// metadatos de trazabilidad. Todo lo demás es la MISMA fila.

export const insertImportedCompleted = async (data, { status, batchId, meta, submittedAt }) => {
    const { rows } = await db.query(
        `INSERT INTO "EventCompletedRegistration"
            ("eventId", "clubId", status, "registrationSource",
             "firstName", "lastName", "documentNumber", email, phone,
             district, "clubName", "membershipType", "clubRole", "clubRoleOther", "guestType",
             eps, "foodAllergy", "emergencyName", "emergencyPhone",
             "paymentMethod", comments, answers, flags,
             "importBatchId", "importMeta", "submittedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
                 COALESCE($26::timestamptz, NOW()))
         RETURNING *`,
        [
            data.eventId, data.clubId || null, status, IMPORT_SOURCE,
            clean(data.firstName, 120), clean(data.lastName, 120),
            clean(data.documentNumber, 60), clean(data.email, 200).toLowerCase(),
            clean(data.phone, 60), clean(data.district, 60), clean(data.clubName, 200),
            clean(data.membershipType, 30), clean(data.clubRole, 40), clean(data.clubRoleOther, 160),
            clean(data.guestType, 200),
            clean(data.eps, 200), clean(data.foodAllergy, 300),
            clean(data.emergencyName, 160), clean(data.emergencyPhone, 60),
            clean(data.paymentMethod, 40), clean(data.comments, 2000) || null,
            JSON.stringify(data.answers || {}),
            JSON.stringify(data.flags || {}),
            batchId, JSON.stringify(meta || {}),
            // v4.959 — la marca temporal del sistema anterior. `null` = no
            // venía en el archivo (o no se pudo leer) y la fila queda con la
            // fecha de la importación: nunca se inventa una.
            submittedAt || null,
        ]);
    return rows[0];
};

/**
 * «Completar» un registro existente con un duplicado del archivo: rellena
 * SÓLO las columnas vacías — nunca se sobrescribe información existente
 * (exigencia expresa del pedido). Devuelve qué columnas se llenaron.
 */
const FILLABLE = [
    'firstName', 'lastName', 'documentNumber', 'phone', 'district', 'clubName',
    'membershipType', 'clubRole', 'clubRoleOther', 'guestType', 'eps', 'foodAllergy',
    'emergencyName', 'emergencyPhone', 'paymentMethod', 'comments',
];

export const fillExistingCompleted = async (existingRow, answers) => {
    const filled = [];
    for (const col of FILLABLE) {
        const current = String(existingRow[col] ?? '').trim();
        const incoming = String(answers[col] ?? '').trim();
        if (!current && incoming) {
            await db.query(
                `UPDATE "EventCompletedRegistration"
                 SET "${col}" = $1, "updatedAt" = NOW()
                 WHERE id = $2 AND ("${col}" IS NULL OR "${col}" = '')`,
                [incoming, existingRow.id]);
            filled.push(col);
        }
    }
    return filled;
};

/** Borra UNA fila de un lote (sólo la reversión la usa, con sus guardas). */
export const deleteBatchRow = async (id, batchId) => {
    const { rowCount } = await db.query(
        `DELETE FROM "EventCompletedRegistration"
         WHERE id = $1 AND "importBatchId" = $2`, [id, batchId]);
    return rowCount > 0;
};

/** ¿Esta fila tiene comunicaciones registradas? (Una con correo no se revierte.) */
export const rowHasMessages = async (registrationId) => {
    try {
        const { rows } = await db.query(
            `SELECT id FROM "EventRegistrationMessage"
             WHERE "registrationId" = $1 LIMIT 1`, [registrationId]);
        return rows.length > 0;
    } catch {
        // Ante la duda, se conserva la fila: perder un registro es peor que
        // dejar uno de más.
        return true;
    }
};

export default {
    existingPeopleFor,
    insertImportBatch, finishImportBatch, markBatchReverted,
    listImportBatches, findImportBatch, listBatchRows,
    insertImportedCompleted, fillExistingCompleted, deleteBatchRow, rowHasMessages,
};
