// Crea en runtime, de forma perezosa e idempotente, la tabla de las
// composiciones «video de la Biblioteca + outro» (v4.1039).
//
// POR QUÉ UNA TABLA Y NO UNA COLUMNA DE `Media`: `Media` se consulta con Prisma
// (`findMany`/`findUnique` en Content Studio, Maneras de Contribuir y los
// reportes), y el `build` no ejecuta `db push` desde el incidente del
// 2026-07-13. Una columna declarada en `schema.prisma` y todavía inexistente
// deja esas consultas en 500 hasta que alguien pase por una ruta que corra el
// ensure. Una tabla aparte, fuera de Prisma, no tiene ese problema — y además
// una versión con outro es una RELACIÓN (original → versión → outro), que es lo
// que una tabla modela y una columna JSON no.
//
// Mismo patrón que OutroProject, MediaFolder y el resto: CREATE TABLE IF NOT
// EXISTS + ADD COLUMN IF NOT EXISTS. Nunca DROP, nunca TRUNCATE. La tabla queda
// protegida sola por scripts/db-push-guard.mjs (compara dinámicamente).
import db from './db.js';

let _ready = false;

export async function ensureLibraryOutroSchema() {
    if (_ready) return;

    // Comprobar antes de ejecutar (v4.659). Al agregar un ADD COLUMN a este
    // archivo hay que ENUMERARLO acá: `CREATE TABLE IF NOT EXISTS` no amplía
    // nada, y con el atajo mirando sólo la tabla, el ALTER no correría nunca
    // sobre una base que ya la tiene (la trampa de v4.908).
    const { rows } = await db.query(`
        SELECT EXISTS (SELECT 1 FROM pg_tables
                       WHERE schemaname = 'public' AND tablename = 'MediaOutroComposition') AS has_table
    `);
    if (rows[0]?.has_table) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "MediaOutroComposition" (
            id TEXT PRIMARY KEY,
            "clubId" TEXT,
            -- El MÁSTER. Nunca se reescribe: toda versión se compone desde él.
            "originalMediaId" TEXT NOT NULL,
            -- La fila de Media de la versión con outro (NULL mientras se compone).
            "versionMediaId" TEXT,
            -- De qué outro salió: el proyecto del Generador de Outros, o un
            -- video de la Biblioteca elegido como outro. Uno de los dos.
            "outroId" TEXT,
            "outroMediaId" TEXT,
            "outroUrl" TEXT NOT NULL,
            "outroTitle" TEXT,
            "transitionType" TEXT NOT NULL DEFAULT 'fade',
            "transitionSec" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
            "originalDurationSec" DOUBLE PRECISION,
            "outroDurationSec" DOUBLE PRECISION,
            "finalDurationSec" DOUBLE PRECISION,
            status TEXT NOT NULL DEFAULT 'processing',
            "statusDetail" TEXT,
            -- El plan resuelto (geometría, audio, avisos) y el informe del
            -- archivo compuesto: es lo que contesta «¿por qué salió así?».
            plan JSONB NOT NULL DEFAULT '{}'::jsonb,
            report JSONB,
            "s3Key" TEXT,
            "sizeBytes" BIGINT,
            -- Composición, no generación: siempre 0. Se guarda para que el
            -- panel no tenga que deducirlo.
            "creditsUsed" INTEGER NOT NULL DEFAULT 0,
            "createdBy" TEXT,
            "composedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "MediaOutroComposition_original_idx" ON "MediaOutroComposition" ("originalMediaId");
        CREATE INDEX IF NOT EXISTS "MediaOutroComposition_version_idx" ON "MediaOutroComposition" ("versionMediaId");
    `);
    _ready = true;
}
