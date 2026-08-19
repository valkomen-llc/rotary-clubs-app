/**
 * Las tablas de la Distribución multi-destino, creadas en tiempo de ejecución.
 *
 * v4.864 — Fuera de Prisma, como manda la sección de base de datos de este
 * proyecto, y nombradas en el comentario de scripts/db-push-guard.mjs.
 *
 * Por qué fuera de Prisma: un modelo declarado en schema.prisma que todavía no
 * exista en la base deja en 500 toda consulta que lo toque hasta que alguien
 * sincronice a mano —es la regla de logo_intl (v4.699)— y el build NO ejecuta
 * db push a propósito (v4.622). Creadas en runtime, existen cuando existen.
 *
 * TRES TABLAS:
 *
 *   DistributionCampaign  la campaña: qué se distribuye y con qué cadencia.
 *   DistributionJob       UN DESTINO, UNA FILA. Es la pieza que hace posible
 *                         pausar, reintentar y consultar estado por destino.
 *   DistributionEvent     la traza, append-only.
 *   DistributionGroup     los grupos declarados (v4.876).
 *
 * ⚠️ POR QUÉ LOS JOBS NO VIVEN EN UN JSON DE LA CAMPAÑA. SocialPublication
 * guarda el resultado por cuenta dentro de targetAccounts (un array JSON), y
 * para tres destinos publicados a mano funciona. Para veinticinco jobs que
 * avanzan solos no: dos vueltas del cron que escriben la misma fila se pisan y
 * el resultado de una se pierde en silencio. Es exactamente el motivo por el
 * que ReelScene se separó de ReelProject.
 *
 * ⚠️ NUNCA una comilla invertida dentro de este template literal, ni en un
 * comentario del SQL: cierra el literal a mitad y el módulo entero deja de
 * parsear. Ya pasó en ensureDesignSchema.js (v4.721.1) y lo atrapa
 * npm run check:syntax, que es la única barrera que lo ve.
 */
import db from './db.js';

let ensured = null;

