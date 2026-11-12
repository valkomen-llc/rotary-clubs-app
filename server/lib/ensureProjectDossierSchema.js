// ════════════════════════════════════════════════════════════════════════════
// Expediente integral del proyecto — el esquema, en runtime (v4.1324.0)
//
// SIETE tablas fuera de Prisma. NO se duplica la tabla de postulaciones ni las
// respuestas de los formularios: todo cuelga de `submissionId` + idioma + ruta
// del campo, así un idioma nuevo es una fila más, no una columna.
//
//   ProjectDossierTranslation          una por proyecto e idioma: si hay una
//                                      generación en curso, el último error y
//                                      la APROBACIÓN vigente (con la huella de
//                                      lo que se aprobó).
//   ProjectDossierTranslationField     una por proyecto, idioma y CAMPO: el
//                                      texto traducido, la huella del original
//                                      que se tradujo (así se sabe si quedó
//                                      desactualizado sin escribir nada), si lo
//                                      revisó una persona y sus avisos.
//   ProjectDossierTranslationVersion   cada versión APROBADA, inmutable: lo que
//                                      se aprobó no se pierde aunque después se
//                                      edite el original o la traducción.
//   ProjectDossierRevision             la bitácora campo a campo: valor
//                                      anterior, valor nuevo, quién, cuándo y
//                                      por qué (ediciones del original y de la
//                                      traducción).
//   ProjectDossierGlossary             equivalencias terminológicas aprobadas
//                                      por el comité (mandan sobre las de
//                                      fábrica de `projectDossier.js`).
//   ProjectDossierBooklet              cada versión de la libreta de
//                                      presentación por idioma (inmutable; la
//                                      vigente es la última).
//   ProjectDossierExport               quién descargó qué ficha, en qué idioma
//                                      y cuándo (incluye las descargas en lote).
//
// Sin claves foráneas, por la regla de siempre. Están en la lista del guardián
// de `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía una tabla que ya existe, así que con el atajo
// mirando sólo las tablas un ALTER nuevo no correría NUNCA en producción. Lo
// fija `npm run test:fair:dossier`, que recorre los ADD COLUMN del archivo.
export const OWNED_COLUMNS = {
    ProjectDossierTranslation: [],
    ProjectDossierTranslationField: [],
    ProjectDossierTranslationVersion: [],
    ProjectDossierRevision: [],
    ProjectDossierGlossary: [],
    ProjectDossierBooklet: [],
    ProjectDossierExport: [],
};

const TABLES = Object.keys(OWNED_COLUMNS);

export async function ensureProjectDossierSchema() {
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
        CREATE TABLE IF NOT EXISTS "ProjectDossierTranslation" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            lang TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            "startedAt" TIMESTAMPTZ,
            "finishedAt" TIMESTAMPTZ,
            "lastError" TEXT,
            provider TEXT,
            model TEXT,
            "approvedAt" TIMESTAMPTZ,
            "approvedBy" TEXT,
            "approvedFingerprint" TEXT,
            "approvedVersionId" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDossierTranslation_sub_lang" ON "ProjectDossierTranslation" ("submissionId", lang)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDossierTranslationField" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            lang TEXT NOT NULL,
            path TEXT NOT NULL,
            "sourceHash" TEXT NOT NULL,
            "sourceText" TEXT,
            text TEXT NOT NULL DEFAULT '',
            origin TEXT NOT NULL DEFAULT 'ai',
            reviewed BOOLEAN NOT NULL DEFAULT FALSE,
            "reviewedAt" TIMESTAMPTZ,
            "reviewedBy" TEXT,
            warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
            provider TEXT,
            model TEXT,
            "updatedBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDossierTranslationField_key" ON "ProjectDossierTranslationField" ("submissionId", lang, path)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDossierTranslationVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            lang TEXT NOT NULL,
            "versionNumber" INT NOT NULL,
            fields JSONB NOT NULL DEFAULT '{}'::jsonb,
            fingerprint TEXT NOT NULL,
            note TEXT,
            "approvedBy" TEXT,
            "approvedById" TEXT,
            "approvedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDossierTranslationVersion_num" ON "ProjectDossierTranslationVersion" ("submissionId", lang, "versionNumber")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDossierRevision" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            kind TEXT NOT NULL,
            lang TEXT,
            path TEXT NOT NULL,
            label TEXT,
            "before" JSONB,
            "after" JSONB,
            reason TEXT,
            "actorId" TEXT,
            "actorName" TEXT,
            "actorRole" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectDossierRevision_sub" ON "ProjectDossierRevision" ("submissionId", "createdAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDossierGlossary" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            lang TEXT NOT NULL DEFAULT 'en',
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'term',
            note TEXT,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            "createdBy" TEXT,
            "updatedBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDossierGlossary_term" ON "ProjectDossierGlossary" (lang, lower(source))`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDossierBooklet" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            lang TEXT NOT NULL,
            "versionNumber" INT NOT NULL,
            content JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'draft',
            "approvedAt" TIMESTAMPTZ,
            "approvedBy" TEXT,
            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDossierBooklet_num" ON "ProjectDossierBooklet" ("submissionId", lang, "versionNumber")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDossierExport" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
            kind TEXT NOT NULL,
            lang TEXT NOT NULL,
            mode TEXT,
            "eventId" TEXT,
            "actorId" TEXT,
            "actorName" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectDossierExport_created" ON "ProjectDossierExport" ("createdAt" DESC)`);

    _ready = true;
}

export default ensureProjectDossierSchema;
