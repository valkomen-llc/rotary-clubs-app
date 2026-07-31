// Crea en runtime, de forma perezosa e idempotente, las tablas del módulo
// "Creador de Reels IA".
//
// POR QUÉ: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md). Por eso las tablas nuevas no
// se crean solas en producción. Mismo patrón que BannerTemplate, OutroProject,
// las ProjectFair* y las del registro de eventos: CREATE TABLE IF NOT EXISTS +
// ALTER ... ADD COLUMN IF NOT EXISTS. Nunca DROP, nunca TRUNCATE.
//
// POR QUÉ FUERA DE PRISMA, teniendo ya un `VideoProject` en el schema: meter
// las escenas en Prisma obligaría a un `npm run db:push` a propósito en cada
// despliegue que las tocara, que es justo el comando que el guard frena. Una
// tabla creada en runtime no depende de que nadie corra nada.
//
// `VideoProject` NO se toca: sigue en Prisma con sus filas y sus
// `ScheduledPost` colgando. `ReelProject` es el módulo nuevo y convive con él,
// igual que conviven `ProjectFairMasterForm` y `ProjectFairProjectForm`.
//
// Al no estar en schema.prisma, estas dos tablas quedan protegidas por
// scripts/db-push-guard.mjs: un `npm run db:push` avisa antes de borrarlas.
//
// La comprobación previa existe por el mismo motivo que en
// ensureEventRegistrationSchema (v4.659): las sentencias son idempotentes pero
// no gratis, y pagarlas en cada arranque en frío se nota en la primera visita.
// La lista de objetos NO es un número de versión: enumera lo que crea este
// archivo, y hay que ampliarla al agregar una tabla o una columna, o la
// comprobación la dará por presente.
import db from './db.js';

let _ready = false;

const EXPECTED_TABLES = ['ReelProject', 'ReelScene', 'ReelCopy', 'ReelNarration', 'ReelUsage'];
// Columnas añadidas después de la creación inicial. La comprobación rápida
// mira que existan: sin esto, una base creada con la versión anterior se daría
// por al día y la columna nueva nunca aparecería.
const EXPECTED_COLUMNS = [
    ['ReelScene', 'frames'], ['ReelScene', 'expandedImageUrl'],
    ['ReelProject', 'tags'], ['ReelProject', 'savedToLibraryAt'],
    ['ReelProject', 'sideTracksAt']
];

