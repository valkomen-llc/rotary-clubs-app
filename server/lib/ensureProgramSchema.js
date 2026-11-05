// ════════════════════════════════════════════════════════════════════════════
// Programas — el esquema, en runtime (v4.1280.0)
//
// QUINCE tablas fuera de Prisma, todas con prefijo `Program`. Sin claves
// foráneas hacia tablas existentes, por la regla de siempre: ninguna tabla
// que ya exista gana una columna ni una restricción por esto. Los vínculos
// van por id (`Club.id`, `User.id`, `DistrictClubProfile.id`, `District.number`).
//
//   Program                  la identidad institucional ÚNICA del programa
//   ProgramDistrictLink      su vinculación con cada distrito
//   ProgramClubActivation    la activación de un club del distrito en su sitio
//   ProgramMember            quién asume qué perfil en qué alcance
//   ProgramContent           UNA fila por registro vivo (central, distrital o local)
//   ProgramContentVersion    cada versión publicada de un registro
//   ProgramChangeRequest     el formato de gestión y su flujo editorial
//   ProgramRequest           las solicitudes públicas (datos personales: PRIVADOS)
//   ProgramSubscriber        quien pidió novedades (consentimiento aparte)
//   ProgramFile              archivos privados (autorizaciones, respaldos, recursos)
//   ProgramAuditLog          historial y auditoría
//   ProgramMetricDaily       métricas por día, sin datos personales
//   ProgramVisitor           visitante seudónimo (hash, nunca IP)
//   ProgramLanding           la página pública por contenedores: borrador y publicada (v4.1281)
//   ProgramLandingVersion    cada versión publicada de la página
//
// Están en la lista del guardián de `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía una tabla que ya existe, así que con el atajo
// mirando sólo la tabla un ALTER nuevo no correría NUNCA en producción. Lo
// fija `scripts/test-programas.mjs`, que recorre los ADD COLUMN del archivo.
export const OWNED_COLUMNS = {
    Program: [],
    ProgramDistrictLink: [],
    ProgramClubActivation: [],
    ProgramMember: [],
    ProgramContent: [],
    ProgramContentVersion: [],
    ProgramChangeRequest: [],
    ProgramRequest: [],
    ProgramSubscriber: [],
    ProgramFile: [],
    ProgramAuditLog: [],
    ProgramMetricDaily: [],
    ProgramVisitor: [],
    ProgramLanding: [],
    ProgramLandingVersion: [],
};
export const PROGRAM_TABLES = Object.keys(OWNED_COLUMNS);

