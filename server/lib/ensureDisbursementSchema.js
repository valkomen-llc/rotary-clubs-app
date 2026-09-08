// Lo que el ciclo de vida de un aporte necesita que exista en la base, creado
// en tiempo de ejecución.
//
// v4.885 — DOS TABLAS; v4.996 agregó la TERCERA:
//
//   `PaymentLifecycleEvent`  la traza: cada cambio de estado, con quién lo hizo.
//   `Disbursement`           el traslado efectivo al beneficiario, con su
//                            comprobante y el resultado de su notificación.
//   `DisbursementBatch`      el LOTE: un giro que cubre varios aportes, con sus
//                            totales, su comprobante y su ÚNICA notificación.
//   `DisbursementNotice`     v4.1014 — cada REENVÍO de la conciliación de un
//                            traslado: a quién, cuándo, con qué documento y
//                            por quién. Sólo agrega.
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

// ── EL LOTE (v4.996) — va en una constante propia porque se ejecuta por LAS
// DOS vías: al crear las tablas por primera vez y en el atajo de una base que
// ya las tenía. `CREATE TABLE IF NOT EXISTS` de arriba no lo crea en la
// segunda, y ésa es la base de producción.
const BATCH_SQL = `
-- ── EL LOTE (v4.996) ────────────────────────────────────────────────
--
-- Un giro que cubre varios aportes es UNA operacion: tiene su referencia, sus
-- totales, su comprobante y SU notificacion. Las N filas de "Disbursement"
-- cuelgan de el por "batchId" y no avisan por su cuenta — hasta v4.995 cada
-- una mandaba su correo y ocho aportes eran ocho correos al mismo beneficiario.
--
-- NUNCA se borra una fila: reversar los desembolsos que cuelgan de un lote
-- deja el lote escrito, con su historia. Un giro que desaparece sin rastro es
-- lo que un libro existe para impedir.
CREATE TABLE IF NOT EXISTS "DisbursementBatch" (
    id               TEXT PRIMARY KEY,
    "clubId"         TEXT NOT NULL,
    -- La campana de la que salieron los aportes. NULL = aportes sin campana.
    "campaignId"     TEXT,
    "campaignName"   TEXT,
    beneficiary      TEXT NOT NULL,
    -- El beneficiario del perfil de notificaciones, cuando se pudo resolver.
    "beneficiaryId"  TEXT,
    currency         TEXT NOT NULL,
    -- Cuantos aportes cubre y cuanto suman. "netAmount" es lo que se GIRO;
    -- "grossAmount", "fees" y "platformRetention" son lo que esos aportes
    -- costaron en origen. Se escriben al cerrar el lote, no al abrirlo.
    "count"          INTEGER NOT NULL DEFAULT 0,
    "grossAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    fees             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformRetention" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    method           TEXT NOT NULL,
    reference        TEXT,
    notes            TEXT,
    "disbursedAt"    TIMESTAMPTZ NOT NULL,
    status           TEXT NOT NULL DEFAULT 'confirmado',
    "receiptKey"     TEXT,
    "receiptName"    TEXT,
    "receiptMime"    TEXT,
    "receiptBytes"   INTEGER,
    -- Los destinatarios del UNICO aviso del lote y su resultado por canal y
    -- por destinatario. "notifyKey" es lote + tipo: la llave que un doble
    -- clic o un refresco encuentran ya marcada.
    "notifyKey"      TEXT,
    "notifyEmails"   JSONB,
    "notifyPhones"   JSONB,
    "notifyState"    TEXT,
    "notifyAt"       TIMESTAMPTZ,
    "notifyError"    TEXT,
    "notifyResults"  JSONB,
    -- La OPERACION del navegador. Un modal genera una llave al abrirse y la
    -- manda con la peticion: dos peticiones con la misma llave —doble clic,
    -- reintento de red— producen los mismos lotes UNA vez. Vacia para un
    -- cliente con el bundle anterior, que no la manda.
    "operationKey"   TEXT NOT NULL DEFAULT '',
    "groupKey"       TEXT NOT NULL DEFAULT '',
    "createdBy"      TEXT,
    "createdByName"  TEXT,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "completedAt"    TIMESTAMPTZ,
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "DisbursementBatch_club_idx"
    ON "DisbursementBatch"("clubId", "disbursedAt" DESC);

-- La idempotencia de la OPERACION. Parcial porque un cliente viejo manda la
-- llave vacia y dos operaciones distintas sin llave no pueden chocar entre si.
-- Por ser parcial, el ON CONFLICT repite el predicado o la sentencia falla
-- entera (v4.648).
CREATE UNIQUE INDEX IF NOT EXISTS "DisbursementBatch_operation_key"
    ON "DisbursementBatch"("operationKey", "groupKey")
    WHERE "operationKey" <> '';

-- v4.998 — VARIOS comprobantes por giro: el PDF del banco y la captura con el
-- costo de la transferencia. La lista completa va en JSONB
-- [{ key, name, mime, bytes }] y "receiptKey"/"receiptName"/"receiptMime"/
-- "receiptBytes" SE CONSERVAN con el PRIMERO: un lector con el bundle anterior
-- —y toda fila escrita antes— sigue viendo un comprobante. Es la regla
-- aditiva. Va como ALTER aparte porque CREATE TABLE IF NOT EXISTS no amplia
-- la tabla que v4.996 ya creo en produccion (la trampa de v4.908).
ALTER TABLE "DisbursementBatch" ADD COLUMN IF NOT EXISTS "receiptFiles" JSONB;
`;

