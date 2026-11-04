// ════════════════════════════════════════════════════════════════════
// Estadísticas de descarga de los documentos de un evento — el esquema — v4.1279.0
//
// Cinco tablas creadas en RUNTIME, perezosas e idempotentes, fuera de Prisma:
// tras el incidente del 2026-07-13 el build no ejecuta `prisma db push`, así
// que una tabla nueva del schema no aparece sola en producción. Mismo patrón
// que las Redirecciones de Enlaces (v4.993) y la analítica de artículos
// (v4.1000), y por el mismo motivo el mismo reparto: los EVENTOS crudos
// crecen con el tráfico y el AGREGADO diario es lo que se lee para pintar
// totales y series.
//
//   · "EventDocument"         — el documento LÓGICO de un evento: (eventId,
//                               resourceKey) único. Sobrevive a reemplazar,
//                               renombrar, desactivar y quitar el archivo:
//                               ahí vive el histórico acumulado.
//   · "EventDocumentVersion"  — cada archivo que ocupó ese lugar (la URL de
//                               S3 es única por subida). Nunca se borra.
//   · "EventDocumentDownload" — una fila por SOLICITUD VÁLIDA de descarga.
//   · "EventDocumentDaily"    — el agregado por día (descargas, visitantes
//                               nuevos, bots, repeticiones).
//   · "EventDocumentVisitor"  — el visitante seudónimo (hash con sal, sin IP).
//
// ⚠️ LAS CINCO VAN EN LA LISTA DEL GUARDIÁN DE `db:push`
// (`scripts/db-push-guard.mjs`): «cuántas veces se descargó el boletín» no se
// reconstruye de ninguna parte.
//
// `CalendarEvent` NO gana ni una columna: el vínculo va por `eventId` desde
// acá, y todo lo que se escribe lleva además `clubId` (aislamiento por sitio).
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// Lo que este archivo crea. NO es un número de versión: es la lista real de
// lo que hay abajo, y hay que ampliarla al agregar algo o la comprobación lo
// dará por presente (lección de v4.908).
const EXPECTED_TABLES = [
    'EventDocument',
    'EventDocumentVersion',
    'EventDocumentDownload',
    'EventDocumentDaily',
    'EventDocumentVisitor',
];

// Toda columna agregada después con `ADD COLUMN IF NOT EXISTS` va enumerada
// acá, o el `ALTER` no correría nunca en una base que estrenó el módulo antes.
const EXPECTED_COLUMNS = [];

export async function ensureEventDocumentSchema() {
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
        -- EL DOCUMENTO LÓGICO. Uno por (evento, recurso).
        -- ═══════════════════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS "EventDocument" (
            id TEXT PRIMARY KEY,
            "eventId" TEXT NOT NULL,
            "clubId" TEXT,
            -- 'hotels_guide' hoy; un boletín o una programación serían otra clave.
            "resourceKey" TEXT NOT NULL,
            -- El último nombre de archivo conocido (para el listado).
            title TEXT NOT NULL DEFAULT '',
            -- La versión que se entrega hoy. NULL si el archivo se quitó:
            -- el histórico se conserva igual.
            "currentVersionId" TEXT,

            -- Contadores exactos, mantenidos en la MISMA sentencia que
            -- registra la descarga: el panel no recorre filas para pintar.
            "totalDownloads" INTEGER NOT NULL DEFAULT 0,
            "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
            "botHits" INTEGER NOT NULL DEFAULT 0,
            "repeatHits" INTEGER NOT NULL DEFAULT 0,
            "lastDownloadAt" TIMESTAMPTZ,

            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "EventDocument_event_key"
            ON "EventDocument" ("eventId", "resourceKey");
        CREATE INDEX IF NOT EXISTS "EventDocument_club_idx"
            ON "EventDocument" ("clubId");

        -- ═══════════════════════════════════════════════════════════════════
        -- LA VERSIÓN. Cada archivo que ocupó ese lugar. Nunca se borra.
        -- ═══════════════════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS "EventDocumentVersion" (
            id TEXT PRIMARY KEY,
            "documentId" TEXT NOT NULL,
            "versionNumber" INTEGER NOT NULL DEFAULT 1,
            -- La dirección pública de S3: única por subida (lleva un UUID).
            url TEXT NOT NULL,
            "fileName" TEXT NOT NULL DEFAULT '',
            "sizeBytes" BIGINT,
            -- Cuándo se subió (lo dice la metadata) y cuándo la vio este módulo.
            "uploadedAt" TIMESTAMPTZ,
            "firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            downloads INTEGER NOT NULL DEFAULT 0,
            "lastDownloadAt" TIMESTAMPTZ
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "EventDocumentVersion_doc_url"
            ON "EventDocumentVersion" ("documentId", url);

        -- ═══════════════════════════════════════════════════════════════════
        -- LA SOLICITUD VÁLIDA. Una fila por descarga HUMANA y no repetida.
        -- Sin IP, sin user-agent completo, sin nombre: lo mínimo para los
        -- desgloses (dispositivo, país, fuente, desde dónde se pidió).
        -- ═══════════════════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS "EventDocumentDownload" (
            id TEXT PRIMARY KEY,
            "documentId" TEXT NOT NULL,
            "versionId" TEXT NOT NULL,
            "eventId" TEXT NOT NULL,
            "clubId" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "visitorKey" TEXT NOT NULL DEFAULT '',
            "isNewVisitor" BOOLEAN NOT NULL DEFAULT FALSE,
            -- section | lightbox
            source TEXT NOT NULL DEFAULT 'section',
            "referrerHost" TEXT NOT NULL DEFAULT '',
            "sourceKind" TEXT NOT NULL DEFAULT 'directo',
            "sourceLabel" TEXT NOT NULL DEFAULT '',
            device TEXT NOT NULL DEFAULT '',
            browser TEXT NOT NULL DEFAULT '',
            os TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS "EventDocumentDownload_doc_idx"
            ON "EventDocumentDownload" ("documentId", "createdAt" DESC);

        -- ═══════════════════════════════════════════════════════════════════
        -- EL AGREGADO DIARIO. Lo que se lee para totales y gráfico.
        -- El día se corta en la zona de las estadísticas (America/Bogota).
        -- ═══════════════════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS "EventDocumentDaily" (
            "documentId" TEXT NOT NULL,
            "eventId" TEXT NOT NULL,
            "clubId" TEXT,
            day DATE NOT NULL,
            downloads INTEGER NOT NULL DEFAULT 0,
            uniques INTEGER NOT NULL DEFAULT 0,
            bots INTEGER NOT NULL DEFAULT 0,
            repeats INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY ("documentId", day)
        );

        -- ═══════════════════════════════════════════════════════════════════
        -- EL VISITANTE. Hash con sal de (sitio, IP, user-agent). La IP no
        -- se guarda en ninguna parte. "prevSeenAt" guarda la visita anterior
        -- en el mismo UPSERT: así la ventana de repetición se decide con el
        -- valor REAL aunque dos solicitudes lleguen a la vez.
        -- ═══════════════════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS "EventDocumentVisitor" (
            "documentId" TEXT NOT NULL,
            "visitorKey" TEXT NOT NULL,
            "firstSeenAt" TIMESTAMPTZ NOT NULL,
            "lastSeenAt" TIMESTAMPTZ NOT NULL,
            "prevSeenAt" TIMESTAMPTZ,
            downloads INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY ("documentId", "visitorKey")
        );
    `);

    _ready = true;
}

export default ensureEventDocumentSchema;
