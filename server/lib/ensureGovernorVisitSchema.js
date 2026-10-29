// ════════════════════════════════════════════════════════════════════════════
// Visitas del Gobernador — el esquema, en runtime (v4.1260.0)
//
// UNA tabla fuera de Prisma, `GovernorVisit`. Sin tablas satélite:
//   · la galería es un JSONB de referencias a objetos de S3 (los mismos que
//     reclama después la solicitud de Rotary en Acción: nada se duplica);
//   · el historial es un JSONB que sólo crece con `history || $x` —una
//     concatenación atómica en SQL, sin leer-modificar-escribir—, igual que
//     `DistrictClubSubmission.history` en el Directorio de Clubes.
//
// El vínculo con el Directorio va por `clubProfileId` → `DistrictClubProfile.id`
// y con la publicación por `contributionSubmissionId` →
// `ContributionSubmission.id`. Sin claves foráneas, por la regla de siempre:
// ninguna tabla existente gana una columna ni una restricción por esto.
//
// Está en la lista del guardián de `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía una tabla que ya existe, así que con el atajo
// mirando sólo la tabla un ALTER nuevo no correría NUNCA en producción. Lo fija
// `scripts/test-governor-visits.mjs`, que recorre los ADD COLUMN del archivo.
export const OWNED_COLUMNS = {
    GovernorVisit: [],
};

export async function ensureGovernorVisitSchema() {
    if (_ready) return;
    const esperadas = OWNED_COLUMNS.GovernorVisit;
    const { rows } = await db.query(
        `SELECT to_regclass('public."GovernorVisit"') IS NOT NULL AS t,
                (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_name = 'GovernorVisit' AND column_name = ANY($1))::int AS columnas`,
        [esperadas]
    );
    if (rows[0]?.t && rows[0]?.columnas === esperadas.length) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "GovernorVisit" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "publicRef" TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'recibida',
            "districtNumber" INT NOT NULL DEFAULT 4281,

            -- El club, tal como estaba en el Directorio al enviar. Se copia el
            -- nombre y la ciudad para que el registro siga legible aunque la
            -- ficha cambie; la identidad es "clubProfileId".
            "clubProfileId" TEXT NOT NULL,
            "clubName" TEXT NOT NULL,
            "clubCity" TEXT,
            "clubState" TEXT,
            "clubSlug" TEXT,
            "clubPlatformId" TEXT,

            "visitDate" DATE NOT NULL,
            "governorName" TEXT NOT NULL,
            venue TEXT,
            title TEXT NOT NULL,
            reason TEXT,

            description TEXT,
            activities TEXT,
            topics TEXT,
            recognitions TEXT,
            agreements TEXT,
            commitments TEXT,
            highlights TEXT,

            -- [{key, kind, filename, contentType, bytes, caption}]
            media JSONB NOT NULL DEFAULT '[]'::jsonb,
            -- [{url, host, caption}]
            links JSONB NOT NULL DEFAULT '[]'::jsonb,

            "responsibleName" TEXT NOT NULL,
            "responsibleRole" TEXT,
            "responsibleEmail" TEXT NOT NULL,
            "responsiblePhone" TEXT,
            "truthConfirmed" BOOLEAN NOT NULL DEFAULT FALSE,
            "publicationConsent" BOOLEAN NOT NULL DEFAULT FALSE,
            "consentText" TEXT,
            "consentAt" TIMESTAMPTZ,

            -- Lo que se le pide a quien envió, y el enlace con el que corrige.
            "statusReason" TEXT,
            "correctionToken" TEXT,
            "correctionTokenExpires" TIMESTAMPTZ,
            "adminNotes" TEXT,
            "reviewedBy" TEXT,
            "reviewedByName" TEXT,
            "reviewedAt" TIMESTAMPTZ,

            -- La publicación en Rotary en Acción. "publishLock" impide que dos
            -- clics creen dos solicitudes.
            "contributionSubmissionId" TEXT,
            "publishLock" TIMESTAMPTZ,
            "publishedAt" TIMESTAMPTZ,
            "publishedBy" TEXT,

            history JSONB NOT NULL DEFAULT '[]'::jsonb,
            "originHost" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "GovernorVisit_publicRef_key" ON "GovernorVisit" ("publicRef")`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "GovernorVisit_correctionToken_key" ON "GovernorVisit" ("correctionToken") WHERE "correctionToken" IS NOT NULL`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "GovernorVisit_submission_key" ON "GovernorVisit" ("contributionSubmissionId") WHERE "contributionSubmissionId" IS NOT NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS "GovernorVisit_club_idx" ON "GovernorVisit" ("clubProfileId", "visitDate" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "GovernorVisit_status_idx" ON "GovernorVisit" ("districtNumber", status, "createdAt" DESC)`);
    _ready = true;
}

export default ensureGovernorVisitSchema;