// ── EL REENVÍO DE LA CONCILIACIÓN (v4.1014) ─────────────────────────
//
// Un REENVÍO es una OPERACION, no una entrega. Vive en su propia tabla y no en
// las columnas del lote por dos motivos que no se pueden resolver de otra
// forma:
//
//   · Las columnas "notifyEmails"/"notifyAt"/"notifyResults" del lote son el
//     aviso ORIGINAL del traslado. Pisarlas para anotar un reenvio borraria
//     "enviado originalmente a tesoreria@club.org el 28 de agosto", que es
//     justo lo que se pidio conservar.
//
//   · La grana es distinta. "NotificationDelivery" (v4.855) es una fila por
//     DESTINATARIO y por evento, con el id del proveedor y su estado de
//     entrega; un reenvio es UNA accion con N destinatarios, un documento y un
//     autor. Se usan las dos: esta tabla registra la operacion y aquella sigue
//     siendo quien reclama cada correo. NO se duplica nada.
//
// ⚠️ SOLO AGREGA. Ni UPDATE ni DELETE sobre una fila: corregir es escribir otro
// reenvio. Es lo unico que contesta "quien recibio esta conciliacion y cuando"
// dentro de seis meses.
//
// ⚠️ Y NO TOCA NI UN ESTADO FINANCIERO. Reenviar un documento no crea un
// desembolso, no cambia "Disbursement.status", no mueve un saldo y no llama a
// la pasarela. El estado FINANCIERO y el de COMUNICACION son dos ejes y esta
// tabla vive entera en el segundo.
const NOTICE_SQL = `
CREATE TABLE IF NOT EXISTS "DisbursementNotice" (
    id               TEXT PRIMARY KEY,
    "clubId"         TEXT NOT NULL,
    -- El traslado que se concilia, cuando la conciliacion es DE UN LOTE.
    --
    -- v4.1015 — NULLABLE. En v4.1014 era NOT NULL y esa columna era, ella
    -- sola, el bloqueo del modulo: un aporte girado de a uno no tiene lote, y
    -- sin lote no se podia escribir la fila, asi que no se podia conciliar.
    -- NULL significa "conciliacion consolidada": su alcance vive en
    -- "paymentIds" y en "batchIds".
    "batchId"        TEXT,
    -- El AMBITO: traslado (un lote completo) o seleccion (aportes elegidos,
    -- de uno o varios movimientos). Ver reconciliationSpec.js.
    scope            TEXT NOT NULL DEFAULT 'traslado',
    -- El alcance REAL del documento, guardado con el envio.
    --
    -- No se deriva al leer y no puede: los desembolsos de un aporte cambian
    -- —se reversan, se completan— y el historial tiene que poder decir QUE
    -- aportes y QUE movimientos afirmo aquel documento el dia que salio. Es la
    -- misma razon por la que "count" y "netAmount" se congelan aca.
    "paymentIds"      JSONB,
    "disbursementIds" JSONB,
    "batchIds"        JSONB,
    "campaignId"     TEXT,
    beneficiary      TEXT,
    currency         TEXT,
    -- Cuantos aportes y cuanto cubria el documento EN EL MOMENTO DE ENVIARLO.
    -- Se guardan porque un reverso posterior cambia el lote y el historial
    -- tiene que poder decir que se afirmo aquel dia.
    "count"          INTEGER NOT NULL DEFAULT 0,
    "netAmount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- A quien salio y con que resultado, por canal y por destinatario.
    emails           JSONB,
    phones           JSONB,
    results          JSONB,
    state            TEXT,
    error            TEXT,
    note             TEXT,
    -- El documento que se genero y viajo adjunto. La CLAVE de S3, nunca una
    -- URL publica: es un documento financiero con nombres y cifras.
    "documentKey"    TEXT,
    "documentName"   TEXT,
    "documentBytes"  INTEGER,
    "documentError"  TEXT,
    -- Quien lo pidio. Un reenvio sin autor no rinde cuentas, y el pedido lo
    -- exige por nombre: "Por: Daniel Yazo".
    "sentBy"         TEXT,
    "sentByName"     TEXT,
    "sentAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- La OPERACION del navegador, para que un doble clic no mande dos veces la
    -- misma conciliacion al mismo presidente. Vacia para un cliente que no la
    -- manda, y por eso el indice es PARCIAL.
    "operationKey"   TEXT NOT NULL DEFAULT '',
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── LO QUE SE AGREGA A UNA TABLA QUE YA EXISTE (v4.1015) ────────────
--
-- ⚠️ ENUMERADAS ACA O NO CORREN NUNCA. "CREATE TABLE IF NOT EXISTS" no amplia
-- nada, y la base de produccion ya tiene "DisbursementNotice" desde v4.1014:
-- sin estos ALTER el INSERT fallaria con "column does not exist" en silencio,
-- porque este modulo degrada. Es la trampa de v4.908, que este proyecto ya
-- pago varias veces.
ALTER TABLE "DisbursementNotice" ALTER COLUMN "batchId" DROP NOT NULL;
ALTER TABLE "DisbursementNotice" ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'traslado';
ALTER TABLE "DisbursementNotice" ADD COLUMN IF NOT EXISTS "paymentIds" JSONB;
ALTER TABLE "DisbursementNotice" ADD COLUMN IF NOT EXISTS "disbursementIds" JSONB;
ALTER TABLE "DisbursementNotice" ADD COLUMN IF NOT EXISTS "batchIds" JSONB;

CREATE INDEX IF NOT EXISTS "DisbursementNotice_batch_idx"
    ON "DisbursementNotice"("batchId", "sentAt" DESC);

CREATE INDEX IF NOT EXISTS "DisbursementNotice_club_idx"
    ON "DisbursementNotice"("clubId", "sentAt" DESC);

-- Por ser PARCIAL, el ON CONFLICT repite el predicado o la sentencia falla
-- entera (v4.648).
CREATE UNIQUE INDEX IF NOT EXISTS "DisbursementNotice_operation_key"
    ON "DisbursementNotice"("clubId", "operationKey")
    WHERE "operationKey" <> '';
`;

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

