// Las tablas del libro mayor, creadas en tiempo de ejecución.
//
// v4.847 — Fuera de Prisma, como manda la sección de base de datos de este
// proyecto, y agregadas a la lista de `scripts/db-push-guard.mjs`: si algún día
// alguien corre `npm run db:push`, el guardián las nombra en vez de borrarlas.
//
// Por qué fuera de Prisma y no como modelos: el libro se estrena en sombra
// sobre una base con dinero real. Un modelo declarado en `schema.prisma` que
// todavía no exista en la base deja en 500 toda consulta que lo toque hasta que
// alguien sincronice a mano —es la regla de `logo_intl` (v4.699)— y acá caería
// sobre el cobro. Creadas en runtime, existen cuando existen y nada las espera.
//
// TRES TABLAS Y NINGUNA MÁS:
//
//   `LedgerAccount`      qué cuentas hay, por club y moneda.
//   `LedgerTransaction`  el hecho: un aporte, una liberación, un retiro.
//   `LedgerLine`         las líneas, que suman cero por moneda.
//
// ⚠️ NO hay tabla de SALDOS, y es a propósito. Un saldo materializado es una
// segunda verdad sobre lo mismo, y las segundas verdades se contradicen en
// silencio en cuanto alguien escriba una línea sin actualizarla — es lo que
// este archivo lleva media plataforma evitando (`publicKeyOf`, `hasBackdrop`).
// El saldo es `SUM("minor")` sobre las líneas, con su índice. El día que esa
// consulta duela se materializa a sabiendas, con su recálculo; hoy no duele.
import db from './db.js';

let ensured = null;

const SQL = `
CREATE TABLE IF NOT EXISTS "LedgerAccount" (
    id          TEXT PRIMARY KEY,
    "clubId"    TEXT NOT NULL,
    kind        TEXT NOT NULL,
    currency    TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una cuenta por club, tipo y moneda. Es lo que hace que "disponible en pesos"
-- y "disponible en dólares" sean dos cuentas y no una con dos importes dentro.
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerAccount_club_kind_currency_key"
    ON "LedgerAccount"("clubId", kind, currency);

CREATE TABLE IF NOT EXISTS "LedgerTransaction" (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    "clubId"     TEXT NOT NULL,
    currency     TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef"  TEXT NOT NULL,
    "reverses"   TEXT,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "postedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta         JSONB
);

-- LA IDEMPOTENCIA DEL LIBRO. Un hecho se asienta UNA vez: si Stripe reentrega
-- el mismo evento, el segundo intento choca acá y no duplica el dinero. Es la
-- misma protección que el índice único de Payment, y acá es la única:
-- no hay lectura previa que valga contra dos entregas concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerTransaction_source_key"
    ON "LedgerTransaction"("sourceType", "sourceRef");

CREATE INDEX IF NOT EXISTS "LedgerTransaction_club_idx"
    ON "LedgerTransaction"("clubId", "occurredAt" DESC);

CREATE TABLE IF NOT EXISTS "LedgerLine" (
    id              TEXT PRIMARY KEY,
    "transactionId" TEXT NOT NULL REFERENCES "LedgerTransaction"(id) ON DELETE CASCADE,
    "accountId"     TEXT NOT NULL REFERENCES "LedgerAccount"(id),
    "clubId"        TEXT NOT NULL,
    account         TEXT NOT NULL,
    currency        TEXT NOT NULL,
    -- BIGINT y en unidad mínima. Ni un decimal entra al libro: ver la regla 1
    -- de ledgerSpec.js, que está medida y no es una preferencia.
    minor           BIGINT NOT NULL,
    -- 'real' o 'estimado'. Separa lo que dijo el proveedor de lo que calculamos
    -- nosotros cuando no contestó. Presentarlas igual es lo que hace que un
    -- libro deje de servir para cuadrar.
    basis           TEXT NOT NULL DEFAULT 'real',
    -- La procedencia de un importe convertido: cuánto era, en qué moneda, con
    -- qué tasa, de qué fuente y de qué día.
    meta            JSONB,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- El índice del que sale todo saldo. Lleva la moneda porque NINGUNA consulta
-- del libro suma sin agrupar por ella.
CREATE INDEX IF NOT EXISTS "LedgerLine_saldo_idx"
    ON "LedgerLine"("clubId", account, currency);

CREATE INDEX IF NOT EXISTS "LedgerLine_transaction_idx"
    ON "LedgerLine"("transactionId");
`;

/**
 * Crea las tablas si faltan. NUNCA lanza.
 *
 * Un fallo acá no puede tumbar un cobro: el libro está en sombra y nadie
 * depende de él. Se avisa, se deja `ensured` en null para reintentar en el
 * próximo arranque en frío, y el aporte se registra como siempre.
 */
export const ensureLedgerSchema = async () => {
    if (ensured) return ensured;
    ensured = (async () => {
        try {
            // Una consulta al catálogo por arranque en frío en vez de tres
            // CREATE idempotentes: es la lección de rendimiento de v4.659.
            const { rows } = await db.query(
                `SELECT to_regclass('public."LedgerLine"') IS NOT NULL AS ok`
            );
            if (rows[0]?.ok) return { state: 'present' };

            await db.query(SQL);
            console.log('[LEDGER] Tablas del libro mayor creadas — se empieza a asentar en sombra');
            return { state: 'created' };
        } catch (e) {
            console.error('[LEDGER] ensureLedgerSchema falló (no se asienta, el cobro sigue):', e?.message);
            ensured = null;
            return { state: 'error', error: e?.message };
        }
    })();
    return ensured;
};

export default ensureLedgerSchema;
