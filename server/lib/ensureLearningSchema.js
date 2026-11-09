// ════════════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones (LMS) — el esquema, en runtime (v4.1302.0)
//
// NUEVE tablas fuera de Prisma (`CREATE TABLE IF NOT EXISTS`, sin FK):
//
//   LearningCollection    una colección de cursos de un club (o del distrito),
//                         asociada a un proyecto o programa.
//   LearningCourse        cada curso: ficha, portada, acceso, estado de
//                         revisión, orden dentro de la colección.
//   LearningModule        los módulos de un curso (opcionales).
//   LearningLesson        las lecciones: video, texto, audio, duración, orden.
//   LearningResource      recursos complementarios (archivo o enlace) del
//                         curso o de una lección.
//   LearningFile          cada objeto subido: clave en S3, estado de la carga
//                         (multiparte reanudable), tipo real, peso real.
//   LearningEvent         quién hizo qué y cuándo (trazabilidad).
//   LearningNotification  qué aviso salió por qué cambio: evita duplicados.
//   LearningConfig        la configuración administrable (global o por sitio).
//
// Fase 2 (inscripción y progreso por estudiante) y Fase 3 (evaluaciones y
// certificados) se modelan en `docs/claude/cursos-y-capacitaciones.md` y NO
// se crean hasta implementarse: una tabla vacía promete una función.
//
// Están en la lista del guardián de `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908). Lo fija
// `npm run test:learning`.
export const OWNED_COLUMNS = {
    LearningCollection: [],
    LearningCourse: [],
    LearningModule: [],
    LearningLesson: [],
    LearningResource: [],
    LearningFile: [],
    LearningEvent: [],
    LearningNotification: [],
    LearningConfig: [],
};
const TABLES = Object.keys(OWNED_COLUMNS);

