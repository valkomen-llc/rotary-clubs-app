// ════════════════════════════════════════════════════════════════════
// Aportes de contenido a una campaña — el esquema, en runtime (v4.972)
//
// POR QUÉ RUNTIME Y FUERA DE PRISMA: tras el incidente del 2026-07-13 el build
// ya NO ejecuta `prisma db push`, así que una tabla nueva no aparece sola en
// producción; y una columna declarada en `schema.prisma` y todavía inexistente
// deja en 500 a todo consumidor Prisma desde el primer despliegue (regla de
// `logo_intl`, v4.699). Mismo patrón que las cinco tablas de Campañas de
// Contribución, de las que ésta cuelga. Nunca DROP, nunca TRUNCATE.
//
// Las CINCO quedan protegidas por `scripts/db-push-guard.mjs`.
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
    //
    // ⚠️ LAS COLUMNAS TAMBIÉN CUENTAN. `CREATE TABLE IF NOT EXISTS` no amplía
    // nada: una base que estrenó el módulo en v4.968 tiene las tres tablas y
    // NO las columnas del teléfono, así que con el atajo mirando sólo tablas
    // los `ALTER` no correrían nunca y el INSERT fallaría con «column does not
    // exist» — en silencio, porque este módulo degrada. Es la regla de
    // `EventRegistration` (v4.648): se AMPLÍA, jamás se recrea.
    const { rows } = await db.query(`
        SELECT to_regclass('public."ContributionSubmission"') IS NOT NULL AS solicitud,
               to_regclass('public."ContributionSubmissionFile"') IS NOT NULL AS archivo,
               to_regclass('public."ContributionSubmissionEvent"') IS NOT NULL AS evento,
               to_regclass('public."ContributionSubmissionClub"') IS NOT NULL AS club,
               to_regclass('public."ContributionSubmissionPost"') IS NOT NULL AS post,
               (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_name = 'ContributionSubmission'
                   AND column_name IN ('senderPhoneCountry','senderPhoneDial','senderPhoneNational','senderPhoneE164','hasPosts'))::int AS columnas
    `);
    if (rows[0]?.solicitud && rows[0]?.archivo && rows[0]?.evento
        && rows[0]?.club && rows[0]?.post && rows[0]?.columnas === 5) { _ready = true; return; }

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

    // ── El teléfono, en partes ────────────────────────────────────────
    //
    // ⚠️ SE GUARDA EL E.164 **Y** SUS PARTES. Este contacto va a WhatsApp y al
    // CRM, donde lo que hace falta es `+573001234567` sin tener que deducir el
    // país a partir de los dígitos — el error que `phone.js` documenta como
    // caro: adivinar mal manda el mensaje a un tercero real que lo recibe.
    // `senderPhone` se conserva y sigue siendo lo que se MUESTRA: en las filas
    // nuevas es el E.164 y en las de v4.968 el texto que se escribió entonces.
    for (const col of [
        '"senderPhoneCountry" TEXT',      // ISO-3166 alpha-2, tal como lo declaró el navegador
        '"senderPhoneDial" TEXT',         // el indicativo, con su «+»
        '"senderPhoneNational" TEXT',     // sólo los dígitos nacionales
        '"senderPhoneE164" TEXT',         // compuesto por el SERVIDOR, nunca recibido armado
        '"hasPosts" BOOLEAN',             // la RESPUESTA a «¿ya se publicó?», que no es «tiene filas»
    ]) {
        await db.query(`ALTER TABLE "ContributionSubmission" ADD COLUMN IF NOT EXISTS ${col};`);
    }

    // ── Los clubes participantes ──────────────────────────────────────
    //
    // UNA FILA POR CLUB, no una lista dentro de la solicitud, y el motivo no es
    // la concurrencia —acá se escriben una vez— sino la CONSULTA: «qué clubes
    // están participando activamente» y «participación por distrito y club»
    // son preguntas que hay que poder indexar, y un filtro sobre un documento
    // no se indexa. Es el mismo argumento por el que los datos de la actividad
    // son columnas y no un JSON.
    //
    // `clubKey` es el nombre normalizado —minúsculas, sin tildes— y es lo que
    // permite AGRUPAR sin depender de cómo se escribió. `source` distingue el
    // club que salió del catálogo del que alguien escribió a mano: es lo que
    // después dice si un nombre desconocido es un club nuevo o un error.
    //
    // SIN clave foránea a `Club`: la mayoría de los clubes rotarios NO son
    // sitios de la plataforma, así que un `clubId` obligatorio dejaría fuera a
    // casi todos. El vínculo con un sitio, cuando exista, se resuelve por
    // nombre al leer (es lo que ya hace `findPublicClub`).
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionSubmissionClub" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "campaignId" TEXT NOT NULL,
            "districtId" TEXT,
            "clubName" TEXT NOT NULL,
            "clubKey" TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'catalogo',
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmissionClub_sub_idx" ON "ContributionSubmissionClub" ("submissionId", "sortOrder");`);
    // El índice de la PREGUNTA: participación por campaña, distrito y club.
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmissionClub_part_idx" ON "ContributionSubmissionClub" ("campaignId", "districtId", "clubKey");`);
    // El mismo club no se repite dentro de una solicitud. No es una
    // restricción de negocio: es que dos veces el mismo nombre contaría doble
    // en cualquier medición de participación.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ContributionSubmissionClub_uniq" ON "ContributionSubmissionClub" ("submissionId", "clubKey");`);

    // ── Las publicaciones que el club YA hizo ─────────────────────────
    //
    // ⚠️ NO ES LA MISMA TABLA QUE EL USO. `ContributionSubmissionEvent` con
    // `type = 'usage'` responde «¿dónde usamos NOSOTROS este material después
    // de aprobarlo?»; esto responde «¿dónde lo publicó el CLUB antes de
    // mandárnoslo?». Guardarlos juntos haría creer que difundimos algo que
    // difundió otro, y las mediciones de impacto contarían dos veces.
    //
    // UNA FILA POR PUBLICACIÓN, nunca las URLs concatenadas: es lo que permite
    // contestar campaña → actividad → clubes → publicaciones → plataforma →
    // enlace, y lo que después deja cruzar por `host` para no volver a
    // difundir lo que ya está publicado.
    //
    // SIN índice único sobre la URL, a propósito: dos clubes pueden mandar por
    // separado el material de la MISMA actividad y citar el mismo post, y una
    // restricción rechazaría el segundo envío entero. Detectar el duplicado es
    // una CONSULTA, no una restricción.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionSubmissionPost" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "campaignId" TEXT NOT NULL,
            platform TEXT NOT NULL,
            "platformOther" TEXT,
            url TEXT NOT NULL,
            host TEXT,
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmissionPost_sub_idx" ON "ContributionSubmissionPost" ("submissionId", "sortOrder");`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmissionPost_campaign_idx" ON "ContributionSubmissionPost" ("campaignId", platform);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionSubmissionPost_host_idx" ON "ContributionSubmissionPost" (host);`);

    _ready = true;
}

export default ensureContentSubmissionSchema;
