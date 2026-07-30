// ════════════════════════════════════════════════════════════════════
// Esquema del módulo de inscripciones a eventos — v4.648.0
//
// Las tablas se crean en tiempo de ejecución, igual que `BannerTemplate`,
// `OutroProject` y las `ProjectFair*`. Quedan FUERA de Prisma a propósito: el
// `build` no corre `prisma db push` (ver CLAUDE.md, incidente del 2026-07-13) y
// el guardián de `npm run db:push` las protege al comparar la base contra el
// schema.
//
// NINGUNA sentencia de este archivo es destructiva. Todo es
// `CREATE ... IF NOT EXISTS` o `ADD COLUMN IF NOT EXISTS`: correrlo sobre una
// base que ya tiene datos no borra ni reescribe nada. `EventRegistration` ya
// existía desde v4.606 con inscripciones reales, así que se AMPLÍA con
// columnas nuevas en vez de recrearse.
//
// Todo cuelga de `eventId`: cada edición de la feria tiene sus categorías, sus
// inscripciones, sus acompañantes, sus pagos y sus comunicaciones, y no se
// mezclan entre ediciones.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

/** Añade una columna sólo si falta. Postgres 9.6+ soporta IF NOT EXISTS aquí. */
const addColumn = (table, column, definition) =>
    db.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${definition};`)
        .catch(err => console.error(`[eventRegistrationSchema] ${table}.${column}:`, err.message));

const index = (name, sql) =>
    db.query(`CREATE INDEX IF NOT EXISTS "${name}" ${sql};`).catch(() => { });

// ── Comprobación previa (v4.659) ─────────────────────────────────────
//
// Todo lo de abajo es idempotente, pero no es GRATIS: son 62 sentencias que se
// mandan una por una. En la máquina de desarrollo eso son ~400 ms; contra una
// base gestionada, con 15-40 ms de ida y vuelta por sentencia, es entre uno y
// dos segundos y medio **en cada arranque en frío de la función**, antes de
// responder nada. Se pagaba en la primera visita después de un rato sin
// tráfico, que es justo cuando el usuario nota que el sitio "se queda
// pensando".
//
// Con dos consultas al catálogo se sabe si ya está todo aplicado, que es el
// caso normal en producción. Si falta cualquier cosa, se ejecuta el bloque
// completo como siempre.
//
// La lista de abajo NO es un número de versión que haya que acordarse de
// subir: enumera los objetos reales que crea este archivo. Al agregar una
// tabla o una columna nueva, agregarla también aquí — si se olvida, la
// comprobación la da por presente y el DDL no corre.

const OWNED_TABLES = [
    'EventEdition', 'EventRegistration', 'EventRegistrationCategory',
    'EventRegistrationCompanion', 'EventRegistrationPayment',
    'EventRegistrationHistory', 'EventRegistrationMessage',
    'EventAttendeeAccount', 'EventAttendeeLogin',
];

// La última columna añadida a `EventRegistration` en cada versión. Basta con
// comprobar las que se agregaron después de la creación de la tabla.
const OWNED_REGISTRATION_COLUMNS = [
    'registrationCode', 'accessToken', 'categoryId', 'categoryKey', 'audience',
    'answers', 'pricing', 'tags', 'companionsCount', 'submittedAt', 'accountId',
];

/** ¿Está ya todo aplicado? Dos consultas al catálogo, sin tocar el esquema. */
const alreadyApplied = async () => {
    try {
        const tables = await db.query(
            `SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = ANY($1)`, [OWNED_TABLES]);
        if (tables.rows.length !== OWNED_TABLES.length) return false;

        const columns = await db.query(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'EventRegistration'
                AND column_name = ANY($1)`, [OWNED_REGISTRATION_COLUMNS]);
        return columns.rows.length === OWNED_REGISTRATION_COLUMNS.length;
    } catch (error) {
        // Ante la duda, se ejecuta el DDL: es idempotente y no destructivo.
        console.warn('[eventRegistrationSchema] no pude comprobar el catálogo:', error?.message);
        return false;
    }
};

