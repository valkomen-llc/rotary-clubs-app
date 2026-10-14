// Esquema de persistencia para el Embudo de Activación de Clubes en Rotary en Acción.
// Gestiona leads interesados, trazabilidad de origen y campañas, CRM ligero con historial
// y analítica de conversión en tiempo real con aislamiento multi-tenant.
// Runtime idempotente sobre Postgres, sin Prisma.

import db from './db.js';

let _ready = false;

export async function ensureRotaryActivationSchema() {
  if (_ready) return;

  // 1. Tabla de solicitudes e interesados en activación de Club Platform
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryClubActivation" (
    id TEXT PRIMARY KEY,
    "siteId" TEXT,
    "clubName" TEXT NOT NULL,
    "matchedClubId" TEXT,
    district TEXT DEFAULT '',
    city TEXT DEFAULT '',
    "responsibleName" TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    "mainInterest" TEXT DEFAULT 'ecosistema_integral',
    "dataConsent" BOOLEAN DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'nuevo',
    "assignedTo" TEXT,
    notes TEXT DEFAULT '',
    history JSONB DEFAULT '[]'::jsonb,
    "reminderDate" TIMESTAMPTZ,
    "reminderNote" TEXT,
    "isEcosystemActive" BOOLEAN DEFAULT FALSE,
    "activatedAt" TIMESTAMPTZ,
    "activatedBy" TEXT,
    "campaignId" TEXT,
    "campaignName" TEXT,
    channel TEXT DEFAULT 'organico',
    "utmSource" TEXT DEFAULT '',
    "utmMedium" TEXT DEFAULT '',
    "utmCampaign" TEXT DEFAULT '',
    "utmContent" TEXT DEFAULT '',
    "utmTerm" TEXT DEFAULT '',
    "originHost" TEXT DEFAULT '',
    "originClubId" TEXT,
    "visitorId" TEXT,
    "linkedLeadId" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Índices para optimización de consultas facetadas y aislamiento multisitio
  await db.query(`CREATE INDEX IF NOT EXISTS idx_rca_siteId ON "RotaryClubActivation"("siteId")`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_rca_status ON "RotaryClubActivation"(status)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_rca_clubName ON "RotaryClubActivation"("clubName")`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_rca_createdAt ON "RotaryClubActivation"("createdAt" DESC)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_rca_campaignId ON "RotaryClubActivation"("campaignId")`).catch(() => {});

  // 2. Tabla de eventos del embudo (visitas a landing, formularios iniciados, etc.)
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryClubActivationEvent" (
    id TEXT PRIMARY KEY,
    "siteId" TEXT,
    "visitorId" TEXT,
    event TEXT NOT NULL,
    "clubName" TEXT,
    channel TEXT DEFAULT 'organico',
    "campaignId" TEXT,
    "utmSource" TEXT DEFAULT '',
    "utmMedium" TEXT DEFAULT '',
    "utmCampaign" TEXT DEFAULT '',
    "utmContent" TEXT DEFAULT '',
    "originHost" TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  )`);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_rcae_siteId ON "RotaryClubActivationEvent"("siteId")`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_rcae_event ON "RotaryClubActivationEvent"(event)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_rcae_createdAt ON "RotaryClubActivationEvent"("createdAt" DESC)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_rcae_visitorId ON "RotaryClubActivationEvent"("visitorId")`).catch(() => {});

  _ready = true;
}
