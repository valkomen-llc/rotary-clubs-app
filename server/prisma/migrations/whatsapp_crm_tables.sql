-- ============================================================
-- MIGRACIÓN: Módulo CRM WhatsApp — Meta Cloud API
-- Fecha: 2026-03-18
-- ============================================================

-- 1. Configuración de la cuenta WhatsApp Business por club
CREATE TABLE IF NOT EXISTS "WhatsAppConfig" (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clubId"         UUID NOT NULL UNIQUE REFERENCES "Club"(id) ON DELETE CASCADE,
    "phoneNumberId"  VARCHAR(100) NOT NULL,
    "wabaId"         VARCHAR(100) NOT NULL,
    "accessToken"    TEXT NOT NULL,
    "verifyToken"    VARCHAR(255) NOT NULL,
    "appId"          VARCHAR(100),
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    "lastVerifiedAt" TIMESTAMPTZ,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Contactos del CRM WhatsApp
CREATE TABLE IF NOT EXISTS "WhatsAppContact" (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clubId"        UUID NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(30) NOT NULL,
    email           VARCHAR(255),
    tags            TEXT[] DEFAULT '{}',
    source          VARCHAR(50) NOT NULL DEFAULT 'manual',
    status          VARCHAR(30) NOT NULL DEFAULT 'active',
    metadata        JSONB DEFAULT '{}',
    "totalSent"     INT NOT NULL DEFAULT 0,
    "totalDelivered" INT NOT NULL DEFAULT 0,
    "totalRead"     INT NOT NULL DEFAULT 0,
    "totalFailed"   INT NOT NULL DEFAULT 0,
    "optedOutAt"    TIMESTAMPTZ,
    "leadId"        UUID,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("phone", "clubId")
);
CREATE INDEX IF NOT EXISTS idx_wa_contact_club ON "WhatsAppContact" ("clubId");
CREATE INDEX IF NOT EXISTS idx_wa_contact_status ON "WhatsAppContact" (status);
CREATE INDEX IF NOT EXISTS idx_wa_contact_phone ON "WhatsAppContact" (phone);

-- 3. Listas / Segmentos de contactos
CREATE TABLE IF NOT EXISTS "WhatsAppContactList" (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clubId"    UUID NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    color       VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_list_club ON "WhatsAppContactList" ("clubId");

-- 4. Membresía N:M entre Contactos y Listas
CREATE TABLE IF NOT EXISTS "ContactListMember" (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "listId"    UUID NOT NULL REFERENCES "WhatsAppContactList"(id) ON DELETE CASCADE,
    "contactId" UUID NOT NULL REFERENCES "WhatsAppContact"(id) ON DELETE CASCADE,
    "addedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("listId", "contactId")
);
CREATE INDEX IF NOT EXISTS idx_clmember_list ON "ContactListMember" ("listId");
CREATE INDEX IF NOT EXISTS idx_clmember_contact ON "ContactListMember" ("contactId");

-- 5. Templates HSM sincronizados con Meta
CREATE TABLE IF NOT EXISTS "WhatsAppTemplate" (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clubId"         UUID NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
    name             VARCHAR(255) NOT NULL,   -- snake_case para Meta
    "displayName"    VARCHAR(255) NOT NULL,
    category         VARCHAR(50) NOT NULL DEFAULT 'MARKETING',
    language         VARCHAR(10) NOT NULL DEFAULT 'es',
    status           VARCHAR(30) NOT NULL DEFAULT 'pending',
    "headerType"     VARCHAR(20),             -- TEXT, IMAGE, VIDEO, DOCUMENT
    "headerContent"  TEXT,
    "bodyText"       TEXT NOT NULL,
    "footerText"     VARCHAR(255),
    buttons          JSONB DEFAULT '[]',
    "metaTemplateId" VARCHAR(100),
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_template_club ON "WhatsAppTemplate" ("clubId");
CREATE INDEX IF NOT EXISTS idx_wa_template_status ON "WhatsAppTemplate" (status);

-- 6. Campañas de Marketing WhatsApp
CREATE TABLE IF NOT EXISTS "WhatsAppCampaign" (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clubId"        UUID NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    "listId"        UUID REFERENCES "WhatsAppContactList"(id),
    "templateId"    UUID REFERENCES "WhatsAppTemplate"(id),
    "templateVars"  JSONB DEFAULT '{}',
    status          VARCHAR(30) NOT NULL DEFAULT 'draft',
    "scheduledAt"   TIMESTAMPTZ,
    "sentAt"        TIMESTAMPTZ,
    "totalContacts" INT NOT NULL DEFAULT 0,
    sent            INT NOT NULL DEFAULT 0,
    delivered       INT NOT NULL DEFAULT 0,
    "read"          INT NOT NULL DEFAULT 0,
    failed          INT NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_campaign_club   ON "WhatsAppCampaign" ("clubId");
CREATE INDEX IF NOT EXISTS idx_wa_campaign_status ON "WhatsAppCampaign" (status);

-- 7. Log individual de cada mensaje enviado
CREATE TABLE IF NOT EXISTS "WhatsAppMessageLog" (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clubId"        UUID NOT NULL,
    "campaignId"    UUID REFERENCES "WhatsAppCampaign"(id) ON DELETE SET NULL,
    "contactId"     UUID REFERENCES "WhatsAppContact"(id) ON DELETE SET NULL,
    phone           VARCHAR(30) NOT NULL,
    "messageId"     VARCHAR(255),             -- wamid devuelto por Meta
    "templateName"  VARCHAR(255),
    "bodyText"      TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    "errorCode"     VARCHAR(50),
    "errorMessage"  TEXT,
    "sentAt"        TIMESTAMPTZ,
    "deliveredAt"   TIMESTAMPTZ,
    "readAt"        TIMESTAMPTZ,
    "failedAt"      TIMESTAMPTZ,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_msglog_messageid  ON "WhatsAppMessageLog" ("messageId");
CREATE INDEX IF NOT EXISTS idx_wa_msglog_campaign   ON "WhatsAppMessageLog" ("campaignId", status);
CREATE INDEX IF NOT EXISTS idx_wa_msglog_club       ON "WhatsAppMessageLog" ("clubId");
