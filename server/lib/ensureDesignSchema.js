// Crea en runtime, de forma perezosa e idempotente, la tabla del módulo
// "Plantillas IA".
//
// POR QUÉ: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md). Por eso las tablas nuevas no
// se crean solas en producción. Mismo patrón que BannerTemplate, OutroProject y
// las ProjectFair*: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
// Nunca DROP, nunca TRUNCATE.
//
// Al no estar en schema.prisma, `DesignProject` queda protegida por
// scripts/db-push-guard.mjs: un `npm run db:push` avisa antes de borrarla.
//
// La comprobación previa (una consulta al catálogo) es la regla de rendimiento
// de v4.659: estas sentencias son idempotentes pero no gratis, y las pagaba la
// primera visita tras un arranque en frío.
import db from './db.js';

let _ready = false;

export async function ensureDesignSchema() {
    if (_ready) return;

    const { rows } = await db.query(
        `SELECT to_regclass('public."DesignProject"') IS NOT NULL AS tabla,
                to_regclass('public."DesignPublicTemplate"') IS NOT NULL AS publica,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'DesignPublicTemplate' AND column_name = 'composition') AS comp_col,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'DesignPublicTemplate' AND column_name = 'settings') AS settings_col,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'DesignProject' AND column_name = 'copy') AS copy_col,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'DesignProject' AND column_name = 'composition') AS proj_comp_col`
    );
    // Esta lista NO es un número de versión: enumera los objetos reales del
    // archivo. Al agregar una columna hay que agregarla acá o la comprobación
    // rápida la da por presente y no se crea nunca (regla del sitio).
    if (rows[0]?.tabla && rows[0]?.publica && rows[0]?.comp_col && rows[0]?.settings_col
        && rows[0]?.copy_col && rows[0]?.proj_comp_col) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "DesignProject" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            title TEXT NOT NULL DEFAULT 'Diseño sin título',

            -- Quién lo hizo y para quién. "clubId" es el sitio que EDITA;
            -- "subjectClubId" es el club al que se felicita. No son lo mismo:
            -- el Distrito genera piezas para sus clubes.
            "clubId" TEXT,
            "subjectClubId" TEXT,
            "userId" TEXT,
            "userEmail" TEXT,

            "templateId" TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'aniversario',
            format TEXT NOT NULL DEFAULT 'post_1_1',

            -- El documento completo del editor (grafo de escena) y las
            -- variables con las que se compiló. Se guarda ENTERO, como el grafo
            -- de un recorrido del CRM: se lee y se escribe siempre completo, y
            -- normalizarlo obligaría a migrar el esquema cada vez que aparezca
            -- un tipo de nodo nuevo.
            document JSONB NOT NULL DEFAULT '{}'::jsonb,
            variables JSONB NOT NULL DEFAULT '{}'::jsonb,
            branding JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Material de publicación (título, hashtags, CTA, alt). Distinto
            -- del mensaje IMPRESO, que vive dentro de la columna document.
            copy JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Resultado exportado, cuando se guarda en la Biblioteca.
            "imageUrl" TEXT,
            "mediaId" TEXT,
            "thumbUrl" TEXT,

            -- La Composición con IA de ESTE diseño: si está encendida, la imagen
            -- base, el prompt maestro y cuántas variantes. Hasta v4.734 el
            -- navegador la mandaba y el servidor la descartaba, así que se
            -- perdía al guardar y no llegaba nunca al enlace público — se
            -- encendía, se guardaba y todo seguía igual.
            composition JSONB NOT NULL DEFAULT '{}'::jsonb,

            status TEXT NOT NULL DEFAULT 'draft',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    // Aditivas: una instalación anterior a una columna nueva se completa sola.
    for (const col of [
        `ADD COLUMN IF NOT EXISTS copy JSONB NOT NULL DEFAULT '{}'::jsonb`,
        `ADD COLUMN IF NOT EXISTS "subjectClubId" TEXT`,
        `ADD COLUMN IF NOT EXISTS "thumbUrl" TEXT`,
        `ADD COLUMN IF NOT EXISTS "mediaId" TEXT`,
        `ADD COLUMN IF NOT EXISTS composition JSONB NOT NULL DEFAULT '{}'::jsonb`,
    ]) {
        await db.query(`ALTER TABLE "DesignProject" ${col};`).catch(() => {});
    }

    await db.query(`CREATE INDEX IF NOT EXISTS "DesignProject_club_idx" ON "DesignProject" ("clubId", "updatedAt" DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "DesignProject_subject_idx" ON "DesignProject" ("subjectClubId");`);

    // ── La plantilla PUBLICADA que consume el portal público ──────────
    //
    // Guarda el documento COMPILADO, no una referencia al catálogo del código:
    // publicar es CONGELAR. Si apuntara a `designTemplates.js`, tocar ese
    // archivo en un despliegue cambiaría piezas cuyo enlace ya se está
    // compartiendo por WhatsApp.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "DesignPublicTemplate" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            slug TEXT NOT NULL,
            name TEXT NOT NULL,
            intro TEXT,
            category TEXT NOT NULL DEFAULT 'aniversario',
            format TEXT NOT NULL DEFAULT 'post_1_1',

            -- El grafo de escena tal como quedó en el editor.
            document JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- El formulario derivado de las variables que el documento usa.
            fields JSONB NOT NULL DEFAULT '[]'::jsonb,
            -- Lo que el público NO llena y queda fijo: logotipo, distrito,
            -- gobernador, periodo. Es la firma de la pieza.
            frozen JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Composición con IA (v4.722): si esta plantilla publicada manda su
            -- pieza a KIE, con qué prompt maestro y cuántas variantes.
            composition JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Con qué opciones se publicó: qué campos quedaron bloqueados, qué
            -- se congeló y con qué texto de introducción. Se guarda para poder
            -- REPUBLICAR con el mismo criterio cuando el diseño cambia, sin
            -- volver a preguntar nada.
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,

            published BOOLEAN NOT NULL DEFAULT false,
            "clubId" TEXT,
            "projectId" TEXT,
            "createdBy" TEXT,
            uses INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    // El slug es la dirección pública: único en toda la plataforma, porque
    // /plantillas/aniversario no puede llevar a dos piezas distintas.
    // Aditiva: una instalación anterior a v4.722 se completa sola.
    await db.query(`ALTER TABLE "DesignPublicTemplate" ADD COLUMN IF NOT EXISTS composition JSONB NOT NULL DEFAULT '{}'::jsonb;`).catch(() => {});
    await db.query(`ALTER TABLE "DesignPublicTemplate" ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;`).catch(() => {});
    // El enlace público se refresca al guardar el diseño, así que hace falta
    // encontrar la publicación por su proyecto en cada guardado.
    await db.query(`CREATE INDEX IF NOT EXISTS "DesignPublicTemplate_project_idx" ON "DesignPublicTemplate" ("projectId");`).catch(() => {});
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "DesignPublicTemplate_slug_key" ON "DesignPublicTemplate" (slug);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "DesignPublicTemplate_club_idx" ON "DesignPublicTemplate" ("clubId", "updatedAt" DESC);`);

    _ready = true;
}

export default ensureDesignSchema;
