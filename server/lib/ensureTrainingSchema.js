// Crea en runtime, de forma perezosa e idempotente, las tablas del módulo
// "Calendario de Capacitaciones y Soporte".
//
// POR QUÉ: tras el incidente del 2026-07-13, el build ya NO ejecuta
// `prisma db push` (regla durable). Por eso las tablas nuevas del schema no se
// crean solas en producción. Mismo patrón que BannerTemplate y las ProjectFair*:
// CREATE TABLE IF NOT EXISTS + ALTER ... ADD COLUMN IF NOT EXISTS (no destructivo).
//
// No se crean claves foráneas a propósito: Prisma resuelve las relaciones por
// las columnas (categoryId, responsibleId, etc.), no necesita el FK en la BD, y
// así evitamos problemas de orden/creación. Se accede vía `db.query` (pg crudo).
import db from './db.js';

let _ready = false;

export async function ensureTrainingSchema() {
  if (_ready) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS "TrainingConfig" (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL DEFAULT 'global',
      timezone TEXT NOT NULL DEFAULT 'America/Bogota',
      "slotDurationMin" INTEGER NOT NULL DEFAULT 45,
      "bufferMin" INTEGER NOT NULL DEFAULT 15,
      "maxPerDay" INTEGER NOT NULL DEFAULT 6,
      "minNoticeHours" INTEGER NOT NULL DEFAULT 12,
      "cancelWindowHours" INTEGER NOT NULL DEFAULT 12,
      "leadDays" INTEGER NOT NULL DEFAULT 30,
      "meetingProvider" TEXT NOT NULL DEFAULT 'manual',
      active BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "TrainingConfig_key_key" ON "TrainingConfig"(key);

    CREATE TABLE IF NOT EXISTS "TrainingCategory" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      emoji TEXT,
      color TEXT NOT NULL DEFAULT '#4f46e5',
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "TrainingResponsible" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      "userId" TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "TrainingAvailabilityBlock" (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'recurring',
      weekday INTEGER,
      date TIMESTAMP(3),
      "startMinute" INTEGER NOT NULL,
      "endMinute" INTEGER NOT NULL,
      "responsibleId" TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "TrainingBlackout" (
      id TEXT PRIMARY KEY,
      "startDate" TIMESTAMP(3) NOT NULL,
      "endDate" TIMESTAMP(3) NOT NULL,
      reason TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "TrainingAppointmentType" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      description TEXT,
      "categoryId" TEXT,
      "durationMin" INTEGER NOT NULL DEFAULT 45,
      modality TEXT NOT NULL DEFAULT 'videollamada',
      prerequisites TEXT,
      price DOUBLE PRECISION,
      currency TEXT NOT NULL DEFAULT 'USD',
      color TEXT NOT NULL DEFAULT '#2563eb',
      icon TEXT,
      "responsibleId" TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE "TrainingAppointmentType" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "TrainingAppointmentType_slug_key" ON "TrainingAppointmentType"(slug) WHERE slug IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "TrainingAppointment" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT,
      "districtId" TEXT,
      "appointmentTypeId" TEXT,
      "responsibleId" TEXT,
      "startAt" TIMESTAMP(3) NOT NULL,
      "endAt" TIMESTAMP(3) NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/Bogota',
      status TEXT NOT NULL DEFAULT 'pending',
      modality TEXT NOT NULL DEFAULT 'videollamada',
      "requesterName" TEXT,
      "requesterEmail" TEXT,
      "requesterPhone" TEXT,
      "organizationName" TEXT,
      participants JSONB DEFAULT '[]',
      reason TEXT,
      "meetingProvider" TEXT NOT NULL DEFAULT 'manual',
      "meetingUrl" TEXT,
      "meetingId" TEXT,
      "meetingPayload" JSONB,
      "internalNotes" TEXT,
      agreements TEXT,
      outcome JSONB DEFAULT '{}',
      "bookedById" TEXT,
      source TEXT NOT NULL DEFAULT 'admin',
      "publicToken" TEXT,
      "confirmationSentAt" TIMESTAMP(3),
      "reminder24SentAt" TIMESTAMP(3),
      "reminder1SentAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "cancelReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE "TrainingAppointment" ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';
    ALTER TABLE "TrainingAppointment" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "TrainingAppointment_publicToken_key" ON "TrainingAppointment"("publicToken") WHERE "publicToken" IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "TrainingMaterial" (
      id TEXT PRIMARY KEY,
      "appointmentId" TEXT NOT NULL,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'document',
      "s3Key" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "TrainingSurvey" (
      id TEXT PRIMARY KEY,
      "appointmentId" TEXT NOT NULL,
      satisfaction INTEGER,
      usefulness INTEGER,
      clarity INTEGER,
      attention INTEGER,
      "needsFollowUp" BOOLEAN NOT NULL DEFAULT false,
      comments TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "TrainingSurvey_appointmentId_key" ON "TrainingSurvey"("appointmentId");

    -- v4.639: enlace provisional de reunión + auditoría de notificaciones.
    ALTER TABLE "TrainingConfig" ADD COLUMN IF NOT EXISTS "provisionalMeetingEnabled" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "TrainingConfig" ADD COLUMN IF NOT EXISTS "provisionalMeetingUrl" TEXT;
    ALTER TABLE "TrainingAppointmentType" ADD COLUMN IF NOT EXISTS "provisionalMeetingUrl" TEXT;
    ALTER TABLE "TrainingResponsible" ADD COLUMN IF NOT EXISTS "provisionalMeetingUrl" TEXT;
    ALTER TABLE "TrainingAppointment" ADD COLUMN IF NOT EXISTS "confirmationError" TEXT;
    ALTER TABLE "TrainingAppointment" ADD COLUMN IF NOT EXISTS "reminder1ScheduledFor" TIMESTAMP(3);
    ALTER TABLE "TrainingAppointment" ADD COLUMN IF NOT EXISTS "reminder1Error" TEXT;
    ALTER TABLE "TrainingAppointment" ADD COLUMN IF NOT EXISTS "reminder1Attempts" INTEGER NOT NULL DEFAULT 0;

    -- v4.644: categoría abierta a todos los sitios (Onboarding) sin exigir
    -- suscripción activa/dominio. Marca de backfill único en la config.
    ALTER TABLE "TrainingCategory" ADD COLUMN IF NOT EXISTS "openToAll" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "TrainingConfig" ADD COLUMN IF NOT EXISTS "onboardingOpenedInit" BOOLEAN NOT NULL DEFAULT false;
  `);
  _ready = true;
  console.log('[ensureTrainingSchema] tablas de Capacitaciones verificadas/creadas');
}

export default ensureTrainingSchema;
