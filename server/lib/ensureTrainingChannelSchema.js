// Crea en runtime, de forma perezosa e idempotente, las cinco tablas del
// Canal de Capacitaciones (v4.954).
//
// POR QUÉ RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push`, así que una tabla nueva no se crea sola en producción.
// Mismo patrón que SpotlightSlide y las seis de Campañas de Contribución:
// CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS. Nunca DROP.
//
// NINGÚN cambio en schema.prisma: un modelo declarado ahí y todavía
// inexistente deja en 500 a todo consumidor Prisma desde el primer despliegue
// (regla de `logo_intl`, v4.699). Fuera del schema, las tablas quedan
// protegidas solas por scripts/db-push-guard.mjs (comparación dinámica).
//
// SIN clave foránea a `Media` ni a `MediaFolder`, a propósito: el destino no
// es un modelo de Prisma, así que una restricción declarada sólo acá sería
// otra cosa que `db push` podría quitar en silencio (regla de MediaFolder,
// v4.738). La integridad la sostienen las consultas, que unen por id.
//
// La comprobación previa es la regla de rendimiento de v4.659. La lista de
// objetos comprobados NO es un número de versión: enumera los objetos reales
// del archivo — al agregar una columna hay que agregarla acá, o la
// comprobación rápida la da por presente y no se crea nunca (la trampa de
// v4.908, pagada el mismo día de su estreno).
import db from './db.js';

let _ready = false;

// Tablas del módulo. Se usa también para la comprobación rápida.
const OWNED_TABLES = [
    'MediaChannel', 'MediaChannelVideo', 'MediaChannelComment',
    'MediaChannelProgress', 'MediaChannelMetric',
];

