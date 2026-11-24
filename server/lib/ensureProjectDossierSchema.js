// ════════════════════════════════════════════════════════════════════════════
// Expediente integral del proyecto — el esquema, en runtime (v4.1324.0)
//
// OCHO tablas fuera de Prisma (siete de v4.1324 + la bitácora de v4.1356). NO se duplica la tabla de postulaciones ni las
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
//   ProjectDossierTranslationEvent     (v4.1356) la bitácora de la VERIFICACIÓN
//                                      por Cadres: verificaciones, pérdidas de
//                                      vigencia, revocaciones, asignaciones y
//                                      recordatorios, con estado anterior y
//                                      nuevo, huellas y campos afectados.
//
// v4.1356 — La verificación por Cadre NO es una tabla paralela: es la misma
// aprobación de `ProjectDossierTranslation` (approved*) con `approvalKind =
// 'verification'`, el rol de quien verificó y la asignación del Cadre; la
// versión inmutable guarda además cuántos campos se revisaron, la
// justificación de los avisos y la huella del original.
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
    // v4.1356 — Verificación por Cadres (aprobación reforzada), su vigencia,
    // su revocación y la asignación del Cadre responsable.
    ProjectDossierTranslation: [
        'approvalKind', 'approvedRole', 'approvedById',
        'invalidatedAt', 'invalidatedVersionId', 'invalidatedPaths',
        'revokedAt', 'revokedBy', 'revokeReason',
        'assigneeEmail', 'assigneeName', 'assignedAt', 'assignedBy',
    ],
    ProjectDossierTranslationField: [],
    ProjectDossierTranslationVersion: [
        'kind', 'approvedRole', 'totalCount', 'reviewedCount', 'warningsCount',
        'justification', 'sourceFingerprint', 'reviewers', 'origins',
    ],
    ProjectDossierTranslationEvent: [],
    ProjectDossierRevision: [],
    ProjectDossierGlossary: [],
    ProjectDossierBooklet: [],
    ProjectDossierExport: [],
};

const TABLES = Object.keys(OWNED_COLUMNS);

// v4.1356 — Una sola creación en curso (promesa compartida + reintento): el
// listado, la franja de traducciones y el expediente piden a la vez, y dos
// `CREATE TABLE IF NOT EXISTS` simultáneos chocan en Postgres
// (`pg_type_typname_nsp_index`), como encontró el seguimiento documental.
let _pending = null;
export function ensureProjectDossierSchema() {
    if (_ready) return Promise.resolve();
    if (!_pending) {
        _pending = createSchema().catch(async (err) => {
            // Una carrera con OTRO proceso: un reintento la resuelve.
            await new Promise(r => setTimeout(r, 150));
            return createSchema();
        }).finally(() => { _pending = null; });
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

    // ── v4.1356 — Verificación por Cadres ──────────────────────────────────
    // Columnas NUEVAS de tablas que ya existen: ALTER … ADD COLUMN IF NOT
    // EXISTS (todas enumeradas en OWNED_COLUMNS). Nada se borra ni se
    // reescribe: las aprobaciones anteriores quedan con `approvalKind` NULL
    // = «heredada», y NO se certifican retroactivamente.
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "approvalKind" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "approvedRole" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "approvedById" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "invalidatedAt" TIMESTAMPTZ`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "invalidatedVersionId" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "invalidatedPaths" JSONB`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMPTZ`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "revokedBy" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "revokeReason" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "assigneeEmail" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "assigneeName" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMPTZ`);
    await db.query(`ALTER TABLE "ProjectDossierTranslation" ADD COLUMN IF NOT EXISTS "assignedBy" TEXT`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectDossierTranslation_assignee" ON "ProjectDossierTranslation" (lower("assigneeEmail"))`);

    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS kind TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS "approvedRole" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS "totalCount" INT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS "reviewedCount" INT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS "warningsCount" INT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS justification TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS "sourceFingerprint" TEXT`);
    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS reviewers JSONB`);
    await db.query(`ALTER TABLE "ProjectDossierTranslationVersion" ADD COLUMN IF NOT EXISTS origins JSONB`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectDossierTranslationEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT,
            "eventId" TEXT,
            lang TEXT NOT NULL DEFAULT 'en',
            action TEXT NOT NULL,
            "fromState" TEXT,
            "toState" TEXT,
            "versionId" TEXT,
            "versionNumber" INT,
            "sourceFingerprint" TEXT,
            "translationFingerprint" TEXT,
            "reviewedCount" INT,
            "totalCount" INT,
            paths JSONB,
            note TEXT,
            reason TEXT,
            "assigneeEmail" TEXT,
            "previousAssignee" TEXT,
            recipient TEXT,
            "submissionIds" JSONB,
            "deliveryStatus" TEXT,
            "deliveryError" TEXT,
            "dedupeKey" TEXT,
            "actorId" TEXT,
            "actorName" TEXT,
            "actorRole" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectDossierTranslationEvent_sub" ON "ProjectDossierTranslationEvent" ("submissionId", "createdAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectDossierTranslationEvent_event" ON "ProjectDossierTranslationEvent" ("eventId", "createdAt" DESC)`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDossierTranslationEvent_dedupe" ON "ProjectDossierTranslationEvent" ("dedupeKey") WHERE "dedupeKey" IS NOT NULL`);

    _ready = true;
}

export default ensureProjectDossierSchema;