export async function ensureProgramSchema() {
    if (_ready) return;
    const esperadas = Object.entries(OWNED_COLUMNS).flatMap(([t, cols]) => cols.map(c => `${t}.${c}`));
    const { rows } = await db.query(
        `SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1))::int AS tablas,
                (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = current_schema() AND (table_name || '.' || column_name) = ANY($2))::int AS columnas`,
        [PROGRAM_TABLES, esperadas]
    );
    if (rows[0]?.tablas === PROGRAM_TABLES.length && rows[0]?.columnas === esperadas.length) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "Program" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            slug TEXT NOT NULL,
            name TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'otro',
            status TEXT NOT NULL DEFAULT 'borrador',
            "logoUrl" TEXT,
            "heroImageUrl" TEXT,
            "heroImageAlt" TEXT,
            website TEXT,
            social JSONB NOT NULL DEFAULT '{}'::jsonb,
            partners JSONB NOT NULL DEFAULT '[]'::jsonb,
            governance JSONB NOT NULL DEFAULT '{}'::jsonb,
            care JSONB NOT NULL DEFAULT '{}'::jsonb,
            participation JSONB NOT NULL DEFAULT '{}'::jsonb,
            sections JSONB NOT NULL DEFAULT '[]'::jsonb,
            ctas JSONB NOT NULL DEFAULT '[]'::jsonb,
            seo JSONB NOT NULL DEFAULT '{}'::jsonb,
            "requestRouting" JSONB NOT NULL DEFAULT '{}'::jsonb,
            "formsEnabled" JSONB NOT NULL DEFAULT '{}'::jsonb,
            "newsletterEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
            "pendingValidation" JSONB NOT NULL DEFAULT '[]'::jsonb,
            -- El sitio (Club.id) que lo creó: el del distrito o la plataforma.
            "ownerClubId" TEXT,
            "ownerDistrictNumber" INT,
            version INT NOT NULL DEFAULT 1,
            "publishedAt" TIMESTAMPTZ,
            "publishedBy" TEXT,
            "archivedAt" TIMESTAMPTZ,
            "createdBy" TEXT,
            "updatedBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "Program_slug_key" ON "Program" (slug)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "Program_status_idx" ON "Program" (status, category, "updatedAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramDistrictLink" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "programId" TEXT NOT NULL,
            "districtNumber" INT NOT NULL,
            -- El sitio del distrito (Club.id), si existe en la plataforma.
            "districtClubId" TEXT,
            "relationType" TEXT NOT NULL DEFAULT 'respaldo_institucional',
            "relationDescription" TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'activa',
            presentation TEXT NOT NULL DEFAULT '',
            contact JSONB NOT NULL DEFAULT '{}'::jsonb,
            disclaimer TEXT NOT NULL DEFAULT '',
            "showInMenu" BOOLEAN NOT NULL DEFAULT TRUE,
            "showInCatalog" BOOLEAN NOT NULL DEFAULT TRUE,
            "allowClubActivation" BOOLEAN NOT NULL DEFAULT TRUE,
            "createdBy" TEXT,
            "updatedBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramDistrictLink_program_district_key" ON "ProgramDistrictLink" ("programId", "districtNumber")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramDistrictLink_district_idx" ON "ProgramDistrictLink" ("districtNumber", status)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramClubActivation" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "programId" TEXT NOT NULL,
            "districtLinkId" TEXT NOT NULL,
            "districtNumber" INT NOT NULL,
            -- El sitio del club (Club.id) y, si está, su ficha del catálogo.
            "clubId" TEXT NOT NULL,
            "clubProfileId" TEXT,
            "clubName" TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'activa',
            "localContact" JSONB NOT NULL DEFAULT '{}'::jsonb,
            "localNote" TEXT NOT NULL DEFAULT '',
            "showInMenu" BOOLEAN NOT NULL DEFAULT TRUE,
            "activatedBy" TEXT,
            "activatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "deactivatedAt" TIMESTAMPTZ,
            "deactivatedBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramClubActivation_program_club_key" ON "ProgramClubActivation" ("programId", "clubId")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramClubActivation_club_idx" ON "ProgramClubActivation" ("clubId", status)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramMember" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "programId" TEXT NOT NULL,
            "userId" TEXT,
            email TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            roles JSONB NOT NULL DEFAULT '[]'::jsonb,
            -- 'central' | 'district' | 'club'
            "scopeType" TEXT NOT NULL DEFAULT 'central',
            "districtNumber" INT,
            "clubId" TEXT,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramMember_program_email_scope_key" ON "ProgramMember" ("programId", email, "scopeType", COALESCE("districtNumber", 0), COALESCE("clubId", ''))`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramMember_user_idx" ON "ProgramMember" ("userId", active)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramContent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "programId" TEXT NOT NULL,
            kind TEXT NOT NULL,
            "scopeType" TEXT NOT NULL DEFAULT 'central',
            "districtNumber" INT,
            "clubActivationId" TEXT,
            "clubId" TEXT,
            "clubName" TEXT,
            -- 'publicado' | 'archivado'. Lo que no está publicado NO existe aquí:
            -- vive como solicitud de cambio hasta publicarse.
            status TEXT NOT NULL DEFAULT 'publicado',
            title TEXT NOT NULL DEFAULT '',
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            version INT NOT NULL DEFAULT 1,
            "sortOrder" INT NOT NULL DEFAULT 0,
            "requiresMedicalReview" BOOLEAN NOT NULL DEFAULT FALSE,
            "medicalReviewedBy" TEXT,
            "medicalReviewedAt" TIMESTAMPTZ,
            "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "publishedBy" TEXT,
            "archivedAt" TIMESTAMPTZ,
            "archivedBy" TEXT,
            "lastRequestId" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramContent_program_kind_idx" ON "ProgramContent" ("programId", kind, status, "sortOrder", "publishedAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramContent_scope_idx" ON "ProgramContent" ("scopeType", "clubId", "districtNumber")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramContentVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "contentId" TEXT NOT NULL,
            "programId" TEXT NOT NULL,
            version INT NOT NULL,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            "requestId" TEXT,
            "createdBy" TEXT,
            "createdByName" TEXT,
            note TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramContentVersion_content_version_key" ON "ProgramContentVersion" ("contentId", version)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramChangeRequest" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "publicRef" TEXT NOT NULL,
            "programId" TEXT NOT NULL,
            kind TEXT NOT NULL,
            operation TEXT NOT NULL DEFAULT 'crear',
            "contentId" TEXT,
            "scopeType" TEXT NOT NULL DEFAULT 'central',
            "districtNumber" INT,
            "clubActivationId" TEXT,
            "clubId" TEXT,
            "targetSection" TEXT,
            title TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
            links JSONB NOT NULL DEFAULT '[]'::jsonb,
            "responsibleName" TEXT NOT NULL DEFAULT '',
            "responsibleEmail" TEXT NOT NULL DEFAULT '',
            "responsiblePhone" TEXT,
            "requestedReach" TEXT,
            "suggestedDate" DATE,
            observations TEXT,
            authorizations JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'borrador',
            "statusReason" TEXT,
            "requiresMedicalReview" BOOLEAN NOT NULL DEFAULT FALSE,
            "medicalReviewedBy" TEXT,
            "medicalReviewedByName" TEXT,
            "medicalReviewedAt" TIMESTAMPTZ,
            -- Lo aprobado, congelado: si el payload cambia después, la
            -- aprobación se invalida y vuelve a revisión.
            "approvedPayload" JSONB,
            "approvedBy" TEXT,
            "approvedAt" TIMESTAMPTZ,
            "submittedBy" TEXT,
            "submittedByName" TEXT,
            "submittedAt" TIMESTAMPTZ,
            "reviewedBy" TEXT,
            "reviewedAt" TIMESTAMPTZ,
            "publishedAt" TIMESTAMPTZ,
            "publishedBy" TEXT,
            "resultContentId" TEXT,
            "resultVersion" INT,
            "ownerUserId" TEXT,
            "ownerClubId" TEXT,
            history JSONB NOT NULL DEFAULT '[]'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramChangeRequest_publicRef_key" ON "ProgramChangeRequest" ("publicRef")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramChangeRequest_program_status_idx" ON "ProgramChangeRequest" ("programId", status, "updatedAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramChangeRequest_owner_idx" ON "ProgramChangeRequest" ("ownerUserId", "ownerClubId")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramRequest" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "publicRef" TEXT NOT NULL,
            "programId" TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'nueva',
            -- Los datos del formulario: PRIVADOS. Nunca a una página pública,
            -- a una métrica ni a un registro técnico.
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            "consentText" TEXT,
            "consentAt" TIMESTAMPTZ,
            "originHost" TEXT,
            "originClubId" TEXT,
            "originClubName" TEXT,
            "originDistrictNumber" INT,
            "originActivationId" TEXT,
            "assigneeUserId" TEXT,
            "assigneeName" TEXT,
            "backupUserId" TEXT,
            "backupName" TEXT,
            "firstContactAt" TIMESTAMPTZ,
            "closedAt" TIMESTAMPTZ,
            "closeReason" TEXT,
            "derivedTo" TEXT,
            notes JSONB NOT NULL DEFAULT '[]'::jsonb,
            history JSONB NOT NULL DEFAULT '[]'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramRequest_publicRef_key" ON "ProgramRequest" ("publicRef")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramRequest_program_status_idx" ON "ProgramRequest" ("programId", status, "createdAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramRequest_origin_idx" ON "ProgramRequest" ("originClubId", "createdAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramSubscriber" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "programId" TEXT NOT NULL,
            email TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            "consentText" TEXT,
            "consentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "originHost" TEXT,
            "originClubId" TEXT,
            "unsubscribedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramSubscriber_program_email_key" ON "ProgramSubscriber" ("programId", email)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramFile" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "programId" TEXT NOT NULL,
            -- 'autorizacion' | 'documento_respaldo' | 'recurso'
            kind TEXT NOT NULL,
            "storageKey" TEXT NOT NULL,
            filename TEXT NOT NULL,
            "contentType" TEXT,
            bytes BIGINT NOT NULL DEFAULT 0,
            format TEXT,
            label TEXT,
            "relatedType" TEXT,
            "relatedId" TEXT,
            "uploadedBy" TEXT,
            "uploadedByName" TEXT,
            "verifiedBy" TEXT,
            "verifiedAt" TIMESTAMPTZ,
            "deletedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramFile_storageKey_key" ON "ProgramFile" ("storageKey")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramFile_program_idx" ON "ProgramFile" ("programId", kind, "createdAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramAuditLog" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "programId" TEXT,
            "entityType" TEXT NOT NULL,
            "entityId" TEXT,
            action TEXT NOT NULL,
            "actorId" TEXT,
            "actorName" TEXT,
            "actorClubId" TEXT,
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ProgramAuditLog_program_idx" ON "ProgramAuditLog" ("programId", "createdAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramMetricDaily" (
            "programId" TEXT NOT NULL,
            "siteClubId" TEXT NOT NULL DEFAULT '',
            day DATE NOT NULL,
            metric TEXT NOT NULL,
            count INT NOT NULL DEFAULT 0,
            uniques INT NOT NULL DEFAULT 0,
            PRIMARY KEY ("programId", "siteClubId", day, metric)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramVisitor" (
            "programId" TEXT NOT NULL,
            "visitorKey" TEXT NOT NULL,
            "firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            views INT NOT NULL DEFAULT 1,
            PRIMARY KEY ("programId", "visitorKey")
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramLanding" (
            "programId" TEXT PRIMARY KEY,
            "schemaVersion" INT NOT NULL DEFAULT 1,
            draft JSONB NOT NULL DEFAULT '{}'::jsonb,
            published JSONB,
            -- Bloqueo optimista: quien guarda manda la versión que leyó.
            "draftVersion" INT NOT NULL DEFAULT 1,
            "publishedVersion" INT,
            "updatedBy" TEXT,
            "updatedByName" TEXT,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "publishedBy" TEXT,
            "publishedByName" TEXT,
            "publishedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProgramLandingVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "programId" TEXT NOT NULL,
            version INT NOT NULL,
            config JSONB NOT NULL,
            "publishedBy" TEXT,
            "publishedByName" TEXT,
            note TEXT,
            "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProgramLandingVersion_program_version_key" ON "ProgramLandingVersion" ("programId", version)`);
    _ready = true;
}

export default ensureProgramSchema;