export async function ensureReelSchema() {
    if (_ready) return;

    try {
        const { rows } = await db.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
            [EXPECTED_TABLES]
        );
        if (rows.length === EXPECTED_TABLES.length) {
            const { rows: cols } = await db.query(
                `SELECT table_name, column_name FROM information_schema.columns
                 WHERE table_schema = 'public' AND (table_name, column_name) IN (${
                    EXPECTED_COLUMNS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
                 })`,
                EXPECTED_COLUMNS.flat()
            );
            if (cols.length === EXPECTED_COLUMNS.length) {
                _ready = true;
                return;
            }
        }
    } catch { /* si el catálogo no responde, se ejecutan las sentencias igual */ }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ReelProject" (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            "clubId" TEXT,
            "userId" TEXT,
            "userEmail" TEXT,
            "organizationName" TEXT,

            -- Contexto estratégico, el mismo del Generador de Publicaciones
            -- (v4.667). Enriquece TODA la generación: prompts de escena, copy y
            -- guion de narración.
            "publicationType" TEXT NOT NULL DEFAULT 'standard',
            "interestArea" TEXT NOT NULL DEFAULT 'general',

            -- Lo que eligió el usuario
            format TEXT NOT NULL DEFAULT '9:16',
            "qualityTier" TEXT NOT NULL DEFAULT 'fullhd',
            "motionStyle" TEXT NOT NULL DEFAULT 'auto',
            transition TEXT NOT NULL DEFAULT 'auto',
            "musicStyle" TEXT NOT NULL DEFAULT 'auto',
            config JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Motor de video
            engine TEXT NOT NULL DEFAULT 'kling26',
            "engineModel" TEXT,

            -- Dirección: análisis de las tres fotos y decisiones de montaje
            analysis JSONB,
            direction JSONB,

            -- Banda sonora
            "musicProvider" TEXT,
            "musicTaskId" TEXT,
            "musicUrl" TEXT,
            "musicS3Key" TEXT,
            "musicPrompt" TEXT,
            "musicMediaId" TEXT,

            -- Montaje
            "renderProvider" TEXT,
            "renderJobId" TEXT,
            "renderRaw" JSONB,
            "renderSpec" JSONB,

            -- Ciclo de vida
            status TEXT NOT NULL DEFAULT 'draft',
            "statusDetail" TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            notes JSONB NOT NULL DEFAULT '[]'::jsonb,

            -- Resultado
            "videoUrl" TEXT,
            "s3Key" TEXT,
            "posterUrl" TEXT,
            "providerUrl" TEXT,
            "durationSec" DOUBLE PRECISION,
            width INTEGER,
            height INTEGER,
            "bitrateKbps" INTEGER,
            "sizeBytes" BIGINT,
            "hasAudio" BOOLEAN,
            quality JSONB,

            -- Trazabilidad
            "creditsEstimated" INTEGER NOT NULL DEFAULT 0,
            "processingMs" INTEGER,
            "mediaId" TEXT,
            "parentId" TEXT,
            version TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS "ReelProject_clubId_idx"     ON "ReelProject"("clubId");
        CREATE INDEX IF NOT EXISTS "ReelProject_status_idx"     ON "ReelProject"(status);
        CREATE INDEX IF NOT EXISTS "ReelProject_renderJob_idx"  ON "ReelProject"("renderJobId");
        CREATE INDEX IF NOT EXISTS "ReelProject_musicTask_idx"  ON "ReelProject"("musicTaskId");
        CREATE INDEX IF NOT EXISTS "ReelProject_createdAt_idx"  ON "ReelProject"("createdAt" DESC);

        -- Una fila por escena. Vive aparte del proyecto a propósito: regenerar
        -- UNA escena sin tocar las otras dos es un requisito del módulo, y con
        -- las escenas dentro de un JSON del proyecto dos regeneraciones
        -- simultáneas se pisarían la una a la otra.
        CREATE TABLE IF NOT EXISTS "ReelScene" (
            id TEXT PRIMARY KEY,
            "projectId" TEXT NOT NULL REFERENCES "ReelProject"(id) ON DELETE CASCADE,

            -- Copiados del proyecto a propósito. Regenerar UNA escena sin tocar
            -- las otras es un requisito del módulo, y con estos dos campos acá
            -- la operación se resuelve con la fila de la escena: no hace falta
            -- volver a leer el proyecto para saber a qué bucket va el archivo
            -- ni en qué formato se pidió.
            "clubId" TEXT,
            format TEXT NOT NULL DEFAULT '9:16',

            -- Posición en el montaje final y de qué foto salió
            position INTEGER NOT NULL,
            "sourceIndex" INTEGER NOT NULL,
            "sourceImageUrl" TEXT NOT NULL,
            "sourceMediaId" TEXT,
            "sourceReport" JSONB,

            -- Adaptación del lienzo al formato del Reel (v4.665). La foto
            -- ORIGINAL nunca se pisa: sourceImageUrl sigue apuntando a ella y
            -- la adaptada vive aparte. Es lo que permite comparar las dos,
            -- rehacer la adaptación y volver atrás.
            "expandedImageUrl" TEXT,
            "expandedS3Key" TEXT,
            "expansionTaskId" TEXT,
            "expansionProvider" TEXT,
            "expansionPrompt" TEXT,
            "expansionReport" JSONB,
            "expansionAttempts" INTEGER NOT NULL DEFAULT 0,

            -- Dirección de esta escena
            style TEXT,
            "transitionOut" TEXT,
            prompt TEXT,
            analysis JSONB,
            note TEXT,

            -- Duración pedida por el montaje y la que sabe entregar el motor
            "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 5,
            "generatedDurationSec" DOUBLE PRECISION,

            -- Motor
            engine TEXT,
            "engineModel" TEXT,
            "kieJobId" TEXT,
            "kieRaw" JSONB,

            -- Ciclo de vida
            status TEXT NOT NULL DEFAULT 'pending',
            "statusDetail" TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,

            -- Resultado
            "videoUrl" TEXT,
            "s3Key" TEXT,
            "providerUrl" TEXT,
            "posterUrl" TEXT,
            width INTEGER,
            height INTEGER,
            "bitrateKbps" INTEGER,
            "sizeBytes" BIGINT,
            quality JSONB,
            fidelity JSONB,
            -- Fotogramas extraídos del clip (v4.664): su URL, el segundo del
            -- que salieron y su comparación estructural. Es el historial
            -- técnico de la comprobación de fidelidad — poder mirar DESPUÉS
            -- qué se comparó es lo que hace revisable un veredicto automático.
            frames JSONB NOT NULL DEFAULT '[]'::jsonb,

            "creditsEstimated" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE "ReelScene" ADD COLUMN IF NOT EXISTS frames JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE "ReelScene" ADD COLUMN IF NOT EXISTS "expandedImageUrl" TEXT;
        ALTER TABLE "ReelScene" ADD COLUMN IF NOT EXISTS "expandedS3Key" TEXT;
        ALTER TABLE "ReelScene" ADD COLUMN IF NOT EXISTS "expansionTaskId" TEXT;
        ALTER TABLE "ReelScene" ADD COLUMN IF NOT EXISTS "expansionProvider" TEXT;
        ALTER TABLE "ReelScene" ADD COLUMN IF NOT EXISTS "expansionPrompt" TEXT;
        ALTER TABLE "ReelScene" ADD COLUMN IF NOT EXISTS "expansionReport" JSONB;
        ALTER TABLE "ReelScene" ADD COLUMN IF NOT EXISTS "expansionAttempts" INTEGER NOT NULL DEFAULT 0;

        CREATE INDEX IF NOT EXISTS "ReelScene_expansionTask_idx" ON "ReelScene"("expansionTaskId");

        CREATE INDEX IF NOT EXISTS "ReelScene_projectId_idx" ON "ReelScene"("projectId", position);

        -- Copies de publicación, UNA FILA POR VERSIÓN. Nunca se actualiza el
        -- texto de una fila existente: editar o regenerar inserta una versión
        -- nueva y baja la bandera de la anterior. Es lo que permite volver a un
        -- texto que ya gustaba después de haber probado otro, y lo que exige el
        -- requisito de no sobrescribir nada.
        --
        -- La clave es (proyecto, plataforma, idioma, versión): así conviven el
        -- copy de TikTok en español y en inglés sin pisarse, y cada uno lleva su
        -- propio historial.
        CREATE TABLE IF NOT EXISTS "ReelCopy" (
            id TEXT PRIMARY KEY,
            "projectId" TEXT NOT NULL REFERENCES "ReelProject"(id) ON DELETE CASCADE,
            "clubId" TEXT,

            platform TEXT NOT NULL,
            locale TEXT NOT NULL DEFAULT 'es',
            version INTEGER NOT NULL DEFAULT 1,
            "isCurrent" BOOLEAN NOT NULL DEFAULT TRUE,

            -- Comunes a la pieza; se copian en cada versión a propósito, para
            -- que una versión antigua siga siendo legible por sí sola.
            title TEXT,
            subtitle TEXT,
            hook TEXT,
            category TEXT,
            "marketingGoal" TEXT,
            audience TEXT,
            keywords JSONB NOT NULL DEFAULT '[]'::jsonb,

            -- Propios de la plataforma
            description TEXT,
            cta TEXT,
            hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
            "fullText" TEXT,
            "charCount" INTEGER,

            -- Procedencia: 'ai' | 'manual' | 'translation'
            source TEXT NOT NULL DEFAULT 'ai',
            provider TEXT,
            model TEXT,
            prompt TEXT,
            "isFavorite" BOOLEAN NOT NULL DEFAULT FALSE,

            "createdBy" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE "ReelProject" ADD COLUMN IF NOT EXISTS "publicationType" TEXT NOT NULL DEFAULT 'standard';
        ALTER TABLE "ReelProject" ADD COLUMN IF NOT EXISTS "interestArea" TEXT NOT NULL DEFAULT 'general';
        ALTER TABLE "ReelProject" ADD COLUMN IF NOT EXISTS narration JSONB;

        CREATE INDEX IF NOT EXISTS "ReelCopy_project_idx" ON "ReelCopy"("projectId", platform, locale);

        -- Narración, UNA FILA POR VERSIÓN igual que los copies. Cambiar el
        -- idioma, el acento o el estilo genera otra versión y conserva la
        -- anterior: es lo que permite volver a una voz que ya gustaba sin
        -- volver a renderizar el video.
        CREATE TABLE IF NOT EXISTS "ReelNarration" (
            id TEXT PRIMARY KEY,
            "projectId" TEXT NOT NULL REFERENCES "ReelProject"(id) ON DELETE CASCADE,
            "clubId" TEXT,

            version INTEGER NOT NULL DEFAULT 1,
            "isCurrent" BOOLEAN NOT NULL DEFAULT TRUE,

            script TEXT NOT NULL,
            words INTEGER,
            rationale TEXT,
            language TEXT NOT NULL DEFAULT 'es-CO',
            style TEXT NOT NULL DEFAULT 'institucional',
            gender TEXT NOT NULL DEFAULT 'female',
            speed DOUBLE PRECISION NOT NULL DEFAULT 1,

            -- Audio
            "audioUrl" TEXT,
            "audioS3Key" TEXT,
            "ttsProvider" TEXT,
            "voiceId" TEXT,

            -- Lo que midió el Narrative Timing Engine. Se guarda entero porque
            -- es la prueba de la sincronía: cuántos intentos, qué desvío y si
            -- entró en tolerancia.
            timing JSONB,
            "actualSec" DOUBLE PRECISION,
            "targetSec" DOUBLE PRECISION,
            "driftSec" DOUBLE PRECISION,
            "withinTolerance" BOOLEAN,

            source TEXT NOT NULL DEFAULT 'ai',
            "scriptProvider" TEXT,
            "scriptModel" TEXT,
            "createdBy" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS "ReelNarration_project_idx" ON "ReelNarration"("projectId");
        CREATE UNIQUE INDEX IF NOT EXISTS "ReelNarration_current_uniq"
            ON "ReelNarration"("projectId") WHERE "isCurrent";
        -- Un solo copy vigente por plataforma e idioma. El índice parcial es lo
        -- que hace imposible que dos versiones se declaren vigentes a la vez.
        CREATE UNIQUE INDEX IF NOT EXISTS "ReelCopy_current_uniq"
            ON "ReelCopy"("projectId", platform, locale) WHERE "isCurrent";
        CREATE INDEX IF NOT EXISTS "ReelScene_kieJobId_idx"  ON "ReelScene"("kieJobId");
        CREATE INDEX IF NOT EXISTS "ReelScene_status_idx"    ON "ReelScene"(status);

        -- Registro de consumo por proveedor (v4.669). Una fila por llamada a un
        -- servicio externo. Es lo que alimenta el panel de auditoría: sin él,
        -- «qué proveedor gastó qué» sólo se puede contestar leyendo el código.
        --
        -- Las columnas scope y expectedProvider son la parte que hace visible
        -- la separación de responsabilidades: se guarda quién DEBÍA atender la
        -- operación y quién la atendió de verdad.
        CREATE TABLE IF NOT EXISTS "ReelUsage" (
            id TEXT PRIMARY KEY,
            "projectId" TEXT NOT NULL REFERENCES "ReelProject"(id) ON DELETE CASCADE,
            "clubId" TEXT,
            "sceneId" TEXT,

            operation TEXT NOT NULL,
            scope TEXT,
            provider TEXT,
            "expectedProvider" TEXT,
            model TEXT,

            -- Unidades naturales del proveedor: caracteres de voz, segundos de
            -- música, tokens del modelo, créditos de video. La columna credits
            -- es NUESTRA estimación, no el saldo del proveedor.
            units DOUBLE PRECISION NOT NULL DEFAULT 0,
            unit TEXT,
            credits INTEGER NOT NULL DEFAULT 0,

            ms INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ok',
            detail TEXT,
            target TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS "ReelUsage_project_idx" ON "ReelUsage"("projectId", "createdAt");
        CREATE INDEX IF NOT EXISTS "ReelUsage_month_idx"   ON "ReelUsage"("createdAt" DESC);

        -- Biblioteca: etiquetas editables y marca de cuándo entró.
        ALTER TABLE "ReelProject" ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE "ReelProject" ADD COLUMN IF NOT EXISTS "savedToLibraryAt" TIMESTAMP(3);
        ALTER TABLE "ReelProject" ADD COLUMN IF NOT EXISTS description TEXT;

        -- Reserva de las tareas paralelas (música, copies, locución). Es lo que
        -- impide que dos sondeos simultáneos lancen la misma dos veces.
        ALTER TABLE "ReelProject" ADD COLUMN IF NOT EXISTS "sideTracksAt" TIMESTAMP(3);
    `);

    _ready = true;
}
