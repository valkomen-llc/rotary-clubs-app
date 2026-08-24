// Lo que el ciclo de vida de un aporte necesita que exista en la base, creado
// en tiempo de ejecución.
//
// v4.885 — DOS TABLAS Y NINGUNA MÁS:
//
//   `PaymentLifecycleEvent`  la traza: cada cambio de estado, con quién lo hizo.
//   `Disbursement`           el traslado efectivo al beneficiario, con su
//                            comprobante y el resultado de su notificación.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ POR QUÉ NO SE LE AGREGA NI UNA COLUMNA A `Payment`.
// ═════════════════════════════════════════════════════════════════════
//
// Era el camino corto: un `lifecycleState` y un `disbursedAt` en el modelo de
// Prisma y listo. No se hace, y el motivo está medido en este proyecto más de
// una vez:
//
//   · `Payment` y `Donation` se consultan con `findMany` **sin `select`** en
//     media plataforma. Prisma entonces pide TODAS las columnas del esquema, así
//     que una columna declarada y todavía inexistente en la base deja esas
//     consultas en **500** desde el primer despliegue hasta que alguien corra
//     `db:push` a mano. Es la regla de `logo_intl` (v4.699).
//
//   · Y el `build` **no** ejecuta `db push` a propósito, desde el incidente del
//     2026-07-13. Así que ese «hasta que alguien lo corra» no tiene fecha.
//
//   · Lo que caería en 500 acá es EL COBRO. No una pantalla: el webhook de
//     Stripe. Es el sitio más caro de la plataforma para estrenar un riesgo de
//     despliegue.
//
// Creadas en runtime existen cuando existen, y todo lo que las lee degrada a
// vacío mientras no estén. Van en la lista de `scripts/db-push-guard.mjs`.
//
// ⚠️ SIN CLAVE FORÁNEA A `Payment`, y también a propósito: `Payment` sí es un
// modelo de Prisma, así que una restricción declarada sólo acá es otra cosa que
// `db push` podría quitar en silencio. El vínculo va por `paymentId` desde esta
// tabla, nunca al revés — la misma decisión que `EcosystemClone` (v4.749) y que
// `NotificationDelivery` (v4.855).
//
// ⚠️ NINGUNA COMILLA INVERTIDA DENTRO DEL SQL, NI EN UN COMENTARIO. El SQL vive
// en un template literal y una comilla invertida ahí lo cierra a mitad: el
// módulo entero deja de parsear y, como el servidor no pasa por ningún
// compilador, el fallo viaja intacto a producción. Ya pasó en
// `ensureDesignSchema.js` (v4.721.1) y en `ensureLedgerSchema.js`.
import db from './db.js';

let ensured = null;

