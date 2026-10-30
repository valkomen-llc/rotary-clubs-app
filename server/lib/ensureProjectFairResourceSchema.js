// ════════════════════════════════════════════════════════════════════════════
// Recursos del proyecto (plantilla de presentación) — el esquema, en runtime
// (v4.1264.0)
//
// CUATRO tablas fuera de Prisma:
//
//   ProjectFairResource          el recurso de una edición: título, texto,
//                                publicado o no, tope de tamaño y la versión
//                                vigente (`currentVersionId`).
//   ProjectFairResourceVersion   cada archivo que se publicó. INMUTABLE: un
//                                reemplazo agrega una fila, nunca pisa otra, y
//                                el objeto de S3 de una versión vieja no se borra.
//   ProjectFairResourceDownload  una fila por SOLICITUD de descarga, con su
//                                desenlace (requested → delivered | failed) y la
//                                versión entregada. Los datos de la persona NO se
//                                copian: salen de `submissionId` y `accountId`.
//   ProjectFairResourceEvent     el historial administrativo del recurso (subir,
//                                publicar, desactivar, editar el texto).
//
// Sin claves foráneas, por la regla de siempre: ninguna tabla existente gana una
// columna ni una restricción por esto. Están en la lista del guardián de
// `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía una tabla que ya existe, así que con el atajo
// mirando sólo las tablas un ALTER nuevo no correría NUNCA en producción. Lo
// fija `npm run test:fair:resources`, que recorre los ADD COLUMN del archivo.
export const OWNED_COLUMNS = {
    ProjectFairResource: [],
    ProjectFairResourceVersion: [],
    ProjectFairResourceDownload: [],
    ProjectFairResourceEvent: [],
};

const TABLES = Object.keys(OWNED_COLUMNS);

export async function ensureProjectFairResourceSchema() {
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
        CREATE TABLE IF NOT EXISTS "ProjectFairResource" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            scope TEXT NOT NULL,
            key TEXT NOT NULL,
            title TEXT,
            description TEXT,
            active BOOLEAN NOT NULL DEFAULT FALSE,
            "maxSizeMb" INT NOT NULL DEFAULT 50,
            "currentVersionId" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedBy" TEXT
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairResource_scope_key" ON "ProjectFairResource" (scope, key)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairResourceVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "resourceId" TEXT NOT NULL,
            "versionNumber" INT NOT NULL,
            "storageKey" TEXT NOT NULL,
            "fileName" TEXT NOT NULL,
            "contentType" TEXT NOT NULL,
            format TEXT NOT NULL,
            "sizeBytes" BIGINT NOT NULL,
            note TEXT,
            "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "publishedById" TEXT,
            "publishedByName" TEXT
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairResourceVersion_number_key" ON "ProjectFairResourceVersion" ("resourceId", "versionNumber")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairResourceDownload" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "resourceId" TEXT NOT NULL,
            "versionId" TEXT,
            "versionNumber" INT,
            scope TEXT NOT NULL,
            "submissionId" TEXT NOT NULL,
            "accountId" TEXT,
            status TEXT NOT NULL DEFAULT 'requested',
            "errorCode" TEXT,
            "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "deliveredAt" TIMESTAMPTZ,
            "auditEventId" TEXT
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairResourceDownload_resource_idx" ON "ProjectFairResourceDownload" ("resourceId", status, "submissionId")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairResourceDownload_submission_idx" ON "ProjectFairResourceDownload" ("submissionId", "requestedAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairResourceEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "resourceId" TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT,
            detail TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            "actorId" TEXT,
            "actorName" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairResourceEvent_resource_idx" ON "ProjectFairResourceEvent" ("resourceId", "createdAt" DESC)`);
    _ready = true;
}

export default ensureProjectFairResourceSchema;
