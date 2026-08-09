// ════════════════════════════════════════════════════════════════════
// La huella de lo traído del ecosistema — v4.749
//
// POR QUÉ UNA TABLA Y NO UNA COLUMNA
// ----------------------------------
// Los eventos guardan su procedencia en `CalendarEvent.metadata.source`, que ya
// era una columna `Json`. `Project` NO tiene ninguna columna así, y añadirle una
// es exactamente el riesgo de despliegue que este proyecto ya documentó con
// `logo_intl` (v4.699):
//
//   - `Project` se consulta con PRISMA en media plataforma —el listado del
//     panel, el cerebro, los reportes— y con `findMany` SIN `select`, así que
//     Prisma pide TODAS las columnas que declara el esquema.
//   - El build NO ejecuta `prisma db push` a propósito desde v4.622.
//
// Es decir: una columna declarada en `schema.prisma` que todavía no exista en
// la base haría fallar el listado de proyectos de TODOS los sitios desde el
// primer despliegue hasta que alguien corriera `npm run db:push` a mano.
//
// Una tabla creada en tiempo de ejecución no tiene ese problema: si no está,
// se crea; y mientras no esté, lo único que pasa es que nada figura como
// traído (ver `ecosystemClones.js`, que degrada en vez de reventar).
//
// Queda protegida por `scripts/db-push-guard.mjs`, como las demás tablas que la
// aplicación crea sola.
// ════════════════════════════════════════════════════════════════════

import db from './db.js';

let ready = false;

export async function ensureEcosystemCloneSchema() {
    if (ready) return;

    // Comprobación previa antes de gastar viajes en cada arranque en frío,
    // como manda la sección de rendimiento de CLAUDE.md (v4.659).
    const exists = await db.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'EcosystemClone'
          LIMIT 1`,
    );
    if (exists.rows.length) { ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "EcosystemClone" (
            id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "ownerClubId"  text NOT NULL,
            kind           text NOT NULL,
            "localId"      text NOT NULL,
            "sourceId"     text NOT NULL,
            "sourceClubId" text NOT NULL,
            "sourceName"   text,
            "sourceUrl"    text,
            "clonedAt"     timestamptz NOT NULL DEFAULT NOW(),
            "refreshedAt"  timestamptz
        )
    `);

    // Un original se trae UNA vez a cada sitio.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "EcosystemClone_owner_source_key"
            ON "EcosystemClone" ("ownerClubId", kind, "sourceId")
    `);
    // Y cada copia tiene UNA sola procedencia.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "EcosystemClone_local_key"
            ON "EcosystemClone" (kind, "localId")
    `);
    await db.query(`
        CREATE INDEX IF NOT EXISTS "EcosystemClone_owner_idx"
            ON "EcosystemClone" ("ownerClubId", kind)
    `);

    ready = true;
}

export default ensureEcosystemCloneSchema;
