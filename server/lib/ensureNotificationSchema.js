// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — el esquema, en runtime
// v4.855.0 (Fase 0)
//
// POR QUÉ RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md), así que una tabla nueva no
// se crea sola en producción. Mismo patrón que las de Campañas de
// Contribución, el Design DNA y las ProjectFair*: CREATE TABLE IF NOT EXISTS
// + ADD COLUMN IF NOT EXISTS. Nunca DROP, nunca TRUNCATE.
//
// Y sobre todo: NINGÚN cambio en `schema.prisma`. Acá pesa más que de
// costumbre — `Donation` y `Payment` se consultan con `findMany` SIN `select`
// en media plataforma, así que una columna declarada y todavía inexistente en
// la base dejaría esas consultas en 500 desde el primer despliegue, y eso cae
// sobre el cobro. Es la regla de `logo_intl` (v4.699). El vínculo con el
// aporte va por `contributionId` DESDE ESTA TABLA, no al revés.
//
// Al no estar en schema.prisma, la tabla queda protegida por
// `scripts/db-push-guard.mjs`: un `npm run db:push` avisa antes de borrarla.
//
// La comprobación previa (una consulta al catálogo) es la regla de
// rendimiento de v4.659: 62 viajes a la base en cada arranque en frío los
// paga la primera visita. La lista de objetos comprobados NO es un número de
// versión — enumera los objetos REALES del archivo, y al agregar una tabla o
// una columna hay que agregarla ahí o la comprobación rápida la da por
// presente y no se crea nunca.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

