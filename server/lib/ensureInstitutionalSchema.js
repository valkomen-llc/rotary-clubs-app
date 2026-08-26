// ════════════════════════════════════════════════════════════════════
// Lo que los accesos institucionales necesitan que exista en la base,
// creado en tiempo de ejecución. v4.932.0
//
//   `InstitutionalProfile`      el perfil y los permisos de un `User`, y su
//                               vínculo con la cuenta de correo.
//   `InstitutionalAccessEvent`  la auditoría: qué pasó y quién lo hizo.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ POR QUÉ NO SE LE AGREGA NI UNA COLUMNA A `User` NI A `EmailAccount`.
// ═════════════════════════════════════════════════════════════════════
//
// Era el camino corto: un `firstName`, un `avatarUrl` y un `ownerUserId` en el
// esquema de Prisma y listo. No se hace, y el motivo está medido en este
// proyecto más de una vez:
//
//   · `User` y `EmailAccount` se consultan con `findMany` **sin `select`** en
//     media plataforma. Prisma entonces pide TODAS las columnas del esquema,
//     así que una columna declarada y todavía inexistente en la base deja esas
//     consultas en **500** desde el primer despliegue. Es la regla de
//     `logo_intl` (v4.699).
//
//   · El `build` **no** ejecuta `db push` a propósito, desde el incidente del
//     2026-07-13. Ese «hasta que alguien lo corra» no tiene fecha.
//
//   · Y lo que caería en 500 acá es EL INGRESO —`authenticatePlatform` lee
//     `User`— y la BANDEJA. No una pantalla secundaria: la puerta.
//
// Creadas en runtime existen cuando existen, y todo lo que las lee degrada:
// sin fila, un usuario es exactamente lo que era antes de este módulo. Van a la
// lista que protege `scripts/db-push-guard.mjs`, que compara la base contra
// `schema.prisma` y aborta si una tabla no declarada fuera a perderse.
//
// ⚠️ NINGUNA COMILLA INVERTIDA DENTRO DEL SQL, NI EN UN COMENTARIO. El SQL vive
// en un template literal y una comilla invertida ahí lo cierra a mitad: el
// módulo entero deja de parsear y, como el servidor no pasa por ningún
// compilador, el fallo viaja intacto a producción. Ya pasó en
// `ensureDesignSchema.js` (v4.721.1) y en `ensureLedgerSchema.js`.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let ensured = null;

