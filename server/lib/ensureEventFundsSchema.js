// ════════════════════════════════════════════════════════════════════════════
// Las tablas de la conciliación de inscripciones y traslados de un evento —
// v4.1250. Viven FUERA de Prisma (como todo el registro de eventos) y están en
// la lista que protege `db-push-guard.mjs` / CLAUDE.md.
//
//   EventFundsConfig      — el beneficiario del evento (Concorrotarios u otro)
//                           y sus responsables autorizados. Uno por evento.
//   EventFundsTransfer    — UNA operación de traslado (individual o
//                           consolidada), con su estado.
//   EventFundsAllocation  — qué inscripción cubre ese traslado y por cuánto.
//   EventFundsDocument    — los comprobantes PDF (privados, versionados).
//   EventFundsNotice      — cada envío por correo de un comprobante.
//   EventFundsHistory     — el historial auditable de todo lo anterior.
//   EventStripeCheck      — lo verificado contra Stripe de cada pago.
//
// ⚠️ NINGUNA de estas tablas referencia `Payment`, `Disbursement` ni nada de la
// Bóveda de Fondos: los eventos son un dominio financiero propio.
// ⚠️ Todo `ADD COLUMN` futuro va también en `alreadyApplied` (regla del sitio).
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;
let _promise = null;

export const EVENT_FUNDS_TABLES = [
    'EventFundsConfig', 'EventFundsTransfer', 'EventFundsAllocation',
    'EventFundsDocument', 'EventFundsNotice', 'EventFundsHistory', 'EventStripeCheck',
];

const alreadyApplied = async () => {
    try {
        const { rows } = await db.query(
            `SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = ANY($1)`, [EVENT_FUNDS_TABLES]);
        return rows.length === EVENT_FUNDS_TABLES.length;
    } catch (e) {
        console.warn('[eventFundsSchema] no pude comprobar el catálogo:', e?.message);
        return false;
    }
};

const SQL = [
    `CREATE TABLE IF NOT EXISTS "EventFundsConfig" (
        "eventId" TEXT PRIMARY KEY,
        "clubId" TEXT,
        "beneficiaryName" VARCHAR(200),
        "bankName" VARCHAR(160),
        "accountNumber" VARCHAR(80),
        "accountType" VARCHAR(60),
        "accountCurrency" VARCHAR(3),
        "beneficiaryTaxId" VARCHAR(60),
        notes TEXT,
        recipients JSONB NOT NULL DEFAULT '[]',
        "updatedBy" TEXT,
        "updatedByName" VARCHAR(200),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS "EventFundsTransfer" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "eventId" TEXT NOT NULL,
        "clubId" TEXT,
        kind VARCHAR(20) NOT NULL DEFAULT 'individual',
        "beneficiaryName" VARCHAR(200),
        currency VARCHAR(3) NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        "transferDate" DATE,
        reference VARCHAR(160),
        method VARCHAR(40),
        notes TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'pendiente',
        "statusReason" TEXT,
        "createdBy" TEXT,
        "createdByName" VARCHAR(200),
        "confirmedBy" TEXT,
        "confirmedByName" VARCHAR(200),
        "confirmedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS "EventFundsTransfer_event_idx" ON "EventFundsTransfer" ("eventId")`,
    `CREATE TABLE IF NOT EXISTS "EventFundsAllocation" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "transferId" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "registrationId" TEXT NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE ("transferId", "registrationId")
    )`,
    `CREATE INDEX IF NOT EXISTS "EventFundsAllocation_reg_idx" ON "EventFundsAllocation" ("registrationId")`,
    `CREATE INDEX IF NOT EXISTS "EventFundsAllocation_event_idx" ON "EventFundsAllocation" ("eventId")`,
    `CREATE TABLE IF NOT EXISTS "EventFundsDocument" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "transferId" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "s3Key" TEXT NOT NULL,
        "fileName" VARCHAR(200),
        mime VARCHAR(80),
        bytes INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        "isCurrent" BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        "uploadedBy" TEXT,
        "uploadedByName" VARCHAR(200),
        "uploadedAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS "EventFundsDocument_transfer_idx" ON "EventFundsDocument" ("transferId")`,
    `CREATE TABLE IF NOT EXISTS "EventFundsNotice" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "transferId" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "operationKey" VARCHAR(80) NOT NULL DEFAULT '',
        recipients JSONB NOT NULL DEFAULT '[]',
        cc JSONB NOT NULL DEFAULT '[]',
        subject TEXT,
        body TEXT,
        "documentId" TEXT,
        state VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        "providerMessageId" TEXT,
        error TEXT,
        "sentBy" TEXT,
        "sentByName" VARCHAR(200),
        "sentAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
    // Idempotencia por operación: un doble clic cae en el mismo envío. Parcial:
    // un envío sin clave no choca con otro (el ON CONFLICT repite el predicado).
    `CREATE UNIQUE INDEX IF NOT EXISTS "EventFundsNotice_operation_key"
        ON "EventFundsNotice" ("transferId", "operationKey") WHERE "operationKey" <> ''`,
    `CREATE TABLE IF NOT EXISTS "EventFundsHistory" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "eventId" TEXT NOT NULL,
        "transferId" TEXT,
        "registrationId" TEXT,
        kind VARCHAR(40) NOT NULL,
        "fromState" VARCHAR(30),
        "toState" VARCHAR(30),
        "actorId" TEXT,
        "actorName" VARCHAR(200),
        reference VARCHAR(160),
        "documentId" TEXT,
        note TEXT,
        "occurredAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS "EventFundsHistory_event_idx" ON "EventFundsHistory" ("eventId")`,
    `CREATE TABLE IF NOT EXISTS "EventStripeCheck" (
        "registrationId" TEXT PRIMARY KEY,
        "eventId" TEXT NOT NULL,
        "paymentIntentId" TEXT,
        "chargeId" TEXT,
        "balanceTxId" TEXT,
        status VARCHAR(30),
        gross NUMERIC(14,2),
        fee NUMERIC(14,2),
        net NUMERIC(14,2),
        currency VARCHAR(3),
        "availableOn" TIMESTAMPTZ,
        error TEXT,
        "checkedAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
];

export const ensureEventFundsSchema = async () => {
    if (_ready) return;
    if (_promise) return _promise;
    _promise = (async () => {
        try {
            if (await alreadyApplied()) { _ready = true; return; }
            for (const sql of SQL) await db.query(sql);
            _ready = true;
        } finally {
            _promise = null;
        }
    })();
    return _promise;
};

export default ensureEventFundsSchema;
