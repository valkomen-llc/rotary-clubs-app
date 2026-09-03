// Crea en runtime, de forma perezosa e idempotente, las tablas de las
// redirecciones de enlaces y su medición.
//
// POR QUÉ EN RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push`, así que una tabla nueva del schema no aparece sola en
// producción. Mismo patrón que `ensureDistributionSchema` y las `ProjectFair*`.
//
// POR QUÉ TABLAS Y NO EL JSON DE `Setting`: hasta v4.992 las redirecciones
// vivían en un único `Setting` con clave `link_redirects` — un array JSON por
// sitio. Eso las dejaba sin ID estable, sin estado, sin autor, sin historial y
// sin ningún sitio donde colgar un clic; y sobre todo las dejaba a merced de
// que cualquier guardado del panel reescribiera el documento entero. Ver la
// sección del módulo en CLAUDE.md.
//
// LAS CINCO TABLAS VAN EN LA LISTA DEL GUARDIÁN DE `db:push`
// (`scripts/db-push-guard.mjs`). Sin eso, el primer `npm run db:push` se lleva
// las redirecciones activas del ecosistema y todo su histórico de clics.
import db from './db.js';

let _ready = false;

// Lo que este archivo crea. La comprobación previa los cuenta contra el
// catálogo para no gastar viajes a la base en cada arranque en frío.
//
// NO ES UN NÚMERO DE VERSIÓN: es la lista real de lo que hay abajo, y hay que
// ampliarla al agregar algo o la comprobación lo dará por presente. La trampa
// se pagó en v4.908 con `AnniversaryPiece.request`.
const EXPECTED_TABLES = [
    'LinkRedirect',
    'LinkRedirectEvent',
    'LinkRedirectDaily',
    'LinkRedirectVisitor',
    'LinkRedirectAudit',
];

// Toda columna agregada con `ADD COLUMN IF NOT EXISTS` va enumerada acá:
// `CREATE TABLE IF NOT EXISTS` no amplía nada, así que una base que estrenó el
// módulo antes tiene las tablas y NO la columna nueva, y con el atajo mirando
// sólo tablas el `ALTER` no correría nunca.
const EXPECTED_COLUMNS = [];

