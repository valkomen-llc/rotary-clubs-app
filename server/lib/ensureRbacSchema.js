// ════════════════════════════════════════════════════════════════════
// Lo que el RBAC necesita que exista en la base, creado en tiempo de
// ejecución. v4.937.0
//
//   `SiteRole`        los roles PERSONALIZADOS de un sitio. Los predeterminados
//                     NO están acá: viven en `rbacSpec.ROLE_PRESETS`.
//   `SiteMembership`  quién participa en qué sitio, con qué rol y con qué
//                     excepciones. Es lo que hace esto multi-tenant.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ POR QUÉ LOS PRESETS NO SE SIEMBRAN EN LA BASE
// ═════════════════════════════════════════════════════════════════════
//
// Sembrar «Administrador del sitio», «Editor», «Autor» y «Colaborador» como
// filas de cada sitio era el camino corto y no se hace, por dos motivos que ya
// costaron caro en este repositorio:
//
//   · Exigiría que un DESPLIEGUE ESCRIBIERA en la base, que es exactamente lo
//     que prohíbe la sección de base de datos de CLAUDE.md desde el incidente
//     del 2026-07-13.
//
//   · Y dejaría a cada sitio con su copia, que se separa en silencio de la
//     versión siguiente: corregir un permiso mal puesto en «Editor» habría que
//     hacerlo sitio por sitio, y el que no se corrigiera nadie lo notaría.
//
// Un preset se lee del código, no se puede borrar ni renombrar, y para
// adaptarlo se DUPLICA — y el duplicado sí es una fila de `SiteRole`, que ya es
// del sitio y ningún despliegue vuelve a tocar. Es la misma regla que la
// siembra de recorridos del CRM (v4.701) y la del Generador de Pendones.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ POR QUÉ NO SE LE AGREGA NI UNA COLUMNA A `User`
// ═════════════════════════════════════════════════════════════════════
//
// `User` se consulta con `findMany` **sin `select`** en media plataforma —el
// ingreso, el panel de usuarios, la bandeja—, así que Prisma pide TODAS las
// columnas del esquema y una declarada y todavía inexistente en la base deja
// esas consultas en **500** desde el primer despliegue. Es la regla de
// `logo_intl` (v4.699) y lo que caería en 500 acá es EL INGRESO. El `build` no
// ejecuta `db push` a propósito, así que ese «hasta que alguien lo corra» no
// tiene fecha. Sin clave foránea a `User` por lo mismo: una restricción
// declarada sólo acá es otra cosa que `db push` podría quitar en silencio.
//
// ⚠️ NINGUNA COMILLA INVERTIDA DENTRO DEL SQL, NI EN UN COMENTARIO. El SQL vive
// en un template literal y una comilla invertida ahí lo cierra a mitad: el
// módulo entero deja de parsear y, como el servidor no pasa por ningún
// compilador, el fallo viaja intacto a producción (v4.721.1).
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let ensured = null;

const SQL = `
-- ── LOS ROLES PERSONALIZADOS DE UN SITIO ────────────────────────────
--
-- Una fila por rol que alguien creo o duplico. Los predeterminados no tienen
-- fila: se leen de rbacSpec.ROLE_PRESETS.
CREATE TABLE IF NOT EXISTS "SiteRole" (
    id             TEXT PRIMARY KEY,
    -- El sitio duenio del rol. Es lo que sostiene el aislamiento: un rol de un
    -- sitio no se puede asignar en otro, y TODA consulta lo lleva en el WHERE.
    "clubId"       TEXT NOT NULL,
    -- El identificador estable. Se deriva del nombre al crear y NO se edita
    -- despues: es lo que ata las membresias a su rol, igual que la clave de una
    -- categoria de inscripcion (v4.648).
    key            TEXT NOT NULL,
    name           TEXT NOT NULL,
    description    TEXT,
    -- Del catalogo CERRADO de rbacSpec. Un permiso que no este ahi se descarta
    -- al guardar y hasPermission lo rechaza igual al leer.
    permissions    JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 'site' siempre en esta tabla: un rol de plataforma no lo crea nadie desde
    -- un sitio. La columna existe para que la comprobacion sea explicita y no
    -- deducida del hecho de estar aca.
    scope          TEXT NOT NULL DEFAULT 'site',
    -- Desactivar un rol NO lo borra: deja de ofrecerse en el desplegable y
    -- quien ya lo tenia lo conserva. Borrarlo dejaria membresias apuntando a
    -- algo inexistente, y con ellas la unica traza de por que alguien entraba.
    active         BOOLEAN NOT NULL DEFAULT true,
    "createdBy"    TEXT,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un nombre de rol por sitio. NO es parcial —las dos columnas son NOT NULL—
-- asi que un ON CONFLICT contra el no tiene predicado que repetir y no cae en
-- la trampa de v4.648.
CREATE UNIQUE INDEX IF NOT EXISTS "SiteRole_club_key_key"
    ON "SiteRole"("clubId", key);

CREATE INDEX IF NOT EXISTS "SiteRole_club_idx" ON "SiteRole"("clubId");

-- ── QUIEN PARTICIPA EN QUE SITIO ────────────────────────────────────
--
-- ⚠️ UNA FILA POR USUARIO Y POR SITIO, y es el punto 13 del pedido: Maria puede
-- ser Editor en el sitio A y Usuario institucional en el B. Guardar el rol
-- dentro de "User" haria el rol GLOBAL y esas dos lineas serian imposibles.
CREATE TABLE IF NOT EXISTS "SiteMembership" (
    id                   TEXT PRIMARY KEY,
    "userId"             TEXT NOT NULL,
    "clubId"             TEXT NOT NULL,
    -- El rol. Uno de los dos, nunca los dos: "roleKey" apunta a un preset del
    -- codigo y "roleId" a una fila de SiteRole. Se guardan por separado porque
    -- un preset no tiene id y una fila puede renombrarse sin mover nada.
    "roleKey"            TEXT,
    "roleId"             TEXT,
    -- Las EXCEPCIONES individuales del punto 11. El rol es la fuente principal;
    -- esto es el ajuste fino, y por eso se guarda aparte: fundido con el rol no
    -- se podria contestar "esto lo trae su rol o se lo dieron a el".
    "extraPermissions"   JSONB NOT NULL DEFAULT '[]'::jsonb,
    "deniedPermissions"  JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 'active' | 'invited' | 'suspended' | 'disabled'. Ver MEMBERSHIP_STATUSES.
    status               TEXT NOT NULL DEFAULT 'active',
    -- ⚠️ CERRAR SESIONES ACTIVAS. Un token firmado no se puede retirar, asi que
    -- lo que se hace es invalidar todo el que se haya emitido ANTES de esta
    -- marca: el guardia compara "iat" contra ella en cada peticion. Sin esto,
    -- "cerrar sesiones" seria un boton que no cierra nada hasta que el token
    -- venza solo — hasta un dia despues.
    "sessionsRevokedAt"  TIMESTAMPTZ,
    "invitedBy"          TEXT,
    "lastAccessAt"       TIMESTAMPTZ,
    "createdBy"          TEXT,
    "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un usuario, un rol POR SITIO. Las dos columnas son NOT NULL, asi que el
-- indice no es parcial y el ON CONFLICT del alta no repite predicado.
CREATE UNIQUE INDEX IF NOT EXISTS "SiteMembership_user_club_key"
    ON "SiteMembership"("userId", "clubId");

CREATE INDEX IF NOT EXISTS "SiteMembership_club_idx"
    ON "SiteMembership"("clubId", status);

CREATE INDEX IF NOT EXISTS "SiteMembership_user_idx"
    ON "SiteMembership"("userId");
`;

