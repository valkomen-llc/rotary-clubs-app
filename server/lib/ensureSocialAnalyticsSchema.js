// ════════════════════════════════════════════════════════════════════════════
// Analítica de Redes Sociales — el esquema, en runtime (v4.1053)
//
// CUATRO tablas fuera de Prisma, sin clave foránea a `SocialAccount`, por el
// motivo de siempre (regla de `logo_intl`, v4.699): `SocialAccount` se
// consulta con Prisma **sin `select`** en el camino que PUBLICA, así que una
// columna declarada y todavía inexistente dejaría en 500 la publicación — y el
// `build` no ejecuta `db push` desde el incidente del 2026-07-13, así que ese
// «hasta que alguien lo corra» no tiene fecha. **`SocialAccount` no gana ni una
// columna**: el vínculo va desde acá, nunca al revés.
//
// ⚠️ TAMPOCO SE AMPLÍA `SocialMetricSnapshot`. Aquélla es de Prisma y guarda
// una CAPTURA —un JSON con el último valor conocido, fechado por `capturedAt`—;
// esto es una SERIE HISTÓRICA, fechada por el día al que el dato PERTENECE.
// Son dos cosas: una captura del martes puede traer el dato del lunes, y sin
// esa distinción no hay idempotencia posible —una segunda sincronización del
// mismo rango duplicaría cada día— ni forma de rellenar un hueco. La tabla
// vieja se conserva entera: el Hub Social la sigue leyendo.
//
//   SocialDailyMetric    la serie. Una fila por (cuenta × día × métrica).
//   SocialContentItem    cada publicación/Reel con su ficha.
//   SocialContentMetric  la performance de una pieza, fechada por captura.
//   SocialSyncRun        qué se sincronizó, cuándo, qué falló y hasta dónde.
//
// Están en la lista del guardián de `db:push`.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` va ENUMERADO acá (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía nada, y con el atajo mirando sólo las tablas un
// ALTER nuevo no correría jamás — el INSERT fallaría con «column does not
// exist», en silencio, porque este módulo degrada.
const OWNED_COLUMNS = {
    // (vacío hoy: el esquema estrena completo. Al agregar una columna, va acá
    //  con su ALTER y su nombre en la comprobación de abajo.)
};

const EXPECTED_COLUMNS = Object.values(OWNED_COLUMNS).reduce((n, c) => n + c.length, 0);