const SQL = `
-- ── LA TRAZA ────────────────────────────────────────────────────────
--
-- Un evento por cada cambio de estado. NUNCA se actualiza una fila y nunca se
-- borra: corregir es escribir otro evento que lo diga. Un historial que se
-- puede editar no contesta "que decia esto en marzo", que es la unica pregunta
-- para la que existe un historial. Misma regla que el libro mayor.
CREATE TABLE IF NOT EXISTS "PaymentLifecycleEvent" (
    id            TEXT PRIMARY KEY,
    "paymentId"   TEXT NOT NULL,
    "clubId"      TEXT NOT NULL,
    -- Que ocurrio: received, in_transit, available, disbursed, notified...
    kind          TEXT NOT NULL,
    "fromState"   TEXT,
    "toState"     TEXT,
    -- Quien lo hizo. 'system' es el barrido, 'user' es una persona con nombre,
    -- 'provider' es Stripe contestando. Sin esto, "por que cambio esto" no
    -- tiene donde mirarse.
    "actorKind"   TEXT NOT NULL DEFAULT 'system',
    "actorId"     TEXT,
    "actorLabel"  TEXT,
    -- La referencia relacionada: el id del desembolso, el de la balance
    -- transaction, el del payout.
    reference     TEXT,
    note          TEXT,
    meta          JSONB,
    -- Cuando OCURRIO, que no es cuando se anoto. Un evento reconciliado hacia
    -- atras ocurrio el dia que ocurrio, no el dia que lo descubrimos.
    "occurredAt"  TIMESTAMPTZ NOT NULL,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LA IDEMPOTENCIA DE LA TRAZA, y es lo que hace seguro correr el barrido cada
-- quince minutos: el mismo cambio de estado sobre el mismo pago se anota UNA
-- vez. Sin esto, un aporte acumularia un evento identico por cada vuelta del
-- cron y la linea de tiempo seria ilegible en un dia.
--
-- Las tres columnas son NOT NULL menos "toState", asi que el indice NO es
-- parcial para las filas que la llevan; para las que no —una notificacion, por
-- ejemplo— NULL es distinto de NULL en Postgres y no chocan entre si, que es
-- justo lo que se quiere: dos notificaciones al mismo aporte son dos hechos.
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentLifecycleEvent_step_key"
    ON "PaymentLifecycleEvent"("paymentId", kind, "toState");

CREATE INDEX IF NOT EXISTS "PaymentLifecycleEvent_payment_idx"
    ON "PaymentLifecycleEvent"("paymentId", "occurredAt");

CREATE INDEX IF NOT EXISTS "PaymentLifecycleEvent_club_idx"
    ON "PaymentLifecycleEvent"("clubId", "occurredAt" DESC);

-- ── EL DESEMBOLSO ───────────────────────────────────────────────────
--
-- El traslado efectivo hacia el beneficiario. DISPONIBLE no es DESEMBOLSADO:
-- lo primero dice que el dinero se puede usar, lo segundo que se movio de
-- verdad. La Boveda contestaba la primera pregunta y no tenia donde registrar
-- la segunda.
CREATE TABLE IF NOT EXISTS "Disbursement" (
    id             TEXT PRIMARY KEY,
    "paymentId"    TEXT NOT NULL,
    "clubId"       TEXT NOT NULL,
    -- El aporte, cuando se lo pudo atar. Sirve para la ficha del aportante.
    "donationId"   TEXT,
    amount         DOUBLE PRECISION NOT NULL,
    currency       TEXT NOT NULL,
    "disbursedAt"  TIMESTAMPTZ NOT NULL,
    beneficiary    TEXT NOT NULL,
    method         TEXT NOT NULL,
    reference      TEXT,
    notes          TEXT,
    -- 'confirmado' o 'reversado'. NUNCA se borra una fila: una operacion
    -- financiera confirmada que desaparece sin rastro es lo que un libro existe
    -- para impedir. Corregir es reversar, y el reverso se ve.
    status         TEXT NOT NULL DEFAULT 'confirmado',
    "reversedAt"   TIMESTAMPTZ,
    "reversedBy"   TEXT,
    "reversedReason" TEXT,
    -- El comprobante. La CLAVE de S3, no una URL publica: el enlace se firma al
    -- pedirlo y caduca. Un documento financiero servido desde una direccion
    -- adivinable es una filtracion esperando a que alguien la encuentre.
    "receiptKey"   TEXT,
    "receiptName"  TEXT,
    "receiptMime"  TEXT,
    "receiptBytes" INTEGER,
    -- La notificacion al beneficiario. Se registra el resultado, no la
    -- intencion: si el correo fallo, el desembolso sigue siendo valido y lo que
    -- queda pendiente es el aviso.
    "notifyEmail"  TEXT,
    "notifyState"  TEXT,
    "notifyAt"     TIMESTAMPTZ,
    "notifyError"  TEXT,
    "notifyDeliveryId" TEXT,
    -- v4.887 — EL LOTE. Un giro que cubre varios aportes deja UNA fila por
    -- aporte —eso no cambia— pero las N comparten este identificador, y de ahi
    -- se DERIVA que su comprobante es el del giro completo y no el de ese
    -- aporte suelto. Sin el, la ficha tendria que afirmar que un mismo archivo
    -- respalda a cada aporte por separado, que es lo que no se puede decir.
    -- NULL significa "desembolso suelto", que es lo que son todos los
    -- anteriores a v4.887.
    "batchId"      TEXT,
    -- Quien lo registro. Una operacion financiera sin autor no rinde cuentas.
    "createdBy"    TEXT,
    "createdByName" TEXT,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "Disbursement_payment_idx"
    ON "Disbursement"("paymentId", "disbursedAt");

CREATE INDEX IF NOT EXISTS "Disbursement_club_idx"
    ON "Disbursement"("clubId", "disbursedAt" DESC);

CREATE INDEX IF NOT EXISTS "Disbursement_batch_idx"
    ON "Disbursement"("batchId") WHERE "batchId" IS NOT NULL;

-- La proteccion contra el doble registro por doble clic o por reintento de red.
-- No es la referencia bancaria a secas —dos aportes distintos pueden salir en
-- la misma transferencia— sino la referencia DENTRO del mismo pago.
-- Parcial porque la referencia es opcional: un traslado en efectivo puede no
-- tener numero, y exigirlo dejaria el movimiento sin anotar en ninguna parte.
--
-- Por ser PARCIAL, un ON CONFLICT contra este indice tiene que repetir su
-- predicado o la sentencia falla entera. Es el error que costo una correccion
-- en v4.648 y otra en v4.856.
CREATE UNIQUE INDEX IF NOT EXISTS "Disbursement_payment_reference_key"
    ON "Disbursement"("paymentId", reference)
    WHERE reference IS NOT NULL AND status = 'confirmado';
`;

