// ════════════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — el esquema, en runtime (v4.1293.0)
//
// CINCO tablas fuera de Prisma:
//
//   VideoPitchRequest       una solicitud por postulación: número, estado,
//                           respuestas del formulario (JSONB), responsable de
//                           producción, guion aprobado y video entregado.
//   VideoPitchFile          cada archivo (material del club, video final o
//                           miniatura). Las dimensiones las declara el navegador.
//   VideoPitchScript        cada VERSIÓN de guion: inmutable una vez guardada;
//                           la vigente la señala la solicitud.
//   VideoPitchEvent         el historial completo: quién hizo qué y cuándo.
//   VideoPitchNotification  qué aviso salió por qué cambio: evita duplicados.
//
// Y la capa COMERCIAL (v4.1296), separada de la producción:
//
//   VideoPitchPlan          el catálogo que vende el comité, editable desde el
//                           panel. El precio NUNCA viene del navegador.
//   VideoPitchPlanVersion   cada cambio de precio o características es una
//                           versión INMUTABLE; las órdenes apuntan a la suya.
//   VideoPitchOrder         la fotografía de una compra (plan, versión, importe,
//                           moneda) y su recorrido en Stripe. Una solicitud
//                           puede tener varias (cambios de plan), una vigente.
//   VideoPitchStripeEvent   cada evento de Stripe ya aplicado (idempotencia).
//   VideoPitchUploadIntent  cada URL prefirmada que se emitió: lo que nunca se
//                           registró es un huérfano que la limpieza puede borrar.
//
// Sin claves foráneas, por la regla de siempre: ninguna tabla existente gana
// una columna ni una restricción por esto. Están en la lista del guardián de
// `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía una tabla que ya existe, así que con el atajo
// mirando sólo las tablas un ALTER nuevo no correría NUNCA en producción. Lo
// fija `npm run test:video-pitch`, que recorre los ADD COLUMN del archivo.
export const OWNED_COLUMNS = {
    // v4.1296 — la capa comercial sobre la solicitud: estado comercial
    // derivado, plan y orden vigentes, pago, exoneración administrativa.
    VideoPitchRequest: ['commercialStatus', 'planId', 'currentOrderId', 'paidAt', 'paymentWaived', 'paymentWaivedBy', 'paymentWaivedNote', 'paymentWaivedAt'],
    VideoPitchFile: [],
    VideoPitchScript: [],
    VideoPitchEvent: [],
    VideoPitchNotification: [],
    VideoPitchPlan: [],
    VideoPitchPlanVersion: [],
    VideoPitchOrder: [],
    VideoPitchStripeEvent: [],
    VideoPitchUploadIntent: [],
};

const TABLES = Object.keys(OWNED_COLUMNS);