export async function ensureTrainingChannelSchema() {
    if (_ready) return;

    // Las columnas agregadas DESPUÉS del estreno van enumeradas acá — la
    // trampa de v4.908: con el atajo mirando sólo las tablas, una base que ya
    // las tiene daría la columna por presente y el ALTER no correría nunca.
    const OWNED_COLUMNS = [
        ['MediaChannelProgress', 'likedAt'],
    ];
    const { rows } = await db.query(
        `SELECT ${OWNED_TABLES.map((t, i) => `to_regclass('public."${t}"') IS NOT NULL AS t${i}`).join(', ')},
                ${OWNED_COLUMNS.map(([t, c], i) => `EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = '${t}' AND column_name = '${c}') AS c${i}`).join(', ')}`
    );
    if (rows[0]
        && OWNED_TABLES.every((_, i) => rows[0][`t${i}`])
        && OWNED_COLUMNS.every((_, i) => rows[0][`c${i}`])) { _ready = true; return; }

    // El CANAL: una carpeta de la Biblioteca convertida en canal público.
    // Conceptualmente es un modulo de "canales multimedia" — Capacitaciones es
    // el primero, y por eso nada acá se llama "training" en la base: un canal
    // futuro es otra fila, no otra infraestructura.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "MediaChannel" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId" TEXT NOT NULL,
            "folderId" TEXT NOT NULL,

            -- El slug es UNICO POR SITIO: la URL publica es /capacitaciones
            -- (u otra futura) sobre el dominio del sitio.
            slug TEXT NOT NULL DEFAULT 'capacitaciones',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            "bannerUrl" TEXT,

            active BOOLEAN NOT NULL DEFAULT false,
            "defaultPreviewSec" INTEGER NOT NULL DEFAULT 60,
            "completionPct" INTEGER NOT NULL DEFAULT 90,
            "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
            "seoTitle" TEXT,
            "seoDescription" TEXT,

            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    // Un canal por carpeta, y un slug por sitio. Ninguno es parcial: las
    // columnas son NOT NULL, asi que no hay predicado que repetir en un
    // ON CONFLICT (la trampa de v4.648).
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "MediaChannel_folder_key" ON "MediaChannel" ("clubId", "folderId");`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "MediaChannel_slug_key" ON "MediaChannel" ("clubId", slug);`);

    // La FICHA de cada video: la capacitacion LOGICA, relacionada con el
    // archivo fisico (`mediaId` → Media.id). El archivo no gana ni una
    // columna nueva y no se mueve: cero enlaces rotos por construccion.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "MediaChannelVideo" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "channelId" TEXT NOT NULL,
            "mediaId" TEXT NOT NULL,

            slug TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            "thumbUrl" TEXT,
            "durationSec" INTEGER,
            category TEXT,
            tags TEXT[] NOT NULL DEFAULT '{}',
            instructor TEXT,
            "publishedAt" TIMESTAMPTZ,

            -- NULL hereda del canal; un numero (incluido 0) es decision propia.
            "previewSec" INTEGER,
            "accessMode" TEXT NOT NULL DEFAULT 'publico',
            "allowedRoles" TEXT[] NOT NULL DEFAULT '{}',
            "commentsEnabled" BOOLEAN,

            status TEXT NOT NULL DEFAULT 'borrador',
            "sortOrder" INTEGER,

            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "MediaChannelVideo_slug_key" ON "MediaChannelVideo" ("channelId", slug);`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "MediaChannelVideo_media_key" ON "MediaChannelVideo" ("channelId", "mediaId");`);
    await db.query(`CREATE INDEX IF NOT EXISTS "MediaChannelVideo_list_idx" ON "MediaChannelVideo" ("channelId", status, "sortOrder");`);

    // Comentarios: cuelgan de la capacitacion LOGICA, no del archivo — un
    // recorte o un reemplazo del archivo no se lleva la conversacion.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "MediaChannelComment" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "videoId" TEXT NOT NULL,
            "parentId" TEXT,
            "authorRealm" TEXT NOT NULL,
            "authorId" TEXT NOT NULL,
            "authorName" TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'visible',
            pinned BOOLEAN NOT NULL DEFAULT false,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "MediaChannelComment_video_idx" ON "MediaChannelComment" ("videoId", "createdAt" DESC);`);

    // Progreso POR ESPECTADOR: `viewerKey` es `realm:id` con sesion y
    // `anon:<uuid>` sin ella. La misma fila sirve para reanudar, para marcar
    // la completitud, para deduplicar vistas unicas y para que la vista
    // previa no se reinicie con un refresh.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "MediaChannelProgress" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "videoId" TEXT NOT NULL,
            "viewerKey" TEXT NOT NULL,
            "secondsWatched" INTEGER NOT NULL DEFAULT 0,
            "maxPositionSec" INTEGER NOT NULL DEFAULT 0,
            "pctWatched" INTEGER NOT NULL DEFAULT 0,
            "completedAt" TIMESTAMPTZ,
            "lockedAtSec" INTEGER,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "MediaChannelProgress_key" ON "MediaChannelProgress" ("videoId", "viewerKey");`);
    // v4.956 — «Me gusta»: una reacción por espectador, en la MISMA fila del
    // progreso (una segunda tabla para un timestamp sería una verdad más que
    // mantener). NULL = no le gustó; el contador es COUNT(likedAt IS NOT NULL).
    await db.query(`ALTER TABLE "MediaChannelProgress" ADD COLUMN IF NOT EXISTS "likedAt" TIMESTAMPTZ;`);

    // Contadores DIARIOS agregados, como ContributionCampaignMetric (v4.807):
    // sin cookies de rastreo y sin una fila por visita. `videoId` es '' para
    // los eventos del canal — NOT NULL a proposito, para que el indice unico
    // no sea parcial y el ON CONFLICT no tenga predicado que repetir (v4.648).
    await db.query(`
        CREATE TABLE IF NOT EXISTS "MediaChannelMetric" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "channelId" TEXT NOT NULL,
            "videoId" TEXT NOT NULL DEFAULT '',
            date DATE NOT NULL DEFAULT CURRENT_DATE,
            type TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "MediaChannelMetric_key" ON "MediaChannelMetric" ("channelId", "videoId", date, type);`);

    _ready = true;
}

export default ensureTrainingChannelSchema;