const SQL = `
-- ── EL PERFIL Y LOS PERMISOS ────────────────────────────────────────
--
-- Una fila por cada "User" que ademas es una identidad institucional. Los
-- roles administrativos que existian ANTES de este modulo no tienen fila, y
-- eso es correcto: su rol ya es la concesion y "can()" no les pide lista.
CREATE TABLE IF NOT EXISTS "InstitutionalProfile" (
    id                  TEXT PRIMARY KEY,
    -- El vinculo con la identidad. UNIQUE: un usuario tiene un perfil.
    -- Sin clave foranea a "User" a proposito: "User" SI es un modelo de Prisma,
    -- asi que una restriccion declarada solo aca es otra cosa que db push
    -- podria quitar en silencio. El vinculo va por "userId" desde esta tabla,
    -- nunca al reves — la decision de EcosystemClone (v4.749).
    "userId"            TEXT NOT NULL,
    -- El sitio. Es lo que sostiene el aislamiento multi-tenant: TODA consulta
    -- del modulo lo lleva en el WHERE, no lo comprueba despues de leer.
    "clubId"            TEXT NOT NULL,
    -- La cuenta de correo de la que es propietario. NULL significa que tiene
    -- acceso al panel sin buzon propio, que es un caso legitimo.
    "emailAccountId"    TEXT,
    -- La direccion, normalizada en minusculas. Se guarda ademas del id porque
    -- es lo que decide el alcance de la bandeja y no queremos un JOIN para
    -- resolver cada peticion de mensajes.
    mailbox             TEXT,
    "firstName"         TEXT,
    "lastName"          TEXT,
    position            TEXT,
    -- La fotografia de perfil. Es una URL de nuestra Biblioteca Multimedia,
    -- subida por el camino de siempre (uploadMediaFiles): no hay un segundo
    -- camino a S3, que se separaria en silencio.
    "avatarUrl"         TEXT,
    -- El catalogo CERRADO de institutionalAccess.js. Un permiso que no este
    -- ahi se descarta al guardar y "can()" lo rechaza igual al leer.
    permissions         JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 'active' o 'suspended'. Suspender NO borra: revoca el acceso y deja la
    -- traza. Borrar dejaria sin explicacion los correos que esa persona envio.
    status              TEXT NOT NULL DEFAULT 'active',
    -- La contrasena que escribio el administrador la conoce alguien que no es
    -- su dueno. Mientras esto sea true, el panel pide cambiarla antes de nada.
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordSetAt"     TIMESTAMPTZ,
    -- Recuperacion de contrasena. Se guarda el TOKEN, nunca una contrasena:
    -- no se mandan contrasenas por correo, se manda un enlace que vence.
    "resetToken"        TEXT,
    "resetExpiry"       TIMESTAMPTZ,
    -- Ultimo ingreso, para la administracion. Es un dato de auditoria, no de
    -- sesion: no gobierna nada.
    "lastLoginAt"       TIMESTAMPTZ,
    "lastLoginIp"       TEXT,
    "createdBy"         TEXT,
    "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un usuario, un perfil. Es lo que impide el duplicado que el pedido nombra
-- expresamente: si el correo ya pertenece a un usuario, se VINCULA en vez de
-- crear otro.
CREATE UNIQUE INDEX IF NOT EXISTS "InstitutionalProfile_user_key"
    ON "InstitutionalProfile"("userId");

-- Una cuenta de correo tiene un solo propietario. PARCIAL porque "emailAccountId"
-- es opcional y en Postgres NULL nunca es igual a NULL: sin el predicado, dos
-- perfiles sin buzon no chocarian —correcto— pero el indice tampoco protegeria
-- nada. Por ser parcial, un ON CONFLICT contra el tendria que repetir el
-- predicado o la sentencia falla entera (v4.648): por eso el alta comprueba el
-- duplicado y devuelve un mensaje redactado, sin apoyarse en ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS "InstitutionalProfile_account_key"
    ON "InstitutionalProfile"("emailAccountId")
    WHERE "emailAccountId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "InstitutionalProfile_club_idx"
    ON "InstitutionalProfile"("clubId");

CREATE INDEX IF NOT EXISTS "InstitutionalProfile_mailbox_idx"
    ON "InstitutionalProfile"(mailbox);

-- ── LA AUDITORIA ────────────────────────────────────────────────────
--
-- SOLO SE AGREGA. No hay UPDATE ni DELETE sobre una fila: corregir es escribir
-- otro evento que lo diga. Un historial que se puede editar no contesta "quien
-- le dio este permiso en marzo", que es la unica pregunta para la que existe.
--
-- ⚠️ NINGUNA COLUMNA GUARDA UNA CONTRASENA, ni su hash, ni un token. Lo que se
-- anota es QUE paso y QUIEN lo hizo. Una traza que copia el secreto convierte
-- la auditoria en una segunda filtracion.
CREATE TABLE IF NOT EXISTS "InstitutionalAccessEvent" (
    id            TEXT PRIMARY KEY,
    "clubId"      TEXT,
    -- A quien le paso. Puede ser NULL en un intento fallido contra un correo
    -- que no existe: el evento igual se anota, porque es lo que hace visible un
    -- ataque de fuerza bruta.
    "userId"      TEXT,
    email         TEXT,
    -- Del catalogo cerrado AUDIT_EVENTS.
    kind          TEXT NOT NULL,
    -- Quien lo hizo: 'system', 'user' o 'self'. Sin esto, "por que cambio esto"
    -- no distingue una decision de una consecuencia.
    "actorKind"   TEXT NOT NULL DEFAULT 'system',
    "actorId"     TEXT,
    "actorLabel"  TEXT,
    detail        TEXT,
    ip            TEXT,
    "userAgent"   TEXT,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "InstitutionalAccessEvent_club_idx"
    ON "InstitutionalAccessEvent"("clubId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "InstitutionalAccessEvent_user_idx"
    ON "InstitutionalAccessEvent"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "InstitutionalAccessEvent_email_idx"
    ON "InstitutionalAccessEvent"(email, "createdAt" DESC);
`;