export async function ensureLearningSchema() {
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
        CREATE TABLE IF NOT EXISTS "LearningCollection" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "siteId" TEXT NOT NULL,
            "ownerClubId" TEXT,
            "ownerClubName" TEXT,
            "districtNumber" TEXT,
            "districtId" TEXT,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            "projectRef" TEXT,
            "projectFairSubmissionId" TEXT,
            "areaFocus" TEXT,
            audience TEXT[] NOT NULL DEFAULT '{}',
            "coverUrl" TEXT,
            "accessMode" TEXT NOT NULL DEFAULT 'public',
            "inviteToken" TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            "createdById" TEXT,
            "createdByName" TEXT,
            "lastEditedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningCollection_site_idx" ON "LearningCollection" ("siteId", status, "updatedAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningCollection_district_idx" ON "LearningCollection" ("districtNumber", status)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "LearningCourse" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "collectionId" TEXT,
            "siteId" TEXT NOT NULL,
            "ownerClubId" TEXT,
            "ownerClubName" TEXT,
            "districtNumber" TEXT,
            "districtId" TEXT,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL DEFAULT '',
            subtitle TEXT,
            "shortDescription" TEXT,
            "fullDescription" TEXT,
            "learningObjective" TEXT,
            audience TEXT[] NOT NULL DEFAULT '{}',
            level TEXT,
            language TEXT NOT NULL DEFAULT 'es',
            "durationMinutes" INT,
            "durationAuto" BOOLEAN NOT NULL DEFAULT TRUE,
            "instructorName" TEXT,
            "instructorBio" TEXT,
            "instructorImageUrl" TEXT,
            organization TEXT,
            "projectRef" TEXT,
            tags TEXT[] NOT NULL DEFAULT '{}',
            "areaFocus" TEXT,
            "coverUrl" TEXT,
            "thumbnailUrl" TEXT,
            "introVideoFileId" TEXT,
            "introVideoUrl" TEXT,
            "accessMode" TEXT NOT NULL DEFAULT 'public',
            "inviteToken" TEXT,
            features JSONB NOT NULL DEFAULT '{}'::jsonb,
            "rightsAccepted" BOOLEAN NOT NULL DEFAULT FALSE,
            "rightsText" TEXT,
            "rightsAt" TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'draft',
            "sortOrder" INT NOT NULL DEFAULT 0,
            "reviewNote" TEXT,
            "adminNotes" TEXT,
            "submittedAt" TIMESTAMPTZ,
            "reviewedAt" TIMESTAMPTZ,
            "reviewedById" TEXT,
            "approvedAt" TIMESTAMPTZ,
            "publishedAt" TIMESTAMPTZ,
            "publishedById" TEXT,
            "viewCount" INT NOT NULL DEFAULT 0,
            "createdById" TEXT,
            "createdByName" TEXT,
            "lastEditedAt" TIMESTAMPTZ,
            "lastEditedById" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningCourse_collection_idx" ON "LearningCourse" ("collectionId", "sortOrder", "createdAt")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningCourse_site_status_idx" ON "LearningCourse" ("siteId", status, "updatedAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningCourse_district_status_idx" ON "LearningCourse" ("districtNumber", status, "publishedAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "LearningModule" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "courseId" TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            description TEXT,
            "sortOrder" INT NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningModule_course_idx" ON "LearningModule" ("courseId", "sortOrder")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "LearningLesson" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "courseId" TEXT NOT NULL,
            "moduleId" TEXT,
            title TEXT NOT NULL DEFAULT '',
            description TEXT,
            body TEXT,
            "videoFileId" TEXT,
            "videoUrl" TEXT,
            "audioFileId" TEXT,
            "durationMinutes" INT,
            "sortOrder" INT NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningLesson_course_idx" ON "LearningLesson" ("courseId", "moduleId", "sortOrder")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "LearningResource" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "courseId" TEXT NOT NULL,
            "lessonId" TEXT,
            kind TEXT NOT NULL DEFAULT 'file',
            "fileId" TEXT,
            url TEXT,
            title TEXT NOT NULL DEFAULT '',
            description TEXT,
            "sortOrder" INT NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningResource_course_idx" ON "LearningResource" ("courseId", "lessonId", "sortOrder")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "LearningFile" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "collectionId" TEXT,
            "courseId" TEXT,
            "siteId" TEXT,
            purpose TEXT NOT NULL,
            visibility TEXT NOT NULL DEFAULT 'private',
            "storageKey" TEXT NOT NULL,
            "publicUrl" TEXT,
            filename TEXT NOT NULL,
            "contentType" TEXT,
            bytes BIGINT NOT NULL DEFAULT 0,
            kind TEXT,
            format TEXT,
            "uploadId" TEXT,
            status TEXT NOT NULL DEFAULT 'uploading',
            "durationSeconds" INT,
            width INT,
            height INT,
            "uploadedById" TEXT,
            "readyAt" TIMESTAMPTZ,
            "deletedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningFile_course_idx" ON "LearningFile" ("courseId", status, "createdAt")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningFile_collection_idx" ON "LearningFile" ("collectionId", status)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "LearningEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "entityType" TEXT NOT NULL,
            "entityId" TEXT NOT NULL,
            "courseId" TEXT,
            "collectionId" TEXT,
            "siteId" TEXT,
            action TEXT NOT NULL,
            "actorId" TEXT,
            "actorName" TEXT,
            "actorRole" TEXT,
            visibility TEXT NOT NULL DEFAULT 'all',
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningEvent_entity_idx" ON "LearningEvent" ("entityType", "entityId", "createdAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "LearningEvent_course_idx" ON "LearningEvent" ("courseId", "createdAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "LearningNotification" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "entityType" TEXT NOT NULL,
            "entityId" TEXT NOT NULL,
            "dedupeKey" TEXT NOT NULL,
            channel TEXT NOT NULL DEFAULT 'email',
            recipients TEXT[] NOT NULL DEFAULT '{}',
            subject TEXT,
            sent BOOLEAN NOT NULL DEFAULT FALSE,
            reason TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("entityId", "dedupeKey")
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "LearningConfig" (
            scope TEXT PRIMARY KEY,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            "updatedById" TEXT,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    _ready = true;
}

export default { ensureLearningSchema, OWNED_COLUMNS };