/**
 * Lo que se AGREGA a una tabla que ya existe.
 *
 * ⚠️ `CREATE TABLE IF NOT EXISTS` NO AMPLÍA NADA: una base que estrenó el
 * módulo en v4.937 tiene la tabla sin la columna que agregue v4.945, y el
 * `INSERT` fallaría con «column does not exist». Es la regla de
 * `EventRegistration` (v4.648): se AMPLÍA, jamás se recrea.
 *
 * ⚠️ Al agregar una columna, agregarla ACÁ **y** enumerarla en
 * `COLUMNAS_PROPIAS`, o el atajo del catálogo dará la tabla por completa y el
 * `ALTER` no correrá nunca — la trampa que se pagó el mismo día en v4.908.
 */
const ALTERS = `
ALTER TABLE "SiteMembership" ADD COLUMN IF NOT EXISTS "sessionsRevokedAt" TIMESTAMPTZ;
ALTER TABLE "SiteMembership" ADD COLUMN IF NOT EXISTS "lastAccessAt" TIMESTAMPTZ;
ALTER TABLE "SiteRole" ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
`;

/** Las columnas que el atajo del catálogo comprueba de verdad. */
const COLUMNAS = [
    { table: 'SiteMembership', column: 'sessionsRevokedAt' },
    { table: 'SiteMembership', column: 'lastAccessAt' },
    { table: 'SiteRole', column: 'active' },
];

/**
 * Crea las tablas si faltan. NUNCA lanza.
 *
 * Un fallo acá no puede tumbar el ingreso ni el panel: lo que se pierde son los
 * roles personalizados y las membresías, y sin ellos `resolveGrant` cae al
 * respaldo por rol —o sea, al comportamiento exacto de antes de este módulo—.
 * Se avisa, se deja `ensured` en null para reintentar en el próximo arranque en
 * frío, y el sitio sigue funcionando.
 */
export const ensureRbacSchema = async () => {
    if (ensured) return ensured;
    ensured = (async () => {
        try {
            // Una consulta al catálogo por arranque en frío en vez de dos CREATE
            // idempotentes: es la lección de rendimiento de v4.659.
            const { rows } = await db.query(
                `SELECT to_regclass('public."SiteRole"') IS NOT NULL
                        AND to_regclass('public."SiteMembership"') IS NOT NULL AS tablas,
                        (SELECT count(*)::int FROM information_schema.columns
                          WHERE (table_name, column_name) IN (
                              ('SiteMembership','sessionsRevokedAt'),
                              ('SiteMembership','lastAccessAt'),
                              ('SiteRole','active')
                          )) AS columnas`
            );
            const fila = rows?.[0];
            if (fila?.tablas && Number(fila.columnas) === COLUMNAS.length) {
                return { ok: true, created: false };
            }
            if (fila?.tablas) {
                await db.query(ALTERS);
                return { ok: true, created: false };
            }
            await db.query(SQL);
            await db.query(ALTERS);
            console.log('[RBAC] Tablas creadas: SiteRole, SiteMembership');
            return { ok: true, created: true };
        } catch (e) {
            console.error('[RBAC] ensureRbacSchema falló (el módulo degrada):', e?.message);
            ensured = null; // se reintenta en el próximo arranque en frío
            return { ok: false, created: false, error: e?.message };
        }
    })();
    return ensured;
};

export default ensureRbacSchema;
