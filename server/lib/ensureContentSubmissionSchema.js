// ════════════════════════════════════════════════════════════════════
// Aportes de contenido a una campaña — el esquema, en runtime (v4.968)
//
// POR QUÉ RUNTIME Y FUERA DE PRISMA: tras el incidente del 2026-07-13 el build
// ya NO ejecuta `prisma db push`, así que una tabla nueva no aparece sola en
// producción; y una columna declarada en `schema.prisma` y todavía inexistente
// deja en 500 a todo consumidor Prisma desde el primer despliegue (regla de
// `logo_intl`, v4.699). Mismo patrón que las cinco tablas de Campañas de
// Contribución, de las que ésta cuelga. Nunca DROP, nunca TRUNCATE.
//
// Las tres quedan protegidas por `scripts/db-push-guard.mjs`.
//
// SIN CLAVE FORÁNEA a `Media`: el destino de `mediaId` SÍ es un modelo de
// Prisma, y una restricción declarada sólo acá sería otra cosa que `db push`
// podría quitar en silencio. La integridad la sostiene el código: promover es
// idempotente y una fila cuyo `Media` desapareció se ve como no promovida.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

export async function ensureContentSubmissionSchema() {
    if (_ready) return;

    // La lista de objetos comprobados NO es un número de versión: enumera lo
    // que este archivo crea de verdad, y hay que ampliarla al agregar uno nuevo
    // o el atajo lo dará por presente y no se creará nunca (la trampa de
    // v4.908, que se pagó el mismo día).
    const { rows } = await db.query(`
        SELECT to_regclass('public."ContributionSubmission"') IS NOT NULL AS solicitud,
               to_regclass('public."ContributionSubmissionFile"') IS NOT NULL AS archivo,
               to_regclass('public."ContributionSubmissionEvent"') IS NOT NULL AS evento
    `);
    if (rows[0]?.solicitud && rows[0]?.archivo && rows[0]?.evento) { _ready = true; return; }

    // ── La solicitud ──────────────────────────────────────────────────
    //
    // Los datos de quien envía y de la actividad son COLUMNAS y no un JSON:
    // la bandeja filtra por club, ciudad, estado y fecha, y un filtro sobre un
    // documento no se indexa. `extra` queda para lo que no es un eje.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionSubmission" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "campaignId" TEXT NOT NULL,

            status TEXT NOT NULL DEFAULT 'recibido',
            "statusDetail" TEXT,
            assignee TEXT,

            "senderName" TEXT NOT NULL,
            "senderEmail" TEXT NOT NULL,
            "senderPhone" TEXT,
            district TEXT,
            club TEXT,
            role TEXT,

            title TEXT,
            description TEXT,
            location TEXT,
            city TEXT,
            "activityDate" TEXT,
            "participatingClubs" TEXT,
            story TEXT,
            extra TEXT,

            -- El texto EXACTO que esa persona aceptó, copiado acá. Con una
            -- referencia, cambiar el texto de la campaña reescribiría
            -- retroactivamente lo que se aceptó.
            "consentText" TEXT,
            "consentAt" TIMESTAMPTZ,

            -- Avisos de la validación que no bloquearon el envío. Es lo que
            -- después permite pedir lo que falta con «Requiere información».
            warnings JSONB NOT NULL DEFAULT '[]'::jsonb,

            "reviewedBy" TEXT,
            "reviewedAt" TIMESTAMPTZ,
            "approvedAt" TIMESTAMPTZ,
            "publishedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmission_campaign_idx" ON "ContributionSubmission" ("campaignId", status, "createdAt" DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmission_club_idx" ON "ContributionSubmission" ("campaignId", club);`);

    // ── Los archivos ──────────────────────────────────────────────────
    //
    // UNA FILA POR ARCHIVO, no un array en la solicitud. Es la misma decisión
    // que separó `DistributionJob` de la campaña (v4.864) y `ReelScene` de
    // `ReelProject`: cada archivo tiene ESTADO propio —se promueve o no, tiene
    // su fila de `Media` o no— y dos promociones simultáneas sobre un JSON se
    // pisarían.
    //
    // `s3Key` apunta al prefijo PRIVADO de staging. `mediaId` se llena al
    // promover; hasta entonces el archivo no tiene lectura pública por ninguna
    // vía, que es lo que hace estructural el requisito «nunca se publica solo».
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionSubmissionFile" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "campaignId" TEXT NOT NULL,
            kind TEXT NOT NULL,
            "s3Key" TEXT NOT NULL,
            filename TEXT,
            "contentType" TEXT,
            bytes BIGINT NOT NULL DEFAULT 0,
            "sortOrder" INTEGER NOT NULL DEFAULT 0,

            "mediaId" TEXT,
            "mediaUrl" TEXT,
            "promotedAt" TIMESTAMPTZ,
            "promoteError" TEXT,

            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmissionFile_sub_idx" ON "ContributionSubmissionFile" ("submissionId", "sortOrder");`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmissionFile_campaign_idx" ON "ContributionSubmissionFile" ("campaignId") WHERE "mediaId" IS NOT NULL;`);
    // Un objeto de S3 no puede estar reclamado por dos solicitudes: es lo que
    // impide que un reenvío del formulario duplique el mismo archivo.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ContributionSubmissionFile_key_key" ON "ContributionSubmissionFile" ("s3Key");`);

    // ── El historial y el uso ─────────────────────────────────────────
    //
    // SÓLO AGREGA: corregir es escribir otro evento, nunca editar uno. Es lo
    // único que después contesta «¿por qué esta solicitud está descartada?».
    // El uso en un canal es un evento más (`type = 'usage'`), no una tabla
    // aparte: la pregunta es la misma —qué le pasó a esta solicitud— y dos
    // tablas obligarían a ordenarlas a mano para pintar una sola línea de
    // tiempo (la lección de `InstitutionalAccessEvent`, v4.937).
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionSubmissionEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "campaignId" TEXT NOT NULL,
            type TEXT NOT NULL,
            "fromState" TEXT,
            "toState" TEXT,
            channel TEXT,
            -- NOT NULL con default vacío a propósito: en Postgres NULL nunca
            -- es igual a NULL, así que con un reference nulo dos marcas
            -- manuales del mismo canal no chocarían jamás — que es justo
            -- donde el índice tiene que impedir el duplicado.
            reference TEXT NOT NULL DEFAULT '',
            detail TEXT,
            actor TEXT,
            "actorName" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmissionEvent_sub_idx" ON "ContributionSubmissionEvent" ("submissionId", "createdAt" DESC);`);
    // Un canal se marca UNA vez por solicitud y referencia: sin esto, sondear
    // dos veces las publicaciones de una campaña anotaría el mismo uso dos
    // veces y el seguimiento contaría de más. El índice es PARCIAL, así que
    // ningún `ON CONFLICT` puede apuntarlo por columnas sin repetir el
    // predicado (v4.648): la escritura usa `ON CONFLICT DO NOTHING` a secas,
    // que no infiere índice.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ContributionSubmissionEvent_usage_key"
            ON "ContributionSubmissionEvent" ("submissionId", channel, reference)
            WHERE type = 'usage';
    `);

    _ready = true;
}

export default ensureContentSubmissionSchema;