const SQL = `
CREATE TABLE IF NOT EXISTS "DistributionCampaign" (
    id                TEXT PRIMARY KEY,
    "clubId"          TEXT,
    "userId"          TEXT,
    name              TEXT NOT NULL,
    -- De dónde salió el contenido: publication | reel | library | manual | share
    "sourceType"      TEXT NOT NULL DEFAULT 'manual',
    "sourceId"        TEXT,
    -- { kind, message, link, mediaUrl }. Es una FOTO del contenido al programar:
    -- si alguien edita la publicación de origen despues, la campaña ya lanzada
    -- sigue distribuyendo lo que se aprobó.
    content           JSONB NOT NULL,
    "contentHash"     TEXT NOT NULL,
    "copyMode"        TEXT NOT NULL DEFAULT 'same',
    "intervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "startAt"         TIMESTAMPTZ,
    timezone          TEXT NOT NULL DEFAULT 'UTC',
    -- Ventana horaria { from, to } en hora del sitio. Se llama scheduleWindow y
    -- no window porque WINDOW es palabra reservada de Postgres.
    "scheduleWindow"  JSONB,
    "perDay"          INTEGER,
    limits            JSONB NOT NULL DEFAULT '{}'::jsonb,
    status            TEXT NOT NULL DEFAULT 'draft',
    "pausedReason"    TEXT,
    -- Candado del barrido. Marca propia y NO "updatedAt": a ese lo mueve
    -- cualquier nota y la ventana no vencería nunca (regla del montaje de
    -- Reels, v4.786).
    "claimedAt"       TIMESTAMPTZ,
    -- Cuando Meta pide frenar, la campaña no se cancela: se retoma acá.
    "resumeAt"        TIMESTAMPTZ,
    notes             JSONB,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "DistributionCampaign_club_idx"
    ON "DistributionCampaign"("clubId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DistributionCampaign_status_idx"
    ON "DistributionCampaign"(status);

CREATE TABLE IF NOT EXISTS "DistributionJob" (
    id                TEXT PRIMARY KEY,
    "campaignId"      TEXT NOT NULL REFERENCES "DistributionCampaign"(id) ON DELETE CASCADE,
    "clubId"          TEXT,
    -- Copiado de la campaña a propósito, igual que ReelScene copia clubId: la
    -- operación de un job se resuelve con su propia fila, sin ir a buscar la
    -- campaña, y dos jobs simultáneos no se pisan.
    position          INTEGER NOT NULL DEFAULT 0,
    "targetType"      TEXT NOT NULL,
    "targetId"        TEXT NOT NULL,
    "targetName"      TEXT,
    "socialAccountId" TEXT,
    "targetUrl"       TEXT,
    message           TEXT,
    "linkUrl"         TEXT,
    "mediaUrl"        TEXT,
    "contentHash"     TEXT NOT NULL,
    "scheduledAt"     TIMESTAMPTZ NOT NULL,
    status            TEXT NOT NULL DEFAULT 'scheduled',
    -- Entero EXACTO, y por eso es el campo del reclamo optimista: el driver de
    -- pg trunca los microsegundos de un timestamp y una igualdad sobre
    -- "updatedAt" no casaría jamas (v4.800).
    attempts          INTEGER NOT NULL DEFAULT 0,
    "externalId"      TEXT,
    "externalUrl"     TEXT,
    "publishedAt"     TIMESTAMPTZ,
    -- Modo asistido: quién dijo que publicó a mano. Sin esto el registro no
    -- sirve para lo único que ese modo aporta, que es la trazabilidad.
    "publishedBy"     TEXT,
    error             TEXT,
    "errorCode"       TEXT,
    -- Se DECLARA al registrar el fallo, no se deduce después. Ante la duda es
    -- FALSE: un aviso que no sale se ve en el historial y se relanza a mano;
    -- uno que sale cinco veces ya salió (regla de NotificationDelivery).
    retryable         BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LA IDEMPOTENCIA. Campaña + destino + contenido. Las tres columnas son NOT
-- NULL, así que el índice NO es parcial y su ON CONFLICT no tiene que repetir
-- ningún predicado — la trampa que costó una corrección real en v4.648.
CREATE UNIQUE INDEX IF NOT EXISTS "DistributionJob_idem_key"
    ON "DistributionJob"("campaignId", "targetId", "contentHash");

-- El índice del barrido: los jobs que vencieron, por estado y hora.
CREATE INDEX IF NOT EXISTS "DistributionJob_due_idx"
    ON "DistributionJob"(status, "scheduledAt");
CREATE INDEX IF NOT EXISTS "DistributionJob_campaign_idx"
    ON "DistributionJob"("campaignId", position);

CREATE TABLE IF NOT EXISTS "DistributionEvent" (
    id           TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "jobId"      TEXT,
    kind         TEXT NOT NULL,
    message      TEXT,
    detail       JSONB,
    "userId"     TEXT,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "DistributionEvent_campaign_idx"
    ON "DistributionEvent"("campaignId", "createdAt" DESC);

-- v4.876 — Los grupos declarados. Salen del Setting distribution_groups y pasan
-- a tabla propia por el mismo motivo que separó DistributionJob de la campaña:
-- ahora cada grupo tiene ESTADO —verificación, favorito, etiquetas, última
-- publicación— y un JSON no se consulta, no se indexa y se pisa cuando dos
-- pantallas escriben a la vez.
--
-- ⚠️ NO hay columna de ROL, y su ausencia es deliberada: no existe API que
-- devuelva el rol de nadie en un grupo. Una columna "role" invitaría a llenarla
-- con un dato inventado que después alguien usa para decidir dónde publicar.
CREATE TABLE IF NOT EXISTS "DistributionGroup" (
    id                TEXT PRIMARY KEY,
    "clubId"          TEXT NOT NULL,
    -- A qué cuenta conectada pertenece. NULL es legítimo: los grupos
    -- declarados antes de que existiera esta columna no la tienen, y
    -- asignarles una en silencio sería inventar una relación.
    "socialAccountId" TEXT,
    "groupId"         TEXT NOT NULL,
    name              TEXT NOT NULL,
    url               TEXT,
    avatar            TEXT,
    source            TEXT NOT NULL DEFAULT 'manual',
    status            TEXT NOT NULL DEFAULT 'sin_verificar',
    -- Quién dijo que se puede publicar ahí, y cuándo. Sin nombre, la
    -- verificación no sirve para lo único que puede servir: rendir cuentas.
    "verifiedAt"      TIMESTAMPTZ,
    "verifiedBy"      TEXT,
    "lastPublishedAt" TIMESTAMPTZ,
    "lastJobId"       TEXT,
    favorite          BOOLEAN NOT NULL DEFAULT FALSE,
    -- Las listas de distribución. Una lista es «los grupos con esta etiqueta»:
    -- seleccionarla es un filtro y renombrarla es un UPDATE.
    tags              TEXT[] NOT NULL DEFAULT '{}',
    notes             TEXT,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un grupo, una fila por sitio. Las dos columnas son NOT NULL, así que el
-- índice no es parcial y su ON CONFLICT no repite predicado (v4.648).
CREATE UNIQUE INDEX IF NOT EXISTS "DistributionGroup_club_group_key"
    ON "DistributionGroup"("clubId", "groupId");
CREATE INDEX IF NOT EXISTS "DistributionGroup_club_idx"
    ON "DistributionGroup"("clubId", name);
CREATE INDEX IF NOT EXISTS "DistributionGroup_tags_idx"
    ON "DistributionGroup" USING GIN (tags);
`;

/**
 * Crea las tablas si faltan. Idempotente y memoizada por instancia.
 *
 * La comprobación previa no es adorno: estas sentencias son idempotentes pero
 * no gratis, y sin ella cada arranque en frío de la función paga varios viajes
 * a la base que acaba pagando la primera visita (v4.659).
 */
export const ensureDistributionSchema = async () => {
    if (ensured) return ensured;
    ensured = (async () => {
        try {
            const { rows } = await db.query(
                // Se pregunta por la tabla MÁS NUEVA: con la vieja, una base
                // que ya tiene las tres de v4.864 daría el esquema por completo
                // y DistributionGroup no se crearía nunca.
                `SELECT to_regclass('public."DistributionGroup"') IS NOT NULL AS ok`
            );
            if (rows?.[0]?.ok) return true;
            await db.query(SQL);
            return true;
        } catch (e) {
            // No se relanza: quien llame decide. Un fallo acá deja el módulo sin
            // servir, no la plataforma caída.
            console.error('[distribution] no se pudo asegurar el esquema:', e.message);
            ensured = null;
            return false;
        }
    })();
    return ensured;
};

export default ensureDistributionSchema;