export async function ensureSocialAnalyticsSchema() {
    if (_ready) return;

    const { rows } = await db.query(`
        SELECT to_regclass('public."SocialDailyMetric"')   IS NOT NULL AS a,
               to_regclass('public."SocialContentItem"')   IS NOT NULL AS b,
               to_regclass('public."SocialContentMetric"') IS NOT NULL AS c,
               to_regclass('public."SocialSyncRun"')       IS NOT NULL AS d
    `);
    if (rows[0]?.a && rows[0]?.b && rows[0]?.c && rows[0]?.d && EXPECTED_COLUMNS === 0) {
        _ready = true;
        return;
    }

    // ⚠️ NI UNA COMILLA INVERTIDA DENTRO DE ESTE LITERAL, tampoco en un
    // comentario del SQL: cierra el template a mitad y el módulo entero deja
    // de parsear. Van cuatro veces en este repositorio (v4.721.1, v4.847,
    // v4.998, v4.1017) y lo atrapa `npm run check:syntax`.
    await db.query(`
        -- ── La serie histórica ──────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS "SocialDailyMetric" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

            -- El TENANT. Sale del token, nunca del cuerpo de la peticion.
            "clubId" TEXT NOT NULL,

            -- La cuenta. Apunta a SocialAccount sin FK: esa tabla es de Prisma
            -- y una FK declarada solo aca seria otra cosa que db push podria
            -- quitar en silencio.
            "accountId" TEXT NOT NULL,
            platform TEXT NOT NULL,

            -- El dia al que el dato PERTENECE, no cuando se capturo. Es lo que
            -- hace idempotente una resincronizacion del mismo rango.
            "metricDate" DATE NOT NULL,

            -- El nombre CANONICO (socialMetricsSpec), no el de Meta: asi una
            -- metrica que Meta renombra no parte la serie en dos.
            metric TEXT NOT NULL,
            value DOUBLE PRECISION,

            -- De donde salio y con que nombre se pidio. Sin esto, dentro de un
            -- año nadie puede decir por que una serie cambia de escala el dia
            -- que Meta reemplazo una metrica por otra.
            "sourceMetric" TEXT,
            source TEXT NOT NULL DEFAULT 'meta',

            "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- ⚠️ LA IDEMPOTENCIA ES DE LA BASE, no de una lectura previa. Entre un
        -- SELECT y un INSERT caben dos vueltas del cron, el sondeo del panel y
        -- un resync manual; el precio de equivocarse es una serie con el mismo
        -- dia contado dos veces. NO ES PARCIAL: las cuatro columnas son NOT
        -- NULL, asi que el ON CONFLICT va a secas (la trampa de v4.648).
        CREATE UNIQUE INDEX IF NOT EXISTS "SocialDailyMetric_key"
            ON "SocialDailyMetric" ("accountId", "metricDate", metric);

        CREATE INDEX IF NOT EXISTS "SocialDailyMetric_lookup_idx"
            ON "SocialDailyMetric" ("clubId", platform, "metricDate");

        CREATE INDEX IF NOT EXISTS "SocialDailyMetric_series_idx"
            ON "SocialDailyMetric" ("accountId", metric, "metricDate");

        -- ── El contenido publicado ──────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS "SocialContentItem" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId" TEXT NOT NULL,
            "accountId" TEXT NOT NULL,
            platform TEXT NOT NULL,

            -- El id de Meta. Es la identidad de la pieza.
            "externalId" TEXT NOT NULL,
            "externalUrl" TEXT,

            -- reel | video | photo | carousel | story | status | link
            "mediaType" TEXT,
            caption TEXT,
            "thumbnailUrl" TEXT,
            "publishedAt" TIMESTAMP(3),

            -- ⚠️ EL VINCULO CON LO QUE ESTA PLATAFORMA PUBLICO. Apunta a
            -- ContentDistribution, que ya guarda el externalId de cada
            -- difusion desde v4.1013. Es lo que permite preguntar que
            -- contenido generado por nosotros rinde mejor, sin inventar una
            -- segunda verdad sobre de donde salio cada pieza.
            "distributionId" TEXT,
            "entityType" TEXT,
            "entityId" TEXT,

            "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "SocialContentItem_key"
            ON "SocialContentItem" ("accountId", "externalId");

        CREATE INDEX IF NOT EXISTS "SocialContentItem_club_idx"
            ON "SocialContentItem" ("clubId", platform, "publishedAt" DESC);

        CREATE INDEX IF NOT EXISTS "SocialContentItem_origin_idx"
            ON "SocialContentItem" ("distributionId");

        -- ── La performance de cada pieza ────────────────────────────────────
        --
        -- Las metricas de contenido son LIFETIME: no son una serie por dia,
        -- son un acumulado que crece. Se guarda una fila por captura para
        -- poder ver la evolucion de un Reel, que es lo que pide su ficha.
        CREATE TABLE IF NOT EXISTS "SocialContentMetric" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId" TEXT NOT NULL,
            "contentId" TEXT NOT NULL,
            "accountId" TEXT NOT NULL,
            platform TEXT NOT NULL,

            -- El dia de la CAPTURA. Dos capturas del mismo dia se pisan: lo
            -- que interesa es el ultimo valor conocido de ese dia.
            "metricDate" DATE NOT NULL,
            metric TEXT NOT NULL,
            value DOUBLE PRECISION,
            "sourceMetric" TEXT,

            "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS "SocialContentMetric_key"
            ON "SocialContentMetric" ("contentId", "metricDate", metric);

        CREATE INDEX IF NOT EXISTS "SocialContentMetric_content_idx"
            ON "SocialContentMetric" ("contentId", metric, "metricDate");

        CREATE INDEX IF NOT EXISTS "SocialContentMetric_club_idx"
            ON "SocialContentMetric" ("clubId", platform, "metricDate");

        -- ── Las corridas ────────────────────────────────────────────────────
        --
        -- SOLO AGREGA. Es lo unico que contesta "por que falta la semana del
        -- 3 de agosto" dentro de seis meses.
        CREATE TABLE IF NOT EXISTS "SocialSyncRun" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId" TEXT,
            "accountId" TEXT NOT NULL,
            platform TEXT NOT NULL,

            -- backfill | incremental | content | resync | probe
            kind TEXT NOT NULL,

            -- Uno de SYNC_STATES (socialMetricsSpec). Catalogo CERRADO.
            status TEXT NOT NULL DEFAULT 'running',

            "rangeFrom" DATE,
            "rangeTo" DATE,

            -- Hasta donde llego de verdad. Es el punto desde el que arranca
            -- la vuelta siguiente.
            "syncedThrough" DATE,

            "rowsWritten" INTEGER NOT NULL DEFAULT 0,
            "apiCalls" INTEGER NOT NULL DEFAULT 0,

            -- Que se pidio y no se pudo traer, con su motivo. Un hueco que no
            -- se anota es un hueco que nadie puede explicar.
            notes JSONB,
            error TEXT,
            "errorCode" TEXT,

            -- El RECLAMO. Dos vueltas del cron no sincronizan la misma cuenta.
            "claimedAt" TIMESTAMP(3),

            "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "finishedAt" TIMESTAMP(3)
        );

        CREATE INDEX IF NOT EXISTS "SocialSyncRun_account_idx"
            ON "SocialSyncRun" ("accountId", "startedAt" DESC);

        CREATE INDEX IF NOT EXISTS "SocialSyncRun_club_idx"
            ON "SocialSyncRun" ("clubId", "startedAt" DESC);
    `);

    for (const [tabla, columnas] of Object.entries(OWNED_COLUMNS)) {
        for (const col of columnas) {
            await db.query(`ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS ${col}`);
        }
    }

    _ready = true;
}

export default { ensureSocialAnalyticsSchema };
