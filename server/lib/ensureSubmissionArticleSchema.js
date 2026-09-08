// ════════════════════════════════════════════════════════════════════════════
// Solicitud → artículo — el esquema, en runtime (v4.1000)
//
// TRES tablas fuera de Prisma, sin clave foránea a `Post` ni a
// `ContributionSubmission`, por el motivo de siempre (regla de `logo_intl`,
// v4.699): `Post` se consulta con `findMany` sin `select` en media plataforma y
// una columna declarada y todavía inexistente dejaría en 500 el listado de
// Noticias y la ficha pública de cada artículo. `Post` NO gana ni una columna;
// el vínculo va desde `SubmissionArticle.postId`, nunca al revés.
//
//   SubmissionArticle        el WORKFLOW: una fila por solicitud (única), su
//                            estado, sus etapas, lo generado y el Post al que
//                            apunta.
//   SubmissionArticleMedia   una fila por archivo de la solicitud: rol,
//                            portada, orden, ALT, análisis. Referencia al
//                            archivo ORIGINAL (`fileId`) — nunca una copia.
//   SubmissionArticleVersion el historial: la versión IA inicial, cada
//                            edición humana y cada regeneración. SÓLO AGREGA.
//
// Las tres están en la lista del guardián de `db:push`.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` va ENUMERADO acá (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía nada, y con el atajo mirando sólo tablas un ALTER
// nuevo no correría nunca.
const OWNED_COLUMNS = {
    SubmissionArticle: [
        // La carpeta de la Biblioteca donde vive el material del artículo
        // (v4.1004). Es la MISMA de la solicitud —el artículo no tiene una
        // carpeta propia— y se copia acá para que «artículo → carpeta» se
        // resuelva sin pasar por la solicitud: lo consume el listado de
        // Noticias, que ya trae el origen en UNA consulta.
        '"mediaFolderId" TEXT',
    ],
};

export async function ensureSubmissionArticleSchema() {
    if (_ready) return;
    const { rows } = await db.query(`
        SELECT to_regclass('public."SubmissionArticle"') IS NOT NULL AS a,
               to_regclass('public."SubmissionArticleMedia"') IS NOT NULL AS m,
               to_regclass('public."SubmissionArticleVersion"') IS NOT NULL AS v
    `);
    // ⚠️ LAS COLUMNAS CUENTAN EN EL ATAJO. Con la comprobación mirando sólo
    // las tablas, un `ADD COLUMN` nuevo no correría nunca sobre una base que
    // ya las tiene — la trampa de v4.908, que se pagó el mismo día.
    const columnasEsperadas = Object.values(OWNED_COLUMNS).reduce((n, c) => n + c.length, 0);
    const { rows: cols } = await db.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'SubmissionArticle'
            AND column_name IN ('mediaFolderId')`
    );
    if (rows[0]?.a && rows[0]?.m && rows[0]?.v && Number(cols[0]?.n) === columnasEsperadas) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "SubmissionArticle" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "campaignId" TEXT NOT NULL,
            -- El SITIO en el que nace el artículo: es el tenant del Post.
            "clubId" TEXT,
            "postId" TEXT,
            status TEXT NOT NULL DEFAULT 'recibida',
            "statusDetail" TEXT,
            -- Cada etapa con su desenlace: {validar:{status,tries,error,at}, …}
            stages JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- Lo que el modelo devolvió, ya validado: título, SEO, extracto,
            -- etiquetas, categoría, lo no suministrado, avisos.
            generated JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- El plan de la galería y la portada elegida.
            "mediaPlan" JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- El reclamo: attempts es un entero exacto (v4.800).
            attempts INTEGER NOT NULL DEFAULT 0,
            "claimedAt" TIMESTAMPTZ,
            "generatedBy" TEXT NOT NULL DEFAULT 'ai_workflow',
            "generatedAt" TIMESTAMPTZ,
            "approvedAt" TIMESTAMPTZ,
            "publishedAt" TIMESTAMPTZ,
            "publicUrl" TEXT,
            "lastError" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    // ⚠️ LA IDEMPOTENCIA ES ESTE ÍNDICE. Una solicitud tiene UN artículo
    // principal; un segundo INSERT —refresco, cron, reintento— no crea nada.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionArticle_submission_key" ON "SubmissionArticle" ("submissionId");`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionArticle_post_key" ON "SubmissionArticle" ("postId") WHERE "postId" IS NOT NULL;`);
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionArticle_campaign_idx" ON "SubmissionArticle" ("campaignId", status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionArticle_club_idx" ON "SubmissionArticle" ("clubId", status);`);
    // El barrido del cron: lo que está en cola o a medias.
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionArticle_working_idx" ON "SubmissionArticle" (status, "updatedAt") WHERE status IN ('recibida','analizando','generando');`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "SubmissionArticleMedia" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "articleId" TEXT NOT NULL,
            "submissionId" TEXT NOT NULL,
            -- El archivo ORIGINAL de la solicitud. No se copia nada: cuando se
            -- promueve a la Biblioteca, mediaId se lee del propio archivo.
            "fileId" TEXT NOT NULL,
            kind TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'secundaria',
            "isCover" BOOLEAN NOT NULL DEFAULT FALSE,
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            excluded BOOLEAN NOT NULL DEFAULT FALSE,
            "excludedReason" TEXT,
            alt TEXT,
            caption TEXT,
            score INTEGER,
            -- Lo MEDIDO (sharp) y lo DESCRITO (visión), separados a propósito.
            analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionArticleMedia_file_key" ON "SubmissionArticleMedia" ("articleId", "fileId");`);
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionArticleMedia_article_idx" ON "SubmissionArticleMedia" ("articleId", "sortOrder");`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "SubmissionArticleVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "articleId" TEXT NOT NULL,
            "postId" TEXT NOT NULL,
            -- ai | human | regenerada | restaurada
            kind TEXT NOT NULL,
            section TEXT,
            snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            "changedFields" TEXT[] NOT NULL DEFAULT '{}',
            actor TEXT,
            "actorName" TEXT,
            note TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionArticleVersion_article_idx" ON "SubmissionArticleVersion" ("articleId", "createdAt" DESC);`);

    for (const [tabla, cols] of Object.entries(OWNED_COLUMNS)) {
        for (const col of cols) await db.query(`ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS ${col};`);
    }
    _ready = true;
}

export default ensureSubmissionArticleSchema;