export const ensureEventRegistrationSchema = async () => {
    if (_ready) return;

    if (await alreadyApplied()) {
        _ready = true;
        return;
    }

    // ── Edición del evento ───────────────────────────────────────────
    // Una fila por `CalendarEvent` que se comporte como edición de la feria.
    // Guarda lo que distingue a una versión de otra: número, sede, prefijo de
    // los códigos de inscripción y la tasa de cambio vigente.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventEdition" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "eventId" TEXT NOT NULL UNIQUE,
            "clubId" TEXT,
            "editionNumber" INTEGER,
            "editionLabel" VARCHAR(160),
            venue VARCHAR(240),
            city VARCHAR(160),
            region VARCHAR(160),
            country VARCHAR(160),
            timezone VARCHAR(80) DEFAULT 'America/Bogota',
            "codePrefix" VARCHAR(20),
            "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
            "opensAt" DATE,
            "closesAt" DATE,
            fx JSONB NOT NULL DEFAULT '{}',
            settings JSONB NOT NULL DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    // ── Categorías de registro ───────────────────────────────────────
    // Rotario Internacional / Rotario Nacional / CADRES nacen de la plantilla
    // de `eventRegistrationSpec.js`, pero desde que se siembran las manda el
    // administrador. `(eventId, key)` es único: la misma clave puede repetirse
    // en otra edición sin chocar.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventRegistrationCategory" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "eventId" TEXT NOT NULL,
            key VARCHAR(60) NOT NULL,
            name VARCHAR(160) NOT NULL,
            audience VARCHAR(30) NOT NULL DEFAULT 'general',
            description TEXT,
            currency VARCHAR(3) NOT NULL DEFAULT 'USD',
            "settlementCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
            price NUMERIC(14,2) NOT NULL DEFAULT 0,
            capacity INTEGER,
            "opensAt" DATE,
            "closesAt" DATE,
            "requireClub" BOOLEAN NOT NULL DEFAULT true,
            companions JSONB NOT NULL DEFAULT '{}',
            benefits JSONB NOT NULL DEFAULT '[]',
            "extraFields" JSONB NOT NULL DEFAULT '[]',
            "extraFieldsLabel" VARCHAR(80),
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT "EventRegistrationCategory_event_key" UNIQUE ("eventId", key)
        );
    `);
    await index('EventRegistrationCategory_event_idx', 'ON "EventRegistrationCategory" ("eventId")');

    // ── Inscripciones ────────────────────────────────────────────────
    // La tabla existe desde v4.606 con datos de producción. Se amplía; jamás
    // se recrea. Las columnas viejas (ticketKey/ticketLabel/quantity) se
    // siguen alimentando para que la pestaña y el CSV anteriores no se rompan.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventRegistration" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "publicRef" VARCHAR(20),
            "eventId" TEXT NOT NULL,
            "clubId" TEXT,
            "firstName" VARCHAR(120),
            "lastName" VARCHAR(120),
            email VARCHAR(200) NOT NULL,
            phone VARCHAR(60),
            country VARCHAR(120),
            "clubName" VARCHAR(200),
            "ticketKey" VARCHAR(80),
            "ticketLabel" VARCHAR(200),
            quantity INTEGER NOT NULL DEFAULT 1,
            "unitAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
            "totalAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency VARCHAR(10) NOT NULL DEFAULT 'USD',
            status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
            notes TEXT,
            "stripeSessionId" TEXT,
            "stripePaymentIntentId" TEXT,
            "paidAt" TIMESTAMPTZ,
            metadata JSONB DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    const columns = [
        // Identidad de la inscripción
        ['registrationCode', 'VARCHAR(24)'],       // se asigna al confirmar
        ['accessToken', 'VARCHAR(48)'],            // permite retomar el borrador sin sesión
        ['categoryId', 'TEXT'],
        ['categoryKey', 'VARCHAR(60)'],
        ['categoryLabel', 'VARCHAR(160)'],
        ['audience', "VARCHAR(30) DEFAULT 'general'"],
        // Respuestas del formulario dinámico + campos promovidos para filtrar
        ['answers', "JSONB NOT NULL DEFAULT '{}'"],
        ['city', 'VARCHAR(120)'],
        ['district', 'VARCHAR(40)'],
        ['documentNumber', 'VARCHAR(60)'],
        ['rotaryRole', 'VARCHAR(60)'],
        ['language', 'VARCHAR(20)'],
        ['dietary', 'VARCHAR(40)'],
        // Dinero: se congela la foto del cobro al crear la inscripción
        ['baseCurrency', "VARCHAR(3) DEFAULT 'USD'"],
        ['baseAmount', 'NUMERIC(14,2) DEFAULT 0'],
        ['chargeCurrency', "VARCHAR(3) DEFAULT 'USD'"],
        ['chargeAmount', 'NUMERIC(14,2) DEFAULT 0'],
        ['fxRate', 'NUMERIC(24,12)'],
        ['pricing', "JSONB NOT NULL DEFAULT '{}'"],
        ['companionsCount', 'INTEGER NOT NULL DEFAULT 0'],
        ['companionsAmount', 'NUMERIC(14,2) DEFAULT 0'],
        // Trazabilidad de Stripe
        ['stripeChargeId', 'TEXT'],
        ['stripeCustomerId', 'TEXT'],
        ['paymentMethod', 'VARCHAR(60)'],
        ['receiptUrl', 'TEXT'],
        ['refundedAt', 'TIMESTAMPTZ'],
        ['refundedAmount', 'NUMERIC(14,2)'],
        // Segmentación, acreditación y trabajo interno
        ['tags', "JSONB NOT NULL DEFAULT '[]'"],
        ['internalNotes', 'TEXT'],
        ['checkedInAt', 'TIMESTAMPTZ'],
        ['checkedInBy', 'TEXT'],
        ['submittedAt', 'TIMESTAMPTZ'],
        ['lastActivityAt', 'TIMESTAMPTZ'],
        // v4.655 — Cuenta del asistente. Es lo que ata la inscripción a quien
        // la consulta: con `accountId` + `eventId` + `categoryKey` + `id`, una
        // sola fila lleva el vínculo completo que pide el panel del asistente.
        ['accountId', 'TEXT'],
    ];
    for (const [column, definition] of columns) {
        await addColumn('EventRegistration', column, definition);
    }

    await index('EventRegistration_event_idx', 'ON "EventRegistration" ("eventId")');
    await index('EventRegistration_status_idx', 'ON "EventRegistration" (status)');
    await index('EventRegistration_session_idx', 'ON "EventRegistration" ("stripeSessionId")');
    await index('EventRegistration_email_idx', 'ON "EventRegistration" (email)');
    await index('EventRegistration_category_idx', 'ON "EventRegistration" ("eventId", "categoryKey")');
    await index('EventRegistration_intent_idx', 'ON "EventRegistration" ("stripePaymentIntentId")');
    // El panel del asistente filtra SIEMPRE por esta columna: es el índice que
    // sostiene el aislamiento de datos, no una optimización cualquiera.
    await index('EventRegistration_account_idx', 'ON "EventRegistration" ("accountId")');
    // El código de inscripción se dicta por teléfono en la acreditación: tiene
    // que ser único de verdad, no sólo por convención.
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "EventRegistration_code_uniq"
                    ON "EventRegistration" ("registrationCode") WHERE "registrationCode" IS NOT NULL;`)
        .catch(() => { });

    // ── Acompañantes ─────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventRegistrationCompanion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "registrationId" TEXT NOT NULL,
            "eventId" TEXT NOT NULL,
            "firstName" VARCHAR(120),
            "lastName" VARCHAR(120),
            "documentNumber" VARCHAR(60),
            relationship VARCHAR(80),
            email VARCHAR(200),
            phone VARCHAR(60),
            dietary VARCHAR(40),
            notes TEXT,
            "categoryKey" VARCHAR(60),
            amount NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency VARCHAR(3) NOT NULL DEFAULT 'USD',
            "badgeCode" VARCHAR(24),
            "checkedInAt" TIMESTAMPTZ,
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await index('EventRegistrationCompanion_reg_idx', 'ON "EventRegistrationCompanion" ("registrationId")');
    await index('EventRegistrationCompanion_event_idx', 'ON "EventRegistrationCompanion" ("eventId")');

    // ── Pagos ────────────────────────────────────────────────────────
    // Un renglón por intento de cobro, con todo lo que Stripe devuelve. Es lo
    // que permite responder "cuánto entró, en qué moneda y con qué tasa".
    // `stripeEventId` único hace el webhook idempotente: si Stripe reenvía el
    // mismo evento, el INSERT choca y no se procesa dos veces.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventRegistrationPayment" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "registrationId" TEXT NOT NULL,
            "eventId" TEXT NOT NULL,
            provider VARCHAR(30) NOT NULL DEFAULT 'stripe',
            "stripeEventId" TEXT,
            "checkoutSessionId" TEXT,
            "paymentIntentId" TEXT,
            "chargeId" TEXT,
            "customerId" TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            "baseCurrency" VARCHAR(3),
            "baseAmount" NUMERIC(14,2),
            currency VARCHAR(3) NOT NULL DEFAULT 'USD',
            amount NUMERIC(14,2) NOT NULL DEFAULT 0,
            "fxRate" NUMERIC(24,12),
            "paymentMethod" VARCHAR(60),
            "receiptUrl" TEXT,
            "refundedAmount" NUMERIC(14,2),
            "failureMessage" TEXT,
            payload JSONB NOT NULL DEFAULT '{}',
            "occurredAt" TIMESTAMPTZ DEFAULT NOW(),
            "createdAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await index('EventRegistrationPayment_reg_idx', 'ON "EventRegistrationPayment" ("registrationId")');
    await index('EventRegistrationPayment_event_idx', 'ON "EventRegistrationPayment" ("eventId")');
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "EventRegistrationPayment_event_uniq"
                    ON "EventRegistrationPayment" ("stripeEventId") WHERE "stripeEventId" IS NOT NULL;`)
        .catch(() => { });

    // ── Historial ────────────────────────────────────────────────────
    // Cada cambio de estado, etiqueta o nota queda con quién, cuándo y por qué.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventRegistrationHistory" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "registrationId" TEXT NOT NULL,
            "eventId" TEXT NOT NULL,
            type VARCHAR(40) NOT NULL,
            "fromStatus" VARCHAR(30),
            "toStatus" VARCHAR(30),
            comment TEXT,
            "actorId" TEXT,
            "actorName" VARCHAR(160),
            payload JSONB NOT NULL DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await index('EventRegistrationHistory_reg_idx', 'ON "EventRegistrationHistory" ("registrationId", "createdAt")');

    // ── Comunicaciones ───────────────────────────────────────────────
    // Correo y WhatsApp enviados a la inscripción. Deja la ficha con el
    // registro de qué se le mandó y cuándo.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventRegistrationMessage" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "registrationId" TEXT NOT NULL,
            "eventId" TEXT NOT NULL,
            channel VARCHAR(20) NOT NULL DEFAULT 'email',
            template VARCHAR(60),
            recipient VARCHAR(240),
            subject VARCHAR(300),
            body TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'sent',
            error TEXT,
            "actorId" TEXT,
            "createdAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await index('EventRegistrationMessage_reg_idx', 'ON "EventRegistrationMessage" ("registrationId", "createdAt")');

    // ── Cuenta del asistente al evento ───────────────────────────────
    //
    // v4.655 — Identidad propia del inscrito, con la misma arquitectura que
    // `ProjectFairAccount` (el Gestor de Proyectos) y por el mismo motivo: NO
    // vive en la tabla `User` de la plataforma, así que un asistente jamás
    // alcanza `/admin/*` ni aunque escriba la URL. Su token lleva la audiencia
    // `event-attendee-portal`, que ni `authMiddleware` ni `portalAuth` aceptan.
    //
    // La cuenta es UNA por correo, no una por inscripción: quien vuelva en la
    // XIII edición entra con la misma clave y ve su historial separado por
    // evento. Por eso la unicidad es sobre el correo y el vínculo con cada
    // inscripción vive en `EventRegistration.accountId`.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventAttendeeAccount" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            email VARCHAR(200) NOT NULL,
            "passwordHash" TEXT NOT NULL,
            "firstName" VARCHAR(120),
            "lastName" VARCHAR(120),
            phone VARCHAR(60),
            role VARCHAR(40) NOT NULL DEFAULT 'event_attendee',
            "emailVerifiedAt" TIMESTAMPTZ,
            "verificationToken" TEXT,
            "lastLoginAt" TIMESTAMPTZ,
            "resetToken" TEXT,
            "resetExpiry" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "EventAttendeeAccount_email_key"
                    ON "EventAttendeeAccount" (lower(email));`).catch(() => { });

    // Auditoría de ingresos. Guarda también los intentos fallidos: sin ellos no
    // se puede distinguir "la persona olvidó la clave" de "alguien está
    // probando". El correo se guarda aparte del id porque un intento fallido
    // puede no corresponder a ninguna cuenta.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventAttendeeLogin" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "accountId" TEXT,
            email VARCHAR(200),
            outcome VARCHAR(30) NOT NULL,
            ip VARCHAR(60),
            "userAgent" VARCHAR(300),
            detail TEXT,
            "createdAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await index('EventAttendeeLogin_account_idx', 'ON "EventAttendeeLogin" ("accountId", "createdAt")');
    await index('EventAttendeeLogin_email_idx', 'ON "EventAttendeeLogin" (lower(email), "createdAt")');

    _ready = true;
};

export default ensureEventRegistrationSchema;