-- v4.888 — VARIOS destinatarios y VARIOS canales.
--
-- Las tres columnas son ADITIVAS y "notifyEmail" se conserva: las filas
-- escritas antes tienen su unica direccion ahi, y borrarla las dejaria sin
-- saber a quien se le aviso. Es la regla aditiva del proyecto.
--
-- JSONB y no una tabla aparte porque NADIE consulta por destinatario: se leen
-- siempre con su desembolso. Una tabla puente daria un JOIN por ficha para no
-- ganar ninguna consulta — el mismo criterio por el que las etiquetas de los
-- grupos de distribucion son un array y no una tabla con su puente.
ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "notifyEmails" JSONB;
ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "notifyPhones" JSONB;

-- El resultado POR CANAL Y POR DESTINATARIO. Con un solo estado, un aviso que
-- llego a dos de tres direcciones se veria como enviado y nadie sabria cual
-- fallo. "notifyState" se conserva como el resumen de una linea que la ficha
-- ya pinta.
ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "notifyResults" JSONB;

-- v4.998 — VARIOS comprobantes (ver la nota de "DisbursementBatch").
ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "receiptFiles" JSONB;
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
                await db.query(ALTERS + BATCH_SQL + NOTICE_SQL);
                return { ok: true, created: false };
            }

            await db.query(SQL + BATCH_SQL + NOTICE_SQL);
            console.log('[WALLET] Tablas del ciclo de vida creadas: PaymentLifecycleEvent, Disbursement, DisbursementBatch, DisbursementNotice');
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