export async function ensureLinkRedirectSchema() {
    if (_ready) return;

    const [tablesR, colsR] = await Promise.all([
        db.query(
            `SELECT table_name FROM information_schema.tables
              WHERE table_schema = current_schema() AND table_name = ANY($1)`,
            [EXPECTED_TABLES]
        ),
        EXPECTED_COLUMNS.length
            ? db.query(
                `SELECT table_name, column_name FROM information_schema.columns
                  WHERE table_schema = current_schema() AND table_name = ANY($1)`,
                [[...new Set(EXPECTED_COLUMNS.map(([t]) => t))]]
            )
            : Promise.resolve({ rows: [] }),
    ]);
    const haveTables = new Set(tablesR.rows.map(r => r.table_name));
    const haveCols = new Set(colsR.rows.map(r => `${r.table_name}.${r.column_name}`));
    if (EXPECTED_TABLES.every(t => haveTables.has(t))
        && EXPECTED_COLUMNS.every(([t, c]) => haveCols.has(`${t}.${c}`))) {
        _ready = true;
        return;
    }

    await db.query(`
        -- ═══════════════════════════════════════════════════════════════════
        -- EL ENLACE. Una fila con identidad propia.
        -- ═══════════════════════════════════════════════════════════════════
        --
        -- Sin claves foráneas, igual que el resto de los módulos fuera de
        -- Prisma: "clubId" apunta al SITIO —un Club, incluido el club-sitio de
        -- un distrito (v4.744)— y resolver la relación por columna evita que
        -- un borrado en cascada de otro módulo se lleve el historial.
        CREATE TABLE IF NOT EXISTS "LinkRedirect" (
            id TEXT PRIMARY KEY,
            "clubId" TEXT NOT NULL,

            -- La dirección corta, ya canonizada por normalizeFrom(): con barra
            -- inicial, en minúsculas, sin barra final, sin query y sin ancla.
            slug TEXT NOT NULL,
            target TEXT NOT NULL,

            -- 302 por defecto. Lo permanente se elige a sabiendas: un 301
            -- cacheado deja de preguntar, o sea que deja de contarse.
            permanent BOOLEAN NOT NULL DEFAULT FALSE,

            -- Propagar la query al destino es lo correcto para una inscripción
            -- y es ruido para otros destinos. Medir los UTM no depende de esto.
            "forwardQuery" BOOLEAN NOT NULL DEFAULT TRUE,

            -- active | paused. Pausar NO borra: el enlace deja de saltar y
            -- conserva todo su histórico.
            status TEXT NOT NULL DEFAULT 'active',

            -- Borrado suave. Eliminar un enlace no puede llevarse la respuesta
            -- a "cuanta gente entró por el pendón que imprimimos en marzo".
            "deletedAt" TIMESTAMP(3),
            "deletedBy" TEXT,

            notes TEXT NOT NULL DEFAULT '',

            -- Contadores exactos, mantenidos en la misma ida a la base que
            -- registra el clic. Son lo que hace que el listado no tenga que
            -- recorrer eventos para pintar una fila.
            "totalClicks" INTEGER NOT NULL DEFAULT 0,
            "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
            "botHits" INTEGER NOT NULL DEFAULT 0,
            "lastClickAt" TIMESTAMP(3),

            -- Trazabilidad administrativa. El detalle de cada cambio vive en
            -- "LinkRedirectAudit"; acá queda lo que el listado necesita.
            "createdBy" TEXT,
            "createdByName" TEXT NOT NULL DEFAULT '',
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
            "updatedBy" TEXT,
            "updatedByName" TEXT NOT NULL DEFAULT '',
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
        );

        -- Dos enlaces vivos no pueden reclamar la misma dirección del mismo
        -- sitio. Es PARCIAL para que un slug borrado quede libre otra vez, así
        -- que su ON CONFLICT tendría que repetir el predicado: por eso el alta
        -- comprueba el duplicado y devuelve 409 en vez de apoyarse en él
        -- (misma decisión que MediaFolder, v4.738).
        CREATE UNIQUE INDEX IF NOT EXISTS "LinkRedirect_slug_key"
            ON "LinkRedirect" ("clubId", slug) WHERE "deletedAt" IS NULL;

        -- La resolución pública lee por sitio y sólo lo vivo y activo.
        CREATE INDEX IF NOT EXISTS "LinkRedirect_site_idx"
            ON "LinkRedirect" ("clubId", status) WHERE "deletedAt" IS NULL;

        -- ═══════════════════════════════════════════════════════════════════
        -- EL CLIC. Una fila por visita HUMANA.
        -- ═══════════════════════════════════════════════════════════════════
        --
        -- Los bots NO entran acá y es deliberado: una dirección compartida en
        -- veinte chats de WhatsApp genera veinte vistas previas, y guardarlas
        -- una por una llena la tabla de ruido para no poder mostrarlo mejor de
        -- lo que ya lo muestra el contador diario. De un bot se guarda que
        -- ocurrió, no cada vez.
        --
        -- NO HAY COLUMNA DE IP, y no es un olvido: la IP entra en la semilla
        -- del identificador y sale como hash. Lo que se persiste es el hash.
        CREATE TABLE IF NOT EXISTS "LinkRedirectEvent" (
            id TEXT PRIMARY KEY,
            "linkId" TEXT NOT NULL,
            "clubId" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),

            -- Identificador seudónimo del visitante. Ver linkTracking.js.
            "visitorKey" TEXT NOT NULL DEFAULT '',
            "isNewVisitor" BOOLEAN NOT NULL DEFAULT FALSE,

            "referrer" TEXT NOT NULL DEFAULT '',
            "referrerHost" TEXT NOT NULL DEFAULT '',
            "sourceKind" TEXT NOT NULL DEFAULT 'directo',
            "sourceLabel" TEXT NOT NULL DEFAULT '',
            "sourceEvidence" TEXT NOT NULL DEFAULT 'ninguna',

            "utmSource" TEXT NOT NULL DEFAULT '',
            "utmMedium" TEXT NOT NULL DEFAULT '',
            "utmCampaign" TEXT NOT NULL DEFAULT '',
            "utmContent" TEXT NOT NULL DEFAULT '',
            "utmTerm" TEXT NOT NULL DEFAULT '',

            device TEXT NOT NULL DEFAULT 'desconocido',
            browser TEXT NOT NULL DEFAULT '',
            os TEXT NOT NULL DEFAULT '',

            country TEXT NOT NULL DEFAULT '',
            region TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',

            "userAgent" TEXT NOT NULL DEFAULT ''
        );

        -- Todo desglose de la pantalla de estadísticas es "este enlace, en este
        -- rango": el índice es el que lo hace barato por muchos eventos que
        -- acumule la plataforma.
        CREATE INDEX IF NOT EXISTS "LinkRedirectEvent_link_idx"
            ON "LinkRedirectEvent" ("linkId", "createdAt" DESC);

        -- ═══════════════════════════════════════════════════════════════════
        -- EL AGREGADO DIARIO. Una fila por enlace y por día.
        -- ═══════════════════════════════════════════════════════════════════
        --
        -- Es lo que responde el gráfico y las cifras de cabecera sin tocar un
        -- solo evento: un enlace clicado a diario durante dos años son 730
        -- filas. Mismo patrón que "ContributionCampaignMetric" (v4.807) y que
        -- "MediaChannelMetric" (v4.954).
        --
        -- La clave primaria NO es parcial, así que su ON CONFLICT va a secas.
        CREATE TABLE IF NOT EXISTS "LinkRedirectDaily" (
            "linkId" TEXT NOT NULL,
            "clubId" TEXT NOT NULL,
            day DATE NOT NULL,
            clicks INTEGER NOT NULL DEFAULT 0,
            uniques INTEGER NOT NULL DEFAULT 0,
            bots INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY ("linkId", day)
        );

        CREATE INDEX IF NOT EXISTS "LinkRedirectDaily_site_idx"
            ON "LinkRedirectDaily" ("clubId", day);

        -- ═══════════════════════════════════════════════════════════════════
        -- EL VISITANTE. Lo que hace EXACTO el contador de únicos.
        -- ═══════════════════════════════════════════════════════════════════
        --
        -- Sin esta tabla, "visitantes únicos de todo el historial" exigiría un
        -- COUNT(DISTINCT) sobre todos los eventos del enlace en cada listado.
        -- Con ella el dato se decide UNA vez, al insertar: si la fila es nueva,
        -- el visitante es nuevo. La consulta del listado no cuenta nada.
        --
        -- Y responde además "cuántos volvieron", que un COUNT(DISTINCT) no da.
        CREATE TABLE IF NOT EXISTS "LinkRedirectVisitor" (
            "linkId" TEXT NOT NULL,
            "visitorKey" TEXT NOT NULL,
            "firstSeenAt" TIMESTAMP(3) NOT NULL,
            "lastSeenAt" TIMESTAMP(3) NOT NULL,
            clicks INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY ("linkId", "visitorKey")
        );

        -- ═══════════════════════════════════════════════════════════════════
        -- LA AUDITORÍA ADMINISTRATIVA. Sólo agrega.
        -- ═══════════════════════════════════════════════════════════════════
        --
        -- No se edita ni se borra una fila: corregir es escribir otro evento.
        -- Es lo único que contesta "¿por qué este enlace lleva a otro sitio que
        -- en marzo?" dentro de seis meses.
        CREATE TABLE IF NOT EXISTS "LinkRedirectAudit" (
            id TEXT PRIMARY KEY,
            "linkId" TEXT NOT NULL,
            "clubId" TEXT NOT NULL,
            action TEXT NOT NULL,
            "actorId" TEXT,
            "actorName" TEXT NOT NULL DEFAULT '',
            "fromTarget" TEXT NOT NULL DEFAULT '',
            "toTarget" TEXT NOT NULL DEFAULT '',
            "fromStatus" TEXT NOT NULL DEFAULT '',
            "toStatus" TEXT NOT NULL DEFAULT '',
            detail TEXT NOT NULL DEFAULT '',
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "LinkRedirectAudit_link_idx"
            ON "LinkRedirectAudit" ("linkId", "createdAt" DESC);
    `);

    _ready = true;
}

export default { ensureLinkRedirectSchema };
