// ════════════════════════════════════════════════════════════════════
// EXCHANGE — traslados y conciliación de la Feria — el esquema, en runtime (v4.1335)
//
// CINCO tablas fuera de Prisma (en la lista del guardián de `db:push` y en la
// de CLAUDE.md). Ninguna duplica el traslado: el giro y su reparto por proyecto
// siguen en `Disbursement` / `DisbursementBatch` de la Bóveda (ver
// `exchangeSpec.js`). Aquí vive SÓLO lo que la Bóveda no tiene:
//
//   ExchangeReconciliation  la conciliación de UNA operación (un lote o un
//                           desembolso suelto, `operationKey`): estado, datos
//                           de la operación bancaria (enviado, recibido,
//                           monedas, tasa REGISTRADA y su fuente, comisión,
//                           referencia, fecha), quién concilió y cuándo, y una
//                           versión para no pisar el cambio de otro (409).
//   ExchangeDocument        soportes adicionales de una operación (comprobante
//                           de recepción, extracto). S3 PRIVADO, validado por
//                           sus bytes. Inmutable: no hay DELETE; se retira con
//                           motivo y queda en el historial.
//   ExchangeEvent           el historial: cada acción con actor, estado
//                           anterior y nuevo, referencia y carga (antes/después).
//   ExchangeConfig          las cuentas de origen y destino por EDICIÓN (nada
//                           escrito en el código) y su bitácora.
//   ExchangeAccessGrant     los accesos de CONSULTA por edición (el
//                           administrador del evento): ligados al usuario,
//                           revocables, con quién los dio y quién los quitó.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): el atajo sólo
// salta el DDL si todas las columnas listadas existen. Lo fija la prueba.
export const OWNED_COLUMNS = {
    ExchangeReconciliation: [],
    ExchangeDocument: [],
    ExchangeEvent: [],
    ExchangeConfig: [],
    ExchangeAccessGrant: [],
};
export const OWNED_TABLES = Object.keys(OWNED_COLUMNS);

// ⚠️ UNA SOLA CREACIÓN EN CURSO (la lección de v4.1332): el resumen y la
// tabla piden a la vez, y dos CREATE simultáneos chocan en Postgres.
let _pending = null;
export function ensureExchangeSchema() {
    if (_ready) return Promise.resolve();
    if (!_pending) {
        _pending = createSchema()
            .catch(err => (/already exists|pg_type_typname_nsp_index|duplicate key/i.test(String(err?.message)) ? createSchema() : Promise.reject(err)))
            .finally(() => { _pending = null; });
    }
    return _pending;
}

async function createSchema() {
    if (_ready) return;
    const columnas = Object.entries(OWNED_COLUMNS).flatMap(([t, cols]) => cols.map(c => `${t}.${c}`));
    const { rows } = await db.query(
        `SELECT (SELECT COUNT(*) FROM unnest($1::text[]) AS t(name) WHERE to_regclass('public."' || t.name || '"') IS NOT NULL)::int AS tablas,
                (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_name || '.' || column_name = ANY($2))::int AS columnas`,
        [OWNED_TABLES, columnas]
    );
    if (rows[0]?.tablas === OWNED_TABLES.length && rows[0]?.columnas === columnas.length) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ExchangeReconciliation" (
            "operationKey"     TEXT PRIMARY KEY,
            "eventId"          TEXT,
            status             TEXT NOT NULL DEFAULT 'en_conciliacion',
            "sentAmount"       DOUBLE PRECISION,
            "sentCurrency"     TEXT,
            "receivedAmount"   DOUBLE PRECISION,
            "receivedCurrency" TEXT,
            "exchangeRate"     DOUBLE PRECISION,
            "rateSource"       TEXT,
            "feeAmount"        DOUBLE PRECISION,
            "feeCurrency"      TEXT,
            "bankReference"    TEXT,
            "transferDate"     TIMESTAMPTZ,
            notes              TEXT,
            "originAccount"    JSONB,
            "destinationAccount" JSONB,
            "reconciledAt"     TIMESTAMPTZ,
            "reconciledBy"     TEXT,
            "reconciledByName" TEXT,
            "statusNote"       TEXT,
            version            INTEGER NOT NULL DEFAULT 1,
            "createdBy"        TEXT,
            "createdByName"    TEXT,
            "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedBy"        TEXT,
            "updatedByName"    TEXT,
            "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "ExchangeReconciliation_event_idx" ON "ExchangeReconciliation"("eventId", status);

        CREATE TABLE IF NOT EXISTS "ExchangeDocument" (
            id             TEXT PRIMARY KEY,
            "operationKey" TEXT NOT NULL,
            "eventId"      TEXT,
            kind           TEXT NOT NULL DEFAULT 'otro',
            "storageKey"   TEXT NOT NULL,
            "fileName"     TEXT NOT NULL,
            mime           TEXT NOT NULL,
            bytes          INTEGER NOT NULL,
            note           TEXT,
            "uploadedBy"   TEXT,
            "uploadedByName" TEXT,
            "uploadedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "retiredAt"    TIMESTAMPTZ,
            "retiredBy"    TEXT,
            "retiredReason" TEXT
        );
        CREATE INDEX IF NOT EXISTS "ExchangeDocument_op_idx" ON "ExchangeDocument"("operationKey", "uploadedAt");
        CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeDocument_key_uniq" ON "ExchangeDocument"("storageKey");

        CREATE TABLE IF NOT EXISTS "ExchangeEvent" (
            id             TEXT PRIMARY KEY,
            "eventId"      TEXT,
            "operationKey" TEXT,
            "submissionId" TEXT,
            action         TEXT NOT NULL,
            "fromState"    TEXT,
            "toState"      TEXT,
            reference      TEXT,
            "actorId"      TEXT,
            "actorName"    TEXT,
            "actorRole"    TEXT,
            payload        JSONB,
            "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "ExchangeEvent_op_idx" ON "ExchangeEvent"("operationKey", "createdAt");
        CREATE INDEX IF NOT EXISTS "ExchangeEvent_sub_idx" ON "ExchangeEvent"("submissionId", "createdAt");
        CREATE INDEX IF NOT EXISTS "ExchangeEvent_event_idx" ON "ExchangeEvent"("eventId", "createdAt" DESC);

        CREATE TABLE IF NOT EXISTS "ExchangeConfig" (
            "eventId"            TEXT PRIMARY KEY,
            "originAccount"      JSONB,
            "destinationAccount" JSONB,
            "maxReceiptMb"       INTEGER,
            history              JSONB NOT NULL DEFAULT '[]'::jsonb,
            "updatedBy"          TEXT,
            "updatedByName"      TEXT,
            "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS "ExchangeAccessGrant" (
            id              TEXT PRIMARY KEY,
            "eventId"       TEXT NOT NULL,
            "userId"        TEXT,
            email           TEXT NOT NULL,
            "canDownload"   BOOLEAN NOT NULL DEFAULT TRUE,
            note            TEXT,
            source          TEXT NOT NULL DEFAULT 'panel',
            "grantedBy"     TEXT,
            "grantedByName" TEXT,
            "grantedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "revokedAt"     TIMESTAMPTZ,
            "revokedBy"     TEXT,
            "revokedByName" TEXT,
            "revokedReason" TEXT,
            "lastUsedAt"    TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS "ExchangeAccessGrant_event_idx" ON "ExchangeAccessGrant"("eventId");
        CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeAccessGrant_active_uniq"
            ON "ExchangeAccessGrant"("eventId", lower(email)) WHERE "revokedAt" IS NULL;
    `);
    _ready = true;
}

export default ensureExchangeSchema;
