// ════════════════════════════════════════════════════════════════════════════
// Difusión de contenido en redes — el esquema, en runtime (v4.1013)
//
// UNA tabla fuera de Prisma, sin clave foránea a `Post` ni a `SocialAccount`,
// por el motivo de siempre (regla de `logo_intl`, v4.699): `Post` se consulta
// con `findMany` **sin `select`** en media plataforma, así que una columna
// declarada y todavía inexistente deja en 500 el listado de Noticias y la
// ficha pública de cada artículo — y el `build` no ejecuta `db push` desde el
// incidente del 2026-07-13, así que ese «hasta que alguien lo corra» no tiene
// fecha. **`Post` NO gana ni una columna**: el vínculo va desde
// `ContentDistribution.entityId`, nunca al revés.
//
// ⚠️ TAMPOCO SE LE AGREGA UNA COLUMNA A `SocialPublication`. Aquélla es de
// Prisma y modela una PIEZA generada por el Estudio de Contenido —imagen,
// copies por plataforma, programación—; esto es el REGISTRO DE DIFUSIÓN de
// una entidad que ya existe en la plataforma. Fundirlas obligaría a inventar
// una publicación con imagen para cada artículo compartido, y a que el
// historial de un artículo se leyera de una tabla que habla de otra cosa.
//
//   ContentDistribution   una fila por (entidad × cuenta × operación): qué se
//                         publicó, dónde, con qué texto, qué contestó Meta,
//                         quién lo pidió y cuándo. SÓLO AGREGA.
//
// Está en la lista del guardián de `db:push`.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` va ENUMERADO acá (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía nada, y con el atajo mirando sólo la tabla un ALTER
// nuevo no correría jamás y el INSERT fallaría con «column does not exist» —
// en silencio, porque este módulo degrada.
const OWNED_COLUMNS = {
    ContentDistribution: [],
};

export async function ensureContentDistributionSchema() {
    if (_ready) return;
    const columnasEsperadas = Object.values(OWNED_COLUMNS).reduce((n, c) => n + c.length, 0);
    const { rows } = await db.query(`
        SELECT to_regclass('public."ContentDistribution"') IS NOT NULL AS t,
               (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_name = 'ContentDistribution'
                   AND column_name IN ('__ninguna_todavia__'))::int AS columnas
    `);
    if (rows[0]?.t && rows[0]?.columnas === columnasEsperadas) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContentDistribution" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

            -- El TENANT. Sale del token, nunca del cuerpo de la peticion.
            "clubId" TEXT NOT NULL,

            -- Que se difundio. Catalogo CERRADO en socialShareSpec.ENTITY_TYPES.
            "entityType" TEXT NOT NULL,
            "entityId" TEXT NOT NULL,

            -- A donde. accountId apunta a SocialAccount, sin FK: esa tabla es
            -- de Prisma y una FK declarada solo aca seria otra cosa que
            -- db push podria quitar en silencio.
            network TEXT NOT NULL,
            "accountId" TEXT NOT NULL,
            "accountName" TEXT,
            "pageId" TEXT,

            -- Que contesto el proveedor.
            "externalId" TEXT,
            "externalUrl" TEXT,

            -- published | error | pending. El pending es el RECLAMO: la fila
            -- se escribe ANTES de llamar a Meta, asi dos peticiones simultaneas
            -- no publican dos veces.
            status TEXT NOT NULL DEFAULT 'pending',

            -- Lo que de verdad se publico. Se guarda porque el copy del
            -- articulo se puede editar despues, y entonces el historial diria
            -- que salio un texto que nunca salio.
            message TEXT,
            link TEXT,

            "errorCode" TEXT,
            error TEXT,

            -- Quien lo pidio. Sin esto, el historial no rinde cuentas.
            "userId" TEXT,
            "userName" TEXT,

            -- La clave de la OPERACION: la genera la pantalla al abrir el
            -- modal. Es lo que hace que un doble clic o un reintento de red no
            -- publiquen dos veces, y que "Publicar nuevamente" -otra
            -- operacion, otra clave- si pueda.
            "operationKey" TEXT NOT NULL,

            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- ⚠️ NO ES PARCIAL A PROPOSITO: las dos columnas son NOT NULL, asi que
        -- el ON CONFLICT va a secas. Contra un indice parcial habria que
        -- repetir su predicado exacto o la sentencia falla entera (v4.648).
        CREATE UNIQUE INDEX IF NOT EXISTS "ContentDistribution_operation_account_key"
            ON "ContentDistribution" ("operationKey", "accountId");

        CREATE INDEX IF NOT EXISTS "ContentDistribution_entity_idx"
            ON "ContentDistribution" ("entityType", "entityId", "createdAt" DESC);

        CREATE INDEX IF NOT EXISTS "ContentDistribution_club_idx"
            ON "ContentDistribution" ("clubId", "createdAt" DESC);
    `);

    for (const [tabla, columnas] of Object.entries(OWNED_COLUMNS)) {
        for (const col of columnas) {
            await db.query(`ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS ${col}`);
        }
    }

    _ready = true;
}

export default { ensureContentDistributionSchema };
