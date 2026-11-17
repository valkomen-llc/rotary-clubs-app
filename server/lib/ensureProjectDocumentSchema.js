// ════════════════════════════════════════════════════════════════════
// Seguimiento documental de los proyectos — el esquema, en runtime (v4.1332.0)
//
// TRES tablas fuera de Prisma:
//
//   ProjectPresentationFile   cada archivo de presentación que el club entregó
//                             (PDF o PPTX, validado por sus bytes). INMUTABLE:
//                             reemplazar agrega una versión; la vigente es la de
//                             número mayor sin `retiredAt`.
//   ProjectDocumentReview     la revisión del comité por (proyecto, requisito):
//                             En revisión / Validado / Requiere corrección, con
//                             la HUELLA de lo revisado, y la aplicabilidad del
//                             requisito para ESE proyecto («No aplica»).
//   ProjectDocumentReminder   cada recordatorio de documentación: destinatario,
//                             proyectos, foto de lo pendiente, estado del envío,
//                             error e intentos. Es la prueba de qué se mandó.
//
// Sin claves foráneas, por la regla de siempre. Están en la lista del guardián
// de `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908). Lo fija
// `npm run test:fair:document-tracking`.
export const OWNED_COLUMNS = {
    ProjectPresentationFile: [],
    ProjectDocumentReview: [],
    ProjectDocumentReminder: [],
};
export const OWNED_TABLES = Object.keys(OWNED_COLUMNS);

// ⚠️ UNA SOLA CREACIÓN EN CURSO. La franja de indicadores y la tabla piden a
// la vez; dos `CREATE TABLE IF NOT EXISTS` simultáneos chocan en Postgres
// (`pg_type_typname_nsp_index`). Se comparte la promesa y, si aun así otro
// proceso ganó la carrera, se reintenta una vez (ya existe: no hace nada).
let _pending = null;
export function ensureProjectDocumentSchema() {
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
        CREATE TABLE IF NOT EXISTS "ProjectPresentationFile" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "eventId" TEXT,
            "versionNumber" INT NOT NULL,
            "storageKey" TEXT NOT NULL,
            "fileName" TEXT NOT NULL,
            format TEXT NOT NULL,
            "contentType" TEXT NOT NULL,
            "sizeBytes" BIGINT NOT NULL,
            note TEXT,
            "uploadedById" TEXT,
            "uploadedByName" TEXT,
            "uploadedByRole" TEXT,
            "retiredAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectPresentationFile_number_key" ON "ProjectPresentationFile" ("submissionId", "versionNumber")`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectPresentationFile_storage_key" ON "ProjectPresentationFile" ("storageKey")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDocumentReview" (
            "submissionId" TEXT NOT NULL,
            "requirementKey" TEXT NOT NULL,
            status TEXT,
            note TEXT,
            fingerprint TEXT,
            "reviewedById" TEXT,
            "reviewedBy" TEXT,
            "reviewedAt" TIMESTAMPTZ,
            applicability TEXT,
            "applicabilityReason" TEXT,
            "applicabilityBy" TEXT,
            "applicabilityAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY ("submissionId", "requirementKey")
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDocumentReminder" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "batchId" TEXT NOT NULL,
            "eventId" TEXT,
            recipient TEXT NOT NULL,
            "recipientName" TEXT,
            "submissionIds" TEXT[] NOT NULL DEFAULT '{}',
            subject TEXT,
            snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'queued',
            error TEXT,
            attempts INT NOT NULL DEFAULT 0,
            "dedupeKey" TEXT NOT NULL,
            "actorId" TEXT,
            "actorName" TEXT,
            "sentAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentReminder_dedupe_key" ON "ProjectDocumentReminder" ("dedupeKey")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectDocumentReminder_event_idx" ON "ProjectDocumentReminder" ("eventId", "createdAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectDocumentReminder_submissions_idx" ON "ProjectDocumentReminder" USING GIN ("submissionIds")`);

    _ready = true;
}

export default ensureProjectDocumentSchema;