/**
 * Lo que se AGREGA a una tabla que ya existe.
 *
 * ⚠️ `CREATE TABLE IF NOT EXISTS` NO AMPLÍA NADA: una base que estrenó el
 * módulo en v4.932 tiene la tabla sin la columna que agregue v4.940, y el
 * `INSERT` fallaría con «column does not exist» —en silencio, porque este
 * módulo degrada—. Es la regla de `EventRegistration` (v4.648): se AMPLÍA con
 * `ADD COLUMN IF NOT EXISTS`, jamás se recrea.
 *
 * Hoy está vacío porque el módulo se estrena. Al agregar una columna, agregarla
 * ACÁ y enumerarla en `COLUMNAS_PROPIAS` de abajo, o el atajo del catálogo dará
 * la tabla por completa y el `ALTER` no correrá nunca — la trampa que se pagó
 * el mismo día en v4.908.
 */
const ALTERS = `
ALTER TABLE "InstitutionalProfile" ADD COLUMN IF NOT EXISTS "lastLoginIp" TEXT;
`;

/**
 * Las columnas que el atajo del catálogo comprueba de verdad.
 *
 * No es un número de versión: enumera los objetos reales del archivo. Si no se
 * amplía al agregar una columna, la comprobación rápida la da por presente.
 */
const COLUMNAS_PROPIAS = ['lastLoginIp'];

/**
 * Crea las tablas si faltan. NUNCA lanza.
 *
 * Un fallo acá no puede tumbar el ingreso ni la bandeja: lo que se pierde es el
 * perfil, y sin perfil un usuario es exactamente lo que era antes de este
 * módulo. Se avisa, se deja `ensured` en null para reintentar en el próximo
 * arranque en frío, y el sitio sigue funcionando.
 */
export const ensureInstitutionalSchema = async () => {
    if (ensured) return ensured;
    ensured = (async () => {
        try {
            // Una consulta al catálogo por arranque en frío en vez de dos CREATE
            // idempotentes: es la lección de rendimiento de v4.659.
            const { rows } = await db.query(
                `SELECT to_regclass('public."InstitutionalProfile"') IS NOT NULL
                        AND to_regclass('public."InstitutionalAccessEvent"') IS NOT NULL AS tablas,
                        (SELECT count(*)::int FROM information_schema.columns
                          WHERE table_name = 'InstitutionalProfile'
                            AND column_name = ANY($1::text[])) AS columnas`,
                [COLUMNAS_PROPIAS]
            );
            const fila = rows?.[0];
            if (fila?.tablas && Number(fila.columnas) === COLUMNAS_PROPIAS.length) {
                return { ok: true, created: false };
            }
            if (fila?.tablas) {
                await db.query(ALTERS);
                return { ok: true, created: false };
            }

            await db.query(SQL);
            await db.query(ALTERS);
            console.log('[ACCESOS] Tablas creadas: InstitutionalProfile, InstitutionalAccessEvent');
            return { ok: true, created: true };
        } catch (e) {
            console.error('[ACCESOS] ensureInstitutionalSchema falló (el módulo degrada):', e?.message);
            ensured = null; // se reintenta en el próximo arranque en frío
            return { ok: false, created: false, error: e?.message };
        }
    })();
    return ensured;
};

export default ensureInstitutionalSchema;
