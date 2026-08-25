// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — las tablas, creadas en runtime
// v4.895.0
//
// Tres tablas, FUERA de Prisma, con el patrón del sitio: `CREATE TABLE IF NOT
// EXISTS` + `ADD COLUMN IF NOT EXISTS`, nunca `DROP` y nunca `TRUNCATE`.
//
// POR QUÉ FUERA DE PRISMA: desde el incidente del 2026-07-13 el build ya NO
// ejecuta `prisma db push`, así que un modelo declarado en `schema.prisma` que
// todavía no exista en la base deja en 500 toda consulta que lo toque —desde
// el primer despliegue y hasta que alguien corra la sincronización a mano—.
// Es la regla de `logo_intl` (v4.699). Al no estar en el schema, estas tres
// quedan protegidas por `scripts/db-push-guard.mjs`.
//
// La comprobación previa al catálogo es la regla de rendimiento de v4.659:
// estas sentencias son idempotentes pero no gratis, y las pagaría la primera
// visita tras un arranque en frío. **Esa lista no es un número de versión**:
// enumera los objetos reales del archivo, y al agregar una columna hay que
// agregarla ahí o la comprobación rápida la da por presente y no se crea nunca.
//
// ⚠️ NINGUNA COMILLA INVERTIDA DENTRO DEL SQL, ni en un comentario: el SQL vive
// en un template literal y una comilla invertida lo cierra a mitad, dejando el
// módulo entero sin parsear. Pasó en `ensureDesignSchema.js` (v4.721.1) y el
// módulo estuvo caído en producción sin que nada lo dijera.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