/**
 * Lo que se AGREGA a una tabla que ya existe.
 *
 * Idempotente y barato: `ADD COLUMN IF NOT EXISTS` no hace nada cuando la
 * columna está. Va aparte del `CREATE` porque aquél no amplía: una base que
 * estrenó el módulo en v4.885 tiene la tabla sin `batchId`, y sin esto el
 * `INSERT` fallaría con «column does not exist» — en silencio, porque este
 * módulo degrada.
 */
const ALTERS = `
ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
CREATE INDEX IF NOT EXISTS "Disbursement_batch_idx"
    ON "Disbursement"("batchId") WHERE "batchId" IS NOT NULL;
`;

/**
 * Crea las tablas si faltan. NUNCA lanza.
 *
 * Un fallo acá no puede tumbar un cobro ni la Bóveda: lo que se pierde es la
 * traza y la posibilidad de registrar un desembolso, y todo lo que las lee
 * degrada a vacío. Se avisa, se deja `ensured` en null para reintentar en el
 * próximo arranque en frío, y el aporte se registra como siempre.
 */
export const ensureDisbursementSchema = async () => {
    if (ensured) return ensured;
    ensured = (async () => {
        try {
            // Una consulta al catálogo por arranque en frío en vez de dos
            // CREATE idempotentes: es la lección de rendimiento de v4.659.
            const { rows } = await db.query(
                `SELECT to_regclass('public."Disbursement"') IS NOT NULL
                        AND to_regclass('public."PaymentLifecycleEvent"') IS NOT NULL AS ok`
            );
            if (rows?.[0]?.ok) {
                // ⚠️ LA TABLA PUEDE EXISTIR YA Y SIN LA COLUMNA NUEVA. `CREATE
                // TABLE IF NOT EXISTS` no amplía nada, así que un despliegue
                // posterior que agregue una columna tiene que pedirla aparte —
                // es la regla de `EventRegistration` (v4.648): se AMPLÍA con
                // `ADD COLUMN IF NOT EXISTS`, jamás se recrea, porque tiene
                // datos de producción.
                await db.query(ALTERS);
                return { ok: true, created: false };
            }

            await db.query(SQL);
            console.log('[WALLET] Tablas del ciclo de vida creadas: PaymentLifecycleEvent, Disbursement');
            return { ok: true, created: true };
        } catch (e) {
            console.error('[WALLET] ensureDisbursementSchema falló (el módulo degrada):', e?.message);
            ensured = null; // se reintenta en el próximo arranque en frío
            return { ok: false, created: false, error: e?.message };
        }
    })();
    return ensured;
};

export default ensureDisbursementSchema;
