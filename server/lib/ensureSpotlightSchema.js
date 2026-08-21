// Crea en runtime, de forma perezosa e idempotente, la tabla del módulo
// «Slider Global / Llamados a la Acción».
//
// POR QUÉ RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md), así que una tabla nueva no
// se crea sola en producción. Mismo patrón que BannerTemplate, DesignProject
// y las seis de Campañas de Contribución: CREATE TABLE IF NOT EXISTS + ADD
// COLUMN IF NOT EXISTS. Nunca DROP, nunca TRUNCATE.
//
// Y sobre todo: NINGÚN cambio en schema.prisma. Una columna —o un modelo—
// declarado ahí y todavía inexistente en la base deja en 500 a todo consumidor
// Prisma desde el primer despliegue (regla de `logo_intl`, v4.699). Al no
// estar en el schema, la tabla queda protegida por scripts/db-push-guard.mjs.
//
// La comprobación previa (una consulta al catálogo) es la regla de
// rendimiento de v4.659. La lista de objetos comprobados NO es un número de
// versión: enumera los objetos reales del archivo — al agregar una columna
// hay que agregarla acá, o la comprobación rápida la da por presente y no se
// crea nunca (la lección de OWNED_REGISTRATION_COLUMNS, v4.708).
import db from './db.js';

let _ready = false;

export async function ensureSpotlightSchema() {
    if (_ready) return;

    const { rows } = await db.query(
        `SELECT to_regclass('public."SpotlightSlide"') IS NOT NULL AS tabla,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'SpotlightSlide' AND column_name = 'autoplayMs') AS col_autoplay,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'SpotlightSlide' AND column_name = 'clubId') AS col_club`
    );
    if (rows[0]?.tabla && rows[0]?.col_autoplay && rows[0]?.col_club) { _ready = true; return; }

    // El CONTENIDO es un documento (JSONB entero), como el de una campaña:
    // normalizarlo a columnas obligaría a migrar el esquema con cada campo
    // nuevo sin ganar ninguna consulta. Lo que SÍ es columna es lo que se
    // filtra, se ordena o decide el alcance: estado, fechas, prioridad,
    // targeting y el sitio dueño.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "SpotlightSlide" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

            -- El nombre INTERNO: es como se lo encuentra en la lista, y no
            -- se publica en ninguna parte. Distinto del título de la pieza.
            name TEXT NOT NULL,
            "slideType" TEXT NOT NULL DEFAULT 'general',

            content JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Lo GUARDADO; la vigencia se DERIVA al leer con las fechas
            -- (spotlightSpec.slideState). Sin cron: una comparación de fechas
            -- no necesita una pieza que pueda fallar.
            active BOOLEAN NOT NULL DEFAULT false,
            "startAt" TIMESTAMPTZ,
            "endAt" TIMESTAMPTZ,
            priority INTEGER NOT NULL DEFAULT 0,
            "autoplayMs" INTEGER NOT NULL DEFAULT 7000,

            targeting JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- NULL = slide GLOBAL de Club Platform, que es todo lo que hay
            -- hoy. La columna existe desde el primer día para que un slide
            -- LOCAL de un sitio sea una fila más el día que se implemente el
            -- control local — sin migrar nada y, sobre todo, sin duplicar
            -- físicamente los globales para cada sitio.
            "clubId" TEXT,

            "createdBy" TEXT,
            "updatedBy" TEXT,
            "publishedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    // Los dos accesos reales: el barrido de lo servible (la lectura pública,
    // que corre en cada visita de una portada) y el listado del panel.
    await db.query(`CREATE INDEX IF NOT EXISTS "SpotlightSlide_live_idx" ON "SpotlightSlide" (active, priority DESC, "publishedAt" DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "SpotlightSlide_club_idx" ON "SpotlightSlide" ("clubId", priority DESC);`);

    // Columnas agregadas después del estreno. Se enumeran en la comprobación
    // rápida de arriba: sin eso, un despliegue sobre una base que ya tiene la
    // tabla nunca las crearía.
    await db.query(`ALTER TABLE "SpotlightSlide" ADD COLUMN IF NOT EXISTS "autoplayMs" INTEGER NOT NULL DEFAULT 7000;`);
    await db.query(`ALTER TABLE "SpotlightSlide" ADD COLUMN IF NOT EXISTS "clubId" TEXT;`);

    _ready = true;
}

export default ensureSpotlightSchema;
