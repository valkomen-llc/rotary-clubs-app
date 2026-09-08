// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel — el esquema, en runtime (v4.1006)
//
// UNA tabla fuera de Prisma, sin clave foránea a `ReelProject` ni a
// `ContributionSubmission`, por el motivo de siempre (regla de `logo_intl`,
// v4.699): `Post`, `Donation` y compañía se consultan con `findMany` sin
// `select` en media plataforma, y una columna declarada y todavía inexistente
// deja esas consultas en 500 desde el primer despliegue. Acá el precio de
// equivocarse caería sobre la Biblioteca de Reels y sobre la ficha de una
// solicitud. `ReelProject` NO gana ni una columna: el vínculo va desde
// `SubmissionReel.reelProjectId`, nunca al revés.
//
// ⚠️ POR QUÉ UNA TABLA Y NO UN CAMPO EN `ReelProject.config`. La `config` es
// JSONB y ahí ya viven el preset y la estructura narrativa, así que la
// tentación es escribir `config.origin = { submissionId }` y ahorrarse la
// tabla. No sirve para lo que este módulo tiene que hacer: la idempotencia del
// punto 22 —«una solicitud no debe generar varios Reels accidentalmente»— es un
// ÍNDICE ÚNICO, y un filtro sobre un documento JSON no se indexa; y el workflow
// tiene estado propio (etapas, reclamo, selección, storyboard) que existe ANTES
// de que haya ningún `ReelProject` al que colgarlo. Es la misma decisión que
// separó `SubmissionArticle` de `Post`.
//
// Está en la lista del guardián de `db:push`.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía nada, así que con el atajo mirando sólo la tabla un
// ALTER nuevo no correría NUNCA sobre una base que ya estrenó el módulo, y el
// INSERT fallaría con «column does not exist» — en silencio, porque este módulo
// degrada. Lo fija una prueba que recorre los ADD COLUMN del archivo.
const OWNED_COLUMNS = {
    SubmissionReel: [],
};

export async function ensureSubmissionReelSchema() {
    if (_ready) return;
    const { rows } = await db.query(`SELECT to_regclass('public."SubmissionReel"') IS NOT NULL AS r`);
    const columnasEsperadas = Object.values(OWNED_COLUMNS).reduce((n, c) => n + c.length, 0);
    if (rows[0]?.r && columnasEsperadas === 0) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "SubmissionReel" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "campaignId" TEXT NOT NULL,
            -- El SITIO en el que nace el Reel: es el tenant del proyecto y de
            -- su fila en la Biblioteca. Nunca se deduce del dominio ni se
            -- escribe a mano: lo resuelve el motor como el del artículo.
            "clubId" TEXT,
            -- El proyecto del MOTOR DE SIEMPRE. Nulo mientras las etapas
            -- baratas todavía no gastaron un crédito.
            "reelProjectId" TEXT,
            -- El artículo del que este Reel es hermano, para la trazabilidad de
            -- los puntos 19 y 20. Nulo si el artículo todavía no existe: el
            -- Reel no depende de él.
            "articleId" TEXT,
            -- v1, v2, v3… Regenerar en serio crea una versión NUEVA y no pisa
            -- la anterior; los archivos originales NO se duplican, porque la
            -- selección apunta a los mismos fileId de la solicitud.
            "versionNumber" INTEGER NOT NULL DEFAULT 1,
            "isCurrent" BOOLEAN NOT NULL DEFAULT TRUE,
            status TEXT NOT NULL DEFAULT 'recibida',
            "statusDetail" TEXT,
            -- image_reel | video_reel | mixed. video_reel está DECLARADO y no
            -- implementado: es la costura de la segunda fase.
            "contentMode" TEXT NOT NULL DEFAULT 'image_reel',
            -- Cada etapa con su desenlace: {material:{status,tries,error,at}, …}
            stages JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- Qué trae la solicitud: cuántas imágenes, cuántos videos, cuáles
            -- no se pudieron leer y por qué se eligió este modo.
            classification JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- Las fotos elegidas, en orden, con su función narrativa, su motivo
            -- y de dónde salió la elección (auto | manual).
            selection JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- El arco: una línea por escena, más hook, cierre y llamado.
            storyboard JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- La guardia de datos: el universo de lo suministrado y su brief.
            -- Se guarda para que regenerar la voz o el copy meses después
            -- afirme lo MISMO que el día que se creó la pieza.
            facts JSONB NOT NULL DEFAULT '{}'::jsonb,
            "creditsEstimated" INTEGER NOT NULL DEFAULT 0,
            -- El reclamo: attempts es un entero EXACTO. Sobre updatedAt no
            -- funcionaría — el driver de pg trunca los microsegundos y la
            -- igualdad no casaría nunca (v4.800).
            attempts INTEGER NOT NULL DEFAULT 0,
            "claimedAt" TIMESTAMPTZ,
            "generatedBy" TEXT NOT NULL DEFAULT 'ai_workflow',
            "generatedAt" TIMESTAMPTZ,
            "approvedAt" TIMESTAMPTZ,
            "publishedAt" TIMESTAMPTZ,
            "lastError" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    // ⚠️ LA IDEMPOTENCIA ES ESTE ÍNDICE, y NO es parcial a propósito. Las dos
    // columnas son NOT NULL, así que el `ON CONFLICT` de `enqueueReel` va a
    // secas: contra un índice PARCIAL habría que repetir su predicado o la
    // sentencia falla entera (la trampa de v4.648). Encolar diez veces la
    // versión 1 de una solicitud crea UN Reel.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionReel_version_key" ON "SubmissionReel" ("submissionId", "versionNumber");`);
    // Cuál es la vigente. ESTE sí es parcial —en Postgres NULL nunca es igual
    // a NULL y `isCurrent` es booleano, así que el predicado es lo único que
    // deja una sola fila viva—, y por eso se marca con dos UPDATE y nunca con
    // un upsert (el patrón de la línea principal de WhatsApp, v4.992).
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionReel_current_key" ON "SubmissionReel" ("submissionId") WHERE "isCurrent";`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionReel_project_key" ON "SubmissionReel" ("reelProjectId") WHERE "reelProjectId" IS NOT NULL;`);
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionReel_campaign_idx" ON "SubmissionReel" ("campaignId", status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionReel_club_idx" ON "SubmissionReel" ("clubId", status);`);
    // El barrido del cron: lo que está en cola o a medias.
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionReel_working_idx" ON "SubmissionReel" (status, "updatedAt") WHERE status IN ('recibida','analizando','preparando','generando','componiendo');`);

    _ready = true;
}

export const __ownedColumns = OWNED_COLUMNS;