export async function ensureVideoPitchSchema() {
    if (_ready) return;
    const columnas = Object.entries(OWNED_COLUMNS).flatMap(([t, cols]) => cols.map(c => `${t}.${c}`));
    const { rows } = await db.query(
        `SELECT (SELECT COUNT(*) FROM unnest($1::text[]) AS t(name) WHERE to_regclass('public."' || t.name || '"') IS NOT NULL)::int AS tablas,
                (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_name || '.' || column_name = ANY($2))::int AS columnas`,
        [TABLES, columnas]
    );
    if (rows[0]?.tablas === TABLES.length && rows[0]?.columnas === columnas.length) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchRequest" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            number TEXT,
            "submissionId" TEXT NOT NULL,
            "accountId" TEXT,
            "eventId" TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            answers JSONB NOT NULL DEFAULT '{}'::jsonb,
            "completionPct" INT NOT NULL DEFAULT 0,
            "assigneeId" TEXT,
            "assigneeName" TEXT,
            "currentScriptId" TEXT,
            "approvedScriptId" TEXT,
            "deliverableFileId" TEXT,
            "thumbnailFileId" TEXT,
            "infoRequest" TEXT,
            "adminNotes" TEXT,
            "submittedAt" TIMESTAMPTZ,
            "deliveredAt" TIMESTAMPTZ,
            "lastEditedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchRequest_submission_key" ON "VideoPitchRequest" ("submissionId")`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchRequest_number_key" ON "VideoPitchRequest" (number) WHERE number IS NOT NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS "VideoPitchRequest_event_status_idx" ON "VideoPitchRequest" ("eventId", status, "updatedAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchFile" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "requestId" TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'material',
            kind TEXT NOT NULL,
            "storageKey" TEXT NOT NULL,
            "fileName" TEXT NOT NULL,
            "contentType" TEXT NOT NULL,
            "sizeBytes" BIGINT NOT NULL,
            width INT,
            height INT,
            "durationSec" NUMERIC(10,2),
            warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
            caption TEXT,
            "uploadedById" TEXT,
            "uploadedByName" TEXT,
            "uploadedByRole" TEXT,
            "deletedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchFile_storage_key" ON "VideoPitchFile" ("storageKey")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "VideoPitchFile_request_idx" ON "VideoPitchFile" ("requestId", role, "createdAt")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchScript" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "requestId" TEXT NOT NULL,
            "versionNumber" INT NOT NULL,
            source TEXT NOT NULL DEFAULT 'ai',
            status TEXT NOT NULL DEFAULT 'draft',
            language TEXT,
            tone TEXT,
            "targetSeconds" INT,
            instructions TEXT,
            content JSONB NOT NULL DEFAULT '{}'::jsonb,
            provider TEXT,
            model TEXT,
            "basedOnId" TEXT,
            "createdById" TEXT,
            "createdByName" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchScript_version_key" ON "VideoPitchScript" ("requestId", "versionNumber")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "requestId" TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT,
            detail TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            "actorId" TEXT,
            "actorName" TEXT,
            "actorRole" TEXT,
            visibility TEXT NOT NULL DEFAULT 'all',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "VideoPitchEvent_request_idx" ON "VideoPitchEvent" ("requestId", "createdAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchNotification" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "requestId" TEXT NOT NULL,
            kind TEXT NOT NULL,
            "dedupeKey" TEXT NOT NULL,
            channel TEXT NOT NULL DEFAULT 'email',
            recipient TEXT,
            status TEXT NOT NULL DEFAULT 'sent',
            error TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchNotification_dedupe_key" ON "VideoPitchNotification" ("requestId", "dedupeKey")`);

    // ── v4.1296 — Capa comercial ─────────────────────────────────────
    const addColumn = async (sql) => { await db.query(sql).catch(() => {}); };
    await addColumn(`ALTER TABLE "VideoPitchRequest" ADD COLUMN IF NOT EXISTS "commercialStatus" TEXT NOT NULL DEFAULT 'no_plan'`);
    await addColumn(`ALTER TABLE "VideoPitchRequest" ADD COLUMN IF NOT EXISTS "planId" TEXT`);
    await addColumn(`ALTER TABLE "VideoPitchRequest" ADD COLUMN IF NOT EXISTS "currentOrderId" TEXT`);
    await addColumn(`ALTER TABLE "VideoPitchRequest" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ`);
    await addColumn(`ALTER TABLE "VideoPitchRequest" ADD COLUMN IF NOT EXISTS "paymentWaived" BOOLEAN NOT NULL DEFAULT FALSE`);
    await addColumn(`ALTER TABLE "VideoPitchRequest" ADD COLUMN IF NOT EXISTS "paymentWaivedBy" TEXT`);
    await addColumn(`ALTER TABLE "VideoPitchRequest" ADD COLUMN IF NOT EXISTS "paymentWaivedNote" TEXT`);
    await addColumn(`ALTER TABLE "VideoPitchRequest" ADD COLUMN IF NOT EXISTS "paymentWaivedAt" TIMESTAMPTZ`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchPlan" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            badge TEXT,
            "priceAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'USD',
            features JSONB NOT NULL DEFAULT '[]'::jsonb,
            deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
            "maxDurationSec" INT NOT NULL DEFAULT 180,
            "revisionRounds" INT NOT NULL DEFAULT 3,
            "sortOrder" INT NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            "currentVersionId" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedBy" TEXT
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchPlan_code_key" ON "VideoPitchPlan" (code)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchPlanVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "planId" TEXT NOT NULL,
            "versionNumber" INT NOT NULL,
            snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "createdById" TEXT,
            "createdByName" TEXT
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchPlanVersion_number_key" ON "VideoPitchPlanVersion" ("planId", "versionNumber")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchOrder" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "requestId" TEXT NOT NULL,
            "submissionId" TEXT NOT NULL,
            "planId" TEXT NOT NULL,
            "planVersionId" TEXT,
            "planCode" TEXT,
            "planName" TEXT,
            snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            amount NUMERIC(14,2) NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending_payment',
            "stripeSessionId" TEXT,
            "stripePaymentIntentId" TEXT,
            "stripeChargeId" TEXT,
            "receiptUrl" TEXT,
            "paidAt" TIMESTAMPTZ,
            "failureCode" TEXT,
            "failureMessage" TEXT,
            "refundedAmount" NUMERIC(14,2),
            "refundedAt" TIMESTAMPTZ,
            "cancelledAt" TIMESTAMPTZ,
            "cancelReason" TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "VideoPitchOrder_request_idx" ON "VideoPitchOrder" ("requestId", "createdAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "VideoPitchOrder_session_idx" ON "VideoPitchOrder" ("stripeSessionId")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "VideoPitchOrder_intent_idx" ON "VideoPitchOrder" ("stripePaymentIntentId")`);
    // Una sola orden ABIERTA por solicitud: la carrera de dos clics la pierde el índice, no el cliente.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchOrder_open_key" ON "VideoPitchOrder" ("requestId") WHERE status IN ('pending_payment', 'processing', 'failed')`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchStripeEvent" (
            "stripeEventId" TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            "orderId" TEXT,
            "objectId" TEXT,
            payload JSONB,
            "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoPitchUploadIntent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "requestId" TEXT NOT NULL,
            "storageKey" TEXT NOT NULL,
            role TEXT NOT NULL,
            "fileName" TEXT,
            "declaredBytes" BIGINT,
            registered BOOLEAN NOT NULL DEFAULT FALSE,
            "cleanedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoPitchUploadIntent_key" ON "VideoPitchUploadIntent" ("storageKey")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "VideoPitchUploadIntent_pending_idx" ON "VideoPitchUploadIntent" ("createdAt") WHERE registered = FALSE AND "cleanedAt" IS NULL`);
    _ready = true;
}

export default ensureVideoPitchSchema;
