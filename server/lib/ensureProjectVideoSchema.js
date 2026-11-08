// ════════════════════════════════════════════════════════════════════════════
// Videos de proyectos (video PROPIO del club) — el esquema, en runtime (v4.1298.0)
//
// CINCO tablas fuera de Prisma, independientes de las del Video Pitch:
//
//   ProjectVideo              un video por postulación (varios si la configuración
//                             lo permite): ficha, estado de revisión, versión
//                             vigente, consentimiento aceptado (texto y versión).
//   ProjectVideoVersion       cada archivo que ocupó ese lugar. INMUTABLE: un
//                             reemplazo agrega una fila; la anterior se conserva.
//   ProjectVideoEvent         quién hizo qué y cuándo (cambios de estado,
//                             observaciones, versiones, consentimiento).
//   ProjectVideoNotification  qué aviso salió por qué cambio: evita duplicados.
//   ProjectVideoConfig        la configuración administrable por edición
//                             (formatos, topes, recomendaciones, política, texto
//                             de autorización), o la global.
//
// Sin claves foráneas, por la regla de siempre. Están en la lista del guardián
// de `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908). Lo fija
// `npm run test:project-videos`.
export const OWNED_COLUMNS = {
    ProjectVideo: [],
    ProjectVideoVersion: [],
    ProjectVideoEvent: [],
    ProjectVideoNotification: [],
    ProjectVideoConfig: [],
};
const TABLES = Object.keys(OWNED_COLUMNS);

export async function ensureProjectVideoSchema() {
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
        CREATE TABLE IF NOT EXISTS "ProjectVideo" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "accountId" TEXT,
            "eventId" TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            title TEXT,
            description TEXT,
            language TEXT,
            "productionYear" INT,
            notes TEXT,
            "currentVersionId" TEXT,
            "consentAccepted" BOOLEAN NOT NULL DEFAULT FALSE,
            "consentVersion" TEXT,
            "consentText" TEXT,
            "consentAt" TIMESTAMPTZ,
            "reviewNote" TEXT,
            "adminNotes" TEXT,
            "submittedAt" TIMESTAMPTZ,
            "reviewedAt" TIMESTAMPTZ,
            "approvedAt" TIMESTAMPTZ,
            "lastEditedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectVideo_submission_idx" ON "ProjectVideo" ("submissionId", "createdAt")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectVideo_event_status_idx" ON "ProjectVideo" ("eventId", status, "updatedAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectVideoVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "videoId" TEXT NOT NULL,
            "versionNumber" INT NOT NULL,
            "storageKey" TEXT NOT NULL,
            "fileName" TEXT NOT NULL,
            format TEXT NOT NULL,
            "contentType" TEXT NOT NULL,
            "sizeBytes" BIGINT NOT NULL,
            width INT,
            height INT,
            "durationSec" NUMERIC(10,2),
            warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
            "processingStatus" TEXT NOT NULL DEFAULT 'ready',
            "uploadedById" TEXT,
            "uploadedByName" TEXT,
            "uploadedByRole" TEXT,
            "retiredAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectVideoVersion_number_key" ON "ProjectVideoVersion" ("videoId", "versionNumber")`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectVideoVersion_storage_key" ON "ProjectVideoVersion" ("storageKey")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectVideoEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "videoId" TEXT NOT NULL,
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
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectVideoEvent_video_idx" ON "ProjectVideoEvent" ("videoId", "createdAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectVideoNotification" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "videoId" TEXT NOT NULL,
            kind TEXT NOT NULL,
            "dedupeKey" TEXT NOT NULL,
            recipient TEXT,
            status TEXT NOT NULL DEFAULT 'sent',
            error TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectVideoNotification_dedupe_key" ON "ProjectVideoNotification" ("videoId", "dedupeKey")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectVideoConfig" (
            scope TEXT PRIMARY KEY,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedBy" TEXT
        )
    `);
    _ready = true;
}

export default ensureProjectVideoSchema;
