// Crea en runtime, de forma perezosa e idempotente, las dos tablas del
// Director Creativo IA.
//
// POR QUÉ FUERA DE PRISMA: tras el incidente del 2026-07-13 el build ya NO
// ejecuta `prisma db push` (regla durable, ver CLAUDE.md), así que una tabla
// declarada en `schema.prisma` no se crearía sola en producción — y una columna
// declarada y todavía inexistente deja en 500 todo lo que consulte ese modelo
// con Prisma. Mismo patrón que `DesignProject`, `EcosystemClone` y las
// `ProjectFair*`: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS. Nunca
// DROP, nunca TRUNCATE.
//
// Al no estar en `schema.prisma`, las dos quedan protegidas por
// `scripts/db-push-guard.mjs`: un `npm run db:push` avisa antes de borrarlas.
//
// La comprobación previa es la regla de rendimiento de v4.659: estas sentencias
// son idempotentes pero no gratis, y las pagaba la primera visita tras un
// arranque en frío.
import db from './db.js';

let _ready = false;

export async function ensureCreativeSchema() {
    if (_ready) return;

    const { rows } = await db.query(
        `SELECT to_regclass('public."CreativeProfile"') IS NOT NULL AS perfil,
                to_regclass('public."CreativeReference"') IS NOT NULL AS referencia`
    );
    // Esta lista NO es un número de versión: enumera los objetos reales del
    // archivo. Al agregar una columna hay que agregarla acá, o la comprobación
    // rápida la da por presente y no se crea nunca.
    if (rows[0]?.perfil && rows[0]?.referencia) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "CreativeProfile" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

            -- El sitio dueño del perfil. NULL = de la plataforma, visible para
            -- todos: es el caso del Distrito que define el estilo de la casa.
            "clubId" TEXT,
            name TEXT NOT NULL DEFAULT 'Estilo sin nombre',

            -- ── EL VERSIONADO ────────────────────────────────────
            --
            -- Cambiar las referencias NUNCA reescribe un perfil: inserta una
            -- versión nueva y baja la bandera de la anterior. Es la exigencia
            -- expresa del pedido —"que cambiar las referencias no sobrescriba
            -- un estilo en silencio"— y es además lo que impide que una campaña
            -- ya generada cambie de aspecto sola. Mismo patrón que "ReelCopy".
            version INTEGER NOT NULL DEFAULT 1,
            "isCurrent" BOOLEAN NOT NULL DEFAULT TRUE,

            -- El Design DNA completo: { version, measured, described, derived }.
            -- Documento JSON porque se lee y se escribe siempre entero, y
            -- normalizarlo obligaría a migrar el esquema cada vez que aparezca
            -- un rasgo nuevo. Mismo criterio que el grafo de un recorrido del CRM.
            dna JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Lo que el análisis quiso decir y no cabe en el DNA: qué se
            -- descartó, qué referencia no se pudo leer, si no hubo modelo de
            -- visión. Sin esto, un perfil a medias se ve igual que uno completo.
            notes JSONB NOT NULL DEFAULT '[]'::jsonb,

            -- Sólo un perfil ACTIVO por sitio: el que se usa cuando no se elige
            -- ninguno. Distinto de "isCurrent", que marca la última versión de
            -- ESTE perfil.
            active BOOLEAN NOT NULL DEFAULT FALSE,

            "analyzedAt" TIMESTAMP(3),
            "createdBy" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "CreativeReference" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "profileId" TEXT NOT NULL,

            -- La imagen vive en la Biblioteca Multimedia, como todo lo demás.
            -- Acá se guarda su dirección y —si vino de ahí— el id de su fila en
            -- "Media", que es el puente con el resto de la plataforma.
            url TEXT NOT NULL,
            "mediaId" TEXT,
            label TEXT,

            -- Lo MEDIDO y lo DESCRITO de ESTA referencia, por separado. Se
            -- guardan los dos aunque el perfil ya tenga su DNA consolidado: sin
            -- ellos, "¿por qué el perfil dice que el titular es condensado?" no
            -- tiene dónde mirarse. Es el mismo vacío que el CRM tenía antes de
            -- "CrmWebhookEvent".
            measured JSONB,
            described JSONB,
            notes JSONB NOT NULL DEFAULT '[]'::jsonb,

            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Un solo perfil vigente por sitio y por nombre. El índice es PARCIAL, así
    // que cualquier ON CONFLICT contra él tiene que repetir el predicado o la
    // sentencia falla entera — error real que costó una corrección en v4.648.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "CreativeProfile_vigente_idx"
            ON "CreativeProfile" ("clubId", name) WHERE "isCurrent";
    `).catch(() => {});

    await db.query(`CREATE INDEX IF NOT EXISTS "CreativeProfile_club_idx" ON "CreativeProfile" ("clubId", "isCurrent");`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "CreativeReference_perfil_idx" ON "CreativeReference" ("profileId", "sortOrder");`).catch(() => {});

    _ready = true;
}

export default ensureCreativeSchema;