export async function ensureNotificationSchema() {
    if (_ready) return;

    const { rows } = await db.query(
        `SELECT to_regclass('public."NotificationDelivery"') IS NOT NULL AS entrega,
                to_regclass('public."NotificationBeneficiary"') IS NOT NULL AS beneficiario,
                to_regclass('public."NotificationProfile"') IS NOT NULL AS perfil,
                to_regclass('public."NotificationTemplate"') IS NOT NULL AS plantilla,
                to_regclass('public."NotificationDomain"') IS NOT NULL AS dominio`
    );
    if (rows[0]?.entrega && rows[0]?.beneficiario && rows[0]?.perfil
        && rows[0]?.plantilla && rows[0]?.dominio) { _ready = true; return; }

    // ── Una fila por ENVÍO ────────────────────────────────────────────
    //
    // No por notificación configurada ni por aporte: por cada correo que se
    // intentó mandar a una dirección concreta por un motivo concreto. Es lo
    // que permite contestar «¿le llegó?» de un aportante en particular, que
    // es la pregunta que hoy no tiene dónde mirarse.
    //
    // `contributionId` es `Donation.id`. Sin clave foránea a propósito: el
    // destino es un modelo de Prisma y una restricción declarada sólo acá
    // sería otra cosa que `db push` podría quitar en silencio — mismo
    // criterio que `MediaFolder` (v4.738). La integridad la sostiene que
    // nadie borra donaciones.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

            -- La llave de idempotencia, ya normalizada por
            -- notificationSpec.deliveryKey: contribución + evento +
            -- destinatario en minúsculas. El índice único de abajo es lo que
            -- hace IMPOSIBLE el correo duplicado; comprobarlo en el código
            -- sería una carrera entre dos entregas del mismo webhook.
            key TEXT NOT NULL,

            "contributionId" TEXT NOT NULL,
            event TEXT NOT NULL,
            recipient TEXT NOT NULL,
            "recipientKind" TEXT NOT NULL DEFAULT 'donor',

            -- El contexto de la ficha. Opcionales porque en la Fase 0 sólo hay
            -- sitio y campaña: el perfil y el beneficiario se llenan cuando
            -- existan, sin migrar nada.
            "clubId" TEXT,
            "campaignId" TEXT,
            "beneficiaryId" TEXT,
            "profileId" TEXT,
            "templateVersion" INTEGER,

            provider TEXT NOT NULL DEFAULT 'resend',
            "fromAddress" TEXT,
            subject TEXT,
            "providerMessageId" TEXT,

            -- pending | sent | delivered | opened | bounced | failed | blocked
            state TEXT NOT NULL DEFAULT 'pending',
            "errorCode" TEXT,
            "errorMessage" TEXT,
            retryable BOOLEAN NOT NULL DEFAULT false,
            "retryCount" INTEGER NOT NULL DEFAULT 0,
            "nextRetryAt" TIMESTAMPTZ,

            "sentAt" TIMESTAMPTZ,
            "deliveredAt" TIMESTAMPTZ,
            "openedAt" TIMESTAMPTZ,
            "failedAt" TIMESTAMPTZ,

            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    // La idempotencia. NO es parcial a propósito: las tres columnas que la
    // componen son NOT NULL, así que no hay predicado que repetir y un
    // `ON CONFLICT (key)` funciona sin la trampa del índice parcial que costó
    // una corrección en v4.648.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_key_key" ON "NotificationDelivery" (key);`);

    // La consulta de la ficha del aporte: todas las entregas de una
    // contribución, la más reciente primero.
    await db.query(`CREATE INDEX IF NOT EXISTS "NotificationDelivery_contribution_idx" ON "NotificationDelivery" ("contributionId", "createdAt" DESC);`);

    // El webhook del proveedor llega con su identificador de mensaje y nada
    // más: sin este índice, cada evento de entrega sería un recorrido de toda
    // la tabla.
    await db.query(`CREATE INDEX IF NOT EXISTS "NotificationDelivery_message_idx" ON "NotificationDelivery" ("providerMessageId");`);

    // El panel del operador: qué falló en este sitio, lo más reciente arriba.
    await db.query(`CREATE INDEX IF NOT EXISTS "NotificationDelivery_club_state_idx" ON "NotificationDelivery" ("clubId", state, "createdAt" DESC);`);

    // ── La entidad beneficiaria (v4.856) ──────────────────────────────
    //
    // Colrotarios es el primer caso; la forma es genérica a propósito.
    //
    // SIN cuentas bancarias, y no es un olvido: el dinero entra a la cuenta
    // Stripe de la plataforma y se liquida por la Bóveda. Datos de recaudo acá
    // crearían una segunda verdad sobre a dónde va el dinero, y sería falsa.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "NotificationBeneficiary" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "legalName" TEXT NOT NULL,
            "tradeName" TEXT,
            "taxId" TEXT,
            "logoUrl" TEXT,
            email TEXT,
            website TEXT,
            phone TEXT,
            address TEXT,
            "contactName" TEXT,
            notes TEXT,
            active BOOLEAN NOT NULL DEFAULT true,
            "createdBy" TEXT,
            "updatedBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "NotificationBeneficiary_active_idx" ON "NotificationBeneficiary" (active, "legalName");`);

    // ── El perfil ─────────────────────────────────────────────────────
    //
    // `targeting` es JSONB con el MISMO documento que `ContributionCampaign`:
    // se resuelve con `targetsSite` de `contributionSpec.js`, no con un
    // criterio propio. Con dos criterios, un perfil podría alcanzar a un sitio
    // que la campaña no alcanza.
    //
    // `identity`, `routing` y `events` también son documentos: normalizarlos a
    // columnas obligaría a migrar el esquema con cada campo nuevo sin ganar
    // ninguna consulta. Lo que SÍ es columna es lo que se filtra o se ordena.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "NotificationProfile" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name TEXT NOT NULL,
            active BOOLEAN NOT NULL DEFAULT true,

            -- El último recurso de la resolución: es lo que impide que un
            -- aporte se quede sin notificación por no tener perfil.
            "isDefault" BOOLEAN NOT NULL DEFAULT false,
            priority INTEGER NOT NULL DEFAULT 0,

            "beneficiaryId" TEXT,
            identity JSONB NOT NULL DEFAULT '{}'::jsonb,
            routing JSONB NOT NULL DEFAULT '{}'::jsonb,
            events JSONB NOT NULL DEFAULT '{}'::jsonb,
            targeting JSONB NOT NULL DEFAULT '{}'::jsonb,
            "internalRecipients" JSONB NOT NULL DEFAULT '[]'::jsonb,
            notes TEXT,

            "createdBy" TEXT,
            "updatedBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "NotificationProfile_active_idx" ON "NotificationProfile" (active, priority DESC, "updatedAt" DESC);`);

    // ── La plantilla, VERSIONADA ──────────────────────────────────────
    //
    // Nunca se actualiza una fila: editar inserta una versión nueva y baja la
    // bandera de la anterior. Mismo patrón que `ReelCopy` y `CreativeProfile`,
    // y acá es exigencia del pedido (criterio 18): un aporte de hace seis
    // meses tiene que poder explicarse con la plantilla que lo generó.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "NotificationTemplate" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

            -- De quién es esta plantilla. NULL en las dos = la GLOBAL de la
            -- plataforma, que es el último escalón del fallback.
            "profileId" TEXT,
            "campaignId" TEXT,

            event TEXT NOT NULL DEFAULT 'payment_confirmed',
            "recipientKind" TEXT NOT NULL DEFAULT 'donor',

            version INTEGER NOT NULL DEFAULT 1,
            "isCurrent" BOOLEAN NOT NULL DEFAULT true,

            subject TEXT NOT NULL DEFAULT '',
            preheader TEXT,
            blocks JSONB NOT NULL DEFAULT '[]'::jsonb,

            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    // El índice único es PARCIAL: sólo puede haber UNA versión vigente por
    // (perfil, campaña, evento, destinatario). Por serlo, un `ON CONFLICT`
    // contra él tendría que repetir el predicado o la sentencia falla entera
    // (error real de v4.648) — por eso el guardado NO usa ON CONFLICT acá:
    // baja la bandera con un UPDATE y después inserta.
    //
    // `COALESCE` porque en Postgres NULL nunca es igual a NULL: sin él, dos
    // plantillas globales —las dos con perfil y campaña en NULL— no chocarían
    // jamás, que es justo donde más se repiten.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "NotificationTemplate_current_key"
            ON "NotificationTemplate" (
                COALESCE("profileId", ''), COALESCE("campaignId", ''), event, "recipientKind"
            ) WHERE "isCurrent";
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "NotificationTemplate_profile_idx" ON "NotificationTemplate" ("profileId", event, version DESC);`);

    // ── La caché de verificación de dominios (v4.857) ─────────────────
    //
    // La verificación vive en Resend, no acá. Consultarla en cada envío sería
    // una llamada de red a un tercero DENTRO del webhook de Stripe, y Stripe da
    // de baja los endpoints que tardan. Se guarda con vencimiento.
    //
    // `status` guarda el estado CRUDO del proveedor además del booleano:
    // «pending» y «no está en Resend» se corrigen en sitios distintos, y sin
    // ese dato el panel no puede explicar por qué un sitio no envía desde lo
    // suyo.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "NotificationDomain" (
            domain TEXT PRIMARY KEY,
            verified BOOLEAN NOT NULL DEFAULT false,
            status TEXT,
            "checkedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    _ready = true;
}

export default ensureNotificationSchema;