export async function ensureAnniversarySchema() {
    if (_ready) return;

    const { rows } = await db.query(
        `SELECT to_regclass('public."AnniversaryConfig"') IS NOT NULL AS cfg,
                to_regclass('public."AnniversaryConfigVersion"') IS NOT NULL AS ver,
                to_regclass('public."AnniversaryPiece"') IS NOT NULL AS pza,
                to_regclass('public."AnniversaryBenchmark"') IS NOT NULL AS bench,
                to_regclass('public."AnniversaryBenchmarkResult"') IS NOT NULL AS benchres,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'AnniversaryPiece' AND column_name = 'renderMode') AS render_col,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'AnniversaryPiece' AND column_name = 'branding') AS brand_col,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'AnniversaryPiece' AND column_name = 'engine') AS engine_pza_col,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'AnniversaryConfig' AND column_name = 'engine') AS engine_cfg_col,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'AnniversaryConfig' AND column_name = 'publishedVersionId') AS pubver_col`
    );
    if (rows[0]?.cfg && rows[0]?.ver && rows[0]?.pza && rows[0]?.bench && rows[0]?.benchres
        && rows[0]?.render_col && rows[0]?.brand_col && rows[0]?.pubver_col
        && rows[0]?.engine_pza_col && rows[0]?.engine_cfg_col) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AnniversaryConfig" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

            -- "kind" existe para que replicar el enfoque a otro generador sea
            -- una fila mas y no una bifurcacion del codigo. Hoy solo hay
            -- 'aniversario', a proposito.
            kind TEXT NOT NULL DEFAULT 'aniversario',

            -- Preparado, no implementado: hoy solo se escriben filas con
            -- "clubId" IS NULL, que es la configuracion de la plataforma. La
            -- columna existe para que un sitio pueda tener la suya sin migrar
            -- nada, igual que "SpotlightSlide"."clubId".
            "clubId" TEXT,

            name TEXT NOT NULL DEFAULT 'Aniversarios IA',
            enabled BOOLEAN NOT NULL DEFAULT false,

            -- El BORRADOR y lo PUBLICADO son dos documentos distintos, y esa
            -- separacion es todo el punto de la regla 17 del pedido: cambiar
            -- una instruccion no puede afectar en el acto lo que genera la
            -- gente. "published" en NULL significa que nunca se publico.
            draft JSONB NOT NULL DEFAULT '{}'::jsonb,
            published JSONB,
            "publishedVersionId" TEXT,
            "publishedAt" TIMESTAMPTZ,
            "publishedBy" TEXT,

            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    // Dos indices unicos PARCIALES y no uno solo sobre (kind, "clubId"): en
    // Postgres NULL nunca es igual a NULL, asi que con un unico indice las
    // filas de la plataforma —que llevan "clubId" en NULL— no chocarian jamas
    // entre si, que es justo donde tiene que haber una sola.
    //
    // Por ser parciales, NO se usa ON CONFLICT contra ellos: habria que
    // repetir el predicado o la sentencia falla entera (error real, v4.648).
    // El store lee y despues inserta o actualiza.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AnniversaryConfig_platform_kind"
                        ON "AnniversaryConfig" (kind) WHERE "clubId" IS NULL`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AnniversaryConfig_club_kind"
                        ON "AnniversaryConfig" ("clubId", kind) WHERE "clubId" IS NOT NULL`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AnniversaryConfigVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "configId" TEXT NOT NULL,

            -- Numero correlativo por configuracion. Es lo que se le muestra al
            -- administrador ("Version 3") y lo que ata una pieza a las
            -- instrucciones que la generaron.
            version INTEGER NOT NULL,
            label TEXT,

            -- La configuracion COMPLETA tal como se publico. No una
            -- referencia: si guardaramos solo el id, editar el borrador
            -- cambiaria retroactivamente lo que dice haber generado una pieza
            -- de hace tres meses.
            config JSONB NOT NULL,
            fingerprint TEXT NOT NULL,

            "publishedBy" TEXT,
            "publishedByEmail" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AnniversaryConfigVersion_config_version"
                        ON "AnniversaryConfigVersion" ("configId", version)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AnniversaryPiece" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

            -- Trazabilidad: con que instrucciones se genero. Es el requisito
            -- 16 del pedido y por eso se guarda el NUMERO ademas del id: el id
            -- sirve para consultar, el numero para leerlo en la ficha.
            "configId" TEXT,
            "versionId" TEXT,
            "versionNumber" INTEGER,

            -- 'public' o 'test'. El panel de pruebas usa la MISMA cadena; lo
            -- unico que cambia es que prueba con el BORRADOR y no con lo
            -- publicado, y que sus piezas no ensucian el contador de uso.
            mode TEXT NOT NULL DEFAULT 'public',

            -- El sitio desde el que se genero, y el club al que se felicita.
            -- No son lo mismo: un distrito genera piezas para sus clubes.
            "clubId" TEXT,
            "subjectClubId" TEXT,
            "clubName" TEXT NOT NULL DEFAULT '',
            years INTEGER,

            "photoUrl" TEXT,
            "photoWidth" INTEGER,
            "photoHeight" INTEGER,

            analysis JSONB,
            copy JSONB,
            branding JSONB,

            "taskId" TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            "backdropUrl" TEXT,
            "zoneId" TEXT,
            "renderMode" TEXT,

            status TEXT NOT NULL DEFAULT 'draft',
            "statusDetail" TEXT,
            validation JSONB,

            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AnniversaryPiece_config_created"
                        ON "AnniversaryPiece" ("configId", "createdAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "AnniversaryPiece_task"
                        ON "AnniversaryPiece" ("taskId") WHERE "taskId" IS NOT NULL`);

    // ── El benchmark del motor (v4.897) ─────────────────────────────
    //
    // Una fila por CORRIDA y una por resultado (modelo x fotografia). Los
    // resultados van en su propia tabla y no en un JSON de la corrida por la
    // misma regla que separo ReelScene de ReelProject: el sondeo escribe un
    // resultado por vez y dos sondeos simultaneos sobre un JSON se pisarian.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AnniversaryBenchmark" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "configId" TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            models JSONB NOT NULL DEFAULT '[]'::jsonb,
            photos JSONB NOT NULL DEFAULT '[]'::jsonb,
            weights JSONB,
            notes TEXT,
            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "finishedAt" TIMESTAMPTZ
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AnniversaryBenchmarkResult" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "benchmarkId" TEXT NOT NULL,
            model TEXT NOT NULL,
            "photoIndex" INTEGER NOT NULL,
            "taskId" TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            "imageUrl" TEXT,
            "latencyMs" INTEGER,
            error TEXT,
            -- Las subnotas automaticas y sus mediciones crudas: sin las
            -- mediciones, un score no se puede explicar ni auditar.
            auto JSONB,
            vote TEXT,
            "dispatchedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AnniversaryBenchmarkResult_cell"
                        ON "AnniversaryBenchmarkResult" ("benchmarkId", model, "photoIndex")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "AnniversaryBenchmark_created"
                        ON "AnniversaryBenchmark" ("createdAt" DESC)`);

    // Ampliaciones. Van FUERA del CREATE porque "CREATE TABLE IF NOT EXISTS"
    // no amplia nada: una base que estreno el modulo antes tiene la tabla sin
    // la columna, y el INSERT fallaria con "column does not exist" —en
    // silencio, porque este modulo degrada—. Es la regla de "EventRegistration"
    // (v4.648) y la de "batchId" en Disbursement (v4.887).
    await db.query(`ALTER TABLE "AnniversaryPiece" ADD COLUMN IF NOT EXISTS "renderMode" TEXT`);
    await db.query(`ALTER TABLE "AnniversaryPiece" ADD COLUMN IF NOT EXISTS branding JSONB`);
    await db.query(`ALTER TABLE "AnniversaryConfig" ADD COLUMN IF NOT EXISTS "publishedVersionId" TEXT`);
    await db.query(`ALTER TABLE "AnniversaryConfig" ADD COLUMN IF NOT EXISTS "publishedBy" TEXT`);
    // v4.897 — el sello del motor por pieza y la configuracion tecnica del
    // motor. La configuracion del motor vive APARTE de draft/published:
    // cambiar el modelo es una decision tecnica, no una version editorial.
    await db.query(`ALTER TABLE "AnniversaryPiece" ADD COLUMN IF NOT EXISTS engine JSONB`);
    await db.query(`ALTER TABLE "AnniversaryConfig" ADD COLUMN IF NOT EXISTS engine JSONB`);

    _ready = true;
}

export default ensureAnniversarySchema;
